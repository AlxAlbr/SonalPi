import { describe, expect, test } from 'vitest'
import {
  associerParticipation, creerLocuteur, renommerLocuteur, separerLocuteur, supprimerLocuteurVide, trouverParticipation,
} from '../src/shared/corpus/identitesLocuteurs'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import type { ReferenceParticipation } from '../src/shared/locuteurs'
import { casNatif, corpusCasNatif, dateCasNatif, entretienCasNatif, idLocuteurNatif, idParticipationNative } from './fixtures/casNatifs'

function preparer() {
  const corpus = corpusCasNatif()
  corpus.membership.e2 = { titre: 'Entretien B', date: null, lastModified: dateCasNatif }
  const a = entretienCasNatif(), b = entretienCasNatif()
  b.participations[0].nom = 'Autre étiquette'
  b.participations[0].interviewer = true
  b.participations[0].couleur = '#123456'
  b.participations[0].rapprochementsRefuses = [{ type: 'participation', entretienId: 'e1', participationId: idParticipationNative }]
  const entretiens = [{ id: 'e1', titre: 'A', data: a }, { id: 'e2', titre: 'B', data: b }]
  const inventaire = () => ({ participations: entretiens.flatMap((e) => e.data.participations), indisponibles: [] })
  const verifier = () => {
    validerCorpusNatif(corpus)
    for (const e of entretiens) validerEntretienNatif(e.data)
  }
  return { corpus, a, b, entretiens, inventaire, verifier }
}

describe('identités corpus et associations de participations', () => {
  test('crée des homonymes distincts sans transférer les informations des entretiens', () => {
    const b = preparer()
    const avant = structuredClone(b.entretiens)
    const cree = creerLocuteur(b.corpus, 'nouvel-id', ' Alice ')
    expect(cree).toEqual({ id: 'nouvel-id', nom: 'Alice' })
    expect(Object.values(b.corpus.locuteurs).filter((l) => l.nom === 'Alice')).toHaveLength(3)
    expect(b.entretiens).toEqual(avant)
    b.verifier()
  })

  test.each(['', idLocuteurNatif])('refuse un identifiant vide ou déjà utilisé : %s', (id) => {
    const b = preparer(), avant = structuredClone(b.corpus)
    expect(() => creerLocuteur(b.corpus, id, 'Alice')).toThrow('Identifiant')
    expect(b.corpus).toEqual(avant)
  })

  test('les identifiants opaques sont des clés de données, pas des propriétés héritées', () => {
    const b = preparer()
    creerLocuteur(b.corpus, '__proto__', 'Nom de référence')
    expect(Object.hasOwn(b.corpus.locuteurs, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(b.corpus.locuteurs)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(b.corpus.locuteurs))['__proto__']).toEqual({ id: '__proto__', nom: 'Nom de référence' })
    b.verifier()
  })

  test('un renommage de référence ne réécrit pas les noms locaux, les notes ou les pseudos', () => {
    const b = preparer(), avant = structuredClone(b.entretiens)
    renommerLocuteur(b.corpus, idLocuteurNatif, ' Alice de référence ')
    expect(b.corpus.locuteurs[idLocuteurNatif].nom).toBe('Alice de référence')
    expect(b.entretiens).toEqual(avant)
    expect(() => renommerLocuteur(b.corpus, idLocuteurNatif, ' ')).toThrow('vide')
    expect(b.corpus.locuteurs[idLocuteurNatif].nom).toBe('Alice de référence')
    b.verifier()
  })

  test('réassocie uniquement le lien, puis conserve un retrait historique explicite', () => {
    const b = preparer(), avant = structuredClone(b.a)
    expect(trouverParticipation(b.a, idParticipationNative)).toBe(b.a.participations[0])
    associerParticipation(b.corpus, b.a, idParticipationNative, 'autre')
    expect(b.a).toEqual({ ...avant, participations: [{ ...avant.participations[0], locuteurRef: 'autre' }] })
    associerParticipation(b.corpus, b.a, idParticipationNative, null)
    expect(b.a).toEqual({ ...avant, participations: [{ ...avant.participations[0], locuteurRef: null, associationRetiree: true }] })
    associerParticipation(b.corpus, b.a, idParticipationNative, idLocuteurNatif)
    expect(b.a).toEqual(avant)
    b.verifier()
  })

  test('refuse deux participations du même entretien et les références absentes sans mutation', () => {
    const b = preparer()
    b.a.participations.push({ id: 'second-local', index: 9, nom: 'Deuxième', valeursLoc: {}, locuteurRef: null })
    const avant = structuredClone([b.corpus, b.a])
    expect(() => associerParticipation(b.corpus, b.a, 'second-local', idLocuteurNatif)).toThrow('déjà présent')
    expect(() => associerParticipation(b.corpus, b.a, 'second-local', 'absent')).toThrow('n’existe plus')
    expect(() => associerParticipation(b.corpus, b.a, 'absente', 'autre')).toThrow('participation')
    expect([b.corpus, b.a]).toEqual(avant)
    b.verifier()
  })

  test('sépare selon le couple entretien/participation, même avec des ids locaux identiques', () => {
    const b = preparer(), avant = structuredClone([b.a, b.b])
    b.corpus.cas = { cas: casNatif() }
    const avantCas = structuredClone(b.corpus.cas)
    const nouvelle = separerLocuteur(b.corpus, b.entretiens, idLocuteurNatif, 'id-distinct', ' Nouvelle identité ', [
      { entretienId: 'e2', participationId: idParticipationNative },
    ])
    expect(nouvelle).toEqual({ id: 'id-distinct', nom: 'Nouvelle identité' })
    expect(b.a).toEqual(avant[0])
    expect(b.b).toEqual({ ...avant[1], participations: [{ ...avant[1].participations[0], locuteurRef: 'id-distinct' }] })
    expect(b.corpus.cas).toEqual(avantCas)
    expect(b.b.notes![0].participationIds).toEqual([idParticipationNative])
    b.verifier()
  })

  test.each([
    [],
    [{ entretienId: 'e2', participationId: idParticipationNative }, { entretienId: 'e2', participationId: idParticipationNative }],
    [{ entretienId: 'inconnu', participationId: idParticipationNative }],
    [{ entretienId: 'e2', participationId: 'absente' }],
    [{ entretienId: 'e1', participationId: idParticipationNative }, { entretienId: 'e2', participationId: idParticipationNative }],
  ] satisfies ReferenceParticipation[][])('une sélection invalide ne crée ni identité ni modification locale : %j', (...selection) => {
    const b = preparer(), avant = structuredClone([b.corpus, b.entretiens])
    expect(() => separerLocuteur(b.corpus, b.entretiens, idLocuteurNatif, 'id-distinct', 'Nouvelle', selection)).toThrow()
    expect([b.corpus, b.entretiens]).toEqual(avant)
  })

  test('la séparation vérifie le nom et le nouvel id avant toute modification', () => {
    const b = preparer(), avant = structuredClone([b.corpus, b.entretiens])
    const selection = [{ entretienId: 'e2', participationId: idParticipationNative }]
    expect(() => separerLocuteur(b.corpus, b.entretiens, idLocuteurNatif, 'autre', 'Nouvelle', selection)).toThrow('Identifiant')
    expect(() => separerLocuteur(b.corpus, b.entretiens, idLocuteurNatif, 'id-distinct', ' ', selection)).toThrow('vide')
    expect([b.corpus, b.entretiens]).toEqual(avant)
  })

  test('une identité inutilisée ne disparaît que sur demande explicite et avec un inventaire complet', () => {
    const b = preparer(), avant = structuredClone(b.corpus)
    expect(b.corpus.locuteurs.autre).toBeDefined()
    expect(() => supprimerLocuteurVide(b.corpus, {
      ...b.inventaire(), indisponibles: [{ id: 'e2', titre: 'B', raison: 'Non disponible' }],
    }, 'autre')).toThrow('illisibles')
    expect(() => supprimerLocuteurVide(b.corpus, b.inventaire(), idLocuteurNatif)).toThrow('Déliez')
    expect(b.corpus).toEqual(avant)
    supprimerLocuteurVide(b.corpus, b.inventaire(), 'autre')
    expect(b.corpus.locuteurs.autre).toBeUndefined()
    b.verifier()
  })

  test.each(['locuteur', 'locuteurs'] as const)('la suppression vérifie les références des cas (%s)', (type) => {
    const b = preparer()
    const cas = casNatif()
    cas.regles = type === 'locuteur' ? [{ type, locuteurId: 'autre', inclureEnqueteurs: false }]
      : [{ type, membres: [{ locuteurId: 'autre', inclureEnqueteurs: true }] }]
    b.corpus.cas = { cas }
    const avant = structuredClone(b.corpus)
    expect(() => supprimerLocuteurVide(b.corpus, b.inventaire(), 'autre')).toThrow('Cas Alice')
    expect(b.corpus).toEqual(avant)
  })

  test('une référence de refus vers l’identité vide interdit sa suppression', () => {
    const b = preparer()
    b.a.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'autre' }]
    const avant = structuredClone([b.corpus, b.entretiens])
    expect(() => supprimerLocuteurVide(b.corpus, b.inventaire(), 'autre')).toThrow('rapprochements refusés')
    expect([b.corpus, b.entretiens]).toEqual(avant)
  })

  test('une note ou un refus local de même id ne vise pas une identité corpus', () => {
    const b = preparer(), avant = structuredClone(b.entretiens)
    creerLocuteur(b.corpus, idParticipationNative, 'Identité sans participation')
    supprimerLocuteurVide(b.corpus, b.inventaire(), idParticipationNative)
    expect(b.corpus.locuteurs[idParticipationNative]).toBeUndefined()
    expect(b.entretiens).toEqual(avant)
    b.verifier()
  })
})
