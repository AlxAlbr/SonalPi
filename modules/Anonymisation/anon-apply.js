////////////////////////////////////////////////////////////////////////
// APPLICATION / RETRAIT / EXCEPTION DE PSEUDONYMISATION SUR LE HTML D'UN ENTRETIEN
// (mutations DOM + sauvegarde .sonal). Appelé depuis le panneau de vérification
// corpus (validerOccurrencesSelectionnees). Chargé uniquement dans index.html.
////////////////////////////////////////////////////////////////////////

/**
 * Retire le pseudo de certaines occurrences spécifiques dans un entretien
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesARetirer - Tableau des occurrences avec spanId et data-pseudo
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function retirerPseudoOccurrencesSpecifiques(indexEnt, occurrencesARetirer, anon) {
    try {
        console.log(`Retrait du pseudo pour ${occurrencesARetirer.length} occurrence(s) dans l'entretien ${indexEnt}`);
        
        // Récupérer l'HTML de l'entretien
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        
        if (!htmlContent) {
            dialog('Message', 'Impossible de récupérer le contenu de l\'entretien.');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Créer un set des spanIds à traiter
        const spanIdsARetirer = new Set(occurrencesARetirer.map(occ => occ.spanId));

        let nbRetraits = 0;

        // Parcourir tous les spans marqués debsel (début du pseudo)
        const debselSpans = Array.from(tempDiv.querySelectorAll('[data-pseudo].debsel'));

        for (const debselSpan of debselSpans) {
            const spanId = debselSpan.dataset.rk;
            
            // Vérifier si ce span doit être retiré
            if (!spanIdsARetirer.has(spanId)) {
                continue;
            }

            // Vérifier que c'est bien le pseudo qu'on veut retirer
            if (debselSpan.dataset.pseudo !== anon.remplacement) {
                continue;
            }

            // Trouver le finsel correspondant
            let finselSpan = debselSpan;
            if (!debselSpan.classList.contains('finsel')) {
                let sib = debselSpan.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && sib.dataset && sib.dataset.pseudo === anon.remplacement
                        && sib.classList.contains('finsel')) {
                        finselSpan = sib;
                        break;
                    }
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && !sib.classList.contains('anon')) {
                        break;
                    }
                    sib = sib.nextSibling;
                }
            }

            // Reconstituer le texte original (fusion de debsel → finsel)
            let texteOriginal = '';
            let cur = debselSpan;
            while (cur) {
                texteOriginal += cur.textContent || '';
                if (cur === finselSpan) break;
                cur = cur.nextSibling;
            }

            // Créer un span neutre avec le texte original
            const spanContexte = document.createElement('span');
            Array.from(debselSpan.attributes).forEach(attr => {
                if (attr.name !== 'data-pseudo' && attr.name !== 'data-rk') {
                    spanContexte.setAttribute(attr.name, attr.value);
                }
            });
            spanContexte.dataset.rk = debselSpan.dataset.rk;
            spanContexte.textContent = texteOriginal;
            
            // Retirer les classes de pseudonymisation (sauf anon-exception qui marque l'exclusion)
            ['anon', 'debsel', 'finsel'].forEach(c => {
                spanContexte.classList.remove(c);
            });
            spanContexte.classList.add('anon-exception'); // empêche la ré-application au rechargement
            delete spanContexte.dataset.pseudo;

            // Remplacer debselSpan par le nouveau span et supprimer jusqu'à finselSpan
            const parent = debselSpan.parentNode;
            if (parent) {
                // Stocker le point d'insertion AVANT les suppressions :
                // pour les entités multi-mots, nextSibling de debsel serait supprimé dans la boucle.
                const insertionPoint = finselSpan.nextSibling;
                
                // Supprimer tous les spans de debsel à finsel (inclus)
                let toDelete = debselSpan;
                while (toDelete && parent.contains(toDelete)) {
                    const next = toDelete.nextSibling;
                    if (toDelete.nodeType === Node.ELEMENT_NODE) {
                        parent.removeChild(toDelete);
                    }
                    if (toDelete === finselSpan) break;
                    toDelete = next;
                }
                
                // Insérer le nouveau span (insertionPoint peut être null → append en fin de parent)
                parent.insertBefore(spanContexte, insertionPoint);
                nbRetraits++;
                console.log(`  ✓ Pseudo retiré pour "${texteOriginal}"`);
            }
        }

        if (nbRetraits === 0) {
            console.log(`Aucune occurrence à retirer pour "${anon.entite}"`);
            return;
        }

        const finalHtmlContent = tempDiv.innerHTML;
        console.log(`✅ ${nbRetraits} pseudo(s) retiré(s)`);

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal
        try {
            if (typeof window.majFichierSonal === 'function') {
                await window.majFichierSonal(indexEnt, indexEnt + 1);
                console.log(`Fichier Sonal réécrit pour l'entretien ${indexEnt}`);
            }
        } catch (errMaj) {
            console.error('Erreur lors de majFichierSonal:', errMaj);
        }

    } catch (error) {
        console.error("Erreur dans retirerPseudoOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du retrait du pseudo: ${error.message}`);
    }
}

/**
 * Marque des occurrences spécifiques comme exceptions (anon-exception) dans un entretien
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesAMarquer - Occurrences à marquer comme exceptions
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function marquerExceptionOccurrencesSpecifiques(indexEnt, occurrencesAMarquer, anon) {
    try {
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        if (!htmlContent) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const spanIdsAMarquer = new Set(occurrencesAMarquer.map(occ => occ.spanId));
        let nbMarquages = 0;

        for (const spanId of spanIdsAMarquer) {
            const span = tempDiv.querySelector(`[data-rk="${spanId}"]`);
            if (!span) continue;

            if (span.classList.contains('debsel')) {
                // Occurrence déjà pseudonymisée → reconstituer le texte et remplacer par un span anon-exception
                let finselSpan = span;
                if (!span.classList.contains('finsel')) {
                    let sib = span.nextSibling;
                    while (sib) {
                        if (sib.nodeType === Node.ELEMENT_NODE && sib.dataset && sib.dataset.pseudo === anon.remplacement && sib.classList.contains('finsel')) {
                            finselSpan = sib; break;
                        }
                        if (sib.nodeType === Node.ELEMENT_NODE && !sib.classList.contains('anon')) break;
                        sib = sib.nextSibling;
                    }
                }
                let texteOriginal = '';
                let cur = span;
                while (cur) {
                    texteOriginal += cur.textContent || '';
                    if (cur === finselSpan) break;
                    cur = cur.nextSibling;
                }
                const spanExc = document.createElement('span');
                Array.from(span.attributes).forEach(attr => {
                    if (attr.name !== 'data-pseudo' && attr.name !== 'data-rk') spanExc.setAttribute(attr.name, attr.value);
                });
                spanExc.dataset.rk = span.dataset.rk;
                spanExc.textContent = texteOriginal;
                ['anon', 'debsel', 'finsel'].forEach(c => spanExc.classList.remove(c));
                spanExc.classList.add('anon-exception');
                delete spanExc.dataset.pseudo;
                const parent = span.parentNode;
                if (parent) {
                    const insertionPoint = finselSpan.nextSibling;
                    let toDelete = span;
                    while (toDelete && parent.contains(toDelete)) {
                        const next = toDelete.nextSibling;
                        if (toDelete.nodeType === Node.ELEMENT_NODE) parent.removeChild(toDelete);
                        if (toDelete === finselSpan) break;
                        toDelete = next;
                    }
                    parent.insertBefore(spanExc, insertionPoint);
                    nbMarquages++;
                }
            } else if (!span.classList.contains('anon-exception')) {
                // Occurrence non encore pseudonymisée → ajouter anon-exception directement
                span.classList.add('anon-exception');
                nbMarquages++;
            }
        }

        if (nbMarquages === 0) return;
        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);
        if (typeof window.majFichierSonal === 'function') await window.majFichierSonal(indexEnt, indexEnt + 1);
    } catch (error) {
        console.error("Erreur dans marquerExceptionOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du marquage de l'exception: ${error.message}`);
    }
}

/**
 * Retire le statut d'exception d'occurrences spécifiques (les remet à l'état non-traité)
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesADesexclure - Occurrences à dés-exclure
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function retirerExceptionOccurrencesSpecifiques(indexEnt, occurrencesADesexclure, anon) {
    try {
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        if (!htmlContent) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const spanIdsADesexclure = new Set(occurrencesADesexclure.map(occ => occ.spanId));
        let nbRetraits = 0;

        for (const spanId of spanIdsADesexclure) {
            const span = tempDiv.querySelector(`[data-rk="${spanId}"]`);
            if (!span || !span.classList.contains('anon-exception')) continue;
            span.classList.remove('anon-exception');
            nbRetraits++;
        }

        if (nbRetraits === 0) return;
        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);
        if (typeof window.majFichierSonal === 'function') await window.majFichierSonal(indexEnt, indexEnt + 1);
    } catch (error) {
        console.error("Erreur dans retirerExceptionOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du retrait de l'exception: ${error.message}`);
    }
}

/**
 * Pseudonymise un entretien spécifique en éclatant les spans de phrase pour isoler l'entité.
 * Approche DOM : les entretiens compressés ont un span par phrase ; chaque span contenant
 * l'entité est découpé en sous-spans :
 *   - texte avant  → span neutre (attributs préservés, classes anon retirées)
 *   - mots de l'entité → un span par mot : class="anon", debsel sur le 1er,
 *                        finsel sur le dernier, data-pseudo sur les deux
 *   - texte après  → span neutre
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité originale
 * @param {string} pseudo - Pseudonyme/remplacement
 */
async function pseudonymiserEntretienSpecifique(indexEnt, entite, pseudo, spanIdsATraiter = null, suppressDialog = false) {
    
    console.log(`Pseudonymisation dans l'entretien index ${indexEnt} pour l'entité "${entite}" avec le pseudo "${pseudo}"`);
    
    try {
        if (!pseudo || pseudo.trim().length === 0) {
            dialog('Message', 'Pseudonyme invalide.');
            return;
        }

        // Récupérer l'HTML de l'entretien
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        
        if (!htmlContent) {
            dialog('Message', 'Impossible de récupérer le contenu de l\'entretien.');
            return;
        }

        // === APPROCHE DOM : éclater les spans pour isoler l'entité ===

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Trouver le data-rk maximum pour générer de nouvelles valeurs uniques
        let maxRk = -1;
        tempDiv.querySelectorAll('[data-rk]').forEach(span => {
            const rk = parseInt(span.dataset.rk);
            if (!isNaN(rk) && rk > maxRk) maxRk = rk;
        });
        let nextRk = maxRk + 1;

        // Regex pour l'entité (insensible à la casse, mots entiers)
        // Note: \b ne fonctionne pas avec les caractères accentués français (é, è, à, ç…)
        // On utilise des lookahead/lookbehind négatifs couvrant l'alphabet français complet.
        // 'gi' : insensible à la casse + tous les alias « / » pointent vers le même pseudo.
        const regexEntite = construireRegexEntite(entite.trim(), 'gi');
        if (!regexEntite) {
            if (!suppressDialog) dialog('Message', 'Entité invalide.');
            return;
        }

        let nbRemplacements = 0;

        // Snapshot avant modification pour éviter les conflits d'itération
        const allSpans = Array.from(tempDiv.querySelectorAll('[data-rk]'));

        for (const span of allSpans) {
            // Ignorer les spans déjà marqués debsel avec ce pseudo
            if (span.classList.contains('debsel') && span.dataset.pseudo === pseudo) {
                continue;
            }

            // Ignorer les spans marqués comme exception (sauf si aDesexclure a déjà retiré la classe)
            if (span.classList.contains('anon-exception')) {
                continue;
            }

            // Si une liste de spanIds est fournie, n'appliquer que sur ces spans spécifiques
            if (spanIdsATraiter && !spanIdsATraiter.has(span.dataset.rk)) {
                continue;
            }

            const texteSpan = span.textContent;

            // Test rapide : l'entité est-elle présente dans ce span ?
            regexEntite.lastIndex = 0;
            if (!regexEntite.test(texteSpan)) {
                continue;
            }

            // Collecter les fragments : [texte, entité, texte, entité, ...]
            const fragments = [];
            let lastIndex = 0;
            let match;
            regexEntite.lastIndex = 0;

            while ((match = regexEntite.exec(texteSpan)) !== null) {
                if (match.index > lastIndex) {
                    fragments.push({ type: 'text', content: texteSpan.substring(lastIndex, match.index) });
                }
                fragments.push({ type: 'entity', content: match[0] });
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < texteSpan.length) {
                fragments.push({ type: 'text', content: texteSpan.substring(lastIndex) });
            }

            if (!fragments.some(f => f.type === 'entity')) continue;

            // Utilitaire : span neutre (texte hors entité) héritant des attributs du span d'origine
            const creerSpanContexte = (texte) => {
                const s = document.createElement('span');
                Array.from(span.attributes).forEach(attr => {
                    if (attr.name !== 'data-pseudo') s.setAttribute(attr.name, attr.value);
                });
                s.dataset.rk = nextRk++;
                s.textContent = texte;
                ['anon', 'anon-exception'].forEach(c => s.classList.remove(c));
                delete s.dataset.pseudo;
                return s;
            };

            // Construire les nouveaux éléments DOM
            const newElements = [];

            for (const fragment of fragments) {
                if (fragment.type === 'text') {
                    if (fragment.content.length > 0) {
                        newElements.push(creerSpanContexte(fragment.content));
                    }
                } else {
                    // Entité (éventuellement multi-mots) : un span par mot
                    const allTokens = fragment.content.split(/(\s+)/);
                    const wordTokens = allTokens.filter(t => t.trim() !== '');
                    const totalWords = wordTokens.length;
                    let wordIdx = 0;

                    for (const token of allTokens) {
                        if (token.trim() === '') {
                            // Espace inter-mots → span neutre
                            if (token.length > 0) newElements.push(creerSpanContexte(token));
                        } else {
                            // Mot de l'entité → span avec classes anon
                            const wordSpan = document.createElement('span');
                            Array.from(span.attributes).forEach(attr => {
                                if (attr.name !== 'data-pseudo') wordSpan.setAttribute(attr.name, attr.value);
                            });
                            wordSpan.dataset.rk = nextRk++;
                            wordSpan.textContent = token;

                            // Réinitialiser les classes anon héritées, puis appliquer
                            ['anon', 'anon-exception', 'debsel', 'finsel'].forEach(c => wordSpan.classList.remove(c));
                            delete wordSpan.dataset.pseudo;
                            wordSpan.classList.add('anon');

                            if (wordIdx === 0) {
                                // Premier mot : debsel + data-pseudo
                                wordSpan.classList.add('debsel');
                                wordSpan.dataset.pseudo = pseudo;
                            }
                            if (wordIdx === totalWords - 1) {
                                // Dernier mot : finsel + data-pseudo
                                wordSpan.classList.add('finsel');
                                wordSpan.dataset.pseudo = pseudo;
                            }

                            wordIdx++;
                            newElements.push(wordSpan);
                        }
                    }

                    nbRemplacements++;
                    console.log(`  → "${fragment.content}" isolé en ${wordTokens.length} span(s) [pseudo="${pseudo}"]`);
                }
            }

            // Remplacer le span d'origine par les nouveaux éléments
            const parent = span.parentNode;
            if (parent) {
                const nextSibling = span.nextSibling;
                parent.removeChild(span);
                newElements.forEach(el => parent.insertBefore(el, nextSibling));
            }
        }

        if (nbRemplacements === 0) {
            dialog('Message', `L'entité "${entite}" n'a pas été trouvée dans cet entretien.`);
            return;
        }

        const finalHtmlContent = tempDiv.innerHTML;
        console.log(`✅ ${nbRemplacements} occurrence(s) traitée(s)`);

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal avec le nouveau HTML
        try {
            if (typeof window.majFichierSonal === 'function') {
                console.log(`Appel de majFichierSonal(${indexEnt}, ${indexEnt + 1})`);
                await window.majFichierSonal(indexEnt, indexEnt + 1);
                console.log(`Fichier Sonal réécrit pour l'entretien ${indexEnt}`);
            } else {
                console.warn('Fonction majFichierSonal non disponible');
            }
        } catch (errMaj) {
            console.error('Erreur lors de majFichierSonal:', errMaj);
            dialog('Message', `HTML mis à jour mais erreur lors de la réécriture du fichier Sonal: ${errMaj.message}`);
        }

        // Récupérer le nom de l'entretien
        const tabEnt = await window.electronAPI.getEnt();
        const entName = tabEnt[indexEnt] ? tabEnt[indexEnt].nom : `Entretien ${indexEnt}`;

        if (!suppressDialog) {
            dialog('Message', `Pseudonyme "${pseudo}" enregistré dans "${entName}" (${nbRemplacements} occurrence(s)).\n\nNote: Les changements ont été sauvegardés.`);
        }

        // Mettre à jour juste le badge au lieu de recharger tout (plus rapide)
        mettreAJourBadgeApresAnonymisation(indexEnt, entite, pseudo);

    } catch (error) {
        console.error("Erreur dans pseudonymiserEntretienSpecifique():", error);
        dialog('Message', `Erreur: ${error.message}`);
    }
}
