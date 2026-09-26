import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import {
  BailGitLab,
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { CorpusFichier, PayloadEntretien } from '../../src/shared/format'

class DepotMemoire implements DepotCommitsGitLab {
  private numero = 1
  private readonly commits = new Map<string, string>()

  constructor(readonly fichiers: Map<string, string>) {
    for (const chemin of fichiers.keys()) this.commits.set(chemin, this.sha())
  }

  async lireFichier(chemin: string): Promise<FichierGitLab | null> {
    const contenu = this.fichiers.get(chemin)
    if (contenu === undefined) return null
    return { chemin, contenu, commitId: this.commits.get(chemin)! }
  }

  async rechercherCommits(): Promise<Array<{ id: string; title: string }>> {
    return []
  }

  async publierCommit(
    _branche: string,
    _message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }> {
    const fichiers = new Map(this.fichiers)
    const commits = new Map(this.commits)
    const commitId = this.sha()
    for (const action of actions) {
      const courant = fichiers.get(action.file_path)
      if (action.action === 'create') {
        if (courant !== undefined) throw new Error('création concurrente')
        fichiers.set(action.file_path, action.content ?? '')
        commits.set(action.file_path, commitId)
      } else if (action.action === 'update') {
        if (courant === undefined || commits.get(action.file_path) !== action.last_commit_id) {
          throw new Error('mise à jour concurrente')
        }
        fichiers.set(action.file_path, action.content ?? '')
        commits.set(action.file_path, commitId)
      } else if (action.action === 'delete') {
        if (courant === undefined || commits.get(action.file_path) !== action.last_commit_id) {
          throw new Error('suppression concurrente')
        }
        fichiers.delete(action.file_path)
        commits.delete(action.file_path)
      } else {
        throw new Error('déplacement non attendu')
      }
    }
    this.fichiers.clear()
    this.commits.clear()
    for (const [chemin, contenu] of fichiers) this.fichiers.set(chemin, contenu)
    for (const [chemin, commit] of commits) this.commits.set(chemin, commit)
    return { id: commitId }
  }

  private sha(): string {
    return (this.numero++).toString(16).padStart(40, '0')
  }
}

const destination: ConfigDestinationGitLab = {
  fournisseur: 'gitlab',
  id: 'destination-test',
  compteId: 'compte-test',
  projetId: 42,
  nomProjet: 'Corpus test',
  branche: 'main',
  racine: 'donnees',
}

function banc(corpusServeur: CorpusFichier) {
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-transactions-'))
  mkdirSync(join(dirLocal, 'entretiens'), { recursive: true })
  writeFileSync(join(dirLocal, 'corpus.json'), JSON.stringify(squeletteCorpus('copie périmée')))
  const store = new CorpusStore(dirLocal)
  store.lectureSeule = true
  const depot = new DepotMemoire(new Map([
    ['donnees/corpus.json', JSON.stringify(corpusServeur)],
  ]))
  const coordination = new BailGitLab({
    branche: destination.branche,
    depot,
    identite: () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'session-1' }),
  })
  const transactions = new TransactionsGitLab({
    destination,
    dirLocal,
    store,
    depot,
    coordination,
    publication: new PublieurGitLab({
      branche: destination.branche,
      depot,
      coordination,
    }),
    nouvelleOperation: () => 'ajout-test',
  })
  return { dirLocal, store, depot, transactions }
}

function payload(texte: string): PayloadEntretien {
  return {
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: null },
        content: [{ type: 'text', text: texte }],
      }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

describe('transactions GitLab d’ajout', () => {
  test('importe depuis le corpus serveur frais et publie les deux fichiers atomiquement', async () => {
    const corpusServeur = squeletteCorpus('Corpus partagé')
    corpusServeur.membership.existant = {
      titre: 'Déjà présent',
      date: null,
      lastModified: '2026-01-01T00:00:00.000Z',
      rangAjout: 0,
    }
    corpusServeur.ordreEntretiens = ['existant']
    const { dirLocal, store, depot, transactions } = banc(corpusServeur)

    const resultat = await transactions.importerEntretien(
      'Nouvel entretien',
      payload('Texte importé'),
    )

    expect(resultat.corpus.membership).toHaveProperty('existant')
    expect(resultat.corpus.membership).toHaveProperty(resultat.id)
    expect(JSON.parse(depot.fichiers.get('donnees/corpus.json')!)).toEqual(resultat.corpus)
    expect(JSON.parse(depot.fichiers.get(`donnees/entretiens/${resultat.id}.json`)!))
      .toMatchObject({ corpsTexte: payload('Texte importé').corpsTexte })
    expect(store.ouvrir().membership).toEqual(resultat.corpus.membership)
    expect(JSON.parse(readFileSync(
      join(dirLocal, 'entretiens', `${resultat.id}.json`),
      'utf8',
    ))).toMatchObject({ corpsTexte: payload('Texte importé').corpsTexte })
    expect([...depot.fichiers.keys()].some((chemin) => chemin.startsWith('.sonal/verrous/')))
      .toBe(false)
  })
})
