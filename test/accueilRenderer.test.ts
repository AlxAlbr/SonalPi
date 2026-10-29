// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import Accueil from '../src/renderer/components/accueil/Accueil.vue'
import type { EntreeRecent } from '../src/shared/format'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
vi.mock('../src/renderer/components/accueil/CorpusDistant.vue', () => ({
  default: { props: ['fournisseurInitiale'], template: '<div class="connexion-test">{{ fournisseurInitiale }}</div>' },
}))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function monter() {
  const ecoutes = new Set<(e: { matches: boolean }) => void>()
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false, addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => ecoutes.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => ecoutes.delete(cb),
  } as unknown as MediaQueryList)
  const recents = ref<EntreeRecent[]>([
    { type: 'local', dir: '/personnel', nom: 'Corpus annoté' },
    { type: 'local', dir: '/exemple', nom: '<img src=x>', exemple: 'synth' },
    { type: 'distant', id: 'g1', nom: 'Terrain partagé', fournisseur: 'gitlab', url: 'https://gitlab.example' },
  ])
  const ouvrirRecent = vi.fn(), retirerRecent = vi.fn(), ouvrirDocumentation = vi.fn()
  const gitlab = vi.fn(async () => [{ id: 'g1', connexionDisponible: false }])
  vi.stubGlobal('sonal', {})
  ;(window as any).sonal = { application: { ouvrirDocumentation }, gitlab: { lister: gitlab } }
  injection.contexte = {
    recents, ouvrirRecent, retirerRecent, ouvrirCatalogueParcours: vi.fn(), ouvrirExemples: vi.fn(),
    choisirDossier: vi.fn(), modaleNouveauCorpus: ref(false), modaleCorpusDistant: ref(false),
  }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp(Accueil)
  apps.push(app); app.mount(host); await nextTick()
  return { host, recents, ouvrirRecent, retirerRecent, ouvrirDocumentation, ecoutes, app }
}

test('les exemples reconnus sont séparés sans classer les corpus par leur nom', async () => {
  const b = await monter()
  expect([...b.host.querySelectorAll('h3')].map((h) => h.id)).toEqual(['titre-decouverte', 'titre-exemples', 'titre-corpus', 'titre-recents'])
  expect(b.host.querySelectorAll('.decouverte-bloc .carte-demo')).toHaveLength(4)
  expect(b.host.querySelector('.decouverte-bloc .exemples')).not.toBeNull()
  expect(b.host.querySelectorAll('.exemples-bloc .carte-demo, .recents-bloc .carte-demo')).toHaveLength(0)
  expect(b.host.querySelector('.recents-bloc')?.textContent).toContain('Corpus annoté')
  expect(b.host.querySelectorAll('.recents-bloc .recent')).toHaveLength(2)
  expect(b.host.querySelectorAll('.exemples-bloc .recent')).toHaveLength(1)
  expect(b.host.querySelector('.exemples-bloc img')).toBeNull()
  expect(b.host.querySelector<HTMLDetailsElement>('.migration-bloc')!.open).toBe(false)
})

test.each([
  [false, false], [true, false], [false, true], [true, true],
])('les listes existent seulement si elles ont des entrées (exemples : %s, personnels : %s)', async (exemples, personnels) => {
  const b = await monter()
  b.recents.value = b.recents.value.filter((r) => r.type === 'local' && r.exemple ? exemples : personnels)
  await nextTick()
  expect(!!b.host.querySelector('.exemples-bloc')).toBe(exemples)
  expect(!!b.host.querySelector('.recents-bloc')).toBe(personnels)
  expect(b.host.querySelector('.decouverte-bloc .exemples')).not.toBeNull()
  expect(b.host.querySelector('.corpus-bloc .ouvrir-corpus')).not.toBeNull()
  b.recents.value = []
  await nextTick()
  expect(b.host.querySelectorAll('.exemples-bloc, .recents-bloc')).toHaveLength(0)
})

test('guide et FAQ ne déclenchent aucune ouverture de corpus', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('.documentation')!.click()
  b.host.querySelector<HTMLButtonElement>('.faq')!.click()
  expect(b.ouvrirDocumentation.mock.calls).toEqual([['guide'], ['faq']])
  expect(b.ouvrirRecent).not.toHaveBeenCalled()
})

test('en fenêtre étroite, les récents passent aussi en premier dans le DOM', async () => {
  const b = await monter()
  for (const ecoute of b.ecoutes) ecoute({ matches: true })
  await nextTick()
  expect([...b.host.querySelectorAll('h3')].map((h) => h.id)).toEqual(['titre-recents', 'titre-corpus', 'titre-decouverte', 'titre-exemples'])
  expect(b.host.querySelector('button')?.classList.contains('recent')).toBe(true)
  for (const ecoute of b.ecoutes) ecoute({ matches: false })
  await nextTick()
  expect(b.host.querySelector('button')?.closest('.decouverte-bloc')).not.toBeNull()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  expect(b.ecoutes.size).toBe(0)
})

test('ouvrir ou retirer une copie transmet son entrée, sans changer la liste par soi-même', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('.exemples-bloc .recent')!.click()
  b.host.querySelector<HTMLButtonElement>('.exemples-bloc .oubli-recent')!.click()
  expect(b.ouvrirRecent).toHaveBeenCalledWith(b.recents.value[1])
  expect(b.retirerRecent).toHaveBeenCalledWith(b.recents.value[1])
  expect(b.recents.value).toHaveLength(3)
})

test('un récent GitLab sans connexion demande ses accès au lieu de contourner le contrôle', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('.recents-bloc .recent[title="Terrain partagé"]')!.click()
  await nextTick(); await nextTick()
  expect(b.host.querySelector('.connexion-test')?.textContent).toBe('gitlab')
  expect(b.ouvrirRecent).not.toHaveBeenCalled()
})
