import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  readonly fichiers = new Map<string, { contenu: string; commitId: string }>()
  readonly commits: Array<{ id: string; title: string }> = []
  private compteur = 0

  async lireFichier(chemin: string): Promise<FichierGitLab | null> {
    const fichier = this.fichiers.get(chemin)
    return fichier ? { chemin, ...fichier } : null
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
      if (action.action === 'delete') this.fichiers.delete(action.file_path)
      else this.fichiers.set(action.file_path, {
        contenu: action.content ?? '',
        commitId: id,
      })
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
        branche: 'main',
        resourceHash: 'a'.repeat(64),
        generation: 'generation-1',
        leaseCommitId: 'b'.repeat(40),
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

  test('conserve le journal et le candidat après un résultat indéterminé', () => {
    const { root, journal } = creerJournal()
    try {
      journal.preparer({
        operationId: 'operation-journal-2',
        branche: 'main',
        resourceHash: 'c'.repeat(64),
        generation: 'generation-2',
        leaseCommitId: 'd'.repeat(40),
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

  test('retrouve et vérifie un commit sans rejouer l’opération', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('{"version":"confirmee"}')
      journal.preparer({
        operationId: 'operation-journal-3',
        branche: 'main',
        resourceHash: 'e'.repeat(64),
        generation: 'generation-3',
        leaseCommitId: 'f'.repeat(40),
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

  test('un résultat absent ne rejoue pas automatiquement le plan', async () => {
    const { root, journal } = creerJournal()
    const depot = new DepotJournal()
    try {
      const action = actionCreate('absent')
      journal.preparer({
        operationId: 'operation-journal-4',
        branche: 'main',
        resourceHash: '1'.repeat(64),
        generation: 'generation-4',
        leaseCommitId: '2'.repeat(40),
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
        branche: 'main',
        resourceHash: '3'.repeat(64),
        generation: 'generation-5',
        leaseCommitId: '4'.repeat(40),
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
