// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import Accueil from '../src/renderer/components/accueil/Accueil.vue'
import type { EntreeRecent } from '../src/shared/format'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function monter() {
  const recents = ref<EntreeRecent[]>([
    { type: 'local', dir: '/personnel', nom: 'Corpus annoté' },
    { type: 'local', dir: '/exemple', nom: '<img src=x>', exemple: 'synth' },
    { type: 'distant', id: 'g1', nom: 'Terrain partagé', fournisseur: 'gitlab', url: 'https://gitlab.example' },
  ])
  const ouvrirRecent = vi.fn(), retirerRecent = vi.fn(), ouvrirDocumentation = vi.fn(), ouvrirAuthentification = vi.fn()
  const gitlab = vi.fn(async () => [{ id: 'g1', connexionDisponible: false }])
  vi.stubGlobal('sonal', {})
  ;(window as any).sonal = { application: { ouvrirDocumentation }, gitlab: { lister: gitlab } }
  injection.contexte = {
    recents, ouvrirRecent, retirerRecent, ouvrirCatalogueParcours: vi.fn(), ouvrirExemples: vi.fn(),
    choisirFichier: vi.fn(), ouvertureEnCours: ref(false), ouvrirAuthentification, modaleNouveauCorpus: ref(false),
  }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(Accueil)
  apps.push(app); app.mount(host); await nextTick()
  return { host, recents, ouvrirRecent, retirerRecent, ouvrirDocumentation, ouvrirAuthentification }
}

test('les exemples reconnus sont séparés dans un onglet sans interpréter leur nom', async () => {
  const b = await monter()
  expect([...b.host.querySelectorAll('h3')].map((h) => h.id)).toEqual(['titre-creer', 'titre-ouvrir', 'titre-recents', 'titre-decouverte'])
  expect(b.host.querySelectorAll('.decouverte-bloc .carte-demo')).toHaveLength(4)
  expect(b.host.querySelector('.decouverte-bloc .exemples')).not.toBeNull()
  expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(2)
  expect(b.host.querySelector('.recents-bloc')?.textContent).toContain('Corpus annoté')
  expect(b.host.querySelector('.recents-bloc')?.textContent).toContain('Terrain partagé')
  expect(b.host.querySelector('.migration-bloc')).toBeNull()

  b.host.querySelector<HTMLButtonElement>('.onglet.exemples-onglet')!.click()
  await nextTick()
  expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(1)
  expect(b.host.querySelector('.recents-bloc .recent-nom')?.textContent).toBe('<img src=x>')
  expect(b.host.querySelector('.recents-bloc img')).toBeNull()
})

test.each([
  [false, false], [true, false], [false, true], [true, true],
])('la zone des récents s’adapte à ses entrées (exemples : %s, personnels : %s)', async (exemples, personnels) => {
  const b = await monter()
  b.recents.value = b.recents.value.filter((r) => r.type === 'local' && r.exemple ? exemples : personnels)
  await nextTick()

  if (exemples || personnels) {
    expect(b.host.querySelector('.recents-bloc')).not.toBeNull()
    expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(personnels ? 2 : 1)
    expect(!!b.host.querySelector('.recents-bloc .onglets')).toBe(exemples && personnels)
    expect(b.host.querySelector('.decouverte-bloc .exemples')).not.toBeNull()
    expect(b.host.querySelector('.ouverture-bloc .ouvrir-corpus')).not.toBeNull()
  }

  b.recents.value = []
  await nextTick()
  expect(b.host.querySelector('.accueil.bienvenue')).not.toBeNull()
  expect(b.host.querySelector('.recents-bloc')).toBeNull()
  expect(b.host.querySelector('.chemins .exemples')).not.toBeNull()
  expect(b.host.querySelector('.chemins .ouvrir-corpus')).not.toBeNull()
})

test('guide et FAQ ne déclenchent aucune ouverture de corpus', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('.documentation')!.click()
  b.host.querySelector<HTMLButtonElement>('.faq')!.click()
  expect(b.ouvrirDocumentation.mock.calls).toEqual([['guide'], ['faq']])
  expect(b.ouvrirRecent).not.toHaveBeenCalled()
})

test('les onglets remplacent la liste affichée sans dupliquer les récents', async () => {
  const b = await monter()
  const travail = b.host.querySelector<HTMLButtonElement>('.onglet.travail')!
  const exemples = b.host.querySelector<HTMLButtonElement>('.onglet.exemples-onglet')!
  expect(travail.getAttribute('aria-selected')).toBe('true')
  expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(2)

  exemples.click()
  await nextTick()
  expect(exemples.getAttribute('aria-selected')).toBe('true')
  expect(travail.getAttribute('aria-selected')).toBe('false')
  expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(1)
  expect(b.host.querySelector('.recents-bloc .recent-nom')?.textContent).toBe('<img src=x>')
})

test('ouvrir ou retirer une copie transmet son entrée, sans changer la liste par soi-même', async () => {
  const b = await monter()
  const copie = b.recents.value[1]
  b.host.querySelector<HTMLButtonElement>('.onglet.exemples-onglet')!.click()
  await nextTick()
  b.host.querySelector<HTMLButtonElement>('.recents-bloc .recent')!.click()
  b.host.querySelector<HTMLButtonElement>('.recents-bloc .oubli-recent')!.click()
  expect(b.ouvrirRecent).toHaveBeenCalledWith(copie)
  expect(b.retirerRecent).toHaveBeenCalledWith(copie)
  expect(b.recents.value).toHaveLength(3)
})

test('un récent GitLab sans connexion demande ses accès au lieu de contourner le contrôle', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('.recents-bloc .recent[aria-label="Terrain partagé"]')!.click()
  await nextTick(); await nextTick()
  expect(b.ouvrirAuthentification).toHaveBeenCalledWith('gitlab')
  expect(b.ouvrirRecent).not.toHaveBeenCalled()
})
