import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { CorpusStore, ErreurCorpusSeul } from '../../src/main/corpusStore'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { CorpusFichier, PayloadEntretien } from '../../src/shared/format'
import { DepotMemoire } from './depotMemoire'

const destination: ConfigDestinationGitLab = {
  fournisseur: 'gitlab',
  id: 'destination-test',
  compteId: 'compte-test',
  projetId: 42,
  nomProjet: 'Corpus test',
  branche: 'main',
  racine: 'donnees',
}

const RACINE = 'donnees'

function corpusAvecTheme(nom = 'Thème serveur'): CorpusFichier {
  const corpus = squeletteCorpus('Corpus partagé')
  corpus.codebook.cat_theme = {
    id: 'cat_theme',
    nom,
    couleur: '#ff0000',
    ordre: 4,
    parent: null,
    actif: true,
    codeExport: 'cat_005',
  }
  return corpus
}

const ID_THEME = 'cat_theme'

function nomDuTheme(corpus: CorpusFichier): string {
  return corpus.codebook[ID_THEME]?.nom
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

interface Banc {
  dirLocal: string
  dirJournal: string
  store: CorpusStore
  depot: DepotMemoire
  journal: JournalPublicationGitLab
  transactions: TransactionsGitLab
  file: FileOperationsContexte
  lireLocal(): CorpusFichier
}

/** Miroir local, dépôt mémoire et transaction : le store du miroir reste en
 *  lecture seule et ne reçoit rien avant confirmation. */
function banc(options: { serveur?: CorpusFichier; local?: CorpusFichier | null } = {}): Banc {
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-transactions-'))
  mkdirSync(join(dirLocal, 'entretiens'), { recursive: true })
  const local = options.local === undefined ? squeletteCorpus('copie périmée')
    : options.local
  if (local) {
    writeFileSync(join(dirLocal, 'corpus.json'), JSON.stringify(local, null, 2), 'utf8')
  }
  const store = new CorpusStore(dirLocal)
  store.lectureSeule = true
  const dirJournal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-journal-'))
  const journal = new JournalPublicationGitLab(destination.id, dirJournal, undefined, {
    chemin: `${RACINE}/corpus.json`,
    resourceHash: cleRessourceBailGitLab(destination.branche, `${RACINE}/corpus.json`),
  })
  const depot = new DepotMemoire()
  const serveur = options.serveur ?? squeletteCorpus('Corpus partagé')
  depot.charger(new Map([[`${RACINE}/corpus.json`, JSON.stringify(serveur, null, 2)]]))
  const coordination = new BailGitLab({
    branche: destination.branche,
    depot,
    identite: () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'session-1' }),
  })
  const file = new FileOperationsContexte()
  const transactions = new TransactionsGitLab({
    destination,
    store,
    depot,
    coordination,
    publication: new PublieurGitLab({ branche: destination.branche, depot, coordination, journal }),
    file,
    journal,
    nouvelleOperation: () => `operation-${Math.random().toString(36).slice(2, 10)}`,
  })
  return {
    dirLocal,
    dirJournal,
    store,
    depot,
    journal,
    transactions,
    file,
    lireLocal: () => JSON.parse(readFileSync(join(dirLocal, 'corpus.json'), 'utf8')) as CorpusFichier,
  }
}

function commitsDeDonnees(depot: DepotMemoire): string[] {
  return depot.commits
    .filter((commit) => commit.actions.some((action) => !action.file_path.startsWith('.sonal/')))
    .map((commit) => commit.message)
}

function actionsDeDonnees(depot: DepotMemoire) {
  return depot.commits.flatMap((commit) => commit.actions)
    .filter((action) => !action.file_path.startsWith('.sonal/'))
}

describe('définitions du corpus GitLab', () => {
  test('calcule sur la base fraîche du serveur et n’écrit le miroir qu’après confirmation', async () => {
    const serveur = corpusAvecTheme('Thème du serveur')
    const { transactions, lireLocal, depot } = banc({ serveur })

    const resultat = await transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème ajouté', null),
    )

    expect(resultat.corpus.codebook[ID_THEME]).toBeDefined()
    expect(Object.values(resultat.corpus.codebook).map((c) => c.nom)).toContain('Thème ajouté')
    expect(Object.keys(lireLocal().codebook)).toEqual(Object.keys(resultat.corpus.codebook))
    const publie = JSON.parse(depot.fichiers.get(`${RACINE}/corpus.json`)!.contenu) as CorpusFichier
    expect(Object.values(publie.codebook).map((c) => c.nom)).toContain('Thème ajouté')
    expect(commitsDeDonnees(depot)).toHaveLength(1)
    // Le bail est pris puis libéré : deux commits de coordination.
    expect(depot.commits).toHaveLength(3)
    expect([...depot.fichiers.keys()].some((chemin) => chemin.startsWith('.sonal/verrous/')))
      .toBe(false)
  })

  test('un refus métier ne modifie ni le serveur ni le miroir', async () => {
    const { transactions, lireLocal, depot } = banc({ serveur: corpusAvecTheme() })
    const avant = lireLocal()

    await expect(transactions.executerDefinitions(
      (store) => store.tableaubordCommander({ type: 'ajouter-colonne', id: '', nom: '' }),
    )).rejects.toThrow(/nom est obligatoire/)
    expect(lireLocal()).toEqual(avant)
    const publie = JSON.parse(depot.fichiers.get(`${RACINE}/corpus.json`)!.contenu) as CorpusFichier
    expect(nomDuTheme(publie)).toBe('Thème serveur')
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('une commande sans changement ne publie aucun commit de données', async () => {
    const serveur = corpusAvecTheme()
    const { transactions, depot, lireLocal } = banc({ serveur, local: structuredClone(serveur) })

    const resultat = await transactions.executerDefinitions(
      (store) => store.modifierCategorie(ID_THEME, { nom: nomDuTheme(store.ouvrir()) as string }),
    )

    expect(resultat.corpus.codebook[ID_THEME].nom).toBe('Thème serveur')
    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(depot.commits).toHaveLength(2)
    expect(lireLocal().codebook[ID_THEME].nom).toBe('Thème serveur')
  })

  test('un miroir périmé est remis à niveau même quand la commande ne change rien', async () => {
    const serveur = corpusAvecTheme()
    const { transactions, lireLocal, depot } = banc({ serveur })

    const resultat = await transactions.executerDefinitions(
      (store) => store.migrerCategorie(ID_THEME, 'cat_001'),
    )

    expect(commitsDeDonnees(depot)).toHaveLength(1)
    expect(nomDuTheme(lireLocal())).toBe('Thème serveur')
    expect(resultat.corpus.codebook[ID_THEME].parent).toBe('cat_001')
    expect(depot.commits).toHaveLength(3)
  })

  test('une garde périmée sur corpus.json est refusée par GitLab', async () => {
    const { transactions, depot, lireLocal } = banc()
    // Un tiers modifie corpus.json entre la lecture et la publication.
    const verifier = { valide: true }
    const lireOriginal = depot.lireFichier.bind(depot)
    depot.lireFichier = async (chemin: string): Promise<FichierGitLab | null> => {
      const fichier = await lireOriginal(chemin)
      if (verifier.valide && chemin === `${RACINE}/corpus.json`) {
        verifier.valide = false
        depot.modifierHorsProtocole(chemin, JSON.stringify(corpusAvecTheme('Concurrent')))
      }
      return fichier
    }

    await expect(transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème ajouté', null),
    )).rejects.toThrow(/a changé pendant l’opération/)
    expect(nomDuTheme(lireLocal())).toBeUndefined()
  })

  test('un bail de corpus détenu par un tiers refuse la commande par son nom', async () => {
    const { transactions, depot } = banc()
    const coordination = new BailGitLab({
      branche: destination.branche,
      depot,
      identite: () => ({ userId: 'collegue', machineId: 'poste-2', sessionId: 'session-2' }),
      dureeBailMs: 600_000,
    })
    const acquisition = await coordination.acquireRessource(
      cleRessourceBailGitLab(destination.branche, `${RACINE}/corpus.json`),
    )
    expect(acquisition.ok).toBe(true)

    await expect(transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème ajouté', null),
    )).rejects.toThrow(/en cours de modification par collegue/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('le store de préparation refuse toute lecture d’entretien', async () => {
    const serveur = corpusAvecTheme()
    serveur.membership.e1 = { titre: 'E1', date: null, lastModified: null, rangAjout: 0 }
    const serveurOrd = { ...serveur, ordreEntretiens: ['e1'] } as CorpusFichier
    const { transactions } = banc({ serveur: serveurOrd })

    await expect(transactions.executerDefinitions(
      (store) => store.supprimerCategorie(ID_THEME),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
    await expect(transactions.executerDefinitions(
      (store) => store.trierEntretiens('modif'),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
    await expect(transactions.executerDefinitions(
      (store) => store.usagesParCategorie(),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
    await expect(transactions.executerDefinitions(
      (store) => store.notesInventaire(),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
  })

  test('une commande dépendante des entretiens échoue même quand le fichier manque', async () => {
    const serveur = corpusAvecTheme()
    serveur.membership.e1 = { titre: 'E1', date: null, lastModified: null, rangAjout: 0 }
    serveur.ordreEntretiens = ['e1']
    const { transactions } = banc({ serveur })

    await expect(transactions.executerDefinitions(
      (store) => store.compterUsagesVariable('var-1'),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
    await expect(transactions.executerDefinitions(
      (store) => store.casCommander({
        type: 'creer',
        cas: {
          id: 'cas-1',
          nom: 'Cas',
          memo: '',
          creeLe: '2026-01-01T00:00:00.000Z',
          modifieLe: '2026-01-01T00:00:00.000Z',
          regles: [],
          rattachements: [{
            id: 'r-1',
            type: 'manuel',
            source: { entretienId: 'e1', repereId: 'rep-1' },
          }],
        },
      }),
    )).rejects.toBeInstanceOf(ErreurCorpusSeul)
  })
})

describe('ajout et import GitLab', () => {
  test('importe depuis la base serveur fraîche, sans écriture locale avant confirmation', async () => {
    const serveur = corpusAvecTheme()
    serveur.membership.existant = {
      titre: 'Déjà présent',
      date: null,
      lastModified: '2026-01-01T00:00:00.000Z',
      rangAjout: 0,
    }
    serveur.ordreEntretiens = ['existant']
    const { transactions, store, depot, lireLocal, dirLocal } = banc({ serveur })

    const resultat = await transactions.importerEntretien('Nouvel entretien', payload('Texte'))

    expect(resultat.corpus.membership).toHaveProperty('existant')
    expect(resultat.corpus.membership).toHaveProperty(resultat.id)
    expect(lireLocal().membership).toEqual(resultat.corpus.membership)
    expect(JSON.parse(readFileSync(join(dirLocal, 'entretiens', `${resultat.id}.json`), 'utf8')))
      .toMatchObject({ corpsTexte: payload('Texte').corpsTexte })
    expect(JSON.parse(depot.fichiers.get(`${RACINE}/entretiens/${resultat.id}.json`)!.contenu))
      .toMatchObject({ corpsTexte: payload('Texte').corpsTexte })
    // Un seul commit de données : création et membership dans la même publication.
    expect(commitsDeDonnees(depot)).toHaveLength(1)
    expect(actionsDeDonnees(depot)).toHaveLength(2)
    expect(store.ouvrir().membership).toEqual(resultat.corpus.membership)
  })

  test('un miroir en retard accepte l’installation du plan local', async () => {
    const serveur = squeletteCorpus('Corpus partagé')
    const { transactions } = banc({ serveur, local: squeletteCorpus('copie très périmée') })

    const resultat = await transactions.creerEntretienVide('Entretien vide')

    expect(resultat.corpus.membership).toHaveProperty(resultat.id)
  })
})

describe('file du contexte GitLab', () => {
  test('sérialise deux transactions de corpus et le tirage', async () => {
    const serveur = corpusAvecTheme()
    const { transactions, file, lireLocal } = banc({ serveur })
    const ordre: string[] = []

    const premiere = transactions.executerDefinitions((store) => {
      ordre.push('prepare-1')
      return store.ajouterCategorie('Premier', null)
    })
    const seconde = file.executer(async () => {
      ordre.push('tirage')
    })
    const troisieme = transactions.executerDefinitions((store) =>
      store.ajouterCategorie('Second', null))

    await Promise.all([premiere, seconde, troisieme])

    expect(ordre).toEqual(['prepare-1', 'tirage'])
    expect(Object.values(lireLocal().codebook).map((c) => c.nom))
      .toEqual(expect.arrayContaining(['Premier', 'Second']))
  })

  test('une fermeture attend l’opération engagée puis refuse les suivantes', async () => {
    const { transactions, file } = banc()
    let finie = false
    const engagement = file.executer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      finie = true
    })
    const fermeture = file.fermer()

    await fermeture
    expect(finie).toBe(true)
    await expect(transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Trop tard', null),
    )).rejects.toThrow(/fermé/)
  })
})

describe('reprise après coupure', () => {
  test('une réponse perdue reste journalisée et bloque toute nouvelle transaction', async () => {
    const { transactions, journal, lireLocal } = banc()
    journal.preparer({
      operationId: 'operation-indetermine',
      nature: 'transaction-corpus',
      branche: destination.branche,
      resourceHash: hashRessourceCorpus(),
      generation: 'generation-test',
      leaseCommitId: 'a'.repeat(40),
      etat: 'indetermine',
      actions: [{
        action: 'update',
        file_path: `${RACINE}/corpus.json`,
        content: '{}',
        last_commit_id: 'b'.repeat(40),
      }],
    })

    expect(transactions.transactionReconciliee()).toBe(false)
    await expect(transactions.executerDefinitions(
      (store) => store.ajouterCategorie('Thème ajouté', null),
    )).rejects.toThrow(/résultat connu/)
    await expect(transactions.creerEntretienVide('Bloqué')).rejects.toThrow(/résultat connu/)
    expect(nomDuTheme(lireLocal())).toBeUndefined()
  })

  test('le commit est retrouvé au démarrage et l’entrée est abandonnée', async () => {
    const { transactions, journal, depot, lireLocal } = banc()

    // La réponse se perd APRÈS l'acceptation : le commit a donc bien eu lieu.
    await expect(transactions.executerDefinitions((store) => {
      depot.echouerApresAccepter(new Error('réponse perdue'))
      return store.ajouterCategorie('Thème ajouté', null)
    })).rejects.toThrow(/n’a pas été confirmée/)
    expect(journal.transactionsCorpusJournalisees()).toHaveLength(1)
    // Le miroir, lui, n'a pas bougé : c'est le tirage suivant qui le remettra.
    expect(nomDuTheme(lireLocal())).toBeUndefined()
    const publie = JSON.parse(depot.fichiers.get(`${RACINE}/corpus.json`)!.contenu) as CorpusFichier
    expect(Object.values(publie.codebook).map((c) => c.nom)).toContain('Thème ajouté')

    const [entree] = journal.lister()
    expect(entree.nature).toBe('transaction-corpus')
    expect(entree.etat).toBe('indetermine')
  })

  test('réappliquer un plan déjà installé est sans effet', async () => {
    const serveur = corpusAvecTheme()
    const { transactions, store, lireLocal } = banc({ serveur, local: structuredClone(serveur) })
    await transactions.executerDefinitions((store) => store.ajouterCategorie('Thème ajouté', null))
    const installe = lireLocal()

    // Un plan rejoué sur un état déjà installé ne doit rien casser.
    store.appliquerTransactionFichiers({
      operation: 'remplacement',
      id: 'rejeu',
      corpusAvant: { ...structuredClone(installe), nom: 'état précédent' },
      corpusApres: installe,
      entretiens: [],
    })
    expect(lireLocal()).toEqual(installe)
  })

  test('le journal local termine une installation interrompue', () => {
    const serveur = corpusAvecTheme()
    const { store, lireLocal, dirLocal } = banc({ serveur, local: structuredClone(serveur) })
    const avant = store.ouvrir()
    const apres = { ...structuredClone(avant), nom: 'Renommé après coup' }
    // Arrêt entre l'écriture du plan et son application.
    writeFileSync(join(dirLocal, '.transaction-fichiers.json'), JSON.stringify({
      formatVersion: 1,
      plan: { operation: 'remplacement', id: 'installation', corpusAvant: avant, corpusApres: apres, entretiens: [] },
    }), 'utf8')

    expect(lireLocal().nom).toBe(avant.nom)
    expect(store.reprendreTransactionFichiers()).toBe(true)
    expect(lireLocal().nom).toBe('Renommé après coup')
    expect(existsSync(join(dirLocal, '.transaction-fichiers.json'))).toBe(false)
  })
})

function hashRessourceCorpus(): string {
  return createHash('sha256')
    .update(cleRessourceBailGitLab(destination.branche, `${RACINE}/corpus.json`), 'utf8')
    .digest('hex')
}

describe('store de préparation', () => {
  test('le dossier temporaire est supprimé même après un refus', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'sonal-preparation-'))
    const store = new CorpusStore(dossier)
    store.activerModePreparation()
    writeFileSync(join(dossier, 'corpus.json'), JSON.stringify(corpusAvecTheme()), 'utf8')
    expect(() => store.avecEcritureCorpus(() => { throw new Error('refus métier') }))
      .toThrow('refus métier')
    expect(store.avecEcritureCorpus(() => store.ouvrir().codebook)).toBeDefined()
  })

  test('une continuation asynchrone est refusée', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'sonal-preparation-'))
    const store = new CorpusStore(dossier)
    store.activerModePreparation()
    writeFileSync(join(dossier, 'corpus.json'), JSON.stringify(corpusAvecTheme()), 'utf8')
    expect(() => store.avecEcritureCorpus(async () => 'trop tard'))
      .toThrow(/doit être synchrone/)
    // L'autorisation est révoquée quoi qu'il arrive.
    expect(() => store.ouvrir().codebook && store.marquerDemo({})).toThrow(/transaction sous droit/)
  })

  test('le dossier de préparation laisse des dossiers techniques vides', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'sonal-preparation-'))
    const store = new CorpusStore(dossier)
    store.activerModePreparation()
    writeFileSync(join(dossier, 'corpus.json'), JSON.stringify(corpusAvecTheme()), 'utf8')
    store.ouvrir()
    expect(existsSync(join(dossier, 'entretiens'))).toBe(true)
    expect(existsSync(join(dossier, 'entretiens', 'e1.json'))).toBe(false)
  })
})
