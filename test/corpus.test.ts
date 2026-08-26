import { describe, test, expect } from 'vitest'
import * as corpus from '../src/shared/corpus'
import { detailsVariablesEntretien } from '../src/shared/corpus/variables'
import type { CorpusFichier, EntretienFichier, Locuteur } from '../src/shared/format'
import type { Annotation } from '../src/shared/entretien/annotation'

/**
 *  Règles PURES de corpus (shared/corpus.ts) — testées SANS dossier
 *  temporaire : c'est le gain de la séparation règles/stockage. Le comportement
 *  disque reste couvert par corpusStore.test.ts (qui délègue désormais à ces
 *  fonctions).
 */

function corpusVide(): CorpusFichier {
  return { formatVersion: 1, codebook: {}, variables: {}, reglesAnon: {}, personnes: {}, membership: {} }
}
function codage(code: string, from = 0, to = 1): Annotation {
  return { id: `a-${from}-${code}`, type: 'codage', from, to, auteur: 'm', code }
}
function loc(index: number, valeursLoc: Record<string, string> = {}): Locuteur {
  return { index, nom: `L${index}`, valeursLoc, personneRef: null }
}
function ent(
  annotations: Annotation[] = [],
  locuteurs: Locuteur[] = [],
  valeursGen: Record<string, string> = {},
): EntretienFichier {
  return { formatVersion: 2, lastModified: '', corpsTexte: {}, annotations, ancres: [], locuteurs, meta: { valeursGen, audioRef: null } }
}

describe('corpus — codebook (règles pures)', () => {
  test('ajouterCategorie : id opaque injecté, codeExport cat_NNN, ordre en fin', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    expect(corpus.ajouterCategorie(c, 'A', null, gid)).toBe('cat-1')
    expect(corpus.ajouterCategorie(c, 'B', null, gid)).toBe('cat-2')
    expect(c.codebook['cat-2']).toMatchObject({ codeExport: 'cat_002', ordre: 1 })
  })

  test('prochainCodeCategorie ne réutilise pas un codeExport retiré (max + 1)', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid) // codeExport cat_001
    corpus.ajouterCategorie(c, 'B', null, gid) // codeExport cat_002
    corpus.retirerCategorie(c, a)
    expect(corpus.prochainCodeCategorie(c.codebook)).toBe('cat_003') // pas cat_001
  })

  test('deplacerCategorie échange l’ordre avec le voisin', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid) // ordre 0
    const b = corpus.ajouterCategorie(c, 'B', null, gid) // ordre 1
    corpus.deplacerCategorie(c, b, -1)
    expect(c.codebook[b].ordre).toBe(0)
    expect(c.codebook[a].ordre).toBe(1)
  })

  test('migrerCategorie change le parent et arrive en fin de fratrie ; les enfants suivent', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid)
    const b = corpus.ajouterCategorie(c, 'B', null, gid)
    const a1 = corpus.ajouterCategorie(c, 'A1', a, gid)
    corpus.migrerCategorie(c, a1, b)
    expect(c.codebook[a1].parent).toBe(b)
    expect(c.codebook[a1].ordre).toBeGreaterThan(c.codebook[b].ordre) // fin de la fratrie de B
    // Migration à la racine.
    corpus.migrerCategorie(c, a1, null)
    expect(c.codebook[a1].parent).toBeNull()
  })

  test('migrerCategorie refuse un descendant (cycle) ou une cible inconnue', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid)
    const a1 = corpus.ajouterCategorie(c, 'A1', a, gid)
    const a2 = corpus.ajouterCategorie(c, 'A2', a1, gid)
    const avant = { ...c.codebook[a] }
    corpus.migrerCategorie(c, a, a2) // a2 descend d'a → refusé
    corpus.migrerCategorie(c, a, a) // soi-même → refusé
    corpus.migrerCategorie(c, a, 'inconnu') // cible absente → refusé
    expect(c.codebook[a]).toMatchObject(avant)
  })
})

describe('corpus — variables/modalités (id opaque injecté)', () => {
  test('ajouterVariable : id injecté, ordre + vExport en fin', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `var-${++n}`
    expect(corpus.ajouterVariable(c, 'Lieu', 'entretien', gid)).toBe('var-1')
    expect(corpus.ajouterVariable(c, 'Sexe', 'locuteur', gid)).toBe('var-2')
    expect(c.variables['var-2']).toMatchObject({ ordre: 1, vExport: 2, portee: 'locuteur' })
  })

  test('ajouterModalite : id injecté + mExport en fin', () => {
    const c = corpusVide()
    const v = corpus.ajouterVariable(c, 'Sexe', 'locuteur', () => 'var-1')
    corpus.ajouterModalite(c, v, 'H', () => 'mod-1')
    corpus.ajouterModalite(c, v, 'F', () => 'mod-2')
    expect(c.variables[v].modalites.map((m) => m.mExport)).toEqual([1, 2])
    expect(c.variables[v].modalites[1]).toMatchObject({ id: 'mod-2', lib: 'F' })
  })
})

describe('corpus — détails variables d’un entretien (panneau métadonnées, lecture seule)', () => {
  /** Définitions : « Lieu » (entretien), « Sexe » puis « Âge » (locuteur). */
  function definitions() {
    return [
      { id: 'v1', lib: 'Lieu', portee: 'entretien' as const, priv: false, ordre: 0, vExport: 1,
        modalites: [{ id: 'v1m1', lib: 'Lyon', mExport: 1 }, { id: 'v1m2', lib: 'Paris', mExport: 2 }] },
      { id: 'v2', lib: 'Sexe', portee: 'locuteur' as const, priv: false, ordre: 1, vExport: 2,
        modalites: [{ id: 'v2m1', lib: 'H', mExport: 1 }, { id: 'v2m2', lib: 'F', mExport: 2 }] },
      { id: 'v3', lib: 'Âge', portee: 'locuteur' as const, priv: false, ordre: 2, vExport: 3,
        modalites: [] },
    ]
  }

  test('résout les libellés de modalités et respecte l’ordre des définitions', () => {
    const d = detailsVariablesEntretien(definitions(), {
      meta: { valeursGen: { v1: 'v1m2' } },
      locuteurs: [
        { nom: 'Karine', valeursLoc: { v2: 'v2m2' } },
      ],
    })
    expect(d.generales.map((l) => [l.lib, l.valeur])).toEqual([['Lieu', 'Paris']])
    expect(d.parLocuteur).toHaveLength(1)
    expect(d.parLocuteur[0].nom).toBe('Karine')
    // Les deux variables locuteurs, dans l'ordre ; « Âge » n'a pas de valeur.
    expect(d.parLocuteur[0].lignes.map((l) => [l.lib, l.valeur])).toEqual([
      ['Sexe', 'F'],
      ['Âge', null],
    ])
  })

  test('les interviewers (« ? ») n’ont pas de bloc ; une valeur orpheline est ignorée', () => {
    const d = detailsVariablesEntretien(definitions(), {
      meta: { valeursGen: { v1: 'inconnu' } }, // idMod sans définition → pas de valeur affichée
      locuteurs: [
        { nom: 'Enquêteur ?', valeursLoc: { v2: 'v2m1' } }, // interviewer : exclu (parité V1)
        { nom: 'Karine', valeursLoc: {} },
      ],
    })
    expect(d.generales[0].valeur).toBeNull()
    expect(d.parLocuteur.map((b) => b.nom)).toEqual(['Karine'])
  })
})

describe('corpus — fusion d’import (idempotent par id, règle n°3)', () => {
  test('l’existant fait foi ; un 2e import du même id ne duplique ni n’écrase', () => {
    const c = corpusVide()
    const cat = { id: 'cat_005', nom: 'X', ordre: 0, parent: null, actif: true, codeExport: 'cat_005' }
    corpus.fusionnerImport(c, [cat], [])
    corpus.fusionnerImport(c, [{ ...cat, nom: 'RENOMMÉ' }], [])
    expect(Object.keys(c.codebook)).toEqual(['cat_005'])
    expect(c.codebook['cat_005'].nom).toBe('X') // existant préservé
  })
})

describe('corpus — requêtes calculées depuis une liste d’entretiens', () => {
  test('compterUsagesCategorie / usagesParCategorie balaient les annotations', () => {
    const e1 = ent([codage('cat_001', 0, 1), codage('cat_001', 1, 2)])
    const e2 = ent([codage('cat_002', 0, 1)])
    expect(corpus.compterUsagesCategorie([e1, e2], 'cat_001')).toBe(2)
    expect(corpus.usagesParCategorie([e1, e2])).toEqual({ cat_001: 2, cat_002: 1 })
  })

  test('usages variable/modalité comptent les valeurs chez leurs propriétaires', () => {
    const e = ent([], [loc(1, { v2: 'v2m1' })], { v1: 'v1m1' })
    expect(corpus.compterUsagesVariable([e], 'v1')).toBe(1) // portée entretien
    expect(corpus.compterUsagesVariable([e], 'v2')).toBe(1) // portée locuteur
    expect(corpus.compterUsagesModalite([e], 'v2', 'v2m1')).toBe(1)
    expect(corpus.compterUsagesModalite([e], 'v2', 'v2m0')).toBe(0)
  })

  test('matriceCorpus expose ligne entretien + lignes locuteurs', () => {
    const e = ent([], [loc(1, { v2: 'v2m1' })], { v1: 'v1m1' })
    const m = corpus.matriceCorpus([{ id: 'e1', titre: 'T', data: e }])
    expect(m[0]).toMatchObject({ entretienId: 'e1', titre: 'T', valeursGen: { v1: 'v1m1' } })
    expect(m[0].locuteurs[0]).toMatchObject({ index: 1, valeursLoc: { v2: 'v2m1' } })
  })
})

describe('corpus — résumé thématique (calque des cartes, parité SonalPi)', () => {
  // Doc PM à 2 blocs de 4 caractères, contenus PM [1..5[ et [7..11[ ;
  // coordonnée texte 0..8 (les frontières de blocs pèsent 0), total = 8 caractères.
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'aaaa' }] },
      { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'bbbb' }] },
    ],
  }
  const avecDoc = (annotations: Annotation[]): EntretienFichier => ({ ...ent(annotations), corpsTexte: doc })

  test('un codage → un segment en % du texte, avec ses positions PM de bornes', () => {
    const segs = corpus.resumeThematique(avecDoc([codage('cat_001', 1, 5)])) // bloc 1 entier
    expect(segs).toEqual([{ deb: 0, fin: 50, pos: 1, posFin: 5, codes: ['cat_001'] }])
  })

  test('chevauchement → segments élémentaires composés ; enjamber un bloc ne pèse rien', () => {
    // cat_001 sur x 0..4 ; cat_002 sur PM 3..9 = x 2..6 (enjambe la frontière).
    const segs = corpus.resumeThematique(
      avecDoc([codage('cat_001', 1, 5), codage('cat_002', 3, 9)]),
    )
    expect(segs).toEqual([
      { deb: 0, fin: 25, pos: 1, posFin: 3, codes: ['cat_001'] },
      { deb: 25, fin: 50, pos: 3, posFin: 5, codes: ['cat_001', 'cat_002'] },
      { deb: 50, fin: 75, pos: 7, posFin: 9, codes: ['cat_002'] },
    ])
  })

  test('deux codages adjacents de même code fusionnent ; une orpheline est exclue', () => {
    const orpheline = { ...codage('cat_003', 2, 2), id: 'orph' } // refermée (from == to)
    const segs = corpus.resumeThematique(
      avecDoc([codage('cat_001', 1, 3), codage('cat_001', 3, 5), orpheline]),
    )
    expect(segs).toEqual([{ deb: 0, fin: 50, pos: 1, posFin: 5, codes: ['cat_001'] }])
  })

  test('texte vide ou aucun codage → aucun segment', () => {
    expect(corpus.resumeThematique(avecDoc([]))).toEqual([])
    expect(corpus.resumeThematique(ent([codage('cat_001', 1, 5)]))).toEqual([]) // corpsTexte vide
  })
})

describe('corpus — hiérarchie des thèmes', () => {
  test('ajouterCategorie avec parent → sous-thème', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const p = corpus.ajouterCategorie(c, 'Parent', null, gid)
    const enfant = corpus.ajouterCategorie(c, 'Enfant', p, gid)
    expect(c.codebook[enfant].parent).toBe(p)
  })

  test('parentsDepuisRangs : parent = dernier nœud à la profondeur d-1 (N niveaux)', () => {
    expect(
      corpus.parentsDepuisRangs([
        { id: 'a', rang: 0 },
        { id: 'a1', rang: 1 },
        { id: 'a2', rang: 1 },
        { id: 'b', rang: 0 },
        { id: 'b1', rang: 1 },
      ]),
    ).toEqual({ a: null, a1: 'a', a2: 'a', b: null, b1: 'b' })
    // profondeur 2 : petit-enfant rattaché au bon niveau.
    expect(corpus.parentsDepuisRangs([
      { id: 'r', rang: 0 },
      { id: 'c', rang: 1 },
      { id: 'g', rang: 2 },
      { id: 'c2', rang: 1 },
    ])).toEqual({ r: null, c: 'r', g: 'c', c2: 'r' })
  })

  test('ordreThemes : pré-ordre (parent → enfants) + profondeur + fratrie', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid) // ordre 0
    const b = corpus.ajouterCategorie(c, 'B', null, gid) // ordre 1
    const a1 = corpus.ajouterCategorie(c, 'A1', a, gid) // ordre 2, enfant de A
    const arbre = corpus.ordreThemes(c.codebook)
    expect(arbre.map((n) => n.cat.id)).toEqual([a, a1, b]) // A, A1 (sous A), puis B
    expect(arbre.map((n) => n.profondeur)).toEqual([0, 1, 0])
    expect(arbre[0]).toMatchObject({ premier: true, dernier: false }) // A : 1er root, pas dernier
    expect(arbre[1]).toMatchObject({ premier: true, dernier: true }) // A1 : enfant unique
    expect(arbre[2]).toMatchObject({ dernier: true }) // B : dernier root
  })

  test('ordreThemes : aEnfants reflète la présence d\'enfants directs', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid)
    corpus.ajouterCategorie(c, 'A1', a, gid) // A a un enfant direct
    corpus.ajouterCategorie(c, 'B', null, gid) // B n'en a pas
    const arbre = corpus.ordreThemes(c.codebook)
    expect(arbre.find((x) => x.cat.id === a)?.aEnfants).toBe(true)
    expect(arbre.find((x) => x.cat.nom === 'B')?.aEnfants).toBe(false)
  })

  test('visiblesThemes : masque les descendants d\'une catégorie repliée (racine gardée)', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid)
    const a1 = corpus.ajouterCategorie(c, 'A1', a, gid)
    const a11 = corpus.ajouterCategorie(c, 'A11', a1, gid) // petit-fils de A
    const b = corpus.ajouterCategorie(c, 'B', null, gid)
    const arbre = corpus.ordreThemes(c.codebook)
    // Replier A → A reste, A1 et A11 disparaissent ; B (à plat) reste.
    expect(corpus.visiblesThemes(arbre, new Set([a])).map((x) => x.cat.id)).toEqual([a, b])
    // Replier A1 → seul A11 est masqué.
    expect(corpus.visiblesThemes(arbre, new Set([a1])).map((x) => x.cat.id)).toEqual([a, a1, b])
    // Rien de replié → tout est visible.
    expect(corpus.visiblesThemes(arbre, new Set()).map((x) => x.cat.id)).toEqual([a, a1, a11, b])
  })

  test('deplacerCategorie reste DANS la fratrie (ne traverse pas les parents)', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const a = corpus.ajouterCategorie(c, 'A', null, gid)
    corpus.ajouterCategorie(c, 'B', null, gid)
    const a1 = corpus.ajouterCategorie(c, 'A1', a, gid)
    const a2 = corpus.ajouterCategorie(c, 'A2', a, gid)
    corpus.deplacerCategorie(c, a2, -1) // A2 monte dans la fratrie {A1,A2}
    expect(c.codebook[a2].ordre).toBeLessThan(c.codebook[a1].ordre)
    // A1 est 1er de sa fratrie → monter est un no-op (ne swappe pas avec un root)
    const ordreAvant = c.codebook[a1].ordre
    corpus.deplacerCategorie(c, a2, -1) // A2 redescend en 1re position
    corpus.deplacerCategorie(c, a1, -1) // A1 est maintenant 2e ; le monter le remet 1er
    expect(c.codebook[a].parent).toBeNull() // A intact (jamais touché)
    expect(ordreAvant).toBeDefined()
  })

  test('retirerCategorie PROMEUT les enfants au parent du supprimé (pas d’orphelin)', () => {
    const c = corpusVide()
    let n = 0
    const gid = () => `cat-${++n}`
    const p = corpus.ajouterCategorie(c, 'P', null, gid)
    const enfant = corpus.ajouterCategorie(c, 'C', p, gid)
    corpus.retirerCategorie(c, p)
    expect(c.codebook[enfant].parent).toBeNull() // promu racine
    expect(c.codebook[p]).toBeUndefined()
  })
})

describe('corpus — poserValeur (édition table de données)', () => {
  test('portée entretien → meta.valeursGen ; idMod vide → efface', () => {
    const e = ent([], [loc(1)])
    corpus.poserValeur(e, { type: 'entretien' }, 'v1', 'v1m1')
    expect(e.meta.valeursGen).toEqual({ v1: 'v1m1' })
    corpus.poserValeur(e, { type: 'entretien' }, 'v1', '')
    expect(e.meta.valeursGen).toEqual({})
  })

  test('portée locuteur → valeursLoc du bon locuteur (pas de sentinelle)', () => {
    const e = ent([], [loc(1), loc(2)])
    corpus.poserValeur(e, { type: 'locuteur', index: 2 }, 'v2', 'v2m1')
    expect(e.locuteurs.find((l) => l.index === 2)!.valeursLoc).toEqual({ v2: 'v2m1' })
    expect(e.locuteurs.find((l) => l.index === 1)!.valeursLoc).toEqual({})
  })

  test('locuteur cible absent → no-op (pas de fantôme)', () => {
    const e = ent([], [loc(1)])
    corpus.poserValeur(e, { type: 'locuteur', index: 9 }, 'v2', 'v2m1')
    expect(e.locuteurs[0].valeursLoc).toEqual({})
  })
})
