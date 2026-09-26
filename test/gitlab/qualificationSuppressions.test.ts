/** Qualification des suppressions de définitions et des sessions déjà ouvertes. */

import { describe, expect, it } from 'vitest'
import { gesteAutorise } from '../../src/main/gitlab/politiqueGestes'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import {
  cheminBailCorpus,
  commitsTouchant,
  configuration,
  configurationPresente,
  contenuDe,
  corpusAvecEntretiens,
  creerRacine,
  definirPrefixeBanc,
  entretienPublie,
  lireFichier,
  nettoyer,
  ouvrirSession,
  pile,
} from './qualificationBanc'

definirPrefixeBanc('d2')

const decrire = configurationPresente ? describe : describe.skip

function corpusAvecTheme(): CorpusFichier {
  const corpus = corpusAvecEntretiens({ e1: 'Entretien 1' })
  corpus.codebook.theme = {
    id: 'theme',
    nom: 'Thème supprimable',
    parent: null,
    ordre: 0,
    actif: true,
    codeExport: 'theme',
  }
  return corpus
}

decrire('suppressions de définitions GitLab — qualification à deux comptes', () => {
  it('empêche une session déjà ouverte de republier la définition supprimée', { timeout: 90_000 }, async () => {
    const corpus = corpusAvecTheme()
    const racine = await creerRacine('session-ouverte', { corpus })
    const alice = pile({
      racine,
      jeton: configuration.token1 as string,
      userId: 'user1',
      sessionId: 'suppression-alice',
      corpusLocal: corpus,
    })
    const bob = pile({
      racine,
      jeton: configuration.token2 as string,
      userId: 'user2',
      sessionId: 'suppression-bob',
      corpusLocal: corpus,
    })
    const cheminEntretien = `${racine}/entretiens/e1.json`
    await alice.depot.publierCommit('main', 'qualification D2: entretien publié', [{
      action: 'create',
      file_path: cheminEntretien,
      content: entretienPublie('Version publiée'),
    }])
    const session = ouvrirSession(bob, cheminEntretien, 'e1')

    try {
      expect(gesteAutorise('gitlab', 'theme.supprimer')).toBe(true)
      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      const avant = await commitsTouchant(`${racine}/corpus.json`)
      alice.requetes.length = 0
      const debut = performance.now()
      const resultat = await alice.transactions.executerSuppressionDefinitions(
        (store) => store.supprimerCategorie('theme'),
      )
      const duree = performance.now() - debut
      expect(resultat.valeur.ok).toBe(true)
      expect(await commitsTouchant(`${racine}/corpus.json`) - avant).toBe(1)
      expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(3)
      console.log(
        `[banc D2] suppression face à une session ouverte — 1 commit de données, `
        + `3 commits au total, ${alice.requetes.length} requêtes, ${Math.round(duree)} ms`,
      )

      const candidat = JSON.parse(entretienPublie('Candidat de Bob')) as EntretienFichier
      candidat.annotations.push({
        id: 'a1',
        type: 'codage',
        from: 1,
        to: 2,
        auteur: 'bob',
        code: 'theme',
      })
      await session.ecrire(JSON.stringify(candidat, null, 2))
      await session.marquerSale()
      await expect(session.publier()).resolves.toMatchObject({
        statut: 'refuse',
        raison: 'references',
      })
      expect(session.etat()).toMatchObject({ etat: 'edition' })

      const corpusDistant = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
      )) as CorpusFichier
      expect(corpusDistant.codebook.theme).toBeUndefined()
      const sourceDistante = JSON.parse(contenuDe(
        await lireFichier(cheminEntretien, configuration.token1 as string),
      )) as EntretienFichier
      expect(sourceDistante.annotations).toHaveLength(0)

      candidat.annotations = []
      await session.ecrire(JSON.stringify(candidat, null, 2))
      await session.marquerSale()
      await expect(session.publier()).resolves.toMatchObject({ statut: 'confirme' })
      await expect(session.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('refuse une suppression tant qu’une version publiée utilise la définition', { timeout: 90_000 }, async () => {
    const corpus = corpusAvecTheme()
    const racine = await creerRacine('usage-publie', { corpus })
    const alice = pile({
      racine,
      jeton: configuration.token1 as string,
      userId: 'user1',
      sessionId: 'usage-alice',
      corpusLocal: corpus,
    })
    const source = JSON.parse(entretienPublie('Usage publié')) as EntretienFichier
    source.annotations.push({
      id: 'a1',
      type: 'codage',
      from: 1,
      to: 2,
      auteur: 'alice',
      code: 'theme',
    })
    await alice.depot.publierCommit('main', 'qualification D2: usage publié', [{
      action: 'create',
      file_path: `${racine}/entretiens/e1.json`,
      content: JSON.stringify(source, null, 2),
    }])

    try {
      const avant = await commitsTouchant(`${racine}/corpus.json`)
      alice.requetes.length = 0
      const debut = performance.now()
      const resultat = await alice.transactions.executerSuppressionDefinitions(
        (store) => store.supprimerCategorie('theme'),
      )
      const duree = performance.now() - debut
      expect(resultat.valeur).toEqual({ ok: false, usages: 1 })
      expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant)
      expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(2)
      console.log(
        `[banc D2] usage publié — 0 commit de données, 2 commits de coordination, `
        + `${alice.requetes.length} requêtes, ${Math.round(duree)} ms`,
      )
      const corpusDistant = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
      )) as CorpusFichier
      expect(corpusDistant.codebook.theme).toBeDefined()
    } finally {
      nettoyer(alice)
    }
  })
})
