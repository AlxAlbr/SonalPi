const https = require('https');
const { URL, URLSearchParams } = require('url');

/**
 * Client GitLab API v4 — interface identique à ServeurAPI
 *
 * Remplace ServeurAPI pour les corpus hébergés sur un projet GitLab privé.
 * Authentification : OAuth 2.0 Bearer token (pas d'auth Basic).
 * Verrous : GitLab LFS Lock API (pas d'expiration → pas de refresh timer).
 *
 * Hypothèses :
 *   - LFS activé sur le projet (Settings > General > Visibility > LFS)
 *   - Le token OAuth a le scope "api"
 *   - Les fichiers sont du texte (UTF-8) — pas de binaires
 */
class GitLabAPI {
  /**
   * @param {string} instanceUrl   ex: "https://gitlab.univ-xxx.fr"
   * @param {string} projectPath   ex: "groupe/mon-corpus"  (ou "user/mon-corpus")
   * @param {string} accessToken   Token OAuth 2.0
   * @param {string} branch        Branche Git cible (défaut: "main")
   */
  constructor(instanceUrl, projectPath, accessToken, branch = 'main') {
    this.instanceUrl = instanceUrl.replace(/\/$/, '');
    this.projectPath = projectPath;
    this.accessToken = accessToken;
    this.branch = branch;

    // ID de projet encodé pour l'URL : "groupe/projet" → "groupe%2Fprojet"
    this.projectId = encodeURIComponent(projectPath);

    // Base de l'API REST v4
    this.apiBase = `${this.instanceUrl}/api/v4/projects/${this.projectId}`;

    // Base de l'API LFS (protocole Git LFS standard)
    // https://instance/groupe/projet.git/info/lfs
    this.lfsBase = `${this.instanceUrl}/${projectPath}.git/info/lfs`;

    console.log('📦 GitLabAPI créé:');
    console.log('   Instance:', this.instanceUrl);
    console.log('   Projet:', this.projectPath);
    console.log('   Branche:', this.branch);
    console.log('   LFS Base:', this.lfsBase);
  }

  // ──────────────────────────────────────────────
  // MÉTHODES PUBLIQUES (interface = ServeurAPI)
  // ──────────────────────────────────────────────

  /**
   * Teste la connexion — vérifie que le token est valide et que le projet est accessible
   */
  async testerConnexion() {
    console.log('🔌 Test de connexion GitLab...');
    try {
      const data = await this._request('GET', `/api/v4/user`);
      console.log('✅ Connecté en tant que:', data.username);
      this.currentUser = { name: data.name, username: data.username, id: data.id };
      return { success: true, data };
    } catch (error) {
      console.error('❌ Test connexion échoué:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie l'existence d'un fichier dans le projet
   */
  async verifierExistence(filePath) {
    console.log('🔍 Vérification existence:', filePath);
    try {
      await this._request('GET', `/repository/files/${this._encodePath(filePath)}?ref=${this.branch}`);
      console.log('   ✅ Existe');
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        console.log('   ℹ️ N\'existe pas');
        return false;
      }
      console.error('❌ Erreur vérification:', error.message);
      return false;
    }
  }

  /**
   * Retourne la date du dernier commit qui a modifié le fichier
   */
  async derniereModif(filePath) {
    console.log('🔍 Dernière modification:', filePath);
    try {
      const params = new URLSearchParams({ path: filePath, ref_name: this.branch, per_page: 1 });
      const commits = await this._request('GET', `/repository/commits?${params}`);
      const lastModified = commits?.[0]?.committed_date || null;
      console.log('   ✅ Dernière modif:', lastModified || 'inconnue');
      return lastModified;
    } catch (error) {
      console.error('❌ Erreur dernière modif:', error.message);
      return null;
    }
  }

  /**
   * Lit le contenu d'un fichier (texte UTF-8)
   * GitLab retourne le contenu encodé en base64
   */
  async lireFichier(filePath) {
    console.log('📥 Lecture:', filePath);
    try {
      const data = await this._request(
        'GET',
        `/repository/files/${this._encodePath(filePath)}?ref=${this.branch}`
      );

      // GitLab encode toujours en base64
      let content = Buffer.from(data.content, 'base64').toString('utf8');

      // Détecter si c'est un pointeur LFS et résoudre le vrai contenu
      if (this._isLfsPointer(content)) {
        console.log('   🔗 Pointeur LFS détecté, téléchargement du contenu réel...');
        const oid = content.match(/oid sha256:([a-f0-9]+)/)?.[1];
        const size = parseInt(content.match(/size (\d+)/)?.[1] || '0', 10);
        if (oid) {
          const realContent = await this._downloadLfsObject(oid, size);
          if (realContent !== null) {
            content = realContent;
            console.log('   ✅ Contenu LFS téléchargé:', content.length, 'caractères');
          } else {
            console.warn('   ⚠️ Impossible de télécharger le contenu LFS');
          }
        }
      }

      return {
        success: true,
        content,
        size: content.length,
        modified: data.last_commit_id || new Date().toISOString(),
        path: filePath,
      };
    } catch (error) {
      console.error('❌ Erreur lecture:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Écrit (crée ou met à jour) un fichier — crée un commit Git
   */
  async ecrireFichier(filePath, content) {
    console.log('\n=== ÉCRITURE FICHIER GitLab ===');
    console.log('📤 Chemin:', filePath);
    console.log('📏 Taille:', content.length, 'caractères');
    console.log('================================\n');

    try {
      // Déterminer si le fichier existe pour choisir POST (create) ou PUT (update)
      const exists = await this.verifierExistence(filePath);
      const method = exists ? 'PUT' : 'POST';

      const body = {
        branch: this.branch,
        content: content,
        commit_message: `[SonalPi] Mise à jour ${filePath}`,
        encoding: 'text',
      };

      await this._request(method, `/repository/files/${this._encodePath(filePath)}`, body);

      console.log('✅ Fichier sauvegardé sur GitLab');
      return {
        success: true,
        message: `Fichier sauvegardé (commit sur ${this.branch})`,
        path: filePath,
        size: content.length,
      };
    } catch (error) {
      // Fichier verrouillé par quelqu'un d'autre (LFS lock)
      if (error.statusCode === 403 && error.message.includes('lock')) {
        console.error('❌ Fichier verrouillé par un autre utilisateur');
        return {
          success: false,
          error: 'Fichier verrouillé par un autre utilisateur',
          lockedBy: null,
        };
      }
      console.error('❌ Erreur écriture:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie que .gitattributes contient la règle LFS pour *.sonal.
   * Les .crp sont du JSON (texte) — ils restent en Git normal pour bénéficier
   * du diff et du merge automatique, et éviter les verrous LFS involontaires.
   * Crée ou complète le fichier si nécessaire.
   * À appeler une fois après l'établissement de la connexion.
   */
  async initialiserGitattributes() {
    const GITATTRIBUTES_PATH = '.gitattributes';
    const REGLES_LFS = [
      '*.sonal filter=lfs diff=lfs merge=lfs -text',
    ];

    console.log('📋 Vérification .gitattributes...');
    try {
      const exists = await this.verifierExistence(GITATTRIBUTES_PATH);

      let contenuActuel = '';
      if (exists) {
        const result = await this.lireFichier(GITATTRIBUTES_PATH);
        if (result.success) contenuActuel = result.content;
      }

      const reglesManquantes = REGLES_LFS.filter(r => !contenuActuel.includes(r));

      if (reglesManquantes.length === 0) {
        console.log('   ✅ .gitattributes déjà à jour');
        return false;
      }

      // Normaliser : terminer par \n
      let contenu = contenuActuel.replace(/\n*$/, '\n');
      const separateur = contenu.length > 1 && !contenu.endsWith('\n') ? '\n' : '';
      const nouveauContenu = contenu + separateur + reglesManquantes.join('\n') + '\n';

      const method = exists ? 'PUT' : 'POST';
      const body = {
        branch: this.branch,
        content: nouveauContenu,
        commit_message: '[SonalPi] Mise à jour LFS : *.sonal uniquement',
        encoding: 'text',
      };
      await this._request(method, `/repository/files/${this._encodePath(GITATTRIBUTES_PATH)}`, body);
      console.log('   ✅ .gitattributes mis à jour avec les règles LFS SonalPi');

      // Migrer les fichiers .sonal existants vers LFS :
      // les relire puis les réécrire pour que GitLab les stocke en LFS
      // maintenant que .gitattributes est en place
      await this._migrerSonalVersLFS();

      return true;
    } catch (error) {
      // Non bloquant : on log mais on ne fait pas échouer la connexion
      console.warn('   ⚠️ Impossible de mettre à jour .gitattributes:', error.message);
      return false;
    }
  }

  /**
   * Relire puis réécrire les fichiers .sonal existants pour
   * forcer leur stockage en LFS (après création de .gitattributes).
   */
  async _migrerSonalVersLFS() {
    console.log('🔄 Migration des fichiers .sonal existants vers LFS...');
    try {
      const listing = await this._listerRecursif('');
      const fichiersSonal = listing.filter(f => f.type === 'blob' && f.name.endsWith('.sonal'));

      if (fichiersSonal.length === 0) {
        console.log('   ℹ️ Aucun fichier .sonal à migrer');
        return;
      }

      for (const fichier of fichiersSonal) {
        try {
          console.log(`   🔄 Migration LFS : ${fichier.path}`);
          const result = await this.lireFichier(fichier.path);
          if (!result.success) {
            console.warn(`   ⚠️ Impossible de lire ${fichier.path}`);
            continue;
          }
          // Réécrire le fichier — GitLab le stockera en LFS grâce à .gitattributes
          const body = {
            branch: this.branch,
            content: result.content,
            commit_message: `[SonalPi] Migration LFS ${fichier.path}`,
            encoding: 'text',
          };
          await this._request('PUT', `/repository/files/${this._encodePath(fichier.path)}`, body);
          console.log(`   ✅ ${fichier.path} migré en LFS`);
        } catch (err) {
          console.warn(`   ⚠️ Échec migration ${fichier.path}:`, err.message);
        }
      }
    } catch (error) {
      console.warn('   ⚠️ Impossible de lister les fichiers pour migration LFS:', error.message);
    }
  }

  /**
   * Supprime un fichier — crée un commit Git
   */
  async supprimerFichier(filePath) {
    console.log('🗑️ Suppression:', filePath);
    try {
      const body = {
        branch: this.branch,
        commit_message: `[SonalPi] Suppression ${filePath}`,
      };

      await this._request('DELETE', `/repository/files/${this._encodePath(filePath)}`, body);

      console.log('✅ Fichier supprimé');
      return { success: true, message: 'Fichier supprimé' };
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Liste les fichiers d'un dossier (récursif, paginé)
   * Filtre sur .sonal et .crp uniquement
   */
  async listerFichiers(dirPath) {
    console.log('📂 Liste des fichiers:', dirPath);
    try {
      const files = await this._listerRecursif(dirPath);

      const filtered = files.filter(f =>
        f.type === 'blob' && (f.name.endsWith('.sonal') || f.name.endsWith('.crp'))
      );

      console.log(`✅ ${filtered.length} fichier(s) trouvé(s)`);
      return {
        success: true,
        files: filtered.map(f => ({ name: f.name, path: f.path, size: null })),
        directory: dirPath,
      };
    } catch (error) {
      console.error('❌ Erreur liste:', error);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // VERROUS LFS
  // Les LFS locks GitLab n'expirent pas →
  // pas de demarrerRafraichissement / arreterRafraichissement
  // ──────────────────────────────────────────────

  /**
   * Verrouille un fichier via l'API LFS Locks
   * Retourne le même format que ServeurAPI.verrouillerFichier
   */
  async verrouillerFichier(filePath) {
    console.log('🔒 Tentative de verrouillage LFS:', filePath);
    try {
      const body = {
        path: filePath,
        ref: { name: `refs/heads/${this.branch}` },
      };

      const result = await this._requestLFS('POST', `/locks`, body);

      console.log('✅ Fichier verrouillé, lock id:', result.lock?.id);
      return { success: true, readOnly: false, wasLocked: false };

    } catch (error) {
      // 409 Conflict = fichier déjà verrouillé
      if (error.statusCode === 409) {
        const lockOwnerName = error.data?.lock?.owner?.name || null;
        // Vérifier si c'est l'utilisateur courant (comparer name ET username,
        // car GitLab peut retourner l'un ou l'autre selon la version/config)
        const estMonVerrou = this.currentUser && lockOwnerName && (
          lockOwnerName === this.currentUser.name ||
          lockOwnerName === this.currentUser.username
        );
        if (estMonVerrou) {
          console.log('🔒 Verrou retrouvé (même utilisateur) — réouverture autorisée');
          return { success: true, readOnly: false, wasLocked: true };
        }
        console.warn('⚠️ Fichier verrouillé par:', lockOwnerName);
        return { success: true, readOnly: true, lockedBy: lockOwnerName };
      }
      // 404 = LFS Locks non disponible (LFS pas activé sur le projet)
      // → lecture seule + flag pour affichage UI
      if (error.statusCode === 404 || error.statusCode === 403) {
        console.warn('⚠️ LFS Locks non disponible — fichier en lecture seule');
        return {
          success: true,
          readOnly: true,
          lfsUnavailable: true,
          lockedBy: null,
        };
      }
      console.error('❌ Erreur verrouillage:', error);
      return { success: false, readOnly: false, error: error.message };
    }
  }

  /**
   * Déverrouille un fichier LFS
   * Cherche d'abord l'id du lock par chemin, puis le supprime
   */
  async deverrouillerFichier(filePath) {
    console.log('🔓 Déverrouillage LFS:', filePath);
    try {
      // 1. Récupérer l'id du lock pour ce chemin
      const lockId = await this._trouverLockId(filePath);

      if (!lockId) {
        console.log('   ℹ️ Aucun verrou actif pour ce fichier');
        return { success: true };
      }

      // 2. Supprimer le lock (protocole LFS : POST /locks/:id/unlock)
      const body = {
        force: false,
        ref: { name: `refs/heads/${this.branch}` },
      };
      await this._requestLFS('POST', `/locks/${lockId}/unlock`, body);

      console.log('✅ Verrou supprimé');
      return { success: true };
    } catch (error) {
      // 404 = LFS Locks non disponible — rien à déverrouiller
      if (error.statusCode === 404 || error.statusCode === 403) {
        console.warn('⚠️ LFS Locks non disponible — déverrouillage ignoré');
        return { success: true };
      }
      console.error('❌ Erreur déverrouillage:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie si un fichier est verrouillé
   * Retourne le même format que ServeurAPI.verifierVerrou
   */
  async verifierVerrou(filePath) {
    console.log('🔍 Vérification verrou LFS:', filePath);
    try {
      const params = new URLSearchParams({ path: filePath });
      const data = await this._requestLFS('GET', `/locks?${params}`);
      const locks = data.locks || [];

      if (locks.length === 0) {
        return { success: true, locked: false, lockInfo: null };
      }

      const lock = locks[0];
      const lockInfo = {
        user: lock.owner?.name || 'inconnu',
        date: lock.locked_at,
        id: lock.id,
      };

      console.log('   - Verrouillé par:', lockInfo.user);
      return { success: true, locked: true, lockInfo };

    } catch (error) {
      // 404/403 = LFS Locks non disponible
      if (error.statusCode === 404 || error.statusCode === 403) {
        console.warn('⚠️ LFS Locks non disponible');
        return { success: true, locked: false, lockInfo: null };
      }
      console.error('❌ Erreur vérification verrou:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stub pour compatibilité avec ServeurAPI.
   * Les LFS locks n'expirent pas, donc pas de refresh nécessaire.
   */
  async rafraichirVerrou(_filePath) {
    // No-op : les LFS locks GitLab n'expirent pas
    return { success: true };
  }

  /**
   * Stub pour compatibilité avec ServeurAPI.
   * Aucun timer à gérer côté GitLab.
   */
  nettoyerTousLesVerrous() {
    // No-op
  }

  // ──────────────────────────────────────────────
  // MÉTHODES PRIVÉES
  // ──────────────────────────────────────────────

  /**
   * Encode un chemin de fichier pour l'URL GitLab API
   * "dossier/fichier.sonal" → "dossier%2Ffichier.sonal"
   */
  _encodePath(filePath) {
    return filePath.split('/').map(encodeURIComponent).join('%2F');
  }

  /**
   * Détecte si un contenu est un pointeur LFS Git
   * Format : "version https://git-lfs.github.com/spec/v1\noid sha256:...\nsize ...\n"
   */
  _isLfsPointer(content) {
    return content.startsWith('version https://git-lfs.github.com/spec/v1');
  }

  /**
   * Télécharge le contenu réel d'un objet LFS via l'API Batch.
   * 1. POST /objects/batch → obtient l'URL de téléchargement
   * 2. GET sur cette URL → contenu réel
   * @returns {string|null} Le contenu texte ou null en cas d'erreur
   */
  async _downloadLfsObject(oid, size) {
    try {
      // Étape 1 : Demander l'URL de téléchargement via LFS Batch API
      const batchBody = {
        operation: 'download',
        transfers: ['basic'],
        ref: { name: `refs/heads/${this.branch}` },
        objects: [{ oid, size }],
      };

      const batchResult = await this._requestLFS('POST', '/objects/batch', batchBody);

      const obj = batchResult?.objects?.[0];
      if (!obj || obj.error) {
        console.error('❌ LFS Batch erreur:', obj?.error?.message || 'objet introuvable');
        return null;
      }

      const downloadUrl = obj.actions?.download?.href;
      const downloadHeaders = obj.actions?.download?.header || {};
      if (!downloadUrl) {
        console.error('❌ Pas d\'URL de téléchargement LFS');
        return null;
      }

      // Étape 2 : Télécharger le contenu réel
      console.log('   📥 Téléchargement LFS depuis:', downloadUrl);
      const content = await this._downloadFromUrl(downloadUrl, downloadHeaders);
      return content;
    } catch (error) {
      console.error('❌ Erreur téléchargement LFS:', error.message);
      return null;
    }
  }

  /**
   * Télécharge le contenu brut depuis une URL (utilisé pour les objets LFS)
   */
  _downloadFromUrl(downloadUrl, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(downloadUrl);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'SonalPi/1.0',
          ...extraHeaders,
        },
        rejectUnauthorized: false,
        agent: false,
      };

      // Si pas de header Authorization fourni par LFS, utiliser notre token
      if (!extraHeaders['Authorization'] && !extraHeaders['authorization']) {
        options.headers['Authorization'] = `Basic ${Buffer.from(`oauth2:${this.accessToken}`).toString('base64')}`;
      }

      const req = https.request(options, (res) => {
        // Suivre les redirections (GitLab renvoie souvent un 302 vers le storage)
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            console.log('   ↪️ Redirection LFS:', redirectUrl);
            this._downloadFromUrl(redirectUrl, {}).then(resolve).catch(reject);
            return;
          }
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} lors du téléchargement LFS`));
            return;
          }
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Timeout téléchargement LFS'));
      });
      req.end();
    });
  }

  /**
   * Liste récursive via l'API tree, gère la pagination
   */
  async _listerRecursif(dirPath) {
    let allFiles = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const params = new URLSearchParams({
        path: dirPath,
        ref: this.branch,
        recursive: 'true',
        per_page: perPage,
        page: page,
      });

      const items = await this._request('GET', `/repository/tree?${params}`);
      allFiles = allFiles.concat(items);

      if (items.length < perPage) break;
      page++;
    }

    return allFiles;
  }

  /**
   * Récupère l'id du LFS lock pour un chemin donné (null si pas de lock)
   */
  async _trouverLockId(filePath) {
    const params = new URLSearchParams({ path: filePath });
    const data = await this._requestLFS('GET', `/locks?${params}`);
    const locks = data.locks || [];
    return locks.length > 0 ? locks[0].id : null;
  }

  /**
   * Requête HTTPS vers l'API Git LFS (protocole standard).
   * URL de base : https://instance/projet.git/info/lfs
   * Headers spécifiques : Accept/Content-Type application/vnd.git-lfs+json
   */
  _requestLFS(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.lfsBase}${endpoint}`;
      const urlObj = new URL(fullUrl);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          // GitLab LFS attend une auth Basic : "oauth2:<token>"
          'Authorization': `Basic ${Buffer.from(`oauth2:${this.accessToken}`).toString('base64')}`,
          'User-Agent': 'SonalPi/1.0',
          'Accept': 'application/vnd.git-lfs+json',
        },
        rejectUnauthorized: false,
        agent: false,
      };

      let bodyBuffer = null;
      if (body !== null && ['POST', 'PUT', 'DELETE'].includes(method)) {
        bodyBuffer = Buffer.from(JSON.stringify(body), 'utf8');
        options.headers['Content-Type'] = 'application/vnd.git-lfs+json';
        options.headers['Content-Length'] = bodyBuffer.length;
      }

      console.log(`→ LFS ${method} ${fullUrl}`);

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');

          if (res.statusCode === 204) {
            resolve({ success: true });
            return;
          }

          let data;
          try {
            data = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, raw });
              return;
            }
            const err = new Error(`HTTP ${res.statusCode}: réponse non-JSON`);
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }

          if (res.statusCode >= 400) {
            const message = data.message || data.error || `HTTP ${res.statusCode}`;
            const err = new Error(message);
            err.statusCode = res.statusCode;
            err.data = data;
            reject(err);
            return;
          }

          resolve(data);
        });
      });

      req.on('error', (error) => {
        console.error('❌ Erreur réseau LFS:', error);
        reject(error);
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout LFS API'));
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }

  /**
   * Requête HTTPS générique vers l'API GitLab v4
   * Pour les appels sur /api/v4/user (hors projet), passer un chemin absolu commençant par /api/v4/
   */
  _request(method, endpointOrPath, body = null) {
    return new Promise((resolve, reject) => {
      // Construire l'URL complète
      let fullUrl;
      if (endpointOrPath.startsWith('/api/v4/')) {
        // Chemin absolu (ex: /api/v4/user)
        fullUrl = `${this.instanceUrl}${endpointOrPath}`;
      } else {
        // Chemin relatif au projet
        fullUrl = `${this.apiBase}${endpointOrPath}`;
      }

      const urlObj = new URL(fullUrl);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'SonalPi/1.0',
          'Accept': 'application/json',
        },
        rejectUnauthorized: false, // Compatibilité certificats self-signed
        agent: false,
      };

      let bodyBuffer = null;
      if (body !== null && ['POST', 'PUT', 'DELETE'].includes(method)) {
        bodyBuffer = Buffer.from(JSON.stringify(body), 'utf8');
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = bodyBuffer.length;
      }

      console.log(`→ GitLab ${method} ${fullUrl}`);

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');

          // 204 No Content (ex: DELETE réussi)
          if (res.statusCode === 204) {
            resolve({ success: true });
            return;
          }

          let data;
          try {
            data = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            // Réponse non-JSON inattendue
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, raw });
              return;
            }
            const err = new Error(`HTTP ${res.statusCode}: réponse non-JSON`);
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }

          if (res.statusCode >= 400) {
            const message = data.message || data.error || `HTTP ${res.statusCode}`;
            const err = new Error(message);
            err.statusCode = res.statusCode;
            err.data = data;
            reject(err);
            return;
          }

          resolve(data);
        });
      });

      req.on('error', (error) => {
        console.error('❌ Erreur réseau GitLab:', error);
        reject(error);
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout GitLab API'));
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }
}

module.exports = GitLabAPI;
