/**
 * SCÉNARIO VISIBLE à deux postes (E4 — avant vrais utilisateurs) : DEUX
 * instances Electron réelles (poste MAX et poste OLIVIER) ouvrent le MÊME
 * corpus distant sur la pile Nextcloud Docker (pile A, :8080), et le cycle
 * complet du mode multi-utilisateur se déroule SOUS VOS YEUX :
 *
 *   1. chaque poste se connecte au serveur (« Corpus distant… ») et ouvre ;
 *   2. Max ouvre l'entretien (verrou acquis) et tape une phrase ;
 *   3. Olivier actualise : il VOIT le badge 🔒 max et le badge 👁 max
 *      (« ouvert par ») ; il ouvre l'entretien en LECTURE SEULE (bandeau) ;
 *   4. Max retourne au Corpus : publication finale + verrou libéré ;
 *   5. Olivier re-vérifie : plus de badge — il ouvre, édite à son tour,
 *      publie en fermant ;
 *   6. Max re-tire : il lit les DEUX phrases — le travail d'Olivier est là.
 *
 * Les pauses entre étapes rendent le déroulé observable. Les fenêtres des
 * deux postes sont réelles : lancez ce test SANS xvfb pour les voir côte à
 * côte (`npm run test:multiuser`, workers=1). Skippé si la pile ne répond pas
 * (`npm run nc:up && npm run nc:provision`).
 */

import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus } from './util'
import { ClientWebDAV } from '../src/main/webdav/client'
import { FORMAT_VERSION, type CorpusFichier } from '../src/shared/format'

const BASE = 'http://localhost:8080' // pile A : NC31 + files_lock (variante A)
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
const ID = 'ent-demo-multi'
/** Pause d'observation entre deux gestes (rend le scénario suivables à l'écran). */
const PAUSE = 2000

const pret = (): Promise<boolean> =>
  fetch(`${BASE}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)

/* ── État serveur connu, auto-porteur ──────────────────────────────────────*/

function clientMax() {
  return new ClientWebDAV({
    baseUrl: `${BASE}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
}

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Démo multi-utilisateur',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      [ID]: { titre: 'Entretien partagé', date: null, lastModified: '2026-01-01T00:00:00Z' },
    },
  }
  return JSON.stringify(c, null, 2)
}

function entretienInitial(): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Entretien commun du scénario.' }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null },
  })
}

async function amorcer(): Promise<{ original: string | null }> {
  const c = clientMax()
  let original: string | null = null
  try {
    original = await c.getTexte('corpus.json')
  } catch {
    /* pas encore de corpus */
  }
  await c.putTexte('corpus.json', corpusInitial())
  await c.putTexte(`entretiens/${ID}.json`, entretienInitial())
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
  // Présences résiduelles d'un passage antérieur : encore fraîches (< 10 min)
  // elles produiraient des badges fantômes. Purge best effort.
  for (const e of await c.propfind('presence').catch(() => [])) {
    if (e.chemin !== '' ) await c.supprimer(`presence/${e.chemin}`).catch(() => {})
  }
  return { original }
}

async function nettoyer(original: string | null): Promise<void> {
  const c = clientMax()
  // Le banc contrat lit corpus.json : restaurer l'état d'avant la démo.
  if (original !== null) await c.putTexte('corpus.json', original).catch(() => {})
  else await c.supprimer('corpus.json').catch(() => {})
  await c.supprimer(`entretiens/${ID}.json`).catch(() => {})
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
}

/* ── Gestes UI ──────────────────────────────────────────────────────────────*/

/** Depuis l'ACCUEIL : « Corpus distant… » → connexion → Ouvrir → écran Corpus. */
async function connecterEtOuvrir(page: Page, urlDav: string, u: string, mdp: string): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  // La modale : URL, login, mot de passe d'application, « Se connecter ».
  await page.locator('.modale-distant input.champ').nth(0).fill(urlDav)
  await page.locator('.modale-distant input.champ').nth(1).fill(u)
  await page.locator('.modale-distant input[type=password]').fill(mdp)
  await page.locator('.modale-distant .valider').click()
  // Compte connecté : la liste des comptes apparaît avec son bouton « Ouvrir ».
  await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(PAUSE)
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  await attendreCorpus(page)
  await page.waitForTimeout(PAUSE)
}

/** Ouvre l'n-ième entretien (crayon de sa carte). */
async function ouvrirEntretien(page: Page, nth = 0): Promise<void> {
  await page.locator('.carte-ent .crayon').nth(nth).click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 20_000 })
}

/** Retour au Corpus via le fil d'Ariane (= fermeture de session : publication
 *  finale PUIS libération du verrou, §4.4). */
async function retourAuCorpus(page: Page): Promise<void> {
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  await attendreCorpus(page)
  await page.waitForTimeout(PAUSE)
}

/** Tape une phrase À LA FIN du texte de l'entretien ouvert. */
async function taperFin(page: Page, phrase: string): Promise<void> {
  await page.locator('.editeur').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(phrase, { delay: 30 }) // frappe visible
  await page.waitForTimeout(1500) // laisse l'autosave marquer la session sale
}

test.describe.configure({ mode: 'serial' })

test('démo visible : deux postes, un verrou, zéro écrasement', async ({ }, testInfo) => {
  test.setTimeout(300_000) // deux lancements Electron + pauses d'observation
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-mu-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-mu-oli-'))
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()

    /* 1. Les deux postes se connectent au même serveur, chacun SON compte
     *    (son chemin DAV propre), et ouvrent le corpus distant. */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)

    /* 2. Max ouvre l'entretien (verrou acquis) et écrit. */
    console.log('② Max ouvre l’entretien et tape sa phrase…')
    await ouvrirEntretien(pMax)
    if (!(await clientMax().etatVerrouNatif(`entretiens/${ID}.json`))?.verrouille) {
      throw new Error('verrou de max absent côté serveur après ouverture')
    }
    // Erreurs renderer → sortie du test (diagnostic).
    pMax.on('pageerror', (e) => console.log('⚠️ [max] pageerror:', e.message))
    await taperFin(pMax, ' Phrase ajoutée par Max.')
    await pMax.waitForTimeout(PAUSE)

    /* 3. Olivier actualise : badges 🔒 (verrou) ET 👁 (présence) visibles ;
     *    l'ouverture passe en LECTURE SEULE avec bandeau nominatif. */
    console.log("③ Olivier voit 🔒 max et 👁 max, puis l'ouvre en lecture seule…")
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await expect(pOli.locator('.badge-presence', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await pOli.waitForTimeout(PAUSE)
    await ouvrirEntretien(pOli)
    await expect(pOli.locator('.banniere-ro')).toContainText('max', { timeout: 20_000 })
    await expect(pOli.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    // Le texte de Max n'est PAS encore publié : olivier voit l'ancienne version.
    await expect(pOli.locator('.editeur')).not.toContainText('Phrase ajoutée par Max.')
    await pOli.waitForTimeout(PAUSE)
    await retourAuCorpus(pOli)

    /* 4. Max retourne au Corpus : publication FINALE puis libération (§4.4). */
    console.log('④ Max ferme : publication finale + libération du verrou…')
    const copies = await clientMax().propfind('sessions').catch(() => [] as { chemin: string }[])
    if (copies.length > 0) console.log('⚠️ copies de divergence déjà là:', JSON.stringify(copies))
    await retourAuCorpus(pMax)
    const verrouApres = await clientMax().etatVerrouNatif(`entretiens/${ID}.json`)
    if (verrouApres?.verrouille) console.log('⚠️ verrou ENCORE tenu après fermeture de max:', JSON.stringify(verrouApres))
    await pMax.waitForTimeout(PAUSE)

    /* 5. Olivier re-vérifie : plus de badge 🔒 — il édite à son tour. */
    console.log("⑤ Olivier rouvre l'entretien libre et édite…")
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    // Le pull a ramené la publication finale de max : son texte est là.
    await ouvrirEntretien(pOli)
    await expect(pOli.locator('.editeur')).not.toHaveAttribute('contenteditable', 'false')
    await expect(pOli.locator('.banniere-ro')).toHaveCount(0)
    await expect(pOli.locator('.editeur')).toContainText('Phrase ajoutée par Max.', { timeout: 20_000 })
    await taperFin(pOli, ' Phrase ajoutée par Olivier.')
    await retourAuCorpus(pOli)

    /* 6. Max re-tire : il lit LES DEUX phrases — zéro écrasement. */
    console.log("⑥ Max re-synchronise et lit les deux contributions…")
    await pMax.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await ouvrirEntretien(pMax)
    await expect(pMax.locator('.editeur')).toContainText('Phrase ajoutée par Max.', { timeout: 20_000 })
    await expect(pMax.locator('.editeur')).toContainText('Phrase ajoutée par Olivier.', { timeout: 20_000 })
    console.log('✅ Scénario terminé — les fenêtres restent affichées 5 s.')
    await pMax.waitForTimeout(5000)
    await testInfo.attach('fin', { body: 'scénario multi-utilisateur OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})
