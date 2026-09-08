import { describe, expect, test } from 'vitest'
import type { Locuteur } from '../src/shared/format'
import { annulerRefusRapprochement, cleNomPersonne, natureNomPersonne, refuserRapprochement, reprendreDonneesLocuteur, suggestionsExactesPersonnes } from '../src/shared/corpus/rapprochementsPersonnes'

const loc = (id: string, nom: string): Locuteur => ({ id, nom, index: 0, personneRef: null, valeursLoc: {} })

describe('Rapprochements et reprise sélective', () => {
  test('normalise les noms et distingue rôles et noms d’attente', () => {
    expect(cleNomPersonne('  Émilie—D’Arc. ')).toBe('emilie d arc')
    for (const nom of ['Interviewer', 'Intervieweur', 'Enquêteur']) expect(natureNomPersonne(nom)).toBe('role')
    for (const nom of ['', 'A', 'Speaker 2', 'Nouveau locuteur', 'Inconnu']) expect(natureNomPersonne(nom)).toBe('ignore')
    expect(natureNomPersonne('Enquêteur A')).toBe('specifique')
  })

  test('ne rapproche pas deux locuteurs du même entretien ni deux identités déjà liées', () => {
    const a = loc('a', 'Marie'); const b = loc('b', 'MARIE')
    const source = { entretienId: '1', locuteur: a }
    const candidat = { entretienId: '2', locuteur: b }
    expect(suggestionsExactesPersonnes(source, [candidat])).toEqual([candidat])
    expect(suggestionsExactesPersonnes(source, [{ ...candidat, entretienId: '1' }])).toEqual([])
    a.personneRef = b.personneRef = 'p'
    expect(suggestionsExactesPersonnes(source, [candidat])).toEqual([])
  })

  test('propose les rôles équivalents et respecte les refus symétriques révocables', () => {
    const a = loc('a', 'Interviewer'); const b = loc('b', 'Enquêteur')
    const source = { entretienId: '1', locuteur: a }; const candidat = { entretienId: '2', locuteur: b }
    expect(suggestionsExactesPersonnes(source, [candidat])).toHaveLength(1)
    refuserRapprochement(b, a)
    refuserRapprochement(b, a)
    expect(b.rapprochementsRefuses).toEqual(['locuteur:a'])
    expect(suggestionsExactesPersonnes(source, [candidat])).toEqual([])
    annulerRefusRapprochement(b, 'locuteur:a')
    expect(suggestionsExactesPersonnes(source, [candidat])).toHaveLength(1)
  })

  test('regroupe une personne et applique les refus vers tous ses membres', () => {
    const a = loc('a', 'Marie'); const b = loc('b', 'Marie'); const c = loc('c', 'Marie')
    b.personneRef = c.personneRef = 'p'
    const source = { entretienId: '1', locuteur: a }
    const candidats = [{ entretienId: '2', locuteur: b }, { entretienId: '3', locuteur: c }]
    expect(suggestionsExactesPersonnes(source, candidats)).toHaveLength(1)
    a.rapprochementsRefuses = ['locuteur:c']
    expect(suggestionsExactesPersonnes(source, candidats)).toEqual([])
    a.rapprochementsRefuses = []
    c.rapprochementsRefuses = ['locuteur:a']
    expect(suggestionsExactesPersonnes(source, candidats)).toEqual([])
  })

  test('exclut une personne déjà représentée dans l’entretien source', () => {
    const a = loc('a', 'Marie'); const b = loc('b', 'Marie'); const c = loc('c', 'Autre nom')
    b.personneRef = c.personneRef = 'p'
    expect(suggestionsExactesPersonnes({ entretienId: '1', locuteur: a }, [
      { entretienId: '2', locuteur: b }, { entretienId: '1', locuteur: c },
    ])).toEqual([])
  })

  test('la reprise ne modifie que les champs sélectionnés et protège les valeurs existantes', () => {
    const source = { ...loc('a', 'Marie'), pseudo: 'Alice', interviewer: true, valeursLoc: { age: '40', ville: 'Paris' } }
    const cible = { ...loc('b', 'Mme Dupont'), pseudo: 'Lou', interviewer: false, valeursLoc: { age: '30' } }
    reprendreDonneesLocuteur(cible, source, { variables: ['age', 'ville'] })
    expect(cible).toMatchObject({ nom: 'Mme Dupont', pseudo: 'Lou', interviewer: false, personneRef: null, valeursLoc: { age: '30', ville: 'Paris' } })
    reprendreDonneesLocuteur(cible, source, { pseudo: true, interviewer: true, variables: ['age'], remplacer: true })
    expect(cible).toMatchObject({ pseudo: 'Alice', pseudoEtat: 'confirme', interviewer: true, valeursLoc: { age: '40' } })
    source.valeursLoc.age = '50'
    expect(cible.valeursLoc.age).toBe('40')
  })
})
