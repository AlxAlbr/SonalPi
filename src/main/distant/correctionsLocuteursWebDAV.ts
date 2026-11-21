import { createHash, randomUUID } from 'node:crypto'
import type { ClientWebDAV } from '../webdav/client'
import { ErreurHttp } from '../webdav/client'
import type { EntretienFichier } from '../../shared/format'
import type { ReservationCorrectionLocuteurs as Reservation, SessionCorrectionLocuteursWebDAV, CopieSessionLocuteursWebDAV, ContexteSessionLocuteursWebDAV } from './sessionCorrectionLocuteurs'
import type { DetailsLocuteurs } from '../../shared/corpus/detailsLocuteurs'
import type { SuiviCorrectionLocuteurs } from '../../shared/corpus/suiviCorrectionsLocuteurs'
import type { CommandeCorrectionLocuteurs, CommandeRenommageLocuteur, OperationNommageLocuteurs } from '../../shared/corpus/contratsLocuteurs'
import { validerOperationNommageLocuteurs, validerCommandeCorrectionLocuteurs } from '../../shared/corpus/contratsLocuteurs'
import { inventorierLocuteurs } from '../../shared/corpus/inventaireLocuteurs'
import { normaliserCategoriesNote } from '../../shared/entretien/notes'
import { validerCorpusNatif, validerEntretienNatif } from '../../shared/natif/validation'
import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { preparerNommageLocuteurs, preparerCorrectionLocuteurs } from '../preparationCorrectionsLocuteurs'
import { MAX_ENTRETIENS_CORRECTION_WEBDAV, JournalCorrectionsLocuteursWebDAV, idSourceLocuteursValide, type JournalCorrectionLocuteursWebDAV, type FichierCorrectionLocuteurs } from './journalCorrectionsLocuteursWebDAV'

interface Lecture { contenu: string; etag: string }
interface Dependances {
  client: ClientWebDAV
  dirLocal: string
  utilisateur: () => string
  sessionsLocales: () => string[]
  verifierContexte: (session?: ContexteSessionLocuteursWebDAV, cibles?: readonly string[]) => void
  verrouCorpus: () => Reservation
  verrouEntretien: (id: string) => Reservation
  miroir: (chemin: string, contenu: string, etag: string) => void
}

export { MAX_ENTRETIENS_CORRECTION_WEBDAV }
const MAX_OCTETS_SOURCES = 32 * 1024 * 1024
const margePublication = 60_000
const CHEMIN_VERROU_CORPUS = 'verrous/corpus.lock.json'

export function destinationCorrectionLocuteurs(baseUrl: string, utilisateur: string): string {
  return createHash('sha256').update(JSON.stringify([baseUrl.replace(/\/+$/, ''), utilisateur])).digest('hex')
}

function serialiser(valeur: unknown, precedents: string[]): string {
  let texte = JSON.stringify(valeur, null, 2)
  while (precedents.some((p) => Buffer.byteLength(p) === Buffer.byteLength(texte))) texte += '\n'
  return texte
}

function contenuAvant(etape: FichierCorrectionLocuteurs): string {
  return etape.avant + '\n'.repeat(etape.retoursReprise ?? 0)
}

/** Publie des candidats fixes, sans retirer une identité avant ses dernières références. */
export class CorrectionsLocuteursWebDAV {
  private readonly journal: JournalCorrectionsLocuteursWebDAV
  private enCours = false
  private publicationIncertaine = false
  private contexteSession?: ContexteSessionLocuteursWebDAV
  private sessionCourante?: SessionCorrectionLocuteursWebDAV
  private entretienUnique?: string
  private cibles?: readonly string[]
  constructor(private readonly deps: Dependances) {
    this.journal = new JournalCorrectionsLocuteursWebDAV(deps.dirLocal,
      destinationCorrectionLocuteurs(deps.client.config.baseUrl, deps.utilisateur()))
  }
  get occupe() { return this.enCours }

  lireSuivi(): SuiviCorrectionLocuteurs | null {
    const j = this.journal.lire()
    if (!j || j.termine || j.abandonne) return null
    const actions: Record<JournalCorrectionLocuteursWebDAV['commande']['type'], string> = {
      identifierAuNommage: 'Création du locuteur', rapprocherAuNommage: 'Rapprochement des locuteurs',
      renommerGlobal: 'Renommage des locuteurs', renommerParticipation: 'Renommage dans un entretien', regrouperSelection: 'Réunion des locuteurs',
      dissocierSelection: 'Dissociation des locuteurs', individualiserSelection: 'Conservation séparée des voix',
      supprimerVide: 'Suppression d’un locuteur sans entretien', ecarterRapprochement: 'Distinction des locuteurs',
      retablirRapprochement: 'Réexamen d’une distinction', reprendreInformations: 'Reprise des informations',
    }
    return { operationId: j.operationId, action: actions[j.commande.type], etat: j.envoi === undefined ? 'a-reprendre' : 'a-verifier', termines: j.position, total: j.etapes.length }
  }

  exigerDisponible(): void {
    if (this.enCours || this.lireSuivi()) throw new Error('Une correction des locuteurs reste à terminer. Ouvrez l’onglet Locuteurs pour consulter son suivi avant de modifier le corpus.')
  }

  sessionInterrompue() {
    const j = this.journal.lire(), session = j?.sessionLocale
    if (!session || j.abandonne) return null
    const source = j.sources.find((s) => s.id === session.entretienId)!
    return { session, avant: source.avant, apres: source.apres, terminee: j.termine }
  }

  async lireDetails(copie?: CopieSessionLocuteursWebDAV): Promise<DetailsLocuteurs> {
    this.exigerDisponible(); this.enCours = true
    this.contexteSession = copie ? { entretienId: copie.entretienId, creation: copie.creation === true } : undefined
    try {
      const lecture = await this.lireEnsemble()
      const entretiens = [...lecture.sources].map(([id, s]) => {
        if (id === copie?.entretienId && (s.contenu !== copie.avant || s.etag !== copie.etag)) throw new Error('La version publiée de cet entretien a changé. Rouvrez-le avant de modifier ses locuteurs.')
        const data: unknown = JSON.parse(id === copie?.entretienId ? copie.candidat : s.contenu); validerEntretienNatif(data)
        return { id, titre: lecture.corpus.membership[id].titre, data }
      })
      if (copie && !lecture.sources.has(copie.entretienId)) throw new Error('Cet entretien ne fait plus partie du corpus.')
      return { inventaire: { ...inventorierLocuteurs(lecture.corpus, entretiens), indisponibles: [] },
        variables: Object.values(lecture.corpus.variables), categories: normaliserCategoriesNote(lecture.corpus.categoriesNote) }
    } finally { this.enCours = false; this.contexteSession = undefined }
  }

  appliquer(commande: CommandeCorrectionLocuteurs): Promise<string> {
    validerCommandeCorrectionLocuteurs(commande)
    return this.appliquerOperation(commande)
  }

  async appliquerDepuisSession(commande: CommandeRenommageLocuteur | OperationNommageLocuteurs, session: SessionCorrectionLocuteursWebDAV): Promise<Lecture> {
    this.exigerDisponible()
    if (commande.type === 'renommerGlobal') validerCommandeCorrectionLocuteurs(commande)
    else validerOperationNommageLocuteurs(commande)
    this.sessionCourante = session
    this.contexteSession = { entretienId: session.identite.entretienId, creation: commande.type === 'identifierAuNommage' }
    this.entretienUnique = commande.type === 'identifierAuNommage' || commande.type === 'renommerParticipation' ? session.identite.entretienId : undefined
    try {
      await this.appliquerOperation(commande)
      session.verifier()
      const j = this.journal.lire()!, source = await this.lire(`entretiens/${session.identite.entretienId}.json`)
      if (source.contenu !== j.sources.find((s) => s.id === session.identite.entretienId)?.apres) throw new Error('Le résultat reste à vérifier. Rouvrez le corpus avant de modifier cet entretien.')
      return source
    } finally { this.sessionCourante = undefined; this.contexteSession = undefined; this.entretienUnique = undefined }
  }

  private async appliquerOperation(commande: JournalCorrectionLocuteursWebDAV['commande']): Promise<string> {
    this.exigerDisponible(); this.enCours = true
    try {
      return await this.avecProtections(null, async (courants, reservations, reserver) => {
        const corpus = courants.get('corpus.crp')!
        const sources = [...courants].filter(([chemin]) => chemin !== 'corpus.crp').map(([chemin, s]) => ({ id: chemin.slice(11, -5), contenu: s.contenu }))
        const plan = commande.type === 'identifierAuNommage' || commande.type === 'rapprocherAuNommage' || commande.type === 'renommerParticipation'
          ? preparerNommageLocuteurs(corpus.contenu, sources, commande) : preparerCorrectionLocuteurs(corpus.contenu, sources, commande)
        if (this.sessionCourante) {
          const id = this.sessionCourante.identite.entretienId
          const avant = sources.find((s) => s.id === id)?.contenu
          if (avant !== this.sessionCourante.avant || courants.get(`entretiens/${id}.json`)?.etag !== this.sessionCourante.etag) throw new Error('La version publiée de cet entretien a changé. Aucun locuteur modifié.')
          this.sessionCourante.verifierResultat(plan.entretiens.find((e) => e.id === id)?.apres ?? JSON.parse(avant) as EntretienFichier)
        }
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
          ...(this.sessionCourante ? { sessionLocale: { ...this.sessionCourante.identite } } : {}),
          corpusAvant: corpus.contenu, corpusApres: corpusCourant, sources: fichiers, etapes, position: 0, termine: false }
        await reserver([...modifies.keys()])
        if (etapes.length) this.sessionCourante?.engager()
        this.journal.ecrire(j)
        return this.continuer(j, courants, reservations)
      })
    } finally { this.enCours = false; this.cibles = undefined }
  }

  async reprendre(operationId: string): Promise<string> {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    if (j.envoi !== undefined) throw new Error('Vérifiez d’abord le résultat de la correction. Aucun envoi ne sera répété sans vérification.')
    this.entretienUnique = j.commande.type === 'identifierAuNommage' || j.commande.type === 'renommerParticipation' ? j.commande.demande.entretienId : undefined
    this.enCours = true
    try {
      await this.libererProtectionReconnue(j)
      return await this.avecProtections(j, (courants, reservations) => this.continuer(j, courants, reservations))
    }
    finally { this.enCours = false; this.entretienUnique = undefined; this.cibles = undefined }
  }

  async arreter(operationId: string): Promise<void> {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    if (j.envoi !== undefined) throw new Error('Vérifiez d’abord le résultat de la correction avant de l’arrêter.')
    this.enCours = true
    try {
      await this.libererProtectionReconnue(j)
      j.abandonne = true; this.journal.ecrire(j)
    } finally { this.enCours = false }
  }

  async reconcilier(operationId: string): Promise<void> {
    if (this.enCours) throw new Error('Attendez la fin de la correction en cours.')
    const j = this.exigerJournal(operationId)
    this.entretienUnique = j.commande.type === 'identifierAuNommage' || j.commande.type === 'renommerParticipation' ? j.commande.demande.entretienId : undefined
    this.enCours = true
    try {
      if (j.envoi !== undefined && j.verrouCorpus) await this.reconnaitreEnvoiRetenu(j)
      await this.libererProtectionReconnue(j)
      await this.avecProtections(j, async (courants, reservations) => {
        if (j.envoi !== undefined) {
          await this.reconnaitreEnvoiRetenu(j, reservations)
          courants = await this.lireEtatCorrection(j)
          await this.libererProtectionReconnue(j)
        }
        this.verifierContenus(j, courants)
        if (j.position === j.etapes.length) { j.termine = true; this.journal.ecrire(j) }
        this.installerCorrection(j, courants)
      })
    } finally { this.enCours = false; this.entretienUnique = undefined; this.cibles = undefined }
  }

  private async continuer(j: JournalCorrectionLocuteursWebDAV, courants: Map<string, Lecture>, reservations: Reservation[]): Promise<string> {
    this.verifierContenus(j, courants)
    while (j.position < j.etapes.length) {
      const etape = j.etapes[j.position]
      const cheminAnnexe = `verrous/${etape.chemin.slice(11, -5)}.lock.json`
      const droits = reservations.filter((r) => r.chemin === CHEMIN_VERROU_CORPUS
        || r.chemin === etape.chemin || r.chemin === cheminAnnexe)
      await this.verifierDroits(droits)
      j.verrouCorpus = await this.preuveCorpus(reservations[0])
      j.envoi = j.position; this.journal.ecrire(j)
      try { this.garantir(droits) }
      catch (e) { delete j.envoi; delete j.verrouCorpus; this.journal.ecrire(j); throw e }
      this.publicationIncertaine = true
      let etag: string | null
      try {
        etag = await this.deps.client.putTexte(etape.chemin, etape.apres, { ifMatch: courants.get(etape.chemin)!.etag })
      } catch (e) {
        if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
          delete j.envoi; delete j.verrouCorpus; this.journal.ecrire(j)
          this.publicationIncertaine = false
          throw e
        }
        throw new Error('Le résultat de la correction doit être vérifié avant de poursuivre. Aucun envoi ne sera répété automatiquement.')
      }
      const confirme = etag && !/^W\//i.test(etag) ? { contenu: etape.apres, etag } : await this.lire(etape.chemin)
      if (confirme.contenu !== etape.apres) throw new Error('La correction doit être vérifiée avant de poursuivre.')
      j.position++; delete j.envoi; delete j.verrouCorpus; this.journal.ecrire(j)
      this.publicationIncertaine = false
      courants.set(etape.chemin, confirme)
    }
    const resultat = await this.lireEtatCorrection(j)
    this.verifierContenus(j, resultat)
    j.termine = true; this.journal.ecrire(j)
    try { this.installerCorrection(j, resultat) }
    catch { throw new Error('La correction est enregistrée, mais la copie de cet ordinateur n’a pas pu être actualisée. Actualisez ou rouvrez le corpus avant de poursuivre.') }
    return j.locuteurId
  }

  private async preuveCorpus(reservation: Reservation): Promise<Lecture> {
    if (reservation.chemin !== CHEMIN_VERROU_CORPUS) throw new Error('La protection du corpus est indisponible.')
    const preuve = await this.lire(CHEMIN_VERROU_CORPUS)
    if (!reservation.etag || reservation.etag !== preuve.etag) throw new Error('La protection du corpus a changé. Aucun nouvel envoi autorisé.')
    return preuve
  }

  /** Une version sans changement métier empêche une ancienne requête d’aboutir après l’arrêt. */
  private async reconnaitreEnvoiRetenu(j: JournalCorrectionLocuteursWebDAV, reservations: Reservation[] = []): Promise<void> {
    const preuve = j.verrouCorpus!, verrou = await this.lire(CHEMIN_VERROU_CORPUS)
    if (verrou.etag !== preuve.etag || verrou.contenu !== preuve.contenu) throw new Error('La protection de cette correction a changé. Conservez son suivi pour l’assistance ; aucun nouvel envoi autorisé.')
    const etape = j.etapes[j.envoi!]
    const reconnaitre = (cible: Lecture): boolean => {
      if (cible.contenu === etape.apres) j.position++
      else if (j.neutralisation !== undefined && cible.contenu === etape.avant + '\n'.repeat(j.neutralisation)) etape.retoursReprise = j.neutralisation
      else return false
      delete j.envoi; delete j.neutralisation; this.journal.ecrire(j)
      this.publicationIncertaine = false
      return true
    }
    let cible = await this.lire(etape.chemin)
    if (reconnaitre(cible)) return
    if (cible.contenu !== contenuAvant(etape)) throw new Error('Le fichier a changé. La correction est suspendue sans écraser ces modifications.')
    let reservation: Reservation | undefined
    try {
      if (etape.chemin !== 'corpus.crp') {
        const droit = this.deps.verrouEntretien(etape.chemin.slice(11, -5))
        if (!reservations.some((r) => r.chemin === droit.chemin)) {
          const acquisition = await droit.provider.acquerir(droit.chemin)
          if (!acquisition.ok) throw new Error('Cet entretien est en cours de modification. Fermez son édition avant de vérifier la correction.')
          reservation = droit
          if (droit.chemin === etape.chemin) {
            cible = await this.lire(etape.chemin)
            if (reconnaitre(cible)) return
            if (cible.contenu !== contenuAvant(etape)) throw new Error('Le fichier a changé. Aucun contenu remplacé.')
          }
        }
      }
      if (j.neutralisation === undefined) {
        j.neutralisation = (etape.retoursReprise ?? 0) + 1
        if (Buffer.byteLength(etape.avant) + j.neutralisation === Buffer.byteLength(etape.apres)) j.neutralisation++
      }
      this.journal.ecrire(j)
      try { await this.deps.client.putTexte(etape.chemin, etape.avant + '\n'.repeat(j.neutralisation), { ifMatch: cible.etag }) }
      catch (e) { if (!(e instanceof ErreurHttp && e.statut === 412)) throw e }
      if (!reconnaitre(await this.lire(etape.chemin))) throw new Error('Le résultat reste à vérifier. Réessayez lorsque la connexion sera rétablie.')
    } finally { await reservation?.provider.liberer(reservation.chemin).catch(() => {}) }
  }

  private async libererProtectionReconnue(j: JournalCorrectionLocuteursWebDAV): Promise<void> {
    if (!j.verrouCorpus) return
    if (j.envoi !== undefined) throw new Error('Vérifiez le résultat avant de libérer la protection de cette correction.')
    try { await this.deps.client.supprimer(CHEMIN_VERROU_CORPUS, j.verrouCorpus.etag) }
    catch (e) { if (!(e instanceof ErreurHttp && [404, 412].includes(e.statut))) throw e }
    delete j.verrouCorpus; this.journal.ecrire(j)
    this.publicationIncertaine = false
  }

  private verifierContenus(j: JournalCorrectionLocuteursWebDAV, courants: Map<string, Lecture>): void {
    const attendus = new Map([['corpus.crp', j.corpusAvant], ...j.sources.filter((s) => s.avant !== s.apres)
      .map((s): [string, string] => [`entretiens/${s.id}.json`, s.avant])])
    for (const etape of j.etapes.slice(0, j.position)) attendus.set(etape.chemin, etape.apres)
    const suivante = j.etapes[j.position]
    if (suivante?.retoursReprise !== undefined) attendus.set(suivante.chemin, contenuAvant(suivante))
    if ([...attendus].some(([chemin, contenu]) => courants.get(chemin)?.contenu !== contenu)) {
      throw new Error('Le corpus ou un entretien a changé. La correction est suspendue sans écraser ces modifications ; conservez son suivi pour l’assistance.')
    }
  }

  private installerCorrection(j: JournalCorrectionLocuteursWebDAV, courants: Map<string, Lecture>): void {
    const chemins = new Set(['corpus.crp', ...j.sources.filter((s) => s.avant !== s.apres).map((s) => `entretiens/${s.id}.json`)])
    for (const [chemin, s] of courants) if (chemins.has(chemin)) this.deps.miroir(chemin, s.contenu, s.etag)
  }

  private async lireEtatCorrection(j: JournalCorrectionLocuteursWebDAV, corpus?: Lecture): Promise<Map<string, Lecture>> {
    const courants = new Map([['corpus.crp', corpus ?? await this.lire('corpus.crp')]])
    for (const source of j.sources) if (source.avant !== source.apres) {
      const chemin = `entretiens/${source.id}.json`
      courants.set(chemin, await this.lire(chemin))
    }
    return courants
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
    this.deps.verifierContexte(this.contexteSession)
    const lecture = premiere ?? await this.lire('corpus.crp'), corpus: unknown = JSON.parse(lecture.contenu)
    validerCorpusNatif(corpus); exigerAbsenceDissociationWebDAV(corpus)
    const ids = this.entretienUnique === undefined ? Object.keys(corpus.membership).sort() : [this.entretienUnique]
    if (ids.some((id) => !Object.hasOwn(corpus.membership, id))) throw new Error('Cet entretien ne fait plus partie du corpus.')
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

  private async avecProtections<T>(j: JournalCorrectionLocuteursWebDAV | null, action: (courants: Map<string, Lecture>, reservations: Reservation[], reserver: (ids: string[]) => Promise<void>) => Promise<T>): Promise<T> {
    const reservations: Reservation[] = []
    let courants: Map<string, Lecture> | undefined
    const prendre = async (r: Reservation) => {
      const debut = Date.now(), acquisition = await r.provider.acquerir(r.chemin)
      if (!acquisition.ok) throw new Error(`Un entretien ou le corpus est en cours de modification par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'}.`)
      r.echeance = debut + acquisition.dureeGarantieMs; r.etag = acquisition.etag; reservations.push(r)
    }
    const reserver = async (ids: string[]) => {
      this.cibles = ids
      this.verifierSession()
      for (const id of [...ids].sort()) {
        if (id === this.sessionCourante?.identite.entretienId) reservations.push(this.sessionCourante.reservation)
        else {
          const droit = this.deps.verrouEntretien(id)
          await prendre(droit)
          // Nextcloud peut changer la version du fichier lors de son verrouillage natif.
          if (courants && droit.chemin === `entretiens/${id}.json`) {
            const frais = await this.lire(droit.chemin)
            if (frais.contenu !== courants.get(droit.chemin)?.contenu) throw new Error('Cet entretien a changé. Actualisez avant de corriger ses locuteurs.')
            courants.set(droit.chemin, frais)
          }
        }
      }
    }
    try {
      this.verifierSession()
      await prendre(this.deps.verrouCorpus())
      if (j?.envoi !== undefined) {
        j.verrouCorpus = await this.preuveCorpus(reservations[0]); this.journal.ecrire(j)
        this.publicationIncertaine = true
      }
      const corpus = await this.lire('corpus.crp')
      if (j) {
        await reserver(j.sources.filter((s) => s.avant !== s.apres).map((s) => s.id))
        courants = await this.lireEtatCorrection(j, corpus)
      } else {
        const lecture = await this.lireEnsemble(corpus)
        courants = new Map([['corpus.crp', lecture.lecture], ...[...lecture.sources].map(([id, s]): [string, Lecture] => [`entretiens/${id}.json`, s])])
      }
      return await action(courants, reservations, reserver)
    } finally {
      for (const r of reservations.reverse()) {
        if (!r.empruntee && (r.chemin !== CHEMIN_VERROU_CORPUS || !this.publicationIncertaine)) await r.provider.liberer(r.chemin).catch(() => {})
      }
    }
  }

  private verifierSession(): void {
    this.deps.verifierContexte(this.contexteSession, this.cibles)
    this.sessionCourante?.verifier()
    if (this.deps.sessionsLocales().some((id) => this.cibles?.includes(id) && id !== this.contexteSession?.entretienId)) {
      throw new Error('Enregistrez et fermez les entretiens concernés avant de corriger leurs locuteurs.')
    }
  }

  private async verifierDroits(reservations: Reservation[]): Promise<void> {
    this.verifierSession()
    for (const r of reservations) {
      const debut = Date.now(), preuve = await (r.battre ? r.battre() : r.provider.battre(r.chemin))
      if (!preuve.ok) throw new Error('La protection d’un entretien a été perdue. La correction reste à reprendre.')
      r.echeance = debut + preuve.dureeGarantieMs; r.etag = preuve.etag
    }
    this.garantir(reservations)
  }

  private garantir(reservations: Reservation[]): void {
    this.verifierSession()
    if (reservations.some((r) => !r.echeance || Date.now() + margePublication >= r.echeance)) throw new Error('La protection des entretiens va expirer. Aucun nouvel envoi n’est autorisé.')
  }
}
