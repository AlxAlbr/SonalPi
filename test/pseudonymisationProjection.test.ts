import { expect, test } from 'vitest'
import { genererTxt, genererHtml, genererSrt, genererVtt, genererDonneesDocx } from '../src/shared/export/formatsTexte'
import { sonalPseudonymise } from '../src/renderer/formatSonal/exportSonal'
import { projeterSegments, appliquerAnonymisation } from '../src/shared/export/projectionEntretien'
import type { EntreeExport, OptionsExport } from '../src/shared/export/types'
import type { Annotation } from '../src/shared/entretien/annotation'

const options: OptionsExport = { entete: false, notes: false, vars: false, time: true, loc: false, thm: false, anon: true }
function entree(annotations: Annotation[]): EntreeExport {
  return { corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Rue Karine. Karine.' }] }] }, annotations,
    locuteurs: [], ancres: [{ pos: 1, t: 0 }, { pos: 20, t: 10 }], codebook: [], variables: [], meta: { valeursGen: {} }, legacy: { tabAnon: null, notes: '' } }
}
const large: Annotation = { id: 'large', type: 'anon', from: 1, to: 11, etat: 'anonymise', pseudo: 'Quartier', auteur: 'test' }
const interne: Annotation = { id: 'interne', type: 'anon', from: 5, to: 11, etat: 'exception', pseudo: 'Claire', auteur: 'test' }
const seconde: Annotation = { id: 'seconde', type: 'anon', from: 13, to: 19, etat: 'anonymise', pseudo: 'Quartier', auteur: 'test' }
test.each([false, true])('englobante visible quel que soit l’ordre %s ; un pseudo par décision, pas par fragment', (inverse) => {
  const annotations = inverse ? [large, interne, seconde] : [interne, large, seconde], e = entree(annotations), avant = JSON.stringify(e)
  const ctx = { entree: e, titre: '', notes: [], audioUrl: null }
  for (const out of [genererTxt(ctx, options), genererHtml(ctx, options), genererSrt(ctx, options), genererVtt(ctx, options), sonalPseudonymise(e)]) {
    expect(out).not.toContain('Karine'); expect(out).not.toContain('[Claire]')
    expect(out.match(/\[Quartier\]/g)).toHaveLength(2)
  }
  expect(JSON.stringify(genererDonneesDocx(ctx, options))).not.toContain('Karine')
  expect(JSON.stringify(e)).toBe(avant)
})
test('exception englobante et occurrences à traiter restent en clair, sans blocage ni remplacement inventé', () => {
  const e = entree([{ ...large, etat: 'exception' }, { ...interne, etat: 'anonymise' }, { ...seconde, pseudo: '' }])
  const ctx = { entree: e, titre: '', notes: [], audioUrl: null }
  for (const out of [genererTxt(ctx, options), genererSrt(ctx, options), genererVtt(ctx, options)]) {
    expect(out).toContain('Rue Karine. Karine.'); expect(out).not.toContain('[Claire]')
  }
})
test('même pseudo sur deux choix indépendants : jamais fusionnés ; mêmes codages sur un choix : pas de répétition', () => {
  const e = entree([large, seconde, { id: 'code', type: 'codage', code: 'cat', from: 5, to: 11, auteur: 'test' }])
  const segments = appliquerAnonymisation(projeterSegments(e))
  expect(segments.flatMap((s) => s.fragments).map((f) => f.texte).join('')).toBe('[Quartier]. [Quartier].')
})
test('le choix mémorisé dans l’entretien fait foi, pas le pseudo actuel de la définition corpus', () => {
  const e = entree([{ ...seconde, regle: 'r', pseudo: 'Claire' }])
  e.reglesAnon = [{ id: 'r', entite: ['Karine'], pseudos: ['Autre'] }]
  const avant = JSON.stringify(e), ctx = { entree: e, titre: '', notes: [], audioUrl: null }
  for (const out of [genererTxt(ctx, options), genererHtml(ctx, options), genererSrt(ctx, options), genererVtt(ctx, options), sonalPseudonymise(e), JSON.stringify(genererDonneesDocx(ctx, options))]) {
    expect(out).toContain('[Claire]'); expect(out).not.toContain('[Autre]')
  }
  expect(JSON.stringify(e)).toBe(avant)
})
test('hardBreak couvert : ne coupe pas le pseudonyme ; sans pseudo, sauts originaux conservés', () => {
  const e = entree([{ ...large, from: 1, to: 7 }])
  e.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Rue' }, { type: 'hardBreak' }, { type: 'text', text: ' K' }] }] }
  const ctx = { entree: e, titre: '', notes: [], audioUrl: null }
  expect(genererTxt(ctx, options)).toContain('[Quartier]')
  e.annotations[0].pseudo = ''
  expect(genererTxt(ctx, options)).toContain('Rue\n K')
})
