// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { filtresLexicoParDefaut } from '../src/shared/lexico/types'
import type { OngletFiltresLexico } from '../src/renderer/composables/corpus/useLexicoCorpus'
import LexicoCote from '../src/renderer/components/analyser/lexico/LexicoCote.vue'

const injection = vi.hoisted(() => ({ sonal: undefined as unknown }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.sonal }))
const applications: App[] = []
afterEach(() => {
  applications.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
})

async function banc() {
  const sonal = {
    filtresLexico: ref(filtresLexicoParDefaut()),
    ongletFiltresLexico: ref<OngletFiltresLexico>('locuteurs'),
    ongletsFiltresLexico: ref<OngletFiltresLexico[]>(['entretiens', 'variables', 'locuteurs', 'themes']),
    locuteursLexico: ref([{ id: 'corpus-alice', nom: 'Alice' }, { id: 'corpus-bob', nom: 'Bob' }]),
    membership: ref({}), codebook: ref([]), cas: ref({}), famillesCas: ref({}),
    variables: ref([{ id: 'age', lib: 'Âge', portee: 'locuteur', modalites: [{ id: 'adulte', lib: 'Adulte' }] }]),
  }
  injection.sonal = sonal
  const racine = document.createElement('div')
  document.body.append(racine)
  const app = createApp(LexicoCote)
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
  const bouton = async (texte: string) => {
    const element = [...racine.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)
    if (!element) throw new Error(`Bouton absent : ${texte}`)
    element.click()
    await nextTick()
  }
  return { sonal, racine, cocher, bouton }
}

describe('Lexico — sélection des locuteurs et des participations', () => {
  test('les choix d’identité commune et les deux choix d’absence restent indépendants', async () => {
    const b = await banc()
    expect(b.racine.querySelector('h3')?.textContent).toBe('Locuteurs')
    await b.cocher('Alice')
    expect(b.sonal.filtresLexico.value.locuteurs).toEqual({
      selection: { mode: 'choix', ids: ['corpus-alice'] }, sansIdentiteCommune: false, sansParticipation: false,
    })
    await b.cocher('Locuteurs non associés')
    expect(b.sonal.filtresLexico.value.locuteurs.sansIdentiteCommune).toBe(true)
    expect(b.sonal.filtresLexico.value.locuteurs.sansParticipation).toBe(false)
    await b.cocher('Passages sans locuteur')
    expect(b.sonal.filtresLexico.value.locuteurs.sansParticipation).toBe(true)
    await b.bouton('Retirer ce filtre')
    expect(b.sonal.filtresLexico.value.locuteurs).toEqual(filtresLexicoParDefaut().locuteurs)
    expect(b.sonal.filtresLexico.value).not.toHaveProperty('personnes')
  })

  test('tout cocher ne sélectionne que les identités connues, sans inclure les absences', async () => {
    const b = await banc()
    await b.bouton('Tout cocher')
    expect(b.sonal.filtresLexico.value.locuteurs).toEqual({
      selection: { mode: 'choix', ids: ['corpus-alice', 'corpus-bob'] }, sansIdentiteCommune: false, sansParticipation: false,
    })
    await b.bouton('Tout décocher')
    expect(b.sonal.filtresLexico.value.locuteurs.selection).toEqual({ mode: 'choix', ids: [] })
  })

  test('le filtre de variable locale utilise la portée participation dès la sélection', async () => {
    const b = await banc()
    b.sonal.ongletFiltresLexico.value = 'variables'
    await nextTick()
    await b.cocher('Adulte')
    expect(b.sonal.filtresLexico.value.variables.age).toEqual({ portee: 'participation', modaliteIds: ['adulte'], nonRenseigne: false })
    await b.cocher('Non renseigné')
    expect(b.sonal.filtresLexico.value.variables.age.nonRenseigne).toBe(true)
  })
})
