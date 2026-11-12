/**
 *  SCÉNARIO E2E — AUDIO DISTANT sur la pile
 *  Nextcloud Docker (pile A, :8080). Deux instances Electron réelles :
 *
 *  1. MAX ouvre le corpus distant, sélectionne « Entretien partagé » et
 *  DÉSIGNE son audio dans le Nextcloud : la modale s'ouvre, il
 *  TÉLÉVERSE un fichier de son poste (« ➕ Téléverser… », dialogue natif
 *  simulé) — le fichier part sur le serveur ET l'entretien est désigné
 *  (micro-session, un seul geste) ;
 *  → assertions SERVEUR : `audios/demo-chant.mp3` présent,
 *  `entretiens/<ID>.json` porte `meta.audioDistant` ;
 *  2. OLIVIER ouvre le même corpus : le PULL rapatrie l'audio désigné dans
 *  SON miroir local (`userData/miroirs/<id>/…`) — asserté sur disque ;
 *  3. OLIVIER ouvre « Entretien sans son », dont la désignation pointe vers
 *  un fichier ABSENT du serveur : le pull l'a signalé inaccessible et le
 *  LECTEUR affiche l'étiquette d'état explicative (« 🔒 … droits ») avec
 *  son bouton « Réessayer ».
 *
 *  Skippé si la pile ne répond pas (`npm run nc:up`, sans reprovisionnement).
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, ouvrirPremierCompteDistant } from './util'
import { ClientWebDAV } from '../src/main/webdav/client'
import { idDeCorpus } from '../src/main/distant/coffre'
import { FORMAT_VERSION, type CorpusFichier } from '../src/shared/format'

const BASE = 'http://localhost:8080' // pile A : NC31 + files_lock
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
const URL_MAX = `${BASE}/remote.php/dav/files/max/MonCorpus`
const URL_OLIVIER = `${BASE}/remote.php/dav/files/olivier/MonCorpus`
const ID = 'ent-audio-e2e' // sera désigné + téléversé par max
const ID_SANS_SON = 'ent-audio-e2e-bis' // désigné VERS un fichier absent (inaccessible)
const NOM_AUDIO = 'demo-chant.mp3'
/** MODE DÉMO : pauses narrées si DEMO_PAUSE_MS > 0 (parité multi-utilisateur). */
const DEMO = Number(process.env.DEMO_PAUSE_MS ?? 0) > 0

function client(urlDav: string, qui: { utilisateur: string; motDePasse: string }) {
  return new ClientWebDAV({ baseUrl: urlDav, identifiants: qui })
}

const pret = (): Promise<boolean> =>
  fetch(`${BASE}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)

/* ── État serveur connu, auto-porteur ──────────────────────────────────────*/

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Démo audio distant',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      [ID]: { titre: 'Entretien partagé', date: null, lastModified: '2026-01-01T00:00:00Z' },
      [ID_SANS_SON]: { titre: 'Entretien sans son', date: null, lastModified: '2026-01-01T00:00:00Z' },
    },
  }
  return JSON.stringify(c, null, 2)
}

function entretienInitial(designation?: { chemin: string }): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Entretien du scénario audio.' }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null, ...(designation ? { audioDistant: designation } : {}) },
  })
}

async function purgerPresence(c: ClientWebDAV): Promise<void> {
  for (const e of await c.propfind('presence').catch(() => [])) {
    if (e.chemin !== '') await c.supprimer(`presence/${e.chemin}`).catch(() => {})
  }
}

async function amorcer(): Promise<{ original: string | null }> {
  const c = client(URL_MAX, MAX)
  let original: string | null = null
  try {
    original = await c.getTexte('corpus.crp')
  } catch {
    /* pas encore de corpus */
  }
  await c.putTexte('corpus.crp', corpusInitial())
  await c.putTexte(`entretiens/${ID}.json`, entretienInitial())
  // Désignation SANS fichier derrière : le cas « inaccessible » (droits ou
  // fichier disparu) — matière de l'étiquette du lecteur côté olivier.
  await c.putTexte(`entretiens/${ID_SANS_SON}.json`, entretienInitial({ chemin: 'audios/manquant.mp3' }))
  // Résidus d'un passage antérieur : audios/, verrous, présences.
  for (const e of await c.propfind('audios').catch(() => [])) {
    if (!e.dossier) await c.supprimer(`audios/${e.chemin}`).catch(() => {})
  }
  await c.supprimer(`${NOM_AUDIO}`).catch(() => {})
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.supprimer(`verrous/${ID_SANS_SON}.lock.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID_SANS_SON}.json`).catch(() => {})
  // Verrou CORPUS (définitions) laissé par un passage interrompu : sans nettoyage
  // il bloque toute mutation du corpus partagé (< 24 h).
  await c.supprimer('verrous/corpus.lock.json').catch(() => {})
  await purgerPresence(c)
  return { original }
}

async function nettoyer(original: string | null): Promise<void> {
  const c = client(URL_MAX, MAX)
  if (original !== null) await c.putTexte('corpus.crp', original).catch(() => {})
  else await c.supprimer('corpus.crp').catch(() => {})
  await c.supprimer(`entretiens/${ID}.json`).catch(() => {})
  await c.supprimer(`entretiens/${ID_SANS_SON}.json`).catch(() => {})
  await c.supprimer(NOM_AUDIO).catch(() => {})
  for (const e of await c.propfind('audios').catch(() => [])) {
    if (!e.dossier) await c.supprimer(`audios/${e.chemin}`).catch(() => {})
  }
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.supprimer(`verrous/${ID_SANS_SON}.lock.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID_SANS_SON}.json`).catch(() => {})
  await c.supprimer('verrous/corpus.lock.json').catch(() => {})
}

/* ── Gestes UI ──────────────────────────────────────────────────────────────*/

async function pause(page: Page, quoi: string): Promise<void> {
  if (DEMO) console.log(`   ▶ ${quoi}`)
  await page.waitForTimeout(DEMO ? Number(process.env.DEMO_PAUSE_MS ?? 2500) : 100)
}

/** Depuis l'ACCUEIL : connexion au corpus distant + ouverture (écran Corpus). */
async function connecterEtOuvrir(
  page: Page,
  urlDav: string,
  u: string,
  mdp: string,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await page.locator('.modale-distant input.champ').nth(0).fill(urlDav)
  await page.locator('.modale-distant input.champ').nth(1).fill(u)
  await page.locator('.modale-distant input[type=password]').fill(mdp)
  await page.locator('.modale-distant .valider').click()
  await ouvrirPremierCompteDistant(page, mdp)
}

/** Simule le dialogue natif de fichier : le main répondra TOUJOURS `fichier`.
 *  (Le renderer ne touche jamais au disque ; c'est bien le module `dialog` du
 *  MAIN process qu'on neutralise ici.) */
async function simulerDialogueFichier(app: ElectronApplication, fichier: string): Promise<void> {
  await app.evaluate(
    ({ dialog }, f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    },
    fichier,
  )
}

test.describe.configure({ mode: 'serial' })

test('audio distant : téléverser+désigner chez max, pull miroir chez olivier, état inaccessible', async ({}, testInfo) => {
  test.setTimeout(300_000)
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up`, sans reprovisionnement')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'e2e-audio-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'e2e-audio-oli-'))
  const appMax = await lancer(dirMax)
  let appOlivier: ElectronApplication | null = null
  try {
    const pMax = await appMax.firstWindow()
    pMax.on('pageerror', (e) => console.log('⚠️ [max] pageerror:', e.message))

    /* 1. MAX ouvre le corpus distant. */
    await pause(pMax, 'Max ouvre le corpus distant…')
    await connecterEtOuvrir(pMax, URL_MAX, MAX.utilisateur, MAX.motDePasse)

    /* 2. Il sélectionne « Entretien partagé » puis désigne son audio :
     *  modale de navigation ➕ Téléverser (dialogue simulé) → PUT serveur +
     *  désignation publiée, en un seul geste. */
    await pause(pMax, 'Max sélectionne l’entretien partagé…')
    await pMax.locator('.carte-ent', { hasText: 'Entretien partagé' }).click()
    await expect(pMax.locator('.panneau.meta-ent')).toBeVisible({ timeout: 10_000 })

    const fichierLocal = join(dirMax, 'demo-chant.mp3')
    writeFileSync(fichierLocal, 'FAUX-MP3 — contenu de test')
    await simulerDialogueFichier(appMax, fichierLocal)

    await pause(pMax, 'Max ouvre « Désigner dans le Nextcloud… » et téléverse son fichier…')
    await pMax.locator('.mini.assigner-audio', { hasText: 'Désigner dans le Nextcloud…' }).click()
    await expect(pMax.locator('.modale-designation')).toBeVisible({ timeout: 10_000 })
    await pMax.locator('.item.ajouter').click()

    // Succès = modale refermée (désignation publiée dans la foulée).
    await expect(pMax.locator('.modale-designation')).toBeHidden({ timeout: 30_000 })

    /* Assertions SERVEUR : le fichier est là, la désignation est publiée. */
    const cMax = client(URL_MAX, MAX)
    await expect
      .poll(async () => {
        try {
          return (await cMax.getBinaire(NOM_AUDIO)).length
        } catch {
          return 0
        }
      }, { timeout: 20_000 })
      .toBeGreaterThan(0)
    const jsonServeur = await cMax.getTexte(`entretiens/${ID}.json`)
    expect(jsonServeur).toContain('"audioDistant"')
    expect(jsonServeur).toContain(NOM_AUDIO)
    await pause(pMax, 'Fichier sur le serveur ✓, entretien désigné ✓')

    /* 3. OLIVIER ouvre le MÊME corpus : le pull d'ouverture rapatrie l'audio
     *  désigné dans SON miroir local — asserté sur disque. */
    console.log('③ Olivier ouvre : l’audio doit rejoindre son miroir…')
    appOlivier = await lancer(dirOlivier)
    const pOli = await appOlivier.firstWindow()
    pOli.on('pageerror', (e) => console.log('⚠️ [olivier] pageerror:', e.message))
    await connecterEtOuvrir(pOli, URL_OLIVIER, OLIVIER.utilisateur, OLIVIER.motDePasse)

    const copieOlivier = join(dirOlivier, 'miroirs', idDeCorpus(URL_OLIVIER, 'olivier'), NOM_AUDIO)
    await expect
      .poll(() => existsSync(copieOlivier), { timeout: 30_000 })
      .toBe(true)
    expect(readFileSync(copieOlivier, 'utf8')).toContain('FAUX-MP3')
    await pause(pOli, 'La copie locale d’Olivier est arrivée ✓')

    /* 4. « Entretien sans son » : désignation vers un fichier ABSENT — le
     *  lecteur montre l'état INACCESSIBLE avec message explicatif. */
    await pause(pOli, 'Olivier ouvre l’entretien dont l’audio est introuvable côté serveur…')
    await pOli.locator('.carte-ent', { hasText: 'Entretien sans son' }).locator('.crayon').click()
    await expect(pOli.locator('.editeur')).toBeVisible({ timeout: 20_000 })
    const etiquette = pOli.locator('.lecteur-etat')
    await expect(etiquette).toBeVisible({ timeout: 20_000 })
    await expect(etiquette).toContainText('inaccessible')
    await expect(etiquette).toContainText('droits')
    await expect(etiquette.locator('button', { hasText: 'Réessayer' })).toBeVisible()
  } finally {
    await appMax.close().catch(() => {})
    await appOlivier?.close().catch(() => {})
    await nettoyer(original)
  }
})
