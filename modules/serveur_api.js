const https = require('https');
const { URL } = require('url');
const chardet = require('chardet');
const iconv = require('iconv-lite');

class ServeurAPI {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl;
    this.apiPath = '/api/upload.php';
    this.username = username;
    this.password = password;
    this.lockRefreshIntervals = new Map();
    
    console.log('📦 ServeurAPI créé:');
    console.log('   Base URL:', this.baseUrl);
    console.log('   API Path:', this.apiPath);
    console.log('   Username:', this.username);
  }

  /**
   * Requête HTTP générique vers l'API
   */
  request(filePath, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {

      console.log('\n🔍 === DÉTAILS REQUÊTE ===');
      console.log('FilePath reçu:', filePath);
      console.log('Base URL:', this.baseUrl);
      console.log('API Path:', this.apiPath);
      
      // Si c'est test-auth.php, ne PAS utiliser upload.php
      let url;
      if (filePath === 'test-auth.php') {
        url = new URL('/api/test-auth.php', this.baseUrl);
        console.log('🔌 Test d\'authentification - URL directe');
      } else {
        url = new URL(this.apiPath, this.baseUrl);
        
        if (filePath) {
          console.log('Chemin fichier demandé:', filePath);
          url.searchParams.set('file', filePath);
        }
      }
      
      console.log('URL CONSTRUITE:');
      console.log('URL complète:', url.toString());
      console.log('Protocol:', url.protocol);
      console.log('Host:', url.host);
      console.log('Pathname:', url.pathname);
      console.log('Search:', url.search);
      if (url.searchParams.toString()) {
        console.log('Params:', Object.fromEntries(url.searchParams));
      }
      
      const authString = `${this.username}:${this.password}`;
      const auth = Buffer.from(authString, 'utf8').toString('base64');
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'SonalApp/1.0',
          'Accept': '*/*'
        },
        rejectUnauthorized: false,
        agent: false
      };

      if (body && method === 'PUT') {
        const bodyBuffer = Buffer.from(body, 'utf8');
        options.headers['Content-Type'] = 'text/plain; charset=utf-8';
        options.headers['Content-Length'] = bodyBuffer.length;
        
        console.log('  Body à envoyer:');
        console.log('   Type:', typeof body);
        console.log('   Length:', body.length, 'caractères');
        console.log('   Buffer length:', bodyBuffer.length, 'octets');
      }

      console.log(`${method} ${url.href}`);

      const req = https.request(options, (res) => {
        console.log('Réponse reçue - Status:', res.statusCode);

        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        const chunks = [];

        res.on('data', chunk => chunks.push(chunk));

        res.on('end', () => {
          if (chunks.length === 0) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: No content`));
            }
            return;
          }

          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          
          try {
            if (contentType.includes('json')) {
              const data = JSON.parse(buffer.toString('utf8'));
              
              if (res.statusCode >= 400) {
                const error = new Error(data.error || `HTTP ${res.statusCode}`);
                error.statusCode = res.statusCode;
                error.data = data;
                
                reject(error);
                return;
              }
              
              resolve(data);
              return;
            }

            const encoding = chardet.detect(buffer) || 'utf8';
            const content = iconv.decode(buffer, encoding);

            try {
              const data = JSON.parse(content);
              
              if (res.statusCode >= 400) {
                const error = new Error(data.error || `HTTP ${res.statusCode}`);
                error.statusCode = res.statusCode;
                error.data = data;
                reject(error);
                return;
              }
              
              resolve(data);
            } catch {
              resolve({ 
                success: true, 
                content,
                encoding,
                contentType
              });
            }

          } catch (e) {
            reject(new Error(`Erreur décodage: ${e.message}`));
          }
        });
      });

      req.on('error', error => {
        console.error('❌ Erreur réseau:', error);
        reject(error);
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      if (body && method === 'PUT') {
        console.log('✍️ Écriture du body dans la requête...');
        req.write(body, 'utf8');
        console.log('✅ Body écrit');
      }
      req.end();
    });
  }

  /**
   * Requête avec action (pour les verrous)
   */
  requestWithAction(filePath, action) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiPath, this.baseUrl);
      
      // Ajouter les deux paramètres séparément
      url.searchParams.set('file', filePath);
      url.searchParams.set('action', action);
      
      console.log('🌐 URL avec action:', url.toString());
      
      const authString = `${this.username}:${this.password}`;
      const auth = Buffer.from(authString, 'utf8').toString('base64');
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'SonalApp/1.0',
          'Accept': '*/*'
        },
        rejectUnauthorized: false,
        agent: false
      };
      
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          
          try {
            const data = JSON.parse(buffer.toString('utf8'));
            
            if (res.statusCode >= 400) {
              const error = new Error(data.error || `HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.data = data;
              reject(error);
            } else {
              resolve(data);
            }
          } catch (e) {
            reject(new Error('Erreur parse JSON: ' + e.message));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  /**
   * Télécharge un fichier avec verrouillage automatique
   */
  async lireFichier(filePath) {

    console.log('📥 Lecture:', filePath);
   
    try {
      // 1. Essayer de verrouiller
      // const lockResult = await this.verrouillerFichier(filePath);
      
      // 2. Lire le contenu
      const result = await this.request(filePath, 'GET');
     
      //console.log('📦 Résultat:');
      //console.log('   - success:', result.success);
      //console.log('   - content length:', result.content?.length || 0);
      //console.log('   - locked:', result.locked);
      //console.log('   - lock_info:', result.lock_info);
      
      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }
      
      // Si verrouillage réussi, démarrer le rafraîchissement
      //if (!lockResult.readOnly) {
      //  this.demarrerRafraichissement(filePath);
      //}
     
      return {
        success: true,
        content: result.content,
        size: result.size,
        modified: result.modified,
        path: result.path,
        //locked: result.locked,
        //lockInfo: result.lock_info,
        //readOnly: lockResult.readOnly
      };
    } catch (error) {
      console.error('❌ Erreur lecture:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verrouille un fichier
   */
  async verrouillerFichier(filePath) {
    console.log('🔒 Tentative de verrouillage:', filePath);
    
    try {
      const result = await this.requestWithAction(filePath, 'lock');
      
      if (result.success) {
        console.log('✅ Fichier verrouillé:', result.was_locked ? 'déjà à vous' : 'nouveau verrou');
        return { 
          success: true, 
          readOnly: false,
          wasLocked: result.was_locked
        };
      }
      
    } catch (error) {
      if (error.statusCode === 423 || error.message.includes('locked')) {
        console.warn('⚠️ Fichier verrouillé par un autre utilisateur');
        return { 
          success: true, 
          readOnly: true,
          lockedBy: error.data?.locked_by || null
        };
      }
      
      console.error('❌ Erreur verrouillage:', error);
      return { 
        success: false, 
        readOnly: true,
        error: error.message 
      };
    }
  }

  /**
   * Déverrouille un fichier
   */
  async deverrouillerFichier(filePath) {
    console.log('🔓 Déverrouillage:', filePath);
    
    this.arreterRafraichissement(filePath);
    
    try {
      const result = await this.requestWithAction(filePath, 'unlock');
      
      if (result.success) {
        console.log('✅ Verrou supprimé');
        return { success: true };
      }
      
    } catch (error) {
      console.error('❌ Erreur déverrouillage:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Rafraîchit un verrou
   */
  async rafraichirVerrou(filePath) {
    try {
      const result = await this.requestWithAction(filePath, 'refresh_lock');
      
      if (result.success) {
        console.log('🔄 Verrou rafraîchi pour:', filePath);
        return { success: true };
      }
      
    } catch (error) {
      console.error('❌ Erreur rafraîchissement:', error);
      return { success: false };
    }
  }

  /**
   * Démarre le rafraîchissement automatique
   */
  demarrerRafraichissement(filePath) {

 
    if (this.lockRefreshIntervals.has(filePath)) {
      clearInterval(this.lockRefreshIntervals.get(filePath));
    }
    
    const intervalId = setInterval(() => {
      this.rafraichirVerrou(filePath);
    }, 5 * 60 * 1000);
    
    this.lockRefreshIntervals.set(filePath, intervalId);
    console.log('⏰ Rafraîchissement automatique démarré pour:', filePath);
  }

  /**
   * Arrête le rafraîchissement automatique
   */
  arreterRafraichissement(filePath) {
    if (this.lockRefreshIntervals.has(filePath)) {
      clearInterval(this.lockRefreshIntervals.get(filePath));
      this.lockRefreshIntervals.delete(filePath);
      console.log('⏰ Rafraîchissement automatique arrêté pour:', filePath);
    }
  }

  /**
   * Sauvegarde un fichier
   */
  async ecrireFichier(filePath, content) {
    console.log('\n=== ÉCRITURE FICHIER ===');
    console.log('📤 Chemin:', filePath);
    console.log('📏 Taille contenu:', content.length, 'caractères');
    console.log('========================\n');
      
    try {
      const result = await this.request(filePath, 'PUT', content);
      
      console.log('✅ Réponse serveur:', JSON.stringify(result, null, 2));

      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }
      
      console.log('✅ Fichier sauvegardé');
      return {
        success: true,
        message: result.message,
        size: result.size,
        path: result.path
      };
    } catch (error) {
      if (error.statusCode === 423) {
        console.error('❌ Fichier verrouillé par un autre utilisateur');
        return {
          success: false,
          error: 'Fichier verrouillé par un autre utilisateur',
          lockedBy: error.data?.locked_by
        };
      }
      
      console.error('❌ Erreur écriture:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Supprime un fichier
   */
  async supprimerFichier(filePath) {
    console.log('🗑️ Suppression:', filePath);
    
    try {
      const result = await this.request(filePath, 'DELETE');
      
      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }
      
      console.log('✅ Fichier supprimé');
      return {
        success: true,
        message: result.message
      };
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Liste les fichiers d'un dossier
   */
  async listerFichiers(dirPath) {
    console.log('📂 Liste des fichiers:', dirPath);
    
    try {
      const result = await this.request(dirPath, 'POST');
      
      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }
      
      console.log(`✅ ${result.files.length} fichier(s) trouvé(s)`);
      return {
        success: true,
        files: result.files,
        directory: result.directory
      };
    } catch (error) {
      console.error('❌ Erreur liste:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Teste la connexion
   */
  async testerConnexion() {
    console.log('🔌 Test de connexion...');
    
    try {
      const result = await this.request('test-auth.php', 'GET');
      console.log('✅ Authentification réussie');
      return { success: true, data: result };
    } catch (error) {
      console.error('❌ Test connexion échoué:', error.message);
      
      if (error.statusCode === 401) {
        return { 
          success: false, 
          error: 'Authentification échouée' 
        };
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Nettoie tous les verrous
   */
  nettoyerTousLesVerrous() {
    console.log('🧹 Nettoyage de tous les verrous...');
    for (const [filePath, intervalId] of this.lockRefreshIntervals) {
      clearInterval(intervalId);
      console.log('   - Arrêt timer pour:', filePath);
    }
    this.lockRefreshIntervals.clear();
  }


  /**
 * Vérifie si un fichier est verrouillé
 */
async verifierVerrou(filePath) {
  console.log('🔍 Verification verrou:', filePath);
  
  try {
    const result = await this.requestWithAction(filePath, 'check_lock');
    
    console.log('   - Verrouillé:', result.locked ? 'OUI' : 'NON');
    if (result.locked) {
      console.log('   - Par:', result.lock_info.user);
      console.log('   - Depuis:', result.lock_info.date);
    }
    
    return {
      success: true,
      locked: result.locked,
      lockInfo: result.lock_info
    };
    
  } catch (error) {
    console.error('❌ Erreur vérification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

}

module.exports = ServeurAPI;