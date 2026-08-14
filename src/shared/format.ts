import type { Annotation } from './entretien/annotation'
import type { Ancre } from './entretien/audio'

/**
 * Contrat du FORMAT NATIF SonalAsynchro (docs/MODELE_OBJET.md, partie II).
 * Partagé main ⇄ renderer.
 * Toute évolution de structure = bump de FORMAT_VERSION + migration explicite :
 * une version inconnue est refusée poliment, jamais lue partiellement.
 *
 * v2 : les timecodes ne sont plus des attributs de bloc (`deb`/`fin`) mais des
 * ANCRES `{pos, t}` positionnées dans le texte (migration v1→v2 au store).
 */
export const FORMAT_VERSION = 2

export function versionSupportee(v: unknown): boolean {
  return v === FORMAT_VERSION
}


/** `corpus.json` — définitions + membership. */
export interface CorpusFichier {
  formatVersion: number
  codebook: Record<string, Categorie>
  variables: Record<string, Variable>
  reglesAnon: Record<string, unknown>
  personnes: Record<string, unknown>
  membership: Record<string, EntretienRef>
}

/** Un dossier de corpus (pour l'Accueil : corpus courant + récents). */
export interface DossierCorpus {
  dir: string
  nom: string
}

/**  transporter l'identité du dossier en plus du contenu, dans un seul message IPC. */
export interface OuvertureCorpus extends DossierCorpus {
  corpus: CorpusFichier
}



/** Métadonnées légères de listing (le membership du corpus). */
export interface EntretienRef {
  titre: string
  date: string | null
  /** ISO — date du fichier entretien (watermark). Sert au cache-busting de
   *  l'URL de la forme d'onde des cartes Corpus ; plus de contrôle de fraîcheur
   *  croisée fichier/membership en mono-utilisateur (retiré — cf. corpusStore). */
  lastModified: string
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
  meta: { valeursGen: Record<string, string>; audioRef: string | null }
  /** Blocs `.sonal` non modélisés (règles d'anon, notes), transportés tels quels
   *  pour un export sans perte. */
  legacy?: Record<string, unknown>
}



/** La charge utile qu'un renderer envoie pour sauver un entretien (sans les
 *  champs d'intendance formatVersion/lastModified, posés par le store). */
export interface PayloadEntretien {
  corpsTexte: unknown
  annotations: Annotation[]
  ancres: Ancre[]
  locuteurs: Locuteur[]
  meta: { valeursGen: Record<string, string>; audioRef: string | null }
  legacy?: Record<string, unknown>
}

/** Résultat de lecture d'un entretien : soit ok + données, soit un refus typé
 *  (version inconnue / fichier absent). */
export type LectureEntretien =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: 'version' | 'absent' }



/** Locuteur : indexé par entretien (le `loc` d'un bloc référence cet index). */
export interface Locuteur {
  index: number
  nom: string
  /** Interviewer (celui qui pose les questions) : ses tours s'affichent en
   *  italique. Convention SonalPi : un « ? » DANS le nom — artefact de format,
   *  réintroduit à l'export seulement (comme `l="all"` EAV). Champ ADDITIF
   *  optionnel : pas de bump de formatVersion. */
  interviewer?: boolean
  valeursLoc: Record<string, string> // idVar → idMod
  personneRef: string | null
}

/** Une catégorie du codebook (une définition — elle vit au corpus, pas chez les entretiens). */
export interface Categorie {
  id: string
  nom: string
  couleur?: string
  /** Taille de police (px) appliquée aux passages codés — parité SonalPi (son
   *  `tabThm[].taille` est un nombre nu). Champ ADDITIF optionnel : pas de bump
   *  de formatVersion ; absent = taille du texte. */
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

/** Variable EAV (définition → corpus). La `portee` décide où vit la VALEUR :
 *  `entretien` → meta.valeursGen ; `locuteur` → Locuteur.valeursLoc (pas de
 *  sentinelle `l="all"` dans le modèle — la valeur va chez son propriétaire). */
export interface Variable {
  id: string
  lib: string
  portee: 'entretien' | 'locuteur'
  priv: boolean
  ordre: number
  vExport: number
  modalites: Modalite[]
}




/** Suppression d'une catégorie : refusée tant qu'elle est utilisée (compteur =
 *  requête sur les entretiens). Politique explicite, pas de suppression en cascade. */
export type ResultatSuppressionCategorie =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }

/** Champs modifiables d'une catégorie (renommer / recolorer / retailler / activer).
 *  `taille: undefined` PRÉSENT dans le patch = revenir à la taille par défaut
 *  (le spread écrase, JSON.stringify retire la clé à l'écriture). */
export type PatchCategorie = Partial<Pick<Categorie, 'nom' | 'couleur' | 'taille' | 'actif'>>

/** Suppression refusée tant qu'utilisée (variables/modalités, comme les catégories). */
export type ResultatSuppression =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }


/** Cible d'une valeur EAV posée depuis la table de données : la portée
 *  entretien, ou un locuteur donné (par son index). */
export type CibleValeur = { type: 'entretien' } | { type: 'locuteur'; index: number }

/** Un segment du RÉSUMÉ THÉMATIQUE d'un entretien (requête, jamais stockée) —
 *  parité SonalPi (`resumeGraphique`) : la position est la PROPORTION DANS LE
 *  TEXTE (pas le temps audio), en % [0..100] ; `codes` = les thèmes qui couvrent
 *  le segment ; `pos`/`posFin` = positions PM des bornes (clic → ouvrir le texte
 *  là ; lecteur → re-projection sur l'axe TEMPS via les ancres). */
export interface SegmentThematique {
  deb: number
  fin: number
  pos: number
  posFin: number
  codes: string[]
}

/** La MATRICE corpus = REQUÊTE (jamais stockée) : par entretien, ses valeurs de
 *  portée entretien + celles de ses locuteurs. Le renderer aplatit en lignes. */
export interface MatriceEntree {
  entretienId: string
  titre: string
  valeursGen: Record<string, string>
  locuteurs: { index: number; nom: string; valeursLoc: Record<string, string> }[]
}
export type MatriceCorpus = MatriceEntree[]
