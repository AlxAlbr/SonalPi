import { describe, expect, test } from 'vitest'
import type { ParticipationLocuteur } from '../src/shared/format'
import { analyserRapprochementLocuteur, annulerRefusRapprochementLocuteurs, cleNomLocuteur, natureNomLocuteur, refuserRapprochementLocuteurs, reprendreDonneesParticipation, scoreRapprochement, suggestionsExactesLocuteurs, suggestionsLocuteurs } from '../src/shared/corpus/rapprochementsLocuteurs'

const loc = (id: string, nom: string): ParticipationLocuteur => ({ id, nom, index: 0, locuteurRef: null, valeursLoc: {} })
const candidat = (entretienId: string, participation: ParticipationLocuteur) => ({ entretienId, participation })

describe('Rapprochements et reprise sélective', () => {
  test('normalise les noms et distingue rôles et noms d’attente', () => {
    expect(cleNomLocuteur('  Émilie—D’Arc. ')).toBe('emilie d arc')
    for (const nom of ['Interviewer', 'Intervieweur', 'Enquêteur']) expect(natureNomLocuteur(nom)).toBe('role')
    for (const nom of ['', 'A', 'Speaker 2', 'Nouveau locuteur', 'Inconnu']) expect(natureNomLocuteur(nom)).toBe('ignore')
    expect(natureNomLocuteur('Enquêteur A')).toBe('specifique')
  })

  test('calibre les noms proches sur des variantes explicables', () => {
    expect(analyserRapprochementLocuteur('Marie Dupont', 'Maria Dupont')).toMatchObject({ raison: 'une-lettre', libelle: 'une lettre différente' })
    expect(analyserRapprochementLocuteur('Dupont Marie', 'Marie Dupont')).toMatchObject({ raison: 'memes-mots', libelle: 'mêmes mots dans un ordre différent' })
    expect(scoreRapprochement('Émilie D’Arc', 'emilie-d arc')).toBe(1)
    expect(scoreRapprochement('Marie Dupont', 'Maria Dupont')).toBeLessThan(1)
    expect(scoreRapprochement('Marie Dupont', 'Maria Dupont')).toBeGreaterThan(0.9)
  })

  test('écarte les variantes trop faibles et les prénoms seuls', () => {
    for (const [a, b] of [['Marie', 'Maria'], ['Jean Dupont', 'Jean Durand'], ['Li Ma', 'Lu Ma'], ['Paul Martin', 'Pauline Martin'], ['Inconnu', 'Inconnue']]) {
      expect(analyserRapprochementLocuteur(a, b)).toBeNull()
    }
  })

  test('propose les noms proches sans les mélanger aux suggestions exactes', () => {
    const source = candidat('1', loc('a', 'Marie Dupont')), proche = candidat('2', loc('b', 'Maria Dupont'))
    expect(suggestionsExactesLocuteurs(source, [proche])).toEqual([])
    expect(suggestionsLocuteurs(source, [proche])).toEqual([proche])
  })

  test('retient la meilleure graphie pour une identité représentée plusieurs fois', () => {
    const source = candidat('1', loc('a', 'Marie Dupont'))
    const proche = candidat('2', { ...loc('b', 'Maria Dupont'), locuteurRef: 'p' })
    const exacte = candidat('3', { ...loc('c', 'Marie Dupont'), locuteurRef: 'p' })
    expect(suggestionsLocuteurs(source, [proche, exacte])).toEqual([exacte])
  })

  test('ne rapproche pas deux participations du même entretien ni deux identités déjà liées', () => {
    const a = loc('a', 'Marie'), b = loc('b', 'MARIE')
    const source = candidat('1', a), cible = candidat('2', b)
    expect(suggestionsExactesLocuteurs(source, [cible])).toEqual([cible])
    expect(suggestionsExactesLocuteurs(source, [{ ...cible, entretienId: '1' }])).toEqual([])
    a.locuteurRef = b.locuteurRef = 'p'
    expect(suggestionsExactesLocuteurs(source, [cible])).toEqual([])
  })

  test('propose les rôles équivalents et respecte les refus symétriques révocables', () => {
    const a = loc('a', 'Interviewer'), b = loc('b', 'Enquêteur')
    const source = candidat('1', a), cible = candidat('2', b)
    expect(suggestionsExactesLocuteurs(source, [cible])).toHaveLength(1)
    for (let i = 0; i < 2; i++) refuserRapprochementLocuteurs(b, source)
    const refus = { type: 'participation' as const, entretienId: '1', participationId: 'a' }
    expect(b.rapprochementsRefuses).toEqual([refus])
    expect(suggestionsExactesLocuteurs(source, [cible])).toEqual([])
    annulerRefusRapprochementLocuteurs(b, refus)
    expect(suggestionsExactesLocuteurs(source, [cible])).toHaveLength(1)
  })

  test('regroupe une identité et applique les refus vers tous ses membres', () => {
    const a = loc('a', 'Marie'), b = loc('b', 'Marie'), c = loc('c', 'Marie')
    b.locuteurRef = c.locuteurRef = 'p'
    const source = candidat('1', a), candidats = [candidat('2', b), candidat('3', c)]
    expect(suggestionsExactesLocuteurs(source, candidats)).toHaveLength(1)
    refuserRapprochementLocuteurs(a, candidats[1])
    expect(suggestionsExactesLocuteurs(source, candidats)).toEqual([])
    a.rapprochementsRefuses = []
    refuserRapprochementLocuteurs(c, source)
    expect(suggestionsExactesLocuteurs(source, candidats)).toEqual([])
  })

  test('exclut une identité déjà représentée dans l’entretien source', () => {
    const a = loc('a', 'Marie'), b = loc('b', 'Marie'), c = loc('c', 'Autre nom')
    b.locuteurRef = c.locuteurRef = 'p'
    expect(suggestionsExactesLocuteurs(candidat('1', a), [candidat('2', b), candidat('1', c)])).toEqual([])
  })

  test('les refus de participations distinguent les entretiens, même à id local identique', () => {
    const source = candidat('source', loc('source-local', 'Marie'))
    const a = candidat('e1', loc('local-partage', 'Marie')), b = candidat('e2', loc('local-partage', 'Marie'))
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([a, b])
    refuserRapprochementLocuteurs(source.participation, a)
    const avant = structuredClone([source, a, b])
    expect(suggestionsLocuteurs(source, [a, b])).toEqual([b])
    expect([source, a, b]).toEqual(avant)
  })

  test('un rôle à préciser dans la source ne remplace pas celui de la cible', () => {
    const cible = { ...loc('b', 'Mme Dupont'), interviewer: true }
    reprendreDonneesParticipation(cible, loc('a', 'Marie'), { interviewer: true, variables: [], remplacer: true })
    expect(cible.interviewer).toBe(true)
    const vide = loc('c', 'Paul')
    reprendreDonneesParticipation(vide, loc('a', 'Marie'), { interviewer: true, variables: [] })
    expect(vide).not.toHaveProperty('interviewer')
  })

  test('la reprise ne modifie que les champs sélectionnés et protège les valeurs existantes', () => {
    const source = { ...loc('a', 'Marie'), pseudo: 'Alice', interviewer: true, valeursLoc: { age: '40', ville: 'Paris' } }
    const cible = { ...loc('b', 'Mme Dupont'), pseudo: 'Lou', interviewer: false, valeursLoc: { age: '30' } }
    reprendreDonneesParticipation(cible, source, { variables: ['age', 'ville'] })
    expect(cible).toMatchObject({ nom: 'Mme Dupont', pseudo: 'Lou', interviewer: false, locuteurRef: null, valeursLoc: { age: '30', ville: 'Paris' } })
    reprendreDonneesParticipation(cible, source, { pseudo: true, interviewer: true, variables: ['age'], remplacer: true })
    expect(cible).toMatchObject({ pseudo: 'Alice', pseudoEtat: 'confirme', interviewer: true, valeursLoc: { age: '40' } })
    source.valeursLoc.age = '50'
    expect(cible.valeursLoc.age).toBe('40')
  })
})
