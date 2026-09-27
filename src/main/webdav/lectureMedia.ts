/**
 *  Contrat de lecture d'un média WebDAV.
 *
 *  Le client WebDAV apporte deux primitives — l'information sur un fichier et
 *  la lecture d'une plage. Ce module décide si ce qu'elles rapportent est
 *  acceptable, et rend le corps en flux : un média ne transite jamais en
 *  mémoire et n'est jamais assemblé.
 *
 *  Le contrat est délibérément strict, parce que les serveurs ne le sont pas.
 *  Une réponse qui ne décrit pas exactement la plage demandée, ou dont le
 *  corps ne fait pas la longueur annoncée, est refusée : mieux vaut une
 *  lecture qui s'arrête qu'un fichier assemblé de deux versions.
 *
 *  Deux expressions de plage seulement sont acceptées : `bytes=debut-fin` et
 *  `bytes=debut-`. Une plage en suffixe ou multiple n'est pas exprimable ici.
 *
 *  La version du fichier observée au début d'une lecture est rendue au
 *  lecteur : c'est lui qui compare les versions successives, interrompt le
 *  flux et recharge le lecteur quand le fichier a été remplacé au même
 *  chemin. Le validateur conditionnel `If-Range` fait le reste : un serveur
 *  répond alors `200` au lieu de `206`, et ce `200` se distingue d'un serveur
 *  qui ignorerait les plages.
 */

import { typeMimeMedia } from '../../shared/media'
import {
  ErreurDelaiWebDAV,
  ErreurHttp,
  type ClientWebDAV,
  type InformationFichier,
  type PlageDemandee,
} from './client'

export type { PlageDemandee }

/** Pourquoi une lecture a été refusée. Le vocabulaire est celui de l'interface. */
export type MotifEchecLecture =
  | 'plage-non-honoree' // le serveur a renvoyé 200 : il ignore les plages
  | 'version-changee' // 200 alors qu'un validateur conditionnel était envoyé
  | 'plage-incoherente' // Content-Range, longueur ou corps incohérents
  | 'plage-hors-bornes' // 416 inattendue
  | 'fichier-absent' // 404
  | 'droits' // 401 / 403
  | 'indisponible' // réseau, délai dépassé, erreur du serveur

export class ErreurLectureMedia extends Error {
  constructor(
    public readonly motif: MotifEchecLecture,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurLectureMedia'
  }
}

const FORME_RANGE = /^bytes=(\d+)-(\d*)$/
const FORME_CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+|\*)$/

/** Plage demandée par le lecteur, ou null si elle n'est pas exprimable ici :
 *  plages en suffixe (`bytes=-500`) et plages multiples notamment. */
export function analyserEnteteRange(entete: string | null | undefined): PlageDemandee | null {
  if (!entete) return null
  const trouve = FORME_RANGE.exec(entete.trim())
  if (!trouve) return null
  const debut = Number(trouve[1])
  if (!Number.isSafeInteger(debut)) return null
  if (trouve[2] === '') return { debut }
  const fin = Number(trouve[2])
  if (!Number.isSafeInteger(fin) || fin < debut) return null
  return { debut, fin }
}

/** Plage effectivement servie, telle que le serveur l'annonce. */
interface PlageAnnoncee {
  debut: number
  fin: number
  total: number | null
}

function analyserContentRange(entete: string | null): PlageAnnoncee | null {
  if (!entete) return null
  const trouve = FORME_CONTENT_RANGE.exec(entete.trim())
  if (!trouve) return null
  const debut = Number(trouve[1])
  const fin = Number(trouve[2])
  const total = trouve[3] === '*' ? null : Number(trouve[3])
  if (![debut, fin, total ?? 0].every(Number.isSafeInteger)) return null
  return { debut, fin, total }
}

export interface OptionsLecturePlage {
  /** Abandon de la requête en cours : changement de position, fermeture de
   *  l'entretien, remplacement du média. */
  signal?: AbortSignal
  /** Validateur conditionnel `If-Range` : si le fichier a changé, le serveur
   *  répond 200 et la lecture est refusée pour cause de version. */
  validateur?: string
  /** Arrêt après ce nombre d'octets, pour une lecture de quelques kilo-octets
   *  seulement (sonde de capacité). 0 ou absent : on sert la plage entière. */
  limite?: number
}

export interface LecturePlage {
  /** Corps déjà validé : il relayera exactement les octets annoncés. */
  corps: ReadableStream<Uint8Array>
  /** Version observée au début de la lecture (ETag ou date), à comparer aux
   *  lectures suivantes, et à renvoyer comme validateur conditionnel. */
  version: string | null
  /** Taille totale du fichier quand le serveur l'annonce. */
  total: number | null
  /** Bornes effectivement servies. */
  debut: number
  fin: number
  /** Coupe la requête WebDAV et abandonne le corps. */
  annuler: () => void
}

/** Information sur un média, complétée de ce que le lecteur doit savoir. */
export interface InformationMedia extends InformationFichier {
  /** Type servi au lecteur : l'annonce du serveur si elle est fiable,
   *  l'extension sinon. */
  typeMedia: string
  /** Validateur à renvoyer dans `If-Range` lors des lectures suivantes. */
  validateur: string | null
}

/** Information sur un média, avec un type sûr et un validateur de version.
 *  Une valeur manquante n'est pas un échec : un champ manque, pas le fichier. */
export async function informationMedia(
  client: ClientWebDAV,
  chemin: string,
  options: { signal?: AbortSignal } = {},
): Promise<InformationMedia> {
  const information = await translator(client.informationFichier(chemin, options), chemin)
  return {
    ...information,
    typeMedia: typeMimeMedia(chemin, information.typeMime),
    validateur: information.etag
      ? `"${information.etag}"`
      : (information.dernierModifie ?? null),
  }
}

/** Lit une plage et la rend en flux, après avoir vérifié qu'elle est celle
 *  qui a été demandée. Un `200`, une `416` ou un `Content-Range` incohérent
 *  annulent le corps sans le transmettre. */
export async function lirePlage(
  client: ClientWebDAV,
  chemin: string,
  plage: PlageDemandee,
  options: OptionsLecturePlage = {},
): Promise<LecturePlage> {
  // Annulation maîtrisée par la lecture : le seek, la fermeture ou le
  // remplacement coupe la requête WebDAV, et le lecteur voit la coupe.
  const controleur = new AbortController()
  if (options.signal) {
    if (options.signal.aborted) controleur.abort()
    else options.signal.addEventListener('abort', () => controleur.abort(), { once: true })
  }
  let reponse: Response
  try {
    reponse = await translator(
      client.getPlage(chemin, plage, {
        signal: controleur.signal,
        ...(options.validateur ? { validateur: options.validateur } : {}),
      }),
      chemin,
    )
  } catch (erreur) {
    // Une coupure demandée n'est pas une panne du serveur.
    if (controleur.signal.aborted) throw erreurAnnulation()
    throw erreur
  }
  const annuler = () => {
    controleur.abort()
    void reponse.body?.cancel().catch(() => undefined)
  }

  if (reponse.status === 200) {
    annuler()
    throw new ErreurLectureMedia(
      options.validateur ? 'version-changee' : 'plage-non-honoree',
      options.validateur
        ? `Le média a été remplacé pendant la lecture : ${chemin}`
        : `Le serveur ne sert pas les plages demandées : ${chemin}`,
    )
  }
  if (reponse.status === 416) {
    annuler()
    throw new ErreurLectureMedia('plage-hors-bornes', `Plage refusée par le serveur : ${chemin}`)
  }

  const annonce = analyserContentRange(reponse.headers.get('content-range'))
  if (!annonce) {
    annuler()
    throw new ErreurLectureMedia(
      'plage-incoherente',
      `Réponse sans Content-Range exploitable : ${chemin}`,
    )
  }
  try {
    verifierPlage(chemin, plage, annonce, reponse.headers)
  } catch (erreur) {
    annuler()
    throw erreur
  }
  if (!reponse.body) {
    annuler()
    throw new ErreurLectureMedia('plage-incoherente', `Réponse sans corps : ${chemin}`)
  }

  return {
    corps: garderLongueur(
      relayerErreurs(reponse.body, chemin, controleur.signal),
      annonce.fin - annonce.debut + 1,
      options.limite ?? 0,
      chemin,
      controleur.signal,
    ),
    version: versionObservee(reponse),
    total: annonce.total,
    debut: annonce.debut,
    fin: annonce.fin,
    annuler,
  }
}

/** La plage servie doit être celle demandée : même début, et une fin qui ne
 *  dépasse pas la demande — un serveur serviteur peut s'arrêter à la fin du
 *  fichier, jamais avant un bout de fichier qui existe. */
function verifierPlage(
  chemin: string,
  demande: PlageDemandee,
  annonce: PlageAnnoncee,
  entetes: Headers,
): void {
  const refuser = (pourquoi: string): never => {
    throw new ErreurLectureMedia('plage-incoherente', `${chemin} : ${pourquoi}`)
  }
  if (annonce.debut !== demande.debut) {
    refuser(`plage servie à partir de ${annonce.debut} au lieu de ${demande.debut}`)
  }
  if (annonce.fin < annonce.debut) refuser('plage servie à l\'envers')
  if (annonce.total !== null && annonce.fin + 1 > annonce.total) {
    refuser(`plage servie au-delà de la taille annoncée (${annonce.total} octets)`)
  }
  if (demande.fin !== undefined && annonce.fin > demande.fin) {
    refuser(`plage servie jusqu'à ${annonce.fin} au lieu de ${demande.fin}`)
  }
  if (demande.fin !== undefined && annonce.fin < demande.fin) {
    // Un serveur peut s'arrêter sur la fin du FICHIER, jamais au milieu.
    if (annonce.total === null || annonce.fin + 1 !== annonce.total) {
      refuser(`plage servie jusqu'à ${annonce.fin} au lieu de ${demande.fin}`)
    }
  }
  const longueur = Number(entetes.get('content-length') ?? '')
  const attendu = annonce.fin - annonce.debut + 1
  if (entetes.has('content-length') && longueur !== attendu) {
    refuser(`${longueur} octets annoncés pour une plage de ${attendu}`)
  }
}

/** Une coupure réseau en cours de route devient un refus nommé ; une
 *  annulation décidée par l'appelant passe telle quelle, pour qu'un simple
 *  changement de position ne se déguise pas en panne du serveur.
 *  L'annulation est aussi vérifiée à chaque morceau : un corps déjà en mémoire
 *  ne doit pas continuer d'alimenter le lecteur après un seek. */
function relayerErreurs(
  source: ReadableStream<Uint8Array>,
  chemin: string,
  annulation: AbortSignal,
): ReadableStream<Uint8Array> {
  const lecteur = source.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controleur) {
      if (annulation.aborted) {
        controleur.error(erreurAnnulation())
        return
      }
      try {
        const { done, value } = await lecteur.read()
        if (done) {
          controleur.close()
          return
        }
        controleur.enqueue(value)
      } catch (erreur) {
        if (estAnnulation(erreur)) {
          controleur.error(erreur)
          return
        }
        controleur.error(
          new ErreurLectureMedia('indisponible', `${chemin} : la lecture a été interrompue.`),
        )
      }
    },
    cancel(raison) {
      void lecteur.cancel(raison).catch(() => undefined)
    },
  })
}

function estAnnulation(erreur: unknown): boolean {
  const nomme = (erreur as { name?: unknown } | null)?.name
  const code = (erreur as { code?: unknown } | null)?.code
  return nomme === 'AbortError' || code === 'ABORT_ERR'
}

/** Erreur d'une lecture interrompue par l'appelant : ce n'est pas une panne. */
function erreurAnnulation(): Error {
  return new DOMException('Lecture annulée', 'AbortError')
}

/** Le relais ne transmet que les octets annoncés : il coupe au-delà, et
 *  signale un corps qui s'arrête avant la fin. */
function garderLongueur(
  source: ReadableStream<Uint8Array>,
  attendu: number,
  limite: number,
  chemin: string,
  annulation: AbortSignal,
): ReadableStream<Uint8Array> {
  let recus = 0
  let transmis = 0
  const coupe = limite > 0
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(morceau, controleur) {
        if (annulation.aborted) {
          controleur.error(erreurAnnulation())
          return
        }
        recus += morceau.byteLength
        if (recus > attendu) {
          controleur.error(
            new ErreurLectureMedia(
              'plage-incoherente',
              `${chemin} : le serveur a envoyé plus d'octets qu'annoncé`,
            ),
          )
          return
        }
        const restant = coupe ? Math.max(0, limite - transmis) : morceau.byteLength
        const aTransmettre = Math.min(restant, morceau.byteLength)
        if (aTransmettre > 0) {
          controleur.enqueue(
            aTransmettre === morceau.byteLength ? morceau : morceau.subarray(0, aTransmettre),
          )
          transmis += aTransmettre
        }
        if (coupe && transmis >= limite) controleur.terminate()
      },
      flush(controleur) {
        if (annulation.aborted) {
          controleur.error(erreurAnnulation())
          return
        }
        if (coupe && transmis >= limite) return
        if (recus !== attendu) {
          controleur.error(
            new ErreurLectureMedia(
              'plage-incoherente',
              `${chemin} : corps interrompu (${recus} octets sur ${attendu})`,
            ),
          )
        }
      },
    }),
  )
}

/** Version observée : l'ETag s'il existe, la date de modification sinon.
 *  Elle ne sort jamais du main et ne devient jamais l'identité du média. */
function versionObservee(reponse: Response): string | null {
  return reponse.headers.get('etag') ?? reponse.headers.get('last-modified')
}

/** Les refus du transport sont reformulés dans le vocabulaire du lecteur :
 *  404 n'est pas une panne, et un 403 n'est pas un fichier illisible. */
function translator<T>(promesse: Promise<T>, chemin: string): Promise<T> {
  return promesse.catch((erreur: unknown) => {
    if (erreur instanceof ErreurLectureMedia) throw erreur
    if (estAnnulation(erreur)) throw erreur
    if (erreur instanceof ErreurDelaiWebDAV) {
      throw new ErreurLectureMedia('indisponible', `${chemin} : le serveur ne répond pas.`)
    }
    if (erreur instanceof ErreurHttp) {
      if (erreur.statut === 404) {
        throw new ErreurLectureMedia('fichier-absent', `Média absent du serveur : ${chemin}`)
      }
      if (erreur.statut === 401 || erreur.statut === 403) {
        throw new ErreurLectureMedia(
          'droits',
          `Le serveur refuse l'accès à ce média pour ce compte : ${chemin}`,
        )
      }
    }
    throw new ErreurLectureMedia('indisponible', `Média indisponible : ${chemin}`)
  })
}
