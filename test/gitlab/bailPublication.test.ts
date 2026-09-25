import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ErreurEcritureGitLab } from '../../src/main/gitlab/client'
import { PublieurGitLab } from '../../src/main/gitlab/publication'

interface Fichier {
  contenu: string
  commitId: string
}

class DepotMemoire implements DepotCommitsGitLab {
  readonly fichiers = new Map<string, Fichier>()
  readonly commits: Array<{ id: string; message: string; actions: ActionCommitGitLab[] }> = []
  private compteur = 0
  private echecAvant: unknown = null
  private echecApres: unknown = null
  private statutRefus: number | null = null
  private delaiProchainCommit = 0

  echouerApresAccepter(erreur: unknown): void {
    this.echecApres = erreur
  }

  echouerAvantEnvoyer(erreur: unknown): void {
    this.echecAvant = erreur
  }

  refuser(statut: number): void {
    this.statutRefus = statut
  }

  ralentirProchainCommit(delaiMs: number): void {
    this.delaiProchainCommit = delaiMs
  }

  async lireFichier(chemin: string): Promise<FichierGitLab | null> {
    const fichier = this.fichiers.get(chemin)
    return fichier ? { chemin, ...fichier } : null
  }

  async rechercherCommits(_ref: string, recherche: string): Promise<Array<{ id: string; title: string }>> {
    return this.commits
      .filter((commit) => commit.message.includes(recherche))
      .map((commit) => ({ id: commit.id, title: commit.message }))
      .reverse()
  }

  async publierCommit(
    _branche: string,
    message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }> {
    if (this.delaiProchainCommit > 0) {
      const delai = this.delaiProchainCommit
      this.delaiProchainCommit = 0
      await new Promise((resolve) => setTimeout(resolve, delai))
    }
    if (this.echecAvant) {
      const erreur = this.echecAvant
      this.echecAvant = null
      throw erreur
    }
    if (this.statutRefus) {
      const statut = this.statutRefus
      this.statutRefus = null
      throw new ErreurEcritureGitLab(statut, `refus ${statut}`)
    }
    this.validerActions(actions)
    const id = this.nouvelId()
    this.appliquer(actions, id)
    this.commits.push({ id, message, actions })
    if (this.echecApres) {
      const erreur = this.echecApres
      this.echecApres = null
      throw erreur
    }
    return { id }
  }

  modifierHorsProtocole(chemin: string, contenu: string): void {
    const fichier = this.fichiers.get(chemin)
    if (!fichier) throw new Error('Fichier de test absent.')
    this.fichiers.set(chemin, { contenu, commitId: this.nouvelId() })
  }

  private validerActions(actions: ActionCommitGitLab[]): void {
    for (const action of actions) {
      const fichier = this.fichiers.get(action.file_path)
      if (action.action === 'create' && fichier) {
        throw new ErreurEcritureGitLab(400, 'create existant')
      }
      if (action.action !== 'create') {
        if (!fichier || action.last_commit_id !== fichier.commitId) {
          throw new ErreurEcritureGitLab(400, 'garde périmée')
        }
      }
      if (action.action === 'move') {
        const precedent = this.fichiers.get(action.previous_path as string)
        if (!precedent || action.last_commit_id !== precedent.commitId) {
          throw new ErreurEcritureGitLab(400, 'déplacement périmé')
        }
      }
    }
  }

  private appliquer(actions: ActionCommitGitLab[], commitId: string): void {
    for (const action of actions) {
      if (action.action === 'delete') {
        this.fichiers.delete(action.file_path)
      } else if (action.action === 'move') {
        const precedent = this.fichiers.get(action.previous_path as string) as Fichier
        this.fichiers.delete(action.previous_path as string)
        this.fichiers.set(action.file_path, { ...precedent, commitId })
      } else {
        this.fichiers.set(action.file_path, {
          contenu: action.content as string,
          commitId,
        })
      }
    }
  }

  private nouvelId(): string {
    this.compteur += 1
    return this.compteur.toString(16).padStart(40, '0')
  }
}

function identidade(sessionId: string) {
  return { userId: 'alice', machineId: 'poste-a', sessionId }
}

function bail(
  depot: DepotMemoire,
  sessionId: string,
  maintenant: () => number,
): BailGitLab {
  let generation = 0
  return new BailGitLab({
    branche: 'main',
    depot,
    identite: () => identidade(sessionId),
    maintenant,
    nouvelleGeneration: () => `generation-${sessionId}-${++generation}`,
    dureeBailMs: 60_000,
  })
}

describe('bail GitLab versionné', () => {
  test('acquisition exclusive et séparation des sessions du même compte', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', maintenant)
    const posteB = bail(depot, 'session-b', maintenant)

    const premier = await posteA.acquireRessource('entretien:e1')
    const second = await posteB.acquireRessource('entretien:e1')

    expect(premier.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, raison: 'tenu' })
    if (!premier.ok || second.ok) throw new Error('Acquisition test invalide.')
    expect(premier.droit.generation).toBe('generation-session-a-1')
    expect(second.tenupar?.userId).toBe('alice')
    const chemin = posteA.snapshot(premier.droit).chemin
    expect(chemin).toMatch(/^\.sonal\/verrous\/[a-f0-9]{64}\.json$/)
    expect(chemin).not.toContain('e1')
    expect(JSON.parse(depot.fichiers.get(chemin)?.contenu ?? '{}')).toMatchObject({
      version: 2,
      protocole: 'sonal-bail-v2',
    })
  })

  test('un seul compte obtient la session pour deux comptes distincts', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const ressource = cleRessourceBailGitLab('main', 'entretiens/e1.json')
    const posteA = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({ userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' }),
      maintenant,
      nouvelleGeneration: () => 'generation-a',
    })
    const posteB = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({ userId: 'bob', machineId: 'poste-b', sessionId: 'session-b' }),
      maintenant,
      nouvelleGeneration: () => 'generation-b',
    })

    const resultats = await Promise.all([
      posteA.acquireRessource(ressource),
      posteB.acquireRessource(ressource),
    ])
    expect(resultats.filter((resultat) => resultat.ok)).toHaveLength(1)
    const refuse = resultats.find((resultat) => !resultat.ok)
    expect(refuse).toMatchObject({ ok: false, raison: 'tenu' })
    if (!refuse || refuse.ok) throw new Error('Refus test invalide.')
    expect(['alice', 'bob']).toContain(refuse.tenupar?.userId)
  })

  test('refuse une nouvelle acquisition lorsqu’un ancien marqueur existe', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const ressourceLegacy = 'destination-ancien:entretien:e1'
    const hashLegacy = createHash('sha256').update(ressourceLegacy).digest('hex')
    depot.fichiers.set(`.sonal/verrous/${hashLegacy}.json`, {
      contenu: JSON.stringify({
        version: 1,
        protocole: 'sonal-bail-v1',
        resourceHash: hashLegacy,
        generation: 'ancienne-generation',
        holder: { userId: 'alice', machineId: 'poste-avant', sessionId: 'session-avant' },
        expireLe: new Date(Date.UTC(2026, 0, 1, 0, 5)).toISOString(),
        compteur: 3,
      }),
      commitId: '1'.repeat(40),
    })

    const nouveau = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => identidade('session-apres-migration'),
      maintenant,
      ressourcesLegacy: [ressourceLegacy],
    })
    const resultat = await nouveau.acquireRessource(
      cleRessourceBailGitLab('main', 'entretiens/e1.json'),
    )
    expect(resultat).toMatchObject({
      ok: false,
      raison: 'tenu',
      tenupar: { userId: 'alice' },
    })
    expect(depot.commits).toHaveLength(0)
  })

  test('la reprise change la génération et bloque l’ancien détenteur', async () => {
    const depot = new DepotMemoire()
    const instantBase = Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', () => instantBase)
    const posteB = bail(depot, 'session-b', () => instantBase + 120_000)
    const ancien = await posteA.acquireRessource('entretien:e1')
    expect(ancien.ok).toBe(true)
    if (!ancien.ok) throw new Error('Acquisition test invalide.')

    const repris = await posteB.acquireRessource('entretien:e1')
    expect(repris.ok).toBe(true)

    if (!repris.ok) throw new Error('Reprise test invalide.')
    await expect(posteA.renouveler(ancien.droit)).resolves.toBe(false)
    expect(() => posteA.snapshot(ancien.droit)).toThrow('invalide')
  })
})

describe('publication GitLab sous droit', () => {
  test('inclut la mutation du bail dans le commit des données', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const coordination = bail(depot, 'session-a', maintenant)
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-1',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({
      statut: 'confirme',
      commitId: expect.stringMatching(/^[a-f0-9]{40}$/),
      compteurBail: 2,
    })

    const dernier = depot.commits.at(-1)
    expect(dernier?.actions).toHaveLength(2)
    expect(dernier?.actions[1]).toMatchObject({
      action: 'update',
      file_path: coordination.snapshot(droit.droit).chemin,
    })
    expect(coordination.snapshot(droit.droit).compteur).toBe(2)
  })

  test('journalise puis supprime une publication confirmée', async () => {
    const depot = new DepotMemoire()
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-publie-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const droit = await coordination.acquireRessource('entretien:e1')
      if (!droit.ok) throw new Error('Acquisition test invalide.')
      const publieur = new PublieurGitLab({ branche: 'main', depot, coordination, journal })

      await expect(publieur.publierSousDroit({
        operationId: 'operation-journal-confirme',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit)).resolves.toMatchObject({ statut: 'confirme' })
      expect(journal.lister()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('conserve le journal après une publication acceptée mais perdue', async () => {
    const depot = new DepotMemoire()
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-indetermine-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const droit = await coordination.acquireRessource('entretien:e1')
      if (!droit.ok) throw new Error('Acquisition test invalide.')
      depot.echouerApresAccepter(new Error('réponse perdue'))
      const publieur = new PublieurGitLab({ branche: 'main', depot, coordination, journal })

      await expect(publieur.publierSousDroit({
        operationId: 'operation-journal-indetermine',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit)).resolves.toMatchObject({ statut: 'indetermine' })
      expect(journal.lister()[0]).toMatchObject({
        etat: 'indetermine',
        operationId: 'operation-journal-indetermine',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('sérialise deux publications du même droit', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    depot.ralentirProchainCommit(20)

    const resultats = await Promise.all([
      publieur.publierSousDroit({
        operationId: 'operation-parallele-1',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit),
      publieur.publierSousDroit({
        operationId: 'operation-parallele-2',
        actions: [{ action: 'create', chemin: 'entretiens/autre.json', contenu: '{}' }],
      }, droit.droit),
    ])

    expect(resultats.map((resultat) => resultat.statut)).toEqual(['confirme', 'confirme'])
    expect(coordination.snapshot(droit.droit).compteur).toBe(3)
    expect(depot.commits.slice(-2).map((commit) => commit.message)).toEqual([
      'Sonal operation-parallele-1',
      'Sonal operation-parallele-2',
    ])
  })

  test('refuse atomiquement une garde de contenu périmée', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    await depot.publierCommit('main', 'base de test', [
      { action: 'create', file_path: 'entretiens/e1.json', content: 'v1' },
    ])
    const base = depot.fichiers.get('entretiens/e1.json') as Fichier
    depot.modifierHorsProtocole('entretiens/e1.json', 'externe')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-conflit',
      actions: [{
        action: 'update',
        chemin: 'entretiens/e1.json',
        contenu: 'v2',
        commitId: base.commitId,
      }],
    }, droit.droit)).resolves.toEqual({ statut: 'refuse', raison: 'conflit' })
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('externe')
    expect(coordination.snapshot(droit.droit).suspendu).toBe(true)
  })

  test('une ancienne génération ne peut plus publier après reprise', async () => {
    const depot = new DepotMemoire()
    let maintenant = Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', () => maintenant)
    const posteB = bail(depot, 'session-b', () => maintenant)
    const ancien = await posteA.acquireRessource('entretien:e1')
    if (!ancien.ok) throw new Error('Acquisition test invalide.')
    maintenant += 60_000
    const repris = await posteB.reprendreRessource('entretien:e1')
    if (!repris.ok) throw new Error('Reprise test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination: posteA })

    await expect(publieur.publierSousDroit({
      operationId: 'ancienne-generation',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, ancien.droit)).resolves.toEqual({ statut: 'refuse', raison: 'droit-perdu' })
    expect(depot.fichiers.has('entretiens/e1.json')).toBe(false)
  })

  test('suspend une publication acceptée dont la réponse est perdue', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    depot.echouerApresAccepter(new Error('connexion perdue'))
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-indeterminee',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({
      statut: 'indetermine',
      operationId: 'operation-indeterminee',
    })
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('{}')
    await expect(coordination.renouveler(droit.droit)).rejects.toThrow('réconciliation')
  })

  test('ne rejoue pas une mutation explicitement refusée par GitLab', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    depot.refuser(429)
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-limitee',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({ statut: 'refuse', raison: 'limite' })
    expect(depot.commits).toHaveLength(1)
  })
})
