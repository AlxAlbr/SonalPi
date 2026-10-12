import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SuppressionsAnonGitLab } from '../../src/main/gitlab/suppressionsAnon'
import { DissociationsAnonGitLab } from '../../src/main/gitlab/dissociationsAnon'
import { inventorierRenommageAnon } from '../../src/shared/corpus/renommageAnon'
import { BailGitLab, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { verifierReferencesDefinitions, exigerAbsenceDissociationGitLab } from '../../src/main/gitlab/referencesDefinitions'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { lireBarriereSuppressionAnon } from '../../src/shared/corpus/barriereSuppressionAnon'
import { exigerAbsenceDissociationWebDAV, verifierBarriereDissociationWebDAV } from '../../src/shared/corpus/barriereDissociationWebDAV'
import { fixtureSuppressionAnonGitLab } from '../fixtures/suppressionAnonGitLab'
const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const banc = (n = 3) => fixtureSuppressionAnonGitLab(dossiers, n)
type Banc = ReturnType<typeof banc>
const commits = (b: Banc) => b.depot.commits.filter((c) => c.message.startsWith('Sonal suppression-anon-'))
const appliquer = async (b: Banc) => b.service.appliquer((await b.preparer()).token, true)
const reprendre = async (b: Banc, s = b.service) => s.appliquer((await s.preparerReprise(s.lireSuivi()!.operationId)).token, true)
const fichierJournal = (b: Banc) => join(b.dir, '.suppression-anon-gitlab.json')

describe('suppression GitLab — moteur non activé dans l’application', () => {
  test('serveur et non miroir ; retrait exact, texte et mémoire indépendants préservés', async () => {
    const b = banc(), a = await b.preparer()
    expect(a.regle.pseudos).toEqual(['Claire', 'Rebecca']); expect(a.bilan.annotations).toBe(8)
    a.regle.pseudos = ['Forgerie']; a.entretiens.length = 0
    expect(await b.service.appliquer(a.token, true)).toMatchObject({ statut: 'termine', annotations: 8, anonymisees: 6, exceptions: 2, entretiens: 2, regleRetiree: true })
    expect(commits(b).map((c) => c.actions.length)).toEqual([2, 4, 4, 4])
    expect(b.cp().reglesAnon.personne).toBeUndefined(); expect(b.cp().suppressionAnon).toBeUndefined()
    for (const source of b.sources.slice(0, 2)) {
      const attendu = structuredClone(source.data)
      attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne')
      attendu.lastModified = b.lire(source.id).lastModified
      expect(b.lire(source.id)).toEqual(attendu)
    }
    expect(b.lire('e3')).toEqual(b.sources[2].data)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toContain('miroir-périmé')
    expect(commits(b).flatMap((c) => c.actions).some((a) => a.file_path.includes('e3.json'))).toBe(false)
    expect(statSync(fichierJournal(b)).mode & 0o777).toBe(0o600); expect(b.service.lireSuivi()).toBeNull()
  })
  test('choix indépendant inclus révélé sans être recréé ni modifié', async () => {
    const b = banc()
    const decision = { ...b.sources[0].data.annotations[0], id: 'independante-cachee', from: 2, to: 6, pseudo: 'Choix indépendant', etat: 'exception' as const }
    delete decision.regle
    b.changer('e1', (e) => { e.annotations.push(decision) })
    expect(await appliquer(b)).toMatchObject({ statut: 'termine', inclusesRevelees: 1 })
    expect(b.lire('e1').annotations.find((a) => a.id === decision.id)).toEqual(decision)
    expect(b.lire('e1').corpsTexte).toEqual(b.sources[0].data.corpsTexte)
  })
  test('mémoire indépendante recouvrante conservée, sans transfert ni fusion', async () => {
    const b = banc()
    b.changer('e1', (e) => { e.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Indépendant'], etat: 'declaration' }) })
    const memoire = b.lire('e1').definitionsAnonLocales
    expect(await appliquer(b)).toMatchObject({ statut: 'termine' })
    expect(b.lire('e1').definitionsAnonLocales).toEqual(memoire)
  })
  test('300 membres et seulement deux cibles : aucun plafond de membres ni baux non ciblés', async () => {
    const b = banc(300); b.sessions.push('e3')
    expect(await appliquer(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
    expect(commits(b)).toHaveLength(4); expect(b.sessions).toEqual(['e3'])
    expect(b.depot.commits.some((c) => c.actions.some((a) => a.file_path.includes('entretiens/e3.json')))).toBe(false)
  })
  test('règle inutilisée : aucun entretien ni mémoire modifiés', async () => {
    const b = banc(), p = await b.service.preparer({ regleId: 'vide' })
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', entretiens: 0, annotations: 0 })
    expect(commits(b)).toHaveLength(2); expect(b.lire('e1')).toEqual(b.sources[0].data)
  })
  test.each(['consentement', 'expiration', 'autre-instance'])('token privé sans autorité publique : %s', async (cas) => {
    const b = banc(), p = await b.preparer()
    if (cas === 'expiration') b.expirer()
    const s = cas === 'autre-instance' ? new SuppressionsAnonGitLab(b.options, () => []) : b.service
    await expect(s.appliquer(p.token, cas !== 'consentement')).rejects.toThrow()
    if (s === b.service) await expect(s.appliquer(p.token, true)).rejects.toThrow('expiré')
    expect(commits(b)).toHaveLength(0)
  })
  test('trois aperçus maximum ; aucune écriture de préparation', async () => {
    const b = banc(), p = await b.preparer(); await b.preparer(); await b.preparer(); await b.preparer()
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré'); expect(b.depot.commits).toEqual([])
  })
  test('expiration pendant l’attente de la file : aucun envoi', async () => {
    const b = banc(), p = await b.preparer()
    let liberer!: () => void
    const attente = b.options.file.executer(() => new Promise<void>((resolve) => { liberer = resolve }))
    await Promise.resolve()
    const application = b.service.appliquer(p.token, true)
    b.expirer(); liberer(); await attente
    await expect(application).rejects.toThrow('expiré'); expect(commits(b)).toHaveLength(0)
  })
  test('corpus changé avant application : aucun changement publié', async () => {
    const b = banc(), p = await b.preparer(); b.changerCorpus((c) => { c.titre = 'Concurrent' })
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('corpus a changé')
    expect(commits(b)).toHaveLength(0)
  })
  test('nouveaux liens avant application : aucun élargissement du consentement', async () => {
    const b = banc(), p = await b.preparer(); b.changer('e3', (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('nouveaux usages')
    expect(b.cp().suppressionAnon).toBeUndefined()
  })
  test('session locale ou récupérable ciblée : différée ; non-cible conservée', async () => {
    const b = banc(); b.sessions.push('corpus:e2', 'e3')
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false, differes: [{ id: 'e2' }] })
    expect(b.service.cibleProtegee('e2')).toBe(true); expect(b.service.cibleProtegee('e3')).toBe(false)
    b.sessions.splice(0, 1)
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 8 }); expect(b.sessions).toEqual(['e3'])
  })
  test('bail du second compte : aucun vol ni retrait prématuré', async () => {
    const b = banc(), bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 's2' }) })
    const bail = await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e2.json'))
    expect(bail.ok).toBe(true); expect(await appliquer(b)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(b.cp().reglesAnon.personne).toBeDefined()
    if (bail.ok) await bob.liberer(bail.droit)
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 })
  })
  test('cible modifiée : aucun écrasement ; nouvelle préparation conserve l’édition', async () => {
    const b = banc(), p = await b.preparer(); b.changer('e2', (e) => { e.locuteurs[0].pseudo = 'Concurrent' })
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(b.lire('e2').locuteurs[0].pseudo).toBe('Concurrent')
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', entretiens: 2 }); expect(b.lire('e2').locuteurs[0].pseudo).toBe('Concurrent')
  })
  test('nouveau lien en fin de lot : règle conservée, nouveau consentement requis', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e2.json'))) b.changer('e3', (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 8 })
    b.depot.avantCommit = () => {}
    expect(await reprendre(b)).toMatchObject({ statut: 'termine', annotations: 12, entretiens: 3 }); expect(commits(b)).toHaveLength(5)
  })
  test('nouveau membre nommé __proto__ : identité conservée, sans modification du prototype', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); b.sessions.length = 0
    b.changerCorpus((c) => {
      Object.defineProperty(c.membership, '__proto__', { value: structuredClone(c.membership.e1), enumerable: true })
      c.ordreEntretiens.push('__proto__')
    })
    b.depot.deposerHorsProtocole('racine/entretiens/__proto__.json', JSON.stringify(b.sources[0].data))
    const p = await b.service.preparerReprise(b.service.lireSuivi()!.operationId)
    expect(p.entretiens.find((e) => e.id === '__proto__')?.annotations).toBe(4)
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', entretiens: 3 })
    const j = JSON.parse(readFileSync(fichierJournal(b), 'utf8'))
    expect(Object.hasOwn(j.corpusAvant.membership, '__proto__')).toBe(true)
    expect(j.cibles.find((c: { id: string }) => c.id === '__proto__').apres.annotations.some((a: { regle?: string }) => a.regle === 'personne')).toBe(false)
  })
  test('nouveaux liens dans un acquis : aucun second retrait implicite', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    b.changer('e1', (e) => { e.annotations.push({ ...b.sources[0].data.annotations[0], id: 'reapparu' }) }); b.sessions.length = 0
    await expect(b.service.preparerReprise(b.service.lireSuivi()!.operationId)).rejects.toThrow('nouveaux liens')
    expect(commits(b)).toHaveLength(2)
  })
  test('cible retirée du corpus : retrait explicite du lot, fichier laissé intact', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b); b.sessions.length = 0
    b.changerCorpus((c) => { delete c.membership.e2 })
    const p = await b.service.preparerReprise(b.service.lireSuivi()!.operationId)
    expect(p.ciblesRetirees).toEqual(['e2']); expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(b.lire('e2')).toEqual(b.sources[1].data)
  })
  test.each(['barriere', 'entretien', 'retrait'])('intention durable avant transport (%s), aucun succès inventé', async (phase) => {
    const b = banc(), publier = b.publication.publierSousDroits.bind(b.publication)
    vi.spyOn(b.publication, 'publierSousDroits').mockImplementation(async (p, d) => {
      const a = p.actions.find((a) => a.action === 'update')!, data = 'contenu' in a ? JSON.parse(a.contenu) : null
      if (phase === 'entretien' ? a.chemin.endsWith('/e2.json') : a.chemin.endsWith('/corpus.json') && (phase === 'barriere' ? !!data.suppressionAnon : !data.reglesAnon.personne)) throw new Error('Arrêt avant transport')
      return publier(p, d)
    })
    const r = await appliquer(b); expect(r.statut).toBe('indetermine'); expect(b.journal.lister()).toEqual([])
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('Relisez')
    vi.restoreAllMocks()
    const s = new SuppressionsAnonGitLab(b.options, () => [])
    expect((await s.relireSuivi(r.operationId)).statut).toBe('partiel')
    expect(await reprendre(b, s)).toMatchObject({ statut: 'termine' }); expect(commits(b)).toHaveLength(4)
  })
  test.each(['barriere', 'entretien', 'retrait'])('réponse acceptée perdue (%s) : preuve exacte sans second commit', async (phase) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && (phase === 'entretien' ? a.file_path.endsWith('/e1.json')
        : a.file_path.endsWith('/corpus.json') && (phase === 'barriere' ? !!JSON.parse(a.content!).suppressionAnon : !JSON.parse(a.content!).reglesAnon.personne)))) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b); expect(r.statut).toBe('indetermine')
    expect(b.journal.lister()[0].droits).toHaveLength(phase === 'entretien' ? 2 : 1)
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow()
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    const s = new SuppressionsAnonGitLab(b.options, () => [])
    await s.relireSuivi(r.operationId)
    if (phase === 'retrait') {
      expect(s.lireSuivi()).toBeNull(); await expect(s.preparerReprise(r.operationId)).rejects.toThrow('déjà retirée')
    } else expect(await reprendre(b, s)).toMatchObject({ statut: 'termine', annotations: 8 })
    expect(commits(b)).toHaveLength(4); expect(b.journal.lister()).toEqual([])
  })
  test('nouvelle coordination sans droit connu : reconnaissance sans libérer les baux persistants', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b); b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'racine/corpus.json'))
    const avant = b.depot.fichiers.get(chemin)!.contenu
    const coordination = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 'nouvelle' }) })
    const publication = new PublieurGitLab({ branche: 'main', depot: b.depot, coordination, journal: b.journal, attendre: async () => {} })
    await reprendreOperationsGitLab({ depot: b.depot, coordination, journal: b.journal, dirMiroir: b.dir })
    expect(b.journal.lister()).toHaveLength(1)
    expect(b.depot.fichiers.get(chemin)!.contenu).toBe(avant)
    const s = new SuppressionsAnonGitLab({ ...b.options, coordination, publication }, () => [])
    expect(await s.relireSuivi(r.operationId)).toMatchObject({ statut: 'partiel', annotations: 4 })
    expect(b.depot.fichiers.get(chemin)!.contenu).toBe(avant)
    expect(await reprendre(b, s)).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false })
    expect(commits(b)).toHaveLength(2)
  })
  test.each(['contenu', 'garde'])('publication de même identifiant mais intention incompatible : %s', async (cas) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    const r = await appliquer(b), entree = structuredClone(b.journal.lister()[0])
    if (cas === 'contenu') entree.actions.find((a) => a.file_path.endsWith('/e1.json'))!.contentSha256 = '0'.repeat(64)
    else entree.actions = entree.actions.filter((a) => a.file_path !== 'racine/corpus.json')
    vi.spyOn(b.journal, 'lister').mockReturnValue([entree])
    expect(b.service.publicationDuLotSeule()).toBe(false)
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('ne correspond pas')
    expect(b.service.lireSuivi()?.statut).toBe('indetermine'); expect(commits(b)).toHaveLength(2)
  })
  test('miroir défaillant : compte acquis durable, relecture installe la source actuelle sans rejouer', async () => {
    const b = banc(), installer = vi.spyOn(b.store, 'installerEntretienDistant').mockImplementation(() => { throw new Error('Disque') })
    const r = await appliquer(b); expect(r).toMatchObject({ statut: 'partiel', entretiens: 1 }); expect(commits(b)).toHaveLength(2)
    b.changer('e1', (e) => { e.locuteurs[0].pseudo = 'Plus récent' }); installer.mockRestore()
    const s = new SuppressionsAnonGitLab(b.options, () => [])
    await expect(s.preparerReprise(r.operationId)).rejects.toThrow('miroir')
    await s.relireSuivi(r.operationId)
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).locuteurs[0].pseudo).toBe('Plus récent')
    expect(await reprendre(b, s)).toMatchObject({ statut: 'termine' }); expect(commits(b)).toHaveLength(4)
  })
  test('retrait logique acquis mais miroir défaillant : suivi persistant, uniquement relecture', async () => {
    const b = banc(), installer = b.store.appliquerTransactionFichiers.bind(b.store)
    vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementation((plan) => {
      if (!plan.corpusApres.reglesAnon.personne) throw new Error('Disque')
      return installer(plan)
    })
    const r = await appliquer(b); expect(r).toMatchObject({ statut: 'partiel', regleRetiree: true, annotations: 8 })
    expect(b.service.lireSuivi()).not.toBeNull(); expect(commits(b)).toHaveLength(4)
    vi.restoreAllMocks()
    const s = new SuppressionsAnonGitLab(b.options, () => [])
    expect(s.lireSuivi()).not.toBeNull()
    expect(await s.relireSuivi(r.operationId)).toMatchObject({ statut: 'termine' }); expect(s.lireSuivi()).toBeNull(); expect(commits(b)).toHaveLength(4)
  })
  test.each(['retrait-independant', 'memoire', 'progression', 'miroir', 'destination'])('journal altéré : %s', async (cas) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    const j = JSON.parse(readFileSync(fichierJournal(b), 'utf8'))
    if (cas === 'retrait-independant') j.cibles[0].apres.annotations = []
    else if (cas === 'memoire') j.cibles[0].apres.definitionsAnonLocales = []
    else if (cas === 'progression') j.regleRetiree = true
    else if (cas === 'miroir') delete j.miroirComplet
    else j.destination = 'autre'
    writeFileSync(fichierJournal(b), JSON.stringify(j))
    expect(() => new SuppressionsAnonGitLab(b.options, () => [])).toThrow('invalide'); expect(commits(b)).toHaveLength(2)
  })
  test('acquis modifié pendant le transport final : version gardée, puis reprise sans restaurer les choix', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path.endsWith('/corpus.json') && a.action === 'update' && !JSON.parse(a.content!).reglesAnon.personne)) b.changer('e1', (e) => { e.locuteurs[0].pseudo = 'Concurrent' })
    }
    expect(await appliquer(b)).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: false })
    expect(commits(b)).toHaveLength(3); b.depot.avantCommit = () => {}
    expect(await reprendre(b)).toMatchObject({ statut: 'termine' }); expect(b.lire('e1').locuteurs[0].pseudo).toBe('Concurrent')
  })
  test('249 cibles : refus avant tout commit, jamais de découpage implicite', async () => {
    const b = banc(249)
    for (const s of b.sources.slice(2)) b.changer(s.id, (e) => { e.annotations = structuredClone(b.sources[0].data.annotations) })
    const p = await b.preparer(); expect(p.applicationDisponible).toBe(false); expect(p.motifIndisponible).toContain('248')
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('248'); expect(commits(b)).toHaveLength(0)
  })
  test('anciens liens même inchangés refusés ; non-cibles et choix indépendants autorisés', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    expect(() => verifierReferencesDefinitions(b.lire('e2'), b.cp(), b.lire('e2'))).toThrow('suppression')
    expect(() => verifierReferencesDefinitions(b.lire('e1'), b.cp(), b.sources[0].data)).not.toThrow()
    expect(() => verifierReferencesDefinitions(b.lire('e3'), b.cp(), b.lire('e3'))).not.toThrow()
    expect(() => exigerAbsenceDissociationGitLab(b.cp())).toThrow('suppression')
    expect(() => exigerAbsenceDissociationWebDAV(b.cp())).toThrow('suppression')
    expect(() => verifierBarriereDissociationWebDAV(b.cp(), b.lire('e2'), 'e2')).toThrow('suppression')
  })
  test.each(['operation', 'regle', 'coexistence', 'format'])('protection publiée invalide : %s', async (cas) => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    const c = b.cp()
    if (cas === 'operation') c.suppressionAnon!.operationId = 'faux'
    else if (cas === 'regle') c.suppressionAnon!.regleId = 'absente'
    else if (cas === 'coexistence') c.dissociationAnon = { operationId: 'dissociation-x', regleId: 'personne' }
    else c.formatVersion--
    expect(() => lireBarriereSuppressionAnon(c)).toThrow('invalide')
    expect(() => verifierReferencesDefinitions(b.lire('e3'), c)).toThrow('invalide')
  })
  test('aucune dissociation ou aucun renommage concurrent pendant une suppression', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    await expect(new DissociationsAnonGitLab(b.options, () => []).preparer(b.demande)).rejects.toThrow('suppression')
    expect(() => inventorierRenommageAnon(b.cp(), b.sources, { regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Alice' })).toThrow('suppression')
  })
  test('journal invalide à la réouverture : refus avant toute lecture réseau', async () => {
    const b = banc(); b.sessions.push('e2'); await appliquer(b)
    writeFileSync(fichierJournal(b), '{invalide')
    b.depot.lectures.clear()
    await expect(preparerContexteGitLabLectureSeule({ id: 'destination', client: b.depot, branche: 'main', racine: 'racine', dirLocal: b.dir })).rejects.toThrow('journal de suppression')
    expect(b.depot.lectures.size).toBe(0)
    expect(readFileSync(join(b.dir, 'entretiens/e2.json'), 'utf8')).toContain('miroir-périmé')
  })
})
