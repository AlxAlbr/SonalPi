import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BailGitLab,
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ErreurEcritureGitLab } from '../../src/main/gitlab/client'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { SessionGitLab, type StockageLocalSessionGitLab } from '../../src/main/gitlab/session'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { JournalSessionsGitLab } from '../../src/main/gitlab/journalSession'

class DepotSession implements DepotCommitsGitLab {
  readonly fichiers = new Map<string, { contenu: string; commitId: string }>()
  readonly commits: Array<{ id: string; title: string }> = []
  private compteur = 0
  private echecApresProchainCommit = false

  constructor() {
    this.fichiers.set('entretiens/e1.json', {
      contenu: '{"formatVersion":8}',
      commitId: '1'.repeat(40),
    })
  }

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
      if (action.action === 'create' && precedent) {
        throw new ErreurEcritureGitLab(400, 'create existant')
      }
      if (action.action !== 'create' && (!precedent || precedent.commitId !== action.last_commit_id)) {
        throw new ErreurEcritureGitLab(400, 'garde périmée')
      }
    }
    const id = (++this.compteur).toString(16).padStart(40, '0')
    for (const action of actions) {
      if (action.action === 'delete') this.fichiers.delete(action.file_path)
      else this.fichiers.set(action.file_path, { contenu: action.content ?? '', commitId: id })
    }
    this.commits.push({ id, title: message })
    if (this.echecApresProchainCommit) {
      this.echecApresProchainCommit = false
      throw new Error('réponse perdue')
    }
    return { id }
  }

  perdreLaProchaineReponse(): void {
    this.echecApresProchainCommit = true
  }
}

class StockageMemoire implements StockageLocalSessionGitLab {
  constructor(public valeur: string) {}
  async lire(): Promise<string> { return this.valeur }
  async ecrire(contenu: string): Promise<void> { this.valeur = contenu }
}

function creerSession(
  depot: DepotSession,
  sessionId: string,
  maintenant: () => number,
  stockage = new StockageMemoire(''),
  journal?: JournalPublicationGitLab,
  repriseExplicite = false,
  journalSessions?: JournalSessionsGitLab,
): SessionGitLab {
  let generation = 0
  const coordination = new BailGitLab({
    branche: 'main',
    depot,
    identite: () => ({ userId: 'alice', machineId: 'poste-a', sessionId }),
    maintenant,
    nouvelleGeneration: () => `generation-${sessionId}-${++generation}`,
    dureeBailMs: 60_000,
  })
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal })
  return new SessionGitLab({
    id: sessionId,
    ressource: 'entretien:e1',
    cheminRelatif: 'entretiens/e1.json',
    cheminDistant: 'entretiens/e1.json',
    branche: 'main',
    depot,
    coordination,
    publication,
    stockageLocal: stockage,
    journal,
    journalSessions,
    reconciliateur: journal ? new ReconciliateurPublicationGitLab(depot, journal) : undefined,
    repriseExplicite,
    nouvelleOperation: () => `operation-${sessionId}-${Math.random().toString(36).slice(2, 8)}`,
  })
}

describe('session GitLab', () => {
  test('ouvre, publie sous bail et ferme sans laisser de bail', async () => {
    const depot = new DepotSession()
    const stockage = new StockageMemoire('')
    const session = creerSession(depot, 'session-a', () => Date.UTC(2026, 0, 1), stockage)

    await expect(session.ouvrir()).resolves.toEqual({ etat: 'edition', revision: 0, revisionPubliee: 0 })
    expect(stockage.valeur).toBe('{"formatVersion":8}')
    stockage.valeur = '{"formatVersion":8,"modifie":true}'
    await session.marquerSale()
    await expect(session.publier()).resolves.toMatchObject({ statut: 'confirme' })
    expect(session.etat()).toEqual({ etat: 'edition', revision: 1, revisionPubliee: 1 })
    await expect(session.fermer()).resolves.toEqual({ fermee: true })
    expect([...depot.fichiers.keys()].some((chemin) => chemin.startsWith('.sonal/verrous/'))).toBe(false)
  })

  test('un second poste reste en lecture seule pendant un bail actif', async () => {
    const depot = new DepotSession()
    const premier = creerSession(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const second = creerSession(depot, 'session-b', () => Date.UTC(2026, 0, 1))
    await premier.ouvrir()

    await expect(second.ouvrir()).resolves.toMatchObject({
      etat: 'lecture-seule',
      raison: 'bail',
      tenupar: { userId: 'alice' },
    })
    expect(second.droit()).toBeNull()
    await second.fermer()
  })

  test('après reprise, l’ancienne session devient dégradée et ne peut pas fermer', async () => {
    const depot = new DepotSession()
    let maintenant = Date.UTC(2026, 0, 1)
    const stockagePremier = new StockageMemoire('')
    const premier = creerSession(depot, 'session-a', () => maintenant, stockagePremier)
    const second = creerSession(depot, 'session-b', () => maintenant + 120_000, undefined, undefined, true)
    await premier.ouvrir()
    maintenant += 60_000

    await expect(second.ouvrir()).resolves.toMatchObject({ etat: 'edition', revision: 0, revisionPubliee: 0 })
    stockagePremier.valeur = '{"formatVersion":8,"ancien":true}'
    await premier.marquerSale()
    await expect(premier.publier()).resolves.toMatchObject({ statut: 'refuse', raison: 'droit-perdu' })
    expect(premier.etat()).toMatchObject({ etat: 'degrade', raison: 'droit-perdu' })
    await expect(premier.fermer()).resolves.toEqual({ fermee: false, raison: 'degrade' })
  })

  test('le renouvellement expiré dégrade la session', async () => {
    const depot = new DepotSession()
    let maintenant = Date.UTC(2026, 0, 1)
    const session = creerSession(depot, 'session-a', () => maintenant)
    await session.ouvrir()
    maintenant += 60_000
    await expect(session.renouveler()).resolves.toBe(false)
    expect(session.etat()).toMatchObject({ etat: 'degrade', raison: 'droit-perdu' })
  })

  test('protège et reprend une autosave non publiée après un redémarrage', async () => {
    const depot = new DepotSession()
    const racine = mkdtempSync(join(tmpdir(), 'sonal-session-autosave-'))
    let maintenant = Date.UTC(2026, 0, 1)
    try {
      const journalRepertoire = join(racine, 'operations')
      const journalAvant = new JournalSessionsGitLab('destination-test', journalRepertoire)
      const stockage = new StockageLocalEntretienGitLab(racine, 'entretiens/e1.json')
      const premier = creerSession(
        depot,
        'session-avant-crash',
        () => maintenant,
        stockage,
        undefined,
        false,
        journalAvant,
      )
      await premier.ouvrir()
      const candidat = '{"formatVersion":8,"modifie":"autosave locale"}'
      writeFileSync(join(racine, 'entretiens', 'e1.json'), candidat, 'utf8')
      await premier.marquerSale()
      expect(journalAvant.lister()).toHaveLength(1)

      maintenant += 60_000
      const journalApres = new JournalSessionsGitLab('destination-test', journalRepertoire)
      const redemarrage = creerSession(
        depot,
        'session-apres-redemarrage',
        () => maintenant,
        new StockageLocalEntretienGitLab(racine, 'entretiens/e1.json'),
        undefined,
        false,
        journalApres,
      )
      await expect(redemarrage.ouvrir()).resolves.toEqual({
        etat: 'edition',
        revision: 1,
        revisionPubliee: 0,
      })
      expect(readFileSync(join(racine, 'entretiens', 'e1.json'), 'utf8')).toBe(candidat)
      await expect(redemarrage.fermer()).resolves.toEqual({ fermee: true })
      expect(journalApres.lister()).toEqual([])
    } finally {
      rmSync(racine, { recursive: true, force: true })
    }
  })

  test('reprend sur disque le travail confirmé après la perte de réponse et un redémarrage', async () => {
    const depot = new DepotSession()
    const racine = mkdtempSync(join(tmpdir(), 'sonal-session-redemarrage-'))
    const cheminLocal = join(racine, 'entretiens', 'e1.json')
    const cheminJournal = join(racine, 'operations')
    let maintenant = Date.UTC(2026, 0, 1)
    try {
      const journal = new JournalPublicationGitLab('destination-test', cheminJournal)
      const stockage = new StockageLocalEntretienGitLab(racine, 'entretiens/e1.json')
      const premier = creerSession(
        depot,
        'session-avant-crash',
        () => maintenant,
        stockage,
        journal,
      )
      await premier.ouvrir()
      const candidat = '{"formatVersion":8,"modifie":"avant-crash"}'
      writeFileSync(cheminLocal, candidat, 'utf8')
      await premier.marquerSale()
      depot.perdreLaProchaineReponse()
      await expect(premier.publier()).resolves.toMatchObject({ statut: 'indetermine' })

      const journalRedemarre = new JournalPublicationGitLab('destination-test', cheminJournal)
      const reconciliateur = new ReconciliateurPublicationGitLab(depot, journalRedemarre)
      const [operation] = journalRedemarre.lister()
      await expect(reconciliateur.reconcilier(operation)).resolves.toMatchObject({
        statut: 'confirme',
      })
      journalRedemarre.supprimer(operation.operationId)
      maintenant += 60_000

      const stockageRedemarre = new StockageLocalEntretienGitLab(racine, 'entretiens/e1.json')
      const redemarrage = creerSession(
        depot,
        'session-apres-redemarrage',
        () => maintenant,
        stockageRedemarre,
        journalRedemarre,
      )
      await expect(redemarrage.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      expect(readFileSync(cheminLocal, 'utf8')).toBe(candidat)
      await expect(redemarrage.publier()).resolves.toMatchObject({ statut: 'confirme' })
      await expect(redemarrage.fermer()).resolves.toEqual({ fermee: true })
      expect(journalRedemarre.lister()).toEqual([])
    } finally {
      rmSync(racine, { recursive: true, force: true })
    }
  })

  test('réconcilie un commit perdu sans rejouer et sans réactiver la session', async () => {
    const depot = new DepotSession()
    const root = mkdtempSync(join(tmpdir(), 'sonal-session-reconciliation-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const stockage = new StockageMemoire('')
      const session = creerSession(depot, 'session-a', () => Date.UTC(2026, 0, 1), stockage, journal)
      await session.ouvrir()
      stockage.valeur = '{"formatVersion":8,"perdu":true}'
      await session.marquerSale()
      depot.perdreLaProchaineReponse()

      await expect(session.publier()).resolves.toMatchObject({ statut: 'indetermine' })
      expect(journal.lister()).toHaveLength(1)
      const resultats = await session.reconcilierOperationsPending()
      expect(resultats[0].resultat).toMatchObject({ statut: 'confirme' })
      expect(journal.lister()).toEqual([])
      expect(session.etat()).toMatchObject({ etat: 'degrade', raison: 'indetermine' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
