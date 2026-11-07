import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RetraitsVarianteAnonGitLab } from '../../src/main/gitlab/retraitsVarianteAnon'
import { BailGitLab, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { verifierReferencesDefinitions, exigerAbsenceDissociationGitLab } from '../../src/main/gitlab/referencesDefinitions'
import { lireBarriereRetraitVarianteAnon } from '../../src/shared/corpus/barriereRetraitVarianteAnon'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { fixtureRetraitVarianteAnonGitLab } from '../fixtures/retraitVarianteAnonGitLab'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const banc = (n = 3) => fixtureRetraitVarianteAnonGitLab(dossiers, n)
type Banc = ReturnType<typeof banc>
const commits = (b: Banc) => b.depot.commits.filter((c) => c.message.startsWith('Sonal retrait-variante-'))
const appliquer = async (b: Banc) => b.service.appliquer((await b.preparer()).token, true)
const reprendre = async (b: Banc, s = b.service) => s.appliquer((await s.preparerReprise(s.lireSuivi()!.operationId)).token, true)
const fichier = (b: Banc) => join(b.dir, '.retrait-variante-anon-gitlab.json')

describe('retrait de variante GitLab, moteur séparé du parcours produit', () => {
  test('source publiée, repli exact, états/mémoire/locuteurs intacts et aucun droit non ciblé', async () => {
    const b = banc(), p = await b.preparer(); expect(p.bilan.annotations).toBe(6); expect(p.lecture).toBe('gitlab')
    p.demande.pseudoConserve = 'Intrus'; p.entretiens = []; p.regle.pseudos = []
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', annotations: 6, exceptions: 3, incluses: 2, entretiens: 2, varianteRetiree: true })
    expect(commits(b).map((c) => c.actions.length)).toEqual([2, 4, 4, 4])
    expect(b.cp().reglesAnon.personne.pseudos).toEqual(['Rebecca']); expect(b.cp().retraitVarianteAnon).toBeUndefined()
    for (const s of b.sources.slice(0, 2)) {
      const attendu = structuredClone(s.data)
      for (const a of attendu.annotations) if (a.type === 'anon' && a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'Rebecca'
      attendu.lastModified = b.lire(s.id).lastModified; expect(b.lire(s.id)).toEqual(attendu)
    }
    expect(b.lire('e3')).toEqual(b.sources[2].data); expect(commits(b).flatMap((c) => c.actions).some((a) => a.file_path.includes('e3.json'))).toBe(false)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
    expect(statSync(fichier(b)).mode & 0o777).toBe(0o600); expect(b.service.lireSuivi()).toBeNull()
  })
  test('300 membres, deux cibles : inventaire distinct des seuls baux corpus/cible', async () => {
    const b = banc(300); b.sessions.push('e3')
    expect(await appliquer(b)).toMatchObject({ statut: 'termine', entretiens: 2 }); expect(b.sessions).toEqual(['e3'])
    expect(commits(b)).toHaveLength(4); expect(commits(b).flatMap((c) => c.actions).some((a) => a.file_path.includes('e3.json'))).toBe(false)
  })
  test('variante inutilisée : deux commits corpus, aucun entretien touché', async () => {
    const b = banc(); for (const id of ['e1', 'e2']) b.changer(id, (e) => { for (const a of e.annotations) if (a.regle === 'personne') a.pseudo = 'Rebecca' })
    const avant = b.lire('e1'); expect(await appliquer(b)).toMatchObject({ statut: 'termine', entretiens: 0, annotations: 0 })
    expect(commits(b)).toHaveLength(2); expect(b.lire('e1')).toEqual(avant)
  })
  test.each(['consentement', 'expiration', 'autre-instance'])('aperçu privé : %s', async (cas) => {
    const b = banc(), p = await b.preparer(); if (cas === 'expiration') b.expirer()
    const s = cas === 'autre-instance' ? new RetraitsVarianteAnonGitLab(b.options, () => []) : b.service
    await expect(s.appliquer(p.token, cas !== 'consentement')).rejects.toThrow(); expect(commits(b)).toHaveLength(0)
    if (s === b.service) await expect(s.appliquer(p.token, true)).rejects.toThrow('expiré')
  })
  test('trois préparations maximum, aucune publication de données', async () => {
    const b = banc(), p = await b.preparer(); await b.preparer(); await b.preparer(); await b.preparer()
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré'); expect(commits(b)).toHaveLength(0)
  })
  test('expiration dans la file, aucun envoi', async () => {
    const b = banc(), p = await b.preparer(); let liberer!: () => void
    const attente = b.options.file.executer(() => new Promise<void>((r) => { liberer = r })); await Promise.resolve()
    const application = b.service.appliquer(p.token, true); b.expirer(); liberer(); await attente
    await expect(application).rejects.toThrow('expiré'); expect(commits(b)).toHaveLength(0)
  })
  test('expiration pendant l’inventaire sous droit corpus, aucune protection publiée', async () => {
    const b = banc(), p = await b.preparer(), lire = b.depot.lireFichier.bind(b.depot)
    vi.spyOn(b.depot, 'lireFichier').mockImplementation(async (...args) => { const r = await lire(...args); if (args[0].endsWith('/e2.json')) b.expirer(); return r })
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré'); expect(commits(b)).toHaveLength(0)
  })
  test.each(['categorie', 'corpus', 'nouvelle-cible'])('périmé avant premier envoi : %s', async (cas) => {
    const b = banc(), p = await b.preparer()
    if (cas === 'categorie') b.changerCorpus((c) => { c.reglesAnon.personne.categorie = 'Autre' })
    if (cas === 'corpus') b.changerCorpus((c) => { c.titre = 'Concurrent' })
    if (cas === 'nouvelle-cible') b.changer('e3', (e) => { e.annotations[0].pseudo = 'Claire' })
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow(); expect(commits(b)).toHaveLength(0)
  })
  test('session ciblée différée, session non ciblée conservée, reprise fraîche', async () => {
    const b = banc(); b.sessions.push('corpus:e2', 'e3')
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', annotations: 3, varianteRetiree: false, differes: [{ id: 'e2' }] })
    expect(b.cp().reglesAnon.personne.pseudos).toHaveLength(2); expect(b.service.cibleProtegee('e2')).toBe(true); expect(b.service.cibleProtegee('e3')).toBe(false)
    b.sessions.splice(0, 1); expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 6 }); expect(b.sessions).toEqual(['e3'])
  })
  test('bail tiers ciblé : aucun vol, deux variantes gardées jusqu’au remplacement complet', async () => {
    const b = banc(), bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 's2' }) })
    const bail = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e2.json')); expect(bail.ok).toBe(true)
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 1 }); expect(b.cp().reglesAnon.personne.pseudos).toHaveLength(2)
    if (bail.ok) await bob.liberer(bail.droit); expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
  })
  test('cible changée différée, réexamen préserve la modification indépendante', async () => {
    const b = banc(), p = await b.preparer(); b.changer('e2', (e) => { e.locuteurs[0].pseudo = 'Plus récent' })
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 }); expect(b.lire('e2').locuteurs[0].pseudo).toBe('Plus récent')
  })
  test('nouveau choix à la fin, nouvel accord sans rejouer les acquis', async () => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e2.json'))) b.changer('e3', (e) => { e.annotations[0].pseudo = 'Claire' }) }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 6 }); b.depot.avantCommit = () => {}
    const avant = b.lire('e1'); expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 7, entretiens: 3 }); expect(b.lire('e1')).toEqual(avant)
  })
  test('nouveau choix sur acquis : pas de second remplacement ni restauration', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); b.sessions.length = 0
    b.changer('e1', (e) => { e.annotations[0].pseudo = 'Claire' })
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow('nouveaux choix'); expect(commits(b)).toHaveLength(2)
  })
  test('cible retirée du corpus : retrait explicite dans le nouvel aperçu', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); b.sessions.length = 0
    b.changerCorpus((c) => { delete c.membership.e2; c.ordreEntretiens = c.ordreEntretiens.filter((id) => id !== 'e2') })
    const p = await b.service.preparerReprise(b.service.lireSuivi()!.operationId); expect(p.ciblesRetirees).toEqual(['e2'])
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', entretiens: 1 }); expect(b.lire('e2')).toEqual(b.sources[1].data)
  })
  test.each(['anonymise', 'exception'] as const)('ancien choix %s bloqué sous barrière, même inchangé ; autre variante autorisée', async (etat) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    const e = b.lire('e2'); e.annotations[0].etat = etat
    expect(() => verifierReferencesDefinitions(e, b.cp(), e)).toThrow('ancien choix')
    const restant = b.lire('e3'); expect(() => verifierReferencesDefinitions(restant, b.cp(), restant)).not.toThrow()
    expect(() => exigerAbsenceDissociationGitLab(b.cp())).toThrow('retrait de variante')
  })
  test('après retrait : nouvelle exception mémorisant l’ancienne variante refusée, historique inchangé conservé', async () => {
    const b = banc(); await appliquer(b); const avant = b.lire('e1'), e = structuredClone(avant)
    e.annotations.find((a) => a.id === 'a2')!.pseudo = 'Claire'
    expect(() => verifierReferencesDefinitions(e, b.cp(), avant)).toThrow('nouvelle exception')
    expect(() => verifierReferencesDefinitions(e, b.cp(), e)).not.toThrow()
  })
  test.each(['barriere', 'entretien', 'retrait'])('réponse acceptée perdue : %s, preuve sans second commit', async (phase) => {
    const b = banc(); b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && (phase === 'entretien' ? a.file_path.endsWith('/e1.json') : a.file_path.endsWith('/corpus.crp')
        && (phase === 'barriere' ? !!JSON.parse(a.content!).retraitVarianteAnon : JSON.parse(a.content!).reglesAnon.personne.pseudos.length === 1)))) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b); expect(r.statut).toBe('indetermine'); await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow()
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}; const s = new RetraitsVarianteAnonGitLab(b.options, () => [])
    await s.relireSuivi(r.operationId)
    if (phase === 'retrait') { expect(s.lireSuivi()).toBeNull(); await expect(s.preparerReprise(r.operationId)).rejects.toThrow('déjà retirée') }
    else expect(await reprendre(b, s)).toMatchObject({ statut: 'termine', annotations: 6 })
    expect(commits(b)).toHaveLength(4); expect(b.journal.lister()).toEqual([])
  })
  test('historique vide et original ne prouvent pas un refus, aucune libération ni répétition', async () => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) { b.depot.echouerApresAccepter(new Error('Perte')); b.depot.rendreCommitsIllisibles() } }
    const r = await appliquer(b); b.depot.avantCommit = () => {}; b.depot.rendreCommits()
    vi.spyOn(b.depot, 'rechercherCommits').mockResolvedValue([])
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('indéterminée'); expect(b.journal.lister()).toHaveLength(1); expect(commits(b)).toHaveLength(2)
  })
  test('transport incertain sans commit trouvé : original insuffisant, le publieur conserve l’intention', async () => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) throw new Error('Transport perdu avant réponse.') }
    const r = await appliquer(b); expect(r).toMatchObject({ statut: 'indetermine', annotations: 0 })
    expect(b.lire('e1')).toEqual(b.sources[0].data); expect(b.journal.lister()).toHaveLength(1); expect(commits(b)).toHaveLength(1)
    b.depot.avantCommit = () => {}; await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('indéterminée')
    expect(b.service.lireSuivi()?.statut).toBe('indetermine'); expect(b.journal.lister()).toHaveLength(1)
  })
  test('coordination neuve : reconnaissance sans libérer les droits persistants ni publier la suite', async () => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) { b.depot.echouerApresAccepter(new Error('Perte')); b.depot.rendreCommitsIllisibles() } }
    const r = await appliquer(b); b.depot.avantCommit = () => {}; b.depot.rendreCommits()
    const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'racine/corpus.crp')), avant = b.depot.fichiers.get(chemin)!.contenu
    const coordination = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 'neuve' }) })
    const publication = new PublieurGitLab({ branche: 'main', depot: b.depot, coordination, journal: b.journal, attendre: async () => {} })
    await reprendreOperationsGitLab({ depot: b.depot, coordination, journal: b.journal, dirMiroir: b.dir }); expect(b.journal.lister()).toHaveLength(1)
    const s = new RetraitsVarianteAnonGitLab({ ...b.options, coordination, publication }, () => [])
    expect(await s.relireSuivi(r.operationId)).toMatchObject({ statut: 'partiel', annotations: 3 })
    expect(b.depot.fichiers.get(chemin)!.contenu).toBe(avant); expect(await reprendre(b, s)).toMatchObject({ statut: 'partiel', annotations: 3 }); expect(commits(b)).toHaveLength(2)
  })
  test.each(['contenu', 'garde'])('journal commun altéré : %s ne prouve pas l’intention', async (cas) => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) { b.depot.echouerApresAccepter(new Error('Perte')); b.depot.rendreCommitsIllisibles() } }
    const r = await appliquer(b), entree = structuredClone(b.journal.lister()[0])
    if (cas === 'contenu') entree.actions.find((a) => a.file_path.endsWith('/e1.json'))!.contentSha256 = '0'.repeat(64)
    else entree.actions = entree.actions.filter((a) => a.file_path !== 'racine/corpus.crp')
    vi.spyOn(b.journal, 'lister').mockReturnValue([entree]); expect(b.service.publicationDuLotSeule()).toBe(false)
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('ne correspond pas'); expect(commits(b)).toHaveLength(2)
  })
  test('nouveau membre __proto__ explicitement consenti, sans modification du prototype', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); b.sessions.length = 0
    b.changerCorpus((c) => { Object.defineProperty(c.membership, '__proto__', { value: structuredClone(c.membership.e1), enumerable: true }); c.ordreEntretiens.push('__proto__') })
    b.depot.deposerHorsProtocole('racine/entretiens/__proto__.json', JSON.stringify(b.sources[0].data))
    const p = await b.service.preparerReprise(b.service.lireSuivi()!.operationId)
    expect(p.entretiens.find((e) => e.id === '__proto__')?.annotations).toBe(3)
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', annotations: 9, entretiens: 3 })
    const j = JSON.parse(readFileSync(fichier(b), 'utf8')); expect(Object.hasOwn(j.corpusAvant.membership, '__proto__')).toBe(true)
  })
  test('échec miroir : acquis durable, source actuelle installée, aucun candidat historique', async () => {
    const b = banc(), installer = vi.spyOn(b.store, 'installerEntretienDistant').mockImplementation(() => { throw new Error('Disque') })
    const r = await appliquer(b); expect(r).toMatchObject({ statut: 'partiel', entretiens: 1, miroirIncomplet: true })
    b.changer('e1', (e) => { e.locuteurs[0].pseudo = 'Actuel' }); installer.mockRestore()
    const s = new RetraitsVarianteAnonGitLab(b.options, () => []); await s.relireSuivi(r.operationId)
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).locuteurs[0].pseudo).toBe('Actuel'); expect(await reprendre(b, s)).toMatchObject({ statut: 'termine' })
  })
  test('finalisation acquise, miroir incomplet persistant : uniquement relecture', async () => {
    const b = banc(), installer = b.store.appliquerTransactionFichiers.bind(b.store)
    vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementation((p) => { if (p.corpusApres.reglesAnon.personne.pseudos.length === 1) throw new Error('Disque'); return installer(p) })
    const r = await appliquer(b); expect(r).toMatchObject({ statut: 'partiel', varianteRetiree: true, miroirIncomplet: true }); vi.restoreAllMocks()
    const s = new RetraitsVarianteAnonGitLab(b.options, () => []); expect(s.lireSuivi()).not.toBeNull()
    expect(await s.relireSuivi(r.operationId)).toMatchObject({ statut: 'termine' }); expect(s.lireSuivi()).toBeNull(); expect(commits(b)).toHaveLength(4)
  })
  test.each(['etat', 'memoire', 'repli', 'definition', 'progression', 'destination', 'miroir'])('journal altéré : %s', async (cas) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); const j = JSON.parse(readFileSync(fichier(b), 'utf8'))
    if (cas === 'etat') j.cibles[0].apres.annotations[2].etat = 'anonymise'
    if (cas === 'memoire') j.cibles[0].apres.definitionsAnonLocales = []
    if (cas === 'repli') j.demande.pseudoConserve = 'Autre'
    if (cas === 'definition') j.demande.regleAvant.categorie = 'Intrus'
    if (cas === 'progression') j.varianteRetiree = true
    if (cas === 'destination') j.destination = 'ailleurs'
    if (cas === 'miroir') delete j.miroirComplet
    writeFileSync(fichier(b), JSON.stringify(j)); expect(() => new RetraitsVarianteAnonGitLab(b.options, () => [])).toThrow('invalide')
  })
  test('course sur acquis à la finalisation : garde rejette, reprise garde la version indépendante actuelle', async () => {
    const b = banc(); b.depot.avantCommit = (actions) => { if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/corpus.crp') && JSON.parse(a.content!).reglesAnon.personne.pseudos.length === 1)) b.changer('e1', (e) => { e.locuteurs[0].pseudo = 'Concurrent' }) }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', varianteRetiree: false, annotations: 6 }); b.depot.avantCommit = () => {}
    expect(await reprendre(b)).toMatchObject({ statut: 'termine' }); expect(b.lire('e1').locuteurs[0].pseudo).toBe('Concurrent')
  })
  test('249 cibles finales refusées avant protection, pas un plafond de membres', async () => {
    const b = banc(249)
    for (const s of b.sources.slice(2)) b.changer(s.id, (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    const p = await b.preparer(); expect(p.applicationDisponible).toBe(false); await expect(b.service.appliquer(p.token, true)).rejects.toThrow('248'); expect(commits(b)).toHaveLength(0)
  })
  test('barrière canonique refusée si falsifiée ou simultanée', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); const c = b.cp()
    expect(lireBarriereRetraitVarianteAnon(c)).toMatchObject({ pseudoRetire: 'Claire', pseudoConserve: 'Rebecca' })
    c.retraitVarianteAnon!.pseudoConserve = 'Autre'; expect(() => lireBarriereRetraitVarianteAnon(c)).toThrow('invalide')
  })
  test('ouverture sans services de suivi refusée avant toute lecture réseau ou remplacement du miroir', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    const client = { resoudreBranche: vi.fn() }, avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
    await expect(preparerContexteGitLabLectureSeule({ id: 'destination', dirLocal: b.dir, branche: 'main', racine: 'racine', client: client as never })).rejects.toThrow('exige ses services GitLab')
    expect(client.resoudreBranche).not.toHaveBeenCalled(); expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant)
  })
})
