import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { RenommagesAnon } from '../../src/main/renommagesAnon'
import { RenommagesAnonGitLab } from '../../src/main/gitlab/renommagesAnon'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { verifierContenusReferencesDefinitions } from '../../src/main/gitlab/referencesDefinitions'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { DepotMemoire } from './depotMemoire'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
const dossiers: string[] = [], portees = [...PORTEEES_OVERTES_GITLAB]
afterEach(() => { vi.restoreAllMocks(); PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees); for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc(nombre = 3) {
  const f = fixtureRenommageAnon(Array.from({ length: nombre }, (_, i) => `e${i + 1}`))
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  f.sources.slice(2).forEach((s) => { s.data.annotations = [] })
  const dir = mkdtempSync(join(tmpdir(), 'renommage-cible-gitlab-')); dossiers.push(dir); mkdirSync(join(dir, 'entretiens'))
  const miroir = structuredClone(f.corpus); miroir.reglesAnon.personne.pseudos = ['Miroir périmé', 'Rebecca']
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(miroir))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify({ ...s.data, lastModified: 'miroir-périmé' }))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire()
  depot.charger(new Map([['racine/corpus.crp', JSON.stringify(f.corpus)], ...f.sources.map((s) => [`racine/entretiens/${s.id}.json`, JSON.stringify(s.data)] as [string, string])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 's1' }) })
  const journal = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const file = new FileOperationsContexte()
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'destination', compteId: 'alice', projetId: 1, nomProjet: 'Projet', branche: 'main', racine: 'racine' }, store, depot, coordination, journal, publication, file, nouvelleOperation: () => 'renommage-test' }
  const sessions: string[] = []
  const service = new RenommagesAnonGitLab(options, () => sessions)
  const cache = new RenommagesAnon({ store: () => store, local: () => false })
  const preparer = async (demande = f.demande) => {
    const apercu = cache.preparerGitLab(demande, await service.instantane(), service.disponible(), service)
    return { apercu, preparation: cache.consommerGitLab(apercu.token, true, service) }
  }
  const reprise = async (s = service) => {
    const r = await s.preparerReprise(s.lireSuivi()!.operationId)
    const apercu = cache.preparerGitLab(r.demande, r.instantane, true, s, r)
    return { apercu, preparation: cache.consommerGitLab(apercu.token, true, s) }
  }
  const lire = (id: string): EntretienFichier => JSON.parse(depot.fichiers.get(`racine/entretiens/${id}.json`)!.contenu)
  const changer = (id: string, modifier: (e: EntretienFichier) => void) => { const e = lire(id); modifier(e); depot.modifierHorsProtocole(`racine/entretiens/${id}.json`, JSON.stringify(e)) }
  return { ...f, dir, store, depot, coordination, journal, publication, file, options, service, cache, sessions, preparer, reprise, lire, changer }
}
const donnees = (b: ReturnType<typeof banc>) => b.depot.commits.filter((c) => c.message.startsWith('Sonal renommage-test-'))
function contexte(b: ReturnType<typeof banc>, recuperables: string[] = []) {
  PORTEEES_OVERTES_GITLAB.push('pseudonymisation-globale')
  const ouvrir = vi.fn(() => ({ ouvrir: async () => ({ etat: 'lecture-seule' }) }))
  const c = new ContexteGitLab('destination', b.store, { dirLocal: b.dir } as never, ouvrir as never, new TransactionsGitLab(b.options), undefined, undefined,
    { client: new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }), branche: 'main', racine: 'racine', cheminsRecuperables: recuperables })
  return { c, ouvrir }
}
function sessionDistante(b: ReturnType<typeof banc>, id: string) {
  const bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: `s-${id}` }) })
  const pub = new PublieurGitLab({ branche: 'main', depot: b.depot, coordination: bob, attendre: async () => {} })
  let contenu = ''
  const session = new SessionGitLab({ id, ressource: id, ressourcePartagee: cleRessourceBailGitLab('main', `racine/entretiens/${id}.json`),
    cheminRelatif: `entretiens/${id}.json`, cheminDistant: `racine/entretiens/${id}.json`, branche: 'main', depot: b.depot, coordination: bob, publication: pub,
    stockageLocal: { lire: async () => contenu, ecrire: async (s) => { contenu = s } },
    preparerGardeDefinitions: async (candidat, avant) => {
      const cp = (await b.depot.lireFichier('racine/corpus.crp', 'main'))!
      verifierContenusReferencesDefinitions(candidat, cp.contenu, avant)
      return { action: 'garde', chemin: cp.chemin, commitId: cp.commitId, executable: cp.executable }
    } })
  return { session, modifier: async (fn: (e: EntretienFichier) => void) => { const e = JSON.parse(contenu); fn(e); contenu = JSON.stringify(e); await session.marquerSale() } }
}

describe('renommage GitLab par lot ciblé', () => {
  test('scan publié, définition puis cibles ; aucun bail, garde ou écrasement du miroir non ciblé', async () => {
    const b = banc(), { apercu, preparation } = await b.preparer()
    expect(apercu.regle.pseudos).toEqual(['Claire', 'Rebecca']); expect(apercu.entretiens).toHaveLength(3)
    apercu.demande.nouveauPseudo = 'Forgerie'; apercu.entretiens[0].usages = []
    expect(await b.service.appliquer(preparation)).toMatchObject({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true, statut: 'termine' })
    const commits = donnees(b)
    expect(commits).toHaveLength(3); expect(commits.map((c) => c.actions.length)).toEqual([2, 3, 3])
    expect(commits[0].actions.find((a) => a.file_path === 'racine/corpus.crp')?.content).toContain('Nouvelle')
    expect(commits.flatMap((c) => c.actions).some((a) => a.file_path.includes('e3.json'))).toBe(false)
    for (const source of b.sources.slice(0, 2)) {
      const attendu = structuredClone(source.data); for (const a of attendu.annotations) if (['a0', 'a5'].includes(a.id)) a.pseudo = 'Nouvelle'
      attendu.lastModified = b.lire(source.id).lastModified
      expect(b.lire(source.id)).toEqual(attendu)
      expect(JSON.parse(readFileSync(join(b.dir, 'entretiens', `${source.id}.json`), 'utf8'))).toEqual(attendu)
    }
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
    expect(b.service.lireSuivi()).toBeNull(); expect(b.journal.lister()).toEqual([])
    expect(statSync(join(b.dir, '.renommage-anon-gitlab.json')).mode & 0o777).toBe(0o600)
  })
  test('150 membres et seulement deux cibles : accepté, bornes par publication', async () => {
    const b = banc(150), p = (await b.preparer()).preparation
    expect(p.cibles.map((c) => c.id)).toEqual(['e1', 'e2'])
    expect((await b.service.appliquer(p)).statut).toBe('termine'); expect(donnees(b)).toHaveLength(3)
  })
  test('variante inutilisée : corpus seul ; no-op sans autre commit', async () => {
    const b = banc(), demande = { regleId: 'vide', ancienPseudo: 'Inutilisée', nouveauPseudo: 'Autre libellé' }
    expect((await b.service.appliquer((await b.preparer(demande)).preparation)).annotations).toBe(0)
    expect(donnees(b)).toHaveLength(1); expect(donnees(b)[0].actions).toHaveLength(2)
    await b.service.appliquer((await b.preparer({ ...demande, ancienPseudo: 'Autre libellé' })).preparation)
    expect(donnees(b)).toHaveLength(1)
  })
  test('non-cible modifiée avant et pendant les publications : succès sans écrasement', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    b.changer('e3', (e) => { e.lastModified = 'concurrent-avant' })
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) b.changer('e3', (e) => { e.lastModified = 'concurrent-envoi' }) }
    expect((await b.service.appliquer(p)).statut).toBe('termine'); expect(b.lire('e3').lastModified).toBe('concurrent-envoi')
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
  })
  test('session distante non ciblée reste ouverte et publie normalement après le lot', async () => {
    const b = banc(), p = (await b.preparer()).preparation, bob = sessionDistante(b, 'e3')
    expect((await bob.session.ouvrir()).etat).toBe('edition')
    expect((await b.service.appliquer(p)).statut).toBe('termine')
    await bob.modifier((e) => { e.lastModified = 'publication-bob'; e.meta.valeursGen = {} })
    expect((await bob.session.publier()).statut).toBe('confirme'); expect(b.lire('e3').lastModified).toBe('publication-bob')
    await bob.session.fermer()
  })
  test('ancienne session ne peut pas introduire l’ancien pseudo, mais peut corriger puis publier', async () => {
    const b = banc(), bob = sessionDistante(b, 'e3'); await bob.session.ouvrir()
    await b.service.appliquer((await b.preparer()).preparation)
    await bob.modifier((e) => { e.annotations.push(structuredClone(b.sources[0].data.annotations[0])) })
    expect(await bob.session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' }); expect(b.lire('e3').annotations).toEqual([])
    await bob.modifier((e) => { e.annotations[0].pseudo = 'Nouvelle' })
    expect((await bob.session.publier()).statut).toBe('confirme'); await bob.session.fermer()
  })
  test('import d’un nouvel entretien : un ancien choix lié ne contourne pas la définition publiée', async () => {
    const b = banc(); await b.service.appliquer((await b.preparer()).preparation)
    const payload = structuredClone(b.sources[2].data); payload.annotations = [structuredClone(b.sources[0].data.annotations[0])]
    const transactions = new TransactionsGitLab(b.options)
    await expect(transactions.importerEntretien('Import périmé', payload, [], [], [])).rejects.toThrow('variante choisie')
    expect(Object.keys(JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu).membership)).toHaveLength(3)
    payload.annotations[0].pseudo = 'Nouvelle'
    await expect(transactions.importerEntretien('Import actuel', payload, [], [], [])).resolves.toHaveProperty('id')
  })
  test('définition changée entre validation et commit : nouvelle validation refuse l’ancien choix', async () => {
    const b = banc(), bob = sessionDistante(b, 'e3'); await bob.session.ouvrir()
    await bob.modifier((e) => { e.annotations = [structuredClone(b.sources[0].data.annotations[0])] })
    let fait = false
    b.depot.avantCommit = (actions) => {
      if (!fait && actions.some((a) => a.file_path === 'racine/entretiens/e3.json')) {
        fait = true
        const cp = JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu)
        cp.reglesAnon.personne.pseudos = ['Nouvelle', 'Rebecca']
        b.depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(cp))
      }
    }
    expect(await bob.session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' })
    expect(b.lire('e3').annotations).toEqual([])
    await bob.modifier((e) => { e.annotations[0].pseudo = 'Nouvelle' })
    expect((await bob.session.publier()).statut).toBe('confirme'); await bob.session.fermer()
  })
  test.each(['session', 'bail', 'version'])('cible %s différée, succès acquis et reprise seulement du restant', async (cause) => {
    const b = banc(), p = (await b.preparer()).preparation
    let bob: ReturnType<typeof sessionDistante> | undefined
    if (cause === 'session') b.sessions.push('e2')
    if (cause === 'bail') { bob = sessionDistante(b, 'e2'); await bob.session.ouvrir() }
    if (cause === 'version') b.changer('e2', (e) => { e.lastModified = 'source-concurrente' })
    const bilan = await b.service.appliquer(p)
    expect(bilan).toMatchObject({ statut: 'partiel', annotations: 2, entretiens: 1, definitionModifiee: true })
    expect(bilan.differes?.[0].id).toBe('e2'); expect(b.lire('e1').annotations[0].pseudo).toBe('Nouvelle'); expect(b.lire('e2').annotations[0].pseudo).toBe('Claire')
    const publicClone = b.service.lireSuivi()!; expect(JSON.stringify(publicClone)).not.toContain('corpsTexte')
    publicClone.cibles[0].etat = 'confirme'; publicClone.demande.nouveauPseudo = 'Forgerie'
    b.sessions.length = 0; if (bob) await bob.session.fermer()
    expect((await b.service.appliquer((await b.reprise()).preparation))).toMatchObject({ statut: 'termine', annotations: 4, entretiens: 2 })
    expect(donnees(b)).toHaveLength(3)
    if (cause === 'version') expect(b.lire('e2').lastModified).not.toBe('miroir-périmé')
  })
  test('une cible dont les usages ont été retirés est retirée explicitement par le nouveau consentement', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    b.sessions.length = 0; b.changer('e2', (e) => { e.annotations = [] })
    const r = await b.reprise(); expect(r.apercu.renommages).toBe(0)
    expect(await b.service.appliquer(r.preparation)).toMatchObject({ statut: 'termine', annotations: 2, ciblesRetirees: ['e2'] })
    expect(b.lire('e2').annotations).toEqual([]); expect(donnees(b)).toHaveLength(2)
  })
  test('nouvel usage avant revalidation : nouvelle confirmation obligatoire avant toute écriture', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    b.changer('e3', (e) => { e.annotations = [structuredClone(b.sources[0].data.annotations[0])] })
    await expect(b.service.appliquer(p)).rejects.toThrow('nouveaux usages'); expect(donnees(b)).toHaveLength(0)
  })
  test('nouvel usage concurrent du scan initial : détecté au contrôle final puis nouvel aperçu ciblé', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    let fait = false
    b.depot.avantCommit = (actions) => {
      if (!fait && actions.some((a) => a.file_path === 'racine/corpus.crp' && a.content?.includes('Nouvelle') && !actions.some((a) => a.file_path.includes('/entretiens/')))) {
        fait = true; b.changer('e3', (e) => { e.annotations = [structuredClone(b.sources[0].data.annotations[0])] })
      }
    }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 4 })
    expect(b.lire('e3').annotations[0].pseudo).toBe('Claire')
    const reprise = await b.reprise(); expect(reprise.apercu.entretiens.filter((e) => e.renommages).map((e) => e.id)).toEqual(['e3'])
    expect(await b.service.appliquer(reprise.preparation)).toMatchObject({ statut: 'termine', annotations: 5, entretiens: 3 })
    expect(donnees(b)).toHaveLength(4)
  })
  test('usage réapparu dans une cible confirmée : nouveau consentement et bilan cumulatif sans double compte d’entretien', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    b.changer('e1', (e) => { e.annotations.push({ ...b.sources[0].data.annotations[0], id: 'nouveau-a4', from: 33, to: 39 }) })
    b.sessions.length = 0
    const r = await b.reprise(); expect(r.apercu.renommages).toBe(3)
    expect(await b.service.appliquer(r.preparation)).toMatchObject({ statut: 'termine', annotations: 5, entretiens: 2 })
    expect(donnees(b)).toHaveLength(4)
  })
  test('cible sortie du membership pendant le lot : nouveau consentement la retire sans toucher son fichier', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    const cp = JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu)
    delete cp.membership.e2; cp.ordreEntretiens = ['e1', 'e3']
    b.depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(cp)); b.sessions.length = 0
    expect(await b.service.appliquer((await b.reprise()).preparation)).toMatchObject({ statut: 'termine', annotations: 2, ciblesRetirees: ['e2'] })
    expect(b.lire('e2').annotations[0].pseudo).toBe('Claire'); expect(donnees(b)).toHaveLength(2)
  })
  test('corpus changé, source indisponible, token étranger ou défaut de consentement : aucune autorité', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    const cp = JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu) as CorpusFichier; cp.titre = 'Concurrent'
    b.depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(cp))
    await expect(b.service.appliquer(p)).rejects.toThrow('corpus a changé')
    await expect(b.service.appliquer({ ...p, store: new CorpusStore(b.dir) })).rejects.toThrow('corpus a changé')
    b.depot.fichiers.delete('racine/entretiens/e3.json')
    const a = b.cache.preparerGitLab(b.demande, await b.service.instantane(), true, b.service)
    expect(a.faisable).toBe(false); a.faisable = true
    expect(() => b.cache.consommerGitLab(a.token, true, b.service)).toThrow('obstacles')
    const c = banc(), source = await c.service.instantane()
    const autre = c.cache.preparerGitLab(c.demande, source, true, c.service)
    expect(() => c.cache.consommerGitLab(autre.token, true, {})).toThrow('contexte GitLab')
    const suivant = c.cache.preparerGitLab(c.demande, source, true, c.service)
    expect(() => c.cache.consommerGitLab(suivant.token, false, c.service)).toThrow('Confirmez')
    expect(() => c.cache.consommerGitLab(suivant.token, true, c.service)).toThrow('expiré')
    const local = new RenommagesAnon({ store: () => c.store })
    const l = local.preparer({ ...c.demande, ancienPseudo: 'Miroir périmé' })
    expect(() => local.consommerGitLab(l.token, true, c.service)).toThrow('fournisseur')
  })
  test('course sur une cible : refus de cette publication, autres succès conservés', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e2.json')) b.changer('e2', (e) => { e.lastModified = 'concurrent-envoi' }) }
    const r = await b.service.appliquer(p); expect(r.statut).toBe('partiel'); expect(r.annotations).toBe(2)
    expect(b.lire('e2').lastModified).toBe('concurrent-envoi'); expect(b.lire('e2').annotations[0].pseudo).toBe('Claire')
  })
  test('baux renouvelés ; perte avant publication sans commit de données', async () => {
    const b = banc(), p = (await b.preparer()).preparation, snapshot = b.coordination.snapshot.bind(b.coordination)
    vi.spyOn(b.coordination, 'snapshot').mockImplementation((d) => ({ ...snapshot(d), expireLe: Date.now() + 1000 }))
    const renouveler = vi.spyOn(b.coordination, 'renouveler')
    await b.service.appliquer(p); expect(renouveler).toHaveBeenCalled(); vi.restoreAllMocks()
    const c = banc(), q = (await c.preparer()).preparation, etat = c.coordination.snapshot.bind(c.coordination)
    vi.spyOn(c.coordination, 'snapshot').mockImplementation((d) => ({ ...etat(d), expireLe: Date.now() + 1000 }))
    vi.spyOn(c.coordination, 'renouveler').mockResolvedValue(false)
    await expect(c.service.appliquer(q)).rejects.toThrow('bail du renommage'); expect(donnees(c)).toHaveLength(0)
  })
  test('réponse perdue reconnue sur une cible sans deuxième commit', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) b.depot.echouerApresAccepter(new Error('réponse perdue')) }
    expect((await b.service.appliquer(p)).statut).toBe('termine'); expect(donnees(b)).toHaveLength(3); expect(b.journal.lister()).toEqual([])
  })
  test.each(['definition', 'entretien'])('issue inconnue de %s, redémarrage et reprise sans rejeu', async (phase) => {
    const b = banc(), p = (await b.preparer()).preparation
    b.depot.avantCommit = (actions) => { if (phase === 'definition' ? actions.some((a) => a.file_path === 'racine/corpus.crp') && !actions.some((a) => a.file_path.includes('/entretiens/')) : actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) { b.depot.echouerApresAccepter(new Error('réponse perdue')); b.depot.rendreCommitsIllisibles() } }
    expect((await b.service.appliquer(p)).statut).toBe('indetermine')
    const entree = b.journal.lister()[0]; expect(entree.droits).toHaveLength(1)
    expect(statSync(join(b.dir, 'operations/candidates', entree.candidat)).mode & 0o777).toBe(0o600)
    await expect(b.reprise()).rejects.toThrow('indéterminée')
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    const coordination = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 'relance' }) })
    await reprendreOperationsGitLab({ depot: b.depot, coordination, journal: b.journal, dirMiroir: b.dir })
    const relance = new RenommagesAnonGitLab({ ...b.options, coordination, publication: new PublieurGitLab({ branche: 'main', depot: b.depot, coordination, journal: b.journal, attendre: async () => {} }) }, () => [])
    expect((await relance.appliquer((await b.reprise(relance)).preparation)).statut).toBe('termine')
    expect(donnees(b)).toHaveLength(3); expect(b.journal.lister()).toEqual([])
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).annotations[0].pseudo).toBe('Nouvelle')
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
  })
  test.each(['definition', 'e2'])('arrêt avant l’envoi de %s : intention privée sans publication puis reprise', async (phase) => {
    const b = banc(), p = (await b.preparer()).preparation
    const publier = b.publication.publierSousDroit.bind(b.publication)
    vi.spyOn(b.publication, 'publierSousDroit').mockImplementation(async (plan, droit) => {
      if (phase === 'definition' ? !plan.actions.some((a) => a.chemin.includes('/entretiens/')) : plan.actions.some((a) => a.chemin.endsWith('/e2.json'))) throw new Error('Arrêt avant le transport')
      return publier(plan, droit)
    })
    const arret = await b.service.appliquer(p)
    expect(arret.statut).toBe('indetermine'); expect(b.journal.lister()).toEqual([])
    expect(donnees(b)).toHaveLength(phase === 'definition' ? 0 : 2)
    vi.restoreAllMocks()
    const relance = new RenommagesAnonGitLab(b.options, () => [])
    expect((await relance.appliquer((await b.reprise(relance)).preparation)).statut).toBe('termine')
    expect(donnees(b)).toHaveLength(3)
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).annotations[0].pseudo).toBe('Nouvelle')
  })
  test('catégorie changée pendant un lot incomplet : nouvelle reprise la conserve', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    const cp = JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu)
    cp.reglesAnon.personne.categorie = 'Catégorie concurrente'
    b.depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(cp)); b.sessions.length = 0
    expect((await b.service.appliquer((await b.reprise()).preparation)).statut).toBe('termine')
    expect(JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu).reglesAnon.personne.categorie).toBe('Catégorie concurrente')
  })
  test('définition divergente pendant un lot incomplet : reprise refusée sans écrasement', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    const cp = JSON.parse(b.depot.fichiers.get('racine/corpus.crp')!.contenu)
    cp.reglesAnon.personne.pseudos = ['Modification concurrente', 'Rebecca']
    b.depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(cp))
    await expect(b.reprise()).rejects.toThrow('définition du lot a changé')
    expect(b.lire('e2').annotations[0].pseudo).toBe('Claire'); expect(donnees(b)).toHaveLength(2)
  })
  test('miroir défaillant : succès journalisé, pas de replay ni écrasement des non-cibles', async () => {
    const b = banc(), p = (await b.preparer()).preparation
    vi.spyOn(b.store, 'installerEntretienDistant').mockImplementation(() => { throw new Error('Disque') })
    const r = await b.service.appliquer(p)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 2 }); expect(r.motif).toContain('miroir')
    expect(b.service.disponible()).toBe(false); expect(donnees(b)).toHaveLength(2)
    expect(() => b.service.exigerMiroirComplet('e3')).not.toThrow()
    await expect(b.service.preparerReprise(r.operationId!)).rejects.toThrow('miroir')
  })
  test('journal altéré : ni nouvelle écriture ni reprise', async () => {
    const b = banc(); b.sessions.push('e2'); await b.service.appliquer((await b.preparer()).preparation)
    const chemin = join(b.dir, '.renommage-anon-gitlab.json'), j = JSON.parse(readFileSync(chemin, 'utf8'))
    j.cibles[1].apres.corpsTexte.content[0].content[0].text = 'Texte forgé'
    writeFileSync(chemin, JSON.stringify(j))
    expect(() => b.service.lireSuivi()).toThrow('journal'); expect(donnees(b)).toHaveLength(2)
  })
  test('contexte : file commune, seules les ouvertures ciblées refusées, tirage sérialisé', async () => {
    const b = banc(), { c, ouvrir } = contexte(b, ['entretiens/e3.json'])
    expect(c.file).toBe(b.file); expect(c.renommageAnonDisponible()).toBe(true)
    const a = b.cache.preparerGitLab(b.demande, await c.instantaneRenommageAnon(), true, c)
    let continuer!: () => void
    const commit = b.publication.publierSousDroit.bind(b.publication)
    const publier = vi.spyOn(b.publication, 'publierSousDroit').mockImplementationOnce(async (...args) => { await new Promise<void>((r) => { continuer = r }); return commit(...args) })
    const op = c.renommerVarianteAnon(b.cache.consommerGitLab(a.token, true, c))
    await vi.waitFor(() => expect(publier).toHaveBeenCalled())
    await expect(c.ouvrirSessionEntretien('e1')).rejects.toThrow('cible de renommage')
    await expect(c.ouvrirSessionEntretien('e3')).resolves.toMatchObject({ etat: 'lecture-seule' })
    await expect(c.fermer()).rejects.toThrow('Attendez')
    const tirage = vi.fn(async () => expect(donnees(b)).toHaveLength(3)), enAttente = c.file.executer(tirage)
    await Promise.resolve(); expect(tirage).not.toHaveBeenCalled()
    continuer(); await op; await enAttente
    expect(ouvrir).toHaveBeenCalledOnce(); expect(tirage).toHaveBeenCalledOnce()
  })
  test('issue inconnue d’une cible : les ouvertures étrangères au lot restent possibles', async () => {
    const b = banc(), { c, ouvrir } = contexte(b)
    const a = b.cache.preparerGitLab(b.demande, await c.instantaneRenommageAnon(), true, c)
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) { b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles() } }
    expect((await c.renommerVarianteAnon(b.cache.consommerGitLab(a.token, true, c))).statut).toBe('indetermine')
    await expect(c.ouvrirSessionEntretien('e1')).rejects.toThrow('cible de renommage')
    await expect(c.ouvrirSessionEntretien('e3')).resolves.toMatchObject({ etat: 'lecture-seule' })
    expect(ouvrir).toHaveBeenCalledOnce()
  })
  test('ouverture non ciblée déjà engagée n’exclut pas le geste', async () => {
    const b = banc(), { c, ouvrir } = contexte(b)
    let terminer!: (etat: { etat: 'lecture-seule' }) => void
    ouvrir.mockReturnValue({ ouvrir: () => new Promise((resolve) => { terminer = resolve }) } as never)
    const ouverture = c.ouvrirSessionEntretien('e3'); expect(c.renommageAnonDisponible()).toBe(true)
    const a = b.cache.preparerGitLab(b.demande, await c.instantaneRenommageAnon(), true, c)
    expect((await c.renommerVarianteAnon(b.cache.consommerGitLab(a.token, true, c))).statut).toBe('termine')
    terminer({ etat: 'lecture-seule' }); await ouverture
  })
})
