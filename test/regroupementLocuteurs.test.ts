import { describe, expect, test, vi } from 'vitest'
import { regrouperLocuteurs, creerLocuteur } from '../src/shared/corpus/identitesLocuteurs'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { projeterCas, type SourceCasChargee } from '../src/renderer/editor/cas'
import { casNatif, corpusCasNatif, dateCasNatif, entretienCasNatif, idLocuteurNatif, idParticipationNative } from './fixtures/casNatifs'

function preparer() {
  const corpus = corpusCasNatif()
  creerLocuteur(corpus, 'tiers', 'Autre identité')
  const entretiens = ['e1', 'e2', 'e3'].map((id, i) => {
    const data = entretienCasNatif()
    data.participations[0].locuteurRef = [idLocuteurNatif, 'autre', 'tiers'][i]
    data.participations[0].nom = `Étiquette locale ${i + 1}`
    data.participations[0].interviewer = i === 1
    data.participations[0].couleur = '#123456'
    corpus.membership[id] = { titre: id, date: null, lastModified: dateCasNatif }
    return { id, titre: id, data }
  })
  const cas = casNatif()
  cas.regles = [
    { type: 'locuteur', locuteurId: idLocuteurNatif, inclureEnqueteurs: false },
    { type: 'locuteurs', membres: [{ locuteurId: 'autre', inclureEnqueteurs: true }, { locuteurId: 'tiers', inclureEnqueteurs: false }] },
  ]
  cas.rattachements = [{ id: 'manuel', source: { entretienId: 'e1', repereId: 'repere' }, provenance: 'manuel', creeLe: dateCasNatif }]
  cas.derivationsPropres = [{ attributId: 'attr-age', variableSourceId: 'age', porteeSource: 'participation' }]
  corpus.cas = { cas, intact: { ...casNatif(), id: 'intact', regles: [{ type: 'entretiens', entretienIds: ['e2'] }] } }
  const sources = new Map<string, SourceCasChargee>(entretiens.map((e) => [e.id, { ok: true, data: e.data }]))
  return { corpus, entretiens, cas, sources }
}

describe('regroupement des locuteurs', () => {
  test('réunit les références et les règles de cas sans transférer les données locales', () => {
    const b = preparer(), avant = structuredClone(b)
    const date = '2026-02-01T10:00:00.000Z'
    const maintenant = vi.fn(() => date)
    regrouperLocuteurs(b.corpus, b.entretiens, idLocuteurNatif, 'autre', maintenant)
    expect(b.corpus.locuteurs.autre).toBeUndefined()
    expect(b.corpus.locuteurs[idLocuteurNatif]).toEqual(avant.corpus.locuteurs[idLocuteurNatif])
    expect(b.cas).toEqual({ ...avant.cas, modifieLe: date, regles: [
      { type: 'locuteurs', membres: [{ locuteurId: idLocuteurNatif, inclureEnqueteurs: true }, { locuteurId: 'tiers', inclureEnqueteurs: false }] },
    ] })
    expect(b.corpus.cas!.intact).toEqual(avant.corpus.cas!.intact)
    for (const [i, e] of b.entretiens.entries()) {
      const ancien = avant.entretiens[i].data
      expect(e.data).toEqual({ ...ancien, participations: [{ ...ancien.participations[0], locuteurRef: i < 2 ? idLocuteurNatif : 'tiers' }] })
      validerEntretienNatif(e.data)
    }
    expect(maintenant).toHaveBeenCalledTimes(1)
    validerCorpusNatif(b.corpus)
  })

  test('conserve les plages de l’union et les ajouts manuels du cas', () => {
    const b = preparer()
    const plages = () => projeterCas(b.corpus, b.cas, b.sources, 'original').passages
      .map((p) => JSON.stringify([p.titreEntretien, p.from, p.to, p.texte])).sort()
    const avant = plages()
    regrouperLocuteurs(b.corpus, b.entretiens, idLocuteurNatif, 'autre')
    expect(plages()).toEqual(avant)
    expect(b.cas.rattachements).toHaveLength(1)
  })

  test('réconcilie les refus avec leur contexte sans confondre les ids locaux identiques', () => {
    const b = preparer()
    const [a, absorbee, externe] = b.entretiens.map((e) => e.data.participations[0])
    a.rapprochementsRefuses = [
      { type: 'locuteur', locuteurId: 'autre' },
      { type: 'participation', entretienId: 'e2', participationId: idParticipationNative },
      { type: 'participation', entretienId: 'e3', participationId: idParticipationNative },
    ]
    absorbee.rapprochementsRefuses = [{ type: 'locuteur', locuteurId: idLocuteurNatif }]
    externe.rapprochementsRefuses = [
      { type: 'locuteur', locuteurId: 'autre' }, { type: 'locuteur', locuteurId: idLocuteurNatif },
      { type: 'participation', entretienId: 'e2', participationId: idParticipationNative },
    ]
    regrouperLocuteurs(b.corpus, b.entretiens, idLocuteurNatif, 'autre')
    expect(a.rapprochementsRefuses).toEqual([{ type: 'participation', entretienId: 'e3', participationId: idParticipationNative }])
    expect(absorbee.rapprochementsRefuses).toEqual([])
    expect(externe.rapprochementsRefuses).toEqual([
      { type: 'locuteur', locuteurId: idLocuteurNatif },
      { type: 'participation', entretienId: 'e2', participationId: idParticipationNative },
    ])
    for (const e of b.entretiens) validerEntretienNatif(e.data)
  })

  test('deux participations du même entretien bloquent tout le regroupement', () => {
    const b = preparer()
    b.entretiens[0].data.participations.push({ id: 'autre-local', index: 12, nom: 'Autre', locuteurRef: 'autre', valeursLoc: {} })
    const avant = structuredClone(b)
    const maintenant = vi.fn(() => dateCasNatif)
    expect(() => regrouperLocuteurs(b.corpus, b.entretiens, idLocuteurNatif, 'autre', maintenant)).toThrow('e1')
    expect(b).toEqual(avant)
    expect(maintenant).not.toHaveBeenCalled()
  })

  test.each([[idLocuteurNatif, idLocuteurNatif], ['absent', 'autre'], [idLocuteurNatif, 'absent']])('refuse des identités invalides : %s / %s', (a, b) => {
    const donnees = preparer(), avant = structuredClone(donnees)
    expect(() => regrouperLocuteurs(donnees.corpus, donnees.entretiens, a, b)).toThrow('distincts existants')
    expect(donnees).toEqual(avant)
  })
})
