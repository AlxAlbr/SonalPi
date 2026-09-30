import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  JournalPublicationGitLab,
  ReconciliateurPublicationGitLab,
} from '../../src/main/gitlab/journalPublication'
import type {
  ActionCommitGitLab,
  DepotCommitsGitLab,
  FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'

class DepotJournal implements DepotCommitsGitLab {
  readonly fichiers = new Map<string, {
    contenu: string
    commitId: string
    executable: boolean
  }>()
  readonly commits: Array<{ id: string; title: string }> = []
  private compteur = 0

  async lireFichier(chemin: string): Promise<FichierGitLab | null> {
    const fichier = this.fichiers.get(chemin)
    return fichier ? { chemin, ...fichier } : null
  }

  async lireGardeFichier(chemin: string): Promise<{
    commitId: string
    executable: boolean
  } | null> {
    const fichier = this.fichiers.get(chemin)
    return fichier
      ? { commitId: fichier.commitId, executable: fichier.executable }
      : null
  }

  async rechercherCommits(_ref: string, recherche: string): Promise<Array<{ id: string; title: string }>> {
    return this.commits.filter((commit) => commit.title.includes(recherche))
  }

  async publierCommit(
    _branche: string,
    message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }> {
    for (const action of actions) {
      const precedent = this.fichiers.get(action.file_path)
      if (action.action === 'create' && precedent) throw new Error('create concurrent')
      if (action.action !== 'create' && (!precedent || precedent.commitId !== action.last_commit_id)) {
        throw new Error('garde périmée')
      }
    }
    const id = (++this.compteur).toString(16).padStart(40, '0')
    for (const action of actions) {
      if (action.action === 'delete') {
        this.fichiers.delete(action.file_path)
      } else if (action.action === 'chmod') {
        const precedent = this.fichiers.get(action.file_path)
        if (precedent && precedent.executable !== action.execute_filemode) {
          this.fichiers.set(action.file_path, {
            ...precedent,
            executable: action.execute_filemode as boolean,
            commitId: id,
          })
        }
      } else {
        const precedent = this.fichiers.get(action.file_path)
        this.fichiers.set(action.file_path, {
          contenu: action.content ?? '',
          commitId: id,
          executable: precedent?.executable ?? false,
        })
      }
    }
    this.commits.push({ id, title: message })
    return { id }
  }
}

function actionCreate(contenu: string): ActionCommitGitLab {
  return { action: 'create', file_path: 'entretiens/e1.json', content: contenu }
}

function creerJournal(): { root: string; journal: JournalPublicationGitLab } {
  const root = mkdtempSync(join(tmpdir(), 'sonal-journal-gitlab-'))
  return {
    root,
    journal: new JournalPublicationGitLab('destination-test', root, () => new Date('2026-01-01T00:00:00Z')),
  }
}

describe('journal de publication GitLab', () => {
  test('sépare les métadonnées du candidat et permet de le recharger', () => {
    const { root, journal } = creerJournal()
    try {
      const action = actionCreate('{"formatVersion":3}')
      journal.preparer({
        operationId: 'operation-journal-1',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: 'a'.repeat(64), generation: 'generation-1', leaseCommitId: 'b'.repeat(40) }],
        etat: 'prepare',
        actions: [action],
      })

      const [entree] = journal.lister()
      expect(entree.etat).toBe('prepare')
      expect(entree).not.toHaveProperty('actions.0.content')
      expect(entree.actions[0]).toMatchObject({
        contentOctets: Buffer.byteLength(action.content as string),
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(journal.chargerActions(entree)).toEqual([action])
      expect(existsSync(join(root, 'operations'))).toBe(true)
      expect(existsSync(join(root, 'candidates'))).toBe(true)

      journal.supprimer('operation-journal-1')
      expect(journal.lister()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('conserve et réconcilie une garde légère sans contenu', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    const gardeCommit = 'a'.repeat(40)
    depot.fichiers.set('entretiens/e1.json', {
      contenu: '{"formatVersion":8}',
      commitId: gardeCommit,
      executable: false,
    })
    const actions: ActionCommitGitLab[] = [
      {
        action: 'create',
        file_path: 'corpus.json',
        content: '{"formatVersion":8}',
      },
      {
        action: 'chmod',
        file_path: 'entretiens/e1.json',
        execute_filemode: false,
        last_commit_id: gardeCommit,
      },
    ]
    try {
      journal.preparer({
        operationId: 'operation-garde-legere',
        nature: 'transaction-corpus',
        branche: 'main',
        droits: [{ resourceHash: '9'.repeat(64), generation: 'generation-garde', leaseCommitId: '8'.repeat(40) }],
        etat: 'indetermine',
        actions,
      })
      const [entree] = journal.lister()
      expect(entree.actions[1]).toMatchObject({
        action: 'chmod',
        execute_filemode: false,
        last_commit_id: gardeCommit,
      })
      expect(entree.actions[1]).not.toHaveProperty('contentSha256')

      const commit = await depot.publierCommit('main', 'Sonal operation-garde-legere', actions)
      await expect(new ReconciliateurPublicationGitLab(depot, journal).reconcilier(entree))
        .resolves.toEqual({ statut: 'confirme', commitId: commit.id })
      expect(depot.fichiers.get('entretiens/e1.json')).toMatchObject({
        contenu: '{"formatVersion":8}',
        commitId: gardeCommit,
        executable: false,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('conserve le journal et le candidat après un résultat indéterminé', () => {
    const { root, journal } = creerJournal()
    try {
      journal.preparer({
        operationId: 'operation-journal-2',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: 'c'.repeat(64), generation: 'generation-2', leaseCommitId: 'd'.repeat(40) }],
        etat: 'prepare',
        actions: [actionCreate('candidat')],
      })
      journal.marquerIndetermine('operation-journal-2')

      const [entree] = journal.lister()
      expect(entree.etat).toBe('indetermine')
      expect(journal.chargerActions(entree)[0].content).toBe('candidat')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('accepte une nouvelle entrée de 250 actions et refuse la 251e', () => {
    const { root, journal } = creerJournal()
    try {
      // Un commit de transactions complet : corpus, 248 gardes et une
      // mutation témoin, à la borne exacte de la limite de sécurité Sonal.
      const actions: ActionCommitGitLab[] = [
        {
          action: 'update',
          file_path: 'donnees/corpus.json',
          content: '{}',
          last_commit_id: 'a'.repeat(40),
        },
        { action: 'create', file_path: 'donnees/entretiens/e999.json', content: '{}' },
      ]
      for (let index = 0; index < 248; index += 1) {
        actions.push({
          action: 'chmod',
          file_path: `donnees/entretiens/e${index}.json`,
          execute_filemode: false,
          last_commit_id: `${index.toString(16).padStart(2, '0')}${'a'.repeat(38)}`,
        })
      }
      journal.preparer({
        operationId: 'operation-250-actions',
        nature: 'transaction-corpus',
        branche: 'main',
        droits: [{
          resourceHash: '7'.repeat(64),
          generation: 'generation-250',
          leaseCommitId: '6'.repeat(40),
        }],
        etat: 'prepare',
        actions,
      })

      const [entree] = journal.lister()
      expect(entree.actions).toHaveLength(250)
      expect(entree.actions.filter((action) => action.action === 'chmod')).toHaveLength(248)
      expect(journal.chargerActions(entree)).toEqual(actions)

      // La 251e action est refusée dès la préparation : aucune entrée
      // n'y correspond, même après l'écriture du candidat.
      expect(() => journal.preparer({
        operationId: 'operation-251-actions',
        nature: 'transaction-corpus',
        branche: 'main',
        droits: [{
          resourceHash: '7'.repeat(64),
          generation: 'generation-251',
          leaseCommitId: '6'.repeat(40),
        }],
        etat: 'prepare',
        actions: [...actions, {
          action: 'chmod',
          file_path: 'donnees/entretiens/e-excedent.json',
          execute_filemode: false,
          last_commit_id: 'a'.repeat(40),
        }],
      })).toThrow('Actions de publication GitLab invalides.')
      expect(() => journal.lire('operation-251-actions'))
        .toThrow('Opération GitLab absente du journal.')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('lit une vraie entrée de journal version 3 avec sa borne historique', () => {
    const { root, journal } = creerJournal()
    const droit = {
      resourceHash: '7'.repeat(64),
      generation: 'generation-v3',
      leaseCommitId: '6'.repeat(40),
    }
    /** Écrit une entrée authentique de version 3 : mêmes champs que la
     *  version courante, mais version et borne historiques de 102 actions. */
    function semerVersion3(operationId: string, actions: ActionCommitGitLab[]): void {
      journal.preparer({
        operationId,
        nature: 'transaction-corpus',
        branche: 'main',
        droits: [droit],
        etat: 'indetermine',
        actions,
      })
      const fichier = join(root, 'operations',
        createHash('sha256').update(operationId).digest('hex') + '.json')
      const entree = JSON.parse(readFileSync(fichier, 'utf8'))
      entree.version = 3
      writeFileSync(fichier, JSON.stringify(entree, null, 2), 'utf8')
    }
    try {
      semerVersion3('operation-v3-lisible', [
        {
          action: 'update',
          file_path: 'donnees/corpus.json',
          content: '{}',
          last_commit_id: 'a'.repeat(40),
        },
        {
          action: 'chmod',
          file_path: 'donnees/entretiens/e1.json',
          execute_filemode: true,
          last_commit_id: 'b'.repeat(40),
        },
      ])
      const [entree] = journal.lister()
      expect(entree.version).toBe(4)
      expect(entree.nature).toBe('transaction-corpus')
      expect(entree.actions[1]).toMatchObject({ action: 'chmod', execute_filemode: true })
      expect(journal.chargerActions(entree)).toHaveLength(2)
      expect(journal.transactionsCorpusJournalisees()).toHaveLength(1)

      // La version 3 garde sa borne historique : une entrée de 250 actions
      // n'y est pas lisible, alors que la même écriture passe en version 4.
      const corpus = {
        action: 'update',
        file_path: 'donnees/corpus.json',
        content: '{}',
        last_commit_id: 'a'.repeat(40),
      } as const
      const gardes = Array.from({ length: 249 }, (_vide, index) => ({
        action: 'chmod',
        file_path: `donnees/entretiens/v3-${index}.json`,
        execute_filemode: false,
        last_commit_id: `${index.toString(16).padStart(2, '0')}${'a'.repeat(38)}`,
      }))
      semerVersion3('operation-v3-102', [corpus, ...gardes.slice(0, 101)])
      expect(() => journal.lire('operation-v3-102')).not.toThrow()
      semerVersion3('operation-v3-trop-large', [corpus, ...gardes])
      expect(() => journal.lire('operation-v3-trop-large'))
        .toThrow('Entrée de journal GitLab invalide.')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('retrouve et vérifie un commit sans rejouer l’opération', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('{"version":"confirmee"}')
      journal.preparer({
        operationId: 'operation-journal-3',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: 'e'.repeat(64), generation: 'generation-3', leaseCommitId: 'f'.repeat(40) }],
        etat: 'indetermine',
        actions: [action],
      })
      await depot.publierCommit('main', 'Sonal operation-journal-3', [action])
      const [entree] = journal.lister()
      const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)

      await expect(reconciliateur.reconcilier(entree)).resolves.toEqual({
        statut: 'confirme',
        commitId: expect.stringMatching(/^[a-f0-9]{40}$/),
      })
      expect(depot.commits).toHaveLength(1)
      journal.supprimer(entree.operationId)
      expect(journal.lister()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('retrouve l’opération après plusieurs commits suivants', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('{"version":"retrouvee"}')
      journal.preparer({
        operationId: 'operation-journal-6',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: '5'.repeat(64), generation: 'generation-6', leaseCommitId: '6'.repeat(40) }],
        etat: 'indetermine',
        actions: [action],
      })
      await depot.publierCommit('main', 'Sonal operation-journal-6', [action])
      await depot.publierCommit('main', 'Qualification sans rapport', [{
        action: 'create',
        file_path: 'qualification/autre.json',
        content: '{}',
      }])
      await depot.publierCommit('main', 'Qualification encore plus récente', [{
        action: 'create',
        file_path: 'qualification/plus-recent.json',
        content: '{}',
      }])
      const [entree] = journal.lister()
      const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)

      await expect(reconciliateur.reconcilier(entree)).resolves.toEqual({
        statut: 'confirme',
        commitId: expect.stringMatching(/^[a-f0-9]{40}$/),
      })
      expect(depot.commits).toHaveLength(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('un résultat absent ne rejoue pas automatiquement le plan', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('absent')
      journal.preparer({
        operationId: 'operation-journal-4',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: '1'.repeat(64), generation: 'generation-4', leaseCommitId: '2'.repeat(40) }],
        etat: 'prepare',
        actions: [action],
      })
      const [entree] = journal.lister()
      const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)

      await expect(reconciliateur.reconcilier(entree)).resolves.toEqual({ statut: 'absent' })
      expect(depot.commits).toEqual([])
      expect(journal.lister()).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('un candidat corrompu reste indéterminé', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('avant-corruption')
      journal.preparer({
        operationId: 'operation-journal-5',
        nature: 'session-entretien',
        branche: 'main',
        droits: [{ resourceHash: '3'.repeat(64), generation: 'generation-5', leaseCommitId: '4'.repeat(40) }],
        etat: 'indetermine',
        actions: [action],
      })
      const [entree] = journal.lister()
      const candidatePath = join(root, 'candidates', entree.candidat)
      const original = readFileSync(candidatePath, 'utf8')
      expect(original).toContain('avant-corruption')
      await depot.publierCommit('main', 'Sonal operation-journal-5', [action])
      writeFileSync(candidatePath, '[]', 'utf8')
      const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)
      await expect(reconciliateur.reconcilier(entree)).resolves.toEqual({ statut: 'indetermine' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('nature des entrées de publication', () => {
  const CORPUS = 'donnees/corpus.json'
  const HACHAGE_CORPUS = '9'.repeat(64)
  const HACHAGE_BAIL = '8'.repeat(64)

  function banc(avecRessourceCorpus: boolean) {
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-nature-'))
    const journal = new JournalPublicationGitLab(
      'destination-test',
      root,
      () => new Date('2026-01-01T00:00:00Z'),
      avecRessourceCorpus ? { chemin: CORPUS, resourceHash: HACHAGE_CORPUS } : undefined,
    )
    return { root, journal }
  }

  /** Simule une entrée écrite avant l'existence des natures. */
  function semerAncienne(
    journal: JournalPublicationGitLab,
    racine: string,
    operationId: string,
    resourceHash: string,
    actions: ActionCommitGitLab[],
  ): void {
    journal.preparer({
      operationId,
      nature: 'session-entretien',
      branche: 'main',
      droits: [{ resourceHash, generation: 'generation-1', leaseCommitId: 'a'.repeat(40) }],
      etat: 'indetermine',
      actions,
    })
    const fichier = join(racine, 'operations',
      // Le journal range par empreinte de l'identifiant d'opération.
      createHash('sha256').update(operationId).digest('hex') + '.json')
    const entree = JSON.parse(readFileSync(fichier, 'utf8'))
    delete entree.nature
    // La version 2 portait un seul droit, en champs plats.
    const [droit] = entree.droits
    delete entree.droits
    entree.version = 1
    Object.assign(entree, droit)
    writeFileSync(fichier, JSON.stringify(entree, null, 2), 'utf8')
  }

  const actionCorpus: ActionCommitGitLab = {
    action: 'update',
    file_path: CORPUS,
    content: '{}',
    last_commit_id: 'b'.repeat(40),
  }
  const actionBail: ActionCommitGitLab = {
    action: 'update',
    file_path: `.sonal/verrous/${HACHAGE_CORPUS}.json`,
    content: '{}',
    last_commit_id: 'b'.repeat(40),
  }

  test('reconnaît une ancienne transaction de corpus par sa ressource et ses actions', () => {
    const { root, journal } = banc(true)
    try {
      semerAncienne(journal, root, 'ancienne-corpus', HACHAGE_CORPUS, [actionCorpus, actionBail])
      expect(journal.lister()[0].nature).toBe('transaction-corpus')
      expect(journal.transactionsCorpusJournalisees()).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une ancienne entrée de session reste une session', () => {
    const { root, journal } = banc(true)
    try {
      semerAncienne(journal, root, 'ancienne-session', HACHAGE_BAIL, [{
        action: 'update',
        file_path: 'donnees/entretiens/e1.json',
        content: '{}',
        last_commit_id: 'b'.repeat(40),
      }])
      expect(journal.lister()[0].nature).toBe('session-entretien')
      expect(journal.transactionsCorpusJournalisees()).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une ancienne entrée au contenu mixte reste inconnue et bloquante', () => {
    const { root, journal } = banc(true)
    try {
      semerAncienne(journal, root, 'ancienne-mixte', HACHAGE_CORPUS, [
        actionCorpus,
        { action: 'create', file_path: 'donnees/entretiens/e1.json', content: '{}' },
      ])
      expect(journal.lister()[0].nature).toBe('inconnue')
      expect(journal.transactionsCorpusJournalisees()).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('sans ressource de corpus connue, une ancienne entrée reste inconnue', () => {
    const { root, journal } = banc(false)
    try {
      semerAncienne(journal, root, 'ancienne-sans-ressource', HACHAGE_CORPUS, [actionCorpus])
      expect(journal.lister()[0].nature).toBe('inconnue')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une transaction courte d’entretien ne bloque pas les transactions de corpus', () => {
    const { root, journal } = banc(true)
    try {
      journal.preparer({
        operationId: 'entretien-court',
        nature: 'transaction-entretien',
        branche: 'main',
        droits: [{
          resourceHash: HACHAGE_BAIL,
          generation: 'generation-1',
          leaseCommitId: 'a'.repeat(40),
        }],
        etat: 'prepare',
        actions: [actionCorpus],
      })
      expect(journal.lister()[0].nature).toBe('transaction-entretien')
      expect(journal.transactionsCorpusJournalisees()).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une nature déclarée est conservée telle quelle', () => {
    const { root, journal } = banc(true)
    try {
      journal.preparer({
        operationId: 'declaree',
        nature: 'transaction-corpus',
        branche: 'main',
        droits: [{ resourceHash: HACHAGE_BAIL, generation: 'generation-1', leaseCommitId: 'a'.repeat(40) }],
        etat: 'prepare',
        actions: [actionCorpus],
      })
      expect(journal.lister()[0].nature).toBe('transaction-corpus')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
