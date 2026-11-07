import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { DissociationsAnonGitLab } from '../../src/main/gitlab/dissociationsAnon'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { verifierReferencesDefinitions } from '../../src/main/gitlab/referencesDefinitions'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'
import { DepotMemoire } from './depotMemoire'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc(nombre = 3) {
  const f = fixtureDissociationAnon(Array.from({ length: nombre }, (_, i) => `e${i + 1}`))
  f.sources.slice(2).forEach((s) => { s.data.annotations = [] })
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const dir = mkdtempSync(join(tmpdir(), 'dissociation-gitlab-')); dossiers.push(dir); mkdirSync(join(dir, 'entretiens'))
  const miroir = structuredClone(f.corpus); miroir.reglesAnon.personne.pseudos = ['Miroir périmé']
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(miroir))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify({ ...s.data, lastModified: 'miroir-périmé' }))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire()
  depot.charger(new Map([['racine/corpus.crp', JSON.stringify(f.corpus)], ...f.sources.map((s) => [`racine/entretiens/${s.id}.json`, JSON.stringify(s.data)] as [string, string])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 's1' }) })
  const journal = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'destination', compteId: 'alice', projetId: 1, nomProjet: 'Projet', branche: 'main', racine: 'racine' }, store, depot, coordination, journal, publication, file: new FileOperationsContexte() }
  const sessions: string[] = []
  let maintenant = Date.now()
  const service = new DissociationsAnonGitLab(options, () => sessions, () => maintenant)
  const lire = (id: string): EntretienFichier => JSON.parse(depot.fichiers.get(`racine/entretiens/${id}.json`)!.contenu)
  const cp = (): CorpusFichier => JSON.parse(depot.fichiers.get('racine/corpus.crp')!.contenu)
  const changer = (id: string, fn: (e: EntretienFichier) => void) => { const e = lire(id); fn(e); depot.modifierHorsProtocole(`racine/entretiens/${id}.json`, JSON.stringify(e)) }
  const changerCorpus = (fn: (c: CorpusFichier) => void) => { const c = cp(); fn(c); depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(c)) }
  return { ...f, dir, store, depot, coordination, journal, publication, options, sessions, service, lire, cp, changer, changerCorpus,
    expirer: () => { maintenant += 300_001 }, preparer: () => service.preparer(f.demande) }
}
const commits = (b: ReturnType<typeof banc>) => b.depot.commits.filter((c) => c.message.startsWith('Sonal dissociation-'))
const appliquer = async (b: ReturnType<typeof banc>) => b.service.appliquer((await b.preparer()).token, true)
const reprendre = async (b: ReturnType<typeof banc>, s = b.service) => s.appliquer((await s.preparerReprise(s.lireSuivi()!.operationId)).token, true)

describe('moteur technique de dissociation GitLab', () => {
  test('serveur et non miroir ; barrière, transferts complets, retrait en dernier', async () => {
    const b = banc(), a = await b.preparer()
    expect(a.regle.pseudos).toEqual(['Claire', 'Rebecca']); expect(a.bilan.annotations).toBe(8)
    a.regle.pseudos = ['Forgerie']; a.entretiens.length = 0
    expect(await b.service.appliquer(a.token, true)).toMatchObject({ statut: 'termine', annotations: 8, entretiens: 2, definitionsLocales: 2, regleRetiree: true })
    expect(commits(b)).toHaveLength(4)
    expect(commits(b).map((c) => c.actions.length)).toEqual([2, 3, 3, 4])
    expect(b.cp().reglesAnon.personne).toBeUndefined(); expect(b.cp().dissociationAnon).toBeUndefined()
    for (const s of b.sources.slice(0, 2)) {
      const attendu = structuredClone(s.data)
      attendu.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
      for (const a of attendu.annotations) if (a.regle === 'personne') delete a.regle
      attendu.lastModified = b.lire(s.id).lastModified
      expect(b.lire(s.id)).toEqual(attendu)
    }
    expect(commits(b).flatMap((c) => c.actions).some((a) => a.file_path.includes('e3.json'))).toBe(false)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
    expect(statSync(join(b.dir, '.dissociation-anon-gitlab.json')).mode & 0o777).toBe(0o600)
    expect(b.service.lireSuivi()).toBeNull()
  })
  test('300 membres, deux cibles seulement ; aucune limite de nombre total de membres', async () => {
    const b = banc(300)
    expect(await appliquer(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(commits(b)).toHaveLength(4)
  })
  test('règle sans usage : barrière puis retrait sans mémoire inventée', async () => {
    const b = banc(), a = await b.service.preparer({ regleId: 'vide' })
    expect(await b.service.appliquer(a.token, true)).toMatchObject({ statut: 'termine', entretiens: 0, definitionsLocales: 0 })
    expect(commits(b)).toHaveLength(2); expect(b.lire('e1')).toEqual(b.sources[0].data)
  })
  test.each(['consentement', 'expiration', 'autre-service'])('token consommé, sans autorité publique : %s', async (cas) => {
    const b = banc(), a = await b.preparer()
    if (cas === 'expiration') b.expirer()
    const s = cas === 'autre-service' ? new DissociationsAnonGitLab(b.options, () => []) : b.service
    await expect(s.appliquer(a.token, cas !== 'consentement')).rejects.toThrow()
    if (s === b.service) await expect(s.appliquer(a.token, true)).rejects.toThrow('expiré')
    expect(commits(b)).toHaveLength(0)
  })
  test('trois aperçus maximum ; le plus ancien perd son autorité', async () => {
    const b = banc(), a = await b.preparer()
    await b.preparer(); await b.preparer(); await b.preparer()
    await expect(b.service.appliquer(a.token, true)).rejects.toThrow('expiré')
  })
  test('corpus changé avant application : aucun journal ni publication de données', async () => {
    const b = banc(), a = await b.preparer(); b.changerCorpus((c) => { c.titre = 'Concurrent' })
    await expect(b.service.appliquer(a.token, true)).rejects.toThrow('corpus a changé')
    expect(commits(b)).toHaveLength(0)
  })
  test('nouvelle cible avant application : nouveau consentement sans publier la barrière', async () => {
    const b = banc(), a = await b.preparer(); b.changer('e3', (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    await expect(b.service.appliquer(a.token, true)).rejects.toThrow('nouveaux usages')
    expect(b.cp().dissociationAnon).toBeUndefined()
  })
  test('session cible ouverte : différée ; session non ciblée conservée', async () => {
    const b = banc(); b.sessions.push('e2', 'e3')
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false, differes: [{ id: 'e2' }] })
    expect(b.cp().reglesAnon.personne).toBeDefined(); expect(b.cp().dissociationAnon).toBeDefined()
    expect(b.service.cibleProtegee('e2')).toBe(true); expect(b.service.cibleProtegee('e3')).toBe(false)
    b.sessions.splice(0, 1)
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 8, entretiens: 2 })
    expect(b.sessions).toEqual(['e3']); expect(commits(b)).toHaveLength(4)
  })
  test('bail distant tenu : pas de vol ni suppression prématurée', async () => {
    const b = banc(), bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 's2' }) })
    const bail = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e2.json'))
    expect(bail.ok).toBe(true)
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    if (bail.ok) await bob.liberer(bail.droit)
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
  })
  test('cible changée : aucun écrasement, reprise fraîche conserve l’édition', async () => {
    const b = banc(), a = await b.preparer(); b.changer('e2', (e) => { e.locuteurs[0].pseudo = 'Concurrent' })
    expect(await b.service.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(b.lire('e2').locuteurs[0].pseudo).toBe('Concurrent')
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(b.lire('e2').locuteurs[0].pseudo).toBe('Concurrent')
  })
  test('nouveaux usages au contrôle final : gardés pour un nouveau consentement', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path === 'racine/entretiens/e2.json')) b.changer('e3', (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], regleRetiree: false })
    b.depot.avantCommit = () => {}
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 12, entretiens: 3 })
  })
  test('référence réapparue dans une cible acquise : aucune fusion de la mémoire créée', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    b.changer('e1', (e) => { e.annotations.push({ ...b.sources[0].data.annotations[0], id: 'nouveau-lien' }) })
    b.sessions.length = 0
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow()
    expect(b.cp().reglesAnon.personne).toBeDefined(); expect(commits(b)).toHaveLength(2)
  })
  test('cible retirée du membership : nouvel aperçu explicite, fichier laissé intact', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    b.changerCorpus((c) => { delete c.membership.e2; c.ordreEntretiens = ['e1', 'e3'] }); b.sessions.length = 0
    const a = await b.service.preparerReprise(b.service.lireSuivi()!.operationId)
    expect(a.ciblesRetirees).toEqual(['e2'])
    expect(await b.service.appliquer(a.token, true)).toMatchObject({ statut: 'termine', entretiens: 1 })
    expect(b.lire('e2').annotations[0].regle).toBe('personne')
  })
  test.each(['categorie', 'barriere'])('divergence de %s : reprise refusée sans écrasement', async (cas) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    b.changerCorpus((c) => { if (cas === 'categorie') c.reglesAnon.personne.categorie = 'Concurrente'; else delete c.dissociationAnon })
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow('barrière')
    expect(commits(b)).toHaveLength(2)
  })
  test('source non ciblée illisible après un transfert : pas de preuve ni de retrait', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e2.json')) b.depot.fichiers.delete('racine/entretiens/e3.json') }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', regleRetiree: false })
    expect(commits(b)).toHaveLength(3)
  })
  test.each(['barriere', 'entretien', 'retrait'])('réponse perdue après %s : reconnaissance sans second commit', async (phase) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => phase === 'entretien' ? a.file_path.endsWith('/e1.json') : a.file_path === 'racine/corpus.crp' && a.content !== undefined
        && (phase === 'barriere' ? !!JSON.parse(a.content).dissociationAnon : !JSON.parse(a.content).reglesAnon.personne))) b.depot.echouerApresAccepter(new Error('Réponse perdue'))
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'termine' }); expect(commits(b)).toHaveLength(4)
  })
  test.each(['barriere', 'entretien'])('issue inconnue de %s : journal privé et relance sans rejeu', async (phase) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => phase === 'entretien' ? a.file_path.endsWith('/e1.json') : a.file_path === 'racine/corpus.crp' && a.content !== undefined)) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b); expect(r.statut).toBe('indetermine')
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('indéterminée')
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    const s = new DissociationsAnonGitLab(b.options, () => [])
    expect(await reprendre(b, s)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(commits(b)).toHaveLength(4); expect(b.journal.lister()).toEqual([])
  })
  test('miroir défaillant : transfert acquis, aucun rejeu ; nouvelle instance réinstalle la source actuelle', async () => {
    const b = banc(), installer = vi.spyOn(b.store, 'installerEntretienDistant').mockImplementation(() => { throw new Error('Disque') })
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(commits(b)).toHaveLength(2)
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow('miroir')
    installer.mockRestore()
    expect(await reprendre(b, new DissociationsAnonGitLab(b.options, () => []))).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(commits(b)).toHaveLength(4)
  })
  test.each(['pseudo', 'memoire', 'corpus-intention'])('journal altéré (%s) : aucune reprise', async (cas) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    const chemin = join(b.dir, '.dissociation-anon-gitlab.json'), j = JSON.parse(readFileSync(chemin, 'utf8'))
    if (cas === 'pseudo') j.cibles[0].apres.annotations[0].pseudo = 'Forgerie'
    else if (cas === 'memoire') j.cibles[0].apres.definitionsAnonLocales.at(-1).pseudos.pop()
    else { j.regleRetiree = true }
    writeFileSync(chemin, JSON.stringify(j))
    expect(() => b.service.lireSuivi()).toThrow('invalide')
    expect(commits(b)).toHaveLength(2)
  })
  test.each(['barriere', 'entretien', 'retrait'])('intention de %s avant transport : relance sans succès inventé', async (phase) => {
    const b = banc(), publier = b.publication.publierSousDroit.bind(b.publication)
    vi.spyOn(b.publication, 'publierSousDroit').mockImplementation(async (p, d) => {
      const a = p.actions.find((a) => a.action === 'update')!
      const data = 'contenu' in a ? JSON.parse(a.contenu) : null
      if (phase === 'entretien' ? a.chemin.endsWith('/e2.json') : a.chemin.endsWith('/corpus.crp') && (phase === 'barriere' ? !!data.dissociationAnon : !data.reglesAnon.personne)) throw new Error('Arrêt avant transport')
      return publier(p, d)
    })
    expect(await appliquer(b)).toMatchObject({ statut: 'indetermine' })
    expect(b.journal.lister()).toEqual([]); vi.restoreAllMocks()
    expect(await reprendre(b, new DissociationsAnonGitLab(b.options, () => []))).toMatchObject({ statut: 'termine' })
    expect(commits(b)).toHaveLength(4)
  })
  test('retrait accepté, historique indisponible : règle supprimée, reconnaissance sans nouveau commit', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b); expect(r.statut).toBe('indetermine'); expect(b.cp().reglesAnon.personne).toBeUndefined()
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    const s = new DissociationsAnonGitLab(b.options, () => [])
    expect(await s.relireSuivi(r.operationId)).toMatchObject({ statut: 'termine', regleRetiree: true, annotations: 8 })
    await expect(s.preparerReprise(r.operationId)).rejects.toThrow('absent ou terminé')
    expect(s.lireSuivi()).toBeNull(); expect(commits(b)).toHaveLength(4)
  })
  test('corpus changé entre scan final et commit : suppression refusée, succès conservés', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)) b.changerCorpus((c) => { c.titre = 'Concurrent' })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 2, regleRetiree: false })
    expect(b.cp().titre).toBe('Concurrent'); expect(b.cp().reglesAnon.personne).toBeDefined()
    expect(commits(b)).toHaveLength(3); b.depot.avantCommit = () => {}
    expect(await reprendre(b)).toMatchObject({ statut: 'termine' }); expect(commits(b)).toHaveLength(4)
  })
  test('enregistrement coopératif entre contrôle final et retrait : les anciens liens sont refusés', async () => {
    const b = banc(); let refusObserve = false
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)) {
        expect(() => verifierReferencesDefinitions(b.sources[0].data, b.cp(), b.sources[0].data)).toThrow('dissociation')
        refusObserve = true
      }
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'termine' }); expect(refusObserve).toBe(true)
  })
  test('publication préparée avant la barrière : la garde corpus interdit son envoi tardif', async () => {
    const b = banc(), cp = (await b.depot.lireFichier('racine/corpus.crp', 'main'))!
    await appliquer(b)
    const bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 's2' }) })
    const bail = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e3.json'))
    if (!bail.ok) throw new Error('Bail attendu')
    const source = (await b.depot.lireFichier('racine/entretiens/e3.json', 'main'))!
    const pub = new PublieurGitLab({ branche: 'main', depot: b.depot, coordination: bob, attendre: async () => {} })
    const resultat = await pub.publierSousDroit({ operationId: 'sauvegarde-retardee', nature: 'session-entretien', actions: [
      { action: 'update', chemin: source.chemin, commitId: source.commitId, contenu: JSON.stringify(b.sources[0].data) },
      { action: 'garde', chemin: cp.chemin, commitId: cp.commitId, executable: cp.executable },
    ] }, bail.droit)
    expect(resultat.statut).toBe('refuse'); expect(b.lire('e3').annotations).toEqual([])
    await bob.liberer(bail.droit)
  })
  test('nouvelle dissociation refusée quand une barrière d’un autre lot est publiée', async () => {
    const b = banc(); b.changerCorpus((c) => { c.dissociationAnon = { regleId: 'autre', operationId: 'dissociation-autre' } })
    await expect(b.preparer()).rejects.toThrow('déjà engagée'); expect(commits(b)).toHaveLength(0)
  })
  test.each(['absence', 'variante', 'categorie'])('mémoire acquise modifiée avant finalisation (%s) : pas de retrait ni restauration', async (cas) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/e2.json'))) b.changer('e1', (e) => {
        if (cas === 'absence') e.definitionsAnonLocales!.pop()
        else if (cas === 'variante') e.definitionsAnonLocales!.at(-1)!.pseudos.pop()
        else e.definitionsAnonLocales!.at(-1)!.categorie = 'Concurrente'
      })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 2, regleRetiree: false, motif: expect.stringContaining('définition locale acquise') })
    expect(b.cp().reglesAnon.personne).toBeDefined(); expect(commits(b)).toHaveLength(3)
    const avant = b.depot.fichiers.get('racine/entretiens/e1.json')!.contenu
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow('définition locale acquise')
    expect(b.depot.fichiers.get('racine/entretiens/e1.json')!.contenu).toBe(avant)
  })
  test('course sur une mémoire acquise juste avant le commit final : garde refusée, règle conservée', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)) b.changer('e1', (e) => { e.definitionsAnonLocales!.pop() })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 2, regleRetiree: false })
    expect(b.cp().reglesAnon.personne).toBeDefined(); expect(commits(b)).toHaveLength(3)
    expect(b.lire('e1').definitionsAnonLocales).toEqual(b.sources[0].data.definitionsAnonLocales)
  })
  test('249 cibles liées : limite de finalisation signalée avant tout commit, jamais de découpage', async () => {
    const b = banc(249)
    for (const source of b.sources.slice(2)) b.changer(source.id, (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    const a = await b.preparer()
    expect(a.applicationDisponible).toBe(false); expect(a.motifIndisponible).toContain('248')
    await expect(b.service.appliquer(a.token, true)).rejects.toThrow('248')
    expect(b.cp().dissociationAnon).toBeUndefined(); expect(commits(b)).toHaveLength(0)
  })
  test('édition indépendante d’un acquis conserve la mémoire complète : finalisation sans écrasement', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e2.json'))) b.changer('e1', (e) => { e.locuteurs[0].pseudo = 'Choix indépendant'; e.annotations[0].pseudo = 'Choix local indépendant' })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(b.lire('e1').annotations[0].pseudo).toBe('Choix local indépendant')
    expect(b.lire('e1').locuteurs[0].pseudo).toBe('Choix indépendant')
  })
  test('barrière publiée refuse même un ancien lien inchangé ; décisions indépendantes et autres règles autorisées', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    expect(() => verifierReferencesDefinitions(b.lire('e2'), b.cp(), b.lire('e2'))).toThrow('dissociation')
    expect(() => verifierReferencesDefinitions(b.lire('e1'), b.cp(), b.sources[0].data)).not.toThrow()
    expect(() => verifierReferencesDefinitions(b.lire('e3'), b.cp(), b.lire('e3'))).not.toThrow()
    const c = b.cp(); c.dissociationAnon = { regleId: 'personne', operationId: 'forgerie' }
    expect(() => verifierReferencesDefinitions(b.lire('e3'), c, b.lire('e3'))).toThrow('invalide')
  })
})
