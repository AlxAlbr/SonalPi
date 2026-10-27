// @vitest-environment happy-dom
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import { CopieurMediasMigrationGitLab } from '../../src/main/gitlab/copieMediasMigration'
import { MAX_ACTIONS_PUBLICATION } from '../../src/main/gitlab/limitesPublication'
import { DocumentsMigrationGitLab } from '../../src/main/gitlab/documentsMigration'
import { OperationMigrationGitLab, initialiserSuiviMigration, type EnvironnementOperationMigration } from '../../src/main/gitlab/operationMigration'
import { SuiviDurableMigrationGitLab, empreinteBlobMigration } from '../../src/main/gitlab/suiviMigration'
import { ServiceMigrationGitLab } from '../../src/main/gitlab/migration'
import { convertirEntretienMigrationGitLab } from '../../src/renderer/formatSonal/migrationGitLab'
import { analyserCrp } from '../../src/shared/corpus/migrationCrp'
import { matriceCapacites } from '../../src/main/gitlab/politiqueGestes'
import type { BilanMigrationGitLab } from '../../src/shared/corpus/migrationGitLab'
import type { OuvertureDistante } from '../../src/shared/distant'
import { DepotMemoire } from './depotMemoire'

const dossiers: string[] = []
afterEach(() => dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const parseur = (html: string) => new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/gi, ''), 'text/html')
const analyse = analyserCrp(readFileSync('test/fixtures/corpusV1.crp', 'utf8'), 'terrain.crp')
if (!analyse.ok) throw new Error(analyse.message)
const sonal = readFileSync('test/fixtures/entretien1.sonal', 'utf8')
const empreinte = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function scenario(options: { externe?: boolean; nombre?: number; sansMedias?: boolean; initialisee?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-operation-migration-'))
  dossiers.push(dir)
  const depot = new DepotMemoire()
  if (options.initialisee) depot.charger(new Map([['README.md', 'Présentation originale'], ['.gitattributes', '*.texte text']]))
  const source = new Map([
    ['voix/échantillon.mp3', Buffer.alloc(3 * 1024 * 1024, 17)],
    ['autre/échantillon.mp3', Buffer.alloc(4 * 1024 * 1024, 42)],
  ])
  const medias = options.sansMedias ? [] : [...source].map(([cheminSource, octets], i) => ({
    cheminSource, cheminDestination: `medias/identite/${i}/échantillon.mp3`, taille: octets.length,
    sha256: empreinte(octets), stockageSource: 'git' as const,
  }))
  const nombre = options.nombre ?? 3
  const bilan: BilanMigrationGitLab = {
    bilanId: randomUUID(), preparationId: randomUUID(),
    source: { compteId: 'compte', urlInstance: 'https://gitlab.example.org', utilisateur: 'moi', projetId: 1, nomProjet: 'Source', branche: 'main' },
    commitSource: 'a'.repeat(40), cheminCrp: 'terrain.crp',
    cible: { compteId: 'compte', urlInstance: 'https://gitlab.example.org', utilisateur: 'moi', projetId: 2, nomProjet: 'Cible', branche: options.initialisee ? 'main' : null },
    commitCible: options.initialisee ? await depot.resoudreTete('main') : null,
    apercu: structuredClone(analyse.apercu),
    entretiens: Array.from({ length: nombre }, (_, i) => ({ titre: `Entretien ${i}`, cheminSonal: i === 0 ? 'entretien1.sonal' : null, media: medias.length ? i < 2 ? 0 : 1 : null })),
    medias, volumeOctets: medias.reduce((s, m) => s + m.taille, 0), destinationMedia: options.externe ? 'externe' : 'depot',
  }
  bilan.apercu.nbEntretiens = nombre
  bilan.apercu.raw.tabEnt = bilan.entretiens.map((e, i) => ({ id: i + 1, nom: e.titre, rtrPath: e.cheminSonal, audioPath: e.media === null ? null : bilan.medias[e.media].cheminSource }))
  const documents = new DocumentsMigrationGitLab(join(dir, 'documents'), bilan)
  for (let i = 0; i < nombre; i++) documents.ajouter(i, convertirEntretienMigrationGitLab(i === 0 ? { nom: 'entretien1.sonal', contenu: sonal } : null, parseur))
  const suivi = new SuiviDurableMigrationGitLab(dir)
  const observer = async () => ({
    commit: depot.fichiers.size || depot.commits.length ? await depot.resoudreTete('main') : null,
    fichiers: Object.fromEntries([...depot.fichiers].map(([p, f]) => [p, empreinteBlobMigration(f.contenu)])),
  })
  initialiserSuiviMigration(suivi, bilan, 'destination', { userId: 'moi', machineId: 'poste', sessionId: 'session-originale' }, await observer())
  const objets = new Map<string, Buffer>()
  const externe = new Map<string, Buffer>()
  const uploads: string[] = []
  const telechargerFichier = vi.fn(async (chemin: string, fichier: string) => {
    const b = source.get(chemin)
    if (!b) throw new Error('Source inaccessible')
    mkdirSync(dirname(fichier), { recursive: true }); writeFileSync(fichier, b)
  })
  const annulation = new AbortController()
  let arreterApresCopie = false
  const copieur = new CopieurMediasMigrationGitLab({ telechargerFichier }, options.externe ? {
    type: 'externe', client: {
      mkcol: async () => undefined,
      propfind: async (dossier: string) => [...externe.keys()].filter((p) => p.startsWith(`${dossier}/`)).map((p) => ({ chemin: p.slice(dossier.length + 1), dossier: false, taille: externe.get(p)!.length, empreinte: null })),
      putFichier: async (chemin: string, fichier: string) => { uploads.push(chemin); externe.set(chemin, readFileSync(fichier)); if (arreterApresCopie) annulation.abort() },
      getBinaireFichier: async (chemin: string, fichier: string) => { writeFileSync(fichier, externe.get(chemin)!); return {} },
    },
  } : {
    type: 'depot', client: { televerserObjet: async (fichier, media) => {
      const b = readFileSync(fichier)
      expect(empreinte(b)).toBe(media.sha256)
      if (!objets.has(media.sha256)) { objets.set(media.sha256, b); uploads.push(media.sha256) }
      expect(empreinte(objets.get(media.sha256)!)).toBe(media.sha256)
      if (arreterApresCopie) annulation.abort()
    } },
  }, join(dir, 'medias'))
  const ouvrir = vi.fn(async () => {
    const miroir = join(dir, 'miroir')
    for (const [p, f] of depot.fichiers) {
      if (!p.endsWith('.json') || p.startsWith('.sonal/')) continue
      mkdirSync(dirname(join(miroir, p)), { recursive: true }); writeFileSync(join(miroir, p), f.contenu)
    }
    const corpus = new CorpusStore(miroir).ouvrir()
    return { dir: miroir, nom: corpus.nom, corpus, capacites: matriceCapacites('gitlab'), distant: { id: 'destination', fournisseur: 'gitlab' } } as OuvertureDistante
  })
  const env: EnvironnementOperationMigration = { depot, observer, ouvrir, copier: (index, p, signal) => copieur.copier(bilan.medias[index], (o) => p(o), signal) }
  const run = (reprise = false, signal = new AbortController().signal) => new OperationMigrationGitLab(suivi, suivi.lire()!, env).executer(reprise, signal)
  const publications = () => depot.commits.filter((c) => c.message.startsWith(`Sonal migration-`))
  return { bilan, depot, dir, suivi, run, source, objets, externe, uploads, ouvrir, telechargerFichier, env, annulation, publications,
    arreterApresCopie: () => { arreterApresCopie = true }, continuerCopies: () => { arreterApresCopie = false } }
}

describe('opération de migration sur transports simulés', () => {
  it.each([false, true])('copie réellement les octets puis publie et rouvre les documents natifs (externe=%s)', async (externe) => {
    const f = await scenario({ externe })
    const avant = [...f.source].map(([p, b]) => [p, empreinte(b)])
    const resultat = await f.run()
    expect(resultat.etat).toBe('terminee')
    expect(f.uploads).toHaveLength(2)
    expect(f.publications()).toHaveLength(1)
    expect(f.suivi.lire()?.phase).toBe('terminee')
    expect(f.suivi.lire()?.mediasConfirmes).toHaveLength(2)
    expect([...f.source].map(([p, b]) => [p, empreinte(b)])).toEqual(avant)
    const jsons = [...f.depot.fichiers].filter(([p]) => p.startsWith('entretiens/') && p.endsWith('.json'))
    const refs = jsons.map(([, f]) => JSON.parse(f.contenu).meta.audioDistant)
    expect(refs[0]).toEqual(refs[1])
    expect(refs[2].chemin).not.toBe(refs[0].chemin)
    expect(refs.every((r) => r.fournisseur === (externe ? 'webdav' : 'gitlab'))).toBe(true)
    f.source.clear()
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.telechargerFichier).toHaveBeenCalledTimes(2)
    expect(f.publications()).toHaveLength(1)
  })

  it('préserve le README et les attributs initiaux octet pour octet', async () => {
    const f = await scenario({ initialisee: true })
    expect((await f.run()).etat).toBe('terminee')
    expect(f.depot.fichiers.get('README.md')?.contenu).toBe('Présentation originale')
    expect(f.depot.fichiers.get('.gitattributes')?.contenu).toBe('*.texte text')
    expect(f.depot.fichiers.get('medias/.gitattributes')?.contenu).toContain('filter=lfs')
    expect(f.depot.commits.flatMap((c) => c.actions).filter((a) => !a.file_path.startsWith('.sonal/')).every((a) => a.action === 'create')).toBe(true)
  })

  it.each([false, true])('reprend une copie interrompue sans nouvelle copie acquise ni perte des identifiants (externe=%s)', async (externe) => {
    const f = await scenario({ externe })
    const ids = f.suivi.lire()!.documents.map((d) => [d.chemin, d.sha256])
    f.arreterApresCopie()
    expect((await f.run(false, f.annulation.signal)).etat).toBe('interrompue')
    expect(f.suivi.lire()?.mediasConfirmes).toHaveLength(1)
    expect(f.depot.commits).toHaveLength(0)
    f.continuerCopies()
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.uploads).toHaveLength(2)
    expect(f.telechargerFichier).toHaveBeenCalledTimes(2)
    expect(f.suivi.lire()!.documents.map((d) => [d.chemin, d.sha256])).toEqual(ids)
  })

  it('fractionne selon les limites existantes, conserve la première publication et publie corpus.json en dernier', async () => {
    const f = await scenario({ nombre: MAX_ACTIONS_PUBLICATION + 2, sansMedias: true })
    expect(f.suivi.lire()?.lots).toHaveLength(2)
    const annulation = new AbortController()
    f.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path.startsWith('entretiens/'))) annulation.abort() }
    expect((await f.run(false, annulation.signal)).etat).toBe('interrompue')
    expect(f.suivi.lire()?.prochainLot).toBe(1)
    expect(f.depot.fichiers.has('corpus.json')).toBe(false)
    const ids = f.suivi.lire()!.documents.map((d) => d.chemin)
    f.depot.avantCommit = () => {}
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.publications()).toHaveLength(2)
    expect(f.publications().every((c) => c.actions.length <= MAX_ACTIONS_PUBLICATION)).toBe(true)
    expect(f.suivi.lire()!.documents.map((d) => d.chemin)).toEqual(ids)
    const creations = f.publications().flatMap((c) => c.actions.filter((a) => a.action === 'create').map((a) => a.file_path))
    expect(new Set(creations).size).toBe(creations.length)
  }, 30_000)

  it('reconnaît une publication acceptée dont la réponse s’est perdue, sans renvoi ni ouverture prématurée', async () => {
    const f = await scenario()
    f.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path === 'corpus.json')) { f.depot.echouerApresAccepter(new Error('réponse perdue')); f.depot.rendreCommitsIllisibles() }
    }
    expect((await f.run()).etat).toBe('indeterminee')
    expect(f.suivi.lire()?.intention).toBeTruthy()
    expect(f.publications()).toHaveLength(1)
    expect(f.ouvrir).not.toHaveBeenCalled()
    f.depot.avantCommit = () => {}; f.depot.rendreCommits()
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.publications()).toHaveLength(1)
    expect(f.suivi.lire()?.intention).toBeUndefined()
  })

  it('ne relance pas un envoi inconnu ; une reprise explicite le neutralise avant nouvelle tentative conditionnelle', async () => {
    const f = await scenario()
    let premiere = true
    f.env.progression = (p) => { if (p.etape === 'publication' && premiere) { premiere = false; f.depot.echouerAvantEnvoyer(new Error('connexion perdue')) } }
    expect((await f.run()).etat).toBe('indeterminee')
    const commits = f.depot.commits.length
    expect((await f.run()).etat).toBe('indeterminee')
    expect(f.depot.commits).toHaveLength(commits)
    expect(f.publications()).toHaveLength(0)
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.publications()).toHaveLength(1)
  })

  it('refuse une cible changée après le bilan avant toute copie', async () => {
    const f = await scenario()
    f.depot.deposerHorsProtocole('fichier-utilisateur.txt', 'Ne pas toucher')
    expect((await f.run()).etat).toBe('interrompue')
    expect(f.uploads).toHaveLength(0)
    expect(f.depot.commits).toHaveLength(0)
    expect(f.depot.fichiers.get('fichier-utilisateur.txt')?.contenu).toBe('Ne pas toucher')
  })

  it('refuse un fichier extérieur ajouté pendant la publication et ne le supprime pas', async () => {
    const f = await scenario()
    f.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'corpus.json')) f.depot.deposerHorsProtocole('autre.txt', 'À conserver') }
    expect((await f.run()).etat).toBe('interrompue')
    expect(f.ouvrir).not.toHaveBeenCalled()
    expect(f.depot.fichiers.get('autre.txt')?.contenu).toBe('À conserver')
  })

  it('refuse un contenu local altéré avant tout transfert', async () => {
    const f = await scenario()
    const d = f.suivi.lire()!.documents[0]
    writeFileSync(join(f.dir, 'contenus', `${d.sha256}.bin`), 'altéré')
    expect((await f.run()).etat).toBe('interrompue')
    expect(f.uploads).toHaveLength(0)
    expect(f.depot.commits).toHaveLength(0)
  })

  it('une ouverture échouée ne republie pas les métadonnées à la reprise', async () => {
    const f = await scenario()
    f.ouvrir.mockRejectedValueOnce(new Error('Accès indisponible'))
    expect((await f.run()).etat).toBe('interrompue')
    expect(f.suivi.lire()?.phase).toBe('ouverture')
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.publications()).toHaveLength(1)
  })

  it('un dernier checkpoint indisponible ne masque pas un corpus déjà confirmé et installé', async () => {
    const f = await scenario()
    const ecrire = f.suivi.ecrire.bind(f.suivi)
    vi.spyOn(f.suivi, 'ecrire').mockImplementation((etat) => {
      if (etat.phase === 'terminee') throw new Error('Disque plein')
      ecrire(etat)
    })
    expect((await f.run()).etat).toBe('terminee')
    expect(f.suivi.lire()?.phase).toBe('ouverture')
    expect((await f.run(true)).etat).toBe('terminee')
    expect(f.publications()).toHaveLength(1)
  })

  it('un suivi corrompu bloque la reprise et un identifiant arbitraire ne sort pas du profil', async () => {
    const f = await scenario()
    writeFileSync(f.suivi.fichier, '{cassé')
    expect(() => f.suivi.lire()).toThrow(/illisible/)
    const service = new ServiceMigrationGitLab({ authentification: {} as never, coffre: {} as never, dirProfil: f.dir,
      identite: { machineId: 'poste', sessionId: 'nouvelle' }, ouvrir: f.ouvrir, autoriserEnvoi: true })
    await expect(service.reprendre('../../ailleurs', true)).rejects.toThrow(/Identifiant/)
  })

  it('le parcours qualifié exige toujours confirmation et bilan valide, et respecte un blocage explicite', async () => {
    const f = await scenario()
    const options = { authentification: {} as never, coffre: {} as never, dirProfil: f.dir,
      identite: { machineId: 'poste', sessionId: 'nouvelle' }, ouvrir: f.ouvrir }
    await expect(new ServiceMigrationGitLab({ ...options, autoriserEnvoi: false }).executer(f.bilan.bilanId, true)).rejects.toThrow(/qualification/)
    await expect(new ServiceMigrationGitLab(options).executer(f.bilan.bilanId, false)).rejects.toThrow(/Confirmez/)
    await expect(new ServiceMigrationGitLab(options).executer(f.bilan.bilanId, true)).rejects.toThrow(/bilan a changé/)
    expect(f.depot.commits).toHaveLength(0)
    expect(existsSync(join(f.dir, 'migrations-gitlab'))).toBe(false)
  })
})
