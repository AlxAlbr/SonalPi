import type {
  CorpusFichier,
  EntretienFichier,
  EntretienRef,
  ModeTriEntretiens,
} from '../format'

const collateurFrancais = new Intl.Collator('fr', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
})

function comparerIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Reconstruit le membership dans l'ordre explicite fourni. */
export function projeterMembership(
  membership: Record<string, EntretienRef>,
  ordre: readonly string[],
): Record<string, EntretienRef> {
  const projection: Record<string, EntretienRef> = {}
  for (const id of ordre) {
    const ref = membership[id]
    if (ref) projection[id] = ref
  }
  return projection
}

/** Répare en mémoire l'ordre et les rangs des corpus anciens ou incomplets. */
export function normaliserOrdreEntretiens(corpus: CorpusFichier): CorpusFichier {
  const idsMembership = Object.keys(corpus.membership)
  const vus = new Set<string>()
  const ordre: string[] = []
  for (const id of corpus.ordreEntretiens ?? idsMembership) {
    if (vus.has(id) || !Object.hasOwn(corpus.membership, id)) continue
    vus.add(id)
    ordre.push(id)
  }
  for (const id of idsMembership) {
    if (vus.has(id)) continue
    vus.add(id)
    ordre.push(id)
  }

  const rangs = new Set<number>()
  const rangsValides = ordre.every((id) => {
    const rang = corpus.membership[id].rangAjout
    if (!Number.isInteger(rang) || (rang ?? -1) < 0 || rangs.has(rang!)) return false
    rangs.add(rang!)
    return true
  })
  if (!rangsValides) {
    ordre.forEach((id, rangAjout) => {
      corpus.membership[id].rangAjout = rangAjout
    })
  }

  corpus.ordreEntretiens = ordre
  corpus.membership = projeterMembership(corpus.membership, ordre)
  return corpus
}

/** Ajoute un entretien à la fin sans réutiliser un rang supprimé. */
export function ajouterEntretienOrdre(
  corpus: CorpusFichier,
  id: string,
  ref: EntretienRef,
): void {
  normaliserOrdreEntretiens(corpus)
  const rangMax = Object.values(corpus.membership).reduce(
    (max, courant) => Math.max(max, courant.rangAjout ?? -1),
    -1,
  )
  corpus.membership[id] = { ...ref, rangAjout: rangMax + 1 }
  corpus.ordreEntretiens!.push(id)
  corpus.membership = projeterMembership(corpus.membership, corpus.ordreEntretiens!)
}

/** Retire un entretien de l'appartenance et de l'ordre, sans renuméroter. */
export function retirerEntretienOrdre(corpus: CorpusFichier, id: string): void {
  normaliserOrdreEntretiens(corpus)
  delete corpus.membership[id]
  corpus.ordreEntretiens = corpus.ordreEntretiens!.filter((courant) => courant !== id)
  corpus.membership = projeterMembership(corpus.membership, corpus.ordreEntretiens)
}

function extraireTextes(noeud: unknown, textes: string[]): void {
  if (!noeud || typeof noeud !== 'object') return
  const candidat = noeud as { text?: unknown; content?: unknown }
  if (typeof candidat.text === 'string') textes.push(candidat.text)
  if (Array.isArray(candidat.content)) {
    for (const enfant of candidat.content) extraireTextes(enfant, textes)
  }
}

/** Compte les mots du texte ProseMirror avec une règle Unicode stable. */
export function compterMotsProseMirror(corpsTexte: unknown): number {
  const textes: string[] = []
  extraireTextes(corpsTexte, textes)
  return textes.join(' ').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function comparerRangPuisId(
  corpus: CorpusFichier,
  a: string,
  b: string,
): number {
  return (corpus.membership[a].rangAjout! - corpus.membership[b].rangAjout!)
    || comparerIds(a, b)
}

function dateValide(date: string | undefined): number | null {
  if (!date) return null
  const valeur = Date.parse(date)
  return Number.isFinite(valeur) ? valeur : null
}

/** Calcule un nouvel ordre sans modifier le corpus fourni. */
export function calculerOrdreEntretiens(
  source: CorpusFichier,
  mode: ModeTriEntretiens,
  entretiens?: ReadonlyMap<string, EntretienFichier>,
): string[] {
  const corpus = normaliserOrdreEntretiens(structuredClone(source))
  const ids = [...corpus.ordreEntretiens!]
  const necessiteContenu = mode === 'modif' || mode === 'longueur'
  if (necessiteContenu) {
    for (const id of ids) {
      if (!entretiens?.has(id)) {
        throw new Error(`L’entretien « ${corpus.membership[id].titre} » ne peut pas être lu.`)
      }
    }
  }

  return ids.sort((a, b) => {
    if (mode === 'alpha') {
      return collateurFrancais.compare(corpus.membership[a].titre, corpus.membership[b].titre)
        || comparerRangPuisId(corpus, a, b)
    }
    if (mode === 'ajout') return comparerRangPuisId(corpus, a, b)
    if (mode === 'modif') {
      const dateA = dateValide(entretiens!.get(a)!.lastModified)
      const dateB = dateValide(entretiens!.get(b)!.lastModified)
      if (dateA === null && dateB !== null) return 1
      if (dateA !== null && dateB === null) return -1
      if (dateA !== null && dateB !== null && dateA !== dateB) return dateB - dateA
      return comparerRangPuisId(corpus, a, b)
    }
    const longueurA = compterMotsProseMirror(entretiens!.get(a)!.corpsTexte)
    const longueurB = compterMotsProseMirror(entretiens!.get(b)!.corpsTexte)
    return (longueurB - longueurA) || comparerRangPuisId(corpus, a, b)
  })
}

/** Applique une liste d'ids puis reconstruit la projection ordonnée. */
export function appliquerOrdreEntretiens(
  corpus: CorpusFichier,
  ordre: readonly string[],
): CorpusFichier {
  corpus.ordreEntretiens = [...ordre]
  return normaliserOrdreEntretiens(corpus)
}
