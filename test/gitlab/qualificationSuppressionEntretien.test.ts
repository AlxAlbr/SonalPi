/**
 *  Qualification de la suppression d'un entretien sur une instance réelle.
 *
 *  Elle joue les scénarios du lot E à deux comptes : retrait et archive dans
 *  un même commit, exclusion effective par les deux baux, réconciliation sans
 *  rejeu, et récupération locale après un arrêt. Le banc reste désactivé sans
 *  variables `GITLAB_*` : un scénario sauté n'est pas une qualification, et la
 *  capacité reste fermée tant que ces quatre preuves manquent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MiroirDistant } from '../../src/main/distant/miroir'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { suffixeArchive } from '../../src/main/gitlab/suppressionEntretien'
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
  ouvrirSession,
  pile,
  type Pile,
} from './qualificationBanc'

definirPrefixeBanc('e')

const decrire = configurationPresente ? describe : describe.skip
const JETON1 = configuration.token1 as string
const JETON2 = configuration.token2 as string

/** Corpus de qualification portant un recueil qui reprend `e1`, et un
 *  entretien `e2` qui doit survivre à la suppression de `e1`. */
function corpusDeSuppression(): CorpusFichier {
  const corpus = corpusAvecEntretiens({ e1: 'Entretien 1', e2: 'Entretien 2' })
  corpus.recueils = {
    r1: {
      id: 'r1',
      nom: 'Recueil de travail',
      creeLe: '2026-01-01T00:00:00.000Z',
      modifieLe: '2026-01-01T00:00:00.000Z',
      modeTexte: 'markdown',
      items: [{
        id: 'i1',
        type: 'passage',
        source: { entretienId: 'e1', repereId: 'r1' },
        commentaireEditorial: '',
      }],
    },
  }
  return corpus
}

/** Miroir d'un poste qui a déjà ouvert l'entretien : sans ces fichiers, il
 *  n'y aurait rien à archiver de ce côté. */
function peuplerLeMiroir(p: Pile, id: string, suffixe = ''): void {
  writeFileSync(
    cheminLocal(p, `entretiens/${id}.json`),
    entretienPublie(`Version publiée de ${id}`),
    'utf8',
  )
  writeFileSync(
    cheminLocal(p, `entretiens/${id}.json.bak1`),
    entretienPublie(`Sauvegarde de ${id}`),
    'utf8',
  )
  mkdirSync(join(p.dossier, 'png'), { recursive: true })
  writeFileSync(cheminLocal(p, `png/${id}${suffixe}.png`), 'forme d’onde', 'utf8')
}

/** Dépôt d'un entretien publié, comme le ferait une session qui se ferme. */
async function publierEntretien(
  p: Pile,
  racine: string,
  id: string,
  contenu = entretienPublie(`Version publiée de ${id}`),
): Promise<void> {
  await p.depot.publierCommit('main', `qualification E: ${id} publié`, [{
    action: 'create',
    file_path: `${racine}/entretiens/${id}.json`,
    content: contenu,
  }])
}

/** Miroir neuf : il ne connaît rien du retrait et ignore le dossier d'archive. */
function tirerDansUnMiroirNeuf(racine: string, dossier: string): CorpusFichier {
  mkdirSync(dossier, { recursive: true })
  const client = new ClientGitLab({
    urlInstance: configuration.url as string,
    projetId: Number(configuration.projetId),
    autorisation: { type: 'jeton-prive', jeton: JETON2 },
  })
  const instantane = new InstantaneLectureGitLab(client, 'main', racine)
  const miroir = new MiroirDistant(dossier, () => instantane.ouvrir(), {
    fournisseur: 'gitlab',
    destinationId: `qualification-e-neuf-${racine}`,
  })
  return miroir.tirer([]).then(() =>
    JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier)
}

function cheminLocal(p: Pile, chemin: string): string {
  return join(p.dossier, chemin)
}

decrire('suppression d’un entretien GitLab — qualification à deux comptes', () => {
  it('retire et archive dans un seul commit, et n’en laisse aucune trace locale', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('nominal', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'suppression-alice',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')
    await publierEntretien(alice, racine, 'e2')
    // Les sauvegardes et le PNG sont des affaires locales, jamais du dépôt.
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json.bak1'),
      entretienPublie('sauvegarde'),
      'utf8',
    )
    mkdirSync(join(alice.dossier, 'png'), { recursive: true })
    writeFileSync(cheminLocal(alice, 'png/e1.png'), 'forme d’onde', 'utf8')
    // Le miroir a déjà reçu l'entretien : le poste va l'archiver, lui aussi.
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json'),
      entretienPublie('Version publiée de e1'),
      'utf8',
    )
    writeFileSync(
      cheminLocal(alice, 'entretiens/e2.json'),
      entretienPublie('Version publiée de e2'),
      'utf8',
    )

    const neuf = pile({
      racine,
      jeton: JETON2,
      userId: 'user2',
      sessionId: 'suppression-neuf',
    })

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      expect(impact.entretienId).toBe('e1')

      const avant = await commitsTouchant(`${racine}/corpus.json`)
      alice.requetes.length = 0
      const debut = performance.now()
      const apres = await alice.transactions.supprimerEntretien('e1', impact)
      const duree = performance.now() - debut

      expect(apres.membership.e1).toBeUndefined()
      expect(apres.ordreEntretiens).toEqual(['e2'])
      expect(await commitsTouchant(`${racine}/corpus.json`) - avant).toBe(1)
      // Deux acquisitions, un commit de données, deux libérations.
      expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(3)
      // Le filtre `path` de l'API est un préfixe : l'archive se compte par
      // son dossier, et un seul commit doit l'avoir créée.
      expect(await commitsTouchant(`${racine}/corbeille`)).toBe(1)
      console.log(
        `[banc E] suppression nominale — 1 commit de données, 5 commits au total, `
        + `${alice.requetes.length} requêtes, ${Math.round(duree)} ms`,
      )

      // Le dépôt ne connaît plus l'entretien ; l'archive en porte le contenu.
      expect((await lireFichier(`${racine}/entretiens/e1.json`, JETON1)).statut).toBe(404)
      const archive = await lireFichier(`${racine}/corbeille/e1.json`, JETON1)
      expect(contenuDe(archive)).toBe(entretienPublie('Version publiée de e1'))

      // Le miroir d'origine a archivé JSON, sauvegarde et PNG, et garde e2.
      expect(existsSync(cheminLocal(alice, 'corbeille/e1.json'))).toBe(true)
      expect(existsSync(cheminLocal(alice, 'corbeille/e1.json.bak1'))).toBe(true)
      expect(existsSync(cheminLocal(alice, 'corbeille/e1.png'))).toBe(true)
      expect(existsSync(cheminLocal(alice, 'entretiens/e1.json'))).toBe(false)
      expect(existsSync(cheminLocal(alice, 'entretiens/e2.json'))).toBe(true)
      expect(alice.lireLocal().membership.e1).toBeUndefined()

      // Un miroir neuf tire le membership sans l'entretien, sans archive.
      const corpusNeuf = await tirerDansUnMiroirNeuf(racine, neuf.dossier)
      expect(corpusNeuf.membership.e1).toBeUndefined()
      expect(corpusNeuf.membership.e2).toBeDefined()
      expect(existsSync(cheminLocal(neuf, 'entretiens/e1.json'))).toBe(false)
      expect(existsSync(cheminLocal(neuf, 'corbeille'))).toBe(false)
    } finally {
      nettoyer(alice, neuf)
    }
  })

  it('nomme l’autre compte et ne touche à rien quand il tient l’entretien', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('tenu', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'tenu-alice',
      corpusLocal: corpus,
    })
    const bob = pile({
      racine,
      jeton: JETON2,
      userId: 'user2',
      sessionId: 'tenu-bob',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')
    await publierEntretien(alice, racine, 'e2')
    const sessionBob = ouvrirSession(bob, `${racine}/entretiens/e1.json`, 'e1')

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      await expect(sessionBob.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      const avant = await commitsTouchant(`${racine}/corpus.json`)

      await expect(alice.transactions.supprimerEntretien('e1', impact))
        .rejects.toThrow(/user2/)

      expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant)
      expect((await lireFichier(`${racine}/entretiens/e1.json`, JETON1)).statut).toBe(200)
      expect((await lireFichier(`${racine}/corbeille/e1.json`, JETON1)).statut).toBe(404)
      expect(alice.lireLocal().membership.e1).toBeDefined()
      await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('refuse si l’autre compte ouvre entre les deux acquisitions', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('course-ouverture', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'course-alice',
      corpusLocal: corpus,
    })
    const bob = pile({
      racine,
      jeton: JETON2,
      userId: 'user2',
      sessionId: 'course-bob',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')
    const sessionBob = ouvrirSession(bob, `${racine}/entretiens/e1.json`, 'e1')

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      alice.apresProchaineAcquisition(async () => {
        await sessionBob.ouvrir()
      })

      await expect(alice.transactions.supprimerEntretien('e1', impact))
        .rejects.toThrow(/user2/)

      expect((await lireFichier(`${racine}/entretiens/e1.json`, JETON1)).statut).toBe(200)
      expect((await lireFichier(`${racine}/corbeille/e1.json`, JETON1)).statut).toBe(404)
      expect(alice.lireLocal().membership.e1).toBeDefined()
      await expect(sessionBob.fermer()).resolves.toEqual({ fermee: true })
    } finally {
      nettoyer(alice, bob)
    }
  })

  it('retrouve le commit d’une réponse perdue et n’applique le plan local qu’une fois', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('reponse-perdue', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'perdue-alice',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json'),
      entretienPublie('Version publiée de e1'),
      'utf8',
    )

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      alice.perdreReponseDuCommitDeDonnees()

      // Le commit est passé, sa réponse est perdue : la réconciliation le
      // retrouve, et la suppression est confirmée sans second envoi.
      await expect(alice.transactions.supprimerEntretien('e1', impact)).resolves.toBeDefined()

      expect(await commitsTouchant(`${racine}/corbeille`)).toBe(1)
      expect(await commitsTouchant(cheminBailCorpus(racine))).toBe(3)
      expect(alice.journal.lister()).toEqual([])
      expect(alice.lireLocal().membership.e1).toBeUndefined()
      expect(existsSync(cheminLocal(alice, 'corbeille/e1.json'))).toBe(true)
    } finally {
      nettoyer(alice)
    }
  })

  it('reprend l’archive locale après un arrêt, sans republier le commit', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('arret', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'arret-alice',
      destinationId: 'arret',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json'),
      entretienPublie('Version publiée de e1'),
      'utf8',
    )
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json.bak1'),
      entretienPublie('sauvegarde'),
      'utf8',
    )

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      alice.perdreReponseDuCommitDeDonnees()
      alice.rendreHistoriqueIndisponible()
      // Ni le commit ni sa trace ne sont lisibles : l'application ne peut rien
      // affirmer, et l'entrée reste journalisée.
      await expect(alice.transactions.supprimerEntretien('e1', impact))
        .rejects.toThrow(/confirmée/)
      expect(alice.journal.suppressionsAInstaller()).toHaveLength(0)
      expect(alice.lireLocal().membership.e1).toBeDefined()
      expect(existsSync(cheminLocal(alice, 'corbeille/e1.json'))).toBe(false)

      // Un nouveau processus relit le même miroir et le même journal, sans
      // conserver les droits ni les objets en mémoire du premier.
      const relance = pile({
        racine,
        jeton: JETON1,
        userId: 'user1',
        sessionId: 'arret-relance',
        destinationId: 'arret',
        dossier: alice.dossier,
      })
      const avantReprise = await commitsTouchant(`${racine}/corpus.json`)
      await reprendreOperationsGitLab({
        depot: relance.depot,
        coordination: relance.coordination,
        journal: relance.journal,
        dirMiroir: relance.dossier,
      })

      expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avantReprise)
      expect(relance.journal.lister()).toEqual([])
      expect(relance.lireLocal().membership.e1).toBeUndefined()
      expect(existsSync(cheminLocal(relance, 'corbeille/e1.json'))).toBe(true)
      expect(existsSync(cheminLocal(relance, 'corbeille/e1.json.bak1'))).toBe(true)
      // Un second passage ne déplace rien de plus.
      await reprendreOperationsGitLab({
        depot: relance.depot,
        coordination: relance.coordination,
        journal: relance.journal,
        dirMiroir: relance.dossier,
      })
      expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avantReprise)
    } finally {
      nettoyer(alice)
    }
  })

  it('traite une collision d’archive des deux côtés, sans écrasement', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('collision', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'collision-alice',
      corpusLocal: corpus,
      operation: 'operation-collision',
    })
    await publierEntretien(alice, racine, 'e1')
    const ancien = 'archive déjà présente'
    await alice.depot.publierCommit('main', 'qualification E: archive occupée', [{
      action: 'create',
      file_path: `${racine}/corbeille/e1.json`,
      content: ancien,
    }])
    mkdirSync(join(alice.dossier, 'corbeille'), { recursive: true })
    writeFileSync(cheminLocal(alice, 'corbeille/e1.json'), ancien, 'utf8')
    writeFileSync(
      cheminLocal(alice, 'entretiens/e1.json'),
      entretienPublie('Version publiée de e1'),
      'utf8',
    )

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      await alice.transactions.supprimerEntretien('e1', impact)

      const suffixe = suffixeArchive('operation-collision')
      const premier = await lireFichier(`${racine}/corbeille/e1.json`, JETON1)
      expect(contenuDe(premier)).toBe(ancien)
      const second = await lireFichier(`${racine}/corbeille/e1.${suffixe}.json`, JETON1)
      expect(contenuDe(second)).toBe(entretienPublie('Version publiée de e1'))
      // Côté local, la corbeille suit exactement la même règle.
      expect(readFileSync(cheminLocal(alice, 'corbeille/e1.json'), 'utf8')).toBe(ancien)
      expect(existsSync(cheminLocal(alice, `corbeille/e1.json.${suffixe}`))).toBe(true)
    } finally {
      nettoyer(alice)
    }
  })

  it('refuse le commit entier quand l’entretien bouge entre la lecture et l’envoi', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('garde-entretien', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'garde-entretien-alice',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      alice.avantCommitDeDonnees(async (p) => {
        const observe = await lireFichier(`${racine}/entretiens/e1.json`, JETON2)
        await p.depot.publierCommit('main', 'qualification E: course sur l’entretien', [{
          action: 'update',
          file_path: `${racine}/entretiens/e1.json`,
          content: entretienPublie('Version concurrente de e1'),
          last_commit_id: observe.corps.last_commit_id,
        }])
      })

      await expect(alice.transactions.supprimerEntretien('e1', impact)).rejects.toThrow()

      expect(contenuDe(await lireFichier(`${racine}/entretiens/e1.json`, JETON1)))
        .toBe(entretienPublie('Version concurrente de e1'))
      expect((await lireFichier(`${racine}/corbeille/e1.json`, JETON1)).statut).toBe(404)
      expect(alice.lireLocal().membership.e1).toBeDefined()
    } finally {
      nettoyer(alice)
    }
  })

  it('refuse le commit entier quand le corpus bouge entre la lecture et l’envoi', { timeout: 120_000 }, async () => {
    const corpus = corpusDeSuppression()
    const racine = await creerRacine('garde-perimee', { corpus })
    const alice = pile({
      racine,
      jeton: JETON1,
      userId: 'user1',
      sessionId: 'garde-alice',
      corpusLocal: corpus,
    })
    await publierEntretien(alice, racine, 'e1')

    try {
      const impact = await alice.transactions.analyserSuppressionEntretien('e1')
      const avant = await commitsTouchant(`${racine}/corpus.json`)
      // Un autre poste modifie le corpus entre notre lecture et notre commit.
      alice.avantCommitDeDonnees(async (p) => {
        const observe = await lireFichier(`${racine}/corpus.json`, JETON2)
        const modifie: CorpusFichier = { ...JSON.parse(contenuDe(observe)), nom: 'Renommé entre-temps' }
        await p.depot.publierCommit('main', 'qualification E: course sur le corpus', [{
          action: 'update',
          file_path: `${racine}/corpus.json`,
          content: JSON.stringify(modifie, null, 2),
          last_commit_id: observe.corps.last_commit_id,
        }])
      })

      await expect(alice.transactions.supprimerEntretien('e1', impact)).rejects.toThrow()

      // La garde périmée a refusé tout le commit : ni l'entretien, ni l'archive.
      expect(await commitsTouchant(`${racine}/corpus.json`)).toBe(avant + 1)
      expect((await lireFichier(`${racine}/entretiens/e1.json`, JETON1)).statut).toBe(200)
      expect((await lireFichier(`${racine}/corbeille/e1.json`, JETON1)).statut).toBe(404)
      expect(alice.lireLocal().membership.e1).toBeDefined()
      const corpusDistant = JSON.parse(contenuDe(
        await lireFichier(`${racine}/corpus.json`, JETON1),
      )) as CorpusFichier
      expect(corpusDistant.membership.e1).toBeDefined()
      expect(corpusDistant.nom).toBe('Renommé entre-temps')
    } finally {
      nettoyer(alice)
    }
  })
})
