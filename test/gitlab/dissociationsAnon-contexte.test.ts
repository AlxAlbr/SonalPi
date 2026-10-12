import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { BailGitLab } from '../../src/main/gitlab/bailGitLab'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { ContexteGitLab, preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { RenommagesAnonGitLab } from '../../src/main/gitlab/renommagesAnon'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'
import { DepotMemoire } from './depotMemoire'
import type { EntretienFichier, CorpusFichier } from '../../src/shared/format'
const dossiers: string[] = [], portees = [...PORTEEES_OVERTES_GITLAB]
afterEach(() => { vi.restoreAllMocks(); PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees); dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })) })
function banc(recuperables: string[] = []) {
  const f = fixtureDissociationAnon()
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const dir = mkdtempSync(join(tmpdir(), 'dissociation-contexte-')); dossiers.push(dir); mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(f.corpus))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify(s.data))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire(); depot.charger(new Map([['racine/corpus.json', JSON.stringify(f.corpus)], ...f.sources.map((s) => [`racine/entretiens/${s.id}.json`, JSON.stringify(s.data)] as [string, string])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 's1' }) })
  const journal = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'destination', compteId: 'alice', projetId: 1, nomProjet: 'Projet', branche: 'main', racine: 'racine' }, store, depot, coordination, journal, publication, file: new FileOperationsContexte() }
  const transactions = new TransactionsGitLab(options)
  const session = { ouvrir: vi.fn(async () => ({ etat: 'edition', revision: 0, revisionPubliee: 0 })), fermer: vi.fn(async () => ({ fermee: true })) }
  const tirer = vi.fn(async (_proteges: string[]) => ({ telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString() }))
  const c = new ContexteGitLab('destination', store, { dirLocal: dir, tirer } as never, () => session as never, transactions, undefined, undefined,
    { client: new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }), branche: 'main', racine: 'racine', cheminsRecuperables: recuperables })
  const ouvrirPolitique = () => { if (!PORTEEES_OVERTES_GITLAB.includes('pseudonymisation-dissociation')) PORTEEES_OVERTES_GITLAB.push('pseudonymisation-dissociation') }
  const preparer = () => c.preparerDissociationAnon(f.demande)
  const appliquer = async () => { ouvrirPolitique(); return c.dissocierRegleAnon((await preparer()).token, true) }
  const lire = (id: string): EntretienFichier => JSON.parse(depot.fichiers.get(`racine/entretiens/${id}.json`)!.contenu)
  const corpus = (): CorpusFichier => JSON.parse(depot.fichiers.get('racine/corpus.json')!.contenu)
  return { ...f, dir, store, depot, coordination, journal, publication, options, transactions, c, session, tirer, ouvrirPolitique, preparer, appliquer, lire, corpus }
}
const commits = (b: ReturnType<typeof banc>) => b.depot.commits.filter((c) => c.message.startsWith('Sonal dissociation-'))

describe('assemblage protégé de dissociation GitLab et refus de politique', () => {
  test('la politique ferme la préparation et consomme aussi une tentative devenue interdite', async () => {
    const b = banc()
    PORTEEES_OVERTES_GITLAB.splice(PORTEEES_OVERTES_GITLAB.indexOf('pseudonymisation-dissociation'), 1)
    expect(() => b.preparer()).toThrow('pas disponible sur un corpus distant')
    b.ouvrirPolitique(); const a = await b.preparer()
    PORTEEES_OVERTES_GITLAB.splice(PORTEEES_OVERTES_GITLAB.indexOf('pseudonymisation-dissociation'), 1)
    await expect(b.c.dissocierRegleAnon(a.token, true)).rejects.toThrow()
    b.ouvrirPolitique(); await expect(b.c.dissocierRegleAnon(a.token, true)).rejects.toThrow('expiré')
    expect(commits(b)).toHaveLength(0)
  })
  test('session non ciblée conservée ; cible déjà ouverte différée puis reprise', async () => {
    const b = banc(); await b.c.ouvrirSessionEntretien('e2'); await b.c.ouvrirSessionEntretien('e3')
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    await expect(b.c.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de dissociation')
    expect(b.c.lireSuiviDissociationAnon()?.demande).toEqual({ regleId: 'personne' })
    await b.c.fermerEntretien('e2')
    const a = await b.c.preparerRepriseDissociationAnon(b.c.lireSuiviDissociationAnon()!.operationId)
    expect(await b.c.dissocierRegleAnon(a.token, true)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(b.session.fermer).toHaveBeenCalledTimes(1)
    await b.c.ouvrirSessionEntretien('e3'); expect(commits(b)).toHaveLength(4)
  })
  test('session récupérable exclue du transfert, du tirage et de toute nouvelle ouverture', async () => {
    const b = banc(['entretiens/e2.json']); expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    await b.c.actualiser()
    expect(b.tirer).toHaveBeenLastCalledWith(expect.arrayContaining(['entretiens/e2.json']))
    await expect(b.c.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de dissociation')
    expect(b.lire('e2').annotations[0].regle).toBe('personne')
  })
  test('ouverture engagée avant le transfert : elle reste comptée, jamais écrasée', async () => {
    const b = banc(); let resoudre!: (v: { etat: string; revision: number; revisionPubliee: number }) => void
    b.session.ouvrir.mockImplementationOnce(() => new Promise((r) => { resoudre = r }))
    const ouverture = b.c.ouvrirSessionEntretien('e2')
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    resoudre({ etat: 'edition', revision: 0, revisionPubliee: 0 }); await ouverture
    expect(b.lire('e2')).toEqual(b.sources[1].data)
  })
  test('travail réservé avant attente : ouverture cible et fermeture refusées, non-cible admise', async () => {
    const b = banc(); b.ouvrirPolitique(); const a = await b.preparer()
    let entrer!: () => void, relacher!: () => void
    const entree = new Promise<void>((r) => { entrer = r }), attente = new Promise<void>((r) => { relacher = r })
    const lire = b.depot.lireFichier.bind(b.depot)
    vi.spyOn(b.depot, 'lireFichier').mockImplementationOnce(async (...args) => { entrer(); await attente; return lire(...args) })
    const travail = b.c.dissocierRegleAnon(a.token, true); await entree
    await expect(b.c.ouvrirSessionEntretien('e1')).rejects.toThrow('cible de dissociation')
    await expect(b.c.fermer()).rejects.toThrow('fin de la dissociation')
    await b.c.ouvrirSessionEntretien('e3')
    expect(() => b.c.creerEntretienVide('Concurrent')).toThrow('dissociation')
    relacher(); expect(await travail).toMatchObject({ statut: 'termine' })
  })
  test('lot partiel exclut définitions, import, suppression et nouveau renommage dans ce contexte', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    expect(() => b.c.executerDefinitions('anon.creer-regle', () => {})).toThrow('dissociation')
    expect(() => b.c.creerEntretienVide('Concurrent')).toThrow('dissociation')
    expect(() => b.c.importerEntretien('Import', b.sources[2].data, [], [], [])).toThrow('dissociation')
    await expect(b.c.supprimerEntretien('e3')).rejects.toThrow('dissociation')
    expect(() => b.c.instantaneRenommageAnon()).toThrow('dissociation')
    await expect(b.c.importerCorrespondances({} as never)).rejects.toThrow('dissociation')
    expect(commits(b)).toHaveLength(2)
  })
  test('la barrière serveur ferme aussi les mutations sans journal local de dissociation', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    await expect(b.transactions.executerDefinitions((s) => s.regleAnonCreer(['Indépendante'], ['Neuve']))).rejects.toThrow('dissociation')
    const renommages = new RenommagesAnonGitLab(b.options, () => [])
    await expect(renommages.appliquer({ store: b.store, demande: { regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Neuve' }, empreinteCorpus: '', corpusAvant: b.corpus(), cibles: [] })).rejects.toThrow('dissociation')
    await expect(b.transactions.creerEntretienVide('Vide')).rejects.toThrow('dissociation')
    expect(commits(b)).toHaveLength(2)
  })
  test('publication courte indépendante permise ; publication portant les anciens liens refusée', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    await b.transactions.designerAudio('e3', 'audio/independant.ogg')
    expect(b.lire('e3').meta.audioDistant?.chemin).toBe('audio/independant.ogg')
    await expect(b.transactions.designerAudio('e2', 'audio/interdit.ogg')).rejects.toThrow('dissociation')
    expect(b.lire('e2').meta.audioDistant).toBeUndefined()
  })
  test('refus de consentement consomme le jeton du contexte', async () => {
    const b = banc(); b.ouvrirPolitique(); const a = await b.preparer()
    await expect(b.c.dissocierRegleAnon(a.token, false)).rejects.toThrow('Confirmez')
    await expect(b.c.dissocierRegleAnon(a.token, true)).rejects.toThrow('expiré')
    expect(commits(b)).toHaveLength(0)
  })
  test('contexte fermé efface les aperçus ; aucun travail ni ancien jeton publié', async () => {
    const b = banc(); b.ouvrirPolitique(); const a = await b.preparer(); await b.c.fermer()
    await expect(b.c.dissocierRegleAnon(a.token, true)).rejects.toThrow('indisponible')
    expect(commits(b)).toHaveLength(0)
  })
  test('miroir défaillant : acquis conservé, cible acquise non ouvrable, aucun tirage ni rejeu', async () => {
    const b = banc(); vi.spyOn(b.store, 'installerEntretienDistant').mockImplementation(() => { throw new Error('Disque') })
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    await expect(b.c.ouvrirSessionEntretien('e1')).rejects.toThrow('miroir')
    await expect(b.c.actualiser()).rejects.toThrow('miroir'); expect(b.tirer).not.toHaveBeenCalled()
    expect(commits(b)).toHaveLength(2)
  })
  test.each(['entretien', 'retrait'])('issue inconnue de %s : Actualiser réconcilie dans la même file sans deadlock ni rejeu', async (phase) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => phase === 'entretien' ? a.file_path.endsWith('/e1.json') : a.file_path.endsWith('/corpus.json') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await b.appliquer(); expect(r.statut).toBe('indetermine')
    await expect(b.c.actualiser()).rejects.toThrow('indéterminée'); expect(b.tirer).not.toHaveBeenCalled()
    await b.c.ouvrirSessionEntretien('e3')
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    await b.c.actualiser(); expect(b.tirer).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).annotations[0].regle).toBeUndefined()
    if (phase === 'retrait') expect(b.store.ouvrir().reglesAnon.personne).toBeUndefined()
    expect(b.journal.lister()).toEqual([])
    expect(commits(b)).toHaveLength(phase === 'entretien' ? 2 : 4)
    if (phase === 'retrait') expect(b.c.lireSuiviDissociationAnon()).toBeNull()
    else expect(b.tirer).toHaveBeenCalledWith(expect.arrayContaining(['entretiens/e2.json']))
  })
  test('reconnaissance acquise mais installation défaillante : ouverture suspendue, pas de rejeu', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/e1.json'))) { b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles() }
    }
    const r = await b.appliquer(); expect(r.statut).toBe('indetermine')
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    vi.spyOn(b.store, 'installerEntretienDistant').mockImplementationOnce(() => { throw new Error('Disque') })
    await expect(b.c.relireSuiviDissociationAnon(r.operationId)).rejects.toThrow('miroir')
    await expect(b.c.ouvrirSessionEntretien('e1')).rejects.toThrow('miroir')
    expect(b.c.lireSuiviDissociationAnon()?.annotations).toBe(4)
    expect(commits(b)).toHaveLength(2)
  })
  test('journal corrompu à la réouverture : pas de tirage ni d’appel réseau', async () => {
    const b = banc(); writeFileSync(join(b.dir, '.dissociation-anon-gitlab.json'), '{invalide')
    const transport = vi.fn()
    const client = new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }, transport)
    await expect(preparerContexteGitLabLectureSeule({ id: 'destination', dirLocal: b.dir, branche: 'main', racine: 'racine', client })).rejects.toThrow('journal de dissociation')
    expect(transport).not.toHaveBeenCalled()
  })
  test('les copies et l’intention restent privées : le suivi ne contient aucun document natif', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    const suivi = b.c.lireSuiviDissociationAnon()!
    expect(JSON.stringify(suivi)).not.toContain('corpsTexte'); expect(JSON.stringify(suivi)).not.toContain('definitionsAnonLocales')
    const journal = JSON.parse(readFileSync(join(b.dir, '.dissociation-anon-gitlab.json'), 'utf8'))
    expect(journal.cibles[0].apres.definitionsAnonLocales.at(-1).pseudos).toEqual(['Claire', 'Rebecca'])
  })
})
