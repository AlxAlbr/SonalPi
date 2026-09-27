/**
 *  Qualification des écritures d'entretien depuis les vues corpus, sur une
 *  instance réelle.
 *
 *  Elle joue à deux comptes les scénarios qui ne peuvent pas être simulés :
 *  exclusion par le bail, garde croisée du corpus, réutilisation de notre propre
 *  session, lot mêlant succès et refus, réponse perdue, arrêt avant l'écriture
 *  locale, et requête qui n'atteint jamais le serveur.
 *
 *  Le banc reste désactivé sans variables `GITLAB_*` : un scénario sauté n'est
 *  pas une qualification, et les deux capacités GitLab restent fermées tant que
 *  ces preuves manquent.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MiroirDistant } from '../../src/main/distant/miroir'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import type { CorpusFichier, EntretienFichier, ItemLotValeur } from '../../src/shared/format'
import {
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
  type Pile,
} from './qualificationBanc'

definirPrefixeBanc('f')

const decrire = configurationPresente ? describe : describe.skip
const JETON1 = configuration.token1 as string
const JETON2 = configuration.token2 as string

/** Un entretien portant une occurrence du pseudonyme, pour que la règle ait
 *  réellement quelque chose à poser. */
const TEXTE = 'Alice est présente au premier entretien.'

function corpusEcritures(): CorpusFichier {
  const corpus = corpusAvecEntretiens({ e1: 'Entretien 1', e2: 'Entretien 2' })
  corpus.variables.v1 = {
    id: 'v1',
    lib: 'Statut',
    portee: 'entretien',
    priv: false,
    ordre: 0,
    vExport: 1,
    modalites: [{ id: 'm1', lib: 'Oui', mExport: 1 }],
  }
  corpus.reglesAnon.r1 = { id: 'r1', entite: ['Alice'], pseudos: ['A.'] }
  return corpus
}

interface Banc { alice: Pile; bob: Pile; racine: string; corpus: CorpusFichier }

/** Deux postes, deux entretiens publiés et un miroir par poste. */
async function preparer(suffixe: string, destinationId?: string): Promise<Banc> {
  const corpus = corpusEcritures()
  const racine = await creerRacine(suffixe, { corpus })
  const alice = pile({
    racine,
    jeton: JETON1,
    userId: 'user1',
    sessionId: `${suffixe}-alice`,
    destinationId,
    corpusLocal: structuredClone(corpus),
  })
  const bob = pile({
    racine,
    jeton: JETON2,
    userId: 'user2',
    sessionId: `${suffixe}-bob`,
    corpusLocal: structuredClone(corpus),
  })
  await alice.depot.publierCommit('main', `qualification écritures ${suffixe}`, [
    {
      action: 'create',
      file_path: `${racine}/entretiens/e1.json`,
      content: entretienPublie(TEXTE),
    },
    {
      action: 'create',
      file_path: `${racine}/entretiens/e2.json`,
      content: entretienPublie('Bob est absent au second entretien.'),
    },
  ])
  for (const poste of [alice, bob]) poste.requetes.length = 0
  return { alice, bob, racine, corpus }
}

function lireEntretienLocal(dossier: string, id: string): EntretienFichier {
  return JSON.parse(
    readFileSync(join(dossier, `entretiens/${id}.json`), 'utf8'),
  ) as EntretienFichier
}

async function lireEntretienDistant(
  racine: string,
  id: string,
  jeton = JETON1,
): Promise<EntretienFichier> {
  return JSON.parse(
    contenuDe(await lireFichier(`${racine}/entretiens/${id}.json`, jeton)),
  ) as EntretienFichier
}

function valeur(idVar = 'v1', idMod = 'm1', entretienId = 'e1'): ItemLotValeur {
  return { entretienId, cible: { type: 'entretien' }, idVar, idMod }
}

/** Nombre de commits de données réellement envoyés par la pile. */
function commitsDeDonnees(p: Pile): number {
  return p.requetes.filter((requete) =>
    requete.startsWith('POST ') && requete.endsWith('/repository/commits')).length
}

/** Contexte réel du poste : c'est lui qui regroupe les items par entretien. */
function contexteDe(p: Pile) {
  const miroir = {
    tirer: async () => ({
      telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString(),
    }),
  } as unknown as MiroirDistant
  return new ContexteGitLab(
    `qualification-f-${p.racine}`,
    p.store,
    miroir,
    (ressource, cheminRelatif) => ouvrirSession(p, `${p.racine}/${cheminRelatif}`, 'e1'),
    p.transactions,
  )
}

/** Miroir réel, pour prouver qu'un tirage répare le miroir après un arrêt. */
function miroirReel(p: Pile, dossier: string): MiroirDistant {
  const client = new ClientGitLab({
    urlInstance: configuration.url as string,
    projetId: Number(configuration.projetId),
    autorisation: { type: 'jeton-prive', jeton: JETON1 },
  })
  const instantane = new InstantaneLectureGitLab(client, 'main', p.racine)
  return new MiroirDistant(dossier, () => instantane.ouvrir(), {
    fournisseur: 'gitlab',
    destinationId: `qualification-f-miroir-${p.racine}`,
  })
}

decrire.sequential('écritures d’entretien depuis les vues corpus — instance réelle', () => {
  it('pose une valeur sous bail court, garde le corpus et mesure le coût', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('valeur')
    try {
      const corpusAvant = await lireFichier(`${racine}/corpus.json`, JETON1)
      alice.requetes.length = 0
      const debut = performance.now()
      await alice.transactions.poserValeursEntretien('e1', [valeur()])
      const duree = performance.now() - debut

      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({ v1: 'm1' })
      // Le miroir n'est écrit qu'après la confirmation.
      expect(lireEntretienLocal(alice.dossier, 'e1').meta.valeursGen).toEqual({ v1: 'm1' })
      // La garde de corpus est une action du commit, pas un bail : le corpus
      // garde son contenu et sa version, et le dépôt ne reçoit qu'un commit
      // de données.
      const corpusApres = await lireFichier(`${racine}/corpus.json`, JETON1)
      expect(corpusApres.corps.last_commit_id).toBe(corpusAvant.corps.last_commit_id)
      expect(corpusApres.corps.content).toBe(corpusAvant.corps.content)
      expect(commitsDeDonnees(alice)).toBe(3)
      console.log(
        `[banc F] valeur — 1 commit de données, 3 commits au total, `
        + `${alice.requetes.length} requêtes, ${Math.round(duree)} ms`,
      )
    } finally {
      nettoyer(alice)
    }
  })

  it('applique une règle et n’écrit jamais de référence invalide', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('regle')
    try {
      // Le filtre `path` de l'API ne compte un fichier que par son nom : seul
      // un dossier, ou un écart sur la durée du geste, est un compte fiable.
      const avant = await commitsTouchant(`${racine}/entretiens`)
      const resultat = await alice.transactions.appliquerRegleEntretien('e1', {
        entretienId: 'e1',
        regleId: 'r1',
        exception: [{ from: 0, to: 5 }],
      })

      expect(resultat).toMatchObject({ titre: 'Entretien 1' })
      const publie = await lireEntretienDistant(racine, 'e1')
      expect(publie.annotations).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'anon', regle: 'r1', etat: 'anonymise' }),
        expect.objectContaining({ type: 'anon', regle: 'r1', etat: 'exception' }),
      ]))
      expect(lireEntretienLocal(alice.dossier, 'e1').annotations).toEqual(publie.annotations)
      // Un seul commit a touché le dossier des entretiens : celui des données.
      expect(await commitsTouchant(`${racine}/entretiens`) - avant).toBe(1)
      expect(commitsDeDonnees(alice)).toBe(3)
    } finally {
      nettoyer(alice)
    }
  })

  it('nomme le détenteur et ne touche à rien, même sans badge observé', { timeout: 120_000 }, async () => {
    const { alice, bob, racine } = await preparer('exclusion')
    const session = ouvrirSession(bob, `${racine}/entretiens/e1.json`, 'e1')
    try {
      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      const avant = await commitsTouchant(`${racine}/entretiens`)

      // Aucune observation de baux n'est jouée ici : la décision appartient à
      // l'acquisition, jamais à l'information affichée.
      await expect(alice.transactions.poserValeursEntretien('e1', [valeur()]))
        .rejects.toThrow(/user2/)

      expect(await commitsTouchant(`${racine}/entretiens`)).toBe(avant)
      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({})
      expect(existsSync(join(alice.dossier, 'entretiens/e1.json'))).toBe(false)
      expect(alice.journal.lister()).toHaveLength(0)
      await expect(session.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('refuse le même compte venu d’une autre session', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('autre-session')
    const autre = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'autre-session-poste2',
      corpusLocal: structuredClone(corpusEcritures()),
    })
    const session = ouvrirSession(autre, `${racine}/entretiens/e1.json`, 'e1')
    try {
      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      // Même compte, autre session : le refus reste nominal, et il indique
      // l'échéance plutôt qu'un nom d'utilisateur qui ne distingue personne.
      await expect(alice.transactions.poserValeursEntretien('e1', [valeur()]))
        .rejects.toThrow(/retenu par ce poste/)
      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({})
      await expect(session.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, autre)
    }
  })

  it('réutilise notre session sans prendre de second bail', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('session-locale')
    try {
      // Le poste a déjà l'entretien ouvert et publié : le miroir porte sa copie.
      writeFileSync(
        join(alice.dossier, 'entretiens/e1.json'),
        entretienPublie(TEXTE),
        'utf8',
      )
      const contexte = contexteDe(alice)
      await expect(contexte.ouvrirEntretienPourEdition('e1'))
        .resolves.toMatchObject({ acces: 'edition' })
      alice.requetes.length = 0

      const resultat = await contexte.poserValeurLot([valeur()])

      expect(resultat).toEqual({ succes: ['e1'], echecs: [] })
      // La valeur est publiée par le chemin de la session : une seule requête
      // de commit, celle du candidat, et aucun second bail sur ce fichier.
      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({ v1: 'm1' })
      expect(commitsDeDonnees(alice)).toBe(1)
      expect(contexte.etatSession(contexte.ressourceEntretien('e1')).etat).toBe('edition')

      // Le second entretien, lui, passe par la transaction courte.
      alice.requetes.length = 0
      const second = await contexte.poserValeurLot([valeur('v1', 'm1', 'e2')])
      expect(second).toEqual({ succes: ['e2'], echecs: [] })
      expect((await lireEntretienDistant(racine, 'e2')).meta.valeursGen).toEqual({ v1: 'm1' })
      expect(commitsDeDonnees(alice)).toBe(3)
      await expect(contexte.fermerEntretien('e1')).resolves.toMatchObject({ fermee: true })
    } finally {
      nettoyer(alice)
    }
  })

  it('refuse le commit entier quand l’entretien bouge entre la lecture et l’envoi', { timeout: 120_000 }, async () => {
    const { alice, bob, racine } = await preparer('course-entretien')
    try {
      alice.avantCommitDeDonnees(async (p) => {
        await p.depot.publierCommit('main', 'qualification F: entretien modifié', [{
          action: 'update',
          file_path: `${p.racine}/entretiens/e1.json`,
          content: entretienPublie('Texte changé par un tiers.'),
        }])
      })

      await expect(alice.transactions.poserValeursEntretien('e1', [valeur()]))
        .rejects.toThrow(/changé|confirmée/)

      // Le concurrent est intact, et notre candidat n'est pas installé.
      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({})
      expect(existsSync(join(alice.dossier, 'entretiens/e1.json'))).toBe(false)
      expect(alice.journal.lister()).toHaveLength(0)
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('relit le corpus et refuse une modalité supprimée pendant la préparation', { timeout: 120_000 }, async () => {
    const { alice, bob, racine } = await preparer('course-corpus')
    try {
      alice.avantCommitDeDonnees(async (p) => {
        const lu = JSON.parse(contenuDe(
          await lireFichier(`${p.racine}/corpus.json`, JETON1),
        )) as CorpusFichier
        lu.variables.v1!.modalites = []
        await p.depot.publierCommit('main', 'qualification F: modalité retirée', [{
          action: 'update',
          file_path: `${p.racine}/corpus.json`,
          content: JSON.stringify(lu, null, 2),
        }])
      })

      await expect(alice.transactions.poserValeursEntretien('e1', [valeur()]))
        .rejects.toThrow(/modalité.*n’existe plus/)

      // Aucune référence invalide n'a été publiée, ni du côté de l'entretien
      // ni du côté du miroir.
      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({})
      expect(existsSync(join(alice.dossier, 'entretiens/e1.json'))).toBe(false)
      const corpusApres = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, JETON1),
      )) as CorpusFichier
      expect(corpusApres.variables.v1!.modalites).toEqual([])
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('relit une fois et aboutit quand le corpus bouge indépendamment', { timeout: 120_000 }, async () => {
    const { alice, bob, racine } = await preparer('corpus-independant')
    try {
      alice.avantCommitDeDonnees(async (p) => {
        // Un thème ajouté entre la lecture et l'envoi ne touche ni la variable
        // ni l'entretien : seule la garde du corpus devient périmée.
        await bob.transactions.executerDefinitions(
          (store) => store.ajouterCategorie('Thème concurrent', null),
        )
      })

      await alice.transactions.poserValeursEntretien('e1', [valeur()])

      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({ v1: 'm1' })
      const corpusApres = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, JETON1),
      )) as CorpusFichier
      expect(Object.values(corpusApres.codebook).map((theme) => theme.nom))
        .toContain('Thème concurrent')
      // Le premier envoi était refusé : un seul commit de données a abouti.
      expect(commitsDeDonnees(alice)).toBe(4)
      expect(alice.journal.lister()).toHaveLength(0)
      console.log(
        `[banc F] corpus modifié indépendamment — une relecture, `
        + `${commitsDeDonnees(alice)} envois de commit, 1 commit de données`,
      )
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('garde les succès d’un lot mêlé et nomme le refus de l’entretien tenu', { timeout: 180_000 }, async () => {
    const { alice, bob, racine } = await preparer('lot-partial')
    const session = ouvrirSession(bob, `${racine}/entretiens/e2.json`, 'e2')
    try {
      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      const contexte = contexteDe(alice)
      alice.requetes.length = 0
      const debut = performance.now()

      const resultat = await contexte.poserValeurLot([valeur('v1', 'm1', 'e1'), valeur('v1', 'm1', 'e2')])

      expect(resultat.succes).toEqual(['e1'])
      expect(resultat.echecs).toHaveLength(1)
      expect(resultat.echecs[0].id).toBe('e2')
      expect(resultat.echecs[0].raison).toMatch(/user2/)
      // Le miroir ne suit que les succès.
      expect(lireEntretienLocal(alice.dossier, 'e1').meta.valeursGen).toEqual({ v1: 'm1' })
      expect(existsSync(join(alice.dossier, 'entretiens/e2.json'))).toBe(false)
      expect((await lireEntretienDistant(racine, 'e2')).meta.valeursGen).toEqual({})

      // La pseudonymisation suit la même politique, entretien par entretien.
      const reponses = await contexte.appliquerRegleLot([
        { entretienId: 'e1', regleId: 'r1' },
        { entretienId: 'e2', regleId: 'r1' },
      ])
      expect(reponses.succes.map((s) => s.id)).toEqual(['e1'])
      expect(reponses.echecs.map((e) => e.id)).toEqual(['e2'])
      console.log(
        `[banc F] lot mêlé (1 succès, 1 refus) — ${alice.requetes.length} requêtes, `
        + `${Math.round(performance.now() - debut)} ms, ${commitsDeDonnees(alice)} envois de commit`,
      )
      await expect(session.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('retrouve une réponse perdue sans envoyer un second commit de données', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('reponse-perdue')
    try {
      alice.perdreReponseDuCommitDeDonnees()
      await alice.transactions.appliquerRegleEntretien('e1', {
        entretienId: 'e1',
        regleId: 'r1',
        exception: [{ from: 0, to: 5 }],
      })

      expect(lireEntretienLocal(alice.dossier, 'e1').annotations).toEqual(
        (await lireEntretienDistant(racine, 'e1')).annotations,
      )
      expect(alice.journal.lister()).toHaveLength(0)
      // Acquisition, données, libération : le commit de données n'est parti
      // qu'une fois, la réponse perdue n'a pas provoked de rejeu.
      expect(commitsDeDonnees(alice)).toBe(3)
    } finally {
      nettoyer(alice)
    }
  })

  it('garde un résultat indéterminé, puis réconcilie au redémarrage sans rejeu', { timeout: 180_000 }, async () => {
    const { alice, racine } = await preparer('arret', 'arret')
    try {
      alice.perdreReponseDuCommitDeDonnees()
      alice.rendreHistoriqueIndisponible()

      // Le commit est passé, sa trace est illisible : rien ne peut être affirmé.
      await expect(alice.transactions.poserValeursEntretien('e1', [valeur()]))
        .rejects.toThrow(/n’a pas été confirmée/)
      expect(alice.journal.lister()).toHaveLength(1)
      expect(alice.journal.lister()[0].nature).toBe('transaction-entretien')
      // Une transaction de corpus n'est pas bloquée par là.
      expect(alice.transactions.transactionReconciliee()).toBe(true)
      expect(existsSync(join(alice.dossier, 'entretiens/e1.json'))).toBe(false)

      alice.rendreHistorique()
      const avantReprise = await commitsTouchant(`${racine}/entretiens`)
      const relance = pile({
        racine,
        jeton: JETON1,
        userId: 'user1',
        sessionId: 'arret-relance',
        destinationId: 'arret',
        dossier: alice.dossier,
      })
      await reprendreOperationsGitLab({
        depot: relance.depot,
        coordination: relance.coordination,
        journal: relance.journal,
        dirMiroir: relance.dossier,
      })

      // La reprise confirme la publication et rend le bail, sans rien republier.
      expect(await commitsTouchant(`${racine}/entretiens`)).toBe(avantReprise)
      expect(relance.journal.lister()).toEqual([])

      // Le miroir, lui, se répare par le tirage normal.
      const miroir = miroirReel(relance, relance.dossier)
      await miroir.tirer([])
      expect(lireEntretienLocal(relance.dossier, 'e1').meta.valeursGen).toEqual({ v1: 'm1' })

      // Le geste suivant repart normalement : rien ne le bloque.
      await expect(relance.transactions.poserValeursEntretien('e1', [valeur('v1', 'm1')]))
        .resolves.toBeUndefined()
      nettoyer(alice, relance)
    } finally {
      nettoyer(alice)
    }
  })

  it('reconnaît une requête jamais partie et la relit une seule fois', { timeout: 120_000 }, async () => {
    const { alice, racine } = await preparer('jamais-parti')
    try {
      const avant = await commitsTouchant(`${racine}/entretiens`)
      alice.nePasEnvoyerLeProchainCommitDeDonnees()
      // Le commit de données n'atteint pas le serveur. Son absence est
      // certaine : le geste relit l'entretien et le corpus une fois, puis
      // aboutit — un seul commit de données atteint le dépôt.
      await alice.transactions.poserValeursEntretien('e1', [valeur()])

      expect((await lireEntretienDistant(racine, 'e1')).meta.valeursGen).toEqual({ v1: 'm1' })
      expect(await commitsTouchant(`${racine}/entretiens`) - avant).toBe(1)
      expect(alice.journal.lister()).toHaveLength(0)
      expect(lireEntretienLocal(alice.dossier, 'e1').meta.valeursGen).toEqual({ v1: 'm1' })
      console.log(
        `[banc F] requête jamais partie — ${commitsDeDonnees(alice)} envois de commit, `
        + 'un seul commit de données dans le dépôt',
      )
    } finally {
      nettoyer(alice)
    }
  })
})

describe.skip('écritures d’entretien GitLab — configuration absente', () => {
  it('charger le fichier qualification.env et NODE_TLS_REJECT_UNAUTHORIZED=0 pour activer le banc', () => {})
})
