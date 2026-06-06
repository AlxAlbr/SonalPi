// Domaine : agrégat Document (= un .sonal) — Phase 5.
//
// Document → Segment[] → Fragment[]. Le `.sonal` est du HTML segmenté
// (MODELE_OBJET3 §1/§2) : chaque `span.lblseg` est un Segment, chaque
// `span[data-rk]` à l'intérieur est un Fragment (un run de tokens consécutifs au
// même formatage). Le Token (rang `data-rk`) est l'atome, JAMAIS matérialisé en
// objet — on ne le désigne que par son rang.
//
// Construit par LECTURE DOM (html + doc), comme parseSonal : `doc` = `document`
// réel dans le renderer, un document jsdom dans les tests. Pur (aucun I/O).
//
// READ-MODEL pour l'instant : le graphe Segment/Fragment est une PROJECTION en
// lecture (requêtes de segmentation/codage). La source canonique du contenu reste
// le HTML (`document.html`) ; `toSonal` sérialise ce HTML via sonal.mjs. Les
// MUTATIONS (SplitSeg/compact/undo…) relèvent d'une tranche ultérieure (DocumentView).
//
// Noms explicites. Voir docs/FORMATS.md §2.

import { serializeSonal } from './sonal.mjs';

const EST_CATEGORIE = /^cat_\d+$/;

function nombre(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Fragment : un `span[data-rk]` — run de tokens au même formatage (ex-« Mot »).
 * Porte ses 3 calques orthogonaux (codage / anonymisation / commentaire).
 */
export class Fragment {
  #data;
  constructor(data = {}) { this.#data = data; }

  static depuisSpan(span) {
    const d = span.dataset;
    const classes = [...span.classList];

    let anon = null;
    if (span.classList.contains('anon-exception')) anon = { type: 'anon-exception', pseudo: d.pseudo ?? null, nt: d.anonNt ?? null };
    else if (span.classList.contains('anon')) anon = { type: 'anon', pseudo: d.pseudo ?? null, nt: d.anonNt ?? null };

    let commentaire = null;
    if ('obs' in d || 'auth' in d || 'finobs' in d) {
      commentaire = { auteur: d.auth ?? null, obs: d.obs ?? null, finobs: d.finobs ?? null };
    }

    return new Fragment({
      rang: nombre(d.rk),                 // data-rk (1er token)
      longueur: nombre(d.len),            // data-len (nb de tokens)
      segment: nombre(d.sg),              // data-sg (segment parent)
      texte: span.textContent,
      categories: classes.filter((c) => EST_CATEGORIE.test(c)), // cat_xxx
      anon,                               // OccurrenceAnon (§5) ou null
      commentaire,                        // Commentaire (§2) ou null
    });
  }

  get rang() { return this.#data.rang; }
  get longueur() { return this.#data.longueur; }
  get segment() { return this.#data.segment; }
  get texte() { return this.#data.texte; }
  get categories() { return this.#data.categories ?? []; }
  get anon() { return this.#data.anon; }
  get commentaire() { return this.#data.commentaire; }
  estCode() { return this.categories.length > 0; }
  toJSON() { return { ...this.#data }; }
}

/** Segment : un `span.lblseg` — une prise de parole, possède ses Fragment[]. */
export class Segment {
  #data; #fragments;
  constructor(data = {}, fragments = []) { this.#data = data; this.#fragments = fragments; }

  static depuisElement(el) {
    const d = el.dataset;
    const fragments = [...el.querySelectorAll('[data-rk]')].map((s) => Fragment.depuisSpan(s));
    return new Segment({
      rang: nombre(d.rksg),               // data-rksg (ordre)
      debut: nombre(d.deb),               // data-deb (s)
      fin: nombre(d.fin),                 // data-fin (s)
      locuteur: d.loc ?? null,            // data-loc (-> Locuteur)
      statut: d.statut ?? null,           // deb|fin de tour
      nomLocuteur: d.nomloc ?? null,      // data-nomloc
    }, fragments);
  }

  get rang() { return this.#data.rang; }
  get debut() { return this.#data.debut; }
  get fin() { return this.#data.fin; }
  get locuteur() { return this.#data.locuteur; }
  get statut() { return this.#data.statut; }
  get nomLocuteur() { return this.#data.nomLocuteur; }
  fragments() { return this.#fragments; }
  toJSON() { return { ...this.#data, fragments: this.#fragments.map((f) => f.toJSON()) }; }
}

/**
 * Extrait (dérivé — NON stocké, MODELE_OBJET3 §4) : une plage CONTIGUË de
 * Fragment partageant une catégorie. Peut enjamber les segments (les `.lblseg`
 * sont transparents). Reconstruit à la lecture, jamais persisté.
 */
export class Extrait {
  #fragments; #categorie;
  /** @param {Fragment[]} fragments @param {?string} categorie */
  constructor(fragments = [], categorie = null) { this.#fragments = fragments; this.#categorie = categorie; }

  fragments() { return this.#fragments; }
  get categorie() { return this.#categorie; }
  /** Rang (token `rk`) du 1er fragment. */
  get debut() { return this.#fragments[0]?.rang ?? null; }
  /** Rang (token `rk`) du dernier fragment. */
  get fin() { return this.#fragments.at(-1)?.rang ?? null; }
  get texte() { return this.#fragments.map((f) => f.texte).join(''); }
  toJSON() {
    return { categorie: this.#categorie, debut: this.debut, fin: this.fin, texte: this.texte };
  }
}

/** Agrégat racine d'un entretien : le contenu segmenté du .sonal. */
export class Document {
  #html; #segments;

  /** @param {string} html contenu segmenté (corps #contenuText) ; @param {Segment[]} segments */
  constructor(html = '', segments = []) { this.#html = html; this.#segments = segments; }

  /** Construit depuis le HTML des segments (corps #contenuText). */
  static fromHtml(html = '', doc) {
    const root = doc.createElement('div');
    root.innerHTML = html;
    const segments = [...root.querySelectorAll('.lblseg')]
      .map((el) => Segment.depuisElement(el))
      .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
    return new Document(html, segments);
  }

  /** Construit depuis un .sonal COMPLET (extrait le corps #contenuText). */
  static fromSonal(sonalHtml = '', doc) {
    const root = doc.createElement('div');
    root.innerHTML = sonalHtml;
    const corps = root.querySelector('#contenuText')?.innerHTML ?? '';
    return Document.fromHtml(corps, doc);
  }

  get html() { return this.#html; }
  segments() { return this.#segments; }
  /** @returns {Segment|undefined} */
  segmentParRang(rang) { return this.#segments.find((s) => s.rang == rang); }
  /** Tous les Fragment, tous segments confondus. */
  fragments() { return this.#segments.flatMap((s) => s.fragments()); }

  /** Locuteurs distincts (loc, nomloc) — Locuteur n'a pas d'objet propre (MODELE §2). */
  locuteurs() {
    const vus = new Map();
    for (const s of this.#segments) {
      if (s.locuteur == null) continue;
      const cle = `${s.locuteur}|${s.nomLocuteur ?? ''}`;
      if (!vus.has(cle)) vus.set(cle, { loc: s.locuteur, nomloc: s.nomLocuteur ?? null });
    }
    return [...vus.values()];
  }

  // ── Requêtes de codage (Phase 5 tranche 3b) ────────────────────────────────

  /** Fragments portant au moins une catégorie. */
  fragmentsCodes() { return this.fragments().filter((f) => f.estCode()); }

  /** Codes de catégories présents dans le document (distincts, ordre d'apparition). */
  categoriesPresentes() {
    const vues = new Set();
    for (const f of this.fragments()) for (const c of f.categories) vues.add(c);
    return [...vues];
  }

  /**
   * Extraits = runs CONTIGUS de fragments (en ordre document) satisfaisant le
   * prédicat. Un fragment non satisfaisant rompt le run ; les `.lblseg` sont
   * transparents (un extrait peut enjamber les segments). Cœur de l'algorithme
   * de Synthèse.js, ici pur et paramétrable.
   *
   * @param {(f: Fragment) => boolean} predicat
   * @param {?string} categorie étiquette portée par les extraits (optionnel)
   * @returns {Extrait[]}
   */
  extraits(predicat, categorie = null) {
    const out = [];
    let courant = [];
    for (const f of this.fragments()) {
      if (predicat(f)) courant.push(f);
      else if (courant.length) { out.push(new Extrait(courant, categorie)); courant = []; }
    }
    if (courant.length) out.push(new Extrait(courant, categorie));
    return out;
  }

  /** Extraits d'une catégorie donnée (runs contigus des fragments la portant). */
  extraitsParCategorie(code) {
    return this.extraits((f) => f.categories.includes(code), code);
  }

  // ── Sérialisation ───────────────────────────────────────────────────────────

  /**
   * Sérialise le .sonal complet à partir de ce contenu (html) + le contexte
   * corpus/entretien fourni. Délègue à sonal.mjs:serializeSonal.
   * @param {{tabLoc, tabThm, tabVar, tabDic, tabDat, notes, tabAnon}} contexte
   */
  toSonal(contexte = {}) {
    return serializeSonal({ ...contexte, html: this.#html });
  }
}
