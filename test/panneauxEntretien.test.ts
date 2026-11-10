// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { usePanneauxEntretien, type OngletEntretien } from '../src/renderer/composables/entretien/usePanneauxEntretien'

const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
  vi.useRealTimers()
})

function monter() {
  const demande = ref<OngletEntretien>('locuteurs')
  let panneaux!: ReturnType<typeof usePanneauxEntretien>
  const app = createApp({ setup() {
    panneaux = usePanneauxEntretien(demande)
    return () => h('div')
  } })
  apps.push(app)
  app.mount(document.body.appendChild(document.createElement('div')))
  return { ...panneaux, demande }
}

function element(rect: { left: number; top: number; right: number; bottom: number }) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect
  el.setPointerCapture = vi.fn()
  return el
}

function pointeur(el: HTMLElement, type: string, x: number, y: number, id = 1) {
  return { currentTarget: el, type, clientX: x, clientY: y, pointerId: id, button: 0, preventDefault: vi.fn() } as unknown as PointerEvent
}

test('un onglet inactif descend sans remplacer l’outil du haut et revient sans doublon', () => {
  const p = monter()
  p.deplacer('commentaires', 'bas')
  expect(p.partage.value).toBe(true)
  expect(p.actifHaut.value).toBe('locuteurs')
  expect(p.actifBas.value).toBe('commentaires')
  expect(p.visible('locuteurs')).toBe(true)
  expect(p.visible('commentaires')).toBe(true)
  p.deplacer('commentaires', 'bas')
  expect(p.ongletsBas.value).toEqual(['commentaires'])
  p.deplacer('commentaires', 'haut')
  expect(p.partage.value).toBe(false)
  expect(p.actifBas.value).toBeNull()
  expect(p.actifHaut.value).toBe('commentaires')
  expect(p.ongletsHaut.value).toEqual(['locuteurs', 'anon', 'themes', 'commentaires'])
})

test('plusieurs onglets peuvent rejoindre le bas, mais le haut ne reste jamais vide', () => {
  const p = monter()
  for (const id of ['locuteurs', 'anon', 'themes', 'commentaires'] as const) p.deplacer(id, 'bas')
  expect(p.ongletsBas.value).toEqual(['locuteurs', 'anon', 'themes'])
  expect(p.ongletsHaut.value).toEqual(['commentaires'])
  expect(p.actifHaut.value).toBe('commentaires')
  p.deplacer('themes', 'haut')
  expect(p.actifBas.value).toBe('locuteurs')
  expect(p.actifHaut.value).toBe('themes')
})

test('les clics et les ouvertures extérieures activent l’onglet dans sa propre zone', async () => {
  const p = monter()
  p.deplacer('commentaires', 'bas')
  p.deplacer('themes', 'bas')
  p.demande.value = 'commentaires'
  await nextTick()
  expect(p.actifBas.value).toBe('commentaires')
  expect(p.actifHaut.value).toBe('locuteurs')
  p.cliquer('themes')
  await nextTick()
  expect(p.demande.value).toBe('themes')
  expect(p.actifBas.value).toBe('themes')
  p.regrouper()
  expect(p.actifBas.value).toBeNull()
  expect(p.actifHaut.value).toBe('themes')
  expect(p.ongletsBas.value).toEqual([])
})

test('un petit mouvement reste un clic, un dépôt hors des zones ne déplace rien', () => {
  const p = monter()
  const el = element({ left: 0, top: 0, right: 200, bottom: 500 })
  p.cibleHaut.value = el
  p.commencerGlissement(pointeur(el, 'pointerdown', 10, 10), 'commentaires')
  p.glisser(pointeur(el, 'pointermove', 12, 12))
  expect(p.ongletGlisse.value).toBeNull()
  p.terminerGlissement(pointeur(el, 'pointerup', 12, 12))
  p.cliquer('commentaires')
  expect(p.actifHaut.value).toBe('commentaires')
  p.commencerGlissement(pointeur(el, 'pointerdown', 10, 10), 'commentaires')
  p.glisser(pointeur(el, 'pointermove', 400, 200))
  expect(p.destination.value).toBeNull()
  p.terminerGlissement(pointeur(el, 'pointerup', 400, 200))
  expect(p.partage.value).toBe(false)
})

test('la zone de dépôt superposée prime sur le haut et le clic suivant est ignoré', async () => {
  vi.useFakeTimers()
  const p = monter()
  const el = element({ left: 0, top: 0, right: 200, bottom: 500 })
  p.cibleHaut.value = el
  p.cibleBas.value = element({ left: 0, top: 350, right: 200, bottom: 500 })
  p.commencerGlissement(pointeur(el, 'pointerdown', 10, 10), 'commentaires')
  p.glisser(pointeur(el, 'pointermove', 100, 400, 2))
  expect(p.ongletGlisse.value).toBeNull()
  p.glisser(pointeur(el, 'pointermove', 100, 400))
  expect(p.destination.value).toBe('bas')
  p.terminerGlissement(pointeur(el, 'pointerup', 100, 400))
  expect(p.partage.value).toBe(true)
  p.cliquer('anon')
  expect(p.actifHaut.value).toBe('locuteurs')
  await vi.runAllTimersAsync()
  p.cliquer('anon')
  expect(p.actifHaut.value).toBe('anon')
})

test('Échap et l’annulation du pointeur abandonnent un déplacement', () => {
  const p = monter()
  const el = element({ left: 0, top: 0, right: 200, bottom: 500 })
  p.cibleBas.value = el
  for (const annulation of ['clavier', 'pointeur']) {
    p.commencerGlissement(pointeur(el, 'pointerdown', 10, 10), 'commentaires')
    p.glisser(pointeur(el, 'pointermove', 100, 400))
    if (annulation === 'clavier') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    else p.terminerGlissement(pointeur(el, 'pointercancel', 100, 400))
    p.terminerGlissement(pointeur(el, 'pointerup', 100, 400))
    expect(p.ongletGlisse.value).toBeNull()
    expect(p.partage.value).toBe(false)
  }
})

test('la séparation se règle au pointeur et au clavier, dans les limites prévues', () => {
  const p = monter()
  const el = element({ left: 0, top: 100, right: 200, bottom: 600 })
  p.colonne.value = el
  p.commencerRedimensionnement(pointeur(el, 'pointerdown', 10, 350))
  p.redimensionner(pointeur(el, 'pointermove', 10, 400))
  expect(p.proportionHaut.value).toBe(60)
  p.redimensionner(pointeur(el, 'pointermove', 10, 900))
  expect(p.proportionHaut.value).toBe(80)
  p.terminerRedimensionnement()
  p.redimensionner(pointeur(el, 'pointermove', 10, 300))
  expect(p.proportionHaut.value).toBe(80)
  for (const [key, valeur] of [['Home', 20], ['ArrowDown', 25], ['ArrowUp', 20], ['ArrowUp', 20], ['End', 80]] as const) {
    p.redimensionnerAuClavier(new KeyboardEvent('keydown', { key }))
    expect(p.proportionHaut.value).toBe(valeur)
  }
})
