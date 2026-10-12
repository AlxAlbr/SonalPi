import { describe, expect, test } from 'vitest'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'
import { construireDiff, etatsDepuisDetails, scannerCorpus, scannerRegleDetaille } from '../src/shared/corpus/scanAnon'
import { appliquerRegleAnonEntretien, instructionsAppliquerRegle } from '../src/shared/entretien/anon/applicationMasse'
import { aplatir, instructionsValiderAnon, plageVersPM } from '../src/shared/entretien/anon/anonymisation'
import { hitsAAAnonymiser, hitsIncluses } from '../src/shared/entretien/anon/compteursAnon'
import { texteDeDoc } from '../src/shared/entretien/anon/classification'

function preparer() {
  const fixture = fixturePseudonymisation()
  const entretien = fixture.entretiens[0]
  const regle = fixture.regles[0]
  const details = { [entretien.id]: scannerRegleDetaille(regle, entretien) }
  const etats = etatsDepuisDetails(details)
  return { ...fixture, entretien, regle, details, ...etats }
}

describe('cohérence de la pseudonymisation textuelle', () => {
  test('la recette distingue variantes, exceptions, incluses et règle inutilisée', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const scans = scannerCorpus(regles, entretiens)
    expect(scans[0].total).toEqual({ anon: 1, exc: 1, non: 0, incl: 0 })
    expect(scans[1].variantes).toEqual({ Claire: 1, Rebecca: 1 })
    expect(scannerRegleDetaille(regles[1], entretiens[0]).map((o) => o.pseudo)).toEqual(['Claire', 'Rebecca'])
    expect(scans[3].total).toEqual({ anon: 0, exc: 0, non: 0, incl: 1 })
    expect(scans[4].total).toEqual({ anon: 0, exc: 0, non: 0, incl: 0 })
  })

  test('une englobante avec le même pseudo ne change pas l’identité de l’entité incluse', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const gare = regles[3]
    entretiens[0].data.annotations.find((a) => a.pseudo === 'Quartier témoin')!.pseudo = 'Station'
    for (const annotations of [entretiens[0].data.annotations, [...entretiens[0].data.annotations].reverse()]) {
      const entretien = { ...entretiens[0], data: { ...entretiens[0].data, annotations } }
      const detail = scannerRegleDetaille(gare, entretien)
      expect(detail[0].etat).toBe('incl')
      expect(detail[0].actionnable).toBe(false)
      expect(scannerCorpus([gare], [entretien])[0].total.incl).toBe(detail.length)
      const aliases = gare.entite
      expect(hitsIncluses(entretien.data.corpsTexte, aliases, annotations, ['gare'], texteDeDoc(entretien.data.corpsTexte))).toHaveLength(1)
      expect(hitsAAAnonymiser(entretien.data.corpsTexte, aliases, annotations, ['gare'], texteDeDoc(entretien.data.corpsTexte))).toEqual([])
    }
    entretiens[0].data.annotations = entretiens[0].data.annotations.filter((a) => a.pseudo !== 'Station' || a.etat === 'exception')
    expect(scannerRegleDetaille(gare, entretiens[0])[0].etat).toBe('exc')
  })

  test('validation sans changement et permutation des variantes conservent les choix', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const e = entretiens[0].data
    const texteDe = texteDeDoc(e.corpsTexte)
    const r = instructionsValiderAnon(e.annotations, [], 'karine', 'Rebecca', texteDe, () => 'nouvelle')
    expect(r.relabel.map((a) => a.pseudo)).toEqual(['Claire', 'Rebecca'])
    regles[1].pseudos.reverse()
    expect(scannerRegleDetaille(regles[1], entretiens[0]).map((a) => a.pseudo)).toEqual(['Claire', 'Rebecca'])
  })

  test('un retrait seul ne pose pas les occurrences libres et ne touche pas les locuteurs', () => {
    const s = preparer()
    const locuteurs = structuredClone(s.entretien.data.locuteurs)
    s.cochees[s.entretien.id]['1:5'] = false
    const cible = construireDiff(s.regle.id, s.details, s.cochees, s.exceptions).cibles[0]
    expect(cible.plages).toEqual([])
    expect(appliquerRegleAnonEntretien(s.entretien.data, s.regle, cible)).toBe(1)
    expect(s.entretien.data.annotations.some((a) => a.from === 1)).toBe(false)
    expect(s.entretien.data.locuteurs).toEqual(locuteurs)
  })

  test('exception retirée puis anonymisée dans la même validation', () => {
    const s = preparer()
    const o = s.details[s.entretien.id][1]
    const cle = `${o.from}:${o.to}`
    s.exceptions[s.entretien.id][cle] = false
    s.cochees[s.entretien.id][cle] = true
    const diff = construireDiff(s.regle.id, s.details, s.cochees, s.exceptions)
    expect(diff).toMatchObject({ poses: 1, exceptionsRetirees: 1 })
    expect(appliquerRegleAnonEntretien(s.entretien.data, s.regle, diff.cibles[0])).toBe(2)
    expect(s.entretien.data.annotations.find((a) => a.from === o.from)).toMatchObject({ etat: 'anonymise', pseudo: 'Ville témoin' })
  })

  test.each(['texte', 'annotation', 'regle'] as const)('refuse un aperçu périmé par changement de %s sans mutation', (type) => {
    const s = preparer()
    s.cochees[s.entretien.id]['1:5'] = false
    const cible = construireDiff(s.regle.id, s.details, s.cochees, s.exceptions).cibles[0]
    if (type === 'texte') s.entretien.data.corpsTexte = { type: 'doc', content: [] }
    if (type === 'annotation') s.entretien.data.annotations[0].pseudo = 'Autre'
    if (type === 'regle') s.regle.pseudos = ['Autre']
    const avant = structuredClone(s.entretien.data)
    expect(() => appliquerRegleAnonEntretien(s.entretien.data, s.regle, cible)).toThrow('périmé')
    expect(s.entretien.data).toEqual(avant)
  })

  test('déduplique les alias identiques ou recouvrants dans le scan et les poses', () => {
    const s = preparer()
    const regle = { id: 'large', entite: ['Rue de la Gare', 'Gare', 'gare'], pseudos: ['Quartier'] }
    s.entretien.data.annotations = []
    const scan = scannerCorpus([regle], [s.entretien])[0]
    expect(scan.total.non).toBe(1)
    expect(instructionsAppliquerRegle(s.entretien.data, regle, () => 'nouvelle').nb).toBe(1)
  })

  test('protège une exception interne et garde sa mémoire', () => {
    const s = preparer()
    const regle = { id: 'large', entite: ['Rue de la Gare'], pseudos: ['Quartier'] }
    s.entretien.data.annotations = s.entretien.data.annotations.filter((a) => a.etat === 'exception')
    const detail = scannerRegleDetaille(regle, s.entretien)
    expect(detail[0]).toMatchObject({ etat: 'non', actionnable: false })
    expect(instructionsAppliquerRegle(s.entretien.data, regle, () => 'nouvelle').nb).toBe(0)
    expect(s.entretien.data.annotations.some((a) => a.regle === 'gare')).toBe(true)
  })

  test('la couverture confirmée conserve l’exception interne et son retrait la révèle', () => {
    const s = preparer()
    const regle = { id: 'large', entite: ['Rue de la Gare'], pseudos: ['Quartier'] }
    s.entretien.data.annotations = s.entretien.data.annotations.filter((a) => a.etat === 'exception')
    const [match] = scannerRegleDetaille(regle, s.entretien)
    const texteDe = texteDeDoc(s.entretien.data.corpsTexte)
    const avant = structuredClone(s.entretien.data.annotations)
    const demande = instructionsValiderAnon(avant, [match], 'rue de la gare', 'Quartier', texteDe, () => 'englobante')
    expect(demande.poser).toEqual([])
    expect(demande.exceptionsProtegees).toEqual([match])
    const confirme = instructionsValiderAnon(avant, [match], 'rue de la gare', 'Quartier', texteDe, () => 'englobante', [], true)
    expect(confirme.poser).toHaveLength(1)
    expect(s.entretien.data.annotations).toEqual(avant)
    s.entretien.data.annotations.push({ ...confirme.poser[0], type: 'anon', auteur: 'test', etat: 'anonymise' })
    expect(scannerRegleDetaille(s.regles[3], s.entretien)[0].etat).toBe('incl')
    s.entretien.data.annotations = s.entretien.data.annotations.filter((a) => a.id !== 'englobante')
    expect(scannerRegleDetaille(s.regles[3], s.entretien)[0].etat).toBe('exc')
  })

  test('un match en fin de paragraphe se convertit, une plage inter-blocs est refusée', () => {
    const plat = aplatir({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Lyon' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Gare' }] },
    ] })
    expect(plageVersPM(plat, 0, 4)).toEqual({ from: 1, to: 5 })
    expect(plageVersPM(plat, 0, 9)).toBeNull()
  })
})
