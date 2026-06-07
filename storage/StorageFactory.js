'use strict';

const LocalStorage = require('./LocalStorage.js');

/**
 * Fabrique de Storage : généralise l'ancien `remoteAPI()` en incluant le local.
 *
 * Les instances distantes (`serveur`, `gitlab`) sont réassignées par main.js au
 * gré des connexions/déconnexions ; elles sont donc passées **en argument** à
 * `pour()` (instances vivantes), plutôt qu'enregistrées une fois pour toutes.
 * Le `LocalStorage`, lui, est sans état → singleton interne.
 *
 * ⚠️ Couche de pont volontairement mince. À terme (PlanPoo Phase 3, agrégat
 * `Corpus`), cette sélection a vocation à devenir une méthode `Corpus.storage()`
 * et ce fichier à disparaître au profit de l'entité `Corpus`. Cf. PlanPoo.md §6.
 */
const localStorage = new LocalStorage();

const StorageFactory = {
  /** Instance LocalStorage partagée (sans état). */
  local: localStorage,

  /**
   * @param {{type?: string}} corpus            corpus courant (Corpus global)
   * @param {{serveur?: object, gitlab?: object}} remotes  instances distantes vivantes
   * @returns {object} l'implémentation Storage adaptée au type de corpus
   */
  pour(corpus, { serveur = null, gitlab = null } = {}) {
    const type = corpus && corpus.type;
    if (type === 'gitlab') return gitlab;
    if (type === 'distant') return serveur;
    // 'local' (et défaut) → stockage fichier local
    return localStorage;
  },
};

module.exports = StorageFactory;
