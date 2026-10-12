// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import EchangesCorrespondances from '../src/renderer/components/corpus/EchangesCorrespondances.vue'
import type { SuiviImportCorrespondances } from '../src/shared/corpus/importCorrespondances'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
async function rendu() { for (let n = 0; n < 12; n++) { await Promise.resolve(); await nextTick() } }
function bouton(texte: string) {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error('Bouton attendu absent.')
  return b
}
function lot(): SuiviImportCorrespondances {
  return { operationId: 'lot-synthétique', confirmes: 1, restants: 1, indeterminee: true,
    definitionsCorpus: false, bilanPrevu: { ajouts: 0, variantes: 0, remplacements: 0, ignores: 0,
      entretiens: { definitionsLocales: 2, locuteurs: 2, entretiens: 2 } },
    cibles: [{ entretienId: 'e1', titre: 'Premier entretien', etat: 'confirme' }, { entretienId: 'e2', titre: 'Second entretien', etat: 'envoi' }] }
}
async function monter(suivi: SuiviImportCorrespondances | null, disponible = true, lecture?: () => Promise<SuiviImportCorrespondances | null>) {
  const api = { suiviImportCorrespondances: vi.fn(lecture ?? (async () => structuredClone(suivi))),
    reprendreImportCorrespondances: vi.fn(), apercuImportCorrespondances: vi.fn(), importerCorrespondances: vi.fn() }
  vi.stubGlobal('sonal', { corpus: api })
  const importe = vi.fn(), activite = vi.fn()
  const conteneur = document.createElement('div'); document.body.append(conteneur)
  const app = createApp(EchangesCorrespondances, { mode: 'import', importDisponible: disponible, onImporte: importe, onActivite: activite })
  apps.push(app); app.mount(conteneur)
  await rendu()
  return { api, importe, activite, app }
}
function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click() }

test('reprise durable : état partiel, cibles, garde explicite et aucune libération de verrou proposée', async () => {
  const b = await monter(lot())
  expect(document.body.textContent).toContain('Un envoi reste indéterminé')
  expect(document.body.textContent).toContain('Premier entretien (e1) — Publication confirmée')
  expect(document.body.textContent).toContain('aucun verrou natif n’est forcé')
  expect(document.querySelector('input[type="file"]')).toBeNull()
  expect(bouton('Reprendre l’import WebDAV').disabled).toBe(true)
  let terminer!: (v: unknown) => void
  b.api.reprendreImportCorrespondances.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  confirmer(); await rendu()
  bouton('Reprendre l’import WebDAV').click(); bouton('Reprendre l’import WebDAV').click()
  await rendu()
  expect(b.api.reprendreImportCorrespondances).toHaveBeenCalledExactlyOnceWith('lot-synthétique', true)
  expect(bouton('Reprendre l’import WebDAV').disabled).toBe(true)
  terminer(lot().bilanPrevu); await rendu()
  expect(b.importe).toHaveBeenCalledTimes(1)
  expect(b.api.importerCorrespondances).not.toHaveBeenCalled()
})
test('un refus concurrent conserve le lot, relit le suivi et invalide la confirmation', async () => {
  const b = await monter(lot())
  b.api.reprendreImportCorrespondances.mockRejectedValue(new Error('Une source du plan a changé ; aucun écrasement autorisé.'))
  confirmer(); await rendu(); bouton('Reprendre l’import WebDAV').click(); await rendu()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('aucun écrasement autorisé')
  expect(b.api.suiviImportCorrespondances).toHaveBeenCalledTimes(2)
  expect(bouton('Reprendre l’import WebDAV').disabled).toBe(true)
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  expect(b.importe).not.toHaveBeenCalled()
})
test('suivi indisponible : aucun nouvel import, une relecture réussie rétablit le formulaire', async () => {
  const b = await monter(null, true, async () => { throw new Error('panne') })
  expect(document.querySelector('input[type="file"]')).toBeNull()
  expect(document.body.textContent).toContain('aucune application n’est autorisée')
  b.api.suiviImportCorrespondances.mockResolvedValue(null)
  bouton('Relire le suivi WebDAV').click(); await rendu()
  expect(document.querySelector('input[type="file"]')).not.toBeNull()
  expect(b.api.importerCorrespondances).not.toHaveBeenCalled()
})
test('la lecture seule interdit la reprise, même si le suivi est connu', async () => {
  const b = await monter(lot(), false)
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true)
  bouton('Reprendre l’import WebDAV').click(); await rendu()
  expect(b.api.reprendreImportCorrespondances).not.toHaveBeenCalled()
})
test('une réponse après destruction du dialogue ne déclenche aucune importation annoncée', async () => {
  const b = await monter(lot())
  let terminer!: (v: unknown) => void
  b.api.reprendreImportCorrespondances.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  confirmer(); await rendu(); bouton('Reprendre l’import WebDAV').click(); await rendu()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  terminer(lot().bilanPrevu); await rendu()
  expect(b.importe).not.toHaveBeenCalled()
  expect(b.activite.mock.calls.at(-1)).toEqual([false])
})
