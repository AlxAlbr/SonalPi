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
      const key = cleAnon(regle.entite, regle.remplacement);
      if (!map.has(key)) {
        map.set(key, {
          entite: regle.entite,
          remplacement: regle.remplacement,
          remplacementAlt: regle.remplacementAlt, // multi-pseudo : 2ᵉ pseudo autorisé (undefined si mono)
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
      const key = cleAnon(regle.entite, regle.remplacement);
      if (!map.has(key)) {
        map.set(key, {
          entite: regle.entite,
          remplacement: regle.remplacement,
          remplacementAlt: regle.remplacementAlt, // multi-pseudo : 2ᵉ pseudo autorisé (undefined si mono)
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
        // Multi-pseudo : l'alt local prime ; sinon on garde celui du corpus déjà posé.
        if (regle.remplacementAlt) existing.remplacementAlt = regle.remplacementAlt;
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
            // Mettre à jour le(s) pseudo(s) depuis le champ (gère « a/b » + interdit I2).
            const analyse = analyserChampsEntitePseudo(paire.entite, remplacement.value.trim());
            if (analyse.erreur) {
                question("⚠️ " + analyse.erreur, ["OK"]);
                return;
            }
            appliquerChampsAPaire(paire, paire.entite, analyse);
        }
        appliquerAnonymisationPour(idx);
        affichTableauAnon();
    } else {
        // Sinon, valider la ligne normalement
        validerLigneAnon(idx);
    }
}

// analyserChampsEntitePseudo (parse « a/b » + I2 + ≤2) est défini dans anon-regles.js (cœur
// partagé entretien/corpus). Ici on ne garde que l'écriture dans la paire de l'entretien.

// Écrit dans la paire le résultat d'analyserChampsEntitePseudo (entité + pseudo primaire + alt),
// en respectant I5 : remplacementAlt présent uniquement s'il existe.
function appliquerChampsAPaire(paire, entiteVal, analyse) {
    paire.entite = entiteVal;
    paire.remplacement = analyse.remplacement;
    if (analyse.remplacementAlt) paire.remplacementAlt = analyse.remplacementAlt;
    else delete paire.remplacementAlt;
}

// Tableau contenant les paires d'anonymisation
window.tabAnon = [];

// Index de la ligne à focus après ajout (pour éviter les conflits de focus lors de validSel)
var lastAnonLineToFocus = -1;

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
    // Présente si au moins un alias est trouvé (insensible à la casse).
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    return trouverMatchesEntiteDOM(entite, tousLesSpans).length > 0;
}

/**
 * Détecte automatiquement les occurrences de toutes les paires du tabAnon dans le texte
 * Utile pour initialiser les occurrences après la fusion de tabAnon
 */
/**
 * Pour une paire jamais validée (occurrences = 0) : trouve les occurrences dans le DOM
 * et les marque data-anon-nt (à traiter / orange) SANS appliquer le pseudo ni la classe anon.
 * L'application reste un geste volontaire (Enter / bouton Valider).
 */
function detecterOccurrencesNonTraitees(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.entite || !paire.entite.trim()) return;

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const matches = trouverMatchesEntiteDOM(paire.entite, tousLesSpans);
    if (matches.length === 0) return;

    const matchPositions = matches.map(({ start, end }) => {
        const firstSpan = tousLesSpans[start];
        const estException = firstSpan ? firstSpan.classList.contains('anon-exception') : false;
        const estAnon      = firstSpan ? firstSpan.classList.contains('anon') : false;
        const isNonTraite  = !estException && !estAnon;

        // Marquer les spans comme "à traiter" sans toucher aux classes CSS
        for (let i = start; i <= end; i++) {
            const s = tousLesSpans[i];
            if (!s) continue;
            if (isNonTraite) {
                s.setAttribute('data-anon-nt', 'true');
            } else {
                s.removeAttribute('data-anon-nt');
            }
        }
        return { start, end, isException: estException, isNonTraite };
    });

    paire.matchPositions = matchPositions;
    paire.occurrences    = matches.length; // non-zéro pour que la paire reste visible
    paire.indexCourant   = 0;
}

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
        if (txt) motsPresents.add(txt.toLowerCase()); // pré-filtrage insensible à la casse
    });
    console.log(`⚡ Pré-filtrage : ${motsPresents.size} mot(s) distinct(s) dans le texte`);

    let ignorees = 0;
    
    // Parcourir toutes les paires qui ont une entité définie
    for (let i = 0; i < window.tabAnon.length; i++) {
        const paire = window.tabAnon[i];
        if (paire.entite && paire.entite.trim()) {

            // ⚡ Vérifier qu'au moins UN alias a tous ses tokens présents dans le texte
            // (insensible à la casse) avant de lancer l'analyse fine (coûteuse) sur les spans.
            const tousPresents = parseAliases(paire.entite).some(al => {
                let tokens = tokenizeCommeSegmentation(al.trim()).filter(t => t.trim() !== '');
                return tokens.length > 0 && tokens.every(token => motsPresents.has(token.toLowerCase()));
            });

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
            // Pour les paires jamais validées (occurrences = 0) : détecter les occurrences
            // SANS appliquer le pseudo — elles restent "à traiter" (orange), l'application
            // reste un geste volontaire de l'utilisateur.
            if (paire.occurrences > 0) {
                reindexerMatchPositions(i);
            } else {
                detecterOccurrencesNonTraitees(i);
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
        // Ligne verte uniquement si toutes les occurrences sont traitées (anonymisées ou en exception)
        const estAnonymisee = aDesOccurrences && paire.remplacement.trim().length > 0 && nbNon === 0;
        
        html += `
            <tr data-idx="${i}" class="ligne-anon${estAnonymisee ? ' ligne-anonymisee' : estPending ? ' ligne-en-attente' : ''}">
                <td class="col-entite">
                    <textarea 
                           class="input-entite textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}"
                           data-idx="${i}"
                           placeholder="Entité"
                           onchange="sauvAnon(${i})"
                           oninput="autoGrowTextarea(this);mettreAJourBoutonRechercher(${i})"
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
                           oninput="autoGrowTextarea(this);mettreAJourBoutonRechercher(${i})"
                           onfocus="mettreAJourBoutonRechercher(${i});dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="cacherBoutonRechercher(${i});dsTxtAutre=false"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();gererEntrePseudo(${i})}"
                           ${estAnonymisee ? '' : ''}>${pseudosDe(paire).join('/')}</textarea>
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

    // Navigation corpus → entretien : activer le compteur sur l'occurrence cible.
    // On utilise les données sémantiques (entite, cat, index) — pas le span DOM,
    // qui peut avoir un data-rk différent après cleanHTML si le HTML était compact.
    if (window._pendingNavActivation) {
        const { entite, pseudo, cat, occIdxInCat } = window._pendingNavActivation;
        window._pendingNavActivation = null;
        if (entite && cat && window.tabAnon) {
            for (let idxPaire = 0; idxPaire < window.tabAnon.length; idxPaire++) {
                const paire = window.tabAnon[idxPaire];
                if (!paire.matchPositions || paire.matchPositions.length === 0) continue;
                if (paire.entite.trim() !== entite.trim()) continue;

                const catEffective = cat;
                let matchesCat = paire.matchPositions
                    .map((m, i) => ({ m, i }))
                    .filter(({ m }) =>
                        (cat === 'anon' && !m.isException && !m.isNonTraite) ||
                        (cat === 'exc'  &&  m.isException) ||
                        (cat === 'non'  &&  m.isNonTraite)
                    );

                if (matchesCat.length === 0) continue;

                // Clamp au cas où l'index serait hors limites (état différent entre corpus et entretien)
                const targetPosInCat = Math.min(occIdxInCat, matchesCat.length - 1);

                // Positionner juste avant : allerCatSuivante atterrira exactement sur cette occurrence
                paire[`indexCourant_${catEffective}`] = targetPosInCat - 1;

                const btn = document.querySelector(`.btn-nav-cat[data-idx="${idxPaire}"][data-cat="${catEffective}"]`);
                if (btn) clicCompteur(btn, idxPaire, catEffective);
                return;
            }
        }
    }
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

  // Supprimer les doublons (même entité + remplacement), clé canonique unique (cleAnon).
  // NB : on conserve l'objet `p` COMPLET (champs runtime de l'entretien local), donc on ne
  // peut pas utiliser fusionnerRegles ici (qui ne renvoie que {entite, remplacement}).
  const map = new Map();
  lignesValides.forEach(p => {
    const key = cleAnon(p.entite, p.remplacement);
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
    // Normaliser le pseudo saisi en primaire (+ alt) — gère le multi-pseudo « a/b ». Pas de blocage
    // I2 ici (édition en cours) : l'interdit est appliqué à la validation. paire.remplacement reste
    // un pseudo unique (I5), le 2ᵉ éventuel va dans remplacementAlt.
    const pseudosSaisis = parsePseudos(remplacementInput.value);
    const nouveauRemplacement = pseudosSaisis[0] || '';

    paire.entite = nouvelleEntite;
    paire.remplacement = nouveauRemplacement;
    if (pseudosSaisis[1]) paire.remplacementAlt = pseudosSaisis[1];
    else delete paire.remplacementAlt;

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

    // Cas 3 : entité + pseudo remplis mais ligne non encore validée (occurrences = 0).
    // → rafraîchir le tableau pour que reindexerMatchPositions détecte les occurrences
    //   présentes dans le texte et affiche le badge orange "à traiter".
    if (nouvelleEntite && nouveauRemplacement && !aOccurrences) {
        affichTableauAnon();
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
        ligne.classList.remove('ligne-en-attente');
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
    // Multi-pseudo : nettoyer chaque pseudo autorisé (primaire ET alt), sinon les occurrences
    // appliquées avec l'alt resteraient anonymisées après réactivation de l'édition.
    for (const pseudoAEffacer of (paire ? pseudosDe(paire) : [])) {

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
        // Invalider le scan corpus : une modification vient de la vue Entretien
        if (window._anonScanCache) {
            window._anonScanStale = true;
            window._anonIndexInverse = null; // l'index est périmé aussi
        }
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

        // 2. Filet de sécurité : balayer les spans encore marqués data-pseudo (cas où matchPositions
        //    serait vide/périmé). Multi-pseudo : couvrir CHAQUE pseudo autorisé (primaire ET alt).
        const pseudosAEffacer = pseudosDe(paireSupprimee).map(p => p.toLowerCase());
        if (pseudosAEffacer.length > 0) {
            tousLesSpans.forEach(span => {
                const dp = (span.dataset.pseudo || '').toLowerCase();
                if (dp && pseudosAEffacer.includes(dp)) {
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

/**
 * Réindexe matchPositions depuis le DOM courant, sans modifier les classes.
 * Délègue la détection + classification à la fonction unifiée analyserOccurrences
 * (anon / exception / non-traite) et adapte au format matchPositions de l'entretien.
 */
function reindexerMatchPositions(idxPaire) {
    const paire = window.tabAnon[idxPaire];
    if (!paire || !paire.entite || !paire.entite.trim()) return;

    const tousLesSpans = document.querySelectorAll('[data-rk]');

    // Détection + classification via la fonction UNIFIÉE (partagée avec le corpus) :
    // 'anon' / 'exception' / 'non-traite' ; les occurrences anonymisées par un autre pseudo
    // sont déjà exclues. On adapte simplement la sortie au format matchPositions de l'entretien.
    const occ = analyserOccurrences(document, paire.entite, paire.remplacement);
    const matches = occ.map(o => ({
        start: o.indexDebut,
        end: o.indexFin,
        isException: o.etat === 'exception',
        isNonTraite: o.etat === 'non-traite'
    }));

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

    // Retirer d'abord les classes de cette paire spécifique
    tousLesSpans.forEach(span => {
        if (span.dataset.pseudo === paire.remplacement) {
            span.classList.remove('debsel', 'finsel');
            delete span.dataset.pseudo;
        }
    });

    // Chercher TOUTES les occurrences (insensible à la casse + tous les alias « / »)
    const matches = trouverMatchesEntiteDOM(paire.entite, tousLesSpans).map(({ start, end }) => {
        // Vérifier si la première occurrence est déjà marquée comme exception
        const firstSpan = tousLesSpans[start];
        const estException = firstSpan ? firstSpan.classList.contains('anon-exception') : false;
        // isNonTraite = false : cette fonction va immédiatement ajouter debsel à tout non-exception
        return { start, end, isException: estException, isNonTraite: false };
    });
    
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
            // No-flatten multi-pseudo (I6) : si ce match porte déjà un pseudo AUTORISÉ (la variante
            // choisie par occurrence, ex. l'alt), on le conserve ; sinon on pose le primaire par
            // défaut. Lu sur le span de début (l'étape de nettoyage ci-dessus a retiré le data-pseudo
            // des occurrences en PRIMAIRE, donc seules les variantes alt subsistent ici).
            const dejaPose = tousLesSpans[match.start] ? tousLesSpans[match.start].dataset.pseudo : '';
            const pseudoMatch = (dejaPose && pseudosDe(paire).some(p => p.toLowerCase() === dejaPose.toLowerCase()))
                ? dejaPose : paire.remplacement;
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
                            if (pseudoMatch.trim()) {
                                tousLesSpans[i].dataset.pseudo = pseudoMatch;
                            }
                        }
                        if (i === match.end) {
                            tousLesSpans[i].classList.add('finsel');
                            if (pseudoMatch.trim()) {
                                tousLesSpans[i].dataset.pseudo = pseudoMatch;
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
            // Analyser le(s) pseudo(s) (multi-pseudo « a/b » + interdit I2). En lot : erreur → on saute.
            const analyse = analyserChampsEntitePseudo(entiteVal, remplacementVal);
            if (analyse.erreur) { compteurErreurs++; continue; }
            appliquerChampsAPaire(window.tabAnon[i], entiteVal, analyse);

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
    // Insensible à la casse + somme des occurrences de tous les alias « / » (spans mutualisés).
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    return trouverMatchesEntiteDOM(entite, tousLesSpans).length;
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

    // Analyser le(s) pseudo(s) saisis (multi-pseudo « a/b » + interdit I2) puis stocker.
    const analyse = analyserChampsEntitePseudo(entiteVal, remplacementVal);
    if (analyse.erreur) {
        await question("⚠️ " + analyse.erreur, ["OK"]);
        return;
    }
    appliquerChampsAPaire(window.tabAnon[idx], entiteVal, analyse);

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