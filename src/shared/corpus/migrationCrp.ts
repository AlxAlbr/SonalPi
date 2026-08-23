/**
 * Migration SonalPi V1 → V2 — parseur `.crp`.
 *
 * FONCTIONS PURES : aucune I/O, aucun electron. Le main ne fait que LIRE le
 * fichier (avec détection d'encodage, `src/main/encodage.ts`) ; TOUT le travail
 * de validation + analyse vit ici, testable headless (unitaire).
 *
 * Le `.crp` est un JSON aux types POUR LE MOINS VARIABLES (la V1 écrit tantôt
 * des nombres, tantôt des chaînes — `taille`, `rang`, `act`, `priv`) : le
 * parseur est donc défensif — il ne plante jamais sur une bizarrerie, il
 * normalise.
 *
 * Sortie : un APERÇU (ce que la modale de migration affichera) + les données
 * V1 brutes (matière du mapping vers le modèle V2 : codebook/variables,
 * entretiens/audio, `tabAnon`).
 */

import type { Categorie, Variable } from '../format'
import { parentsDepuisRangs } from './categories'
import { importerVariables } from './eav'

// ── Types du format `.crp` V1 (tolérants : la V1 écrit des types variables) ──

/** Thème V1 (`tabThm`). `rang` = profondeur ('0' = racine), `taille` = nombre
 *  nu OU `''` (pondération vide), `couleur` = hex OU `''` (vide). */
export interface CrpV1Theme {
  code: string
  nom: string
  couleur: string
  taille: number | string
  rang: number | string
  act: boolean | string
  cmpct?: boolean
}

/** Variable V1 (`tabVar`). `champ` = 'gen' | 'loc', `priv` = string 'true'/'false'. */
export interface CrpV1Variable {
  v: number
  lib: string
  champ: string
  priv: string | boolean
}

/** Modalité V1 (`tabDic`) : `{v, m, lib}` — `lib` ABSENT possible (`{v:1,m:0}` existe). */
export interface CrpV1Dic {
  v: number
  m: number
  lib?: string
}

/** Valeur EAV V1 (`tabDat`) : `l` = 'all' | index de locuteur (string ou nombre). */
export interface CrpV1Dat {
  e: string | number
  v: number
  l: string | number
  m: number
}

/** Entretien V1 (`tabEnt[]`). `rtrPath` est RELATIF au dossier du `.crp`,
 *  `audioPath` ABSOLU (ou `''`). Chaque entretien embarque SES copies de
 *  `tabThm`/`tabVar`/`tabDic`/`tabDat` (redondance V1 — le `.crp` fait foi, Q7). */
export interface CrpV1Entretien {
  id: number
  nom: string
  notes?: string
  hms?: string
  rtrPath: string
  audioPath?: string
  imgPath?: string
  tabLoc?: string[]
  tabThm?: CrpV1Theme[]
  tabVar?: CrpV1Variable[]
  tabDic?: CrpV1Dic[]
  tabDat?: CrpV1Dat[]
  lastModified?: string
  fileSize?: string
  lastAccess?: string
}

/** Règle d'anonymisation V1 (`tabAnon`) : `remplacementAlt`/`thematique` optionnels. */
export interface CrpV1RegleAnon {
  entite: string
  remplacement?: string
  remplacementAlt?: string
  thematique?: string
}

/** Corpus `.crp` V1 dans son ensemble. `nom`/`dateCreation`/`version` ne sont
 *  écrits que par `nouveauCorpus` — les corpus SAVÉS par la V1 les DROPPENT
 *  (gestion_corpus.js ~v.471) : ils sont donc optionnels, la migration
 *  retombe sur le nom de fichier. */
export interface CrpV1 {
  nom?: string
  dateCreation?: string
  version?: string
  tabThm?: CrpV1Theme[]
  tabEnt?: CrpV1Entretien[]
  tabVar?: CrpV1Variable[]
  tabDic?: CrpV1Dic[]
  tabDat?: CrpV1Dat[]
  tabAnon?: CrpV1RegleAnon[]
  /** Settings de pseudonymisation persistés dans le `.crp` (main.js ~v.206). */
  paramsAnonCorpus?: unknown
}

/** Liste blanche des versions `.crp` connues (garde d'entrée).
 *  La V1 n'écrit `version` ('1.0') qu'à la CRÉATION ; un corpus ré-enregistré
 *  n'a pas le champ → absent = legacy accepté, valeur inconnue = refus propre. */
export const VERSIONS_CRP_SUPPORTEES: readonly string[] = ['1.0'] as const

// ── Aperçu ──────────────────────────────────────────────────────────────

export interface ApercuTheme {
  nom: string
  couleur: string | null // '' ou absent → null (normalisé en hex plus tard)
  taille: number | null // '' → null (le défaut V2), nombre nu préservé
}

export interface ApercuVariable {
  lib: string
  portee: 'entretien' | 'locuteur' // 'gen' → entretien, 'loc' → locuteur
  priv: boolean // string 'true'/'false' → booléen
}

export interface ApercuRegleAnon {
  entite: string
  remplacement: string
}

/** Ce que la modale de migration affichera avant toute écriture. */
export interface ApercuCrp {
  /** Identité du projet : `nom` du `.crp`, sinon basename sans extension. */
  nom: string
  dateCreation: string | null
  nbEntretiens: number
  themes: ApercuTheme[]
  variables: ApercuVariable[]
  reglesAnon: ApercuRegleAnon[]
  /** Données V1 BRUTES — matière du mapping vers le modèle V2
   *  (codebook/variables, entretiens/audio, tabAnon). Lues une seule fois,
   *  transportées ici. */
  raw: CrpV1
}

/** Résultat d'analyse : aperçu utilisable, ou refus TYPÉ (jamais d'exception). */
export type AnalyseCrp =
  | { ok: true; apercu: ApercuCrp }
  | { ok: false; raison: 'json' | 'version' | 'structure'; message: string }

// ── Normalisations défensives (types variables de la V1) ──────────────────

function normaliserCouleur(c: unknown): string | null {
  return typeof c === 'string' && c.trim() !== '' ? c : null
}

/** `taille` V1 : nombre nu, chaîne numérique, ou `''` (pondération vide) →
 *  nombre | null (le défaut V2, parité importSonal.ts « nombre nu ou '' »). */
function normaliserTaille(t: unknown): number | null {
  if (typeof t === 'number' && Number.isFinite(t)) return t
  if (typeof t === 'string' && t.trim() !== '' && Number.isFinite(Number(t))) return Number(t)
  return null
}

function porteeV1(champ: unknown): 'entretien' | 'locuteur' {
  return champ === 'loc' ? 'locuteur' : 'entretien'
}

function privV1(priv: unknown): boolean {
  return priv === 'true' || priv === true
}

/** Filtre les éléments d'un tableau V1 qui ne sont pas des objets — la V1
 *  peut laisser traîner des `null`/types inattendus ; on ne plante pas. */
function objets(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
}

// ── Analyse ─────────────────────────────────────────────────────────────

/**
 * Analyse un `.crp` V1 (contenu DÉJÀ décodé en UTF-8 — l'encodage est géré par
 *  le main, `src/main/encodage.ts`). Retourne l'aperçu + les données brutes,
 *  ou un refus typé (JSON invalide / version inconnue / structure illisible).
 *
 * @param contenu    le texte du fichier `.crp`, décodé
 * @param nomFichier basename du fichier (ex. 'Test5.crp') — sert de repli au
 *                   `nom` quand le `.crp` ne le porte pas (corpus sauvés V1)
 */
export function analyserCrp(contenu: string, nomFichier?: string): AnalyseCrp {
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'JSON invalide'
    return { ok: false, raison: 'json', message: `fichier .crp illisible : ${message}` }
  }
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return { ok: false, raison: 'structure', message: 'le .crp n\'est pas un objet JSON' }
  }
  const crp = brut as Record<string, unknown>

  // Garde d'entrée : version connue (absente = legacy accepté).
  const version = crp.version
  if (version !== undefined && version !== null && !VERSIONS_CRP_SUPPORTEES.includes(String(version))) {
    return {
      ok: false,
      raison: 'version',
      message: `version de corpus « ${String(version)} » inconnue (connues : ${VERSIONS_CRP_SUPPORTEES.join(', ')})`,
    }
  }

  // Structure : `tabEnt` est le minimum vital (la V2 reflète les entretiens).
  if (!Array.isArray(crp.tabEnt)) {
    return { ok: false, raison: 'structure', message: 'champ tabEnt manquant ou invalide dans le .crp' }
  }

  // Identité : `nom` du .crp, sinon repli sur le nom de fichier, sinon neutre.
  let nom = ''
  if (typeof crp.nom === 'string') nom = crp.nom.trim()
  if (nom === '' && nomFichier) nom = nomFichier.replace(/\.[^.]+$/, '').trim()
  if (nom === '') nom = 'Corpus SonalPi V1'

  const dateCreation = typeof crp.dateCreation === 'string' && crp.dateCreation !== '' ? crp.dateCreation : null

  const themes: ApercuTheme[] = objets(crp.tabThm).map((t) => ({
    nom: typeof t.nom === 'string' ? t.nom : String(t.nom ?? ''),
    couleur: normaliserCouleur(t.couleur),
    taille: normaliserTaille(t.taille),
  }))

  const variables: ApercuVariable[] = objets(crp.tabVar).map((v) => ({
    lib: typeof v.lib === 'string' ? v.lib : String(v.lib ?? ''),
    portee: porteeV1(v.champ),
    priv: privV1(v.priv),
  }))

  const reglesAnon: ApercuRegleAnon[] = objets(crp.tabAnon)
    .filter((r) => typeof r.entite === 'string' && r.entite.trim() !== '')
    .map((r) => ({
      entite: r.entite as string,
      remplacement: typeof r.remplacement === 'string' ? r.remplacement : '',
    }))

  return {
    ok: true,
    apercu: {
      nom,
      dateCreation,
      nbEntretiens: crp.tabEnt.length,
      themes,
      variables,
      reglesAnon,
      raw: crp as unknown as CrpV1,
    },
  }
}

// ── Mapping vers le modèle V2 ───────────────────────────────────────────
// `tabThm`/`tabVar`/`tabDic` → `codebook`/`variables`, prêts à être FUSIONNÉS
// dans le corpus V2 via `fusionnerImport` (shared/corpus/import.ts). Parité
// avec l'import `.sonal` : importSonal.ts step 5 construit le codebook avec
// `parentsDepuisRangs` + ce mapping, et `importerVariables` (shared/corpus/eav),
// c'est le MÊME format legacy → mêmes ids déterministes (`cat_NNN`, v{n}/v{n}m{m}),
// fusion idempotente, zéro doublon.
//
// On ne lit QUE le niveau CORPUS du `.crp` (ces fonctions
// reçoivent `crp.tabThm`/`tabVar`/`tabDic`) — jamais les copies embarquées de
// chaque `tabEnt[]`, qui peuvent DÉRIVER des définitions. Le `.crp` fait foi.

/** `taille` de pondération V2 : nombre nu OU `''` en V1 → `undefined` (défaut),
 *  uniquement un nombre > 0 (parité importSonal.ts ; 0/négatif = absent). */
function normaliserTaillePonderation(t: unknown): number | undefined {
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** `tabThm` (`.crp`) → codebook V2 (`Categorie[]`). Mapping :
 *  `code→id` ET `codeExport` (parité `cat_NNN`), `nom`, `couleur` (hex — `''`
 *  → `undefined`, le défaut V2, Q4), `taille` (nombre nu ou `''` → `undefined`),
 *  `rang→parent` (hiérarchie RECONSTRUITE depuis la séquence des profondeurs,
 *  comme importSonal.ts), `act→actif`, `cmpct` ignoré. `ordre` = position dans
 *  le tableau (l'ordre de saisie V1). Un thème sans `code` est écarté
 *  (inadressable — l'id est l'identité de parité). */
export function mapperCodebook(tabThm: unknown): Categorie[] {
  const themes = objets(tabThm).filter((t) => typeof t.code === 'string' && t.code !== '')
  const parents = parentsDepuisRangs(
    themes.map((t) => ({ id: t.code as string, rang: Number(t.rang ?? 0) || 0 })),
  )
  return themes.map((t, i) => ({
    id: t.code as string,
    nom: typeof t.nom === 'string' && t.nom !== '' ? t.nom : (t.code as string),
    couleur: typeof t.couleur === 'string' && t.couleur !== '' ? (t.couleur as string) : undefined,
    taille: normaliserTaillePonderation(t.taille),
    ordre: i,
    parent: parents[t.code as string] ?? null,
    // Booleen OU string (gabarit nouveauCorpus) : 'false'/false désactivent.
    actif: t.act !== false && t.act !== 'false',
    codeExport: t.code as string,
  }))
}

/** `tabVar` + `tabDic` (`.crp`) → `Variable[]` — le mapping vit dans
 *  `shared/corpus/eav.ts` (partagé avec l'import `.sonal`, même format) :
 *  `lib→lib`, `champ` (`'gen'`→`portee:'entretien'`, `'loc'`→`portee:'locuteur'`),
 *  `priv` (string `'true'/'false'` → booléen), `tabDic` → modalités (`m` devient
 *  l'ordre ET le code d'export ; `{v,m}` sans `lib` conservé tel quel). */
export function mapperVariables(tabVar: unknown, tabDic: unknown): Variable[] {
  return importerVariables(tabVar, tabDic)
}

/** Définitions V2 complètes depuis un `.crp` brut (matière de la création :
 *  on amorce le corpus V2, puis `fusionnerImport(corpus, codebook, variables)`). */
export function mapperDefinitions(crp: CrpV1): { codebook: Categorie[]; variables: Variable[] } {
  return {
    codebook: mapperCodebook(crp.tabThm),
    variables: mapperVariables(crp.tabVar, crp.tabDic),
  }
}

// ── Mapping des ENTRETIENS ─────────────────────────────────────────────────
// `tabEnt[]` → les données V2 à créer par entretien. La RÉSOLUTION du chemin
// du `.sonal` (rtrPath RELATIF au dossier du .crp) et la lecture sont faites
// par le main (`migrer:lireSonal`) ; `audioPath` V1 est déjà ABSOLU (ou '').

/** Un entretien V1 prêt à importer (variant de `mapperEntretiensV1`). */
export interface EntretienV1Import {
  id: number
  /** membership.titre : `nom` V1, sinon « Entretien <id> ». */
  titre: string
  /** rtrPath du `.sonal` (relatif au dossier du .crp), ou null. */
  rtrPath: string | null
  /** audioRef V2 : audioPath V1 absolu, ou null si absent/vide (Q1 : entretien
   *  importé vide quand même). */
  audioRef: string | null
}

/** `tabEnt[]` (`crp.tabEnt`) → liste des entretiens à créer. Défensif :
 *  un `nom`/`rtrPath`/`audioPath` manquant ou vide est normalisé (jamais
 *  d'exception), cohérent avec Q1 (b) — un corpus V2 doit refléter le corpus
 *  V1, l'audio suffit si le .sonal manque. */
export function mapperEntretiensV1(tabEnt: unknown): EntretienV1Import[] {
  return objets(tabEnt).map((t, i) => {
    const id = typeof t.id === 'number' && Number.isFinite(t.id) ? t.id : i + 1
    const nom = typeof t.nom === 'string' ? t.nom.trim() : ''
    const rtrPath = typeof t.rtrPath === 'string' && t.rtrPath.trim() !== '' ? t.rtrPath : null
    const audioPath = typeof t.audioPath === 'string' ? t.audioPath.trim() : ''
    return {
      id,
      titre: nom !== '' ? nom : `Entretien ${id}`,
      rtrPath,
      audioRef: audioPath !== '' ? audioPath : null,
    }
  })
}

// ── Création du corpus + gardes ───────────────────────────────────────
// La vérification du dossier DÉDIÉ (on n'écrase jamais) et la
// demande d'exécution transitent par ces types (partagés main ⇄ renderer).

/** Résultat de la garde `migrer:verifierDossier` :
 *  - `ok` — dossier libre : `nonVide` avertit que des fichiers NON LIÉS y
 *    resteront (le corpus V2 y pose corpus.json + entretiens/ + png/) ;
 *  - `ok:false` — refus : `dejaCorpus` (un corpus.json y vit déjà) ou `demo`
 *    (c'est le corpus d'un mode démo — l'autre refus possible). */
export type VerificationDossierMigration =
  | { ok: true; nonVide: boolean }
  | { ok: false; raison: 'dejaCorpus' | 'demo' }

/** Demande d'exécution de `migrer:executer` : le renderer (qui orchestre)
 *  fournit l'identité, la trace sourceV1 et les DÉFINITIONS déjà mappées ;
 *  le main écrit le corpus V2, l'ajoute aux récents et l'ouvre. */
export interface DemandeMigration {
  /** Identité du projet (corpus.json.nom). */
  nom: string
  /** Chemin absolu du `.crp` migré (meta.sourceV1.cheminCrp). */
  cheminCrp: string
  /** dateCreation du `.crp`, ou null (meta.sourceV1.dateCreation). */
  dateCreation: string | null
  /** Dossier DÉDIÉ au corpus V2 (déjà vérifié par la garde). */
  dossier: string
  /** Codebook migré. */
  codebook: Categorie[]
  /** Variables migrées. */
  variables: Variable[]
}
