/**
 *  Définitions qui lisent les entretiens publiés, et tri de contenu.
 *
 *  Ce que ces gestes promettent tient dans trois propriétés : la décision se
 *  prend sur un instantané Git unique, chaque source nécessaire entre dans le
 *  commit sous une garde légère, et rien de ce que le miroir contenait n'est
 *  consulté pour valider.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { CorpusStore, ErreurCorpusSeul } from '../../src/main/corpusStore'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  type DepotCommitsGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { ErreurReponseTropVolumineuseGitLab } from '../../src/main/gitlab/client'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { preparerDefinitions } from '../../src/main/gitlab/preparationDefinitions'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { MAX_SOURCES_GARDEES, TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { CommandeCas } from '../../src/shared/corpus/cas'
import type { CommandeRecueils, ItemRecueil } from '../../src/shared/corpus/recueils'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import { deduireSourcesCas } from '../../src/main/casOrchestration'
import { DepotMemoire } from './depotMemoire'

const destination: ConfigDestinationGitLab = {
  fournisseur: 'gitlab',
  id: 'destination-sources',
  compteId: 'compte-test',
  projetId: 42,
  nomProjet: 'Corpus test',
  branche: 'main',
  racine: 'donnees',
}

const RACINE = 'donnees'
const CHEMIN_CORPUS = `${RACINE}/corpus.json`

function entretien(texte: string, reperes: string[] = [], lastModified = '2026-01-01T10:00:00.000Z') {
  return {
    formatVersion: 8,
    lastModified,
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: texte }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: reperes.map((id) => ({ id, from: 0, to: Math.max(1, texte.length) })),
  }
}

function corpusAvec(membres: Record<string, string>): CorpusFichier {
  const corpus = squeletteCorpus('Corpus partagé')
  corpus.membership = {}
  corpus.ordreEntretiens = []
  for (const [id, titre] of Object.entries(membres)) {
    corpus.membership[id] = { titre, date: null, lastModified: null, rangAjout: 0 }
    corpus.ordreEntretiens!.push(id)
  }
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

interface Banc {
  dirLocal: string
  store: CorpusStore
  depot: DepotMemoire
  transactions: TransactionsGitLab
  coordination: BailGitLab
  lireLocal(): CorpusFichier
}

/** Miroir périmé, dépôt peuplé d'entretiens publiés et transaction sous bail. */
function banc(serveur: Map<string, string>): Banc {
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-sources-'))
  mkdirSync(join(dirLocal, 'entretiens'), { recursive: true })
  // Le miroir ne contient aucun entretien : une validation qui le consulte
  // échouerait, au lieu de valider sur une copie périmée.
  writeFileSync(join(dirLocal, 'corpus.json'), JSON.stringify(corpusAvec({}), null, 2), 'utf8')
  const store = new CorpusStore(dirLocal)
  store.lectureSeule = true
  const journal = new JournalPublicationGitLab(destination.id, mkdtempSync(join(tmpdir(), 'sonal-journal-')), undefined, {
    chemin: CHEMIN_CORPUS,
    resourceHash: cleRessourceBailGitLab(destination.branche, CHEMIN_CORPUS),
  })
  const depot = new DepotMemoire()
  depot.charger(serveur)
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
    store,
    depot,
    transactions,
    coordination,
    lireLocal: () => JSON.parse(readFileSync(join(dirLocal, 'corpus.json'), 'utf8')) as CorpusFichier,
  }
}

function commandeRattachement(entretienId = 'e1', repereId = 'p1'): CommandeCas {
  return {
    type: 'ajouter-rattachements',
    casIds: ['cas-1'],
    rattachement: {
      id: 'rattachement-1',
      provenance: 'manuel',
      source: { entretienId, repereId },
      creeLe: '2026-01-02T10:00:00.000Z',
    },
  } as CommandeCas
}

/** Commandes de publication : le bail n'en fait pas partie. */
function commitsDeDonnees(depot: DepotMemoire) {
  return depot.commits.filter((commit) =>
    commit.actions.some((action) => !action.file_path.startsWith('.sonal/')))
}

function publicationDeDonnees(depot: DepotMemoire) {
  return depot.commits
    .flatMap((commit) => commit.actions)
    .filter((action) => !action.file_path.startsWith('.sonal/'))
}

describe('définitions qui lisent les entretiens publiés', () => {
  test('garde chaque source lue dans le commit, et n’écrit le miroir qu’après confirmation', async () => {
    const source = JSON.stringify(entretien('Réponse de la personne', ['p1']), null, 2)
    const { dirLocal, transactions, depot, lireLocal } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, source],
    ]))

    const commande = commandeRattachement()
    const resultat = await transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )

    const actions = publicationDeDonnees(depot)
    expect(actions.map((action) => action.file_path).sort()).toEqual([
      CHEMIN_CORPUS,
      `${RACINE}/entretiens/e1.json`,
    ])
    // La source est gardée sans transporter à nouveau sa transcription.
    const garde = actions.find((action) => action.file_path.endsWith('e1.json'))
    expect(garde).toMatchObject({
      action: 'chmod',
      execute_filemode: false,
      last_commit_id: expect.stringMatching(/^[a-f0-9]{40}$/),
    })
    expect(garde).not.toHaveProperty('content')
    // Le miroir n'a reçu que le corpus, jamais une copie de l'entretien.
    expect(lireLocal().cas).toHaveProperty('cas-1')
    expect(existsSync(join(dirLocal, 'entretiens', 'e1.json'))).toBe(false)
  })

  test('les contenus cumulés ne pèsent plus dans le corps de publication', async () => {
    const membres: Record<string, string> = {}
    const fichiers = new Map<string, string>()
    let octetsSources = 0
    for (let index = 0; index < 4; index += 1) {
      const id = `e${index}`
      membres[id] = `Entretien ${index}`
      const source = JSON.stringify(entretien('x'.repeat(600 * 1024)), null, 2)
      octetsSources += Buffer.byteLength(source)
      fichiers.set(`${RACINE}/entretiens/${id}.json`, source)
    }
    fichiers.set(CHEMIN_CORPUS, JSON.stringify(corpusAvec(membres), null, 2))
    const { transactions, depot } = banc(fichiers)

    await transactions.executerDefinitionsAvecSources(
      (store) => store.ajouterCategorie('Thème ajouté', null),
      { deduire: (corpus) => Object.keys(corpus.membership) },
    )

    expect(octetsSources).toBeGreaterThan(2 * 1024 * 1024)
    const commit = commitsDeDonnees(depot).at(-1)
    const gardes = commit?.actions.filter((action) => action.action === 'chmod') ?? []
    expect(gardes).toHaveLength(4)
    expect(gardes.every((action) => action.content === undefined)).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(commit?.actions))).toBeLessThan(32 * 1024)
  })

  test('une garde conserve le mode exécutable observé', async () => {
    const source = JSON.stringify(entretien('Texte'), null, 2)
    const chemin = `${RACINE}/entretiens/e1.json`
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [chemin, source],
    ]))
    depot.deposerHorsProtocole(chemin, source, true)

    await transactions.executerDefinitionsAvecSources(
      (store) => store.ajouterCategorie('Thème ajouté', null),
      { deduire: () => ['e1'] },
    )

    const garde = publicationDeDonnees(depot).find((action) => action.file_path === chemin)
    expect(garde).toMatchObject({ action: 'chmod', execute_filemode: true })
    expect(depot.fichiers.get(chemin)?.executable).toBe(true)
  })

  test('une source lue deux fois ne l’est qu’une fois', async () => {
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Texte', ['p1', 'p2']), null, 2)],
    ]))

    const commande = commandeRattachement('e1', 'p1')
    await transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: () => ['e1', 'e1'] },
    )

    // L'aperçu ne compte que les sources : un seul contenu est relu, au SHA.
    expect(depot.lectures.get(`${RACINE}/entretiens/e1.json`)).toBe(1)
  })

  test('une source modifiée pendant la préparation refuse tout le commit', async () => {
    const { transactions, depot, lireLocal } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Version publiée', ['p1']), null, 2)],
    ]))
    const avant = lireLocal()
    // Un tiers publie l'entretien entre notre lecture et le commit.
    const lire = depot.lireFichier.bind(depot)
    let intervenu = false
    depot.lireFichier = async (chemin: string, ref?: string): Promise<FichierGitLab | null> => {
      const fichier = await lire(chemin, ref)
      if (!intervenu && chemin.endsWith('e1.json')) {
        intervenu = true
        depot.modifierHorsProtocole(chemin, JSON.stringify(entretien('Version concurrente', ['p1']), null, 2))
      }
      return fichier
    }

    const commande = commandeRattachement()
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow(/a changé pendant l’opération/)

    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(lireLocal()).toEqual(avant)
  })

  test('un repère absent de la version publiée refuse le geste sans commit', async () => {
    const { transactions, depot, lireLocal } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      // Le miroir périmé porterait le repère : seule la version publiée compte.
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Version publiée'), null, 2)],
    ]))
    const avant = lireLocal()

    const commande = commandeRattachement('e1', 'p-absent')
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow("La référence de passage n'existe pas dans l'entretien")

    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(lireLocal()).toEqual(avant)
  })

  test('un passage de recueil se valide sur le repère publié, pas sur le miroir', async () => {
    const corpus = corpusAvec({ e1: 'Entretien 1' })
    corpus.recueils = {
      r1: { id: 'r1', nom: 'Extraits', creeLe: '2026-01-01', modifieLe: '2026-01-01', modeTexte: 'original', items: [] },
    }
    const { transactions, depot, lireLocal } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpus, null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Texte', ['p1']), null, 2)],
    ]))
    const item: ItemRecueil = {
      id: 'i1', type: 'passage', source: { entretienId: 'e1', repereId: 'p1' }, commentaireEditorial: '',
    }
    const commande: CommandeRecueils = {
      type: 'inserer-item', recueilId: 'r1', attenduOrdre: [], avantId: null, item,
    }
    await transactions.executerDefinitionsAvecSources(
      (store) => store.recueilsCommander(commande),
      { deduire: () => ['e1'] },
    )

    expect(lireLocal().recueils?.r1.items).toEqual([item])
    expect(publicationDeDonnees(depot).map((action) => action.file_path)).toEqual([
      CHEMIN_CORPUS, `${RACINE}/entretiens/e1.json`,
    ])
  })

  test.each(['inserer-item', 'modifier-item'] as const)(
    '%s refuse un passage dont le repère manque sur GitLab', async (type) => {
      const corpus = corpusAvec({ e1: 'Entretien 1' })
      const ancien: ItemRecueil = {
        id: 'i1', type: 'passage', source: { entretienId: 'e1', repereId: 'p1' }, commentaireEditorial: '',
      }
      corpus.recueils = {
        r1: {
          id: 'r1', nom: 'Extraits', creeLe: '2026-01-01', modifieLe: '2026-01-01',
          modeTexte: 'original', items: type === 'modifier-item' ? [ancien] : [],
        },
      }
      const { transactions, depot, lireLocal } = banc(new Map([
        [CHEMIN_CORPUS, JSON.stringify(corpus, null, 2)],
        [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Texte', ['p1']), null, 2)],
      ]))
      const avant = lireLocal()
      const item: ItemRecueil = {
        ...ancien, source: { entretienId: 'e1', repereId: 'p-absent' },
      }
      const commande: CommandeRecueils = type === 'inserer-item'
        ? { type, recueilId: 'r1', attenduOrdre: [], avantId: null, item }
        : { type, recueilId: 'r1', itemId: 'i1', attendu: ancien, item }
      await expect(transactions.executerDefinitionsAvecSources(
        (store) => store.recueilsCommander(commande),
        { deduire: () => ['e1'] },
      )).rejects.toThrow("Le repère du passage n'a pas été enregistré dans l'entretien.")
      expect(commitsDeDonnees(depot)).toHaveLength(0)
      expect(lireLocal()).toEqual(avant)
    },
  )

  test('une source disparue du dépôt suspend le geste', async () => {
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1', e2: 'Entretien 2' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Texte', ['p1']), null, 2)],
    ]))

    const commande = commandeRattachement()
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: () => ['e1', 'e2'] },
    )).rejects.toThrow(/n’existe plus sur GitLab/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('une source trop volumineuse est refusée par son nom, pas par un plafond anonyme', async () => {
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Texte', ['p1']), null, 2)],
    ]))
    // La lecture avec garde est plafonnée : un entretien plus long la fait
    // échouer. Le refus doit nommer l'entretien et la limite, sinon
    // l'utilisateur ne comprend pas ce qui bloque son geste.
    const lire = depot.lireFichier.bind(depot)
    depot.lireFichier = async (chemin: string, ref?: string) => {
      if (chemin.endsWith('e1.json')) throw new ErreurReponseTropVolumineuseGitLab(256 * 1024)
      return lire(chemin, ref)
    }

    const commande = commandeRattachement()
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow(/« Entretien 1 » est trop volumineux/)
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []) },
    )).rejects.toThrow(/256 Kio/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('les sources sont dédupliquées et bornées avant toute acquisition', async () => {
    const membres: Record<string, string> = {}
    const fichiers = new Map<string, string>([[CHEMIN_CORPUS, '']])
    for (let index = 0; index < MAX_SOURCES_GARDEES + 1; index += 1) {
      const id = `e${index}`
      membres[id] = `Entretien ${index}`
      fichiers.set(`${RACINE}/entretiens/${id}.json`, JSON.stringify(entretien('Texte'), null, 2))
    }
    fichiers.set(CHEMIN_CORPUS, JSON.stringify(corpusAvec(membres), null, 2))
    const { transactions, depot } = banc(fichiers)

    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.ajouterCategorie('Thème ajouté', null),
      { deduire: (corpus) => [...Object.keys(corpus.membership), 'e0'] },
    )).rejects.toThrow(new RegExp(`limite de ${MAX_SOURCES_GARDEES}`))

    // Le refus tombe avant le bail : aucun commit, de coordination compris.
    expect(depot.commits).toHaveLength(0)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('une source que nous détenons est publiée avant la préparation', async () => {
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Publié', ['p1']), null, 2)],
    ]))
    const publierSource = vi.fn(async () => {
      depot.modifierHorsProtocole(
        `${RACINE}/entretiens/e1.json`,
        JSON.stringify(entretien('Candidat publié', ['p1']), null, 2),
      )
    })

    const commande = commandeRattachement()
    await transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      { deduire: deduireSourcesCas(commande) ?? (() => []), publierSource },
    )

    expect(publierSource).toHaveBeenCalledExactlyOnceWith('e1')
    const garde = publicationDeDonnees(depot).find((action) => action.file_path.endsWith('e1.json'))
    expect(garde).toMatchObject({
      action: 'chmod',
      last_commit_id: depot.fichiers.get(`${RACINE}/entretiens/e1.json`)?.commitId,
    })
    expect(garde).not.toHaveProperty('content')
  })

  test('un refus de publication de notre source arrête la commande', async () => {
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Entretien 1' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Publié', ['p1']), null, 2)],
    ]))

    const commande = commandeRattachement()
    await expect(transactions.executerDefinitionsAvecSources(
      (store) => store.casCommander(commande),
      {
        deduire: deduireSourcesCas(commande) ?? (() => []),
        publierSource: async () => { throw new Error('La source « e1 » n’a pas pu être publiée (conflit).') },
      },
    )).rejects.toThrow(/n’a pas pu être publiée/)
    expect(depot.commits).toHaveLength(0)
  })
})

describe('tri par contenu', () => {
  function corpusTri(): Map<string, string> {
    return new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e1: 'Un', e2: 'Deux' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Un mot deux trois', [], '2026-02-02T10:00:00.000Z'), null, 2)],
      [`${RACINE}/entretiens/e2.json`, JSON.stringify(entretien('Un', [], '2026-03-03T10:00:00.000Z'), null, 2)],
    ])
  }

  test('publie un ordre sans garder aucun entretien', async () => {
    const { transactions, depot, lireLocal } = banc(corpusTri())

    const resultat = await transactions.trierEntretiens('modif', async () => {})

    expect(resultat.ordreEntretiens).toEqual(['e2', 'e1'])
    expect(publicationDeDonnees(depot).map((action) => action.file_path)).toEqual([CHEMIN_CORPUS])
    expect(lireLocal().ordreEntretiens).toEqual(['e2', 'e1'])
  })

  test('refuse un corpus tenu avant d’acquérir le bail', async () => {
    const { transactions, depot } = banc(corpusTri())
    const motif = new Error('Le tri de contenu demande la fermeture de tous les entretiens.')

    await expect(transactions.trierEntretiens('longueur', async () => { throw motif }))
      .rejects.toThrow(motif)

    // Aucun bail, aucun commit : le refus précède la coordination.
    expect(depot.commits).toHaveLength(0)
  })

  test('un entretien illisible suspend le tri sans commit', async () => {
    const fichiers = corpusTri()
    fichiers.set(`${RACINE}/entretiens/e2.json`, JSON.stringify({ formatVersion: 2 }))
    const { transactions, depot } = banc(fichiers)

    await expect(transactions.trierEntretiens('modif', async () => {}))
      .rejects.toThrow(/version non prise en charge/)
    // Le bail a été pris puis libéré : aucune donnée n'a été publiée.
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('un tri sans changement ne publie aucun commit de données', async () => {
    // L'ordre du serveur est déjà celui que le tri calcule.
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpusAvec({ e2: 'Deux', e1: 'Un' }), null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(entretien('Un mot deux trois', [], '2026-02-02T10:00:00.000Z'), null, 2)],
      [`${RACINE}/entretiens/e2.json`, JSON.stringify(entretien('Un', [], '2026-03-03T10:00:00.000Z'), null, 2)],
    ]))

    await transactions.trierEntretiens('modif', async () => {})

    // L'ordre calculé est celui du serveur : rien à publier, seul le bail passe.
    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(depot.commits).toHaveLength(2)
  })
})

describe('suppression de définitions GitLab', () => {
  function corpusAvecTheme(): CorpusFichier {
    const corpus = corpusAvec({ e1: 'Entretien 1', e2: 'Entretien 2' })
    corpus.codebook.theme = {
      id: 'theme',
      nom: 'Thème supprimable',
      parent: null,
      ordre: 0,
      actif: true,
      codeExport: 'theme',
    }
    return corpus
  }

  test('décompte toutes les versions publiées et les garde dans le commit', async () => {
    const corpus = corpusAvecTheme()
    const sourceE1 = JSON.stringify(entretien('Sans usage'), null, 2)
    const sourceE2 = JSON.stringify(entretien('Sans usage non plus'), null, 2)
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpus, null, 2)],
      [`${RACINE}/entretiens/e1.json`, sourceE1],
      [`${RACINE}/entretiens/e2.json`, sourceE2],
    ]))

    const resultat = await transactions.executerSuppressionDefinitions(
      (store) => store.supprimerCategorie('theme'),
    )

    expect(resultat.valeur.ok).toBe(true)
    expect(resultat.corpus.codebook.theme).toBeUndefined()
    expect(publicationDeDonnees(depot).map((action) => action.file_path).sort()).toEqual([
      CHEMIN_CORPUS,
      `${RACINE}/entretiens/e1.json`,
      `${RACINE}/entretiens/e2.json`,
    ])
  })

  test('refuse un usage publié sans commit de données', async () => {
    const corpus = corpusAvecTheme()
    const source = entretien('Usage publié') as EntretienFichier
    source.annotations.push({
      id: 'a1',
      type: 'codage',
      from: 1,
      to: 2,
      auteur: 'alice',
      code: 'theme',
    })
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpus, null, 2)],
      [`${RACINE}/entretiens/e1.json`, JSON.stringify(source, null, 2)],
      [`${RACINE}/entretiens/e2.json`, JSON.stringify(entretien('Sans usage'), null, 2)],
    ]))

    const resultat = await transactions.executerSuppressionDefinitions(
      (store) => store.supprimerCategorie('theme'),
    )

    expect(resultat.valeur).toEqual({ ok: false, usages: 1 })
    expect(resultat.corpus.codebook.theme).toBeDefined()
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('une source republiée pendant le décompte refuse toute la suppression', async () => {
    const corpus = corpusAvecTheme()
    const source = JSON.stringify(entretien('Version lue'), null, 2)
    const { transactions, depot } = banc(new Map([
      [CHEMIN_CORPUS, JSON.stringify(corpus, null, 2)],
      [`${RACINE}/entretiens/e1.json`, source],
      [`${RACINE}/entretiens/e2.json`, JSON.stringify(entretien('Autre source'), null, 2)],
    ]))
    const publier = depot.publierCommit.bind(depot)
    vi.spyOn(depot, 'publierCommit').mockImplementation(async (branche, message, actions) => {
      if (actions.some((action) => action.file_path === CHEMIN_CORPUS)) {
        depot.modifierHorsProtocole(
          `${RACINE}/entretiens/e1.json`,
          JSON.stringify(entretien('Version concurrente'), null, 2),
        )
      }
      return publier(branche, message, actions)
    })

    await expect(transactions.executerSuppressionDefinitions(
      (store) => store.supprimerCategorie('theme'),
    )).rejects.toThrow(/corpus GitLab a changé/)

    const distant = JSON.parse(depot.fichiers.get(CHEMIN_CORPUS)!.contenu) as CorpusFichier
    expect(distant.codebook.theme).toBeDefined()
  })
})

describe('store de préparation et ses sources', () => {
  const corpus = JSON.stringify(corpusAvec({ e1: 'Entretien 1', e2: 'Entretien 2' }), null, 2)
  const sourceE1 = JSON.stringify(entretien('Source 1', ['p1']), null, 2)

  test('lit la source prévue, et refuse toute autre lecture', () => {
    const preparation = preparerDefinitions(
      corpus,
      (store) => store.reperePassageExiste('e1', 'p1'),
      [{ id: 'e1', contenu: sourceE1 }],
    )

    expect(preparation.valeur).toBe(true)
    // Une lecture non prévue n'est pas une absence : c'est un défaut.
    expect(() => preparerDefinitions(corpus, (store) => store.reperePassageExiste('e2', 'p1'),
      [{ id: 'e1', contenu: sourceE1 }])).toThrow(ErreurCorpusSeul)
  })

  test('une lecture non prévue est une erreur, pas une donnée absente', () => {
    expect(() => preparerDefinitions(corpus, (store) => store.notesInventaire(),
      [{ id: 'e1', contenu: sourceE1 }])).toThrow(ErreurCorpusSeul)
  })

  test('un inventaire complet refuse une source manquante', () => {
    expect(() => preparerDefinitions(
      corpus,
      (store) => store.notesInventaire(),
      [{ id: 'e1', contenu: sourceE1 }],
      { inventaireComplet: true },
    )).toThrow(/tous les entretiens/)
  })

  test('une écriture d’entretien reste refusée même pour une source prévue', () => {
    expect(() => preparerDefinitions(corpus, (store) => store.supprimerEntretien('e1'),
      [{ id: 'e1', contenu: sourceE1 }])).toThrow(ErreurCorpusSeul)
  })
})
