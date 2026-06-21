////////////////////////////////////////////////////////////////////////
// NAVIGATION DANS LES OCCURRENCES (Entretien)
//
// Extrait de tableau_base.js (refacto) sans changement de comportement.
// Fonctions de navigation entre occurrences dans le tableau de
// pseudonymisation de l'entretien courant.
////////////////////////////////////////////////////////////////////////

// Retire le surlignage des occurrences quand on clique ailleurs
function clearHighlightOccurrences() {
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    tousLesSpans.forEach(span => {
        span.classList.remove('highlight-occ');
    });
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

// Navigation vers la prochaine occurrence d'une catégorie (anon | exc | non)
// Teste l'appartenance d'un match à une catégorie de navigation.
// cat : 'exc' | 'non' | 'anon' (toutes variantes) | 'anon0'/'anon1' (variante précise, lue au DOM).
function _matchDansCategorie(paire, m, cat, spans) {
    if (cat === 'exc') return m.isException;
    if (cat === 'non') return m.isNonTraite;
    if (m.isException || m.isNonTraite || m.isIncluded) return false; // 'anon' / 'anonN' (incluse exclue, I-INC-3)
    if (cat === 'anon') return true;
    const vi = parseInt(cat.slice(4), 10); // 'anon0' -> 0
    if (isNaN(vi)) return true;
    const cible = (pseudosDe(paire)[vi] || '').toLowerCase();
    const dp = ((spans && spans[m.start] && spans[m.start].dataset.pseudo) || '').toLowerCase();
    return dp === cible || (dp === '' && vi === 0); // sans data-pseudo → primaire
}

function allerCatSuivante(idx, cat) {
    const paire = window.tabAnon[idx];
    if (!paire || !paire.matchPositions || paire.matchPositions.length === 0) return;

    // Filtrer les matches de cette catégorie (avec leur index original)
    const spans = cat.startsWith('anon') ? document.querySelectorAll('[data-rk]') : null;
    const matchesCat = [];
    paire.matchPositions.forEach((m, origIdx) => {
        if (_matchDansCategorie(paire, m, cat, spans)) matchesCat.push({ origIdx });
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

    const spans = cat.startsWith('anon') ? document.querySelectorAll('[data-rk]') : null;
    const matchesCat = [];
    paire.matchPositions.forEach((m, origIdx) => {
        if (_matchDansCategorie(paire, m, cat, spans)) matchesCat.push({ origIdx });
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
        const couleurs = { anon: '#4caf50', anon0: '#4caf50', anon1: '#00897b', exc: '#555', non: '#ff9800' };
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
