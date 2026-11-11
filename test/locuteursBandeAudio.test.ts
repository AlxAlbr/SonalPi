// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import LecteurAudio from '../src/renderer/components/traiter/entretien/LecteurAudio.vue'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
vi.mock('../src/renderer/components/traiter/entretien/AideLectureAudio.vue', () => ({ default: { render: () => null } }))
const apps: ReturnType<typeof createApp>[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren() })

test('les interventions se dessinent sur la bande et la navigation met en évidence le passage atteint', async () => {
  const afficher = ref(true)
  const active = ref<{ loc: number | null; pos: number } | null>(null)
  const ancres = reactive([{ pos: 1, t: 0 }, { pos: 13, t: 10 }])
  const duree = ref(10)
  injection.contexte = {
    blocsParole: ref([
      { pos: 1, longueur: 5, texte: 'Salut', loc: 1 },
      { pos: 8, longueur: 5, texte: 'Merci', loc: 2 },
    ]),
    locuteurs: ref([{ index: 1, nom: 'A', couleur: '#ff0000' }, { index: 2, nom: 'B', couleur: '#0000ff' }]),
    entretien: reactive({ ancres }),
    audio: { url: ref('audio'), waveformUrl: ref(null), enLecture: ref(false), duree,
      position: ref(0), vitesse: ref(1), ratio: ref(0), erreur: ref(null) },
    resumeOuvert: ref([]), etatAudioOuvert: reactive({ etat: 'local' }),
  }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(LecteurAudio, { afficherLocuteurs: afficher.value, interventionActive: active.value }) })
  apps.push(app)
  app.mount(host)
  await nextTick()
  const tours = host.querySelectorAll<HTMLElement>('.locuteur-bande')
  expect(tours).toHaveLength(2)
  expect(tours[0].style.left).toBe('0%')
  expect(tours[0].style.width).toBe('50%')
  ancres.splice(0)
  duree.value = 0
  await nextTick()
  expect(host.querySelectorAll('.locuteur-bande')).toHaveLength(2)
  expect(host.querySelector<HTMLElement>('.locuteur-bande')?.style.width).toBe('50%')
  active.value = { loc: 2, pos: 8 }
  await nextTick()
  expect(host.querySelectorAll('.locuteur-bande.estompe')).toHaveLength(1)
  expect(host.querySelectorAll('.locuteur-bande.actif')).toHaveLength(1)
  afficher.value = false
  await nextTick()
  expect(host.querySelectorAll('.locuteur-bande')).toHaveLength(0)
})
