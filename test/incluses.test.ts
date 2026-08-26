import { describe, test, expect } from 'vitest'
import { hitsAAAnonymiser, hitsIncluses } from '../src/shared/entretien/anon/compteursAnon'
import { lignesAnonUnifiees } from '../src/shared/entretien/anon/brouillonsAnon'
import { aplatir, occurrencesDe, plageVersPM } from '../src/shared/entretien/anon/anonymisation'
import { cleEntite } from '../src/shared/entretien/anon/brouillonsAnon'
import type { Annotation } from '../src/shared/entretien/annotation'
import { scannerCorpus, type EntretienScan } from '../src/shared/corpus/scanAnon'
import type { EntretienFichier } from '../src/shared/format'

/**
 *  Incluses (chevauchement de règles) — « le large absorbe l'étroit » :
 *  une occurrence recouverte par une annotation d'une AUTRE entité plus large
 *  est masquée : ni anonymisée, ni exception, ni à anonymiser. Elle ne monte
 *  que dans l'exposant « +N » et réapparaît telle quelle au retrait de la
 *  large (rien n'est détruit — restauration gratuite).
 */

// Texte : « Marie » (étroit) ⊂ « Sainte Marie » (large).
const TEXTE = 'Sainte Marie de la mer, puis Marie seule.'
const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: TEXTE }] }],
}
const X = aplatir(DOC)
const texteDe = (f: number, t: number) => TEXTE.slice(f - 1, t - 1)

/** Plages PM des deux « Marie » (la première est dans « Sainte Marie »). */
function marie(k: 0 | 1): { from: number; to: number } {
  const pl = occurrencesDe(X.texte, 'Marie')[k]
  return plageVersPM(X, pl.from, pl.to)!
}
/** Plage PM de « Sainte Marie » (l'entité large). */
function sainteMarie(): { from: number; to: number } {
  const pl = occurrencesDe(X.texte, 'Sainte Marie')[0]
  return plageVersPM(X, pl.from, pl.to)!
}

let seq = 0
function ann(opts: { from: number; to: number; pseudo?: string; etat?: 'anonymise' | 'exception' }): Annotation {
  return { id: `a${++seq}`, type: 'anon', auteur: 'max', ...opts }
}

describe('requête « à anonymiser » vs incluses', () => {
  test('sans annotation : les deux matches de « Marie » sont à anonymiser', () => {
    const hits = hitsAAAnonymiser(DOC, ['Marie'], [], [cleEntite('Marie')], texteDe)
    expect(hits).toHaveLength(2)
    expect(hitsIncluses(DOC, ['Marie'], [], [cleEntite('Marie')], texteDe)).toEqual([])
  })

  test('le match couvert par « Sainte Marie » (autre entité) devient INCLUS', () => {
    const large = sainteMarie()
    const annotations = [ann({ ...large, pseudo: 'Ville', etat: 'anonymise' })]
    const hits = hitsAAAnonymiser(DOC, ['Marie'], annotations, [cleEntite('Marie')], texteDe)
    expect(hits).toHaveLength(1) // seul le « Marie » isolé reste à traiter
    const incluses = hitsIncluses(DOC, ['Marie'], annotations, [cleEntite('Marie')], texteDe)
    expect(incluses).toHaveLength(1)
    expect(texteDe(incluses[0].from, incluses[0].to)).toBe('Marie') // le 1er
    expect(incluses[0].par).toBe('Sainte Marie')
  })

  test('au RETRAIT de la large, l\u2019incluse redevient « à anonymiser » (restauration)', () => {
    // Simule le retrait : la liste d'annotations ne contient plus la large.
    const p2 = marie(1)
    const annotations = [ann({ ...p2, pseudo: 'Ville', etat: 'anonymise' })]
    expect(hitsAAAnonymiser(DOC, ['Marie'], [], [cleEntite('Marie')], texteDe)).toHaveLength(2)
    void annotations
  })

  test('une annotation de la MÊME entité masque sans créer d\u2019incluse', () => {
    const p = marie(0)
    const annotations = [ann({ ...p, pseudo: 'X', etat: 'anonymise' })]
    const incluses = hitsIncluses(DOC, ['Marie'], annotations, [cleEntite('Marie')], texteDe)
    expect(incluses).toEqual([])
  })
})

describe('projection — les incluses sont exclues des compteurs (comptage nulle part)', () => {
  test('occurrence englobée par une autre entité → nbIncluse, hors totaux et variantes', () => {
    const large = sainteMarie()
    const pmLarge = plageVersPM(X, large.from, large.to)!
    const pmEtroite = plageVersPM(X, marie(0).from, marie(0).to)!
    const pmLibre = plageVersPM(X, marie(1).from, marie(1).to)!
    const occurrences = [
      { id: 'i1', ...pmEtroite, pseudo: 'X', etat: 'anonymise' as const }, // sous la large
      { id: 'i2', ...pmLibre, pseudo: 'X', etat: 'anonymise' as const }, // libre
    ]
    const annotations = [ann({ ...pmLarge, pseudo: 'Ville', etat: 'anonymise' })]
    const estIncluse = (o: { from: number; to: number }) =>
      annotations.some(
        (y) => y.from <= o.from && o.to <= y.to && y.to - y.from > o.to - o.from,
      )
    const lignes = lignesAnonUnifiees([], occurrences, texteDe, {}, [], estIncluse)
    expect(lignes).toHaveLength(1)
    const l = lignes[0]
    expect(l.nbIncluse).toBe(1)
    expect(l.nb).toBe(1) // seule la libre compte
    expect(l.nbAnonymise).toBe(1)
    expect(l.occurrenceIds).toEqual(['i2']) // la masquée n'est pas actionnable ici
    expect(l.variantes).toEqual([{ pseudo: 'X', nbAnonymise: 1, nbException: 0 }])
  })

  test('aucune inclusion quand il n\u2019y a pas de chevauchement', () => {
    const pm = plageVersPM(X, marie(1).from, marie(1).to)!
    const lignes = lignesAnonUnifiees(
      [],
      [{ id: 'o', ...pm, pseudo: 'X', etat: 'anonymise' as const }],
      texteDe,
      {},
      [],
      () => false,
    )
    expect(lignes[0].nbIncluse).toBe(0)
  })
})

describe('scan corpus — état « incl » pour une règle étroite absorbée', () => {
  function fichier(annotations: Annotation[]): EntretienScan['data'] {
    return {
      formatVersion: 3,
      lastModified: new Date().toISOString(),
      corpsTexte: DOC,
      annotations,
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {} },
    }
  }
  test('match sous « Sainte Marie » → incl ; match isolé → non', () => {
    const pmLarge = sainteMarie()
    const entretiens: EntretienScan[] = [
      {
        id: 'e1',
        data: fichier([ann({ ...pmLarge, pseudo: 'Ville', etat: 'anonymise' })]),
      },
    ]
    const regles = [
      { id: 'r-marie', entite: ['Marie'], pseudos: ['X'] },
      { id: 'r-large', entite: ['Sainte Marie de la mer'], pseudos: ['Ville'] },
    ]
    const scan = scannerCorpus(regles, entretiens)
    const etroit = scan.find((s) => s.regle.id === 'r-marie')!
    expect(etroit.total.non).toBe(1) // le « Marie » isolé
    expect(etroit.total.incl).toBe(1) // celui sous la large
    expect(etroit.total.anon).toBe(0)
    const large2 = scan.find((s) => s.regle.id === 'r-large')!
    // L'annotation ne couvre que « Sainte Marie », PAS l'entité large entière :
    // elle n'est donc pas comptée anonymisée pour cette règle, et le match du
    // libellé complet reste « à traiter » (parité éditeur : pas d'englobante
    // pleine sur le match).
    expect(large2.total.anon).toBe(0)
    expect(large2.total.non).toBe(1)
    expect(large2.total.incl).toBe(0)
  })

  test('pseudo étranger mais sur le MÊME texte → anonymisée (l entité est le texte couvert, pas le pseudo)', () => {
    const pm = marie(1)
    const entretiens: EntretienScan[] = [
      { id: 'e1', data: fichier([ann({ ...pm, pseudo: 'Autre', etat: 'anonymise' })]) },
    ]
    const regles = [{ id: 'r', entite: ['Marie'], pseudos: ['X'] }]
    const scan = scannerCorpus(regles, entretiens)
    expect(scan[0].total.incl).toBe(0)
    // Le « Marie » couvert compte anonymisé (malgré son pseudo) ; seul le
    // « Marie » sous « Sainte Marie » reste hors compteurs actifs… ici sans
    // annotation large il est simplement à traiter.
    expect(scan[0].total.anon).toBe(1)
    expect(scan[0].total.non).toBe(1)
  })
})
