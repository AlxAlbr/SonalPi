import { describe, expect, it } from 'vitest'
import { configuration, configurationPresente, contenuDe, creerRacine, definirPrefixeBanc, lireFichier, nettoyer, ouvrirSession, pile } from './qualificationBanc'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'

definirPrefixeBanc('corrections-locuteurs')
const decrire = configurationPresente ? describe : describe.skip

decrire('corrections des locuteurs sur GitLab réel', () => {
  it('refuse une édition tierce puis renomme dans les entretiens en conservant les données', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(), racine = await creerRacine('renommage', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'alice' })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'bob' })
    const session = ouvrirSession(bob, `${racine}/entretiens/A.json`, 'A')
    try {
      await alice.depot.publierCommit('main', 'Qualification : sources des locuteurs', f.sources().map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: s.contenu })))
      const commande = { type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice publiée', attendu: f.attendu() }
      const avant = contenuDe(await lireFichier(`${racine}/corpus.crp`, configuration.token1 as string))
      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      await expect(alice.transactions.corrigerLocuteurs(commande, () => {})).rejects.toThrow('L’entretien « A » est en cours de modification par user2.')
      expect(contenuDe(await lireFichier(`${racine}/corpus.crp`, configuration.token1 as string))).toBe(avant)
      await expect(session.fermer()).resolves.toEqual({ fermee: true })
      await expect(alice.transactions.corrigerLocuteurs(commande, () => {})).resolves.toBe('a')
      for (const e of f.entretiens) {
        const apres = JSON.parse(contenuDe(await lireFichier(`${racine}/entretiens/${e.id}.json`, configuration.token1 as string)))
        if (e.id === 'C') expect(apres).toEqual(e.data)
        else expect(apres).toEqual({ ...e.data, lastModified: expect.any(String), participations: [{ ...e.data.participations[0], nom: 'Alice publiée' }] })
      }
    } finally { await session.fermer().catch(() => {}); nettoyer(alice, bob) }
  })

  it('refuse un aperçu périmé puis réunit les identités et supprime seulement une définition vide', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(), racine = await creerRacine('reunion', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'alice' })
    try {
      await alice.depot.publierCommit('main', 'Qualification : sources à réunir', f.sources().map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: s.contenu })))
      const commun = { type: 'regrouperSelection' as const, locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Identité commune', uniformiserNoms: false }
      await expect(alice.transactions.corrigerLocuteurs({ ...commun, attendu: '{}' }, () => {})).rejects.toThrow('ont changé')
      await expect(alice.transactions.corrigerLocuteurs({ ...commun, attendu: f.attendu() }, () => {})).resolves.toBe('a')
      expect(alice.store.ouvrir().locuteurs.b).toBeUndefined()
      const avant = contenuDe(await lireFichier(`${racine}/entretiens/C.json`, configuration.token1 as string))
      expect(JSON.parse(avant).participations[0]).toEqual({ ...f.entretiens[2].data.participations[0], locuteurRef: 'a' })
      await expect(alice.transactions.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: 'a', attendu: JSON.stringify(alice.store.inventaireIdentitesLocuteurs()) }, () => {})).rejects.toThrow('Déliez')
      await alice.transactions.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: 'vide', attendu: JSON.stringify(alice.store.inventaireIdentitesLocuteurs()) }, () => {})
      expect(alice.store.ouvrir().locuteurs.vide).toBeUndefined()
      expect(contenuDe(await lireFichier(`${racine}/entretiens/C.json`, configuration.token1 as string))).toBe(avant)
    } finally { nettoyer(alice) }
  })
})
