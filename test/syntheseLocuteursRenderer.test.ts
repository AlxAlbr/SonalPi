// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { filtresSyntheseParDefaut } from '../src/shared/synthese/types'
import type { OngletCriteresSynthese } from '../src/renderer/composables/corpus/useSyntheseCorpus'
import SyntheseCote from '../src/renderer/components/analyser/synthese/SyntheseCote.vue'

const injection = vi.hoisted(() => ({ sonal: undefined as unknown }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.sonal }))
const applications: App[] = []
afterEach(() => {
  applications.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
})

async function banc() {
  const sonal = {
    filtresSynthese: ref(filtresSyntheseParDefaut()),
    ongletCriteresSynthese: ref<OngletCriteresSynthese>('locuteurs'),
    ongletsCriteresSynthese: ref<OngletCriteresSynthese[]>(['entretiens', 'variables', 'locuteurs', 'themes']),
    casDisponiblesSynthese: ref(false),
    locuteursSynthese: ref([{ id: 'corpus-alice', nom: 'Alice' }, { id: 'corpus-bob', nom: 'Bob' }]),
    membership: ref({}), codebook: ref([]), cas: ref({}),
    variables: ref([{ id: 'age', lib: 'Âge', portee: 'locuteur', modalites: [{ id: 'adulte', lib: 'Adulte' }] }]),
  }
  injection.sonal = sonal
  const racine = document.createElement('div')
  document.body.append(racine)
  const app = createApp(SyntheseCote)
  applications.push(app)
  app.mount(racine)
  await nextTick()
  const cocher = async (texte: string) => {
    const label = [...racine.querySelectorAll('label')].find((l) => l.textContent?.trim() === texte)
    const input = label?.querySelector<HTMLInputElement>('input')
    if (!input) throw new Error(`Choix absent : ${texte}`)
    input.click()
    await nextTick()
  }
  return { sonal, racine, cocher }
}

describe('Synthèse — sélection des locuteurs et des participations', () => {
  test('les identités communes et les deux choix d’absence restent indépendants', async () => {
    const b = await banc()
    expect(b.racine.querySelector('h3')?.textContent).toBe('Locuteurs')
    expect(b.racine.querySelector('[data-tour="onglet-locuteurs-synthese"]')).not.toBeNull()
    await b.cocher('Alice')
    expect(b.sonal.filtresSynthese.value.locuteurs).toEqual({
      selection: { mode: 'choix', ids: ['corpus-alice'] }, sansIdentiteCommune: false, sansParticipation: false,
    })
    await b.cocher('Locuteurs non associés')
    expect(b.sonal.filtresSynthese.value.locuteurs.sansIdentiteCommune).toBe(true)
    expect(b.sonal.filtresSynthese.value.locuteurs.sansParticipation).toBe(false)
    await b.cocher('Passages sans locuteur')
    expect(b.sonal.filtresSynthese.value.locuteurs.sansParticipation).toBe(true)
    const effacer = [...b.racine.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Effacer la sélection')!
    effacer.click()
    await nextTick()
    expect(b.sonal.filtresSynthese.value.locuteurs).toEqual(filtresSyntheseParDefaut().locuteurs)
    expect(b.sonal.filtresSynthese.value).not.toHaveProperty('personnes')
  })

  test('décocher le dernier choix retire le filtre selon le comportement existant', async () => {
    const b = await banc()
    await b.cocher('Locuteurs non associés')
    await b.cocher('Passages sans locuteur')
    await b.cocher('Locuteurs non associés')
    expect(b.sonal.filtresSynthese.value.locuteurs.selection.mode).toBe('choix')
    await b.cocher('Passages sans locuteur')
    expect(b.sonal.filtresSynthese.value.locuteurs.selection.mode).toBe('sans-restriction')
    await b.cocher('Alice')
    await b.cocher('Alice')
    expect(b.sonal.filtresSynthese.value.locuteurs.selection.mode).toBe('sans-restriction')
  })

  test('le filtre d’une variable locale utilise la portée participation', async () => {
    const b = await banc()
    b.sonal.ongletCriteresSynthese.value = 'variables'
    await nextTick()
    await b.cocher('Adulte')
    expect(b.sonal.filtresSynthese.value.variables.age).toEqual({ portee: 'participation', modaliteIds: ['adulte'], nonRenseigne: false })
    await b.cocher('Non renseigné')
    expect(b.sonal.filtresSynthese.value.variables.age.nonRenseigne).toBe(true)
  })
})
