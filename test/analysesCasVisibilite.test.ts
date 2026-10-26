import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import type { Cas } from '../src/shared/corpus/cas'
import { traitementsLexicoParDefaut } from '../src/shared/lexico/traitements'
import { useSourcesAnalyseCorpus } from '../src/renderer/composables/corpus/useSourcesAnalyseCorpus'
import { useSyntheseCorpus } from '../src/renderer/composables/corpus/useSyntheseCorpus'
import { useLexicoCorpus } from '../src/renderer/composables/corpus/useLexicoCorpus'

const scopes: EffectScope[] = []
const casVide: Cas = { id: 'c1', nom: 'Vide', memo: '', creeLe: '', modifieLe: '', regles: [], rattachements: [] }
function creer() {
  const cas = ref<Record<string, Cas>>({})
  const deps = { cas, membership: ref({}), variables: ref([]), codebook: ref([]), ouvertId: ref(null), sourceOuverte: () => null, ouvrirSource: vi.fn() }
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => ({
    cas,
    synthese: useSyntheseCorpus({ ...deps, sources: useSourcesAnalyseCorpus(deps) }),
    lexico: useLexicoCorpus({ ...deps, traitements: ref(traitementsLexicoParDefaut()) }),
  }))!
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

describe('visibilité des critères Cas', () => {
  test('sans définition, les dimensions et le bilan ordinaire ne proposent pas Cas', () => {
    const { synthese, lexico } = creer()
    expect(synthese.ongletsCriteresSynthese.value).not.toContain('cas')
    expect(lexico.ongletsFiltresLexico.value).not.toContain('cas')
    expect(synthese.lignesResumeSynthese.value.some((ligne) => ligne.startsWith('Cas :'))).toBe(false)
    expect(lexico.lignesResumeLexico.value.some((ligne) => ligne.includes('cas'))).toBe(false)
  })
  test('un cas vide suffit, sans sélectionner de filtre ni changer la dimension consultée', () => {
    const { cas, synthese, lexico } = creer()
    cas.value = { c1: casVide }
    expect(synthese.ongletsCriteresSynthese.value).toContain('cas')
    expect(lexico.ongletsFiltresLexico.value).toContain('cas')
    expect(synthese.ongletCriteresSynthese.value).toBe('themes')
    expect(lexico.ongletFiltresLexico.value).toBe('entretiens')
    expect(synthese.filtresSynthese.value.cas.mode).toBe('sans-restriction')
    expect(lexico.filtresLexico.value.cas.mode).toBe('sans-restriction')
  })
  test('supprimer le dernier cas replie la dimension, sans effacer la restriction ni les autres critères', async () => {
    const { cas, synthese, lexico } = creer()
    cas.value = { c1: casVide }
    synthese.ongletCriteresSynthese.value = 'cas'
    lexico.ongletFiltresLexico.value = 'cas'
    synthese.filtresSynthese.value.cas = { mode: 'choix', ids: ['c1'] }
    lexico.filtresLexico.value.cas = { mode: 'choix', ids: ['c1'] }
    synthese.filtresSynthese.value.themes = { mode: 'choix', ids: ['t1'] }
    cas.value = {}
    expect(synthese.ongletCriteresSynthese.value).toBe('themes')
    expect(lexico.ongletFiltresLexico.value).toBe('entretiens')
    expect(synthese.filtreCasIndisponibleSynthese.value).toBe(true)
    expect(lexico.filtreCasIndisponibleLexico.value).toBe(true)
    expect(synthese.lignesResumeSynthese.value).toContain('Cas : Introuvable (c1)')
    expect(lexico.diagnosticsLexico.value).toContainEqual({ titre: 'Cas introuvable', message: 'c1' })
    expect(synthese.filtresSynthese.value.cas).toEqual({ mode: 'choix', ids: ['c1'] })
    expect(lexico.filtresLexico.value.cas).toEqual({ mode: 'choix', ids: ['c1'] })
    synthese.retirerFiltreCasSynthese()
    lexico.retirerFiltreCasLexico()
    await nextTick()
    expect(synthese.filtresSynthese.value.themes).toEqual({ mode: 'choix', ids: ['t1'] })
    expect(synthese.filtreCasIndisponibleSynthese.value).toBe(false)
    expect(lexico.filtreCasIndisponibleLexico.value).toBe(false)
    expect(synthese.calculeLeSynthese.value).toBeNull()
    expect(lexico.calculeLeLexico.value).toBeNull()
  })
  test('le bilan du résultat calculé garde sa restriction jusqu’au calcul explicite suivant', async () => {
    vi.stubGlobal('window', { sonal: { corpus: { personnesInventaire: async () => ({ personnes: [] }) } } })
    const { cas, synthese } = creer()
    cas.value = { c1: casVide }
    synthese.filtresSynthese.value.cas = { mode: 'choix', ids: ['c1'] }
    await synthese.actualiserSynthese()
    const calcul = synthese.calculeLeSynthese.value
    cas.value = {}
    synthese.retirerFiltreCasSynthese()
    await nextTick()
    expect(synthese.filtreCasIndisponibleSynthese.value).toBe(true)
    expect(synthese.lignesResumeSynthese.value).toContain('Cas : Introuvable (c1)')
    expect(synthese.calculeLeSynthese.value).toBe(calcul)
    expect(synthese.resultatPerimeSynthese.value).toBe(true)
    synthese.reinitialiserSynthese()
    expect(synthese.filtreCasIndisponibleSynthese.value).toBe(false)
  })
})
