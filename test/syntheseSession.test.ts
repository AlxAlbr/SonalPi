import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useSourcesAnalyseCorpus } from '../src/renderer/composables/corpus/useSourcesAnalyseCorpus'
import { useSyntheseCorpus } from '../src/renderer/composables/corpus/useSyntheseCorpus'
import type { Cas } from '../src/shared/corpus/cas'
import { FORMAT_VERSION, type Categorie, type EntretienFichier, type Variable } from '../src/shared/format'

const scopes: EffectScope[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})
function entretien(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION, lastModified: '', ancres: [],
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Paroles conservées.' }] }] },
    annotations: [{ id: 'codage', type: 'codage', code: 'theme', from: 1, to: 20 }],
    participations: [{ id: 'participation-stable', index: 7, nom: 'Nom local', locuteurRef: 'identite-corpus', valeursLoc: { age: 'adulte' } }],
    meta: { valeursGen: {}, audioRef: null },
  }
}
function banc() {
  const data = entretien()
  const personnes = [{ id: 'identite-corpus', nom: 'Alice' }, { id: '7', nom: 'Autre identité corpus' }]
  const lire = vi.fn(async (_id: string) => ({ ok: true as const, data: structuredClone(data) }))
  vi.stubGlobal('window', { sonal: { corpus: {
    lireEntretien: lire,
    personnesInventaire: async () => ({ locuteurs: structuredClone(personnes) }),
  } } })
  const deps = {
    membership: ref({ e1: { titre: 'Entretien', date: null, lastModified: '' } }),
    variables: ref<Variable[]>([{ id: 'age', lib: 'Âge', portee: "participation", priv: false, ordre: 0, vExport: 1,
      modalites: [{ id: 'adulte', lib: 'Adulte', mExport: 1 }] }]),
    codebook: ref<Categorie[]>([{ id: 'theme', nom: 'Thème', ordre: 0, parent: null, actif: true, codeExport: 'theme' }]),
    cas: ref<Record<string, Cas>>({}), ouvertId: ref<string | null>(null),
    sourceOuverte: () => null, ouvrirSource: vi.fn(),
  }
  const scope = effectScope()
  scopes.push(scope)
  const sources = scope.run(() => useSourcesAnalyseCorpus(deps))!
  const synthese = scope.run(() => useSyntheseCorpus({ ...deps, sources }))!
  synthese.filtresSynthese.value.themes = { mode: 'choix', ids: ['theme'] }
  return { data, locuteurs: personnes, lire, deps, sources, synthese }
}

describe('Synthèse — session raccordée aux références cibles', () => {
  test('transmet les ids stables sans modifier les données stockées ni les valeurs locales', async () => {
    const b = banc()
    const avant = structuredClone(b.data)
    b.synthese.filtresSynthese.value.variables.age = { portee: 'participation', modaliteIds: ['adulte'], nonRenseigne: false }
    await b.synthese.actualiserSynthese()
    expect(b.synthese.diagnosticsSynthese.value).toEqual([])
    expect(b.synthese.extraitsSynthese.value).toHaveLength(1)
    expect(b.synthese.extraitsSynthese.value[0]).toMatchObject({
      entretienId: 'e1', texte: 'Paroles conservées.', participationIds: ['participation-stable'], locuteurIds: ['identite-corpus'],
    })
    expect(b.synthese.locuteursSynthese.value).toEqual(b.locuteurs)
    expect(b.data).toEqual(avant)
    expect(b.synthese.exportSynthesePossible.value).toBe(true)
  })

  test('garde le résultat et son bilan jusqu’au recalcul explicite, sans confondre un index avec une identité', async () => {
    const b = banc()
    await b.synthese.actualiserSynthese()
    const avant = structuredClone(JSON.parse(JSON.stringify(b.synthese.extraitsSynthese.value)))
    const bilan = [...b.synthese.lignesResumeSynthese.value]
    b.synthese.filtresSynthese.value.locuteurs.selection = { mode: 'choix', ids: ['7'] }
    await nextTick()
    expect(b.synthese.resultatPerimeSynthese.value).toBe(true)
    expect(b.synthese.extraitsSynthese.value).toEqual(avant)
    expect(b.synthese.lignesResumeSynthese.value).toEqual(bilan)
    expect(b.synthese.exportSynthesePossible.value).toBe(false)
    await b.synthese.actualiserSynthese()
    expect(b.synthese.extraitsSynthese.value).toEqual([])
    expect(b.synthese.lignesResumeSynthese.value).toContain('Locuteurs : Autre identité corpus')
    expect(b.synthese.resultatPerimeSynthese.value).toBe(false)
  })

  test('une source indisponible garde le périmètre et interdit un export présenté comme complet', async () => {
    const b = banc()
    b.lire.mockImplementation(async () => { throw new Error('Source momentanément indisponible') })
    await b.synthese.actualiserSynthese()
    expect(b.synthese.diagnosticsSynthese.value).toContainEqual({ entretienId: 'e1', titre: 'Entretien', message: 'Source momentanément indisponible' })
    expect(b.synthese.exportSynthesePossible.value).toBe(false)
    expect(Object.keys(b.deps.membership.value)).toEqual(['e1'])
    expect(b.synthese.locuteursSynthese.value).toEqual(b.locuteurs)
    expect(b.synthese.entretiensCalculSynthese.value).toEqual([{ id: 'e1', titre: 'Entretien', longueurSource: null }])
  })
})
