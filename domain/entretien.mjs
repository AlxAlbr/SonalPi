// Domaine : agrégat Entretien.
//
// Enveloppe TYPÉE et PURE d'un entretien (le « sac de propriétés » tabEnt[i] du
// format .crp/.sonal). Sans Electron, IPC, fs ni DOM : importable en Node (tests)
// comme dans le renderer (via domain/index.mjs). Source de vérité inchangée : l'état
// canonique reste le store du process main ; cette classe est un wrapper transitoire
// (pull snapshot → wrap → opère → toJSON → push), comme le domaine EAV.
//
// Noms de propriétés explicites ; toJSON reste FIDÈLE aux clés gelées du format
// (cf. docs/FORMATS.md §1 tabEnt) — il préserve aussi les champs non modélisés
// (métadonnées volatiles, etc.) pour rester sans perte.
//
// La logique I/O (charger/sauvegarderSonal, convertRtrToSonal, exports, verrou)
// reste côté orchestration/infra ; ici on n'expose que la structure pure et ses
// accès EAV.

import { Variable, Modalite, Donnee } from './metadonnees.mjs';
import { serializeSonal } from './sonal.mjs';

export class Entretien {
  #data;

  /** @param {object} data snapshot brut au format (clés gelées id/nom/tabLoc/tabDat…) */
  constructor(data = {}) {
    this.#data = data;
  }

  static fromJSON(o) { return new Entretien(o); }

  /** Sérialisation sans perte : renvoie le snapshot au format (toutes clés conservées). */
  toJSON() { return { ...this.#data }; }

  // ── Identité & métadonnées (clé gelée entre parenthèses) ───────────────────
  get identifiant() { return this.#data.id; }          // id
  get nom() { return this.#data.nom; }                  // nom
  get notes() { return this.#data.notes; }              // notes
  get duree() { return this.#data.hms; }                // hms (HH:MM:SS)
  get fichierSonal() { return this.#data.rtrPath; }     // rtrPath (nom du .sonal)
  get fichierAudio() { return this.#data.audioPath; }   // audioPath
  get fichierImage() { return this.#data.imgPath; }     // imgPath

  // ── Locuteurs (index 0 = vide, cf. FORMATS.md §1) ──────────────────────────
  get locuteurs() { return this.#data.tabLoc || []; }
  /** Libellé du locuteur d'index donné (renvoie à `data-loc` des segments). */
  nomLocuteur(index) { return this.locuteurs[index]; }

  // ── EAV : valeurs locales (source de vérité .sonal) + définitions locales ──
  /** Données (valeurs prises) de l'entretien — `tabDat`. @returns {Donnee[]} */
  donnees() { return (this.#data.tabDat || []).map(o => Donnee.fromJSON(o)); }
  /** Variables embarquées dans l'entretien — `tabVar`. @returns {Variable[]} */
  variables() { return (this.#data.tabVar || []).map(o => Variable.fromJSON(o)); }
  /** Modalités embarquées dans l'entretien — `tabDic`. @returns {Modalite[]} */
  modalites() { return (this.#data.tabDic || []).map(o => Modalite.fromJSON(o)); }

  // ── Bruts pour l'instant (Variable/Modalité, voir metadonnees.mjs) ────────────────────────────
  get reglesAnon() { return this.#data.tabAnon || []; }  // tabAnon
  get categories() { return this.#data.tabThm || []; }   // tabThm

  // ── Sérialisation .sonal ─────────────────────────────────────────
  /**
   * Produit le contenu .sonal de l'entretien à partir de SES données (locuteurs,
   * valeurs, notes, règles anon) et du codebook/définitions du corpus + du HTML
   * compacté des segments. Sérialisation pure (I/O = orchestrateur). Cf.
   * domain/sonal.mjs:serializeSonal (port de gestion_fichiers.js:sauvHtml).
   *
   * @param {{html:string, tabThm:Array, tabVar:Array, tabDic:Array}} contexte
   * @returns {string}
   */
  serialiserSonal({ html, tabThm, tabVar, tabDic } = {}) {
    return serializeSonal({
      tabLoc: this.#data.tabLoc,
      tabDat: this.#data.tabDat,
      notes: this.#data.notes,
      tabAnon: this.#data.tabAnon,
      tabThm, tabVar, tabDic, html,
    });
  }
}
