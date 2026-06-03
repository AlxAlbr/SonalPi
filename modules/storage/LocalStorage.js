'use strict';

const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const iconv = require('iconv-lite');

const Storage = require('./Storage.js');

/**
 * Stockage local : enrobe `fs`. C'est le maillon qui manquait (le local était
 * jusqu'ici codé en `fs.xxx` inline dans main.js).
 *
 * Travail mono-utilisateur : les verrous sont des **no-op** (toujours « succès,
 * éditable »), ce qui permet aux appelants de traiter local/distant à l'identique.
 */
class LocalStorage extends Storage {
  /**
   * Lit un fichier texte : détection d'encodage (chardet) puis décodage iconv
   * (windows-1252 / utf8). Réplique le comportement historique de main.js.
   * Renvoie la forme commune { success, content, size, modified }.
   */
  async lireFichier(filePath) {
    try {
      const buf = fs.readFileSync(filePath);
      const stats = fs.statSync(filePath);
      const encoding = chardet.detect(buf);
      const content = (encoding === 'ISO-8859-1' || encoding === 'windows-1252')
        ? iconv.decode(buf, 'windows-1252')
        : iconv.decode(buf, 'utf8');
      return {
        success: true,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        path: filePath,
      };
    } catch (err) {
      console.error('Erreur de lecture du fichier local :', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Écrit un fichier. `encoding` optionnel : 'win1252' pour forcer le décodage
   * latin (sinon utf8). Aligné sur les chemins d'écriture locaux de main.js.
   */
  async ecrireFichier(filePath, content, encoding = 'utf8') {
    try {
      if (encoding && encoding !== 'utf8' && encoding !== 'UTF-8') {
        fs.writeFileSync(filePath, iconv.encode(content, 'win1252'));
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }
      return { success: true, path: filePath };
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du fichier :', err);
      return { success: false, error: err.message };
    }
  }

  async verifierExistence(filePath) {
    return fs.existsSync(filePath);
  }

  async derniereModif(filePath) {
    try {
      return fs.statSync(filePath).mtime.toISOString();
    } catch {
      return null;
    }
  }

  async listerFichiers(dirPath) {
    try {
      const files = fs.readdirSync(dirPath).map((name) => ({
        name,
        path: path.join(dirPath, name),
      }));
      return { success: true, files, directory: dirPath };
    } catch (err) {
      console.error('Erreur liste fichiers locaux :', err);
      return { success: false, error: err.message };
    }
  }

  async supprimerFichier(filePath) {
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (err) {
      console.error('Erreur suppression fichier local :', err);
      return { success: false, error: err.message };
    }
  }

  // ── Verrous : no-op (travail local mono-utilisateur) ──────────────────────
  async verrouillerFichier(_filePath) { return { success: true, readOnly: false }; }
  async deverrouillerFichier(_filePath) { return { success: true }; }
  async rafraichirVerrou(_filePath) { return { success: true }; }
  async verifierVerrou(_filePath) { return { success: true, locked: false, lockInfo: null }; }
  nettoyerTousLesVerrous() { /* no-op */ }
}

module.exports = LocalStorage;
