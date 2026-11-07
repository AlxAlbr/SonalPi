/**
 *  Suppression d'un entretien sur un dépôt GitLab.
 *
 *  Ces tests sont simulés : ils prouvent la mécanique du geste — deux droits,
 *  un commit atomique, une archive distante choisie et une archive locale
 *  durable — pas le comportement d'une instance réelle. La qualification à
 *  deux comptes vit dans `qualificationSuppressionEntretien.test.ts`.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  cheminBailRessourceGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import {
  JournalPublicationGitLab,
  ReconciliateurPublicationGitLab,
} from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import type { ActionCommitGitLab } from '../../src/main/gitlab/bailGitLab'
import {
  empreinteArchive,
  suffixeArchive,
} from '../../src/main/gitlab/suppressionEntretien'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { analyserImpactSuppressionEntretien } from '../../src/shared/corpus/suppressionEntretien'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import { FORMAT_VERSION } from '../../src/shared/format'
import { DepotMemoire } from './depotMemoire'

const RACINE = 'donnees'
const ID = 'e1'
const AUTRE = 'e2'
const OPERATION = 'op-suppression-test'

const destination: ConfigDestinationGitLab = {
  fournisseur: 'gitlab',
  id: 'destination-suppression',
  compteId: 'compte-test',
  projetId: 42,
  nomProjet: 'Corpus test',
  branche: 'main',
  racine: RACINE,
}

function ressource(corpusId = `corpus.crp`, entretienId?: string): string {
  return cleRessourceBailGitLab(
    destination.branche,
    entretienId ? `${RACINE}/${corpusId}` : `${RACINE}/${corpusId}`,
  )
}

function hacherRessource(chemin: string): string {
  return createHash('sha256').update(chemin, 'utf8').digest('hex')
}

function hacherCorpus(): string {
  return hacherRessource(cleRessourceBailGitLab(destination.branche, `${RACINE}/corpus.crp`))
}

function entretienPublie(titre: string): string {
  const entretien: EntretienFichier = {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T10:00:00.000Z',
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: null },
        content: [{ type: 'text', text: `entretien ${titre}` }],
      }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
  return JSON.stringify(entretien, null, 2)
}

/** Corpus publié portant `e1` et `e2`, et un recueil qui reprend `e1`. */
function corpusServeur(avecRecueil = true): CorpusFichier {
  const corpus = squeletteCorpus('Corpus partagé')
  corpus.membership = {
    [ID]: { titre: 'Entretien un', date: null, lastModified: null, rangAjout: 0 },
    [AUTRE]: { titre: 'Entretien deux', date: null, lastModified: null, rangAjout: 1 },
  }
  corpus.ordreEntretiens = [ID, AUTRE]
  if (avecRecueil) {
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
          source: { entretienId: ID, repereId: 'r1' },
          commentaireEditorial: '',
        }],
      },
    }
  }
  return corpus
}

interface OptionsBanc {
  serveur?: CorpusFichier
  local?: CorpusFichier | null
  /** Dépôt d'un second poste, pour lui faire prendre un droit. */
  identite?: { userId: string; machineId: string; sessionId: string }
  /** Ressources dont un marqueur historique doit bloquer l'exclusion. */
  ressourcesLegacy?: string[]
  operation?: string
}

interface Banc {
  dirLocal: string
  dirJournal: string
  store: CorpusStore
  depot: DepotMemoire
  journal: JournalPublicationGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  transactions: TransactionsGitLab
  file: FileOperationsContexte
  lireLocal(): CorpusFichier
}

/** Miroir local avec son entretien et ses annexes, dépôt mémoire, coordinateur,
 *  journal et transactions. Le miroir est volontairement en retard. */
function banc(options: OptionsBanc = {}): Banc {
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-suppression-'))
  mkdirSync(join(dirLocal, 'entretiens'), { recursive: true })
  mkdirSync(join(dirLocal, 'png'), { recursive: true })
  const serveur = options.serveur ?? corpusServeur()
  const local = options.local === undefined ? structuredClone(serveur) : options.local
  if (local) {
    writeFileSync(join(dirLocal, 'corpus.crp'), JSON.stringify(local, null, 2), 'utf8')
    for (const [chemin, contenu] of [
      [`entretiens/${ID}.json`, entretienPublie('un')],
      [`entretiens/${ID}.json.bak1`, entretienPublie('un')],
      [`entretiens/${ID}.json.bak2`, entretienPublie('un')],
      [`entretiens/${AUTRE}.json`, entretienPublie('deux')],
      ['png/e1.png', 'premier'],
      ['png/e1.vague.png', 'second'],
      ['png/e2-0001.png', 'autre'],
    ] as const) {
      writeFileSync(join(dirLocal, chemin), contenu, 'utf8')
    }
  }
  const store = new CorpusStore(dirLocal)
  store.lectureSeule = true
  const dirJournal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-journal-suppression-'))
  const journal = new JournalPublicationGitLab(destination.id, dirJournal, undefined, {
    chemin: `${RACINE}/corpus.crp`,
    resourceHash: hacherCorpus(),
  })
  const depot = new DepotMemoire()
  depot.charger(new Map<string, string>([
    [`${RACINE}/corpus.crp`, JSON.stringify(serveur, null, 2)],
    [`${RACINE}/entretiens/${ID}.json`, entretienPublie('un')],
    [`${RACINE}/entretiens/${AUTRE}.json`, entretienPublie('deux')],
  ]))
  const coordination = new BailGitLab({
    branche: destination.branche,
    depot,
    identite: () => options.identite ?? {
      userId: 'max',
      machineId: 'poste-1',
      sessionId: 'session-1',
    },
    ressourcesLegacy: options.ressourcesLegacy,
  })
  const file = new FileOperationsContexte()
  const publication = new PublieurGitLab({ branche: destination.branche, depot, coordination, journal })
  const transactions = new TransactionsGitLab({
    destination,
    store,
    depot,
    coordination,
    publication,
    file,
    journal,
    nouvelleOperation: () => options.operation ?? `op-${Math.random().toString(36).slice(2, 10)}`,
  })
  return {
    dirLocal,
    dirJournal,
    store,
    depot,
    journal,
    coordination,
    publication,
    transactions,
    file,
    lireLocal: () =>
      JSON.parse(readFileSync(join(dirLocal, 'corpus.crp'), 'utf8')) as CorpusFichier,
  }
}

function commitsDeDonnees(depot: DepotMemoire) {
  return depot.commits
    .filter((commit) => commit.actions.some((a) => !a.file_path.startsWith('.sonal/')))
    .map((commit) => commit.actions)
}

function existe(dossier: string, chemin: string): boolean {
  return existsSync(join(dossier, chemin))
}

/** Dépôt d'un bail au nom d'un tiers, hors de tout protocole de l'application. */
function poserBail(
  depot: DepotMemoire,
  cheminRessource: string,
  userId: string,
  expireLe: string,
): void {
  depot.deposerHorsProtocole(cheminBailRessourceGitLab(cheminRessource), JSON.stringify({
    version: 2,
    protocole: 'sonal-bail-v2',
    resourceHash: hacherRessource(cheminRessource),
    generation: `generation-${userId}`,
    holder: { userId, machineId: `poste-${userId}`, sessionId: `session-${userId}` },
    expireLe,
    compteur: 1,
  }))
}

describe('suppression d’un entretien — parcours nominal', () => {
  test('retire le membership et archive le JSON dans un seul commit, sous deux droits', async () => {
    const { transactions, depot, lireLocal, dirLocal, journal, dirJournal } = banc()
    const impact = await transactions.analyserSuppressionEntretien(ID)
    expect(impact.passagesRecueils).toBe(1)

    const corpus = await transactions.supprimerEntretien(ID, impact)

    expect(corpus.membership[ID]).toBeUndefined()
    expect(corpus.ordreEntretiens).toEqual([AUTRE])
    expect(lireLocal().membership[ID]).toBeUndefined()

    const donnees = commitsDeDonnees(depot)
    expect(donnees).toHaveLength(1)
    expect(donnees[0]
      .filter((action) => !action.file_path.startsWith('.sonal/'))
      .map((action) => [action.action, action.file_path])).toEqual([
      ['update', `${RACINE}/corpus.crp`],
      ['move', `${RACINE}/corbeille/${ID}.json`],
    ])
    // Deux actions métier, deux mutations de bail : le commit est entier.
    expect(donnees[0]).toHaveLength(4)
    expect(depot.fichiers.has(`${RACINE}/entretiens/${ID}.json`)).toBe(false)
    expect(depot.fichiers.get(`${RACINE}/corbeille/${ID}.json`)?.contenu)
      .toBe(entretienPublie('un'))
    expect(depot.commits).toHaveLength(5)
    expect(journal.lister()).toEqual([])

    // L'archivage local est complet : JSON, deux sauvegardes, deux PNG.
    for (const chemin of [
      'corbeille/e1.json',
      'corbeille/e1.json.bak1',
      'corbeille/e1.json.bak2',
      'corbeille/e1.png',
      'corbeille/e1.vague.png',
    ]) {
      expect([chemin, existe(dirLocal, chemin)]).toEqual([chemin, true])
    }
    // Les médias référencés et les autres entretiens ne bougent pas.
    expect(existe(dirLocal, `entretiens/${AUTRE}.json`)).toBe(true)
    expect(existe(dirLocal, 'png/e2-0001.png')).toBe(true)
  })

  test('l’aperçu lit le corpus publié et non le miroir périmé', async () => {
    const serveur = corpusServeur(false)
    const { transactions, lireLocal } = banc({ serveur, local: corpusServeur(true) })

    const impact = await transactions.analyserSuppressionEntretien(ID)

    expect(impact.passagesRecueils).toBe(0)
    // Le miroir porte un recueil que le serveur ne connaît pas : il ne prouve
    // rien, et l'aperçu ne s'en sert pas.
    expect(lireLocal().recueils?.r1).toBeDefined()
  })

  test('un entretien absent du membership publié est un refus nommé', async () => {
    const { transactions, depot } = banc()
    await expect(transactions.supprimerEntretien('inconnu'))
      .rejects.toThrow(/n’existe plus/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })

  test('une source disparue entre la lecture et le commit refuse tout', async () => {
    const { transactions, depot, lireLocal } = banc()
    const impact = await transactions.analyserSuppressionEntretien(ID)
    depot.fichiers.delete(`${RACINE}/entretiens/${ID}.json`)

    await expect(transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/n’existe plus sur GitLab/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(lireLocal().membership[ID]).toBeDefined()
  })

  test('un impact inchangé laisse passer la commande', async () => {
    const { transactions, depot } = banc()
    const impact = await transactions.analyserSuppressionEntretien(ID)
    expect(impact).toEqual(analyserImpactSuppressionEntretien(corpusServeur(), ID))

    await transactions.supprimerEntretien(ID, impact)
    expect(commitsDeDonnees(depot)).toHaveLength(1)
  })
})

describe('suppression d’un entretien — impact confirmé', () => {
  test('une référence parue entre l’aperçu et la commande impose une nouvelle confirmation', async () => {
    const { transactions, depot, lireLocal } = banc({
      serveur: corpusServeur(true),
      local: corpusServeur(false),
    })
    const impact = await transactions.analyserSuppressionEntretien(ID)
    expect(impact.passagesRecueils).toBe(1)

    // L'utilisateur avait confirmé un impact sans aucun recueil.
    await expect(transactions.supprimerEntretien(ID, { ...impact, passagesRecueils: 0 }))
      .rejects.toThrow(/références de cet entretien ont changé/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
    expect(lireLocal().membership[ID]).toBeDefined()
  })

  test('des références non confirmées sont refusées', async () => {
    const { transactions, depot } = banc()
    await expect(transactions.supprimerEntretien(ID))
      .rejects.toThrow(/Confirmez la suppression/)
    expect(commitsDeDonnees(depot)).toHaveLength(0)
  })
})

describe('suppression d’un entretien — les deux droits', () => {
  test('un entretien tenu par un tiers est refusé par son nom, sans commit de données', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    poserBail(
      b.depot,
      ressource('entretiens/e1.json'),
      'bob',
      new Date(Date.now() + 600_000).toISOString(),
    )

    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow(/bob/)

    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect(b.depot.fichiers.has(`${RACINE}/entretiens/${ID}.json`)).toBe(true)
    expect(b.lireLocal().membership[ID]).toBeDefined()
    // Le droit du corpus, déjà pris, a été rendu : seul celui de l'autre reste.
    expect([...b.depot.fichiers.keys()].filter((c) => c.startsWith('.sonal/')))
      .toEqual([cheminBailRessourceGitLab(ressource('entretiens/e1.json'))])
  })

  test('le droit du corpus tenu par un tiers arrête avant toute acquisition d’entretien', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    poserBail(
      b.depot,
      ressource('corpus.crp'),
      'bob',
      new Date(Date.now() + 600_000).toISOString(),
    )

    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/Le corpus GitLab est en cours de modification par bob/)
    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect([...b.depot.fichiers.keys()].filter((c) => c.startsWith('.sonal/')))
      .toEqual([cheminBailRessourceGitLab(ressource('corpus.crp'))])
  })

  test('un marqueur historique reste bloquant même expiré', async () => {
    const chemin = ressource('entretiens/e1.json')
    const b = banc({ ressourcesLegacy: [chemin] })
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    b.depot.deposerHorsProtocole(cheminBailRessourceGitLab(chemin), JSON.stringify({
      version: 1,
      protocole: 'sonal-bail-v1',
      resourceHash: hacherRessource(chemin),
      generation: 'ancienne',
      holder: { userId: 'bob', machineId: 'poste-bob', sessionId: 'session-bob' },
      expireLe: '2020-01-01T00:00:00.000Z',
      compteur: 4,
    }))

    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow(/bob/)
    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
  })

  test('un droit d’entretien perdu pendant l’envoi nomme l’entretien', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    const chemin = ressource('entretiens/e1.json')
    // Au moment du commit de données, l'autre poste reprend le bail de
    // l'entretien : la garde du déplacement devient périmée.
    b.depot.avantCommit = (actions) => {
      if (!actions.some((action) => action.action === 'move')) return
      poserBail(b.depot, chemin, 'bob', new Date(Date.now() + 600_000).toISOString())
    }

    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/« Entretien un » a été repris par un autre poste/)
    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect(b.depot.fichiers.has(`${RACINE}/corbeille/${ID}.json`)).toBe(false)
    expect(b.lireLocal().membership[ID]).toBeDefined()
    expect(b.journal.lister()).toEqual([])
  })

  test('une garde de donnée périmée refuse le commit entier', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    b.depot.avantCommit = (actions) => {
      if (!actions.some((action) => action.action === 'move')) return
      // Le corpus a bougé depuis la lecture : garde périmée, commit refusé.
      b.depot.modifierHorsProtocole(
        `${RACINE}/corpus.crp`,
        JSON.stringify(corpusServeur(false), null, 2),
      )
    }

    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/le corpus GitLab a changé pendant l’opération/)
    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect(b.depot.fichiers.has(`${RACINE}/entretiens/${ID}.json`)).toBe(true)
    expect(b.lireLocal().membership[ID]).toBeDefined()
  })
})

describe('suppression d’un entretien — destination d’archive', () => {
  test('une archive distante occupée reçoit un suffixe stable, sans écrasement', async () => {
    const b = banc({ operation: OPERATION })
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    const ancien = 'archive déjà présente'
    b.depot.deposerHorsProtocole(`${RACINE}/corbeille/${ID}.json`, ancien)

    await b.transactions.supprimerEntretien(ID, impact)

    const attendu = `${RACINE}/corbeille/${ID}.${suffixeArchive(OPERATION)}.json`
    expect(b.depot.fichiers.get(`${RACINE}/corbeille/${ID}.json`)?.contenu).toBe(ancien)
    expect(b.depot.fichiers.get(attendu)?.contenu).toBe(entretienPublie('un'))
    expect(b.depot.fichiers.has(`${RACINE}/entretiens/${ID}.json`)).toBe(false)
  })

  test('deux archives prises sont un refus explicite, sans écrasement', async () => {
    const b = banc({ operation: OPERATION })
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    b.depot.deposerHorsProtocole(`${RACINE}/corbeille/${ID}.json`, 'première archive')
    b.depot.deposerHorsProtocole(
      `${RACINE}/corbeille/${ID}.${suffixeArchive(OPERATION)}.json`,
      'seconde archive',
    )

    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/Deux archives/)
    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect(b.depot.fichiers.get(`${RACINE}/corbeille/${ID}.json`)?.contenu)
      .toBe('première archive')
    expect(b.depot.fichiers.get(
      `${RACINE}/corbeille/${ID}.${suffixeArchive(OPERATION)}.json`,
    )?.contenu).toBe('seconde archive')
  })

  test('une corbeille locale déjà peuplée reçoit un suffixe, jamais un écrasement', async () => {
    const b = banc({ operation: OPERATION })
    mkdirSync(join(b.dirLocal, 'corbeille'), { recursive: true })
    writeFileSync(join(b.dirLocal, 'corbeille', `${ID}.json`), 'ancienne archive', 'utf8')
    const impact = await b.transactions.analyserSuppressionEntretien(ID)

    await b.transactions.supprimerEntretien(ID, impact)

    expect(readFileSync(join(b.dirLocal, 'corbeille', `${ID}.json`), 'utf8'))
      .toBe('ancienne archive')
    const archives = readdirSync(join(b.dirLocal, 'corbeille')).sort()
    expect(archives).toContain(`${ID}.json`)
    expect(archives).toContain(`${ID}.json.${suffixeArchive(OPERATION)}`)
    expect(archives).toContain(`${ID}.json.bak1`)
    expect(b.lireLocal().membership[ID]).toBeUndefined()
  })
})

describe('suppression d’un entretien — reprise', () => {
  test('une collision de tête de branche est réessayée, garde de déplacement comprise', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    // La tête de branche refuse une fois, sans qu'aucune garde n'ait bougé :
    // le refus ne parle pas de notre édition, et le même commit repart.
    let uneFois = true
    b.depot.avantCommit = (actions) => {
      if (!uneFois || !actions.some((action) => action.action === 'move')) return
      uneFois = false
      b.depot.refuser(400)
    }

    await b.transactions.supprimerEntretien(ID, impact)

    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
    expect(b.depot.fichiers.get(`${RACINE}/corbeille/${ID}.json`)?.contenu)
      .toBe(entretienPublie('un'))
    expect(b.journal.lister()).toEqual([])
    expect(b.lireLocal().membership[ID]).toBeUndefined()
  })

  /** La réponse du commit de données se perd après son acceptation. */
  function perdreReponse(b: Banc, historique: boolean): void {
    b.depot.avantCommit = (actions) => {
      if (!actions.some((action) => action.action === 'move')) return
      if (historique) b.depot.rendreCommitsIllisibles()
      b.depot.echouerApresAccepter(new Error('réponse perdue'))
    }
  }

  test('une réponse perdue retrouve le commit et n’applique le plan local qu’une fois', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    perdreReponse(b, false)

    await b.transactions.supprimerEntretien(ID, impact)

    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
    expect(b.journal.lister()).toEqual([])
    expect(b.lireLocal().membership[ID]).toBeUndefined()
    expect(existe(b.dirLocal, 'corbeille/e1.json')).toBe(true)
    // Les deux baux ont été rendus : rien ne reste acquis après la reprise.
    expect([...b.depot.fichiers.keys()].filter((c) => c.startsWith('.sonal/'))).toEqual([])
  })

  test('une réponse perdue et une réconciliation impossible bloquent tout', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    perdreReponse(b, true)

    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/n’a pas pu être confirmée/)

    expect(b.journal.lister()).toHaveLength(1)
    expect(b.journal.transactionsCorpusJournalisees()).toHaveLength(1)
    // Rien n'est appliqué localement, et plus aucune transaction ne passe.
    expect(b.lireLocal().membership[ID]).toBeDefined()
    expect(existe(b.dirLocal, 'corbeille/e1.json')).toBe(false)
    await expect(b.transactions.executerDefinitions((store) => store.ajouterCategorie('X', null)))
      .rejects.toThrow(/résultat connu/)
    await expect(b.transactions.supprimerEntretien(ID, impact))
      .rejects.toThrow(/résultat connu/)
  })

  test('un arrêt après le commit installe l’archive locale au redémarrage, sans republier', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    perdreReponse(b, true)
    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow()

    // L'historique redevient lisible : c'est le redémarrage de l'application.
    b.depot.rendreCommits()
    await reprendreOperationsGitLab({
      depot: b.depot,
      coordination: b.coordination,
      journal: b.journal,
      dirMiroir: b.dirLocal,
    })

    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
    expect(b.journal.lister()).toEqual([])
    expect(b.lireLocal().membership[ID]).toBeUndefined()
    for (const chemin of [
      'corbeille/e1.json',
      'corbeille/e1.json.bak1',
      'corbeille/e1.json.bak2',
      'corbeille/e1.png',
    ]) {
      expect([chemin, existe(b.dirLocal, chemin)]).toEqual([chemin, true])
    }
    // Un second passage ne déplace rien de plus.
    await reprendreOperationsGitLab({
      depot: b.depot,
      coordination: b.coordination,
      journal: b.journal,
      dirMiroir: b.dirLocal,
    })
    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
  })

  test('un corpus local absent bloque la reprise et conserve le plan composite', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    perdreReponse(b, true)
    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow()
    b.depot.rendreCommits()
    unlinkSync(join(b.dirLocal, 'corpus.crp'))

    await expect(reprendreOperationsGitLab({
      depot: b.depot,
      coordination: b.coordination,
      journal: b.journal,
      dirMiroir: b.dirLocal,
    })).rejects.toThrow(/corpus\.crp est absent/)

    expect(b.journal.lister()).toHaveLength(1)
    expect(existe(b.dirLocal, 'entretiens/e1.json')).toBe(true)
    expect(existe(b.dirLocal, 'corbeille/e1.json')).toBe(false)
  })

  test('un arrêt au milieu de l’application locale est terminé par le journal', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    perdreReponse(b, true)
    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow()
    b.depot.rendreCommits()

    // Le plan local seul suffit à finir l'archivage, comme après un arrêt entre
    // la confirmation et la création du journal de transaction de fichiers.
    const [entree] = b.journal.lister()
    b.journal.marquerConfirmeAInstaller(entree.operationId, 'c'.repeat(40))
    new CorpusStore(b.dirLocal)
      .appliquerTransactionFichiers(b.journal.lister()[0].suppression!.planLocal)
    b.journal.supprimer(entree.operationId)

    await reprendreOperationsGitLab({
      depot: b.depot,
      coordination: b.coordination,
      journal: b.journal,
      dirMiroir: b.dirLocal,
    })
    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
    expect(existe(b.dirLocal, 'corbeille/e1.json')).toBe(true)
    expect(existe(b.dirLocal, 'entretiens/e1.json')).toBe(false)
  })

  test('une panne avant tout envoi laisse le dépôt et le miroir intacts', async () => {
    const b = banc()
    const impact = await b.transactions.analyserSuppressionEntretien(ID)
    b.depot.echouerAvantEnvoyer(new Error('hors ligne'))

    await expect(b.transactions.supprimerEntretien(ID, impact)).rejects.toThrow(/hors ligne/)

    expect(b.journal.lister()).toEqual([])
    expect(b.lireLocal().membership[ID]).toBeDefined()
    expect(existe(b.dirLocal, `entretiens/${ID}.json`)).toBe(true)
    expect(b.depot.fichiers.has(`${RACINE}/entretiens/${ID}.json`)).toBe(true)
  })
})

describe('suppression d’un entretien — façade du contexte', () => {
  interface SessionFactice {
    fermer(): Promise<{ fermee: boolean; raison?: string }>
  }

  function contexteSur(banc: Banc, session: SessionFactice) {
    const file = new FileOperationsContexte()
    const transactions = new TransactionsGitLab({
      destination,
      store: banc.store,
      depot: banc.depot,
      coordination: banc.coordination,
      publication: new PublieurGitLab({
        branche: destination.branche,
        depot: banc.depot,
        coordination: banc.coordination,
        journal: banc.journal,
      }),
      file,
      journal: banc.journal,
      nouvelleOperation: () => `op-${Math.random().toString(36).slice(2, 10)}`,
    })
    return new ContexteGitLab(
      destination.id,
      banc.store,
      { dirLocal: banc.dirLocal } as never,
      () => ({
        ouvrir: async () => ({ etat: 'edition', revision: 0, revisionPubliee: 0 }),
        marquerSale: async () => undefined,
        publier: async () => ({ statut: 'confirme', commitId: '1'.repeat(40), compteurBail: 2 }),
        renouveler: async () => true,
        fermer: () => session.fermer(),
        etat: () => ({ etat: 'edition' }),
      }) as never,
      transactions,
    )
  }

  test('ferme notre session avant toute acquisition, puis supprime', async () => {
    const b = banc()
    const etapes: string[] = []
    const contexte = contexteSur(b, {
      fermer: async () => {
        etapes.push('session fermée')
        return { fermee: true }
      },
    })
    await contexte.ouvrirSessionEntretien(ID)
    b.depot.avantCommit = (actions) => {
      if (actions.some((action) => action.action === 'move')) etapes.push('commit de données')
    }
    const impact = await contexte.analyserSuppressionEntretien(ID)

    await contexte.supprimerEntretien(ID, impact)

    expect(etapes).toEqual(['session fermée', 'commit de données'])
    expect(commitsDeDonnees(b.depot)).toHaveLength(1)
    expect(b.lireLocal().membership[ID]).toBeUndefined()
  })

  test('une session qui ne peut pas être fermée arrête la commande avant le bail corpus', async () => {
    const b = banc()
    const contexte = contexteSur(b, { fermer: async () => ({ fermee: false, raison: 'degrade' }) })
    await contexte.ouvrirSessionEntretien(ID)
    const impact = await contexte.analyserSuppressionEntretien(ID)

    await expect(contexte.supprimerEntretien(ID, impact))
      .rejects.toThrow(/session dégradée/)

    expect(commitsDeDonnees(b.depot)).toHaveLength(0)
    expect([...b.depot.fichiers.keys()].filter((c) => c.startsWith('.sonal/'))).toEqual([])
  })

  test('une ouverture locale est refusée pendant la suppression', async () => {
    const b = banc()
    const tentatives: string[] = []
    const contexte = contexteSur(b, {
      fermer: async () => {
        // Une ouverture locale arrive pendant l'attente du second droit.
        b.depot.avantCommit = (actions) => {
          if (actions.some((action) => action.action === 'create'
            && action.file_path.startsWith('.sonal/'))) {
            void contexte.ouvrirSessionEntretien(ID).then(
              () => tentatives.push('ouverte'),
              (erreur: Error) => tentatives.push(erreur.message),
            )
          }
        }
        return { fermee: true }
      },
    })
    await contexte.ouvrirSessionEntretien(ID)
    const impact = await contexte.analyserSuppressionEntretien(ID)

    await contexte.supprimerEntretien(ID, impact)
    await new Promise((resolve) => setImmediate(resolve))

    expect(tentatives.join(' ')).toMatch(/suppression de .* est en cours/)
  })
})

describe('suppression d’un entretien — réconciliation du déplacement', () => {
  const OPERATION = 'op-reconciliation'

  /** Journal d'une suppression dont la réponse s'est perdue : le dépôt, seul,
   *  pourra dire si l'archive retrouvée est bien celle de la préparation. */
  function semerSuppression(b: Banc): void {
    b.journal.preparer({
      operationId: OPERATION,
      nature: 'suppression-entretien',
      branche: destination.branche,
      droits: [
        { resourceHash: hacherCorpus(), generation: 'g1', leaseCommitId: 'a'.repeat(40) },
        {
          resourceHash: hacherRessource(ressource('entretiens/e1.json')),
          generation: 'g2',
          leaseCommitId: 'b'.repeat(40),
        },
      ],
      etat: 'indetermine',
      actions: actionsDuRetrait(b),
      suppression: {
        entretienId: ID,
        cheminSource: `${RACINE}/entretiens/${ID}.json`,
        cheminArchive: `${RACINE}/corbeille/${ID}.json`,
        empreinteArchive: empreinteArchive(entretienPublie('un')),
        octetsArchive: Buffer.byteLength(entretienPublie('un'), 'utf8'),
        planLocal: {
          operation: 'suppression',
          id: ID,
          corpusAvant: corpusServeur(false),
          corpusApres: corpusServeur(false),
          deplacements: [],
        },
      },
    })
  }

  function actionsDuRetrait(b: Banc): ActionCommitGitLab[] {
    return [
      {
        action: 'update',
        file_path: `${RACINE}/corpus.crp`,
        content: JSON.stringify(corpusServeur(false), null, 2),
        last_commit_id: b.depot.fichiers.get(`${RACINE}/corpus.crp`)!.commitId,
      },
      {
        action: 'move',
        file_path: `${RACINE}/corbeille/${ID}.json`,
        previous_path: `${RACINE}/entretiens/${ID}.json`,
        last_commit_id: b.depot.fichiers.get(`${RACINE}/entretiens/${ID}.json`)!.commitId,
      },
    ]
  }

  /** Le commit que GitLab a bel et bien accepté, et dont on a perdu la réponse. */
  async function publierLeRetrait(b: Banc): Promise<void> {
    await b.depot.publierCommit('main', `Sonal ${OPERATION}`, actionsDuRetrait(b))
  }

  function reconcilier(b: Banc) {
    const [entree] = b.journal.lister()
    return new ReconciliateurPublicationGitLab(b.depot, b.journal).reconcilier(entree)
  }

  test('un déplacement conforme est confirmé, sans second envoi', async () => {
    const b = banc()
    semerSuppression(b)
    await publierLeRetrait(b)

    await expect(reconcilier(b)).resolves.toEqual({
      statut: 'confirme',
      commitId: expect.stringMatching(/^[a-f0-9]{40}$/),
    })
    expect(b.depot.commits).toHaveLength(1)
  })

  test('un entretien resté à son chemin laisse le résultat indéterminé', async () => {
    const b = banc()
    semerSuppression(b)
    await publierLeRetrait(b)
    // L'archive est là, mais l'ancien chemin aussi : le retrait n'est pas complet.
    b.depot.deposerHorsProtocole(`${RACINE}/entretiens/${ID}.json`, entretienPublie('un'))

    await expect(reconcilier(b)).resolves.toEqual({ statut: 'indetermine' })
  })

  test('une archive au contenu différent laisse le résultat indéterminé', async () => {
    const b = banc()
    semerSuppression(b)
    await publierLeRetrait(b)
    b.depot.deposerHorsProtocole(`${RACINE}/corbeille/${ID}.json`, entretienPublie('autre chose'))

    await expect(reconcilier(b)).resolves.toEqual({ statut: 'indetermine' })
  })

  test('un commit certainement absent abandonne l’intention', async () => {
    const b = banc()
    semerSuppression(b)

    await expect(reconcilier(b)).resolves.toEqual({ statut: 'absent' })
  })
})
