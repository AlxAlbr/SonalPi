const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL, URLSearchParams } = require('url');

/**
 * Gestion OAuth 2.0 Authorization Code Flow pour GitLab (instances self-hosted)
 *
 * Prérequis côté GitLab :
 *   - L'utilisateur a créé une application OAuth dans ses Settings > Applications
 *   - Redirect URI configurée : http://127.0.0.1:7474/callback (port fixe pour compatibilité maximale)
 *   - Scopes : api (ou read_repository + write_repository selon besoin)
 */
class GitLabOAuth {
  constructor(instanceUrl, clientId, clientSecret = null) {
    // Normaliser l'URL : retirer le slash final
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret; // optionnel : certaines instances l'exigent
    this.scopes = 'api';

    // Chemins OAuth GitLab standard
    this.authorizeUrl = `${this.instanceUrl}/oauth/authorize`;
    this.tokenUrl = `${this.instanceUrl}/oauth/token`;

    // Token courant (en mémoire)
    this._token = null;
  }

  // ──────────────────────────────────────────────
  // FLUX D'AUTHENTIFICATION
  // ──────────────────────────────────────────────

  /**
   * Lance le flux Authorization Code :
   *  1. Démarre un serveur HTTP local temporaire pour capter le redirect
   *  2. Ouvre le navigateur vers la page d'autorisation GitLab
   *  3. Attend le code de retour
   *  4. Échange le code contre un access_token
   *
   * @returns {Promise<{access_token, refresh_token, token_type, scope, created_at}>}
   */
  authenticate() {
    return new Promise((resolve, reject) => {
      // Port fixe pour que l'URI de callback corresponde exactement à ce qui est
      // enregistré dans GitLab — certaines instances n'acceptent pas un port dynamique
      const CALLBACK_PORT = 7474;
      const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
      const server = http.createServer();

      server.listen(CALLBACK_PORT, '127.0.0.1', () => {
        const port = server.address().port;

        // Générer un state aléatoire anti-CSRF
        const state = crypto.randomBytes(16).toString('hex');

        // Générer le code_verifier PKCE (43-128 caractères, URL-safe)
        const codeVerifier = crypto.randomBytes(48).toString('base64url');
        // code_challenge = BASE64URL(SHA256(code_verifier))
        const codeChallenge = crypto
          .createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');

        // Construire l'URL d'autorisation
        const params = new URLSearchParams({
          client_id: this.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: this.scopes,
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        });
        const authUrl = `${this.authorizeUrl}?${params.toString()}`;

        console.log('🔑 Ouverture navigateur pour authentification GitLab...');
        console.log('   URL:', authUrl);

        // Ouvrir le navigateur par défaut
        shell.openExternal(authUrl);

        // Timeout de 5 minutes
        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('Délai d\'authentification dépassé (5 minutes)'));
        }, 5 * 60 * 1000);

        server.on('request', async (req, res) => {
          // Ignorer favicon et autres requêtes parasites
          if (!req.url.startsWith('/callback')) {
            res.writeHead(204);
            res.end();
            return;
          }

          clearTimeout(timeout);

          const callbackUrl = new URL(req.url, `http://127.0.0.1:${port}`);
          const code = callbackUrl.searchParams.get('code');
          const returnedState = callbackUrl.searchParams.get('state');
          const error = callbackUrl.searchParams.get('error');

          // Toujours répondre au navigateur avant tout traitement
          if (error || !code || returnedState !== state) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this._pageHtml(
              'Authentification échouée',
              `Erreur : ${error || 'code manquant ou state invalide'}. Vous pouvez fermer cet onglet.`,
              false
            ));
            server.close();
            reject(new Error(`Erreur OAuth : ${error || 'réponse invalide'}`));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this._pageHtml(
            'Connexion réussie',
            'Authentification réussie ! Vous pouvez fermer cet onglet et revenir à SonalPi.',
            true
          ));
          server.close();

          // Échanger le code contre un token
          try {
            const token = await this._exchangeCode(code, redirectUri, codeVerifier);
            this._token = token;
            console.log('✅ Token OAuth obtenu');
            resolve(token);
          } catch (err) {
            reject(err);
          }
        });

        server.on('error', (err) => {
          clearTimeout(timeout);
          if (err.code === 'EADDRINUSE') {
            reject(new Error(
              `Le port ${CALLBACK_PORT} est déjà utilisé par un autre programme. ` +
              `Fermez l'application qui l'occupe et réessayez.`
            ));
          } else {
            reject(new Error(`Erreur serveur callback : ${err.message}`));
          }
        });
      });
    });
  }

  /**
   * Rafraîchit le token via le refresh_token
   * @param {string} refreshToken
   */
  async refreshToken(refreshToken) {
    console.log('🔄 Rafraîchissement du token OAuth...');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });

    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const token = await this._postToken(body.toString());
    this._token = token;
    console.log('✅ Token rafraîchi');
    return token;
  }

  /**
   * Révoque le token courant
   * @param {string} accessToken
   */
  async revokeToken(accessToken) {
    console.log('🔒 Révocation du token OAuth...');

    const body = new URLSearchParams({
      token: accessToken,
      client_id: this.clientId,
    });

    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const revokeUrl = `${this.instanceUrl}/oauth/revoke`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(revokeUrl);
      const bodyStr = body.toString();

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        res.resume(); // On ne lit pas le body
        this._token = null;
        console.log('✅ Token révoqué (HTTP ' + res.statusCode + ')');
        resolve({ success: true });
      });

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  // ──────────────────────────────────────────────
  // STOCKAGE SÉCURISÉ DES TOKENS
  // ──────────────────────────────────────────────

  /**
   * Sauvegarde le token chiffré sur disque
   * Clé : "gitlab:<instanceUrl>:<projectPath>"
   * @param {string} storageDir  Chemin du dossier de données (app.getPath('userData'))
   * @param {string} key         Clé unique identifiant la connexion
   * @param {object} token       Objet token complet (access_token, refresh_token, ...)
   */
  saveToken(storageDir, key, token) {
    try {
      const filePath = path.join(storageDir, 'gitlab_tokens.enc');
      let tokens = {};

      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          tokens = JSON.parse(raw);
        } catch {
          tokens = {};
        }
      }

      const tokenStr = JSON.stringify(token);
      const encrypted = safeStorage.encryptString(tokenStr);
      tokens[key] = encrypted.toString('base64');

      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8');
      console.log('💾 Token GitLab sauvegardé pour', key);
    } catch (error) {
      console.error('❌ Erreur sauvegarde token:', error);
    }
  }

  /**
   * Charge et déchiffre un token depuis le disque
   * @param {string} storageDir
   * @param {string} key
   * @returns {object|null}
   */
  loadToken(storageDir, key) {
    try {
      const filePath = path.join(storageDir, 'gitlab_tokens.enc');

      if (!fs.existsSync(filePath)) return null;

      const raw = fs.readFileSync(filePath, 'utf8');
      const tokens = JSON.parse(raw);

      if (!tokens[key]) return null;

      const encryptedBuffer = Buffer.from(tokens[key], 'base64');
      const tokenStr = safeStorage.decryptString(encryptedBuffer);
      const token = JSON.parse(tokenStr);

      console.log('🔓 Token GitLab chargé pour', key);
      return token;
    } catch (error) {
      console.error('❌ Erreur chargement token:', error);
      return null;
    }
  }

  /**
   * Supprime le token sauvegardé
   * @param {string} storageDir
   * @param {string} key
   */
  deleteToken(storageDir, key) {
    try {
      const filePath = path.join(storageDir, 'gitlab_tokens.enc');

      if (!fs.existsSync(filePath)) return;

      const raw = fs.readFileSync(filePath, 'utf8');
      const tokens = JSON.parse(raw);

      delete tokens[key];

      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8');
      console.log('🗑️ Token GitLab supprimé pour', key);
    } catch (error) {
      console.error('❌ Erreur suppression token:', error);
    }
  }

  // ──────────────────────────────────────────────
  // MÉTHODES PRIVÉES
  // ──────────────────────────────────────────────

  /**
   * Échange un code d'autorisation contre un access_token
   */
  async _exchangeCode(code, redirectUri, codeVerifier) {
    console.log('🔄 Échange du code contre un token...');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });

    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    return this._postToken(body.toString());
  }

  /**
   * POST vers l'endpoint token GitLab
   */
  _postToken(bodyStr) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.tokenUrl);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr),
          'Accept': 'application/json',
        },
        rejectUnauthorized: false, // Compatibilité certificats self-signed universitaires
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));

            if (res.statusCode >= 400 || data.error) {
              reject(new Error(data.error_description || data.error || `HTTP ${res.statusCode}`));
              return;
            }

            resolve(data);
          } catch (e) {
            reject(new Error('Réponse token invalide: ' + e.message));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Timeout lors de l\'échange du token'));
      });
      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Page HTML simple affichée dans le navigateur après le callback OAuth
   */
  _pageHtml(title, message, success) {
    const color = success ? '#2da44e' : '#cf222e';
    const icon = success ? '✅' : '❌';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title} — SonalPi</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f6f8fa; }
    .box { text-align: center; padding: 2rem; background: white;
           border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.12); max-width: 420px; }
    h1 { color: ${color}; font-size: 1.4rem; }
    p { color: #57606a; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${icon} ${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}

module.exports = GitLabOAuth;
