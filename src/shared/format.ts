import type { Annotation } from './entretien/annotation'
import type { DocumentExport } from './export/documentExport'
import type { Ancre } from './entretien/audio'
import type { ReperePassage } from './entretien/reperesPassages'
import type { Recueil } from './corpus/recueils'
import type { Cas, FamilleCas, DefinitionAttributCas } from './corpus/cas'
import type { TableauBord } from './corpus/tableaubord'
import type { TraitementsLexico } from './lexico/types'

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
 *
 *  formatVersion 4 : les recueils partagés vivent dans `corpus.json` et les
 *  repères de leurs passages vivent avec chaque entretien.
 *
 *  formatVersion 5 : les cas analytiques partagés vivent dans `corpus.json` et
 *  réutilisent les repères de passage des entretiens.
 *
 *  formatVersion 6 : les règles de cas réunissent des personnes ou des entretiens entiers.
 */
/** Format 7 : familles et règles de modalités, sans copie des textes projetés.
 *  Format 8 : définitions d'attributs de cas, valeurs saisies et recettes de dérivation.
 *  Format 9 : réglages Lexico partagés, sans copie de l'index ni des résultats. */
export const FORMAT_VERSION = 9

export function versionSupportee(v: unknown): boolean {
  // Le format 9 est additif ; le format 8 reste lisible pour permettre sa migration.
  return v === 8 || v === FORMAT_VERSION
}

// ══════════════════════════════════════════════════════════════════════════
// Corpus exemples — identité et progression des parcours.
// ══════════════════════════════════════════════════════════════════════════

/** Identité stable d'un parcours de découverte. */
export type ParcoursId = 'preparation' | 'traitement' | 'analyse' | 'organisation'

/** Progression d'un parcours, transportée avec le corpus d'apprentissage. */
export interface ProgressionParcoursDemo {
  validees: string[]
  contexte?: Record<string, string>
}

/** Origine et usage d'un corpus exemple, avec ses acquis pédagogiques. */
export interface MarqueurDemo {
  id: string
  exemple: import('./exemples').ExempleId
  usage: import('./exemples').UsageExemple
  racineSources: string
  parcours: Partial<Record<ParcoursId, ProgressionParcoursDemo>>
  /** Parcours auquel appartient ce corpus d’apprentissage. */
  parcoursApprentissage?: ParcoursId
  /** Dernier parcours choisi ; aucune étape active n'est restaurée automatiquement. */
  dernierParcoursId?: ParcoursId
}

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

/** Identité du `.crp` d'origine et, pour GitLab, version source figée.
 *  Champ additif optionnel.
 */
export interface SourceV1 {
  /** Chemin local du `.crp`, ou chemin dans le dépôt lorsque la source est GitLab. */
  cheminCrp: string
  /** Source GitLab figée ; aucune information d'accès ne voyage ici. */
  gitlab?: { urlInstance: string; projetId: number; commit: string }
  /** `dateCreation` portée par le `.crp` (nouveauCorpus), sinon null. */
  dateCreation: string | null
}

/** `corpus.json` — définitions + membership. */
export interface CorpusFichier {
  formatVersion: number
  codebook: Record<string, Categorie>
  variables: Record<string, Variable>
  reglesAnon: Record<string, RegleAnon>
  /** Bloque les publications liées pendant le transfert GitLab d’une définition. */
  dissociationAnon?: { operationId: string; regleId: string; fournisseur?: 'webdav'; cibles?: string[] }
  suppressionAnon?: { operationId: string; regleId: string }
  retraitVarianteAnon?: { operationId: string; regleId: string; pseudoRetire: string; pseudoConserve: string }
  personnes: Record<string, Personne>
  membership: Record<string, EntretienRef>
  /** Ordre courant des entretiens. Absent dans les anciens corpus. */
  ordreEntretiens?: string[]
  /** Identité du PROJET : vit dans corpus.json → insensible au renommage du dossier.
   *  Champ ADDITIF optionnel. */
  nom?: string
  /** Trace d'origine — champ ADDITIF optionnel. */
  meta?: { sourceV1?: SourceV1 }
  /** Origine, usage et progression d'un corpus exemple.
   *  Champ additif optionnel, absent pour un corpus ordinaire. */
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
  /** Documents éditoriaux partagés, indexés par leur identité stable. */
  recueils?: Record<string, Recueil>
  /** Unités d'étude analytiques partagées, indexées par leur identité stable. */
  cas?: Record<string, Cas>
  famillesCas?: Record<string, FamilleCas>
  /** Définitions d'attributs de cas, partagées par tout le corpus ;
   *  les valeurs, elles, vivent sur chaque cas. Champ ADDITIF optionnel (format 8). */
  attributsCas?: Record<string, DefinitionAttributCas>
  /** Tableau de bord d'avancement (suivi d'étapes par entretien suivi). Un corpus ancien sans ce champ est normalisé vers le tableau par défaut.
   *  Champ ADDITIF optionnel — corpus-ONLY, sans bump de version (comme `categoriesNote`). */
  tableaubord?: TableauBord
  /** Décisions lexicales partagées ; l'index et les exports restent dérivés. */
  lexico?: TraitementsLexico
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

/** Entrée des récents, locale ou distante.
 *  Une destination distante se rouvre par son fournisseur, jamais par son chemin miroir.
 */
export type EntreeRecent =
  | ({ type: 'local'; exemple?: import('./exemples').ExempleId } & DossierCorpus)
  | {
      type: 'distant'
      id: string
      nom: string
      url: string
      fournisseur?: 'webdav' | 'gitlab'
    }

/** Identité du dossier + contenu du corpus, dans un seul message IPC. */
export interface OuvertureCorpus extends DossierCorpus {
  corpus: CorpusFichier
}

/** Préfixe de l'erreur quand le dossier du corpus courant disparaît sur disque en session : le store refuse de le ré-amorcer en silence, le renderer bascule sur un autre récent. */
export const CORPUS_SUPPRIME = 'CORPUS_SUPPRIME'

/** Résultat d'une copie de sauvegarde du corpus local en archive ZIP.
 *  `refus` couvre les cas où il n'y a rien à archiver (corpus distant,
 *  aucun corpus ouvert) ; `echec` les erreurs d'écriture.
 *  L'appelant distingue les deux, pour choisir entre information et erreur. */
export type ResultatArchiveCorpus =
  | { etat: 'succes'; chemin: string; fichiers: number }
  | { etat: 'annule' }
  | { etat: 'refus'; message: string }
  | { etat: 'echec'; message: string }

// ══════════════════════════════════════════════════════════════════════════
// Entretiens — `entretiens/<id>.json`, leurs locuteurs.
// ══════════════════════════════════════════════════════════════════════════

/** Modes de tri persistant des entretiens. */
export type ModeTriEntretiens = 'alpha' | 'ajout' | 'modif' | 'longueur'

/** Métadonnées légères de listing (le membership du corpus). */
export interface EntretienRef {
  titre: string
  date: string | null
  /** ISO — date du fichier entretien : cache-busting de la forme d'onde des cartes Corpus (`?v=lastModified`) ; le disque est la vérité en mono-utilisateur (cf. corpusStore). */
  lastModified: string
  /** Rang immuable attribué lors de l'ajout au corpus. */
  rangAjout?: number
}



/** Brouillon d'anonymisation entretien-local (jamais une règle) : entité saisie sans occurrence posée, ou pseudo saisi sans validation ; une fois validé (Entrée), les occurrences sont posées et le brouillon consommé. */
export interface BrouillonAnon {
  entite: string
  pseudo?: string
}

/** Chemin relatif d'un média partagé, sans adresse ni secret.
 *  `gitlab` désigne le dépôt ; `webdav` désigne le dossier WebDAV associé.
 *  Sans fournisseur, le comportement historique reste conservé :
 *  dossier du corpus WebDAV, ou base externe du corpus GitLab.
 */
export interface ReferenceMediaDistant {
  chemin: string
  fournisseur?: 'webdav' | 'gitlab'
}

/** Forme canonique d'une désignation neuve : le transport y est explicite. */
export function referenceMediaDistant(
  chemin: string,
  fournisseur: 'webdav' | 'gitlab' = 'webdav',
): ReferenceMediaDistant {
  return { chemin, fournisseur }
}

/** Métadonnées d'un entretien : valeurs EAV de portée entretien, référence audio (absolue, formatVersion 3), et trace de migration SonalPi1 — champ ADDITIF optionnel, sans bump de formatVersion. */
export interface MetaEntretien {
  valeursGen: Record<string, string> // idVar → idMod (portée entretien)
  audioRef: string | null // chemin ABSOLU (v3), ou null si aucun audio
  /** Média partagé dont la référence indique la destination.
   *  Champ additif optionnel.
   */
  audioDistant?: ReferenceMediaDistant
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
  /** Définitions textuelles locales complètes, sans occurrence implicite. */
  definitionsAnonLocales?: import('./entretien/anon/definitionsLocales').DefinitionAnonLocale[]
  /** Notes structurées de l'entretien (corps + surlignages + rang) ; normalisées en [] à l'ouverture.
   *  Champ ADDITIF optionnel. */
  notes?: Note[]
  /** Repères autonomes utilisés par les passages référencés. */
  reperesPassages?: ReperePassage[]
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
  definitionsAnonLocales?: import('./entretien/anon/definitionsLocales').DefinitionAnonLocale[]
  notes?: Note[]
  reperesPassages?: ReperePassage[]
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
  /** Locuteurs concernés dans cet entretien. Une liste vide désigne une note générale. */
  locuteurIds?: string[]
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



/** Identité transverse facultative, indépendante des noms locaux et des pseudonymes. */
export interface Personne {
  id: string
  nom: string
}

/** Locuteur : indexé par entretien — le `loc` d'un bloc référence cet index. */
export interface Locuteur {
  /** Identité stable utilisée pour rapprocher plusieurs versions d'un entretien.
   *  Absente dans les anciens fichiers jusqu'à leur prochaine édition. */
  id?: string
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
  /** Une déliaison volontaire interdit la recréation automatique au nommage. */
  personneDeliee?: boolean
  rapprochementsRefuses?: string[]
}

// ══════════════════════════════════════════════════════════════════════════
// Codebook & variables EAV — définitions au niveau du corpus.
// ══════════════════════════════════════════════════════════════════════════

/** Une catégorie du codebook — définition au niveau du corpus, pas chez les entretiens. */
export interface Categorie {
  id: string
  nom: string
  /** Précision facultative sur le périmètre du thème.
   *  Champ ADDITIF optionnel. */
  description?: string
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

/** Champs modifiables d'une catégorie. `taille: undefined` revient à la
 *  taille par défaut et `description: undefined` retire la description. */
export type PatchCategorie = Partial<Pick<Categorie, 'nom' | 'description' | 'couleur' | 'taille' | 'actif'>>

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
 *  `plages` restreint aux seules occurrences cochées ; absent ou vide → aucune pose.
 *  `toutes` demande explicitement l'application à toutes les occurrences à traiter.
 *  `retirer` dé-pseudonymise, `exception` pose une exception, `retirerException` la retire — chaque liste porte des positions PM exactes. */
export interface CibleRegleAnon {
  entretienId: string
  regleId: string
  /** Empreinte du texte, des décisions et de la règle lors de l'aperçu. */
  empreinte?: string
  toutes?: boolean
  plages?: { from: number; to: number }[]
  retirer?: { from: number; to: number }[]
  exception?: { from: number; to: number }[]
  retirerException?: { from: number; to: number }[]
}

export interface BilanMutationAnon {
  poses: number
  retraits: number
  exceptionsAjoutees: number
  exceptionsRetirees: number
}

export interface ResultatMutationAnon {
  nb: number
  actions: BilanMutationAnon
}

/** Retour du lot d'anonymisation en masse, même politique que `ResultatLotValeur`.
 *  Chaque succès porte le nombre de mutations obtenues (poses, retraits et exceptions),
 *  et non un compteur d'intention de la sélection. */
export interface ResultatLotAnon {
  succes: (ResultatMutationAnon & { id: string; titre: string })[]
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

/** Demande d'export DOCX d'un entretien (renderer → main) : le document
 *  intermédiaire structuré est déjà assemblé par le renderer ; le main le
 *  convertit en Paragraphes et TextRuns sans décoder AUCUN marqueur textuel
 *  du contenu (`{g}`, `**…**` restent littéraux). */
export interface DemandeExportDocx {
  nomSuggere: string
  titre: string
  entete: boolean
  document: DocumentExport
}

/** Demande d'export PDF : le HTML autonome est imprimé en PDF par le main. */
export interface DemandeExportPdf {
  nomSuggere: string
  html: string
}

/** Demande d'export DOCX du CORPUS (document combiné) : le buffer est
 *  construit par le main dans le dossier de destination déjà choisi. */
export interface DemandeExportDocxCorpus {
  /** Nom du corpus (en-tête du document combiné). */
  titre: string
  entete: boolean
  document: DocumentExport
}
