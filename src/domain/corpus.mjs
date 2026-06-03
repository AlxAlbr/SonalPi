// Domaine : (dé)sérialisation du fichier .crp (Corpus).
//
// Source de vérité unique de la logique de format .crp, extraite fidèlement de
// modules/gestion_corpus.js (lireCorpus / sauvegarderCorpus). Pur, sans DOM :
// importable en Node (tests) comme dans le renderer (via src/index.mjs).
//
// Voir docs/FORMATS.md §1.

/**
 * Parse le contenu d'un .crp (Sonal π / Sonal 3) et applique la normalisation
 * de chargement réelle : valeurs par défaut + codebook tout actif/non compacté.
 *
 * Reproduit modules/gestion_corpus.js:lireCorpus (branche "corpus Sonal 3").
 * Ne gère pas la conversion Sonal 2 (`<|THEM|`), qui reste dans le renderer.
 *
 * @param {string} content - contenu textuel du .crp
 * @returns {{tabThm:Array,tabVar:Array,tabDic:Array,tabDat:Array,tabEnt:Array,tabAnon:Array,ent_cur:number}}
 */
export function parseCorpus(content) {
  if (!content) throw new Error('Impossible de lire le fichier');

  const crp = JSON.parse(content);

  const tabThm = crp.tabThm || [];
  const tabVar = crp.tabVar || [];
  const tabDic = crp.tabDic || [];
  const tabDat = crp.tabDat || [];
  const tabEnt = crp.tabEnt || [];
  const tabAnon = crp.tabAnon || [];
  const ent_cur = crp.ent_cur || -1; // comportement legacy strict (cf. lireCorpus)

  // À l'ouverture, toutes les thématiques sont actives et non compactées.
  for (let i = 0; i < tabThm.length; i++) {
    tabThm[i].act = true;
    tabThm[i].cmpct = false;
  }

  return { tabThm, tabVar, tabDic, tabDat, tabEnt, tabAnon, ent_cur };
}

/**
 * Sérialise l'état corpus vers le contenu .crp à écrire.
 *
 * Doit produire EXACTEMENT la même chaîne que
 * modules/gestion_corpus.js:sauvegarderCorpus :
 *   JSON.stringify({ tabThm, tabEnt, tabVar, tabDic, tabAnon })
 * L'ordre des clés est significatif pour rester identique à l'octet près.
 *
 * @param {{tabThm:Array,tabEnt:Array,tabVar:Array,tabDic:Array,tabAnon:Array}} state
 * @returns {string}
 */
export function serializeCorpus({ tabThm, tabEnt, tabVar, tabDic, tabAnon }) {
  return JSON.stringify({ tabThm, tabEnt, tabVar, tabDic, tabAnon });
}
