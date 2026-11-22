// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import MigrationCorpus from '../src/renderer/components/accueil/MigrationCorpus.vue'
import type { DemandeVerificationMigration, VerificationMigrationV1 } from '../src/shared/migrationV1'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
async function attendre() { for (let i = 0; i < 6; i++) await nextTick() }
function bilan(etat: 'ok' | 'manquant' = 'ok'): VerificationMigrationV1 {
  return { empreinteCrp: 'empreinte-source',
    transcriptions: [{ index: 0, titre: 'Entretien A', reference: 'ancien.Sonal', chemin: '/V1/ancien.Sonal', etat }],
    medias: [{ index: 0, titre: 'Entretien A', reference: 'C:\\ancien\\voix.mp3', chemin: 'C:\\ancien\\voix.mp3', etat: 'manquant' }],
  }
}
async function monter(verifier = vi.fn(async (_req: DemandeVerificationMigration) => bilan())) {
  const migrerDepuisV1 = vi.fn(async () => true), fermer = vi.fn()
  injection.contexte = { migrerDepuisV1, etatMigration: ref('repos'), annulerMigration: vi.fn(), annulationMigrationDemandee: ref(false) }
  const api = { verifier, choisirTranscription: vi.fn<() => Promise<string | null>>(async () => '/retrouve/A.sonal'),
    destination: vi.fn(async () => '/V2'), choisirEmplacement: vi.fn(async () => '/autre') }
  vi.stubGlobal('sonal', { migrer: api })
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(MigrationCorpus, { initial: { chemin: '/V1/Enquete.crp' }, onFermer: fermer })
  apps.push(app)
  app.mount(host)
  await attendre()
  return { api, app, fermer, migrerDepuisV1 }
}
const valider = () => document.querySelector<HTMLButtonElement>('.modale-migration .valider')!
const localiser = () => document.querySelector<HTMLButtonElement>('[aria-label="Localiser le fichier de Entretien A"]')!
const reverifier = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Vérifier à nouveau les fichiers')!
const soumettre = () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

test('un média absent reste un avertissement ; une vérification fraîche précède la conversion', async () => {
  const b = await monter()
  expect(valider().disabled).toBe(false)
  expect(document.querySelector('.verification-fichiers')?.textContent).toContain('1 enregistrement à reconnecter')
  expect(document.querySelector('[role=alert]')).toBeNull()
  expect(document.querySelector('.liste-fichiers')?.parentElement?.hasAttribute('open')).toBe(false)
  soumettre(); await attendre()
  expect(b.api.verifier).toHaveBeenCalledTimes(2)
  expect(b.migrerDepuisV1).toHaveBeenCalledWith({ cheminCrp: '/V1/Enquete.crp', nom: 'Enquete', dossier: '/V2',
    empreinteCrp: 'empreinte-source', transcriptions: [] })
  expect(b.fermer).toHaveBeenCalledOnce()
})

test('localiser une transcription débloque la migration et transmet le choix sans modifier la référence V1', async () => {
  const verifier = vi.fn(async (req: DemandeVerificationMigration) => {
    const resultat = bilan(req.transcriptions?.length ? 'ok' : 'manquant')
    if (req.transcriptions?.length) resultat.transcriptions[0].chemin = req.transcriptions[0].chemin
    return resultat
  })
  const b = await monter(verifier)
  expect(valider().disabled).toBe(true)
  expect(document.querySelector('.verification-fichiers')?.textContent).toContain('1 transcription est à retrouver')
  expect(document.querySelector('.liste-fichiers')?.parentElement?.hasAttribute('open')).toBe(true)
  soumettre(); await attendre()
  expect(b.migrerDepuisV1).not.toHaveBeenCalled()
  localiser().click(); await attendre()
  expect(valider().disabled).toBe(false)
  expect(document.querySelector('.liste-fichiers')?.textContent).toContain('ancien.Sonal')
  expect(document.querySelector('.liste-fichiers')?.textContent).toContain('/retrouve/A.sonal')
  soumettre(); await attendre()
  expect(b.migrerDepuisV1).toHaveBeenCalledWith(expect.objectContaining({
    empreinteCrp: 'empreinte-source', transcriptions: [{ index: 0, chemin: '/retrouve/A.sonal' }],
  }))
})

test('annuler le choix d’un fichier conserve le blocage et une nouvelle vérification peut retrouver le fichier', async () => {
  const b = await monter(vi.fn(async () => bilan('manquant')))
  b.api.choisirTranscription.mockResolvedValueOnce(null)
  localiser().click(); await attendre()
  expect(valider().disabled).toBe(true)
  expect(b.api.verifier).toHaveBeenCalledOnce()
  b.api.verifier.mockResolvedValueOnce(bilan())
  reverifier().click(); await attendre()
  expect(valider().disabled).toBe(false)
})

test('un fichier disparu juste avant confirmation empêche toute conversion', async () => {
  const b = await monter()
  b.api.verifier.mockResolvedValueOnce(bilan('manquant'))
  soumettre(); await attendre()
  expect(b.migrerDepuisV1).not.toHaveBeenCalled()
  expect(b.fermer).not.toHaveBeenCalled()
  expect(valider().disabled).toBe(true)
})

test('une erreur IPC de vérification est nettoyée et bloque la création', async () => {
  const b = await monter(vi.fn(async () => { throw new Error("Error invoking remote method 'migrer:verifier': Error: Le corpus a changé.") }))
  expect(document.querySelector('[role=alert]')?.textContent).toBe('Le corpus a changé.')
  expect(valider().disabled).toBe(true)
  expect(b.migrerDepuisV1).not.toHaveBeenCalled()
})

test('une erreur de conversion reste lisible et laisse les fichiers accessibles pour un nouveau choix', async () => {
  const b = await monter()
  b.migrerDepuisV1.mockRejectedValueOnce(new Error("Error invoking remote method 'migrer:preparer': Error: Entretien illisible « ancien.Sonal »"))
  soumettre(); await attendre()
  expect(document.querySelector('[role=alert]')?.textContent).toBe('Entretien illisible « ancien.Sonal »')
  expect(document.querySelector('.liste-fichiers')?.parentElement?.hasAttribute('open')).toBe(true)
  expect(localiser().disabled).toBe(false)
  expect(b.fermer).not.toHaveBeenCalled()
})

test('les réponses en cours ne déclenchent aucune migration après fermeture de la fenêtre', async () => {
  let terminer!: (valeur: VerificationMigrationV1) => void
  const b = await monter(vi.fn(() => new Promise<VerificationMigrationV1>((resolve) => { terminer = resolve })))
  expect(valider().disabled).toBe(true)
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  terminer(bilan()); await attendre()
  expect(document.querySelector('.modale-migration')).toBeNull()
  expect(b.migrerDepuisV1).not.toHaveBeenCalled()
})
