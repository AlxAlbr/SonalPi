/**
 * Helper : obtenir un access_token OAuth GitLab via Playwright.
 *
 * Automatise le flux Authorization Code + PKCE :
 *  1. Démarre un serveur HTTP local pour capter le callback (port 7474)
 *  2. Ouvre une page Chromium vers /oauth/authorize
 *  3. Remplit le formulaire de login GitLab
 *  4. Valide la page de consentement OAuth (si affichée)
 *  5. Capture le code de retour et l'échange contre un access_token
 *
 * Prérequis : l'app OAuth GitLab doit avoir
 *   redirect_uri = http://127.0.0.1:7474/callback
 *   scope        = api
 *
 * Debug : mettre PLAYWRIGHT_HEADLESS=false dans .env pour voir le navigateur
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { URL, URLSearchParams } = require('url');
const { chromium } = require('@playwright/test');

const CALLBACK_PORT = 7474;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'oauth-debug');

/**
 * Sauvegarde une capture d'écran pour le debug
 */
async function screenshot(page, nom) {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${nom}.png`), fullPage: true });
    console.log(`   📸 screenshot: test-results/oauth-debug/${nom}.png`);
  } catch {
    // Non bloquant
  }
}

/**
 * Remplit un champ en essayant plusieurs sélecteurs, retourne celui qui a fonctionné
 */
async function remplirChamp(page, selecteurs, valeur) {
  for (const sel of selecteurs) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ timeout: 3000 });
      await el.fill(valeur);
      return sel;
    } catch {
      // Essayer le suivant
    }
  }
  throw new Error(`Aucun sélecteur trouvé parmi : ${selecteurs.join(', ')}`);
}

/**
 * @param {string} instanceUrl   ex: "http://localhost"
 * @param {string} clientId      Client ID de l'application OAuth GitLab
 * @param {string} clientSecret  Laisser vide si PKCE sans secret
 * @param {string} username      Identifiant GitLab
 * @param {string} password      Mot de passe GitLab
 * @returns {Promise<string>} access_token
 */
async function obtenirTokenOAuth(instanceUrl, clientId, clientSecret, username, password) {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';

  // ── 1. Serveur callback ─────────────────────────────────────────────────
  let resolveCode, rejectCode;
  const codePromise = new Promise((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = http.createServer((req, res) => {
    if (!req.url.startsWith('/callback')) {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><p>Authentification réussie — vous pouvez fermer cet onglet.</p></body></html>');
    server.close();
    if (code) resolveCode(code);
    else rejectCode(new Error(`Erreur OAuth : ${error || 'code absent'}`));
  });

  await new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} déjà utilisé — fermez l'application qui l'occupe.`));
      } else {
        reject(err);
      }
    });
    server.listen(CALLBACK_PORT, '127.0.0.1', resolve);
  });

  // ── 2. PKCE ─────────────────────────────────────────────────────────────
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'api',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${instanceUrl}/oauth/authorize?${params}`;
  console.log(`   🌐 URL OAuth : ${authUrl}`);

  // ── 3. Automatisation login via Playwright ───────────────────────────────
  const browser = await chromium.launch({
    headless,
    // Ignorer les erreurs de certificat pour les instances HTTP/self-signed
    args: ['--ignore-certificate-errors', '--disable-web-security'],
  });
  const page = await browser.newPage();

  // Logger toutes les navigations pour le debug
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`   ↪ navigation : ${frame.url()}`);
    }
  });

  try {
    console.log(`   🔑 Ouverture page OAuth pour ${username}...`);
    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await screenshot(page, `01-page-initiale-${username}`);

    const urlActuelle = page.url();
    console.log(`   📍 Page actuelle : ${urlActuelle}`);

    // La page peut être directement la page d'autorisation (si déjà connecté)
    // ou la page de login
    if (urlActuelle.includes('/users/sign_in') || urlActuelle.includes('/login')) {
      console.log(`   📝 Formulaire de login détecté — connexion en cours...`);

      // Sélecteurs connus pour les différentes versions de GitLab CE
      await remplirChamp(page, [
        '#user_login',
        '[data-testid="username-field"]',
        'input[name="user[login]"]',
        'input[autocomplete="username"]',
      ], username);

      await remplirChamp(page, [
        '#user_password',
        '[data-testid="password-field"]',
        'input[name="user[password]"]',
        'input[type="password"]',
      ], password);

      await screenshot(page, `02-formulaire-rempli-${username}`);

      // Clic sur le bouton de connexion
      const submitSel = [
        '[data-testid="sign-in-button"]',
        'input[name="commit"]',
        'button[type="submit"]',
        'input[type="submit"]',
      ];
      for (const sel of submitSel) {
        try {
          const btn = page.locator(sel).first();
          await btn.waitFor({ timeout: 2000 });
          await btn.click();
          console.log(`   ✅ Bouton login cliqué (${sel})`);
          break;
        } catch {
          // Essayer le suivant
        }
      }

      // Attendre la navigation post-login
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await screenshot(page, `03-apres-login-${username}`);
      console.log(`   📍 Après login : ${page.url()}`);
    }

    // Page de consentement OAuth (première autorisation uniquement)
    // Si l'app est "Trusted" dans Admin Area, cette page est skippée
    const urlConsent = page.url();
    if (urlConsent.includes('/oauth/authorize') || urlConsent.includes('oauth')) {
      console.log(`   🔐 Page de consentement OAuth détectée...`);
      try {
        const authorizeBtn = page.locator([
          'input[name="commit"]',
          'button[type="submit"]',
          'input[value*="Authorize"]',
          'button:has-text("Authorize")',
          'input[value*="Allow"]',
        ].join(', ')).first();
        await authorizeBtn.waitFor({ timeout: 5000 });
        await screenshot(page, `04-consentement-${username}`);
        await authorizeBtn.click();
        console.log(`   ✅ Consentement accordé`);
      } catch {
        console.log(`   ℹ️ Pas de page de consentement (app déjà autorisée ou "Trusted")`);
      }
    }

    // Attendre la redirection vers le callback
    // On attend soit l'URL callback, soit que le serveur ait reçu le code
    await Promise.race([
      page.waitForURL(`http://127.0.0.1:${CALLBACK_PORT}/**`, { timeout: 20000 }),
      codePromise, // résout dès que le serveur callback reçoit le code
    ]);

    await screenshot(page, `05-callback-${username}`);

  } catch (err) {
    await screenshot(page, `erreur-${username}`);
    console.error(`   ❌ Erreur lors du flux OAuth (${username}):`, err.message);
    console.error(`   💡 Relancer avec PLAYWRIGHT_HEADLESS=false pour voir le navigateur`);
    server.close();
    throw err;
  } finally {
    await browser.close();
  }

  const code = await codePromise;

  // ── 4. Échange code → token ──────────────────────────────────────────────
  console.log(`   🔄 Échange du code contre un token...`);
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  if (clientSecret) tokenBody.set('client_secret', clientSecret);

  const postData = tokenBody.toString();
  const tokenUrl = new URL(`${instanceUrl}/oauth/token`);
  const httpModule = tokenUrl.protocol === 'https:' ? https : http;

  const token = await new Promise((resolve, reject) => {
    const req = httpModule.request({
      hostname: tokenUrl.hostname,
      port: tokenUrl.port || (tokenUrl.protocol === 'https:' ? 443 : 80),
      path: tokenUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false, // Compatibilité certificats self-signed
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Échange token échoué (${res.statusCode}) : ${body}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Réponse token non-JSON : ${body}`)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  if (!token.access_token) {
    throw new Error(`Token absent dans la réponse : ${JSON.stringify(token)}`);
  }
  console.log(`   ✅ Token obtenu`);
  return token.access_token;
}

/**
 * Retourne un access_token GitLab.
 * Si directToken est fourni, il est retourné immédiatement (pas de browser automation).
 * Sinon, effectue le flux OAuth Authorization Code + PKCE via Playwright.
 *
 * @param {string} instanceUrl
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} username
 * @param {string} password
 * @param {string} [directToken]  Token à utiliser directement si disponible
 * @returns {Promise<string>} access_token
 */
async function obtenirToken(instanceUrl, clientId, clientSecret, username, password, directToken) {
  if (directToken) {
    console.log(`   ✅ Token direct utilisé (browser automation ignorée)`);
    return directToken;
  }
  return obtenirTokenOAuth(instanceUrl, clientId, clientSecret, username, password);
}

module.exports = { obtenirTokenOAuth, obtenirToken };
