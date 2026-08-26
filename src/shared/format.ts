import type { Annotation } from './entretien/annotation'
import type { Ancre } from './entretien/audio'

/**
 * Contrat du FORMAT NATIF SonalPiTestV2 (docs/dev/modele-objet.md).
 * Partagé main ⇄ renderer.
 * Toute évolution de structure = bump de FORMAT_VERSION + migration explicite :
 * une version inconnue est refusée poliment, jamais lue partiellement.
 *
 * v2 : les timecodes quittent les attributs de bloc (`deb`/`fin`),
 * pour devenir des ancres `{pos, t}` positionnées dans le texte (migration v1→v2 au store).
 *
 * v3 : `meta.audioRef` devient un chemin ABSOLU uniquement — plus de copie dans `<corpus>/audio/`,
 * l'audio est référencé sur place comme dans SonalPi.
 * Migration v2→v3 au store : refs relatives résolues en absolues + PNG d'onde déplacés de `audio/` vers `png/`.
 * Le type du champ ne change pas (`string | null`), c'est le domaine de valeurs qui change.
 */
export const FORMAT_VERSION = 3

export function versionSupportee(v: unknown): boolean {
  return v === FORMAT_VERSION
}

// ══════════════════════════════════════════════════════════════════════════
// Démo « Mini Corpus Test » — modes, mémoire persistée, marqueur de corpus
// ══════════════════════════════════════════════════════════════════════════

/** Mode du « Mini Corpus Test » — deux façons de construire un corpus de démo :
 *  - `'pas-a-pas'` : corpus amorcé vide, rempli étape par étape (onglet « Pas à pas »);
 *  - `'autonomie'` : les 4 entretiens + audios importés d'un coup. */
export type ModeDemo = 'pas-a-pas' | 'autonomie'

/** Mémoire démo persistée dans `settings.json` (au niveau du profil) :
 *  la racine des sources de démo (copiées une fois depuis `CorpusTest/`),
 *  plus le dossier du corpus de test de chaque mode.
 *  Chaque mode a son propre corpus, indépendant. */
export interface EtatDemo {
  racineSources: string
  /** Corpus de test du mode pas-à-pas (dossier choisi directement). */
  corpusPasAPas?: string
  /** Corpus de test du mode autonomie (dossier choisi directement). */
  corpusAutonomie?: string
}

/** Retour de `demo:etat` :
 *  l'état mémorisé + la présence RÉELLE sur disque — les sources seulement si
 *  les 8 fichiers (4 SRT + 4 MP3) sont là ; un corpus de test seulement si
 *  son `corpus.json` porte le marqueur `demo` DU MODE (un squelette amorcé
 *  vide à l'ouverture d'un dossier sans corpus ne compte pas).
 *  (la modale adapte ses questions ; un dossier supprimé/vidé mène à une nouvelle question). */
export interface EtatDemoComplet extends EtatDemo {
  sourcesExist: boolean
  corpusPasAPasExist: boolean
  corpusAutonomieExist: boolean
}

/** Marqueur `demo` de `corpus.json` : identité d'un corpus de TEST.
 *  Absent = corpus normal (la démo n'y touche jamais).
 *  `mode` = « pas-à-pas » ou « autonomie » ;
 *  `racineSources` rappelle où sont les sources ;
 *  `validees` = l'historique du parcours (étapes cochées), qui voyage avec le corpus. */
export interface MarqueurDemo {
  mode: ModeDemo
  racineSources: string
  validees?: string[]
}

// ══════════════════════════════════════════════════════════════════════════
// Corpus — dossier et `corpus.json` (définitions + membership)
// ══════════════════════════════════════════════════════════════════════════

/** Règle corpus = un mappage `entité → pseudo` PARTAGÉ entre entretiens.
 *  Vit DANS `corpus.json.reglesAnon` : c'est la SEULE vérité « règle ». Pas de
 *  `actif` (le brouillon est entretien-local, pas un drapeau de règle).
 *  `entite[]`/`pseudos[]` gardent la forme unidimensionnelle du futur
 *  multi-alias / multi-pseudo (différé), sans l'activer. */
export interface RegleAnon {
  id: string
  entite: string[]
  pseudos: string[]
  /** Thématique de l'entité (étape 4c, opt-in) — PER/LOC/ORG/DAT ou libre.
   *  Champ ADDITIF optionnel ; vit sur la règle corpus (corpus.json),
   *  ne voyage PAS dans les `.sonal`. */
  categorie?: string
}

/** Trace d'une migration SonalPi V1 → V2 : l'identité vient du `.crp`
 *  (nom + dateCreation) et le pont vers le fichier d'origine est son chemin
 *  absolu. Champ ADDITIF optionnel → pas de bump de formatVersion. */
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
  /** Identité du PROJET : stockée DANS corpus.json — survit au renommage du
   *  dossier, sert à l'affichage. Champ ADDITIF optionnel (pas de bump). */
  nom?: string
  /** Trace d'origine — champ ADDITIF optionnel (pas de bump). */
  meta?: { sourceV1?: SourceV1 }
  /** Marqueur de corpus de TEST (démo) — champ ADDITIF optionnel,
   *  absent pour un corpus normal (pas de bump de version).
   *  Posé par le builder démo quand il crée le corpus,
   *  mis à jour ensuite à chaque étape validée (pas-à-pas). */
  demo?: MarqueurDemo
  /** Rôles & permissions — champ RÉSERVÉ : la logique produit viendra plus
   *  tard, mais le champ voyage déjà pour éviter une migration.
   *  userId Nextcloud → rôle
   *  (vocabulaire réservé : 'propriétaire' | 'editeur' | 'lecteur').
   *  Champ ADDITIF optionnel : pas de bump de formatVersion. */
  roles?: Record<string, string>
  /** Paramètres de pseudonymisation (étape 4) — champ ADDITIF optionnel
   *  (pas de bump). Absent = défauts (`prioriteValidation: 'corpus'`).
   *  CORPUS-ONLY : ne fuit jamais dans le `.sonal` d'un entretien. */
  paramsAnon?: ParamsAnon
  /** Catégories de note : typologie partagée par tout le corpus (comme le
   *  codebook). Champ ADDITIF optionnel : absent d'un corpus existant →
   *  normalisé en bacs par défaut à la lecture ; pas de bump. */
  categoriesNote?: NoteCategory[]
}

/** Paramètres partagés de pseudonymisation (niveau corpus).
 *  `prioriteValidation` : portée appliquée par ENTRÉE sur la validation d'une
 *  ligne du tableau anon ; Maj+Entrée applique l'autre portée.
 *  Défaut : 'corpus' (parité V1).
 *  `motsLiaison` : liste partagée + interrupteur. À la validation d'une
 *  entité à affixe (« à Lyon »), l'interrupteur active la suggestion de
 *  l'entité-cœur (« Lyon ») — détection dans entretien/anon/motsLiaison.ts. */
export interface ParamsAnon {
  prioriteValidation: 'corpus' | 'entretien'
  motsLiaison?: MotsLiaisonParams
  /** Thématiques d'entités (4c) — DÉSACTIVÉES par défaut (parité V1). */
  thematiques?: ThematiquesParams
}

/** Interrupteur + liste des mots de liaison / articles (parité V1
 *  `MOTS_LIAISON_DEFAUT`, interrupteur ACTIVÉ par défaut). */
export interface MotsLiaisonParams {
  actif: boolean
  liste: string[]
}

/** Thématiques/catégories d'entités (parité V1 `getThematiques` :
 *  DESACTIVÉES par défaut, liste libre PER/LOC/ORG/DAT). */
export interface ThematiquesParams {
  actif: boolean
  liste: string[]
}

/** Mots de liaison par défaut (parité V1 `anon-detection.js`). */
export const MOTS_LIAISON_DEFAUT = ['à', 'de', 'd', 'du', 'des', 'au', 'aux', 'en', 'chez', 'dans', 'sur', 'pour']

/** Thématiques par défaut (parité V1 `THEMES_DEFAUT`). */
export const THEMATIQUES_DEFAUT = ['PER', 'LOC', 'ORG', 'DAT']

/** Défauts des paramètres anon (absence de `paramsAnon` dans corpus.json,
 *  champs manquants après un ajout futur — lecture tolérante). */
export function paramsAnonDefaut(): ParamsAnon {
  return {
    prioriteValidation: 'corpus',
    motsLiaison: { actif: true, liste: [...MOTS_LIAISON_DEFAUT] },
    thematiques: { actif: false, liste: [...THEMATIQUES_DEFAUT] },
  }
}

/** Un dossier de corpus (pour l'Accueil : corpus courant + récents). */
export interface DossierCorpus {
  dir: string
  nom: string
}

/** Une entrée des « Récents » — taguée local/distant : un récent distant
 *  rouvre via `distant:ouvrir(id)` et jamais son chemin miroir en tant que
 *  dossier local (sinon le cycle verrou/publie est contourné). */
export type EntreeRecent =
  | ({ type: 'local' } & DossierCorpus)
  | { type: 'distant'; id: string; nom: string; url: string }

/** Transporte l'identité du dossier en plus du contenu, dans un seul message IPC. */
export interface OuvertureCorpus extends DossierCorpus {
  corpus: CorpusFichier
}

/** Préfixe sentinelle de l'erreur levée quand le dossier du corpus courant a
 *  été supprimé sur disque en cours de session : le store refuse de le
 *  ré-amorcer en silence, le renderer bascule alors sur un autre récent. */
export const CORPUS_SUPPRIME = 'CORPUS_SUPPRIME'

// ══════════════════════════════════════════════════════════════════════════
// Entretiens — `entretiens/<id>.json`, leurs locuteurs
// ══════════════════════════════════════════════════════════════════════════

/** Métadonnées légères de listing (le membership du corpus). */
export interface EntretienRef {
  titre: string
  date: string | null
  /** ISO — date du fichier entretien.
   *  Ajoutée à l'URL de la forme d'onde des cartes Corpus (`?v=lastModified`),
   *  elle force le navigateur à recharger l'image régénérée (cache-busting).
   *  Plus de contrôle de fraîcheur croisée fichier/membership :
   *  inutile en mono-utilisateur — le disque est la vérité (cf. corpusStore). */
  lastModified: string
}



/** Brouillon d'anonymisation : entité saisie (depuis une sélection ou la ligne
 *  de saisie) sans occurrence posée, ou pseudo saisi sans validation. Vit dans
 *  `entretiens/<id>.json.brouillonsAnon` (entretien-local, ce n'est PAS une
 *  règle). Pseudo optionnel : un brouillon « entité seule » est un draft inerte.
 *  Validé (Entrée) → les occurrences sont posées et le brouillon est consommé. */
export interface BrouillonAnon {
  entite: string
  pseudo?: string
}

/** Métadonnées d'un entretien V2 : valeurs EAV de portée entretien + référence
 *  audio absolue (v3) + trace de migration V1 (sourceV1.rtrPath).
 *  Champ ADDITIF optionnel pour la trace → pas de bump de formatVersion. */
export interface MetaEntretien {
  valeursGen: Record<string, string> // idVar → idMod (portée entretien)
  audioRef: string | null // chemin ABSOLU (v3), ou null si aucun audio
  /** Fichier média désigné DANS le Nextcloud :
   *  chemin RELATIF à la racine du corpus serveur — n'importe où dans l'arbre,
   *  c'est la désignation qui porte l'information, pas un dossier. Le miroir
   *  télécharge ce fichier à chaque tirage ; champ ADDITIF optionnel,
   *  absent des fichiers existants → pas de bump de formatVersion. */
  audioDistant?: { chemin: string }
  /** Chemin RELATIF du `.sonal` V1 d'origine au dossier du `.crp` —
   *  trace seule, jamais utilisé pour relire. */
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
  /** Brouillons d'anonymisation entretien-locaux (pas des règles). Champ
   *  ADDITIF optionnel : absent d'un fichier v1 non migré → normalisé en []
   *  à l'ouverture ; pas de bump de formatVersion. */
  brouillonsAnon?: BrouillonAnon[]
  /** Mémoire fichier de l'ENSEMBLE multi-pseudo déclaré par entité
   *  (multi-pseudo ≤2). Clef = `cleEntite` (insensible à la casse). Ne stocke
   *  l'ensemble QUE quand il a ≥ 2 pseudos (mono = porté par les occurrences) ;
   *  sert uniquement de mémoire à la bascule du menu contextuel et à l'affichage
   *  « Claire / Rebecca » sur une ligne STANDALONE (ni une règle, ni partagé,
   *  ni dans corpus.json). Champ ADDITIF optionnel → pas de bump. */
  pseudosDeclares?: Record<string, string[]>
  /** Notes structurées de l'entretien (corps + surlignages + rang). Champ
   *  ADDITIF optionnel, normalisé en [] à l'ouverture ; pas de bump. */
  notes?: Note[]
  /** Blocs `.sonal` non modélisés (règles d'anon, notes), transportés tels quels pour un export sans perte. */
  legacy?: Record<string, unknown>
}



/** La charge utile envoyée par le renderer pour sauver un entretien.
 *  Sans les champs d'intendance formatVersion/lastModified, posés par le store. */
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

/** Catégorie de note : définition au niveau CORPUS (comme une catégorie du
 *  codebook), référencée par les notes de tous les entretiens.
 *  Le `corps` d'une note est stocké en HTML sanitisé (texte échappé +
 *  balises `<mark>` pour les passages importants). */
export interface NoteCategory {
  id: string
  nom: string
  couleur: string
}

/** Note d'entretien : corps HTML sanitisé + passages `<mark>` (importants,
 *  gras) et `<em>` (liés à un commentaire, italique), ordre par `rang`
 *  (manuel, « après la dernière » = max+1). `date` null = pas de date (cas du
 *  bac « générale » migré depuis la V1). `titre` optionnel : affiché seul en
 *  vue cartes à la place d'un extrait du corps. */
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

/** Résultat de lecture d'un entretien :
 *  soit ok + données,
 *  soit un refus typé (version inconnue / fichier absent). */
export type LectureEntretien =
  | {
      ok: true
      data: EntretienFichier
      /** Corpus distant uniquement : présent quand l'ouverture est REFUSÉE en
       *  écriture (verrou tenu par autrui) → lecture seule avec détenteur.
       *  Champ ADDITIF optionnel, pas de bump. */
      verrouTenuParAutrui?: VerrouTenuParAutrui
    }
  | { ok: false; raison: 'version' | 'absent' }

/** Qui tient le verrou — version affichable, sans détails techniques. */
export interface VerrouTenuParAutrui {
  userId: string
  machineId: string
  acquiredAt: string
}



/** Locuteur : indexé par entretien (le `loc` d'un bloc référence cet index). */
export interface Locuteur {
  index: number
  nom: string
  /** Interviewer (celui qui pose les questions) :
   *  ses tours s'affichent en italique.
   *  Convention SonalPi : un « ? » dans le nom — artefact de format,
   *  réintroduit à l'export seulement (comme `l="all"` EAV).
   *  Champ ADDITIF optionnel : pas de bump de formatVersion. */
  interviewer?: boolean
  /** Pseudonymisation de l'ÉTIQUETTE du locuteur :
   *  `pseudo` = pseudonyme appliqué au libellé — posé, le tour s'affiche
   *  « Nom̶ [Pseudo] » (même idiome CSS que le texte anon).
   *  Champ ADDITIF optionnel : pas de bump de formatVersion. */
  pseudo?: string
  /** Couleur du NOM du locuteur dans l'éditeur : choisie dans
   *  une palette prédéfinie depuis le tableau des locuteurs ; ABSENTE = couleur
   *  auto par index (PALETTE_PASTILLES_LOCUTEURS). Champ ADDITIF optionnel. */
  couleur?: string
  /** Décision persistée sur la pseudonymisation du libellé (parité SonalPi
   *  `loc-anon` / `loc-suggere-refuse`) : `'confirme'` (pseudo affiché) ou
   *  `'refuse'` (libellé en clair + ⊘). Absent = aucune décision (rien — le
   *  « suggéré » est une REQUÊTE, jamais stockée). */
  pseudoEtat?: 'confirme' | 'refuse'
  valeursLoc: Record<string, string> // idVar → idMod
  personneRef: string | null
}

// ══════════════════════════════════════════════════════════════════════════
// Codebook & variables EAV — définitions au niveau du corpus
// ══════════════════════════════════════════════════════════════════════════

/** Une catégorie du codebook (une définition — elle vit au corpus, pas chez les entretiens). */
export interface Categorie {
  id: string
  nom: string
  couleur?: string
  /** Taille de police (px) appliquée aux passages codés — parité SonalPi :
   *  son `tabThm[].taille` est un nombre nu. Champ ADDITIF optionnel,
   *  pas de bump de formatVersion ; absent = taille du texte. */
  taille?: number
  ordre: number
  parent: string | null
  actif: boolean
  codeExport: string // cat_XXX — attribut d'export, pas l'identité
}

/** Modalité — entité DÉPENDANTE d'une variable (identité relative, imbriquée). */
export interface Modalite {
  id: string
  lib: string
  mExport: number // code numérique d'export .sonal, pas l'identité
}

/** Variable EAV (définition → corpus). La `portee` décide où vit la valeur :
 *  à l'entretien (meta.valeursGen) ou au locuteur (Locuteur.valeursLoc) ;
 *  pas de sentinelle `l="all"`, la valeur va chez son propriétaire. */
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
// Requêtes & résultats d'opérations (jamais persistés)
// ══════════════════════════════════════════════════════════════════════════

/** Suppression d'une catégorie : refusée tant qu'elle est utilisée,
 *  comptage par requête sur les entretiens.
 *  Politique explicite, pas de suppression en cascade. */
export type ResultatSuppressionCategorie =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }

/** Champs modifiables d'une catégorie : renommer, recolorer, retailler,
 *  activer. `taille: undefined` dans le patch = revenir à la taille par défaut,
 *  le spread écrase la valeur (JSON.stringify retire la clé). */
export type PatchCategorie = Partial<Pick<Categorie, 'nom' | 'couleur' | 'taille' | 'actif'>>

/** Modèle de modalités réutilisable : un nom et la liste des libellés. Porté par
 *  le registre du profil (settings.json, « Mes modèles » de l'éditeur de
 *  variables) ; un modèle s'exporte/importe en JSON pour passer d'une machine
 *  à l'autre. Les modèles INTÉGRÉS (Sexe, Âge, PCS…) restent du code, en dur. */
export interface ModeleEAV {
  nom: string
  modalites: string[]
}

/** Suppression refusée tant qu'utilisée (variables/modalités, comme les catégories). */
export type ResultatSuppression =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }


/** Cible d'une valeur EAV posée depuis la table de données :
 *  la portée entretien, ou un locuteur donné (par son index). */
export type CibleValeur = { type: 'entretien' } | { type: 'locuteur'; index: number }

/** Un item du LOT « modifier en lot » : UNE valeur EAV à poser dans UN
 *  entretien. v1 : cible entretien uniquement (portée locuteur hors périmètre —
 *  les locuteurs diffèrent d'un entretien à l'autre). */
export interface ItemLotValeur {
  entretienId: string
  cible: CibleValeur
  idVar: string
  /** '' = effacer la valeur (même sémantique que `poserValeur`). */
  idMod: string
}

/** Retour du lot : succès PAR ENTRETIEN (regroupés — un seul cycle par fichier
 *  même si plusieurs valeurs), échecs NOMMÉS (raison affichable telle quelle).
 *  Un échec ponctuel ne bloque jamais les autres entretiens du lot. */
export interface ResultatLotValeur {
  succes: string[]
  echecs: { id: string; raison: string }[]
}

/** Cible du lot d'application en masse d'une règle d'anonymisation :
 *  un entretien fermé, plus la règle à y poser. `plages` (optionnel) restreint
 *  l'application aux SEULES occurrences cochées de la vue vérification
 *  (positions PM) ; absent → toutes les occurrences « à traiter ».
 *  Diff complet façon V1 (« Valider ») : `retirer` dé-pseudonymise des
 *  occurrences déjà anonymisées, `exception` pose une exception (ne pas
 *  anonymiser), `retirerException` la retire (l'occurrence redevient
 *  « à traiter ») — chaque liste porte des positions PM exactes. */
export interface CibleRegleAnon {
  entretienId: string
  regleId: string
  plages?: { from: number; to: number }[]
  retirer?: { from: number; to: number }[]
  exception?: { from: number; to: number }[]
  retirerException?: { from: number; to: number }[]
}

/** Retour du lot d'anonymisation en masse (même politique que
 *  `ResultatLotValeur`).
 *  Chaque succès porte le nombre d'occurrences posées ;
 *  l'UI ajuste ses compteurs avec ces chiffres, sans re-scan. */
export interface ResultatLotAnon {
  succes: { id: string; nb: number; titre: string }[]
  echecs: { id: string; raison: string }[]
}

/** Un segment du résumé thématique d'un entretien (requête, jamais stockée),
 *  parité SonalPi (`resumeGraphique`).
 *  La position est une proportion dans le texte (pas le temps audio),
 *  en % [0..100].
 *  `codes` = les thèmes couverts ;
 *  `pos`/`posFin` = positions PM des bornes (clic → ouvre le texte là,
 *  lecteur → re-projection sur l'axe du temps via les ancres). */
export interface SegmentThematique {
  deb: number
  fin: number
  pos: number
  posFin: number
  codes: string[]
}

/** La matrice corpus = requête (jamais stockée) :
 *  par entretien, ses valeurs de portée entretien et celles de ses locuteurs ;
 *  le renderer aplatit le tout en lignes pour la table de données. */
export interface MatriceEntree {
  entretienId: string
  titre: string
  valeursGen: Record<string, string>
  locuteurs: { index: number; nom: string; valeursLoc: Record<string, string> }[]
}
export type MatriceCorpus = MatriceEntree[]
