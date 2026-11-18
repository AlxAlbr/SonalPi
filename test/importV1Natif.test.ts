// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { completerIdsLocuteurs } from '../src/main/corpusStore'
import { importerFichier } from '../src/renderer/formatSonal/sas'
import { analyserCrp, mapperDefinitions, mapperParamsAnon, mapperTabAnon } from '../src/shared/corpus/migrationCrp'
import { preparerCorpusImportV1, preparerEntretienImportV1 } from '../src/shared/natif/importV1'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import type { PayloadEntretien } from '../src/shared/format'

const parseur = (html: string) => new DOMParser().parseFromString(html
  .replace(/<link\b[^>]*>/gi, '').replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ''), 'text/html')
const date = '2026-01-01T10:00:00.000Z'
function lire(nom: string) {
  return importerFichier(nom, readFileSync(join('test/fixtures', nom), 'utf8'), parseur)
}

describe('préparation privée des imports V1 au format natif cible', () => {
  test('le CRP V1 garde son nom libre et produit ses propres définitions sans thèmes ajoutés', () => {
    const contenu = readFileSync('test/fixtures/corpusV1.crp', 'utf8')
    const analyse = analyserCrp(contenu, 'Mon terrain.Sonal_Pi.crp')
    if (!analyse.ok) throw new Error(analyse.message)
    const definitions = mapperDefinitions(analyse.apercu.raw)
    let numero = 0
    const regles = mapperTabAnon(analyse.apercu.raw.tabAnon, () => `reg-${++numero}`)
    const params = mapperParamsAnon(analyse.apercu.raw.paramsAnonCorpus)
    const source = { cheminCrp: '/V1/Mon terrain.Sonal_Pi.crp', dateCreation: analyse.apercu.dateCreation }
    const avant = structuredClone({ source, definitions, regles, params })
    const corpus = preparerCorpusImportV1('Mon terrain', source, definitions.codebook, definitions.variables, regles, params)
    validerCorpusNatif(corpus)
    expect(corpus.formatVersion).toBe(10)
    expect(corpus).not.toHaveProperty('personnes')
    expect(corpus.locuteurs).toEqual({})
    expect(corpus.meta?.sourceV1).toEqual(source)
    expect(Object.keys(corpus.codebook)).toEqual(definitions.codebook.map((c) => c.id))
    for (const variable of definitions.variables) {
      const cible = corpus.variables[variable.id]
      expect(cible.portee).toBe(variable.portee === 'locuteur' ? 'participation' : 'entretien')
      const { portee: _portee, ...champs } = variable
      const { portee: _ciblePortee, ...cibleChamps } = cible
      expect(cibleChamps).toEqual(champs)
    }
    expect({ source, definitions, regles, params }).toEqual(avant)
    expect(contenu).toBe(readFileSync('test/fixtures/corpusV1.crp', 'utf8'))
  })

  test.each(['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal'])(
    '%s : conserve le contenu et les propriétaires en produisant directement les champs cibles', (nom) => {
      const conversion = lire(nom)
      const source = { ...conversion.payload, locuteurs: completerIdsLocuteurs(`ent-${nom}`, conversion.payload.locuteurs) }
      const avant = structuredClone(source)
      let numero = 0
      const preparation = preparerEntretienImportV1({}, source, date, () => `identite-${++numero}`)
      const entretien = preparation.entretien
      validerEntretienNatif(entretien)
      expect(entretien.formatVersion).toBe(10)
      expect(entretien).not.toHaveProperty('locuteurs')
      expect(entretien.lastModified).toBe(date)
      expect(preparation.locuteurs).toHaveLength(source.locuteurs.length)
      expect(new Set(entretien.participations.map((p) => p.locuteurRef)).size).toBe(source.locuteurs.length)
      expect(entretien.participations.map(({ locuteurRef: _ref, ...local }) => local))
        .toEqual(source.locuteurs.map(({ personneRef: _ref, ...local }) => local))
      expect(entretien.corpsTexte).toEqual(source.corpsTexte)
      expect(entretien.annotations).toEqual(source.annotations)
      expect(entretien.ancres).toEqual(source.ancres)
      expect(entretien.meta).toEqual(source.meta)
      expect(entretien.legacy).toEqual(source.legacy)
      expect(entretien.notes?.map(({ participationIds: _ids, ...note }) => note))
        .toEqual(source.notes?.map(({ locuteurIds: _ids, ...note }) => note))
      for (const [index, note] of (source.notes ?? []).entries()) {
        expect(entretien.notes![index].participationIds).toEqual(note.locuteurIds)
      }
      expect(source).toEqual(avant)
      expect(numero).toBe(source.locuteurs.length)
      if (entretien.participations[0]) entretien.participations[0].valeursLoc.test = 'sans effet sur la source'
      expect(source).toEqual(avant)
    },
  )

  test('conserve les index non consécutifs, les rôles et les notes locales, sans fusionner les homonymes', () => {
    const payload: PayloadEntretien = {
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 3 }, content: [{ type: 'text', text: 'Second Alex.' }] }] },
      annotations: [], ancres: [], meta: { valeursGen: {}, audioRef: null },
      locuteurs: [
        { id: 'local-conserve', index: 1, nom: 'Alex', interviewer: true, pseudo: 'Pseudo', couleur: '#123456', valeursLoc: { age: 'adulte' }, personneRef: null },
        { index: 3, nom: 'Alex', interviewer: false, valeursLoc: { age: 'jeune' }, personneRef: null },
        { index: 4, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
        { index: 7, nom: 'X', valeursLoc: {}, personneRef: null },
      ],
      notes: [{ id: 'note', categorieId: 'generale', titre: '', date: null, statut: 'prive', corps: 'Note locale',
        locuteurIds: ['local-conserve'], rang: 0, creeLe: '', modifieLe: null }],
    }
    const source = { ...payload, locuteurs: completerIdsLocuteurs('entretien', payload.locuteurs) }
    const avant = structuredClone(source)
    let numero = 0
    const a = preparerEntretienImportV1({}, source, date, () => `commun-${++numero}`)
    const existants = Object.fromEntries(a.locuteurs.map((l) => [l.id, l]))
    const b = preparerEntretienImportV1(existants, source, date, () => `commun-${++numero}`)
    expect(a.entretien.participations.map((p) => p.index)).toEqual([1, 3, 4, 7])
    expect(a.entretien.participations[0].id).toBe('local-conserve')
    expect(a.entretien.notes![0].participationIds).toEqual(['local-conserve'])
    expect(new Set([...a.locuteurs, ...b.locuteurs].map((l) => l.id)).size).toBe(8)
    expect(a.entretien.participations.map((p) => p.locuteurRef)).not.toEqual(b.entretien.participations.map((p) => p.locuteurRef))
    expect(source).toEqual(avant)
  })

  test('une importation vide ne crée ni identité ni participation fictive', () => {
    const generer = vi.fn()
    const resultat = preparerEntretienImportV1({}, {
      corpsTexte: {}, annotations: [], ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
    }, date, generer)
    expect(resultat.locuteurs).toEqual([])
    expect(resultat.entretien.participations).toEqual([])
    expect(resultat.entretien).not.toHaveProperty('notes')
    expect(generer).not.toHaveBeenCalled()
  })

  test('ne réinterprète pas une association historique en import V1', () => {
    const conversion = lire('entretien1.sonal')
    const source = { ...conversion.payload, locuteurs: completerIdsLocuteurs('entretien', conversion.payload.locuteurs) }
    expect(source.locuteurs.length).toBeGreaterThan(0)
    source.locuteurs[0].personneDeliee = true
    const avant = structuredClone(source)
    const generer = vi.fn()
    expect(() => preparerEntretienImportV1({}, source, date, generer)).toThrow('associations historiques')
    expect(source).toEqual(avant)
    expect(generer).not.toHaveBeenCalled()
  })
})
