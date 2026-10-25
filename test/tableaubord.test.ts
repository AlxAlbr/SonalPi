import { describe, expect, test } from 'vitest'
import {
  appliquerCommandeTableauBord,
  COLONNES_PAR_DEFAUT,
  normaliserTableauBord,
  tableauBordParDefaut,
  type CelluleTableau,
  type CommandeTableauBord,
  type TableauBord,
} from '../src/shared/corpus/tableaubord'

const maintenant = () => '2026-04-01T10:00:00.000Z'
const plusTard = () => '2026-05-02T10:00:00.000Z'

function tableau(): TableauBord {
  return tableauBordParDefaut()
}

function appliquer(
  t: TableauBord,
  commande: CommandeTableauBord,
  horloge: () => string = maintenant,
): void {
  appliquerCommandeTableauBord(t, commande, { maintenant: horloge })
}

function cellule(t: TableauBord, ligne: string, colonne: string): CelluleTableau | undefined {
  return t.cellules[ligne]?.[colonne]
}

describe('tableau de bord — défauts', () => {
  test('un tableau vierge porte les colonnes traversantes, les 7 étapes et deux lignes', () => {
    const t = tableau()
    expect(t.colonnes.map((c) => c.id)).toEqual(
      ['problematique', 'dpo', 'guide-entretien', 'contact', 'enregistrement', 'note-chaud', 'correction', 'pseudonymisation', 'variable', 'thematisation'],
    )
    expect(t.colonnes.map((c) => c.nom)).toEqual(COLONNES_PAR_DEFAUT.map((c) => c.nom))
    expect(t.colonnes.filter((c) => c.traversante).map((c) => c.id)).toEqual(['problematique', 'dpo', 'guide-entretien'])
    expect(t.lignes).toEqual([
      { id: 'ent-1', nom: 'Entretien 1' },
      { id: 'ent-2', nom: 'Entretien 2' },
    ])
    expect(t.cellules).toEqual({})
  })

  test('le défaut est reconstruit à chaque appel, jamais partagé', () => {
    const a = tableauBordParDefaut()
    const b = tableauBordParDefaut()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('tableau de bord — lignes et colonnes', () => {
  test('ajout, renommage (identités stables) et suppression', () => {
    const t = tableau()
    appliquer(t, { type: 'ajouter-ligne', id: 'l2', nom: 'Entretien 3' })
    appliquer(t, { type: 'renommer-ligne', ligneId: 'l2', attendu: 'Entretien 3', nom: 'Rencontre Fatiha' })
    expect(t.lignes[2]).toEqual({ id: 'l2', nom: 'Rencontre Fatiha' })
    appliquer(t, { type: 'supprimer-ligne', ligneId: 'l2', attendu: 'Rencontre Fatiha' })
    expect(t.lignes).toHaveLength(2)
  })

  test('un nom peut porter des sauts de ligne ; un nom blanc est refusé à la normalisation', () => {
    const t = tableau()
    appliquer(t, { type: 'renommer-colonne', colonneId: 'contact', attendu: 'Prise de contact', nom: 'Prise de\ncontact' })
    expect(t.colonnes[3].nom).toBe('Prise de\ncontact')
    expect(normaliserTableauBord(structuredClone(t))).toEqual(t)
    t.colonnes[3].nom = '\n\n'
    expect(normaliserTableauBord(structuredClone(t))).toBeUndefined()
  })

  test('un renommage sur un nom périmé est refusé', () => {
    const t = tableau()
    expect(() => appliquer(t, { type: 'renommer-ligne', ligneId: 'ent-1', attendu: 'autre', nom: 'X' })).toThrow()
    expect(t.lignes[0].nom).toBe('Entretien 1')
  })

  test('les identités sont uniques entre lignes et colonnes', () => {
    const t = tableau()
    expect(() => appliquer(t, { type: 'ajouter-ligne', id: 'contact', nom: 'X' })).toThrow()
  })

  test('les colonnes s’ajoutent à l’emplacement choisi, à la fin par défaut', () => {
    const t = tableau()
    appliquer(t, { type: 'ajouter-colonne', id: 'col-debut', nom: 'En premier', apresId: null })
    expect(t.colonnes[0].id).toBe('col-debut')
    appliquer(t, { type: 'ajouter-colonne', id: 'col-apres', nom: 'Après contact', apresId: 'contact' })
    const ids = t.colonnes.map((c) => c.id)
    expect(ids[ids.indexOf('contact') + 1]).toBe('col-apres')
    appliquer(t, { type: 'ajouter-colonne', id: 'col-fin', nom: 'À la fin' })
    expect(t.colonnes.at(-1)!.id).toBe('col-fin')
    expect(() => appliquer(t, {
      type: 'ajouter-colonne', id: 'col-x', nom: 'X', apresId: 'absente',
    })).toThrow(/emplacement/)
  })

  test('les lignes s’ajoutent à l’emplacement choisi, à la fin par défaut', () => {
    const t = tableau()
    appliquer(t, { type: 'ajouter-ligne', id: 'l-debut', nom: 'En premier', apresId: null })
    expect(t.lignes[0].id).toBe('l-debut')
    appliquer(t, { type: 'ajouter-ligne', id: 'l-apres', nom: 'Après la première', apresId: 'l-debut' })
    expect(t.lignes.map((l) => l.id).slice(0, 3)).toEqual(['l-debut', 'l-apres', 'ent-1'])
    appliquer(t, { type: 'ajouter-ligne', id: 'l-fin', nom: 'À la fin' })
    expect(t.lignes.at(-1)!.id).toBe('l-fin')
    expect(() => appliquer(t, {
      type: 'ajouter-ligne', id: 'l-x', nom: 'X', apresId: 'absente',
    })).toThrow(/emplacement/)
  })

  test('supprimer une colonne retire ses cellules, les autres restent', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok' } })
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction', attendu: null, contenu: { badgeId: 'encours', note: 'à finir' } })
    appliquer(t, { type: 'supprimer-colonne', colonneId: 'contact', attendu: 'Prise de contact' })
    expect(cellule(t, 'ent-1', 'contact')).toBeUndefined()
    expect(cellule(t, 'ent-1', 'correction')).toMatchObject({ badgeId: 'encours' })
  })

  test('supprimer une ligne refuse sur un nom périmé et retire ses cellules', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok' } })
    expect(() => appliquer(t, { type: 'supprimer-ligne', ligneId: 'ent-1', attendu: 'autre' })).toThrow()
    appliquer(t, { type: 'supprimer-ligne', ligneId: 'ent-1', attendu: 'Entretien 1' })
    expect(t.cellules['ent-1']).toBeUndefined()
  })

  test('déplacement de colonne avant une autre, avec garde d ordre', () => {
    const t = tableau()
    const ordre = t.colonnes.map((c) => c.id)
    appliquer(t, { type: 'deplacer-colonne', colonneId: 'thematisation', attenduOrdre: ordre, avantId: 'problematique' })
    expect(t.colonnes[0].id).toBe('thematisation')
    appliquer(t, { type: 'deplacer-colonne', colonneId: 'contact', attenduOrdre: t.colonnes.map((c) => c.id), avantId: 'contact' })
    expect(t.colonnes.map((c) => c.id)).toEqual(t.colonnes.map((c) => c.id))
    expect(() => appliquer(t, {
      type: 'deplacer-colonne', colonneId: 'contact', attenduOrdre: ['autre'], avantId: null,
    })).toThrow()
  })
})

describe('tableau de bord — cellules et dates', () => {
  test('la première saisie pose la date, les compléments la conservent', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction', attendu: null, contenu: { badgeId: 'encours', note: 'commencé' } })
    expect(cellule(t, 'ent-1', 'correction')).toMatchObject({ badgeId: 'encours', note: 'commencé', date: '2026-04-01T10:00:00.000Z' })
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction',
      attendu: cellule(t, 'ent-1', 'correction') ?? null,
      contenu: { badgeId: 'ok', note: 'terminé' },
    }, plusTard)
    expect(cellule(t, 'ent-1', 'correction')).toEqual({
      badgeId: 'ok', note: 'terminé', date: '2026-04-01T10:00:00.000Z',
    })
  })

  test('la date est modifiable puis vidable explicitement ; vidée, elle est reposée à la prochaine modification', () => {
    const t = tableau()
    const poser = (contenu: Record<string, unknown>, attendu: CelluleTableau | null = null) =>
      appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu, contenu } as CommandeTableauBord)
    poser({ badgeId: 'encours' })
    const base = cellule(t, 'ent-1', 'contact')!
    poser({ badgeId: 'encours', date: '2026-01-15' }, base)
    expect(cellule(t, 'ent-1', 'contact')!.date).toBe('2026-01-15')
    poser({ badgeId: 'encours', date: null }, cellule(t, 'ent-1', 'contact')!)
    expect(cellule(t, 'ent-1', 'contact')!.date).toBeUndefined()
    poser({ badgeId: 'ok' }, cellule(t, 'ent-1', 'contact')!)
    expect(cellule(t, 'ent-1', 'contact')!.date).toBe('2026-04-01T10:00:00.000Z')
  })

  test('les drapeaux de visibilité suivent le contenu posé, sans le rendre à eux seuls', () => {
    const t = tableau()
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null,
      contenu: { badgeId: 'encours', date: '2026-02-10', dateVisible: true, responsable: 'Amina', responsableVisible: true },
    })
    expect(cellule(t, 'ent-1', 'contact')).toEqual({
      badgeId: 'encours', date: '2026-02-10', dateVisible: true,
      responsable: 'Amina', responsableVisible: true,
    })
    // Décocher la visibilité ne vide pas la valeur, elle la rend au survol seulement.
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact',
      attendu: cellule(t, 'ent-1', 'contact') ?? null,
      contenu: { badgeId: 'encours', date: '2026-02-10', responsable: 'Amina' },
    })
    expect(cellule(t, 'ent-1', 'contact')).toEqual({ badgeId: 'encours', date: '2026-02-10', responsable: 'Amina' })
  })

  test('les sauts de ligne d une note sont conservés, seuls les bords sont ajustés', () => {
    const t = tableau()
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction', attendu: null,
      contenu: { badgeId: 'encours', note: 'Relire la partie sur\nles horaires' },
    })
    expect(cellule(t, 'ent-1', 'correction')!.note).toBe('Relire la partie sur\nles horaires')
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction',
      attendu: cellule(t, 'ent-1', 'correction') ?? null,
      contenu: { badgeId: 'encours', note: '\nRelire la partie sur\nles horaires\n' },
    })
    expect(cellule(t, 'ent-1', 'correction')!.note).toBe('Relire la partie sur\nles horaires')
    // Une note d'un ou plusieurs sauts de ligne seuls compte comme vide.
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'correction',
      attendu: cellule(t, 'ent-1', 'correction') ?? null,
      contenu: { note: '\n' },
    })
    expect(t.cellules['ent-1']).toBeUndefined()
  })

  test('une case avec responsable sans marqueur reste valide (corpus distant)', () => {
    const t = tableau()
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null,
      contenu: { responsable: 'Amina' },
    })
    expect(cellule(t, 'ent-1', 'contact')).toEqual({ responsable: 'Amina', date: '2026-04-01T10:00:00.000Z' })
  })

  test('un contenu vide supprime la cellule et nettoie la rangée', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok', note: ' vu ' } })
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact',
      attendu: cellule(t, 'ent-1', 'contact') ?? null, contenu: {},
    })
    expect(t.cellules['ent-1']).toBeUndefined()
  })

  test('une case posée sur un contenu périmé est refusée', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok' } })
    expect(() => appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'encours' },
    })).toThrow(/changé/)
  })

  test('les statuts et champs inconnus sont refusés', () => {
    const t = tableau()
    expect(() => appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null,
      contenu: { badgeId: 'inconnu' } as never,
    })).toThrow()
  })
})

describe('tableau de bord — colonnes traversantes', () => {
  test('une colonne traversante n a qu une cellule, quelle que soit la ligne posée', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'problematique', attendu: null, contenu: { badgeId: 'encours', note: 'cadre en cours de rédaction' } })
    expect(t.cellules['#traversant']!.problematique).toMatchObject({ note: 'cadre en cours de rédaction' })
    expect(t.cellules['ent-1']).toBeUndefined()
    // Reprise depuis une autre ligne : la même case traversante est modifiée.
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-2', colonneId: 'problematique',
      attendu: t.cellules['#traversant']!.problematique ?? null, contenu: { badgeId: 'ok' },
    })
    expect(t.cellules['#traversant']!.problematique!.badgeId).toBe('ok')
  })

  test('supprimer une ligne ne touche pas la cellule traversante', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'dpo', attendu: null, contenu: { note: 'Amina' } })
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok' } })
    appliquer(t, { type: 'supprimer-ligne', ligneId: 'ent-1', attendu: 'Entretien 1' })
    expect(t.cellules['#traversant']!.dpo).toBeDefined()
    expect(t.cellules['ent-1']).toBeUndefined()
  })

  test('supprimer une colonne traversante retire sa cellule', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-2', colonneId: 'guide-entretien', attendu: null, contenu: { badgeId: 'encours' } })
    appliquer(t, { type: 'supprimer-colonne', colonneId: 'guide-entretien', attendu: "Guide d'entretien" })
    expect(t.cellules['#traversant']).toBeUndefined()
  })

  test('la normalisation conserve la rangée traversante', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'problematique', attendu: null, contenu: { badgeId: 'ok' } })
    expect(normaliserTableauBord(structuredClone(t))).toEqual(t)
  })

  test('la normalisation conserve les drapeaux de visibilité de la case', () => {
    const t = tableau()
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null,
      contenu: { badgeId: 'ok', date: '2026-02-10', dateVisible: true, responsable: 'Amina', responsableVisible: true },
    })
    expect(normaliserTableauBord(structuredClone(t))).toEqual(t)
  })
})

describe('tableau de bord — badges', () => {
  test('le tableau vierge porte les 6 badges par défaut, verts en dégradé pour l’avancement', () => {
    const t = tableau()
    expect(t.badges.map((b) => b.id)).toEqual(['encours', 'priorite', 'debut', 'milieu', 'versfin', 'ok'])
  })

  test('créer un badge avec couleur invalide est refusé', () => {
    const t = tableau()
    expect(() => appliquer(t, { type: 'ajouter-badge', id: 'b1', nom: 'Relance', couleur: 'rouge' })).toThrow()
    expect(() => appliquer(t, { type: 'ajouter-badge', id: 'b1', nom: 'Relance', couleur: '#3399ff' })).not.toThrow()
    expect(t.badges.some((b) => b.id === 'b1')).toBe(true)
  })

  test('un badge utilisé ne se supprime pas ; vidé, oui', () => {
    const t = tableau()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'priorite' } })
    expect(() => appliquer(t, { type: 'supprimer-badge', badgeId: 'priorite', attendu: 'Priorité' })).toThrow(/utilisé/)
    appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact',
      attendu: cellule(t, 'ent-1', 'contact') ?? null, contenu: {},
    })
    appliquer(t, { type: 'supprimer-badge', badgeId: 'priorite', attendu: 'Priorité' })
    expect(t.badges.some((b) => b.id === 'priorite')).toBe(false)
  })

  test('poser un badge supprimé est refusé', () => {
    const t = tableau()
    appliquer(t, { type: 'supprimer-badge', badgeId: 'priorite', attendu: 'Priorité' })
    expect(() => appliquer(t, {
      type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null,
      contenu: { badgeId: 'priorite' },
    })).toThrow(/badge/)
  })
})

describe('tableau de bord — normalisation', () => {
  test('un tableau cohérent passe, un tableau mal formé est rejeté', () => {
    const t = tableauBordParDefaut()
    appliquer(t, { type: 'poser-cellule', ligneId: 'ent-1', colonneId: 'contact', attendu: null, contenu: { badgeId: 'ok' } })
    expect(normaliserTableauBord(structuredClone(t))).toEqual(t)
    expect(normaliserTableauBord(undefined)).toBeUndefined()
    expect(normaliserTableauBord({ colonnes: 'x' })).toBeUndefined()
    expect(normaliserTableauBord({ colonnes: [{ id: 'a', nom: 'A' }], lignes: [{ id: 'a', nom: 'A' }], badges: [], cellules: {} })).toBeUndefined()
    expect(normaliserTableauBord({
      colonnes: [{ id: 'a', nom: 'A' }], lignes: [], badges: [{ id: 'b', nom: 'B', couleur: '#3399ff' }],
      cellules: { absent: { a: { badgeId: 'ok' } } },
    })).toEqual({
      colonnes: [{ id: 'a', nom: 'A' }], lignes: [],
      badges: [{ id: 'b', nom: 'B', couleur: '#3399ff' }], cellules: {},
    })
  })

  test('une cellule référençant un badge inconnu garde note, date et responsable, perd le badge', () => {
    const lu = normaliserTableauBord({
      colonnes: [{ id: 'a', nom: 'A' }], lignes: [{ id: 'l', nom: 'L' }],
      badges: [],
      cellules: { l: { a: { badgeId: 'fantôme', note: 'suivi à la main', date: '2026-03-01' } } },
    })
    expect(lu).toEqual({
      colonnes: [{ id: 'a', nom: 'A' }], lignes: [{ id: 'l', nom: 'L' }], badges: [],
      cellules: { l: { a: { note: 'suivi à la main', date: '2026-03-01' } } },
    })
  })

  test('un jeu de badges mal formé invalide tout le tableau', () => {
    expect(normaliserTableauBord({
      colonnes: [{ id: 'a', nom: 'A' }], lignes: [],
      badges: [{ id: 'b', nom: 'B', couleur: 'orange' }], cellules: {},
    })).toBeUndefined()
  })
})
