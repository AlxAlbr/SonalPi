import { randomUUID } from 'node:crypto'
import type { ClientWebDAV } from '../webdav/client'
import {
  ErreurLectureMedia,
  lirePlage,
  type InformationMedia,
} from '../webdav/lectureMedia'

export type MotifRelaisMedia =
  | 'plages-non-prises-en-charge'
  | 'fichier-absent'
  | 'droits'
  | 'indisponible'

export type EvenementRelaisMedia =
  | { id: string; jeton: string; chemin: string; motif: MotifRelaisMedia }
  | { id: string; jeton: string; chemin: string; motif: 'version-changee' }

interface LectureOuverte {
  id: string
  jeton: string
  generation: number
  chemin: string
  client: ClientWebDAV
  typeMedia: string
  taille: number | null
  validateur: string | null
  annulation: AbortController
  requeteActive: AbortController | null
}

/** Relaie les plages WebDAV derrière des jetons sans chemin ni identifiants. */
export class RelaisMediaDistant {
  private readonly lectures = new Map<string, LectureOuverte>()

  constructor(private readonly signaler: (evenement: EvenementRelaisMedia) => void) {}

  ouvrir(params: {
    id: string
    generation: number
    chemin: string
    client: ClientWebDAV
    information: InformationMedia
  }): string {
    this.invaliderEntretien(params.id)
    const jeton = randomUUID()
    this.lectures.set(jeton, {
      id: params.id,
      jeton,
      generation: params.generation,
      chemin: params.chemin,
      client: params.client,
      typeMedia: params.information.typeMedia,
      taille: params.information.taille,
      validateur: params.information.validateur,
      annulation: new AbortController(),
      requeteActive: null,
    })
    return `sonal-media://distant/${jeton}`
  }

  invaliderTout(): void {
    for (const lecture of this.lectures.values()) lecture.annulation.abort()
    this.lectures.clear()
  }

  invaliderEntretien(id: string): void {
    for (const [jeton, lecture] of this.lectures) {
      if (lecture.id !== id) continue
      lecture.annulation.abort()
      this.lectures.delete(jeton)
    }
  }

  async servir(
    jeton: string,
    generation: number,
    methode: string,
    range: string | null,
    signal?: AbortSignal,
    autoriser?: (id: string, chemin: string) => boolean,
  ): Promise<Response> {
    const lecture = this.lectures.get(jeton)
    if (!lecture || lecture.generation !== generation) {
      return reponseTexte('Lecture distante expirée.', 404)
    }
    if (autoriser && !autoriser(lecture.id, lecture.chemin)) {
      this.invaliderEntretien(lecture.id)
      return reponseTexte('Lecture distante expirée.', 404)
    }
    if (methode === 'HEAD') return reponseInformation(lecture)
    if (methode !== 'GET') return reponseTexte('Méthode non prise en charge.', 405)

    const plage = analyserRangeNavigateur(range, lecture.taille)
    if (!plage) return reponsePlageInvalide(lecture.taille)
    lecture.requeteActive?.abort()
    const requete = new AbortController()
    lecture.requeteActive = requete
    const signaux = [lecture.annulation.signal, requete.signal]
    if (signal) signaux.push(signal)
    const annulation = AbortSignal.any(signaux)
    const terminer = () => {
      if (lecture.requeteActive === requete) lecture.requeteActive = null
    }

    try {
      const distante = await lirePlage(lecture.client, lecture.chemin, plage, {
        signal: annulation,
        ...(lecture.validateur ? { validateur: lecture.validateur } : {}),
      })
      if (
        (lecture.validateur && distante.version && lecture.validateur !== distante.version) ||
        (lecture.taille !== null && distante.total !== null && lecture.taille !== distante.total)
      ) {
        distante.annuler()
        this.signalerRemplacement(lecture)
        return reponseTexte('Le média a été remplacé.', 409)
      }
      if (!lecture.validateur && distante.version) lecture.validateur = distante.version
      if (lecture.taille === null && distante.total !== null) lecture.taille = distante.total

      const corps = signalerErreurFlux(
        distante.corps,
        (erreur) => {
          if (estAnnulation(erreur)) return
          const motif = motifPublic(erreur)
          this.signalerEchec(lecture, motif)
        },
        terminer,
      )
      return new Response(corps, {
        status: 206,
        headers: {
          'Content-Type': lecture.typeMedia,
          'Content-Length': String(distante.fin - distante.debut + 1),
          'Content-Range': `bytes ${distante.debut}-${distante.fin}/${distante.total ?? '*'}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      })
    } catch (erreur) {
      terminer()
      if (estAnnulation(erreur)) return reponseTexte('Lecture annulée.', 499)
      if (erreur instanceof ErreurLectureMedia && erreur.motif === 'version-changee') {
        this.signalerRemplacement(lecture)
        return reponseTexte('Le média a été remplacé.', 409)
      }
      const motif = motifPublic(erreur)
      this.signalerEchec(lecture, motif)
      return reponseTexte('Lecture distante indisponible.', statutPour(motif))
    }
  }

  private signalerRemplacement(lecture: LectureOuverte): void {
    if (!this.lectures.delete(lecture.jeton)) return
    lecture.annulation.abort()
    this.signaler({
      id: lecture.id,
      jeton: lecture.jeton,
      chemin: lecture.chemin,
      motif: 'version-changee',
    })
  }

  private signalerEchec(lecture: LectureOuverte, motif: MotifRelaisMedia): void {
    if (!this.lectures.delete(lecture.jeton)) return
    lecture.annulation.abort()
    this.signaler({ id: lecture.id, jeton: lecture.jeton, chemin: lecture.chemin, motif })
  }
}

function analyserRangeNavigateur(
  entete: string | null,
  taille: number | null,
): { debut: number; fin?: number } | null {
  if (!entete) return taille === 0 ? null : { debut: 0 }
  const trouve = /^bytes=(\d+)-(\d*)$/.exec(entete.trim())
  if (!trouve) return null
  const debut = Number(trouve[1])
  if (!Number.isSafeInteger(debut) || (taille !== null && debut >= taille)) return null
  if (!trouve[2]) return { debut }
  const fin = Number(trouve[2])
  if (!Number.isSafeInteger(fin) || fin < debut) return null
  return { debut, fin }
}

function reponseInformation(lecture: LectureOuverte): Response {
  const entetes: Record<string, string> = {
    'Content-Type': lecture.typeMedia,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  }
  if (lecture.taille !== null) entetes['Content-Length'] = String(lecture.taille)
  return new Response(null, { status: 200, headers: entetes })
}

function reponsePlageInvalide(taille: number | null): Response {
  const entetes: Record<string, string> = { 'Accept-Ranges': 'bytes' }
  if (taille !== null) entetes['Content-Range'] = `bytes */${taille}`
  return new Response(null, { status: 416, headers: entetes })
}

function reponseTexte(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function motifPublic(erreur: unknown): MotifRelaisMedia {
  if (!(erreur instanceof ErreurLectureMedia)) return 'indisponible'
  if (erreur.motif === 'plage-non-honoree') return 'plages-non-prises-en-charge'
  if (erreur.motif === 'fichier-absent') return 'fichier-absent'
  if (erreur.motif === 'droits') return 'droits'
  return 'indisponible'
}

function statutPour(motif: MotifRelaisMedia): number {
  if (motif === 'fichier-absent') return 404
  if (motif === 'droits') return 403
  if (motif === 'plages-non-prises-en-charge') return 501
  return 503
}

function estAnnulation(erreur: unknown): boolean {
  const nom = (erreur as { name?: unknown } | null)?.name
  const code = (erreur as { code?: unknown } | null)?.code
  return nom === 'AbortError' || code === 'ABORT_ERR'
}

function signalerErreurFlux(
  source: ReadableStream<Uint8Array>,
  signaler: (erreur: unknown) => void,
  terminer: () => void,
): ReadableStream<Uint8Array> {
  const lecteur = source.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controleur) {
      try {
        const { done, value } = await lecteur.read()
        if (done) {
          terminer()
          controleur.close()
        } else controleur.enqueue(value)
      } catch (erreur) {
        terminer()
        signaler(erreur)
        controleur.error(erreur)
      }
    },
    cancel(raison) {
      terminer()
      void lecteur.cancel(raison).catch(() => undefined)
    },
  })
}
