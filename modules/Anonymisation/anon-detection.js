////////////////////////////////////////////////////////////////////////
// SOCLE DE DÉTECTION D'ANONYMISATION (utilitaires partagés)
//
// Cluster « tokenisation + regex entité » mutualisé entre la table corpus
// (tableau_global.js) et la table entretien (tableau_base.js). Extrait ici pour
// supprimer les définitions en double (parseAliases / tokenizeCommeSegmentation
// étaient redéfinis dans les deux fichiers — la dernière chargée écrasait l'autre)
// et préparer l'unification de la détection.
//
// Fonctions PURES (pas d'accès au DOM applicatif, pas d'état) : sûres à appeler de
// partout. Chargé dans index.html AVANT tableau_base.js / tableau_global.js.
////////////////////////////////////////////////////////////////////////

/**
 * Échappe les caractères spéciaux pour la regex
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Découpe un champ « entité » en alias séparés par « / ».
 * "Saint-Étienne / St-Étienne" → ["Saint-Étienne", "St-Étienne"]
 * Espaces autour du « / » ignorés, parts vides ignorées. Sans « / » : un seul alias.
 * @param {string} entite
 * @returns {string[]}
 */
function parseAliases(entite) {
    if (!entite) return [];
    return entite.split('/').map(s => s.trim()).filter(Boolean);
}

/**
 * Construit une regex (avec frontières de mots français) couvrant tous les alias d'une entité.
 * Chaque alias est échappé (aucun footgun regex). Les alias les plus longs sont placés en tête
 * de l'alternance pour être préférés en cas de recouvrement.
 * @param {string} entite - chaîne « entité » (peut contenir des alias séparés par « / »)
 * @param {string} flags - flags de la RegExp (ex. 'gi', 'i')
 * @returns {RegExp|null} null si aucun alias exploitable
 */
function construireRegexEntite(entite, flags) {
    const FR = '[a-zA-ZÀ-ÖØ-öø-ÿ0-9_]';
    const alias = parseAliases(entite).sort((a, b) => b.length - a.length);
    if (alias.length === 0) return null;
    const alternation = alias.map(a => escapeRegex(a)).join('|');
    return new RegExp(`(?<!${FR})(?:${alternation})(?!${FR})`, flags);
}

/**
 * Tokenize une chaîne exactement comme la segmentation le fait
 * Pour matcher l'ordre des spans dans le DOM
 */
function tokenizeCommeSegmentation(texte) {
    return texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];
}

/**
 * Extrait les mots-clés d'un texte pour l'index inversé et le pré-filtre du scan.
 * On ne garde que les suites de lettres/chiffres, en minuscules : la ponctuation
 * (virgules, points, « ... », tirets, apostrophes…) sert de séparateur.
 * CRUCIAL : l'index inversé ET entretiensCandidats DOIVENT utiliser cette même
 * fonction, sinon une entité ponctuée (« Loire... ») ne matcherait pas les mots
 * propres de l'index (« loire »), et l'entretien serait écarté à tort du scan.
 * @param {string} texte
 * @returns {string[]}
 */
function motsCles(texte) {
    return (texte || '').toLowerCase().match(/[0-9a-zà-öø-ÿ]+/g) || [];
}

////////////////////////////////////////////////////////////////////////
// Détection d'occurrences dans un document HTML d'entretien (DOM déjà parsé)
////////////////////////////////////////////////////////////////////////

/**
 * Trouve les occurrences d'une entité dans un entretien avec contexte
 * Cherche AUSSI les occurrences déjà pseudonymisées (avec data-pseudo)
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité à chercher
 * @param {string} pseudo - Pseudonyme (pour vérifier si appliqué)
 * @returns {Promise<Array>} Tableau des occurrences avec contexte
 */
async function trouverOccurrencesAvecContexte(indexEnt, entite, pseudo, pseudosRegle) {
    try {
        const htmlContent = await window.electronAPI.getHtml(indexEnt);

        if (!htmlContent) {
            return [];
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        return trouverOccurrencesDansDoc(tempDiv, entite, pseudo, pseudosRegle);

    } catch (error) {
        console.error("Erreur dans trouverOccurrencesAvecContexte():", error);
        return [];
    }
}

/**
 * Détection d'occurrences pour le panneau corpus, opérant sur un document HTML DÉJÀ parsé.
 * Adaptateur AUTOUR de la fonction unifiée analyserOccurrences : reformate la sortie au
 * format attendu par le panneau ({entite, contextAvant, contextApres, applique, exclue, spanId})
 * et reconstruit le contexte d'affichage. Opère en « passe unique » (un seul parse HTML par
 * entretien, réutilisé pour toutes les paires).
 * @param {HTMLElement} tempDiv - racine DOM contenant le HTML de l'entretien
 * @param {string} entite - entité à chercher
 * @param {string} pseudo - pseudonyme (pour l'attribution des occurrences anonymisées)
 * @returns {Array} occurrences {entite, contextAvant, contextApres, applique, exclue, spanId}
 */
function trouverOccurrencesDansDoc(tempDiv, entite, pseudo, pseudosRegle) {
    try {
        // Détection + classification via la fonction UNIFIÉE (partagée avec l'entretien).
        // On adapte la sortie au format attendu par le panneau corpus :
        //   applique = 'anon' (anonymisée par CE pseudo) · exclue = 'exception' ·
        //   incluse = 'incluse' (absorbée par une autre règle) ·
        //   non-traite → applique/exclue/incluse:false. Contexte reconstruit depuis le DOM.
        const occ = analyserOccurrences(tempDiv, entite, pseudo, pseudosRegle);
        return occ.map(o => {
            const { contextAvant, contextApres } = construireContexteOccurrence(o.spanDebut, o.spanFin);
            return {
                entite: o.texte,
                contextAvant,
                contextApres,
                applique: o.etat === 'anon',
                exclue: o.etat === 'exception',
                incluse: o.etat === 'incluse',
                spanId: o.spanDebut.dataset.rk
            };
        });
    } catch (error) {
        console.error("Erreur dans trouverOccurrencesDansDoc():", error);
        return [];
    }
}

/**
 * Reconstruit le contexte (avant / après) d'une occurrence pour l'affichage du panneau corpus,
 * en accumulant le texte des siblings autour des spans de début/fin (remonte au parent si trop
 * court). ~40 caractères de chaque côté, tronqués avec « ... ».
 * @param {Element} spanDebut
 * @param {Element} spanFin
 * @returns {{contextAvant:string, contextApres:string}}
 */
function construireContexteOccurrence(spanDebut, spanFin) {
    const collect = (startNode, direction) => {
        const parts = [];
        let len = 0;
        const next = (n) => direction === 'before' ? n.previousSibling : n.nextSibling;
        const add = (t) => { direction === 'before' ? parts.unshift(t) : parts.push(t); len += t.length; };

        let node = next(startNode);
        while (node && len < 60) {
            const t = node.textContent || '';
            if (t) add(t);
            node = next(node);
        }
        // Contexte insuffisant : remonter au parent et continuer sur ses siblings.
        if (len < 30 && startNode.parentNode) {
            let parentSib = next(startNode.parentNode);
            while (parentSib && len < 60) {
                const t = parentSib.textContent || '';
                if (t) add(t);
                parentSib = next(parentSib);
            }
        }
        return parts.join('');
    };

    const rawAvant = collect(spanDebut, 'before');
    const rawApres = collect(spanFin, 'after');
    const contextAvant = rawAvant.length > 40 ? '...' + rawAvant.slice(-40).trimStart() : rawAvant.trimStart();
    const contextApres = rawApres.length > 40 ? rawApres.slice(0, 40).trimEnd() + '...' : rawApres.trimEnd();
    return { contextAvant, contextApres };
}


// Matcher entretien : occurrences (plages de spans) du texte d'une entité dans le DOM courant.

/**
 * Trouve, dans le DOM, les occurrences (plages d'indices de spans) de tous les alias d'une entité.
 * - Insensible à la casse (comparaison des tokens en minuscules).
 * - Réutilise la tokenisation/segmentation existante (multi-mots, tirets, apostrophes).
 * - Mutualise un Set de spans pour ne pas compter deux fois le même emplacement quand deux
 *   alias se recouvrent. Les alias les plus longs (en tokens) sont essayés d'abord.
 * @param {string} entite - chaîne « entité » pouvant contenir des alias séparés par « / »
 * @param {NodeList} tousLesSpans - résultat de querySelectorAll('[data-rk]')
 * @returns {Array<{start:number, end:number}>} plages d'indices NodeList, triées par position
 */
function trouverMatchesEntiteDOM(entite, tousLesSpans) {
    const spansNonVides = [];
    tousLesSpans.forEach((span, idx) => {
        const txt = span.textContent.trim();
        if (txt) spansNonVides.push({ txt, originalIdx: idx });
    });

    // Préparer la liste des alias tokenisés, les plus longs d'abord (préférence en cas de recouvrement)
    const aliasTokens = parseAliases(entite)
        .map(al => tokenizeCommeSegmentation(al.trim()).filter(t => t.trim() !== ''))
        .filter(toks => toks.length > 0)
        .sort((a, b) => b.length - a.length);

    const matches = [];
    const spansTraites = new Set(); // originalIdx du premier span déjà consommé

    aliasTokens.forEach(motsRecherche => {
        for (let i = 0; i <= spansNonVides.length - motsRecherche.length; i++) {
            const firstSpanIdx = spansNonVides[i].originalIdx;
            if (spansTraites.has(firstSpanIdx)) continue;

            let ok = true;
            let lastSpanIdx = firstSpanIdx;
            for (let j = 0; j < motsRecherche.length; j++) {
                if (spansNonVides[i + j].txt.toLowerCase() !== motsRecherche[j].toLowerCase()) {
                    ok = false;
                    break;
                }
                lastSpanIdx = spansNonVides[i + j].originalIdx;
            }
            if (ok) {
                spansTraites.add(firstSpanIdx);
                matches.push({ start: firstSpanIdx, end: lastSpanIdx });
            }
        }
    });

    matches.sort((a, b) => a.start - b.start);
    return matches;
}

////////////////////////////////////////////////////////////////////////
// FONCTION UNIFIÉE de détection + classification (entretien ET corpus)
////////////////////////////////////////////////////////////////////////

/**
 * Analyse les occurrences d'une (entité, pseudo) dans un DOM d'entretien et renvoie leur
 * ÉTAT par occurrence. Fonction UNIQUE partagée par l'entretien (reindexerMatchPositions) et
 * le corpus (trouverOccurrencesDansDoc) → supprime la classe de bugs « les deux vues divergent ».
 *
 * Principe : on cherche le TEXTE de l'entité sur un flux de tokens couvrant TOUS les spans (les
 * spans anonymisés conservent le texte ORIGINAL — le pseudo n'est qu'affiché), puis on CLASSE
 * chaque occurrence d'après son premier span. Le flux est tokenisé comme la segmentation (mots ET
 * ponctuation, espaces retirés) et le match est exact token-par-token → MÊME comportement que les
 * anciens matchers : la ponctuation entre les mots bloque un match multi-mots (« New, York » ne
 * matche pas « New York »), les entités à tirets/apostrophes exigent la ponctuation exacte. Gère
 * uniformément le DOM normalisé (un token/span) ET compacté (data-len>1, plusieurs tokens/span ;
 * entretiens jamais ouverts).
 *
 * États :
 *  - 'anon'       : 1er span `.anon` ET data-pseudo = pseudo (anonymisé par CETTE règle).
 *  - 'incluse'    : 1er span `.anon` avec un data-pseudo ÉTRANGER à la règle (absorbée par une
 *                   autre règle plus large). Nécessite `pseudosRegle` ; une autre VARIANTE de la
 *                   même règle est exclue (captée par son propre pseudo).
 *  - 'exception'  : 1er span `.anon-exception`.
 *  - 'non-traite' : 1er span sans marquage d'anonymisation.
 * Sans `pseudosRegle` : une occurrence portant un autre data-pseudo est EXCLUE (ancien comportement).
 *
 * Attribution = TEXTE de l'entité (et non le pseudo) → tue le bug de collision (deux entités
 * partageant un pseudo) : une occurrence n'est rattachée qu'à l'entité dont elle porte le texte.
 * Le filtrage par `.anon`/`.anon-exception` distingue les vraies anonymisations des debsel/finsel
 * posés par la sélection souris / thématisation (qui n'ont pas ces classes → 'non-traite').
 *
 * @param {HTMLElement} racineDOM - racine contenant les spans [data-rk] (document live côté
 *        entretien, tempDiv parsé côté corpus)
 * @param {string} entite - entité (peut contenir des alias séparés par « / »)
 * @param {string} pseudo - pseudonyme de la règle (variante visée pour l'état 'anon')
 * @param {string[]} [pseudosRegle] - tous les pseudos de la règle (active la détection 'incluse')
 * @param {boolean} [toutesVariantesAnon] - si vrai, TOUTE variante de `pseudosRegle` compte comme
 *        'anon' (vue entretien : une seule passe couvre la règle entière). Sinon (corpus per-pseudo)
 *        seules les occurrences en `pseudo` sont 'anon', les autres variantes → exclues (continue).
 * @returns {Array<{etat:'anon'|'incluse'|'exception'|'non-traite', texte:string,
 *                  spanDebut:Element, spanFin:Element, indexDebut:number, indexFin:number}>}
 *          indexDebut/indexFin = index dans la NodeList [data-rk] de racineDOM (adaptateur
 *          entretien : {start,end}) ; spanDebut/spanFin = éléments (adaptateur corpus :
 *          contexte + spanId). Trié par ordre du document.
 */
function analyserOccurrences(racineDOM, entite, pseudo, pseudosRegle, toutesVariantesAnon) {
    const spans = Array.from(racineDOM.querySelectorAll('[data-rk]'));
    if (spans.length === 0) return [];

    // Flux de tokens sur TOUS les spans (anonymisés inclus : leur texte d'origine est préservé).
    // Tokenisation = segmentation (mots ET ponctuation) ; les espaces (insécables compris) sont
    // retirés, exactement comme les anciens matchers qui ignoraient les spans vides mais gardaient
    // les spans de ponctuation. Un span compacté (data-len>1) produit plusieurs tokens.
    const flux = []; // { tok, tokL (minuscule), idxSpan }
    for (let i = 0; i < spans.length; i++) {
        for (const tok of tokenizeCommeSegmentation(spans[i].textContent || '')) {
            if (tok.trim() === '') continue; // espace/insécable → séparateur, pas un token
            flux.push({ tok, tokL: tok.toLowerCase(), idxSpan: i });
        }
    }

    // Séquences de tokens des alias (mots + ponctuation), les plus longues d'abord (préférence
    // en cas de recouvrement). Même tokenisation que le flux → comparaison token-par-token.
    const aliasTokens = parseAliases(entite)
        .map(a => tokenizeCommeSegmentation(a).filter(t => t.trim() !== '').map(t => t.toLowerCase()))
        .filter(toks => toks.length > 0)
        .sort((a, b) => b.length - a.length);
    if (aliasTokens.length === 0) return [];

    // Reconstruit le texte d'affichage d'un match : espace entre deux mots, rien autour de la
    // ponctuation (« New York », « Saint-Étienne »).
    const reconstruireTexte = (debut, len) => {
        let out = '';
        for (let k = 0; k < len; k++) {
            const t = flux[debut + k].tok;
            const estMot = /[\wÀ-ÿ]/.test(t);
            const precMot = k > 0 && /[\wÀ-ÿ]/.test(flux[debut + k - 1].tok);
            if (estMot && precMot) out += ' ';
            out += t;
        }
        return out;
    };

    const fluxConsomme = new Array(flux.length).fill(false);
    const occurrences = [];

    for (const toks of aliasTokens) {
        for (let p = 0; p + toks.length <= flux.length; p++) {
            if (fluxConsomme[p]) continue;
            let ok = true;
            for (let q = 0; q < toks.length; q++) {
                if (flux[p + q].tokL !== toks[q]) { ok = false; break; }
            }
            if (!ok) continue;
            for (let q = 0; q < toks.length; q++) fluxConsomme[p + q] = true;

            const idxDebut = flux[p].idxSpan;
            const idxFin   = flux[p + toks.length - 1].idxSpan;
            const spanDebut = spans[idxDebut];

            // Classification par le 1er span de l'occurrence (cohérente entretien ↔ corpus).
            let etat;
            if (spanDebut.classList.contains('anon-exception')) {
                etat = 'exception';
            } else if (spanDebut.classList.contains('anon')) {
                const dp = spanDebut.dataset.pseudo;
                const dansRegle = pseudosRegle && pseudosRegle.some(p => (p || '').toLowerCase() === (dp || '').toLowerCase());
                if (dp === pseudo || (toutesVariantesAnon && dansRegle)) {
                    etat = 'anon'; // CE pseudo, ou (mode entretien) N'IMPORTE quelle variante de la règle
                } else if (dansRegle) {
                    continue; // autre VARIANTE de la même règle → captée par son propre appel (mode corpus per-pseudo)
                } else if (pseudosRegle) {
                    etat = 'incluse'; // pseudo ÉTRANGER → occurrence absorbée par une autre règle
                } else {
                    continue; // compat : sans liste de pseudos, ancien comportement (autre pseudo → exclu)
                }
            } else {
                etat = 'non-traite';
            }

            occurrences.push({
                etat,
                texte: reconstruireTexte(p, toks.length),
                spanDebut,
                spanFin: spans[idxFin],
                indexDebut: idxDebut,
                indexFin: idxFin,
                // Variante d'origine d'une occurrence absorbée (mémorisée par l'absorption) → exposant
                // sur le bon badge de variante. Vide hors cas 'incluse'.
                pseudoAbsorbe: (etat === 'incluse' && spanDebut.dataset.pseudoAbsorbe) || ''
            });
        }
    }

    occurrences.sort((a, b) => a.indexDebut - b.indexDebut);
    return occurrences;
}

////////////////////////////////////////////////////////////////////////
// Pré-filtre du scan corpus : index inversé mot→entretiens + entretiens candidats
////////////////////////////////////////////////////////////////////////

/**
 * Construit un index inversé : mot (minuscules) → Set d'indices d'entretiens.
 * Inclut les mots des spans normaux ET des spans déjà pseudonymisés (data-pseudo).
 * @param {Array} tabEnt
 * @returns {Promise<Map<string, Set<number>>>}
 */
async function construireIndexInverse(tabEnt) {
    const index = new Map(); // mot → Set<idxEnt>
    const n = tabEnt.length;
    for (let i = 0; i < n; i++) {
        let html = null;
        try { html = await window.electronAPI.getHtml(i); } catch (e) { html = null; }
        if (!html) continue;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('[data-rk]').forEach(s => {
            const texte = s.textContent.trim();
            if (!texte) return;
            // Tokeniser pour gérer les spans compressés (data-len : texte multi-mots).
            // Un entretien jamais ouvert a des spans phrases entières → sans tokenisation,
            // les mots individuels ("pierre", "edouard") ne seraient pas trouvés.
            motsCles(texte).forEach(token => {
                if (!index.has(token)) index.set(token, new Set());
                index.get(token).add(i);
            });
        });

        if (i % 5 === 4) await new Promise(r => setTimeout(r, 0)); // respirer l'UI
    }
    return index;
}

/**
 * Retourne les indices d'entretiens susceptibles de contenir l'entité,
 * en intersectant les sets de l'index inversé pour chaque token.
 * @param {string} entite
 * @param {Map<string, Set<number>>} index
 * @returns {Set<number>}
 */
function entretiensCandidats(entite, index) {
    const aliases = entite.split('/').map(a => a.trim()).filter(Boolean);
    const candidats = new Set();
    for (const alias of aliases) {
        const tokens = motsCles(alias);
        if (tokens.length === 0) continue;
        // Intersection : seuls les entretiens ayant TOUS les tokens de l'alias
        let sets = tokens.map(t => index.get(t) || new Set());
        let inter = new Set(sets[0]);
        for (let k = 1; k < sets.length; k++) {
            for (const v of inter) { if (!sets[k].has(v)) inter.delete(v); }
        }
        for (const v of inter) candidats.add(v);
    }
    return candidats;
}
