////////////////////////////////////////////////////////////////////////
// GESTION DE L'ANONYMISATION
////////////////////////////////////////////////////////////////////////

/**
 * Fusionne les règles d'anonymisation globales (tabAnon du corpus) avec celles locales de l'entretien
 * @param {Array} tabAnonGlobal - Tableau global des anonymisations du corpus
 * @param {Array} tabAnonLocal - Tableau local des anonymisations de l'entretien
 * @returns {Array} Tableau fusionné
 */
function fusionnerTabAnon(tabAnonGlobal, tabAnonLocal) {
  const map = new Map(); // Clé: "entite|remplacement"
  
  // 1. Ajouter les règles du tabAnon global
  if (tabAnonGlobal && tabAnonGlobal.length > 0) {
    tabAnonGlobal.forEach(regle => {
      if (!regle.entite || !regle.remplacement) return;
      const key = `${regle.entite.toLowerCase()}|${regle.remplacement.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          entite: regle.entite,
          remplacement: regle.remplacement,
          occurrences: 0,
          indexCourant: 0,
          matchPositions: [],
          source: regle.source || 'Global' // Marquer comme venant du global
        });
      }
    });
  }

  // 2. Ajouter les règles du tabAnon local (qui peuvent surcharger les globales)
  if (tabAnonLocal && tabAnonLocal.length > 0) {
    tabAnonLocal.forEach(regle => {
      if (!regle.entite || !regle.remplacement) return;
      const key = `${regle.entite.toLowerCase()}|${regle.remplacement.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          entite: regle.entite,
          remplacement: regle.remplacement,
          occurrences: regle.occurrences || 0,
          indexCourant: regle.indexCourant || 0,
          matchPositions: regle.matchPositions || [],
          source: 'Local'
        });
      } else {
        // Si la règle existe, mettre à jour les données d'exécution
        const existing = map.get(key);
        existing.occurrences = regle.occurrences || 0;
        existing.indexCourant = regle.indexCourant || 0;
        existing.matchPositions = regle.matchPositions || [];
        existing.existeLocalement = true; // présente dans le tabAnon local → pas en attente
      }
    });
  }

  // 3. Convertir la map en tableau et ajouter des lignes vides si nécessaire
  let result = Array.from(map.values());
  
  // Ajouter des lignes vides pour la saisie
  const nbLignesVides = Math.max(5 - result.length, 3);
  for (let i = 0; i < nbLignesVides; i++) {
    result.push({
      entite: "",
      remplacement: "",
      occurrences: 0,
      indexCourant: 0,
      matchPositions: []
    });
  }

  console.log(`✅ Fusion tabAnon : ${tabAnonGlobal?.length || 0} global(es) + ${tabAnonLocal?.length || 0} local(es) = ${result.length} total`, result);
  return result;
}

// Gère la validation/revalidation au clavier du champ Pseudo
function gererEntrePseudo(idx) {
    const paire = window.tabAnon[idx];
    
    // Si des occurrences existent, relancer la substitution
    if (paire.occurrences > 0) {
        const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
        if (remplacement) {
            // Mettre à jour le pseudo depuis le champ
            paire.remplacement = remplacement.value.trim();
        }
        appliquerAnonymisationPour(idx);
        affichTableauAnon();
    } else {
        // Sinon, valider la ligne normalement
        validerLigneAnon(idx);
    }
}

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

/**
 * Nettoie les paires en cours de remplissage qui n'ont pas d'occurrences
 * (c'est-à-dire que l'entité n'existe pas dans le texte de l'entretien)
 */
function nettoyerPairesOrphelines() {
    console.log("🧹 Nettoyage des paires orphelines (entité non trouvée)...");
    
    if (!window.tabAnon) return;
    
    // Supprimer les paires qui ont une entité mais 0 occurrences
    const avantNettoyage = window.tabAnon.length;
    
    window.tabAnon = window.tabAnon.filter(paire => {
        const aOccurrences = paire.occurrences > 0;
        const estVide = !paire.entite || !paire.entite.trim();
        const estGlobalEnAttente = paire.presentMaisNonAnonymise === true;
        // Conserver toutes les entrées globales non encore appliquées localement :
        // la présence réelle dans le texte sera vérifiée au rendu par compterOccurrencesEntite
        const estGlobalNonLocal = paire.source === 'Global' && !paire.existeLocalement;
        const garde = aOccurrences || estVide || estGlobalEnAttente || estGlobalNonLocal;
        return garde;
    });
    
    const apresNettoyage = window.tabAnon.length;
    if (avantNettoyage !== apresNettoyage) {
        console.log(`🧹 ${avantNettoyage - apresNettoyage} paire(s) orpheline(s) supprimée(s)`);
    }
}

/**
 * Vérifie si une entité est présente dans les spans du DOM actuel (sans modifier quoi que ce soit).
 * Utilise la même logique de tokenisation que appliquerAnonymisationPour.
 * @param {string} entite
 * @returns {boolean}
 */
function entitePresenterDansDOM(entite) {
    if (!entite || !entite.trim()) return false;

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    let motsRecherche = tokenizeCommeSegmentation(entite.trim());
    motsRecherche = motsRecherche.filter(t => t.trim() !== '');

    if (motsRecherche.length === 0) return false;

    const spansNonVides = [];
    tousLesSpans.forEach(span => {
        const txt = span.textContent.trim();
        if (txt) spansNonVides.push(txt);
    });

    for (let i = 0; i <= spansNonVides.length - motsRecherche.length; i++) {
        let match = true;
        for (let j = 0; j < motsRecherche.length; j++) {
            if (spansNonVides[i + j] !== motsRecherche[j]) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }

    return false;
}

/**
 * Détecte automatiquement les occurrences de toutes les paires du tabAnon dans le texte
 * Utile pour initialiser les occurrences après la fusion de tabAnon
 */
function detecterOccurrencesToutesLesPaires() {
    console.log("🔍 Détection automatique des occurrences pour toutes les paires...");
    
    if (!window.tabAnon || window.tabAnon.length === 0) {
        console.log("tabAnon vide, pas de détection");
        return;
    }

    // ⚡ Pré-filtrage : construire UNE SEULE FOIS l'ensemble des mots présents dans le texte.
    // Cela permet d'éliminer rapidement les entités qui ne peuvent pas figurer dans
    // l'entretien courant, sans parcourir tous les spans pour chacune d'elles.
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const motsPresents = new Set();
    tousLesSpans.forEach(span => {
        const txt = span.textContent.trim();
        if (txt) motsPresents.add(txt);
    });
    console.log(`⚡ Pré-filtrage : ${motsPresents.size} mot(s) distinct(s) dans le texte`);

    let ignorees = 0;
    
    // Parcourir toutes les paires qui ont une entité définie
    for (let i = 0; i < window.tabAnon.length; i++) {
        const paire = window.tabAnon[i];
        if (paire.entite && paire.entite.trim()) {

            // ⚡ Vérifier que tous les tokens de l'entité sont présents dans le texte
            // avant de lancer l'analyse fine (coûteuse) sur les spans.
            let tokens = tokenizeCommeSegmentation(paire.entite.trim());
            tokens = tokens.filter(t => t.trim() !== '');
            const tousPresents = tokens.every(token => motsPresents.has(token));

            if (!tousPresents) {
                // Au moins un token absent : l'entité ne peut pas être dans le texte.
                if (paire.source === 'Global' && !paire.existeLocalement) {
                    paire.presentMaisNonAnonymise = false;
                }
                ignorees++;
                continue;
            }

            if (paire.source === 'Global' && !paire.existeLocalement) {
                const presente = entitePresenterDansDOM(paire.entite);
                paire.presentMaisNonAnonymise = presente;
                if (presente) {
                    paire.nbOccurrencesNonTraitees = compterOccurrencesEntite(paire.entite);
                }
                continue;
            }
            // Le DOM préservé par cleanHTML est la source de vérité pour toute paire déjà
            // appliquée (occurrences > 0) : réindexer sans toucher aux classes préserve
            // l'état anon / exclu / non-traité tel qu'il a été sauvegardé.
            // Pour les nouvelles paires (occurrences = 0), appliquer normalement.
            if (paire.occurrences > 0) {
                reindexerMatchPositions(i);
            } else {
                appliquerAnonymisationPour(i);
            }
        }
    }
    
    // 🧹 Nettoyer les paires orphelines après la détection
    nettoyerPairesOrphelines();
    
    console.log(`✅ Détection terminée (${ignorees} entité(s) ignorée(s) par pré-filtrage)`);
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

    // affichTableauAnon() sera appelé seulement au premier clic sur le panneau d'anonymisation
}

// Affichage du tableau d'anonymisation
// FILTRAGE : affiche les paires avec occurrences > 0, + les paires en cours de remplissage (entité sans occurrences), + lignes vides
function affichTableauAnon() {
    const tableauDiv = document.getElementById('tableauAnon');
    if (!tableauDiv) return;
    // Réinitialiser le compteur actif (les flèches disparaissent au re-rendu)
    window._activeCounter = null;


    // 1. Construire la liste des indices à afficher
    // - Toutes les paires avec occurrences > 0
    // - Les paires avec entité mais 0 occurrences (en cours de remplissage par l'utilisateur)
    // - Plus les dernières lignes vides du tabAnon pour permettre l'ajout
    const indicesToDisplay = [];
    const nbLignesVidesAAfficher = 2;
    
    // Ajouter d'abord toutes les paires avec occurrences > 0
    for (let i = 0; i < window.tabAnon.length; i++) {
        if (window.tabAnon[i].occurrences > 0) {
            indicesToDisplay.push(i);
        }
    }
    
    // Ajouter les paires avec entité mais 0 occurrences (l'utilisateur vient de les ajouter)
    for (let i = 0; i < window.tabAnon.length; i++) {
        const p = window.tabAnon[i];
        if (p.occurrences === 0 && p.entite && p.entite.trim() && !indicesToDisplay.includes(i)) {
            // Pour les entrées globales non encore appliquées localement,
            // ne montrer que si l'entité est réellement présente dans le texte
            if (p.source === 'Global' && !p.existeLocalement) {
                if (compterOccurrencesEntite(p.entite) > 0) {
                    indicesToDisplay.push(i);
                }
            } else {
                indicesToDisplay.push(i);
            }
        }
    }
    
    // Ajouter les N dernières lignes vides du tabAnon
    const lignesVides = [];
    for (let i = window.tabAnon.length - 1; i >= 0; i--) {
        if (window.tabAnon[i].occurrences === 0 && (!window.tabAnon[i].entite || !window.tabAnon[i].entite.trim())) {
            lignesVides.push(i);
            if (lignesVides.length >= nbLignesVidesAAfficher) break;
        }
    }
    // Ajouter les lignes vides dans le bon ordre
    for (let i = lignesVides.length - 1; i >= 0; i--) {
        if (!indicesToDisplay.includes(lignesVides[i])) {
            indicesToDisplay.push(lignesVides[i]);
        }
    }
    
    console.log(`📊 Affichage du tableau : ${indicesToDisplay.filter(i => window.tabAnon[i].occurrences > 0).length} paire(s) avec occurrences + ${indicesToDisplay.filter(i => window.tabAnon[i].entite && window.tabAnon[i].entite.trim() && window.tabAnon[i].occurrences === 0).length} paire(s) en cours de remplissage + lignes vides`);
    
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
    
    for (let displayIdx = 0; displayIdx < indicesToDisplay.length; displayIdx++) {
        const i = indicesToDisplay[displayIdx];
        const paire = window.tabAnon[i];
        
        // Déterminer si cette ligne a des occurrences trouvées
        const aDesOccurrences = paire.occurrences > 0;
        // Déterminer si cette ligne est VRAIMENT anonymisée (occurrences + pseudo défini)
        const estAnonymisee = aDesOccurrences && paire.remplacement.trim().length > 0;
        // Réindexer les positions depuis le DOM si nécessaire (placeholders du panel corpus ou entrée non encore traitée)
        if (paire.entite && paire.entite.trim()) {
            const hasPlaceholders = aDesOccurrences && paire.matchPositions && paire.matchPositions.length > 0 && paire.matchPositions[0].start === -1;
            const needsNonTraiteScan = !aDesOccurrences;
            if (hasPlaceholders || needsNonTraiteScan) {
                reindexerMatchPositions(i);
            }
        }
        // Compteurs par catégorie
        const nbAnon = paire.matchPositions ? paire.matchPositions.filter(m => !m.isException && !m.isNonTraite).length : 0;
        const nbExc  = paire.matchPositions ? paire.matchPositions.filter(m => m.isException).length : 0;
        const nbNon  = paire.matchPositions ? paire.matchPositions.filter(m => m.isNonTraite).length : 0;
        const estPending = nbNon > 0;
        
        html += `
            <tr data-idx="${i}" class="ligne-anon${estAnonymisee ? ' ligne-anonymisee' : ''}">
                <td class="col-entite">
                    <textarea 
                           class="input-entite textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}" 
                           data-idx="${i}" 
                           placeholder="Entité"
                           onchange="sauvAnon(${i})"
                           oninput="mettreAJourBoutonRechercher(${i})"
                           onfocus="mettreAJourBoutonRechercher(${i});dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="cacherBoutonRechercher(${i});dsTxtAutre=false"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();rechercherOccurrences(${i})}"
                           ${estAnonymisee ? '' : ''}>${paire.entite}</textarea>
                </td>
                <td class="col-remplacement">
                    <textarea 
                           class="input-remplacement textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}" 
                           data-idx="${i}" 
                           placeholder="Pseudo"
                           onchange="sauvAnon(${i})"
                           oninput="mettreAJourBoutonRechercher(${i})"
                           onfocus="mettreAJourBoutonRechercher(${i});dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="cacherBoutonRechercher(${i});dsTxtAutre=false"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();gererEntrePseudo(${i})}"
                           ${estAnonymisee ? '' : ''}>${paire.remplacement}</textarea>
                </td>
                <td class="col-actions">
                    <div class="actions-container-new">
                        ${nbAnon > 0 ? `<button class="btn-nav-cat btn-nav-cat-anon" data-idx="${i}" data-cat="anon" onclick="clicCompteur(this,${i},'anon')" title="${nbAnon} occurrence(s) anonymisée(s) — cliquer pour naviguer">${nbAnon}</button>` : ''}
                        ${nbExc > 0 ? `<button class="btn-nav-cat btn-nav-cat-exc" data-idx="${i}" data-cat="exc" onclick="clicCompteur(this,${i},'exc')" title="${nbExc} exception(s) — cliquer pour naviguer">${nbExc}</button>` : ''}
                        ${nbNon > 0 ? `<button class="btn-nav-cat btn-nav-cat-non" data-idx="${i}" data-cat="non" onclick="clicCompteur(this,${i},'non')" title="${nbNon} occurrence(s) non encore traitée(s) — cliquer pour naviguer">${nbNon}</button>` : ''}
                        ${aDesOccurrences ? `
                        <button class="btn-action btn-action-delete" onclick="supprimeLigneAnon(${i})" title="Supprimer">
                            <span class="btn-main-icon">✖️</span>
                        </button>
                        ` : `
                        <button class="btn-action btn-action-left" onclick="rechercherOccurrences(${i})" title="Rechercher occurrences" style="display:${paire.entite.trim() && paire.remplacement.trim() && !nbNon ? 'inline-flex' : 'none'};">
                            <span class="btn-main-icon">🔍</span>
                        </button>
                        <button class="btn-action btn-action-delete" onclick="validerLigneAnon(${i})" title="Valider et appliquer">
                            <span class="btn-main-icon">✓</span>
                        </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }
    
    html += `
            </tbody>
        </table>
        <div style="margin-top: 10px; display: flex; gap: 5px;width:100%; position:sticky;bottom:0px;">
            <button class="btn-valider-anon-attente btnfonction btnlarge " onclick="validerAnonEnAttente()">
                Appliquer
            </button>
            <button class="btn-valider-anon-attente btnfonction btnlarge " style="flex:1;" onclick="ajouterNouvelleLigneAnon()">
                ➕ 
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
    
    // Initialiser le listener sur la checkbox (une seule fois)
    if (!window._chkAnonListenerInitialized) {
        initChkAnonListener();
        window._chkAnonListenerInitialized = true;
    }
    
    // Attacher les listeners pour les exceptions
    setTimeout(() => {
        attacheExceptionListeners();
    }, 50);
}

/**
 * Nettoie le tabAnon en supprimant les lignes vides et les doublons
 * @returns {Array} Tableau nettoyé
 */
function nettoyerTabAnon() {
  if (!window.tabAnon) return [];
  
  // Filtrer les lignes vides
  const lignesValides = window.tabAnon.filter(p => 
    p.entite && p.entite.trim().length > 0 && 
    p.remplacement && p.remplacement.trim().length > 0
  );

  // Supprimer les doublons (même entité + remplacement)
  const map = new Map();
  lignesValides.forEach(p => {
    const key = `${p.entite.toLowerCase()}|${p.remplacement.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, p);
    }
  });

  return Array.from(map.values());
}

// Sauvegarde d'une ligne du tableau (quand on change le champ entité ou pseudo)
function sauvAnon(idx) {
    const entiteInput = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacementInput = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    if (!entiteInput || !remplacementInput) return;

    const paire = window.tabAnon[idx];
    if (!paire) return;

    const ancienneEntite = (paire.entite || '').trim();
    const ancienRemplacement = (paire.remplacement || '').trim();
    const nouvelleEntite = entiteInput.value.trim();
    const nouveauRemplacement = remplacementInput.value.trim();

    paire.entite = nouvelleEntite;
    paire.remplacement = nouveauRemplacement;

    const aOccurrences = paire.occurrences > 0;

    // Cas 1 : on vide la case "Nom" d'une ligne déjà anonymisée
    // → on retire toutes les marques DOM, on remet à zéro matchPositions/occurrences
    //   pour que les 3 compteurs (anon / exc / non) disparaissent.
    if (ancienneEntite && !nouvelleEntite && aOccurrences) {
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        if (paire.matchPositions && paire.matchPositions.length > 0) {
            paire.matchPositions.forEach(match => {
                for (let i = match.start; i <= match.end; i++) {
                    if (tousLesSpans[i]) {
                        tousLesSpans[i].classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                        tousLesSpans[i].removeAttribute('data-anon-nt');
                        delete tousLesSpans[i].dataset.pseudo;
                    }
                }
            });
        }
        // Filet de sécurité via l'ancien pseudo
        if (ancienRemplacement) {
            tousLesSpans.forEach(span => {
                if (span.dataset.pseudo === ancienRemplacement) {
                    span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                    span.removeAttribute('data-anon-nt');
                    delete span.dataset.pseudo;
                }
            });
        }
        paire.occurrences = 0;
        paire.matchPositions = [];
        paire.indexCourant = 0;
        affichTableauAnon();
        return;
    }

    // Cas 2 : on vide uniquement la case "Pseudo" d'une ligne déjà anonymisée
    // → les occurrences non-exception basculent en "à anonymiser" (isNonTraite),
    //   le compteur "anonymisées" devient "à anonymiser".
    if (ancienRemplacement && !nouveauRemplacement && aOccurrences
        && paire.matchPositions && paire.matchPositions.length > 0) {
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        paire.matchPositions.forEach(match => {
            if (!match.isException) {
                for (let i = match.start; i <= match.end; i++) {
                    if (tousLesSpans[i]) {
                        tousLesSpans[i].classList.remove('anon', 'debsel', 'finsel');
                        delete tousLesSpans[i].dataset.pseudo;
                        tousLesSpans[i].setAttribute('data-anon-nt', 'true');
                    }
                }
                match.isNonTraite = true;
            }
        });
        affichTableauAnon();
        return;
    }
}

// Mise à jour de la visibilité du bouton rechercher
function mettreAJourBoutonRechercher(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    const boutonRechercher = document.querySelector(`tr[data-idx="${idx}"] .btn-action-left`);
    
    if (boutonRechercher && entite && remplacement) {
        // Afficher le bouton si au moins un des deux champs est rempli
        const entiteRemplie = entite.value.trim().length > 0;
        const remplacementRemplie = remplacement.value.trim().length > 0;
        
        if (entiteRemplie || remplacementRemplie) {
            boutonRechercher.style.display = 'inline-flex';
        } else {
            boutonRechercher.style.display = 'none';
        }
    }
}

// Cache le bouton rechercher quand on quitte le focus
function cacherBoutonRechercher(idx) {
    // Délai pour laisser le temps au clic sur le bouton de s'enregistrer avant de le cacher
    setTimeout(() => {
        // Ne pas cacher si des occurrences existent (alors on navigue)
        const paire = window.tabAnon[idx];
        if (!paire || paire.occurrences === 0) {
            const boutonRechercher = document.querySelector(`tr[data-idx="${idx}"] .btn-action-left`);
            if (boutonRechercher) {
                boutonRechercher.style.display = 'none';
            }
        }
    }, 200);
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
    
    // Utiliser le pseudo pour retrouver tous les spans (plus fiable que les indices)
    if (paire && paire.remplacement) {
        const pseudoAEffacer = paire.remplacement.trim();
        
        // Chercher et nettoyer tous les spans avec ce pseudo
        let occurrenceTrouvee = true;
        let compteur = 0;
        const maxIterations = 100;
        
        while (occurrenceTrouvee && compteur < maxIterations) {
            occurrenceTrouvee = false;
            compteur++;
            
            const debselSpan = document.querySelector(`[data-pseudo="${pseudoAEffacer}"].debsel`);
            if (debselSpan) {
                // Retrouver le finsel
                let finselSpan = debselSpan;
                const allSpans = document.querySelectorAll('[data-rk]');
                
                for (let i = parseInt(debselSpan.dataset.rk); i < allSpans.length; i++) {
                    const span = allSpans[i];
                    if (span.dataset.pseudo === pseudoAEffacer && span.classList.contains('finsel')) {
                        finselSpan = span;
                        break;
                    }
                }
                
                // Nettoyer tous les spans du match
                const debutRk = parseInt(debselSpan.dataset.rk);
                const finRk = parseInt(finselSpan.dataset.rk);
                
                for (let i = debutRk; i <= finRk; i++) {
                    if (allSpans[i]) {
                        allSpans[i].classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                        delete allSpans[i].dataset.pseudo;
                    }
                }
                occurrenceTrouvee = true;
            }
        }
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



// Sauvegarde le tabAnon courant dans l'entretien
async function sauvegarderTabAnonEnt() {
    try {
        const rkEnt = await window.electronAPI.getEntCur();
        if (rkEnt === null || rkEnt === undefined || rkEnt < 0) return;
        const tabEntLocal = await window.electronAPI.getEnt();
        if (!tabEntLocal || !tabEntLocal[rkEnt]) return;
        tabEntLocal[rkEnt].tabAnon = window.tabAnon;
        await window.electronAPI.setEnt(tabEntLocal);
    } catch (error) {
        console.error("❌ Erreur lors de la sauvegarde du tabAnon:", error);
    }
}

// Supprime une ligne du tableau
async function supprimeLigneAnon(idx) {
    const paireSupprimee = window.tabAnon[idx];

    if (paireSupprimee) {
        const tousLesSpans = document.querySelectorAll('[data-rk]');

        // 1. Nettoyer via matchPositions (indices NodeList exacts) — couvre aussi anon-exception
        if (paireSupprimee.matchPositions && paireSupprimee.matchPositions.length > 0) {
            paireSupprimee.matchPositions.forEach(match => {
                for (let i = match.start; i <= match.end; i++) {
                    if (tousLesSpans[i]) {
                        tousLesSpans[i].classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                        delete tousLesSpans[i].dataset.pseudo;
                    }
                }
            });
        }

        // 2. Filet de sécurité : balayer les spans encore marqués data-pseudo (cas où matchPositions serait vide/périmé)
        const pseudoAEffacer = paireSupprimee.remplacement ? paireSupprimee.remplacement.trim() : '';
        if (pseudoAEffacer) {
            tousLesSpans.forEach(span => {
                if (span.dataset.pseudo === pseudoAEffacer) {
                    span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                    delete span.dataset.pseudo;
                }
            });
        }
    }

    // Supprimer la ligne du tableau
    window.tabAnon.splice(idx, 1);

    affichTableauAnon();

    // 💾 Sauvegarder les changements dans l'entretien
    await sauvegarderTabAnonEnt();
}

// Ajoute une nouvelle ligne au tableau
function ajouterNouvelleLigneAnon() {
    window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
    affichTableauAnon();

    // Placer le focus sur le champ Entité de la nouvelle ligne avec un scroll smooth
    setTimeout(() => {
        const newIdx = window.tabAnon.length - 1;
        const nouvelleEntite = document.querySelector(`.input-entite[data-idx="${newIdx}"]`);
        const tableauDiv = document.getElementById('tableauAnon');

        if (nouvelleEntite) {
            try {
                // Forcer le conteneur à utiliser un comportement de scroll smooth
                if (tableauDiv) {
                    // sauvegarder valeur précédente
                    const prev = tableauDiv.style.scrollBehavior;
                    tableauDiv.style.scrollBehavior = 'smooth';

                    // scroller la nouvelle ligne au centre
                    nouvelleEntite.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // restaurer après un court délai
                    setTimeout(() => { tableauDiv.style.scrollBehavior = prev || ''; }, 400);
                } else {
                    // fallback si conteneur non trouvé
                    nouvelleEntite.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (e) {
                // si le navigateur ne supporte pas smooth, utiliser fallback
                nouvelleEntite.scrollIntoView(true);
            }

            // Focus sur le champ après le scroll
            setTimeout(() => { nouvelleEntite.focus(); }, 220);
            // Ajouter une animation discrète sur la nouvelle ligne pour la repérer
            setTimeout(() => {
                const nouvelleLigne = document.querySelector(`tr[data-idx="${newIdx}"]`);
                if (nouvelleLigne) {
                    nouvelleLigne.classList.add('new-row-pulse');
                    // retirer la classe après l'animation
                    setTimeout(() => { nouvelleLigne.classList.remove('new-row-pulse'); }, 900);
                }
            }, 260);
        }
    }, 0);
}

// Ajoute une entité sélectionnée à la première ligne vide
function ajouteEntiteAnonSelectionnee() {
    console.log("🎯 ajouteEntiteAnonSelectionnee() appelée");
    
    // Vérifie qu'une sélection est active
    if (debSel <= 0 || finSel <= 0) {
        console.log("❌ Aucune sélection (debSel=" + debSel + ", finSel=" + finSel + ")");
        return;
    }
    
    // Récupère le texte sélectionné
    let texteSel = getTexteSelection(debSel, finSel);
    
    if (!texteSel) {
        console.log("❌ Texte sélectionné vide");
        return;
    }
    
    console.log("✅ Texte sélectionné: '" + texteSel + "'");
    
    // Vérifier si cette entité est déjà anonymisée
    for (let i = 0; i < window.tabAnon.length; i++) {
        if (window.tabAnon[i].entite.trim() === texteSel && window.tabAnon[i].occurrences > 0) {
            console.log("ℹ️ Entité déjà anonymisée, affichage du menu contextuel");
            console.log("debSel:", debSel, "finSel:", finSel);
            
            // Trouver le match qui correspond à la sélection courante
            const result = trouverOccurrenceAnonyme(debSel, finSel);
            console.log("Résultat trouverOccurrenceAnonyme:", result);
            
            if (result) {
                const { idxPaire, matchIdx } = result;
                console.log("Menu exception à afficher pour idxPaire:", idxPaire, "matchIdx:", matchIdx);
                // Récupérer le span finsel pour passer à showMenuException
                const finselSpan = document.querySelector(".finsel");
                console.log("finselSpan:", finselSpan);
                if (finselSpan) {
                    setTimeout(() => {
                        const match = window.tabAnon[idxPaire]?.matchPositions?.[matchIdx];
                        if (match && match.isNonTraite) {
                            showMenuNonTraite(finselSpan, idxPaire, matchIdx);
                        } else {
                            showMenuException(finselSpan, idxPaire, matchIdx);
                        }
                    }, 10);
                }
            } else {
                console.log("❌ Aucun match trouvé pour la sélection");
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
        console.log("➕ Pas de ligne vide, création d'une nouvelle");
        window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
        idxLigneVide = window.tabAnon.length - 1;
    }
    
    // Remplit la ligne
    console.log("📝 Remplissage de la ligne " + idxLigneVide + " avec l'entité '" + texteSel + "'");
    window.tabAnon[idxLigneVide].entite = texteSel;
    
    affichTableauAnon();
    
    // Stocker l'index pour le focus après validSel()
    lastAnonLineToFocus = idxLigneVide;
    console.log("✅ Nouvelle entité ajoutée et tableau rafraîchi");
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

/**
 * Réindexe matchPositions depuis le DOM courant, sans modifier les classes.
 * Classifie chaque occurrence : anonymisée (debsel), exception (anon-exception), ou non-traitée.
 */
function reindexerMatchPositions(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.entite || !paire.entite.trim()) return;

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    let motsRecherche = tokenizeCommeSegmentation(paire.entite.trim());
    motsRecherche = motsRecherche.filter(t => t.trim() !== '');
    if (motsRecherche.length === 0) return;

    const spansNonVides = [];
    tousLesSpans.forEach((span, idx) => {
        const txt = span.textContent.trim();
        if (txt) spansNonVides.push({ span, txt, originalIdx: idx });
    });

    const matches = [];
    for (let i = 0; i <= spansNonVides.length - motsRecherche.length; i++) {
        let match = true;
        let spanIdx = i;
        let firstSpanIdx = spansNonVides[i].originalIdx;
        let lastSpanIdx = spansNonVides[i].originalIdx;

        for (let j = 0; j < motsRecherche.length; j++) {
            if (spanIdx >= spansNonVides.length) { match = false; break; }
            if (spansNonVides[spanIdx].txt === motsRecherche[j]) {
                lastSpanIdx = spansNonVides[spanIdx].originalIdx;
                spanIdx++;
            } else { match = false; break; }
        }

        if (match) {
            const firstSpan = tousLesSpans[firstSpanIdx];
            const estException = firstSpan.classList.contains('anon-exception');
            // 'anon' est la seule classe fiable pour distinguer une vraie anonymisation d'une simple
            // sélection à la souris : 'debsel' seul est aussi ajouté par survOk()/validSel() lors de
            // la sélection courante, ce qui faussait le compteur (1 "anonymisée" dès la sélection).
            const estAnon = firstSpan.classList.contains('anon');
            const isNonTraite = !estException && !estAnon;
            matches.push({ start: firstSpanIdx, end: lastSpanIdx, isException: estException, isNonTraite });
        }
    }

    paire.matchPositions = matches;

    // Marquer/démarquer les spans avec data-anon-nt (cursor pointer côté CSS)
    matches.forEach(m => {
        for (let i = m.start; i <= m.end; i++) {
            const s = tousLesSpans[i];
            if (!s) continue;
            if (m.isNonTraite) {
                s.setAttribute('data-anon-nt', 'true');
            } else {
                s.removeAttribute('data-anon-nt');
            }
        }
    });

    // Réinitialiser les index de navigation par catégorie
    paire.indexCourant_anon = -1;
    paire.indexCourant_exc  = -1;
    paire.indexCourant_non  = -1;
}

// Applique l'anonymisation pour une paire spécifique sur TOUTES les occurrences
function appliquerAnonymisationPour(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    
    if (!paire.entite.trim()) {
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
        const txt = span.textContent.trim();
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
            // Vérifier si la première occurrence est déjà marquée comme exception
            const firstSpan = tousLesSpans[firstSpanIdx];
            const estException = firstSpan ? firstSpan.classList.contains('anon-exception') : false;
            // isNonTraite = false : cette fonction va immédiatement ajouter debsel à tout non-exception
            matches.push({ start: firstSpanIdx, end: lastSpanIdx, isException: estException, isNonTraite: false });
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
                    
                    // Ajouter debsel/finsel uniquement pour les occurrences non-exception
                    if (!match.isException) {
                        if (i === match.start) {
                            tousLesSpans[i].classList.add('debsel');
                            if (paire.remplacement.trim()) {
                                tousLesSpans[i].dataset.pseudo = paire.remplacement;
                            }
                        }
                        if (i === match.end) {
                            tousLesSpans[i].classList.add('finsel');
                            if (paire.remplacement.trim()) {
                                tousLesSpans[i].dataset.pseudo = paire.remplacement;
                            }
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
        
        // Attacher les listeners pour les exceptions
        attacheExceptionListeners();
    } else {
        // Aucune occurrence trouvée, réinitialiser les valeurs
        window.tabAnon[idxPaire].occurrences = 0;
        window.tabAnon[idxPaire].matchPositions = [];
        window.tabAnon[idxPaire].indexCourant = 0;
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
    const counterBadge = document.querySelector(`.counter-badge[data-idx="${idx}"]`);
    if (counterBadge) {
        counterBadge.textContent = `${paire.indexCourant + 1}/${paire.occurrences}`;
    }
}

// Valide toutes les anonymisations en attente (lignes qui ont entité et remplacement mais pas validées)
async function validerAnonEnAttente() {
    // Garde contre les appels récursifs
    if (window._validerAnonEnCours) {
        return;
    }
    window._validerAnonEnCours = true;
    
    try {
        let compteurValides = 0;
        let compteurErreurs = 0;
        
        // Capturer la longueur du tableau au début pour éviter une boucle infinie si la taille change
        const tabAnonLength = window.tabAnon.length;
        
        // Parcourir toutes les lignes du tableau
        for (let i = 0; i < tabAnonLength; i++) {
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
            for (let j = 0; j < tabAnonLength; j++) {
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
    
    // NETTOYAGE ET TRI
    // Séparer les lignes en deux groupes
    const lignesValidees = window.tabAnon.filter(p => p.occurrences > 0 && p.remplacement.trim().length > 0);
    const lignesAttente = window.tabAnon.filter(p => !(p.occurrences > 0 && p.remplacement.trim().length > 0));
    
    // Trier chaque groupe alphabétiquement par entité
    lignesValidees.sort((a, b) => a.entite.localeCompare(b.entite, 'fr'));
    lignesAttente.sort((a, b) => a.entite.localeCompare(b.entite, 'fr'));
    
    // Garder les 3 premières lignes d'attente vides
    const lignesAttenteAvecVides = [];
    let compteurVides = 0;
    
    // Ajouter d'abord les lignes d'attente non vides
    lignesAttente.forEach(ligne => {
        if (ligne.entite.trim() !== "") {
            lignesAttenteAvecVides.push(ligne);
        }
    });
    
    // Ajouter les lignes vides (max 3 au final)
    while (compteurVides < 3) {
        lignesAttenteAvecVides.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [] });
        compteurVides++;
    }
    
    // Reconstruire le tableau complet : d'abord validées, puis en attente
    window.tabAnon = [...lignesValidees, ...lignesAttenteAvecVides];
    
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
    } finally {
        // 💾 Sauvegarder les changements dans l'entretien
        await sauvegarderTabAnonEnt();
        
        // Libérer le flag pour permettre les appels suivants
        window._validerAnonEnCours = false;
    }
}

// Navigation vers la prochaine occurrence d'une catégorie (anon | exc)
function allerCatSuivante(idx, cat) {
    const paire = window.tabAnon[idx];
    if (!paire || !paire.matchPositions || paire.matchPositions.length === 0) return;

    // Filtrer les matches de cette catégorie (avec leur index original)
    const matchesCat = [];
    paire.matchPositions.forEach((m, origIdx) => {
        if ((cat === 'anon' && !m.isException && !m.isNonTraite) ||
            (cat === 'exc' && m.isException) ||
            (cat === 'non' && m.isNonTraite)) {
            matchesCat.push({ origIdx });
        }
    });
    if (matchesCat.length === 0) return;

    // Avancer l'index de catégorie (cyclique)
    const indexKey = `indexCourant_${cat}`;
    if (paire[indexKey] === undefined) paire[indexKey] = -1;
    paire[indexKey] = (paire[indexKey] + 1) % matchesCat.length;

    // Synchroniser l'index global pour surlignerOccurrence
    paire.indexCourant = matchesCat[paire[indexKey]].origIdx;

    // Mettre à jour le bouton temporairement avec X/N
    const btn = document.querySelector(`.btn-nav-cat[data-idx="${idx}"][data-cat="${cat}"]`);
    if (btn) {
        const total = matchesCat.length;
        const current = paire[indexKey] + 1;
        btn.textContent = `${current}/${total}`;
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(() => { btn.textContent = `${total}`; }, 1800);
    }

    // Surligner et scroller vers l'occurrence
    surlignerOccurrence(idx);
}

// Navigation vers l'occurrence précédente d'une catégorie (anon | exc | non)
function allerCatPrecedente(idx, cat) {
    const paire = window.tabAnon[idx];
    if (!paire || !paire.matchPositions || paire.matchPositions.length === 0) return;

    const matchesCat = [];
    paire.matchPositions.forEach((m, origIdx) => {
        if ((cat === 'anon' && !m.isException && !m.isNonTraite) ||
            (cat === 'exc' && m.isException) ||
            (cat === 'non' && m.isNonTraite)) {
            matchesCat.push({ origIdx });
        }
    });
    if (matchesCat.length === 0) return;

    const indexKey = `indexCourant_${cat}`;
    if (paire[indexKey] === undefined) paire[indexKey] = 0;
    paire[indexKey] = (paire[indexKey] - 1 + matchesCat.length) % matchesCat.length;
    paire.indexCourant = matchesCat[paire[indexKey]].origIdx;

    const btn = document.querySelector(`.btn-nav-cat[data-idx="${idx}"][data-cat="${cat}"]`);
    if (btn) {
        const total = matchesCat.length;
        const current = paire[indexKey] + 1;
        btn.textContent = `${current}/${total}`;
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(() => { btn.textContent = `${total}`; }, 1800);
    }
    surlignerOccurrence(idx);
}

// Affiche les flèches ◄ ► autour du compteur actif, retire les précédentes
function clicCompteur(btn, idx, cat) {
    const memeCompteur = window._activeCounter &&
        window._activeCounter.idx === idx &&
        window._activeCounter.cat === cat;

    if (!memeCompteur) {
        // Supprimer les flèches existantes
        document.querySelectorAll('.fleche-nav-cat').forEach(f => f.remove());

        // Couleur selon la catégorie
        const couleurs = { anon: '#4caf50', exc: '#555', non: '#ff9800' };
        const couleur = couleurs[cat] || '#666';
        const style = `color:${couleur};background:none;border:none;cursor:pointer;padding:0 3px;font-size:9px;line-height:1;opacity:0.85;`;

        const fleche = (texte, fn) => {
            const b = document.createElement('button');
            b.className = 'fleche-nav-cat';
            b.textContent = texte;
            b.style.cssText = style;
            b.onclick = (e) => { e.stopPropagation(); fn(); };
            return b;
        };

        btn.parentNode.insertBefore(fleche('◄', () => allerCatPrecedente(idx, cat)), btn);
        btn.after(fleche('►', () => allerCatSuivante(idx, cat)));

        window._activeCounter = { idx, cat };
    }

    allerCatSuivante(idx, cat);
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
        const txt = span.textContent.trim();
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
        console.log("❌ trouverOccurrenceAnonyme: tabAnon non défini");
        return null;
    }
    
    console.log("🔍 Recherche occurrence: debSel=", debSel, "finSel=", finSel);
    
    // Parcourir toutes les paires anonymisées
    for (let idxPaire = 0; idxPaire < window.tabAnon.length; idxPaire++) {
        const paire = window.tabAnon[idxPaire];
        
        // Vérifier si cette paire a des occurrences
        if (!paire.matchPositions || paire.matchPositions.length === 0) {
            continue;
        }
        
        console.log(`  Paire ${idxPaire} (${paire.entite}): ${paire.matchPositions.length} match(es)`);
        
        // Chercher si la sélection correspond à l'un des matchPositions
        for (let matchIdx = 0; matchIdx < paire.matchPositions.length; matchIdx++) {
            const match = paire.matchPositions[matchIdx];
            
            console.log(`    Match ${matchIdx}: start=${match.start}, end=${match.end}`);
            
            // Cas 1: Match exact (débuts et fins identiques)
            if (debSel === match.start && finSel === match.end) {
                console.log("    ✅ Match exact trouvé!");
                return { idxPaire, matchIdx, match };
            }
            
            // Cas 1b: Match avec tolérance de ±1 (pour gérer les décalages d'indices)
            if (Math.abs(debSel - match.start) <= 1 && Math.abs(finSel - match.end) <= 1) {
                console.log("    ✅ Match avec tolérance trouvé!");
                return { idxPaire, matchIdx, match };
            }
            
            // Cas 2: debSel/finSel est juste après le match
            // (cas où le match inclut un espace avant le mot)
            if (debSel === match.end + 1 && finSel === match.end + 1) {
                console.log("    ✅ Match juste après trouvé!");
                return { idxPaire, matchIdx, match };
            }
            
            // Cas 3: debSel/finSel est inclus dans le match (pour un clic simple)
            if (debSel >= match.start && finSel <= match.end) {
                console.log("    ✅ Clic simple inclus dans le match!");
                return { idxPaire, matchIdx, match };
            }
        }
    }
    
    console.log("❌ Aucun match trouvé");
    return null;
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

async function chercherNomPropres() {
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
    
    // 💾 Sauvegarder les changements dans l'entretien si des noms propres ont été ajoutés
    if (nomsPropresTries.length > 0) {
        await sauvegarderTabAnonEnt();
    }
}    

function pointAnon() {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        return;
    }

    console.log(tabAnon)
}

// Recherche les occurrences d'une entité (bouton loupe)
async function rechercherOccurrences(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    
    if (!entite || !remplacement) return;
    
    const entiteVal = entite.value.trim();
    const remplacementVal = remplacement.value.trim();
    
    // Vérifier que au moins l'entité est remplie
    if (!entiteVal) {
        await question("⚠️ Veuillez remplir le champ Entité pour chercher.", ["OK"]);
        return;
    }
    
    // Sauvegarder les valeurs
    window.tabAnon[idx].entite = entiteVal;
    window.tabAnon[idx].remplacement = remplacementVal || ""; // Remplacement peut être vide
    
    // Appliquer l'anonymisation (cela va surligner les occurrences)
    appliquerAnonymisationPour(idx);
    
    // Rafraîchir le tableau pour que les boutons de navigation apparaissent
    affichTableauAnon();
    
    // Refocuser sur la textarea Entité pour mettre à jour l'affichage des boutons
    setTimeout(() => {
        const entiteRefocus = document.querySelector(`.input-entite[data-idx="${idx}"]`);
        if (entiteRefocus) {
            entiteRefocus.focus();
        }
    }, 50);
    
    if (window.tabAnon[idx].occurrences === 0) {
        await question(`⚠️ L'entité "${entiteVal}" n'a pas été trouvée dans le texte.`, ["OK"]);
    } else {
        // Scroll smooth vers la première occurrence
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        const paire = window.tabAnon[idx];
        if (paire.matchPositions && paire.matchPositions.length > 0) {
            const firstMatch = paire.matchPositions[0];
            const firstSpan = tousLesSpans[firstMatch.start];
            if (firstSpan) {
                firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

// Valide et applique l'anonymisation pour une ligne spécifique
async function validerLigneAnon(idx) {
    const entite = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacement = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    
    if (!entite || !remplacement) return;
    
    const entiteVal = entite.value.trim();
    const remplacementVal = remplacement.value.trim();
    
    // Vérifier que les deux champs sont remplis
    if (!entiteVal || !remplacementVal) {
        await question("⚠️ Veuillez remplir les champs Entité et Pseudo.", ["OK"]);
        return;
    }
    
    // Sauvegarder les valeurs
    window.tabAnon[idx].entite = entiteVal;
    window.tabAnon[idx].remplacement = remplacementVal;
    
    // Vérifier si cette entité n'est pas déjà anonymisée ailleurs
    if (verifierDoublonEntite(idx)) {
        await question(`⚠️ L'entité "${entiteVal}" est déjà anonymisée ailleurs.\n\nVeuillez rééditer la ligne existante.`, ["OK"]);
        return;
    }
    
    // Appliquer l'anonymisation
    appliquerAnonymisationPour(idx);
    
    // Désactiver l'édition si des occurrences ont été trouvées
    if (window.tabAnon[idx].occurrences > 0) {
        desactiverEditionLigne(idx);
        affichTableauAnon();
        
        // 💾 Sauvegarder les changements dans l'entretien
        await sauvegarderTabAnonEnt();
    } else {
        await question(`⚠️ L'entité "${entiteVal}" n'a pas été trouvée dans le texte.`, ["OK"]);
    }
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
async function pseudonymiserOccurrence(idxPaire, matchIdx) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) return;

    const match = paire.matchPositions[matchIdx];
    const tousLesSpans = document.querySelectorAll('[data-rk]');

    for (let i = match.start; i <= match.end; i++) {
        const span = tousLesSpans[i];
        if (!span) continue;
        span.classList.remove('anon-exception');
        span.classList.add('anon');
        span.removeAttribute('data-anon-nt');
        if (i === match.start) {
            span.classList.add('debsel');
            if (paire.remplacement.trim()) span.dataset.pseudo = paire.remplacement;
        }
        if (i === match.end) {
            span.classList.add('finsel');
            if (paire.remplacement.trim()) span.dataset.pseudo = paire.remplacement;
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

    menuDiv.innerHTML = `
        <div class="menu-item" onmousedown="pseudonymiserOccurrence(${idxPaire}, ${matchIdx}); document.getElementById('contextMenuException')?.remove();">
            ✓ Pseudonymiser cette occurrence
        </div>
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

// Synchronise le HTML courant (après modif DOM) vers tabHtml du process main
// Permet au corpus global de voir les changements sans attendre la sauvegarde complète
async function syncHtmlVersMainProcess() {
    if (!window.electronAPI || !window.electronAPI.getEntCur || !window.electronAPI.setHtml) return;
    if (typeof compactHtml !== 'function') return;
    try {
        const rkEnt = await window.electronAPI.getEntCur();
        if (rkEnt === null || rkEnt === undefined || rkEnt < 0) return;
        const html = await compactHtml();
        await window.electronAPI.setHtml(rkEnt, String(html).replace(/`/g, ''));
    } catch(e) {
        console.warn('[syncHtmlVersMainProcess] erreur:', e);
    }
}

// Initialise le listener sur la checkbox chkAnon pour gérer les exceptions
function initChkAnonListener() {
    const chkAnon = document.getElementById('chkAnon');
    if (!chkAnon) return;

    // Ajouter un listener au changement de la checkbox
    chkAnon.addEventListener('change', () => {
        if (chkAnon.checked) {
            // Mode pseudo activé, attacher les listeners
            attacheExceptionListeners();
        } else {
            // Mode pseudo désactivé, retirer les listeners
            const segments = document.getElementById("segments");
            if (segments && segments._exceptionClickHandler) {
                segments.removeEventListener("click", segments._exceptionClickHandler);
                segments.removeEventListener("contextmenu", segments._exceptionClickHandler);
                segments._exceptionClickHandler = null;
            }
        }
    });

    // Appeler une première fois au chargement si la checkbox est déjà cochée
    if (chkAnon.checked) {
        setTimeout(() => {
            attacheExceptionListeners();
        }, 100);
    }
}

////////////////////////////////////////////////////////////////////////
// NAVIGATION ENTRETIEN -> CORPUS
////////////////////////////////////////////////////////////////////////

// Sauvegarde l'état courant, ferme la fenêtre d'entretien et demande au panneau
// corpus de se positionner sur l'occurrence cible.
async function allerVueCorpus(idxPaire, matchIdx) {
    try {
        const paire = window.tabAnon ? window.tabAnon[idxPaire] : null;
        if (!paire || !paire.matchPositions || !paire.matchPositions[matchIdx]) {
            console.warn("allerVueCorpus: match invalide", idxPaire, matchIdx);
            return;
        }
        const match = paire.matchPositions[matchIdx];

        // Calculer le spanId (data-rk) du premier span du match
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        const spanCible = tousLesSpans[match.start];
        const spanId = spanCible ? spanCible.dataset.rk : null;

        // Sauvegarder l'état avant la fermeture
        if (typeof sauvegarderTabAnonEnt === 'function') {
            await sauvegarderTabAnonEnt();
        }
        if (typeof syncHtmlVersMainProcess === 'function') {
            await syncHtmlVersMainProcess();
        }

        const rkEnt = await window.electronAPI.getEntCur();
        await window.electronAPI.demandeVueCorpus({
            entite: paire.entite,
            pseudo: paire.remplacement,
            rkEnt,
            spanId
        });
    } catch (err) {
        console.error("Erreur dans allerVueCorpus:", err);
    }
}