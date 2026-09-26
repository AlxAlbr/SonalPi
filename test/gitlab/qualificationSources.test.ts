/**
 *  Qualification des gestes qui lisent les entretiens publiés, sur une
 *  instance GitLab réelle et à deux comptes.
 *
 *  Ces gestes fundent une décision sur des versions distantes : un
 *  rattachement, une dérivation ou un ordre de tri. Le banc vérifie donc que
 *  la décision porte bien sur la version publiée, que chaque source entre dans
 *  le même commit que le corpus, et qu'un tri refuse un corpus occupé avant
 *  toute acquisition. Chaque scénario affiche ses mesures.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import type { ObservationCoordinationDistante } from '../../src/main/distant/coordination'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { verifierContenusReferencesDefinitions } from '../../src/main/gitlab/referencesDefinitions'
import { ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { MAX_SOURCES_GARDEES } from '../../src/main/gitlab/transactions'
import { deduireSourcesCas } from '../../src/main/casOrchestration'
import { MiroirDistant } from '../../src/main/distant/miroir'
import type { CommandeCas } from '../../src/shared/corpus/cas'
import type { CorpusFichier } from '../../src/shared/format'
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
  pile,
  type Pile,
} from './qualificationBanc'

definirPrefixeBanc('d')

const decrire = configurationPresente ? describe : describe.skip

/** Corpus de qualification portant un cas, pour y rattacher un passage. */
function corpusAvecCas(titres: Record<string, string>): CorpusFichier {
  const corpus = corpusAvecEntretiens(titres)
  corpus.cas = {
    'cas-1': {
      id: 'cas-1',
      nom: 'Cas de référence',
      memo: '',
      creeLe: '2026-01-01T09:00:00.000Z',
      modifieLe: '2026-01-01T09:00:00.000Z',
      regles: [],
      rattachements: [],
    },
  }
  return corpus
}

/** Dépose les entretiens publiés d'une racine, dans un seul commit. */
async function publierEntretiens(p: Pile, contenus: Record<string, string>): Promise<void> {
  await p.depot.publierCommit('main', 'qualification D1: entretiens publiés', Object.entries(contenus)
    .map(([id, contenu]) => ({
      action: 'create' as const,
      file_path: `${p.racine}/entretiens/${id}.json`,
      content: contenu,
    })))
}

function commandeRattachement(entretienId: string, repereId: string): CommandeCas {
  return {
    type: 'ajouter-rattachements',
    casIds: ['cas-1'],
    rattachement: {
      id: `r-${entretienId}-${repereId}`,
      provenance: 'manuel',
      source: { entretienId, repereId },
      creeLe: '2026-01-02T10:00:00.000Z',
    },
  } as CommandeCas
}

/** Dépôt d'un cas et d'un entretien rattachables, prêt pour le geste. */
async function racineAvecSource(suffixe: string): Promise<{ p: Pile; racine: string }> {
  const racine = await creerRacine(suffixe, { corpus: corpusAvecCas({ e1: 'Entretien 1' }) })
  const p = pile({
    racine,
    jeton: configuration.token1 as string,
    userId: 'user1',
    sessionId: suffixe,
  })
  await publierEntretiens(p, { e1: entretienPublie('Réponse de la personne', ['p1']) })
  return { p, racine }
}

/** Contexte réel, pour éprouver le refus de tri et son observation. */
function contexteTri(p: Pile, observation?: ObservationCoordinationDistante, session?: SessionGitLab) {
  const miroir = {
    tirer: async () => ({
      telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString(),
    }),
  } as unknown as MiroirDistant
  return new ContexteGitLab(
    'qualification-tri',
    p.store,
    miroir,
    session ? () => session : undefined,
    p.transactions,
    observation,
  )
}

/** Session réelle d'un entretien du banc, avec son stockage local. */
function sessionDe(p: Pile, id: string, idSession: string) {
  const stockage = new StockageLocalEntretienGitLab(p.dossier, `entretiens/${id}.json`)
  return {
    session: new SessionGitLab({
      id,
      ressource: `entretien:qualification:${idSession}`,
      cheminRelatif: `entretiens/${id}.json`,
      cheminDistant: `${p.racine}/entretiens/${id}.json`,
      branche: 'main',
      depot: p.depot,
      coordination: p.coordination,
      publication: p.publication,
      stockageLocal: stockage,
      journal: p.journal,
      preparerGardeDefinitions: async (contenuEntretien) => {
        const corpus = await p.depot.lireFichier(`${p.racine}/corpus.json`, 'main')
        if (!corpus) throw new Error('Le fichier corpus.json est introuvable sur GitLab.')
        verifierContenusReferencesDefinitions(contenuEntretien, corpus.contenu)
        return {
          action: 'update',
          chemin: `${p.racine}/corpus.json`,
          contenu: corpus.contenu,
          commitId: corpus.commitId,
        }
      },
    }),
    stockage,
  }
}

decrire('gestes à sources GitLab — qualification à deux comptes', () => {
  it('mesure un rattachement : une source gardée, le miroir écrit après confirmation', { timeout: 90_000 }, async () => {
    const { p, racine } = await racineAvecSource('d1')
    const cheminSource = `${racine}/entretiens/e1.json`
    const avantSource = (await lireFichier(cheminSource, configuration.token1 as string)).corps.last_commit_id
    const avant = await commitsTouchant(`${racine}/corpus.json`)
    const debut = performance.now()

    const commande = commandeRattachement('e1', 'p1')
    const resultat = await p.transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )
    const duree = performance.now() - debut

    // Le corpus publié porte le rattachement, calculé sur la version publiée.
    const publie = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    const rattachements = publie.cas?.['cas-1']?.rattachements ?? []
    expect(rattachements.map((r) => r.source)).toEqual([{ entretienId: 'e1', repereId: 'p1' }])
    // Le miroir a reçu le corpus, et jamais une copie de l'entretien.
    expect(p.lireLocal().cas?.['cas-1']?.rattachements).toHaveLength(1)

    // La garde de la source est bien dans le commit de données, et la source
    // elle-même n'a pas bougé : la garde est pure.
    const donnees = await commitsTouchant(`${racine}/corpus.json`) - avant
    const apresSource = (await lireFichier(cheminSource, configuration.token1 as string)).corps.last_commit_id
    expect(apresSource).toBe(avantSource)
    console.log(
      `[banc D1] rattachement — ${donnees} commit de données, `
      + `${await commitsTouchant(cheminBailCorpus(racine))} commits au total, `
      + `${p.requetes.length} requêtes, ${Math.round(duree)} ms`,
    )
    console.log(`[banc D1] requêtes : ${p.requetes.join(' | ')}`)
    expect(donnees).toBe(1)
    nettoyer(p)
  })

  it('une source modifiée pendant la préparation refuse le commit entier', { timeout: 90_000 }, async () => {
    const { p, racine } = await racineAvecSource('d2')
    const cheminSource = `${racine}/entretiens/e1.json`
    const avant = await commitsTouchant(`${racine}/corpus.json`)
    const localAvant = JSON.stringify(p.lireLocal())

    // Un tiers publie l'entretien entre notre lecture et l'envoi du commit :
    // la garde de la source devient périmée et GitLab refuse tout le commit.
    const publier = p.depot.publierCommit.bind(p.depot)
    let intervenu = false
    p.depot.publierCommit = async (branche, message, actions) => {
      if (!intervenu && message.startsWith('Sonal op-')) {
        intervenu = true
        await publier(branche, 'qualification D1: source concurrente', [{
          action: 'update',
          file_path: cheminSource,
          content: entretienPublie('Version concurrente', ['p1']),
          last_commit_id: (await lireFichier(cheminSource, configuration.token2 as string))
            .corps.last_commit_id,
        }])
      }
      return publier(branche, message, actions)
    }

    const commande = commandeRattachement('e1', 'p1')
    await expect(p.transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow(/a changé pendant l’opération/)

    // Le corpus reste intact, et le miroir n'a rien reçu.
    expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant)
    expect(JSON.stringify(p.lireLocal())).toBe(localAvant)
    console.log('[banc D1] source périmée — commit refusé, corpus et miroirs intacts')
    nettoyer(p)
  })

  it('une source tenue par un tiers est calculée sur sa version publiée', { timeout: 120_000 }, async () => {
    const racine = await creerRacine('d3', { corpus: corpusAvecCas({ e1: 'Entretien 1' }) })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'd3a' })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'd3b' })
    const cheminSource = `${racine}/entretiens/e1.json`
    await publierEntretiens(alice, { e1: entretienPublie('Version publiée', ['p1']) })

    // Bob tient l'entretien et a un candidat non publié.
    const { session: sessionBob, stockage } = sessionDe(bob, 'e1', 'd3b')
    await expect(sessionBob.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    const candidatBob = entretienPublie('Travail non publié de Bob', ['p1', 'p2'])
    await stockage.ecrire(candidatBob)
    await sessionBob.marquerSale()

    // Alice rattache un passage : la décision porte sur la version publiée, et
    // le commit garde cette version. Le candidat de Bob n'est ni lu ni remplacé.
    const commande = commandeRattachement('e1', 'p1')
    const resultat = await alice.transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )
    expect(resultat.corpus.cas?.['cas-1']?.rattachements).toHaveLength(1)
    // Le candidat local de Bob est intact, et sa session reste publiable.
    expect(await stockage.lire()).toBe(candidatBob)
    expect(contenuDe(await lireFichier(cheminSource, configuration.token1 as string)))
      .toContain('Version publiée')
    expect((await sessionBob.publier()).statut).toBe('confirme')
    expect(contenuDe(await lireFichier(cheminSource, configuration.token2 as string)))
      .toContain('Travail non publié de Bob')
    console.log('[banc D1] source tenue ailleurs — calculée sur la version publiée, candidat du tiers intact')
    await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })
    nettoyer(alice, bob)
  })

  it('un repère absent de la version publiée suspend le geste sans commit', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('d4', { corpus: corpusAvecCas({ e1: 'Entretien 1' }) })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'd4' })
    // La version publiée ne porte pas le repère demandé.
    await publierEntretiens(p, { e1: entretienPublie('Version publiée', []) })
    const avant = await commitsTouchant(`${racine}/corpus.json`)

    const commande = commandeRattachement('e1', 'p-absent')
    await expect(p.transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow("La référence de passage n'existe pas dans l'entretien")

    expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant)
    console.log('[banc D1] repère absent de la version publiée — geste suspendu, aucun commit de données')
    nettoyer(p)
  })

  it('mesure un tri complet, sans garder aucun entretien', { timeout: 90_000 }, async () => {
    const racine = await creerRacine('d5', {
      corpus: corpusAvecEntretiens({ e1: 'Un', e2: 'Deux', e3: 'Trois' }),
    })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'd5' })
    await publierEntretiens(p, {
      e1: entretienPublie('Un mot deux trois', [], '2026-02-02T10:00:00.000Z'),
      e2: entretienPublie('Un', [], '2026-03-03T10:00:00.000Z'),
      e3: entretienPublie('Un mot', [], '2026-01-01T10:00:00.000Z'),
    })
    const avant = await commitsTouchant(`${racine}/corpus.json`)
    const debut = performance.now()

    const contexte = contexteTri(p, { observerVerrous: async () => ({ entrees: [], indisponible: false }) })
    const trie = await contexte.trierEntretiens('modif')

    const duree = performance.now() - debut
    // Le tri par modification range le plus récent en tête, et le commit ne
    // porte que le corpus : aucun entretien n'est gardé.
    expect(trie.ordreEntretiens).toEqual(['e2', 'e1', 'e3'])
    expect(await commitsTouchant(`${racine}/corpus.json`) - avant).toBe(1)
    const publie = JSON.parse(contenuDe(
      await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
    )) as CorpusFichier
    expect(publie.ordreEntretiens).toEqual(['e2', 'e1', 'e3'])
    console.log(
      `[banc D1] tri de contenu — 1 commit de données (corpus seul), `
      + `${p.requetes.length} requêtes, ${Math.round(duree)} ms`,
    )
    nettoyer(p)
  })

  it('le tri refuse un entretien tenu, avant toute acquisition', { timeout: 90_000 }, async () => {
    const { p, racine } = await racineAvecSource('d6')

    // Un entretien tenu par l'autre compte : l'observation le nomme, et le
    // refus tombe avant le bail du corpus.
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'd6b' })
    const { session: sessionBob } = sessionDe(bob, 'e1', 'd6b')
    await expect(sessionBob.ouvrir()).resolves.toMatchObject({ etat: 'edition' })

    const bailAvant = await commitsTouchant(cheminBailCorpus(racine))
    const observation: ObservationCoordinationDistante = {
      observerVerrous: async () => ({
        entrees: [{
          chemin: 'entretiens/e1.json',
          etag: null,
          contenu: { userId: 'user2', machineId: 'poste-d6b', acquiredAt: '' },
        }],
        indisponible: false,
      }),
    }
    const contexte = contexteTri(p, observation)
    await expect(contexte.trierEntretiens('longueur')).rejects.toThrow(/e1/)

    // Aucun bail de corpus n'a été pris : le refus précède la coordination.
    expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(bailAvant)
    console.log('[banc D1] tri avec entretien tenu ailleurs — refus nommé, aucun bail de corpus')
    await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })
    nettoyer(p, bob)
  })

  it('le tri refuse aussi un entretien que nous détenons, et une observation en panne', { timeout: 90_000 }, async () => {
    const { p } = await racineAvecSource('d7')
    const { session } = sessionDe(p, 'e1', 'd7')
    const contexte = contexteTri(p, { observerVerrous: async () => ({ entrees: [], indisponible: false }) }, session)
    await expect(contexte.ouvrirSessionEntretien('e1')).resolves.toMatchObject({ etat: 'edition' })
    await expect(contexte.trierEntretiens('modif')).rejects.toThrow(/fermeture de tous les entretiens/)
    await expect(contexte.fermerSession(contexte.ressourceEntretien('e1'))).resolves.toBe(true)

    // Une observation en panne vaut un refus, jamais une permission.
    const contextePanne = contexteTri(p, {
      observerVerrous: async () => ({ entrees: [], indisponible: true }),
    })
    await expect(contextePanne.trierEntretiens('modif')).rejects.toThrow(/détenteurs sont indisponibles/)
    console.log('[banc D1] tri sur session locale puis observation en panne — deux refus, aucun commit')
    await session.fermer()
    nettoyer(p)
  })

  it('un corpus trop large pour une seule publication est refusé avant le bail', { timeout: 90_000 }, async () => {
    const titres: Record<string, string> = {}
    for (let index = 0; index <= MAX_SOURCES_GARDEES; index += 1) {
      titres[`e${index}`] = `Entretien ${index}`
    }
    const racine = await creerRacine('d8', { corpus: corpusAvecCas(titres) })
    const p = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'd8' })
    const bailAvant = await commitsTouchant(cheminBailCorpus(racine))

    const commande = commandeRattachement('e1', 'p1')
    await expect(p.transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: (corpus) => Object.keys(corpus.membership) },
    )).rejects.toThrow(new RegExp(`${MAX_SOURCES_GARDEES} acceptés`))

    // Le refus tombe avant l'acquisition : même pas de commit de coordination.
    expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(bailAvant)
    console.log(`[banc D1] ${MAX_SOURCES_GARDEES + 1} sources — refus avant le bail, aucun commit`)
    nettoyer(p)
  })
  it('une coupure après l’envoi reste indéterminée, puis se réconcilie sans rejeu', { timeout: 120_000 }, async () => {
    const racine = await creerRacine('d9', { corpus: corpusAvecCas({ e1: 'Entretien 1' }) })
    const journalRepertoire = mkdtempSync(join(tmpdir(), 'sonal-banc-d9-journal-'))
    // Un proxy laisse tout passer, sauf la réponse du commit de données et
    // l'historique : au moment de publier, personne ne peut rien conclure.
    let historiqueIndisponible = true
    const serveur: Server = createServer(async (entree, sortie) => {
      const morceaux: Buffer[] = []
      for await (const morceau of entree) morceaux.push(morceau as Buffer)
      const corps = Buffer.concat(morceaux)
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
          body: entree.method === 'GET' || entree.method === 'HEAD' ? undefined : corps,
          signal: AbortSignal.timeout(15_000),
        })
        // Seul le commit de données est coupé : c'est lui qui porte le corpus
        // et la garde de source, et sa réponse doit se perdre.
        if (entree.method === 'POST' && chemin.endsWith('/repository/commits')) {
          const titre = (JSON.parse(corps.toString('utf8')) as { commit_message?: string }).commit_message
          if (titre?.startsWith('Sonal op-')) {
            console.log(`[banc D1] proxy — commit de données coupé : ${titre} (amont ${reponse.status})`)
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

    const adresse = serveur.address() as AddressInfo
    const instance = `http://127.0.0.1:${adresse.port}`
    try {
      const avant = pile({
        racine,
        jeton: configuration.token1 as string,
        userId: 'user1',
        sessionId: 'd9',
        instance,
        journalRepertoire,
      })
      await publierEntretiens(avant, { e1: entretienPublie('Réponse de la personne', ['p1']) })
      const commande = commandeRattachement('e1', 'p1')
      const sourceAvant = contenuDe(
        await lireFichier(`${racine}/entretiens/e1.json`, configuration.token1 as string),
      )

      // Le résultat est indéterminé : l'appelant l'ignore, et toute nouvelle
      // transaction sur le corpus reste bloquée jusqu'à réconciliation.
      await expect(avant.transactions.executerDefinitionsAvecSources(
        (store) => store.casCommander(commande),
        { deduire: deduireSourcesCas(commande) ?? (() => []) },
      )).rejects.toThrow(/n’a pas été confirmée/)
      expect(avant.journal.transactionsCorpusJournalisees()).toHaveLength(1)
      expect(avant.transactions.transactionReconciliee()).toBe(false)
      await expect(avant.transactions.executerDefinitions(
        (store) => store.ajouterCategorie('Thème après la coupure', null),
      )).rejects.toThrow(/résultat connu/)
      // Le miroir n'a rien reçu de cette opération.
      expect(avant.lireLocal().cas?.['cas-1']?.rattachements ?? []).toHaveLength(0)
      nettoyer(avant)

      // L'application redémarre, l'historique répond de nouveau : la
      // réconciliation vérifie le commit retrouvé action par action, garde de
      // source comprise, et rien n'est rejoué.
      historiqueIndisponible = false
      const apres = pile({
        racine,
        jeton: configuration.token1 as string,
        userId: 'user1',
        sessionId: 'd9',
        instance,
        journalRepertoire,
      })
      const [entree] = apres.journal.transactionsCorpusJournalisees()
      const reconciliateur = new ReconciliateurPublicationGitLab(apres.depot, apres.journal)
      expect((await reconciliateur.reconcilier(entree)).statut).toBe('confirme')
      apres.journal.supprimer(entree.operationId)
      expect(apres.transactions.transactionReconciliee()).toBe(true)

      const publie = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, configuration.token1 as string),
      )) as CorpusFichier
      expect(publie.cas?.['cas-1']?.rattachements).toHaveLength(1)
      // La source est restée intacte : la garde portée par le commit était pure.
      expect(contenuDe(await lireFichier(`${racine}/entretiens/e1.json`, configuration.token1 as string)))
        .toBe(sourceAvant)
      console.log('[banc D1] coupure après envoi — commit retrouvé, garde de source vérifiée, aucun rejeu')
      nettoyer(apres)
    } finally {
      await new Promise<void>((resolve) => serveur.close(() => resolve()))
      rmSync(journalRepertoire, { recursive: true, force: true })
    }
  })
})

if (!configurationPresente) {
  describe.skip('Sources GitLab réelles — configuration absente', () => {
    it('charger le fichier qualification.env et NODE_EXTRA_CA_CERTS pour activer le banc', () => {})
  })
}
