// Domaine : RègleAnon (instruction d'anonymisation) — Phase 4.
//
// Une RègleAnon est une INSTRUCTION : « remplacer l'entité par le pseudonyme ».
// Son identité est le couple (entite, remplacement), insensible à la casse.
// Les champs `occurrences`/`indexCourant`/`matchPositions` sont l'ÉTAT d'application
// (combien de fois trouvée, où). La MATÉRIALISATION dans le texte — les spans
// `anon`/`anon-exception` + `data-pseudo`, avec l'asymétrie à 3 états
// (anonymisé / exception / présent-non-anonymisé) — est le `ContenuAnon`, qui
// dépend du Document : modélisé en Phase 5 (cf. PlanPoo §7/§8). Ici on ne modélise
// que l'instruction et la fusion des listes de règles.
//
// Pur, sans DOM. Noms explicites ; toJSON fidèle aux clés gelées du format
// (entite/remplacement/occurrences/indexCourant/matchPositions + source…).
// Voir docs/FORMATS.md §1 (tabAnon).

/** Règle d'anonymisation (une entrée de `tabAnon`). */
export class RegleAnon {
  #data;

  /** @param {object} data snapshot brut (entite/remplacement/occurrences/matchPositions/…) */
  constructor(data = {}) { this.#data = data; }

  static fromJSON(o) { return new RegleAnon(o); }
  /** Sérialisation sans perte (préserve aussi les champs d'état non modélisés). */
  toJSON() { return { ...this.#data }; }

  get entite() { return this.#data.entite; }
  get remplacement() { return this.#data.remplacement; }   // le pseudonyme affiché
  get occurrences() { return this.#data.occurrences; }
  get source() { return this.#data.source; }               // 'Global' | 'Entretien' | 'Local'
  /** Positions matérialisées (ContenuAnon, modélisé en Phase 5). */
  get positions() { return this.#data.matchPositions || []; }

  /** Clé d'identité : `entite|remplacement`, insensible à la casse. */
  cle() { return `${(this.entite || '').toLowerCase()}|${(this.remplacement || '').toLowerCase()}`; }
  /** Ligne vide (saisie) : entité ou remplacement manquant. */
  estVide() { return !this.entite || !this.remplacement; }
}

/**
 * Fusionne les règles d'un entretien (local) vers la liste globale du corpus :
 * conserve les règles globales, ajoute celles du local absentes (clé entite|pseudo),
 * sans écraser les existantes. Cœur de gestion_corpus.js:synchroniserTabAnonGlobal,
 * sans I/O ni log. Les lignes vides sont ignorées.
 *
 * @param {Array} global règles globales (au format)
 * @param {Array} local  règles d'un entretien (au format)
 * @returns {RegleAnon[]}
 */
export function fusionnerReglesAnon(global = [], local = []) {
  const parCle = new Map();

  for (const o of global) {
    const regle = RegleAnon.fromJSON(o);
    if (regle.estVide()) continue;
    if (!parCle.has(regle.cle())) parCle.set(regle.cle(), regle);
  }

  for (const o of local) {
    const regle = RegleAnon.fromJSON(o);
    if (regle.estVide()) continue;
    if (!parCle.has(regle.cle())) {
      parCle.set(regle.cle(), new RegleAnon({
        entite: o.entite,
        remplacement: o.remplacement,
        occurrences: o.occurrences || 0,
        indexCourant: o.indexCourant || 0,
        matchPositions: o.matchPositions || [],
        source: o.source || 'Entretien',
      }));
    }
  }

  return [...parCle.values()];
}
