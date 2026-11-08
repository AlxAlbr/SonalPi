import { expect, type Page } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { DepotCommitsGitLabClient } from '../../src/main/gitlab/bailGitLab'
import { ClientLfsGitLab, identifierFichierGitLab, pointeurLfsGitLab } from '../../src/main/gitlab/lfs'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { fixturePseudonymisation } from '../../test/fixtures/pseudonymisation'
import { exporterSonal } from '../../src/renderer/formatSonal/exportSonal'
import { attendreAccueil, attendreCorpus, fermerAiguillage, lancer, retourCorpus } from '../util'

export const config = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''), token: process.env.GITLAB_USER1_TOKEN,
  utilisateur: process.env.GITLAB_OAUTH_USER1 ?? 'user1',
}
export const presente = Boolean(config.url && config.token)
export const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
export const accesMedia = { utilisateur: 'max', motDePasse: 'max-max-1234' }
export const racineMedia = 'http://localhost:8080/remote.php/dav/files/max'
export const webdav = (url: string) => new ClientWebDAV({ baseUrl: url, identifiants: accesMedia })
export type Projet = { id: number; path_with_namespace: string }
export async function api<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('PRIVATE-TOKEN', config.token!)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`${config.url}/api/v4${chemin}`, { ...init, headers, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`Fixture GitLab : HTTP ${r.status}, ${chemin} : ${(await r.text()).slice(0, 300)}`)
  return await r.json() as T
}
export const adresse = (p: Projet) => `${config.url}/${p.path_with_namespace}`
export function depot(p: Projet) {
  return new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: config.url!, projetId: p.id,
    autorisation: { type: 'jeton-prive', jeton: config.token! } }))
}
export async function projet(suffixe: string, readme = false) {
  const id = randomUUID()
  return api<Projet>('/projects', { method: 'POST', body: JSON.stringify({ name: `Qualification migration ${suffixe} ${id}`,
    path: `migration-${suffixe}-${id}`, initialize_with_readme: readme, default_branch: 'main', visibility: 'private' }) })
}

/** Médias générés et documents synthétiques, sans donnée utilisateur. */
export async function fixture(nombreEntretiens = 4) {
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-v1-fixture-'))
  const audio = join(dossier, 'voix.wav'), video = join(dossier, 'film.webm')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=120', '-c:a', 'pcm_s16le', audio])
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10:duration=8', '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', '-an', video])
  const synthese = fixturePseudonymisation(), donnees = synthese.entretiens[0].data
  donnees.locuteurs = [
    { index: 1, nom: 'Voix synthétique', valeursLoc: {}, personneRef: null },
    { index: 2, nom: 'Locuteur sans tour', valeursLoc: { v2: 'v2m1' }, personneRef: null },
  ]
  ;(donnees.corpsTexte as { content: Array<{ attrs?: Record<string, unknown> }> }).content[0].attrs = { loc: 1 }
  donnees.ancres = [{ pos: 1, t: 0 }, { pos: 60, t: 8 }]
  donnees.annotations.push(
    { id: 'codage', type: 'codage', code: 'cat_001', from: 1, to: 5, auteur: 'Qualification' },
    { id: 'codage-local', type: 'codage', code: 'cat_002', from: 14, to: 28, auteur: 'Qualification' },
    { id: 'commentaire', type: 'commentaire', from: 1, to: 5, auteur: 'Qualification', texte: 'Commentaire synthétique.' },
  )
  const sonal = exporterSonal({ ...donnees, reglesAnon: synthese.regles,
    definitionsAnonLocales: [
      { entite: ['Alias local', 'Autre alias'], pseudos: ['Déclaration locale'], etat: 'declaration' },
      { entite: ['Locale'], pseudos: ['Variante locale', 'Inutilisée'], etat: 'declaration' },
    ],
    codebook: [
      { id: 'cat_001', codeExport: 'cat_001', nom: 'Lieu', couleur: '#ff0000', ordre: 0, actif: true, parent: null },
      { id: 'cat_002', codeExport: 'cat_002', nom: 'Thème propre à l’entretien', couleur: '#00ff00', ordre: 1, actif: true, parent: null },
    ],
    variables: [{ id: 'v1', lib: 'Contexte', portee: 'entretien', priv: false, ordre: 0, vExport: 1,
      modalites: [{ id: 'v1m1', lib: 'Synthétique', mExport: 1 }] },
      { id: 'v2', lib: 'Variable locale', portee: 'locuteur', priv: false, ordre: 1, vExport: 2,
        modalites: [{ id: 'v2m1', lib: 'Sans prise de parole', mExport: 1 }] },
    ],
    meta: { valeursGen: { v1: 'v1m1' } }, legacy: { notes: 'Note synthétique conservée.', tabAnon: null },
  })
  const doc = join(dossier, 'riche.Sonal'); writeFileSync(doc, sonal)
  const inconnu = join(dossier, 'resultat.bin'); writeFileSync(inconnu, Buffer.alloc(9 * 1024 * 1024 + 17, 43))
  const source = await projet('source')
  const lfs = new ClientLfsGitLab({ urlInstance: config.url!, urlDepot: `${adresse(source)}.git`, utilisateur: config.utilisateur,
    autorisation: { type: 'jeton-prive', jeton: config.token! } })
  const objets = new Map<string, Buffer>()
  for (const [chemin, fichier] of [['terrain/riche.Sonal', doc], ['terrain/a/voix-é.wav', audio], ['terrain/film.webm', video], ['terrain/archives/résultat.bin', inconnu]]) {
    const identite = await identifierFichierGitLab(fichier)
    await lfs.televerserObjet(fichier, identite)
    objets.set(chemin, readFileSync(fichier))
  }
  const courtFichier = join(dossier, 'court.wav')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=8000:duration=8', '-c:a', 'pcm_s16le', courtFichier])
  const court = readFileSync(courtFichier)
  const crp = { nom: 'Migration synthétique', tabThm: [{ code: 'cat_001', nom: 'Lieu', couleur: '#ff0000', rang: '0', act: true }],
    tabAnon: [{ entite: 'Karine', remplacement: 'Claire', remplacementAlt: 'Rebecca' },
      { entite: 'Lyon / Lyons', remplacement: 'Ville témoin' }],
    tabVar: [{ v: 1, lib: 'Contexte', champ: 'gen', priv: false }], tabDic: [{ v: 1, m: 1, lib: 'Synthétique' }],
    tabEnt: [
      { id: 1, nom: 'Audio riche', rtrPath: 'riche.Sonal', audioPath: 'a/voix-é.wav' },
      { id: 2, nom: 'Audio réutilisé', rtrPath: 'riche.Sonal', audioPath: 'a/voix-é.wav' },
      { id: 3, nom: 'Homonyme', rtrPath: 'riche.Sonal', audioPath: 'b/voix-é.wav' },
      { id: 4, nom: 'Vidéo', rtrPath: 'riche.Sonal', audioPath: 'film.webm' },
    ] }
  for (let index = crp.tabEnt.length; index < nombreEntretiens; index++) {
    crp.tabEnt.push({ id: index + 1, nom: `Entretien synthétique ${index + 1}`, rtrPath: 'riche.Sonal', audioPath: '' })
  }
  const fichiersAutres = new Map([
    ['terrain/archives/résultat.bin', readFileSync(inconnu)],
    ['terrain/corpus.lexaf.json', Buffer.from('{"ancienResultat":true,"tableau":[1,2,3]}')],
    ['terrain/notes/rapport.txt', Buffer.from([0xc9, 0x74, 0x75, 0x64, 0x65, 13, 10])],
    ['terrain/corpus.lem', Buffer.from('allais\taller\nligne incomplète')],
  ])
  const fichiers = new Map<string, string>([['terrain/corpus.out', 'le\nla'], ['terrain/corpus.lem', fichiersAutres.get('terrain/corpus.lem')!.toString('utf8')],
    ['terrain/corpus.lexaf.json', fichiersAutres.get('terrain/corpus.lexaf.json')!.toString('utf8')],
    ['terrain/notes/rapport.txt', fichiersAutres.get('terrain/notes/rapport.txt')!.toString('base64')],
    ['terrain/.env.production', 'ACCES_SYNTHETIQUE_NE_PAS_COPIER=1'], ['terrain/corpus.crp', JSON.stringify(crp)], ['terrain/b/voix-é.wav', court.toString('base64')],
    ['terrain/.gitattributes', '*.Sonal filter=lfs diff=lfs merge=lfs -text\na/* filter=lfs diff=lfs merge=lfs -text\n*.webm filter=lfs diff=lfs merge=lfs -text\n']])
  for (const [chemin, contenu] of objets) fichiers.set(chemin, pointeurLfsGitLab({ taille: contenu.length, sha256: sha(contenu) }))
  await depot(source).publierCommit('main', 'Fixture V1 synthétique avec LFS', [...fichiers].map(([file_path, content]) => ({
    action: 'create', file_path, content, ...(['terrain/b/voix-é.wav', 'terrain/notes/rapport.txt'].includes(file_path) ? { encoding: 'base64' as const } : {}),
  })))
  objets.set('terrain/b/voix-é.wav', court)
  const commit = await depot(source).resoudreTete('main')
  return { source, objets, fichiersAutres, commit, dossier, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) }
}

export async function lancerQualification(profil: string, preserverSettings = false) {
  const app = await lancer(profil, { preserverSettings, repertoireApplication: join(process.cwd(), 'out/main/index.js') })
  const page = await app.firstWindow()
  page.on('dialog', (dialogue) => dialogue.accept())
  return app
}
export async function connecterSource(page: Page, source: Projet) {
  await attendreAccueil(page)
  await page.locator('.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab', exact: true }).click()
  const connexion = page.locator('.modale-distant')
  await connexion.locator('.url-projet-gitlab').fill(adresse(source))
  await connexion.locator('select').first().selectOption('jeton-personnel')
  const secret = connexion.locator('input[type=password]').first()
  if (await secret.isVisible()) await secret.fill(config.token!)
  await connexion.locator('.action-gitlab').click()
  const modal = page.getByRole('dialog', { name: 'Passer à SonalPi2 — GitLab' })
  await expect(modal.getByText('Corpus : terrain/corpus.crp', { exact: true })).toBeVisible({ timeout: 30_000 })
  return modal
}
export async function ouvrirReprise(page: Page) {
  await attendreAccueil(page)
  await page.locator('.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab', exact: true }).click()
  await page.getByRole('button', { name: 'Reprendre un passage à SonalPi2…' }).click()
  return page.getByRole('dialog', { name: 'Reprendre un passage à SonalPi2', exact: true })
}
export async function preparer(page: Page, source: Projet, cible: Projet, urlMedia?: string, nombreEntretiens = 4) {
  const modal = await connecterSource(page, source)
  await modal.getByLabel('Adresse du nouveau projet GitLab', { exact: true }).fill(adresse(cible))
  if (urlMedia) {
    await modal.getByLabel('Copier les médias dans un espace externe', { exact: true }).check()
    await modal.getByLabel('Dossier média Nextcloud / WebDAV', { exact: true }).fill(urlMedia)
    await modal.getByLabel('Login média', { exact: true }).fill(accesMedia.utilisateur)
    await modal.getByLabel('Mot de passe d’application média', { exact: true }).fill(accesMedia.motDePasse)
  }
  await modal.getByRole('button', { name: 'Préparer le bilan', exact: true }).click()
  await expect(modal.locator('.bilan, [role=alert]').first()).toBeVisible({ timeout: 90_000 })
  expect(await modal.getByRole('alert').allTextContents()).toEqual([])
  await expect(modal.getByRole('region', { name: 'Bilan de migration' })).toContainText(`${nombreEntretiens} entretien(s) vérifié(s), 3 média(s)`)
  return modal
}
export async function lireMedias(page: Page, externe: boolean) {
  for (const titre of ['Audio riche', 'Vidéo']) {
    const carte = page.locator('.carte-ent', { hasText: titre })
    await carte.locator('.crayon').click()
    await expect(page.locator('.editeur')).toBeVisible({ timeout: 30_000 })
    if (externe) await page.getByRole('button', { name: 'Lire depuis le serveur', exact: true }).click()
    if (externe && titre === 'Vidéo') {
      await expect(page.getByText('La lecture distante de ce format n’est pas encore prise en charge.', { exact: false })).toBeVisible()
      await retourCorpus(page)
      continue
    }
    const media = page.locator(titre === 'Vidéo' ? 'video[data-sonal]' : 'audio[data-sonal]')
    await expect.poll(() => media.evaluate((e: HTMLMediaElement) => e.duration), { timeout: 30_000 }).toBeGreaterThan(5)
    await page.locator('button.play').click()
    await expect.poll(() => media.evaluate((e: HTMLMediaElement) => e.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.2)
    await page.locator('button.play').click()
    const duree = await media.evaluate((e: HTMLMediaElement) => e.duration)
    for (const ratio of [0.7, 0.2]) {
      await media.evaluate((e: HTMLMediaElement, t) => { e.currentTime = t }, duree * ratio)
      await expect.poll(() => media.evaluate((e: HTMLMediaElement) => ({ temps: e.currentTime, pret: e.readyState, cherche: e.seeking })), { timeout: 30_000 })
        .toMatchObject({ temps: expect.closeTo(duree * ratio, 0), pret: expect.any(Number), cherche: false })
      expect(await media.evaluate((e: HTMLMediaElement) => e.readyState)).toBeGreaterThanOrEqual(2)
    }
    await retourCorpus(page)
  }
}
export async function ouvrirProfilNeuf(page: Page, cible: Projet, urlMedia?: string) {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab', exact: true }).click()
  await page.locator('.url-projet-gitlab').fill(adresse(cible))
  await page.locator('.modale-distant select').first().selectOption('jeton-personnel')
  await page.locator('.modale-distant input[type=password]').fill(config.token!)
  await page.locator('.action-gitlab').click()
  await expect(page.locator('.modale-distant')).toBeHidden({ timeout: 30_000 })
  await fermerAiguillage(page, 'entretiens', 30_000)
  await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
  await attendreCorpus(page)
  if (!urlMedia) return
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab', exact: true }).click()
  const destination = page.locator('.comptes li').first()
  await destination.getByRole('button', { name: 'Médias…', exact: true }).click()
  const form = destination.locator('.base-media-form')
  await form.locator('input[type=text]').nth(0).fill(urlMedia)
  await form.locator('input[type=text]').nth(1).fill(accesMedia.utilisateur)
  await form.locator('input[type=password]').fill(accesMedia.motDePasse)
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(destination.locator('.base-media-etat')).toContainText('max')
  await destination.getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(page.locator('.modale-distant')).toBeHidden({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
  await attendreCorpus(page)
}
