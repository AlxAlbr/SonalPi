// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import SuiviCorrectionsLocuteursCorpus from '../src/renderer/components/traiter/corpus/SuiviCorrectionsLocuteursCorpus.vue'
import { useCorpus } from '../src/renderer/composables/useCorpus'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'
import type { SuiviCorrectionLocuteurs } from '../src/shared/corpus/suiviCorrectionsLocuteurs'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); expect(tirageAutomatiqueSuspendu.value).toBe(false) })
async function attendre() { for (let i = 0; i < 10; i++) await nextTick() }
function bouton(host: HTMLElement, texte: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error(`Bouton absent : ${texte}`)
  return b
}
async function banc(etat: SuiviCorrectionLocuteurs['etat'] = 'a-verifier') {
  let suivi: SuiviCorrectionLocuteurs | null = { operationId: 'operation', action: 'Renommage des locuteurs', etat, termines: 1, total: 3 }
  const api = {
    suiviCorrectionLocuteurs: vi.fn(async () => structuredClone(suivi)),
    verifierCorrectionLocuteurs: vi.fn(async () => { suivi = { ...suivi!, etat: 'a-reprendre' }; return null }),
    reprendreCorrectionLocuteurs: vi.fn(async () => { suivi = null; return 'a' }),
    arreterCorrectionLocuteurs: vi.fn(async () => { suivi = null; return null }),
  }
  vi.stubGlobal('window', { sonal: { corpus: api } })
  const revision = ref(1), dossier = ref('/corpus'), actif = ref(true), possible = ref(true), termine = vi.fn()
  const corpus = useCorpus({ flush: async () => {}, revision: () => revision.value })
  injection.contexte = { ...corpus, dossierCourantDir: dossier, idDistantCourant: ref('nextcloud'), repriseCorrectionLocuteursPossible: () => possible.value }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(SuiviCorrectionsLocuteursCorpus, { actif: actif.value, onActualiser: termine }) })
  apps.push(app); app.mount(host); await attendre()
  return { host, api, corpus, revision, dossier, actif, possible, termine, setSuivi: (s: SuiviCorrectionLocuteurs | null) => { suivi = s } }
}

test('vérifier puis reprendre sont deux actions distinctes ; aucune répétition automatique', async () => {
  const b = await banc()
  expect(b.host.textContent).toContain('1 étape(s) confirmée(s) sur 3')
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  expect(b.api.reprendreCorrectionLocuteurs).not.toHaveBeenCalled()
  expect(b.host.textContent).not.toContain('Arrêter cette correction')
  bouton(b.host, 'Vérifier le résultat').click(); await attendre()
  expect(b.api.verifierCorrectionLocuteurs).toHaveBeenCalledExactlyOnceWith('operation')
  expect(b.api.reprendreCorrectionLocuteurs).not.toHaveBeenCalled()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith(false)
  bouton(b.host, 'Reprendre la correction').click(); await attendre()
  expect(b.api.reprendreCorrectionLocuteurs).toHaveBeenCalledExactlyOnceWith('operation')
  expect(b.host.textContent).toContain('La correction est terminée')
  expect(b.termine).toHaveBeenLastCalledWith(true)
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})

test('le bilan d’une correction terminée ne présente pas la suivante comme réussie', async () => {
  const b = await banc('a-reprendre')
  bouton(b.host, 'Reprendre la correction').click(); await attendre()
  expect(b.host.textContent).toContain('La correction est terminée')
  b.setSuivi({ operationId: 'nouvelle', action: 'Renommage', etat: 'a-reprendre', termines: 1, total: 3 })
  b.corpus.revisionSuiviLocuteurs.value++; await attendre()
  expect(b.host.textContent).not.toContain('La correction est terminée')
  expect(b.host.textContent).toContain('1 étape(s) confirmée(s) sur 3')
})

test('enregistrement en cours : un seul appel et boutons désactivés', async () => {
  const b = await banc('a-reprendre'); let finir!: () => void
  b.api.reprendreCorrectionLocuteurs.mockImplementationOnce(() => new Promise<string>((r) => { finir = () => { b.setSuivi(null); r('a') } }))
  const reprendre = bouton(b.host, 'Reprendre la correction'); reprendre.click(); reprendre.click(); await attendre()
  expect(b.api.reprendreCorrectionLocuteurs).toHaveBeenCalledOnce()
  expect(reprendre.disabled).toBe(true)
  finir(); await attendre()
  expect(b.host.textContent).toContain('La correction est terminée')
})

test('un suivi illisible reste bloquant et ne devient pas un faux succès', async () => {
  const b = await banc()
  b.api.suiviCorrectionLocuteurs.mockRejectedValueOnce(new Error('Suivi incompatible'))
  bouton(b.host, 'Actualiser le suivi').click(); await attendre()
  expect(b.corpus.erreurSuiviLocuteurs.value).toBe('Suivi incompatible')
  expect(b.corpus.suiviLocuteurs.value?.operationId).toBe('operation')
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('Suivi incompatible')
  expect(b.api.reprendreCorrectionLocuteurs).not.toHaveBeenCalled()
})

test('la réponse d’une ancienne destination ne modifie pas le suivi de la nouvelle', async () => {
  const b = await banc(); let finir!: () => void
  b.api.verifierCorrectionLocuteurs.mockImplementationOnce(() => new Promise<null>((r) => { finir = () => r(null) }))
  bouton(b.host, 'Vérifier le résultat').click(); await attendre()
  b.revision.value++; b.dossier.value = '/autre'; b.setSuivi(null); await attendre()
  finir(); await attendre()
  expect(b.corpus.suiviLocuteurs.value).toBeNull()
  expect(b.corpus.revisionLocuteursCorpus.value).toBe(0)
  expect(b.termine).not.toHaveBeenCalled()
})

test('arrêter conserve les succès, demande confirmation et ne prétend pas rétablir les anciens noms', async () => {
  const b = await banc('a-reprendre')
  bouton(b.host, 'Arrêter cette correction…').click(); await attendre()
  expect(b.host.querySelector('dialog')?.textContent).toContain('ne rétablit pas les anciens noms')
  expect(document.activeElement).toBe(bouton(b.host, 'Annuler'))
  bouton(b.host, 'Annuler').click(); await attendre()
  expect(b.api.arreterCorrectionLocuteurs).not.toHaveBeenCalled()
  bouton(b.host, 'Arrêter cette correction…').click(); await attendre()
  bouton(b.host, 'Conserver les étapes enregistrées et arrêter').click(); await attendre()
  expect(b.api.arreterCorrectionLocuteurs).toHaveBeenCalledExactlyOnceWith('operation')
  expect(b.api.reprendreCorrectionLocuteurs).not.toHaveBeenCalled()
  expect(b.host.textContent).toContain('La correction est arrêtée')
})

test('mode consultation : le suivi reste lisible sans possibilité de reprise', async () => {
  const b = await banc('a-reprendre')
  b.possible.value = false; await attendre()
  expect(bouton(b.host, 'Reprendre la correction').disabled).toBe(true)
  bouton(b.host, 'Reprendre la correction').click(); await attendre()
  expect(b.api.reprendreCorrectionLocuteurs).not.toHaveBeenCalled()
})
