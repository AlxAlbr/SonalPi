// @vitest-environment happy-dom
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoffreComptes } from '../../src/main/distant/coffre'
import { ClientGitLab, autorisationJetonPersonnel } from '../../src/main/gitlab/client'
import type { ServiceAuthentificationGitLab } from '../../src/main/gitlab/authentification'
import { ServiceMigrationGitLab } from '../../src/main/gitlab/migration'
import { SuiviDurableMigrationGitLab } from '../../src/main/gitlab/suiviMigration'
import { CorpusStore } from '../../src/main/corpusStore'
import { convertirEntretienMigrationGitLab } from '../../src/renderer/formatSonal/migrationGitLab'
import { CONNEXION_MIGRATION_GITLAB_REQUISE } from '../../src/shared/corpus/migrationGitLab'
import type { OuvertureDistante } from '../../src/shared/distant'
import { DepotMemoire } from './depotMemoire'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const SHA_SOURCE = 'a'.repeat(40)
const INSTANCE = 'https://gitlab.example.org'
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const blob = (b: Buffer) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
const json = (o: unknown) => new Response(JSON.stringify(o))
const sonal = readFileSync('test/fixtures/entretien1.sonal', 'utf8')
const parseur = (s: string) => new DOMParser().parseFromString(s.replace(/<link\b[^>]*>/gi, ''), 'text/html')

async function bancSimule(brancheVide: string | null = null, avecDocuments = false) {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-service-migration-')); dirs.push(dir)
  const media = Buffer.alloc(1024 * 1024, 29)
  const source = new Map([
    ['terrain.crp', Buffer.from(JSON.stringify({ nom: 'Terrain', tabEnt: [{ id: 1, nom: 'Premier', rtrPath: 'premier.Sonal', audioPath: 'voix.mp3' }] }))],
    ['premier.Sonal', Buffer.from(sonal)],
    ['voix.mp3', Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${sha(media)}\nsize ${media.length}\n`)],
  ])
  if (avecDocuments) {
    source.set('terrain.lexaf.json', Buffer.from('{"ancienResultat":true}'))
    source.set('documents/rapport.bin', Buffer.from([0, 255, 3, 2, 1]))
    source.set('credentials.enc', Buffer.from('ACCES_SYNTHETIQUE_NE_PAS_COPIER'))
  }
  const cible = new DepotMemoire()
  const objets = new Map<string, Buffer>()
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input)); const route = decodeURIComponent(u.pathname)
    const match = /^\/api\/v4\/projects\/(groupe\/source|groupe\/cible|1|2)(?:\/(.*))?$/.exec(route)
    if (!match) throw new Error(`Requête inattendue : ${route}`)
    const id = ['1', 'groupe/source'].includes(match[1]) ? 1 : 2
    const suffixe = match[2] ?? ''
    const vide = id === 2 && !cible.fichiers.size && !cible.commits.length
    if (!suffixe) return json({ id, name: id === 1 ? 'Source' : 'Cible', archived: false, empty_repo: vide, default_branch: vide ? brancheVide : 'main' })
    if (suffixe === 'repository/branches') return json(vide ? [] : [{ name: 'main' }])
    if (suffixe === 'repository/branches/main') return vide ? new Response(null, { status: 404 }) : json({ commit: { id: id === 1 ? SHA_SOURCE : await cible.resoudreTete('main') } })
    if (suffixe === 'repository/commits') {
      if (init?.method === 'POST') {
        expect(id).toBe(2)
        const body = JSON.parse(String(init.body))
        return json(await cible.publierCommit(body.branch, body.commit_message, body.actions))
      }
      return json(await cible.rechercherCommits('main', u.searchParams.get('search') ?? ''))
    }
    const fichiers = id === 1 ? source : new Map([...cible.fichiers].map(([p, f]) => [p, Buffer.from(f.contenu)]))
    if (suffixe === 'repository/tree') {
      const parent = u.searchParams.get('path') ?? ''; const prefixe = parent ? `${parent}/` : ''
      const enfants = new Map<string, boolean>()
      for (const p of fichiers.keys()) if (p.startsWith(prefixe)) { const relatif = p.slice(prefixe.length); enfants.set(relatif.split('/')[0], relatif.includes('/')) }
      return json([...enfants].map(([nom, dossier]) => ({ id: dossier ? 'b'.repeat(40) : blob(fichiers.get(`${prefixe}${nom}`)!), name: nom, path: `${prefixe}${nom}`, type: dossier ? 'tree' : 'blob', mode: dossier ? '040000' : '100644' })))
    }
    if (suffixe.startsWith('repository/files/')) {
      const raw = suffixe.endsWith('/raw'); const chemin = suffixe.slice('repository/files/'.length, raw ? -4 : undefined)
      const contenu = fichiers.get(chemin)
      if (!contenu) return new Response(null, { status: 404 })
      if (id === 1) expect(u.searchParams.get('ref')).toBe(SHA_SOURCE)
      const commit = id === 1 ? SHA_SOURCE : cible.fichiers.get(chemin)!.commitId
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'X-Gitlab-Size': String(contenu.length), 'X-Gitlab-Content-Sha256': sha(contenu), 'X-Gitlab-Last-Commit-Id': commit, 'X-Gitlab-Execute-Filemode': 'false' } })
      if (raw) return new Response(id === 1 && chemin === 'voix.mp3' && u.searchParams.get('lfs') === 'true' ? media : contenu)
      return json({ file_path: chemin, content: contenu.toString('base64'), encoding: 'base64', last_commit_id: commit, execute_filemode: false })
    }
    throw new Error(`Requête inattendue : ${suffixe}`)
  })
  const coffre = new CoffreComptes(join(dir, 'comptes.json'), { disponible: () => false, chiffre: (s) => s, dechiffre: (s) => s })
  const compte = coffre.enregistrerCompteGitLab({ urlInstance: INSTANCE, utilisateur: 'moi', credential: {
    accessToken: 'credential-secret-test', refreshToken: 'refresh-secret-test', expiresAt: Date.now() + 3600_000, scopes: ['api'], rotationneeLe: new Date().toISOString(),
  } })
  const downloadLfs = vi.fn(async (identite, fichier: string) => {
    expect(identite.sha256).toBe(sha(media)); mkdirSync(dirname(fichier), { recursive: true }); writeFileSync(fichier, media)
  })
  const uploadLfs = vi.fn(async (fichier: string, identite) => { objets.set(identite.sha256, readFileSync(fichier)) })
  const confirmerLfs = vi.fn(async (identite) => { expect(sha(objets.get(identite.sha256)!)).toBe(identite.sha256) })
  const auth = {
    comptePublic: () => ({ urlInstance: INSTANCE, utilisateur: 'moi' }),
    client: async (_compte: string, projetId?: number) => new ClientGitLab({ urlInstance: INSTANCE, projetId, autorisation: autorisationJetonPersonnel('credential-secret-test') }, fetchImpl),
    clientLfs: async (_compte: string, id: number) => id === 1 ? { telechargerObjet: downloadLfs } : { televerserObjet: uploadLfs, confirmerObjet: confirmerLfs },
  } as unknown as ServiceAuthentificationGitLab
  const ouvrir = vi.fn(async () => {
    const miroir = join(dir, 'miroir')
    for (const [p, f] of cible.fichiers) if (p.endsWith('.json') && !p.startsWith('.sonal/')) {
      mkdirSync(dirname(join(miroir, p)), { recursive: true }); writeFileSync(join(miroir, p), f.contenu)
    }
    const corpus = new CorpusStore(miroir).ouvrir()
    return { dir: miroir, nom: corpus.nom, corpus, distant: { fournisseur: 'gitlab' } } as OuvertureDistante
  })
  const nouveauService = (sessionId: string) => new ServiceMigrationGitLab({ authentification: auth, coffre, dirProfil: dir,
    identite: { machineId: 'poste', sessionId }, ouvrir, autoriserEnvoi: true })
  const service = nouveauService('session-initiale')
  const decouverte = await service.decouvrir({ compteId: compte.id, urlProjet: `${INSTANCE}/groupe/source` })
  const preparer = () => service.preparer({ preparationId: decouverte.preparationId, cheminCrp: 'terrain.crp', cible: { compteId: compte.id, urlProjet: `${INSTANCE}/groupe/cible` } })
  const bilan = await preparer()
  service.ajouterConversion(bilan.bilanId, 0, convertirEntretienMigrationGitLab(await service.preparation.lireEntretien(bilan.preparationId, 0), parseur))
  return { dir, service, nouveauService, preparer, bilan, cible, source, objets, coffre, ouvrir, downloadLfs, uploadLfs, confirmerLfs, fetchImpl }
}

describe('raccordements de migration avec API GitLab simulée', () => {
  it('conserve les résultats et inconnus dans Autres, confirme les objets et ne reprend pas les accès', async () => {
    const f = await bancSimule(null, true)
    expect(f.bilan.conservation?.autres.map((p) => p.cheminDestination)).toEqual(['Autres/documents/rapport.bin', 'Autres/terrain.lexaf.json'])
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('terminee')
    expect(f.service.listerSuivis()[0].autresConfirmes).toBe(2)
    for (const fichier of f.bilan.conservation!.autres) {
      expect(f.objets.get(fichier.sha256)).toEqual(f.source.get(fichier.cheminSource))
      expect(f.cible.fichiers.get(fichier.cheminDestination)?.contenu).toContain(`oid sha256:${fichier.sha256}`)
    }
    expect(f.cible.fichiers.has('Autres/credentials.enc')).toBe(false)
    expect(f.cible.fichiers.get('Autres/.gitattributes')?.contenu).toContain('filter=lfs')
    const commits = f.cible.commits.length
    f.source.clear()
    expect((await f.nouveauService('autre-session').reprendre(`migration-${f.bilan.bilanId}`, true)).etat).toBe('terminee')
    expect(f.cible.commits).toHaveLength(commits)
    expect(f.uploadLfs).toHaveBeenCalledTimes(3)
  })

  it('reprend une copie de document échouée depuis les octets conservés sans source accessible', async () => {
    const f = await bancSimule(null, true)
    const upload = f.uploadLfs.getMockImplementation()!
    const dernier = f.bilan.conservation!.autres.at(-1)!
    let panne = true
    f.uploadLfs.mockImplementation(async (fichier, identite) => {
      if (panne && identite.sha256 === dernier.sha256) { panne = false; throw new Error('Copie interrompue') }
      return upload(fichier, identite)
    })
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('interrompue')
    expect(f.service.listerSuivis()[0].autresConfirmes).toBe(1)
    expect(f.cible.fichiers.has('corpus.json')).toBe(false)
    f.source.clear()
    expect((await f.nouveauService('reprise').reprendre(`migration-${f.bilan.bilanId}`, true)).etat).toBe('terminee')
    expect(f.service.listerSuivis()[0].autresConfirmes).toBe(2)
    expect(f.ouvrir).toHaveBeenCalledOnce()
  })

  it.each(['chemin', 'confirmation', 'empreinte'])('refuse un suivi documentaire altéré (%s)', async (cas) => {
    const f = await bancSimule(null, true)
    f.uploadLfs.mockRejectedValueOnce(new Error('Arrêt synthétique'))
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('interrompue')
    const suivi = new SuiviDurableMigrationGitLab(join(f.dir, 'migrations-gitlab', `migration-${f.bilan.bilanId}`))
    const etat = suivi.lire()!
    if (cas === 'chemin') etat.bilan.conservation!.autres[0].cheminDestination = '../ailleurs.bin'
    else if (cas === 'confirmation') etat.autresConfirmes = ['Autres/invente.bin']
    else etat.bilan.conservation!.autres[0].sha256 = 'invalide'
    writeFileSync(suivi.fichier, JSON.stringify(etat))
    await expect(f.service.reprendre(etat.operationId, true)).rejects.toThrow('illisible')
    expect(f.cible.commits).toHaveLength(0)
  })

  it.each(['main', 'master'])('initialise le dépôt vide même si GitLab annonce déjà %s', async (branche) => {
    const f = await bancSimule(branche)
    expect(f.bilan.cible.branche).toBeNull()
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('terminee')
    expect(f.service.listerSuivis()[0].bilan.cible.branche).toBeNull()
    expect(f.coffre.listerDestinationsGitLab()[0].branche).toBe('main')
  })

  it('réutilise une destination du coffre pour préparer la source, sans l’ouvrir ni y écrire', async () => {
    const f = await bancSimule()
    const destination = f.coffre.enregistrerDestinationGitLab({ compteId: f.bilan.source.compteId,
      projetId: 1, nomProjet: 'Source', branche: 'main', racine: '' })
    f.fetchImpl.mockClear()
    const source = await f.service.decouvrir({ destinationId: destination.id })
    expect(source.projet.compteId).toBe(f.bilan.source.compteId)
    expect(source.commit).toBe(SHA_SOURCE)
    expect(source.corpus).toEqual(['terrain.crp'])
    expect(f.fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
    expect(f.ouvrir).not.toHaveBeenCalled()
    expect(f.downloadLfs).not.toHaveBeenCalled()
    expect(f.uploadLfs).not.toHaveBeenCalled()
    expect(f.cible.commits).toHaveLength(0)
  })

  it.each([401, 403])('ne propose la reconnexion qu’en cas de credential refusé (HTTP %s)', async (statut) => {
    const f = await bancSimule()
    f.fetchImpl.mockImplementationOnce(async () => new Response(null, { status: statut }))
    const erreur = await f.service.decouvrir({ compteId: f.bilan.source.compteId, urlProjet: `${INSTANCE}/groupe/source` }).catch((e) => e)
    if (statut === 401) expect(erreur.message).toBe(CONNEXION_MIGRATION_GITLAB_REQUISE)
    else expect(erreur.message).not.toContain(CONNEXION_MIGRATION_GITLAB_REQUISE)
    expect(f.ouvrir).not.toHaveBeenCalled()
    expect(f.cible.commits).toHaveLength(0)
  })

  it('transmet l’arrêt à l’ouverture en cours puis reprend sans copier ni republier', async () => {
    const f = await bancSimule()
    let terminer!: () => void
    const attente = new Promise<void>((resolve) => { terminer = resolve })
    let signalRecu: AbortSignal | undefined
    const ouvrir = f.ouvrir.getMockImplementation()!
    f.ouvrir.mockImplementationOnce(async (...argumentsOuverture: unknown[]) => {
      signalRecu = argumentsOuverture[1] as AbortSignal
      await attente
      signalRecu.throwIfAborted()
      return ouvrir()
    })
    const operationId = `migration-${f.bilan.bilanId}`
    const execution = f.service.executer(f.bilan.bilanId, true)
    await vi.waitFor(() => expect(signalRecu).toBeDefined())
    const commits = f.cible.commits.length
    f.service.annuler(operationId)
    expect(signalRecu?.aborted).toBe(true)
    terminer()
    expect((await execution).etat).toBe('interrompue')
    expect(f.service.listerSuivis()[0].phase).toBe('ouverture')
    expect((await f.service.reprendre(operationId, true)).etat).toBe('terminee')
    expect(f.cible.commits).toHaveLength(commits)
    expect(f.downloadLfs).toHaveBeenCalledOnce()
    expect(f.uploadLfs).toHaveBeenCalledOnce()
  })

  it('un arrêt tardif après réussite ne bloque pas la réouverture suivante', async () => {
    const f = await bancSimule()
    const operationId = `migration-${f.bilan.bilanId}`
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('terminee')
    const commits = f.cible.commits.length
    f.service.annuler(operationId)
    expect((await f.service.reprendre(operationId, true)).etat).toBe('terminee')
    expect(f.ouvrir).toHaveBeenCalledTimes(2)
    expect(f.cible.commits).toHaveLength(commits)
    expect(f.uploadLfs).toHaveBeenCalledOnce()
  })

  it('utilise les vrais clients de documents, le coffre et le contenu média LFS, sans écrire à la source', async () => {
    const f = await bancSimule()
    const avant = [...f.source].map(([p, b]) => [p, sha(b)])
    expect(f.bilan.cible.branche).toBeNull()
    expect(f.bilan.medias[0].stockageSource).toBe('lfs')
    expect(f.uploadLfs).not.toHaveBeenCalled()
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('terminee')
    expect(f.downloadLfs).toHaveBeenCalledOnce()
    expect(f.uploadLfs).toHaveBeenCalledOnce()
    expect(f.confirmerLfs).toHaveBeenCalledOnce()
    expect([...f.source].map(([p, b]) => [p, sha(b)])).toEqual(avant)
    expect(f.coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(f.coffre.listerDestinationsGitLab()[0].branche).toBe('main')
    expect(f.service.listerSuivis()[0].phase).toBe('terminee')
    expect([...f.cible.fichiers.values()].every((v) => !v.contenu.includes('credential-secret-test') && !v.contenu.includes('refresh-secret-test'))).toBe(true)
    expect(f.ouvrir).toHaveBeenCalledOnce()
  })

  it('reprend sur une nouvelle session à partir des conversions et octets conservés, sans source encore accessible', async () => {
    const f = await bancSimule()
    f.uploadLfs.mockImplementationOnce(async (fichier, identite) => {
      f.objets.set(identite.sha256, readFileSync(fichier)); f.service.annuler(`migration-${f.bilan.bilanId}`)
    })
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('interrompue')
    expect(f.cible.commits).toHaveLength(0)
    f.source.clear()
    const nouveau = f.nouveauService('nouvelle-session')
    expect((await nouveau.reprendre(`migration-${f.bilan.bilanId}`, true)).etat).toBe('terminee')
    expect(f.downloadLfs).toHaveBeenCalledOnce()
    expect(f.ouvrir).toHaveBeenCalledOnce()
    expect(nouveau.listerSuivis()[0].phase).toBe('terminee')
  })

  it('une nouvelle session ne reprend pas une opération dont le droit précédent est encore actif', async () => {
    const f = await bancSimule()
    f.cible.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path === 'corpus.json')) {
        f.cible.echouerApresAccepter(new Error('réponse perdue'))
        f.cible.rendreCommitsIllisibles()
      }
    }
    expect((await f.service.executer(f.bilan.bilanId, true)).etat).toBe('indeterminee')
    const commits = f.cible.commits.length
    await expect(f.nouveauService('nouvelle-session').reprendre(`migration-${f.bilan.bilanId}`, true)).rejects.toThrow(/encore active/)
    expect(f.cible.commits).toHaveLength(commits)
    expect(f.ouvrir).not.toHaveBeenCalled()
  })

  it('refuse une conversion et une confirmation appartenant au bilan remplacé', async () => {
    const f = await bancSimule()
    const suivant = await f.preparer()
    expect(suivant.bilanId).not.toBe(f.bilan.bilanId)
    expect(() => f.service.ajouterConversion(f.bilan.bilanId, 0, convertirEntretienMigrationGitLab(null, parseur))).toThrow(/bilan a changé/)
    await expect(f.service.executer(f.bilan.bilanId, true)).rejects.toThrow(/bilan a changé/)
    expect(f.uploadLfs).not.toHaveBeenCalled()
    expect(f.cible.commits).toHaveLength(0)
  })

  it('refuse avant copie un projet devenu non vierge depuis le bilan', async () => {
    const f = await bancSimule()
    f.cible.deposerHorsProtocole('README.mp3', 'Donnée utilisateur')
    await expect(f.service.executer(f.bilan.bilanId, true)).rejects.toThrow(/destination a changé/)
    expect(f.uploadLfs).not.toHaveBeenCalled()
    expect(f.cible.fichiers.get('README.mp3')?.contenu).toBe('Donnée utilisateur')
    expect(f.service.listerSuivis()).toHaveLength(0)
  })
})
