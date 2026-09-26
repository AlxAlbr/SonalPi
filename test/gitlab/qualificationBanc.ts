/**
 *  Harnais du banc GitLab réel, partagé par les qualifications.
 *
 *  Il instancie la pile de l'application — client, dépôt, bail, journal, store
 *  et transactions — contre l'instance locale, et expose les quelques
 *  lectures directes dont une qualification a besoin pour compter ses commits.
 *  Le miroir est toujours en retard : il ne doit rien prouver.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import {
  BailGitLab,
  DepotCommitsGitLabClient,
  type DepotCommitsGitLab,
  cleRessourceBailGitLab,
  cheminBailRessourceGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ClientGitLab, ErreurGitLab } from '../../src/main/gitlab/client'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { verifierContenusReferencesDefinitions } from '../../src/main/gitlab/referencesDefinitions'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import { FORMAT_VERSION } from '../../src/shared/format'

export const configuration = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''),
  token1: process.env.GITLAB_USER1_TOKEN,
  token2: process.env.GITLAB_USER2_TOKEN,
  projetId: process.env.GITLAB_LFS_PROJECT_ID,
}

export const configurationPresente =
  Object.values(configuration).every((valeur) => Boolean(valeur))

/** Préfixe des racines déposées : deux qualifications ne se croisent jamais. */
let prefixe = 'q'
let execution: string | null = null

export function definirPrefixeBanc(valeur: string): void {
  prefixe = valeur
  execution = null
}

/** Étiquette d'exécution, stable pour toute la qualification. */
export function etiquetteExecution(): string {
  if (!execution) {
    execution = `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
  return execution
}

/** Une racine par scénario : les baux et les comptes de commits ne doivent
 *  jamais se croiser d'un test à l'autre, ni avec le reste du banc. */
export function racineDe(suffixe: string): string {
  return `qualification/${etiquetteExecution()}-${suffixe}`
}

export interface FichierGitLab {
  file_path: string
  content: string
  last_commit_id: string
}

export async function api<T>(
  chemin: string,
  jeton: string,
): Promise<{ statut: number; corps: T; texte: string }> {
  const reponse = await fetch(`${configuration.url}/api/v4${chemin}`, {
    headers: { 'PRIVATE-TOKEN': jeton },
    signal: AbortSignal.timeout(15_000),
  })
  const texte = await reponse.text()
  let corps: T
  try {
    corps = JSON.parse(texte) as T
  } catch {
    corps = texte as T
  }
  return { statut: reponse.status, corps, texte }
}

export async function lireFichier(chemin: string, jeton: string) {
  return api<FichierGitLab>(
    `/projects/${configuration.projetId}/repository/files/${encodeURIComponent(chemin)}?ref=main`,
    jeton,
  )
}

export function contenuDe(reponse: { corps: FichierGitLab }): string {
  return Buffer.from(reponse.corps.content, 'base64').toString('utf8')
}

/** Commits ayant touché un chemin : le comptage d'un geste ne dépend ainsi
 *  d'aucun autre trafic sur le projet du banc. */
export async function commitsTouchant(chemin: string): Promise<number> {
  let total = 0
  for (let page = 1; page <= 100; page += 1) {
    const commits = await api<unknown[]>(
      `/projects/${configuration.projetId}/repository/commits`
      + `?ref_name=main&path=${encodeURIComponent(chemin)}&per_page=100&page=${page}`,
      configuration.token1 as string,
    )
    if (commits.statut !== 200) throw new Error(commits.texte.slice(0, 300))
    total += commits.corps.length
    if (commits.corps.length < 100) return total
  }
  throw new Error('Le comptage des commits dépasse la borne de qualification.')
}

/** Dépôt d'un corpus de qualification sous une racine qui lui est propre. */
export async function creerRacine(
  suffixe: string,
  options: { corpus?: CorpusFichier; nom?: string } = {},
  racine = racineDe(suffixe),
): Promise<string> {
  const depot = nouveauDepot(configuration.token1 as string)
  const corpus = options.corpus ?? squeletteCorpus(options.nom ?? 'Qualification')
  try {
    await depot.publierCommit('main', `qualification ${etiquetteExecution()}: corpus ${suffixe}`, [{
      action: 'create',
      file_path: `${racine}/corpus.json`,
      content: JSON.stringify(corpus, null, 2),
    }])
  } catch (erreur) {
    // Une racine déjà déposée n'est pas un échec de qualification.
    if (!(erreur instanceof ErreurGitLab && erreur.statut === 400)) throw erreur
  }
  return racine
}

/** Dépôt minimal, pour déposer des fichiers de mise en situation. */
export function nouveauDepot(jeton: string, instance?: string): DepotCommitsGitLabClient {
  return new DepotCommitsGitLabClient(new ClientGitLab({
    urlInstance: instance ?? (configuration.url as string),
    projetId: Number(configuration.projetId),
    autorisation: { type: 'jeton-prive', jeton },
  }))
}

/** Chemin du bail de `corpus.json` : les commits de coordination s'y comptent. */
export function cheminBailCorpus(racine: string): string {
  return cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${racine}/corpus.json`))
}

export interface Pile {
  store: CorpusStore
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  journal: JournalPublicationGitLab
  transactions: TransactionsGitLab
  /** Une requête = une ligne « METHOLE /chemin », dans l'ordre. */
  requetes: string[]
  dossier: string
  racine: string
  lireLocal(): CorpusFichier
}

/** Pile de production sur l'instance réelle, dans un dossier local neuf.
 *  Le miroir est volontairement en retard : il ne doit rien prouver. */
export function pile(options: {
  racine: string
  jeton: string
  userId: string
  sessionId: string
  instance?: string
  fetchImpl?: typeof fetch
  /** Dossier de journal partagé : une pile relancée le relit tel quel. */
  journalRepertoire?: string
  /** Membres du corpus déjà connus, pour un miroir qui ne les ignore pas. */
  corpusLocal?: CorpusFichier
}): Pile {
  const dossier = mkdtempSync(join(tmpdir(), `sonal-banc-${prefixe}-`))
  mkdirSync(join(dossier, 'entretiens'), { recursive: true })
  writeFileSync(
    join(dossier, 'corpus.json'),
    JSON.stringify(options.corpusLocal ?? squeletteCorpus('Miroir périmé'), null, 2),
    'utf8',
  )
  const store = new CorpusStore(dossier)
  store.lectureSeule = true
  const requetes: string[] = []
  const fetchCompte: typeof fetch = async (entree, init) => {
    const url = new URL(String(entree))
    requetes.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
    return fetch(entree as never, init)
  }
  const client = new ClientGitLab({
    urlInstance: options.instance ?? (configuration.url as string),
    projetId: Number(configuration.projetId),
    autorisation: { type: 'jeton-prive', jeton: options.jeton },
  }, options.fetchImpl ?? fetchCompte)
  const depot = new DepotCommitsGitLabClient(client)
  const destination: ConfigDestinationGitLab = {
    fournisseur: 'gitlab',
    id: `qualification-${options.sessionId}`,
    compteId: options.userId,
    projetId: Number(configuration.projetId),
    nomProjet: 'Qualification',
    branche: 'main',
    racine: options.racine,
  }
  const journal = new JournalPublicationGitLab(
    destination.id,
    options.journalRepertoire ?? join(dossier, 'operations'),
    undefined,
    {
      chemin: `${options.racine}/corpus.json`,
      resourceHash: cleRessourceBailGitLab('main', `${options.racine}/corpus.json`),
    },
  )
  const coordination = new BailGitLab({
    branche: 'main',
    depot,
    identite: () => ({
      userId: options.userId,
      machineId: `poste-${options.sessionId}`,
      sessionId: options.sessionId,
    }),
    dureeBailMs: 120_000,
  })
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal })
  const transactions = new TransactionsGitLab({
    destination,
    store,
    depot,
    coordination,
    publication,
    file: new FileOperationsContexte(),
    journal,
    nouvelleOperation: () => `op-${options.sessionId}-${Math.random().toString(36).slice(2, 8)}`,
  })
  return {
    store,
    depot,
    coordination,
    publication,
    journal,
    transactions,
    requetes,
    dossier,
    racine: options.racine,
    lireLocal: () => JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier,
  }
}

/** Session réelle d'un entretien de qualification, avec son stockage local. */
export function ouvrirSession(p: Pile, cheminDistant: string, suffixe: string) {
  const stockage = new StockageLocalEntretienGitLab(p.dossier, `entretiens/${suffixe}.json`)
  const cheminCorpus = p.racine ? `${p.racine}/corpus.json` : 'corpus.json'
  const session = new SessionGitLab({
    id: suffixe,
    ressource: `entretien:qualification:${suffixe}`,
    cheminRelatif: `entretiens/${suffixe}.json`,
    cheminDistant,
    branche: 'main',
    depot: p.depot,
    coordination: p.coordination,
    publication: p.publication,
    stockageLocal: stockage,
    journal: p.journal,
    preparerGardeDefinitions: async (contenuEntretien) => {
      const corpus = await p.depot.lireFichier(cheminCorpus, 'main')
      if (!corpus) throw new Error('Le fichier corpus.json est introuvable sur GitLab.')
      verifierContenusReferencesDefinitions(contenuEntretien, corpus.contenu)
      return {
        action: 'update',
        chemin: cheminCorpus,
        contenu: corpus.contenu,
        commitId: corpus.commitId,
      }
    },
  })
  return Object.assign(session, {
    ecrire: (contenu: string) => stockage.ecrire(contenu),
  })
}

export function nettoyer(...piles: Array<{ dossier: string }>): void {
  for (const p of piles) rmSync(p.dossier, { recursive: true, force: true })
}

/** Entretien publié minimal, avec les repères qu'un geste peut référencer. */
export function entretienPublie(
  texte: string,
  repereIds: string[] = [],
  lastModified = '2026-01-01T10:00:00.000Z',
): string {
  const entretien: EntretienFichier = {
    formatVersion: FORMAT_VERSION,
    lastModified,
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: texte }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: repereIds.map((id) => ({
      id,
      from: 0,
      to: Math.max(1, texte.length),
    })),
  }
  return JSON.stringify(entretien, null, 2)
}

/** Corpus de qualification portant `n` entretiens publiés et un cas de référence. */
export function corpusAvecEntretiens(titres: Record<string, string>): CorpusFichier {
  const corpus = squeletteCorpus('Qualification sources')
  corpus.membership = Object.fromEntries(Object.entries(titres).map(([id, titre], index) => [
    id,
    { titre, date: null, lastModified: null, rangAjout: index },
  ]))
  corpus.ordreEntretiens = Object.keys(titres)
  return corpus
}
