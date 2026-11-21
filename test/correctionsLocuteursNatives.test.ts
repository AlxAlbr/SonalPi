import { describe, expect, test, vi } from 'vitest'
import { appliquerCorrectionLocuteurs } from '../src/shared/corpus/correctionsLocuteurs'
import { creerLocuteur } from '../src/shared/corpus/identitesLocuteurs'
import { suggestionsLocuteurs } from '../src/shared/corpus/rapprochementsLocuteurs'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { casNatif, corpusCasNatif, dateCasNatif, entretienCasNatif, idParticipationNative } from './fixtures/casNatifs'

function preparer() {
  const corpus = corpusCasNatif()
  corpus.locuteurs = {}
  const entretiens = ['Jean Martin', 'J. Martin', 'Monsieur Martin', 'Indépendant'].map((nom, i) => {
    const id = `e${i + 1}`, locuteurId = `p${i + 1}`
    creerLocuteur(corpus, locuteurId, nom)
    corpus.membership[id] = { titre: id, date: null, lastModified: dateCasNatif }
    const data = entretienCasNatif()
    Object.assign(data.participations[0], { nom, locuteurRef: locuteurId, interviewer: i === 1, couleur: '#123456' })
    return { id, titre: id, data }
  })
  entretiens[0].data.participations[0].rapprochementsRefuses = [{ type: 'participation', entretienId: 'e4', participationId: idParticipationNative }]
  const cas = casNatif()
  cas.regles = [{ type: 'locuteurs', membres: ['p1', 'p2', 'p3'].map((locuteurId, i) => ({ locuteurId, inclureEnqueteurs: i === 1 })) }]
  corpus.cas = { cas }
  let numero = 0
  const generer = vi.fn(() => `nouvelle-${++numero}`)
  const regrouper = (uniformiserNoms = false) => appliquerCorrectionLocuteurs(corpus, entretiens, {
    type: 'regrouperSelection', locuteurIds: ['p1', 'p2', 'p3'], conserverId: 'p1', nom: 'Jean Martin', uniformiserNoms, attendu: 'instantane',
  }, generer)
  const verifier = () => {
    validerCorpusNatif(corpus)
    for (const e of entretiens) validerEntretienNatif(e.data)
  }
  return { corpus, entretiens, generer, regrouper, verifier }
}

describe('corrections de haut niveau sur le modèle natif', () => {
  test.each([false, true])('réunit trois identités avec harmonisation des noms = %s', (uniformiser) => {
    const b = preparer(), avant = structuredClone(b.entretiens)
    expect(b.regrouper(uniformiser)).toBe('p1')
    expect(Object.keys(b.corpus.locuteurs)).toEqual(['p1', 'p4'])
    expect(b.corpus.cas!.cas.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: 'p1', inclureEnqueteurs: true }] }])
    for (const [i, e] of b.entretiens.entries()) {
      const ancien = avant[i].data
      expect(e.data).toEqual({ ...ancien, participations: [{ ...ancien.participations[0],
        locuteurRef: i < 3 ? 'p1' : 'p4', nom: uniformiser && i < 3 ? 'Jean Martin' : ancien.participations[0].nom,
      }] })
    }
    expect(b.generer).not.toHaveBeenCalled()
    b.verifier()
  })

  test('le renommage global ne change que le nom commun et ses étiquettes locales', () => {
    const b = preparer()
    b.regrouper()
    const avant = structuredClone(b.entretiens), avantCas = structuredClone(b.corpus.cas)
    appliquerCorrectionLocuteurs(b.corpus, b.entretiens, { type: 'renommerGlobal', locuteurId: 'p1', nom: ' Jean Dupont ', attendu: 'instantane' }, b.generer)
    expect(b.corpus.locuteurs.p1.nom).toBe('Jean Dupont')
    for (const [i, e] of b.entretiens.entries()) {
      const ancien = avant[i].data
      expect(e.data).toEqual({ ...ancien, participations: [{ ...ancien.participations[0], nom: i < 3 ? 'Jean Dupont' : ancien.participations[0].nom }] })
    }
    expect(b.corpus.cas).toEqual(avantCas)
    b.verifier()
  })

  test('dissocie deux participations de même id local et conserve notes, cas et refus contextualisés', () => {
    const b = preparer()
    b.regrouper(true)
    const avant = structuredClone(b.entretiens), avantCas = structuredClone(b.corpus.cas)
    appliquerCorrectionLocuteurs(b.corpus, b.entretiens, {
      type: 'dissocierSelection', locuteurId: 'p1', attendu: 'instantane',
      participations: [{ entretienId: 'e2', participationId: idParticipationNative }, { entretienId: 'e3', participationId: idParticipationNative }],
    }, b.generer)
    const refs = b.entretiens.map((e) => e.data.participations[0].locuteurRef)
    expect(refs).toEqual(['p1', 'nouvelle-1', 'nouvelle-2', 'p4'])
    expect(b.generer).toHaveBeenCalledTimes(2)
    expect(b.corpus.cas).toEqual(avantCas)
    for (const [i, e] of b.entretiens.entries()) {
      const { rapprochementsRefuses: _refus, ...participation } = e.data.participations[0]
      const { rapprochementsRefuses: _anciens, ...ancienne } = avant[i].data.participations[0]
      expect({ ...e.data, participations: [participation] }).toEqual({ ...avant[i].data, participations: [{ ...ancienne, locuteurRef: refs[i] }] })
    }
    expect(b.entretiens[0].data.participations[0].rapprochementsRefuses).toContainEqual({
      type: 'participation', entretienId: 'e4', participationId: idParticipationNative,
    })
    const candidats = b.entretiens.slice(0, 3).map((e) => ({ entretienId: e.id, participation: e.data.participations[0] }))
    for (const candidat of candidats) expect(suggestionsLocuteurs(candidat, candidats)).toEqual([])
    b.verifier()
  })

  test('vérifie toute la sélection de regroupement avant de réunir la première paire', () => {
    const b = preparer()
    b.entretiens[0].data.participations.push({ id: 'autre-local', index: 12, nom: 'Autre', locuteurRef: 'p3', valeursLoc: {} })
    const avant = structuredClone([b.corpus, b.entretiens])
    expect(() => b.regrouper()).toThrow('Réunion impossible')
    expect([b.corpus, b.entretiens]).toEqual(avant)
  })

  test('vérifie tous les ids à créer avant de toucher aux identités ou aux participations', () => {
    const b = preparer()
    b.regrouper()
    const avant = structuredClone([b.corpus, b.entretiens])
    expect(() => appliquerCorrectionLocuteurs(b.corpus, b.entretiens, {
      type: 'dissocierSelection', locuteurId: 'p1', attendu: 'instantane', participations: [
        { entretienId: 'e2', participationId: idParticipationNative }, { entretienId: 'e3', participationId: idParticipationNative },
      ],
    }, () => 'doublon')).toThrow('identifiant')
    expect([b.corpus, b.entretiens]).toEqual(avant)
  })
})
