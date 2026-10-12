import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { PlanSuppressionEntretien } from '../transactionsFichiers'
import {
  MAX_ACTIONS_JOURNAL_HISTORIQUE,
  MAX_ACTIONS_PUBLICATION,
} from './limitesPublication'
import {
  verifierCheminGitLab,
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
} from './bailGitLab'

const VERSION_JOURNAL = 5
const VERSION_JOURNAL_BORNE_ACTIONS = 4
const VERSION_JOURNAL_DEUX_DROITS = 3
const VERSION_JOURNAL_A_UN_DROIT = 2
const VERSION_JOURNAL_SANS_NATURE = 1
const TAILLE_MAX_ENTREE = 3 * 1024 * 1024
const SHA_COMMIT = /^[a-f0-9]{40,64}$/
const SHA256 = /^[a-f0-9]{64}$/
const CANDIDAT = /^[a-f0-9]{64}\.bin$/
const IDENT_OPERATION = /^[A-Za-z0-9._:-]{1,120}$/
const PREFIXE_VERROUS = '.sonal/verrous'

export type EtatJournalPublication = 'prepare' | 'indetermine' | 'confirme-a-installer'

/** Ce qu'une publication transportait. La nature décide de sa reprise,
 *  jamais la forme de sa première action. */
export type NaturePublicationGitLab =
  | 'session-entretien'
  | 'transaction-entretien'
  | 'transaction-corpus'
  | 'suppression-entretien'

const NATURES: readonly NaturePublicationGitLab[] = [
  'session-entretien',
  'transaction-entretien',
  'transaction-corpus',
  'suppression-entretien',
]

/** Une entrée dont la nature n'a pas pu être établie avec certitude : elle
 *  reste récupérable, bloque sa ressource, et n'est jamais rejouée. */
export type NatureEntreeJournal = NaturePublicationGitLab | 'inconnue'

/** Une entrée d'avant les natures : elle porte un seul droit, au format plat. */
type EntreeAncienneJournal = Omit<Partial<EntreeJournalPublication>, 'droits'>
  & { resourceHash?: string }

type ActionJournalGitLab = Omit<ActionCommitGitLab, 'content'> & {
  contentSha256?: string
  contentOctets?: number
}

/** Un droit porté par la publication : sa ressource, la génération de bail qui
 *  le protège et la garde que la transition va remplacer. */
export interface DroitJournalGitLab {
  resourceHash: string
  generation: string
  leaseCommitId: string
}

/** Ce qu'une suppression doit pouvoir finir, même après un arrêt : le chemin
 *  d'archives choisi, l'empreinte du JSON déplacé et le plan local complet. */
export interface SuppressionJournalGitLab {
  entretienId: string
  cheminSource: string
  cheminArchive: string
  empreinteArchive: string
  octetsArchive: number
  planLocal: PlanSuppressionEntretien
  /** Renseigné quand le retrait distant est confirmé et qu'il reste à installer. */
  commitId?: string
}

/** Ce que l'appelant fournit au journal : la version, la destination et
 *  l'horodatage sont ajoutés par le journal lui-même. */
export type EntreeJournalNue = Omit<
  EntreeJournalPublication,
  'version' | 'destinationId' | 'ecritLe' | 'actions' | 'candidat' | 'nature'
> & {
  nature: NaturePublicationGitLab
  actions: ActionCommitGitLab[]
}

export interface EntreeJournalPublication {
  version: 5
  destinationId: string
  operationId: string
  nature: NatureEntreeJournal
  branche: string
  /** Droits des ressources, dans l'ordre canonique d'acquisition. */
  droits: DroitJournalGitLab[]
  etat: EtatJournalPublication
  ecritLe: string
  actions: ActionJournalGitLab[]
  candidat: string
  /** Présent pour une suppression : ce que la reprise locale devra appliquer. */
  suppression?: SuppressionJournalGitLab
}

/** La ressource canonique de `corpus.json`, seule à même de reconnaître une
 *  ancienne entrée de publication de corpus. */
export interface RessourceCorpusJournal {
  chemin: string
  resourceHash: string
}

export type ResultatReconciliationGitLab =
  | { statut: 'confirme'; commitId: string }
  | { statut: 'absent' }
  | { statut: 'indetermine' }

export class JournalPublicationGitLab {
  private readonly operations: string
  private readonly candidates: string

  constructor(
    private readonly destinationId: string,
    repertoire: string,
    private readonly maintenant: () => Date = () => new Date(),
    /** Facultatif tant qu'aucune ancienne entrée n'a à être classée. */
    private readonly ressourceCorpus?: RessourceCorpusJournal,
  ) {
    if (!destinationId.trim()) throw new Error('Destination de journal GitLab manquante.')
    this.operations = join(repertoire, 'operations')
    this.candidates = join(repertoire, 'candidates')
    mkdirSync(this.operations, { recursive: true, mode: 0o700 })
    mkdirSync(this.candidates, { recursive: true, mode: 0o700 })
    chmodSync(this.operations, 0o700)
    chmodSync(this.candidates, 0o700)
  }

  /** Entrées qui écrivent `corpus.json` et sont encore journalisées : elles
   *  bloquent toute nouvelle transaction sur le corpus, et toute nouvelle
   *  suppression, tant qu'elles ne sont pas réconciliées. Une entrée de nature
   *  inconnue bloque aussi. */
  transactionsCorpusJournalisees(): EntreeJournalPublication[] {
    return this.lister().filter(
      (entree) => entree.nature === 'transaction-corpus'
        || entree.nature === 'suppression-entretien'
        || entree.nature === 'inconnue',
    )
  }

  /** Suppressions confirmées dont l'archivage local reste à finir. */
  suppressionsAInstaller(): EntreeJournalPublication[] {
    return this.lister().filter(
      (entree) => entree.nature === 'suppression-entretien'
        && entree.etat === 'confirme-a-installer'
        && Boolean(entree.suppression),
    )
  }

  /** Une suppression déjà journalisée pour cet entretien : elle interdit d'en
   *  commencer une autre, et force la reprise de celle-là. */
  suppressionDe(entretienId: string): EntreeJournalPublication | null {
    return this.lister().find(
      (entree) => entree.nature === 'suppression-entretien'
        && entree.suppression?.entretienId === entretienId,
    ) ?? null
  }

  preparer(entree: EntreeJournalNue): void {
    if (this.lireSiPresent(entree.operationId)) {
      throw new Error('Une opération GitLab de ce nom est déjà journalisée.')
    }
    if (!NATURES.includes(entree.nature)) {
      throw new Error('Nature de publication GitLab inconnue.')
    }
    const actions = entree.actions
    validerActions(actions)
    if (entree.droits.length === 0 || entree.droits.length > MAX_ACTIONS_PUBLICATION) {
      throw new Error('Droits de publication GitLab invalides.')
    }
    if (new Set(entree.droits.map((droit) => droit.resourceHash)).size
      !== entree.droits.length) {
      throw new Error('Droits de publication GitLab invalides.')
    }
    if (entree.suppression) validerSuppression(entree.suppression, actions)
    const candidat = this.nomCandidat(entree.operationId)
    this.ecrireCandidate(candidat, actions)
    const journal: EntreeJournalPublication = {
      ...entree,
      version: VERSION_JOURNAL,
      destinationId: this.destinationId,
      ecritLe: this.maintenant().toISOString(),
      actions: actions.map((action) => metadonneeAction(action, entree.suppression)),
      candidat,
    }
    try {
      this.ecrire(journal)
    } catch (erreur) {
      this.supprimerFichier(this.cheminCandidat(candidat))
      throw erreur
    }
  }

  chargerActions(entree: EntreeJournalPublication): ActionCommitGitLab[] {
    const fichier = this.cheminCandidat(entree.candidat)
    if (!existsSync(fichier)) throw new Error('Candidat de publication GitLab absent.')
    if (Buffer.byteLength(readFileSync(fichier), 'utf8') > TAILLE_MAX_ENTREE) {
      throw new Error('Candidat de publication GitLab trop volumineux.')
    }
    let brut: unknown
    try {
      brut = JSON.parse(readFileSync(fichier, 'utf8'))
    } catch {
      throw new Error('Candidat de publication GitLab illisible.')
    }
    if (!Array.isArray(brut)) throw new Error('Candidat de publication GitLab invalide.')
    const actions = brut as ActionCommitGitLab[]
    validerActions(actions)
    if (actions.length !== entree.actions.length) {
      throw new Error('Candidat de publication GitLab incomplet.')
    }
    actions.forEach((action, index) => {
      const metadata = entree.actions[index]
      if (action.action !== metadata.action || action.file_path !== metadata.file_path) {
        throw new Error('Candidat de publication GitLab incohérent.')
      }
      // Un déplacement ne transporte aucun contenu : son empreinte attendue
      // reste celle du journal, seule trace de ce que l'archive doit contenir.
      if (action.action === 'move') return
      if (
        metadata.contentSha256 &&
        (createHash('sha256').update(action.content ?? '').digest('hex') !== metadata.contentSha256 ||
          Buffer.byteLength(action.content ?? '', 'utf8') !== metadata.contentOctets)
      ) {
        throw new Error('Empreinte de publication GitLab incohérente.')
      }
    })
    return actions
  }

  marquerIndetermine(operationId: string): void {
    const entree = this.lire(operationId)
    this.ecrire({ ...entree, etat: 'indetermine' })
  }

  /** Le retrait distant est confirmé : il reste l'archivage local à faire.
   *  L'entrée n'est retirée qu'après cet archivage. */
  marquerConfirmeAInstaller(operationId: string, commitId: string): void {
    const entree = this.lire(operationId)
    if (entree.nature !== 'suppression-entretien' || !entree.suppression) {
      throw new Error('Opération GitLab sans suppression à installer.')
    }
    this.ecrire({
      ...entree,
      etat: 'confirme-a-installer',
      suppression: { ...entree.suppression, commitId },
    })
  }

  supprimer(operationId: string): void {
    const entree = this.lireSiPresent(operationId)
    this.supprimerFichier(this.chemin(operationId))
    if (entree) this.supprimerFichier(this.cheminCandidat(entree.candidat))
  }

  lire(operationId: string): EntreeJournalPublication {
    const fichier = this.chemin(operationId)
    if (!existsSync(fichier)) throw new Error('Opération GitLab absente du journal.')
    return this.lireFichier(fichier)
  }

  lireSiPresent(operationId: string): EntreeJournalPublication | null {
    return existsSync(this.chemin(operationId)) ? this.lire(operationId) : null
  }

  lister(): EntreeJournalPublication[] {
    return readdirSync(this.operations, { withFileTypes: true })
      .filter((entree) => entree.isFile() && entree.name.endsWith('.json'))
      .map((entree) => this.lireFichier(join(this.operations, entree.name)))
  }

  private ecrire(entree: EntreeJournalPublication): void {
    validerEntree(entree, this.destinationId, entree.operationId)
    this.ecrireAtomique(this.chemin(entree.operationId), JSON.stringify(entree, null, 2))
  }

  private ecrireCandidate(nom: string, actions: ActionCommitGitLab[]): void {
    this.ecrireAtomique(this.cheminCandidat(nom), JSON.stringify(actions))
  }

  private ecrireAtomique(fichier: string, contenu: string): void {
    const temporaire = `${fichier}.tmp`
    const descripteur = openSync(temporaire, 'w', 0o600)
    try {
      writeFileSync(descripteur, contenu, 'utf8')
      fsyncSync(descripteur)
    } finally {
      closeSync(descripteur)
    }
    renameSync(temporaire, fichier)
    chmodSync(fichier, 0o600)
    try {
      const dossier = openSync(dirname(fichier), 'r')
      try {
        fsyncSync(dossier)
      } finally {
        closeSync(dossier)
      }
    } catch {
      /* Certains systèmes refusent fsync d'un dossier ; le fichier reste protégé. */
    }
  }

  private lireFichier(fichier: string): EntreeJournalPublication {
    const contenu = readFileSync(fichier, 'utf8')
    if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX_ENTREE) {
      throw new Error('Entrée de journal GitLab trop volumineuse.')
    }
    let brut: unknown
    try {
      brut = JSON.parse(contenu)
    } catch {
      throw new Error('Journal GitLab corrompu.')
    }
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
      throw new Error('Entrée de journal GitLab invalide.')
    }
    const operationId = (brut as Partial<EntreeJournalPublication>).operationId
    if (typeof operationId !== 'string') throw new Error('Entrée de journal GitLab invalide.')
    return validerEntree(brut, this.destinationId, operationId, this.ressourceCorpus)
  }

  private chemin(operationId: string): string {
    if (!IDENT_OPERATION.test(operationId)) throw new Error('Identifiant d’opération GitLab invalide.')
    return join(this.operations, `${createHash('sha256').update(operationId).digest('hex')}.json`)
  }

  private cheminCandidat(nom: string): string {
    if (!CANDIDAT.test(nom)) {
      throw new Error('Candidat de publication GitLab invalide.')
    }
    return join(this.candidates, nom)
  }

  private nomCandidat(operationId: string): string {
    if (!IDENT_OPERATION.test(operationId)) throw new Error('Identifiant d’opération GitLab invalide.')
    return `${createHash('sha256').update(operationId).digest('hex')}.bin`
  }

  private supprimerFichier(fichier: string): void {
    if (existsSync(fichier)) unlinkSync(fichier)
  }
}

export class ReconciliateurPublicationGitLab {
  constructor(
    private readonly depot: DepotCommitsGitLab,
    private readonly journal: JournalPublicationGitLab,
  ) {}

  async reconcilier(entree: EntreeJournalPublication): Promise<ResultatReconciliationGitLab> {
    let commits: Array<{ id: string; title: string }>
    try {
      commits = await this.depot.rechercherCommits(entree.branche, entree.operationId)
    } catch {
      return { statut: 'indetermine' }
    }
    const exacts = commits.filter((commit) => commit.title === `Sonal ${entree.operationId}`)
    if (exacts.length === 0) return { statut: 'absent' }
    if (exacts.length !== 1 || !SHA_COMMIT.test(exacts[0].id)) {
      return { statut: 'indetermine' }
    }
    let actions: ActionCommitGitLab[]
    try {
      actions = this.journal.chargerActions(entree)
    } catch {
      return { statut: 'indetermine' }
    }
    try {
      for (const action of entree.actions) {
        const compiled = actions.find(
          (candidat) => candidat.action === action.action
            && candidat.file_path === action.file_path,
        )
        if (action.action === 'delete') {
          if (await this.depot.lireFichier(action.file_path, exacts[0].id)) {
            return { statut: 'indetermine' }
          }
          continue
        }
        if (action.action === 'chmod') {
          const garde = await this.depot.lireGardeFichier(action.file_path, exacts[0].id)
          if (
            !garde ||
            garde.commitId !== compiled?.last_commit_id ||
            garde.executable !== compiled.execute_filemode
          ) {
            return { statut: 'indetermine' }
          }
          continue
        }
        const observe = await this.depot.lireFichier(action.file_path, exacts[0].id)
        if (action.action === 'move') {
          const verdict = await this.verifierDeplacement(
            action,
            compiled,
            observe,
            exacts[0].id,
            entree.suppression,
          )
          if (verdict) return { statut: 'indetermine' }
          continue
        }
        if (!observe || observe.contenu !== compiled?.content) {
          return { statut: 'indetermine' }
        }
      }
    } catch {
      return { statut: 'indetermine' }
    }
    return { statut: 'confirme', commitId: exacts[0].id }
  }

  /** Un déplacement GitLab ne transporte aucun `content` : comparer la
   *  destination à `action.content` laisserait toute suppression indéterminée.
   *  Ce qui est vérifié ici, c'est l'absence de l'ancien chemin, la présence
   *  de l'archive, et l'empreinte du JSON que la préparation avait lu. */
  private async verifierDeplacement(
    action: { file_path: string; previous_path?: string; contentSha256?: string },
    compiled: ActionCommitGitLab | undefined,
    observe: { contenu: string } | null,
    commitId: string,
    suppression?: SuppressionJournalGitLab,
  ): Promise<boolean> {
    if (await this.depot.lireFichier(action.previous_path as string, commitId)) return true
    if (!observe) return true
    if (suppression && action.previous_path === suppression.cheminSource) {
      if (suppression.empreinteArchive !== action.contentSha256) return true
      if (createHash('sha256').update(observe.contenu).digest('hex')
        !== suppression.empreinteArchive) {
        return true
      }
      if (Buffer.byteLength(observe.contenu, 'utf8') !== suppression.octetsArchive) return true
      return false
    }
    if (action.contentSha256) {
      return createHash('sha256').update(observe.contenu).digest('hex')
        !== action.contentSha256
    }
    // Sans empreinte journalisée, la présence de l'archive et le départ de la
    // source suffisent : c'est déjà plus qu'un déplacement non vérifiable.
    return !compiled || compiled.action !== 'move'
  }
}

function metadonneeAction(
  action: ActionCommitGitLab,
  suppression?: SuppressionJournalGitLab,
): ActionJournalGitLab {
  if (action.action === 'move' && suppression
    && action.previous_path === suppression.cheminSource) {
    // L'archive n'est vérifiable que par son contenu : l'empreinte du JSON
    // déplacé est portée par l'action, puis relue à la réconciliation.
    return {
      ...action,
      contentSha256: suppression.empreinteArchive,
      contentOctets: suppression.octetsArchive,
    }
  }
  if (action.action === 'create' || action.action === 'update') {
    const { content, ...metadata } = action
    return {
      ...metadata,
      contentSha256: createHash('sha256').update(content ?? '').digest('hex'),
      contentOctets: Buffer.byteLength(content ?? '', 'utf8'),
    }
  }
  return { ...action }
}

/** Une suppression journalisée doit pouvoir finir seule : son archive est
 *  choisie, son JSON est identifié, et son plan local est complet. */
function validerSuppression(
  suppression: SuppressionJournalGitLab,
  actions: ReadonlyArray<{ action?: string; file_path: string; previous_path?: string }>,
): void {
  const deplacement = actions.find(
    (action) => action.action === 'move' && action.previous_path === suppression.cheminSource,
  )
  if (!deplacement || deplacement.file_path !== suppression.cheminArchive) {
    throw new Error('Journal de suppression GitLab incohérent.')
  }
  if (
    !suppression.entretienId ||
    !SHA256.test(suppression.empreinteArchive) ||
    !Number.isSafeInteger(suppression.octetsArchive)
    || (suppression.octetsArchive as number) < 0
    || !suppression.planLocal
    || suppression.planLocal.operation !== 'suppression'
    || suppression.planLocal.id !== suppression.entretienId
    || !Array.isArray(suppression.planLocal.deplacements)
  ) {
    throw new Error('Journal de suppression GitLab invalide.')
  }
}

function validerEntree(
  valeur: unknown,
  destinationId: string,
  operationIdAttendu: string,
  ressourceCorpus?: RessourceCorpusJournal,
): EntreeJournalPublication {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  const brut = valeur as Record<string, unknown>
  const entree = brut as unknown as Partial<EntreeJournalPublication>
  const version = brut.version
  const limiteActions = version === VERSION_JOURNAL || version === VERSION_JOURNAL_BORNE_ACTIONS
    ? MAX_ACTIONS_PUBLICATION
    : MAX_ACTIONS_JOURNAL_HISTORIQUE
  if (
    (version !== VERSION_JOURNAL
      && version !== VERSION_JOURNAL_BORNE_ACTIONS
      && version !== VERSION_JOURNAL_DEUX_DROITS
      && version !== VERSION_JOURNAL_A_UN_DROIT
      && version !== VERSION_JOURNAL_SANS_NATURE) ||
    entree.destinationId !== destinationId ||
    entree.operationId !== operationIdAttendu ||
    !IDENT_OPERATION.test(entree.operationId) ||
    typeof entree.branche !== 'string' ||
    !entree.branche.trim() ||
    (entree.etat !== 'prepare'
      && entree.etat !== 'indetermine'
      && entree.etat !== 'confirme-a-installer') ||
    typeof entree.ecritLe !== 'string' ||
    !Number.isFinite(Date.parse(entree.ecritLe)) ||
    !Array.isArray(entree.actions) ||
    entree.actions.length === 0 ||
    entree.actions.length > limiteActions ||
    typeof entree.candidat !== 'string' ||
    !CANDIDAT.test(entree.candidat)
  ) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  for (const action of entree.actions) {
    if ('content' in action) throw new Error('Le journal ne doit pas contenir le contenu.')
    validerActionJournal(action)
  }
  const droits = projeterDroits(brut, version)
  const nature = version === VERSION_JOURNAL_SANS_NATURE
    ? classerAncienne(
      { ...entree, resourceHash: droits[0].resourceHash } as EntreeAncienneJournal,
      ressourceCorpus,
    )
    : (brut.nature as NatureEntreeJournal)
  if (nature !== 'inconnue' && !NATURES.includes(nature as NaturePublicationGitLab)) {
    throw new Error('Nature de publication GitLab inconnue.')
  }
  if (
    nature === 'suppression-entretien' &&
    (version === VERSION_JOURNAL || version === VERSION_JOURNAL_BORNE_ACTIONS || version === VERSION_JOURNAL_DEUX_DROITS)
  ) {
    if (!entree.suppression) throw new Error('Journal de suppression GitLab incomplet.')
    validerSuppression(entree.suppression, entree.actions)
  }
  return {
    ...entree,
    version: VERSION_JOURNAL,
    nature,
    droits,
  } as EntreeJournalPublication
}

/** Les versions à plusieurs droits les portent déjà sous forme de liste. */
function projeterDroits(
  brut: Record<string, unknown>,
  version: unknown,
): DroitJournalGitLab[] {
  if (version === VERSION_JOURNAL || version === VERSION_JOURNAL_BORNE_ACTIONS || version === VERSION_JOURNAL_DEUX_DROITS) {
    const droits = brut.droits
    const limite = version === VERSION_JOURNAL ? MAX_ACTIONS_PUBLICATION : 2
    if (!Array.isArray(droits) || droits.length === 0 || droits.length > limite) {
      throw new Error('Entrée de journal GitLab invalide.')
    }
    return droits.map((droit) => verifierDroitJournal(droit))
  }
  return [verifierDroitJournal(brut)]
}

function verifierDroitJournal(valeur: unknown): DroitJournalGitLab {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  const { resourceHash, generation, leaseCommitId } = valeur as Partial<DroitJournalGitLab>
  if (
    typeof resourceHash !== 'string' || !SHA256.test(resourceHash) ||
    typeof generation !== 'string' || !generation ||
    typeof leaseCommitId !== 'string' || !SHA_COMMIT.test(leaseCommitId)
  ) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  return { resourceHash, generation, leaseCommitId }
}

/** Reconnaît une entrée écrite avant l'existence des natures.
 *
 *  Une publication de corpus ne peut être déduite de la forme de sa première
 *  action : seule l'égalité exacte avec la ressource canonique de
 *  `corpus.json`, conjointe à des actions toutes compatibles avec une
 *  transaction de corpus, autorise cette lecture. Le reste reste « inconnue »,
 *  donc récupérable et bloquant. */
function classerAncienne(
  entree: EntreeAncienneJournal,
  ressourceCorpus?: RessourceCorpusJournal,
): NatureEntreeJournal {
  if (!ressourceCorpus) return 'inconnue'
  if (entree.resourceHash !== ressourceCorpus.resourceHash) return 'session-entretien'
  const metadonnees = entree.actions ?? []
  const metier = metadonnees.filter(
    (action) => !action.file_path.startsWith(`${PREFIXE_VERROUS}/`),
  )
  if (metier.length !== 1) return 'inconnue'
  const action = metier[0]
  if (action.file_path !== ressourceCorpus.chemin || action.action !== 'update') {
    return 'inconnue'
  }
  return 'transaction-corpus'
}

function validerActions(actions: ActionCommitGitLab[]): void {
  if (actions.length === 0 || actions.length > MAX_ACTIONS_PUBLICATION) {
    throw new Error('Actions de publication GitLab invalides.')
  }
  for (const action of actions) validerAction(action)
}

function validerActionJournal(valeur: unknown): asserts valeur is ActionJournalGitLab {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Action de journal GitLab invalide.')
  }
  const action = valeur as Partial<ActionJournalGitLab>
  if (!['create', 'update', 'delete', 'move', 'chmod'].includes(action.action ?? '')) {
    throw new Error('Action de journal GitLab invalide.')
  }
  verifierCheminGitLab(action.file_path ?? '')
  if (action.action === 'create' || action.action === 'update') {
    if (!SHA256.test(action.contentSha256 ?? '') || !Number.isSafeInteger(action.contentOctets)) {
      throw new Error('Action de journal GitLab invalide.')
    }
  } else if (!SHA_COMMIT.test(action.last_commit_id ?? '')) {
    throw new Error('Action de journal GitLab invalide.')
  }
  if (action.action === 'chmod' && typeof action.execute_filemode !== 'boolean') {
    throw new Error('Action de journal GitLab invalide.')
  }
  if (action.action === 'move') {
    verifierCheminGitLab(action.previous_path ?? '')
    if (action.previous_path === action.file_path) {
      throw new Error('Action de journal GitLab invalide.')
    }
    if (action.contentSha256 !== undefined && !SHA256.test(action.contentSha256)) {
      throw new Error('Action de journal GitLab invalide.')
    }
  }
}

function validerAction(valeur: unknown): asserts valeur is ActionCommitGitLab {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Action de publication GitLab invalide.')
  }
  const action = valeur as Partial<ActionCommitGitLab>
  if (!['create', 'update', 'delete', 'move', 'chmod'].includes(action.action ?? '')) {
    throw new Error('Action de publication GitLab invalide.')
  }
  verifierCheminGitLab(action.file_path ?? '')
  if (action.action === 'create' || action.action === 'update') {
    if (typeof action.content !== 'string') {
      throw new Error('Action de publication GitLab invalide.')
    }
  } else if (!SHA_COMMIT.test(action.last_commit_id ?? '')) {
    throw new Error('Action de publication GitLab invalide.')
  }
  if (action.action === 'chmod' && typeof action.execute_filemode !== 'boolean') {
    throw new Error('Action de publication GitLab invalide.')
  }
  if (action.action === 'move') {
    verifierCheminGitLab(action.previous_path ?? '')
    if (action.previous_path === action.file_path) {
      throw new Error('Action de journal GitLab invalide.')
    }
  }
}
