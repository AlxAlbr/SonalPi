import { createHash, randomUUID } from 'node:crypto'
import type { ClientWebDAV } from '../webdav/client'
import { ErreurHttp } from '../webdav/client'
import type { VerrouProvider } from '../verrous/types'
import type { DetailsLocuteurs } from '../../shared/corpus/detailsLocuteurs'
import type { SuiviCorrectionLocuteurs } from '../../shared/corpus/suiviCorrectionsLocuteurs'
import type { CommandeCorrectionLocuteurs } from '../../shared/corpus/contratsLocuteurs'
import { validerCommandeCorrectionLocuteurs } from '../../shared/corpus/contratsLocuteurs'
import { inventorierPersonnes } from '../../shared/corpus/personnes'
import { normaliserCategoriesNote } from '../../shared/entretien/notes'
import { validerCorpusNatif, validerEntretienNatif } from '../../shared/natif/validation'
import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { preparerCorrectionLocuteurs } from '../preparationCorrectionsLocuteurs'
import { MAX_ENTRETIENS_CORRECTION_WEBDAV, JournalCorrectionsLocuteursWebDAV, idSourceLocuteursValide, type JournalCorrectionLocuteursWebDAV, type FichierCorrectionLocuteurs } from './journalCorrectionsLocuteursWebDAV'

interface Lecture { contenu: string; etag: string }
interface Reservation { provider: VerrouProvider; chemin: string; echeance?: number }
interface Dependances {
  client: ClientWebDAV
  dirLocal: string
  utilisateur: () => string
  sessionsLocales: () => string[]
  verifierContexte: () => void
  verrouCorpus: () => Reservation
  verrouEntretien: (id: string) => Reservation
  miroir: (chemin: string, contenu: string, etag: string) => void
}

export { MAX_ENTRETIENS_CORRECTION_WEBDAV }
const MAX_OCTETS_SOURCES = 32 * 1024 * 1024
const margePublication = 60_000

export function destinationCorrectionLocuteurs(baseUrl: string, utilisateur: string): string {
  return createHash('sha256').update(JSON.stringify([baseUrl.replace(/\/+$/, ''), utilisateur])).digest('hex')
}

function serialiser(valeur: unknown, precedents: string[]): string {
  let texte = JSON.stringify(valeur, null, 2)
  while (precedents.some((p) => Buffer.byteLength(p) === Buffer.byteLength(texte))) texte += '\n'
  return texte
}

/** Publie des candidats fixes, sans retirer une identité avant ses dernières références. */
export class CorrectionsLocuteursWebDAV {
  private readonly journal: JournalCorrectionsLocuteursWebDAV
  private enCours = false
  constructor(private readonly deps: Dependances) {
    this.journal = new JournalCorrectionsLocuteursWebDAV(deps.dirLocal,
      destinationCorrectionLocuteurs(deps.client.config.baseUrl, deps.utilisateur()))
  }
  get occupe() { return this.enCours }

  lireSuivi(): SuiviCorrectionLocuteurs | null {
    const j = this.journal.lire()
    if (!j || j.termine || j.abandonne) return null
    const actions: Record<CommandeCorrectionLocuteurs['type'], string> = {
      renommerGlobal: 'Renommage des locuteurs', regrouperSelection: 'Réunion des locuteurs',
      dissocierSelection: 'Dissociation des locuteurs', individualiserSelection: 'Conservation séparée des voix',
      supprimerVide: 'Suppression d’un locuteur sans entretien', ecarterRapprochement: 'Distinction des locuteurs',
      retablirRapprochement: 'Réexamen d’une distinction', reprendreInformations: 'Reprise des informations',
    }
    return { operationId: j.operationId, action: actions[j.commande.type], etat: j.envoi === undefined ? 'a-reprendre' : 'a-verifier', termines: j.position, total: j.etapes.length }
  }

  exigerDisponible(): void {
    if (this.enCours || this.lireSuivi()) throw new Error('Une correction des locuteurs reste à terminer. Ouvrez l’onglet Locuteurs pour consulter son suivi avant de modifier le corpus.')
  }

  async lireDetails(): Promise<DetailsLocuteurs> {
    this.exigerDisponible(); this.enCours = true
    try {
      const lecture = await this.lireEnsemble()
      const entretiens = [...lecture.sources].map(([id, s]) => {
        const data: unknown = JSON.parse(s.contenu); validerEntretienNatif(data)
        return { id, titre: lecture.corpus.membership[id].titre, data }
      })
      return { inventaire: { ...inventorierPersonnes(lecture.corpus, entretiens), indisponibles: [] },
        variables: Object.values(lecture.corpus.variables), categories: normaliserCategoriesNote(lecture.corpus.categoriesNote) }
    } finally { this.enCours = false }
  }

  async appliquer(commande: CommandeCorrectionLocuteurs): Promise<string> {
    validerCommandeCorrectionLocuteurs(commande)
    this.exigerDisponible(); this.enCours = true
    try {
      return await this.avecProtections(null, async (courants, reservations) => {
        const corpus = courants.get('corpus.crp')!
        const sources = [...courants].filter(([chemin]) => chemin !== 'corpus.crp').map(([chemin, s]) => ({ id: chemin.slice(11, -5), contenu: s.contenu }))
        const plan = preparerCorrectionLocuteurs(corpus.contenu, sources, commande)
        const modifies = new Map(plan.entretiens.map((e) => [e.id, e.apres]))
        const intermediaire = structuredClone(plan.corpusAvant)
        for (const [id, definition] of Object.entries(plan.corpusApres.locuteurs)) {
          if (!Object.hasOwn(intermediaire.locuteurs, id)) intermediaire.locuteurs[id] = definition
        }
        const etapes: FichierCorrectionLocuteurs[] = []
        let corpusCourant = corpus.contenu
        if (JSON.stringify(intermediaire) !== JSON.stringify(plan.corpusAvant)) {
          const apres = serialiser(intermediaire, [corpus.contenu])
          etapes.push({ chemin: 'corpus.crp', avant: corpusCourant, apres }); corpusCourant = apres
        }
        const fichiers = sources.map((s) => {
          const apres = modifies.has(s.id) ? serialiser(modifies.get(s.id), [s.contenu]) : s.contenu
          if (apres !== s.contenu) etapes.push({ chemin: `entretiens/${s.id}.json`, avant: s.contenu, apres })
          return { id: s.id, avant: s.contenu, apres }
        })
        if (JSON.stringify(plan.corpusApres) !== JSON.stringify(JSON.parse(corpusCourant))) {
          const apres = serialiser(plan.corpusApres, [corpus.contenu, corpusCourant])
          etapes.push({ chemin: 'corpus.crp', avant: corpusCourant, apres }); corpusCourant = apres
        }
        const j: JournalCorrectionLocuteursWebDAV = { version: 1, destination: destinationCorrectionLocuteurs(this.deps.client.config.baseUrl, this.deps.utilisateur()),
          operationId: randomUUID(), commande: structuredClone(commande), locuteurId: plan.locuteurId,
          corpusAvant: corpus.contenu, corpusApres: corpusCourant, sources: fichiers, etapes, position: 0, termine: false }
        this.journal.ecrire(j)
        return this.continuer(j, courants, reservations)
      })
    } finally { this.enCours = false }
  }

  async reprendre(operationId: string): Promise<string> {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    if (j.envoi !== undefined) throw new Error('Vérifiez d’abord le résultat de la correction. Aucun envoi ne sera répété sans vérification.')
    this.enCours = true
    try { return await this.avecProtections(j, (courants, reservations) => this.continuer(j, courants, reservations)) }
    finally { this.enCours = false }
  }

  arreter(operationId: string): void {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    if (j.envoi !== undefined) throw new Error('Vérifiez d’abord le résultat de la correction avant de l’arrêter.')
    j.abandonne = true; this.journal.ecrire(j)
  }

  async reconcilier(operationId: string): Promise<void> {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    this.enCours = true
    try {
      await this.avecProtections(j, async (courants) => {
        if (j.envoi !== undefined) {
          const etape = j.etapes[j.envoi]
          if (courants.get(etape.chemin)?.contenu !== etape.apres) throw new Error('La correction n’est pas confirmée. Aucun envoi n’a été répété ; conservez le suivi pour une nouvelle vérification ou l’assistance.')
          j.position++; delete j.envoi; this.journal.ecrire(j)
        }
        if (j.position === j.etapes.length) { j.termine = true; this.journal.ecrire(j) }
        else this.verifierContenus(j, courants)
        this.installer(courants)
      })
    } finally { this.enCours = false }
  }

  private async continuer(j: JournalCorrectionLocuteursWebDAV, courants: Map<string, Lecture>, reservations: Reservation[]): Promise<string> {
    if (j.position < j.etapes.length) this.verifierContenus(j, courants)
    while (j.position < j.etapes.length) {
      const etape = j.etapes[j.position]
      await this.verifierDroits(reservations)
      const frais = await this.lireEnsemble()
      courants = new Map([['corpus.crp', frais.lecture], ...[...frais.sources].map(([id, s]): [string, Lecture] => [`entretiens/${id}.json`, s])])
      this.verifierContenus(j, courants)
      this.garantir(reservations)
      j.envoi = j.position; this.journal.ecrire(j)
      try { this.garantir(reservations) }
      catch (e) { delete j.envoi; this.journal.ecrire(j); throw e }
      try {
        await this.deps.client.putTexte(etape.chemin, etape.apres, { ifMatch: courants.get(etape.chemin)!.etag })
      } catch (e) {
        if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
          delete j.envoi; this.journal.ecrire(j)
          throw e
        }
        throw new Error('Le résultat de la correction doit être vérifié avant de poursuivre. Aucun envoi ne sera répété automatiquement.')
      }
      const confirme = await this.lire(etape.chemin)
      if (confirme.contenu !== etape.apres) throw new Error('La correction doit être vérifiée avant de poursuivre.')
      j.position++; delete j.envoi; this.journal.ecrire(j)
      courants.set(etape.chemin, confirme)
      this.deps.miroir(etape.chemin, confirme.contenu, confirme.etag)
    }
    j.termine = true; this.journal.ecrire(j)
    try { this.installer(courants) }
    catch { throw new Error('La correction est enregistrée, mais la copie de cet ordinateur n’a pas pu être actualisée. Actualisez ou rouvrez le corpus avant de poursuivre.') }
    return j.locuteurId
  }

  private verifierContenus(j: JournalCorrectionLocuteursWebDAV, courants: Map<string, Lecture>): void {
    const attendus = new Map([['corpus.crp', j.corpusAvant], ...j.sources.map((s): [string, string] => [`entretiens/${s.id}.json`, s.avant])])
    for (const etape of j.etapes.slice(0, j.position)) attendus.set(etape.chemin, etape.apres)
    if (attendus.size !== courants.size || [...attendus].some(([chemin, contenu]) => courants.get(chemin)?.contenu !== contenu)) {
      throw new Error('Le corpus ou un entretien a changé. La correction est suspendue sans écraser ces modifications ; conservez son suivi pour l’assistance.')
    }
  }

  private installer(courants: Map<string, Lecture>): void {
    for (const [chemin, s] of courants) this.deps.miroir(chemin, s.contenu, s.etag)
  }

  private exigerJournal(id: string): JournalCorrectionLocuteursWebDAV {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.termine || j.abandonne) throw new Error('Cette correction n’est plus à reprendre dans ce corpus.')
    return j
  }

  private async lire(chemin: string): Promise<Lecture> {
    const r = await this.deps.client.getTexteAvecEtag(chemin)
    if (!r.etag || /^W\//i.test(r.etag)) throw new Error('La version de ce fichier ne permet pas une correction protégée.')
    return { contenu: r.contenu, etag: r.etag }
  }

  private async lireEnsemble(premiere?: Lecture) {
    this.deps.verifierContexte()
    const lecture = premiere ?? await this.lire('corpus.crp'), corpus: unknown = JSON.parse(lecture.contenu)
    validerCorpusNatif(corpus); exigerAbsenceDissociationWebDAV(corpus)
    const ids = Object.keys(corpus.membership).sort()
    if (ids.length > MAX_ENTRETIENS_CORRECTION_WEBDAV || !ids.every(idSourceLocuteursValide)) throw new Error(`Cette correction est limitée à ${MAX_ENTRETIENS_CORRECTION_WEBDAV} entretiens valides.`)
    const sources = new Map<string, Lecture>()
    let octets = Buffer.byteLength(lecture.contenu)
    for (const id of ids) {
      const source = await this.lire(`entretiens/${id}.json`)
      octets += Buffer.byteLength(source.contenu)
      if (octets > MAX_OCTETS_SOURCES) throw new Error('Le corpus est trop volumineux pour cette correction protégée.')
      validerEntretienNatif(JSON.parse(source.contenu)); sources.set(id, source)
    }
    const fin = await this.lire('corpus.crp')
    if (fin.etag !== lecture.etag || fin.contenu !== lecture.contenu) throw new Error('Le corpus a changé pendant sa lecture. Actualisez avant de confirmer.')
    return { lecture, corpus, sources }
  }

  private async avecProtections<T>(j: JournalCorrectionLocuteursWebDAV | null, action: (courants: Map<string, Lecture>, reservations: Reservation[]) => Promise<T>): Promise<T> {
    const reservations: Reservation[] = []
    const prendre = async (r: Reservation) => {
      const debut = Date.now(), acquisition = await r.provider.acquerir(r.chemin)
      if (!acquisition.ok) throw new Error(`Un entretien ou le corpus est en cours de modification par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'}.`)
      r.echeance = debut + acquisition.dureeGarantieMs; reservations.push(r)
    }
    try {
      this.verifierSession()
      await prendre(this.deps.verrouCorpus())
      const corpus = await this.lire('corpus.crp'), data: unknown = JSON.parse(corpus.contenu)
      validerCorpusNatif(data)
      const ids = j ? j.sources.map((s) => s.id).sort() : Object.keys(data.membership).sort()
      if (ids.length > MAX_ENTRETIENS_CORRECTION_WEBDAV || !ids.every(idSourceLocuteursValide)) throw new Error('Trop d’entretiens ou identifiants invalides pour cette correction.')
      for (const id of ids) await prendre(this.deps.verrouEntretien(id))
      this.verifierSession()
      const lecture = await this.lireEnsemble(corpus)
      await this.verifierDroits(reservations)
      const courants = new Map([['corpus.crp', lecture.lecture], ...[...lecture.sources].map(([id, s]): [string, Lecture] => [`entretiens/${id}.json`, s])])
      return await action(courants, reservations)
    } finally {
      for (const r of reservations.reverse()) await r.provider.liberer(r.chemin).catch(() => {})
    }
  }

  private verifierSession(): void {
    this.deps.verifierContexte()
    if (this.deps.sessionsLocales().length) throw new Error('Enregistrez et fermez les entretiens en édition avant de corriger les locuteurs du corpus partagé.')
  }

  private async verifierDroits(reservations: Reservation[]): Promise<void> {
    this.verifierSession()
    for (const r of reservations) {
      const debut = Date.now(), preuve = await r.provider.battre(r.chemin)
      if (!preuve.ok) throw new Error('La protection d’un entretien a été perdue. La correction reste à reprendre.')
      r.echeance = debut + preuve.dureeGarantieMs
    }
    this.garantir(reservations)
  }

  private garantir(reservations: Reservation[]): void {
    this.verifierSession()
    if (reservations.some((r) => !r.echeance || Date.now() + margePublication >= r.echeance)) throw new Error('La protection des entretiens va expirer. Aucun nouvel envoi n’est autorisé.')
  }
}
