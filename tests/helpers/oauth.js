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
 */

const http = require('http');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');
const { chromium } = require('@playwright/test');

const CALLBACK_PORT = 7474;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

/**
 * @param {string} instanceUrl   ex: "http://localhost"
 * @param {string} clientId      Client ID de l'application OAuth GitLab
 * @param {string} clientSecret  Laisser vide si PKCE sans secret
 * @param {string} username      Identifiant GitLab
 * @param {string} password      Mot de passe GitLab
 * @returns {Promise<string>} access_token
 */
async function obtenirTokenOAuth(instanceUrl, clientId, clientSecret, username, password) {
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

  // ── 3. Automatisation login via Playwright ───────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(authUrl, { waitUntil: 'domcontentloaded' });

    // Formulaire de login GitLab
    await page.waitForSelector('#user_login, [data-testid="username-field"]', { timeout: 10000 });
    await page.fill('#user_login, [data-testid="username-field"]', username);
    await page.fill('#user_password, [data-testid="password-field"]', password);
    await page.click('[data-testid="sign-in-button"], [name="commit"]');

    // Page de consentement OAuth (affichée seulement à la première autorisation)
    try {
      const authorizeBtn = page.locator('input[name="commit"][value*="Authorize"], button:has-text("Authorize")');
      await authorizeBtn.waitFor({ timeout: 5000 });
      await authorizeBtn.click();
    } catch {
      // Page de consentement absente (déjà autorisé) — normal
    }

    // Attendre la redirection vers le callback
    await page.waitForURL(`http://127.0.0.1:${CALLBACK_PORT}/**`, { timeout: 15000 });
  } finally {
    await browser.close();
  }

  const code = await codePromise;

  // ── 4. Échange code → token ──────────────────────────────────────────────
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  if (clientSecret) tokenBody.set('client_secret', clientSecret);

  const res = await fetch(`${instanceUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échange token échoué (${res.status}) : ${text}`);
  }

  const token = await res.json();
  return token.access_token;
}

module.exports = { obtenirTokenOAuth };
