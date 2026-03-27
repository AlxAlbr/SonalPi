////////////////////////////////////////////////////////////////////////
// GESTION DE L'ANONYMISATION
////////////////////////////////////////////////////////////////////////

// Tableau contenant les paires d'anonymisation
window.tabAnon = [];

// Index de la ligne à focus après ajout (pour éviter les conflits de focus lors de validSel)
var lastAnonLineToFocus = -1;

// Retire le surlignage des occurrences quand on clique ailleurs
function clearHighlightOccurrences() {
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    tousLesSpans.forEach(span => {
        span.classList.remove('highlight-occ');
    });
}

// Auto-agrandissement des textareas en fonction du contenu
function autoGrowTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// Initialisation du tableau d'anonymisation
function initAnon() {

    //console.log("tabAnon à l'initialisation " + JSON.stringify(window.tabAnon) );
    if (!window.tabAnon || window.tabAnon.length === 0) {
    // Crée 3 lignes vides au démarrage
    window.tabAnon = [
        { entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] },
        { entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] },
        { entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] },
        { entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] },
        { entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] },
    
    ];
    }

    affichTableauAnon();
}

// Affichage du tableau d'anonymisation
function affichTableauAnon() {
    const tableauDiv = document.getElementById('tableauAnon');
    if (!tableauDiv) return;
    
    let html = `
        <table class="tableau-anon">
            <thead>
                <tr>
                    <th class="col-entite">Nom</th>
                    <th class="col-remplacement">Pseudo</th>
                    <th class="col-actions">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (let i = 0; i < window.tabAnon.length; i++) {
        // Déterminer si cette ligne est anonymisée (a une anonymisation APPLIQUÉE avec des occurrences trouvées)
        const estAnonymisee = window.tabAnon[i].occurrences > 0;
        const estDerniereLigne = (i === window.tabAnon.length - 1);
        
        html += `
            <tr data-idx="${i}" class="ligne-anon${estAnonymisee ? ' ligne-anonymisee' : ''}">
                <td class="col-entite">
                    <textarea 
                           class="input-entite textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}" 
                           data-idx="${i}" 
                           placeholder="Entité"
                           onchange="sauvAnon(${i})"
                           onfocus="dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="dsTxtAutre=false"
                           ${estAnonymisee ? '' : ''}>${window.tabAnon[i].entite}</textarea>
                </td>
                <td class="col-remplacement">
                    <textarea 
                           class="input-remplacement textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}" 
                           data-idx="${i}" 
                           placeholder="Pseudo"
                           onchange="sauvAnon(${i})"
                           onfocus="dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="dsTxtAutre=false"
                           onkeydown="handleKeyPressRemplacement(event, ${i})"
                           ${estAnonymisee ? '' : ''}>${window.tabAnon[i].remplacement}</textarea>
                </td>
                <td class="col-actions">
                    <div class="actions-container">
                        <!-- <button class="btn-anon-edit" onclick="reactiverEditionLigne(${i})" title="Réactiver l'édition" style="display:${estAnonymisee ? 'inline-block' : 'none'};">✏️</button> !-->
                        
                        <button class="btn-anon-add" onclick="ajouterNouvelleLigneAnon()" title="Ajouter une nouvelle ligne" style="display:${estDerniereLigne ? 'inline-block' : 'none'};">➕</button>
                        <div class="occurrences-nav" style="display:${estAnonymisee && window.tabAnon[i].occurrences > 0 ? 'flex' : 'none'};">
                            <button class="btn-nav-prev" onclick="allerOccurrencePrecedente(${i})" title="Occurrence précédente" style="display:${window.tabAnon[i].occurrences > 1 ? 'inline-block' : 'inline-block'};">◀</button>
                            <span class="count-occ">${window.tabAnon[i].occurrences}</span>
                            <button class="btn-nav-next" onclick="allerOccurrenceSuivante(${i})" title="Occurrence suivante" style="display:${window.tabAnon[i].occurrences > 1 ? 'inline-block' : 'inline-block'};">▶</button>
                        </div>
                        <div class="exceptions-count" style="display:${estAnonymisee && compterExceptions(i) > 0 ? 'inline-block' : 'none'};">
                            ${compterExceptions(i)} except
                        </div>
                        <button class="btn-anon-suppr" onclick="supprimeLigneAnon(${i})" title="Supprimer cette ligne">X</button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    html += `
            </tbody>
        </table>
        <div style="margin-top: 10px; display: flex; gap: 5px;width:100%">
            <button class="btn-valider-anon-attente btnfonction btnlarge " onclick="validerAnonEnAttente()">
                Appliquer
            </button>
   
            <input type="file" id="file-import-correspondance" multiple accept=".json" style="display: none;">
        </div>
    `;
    
    tableauDiv.innerHTML = html;
    
    // Ajouter l'event listener pour l'import de fichiers
    const fileInput = document.getElementById('file-import-correspondance');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            //console.log("Event listener déclenché, files:", this.files.length);
            importTableCorrespondance(this.files);
        });
    }
    
    // Auto-agrandissement des textareas existantes
    setTimeout(() => {
        document.querySelectorAll('.textarea-auto').forEach(textarea => {
            autoGrowTextarea(textarea);
        });
    }, 0);

    // Activer chkAnon si au moins une anonymisation est validée
    const chkAnon = document.getElementById('chkAnon');
    if (chkAnon) {
        const aDesAnonymisations = window.tabAnon && window.tabAnon.some(p => p.occurrences > 0);
        chkAnon.disabled = !aDesAnonymisations;
        if (!aDesAnonymisations) chkAnon.checked = false;
    }
}

// Sauvegarde d'une ligne du tableau (quand on change le champ entité)
function sauvAnon(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    
    if (entite && remplacement) {
        window.tabAnon[idx].entite = entite.value.trim();
        window.tabAnon[idx].remplacement = remplacement.value.trim();
    }
}

// Gestion de la touche Entrée dans le champ de remplacement
function handleKeyPressRemplacement(event, idx) {
    if (event.key === 'Enter') {
        event.preventDefault();
        
        const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
        const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
        
        if (entite && remplacement) {
            window.tabAnon[idx].entite = entite.value.trim();
            window.tabAnon[idx].remplacement = remplacement.value.trim();


            // Vérifie si cette entité est déjà anonymisée ailleurs
            if (verifierDoublonEntite(idx)) {
                console.log(`⚠️ L'entité "${window.tabAnon[idx].entite}" est déjà anonymisée ailleurs.\n\nVeuillez rééditer la ligne existante.`);
                return;
            }
            
            // Applique l'anonymisation pour cette paire
            if (window.tabAnon[idx].entite && window.tabAnon[idx].remplacement) {
                appliquerAnonymisationPour(idx);
                
                // Désactiver l'édition de cette ligne SEULEMENT s'il y a au moins une occurrence
                if (window.tabAnon[idx].occurrences > 0) {
                    //desactiverEditionLigne(idx);
                } else {
                    // Sinon, afficher une alerte
                    console.log(`⚠️ L'entité "${window.tabAnon[idx].entite}" n'a pas été trouvée dans le texte.`);
                }
            }


        }
    }
}


// Vérifie s'il y a un doublon d'entité dans les lignes déjà anonymisées
function verifierDoublonEntite(idxCourant) {
    const entiteActuelle = window.tabAnon[idxCourant].entite.trim();
    
    if (!entiteActuelle) {
        return false;
    }
    
    // Cherche dans toutes les autres lignes
    for (let i = 0; i < window.tabAnon.length; i++) {
        // Ignorer la ligne courante
        if (i === idxCourant) {
            continue;
        }
        
        // Vérifier si la ligne est déjà anonymisée (a une classe 'ligne-anonymisee')
        const ligne = document.querySelector(`tr[data-idx="${i}"]`);
        if (ligne && ligne.classList.contains('ligne-anonymisee')) {
            const entiteExistante = window.tabAnon[i].entite.trim();
            
            // Si on trouve la même entité dans une ligne déjà anonymisée
            if (entiteExistante === entiteActuelle) {
                return true;
            }
        }
    }
    
    return false;
}


// Désactive l'édition d'une ligne (après avoir validé l'anonymisation)
function desactiverEditionLigne(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    
    if (entite) {
        //entite.disabled = true;
        entite.classList.add('textarea-disabled');
    }
    if (remplacement) {
        //remplacement.disabled = true;
        remplacement.classList.add('textarea-disabled');
    }
    
    // Marquer la ligne comme "anonymisée"
    const ligne = document.querySelector(`tr[data-idx="${idx}"]`);
    if (ligne) {
        ligne.classList.add('ligne-anonymisee');
    }
    
    // Afficher les contrôles de navigation si plus d'une occurrence
    const paire = window.tabAnon[idx];
    if (paire.occurrences > 1) {
        const occDiv = document.querySelector(`tr[data-idx="${idx}"] .occurrences-nav`);
        if (occDiv) {
            occDiv.style.display = 'flex';
            // Le compteur affiche déjà "N occ" depuis appliquerAnonymisationPour()
            // On ne change pas ici pour laisser l'utilisateur voir le nombre total
        }
    }
}

// Réactive l'édition d'une ligne et enlève l'anonymisation
function reactiverEditionLigne(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    
    if (entite) {
        entite.disabled = false;
        entite.classList.remove('textarea-disabled');
        entite.dataset.previousValue = entite.value;
    }
    if (remplacement) {
        remplacement.disabled = false;
        remplacement.classList.remove('textarea-disabled');
        remplacement.dataset.previousValue = remplacement.value;
    }
    
    // Retirer les classes d'anonymisation du texte
    const paire = window.tabAnon[idx];
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    
    // Retirer les classes de tous les spans correspondant à cette paire
    // (en utilisant les matchPositions stockés)
    if (paire.matchPositions && paire.matchPositions.length > 0) {
        paire.matchPositions.forEach(match => {
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    tousLesSpans[i].classList.remove('anon', 'debsel', 'finsel');
                    delete tousLesSpans[i].dataset.pseudo;
                }
            }
        });
    }
    
    // Retirer la classe de la ligne
    const ligne = document.querySelector(`tr[data-idx="${idx}"]`);
    if (ligne) {
        ligne.classList.remove('ligne-anonymisee');
    }
    
    // Réinitialiser les données d'anonymisation
    window.tabAnon[idx].occurrences = 0;
    window.tabAnon[idx].indexCourant = 0;
    window.tabAnon[idx].matchPositions = [];
    
    // Réinitialiser l'affichage du compteur
    const occDiv = document.querySelector(`tr[data-idx="${idx}"] .occurrences-nav`);
    if (occDiv) {
        occDiv.style.display = 'none';
    }
    
    // Focus sur le champ de remplacement pour édition
    if (remplacement) {
        remplacement.focus();
    }
}



// Supprime une ligne du tableau
function supprimeLigneAnon(idx) {
    // Avant de supprimer, retirer les classes d'anonymisation correspondantes
    const paireSupprimee = window.tabAnon[idx];
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    
    // Retirer les classes SEULEMENT des spans correspondant à cette paire spécifique
    // (en utilisant les matchPositions stockés)
    if (paireSupprimee.matchPositions && paireSupprimee.matchPositions.length > 0) {
        paireSupprimee.matchPositions.forEach(match => {
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    tousLesSpans[i].classList.remove('anon', 'debsel', 'finsel');
                    delete tousLesSpans[i].dataset.pseudo;
                }
            }
        });
    }
    
    // Supprimer la ligne du tableau
    window.tabAnon.splice(idx, 1);
    affichTableauAnon();
}

// Ajoute une nouvelle ligne au tableau
function ajouterNouvelleLigneAnon() {
    window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
    affichTableauAnon();
}

// Ajoute une entité sélectionnée à la première ligne vide
function ajouteEntiteAnonSelectionnee() {
    // Vérifie qu'une sélection est active
    if (debSel <= 0 || finSel <= 0) {
        console.log("Aucune sélection");
        return;
    }
    
    // Récupère le texte sélectionné
    let texteSel = getTexteSelection(debSel, finSel);
    
    if (!texteSel) {
        console.log("Texte sélectionné vide");
        return;
    }
    
    // Vérifier si cette entité est déjà anonymisée
    for (let i = 0; i < window.tabAnon.length; i++) {
        if (window.tabAnon[i].entite.trim() === texteSel && window.tabAnon[i].occurrences > 0) {
            // L'entité est déjà anonymisée, ouvrir le menu contextuel
            // pour permettre d'ajouter/retirer une exception
            if (typeof showMenu !== 'undefined') {
                // Récupérer le span finsel pour passer à showMenu
                const finselSpan = document.querySelector(".finsel");
                if (finselSpan) {
                    setTimeout(() => {
                        showMenu(finselSpan, "anon");
                    }, 10);
                }
            }
            return;
        }
    }
    
    // Cherche la première ligne vide
    let idxLigneVide = -1;
    for (let i = 0; i < window.tabAnon.length; i++) {
        if (window.tabAnon[i].entite.trim() === "") {
            idxLigneVide = i;
            break;
        }
    }
    
    // Si pas de ligne vide, en crée une
    if (idxLigneVide === -1) {
        window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
        idxLigneVide = window.tabAnon.length - 1;
    }
    
    // Remplit la ligne
    window.tabAnon[idxLigneVide].entite = texteSel;
    
    affichTableauAnon();
    
    // Stocker l'index pour le focus après validSel()
    lastAnonLineToFocus = idxLigneVide;
}

// Récupère le texte de la sélection
function getTexteSelection(debSel, finSel) {
    let texte = "";
    for (let i = debSel; i <= finSel; i++) {
        const span = getSpan(i);
        if (span) {
            texte += span.innerText;
        }
    }
    return texte.trim();
}

// Tokenize une chaîne exactement comme la segmentation le fait
// Pour matcher l'ordre des spans dans le DOM
function tokenizeCommeSegmentation(texte) {
    return texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];
}

// Applique l'anonymisation pour une paire spécifique sur TOUTES les occurrences
function appliquerAnonymisationPour(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    
    if (!paire.entite.trim() || !paire.remplacement.trim()) {
        return;
    }
    
    // Retirer le surlignage des occurrences précédentes
    clearHighlightOccurrences();
    
    // Recherche l'entité dans le texte
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const motRecherche = paire.entite.trim();
    // Tokenize comme la segmentation pour matcher tous les cas (tirets, apostrophes, etc.)
    let motsRecherche = tokenizeCommeSegmentation(motRecherche);
    // Retirer les espaces des tokens recherchés (car les espaces ne correspondent pas aux spans)
    motsRecherche = motsRecherche.filter(t => t.trim() !== '');
    
    // Retirer d'abord les classes de cette paire spécifique
    tousLesSpans.forEach(span => {
        if (span.dataset.pseudo === paire.remplacement) {
            span.classList.remove('debsel', 'finsel');
            delete span.dataset.pseudo;
        }
    });
    
    // Chercher TOUTES les occurrences
    const matches = [];
    
    // Créer une liste de spans non-vides pour la recherche
    const spansNonVides = [];
    tousLesSpans.forEach((span, idx) => {
        const txt = span.innerText.trim();
        if (txt) {
            spansNonVides.push({ span, txt, originalIdx: idx });
        }
    });
    
    // Chercher la séquence de tokens dans les spans
    for (let i = 0; i <= spansNonVides.length - motsRecherche.length; i++) {
        let match = true;
        
        // Vérifier si les mots correspondent en concatenant les spans si nécessaire
        let tokenIdx = 0;
        let spanIdx = i;
        let firstSpanIdx = spansNonVides[i].originalIdx;
        let lastSpanIdx = spansNonVides[i].originalIdx;
        
        for (let j = 0; j < motsRecherche.length; j++) {
            if (spanIdx >= spansNonVides.length) {
                match = false;
                break;
            }
            
            if (spansNonVides[spanIdx].txt === motsRecherche[j]) {
                lastSpanIdx = spansNonVides[spanIdx].originalIdx;
                spanIdx++;
            } else {
                match = false;
                break;
            }
        }
        
        if (match) {
            matches.push({ start: firstSpanIdx, end: lastSpanIdx, isException: false });
        }
    }
    
    // Appliquer les classes à toutes les correspondances trouvées
    if (matches.length > 0) {
        // Stocker le nombre d'occurrences et les positions
        window.tabAnon[idxPaire].occurrences = matches.length;
        window.tabAnon[idxPaire].matchPositions = matches;
        
        // Trouver l'index du match qui correspond à la sélection actuelle (debSel, finSel)
        let indexCourantMatch = 0;
        //console.log("debSel:", debSel, "finSel:", finSel);
        //console.log("matches:", matches);
        
        // Chercher le match qui contient debSel ou qui est le plus proche
        let minDistance = Infinity;
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
          //  console.log(`Match ${i}: start=${match.start}, end=${match.end}`);
            
            // Si debSel ou finSel est dans le match
            if ((debSel >= match.start && debSel <= match.end) || 
                (finSel >= match.start && finSel <= match.end) ||
                (debSel <= match.start && finSel >= match.end)) {
                indexCourantMatch = i;
                //console.log("Match trouvé par inclusion:", i);
                break;
            }
            
            // Sinon, chercher le match le plus proche de debSel
            const distance = Math.abs(debSel - match.start);
            if (distance < minDistance) {
                minDistance = distance;
                indexCourantMatch = i;
            }
        }
        window.tabAnon[idxPaire].indexCourant = indexCourantMatch;
        //console.log("indexCourantMatch:", indexCourantMatch);
        
        // Afficher les contrôles de navigation (avec ou sans flèches selon le nombre d'occurrences)
        const occDiv = document.querySelector(`tr[data-idx="${idxPaire}"] .occurrences-nav`);
        if (occDiv) {
            occDiv.style.display = 'flex';
            const countSpan = occDiv.querySelector('.count-occ');
            if (countSpan) {
                countSpan.textContent = `${matches.length} occ`;
            }
            // Afficher/cacher les flèches selon le nombre d'occurrences
            const btnPrev = occDiv.querySelector('.btn-nav-prev');
            const btnNext = occDiv.querySelector('.btn-nav-next');
            if (matches.length > 1) {
                if (btnPrev) btnPrev.style.display = 'inline-block';
                if (btnNext) btnNext.style.display = 'inline-block';
            } else {
                if (btnPrev) btnPrev.style.display = 'none';
                if (btnNext) btnNext.style.display = 'none';
            }
        }
        
        matches.forEach((match, matchIdx) => {
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    // Ajouter la classe anon (sauf si exception)
                    if (!match.isException) {
                        tousLesSpans[i].classList.add('anon');
                    } else {
                        tousLesSpans[i].classList.add('anon-exception');
                    }
                    
                    // Ajouter debsel au premier élément
                    if (i === match.start) {
                        tousLesSpans[i].classList.add('debsel');
                        if (!match.isException) {
                            tousLesSpans[i].dataset.pseudo = paire.remplacement;
                        }
                    }
                    
                    // Ajouter finsel et data-pseudo au dernier élément
                    if (i === match.end) {
                        tousLesSpans[i].classList.add('finsel');
                        if (!match.isException) {
                            tousLesSpans[i].dataset.pseudo = paire.remplacement;
                        }
                    }
                }
            }
        });
        
        // Mettre à jour le compteur pour afficher le numéro courant (indexCourant + 1)
        const countSpan = document.querySelector(`tr[data-idx="${idxPaire}"] .count-occ`);
        if (countSpan && matches.length > 1) {
            countSpan.textContent = `${indexCourantMatch + 1}/${matches.length}`;
        }
    }
}

// Navigation vers l'occurrence suivante
function allerOccurrenceSuivante(idx) {
    const paire = window.tabAnon[idx];
    
    if (!paire.matchPositions || paire.matchPositions.length === 0) {
        return;
    }
    
    // Cas d'une seule occurrence : scroll vers elle sans changer l'index
    if (paire.matchPositions.length === 1) {
        surlignerOccurrence(idx);
        return;
    }
    
    // Au premier clic, passer de "N" à "1/N"
    if (paire.indexCourant === 0) {
        const countSpan = document.querySelector(`tr[data-idx="${idx}"] .count-occ`);
        if (countSpan && !countSpan.textContent.includes('/')) {
            countSpan.textContent = `1/${paire.occurrences}`;
        }
    }
    
    if (paire.indexCourant < paire.matchPositions.length - 1) {
        paire.indexCourant++;
        surlignerOccurrence(idx);
    }
}

// Navigation vers l'occurrence précédente
function allerOccurrencePrecedente(idx) {
    const paire = window.tabAnon[idx];
    
    if (!paire.matchPositions || paire.matchPositions.length === 0) {
        return;
    }
    
    // Cas d'une seule occurrence : scroll vers elle sans changer l'index
    if (paire.matchPositions.length === 1) {
        surlignerOccurrence(idx);
        return;
    }
    
    // Au premier clic, passer de "N occ" à "1/N"
    if (paire.indexCourant === 0) {
        const countSpan = document.querySelector(`tr[data-idx="${idx}"] .count-occ`);
        if (countSpan && !countSpan.textContent.includes('/')) {
            countSpan.textContent = `1/${paire.occurrences}`;
        }
    }
    
    if (paire.indexCourant > 0) {
        paire.indexCourant--;
        surlignerOccurrence(idx);
    }
}

// Surligne l'occurrence courante et scroll vers elle
function surlignerOccurrence(idx) {
    const paire = window.tabAnon[idx];
    
    if (!paire.matchPositions || paire.matchPositions.length === 0) {
        return;
    }
    
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const matchCourant = paire.matchPositions[paire.indexCourant];
    
    // Retirer les surbrillances d'autres occurrences (classe highlight-occ)
    tousLesSpans.forEach(span => {
        span.classList.remove('highlight-occ');
    });
    
    // Ajouter la surbrillance sur l'occurrence courante
    for (let i = matchCourant.start; i <= matchCourant.end; i++) {
        if (tousLesSpans[i]) {
            tousLesSpans[i].classList.add('highlight-occ');
        }
    }
    
    // Scroll vers la première occurrence
    const firstSpan = tousLesSpans[matchCourant.start];
    if (firstSpan) {
        firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Mettre à jour le texte du compteur avec index courant
    const countSpan = document.querySelector(`tr[data-idx="${idx}"] .count-occ`);
    if (countSpan) {
        countSpan.textContent = `${paire.indexCourant + 1}/${paire.occurrences}`;
    }
}

// Valide toutes les anonymisations en attente (lignes qui ont entité et remplacement mais pas validées)
function validerAnonEnAttente() {
    let compteurValides = 0;
    let compteurErreurs = 0;
    
    // Parcourir toutes les lignes du tableau
    for (let i = 0; i < window.tabAnon.length; i++) {
        const entite = document.querySelector(`.input-entite[data-idx="${i}"]`);
        const remplacement = document.querySelector(`.input-remplacement[data-idx="${i}"]`);
        
        if (!entite || !remplacement) continue;
        
        // Récupérer les valeurs actuelles
        const entiteVal = entite.value.trim();
        const remplacementVal = remplacement.value.trim();
        
        // Vérifier si cette ligne a les deux champs remplis mais n'est pas validée
        if (entiteVal && remplacementVal && window.tabAnon[i].occurrences === 0) {
            // Sauvegarder les valeurs
            window.tabAnon[i].entite = entiteVal;
            window.tabAnon[i].remplacement = remplacementVal;
            
            // Vérifier si cette entité n'est pas déjà anonymisée
            let estDoublon = false;
            for (let j = 0; j < window.tabAnon.length; j++) {
                if (i !== j && window.tabAnon[j].entite.trim() === entiteVal && window.tabAnon[j].occurrences > 0) {
                    estDoublon = true;
                    break;
                }
            }
            
            if (estDoublon) {
                compteurErreurs++;
                continue;
            }
            
            // Appliquer l'anonymisation
            appliquerAnonymisationPour(i);
            
            // Désactiver l'édition des textareassi des occurrences ont été trouvées
            if (window.tabAnon[i].occurrences > 0) {
                desactiverEditionLigne(i);
                compteurValides++;
            } else {
                compteurErreurs++;
            }
        }
    }
    
    // Rafraîchir le tableau
    affichTableauAnon();
    
    // Afficher un message de résumé
    let message = `${compteurValides} anonymisation(s) validée(s)`;
    if (compteurErreurs > 0) {
        message += ` et ${compteurErreurs} erreur(s)`;
    }
    if (compteurValides > 0 || compteurErreurs > 0) {
        console.log(message);
    }
}

// Compte le nombre d'exceptions pour une paire d'anonymisation
function compterExceptions(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire.matchPositions) {
        return 0;
    }
    return paire.matchPositions.filter(match => match.isException).length;
}

// Compte le nombre d'occurrences d'une entité dans le texte
function compterOccurrencesEntite(entite) {
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const motRecherche = entite.trim();
    // Tokenize comme la segmentation pour matcher tous les cas (tirets, apostrophes, etc.)
    let motsRecherche = tokenizeCommeSegmentation(motRecherche);
    // Retirer les espaces des tokens recherchés (car les espaces ne correspondent pas aux spans)
    motsRecherche = motsRecherche.filter(t => t.trim() !== '');
    
    let count = 0;
    
    // Créer une liste de spans non-vides pour la recherche
    const spansNonVides = [];
    tousLesSpans.forEach((span, idx) => {
        const txt = span.innerText.trim();
        if (txt) {
            spansNonVides.push({ txt, originalIdx: idx });
        }
    });
    
    // Chercher la séquence de tokens dans les spans
    for (let i = 0; i <= spansNonVides.length - motsRecherche.length; i++) {
        let match = true;
        
        // Vérifier si les mots correspondent
        for (let j = 0; j < motsRecherche.length; j++) {
            if (i + j >= spansNonVides.length) {
                match = false;
                break;
            }
            
            if (spansNonVides[i + j].txt !== motsRecherche[j]) {
                match = false;
                break;
            }
        }
        
        if (match) {
            count++;
        }
    }
    
    return count;
}

// Cherche si la sélection courante (debSel/finSel) correspond à une occurrence anonymisée existante
function trouverOccurrenceAnonyme(debSel, finSel) {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        return null;
    }
    
    // Parcourir toutes les paires anonymisées
    for (let idxPaire = 0; idxPaire < window.tabAnon.length; idxPaire++) {
        const paire = window.tabAnon[idxPaire];
        
        // Vérifier si cette paire a des occurrences
        if (!paire.matchPositions || paire.matchPositions.length === 0) {
            continue;
        }
        
        // Chercher si la sélection correspond à l'un des matchPositions
        for (let matchIdx = 0; matchIdx < paire.matchPositions.length; matchIdx++) {
            const match = paire.matchPositions[matchIdx];
            
            // Cas 1: Match exact (débuts et fins identiques)
            if (debSel === match.start && finSel === match.end) {
                return { idxPaire, matchIdx, match };
            }
            
            // Cas 1b: Match avec tolérance de ±1 (pour gérer les décalages d'indices)
            if (Math.abs(debSel - match.start) <= 1 && Math.abs(finSel - match.end) <= 1) {
                return { idxPaire, matchIdx, match };
            }
            
            // Cas 2: debSel/finSel est juste après le match
            // (cas où le match inclut un espace avant le mot)
            if (debSel === match.end + 1 && finSel === match.end + 1) {
                return { idxPaire, matchIdx, match };
            }
        }
    }
    
    return null;
}

// Bascule le statut d'exception pour une occurrence
function basculerException(idxPaire, matchIdx) {
    const paire = window.tabAnon[idxPaire];
    const match = paire.matchPositions[matchIdx];
    
    if (!match) return;
    
    // Basculer le flag
    match.isException = !match.isException;
    
    // Mettre à jour les classes des spans
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    for (let i = match.start; i <= match.end; i++) {
        if (tousLesSpans[i]) {
            if (match.isException) {
                tousLesSpans[i].classList.remove('anon');
                tousLesSpans[i].classList.add('anon-exception');
                // Retirer le pseudo si c'était marqué
                if (i === match.start || i === match.end) {
                    delete tousLesSpans[i].dataset.pseudo;
                }
            } else {
                tousLesSpans[i].classList.remove('anon-exception');
                tousLesSpans[i].classList.add('anon');
                // Ajouter le pseudo au début et fin
                if (i === match.start || i === match.end) {
                    tousLesSpans[i].dataset.pseudo = paire.remplacement;
                }
            }
        }
    }
    
    // Rafraîchir le tableau pour mettre à jour le compteur d'exceptions
    affichTableauAnon();
}

function chercherNomPropres() {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        //console.log("tabAnon non défini");
        return;
    }

    console.log("Recherche de noms propres dans le texte...");
    
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const nomsPropresTrouves = new Set();
    // Parcourir tous les spans pour détecter les noms propres

    let derMot="."; 
    let derMotNomPropre =false; 

    tousLesSpans.forEach(span => {
        const texte = span.innerText.trim();

         


        
        // Vérifier si le premier caractère est une majuscule
        if (texte && /^[A-ZÀ-ÖØ-Ý]/.test(texte[0])) {
            
            
            console.log(`Nom propre détecté: ${texte}`);

            // liste de mots ne pouvant pas être des noms propres
            const motsExclus = new Set(["Le", "La", "Les", "Un", "Une", "Des", "Et", "Mais", "Ou", "Donc", "Or", "Ni", "À", "Au", "Aux", "Du", "De", "Des", "Mon", 
                "Ton", "Son", "Notre", "Votre", "Leur", "Ce", "Cette", "Ces", "Qui", "Que", "Quoi", "Dont", "Où", "Si", "Oui", "Non", "Je", "J", "Tu", "Il", "Elle", "Nous", "Vous", "Ils", "Elles", "Est", "Sont", "Était", "Étaient",
                "A", "As", "Avons", "Avez", "Ont", "Faire", "Fait", "Fais", "Être", "Es", "Étés", "Étée", "Des", "Dans", "Sur", "Sous", "Avec", "Pour", "Par", "En", "Comme", "Mais", "Si", "Quand", "Alors",
                "C", "Ça", "Ceci", "Cela", "Celui", "Celle", "Ceux", "Celles","D", "L", "Là", "Y", "Ne", "Pas", "Plus", "Moins", "Très", "Bien", "Mal", "Toujours", "Jamais", "Souvent", "Parfois", "Oui", "Non", "Ouais", "Hem","Heu", 
                "Ah", "Oh", "Hé", "Allô", "Ok", "D","M", "Bon","Bah", "Qestion", "Réponse", "Ensuite", "Puis", "Enfin", "Déjà", "Peut-être"]);

            if (motsExclus.has(texte)) {
                 
              //  console.log(`Mot exclu ignoré: ${texte} au rang ${span.dataset.rk}`);
                derMotNomPropre = false;
                if (texte.trim() !== "") {
                    //derMot = texte;
                }
                return; // Ignorer ce mot
            }

            //console.log("Mot non exclu, traitement en cours.");

            // Vérifier que le mot précédent se termine par un point ou est vide (début de phrase)
            if (!/[.!?]/.test(derMot.slice(-1))) {

                  //console.log("le mot précédent ne se termine pas par un point.");                  

                if (derMotNomPropre===false) {
                    //console.log(`Nouveau nom propre ajouté: ${texte} mot précédent : ${derMot} nomPropre? : ${derMotNomPropre} au rang ${span.dataset.rk}`);
                    // Nouveau nom propre
                    nomsPropresTrouves.add(texte);
                    derMotNomPropre = true;

                } else {
                
                    // Si le mot précédent était déjà un nom propre, on le complète 
                    const dernierNomPropre = Array.from(nomsPropresTrouves).pop();
                    const nomComplet = dernierNomPropre + " " + texte;
                    nomsPropresTrouves.delete(dernierNomPropre);
                    nomsPropresTrouves.add(nomComplet);
                    //console.log(`complétion du nom propre précédent: ${dernierNomPropre} mot précédent : ${derMot} au rang ${span.dataset.rk}`);
                    derMotNomPropre = true;
                }

            }  else {
              
                derMotNomPropre = false;
            }

            if (texte.trim() !== "" && texte) {
                derMot = texte;
            }

        } else {
               
             if (texte.trim() !== "") {
                 derMotNomPropre = false;
                derMot = texte;
            }
            }
    });

    // tri par ordre alphabétique
    const nomsPropresTries = Array.from(nomsPropresTrouves).sort((a, b) => a.localeCompare(b, 'fr'));   
    //console.log("Noms propres trouvés:", nomsPropresTries);

    // ajouter à tabAnon
    nomsPropresTries.forEach(nom => {
        // Vérifier si le nom propre n'est pas déjà dans tabAnon
        const existeDeja = window.tabAnon.some(paire => paire.entite === nom);
        if (!existeDeja) {
            window.tabAnon.push({ entite: nom, remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
        }
    });

    //console.log(`Ajouté ${nomsPropresTries.length} noms propres à tabAnon.`);
    // Rafraîchir l'affichage du tableau
    affichTableauAnon();
}    

function pointAnon() {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        return;
    }

    console.log(tabAnon)
}