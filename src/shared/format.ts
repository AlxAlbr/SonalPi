import type { Annotation } from './entretien/annotation'

/**
 * Contrat du FORMAT NATIF SonalAsynchro (MODELE_OBJET §3-§5). Partagé main ⇄ renderer.
 * Toute évolution de structure = bump de FORMAT_VERSION + migration explicite
 * (D6) : une version inconnue est refusée poliment, jamais lue partiellement.
 */
export const FORMAT_VERSION = 1

export function versionSupportee(v: unknown): boolean {
  return v === FORMAT_VERSION
}

/** Locuteur : indexé par entretien (MODELE_OBJET §4). */
export interface Locuteur {
  index: number
  nom: string
  valeursLoc: Record<string, string> // idVar → idMod
  personneRef: string | null
}

/** Une catégorie du codebook (définition, MODELE_OBJET2 §2). */
export interface Categorie {
  id: string
  nom: string
  couleur?: string
  ordre: number
  parent: string | null
  actif: boolean
  codeExport: string // cat_XXX — attribut d'export, pas l'identité
}

/** Modalité — entité DÉPENDANTE d'une variable (MODELE_OBJET2 §5). */
export interface Modalite {
  id: string
  lib: string
  mExport: number // code numérique d'export .sonal, pas l'identité
}

/** Variable EAV (définition → corpus). La `portee` décide où vit la VALEUR :
 *  `entretien` → meta.valeursGen ; `locuteur` → Locuteur.valeursLoc (pas de
 *  sentinelle `l="all"` — la valeur va chez son propriétaire, MODELE_OBJET2 §5). */
export interface Variable {
  id: string
  lib: string
  portee: 'entretien' | 'locuteur'
  priv: boolean
  ordre: number
  vExport: number
  modalites: Modalite[]
}

/** Métadonnées légères de listing (le membership du corpus). */
export interface EntretienRef {
  titre: string
  date: string | null
  lastModified: string // ISO — sert au contrôle de fraîcheur croisée (D6)
}

/** `entretiens/<id>.json` — miroir fichier de l'agrégat Entretien. */
export interface EntretienFichier {
  formatVersion: number
  lastModified: string
  corpsTexte: unknown // doc ProseMirror (JSON canonique)
  annotations: Annotation[]
  locuteurs: Locuteur[]
  meta: { valeursGen: Record<string, string>; audioRef: string | null }
  /** Blocs `.sonal` non encore modélisés (var/dic/dat/anon, notes), transportés
   *  tels quels pour un export sans perte. Modélisés aux étapes 5/6 → disparaît. */
  legacy?: Record<string, unknown>
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

/** La charge utile qu'un renderer envoie pour sauver un entretien (sans les
 *  champs d'intendance formatVersion/lastModified, posés par le store). */
export interface PayloadEntretien {
  corpsTexte: unknown
  annotations: Annotation[]
  locuteurs: Locuteur[]
  meta: { valeursGen: Record<string, string>; audioRef: string | null }
  legacy?: Record<string, unknown>
}

/** Résultat de lecture d'un entretien : soit ok + données (+ drapeau périmé),
 *  soit un refus typé (version inconnue / fichier absent). */
export type LectureEntretien =
  | { ok: true; data: EntretienFichier; perime: boolean }
  | { ok: false; raison: 'version' | 'absent' }

/** Suppression d'une catégorie : refusée tant qu'elle est utilisée (compteur =
 *  requête sur les entretiens). Politique explicite, pas de suppression en cascade. */
export type ResultatSuppressionCategorie =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }

/** Champs modifiables d'une catégorie (renommer / recolorer / activer). */
export type PatchCategorie = Partial<Pick<Categorie, 'nom' | 'couleur' | 'actif'>>

/** Suppression refusée tant qu'utilisée (variables/modalités, comme les catégories). */
export type ResultatSuppression =
  | { ok: true; corpus: CorpusFichier }
  | { ok: false; usages: number }

/** Un dossier de corpus (pour l'Accueil : corpus courant + récents — S2 inc. 2). */
export interface DossierCorpus {
  dir: string
  nom: string
}
/** Résultat d'ouverture/changement de dossier de corpus : le dossier + son contenu. */
export interface OuvertureCorpus extends DossierCorpus {
  corpus: CorpusFichier
}

/** Cible d'une valeur EAV posée depuis la table de données (D-S11) : la portée
 *  entretien, ou un locuteur donné (par son index). */
export type CibleValeur = { type: 'entretien' } | { type: 'locuteur'; index: number }

/** La MATRICE corpus = REQUÊTE (jamais stockée) : par entretien, ses valeurs de
 *  portée entretien + celles de ses locuteurs. Le renderer aplatit en lignes. */
export interface MatriceEntree {
  entretienId: string
  titre: string
  valeursGen: Record<string, string>
  locuteurs: { index: number; nom: string; valeursLoc: Record<string, string> }[]
}
export type MatriceCorpus = MatriceEntree[]
