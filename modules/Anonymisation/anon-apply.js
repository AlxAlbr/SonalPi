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
            }
        }

        if (nbRetraits === 0) {
            return;
        }

        const finalHtmlContent = tempDiv.innerHTML;

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal
        try {
            if (typeof window.majFichierSonal === 'function') {
                await window.majFichierSonal(indexEnt, indexEnt + 1);
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

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal avec le nouveau HTML
        try {
            if (typeof window.majFichierSonal === 'function') {
                await window.majFichierSonal(indexEnt, indexEnt + 1);
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

////////////////////////////////////////////////////////////////////////
// MOTEUR PRÉCIS D'APPLICATION DEPUIS LE CORPUS (lot D)
////////////////////////////////////////////////////////////////////////

/**
 * Éclate un span compacté en conservant les rangs virtuels encodés par data-rk/data-len.
 * Seuls les spans touchés par une validation corpus passent ici ; aucune normalisation continue
 * n'est installée dans l'éditeur d'entretien.
 */
function _normaliserSpanCompacteAnon(span) {
    if (!span || !span.parentNode) return false;
    const morceaux = tokeniserCommeSegmentationAvecOffsets(span.textContent || '');
    if (morceaux.length <= 1) return false;

    const rkBase = Number(span.dataset.rk);
    const lenDeclare = Number(span.dataset.len);
    if (!Number.isInteger(rkBase) || !Number.isInteger(lenDeclare) || lenDeclare !== morceaux.length) {
        const err = new Error('Span compacté incohérent : impossible de préserver ses rangs.');
        err.code = 'ANON_SPAN_COMPACT_INCOHERENT';
        throw err;
    }

    const doc = span.ownerDocument;
    const frag = doc.createDocumentFragment();
    const avaitDebut = span.classList.contains('debsel');
    const avaitFin = span.classList.contains('finsel');
    const pseudo = span.dataset.pseudo || '';

    morceaux.forEach((m, i) => {
        const clone = span.cloneNode(false);
        clone.textContent = m.texte;
        clone.dataset.rk = String(rkBase + i);
        clone.removeAttribute('data-len');

        // Une frontière/pseudo appartient au bord du run, pas à chacun des fragments clonés.
        clone.classList.remove('debsel', 'finsel');
        delete clone.dataset.pseudo;
        if (i === 0 && avaitDebut) {
            clone.classList.add('debsel');
            if (pseudo) clone.dataset.pseudo = pseudo;
        }
        if (i === morceaux.length - 1 && avaitFin) {
            clone.classList.add('finsel');
            if (pseudo) clone.dataset.pseudo = pseudo;
        }
        frag.appendChild(clone);
    });
    span.parentNode.replaceChild(frag, span);
    return true;
}

function _runsAnonDansSpans(spans) {
    const runs = [];
    let ouvert = null;
    for (let i = 0; i < spans.length; i++) {
        const s = spans[i];
        if (!s.classList.contains('anon')) continue;
        if (s.classList.contains('debsel') && s.dataset.pseudo) {
            // Un second début avant la fin rend le marquage ambigu : le run précédent reste orphelin.
            if (ouvert) runs.push({ ...ouvert, fin: -1, invalide: true });
            ouvert = { debut: i, pseudo: s.dataset.pseudo };
        }
        if (ouvert && s.classList.contains('finsel') && s.dataset.pseudo) {
            runs.push({ ...ouvert, fin: i, invalide: false });
            ouvert = null;
        }
    }
    if (ouvert) runs.push({ ...ouvert, fin: -1, invalide: true });
    return runs;
}

function _nettoyerMarquagePlage(spans, debut, fin) {
    for (let i = debut; i <= fin; i++) {
        const s = spans[i];
        if (!s) continue;
        s.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
        s.removeAttribute('data-anon-nt');
        delete s.dataset.pseudo;
    }
}

/**
 * Restaure, après retrait d'une englobante, les runs étroits mémorisés par data-pseudo-absorbe.
 * Les règles locales donnent les limites textuelles ; aucune identité d'occurrence n'est persistée.
 */
function _restaurerAbsorbeesCorpus(racine, debutLibere, finLiberee, reglesLocales, entiteSource) {
    if (!Array.isArray(reglesLocales) || reglesLocales.length === 0) return;
    for (const regle of reglesLocales) {
        if (!regle || !regle.entite || !regle.remplacement) continue;
        if (typeof cleEntite === 'function' && cleEntite(regle.entite) === cleEntite(entiteSource)) continue;
        const pseudos = typeof pseudosDe === 'function' ? pseudosDe(regle) : [regle.remplacement];
        const occ = analyserOccurrences(racine, regle.entite, regle.remplacement, pseudos, true);
        const spans = Array.from(racine.querySelectorAll('[data-rk]'));
        for (const o of occ) {
            if (o.indexDebut < debutLibere || o.indexFin > finLiberee) continue;
            let pseudoMemo = '';
            for (let i = o.indexDebut; i <= o.indexFin; i++) {
                const memo = (spans[i] && spans[i].dataset.pseudoAbsorbe) || '';
                if (memo && pseudos.some(p => p.toLowerCase() === memo.toLowerCase())) {
                    pseudoMemo = memo;
                    break;
                }
            }
            if (!pseudoMemo) continue;
            for (let i = o.indexDebut; i <= o.indexFin; i++) {
                const s = spans[i];
                s.classList.remove('anon-exception');
                s.classList.add('anon');
                s.removeAttribute('data-anon-nt');
                delete s.dataset.pseudoAbsorbe;
                if (i === o.indexDebut) { s.classList.add('debsel'); s.dataset.pseudo = pseudoMemo; }
                if (i === o.indexFin) { s.classList.add('finsel'); s.dataset.pseudo = pseudoMemo; }
            }
        }
    }
}

function _poserPseudoPlage(racine, occurrence, pseudo) {
    const spans = Array.from(racine.querySelectorAll('[data-rk]'));
    const debut = occurrence.indexDebut;
    const fin = occurrence.indexFin;
    const runs = _runsAnonDansSpans(spans);

    // Un run étranger qui déborde de la cible ne peut pas être représenté avec des runs plats.
    for (const run of runs) {
        if (run.invalide) {
            const touche = run.debut <= fin && (run.fin < 0 || run.fin >= debut);
            if (touche) return { ok: false, code: 'MARQUAGE_ANON_INCOHERENT' };
            continue;
        }
        if (run.fin < debut || run.debut > fin) continue;
        if (run.debut < debut || run.fin > fin) {
            return { ok: false, code: 'CHEVAUCHEMENT_NON_REPRESENTABLE' };
        }
    }
    // Une classe anon sans frontières valides est une corruption, pas une occurrence à absorber.
    for (let i = debut; i <= fin; i++) {
        if (!spans[i].classList.contains('anon')) continue;
        const couvert = runs.some(r => !r.invalide && r.debut <= i && r.fin >= i);
        if (!couvert) return { ok: false, code: 'MARQUAGE_ANON_INCOHERENT' };
    }

    // Les runs strictement internes sont absorbés selon la politique existante « le large absorbe
    // l'étroit ». Leur pseudo est mémorisé sur leurs frontières pour permettre la restauration.
    for (const run of runs) {
        if (run.invalide || run.fin < debut || run.debut > fin) continue;
        if (run.debut === debut && run.fin === fin) {
            // Même plage mais pseudo étranger : ne jamais réattribuer silencieusement son propriétaire.
            if ((run.pseudo || '').toLowerCase() !== (pseudo || '').toLowerCase()) {
                return { ok: false, code: 'OCCURRENCE_DEJA_ANONYMISEE_AUTRE_PSEUDO' };
            }
            continue;
        }
        for (const idx of new Set([run.debut, run.fin])) {
            spans[idx].dataset.pseudoAbsorbe = run.pseudo;
            delete spans[idx].dataset.pseudo;
            spans[idx].classList.remove('debsel', 'finsel');
        }
    }

    for (let i = debut; i <= fin; i++) {
        const s = spans[i];
        s.classList.remove('anon-exception', 'debsel', 'finsel');
        s.classList.add('anon');
        s.removeAttribute('data-anon-nt');
        delete s.dataset.pseudo;
    }
    spans[debut].classList.add('debsel');
    spans[debut].dataset.pseudo = pseudo;
    spans[fin].classList.add('finsel');
    spans[fin].dataset.pseudo = pseudo;
    return { ok: true };
}

function _cibleDeDemande(demande) {
    return demande && demande.cible ? demande.cible : null;
}

/**
 * Applique en une seule transaction HTML toutes les décisions corpus d'un entretien.
 * Les cibles sont vérifiées sur le HTML frais puis oubliées ; aucun offset n'est persisté.
 *
 * @returns {Promise<{demandees:number,modifiees:number,dejaConformes:number,echecs:Array,
 *                    parAction:Object,htmlSauvegarde:boolean,sonalSauvegarde:boolean}>}
 */
async function modifierOccurrencesEntretienDepuisCorpus(indexEnt, anon, changements, options = {}) {
    const priorite = { desexclure: 1, retirer: 2, ajouter: 3, exclure: 4 };
    const etatVise = { desexclure: 'non-traite', retirer: 'exception', ajouter: 'anon', exclure: 'exception' };
    const decisions = new Map();
    const demandesSansCible = [];
    const ajouterDecisions = (liste, action) => {
        for (const demande of (liste || [])) {
            const cible = _cibleDeDemande(demande);
            const cle = cible && (cible.cle || (typeof cleCibleOccurrence === 'function' && cleCibleOccurrence(cible)));
            if (!cle) {
                demandesSansCible.push({ action, code: 'CIBLE_RUNTIME_ABSENTE' });
                continue;
            }
            const precedente = decisions.get(cle);
            if (!precedente || priorite[action] >= priorite[precedente.action]) {
                decisions.set(cle, { demande, cible, cle, action, etatVise: etatVise[action] });
            }
        }
    };
    ajouterDecisions(changements.aDesexclure, 'desexclure');
    ajouterDecisions(changements.aRetirer, 'retirer');
    ajouterDecisions(changements.aAjouter, 'ajouter');
    ajouterDecisions(changements.aExclure, 'exclure');

    const resultat = {
        demandees: decisions.size + demandesSansCible.length,
        modifiees: 0,
        dejaConformes: 0,
        echecs: [...demandesSansCible],
        parAction: { ajouter: 0, retirer: 0, exclure: 0, desexclure: 0 },
        reussites: [],
        htmlSauvegarde: false,
        sonalSauvegarde: false,
        erreurSauvegarde: ''
    };
    if (decisions.size === 0) return resultat;

    const htmlInitial = await window.electronAPI.getHtml(indexEnt);
    if (!htmlInitial) throw new Error(`Impossible de récupérer le contenu de l'entretien ${indexEnt}.`);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlInitial;
    const pseudos = typeof pseudosDe === 'function' ? pseudosDe(anon) : [anon.remplacement];

    // Vérification anti-cible-périmée AVANT toute découpe : même rk, mêmes offsets et même structure.
    let occurrences = analyserOccurrences(tempDiv, anon.entite, anon.remplacement, pseudos, false, true);
    const parCle = new Map(occurrences.map(o => [o.cible.cle, o]));
    const valides = [];
    for (const decision of decisions.values()) {
        const occ = parCle.get(decision.cle);
        if (!occ) {
            resultat.echecs.push({ action: decision.action, code: 'CIBLE_PERIMEE' });
            continue;
        }
        decision.ordinal = occ.ordinal;
        decision.etatAvant = occ.etat;
        valides.push(decision);
    }
    if (valides.length === 0) return resultat;

    // Éclater uniquement les spans compactés qui intersectent les cibles retenues. Les références
    // sont collectées avant mutation ; chaque span n'est normalisé qu'une fois.
    const spansAvant = Array.from(tempDiv.querySelectorAll('[data-rk]'));
    const aNormaliser = new Set();
    for (const d of valides) {
        const o = parCle.get(d.cle);
        for (let i = o.indexDebut; i <= o.indexFin; i++) {
            if (tokeniserCommeSegmentationAvecOffsets(spansAvant[i].textContent || '').length > 1) {
                aNormaliser.add(spansAvant[i]);
            }
        }
    }
    for (const span of aNormaliser) _normaliserSpanCompacteAnon(span);

    // Le texte n'a pas changé : l'ordinal sémantique reste stable malgré la nouvelle structure DOM.
    occurrences = analyserOccurrences(tempDiv, anon.entite, anon.remplacement, pseudos, false, true);
    valides.sort((a, b) => b.ordinal - a.ordinal); // ordre inverse, défensif pour les mutations groupées

    for (const decision of valides) {
        const occ = occurrences[decision.ordinal];
        if (!occ) {
            resultat.echecs.push({ action: decision.action, code: 'CIBLE_INTROUVABLE_APRES_NORMALISATION' });
            continue;
        }
        if (occ.etat === decision.etatVise) {
            resultat.dejaConformes++;
            continue;
        }

        const spans = Array.from(tempDiv.querySelectorAll('[data-rk]'));
        if (decision.etatVise === 'anon') {
            const pose = _poserPseudoPlage(tempDiv, occ, anon.remplacement);
            if (!pose.ok) {
                resultat.echecs.push({ action: decision.action, code: pose.code });
                continue;
            }
        } else {
            // Un retrait ne peut viser qu'un run appartenant exactement à cette occurrence.
            if (occ.etat === 'anon') {
                const deb = spans[occ.indexDebut];
                const fin = spans[occ.indexFin];
                const exact = deb && fin && deb.classList.contains('debsel') && fin.classList.contains('finsel') &&
                    pseudos.some(p => p.toLowerCase() === (deb.dataset.pseudo || '').toLowerCase()) &&
                    pseudos.some(p => p.toLowerCase() === (fin.dataset.pseudo || '').toLowerCase());
                if (!exact) {
                    resultat.echecs.push({ action: decision.action, code: 'RUN_NON_EXACT' });
                    continue;
                }
            }
            _nettoyerMarquagePlage(spans, occ.indexDebut, occ.indexFin);
            if (decision.etatVise === 'exception') {
                for (let i = occ.indexDebut; i <= occ.indexFin; i++) spans[i].classList.add('anon-exception');
            }
            _restaurerAbsorbeesCorpus(
                tempDiv, occ.indexDebut, occ.indexFin,
                options.reglesLocales || [], anon.entite
            );
        }
        decision.modifiee = true;
        resultat.modifiees++;
        resultat.parAction[decision.action]++;
        resultat.reussites.push({ action: decision.action, entite: decision.demande.entite || anon.entite });
    }

    if (resultat.modifiees === 0) return resultat;

    // Vérification de l'état réellement obtenu avant toute écriture.
    const apres = analyserOccurrences(tempDiv, anon.entite, anon.remplacement, pseudos, false, true);
    for (const decision of valides) {
        if (!decision.modifiee) continue;
        const occ = apres[decision.ordinal];
        if (!occ || occ.etat !== decision.etatVise) {
            const err = new Error('La vérification du marquage obtenu a échoué ; aucune sauvegarde effectuée.');
            err.code = 'ANON_VERIFICATION_ECHEC';
            throw err;
        }
    }

    await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);
    resultat.htmlSauvegarde = true;
    if (typeof window.majFichierSonal === 'function') {
        try {
            await window.majFichierSonal(indexEnt, indexEnt + 1, { propagerErreur: true });
        } catch (error) {
            resultat.erreurSauvegarde = error && error.message ? error.message : String(error);
            return resultat;
        }
    }
    resultat.sonalSauvegarde = true;
    return resultat;
}

/**
 * Re-pseudonymise une entité dans UN entretien : remplace le pseudo des occurrences déjà
 * anonymisées avec `ancienPseudo` par `nouveauPseudo`. Approche « relabel » — on ne retouche PAS
 * la structure des spans (debsel/finsel/anon préservés) : on ne fait que ré-écrire `data-pseudo`,
 * puis on met à jour la règle locale (ent.tabAnon) et on re-sauve le `.sonal`.
 *
 * Sert à PROPAGER le pseudo retenu (décision « corpus autoritaire ») aux entretiens qui en
 * utilisaient un autre. S'appuie sur analyserOccurrences (fonction unifiée) pour ne cibler que
 * les occurrences de CETTE entité portant l'ANCIEN pseudo (pas celles d'une autre entité qui
 * partagerait par hasard le même pseudo — cas collision).
 *
 * @param {number} indexEnt
 * @param {string} entite
 * @param {string} ancienPseudo
 * @param {string} nouveauPseudo
 * @returns {Promise<number>} nombre d'occurrences relabellisées (0 si rien / erreur)
 */
async function repseudonymiserEntiteDansEntretien(indexEnt, entite, ancienPseudo, nouveauPseudo) {
    try {
        if (!nouveauPseudo || !nouveauPseudo.trim()) return 0;
        if (cleAnon(entite, ancienPseudo) === cleAnon(entite, nouveauPseudo)) return 0; // rien à changer

        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        if (!htmlContent) return 0;
        htmlContent = htmlContent.replace(/`/g, '');

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Occurrences de cette entité déjà anonymisées avec l'ANCIEN pseudo.
        const occ = analyserOccurrences(tempDiv, entite, ancienPseudo).filter(o => o.etat === 'anon');
        let n = 0;
        for (const o of occ) {
            // Seuls debsel/finsel portent data-pseudo ; relabelliser les deux (= même span si 1 mot).
            for (const span of [o.spanDebut, o.spanFin]) {
                if (span && span.dataset && span.dataset.pseudo === ancienPseudo) {
                    span.dataset.pseudo = nouveauPseudo;
                    n++;
                }
            }
        }
        if (n === 0) return 0;

        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);

        // Mettre à jour la règle locale de l'entretien (entité → nouveauPseudo).
        const tabEnt = await window.electronAPI.getEnt();
        const ent = tabEnt[indexEnt];
        if (ent && Array.isArray(ent.tabAnon)) {
            ent.tabAnon.forEach(r => {
                if (r && r.entite && cleEntite(r.entite) === cleEntite(entite)) r.remplacement = nouveauPseudo;
            });
            await window.electronAPI.setEnt(tabEnt);
        }

        // Re-sauver le .sonal (même mécanisme que les autres mutations par entretien).
        if (typeof window.majFichierSonal === 'function') {
            await window.majFichierSonal(indexEnt, indexEnt + 1);
        }

        return occ.length;
    } catch (error) {
        console.error("Erreur dans repseudonymiserEntiteDansEntretien():", error);
        return 0;
    }
}
