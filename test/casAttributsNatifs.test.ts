import { describe, expect, test } from 'vitest'
import { resoudreDerivationCas, evaluerDerivationFamille, projeterAttributsCas, variablesDisponiblesFamille, type LectureSourceAttributs } from '../src/shared/corpus/observationsAttributs'
import type { DerivationAttributCas, FamilleCas } from '../src/shared/natif/format'
import { corpusCasNatif, entretienCasNatif, casNatif, dateCasNatif, idParticipationNative } from './fixtures/casNatifs'

const recette: DerivationAttributCas = { attributId: 'attr-age', variableSourceId: 'age', porteeSource: 'participation' }

describe('attributs de cas — propriétaires et recettes natives', () => {
  test('les règles dédupliquent les propriétaires sans mélanger id et index ni déplacer les valeurs', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    const cas = casNatif()
    cas.regles.push({ type: 'modalite', variableId: 'groupe', modaliteId: 'a', portee: 'participation', inclureEnqueteurs: false })
    cas.rattachements.push({ id: 'manuel', source: { entretienId: 'e1', repereId: 'repere' }, provenance: 'manuel', creeLe: dateCasNatif })
    const avant = structuredClone([corpus, entretien, cas])
    const diagnostic = resoudreDerivationCas(corpus, cas, recette, new Map([['e1', { ok: true, data: entretien }]]))
    expect(diagnostic).toMatchObject({ statut: 'coherent', valeur: 'adulte', valeurLibelle: 'Adulte' })
    expect(diagnostic.observations).toEqual([{ entretienId: 'e1', participationIndex: 7, participationId: idParticipationNative,
      valeur: 'adulte', invalide: false, sourceIllisible: false }])
    expect([corpus, entretien, cas]).toEqual(avant)
  })

  test('un membre sans intervention conserve sa valeur et peut rendre une recette incohérente', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    entretien.participations.push({ id: 'silencieux', index: 12, nom: 'Sans intervention', locuteurRef: 'autre',
      valeursLoc: { groupe: 'a', age: 'jeune' } })
    const cas = casNatif()
    cas.regles = [{ type: 'modalite', variableId: 'groupe', modaliteId: 'a', portee: 'participation', inclureEnqueteurs: false }]
    const diagnostic = resoudreDerivationCas(corpus, cas, recette, new Map([['e1', { ok: true, data: entretien }]]))
    expect(diagnostic.statut).toBe('incoherent')
    expect(diagnostic.observations.map((o) => [o.participationId, o.valeur])).toEqual([[idParticipationNative, 'adulte'], ['silencieux', 'jeune']])
  })

  test('distingue une valeur absente, une modalité disparue et une source indisponible', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    const lectures = new Map<string, LectureSourceAttributs>([['e1', { ok: true, data: entretien }]])
    delete entretien.participations[0].valeursLoc.age
    expect(resoudreDerivationCas(corpus, casNatif(), recette, lectures).statut).toBe('absent')
    entretien.participations[0].valeursLoc.age = 'modalite-disparue'
    const invalide = resoudreDerivationCas(corpus, casNatif(), recette, lectures)
    expect(invalide.statut).toBe('non-verifiable')
    expect(invalide.observations[0].invalide).toBe(true)
    lectures.set('e1', { ok: false, raison: 'Source indisponible' })
    const indisponible = resoudreDerivationCas(corpus, casNatif(), recette, lectures)
    expect(indisponible.statut).toBe('non-verifiable')
    expect(indisponible.observations).toEqual([{ entretienId: 'e1', participationIndex: null, participationId: null,
      valeur: null, invalide: false, sourceIllisible: true }])
    expect(corpus.locuteurs).toHaveProperty('personne-conservee')
  })

  test('un conflit suspend toute la famille, puis la correction réactive les mêmes recettes', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    entretien.participations.push(
      { id: 'conflit-a', index: 11, nom: 'Autre membre A', locuteurRef: 'autre', valeursLoc: { groupe: 'a', age: 'jeune' } },
      { id: 'membre-b', index: 15, nom: 'Membre B', locuteurRef: null, valeursLoc: { groupe: 'b', age: 'adulte' } },
    )
    const famille: FamilleCas = { id: 'famille', nom: 'Groupes', creeLe: dateCasNatif,
      origine: { variableId: 'groupe', portee: 'participation', inclureEnqueteurs: false }, derivationsAttributs: [recette] }
    const a = { ...casNatif(), id: 'a', nom: 'A', familleId: famille.id,
      regles: [{ type: 'modalite' as const, variableId: 'groupe', modaliteId: 'a', portee: 'participation' as const, inclureEnqueteurs: false }] }
    const b = { ...a, id: 'b', nom: 'B', regles: [{ ...a.regles[0], modaliteId: 'b' }] }
    corpus.cas = { a, b }
    corpus.famillesCas = { [famille.id]: famille }
    const avant = structuredClone(corpus)
    const lectures = new Map<string, LectureSourceAttributs>([['e1', { ok: true, data: entretien }]])
    expect(evaluerDerivationFamille(corpus, famille, recette, lectures).disponible).toBe(false)
    const suspendu = projeterAttributsCas(corpus, b, lectures)[0]
    expect(suspendu.diagnostic?.statut).toBe('coherent')
    expect(suspendu.diagnostic?.valeur).toBeNull()
    expect(suspendu.diagnostic?.suspensionFamille).toBeDefined()
    const candidates = variablesDisponiblesFamille(corpus, famille, lectures)
    expect(candidates.every((c) => c.variable.portee === 'participation')).toBe(true)
    expect(candidates.find((c) => c.variable.id === 'age')?.disponible).toBe(false)
    entretien.participations[1].valeursLoc.age = 'adulte'
    expect(evaluerDerivationFamille(corpus, famille, recette, lectures).disponible).toBe(true)
    const reactive = projeterAttributsCas(corpus, b, lectures)[0]
    expect(reactive.diagnostic?.valeur).toBe('adulte')
    expect(reactive.diagnostic?.suspensionFamille).toBeUndefined()
    expect(corpus).toEqual(avant)
  })
})
