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
async function trouverOccurrencesAvecContexte(indexEnt, entite, pseudo) {
    try {
        const htmlContent = await window.electronAPI.getHtml(indexEnt);
        
        if (!htmlContent) {
            return [];
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        return trouverOccurrencesDansDoc(tempDiv, entite, pseudo);

    } catch (error) {
        console.error("Erreur dans trouverOccurrencesAvecContexte():", error);
        return [];
    }
}

/**
 * Cœur de la détection d'occurrences, opérant sur un document HTML DÉJÀ parsé.
 * Extrait de trouverOccurrencesAvecContexte pour permettre le scan « passe unique »
 * du corpus (§4 du plan) : un seul parse HTML par entretien, réutilisé pour toutes
 * les paires, au lieu d'un fetch+parse par (entité × entretien).
 * @param {HTMLElement} tempDiv - racine DOM contenant le HTML de l'entretien
 * @param {string} entite - entité à chercher
 * @param {string} pseudo - pseudonyme (pour détecter l'application)
 * @returns {Array} occurrences (mêmes objets {entite, contextAvant, contextApres, applique, exclue, spanId})
 */
function trouverOccurrencesDansDoc(tempDiv, entite, pseudo) {
    try {
        const occurrences = [];
        // Insensible à la casse ('i') + tous les alias « / » de l'entité (alternance échappée).
        const regexEntite = construireRegexEntite(entite, 'gi');
        if (!regexEntite) {
            return [];
        }
        
        // Ensemble des spans déjà traités (pour éviter les doublons)
        const spansTraites = new Set();
        
        // Parcourir tous les spans avec data-rk
        const allSpans = Array.from(tempDiv.querySelectorAll('[data-rk]'));
        
        for (const span of allSpans) {
            const spanId = span.dataset.rk;
            
            // Sauter TOUT span déjà anonymisé (classe `anon`) : il est déjà traité.
            //  - s'il correspond à CETTE règle → compté en passe 2 (applique) ;
            //  - s'il appartient à une autre entité / un autre pseudo → on ne le compte pas
            //    en « à traiter » (on ne re-pseudonymise pas du texte déjà dans une entité).
            // Les exceptions portent `anon-exception` (sans `anon`) → elles restent traitées
            // ici et classées « exclue ».
            if (span.classList.contains('anon')) {
                continue;
            }
            
            // === CHERCHER L'ENTITÉ ORIGINALE (NON PSEUDONYMISÉE) ===
            const texteSpan = span.textContent;
            let match;
            regexEntite.lastIndex = 0;
            
            while ((match = regexEntite.exec(texteSpan)) !== null) {
                const contextAvantStart = Math.max(0, match.index - 40);
                const contextAvantEnd = match.index;
                const contextApresStart = match.index + match[0].length;
                const contextApresEnd = Math.min(texteSpan.length, contextApresStart + 40);
                
                let contextAvant = texteSpan.substring(contextAvantStart, contextAvantEnd).trim();
                let contextApres = texteSpan.substring(contextApresStart, contextApresEnd).trim();
                
                // Si le contexte est vide (entité en début/fin de span), chercher dans les siblings
                if (!contextAvant && span.previousSibling) {
                    const textePrev = (span.previousSibling.textContent || '').trimEnd();
                    contextAvant = '...' + textePrev.slice(-40).trimStart();
                } else if (contextAvantStart > 0 && contextAvant.length > 0) {
                    contextAvant = '...' + contextAvant;
                }
                
                if (!contextApres && span.nextSibling) {
                    const texteNext = (span.nextSibling.textContent || '').trimStart();
                    contextApres = texteNext.slice(0, 40).trimEnd() + '...';
                } else if (contextApresEnd < texteSpan.length && contextApres.length > 0) {
                    contextApres = contextApres + '...';
                }
                
                // Vérifier si le pseudo a déjà été appliqué, ou si l'occurrence est explicitement exclue
                const applique = span.classList.contains('debsel') && span.dataset.pseudo === pseudo;
                const exclue = span.classList.contains('anon-exception');
                
                occurrences.push({
                    entite: match[0],
                    contextAvant: contextAvant,
                    contextApres: contextApres,
                    applique: applique,
                    exclue: exclue,
                    spanId: spanId
                });
                
                spansTraites.add(spanId);
            }
        }
        
        // === CHERCHER LES OCCURRENCES DÉJÀ PSEUDONYMISÉES ===
        // Structure post-pseudo : [...] [debsel] [anon]* [finsel] [...]
        // On reconstitue le contexte depuis le parent commun : on accumule le texte
        // de tous les enfants avant le debsel, et après le finsel.
        const spansPseudoDebsel = Array.from(tempDiv.querySelectorAll(`[data-pseudo="${pseudo}"].debsel`));
        
        for (const spanDebsel of spansPseudoDebsel) {
            const spanId = spanDebsel.dataset.rk;
            if (spansTraites.has(spanId)) continue;
            
            // Trouver le finsel (peut être debsel lui-même si entité 1 mot)
            let finselSpan = spanDebsel;
            if (!spanDebsel.classList.contains('finsel')) {
                let sib = spanDebsel.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && sib.dataset && sib.dataset.pseudo === pseudo
                        && sib.classList.contains('finsel')) {
                        finselSpan = sib;
                        break;
                    }
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && !sib.classList.contains('anon')
                        && (sib.textContent || '').trim() !== '') {
                        break;
                    }
                    sib = sib.nextSibling;
                }
            }
            
            // Stratégie : reconstruire tout le texte du parent en 3 phases
            // (avant / entité / après), puis si le contexte avant/après est trop court,
            // remonter au grand-parent pour enrichir.
            const collectContext = (startNode, direction) => {
                // direction = 'before' (remonter) ou 'after' (descendre)
                let parts = [];
                let len = 0;
                let node = direction === 'before' ? startNode.previousSibling : startNode.nextSibling;
                
                while (node && len < 60) {
                    const t = node.textContent || '';
                    if (t) {
                        if (direction === 'before') parts.unshift(t);
                        else parts.push(t);
                        len += t.length;
                    }
                    node = direction === 'before' ? node.previousSibling : node.nextSibling;
                }
                
                // Si contexte insuffisant, remonter au parent et continuer
                if (len < 30 && startNode.parentNode) {
                    const parentNode = startNode.parentNode;
                    let parentSib = direction === 'before' ? parentNode.previousSibling : parentNode.nextSibling;
                    while (parentSib && len < 60) {
                        const t = parentSib.textContent || '';
                        if (t) {
                            if (direction === 'before') parts.unshift(t);
                            else parts.push(t);
                            len += t.length;
                        }
                        parentSib = direction === 'before' ? parentSib.previousSibling : parentSib.nextSibling;
                    }
                }
                
                return parts.join('');
            };
            
            // Texte de l'entité (debsel → finsel)
            let entityText = '';
            let cur = spanDebsel;
            while (cur) {
                entityText += cur.textContent || '';
                if (cur === finselSpan) break;
                cur = cur.nextSibling;
            }

            // FILTRE par entité réelle (Fix B) : cette passe sélectionne les spans par
            // data-pseudo uniquement. Or deux entités distinctes peuvent partager le même
            // pseudo → sans ce contrôle, on compterait les occurrences de l'AUTRE entité.
            // On ne garde donc que celles dont le texte d'origine correspond à l'entité
            // cherchée (comparaison des mots normalisés, comme le pré-filtre du scan).
            const entityNorm = motsCles(entityText).join(' ');
            const correspondEntite = parseAliases(entite).some(a => motsCles(a).join(' ') === entityNorm);
            if (!correspondEntite) continue;

            const rawAvant = collectContext(spanDebsel, 'before');
            const rawApres = collectContext(finselSpan, 'after');
            
            const contextAvant = rawAvant.length > 40
                ? '...' + rawAvant.slice(-40).trimStart()
                : rawAvant;
            const contextApres = rawApres.length > 40
                ? rawApres.slice(0, 40).trimEnd() + '...'
                : rawApres;
            
            occurrences.push({
                entite: entityText.trim(),
                contextAvant: contextAvant,
                contextApres: contextApres,
                applique: true,
                spanId: spanId
            });
            
            spansTraites.add(spanId);
        }
        
        // === 3ÈME PASSE : entités multi-mots NON TRAITÉES ===
        // La regex du 1er pass cherche dans span.textContent de chaque span individuel
        // et ne peut pas trouver une entité multi-mots répartie sur plusieurs spans
        // (structure un-mot-par-span après cleanHTML). On fait ici un parcours token par token.
        const tokensEntite = entite.trim().split(/[\s\u00A0]+/).filter(t => t);
        if (tokensEntite.length > 1) {
            const spansFiltrés = allSpans.filter(s => s.textContent.trim() !== '');
            for (let i = 0; i <= spansFiltrés.length - tokensEntite.length; i++) {
                const estMatch = tokensEntite.every((tok, j) => spansFiltrés[i + j].textContent.trim() === tok);
                if (!estMatch) continue;
                const firstSpan = spansFiltrés[i];
                const spanId = firstSpan.dataset.rk;
                if (spansTraites.has(spanId)) continue; // déjà compté par une autre passe
                // Déjà anonymisé (par cette règle ou une autre) → pas « à traiter » (cf. passe 1).
                // Les occurrences appliquées de CETTE règle sont comptées en passe 2.
                if (firstSpan.classList.contains('anon')) continue;
                const applique = firstSpan.classList.contains('debsel') && firstSpan.dataset.pseudo === pseudo;
                const exclue   = firstSpan.classList.contains('anon-exception');
                const spansBefore = spansFiltrés.slice(Math.max(0, i - 5), i).map(s => s.textContent).join(' ');
                const spansAfter  = spansFiltrés.slice(i + tokensEntite.length, i + tokensEntite.length + 5).map(s => s.textContent).join(' ');
                occurrences.push({
                    entite: tokensEntite.join(' '),
                    contextAvant: spansBefore ? '...' + spansBefore.slice(-40) : '',
                    contextApres: spansAfter  ? spansAfter.slice(0, 40) + '...'  : '',
                    applique, exclue, spanId
                });
                spansTraites.add(spanId);
            }
        }

        return occurrences;

    } catch (error) {
        console.error("Erreur dans trouverOccurrencesDansDoc():", error);
        return [];
    }
}
