// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { lirePseudos, preparerEditionPseudos } from '../src/renderer/editionPseudosAnon'
import FormulaireRegleAnon from '../src/renderer/components/corpus/FormulaireRegleAnon.vue'
const regle = { id: 'r', entite: ['Karine'], pseudos: ['Claire'] }
test.each(['Claire / Rebecca', ' Claire/Rebecca ', 'Rebecca / Claire'])('ajout par slash conservant le choix actuel : %s', (texte) => {
  expect(preparerEditionPseudos(regle, texte)).toEqual({ type: 'ajout', pseudo: 'Rebecca' })
  expect(regle.pseudos).toEqual(['Claire'])
})
test('NFC, renommage simple et modification de la seule variante différente', () => {
  expect(lirePseudos(' Claire / Ame\u0301lie ')).toEqual(['Claire', 'Amélie'])
  expect(preparerEditionPseudos(regle, 'claire')).toEqual({ type: 'renommage', ancienPseudo: 'Claire', nouveauPseudo: 'claire' })
  expect(preparerEditionPseudos({ ...regle, pseudos: ['Claire', 'Rebecca'] }, 'Nouvelle / Claire')).toEqual({ type: 'renommage', ancienPseudo: 'Rebecca', nouveauPseudo: 'Nouvelle' })
})
test.each(['Claire', ' Claire '])('valeur inchangée : %s', (texte) => {
  expect(preparerEditionPseudos(regle, texte)).toEqual({ type: 'inchange' })
})
test('réordonner ne renomme et ne réattribue rien', () => {
  expect(preparerEditionPseudos({ ...regle, pseudos: ['Claire', 'Rebecca'] }, 'Rebecca / Claire')).toEqual({ type: 'inchange' })
})
test.each(['', ' / ', 'Claire /', '/ Claire', 'Claire / Rebecca / Marie', 'Claire / claire'])('saisie refusée sans troncature ni abandon : %j', (texte) => {
  expect(() => preparerEditionPseudos(regle, texte)).toThrow()
})
test.each(['Claire', 'Rebecca'])('retrait routé vers un bilan explicite, sans mutation : %s', (texte) => {
  const r = { ...regle, pseudos: ['Claire', 'Rebecca'] }
  expect(preparerEditionPseudos(r, texte)).toEqual({ type: 'retrait', pseudoRetire: texte === 'Claire' ? 'Rebecca' : 'Claire', pseudoConserve: texte })
  expect(r.pseudos).toEqual(['Claire', 'Rebecca'])
})
test.each(['Nouvelle', 'claire'])('retrait et modification du restant simultanés refusés : %s', (texte) => {
  expect(() => preparerEditionPseudos({ ...regle, pseudos: ['Claire', 'Rebecca'] }, texte)).toThrow('Retirez')
})
test.each(['Nouvelle / Rebecca', 'claire / Rebecca'])('ajout et renommage simultanés refusés : %s', (texte) => {
  expect(() => preparerEditionPseudos(regle, texte)).toThrow('simultanément')
})
test('deux renommages à la fois, alias multiples et pseudo hérité contenant / refusés', () => {
  expect(() => preparerEditionPseudos({ ...regle, pseudos: ['Claire', 'Rebecca'] }, 'Marie / Amélie')).toThrow('un seul')
  expect(() => preparerEditionPseudos({ ...regle, entite: ['Karine', 'Karin'] }, 'Claire / Rebecca')).toThrow('plusieurs alias')
  expect(() => preparerEditionPseudos({ ...regle, pseudos: ['A/B'] }, 'A/B / Claire')).toThrow('contient déjà')
})
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren() })
test.each(['Claire / Rebecca', 'Claire / Rebecca / Marie', 'Claire /', 'Claire / claire'])('création : champ unique avec slash, validation sans perte : %s', async (texte) => {
  const creer = vi.fn(), host = document.createElement('div'); document.body.append(host)
  const app = createApp(FormulaireRegleAnon, { categories: [], enCours: false, erreur: null, onCreer: creer }); apps.push(app); app.mount(host)
  const inputs = host.querySelectorAll('input'); expect(inputs).toHaveLength(2)
  inputs[0].value = 'Karine'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
  inputs[1].value = texte; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await nextTick()
  if (texte === 'Claire / Rebecca') expect(creer).toHaveBeenCalledExactlyOnceWith({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] })
  else { expect(creer).not.toHaveBeenCalled(); expect(host.querySelector('[role=alert]')).not.toBeNull() }
})
