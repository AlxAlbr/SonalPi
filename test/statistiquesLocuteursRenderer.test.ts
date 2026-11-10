// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import PanneauLocuteursEntretien from '../src/renderer/components/traiter/entretien/PanneauLocuteursEntretien.vue'
import type { BlocParole } from '../src/shared/entretien/statistiquesLocuteurs'
import type { Locuteur } from '../src/shared/format'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren() })

async function monter() {
  const blocsParole = ref<BlocParole[]>([
    { pos: 1, longueur: 7, texte: 'Bonjour', loc: 1 },
    { pos: 10, longueur: 5, texte: 'Salut', loc: 2 },
    { pos: 17, longueur: 5, texte: 'Merci', loc: 1 },
  ])
  const locuteurs = ref<Locuteur[]>([
    { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
    { index: 2, nom: 'Fatima', valeursLoc: {}, personneRef: null },
  ])
  const entretien = reactive({ ancres: [{ pos: 1, t: 0 }, { pos: 22, t: 17 }] })
  const allerAuTexte = vi.fn(), seek = vi.fn()
  const ouvertId = ref('e1')
  const url = ref<string | null>('audio-test')
  injection.contexte = {
    blocsParole, locuteurs, entretien, allerAuTexte, tempsAuTexte: () => 4, audio: { url, seek }, ouvertId,
    vue: ref('entretien'), locuteurASupprimer: ref(null), messagePersonnes: ref(''),
    rapprochementNommage: ref(null), rapprochementOccupe: ref(false), lirePersonnes: async () => ({ personnes: [] }),
  }
  const host = document.body.appendChild(document.createElement('div'))
  const ouvert = ref(false)
  const app = createApp({ render: () => h(PanneauLocuteursEntretien, {
    actif: true, lectureSeule: true, statistiquesOuvertes: ouvert.value,
    'onUpdate:statistiquesOuvertes': (valeur: boolean) => { ouvert.value = valeur },
  }) })
  apps.push(app)
  app.mount(host)
  await nextTick()
  const toggle = host.querySelector<HTMLDetailsElement>('.statistiques-locuteurs')!
  toggle.open = true
  toggle.dispatchEvent(new Event('toggle'))
  await nextTick()
  return { host, toggle, blocsParole, locuteurs, entretien, allerAuTexte, seek, url, ouvertId, ouvert }
}

test('les statistiques et la navigation restent utilisables en lecture seule, sans commande de mutation', async () => {
  const b = await monter()
  expect(b.host.querySelector('.stats-locuteurs')).not.toBeNull()
  expect(b.host.querySelector('.attribuer .attr')?.hasAttribute('disabled')).toBe(true)
  const avant = JSON.stringify([b.blocsParole.value, b.locuteurs.value, b.entretien])
  const bouton = b.host.querySelector<HTMLButtonElement>('[aria-label="Prise de parole suivante de Enquêteur"]')!
  for (const pos of [1, 17, 1]) {
    bouton.click()
    await nextTick()
    expect(b.allerAuTexte).toHaveBeenLastCalledWith(pos)
    expect(b.seek).toHaveBeenLastCalledWith(4)
  }
  const precedent = b.host.querySelector<HTMLButtonElement>('[aria-label="Prise de parole précédente de Enquêteur"]')!
  precedent.click()
  await nextTick()
  expect(b.allerAuTexte).toHaveBeenLastCalledWith(17)
  expect(JSON.stringify([b.blocsParole.value, b.locuteurs.value, b.entretien])).toBe(avant)
  b.url.value = null
  b.seek.mockClear()
  bouton.click()
  await nextTick()
  expect(b.seek).not.toHaveBeenCalled()
  b.toggle.open = false
  b.toggle.dispatchEvent(new Event('toggle'))
  await nextTick()
  expect(b.host.querySelector('.stats-locuteurs')).toBeNull()
})

test('les noms, couleurs, rôles et attributions suivent les données réactives', async () => {
  const b = await monter()
  expect(b.host.querySelector('.bilan-stat')?.textContent).toContain('Questions : 66,7 %')
  b.locuteurs.value[0].nom = '<img src=x onerror=alert(1)>'
  b.locuteurs.value[0].couleur = '#21805a'
  b.locuteurs.value[0].interviewer = false
  await nextTick()
  const nom = b.host.querySelector<HTMLElement>('.liste-stats-loc li[data-loc="1"] strong')!
  expect(nom.textContent).toBe('<img src=x onerror=alert(1)>')
  expect(b.host.querySelector('.stats-locuteurs img')).toBeNull()
  expect(b.host.querySelector('.bilan-stat')?.textContent).not.toContain('Questions')
  b.blocsParole.value = b.blocsParole.value.map((bloc) => ({ ...bloc, loc: 2 }))
  await nextTick()
  expect(b.host.querySelectorAll('.liste-stats-loc li')).toHaveLength(1)
  expect(b.host.querySelector('.info-stat')?.textContent).toContain('1 interv. · 3 mots')
  b.ouvertId.value = 'e2'
  await nextTick()
  expect(b.ouvert.value).toBe(false)
  expect(b.host.querySelector('.stats-locuteurs')).toBeNull()
})

test('une modification du découpage remet le compteur de navigation à zéro', async () => {
  const b = await monter()
  b.host.querySelector<HTMLButtonElement>('[aria-label="Prise de parole précédente de Enquêteur"]')!.click()
  await nextTick()
  expect(b.allerAuTexte).toHaveBeenLastCalledWith(17)
  b.host.querySelector<HTMLButtonElement>('[aria-label="Prise de parole suivante de Enquêteur"]')!.click()
  await nextTick()
  expect(b.host.querySelector('.liste-stats-loc li[data-loc="1"] .compteur-tour')?.textContent).toBe('1/2')
  b.blocsParole.value = [b.blocsParole.value[2]]
  await nextTick()
  expect(b.host.querySelector('.compteur-tour')).toBeNull()
})
