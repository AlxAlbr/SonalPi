export type ModeTexteRecueil = 'pseudonymise' | 'original'

export interface SourcePassageRecueil {
  entretienId: string
  repereId: string
}

export type ItemRecueil =
  | { id: string; type: 'titre'; niveau: 1 | 2 | 3 | 4; libelle: string }
  | { id: string; type: 'texte'; texte: string }
  | {
      id: string
      type: 'passage'
      source: SourcePassageRecueil
      commentaireEditorial: string
    }

export interface Recueil {
  id: string
  nom: string
  creeLe: string
  modifieLe: string
  modeTexte: ModeTexteRecueil
  items: ItemRecueil[]
}

export type CommandeRecueils =
  | { type: 'creer'; id: string; nom: string }
  | { type: 'renommer'; recueilId: string; attendu: string; nom: string }
  | { type: 'changer-mode'; recueilId: string; attendu: ModeTexteRecueil; mode: ModeTexteRecueil }
  | { type: 'supprimer-recueil'; recueilId: string; attenduModifieLe: string }
  | {
      type: 'inserer-item'
      recueilId: string
      attenduOrdre: string[]
      item: ItemRecueil
      avantId: string | null
    }
  | {
      type: 'modifier-item'
      recueilId: string
      itemId: string
      attendu: ItemRecueil
      item: ItemRecueil
    }
  | {
      type: 'supprimer-item'
      recueilId: string
      itemId: string
      attendu: ItemRecueil
    }
  | {
      type: 'deplacer-item'
      recueilId: string
      itemId: string
      avantId: string | null
      attenduOrdre: string[]
    }
  | {
      type: 'deplacer-section'
      recueilId: string
      titreId: string
      avantId: string | null
      attenduOrdre: string[]
    }
  | {
      type: 'supprimer-section'
      recueilId: string
      titreId: string
      attenduOrdre: string[]
    }

export interface DependancesRecueils {
  maintenant: () => string
}

const identiques = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function exigerRecueil(recueils: Record<string, Recueil>, id: string): Recueil {
  const recueil = recueils[id]
  if (!recueil) throw new Error("Ce recueil n'existe plus.")
  return recueil
}

function exigerOrdre(recueil: Recueil, attendu: string[]): void {
  if (!identiques(recueil.items.map((item) => item.id), attendu)) {
    throw new Error('La structure du recueil a changé. Actualisez-le avant de recommencer.')
  }
}

function indexInsertion(items: ItemRecueil[], avantId: string | null): number {
  if (avantId === null) return items.length
  const index = items.findIndex((item) => item.id === avantId)
  if (index < 0) throw new Error("L'emplacement demandé n'existe plus.")
  return index
}

function validerItem(item: ItemRecueil): void {
  if (!item.id.trim()) throw new Error("L'identité de l'item est vide.")
  if (item.type === 'titre') {
    if (![1, 2, 3, 4].includes(item.niveau) || !item.libelle.trim()) {
      throw new Error('Le titre du recueil est invalide.')
    }
  } else if (item.type === 'texte') {
    if (typeof item.texte !== 'string') throw new Error('Le texte du recueil est invalide.')
  } else if (!item.source.entretienId || !item.source.repereId
    || typeof item.commentaireEditorial !== 'string') {
    throw new Error('La référence du passage est invalide.')
  }
}

/** Retourne la plage d'une section, titre inclus. */
export function bornesSection(items: ItemRecueil[], titreId: string): { debut: number; fin: number } {
  const debut = items.findIndex((item) => item.id === titreId)
  const titre = items[debut]
  if (debut < 0 || titre?.type !== 'titre') throw new Error("Ce titre n'existe plus.")
  let fin = items.length
  for (let index = debut + 1; index < items.length; index += 1) {
    const item = items[index]
    if (item.type === 'titre' && item.niveau <= titre.niveau) {
      fin = index
      break
    }
  }
  return { debut, fin }
}

/** Applique une commande ciblée sans remplacer le corpus depuis une copie renderer. */
export function appliquerCommandeRecueils(
  recueils: Record<string, Recueil> | undefined,
  commande: CommandeRecueils,
  deps: DependancesRecueils,
): Record<string, Recueil> {
  const cible = recueils ?? {}
  const maintenant = deps.maintenant()
  if (commande.type === 'creer') {
    const nom = commande.nom.trim()
    if (!commande.id || !nom) throw new Error('Le nom du recueil est obligatoire.')
    const existant = cible[commande.id]
    if (existant) {
      if (existant.nom === nom) return cible
      throw new Error("Cette identité de recueil est déjà utilisée.")
    }
    cible[commande.id] = {
      id: commande.id,
      nom,
      creeLe: maintenant,
      modifieLe: maintenant,
      modeTexte: 'pseudonymise',
      items: [],
    }
    return cible
  }

  const recueil = exigerRecueil(cible, commande.recueilId)
  if (commande.type === 'renommer') {
    if (recueil.nom !== commande.attendu) throw new Error('Le nom du recueil a changé.')
    const nom = commande.nom.trim()
    if (!nom) throw new Error('Le nom du recueil est obligatoire.')
    if (nom !== recueil.nom) {
      recueil.nom = nom
      recueil.modifieLe = maintenant
    }
    return cible
  }
  if (commande.type === 'changer-mode') {
    if (recueil.modeTexte !== commande.attendu) throw new Error("Le mode d'affichage a changé.")
    if (commande.mode !== 'original' && commande.mode !== 'pseudonymise') {
      throw new Error("Le mode d'affichage est invalide.")
    }
    if (recueil.modeTexte !== commande.mode) {
      recueil.modeTexte = commande.mode
      recueil.modifieLe = maintenant
    }
    return cible
  }
  if (commande.type === 'supprimer-recueil') {
    if (recueil.modifieLe !== commande.attenduModifieLe) {
      throw new Error('Le recueil a changé. Actualisez-le avant de le supprimer.')
    }
    delete cible[commande.recueilId]
    return cible
  }
  if (commande.type === 'inserer-item') {
    exigerOrdre(recueil, commande.attenduOrdre)
    validerItem(commande.item)
    const existant = recueil.items.find((item) => item.id === commande.item.id)
    if (existant) {
      if (identiques(existant, commande.item)) return cible
      throw new Error("Cette identité d'item est déjà utilisée.")
    }
    recueil.items.splice(indexInsertion(recueil.items, commande.avantId), 0, structuredClone(commande.item))
    recueil.modifieLe = maintenant
    return cible
  }

  if (commande.type === 'deplacer-section' || commande.type === 'supprimer-section') {
    exigerOrdre(recueil, commande.attenduOrdre)
    const { debut, fin } = bornesSection(recueil.items, commande.titreId)
    if (commande.type === 'supprimer-section') {
      recueil.items.splice(debut, fin - debut)
    } else {
      const idsSection = new Set(recueil.items.slice(debut, fin).map((item) => item.id))
      if (commande.avantId && idsSection.has(commande.avantId)) return cible
      const section = recueil.items.splice(debut, fin - debut)
      recueil.items.splice(indexInsertion(recueil.items, commande.avantId), 0, ...section)
    }
    recueil.modifieLe = maintenant
    return cible
  }

  const index = recueil.items.findIndex((item) => item.id === commande.itemId)
  if (index < 0) throw new Error("Cet item n'existe plus.")
  if (commande.type === 'modifier-item') {
    if (!identiques(recueil.items[index], commande.attendu)) {
      throw new Error("L'item a changé. Actualisez-le avant de recommencer.")
    }
    validerItem(commande.item)
    if (commande.item.id !== commande.itemId || commande.item.type !== commande.attendu.type) {
      throw new Error("L'identité ou le type d'un item ne peut pas changer.")
    }
    if (!identiques(recueil.items[index], commande.item)) {
      recueil.items[index] = structuredClone(commande.item)
      recueil.modifieLe = maintenant
    }
    return cible
  }
  if (commande.type === 'supprimer-item') {
    if (!identiques(recueil.items[index], commande.attendu)) {
      throw new Error("L'item a changé. Actualisez-le avant de le supprimer.")
    }
    recueil.items.splice(index, 1)
    recueil.modifieLe = maintenant
    return cible
  }

  exigerOrdre(recueil, commande.attenduOrdre)
  const [item] = recueil.items.splice(index, 1)
  recueil.items.splice(indexInsertion(recueil.items, commande.avantId), 0, item)
  recueil.modifieLe = maintenant
  return cible
}

/** Conserve uniquement les recueils valides d'un ancien fichier. */
export function normaliserRecueils(valeur: unknown): Record<string, Recueil> {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return {}
  const resultat: Record<string, Recueil> = {}
  for (const [id, brut] of Object.entries(valeur as Record<string, unknown>)) {
    if (!brut || typeof brut !== 'object') continue
    const recueil = brut as Partial<Recueil>
    if (recueil.id !== id || typeof recueil.nom !== 'string'
      || typeof recueil.creeLe !== 'string' || typeof recueil.modifieLe !== 'string'
      || (recueil.modeTexte !== 'original' && recueil.modeTexte !== 'pseudonymise')
      || !Array.isArray(recueil.items)) continue
    try {
      const ids = new Set<string>()
      for (const item of recueil.items) {
        validerItem(item)
        if (ids.has(item.id)) throw new Error('Identité dupliquée.')
        ids.add(item.id)
      }
      resultat[id] = structuredClone(recueil as Recueil)
    } catch {
      // Un recueil mal formé reste exclu plutôt que lu partiellement.
    }
  }
  return resultat
}
