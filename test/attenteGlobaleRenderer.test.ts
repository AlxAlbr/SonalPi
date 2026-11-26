// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import AttenteGlobale from '../src/renderer/components/app/AttenteGlobale.vue'
import { avecAttente, fermetureEnCours, pendantChoixUtilisateur } from '../src/renderer/attente'

let app: App | null = null
let terminer: (() => void) | null = null
let operation: Promise<void> | null = null
const fermer = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('sonal', { application: { fermerSansAttendre: fermer } })
})
afterEach(async () => {
  terminer?.()
  await operation
  await nextTick()
  app?.unmount()
  app = null
  terminer = null
  operation = null
  fermetureEnCours.value = false
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fermer.mockClear()
})

function monter() {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(AttenteGlobale)
  app.mount(host)
}
function attendre() {
  operation = avecAttente('Envoi…', () => new Promise<void>((resolve) => { terminer = resolve }))
}
function touche(cible: EventTarget, key: string, shiftKey = false) {
  const evenement = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  cible.dispatchEvent(evenement)
  return evenement
}

test('le bouton de fermeture reste atteignable au clavier et les touches de l’écran derrière sont bloquées', async () => {
  monter()
  attendre()
  fermetureEnCours.value = true
  await nextTick()
  const voile = document.querySelector<HTMLElement>('.voile-attente')!
  expect(document.activeElement).toBe(voile)
  expect(touche(document.body, 'Enter').defaultPrevented).toBe(true)
  await vi.advanceTimersByTimeAsync(5_000)
  await nextTick()
  const bouton = document.querySelector<HTMLButtonElement>('.fermeture-immediate button')!
  expect(bouton).not.toBeNull()
  expect(touche(voile, 'Tab').defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(bouton)
  const raccourciFond = vi.fn()
  window.addEventListener('keydown', raccourciFond)
  try {
    expect(touche(bouton, 'Enter').defaultPrevented).toBe(false)
    expect(touche(bouton, ' ').defaultPrevented).toBe(false)
    touche(bouton, 'f')
    expect(raccourciFond).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('keydown', raccourciFond)
  }
  bouton.click()
  expect(fermer).toHaveBeenCalledOnce()
  touche(bouton, 'Tab', true)
  expect(document.activeElement).toBe(bouton)
})

test('le focus revient à sa place après l’attente et les touches sont rétablies', async () => {
  const champ = document.createElement('input')
  document.body.append(champ)
  champ.focus()
  monter()
  attendre()
  await nextTick()
  terminer!()
  await operation
  await nextTick()
  expect(document.activeElement).toBe(champ)
  expect(touche(champ, 'Enter').defaultPrevented).toBe(false)
})

test('une question utilisateur suspend le voile et son blocage clavier', async () => {
  monter()
  attendre()
  await nextTick()
  await pendantChoixUtilisateur(async () => {
    await nextTick()
    expect(document.querySelector('.voile-attente')).toBeNull()
    expect(touche(document.body, 'Tab').defaultPrevented).toBe(false)
  })
  await nextTick()
  expect(document.querySelector('.voile-attente')).not.toBeNull()
  expect(touche(document.body, 'Enter').defaultPrevented).toBe(true)
})

test('une attente déjà active au montage reçoit aussi le focus', async () => {
  attendre()
  monter()
  await nextTick()
  expect(document.activeElement).toBe(document.querySelector('.voile-attente'))
})
