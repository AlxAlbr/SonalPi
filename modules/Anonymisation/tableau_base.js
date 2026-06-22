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
          source: regle.source || 'Global', // Marquer comme venant du global
          portee: regle.portee || 'corpus' // règle venue du corpus ⇒ portée corpus (legacy ≡ corpus)
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
          source: 'Local',
          portee: regle.portee || 'corpus' // préserver la portée locale (legacy ≡ corpus)
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
      matchPositions: [],
      portee: 'brouillon' // nouvelle ligne de saisie = brouillon par défaut (R3)
    });
  }

  console.log(`✅ Fusion tabAnon : ${tabAnonGlobal?.length || 0} global(es) + ${tabAnonLocal?.length || 0} local(es) = ${result.length} total`, result);
  return result;
}

// Gère la validation/revalidation au clavier du champ Pseudo
function gererEntrePseudo(idx, versCorpus = false) {
    const paire = window.tabAnon[idx];

    // Ligne déjà appliquée :
    // - Shift+Entrée sur une ligne pas encore au corpus → promotion D→C (R5) ;
    // - sinon (Entrée, ou déjà corpus) → réconcilier via sauvAnon. Une modif réelle du nom/pseudo la
    //   repasse « en attente » (Cas 4) ; sans changement, no-op. Pas de ré-application silencieuse.
    if (paire.occurrences > 0) {
        if (versCorpus && (paire.portee || 'corpus') !== 'corpus') {
            promouvoirLigneAuCorpus(idx);
        } else {
            sauvAnon(idx);
        }
    } else {
        // Brouillon : valider en document (Entrée) ou corpus (Shift+Entrée).
        validerLigneAnon(idx, versCorpus ? 'corpus' : 'document');
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
        // Brouillon explicite (entité saisie, portée 'brouillon', occ=0) : conservé, c'est un draft
        // voulu et persisté (§7), pas une orpheline. La détection l'ignore déjà (occ reste 0).
        const estBrouillon = (paire.portee || 'corpus') === 'brouillon' && paire.entite && paire.entite.trim();
        const garde = aOccurrences || estVide || estGlobalEnAttente || estGlobalNonLocal || estBrouillon;
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

    // Brouillon parqué : pas de détection auto → reste occ=0 (aucun « à traiter »). Le repérage des
    // occurrences se fait à la demande via la loupe (§10ter), de façon non destructive.
    if ((paire.portee || 'corpus') === 'brouillon') {
        paire.matchPositions = [];
        paire.occurrences = 0;
        return;
    }

    const tousLesSpans = document.querySelectorAll('[data-rk]');
    const matches = trouverMatchesEntiteDOM(paire.entite, tousLesSpans);
    if (matches.length === 0) return;

    const pseudosLigne = pseudosDe(paire);
    const matchPositions = matches.map(({ start, end }) => {
        const firstSpan = tousLesSpans[start];
        const estException = firstSpan ? firstSpan.classList.contains('anon-exception') : false;
        const estAnon      = firstSpan ? firstSpan.classList.contains('anon') : false;
        // Anonymisé par une AUTRE règle (pseudo étranger) → occurrence incluse, ni anon propre ni à-traiter.
        const dp = firstSpan ? firstSpan.dataset.pseudo : '';
        const isIncluded = estAnon && !!dp && !pseudosLigne.some(p => p.toLowerCase() === dp.toLowerCase());
        const pseudoAbsorbe = (isIncluded && firstSpan && firstSpan.dataset.pseudoAbsorbe) || '';
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
        return { start, end, isException: estException, isNonTraite, isIncluded, pseudoAbsorbe };
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

// Légende repliable de l'entretien (même principe que l'encart corpus, cf.
// creerEncartLegendeCorpus) : déployée à la 1re ouverture de la session, puis garde le
// dernier état choisi (replié/déployé) pour le reste de la session.
function initLegendeAnonEntretien() {
    const header = document.getElementById('legende-anon-header');
    const btn = document.getElementById('legende-anon-toggle');
    const contenu = document.getElementById('legende-anon-contenu');
    if (!header || !btn || !contenu) return;

    if (typeof window._anonLegendeEntretienReduite === 'undefined') {
        window._anonLegendeEntretienReduite = false; // 1er rendu de la session → déployé
    }

    const appliquerEtat = (reduit) => {
        contenu.style.display = reduit ? 'none' : '';
        btn.textContent = reduit ? '▢' : '–';
        btn.title = reduit ? 'Agrandir' : 'Réduire';
    };
    appliquerEtat(window._anonLegendeEntretienReduite);

    // Brancher les écouteurs une seule fois (affichTableauAnon est rappelé souvent).
    if (!header.dataset.toggleInit) {
        header.dataset.toggleInit = '1';
        const toggle = () => {
            window._anonLegendeEntretienReduite = !window._anonLegendeEntretienReduite;
            appliquerEtat(window._anonLegendeEntretienReduite);
        };
        btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        header.addEventListener('click', toggle);
    }
}

// Résout les ENTITÉS (lignes du tableau) qui absorbent les occurrences incluses d'une règle :
// via le data-pseudo du span couvrant → la paire de tabAnon qui possède ce pseudo. Noms distincts.
// (Plan §F — helper mutualisé entretien/corpus pour le tooltip des incluses.)
function entitesAbsorbantes(matchPositions, spans) {
    const noms = new Set();
    (matchPositions || []).forEach(m => {
        if (!m.isIncluded || !spans) return;
        // Le span de début de l'incluse est souvent au MILIEU du run large (sans data-pseudo) :
        // remonter au debsel qui ouvre le run (sur 'anon' contigu) pour lire SON pseudo.
        let d = m.start;
        while (d >= 0 && spans[d] && spans[d].classList.contains('anon') && !spans[d].classList.contains('debsel')) d--;
        const dp = (d >= 0 && spans[d] && spans[d].dataset.pseudo) || '';
        if (!dp) return;
        const regle = (window.tabAnon || []).find(p => pseudosDe(p).some(x => x.toLowerCase() === dp.toLowerCase()));
        noms.add(regle && regle.entite ? regle.entite.trim() : dp);
    });
    return [...noms];
}

// Suffixe de tooltip pour les occurrences incluses (I-INC-4) :
// « — plus N absorbée(s) par « X » (non comptée(s) ici) ». Wording « plus / non comptée », jamais « dont ».
function suffixeTooltipIncluse(nbIncl, noms) {
    if (!nbIncl) return '';
    const s = nbIncl > 1 ? 's' : '';
    const par = (noms && noms.length === 1) ? ` par « ${_escAnonMenu(noms[0])} »`
        : (noms && noms.length > 1) ? ` par ${noms.map(n => `« ${_escAnonMenu(n)} »`).join(', ')}`
        : ' par une autre entité plus large';
    return ` — plus ${nbIncl} absorbée${s}${par} (non comptée${s} ici)`;
}

// Affichage du tableau d'anonymisation
// FILTRAGE : affiche les paires avec occurrences > 0, + les paires en cours de remplissage (entité sans occurrences), + lignes vides
function affichTableauAnon() {
    const tableauDiv = document.getElementById('tableauAnon');
    if (!tableauDiv) return;
    initLegendeAnonEntretien();
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
        // Incluse = absorbée par une autre règle : exclue du compteur « Anonymisé » (I-INC-5), signalée
        // seulement par l'exposant + tooltip. Comptée comme traitée (n'entre pas dans nbNon → ligne verte).
        const nbAnon = paire.matchPositions ? paire.matchPositions.filter(m => !m.isException && !m.isNonTraite && !m.isIncluded).length : 0;
        const nbExc  = paire.matchPositions ? paire.matchPositions.filter(m => m.isException).length : 0;
        const nbNon  = paire.matchPositions ? paire.matchPositions.filter(m => m.isNonTraite).length : 0;
        const nbIncl = paire.matchPositions ? paire.matchPositions.filter(m => m.isIncluded).length : 0;
        const estPending = nbNon > 0;
        // Ligne verte uniquement si toutes les occurrences sont traitées (anonymisées ou en exception)
        const estAnonymisee = aDesOccurrences && paire.remplacement.trim().length > 0 && nbNon === 0;

        // Compteur(s) « anonymisées » : pour une ligne MULTI-PSEUDO, un badge PAR variante (compté
        // depuis le DOM via data-pseudo) avec navigation propre (cat 'anon0'/'anon1') ; sinon un seul
        // badge agrégé (cat 'anon'). Exceptions / à-traiter restent partagés.
        const pseudosLigne = pseudosDe(paire);
        // Exposant + tooltip des incluses (I-INC-4), portés par le badge « Anonymisé » (mono : agrégé ;
        // multi : 1er badge rendu). nbIncl=0 → rien. Ligne entièrement absorbée (nbAnon=0) → aucun badge,
        // donc ni exposant ni tooltip (cas-bord assumé §2).
        let suffIncl = '', markIncl = '';
        if (nbIncl > 0) {
            const spansTous = document.querySelectorAll('[data-rk]');
            suffIncl = suffixeTooltipIncluse(nbIncl, entitesAbsorbantes(paire.matchPositions, spansTous));
            markIncl = '<sup class="badge-incl-mark">*</sup>';
        }
        let badgesAnonHtml = '';
        if (pseudosLigne.length > 1 && nbAnon > 0) {
            const spansLigne = document.querySelectorAll('[data-rk]');
            const compteVar = pseudosLigne.map(() => 0);
            const inclVar = pseudosLigne.map(() => 0); // incluses rattachées à leur variante d'origine
            let inclSansVar = 0;                       // incluses sans variante connue (Scénario B / périmée)
            paire.matchPositions.forEach(m => {
                if (m.isIncluded) {
                    // L'incluse est exclue du compteur (I-INC-5) mais signalée sur le badge de SA variante
                    // d'origine (pseudoAbsorbe, mémorisé à l'absorption).
                    const pa = (m.pseudoAbsorbe || '').toLowerCase();
                    const vi = pa ? pseudosLigne.findIndex(p => p.toLowerCase() === pa) : -1;
                    if (vi >= 0) inclVar[vi]++; else inclSansVar++;
                    return;
                }
                if (m.isException || m.isNonTraite) return;
                const dp = ((spansLigne[m.start] && spansLigne[m.start].dataset.pseudo) || '').toLowerCase();
                let vi = pseudosLigne.findIndex(p => p.toLowerCase() === dp);
                if (vi < 0) vi = 0; // pseudo inconnu/legacy → compté sur le primaire
                compteVar[vi]++;
            });
            // Une variante est affichée si elle a des occurrences réelles OU des incluses (→ badge « 0* »
            // quand son unique occurrence a été absorbée). Seules les incluses SANS variante connue se
            // replient sur le 1er badge rendu.
            const inclRepli = inclSansVar;

            const couleursVar = ['#4caf50', '#00897b']; // primaire = vert, alt = teal
            const nomsAbs = entitesAbsorbantes(paire.matchPositions, spansLigne);
            let premierRendu = true;
            badgesAnonHtml = pseudosLigne.map((p, vi) => {
                if (compteVar[vi] <= 0 && inclVar[vi] <= 0) return '';
                let nInc = inclVar[vi];
                if (premierRendu) { nInc += inclRepli; premierRendu = false; }
                const mark = nInc > 0 ? markIncl : '';
                const suff = nInc > 0 ? suffixeTooltipIncluse(nInc, nomsAbs) : '';
                return `<button class="btn-nav-cat btn-nav-cat-anon" data-idx="${i}" data-cat="anon${vi}" onclick="clicCompteur(this,${i},'anon${vi}')" style="background:${couleursVar[vi] || '#4caf50'};" title="${compteVar[vi]} occurrence(s) anonymisée(s) comme « ${_escAnonMenu(p)} »${suff} — cliquer pour naviguer">${compteVar[vi]}${mark}</button>`;
            }).join('');
        } else {
            badgesAnonHtml = nbAnon > 0
                ? `<button class="btn-nav-cat btn-nav-cat-anon" data-idx="${i}" data-cat="anon" onclick="clicCompteur(this,${i},'anon')" title="${nbAnon} occurrence(s) anonymisée(s)${suffIncl} — cliquer pour naviguer">${nbAnon}${markIncl}</button>`
                : '';
        }

        // Portée + classes de ligne : FOND = statut (vert/orange/gris brouillon), TYPO = portée
        // (gras = corpus, italique = brouillon). Slider montré dès qu'une entité est saisie.
        const portee = paire.portee || 'corpus';
        const montrerSlider = !!(paire.entite && paire.entite.trim());
        const classeFond = estAnonymisee ? 'ligne-anonymisee'
            : (estPending ? 'ligne-en-attente'
            : (portee === 'brouillon' && montrerSlider ? 'ligne-brouillon' : ''));
        const classeTypo = portee === 'corpus' ? 'p-corpus' : (portee === 'brouillon' ? 'p-brouillon' : '');

        // Affichage COMPACT de l'entité pour une longue sélection (« 6 mots […] 6 mots »). UNIQUEMENT
        // sur les lignes appliquées (occ>0) : leur valeur n'est lue qu'à l'édition (révélée au focus en
        // relisant window.tabAnon) → aucun risque. Les brouillons restent en texte plein (leur .value
        // est lue telle quelle par l'application).
        const entiteAffichee = aDesOccurrences ? tronquerEntiteAffichage(paire.entite) : paire.entite;
        const onfocusEntite = aDesOccurrences
            ? `this.value=window.tabAnon[${i}].entite;autoGrowTextarea(this);dsTxtArea=false;dsTxtAutre=true`
            : `dsTxtArea=false;dsTxtAutre=true`;
        const onfocusoutEntite = aDesOccurrences
            ? `this.value=tronquerEntiteAffichage(window.tabAnon[${i}].entite);autoGrowTextarea(this);dsTxtAutre=false`
            : `dsTxtAutre=false`;

        html += `
            <tr data-idx="${i}" class="ligne-anon${classeFond ? ' ' + classeFond : ''}${classeTypo ? ' ' + classeTypo : ''}">
                <td class="col-entite">
                    <textarea
                           class="input-entite textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}"
                           data-idx="${i}"
                           placeholder="Entité"
                           onchange="sauvAnon(${i})"
                           oninput="autoGrowTextarea(this)"
                           onfocus="${onfocusEntite}"
                           onfocusout="${onfocusoutEntite}"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();repererOccurrences(${i})}"
                           >${entiteAffichee}</textarea>
                </td>
                <td class="col-remplacement">
                    <textarea
                           class="input-remplacement textarea-auto${estAnonymisee ? ' textarea-disabled' : ''}"
                           data-idx="${i}"
                           placeholder="Pseudo"
                           onchange="sauvAnon(${i})"
                           oninput="autoGrowTextarea(this)"
                           onfocus="dsTxtArea=false;dsTxtAutre=true"
                           onfocusout="dsTxtAutre=false"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();gererEntrePseudo(${i}, event.shiftKey)}"
                           >${pseudosDe(paire).join('/')}</textarea>
                </td>
                <td class="col-actions">
                    <div class="actions-stack-portee">
                        <div class="actions-container-new">
                            ${badgesAnonHtml}
                            ${nbExc > 0 ? `<button class="btn-nav-cat btn-nav-cat-exc" data-idx="${i}" data-cat="exc" onclick="clicCompteur(this,${i},'exc')" title="${nbExc} exception(s) — cliquer pour naviguer">${nbExc}</button>` : ''}
                            ${nbNon > 0 ? `<button class="btn-nav-cat btn-nav-cat-non" data-idx="${i}" data-cat="non" onclick="clicCompteur(this,${i},'non')" title="${nbNon} occurrence(s) non encore traitée(s) — cliquer pour naviguer">${nbNon}</button>` : ''}
                            ${aDesOccurrences
                                ? `<button class="btn-action btn-action-delete" onclick="supprimeLigneAnon(${i})" title="Supprimer"><span class="btn-main-icon">✖️</span></button>`
                                : (montrerSlider
                                    ? `${_reperageHtml(i, paire)}<button class="btn-action btn-action-delete" onclick="supprimeLigneAnon(${i})" title="Supprimer ce brouillon"><span class="btn-main-icon">✖️</span></button>`
                                    : '')}
                        </div>
                        ${montrerSlider ? _sliderPorteeHtml(i, portee) : ''}
                    </div>
                </td>
            </tr>
        `;
    }
    
    html += `
            </tbody>
        </table>
        <div style="margin-top: 10px; display: flex; gap: 5px;width:100%; position:sticky;bottom:0px;">
            <button class="btn-valider-anon-attente btnfonction btnlarge " onclick="validerAnonEnAttente('document')" title="Appliquer tous les brouillons dans cet entretien seulement (sans toucher au corpus)">
                Appliquer au doc 🚧→📄
            </button>
            <button class="btn-valider-anon-attente btnfonction btnlarge " onclick="validerAnonEnAttente('corpus')" title="Appliquer tous les brouillons ET créer les règles au corpus (partagé)">
                Applique au corpus 🚧→📁
            </button>
            <button class="btn-valider-anon-attente btnfonction btnlarge " style="flex:1;" onclick="ajouterNouvelleLigneAnon()">
                ➕
            </button>
   
            <input type="file" id="file-import-correspondance" multiple accept=".json" style="display: none;">
        </div>
    `;
    
    tableauDiv.innerHTML = html;

    // Passe ASYNCHRONE : marquer les sliders corpus « verrouillés » (entité partagée avec un autre
    // entretien → on ne peut pas quitter C, §6). Découplé du rendu sync car le test lit getEnt (IPC).
    marquerVerrousPortee();

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

  // Filtrer les lignes vides ET les « fantômes » : règles venues UNIQUEMENT du corpus
  // (source 'Global') jamais appliquées ni validées localement. Elles n'appartiennent pas à cet
  // entretien — la sauvegarde du flux d'ouverture les exclut déjà (gestion_entretiens.js), on
  // aligne ici la sauvegarde principale pour ne pas les graver (sinon elles s'accumulent dans le
  // tabAnon local et ressuscitent au corpus via reconstituerTabAnonGlobal). Elles restent dans le
  // corpus et reviennent par fusion à la réouverture, donc aucune perte.
  // ⚠️ Garde-fou occurrences===0 : une règle globale RÉELLEMENT appliquée cette session
  // (occurrences>0) doit être conservée (sinon on perdrait du travail).
  // ⚠️ Un BROUILLON explicite (portée 'brouillon', entité+pseudo, occ=0) est CONSERVÉ même s'il
  // ressemble à un fantôme : c'est un draft voulu et persisté (§7). Il ne fuit pas au corpus (les
  // chokepoints filtrent 'brouillon') et la détection l'ignore (reste occ=0).
  const lignesValides = window.tabAnon.filter(p =>
    p.entite && p.entite.trim().length > 0 &&
    p.remplacement && p.remplacement.trim().length > 0 &&
    ((p.portee || 'corpus') === 'brouillon' ||
     !(p.source === 'Global' && !p.existeLocalement && (p.occurrences || 0) === 0))
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
// Démarque toutes les occurrences d'une ligne et la repasse « en attente » (occurrences=0).
// affichTableauAnon re-scanne ensuite le texte démarqué et re-détecte les occurrences en
// « à traiter » (orange) — donc la ligne réapparaît en attente avec le bouton « Valider et
// appliquer ». Réutilisé par sauvAnon : vidage du nom (Cas 1) et modification d'une ligne déjà
// appliquée (Cas 4). anciensPseudos = pseudos AVANT modification (filet de sécurité multi-pseudo).
function demarquerLigneEtRemettreEnAttente(idx, anciensPseudos) {
    const paire = window.tabAnon[idx];
    if (!paire) return;
    const tousLesSpans = document.querySelectorAll('[data-rk]');

    // §G-bis : portées des runs possédés par CETTE règle (hors incluses), à libérer après nettoyage.
    const rangesLiberees = (paire.matchPositions || [])
        .filter(m => !m.isIncluded).map(m => ({ start: m.start, end: m.end }));

    // 1. Démarquage par positions exactes (matchPositions) — couvre anon ET anon-exception.
    if (paire.matchPositions && paire.matchPositions.length > 0) {
        paire.matchPositions.forEach(match => {
            if (match.isIncluded) return; // span possédé par la règle LARGE — ne pas percer son run (I-INC-2)
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    tousLesSpans[i].classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                    tousLesSpans[i].removeAttribute('data-anon-nt');
                    delete tousLesSpans[i].dataset.pseudo;
                }
            }
        });
    }

    // 2. Filet de sécurité via les anciens pseudos (matchPositions vide/périmé). Multi-pseudo :
    //    couvrir CHAQUE pseudo autorisé (primaire ET alt).
    const pseudosBas = (anciensPseudos || []).map(p => (p || '').toLowerCase()).filter(Boolean);
    if (pseudosBas.length > 0) {
        tousLesSpans.forEach(span => {
            const dp = (span.dataset.pseudo || '').toLowerCase();
            if (dp && pseudosBas.includes(dp)) {
                span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
                span.removeAttribute('data-anon-nt');
                delete span.dataset.pseudo;
            }
        });
    }

    // §G-bis / Partie 2 : runs retirés → RESTAURER les occurrences absorbées (pseudo réaligné).
    rangesLiberees.forEach(r => restaurerAbsorbeesDansPortee(r.start, r.end, idx));

    // 3. Reset → « en attente ». Le re-scan « à traiter » est fait par affichTableauAnon
    //    (reindexerMatchPositions) tant que l'entité reste renseignée.
    paire.occurrences = 0;
    paire.matchPositions = [];
    paire.indexCourant = 0;
    affichTableauAnon();
    sauvegarderTabAnonEnt();
}

function sauvAnon(idx) {
    const entiteInput = document.querySelector(`.input-entite[data-idx="${idx}"]`);
    const remplacementInput = document.querySelector(`.input-remplacement[data-idx="${idx}"]`);
    if (!entiteInput || !remplacementInput) return;

    const paire = window.tabAnon[idx];
    if (!paire) return;

    const ancienneEntite = (paire.entite || '').trim();
    const ancienRemplacement = (paire.remplacement || '').trim();
    // Pseudos AVANT modification (primaire + alt) — capturés avant l'écrasement de paire ci-dessous.
    const anciensPseudos = pseudosDe(paire);
    let nouvelleEntite = entiteInput.value.trim();
    // Garde-fou « affichage compact » : sauvAnon est déclenché par l'onchange de N'IMPORTE quel champ
    // de la ligne (y compris le pseudo). Si le textarea Entité montre la version TRONQUÉE (« … […] … »,
    // non éditée) d'une entité longue, ne PAS écraser l'entité complète par ce placeholder.
    if (nouvelleEntite && nouvelleEntite === tronquerEntiteAffichage(ancienneEntite)
        && nouvelleEntite !== ancienneEntite) {
        nouvelleEntite = ancienneEntite;
    }
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
    // → démarquer + reset. L'entité étant désormais vide, affichTableauAnon ne re-scanne pas :
    //   les 3 compteurs (anon / exc / non) disparaissent.
    if (ancienneEntite && !nouvelleEntite && aOccurrences) {
        demarquerLigneEtRemettreEnAttente(idx, anciensPseudos);
        return;
    }

    // Cas 2 : on vide uniquement la case "Pseudo" d'une ligne déjà anonymisée
    // → les occurrences non-exception basculent en "à anonymiser" (isNonTraite),
    //   le compteur "anonymisées" devient "à anonymiser".
    if (ancienRemplacement && !nouveauRemplacement && aOccurrences
        && paire.matchPositions && paire.matchPositions.length > 0) {
        const tousLesSpans = document.querySelectorAll('[data-rk]');
        const rangesLiberees = paire.matchPositions
            .filter(m => !m.isIncluded && !m.isException).map(m => ({ start: m.start, end: m.end }));
        paire.matchPositions.forEach(match => {
            if (match.isIncluded) return; // span possédé par la règle LARGE — ne pas percer son run (I-INC-2)
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
        // §G-bis / Partie 2 : runs redevenus « à traiter » → RESTAURER les occurrences absorbées.
        rangesLiberees.forEach(r => restaurerAbsorbeesDansPortee(r.start, r.end, idx));
        affichTableauAnon();
        return;
    }

    // Cas 4 : on MODIFIE (sans vider) le nom ou le pseudo d'une ligne déjà appliquée.
    // → pour éviter une désynchro silencieuse (le texte garderait l'ANCIEN marquage alors que les
    //   champs montrent la NOUVELLE valeur), on démarque et on repasse la ligne « en attente » :
    //   l'utilisateur ré-applique explicitement via « Valider et appliquer ».
    if (aOccurrences && nouvelleEntite && nouveauRemplacement) {
        const memeEnsemble = (a, b) => {
            const na = a.map(p => (p || '').toLowerCase()).sort();
            const nb = b.map(p => (p || '').toLowerCase()).sort();
            return na.length === nb.length && na.every((v, k) => v === nb[k]);
        };
        const nomChange = nouvelleEntite.toLowerCase() !== ancienneEntite.toLowerCase();
        const pseudoChange = !memeEnsemble(pseudosDe(paire), anciensPseudos); // paire déjà à jour
        if (!nomChange && pseudoChange) {
            // SEUL le pseudo change (nom identique) → relabel EN PLACE (préserve les choix par occurrence).
            // Fallback démarquage si mapping ambigu (≥2 changements) ; 'annule' gère son propre revert.
            relabelPseudoEnPlace(idx, anciensPseudos).then(r => {
                if (r === 'ambigu') demarquerLigneEtRemettreEnAttente(idx, anciensPseudos);
            });
            return;
        }
        if (nomChange || pseudoChange) {
            demarquerLigneEtRemettreEnAttente(idx, anciensPseudos);
            return;
        }
    }

    // Cas 3 : entité + pseudo remplis mais ligne non encore validée (occurrences = 0).
    // → rafraîchir le tableau pour que reindexerMatchPositions détecte les occurrences
    //   présentes dans le texte et affiche le badge orange "à traiter".
    if (nouvelleEntite && nouveauRemplacement && !aOccurrences) {
        affichTableauAnon();
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
        ligne.classList.remove('ligne-en-attente');
        ligne.classList.add('ligne-anonymisee');
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

    // Garde-fou « règle partagée » (cohérent avec le 🔒 du slider, §6) : une entité réellement
    // TRAITÉE (anonymisée ou exception) dans un AUTRE entretien ne peut pas être supprimée ici —
    // sinon on retirerait localement une règle dont d'autres entretiens dépendent. Il faut d'abord
    // la ramener à un seul entretien, ou la supprimer depuis le panneau Pseudos.
    if (paireSupprimee && paireSupprimee.entite && paireSupprimee.entite.trim()
        && !(await regleEstIsolee(paireSupprimee.entite))) {
        await question(
            `La règle « ${paireSupprimee.entite} » est utilisée (anonymisée ou en exception) dans plusieurs entretiens 🔒.\n\n` +
            `Impossible de la supprimer ici. Ramenez-la d'abord à un seul entretien, ou supprimez-la depuis le panneau « Pseudos ».`,
            ['OK']);
        return;
    }

    if (paireSupprimee) {
        const tousLesSpans = document.querySelectorAll('[data-rk]');

        // §G-bis : portées des runs possédés par CETTE règle (hors incluses), pour libérer après
        // nettoyage les occurrences que ces runs absorbaient (→ re-bascule en 'non-traité', I-INC-7).
        const rangesLiberees = (paireSupprimee.matchPositions || [])
            .filter(m => !m.isIncluded).map(m => ({ start: m.start, end: m.end }));

        // 1. Nettoyer via matchPositions (indices NodeList exacts) — couvre aussi anon-exception
        if (paireSupprimee.matchPositions && paireSupprimee.matchPositions.length > 0) {
            paireSupprimee.matchPositions.forEach(match => {
                if (match.isIncluded) return; // span possédé par la règle LARGE — ne pas percer son run (I-INC-2)
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

        // §G-bis / Partie 2 : les spans des runs retirés sont redevenus nus → RESTAURER les
        // occurrences que ces runs absorbaient (pseudo réaligné sur la règle courante).
        rangesLiberees.forEach(r => restaurerAbsorbeesDansPortee(r.start, r.end, idx));
    }

    // Supprimer la ligne du tableau
    window.tabAnon.splice(idx, 1);

    affichTableauAnon();

    // 💾 Sauvegarder les changements dans l'entretien
    await sauvegarderTabAnonEnt();

    // Si l'entité a une règle au corpus qui ne concerne QUE cet entretien, proposer de la
    // supprimer aussi (évite l'accumulation de règles qui réapparaîtraient à la ré-ouverture).
    if (paireSupprimee && paireSupprimee.entite && paireSupprimee.entite.trim()) {
        await proposerSuppressionRegleCorpusSiIsolee(paireSupprimee.entite, pseudosDe(paireSupprimee).join('/'));
    }
}

// Cas étroit (cf. analyse) : à la suppression d'une ligne dans l'entretien, si l'entité a une règle
// au CORPUS et qu'AUCUN autre entretien ne l'APPLIQUE réellement (occurrences>0) — donc ni
// marquage orphelin ailleurs — proposer de supprimer aussi la règle corpus, et nettoyer les
// entrées fantômes (occurrences=0, simples copies de la règle corpus) pour éviter sa résurrection
// via reconstituerTabAnonGlobal. Les règles réellement PARTAGÉES sont laissées intactes : leur
// nettoyage propre vit au panneau Pseudos (filtre « Inutilisées » + suppression qui réécrit tout).
// Une règle est « réellement traitée » dans un entretien si AU MOINS une de ses occurrences y est
// ANONYMISÉE OU mise en EXCEPTION — cohérent avec la notion de « traité » du reste du logiciel
// (ligne verte = nbNon === 0 = plus aucune « à anonymiser »). On exclut donc les « à anonymiser »
// (non-traité) et les incluses (absorbées par une autre règle). C'est ce qui définit une entité
// PARTAGÉE : la règle corpus porte du travail ailleurs. Une entité juste repérée/à-traiter ne compte pas.
function _aOccurrenceTraitee(r) {
    return !!(r && r.entite && Array.isArray(r.matchPositions) &&
        r.matchPositions.some(m => m && !m.isNonTraite && !m.isIncluded));
}

// True si AUCUN entretien AUTRE que le courant n'a réellement TRAITÉ cette entité (anonymisée ou
// exception, cf. _aOccurrenceTraitee). Les fantômes (occ=0) et les « à anonymiser » ne comptent pas.
// Partagé : suppression de ligne isolée ET garde-fou du slider « quitter C » (§6).
async function regleEstIsolee(entite) {
    if (!entite || !entite.trim()) return true;
    const rkCur = await window.electronAPI.getEntCur();
    const tabEnt = await window.electronAPI.getEnt() || [];
    const estUsageReel = r => r && r.entite && cleEntite(r.entite) === cleEntite(entite) && _aOccurrenceTraitee(r);
    return !tabEnt.some((ent, i) =>
        i !== rkCur && ent && Array.isArray(ent.tabAnon) && ent.tabAnon.some(estUsageReel));
}

// Retire la règle corpus d'une entité + nettoie les fantômes (occ=0) dans TOUS les entretiens (sinon
// reconstituerTabAnonGlobal la ressusciterait). Partagé : suppression de ligne isolée ET downgrade
// C→D / C→B du slider. Données seulement (pas de marquage HTML) → sûr.
async function retirerRegleCorpusEtFantomes(entite) {
    const aJour = (await window.electronAPI.getAnon() || [])
        .filter(r => !(r && r.entite && cleEntite(r.entite) === cleEntite(entite)));
    await persisterReglesCorpus(aJour);

    const tabEnt = await window.electronAPI.getEnt() || [];
    let modifie = false;
    tabEnt.forEach(ent => {
        if (ent && Array.isArray(ent.tabAnon)) {
            const avant = ent.tabAnon.length;
            ent.tabAnon = ent.tabAnon.filter(r =>
                !(r && r.entite && cleEntite(r.entite) === cleEntite(entite) && (r.occurrences || 0) === 0));
            if (ent.tabAnon.length !== avant) modifie = true;
        }
    });
    if (modifie) await window.electronAPI.setEnt(tabEnt);
}

async function proposerSuppressionRegleCorpusSiIsolee(entite, pseudosTxt) {
    try {
        if (!window.electronAPI || !entite || !entite.trim()) return;

        // 1. Existe-t-il une règle corpus pour cette entité ? Sinon : ligne purement locale.
        const reglesCorpus = await window.electronAPI.getAnon() || [];
        if (!regleEnCollisionAlias(entite, reglesCorpus)) return;

        // 2. Règle réellement partagée (un autre entretien l'applique) → conservateur, on ne propose pas.
        if (!(await regleEstIsolee(entite))) return;

        // 3. Cas isolé : proposer la suppression de la règle au corpus.
        const rep = await question(
            `La règle « ${entite} → ${pseudosTxt} » n'est, pour l'instant, utilisée que dans cet entretien.\n\n` +
            `Supprimer aussi cette règle au niveau du corpus ?`,
            ['Oui', 'Non']);
        if (rep !== 'oui') return;

        // 4. Retrait corpus + nettoyage des fantômes (point d'entrée canonique).
        await retirerRegleCorpusEtFantomes(entite);
    } catch (e) {
        console.error("❌ proposerSuppressionRegleCorpusSiIsolee:", e);
    }
}

// Ajoute une nouvelle ligne au tableau
function ajouterNouvelleLigneAnon() {
    window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [], portee: 'brouillon' });
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
        window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [], portee: 'brouillon' });
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

    // Brouillon parqué : pas de (ré)indexation auto → reste occ=0 (aucun « à traiter »). Le repérage
    // se fait à la demande via la loupe (§10ter), sans marquage. Garde miroir de detecterOccurrencesNonTraitees.
    if ((paire.portee || 'corpus') === 'brouillon') {
        paire.matchPositions = [];
        paire.occurrences = 0;
        return;
    }

    const tousLesSpans = document.querySelectorAll('[data-rk]');

    // Détection + classification via la fonction UNIFIÉE (partagée avec le corpus) :
    // 'anon' / 'exception' / 'non-traite' ; les occurrences anonymisées par un autre pseudo
    // sont déjà exclues. On adapte simplement la sortie au format matchPositions de l'entretien.
    // Vue entretien : une seule passe doit couvrir TOUTES les variantes de la règle comme 'anon'
    // (sinon les occurrences en pseudo ALT seraient exclues — bug du compteur de variante au recount).
    const occ = analyserOccurrences(document, paire.entite, paire.remplacement, pseudosDe(paire), true);
    const matches = occ.map(o => ({
        start: o.indexDebut,
        end: o.indexFin,
        isException: o.etat === 'exception',
        isNonTraite: o.etat === 'non-traite',
        isIncluded: o.etat === 'incluse',
        pseudoAbsorbe: o.pseudoAbsorbe || ''
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

// Vrai si [s,e] est strictement à l'INTÉRIEUR d'un run ÉTRANGER plus large (déborde d'au moins un
// côté). Sert au principe « le large absorbe l'étroit » (Plan §A) : un match d'une règle étroite posé
// dans un run déjà ouvert par une règle large ne doit PAS être marqué → il reste incluse.
// Un run = debsel(pseudo) … [anon] … finsel(pseudo) ; seuls debsel/finsel portent data-pseudo.
function _runEtrangerEnglobe(spans, s, e, pseudosRegle) {
    if (!spans[s] || !spans[e]) return false;
    // Frontière d'un VRAI run d'anonymisation = debsel/finsel portant un data-pseudo (≠ marqueur de
    // sélection, qui n'en a pas). On ignore donc les debsel/finsel sans pseudo pendant le scan.
    const estDeb = sp => sp.classList.contains('debsel') && !!sp.dataset.pseudo;
    const estFin = sp => sp.classList.contains('finsel') && !!sp.dataset.pseudo;
    // Remonter au debsel qui ouvre le run contenant s (sur 'anon' contigu).
    let d = s;
    while (d >= 0 && spans[d] && spans[d].classList.contains('anon') && !estDeb(spans[d])) d--;
    if (d < 0 || !spans[d] || !spans[d].classList.contains('anon') || !estDeb(spans[d])) return false;
    const dp = spans[d].dataset.pseudo || '';
    const etranger = !!dp && !pseudosRegle.some(p => (p || '').toLowerCase() === dp.toLowerCase());
    if (!etranger) return false;
    // Descendre au finsel qui ferme le run à partir de e.
    let f = e;
    while (f < spans.length && spans[f] && spans[f].classList.contains('anon') && !estFin(spans[f])) f++;
    if (f >= spans.length || !spans[f] || !estFin(spans[f])) return false;
    return d < s || f > e; // run [d,f] déborde [s,e] → englobant
}

// Réindexe les règles AUTRES que idxSource dont au moins une occurrence chevauche [start,end].
// Pose d'une englobante → leurs occurrences absorbées basculent en 'incluse'. (Plan §A.3)
function recompterReglesChevauchant(start, end, idxSource) {
    if (!window.tabAnon) return;
    for (let j = 0; j < window.tabAnon.length; j++) {
        if (j === idxSource) continue;
        const p = window.tabAnon[j];
        if (!p || !p.matchPositions || !p.matchPositions.length) continue;
        if (p.matchPositions.some(m => m.start <= end && m.end >= start)) reindexerMatchPositions(j);
    }
}

// §G-bis / Partie 2 — au RETRAIT ou à l'ÉDITION d'une englobante (run nettoyé), RESTAURE les
// occurrences qu'elle absorbait : re-pose anon + debsel/finsel + pseudo depuis data-pseudo-absorbe,
// RÉALIGNÉ sur le pseudo COURANT de la règle (variante mémorisée si toujours valide, sinon primaire).
// Remplace l'ancien comportement « re-bascule en non-traité ». (anon.md §10)
function restaurerAbsorbeesDansPortee(start, end, idxSource) {
    if (!window.tabAnon) return;
    const spans = document.querySelectorAll('[data-rk]');
    for (let j = 0; j < window.tabAnon.length; j++) {
        if (j === idxSource) continue;
        const p = window.tabAnon[j];
        if (!p || !p.matchPositions || !p.matchPositions.length) continue;
        const pseudos = pseudosDe(p);
        let restaure = false;
        p.matchPositions.forEach(m => {
            if (!m.isIncluded || !(m.start <= end && m.end >= start)) return;
            // Réalignement : la variante mémorisée si elle existe encore dans la règle, sinon le primaire.
            const memo = (spans[m.start] && spans[m.start].dataset.pseudoAbsorbe) || m.pseudoAbsorbe || '';
            const pseudo = (memo && pseudos.some(x => x.toLowerCase() === memo.toLowerCase())) ? memo : (p.remplacement || '');
            for (let i = m.start; i <= m.end; i++) {
                const sp = spans[i]; if (!sp) continue;
                sp.classList.remove('anon-exception');
                sp.classList.add('anon');
                sp.removeAttribute('data-anon-nt');
                delete sp.dataset.pseudoAbsorbe; // consommé : l'occurrence est de nouveau marquée en propre
                if (i === m.start) { sp.classList.add('debsel'); if (pseudo) sp.dataset.pseudo = pseudo; }
                if (i === m.end)   { sp.classList.add('finsel'); if (pseudo) sp.dataset.pseudo = pseudo; }
            }
            restaure = true;
        });
        if (restaure) reindexerMatchPositions(j); // incluse → anon, compteurs à jour
    }
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

    // Purge des marqueurs de SÉLECTION résiduels : debsel/finsel SANS data-pseudo (la sélection de
    // texte réutilise ces classes). Sinon, sélectionner une entité À L'INTÉRIEUR d'un run existant
    // laisse un debsel/finsel parasite qui fausse la détection d'englobement (run large absorbe) et
    // le rendu. Un VRAI run d'anonymisation porte toujours un data-pseudo → préservé.
    tousLesSpans.forEach(span => {
        if (!span.dataset.pseudo && (span.classList.contains('debsel') || span.classList.contains('finsel'))) {
            span.classList.remove('debsel', 'finsel');
        }
    });

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

        const pseudosPaire = pseudosDe(paire);
        matches.forEach((match, matchIdx) => {
            // §A — « le large absorbe l'étroit » : si ce match est strictement à l'intérieur d'un run
            // ÉTRANGER plus large, on ne le marque PAS — il reste incluse (possédé par la règle large).
            if (_runEtrangerEnglobe(tousLesSpans, match.start, match.end, pseudosPaire)) {
                match.isIncluded = true;
                return;
            }
            // No-flatten multi-pseudo (I6) : si ce match porte déjà un pseudo AUTORISÉ (la variante
            // choisie par occurrence, ex. l'alt), on le conserve ; sinon on pose le primaire par
            // défaut. Lu sur le span de début (l'étape de nettoyage ci-dessus a retiré le data-pseudo
            // des occurrences en PRIMAIRE, donc seules les variantes alt subsistent ici).
            const dejaPose = tousLesSpans[match.start] ? tousLesSpans[match.start].dataset.pseudo : '';
            const pseudoMatch = (dejaPose && pseudosPaire.some(p => p.toLowerCase() === dejaPose.toLowerCase()))
                ? dejaPose : paire.remplacement;
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    // §A.1 Absorption : nettoyer tout marqueur d'une AUTRE règle dans la portée du run.
                    // Le data-pseudo de CETTE règle est préservé (no-flatten I6) ; seuls debsel/finsel
                    // étrangers portent un pseudo → détectables via dpI.
                    const dpI = tousLesSpans[i].dataset.pseudo;
                    if (dpI && !pseudosPaire.some(p => p.toLowerCase() === dpI.toLowerCase())) {
                        // Mémoriser la variante d'origine AVANT de l'effacer : sert à poser l'exposant
                        // sur le bon badge de variante, et (Partie 2) à restaurer le pseudo si on retire
                        // l'englobante. (Fondation §10)
                        tousLesSpans[i].dataset.pseudoAbsorbe = dpI;
                        delete tousLesSpans[i].dataset.pseudo;
                        tousLesSpans[i].classList.remove('debsel', 'finsel');
                    }
                    // Une exception ÉTRANGÈRE (anon-exception, sans data-pseudo) tombant dans un run
                    // ANONYMISÉ est absorbée : le texte EST anonymisé sous la règle large — pas
                    // d'exception possible à l'intérieur d'une entité plus grande (anon.md §10).
                    // Préservée seulement si CE run est lui-même une exception.
                    if (!match.isException) {
                        tousLesSpans[i].classList.remove('anon-exception');
                    }
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

        // §A.3 — après pose des runs, recompter les règles qui les chevauchent : leurs occurrences
        // désormais absorbées basculent en 'incluse'. (helper mutualisé avec le retrait/édition, §G-bis)
        matches.forEach(m => { if (!m.isIncluded) recompterReglesChevauchant(m.start, m.end, idxPaire); });

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
// porteeRequise : 'document' (bouton 🚧→📄, défaut) ou 'corpus' (bouton 🚧→📁). N'agit que sur les
// BROUILLONS (occ=0, champs remplis). Les lignes en conflit avec le corpus restent en attente
// (validation individuelle) → pas de divergence silencieuse en lot (I-POR-3), pour les deux modes.
async function validerAnonEnAttente(porteeRequise = 'document') {
    // Garde contre les appels récursifs
    if (window._validerAnonEnCours) {
        return;
    }
    window._validerAnonEnCours = true;

    try {
        let compteurValides = 0;
        let compteurErreurs = 0;
        let compteurConflits = 0; // conflits corpus non résolus en lot (à valider individuellement)
        const aPousserCorpus = []; // règles à créer au corpus (mode 🚧→📁, entités encore absentes)

        // Règles corpus, pour détecter les conflits (le dialogue « garder les deux » n'a pas lieu en
        // lot : on saute ces lignes et on invite à les valider une par une → pas de divergence silencieuse).
        const corpusRules = await window.electronAPI.getAnon() || [];

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

            // Conflit avec le corpus (pseudo hors ensemble autorisé) → ne PAS trancher en lot :
            // laisser la ligne en attente, l'utilisateur la validera individuellement (dialogue 2b).
            const cRegle = regleEnCollisionAlias(entiteVal, corpusRules);
            if (cRegle) {
                const cPseudos = pseudosDe(cRegle).map(p => p.toLowerCase());
                const sPseudos = pseudosDe({ remplacement: analyse.remplacement, remplacementAlt: analyse.remplacementAlt });
                if (sPseudos.some(p => !cPseudos.includes(p.toLowerCase()))) { compteurConflits++; continue; }
            }

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
                // Portée effective : corpus si demandé (🚧→📁) OU si l'entité est déjà une règle
                // corpus (cRegle) ; sinon document (local). Les nouvelles règles corpus sont poussées
                // en une fois après la boucle.
                window.tabAnon[i].portee = (porteeRequise === 'corpus' || cRegle) ? 'corpus' : 'document';
                if (window.tabAnon[i].portee === 'corpus' && !cRegle) aPousserCorpus.push(window.tabAnon[i]);
                compteurValides++;
            } else {
                compteurErreurs++;
            }
        }
    }
    
    // Pousser en UNE fois les nouvelles règles corpus (mode 🚧→📁). Corpus autoritaire : fusionnerRegles
    // n'écrase jamais un pseudo existant. Les conflits ont déjà été écartés (compteurConflits).
    if (aPousserCorpus.length > 0) {
        const corpus = await window.electronAPI.getAnon() || [];
        const fusionne = fusionnerRegles(corpus, aPousserCorpus.map(p => ({
            entite: p.entite, remplacement: p.remplacement, remplacementAlt: p.remplacementAlt
        })));
        await persisterReglesCorpus(fusionne);
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
    // Avertir (non silencieux) si des conflits corpus ont été laissés de côté.
    if (compteurConflits > 0) {
        await question(
            `${compteurConflits} entité(s) en conflit avec le corpus n'ont pas été validées en lot.\n\n` +
            `Validez-les individuellement (bouton ✓ de la ligne) pour choisir « Garder les deux » ou « Utiliser l'existant ».`,
            ['OK']);
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

            // Incluse = lecture seule (I-INC-3) : on ne la résout JAMAIS comme cible de clic. Le clic
            // retombe sur la règle LARGE qui possède réellement le span (anon.md §10) → pas de
            // re-marquage parasite à l'intérieur du run large.
            if (match.isIncluded) continue;

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

// Résout un éventuel conflit entre le(s) pseudo(s) saisi(s) et une règle CORPUS existante pour la même
// entité (alias). Renvoie { champs:{remplacement, remplacementAlt} } à appliquer, ou { annule:true }.
// Effet de bord assumé : « garder les deux » met à jour ET persiste le corpus. Partagé par
// validerLigneAnon et le relabel en place (sauvAnon Cas 4).
async function resoudreConflitCorpus(entiteVal, analyse) {
    let champs = { remplacement: analyse.remplacement, remplacementAlt: analyse.remplacementAlt };
    const corpusRules = await window.electronAPI.getAnon() || [];
    const corpusRegle = regleEnCollisionAlias(entiteVal, corpusRules);
    if (corpusRegle) {
        const corpusPseudos = pseudosDe(corpusRegle).map(p => p.toLowerCase());
        const saisiePseudos = pseudosDe({ remplacement: analyse.remplacement, remplacementAlt: analyse.remplacementAlt });
        const nouveaux = saisiePseudos.filter(p => !corpusPseudos.includes(p.toLowerCase()));
        if (nouveaux.length > 0) {
            const saisieLower = saisiePseudos.map(p => p.toLowerCase());
            const union = [...new Set([...corpusPseudos, ...saisieLower])];
            const manquants = corpusPseudos.filter(p => !saisieLower.includes(p)); // pseudos corpus absents de la saisie
            if (union.length <= 2 && manquants.length === 0) {
                // La saisie ÉTEND le corpus (conserve tous ses pseudos + ajoute un alt, total ≤ 2) :
                // intention NON ambiguë → garder les deux SANS dialogue. Persister l'alt au corpus.
                corpusRegle.remplacementAlt = nouveaux[0];
                await persisterReglesCorpus(corpusRules);
                return { champs: { remplacement: corpusRegle.remplacement, remplacementAlt: nouveaux[0] } };
            }
            const peutGarderLesDeux = !estMultiPseudo(corpusRegle) && saisiePseudos.length === 1;
            if (!peutGarderLesDeux) {
                // Impossible de fusionner sans dépasser 2 → aligner la ligne sur le corpus.
                await question(`L'entité « ${corpusRegle.entite} » a déjà « ${pseudosDe(corpusRegle).join(' / ')} » au corpus. ` +
                    `La ligne va utiliser ${corpusPseudos.length > 1 ? 'ces pseudonymes' : 'ce pseudonyme'}.`, ['OK']);
                champs = { remplacement: corpusRegle.remplacement, remplacementAlt: corpusRegle.remplacementAlt };
            } else {
                const nouveau = nouveaux[0];
                const rep = await question(
                    `L'entité « ${corpusRegle.entite} » est déjà au corpus avec « ${corpusRegle.remplacement} », ` +
                    `et vous saisissez « ${nouveau} ».\n\n` +
                    `• « Garder les deux » : l'entité aura deux pseudonymes, à choisir occurrence par occurrence ` +
                    `(ici ET dans les autres entretiens). Par défaut le pseudo « ${corpusRegle.remplacement} » est posé.\n` +
                    `• « Utiliser le pseudo du corpus » : aligner cette ligne sur « ${corpusRegle.remplacement} ».`,
                    ['Garder les deux', "Utiliser l'existant", 'Annuler']);
                if (rep === 'annuler') return { annule: true };
                if (rep === 'garder les deux') {
                    // Mettre à jour le CORPUS tout de suite (alt = nouveau) puis aligner la ligne dessus.
                    corpusRegle.remplacementAlt = nouveau;
                    await persisterReglesCorpus(corpusRules);
                    champs = { remplacement: corpusRegle.remplacement, remplacementAlt: nouveau };
                } else {
                    champs = { remplacement: corpusRegle.remplacement, remplacementAlt: corpusRegle.remplacementAlt };
                }
            }
        }
    }
    return { champs };
}

// Mapping ancien(minuscule)→nouveau pseudo pour un relabel, ou null si AMBIGU (≥2 changements
// simultanés). Cas nets : renommage (1↔1), retrait d'alt (→ primaire), ajout d'alt / swap (no-op).
function _mappingPseudoOuNull(anciensPseudos, nouveauxPseudos) {
    const Po = anciensPseudos.map(p => (p || '').toLowerCase());
    const Pn = nouveauxPseudos;
    const PnLower = Pn.map(p => p.toLowerCase());
    const removed = Po.filter(p => !PnLower.includes(p));
    const added = Pn.filter(p => !Po.includes(p.toLowerCase()));
    const map = {};
    Po.forEach(p => { const k = PnLower.indexOf(p); if (k >= 0) map[p] = Pn[k]; }); // inchangés
    if (removed.length === 1 && added.length === 1)      map[removed[0]] = added[0];  // renommage
    else if (removed.length === 1 && added.length === 0) map[removed[0]] = Pn[0];     // alt retiré → primaire
    else if (removed.length === 0)                       { /* ajout d'alt ou swap */ }
    else                                                 return null;                 // ≥2 changements → ambigu
    return map;
}

// Relabel EN PLACE des pseudos d'une ligne déjà appliquée quand SEUL le pseudo change (nom inchangé) :
// réécrit data-pseudo des occurrences sans démarquer → préserve les choix par occurrence (multi-pseudo).
// Renvoie true (fait), 'ambigu' (mapping ≥2 changements → l'appelant fait un démarquage) ou 'annule'.
// (anon.md §10 / affinage Cas 4)
async function relabelPseudoEnPlace(idx, anciensPseudos) {
    const paire = window.tabAnon[idx];
    if (!paire) return 'ambigu';
    const entiteVal = paire.entite;

    // Pré-contrôle d'ambiguïté sur les pseudos SAISIS (sans dialogue) : ≥2 changements → démarquage.
    if (_mappingPseudoOuNull(anciensPseudos, pseudosDe(paire)) === null) return 'ambigu';

    // Rejeu du conflit corpus (même dialogue que validerLigneAnon) sur les pseudos saisis (déjà dans paire).
    const res = await resoudreConflitCorpus(entiteVal, { remplacement: paire.remplacement, remplacementAlt: paire.remplacementAlt });
    if (res.annule) {
        // Revert : restaurer les anciens pseudos + ré-afficher (le champ repart de paire).
        paire.remplacement = anciensPseudos[0] || '';
        if (anciensPseudos[1]) paire.remplacementAlt = anciensPseudos[1]; else delete paire.remplacementAlt;
        affichTableauAnon();
        return 'annule';
    }
    appliquerChampsAPaire(paire, entiteVal, res.champs);

    // Mapping sur l'ensemble RÉSOLU (peut différer du saisi si aligné corpus) ; rare cas ambigu → démarquage.
    const map = _mappingPseudoOuNull(anciensPseudos, pseudosDe(paire));
    if (map === null) return 'ambigu';

    // Relabel DOM : occurrences réelles (data-pseudo) + incluses (data-pseudo-absorbe), via le mapping.
    const spans = document.querySelectorAll('[data-rk]');
    (paire.matchPositions || []).forEach(m => {
        if (m.isIncluded) {
            for (let i = m.start; i <= m.end; i++) {
                const sp = spans[i]; if (!sp || !sp.dataset.pseudoAbsorbe) continue;
                const cible = map[sp.dataset.pseudoAbsorbe.toLowerCase()];
                if (cible) sp.dataset.pseudoAbsorbe = cible;
            }
            return;
        }
        if (m.isException || m.isNonTraite) return;
        const sd = spans[m.start];
        const cible = sd && map[(sd.dataset.pseudo || '').toLowerCase()];
        if (!cible) return;
        if (spans[m.start]) spans[m.start].dataset.pseudo = cible;
        if (spans[m.end])   spans[m.end].dataset.pseudo = cible;
    });

    reindexerMatchPositions(idx);
    affichTableauAnon();
    await sauvegarderTabAnonEnt();
    return true;
}

// Pousse la règle d'une paire au corpus (ajout si absente — corpus autoritaire, jamais d'écrasement
// d'un pseudo existant ; les conflits sont résolus AVANT via resoudreConflitCorpus). Point d'entrée
// canonique : persisterReglesCorpus. Partagé par validerLigneAnon (Shift+Entrée), la promotion D→C
// et le slider (changerPorteeLigne).
async function pousserRegleAuCorpus(paire) {
    if (!paire || !paire.entite || !paire.remplacement) return;
    const corpusRules = await window.electronAPI.getAnon() || [];
    const fusionne = fusionnerRegles(corpusRules, [{
        entite: paire.entite, remplacement: paire.remplacement, remplacementAlt: paire.remplacementAlt
    }]);
    await persisterReglesCorpus(fusionne);
}

// Promotion d'une ligne déjà appliquée vers la portée corpus (D→C) : pousse au corpus + bascule la
// portée + rafraîchit. Sûr car une ligne 'document' n'a, par construction (I-POR-3), pas de règle
// corpus divergente pour son entité.
async function promouvoirLigneAuCorpus(idx) {
    const paire = window.tabAnon[idx];
    if (!paire) return;
    await pousserRegleAuCorpus(paire);
    paire.portee = 'corpus';
    affichTableauAnon();
    await sauvegarderTabAnonEnt();
}

// R2 — Re-validation à l'ouverture : une règle locale 'document' (appliquée) peut diverger d'une règle
// corpus apparue ENTRE-TEMPS (créée dans un autre entretien APRÈS la pose locale). I-POR-3 interdit cette
// divergence persistante → on la résout via le dialogue de conflit (resoudreConflitCorpus, réutilisé par
// relabelPseudoEnPlace, qui préserve les choix par occurrence), puis on bascule la ligne en corpus et on
// retire l'éventuel fantôme global redondant. Les BROUILLONS (occ=0) sont ignorés : leur divergence se
// résout à l'application. Appelée APRÈS detecterOccurrencesToutesLesPaires (matchPositions présents).
async function reconcilierPorteesDivergentesAOuverture() {
    if (!Array.isArray(window.tabAnon)) return;
    const corpusRules = await window.electronAPI.getAnon() || [];

    for (let idx = 0; idx < window.tabAnon.length; idx++) {
        const p = window.tabAnon[idx];
        if (!p || !p.entite || !p.remplacement) continue;
        if ((p.portee || 'corpus') === 'corpus') continue;   // déjà corpus
        if ((p.occurrences || 0) === 0) continue;            // brouillon : résolu à l'application
        const corpusRegle = regleEnCollisionAlias(p.entite, corpusRules);
        if (!corpusRegle) continue;                          // entité hors corpus → document légitime

        const corpusPseudos = pseudosDe(corpusRegle).map(s => s.toLowerCase());
        const diverge = pseudosDe(p).some(lp => !corpusPseudos.includes(lp.toLowerCase()));
        if (!diverge) { p.portee = 'corpus'; continue; }     // même pseudo → l'entité EST corpus

        // Divergence réelle → dialogue + réalignement du marquage (réutilise le relabel éprouvé).
        const anciensPseudos = pseudosDe(p);
        const r = await relabelPseudoEnPlace(idx, anciensPseudos);
        if (r === 'annule' || r === 'ambigu') {
            // Annulation / cas ambigu → alignement DUR sur le corpus (pas de divergence persistante).
            appliquerChampsAPaire(p, p.entite, { remplacement: corpusRegle.remplacement, remplacementAlt: corpusRegle.remplacementAlt });
            demarquerLigneEtRemettreEnAttente(idx, anciensPseudos);
            appliquerAnonymisationPour(idx);
        }
        p.portee = 'corpus';
    }

    // Retirer les fantômes globaux (occ=0) dont l'entité est désormais appliquée par une autre ligne.
    window.tabAnon = window.tabAnon.filter((p, i) =>
        !(p && p.source === 'Global' && !p.existeLocalement && (p.occurrences || 0) === 0 &&
          window.tabAnon.some((q, j) => j !== i && q && q.entite &&
              cleEntite(q.entite) === cleEntite(p.entite) && (q.occurrences || 0) > 0)));
}

////////////////////////////////////////////////////////////////////////
// SLIDER DE PORTÉE (brouillon 🚧 / document 📄 / corpus 📁) + repérage loupe
////////////////////////////////////////////////////////////////////////

// HTML du slider à icônes (§10). Pas de lettres — icônes seules. La poignée (cran actif) est posée
// par la classe portee-<etat> ; les transitions passent par changerPorteeLigne (gardes incluses).
function _sliderPorteeHtml(i, portee) {
    const cran = (c, emoji, titre) =>
        `<button class="portee-cran" data-cran="${c}" onclick="changerPorteeLigne(${i},'${c}')" title="${titre}">${emoji}</button>`;
    return `<div class="portee-slider portee-${portee}" data-idx="${i}">
        <span class="portee-thumb"></span>
        ${cran('brouillon', '🚧', 'Brouillon — pas encore appliqué')}
        ${cran('document', '📄', 'Document — cet entretien seulement')}
        ${cran('corpus', '📁', 'Corpus — partagé entre tous les entretiens')}
    </div>`;
}

// Contrôles de repérage d'une ligne brouillon : loupe seule, ou ◄ i/N ► si un repérage est en cours
// sur cette entité (§10ter). Non destructif : aucune application.
function _reperageHtml(i, paire) {
    const actif = _reperage && _reperage.entite && paire.entite &&
        cleEntite(_reperage.entite) === cleEntite(paire.entite) && _reperage.matches.length > 0;
    if (!actif) {
        return `<button class="btn-action" onclick="repererOccurrences(${i})" title="Repérer les occurrences (sans appliquer)"><span class="btn-main-icon">🔍</span></button>`;
    }
    const n = _reperage.matches.length, c = _reperage.cur + 1;
    return `<button class="btn-action btn-reperage" onclick="repererNav(${i},-1)" title="Occurrence précédente">◄</button>` +
        `<span class="reperage-pos" title="Occurrence repérée (non appliquée)">${c}/${n}</span>` +
        `<button class="btn-action btn-reperage" onclick="repererNav(${i},1)" title="Occurrence suivante">►</button>`;
}

// Marque (classe .verrou + 🔒 via CSS) les sliders de portée CORPUS dont l'entité est appliquée
// (occ>0) dans un AUTRE entretien : on ne peut alors pas quitter C (§6). Asynchrone (lit getEnt),
// appelée après chaque rendu — fire-and-forget. Le garde-fou réel reste dans changerPorteeLigne.
async function marquerVerrousPortee() {
    try {
        const sliders = document.querySelectorAll('.portee-slider.portee-corpus');
        if (!sliders.length || !window.electronAPI) return;
        const rkCur = await window.electronAPI.getEntCur();
        const tabEnt = await window.electronAPI.getEnt() || [];
        const partageesAilleurs = new Set();
        tabEnt.forEach((ent, i) => {
            if (i === rkCur || !ent || !Array.isArray(ent.tabAnon)) return;
            ent.tabAnon.forEach(r => {
                // Partagée = réellement anonymisée ailleurs (pas seulement « à anonymiser »).
                if (_aOccurrenceTraitee(r)) partageesAilleurs.add(cleEntite(r.entite));
            });
        });
        sliders.forEach(sl => {
            const idx = parseInt(sl.dataset.idx, 10);
            const paire = window.tabAnon[idx];
            const verrou = !!(paire && paire.entite && partageesAilleurs.has(cleEntite(paire.entite)));
            sl.classList.toggle('verrou', verrou);
        });
    } catch (e) {
        console.warn('[marquerVerrousPortee]', e);
    }
}

// État transitoire (non persisté) du repérage loupe en cours. Une seule ligne repérée à la fois.
let _reperage = null; // { entite, matches:[{start,end}], cur }

function _effacerSurlignageReperage() {
    document.querySelectorAll('.reperage-hit').forEach(s => s.classList.remove('reperage-hit'));
}
function _surlignerReperage(matchIdx) {
    _effacerSurlignageReperage();
    if (!_reperage || !_reperage.matches[matchIdx]) return;
    const spans = document.querySelectorAll('[data-rk]');
    const { start, end } = _reperage.matches[matchIdx];
    for (let k = start; k <= end; k++) if (spans[k]) spans[k].classList.add('reperage-hit');
    if (spans[start]) spans[start].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Loupe = repérage NON destructif : compte + surligne (transitoire) + scroll, SANS poser de marquage
// anon → la ligne reste brouillon (occ=0). Marche avec l'entité seule (pseudo facultatif).
function repererOccurrences(idx) {
    const paire = window.tabAnon[idx];
    if (!paire || !paire.entite || !paire.entite.trim()) return;
    // Ligne déjà appliquée : pas de repérage (les compteurs cliquables gèrent la navigation).
    if ((paire.occurrences || 0) > 0) return;
    const spans = document.querySelectorAll('[data-rk]');
    const matches = trouverMatchesEntiteDOM(paire.entite, spans);
    if (!matches.length) {
        _reperage = null; _effacerSurlignageReperage(); affichTableauAnon();
        question(`Aucune occurrence de « ${paire.entite} » trouvée dans le texte.`, ['OK']);
        return;
    }
    _reperage = { entite: paire.entite, matches: matches.map(m => ({ start: m.start, end: m.end })), cur: 0 };
    _surlignerReperage(0);
    affichTableauAnon();
}
function repererNav(idx, sens) {
    if (!_reperage || !_reperage.matches.length) return;
    const n = _reperage.matches.length;
    _reperage.cur = (_reperage.cur + sens + n) % n;
    _surlignerReperage(_reperage.cur);
    affichTableauAnon();
}

// Handler du slider : exécute la transition de portée (machine à états §3) avec garde §6 (quitter C)
// et conflit §5 (via validerLigneAnon pour les passages depuis brouillon).
async function changerPorteeLigne(idx, cible) {
    const paire = window.tabAnon[idx];
    if (!paire) return;
    const actuel = paire.portee || 'corpus';
    if (cible === actuel) return;

    // Toute transition met fin au repérage en cours.
    _reperage = null; _effacerSurlignageReperage();

    const applique = (paire.occurrences || 0) > 0;

    // Depuis BROUILLON (rien d'appliqué) → appliquer : lit les champs de saisie, gère le conflit corpus.
    if (!applique) {
        if (cible === 'document') return validerLigneAnon(idx, 'document');
        if (cible === 'corpus')   return validerLigneAnon(idx, 'corpus');
        return;
    }

    // Ligne APPLIQUÉE. Promotion vers corpus (D→C) : pousse au corpus + bascule.
    if (cible === 'corpus') return promouvoirLigneAuCorpus(idx);

    // cible ∈ {document, brouillon}. Si on QUITTE le corpus → garde-fou « règle isolée » (§6).
    if (actuel === 'corpus') {
        if (!(await regleEstIsolee(paire.entite))) {
            await question(
                `La règle « ${paire.entite} » est utilisée dans plusieurs entretiens.\n\n` +
                `Ramenez-la à un seul entretien avant de réduire sa portée.`, ['OK']);
            affichTableauAnon(); // re-cale le slider sur 📁
            return;
        }
        await retirerRegleCorpusEtFantomes(paire.entite);
    }

    if (cible === 'document') {
        paire.portee = 'document';
        affichTableauAnon();
        await sauvegarderTabAnonEnt();
        return;
    }
    if (cible === 'brouillon') {
        // Parquer : démarquer (occ→0) et conserver le brouillon (la garde détection brouillon
        // évite qu'il soit re-détecté en « à traiter »).
        demarquerLigneEtRemettreEnAttente(idx, pseudosDe(paire));
        paire.portee = 'brouillon';
        affichTableauAnon();
        await sauvegarderTabAnonEnt();
        return;
    }
}

// Valide et applique l'anonymisation pour une ligne spécifique.
// porteeRequise : 'document' (Entrée, défaut) ou 'corpus' (Shift+Entrée). La portée EFFECTIVE est
// forcée à 'corpus' dès que l'entité a (ou acquiert via le dialogue de conflit) une règle au corpus.
async function validerLigneAnon(idx, porteeRequise = 'document') {
    // Toute application met fin au repérage loupe en cours (surbrillance transitoire).
    _reperage = null; _effacerSurlignageReperage();

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

    // Analyser le(s) pseudo(s) saisis (multi-pseudo « a/b » + interdit I2).
    const analyse = analyserChampsEntitePseudo(entiteVal, remplacementVal);
    if (analyse.erreur) {
        await question("⚠️ " + analyse.erreur, ["OK"]);
        return;
    }

    // 2b — Conflit avec une règle du CORPUS (entité déjà pseudonymisée ailleurs) : aligner / garder
    // les deux / annuler. Logique extraite dans resoudreConflitCorpus (partagée avec le relabel Cas 4).
    const resConflit = await resoudreConflitCorpus(entiteVal, analyse);
    if (resConflit.annule) return;
    appliquerChampsAPaire(window.tabAnon[idx], entiteVal, resConflit.champs);

    // Vérifier si cette entité n'est pas déjà anonymisée ailleurs
    if (verifierDoublonEntite(idx)) {
        await question(`⚠️ L'entité "${entiteVal}" est déjà anonymisée ailleurs.\n\nVeuillez rééditer la ligne existante.`, ["OK"]);
        return;
    }
    
    // Appliquer l'anonymisation
    appliquerAnonymisationPour(idx);

    // Désactiver l'édition si des occurrences ont été trouvées
    if (window.tabAnon[idx].occurrences > 0) {
        // Portée EFFECTIVE : corpus si demandé (Shift+Entrée) OU si l'entité est (devenue, via le
        // dialogue de conflit « garder les deux ») une règle du corpus. Sinon document (local).
        const corpusApres = regleEnCollisionAlias(entiteVal, await window.electronAPI.getAnon() || []);
        const porteeEff = (porteeRequise === 'corpus' || corpusApres) ? 'corpus' : 'document';
        window.tabAnon[idx].portee = porteeEff;
        // Si corpus demandé pour une entité encore absente du corpus → l'y pousser maintenant.
        if (porteeEff === 'corpus' && !corpusApres) await pousserRegleAuCorpus(window.tabAnon[idx]);

        desactiverEditionLigne(idx);
        affichTableauAnon();

        // 💾 Sauvegarder les changements dans l'entretien
        await sauvegarderTabAnonEnt();
    } else {
        // Rien trouvé → rien d'appliqué : la ligne reste un brouillon (R6).
        window.tabAnon[idx].portee = 'brouillon';
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