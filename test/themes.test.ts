import { describe, expect, test, vi } from 'vitest'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import type { Annotation } from '../src/shared/entretien/annotation'
import {
  appliquerReaffectationsTheme,
  construirePlanEntretienTheme,
  deplacerEnfantsApresFusion,
  finaliserDefinitionsOperationTheme,
  inventorierCodagesTheme,
  preparerDefinitionsOperationTheme,
  verifierDemandeOperationTheme,
  verifierRepartitionOperationTheme,
  type DemandeOperationTheme,
  type NouvelleDestinationTheme,
} from '../src/shared/corpus/themes'

function corpus(): CorpusFichier {
  const c: CorpusFichier = {
    formatVersion: 1, codebook: {}, variables: {}, reglesAnon: {}, personnes: {},
    membership: {
      e1: { titre: 'Un', date: null, lastModified: 'hier' },
      e2: { titre: 'Deux', date: null, lastModified: 'hier' },
    },
  }
  for (const [ordre, id] of ['parent', 'source', 'cible', 'enfant', 'petit-enfant'].entries()) {
    c.codebook[id] = {
      id, nom: id, ordre, actif: true, codeExport: `cat_00${ordre + 1}`,
      parent: id === 'source' ? 'parent' : id === 'enfant' ? 'source' : id === 'petit-enfant' ? 'enfant' : null,
    }
  }
  return c
}

function codage(id: string, code = 'source', from = 1, to = 5): Annotation {
  return { id, type: 'codage', code, from, to, auteur: 'a' }
}

function entretien(annotations: Annotation[]): EntretienFichier {
  return {
    formatVersion: 2, lastModified: 'hier', corpsTexte: {}, annotations,
    ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
  }
}

function nouvelle(token: string, parent: string | null = 'source'): NouvelleDestinationTheme {
  return { type: 'nouvelle', token, nom: token, parent }
}

function division(effacerSource = false): Extract<DemandeOperationTheme, { type: 'division' }> {
  return {
    type: 'division', source: 'source',
    cibles: [nouvelle('A', effacerSource ? 'parent' : 'source'), nouvelle('B', effacerSource ? 'parent' : 'source')],
    choix: [], effacerSource,
  }
}

const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
const fusion: DemandeOperationTheme = { type: 'fusion', source: 'source', cible: 'cible' }

describe('inventaire des codages', () => {
  test('compte les orphelins et ignore les autres types même avec le même code', () => {
    const e = entretien([
      codage('a'), codage('b', 'source', 5, 5), codage('c', 'source', 9, 7),
      codage('d', 'cible'), { ...codage('anon'), type: 'anon' }, { ...codage('note'), type: 'commentaire' },
    ])
    expect(inventorierCodagesTheme(e, 'source')).toEqual({
      passages: 3, orphelins: 2,
      codages: [
        { annotationId: 'a', from: 1, to: 5, orphelin: false },
        { annotationId: 'b', from: 5, to: 5, orphelin: true },
        { annotationId: 'c', from: 9, to: 7, orphelin: true },
      ],
    })
  })
})

describe('réaffectations pures', () => {
  test.each([transfert, fusion])('$type réaffecte tous les codages, orphelins compris, sans toucher aux autres annotations', (demande) => {
    const e = entretien([
      codage('a'), codage('b', 'source', 9, 9),
      { ...codage('anon'), type: 'anon', regle: 'r', pseudo: 'Paul' },
      { ...codage('note'), type: 'commentaire', texte: 'mémo' },
    ])
    const avant = structuredClone(e)
    const resultat = appliquerReaffectationsTheme(e, construirePlanEntretienTheme(e, 'e1', demande, []))
    expect(resultat).toMatchObject({ reaffectes: 2, doublonsSupprimes: 0 })
    expect(resultat.entretien.annotations.slice(0, 2).map((a) => a.code)).toEqual(['cible', 'cible'])
    expect(resultat.entretien.annotations.slice(2)).toEqual(e.annotations.slice(2))
    expect(resultat.entretien.meta).toEqual(e.meta)
    expect(e).toEqual(avant)
  })

  test('déduplication exacte quel que soit l’ordre, sans nettoyer les doublons historiques', () => {
    const e = entretien([
      codage('a'), codage('b', 'source', 3, 8), codage('c', 'source', 1, 5),
      codage('existant1', 'cible'), codage('existant2', 'cible'),
      { ...codage('anon', 'cible', 3, 8), type: 'anon' },
      { ...codage('note', 'cible', 3, 8), type: 'commentaire' },
    ])
    const resultat = appliquerReaffectationsTheme(e, construirePlanEntretienTheme(e, 'e1', transfert, []))
    expect(resultat).toMatchObject({ reaffectes: 1, doublonsSupprimes: 2 })
    expect(resultat.entretien.annotations.map((a) => a.id)).toEqual(['b', 'existant1', 'existant2', 'anon', 'note'])
  })

  test('deux codages source identiques deviennent un seul codage cible, les chevauchements sont conservés', () => {
    const e = entretien([codage('a'), codage('b'), codage('c', 'source', 2, 5)])
    const resultat = appliquerReaffectationsTheme(e, construirePlanEntretienTheme(e, 'e1', transfert, []))
    expect(resultat).toMatchObject({ reaffectes: 2, doublonsSupprimes: 1 })
    expect(resultat.entretien.annotations.map((a) => a.id)).toEqual(['a', 'c'])
  })

  test('division partielle : les codages sans choix restent sur la source', () => {
    const demande = division()
    demande.choix = [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'A' }]
    const e = entretien([codage('a'), codage('b')])
    const plan = construirePlanEntretienTheme(e, 'e1', demande, [{ token: 'A', id: 'cat-A' }])
    expect(appliquerReaffectationsTheme(e, plan).entretien.annotations.map((a) => a.code)).toEqual(['cat-A', 'source'])
  })

  test('le même annotationId dans deux entretiens a deux destinations indépendantes', () => {
    const demande = division()
    demande.choix = [
      { codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'A' },
      { codage: { entretienId: 'e2', annotationId: 'a' }, destination: 'B' },
    ]
    verifierDemandeOperationTheme(corpus(), demande)
    verifierRepartitionOperationTheme(demande, demande.choix.map((choix) => choix.codage))
    const ids = [{ token: 'A', id: 'cat-A' }, { token: 'B', id: 'cat-B' }]
    for (const [id, cible] of [['e1', 'cat-A'], ['e2', 'cat-B']]) {
      const e = entretien([codage('a')])
      const plan = construirePlanEntretienTheme(e, id, demande, ids)
      expect(appliquerReaffectationsTheme(e, plan).entretien.annotations[0].code).toBe(cible)
    }
  })

  test.each([
    entretien([]), entretien([codage('a', 'cible')]),
    entretien([{ ...codage('a'), type: 'anon' }]), entretien([codage('a'), codage('a')]),
  ])('refuse une référence absente, non source ou ambiguë', (e) => {
    expect(() => appliquerReaffectationsTheme(e, { source: 'source', reaffectations: [{ annotationId: 'a', destination: 'cible' }] })).toThrow(/absent, ambigu/)
  })

  test('refuse les choix dupliqués et une destination égale à la source', () => {
    const choix = { annotationId: 'a', destination: 'cible' }
    expect(() => appliquerReaffectationsTheme(entretien([codage('a')]), { source: 'source', reaffectations: [choix, choix] })).toThrow(/plusieurs fois/)
    expect(() => appliquerReaffectationsTheme(entretien([codage('a')]), { source: 'source', reaffectations: [{ ...choix, destination: 'source' }] })).toThrow(/invalide/)
  })

  test('une destination nouvelle doit être résolue avant une mutation', () => {
    const demande: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: nouvelle('A') }
    expect(() => construirePlanEntretienTheme(entretien([codage('a')]), 'e1', demande, [])).toThrow(/non résolue/)
  })
})

describe('définitions et hiérarchie', () => {
  test('création de destinations : ids injectés, couleur, taille et parents finaux, source conservée', () => {
    const c = corpus()
    const avant = structuredClone(c)
    const demande = division(true)
    demande.cibles[0] = { ...demande.cibles[0], nom: '  Premier  ', couleur: '#123456', taille: 18 }
    let n = 0
    const prepare = preparerDefinitionsOperationTheme(c, demande, () => `cat-${++n}`)
    expect(prepare.ciblesCreees).toEqual([{ token: 'A', id: 'cat-1' }, { token: 'B', id: 'cat-2' }])
    expect(prepare.corpus.codebook['cat-1']).toMatchObject({ nom: 'Premier', parent: 'parent', couleur: '#123456', taille: 18, codeExport: 'cat_006' })
    expect(prepare.corpus.codebook['cat-2'].parent).toBe('parent')
    expect(prepare.corpus.codebook.source).toEqual(c.codebook.source)
    expect(prepare.corpus.codebook.enfant.parent).toBe('source')
    expect(c).toEqual(avant)
  })

  test('une cible existante ne génère pas d’id et le transfert conserve la hiérarchie', () => {
    const genId = vi.fn()
    const prepare = preparerDefinitionsOperationTheme(corpus(), transfert, genId)
    expect(genId).not.toHaveBeenCalled()
    expect(prepare.ciblesCreees).toEqual([])
    expect(finaliserDefinitionsOperationTheme(prepare.corpus, transfert, [])).toEqual(corpus())
  })

  test('un transfert peut retirer la source et promouvoir ses enfants', () => {
    const demande = { ...transfert, conserverSource: false }
    const final = finaliserDefinitionsOperationTheme(corpus(), demande, [])
    expect(final.codebook.source).toBeUndefined()
    expect(final.codebook.enfant.parent).toBe('parent')
    expect(final.codebook['petit-enfant'].parent).toBe('enfant')
  })

  test('la fusion déplace les enfants directs et préserve la position de la cible', () => {
    const c = corpus()
    const cible = structuredClone(c.codebook.cible)
    expect(deplacerEnfantsApresFusion(c, 'source', 'cible')).toBe(1)
    expect(c.codebook.enfant.parent).toBe('cible')
    expect(c.codebook['petit-enfant'].parent).toBe('enfant')
    expect(c.codebook.cible).toEqual(cible)
    expect(c.codebook.source).toBeDefined()
    const final = finaliserDefinitionsOperationTheme(corpus(), fusion, [])
    expect(final.codebook.source).toBeUndefined()
    expect(final.codebook.enfant.parent).toBe('cible')
  })

  test('la division destructive promeut les anciens enfants, les nouvelles catégories ont déjà un parent valide', () => {
    const demande = division(true)
    let n = 0
    const prepare = preparerDefinitionsOperationTheme(corpus(), demande, () => `cat-${++n}`)
    const final = finaliserDefinitionsOperationTheme(prepare.corpus, demande, [])
    expect(final.codebook.source).toBeUndefined()
    for (const id of ['cat-1', 'cat-2', 'enfant']) expect(final.codebook[id].parent).toBe('parent')
    expect(prepare.corpus.codebook.source).toBeDefined()
  })

  test.each([fusion, division(true)])('le retrait est refusé s’il reste un codage ($type)', (demande) => {
    expect(() => finaliserDefinitionsOperationTheme(corpus(), demande, [{ entretienId: 'e1', annotationId: 'orphelin' }])).toThrow(/encore la source/)
  })

  test('refuse un id généré en collision sans écraser le corpus', () => {
    const c = corpus()
    const avant = structuredClone(c)
    expect(() => preparerDefinitionsOperationTheme(c, division(), () => 'source')).toThrow(/déjà utilisé/)
    expect(c).toEqual(avant)
    expect(() => preparerDefinitionsOperationTheme(c, division(), () => 'nouveau')).toThrow(/déjà utilisé/)
  })
})

describe('validation des demandes', () => {
  test.each([
    { ...transfert, source: 'inconnue' },
    { ...fusion, cible: 'inconnue' },
    { ...fusion, cible: 'source' },
    { ...transfert, cible: { type: 'existante', id: 'source' } },
    { ...transfert, cible: { type: 'existante', id: 'inconnue' } },
    { ...fusion, cible: 'enfant' },
    { ...fusion, cible: 'petit-enfant' },
    { ...fusion, source: 'toString' },
  ] as DemandeOperationTheme[])('refuse une source ou cible invalide (%j)', (demande) => {
    expect(() => verifierDemandeOperationTheme(corpus(), demande)).toThrow()
  })

  test('un transfert vers un descendant est permis puisqu’il ne déplace pas les enfants', () => {
    expect(() => verifierDemandeOperationTheme(corpus(), { ...transfert, cible: { type: 'existante', id: 'enfant' } })).not.toThrow()
  })

  test('un transfert exige un choix explicite de conservation de la source', () => {
    const invalide = { ...transfert, conserverSource: undefined } as unknown as DemandeOperationTheme
    expect(() => verifierDemandeOperationTheme(corpus(), invalide)).toThrow(/conservation de la source/)
  })

  test.each([1, 5])('refuse une division avec %i destinations', (nombre) => {
    const demande = division()
    demande.cibles = Array.from({ length: nombre }, (_, i) => nouvelle(String(i)))
    expect(() => verifierDemandeOperationTheme(corpus(), demande)).toThrow(/deux à quatre/)
  })

  test.each([
    [nouvelle('A'), nouvelle('A')], [nouvelle(''), nouvelle('B')],
    [{ ...nouvelle('A'), nom: ' ' }, nouvelle('B')],
    [nouvelle('A', 'inconnu'), nouvelle('B')],
    [{ ...nouvelle('A'), taille: NaN }, nouvelle('B')],
    [{ ...nouvelle('A'), taille: 0 }, nouvelle('B')],
  ])('refuse des définitions de destination invalides (%j)', (cibles) => {
    expect(() => verifierDemandeOperationTheme(corpus(), { ...division(), cibles })).toThrow()
  })

  test.each(['source', 'enfant', 'petit-enfant'])('refuse un nouveau parent dépendant de la source supprimée : %s', (parent) => {
    expect(() => verifierDemandeOperationTheme(corpus(), { ...division(true), cibles: [nouvelle('A', parent), nouvelle('B', 'parent')] })).toThrow(/sous-arbre/)
  })

  test('refuse un cycle dans les parents sans boucle infinie', () => {
    const c = corpus()
    c.codebook.parent.parent = 'source'
    expect(() => verifierDemandeOperationTheme(c, transfert)).toThrow(/cycle/)
  })

  test('refuse un codage choisi deux fois, une destination inconnue et un entretien hors membership', () => {
    const choix = { codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'A' }
    expect(() => verifierDemandeOperationTheme(corpus(), { ...division(), choix: [choix, choix] })).toThrow(/plusieurs fois/)
    expect(() => verifierDemandeOperationTheme(corpus(), { ...division(), choix: [{ ...choix, destination: 'inconnue' }] })).toThrow(/inconnue/)
    expect(() => verifierDemandeOperationTheme(corpus(), { ...division(), choix: [{ ...choix, codage: { entretienId: 'autre', annotationId: 'a' } }] })).toThrow(/absent/)
  })

  test('suppression impossible si un codage, y compris orphelin, est non réparti', () => {
    const demande = division(true)
    demande.choix = [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'A' }]
    const inventaire = [{ entretienId: 'e1', annotationId: 'a' }, { entretienId: 'e1', annotationId: 'orphelin' }]
    expect(() => verifierRepartitionOperationTheme(demande, inventaire)).toThrow(/non répartis/)
    demande.choix.push({ codage: inventaire[1], destination: 'B' })
    expect(() => verifierRepartitionOperationTheme(demande, inventaire)).not.toThrow()
    expect(() => verifierRepartitionOperationTheme(demande, inventaire.slice(0, 1))).toThrow(/absent/)
    expect(() => verifierRepartitionOperationTheme(demande, [...inventaire, inventaire[0]])).toThrow(/ambiguë/)
  })
})
