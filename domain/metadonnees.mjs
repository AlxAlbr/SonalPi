// Domaine : modèle EAV (Variable / Modalité / Donnée) du corpus.
//
// EAV = Entité-Attribut-Valeur. Pour un Entretien (entité) et une Variable
// (attribut), une Donnée porte la Modalité (valeur) prise, éventuellement par
// locuteur. Source de vérité (docs/FORMATS.md §1) :
//   - définitions (Variable/Modalité ↔ tabVar/tabDic) : maîtres dans le .crp ;
//   - valeurs (Donnée ↔ tabDat) : maîtres dans le .sonal de CHAQUE entretien.
//     Le tabDat au niveau corpus est une VUE CALCULÉE (union des locaux), jamais
//     un cache resynchronisé à la main (cf. unionDonnees).
//
// Pur, sans DOM ni I/O : importable en Node (tests) comme dans le renderer.
// Les classes portent des noms explicites ; la (dé)sérialisation vers les clés
// courtes GELÉES du format (v/lib/champ/priv/m/e/l) passe par fromJSON/toJSON
// (mapping sans perte — l'ordre des clés n'est pas un invariant, cf. FORMATS.md).

/** Variable (attribut EAV) — définition, maître dans le .crp (`tabVar`). */
export class Variable {
  /**
   * @param {number} code    identifiant numérique (clé .crp : `v`)
   * @param {string} libelle libellé affiché (`lib`)
   * @param {string} portee  "gen" (général) | "loc" (par locuteur) (`champ`)
   * @param {string} privee  "true" | "false" (`priv`)
   */
  constructor(code, libelle, portee, privee) {
    this.code = code;
    this.libelle = libelle;
    this.portee = portee;
    this.privee = privee;
  }
  static fromJSON(o) { return new Variable(o.v, o.lib, o.champ, o.priv); }
  toJSON() { return { v: this.code, lib: this.libelle, champ: this.portee, priv: this.privee }; }
}

/** Modalité (valeur possible d'une Variable) — maître dans le .crp (`tabDic`). */
export class Modalite {
  /**
   * @param {number} variable code de la Variable de rattachement (clé : `v`)
   * @param {number} code     identifiant de la modalité, 0 = vide (`m`)
   * @param {string} libelle  libellé (`lib`)
   */
  constructor(variable, code, libelle) {
    this.variable = variable;
    this.code = code;
    this.libelle = libelle;
  }
  static fromJSON(o) { return new Modalite(o.v, o.m, o.lib); }
  toJSON() { return { v: this.variable, m: this.code, lib: this.libelle }; }
}

/** Donnée (modalité prise par un Entretien pour une Variable) — maître dans le .sonal (`tabDat`). */
export class Donnee {
  /**
   * @param {string} entretien id de l'entretien (clé : `e`)
   * @param {number} variable  code de la Variable (`v`)
   * @param {number|string} locuteur numéro de locuteur ou "all" (`l`)
   * @param {number} modalite  code de la Modalité prise (`m`)
   */
  constructor(entretien, variable, locuteur, modalite) {
    this.entretien = entretien;
    this.variable = variable;
    this.locuteur = locuteur;
    this.modalite = modalite;
  }
  static fromJSON(o) { return new Donnee(o.e, o.v, o.l, o.m); }
  toJSON() { return { e: this.entretien, v: this.variable, l: this.locuteur, m: this.modalite }; }
}

// ── Vue calculée ────────────────────────────────────

/**
 * Vue calculée des données au niveau corpus : UNION des `tabDat` locaux des
 * entretiens (source de vérité .sonal). Pour un même triplet (entretien,
 * variable, locuteur), la dernière modalité rencontrée gagne ; les lignes
 * incomplètes (v/l/m nuls) sont ignorées.
 *
 * Remplace le « rebuild » manuel en tête de gestion_data.js:inventaireVariables :
 * le tabDat corpus n'est plus un cache resynchronisé à la main, mais dérivé à la
 * demande — il ne peut donc plus accumuler d'entrées périmées.
 *
 * @param {Array<{id:*, tabDat?:Array}>} entretiens entretiens au format (tabDat brut)
 * @returns {Donnee[]}
 */
export function unionDonnees(entretiens) {
  const donnees = [];
  for (const entretien of entretiens) {
    const idEnt = String(entretien.id);
    for (const d of entretien.tabDat || []) {
      if (d.v == null || d.l == null || d.m == null) continue;
      const existante = donnees.find(
        x => x.entretien == idEnt && x.variable == d.v && x.locuteur == d.l
      );
      if (existante) existante.modalite = d.m;
      else donnees.push(new Donnee(idEnt, d.v, d.l, d.m));
    }
  }
  return donnees;
}

/**
 * Inventaire des définitions de variables : UNION des `tabVar` locaux par-dessus
 * les variables déjà connues au niveau corpus. Une variable locale n'est ajoutée
 * que si aucune variable connue ne partage son libellé (à code identique ou
 * différent) — fidèle à gestion_data.js:inventaireVariables.
 *
 * @param {Array<{tabVar?:Array}>} entretiens
 * @param {Array} variablesConnues variables corpus au format (`tabVar`)
 * @returns {Variable[]}
 */
export function inventorierVariables(entretiens, variablesConnues = []) {
  const variables = variablesConnues.map(Variable.fromJSON);
  for (const entretien of entretiens) {
    for (const v of entretien.tabVar || []) {
      const dejaConnue = variables.some(x => x.libelle === v.lib);
      if (!dejaConnue) variables.push(Variable.fromJSON(v));
    }
  }
  return variables;
}

// ── Opérations sur les valeurs (cœur de getMod / validMod / chgDic) ──────────

/**
 * Lit la modalité prise par un entretien pour une variable et un locuteur.
 * Pur : ne crée PAS de ligne manquante (contrairement au legacy getMod, dont
 * l'initialisation à 0 relève désormais de l'appelant).
 *
 * @param {Donnee[]} donnees données de l'entretien
 * @param {number} variable code de la variable
 * @param {number|string} locuteur locuteur (numéro ou "all")
 * @param {Modalite[]} modalites dictionnaire (source de vérité des libellés)
 * @returns {{modalite:number, libelle:string}}
 */
export function lireValeur(donnees, variable, locuteur, modalites = []) {
  const ligne = donnees.find(d => d.variable == variable && d.locuteur == locuteur);
  if (!ligne) return { modalite: 0, libelle: '' };
  const modalite = ligne.modalite;
  if (modalite > 0) {
    const dic = modalites.find(m => m.variable == variable && m.code == modalite);
    return { modalite, libelle: dic ? dic.libelle : '' };
  }
  return { modalite, libelle: '' };
}

/**
 * Définit la valeur (modalité) prise par un entretien pour une variable et un
 * locuteur, à partir d'un LIBELLÉ saisi. Si le libellé n'existe pas encore pour
 * cette variable, une nouvelle modalité est créée (code = max + 1, ou 1).
 *
 * Cœur de gestion_data.js:validMod, sans DOM ni persistance. Renvoie les
 * collections mises à jour (immuable) ; l'appelant persiste et rafraîchit l'UI.
 *
 * @param {Donnee[]} donnees données de l'entretien
 * @param {Modalite[]} modalites dictionnaire
 * @param {{entretien:*, variable:number, locuteur:(number|string), libelle:string}} valeur
 * @returns {{donnees:Donnee[], modalites:Modalite[], modalite:number}}
 */
export function definirValeur(donnees, modalites, { entretien, variable, locuteur, libelle }) {
  let dictionnaire = modalites;
  const existante = modalites.find(m => m.variable == variable && m.libelle === libelle);
  let code;
  if (existante) {
    code = existante.code;
  } else {
    const codes = modalites.filter(m => m.variable == variable).map(m => m.code);
    const max = Math.max(...codes);
    code = Number.isFinite(max) ? max + 1 : 1;
    dictionnaire = [...modalites, new Modalite(variable, code, libelle)];
  }

  const idEnt = String(entretien);
  const i = donnees.findIndex(
    d => d.entretien == idEnt && d.variable == variable && d.locuteur == locuteur
  );
  const valeursMaj = donnees.slice();
  if (i > -1) valeursMaj[i] = new Donnee(idEnt, variable, locuteur, code);
  else valeursMaj.push(new Donnee(idEnt, variable, locuteur, code));

  return { donnees: valeursMaj, modalites: dictionnaire, modalite: code };
}

/**
 * Renomme (ou crée) une modalité dans le dictionnaire. Cœur de
 * gestion_data.js:chgDic. Renvoie un nouveau tableau (immuable), sans persistance.
 *
 * @param {Modalite[]} modalites
 * @param {number} variable code de la variable
 * @param {number} code code de la modalité
 * @param {string} libelle nouveau libellé
 * @returns {Modalite[]}
 */
export function renommerModalite(modalites, variable, code, libelle) {
  const i = modalites.findIndex(m => m.variable == variable && m.code == code);
  if (i > -1) {
    const copie = modalites.slice();
    copie[i] = new Modalite(copie[i].variable, copie[i].code, libelle);
    return copie;
  }
  return [...modalites, new Modalite(Number(variable), code, libelle)];
}

// ── Opérations sur les définitions de variables (cœur de addVar/sauvVar/supprVar) ──

/**
 * Ajoute une variable et sa « modalité 0 » (vide). Cœur de gestion_data.js:addVar
 * (branche création). Renvoie les collections mises à jour (immuable).
 *
 * @param {Variable[]} variables
 * @param {Modalite[]} modalites
 * @param {{code:number, libelle:string, portee:string, privee:string}} definition
 * @returns {{variables:Variable[], modalites:Modalite[]}}
 */
export function ajouterVariable(variables, modalites, { code, libelle, portee, privee }) {
  return {
    variables: [...variables, new Variable(code, libelle, portee, privee)],
    modalites: [...modalites, new Modalite(code, 0, '')],
  };
}

/**
 * Met à jour la définition d'une variable existante (repérée par son code).
 * Cœur de gestion_data.js:sauvVar. Renvoie le nouveau tableau (immuable).
 *
 * @returns {Variable[]}
 */
export function modifierVariable(variables, { code, libelle, portee, privee }) {
  const i = variables.findIndex(v => v.code == code);
  if (i === -1) return variables;
  const copie = variables.slice();
  copie[i] = new Variable(code, libelle, portee, privee);
  return copie;
}

/**
 * Supprime une variable, ses modalités et ses données. Cœur de
 * gestion_data.js:supprVar (la cascade sur les tabDat locaux des entretiens
 * incombe à l'appelant via retirerVariableDesDonnees). Renvoie les collections
 * mises à jour (immuable).
 *
 * @returns {{variables:Variable[], modalites:Modalite[]}}
 */
export function supprimerVariable(variables, modalites, code) {
  return {
    variables: variables.filter(v => v.code != code),
    modalites: modalites.filter(m => m.variable != code),
  };
}

/**
 * Retire d'une collection de données toutes les valeurs d'une variable.
 * Utilitaire de cascade pour supprimerVariable (à appliquer au tabDat de chaque
 * entretien et à la vue corpus).
 *
 * @returns {Donnee[]}
 */
export function retirerVariableDesDonnees(donnees, code) {
  return donnees.filter(d => d.variable != code);
}
