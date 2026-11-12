/** Qualification des suppressions de définitions avec des éditions déjà ouvertes. */
import { describe, expect, it } from 'vitest'
import { configuration, configurationPresente, contenuDe, creerRacine, definirPrefixeBanc, lireFichier, nettoyer, ouvrirSession, pile } from './qualificationBanc'
import { corpusSuppressionDefinitions, definitionsSupprimees, entretienSuppressionDefinitions, supprimerDefinitionTest } from '../fixtures/suppressionDefinitions'

definirPrefixeBanc('suppression-definitions-fermees')
const decrire = configurationPresente ? describe : describe.skip

decrire('suppressions de définitions GitLab réelles — entretiens fermés', () => {
  for (const type of definitionsSupprimees) {
    it(`${type} : refuse un tiers et notre propre édition, puis réussit après fermeture`, { timeout: 120_000 }, async () => {
      const corpus = corpusSuppressionDefinitions()
      const racine = await creerRacine(`fermeture-${type === 'thème' ? 'theme' : type === 'modalité' ? 'modalite' : type}`, { corpus })
      const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'alice', corpusLocal: corpus })
      const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'bob', corpusLocal: corpus })
      const contenu = JSON.stringify(entretienSuppressionDefinitions())
      await alice.depot.publierCommit('main', 'Qualification : entretiens fermés', ['e1', 'e2'].map((id) => ({
        action: 'create', file_path: `${racine}/entretiens/${id}.json`, content: contenu,
      })))
      const sessionBob = ouvrirSession(bob, `${racine}/entretiens/e1.json`, 'e1')
      const sessionAlice = ouvrirSession(alice, `${racine}/entretiens/e2.json`, 'e2')
      const supprimer = () => alice.transactions.executerSuppressionDefinitions((store) => supprimerDefinitionTest(store, type))
      try {
        const avant = contenuDe(await lireFichier(`${racine}/corpus.json`, configuration.token1 as string))
        await expect(sessionBob.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
        await expect(supprimer()).rejects.toThrow(/ouvert en édition/)
        expect(contenuDe(await lireFichier(`${racine}/corpus.json`, configuration.token1 as string))).toBe(avant)
        await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })
        await expect(sessionAlice.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
        await expect(supprimer()).rejects.toThrow(/ouvert en édition/)
        await expect(sessionAlice.fermer()).resolves.toEqual({ fermee: true })
        // Une lecture sans session d'édition ne bloque pas la suppression.
        await lireFichier(`${racine}/entretiens/e1.json`, configuration.token2 as string)
        expect((await supprimer()).valeur.ok).toBe(true)
        for (const id of ['e1', 'e2']) expect(contenuDe(await lireFichier(`${racine}/entretiens/${id}.json`, configuration.token1 as string))).toBe(contenu)
      } finally {
        await sessionAlice.fermer().catch(() => {})
        await sessionBob.fermer().catch(() => {})
        nettoyer(alice, bob)
      }
    })

    it(`${type} : refuse les usages publiés même lorsque tous les entretiens sont fermés`, { timeout: 90_000 }, async () => {
      const corpus = corpusSuppressionDefinitions()
      const racine = await creerRacine(`usage-${type === 'thème' ? 'theme' : type === 'modalité' ? 'modalite' : type}`, { corpus })
      const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'alice', corpusLocal: corpus })
      try {
        await alice.depot.publierCommit('main', 'Qualification : usage publié', ['e1', 'e2'].map((id) => ({
          action: 'create', file_path: `${racine}/entretiens/${id}.json`,
          content: JSON.stringify(entretienSuppressionDefinitions(id === 'e1' ? type : undefined)),
        })))
        const avant = contenuDe(await lireFichier(`${racine}/corpus.json`, configuration.token1 as string))
        expect((await alice.transactions.executerSuppressionDefinitions((store) => supprimerDefinitionTest(store, type))).valeur).toEqual({ ok: false, usages: 1 })
        expect(contenuDe(await lireFichier(`${racine}/corpus.json`, configuration.token1 as string))).toBe(avant)
      } finally {
        nettoyer(alice)
      }
    })
  }
})
