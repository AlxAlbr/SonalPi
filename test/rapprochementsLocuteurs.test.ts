import { describe, expect, test } from 'vitest'
import {
  analyserRapprochementLocuteur, annulerRefusRapprochementLocuteurs, cleNomLocuteur, cleRefusRapprochement,
  natureNomLocuteur, peutCreerLocuteurAuNommage, rapprochementLocuteursRefuse, refuserRapprochementLocuteurs,
  reprendreDonneesParticipation, suggestionsExactesLocuteurs, suggestionsLocuteurs, type CandidatRapprochementLocuteur,
} from '../src/shared/corpus/rapprochementsLocuteurs'
import { entretienCasNatif } from './fixtures/casNatifs'

function candidat(entretienId: string, id = 'local', nom = 'Marie Dupont', locuteurRef: string | null = null): CandidatRapprochementLocuteur {
  return { entretienId, participation: { id, nom, locuteurRef } }
}

describe('rapprochements des identités et participations', () => {
  test('conserve les critères de noms, de rôles et de variantes proches', () => {
    expect(cleNomLocuteur('  Émilie—D’Arc. ')).toBe('emilie d arc')
    expect(natureNomLocuteur('Enquêteur')).toBe('role')
    expect(natureNomLocuteur('Speaker 2')).toBe('ignore')
    expect(analyserRapprochementLocuteur('Marie Dupont', 'Maria Dupont')?.raison).toBe('une-lettre')
    expect(analyserRapprochementLocuteur('Dupont Marie', 'Marie Dupont')?.raison).toBe('memes-mots')
    expect(analyserRapprochementLocuteur('Marie', 'Maria')).toBeNull()
    expect(analyserRapprochementLocuteur('Interviewer', 'Enquêteur')?.raison).toBe('meme-role')
  })

  test('calcule des suggestions sans réunir des homonymes ni modifier les données', () => {
    const source = candidat('source')
    const proche = candidat('e1', 'p1', 'Maria Dupont')
    const exacte = candidat('e2', 'p2')
    const avant = structuredClone([source, proche, exacte])
    expect(suggestionsLocuteurs(source, [proche, exacte])).toEqual([exacte, proche])
    expect(suggestionsExactesLocuteurs(source, [proche, exacte])).toEqual([exacte])
    expect([source, proche, exacte]).toEqual(avant)
  })

  test('deux ids locaux identiques restent deux candidats dans des entretiens différents', () => {
    const source = candidat('source')
    const a = candidat('e1'), b = candidat('e2')
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([a, b])
  })

  test('un refus local reste contextualisé et sa révocation ne touche pas son homonyme', () => {
    const source = candidat('source'), a = candidat('e1'), b = candidat('e2')
    refuserRapprochementLocuteurs(source.participation, a)
    refuserRapprochementLocuteurs(source.participation, a)
    expect(source.participation.rapprochementsRefuses).toEqual([{ type: 'participation', entretienId: 'e1', participationId: 'local' }])
    expect(rapprochementLocuteursRefuse(source, a)).toBe(true)
    expect(rapprochementLocuteursRefuse(a, source)).toBe(true)
    expect(rapprochementLocuteursRefuse(source, b)).toBe(false)
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([b])
    annulerRefusRapprochementLocuteurs(source.participation, { type: 'participation', entretienId: 'e2', participationId: 'local' })
    expect(rapprochementLocuteursRefuse(source, a)).toBe(true)
    annulerRefusRapprochementLocuteurs(source.participation, { participationId: 'local', type: 'participation', entretienId: 'e1' })
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([a, b])
  })

  test('les refus de même chaîne distinguent identité corpus et participation locale', () => {
    const source = candidat('source'), local = candidat('e1'), commun = candidat('e2', 'autre', 'Marie Dupont', 'local')
    refuserRapprochementLocuteurs(source.participation, local)
    refuserRapprochementLocuteurs(source.participation, commun)
    expect(new Set(source.participation.rapprochementsRefuses!.map(cleRefusRapprochement)).size).toBe(2)
    annulerRefusRapprochementLocuteurs(source.participation, { type: 'locuteur', locuteurId: 'local' })
    expect(rapprochementLocuteursRefuse(source, commun)).toBe(false)
    expect(rapprochementLocuteursRefuse(source, local)).toBe(true)
  })

  test('privilégie une référence corpus existante et respecte le refus pour tous ses membres', () => {
    const source = candidat('source'), a = candidat('e1', 'a', 'Marie Dupont', 'groupe'), b = candidat('e2', 'b', 'Marie Dupont', 'groupe')
    refuserRapprochementLocuteurs(source.participation, a)
    expect(source.participation.rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'groupe' }])
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([])
    expect(rapprochementLocuteursRefuse(source, b)).toBe(true)
  })

  test('un refus envers un membre empêche de contourner la décision par un autre membre', () => {
    const source = candidat('source'), a = candidat('e1', 'a', 'Marie Dupont', 'groupe'), b = candidat('e2', 'b', 'Marie Dupont', 'groupe')
    source.participation.rapprochementsRefuses = [{ type: 'participation', entretienId: 'e2', participationId: 'b' }]
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([])
    source.participation.rapprochementsRefuses = []
    b.participation.rapprochementsRefuses = [{ type: 'participation', entretienId: 'source', participationId: 'local' }]
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([])
  })

  test('retient la meilleure graphie pour une identité représentée plusieurs fois', () => {
    const source = candidat('source')
    const proche = candidat('e1', 'a', 'Maria Dupont', 'groupe'), exacte = candidat('e2', 'b', 'Marie Dupont', 'groupe')
    expect(suggestionsLocuteurs(source, [proche, exacte])).toEqual([exacte])
  })

  test('écarte une identité déjà représentée dans l’entretien et les associations existantes', () => {
    const source = candidat('source'), a = candidat('e1', 'a', 'Marie Dupont', 'groupe')
    const local = candidat('source', 'autre-local', 'Autre étiquette', 'groupe')
    expect(suggestionsLocuteurs(source, [a, local])).toEqual([])
    source.participation.locuteurRef = 'groupe'
    expect(suggestionsLocuteurs(source, [a])).toEqual([])
    expect(suggestionsLocuteurs(candidat('e1'), [a])).toEqual([])
  })

  test('ne crée pas une référence locale sans id stable ou sans entretien', () => {
    const source = candidat('source'), cible = candidat('e1')
    delete cible.participation.id
    expect(() => refuserRapprochementLocuteurs(source.participation, cible)).toThrow('identifiant stable')
    expect(() => refuserRapprochementLocuteurs(source.participation, candidat(''))).toThrow('entretien')
    expect(source.participation.rapprochementsRefuses).toBeUndefined()
  })

  test('conserve le traitement historique du nommage, sans réassocier un retrait volontaire', () => {
    const participation = { nom: 'Marie', locuteurRef: null, associationRetiree: true }
    expect(peutCreerLocuteurAuNommage(participation)).toBe(false)
    expect(peutCreerLocuteurAuNommage({ ...participation, associationRetiree: false })).toBe(true)
    expect(peutCreerLocuteurAuNommage({ ...participation, associationRetiree: false, nom: 'Enquêteur' })).toBe(false)
  })

  test('la reprise de données ne touche ni les références, ni les notes, ni les paragraphes', () => {
    const cible = entretienCasNatif(), source = entretienCasNatif()
    source.participations[0].pseudo = 'Autre pseudo'
    source.participations[0].interviewer = true
    source.participations[0].valeursLoc.age = 'jeune'
    const avant = structuredClone(cible), avantSource = structuredClone(source)
    reprendreDonneesParticipation(cible.participations[0], source.participations[0], { variables: ['age'] })
    expect(cible).toEqual(avant)
    reprendreDonneesParticipation(cible.participations[0], source.participations[0], {
      variables: ['age'], pseudo: true, interviewer: true, remplacer: true,
    })
    expect(cible).toEqual({ ...avant, participations: [{ ...avant.participations[0],
      pseudo: 'Autre pseudo', interviewer: true, valeursLoc: { ...avant.participations[0].valeursLoc, age: 'jeune' },
    }] })
    expect(source).toEqual(avantSource)
  })
})
