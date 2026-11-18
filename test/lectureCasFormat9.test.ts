import { afterEach, describe, expect, test, vi } from 'vitest'
import { lireCasFormat9, lireCorpusCasFormat9, lireDerivationFormat9, lireEntretienCasFormat9, lireFamilleCasFormat9 } from '../src/shared/natif/lectureCasFormat9'
import { preparerSourcesPassages } from '../src/renderer/editor/passages'
import { projeterCasDepuisSourcesPreparees } from '../src/renderer/editor/casFormat9'
import { corpusFamille, casModalite, familleCas, sourceFamille, dateFamille } from './fixtures/casFamilles'
import type { Cas } from '../src/shared/corpus/cas'

afterEach(() => vi.restoreAllMocks())

describe('raccord de lecture des cas au format actif', () => {
  test('traduit les responsabilités sans rapprocher les noms ni changer les ids, valeurs ou recettes', () => {
    const corpus = corpusFamille()
    corpus.personnes.p = { id: 'p', nom: 'Même nom' }
    corpus.personnes.autre = { id: 'autre', nom: 'Même nom' }
    const cas: Cas = { id: 'cas', nom: 'Cas', memo: 'Mémo', creeLe: dateFamille, modifieLe: dateFamille,
      regles: [
        { type: 'personne', personneId: 'p', inclureEnqueteurs: false },
        { type: 'personnes', membres: [{ personneId: 'autre', inclureEnqueteurs: true }] },
        { type: 'modalite', variableId: 'v', modaliteId: 'a', portee: 'locuteur', inclureEnqueteurs: false },
      ], rattachements: [], derivationsPropres: [{ attributId: 'attr', variableSourceId: 'v', porteeSource: 'locuteur' }] }
    const famille = familleCas()
    famille.derivationsAttributs = [{ attributId: 'attr', variableSourceId: 'v', porteeSource: 'locuteur' }]
    corpus.cas = { cas }
    corpus.famillesCas = { f: famille }
    const entretien = sourceFamille()
    entretien.locuteurs[1].id = 'loc-historique'
    entretien.locuteurs[2].personneDeliee = true
    entretien.locuteurs[2].rapprochementsRefuses = ['personne:p', 'locuteur:loc-historique']
    const avant = structuredClone([corpus, entretien])
    const cible = lireCorpusCasFormat9(corpus)
    expect(cible.locuteurs).toEqual(corpus.personnes)
    expect(Object.keys(cible.locuteurs)).toHaveLength(2)
    expect(cible.variables.v.portee).toBe('participation')
    expect(lireCasFormat9(cas).regles).toEqual([
      { type: 'locuteur', locuteurId: 'p', inclureEnqueteurs: false },
      { type: 'locuteurs', membres: [{ locuteurId: 'autre', inclureEnqueteurs: true }] },
      { type: 'modalite', variableId: 'v', modaliteId: 'a', portee: 'participation', inclureEnqueteurs: false },
    ])
    expect(lireFamilleCasFormat9(famille).derivationsAttributs![0].porteeSource).toBe('participation')
    expect(lireDerivationFormat9(cas.derivationsPropres![0]).variableSourceId).toBe('v')
    const lecture = lireEntretienCasFormat9(entretien)
    expect(lecture.participations[1].id).toBe('loc-historique')
    expect(lecture.participations[0].id).toBeUndefined()
    expect(lecture.participations[2].locuteurRef).toBeNull()
    expect(lecture.participations.map((p) => p.valeursLoc)).toEqual(entretien.locuteurs.map((p) => p.valeursLoc))
    expect(cible).not.toHaveProperty('formatVersion')
    expect([corpus, entretien]).toEqual(avant)
  })

  test('la projection réutilise les documents déjà parsés, sans relire ou réécrire leurs sources', () => {
    const corpus = corpusFamille()
    delete corpus.membership.e2
    const data = sourceFamille()
    const preparees = preparerSourcesPassages(new Map([['e1', { ok: true as const, data }]]))
    const doc = preparees.get('e1')
    if (!doc?.ok) throw new Error('Source de test invalide')
    const avant = structuredClone(data)
    const parser = vi.spyOn(doc.doc.type.schema, 'nodeFromJSON')
    const vue = projeterCasDepuisSourcesPreparees(corpus, casModalite('a'), preparees)
    expect(parser).not.toHaveBeenCalled()
    expect(vue.observationsModalite.membres).toBe(3)
    expect(vue.diagnosticsRegles).toEqual([])
    expect(preparees.get('e1')).toBe(doc)
    expect(data).toEqual(avant)
  })
})
