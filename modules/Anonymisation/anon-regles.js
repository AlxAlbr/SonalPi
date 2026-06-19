////////////////////////////////////////////////////////////////////////
// CŒUR DES RÈGLES D'ANONYMISATION DU CORPUS (clés canoniques, fusion, conflits, persistance)
//
// Extrait de gestion_corpus.js (Partie 0 du plan multi-pseudo) SANS changement de comportement.
// Regroupe les primitives « règles entité↔pseudo » du corpus :
//   - cleAnon / clesAlias / cleEntite / regleEnCollisionAlias : clés canoniques + détection de
//     collision au niveau alias (« A/B » vs « A ») ;
//   - fusionnerRegles / conflitsPseudoParEntite : fusion « corpus autoritaire » + signalement ;
//   - reglesCorpusPropres / persisterReglesCorpus / synchroniserTabAnonGlobal : normalisation et
//     écriture du tabAnon corpus.
//
// Dépend de parseAliases (anon-detection.js) → chargé APRÈS anon-detection.js, dans index.html
// ET edition_entretien.html. Fonctions globales : les appelants (Anonymisation/*,
// gestion_entretiens.js, gestion_corpus.js/lireCrpSonal2) les résolvent au runtime.
////////////////////////////////////////////////////////////////////////

/**
 * Clé canonique d'une paire (entité, pseudo) pour la déduplication des règles d'anonymisation.
 * RÈGLE UNIQUE partagée par tous les chemins de fusion/synchro/dédup : trim + minuscules
 * (insensible à la casse → « Paris » et « paris » sont la MÊME règle). Centralisée ici pour
 * que les différents chemins ne puissent plus diverger (avant : certains lowercase, d'autres non).
 * @param {string} entite
 * @param {string} remplacement
 * @returns {string}
 */
function cleAnon(entite, remplacement) {
    return `${String(entite).trim().toLowerCase()}|${String(remplacement).trim().toLowerCase()}`;
}

/**
 * Clés canoniques des ALIAS d'une entité : « entité » peut regrouper plusieurs alias séparés par
 * « / » (ex. "Lyon/Lyons"), qui partagent un même pseudo et matchent les mêmes occurrences. La
 * RÈGLE « une entité = un pseudo » s'applique en réalité au niveau de chaque alias. Cette primitive
 * renvoie l'ensemble (dédupliqué, insensible à la casse) des clés d'alias. Splitter canonique =
 * parseAliases (anon-detection.js, chargé dans les deux contextes).
 * @param {string} entite
 * @returns {string[]}
 */
function clesAlias(entite) {
    const seen = new Set();
    for (const a of parseAliases(entite)) {
        const k = a.trim().toLowerCase();
        if (k) seen.add(k);
    }
    return Array.from(seen);
}

/**
 * Clé canonique d'une ENTITÉ (alias normalisés : trim + minuscules + ordre indifférent). Sert aux
 * comparaisons « est-ce la MÊME entité ? » : "Lyon/Lyons" et "Lyons/Lyon" donnent la même clé.
 * Pour une entité simple (sans « / »), identique à l'ancien comportement (trim + minuscules).
 * NB : la collision PARTIELLE entre groupes (un alias commun) ne se voit PAS ici — utiliser
 * clesAlias / regleEnCollisionAlias pour la détecter.
 * @param {string} entite
 * @returns {string}
 */
function cleEntite(entite) {
    return clesAlias(entite).sort().join('/');
}

/**
 * Cherche, parmi des règles, la PREMIÈRE qui partage au moins un alias (insensible à la casse) avec
 * l'entité donnée — c.-à-d. qui re-pseudonymiserait les mêmes occurrences. Sert aux points d'entrée
 * (ajout manuel, import) pour faire respecter « un alias = un pseudo », y compris quand l'un est un
 * groupe "A/B" et l'autre l'alias seul "A". Renvoie la règle en collision, ou null.
 * @param {string} entite
 * @param {Array<{entite:string, remplacement:string}>} regles
 * @returns {{entite:string, remplacement:string}|null}
 */
function regleEnCollisionAlias(entite, regles) {
    const cibles = new Set(clesAlias(entite));
    if (cibles.size === 0) return null;
    for (const r of (regles || [])) {
        if (!r || !r.entite || !r.remplacement) continue;
        if (clesAlias(r.entite).some(k => cibles.has(k))) return r;
    }
    return null;
}

/**
 * Primitive UNIQUE de fusion : combine plusieurs listes de règles en une liste DÉDUPLIQUÉE de
 * règles propres { entite, remplacement } (trim), clé canonique = l'ENTITÉ seule (cleEntite,
 * insensible à la casse). Première occurrence gagnante → l'ORDRE des listes définit la priorité
 * (« corpus autoritaire » : passer la liste corpus EN PREMIER fait gagner son pseudo).
 *
 * Déduplication AU NIVEAU ALIAS : une règle "A/B" pose deux liens (A→pseudo, B→pseudo). Si un alias
 * a déjà été attribué par une liste prioritaire, il est retiré de la règle courante ; on RE-ÉMET le
 * groupe avec ses seuls alias non encore pris (split). Conséquence : "Lyon→ville" (corpus) puis
 * "Lyon/Lyons→métropole" (entretien) donne "Lyon→ville" + "Lyons→métropole" — on garde l'alias
 * libre au lieu de le perdre. La divergence sur l'alias commun est signalée par
 * conflitsPseudoParEntite (rien n'est tranché en silence). Une règle dont tous les alias sont déjà
 * pris disparaît. Paires incomplètes ignorées.
 * Utilisée par reglesCorpusPropres, synchroniserTabAnonGlobal et reconstituerTabAnonGlobal.
 * @param {...Array} listes - listes de règles ({entite, remplacement, ...})
 * @returns {Array<{entite:string, remplacement:string}>}
 */
function fusionnerRegles(...listes) {
    const pris = new Set(); // clés d'alias déjà attribuées (1ʳᵉ liste gagnante)
    const out = [];
    for (const liste of listes) {
        for (const p of (liste || [])) {
            if (!p || !p.entite || !p.remplacement) continue;
            const remplacement = String(p.remplacement).trim();
            if (!remplacement) continue;
            // Garder les alias (orthographe d'origine) dont la clé n'est pas déjà prise.
            const survivants = [];
            const vusLocal = new Set();
            for (const alias of parseAliases(p.entite)) {
                const k = alias.trim().toLowerCase();
                if (!k || pris.has(k) || vusLocal.has(k)) continue;
                vusLocal.add(k);
                survivants.push(alias.trim());
            }
            if (survivants.length === 0) continue;
            survivants.forEach(a => pris.add(a.toLowerCase()));
            out.push({ entite: survivants.join('/'), remplacement });
        }
    }
    return out;
}

/**
 * Détecte les entités auxquelles plusieurs listes attribuent des pseudos DIFFÉRENTS (conflit
 * « une entité = un pseudo »). Sert à SIGNALER ce que la fusion a tranché (le 1er pseudo vu
 * gagne) plutôt que de le perdre en silence — notamment sur un .crp déjà divergent.
 *
 * Détection AU NIVEAU ALIAS, cohérente avec fusionnerRegles : un groupe "A/B" est éclaté en alias,
 * et le conflit "Lyon→ville" vs "Lyon/Lyons→métropole" est signalé sur l'alias « Lyon ». Le champ
 * `entite` du conflit porte donc l'ALIAS en cause.
 * @param {...Array} listes - mêmes listes (dans le même ORDRE) que celles passées à fusionnerRegles
 * @returns {Array<{entite:string, pseudoRetenu:string, pseudosIgnores:string[]}>}
 */
function conflitsPseudoParEntite(...listes) {
    const m = new Map(); // clé d'alias → { alias, pseudos: [] (1er = retenu), vus: Set(normalisés) }
    for (const liste of listes) {
        for (const p of (liste || [])) {
            if (!p || !p.entite || !p.remplacement) continue;
            const pseudo = String(p.remplacement).trim();
            if (!pseudo) continue;
            for (const alias of parseAliases(p.entite)) {
                const aliasTrim = alias.trim();
                const cle = aliasTrim.toLowerCase();
                if (!cle) continue;
                if (!m.has(cle)) m.set(cle, { alias: aliasTrim, pseudos: [], vus: new Set() });
                const rec = m.get(cle);
                // Comparaison insensible à la casse : « ville » et « Ville » ne sont PAS un conflit.
                const norm = pseudo.toLowerCase();
                if (!rec.vus.has(norm)) { rec.vus.add(norm); rec.pseudos.push(pseudo); }
            }
        }
    }
    const conflits = [];
    for (const rec of m.values()) {
        if (rec.pseudos.length > 1) {
            conflits.push({ entite: rec.alias, pseudoRetenu: rec.pseudos[0], pseudosIgnores: rec.pseudos.slice(1) });
        }
    }
    return conflits;
}

/**
 * Normalise un tabAnon en RÈGLES de corpus propres : uniquement { entite, remplacement }
 * (trim), dédupliquées sur l'ENTITÉ (insensible à la casse) → une entité = un pseudo.
 *
 * Le corpus ne stocke QUE des règles entité→pseudo. Les occurrences vivent dans les
 * entretiens (matchPositions) et l'état réel (anonymisé/exception/à traiter) est dérivé du
 * DOM/scan. On évite ainsi de polluer le .crp avec occurrences/matchPositions/indexCourant/
 * source — et leurs incohérences (le champ `source` était posé/supprimé selon le chemin).
 * @param {Array} tab
 * @returns {Array<{entite:string, remplacement:string}>}
 */
function reglesCorpusPropres(tab) {
    return fusionnerRegles(tab);
}

/**
 * Persiste le tabAnon global du corpus en ne gardant que des règles propres.
 * Point d'entrée unique pour toute écriture du tabAnon corpus (remplace les appels
 * directs à window.electronAPI.setAnon).
 * @param {Array} tab
 */
async function persisterReglesCorpus(tab) {
    return window.electronAPI.setAnon(reglesCorpusPropres(tab));
}

/**
 * Synchronise le tabAnon global avec les modifications du tabAnon local d'un entretien
 * Ajoute les nouvelles paires (entité - pseudo) qui ne sont pas déjà dans le global
 * @param {Array} tabAnonGlobal - Tableau global existant
 * @param {Array} tabAnonLocal - Tableau local nettoyé de l'entretien qui vient d'être sauvegardé
 * @returns {Array} Tableau global mis à jour
 */
async function synchroniserTabAnonGlobal(tabAnonGlobal, tabAnonLocal) {
  // Global d'abord (priorité aux règles déjà connues), puis les nouvelles paires du local.
  // La primitive fusionnerRegles déduplique sur la clé canonique (insensible à la casse) et
  // ne renvoie que des règles propres { entite, remplacement } ; les champs runtime
  // (occurrences/source/…) ne sont de toute façon pas persistés (cf. persisterReglesCorpus).
  return fusionnerRegles(tabAnonGlobal, tabAnonLocal);
}
