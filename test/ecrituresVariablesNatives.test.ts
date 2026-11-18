import { describe, expect, test, vi } from 'vitest'
import {
  ajouterVariable, modifierVariable, retirerVariable, ajouterModalite, modifierModalite, retirerModalite,
  validerCreationVariable, validerPatchVariable,
} from '../src/shared/corpus/variables'
import * as format9 from '../src/shared/corpus/variablesFormat9'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { compterUsagesCasVariable } from '../src/shared/corpus/cas'
import {
  compterUsagesVariable, compterUsagesModalite, compterValeursVariable, effacerValeursVariable, poserValeur, validerCibleValeur, validerLotValeur,
} from '../src/shared/corpus/valeursVariables'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { casNatif, corpusCasNatif, dateCasNatif, entretienCasNatif } from './fixtures/casNatifs'

function dependances() {
  const corpus = corpusCasNatif()
  const cas = casNatif()
  cas.regles = [{ type: 'modalite', variableId: 'groupe', modaliteId: 'a', portee: 'participation', inclureEnqueteurs: false }]
  cas.derivationsPropres = [{ attributId: 'attr-age', variableSourceId: 'age', porteeSource: 'participation' }]
  corpus.cas = { cas }
  corpus.famillesCas = { famille: { id: 'famille', nom: 'Famille', creeLe: dateCasNatif,
    origine: { variableId: 'groupe', portee: 'participation', inclureEnqueteurs: false },
    derivationsAttributs: [{ attributId: 'attr-age', variableSourceId: 'age', porteeSource: 'participation' }],
  } }
  return corpus
}

describe('écriture des définitions de variables natives', () => {
  test('crée une portée participation et conserve les codes numériques des modalités', () => {
    const corpus = corpusCasNatif(), entretien = entretienCasNatif(), avant = structuredClone(entretien)
    expect(ajouterVariable(corpus, 'Niveau', 'participation', () => 'nouvelle')).toBe('nouvelle')
    expect(corpus.variables.nouvelle).toEqual({ id: 'nouvelle', lib: 'Niveau', portee: 'participation', priv: false,
      ordre: 3, vExport: 4, modalites: [] })
    ajouterModalite(corpus, 'nouvelle', 'A', () => 'a')
    ajouterModalite(corpus, 'nouvelle', 'B', () => 'b')
    retirerModalite(corpus, 'nouvelle', 'a')
    ajouterModalite(corpus, 'nouvelle', 'C', () => 'c')
    modifierModalite(corpus, 'nouvelle', 'b', 'B renommée')
    expect(corpus.variables.nouvelle.modalites).toEqual([{ id: 'b', lib: 'B renommée', mExport: 2 }, { id: 'c', lib: 'C', mExport: 3 }])
    modifierVariable(corpus, 'nouvelle', { lib: 'Niveau local', priv: true })
    expect(corpus.variables.nouvelle.portee).toBe('participation')
    expect(entretien).toEqual(avant)
    validerCorpusNatif(corpus)
  })

  test('les cas, familles et recettes bloquent la suppression ou le changement de portée', () => {
    const corpus = dependances(), avant = structuredClone(corpus)
    expect(compterUsagesCasVariable(corpus, 'groupe')).toBe(2)
    expect(compterUsagesCasVariable(corpus, 'age')).toBe(2)
    expect(() => retirerVariable(corpus, 'age')).toThrow('utilisée')
    expect(() => retirerVariable(corpus, 'groupe')).toThrow('utilisée')
    expect(() => modifierVariable(corpus, 'groupe', { portee: 'entretien' })).toThrow('utilisée')
    expect(() => retirerModalite(corpus, 'groupe', 'a')).toThrow('utilisée')
    expect(corpus).toEqual(avant)
    modifierVariable(corpus, 'groupe', { lib: 'Groupe renommé', priv: true })
    expect(corpus.cas).toEqual(avant.cas)
    expect(corpus.famillesCas).toEqual(avant.famillesCas)
    validerCorpusNatif(corpus)
  })

  test('une recette porte sur la variable, pas sur chaque modalité de son domaine', () => {
    const corpus = dependances()
    expect(compterUsagesCasVariable(corpus, 'age', 'adulte')).toBe(0)
    expect(() => retirerModalite(corpus, 'age', 'adulte')).not.toThrow()
    expect(corpus.variables.age.modalites.map((m) => m.id)).toEqual(['jeune'])
    expect(() => retirerVariable(corpus, 'age')).toThrow('utilisée')
  })

  test.each([{ id: 'autre' }, { modalites: [] }, { vExport: 99 }, { ordre: 0 }, { portee: 'locuteur' }, { priv: 'oui' }, { lib: undefined }])(
    'les champs non éditables ne peuvent pas remplacer une définition : %j', (patch) => {
      const corpus = corpusCasNatif(), avant = structuredClone(corpus)
      expect(() => validerPatchVariable(patch)).toThrow('invalides')
      expect(corpus).toEqual(avant)
    },
  )

  test('vérifie la portée et les collisions d’ids avant toute modification', () => {
    const corpus = corpusCasNatif(), avant = structuredClone(corpus)
    expect(() => validerCreationVariable('Libellé', 'locuteur')).toThrow('portée')
    expect(() => ajouterVariable(corpus, 'Libellé', 'participation', () => 'age')).toThrow('Identifiant')
    expect(() => ajouterModalite(corpus, 'age', 'Adulte bis', () => 'adulte')).toThrow('Identifiant')
    expect(corpus).toEqual(avant)
    const generer = vi.fn(() => 'nouvelle')
    ajouterModalite(corpus, 'absente', 'Nom', generer)
    expect(generer).not.toHaveBeenCalled()
  })

  test('le pont du stockage 9 conserve ses portées et les objets de modalités', () => {
    const corpus = squeletteCorpus()
    format9.ajouterVariable(corpus, 'Locale', 'locuteur', () => 'v')
    const variable = corpus.variables.v
    format9.ajouterModalite(corpus, 'v', 'A', () => 'a')
    format9.ajouterModalite(corpus, 'v', 'B', () => 'b')
    const modalite = variable.modalites[0]
    format9.modifierModalite(corpus, 'v', 'a', 'A renommée')
    expect(modalite.lib).toBe('A renommée')
    format9.retirerModalite(corpus, 'v', 'b')
    expect(corpus.variables.v).toBe(variable)
    expect(variable.modalites).toEqual([{ id: 'a', lib: 'A renommée', mExport: 1 }])
    format9.modifierVariable(corpus, 'v', { lib: 'Locale renommée', priv: true })
    expect(corpus.variables.v.portee).toBe('locuteur')
    expect(corpus.formatVersion).toBe(9)
    const avant = structuredClone(corpus)
    expect(() => format9.validerPatchVariableFormat9({ modalites: [] })).toThrow('invalides')
    expect(() => format9.validerCreationVariableFormat9('Nom', 'participation')).toThrow('portée')
    expect(corpus).toEqual(avant)
  })
})

describe('valeurs portées par les participations', () => {
  test('l’id stable choisit la participation, même lorsqu’il ressemble à un index', () => {
    const data = entretienCasNatif()
    data.participations.push({ ...data.participations[0], id: '7', index: 11, locuteurRef: 'autre', valeursLoc: { age: 'jeune' } })
    const avant = structuredClone(data)
    expect(poserValeur(data, { type: 'participation', participationId: '7' }, 'age', 'adulte')).toBe(true)
    expect(data).toEqual({ ...avant, participations: [avant.participations[0], { ...avant.participations[1], valeursLoc: { age: 'adulte' } }] })
    expect(poserValeur(data, { type: 'participation', participationId: '7' }, 'age', '')).toBe(true)
    expect(data.participations[1].valeursLoc).toEqual({})
    expect(data.participations[0]).toEqual(avant.participations[0])
    validerEntretienNatif(data)
  })

  test('une destination ambiguë est refusée sans modifier ses participations', () => {
    const data = entretienCasNatif()
    data.participations.push({ ...data.participations[0], index: 11, valeursLoc: { age: 'jeune' } })
    const avant = structuredClone(data)
    expect(poserValeur(data, { type: 'participation', participationId: data.participations[0].id }, 'age', 'adulte')).toBe(false)
    expect(data).toEqual(avant)
  })

  test('une destination absente ne crée ni id ni participation', () => {
    const data = entretienCasNatif(), avant = structuredClone(data)
    expect(poserValeur(data, { type: 'participation', participationId: 'inconnue' }, 'age', 'jeune')).toBe(false)
    expect(data).toEqual(avant)
  })

  test.each([
    { type: 'locuteur', index: 7 }, { type: 'participation', index: 7 },
    { type: 'participation', participationId: 'local', index: 7 }, { type: 'participation', participationId: '' },
    { type: 'entretien', participationId: 'local' },
  ])('refuse les anciennes cibles et les références mixtes : %j', (cible) => {
    expect(() => validerCibleValeur(cible)).toThrow('destination')
  })

  test.each([
    null, {}, [null], [{ entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'v' }],
    [{ entretienId: '../e1', cible: { type: 'entretien' }, idVar: 'v', idMod: 'm' }],
    [{ entretienId: '..\\e1', cible: { type: 'entretien' }, idVar: 'v', idMod: 'm' }],
    [{ entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'v', idMod: null }],
    [{ entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'v', idMod: 'm', locuteurId: 'global' }],
  ])('le lot mal formé est refusé avant toute écriture : %j', (items) => {
    expect(() => validerLotValeur(items)).toThrow('invalide')
  })

  test('un lot accepte les références stables contextuelles et l’effacement', () => {
    expect(() => validerLotValeur([
      { entretienId: 'Terrain 1', cible: { type: 'participation', participationId: '7|identifiant' }, idVar: 'v', idMod: '' },
      { entretienId: 'e2', cible: { type: 'participation', participationId: '7|identifiant' }, idVar: 'v', idMod: 'm' },
    ])).not.toThrow()
  })

  test('compte puis efface uniquement les valeurs demandées, chez tous leurs propriétaires', () => {
    const data = entretienCasNatif()
    data.meta.valeursGen.age = 'adulte'
    data.participations.push({ ...data.participations[0], id: 'silencieuse', index: 11, locuteurRef: 'autre', interviewer: true, valeursLoc: { age: 'jeune' } })
    const avant = structuredClone(data)
    expect(compterUsagesVariable([data], 'age')).toBe(3)
    expect(compterUsagesModalite([data], 'age', 'adulte')).toBe(2)
    expect(effacerValeursVariable(data, 'age', 'adulte')).toBe(2)
    expect(compterValeursVariable(data, 'age')).toBe(1)
    expect(data.participations[1]).toEqual(avant.participations[1])
    expect(data.participations[0].valeursLoc.groupe).toBe('a')
    expect(data.notes).toEqual(avant.notes)
    expect(data.corpsTexte).toEqual(avant.corpsTexte)
    expect(effacerValeursVariable(data, 'age')).toBe(1)
    expect(data.participations.map((p) => p.id)).toEqual(avant.participations.map((p) => p.id))
  })

  test('les clés opaques ne comptent pas les propriétés héritées comme des valeurs', () => {
    const data = entretienCasNatif()
    expect(compterValeursVariable(data, 'constructor')).toBe(0)
    poserValeur(data, { type: 'entretien' }, 'constructor', 'valeur')
    expect(compterValeursVariable(data, 'constructor')).toBe(1)
    expect(data.meta.valeursGen.constructor).toBe('valeur')
  })
})
