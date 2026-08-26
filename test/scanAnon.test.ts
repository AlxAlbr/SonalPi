import { describe, test, expect } from 'vitest'
import { scannerCorpus, type EntretienScan, type StatutScan } from '../src/shared/corpus/scanAnon'
import type { EntretienFichier, RegleAnon } from '../src/shared/format'
import type { Annotation } from '../src/shared/entretien/annotation'

/** Construit un entretien mono-paragraphe (PM : contenu démarrant à 1). */
function entretien(texte: string, annotations: Annotation[] = [], id = 'e1'): EntretienScan {
  const data: EntretienFichier = {
    formatVersion: 3,
    lastModified: '',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: texte }] }] },
    annotations,
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
  return { id, data }
}

/** Annotation anon sur une sous-chaîne du texte plat (contenu PM débutant à 1). */
function anon(texte: string, idx: number, len: number, etat: 'anonymise' | 'exception', pseudo = 'X'): Annotation {
  return { id: `a${idx}`, type: 'anon', from: 1 + idx, to: 1 + idx + len, auteur: '', etat, pseudo }
}

function regle(entite: string, pseudo: string, id = 'r1'): RegleAnon {
  return { id, entite: [entite], pseudos: [pseudo] }
}

const TOTAL: StatutScan = { anon: 0, exc: 0, non: 0, incl: +0 }

describe('scannerCorpus — scan des règles corpus', () => {
  test('entité absente du texte → aucun entretien touché, compteurs à 0', () => {
    const e = entretien('Karine habite ici.')
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual(TOTAL)
    expect(scan.parEntretien).toEqual({})
  })

  test('occurrences nues sans annotation → « à traiter » (non)', () => {
    const e = entretien('Lyon est grand. Lyon est beau.')
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual({ anon: 0, exc: 0, non: 2, incl: +0 })
    expect(scan.parEntretien.e1).toEqual({ anon: 0, exc: 0, non: 2, incl: +0 })
  })

  test('occurrence anonymisée (pseudo de la règle) → « anonymisé »', () => {
    const texte = 'Lyon est grand. Lyon est beau.'
    const e = entretien(texte, [
      anon(texte, 0, 4, 'anonymise', 'L'),
      anon(texte, 16, 4, 'anonymise', 'L'), // 2ᵉ « Lyon » (offset 16)
    ])
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual({ anon: 2, exc: 0, non: 0, incl: +0 })
  })

  test('occurrence en exception → « exception », jamais « à traiter »', () => {
    const texte = 'Lyon est grand. Lyon est beau.'
    const e = entretien(texte, [anon(texte, 0, 4, 'exception', 'L')])
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual({ anon: 0, exc: 1, non: 1, incl: +0 })
  })

  test("anonymisée avec un pseudo ÉTRANGER à la règle mais sur le MÊME texte → « anonymisée » (parité compteur entretien : le pseudo ne fait pas l'entité)", () => {
    const texte = 'Lyon est grand.'
    const e = entretien(texte, [anon(texte, 0, 4, 'anonymise', 'Autre')])
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual({ anon: 1, exc: 0, non: 0, incl: +0 })
  })

  test('mélange d’états sur plusieurs entretiens, agrégé + drill-down par entretien', () => {
    const t1 = 'Lyon. Lyon.'
    const t2 = 'Lyon.'
    const e1 = entretien(t1, [anon(t1, 0, 4, 'anonymise', 'L'), anon(t1, 6, 4, 'exception', 'L')], 'e1')
    const e2 = entretien(t2, [], 'e2')
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e1, e2])
    expect(scan.total).toEqual({ anon: 1, exc: 1, non: 1, incl: +0 })
    expect(scan.parEntretien.e1).toEqual({ anon: 1, exc: 1, non: 0, incl: +0 })
    expect(scan.parEntretien.e2).toEqual({ anon: 0, exc: 0, non: 1, incl: +0 })
  })

  test('multi-alias (`entite[]`) : les variantes sont scannées ensemble', () => {
    const texte = 'Mme Durand parle, puis Durand répond.'
    const e = entretien(texte)
    const [scan] = scannerCorpus([regle('Durand', 'D')], [e])
    // « Durand » en 2ᵉ occurrence seulement (Mme Durand → « Durand » matche aussi dedans)
    // occurrencesDe « Durand » : 2 (« Durand » dans « Mme Durand » + « Durand » final).
    expect(scan.total.anon).toBe(0)
    expect(scan.total.non).toBe(2)
  })

  test('plusieurs règles corpus : chacune est scannée indépendamment', () => {
    const texte = 'Lyon et Marseille.'
    const e = entretien(texte)
    const scans = scannerCorpus([regle('Lyon', 'L'), regle('Marseille', 'M')], [e])
    expect(scans).toHaveLength(2)
    expect(scans[0].total.non).toBe(1)
    expect(scans[1].total.non).toBe(1)
  })

  test('aucune règle → résultat vide (panneau corpus vide en 3a)', () => {
    expect(scannerCorpus([], [entretien('Lyon.')])).toEqual([])
  })
})

import { scannerRegleDetaille } from '../src/shared/corpus/scanAnon'
describe('scannerRegleDetaille — vue vérification (contexte par occurrence)', () => {
  function fichier(corpsTexte: unknown, annotations: EntretienFichier['annotations']): EntretienScan['data'] {
    return {
      formatVersion: 3,
      lastModified: new Date().toISOString(),
      corpsTexte,
      annotations,
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {} },
    }
  }
  const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Karine habite Lyon. Karine part.' }] }],
  }
  test('états + contexte avant/match/après, trié par position', () => {
    // Poser « Lyon » anonymisée via une annotation PM (bloc début à 1).
    const annotations: EntretienFichier['annotations'] = [
      { id: 'a1', type: 'anon', from: 16, to: 20, auteur: 't', pseudo: 'Ville', etat: 'anonymise' },
    ]
    const scan = scannerRegleDetaille({ id: 'r', entite: ['Karine'], pseudos: ['X'] }, { id: 'e', data: fichier(doc, annotations) })
    expect(scan).toHaveLength(2)
    expect(scan[0].from).toBeLessThan(scan[1].from)
    expect(scan[0].match).toBe('Karine')
    expect(scan[0].etat).toBe('non')
    expect(scan[0].avant).toBe('')
    expect(scan[0].apres.startsWith(' habite')).toBe(true)
  })

  test('largeur du contexte bornée au texte', () => {
    const scan = scannerRegleDetaille({ id: 'r', entite: ['Karine'], pseudos: [] }, { id: 'e', data: fichier(doc, []) }, 5)
    expect(scan[0].avant.length).toBeLessThanOrEqual(5)
    expect(scan[0].apres).toBe(' habi')
  })
})

describe('scannerCorpus — pseudo de l annotation ≠ pseudo de la règle', () => {
  test('un ancien pseudo (expérimentation multi-pseudo) ne déclasse pas en « à traiter » : le TEXTE couvert fait foi (parité compteur entretien)', () => {
    const e = entretien('La Maison des Habitants ouvre.', [
      anon('La Maison des Habitants ouvre.', 3, 21, 'anonymise', 'tipuuu iiitop'),
    ])
    const [scan] = scannerCorpus([regle('Maison des Habitants', 'top')], [e])
    expect(scan.total).toEqual({ anon: 1, exc: 0, non: 0, incl: 0 })
  })
  test('une annotation couvrant une AUTRE entité plus large reste « incluse », pas « anonymisée »', () => {
    // « Rue de la Gare » (plus large) recouvre le match « Gare ».
    const e = entretien('Devant la Rue de la Gare, un café.', [
      anon('Devant la Rue de la Gare, un café.', 8, 16, 'anonymise', 'quartier'),
    ])
    const [scan] = scannerCorpus([regle('Gare', 'G')], [e])
    expect(scan.total).toEqual({ anon: 0, exc: 0, non: 0, incl: 1 })
  })
  test('le pseudo exact de la règle est toujours accepté (annotation posée par une autre portée)', () => {
    const e = entretien('Visite de Lyon un lundi.', [
      anon('Visite de Lyon un lundi.', 10, 4, 'anonymise', 'L'),
    ])
    const [scan] = scannerCorpus([regle('Lyon', 'L')], [e])
    expect(scan.total).toEqual({ anon: 1, exc: 0, non: 0, incl: 0 })
  })
})
