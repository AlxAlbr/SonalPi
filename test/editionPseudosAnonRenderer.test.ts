// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import EditionPseudosAnon from '../src/renderer/components/corpus/EditionPseudosAnon.vue'
import type { ResultatAjoutVarianteAnon } from '../src/shared/corpus/variantesAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.restoreAllMocks() })
async function rendu() { await nextTick(); await Promise.resolve(); await nextTick() }
function bouton(texte: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)! }
async function monter(pseudos = ['Claire'], retraitAutorise = true) {
  const regle = ref({ id: 'r', entite: ['Karine'], pseudos, categorie: 'PER' }), disponible = ref(true), contexte = ref(1)
  const ajouter = vi.fn(async (): Promise<ResultatAjoutVarianteAnon> => ({ ajoute: true, regle: { ...regle.value, pseudos: ['Claire', 'Rebecca'] } }))
  Object.defineProperty(window, 'sonal', { configurable: true, value: { corpus: { regleAnonAjouterVariante: ajouter } } })
  const termine = vi.fn(), fermer = vi.fn(), activite = vi.fn(), host = document.createElement('div'); document.body.append(host)
  const renommer = vi.fn(), retirer = vi.fn(), renommageDisponible = ref(true), retraitDisponible = ref(retraitAutorise)
  const app = createApp({ render: () => h(EditionPseudosAnon, { regle: regle.value, ajoutDisponible: disponible.value, renommageDisponible: renommageDisponible.value, retraitDisponible: retraitDisponible.value, contexte: contexte.value,
    onTermine: termine, onFermer: fermer, onActivite: activite, onRenommer: renommer, onRetirer: retirer }) }); apps.push(app); app.mount(host); await rendu()
  async function saisir(texte: string) { const champ = host.querySelector<HTMLInputElement>('input')!; champ.value = texte; champ.dispatchEvent(new Event('input', { bubbles: true })); await rendu() }
  function submit() { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }
  return { app, ajouter, renommer, retirer, retraitDisponible, renommageDisponible, termine, fermer, activite, regle, disponible, contexte, host, saisir, submit }
}
test('focus, explications et annulation ne publient rien', async () => {
  const b = await monter()
  expect(document.activeElement?.tagName).toBe('INPUT'); expect(b.host.textContent).toContain('restent inchangés')
  expect(b.host.querySelector('input')!.value).toBe('Claire')
  await b.saisir('Claire / Rebecca'); bouton('Annuler').click()
  expect(b.fermer).toHaveBeenCalledOnce(); expect(b.ajouter).not.toHaveBeenCalled()
})
test.each(['', ' ', 'Claire', 'Claire / claire'])('variante vide ou identique %j : aucun IPC', async (texte) => {
  const b = await monter(); await b.saisir(texte); b.submit(); await rendu()
  expect(b.ajouter).not.toHaveBeenCalled(); expect(b.host.querySelector('[role=alert]')).not.toBeNull()
})
test('confirmation unique, définition avant scellée et résultat sans mise en application', async () => {
  const b = await monter(); await b.saisir('Claire / Rebecca'); b.submit(); b.submit(); await rendu()
  expect(b.ajouter).toHaveBeenCalledExactlyOnceWith({ regleAvant: { id: 'r', entite: ['Karine'], pseudos: ['Claire'], categorie: 'PER' }, pseudo: 'Rebecca' })
  expect(b.termine).toHaveBeenCalledOnce(); expect(b.activite.mock.calls).toEqual([[true], [false]])
  expect(b.regle.value.pseudos).toEqual(['Claire']); expect(bouton('Enregistrer').disabled).toBe(true)
})
test.each(['contexte', 'disponible', 'regle'] as const)('changement de %s interdit la confirmation', async (champ) => {
  const b = await monter(); await b.saisir('Claire / Rebecca')
  if (champ === 'contexte') b.contexte.value++
  if (champ === 'disponible') b.disponible.value = false
  if (champ === 'regle') b.regle.value.categorie = 'LOC'
  await rendu(); b.submit(); await rendu()
  expect(b.ajouter).not.toHaveBeenCalled(); expect(bouton('Enregistrer').disabled).toBe(true)
  expect(b.host.textContent).toContain('Fermez cette fenêtre')
})
test('envoi en cours : pas d’annulation, Escape, double envoi ni perte du focus', async () => {
  const b = await monter(); let finir!: (r: ResultatAjoutVarianteAnon) => void
  b.ajouter.mockImplementationOnce(() => new Promise((resolve) => { finir = resolve }))
  await b.saisir('Claire / Rebecca'); b.submit(); await rendu()
  bouton('Annuler').click(); b.host.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  b.submit(); expect(b.fermer).not.toHaveBeenCalled(); expect(b.ajouter).toHaveBeenCalledTimes(1)
  expect(document.activeElement?.tagName).toBe('FORM')
  finir({ ajoute: true, regle: b.regle.value }); await rendu(); expect(b.termine).toHaveBeenCalledOnce()
})
test.each(['demontage', 'contexte'] as const)('réponse tardive après %s ignorée', async (cas) => {
  const b = await monter(); let finir!: (r: ResultatAjoutVarianteAnon) => void
  b.ajouter.mockImplementationOnce(() => new Promise((resolve) => { finir = resolve }))
  await b.saisir('Claire / Rebecca'); b.submit(); await rendu()
  if (cas === 'demontage') b.app.unmount(); else b.contexte.value++
  finir({ ajoute: true, regle: b.regle.value }); await rendu(); expect(b.termine).not.toHaveBeenCalled()
})
test('tirage automatique suspendu pendant l’ajout puis repris après le résultat', async () => {
  const b = await monter(); let finir!: (r: ResultatAjoutVarianteAnon) => void
  b.ajouter.mockImplementationOnce(() => new Promise((resolve) => { finir = resolve }))
  await b.saisir('Claire / Rebecca'); b.submit(); await rendu()
  try { expect(tirageAutomatiqueSuspendu.value).toBe(true) }
  finally { finir({ ajoute: true, regle: b.regle.value }); await rendu() }
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('changement de contexte avant le départ IPC : aucun ajout, tirage repris', async () => {
  const b = await monter(); await b.saisir('Claire / Rebecca'); b.submit(); b.contexte.value++
  await rendu(); expect(b.ajouter).not.toHaveBeenCalled(); expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('erreur de publication : explication et assistance repliée, aucune deuxième tentative', async () => {
  const b = await monter(); b.ajouter.mockRejectedValueOnce(new Error('Détail de publication'))
  await b.saisir('Claire / Rebecca'); b.submit(); await rendu()
  expect(b.host.querySelector('[role=alert]')!.textContent).toContain('actualisez le corpus')
  expect(b.host.querySelector('details')!.open).toBe(false)
  expect(b.host.querySelector('summary')!.textContent).toBe('Informations pour l’assistance')
  b.submit(); expect(b.ajouter).toHaveBeenCalledTimes(1)
})
test('piège de focus clavier et fermeture par Escape avant envoi', async () => {
  const b = await monter(), dialogue = b.host.querySelector<HTMLElement>('[role=dialog]')!
  bouton('Enregistrer').focus(); dialogue.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(bouton('Annuler'))
  dialogue.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(b.fermer).toHaveBeenCalledOnce(); expect(b.ajouter).not.toHaveBeenCalled()
})

test('renommage : transfert de la saisie vers le bilan, sans ajout ni publication', async () => {
  const b = await monter(); await b.saisir('Nouvelle'); b.submit(); b.submit(); await rendu()
  expect(b.renommer).toHaveBeenCalledExactlyOnceWith('Claire', 'Nouvelle')
  expect(b.ajouter).not.toHaveBeenCalled(); expect(b.termine).not.toHaveBeenCalled()
})
test('deux variantes : saisie complète et renommage de la seule variante modifiée', async () => {
  const b = await monter(); b.app.unmount()
  const host = document.createElement('div'); document.body.append(host)
  const renommer = vi.fn(), app = createApp(EditionPseudosAnon, { regle: { id: 'r', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] }, ajoutDisponible: true, renommageDisponible: true, retraitDisponible: true, contexte: 1, onRenommer: renommer })
  apps.push(app); app.mount(host); await rendu()
  const input = host.querySelector('input')!
  expect(input.value).toBe('Claire / Rebecca')
  input.value = 'Claire / Nouvelle'; input.dispatchEvent(new Event('input', { bubbles: true })); await rendu()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await rendu()
  expect(renommer).toHaveBeenCalledExactlyOnceWith('Rebecca', 'Nouvelle'); expect(b.ajouter).not.toHaveBeenCalled()
})
test.each(['gitlab', 'webdav'])('capacité d’ajout refusée, mais renommage accessible : %s', async () => {
  const b = await monter(); b.app.unmount()
  const app = createApp(EditionPseudosAnon, { regle: b.regle.value, ajoutDisponible: false, renommageDisponible: true, retraitDisponible: false, contexte: 1, onRenommer: b.renommer })
  const host = document.createElement('div'); document.body.append(host); apps.push(app); app.mount(host); await rendu()
  const champ = host.querySelector('input')!
  champ.value = 'Claire / Rebecca'; champ.dispatchEvent(new Event('input', { bubbles: true })); await rendu()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await rendu()
  expect(host.querySelector('[role=alert]')!.textContent).toContain('corpus distant')
  expect(b.ajouter).not.toHaveBeenCalled(); expect(b.renommer).not.toHaveBeenCalled()
  champ.value = 'Nouvelle'; champ.dispatchEvent(new Event('input', { bubbles: true })); await rendu()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await rendu()
  expect(b.renommer).toHaveBeenCalledExactlyOnceWith('Claire', 'Nouvelle')
})
test('retirer une valeur ne publie rien : intention vers le bilan de remplacement', async () => {
  const b = await monter(['Claire', 'Rebecca']); await b.saisir('Rebecca'); b.submit(); await rendu()
  expect(b.retirer).toHaveBeenCalledExactlyOnceWith('Claire', 'Rebecca')
  expect(b.ajouter).not.toHaveBeenCalled(); expect(b.renommer).not.toHaveBeenCalled(); expect(b.termine).not.toHaveBeenCalled()
  b.submit(); await rendu(); expect(b.retirer).toHaveBeenCalledTimes(1)
})
test.each(['gitlab', 'webdav'])('capacité de retrait refusée avant toute intention : %s', async () => {
  const b = await monter(['Claire', 'Rebecca'], false); await b.saisir('Claire'); b.submit(); await rendu()
  expect(b.host.querySelector('[role=alert]')!.textContent).toContain('corpus distant')
  expect(b.retirer).not.toHaveBeenCalled(); expect(b.ajouter).not.toHaveBeenCalled(); expect(b.renommer).not.toHaveBeenCalled()
})
