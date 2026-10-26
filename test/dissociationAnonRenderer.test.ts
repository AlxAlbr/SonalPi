// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import DissociationRegleAnon from '../src/renderer/components/traiter/corpus/DissociationRegleAnon.vue'
import { inventorierDissociationAnon, type ApercuDissociationAnon, type SuiviDissociationAnon } from '../src/shared/corpus/dissociationAnon'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
async function rendu() { for (let n = 0; n < 12; n++) { await Promise.resolve(); await nextTick() } }
function bouton(texte: string) {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error(`Bouton absent : ${texte}`)
  return b
}
async function monter(fournisseurInitial?: string, suiviInitial?: SuiviDissociationAnon, configurer?: (api: { apercuDissociationAnon: ReturnType<typeof vi.fn> }, apercu: ApercuDissociationAnon) => void) {
  const f = fixtureDissociationAnon(), regle = ref(f.corpus.reglesAnon.personne), disponible = ref(true)
  const apercu: ApercuDissociationAnon = { ...inventorierDissociationAnon(f.corpus, f.sources, f.demande), token: 'prive', lecture: 'local', applicationDisponible: true }
  if (fournisseurInitial === 'gitlab' || fournisseurInitial === 'webdav') apercu.lecture = fournisseurInitial
  const fournisseur = ref(fournisseurInitial)
  const suivi: SuiviDissociationAnon = { ...apercu.bilan, annotations: 4, entretiens: 1, definitionsLocales: 1,
    operationId: 'dissociation-privee', statut: 'partiel', regleRetiree: false, differes: [{ id: 'e2', motif: 'Cible tenue.' }], nouvellesCibles: [], demande: { regleId: 'personne' } }
  const api = { apercuDissociationAnon: vi.fn(async () => structuredClone(apercu)), dissocierRegleAnon: vi.fn(async () => apercu.bilan),
    apercuRepriseDissociationAnon: vi.fn(async (_id: string) => ({ ...structuredClone(apercu), reprise: suivi.operationId })),
    suiviDissociationAnon: vi.fn(async (): Promise<SuiviDissociationAnon | null> => structuredClone(suivi)),
    relireSuiviDissociationAnon: vi.fn(async (_id: string) => structuredClone(suivi)) }
  configurer?.(api, apercu)
  vi.stubGlobal('sonal', { corpus: api })
  const termine = vi.fn(), partiel = vi.fn(), fermer = vi.fn(), activite = vi.fn(), container = document.createElement('div'); document.body.append(container)
  const app = createApp({ render: () => h(DissociationRegleAnon, { regle: regle.value, disponible: disponible.value, fournisseur: fournisseur.value, suivi: suiviInitial, onTermine: termine, onPartiel: partiel, onFermer: fermer, onActivite: activite }) })
  apps.push(app); app.mount(container); await rendu()
  return { f, app, api, apercu, regle, disponible, fournisseur, suivi, termine, partiel, fermer, activite }
}
async function preparer() {
  const b = [...document.querySelectorAll('button')].find((b) => ['Préparer la dissociation globale', 'Actualiser le bilan'].includes(b.textContent!.trim()))
  b?.click(); await rendu()
}
async function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await rendu() }

test('bilan attribué, mémoire entière, consentement et double envoi bloqué', async () => {
  const b = await monter(); await preparer()
  expect(b.api.apercuDissociationAnon).toHaveBeenCalledExactlyOnceWith({ regleId: 'personne' })
  expect(document.body.textContent).toContain('8 passage(s) concerné(s) dans 2 entretien(s)')
  expect(document.body.textContent).toContain('Claire / Rebecca ; catégorie PER')
  expect(document.body.textContent).not.toContain('Préparer')
  expect(document.body.textContent).not.toContain('Protocole')
  expect(bouton('Confirmer la dissociation globale').disabled).toBe(true)
  await confirmer()
  let resoudre!: (v: typeof b.apercu.bilan) => void
  b.api.dissocierRegleAnon.mockImplementation(() => new Promise((r) => { resoudre = r }))
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  bouton('Annuler').click(); expect(b.fermer).not.toHaveBeenCalled()
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledExactlyOnceWith('prive', true)
  resoudre(b.apercu.bilan); await rendu(); expect(b.termine).toHaveBeenCalledExactlyOnceWith(b.apercu.bilan)
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('annuler ne publie jamais ; le focus revient au déclencheur', async () => {
  const avant = document.createElement('button'); document.body.append(avant); avant.focus()
  const b = await monter(); await preparer(); bouton('Annuler').click()
  expect(b.fermer).toHaveBeenCalledTimes(1); expect(b.api.dissocierRegleAnon).not.toHaveBeenCalled()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1); await rendu(); expect(document.activeElement).toBe(avant)
})
test.each(['collision', 'session', 'budget'] as const)('obstacle ou session empêche tout consentement exécutable : %s', async (cas) => {
  const b = await monter(undefined, undefined, (_api, apercu) => {
    if (cas === 'collision') { apercu.faisable = false; apercu.obstacles.push({ code: 'decision-locale-recouvrante', entretienId: 'e1', annotationId: 'a3' }) }
    else {
      apercu.applicationDisponible = false
      if (cas === 'budget') apercu.motifIndisponible = 'La finalisation gardée est limitée à 248 entretiens transférés par lot.'
    }
  })
  await preparer()
  if (cas === 'budget') expect(document.body.textContent).toContain(b.apercu.motifIndisponible)
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true)
  expect(bouton('Confirmer la dissociation globale').disabled).toBe(true)
  bouton('Confirmer la dissociation globale').click(); expect(b.api.dissocierRegleAnon).not.toHaveBeenCalled()
})
test('perte de capacité et changement de règle invalident aperçu et accord', async () => {
  const b = await monter(); await preparer(); await confirmer()
  b.disponible.value = false; await rendu()
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  bouton('Actualiser le bilan').click(); expect(b.api.apercuDissociationAnon).toHaveBeenCalledTimes(1)
  b.disponible.value = true; await rendu(); await preparer(); await confirmer()
  b.regle.value = b.f.corpus.reglesAnon.autre; await rendu()
  expect(document.querySelector('input[type="checkbox"]')).toBeNull(); expect(b.api.dissocierRegleAnon).not.toHaveBeenCalled()
})
test('réponse tardive après changement de contexte rejetée sans déverrouiller un envoi en cours', async () => {
  let resoudre!: (a: ApercuDissociationAnon) => void
  const b = await monter(undefined, undefined, (api) => {
    api.apercuDissociationAnon.mockImplementation(() => new Promise((r) => { resoudre = r }))
  })
  b.disponible.value = false; await rendu(); expect(bouton('Annuler').disabled).toBe(true)
  resoudre(b.apercu); await rendu()
  expect(document.querySelector('input[type="checkbox"]')).toBeNull(); expect(bouton('Annuler').disabled).toBe(false)
})
test('erreur d’inventaire nettoyée et erreur d’exécution sans rejeu ni faux succès', async () => {
  const b = await monter(undefined, undefined, (api) => {
    api.apercuDissociationAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:apercuDissociationAnon': Error: Source indisponible."))
  })
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('Impossible de calculer le bilan')
  expect(document.querySelector('[role="alert"]')!.textContent).not.toContain('Source indisponible')
  bouton('Actualiser le bilan').click(); await rendu(); await confirmer()
  b.api.dissocierRegleAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:dissocierRegleAnon': Error: Interruption."))
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('rouvrez le corpus')
  expect(document.querySelector('[role="alert"]')!.textContent).not.toContain('Error invoking')
  expect(bouton('Actualiser le bilan').disabled).toBe(true)
  expect(b.termine).not.toHaveBeenCalled()
})
test('lot GitLab partiel : bilan acquis, pas de succès complet, reprise fraîche sans accord implicite', async () => {
  const b = await monter('gitlab'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockResolvedValueOnce(b.suivi)
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(b.partiel).toHaveBeenCalledOnce()
  expect(document.body.textContent).toContain('4 passage(s) mis à jour dans 1 entretien(s)')
  expect(document.body.textContent).toContain('Cible tenue.')
  bouton('Recalculer la reprise').click(); await rendu()
  expect(b.api.apercuRepriseDissociationAnon).toHaveBeenCalledExactlyOnceWith('dissociation-privee')
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  expect(bouton('Confirmer la dissociation globale').disabled).toBe(true)
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledTimes(1)
})
test('issue GitLab inconnue : nouveau transfert interdit jusqu’à reconnaissance du suivi', async () => {
  const b = await monter('gitlab'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockResolvedValueOnce({ ...b.suivi, statut: 'indetermine' })
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  bouton('Recalculer la reprise').click(); expect(b.api.apercuRepriseDissociationAnon).not.toHaveBeenCalled()
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.api.relireSuiviDissociationAnon).toHaveBeenCalledExactlyOnceWith('dissociation-privee')
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.termine).not.toHaveBeenCalled()
})
test('suivi GitLab inaccessible : aucun rejeu ni recalcul jusqu’à relecture réussie', async () => {
  const b = await monter('gitlab'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockRejectedValueOnce(new Error('Transport indéterminé'))
  bouton('Confirmer la dissociation globale').click(); await rendu()
  b.api.relireSuiviDissociationAnon.mockRejectedValueOnce(new Error('Indisponible'))
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(document.body.textContent).toContain('L’avancement ne peut pas être vérifié pour le moment')
  expect(bouton('Préparer la dissociation globale').disabled).toBe(true)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledTimes(1)
})
test('retrait final GitLab reconnu : succès attribué sans réappliquer le transfert', async () => {
  const b = await monter('gitlab'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockResolvedValueOnce({ ...b.suivi, statut: 'indetermine' })
  bouton('Confirmer la dissociation globale').click(); await rendu()
  const fini = { ...b.suivi, ...b.apercu.bilan, statut: 'termine' as const }
  b.api.relireSuiviDissociationAnon.mockResolvedValueOnce(fini)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith(fini)
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledTimes(1)
})
test('relecture tardive après perte du contexte : aucun succès, activité conservée jusqu’à réponse', async () => {
  const b = await monter('gitlab'); let resoudre!: (v: SuiviDissociationAnon) => void
  b.api.relireSuiviDissociationAnon.mockImplementationOnce(() => new Promise((r) => { resoudre = r }))
  bouton('Relire le suivi GitLab').click(); await rendu()
  b.disponible.value = false; await rendu()
  expect(bouton('Annuler').disabled).toBe(true)
  resoudre({ ...b.suivi, statut: 'termine' }); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(b.partiel).not.toHaveBeenCalled()
  expect(bouton('Annuler').disabled).toBe(false)
})

test('WebDAV : protocole propre, bilan partiel et nouveau consentement sans faux succès', async () => {
  const b = await monter('webdav'); await preparer(); await confirmer()
  expect(document.body.textContent).toContain('Sur WebDAV, les entretiens sont mis à jour l’un après l’autre')
  expect(document.body.textContent).not.toContain('verrou corpus')
  b.api.dissocierRegleAnon.mockResolvedValueOnce(b.suivi)
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(document.body.textContent).toContain('Lot WebDAV de dissociation à reprendre')
  expect(document.body.textContent).not.toContain('Protocole local')
  expect(b.termine).not.toHaveBeenCalled()
  bouton('Recalculer la reprise').click(); await rendu()
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  expect(bouton('Confirmer la dissociation globale').disabled).toBe(true)
})
test('WebDAV : issue inconnue et relecture indisponible interdisent tout nouvel envoi', async () => {
  const b = await monter('webdav'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockResolvedValueOnce({ ...b.suivi, statut: 'indetermine' })
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  b.api.relireSuiviDissociationAnon.mockRejectedValueOnce(new Error('Indisponible'))
  bouton('Relire le suivi WebDAV').click(); await rendu()
  expect(document.body.textContent).toContain('L’avancement ne peut pas être vérifié pour le moment')
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  bouton('Relire le suivi WebDAV').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledTimes(1)
})
test('WebDAV : retrait acquis mais miroir incomplet reste partiel ; relecture seule termine', async () => {
  const b = await monter('webdav'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockResolvedValueOnce({ ...b.suivi, regleRetiree: true })
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(b.termine).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('La règle a été retirée ; il reste à actualiser votre copie du corpus.')
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  expect(b.api.apercuRepriseDissociationAnon).not.toHaveBeenCalled()
  const fini = { ...b.suivi, ...b.apercu.bilan, statut: 'termine' as const }
  b.api.relireSuiviDissociationAnon.mockResolvedValueOnce(fini)
  bouton('Relire le suivi WebDAV').click(); await rendu()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith(fini)
  expect(b.api.dissocierRegleAnon).toHaveBeenCalledTimes(1)
})
test('WebDAV : erreur d’envoi nettoyée, aucun rejeu et indication du suivi du bon fournisseur', async () => {
  const b = await monter('webdav'); await preparer(); await confirmer()
  b.api.dissocierRegleAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:dissocierRegleAnon': Error: Transport inconnu."))
  bouton('Confirmer la dissociation globale').click(); await rendu()
  expect(document.body.textContent).toContain('Relire le suivi WebDAV')
  expect(document.body.textContent).not.toContain('Error invoking')
  expect(bouton('Préparer la dissociation globale').disabled).toBe(true)
  expect(b.termine).not.toHaveBeenCalled()
})

test('piège de focus et dialogue accessible', async () => {
  await monter(); const premier = bouton('Annuler'), dernier = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  dernier.focus(); dernier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(premier)
  premier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(dernier)
  expect(document.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true')
})

test('calcul automatique local en attente : aucun accord implicite, démontage rejette la réponse', async () => {
  let resoudre!: (a: ApercuDissociationAnon) => void
  const b = await monter(undefined, undefined, (api) => {
    api.apercuDissociationAnon.mockImplementation(() => new Promise((r) => { resoudre = r }))
  })
  expect(b.api.apercuDissociationAnon).toHaveBeenCalledTimes(1)
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  resoudre(b.apercu); await rendu()
  expect(b.api.dissocierRegleAnon).not.toHaveBeenCalled()
  expect(b.termine).not.toHaveBeenCalled()
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('détails facultatifs, vocabulaire courant et aucun calcul distant automatique', async () => {
  const local = await monter()
  const passages = [...document.querySelectorAll('details')].find((d) => d.querySelector('summary')!.textContent === 'Voir les passages concernés')!
  expect(passages.open).toBe(false)
  expect(document.body.textContent).not.toContain('PUT')
  expect(document.body.textContent).not.toContain('barrière')
  local.app.unmount(); apps.splice(apps.indexOf(local.app), 1); document.body.replaceChildren()
  const distant = await monter('webdav')
  expect(distant.api.apercuDissociationAnon).not.toHaveBeenCalled()
  expect(distant.api.dissocierRegleAnon).not.toHaveBeenCalled()
})
