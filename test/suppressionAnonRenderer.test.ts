// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import SuppressionRegleAnon from '../src/renderer/components/traiter/corpus/SuppressionRegleAnon.vue'
import { inventorierSuppressionAnon, type ApercuSuppressionAnon, type SuiviSuppressionAnon } from '../src/shared/corpus/suppressionAnon'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'

const apps: App[] = []
afterEach(() => { for (const a of apps.splice(0)) a.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })
async function rendu() { await nextTick(); await Promise.resolve(); await nextTick() }
function bouton(texte: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)! }
async function monter(configurer?: (api: { apercuSuppressionAnon: ReturnType<typeof vi.fn> }, apercu: ApercuSuppressionAnon) => void, distant: boolean | 'webdav' = false) {
  const f = fixtureDissociationAnon(), apercu: ApercuSuppressionAnon = { ...inventorierSuppressionAnon(f.corpus, f.sources, f.demande), token: 'prive', lecture: 'local', applicationDisponible: true }
  if (distant) apercu.lecture = distant === 'webdav' ? 'webdav' : 'gitlab'
  const suivi: SuiviSuppressionAnon = { ...apercu.bilan, annotations: 4, entretiens: 1, regleRetiree: false, miroirIncomplet: false,
    operationId: 'suppression-anon-privee', statut: 'partiel', demande: f.demande, differes: [{ id: 'e2', motif: 'Cible tenue.' }], nouvellesCibles: [] }
  const api = { apercuSuppressionAnon: vi.fn(async () => structuredClone(apercu)), supprimerRegleAnonPartout: vi.fn(async () => structuredClone(apercu.bilan)),
    apercuRepriseSuppressionAnon: vi.fn(async () => structuredClone(apercu)), suiviSuppressionAnon: vi.fn(async () => structuredClone(suivi)),
    relireSuiviSuppressionAnon: vi.fn(async () => structuredClone(suivi)) }
  configurer?.(api, apercu)
  Object.defineProperty(window, 'sonal', { value: { corpus: api }, configurable: true })
  const regle = ref(f.corpus.reglesAnon.personne), disponible = ref(true), contexte = ref(1)
  const termine = vi.fn(), fermer = vi.fn(), activite = vi.fn(), partiel = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(SuppressionRegleAnon, { regle: regle.value, disponible: disponible.value, contexte: contexte.value, fournisseur: distant === 'webdav' ? 'webdav' : distant ? 'gitlab' : null, onPartiel: partiel, onTermine: termine, onFermer: fermer, onActivite: activite }) })
  apps.push(app); app.mount(host); await rendu()
  return { f, apercu, api, app, regle, disponible, contexte, termine, fermer, activite, suivi, partiel }
}
async function preparer() { bouton('Préparer la suppression globale')?.click(); await rendu() }
async function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await rendu() }

test('bilan explicite, confirmation requise et aucune autorité de suppression avant accord', async () => {
  const b = await monter(); await preparer()
  expect(document.body.textContent).toContain('8 passage(s) concerné(s) dans 2 entretien(s)')
  expect(document.body.textContent).toContain('Les autres règles, vos choix indépendants')
  expect(b.api.apercuSuppressionAnon).toHaveBeenCalledExactlyOnceWith({ regleId: 'personne' })
  expect(document.body.textContent).not.toContain('Préparer')
  expect(document.body.textContent).not.toContain('Protocole')
  expect(bouton('Confirmer la suppression globale').disabled).toBe(true)
  await confirmer(); bouton('Confirmer la suppression globale').click(); await rendu()
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledExactlyOnceWith('prive', true)
  expect(b.termine).toHaveBeenCalledExactlyOnceWith(b.apercu.bilan)
})
test('annulation ne retire rien et focus rendu au déclencheur', async () => {
  const avant = document.createElement('button'); document.body.append(avant); avant.focus()
  const b = await monter(); await preparer(); bouton('Annuler').click(); await rendu()
  expect(b.fermer).toHaveBeenCalledTimes(1); expect(b.api.supprimerRegleAnonPartout).not.toHaveBeenCalled()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1); await rendu(); expect(document.activeElement).toBe(avant)
})
test.each(['capacite', 'contexte', 'regle'] as const)('changement de %s invalide aperçu et confirmation', async (cas) => {
  const b = await monter(); await preparer(); await confirmer()
  if (cas === 'capacite') b.disponible.value = false
  if (cas === 'contexte') b.contexte.value++
  if (cas === 'regle') b.regle.value = { ...b.regle.value, id: 'autre' }
  await rendu(); expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(b.api.supprimerRegleAnonPartout).not.toHaveBeenCalled()
})
test('obstacle ou session ouverte désactive la confirmation', async () => {
  await monter((api, apercu) => { api.apercuSuppressionAnon.mockResolvedValueOnce({ ...apercu, applicationDisponible: false }) })
  await preparer(); expect(bouton('Confirmer la suppression globale').disabled).toBe(true)
  expect(document.body.textContent).toContain('fermez et rouvrez cette fenêtre')
})
test('envoi unique, navigation et tirage automatique bloqués jusqu’au résultat', async () => {
  const b = await monter(); await preparer(); await confirmer()
  let terminer!: (r: typeof b.apercu.bilan) => void
  b.api.supprimerRegleAnonPartout.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  bouton('Confirmer la suppression globale').click(); await rendu()
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  bouton('Annuler').click()
  document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(b.fermer).not.toHaveBeenCalled(); expect(b.activite).toHaveBeenLastCalledWith(true)
  terminer(b.apercu.bilan); await rendu()
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledTimes(1); expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('réponse tardive ignorée après changement de contexte sans déverrouillage prématuré', async () => {
  const b = await monter(); await preparer(); await confirmer()
  let terminer!: (r: typeof b.apercu.bilan) => void
  b.api.supprimerRegleAnonPartout.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  bouton('Confirmer la suppression globale').click(); await rendu(); b.contexte.value++; await rendu()
  expect(b.activite).toHaveBeenLastCalledWith(true)
  terminer(b.apercu.bilan); await rendu(); expect(b.termine).not.toHaveBeenCalled()
  expect(b.activite).toHaveBeenLastCalledWith(false)
})
test('erreur nettoyée, aucune nouvelle préparation ni rejeu depuis ce dialogue', async () => {
  const b = await monter(); await preparer(); await confirmer()
  b.api.supprimerRegleAnonPartout.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:supprimerRegleAnonPartout': Error: Interruption."))
  bouton('Confirmer la suppression globale').click(); await rendu()
  expect(document.body.textContent).toContain('rouvrez le corpus pour vérifier ce qui a été enregistré')
  expect(document.body.textContent).not.toContain('Error invoking')
  expect(bouton('Actualiser le bilan').disabled).toBe(true)
  expect(b.termine).not.toHaveBeenCalled()
})
test('piège de focus ignore les détails repliés', async () => {
  await monter(); const premier = bouton('Annuler'), dernier = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  dernier.focus(); dernier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(premier)
  premier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(dernier)
})

test('calcul automatique en attente : pas de confirmation ni d’écriture, réponse après démontage ignorée', async () => {
  let terminer!: (apercu: ApercuSuppressionAnon) => void
  const b = await monter((api) => { api.apercuSuppressionAnon.mockImplementation(() => new Promise((r) => { terminer = r })) })
  expect(b.api.apercuSuppressionAnon).toHaveBeenCalledTimes(1)
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  terminer(b.apercu); await rendu()
  expect(b.api.supprimerRegleAnonPartout).not.toHaveBeenCalled()
  expect(b.termine).not.toHaveBeenCalled()
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('échec du calcul : action simple pour réessayer, diagnostic replié', async () => {
  const b = await monter((api) => { api.apercuSuppressionAnon.mockRejectedValueOnce(new Error('Erreur technique synthétique')) })
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('Impossible de calculer le bilan')
  const assistance = [...document.querySelectorAll('details')].find((d) => d.querySelector('summary')!.textContent === 'Informations pour l’assistance')!
  expect(assistance.open).toBe(false)
  expect(assistance.textContent).toContain('Erreur technique synthétique')
  expect(document.querySelector('[role="alert"]')!.textContent).not.toContain('Erreur technique')
  bouton('Actualiser le bilan').click(); await rendu()
  expect(b.api.apercuSuppressionAnon).toHaveBeenCalledTimes(2)
  expect(b.api.supprimerRegleAnonPartout).not.toHaveBeenCalled()
})


test.each(['GitLab', 'WebDAV'])('%s : pas de préparation automatique ; bilan et accord explicites', async (provider) => {
  const b = await monter(undefined, provider === 'WebDAV' ? 'webdav' : true)
  expect(b.api.apercuSuppressionAnon).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain(`Sur ${provider}, les entretiens sont mis à jour l’un après l’autre`)
  await preparer(); expect(bouton('Confirmer la suppression globale').disabled).toBe(true)
  await confirmer(); b.api.supprimerRegleAnonPartout.mockResolvedValueOnce(b.suivi)
  bouton('Confirmer la suppression globale').click(); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(b.partiel).toHaveBeenCalledOnce()
  expect(document.body.textContent).toContain('4 choix retiré(s) dans 1 entretien(s)')
  bouton('Recalculer la reprise').click(); await rendu()
  expect(b.api.apercuRepriseSuppressionAnon).toHaveBeenCalledExactlyOnceWith(b.suivi.operationId)
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
})
test.each(['GitLab', 'WebDAV'])('%s : issue inconnue bloque la reprise jusqu’à relecture', async (provider) => {
  const b = await monter(undefined, provider === 'WebDAV' ? 'webdav' : true); await preparer(); await confirmer()
  b.api.supprimerRegleAnonPartout.mockResolvedValueOnce({ ...b.suivi, statut: 'indetermine' })
  bouton('Confirmer la suppression globale').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  bouton('Recalculer la reprise').click(); expect(b.api.apercuRepriseSuppressionAnon).not.toHaveBeenCalled()
  bouton(`Relire le suivi ${provider}`).click(); await rendu()
  expect(b.api.relireSuiviSuppressionAnon).toHaveBeenCalledExactlyOnceWith(b.suivi.operationId)
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledTimes(1)
})
test.each(['GitLab', 'WebDAV'])('%s : erreur et suivi indisponible, aucune seconde suppression', async (provider) => {
  const b = await monter(undefined, provider === 'WebDAV' ? 'webdav' : true); await preparer(); await confirmer()
  b.api.supprimerRegleAnonPartout.mockRejectedValueOnce(new Error('Transport inconnu'))
  bouton('Confirmer la suppression globale').click(); await rendu()
  b.api.relireSuiviSuppressionAnon.mockRejectedValueOnce(new Error('Indisponible'))
  bouton(`Relire le suivi ${provider}`).click(); await rendu()
  expect(bouton('Préparer la suppression globale').disabled).toBe(true)
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('L’avancement ne peut pas être vérifié')
  bouton(`Relire le suivi ${provider}`).click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledTimes(1)
})
test.each([false, true])('GitLab : miroir incomplet, retrait logique %s, relecture seule', async (regleRetiree) => {
  const b = await monter(undefined, true); await preparer(); await confirmer()
  b.api.supprimerRegleAnonPartout.mockResolvedValueOnce({ ...b.suivi, regleRetiree, miroirIncomplet: true })
  bouton('Confirmer la suppression globale').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  expect(b.termine).not.toHaveBeenCalled()
  const fini = { ...b.suivi, ...b.apercu.bilan, miroirIncomplet: false, statut: 'termine' as const }
  b.api.relireSuiviSuppressionAnon.mockResolvedValueOnce(fini)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith(fini)
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledTimes(1)
})
test('GitLab : relecture tardive ignorée, sans libération d’activité prématurée', async () => {
  const b = await monter(undefined, true); let resoudre!: (v: SuiviSuppressionAnon) => void
  b.api.relireSuiviSuppressionAnon.mockImplementationOnce(() => new Promise((r) => { resoudre = r }))
  bouton('Relire le suivi GitLab').click(); await rendu(); b.contexte.value++; await rendu()
  expect(bouton('Annuler').disabled).toBe(true); expect(tirageAutomatiqueSuspendu.value).toBe(true)
  resoudre({ ...b.suivi, statut: 'termine' }); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(b.partiel).not.toHaveBeenCalled()
  expect(bouton('Annuler').disabled).toBe(false); expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('GitLab : aucun suivi après refus initial, réouverture expliquée sans nouvelle suppression', async () => {
  const b = await monter(undefined, true); await preparer(); await confirmer()
  b.api.supprimerRegleAnonPartout.mockRejectedValueOnce(new Error('Corpus occupé'))
  bouton('Confirmer la suppression globale').click(); await rendu()
  b.api.suiviSuppressionAnon.mockResolvedValueOnce(null)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('Aucun suivi n’a été trouvé')
  expect(document.body.textContent).toContain('rouvrez le corpus')
  expect(bouton('Préparer la suppression globale').disabled).toBe(true)
  expect(b.api.supprimerRegleAnonPartout).toHaveBeenCalledTimes(1)
})
test('GitLab : limite du publieur expliquée, détail technique replié', async () => {
  const b = await monter((api, a) => { api.apercuSuppressionAnon.mockResolvedValueOnce({ ...a, applicationDisponible: false, motifIndisponible: 'La finalisation gardée est limitée à 248 entretiens modifiés par lot.' }) }, true)
  await preparer()
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('plus de 248 entretiens')
  expect(document.querySelector('[role="alert"]')!.textContent).not.toContain('gardée')
  expect(bouton('Confirmer la suppression globale').disabled).toBe(true)
})
