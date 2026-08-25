import type { Note, NoteCategory } from '../format'

/**
 * Notes d'entretien : typologie des catégories (définitions CORPUS, nom +
 * couleur) et notes structurées (corps HTML sanitisé, rang manuel). Le
 * `corps` est du HTML restreint : texte échappé + balises `<mark>` pour les
 * passages importants. La sanitzation proprement dite vit côté renderer
 * (parseur DOM) ; ce module est pur et partagé.
 */

/** Catégories par défaut d'un corpus sans `categoriesNote`.
 *  Quatre bacs : trois typés + « générale » (bac récupérant le texte libre V1,
 *  sans date). Couleurs puisées dans la même palette que les locuteurs pour
 *  rester cohérent à l'écran. */
export const CATEGORIES_NOTE_DEFAUT: NoteCategory[] = [
  { id: 'ncat_postcollecte', nom: 'post-collecte', couleur: '#ffb74d' },
  { id: 'ncat_resume', nom: 'résumé', couleur: '#64b5f6' },
  { id: 'ncat_reflexion', nom: 'réflexion', couleur: '#ba68c8' },
  { id: 'ncat_generale', nom: 'générale', couleur: '#81c784' },
]

/** Normalise les catégories de note d'un entretien : on ne JAMAIS ouvre un
 *  onglet Notes sans catégories — un fichier non migré obtient les bacs par
 *  défaut. Les ids de défaut sont stables : un fichier réouvert les retrouve. */
export function normaliserCategoriesNote(c?: NoteCategory[] | null): NoteCategory[] {
  if (!Array.isArray(c) || c.length === 0) return CATEGORIES_NOTE_DEFAUT.map((x) => ({ ...x }))
  return c.map((x) => ({
    id: String(x.id ?? ''),
    nom: String(x.nom ?? 'note'),
    couleur: String(x.couleur ?? '#9e9e9e'),
  }))
}

/** Nombre de notes référençant `categorieId` parmi les entretiens fournis.
 *  Garde de suppression au niveau corpus : une catégorie utilisée ne se
 *  supprime pas (parité thèmes). */
export function compterUsagesCategorieNote(
  entretiens: { notes?: Note[] }[],
  categorieId: string,
): number {
  return entretiens.reduce(
    (n, e) => n + (e.notes ?? []).filter((x) => x.categorieId === categorieId).length,
    0,
  )
}

/** Normalise la liste de notes : on accepte l'absence (fichier non migré) → []. */
export function normaliserNotes(n?: Note[] | null): Note[] {
  if (!Array.isArray(n)) return []
  return n.map((x) => ({
    id: String(x.id ?? ''),
    categorieId: String(x.categorieId ?? '') || 'ncat_generale',
    date: x.date ?? null,
    statut: x.statut === 'public' ? 'public' : 'prive',
    corps: String(x.corps ?? ''),
    rang: Number.isFinite(x.rang) ? x.rang : 0,
    creeLe: String(x.creeLe ?? new Date().toISOString()),
    modifieLe: x.modifieLe ?? null,
  }))
}

/** Prochain rang d'insertion : « après la dernière » = max + 1 (0 si vide). */
export function prochainRang(notes: Note[]): number {
  return notes.reduce((m, n) => (n.rang > m ? n.rang : m), -1) + 1
}

/** Trie les notes par rang croissant (ordre d'affichage par défaut). */
export function notesParRang(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.rang - b.rang)
}

/** Recalcule les rangs à partir de l'ordre du tableau fourni (après un
 *  glisser-déposer) : 0, 1, 2… — indices denses et stables. */
export function renumeroterRangs(notes: Note[]): Note[] {
  return notes.map((n, i) => ({ ...n, rang: i }))
}

/** Préfixe de génération d'ids : court et lisible dans le journal/debug. */
const PREF_ID_NOTE = 'note_'
const PREF_ID_CAT = 'ncat_'

/** Génère un id de note (unique par session ; le préfixe le distingue des
 *  ids d'annotation). */
export function genIdNote(): string {
  return PREF_ID_NOTE + Math.random().toString(36).slice(2, 10)
}

/** Génère un id de catégorie de note. Les bacs par défaut portent un id fixe
 *  (`ncat_*` littéral) ; les catégories créées par l'utilisateur en reçoivent
 *  un aléatoire. */
export function genIdCategorieNote(): string {
  return PREF_ID_CAT + Math.random().toString(36).slice(2, 10)
}
