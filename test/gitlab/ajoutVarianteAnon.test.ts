import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import { BailGitLab, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { normaliserBaseCorpus } from '../../src/main/gitlab/preparationDefinitions'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { DepotMemoire } from './depotMemoire'

const dossiers: string[] = []
afterEach(() => { dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); vi.restoreAllMocks() })
function banc() {
  const f = fixtureRenommageAnon(); f.corpus.reglesAnon.personne.pseudos = ['Claire']
  const dir = mkdtempSync(join(tmpdir(), 'sonal-ajout-variante-gitlab-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens')); writeFileSync(join(dir, 'corpus.json'), JSON.stringify({ ...f.corpus, nom: 'Miroir périmé' }))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify(s.data))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire(); depot.charger(new Map([
    ['racine/corpus.json', JSON.stringify(f.corpus)], ...f.sources.map((s) => [`racine/entretiens/${s.id}.json`, JSON.stringify(s.data)] as [string, string]),
  ]))
  const journal = new JournalPublicationGitLab('destination', join(dir, 'suivi'))
  const creerCoordination = () => new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'max', machineId: 'poste', sessionId: 'session' }) })
  const coordination = creerCoordination(), file = new FileOperationsContexte()
  const transactions = new TransactionsGitLab({ destination: { fournisseur: 'gitlab', id: 'destination', compteId: 'max', projetId: 42, nomProjet: 'Fixture', branche: 'main', racine: 'racine' },
    store, depot, coordination, file, journal, publication: new PublieurGitLab({ branche: 'main', depot, coordination, journal }) })
  const tirer = vi.fn(async () => {
    store.appliquerTransactionFichiers({ operation: 'remplacement', id: 'tirage-fixture', corpusAvant: store.ouvrir(), corpusApres: JSON.parse(depot.fichiers.get('racine/corpus.json')!.contenu), entretiens: [] })
    return { telecharges: ['corpus.json'], corbeille: [], inaccessibles: [], date: new Date().toISOString() }
  })
  const session = { ouvrir: vi.fn(async () => ({ etat: 'edition' })), fermer: vi.fn(async () => ({ fermee: true })) }
  const c = new ContexteGitLab('destination', store, { dirLocal: dir, tirer } as never, () => session as never, transactions)
  const demande = { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudo: 'Rebecca' }
  const ajouter = (d = demande) => c.executerDefinitions('anon.ajouter-variante', (s) => s.regleAnonAjouterVariante(d))
  const corpus = () => JSON.parse(depot.fichiers.get('racine/corpus.json')!.contenu)
  const locaux = () => f.sources.map((s) => readFileSync(join(dir, 'entretiens', `${s.id}.json`), 'utf8'))
  const sources = () => [...depot.fichiers].filter(([p]) => p.startsWith('racine/entretiens/'))
  const commits = () => depot.commits.filter((p) => p.message.startsWith('Sonal ajout-variante-'))
  const bail = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'racine/corpus.json'))
  const perdre = (accepte = true) => {
    depot.avantCommit = (actions) => {
      if (!actions.some((a) => a.file_path === 'racine/corpus.json')) return
      depot.avantCommit = () => {}
      if (accepte) { depot.rendreCommitsIllisibles(); depot.echouerApresAccepter(new Error('Réponse perdue')) }
      else throw new Error('Transport incertain avant réponse')
    }
  }
  return { f, dir, c, store, depot, journal, coordination, creerCoordination, transactions, demande, ajouter, corpus, locaux, sources, commits, bail, tirer, session, perdre }
}

test('définition serveur, corpus seul, aucune lecture/garde de source ni verrou entretien', async () => {
  const b = banc(), avant = b.sources(), locaux = b.locaux()
  const resultat = await b.ajouter()
  expect(resultat.valeur).toMatchObject({ ajoute: true, regle: { pseudos: ['Claire', 'Rebecca'] } })
  const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
  expect(b.corpus()).toEqual(attendu); expect(b.store.ouvrir()).toEqual(normaliserBaseCorpus(attendu))
  expect(b.sources()).toEqual(avant); expect(b.locaux()).toEqual(locaux)
  expect([...b.depot.lectures.keys()].some((p) => p.includes('/entretiens/'))).toBe(false)
  expect(b.commits()).toHaveLength(1)
  expect(b.commits()[0].actions.map((a) => a.file_path)).toEqual(['racine/corpus.json', b.bail])
  expect(b.depot.fichiers.has(b.bail)).toBe(false); expect(b.journal.lister()).toEqual([])
})
test('session indépendante ouverte conservée, aucun enregistrement ni fermeture automatique', async () => {
  const b = banc(); await b.c.ouvrirSessionEntretien('e1')
  await b.ajouter(); expect(b.session.fermer).not.toHaveBeenCalled()
  await b.c.fermer(); expect(b.session.fermer).toHaveBeenCalledOnce()
})
test.each(['pseudos', 'categorie', 'entite', 'absente'])('définition modifiée depuis la saisie : refus frais, %s', async (champ) => {
  const b = banc(), avantLocal = b.store.ouvrir(), nouveau = structuredClone(b.f.corpus)
  if (champ === 'absente') delete nouveau.reglesAnon.personne
  else if (champ === 'categorie') nouveau.reglesAnon.personne.categorie = 'Autre'
  else nouveau.reglesAnon.personne[champ as 'pseudos' | 'entite'] = ['Autre']
  b.depot.modifierHorsProtocole('racine/corpus.json', JSON.stringify(nouveau))
  await expect(b.ajouter()).rejects.toThrow(/changé|n’existe plus/)
  expect(b.corpus()).toEqual(nouveau); expect(b.store.ouvrir()).toEqual(avantLocal); expect(b.commits()).toEqual([])
})
test('doublon frais : aucun commit de données ; miroir actualisé seulement', async () => {
  const b = banc(); b.demande.pseudo = ' claire '
  expect((await b.ajouter()).valeur.ajoute).toBe(false); expect(b.commits()).toEqual([])
  expect(b.store.ouvrir()).toEqual(normaliserBaseCorpus(b.f.corpus))
})
test.each(['alias', 'troisieme', 'suppression', 'dissociation'])('limites et opérations incompatibles : %s', async (cas) => {
  const b = banc(), corpus = structuredClone(b.f.corpus)
  if (cas === 'alias') corpus.reglesAnon.personne.entite.push('Karin')
  if (cas === 'troisieme') { corpus.reglesAnon.personne.pseudos.push('Marie'); b.demande.pseudo = 'Autre' }
  if (cas === 'suppression') corpus.suppressionAnon = { operationId: 'suppression-anon-test', regleId: 'personne' }
  if (cas === 'dissociation') corpus.dissociationAnon = { operationId: 'dissociation-test', regleId: 'personne' }
  b.demande.regleAvant = structuredClone(corpus.reglesAnon.personne)
  b.depot.modifierHorsProtocole('racine/corpus.json', JSON.stringify(corpus))
  await expect(b.ajouter()).rejects.toThrow(); expect(b.commits()).toEqual([]); expect(b.corpus()).toEqual(corpus)
})
test('corpus tenu : refus ; bail entretien tenu : ajout autorisé sans toucher ce bail', async () => {
  const b = banc(), bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 'autre' }) })
  const tenu = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/corpus.json')); if (!tenu.ok) throw new Error('Fixture')
  const garde = b.depot.fichiers.get(b.bail)
  await expect(b.ajouter()).rejects.toThrow('modification'); expect(b.depot.fichiers.get(b.bail)).toEqual(garde)
  await bob.liberer(tenu.droit)
  const entretien = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e1.json')); if (!entretien.ok) throw new Error('Fixture')
  const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'racine/entretiens/e1.json')), droit = b.depot.fichiers.get(chemin)
  await b.ajouter(); expect(b.depot.fichiers.get(chemin)).toEqual(droit)
  await bob.liberer(entretien.droit)
})
test('course juste avant publication : garde perdue, édition concurrente conservée', async () => {
  const b = banc(), concurrent = structuredClone(b.f.corpus); concurrent.nom = 'Édition indépendante'
  b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/corpus.json')) b.depot.modifierHorsProtocole('racine/corpus.json', JSON.stringify(concurrent)) }
  await expect(b.ajouter()).rejects.toThrow('changé pendant'); expect(b.corpus()).toEqual(concurrent); expect(b.commits()).toEqual([])
})
test('réponse perdue : Actualiser reconnaît sans deuxième commit et rend uniquement son droit acquis', async () => {
  const b = banc(); b.perdre()
  await expect(b.ajouter()).rejects.toThrow('confirmée'); expect(b.journal.lister()).toHaveLength(1)
  await expect(b.c.actualiser()).rejects.toThrow('vérifié'); expect(b.tirer).not.toHaveBeenCalled()
  await expect(b.ajouter()).rejects.toThrow('résultat connu'); expect(b.commits()).toHaveLength(1)
  b.depot.rendreCommits(); await b.c.actualiser()
  expect(b.commits()).toHaveLength(1); expect(b.journal.lister()).toEqual([])
  expect(b.depot.fichiers.has(b.bail)).toBe(false); expect(b.store.ouvrir()).toEqual(normaliserBaseCorpus(b.corpus()))
})
test('nouvelle instance : preuve acceptée sans héritage ni libération du bail persistant', async () => {
  const b = banc(); b.perdre(); await expect(b.ajouter()).rejects.toThrow('confirmée')
  const droit = structuredClone(b.depot.fichiers.get(b.bail)), avant = b.sources()
  b.depot.rendreCommits()
  await reprendreOperationsGitLab({ depot: b.depot, coordination: b.creerCoordination(), journal: b.journal, dirMiroir: b.dir })
  expect(b.journal.lister()).toEqual([]); expect(b.depot.fichiers.get(b.bail)).toEqual(droit)
  expect(b.sources()).toEqual(avant); expect(b.commits()).toHaveLength(1)
  await expect(b.ajouter()).rejects.toThrow('retenu'); expect(b.depot.fichiers.get(b.bail)).toEqual(droit)
})
test('historique sans commit : original insuffisant, journal et bail conservés, aucun nouvel envoi', async () => {
  const b = banc(); b.perdre(false); await expect(b.ajouter()).rejects.toThrow('confirmée')
  const droit = structuredClone(b.depot.fichiers.get(b.bail))
  await expect(b.c.actualiser()).rejects.toThrow('vérifié')
  await expect(reprendreOperationsGitLab({ depot: b.depot, coordination: b.creerCoordination(), journal: b.journal, dirMiroir: b.dir })).rejects.toThrow('indéterminé')
  expect(b.journal.lister()).toHaveLength(1); expect(b.depot.fichiers.get(b.bail)).toEqual(droit)
  expect(b.corpus()).toEqual(b.f.corpus); expect(b.commits()).toEqual([])
})
test('même compte et génération mais autre propriétaire : droit non rendu', async () => {
  const b = banc(); b.perdre(); await expect(b.ajouter()).rejects.toThrow('confirmée')
  const courant = JSON.parse(b.depot.fichiers.get(b.bail)!.contenu); courant.holder.sessionId = 'autre-processus'
  b.depot.modifierHorsProtocole(b.bail, JSON.stringify(courant))
  const garde = structuredClone(b.depot.fichiers.get(b.bail))
  expect(await b.coordination.rendreBailAcquis(b.bail, courant.generation)).toBe('autre')
  expect(b.depot.fichiers.get(b.bail)).toEqual(garde)
})
test('format distant rétrogradé : aucune migration ni publication implicite', async () => {
  const b = banc(), corpus = structuredClone(b.f.corpus); corpus.formatVersion = 7
  b.depot.modifierHorsProtocole('racine/corpus.json', JSON.stringify(corpus))
  await expect(b.ajouter()).rejects.toThrow('version du corpus'); expect(b.corpus()).toEqual(corpus); expect(b.commits()).toEqual([])
})

test('fermeture déjà engagée dans la file : ajout tardif refusé avant tout droit', async () => {
  const b = banc(); const fermeture = b.c.fermer(); const ajout = b.ajouter()
  await fermeture; await expect(ajout).rejects.toThrow('fermé'); expect(b.depot.commits).toEqual([])
})
