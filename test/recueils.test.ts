import { describe, expect, test } from 'vitest'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import {
  appliquerCommandeRecueils,
  bornesSection,
  type ItemRecueil,
  type Recueil,
} from '../src/shared/corpus/recueils'
import {
  exporterRecueilMarkdown,
  projeterRecueil,
} from '../src/renderer/editor/recueils'

const maintenant = () => '2026-04-01T10:00:00.000Z'

function creer(): Record<string, Recueil> {
  const recueils: Record<string, Recueil> = {}
  appliquerCommandeRecueils(recueils, { type: 'creer', id: 'r1', nom: 'Synthèse' }, { maintenant })
  return recueils
}

function inserer(recueils: Record<string, Recueil>, item: ItemRecueil) {
  appliquerCommandeRecueils(recueils, {
    type: 'inserer-item',
    recueilId: 'r1',
    attenduOrdre: recueils.r1.items.map((courant) => courant.id),
    item,
    avantId: null,
  }, { maintenant })
}

describe('recueils — modèle éditorial pur', () => {
  test('crée des identités stables et un passage sans copie ni bornes source', () => {
    const recueils = creer()
    const passage: ItemRecueil = {
      id: 'i1',
      type: 'passage',
      source: { entretienId: 'e1', repereId: 'p1' },
      commentaireEditorial: 'À rapprocher.',
    }
    inserer(recueils, passage)

    expect(recueils.r1.modeTexte).toBe('pseudonymise')
    expect(recueils.r1.items).toEqual([passage])
    expect(JSON.stringify(passage)).not.toContain('from')
    expect(JSON.stringify(passage)).not.toContain('texte')
  })

  test('une modification ciblée refuse seulement si cet item a changé', () => {
    const recueils = creer()
    inserer(recueils, { id: 'a', type: 'texte', texte: 'A' })
    inserer(recueils, { id: 'b', type: 'texte', texte: 'B' })
    const attendu = structuredClone(recueils.r1.items[0])
    ;(recueils.r1.items[1] as Extract<ItemRecueil, { type: 'texte' }>).texte = 'B distant'

    appliquerCommandeRecueils(recueils, {
      type: 'modifier-item',
      recueilId: 'r1',
      itemId: 'a',
      attendu,
      item: { id: 'a', type: 'texte', texte: 'A local' },
    }, { maintenant })
    expect(recueils.r1.items.map((item) => item.type === 'texte' ? item.texte : '')).toEqual([
      'A local', 'B distant',
    ])
  })

  test('déplace une section avec son contenu selon une seule règle de bornes', () => {
    const recueils = creer()
    for (const item of [
      { id: 't1', type: 'titre', niveau: 1, libelle: 'Un' },
      { id: 'x1', type: 'texte', texte: 'Dans un' },
      { id: 't2', type: 'titre', niveau: 2, libelle: 'Sous-un' },
      { id: 'x2', type: 'texte', texte: 'Dans sous-un' },
      { id: 't3', type: 'titre', niveau: 1, libelle: 'Deux' },
      { id: 'x3', type: 'texte', texte: 'Dans deux' },
    ] as ItemRecueil[]) inserer(recueils, item)

    expect(bornesSection(recueils.r1.items, 't1')).toEqual({ debut: 0, fin: 4 })
    appliquerCommandeRecueils(recueils, {
      type: 'deplacer-section',
      recueilId: 'r1',
      titreId: 't1',
      avantId: null,
      attenduOrdre: ['t1', 'x1', 't2', 'x2', 't3', 'x3'],
    }, { maintenant })
    expect(recueils.r1.items.map((item) => item.id)).toEqual(['t3', 'x3', 't1', 'x1', 't2', 'x2'])
  })

  test('distingue la suppression du titre de celle de toute sa section', () => {
    const recueils = creer()
    inserer(recueils, { id: 't1', type: 'titre', niveau: 1, libelle: 'Un' })
    inserer(recueils, { id: 'x1', type: 'texte', texte: 'Contenu' })
    inserer(recueils, { id: 't2', type: 'titre', niveau: 1, libelle: 'Deux' })
    const titre = structuredClone(recueils.r1.items[0])
    appliquerCommandeRecueils(recueils, {
      type: 'supprimer-item', recueilId: 'r1', itemId: 't1', attendu: titre,
    }, { maintenant })
    expect(recueils.r1.items.map((item) => item.id)).toEqual(['x1', 't2'])

    recueils.r1.items.unshift({ id: 't1', type: 'titre', niveau: 1, libelle: 'Un' })
    appliquerCommandeRecueils(recueils, {
      type: 'supprimer-section', recueilId: 'r1', titreId: 't1', attenduOrdre: ['t1', 'x1', 't2'],
    }, { maintenant })
    expect(recueils.r1.items.map((item) => item.id)).toEqual(['t2'])
  })
})

function source(): EntretienFichier {
  return {
    formatVersion: 4,
    lastModified: '',
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Bonjour Alice à Lyon.' }] },
      ],
    },
    annotations: [
      { id: 'anon-a', type: 'anon', from: 9, to: 14, auteur: '', etat: 'anonymise', pseudo: 'Personne A' },
      { id: 'anon-l', type: 'anon', from: 17, to: 21, auteur: '', etat: 'anonymise', pseudo: 'Ville B' },
    ],
    ancres: [],
    reperesPassages: [{ id: 'p1', from: 1, to: 22 }],
    locuteurs: [{ index: 1, nom: 'Alice', pseudo: 'Locutrice A', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
  }
}

const corpus: Pick<CorpusFichier, 'membership'> = {
  membership: { e1: { titre: 'Entretien A', date: null, lastModified: '' } },
}

function recueil(modeTexte: Recueil['modeTexte'] = 'pseudonymise'): Recueil {
  return {
    id: 'r1', nom: 'Synthèse', creeLe: '', modifieLe: '', modeTexte,
    items: [
      { id: 't1', type: 'titre', niveau: 2, libelle: 'Terrain' },
      { id: 'p', type: 'passage', source: { entretienId: 'e1', repereId: 'p1' }, commentaireEditorial: 'Important.' },
    ],
  }
}

describe('recueils — résolution, pseudonymisation et export', () => {
  test('résout le texte vivant et ne conserve aucun original masqué', () => {
    const projection = projeterRecueil(corpus, recueil(), new Map([
      ['e1', { ok: true as const, data: source() }],
    ]))
    const passage = projection.items[1]
    expect(passage.type).toBe('passage')
    if (passage.type !== 'passage') return
    expect(passage.etat).toBe('disponible')
    expect(passage.texte).toBe('Bonjour Personne A à Ville B.')
    expect(passage.locuteurs).toEqual(['Locutrice A'])
    expect(JSON.stringify(projection)).not.toContain('Alice')
    expect(JSON.stringify(projection)).not.toContain('Lyon')
  })

  test('ne laisse aucun fragment original entre deux anonymisations chevauchantes', () => {
    const data = source()
    ;((data.corpsTexte as any).content[0].content[0] as any).text = 'abcdefghij'
    data.annotations = [
      { id: 'a1', type: 'anon', from: 2, to: 7, auteur: '', etat: 'anonymise', pseudo: 'X' },
      { id: 'a2', type: 'anon', from: 5, to: 10, auteur: '', etat: 'anonymise', pseudo: 'Y' },
    ]
    data.reperesPassages = [{ id: 'p1', from: 1, to: 11 }]
    const projection = projeterRecueil(corpus, recueil(), new Map([
      ['e1', { ok: true as const, data }],
    ]))
    expect(projection.items[1]).toMatchObject({ type: 'passage', texte: 'aX / Yj' })
    expect(JSON.stringify(projection)).not.toContain('cdefghi')
  })

  test('le mode original relit la transcription actuelle', () => {
    const data = source()
    ;((data.corpsTexte as any).content[0].content[0] as any).text = 'Bonjour Alice à Rome.'
    const projection = projeterRecueil(corpus, recueil('original'), new Map([
      ['e1', { ok: true as const, data }],
    ]))
    const passage = projection.items[1]
    expect(passage.type === 'passage' && passage.texte).toBe('Bonjour Alice à Rome.')
  })

  test('distingue repère orphelin, absent, source indisponible et entretien retiré', () => {
    const data = source()
    data.reperesPassages = [{ id: 'p1', from: 8, to: 8 }]
    let projection = projeterRecueil(corpus, recueil(), new Map([['e1', { ok: true as const, data }]]))
    expect(projection.items[1]).toMatchObject({ type: 'passage', etat: 'repere-orphelin' })

    data.reperesPassages = []
    projection = projeterRecueil(corpus, recueil(), new Map([['e1', { ok: true as const, data }]]))
    expect(projection.items[1]).toMatchObject({ type: 'passage', etat: 'repere-introuvable' })

    projection = projeterRecueil(corpus, recueil(), new Map([['e1', { ok: false as const, raison: 'réseau' }]]))
    expect(projection.items[1]).toMatchObject({ type: 'passage', etat: 'source-indisponible' })

    projection = projeterRecueil({ membership: {} }, recueil(), new Map())
    expect(projection.items[1]).toMatchObject({ type: 'passage', etat: 'entretien-hors-corpus' })
  })

  test('bloque un export incomplet sauf décision explicite', () => {
    const projection = projeterRecueil(corpus, recueil(), new Map([
      ['e1', { ok: false as const, raison: 'réseau' }],
    ]))
    expect(() => exporterRecueilMarkdown(projection, {
      commentaires: true, sources: true, date: 'maintenant', incomplet: false,
    })).toThrow(/bloqué/)
    const incomplet = exporterRecueilMarkdown(projection, {
      commentaires: true, sources: true, date: 'maintenant', incomplet: true,
    })
    expect(incomplet).toContain('⚠')
    expect(incomplet).toContain('momentanément indisponible')
  })
})
