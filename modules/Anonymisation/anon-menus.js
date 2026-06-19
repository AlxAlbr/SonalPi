////////////////////////////////////////////////////////////////////////
// MENUS CONTEXTUELS D'ANONYMISATION (Entretien)
//
// Extrait de tableau_base.js (refacto) sans changement de comportement.
// Menus contextuels pour gérer les exceptions et les occurrences
// non-traitées dans le tableau de pseudonymisation de l'entretien.
////////////////////////////////////////////////////////////////////////

// Échappement minimal pour injecter un libellé (pseudo) dans l'innerHTML d'un menu.
// (escapeHtml de tableau_global/recueil n'est pas chargé en contexte entretien.)
function _escAnonMenu(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Bascule le statut d'exception pour une occurrence
// On retrouve le match en utilisant le pseudo et l'index du span cliqué
function basculerException(idxPaire, matchIdxOrSpanRk) {
    const paire = window.tabAnon[idxPaire];
    if (!paire) return;
    
    // Déterminer si on a reçu un matchIdx ou un span rk
    // (matchIdxOrSpanRk peut être soit l'index du match, soit le data-rk du span)
    let match = null;
    
    // Essayer d'abord en tant que matchIdx
    if (typeof matchIdxOrSpanRk === 'number' && paire.matchPositions && paire.matchPositions[matchIdxOrSpanRk]) {
        match = paire.matchPositions[matchIdxOrSpanRk];
    }
    
    if (!match) return;
    
    // Basculer le flag
    match.isException = !match.isException;
    
    // Retrouver tous les spans avec ce pseudo et les mettre à jour
    const pseudoABascueler = paire.remplacement.trim();
    if (pseudoABascueler) {
        // Chercher les spans associés à ce match par leur position
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        
        // Mettre à jour les classes pour tous les spans du match
        let spansUpdated = 0;
        for (let i = match.start; i <= match.end; i++) {
            const span = tousLesSpans[i];
            if (!span) continue;

            if (match.isException) {
                // Ajout d'exception : retirer tout le marquage normal, ajouter anon-exception
                span.classList.remove('anon', 'debsel', 'finsel');
                span.classList.add('anon-exception');
                delete span.dataset.pseudo;
            } else {
                // Retrait d'exception : rétablir le marquage normal complet
                span.classList.remove('anon-exception');
                span.classList.add('anon');
                if (i === match.start) {
                    span.classList.add('debsel');
                    span.dataset.pseudo = pseudoABascueler;
                }
                if (i === match.end) {
                    span.classList.add('finsel');
                    span.dataset.pseudo = pseudoABascueler;
                }
            }
            spansUpdated++;
        }
        
        console.log(`✅ Basculé exception: ${match.isException ? 'ajoutée' : 'retirée'} pour ${spansUpdated} span(s)`);
    }
    
    // Rafraîchir le tableau pour mettre à jour le compteur d'exceptions
    affichTableauAnon();
    
    // 💾 Sauvegarder les changements dans l'entretien
    sauvegarderTabAnonEnt();
}

////////////////////////////////////////////////////////////////////////
// MENU CONTEXTUEL POUR GÉRER LES EXCEPTIONS
////////////////////////////////////////////////////////////////////////

// Menu contextuel pour gérer les exceptions sur un mot anonymisé
async function showMenuException(span, idxPaire, matchIdx) {
    if (!span || idxPaire === undefined || matchIdx === undefined) {
        return;
    }

    // Vérifier que le match existe et est valide
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) {
        console.warn("❌ Match invalide:", idxPaire, matchIdx);
        return;
    }
    
    const match = paire.matchPositions[matchIdx];

    // Supprimer l'ancien menu s'il existe
    const oldMenu = document.getElementById("contextMenuException");
    if (oldMenu) {
        oldMenu.remove();
    }

    // Créer le menu contextuel
    const fondseg = document.getElementById("segments");
    if (!fondseg) return;

    const menuDiv = document.createElement("div");
    menuDiv.id = "contextMenuException";
    menuDiv.classList.add("context-menu", "dnone");
    fondseg.appendChild(menuDiv);

    // Récupérer la position du span
    const rect = span.getBoundingClientRect();

    // Vérifier si c'est déjà une exception
    const estException = match.isException;

    // Surligner tous les spans du match
    const tousLesSpansSurlig = Array.from(document.querySelectorAll('[data-rk]'));
    const spansMatch = [];
    for (let i = match.start; i <= match.end; i++) {
        if (tousLesSpansSurlig[i]) {
            tousLesSpansSurlig[i].classList.add('anon-selected');
            spansMatch.push(tousLesSpansSurlig[i]);
        }
    }

    // Construire le menu
    let chaine = `
       
             
    `;

    if (estException) {
        // Si c'est une exception, proposer de la retirer
        chaine += `
            <div class="menu-item" onmousedown="basculerException(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
                ✓ Retirer l'exception
            </div>
        `;
    } else {
        // Sinon, proposer d'en ajouter une
        chaine += `
            <div class="menu-item " onmousedown="basculerException(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
                ⊘ Ajouter une exception
            </div>
        `;
    }

    // Multi-pseudo : si l'occurrence est anonymisée (pas une exception), proposer de la basculer
    // vers l'autre pseudo autorisé. Le pseudo courant est lu sur le span de début du match.
    const pseudosOcc = pseudosDe(paire);
    if (!estException && pseudosOcc.length > 1) {
        const courant = (tousLesSpansSurlig[match.start]?.dataset.pseudo || '').trim().toLowerCase();
        pseudosOcc.forEach((p, pi) => {
            if (p.toLowerCase() === courant) return;
            chaine += `
            <div class="menu-item" onmousedown="pseudonymiserOccurrence(${idxPaire}, ${matchIdx}, ${pi}); document.getElementById('contextMenuException')?.remove();">
                ↺ Anonymiser plutôt comme « ${_escAnonMenu(p)} »
            </div>
        `;
        });
    }

    chaine += `
        <div class="menu-item" onmousedown="allerVueCorpus(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ↗ Voir au niveau du corpus
        </div>
    `;

    menuDiv.innerHTML = chaine;

    // Positionner le menu
    menuDiv.style.top = (rect.top - fondseg.getBoundingClientRect().top + fondseg.scrollTop) + "px";
    menuDiv.style.left = (rect.left + rect.width + 10 - fondseg.getBoundingClientRect().left) + "px";
    menuDiv.classList.remove('dnone');

    // MutationObserver : retire anon-selected dès que le menu disparaît du DOM,
    // quelle que soit la cause (clic ailleurs, bouton, appel externe…)
    const cleanupSelected = () => spansMatch.forEach(s => s.classList.remove('anon-selected'));

    const observer = new MutationObserver(() => {
        if (!document.getElementById('contextMenuException')) {
            cleanupSelected();
            observer.disconnect();
        }
    });
    observer.observe(fondseg, { childList: true });

    // Fermer le menu au clic ailleurs
    const closeMenu = (e) => {
        const menu = document.getElementById("contextMenuException");
        if (menu && !menu.contains(e.target) && e.target !== span) {
            menu.remove(); // l'observer se charge du nettoyage
            document.removeEventListener("mousedown", closeMenu);
        }
    };
    document.addEventListener("mousedown", closeMenu);
}

////////////////////////////////////////////////////////////////////////
// MENU CONTEXTUEL POUR LES OCCURRENCES NON TRAITÉES
////////////////////////////////////////////////////////////////////////

// Applique l'anonymisation sur une seule occurrence (match) sans toucher aux autres
async function pseudonymiserOccurrenceEtSuivante(idxPaire, matchIdx, pseudoIdx = 0) {
    await pseudonymiserOccurrence(idxPaire, matchIdx, pseudoIdx);
    // affichTableauAnon() a été appelé → flèches supprimées, _activeCounter = null.
    // On passe par clicCompteur pour les rétablir et naviguer d'un coup.
    const btnNon = document.querySelector(`.btn-nav-cat[data-idx="${idxPaire}"][data-cat="non"]`);
    if (btnNon) clicCompteur(btnNon, idxPaire, 'non');
}

async function marquerExceptionEtSuivante(idxPaire, matchIdx) {
    await marquerExceptionDepuisNonTraite(idxPaire, matchIdx);
    const btnNon = document.querySelector(`.btn-nav-cat[data-idx="${idxPaire}"][data-cat="non"]`);
    if (btnNon) clicCompteur(btnNon, idxPaire, 'non');
}

// Applique l'anonymisation sur une occurrence avec le pseudo choisi (multi-pseudo).
// pseudoIdx = index dans pseudosDe(paire) : 0 = primaire (défaut), 1 = alt. Mono-pseudo : 0.
async function pseudonymiserOccurrence(idxPaire, matchIdx, pseudoIdx = 0) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) return;

    const match = paire.matchPositions[matchIdx];
    const pseudos = pseudosDe(paire);
    const pseudo = (pseudos[pseudoIdx] || pseudos[0] || paire.remplacement || '').trim();
    const tousLesSpans = document.querySelectorAll('[data-rk]');

    for (let i = match.start; i <= match.end; i++) {
        const span = tousLesSpans[i];
        if (!span) continue;
        span.classList.remove('anon-exception');
        span.classList.add('anon');
        span.removeAttribute('data-anon-nt');
        if (i === match.start) {
            span.classList.add('debsel');
            if (pseudo) span.dataset.pseudo = pseudo;
        }
        if (i === match.end) {
            span.classList.add('finsel');
            if (pseudo) span.dataset.pseudo = pseudo;
        }
    }

    match.isNonTraite = false;
    match.isException = false;

    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    await syncHtmlVersMainProcess();
}

// Marque une occurrence non-traitée comme exception
async function marquerExceptionDepuisNonTraite(idxPaire, matchIdx) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) return;

    const match = paire.matchPositions[matchIdx];
    const tousLesSpans = document.querySelectorAll('[data-rk]');

    for (let i = match.start; i <= match.end; i++) {
        const span = tousLesSpans[i];
        if (!span) continue;
        span.classList.remove('anon', 'debsel', 'finsel');
        span.classList.add('anon-exception');
        span.removeAttribute('data-anon-nt');
        delete span.dataset.pseudo;
    }

    match.isException = true;
    match.isNonTraite = false;

    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    await syncHtmlVersMainProcess();
}

// Menu contextuel pour une occurrence non traitée
function showMenuNonTraite(span, idxPaire, matchIdx) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) return;

    const match = paire.matchPositions[matchIdx];

    // Supprimer l'ancien menu s'il existe
    const oldMenu = document.getElementById('contextMenuException');
    if (oldMenu) oldMenu.remove();

    const fondseg = document.getElementById('segments');
    if (!fondseg) return;

    const menuDiv = document.createElement('div');
    menuDiv.id = 'contextMenuException';
    menuDiv.classList.add('context-menu', 'dnone');
    fondseg.appendChild(menuDiv);

    const rect = span.getBoundingClientRect();

    // Surligner tous les spans du match
    const tousLesSpansSurlig = Array.from(document.querySelectorAll('[data-rk]'));
    const spansMatch = [];
    for (let i = match.start; i <= match.end; i++) {
        if (tousLesSpansSurlig[i]) {
            tousLesSpansSurlig[i].classList.add('anon-selected');
            spansMatch.push(tousLesSpansSurlig[i]);
        }
    }

    const nbNonTraite = paire.matchPositions.filter(m => m.isNonTraite).length;
    const avecSuivante = nbNonTraite > 1;

    // Multi-pseudo : un item « Pseudonymiser comme «X» » par pseudo autorisé (chacun applique sa
    // variante puis, s'il reste des occurrences, va à la suivante). Mono-pseudo : item unique.
    const pseudosNT = pseudosDe(paire);
    const fnPseudo = avecSuivante ? 'pseudonymiserOccurrenceEtSuivante' : 'pseudonymiserOccurrence';
    const itemsPseudo = (pseudosNT.length > 1)
        ? pseudosNT.map((p, pi) => `
        <div class="menu-item" onmousedown="${fnPseudo}(${idxPaire}, ${matchIdx}, ${pi}); document.getElementById('contextMenuException')?.remove();">
            ✓ Pseudonymiser comme « ${_escAnonMenu(p)} »${avecSuivante ? ' (puis suivante)' : ''}
        </div>`).join('')
        : `
        ${avecSuivante ? `
        <div class="menu-item" onmousedown="pseudonymiserOccurrenceEtSuivante(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ✓ Pseudonymiser et aller à la suivante
        </div>` : ''}
        <div class="menu-item" onmousedown="pseudonymiserOccurrence(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ✓ Pseudonymiser cette occurrence
        </div>`;

    menuDiv.innerHTML = `
        ${itemsPseudo}
        ${avecSuivante ? `
        <div class="menu-item" onmousedown="marquerExceptionEtSuivante(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ⊘ Marquer comme exception et aller à la suivante
        </div>` : ''}
        <div class="menu-item" onmousedown="marquerExceptionDepuisNonTraite(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ⊘ Marquer comme exception
        </div>
        <div class="menu-item" onmousedown="allerVueCorpus(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ↗ Voir au niveau du corpus
        </div>
    `;

    // Positionner le menu
    menuDiv.style.top = (rect.top - fondseg.getBoundingClientRect().top + fondseg.scrollTop) + 'px';
    menuDiv.style.left = (rect.left + rect.width + 10 - fondseg.getBoundingClientRect().left) + 'px';
    menuDiv.classList.remove('dnone');

    // MutationObserver : retire anon-selected dès que le menu disparaît du DOM
    const cleanupSelected = () => spansMatch.forEach(s => s.classList.remove('anon-selected'));
    const observer = new MutationObserver(() => {
        if (!document.getElementById('contextMenuException')) {
            cleanupSelected();
            observer.disconnect();
        }
    });
    observer.observe(fondseg, { childList: true });

    // Fermer le menu au clic ailleurs
    const closeMenu = (e) => {
        const menu = document.getElementById('contextMenuException');
        if (menu && !menu.contains(e.target) && e.target !== span) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    document.addEventListener('mousedown', closeMenu);
}

// Attache les event listeners pour gérer les clics sur les mots anonymisés
// Utilise la délégation d'événements pour éviter les doublons
function attacheExceptionListeners() {
    // Récupérer le conteneur des segments
    const segments = document.getElementById("segments");
    if (!segments) return;

    // Retirer le listener existant s'il y a (pour éviter les doublons)
    if (segments._exceptionClickHandler) {
        segments.removeEventListener("click", segments._exceptionClickHandler);
        segments.removeEventListener("contextmenu", segments._exceptionClickHandler);
    }

    // Créer le handler de clic/contextmenu
    const handler = (e) => {
        // Seulement en mode anonymisation
        if (typeof typeAction === 'undefined' || typeAction !== 'anon') return;

        const span = e.target.closest('[data-rk]');
        if (!span) return;

        // Filtre rapide : ignorer les spans qui ne sont ni anonymisés, ni exceptions, ni non-traités connus
        const isKnown = span.classList.contains('anon') ||
                        span.classList.contains('anon-exception') ||
                        span.hasAttribute('data-anon-nt');
        if (!isKnown) return;

        // match.start/end sont des indices NodeList (base 0), pas des data-rk
        const tousLesSpansLookup = Array.from(document.querySelectorAll('[data-rk]'));
        const spanIndex = tousLesSpansLookup.indexOf(span);

        // Source de vérité : l'état DOM du span cliqué lui-même
        const isNonTraiteSpan = span.hasAttribute('data-anon-nt');

        // Chercher le match correspondant dans tabAnon
        for (let idxPaire = 0; idxPaire < window.tabAnon.length; idxPaire++) {
            const paire = window.tabAnon[idxPaire];
            if (!paire.matchPositions || paire.matchPositions.length === 0) continue;

            for (let matchIdx = 0; matchIdx < paire.matchPositions.length; matchIdx++) {
                const match = paire.matchPositions[matchIdx];
                if (spanIndex < match.start || spanIndex > match.end) continue;

                // Si le span est non-traité, ignorer les matches d'autres entités déjà
                // anonymisées qui chevaucheraient la même plage (évite le mauvais routage)
                if (isNonTraiteSpan && !match.isNonTraite) continue;

                // Trouvé
                if (e.type === 'contextmenu') e.preventDefault();
                e.stopPropagation();

                if (isNonTraiteSpan) {
                    // Occurrence non traitée : menu avec Pseudonymiser / Exception
                    showMenuNonTraite(span, idxPaire, matchIdx);
                } else {
                    // Occurrence anonymisée ou exception : menu existant
                    showMenuException(span, idxPaire, matchIdx);
                }
                return;
            }
        }
    };

    // Sauvegarder le handler pour pouvoir le retirer plus tard
    segments._exceptionClickHandler = handler;

    // Attacher les listeners
    segments.addEventListener("click", handler);
    segments.addEventListener("contextmenu", handler);
    console.log("✅ Listeners d'exception attachés");
}
