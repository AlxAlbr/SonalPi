// Domaine : Codebook (Catégorie) — Phase 4.
//
// Le codebook (`tabThm` du .crp) est un ARBRE APLATI PAR PROFONDEUR : une liste
// ordonnée où le `rang` (niveau, "0" racine, "1" enfant…) encode la hiérarchie.
// Les descendants d'une catégorie sont les entrées CONTIGUËS suivantes de rang
// strictement supérieur, jusqu'à la première de rang ≤ au sien (fidèle à
// thematisation.js:nbEnfants/aEnfants).
//
// Pur, sans DOM : importable en Node (tests) comme dans le renderer. La logique de
// rendu/filtrage (afflistThm, multiThm, CSS, isoleThm…) reste côté UI ; ici on ne
// modélise que la structure et les requêtes de hiérarchie/activation.
//
// Noms explicites ; toJSON fidèle aux clés GELÉES (code/nom/couleur/taille/cmpct/rang/act).
// Voir docs/FORMATS.md §1 (tabThm).

/** Catégorie (code de catégorisation) — une entrée du codebook (`tabThm`). */
export class Categorie {
  #data;

  /** @param {object} data snapshot brut (code/nom/couleur/taille/cmpct/rang/act) */
  constructor(data = {}) { this.#data = data; }

  static fromJSON(o) { return new Categorie(o); }
  /** Sérialisation sans perte (toutes clés conservées). */
  toJSON() { return { ...this.#data }; }

  get code() { return this.#data.code; }        // "cat_XXX"
  get nom() { return this.#data.nom; }
  get couleur() { return this.#data.couleur; }   // hex ou ""
  get taille() { return this.#data.taille; }     // nombre ou ""
  get compacte() { return this.#data.cmpct; }    // cmpct (bool)
  get niveau() { return Number(this.#data.rang); } // rang (profondeur, 0 = racine)
  get active() { return this.#data.act; }        // act (bool)
}

/** Conteneur hiérarchique des catégories (l'ordre porte l'arborescence). */
export class Codebook {
  #categories;

  /** @param {Categorie[]} categories */
  constructor(categories = []) { this.#categories = categories; }

  static fromJSON(tabThm = []) { return new Codebook(tabThm.map(o => Categorie.fromJSON(o))); }
  /** Sérialisation sans perte vers `tabThm`. */
  toJSON() { return this.#categories.map(c => c.toJSON()); }

  categories() { return this.#categories; }
  /** @returns {Categorie|undefined} */
  parCode(code) { return this.#categories.find(c => c.code === code); }
  indexParCode(code) { return this.#categories.findIndex(c => c.code === code); }
  /** Catégories racines (niveau 0). */
  racines() { return this.#categories.filter(c => c.niveau === 0); }

  // ── Hiérarchie aplatie par profondeur ──────────────────────────────────────

  /** A-t-elle au moins un enfant ? (cf. thematisation.js:aEnfants) */
  aEnfants(i) {
    const niveau = this.#categories[i]?.niveau ?? 0;
    const suivant = this.#categories[i + 1];
    return suivant ? suivant.niveau > niveau : false;
  }

  /** Nombre de descendants = taille du sous-arbre (cf. thematisation.js:nbEnfants). */
  nbDescendants(i) {
    const niveau = this.#categories[i]?.niveau ?? 0;
    let n = 0;
    for (let j = i + 1; j < this.#categories.length; j++) {
      if (this.#categories[j].niveau > niveau) n++;
      else break;
    }
    return n;
  }

  /** Toutes les catégories descendantes (bloc contigu de rang supérieur). */
  descendants(i) {
    return this.#categories.slice(i + 1, i + 1 + this.nbDescendants(i));
  }

  /** Enfants DIRECTS (niveau immédiatement inférieur d'un cran). */
  enfantsDirects(i) {
    const niveau = this.#categories[i]?.niveau ?? 0;
    return this.descendants(i).filter(c => c.niveau === niveau + 1);
  }

  /** Parent (ascendant immédiat) de la catégorie d'index i, ou undefined si racine. */
  parent(i) {
    const niveau = this.#categories[i]?.niveau ?? 0;
    if (niveau === 0) return undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (this.#categories[j].niveau < niveau) return this.#categories[j];
    }
    return undefined;
  }

  // ── Activation (données ; le filtrage d'affichage reste côté UI) ────────────

  nbActives() { return this.#categories.filter(c => c.active).length; }
  auMoinsUneActive() { return this.#categories.some(c => c.active); }
}
