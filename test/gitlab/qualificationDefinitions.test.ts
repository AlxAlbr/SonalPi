/**
 *  Qualification du lot C sur une instance GitLab réelle, à deux comptes.
 *
 *  Ce banc ne rejoue pas l'API à la main : il instancie la pile de
 *  l'application — client, dépôt, bail versionné, journal, store local et
 *  transactions de corpus — et la fait travailler contre l'instance. Ce qui est
 *  prouvé ici est donc le comportement du main, pas celui d'un double.
 *
 *  Chaque scénario affiche ses mesures (requêtes, commits, durée) : elles sont
 *  la moitié de la sortie attendue, l'autre moitié étant les garanties affirmées.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import {
  cheminBailDepuisEmpreinteGitLab,
  cleRessourceBailGitLab,
  DepotCommitsGitLabClient,
  type DepotCommitsGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ErreurGitLab } from '../../src/main/gitlab/client'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { CorpusFichier } from '../../src/shared/format'
import {
  cheminBailCorpus,
  commitsTouchant,
  configuration,
  configurationPresente,
  contenuDe,
  creerRacine,
  definirPrefixeBanc,
  etiquetteExecution,
  entretienPublie,
  lireFichier,
  nettoyer,
  ouvrirSession,
  pile,
} from './qualificationBanc'

definirPrefixeBanc('c')

const decrire = configurationPresente ? describe : describe.skip

decrire('définitions du corpus GitLab — qualification à deux comptes', () => {
  it('mesure le coût d’une mutation et n’écrit le miroir qu’après confirmation', { timeout: 60_000 }, async () => {
    const racine = await creerRacine('c1', { nom: 'Qualification lot C' })
    const cheminCorpus = `${racine}/corpus.json`
    const cheminBail = cheminBailCorpus(racine)
    const avant = await commitsTouchant(cheminCorpus)
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c1' })
    const debut = performance.now()

    const resultat = await p.transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème mesuré', null),
    )
    const duree = performance.now() - debut

    const noms = Object.values(resultat.corpus.codebook).map((theme) => theme.nom)
    expect(noms).toContain('Thème mesuré')
    // Le miroir reçoit le candidat publié, et rien avant.
    expect(p.lireLocal().codebook).toEqual(resultat.corpus.codebook)
    const donnees = await commitsTouchant(cheminCorpus) - avant
    // Le commit de données touche aussi le bail : deux autres commits le
    // coordonnent, l'un pour l'acquérir, l'autre pour le rendre.
    const total = await commitsTouchant(cheminBail)
    console.log(
      `[banc lot C] mutation de définitions — ${donnees} commit de données, `
      + `${total} commits au total (acquisition, données, libération), `
      + `${p.requetes.length} requêtes, ${Math.round(duree)} ms`,
    )
    console.log(`[banc lot C] requêtes : ${p.requetes.join(' | ')}`)
    expect(donnees).toBe(1)
    expect(total).toBe(3)
    nettoyer(p)
  })

  it('une commande sans changement ne publie pas de données et remet le miroir à niveau', { timeout: 60_000 }, async () => {
    const racine = await creerRacine('c2', { nom: 'Qualification lot C' })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c2' })
    const avant = await commitsTouchant(`${racine}/corpus.json`)

    // Le miroir local est en retard et le serveur ne change pas.
    const resultat = await p.transactions.executerDefinitions(
      (store) => store.modifierCategorie('cat_001', { nom: 'Pondérations' }),
    )

    expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant)
    expect(resultat.corpus.nom).toBe('Qualification lot C')
    expect(p.lireLocal().nom).toBe('Qualification lot C')
    expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(2)
    nettoyer(p)
  })

  it('deux transactions concurrentes ne s’écrasent pas', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('c3', { nom: 'Qualification lot C' })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c3a' })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'c3b' })

    // Le bail tenu refuse le second gesture par son nom.
    const bail = await alice.coordination.acquireRessource(
      cleRessourceBailGitLab('main', `${racine}/corpus.json`),
    )
    expect(bail.ok).toBe(true)
    await expect(bob.transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème concurrent', null),
    )).rejects.toThrow(/en cours de modification par user1/)

    // Une fois le bail rendu, les gestes se succèdent sur des bases fraîches.
    if (!bail.ok) throw new Error('Bail de qualification invalide.')
    await alice.coordination.liberer(bail.droit)
    await alice.transactions.executerDefinitions((store) => store.ajouterCategorie('Thème A', null))
    await bob.transactions.executerDefinitions((store) => store.ajouterCategorie('Thème B', null))
    const apres = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    const noms = Object.values(apres.codebook).map((theme) => theme.nom)
    expect(noms).toContain('Thème A')
    expect(noms).toContain('Thème B')

    // Acquises en même temps, elles ne produisent qu'un gagnant et un refus.
    const carol = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c3c' })
    const dave = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'c3d' })
    const avantChevauchement = await commitsTouchant(`${racine}/corpus.json`)
    const resultats = await Promise.allSettled([
      carol.transactions.executerDefinitions((store) => store.ajouterCategorie('Thème C', null)),
      dave.transactions.executerDefinitions((store) => store.ajouterCategorie('Thème D', null)),
    ])
    const gagnants = resultats.filter((r) => r.status === 'fulfilled')
    const refus = resultats.filter((r) => r.status === 'rejected')
    console.log(
      `[banc lot C] acquisitions chevauchantes — ${gagnants.length} succès, ${refus.length} refus`,
    )
    expect(gagnants).toHaveLength(1)
    expect(refus).toHaveLength(1)
    expect(String((refus[0] as PromiseRejectedResult).reason))
      .toMatch(/en cours de modification par/)
    expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avantChevauchement + 1)
    const final = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    const themesFinaux = Object.values(final.codebook).map((theme) => theme.nom)
    expect(themesFinaux.filter((nom) => nom.startsWith('Thème C') || nom.startsWith('Thème D')))
      .toHaveLength(1)
    nettoyer(alice, bob, carol, dave)
  })

  it('une garde périmée par un tiers refuse le commit sans rien publier', { timeout: 60_000 }, async () => {
    const racine = await creerRacine('c4', { nom: 'Qualification lot C' })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c4' })
    const localAvant = JSON.stringify(p.lireLocal())
    const cheminCorpus = `${racine}/corpus.json`
    const gardeLue = (await lireFichier(cheminCorpus, configuration.token1 as string)).corps.last_commit_id

    // Le tiers écrit entre notre lecture et l'envoi de notre commit : la garde
    // de `corpus.json` devient périmée et GitLab refuse tout le commit.
    const publier = p.depot.publierCommit.bind(p.depot)
    let intervenu = false
    p.depot.publierCommit = async (branche, message, actions) => {
      if (!intervenu && message.startsWith('Sonal op-')) {
        intervenu = true
        const concurrent = JSON.parse(contenuDe(
          await lireFichier(cheminCorpus, configuration.token2 as string),
        )) as CorpusFichier
        concurrent.nom = 'Écrit par un tiers'
        await publier(branche, `qualification ${etiquetteExecution()}: corpus du tiers`, [{
          action: 'update',
          file_path: cheminCorpus,
          content: JSON.stringify(concurrent, null, 2),
          last_commit_id: gardeLue,
        }])
      }
      return publier(branche, message, actions)
    }

    await expect(p.transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème refusé', null),
    )).rejects.toThrow(/a changé pendant l’opération/)

    const publie = JSON.parse(contenuDe(
      await lireFichier(cheminCorpus, configuration.token2 as string),
    )) as CorpusFichier
    expect(publie.nom).toBe('Écrit par un tiers')
    expect(Object.values(publie.codebook).map((t) => t.nom)).not.toContain('Thème refusé')
    // Rien n'a été installé localement : le miroir garde son état antérieur.
    expect(JSON.stringify(p.lireLocal())).toBe(localAvant)
    nettoyer(p)
  })

  it('une panne avant tout envoi refuse la commande et n’installe rien', { timeout: 60_000 }, async () => {
    const racine = await creerRacine('c5', { nom: 'Qualification lot C' })
    let requetes = 0
    const p = pile({
      racine,
      jeton: configuration.token1 as string,
      userId: 'user1',
      sessionId: 'c5',
      fetchImpl: (async () => {
        requetes += 1
        throw new TypeError('fetch failed')
      }) as typeof fetch,
    })
    const localAvant = JSON.stringify(p.lireLocal())

    await expect(p.transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème hors ligne', null),
    )).rejects.toThrow()

    // Le refus est certain : la commande n'est même pas partie, et rien n'est
    // journalisé comme résultat indéterminé.
    expect(requetes).toBe(1)
    expect(p.journal.transactionsCorpusJournalisees()).toHaveLength(0)
    expect(JSON.stringify(p.lireLocal())).toBe(localAvant)
    nettoyer(p)
  })

  it('une coupure après l’envoi est réconciliée, jamais rejouée', { timeout: 120_000 }, async () => {
    const racine = await creerRacine('c6', { nom: 'Qualification lot C' })
    let commitsVue = 0
    const serveur: Server = createServer(async (entree, sortie) => {
      const morceaux: Buffer[] = []
      for await (const morceau of entree) morceaux.push(morceau as Buffer)
      try {
        const reponse = await fetch(`${configuration.url}${entree.url}`, {
          method: entree.method,
          headers: {
            'PRIVATE-TOKEN': configuration.token1 as string,
            'Content-Type': 'application/json',
          },
          body: entree.method === 'GET' || entree.method === 'HEAD'
            ? undefined
            : Buffer.concat(morceaux),
          signal: AbortSignal.timeout(15_000),
        })
        // Le premier commit est l'acquisition du bail : elle doit aboutir. Le
        // suivant porte les données, et sa réponse disparaît.
        if (entree.method === 'POST' && entree.url?.endsWith('/repository/commits')) {
          commitsVue += 1
          const titre = (JSON.parse(Buffer.concat(morceaux).toString('utf8')) as {
            commit_message?: string
          }).commit_message
          console.log(
            `[banc lot C] proxy — commit n°${commitsVue} : ${titre} (amont ${reponse.status})`,
          )
          if (commitsVue === 2) {
            reponse.body?.cancel()
            sortie.destroy()
            return
          }
        }
        const texte = await reponse.text()
        sortie.writeHead(reponse.status, { 'Content-Type': 'application/json' })
        sortie.end(texte)
      } catch {
        sortie.destroy()
      }
    })
    await new Promise<void>((resolve, reject) => {
      serveur.once('error', reject)
      serveur.listen(0, '127.0.0.1', () => resolve())
    })

    try {
      const adresse = serveur.address() as AddressInfo
      const p = pile({
        racine,
        jeton: configuration.token1 as string,
        userId: 'user1',
        sessionId: 'c6',
        instance: `http://127.0.0.1:${adresse.port}`,
      })

      // La commande avait abouti : la réconciliation immédiate retrouve le
      // commit, adopte l'état de bail qu'il portait, et l'appelant installe
      // enfin son candidat au lieu d'apprendre qu'il ignore.
      const resultat = await p.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème coupé', null),
      )
      expect(Object.values(resultat.corpus.codebook).map((t) => t.nom)).toContain('Thème coupé')
      expect(p.journal.transactionsCorpusJournalisees()).toHaveLength(0)
      const publie = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
      )) as CorpusFichier
      expect(Object.values(publie.codebook).map((t) => t.nom)).toContain('Thème coupé')
      // La commande suivante repart normalement : le bail a été rendu.
      await expect(p.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème suivant', null),
      )).resolves.toBeDefined()
      console.log('[banc lot C] coupure après envoi — réconciliée sur place, bail rendu')
      nettoyer(p)
      nettoyer(p)
    } finally {
      await new Promise<void>((resolve) => serveur.close(() => resolve()))
    }
  })

  it('une définition et une publication d’entretien réussissent ensemble', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('c7', { nom: 'Qualification lot C' })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c7' })
    const cheminEntretien = `${racine}/entretiens/c7.json`
    await p.depot.publierCommit('main', `qualification ${etiquetteExecution()}: entretien de session`, [{
      action: 'create',
      file_path: cheminEntretien,
      content: entretienPublie('qualification'),
    }])
    const session = ouvrirSession(p, cheminEntretien, 'c7')
    await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    await session.ecrire(entretienPublie('qualification modifiée'))

    // Le corpus change pendant que la session est ouverte : les deux écritures
    // portent sur des ressources distinctes, aucune garde n'est invalidée.
    const [, publication] = await Promise.all([
      p.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème pendant la session', null),
      ),
      session.marquerSale().then(() => session.publier()),
    ])
    // Les deux écritures aboutissent : la file de la destination les sépare.
    const corpusApres = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    expect(Object.values(corpusApres.codebook).map((t) => t.nom)).toContain('Thème pendant la session')
    expect(publication.statut).toBe('confirme')
    expect(contenuDe(await lireFichier(cheminEntretien, configuration.token1 as string)))
      .toContain('qualification modifiée')
    // Le candidat local de la session comme son contenu publié sont intacts.
    expect(readFileSync(join(p.dossier, 'entretiens/c7.json'), 'utf8'))
      .toContain('qualification modifiée')
    await expect(session.fermer()).resolves.toEqual({ fermee: true })
    nettoyer(p)
  })

  it('après un redémarrage, le bail de corpus est rendu à l’ouverture', { timeout: 120_000 }, async () => {
    const racine = await creerRacine('c9', { nom: 'Qualification lot C' })
    const journalRepertoire = mkdtempSync(join(tmpdir(), 'sonal-journal-redemarrage-'))
    // Un proxy qui laisse passer tout, sauf l'historique des commits : au
    // moment de la publication, personne ne peut donc rien conclure.
    let historiqueIndisponible = true
    const serveur: Server = createServer(async (entree, sortie) => {
      const morceaux: Buffer[] = []
      for await (const morceau of entree) morceaux.push(morceau as Buffer)
      const chemin = entree.url ?? ''
      if (historiqueIndisponible && chemin.includes('/repository/commits?')) {
        sortie.writeHead(500, { 'Content-Type': 'application/json' })
        sortie.end('{"message":"Service indisponible"}')
        return
      }
      try {
        const reponse = await fetch(`${configuration.url}${chemin}`, {
          method: entree.method,
          headers: {
            'PRIVATE-TOKEN': configuration.token1 as string,
            'Content-Type': 'application/json',
          },
          body: entree.method === 'GET' || entree.method === 'HEAD'
            ? undefined
            : Buffer.concat(morceaux),
          signal: AbortSignal.timeout(15_000),
        })
        const texte = await reponse.text()
        sortie.writeHead(reponse.status, { 'Content-Type': 'application/json' })
        sortie.end(texte)
      } catch {
        sortie.destroy()
      }
    })
    await new Promise<void>((resolve, reject) => {
      serveur.once('error', reject)
      serveur.listen(0, '127.0.0.1', () => resolve())
    })

    const adresse = serveur.address() as AddressInfo
    const instance = `http://127.0.0.1:${adresse.port}`
    try {
      const avant = pile({
        racine,
        jeton: configuration.token1 as string,
        userId: 'user1',
        sessionId: 'c9',
        instance,
        journalRepertoire,
      })
      // La réponse du commit de données se perd, et l'historique reste muet :
      // l'indetermination est le seul honnete verdict.
      avant.depot.publierCommit = (async (branche, message, actions) => {
        const reponse = await DepotCommitsGitLabClient.prototype.publierCommit.call(
          avant.depot, branche, message, actions,
        )
        if (message.startsWith('Sonal op-')) throw new TypeError('réponse perdue')
        return reponse
      }) as typeof avant.depot.publierCommit

      await expect(avant.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème perdu', null),
      )).rejects.toThrow(/n’a pas été confirmée/)
      expect(avant.journal.transactionsCorpusJournalisees()).toHaveLength(1)
      nettoyer(avant)

      // L'application redémarre : l'historique répond de nouveau, et la
      // réconciliation de démarrage retrouve le commit.
      historiqueIndisponible = false
      const apres = pile({
        racine,
        jeton: configuration.token1 as string,
        userId: 'user1',
        sessionId: 'c9',
        journalRepertoire,
      })
      const [entree] = apres.journal.transactionsCorpusJournalisees()
      const reconciliateur = new ReconciliateurPublicationGitLab(apres.depot, apres.journal)
      expect((await reconciliateur.reconcilier(entree)).statut).toBe('confirme')
      apres.journal.supprimer(entree.operationId)

      // Le bail laissé par la session morte appartient toujours au même poste :
      // l'ouverture le rend, et les définitions repartent sans attendre.
      expect(await apres.coordination.rendreBailNotre(
        cheminBailDepuisEmpreinteGitLab(entree.resourceHash),
        entree.generation,
      )).toBe('libere')
      await expect(apres.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème suivant', null),
      )).resolves.toBeDefined()
      nettoyer(apres)
    } finally {
      await new Promise<void>((resolve) => serveur.close(() => resolve()))
      rmSync(journalRepertoire, { recursive: true, force: true })
    }
  })

  it('deux publications de ressources différentes se succèdent sans se croiser', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('c10', { nom: 'Qualification lot C' })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c10' })
    const cheminEntretien = `${racine}/entretiens/c10.json`
    await p.depot.publierCommit('main', `qualification ${etiquetteExecution()}: entretien c10`, [{
      action: 'create',
      file_path: cheminEntretien,
      content: entretienPublie('c10'),
    }])
    const session = ouvrirSession(p, cheminEntretien, 'c10')
    await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    await session.ecrire(entretienPublie('c10 modifié'))

    const [, publication] = await Promise.all([
      p.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème pendant c10', null),
      ),
      session.marquerSale().then(() => session.publier()),
    ])
    console.log(
      `[banc lot C] chevauchement de deux ressources : ${JSON.stringify(publication)}`,
    )
    // Deux ressources, deux gardes valides : la file de la destination les
    // garde séparées, et les deux publications aboutissent.
    expect(publication.statut).toBe('confirme')
    expect(contenuDe(await lireFichier(cheminEntretien, configuration.token1 as string)))
      .toContain('c10 modifié')
    await expect(session.fermer()).resolves.toEqual({ fermee: true })
    nettoyer(p)
  })

  it('deux postes qui publient au même instant finissent par aboutir', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('c11', { nom: 'Qualification lot C' })
    // Les deux postes partent en même temps : leurs envois se croisent, et les
    // fichiers concernés n'ont rien de commun. C'est la collision de branche.
    const lent = (etiquette: string) => async (
      entree: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (init?.method === 'POST') await new Promise((r) => setTimeout(r, 250))
      const reponse = await fetch(entree as never, init)
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as { commit_message?: string }
        console.log(`[banc lot C] ${etiquette} — ${corps.commit_message} → ${reponse.status}`)
      }
      return reponse
    }
    const alice = pile({
      racine,
      jeton: configuration.token1 as string,
      userId: 'user1',
      sessionId: 'c11a',
      fetchImpl: lent('poste 1') as typeof fetch,
    })
    const bob = pile({
      racine,
      jeton: configuration.token2 as string,
      userId: 'user2',
      sessionId: 'c11b',
      fetchImpl: lent('poste 2') as typeof fetch,
    })
    const cheminEntretien = `${racine}/entretiens/c11.json`
    await alice.depot.publierCommit('main', `qualification ${etiquetteExecution()}: entretien c11`, [{
      action: 'create', file_path: cheminEntretien, content: entretienPublie('c11'),
    }])
    const session = ouvrirSession(bob, cheminEntretien, 'c11')
    await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    await session.ecrire(entretienPublie('c11 modifié'))

    const [corpus, publication] = await Promise.all([
      alice.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème croisé', null),
      ),
      session.marquerSale().then(() => session.publier()),
    ])

    console.log(
      `[banc lot C] deux postes au même instant — publication : ${JSON.stringify(publication)}`,
    )
    // Le second poste est celui qui se fait refuser : ses gardes tiennent
    // encore, son commit repart et aboutit.
    expect(publication.statut).toBe('confirme')
    expect(Object.values(corpus.corpus.codebook).map((theme) => theme.nom)).toContain('Thème croisé')
    expect(contenuDe(await lireFichier(cheminEntretien, configuration.token2 as string)))
      .toContain('c11 modifié')
    await expect(session.fermer()).resolves.toEqual({ fermee: true })
    nettoyer(alice, bob)
  })

  it('deux comptes qui se relaient sans se croiser ne se refusent pas', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('c12', { nom: 'Qualification lot C' })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c12a' })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'c12b' })
    const cheminEntretien = `${racine}/entretiens/c12.json`
    await alice.depot.publierCommit('main', `qualification ${etiquetteExecution()}: entretien c12`, [{
      action: 'create', file_path: cheminEntretien, content: entretienPublie('départ'),
    }])

    // Alice travaille, publie, referme. Bob ne commence qu'après.
    const sessionAlice = ouvrirSession(alice, cheminEntretien, 'c12a')
    await expect(sessionAlice.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    await sessionAlice.ecrire(entretienPublie('écrit par Alice'))
    await sessionAlice.marquerSale()
    expect((await sessionAlice.publier()).statut).toBe('confirme')
    await expect(sessionAlice.fermer()).resolves.toEqual({ fermee: true })

    // Bob reprend le même entretien, sans jamais avoir croisé Alice.
    const sessionBob = ouvrirSession(bob, cheminEntretien, 'c12b')
    await expect(sessionBob.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    await sessionBob.ecrire(entretienPublie('écrit par Bob'))
    await sessionBob.marquerSale()
    expect((await sessionBob.publier()).statut).toBe('confirme')
    await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })

    // Le corpus suit, et le relai n'a coûté aucun refus de coordination.
    await bob.transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème après le relai', null),
    )
    const final = contenuDe(
      await lireFichier(cheminEntretien, configuration.token1 as string),
    )
    expect(final).toContain('écrit par Bob')
    const corpusFinal = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    expect(Object.values(corpusFinal.codebook).map((theme) => theme.nom))
      .toContain('Thème après le relai')
    console.log('[banc lot C] relai de deux comptes — aucun refus, contenu final unique')
    nettoyer(alice, bob)
  })

  it('une lecture de frais impossible suspend le geste sans toucher au miroir', { timeout: 60_000 }, async () => {
    const racine = await creerRacine('c8', { nom: 'Qualification lot C' })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'c8' })
    const localAvant = JSON.stringify(p.lireLocal())
    const depotQuiTombe: DepotCommitsGitLab = {
      lireFichier: async () => { throw new ErreurGitLab(403, 'acces', 'droits insuffisants') },
      resoudreTete: async () => { throw new Error('injoignable') },
      lireContenuBrut: async () => null,
      rechercherCommits: async () => [],
      publierCommit: p.depot.publierCommit.bind(p.depot),
    }
    const transactions = new TransactionsGitLab({
      destination: {
        fournisseur: 'gitlab',
        id: 'c8',
        compteId: 'user1',
        projetId: Number(configuration.projetId),
        nomProjet: 'Qualification lot C',
        branche: 'main',
        racine,
      },
      store: p.store,
      depot: depotQuiTombe,
      coordination: p.coordination,
      publication: p.publication,
      file: new FileOperationsContexte(),
    })

    await expect(transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème sans lecture', null),
    )).rejects.toThrow(/droits insuffisants/)
    expect(JSON.stringify(p.lireLocal())).toBe(localAvant)
    nettoyer(p)
  })
})

if (!configurationPresente) {
  describe.skip('Contrat GitLab réel — configuration absente', () => {
    it('charger le fichier qualification.env et NODE_EXTRA_CA_CERTS pour activer le banc', () => {})
  })
}
