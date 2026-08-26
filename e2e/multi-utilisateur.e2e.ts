/**
 * SCÉNARIO VISIBLE à deux postes : DEUX
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
 * Le fichier porte un SECOND scénario (même mécanique de narration) :
 * « démo visible : métadonnées sous verrou ». Max crée une VARIABLE
 * d'entretien (« Ville » / modalité « Lyon ») depuis l'ONGLET DONNÉE de
 * l'Entretien — publié aussitôt par la transaction de définitions.
 * Olivier ouvre la BASE DE DONNÉES (Table de données) au niveau Corpus :
 *   - elle reste ACCESSIBLE et interactive (jamais lecture seule) ;
 *   - la colonne « Ville » y apparaît après Actualiser (définitions partagées) ;
 *   - la LIGNE de l'entretien verrouillé par max est NON ÉDITABLE (garde
 *     par ligne, cellules désactivées) ;
 *   - dès que le verrou change de mains, la MÊME saisie passe (via l'onglet
 *     Donnée de l'Entretien, seul écran où le verrou autorise d'écrire) et la
 *     table la montre au prochain tirage.
 *
 * MISE EN SCÈNE (mode démo UNIQUEMENT) : chaque fenêtre est NARRÉE par un
 * bandeau en haut d'écran (« Max ouvre le corpus… ») et les deux fenêtres
 * sont placées CÔTE À CÔTE (moitié gauche / moitié droite de l'écran — sinon
 * elles se superposent).
 *
 * TROISIÈME scénario : écriture de valeurs SANS
 * session, les deux gestes. Un SECOND entretien est amorcé pour avoir deux
 * lignes cibles. Max ouvre l'entretien 1 (verrou). Olivier lance le LOT sur la
 * colonne « Ville » : l'entretien LIBRE est modifié, celui de max est REFUSÉ
 * nommément (« ouvert par max ») — sans bloquer le reste du lot. Max referme ;
 * Olivier utilise alors le BOUTON LIGNE « Saisir… » : il atterrit sur l'onglet
 * Donnée de CET entretien, saisit sa valeur, publiée à la fermeture.
 *
 * QUATRIÈME scénario : saisie par CELLULE
 * avec garde PAR LIGNE. Max crée « Ville » puis referme ; Olivier ouvre la
 * table (deux lignes libres, cellules actives). Max REPREND le verrou dans le
 * dos d'Olivier (badges pas encore à jour) : l'édition de la cellule verrouillée
 * est REFUSÉE EN INLINE (bord rouge + raison « ouvert par max ») sans bloquer
 * la suite ; l'autre ligne passe, Shift+Entrée remonte la colonne.
 * Actualiser révèle alors le badge 🔒 et désactive SA ligne (garde par ligne) ;
 * dès que le verrou change de mains, la MÊME cellule accepte la valeur.
 *
 * DEUX RYTHMES, même scénario et mêmes ASSERTIONS :
 *   - SUITE DE TEST (`npm run test:e2e`) : mode EFFICACE par défaut — pauses
 *     minimales, pas de narration, frappe instantanée (~40 s) ;
 *   - DÉMO (`DEMO_PAUSE_MS=4000 npm run test:multiuser`) : bandeaux de
 *     narration, pauses d'observation, frappe visible — à regarder sans xvfb.
 *   Réglage fin : DEMO_PAUSE_MS=8000 pour un rythme encore plus calme.
 * Skippé si la pile ne répond pas (`npm run nc:up && npm run nc:provision`).
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
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
const ID2 = 'ent-demo-multi-2' // second entretien : deux lignes cibles pour le lot
/** MODE DÉMO : actif seulement si DEMO_PAUSE_MS > 0. Sans variable (suite de
 *  test), le scénario tourne en mode EFFICACE : mêmes gestes et mêmes
 *  assertions, pauses minimales, pas de bandeaux ni de frappe ralentie. */
const DEMO = Number(process.env.DEMO_PAUSE_MS ?? 0) > 0
const PAUSE = Number(process.env.DEMO_PAUSE_MS ?? 250)
if (!DEMO && process.argv.some((a) => a.includes('DEMO_PAUSE_MS')))
  console.warn(
    '⚠️ DEMO_PAUSE_MS passé APRÈS `npm run` est ignoré par npm (jamais mis dans env).\n' +
      '   Syntaxe correcte : DEMO_PAUSE_MS=4000 npm run test:multiuser',
  )

/* ── Mise en scène : narration à l'écran + fenêtres côte à côte ───────────*/

/** Affiche un bandeau EN HAUT DE LA FENÊTRE du poste (« Max ouvre le
 *  corpus… »). Mode démo uniquement — en suite de test, no-op. */
async function narrer(page: Page, texte: string): Promise<void> {
  if (!DEMO) return
  console.log(`   ▶ ${texte}`)
  await page
    .evaluate((t) => {
      let el = document.getElementById('demo-narration') as HTMLDivElement | null
      if (!el) {
        el = document.createElement('div')
        el.id = 'demo-narration'
        Object.assign(el.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          zIndex: '99999',
          background: '#1d4fa1',
          color: '#fff',
          padding: '10px 16px',
          font: '600 15px system-ui, sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
        })
        document.body.appendChild(el)
      }
      el.textContent = t
    }, texte)
    .catch(() => {}) // la narration ne doit jamais faire tomber la démo
}

/** Place la fenêtre du poste sur UNE MOITIÉ de l'écran — sinon les deux
 *  instances se superposent et on n'en voit qu'une. Ré-affirme les bornes
 *  après 1,5 s : certains gestionnaires de fenêtres (WSLg…) replacent ou
 *  redimensionnent la fenêtre après le show. Verbeux : les bornes réellement
 *  appliquées sont loguées pour diagnostiquer un refus du WM. */
async function placerFenetre(app: ElectronApplication, cote: 'gauche' | 'droite'): Promise<void> {
  const resultat = await app
    .evaluate(({ screen, BrowserWindow }, c) => {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize
      const win = BrowserWindow.getAllWindows()[0]
      const demi = Math.floor(width / 2)
      const b = { x: c === 'gauche' ? 0 : demi, y: 0, width: demi, height }
      win.setBounds(b)
      setTimeout(() => {
        try {
          win.setBounds(b) // re-affirmation anti-WM
        } catch {
          /* fenêtre déjà fermée en fin de démo */
        }
      }, 1500)
      return { demandees: b, appliquees: win.getBounds() }
    }, cote)
    .then((r) => r)
    .catch((e) => ({ erreur: String(e) }))
  console.log(`🪟 fenêtre ${cote} :`, JSON.stringify(resultat))
}

async function pause(page: Page, quoi: string): Promise<void> {
  await narrer(page, quoi)
  await page.waitForTimeout(DEMO ? PAUSE : 100)
}

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
      [ID2]: { titre: 'Entretien bis', date: null, lastModified: '2026-01-01T00:00:00Z' },
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
  await c.putTexte(`entretiens/${ID2}.json`, entretienInitial())
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.supprimer(`verrous/${ID2}.lock.json`).catch(() => {})
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
  await c.supprimer(`entretiens/${ID2}.json`).catch(() => {})
  await c.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await c.supprimer(`verrous/${ID2}.lock.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
  await c.deverrouiller(`entretiens/${ID2}.json`).catch(() => {})
}

/* ── Gestes UI ──────────────────────────────────────────────────────────────*/

/** Depuis l'ACCUEIL : « Corpus distant… » → connexion → Ouvrir → écran Corpus.
 *  Chaque sous-geste est narré sur la fenêtre du poste. */
async function connecterEtOuvrir(
  page: Page,
  qui: string,
  urlDav: string,
  u: string,
  mdp: string,
): Promise<void> {
  await attendreAccueil(page)
  await pause(page, `${qui} est sur l'accueil — il choisit « Corpus distant… »`)
  await page.locator('.carte-demo.distant-corpus').click()
  await pause(page, `${qui} saisit l'URL du corpus, son login et son mot de passe d'application…`)
  // La modale : URL, login, mot de passe d'application, « Se connecter ».
  await page.locator('.modale-distant input.champ').nth(0).fill(urlDav)
  await page.locator('.modale-distant input.champ').nth(1).fill(u)
  await page.locator('.modale-distant input[type=password]').fill(mdp)
  await narrer(page, `${qui} se connecte au serveur Nextcloud…`)
  await page.locator('.modale-distant .valider').click()
  // Compte connecté : la liste des comptes apparaît avec son bouton « Ouvrir ».
  await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 20_000 })
  await pause(page, `Compte connecté ✓ — ${qui} ouvre le corpus partagé…`)
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  await attendreCorpus(page)
  await pause(page, `${qui} voit le corpus distant : l'entretien « Entretien partagé » est à lui seul au monde…`)
}

/** Ouvre l'n-ième entretien (crayon de sa carte). */
async function ouvrirEntretien(page: Page, nth = 0): Promise<void> {
  await page.locator('.carte-ent .crayon').nth(nth).click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 20_000 })
}

/** Retour au Corpus via le fil d'Ariane (= fermeture de session :
 *  publication finale PUIS libération du verrou). */
async function retourAuCorpus(page: Page): Promise<void> {
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  await attendreCorpus(page)
  await page.waitForTimeout(PAUSE)
}

/** Tape une phrase À LA FIN du texte de l'entretien ouvert. */
async function taperFin(page: Page, phrase: string): Promise<void> {
  await page.locator('.editeur').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(phrase, { delay: DEMO ? 30 : 0 }) // frappe visible en démo
  await page.waitForTimeout(1200) // laisse l'autosave (debounce 600 ms) marquer la session sale
}

test.describe.configure({ mode: 'serial' })

test('démo visible : deux postes, un verrou, zéro écrasement', async ({ }, testInfo) => {
  test.setTimeout(DEMO ? 600_000 : 240_000) // démo : pauses + frappe ralentie
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-mu-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-mu-oli-'))
  console.log('🚀 Lancement des deux postes (deux instances Electron réelles)…')
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()
    // Sinon les DEUX fenêtres se superposent — on n'en voit qu'une.
    await placerFenetre(appMax, 'gauche')
    await placerFenetre(appOlivier, 'droite')
    // Annonce des écrans pour que chacun sache qui est qui.
    await pause(pMax, "Ici, c'est l'écran de Max")
    await pause(pOli, "Ici, c'est l'écran d'Olivier")

    /* 1. Les deux postes se connectent au même serveur, chacun SON compte
     *    (son chemin DAV propre), et ouvrent le corpus distant. */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, 'Max', `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, 'Olivier', `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)

    /* 2. Max ouvre l'entretien (verrou acquis) et écrit. */
    console.log('② Max ouvre l’entretien et tape sa phrase…')
    await pause(pMax, 'Max ouvre l’entretien : le VERROU lui est accordé (personne d’autre ne peut écrire)…')
    await ouvrirEntretien(pMax)
    if (!(await clientMax().etatVerrouNatif(`entretiens/${ID}.json`))?.verrouille) {
      throw new Error('verrou de max absent côté serveur après ouverture')
    }
    // Erreurs renderer → sortie du test (diagnostic), sur LES DEUX fenêtres.
    for (const [nom, p] of [
      ['max', pMax],
      ['olivier', pOli],
    ] as const) {
      p.on('pageerror', (e) => console.log(`⚠️ [${nom}] pageerror:`, e.message))
      p.on('console', (m) => {
        if (m.type() === 'error' || m.text().includes('🧵'))
          console.log(`⚠️ [${nom}] console.${m.type()}:`, m.text())
      })
    }
    await pause(pMax, 'Max tape sa phrase — les modifications restent locales (« ● non publiées »)…')
    await taperFin(pMax, ' Phrase ajoutée par Max.')
    await pMax.waitForTimeout(PAUSE)

    /* 3. Olivier actualise : badges 🔒 (verrou) ET 👁 (présence) visibles ;
     *    l'ouverture passe en LECTURE SEULE avec bandeau nominatif. */
    console.log("③ Olivier voit 🔒 max et 👁 max, puis l'ouvre en lecture seule…")
    await narrer(pOli, 'Olivier clique « Actualiser » pour voir l’état du serveur…')
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await expect(pOli.locator('.badge-presence', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await pause(pOli, 'Olivier VOIT le verrou 🔒 de max ET sa présence 👁 (« ouvert par »)…')
    // Écran étroit : le badge du titre peut être tronqué — le CRAYON devient
    // verrou, l'explication passe au tooltip.
    await expect(pOli.locator('.carte-ent .crayon').first()).toHaveText('🔒', { timeout: 20_000 })
    await narrer(pOli, "Olivier ouvre l'entretien malgré tout…")
    await ouvrirEntretien(pOli)
    await expect(pOli.locator('.banniere-ro')).toContainText('max', { timeout: 20_000 })
    await expect(pOli.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    // Le texte de Max n'est PAS encore publié : olivier voit l'ancienne version.
    await expect(pOli.locator('.editeur')).not.toContainText('Phrase ajoutée par Max.')
    await pause(pOli, 'Lecture seule avec bandeau nominatif — et le texte de Max n’est pas encore publié…')
    await retourAuCorpus(pOli)

    /* 4. Max retourne au Corpus : publication FINALE puis libération. */
    console.log('④ Max ferme : publication finale + libération du verrou…')
    const copies = await clientMax().propfind('sessions').catch(() => [] as { chemin: string }[])
    if (copies.length > 0) console.log('⚠️ copies de divergence déjà là:', JSON.stringify(copies))
    await narrer(pMax, 'Max retourne au corpus : publication FINALE puis libération du verrou…')
    await retourAuCorpus(pMax)
    const verrouApres = await clientMax().etatVerrouNatif(`entretiens/${ID}.json`)
    if (verrouApres?.verrouille) console.log('⚠️ verrou ENCORE tenu après fermeture de max:', JSON.stringify(verrouApres))
    await pause(pMax, 'Le verrou est rendu — l’entretien redevient libre pour olivier…')

    /* 5. Olivier re-vérifie : plus de badge 🔒 — il édite à son tour. */
    console.log("⑤ Olivier rouvre l'entretien libre et édite…")
    await narrer(pOli, 'Olivier actualise : le verrou de max a disparu !')
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    // Le pull a ramené la publication finale de max : son texte est là.
    await pause(pOli, "Plus aucun badge 🔒 — il ouvre l'entretien libre…")
    await ouvrirEntretien(pOli)
    await expect(pOli.locator('.editeur')).not.toHaveAttribute('contenteditable', 'false')
    await expect(pOli.locator('.banniere-ro')).toHaveCount(0)
    await expect(pOli.locator('.editeur')).toContainText('Phrase ajoutée par Max.', { timeout: 20_000 })
    await narrer(pOli, 'Il lit la phrase de max (publiée) puis tape la sienne…')
    await taperFin(pOli, ' Phrase ajoutée par Olivier.')
    await narrer(pOli, 'Olivier referme : sa version part à son tour sur le serveur…')
    await retourAuCorpus(pOli)

    /* 6. Max re-tire : il lit LES DEUX phrases — zéro écrasement. */
    console.log("⑥ Max re-synchronise et lit les deux contributions…")
    await narrer(pMax, 'Max resynchronise (« Actualiser ») et rouvre l’entretien…')
    await pMax.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await ouvrirEntretien(pMax)
    await expect(pMax.locator('.editeur')).toContainText('Phrase ajoutée par Max.', { timeout: 20_000 })
    await expect(pMax.locator('.editeur')).toContainText('Phrase ajoutée par Olivier.', { timeout: 20_000 })
    await narrer(pMax, '✅ Les DEUX contributions coexistent — zéro écrasement, zéro perte.')
    console.log('✅ Scénario terminé — les fenêtres restent affichées 8 s.')
    if (DEMO) await pMax.waitForTimeout(8000) // temps de regarder les fenêtres
    await testInfo.attach('fin', { body: 'scénario multi-utilisateur OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})

/* ── Scénario 2 : métadonnées créées SOUS VERROU ───────────────────────────*/
/** Depuis l'écran Corpus : Actualiser (pull) puis « Ouvrir la base de
 *  données » → écran Table de données. */
async function ouvrirBaseDonnees(page: Page): Promise<void> {
  await page.locator('.btn-table', { hasText: 'Actualiser' }).click()
  await page.locator('.btn-table', { hasText: 'base de données' }).click()
  await expect(page.locator('.donnees-ecran')).toBeVisible({ timeout: 20_000 })
}

/** Barrière de synchronisation : chaque mutation de DÉFINITIONS est publiée
 *  au serveur AVANT que sa promesse ne retombe, mais la promesse n'est PAS
 *  attendue par les handlers Vue (@change…) — deux gestes rapprochés peuvent
 *  se chevaucher et le second se faire refuser le verrou corpus (« Définitions
 *  en cours de modification… », course observée en e2e). On attend donc que
 *  le serveur PORTE la mutation avant d'enchaîner le geste suivant. */
async function attendreDefinitionServeur(frag: string): Promise<void> {
  await expect
    .poll(() => clientMax().getTexte('corpus.json').then((t) => t?.includes(frag)), {
      timeout: 20_000,
      intervals: [200],
    })
    .toBe(true)
}

test('démo visible : MÉTADONNÉES sous verrou — variable d’entretien, table accessible, ligne verrouillée bloquée', async ({ }, testInfo) => {
  test.setTimeout(DEMO ? 600_000 : 240_000)
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-var-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-var-oli-'))
  console.log('🚀 Lancement des deux postes (deux instances Electron réelles)…')
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()
    await placerFenetre(appMax, 'gauche')
    await placerFenetre(appOlivier, 'droite')
    // Annonce des écrans pour que chacun sache qui est qui.
    await pause(pMax, "Ici, c'est l'écran de Max")
    await pause(pOli, "Ici, c'est l'écran d'Olivier")

    /* 1. Connexion des deux postes (mêmes gestes que le scénario verrou/texte). */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, 'Max', `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, 'Olivier', `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)
    // Erreurs renderer → sortie du test (diagnostic), sur LES DEUX fenêtres.
    for (const [nom, p] of [
      ['max', pMax],
      ['olivier', pOli],
    ] as const) {
      p.on('pageerror', (e) => console.log(`⚠️ [${nom}] pageerror:`, e.message))
      p.on('console', (m) => {
        if (m.type() === 'error' || m.text().includes('🧵'))
          console.log(`⚠️ [${nom}] console.${m.type()}:`, m.text())
      })
    }

    /* 2. Max ouvre l'entretien (verrou acquis) puis crée une VARIABLE
     *    D'ENTRETIEN depuis l'onglet Donnée : la transaction de définitions
     *    publie corpus.json IMMÉDIATEMENT, sans attendre la fermeture. */
    console.log("② Max crée une variable d'entretien depuis l'onglet Donnée…")
    await pause(pMax, "Max ouvre l'entretien : le VERROU lui est accordé…")
    await ouvrirEntretien(pMax)
    await pause(pMax, "Dans l'onglet Donnée, il ouvre l'édition des variables (✏️)…")
    await pMax.locator('.onglets button[data-onglet="donnees"]').click()
    await pMax.locator('.panneau.donnees .crayon').click()
    await expect(pMax.locator('.modale-vars')).toBeVisible({ timeout: 20_000 })
    await narrer(pMax, "Il crée la variable d'entretien « Ville » avec la modalité « Lyon »…")
    await pMax.locator('.modale-vars .corpus-tete .mini', { hasText: "+ var. d'entretien" }).click()
    const varLi = pMax.locator('.modale-vars .liste-var > li').first()
    await varLi.locator('.nom-var').fill('Ville')
    await varLi.locator('.nom-var').press('Enter') // blur → renommage publié (promesse NON attendue)
    await attendreDefinitionServeur('"Ville"') // barrière : renommage terminé côté serveur
    await varLi.locator('.actions-mod .mini').click() // + modalité
    const moda = varLi.locator('.lib-mod').first()
    await moda.fill('Lyon')
    await moda.press('Tab') // blur → renommage publié (promesse NON attendue)
    // Barrières serveur : chaque définition doit être PUBLIÉE avant le geste
    // suivant, sinon les transactions se disputent le verrou corpus.
    await attendreDefinitionServeur('"Lyon"')
    await pMax.locator('.modale-vars .fermer').click()
    await expect(pMax.locator('.modale-vars')).toHaveCount(0)
    // Vérification SERVEUR : les définitions sont déjà partagées (flux B).
    const corpusServeur = await clientMax().getTexte('corpus.json')
    if (!corpusServeur?.includes('"Ville"'))
      throw new Error('variable « Ville » absente du corpus.json serveur après création')

    /* 3. Olivier ouvre la BASE DE DONNÉES : elle reste ACCESSIBLE et
     *    interactive (jamais lecture seule), la colonne « Ville » est là,
     *    mais la ligne de l'entretien porte le badge 🔒 max. */
    console.log('③ Olivier ouvre la base de données : colonne là, ligne verrouillée…')
    await narrer(pOli, 'Olivier actualise puis ouvre la base de données (Table de données)…')
    await ouvrirBaseDonnees(pOli)
    await pause(pOli, 'La table s’ouvre NORMALEMENT — la colonne « Ville » est déjà partagée…')
    await expect(pOli.locator('.matrice th', { hasText: 'Ville' })).toBeVisible({ timeout: 20_000 })
    // Le composant Corpus reste MONTÉ (v-show) → restreindre à l'écran table.
    await expect(pOli.locator('.donnees-ecran .badge-verrou', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })

    /* 4. La ligne verrouillée est NON ÉDITABLE : garde PAR LIGNE —
     *    les cellules de la ligne tenue par max sont désactivées,
     *    impossible même de TENTER l'écriture.
     *    (Avant la saisie par cellule, la cellule restait active et le refus
     *     venait du main sous forme de bannière.) */
    console.log('④ La ligne verrouillée est désactivée (garde par ligne)…')
    await narrer(pOli, 'La ligne tenue par max est GRISÉE : impossible de la modifier.')
    await expect(pOli.locator('.matrice.editable select').first()).toBeDisabled({ timeout: 20_000 })
    const brutRefus = await clientMax().getTexte(`entretiens/${ID}.json`)
    if (brutRefus === null) throw new Error('entretien introuvable côté serveur')
    const valeursRefus = JSON.parse(brutRefus) as { meta: { valeursGen: Record<string, string> } }
    expect(Object.keys(valeursRefus.meta.valeursGen)).toHaveLength(0) // rien n'a pu partir

    /* 5. Max referme (verrou rendu) ; Olivier ouvre À SON TOUR : la MÊME
     *    saisie passe maintenant — depuis l'onglet Donnée de l'Entretien
     *    (seul écran où le verrou autorise d'écrire), et part à la fermeture
     *    (publication finale). */
    console.log('⑤ Max referme ; Olivier prend le verrou et saisit la valeur…')
    await narrer(pMax, 'Max referme : publication finale PUIS verrou rendu…')
    await retourAuCorpus(pMax)
    await pause(pMax, 'Le verrou est libre — olivier peut prendre le relais…')
    await narrer(pOli, 'Olivier retourne au Corpus, actualise et ouvre l\u2019entretien à son tour…')
    await retourAuCorpus(pOli)
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    await ouvrirEntretien(pOli)
    await pause(pOli, "Verrou à lui : il saisit « Lyon » dans l'onglet Donnée…")
    await pOli.locator('.onglets button[data-onglet="donnees"]').click()
    await pOli.locator('.saisie-eav-sel').first().selectOption({ label: 'Lyon' })
    await narrer(pOli, 'Olivier referme : la valeur part avec la publication finale…')
    await retourAuCorpus(pOli)
    const brutApres = await clientMax().getTexte(`entretiens/${ID}.json`)
    if (brutApres === null) throw new Error('entretien introuvable côté serveur après saisie')
    const valeursApres = JSON.parse(brutApres) as { meta: { valeursGen: Record<string, string> } }
    expect(Object.keys(valeursApres.meta.valeursGen)).toHaveLength(1) // la valeur est partie

    /* 6. La base de données reflète la valeur au prochain tirage. */
    console.log('⑥ La table de données montre la valeur après actualisation…')
    await ouvrirBaseDonnees(pOli)
    await expect(pOli.locator('.matrice')).toContainText('Lyon', { timeout: 20_000 })
    await narrer(pOli, '✅ Variable partagée, ligne verrouillée protégée, table toujours consultable.')
    if (DEMO) await pOli.waitForTimeout(5000) // temps de regarder les fenêtres
    await testInfo.attach('fin', { body: 'scénario variable/verrou table OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})

/* ── Scénario 3 : LOT par colonne + saisie par LIGNE ──────────────────────*/

/** Crée la variable d'entretien « Ville » (+ modalité « Lyon ») depuis l'onglet
 *  Donnée de l'entretien OUVERT (mêmes gestes et mêmes barrières serveur que le
 *  scénario 2 — les transactions de définitions se disputent sinon le verrou). */
async function creerVariableVille(page: Page): Promise<void> {
  await page.locator('.onglets button[data-onglet="donnees"]').click()
  await page.locator('.panneau.donnees .crayon').click()
  await expect(page.locator('.modale-vars')).toBeVisible({ timeout: 20_000 })
  await page.locator('.modale-vars .corpus-tete .mini', { hasText: "+ var. d'entretien" }).click()
  const varLi = page.locator('.modale-vars .liste-var > li').first()
  await varLi.locator('.nom-var').fill('Ville')
  await varLi.locator('.nom-var').press('Enter')
  await attendreDefinitionServeur('"Ville"')
  await varLi.locator('.actions-mod .mini').click()
  const moda = varLi.locator('.lib-mod').first()
  await moda.fill('Lyon')
  await moda.press('Tab')
  await attendreDefinitionServeur('"Lyon"')
  await page.locator('.modale-vars .fermer').click()
  await expect(page.locator('.modale-vars')).toHaveCount(0)
}

test('démo visible : LOT par colonne (refus nominatif, jamais bloquant) puis saisie par LIGNE « Saisir… »', async ({ }, testInfo) => {
  test.setTimeout(DEMO ? 600_000 : 240_000)
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-lot-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-lot-oli-'))
  console.log('🚀 Lancement des deux postes…')
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()
    await placerFenetre(appMax, 'gauche')
    await placerFenetre(appOlivier, 'droite')
    await pause(pMax, "Ici, c'est l'écran de Max")
    await pause(pOli, "Ici, c'est l'écran d'Olivier")

    /* 1. Connexion des deux postes (mêmes gestes que les scénarios 1–2). */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, 'Max', `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, 'Olivier', `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)
    for (const [nom, p] of [
      ['max', pMax],
      ['olivier', pOli],
    ] as const) {
      p.on('pageerror', (e) => console.log(`⚠️ [${nom}] pageerror:`, e.message))
      p.on('console', (m) => {
        if (m.type() === 'error' || m.text().includes('🧵'))
          console.log(`⚠️ [${nom}] console.${m.type()}:`, m.text())
      })
    }

    /* 2. Max ouvre l'entretien 1 (verrou acquis) et crée la variable « Ville ». */
    console.log("② Max ouvre l'entretien et crée la variable « Ville » sous verrou…")
    await pause(pMax, "Max ouvre l'entretien : le VERROU lui est accordé…")
    await ouvrirEntretien(pMax)
    await narrer(pMax, "Il crée la variable d'entretien « Ville » (modalité « Lyon »)…")
    await creerVariableVille(pMax)
    const corpusApresVar = await clientMax().getTexte('corpus.json')
    if (!corpusApresVar?.includes('"Ville"')) throw new Error('variable « Ville » absente du serveur')

    /* 3. Olivier ouvre la base de données et lance le LOT sur « Ville ». */
    console.log("③ Olivier lance le lot sur la colonne « Ville »…")
    await narrer(pOli, 'Olivier actualise puis ouvre la base de données…')
    await ouvrirBaseDonnees(pOli)
    await expect(pOli.locator('.matrice th', { hasText: 'Ville' })).toBeVisible({ timeout: 20_000 })
    // Deux lignes cibles (amorcer a créé un second entretien), dont une 🔒 max.
    await expect(pOli.locator('.donnees-ecran .badge-verrou', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await pause(pOli, 'Deux entretiens — dont un verrouillé par max. Il lance le LOT sur « Ville »…')
    await pOli.locator('.matrice th', { hasText: 'Ville' }).locator('.lot-var').click()
    await expect(pOli.locator('.modale-lot')).toBeVisible({ timeout: 20_000 })
    await expect(pOli.locator('.modale-lot .liste-cibles li')).toHaveCount(2)
    await pOli.locator('.modale-lot select').selectOption({ label: 'Lyon' })
    await narrer(pOli, 'Il choisit « Lyon » et applique à TOUT LE LOT…')
    await pOli.locator('.modale-lot .valider').click()

    /* Récap : 1 modifié, 1 REFUSÉ nommément — sans bloquer le reste du lot. */
    console.log('   → récap attendu : ID2 modifié, ID refusé (« ouvert par max »)')
    await expect(pOli.locator('.modale-lot .recap-ok')).toContainText('1 entretien(s) modifié(s)', { timeout: 30_000 })
    await expect(pOli.locator('.modale-lot .liste-echecs')).toContainText('Entretien partagé')
    await expect(pOli.locator('.modale-lot .liste-echecs')).toContainText('max')
    await pause(pOli, '⛔ L\u2019entretien de max est refusé nommément — l\u2019autre est passé quand même.')
    // Vérifications SERVEUR : ID2 modifié, ID intact, verrou d'ID TOUJOURS tenu.
    const id2 = JSON.parse((await clientMax().getTexte(`entretiens/${ID2}.json`))!) as { meta: { valeursGen: Record<string, string> } }
    expect(Object.keys(id2.meta.valeursGen)).toHaveLength(1)
    const id1 = JSON.parse((await clientMax().getTexte(`entretiens/${ID}.json`))!) as { meta: { valeursGen: Record<string, string> } }
    expect(Object.keys(id1.meta.valeursGen)).toHaveLength(0)
    expect((await clientMax().etatVerrouNatif(`entretiens/${ID}.json`))?.verrouille).toBeTruthy()
    await pOli.locator('.modale-lot .valider').click() // Fermer

    /* Filtre « lignes sans valeur » : à cet
     * instant ID est sans valeur mais 🔒 max, ID2 porte déjà « Lyon » → le
     * filtre ne cible RIEN et affiche les 2 exclus avec leur raison. */
    console.log('   → filtre « sans valeur » : 0 cible (1 verrouillé + 1 déjà valué)')
    await pOli.locator('.matrice th', { hasText: 'Ville' }).locator('.lot-var').click()
    const mf = pOli.locator('.modale-lot')
    await expect(mf).toBeVisible({ timeout: 20_000 })
    await mf.locator('.filtre-sans-valeur input').check()
    await expect(mf.locator('.liste-cibles li:not(.aucune-cible)')).toHaveCount(0)
    await expect(mf.locator('.liste-ignores li')).toHaveCount(2)
    await expect(mf.locator('.liste-ignores')).toContainText('max')
    await expect(mf.locator('.liste-ignores')).toContainText('valeur déjà présente')
    await mf.locator('.fermer').click() // ✕ — on n'applique rien
    await expect(pOli.locator('.modale-lot')).toHaveCount(0)

    /* 4. Max referme ; Olivier utilise le BOUTON LIGNE « Saisir… » de l'ID. */
    console.log(`④ Max referme ; Olivier saisit via le bouton ligne de ${ID}…`)
    await narrer(pMax, 'Max referme : publication finale PUIS verrou rendu…')
    await retourAuCorpus(pMax)
    await narrer(pOli, 'Olivier actualise : plus de badge, il essaie le bouton « Saisir… »…')
    await retourAuCorpus(pOli)
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    await ouvrirBaseDonnees(pOli)
    await pOli.locator('.matrice tbody tr', { hasText: 'Entretien partagé' }).locator('.aller-saisie').click()
    await expect(pOli.locator('.editeur')).toBeVisible({ timeout: 20_000 })
    await expect(pOli.locator('.panneau.donnees')).toBeVisible()
    await narrer(pOli, 'Atterri sur l\u2019ONGLET DONNÉE de cet entretien — il saisit « Lyon »…')
    await pOli.locator('.saisie-eav-sel').first().selectOption({ label: 'Lyon' })
    await narrer(pOli, 'Olivier referme : la valeur part avec la publication finale…')
    await retourAuCorpus(pOli)
    const apres = JSON.parse((await clientMax().getTexte(`entretiens/${ID}.json`))!) as { meta: { valeursGen: Record<string, string> } }
    expect(Object.keys(apres.meta.valeursGen)).toHaveLength(1)

    /* 5. La table montre TOUT après Actualiser. */
    console.log('⑤ La table montre les deux valeurs après Actualiser…')
    await ouvrirBaseDonnees(pOli)
    await expect(pOli.locator('.matrice')).toContainText('Lyon', { timeout: 20_000 })
    await narrer(pOli, '✅ Lot par colonne ET saisie par ligne — zéro écrasement, refus nominatif.')
    if (DEMO) await pOli.waitForTimeout(5000)
    await testInfo.attach('fin', { body: 'scénario lot/saisie OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})

/* ── Scénario 4 : saisie par CELLULE ─────────────────────────────────*/

test('démo visible : saisie par CELLULE — refus inline nominatif, garde par ligne, Shift+Entrée remonte', async ({ }, testInfo) => {
  test.setTimeout(DEMO ? 600_000 : 240_000)
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-cell-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-cell-oli-'))
  console.log('🚀 Lancement des deux postes…')
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()
    await placerFenetre(appMax, 'gauche')
    await placerFenetre(appOlivier, 'droite')
    await pause(pMax, "Ici, c'est l'écran de Max")
    await pause(pOli, "Ici, c'est l'écran d'Olivier")

    /* 1. Connexion des deux postes (mêmes gestes que les scénarios 1–3). */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, 'Max', `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, 'Olivier', `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)

    /* 2. Max crée la variable « Ville » puis REFERME (verrou rendu). */
    console.log('② Max crée la variable « Ville » sous verrou puis referme…')
    await pause(pMax, "Max ouvre l'entretien et crée la variable « Ville »…")
    await ouvrirEntretien(pMax)
    await creerVariableVille(pMax)
    await narrer(pMax, 'Il referme : définitions publiées, verrou rendu…')
    await retourAuCorpus(pMax)

    /* 3. Olivier ouvre la table : deux lignes LIBRES — cellules actives,
     *    badges absents (son dernier tirage ne connaît aucun verrou). */
    console.log('③ Olivier ouvre la table — deux lignes libres, cellules actives…')
    await ouvrirBaseDonnees(pOli)
    await expect(pOli.locator('.matrice th', { hasText: 'Ville' })).toBeVisible({ timeout: 20_000 })
    const sels = pOli.locator('.matrice.editable td.cell-val select') // une seule colonne → 2 cellules
    await expect(sels).toHaveCount(2)
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0)
    await pause(pOli, 'Deux lignes libres. Pendant ce temps, max REPREND le verrou…')

    /* 4. Max reprend le verrou DANS LE DOS d'Olivier (badges périmés). */
    await ouvrirEntretien(pMax)

    /* 5. Olivier édite la cellule verrouillée → REFUS INLINE nominatif. */
    console.log('⑤ Olivier édite la cellule verrouillée → refus inline nominatif…')
    const lignePartage = pOli.locator('.matrice tbody tr', { hasText: 'Entretien partagé' })
    await lignePartage.locator('select').selectOption({ label: 'Lyon' })
    await narrer(pOli, '⛔ Refus INLINE : bord rouge + raison (« ouvert par max ») — sans bloquer la suite.')
    const cellErr = lignePartage.locator('.cell-erreur')
    await expect(cellErr).toBeVisible({ timeout: 30_000 })
    await expect(cellErr).toHaveAttribute('title', /max/)

    /* 6. Olivier édite l'AUTRE ligne (libre) : succès — Shift+Entrée remonte. */
    console.log("⑥ Olivier édite l'autre ligne : succès — Shift+Entrée remonte la colonne…")
    const ligneBis = pOli.locator('.matrice tbody tr', { hasText: 'Entretien bis' })
    await ligneBis.locator('select').selectOption({ label: 'Lyon' })
    // Le commit part en arrière-plan ; on attend sa trace SERVEUR avant de
    // naviguer (un re-rendu suit le rafraîchissement de la matrice).
    await expect
      .poll(async () => {
        const t = await clientMax().getTexte(`entretiens/${ID2}.json`)
        return Object.keys(JSON.parse(t!).meta.valeursGen).length
      }, { timeout: 30_000 })
      .toBe(1)
    await ligneBis.locator('select').focus()
    await pOli.keyboard.press('Shift+Enter')
    const indiceFocus = () =>
      sels.evaluateAll((els) => els.findIndex((e) => e === document.activeElement))
    expect(await indiceFocus()).toBe(0) // remonté sur la ligne du haut

    /* Vérifications SERVEUR : ID2 écrit, ID intact, verrou TOUJOURS tenu. */
    const id1 = JSON.parse((await clientMax().getTexte(`entretiens/${ID}.json`))!) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(Object.keys(id1.meta.valeursGen)).toHaveLength(0)
    expect((await clientMax().etatVerrouNatif(`entretiens/${ID}.json`))?.verrouille).toBeTruthy()

    /* 7. Actualiser : badge 🔒 révélé, SA ligne devient non éditable. */
    console.log('⑦ Actualiser : badge 🔒 max et SA ligne désactivée (garde par ligne)…')
    await narrer(pOli, 'Après Actualiser : badge 🔒 et SA ligne est désactivée.')
    await retourAuCorpus(pOli)
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    // Deux badges 🔒 max coexistent à l'écran Corpus (carte + ligne) : .first().
    await expect(pOli.locator('.badge-verrou', { hasText: 'max' }).first()).toBeVisible({ timeout: 20_000 })
    await ouvrirBaseDonnees(pOli)
    await expect(lignePartage.locator('select')).toBeDisabled({ timeout: 20_000 })
    await pause(pOli, 'La ligne de max est verrouillée : impossible même de cliquer.')

    /* 8. Max referme ; Olivier actualise, RE-saisit la MÊME cellule : ça passe. */
    console.log('⑧ Max referme ; Olivier resaisit la même cellule : succès…')
    await narrer(pMax, 'Max referme : publication finale PUIS verrou rendu…')
    await retourAuCorpus(pMax)
    await retourAuCorpus(pOli)
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    await ouvrirBaseDonnees(pOli)
    await narrer(pOli, 'Le verrou a changé de mains : la MÊME cellule accepte « Lyon »…')
    await lignePartage.locator('select').selectOption({ label: 'Lyon' })
    await expect
      .poll(async () => {
        const t = await clientMax().getTexte(`entretiens/${ID}.json`)
        return Object.keys(JSON.parse(t!).meta.valeursGen).length
      }, { timeout: 30_000 })
      .toBe(1)
    await narrer(pOli, '✅ Saisie par cellule : refus inline nommé, garde par ligne, zéro écrasement.')
    if (DEMO) await pOli.waitForTimeout(5000)
    await testInfo.attach('fin', { body: 'scénario saisie par cellule OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})

/* ── Scénario 5 : PANNEAU MÉTA sous verrou ───────────────────────────────*/
/** Le panneau métadonnées de la vue Corpus (nom + boutons audio + suppression)
 *  passe en lecture seule dès que l'entretien est tenu par autrui (badge
 *  serveur), et redevient éditable au pull suivant la libération. */
test('démo visible : PANNEAU MÉTA sous verrou — nom/suppression grisés chez autrui, rendus à la libération', async ({ }, testInfo) => {
  test.setTimeout(DEMO ? 600_000 : 240_000)
  if (!(await pret())) {
    console.log('⏭ Pile A (:8080) absente — lancer `npm run nc:up && npm run nc:provision`')
    test.skip(true, 'pile Docker non disponible')
  }

  const { original } = await amorcer()
  const dirMax = mkdtempSync(join(tmpdir(), 'demo-meta-max-'))
  const dirOlivier = mkdtempSync(join(tmpdir(), 'demo-meta-oli-'))
  console.log('🚀 Lancement des deux postes…')
  const appMax = await lancer(dirMax)
  const appOlivier = await lancer(dirOlivier)
  try {
    const pMax = await appMax.firstWindow()
    const pOli = await appOlivier.firstWindow()
    await placerFenetre(appMax, 'gauche')
    await placerFenetre(appOlivier, 'droite')

    /* 1. Connexion des deux postes. */
    console.log('① Connexion des deux postes…')
    await connecterEtOuvrir(pMax, 'Max', `${BASE}/remote.php/dav/files/max/MonCorpus`, MAX.utilisateur, MAX.motDePasse)
    await connecterEtOuvrir(pOli, 'Olivier', `${BASE}/remote.php/dav/files/olivier/MonCorpus`, OLIVIER.utilisateur, OLIVIER.motDePasse)

    /* 2. Max ouvre l'entretien : le verrou est à lui. */
    console.log("② Max ouvre l'entretien (verrou)…")
    await ouvrirEntretien(pMax)

    /* 3. Olivier actualise, sélectionne la carte : le panneau méta est
     *    ENTIEREMENT grisé (nom, boutons audio, suppression) avec l'infobulle nominative. */
    console.log("③ Olivier voit le panneau méta en lecture seule (« ouvert par max »)…")
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou', { hasText: 'max' })).toBeVisible({ timeout: 20_000 })
    await pOli.locator('.carte-ent').first().click()
    await expect(pOli.locator('.meta-ent')).toBeVisible()
    const nomOli = pOli.locator('.meta-ent .titre-meta')
    const supprOli = pOli.locator('.meta-ent .suppr-meta')
    await expect(nomOli).toBeDisabled({ timeout: 20_000 })
    await expect(supprOli).toBeDisabled()
    await expect(nomOli).toHaveAttribute('title', /Ouvert par max/)
    await expect(pOli.locator('.meta-ent .assigner-audio').first()).toBeDisabled()
    await pause(pOli, "Panneau grisé : l'entretien est ouvert par max — rien n'est modifiable ici…")

    /* 4. Max referme : publication finale puis libération du verrou. */
    console.log('④ Max referme : verrou rendu…')
    await narrer(pMax, 'Max retourne au corpus : publication finale PUIS verrou rendu…')
    await retourAuCorpus(pMax)

    /* 5. Olivier re-tire : plus de badge → le panneau s'éveille à nouveau. */
    console.log("⑤ Olivier actualise : panneau éditable à nouveau…")
    await narrer(pOli, 'Olivier actualise : le verrou a disparu — le panneau redevient éditable…')
    await pOli.locator('.btn-table', { hasText: 'Actualiser' }).click()
    await expect(pOli.locator('.badge-verrou')).toHaveCount(0, { timeout: 20_000 })
    // Le tirage a ramené des fichiers : ré-application complète du corpus,
    // qui désélectionne la carte — on rouvre le panneau méta.
    await pOli.locator('.carte-ent').first().click()
    await expect(pOli.locator('.meta-ent')).toBeVisible({ timeout: 20_000 })
    await expect(nomOli).toBeEnabled({ timeout: 20_000 })
    await expect(supprOli).toBeEnabled()
    await narrer(pOli, '✅ Même règle multi-utilisateur pour tout le panneau.')
    if (DEMO) await pOli.waitForTimeout(5000)
    await testInfo.attach('fin', { body: 'scénario panneau méta sous verrou OK', contentType: 'text/plain' })
  } finally {
    await appMax.close()
    await appOlivier.close()
    await nettoyer(original)
  }
})
