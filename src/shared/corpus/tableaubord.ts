/**
 *  Tableau de bord du corpus : suivi d'avancement lignes (entretiens suivis) ×
 *  colonnes (étapes du travail). Chaque cellule porte un badge (statut), un
 *  texte court, une date et, en corpus distant, un responsable.
 *
 *  Les badges sont définis au niveau du tableau (nom + couleur libres, un jeu
 *  par défaut) ; une cellule les référence par identité.
 *
 *  Le tableau ne référence rien hors de lui-même : les lignes sont du texte
 *  libre, sans lien au membership ni aux entretiens réels.
 *  Agrégat de `corpus.json.tableaubord` ; fonction pures, sans I/O.
 */

export interface ColonneTableau {
  id: string
  nom: string
  /** Traversante : UNE seule case pour tous les entretiens (information du corpus,
   *  ex. la problématique ou le guide d'entretien), rendue en cellule fusionnée. */
  traversante?: boolean
}

export interface LigneTableau {
  id: string
  nom: string
}

/** Un badge posable dans une case : nom libre + couleur libre, définis au niveau du tableau. */
export interface BadgeTableau {
  id: string
  nom: string
  couleur: string
}

/** Les badges du tableau vierge. Identités FIXES ; les verts forment le dégradé
 *  début → milieu → vers fin → OK. */
export const BADGES_PAR_DEFAUT: ReadonlyArray<BadgeTableau> = [
  { id: 'encours', nom: 'En cours', couleur: '#f59e0b' },
  { id: 'priorite', nom: 'Priorité', couleur: '#dc2626' },
  { id: 'debut', nom: 'Début', couleur: '#bbf7d0' },
  { id: 'milieu', nom: 'Milieu', couleur: '#86efac' },
  { id: 'versfin', nom: 'Vers fin', couleur: '#4ade80' },
  { id: 'ok', nom: 'OK', couleur: '#16a34a' },
]

export interface CelluleTableau {
  /** Badge posé (identité dans tableau.badges) ; absent = aucun marqueur. */
  badgeId?: string
  /** Texte court d'accompagnement, visible au survol. */
  note?: string
  /** ISO — posée à la première saisie puis conservée ; modifiable par l'utilisateur. */
  date?: string
  /** Nom libre de la personne en charge, surtout en corpus distant. */
  responsable?: string
  /** La date est affichée DANS la case, sous le badge (sinon : au survol seulement). */
  dateVisible?: boolean
  /** Idem pour le responsable. */
  responsableVisible?: boolean
}

export interface TableauBord {
  colonnes: ColonneTableau[]
  lignes: LigneTableau[]
  /** Badges disponibles dans les cases ; les cases les référencent par identité. */
  badges: BadgeTableau[]
  /** cellules[ligneId][colonneId] ; absent = case jamais touchée. */
  cellules: Record<string, Record<string, CelluleTableau>>
}

/** Clé de rangée des cellules des colonnes traversantes : une seule case couvre
 *  toutes les lignes. Le préfixe la rend impossible à confondre avec un id généré. */
export const LIGNE_TRAVERSANTE = '#traversant'

/** Les colonnes du tableau vierge : trois colonnes traversantes (informations du
 *  corpus), puis les colonnes-étapes. Identités FIXES, jamais régénérées à l'ouverture. */
export const COLONNES_PAR_DEFAUT: ReadonlyArray<{ id: string; nom: string; traversante?: boolean }> = [
  { id: 'problematique', nom: 'Problématique', traversante: true },
  { id: 'dpo', nom: 'DPO', traversante: true },
  { id: 'guide-entretien', nom: "Guide d'entretien", traversante: true },
  { id: 'contact', nom: 'Prise de contact' },
  { id: 'enregistrement', nom: 'Enregistrement' },
  { id: 'note-chaud', nom: 'Note à chaud' },
  { id: 'correction', nom: 'Correction' },
  { id: 'pseudonymisation', nom: 'Pseudonymisation' },
  { id: 'variable', nom: 'Variable' },
  { id: 'thematisation', nom: 'Thématisation' },
]

/** Le tableau d'un corpus neuf (ou d'un corpus ancien dépourvu du champ). */
export function tableauBordParDefaut(): TableauBord {
  return {
    colonnes: COLONNES_PAR_DEFAUT.map((colonne) => ({ ...colonne })),
    lignes: [
      { id: 'ent-1', nom: 'Entretien 1' },
      { id: 'ent-2', nom: 'Entretien 2' },
    ],
    badges: BADGES_PAR_DEFAUT.map((badge) => ({ ...badge })),
    cellules: {},
  }
}

/** Contenu demandé d'une cellule : complet sauf la date, que le modèle gère. */
export interface ContenuCellule {
  /** Badge posé (identité de tableau.badges) ; absent = aucun marqueur
   *  (la case peut porter note, date et responsable). */
  badgeId?: string
  note?: string
  responsable?: string
  /** undefined = laissé au modèle (posée à la première saisie, conservée ensuite) ;
   *  string = date explicite de l'utilisateur ; null = vidée (reposée à la prochaine modification). */
  date?: string | null
  /** Affichage dans la case (sous le badge) de la date / du responsable ;
   *  absent = au survol seulement. */
  dateVisible?: boolean
  responsableVisible?: boolean
}

export type CommandeTableauBord =
  | {
      type: 'ajouter-colonne'
      id: string
      nom: string
      traversante?: boolean
      /** Insertion après cet élément ; null = en tête ; absent = à la fin. */
      apresId?: string | null
    }
  | { type: 'renommer-colonne'; colonneId: string; attendu: string; nom: string }
  | { type: 'supprimer-colonne'; colonneId: string; attendu: string }
  | { type: 'deplacer-colonne'; colonneId: string; attenduOrdre: string[]; avantId: string | null }
  | {
      type: 'ajouter-ligne'
      id: string
      nom: string
      /** Insertion après cet élément ; null = en tête ; absent = à la fin. */
      apresId?: string | null
    }
  | { type: 'renommer-ligne'; ligneId: string; attendu: string; nom: string }
  | { type: 'supprimer-ligne'; ligneId: string; attendu: string }
  | { type: 'deplacer-ligne'; ligneId: string; attenduOrdre: string[]; avantId: string | null }
  | { type: 'ajouter-badge'; id: string; nom: string; couleur: string }
  | { type: 'supprimer-badge'; badgeId: string; attendu: string }
  | {
      type: 'poser-cellule'
      ligneId: string
      colonneId: string
      attendu: CelluleTableau | null
      contenu: ContenuCellule
    }

export interface DependancesTableauBord {
  maintenant: () => string
}

const identiques = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function validerChamp(champ: unknown, libelle: string): string | undefined {
  if (champ === undefined) return undefined
  if (typeof champ !== 'string') throw new Error(`La ${libelle} de la case est invalide.`)
  const texte = champ.trim()
  return texte || undefined
}

function exigerColonne(tableau: TableauBord, colonneId: string): void {
  if (!tableau.colonnes.some((colonne) => colonne.id === colonneId)) {
    throw new Error("Cette colonne du tableau n'existe plus.")
  }
}

function exigerLigne(tableau: TableauBord, ligneId: string): void {
  if (!tableau.lignes.some((ligne) => ligne.id === ligneId)) {
    throw new Error("Cette ligne du tableau n'existe plus.")
  }
}

function exigerOrdre(ids: string[], attendu: string[]): void {
  if (!identiques(ids, attendu)) {
    throw new Error('La structure du tableau a changé. Actualisez-le avant de recommencer.')
  }
}

function indexInsertion(ids: string[], avantId: string | null): number {
  if (avantId === null) return ids.length
  const index = ids.indexOf(avantId)
  if (index < 0) throw new Error("L'emplacement demandé n'existe plus.")
  return index
}

/** Déplace un identifiant avant `avantId` (fin si null), sans rien changer d'autre. */
function deplacer(ids: string[], id: string, avantId: string | null): void {
  const index = ids.indexOf(id)
  if (index < 0) throw new Error("Cet élément du tableau n'existe plus.")
  const [retire] = ids.splice(index, 1)
  ids.splice(indexInsertion(ids, avantId), 0, retire)
}

/** Insère un élément après `apresId`, en tête si null, à la fin s'il est absent. */
function inserer<T extends { id: string }>(
  elements: T[],
  element: T,
  apresId: string | null | undefined,
): void {
  if (apresId === undefined) {
    elements.push(element)
    return
  }
  if (apresId === null) {
    elements.unshift(element)
    return
  }
  const index = elements.findIndex((x) => x.id === apresId)
  if (index < 0) throw new Error("L'emplacement demandé n'existe plus.")
  elements.splice(index + 1, 0, element)
}

/** Pose une cellule selon la politique de date convenue :
 *  la date est posée à la première saisie puis conservée par défaut ;
 *  elle est modifiable (string) ou vidable (null) explicitement. */
function poserCellule(
  tableau: TableauBord,
  commande: Extract<CommandeTableauBord, { type: 'poser-cellule' }>,
  maintenant: string,
): void {
  exigerColonne(tableau, commande.colonneId)
  const colonne = tableau.colonnes.find((c) => c.id === commande.colonneId)!
  // Une colonne traversante n'a qu'une rangée, quelle que soit la ligne cliquée.
  const cleLigne = colonne.traversante ? LIGNE_TRAVERSANTE : commande.ligneId
  if (!colonne.traversante) exigerLigne(tableau, commande.ligneId)
  const rang = (tableau.cellules[cleLigne] ??= {})
  const actuelle = rang[commande.colonneId] ?? null
  if (!identiques(actuelle, commande.attendu)) {
    throw new Error('La case a changé. Actualisez le tableau avant de recommencer.')
  }
  const contenu = commande.contenu
  if (contenu.badgeId !== undefined
    && !tableau.badges.some((badge) => badge.id === contenu.badgeId)) {
    throw new Error("Ce badge du tableau n'existe plus.")
  }
  const note = validerChamp(contenu.note, 'note')
  const responsable = validerChamp(contenu.responsable, 'responsable')
  if (contenu.date !== undefined && contenu.date !== null && typeof contenu.date !== 'string') {
    throw new Error('La date de la case est invalide.')
  }

  const vide = !contenu.badgeId && !note && !responsable
  if (vide) {
    // Case vidée entièrement : retour à l'état « jamais touchée » (la date s'efface avec le contenu).
    delete rang[commande.colonneId]
    if (Object.keys(rang).length === 0) delete tableau.cellules[cleLigne]
    return
  }

  let date: string | undefined
  if (contenu.date === undefined) {
    // Modèle par défaut : la date d'origine reste, la première saisie la pose.
    date = actuelle?.date ?? maintenant
  } else if (contenu.date !== null) {
    const proposee = contenu.date.trim()
    if (!proposee) throw new Error('La date de la case est invalide.')
    date = proposee
  }
  const nouvelle: CelluleTableau = {}
  if (contenu.badgeId) nouvelle.badgeId = contenu.badgeId
  if (note) nouvelle.note = note
  if (date) nouvelle.date = date
  if (responsable) nouvelle.responsable = responsable
  if (contenu.dateVisible) nouvelle.dateVisible = true
  if (contenu.responsableVisible) nouvelle.responsableVisible = true
  rang[commande.colonneId] = nouvelle
}

/** Applique une commande ciblée sans remplacer le tableau depuis une copie renderer. */
export function appliquerCommandeTableauBord(
  tableau: TableauBord,
  commande: CommandeTableauBord,
  deps: DependancesTableauBord,
): TableauBord {
  if (commande.type === 'ajouter-colonne' || commande.type === 'ajouter-ligne') {
    const nom = commande.nom.trim()
    if (!commande.id || !nom) throw new Error('Le nom est obligatoire.')
    const occupant = [...tableau.colonnes, ...tableau.lignes].find((x) => x.id === commande.id)
    if (occupant) throw new Error('Cette identité est déjà utilisée par le tableau.')
    if (commande.type === 'ajouter-colonne') {
      inserer(
        tableau.colonnes,
        { id: commande.id, nom, ...(commande.traversante ? { traversante: true } : {}) },
        commande.apresId,
      )
    } else {
      inserer(tableau.lignes, { id: commande.id, nom }, commande.apresId)
    }
    return tableau
  }

  if (commande.type === 'deplacer-colonne' || commande.type === 'deplacer-ligne') {
    const idDeplace = commande.type === 'deplacer-colonne' ? commande.colonneId : commande.ligneId
    const ids = commande.type === 'deplacer-colonne'
      ? tableau.colonnes.map((colonne) => colonne.id)
      : tableau.lignes.map((ligne) => ligne.id)
    exigerOrdre(ids, commande.attenduOrdre)
    if (commande.avantId === idDeplace) return tableau
    deplacer(ids, idDeplace, commande.avantId)
    if (commande.type === 'deplacer-colonne') {
      tableau.colonnes = ids.map((id) => tableau.colonnes.find((x) => x.id === id)!)
    } else {
      tableau.lignes = ids.map((id) => tableau.lignes.find((x) => x.id === id)!)
    }
    return tableau
  }

  if (commande.type === 'renommer-colonne' || commande.type === 'renommer-ligne') {
    const estColonne = commande.type === 'renommer-colonne'
    const elements = estColonne ? tableau.colonnes : tableau.lignes
    const element = elements.find((x) => x.id === (estColonne ? commande.colonneId : commande.ligneId))
    if (!element) throw new Error("Cet élément du tableau n'existe plus.")
    if (element.nom !== commande.attendu) {
      throw new Error("L'élément a été renommé ailleurs. Actualisez le tableau.")
    }
    const nom = commande.nom.trim()
    if (!nom) throw new Error('Le nom est obligatoire.')
    element.nom = nom
    return tableau
  }

  if (commande.type === 'supprimer-colonne' || commande.type === 'supprimer-ligne') {
    if (commande.type === 'supprimer-colonne') {
      exigerColonne(tableau, commande.colonneId)
      const colonne = tableau.colonnes.find((x) => x.id === commande.colonneId)!
      if (colonne.nom !== commande.attendu) {
        throw new Error("La colonne a changé. Actualisez le tableau avant de la supprimer.")
      }
      tableau.colonnes = tableau.colonnes.filter((x) => x.id !== commande.colonneId)
      for (const ligneId of Object.keys(tableau.cellules)) {
        delete tableau.cellules[ligneId][commande.colonneId]
        if (Object.keys(tableau.cellules[ligneId]).length === 0) delete tableau.cellules[ligneId]
      }
    } else {
      exigerLigne(tableau, commande.ligneId)
      const ligne = tableau.lignes.find((x) => x.id === commande.ligneId)!
      if (ligne.nom !== commande.attendu) {
        throw new Error("La ligne a changé. Actualisez le tableau avant de la supprimer.")
      }
      tableau.lignes = tableau.lignes.filter((x) => x.id !== commande.ligneId)
      delete tableau.cellules[commande.ligneId]
    }
    return tableau
  }

  if (commande.type === 'ajouter-badge') {
    const nom = commande.nom.trim()
    if (!commande.id || !nom) throw new Error('Le nom du badge est obligatoire.')
    if (!/^#[0-9a-f]{6}$/i.test(commande.couleur)) throw new Error('La couleur du badge est invalide.')
    if (tableau.badges.some((badge) => badge.id === commande.id)) {
      throw new Error('Cette identité de badge est déjà utilisée.')
    }
    tableau.badges.push({ id: commande.id, nom, couleur: commande.couleur })
    return tableau
  }

  if (commande.type === 'supprimer-badge') {
    const badge = tableau.badges.find((b) => b.id === commande.badgeId)
    if (!badge) throw new Error("Ce badge du tableau n'existe plus.")
    if (badge.nom !== commande.attendu) {
      throw new Error('Le badge a changé. Actualisez le tableau avant de le supprimer.')
    }
    const usages = compterUsagesBadge(tableau, commande.badgeId)
    if (usages > 0) {
      throw new Error(`Ce badge est utilisé par ${usages} case(s) : videz-les avant de le supprimer.`)
    }
    tableau.badges = tableau.badges.filter((b) => b.id !== commande.badgeId)
    return tableau
  }

  poserCellule(tableau, commande, deps.maintenant())
  return tableau
}

/** Nombre de cases portant ce badge. */
export function compterUsagesBadge(tableau: TableauBord, badgeId: string): number {
  let total = 0
  for (const rangee of Object.values(tableau.cellules)) {
    for (const cellule of Object.values(rangee)) {
      if (cellule.badgeId === badgeId) total += 1
    }
  }
  return total
}

/** Conserve uniquement un tableau cohérent d'un ancien fichier ;
 *  un tableau absent ou mal formé est rendu undefined (l'appelant repart du défaut). */
export function normaliserTableauBord(valeur: unknown): TableauBord | undefined {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return undefined
  const brut = valeur as Partial<TableauBord>
  if (!Array.isArray(brut.colonnes) || !Array.isArray(brut.lignes)
    || !Array.isArray(brut.badges)
    || !brut.cellules || typeof brut.cellules !== 'object' || Array.isArray(brut.cellules)) {
    return undefined
  }
  try {
    const ids = new Set<string>()
    for (const colonne of brut.colonnes) {
      if (!colonne || typeof colonne.id !== 'string' || typeof colonne.nom !== 'string'
        || !colonne.id || !colonne.nom.trim()) throw new Error('colonne invalide')
      if (ids.has(colonne.id)) throw new Error('identité dupliquée')
      ids.add(colonne.id)
    }
    for (const ligne of brut.lignes) {
      if (!ligne || typeof ligne.id !== 'string' || typeof ligne.nom !== 'string'
        || !ligne.id || !ligne.nom.trim()) throw new Error('ligne invalide')
      if (ids.has(ligne.id)) throw new Error('identité dupliquée')
      ids.add(ligne.id)
    }
    const badges: BadgeTableau[] = []
    for (const badge of brut.badges) {
      if (!badge || typeof badge.id !== 'string' || typeof badge.nom !== 'string'
        || !badge.id || !badge.nom || typeof badge.couleur !== 'string'
        || !/^#[0-9a-f]{6}$/i.test(badge.couleur)) throw new Error('badge invalide')
      badges.push({ id: badge.id, nom: badge.nom, couleur: badge.couleur })
    }
    const badgesConnus = new Set(badges.map((badge) => badge.id))
    const cellules: TableauBord['cellules'] = {}
    for (const [ligneId, rang] of Object.entries(brut.cellules)) {
      // La rangée des colonnes traversantes n'est pas une ligne du tableau.
      if (ligneId !== LIGNE_TRAVERSANTE && !ids.has(ligneId)) continue
      const rangee: Record<string, CelluleTableau> = {}
      for (const [colonneId, cellule] of Object.entries(rang)) {
        if (!ids.has(colonneId) || !cellule || typeof cellule !== 'object' || Array.isArray(cellule)) continue
        // Un badge supprimé ailleurs (ou inconnu) est perdu, pas la cellule entière.
        const badgeId = typeof cellule.badgeId === 'string' && badgesConnus.has(cellule.badgeId)
          ? cellule.badgeId
          : undefined
        const dateVisible = cellule.dateVisible === true
        const responsableVisible = cellule.responsableVisible === true
        for (const champ of [cellule.note, cellule.responsable, cellule.date]) {
          if (champ !== undefined && typeof champ !== 'string') throw new Error('champ invalide')
        }
        rangee[colonneId] = {
          ...(badgeId ? { badgeId } : {}),
          ...structuredClone({
            ...(cellule.note ? { note: cellule.note } : {}),
            ...(cellule.date ? { date: cellule.date } : {}),
            ...(cellule.responsable ? { responsable: cellule.responsable } : {}),
          }),
          ...(dateVisible ? { dateVisible: true } : {}),
          ...(responsableVisible ? { responsableVisible: true } : {}),
        }
      }
      if (Object.keys(rangee).length > 0) cellules[ligneId] = rangee
    }
    return structuredClone({ colonnes: brut.colonnes, lignes: brut.lignes, badges, cellules })
  } catch {
    // Un tableau mal formé reste exclu plutôt que lu partiellement.
    return undefined
  }
}
