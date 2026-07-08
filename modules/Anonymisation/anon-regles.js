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
 * Affichage COMPACT d'une entité longue : « n premiers mots […] n derniers mots » au-delà de 2·n mots.
 * Ne touche QUE l'affichage — le texte complet reste la donnée (entretien : révélé au focus ;
 * corpus : conservé dans le title). Partagé entretien (textarea) ↔ corpus (cellule). Défaut n=6.
 * @param {string} texte
 * @param {number} n
 * @returns {string}
 */
function tronquerEntiteAffichage(texte, n = 6) {
    const t = (texte == null ? '' : String(texte)).trim();
    if (!t) return '';
    const mots = t.split(/\s+/);
    if (mots.length <= 2 * n) return t;
    return mots.slice(0, n).join(' ') + ' […] ' + mots.slice(-n).join(' ');
}

/**
 * Anonymisation HTML DÉFINITIVE (irréversible), en place dans un élément DOM détaché.
 * - run anonymisé (debsel.anon … finsel.anon) → remplacé par « [pseudo] » (pseudo lu sur le finsel →
 *   gère le multi-pseudo par occurrence) ; les spans absorbés internes (incluses) sont vidés ;
 * - exception (.anon-exception) / « à anonymiser » (data-anon-nt) → texte original conservé, marqueurs retirés.
 * Ne touche QUE le marquage d'anonymisation : la structure (data-rk/data-sg/data-deb…) est préservée.
 * Placé ici (anon-regles.js, chargé dans LES DEUX fenêtres) car l'export corpus tourne côté index.html
 * alors qu'anon-export-document.js n'est chargé que côté entretien. @returns {HTMLElement} root muté
 */
function _anonymiserDansElement(root) {
    if (!root) return root;
    const spans = Array.from(root.querySelectorAll('[data-rk]'));
    const nettoyerMarqueurs = (s) => {
        s.classList.remove('anon', 'anon-exception', 'debsel', 'finsel', 'anon-selected', 'highlight-occ', 'reperage-hit');
        s.removeAttribute('data-pseudo');
        s.removeAttribute('data-anon-nt');
        s.removeAttribute('data-pseudo-absorbe');
    };
    let i = 0;
    while (i < spans.length) {
        const span = spans[i];
        if (span.classList.contains('anon') && span.classList.contains('debsel')) {
            let fin = i;
            for (let j = i; j < spans.length; j++) {
                if (spans[j].classList.contains('finsel') && spans[j].classList.contains('anon')) { fin = j; break; }
            }
            const pseudo = (spans[fin].dataset.pseudo || span.dataset.pseudo || span.textContent || '').trim();
            for (let k = i; k <= fin; k++) {
                const s = spans[k];
                nettoyerMarqueurs(s);
                s.textContent = (k === i) ? `[${pseudo}]` : '';
            }
            i = fin + 1;
        } else {
            i++;
        }
    }
    root.querySelectorAll('.anon-exception, [data-anon-nt]').forEach(nettoyerMarqueurs);
    return root;
}

/**
 * Variante chaîne : anonymise définitivement un fragment HTML stocké (ex. tabEnt[i].html) et renvoie
 * le HTML nettoyé. Utilisée par l'export corpus (index.html) et l'export document (entretien).
 * @param {string} html @returns {string}
 */
function _anonymiserHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = (html == null ? '' : String(html)).replace(/^`|`$/g, ''); // certains HTML stockés sont entourés de backticks
    _anonymiserDansElement(tmp);
    return tmp.innerHTML;
}

/**
 * Pseudonymisation DÉFINITIVE des LIBELLÉS de locuteurs (.ligloc) d'un élément DOM détaché :
 * `data-nomloc` ← nom affiché anonymisé (pseudo si confirmé/suggéré, sinon nom réel), marqueurs
 * `loc-*` et attributs dérivés retirés — sinon le VRAI nom fuiterait via `data-nomloc` /
 * `data-nomloc-barre` dans le fichier partagé. Pendant ligloc de `_anonymiserDansElement` (qui ne
 * traite que les `[data-rk]`). Partagé : export entretien (`AnonymiserSegments`,
 * anon-export-document.js) et export corpus réouvrable (`exporterCorpusReouvrable`, tableau_global.js).
 * @param {HTMLElement} root @returns {HTMLElement} root muté
 */
function _anonymiserLiglocsDansElement(root) {
    if (!root) return root;
    root.querySelectorAll('.ligloc[data-nomloc]').forEach(lig => {
        const aff = (typeof nomLocAffiche === 'function') ? nomLocAffiche(lig, { anonymise: true }) : lig.dataset.nomloc;
        lig.dataset.nomloc = aff;
        lig.classList.remove('loc-anon', 'loc-suggere', 'loc-suggere-refuse');
        delete lig.dataset.locpseudo;
        delete lig.dataset.locpseudoSuggere;
        delete lig.dataset.nomlocBarre; // dérivé du VRAI nom (barré) → ne pas fuiter dans l'export
    });
    return root;
}

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
 * Garde-fou de la proposition « affixe de liaison » (cf. plan-affixes-liaison.md) : vrai s'il existe
 * DÉJÀ, dans le jeu effectif de l'entretien (window.tabAnon = local + corpus fusionnés), une règle
 * portant à la fois l'entité-cœur (même alias) ET le pseudo-cœur (parmi ses pseudos, multi-pseudo
 * inclus). Empêche de re-proposer « Lyon → une grande ville » quand on traite « de Lyon » alors que
 * le cœur existe déjà.
 * @param {string} entiteCoeur
 * @param {string} pseudoCoeur
 * @returns {boolean}
 */
function regleCoeurExiste(entiteCoeur, pseudoCoeur) {
    const cibles = new Set(clesAlias(entiteCoeur));
    if (cibles.size === 0) return false;
    const pc = (pseudoCoeur || '').trim().toLowerCase();
    return (window.tabAnon || []).some(p =>
        p && p.entite &&
        clesAlias(p.entite).some(k => cibles.has(k)) &&
        pseudosDe(p).some(x => x.toLowerCase() === pc)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-PSEUDO (≤2) — une règle peut autoriser DEUX pseudos pour une même entité :
// `remplacement` = pseudo primaire (toujours un pseudo valide unique), `remplacementAlt`
// = 2ᵉ pseudo optionnel. Le pseudo réellement posé est choisi PAR OCCURRENCE (cf. plan
// multi-pseudo). Côté corpus, une règle multi-pseudo est de la donnée passive.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pseudos autorisés par une règle, dans l'ordre [primaire, (alt)]. Trim, sans vide, sans
 * doublon insensible à la casse. Si le primaire est vide mais l'alt présent, l'alt devient
 * le seul pseudo (garantit qu'on ne perd pas un pseudo isolé).
 * @param {{remplacement?:string, remplacementAlt?:string}} regle
 * @returns {string[]} 0, 1 ou 2 pseudos
 */
function pseudosDe(regle) {
    if (!regle) return [];
    const out = [];
    const p = regle.remplacement != null ? String(regle.remplacement).trim() : '';
    if (p) out.push(p);
    const alt = regle.remplacementAlt != null ? String(regle.remplacementAlt).trim() : '';
    if (alt && !out.some(x => x.toLowerCase() === alt.toLowerCase())) out.push(alt);
    return out;
}

/**
 * Vrai si la règle autorise deux pseudos distincts (insensible à la casse).
 * @param {object} regle
 * @returns {boolean}
 */
function estMultiPseudo(regle) {
    return pseudosDe(regle).length > 1;
}

/**
 * Parse une SAISIE utilisateur de pseudo(s) en liste ordonnée [primaire, (alt), …]. Sépare sur
 * « / » (symétrique à parseAliases côté entité), trim, retire vides et doublons (insensible à la
 * casse). Ne tronque PAS à 2 : l'appelant vérifie la limite ≤2 pour afficher un message dédié.
 * @param {string} saisie
 * @returns {string[]}
 */
function parsePseudos(saisie) {
    const out = [];
    for (const part of String(saisie == null ? '' : saisie).split('/')) {
        const p = part.trim();
        if (p && !out.some(x => x.toLowerCase() === p.toLowerCase())) out.push(p);
    }
    return out;
}

/**
 * Valide une SAISIE (entité, pseudo) avant création d'une règle, côté entretien comme corpus :
 * gère le multi-pseudo « a/b » et fait respecter I2 (pas de « / » à la fois côté entité ET côté
 * pseudo) + la limite ≤2. Renvoie soit { erreur:string } soit { remplacement, remplacementAlt? }.
 * Dépend de parseAliases (anon-detection.js).
 * @param {string} entiteVal
 * @param {string} remplacementVal
 * @returns {{erreur:string}|{remplacement:string, remplacementAlt?:string}}
 */
function analyserChampsEntitePseudo(entiteVal, remplacementVal) {
    const pseudos = parsePseudos(remplacementVal);
    if (pseudos.length === 0) return { erreur: "Veuillez remplir le champ Pseudo." };
    if (pseudos.length > 2) return { erreur: "Deux pseudonymes maximum (séparés par « / »)." };
    if (pseudos.length > 1 && parseAliases(entiteVal).length > 1) {
        return { erreur: "Impossible d'avoir « / » à la fois côté entité (alias) et côté pseudo. Choisissez l'un ou l'autre." };
    }
    return { remplacement: pseudos[0], remplacementAlt: pseudos[1] };
}

/**
 * « Garder les deux » : ajoute un 2ᵉ pseudo (alt) à la règle CORPUS d'une entité et persiste.
 * No-op si l'entité n'a pas de règle corpus, si elle est déjà multi-pseudo (≤2), ou si l'alt y
 * figure déjà. Sert aux chemins de conflit (validation entretien, import) pour que l'alt survive à
 * la fusion « corpus autoritaire » du save.
 * @param {string} entite
 * @param {string} pseudoAlt
 * @returns {Promise<boolean>} true si la règle a été modifiée
 */
async function ajouterPseudoAltCorpus(entite, pseudoAlt) {
    const alt = String(pseudoAlt == null ? '' : pseudoAlt).trim();
    if (!alt) return false;
    const tab = await window.electronAPI.getAnon() || [];
    const regle = regleEnCollisionAlias(entite, tab);
    if (!regle || estMultiPseudo(regle)) return false;
    if (pseudosDe(regle).some(p => p.toLowerCase() === alt.toLowerCase())) return false;
    regle.remplacementAlt = alt;
    await persisterReglesCorpus(tab);
    return true;
}

/**
 * Copie propre d'une règle garantissant l'invariant I5 : `remplacement` = pseudo primaire
 * valide (jamais vide ni « a/b »), `remplacementAlt` présent UNIQUEMENT s'il est non vide et
 * distinct du primaire (insensible à la casse). Les autres champs sont conservés tels quels.
 * @param {object} regle
 * @returns {object}
 */
function normaliserRegle(regle) {
    const pseudos = pseudosDe(regle);
    const out = { ...regle };
    out.remplacement = pseudos[0] || '';
    if (pseudos.length > 1) out.remplacementAlt = pseudos[1];
    else delete out.remplacementAlt;
    return out;
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
 *
 * Multi-pseudo : PAS d'auto-union (le « corpus gagne » reste). On se contente de PRÉSERVER le
 * `remplacementAlt` de la règle gagnante (normalisé I5) ; un 2ᵉ pseudo ne naît jamais ici, il
 * provient d'une création explicite (saisie « a/b » ou « garder les deux »).
 * Utilisée par reglesCorpusPropres, synchroniserTabAnonGlobal et reconstituerTabAnonGlobal.
 * @param {...Array} listes - listes de règles ({entite, remplacement, remplacementAlt?, ...})
 * @returns {Array<{entite:string, remplacement:string, remplacementAlt?:string}>}
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
            // normaliserRegle garantit I5 (alt conservé seulement si non vide et distinct).
            // On PORTE la thématique (plan-thematiques-entites.md, Point 1) : sans ça, elle serait
            // jetée à chaque resync/remontée (l'objet reconstruit est volontairement épuré). Absente
            // → non ajoutée (normaliserRegle fait {...regle}, il ne crée pas de champ undefined parasite
            // seulement si on ne le passe pas → on l'omet quand p.thematique est falsy).
            const reconstruite = { entite: survivants.join('/'), remplacement, remplacementAlt: p.remplacementAlt };
            if (p.thematique) reconstruite.thematique = p.thematique;
            out.push(normaliserRegle(reconstruite));
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
 *
 * Multi-pseudo : l'ENSEMBLE RETENU pour un alias = les pseudos (≤2) de la 1ʳᵉ règle qui le mentionne
 * (= celle que fusionnerRegles garde). Un pseudo vu ensuite qui APPARTIENT à cet ensemble n'est PAS
 * un conflit (les deux rendus sont légitimes : "Lyon→ville (alt: ville de l'Est)" + un entretien qui
 * utilise « ville de l'Est »). Seuls les pseudos HORS ensemble retenu sont signalés comme ignorés.
 * → appeler avec les MÊMES listes, dans le MÊME ORDRE que fusionnerRegles.
 * @param {...Array} listes
 * @returns {Array<{entite:string, pseudoRetenu:string, pseudosIgnores:string[]}>}
 */
function conflitsPseudoParEntite(...listes) {
    const m = new Map(); // clé d'alias → { alias, pseudoRetenu, retenus:Set(norm), ignores:[], vusIgnore:Set }
    for (const liste of listes) {
        for (const p of (liste || [])) {
            if (!p || !p.entite || !p.remplacement) continue;
            const pseudos = pseudosDe(p); // [primaire, (alt)]
            if (pseudos.length === 0) continue;
            for (const alias of parseAliases(p.entite)) {
                const aliasTrim = alias.trim();
                const cle = aliasTrim.toLowerCase();
                if (!cle) continue;
                if (!m.has(cle)) {
                    // 1ʳᵉ règle pour cet alias → définit l'ensemble retenu (≤2 pseudos).
                    m.set(cle, {
                        alias: aliasTrim,
                        pseudoRetenu: pseudos[0],
                        retenus: new Set(pseudos.map(x => x.toLowerCase())),
                        ignores: [],
                        vusIgnore: new Set()
                    });
                } else {
                    const rec = m.get(cle);
                    for (const ps of pseudos) {
                        const norm = ps.toLowerCase();
                        if (rec.retenus.has(norm) || rec.vusIgnore.has(norm)) continue;
                        rec.vusIgnore.add(norm);
                        rec.ignores.push(ps);
                    }
                }
            }
        }
    }
    const conflits = [];
    for (const rec of m.values()) {
        if (rec.ignores.length > 0) {
            conflits.push({ entite: rec.alias, pseudoRetenu: rec.pseudoRetenu, pseudosIgnores: rec.ignores });
        }
    }
    return conflits;
}

/**
 * Normalise un tabAnon en RÈGLES de corpus propres : uniquement { entite, remplacement
 * (, remplacementAlt) } (trim, I5), dédupliquées sur l'ALIAS → une entité = ≤2 pseudos autorisés.
 *
 * Le corpus ne stocke QUE des règles entité→pseudo(s). Les occurrences vivent dans les
 * entretiens (matchPositions) et l'état réel (anonymisé/exception/à traiter) est dérivé du
 * DOM/scan. On évite ainsi de polluer le .crp avec occurrences/matchPositions/indexCourant/
 * source — et leurs incohérences (le champ `source` était posé/supprimé selon le chemin).
 * `remplacementAlt` est conservé tel quel par fusionnerRegles (pas d'auto-union).
 * @param {Array} tab
 * @returns {Array<{entite:string, remplacement:string, remplacementAlt?:string}>}
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
