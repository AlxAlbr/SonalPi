import { afterEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'
import { DepotMemoire } from './depotMemoire'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc(nombre = 3) {
  const fixture = fixtureLocuteursDistants()
  for (let i = 3; i < nombre; i++) {
    const id = `e${i}`, source = structuredClone(fixture.entretiens[0])
    source.id = id; source.titre = `Entretien ${i}`
    fixture.entretiens.push(source); fixture.corpus.membership[id] = { ...fixture.corpus.membership.A, titre: source.titre }
  }
  const dir = mkdtempSync(join(tmpdir(), 'sonal-gitlab-locuteurs-'))
  dossiers.push(dir); mkdirSync(join(dir, 'entretiens')); mkdirSync(join(dir, 'journal'))
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(squeletteCorpus('Miroir périmé')))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const destination: ConfigDestinationGitLab = { fournisseur: 'gitlab', id: 'dest-locuteurs', compteId: 'compte', projetId: 42, nomProjet: 'Test', branche: 'main', racine: '' }
  const depot = new DepotMemoire()
  depot.charger(new Map([['corpus.crp', JSON.stringify(fixture.corpus)], ...fixture.sources().map((s): [string, string] => [`entretiens/${s.id}.json`, s.contenu])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' }) })
  const journal = new JournalPublicationGitLab(destination.id, join(dir, 'journal'), undefined, { chemin: 'corpus.crp', resourceHash: cleRessourceBailGitLab('main', 'corpus.crp') })
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const transactions = new TransactionsGitLab({ destination, store, depot, coordination, journal, publication, file: new FileOperationsContexte() })
  const commande = () => ({ type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice publiée', attendu: fixture.attendu() })
  const donnees = () => depot.commits.filter((c) => c.actions.some((a) => !a.file_path.startsWith('.sonal/')))
  return { fixture, dir, destination, store, depot, coordination, journal, publication, transactions, commande, donnees }
}

test('sans suivi durable ou au-delà de la borne du commit : aucune correction publiée', async () => {
  const b = banc()
  const sansJournal = new TransactionsGitLab({ destination: b.destination, store: b.store, depot: b.depot, coordination: b.coordination, publication: b.publication, file: new FileOperationsContexte() })
  await expect(sansJournal.corrigerLocuteurs(b.commande(), () => {})).rejects.toThrow('suivi')
  expect(b.depot.commits).toEqual([])
  const gros = banc(125)
  await expect(gros.transactions.corrigerLocuteurs(gros.commande(), () => {})).rejects.toThrow('trop d’entretiens')
  expect(gros.donnees()).toEqual([])
})

test('aperçu : toutes les sources publiées sans bail ni écriture du miroir', async () => {
  const b = banc(), avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
  const details = await b.transactions.lireDetailsLocuteurs()
  expect(JSON.stringify(details.inventaire)).toBe(b.fixture.attendu())
  expect(details.inventaire.notes).toHaveLength(3)
  expect(b.depot.commits).toEqual([])
  expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant)
  b.depot.modifierHorsProtocole('entretiens/C.json', '{}')
  await expect(b.transactions.lireDetailsLocuteurs()).rejects.toThrow()
  expect(b.depot.commits).toEqual([])
})

test('renommage gardé : un seul commit, sources serveur et miroir installé seulement après confirmation', async () => {
  const b = banc(), avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
  b.depot.avantCommit = (actions) => { if (actions.some((a) => !a.file_path.startsWith('.sonal/'))) expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant) }
  expect(await b.transactions.corrigerLocuteurs(b.commande(), () => {})).toBe('a')
  expect(b.donnees()).toHaveLength(1)
  const actions = b.donnees()[0].actions
  expect(actions.filter((a) => a.action === 'update' && !a.file_path.startsWith('.sonal/')).map((a) => a.file_path)).toEqual(['corpus.crp', 'entretiens/A.json', 'entretiens/B.json'])
  expect(actions.find((a) => a.file_path === 'entretiens/C.json')?.action).toBe('chmod')
  expect(b.store.ouvrir().locuteurs.a.nom).toBe('Alice publiée')
  const lecture = b.store.lireEntretien('A'); expect(lecture.ok).toBe(true)
  if (!lecture.ok) throw new Error('Miroir absent')
  expect(lecture.data.participations[0].nom).toBe('Alice publiée')
  expect(lecture.data.corpsTexte).toEqual(b.fixture.entretiens[0].data.corpsTexte)
  expect(lecture.data.annotations).toEqual(b.fixture.entretiens[0].data.annotations)
  expect(b.store.lectureSeule).toBe(true)
})

test('réunion et suppression vide passent par le même commit complet sans copier les données locales', async () => {
  const b = banc()
  await b.transactions.corrigerLocuteurs({ type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Réunis', uniformiserNoms: false, attendu: b.fixture.attendu() }, () => {})
  expect(b.donnees()).toHaveLength(1)
  expect(b.store.ouvrir().locuteurs.b).toBeUndefined()
  const c = b.store.lireEntretien('C'); if (!c.ok) throw new Error('Source absente')
  expect(c.data.participations[0]).toEqual({ ...b.fixture.entretiens[2].data.participations[0], locuteurRef: 'a' })
  await b.transactions.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: 'vide', attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) }, () => {})
  expect(b.donnees()).toHaveLength(2); expect(b.store.ouvrir().locuteurs.vide).toBeUndefined()
})

test.each(['session locale', 'bail étranger', 'aperçu périmé', 'source invalide', 'source changée pendant la publication'] as const)('%s : pas de candidat installé ni de correction publiée', async (cas) => {
  const b = banc(), avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8'), commande = b.commande()
  const verifier = () => { if (cas === 'session locale') throw new Error('Fermez les entretiens') }
  if (cas === 'bail étranger') {
    const autre = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'poste-b', sessionId: 'session-b' }) })
    expect((await autre.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/A.json'))).ok).toBe(true)
  }
  if (cas === 'aperçu périmé') commande.attendu = '{}'
  if (cas === 'source invalide') b.depot.modifierHorsProtocole('entretiens/C.json', '{}')
  if (cas === 'source changée pendant la publication') b.depot.avantCommit = (actions) => {
    if (actions.some((a) => !a.file_path.startsWith('.sonal/'))) b.depot.modifierHorsProtocole('entretiens/C.json', JSON.stringify({ ...b.fixture.entretiens[2].data, lastModified: '2026-11-20T00:00:00.000Z' }))
  }
  await expect(b.transactions.corrigerLocuteurs(commande, verifier)).rejects.toThrow()
  expect(b.donnees()).toEqual([])
  expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant)
})

test('réponse perdue : publication journalisée, aucun miroir candidat et aucune nouvelle tentative aveugle', async () => {
  const b = banc(), avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
  b.depot.avantCommit = (actions) => {
    if (actions.some((a) => !a.file_path.startsWith('.sonal/'))) {
      b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
    }
  }
  await expect(b.transactions.corrigerLocuteurs(b.commande(), () => {})).rejects.toThrow('confirmée')
  expect(b.donnees()).toHaveLength(1)
  expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant)
  expect(b.transactions.transactionReconciliee()).toBe(false)
  await expect(b.transactions.corrigerLocuteurs(b.commande(), () => {})).rejects.toThrow('résultat connu')
  expect(b.donnees()).toHaveLength(1)
  b.depot.rendreCommits()
  await b.transactions.relireCorrectionsLocuteursDansFile()
  expect(b.transactions.transactionReconciliee()).toBe(true)
  expect(b.donnees()).toHaveLength(1)
})
