import { describe, expect, test } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { sourceMoteurSynthese, diagnosticsValeursSynthese } from '../src/renderer/editor/synthese'
import { calculerExtraitsSynthese } from '../src/shared/synthese/moteur'
import { filtresSyntheseParDefaut } from '../src/shared/synthese/types'
import { FORMAT_NATIF_LOCUTEURS, type EntretienFichier, type Variable } from '../src/shared/natif/format'

const schema = new Schema({ nodes: {
  doc: { content: 'block*' },
  paragraph: { group: 'block', content: 'inline*', attrs: { loc: { default: null } } },
  text: { group: 'inline' },
} })
const reference = { titre: 'Entretien', date: null, lastModified: '' }
function entretien(): EntretienFichier {
  return {
    formatVersion: FORMAT_NATIF_LOCUTEURS, lastModified: '', annotations: [], ancres: [],
    meta: { valeursGen: { lieu: 'ici' }, audioRef: null },
    participations: [
      { id: 'participation-stable-a', index: 7, nom: 'Nom local A', locuteurRef: 'identite-commune-a', valeursLoc: { age: 'adulte' } },
      { id: 'participation-stable-b', index: 11, nom: 'Nom local B', locuteurRef: null, valeursLoc: {}, interviewer: true },
    ],
    corpsTexte: { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Premières paroles.' }] },
      { type: 'paragraph', attrs: { loc: 11 }, content: [{ type: 'text', text: 'Autres paroles.' }] },
      { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans attribution.' }] },
    ] },
  }
}
function preparer(data = entretien()) {
  const doc = schema.nodeFromJSON(data.corpsTexte)
  data.annotations = [{ id: 'annotation', type: 'codage', code: 'theme', from: 1, to: doc.content.size - 1 }]
  return { doc, data }
}
const variables: Variable[] = [
  { id: 'age', lib: 'Âge', portee: 'participation', priv: false, ordre: 0, vExport: 1, modalites: [{ id: 'adulte', lib: 'Adulte', mExport: 1 }] },
  { id: 'lieu', lib: 'Lieu', portee: 'entretien', priv: false, ordre: 1, vExport: 2, modalites: [{ id: 'ici', lib: 'Ici', mExport: 1 }] },
]
function calculer(data: ReturnType<typeof sourceMoteurSynthese>) {
  const filtres = filtresSyntheseParDefaut()
  filtres.themes = { mode: 'choix', ids: ['theme'] }
  filtres.inclureEnqueteurs = true
  return calculerExtraitsSynthese([data], filtres, { variables, cas: {} })
}

describe('Synthèse — lecture des participations natives', () => {
  test('ne confond pas l’id stable, l’index du texte et l’identité corpus', () => {
    const lecture = preparer()
    const avant = structuredClone(lecture.data)
    const source = sourceMoteurSynthese('entretien-a', reference, lecture, 0)
    expect(source.tours.map((tour) => [tour.participationIndex, tour.participationId, tour.locuteurId])).toEqual([
      [7, 'participation-stable-a', 'identite-commune-a'], [11, 'participation-stable-b', null], [null, null, null],
    ])
    const resultat = calculer(source)
    expect(resultat.filter((e) => e.participationIds.length).map((e) => e.participationIds))
      .toEqual([['participation-stable-a'], ['participation-stable-b']])
    expect(resultat.find((e) => e.participationIds.includes('participation-stable-a'))!.locuteurIds)
      .toEqual(['identite-commune-a'])
    expect(lecture.data).toEqual(avant)
  })

  test('un changement cohérent d’index garde les références stables et les mêmes passages', () => {
    const initial = preparer()
    const modifie = structuredClone(initial.data)
    modifie.participations[0].index = 99
    const texte = modifie.corpsTexte as { content: { attrs: { loc: number | null } }[] }
    texte.content[0].attrs.loc = 99
    const sourceAvant = sourceMoteurSynthese('entretien-a', reference, initial, 0)
    const sourceApres = sourceMoteurSynthese('entretien-a', reference, preparer(modifie), 0)
    expect(calculer(sourceApres)).toEqual(calculer(sourceAvant))
  })

  test('un instantané sans id local ne fabrique pas de référence depuis l’index', () => {
    const initial = preparer()
    const source = { ...initial, data: { ...initial.data,
      participations: initial.data.participations.map((p) => ({ ...p, id: undefined })),
    } }
    const avant = structuredClone(source.data)
    const projection = sourceMoteurSynthese('entretien-a', reference, source, 0)
    expect(projection.tours.every((tour) => tour.participationId === null)).toBe(true)
    expect(calculer(projection).every((e) => e.participationIds.length === 0)).toBe(true)
    expect(calculer(projection).map((e) => [e.from, e.to]))
      .toEqual(calculer(sourceMoteurSynthese('entretien-a', reference, initial, 0)).map((e) => [e.from, e.to]))
    expect(source.data).toEqual(avant)
  })

  test('les diagnostics de valeurs respectent la portée participation sans déplacer les valeurs', () => {
    const source = preparer()
    const avant = structuredClone(source.data)
    expect(diagnosticsValeursSynthese(source, variables)).toEqual([])
    const mauvaisesPortees = variables.map((v) => v.id === 'age' ? { ...v, portee: 'entretien' as const } : v)
    expect(diagnosticsValeursSynthese(source, mauvaisesPortees)).toEqual(['Âge (Nom local A)'])
    expect(source.data).toEqual(avant)
  })
})
