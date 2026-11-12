import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { GardePseudosWebDAV, RefusAvantEnvoiPseudos } from './gardePseudosWebDAV'
import { randomUUID } from 'node:crypto'
import type { ClientWebDAV } from '../webdav/client'
import { ErreurHttp } from '../webdav/client'
import type { VerrouProvider } from '../verrous/types'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import {
  appliquerReaffectationsTheme, construirePlanEntretienTheme, preparerDefinitionsOperationTheme,
  RefusOperationTheme, verifierDemandeOperationTheme,
  type DemandeOperationTheme, type OptionsExecutionOperationTheme, type ProgressionOperationTheme,
  type ResultatOperationTheme,
} from '../../shared/corpus/themes'
import { decoderCorpusTheme, empreinteTheme, verifierReferencesThemes } from '../operationsThemes'
import { ApercusThemesWebDAV } from './apercusThemesWebDAV'
import { JournalLocalThemesWebDAV, type JournalThemesWebDAV, type PublicationThemeEnAttente } from './journalThemesWebDAV'

type VerrouCourt = { provider: VerrouProvider; chemin: string }
interface Dependances {
  client: ClientWebDAV
  apercus: ApercusThemesWebDAV
  dirLocal: string
  gardePseudos: GardePseudosWebDAV
  adapter: (avant: EntretienFichier) => EntretienFichier
  miroir: (chemin: string, contenu: string, etag: string | null) => void
  verrouCorpus: () => VerrouCourt
  verrouEntretien: (id: string) => VerrouCourt
  sessionsLocales: () => string[]
}

class PublicationInconnue extends Error {}
function message(e: unknown): string { return e instanceof Error ? e.message : String(e) }
function signature(demande: DemandeOperationTheme): string {
  const copie = structuredClone(demande)
  if (copie.type === 'division') copie.choix = []
  return empreinteTheme(copie)
}

/** Publie séquentiellement les réaffectations ; une réponse inconnue arrête le lot sans rejeu. */
export class OperationsThemesWebDAV {
  private readonly journal: JournalLocalThemesWebDAV
  private enCours = false
  private readonly retenus = new Map<string, VerrouCourt & { echeance: number }>()

  constructor(private readonly deps: Dependances) {
    this.journal = new JournalLocalThemesWebDAV(deps.dirLocal, empreinteTheme(deps.client.config.baseUrl))
  }

  get occupe(): boolean { return this.enCours }

  lireSuivi() {
    const j = this.journal.lire()
    return j && !j.termine && !j.abandonne ? {
      operationId: j.operationId, demande: structuredClone(j.demande), bilan: this.bilan(j),
      indeterminee: !!j.publication,
    } : null
  }

  publicationDuLotSeule(operationId: string): boolean {
    const garde = this.deps.gardePseudos.lireEnvoi()
    if (!garde) return true
    const j = this.journal.lire()
    return j?.operationId === operationId && j.publication?.chemin === garde.chemin && j.publication.contenu === garde.contenu
  }

  async analyser(demande: DemandeOperationTheme, precedent?: string) {
    this.exigerLibre()
    const j = this.journal.lire()
    if (j?.publication) throw new RefusOperationTheme('Une publication doit être réconciliée avant un nouvel aperçu.')
    if (j && !j.termine && !j.abandonne && signature(j.demande) !== signature(demande)) {
      throw new RefusOperationTheme('Un lot thématique est incomplet : reprenez-le avant une autre opération.')
    }
    const apercu = await this.deps.apercus.analyser(demande, precedent,
      j && !j.termine && !j.abandonne && j.definitionsConfirmees ? j.cibles : undefined)
    return { ...apercu, execution: 'entretiens-sequentiels' as const }
  }

  async preparerReprise(operationId: string) {
    this.exigerLibre()
    const j = this.exigerJournal(operationId)
    if (j.publication) throw new RefusOperationTheme('Réconciliez la publication inconnue avant de reprendre.')
    if (j.termine || j.abandonne) throw new RefusOperationTheme('Ce lot est déjà terminé ou son suivi a été abandonné.')
    const demande = structuredClone(j.demande)
    if (demande.type === 'division') demande.choix = []
    return { demande, apercu: await this.analyser(demande) }
  }

  abandonner(operationId: string): void {
    this.exigerLibre()
    const j = this.exigerJournal(operationId)
    if (j.publication) throw new RefusOperationTheme('Une publication inconnue ne peut pas être abandonnée.')
    j.abandonne = true
    this.journal.ecrire(j)
  }

  async executer(operationId: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void): Promise<ResultatOperationTheme> {
    if (this.enCours) return { statut: 'non-appliquee', motif: 'Une opération sur les thématiques est déjà en cours.' }
    this.enCours = true
    let j: JournalThemesWebDAV | null = null
    try {
      this.exigerSourceConservee(demande)
      if (options?.entretiens !== 'tous-prevus') throw new RefusOperationTheme('WebDAV doit traiter tous les entretiens prévus.')
      j = this.journal.lire()
      if (j?.publication) throw new RefusOperationTheme('Une publication inconnue doit être réconciliée avant tout envoi.')
      if (j?.termine || j?.abandonne) j = null
      if (j && signature(j.demande) !== signature(demande)) throw new RefusOperationTheme('La demande ne correspond pas au lot à reprendre.')
      const manifeste = this.deps.apercus.consommer(operationId, demande)
      const echecs = manifeste.apercu.obstacles.flatMap((o) => o.entretienId ? [{ id: o.entretienId, motif: o.motif }] : [])
      const bloques = new Set(echecs.map((e) => e.id))
      const ids = manifeste.apercu.parEntretien.filter((e) => e.aModifier && !bloques.has(e.id)).map((e) => e.id)
      const total = ids.length + bloques.size
      const signaler = (phase: ProgressionOperationTheme['phase'], termines: number, reussis: number) => {
        try { progression?.({ operationId, phase, total, termines, reussis, echecs: termines - reussis }) } catch {
          // Un panneau fermé ne change pas le résultat du lot.
        }
      }
      signaler('definitions', 0, 0)
      j = await this.avecVerrou(this.deps.verrouCorpus(), async (verifier, garantir) => {
        const lecture = await this.lire('corpus.crp')
        const corpus = decoderCorpusTheme(lecture.contenu)
        exigerAbsenceDissociationWebDAV(corpus)
        if (empreinteTheme(corpus) !== manifeste.corpus) throw new RefusOperationTheme('Le corpus a changé : recalculez l’aperçu.')
        verifierDemandeOperationTheme(corpus, demande)
        verifierReferencesThemes(corpus, [])
        if (!j) {
          const definitions = preparerDefinitionsOperationTheme(corpus, demande, () => `cat-${randomUUID()}`)
          j = { version: 1, destination: empreinteTheme(this.deps.client.config.baseUrl), operationId, tentatives: [operationId], aTraiter: ids,
            demande: structuredClone(demande), cibles: definitions.ciblesCreees, definitionsConfirmees: false, corpus,
            bilan: { reussis: [], echecs, ciblesCreees: [], sourceConservee: true, finalisation: 'non-demandee' }, termine: false }
        } else {
          j.tentatives = [...new Set([...j.tentatives, operationId])]
          j.bilan.echecs = echecs
          j.aTraiter = ids
          delete j.bilan.motifFinalisation
          j.corpus = corpus
        }
        this.journal.ecrire(j)
        if (!j.definitionsConfirmees && j.cibles.length) {
          let index = 0
          const definitions = preparerDefinitionsOperationTheme(corpus, demande, () => j!.cibles[index++].id)
          verifierReferencesThemes(definitions.corpus, [])
          await verifier()
          await this.publier(j, { chemin: 'corpus.crp', contenu: this.serialiser(definitions.corpus, lecture.contenu) }, lecture.etag, garantir)
        } else {
          this.verifierDestinations(corpus, j)
          j.definitionsConfirmees = true
          this.deps.miroir('corpus.crp', lecture.contenu, lecture.etag)
          this.journal.ecrire(j)
        }
        return j
      })
      let termines = bloques.size
      let reussis = 0
      signaler('entretiens', termines, reussis)
      for (const id of ids) {
        try {
          this.exigerSansSession(id)
          await this.avecVerrou(this.deps.verrouEntretien(id), async (verifier, garantir) => {
            this.exigerSansSession(id)
            const corpusLu = await this.lire('corpus.crp')
            const corpus = decoderCorpusTheme(corpusLu.contenu)
            exigerAbsenceDissociationWebDAV(corpus)
            this.verifierDestinations(corpus, j!)
            if (!Object.hasOwn(corpus.membership, id)) throw new RefusOperationTheme('L’entretien ne fait plus partie du corpus.')
            const lecture = await this.lire(`entretiens/${id}.json`)
            const avant = JSON.parse(lecture.contenu) as EntretienFichier
            if (empreinteTheme(avant) !== manifeste.entretiens.get(id)) throw new RefusOperationTheme('L’entretien a changé depuis l’aperçu ; ses choix doivent être recalculés.')
            const data = this.deps.adapter(structuredClone(avant))
            const mutation = appliquerReaffectationsTheme(data, construirePlanEntretienTheme(data, id, demande, j!.cibles))
            verifierReferencesThemes(corpus, [mutation.entretien])
            mutation.entretien.lastModified = new Date().toISOString()
            j!.corpus = corpus
            await verifier()
            this.exigerSansSession(id)
            await this.publier(j!, { chemin: `entretiens/${id}.json`,
              contenu: this.serialiser(mutation.entretien, lecture.contenu),
              entretien: { id, reaffectes: mutation.reaffectes, doublonsSupprimes: mutation.doublonsSupprimes } }, lecture.etag, garantir)
          })
          reussis++
        } catch (e) {
          if (j.publication || e instanceof PublicationInconnue) throw e
          j.bilan.echecs.push({ id, motif: message(e) })
          j.aTraiter = j.aTraiter?.filter((reste) => reste !== id)
          this.journal.ecrire(j)
        }
        signaler('entretiens', ++termines, reussis)
      }
      j.termine = j.bilan.echecs.length === 0
      this.journal.ecrire(j)
      signaler('finalisation', termines, reussis)
      return this.resultat(j)
    } catch (e) {
      if (j?.publication) return { statut: 'indeterminee', operationId: j.operationId, motif: message(e), bilan: this.bilan(j) }
      if (j && (j.definitionsConfirmees || j.bilan.reussis.length)) {
        j.bilan.motifFinalisation = message(e)
        try { this.journal.ecrire(j) } catch { /* Le dernier état durable reste reprenable. */ }
        return this.resultat(j)
      }
      return { statut: 'non-appliquee', motif: message(e) }
    } finally { this.enCours = false }
  }

  async reconcilier(operationId: string): Promise<ResultatOperationTheme> {
    this.exigerLibre()
    this.enCours = true
    let j: JournalThemesWebDAV | null = null
    try {
      j = this.exigerJournal(operationId)
      const p = j.publication
      if (!p) return this.resultat(j)
      if (p.entretien) {
        this.exigerSansSession(p.entretien.id)
        await this.deps.gardePseudos.reconcilier()
      }
      const verrou = p.entretien ? this.deps.verrouEntretien(p.entretien.id) : this.deps.verrouCorpus()
      await this.avecVerrou(verrou, async () => {
        if (p.entretien) this.exigerSansSession(p.entretien.id)
        const relu = await this.lire(p.chemin)
        if (relu.contenu !== p.contenu) throw new PublicationInconnue('La publication n’est pas confirmée. Aucun PUT ne sera rejoué automatiquement.')
        this.confirmer(j!, p, relu.etag)
      })
      return this.resultat(j)
    } catch (e) {
      return { statut: 'indeterminee', operationId: j?.operationId ?? operationId, motif: message(e), ...(j ? { bilan: this.bilan(j) } : {}) }
    } finally { this.enCours = false }
  }

  private bilan(j: JournalThemesWebDAV) {
    const inconnu = j.publication?.entretien?.id
    return { ...structuredClone(j.bilan),
      inconnus: inconnu ? [{ id: inconnu, motif: 'Publication non confirmée ; aucun rejeu automatique.' }] : [],
      differes: (j.aTraiter ?? []).filter((id) => id !== inconnu).map((id) => ({ id, motif: 'Non traité ; une reprise explicite est nécessaire.' })),
    }
  }

  private resultat(j: JournalThemesWebDAV): ResultatOperationTheme {
    if (!j.termine) return { statut: 'partielle', operationId: j.operationId, corpus: structuredClone(j.corpus), bilan: this.bilan(j) }
    return { statut: 'appliquee', corpus: structuredClone(j.corpus), entretiens: j.bilan.reussis.length,
      reaffectes: j.bilan.reussis.reduce((n, e) => n + e.reaffectes, 0), doublonsSupprimes: j.bilan.reussis.reduce((n, e) => n + e.doublonsSupprimes, 0) }
  }

  private exigerJournal(operationId: string): JournalThemesWebDAV {
    const j = this.journal.lire()
    if (!j || (j.operationId !== operationId && !j.tentatives.includes(operationId))) throw new RefusOperationTheme('Lot absent ou appartenant à un autre corpus.')
    return j
  }

  private exigerLibre(): void {
    if (this.enCours) throw new RefusOperationTheme('Une opération sur les thématiques est déjà en cours.')
  }

  private exigerSourceConservee(d: DemandeOperationTheme): void {
    if ((d?.type === 'transfert' && d.conserverSource !== true)
      || (d?.type === 'division' && d.effacerSource !== false)
      || (d?.type !== 'transfert' && d?.type !== 'division')) {
      throw new RefusOperationTheme('WebDAV doit conserver la thématique source.')
    }
  }

  private exigerSansSession(id: string): void {
    if (this.deps.sessionsLocales().includes(id)) throw new RefusOperationTheme('Une session locale ou récupérable doit être fermée avant cette réaffectation.')
  }

  private verifierDestinations(corpus: CorpusFichier, j: JournalThemesWebDAV): void {
    const demande = structuredClone(j.demande)
    if (demande.type === 'division') demande.choix = []
    verifierDemandeOperationTheme(corpus, demande)
    verifierReferencesThemes(corpus, [])
    if (j.definitionsConfirmees && j.cibles.some((c) => !Object.hasOwn(corpus.codebook, c.id))) throw new RefusOperationTheme('Une destination créée a disparu ; le lot ne peut pas continuer.')
  }

  private async lire(chemin: string): Promise<{ contenu: string; etag: string }> {
    const r = await this.deps.client.getTexteAvecEtag(chemin)
    if (!r.etag || /^W\//i.test(r.etag)) throw new RefusOperationTheme('ETag fort absent : publication refusée.')
    return { contenu: r.contenu, etag: r.etag }
  }

  private serialiser(data: unknown, avant: string): string {
    const contenu = JSON.stringify(data, null, 2)
    // Une taille différente évite les collisions mtime/taille observées sur Nextcloud.
    return Buffer.byteLength(contenu) === Buffer.byteLength(avant) ? `${contenu}\n` : contenu
  }

  private async avecVerrou<T>(demande: VerrouCourt, fn: (verifier: () => Promise<void>, garantir: () => void) => Promise<T>): Promise<T> {
    const connu = this.retenus.get(demande.chemin)
    let verrou = connu
    if (!verrou) {
      const debut = Date.now(), acquisition = await demande.provider.acquerir(demande.chemin)
      if (!acquisition.ok) throw new RefusOperationTheme(`Verrou tenu par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'}.`)
      verrou = { ...demande, echeance: debut + acquisition.dureeGarantieMs }
    }
    const verifier = async () => {
      const debut = Date.now(), battement = await verrou.provider.battre(verrou.chemin)
      if (!battement.ok) throw new RefusOperationTheme('Le droit d’écriture n’est plus garanti.')
      verrou.echeance = debut + battement.dureeGarantieMs
    }
    try {
      await verifier()
      return await fn(verifier, () => {
        if (Date.now() + 60_000 >= verrou.echeance) throw new RefusOperationTheme('Le droit d’écriture va expirer ; aucun PUT n’est envoyé.')
      })
    } finally {
      if (this.journal.lire()?.publication) this.retenus.set(verrou.chemin, verrou)
      else { this.retenus.delete(verrou.chemin); await verrou.provider.liberer(verrou.chemin).catch(() => {}) }
    }
  }

  private async publier(j: JournalThemesWebDAV, publication: PublicationThemeEnAttente, etag: string, garantir: () => void): Promise<void> {
    j.publication = publication
    try { this.journal.ecrire(j) } catch (e) {
      delete j.publication
      throw e
    }
    try { garantir() } catch (e) {
      delete j.publication
      this.journal.ecrire(j)
      throw e
    }
    let etagFinal: string | null, envoiCommence = false
    const envoyer = (garantirCorpus: () => void = () => {}) => {
      try { garantirCorpus(); garantir() } catch (e) { throw new RefusAvantEnvoiPseudos(message(e)) }
      envoiCommence = true
      return this.deps.client.putTexte(publication.chemin, publication.contenu, { ifMatch: etag })
    }
    try {
      if (publication.entretien) {
        const avant = await this.lire(publication.chemin)
        if (avant.etag !== etag) throw new RefusAvantEnvoiPseudos('La source a changé avant le PUT thématique.')
        etagFinal = await this.deps.gardePseudos.publier(publication.contenu, avant.contenu, envoyer, publication.chemin)
      } else etagFinal = await envoyer()
    } catch (e) {
      if (!envoiCommence || e instanceof RefusAvantEnvoiPseudos || (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut))) {
        delete j.publication
        this.journal.ecrire(j)
        throw e
      }
      try {
        const relu = await this.lire(publication.chemin)
        if (relu.contenu !== publication.contenu) throw new PublicationInconnue('La réponse du PUT est inconnue.')
        etagFinal = relu.etag
        if (publication.entretien) await this.deps.gardePseudos.reconcilier()
      } catch {
        throw new PublicationInconnue(`Publication à réconcilier, sans rejeu : ${message(e)}`)
      }
    }
    this.confirmer(j, publication, etagFinal)
  }

  private confirmer(j: JournalThemesWebDAV, p: PublicationThemeEnAttente, etag: string | null): void {
    this.deps.miroir(p.chemin, p.contenu, etag)
    const confirme = structuredClone(j)
    if (p.entretien) {
      confirme.aTraiter = confirme.aTraiter?.filter((id) => id !== p.entretien!.id)
      const ancien = confirme.bilan.reussis.find((e) => e.id === p.entretien!.id)
      if (ancien) { ancien.reaffectes += p.entretien.reaffectes; ancien.doublonsSupprimes += p.entretien.doublonsSupprimes }
      else confirme.bilan.reussis.push(p.entretien)
    } else {
      confirme.corpus = decoderCorpusTheme(p.contenu)
      confirme.definitionsConfirmees = true
      confirme.bilan.ciblesCreees = structuredClone(confirme.cibles)
    }
    delete confirme.publication
    this.journal.ecrire(confirme)
    Object.assign(j, confirme)
    delete j.publication
  }
}
