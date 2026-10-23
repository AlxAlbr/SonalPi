import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { encode } from 'iconv-lite'
import type { ServiceAuthentificationGitLab } from '../../src/main/gitlab/authentification'
import { ClientGitLab, autorisationJetonPersonnel } from '../../src/main/gitlab/client'
import { LectureV1GitLab, resoudreCheminV1GitLab } from '../../src/main/gitlab/lectureV1'
import { PreparateurMigrationGitLab } from '../../src/main/gitlab/preparationMigration'
import { preparerCibleMigrationGitLab, preparerProjetGitLab } from '../../src/main/gitlab/preparationProjet'

const INSTANCE = 'https://gitlab.example.org'
const COMMIT_SOURCE = 'a'.repeat(40)
const COMMIT_CIBLE = 'b'.repeat(40)
const demande = { compteId: 'compte', urlProjet: `${INSTANCE}/groupe/source` }
const cible = { compteId: 'compte', urlProjet: `${INSTANCE}/groupe/cible` }
const empreinte = (octets: Uint8Array) => createHash('sha256').update(octets).digest('hex')
const b = (texte: string) => Buffer.from(texte)
const json = (valeur: unknown) => new Response(JSON.stringify(valeur))

interface Fichier { octets: Uint8Array; lfs?: Uint8Array }

function banc(options: {
  fichiers?: Record<string, Fichier>
  cibleVide?: boolean
  fichiersCible?: string[]
  cibleBranches?: unknown[]
  brancheSource?: string
  sourceArchivee?: boolean
} = {}) {
  const corpus = {
    nom: 'Terrain',
    tabEnt: [
      { id: 1, nom: 'Premier', rtrPath: 'premier.Sonal', audioPath: '../audio/voix.mp3' },
      { id: 2, nom: 'Second', rtrPath: '', audioPath: '../audio/voix.mp3' },
      { id: 3, nom: 'Autre', rtrPath: '', audioPath: '../autre/voix.mp3' },
    ],
  }
  const fichiers: Record<string, Fichier> = options.fichiers ?? {
    'terrain/corpus.crp': { octets: b(JSON.stringify(corpus)) },
    'terrain/premier.Sonal': { octets: b('<html>Transcription échantillon</html>') },
    'terrain/corpus.out': { octets: b('le\nla') },
    'terrain/corpus.lem': { octets: b('allais\taller\tV') },
    'terrain/corpus.cnct': { octets: b('prise en charge\tprise en charge\tC') },
    'audio/voix.mp3': { octets: Buffer.alloc(2048, 1) },
    'autre/voix.mp3': { octets: Buffer.alloc(3072, 2) },
    'non-reference.mp3': { octets: Buffer.alloc(10_000) },
    'autre.crp': { octets: b(JSON.stringify({ tabEnt: [] })) },
  }
  const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree))
    const route = decodeURIComponent(url.pathname)
    const projet = ['/api/v4/projects/groupe/source', '/api/v4/projects/1'].includes(route) ? 1 : route === '/api/v4/projects/groupe/cible' ? 2 : null
    if (projet) return json({
      id: projet, name: projet === 1 ? 'Source' : 'Cible', archived: projet === 1 && Boolean(options.sourceArchivee),
      default_branch: projet === 2 && options.cibleVide ? null : 'main',
      empty_repo: projet === 2 && Boolean(options.cibleVide),
    })
    const depot = /^\/api\/v4\/projects\/(\d+)\/repository\/(.*)$/.exec(route)
    if (!depot) throw new Error(`Requête inattendue : ${route}`)
    const [, id, suffixe] = depot
    if (suffixe === 'branches') return json(options.cibleBranches ?? [])
    if (suffixe === `branches/${id === '1' ? options.brancheSource ?? 'main' : 'main'}`) return json({ commit: { id: id === '1' ? COMMIT_SOURCE : COMMIT_CIBLE } })
    if (suffixe === 'tree') {
      expect(url.searchParams.get('ref')).toBe(id === '1' ? COMMIT_SOURCE : COMMIT_CIBLE)
      const dossier = url.searchParams.get('path') ?? ''
      const chemins = id === '1' ? Object.keys(fichiers) : options.fichiersCible ?? ['README.md', '.gitattributes']
      const prefixe = dossier ? `${dossier}/` : ''
      const enfants = new Map<string, boolean>()
      for (const chemin of chemins.filter((chemin) => chemin.startsWith(prefixe))) {
        const rel = chemin.slice(prefixe.length)
        enfants.set(rel.split('/')[0], rel.includes('/'))
      }
      return json([...enfants.entries()].map(([nom, dossier]) => ({
        id: 'c'.repeat(40), name: nom, path: `${prefixe}${nom}`,
        type: dossier ? 'tree' : 'blob', mode: dossier ? '040000' : '100644',
      })))
    }
    if (suffixe.startsWith('files/')) {
      expect(url.searchParams.get('ref')).toBe(COMMIT_SOURCE)
      const raw = suffixe.endsWith('/raw')
      const chemin = suffixe.slice(6, raw ? -4 : undefined)
      const fichier = fichiers[chemin]
      if (!fichier) return new Response(null, { status: 404 })
      if (init?.method === 'HEAD') return new Response(null, { headers: {
        'X-Gitlab-Size': String(fichier.octets.byteLength),
        'X-Gitlab-Content-Sha256': empreinte(fichier.octets),
      } })
      if (!raw) throw new Error('Lecture de document non prévue')
      return new Response(Buffer.from(url.searchParams.get('lfs') === 'true' && fichier.lfs ? fichier.lfs : fichier.octets))
    }
    throw new Error(`Requête inattendue : ${route}`)
  })
  const auth = {
    comptePublic: () => ({ urlInstance: INSTANCE, utilisateur: 'moi' }),
    client: vi.fn(async (_compte: string, projetId?: number) => new ClientGitLab({
      urlInstance: INSTANCE, projetId, autorisation: autorisationJetonPersonnel('secret-test'),
    }, fetchImpl)),
  } as unknown as ServiceAuthentificationGitLab
  return { auth, fetchImpl, fichiers, preparateur: new PreparateurMigrationGitLab(auth) }
}

function pointeur(octets: Uint8Array): Uint8Array {
  return b(`version https://git-lfs.github.com/spec/v1\noid sha256:${empreinte(octets)}\nsize ${octets.byteLength}\n`)
}

describe('préparation de migration GitLab V1', () => {
  it('retrouve le projet par son identifiant local, sa branche et sa racine enregistrées', async () => {
    const { auth, fetchImpl } = banc({ brancheSource: 'terrain' })
    const destination = { fournisseur: 'gitlab' as const, id: 'connue', compteId: 'compte', projetId: 1,
      nomProjet: 'Ancien nom', branche: 'terrain', racine: 'terrain' }
    const coffre = { listerDestinationsGitLab: () => [destination] }
    const preparateur = new PreparateurMigrationGitLab(auth, undefined, coffre)
    const source = await preparateur.decouvrir({ destinationId: 'connue', compteId: 'autre', urlProjet: 'https://autre.example.org/groupe/projet' })
    expect(source.projet).toMatchObject({ compteId: 'compte', projetId: 1, nomProjet: 'Source', branche: 'terrain' })
    expect(source.corpus).toEqual(['terrain/corpus.crp'])
    expect(source.commit).toBe(COMMIT_SOURCE)
    expect(auth.client).toHaveBeenCalledWith('compte', 1)
    expect(vi.mocked(auth.client).mock.calls.every(([compteId]) => compteId === 'compte')).toBe(true)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/projects/1'))).toBe(true)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/branches/terrain'))).toBe(true)
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
  })

  it('refuse un projet oublié sans utiliser les autres champs fournis', async () => {
    const { auth, fetchImpl } = banc()
    const preparateur = new PreparateurMigrationGitLab(auth, undefined, { listerDestinationsGitLab: () => [] })
    await expect(preparateur.decouvrir({ destinationId: 'inconnue', ...demande })).rejects.toThrow('plus enregistré')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recontrôle le statut du projet enregistré avant de le lire', async () => {
    const { auth, fetchImpl } = banc({ sourceArchivee: true })
    const coffre = { listerDestinationsGitLab: () => [{ fournisseur: 'gitlab' as const, id: 'connue',
      compteId: 'compte', projetId: 1, nomProjet: 'Source', branche: 'main', racine: '' }] }
    const preparateur = new PreparateurMigrationGitLab(auth, undefined, coffre)
    await expect(preparateur.decouvrir({ destinationId: 'connue' })).rejects.toThrow('archivé')
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/repository/'))).toBe(false)
  })

  it('fige la source et propose les corpus sans les fusionner', async () => {
    const { preparateur, fetchImpl } = banc()
    const source = await preparateur.decouvrir(demande)
    expect(source.commit).toBe(COMMIT_SOURCE)
    expect(source.corpus).toEqual(['autre.crp', 'terrain/corpus.crp'])
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('/branches/'))).toHaveLength(1)
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
  })

  it.each([false, true])('accepte une cible technique ou réellement vide (vide=%s), sans aucune écriture', async (cibleVide) => {
    const { preparateur, fetchImpl } = banc({ cibleVide })
    const source = await preparateur.decouvrir(demande)
    const bilan = await preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible })
    expect(bilan.cible.branche).toBe(cibleVide ? null : 'main')
    expect(bilan.commitCible).toBe(cibleVide ? null : COMMIT_CIBLE)
    expect(bilan.entretiens).toEqual([
      { titre: 'Premier', cheminSonal: 'terrain/premier.Sonal', media: 0 },
      { titre: 'Second', cheminSonal: null, media: 0 },
      { titre: 'Autre', cheminSonal: null, media: 1 },
    ])
    expect(bilan.medias).toHaveLength(2)
    expect(bilan.volumeOctets).toBe(5120)
    expect(bilan.medias[0].cheminDestination).not.toBe(bilan.medias[1].cheminDestination)
    expect(bilan.medias.every((media) => media.cheminDestination.endsWith('/voix.mp3'))).toBe(true)
    expect(bilan.destinationMedia).toBe('depot')
    expect(bilan.lexicoV1?.fichiers).toEqual(['.out', '.lem', '.cnct'])
    expect(bilan.lexicoV1?.traitements).toMatchObject({
      motsOutils: ['le', 'la'],
      regroupements: [expect.objectContaining({ forme: 'aller', membres: ['allais'] })],
      concatenations: [expect.objectContaining({ sequence: ['prise', 'en', 'charge'] })],
    })
    expect(fetchImpl.mock.calls.every(([, init]) => ['GET', 'HEAD'].includes(init?.method ?? ''))).toBe(true)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('non-reference.mp3'))).toBe(false)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('voix.mp3%2Fraw') || String(url).includes('voix.mp3/raw'))).toBe(false)
    expect(await preparateur.lireEntretien(source.preparationId, 0)).toMatchObject({ nom: 'premier.Sonal' })
    expect(await preparateur.lireEntretien(source.preparationId, 1)).toBeNull()
  })

  it.each(['corpus.json', 'entretiens/e.json', 'medias/audio.mp3', 'README.mp3', 'recherche.txt', 'docs/README.md'])('refuse un contenu utilisateur préexistant : %s', async (chemin) => {
    const { preparateur } = banc({ fichiersCible: ['README.md', chemin] })
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible })).rejects.toThrow('contient déjà')
  })

  it('refuse une cible qui a acquis une branche après lecture de ses informations', async () => {
    const { preparateur } = banc({ cibleVide: true, cibleBranches: [{ name: 'nouvelle' }] })
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible })).rejects.toThrow('possède déjà des branches')
  })

  it('refuse de convertir la source sur place', async () => {
    const { preparateur } = banc()
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible: demande })).rejects.toThrow('deux dépôts différents')
  })

  it('lie le corpus sélectionné et les lectures à la préparation', async () => {
    const { preparateur } = banc()
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'inconnu.crp', cible })).rejects.toThrow('source préparée')
    await expect(preparateur.lireEntretien(source.preparationId, 0)).rejects.toThrow('bilan préparé')
    await preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible })
    await expect(preparateur.lireEntretien(source.preparationId, -1)).rejects.toThrow('bilan préparé')
    await expect(preparateur.lireEntretien(source.preparationId, 3)).rejects.toThrow('bilan préparé')
    preparateur.abandonner(source.preparationId)
    await expect(preparateur.lireEntretien(source.preparationId, 0)).rejects.toThrow('plus disponible')
  })

  it('ne remplace pas une transcription inaccessible par un entretien vide', async () => {
    const { preparateur, fichiers } = banc()
    delete fichiers['terrain/premier.Sonal']
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible })).rejects.toThrow('introuvable')
  })

  it('teste la base externe sans enregistrer ni divulguer ses accès', async () => {
    const { auth } = banc()
    const base = { urlBase: 'https://nuage.example.org/medias', utilisateur: 'media-user', motDePasse: 'media-secret' }
    const verifierBase = vi.fn(async () => ({ ok: true as const, base }))
    const preparateur = new PreparateurMigrationGitLab(auth, verifierBase)
    const source = await preparateur.decouvrir(demande)
    const bilan = await preparateur.preparer({ preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible, baseMedia: base })
    expect(verifierBase).toHaveBeenCalledWith(base)
    expect(bilan.destinationMedia).toBe('externe')
    expect(JSON.stringify(bilan)).not.toMatch(/media-secret|media-user|nuage.example/)
  })

  it('refuse une base externe inaccessible', async () => {
    const { auth } = banc()
    const preparateur = new PreparateurMigrationGitLab(auth, async () => ({ ok: false, motif: 'droits' }))
    const source = await preparateur.decouvrir(demande)
    await expect(preparateur.preparer({
      preparationId: source.preparationId, cheminCrp: 'terrain/corpus.crp', cible,
      baseMedia: { urlBase: 'https://nuage.example.org/medias', utilisateur: 'u', motDePasse: 'secret' },
    })).rejects.toThrow('Accès à l’espace média refusé')
  })

  it('refuse un bilan tardif après changement de source sans altérer la nouvelle préparation', async () => {
    const { auth } = banc()
    const base = { urlBase: 'https://nuage.example.org/medias', utilisateur: 'u', motDePasse: 'secret' }
    let confirmer!: (valeur: { ok: true; base: typeof base }) => void
    const reponse = new Promise<{ ok: true; base: typeof base }>((resolve) => { confirmer = resolve })
    const verifier = vi.fn(async () => reponse)
    const preparateur = new PreparateurMigrationGitLab(auth, verifier)
    const ancienne = await preparateur.decouvrir(demande)
    const preparation = preparateur.preparer({
      preparationId: ancienne.preparationId, cheminCrp: 'terrain/corpus.crp', cible, baseMedia: base,
    })
    await vi.waitFor(() => expect(verifier).toHaveBeenCalled())
    const nouvelle = await preparateur.decouvrir(demande)
    confirmer({ ok: true, base })
    await expect(preparation).rejects.toThrow('préparation a changé')
    await expect(preparateur.lireEntretien(ancienne.preparationId, 0)).rejects.toThrow('plus disponible')
    await expect(preparateur.preparer({
      preparationId: nouvelle.preparationId, cheminCrp: 'terrain/corpus.crp', cible,
    })).resolves.toMatchObject({ preparationId: nouvelle.preparationId })
  })

  it('préserve le refus de dépôt vide dans les autres parcours GitLab', async () => {
    const { auth } = banc({ cibleVide: true })
    await expect(preparerProjetGitLab(cible, auth)).rejects.toThrow('branche par défaut')
    await expect(preparerCibleMigrationGitLab(cible, auth)).resolves.toMatchObject({ branche: null })
  })
})

describe('documents V1 GitLab et LFS', () => {
  it('décode windows-1252 après lecture des octets', async () => {
    const { auth } = banc({ fichiers: { 'texte.Sonal': { octets: encode('Émilie à l’école', 'windows-1252') } } })
    const lecture = new LectureV1GitLab(await auth.client('compte', 1), COMMIT_SOURCE)
    expect(await lecture.lireDocument('texte.Sonal')).toBe('Émilie à l’école')
  })

  it('résout et vérifie le vrai contenu LFS de la transcription', async () => {
    const objet = b('<html>Texte réel, pas un pointeur LFS.</html>')
    const { auth, fetchImpl } = banc({ fichiers: { 'texte.Sonal': { octets: pointeur(objet), lfs: objet } } })
    const lecture = new LectureV1GitLab(await auth.client('compte', 1), COMMIT_SOURCE)
    expect(await lecture.information('texte.Sonal')).toMatchObject({ stockage: 'lfs', sha256: empreinte(objet), taille: objet.byteLength })
    expect(await lecture.lireDocument('texte.Sonal')).toBe(new TextDecoder().decode(objet))
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('lfs'))).toContain('true')
  })

  it('inventorie la taille réelle d’un média LFS sans télécharger l’objet', async () => {
    const objet = Buffer.alloc(20_000)
    const { auth, fetchImpl } = banc({ fichiers: { 'audio.mp3': { octets: pointeur(objet), lfs: objet } } })
    const lecture = new LectureV1GitLab(await auth.client('compte', 1), COMMIT_SOURCE)
    expect(await lecture.information('audio.mp3')).toMatchObject({ stockage: 'lfs', taille: 20_000 })
    expect(fetchImpl.mock.calls.every(([url]) => new URL(String(url)).searchParams.get('lfs') !== 'true')).toBe(true)
  })

  it.each(['pointeur', 'objet-corrompu', 'taille'])('refuse une réponse LFS incorrecte (%s)', async (mode) => {
    const objet = b('<html>Une vraie transcription.</html>')
    const { auth } = banc({ fichiers: { 'texte.Sonal': {
      octets: pointeur(objet), lfs: mode === 'pointeur' ? pointeur(objet) : mode === 'taille' ? b('court') : Buffer.alloc(objet.byteLength, 8),
    } } })
    const lecture = new LectureV1GitLab(await auth.client('compte', 1), COMMIT_SOURCE)
    await expect(lecture.lireDocument('texte.Sonal')).rejects.toThrow('ne correspond pas')
  })

  it('arrête les erreurs réseau au lieu de produire du texte vide', async () => {
    const client = new ClientGitLab({ urlInstance: INSTANCE, projetId: 1, autorisation: autorisationJetonPersonnel('s') }, async () => { throw new Error('réseau interrompu') })
    await expect(new LectureV1GitLab(client, COMMIT_SOURCE).lireDocument('texte.Sonal')).rejects.toThrow('réseau interrompu')
  })

  it.each(['../audio/voix.mp3', '..\\audio\\voix.mp3'])('résout %s depuis le dossier du .crp', (chemin) => {
    expect(resoudreCheminV1GitLab('terrain/corpus.crp', chemin)).toBe('audio/voix.mp3')
  })

  it.each(['/home/moi/audio.mp3', 'C:\\Corpus\\audio.mp3', 'https://externe.org/audio.mp3', '../../audio.mp3', '\\\\serveur\\audio.mp3'])('refuse une référence hors dépôt : %s', (chemin) => {
    expect(() => resoudreCheminV1GitLab('terrain/corpus.crp', chemin)).toThrow('hors du dépôt')
  })
})
