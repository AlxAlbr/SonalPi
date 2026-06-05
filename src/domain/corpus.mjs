// Domaine : (dé)sérialisation du fichier .crp (Corpus).
//
// Source de vérité unique de la logique de format .crp, extraite fidèlement de
// modules/gestion_corpus.js (lireCorpus / sauvegarderCorpus). Pur, sans DOM :
// importable en Node (tests) comme dans le renderer (via src/index.mjs).
//
// Voir docs/FORMATS.md §1.
//
// Ce module porte AUSSI l'agrégat racine `Corpus` (Phase 3) — voir en bas de fichier.

import { Variable, Modalite, unionDonnees } from './eav.mjs';
import { Entretien } from './entretien.mjs';

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

// ── Agrégat racine `Corpus` (Phase 3) ───────────────────────────────────────
//
// Enveloppe TYPÉE et PURE du corpus ouvert. Comme `Entretien`, c'est un wrapper
// transitoire sur les snapshots du process main (assemblés via IPC get-corpus /
// get-ent / get-var / get-dic) : on opère, puis on repousse via set-*. Le main
// reste l'unique source de vérité ; cette classe ne tient aucun état persistant,
// ni Electron/IPC/fs/DOM.
//
// Décision Phase 3 (cf. PlanPoo §6) : `StorageFactory` n'est PAS absorbé ici (il
// reste main-side comme sélecteur de backend derrière l'IPC). Ce qui migre dans
// `Corpus`, c'est la partie pure : les getters dérivés `estLocal`/`estCollaboratif`
// — `type` restant la source de vérité (PlanPoo, bloc d'état).

export class Corpus {
  #meta; #entretiens; #variables; #modalites;

  /**
   * @param {{meta?:object, entretiens?:Entretien[], variables?:Variable[], modalites?:Modalite[]}} parts
   */
  constructor({ meta = {}, entretiens = [], variables = [], modalites = [] } = {}) {
    this.#meta = meta;
    this.#entretiens = entretiens;
    this.#variables = variables;
    this.#modalites = modalites;
  }

  /**
   * Assemble un Corpus depuis les snapshots IPC.
   * @param {{corpus?:object, tabEnt?:Array, tabVar?:Array, tabDic?:Array}} snapshots
   */
  static fromParts({ corpus = {}, tabEnt = [], tabVar = [], tabDic = [] } = {}) {
    return new Corpus({
      meta: corpus,
      entretiens: tabEnt.map(o => Entretien.fromJSON(o)),
      variables: tabVar.map(o => Variable.fromJSON(o)),
      modalites: tabDic.map(o => Modalite.fromJSON(o)),
    });
  }

  // ── Identité backend & capacités dérivées ──────────────────────────────────
  get type() { return this.#meta.type; }                 // 'local'|'distant'|'gitlab'
  get estLocal() { return this.#meta.type === 'local'; }
  get estCollaboratif() { return this.#meta.type != null && this.#meta.type !== 'local'; }
  get estGitlab() { return this.#meta.type === 'gitlab'; }
  get dossier() { return this.#meta.folder; }            // folder
  get nomFichier() { return this.#meta.fileName; }       // fileName
  get url() { return this.#meta.url; }

  // ── Sous-objets ────────────────────────────────────────────────────────────
  entretiens() { return this.#entretiens; }
  /** @returns {Entretien|undefined} */
  entretienParId(id) { return this.#entretiens.find(e => e.identifiant == id); }
  variables() { return this.#variables; }   // définitions (maîtres dans le .crp)
  modalites() { return this.#modalites; }

  /**
   * Vue calculée des données du corpus = UNION des tabDat locaux des entretiens
   * (cf. eav.unionDonnees). N'est jamais un cache resynchronisé.
   * @returns {import('./eav.mjs').Donnee[]}
   */
  donnees() { return unionDonnees(this.#entretiens.map(e => e.toJSON())); }

  // ── Sérialisation vers les snapshots (pour repousser via set-*) ────────────
  toEntretiens() { return this.#entretiens.map(e => e.toJSON()); }
  toVariables() { return this.#variables.map(v => v.toJSON()); }
  toModalites() { return this.#modalites.map(m => m.toJSON()); }
}
