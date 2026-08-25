import type { Categorie, CorpusFichier, PatchCategorie } from '../format'

/**
 * Codebook (thèmes) de l'agrégat Corpus. Fonctions PURES
 * (aucune I/O, aucun electron), séparées de leur STOCKAGE (`main/corpusStore.ts`).
 * Les transforms mutent le `CorpusFichier` qu'on leur passe (objet fraîchement lu,
 * possédé par l'appelant) et renvoient l'id créé.
 */

// ── Codebook (thèmes) ───────────────────────────────────────────────────────

/** Prochain code d'EXPORT libre `cat_NNN` : simple attribut de lisibilité à
 *  l'export (PAS l'identité — c'est un id opaque injecté), jamais réutilisé
 *  (un code retiré n'est pas repris tant que le max est au-dessus).
 *  Un compteur suffit ici : une collision de codeExport à la fusion est bénigne
 *  (affichage seul), contrairement à une collision d'id. */
export function prochainCodeCategorie(codebook: Record<string, Categorie>): string {
  let max = 0
  for (const c of Object.values(codebook)) {
    const m = c.codeExport.match(/cat_(\d+)/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return 'cat_' + String(max + 1).padStart(3, '0')
}

/** Ajoute une catégorie : id OPAQUE injecté (`genId('cat')` côté store — unique
 *  par construction, donc sûr en création offline divergente), `codeExport`
 *  séquentiel pour la lisibilité à l'export, ordre en fin. `parent` = racine
 *  par défaut, ou l'id d'un thème pour un sous-thème. Renvoie l'id. */
export function ajouterCategorie(
  corpus: CorpusFichier,
  nom: string,
  parent: string | null = null,
  genId: () => string,
): string {
  const id = genId()
  const codeExport = prochainCodeCategorie(corpus.codebook)
  const ordre = Object.values(corpus.codebook).reduce((m, c) => Math.max(m, c.ordre), -1) + 1
  corpus.codebook[id] = { id, nom, ordre, parent, actif: true, codeExport }
  return id
}

/** Renommer / recolorer / (dés)activer — édite la DÉFINITION. Les entretiens
 *  référencent par id → aucun n'est touché (le cœur de l'archi par-référence). */
export function modifierCategorie(corpus: CorpusFichier, id: string, patch: PatchCategorie): void {
  if (corpus.codebook[id]) corpus.codebook[id] = { ...corpus.codebook[id], ...patch }
}

/** Réordonne DANS LA FRATRIE (mêmes `parent`) : échange l'`ordre` avec le voisin
 *  frère (sens = -1 haut / +1 bas ; borné aux extrémités de la fratrie). */
export function deplacerCategorie(corpus: CorpusFichier, id: string, sens: -1 | 1): void {
  const cat = corpus.codebook[id]
  if (!cat) return
  const fratrie = Object.values(corpus.codebook)
    .filter((c) => c.parent === cat.parent)
    .sort((a, b) => a.ordre - b.ordre)
  const i = fratrie.findIndex((c) => c.id === id)
  const j = i + sens
  if (i >= 0 && j >= 0 && j < fratrie.length) {
    const o = fratrie[i].ordre
    fratrie[i].ordre = fratrie[j].ordre
    fratrie[j].ordre = o
  }
}

/** Change le PARENT d'une catégorie dans l'arbre du codebook (`null` = racine).
 *  Refus silencieux si la cible est la catégorie elle-même ou un de ses
 *  descendants : une branche ne peut pas devenir son propre ancêtre. La catégorie
 *  arrive en fin de sa nouvelle fratrie ; ses enfants restent accrochés à elle,
 *  et les codages suivent sans bouger (référence par id). */
export function migrerCategorie(
  corpus: CorpusFichier,
  id: string,
  nouveauParent: string | null,
): void {
  const cat = corpus.codebook[id]
  if (!cat) return
  if (nouveauParent != null) {
    const cible = corpus.codebook[nouveauParent]
    if (!cible || nouveauParent === id) return
    let p = cible.parent
    while (p != null) {
      if (p === id) return // descendant de la catégorie migrée
      p = corpus.codebook[p]?.parent ?? null
    }
  }
  cat.parent = nouveauParent
  cat.ordre = Object.values(corpus.codebook).reduce((m, c) => Math.max(m, c.ordre), -1) + 1
}

/** Retire une catégorie du codebook et PROMEUT ses enfants au parent du supprimé
 *  (pas d'orphelins). La POLITIQUE refus-si-utilisée est décidée par l'orchestration. */
export function retirerCategorie(corpus: CorpusFichier, id: string): void {
  const parent = corpus.codebook[id]?.parent ?? null
  for (const c of Object.values(corpus.codebook)) if (c.parent === id) c.parent = parent
  delete corpus.codebook[id]
}

// ── Hiérarchie des thèmes (`parent` = modèle ; `rang` SonalPi = profondeur dérivée à l'export, reconstruite à l'import) ──

/** Reconstruit `parent` depuis la séquence de profondeurs `rang` à l'import
 *  (SonalPi ne stocke que la profondeur) : le parent d'un nœud à la profondeur d =
 *  le dernier nœud rencontré à d-1. Gère N niveaux ; profondeur sans parent → racine. */
export function parentsDepuisRangs(sequence: { id: string; rang: number }[]): Record<string, string | null> {
  const parent: Record<string, string | null> = {}
  const dernierParProfondeur: string[] = [] // index = profondeur → id du dernier vu
  for (const { id, rang } of sequence) {
    parent[id] = rang > 0 ? (dernierParProfondeur[rang - 1] ?? null) : null
    dernierParProfondeur[rang] = id
    dernierParProfondeur.length = rang + 1 // une nouvelle branche oublie les profondeurs plus bas
  }
  return parent
}

/** Un nœud du codebook en pré-ordre, avec sa profondeur et sa position de fratrie. */
export interface NoeudTheme {
  cat: Categorie
  profondeur: number
  premier: boolean // 1er de sa fratrie (▲ désactivé)
  dernier: boolean // dernier de sa fratrie (▼ désactivé)
}

/** Aplatit le codebook en **pré-ordre** (parent puis ses enfants, récursif ;
 *  fratrie triée par `ordre`). Sert à l'affichage indenté ET à l'export : chaque
 *  enfant suit son parent → la séquence des `rang`=profondeur se relit sans perte.
 *  Un parent inexistant (donnée importée partielle) → traité comme racine. */
export function ordreThemes(codebook: Record<string, Categorie>): NoeudTheme[] {
  const parentEffectif = (c: Categorie): string | null =>
    c.parent != null && codebook[c.parent] != null ? c.parent : null
  const enfants = (parent: string | null) =>
    Object.values(codebook)
      .filter((c) => parentEffectif(c) === parent)
      .sort((a, b) => a.ordre - b.ordre)
  const out: NoeudTheme[] = []
  const visiter = (parent: string | null, profondeur: number) => {
    const fratrie = enfants(parent)
    fratrie.forEach((cat, i) => {
      out.push({ cat, profondeur, premier: i === 0, dernier: i === fratrie.length - 1 })
      visiter(cat.id, profondeur + 1)
    })
  }
  visiter(null, 0)
  return out
}
