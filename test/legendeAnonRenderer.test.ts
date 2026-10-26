// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest'
import { createApp, type App } from 'vue'
import LegendeAnon from '../src/renderer/components/traiter/corpus/LegendeAnon.vue'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren() })
function monter() {
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp(LegendeAnon); apps.push(app); app.mount(host)
  return host
}
test('encart ouvert, repliable nativement et accompagné de libellés, pas seulement de couleurs', () => {
  const host = monter(), details = host.querySelector('details')!
  expect(details.open).toBe(true)
  expect(details.querySelector('summary')!.textContent).toContain('Légende et aide')
  expect(host.textContent).toContain('Pseudonymisés')
  expect(host.textContent).toContain('Laissés en clair')
  expect(host.textContent).toContain('À traiter')
  expect(host.querySelectorAll('.legende-badge')).toHaveLength(3)
  expect(host.querySelectorAll('.legende-ligne')).toHaveLength(2)
  for (const indicateur of host.querySelectorAll('.legende-badge, .legende-ligne, .legende-toggle')) {
    expect(indicateur.getAttribute('aria-hidden')).toBe('true')
  }
})
test('les autres états et actions restent expliqués en langage courant', () => {
  const host = monter()
  expect(host.textContent).toContain('Passages masqués par un autre choix')
  expect(host.textContent).toContain('Aucun usage')
  expect(host.textContent).toContain('Bilan à actualiser')
  expect(host.textContent).toContain('Dissocier en gardant les pseudonymes')
  expect(host.querySelector('.croix')!.textContent).toBe('✖')
  expect(host.textContent).toContain('Supprimer la règle et les choix qui en dépendent')
  expect(host.textContent).toContain('panneau Locuteurs')
})
