import { describe, test, expect } from 'vitest'
import { hitsAAAnonymiser, hitsDeCategorie } from '../src/shared/entretien/anon/compteursAnon'
import { aplatir, occurrencesDe, plageVersPM } from '../src/shared/entretien/anon/anonymisation'
import { cleEntite } from '../src/shared/entretien/anon/brouillonsAnon'
import type { Annotation } from '../src/shared/entretien/annotation'

/**
 *  Compteur « à anonymiser » (pur) — requête : occurrences du texte de
 *  l'entité NON couvertes par une annotation anon de cette même entité
 *  (anonymisée ou exception). Headless : le lecteur de texte est injecté.
 */

/** Doc PM minimal : deux paragraphes. */
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Karine habite Lyon, Karine travaille à Lyon.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Lyon voit passer Pauline.' }] },
  ],
}
const tPlat = aplatir(doc)

function texteDe(): (from: number, to: number) => string {
  return (f, t) => tPlat.texte.slice(pmVersFlat(f), pmVersFlat(t))
}
/** Position PM → offset plat (le doc est simple : blocs sans marque). */
function pmVersFlat(pm: number): number {
  for (const b of tPlat.blocs) {
    if (pm >= b.debut && pm <= b.debut + b.longueur) {
      const avant = tPlat.blocs.slice(0, tPlat.blocs.indexOf(b)).reduce((n, x) => n + x.longueur + 1, 0)
      return avant + (pm - b.debut)
    }
  }
  return -1
}

function occurrencePseudo(entite: string, pseudo = 'Marie', i = 0): Annotation {
  const pl = occurrencesDe(tPlat.texte, entite)[i]
  const pm = plageVersPM(tPlat, pl.from, pl.to)!
  return { id: `a${i}`, type: 'anon', from: pm.from, to: pm.to, auteur: 't', pseudo, etat: 'anonymise' }
}

describe('hits « à anonymiser » — requête pure', () => {
  test('sans annotation : toutes les occurrences de l\u2019entité sont à anonymiser', () => {
    const hits = hitsAAAnonymiser(doc, ['Karine'], [], [cleEntite('Karine')], texteDe())
    expect(hits).toHaveLength(2) // les 2 « Karine » du paragraphe 1
  })

  test('les occurrences déjà anonymisées ne sont plus comptées', () => {
    const a0 = occurrencePseudo('Karine')
    const hits = hitsAAAnonymiser(doc, ['Karine'], [a0], [cleEntite('Karine')], texteDe())
    expect(hits).toHaveLength(1)
  })

  test('une EXCEPTION n\u2019est jamais « à anonymiser »', () => {
    const a0 = { ...occurrencePseudo('Karine'), etat: 'exception' as const }
    const hits = hitsAAAnonymiser(doc, ['Karine'], [a0], [cleEntite('Karine')], texteDe())
    expect(hits).toHaveLength(1)
  })

  test('une annotation d\u2019une AUTRE entité ne masque pas le comptage', () => {
    // « Lyon » anonymisée n'empêche pas de compter les « Karine ».
    const lyon = occurrencePseudo('Lyon', 'Ville')
    const hits = hitsAAAnonymiser(doc, ['Karine'], [lyon], [cleEntite('Karine')], texteDe())
    expect(hits).toHaveLength(2)
  })

  test('multi-alias : chaque alias est cherché (prêt pour l\u2019étape 3a)', () => {
    const hits = hitsAAAnonymiser(doc, ['Karine', 'Pauline'], [], [cleEntite('Karine')], texteDe())
    expect(hits).toHaveLength(3)
  })

  test('les hits sont triés et en positions PM valides (le texte relu correspond)', () => {
    const hits = hitsAAAnonymiser(doc, ['Lyon'], [], [cleEntite('Lyon')], texteDe())
    expect(hits.map((h) => h.from)).toEqual([...hits.map((h) => h.from)].sort((a, b) => a - b))
    for (const h of hits) expect(texteDe()(h.from, h.to).toLowerCase()).toBe('lyon')
  })

  test('entité absente du texte → aucun hit', () => {
    const hits = hitsAAAnonymiser(doc, ['Absente'], [], [cleEntite('Absente')], texteDe())
    expect(hits).toHaveLength(0)
  })
})

describe('navigation ◄ i/N ► — liste des occurrences d\u2019une catégorie (pur)', () => {
  const cleL = cleEntite('Lyon')
  // 3 annotations « Lyon » : 2 anonymisées (Claire et Rebecca), 1 exception.
  const pls = occurrencesDe(tPlat.texte, 'Lyon').map((pl) => plageVersPM(tPlat, pl.from, pl.to)!)
  const anns: Annotation[] = [
    { id: 'l0', type: 'anon', from: pls[0].from, to: pls[0].to, auteur: 't', pseudo: 'Claire', etat: 'anonymise' },
    { id: 'l1', type: 'anon', from: pls[1].from, to: pls[1].to, auteur: 't', pseudo: 'Claire', etat: 'exception' },
    { id: 'l2', type: 'anon', from: pls[2].from, to: pls[2].to, auteur: 't', pseudo: 'Rebecca', etat: 'anonymise' },
  ]
  test('catégorie anonymisé : toutes les occurrences anonymisées, ordre croissant', () => {
    const hits = hitsDeCategorie(anns, cleL, 'anonymise', texteDe())
    expect(hits.map((h) => h.from)).toEqual([pls[0].from, pls[2].from].sort((a, b) => a - b))
  })
  test('filtre par VARIANTE : « Rebecca » seul hit', () => {
    const hits = hitsDeCategorie(anns, cleL, 'anonymise', texteDe(), 'rebecca')
    expect(hits).toEqual([{ from: pls[2].from, to: pls[2].to }])
  })
  test('catégorie exception : uniquement l\u2019exception, jamais une anonymisée', () => {
    const hits = hitsDeCategorie(anns, cleL, 'exception', texteDe())
    expect(hits).toEqual([{ from: pls[1].from, to: pls[1].to }])
  })
  test('une annotation d\u2019une AUTRE entité n\u2019entre jamais dans la liste', () => {
    const plK = occurrencesDe(tPlat.texte, 'Karine')[0]
    const karine = plageVersPM(tPlat, plK.from, plK.to)!
    const avecAutre: Annotation[] = [
      ...anns,
      { id: 'k', type: 'anon', from: karine.from, to: karine.to, auteur: 't', pseudo: 'Claire', etat: 'anonymise' },
    ]
    const hits = hitsDeCategorie(avecAutre, cleL, 'anonymise', texteDe())
    expect(hits).toHaveLength(2)
  })
  test('sans mutation du modèle (les annotations sont inchangées)', () => {
    const avant = JSON.stringify(anns)
    hitsDeCategorie(anns, cleL, 'anonymise', texteDe())
    hitsDeCategorie(anns, cleL, 'exception', texteDe(), 'Claire')
    expect(JSON.stringify(anns)).toBe(avant)
  })
})
