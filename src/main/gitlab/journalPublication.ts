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
import {
  verifierCheminGitLab,
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
} from './bailGitLab'

const VERSION_JOURNAL = 2
const VERSION_JOURNAL_ANCIENNE = 1
const TAILLE_MAX_ENTREE = 3 * 1024 * 1024
const SHA_COMMIT = /^[a-f0-9]{40,64}$/
const SHA256 = /^[a-f0-9]{64}$/
const CANDIDAT = /^[a-f0-9]{64}\.bin$/
const IDENT_OPERATION = /^[A-Za-z0-9._:-]{1,120}$/
const PREFIXE_VERROUS = '.sonal/verrous'

export type EtatJournalPublication = 'prepare' | 'indetermine'

/** Ce qu'une publication transportait : une session d'entretien, ou une
 *  transaction de corpus (définitions, création, import). Les deux se
 *  réconcilient différemment, jamais par la forme de leur première action. */
export type NaturePublicationGitLab = 'session-entretien' | 'transaction-corpus'

const NATURES: readonly NaturePublicationGitLab[] = ['session-entretien', 'transaction-corpus']

/** Une entrée dont la nature n'a pas pu être établie avec certitude : elle
 *  reste récupérable, bloque sa ressource, et n'est jamais rejouée. */
export type NatureEntreeJournal = NaturePublicationGitLab | 'inconnue'

type ActionJournalGitLab = Omit<ActionCommitGitLab, 'content'> & {
  contentSha256?: string
  contentOctets?: number
}

/** Ce que l'appelant fournit au journal : la version, la destination et
 *  l'horodatage sont ajoutés par le journal lui-même. */
type EntreeJournalNue = Omit<
  EntreeJournalPublication,
  'version' | 'destinationId' | 'ecritLe' | 'actions' | 'candidat' | 'nature'
> & {
  nature: NaturePublicationGitLab
  actions: ActionCommitGitLab[]
}

export interface EntreeJournalPublication {
  version: 2
  destinationId: string
  operationId: string
  nature: NatureEntreeJournal
  branche: string
  resourceHash: string
  generation: string
  leaseCommitId: string
  etat: EtatJournalPublication
  ecritLe: string
  actions: ActionJournalGitLab[]
  candidat: string
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

  /** Entrées de publication de corpus encore journalisées : elles bloquent
   *  toute nouvelle transaction sur `corpus.json` tant qu'elles ne sont pas
   *  réconciliées. Une entrée de nature inconnue bloque aussi. */
  transactionsCorpusJournalisees(): EntreeJournalPublication[] {
    return this.lister().filter(
      (entree) => entree.nature === 'transaction-corpus' || entree.nature === 'inconnue',
    )
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
    const candidat = this.nomCandidat(entree.operationId)
    this.ecrireCandidate(candidat, actions)
    const journal: EntreeJournalPublication = {
      ...entree,
      version: VERSION_JOURNAL,
      destinationId: this.destinationId,
      ecritLe: this.maintenant().toISOString(),
      actions: actions.map(metadonneeAction),
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
      for (const action of actions) {
        if (action.action === 'delete') {
          if (await this.depot.lireFichier(action.file_path, exacts[0].id)) {
            return { statut: 'indetermine' }
          }
          continue
        }
        const observe = await this.depot.lireFichier(action.file_path, exacts[0].id)
        if (!observe || observe.contenu !== action.content) {
          return { statut: 'indetermine' }
        }
        if (action.action === 'move' && await this.depot.lireFichier(
          action.previous_path as string,
          exacts[0].id,
        )) {
          return { statut: 'indetermine' }
        }
      }
    } catch {
      return { statut: 'indetermine' }
    }
    return { statut: 'confirme', commitId: exacts[0].id }
  }
}

function metadonneeAction(action: ActionCommitGitLab): ActionJournalGitLab {
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

function validerEntree(
  valeur: unknown,
  destinationId: string,
  operationIdAttendu: string,
  ressourceCorpus?: RessourceCorpusJournal,
): EntreeJournalPublication {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  const entree = valeur as Partial<EntreeJournalPublication>
  const version = (valeur as { version?: unknown }).version
  if (
    (version !== VERSION_JOURNAL && version !== VERSION_JOURNAL_ANCIENNE) ||
    entree.destinationId !== destinationId ||
    entree.operationId !== operationIdAttendu ||
    !IDENT_OPERATION.test(entree.operationId) ||
    typeof entree.branche !== 'string' ||
    !entree.branche.trim() ||
    !SHA256.test(entree.resourceHash ?? '') ||
    typeof entree.generation !== 'string' ||
    !entree.generation ||
    !SHA_COMMIT.test(entree.leaseCommitId ?? '') ||
    (entree.etat !== 'prepare' && entree.etat !== 'indetermine') ||
    typeof entree.ecritLe !== 'string' ||
    !Number.isFinite(Date.parse(entree.ecritLe)) ||
    !Array.isArray(entree.actions) ||
    entree.actions.length === 0 ||
    entree.actions.length > 101 ||
    typeof entree.candidat !== 'string' ||
    !CANDIDAT.test(entree.candidat)
  ) {
    throw new Error('Entrée de journal GitLab invalide.')
  }
  for (const action of entree.actions) {
    if ('content' in action) throw new Error('Le journal ne doit pas contenir le contenu.')
    validerActionJournal(action)
  }
  const nature = version === VERSION_JOURNAL_ANCIENNE
    ? classerAncienne(entree, ressourceCorpus)
    : entree.nature
  if (nature !== 'inconnue' && !NATURES.includes(nature as NaturePublicationGitLab)) {
    throw new Error('Nature de publication GitLab inconnue.')
  }
  return { ...entree, version: VERSION_JOURNAL, nature } as EntreeJournalPublication
}

/** Reconnaît une entrée écrite avant l'existence des natures.
 *
 *  Une publication de corpus ne peut être déduite de la forme de sa première
 *  action : seule l'égalité exacte avec la ressource canonique de
 *  `corpus.json`, conjointe à des actions toutes compatibles avec une
 *  transaction de corpus, autorise cette lecture. Le reste reste « inconnue »,
 *  donc récupérable et bloquant. */
function classerAncienne(
  entree: Partial<EntreeJournalPublication>,
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
  if (actions.length === 0 || actions.length > 101) {
    throw new Error('Actions de publication GitLab invalides.')
  }
  for (const action of actions) validerAction(action)
}

function validerActionJournal(valeur: unknown): asserts valeur is ActionJournalGitLab {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Action de journal GitLab invalide.')
  }
  const action = valeur as Partial<ActionJournalGitLab>
  if (!['create', 'update', 'delete', 'move'].includes(action.action ?? '')) {
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
  if (action.action === 'move') {
    verifierCheminGitLab(action.previous_path ?? '')
    if (action.previous_path === action.file_path) {
      throw new Error('Action de journal GitLab invalide.')
    }
  }
}

function validerAction(valeur: unknown): asserts valeur is ActionCommitGitLab {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new Error('Action de journal GitLab invalide.')
  }
  const action = valeur as Partial<ActionCommitGitLab>
  if (!['create', 'update', 'delete', 'move'].includes(action.action ?? '')) {
    throw new Error('Action de journal GitLab invalide.')
  }
  verifierCheminGitLab(action.file_path ?? '')
  if (action.action === 'create' || action.action === 'update') {
    if (typeof action.content !== 'string') throw new Error('Action de journal GitLab invalide.')
  } else if (!SHA_COMMIT.test(action.last_commit_id ?? '')) {
    throw new Error('Action de journal GitLab invalide.')
  }
  if (action.action === 'move') {
    verifierCheminGitLab(action.previous_path ?? '')
    if (action.previous_path === action.file_path) {
      throw new Error('Action de journal GitLab invalide.')
    }
  }
}
