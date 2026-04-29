# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sync-thematiques.spec.js >> A — user1 crée une thématique → le .crp contient le nouveau tabThm
- Location: tests/sync-thematiques.spec.js:167:1

# Error details

```
TypeError: fetch failed
```

# Test source

```ts
  146 |     // ou la page de login
  147 |     if (urlActuelle.includes('/users/sign_in') || urlActuelle.includes('/login')) {
  148 |       console.log(`   📝 Formulaire de login détecté — connexion en cours...`);
  149 | 
  150 |       // Sélecteurs connus pour les différentes versions de GitLab CE
  151 |       await remplirChamp(page, [
  152 |         '#user_login',
  153 |         '[data-testid="username-field"]',
  154 |         'input[name="user[login]"]',
  155 |         'input[autocomplete="username"]',
  156 |       ], username);
  157 | 
  158 |       await remplirChamp(page, [
  159 |         '#user_password',
  160 |         '[data-testid="password-field"]',
  161 |         'input[name="user[password]"]',
  162 |         'input[type="password"]',
  163 |       ], password);
  164 | 
  165 |       await screenshot(page, `02-formulaire-rempli-${username}`);
  166 | 
  167 |       // Clic sur le bouton de connexion
  168 |       const submitSel = [
  169 |         '[data-testid="sign-in-button"]',
  170 |         'input[name="commit"]',
  171 |         'button[type="submit"]',
  172 |         'input[type="submit"]',
  173 |       ];
  174 |       for (const sel of submitSel) {
  175 |         try {
  176 |           const btn = page.locator(sel).first();
  177 |           await btn.waitFor({ timeout: 2000 });
  178 |           await btn.click();
  179 |           console.log(`   ✅ Bouton login cliqué (${sel})`);
  180 |           break;
  181 |         } catch {
  182 |           // Essayer le suivant
  183 |         }
  184 |       }
  185 | 
  186 |       // Attendre la navigation post-login
  187 |       await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  188 |       await screenshot(page, `03-apres-login-${username}`);
  189 |       console.log(`   📍 Après login : ${page.url()}`);
  190 |     }
  191 | 
  192 |     // Page de consentement OAuth (première autorisation uniquement)
  193 |     // Si l'app est "Trusted" dans Admin Area, cette page est skippée
  194 |     const urlConsent = page.url();
  195 |     if (urlConsent.includes('/oauth/authorize') || urlConsent.includes('oauth')) {
  196 |       console.log(`   🔐 Page de consentement OAuth détectée...`);
  197 |       try {
  198 |         const authorizeBtn = page.locator([
  199 |           'input[name="commit"]',
  200 |           'button[type="submit"]',
  201 |           'input[value*="Authorize"]',
  202 |           'button:has-text("Authorize")',
  203 |           'input[value*="Allow"]',
  204 |         ].join(', ')).first();
  205 |         await authorizeBtn.waitFor({ timeout: 5000 });
  206 |         await screenshot(page, `04-consentement-${username}`);
  207 |         await authorizeBtn.click();
  208 |         console.log(`   ✅ Consentement accordé`);
  209 |       } catch {
  210 |         console.log(`   ℹ️ Pas de page de consentement (app déjà autorisée ou "Trusted")`);
  211 |       }
  212 |     }
  213 | 
  214 |     // Attendre la redirection vers le callback
  215 |     // On attend soit l'URL callback, soit que le serveur ait reçu le code
  216 |     await Promise.race([
  217 |       page.waitForURL(`http://127.0.0.1:${CALLBACK_PORT}/**`, { timeout: 20000 }),
  218 |       codePromise, // résout dès que le serveur callback reçoit le code
  219 |     ]);
  220 | 
  221 |     await screenshot(page, `05-callback-${username}`);
  222 | 
  223 |   } catch (err) {
  224 |     await screenshot(page, `erreur-${username}`);
  225 |     console.error(`   ❌ Erreur lors du flux OAuth (${username}):`, err.message);
  226 |     console.error(`   💡 Relancer avec PLAYWRIGHT_HEADLESS=false pour voir le navigateur`);
  227 |     server.close();
  228 |     throw err;
  229 |   } finally {
  230 |     await browser.close();
  231 |   }
  232 | 
  233 |   const code = await codePromise;
  234 | 
  235 |   // ── 4. Échange code → token ──────────────────────────────────────────────
  236 |   console.log(`   🔄 Échange du code contre un token...`);
  237 |   const tokenBody = new URLSearchParams({
  238 |     client_id: clientId,
  239 |     code,
  240 |     grant_type: 'authorization_code',
  241 |     redirect_uri: REDIRECT_URI,
  242 |     code_verifier: codeVerifier,
  243 |   });
  244 |   if (clientSecret) tokenBody.set('client_secret', clientSecret);
  245 | 
> 246 |   const res = await fetch(`${instanceUrl}/oauth/token`, {
      |               ^ TypeError: fetch failed
  247 |     method: 'POST',
  248 |     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  249 |     body: tokenBody.toString(),
  250 |   });
  251 | 
  252 |   if (!res.ok) {
  253 |     const text = await res.text();
  254 |     throw new Error(`Échange token échoué (${res.status}) : ${text}`);
  255 |   }
  256 | 
  257 |   const token = await res.json();
  258 |   if (!token.access_token) {
  259 |     throw new Error(`Token absent dans la réponse : ${JSON.stringify(token)}`);
  260 |   }
  261 |   console.log(`   ✅ Token obtenu`);
  262 |   return token.access_token;
  263 | }
  264 | 
  265 | /**
  266 |  * Retourne un access_token GitLab.
  267 |  * Si directToken est fourni, il est retourné immédiatement (pas de browser automation).
  268 |  * Sinon, effectue le flux OAuth Authorization Code + PKCE via Playwright.
  269 |  *
  270 |  * @param {string} instanceUrl
  271 |  * @param {string} clientId
  272 |  * @param {string} clientSecret
  273 |  * @param {string} username
  274 |  * @param {string} password
  275 |  * @param {string} [directToken]  Token à utiliser directement si disponible
  276 |  * @returns {Promise<string>} access_token
  277 |  */
  278 | async function obtenirToken(instanceUrl, clientId, clientSecret, username, password, directToken) {
  279 |   if (directToken) {
  280 |     console.log(`   ✅ Token direct utilisé (browser automation ignorée)`);
  281 |     return directToken;
  282 |   }
  283 |   return obtenirTokenOAuth(instanceUrl, clientId, clientSecret, username, password);
  284 | }
  285 | 
  286 | module.exports = { obtenirTokenOAuth, obtenirToken };
  287 | 
```