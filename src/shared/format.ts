import type { Annotation } from './entretien/annotation'
import type { Ancre } from './entretien/audio'

/**
 *  Contrat du FORMAT NATIF SonalPi2 (docs/dev/modele-objet.md).
 *  Partagé main ⇄ renderer.
 *  Toute évolution de structure = bump de FORMAT_VERSION + migration explicite :
 *  une version inconnue est refusée, jamais lue à moitié.
 *
 *  formatVersion 2 : les timecodes quittent les attributs de bloc (`deb`/`fin`) et deviennent
 *  des ancres `{pos, t}` positionnées dans le texte (migration au store).
 *
 *  formatVersion 3 : `meta.audioRef` devient un chemin ABSOLU uniquement — l'audio est
 *  référencé sur place, plus de copie dans `<corpus>/audio/`. Migration au
 *  store : refs relatives résolues en absolues, PNG d'onde déplacés vers `png/`.
 */
export const FORMAT_VERSION = 3

export function versionSupportee(v: unknown): boolean {
  return v === FORMAT_VERSION
}

// ══════════════════════════════════════════════════════════════════════════
// Démo « Mini Corpus Test » — modes, mémoire persistée, marqueur de corpus.
// ══════════════════════════════════════════════════════════════════════════

/** Mode de démo : `'pas-a-pas'` (corpus amorcé vide, rempli étape par étape)
 *  ou `'autonomie'` (les 4 entretiens + audios importés d'un coup). */
export type ModeDemo = 'pas-a-pas' | 'autonomie'

/** Mémoire démo persistée dans `settings.json` (niveau profil) : la racine des sources de démo, copiées une fois depuis `CorpusTest/` ;
 *  et le dossier du corpus de test de chaque mode, indépendants. */
export interface EtatDemo {
  racineSources: string
  /** Corpus de test du mode pas-à-pas (dossier choisi directement). */
  corpusPasAPas?: string
  /** Corpus de test du mode autonomie (dossier choisi directement). */
  corpusAutonomie?: string
}

/** Retour de `demo:etat` : l'état mémorisé + la présence RÉELLE sur disque —
 *  les sources seulement si les 8 fichiers (4 SRT + 4 MP3) sont là ; un corpus
 *  de test seulement si son `corpus.json` porte le marqueur `demo` du mode
 *  (un squelette amorcé vide ne compte pas). */
export interface EtatDemoComplet extends EtatDemo {
  sourcesExist: boolean
  corpusPasAPasExist: boolean
  corpusAutonomieExist: boolean
}

/** Marqueur `demo` de `corpus.json` : identité d'un corpus de TEST ; absent = corpus normal (la démo n'y touche jamais).
 *  `mode` = pas-à-pas ou autonomie ; `validees` = étapes cochées du parcours, qui voyage avec le corpus. */
export interface MarqueurDemo {
  mode: ModeDemo
  racineSources: string
  validees?: string[]
}

/** Résultat de la garde `demo:verifierCorpus` (modale) : `ok` si le dossier est
 *  libre OU n'abrite qu'un squelette amorcé vide (pas un travail utilisateur) ;
 *  sinon refus typé : `demo` (corpus d'un mode démo), `dejaCorpus` (non vide),
 *  `illisible` (`corpus.json` présent mais illisible, prudence). */
export type VerificationDossierDemo =
  | { ok: true }
  | { ok: false; raison: 'demo' | 'dejaCorpus' | 'illisible' }

// ══════════════════════════════════════════════════════════════════════════
// Corpus — dossier et `corpus.json` (définitions + membership).
// ══════════════════════════════════════════════════════════════════════════

/** Règle corpus = mappage `entité → pseudo` PARTAGÉ entre entretiens, vivant DANS `corpus.json.reglesAnon` (la SEULE vérité « règle »).
 *  Pas de champ `actif` : la mise en veille est un brouillon entretien-local. `entite[]`/`pseudos[]` préparent le multi-alias/multi-pseudo ;
 *  pas encore activé. */
export interface RegleAnon {
  id: string
  entite: string[]
  pseudos: string[]
  /** Thématique de l'entité (4c, opt-in) — PER/LOC/ORG/DAT ou libre ; vit sur la règle corpus, ne voyage pas dans les `.sonal`.
   *  Champ ADDITIF optionnel. */
  categorie?: string
}

/** Trace d'une migration SonalPi1 → SonalPi2 : identité du `.crp` (nom + dateCreation), et chemin absolu vers le fichier d'origine, en mémoire.
 *  Champ ADDITIF optionnel. */
export interface SourceV1 {
  /** Chemin absolu du `.crp` migré. */
  cheminCrp: string
  /** `dateCreation` portée par le `.crp` (nouveauCorpus), sinon null. */
  dateCreation: string | null
}

/** `corpus.json` — définitions + membership. */
export interface CorpusFichier {
  formatVersion: number
  codebook: Record<string, Categorie>
  variables: Record<string, Variable>
  reglesAnon: Record<string, RegleAnon>
  personnes: Record<string, unknown>
  membership: Record<string, EntretienRef>
  /** Identité du PROJET : vit dans corpus.json → insensible au renommage du dossier.
   *  Champ ADDITIF optionnel. */
  nom?: string
  /** Trace d'origine — champ ADDITIF optionnel. */
  meta?: { sourceV1?: SourceV1 }
  /** Marqueur de corpus de TEST (démo), posé par le builder démo à la création, mis à jour à chaque étape validée (pas-à-pas).
   *  Champ ADDITIF optionnel ; absent pour un corpus normal. */
  demo?: MarqueurDemo
  /** Rôles & permissions : userId Nextcloud → rôle 'propriétaire' | 'editeur' | 'lecteur', champ RÉSERVÉ mais qui voyage déjà pour éviter une migration.
   *  Champ ADDITIF optionnel. */
  roles?: Record<string, string>
  /** Paramètres de pseudonymisation (étape 4). Absent = défauts (`prioriteValidation: 'corpus'`).
   *  CORPUS-ONLY : ne fuit jamais dans le `.sonal` d'un entretien. Champ ADDITIF optionnel. */
  paramsAnon?: ParamsAnon
  /** Catégories de note : typologie partagée par tout le corpus, comme le codebook ; un corpus existant sans ce champ est normalisé en bacs par défaut.
   *  Champ ADDITIF optionnel. */
  categoriesNote?: NoteCategory[]
}

/** Paramètres de pseudonymisation au niveau corpus : `prioriteValidation` est la portée appliquée par ENTRÉE à la validation d'une ligne du tableau anon (Maj+Entrée = l'autre ; défaut 'corpus').
 *  `motsLiaison` : liste partagée + interrupteur — à la validation d'une entité à affixe (« à Lyon »), l'actif suggère l'entité-cœur (« Lyon »). */
export interface ParamsAnon {
  prioriteValidation: 'corpus' | 'entretien'
  motsLiaison?: MotsLiaisonParams
  /** Thématiques d'entités (4c) — désactivées par défaut. */
  thematiques?: ThematiquesParams
}

/** Interrupteur + liste des mots de liaison / articles (activé par défaut). */
export interface MotsLiaisonParams {
  actif: boolean
  liste: string[]
}

/** Interrupteur + liste des thématiques PER/LOC/ORG/DAT, désactivées par défaut. */
export interface ThematiquesParams {
  actif: boolean
  liste: string[]
}

/** Défauts des mots de liaison. */
export const MOTS_LIAISON_DEFAUT = ['à', 'de', 'd', 'du', 'des', 'au', 'aux', 'en', 'chez', 'dans', 'sur', 'pour']

/** Défauts des thématiques. */
export const THEMATIQUES_DEFAUT = ['PER', 'LOC', 'ORG', 'DAT']

/** Défauts des paramètres anon : utilisés si `paramsAnon` manque, ou si un champ ajouté plus tard est absent (lecture tolérante). */
export function paramsAnonDefaut(): ParamsAnon {
  return {
    prioriteValidation: 'corpus',
    motsLiaison: { actif: true, liste: [...MOTS_LIAISON_DEFAUT] },
    thematiques: { actif: false, liste: [...THEMATIQUES_DEFAUT] },
  }
}

/** Un dossier de corpus (corpus courant + récents de l'Accueil). */
export interface DossierCorpus {
  dir: string
  nom: string
}

/** Entrée des « Récents », locale ou distante. Un récent distant rouvre via `distant:ouvrir(id)`, jamais par son chemin miroir local ; sinon, le cycle verrou/publié serait contourné. */
export type EntreeRecent =
  | ({ type: 'local' } & DossierCorpus)
  | { type: 'distant'; id: string; nom: string; url: string }

/** Identité du dossier + contenu du corpus, dans un seul message IPC. */
export interface OuvertureCorpus extends DossierCorpus {
  corpus: CorpusFichier
}

/** Préfixe de l'erreur quand le dossier du corpus courant disparaît sur disque en session : le store refuse de le ré-amorcer en silence, le renderer bascule sur un autre récent. */
export const CORPUS_SUPPRIME = 'CORPUS_SUPPRIME'

// ══════════════════════════════════════════════════════════════════════════
// Entretiens — `entretiens/<id>.json`, leurs locuteurs.
// ══════════════════════════════════════════════════════════════════════════

/** Métadonnées légères de listing (le membership du corpus). */
export interface EntretienRef {
  titre: string
  date: string | null
  /** ISO — date du fichier entretien : cache-busting de la forme d'onde des cartes Corpus (`?v=lastModified`) ; le disque est la vérité en mono-utilisateur (cf. corpusStore). */
  lastModified: string
}



/** Brouillon d'anonymisation entretien-local (jamais une règle) : entité saisie sans occurrence posée, ou pseudo saisi sans validation ; une fois validé (Entrée), les occurrences sont posées et le brouillon consommé. */
export interface BrouillonAnon {
  entite: string
  pseudo?: string
}

/** Métadonnées d'un entretien : valeurs EAV de portée entretien, référence audio (absolue, formatVersion 3), et trace de migration SonalPi1 — champ ADDITIF optionnel, sans bump de formatVersion. */
export interface MetaEntretien {
  valeursGen: Record<string, string> // idVar → idMod (portée entretien)
  audioRef: string | null // chemin ABSOLU (v3), ou null si aucun audio
  /** Média désigné DANS le Nextcloud : chemin RELATIF à la racine du corpus serveur — c'est la désignation qui porte l'information, pas un dossier ; le miroir télécharge le fichier à chaque tirage.
   *  Champ ADDITIF optionnel. */
  audioDistant?: { chemin: string }
  /** Chemin RELATIF du `.sonal` SonalPi1 d'origine au dossier du `.crp` — trace seule, jamais utilisée pour relire. */
  sourceV1?: { rtrPath: string | null }
}

/** `entretiens/<id>.json` — miroir fichier de l'agrégat Entretien. */
export interface EntretienFichier {
  formatVersion: number
  lastModified: string
  corpsTexte: unknown // doc ProseMirror (JSON canonique)
  annotations: Annotation[]
  /** Ancres temporelles : positions PM triées, temps MESURÉS (secondes) — le reste est dérivé. */
  ancres: Ancre[]
  locuteurs: Locuteur[]
  meta: MetaEntretien
  /** Brouillons d'anonymisation entretien-locaux (pas des règles) ; l'absence est normalisée en [] à l'ouverture.
   *  Champ ADDITIF optionnel. */
  brouillonsAnon?: BrouillonAnon[]
  /** Mémoire de l'ENSEMBLE multi-pseudo déclaré par entité, au-delà de 2 pseudos (clef `cleEntite`, insensible à la casse) ;
   *  sert à la bascule du menu contextuel. Champ ADDITIF optionnel. */
  pseudosDeclares?: Record<string, string[]>
  /** Notes structurées de l'entretien (corps + surlignages + rang) ; normalisées en [] à l'ouverture.
   *  Champ ADDITIF optionnel. */
  notes?: Note[]
  /** Blocs `.sonal` non modélisés (règles d'anon, notes), transportés tels quels pour un export sans perte. */
  legacy?: Record<string, unknown>
}



/** Charge utile pour sauver un entretien — sans formatVersion/lastModified, champs d'intendance posés par le store. */
export interface PayloadEntretien {
  corpsTexte: unknown
  annotations: Annotation[]
  ancres: Ancre[]
  locuteurs: Locuteur[]
  meta: MetaEntretien
  brouillonsAnon?: BrouillonAnon[]
  pseudosDeclares?: Record<string, string[]>
  notes?: Note[]
  legacy?: Record<string, unknown>
}

/** Catégorie de note : définition au niveau CORPUS, référencée par les notes de tous les entretiens (comme une catégorie du codebook). */
export interface NoteCategory {
  id: string
  nom: string
  couleur: string
}

/** Note d'entretien : corps HTML sanitisé (texte échappé + passages `<mark>` importants, `<em>` liés à un commentaire) ; ordre par `rang` (manuel, « après la dernière » = max+1).
 *  `date` null = pas de date (bac « générale » migré de SonalPi1) ; `titre` optionnel : affiché seul en vue cartes. */
export interface Note {
  id: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  rang: number
  creeLe: string
  modifieLe: string | null
}

/** Résultat d'une lecture sans verrou ni effet de bord. */
export type LectureEntretien =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: 'version' | 'absent' }

/** Ouverture explicite de l'éditeur.
 *  Le statut d'accès est toujours présent : il n'est jamais déduit d'un champ
 *  optionnel. */
export type OuvertureEntretienEdition =
  | {
      ok: true
      data: EntretienFichier
      acces: 'edition'
    }
  | {
      ok: true
      data: EntretienFichier
      acces: 'lecture-seule'
      verrouTenuParAutrui: VerrouTenuParAutrui | null
    }
  | { ok: false; raison: 'version' | 'absent' }

/** Contenu importé qui remplace uniquement la transcription d'un entretien. */
export interface TranscriptionEntretien {
  corpsTexte: unknown
  annotations: Annotation[]
  ancres: Ancre[]
  locuteurs: Locuteur[]
}

/** Qui tient le verrou — version affichable, sans détails techniques. */
export interface VerrouTenuParAutrui {
  userId: string
  machineId: string
  acquiredAt: string
}



/** Locuteur : indexé par entretien — le `loc` d'un bloc référence cet index. */
export interface Locuteur {
  index: number
  nom: string
  /** Interviewer (celui qui pose les questions) : tours affichés en italique.
   *  Le « ? » porté par le nom est un artefact de format, réintroduit à
   *  l'export seulement (comme `l="all"` EAV). Champ ADDITIF optionnel. */
  interviewer?: boolean
  /** Pseudonymise l'ÉTIQUETTE du locuteur : le tour s'affiche « Nom [Pseudo] »
   *  (même idiome CSS que le texte anon). Champ ADDITIF optionnel. */
  pseudo?: string
  /** Couleur du NOM du locuteur dans l'éditeur. Absente = couleur auto par index (PALETTE_PASTILLES_LOCUTEURS) ;
   *  champ ADDITIF optionnel. */
  couleur?: string
  /** Décision persistée sur la pseudonymisation du libellé : 'confirme'
   *  (pseudo affiché) ou 'refuse' (libellé en clair + ⊘). Absent = aucune
   *  décision ; le « suggéré » est une requête, jamais stockée. */
  pseudoEtat?: 'confirme' | 'refuse'
  valeursLoc: Record<string, string> // idVar → idMod
  personneRef: string | null
}

// ══════════════════════════════════════════════════════════════════════════
// Codebook & variables EAV — définitions au niveau du corpus.
// ══════════════════════════════════════════════════════════════════════════

/** Une catégorie du codebook — définition au niveau du corpus, pas chez les entretiens. */
export interface Categorie {
  id: string
  nom: string
  couleur?: string
  /** Taille de police (px) des passages codés ; absent = taille du texte.
   *  Champ ADDITIF optionnel. */
  taille?: number
  ordre: number
  parent: string | null
  actif: boolean
  codeExport: string // cat_XXX — attribut d'export, pas l'identité
}

/** Modalité : dépendante de sa variable (identité relative, imbriquée). */
export interface Modalite {
  id: string
  lib: string
  mExport: number // code numérique d'export .sonal, pas l'identité
}

/** Variable EAV (définition → corpus). La `portee` décide où vit la valeur :
 *  entretien (meta.valeursGen) ou locuteur (Locuteur.valeursLoc) — la valeur
 *  va chez son propriétaire, pas de sentinelle `l="all"`. */
export interface Variable {
  id: string
  lib: string
  portee: 'entretien' | 'locuteur'
  priv: boolean
  ordre: number
  vExport: number
  modalites: Modalite[]
}

// ══════════════════════════════════════════════════════════════════════════
// Requêtes & résultats d'opérations (jamais persistés).
// ══════════════════════════════════════════════════════════════════════════

/** Suppression de catégorie : refusée tant qu'elle est utilisée — politique explicite, pas de suppression en cascade. */
export type ResultatSuppressionCategorie =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }

/** Champs modifiables d'une catégorie (renommer, recolorer, retailler,
 *  activer). `taille: undefined` dans le patch = retour à la taille par défaut
 *  (le spread écrase la valeur). */
export type PatchCategorie = Partial<Pick<Categorie, 'nom' | 'couleur' | 'taille' | 'actif'>>

/** Modèle de modalités réutilisable (nom + libellés), porté par le registre du profil (« Mes modèles » de l'éditeur de variables) et exportable/importable en JSON ;
 *  les modèles INTÉGRÉS (Sexe, Âge, PCS…) restent du code. */
export interface ModeleEAV {
  nom: string
  modalites: string[]
}

/** Suppression d'une variable/modalité : refusée tant qu'elle est utilisée. */
export type ResultatSuppression =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }


/** Cible d'une valeur EAV posée depuis la table de données : portée entretien,
 *  ou un locuteur donné (par son index). */
export type CibleValeur = { type: 'entretien' } | { type: 'locuteur'; index: number }

/** Un item du LOT « modifier en lot » : UNE valeur EAV à poser dans un entretien.
 *  Cible entretien uniquement pour l'instant : les locuteurs diffèrent d'un entretien à l'autre. */
export interface ItemLotValeur {
  entretienId: string
  cible: CibleValeur
  idVar: string
  /** '' = effacer la valeur (même sémantique que `poserValeur`). */
  idMod: string
}

/** Retour du lot : succès par entretien (un seul cycle par fichier, même avec plusieurs valeurs) ;
 *  échecs nommés, raison affichable telle quelle. Un échec ponctuel ne bloque jamais les autres entretiens du lot. */
export interface ResultatLotValeur {
  succes: string[]
  echecs: { id: string; raison: string }[]
}

/** Cible du lot d'application en masse d'une règle d'anonymisation : un entretien fermé, et la règle à y poser.
 *  `plages` (optionnel) restreint aux SEULES occurrences cochées de la vue vérification (positions PM) ; absent → toutes les « à traiter ».
 *  `retirer` dé-pseudonymise, `exception` pose une exception, `retirerException` la retire — chaque liste porte des positions PM exactes. */
export interface CibleRegleAnon {
  entretienId: string
  regleId: string
  plages?: { from: number; to: number }[]
  retirer?: { from: number; to: number }[]
  exception?: { from: number; to: number }[]
  retirerException?: { from: number; to: number }[]
}

/** Retour du lot d'anonymisation en masse, même politique que `ResultatLotValeur`.
 *  Chaque succès porte le nombre d'occurrences posées — l'UI ajuste ses compteurs sans re-scan. */
export interface ResultatLotAnon {
  succes: { id: string; nb: number; titre: string }[]
  echecs: { id: string; raison: string }[]
}

/** Segment du résumé thématique d'un entretien (requête, jamais stockée).
 *  Position en % [0..100] du TEXTE (pas le temps audio). `codes` = thèmes
 *  couverts ; `pos`/`posFin` = bornes PM des segments (clic → ouvre le texte,
 *  lecteur → re-projection sur l'axe du temps via les ancres). */
export interface SegmentThematique {
  deb: number
  fin: number
  pos: number
  posFin: number
  codes: string[]
}

/** Matrice corpus (requête, jamais stockée) : par entretien, valeurs de portée entretien, et celles de ses locuteurs — le renderer aplatit tout en lignes pour la table de données. */
export interface MatriceEntree {
  entretienId: string
  titre: string
  valeursGen: Record<string, string>
  locuteurs: { index: number; nom: string; valeursLoc: Record<string, string> }[]
}
export type MatriceCorpus = MatriceEntree[]
