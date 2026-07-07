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
    if (match.isIncluded) return; // incluse = lecture seule : pas d'exception dans le run large (I-INC-6)

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

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

    // Remettre l'occurrence en « à anonymiser » (revient en arrière depuis anonymisé OU exception) :
    // permet de vider une ligne de tout anon/exception pour pouvoir la supprimer.
    chaine += `
        <div class="menu-item" onmousedown="remettreEnNonTraite(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ↩ Remettre en « à anonymiser »
        </div>
    `;

    // Actions « tout » : sur l'ensemble des occurrences de l'entité dans cet entretien.
    chaine += `
        <div class="menu-item" onmousedown="toutEnException(${idxPaire}); document.getElementById('contextMenuException')?.remove();">
            ⊘ Mettre tout en exception
        </div>
        <div class="menu-item" onmousedown="toutEnNonTraite(${idxPaire}); document.getElementById('contextMenuException')?.remove();">
            ↩ Remettre tout en « à anonymiser »
        </div>
    `;

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

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const match = paire.matchPositions[matchIdx];
    if (match.isIncluded) return; // incluse = lecture seule : ne pas re-marquer dans le run large (I-INC-3)
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

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const match = paire.matchPositions[matchIdx];
    if (match.isIncluded) return; // incluse = lecture seule : pas d'exception dans le run large (I-INC-6)
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

// Remet une occurrence ANONYMISÉE ou en EXCEPTION en « à anonymiser » (non-traité) : retire tout le
// marquage et repose data-anon-nt. Permet de revenir à une ligne sans anon ni exception (donc
// supprimable). Symétrique de pseudonymiserOccurrence / marquerExceptionDepuisNonTraite.
async function remettreEnNonTraite(idxPaire, matchIdx) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) return;

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const match = paire.matchPositions[matchIdx];
    if (match.isIncluded) return; // incluse = lecture seule : possédée par le run large (I-INC-3)
    const tousLesSpans = document.querySelectorAll('[data-rk]');

    for (let i = match.start; i <= match.end; i++) {
        const span = tousLesSpans[i];
        if (!span) continue;
        span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
        delete span.dataset.pseudo;
        span.setAttribute('data-anon-nt', 'true');
    }

    match.isException = false;
    match.isNonTraite = true;

    // Ce run n'anonymise plus → libérer d'éventuelles occurrences qu'il absorbait (règles étroites
    // chevauchantes) : elles rebasculent en « à anonymiser » (§G-bis / I-INC-7).
    if (typeof recompterReglesChevauchant === 'function') {
        recompterReglesChevauchant(match.start, match.end, idxPaire);
    }

    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    await syncHtmlVersMainProcess();
}

// Bulk : met en EXCEPTION toutes les occurrences ACTUELLEMENT ANONYMISÉES de la paire
// (laisse les non-traitées et les incluses intactes). Version « tout » de basculerException.
async function toutEnException(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions) return;

    // Uniquement les occurrences anonymisées : ni exception, ni non-traitée, ni incluse.
    const cibles = paire.matchPositions.filter(m => m && !m.isIncluded && !m.isException && !m.isNonTraite);
    if (cibles.length === 0) return;

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    for (const match of cibles) {
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
    }

    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    await syncHtmlVersMainProcess();
}

// Bulk : remet en « à anonymiser » (non-traité) toutes les occurrences anonymisées OU en
// exception de la paire (laisse les incluses). Version « tout » de remettreEnNonTraite.
async function toutEnNonTraite(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions) return;

    // Tout ce qui est anonymisé ou exception (donc pas déjà non-traité, pas incluse).
    const cibles = paire.matchPositions.filter(m => m && !m.isIncluded && !m.isNonTraite);
    if (cibles.length === 0) return;

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    for (const match of cibles) {
        for (let i = match.start; i <= match.end; i++) {
            const span = tousLesSpans[i];
            if (!span) continue;
            span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
            delete span.dataset.pseudo;
            span.setAttribute('data-anon-nt', 'true');
        }
        match.isException = false;
        match.isNonTraite = true;
        // Ce run n'anonymise plus → libère d'éventuelles occurrences qu'il absorbait
        // (règles étroites chevauchantes), cf. remettreEnNonTraite (§G-bis / I-INC-7).
        if (typeof recompterReglesChevauchant === 'function') {
            recompterReglesChevauchant(match.start, match.end, idxPaire);
        }
    }

    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    await syncHtmlVersMainProcess();
}

// Bulk : PSEUDONYMISE toutes les occurrences NON-TRAITÉES de la paire (laisse les exceptions et les
// incluses intactes). Version « tout » de pseudonymiserOccurrence.
// pseudoIdx = index dans pseudosDe(paire) : 0 = primaire (défaut), 1 = alt. Mono-pseudo : 0.
async function toutPseudonymiser(idxPaire, pseudoIdx = 0) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions) return;

    // Uniquement les occurrences non-traitées : ni exception, ni déjà anonymisée, ni incluse.
    const cibles = paire.matchPositions.filter(m => m && !m.isIncluded && m.isNonTraite);
    if (cibles.length === 0) return;

    // Snapshot undo (DOM #segments) avant mutation — voir undo()/redo() (segmentation.js).
    if (typeof backUp === 'function') backUp();

    const pseudos = pseudosDe(paire);
    const pseudo = (pseudos[pseudoIdx] || pseudos[0] || paire.remplacement || '').trim();
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    for (const match of cibles) {
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
    }

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

    // « Tout » : pseudonymise toutes les occurrences NON-TRAITÉES restantes (laisse les exceptions).
    // Multi-pseudo : un item par pseudo autorisé ; mono-pseudo : item unique.
    const itemsToutPseudo = (pseudosNT.length > 1)
        ? pseudosNT.map((p, pi) => `
        <div class="menu-item" onmousedown="toutPseudonymiser(${idxPaire}, ${pi}); document.getElementById('contextMenuException')?.remove();">
            ✓✓ Pseudonymiser toutes les occurrences non traitées comme « ${_escAnonMenu(p)} »
        </div>`).join('')
        : `
        <div class="menu-item" onmousedown="toutPseudonymiser(${idxPaire}); document.getElementById('contextMenuException')?.remove();">
            ✓✓ Pseudonymiser toutes les occurrences non traitées
        </div>`;

    menuDiv.innerHTML = `
        ${itemsPseudo}
        ${itemsToutPseudo}
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

/**
 * Menu contextuel du LIBELLÉ pseudonymisé d'un locuteur (plan-locuteurs-pseudo.md Étape 4) : retrait
 * LOCAL de la pseudonymisation du libellé — distinct de la suppression de la règle (qui obéit, elle, à
 * I-POR-5). Toujours accessible, même pour un locuteur NON cité dans le texte (pas d'occurrence à
 * clic-droiter).
 * @param {HTMLElement} lig - le `.ligloc.loc-anon` cliqué
 */
function showMenuLibelleLocuteur(lig) {
    const oldMenu = document.getElementById('contextMenuException');
    if (oldMenu) oldMenu.remove();

    const fondseg = document.getElementById('segments');
    if (!fondseg) return;

    const menuDiv = document.createElement('div');
    menuDiv.id = 'contextMenuException';
    menuDiv.classList.add('context-menu', 'dnone');
    fondseg.appendChild(menuDiv);

    const ajouterItem = (texte, action) => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.textContent = texte;
        item.addEventListener('mousedown', async () => { menuDiv.remove(); await action(); });
        menuDiv.appendChild(item);
    };

    if (lig.classList.contains('loc-anon')) {
        const pseudo = lig.dataset.locpseudo || '';
        ajouterItem(`🚫 Ne plus pseudonymiser « ${pseudo} » (ce locuteur, cet entretien)`,
            () => retirerPseudoLibelleLocuteur(lig.dataset.nomloc));
        ajouterItem(`🗑 Supprimer la règle « ${lig.dataset.nomloc || ''} → ${pseudo} »…`,
            () => supprimerRegleDepuisLibelle(lig.dataset.nomloc));
    } else if (lig.classList.contains('loc-suggere')) {
        const pseudo = lig.dataset.locpseudoSuggere || '';
        ajouterItem(`✓ Pseudonymiser ce locuteur en « ${pseudo} » (cet entretien)`,
            () => confirmerPseudoLibelleLocuteur(lig.dataset.nomloc));
        ajouterItem(`✕ Ne pas pseudonymiser ce locuteur (cet entretien)`,
            () => refuserPseudoLibelleLocuteur(lig.dataset.nomloc));
    } else if (lig.classList.contains('loc-suggere-refuse')) {
        const pseudo = lig.dataset.locpseudoSuggere || '';
        ajouterItem(`✓ Pseudonymiser ce locuteur en « ${pseudo} » (cet entretien)`,
            () => confirmerPseudoLibelleLocuteur(lig.dataset.nomloc));
    } else {
        menuDiv.remove(); // état inattendu : pas de menu
        return;
    }

    const rect = lig.getBoundingClientRect();
    const base = fondseg.getBoundingClientRect();
    menuDiv.style.top = (rect.top - base.top + fondseg.scrollTop) + 'px';
    menuDiv.style.left = (rect.left + 20 - base.left) + 'px';
    menuDiv.classList.remove('dnone');

    // Fermer au clic ailleurs (différé pour ne pas se refermer sur le clic-droit courant).
    const closeMenu = (e) => {
        const menu = document.getElementById('contextMenuException');
        if (menu && !menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

/**
 * « Retirer la pseudonymisation » d'un libellé confirmé (plan-locuteurs-pseudo.md Étape 4) : ce n'est
 * PAS une suppression mais un REFUS **persistant** (loc-anon → loc-suggere-refuse). Le locuteur reste EN
 * CLAIR ici, durablement — plus de re-suggestion ni de re-pseudonymisation à la réouverture (un simple
 * retrait de `loc-anon` laissait la règle corpus re-suggérer). Le pseudo est conservé dans
 * `data-locpseudo-suggere` (ré-activation au clic-droit). La règle CORPUS n'est PAS supprimée (reste au
 * `.crp`, s'applique ailleurs). Match par nom (N→1).
 * @param {string} nomLoc - data-nomloc du locuteur (nom réel, sans « ? »)
 */
async function retirerPseudoLibelleLocuteur(nomLoc) {
    if (typeof backUp === 'function') backUp();
    const clesNom = clesAlias(nomLoc || '');
    document.querySelectorAll('.ligloc.loc-anon[data-nomloc]').forEach(l => {
        if (!clesAlias(l.dataset.nomloc || '').some(k => clesNom.includes(k))) return;
        const pseudo = l.dataset.locpseudo || '';
        l.classList.remove('loc-anon');
        delete l.dataset.locpseudo;
        l.classList.add('loc-suggere-refuse');
        if (pseudo) l.dataset.locpseudoSuggere = pseudo;
        majBarreLoc(l); // refusé → nom en clair : retire data-nomloc-barre
    });
    // Symétrie de la confirmation : si la règle n'était matérialisée QUE par ce libellé (corpus
    // fusionnée, 0 occurrence de TEXTE), elle redevient un « fantôme » corpus → on retire
    // existeLocalement (disparaît du tableau + nettoyée à la sauvegarde, reste au corpus). Une règle
    // avec des occurrences de texte, ou créée localement, n'est pas touchée.
    let regleTouchee = false;
    (window.tabAnon || []).forEach(p => {
        if (p && p.entite && p.source === 'Global' && p.existeLocalement && (p.occurrences || 0) === 0
            && clesAlias(p.entite).some(k => clesNom.includes(k))) {
            p.existeLocalement = false; regleTouchee = true;
        }
    });
    // Re-render inconditionnel : la pastille 👤 par ligne (tableau_base.js) dépend de l'état des
    // libellés, pas seulement de regleTouchee (existeLocalement). La persistance reste gâtée.
    if (typeof affichTableauAnon === 'function') affichTableauAnon();
    if (regleTouchee && typeof sauvegarderTabAnonEnt === 'function') await sauvegarderTabAnonEnt();
    if (typeof syncHtmlVersMainProcess === 'function') await syncHtmlVersMainProcess();
}

/**
 * Confirme une SUGGESTION de pseudonymisation de libellé (plan-locuteurs-pseudo.md Étape 3) : promeut
 * tous les `.ligloc.loc-suggere` du même locuteur (match par nom, N→1) en `loc-anon` + `data-locpseudo`.
 * Local + persistance cache HTML. La RÈGLE (corpus ou locale) n'est PAS touchée — c'est l'opt-in LOCAL.
 * @param {string} nomLoc - data-nomloc du locuteur
 */
async function confirmerPseudoLibelleLocuteur(nomLoc) {
    if (typeof backUp === 'function') backUp();
    const clesNom = clesAlias(nomLoc || '');
    // 1. Promouvoir les libellés suggérés OU refusés → confirmés (loc-suggere/-refuse → loc-anon).
    document.querySelectorAll('.ligloc.loc-suggere[data-nomloc], .ligloc.loc-suggere-refuse[data-nomloc]').forEach(l => {
        if (!clesAlias(l.dataset.nomloc || '').some(k => clesNom.includes(k))) return;
        const pseudo = (l.dataset.locpseudoSuggere || '').trim();
        l.classList.remove('loc-suggere', 'loc-suggere-refuse');
        delete l.dataset.locpseudoSuggere;
        if (pseudo) {
            l.classList.add('loc-anon');
            l.dataset.locpseudo = pseudo;
        }
        majBarreLoc(l); // confirmé → nom barré (data-nomloc-barre) pour le ::before
    });
    // 2. La règle (corpus fusionnée) est désormais MATÉRIALISÉE ici par le libellé → elle APPARTIENT à
    //    l'entretien : existeLocalement=true. Sinon, fantôme corpus (occ texte=0) → cachée du tableau
    //    (filtre affichTableauAnon) et jetée à la sauvegarde. Cohérent avec « matérialisé = texte OU
    //    libellé » : la règle s'affiche comme règle corpus (à 0 occurrence de texte) et survit.
    let regleTouchee = false;
    (window.tabAnon || []).forEach(p => {
        if (p && p.entite && !p.existeLocalement
            && clesAlias(p.entite).some(k => clesNom.includes(k))) {
            p.existeLocalement = true; regleTouchee = true;
        }
    });
    // Re-render inconditionnel : la pastille 👤 par ligne (tableau_base.js) dépend de l'état des
    // libellés, pas seulement de regleTouchee (existeLocalement). La persistance reste gâtée.
    if (typeof affichTableauAnon === 'function') affichTableauAnon();
    if (regleTouchee && typeof sauvegarderTabAnonEnt === 'function') await sauvegarderTabAnonEnt();
    if (typeof syncHtmlVersMainProcess === 'function') await syncHtmlVersMainProcess();
}

/**
 * Refuse une SUGGESTION de pseudonymisation de libellé (« ne pas pseudonymiser ce locuteur ») : les
 * `.ligloc.loc-suggere` du locuteur passent en `loc-suggere-refuse` (**persisté**). Effet : plus de
 * re-suggestion (detecterLibellesASuggerer l'ignore) ET le libellé sort EN CLAIR à l'export
 * (nomLocAffiche). On conserve `data-locpseudo-suggere` pour pouvoir ré-activer plus tard (clic-droit).
 * @param {string} nomLoc
 */
async function refuserPseudoLibelleLocuteur(nomLoc) {
    if (typeof backUp === 'function') backUp();
    const clesNom = clesAlias(nomLoc || '');
    document.querySelectorAll('.ligloc.loc-suggere[data-nomloc]').forEach(l => {
        if (!clesAlias(l.dataset.nomloc || '').some(k => clesNom.includes(k))) return;
        l.classList.remove('loc-suggere');
        l.classList.add('loc-suggere-refuse');
        majBarreLoc(l); // refusé → nom en clair : retire data-nomloc-barre
    });
    if (typeof affichTableauAnon === 'function') affichTableauAnon(); // pastille 👤 : suggéré → refusé
    if (typeof syncHtmlVersMainProcess === 'function') await syncHtmlVersMainProcess();
}

/**
 * SUPPRIME la règle (≠ opt-out local) depuis le libellé : trouve sa ligne dans window.tabAnon et
 * délègue à `supprimeLigneAnon`, qui applique le garde-fou d'isolement (I-POR-5) :
 *  - règle utilisée UNIQUEMENT dans cet entretien → supprimée (+ proposition de la retirer du corpus) ;
 *  - règle PARTAGÉE (labels/texte dans d'autres entretiens, 🔒) → refus + renvoi au panneau Pseudos.
 * Le démarquage du libellé suit via le hook resynchroniserLibellesLocuteurs de supprimeLigneAnon.
 * @param {string} nomLoc
 */
async function supprimerRegleDepuisLibelle(nomLoc) {
    if (typeof supprimeLigneAnon !== 'function') return;
    const clesNom = clesAlias(nomLoc || '');
    const idx = (window.tabAnon || []).findIndex(p =>
        p && p.entite && (p.portee || 'corpus') !== 'brouillon'
        && clesAlias(p.entite).some(k => clesNom.includes(k)));
    if (idx < 0) return;
    await supprimeLigneAnon(idx);
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

        // Clic-DROIT sur le LIBELLÉ d'un locuteur (le ::before du .ligloc, donc hors texte : pas de
        // [data-rk]) → menu : retrait si pseudonymisé (loc-anon, Étape 4), confirmation si suggéré
        // (loc-suggere, Étape 3).
        const ligLabel = e.target.closest('.ligloc.loc-anon, .ligloc.loc-suggere, .ligloc.loc-suggere-refuse');
        if (ligLabel && !e.target.closest('[data-rk]') && e.type === 'contextmenu') {
            e.preventDefault();
            e.stopPropagation();
            showMenuLibelleLocuteur(ligLabel);
            return;
        }

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
}
