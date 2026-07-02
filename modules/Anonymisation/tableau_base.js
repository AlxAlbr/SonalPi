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
          portee: regle.portee || 'corpus', // règle venue du corpus ⇒ portée corpus (legacy ≡ corpus)
          thematique: regle.thematique // thématique portée par la règle corpus (plan-thematiques-entites.md)
        });
      }
    });
  }

  // 2. Ajouter les règles du tabAnon local (qui peuvent surcharger les globales)
  if (tabAnonLocal && tabAnonLocal.length > 0) {
    tabAnonLocal.forEach(regle => {
      if (!regle.entite) return;
      // Sans pseudo : on ne charge QUE les brouillons en chantier (restaurés tels quels) ;
      // une vraie règle (document/corpus) exige toujours un pseudo.
      const estBrouillon = (regle.portee || 'corpus') === 'brouillon';
      if (!regle.remplacement && !estBrouillon) return;
      const key = cleAnon(regle.entite, regle.remplacement || '');
      if (!map.has(key)) {
        map.set(key, {
          entite: regle.entite,
          remplacement: regle.remplacement || '',
          remplacementAlt: regle.remplacementAlt, // multi-pseudo : 2ᵉ pseudo autorisé (undefined si mono)
          occurrences: regle.occurrences || 0,
          indexCourant: regle.indexCourant || 0,
          matchPositions: regle.matchPositions || [],
          source: 'Local',
          portee: regle.portee || 'corpus', // préserver la portée locale (legacy ≡ corpus)
          thematique: regle.thematique // thématique posée localement (portée document/brouillon)
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
        // Thématique : « corpus autoritaire » — la valeur du corpus (déjà posée en branche global)
        // fait foi pour une règle présente aux DEUX niveaux. On ne comble depuis le local QUE si le
        // corpus n'en a pas, pour éviter qu'une thématique locale périmée écrase un changement fait
        // au corpus (cf. divergence tracée). Les lignes document/brouillon (absentes du corpus)
        // passent par la branche d'insertion, pas par ce else : leur thématique locale reste affichée.
        if (regle.thematique && !existing.thematique) existing.thematique = regle.thematique;
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

  return result;
}

// Gère la validation/revalidation au clavier du champ Pseudo.
// shiftPressed = event.shiftKey. La portée visée dépend du réglage « priorité de validation » :
//  - priorité 'corpus' (défaut)    : Entrée → corpus,   Maj+Entrée → document ;
//  - priorité 'entretien'          : Entrée → document, Maj+Entrée → corpus (inversé).
function gererEntrePseudo(idx, shiftPressed = false) {
    const paire = window.tabAnon[idx];

    // Portée visée : Entrée applique la portée PRIORITAIRE réglée au corpus ; Maj inverse.
    const prioriteCorpus = (typeof getPrioriteValidation === 'function') && getPrioriteValidation() === 'corpus';
    const versCorpus = prioriteCorpus ? !shiftPressed : shiftPressed;

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
    
    if (!window.tabAnon) return;
    
    // Supprimer les paires qui ont une entité mais 0 occurrences
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
        // Matérialisée par un LIBELLÉ de locuteur (plan-locuteurs-pseudo.md) : une règle à 0 occurrence
        // de TEXTE mais dont un libellé est pseudonymisé n'est PAS orpheline (matérialisé = texte OU
        // libellé). Sinon elle est supprimée à la réouverture et disparaît du tableau.
        const aLibelle = (typeof aLibellePseudonymise === 'function') && aLibellePseudonymise(paire);
        const garde = aOccurrences || estVide || estGlobalEnAttente || estGlobalNonLocal || estBrouillon || aLibelle;
        return garde;
    });
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
    
    if (!window.tabAnon || window.tabAnon.length === 0) {
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

    let ignorees = 0;
    
    // Parcourir toutes les paires qui ont une entité définie
    for (let i = 0; i < window.tabAnon.length; i++) {
        const paire = window.tabAnon[i];
        if (paire.entite && paire.entite.trim()) {

            // Vérifier qu'au moins UN alias a tous ses tokens présents dans le texte
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

    // Suggestions de LIBELLÉS (plan-locuteurs-pseudo.md Étape 3) : marque « à pseudonymiser » les
    // libellés dont le nom matche une règle non-brouillon mais pas encore confirmés. Tourne à
    // l'ouverture ET au scan (les deux appellent cette fonction).
    detecterLibellesASuggerer();

}

/**
 * Compte, sur l'entretien OUVERT, le total des occurrences « à anonymiser » (isNonTraite),
 * toutes règles confondues (locales ET corpus présentes mais pas encore appliquées ici). Lit
 * window.tabAnon[].matchPositions, re-dérivé du DOM (source de vérité, anon.md §2) — même notion
 * exacte que le compteur orange `nbNon` de chaque ligne (affichTableauAnon). N'inclut NI les
 * incluses NI les exceptions (assumées). À appeler APRÈS detecterOccurrencesToutesLesPaires/
 * affichTableauAnon pour que matchPositions soit à jour.
 * @returns {{ total:number, lignes:Array<{entite:string, nb:number}> }}
 */
function compterAnonATraiterEntretien() {
    let total = 0;
    const lignes = [];
    (window.tabAnon || []).forEach(p => {
        if (!p || !p.entite || !p.entite.trim()) return;
        const nbNon = (p.matchPositions || []).filter(m => m && m.isNonTraite).length;
        if (nbNon > 0) { total += nbNon; lignes.push({ entite: p.entite, nb: nbNon }); }
    });
    return { total, lignes };
}

/**
 * « Vérifier l'entretien » (scan local, pendant du scan corpus) : re-scanne le texte courant contre
 * TOUTES les règles connues (locales + corpus), rafraîchit la table, puis affiche un bilan consolidé
 * « rien d'oublié » / « N à anonymiser ». Le DOM étant la source de vérité, le scan reflète l'état
 * réel après corrections.
 * ⚠️ Ne trouve que des occurrences d'entités DÉJÀ identifiées (une règle existe pour elles, ici ou au
 * corpus) — ce n'est PAS un détecteur de noms (pas de NER). « Rien d'oublié » = parmi les entités déjà
 * repérées.
 */
async function verifierEntretien() {
    // Re-normaliser le DOM AVANT de scanner : si l'utilisateur a édité le texte depuis l'ouverture
    // (saisie, corrections), des spans multi-tokens non éclatés subsistent. La détection les compte
    // (analyserOccurrences re-tokenise), mais le marquage (trouverMatchesEntiteDOM) les rate → une
    // occurrence « vue mais non marquable ». cleanHTML() éclate à nouveau en un span/token (et préserve
    // les marquages anon/data-pseudo) → le scan reflète le réel ET les occurrences redeviennent
    // applicables. C'est l'endroit sûr pour ça : action utilisateur explicite, pas à chaque frappe.
    if (typeof cleanHTML === 'function') cleanHTML();

    if (typeof detecterOccurrencesToutesLesPaires === 'function') detecterOccurrencesToutesLesPaires();
    if (typeof affichTableauAnon === 'function') affichTableauAnon();

    // Catch-all LIBELLÉS (plan-locuteurs-pseudo.md Étape 5b) : réaligner les libellés pseudonymisés sur
    // l'état courant des règles après re-locutarisation / dérive (cleanHTML & compactHtml préservent
    // loc-anon/data-locpseudo). Démarque les libellés orphelins, resynchronise les pseudos changés.
    await resynchroniserLibellesLocuteurs();

    const { total, lignes } = compterAnonATraiterEntretien();

    // Brouillons « parqués » ayant des occurrences réelles dans le texte : ce ne sont PAS des
    // « à anonymiser » (I-POR-4 : un brouillon ne le devient jamais seul, matchPositions=[]), mais un
    // brouillon non promu est un oubli potentiel → on le signale à part, comme rappel non bloquant.
    const brouillons = [];
    (window.tabAnon || []).forEach(p => {
        if (!p || !p.entite || !p.entite.trim()) return;
        if ((p.portee || 'corpus') !== 'brouillon') return;
        const nb = (typeof compterOccurrencesEntite === 'function') ? compterOccurrencesEntite(p.entite) : 0;
        if (nb > 0) brouillons.push({ entite: p.entite, nb });
    });

    const tronq = (typeof tronquerEntiteAffichage === 'function') ? tronquerEntiteAffichage : (t => t);
    const listeBrouillons = brouillons.length
        ? `\n\nℹ️ ${brouillons.length} brouillon(s) avec des occurrences non marquées (à promouvoir 🚧→📄/📁 si voulu) :\n` +
          brouillons.sort((a, b) => b.nb - a.nb).map(l => `• ${tronq(l.entite)} — ${l.nb}`).join('\n')
        : '';
    const noteNER = '\n\n(Rappel : la vérification ne couvre que les entités déjà repérées — ce n\'est pas une détection automatique de noms.)';

    if (total === 0) {
        const enTete = brouillons.length
            ? '✅ Aucune occurrence « à anonymiser » : prêt pour l\'export.'
            : '✅ Entretien tout vert : aucune occurrence « à anonymiser ».';
        await question(enTete + listeBrouillons + noteNER, ['OK']);
        return { total, lignes, brouillons };
    }

    const detail = lignes
        .sort((a, b) => b.nb - a.nb)
        .map(l => `• ${tronq(l.entite)} — ${l.nb}`)
        .join('\n');
    await question(
        `⚠️ ${total} occurrence(s) encore « à anonymiser » dans cet entretien :\n\n${detail}\n\n` +
        `Les lignes concernées sont en orange dans le panneau ci-dessous. Appliquez-les avant l'export.` +
        listeBrouillons + noteNER,
        ['OK']);
    return { total, lignes, brouillons };
}

// Initialisation du tableau d'anonymisation
function initAnon() {

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
    
    // UNE SEULE passe, dans l'ORDRE du tableau (tabAnon) : on mélange volontairement les lignes
    // validées (occurrences > 0) et les lignes en cours (0 occurrence) selon leur position réelle.
    // Ainsi, valider une ligne ne la fait PAS « sauter » en haut (UX : elle reste là où on l'a saisie).
    // Auparavant : 2 passes (occ>0 d'abord, puis 0 occ) → la validation déplaçait la ligne.
    for (let i = 0; i < window.tabAnon.length; i++) {
        const p = window.tabAnon[i];
        if (p.occurrences > 0) {
            indicesToDisplay.push(i);
        } else if (p.entite && p.entite.trim()) {
            // En cours de remplissage / brouillon. Pour les entrées globales non encore appliquées
            // localement, ne montrer que si l'entité est réellement présente dans le texte.
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
    
    // Précalcul (1×/rendu) des LIBELLÉS locuteurs : leur liste et leurs clés d'alias sont identiques
    // pour toutes les lignes → on évite un querySelectorAll + N×M clesAlias par ligne (cf. pastille 👤).
    const idxLibLoc = _indexerLibellesLocuteurs();

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
        // État LIBELLÉ locuteur de CET entretien (null / 'pending' / 'resolu') — sert à la pastille 👤 ET
        // à masquer la loupe de repérage (une entité qui n'est QUE locuteur n'a pas d'occurrence de texte
        // à repérer). Utilise l'index pré-calculé hors boucle.
        const etatLoc = _etatLocuteurLigne(paire, idxLibLoc);

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
            <tr data-idx="${i}" data-thematique="${(paire.thematique || '').trim()}" class="ligne-anon${classeFond ? ' ' + classeFond : ''}${classeTypo ? ' ' + classeTypo : ''}">
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
                            ${_badgeLocuteurHtml(etatLoc)}
                            ${aDesOccurrences
                                ? `<button class="btn-action btn-action-delete" onclick="supprimeLigneAnon(${i})" title="Supprimer"><span class="btn-main-icon">✖️</span></button>`
                                : (montrerSlider
                                    ? `${(nbNon > 0 || etatLoc) ? '' : _reperageHtml(i, paire)}<button class="btn-action btn-action-delete" onclick="supprimeLigneAnon(${i})" title="Supprimer ce brouillon"><span class="btn-main-icon">✖️</span></button>`
                                    : '')}
                        </div>
                        ${montrerSlider ? _sliderPorteeHtml(i, portee) : ''}
                        ${_badgeThematiqueHtml(i, paire)}
                    </div>
                </td>
            </tr>
        `;
    }
    
    html += `
            </tbody>
        </table>
        <div style="margin-top: 10px; display: flex; flex-direction:column; gap: 5px;width:100%; position:sticky;bottom:0px;">
            <div style="display:flex; gap:8px; width:100%; justify-content:center;">
                <button class="btn-valider-anon-attente btnfonction btnlarge " style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:auto; padding-bottom:6px !important; flex:1 1 auto; max-width:220px;" onclick="validerAnonEnAttente('document')" title="Appliquer tous les brouillons dans cet entretien seulement (sans toucher au corpus)">
                    <span>Appliquer au doc</span>
                    <span>🚧→📄</span>
                </button>
                <button class="btn-valider-anon-attente btnfonction btnlarge " style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:auto; padding-bottom:6px !important; flex:1 1 auto; max-width:220px;" onclick="validerAnonEnAttente('corpus')" title="Appliquer tous les brouillons ET créer les règles au corpus (partagé)">
                    <span>Applique au corpus</span>
                    <span>🚧→📁</span>
                </button>
            </div>
            <input type="file" id="file-import-correspondance" multiple accept=".json" style="display: none;">
        </div>
    `;
    
    tableauDiv.innerHTML = html;

    // Passe ASYNCHRONE : marquer les sliders corpus « verrouillés » (entité partagée avec un autre
    // entretien → on ne peut pas quitter C, §6). Découplé du rendu sync car le test lit getEnt (IPC).
    marquerVerrousPortee();

    // Recherche par thème (opt-in) : la case vit hors de #tableauAnon (survit au re-render). Brancher
    // l'écouteur une seule fois, puis (dé)masquer les lignes selon le terme courant + l'état actif/off.
    const rechThemeInput = document.getElementById('anon-ent-recherche');
    if (rechThemeInput && !rechThemeInput.dataset.themeInit) {
        rechThemeInput.dataset.themeInit = '1';
        rechThemeInput.addEventListener('input', _appliquerFiltreThemeEntretien);
    }
    _appliquerFiltreThemeEntretien();

    // Ajouter l'event listener pour l'import de fichiers
    const fileInput = document.getElementById('file-import-correspondance');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
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
        // Matérialisé = occurrences de TEXTE OU libellé de locuteur (plan-locuteurs-pseudo.md) : sinon,
        // dans un entretien pseudonymisé UNIQUEMENT par libellés, chkAnon resterait désactivé → les
        // listeners du menu clic-droit des libellés ne s'attacheraient pas.
        const aDesAnonymisations = window.tabAnon && window.tabAnon.some(p =>
            p.occurrences > 0 || (typeof aLibellePseudonymise === 'function' && aLibellePseudonymise(p)));
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
  // ⚠️ Un BROUILLON explicite (portée 'brouillon') est CONSERVÉ — y compris ENTITÉ SEULE, sans
  // pseudo : c'est un travail en chantier qu'on ne veut pas perdre (§7). Il ne fuit pas au corpus
  // (les chokepoints filtrent 'brouillon'), n'est jamais appliqué (occ=0) et la règle « vraie
  // anonymisation = pseudo requis » reste intacte (validerLigneAnon exige toujours un pseudo).
  const lignesValides = window.tabAnon.filter(p => {
    if (!p.entite || !p.entite.trim().length) return false;
    if ((p.portee || 'corpus') === 'brouillon') return true; // brouillon en chantier : gardé même sans pseudo
    return p.remplacement && p.remplacement.trim().length > 0 &&
           !(p.source === 'Global' && !p.existeLocalement && (p.occurrences || 0) === 0);
  });

  // Supprimer les doublons (même entité + remplacement), clé canonique unique (cleAnon).
  // NB : on conserve l'objet `p` COMPLET (champs runtime de l'entretien local), donc on ne
  // peut pas utiliser fusionnerRegles ici (qui ne renvoie que {entite, remplacement}).
  const map = new Map();
  lignesValides.forEach(p => {
    const key = cleAnon(p.entite, p.remplacement || ''); // brouillon entité-seule : remplacement vide
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
    // Propagation au LIBELLÉ (plan-locuteurs-pseudo.md Étape 5b) : entité vidée/renommée (Cas 1/4) ou
    // pseudo modifié → réaligner les libellés sur l'état courant des règles.
    resynchroniserLibellesLocuteurs();
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
        // Règle label-only (occ=0) : l'édition ne passe pas par relabelPseudoEnPlace (gardé sur occ>0)
        // → réaligner le libellé ici (plan-locuteurs-pseudo.md Étape 5b).
        resynchroniserLibellesLocuteurs();
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

    // Propagation au LIBELLÉ (plan-locuteurs-pseudo.md Étape 5) : plus de règle pour cette entité →
    // le libellé du locuteur se démarque (revient au vrai nom).
    await resynchroniserLibellesLocuteurs();

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
// Compte AUSSI la matérialisation par LIBELLÉ de locuteur (plan-locuteurs-pseudo.md) : une règle
// pseudonymisant un libellé « porte du travail » au même titre qu'une occurrence de texte.
function _aOccurrenceTraitee(r) {
    if (!r || !r.entite) return false;
    // Occurrence de TEXTE réellement traitée (anonymisée ou exception).
    if (Array.isArray(r.matchPositions) && r.matchPositions.some(m => m && !m.isNonTraite && !m.isIncluded)) {
        return true;
    }
    // Matérialisée par un LIBELLÉ : dans un entretien SAUVEGARDÉ, une règle qui appartient localement
    // (existeLocalement) à 0 occurrence de TEXTE et non-brouillon a sa matérialisation dans le libellé
    // → « utilisée ». Proxy data-only (le DOM des autres entretiens n'est pas chargé) : un libellé
    // confirmé persiste existeLocalement=true dans ent.tabAnon ; un simple fantôme corpus non confirmé
    // en est EXCLU à la sauvegarde d'ouverture (donc jamais compté ici).
    return !!(r.existeLocalement && (r.occurrences || 0) === 0 && (r.portee || 'corpus') !== 'brouillon');
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

// Ajoute une entité sélectionnée à la première ligne vide
function ajouteEntiteAnonSelectionnee() {
    
    // Vérifie qu'une sélection est active
    if (debSel <= 0 || finSel <= 0) {
        return;
    }
    
    // Récupère le texte sélectionné
    let texteSel = getTexteSelection(debSel, finSel);
    
    if (!texteSel) {
        return;
    }
    
    
    // Vérifier si cette entité est déjà anonymisée
    for (let i = 0; i < window.tabAnon.length; i++) {
        if (window.tabAnon[i].entite.trim() === texteSel && window.tabAnon[i].occurrences > 0) {
            
            // Trouver le match qui correspond à la sélection courante
            const result = trouverOccurrenceAnonyme(debSel, finSel);
            
            if (result) {
                const { idxPaire, matchIdx } = result;
                // Récupérer le span finsel pour passer à showMenuException
                const finselSpan = document.querySelector(".finsel");
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
        window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [], portee: 'brouillon' });
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
        
        // Chercher le match qui contient debSel ou qui est le plus proche
        let minDistance = Infinity;
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            
            // Si debSel ou finSel est dans le match
            if ((debSel >= match.start && debSel <= match.end) || 
                (finSel >= match.start && finSel <= match.end) ||
                (debSel <= match.start && finSel >= match.end)) {
                indexCourantMatch = i;
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
    // Séparer les lignes en deux groupes. « Validée » = matérialisée (occurrences de TEXTE OU libellé de
    // locuteur, plan-locuteurs-pseudo.md) avec un pseudo — sinon une règle label-only tomberait à tort
    // dans le groupe « en attente ».
    const estValidee = p => (p.occurrences > 0 || (typeof aLibellePseudonymise === 'function' && aLibellePseudonymise(p)))
        && p.remplacement && p.remplacement.trim().length > 0;
    const lignesValidees = window.tabAnon.filter(estValidee);
    const lignesAttente = window.tabAnon.filter(p => !estValidee(p));
    
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

            // Incluse = lecture seule (I-INC-3) : on ne la résout JAMAIS comme cible de clic. Le clic
            // retombe sur la règle LARGE qui possède réellement le span (anon.md §10) → pas de
            // re-marquage parasite à l'intérieur du run large.
            if (match.isIncluded) continue;

            
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
            
            // Cas 3: debSel/finSel est inclus dans le match (pour un clic simple)
            if (debSel >= match.start && finSel <= match.end) {
                return { idxPaire, matchIdx, match };
            }
        }
    }
    
    return null;
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
    // Propagation au LIBELLÉ (plan-locuteurs-pseudo.md Étape 5) : pseudo changé → réécrire data-locpseudo.
    await resynchroniserLibellesLocuteurs();
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
    // Un repérage crée un brouillon « en chantier » mais ne modifie PAS le HTML → le save-on-close
    // (basé sur un diff HTML) l'ignorerait. On signale donc une modif d'anonymisation en attente pour
    // que la fermeture écrive le .sonal (où vit l'anonymisation de l'entretien — cf. nettoyerTabAnon).
    window._tabAnonModifieEnAttente = true;
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
/**
 * Vrai si la règle matérialise au moins un LIBELLÉ de locuteur dans l'entretien courant (un `.ligloc`
 * `loc-anon` dont le nom matche un alias de l'entité). Un libellé pseudonymisé vaut « appliqué » au
 * même titre qu'une occurrence de texte (plan-locuteurs-pseudo.md) → indispensable au slider de portée.
 * @param {object} paire
 * @returns {boolean}
 */
function aLibellePseudonymise(paire) {
    if (!paire || !paire.entite) return false;
    const cles = new Set(clesAlias(paire.entite));
    if (cles.size === 0) return false;
    return Array.from(document.querySelectorAll('.ligloc.loc-anon[data-nomloc]')).some(lig =>
        clesAlias(lig.dataset.nomloc || '').some(k => cles.has(k)));
}

/**
 * Index (1×/rendu) des LIBELLÉS locuteurs de l'entretien, DÉDOUBLONNÉ par locuteur. Un locuteur est
 * pseudonymisé tout-ou-rien (les handlers confirmer/refuser/retirer marquent d'un coup TOUS ses
 * `.ligloc`, cf. anon-menus.js) → une seule entrée par `data-nomloc` distinct suffit. On ne fait donc
 * que D `clesAlias` (D = locuteurs distincts) au lieu de M (M = lignes d'énoncé), M ≫ D. Le parcours des
 * M nœuds reste (natif + `classList` trivial), mais l'agrégation « pending si UN énoncé non résolu »
 * garde la robustesse même si un état partiel transitoire existait.
 * @returns {Array<{cles:string[], resolu:boolean}>}
 */
function _indexerLibellesLocuteurs() {
    const parNom = new Map(); // data-nomloc brut → { cles, resolu }
    document.querySelectorAll('.ligloc[data-nomloc]').forEach(lig => {
        const nom = lig.dataset.nomloc || '';
        const resolu = lig.classList.contains('loc-anon') || lig.classList.contains('loc-suggere-refuse');
        const prev = parNom.get(nom);
        if (!prev) parNom.set(nom, { cles: clesAlias(nom), resolu });
        else if (!resolu) prev.resolu = false; // un seul énoncé non résolu → locuteur pending
    });
    return Array.from(parNom.values());
}

/**
 * État du LIBELLÉ de locuteur pour cette entité DANS L'ENTRETIEN COURANT (pastille 👤 par ligne,
 * pendant du 👤 corpus d'anon-scan.js). Généralise aLibellePseudonymise : détecte tout `.ligloc`
 * (pseudonymisé ou non) dont le nom matche un alias de l'entité, indépendamment des occurrences de texte.
 * @param {object} paire
 * @param {Array<{cles:string[], resolu:boolean}>} [index] - index pré-calculé (_indexerLibellesLocuteurs) ;
 *   reconstruit à la volée si omis (appel hors rendu).
 * @returns {null|'pending'|'resolu'} null = pas un locuteur ici ; 'pending' = libellé à pseudonymiser ;
 *   'resolu' = tous les libellés matchants sont pseudonymisés (loc-anon) ou refusés (loc-suggere-refuse).
 */
function _etatLocuteurLigne(paire, index) {
    if (!paire || !paire.entite) return null;
    const cles = new Set(clesAlias(paire.entite));
    if (cles.size === 0) return null;
    const libs = index || _indexerLibellesLocuteurs();
    const matching = libs.filter(l => l.cles.some(k => cles.has(k)));
    if (matching.length === 0) return null;
    return matching.some(l => !l.resolu) ? 'pending' : 'resolu';
}

/**
 * Pastille 👤 « locuteur de cet entretien » pour une ligne (couleurs alignées sur le 👤 corpus).
 * @param {null|'pending'|'resolu'} etat - état pré-calculé par _etatLocuteurLigne (évite un 2e parcours DOM).
 */
function _badgeLocuteurHtml(etat) {
    if (!etat) return '';
    const pending = etat === 'pending';
    const c = pending ? '#e65100' : '#2e7d32';
    const titre = pending
        ? 'Locuteur de cet entretien — libellé à pseudonymiser'
        : 'Locuteur de cet entretien — libellé pseudonymisé/refusé';
    return `<span class="badge-loc-entretien" title="${titre}" style="color:${c};font-size:0.72rem;`
        + `white-space:nowrap;align-self:center;margin-left:6px;">👤${pending ? '●' : '✓'}</span>`;
}

/**
 * Réconcilie les LIBELLÉS pseudonymisés (`.ligloc.loc-anon`) avec l'état COURANT des règles
 * (plan-locuteurs-pseudo.md, Étape 5). Pour chaque libellé marqué, on cherche une règle **non-brouillon**
 * de `window.tabAnon` dont un alias d'entité matche le nom du locuteur (`data-nomloc`) :
 *  - aucune (règle supprimée, reparquée en brouillon, ou entité renommée) → on **démarque** (le libellé
 *    revient au vrai nom) ;
 *  - pseudo de la règle changé → on **réécrit** `data-locpseudo`.
 * Indépendant des occurrences de texte (couvre aussi les règles label-only). À appeler après toute
 * mutation de règle. Persiste via le cache HTML si quelque chose a changé.
 * @returns {Promise<boolean>} true si au moins un libellé a été modifié.
 */
async function resynchroniserLibellesLocuteurs() {
    const ligs = Array.from(document.querySelectorAll('.ligloc.loc-anon[data-locpseudo]'));
    if (ligs.length === 0) return false;
    let modifie = false;
    for (const lig of ligs) {
        const clesNom = clesAlias(lig.dataset.nomloc || '');
        const regle = (window.tabAnon || []).find(p =>
            p && p.entite && (p.portee || 'corpus') !== 'brouillon' &&
            clesAlias(p.entite).some(k => clesNom.includes(k)));
        if (!regle) {
            lig.classList.remove('loc-anon');
            delete lig.dataset.locpseudo;
            modifie = true;
        } else {
            const pseudo = (pseudosDe(regle)[0] || '').trim();
            if (pseudo && lig.dataset.locpseudo !== pseudo) {
                lig.dataset.locpseudo = pseudo;
                modifie = true;
            }
        }
    }
    if (modifie) await syncHtmlVersMainProcess();
    return modifie;
}

/**
 * SUGGÈRE la pseudonymisation des LIBELLÉS (plan-locuteurs-pseudo.md Étape 3) : pour chaque `.ligloc`
 * PAS encore pseudonymisé (`loc-anon`), si son nom matche une règle **non-brouillon** (locale OU corpus
 * fusionnée) → marqueur `loc-suggere` + `data-locpseudo-suggere` (le CSS l'affiche « Nom → Pseudo ? » en
 * pointillé). L'utilisateur confirme par clic-droit — même logique « suggest-then-confirm-locally » que
 * les occurrences de texte « à anonymiser ». Marqueurs **RUNTIME** (re-dérivés à chaque ouverture/scan
 * via detecterOccurrencesToutesLesPaires) ; non confirmés, ils ne pseudonymisent PAS l'export.
 */
function detecterLibellesASuggerer() {
    document.querySelectorAll('.ligloc[data-nomloc]').forEach(lig => {
        // Déjà pseudonymisé (loc-anon) → pas de suggestion concurrente. De plus, le libellé confirmé
        // (persisté dans le HTML = SOURCE DE VÉRITÉ) fait APPARTENIR sa règle à l'entretien : on (re)pose
        // existeLocalement → la règle corpus s'affiche au tableau et survit à la sauvegarde d'ouverture
        // (gestion_entretiens.js exclut les Global && !existeLocalement). Sinon, après fermeture/
        // réouverture, le seul flag tabAnon ne survit pas et la règle redevient un fantôme caché.
        if (lig.classList.contains('loc-anon')) {
            lig.classList.remove('loc-suggere');
            delete lig.dataset.locpseudoSuggere;
            const clesNomA = clesAlias(lig.dataset.nomloc || '');
            const regleA = (window.tabAnon || []).find(p =>
                p && p.entite && (p.portee || 'corpus') !== 'brouillon'
                && clesAlias(p.entite).some(k => clesNomA.includes(k)));
            if (!regleA) {
                // ORPHELIN : plus aucune règle non-brouillon (ex. règle corpus supprimée au panneau
                // Pseudos) → démarquer le libellé (retour au vrai nom). Nettoyé au **plain open**, pas
                // seulement au scan — sinon « Nom → pseudo » persistait dans le HTML à la réouverture.
                lig.classList.remove('loc-anon');
                delete lig.dataset.locpseudo;
            } else if (!regleA.existeLocalement) {
                regleA.existeLocalement = true;
            }
            return;
        }
        // Refusé explicitement (« ne pas pseudonymiser », loc-suggere-refuse) → ne pas re-suggérer.
        if (lig.classList.contains('loc-suggere-refuse')) return;
        const clesNom = clesAlias(lig.dataset.nomloc || '');
        const regle = (window.tabAnon || []).find(p =>
            p && p.entite && (p.portee || 'corpus') !== 'brouillon' &&
            clesAlias(p.entite).some(k => clesNom.includes(k)));
        const pseudo = regle ? (pseudosDe(regle)[0] || '').trim() : '';
        if (pseudo) {
            lig.classList.add('loc-suggere');
            lig.dataset.locpseudoSuggere = pseudo;
        } else {
            lig.classList.remove('loc-suggere');
            delete lig.dataset.locpseudoSuggere;
        }
    });
}

async function changerPorteeLigne(idx, cible) {
    const paire = window.tabAnon[idx];
    if (!paire) return;
    const actuel = paire.portee || 'corpus';
    if (cible === actuel) return;

    // Toute transition met fin au repérage en cours.
    _reperage = null; _effacerSurlignageReperage();

    // « Appliqué » = MATÉRIALISÉ : occurrences de TEXTE OU libellé de locuteur (cohérent avec le gate
    // de portée de validerLigneAnon). Sinon une règle label-only (occ=0) serait traitée en brouillon
    // → slider mal routé (corpus↔document cassé : la transition repassait par validerLigneAnon qui
    // remettait 'corpus' car l'entité est déjà au corpus).
    const applique = (paire.occurrences || 0) > 0 || aLibellePseudonymise(paire);

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
        // Le libellé suit la portée (plan-locuteurs-pseudo.md Étape 5) : règle en brouillon → démarquer.
        await resynchroniserLibellesLocuteurs();
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
    
    // Appliquer l'anonymisation (texte)
    appliquerAnonymisationPour(idx);

    // Proposer la pseudonymisation du LIBELLÉ si l'entité est un nom de locuteur — INDÉPENDANT des
    // occurrences de texte (couvre le locuteur non cité, §4 du plan). Retourne {matched, marked}.
    const loc = await proposerPseudoLocuteur(window.tabAnon[idx], porteeRequise);

    // Une règle est MATÉRIALISÉE (donc document/corpus, jamais brouillon) si elle marque QUELQUE
    // CHOSE : des occurrences de TEXTE (occ>0) OU un LIBELLÉ de locuteur. Un libellé pseudonymisé vaut
    // matérialisation au même titre que le texte → cohérence avec l'UX du texte (plan-locuteurs-pseudo.md).
    if (window.tabAnon[idx].occurrences > 0 || loc.marked) {
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

        // Affixe de liaison (opt-in) : pertinent UNIQUEMENT s'il y a des occurrences de TEXTE.
        if (window.tabAnon[idx].occurrences > 0) {
            await proposerRegleCoeurAffixe(window.tabAnon[idx], porteeRequise);
        }
    } else {
        // Rien de matérialisé (ni texte, ni libellé) → la ligne reste un brouillon (R6). On n'avertit
        // « pas trouvé dans le texte » que si l'entité n'est PAS non plus un locuteur (sinon = brouillon
        // de locuteur volontairement décliné, pas une entité introuvable).
        window.tabAnon[idx].portee = 'brouillon';
        if (!loc.matched) {
            await question(`⚠️ L'entité "${entiteVal}" n'a pas été trouvée dans le texte.`, ["OK"]);
        }
    }
}

/**
 * Liste EFFECTIVE des mots de liaison utilisée par la détection d'affixes : surcharge corpus si
 * présente (`window.paramsAnonCorpus.motsLiaison`), sinon défauts en dur (MOTS_LIAISON_DEFAUT,
 * anon-detection.js). La surcharge corpus est éditée via la modale « Paramètres ⚙ » (anon-params.js)
 * et persistée dans le .crp (clé `paramsAnonCorpus`, chargée dans gestion_corpus.js).
 * @returns {string[]}
 */
function getMotsLiaison() {
    const p = window.paramsAnonCorpus;
    if (p && Array.isArray(p.motsLiaison) && p.motsLiaison.length) return p.motsLiaison;
    return (typeof MOTS_LIAISON_DEFAUT !== 'undefined') ? MOTS_LIAISON_DEFAUT : [];
}

/**
 * Réglage EFFECTIF des thématiques d'entités (fonctionnalité opt-in, cf. plan-thematiques-entites.md).
 * Miroir de getMotsLiaison() : surcharge corpus (`window.paramsAnonCorpus.thematiques`) si présente,
 * sinon défauts. LECTURE DÉFENSIVE : renvoie TOUJOURS un objet valide { actif:boolean, liste:string[] }
 * même sur un ancien .crp sans bloc `thematiques`. Disponible sur les DEUX pages (index + entretien)
 * car défini dans tableau_base.js — window.paramsAnonCorpus est hydraté à l'ouverture de l'entretien.
 * @returns {{actif:boolean, liste:string[]}}
 */
function getThematiques() {
    const defauts = (typeof THEMES_DEFAUT !== 'undefined') ? THEMES_DEFAUT.slice() : [];
    const t = window.paramsAnonCorpus && window.paramsAnonCorpus.thematiques;
    if (!t || typeof t !== 'object') return { actif: false, liste: defauts };
    const liste = Array.isArray(t.liste) ? t.liste.slice() : defauts;
    return { actif: !!t.actif, liste };
}

/**
 * Priorité de validation au clavier au niveau ENTRETIEN : quelle portée applique la touche Entrée
 * « nue » (Maj inverse). Réglage corpus, lecture défensive (défaut = priorité corpus).
 * - 'corpus' (défaut) : Entrée → corpus,   Maj+Entrée → document.
 * - 'entretien'       : Entrée → document, Maj+Entrée → corpus.
 * @returns {'entretien'|'corpus'}
 */
function getPrioriteValidation() {
    return (window.paramsAnonCorpus && window.paramsAnonCorpus.prioriteValidation === 'entretien')
        ? 'entretien' : 'corpus';
}

/**
 * Palette FIXE des badges de thématique. La couleur est DÉRIVÉE de l'index dans la liste effective
 * (ordre d'arrivée) — jamais persistée : rien à stocker par entité ni à exporter (décision archi).
 * Au-delà de la palette OU pour une thématique retirée de la liste (index -1) → gris « inconnue ».
 */
const PALETTE_THEMES = [
    '#1976d2', '#388e3c', '#e64a19', '#7b1fa2', '#c2185b', '#0097a7',
    '#f57c00', '#5d4037', '#455a64', '#00796b', '#512da8', '#c62828',
    '#2e7d32', '#ad1457', '#00838f', '#ef6c00', '#4527a0', '#283593',
    '#558b2f', '#d84315'
];
const COULEUR_THEME_INCONNU = '#9e9e9e'; // gris : hors palette ou thème retiré de la liste

/**
 * Couleur du badge pour une thématique donnée : PALETTE_THEMES[index dans la liste effective],
 * gris si absente/hors palette. Comparaison insensible à la casse (vocabulaire stocké en MAJUSCULES).
 * @param {string} theme
 * @returns {string} code couleur CSS
 */
function couleurThematique(theme) {
    if (!theme) return COULEUR_THEME_INCONNU;
    const { liste } = getThematiques();
    const cible = String(theme).trim().toLowerCase();
    const i = liste.findIndex(t => String(t).toLowerCase() === cible);
    return (i >= 0 && i < PALETTE_THEMES.length) ? PALETTE_THEMES[i] : COULEUR_THEME_INCONNU;
}

/**
 * Sélecteur PARTAGÉ de thématique (popover positionné sur le badge). Liste les thématiques actives
 * + « Aucune », ferme au clic extérieur. Appelé par les DEUX niveaux (corpus DOM / entretien string).
 * @param {HTMLElement} ancre - l'élément badge sur lequel positionner le popover
 * @param {string} valeurCourante - thématique actuelle (pour cocher l'option active)
 * @param {(valeur:string)=>void} onChoix - callback avec la thématique choisie ('' = Aucune)
 */
function ouvrirSelecteurThematique(ancre, valeurCourante, onChoix) {
    const existant = document.getElementById('theme-selecteur-popover');
    if (existant) existant.remove(); // un seul ouvert à la fois

    const { liste } = getThematiques();
    const pop = document.createElement('div');
    pop.id = 'theme-selecteur-popover';
    // Grille ENROULÉE : les thèmes se répartissent sur plusieurs colonnes (flex-wrap) sous une largeur
    // plafonnée, plutôt qu'une seule colonne verticale interminable au-delà de ~15 thèmes.
    pop.style.cssText =
        'position:fixed;z-index:100000;background:#fff;border:1px solid #ccc;border-radius:8px;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:6px;display:flex;flex-wrap:wrap;gap:4px;' +
        'align-content:flex-start;max-width:320px;max-height:60vh;overflow-y:auto;' +
        'font-family:Arial,sans-serif;font-size:0.9rem;';

    const courant = (valeurCourante || '').trim().toLowerCase();
    // pleineLargeur : « Aucune » occupe sa propre rangée en tête (flex-basis:100%) ; les thèmes
    // s'enroulent ensuite en colonnes (largeur au contenu).
    const faireOption = (label, valeur, couleur, pleineLargeur) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        const actif = (valeur || '').toLowerCase() === courant;
        b.style.cssText =
            'text-align:center;border:none;cursor:pointer;padding:5px 10px;border-radius:6px;white-space:nowrap;' +
            (pleineLargeur ? 'flex:0 0 100%;' : 'flex:0 0 auto;') +
            (couleur ? `color:#fff;background:${couleur};` : 'color:#333;background:#f0f0f0;') +
            (actif ? 'outline:2px solid #333;outline-offset:-2px;' : '');
        b.addEventListener('click', (e) => { e.stopPropagation(); pop.remove(); onChoix(valeur); });
        pop.appendChild(b);
    };

    faireOption('— Aucune —', '', null, true);
    liste.forEach(t => faireOption(t, t, couleurThematique(t), false));

    document.body.appendChild(pop);
    // Positionner sous l'ancre, en restant dans la fenêtre (bascule au-dessus/à gauche si débord).
    const r = ancre.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let left = r.left, top = r.bottom + 4;
    if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
    if (top + pr.height > window.innerHeight - 8) top = r.top - pr.height - 4;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';

    // Fermeture au clic extérieur (différée : ne pas capter le clic d'ouverture).
    setTimeout(() => {
        const ferme = (e) => {
            if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', ferme); }
        };
        document.addEventListener('mousedown', ferme);
    }, 0);
}

/**
 * Écriture PARTAGÉE de la thématique d'une entité, SELON LA PORTÉE de la ligne (parade à l'écrasement
 * par la fusion « corpus prioritaire », cf. plan-thematiques-entites.md Point 2). Met à jour la valeur
 * en mémoire pour un affichage immédiat, puis persiste là où vit la règle.
 * @param {object} regle - la ligne { entite, portee, thematique?, ... } (window.tabAnon[i] ou anon corpus)
 * @param {string} valeur - thématique choisie ('' = retirer)
 */
async function definirThematiqueEntite(regle, valeur) {
    if (!regle || !regle.entite) return;
    const theme = (valeur || '').trim().toUpperCase();
    if (theme) regle.thematique = theme; else delete regle.thematique; // mémoire (affichage immédiat)

    const portee = regle.portee || 'corpus';
    if (portee === 'corpus') {
        // Source de vérité = règle corpus (résolue par cleEntite dans le store getAnon()). On écrit
        // directement la règle corpus au lieu de compter sur la fusion (qui écraserait par « corpus gagne »).
        const tabAnonGlobal = await window.electronAPI.getAnon() || [];
        const cible = tabAnonGlobal.find(a => a && a.entite && cleEntite(a.entite) === cleEntite(regle.entite))
                   || (typeof regleEnCollisionAlias === 'function' ? regleEnCollisionAlias(regle.entite, tabAnonGlobal) : null);
        if (cible) {
            if (theme) cible.thematique = theme; else delete cible.thematique;
            await persisterReglesCorpus(tabAnonGlobal);
            if (typeof window.sauvegarderCorpus === 'function') await window.sauvegarderCorpus(false);
        }
    } else {
        // Portée document / brouillon : la thématique vit dans le tabAnon local de l'entretien ; elle
        // remontera au corpus via fusionnerRegles (Point 1) à la promotion.
        if (typeof sauvegarderTabAnonEnt === 'function') await sauvegarderTabAnonEnt();
    }
}

/**
 * Badge de thématique (niveau ENTRETIEN, rendu en CHAÎNE HTML) : chip coloré si thématique posée,
 * chip discret « ＋ thème » sinon. Visible seulement si la fonctionnalité est active ET l'entité non
 * vide. Le clic délègue au sélecteur/écriture partagés via ouvrirBadgeThematique(event, i).
 * @param {number} i - index dans window.tabAnon
 * @param {object} paire - window.tabAnon[i]
 * @returns {string} HTML du badge (vide si non applicable)
 */
function _badgeThematiqueHtml(i, paire) {
    if (!getThematiques().actif) return '';
    if (!paire || !paire.entite || !paire.entite.trim()) return '';
    const theme = (paire.thematique || '').trim();
    if (theme) {
        const bg = couleurThematique(theme);
        return `<button type="button" class="btn-theme-badge" onclick="ouvrirBadgeThematique(event,${i})"`
            + ` title="Thématique : ${_escAnonMenu(theme)} — cliquer pour changer"`
            + ` style="align-self:center;background:${bg};color:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:10px;`
            + `padding:1px 7px;font-size:0.68rem;cursor:pointer;line-height:1.4;">${_escAnonMenu(theme)}</button>`;
    }
    return `<button type="button" class="btn-theme-badge" onclick="ouvrirBadgeThematique(event,${i})"`
        + ` title="Attribuer une thématique"`
        + ` style="align-self:center;background:#f0f0f0;color:#666;border:1px dashed #bbb;border-radius:12px;`
        + `padding:2px 8px;font-size:0.75rem;cursor:pointer;line-height:1.4;">＋ thème</button>`;
}

/** Handler du badge thématique entretien : ouvre le sélecteur ancré sur le badge, écrit selon portée. */
function ouvrirBadgeThematique(event, i) {
    event.stopPropagation();
    const paire = window.tabAnon[i];
    if (!paire) return;
    ouvrirSelecteurThematique(event.currentTarget, paire.thematique || '', async (valeur) => {
        await definirThematiqueEntite(paire, valeur);
        affichTableauAnon(); // re-render : badge + éventuel filtre thème à jour
    });
}

/**
 * Recherche/filtre au niveau ENTRETIEN (plan-thematiques-entites.md, Phase 3 — extension corpus+entretien).
 * Même logique que le corpus : si le terme correspond EXACTEMENT à une thématique active → filtre par
 * thème ; sinon substring entité/pseudo. La case (#anon-ent-recherche) vit HORS de #tableauAnon (re-rendu),
 * elle survit donc aux affichTableauAnon ; on ne fait que (dé)masquer les lignes déjà rendues.
 */
function _appliquerFiltreThemeEntretien() {
    const zone = document.getElementById('anon-ent-recherche-zone');
    const input = document.getElementById('anon-ent-recherche');
    if (!zone || !input) return;
    const themes = getThematiques();
    zone.style.display = themes.actif ? '' : 'none';
    if (!themes.actif) return; // feature off → pas de filtrage (toutes les lignes visibles)

    const terme = (input.value || '').trim().toLowerCase();
    const themeMatch = (terme && themes.liste.some(t => String(t).toLowerCase() === terme)) ? terme : null;
    document.querySelectorAll('#tableauAnon tr.ligne-anon').forEach(tr => {
        if (!terme) { tr.style.display = ''; return; }
        let ok;
        if (themeMatch) {
            ok = (tr.dataset.thematique || '').trim().toLowerCase() === themeMatch;
        } else {
            const paire = window.tabAnon[Number(tr.dataset.idx)];
            const e = (paire && paire.entite || '').toLowerCase();
            const p = paire ? pseudosDe(paire).join('/').toLowerCase() : '';
            ok = e.includes(terme) || p.includes(terme);
        }
        tr.style.display = ok ? '' : 'none';
    });
}

/**
 * Si la règle qu'on vient de poser est « encadrée » par un mot de liaison (« à Lyon » → « dans une
 * grande ville »), PROPOSE (opt-in) de créer aussi la règle cœur dégraissée (« Lyon » → « une grande
 * ville »), à la MÊME portée que le geste. Ne propose pas si le cœur existe déjà (regleCoeurExiste).
 * La création réutilise validerLigneAnon → conflit corpus (aligner / garder les deux), portée et
 * sauvegarde gérés exactement comme une saisie manuelle. Voir plan-affixes-liaison.md.
 * @param {object} paire - la règle qui vient d'être appliquée
 * @param {string} porteeRequise - 'document' (Entrée) ou 'corpus' (Maj+Entrée), héritée du geste
 */
async function proposerRegleCoeurAffixe(paire, porteeRequise) {
    if (!paire || !paire.entite || !paire.remplacement) return;
    const aff = detecterAffixeLiaison(paire.entite, paire.remplacement, getMotsLiaison());
    if (!aff) return;
    if (regleCoeurExiste(aff.entiteCoeur, aff.pseudoCoeur)) return;

    const rep = await question(
        `Vous avez remplacé « ${paire.entite} » par « ${paire.remplacement} ».\n\n` +
        `Ajouter aussi la règle générale « ${aff.entiteCoeur} » → « ${aff.pseudoCoeur} » ? `,
        ['Oui', 'Non']);
    if (rep !== 'oui') return;

    // Nouvelle ligne + remplissage de ses champs, puis réutilisation de validerLigneAnon (DRY :
    // conflit/portée/sauvegarde identiques à une saisie manuelle). L'« à Lyon » interne deviendra
    // une incluse sous la règle englobante déjà posée.
    window.tabAnon.push({ entite: "", remplacement: "", occurrences: 0, indexCourant: 0, matchPositions: [], portee: 'brouillon' });
    const idxCoeur = window.tabAnon.length - 1;
    affichTableauAnon();
    const eInp = document.querySelector(`.input-entite[data-idx="${idxCoeur}"]`);
    const rInp = document.querySelector(`.input-remplacement[data-idx="${idxCoeur}"]`);
    if (!eInp || !rInp) { window.tabAnon.splice(idxCoeur, 1); return; }
    eInp.value = aff.entiteCoeur;
    rInp.value = aff.pseudoCoeur;
    await validerLigneAnon(idxCoeur, porteeRequise);
}

/**
 * Si l'entité d'une règle qu'on vient de valider est le NOM d'un ou plusieurs locuteurs de
 * l'entretien, PROPOSE (opt-in) de pseudonymiser aussi leur LIBELLÉ : pose `loc-anon` +
 * `data-locpseudo` sur tous les `.ligloc` correspondants (le CSS de l'Étape 1 barre alors le nom
 * réel et affiche le pseudo). Indépendant des occurrences de TEXTE → couvre le locuteur non cité
 * dans le corps (§4 du plan). Mirroir de proposerRegleCoeurAffixe : opt-in post-validation, pseudo
 * = primaire de la règle. Marquage DOM-natif (anon.md §2) → persiste via le cache HTML.
 * @param {object} paire - la règle qui vient d'être validée
 * @param {string} porteeRequise - 'document'/'corpus' héritée du geste (réservé : la portée du
 *   libellé suivra la règle, cf. plan-locuteurs-pseudo.md — Étapes 3/5).
 * @returns {Promise<{matched:boolean, marked:boolean}>} matched = l'entité est le nom d'au moins un
 *   locuteur ; marked = un libellé est (désormais ou déjà) pseudonymisé avec ce pseudo → vaut
 *   MATÉRIALISATION (l'appelant met alors la règle en document/corpus, pas en brouillon).
 */
async function proposerPseudoLocuteur(paire, porteeRequise) {
    const aucun = { matched: false, marked: false };
    if (!paire || !paire.entite) return aucun;
    const pseudo = (pseudosDe(paire)[0] || '').trim();
    if (!pseudo) return aucun;

    const clesEntite = new Set(clesAlias(paire.entite));
    if (clesEntite.size === 0) return aucun;

    // Libellés dont le nom (data-nomloc, déjà sans « ? ») matche un alias de l'entité.
    const cibles = Array.from(document.querySelectorAll('.ligloc[data-nomloc]')).filter(lig => {
        const nom = lig.dataset.nomloc || '';
        return nom && clesAlias(nom).some(k => clesEntite.has(k));
    });
    if (cibles.length === 0) return aucun;

    // Ask-once : déjà tous pseudonymisés avec CE pseudo → déjà matérialisé, rien à reproposer.
    if (cibles.every(lig => lig.classList.contains('loc-anon') && lig.dataset.locpseudo === pseudo)) {
        return { matched: true, marked: true };
    }

    const rep = await question(
        `« ${cibles[0].dataset.nomloc} » est aussi un locuteur de l'entretien.\n\n` +
        `Pseudonymiser aussi son libellé en « ${pseudo} » ?`,
        ['Oui', 'Non']);
    if (rep !== 'oui') return { matched: true, marked: false }; // décliné : locuteur connu, mais rien marqué

    if (typeof backUp === 'function') backUp(); // snapshot undo (cf. anon-menus.js)
    cibles.forEach(lig => {
        lig.classList.add('loc-anon');
        lig.dataset.locpseudo = pseudo;
    });
    await syncHtmlVersMainProcess(); // DOM marqué → cache HTML du main (anon.md §3.4)
    return { matched: true, marked: true };
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