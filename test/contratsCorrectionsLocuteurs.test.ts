import { describe, expect, test } from 'vitest'
import { estTypeCorrectionLocuteurs, validerCommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'

const renommer = { type: 'renommerGlobal', locuteurId: 'identite', nom: 'Nom commun', attendu: 'instantane' }
const regrouper = { type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Nom commun', uniformiserNoms: false, attendu: 'instantane' }
const dissocier = { type: 'dissocierSelection', locuteurId: 'identite', participations: [{ entretienId: 'e1', participationId: 'local' }], attendu: 'instantane' }

describe('contrats des corrections de locuteurs', () => {
  test.each([renommer, regrouper, dissocier])('accepte le message cible sans le réécrire : $type', (commande) => {
    const avant = structuredClone(commande)
    expect(estTypeCorrectionLocuteurs(commande.type)).toBe(true)
    expect(() => validerCommandeCorrectionLocuteurs(commande)).not.toThrow()
    expect(commande).toEqual(avant)
  })

  test('un même id local reste distinct dans deux entretiens', () => {
    expect(() => validerCommandeCorrectionLocuteurs({ ...dissocier, participations: [
      { entretienId: 'e1', participationId: 'local' }, { entretienId: 'e2', participationId: 'local' },
    ] })).not.toThrow()
  })

  test.each([
    null, [], 'renommerGlobal', { type: 'autre' },
    { type: 'renommerGlobal', personneId: 'identite', nom: 'Nom', attendu: 'instantane' },
    { ...renommer, personneId: 'ancienne-reference' }, { ...renommer, attendu: '' },
    { ...renommer, nom: ' ' }, { ...renommer, locuteurId: '' },
    { ...regrouper, personneIds: ['a', 'b'] }, { ...regrouper, locuteurIds: ['a', 'a'] },
    { ...regrouper, conserverId: 'absent' }, { ...regrouper, uniformiserNoms: 'oui' },
    { ...regrouper, locuteurIds: ['a'] },
    { ...dissocier, locuteurs: [{ entretienId: 'e1', locuteurId: 'local' }] },
    { ...dissocier, participations: [{ entretienId: 'e1', locuteurId: 'local' }] },
    { ...dissocier, participations: [{ entretienId: '', participationId: 'local' }] },
    { ...dissocier, participations: [{ entretienId: 'e1', participationId: 7 }] },
    { ...dissocier, participations: [] },
    { ...dissocier, participations: [dissocier.participations[0], dissocier.participations[0]] },
  ].map((commande, numero) => ({ commande, numero })))('refuse un message ancien, mixte ou incomplet ($numero)', ({ commande }) => {
    const avant = structuredClone(commande)
    expect(() => validerCommandeCorrectionLocuteurs(commande)).toThrow('demande de correction')
    expect(commande).toEqual(avant)
  })
})
