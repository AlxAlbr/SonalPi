import { describe, expect, test, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { corpusSuppressionDefinitions, definitionsSupprimees, entretienSuppressionDefinitions, supprimerDefinitionTest } from '../fixtures/suppressionDefinitions'

for (const natif of [false, true]) {
  describe(`Suppression de définitions WebDAV, verrou natif=${natif}`, () => {
    async function banc(ouvert = false) {
      const serveur = new ServeurWebDAVMemoire({ olivier: 'pass' })
      serveur.poser('corpus.json', JSON.stringify(corpusSuppressionDefinitions()))
      for (const id of ['e1', 'e2']) serveur.poser(`entretiens/${id}.json`, JSON.stringify(entretienSuppressionDefinitions()))
      const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, serveur.fetch)
      const tiers = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: { utilisateur: 'olivier', motDePasse: 'pass' } }, serveur.fetch)
      const identite = { userId: 'max', machineId: 'poste', sessionId: 'courant' }
      const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), 'sonal-definition-dav-')))
      await miroir.tirer()
      const store = new CorpusStore(miroir.dirLocal)
      store.lectureSeule = true
      const publier = vi.fn()
      const tx = new TransactionsCorpus(client, miroir, () => store, () => identite, {
        verrouNatif: natif,
        getSessions: () => ({ idsTenus: () => ouvert ? ['e1'] : [], noterSale: vi.fn(), publier }),
      })
      const provider = (propre = false) => {
        const id = propre ? identite : { userId: 'olivier', machineId: 'autre', sessionId: 'autre' }
        return natif ? new ProviderFilesLock(propre ? client : tiers, () => id) : new ProviderPutConditionnel(propre ? client : tiers, () => id)
      }
      const chemin = natif ? 'entretiens/e1.json' : 'verrous/e1.lock.json'
      return { serveur, client, tx, store, publier, provider, chemin }
    }

    for (const type of definitionsSupprimees) {
      test(`${type} : refuse une édition tierce, puis réussit après fermeture sans modifier les entretiens`, async () => {
        const b = await banc()
        const avant = b.serveur.contenuDe('corpus.json')
        const source = b.serveur.contenuDe('entretiens/e1.json')
        const verrou = b.provider()
        expect((await verrou.acquerir(b.chemin)).ok).toBe(true)
        await expect(b.tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(b.store, type))).rejects.toThrow(/ouvert/)
        expect(b.serveur.contenuDe('corpus.json')).toBe(avant)
        expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(source)
        await verrou.liberer(b.chemin)
        const propre = b.provider(true)
        expect((await propre.acquerir(b.chemin)).ok).toBe(true)
        await expect(b.tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(b.store, type))).rejects.toThrow(/ouvert/)
        await propre.liberer(b.chemin)
        expect((await b.tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(b.store, type))).ok).toBe(true)
        expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(source)
        expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
      })

      test(`${type} : refuse notre propre édition sans publication automatique`, async () => {
        const b = await banc(true)
        const avant = b.serveur.contenuDe('corpus.json')
        await expect(b.tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(b.store, type))).rejects.toThrow(/fermez/)
        expect(b.serveur.contenuDe('corpus.json')).toBe(avant)
        expect(b.publier).not.toHaveBeenCalled()
      })

      test(`${type} : un usage publié dans un entretien fermé reste bloquant`, async () => {
        const b = await banc()
        b.serveur.poser('entretiens/e1.json', JSON.stringify(entretienSuppressionDefinitions(type)))
        expect(await b.tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(b.store, type))).toEqual({ ok: false, usages: 1 })
      })
    }

    test('la perte d’un droit juste avant l’envoi refuse la suppression', async () => {
      const b = await banc()
      const avant = b.serveur.contenuDe('corpus.json')
      const prototype = natif ? ProviderFilesLock.prototype : ProviderPutConditionnel.prototype
      const battre = prototype.battre
      const espion = vi.spyOn(prototype, 'battre').mockImplementation(async function (chemin) {
        if (chemin === b.chemin) return { ok: false }
        return battre.call(this, chemin)
      })
      try {
        await expect(b.tx.executerSuppressionDefinitions(() => b.store.supprimerCategorie('theme'))).rejects.toThrow(/protégé/)
        expect(b.serveur.contenuDe('corpus.json')).toBe(avant)
      } finally {
        espion.mockRestore()
      }
    })

    test('un délai après les contrôles empêche encore l’envoi de la suppression', async () => {
      const b = await banc()
      const avant = b.serveur.contenuDe('corpus.json')
      let heure = Date.now(), preuvesFinies = false
      const horloge = vi.spyOn(Date, 'now').mockImplementation(() => heure)
      const prototype = natif ? ProviderFilesLock.prototype : ProviderPutConditionnel.prototype
      const battre = prototype.battre
      const preuve = vi.spyOn(prototype, 'battre').mockImplementation(async function (chemin) {
        const resultat = await battre.call(this, chemin)
        if (chemin === (natif ? 'entretiens/e2.json' : 'verrous/e2.lock.json')) preuvesFinies = true
        return resultat
      })
      const lire = b.client.getTexte.bind(b.client)
      const lecture = vi.spyOn(b.client, 'getTexte').mockImplementation(async (chemin) => {
        const contenu = await lire(chemin)
        if (chemin === 'corpus.json' && preuvesFinies) heure += 1_000_000
        return contenu
      })
      try {
        await expect(b.tx.executerSuppressionDefinitions(() => b.store.supprimerCategorie('theme'))).rejects.toThrow(/expirer/)
        expect(b.serveur.contenuDe('corpus.json')).toBe(avant)
      } finally {
        lecture.mockRestore()
        preuve.mockRestore()
        horloge.mockRestore()
      }
    })

    test('aucune ouverture concurrente ne passe pendant la suppression', async () => {
      const b = await banc()
      const concurrent = b.provider()
      const original = b.client.getTexte.bind(b.client)
      let tente = false
      vi.spyOn(b.client, 'getTexte').mockImplementation(async (chemin) => {
        if (chemin === 'entretiens/e1.json' && !tente) {
          tente = true
          expect((await concurrent.acquerir(b.chemin)).ok).toBe(false)
        }
        return original(chemin)
      })
      expect((await b.tx.executerSuppressionDefinitions(() => b.store.supprimerCategorie('theme'))).ok).toBe(true)
      expect(tente).toBe(true)
      expect((await concurrent.acquerir(b.chemin)).ok).toBe(true)
      await concurrent.liberer(b.chemin)
    })
  })
}
