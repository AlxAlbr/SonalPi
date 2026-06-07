'use strict';

/**
 * Interface `Storage` — plus petit dénominateur commun des backends de fichiers
 * (local, serveur HTTP, GitLab). Côté *main* (CommonJS).
 *
 * Toutes les méthodes de flux fichier passent par cette interface ; les
 * spécificités d'un backend (LFS, options GitLab, file d'écriture par lots,
 * branches, rôles…) restent hors interface, en méthodes propres à la classe.
 *
 * Conventions de retour (alignées sur l'implémentation serveur historique) :
 *   - lireFichier(p)      → { success, content, size, modified }
 *   - ecrireFichier(p,c)  → { success, ...}
 *   - verifierExistence(p)→ boolean
 *   - derniereModif(p)    → string ISO | null
 *   - listerFichiers(dir) → { success, files: [{ name, path }] }
 *   - supprimerFichier(p) → { success }
 *   - verrou*             → { success, readOnly, ... }
 */
class Storage {
  _nonImplemente(methode) {
    throw new Error(`${this.constructor.name}.${methode}() non implémenté`);
  }

  async lireFichier(_filePath) { this._nonImplemente('lireFichier'); }
  async ecrireFichier(_filePath, _content) { this._nonImplemente('ecrireFichier'); }
  async verifierExistence(_filePath) { this._nonImplemente('verifierExistence'); }
  async derniereModif(_filePath) { this._nonImplemente('derniereModif'); }
  async listerFichiers(_dirPath) { this._nonImplemente('listerFichiers'); }
  async supprimerFichier(_filePath) { this._nonImplemente('supprimerFichier'); }

  async verrouillerFichier(_filePath) { this._nonImplemente('verrouillerFichier'); }
  async deverrouillerFichier(_filePath) { this._nonImplemente('deverrouillerFichier'); }
  async rafraichirVerrou(_filePath) { this._nonImplemente('rafraichirVerrou'); }
  async verifierVerrou(_filePath) { this._nonImplemente('verifierVerrou'); }
  nettoyerTousLesVerrous() { /* no-op par défaut */ }
}

module.exports = Storage;
