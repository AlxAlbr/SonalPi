// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import BarreInterventionsLocuteurs from '../src/renderer/components/traiter/corpus/BarreInterventionsLocuteurs.vue'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('le calque ne dessine que les tours sélectionnés, sur l’axe complet et sans fond opaque', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const contexte = { scale: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalAlpha: 1 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contexte as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  const couleurs = ref<Record<string, string>>({ a: '#ff0000' }), ouvrir = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  const tours = [
    { cle: 'a', nom: 'Alice', debut: 0, fin: 10, pos: 1, mots: 3 },
    { cle: 'b', nom: 'Bob', debut: 10, fin: 90, pos: 5, mots: 8 },
    { cle: 'a', nom: 'Alice', debut: 90, fin: 100, pos: 20, mots: 2 },
  ]
  const app = createApp({ render: () => h(BarreInterventionsLocuteurs, { titre: 'A', tours, couleurs: couleurs.value, source: '/onde.png', onOuvrir: ouvrir }) })
  apps.push(app); app.mount(host); await nextTick()
  expect(contexte.fillRect.mock.calls).toEqual([[0, 1, 10, 23], [90, 1, 10, 23]])
  expect(contexte.globalAlpha).toBe(.55)
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/onde.png')
  const bouton = host.querySelector('button')!
  vi.spyOn(bouton, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect)
  bouton.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 50 }))
  expect(ouvrir).not.toHaveBeenCalled()
  bouton.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 95 }))
  expect(ouvrir).toHaveBeenLastCalledWith(tours[2])
  bouton.click()
  expect(ouvrir).toHaveBeenLastCalledWith(tours[0])
  couleurs.value = {}; await nextTick(); await nextTick()
  expect(bouton.disabled).toBe(true)
})
