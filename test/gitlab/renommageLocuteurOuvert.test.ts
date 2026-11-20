import { afterEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { JournalSessionsGitLab } from '../../src/main/gitlab/journalSession'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import type { MiroirDistant } from '../../src/main/distant/miroir'
import type { ConfigDestinationGitLab } from '../../src/main/distant/coffre'
import type { EntretienFichier } from '../../src/shared/format'
import type { InventaireIdentitesLocuteurs } from '../../src/shared/corpus/personnes'
import { verifierRelectureRenommage } from '../../src/shared/entretien/renommageGlobal'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'
import { DepotMemoire } from './depotMemoire'

const dossiers: string[] = []
afterEach(() => { for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
const reference = { entretienId: 'A', participationId: 'local' }
const commande = (inventaire: InventaireIdentitesLocuteurs) => ({ type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice renommée', attendu: JSON.stringify(inventaire) })

function banc(sansAssociation = false) {
  const f = fixtureLocuteursDistants()
  if (sansAssociation) f.entretiens[0].data.participations[0].locuteurRef = null
  const dir = mkdtempSync(join(tmpdir(), 'sonal-nom-ouvert-gitlab-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens')); mkdirSync(join(dir, 'journal'))
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(f.corpus, null, 2))
  for (const s of f.sources()) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), s.contenu)
  const store = new CorpusStore(dir); store.lectureSeule = true
  const destination: ConfigDestinationGitLab = { fournisseur: 'gitlab', id: 'destination', compteId: 'compte', projetId: 42, nomProjet: 'Test', branche: 'main', racine: '' }
  const depot = new DepotMemoire()
  depot.charger(new Map([['corpus.crp', JSON.stringify(f.corpus)], ...f.sources().map((s): [string, string] => [`entretiens/${s.id}.json`, s.contenu])]))
  const identite = () => ({ userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' })
  const coordination = new BailGitLab({ branche: 'main', depot, identite })
  const journal = new JournalPublicationGitLab(destination.id, join(dir, 'journal'))
  const journalSessions = new JournalSessionsGitLab(destination.id, join(dir, 'journal'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const transactions = new TransactionsGitLab({ destination, store, depot, coordination, journal, publication, file: new FileOperationsContexte() })
  const sessions = new Map<string, SessionGitLab>()
  const creerSession = (ressource: string, cheminRelatif: string) => {
    const propre = new BailGitLab({ branche: 'main', depot, identite })
    const session = new SessionGitLab({ id: destination.id, ressource, ressourcePartagee: cleRessourceBailGitLab('main', cheminRelatif), cheminRelatif, cheminDistant: cheminRelatif,
      branche: 'main', depot, coordination: propre, journal, journalSessions, reconciliateur: new ReconciliateurPublicationGitLab(depot, journal),
      publication: new PublieurGitLab({ branche: 'main', depot, coordination: propre, journal, attendre: async () => {} }),
      stockageLocal: new StockageLocalEntretienGitLab(dir, cheminRelatif) })
    sessions.set(cheminRelatif, session); return session
  }
  const miroir = { dirLocal: dir, tirer: async () => ({ telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString() }) } as unknown as MiroirDistant
  const contexte = new ContexteGitLab(destination.id, store, miroir, creerSession, transactions)
  const donnees = () => depot.commits.filter((c) => c.actions.some((a) => !a.file_path.startsWith('.sonal/')))
  const lire = (id: string) => { const r = store.lireEntretien(id); if (!r.ok) throw new Error('Source absente'); return r.data }
  const sauvegarder = async (data: EntretienFichier) => { store.ecrireEntretien('A', data); await contexte.marquerSessionSale(contexte.ressourceEntretien('A')) }
  return { f, dir, store, depot, coordination, journal, journalSessions, transactions, sessions, creerSession, contexte, donnees, lire, sauvegarder }
}

test('créer au nommage laisse les autres éditions ouvertes, garde les droits courants et reste idempotent', async () => {
  const b = banc(true); await b.contexte.ouvrirEntretienPourEdition('A'); await b.contexte.ouvrirEntretienPourEdition('C')
  const autre = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'poste-b', sessionId: 'bob' }) })
  const tenue = await autre.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/B.json')); expect(tenue.ok).toBe(true)
  const avant = b.lire('A'), lecturesB = b.depot.lectures.get('entretiens/B.json') ?? 0
  const session = b.sessions.get('entretiens/A.json')!, droit = session.droit()!, generation = b.coordination.snapshot(droit).generation
  const apres = await b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' }), id = apres.participations[0].locuteurRef!
  expect(id).toBeTruthy(); expect(id).not.toBe('a')
  expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], locuteurRef: id }] })
  expect(b.depot.lectures.get('entretiens/B.json') ?? 0).toBe(lecturesB)
  expect(b.donnees()).toHaveLength(1)
  expect(b.coordination.snapshot(droit).generation).toBe(generation)
  expect(b.sessions.get('entretiens/C.json')!.etat().etat).toBe('edition')
  const encore = await b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })
  expect(encore.participations[0].locuteurRef).toBe(id); expect(b.donnees()).toHaveLength(1)
  expect(() => b.store.ecrireEntretien('A', avant)).toThrow('associations des locuteurs ont changé')
  await b.contexte.fermerEntretien('A'); await b.contexte.fermerEntretien('C')
  if (tenue.ok) await autre.liberer(tenue.droit)
})

test.each(['retrait', 'nom différent', 'vide', 'champ inconnu'] as const)('nommage %s : refus avant publication des saisies', async (cas) => {
  const b = banc(true); await b.contexte.ouvrirEntretienPourEdition('A')
  if (cas === 'retrait') { const data = b.lire('A'); data.participations[0].associationRetiree = true; await b.sauvegarder(data) }
  await expect(b.contexte.identifierParticipationAuNommage({ ...reference, nom: cas === 'vide' ? '' : cas === 'nom différent' ? 'Autre' : 'Alice A', ...(cas === 'champ inconnu' ? { locuteurRef: 'a' } : {}) })).rejects.toThrow()
  expect(b.donnees()).toHaveLength(0)
})

test('rapprochement en session : une seule publication complète, source conservée, données copiées seulement sur demande', async () => {
  const b = banc(true); await b.contexte.ouvrirEntretienPourEdition('A')
  await b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })
  const avant = b.lire('A'), inventaire = await b.contexte.inventaireLocuteursDepuisEntretien(reference)
  const independant = avant.participations[0].locuteurRef!, droit = b.sessions.get('entretiens/A.json')!.droit()
  const apres = await b.contexte.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire), reprise: { pseudo: true, interviewer: true, variables: [], remplacer: true } })
  expect(b.donnees()).toHaveLength(2)
  expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], locuteurRef: 'b', pseudo: 'Pseudo C', pseudoEtat: 'confirme', interviewer: false }] })
  expect(b.store.ouvrir().locuteurs[independant]).toBeUndefined(); expect(b.store.ouvrir().locuteurs.b).toBeDefined()
  expect(b.sessions.get('entretiens/A.json')!.droit()).toBe(droit)
  const suite = b.lire('A'); suite.notes![0].corps = 'Après réunion'
  await b.sauvegarder(suite); expect(await b.contexte.publierEntretien('A')).toEqual({ ok: true })
  expect(JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu).notes[0].corps).toBe('Après réunion')
  await b.contexte.fermerEntretien('A')
})

test('réponse de création inconnue : le candidat enregistré est reconnu sans créer une deuxième identité', async () => {
  const b = banc(true); await b.contexte.ouvrirEntretienPourEdition('A')
  b.depot.avantCommit = (actions) => {
    if (actions.some((a) => a.file_path === 'entretiens/A.json')) { b.depot.echouerApresAccepter(new Error('Coupure')); b.depot.rendreCommitsIllisibles() }
  }
  await expect(b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
  expect(b.donnees()).toHaveLength(1)
  const id = JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu).participations[0].locuteurRef
  await expect(b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
  b.depot.avantCommit = () => {}; b.depot.rendreCommits()
  await expect(b.contexte.fermerEntretien('A')).resolves.toEqual({ fermee: true })
  await b.contexte.ouvrirEntretienPourEdition('A')
  expect((await b.contexte.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).participations[0].locuteurRef).toBe(id)
  expect(b.donnees()).toHaveLength(1)
  expect(Object.keys(JSON.parse((await b.depot.lireFichier('corpus.crp'))!.contenu).locuteurs)).toHaveLength(4)
  await b.contexte.fermerEntretien('A')
})

test('aperçu frais avec saisies locales : aucun envoi, puis droit conservé et nouvelle base pour les sauvegardes suivantes', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const courant = b.lire('A'); courant.participations[0].pseudo = 'Pseudo saisi'; courant.notes![0].corps = 'Note récente'
  courant.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Dernières paroles.' }] }] }
  await b.sauvegarder(courant)
  const avant = b.lire('A'), session = b.sessions.get('entretiens/A.json')!, droit = session.droit()!, bailAvant = b.coordination.snapshot(droit)
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  expect(inventaire.participations.find((p) => p.entretienId === 'A')?.pseudo).toBe('Pseudo saisi')
  expect(inventaire.notes.find((n) => n.entretienId === 'A')?.corps).toBe('Note récente')
  expect(b.donnees()).toHaveLength(0)
  const apres = await b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))
  expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], nom: 'Alice renommée' }] })
  expect(b.donnees()).toHaveLength(2)
  expect(b.coordination.snapshot(droit).generation).toBe(bailAvant.generation)
  expect(session.droit()).toBe(droit)
  expect(session.etat()).toMatchObject({ etat: 'edition', revision: 1, revisionPubliee: 1 })
  expect(b.journalSessions.lire(b.contexte.ressourceEntretien('A'))?.correctionLocuteurs).toBeUndefined()
  expect(() => b.store.ecrireEntretien('A', avant)).toThrow('Les noms ont changé')
  const suite = b.lire('A'); suite.corpsTexte = { type: 'doc', content: [] }
  await b.sauvegarder(suite)
  expect(await b.contexte.publierEntretien('A')).toEqual({ ok: true })
  expect(JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu).participations[0].nom).toBe('Alice renommée')
  expect(b.lire('B').participations[0].nom).toBe('Alice renommée')
  expect(b.lire('C')).toEqual(b.f.entretiens[2].data)
  await b.contexte.fermerEntretien('A')
})

test.each(['bob', 'alice'])('le compte %s sur un autre poste garde son édition ; notre session n’est ni rendue ni remplacée', async (userId) => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const autre = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId, machineId: 'poste-b', sessionId: 'session-b' }) })
  const acquisition = await autre.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/B.json'))
  expect(acquisition.ok).toBe(true)
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference), session = b.sessions.get('entretiens/A.json')!, droit = session.droit()
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow(/en cours de modification|est retenu/)
  expect(session.droit()).toBe(droit); expect(session.etat().etat).toBe('edition'); expect(b.donnees()).toHaveLength(0)
  if (acquisition.ok) await autre.liberer(acquisition.droit)
  await b.contexte.fermerEntretien('A')
})

test('un suivi impossible à enregistrer suspend l’édition sans publier le renommage', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  b.journalSessions.preparerCorrectionLocuteurs = () => { throw new Error('Suivi indisponible') }
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow('Suivi indisponible')
  expect(b.donnees()).toHaveLength(0)
  expect(b.sessions.get('entretiens/A.json')!.etat().etat).toBe('degrade')
  expect(() => b.store.ecrireEntretien('A', b.lire('A'))).toThrow('verrou')
})

test('sans suivi durable de session, aucune publication même si notre droit reste tenu', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  b.journalSessions.supprimer(b.contexte.ressourceEntretien('A'))
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow('suivi de cet entretien est indisponible')
  expect(b.donnees()).toHaveLength(0)
})

test('une autre édition locale ou une référence forgée refuse aussi les appels directs', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A'); await b.contexte.ouvrirEntretienPourEdition('C')
  await expect(b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)).rejects.toThrow('autres entretiens')
  await b.contexte.fermerEntretien('C')
  await expect(b.contexte.apercuRenommageLocuteurDepuisEntretien({ ...reference, inconnu: true } as typeof reference)).rejects.toThrow('Rouvrez')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, { ...commande(inventaire), locuteurId: 'b' })).rejects.toThrow('association a changé')
  expect(b.donnees()).toHaveLength(0); await b.contexte.fermerEntretien('A')
})

test('un aperçu périmé ne renomme aucun entretien et conserve la modification extérieure', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  const modifie = structuredClone(b.f.entretiens[1].data); modifie.participations[0].pseudo = 'Autre poste'
  b.depot.modifierHorsProtocole('entretiens/B.json', JSON.stringify(modifie))
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow('ont changé')
  expect(b.donnees()).toHaveLength(0)
  expect(JSON.parse((await b.depot.lireFichier('entretiens/B.json'))!.contenu).participations[0].pseudo).toBe('Autre poste')
  await b.contexte.fermerEntretien('A')
})

test('réponse inconnue : copie conservée, fermeture après reconnaissance sans rejouer, puis réouverture sur les noms publiés', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference), avant = b.lire('A')
  b.depot.avantCommit = (actions) => {
    if (actions.some((a) => a.file_path === 'entretiens/B.json')) { b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles() }
  }
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow('confirmée')
  expect(b.donnees()).toHaveLength(1)
  expect(b.sessions.get('entretiens/A.json')!.etat()).toMatchObject({ etat: 'degrade' })
  expect(b.journalSessions.lire(b.contexte.ressourceEntretien('A'))?.correctionLocuteurs).toBeDefined()
  expect(b.lire('A')).toEqual(avant)
  expect(() => b.store.ecrireEntretien('A', avant)).toThrow('verrou')
  await expect(b.contexte.fermerEntretien('A')).resolves.toMatchObject({ fermee: false })
  b.depot.avantCommit = () => {}; b.depot.rendreCommits()
  await expect(b.contexte.fermerEntretien('A')).resolves.toEqual({ fermee: true })
  expect(b.journal.lister()).toHaveLength(0); expect(b.donnees()).toHaveLength(1)
  const r = await b.contexte.ouvrirEntretienPourEdition('A')
  expect(r.ok && r.acces).toBe('edition')
  expect(r.ok && r.data.participations[0].nom).toBe('Alice renommée')
  await b.contexte.fermerEntretien('A')
})

test('une intention conservée avant tout envoi se clôture sans publier son candidat', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const session = b.sessions.get('entretiens/A.json')!, apres = b.lire('A')
  apres.participations[0].nom = 'Jamais envoyé'
  await expect(session.corrigerLocuteurs((avant, apres) => verifierRelectureRenommage(avant, apres, 'a'), async (courant) => {
    courant.preparer('locuteurs-arret-avant-envoi', JSON.stringify(apres)); throw new Error('Arrêt avant envoi')
  })).rejects.toThrow('Arrêt avant envoi')
  await expect(b.contexte.fermerEntretien('A')).resolves.toEqual({ fermee: true })
  expect(b.donnees()).toHaveLength(0)
  expect(JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu).participations[0].nom).toBe('Alice A')
})

test('une modification extérieure après une réponse perdue interdit de restaurer le candidat ancien', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  b.depot.avantCommit = (actions) => {
    if (actions.some((a) => a.file_path === 'entretiens/B.json')) { b.depot.echouerApresAccepter(new Error('Coupure')); b.depot.rendreCommitsIllisibles() }
  }
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow()
  b.depot.avantCommit = () => {}; b.depot.rendreCommits()
  const externe = JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu)
  externe.participations[0].pseudo = 'Changement extérieur'
  b.depot.modifierHorsProtocole('entretiens/A.json', JSON.stringify(externe))
  await expect(b.contexte.fermerEntretien('A')).resolves.toMatchObject({ fermee: false })
  expect(JSON.parse((await b.depot.lireFichier('entretiens/A.json'))!.contenu).participations[0].pseudo).toBe('Changement extérieur')
  expect(b.journalSessions.lire(b.contexte.ressourceEntretien('A'))?.correctionLocuteurs).toBeDefined()
  expect(b.donnees()).toHaveLength(1)
})

test('un arrêt après confirmation serveur se reconnaît au redémarrage sans restaurer le candidat ancien', async () => {
  const b = banc(); await b.contexte.ouvrirEntretienPourEdition('A')
  const inventaire = await b.contexte.apercuRenommageLocuteurDepuisEntretien(reference)
  b.depot.avantCommit = (actions) => {
    if (actions.some((a) => a.file_path === 'entretiens/B.json')) { b.depot.echouerApresAccepter(new Error('Coupure')); b.depot.rendreCommitsIllisibles() }
  }
  await expect(b.contexte.renommerLocuteurDepuisEntretien(reference, commande(inventaire))).rejects.toThrow()
  b.depot.avantCommit = () => {}; b.depot.rendreCommits()
  await b.transactions.relireCorrectionsLocuteursDansFile()
  const nouvelle = b.creerSession(b.contexte.ressourceEntretien('A'), 'entretiens/A.json')
  expect((await nouvelle.ouvrir()).etat).toBe('edition')
  expect(b.lire('A').participations[0].nom).toBe('Alice renommée')
  expect(readFileSync(join(b.dir, 'entretiens/A.json'), 'utf8')).toBe((await b.depot.lireFichier('entretiens/A.json'))!.contenu)
  expect(b.donnees()).toHaveLength(1)
  await nouvelle.fermer()
})
