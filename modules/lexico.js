// ============================================================
// LEXICO.JS — Module d'analyse lexicographique
// ============================================================

// Tableau global des occurrences de mots extraites de tous les entretiens
var tabLexico = [];

/**
 * extraireLexico()
 * Parcourt tous les entretiens actifs et extrait chaque occurrence de mot
 * (spans avec data-rk) dans tabLexico.
 *
 * Colonnes de tabLexico :
 *   forme        — forme du mot en minuscules, sans ponctuation
 *   substitution — forme de substitution (vide par défaut)
 *   typeForme    — type de substitution ('' par défaut, 'V' pour verbes auto)
 *   entretien    — index de l'entretien d'origine (pour récupérer les métadonnées)
 *   thematiques  — tableau des classes thématiques du span (commençant par cat_)
 *   rk           — valeur data-rk du span d'origine (position dans l'entretien)
 */
async function extraireLexico() {
    const tDebut = performance.now();
    tabLexico = [];

    // Chargement des données de référence si nécessaire
    if (tabThm.length === 0) {
        tabThm = await window.electronAPI.getThm();
    }
    if (tabEnt.length === 0) {
        tabEnt = await window.electronAPI.getEnt();
    }

    const tabHtml = await window.electronAPI.getHtml();
    const nb = tabHtml.length;

    if (nb === 0) {
        document.getElementById('status-bar').innerText = 'Aucun entretien à traiter.';
        return tabLexico;
    }

    // Parser HTML sans toucher au DOM principal (évite tout reflow/scroll)
    const parser = new DOMParser();

    for (let i = 0; i < nb; i++) {
        // Ignorer les entretiens désactivés
        //if (tabEnt[i] && tabEnt[i].actif === 0) continue;

        // ---- Mise à jour de l'interface ----
        document.getElementById('status-bar').innerText =
            `Extraction lexicale : entretien ${i + 1} / ${nb}…`;
        document.getElementById('progress-bar').style.width =
            ((i + 1) / nb) * 100 + '%';

        // Céder le fil d'exécution pour que l'UI se repeigne
        await new Promise(resolve => setTimeout(resolve, 0));

        // ---- Traitement de l'entretien ----
        let html = tabHtml[i];
        if (!html) continue;

        // Parse dans un document isolé — aucune insertion dans le DOM courant
        const doc = parser.parseFromString(html, 'text/html');

        // Tous les spans de mots (ceux qui ont un attribut data-rk)
        const spans = Array.from(doc.querySelectorAll('[data-rk]'));

        // Tableau des locuteurs propre à cet entretien
        const tabLocEnt = (tabEnt[i] && Array.isArray(tabEnt[i].tabLoc)) ? tabEnt[i].tabLoc : [];

        // Ensemble des spans à ignorer car déjà absorbés dans une entité pseudonymisée
        const skipSet = new Set();

        for (const span of spans) {
            if (skipSet.has(span)) continue;

            // ---- Entité pseudonymisée : span debsel portant data-pseudo ----
            if (span.classList.contains('debsel') && span.dataset.pseudo) {
                const pseudo = span.dataset.pseudo;

                // Marquer tous les spans de l'entité (debsel → finsel) pour les ignorer
                skipSet.add(span);
                if (!span.classList.contains('finsel')) {
                    let cur = span.nextSibling;
                    while (cur) {
                        if (cur.nodeType === Node.ELEMENT_NODE) {
                            if (cur.dataset.rk) skipSet.add(cur);
                            if (cur.classList.contains('finsel')) break;
                        }
                        cur = cur.nextSibling;
                    }
                }

                // Classes thématiques et locuteur depuis le span debsel
                const thematiques = Array.from(span.classList).filter(c => c.startsWith('cat_'));
                const segParent = span.closest('[data-loc]');
                const idxLoc = segParent ? Number(segParent.dataset.loc) : 0;
                const locuteur = tabLocEnt[idxLoc] || '';

                // Une seule occurrence pour toute l'entité, avec le pseudo comme forme
                tabLexico.push({
                    rang:         tabLexico.length,
                    forme:        '[' + pseudo.toLowerCase() + ']',
                    substitut:    '',
                    typeForme:    '',
                    entretien:    i,
                    thematiques:  [...thematiques],
                    rk:           Number(span.dataset.rk),
                    locuteur:     locuteur
                });
                continue;
            }

            // ---- Traitement normal : extraction des tokens alphabétiques ----
            const thematiques = Array.from(span.classList).filter(c => c.startsWith('cat_'));
            const segParent = span.closest('[data-loc]');
            const idxLoc = segParent ? Number(segParent.dataset.loc) : 0;
            const locuteur = tabLocEnt[idxLoc] || '';

            const texte = span.textContent || '';
            const mots = texte.match(/[a-zA-ZÀ-ÿ]+|[0-9]+/g);
            if (!mots) continue;

            mots.forEach(mot => {
                tabLexico.push({
                    rang:         tabLexico.length,
                    forme:        mot.toLowerCase(),
                    substitut:    '',
                    typeForme:    '',
                    entretien:    i,
                    thematiques:  [...thematiques],
                    rk:           Number(span.dataset.rk),
                    locuteur:     locuteur
                });
            });
        }
    }

    // ---- Message de fin ----
    const duree = ((performance.now() - tDebut) / 1000).toFixed(2);
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('status-bar').innerText =
        `Extraction lexicale terminée : ${tabLexico.length} occurrences extraites en ${duree} s.`;

    console.log(`[Lexico] Extraction terminée : ${tabLexico.length} entrées en ${duree} s.`);

    // Charger les lemmatisations et mots outils persistés (avant l'agrégation)
    await _lxChargerFichiersAnnexes();

    return tabLexico;
}

// ============================================================
// AGRÉGATION
// ============================================================

var tabOccLexico = [];      // une ligne par forme unique
var lexicoTriPar = 'freq'; // 'freq' | 'alpha' | 'nbEnt'
var lexicoDesc   = true;

var lxVueDonnees = [];  // données actuellement affichées (filtrées ou non)
var lxVueOffset  = 0;   // nombre de lignes déjà rendues dans le tbody
const LX_BATCH   = 200; // lignes chargées par lot au scroll
var lxTypesLemmesParForme = new Map(); // index forme visible -> type(s) de lemmatisation présents
var lxParentRowUid = 0; // identifiant technique des lignes parentes pour le repli/depli
var lxFiltreListeTexteActif = false; // true si la recherche texte de la liste est active
var lxMaxFreqGlobal = 1; // fréquence maximale du corpus entier (référence de l'échelle)
var lxCorpusCompletVisible = true; // true si aucune sélection (thm/var/ent) ne restreint le corpus
var lxSpecifActives = false; // true si les spécificités sont calculées sur un sous-corpus sélectionné
var lxHistogrammeComparatifActif = false; // true si l'on affiche la proportion filtrée / globale en %
var lxIgnorerFiltreVariablesInitial = true; // ignore le filtre variables tant qu'aucune interaction n'a eu lieu

// ---- Options d'affichage ----
var lxOptExclureQuestions = true;  // exclure les locuteurs dont le nom contient '?'
var lxOptOccMin           = 1;     // fréquence minimale pour figurer dans le tableau
var lxOptAfficherSpecNeg  = false; // afficher les spécificités négatives
var lxOptAfficherChiffres = false; // afficher les tokens purement numériques
var lxOptLemmatiserVerbes = true; // lemmatiser automatiquement les verbes
var lxOptAfficherVerbesLemmes = true; // afficher les lemmes de verbes dans les vues lexico
var lxOptAfficherWordle   = true;  // afficher le nuage de mots par défaut

var lxMotsOutils = new Set(); // formes à ignorer (mots vides / mots outils)
var lxConcatRegles = new Map(); // regles de concatenation chargees/saisies (.cnct)

const _LX_TERM_ER = new Set([
    'er', 'er+', 'é', 'ée', 'ées', 'a', 'ea', 'era', 'e', 'ai', 'eai', 'erai', 'er', 'ais',
    'âmes', 'as', 'as', 'âtes', 'eais', 'eâmes', 'eas', 'eas', 'eâtes', 'eons', 'erais',
    'erais', 'eras', 'erions', 'erons', 'es', 'ions', 'ons', 'aient', 'ait', 'ant', 'eant',
    'assent', 'ât', 'ât', 'eait', 'eassent', 'eût', 'eût', 'ent', 'eraient', 'erait', 'èrent',
    'eront', 'erez', 'eriez', 'ez', 'iez'
].map(t => _lxVrbNormaliserCasse(t)).filter(Boolean));

const _LX_TERM_IR = new Set([
    'ir', 'ir+', 'i', 'ie', 'ir', 'is', 'it', 'issons', 'issez', 'issent', 'issais', 'issait',
    'issions', 'issiez', 'issaient', 'îmes', 'îtes', 'irent', 'irai', 'iras', 'ira', 'irons',
    'irez', 'iront', 'isse', 'isses', 'issions', 'issiez', 'issent', 'issant'
].map(t => _lxVrbNormaliserCasse(t)).filter(Boolean));

const _lxVrbProgressTick = 4000;

const _lxVrbDicos = {
    charges: false,
    grp1: new Map(),
    grp2: new Map(),
    irr: new Map()
};

// Mots qui rendent improbable une lecture verbale du token suivant
// (ex. "une note" doit rester le nom "note", pas le verbe "noter").
const _LX_VRB_PREV_BLOCKERS = new Set([
    'au', 'aux', 'de', 'des', 'du', 'd', 'l', 'la', 'le', 'les', 'un', 'une',
    'ce', 'cet', 'cette', 'ces',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
    'notre', 'nos', 'votre', 'vos', 'leur', 'leurs'
].map(t => _lxVrbNormaliserCasse(t)).filter(Boolean));

function _lxVrbContexteAutorise(index) {
    if (index <= 0 || !Array.isArray(tabLexico) || index >= tabLexico.length) return true;

    const courant = tabLexico[index];
    const precedent = tabLexico[index - 1];
    if (!courant || !precedent) return true;

    // On ne compare que des tokens du meme entretien pour eviter les bords de corpus.
    if (courant.entretien !== precedent.entretien) return true;

    const prev = _lxVrbNormaliserCasse(precedent.forme).replace(/[^\p{L}]/gu, '');
    if (!prev) return true;

    return !_LX_VRB_PREV_BLOCKERS.has(prev);
}

/**
 * agreguerLexico()
 * Réduit tabLexico (une occurrence par mot) en tabOccLexico
 * (une entrée par forme distincte) puis trie selon lexicoTriPar.
 */
function agreguerLexico() {
    const map = new Map();

    tabLexico.forEach(item => {
        const cle = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : item.forme;
        if (!map.has(cle)) {
            map.set(cle, { forme: cle, occTotal: 0, entretiens: new Set(), thematiques: new Set() });
        }
        const e = map.get(cle);
        e.occTotal++;
        e.entretiens.add(item.entretien);
        item.thematiques.forEach(t => e.thematiques.add(t));
    });

    tabOccLexico = [];
    map.forEach(e => {
        tabOccLexico.push({
            forme:       e.forme,
            occTotal:    e.occTotal,
            nbEnt:       e.entretiens.size,
            entretiens:  Array.from(e.entretiens),
            thematiques: Array.from(e.thematiques),
            selectionne: false
        });
    });

    _lxTrier();
    lxMaxFreqGlobal = tabOccLexico.reduce((m, d) => Math.max(m, d.occTotal), 1);
    console.log(`[Lexico] Agrégation : ${tabOccLexico.length} formes distinctes.`);
}

function _lxTrier() {
    tabOccLexico.sort((a, b) => {
        let cmp = 0;
        if      (lexicoTriPar === 'alpha') cmp = a.forme.localeCompare(b.forme, 'fr', { sensitivity: 'base' });
        else if (lexicoTriPar === 'nbEnt') cmp = b.nbEnt - a.nbEnt;
        else if (lexicoTriPar === 'pval')  cmp = (a.pValue ?? 1) - (b.pValue ?? 1);
        else if (lexicoTriPar === 'rel')   cmp = b.occTotal - a.occTotal;
        else                               cmp = b.occTotal - a.occTotal;
        return lexicoDesc ? cmp : -cmp;
    });
}

function _lxItemEstLemmeVerbe(item) {
    return !!(item && item.substitut && item.substitut.trim() && item.typeForme === 'V');
}

function _lxItemEstLemmeManuel(item) {
    return !!(item && item.substitut && item.substitut.trim() && item.typeForme !== 'V');
}

function _lxReconstruireTypesLemmesParForme() {
    const index = new Map();

    tabLexico.forEach(item => {
        const cle = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : item.forme;
        if (!index.has(cle)) index.set(cle, { verbe: false, manuel: false });
        const e = index.get(cle);
        if (_lxItemEstLemmeVerbe(item)) e.verbe = true;
        if (_lxItemEstLemmeManuel(item)) e.manuel = true;
    });

    lxTypesLemmesParForme = index;
}

function _lxClassesLemmeForme(forme) {
    const e = lxTypesLemmesParForme.get(forme);
    if (!e) return '';

    const classes = [];
    if (e.verbe) classes.push('lx-lemme-verbe');
    if (e.manuel) classes.push('lx-lemme-manuel');
    return classes.join(' ');
}

function _lxFormeEstLemmeVerbeMasquable(forme) {
    const e = lxTypesLemmesParForme.get(forme);
    return !!(e && e.verbe && !e.manuel);
}

function _lxClassesLemmeItem(item) {
    const classes = [];
    if (_lxItemEstLemmeVerbe(item)) classes.push('lx-lemme-verbe');
    if (_lxItemEstLemmeManuel(item)) classes.push('lx-lemme-manuel');
    return classes.join(' ');
}

function _lxFormeEstDeveloppable(forme) {
    const e = lxTypesLemmesParForme.get(forme);
    return !!(e && (e.verbe || e.manuel));
}

function _lxSousFormesDynamiques(cleForme) {
    const cle = String(cleForme || '').trim();
    if (!cle) return [];

    const map = new Map();
    let trouveParSubstitut = false;

    tabLexico.forEach(item => {
        const sub = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : '';
        if (sub !== cle) return;
        trouveParSubstitut = true;

        const formeBase = item.forme;
        if (!map.has(formeBase)) {
            map.set(formeBase, { forme: formeBase, occTotal: 0, entretiens: new Set() });
        }
        const e = map.get(formeBase);
        e.occTotal++;
        e.entretiens.add(item.entretien);
    });

    if (!trouveParSubstitut) return [];

    return Array.from(map.values())
        .map(e => ({
            forme: e.forme,
            occTotal: e.occTotal,
            nbEnt: e.entretiens.size
        }))
        .sort((a, b) => {
            const cmp = b.occTotal - a.occTotal;
            if (cmp !== 0) return cmp;
            return a.forme.localeCompare(b.forme, 'fr', { sensitivity: 'base' });
        });
}

function _lxCreerSousLigne(item, logMax, parentId, cleParent) {
    const tr = document.createElement('tr');
    tr.className = 'lx-row lx-sub-row';
    tr.dataset.lxParentId = parentId;

    const tdChk = document.createElement('td');
    tdChk.className = 'lx-td-chk';
    tr.appendChild(tdChk);

    const tdRk = document.createElement('td');
    tdRk.className = 'lx-td-rk';
    tdRk.textContent = '';
    tr.appendChild(tdRk);

    const tdForme = document.createElement('td');
    tdForme.className = 'lx-td-forme lx-td-forme-sub';
    const spanForme = document.createElement('span');
    spanForme.className = 'lx-forme-txt lx-forme-sub';
    spanForme.textContent = item.forme;
    tdForme.appendChild(spanForme);

    const btnDet = document.createElement('button');
    btnDet.className = 'lx-btn-det';
    btnDet.textContent = '➕';
    btnDet.title = 'Voir les occurrences en contexte';
    btnDet.addEventListener('click', e => {
        e.stopPropagation();
        _lxOuvrirModalOccurrences(item.forme);
    });
    tdForme.appendChild(btnDet);

    const btnUngrp = document.createElement('button');
    btnUngrp.className = 'lx-btn-ungrp';
    btnUngrp.textContent = 'x';
    btnUngrp.title = 'Libérer cette sous-forme (ne plus la regrouper)';
    btnUngrp.addEventListener('click', e => {
        e.stopPropagation();
        _lxLibererSousForme(item.forme, cleParent);
    });
    tdForme.appendChild(btnUngrp);

    tr.appendChild(tdForme);

    const tdFreq = document.createElement('td');
    tdFreq.className = 'lx-td-freq';
    tdFreq.textContent = item.occTotal.toLocaleString('fr-FR');
    tr.appendChild(tdFreq);

    const tdBar = document.createElement('td');
    tdBar.className = 'lx-td-bar';
    const pct = (Math.log10(item.occTotal + 1) / logMax) * 100;
    tdBar.innerHTML =
        `<div class="lx-bar-outer"><div class="lx-bar-inner" style="width:${pct.toFixed(1)}%"></div></div>`;
    tr.appendChild(tdBar);

    const tdNbEnt = document.createElement('td');
    tdNbEnt.className = 'lx-td-nbent';
    tdNbEnt.textContent = item.nbEnt;
    tr.appendChild(tdNbEnt);

    const tdPval = document.createElement('td');
    tdPval.className = 'lx-td-pval';
    tr.appendChild(tdPval);

    return tr;
}

function _lxBasculerSousFormes(trParent, cleForme, logMax) {
    if (!trParent || !trParent.parentNode) return;
    const parentId = trParent.dataset.lxParentId;
    if (!parentId) return;

    const ouvert = trParent.dataset.lxExpanded === '1';
    let cur = trParent.nextElementSibling;
    while (cur && cur.classList.contains('lx-sub-row') && cur.dataset.lxParentId === parentId) {
        const next = cur.nextElementSibling;
        cur.remove();
        cur = next;
    }

    const btnExpand = trParent.querySelector('.lx-btn-expand');
    if (ouvert) {
        trParent.dataset.lxExpanded = '0';
        if (btnExpand) btnExpand.textContent = '▼';
        return;
    }

    const sousFormes = _lxSousFormesDynamiques(cleForme);
    if (!sousFormes.length) {
        trParent.dataset.lxExpanded = '0';
        if (btnExpand) btnExpand.textContent = '▼';
        return;
    }

    const frag = document.createDocumentFragment();
    sousFormes.forEach(sf => {
        frag.appendChild(_lxCreerSousLigne(sf, logMax, parentId, cleForme));
    });
    trParent.parentNode.insertBefore(frag, trParent.nextSibling);

    trParent.dataset.lxExpanded = '1';
    if (btnExpand) btnExpand.textContent = '▲';
}

function _lxRouvrirParentApresRefresh(cleParent) {
    const cle = String(cleParent || '').trim();
    if (!cle) return;

    const idx = lxVueDonnees.findIndex(d => d && d.forme === cle);
    if (idx < 0) return;

    const tbody = document.getElementById('lx-tbody');
    if (!tbody) return;

    // S'assurer que la ligne parent est chargee meme si elle est hors premier lot.
    while (lxVueOffset <= idx && lxVueOffset < lxVueDonnees.length) {
        _lxAppendBatch(tbody);
    }

    const rows = tbody.querySelectorAll('tr.lx-row:not(.lx-sub-row)');
    const trParent = rows[idx];
    if (!trParent) return;

    const maxFreq = lxMaxFreqGlobal;
    const logMax  = Math.log10(maxFreq + 1);
    if (trParent.dataset.lxExpanded !== '1') {
        _lxBasculerSousFormes(trParent, cle, logMax);
    }
}

function _lxLibererSousForme(forme, cleParent) {
    const cibleForme = String(forme || '').trim();
    const cibleParent = String(cleParent || '').trim();
    if (!cibleForme || !cibleParent) return;

    let modifie = 0;
    tabLexico.forEach(item => {
        if (item.forme !== cibleForme) return;
        const sub = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : '';
        if (sub !== cibleParent) return;

        item.substitut = '';
        item.typeForme = '';
        modifie++;
    });

    if (modifie === 0) return;

    agreguerLexico();
    _lxRefreshTable();
    _lxRouvrirParentApresRefresh(cibleParent);
    _lxSauvegarderLem();
}

// ============================================================
// FENÊTRE PRINCIPALE
// ============================================================

async function afficherLexico() {
    if (tabLexico.length === 0) await extraireLexico();
    if (tabOccLexico.length === 0) agreguerLexico();

    if (typeof affichTriAPlat === 'function') {
        const triAPlat = document.getElementById('triaplat-content');
        if (triAPlat && triAPlat.children.length === 0) {
            await affichTriAPlat();
        }
    }

    document.getElementById('divLexico')?.remove();
    _lxInjecterStyles();

    const div = document.createElement('div');
    div.id = 'divLexico';
    div.classList.add('fondtabdat');
    div.style.cssText = 'display:flex; flex-direction:column; padding:0;';
    document.body.appendChild(div);

    div.appendChild(_lxHeader(div));

    const body = document.createElement('div');
    body.id = 'lx-body';
    body.style.cssText = 'display:flex; flex:1; overflow:hidden; height:calc(100% - 52px);';
    div.appendChild(body);

    body.appendChild(_lxPanneauThm());
    body.appendChild(_lxPanneauVar());
    body.appendChild(_lxPanneauEnt());
    body.appendChild(_lxPanneauIndex());
    if (lxOptAfficherWordle) {
        const pnlIndex = document.getElementById('lxPnlIndex');
        if (pnlIndex && !document.getElementById('lx-wordle-panel')) {
            pnlIndex.appendChild(_lxCreerPanneauWordle());
        }
    }

    // Au chargement, on n'applique pas les filtres variables hérités d'autres vues.
    lxIgnorerFiltreVariablesInitial = true;
    _lxAfficherPanneauxFiltresInitiaux();

    // Appliquer dès le premier affichage les filtres chargés (mots outils, etc.)
    _lxRefreshTable();
}

function _lxAfficherPanneauxFiltresInitiaux() {
    const thmVisibles = tabThm.filter(t => !t.code.startsWith('cat_int_'));
    const toutesThmActives = thmVisibles.every(t => t.act !== false && t.act !== 'false');
    const filtreVarCorpusActif = false /* [...document.querySelectorAll('#lxPnlVar .btn-onoff-ent[data-v]')]
        .some(btn => btn.dataset.vide !== '1' && !btn.classList.contains('btn-onoff-ent--actif'));
    */
    const tousEntActifs = tabEnt.every(ent => {
        const actif = (ent.actif !== undefined) ? ent.actif : ent.act;
        return actif !== 0 && actif !== '0' && actif !== false && actif !== 'false';
    });

    if (!toutesThmActives) {
        document.getElementById('lxPnlThm')?.classList.remove('lx-hidden');
    }
    if (filtreVarCorpusActif) {
        document.getElementById('lxPnlVar')?.classList.remove('lx-hidden');
    }
    if (!filtreVarCorpusActif && !tousEntActifs) {
        document.getElementById('lxPnlEnt')?.classList.remove('lx-hidden');
    }

    _lxAjusterLargeurPanneaux();
}

function _lxModaliteVarACibles(v, m, champ) {
    const rkV = Number(v);
    const rkM = Number(m);
    const estGen = champ === 'gen';

    if (rkM === 0) {
        const varMods = (typeof tabDic !== 'undefined')
            ? tabDic.filter(d => Number(d.v) === rkV && Number(d.m) > 0)
            : [];

        return tabEnt.some(ent => {
            if (!Array.isArray(ent.tabDat)) return true;
            const aUneModalite = varMods.some(dic =>
                ent.tabDat.some(d =>
                    Number(d.v) === rkV &&
                    Number(d.m) === Number(dic.m) &&
                    (estGen ? (d.l === 'all' || d.l === undefined) : true)
                )
            );
            return !aUneModalite;
        });
    }

    return tabEnt.some(ent =>
        Array.isArray(ent.tabDat) && ent.tabDat.some(d =>
            Number(d.v) === rkV &&
            Number(d.m) === rkM &&
            (estGen ? (d.l === 'all' || d.l === undefined) : true)
        )
    );
}

function _lxEtatVariablesCorpus() {
    const etat = new Map();
    document.querySelectorAll('#triaplat-content .tap-var').forEach(divVar => {
        const premierBtn = divVar.querySelector('.tap-row > .btn-onoff-ent[data-v]');
        if (!premierBtn) return;

        const v = String(premierBtn.dataset.v);
        const divMods = divVar.querySelector('.tap-mods');
        const actifs = new Set();

        divVar.querySelectorAll('.tap-row > .btn-onoff-ent[data-v][data-m]').forEach(btn => {
            if (btn.classList.contains('btn-onoff-ent--actif')) {
                actifs.add(String(btn.dataset.m));
            }
        });

        etat.set(v, {
            ouvert: !!divMods && divMods.style.display !== 'none',
            actifs
        });
    });
    return etat;
}

// ============================================================
// EN-TÊTE
// ============================================================

/**
 * Recalcule la largeur des panneaux latéraux visibles :
 * 1 panneau → 380 px, 2 → 190 px chacun, 3 → 127 px chacun.
 */
function _lxAjusterLargeurPanneaux() {
    const ids = ['lxPnlThm', 'lxPnlVar', 'lxPnlEnt'];
    const visibles = ids
        .map(id => document.getElementById(id))
        .filter(p => p && !p.classList.contains('lx-hidden'));
    const n = visibles.length;
    if (n === 0) return;
    const largeur = Math.round(33 / n);
    visibles.forEach(p => { p.style.width = largeur + '%'; });
}

function _lxHeader(divRoot) {
    const h = document.createElement('div');
    h.classList.add('header-tabdat');
    h.style.cssText = 'display:flex; align-items:center; gap:0px; padding:4px 10px; height:52px; margin-bottom:0; flex-shrink:0;';

    const titre = document.createElement('span');
    titre.style.cssText = 'font-size:1rem; font-weight:bold; color:var(--couleur-titre); margin-right:10px;';
    titre.textContent = 'Statistiques lexicales';
    h.appendChild(titre);

    const panelIds = ['lxPnlThm', 'lxPnlVar', 'lxPnlEnt'];

    [
        { id: 'lxPnlThm', label: 'Catégories', class: 'logo-cat-filtre' },
        { id: 'lxPnlVar', label: 'Variables', class: 'logo-variables-filtre'   },
        { id: 'lxPnlEnt', label: 'Entretiens' , class: 'logo-ent-filtre' },
    ].forEach(({ id, label, class: btnClass }) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        if (btnClass) {
            btn.classList.add(btnClass);
        }
        btn.style.padding = '10px';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            const p = document.getElementById(id);
            if (p) p.classList.toggle('lx-hidden');
            _lxAjusterLargeurPanneaux();
        });
        h.appendChild(btn);
    });

    const btnRefresh = document.createElement('button');
    btnRefresh.className = 'btn btn-secondary';
    btnRefresh.style.padding = '10px';
    btnRefresh.textContent = '🔄 Rafraîchir';
    btnRefresh.addEventListener('click', async () => {
        tabLexico = [];
        tabOccLexico = [];
        await extraireLexico();
        agreguerLexico();
        _lxRefreshTable();
    });
    h.appendChild(btnRefresh);

    h.appendChild(Object.assign(document.createElement('div'), { style: 'flex:1' }));

    const btnOptions = document.createElement('button');
    btnOptions.className = 'btn btn-secondary logo-options';
    btnOptions.style.padding = '10px';
    btnOptions.textContent = 'Options';
    btnOptions.addEventListener('click', () => _lxOuvrirOptions());
    h.appendChild(btnOptions);

    

    const btnQuit = document.createElement('button');
    btnQuit.className = 'btn btn-secondary';
    btnQuit.style.padding = '10px';
    btnQuit.textContent = '✖ Fermer';
    btnQuit.addEventListener('click', () => divRoot.remove());
    h.appendChild(btnQuit);

    return h;
}

// ============================================================
// PANNEAUX LATÉRAUX
// ============================================================

function _lxCreerPanneau(id, titre) {
    const pnl = document.createElement('div');
    pnl.id = id;
    pnl.className = 'lx-panel';

    const head = document.createElement('div');
    head.className = 'lx-panel-head';

    const t = document.createElement('span');
    t.textContent = titre;
    head.appendChild(t);

    const close = document.createElement('span');
    close.className = 'lx-panel-close';
    close.textContent = '✕';
    close.addEventListener('click', () => { pnl.classList.add('lx-hidden'); _lxAjusterLargeurPanneaux(); });
    head.appendChild(close);

    pnl.appendChild(head);

    const body = document.createElement('div');
    body.className = 'lx-panel-body';
    pnl.appendChild(body);

    return { pnl, body, head };
}

/**
 * Crée un bouton on/off (icône onoff.png, même style qu'activeallcat) pour basculer
 * tous les éléments d'un panneau en une seule action.
 */
function _lxCreerBtnTout(getItems, isActif, appliquer, onAppliquer = null) {
    const btn = document.createElement('label');
    btn.className = 'btnbleu activeallcat lx-pnl-onoff';
    const maj = () => {
        const items = [...getItems()];
        const tousActifs = items.length > 0 && items.every(isActif);
        btn.title = tousActifs ? 'Tout désactiver' : 'Tout activer';
    };
    btn.addEventListener('click', () => {
        const items = [...getItems()];
        const tousActifs = items.length > 0 && items.every(isActif);
        if (typeof onAppliquer === 'function') onAppliquer();
        appliquer(!tousActifs);
        maj();
        _lxRefreshTable();
    });
    return { btn, maj };
}

// ---- Thématiques — même apparence que conteneur_cat ----

function _lxPanneauThm() {
    const { pnl, body, head } = _lxCreerPanneau('lxPnlThm', 'Catégories');
    pnl.classList.add('lx-hidden');
    body.classList.add('conteneur_cat');

    const _lxPropagerEtatThmAuxDescendants = (tabThmLocal, indexThm, nouvelEtat) => {
        const rangParent = Number(tabThmLocal[indexThm].rang);
        for (let i = indexThm + 1; i < tabThmLocal.length; i++) {
            if (Number(tabThmLocal[i].rang) > rangParent) {
                tabThmLocal[i].act = nouvelEtat;
                const descendant = body.querySelector(`.ligthm[data-code="${tabThmLocal[i].code}"]`);
                if (descendant) descendant.classList.toggle('ligthm-inactive', !nouvelEtat);
            } else {
                break;
            }
        }
    };

    const { btn: btnThmAll, maj: majThmBtn } = _lxCreerBtnTout(
        () => body.querySelectorAll('.ligthm[data-code]'),
        el  => !el.classList.contains('ligthm-inactive'),
        activer => body.querySelectorAll('.ligthm[data-code]').forEach(l => l.classList.toggle('ligthm-inactive', !activer))
    );
    head.insertBefore(btnThmAll, head.firstChild);

    tabThm
        .filter(t => !t.code.startsWith('cat_int_'))
        .forEach((thm, idxThm) => {
            const lbl = document.createElement('label');
            lbl.dataset.code = thm.code;
            lbl.classList.add(thm.code, 'ligthm');

            // Hiérarchie de rang (indentation des sous-catégories)
            const chnRg = thm.rang ? 'rang_' + thm.rang : 'rang_0';
            lbl.classList.add(chnRg);

            // État initial : inactif si désactivé globalement
            if (thm.act === false || thm.act === 'false') {
                lbl.classList.add('ligthm-inactive');
            }

            lbl.textContent = (typeof splitNomThm === 'function')
                ? splitNomThm(thm.nom)[0] : (thm.nom || thm.code);
            lbl.title = (typeof splitNomThm === 'function')
                ? splitNomThm(thm.nom)[1] : '';
            lbl.style.cursor = 'pointer';
            if (thm.couleur) lbl.style.backgroundColor = thm.couleur + '30';

            // Clic gauche : bascule l'état actif/inactif dans le panneau lexico uniquement
            lbl.addEventListener('click', () => {
                const nouvelEtat = lbl.classList.contains('ligthm-inactive');
                lbl.classList.toggle('ligthm-inactive');
                thm.act = nouvelEtat;
                _lxPropagerEtatThmAuxDescendants(tabThm, idxThm, nouvelEtat);
                _lxRefreshTable();
            });

            // Clic droit : isoler la branche — la thématique et ses descendants restent actifs
            lbl.addEventListener('contextmenu', e => {
                e.preventDefault();
                body.querySelectorAll('.ligthm[data-code]').forEach(l => l.classList.add('ligthm-inactive'));
                tabThm.forEach(thmItem => { thmItem.act = false; });
                lbl.classList.remove('ligthm-inactive');
                thm.act = true;
                _lxPropagerEtatThmAuxDescendants(tabThm, idxThm, true);
                _lxRefreshTable();
            });

            body.appendChild(lbl);
        });

    majThmBtn();
    return pnl;
}

// ---- Variables — même apparence que les Tris à plat ----

function _lxPanneauVar() {
    const { pnl, body, head } = _lxCreerPanneau('lxPnlVar', 'Variables');
    pnl.classList.add('lx-hidden');
    const etatCorpus = _lxEtatVariablesCorpus();

    const varsAffichees = (typeof tabVar !== 'undefined') ? [...tabVar] : [];
    if (varsAffichees.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'lx-empty';
        msg.textContent = 'Aucune variable définie.';
        body.appendChild(msg);
        return pnl;
    }

    const { btn: btnVarAll, maj: majVarBtn } = _lxCreerBtnTout(
        () => body.querySelectorAll('.btn-onoff-ent:not([data-vide="1"])'),
        el  => el.classList.contains('btn-onoff-ent--actif'),
        activer => body.querySelectorAll('.btn-onoff-ent:not([data-vide="1"])').forEach(b => b.classList.toggle('btn-onoff-ent--actif', activer)),
        () => { lxIgnorerFiltreVariablesInitial = false; }
    );
    head.insertBefore(btnVarAll, head.firstChild);

    let varIdx = 0;
    varsAffichees.forEach(v => {
        const coulVar = `var(--coul-loc${(varIdx % 20) + 1})`;
        varIdx++;

        const mods = (typeof tabDic !== 'undefined')
            ? tabDic.filter(d => Number(d.v) === Number(v.v) && Number(d.m) > 0)
            : [];
        if (mods.length === 0) return;

        // Bloc variable
        const divVar = document.createElement('div');
        divVar.classList.add('tap-var');
        body.appendChild(divVar);

        // En-tête de la variable (cliquable pour déplier)
        const lblVar = document.createElement('div');
        lblVar.classList.add('tap-var-lbl');
        lblVar.style.color = coulVar;
        lblVar.style.borderBottomColor = coulVar;
        divVar.appendChild(lblVar);

        const lblVarTxt = document.createElement('span');
    lblVarTxt.textContent = v.lib + (v.champ === 'loc' ? ' – locuteurs' : '');
        lblVar.appendChild(lblVarTxt);

        const btnCollapse = document.createElement('span');
        btnCollapse.classList.add('tap-collapse-btn');
        btnCollapse.textContent = '▼'; // replié par défaut
        lblVar.appendChild(btnCollapse);

        // Conteneur des modalités (replié par défaut)
        const divMods = document.createElement('div');
        divMods.classList.add('tap-mods');
        divMods.style.display = 'none';
        divVar.appendChild(divMods);

        const etatVar = etatCorpus.get(String(v.v));
        if (etatVar && etatVar.ouvert) {
            divMods.style.display = '';
            btnCollapse.textContent = '▲';
        }

        lblVar.addEventListener('click', () => {
            const repli = divMods.style.display === 'none';
            divMods.style.display = repli ? '' : 'none';
            btnCollapse.textContent = repli ? '▲' : '▼';
        });

        // Lignes de modalités
        mods.forEach(mod => {
            const divRow = document.createElement('div');
            divRow.classList.add('tap-row');
            divMods.appendChild(divRow);

            const btnSwitch = document.createElement('button');
            btnSwitch.classList.add('btn-onoff-ent');
            btnSwitch.dataset.v = v.v;
            btnSwitch.dataset.m = mod.m;
            btnSwitch.dataset.vide = _lxModaliteVarACibles(v.v, mod.m, v.champ) ? '0' : '1';
            // Ne pas heriter des etats actifs/inactifs du tri a plat:
            // la lexico doit demarrer avec toutes les modalites actives.
            const modaliteActive = true;
            btnSwitch.classList.toggle('btn-onoff-ent--actif', modaliteActive);
            btnSwitch.title = 'Clic gauche\u00a0: inclure / exclure\nClic droit\u00a0: isoler cette modalité';
            btnSwitch.addEventListener('click', e => {
                e.stopPropagation();
                lxIgnorerFiltreVariablesInitial = false;
                btnSwitch.classList.toggle('btn-onoff-ent--actif');
                _lxRefreshTable();
            });
            btnSwitch.addEventListener('contextmenu', e => {
                e.preventDefault(); e.stopPropagation();
                lxIgnorerFiltreVariablesInitial = false;
                // Isoler : désactiver les autres modalités de CETTE variable uniquement
                document.querySelectorAll(`#lxPnlVar .btn-onoff-ent[data-v="${v.v}"]`).forEach(b => b.classList.remove('btn-onoff-ent--actif'));
                btnSwitch.classList.add('btn-onoff-ent--actif');
                _lxRefreshTable();
            });
            divRow.appendChild(btnSwitch);

            const lblMod = document.createElement('div');
            lblMod.classList.add('tap-mod-lbl');
            lblMod.textContent = mod.lib;
            lblMod.title = 'Clic gauche\u00a0: inclure / exclure\nClic droit\u00a0: isoler cette modalité';
            lblMod.addEventListener('click', () => {
                lxIgnorerFiltreVariablesInitial = false;
                btnSwitch.classList.toggle('btn-onoff-ent--actif');
                _lxRefreshTable();
            });
            lblMod.addEventListener('contextmenu', e => {
                e.preventDefault();
                lxIgnorerFiltreVariablesInitial = false;
                document.querySelectorAll(`#lxPnlVar .btn-onoff-ent[data-v="${v.v}"]`).forEach(b => b.classList.remove('btn-onoff-ent--actif'));
                btnSwitch.classList.add('btn-onoff-ent--actif');
                _lxRefreshTable();
            });
            divRow.appendChild(lblMod);
        });

        // Ligne « Non renseigné »
        const divRowNR = document.createElement('div');
        divRowNR.classList.add('tap-row', 'tap-row--nr');
        divMods.appendChild(divRowNR);

        const btnNR = document.createElement('button');
        btnNR.classList.add('btn-onoff-ent');
        btnNR.dataset.v = v.v;
        btnNR.dataset.m = '0';
        btnNR.dataset.vide = _lxModaliteVarACibles(v.v, 0, v.champ) ? '0' : '1';
        const nonRenseigneActif = true;
        btnNR.classList.toggle('btn-onoff-ent--actif', nonRenseigneActif);
        btnNR.title = 'Clic gauche\u00a0: inclure / exclure les non-renseignés\nClic droit\u00a0: isoler';
        btnNR.addEventListener('click', e => {
            e.stopPropagation();
            lxIgnorerFiltreVariablesInitial = false;
            btnNR.classList.toggle('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        btnNR.addEventListener('contextmenu', e => {
            e.preventDefault(); e.stopPropagation();
            lxIgnorerFiltreVariablesInitial = false;
            document.querySelectorAll(`#lxPnlVar .btn-onoff-ent[data-v="${v.v}"]`).forEach(b => b.classList.remove('btn-onoff-ent--actif'));
            btnNR.classList.add('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        divRowNR.appendChild(btnNR);

        const lblNR = document.createElement('div');
        lblNR.classList.add('tap-mod-lbl', 'tap-mod-lbl--nr');
        lblNR.textContent = 'Non renseigné';
        lblNR.title = 'Clic gauche\u00a0: inclure / exclure les non-renseignés\nClic droit\u00a0: isoler';
        lblNR.addEventListener('click', () => {
            lxIgnorerFiltreVariablesInitial = false;
            btnNR.classList.toggle('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        lblNR.addEventListener('contextmenu', e => {
            e.preventDefault();
            lxIgnorerFiltreVariablesInitial = false;
            document.querySelectorAll(`#lxPnlVar .btn-onoff-ent[data-v="${v.v}"]`).forEach(b => b.classList.remove('btn-onoff-ent--actif'));
            btnNR.classList.add('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        divRowNR.appendChild(lblNR);
    });

    majVarBtn();
    return pnl;
}

// ---- Entretiens ----

function _lxPanneauEnt() {
    const { pnl, body, head } = _lxCreerPanneau('lxPnlEnt', 'Entretiens');
    pnl.classList.add('lx-hidden');

    const { btn: btnEntAll, maj: majEntBtn } = _lxCreerBtnTout(
        () => body.querySelectorAll('.btn-onoff-ent[data-ent-idx]'),
        el  => el.classList.contains('btn-onoff-ent--actif'),
        activer => body.querySelectorAll('.btn-onoff-ent[data-ent-idx]').forEach(b => b.classList.toggle('btn-onoff-ent--actif', activer))
    );
    head.insertBefore(btnEntAll, head.firstChild);

    tabEnt.forEach((ent, i) => {
        const row = document.createElement('div');
        row.className = 'lx-ent-row';

        // Compatibilité : la propriété peut s'appeler actif ou act
        const estActif = (ent.actif !== undefined) ? (ent.actif !== 0) : (ent.act !== 0);

        const btnSwitch = document.createElement('button');
        btnSwitch.classList.add('btn-onoff-ent');
        if (estActif) btnSwitch.classList.add('btn-onoff-ent--actif');
        btnSwitch.dataset.entIdx = i;
        btnSwitch.title = 'Clic gauche\u00a0: inclure / exclure\nClic droit\u00a0: isoler cet entretien';
        btnSwitch.addEventListener('click', e => {
            e.stopPropagation();
            btnSwitch.classList.toggle('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        btnSwitch.addEventListener('contextmenu', e => {
            e.preventDefault(); e.stopPropagation();
            body.querySelectorAll('.btn-onoff-ent[data-ent-idx]').forEach(b => b.classList.remove('btn-onoff-ent--actif'));
            btnSwitch.classList.add('btn-onoff-ent--actif');
            _lxRefreshTable();
        });
        row.appendChild(btnSwitch);

        const lbl = document.createElement('span');
        lbl.className = 'lx-ent-nom';
        lbl.textContent = ent.nom || `Entretien ${i + 1}`;
        lbl.title = 'Clic gauche\u00a0: inclure / exclure\nClic droit\u00a0: isoler cet entretien';
        row.appendChild(lbl);

        // Clic sur la ligne (hors bouton) → bascule le bouton
        row.addEventListener('click', e => {
            if (e.target === btnSwitch) return;
            btnSwitch.classList.toggle('btn-onoff-ent--actif');
            _lxRefreshTable();
        });

        // Clic droit sur la ligne → isoler cet entretien
        row.addEventListener('contextmenu', e => {
            e.preventDefault();
            body.querySelectorAll('.btn-onoff-ent[data-ent-idx]').forEach(b => b.classList.remove('btn-onoff-ent--actif'));
            btnSwitch.classList.add('btn-onoff-ent--actif');
            _lxRefreshTable();
        });

        body.appendChild(row);
    });

    majEntBtn();
    return pnl;
}

// ============================================================
// PANNEAU CENTRAL — INDEX DES FORMES
// ============================================================

function _lxPanneauIndex() {
    const pnl = document.createElement('div');
    pnl.id = 'lxPnlIndex';
    pnl.className = 'lx-index';

    // Barre d'information (totaux)
    const infoBar = document.createElement('div');
    infoBar.id = 'lx-infobar';
    infoBar.className = 'lx-infobar';
    _lxMajInfoBar(infoBar, tabOccLexico);
    pnl.appendChild(infoBar);

    // Barre de recherche
    const srch = document.createElement('div');
    srch.className = 'lx-searchbar';
    const inp = document.createElement('input');
    inp.type = 'search';
    inp.id = 'lx-search';
    inp.placeholder = 'Cherchez une forme…';
    inp.className = 'lx-search-input';
    inp.addEventListener('input', () => _lxRefreshTable());
    srch.appendChild(inp);
    pnl.appendChild(srch);

    // ---- Barre de sélection (>= 1 forme cochée) ----
    const selBar = document.createElement('div');
    selBar.id = 'lx-selbar';
    selBar.className = 'lx-selbar lx-selbar--hidden';

    const selBarCount = document.createElement('span');
    selBarCount.className = 'lx-selbar-count';
    selBar.appendChild(selBarCount);

    const btnReg = document.createElement('button');
    btnReg.className = 'btn btn-secondary lx-selbar-btn logo-grouper';
    btnReg.textContent = 'Group';
    btnReg.title = 'Fusionner les formes sélectionnées en une seule entrée';
    btnReg.addEventListener('click', _lxRegrouperFormes);
    selBar.appendChild(btnReg);

    const btnSpont = document.createElement('button');
    btnSpont.id = 'lx-btn-spont';
    btnSpont.className = 'btn btn-secondary lx-selbar-btn lx-selbar-btn--hidden';
    btnSpont.textContent = 'Spontanéité';
    btnSpont.title = 'Analyser la spontanéité (une seule forme sélectionnée)';
    btnSpont.addEventListener('click', _lxOuvrirModalSpontaneite);
    selBar.appendChild(btnSpont);

    const btnMO = document.createElement('button');
    btnMO.id = 'lx-btn-mo';
    btnMO.className = 'btn btn-secondary lx-selbar-btn';
    btnMO.textContent = '🔧+ ajout aux mots outils';
    btnMO.title = 'Ajouter les formes sélectionnées aux mots outils (mots vides)';
    btnMO.addEventListener('click', () => {
        lxVueDonnees.filter(d => d.selectionne).forEach(d => lxMotsOutils.add(d.forme));
        lxVueDonnees.forEach(d => { d.selectionne = false; });
        tabOccLexico.forEach(d => { d.selectionne = false; });
        _lxRefreshTable();
        _lxSauvegarderOut();
    });
    selBar.appendChild(btnMO);

    const btnContexte = document.createElement('button');
    btnContexte.id = 'lx-btn-contexte';
    btnContexte.className = 'btn btn-secondary lx-selbar-btn lx-selbar-btn--hidden';
    btnContexte.textContent = '➕ Voir contexte';
    btnContexte.title = 'Voir les occurrences en contexte (une seule forme sélectionnée)';
    btnContexte.addEventListener('click', () => {
        const sel = lxVueDonnees.find(d => d.selectionne);
        if (sel) _lxOuvrirModalOccurrences(sel.forme);
    });
    selBar.appendChild(btnContexte);

    const btnDeplier = document.createElement('button');
    btnDeplier.id = 'lx-btn-deplier';
    btnDeplier.className = 'btn btn-secondary lx-selbar-btn lx-selbar-btn--hidden';
    btnDeplier.textContent = '▼ Déplier';
    btnDeplier.title = 'Afficher les sous-formes regroupées sous cette entrée';
    btnDeplier.addEventListener('click', () => {
        const sel = lxVueDonnees.find(d => d.selectionne);
        if (!sel) return;
        const idx = lxVueDonnees.indexOf(sel);
        const tbody = document.getElementById('lx-tbody');
        if (!tbody) return;
        while (lxVueOffset <= idx && lxVueOffset < lxVueDonnees.length) _lxAppendBatch(tbody);
        const rows = tbody.querySelectorAll('tr.lx-row:not(.lx-sub-row)');
        const trParent = rows[idx];
        if (trParent) _lxBasculerSousFormes(trParent, sel.forme, Math.log10(lxMaxFreqGlobal + 1));
    });
    selBar.appendChild(btnDeplier);

    const btnDesel = document.createElement('button');
    btnDesel.className = 'btn btn-secondary lx-selbar-btn';
    btnDesel.textContent = '✕ ';
    btnDesel.addEventListener('click', () => {
        lxVueDonnees.forEach(d => { d.selectionne = false; });
        document.querySelectorAll('#lx-tbody .lx-row--sel').forEach(r => {
            r.classList.remove('lx-row--sel');
            const c = r.querySelector('input[type="checkbox"]');
            if (c) c.checked = false;
        });
        _lxMajSelBar();
    });
    selBar.appendChild(btnDesel);
    pnl.appendChild(selBar);

    // Tableau scrollable
    const wrap = document.createElement('div');
    wrap.className = 'lx-table-wrap';
    _lxRBInstaller(wrap);

    const table = document.createElement('table');
    table.className = 'lx-table';
    table.appendChild(_lxTableHeader());

    const tbody = document.createElement('tbody');
    tbody.id = 'lx-tbody';
    table.appendChild(tbody);
    wrap.appendChild(table);
    pnl.appendChild(wrap);

    _lxRendreTable(tbody, tabOccLexico);
    return pnl;
}

// ============================================================
// PANNEAU WORDLE
// ============================================================

var _lxWordleN = 50;

function _lxToggleWordle() {
    const existing = document.getElementById('lx-wordle-panel');
    if (existing) {
        existing.remove();
        return;
    }
    const pnlIndex = document.getElementById('lxPnlIndex');
    if (!pnlIndex) return;
    pnlIndex.appendChild(_lxCreerPanneauWordle());
    // Attendre un cycle de rendu pour que offsetWidth/Height soient disponibles
    requestAnimationFrame(() => _lxRendreWordle());
}

function _lxCreerPanneauWordle() {
    const panel = document.createElement('div');
    panel.id = 'lx-wordle-panel';
    panel.className = 'lx-wordle-panel';

    // ---- Poignée de redimensionnement (haut du panneau) ----
    const handle = document.createElement('div');
    handle.className = 'lx-wordle-handle';
    handle.title = 'Glisser pour redimensionner';
    panel.appendChild(handle);

    let _startY = 0, _startH = 0;
    handle.addEventListener('mousedown', e => {
        e.preventDefault();
        _startY = e.clientY;
        _startH = panel.offsetHeight;
        const onMove = ev => {
            const delta = _startY - ev.clientY; // vers le haut = positif
            const newH = Math.max(120, Math.min(700, _startH + delta));
            panel.style.height = newH + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _lxRendreWordle();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ---- En-tête ----
    const hdr = document.createElement('div');
    hdr.className = 'lx-wordle-header';

    const lbl = document.createElement('span');
    lbl.className = 'lx-wordle-title';
    lbl.textContent = 'Nuage de mots';
    hdr.appendChild(lbl);

    const sel = document.createElement('select');
    sel.className = 'lx-wordle-sel';
    [50, 100].forEach(n => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = n + ' formes';
        if (n === _lxWordleN) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
        _lxWordleN = Number(sel.value);
        _lxRendreWordle();
    });
    hdr.appendChild(sel);

    const btnClose = document.createElement('span');
    btnClose.className = 'lx-wordle-close';
    btnClose.textContent = '✕';
    btnClose.title = 'Fermer le nuage';
    btnClose.addEventListener('click', () => panel.remove());
    hdr.appendChild(btnClose);

    panel.appendChild(hdr);

    // ---- Canvas ----
    const canvas = document.createElement('canvas');
    canvas.id = 'lx-wordle-canvas';
    canvas.className = 'lx-wordle-canvas';
    panel.appendChild(canvas);

    return panel;
}

function _lxRendreWordle() {
    const panel  = document.getElementById('lx-wordle-panel');
    const canvas = document.getElementById('lx-wordle-canvas');
    if (!panel || !canvas) return;

    const source = (typeof lxVueDonnees !== 'undefined' && lxVueDonnees.length > 0)
        ? lxVueDonnees
        : tabOccLexico;

    // Ne pas afficher les sous-representations dans le nuage.
    const visibles = source.filter(d => d.specSign !== 'NEG');
    const top = visibles.slice(0, _lxWordleN);

    const maxFreq = top[0].occTotal || 1;
    const list = top.map(d => {
        const mot = (d.substitution && d.substitution.trim()) ? d.substitution : d.forme;
        const taille = Math.max(1, Math.round(10 + Math.sqrt((d.occTotal || 0) / maxFreq) * 52));
        return [mot, taille];
    });

    const hdrEl    = panel.querySelector('.lx-wordle-header');
    const handleEl = panel.querySelector('.lx-wordle-handle');
    const hdrH     = hdrEl    ? hdrEl.offsetHeight    : 28;
    const handleH  = handleEl ? handleEl.offsetHeight : 8;
    const W = Math.round(panel.offsetWidth)  || 600;
    const H = Math.max(80, Math.round(panel.offsetHeight - hdrH - handleH - 2));

    if (W === 0 || H === 0) return;   // panneau pas encore peint
    canvas.width  = W;
    canvas.height = H;

    if (top.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#888';
        ctx.font = '13px sans-serif';
        ctx.fillText('Aucune forme a afficher', 10, 24);
        return;
    }

    if (typeof WordCloud === 'undefined') {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#c00';
        ctx.font = '14px sans-serif';
        ctx.fillText('Erreur : wordcloud2 non chargé', 10, 30);
        return;
    }

    WordCloud(canvas, {
        list,
        gridSize:        Math.round(6 * W / 600),
        weightFactor:    1,
        fontFamily:      'Arial, sans-serif',
        color:           'random-dark',
        rotateRatio:     0.3,
        minRotation:     Math.PI / 2,
        maxRotation:     Math.PI / 2,
        backgroundColor: 'transparent',
        drawOutOfBound:  false,
        shrinkToFit:     true,
    });
}

// ============================================================
// MODALE OPTIONS
// ============================================================

function _lxOuvrirOptions() {
    document.getElementById('lx-options-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lx-options-overlay';
    overlay.className = 'lx-options-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'lx-options-modal';

    // ---- En-tête ----
    const header = document.createElement('div');
    header.className = 'lx-options-header';

    const titre = document.createElement('h3');
    titre.className = 'lx-options-title';
    titre.textContent = 'Options';
    header.appendChild(titre);

    const btnClose = document.createElement('div');
    btnClose.className = 'close';
    btnClose.textContent = '✖️';
    btnClose.style.cursor = 'pointer';
    btnClose.addEventListener('click', () => overlay.remove());
    header.appendChild(btnClose);

    modal.appendChild(header);

    // ---- Corps ----
    const body = document.createElement('div');
    body.className = 'lx-options-body';

    // Ligne 1 : Exclure les questions
    const rowQ = document.createElement('div');
    rowQ.className = 'lx-opt-row';
    const chkQ = document.createElement('input');
    chkQ.type = 'checkbox';
    chkQ.id = 'lx-opt-excl-quest';
    chkQ.checked = lxOptExclureQuestions;
    const lblQ = document.createElement('label');
    lblQ.htmlFor = 'lx-opt-excl-quest';
    lblQ.textContent = 'Exclure les questions';
    rowQ.appendChild(chkQ);
    rowQ.appendChild(lblQ);
    body.appendChild(rowQ);

    // Afficher le nuage de mots (Wordle)
    const rowWordle = document.createElement('div');
    rowWordle.className = 'lx-opt-row';
    const chkWordle = document.createElement('input');
    chkWordle.type = 'checkbox';
    chkWordle.id = 'lx-opt-wordle';
    chkWordle.checked = lxOptAfficherWordle;
    const lblWordle = document.createElement('label');
    lblWordle.htmlFor = 'lx-opt-wordle';
    lblWordle.textContent = 'Afficher le nuage de mots';
    rowWordle.appendChild(chkWordle);
    rowWordle.appendChild(lblWordle);
    body.appendChild(rowWordle);

    // Sous partie
    const sep = document.createElement('H3');
    sep.className = 'lx-opt-sep';
    sep.textContent = 'Affichage';
    body.appendChild(sep);

    // Ligne 2 : Occurrence minimum
    const rowOcc = document.createElement('div');
    rowOcc.className = 'lx-opt-row';
    const chkOcc = document.createElement('input');
    chkOcc.type = 'checkbox';
    chkOcc.id = 'lx-opt-occ-chk';
    chkOcc.checked = lxOptOccMin > 1;
    const lblOcc = document.createElement('label');
    lblOcc.htmlFor = 'lx-opt-occ-chk';
    lblOcc.textContent = 'Occurrences min  :';
    rowOcc.appendChild(chkOcc);
    rowOcc.appendChild(lblOcc);

    const occWrap = document.createElement('div');
    occWrap.className = 'lx-opt-occ-wrap';

    const inputOcc = document.createElement('input');
    inputOcc.type = 'number';
    inputOcc.id = 'lx-opt-occ-input';
    inputOcc.min = '1';
    inputOcc.value = String(lxOptOccMin);

    /*const selOcc = document.createElement('select');
    selOcc.id = 'lx-opt-occ-sel';
    [1, 10, 20, 50, 100].forEach(v => {
        const opt = document.createElement('option');
        opt.value = String(v);
        opt.textContent = String(v);
        selOcc.appendChild(opt);
    });
    if ([1, 10, 20, 50, 100].includes(lxOptOccMin)) selOcc.value = String(lxOptOccMin);
    selOcc.addEventListener('change', () => { inputOcc.value = selOcc.value; });
    inputOcc.addEventListener('input', () => {
        const v = parseInt(inputOcc.value, 10);
        selOcc.value = [1, 10, 20, 50, 100].includes(v) ? String(v) : '';
    });
    */
    const majEtatOcc = () => {
        inputOcc.disabled = !chkOcc.checked;
        //selOcc.disabled   = !chkOcc.checked;
    };
    chkOcc.addEventListener('change', majEtatOcc);
    majEtatOcc();

    occWrap.appendChild(inputOcc);
    //occWrap.appendChild(selOcc);
    rowOcc.appendChild(occWrap);
    body.appendChild(rowOcc);

    // Ligne 3 : Afficher les spécificités négatives
    const rowSpec = document.createElement('div');
    rowSpec.className = 'lx-opt-row';
    const chkSpec = document.createElement('input');
    chkSpec.type = 'checkbox';
    chkSpec.id = 'lx-opt-spec-neg';
    chkSpec.checked = lxOptAfficherSpecNeg;
    const lblSpec = document.createElement('label');
    lblSpec.htmlFor = 'lx-opt-spec-neg';
    lblSpec.textContent = 'Afficher les spécificités négatives';
    rowSpec.appendChild(chkSpec);
    rowSpec.appendChild(lblSpec);
    body.appendChild(rowSpec);

    // Ligne 4 : Afficher les chiffres
    const rowChif = document.createElement('div');
    rowChif.className = 'lx-opt-row';
    const chkChif = document.createElement('input');
    chkChif.type = 'checkbox';
    chkChif.id = 'lx-opt-afficher-chiffres';
    chkChif.checked = lxOptAfficherChiffres;
    const lblChif = document.createElement('label');
    lblChif.htmlFor = 'lx-opt-afficher-chiffres';
    lblChif.textContent = 'Afficher les chiffres';
    rowChif.appendChild(chkChif);
    rowChif.appendChild(lblChif);
    body.appendChild(rowChif);

    const rowAfficherVrb = document.createElement('div');
    rowAfficherVrb.className = 'lx-opt-row';
    const chkAfficherVrb = document.createElement('input');
    chkAfficherVrb.type = 'checkbox';
    chkAfficherVrb.id = 'lx-opt-afficher-lemma-verbes';
    chkAfficherVrb.checked = lxOptAfficherVerbesLemmes;
    const lblAfficherVrb = document.createElement('label');
    lblAfficherVrb.htmlFor = 'lx-opt-afficher-lemma-verbes';
    lblAfficherVrb.textContent = 'Afficher verbes lemmatisés';
    rowAfficherVrb.appendChild(chkAfficherVrb);
    rowAfficherVrb.appendChild(lblAfficherVrb);
    body.appendChild(rowAfficherVrb);

    // Sous partie
    const sep2 = document.createElement('H3');
    sep2.className = 'lx-opt-sep';
    sep2.textContent = 'Lemmatisation';
    body.appendChild(sep2);

    // Ligne 5 : Lemmatisation automatique des verbes
    const rowVrb = document.createElement('div');
    rowVrb.className = 'lx-opt-row';
    const chkVrb = document.createElement('input');
    chkVrb.type = 'checkbox';
    chkVrb.id = 'lx-opt-lemma-verbes';
    chkVrb.checked = lxOptLemmatiserVerbes;
    const lblVrb = document.createElement('label');
    lblVrb.htmlFor = 'lx-opt-lemma-verbes';
    lblVrb.textContent = 'Lemmatiser verbes';

    const majEtatAfficherVrb = () => {
        chkAfficherVrb.disabled = !chkVrb.checked;
        lblAfficherVrb.style.opacity = chkVrb.checked ? '1' : '0.55';
    };
    chkVrb.addEventListener('change', majEtatAfficherVrb);
    majEtatAfficherVrb();

    rowVrb.appendChild(chkVrb);
    rowVrb.appendChild(lblVrb);
    body.appendChild(rowVrb);



    // Ligne 7 : Ouvrir l'edition des mots outils
    const rowMO = document.createElement('div');
    rowMO.className = 'lx-opt-row';
    const btnMO = document.createElement('label');
    btnMO.className = 'btnfonction';
    btnMO.textContent = '✏️ Editer les mots outils';
    btnMO.title = 'Ouvrir la gestion des mots outils';
    btnMO.addEventListener('click', () => {
        _lxOuvrirGestionMotsOutils();
    });
    rowMO.appendChild(btnMO);
    body.appendChild(rowMO);

    // Ligne 8 : Ouvrir la gestion des concatenations lexicales
    const rowConcat = document.createElement('div');
    rowConcat.className = 'lx-opt-row';
    const btnConcat = document.createElement('label');
    btnConcat.className = 'btnfonction';
    btnConcat.textContent = '🔗 Concatener des formes';
    btnConcat.title = 'Construire une forme composee a partir de mots consecutifs';
    btnConcat.addEventListener('click', () => {
        _lxOuvrirGestionConcatenations();
    });
    rowConcat.appendChild(btnConcat);
    body.appendChild(rowConcat);

    modal.appendChild(body);

    // ---- Pied de page ----
    const footer = document.createElement('div');
    footer.className = 'lx-options-footer';

    const btnValider = document.createElement('label');
    btnValider.className = 'btnfonction btnlarge';
    btnValider.textContent = 'Valider';
    btnValider.addEventListener('click', async () => {
        btnValider.style.pointerEvents = 'none';
        lxOptExclureQuestions = chkQ.checked;
        lxOptOccMin           = chkOcc.checked ? Math.max(1, parseInt(inputOcc.value, 10) || 1) : 1;
        lxOptAfficherSpecNeg  = chkSpec.checked;
        lxOptAfficherChiffres = chkChif.checked;
        lxOptAfficherWordle   = chkWordle.checked;
        const prevLemmaVerbes = lxOptLemmatiserVerbes;
        lxOptLemmatiserVerbes = chkVrb.checked;
        lxOptAfficherVerbesLemmes = chkAfficherVrb.checked;

        if (prevLemmaVerbes !== lxOptLemmatiserVerbes) {
            await _lxAppliquerOptionLemmatisationVerbes(lxOptLemmatiserVerbes);
        }

        const wordleVisible = !!document.getElementById('lx-wordle-panel');
        if (chkWordle.checked && !wordleVisible) {
            const pnlIndex = document.getElementById('lxPnlIndex');
            if (pnlIndex) {
                pnlIndex.appendChild(_lxCreerPanneauWordle());
                requestAnimationFrame(() => _lxRendreWordle());
            }
        } else if (!chkWordle.checked && wordleVisible) {
            document.getElementById('lx-wordle-panel').remove();
        }

        overlay.remove();
        _lxRefreshTable();
    });
    footer.appendChild(btnValider);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function _lxMajInfoBar(bar, données) {
    const total  = données.reduce((s, d) => s + d.occTotal, 0);
    const totAll = tabLexico.length || 1;
    const pct    = Math.round(total / totAll * 100);
    bar.innerHTML =
        `<span class="lx-info-occ"><strong>${total.toLocaleString('fr-FR')}</strong> occurrences\u00a0(${pct}%)</span>` +
        `<span class="lx-info-diff"><strong>${données.length.toLocaleString('fr-FR')}</strong> formes différentes</span>`;
}

function _lxMajCheckboxToutEntete() {
    const chkAll = document.getElementById('lx-th-chk-all');
    if (!chkAll) return;

    chkAll.classList.toggle('lx-th-chk-all--hidden', !lxFiltreListeTexteActif);

    if (!lxFiltreListeTexteActif) {
        chkAll.checked = false;
        chkAll.indeterminate = false;
        chkAll.disabled = true;
        return;
    }

    const total = lxVueDonnees.length;
    const nSel = lxVueDonnees.filter(d => d.selectionne).length;
    chkAll.disabled = total === 0;
    chkAll.checked = total > 0 && nSel === total;
    chkAll.indeterminate = nSel > 0 && nSel < total;
}

// ============================================================
// EN-TÊTE DU TABLEAU AVEC TRI
// ============================================================

function _lxTableHeader() {
    const thead = document.createElement('thead');
    const tr    = document.createElement('tr');

    const cols = [
        { txt: '',        cls: 'lx-th-chk',   key: null    },
        { txt: '#',       cls: 'lx-th-rk',    key: null    },
        { txt: 'Formes',  cls: 'lx-th-forme', key: 'alpha' },
        { txt: 'Fréq.',   cls: 'lx-th-freq',  key: 'freq'  },
        { txt: '',        cls: 'lx-th-bar',   key: 'rel'   },
        { txt: 'Nb Ent.', cls: 'lx-th-nbent', key: 'nbEnt' },
        { txt: 'Spéc.',   cls: 'lx-th-pval',  key: 'pval'  },
    ];

    cols.forEach(col => {
        const th = document.createElement('th');
        th.className = col.cls;
        if (col.key) {
            th.classList.add('lx-sortable');
            th.title = 'Cliquez pour trier';
            th.addEventListener('click', () => {
                if (lexicoTriPar === col.key) lexicoDesc = !lexicoDesc;
                else { lexicoTriPar = col.key; lexicoDesc = true; }
                _lxTrier();
                _lxRefreshTable();
            });
        }
        if (col.cls === 'lx-th-chk') {
            const chkAll = document.createElement('input');
            chkAll.type = 'checkbox';
            chkAll.id = 'lx-th-chk-all';
            chkAll.className = 'lx-th-chk-all lx-th-chk-all--hidden';
            chkAll.title = 'Tout cocher / décocher les formes visibles';
            chkAll.disabled = true;
            chkAll.addEventListener('change', () => {
                const v = chkAll.checked;
                lxVueDonnees.forEach(d => { d.selectionne = v; });
                document.querySelectorAll('#lx-tbody tr.lx-row').forEach(tr => _lxRBSelectRow(tr, v));
                _lxMajSelBar();
            });
            th.appendChild(chkAll);
        } else if (col.cls === 'lx-th-bar') {
            th.innerHTML = _lxBarGraduationHtml();
        } else {
            th.textContent = col.txt;
        }
        tr.appendChild(th);
    });

    thead.appendChild(tr);
    return thead;
}

function _lxBarGraduationHtml() {
    if (lxHistogrammeComparatifActif) {
        const marksPct = [0, 25, 50, 75, 100];
        let htmlPct = '<div class="lx-scale">';
        marksPct.forEach(v => {
            htmlPct += `<span class="lx-scale-mark" style="left:${v}%">${v}%</span>`;
        });
        return htmlPct + '</div>';
    }

    const maxFreq = lxMaxFreqGlobal;
    const logMax = Math.log10(maxFreq + 1);
    const marks  = [1, 10, 100, 1000, 10000, 100000].filter(v => v <= maxFreq);
    let html = '<div class="lx-scale">';
    marks.forEach(v => {
        const pct   = (Math.log10(v + 1) / logMax) * 100;
        const label = v >= 1000 ? (v / 1000) + 'k' : String(v);
        html += `<span class="lx-scale-mark" style="left:${pct.toFixed(1)}%">${label}</span>`;
    });
    return html + '</div>';
}

function _lxMajEnteteBarre() {
    const thBar = document.querySelector('#lxPnlIndex .lx-th-bar');
    if (!thBar) return;
    thBar.innerHTML = _lxBarGraduationHtml();
}

// ============================================================
// RENDU DES LIGNES (chargement progressif par lot)
// ============================================================

/**
 * Réinitialise le tbody et charge le premier lot de lignes.
 * Les lots suivants sont déclenchés automatiquement par l'IntersectionObserver.
 */
function _lxRendreTable(tbody, données) {
    tbody.innerHTML = '';
    lxVueDonnees = données;
    lxVueOffset  = 0;
    lxParentRowUid = 0;
    _lxReconstruireTypesLemmesParForme();
    _lxAppendBatch(tbody);
}

/** Crée un <tr> pour une ligne de l'index. */
function _lxCreerLigne(item, idx, logMax) {
    const tr = document.createElement('tr');
    tr.className = 'lx-row' + (item.selectionne ? ' lx-row--sel' : '');
    tr.dataset.lxParentId = `lx-parent-${++lxParentRowUid}`;
    tr.dataset.lxExpanded = '0';

    // □ Checkbox sélection
    const tdChk = document.createElement('td');
    tdChk.className = 'lx-td-chk';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = item.selectionne;
    chk.addEventListener('change', e => {
        item.selectionne = e.target.checked;
        tr.classList.toggle('lx-row--sel', item.selectionne);
        _lxMajSelBar();
    });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    // Rang
    const tdRk = document.createElement('td');
    tdRk.className = 'lx-td-rk';
    tdRk.textContent = idx + 1;
    tr.appendChild(tdRk);

    // Forme
    const tdForme = document.createElement('td');
    tdForme.className = 'lx-td-forme';
    const spanForme = document.createElement('span');
    spanForme.className = 'lx-forme-txt';
    const classesLemme = _lxClassesLemmeForme(item.forme);
    if (classesLemme) spanForme.classList.add(...classesLemme.split(' '));
    spanForme.textContent = item.forme;
    tdForme.appendChild(spanForme);

    if (_lxFormeEstDeveloppable(item.forme)) {
        const btnExpand = document.createElement('button');
        btnExpand.className = 'lx-btn-expand';
        btnExpand.textContent = '▼';
        btnExpand.title = 'Afficher les formes réunies sous cette entrée';
        btnExpand.addEventListener('click', e => {
            e.stopPropagation();
            _lxBasculerSousFormes(tr, item.forme, logMax);
        });
        tdForme.appendChild(btnExpand);
    }

    const btnDet = document.createElement('button');
    btnDet.className = 'lx-btn-det';
    btnDet.textContent = '➕';
    btnDet.title = 'Voir les occurrences en contexte';
    btnDet.addEventListener('click', e => {
        e.stopPropagation();
        _lxOuvrirModalOccurrences(item.forme);
    });
    tdForme.appendChild(btnDet);



    tr.appendChild(tdForme);

    // Fréquence
    const tdFreq = document.createElement('td');
    tdFreq.className = 'lx-td-freq';
    tdFreq.textContent = item.occTotal.toLocaleString('fr-FR');
    tr.appendChild(tdFreq);

    // Barre: fréquence globale (sans filtre) ou proportion filtrée/global (avec filtre)
    const tdBar = document.createElement('td');
    tdBar.className = 'lx-td-bar';
    const occGlobal = Number.isFinite(item.occTotalGlobal) ? item.occTotalGlobal : item.occTotal;
    const occFiltree = item.occTotal;
    const afficherCompare = lxHistogrammeComparatifActif && Number.isFinite(item.occTotalGlobal) && occGlobal > 0;
    const pctBar = afficherCompare
        ? (occFiltree / occGlobal) * 100
        : (Math.log10(occGlobal + 1) / logMax) * 100;
    const pctTxt = pctBar.toFixed(1).replace('.', ',') + '%';

    tdBar.innerHTML =
        `<div class="lx-bar-wrap">` +
            `<div class="lx-bar-outer" title="Fréquence globale: ${occGlobal.toLocaleString('fr-FR')}${afficherCompare ? ` | Fréquence filtrée: ${occFiltree.toLocaleString('fr-FR')} | ${pctTxt}` : ''}">` +
                `<div class="lx-bar-inner" style="width:${pctBar.toFixed(1)}%"></div>` +
            `</div>` +
        `</div>`;
    tr.appendChild(tdBar);

    // Nombre d'entretiens
    const tdNbEnt = document.createElement('td');
    tdNbEnt.className = 'lx-td-nbent';
    tdNbEnt.textContent = item.nbEnt;
    tr.appendChild(tdNbEnt);

    // Spécificité (p-value Lafon) — uniquement en mode filtré
    const tdPval = document.createElement('td');
    tdPval.className = 'lx-td-pval';
    if (item.pValue !== undefined) {
        tdPval.textContent = (item.pValue * 100).toFixed(3);
        tdPval.style.color  = item.specSign === 'POS' ? '#2e7d32' : '#c62828';
        tdPval.title        = item.specSign === 'POS' ? 'Sur-représenté' : 'Sous-représenté';
    }
    tr.appendChild(tdPval);

    return tr;
}

/** Ajoute le lot suivant de LX_BATCH lignes dans tbody. */
function _lxAppendBatch(tbody) {
    if (lxVueOffset >= lxVueDonnees.length) return;

    const maxFreq = lxMaxFreqGlobal;
    const logMax  = Math.log10(maxFreq + 1);
    const fin     = Math.min(lxVueOffset + LX_BATCH, lxVueDonnees.length);

    const frag = document.createDocumentFragment();
    for (let i = lxVueOffset; i < fin; i++) {
        frag.appendChild(_lxCreerLigne(lxVueDonnees[i], i, logMax));
    }
    tbody.appendChild(frag);
    lxVueOffset = fin;

    _lxInstallSentinel(tbody);
}

/**
 * Place un <tr> sentinelle invisible en bas du tbody.
 * Quand il devient visible dans le scroll, le lot suivant est chargé.
 */
function _lxInstallSentinel(tbody) {
    tbody.querySelector('.lx-sentinel')?.remove();
    if (lxVueOffset >= lxVueDonnees.length) return;

    const sentinel = document.createElement('tr');
    sentinel.className = 'lx-sentinel';
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.cssText = 'height:1px; padding:0; border:0;';
    sentinel.appendChild(td);
    tbody.appendChild(sentinel);

    const wrap = document.querySelector('.lx-table-wrap');
    if (!wrap) return;

    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            sentinel.remove();
            _lxAppendBatch(tbody);
        }
    }, { root: wrap, threshold: 0 });

    observer.observe(sentinel);
}

// ============================================================
// SÉLECTION — barre de regroupement
// ============================================================

/**
 * Met à jour la barre de sélection (affichage / masquage, compteur).
 * Basé sur lxVueDonnees (données actuellement affichées).
 */
function _lxMajSelBar() {
    const sels = lxVueDonnees.filter(d => d.selectionne);
    const n = sels.length;
    const bar = document.getElementById('lx-selbar');
    if (!bar) return;
    const lbl = bar.querySelector('.lx-selbar-count');
    const btnSpont = document.getElementById('lx-btn-spont');
    const btnContexte = document.getElementById('lx-btn-contexte');
    const btnDeplier = document.getElementById('lx-btn-deplier');
    if (lbl) lbl.textContent = `${n}\u00a0forme${n > 1 ? 's' : ''}\u00a0sélectionnée${n > 1 ? 's' : ''}`;
    bar.classList.toggle('lx-selbar--hidden', n < 1);
    if (btnSpont) btnSpont.classList.toggle('lx-selbar-btn--hidden', n !== 1);
    if (btnContexte) btnContexte.classList.toggle('lx-selbar-btn--hidden', n !== 1);
    const seuleDeveloppable = n === 1 && _lxFormeEstDeveloppable(sels[0].forme);
    if (btnDeplier) btnDeplier.classList.toggle('lx-selbar-btn--hidden', !seuleDeveloppable);
    _lxMajCheckboxToutEntete();
}

function _lxFormesAssocieesACle(cleForme) {
    const cle = String(cleForme || '').trim();
    if (!cle) return [];

    const formes = new Set();
    let trouveParSubstitut = false;

    tabLexico.forEach(item => {
        const sub = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : '';
        if (sub && sub === cle) {
            formes.add(item.forme);
            trouveParSubstitut = true;
        }
    });

    if (!trouveParSubstitut) {
        tabLexico.forEach(item => {
            if (item.forme === cle) formes.add(item.forme);
        });
    }

    if (formes.size === 0) formes.add(cle);

    return Array.from(formes).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

/**
 * Ouvre la modale de lemmatisation pour les formes sélectionnées.
 */
function _lxRegrouperFormes() {
    const sels = lxVueDonnees.filter(d => d.selectionne);
    if (sels.length < 1) return;

    const clesSelection = Array.from(new Set(sels.map(d => d.forme)));
    const formesImpactees = new Set();
    clesSelection.forEach(cle => {
        _lxFormesAssocieesACle(cle).forEach(forme => formesImpactees.add(forme));
    });
    const formesListe = Array.from(formesImpactees)
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const etatFormes = new Map(formesListe.map(forme => [forme, true]));

    document.getElementById('lx-lemma-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lx-lemma-overlay';
    overlay.className = 'lx-options-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'lx-options-modal lx-lemma-modal';
    overlay.appendChild(modal);

    // ---- En-tête ----
    const header = document.createElement('div');
    header.className = 'lx-options-header';
    const titre = document.createElement('h3');
    titre.className = 'lx-options-title';
    titre.textContent = 'Lemmatisation';
    header.appendChild(titre);
    const btnClose = document.createElement('div');
    btnClose.className = 'close';
    btnClose.textContent = '✖️';
    btnClose.style.cursor = 'pointer';
    btnClose.addEventListener('click', () => overlay.remove());
    header.appendChild(btnClose);
    modal.appendChild(header);

    // ---- Corps ----
    const body = document.createElement('div');
    body.className = 'lx-options-body lx-lemma-body';

    const lblListe = document.createElement('div');
    lblListe.className = 'lx-lemma-label';
    lblListe.textContent = 'Formes sélectionnées :';
    body.appendChild(lblListe);

    const listBox = document.createElement('div');
    listBox.className = 'lx-lemma-listbox';
    formesListe.forEach(forme => {
        const li = document.createElement('div');
        li.className = 'lx-lemma-listitem';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = true;

        const txt = document.createElement('span');
        txt.textContent = forme;

        const majEtat = () => {
            etatFormes.set(forme, chk.checked);
            li.classList.toggle('lx-lemma-listitem--off', !chk.checked);
        };

        chk.addEventListener('change', majEtat);
        li.addEventListener('click', e => {
            if (e.target === chk) return;
            chk.checked = !chk.checked;
            majEtat();
        });

        li.appendChild(chk);
        li.appendChild(txt);
        listBox.appendChild(li);
    });
    body.appendChild(listBox);

    const lblForme = document.createElement('div');
    lblForme.className = 'lx-lemma-label';
    lblForme.textContent = 'Forme synthétique :';
    body.appendChild(lblForme);

    const inputForme = document.createElement('input');
    inputForme.type = 'text';
    inputForme.className = 'lx-lemma-input';
    inputForme.placeholder = 'Entrez le lemme…';
    inputForme.value = sels[0].forme;
    body.appendChild(inputForme);

    modal.appendChild(body);

    // ---- Pied de page ----
    const footer = document.createElement('div');
    footer.className = 'lx-options-footer lx-lemma-footer';

    const grpMO = document.createElement('div');
    grpMO.className = 'lx-lemma-mo-group';

    // Bouton Mots Outils
    const btnMO = document.createElement('label');
    btnMO.className = 'btnfonction lx-lemma-btnmo';
    btnMO.innerHTML = '🔧\u00a0 ajout aux mots outils';
    btnMO.title = 'Ajouter ces formes aux mots vides (ignorés dans l\'analyse)';
    btnMO.addEventListener('click', () => {
        const formesMO = [...etatFormes.entries()]
            .filter(([, actif]) => actif)
            .map(([forme]) => forme);
        formesMO.forEach(forme => lxMotsOutils.add(forme));
        lxVueDonnees.forEach(d => { d.selectionne = false; });
        tabOccLexico.forEach(d => { d.selectionne = false; });
        overlay.remove();
        _lxRefreshTable();
        _lxSauvegarderOut();
    });
    grpMO.appendChild(btnMO);

    // Bouton crayon : ouvrir la gestion avancée des mots outils
    const btnEditMO = document.createElement('label');
    btnEditMO.className = 'btnfonction lx-lemma-btneditmo';
    btnEditMO.textContent = '✏️';
    btnEditMO.title = 'Gérer la liste des mots outils…';
    btnEditMO.addEventListener('click', () => _lxOuvrirGestionMotsOutils());
    grpMO.appendChild(btnEditMO);
    footer.appendChild(grpMO);

    // Bouton Lemmatiser (actif uniquement si l'input est rempli)
    const btnLemma = document.createElement('label');
    btnLemma.className = 'btnfonction lx-lemma-btnlemma';
    btnLemma.innerHTML = '✔\u00a0Grouper';
    btnLemma.title = 'Appliquer la forme synthétique à toutes les occurrences sélectionnées';

    const majBtnLemma = () => {
        const actif = inputForme.value.trim() !== '';
        btnLemma.classList.toggle('lx-lemma-btnlemma--actif', actif);
        btnLemma.style.pointerEvents = actif ? '' : 'none';
    };
    inputForme.addEventListener('input', majBtnLemma);
    majBtnLemma();

    btnLemma.addEventListener('click', () => {
        const cible = inputForme.value.trim();
        if (!cible) return;
        const formesGardees = new Set(
            [...etatFormes.entries()]
                .filter(([, actif]) => actif)
                .map(([forme]) => forme)
        );

        tabLexico.forEach(item => {
            if (!formesImpactees.has(item.forme)) return;

            if (formesGardees.has(item.forme)) {
                item.substitut = cible;
                // Marquage vide: lemmatisation manuelle, donc non réversible via l'option verbes.
                item.typeForme = '';
                return;
            }

            item.substitut = '';
            item.typeForme = '';
        });
        lxVueDonnees.forEach(d => { d.selectionne = false; });
        tabOccLexico.forEach(d => { d.selectionne = false; });
        overlay.remove();
        agreguerLexico();
        _lxRefreshTable();
        _lxSauvegarderLem();
    });
    footer.appendChild(btnLemma);

    modal.appendChild(footer);
    document.body.appendChild(overlay);
    setTimeout(() => { inputForme.select(); }, 50);
}

function _lxConstruireContexteFiltresActifs(options = {}) {
    const inclureQuestions = options.inclureQuestions !== false;

    const thmLabels   = [...document.querySelectorAll('#lxPnlThm .ligthm[data-code]')];
    const thmInactifs = new Set(thmLabels.filter(l => l.classList.contains('ligthm-inactive')).map(l => l.dataset.code));
    const filtreThm   = thmInactifs.size > 0;

    const varBtns = [...document.querySelectorAll('#lxPnlVar .btn-onoff-ent:not([data-vide="1"])')];
    const varMap  = new Map();
    varBtns.forEach(btn => {
        const v = btn.dataset.v;
        if (!varMap.has(v)) varMap.set(v, { total: 0, actifs: new Set() });
        const e = varMap.get(v);
        e.total++;
        if (btn.classList.contains('btn-onoff-ent--actif')) e.actifs.add(Number(btn.dataset.m));
    });
    const filtreVarBrut = [...varMap.values()].some(e => e.actifs.size < e.total);
    const filtreVar = !lxIgnorerFiltreVariablesInitial && filtreVarBrut;

    let entActifsVar = null;
    if (filtreVar) {
        entActifsVar = new Set();
        tabEnt.forEach((ent, i) => {
            for (const [v, { total, actifs }] of varMap) {
                if (actifs.size >= total) continue;
                const modEnt = Array.isArray(ent.tabDat)
                    ? ent.tabDat.find(d => Number(d.v) === Number(v) && (d.l === 'all' || d.l === undefined))
                    : null;
                const m = modEnt ? Number(modEnt.m) : 0;
                if (!actifs.has(m)) return;
            }
            entActifsVar.add(i);
        });
    }

    const entBtns      = [...document.querySelectorAll('#lxPnlEnt .btn-onoff-ent[data-ent-idx]')];
    const entActifsChk = new Set(entBtns.filter(b => b.classList.contains('btn-onoff-ent--actif')).map(b => Number(b.dataset.entIdx)));
    const filtreEnt    = entBtns.some(b => !b.classList.contains('btn-onoff-ent--actif'));

    const filtreEntFinal = filtreVar || filtreEnt;
    let entActifsFinal = null;
    if (filtreEntFinal) {
        const base = entActifsVar ?? new Set([...Array(tabEnt.length).keys()]);
        entActifsFinal = filtreEnt
            ? new Set([...base].filter(i => entActifsChk.has(i)))
            : base;
    }

    return {
        inclureQuestions,
        filtreThm,
        thmInactifs,
        filtreEntFinal,
        entActifsFinal
    };
}

function _lxOccurrencePasseContexteActif(item, ctx) {
    if (!ctx.inclureQuestions && item.locuteur && item.locuteur.endsWith('?')) return false;
    if (ctx.filtreEntFinal && !ctx.entActifsFinal.has(item.entretien)) return false;
    if (ctx.filtreThm) {
        if (item.thematiques.length === 0) return false;
        if (item.thematiques.every(t => ctx.thmInactifs.has(t))) return false;
    }
    return true;
}

function _lxToutesOccurrencesActives(options = {}) {
    const ctx = _lxConstruireContexteFiltresActifs(options);
    return tabLexico.filter(item => _lxOccurrencePasseContexteActif(item, ctx));
}

function _lxOccurrencesActivesPourForme(forme, options = {}) {
    const ctx = _lxConstruireContexteFiltresActifs(options);

    // Résoudre toutes les formes d'origine associées à la clé (gère les formes regroupées)
    const formesOrigines = new Set(_lxFormesAssocieesACle(forme));

    return tabLexico.filter(item => {
        if (!formesOrigines.has(item.forme)) return false;
        return _lxOccurrencePasseContexteActif(item, ctx);
    });
}

function _lxNuageCategoriePalette(type, couleurTheme = '') {
    if (type === 'THM') {
        return { couleurTexte: couleurTheme || '#2f7d4b', couleurFond: couleurTheme || '#2f7d4b' };
    }
    if (type === 'MOD') {
        return { couleurTexte: '#a05a2c', couleurFond: '#a05a2c' };
    }
    return { couleurTexte: '#2a4f9d', couleurFond: '#2a4f9d' };
}

function _lxCouleurAvecAlpha(couleur, alpha, fallback = '#777777') {
    const src = String(couleur || '').trim() || fallback;
    const a = Math.max(0, Math.min(1, Number(alpha)));

    const hex = src.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }

    const rgb = src.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
        const parts = rgb[1].split(',').map(p => p.trim());
        if (parts.length >= 3) {
            const r = Number(parts[0]);
            const g = Number(parts[1]);
            const b = Number(parts[2]);
            if (isFinite(r) && isFinite(g) && isFinite(b)) {
                return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
            }
        }
    }

    return src;
}

function _lxKwicCloudPValuePctArrondi(pValue) {
    return Math.round((Number(pValue) || 0) * 100000) / 1000;
}

function _lxKwicCloudComparerParSpec(a, b) {
    const aPct = _lxKwicCloudPValuePctArrondi(a.pValue);
    const bPct = _lxKwicCloudPValuePctArrondi(b.pValue);
    return (aPct - bPct) || (b.k - a.k) || a.label.localeCompare(b.label, 'fr');
}

function _lxKwicCloudComparerParFreq(a, b) {
    const aPct = _lxKwicCloudPValuePctArrondi(a.pValue);
    const bPct = _lxKwicCloudPValuePctArrondi(b.pValue);
    return (b.k - a.k) || (aPct - bPct) || a.label.localeCompare(b.label, 'fr');
}

function _lxNuageModalitesParEntretien() {
    const varById = new Map((tabVar || []).map(v => [Number(v.v), v]));
    const dicByVM = new Map(
        (tabDic || [])
            .filter(d => Number(d.m) > 0)
            .map(d => [`${Number(d.v)}|${Number(d.m)}`, d.lib || ''])
    );

    const index = new Map();
    (tabEnt || []).forEach((ent, idxEnt) => {
        const generalEntries = new Map();
        const byLoc = new Map();
        const rows = Array.isArray(ent.tabDat) ? ent.tabDat : [];

        rows.forEach(d => {
            const rkV = Number(d.v);
            const rkM = Number(d.m);
            if (!rkV || rkM <= 0) return;

            const vDef = varById.get(rkV);
            const mLib = dicByVM.get(`${rkV}|${rkM}`);
            if (!vDef || !mLib) return;

            const label = `${vDef.lib} : ${mLib}`;
            const entry = { key: `mod|${rkV}|${rkM}`, type: 'MOD', label, couleur: '', v: rkV, m: rkM };
            if (vDef.champ === 'loc' && d.l !== undefined && d.l !== 'all') {
                const idxLoc = Number(d.l);
                const locName = Array.isArray(ent.tabLoc) ? String(ent.tabLoc[idxLoc] || '') : '';
                if (!locName) return;
                if (!byLoc.has(locName)) byLoc.set(locName, new Map());
                byLoc.get(locName).set(entry.key, entry);
            } else {
                generalEntries.set(entry.key, entry);
            }
        });

        index.set(idxEnt, { generalEntries, byLoc });
    });
    return index;
}

function _lxNuageCategoriesSpecifiquesKWIC(forme, occurrences, options = {}) {
    const occActives = _lxToutesOccurrencesActives(options);
    const gt = occActives.length;
    const f = occurrences.length;
    if (!gt || !f) return [];

    const mapThm = new Map((tabThm || []).map(t => [t.code, t]));
    const mapModalites = _lxNuageModalitesParEntretien();
    const cats = new Map();

    const assurer = (key, type, label, couleur = '') => {
        if (!cats.has(key)) {
            cats.set(key, { key, type, label, couleur, pt: 0, k: 0, pValue: 1, score: 0, size: 12, opacity: 0.18 });
        }
        return cats.get(key);
    };

    const categoriesOccurrence = item => {
        const out = [];

        (item.thematiques || []).forEach(code => {
            const thm = mapThm.get(code);
            const nom = thm
                ? ((typeof splitNomThm === 'function') ? splitNomThm(thm.nom)[0] : (thm.nom || code))
                : code;
            out.push({ key: `thm|${code}`, type: 'THM', label: nom, couleur: thm?.couleur || '', code });
        });

        const modsEnt = mapModalites.get(item.entretien);
        if (modsEnt) {
            modsEnt.generalEntries.forEach(entry => {
                out.push(entry);
            });
            const locKey = String(item.locuteur || '');
            if (locKey && modsEnt.byLoc.has(locKey)) {
                modsEnt.byLoc.get(locKey).forEach(entry => {
                    out.push(entry);
                });
            }
        }

        const nomEnt = (tabEnt[item.entretien] && tabEnt[item.entretien].nom)
            ? tabEnt[item.entretien].nom
            : `Entretien ${item.entretien + 1}`;
        out.push({ key: `ent|${item.entretien}`, type: 'ENT', label: nomEnt, couleur: '', entIdx: item.entretien });

        return out;
    };

    occActives.forEach(item => {
        const deja = new Set();
        categoriesOccurrence(item).forEach(cat => {
            if (deja.has(cat.key)) return;
            deja.add(cat.key);
            assurer(cat.key, cat.type, cat.label, cat.couleur).pt++;
        });
    });

    occurrences.forEach(item => {
        const deja = new Set();
        categoriesOccurrence(item).forEach(cat => {
            if (deja.has(cat.key)) return;
            deja.add(cat.key);
            assurer(cat.key, cat.type, cat.label, cat.couleur).k++;
        });
    });

    const res = [];
    cats.forEach(cat => {
        if (!cat.k || !cat.pt) return;
        const theorique = (f * cat.pt) / gt;
        if (cat.k <= theorique) return;
        cat.pValue = _lxPLafon(gt, cat.pt, f, cat.k);
        cat.score = Math.max(0, -Math.log10(Math.max(cat.pValue, 1e-12)));
        res.push(cat);
    });

    if (res.length === 0) return [];

    const maxK = res.reduce((m, c) => Math.max(m, c.k), 1);
    const maxScore = res.reduce((m, c) => Math.max(m, c.score), 0);

    res.forEach(cat => {
        const rK = maxK > 0 ? cat.k / maxK : 0;
        const rS = maxScore > 0 ? cat.score / maxScore : 0;
        cat.size = Math.round(11 + Math.pow(rK, 0.55) * 24);
        cat.opacity = 0.10 + Math.pow(rS, 0.72) * 0.90;
    });

    return res
        .sort(_lxKwicCloudComparerParSpec)
        .slice(0, 70);
}

var _lxKwicCloudCategories = [];
var _lxKwicCloudForme = '';
var _lxKwicCloudTypeFiltre = 'ALL';
var _lxKwicCloudTri = 'PVAL';
var _lxKwicCloudHeight = 210;
var _lxKwicCloudFiltreActif = '';
var _lxKwicCloudModalitesIndex = null;
var _lxKwicOccurrencesBase = [];

function _lxKwicCategoriesOccurrence(item, mapModalites = null) {
    const out = [];
    const mapThm = new Map((tabThm || []).map(t => [t.code, t]));
    const modsIndex = mapModalites || _lxKwicCloudModalitesIndex || _lxNuageModalitesParEntretien();

    (item.thematiques || []).forEach(code => {
        const thm = mapThm.get(code);
        const nom = thm
            ? ((typeof splitNomThm === 'function') ? splitNomThm(thm.nom)[0] : (thm.nom || code))
            : code;
        out.push({ key: `thm|${code}`, type: 'THM', label: nom, couleur: thm?.couleur || '', code });
    });

    const modsEnt = modsIndex ? modsIndex.get(item.entretien) : null;
    if (modsEnt) {
        modsEnt.generalEntries.forEach(entry => {
            out.push(entry);
        });
        const locKey = String(item.locuteur || '');
        if (locKey && modsEnt.byLoc.has(locKey)) {
            modsEnt.byLoc.get(locKey).forEach(entry => {
                out.push(entry);
            });
        }
    }

    const nomEnt = (tabEnt[item.entretien] && tabEnt[item.entretien].nom)
        ? tabEnt[item.entretien].nom
        : `Entretien ${item.entretien + 1}`;
    out.push({ key: `ent|${item.entretien}`, type: 'ENT', label: nomEnt, couleur: '', entIdx: item.entretien });

    return out;
}

function _lxKwicOccurrenceAppartientAuFiltre(item, key) {
    if (!key) return true;
    return _lxKwicCategoriesOccurrence(item).some(cat => cat.key === key);
}

function _lxKwicOccurrencesFiltrees() {
    if (!_lxKwicCloudFiltreActif) return [..._lxKwicOccurrencesBase];
    return _lxKwicOccurrencesBase.filter(item => _lxKwicOccurrenceAppartientAuFiltre(item, _lxKwicCloudFiltreActif));
}

function _lxKwicCloudAjusterHauteur() {
    const wrap = document.getElementById('lx-kwic-cloud-wrap');
    const body = document.getElementById('lx-kwic-cloud-body');
    if (!wrap || !body) return;

    const handle = wrap.querySelector('.lx-kwic-cloud-handle');
    const header = wrap.querySelector('.lx-kwic-cloud-header');
    const toolbar = wrap.querySelector('.lx-kwic-cloud-toolbar');
    const note = wrap.querySelector('.lx-kwic-cloud-note');

    const minWrap = 120;
    const maxWrap = Math.max(minWrap, Math.min(420, Math.round(window.innerHeight * 0.55)));
    _lxKwicCloudHeight = Math.max(minWrap, Math.min(maxWrap, Math.round(_lxKwicCloudHeight || 210)));

    wrap.style.height = _lxKwicCloudHeight + 'px';

    const reserved =
        (handle ? handle.offsetHeight : 0) +
        (header ? header.offsetHeight : 0) +
        (toolbar ? toolbar.offsetHeight : 0) +
        (note ? note.offsetHeight : 0) + 18;
    body.style.maxHeight = Math.max(42, _lxKwicCloudHeight - reserved) + 'px';
}

function _lxKwicCloudInstallerResize() {
    const wrap = document.getElementById('lx-kwic-cloud-wrap');
    const handle = document.getElementById('lx-kwic-cloud-handle');
    if (!wrap || !handle || handle.dataset.resizeBound === '1') return;

    handle.dataset.resizeBound = '1';
    handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = wrap.offsetHeight;

        const onMove = ev => {
            const delta = startY - ev.clientY;
            _lxKwicCloudHeight = startH + delta;
            _lxKwicCloudAjusterHauteur();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function _lxKwicCloudCategoriesVisibles() {
    let cats = Array.isArray(_lxKwicCloudCategories) ? [..._lxKwicCloudCategories] : [];
    if (_lxKwicCloudTypeFiltre !== 'ALL') cats = cats.filter(cat => cat.type === _lxKwicCloudTypeFiltre);
    if (_lxKwicCloudTri === 'FREQ') {
        cats.sort(_lxKwicCloudComparerParFreq);
    } else {
        cats.sort(_lxKwicCloudComparerParSpec);
    }
    return cats;
}

function _lxKwicCloudChoisirType(type) {
    _lxKwicCloudTypeFiltre = type || 'ALL';
    _lxKwicCloudRendre();
}

function _lxKwicCloudChoisirTri(tri) {
    _lxKwicCloudTri = tri || 'PVAL';
    _lxKwicCloudRendre();
}

function _lxKwicCloudIsolerType(type) {
    return _lxKwicCloudTypeFiltre === type ? ' lx-kwic-chip--actif' : '';
}

function _lxKwicCloudTagActif(key) {
    return _lxKwicCloudFiltreActif === key ? ' lx-kwic-tag--actif' : '';
}

function _lxActiverBrancheThematiqueLexico(code) {
    const panel = document.getElementById('lxPnlThm');
    if (panel) panel.classList.remove('lx-hidden');
    const labels = [...document.querySelectorAll('#lxPnlThm .ligthm[data-code]')];
    labels.forEach(lbl => lbl.classList.add('ligthm-inactive'));
    (tabThm || []).forEach(thm => { thm.act = false; });

    const idx = (tabThm || []).findIndex(thm => thm.code === code);
    if (idx < 0) return;
    const parentRg = Number(tabThm[idx].rang || 0);
    for (let i = idx; i < tabThm.length; i++) {
        if (i !== idx && Number(tabThm[i].rang || 0) <= parentRg) break;
        tabThm[i].act = true;
        const lbl = document.querySelector(`#lxPnlThm .ligthm[data-code="${tabThm[i].code}"]`);
        if (lbl) lbl.classList.remove('ligthm-inactive');
    }
}

function _lxIsolerModaliteLexico(v, m) {
    const panel = document.getElementById('lxPnlVar');
    if (panel) panel.classList.remove('lx-hidden');
    lxIgnorerFiltreVariablesInitial = false;

    const buttonsVar = [...document.querySelectorAll(`#lxPnlVar .btn-onoff-ent[data-v="${v}"]`)];
    buttonsVar.forEach(btn => btn.classList.remove('btn-onoff-ent--actif'));
    const cible = document.querySelector(`#lxPnlVar .btn-onoff-ent[data-v="${v}"][data-m="${m}"]`);
    if (cible) cible.classList.add('btn-onoff-ent--actif');

    const blocVar = cible ? cible.closest('.tap-var') : null;
    const blocMods = blocVar ? blocVar.querySelector('.tap-mods') : null;
    const btnCollapse = blocVar ? blocVar.querySelector('.tap-collapse-btn') : null;
    if (blocMods) blocMods.style.display = '';
    if (btnCollapse) btnCollapse.textContent = '▲';
}

function _lxIsolerEntretienLexico(entIdx) {
    const panel = document.getElementById('lxPnlEnt');
    if (panel) panel.classList.remove('lx-hidden');
    const buttons = [...document.querySelectorAll('#lxPnlEnt .btn-onoff-ent[data-ent-idx]')];
    buttons.forEach(btn => btn.classList.remove('btn-onoff-ent--actif'));
    const cible = document.querySelector(`#lxPnlEnt .btn-onoff-ent[data-ent-idx="${entIdx}"]`);
    if (cible) cible.classList.add('btn-onoff-ent--actif');
}

function _lxKwicCloudAppliquerFiltre(key) {
    _lxKwicCloudFiltreActif = (_lxKwicCloudFiltreActif === key) ? '' : key;
    _lxOuvrirModalOccurrences(_lxKwicCloudForme, _lxKwicCloudFiltreActif, _lxKwicCloudTypeFiltre, _lxKwicCloudTri);
}

function _lxKwicCloudRendre() {
    const wrap = document.getElementById('lx-kwic-cloud-wrap');
    if (!wrap) return;

    const cats = _lxKwicCloudCategoriesVisibles();
    const titre = document.getElementById('lx-kwic-cloud-title');
    const toolbar = document.getElementById('lx-kwic-cloud-toolbar');
    const body = document.getElementById('lx-kwic-cloud-body');
    const note = document.getElementById('lx-kwic-cloud-note');
    if (!titre || !toolbar || !body || !note) return;

    const formeEch = _lxEchapHtml(_lxKwicCloudForme);
    titre.innerHTML = `Catégories les plus spécifiques pour <em>${formeEch}</em> <span class="lx-kwic-cloud-count">(${cats.length}${cats.length !== (_lxKwicCloudCategories || []).length ? ` / ${(_lxKwicCloudCategories || []).length}` : ''})</span>`;

    toolbar.innerHTML = `
        <div class="lx-kwic-cloud-filters">
            <button class="lx-kwic-chip${_lxKwicCloudIsolerType('ALL')}" onclick="_lxKwicCloudChoisirType('ALL')">Tout</button>
            <button class="lx-kwic-chip${_lxKwicCloudIsolerType('THM')}" onclick="_lxKwicCloudChoisirType('THM')">Catégories</button>
            <button class="lx-kwic-chip${_lxKwicCloudIsolerType('MOD')}" onclick="_lxKwicCloudChoisirType('MOD')">Modalités</button>
            <button class="lx-kwic-chip${_lxKwicCloudIsolerType('ENT')}" onclick="_lxKwicCloudChoisirType('ENT')">Entretiens</button>
        </div>
        <label class="lx-kwic-cloud-sort">Tri
            <select onchange="_lxKwicCloudChoisirTri(this.value)">
                <option value="PVAL"${_lxKwicCloudTri === 'PVAL' ? ' selected' : ''}>spécificité</option>
                <option value="FREQ"${_lxKwicCloudTri === 'FREQ' ? ' selected' : ''}>fréquence</option>
            </select>
        </label>
    `;

    if (cats.length === 0) {
        body.innerHTML = '<div class="lx-kwic-cloud-empty">Aucune catégorie pour ce filtre.</div>';
    } else {
        body.innerHTML = cats.map(cat => {
            const palette = _lxNuageCategoriePalette(cat.type, cat.couleur);
            const pTxt = _lxKwicCloudPValuePctArrondi(cat.pValue).toFixed(3);
            const title = `${cat.label} | freq=${cat.k} | p=${pTxt}% | ${cat.type}`;
            const clsType = cat.type === 'THM' ? 'lx-kwic-tag--thm' : (cat.type === 'MOD' ? 'lx-kwic-tag--mod' : 'lx-kwic-tag--ent');
            const bgColor = _lxCouleurAvecAlpha(palette.couleurFond, 0.11 + cat.opacity * 0.22, '#999999');
            const bdColor = _lxCouleurAvecAlpha(palette.couleurFond, 0.32 + cat.opacity * 0.26, '#999999');
            const shadowColor = _lxCouleurAvecAlpha(palette.couleurFond, 0.08 + cat.opacity * 0.16, '#999999');
            const style = [
                `font-size:${cat.size}px`,
                `opacity:${cat.opacity.toFixed(3)}`,
                `color:${palette.couleurTexte}`,
                `background-color:${bgColor}`,
                `border-color:${bdColor}`,
                `box-shadow:0 1px 0 ${shadowColor}`
            ].join(';');
            const keyEnc = encodeURIComponent(cat.key);
            return `<button class="lx-kwic-tag ${clsType}${_lxKwicCloudTagActif(cat.key)}" style="${style}" title="${_lxEchapHtml(title)}" onclick="_lxKwicCloudAppliquerFiltre(decodeURIComponent('${keyEnc}'))">${_lxEchapHtml(cat.label)}</button>`;
        }).join('');
    }

    note.textContent = 'Taille = fréquence des occurrences de la forme dans la catégorie. Intensité = force de la spécificité positive (p faible). Clic = filtrer les occurrences du haut ; recliquer = enlever le filtre.';
    requestAnimationFrame(() => _lxKwicCloudAjusterHauteur());
}

function _lxKwicCloudInitialiser(forme, categories, occurrencesBase, modalitesIndex, filtreActif = '', typeFiltre = 'ALL', tri = 'PVAL') {
    _lxKwicCloudForme = forme;
    _lxKwicCloudCategories = Array.isArray(categories) ? categories : [];
    _lxKwicOccurrencesBase = Array.isArray(occurrencesBase) ? occurrencesBase : [];
    _lxKwicCloudModalitesIndex = modalitesIndex || null;
    _lxKwicCloudTypeFiltre = typeFiltre || 'ALL';
    _lxKwicCloudTri = tri || 'PVAL';
    _lxKwicCloudFiltreActif = filtreActif || '';
    _lxKwicCloudInstallerResize();
    _lxKwicCloudRendre();
}

function _lxNuageCategoriesHTML(forme, categories) {
    const formeEch = _lxEchapHtml(forme);
    return `
        <div id="lx-kwic-cloud-wrap" class="lx-kwic-cloud-wrap">
            <div id="lx-kwic-cloud-handle" class="lx-kwic-cloud-handle" title="Glisser pour redimensionner le nuage"></div>
            <div class="lx-kwic-cloud-header">
                <div id="lx-kwic-cloud-title" class="lx-kwic-cloud-title">Catégories les plus spécifiques pour <em>${formeEch}</em>${Array.isArray(categories) ? ` <span class="lx-kwic-cloud-count">(${categories.length})</span>` : ''}</div>
                <div class="lx-kwic-cloud-legend">
                    <span class="lx-kwic-legend-item lx-kwic-legend-thm">Catégories</span>
                    <span class="lx-kwic-legend-item lx-kwic-legend-mod">Modalités</span>
                    <span class="lx-kwic-legend-item lx-kwic-legend-ent">Entretiens</span>
                </div>
            </div>
            <div id="lx-kwic-cloud-toolbar" class="lx-kwic-cloud-toolbar"></div>
            <div id="lx-kwic-cloud-body" class="lx-kwic-cloud-body"></div>
            <div id="lx-kwic-cloud-note" class="lx-kwic-cloud-note">Taille = fréquence des occurrences de la forme dans la catégorie. Intensité = force de la spécificité positive (p faible).</div>
        </div>
    `;
}

function _lxFmtPct(num, den) {
    if (!den) return '0.0';
    return ((num / den) * 100).toFixed(1).replace('.', ',');
}

function _lxNomFichierSpontaneite(forme) {
    const base = String(forme || 'forme')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'forme';
    return `${base}.Spont.txt`;
}

function _lxConstruireRapportSpontaneite(formeCible, occurrences, stats) {
    const lignes = [];
    lignes.push('RAPPORT d\'ANALYSE de SPONTANEITE LEXICALE');
    lignes.push(`MOT : ${formeCible}`);
    lignes.push('');
    lignes.push(`Occurrences : ${stats.total}`);
    lignes.push(` - dont ${stats.nbFQ} dans les questions (${_lxFmtPct(stats.nbFQ, stats.total)}%)`);
    lignes.push(`Utilise spontanement dans ${stats.nbSpOui} entretien(s) sur ${stats.nbSpOui + stats.nbSpNon}`);
    lignes.push(`Uniquement en questions : ${stats.nbBides}`);
    lignes.push('');
    lignes.push('Details');
    lignes.push('');

    const byEnt = new Map();
    occurrences.forEach(item => {
        if (!byEnt.has(item.entretien)) byEnt.set(item.entretien, []);
        byEnt.get(item.entretien).push(item);
    });

    const entOrdre = [...byEnt.keys()].sort((a, b) => a - b);
    entOrdre.forEach(entIdx => {
        const entNom = (tabEnt[entIdx] && tabEnt[entIdx].nom) ? tabEnt[entIdx].nom : `Entretien ${entIdx + 1}`;
        lignes.push(`ENT : ${entNom}`);
        lignes.push('');

        const occEnt = byEnt.get(entIdx).slice().sort((a, b) => a.rang - b.rang);
        occEnt.forEach((item, idxEnt) => {
            const ctx = _lxContexteParRang(item.rang, item.entretien, 5, 5);
            const avant = ctx.avant ? _lxRestaurerElisions(ctx.avant) + ' ' : '';
            const apres = ctx.apres ? ' ' + _lxRestaurerElisions(ctx.apres) : '';
            const phrase = `${avant}>${item.forme}<${apres}`.trim();
            const loc = item.locuteur || '';
            lignes.push(`${idxEnt + 1} - ${loc} : ${phrase}`);
        });
        lignes.push('');
    });

    return lignes.join('\n');
}

function _lxExporterTxt(nomFichier, contenu) {
    const blob = new Blob([String(contenu || '')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function _lxOuvrirModalSpontaneite() {
    const sels = lxVueDonnees.filter(d => d.selectionne);
    if (sels.length !== 1) return;

    const formeCible = sels[0].forme;
    const occurrences = _lxOccurrencesActivesPourForme(formeCible)
        .slice()
        .sort((a, b) => a.rang - b.rang);

    document.getElementById('lx-spont-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lx-spont-overlay';
    overlay.className = 'lx-options-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'lx-options-modal lx-spont-modal';
    overlay.appendChild(modal);

    const header = document.createElement('div');
    header.className = 'lx-options-header';
    const titre = document.createElement('h3');
    titre.className = 'lx-options-title';
    titre.textContent = `Spontanéité: ${formeCible}`;
    header.appendChild(titre);
    const btnClose = document.createElement('div');
    btnClose.className = 'close';
    btnClose.textContent = '✖️';
    btnClose.style.cursor = 'pointer';
    btnClose.addEventListener('click', () => overlay.remove());
    header.appendChild(btnClose);
    modal.appendChild(header);

    const body = document.createElement('div');
    body.className = 'lx-options-body lx-spont-body';

    if (occurrences.length === 0) {
        const vide = document.createElement('div');
        vide.className = 'lx-empty';
        vide.textContent = 'Analyse impossible: aucune occurrence active pour cette forme.';
        body.appendChild(vide);
        modal.appendChild(body);
        document.body.appendChild(overlay);
        return;
    }

    let nbFQ = 0;
    let nbFR = 0;
    const byEnt = new Map();
    const byFormeSurface = new Map();

    occurrences.forEach(item => {
        const estQuestion = !!(item.locuteur && item.locuteur.includes('?'));
        if (estQuestion) nbFQ++;
        else nbFR++;

        if (!byEnt.has(item.entretien)) byEnt.set(item.entretien, []);
        byEnt.get(item.entretien).push(item);

        const formeSurface = item.forme;
        if (!byFormeSurface.has(formeSurface)) {
            byFormeSurface.set(formeSurface, { firstRang: item.rang, occ: 0 });
        }
        const fs = byFormeSurface.get(formeSurface);
        fs.occ++;
        if (item.rang < fs.firstRang) fs.firstRang = item.rang;
    });

    let nbSpOui = 0;
    let nbSpNon = 0;
    let nbBides = 0;

    const entOrdre = [...byEnt.keys()].sort((a, b) => a - b);
    entOrdre.forEach(entIdx => {
        const occEnt = byEnt.get(entIdx).slice().sort((a, b) => a.rang - b.rang);
        if (occEnt.length === 0) return;
        const first = occEnt[0];
        const firstQuestion = !!(first.locuteur && first.locuteur.includes('?'));
        if (firstQuestion) nbSpNon++;
        else nbSpOui++;
        if (occEnt.every(o => o.locuteur && o.locuteur.includes('?'))) nbBides++;
    });

    const total = occurrences.length;
    const stats = { total, nbFQ, nbFR, nbSpOui, nbSpNon, nbBides };
    const totalEntSpont = nbSpOui + nbSpNon;
    const pctSpont = totalEntSpont > 0 ? (nbSpOui / totalEntSpont) * 100 : 0;
    const pctNonSpont = Math.max(0, 100 - pctSpont);

    const resume = document.createElement('div');
    resume.className = 'lx-spont-resume';
    resume.innerHTML =
        `<div class="lx-spont-kpi lx-spont-kpi--occ"><span>Occurrences</span><strong>${total}</strong></div>` +
        `<div class="lx-spont-kpi lx-spont-kpi--bar">` +
            `<div class="lx-spont-bar" title="Part des entretiens où la forme est d'abord en question/réponse">` +
            `<div class="lx-spont-bar-seg lx-spont-bar-seg--non" style="width:${pctNonSpont.toFixed(1)}%"><span>Dans les questions ${nbSpNon} (${_lxFmtPct(nbSpNon, totalEntSpont)}%)</span></div>` +   
            `<div class="lx-spont-bar-seg lx-spont-bar-seg--spont" style="width:${pctSpont.toFixed(1)}%"><span>Spontané ${nbSpOui} (${_lxFmtPct(nbSpOui, totalEntSpont)}%)</span></div>` +
               
            `</div>` +
        `</div>` +
        `<div class="lx-spont-kpi"><span>Occurrences dans les questions</span><strong>${nbFQ} (${_lxFmtPct(nbFQ, total)}%)</strong><span>Réponses</span><strong>${nbFR} (${_lxFmtPct(nbFR, total)}%)</strong></div>` +
        `<div class="lx-spont-kpi"><span>Uniquement dans les questions</span><strong>${nbBides}</strong></div>`;
    body.appendChild(resume);

    /*
    const titreOrdre = document.createElement('div');
    titreOrdre.className = 'lx-spont-title';
    titreOrdre.textContent = 'Ordre d’apparition des formes (surface)';
    body.appendChild(titreOrdre);

    const ordreFormes = [...byFormeSurface.entries()]
        .sort((a, b) => a[1].firstRang - b[1].firstRang)
        .map(([forme, d], idx) => `${idx + 1}. ${forme} (${d.occ})`)
        .join('  |  ');

    const ordreBox = document.createElement('div');
    ordreBox.className = 'lx-spont-ordre';
    ordreBox.textContent = ordreFormes;
    body.appendChild(ordreBox);
*/
    const titreDetails = document.createElement('div');
    titreDetails.className = 'lx-spont-title';
    titreDetails.textContent = 'Détails (ordre du corpus)';
    body.appendChild(titreDetails);

    const details = document.createElement('div');
    details.className = 'lx-spont-details';

    entOrdre.forEach(entIdx => {
        const occEnt = byEnt.get(entIdx).slice().sort((a, b) => a.rang - b.rang);
        const entNom = (tabEnt[entIdx] && tabEnt[entIdx].nom) ? tabEnt[entIdx].nom : `Entretien ${entIdx + 1}`;

        const h = document.createElement('div');
        h.className = 'lx-spont-entete';
        h.textContent = entNom;
        details.appendChild(h);

        occEnt.forEach((item, idxEnt) => {
            const ctx = _lxContexteParRang(item.rang, item.entretien, 5, 5);
            const avant = ctx.avant ? _lxRestaurerElisions(ctx.avant) + ' ' : '';
            const apres = ctx.apres ? ' ' + _lxRestaurerElisions(ctx.apres) : '';
            const ligne = document.createElement('div');
            ligne.className = 'lx-spont-ligne';
            ligne.innerHTML =
                `<span class="lx-spont-rg">${idxEnt + 1}</span>` +
                `<span class="lx-spont-loc">${_lxEchapHtml(item.locuteur || '')}</span>` +
                `<span class="lx-spont-ctx"><span class="lx-occ-avant">${_lxEchapHtml(avant)}</span><strong class="lx-occ-mot ${_lxClassesLemmeItem(item)}">${_lxEchapHtml(item.forme)}</strong><span class="lx-occ-apres">${_lxEchapHtml(apres)}</span></span>`;
            details.appendChild(ligne);
        });
    });

    body.appendChild(details);
    modal.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'lx-options-footer';

    const btnExport = document.createElement('label');
    btnExport.className = 'btnfonction';
    btnExport.textContent = 'Exporter TXT';
    btnExport.addEventListener('click', () => {
        const rapport = _lxConstruireRapportSpontaneite(formeCible, occurrences, stats);
        _lxExporterTxt(_lxNomFichierSpontaneite(formeCible), rapport);
    });
    footer.appendChild(btnExport);

    const btnFermer = document.createElement('label');
    btnFermer.className = 'btnfonction btnlarge';
    btnFermer.textContent = 'Fermer';
    btnFermer.addEventListener('click', () => overlay.remove());
    footer.appendChild(btnFermer);
    modal.appendChild(footer);

    document.body.appendChild(overlay);
}

// ============================================================
// CONCATENATION LEXICALE
// ============================================================

function _lxCnctNormaliserToken(token) {
    return String(token || '').trim().toLowerCase();
}

function _lxCnctNormaliserSequence(tokens) {
    if (!Array.isArray(tokens)) return [];
    return tokens.map(_lxCnctNormaliserToken).filter(Boolean);
}

function _lxCnctCleSequence(tokens) {
    return _lxCnctNormaliserSequence(tokens).join(' ');
}

function _lxCnctCompterOccurrencesSequence(tokens) {
    const seq = _lxCnctNormaliserSequence(tokens);
    if (seq.length === 0) return 0;
    let total = 0;

    for (let i = 0; i <= tabLexico.length - seq.length; i++) {
        const premier = tabLexico[i];
        if (!premier || premier.forme !== seq[0]) continue;

        const ent = premier.entretien;
        let ok = true;
        for (let j = 1; j < seq.length; j++) {
            const cur = tabLexico[i + j];
            if (!cur || cur.entretien !== ent || cur.forme !== seq[j]) {
                ok = false;
                break;
            }
        }
        if (ok) total++;
    }

    return total;
}

function _lxCnctCompterPremiersMots() {
    const map = new Map();
    tabLexico.forEach(item => {
        const f = _lxCnctNormaliserToken(item?.forme);
        if (!f) return;
        map.set(f, (map.get(f) || 0) + 1);
    });
    return [...map.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
        .map(([forme, n]) => ({ forme, n }));
}

function _lxCnctListerSuivants(prefixeTokens) {
    const prefixe = _lxCnctNormaliserSequence(prefixeTokens);
    if (prefixe.length === 0) return [];

    const map = new Map();
    const n = prefixe.length;

    for (let i = 0; i <= tabLexico.length - n - 1; i++) {
        const premier = tabLexico[i];
        if (!premier || premier.forme !== prefixe[0]) continue;

        const ent = premier.entretien;
        let ok = true;
        for (let j = 1; j < n; j++) {
            const cur = tabLexico[i + j];
            if (!cur || cur.entretien !== ent || cur.forme !== prefixe[j]) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        const suivant = tabLexico[i + n];
        if (!suivant || suivant.entretien !== ent) continue;
        const f = _lxCnctNormaliserToken(suivant.forme);
        if (!f) continue;
        map.set(f, (map.get(f) || 0) + 1);
    }

    return [...map.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
        .map(([forme, n]) => ({ forme, n }));
}

function _lxCnctReindexerRangs() {
    tabLexico.forEach((item, idx) => {
        item.rang = idx;
    });
}

function _lxCnctFusionnerSequence(tokens, substitut = '') {
    const seq = _lxCnctNormaliserSequence(tokens);
    if (seq.length < 2) return 0;

    const cible = String(substitut || '').trim() || seq.join(' ');
    let nb = 0;

    for (let i = 0; i <= tabLexico.length - seq.length; i++) {
        const premier = tabLexico[i];
        if (!premier || premier.forme !== seq[0]) continue;

        const ent = premier.entretien;
        let ok = true;
        const thematiques = new Set(premier.thematiques || []);

        for (let j = 1; j < seq.length; j++) {
            const cur = tabLexico[i + j];
            if (!cur || cur.entretien !== ent || cur.forme !== seq[j]) {
                ok = false;
                break;
            }
            (cur.thematiques || []).forEach(t => thematiques.add(t));
        }
        if (!ok) continue;

        premier.forme = cible;
        premier.substitut = '';
        premier.typeForme = '';
        premier.thematiques = [...thematiques];

        tabLexico.splice(i + 1, seq.length - 1);
        nb++;
    }

    if (nb > 0) _lxCnctReindexerRangs();
    return nb;
}

function _lxAppliquerToutesConcatenations() {
    if (!(lxConcatRegles instanceof Map) || lxConcatRegles.size === 0) return 0;

    const reglesTriees = [...lxConcatRegles.values()].sort((a, b) => {
        const lenA = (a.tokens || []).length;
        const lenB = (b.tokens || []).length;
        if (lenA !== lenB) return lenB - lenA;
        const keyA = _lxCnctCleSequence(a.tokens);
        const keyB = _lxCnctCleSequence(b.tokens);
        return keyA.localeCompare(keyB, 'fr', { sensitivity: 'base' });
    });

    let total = 0;
    reglesTriees.forEach(regle => {
        total += _lxCnctFusionnerSequence(regle.tokens, regle.substitut || '');
    });

    return total;
}

function _lxOuvrirGestionConcatenations() {
    document.getElementById('lx-cnct-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lx-cnct-overlay';
    overlay.className = 'lx-options-overlay';
    overlay.style.zIndex = '215';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'lx-options-modal lx-lemma-modal';
    overlay.appendChild(modal);

    const header = document.createElement('div');
    header.className = 'lx-options-header';
    const titre = document.createElement('h3');
    titre.className = 'lx-options-title';
    titre.textContent = 'Concatenation lexicale';
    header.appendChild(titre);
    const btnClose = document.createElement('div');
    btnClose.className = 'close';
    btnClose.textContent = '✖️';
    btnClose.style.cursor = 'pointer';
    btnClose.addEventListener('click', () => overlay.remove());
    header.appendChild(btnClose);
    modal.appendChild(header);

    const body = document.createElement('div');
    body.className = 'lx-options-body lx-lemma-body';

    const info = document.createElement('div');
    info.className = 'lx-lemma-label';
    info.textContent = 'Selectionnez les mots successifs à réunir.';
    body.appendChild(info);

        const rowSelect = document.createElement('div');
    rowSelect.style.display = 'flex';
    rowSelect.style.gap = '8px';
    rowSelect.style.alignItems = 'center';
    const select = document.createElement('select');
    select.className = 'lx-lemma-input';
    select.style.flex = '1';
    const btnAjouter = document.createElement('label');
    btnAjouter.className = 'btnfonction';
    btnAjouter.textContent = 'Ajouter';
    rowSelect.appendChild(select);
    rowSelect.appendChild(btnAjouter);
    body.appendChild(rowSelect);

    const chn = document.createElement('div');
    chn.className = 'lx-lemma-listbox';
    chn.style.minHeight = '58px';
    chn.style.maxHeight = '80px';
    body.appendChild(chn);



    const rowActions = document.createElement('div');
    rowActions.style.display = 'flex';
    rowActions.style.gap = '8px';
    rowActions.style.marginTop = '8px';
    const btnRetirer = document.createElement('label');
    btnRetirer.className = 'btnfonction';
    btnRetirer.textContent = 'Retirer dernier';
    const btnReset = document.createElement('label');
    btnReset.className = 'btnfonction';
    btnReset.textContent = 'Reinitialiser';
    rowActions.appendChild(btnRetirer);
    rowActions.appendChild(btnReset);
    body.appendChild(rowActions);

    const resume = document.createElement('div');
    resume.className = 'lx-lemma-label';
    resume.style.marginTop = '8px';
    body.appendChild(resume);

    modal.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'lx-options-footer lx-lemma-footer';
    const btnValider = document.createElement('label');
    btnValider.className = 'btnfonction btnlarge';
    btnValider.textContent = 'Valider concatenation';
    footer.appendChild(btnValider);
    modal.appendChild(footer);

    const sequence = [];

    const render = () => {
        chn.innerHTML = '';
        if (sequence.length === 0) {
            const vide = document.createElement('div');
            vide.className = 'lx-mo-vide';
            vide.textContent = 'Aucune forme selectionnee.';
            chn.appendChild(vide);
        } else {
            const l = document.createElement('div');
            l.style.lineHeight = '1.7';
            l.textContent = sequence.join(' + ');
            chn.appendChild(l);
        }

        const options = sequence.length === 0
            ? _lxCnctCompterPremiersMots()
            : _lxCnctListerSuivants(sequence);

        select.innerHTML = '';
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.forme;
            opt.textContent = `${o.forme} (${o.n})`;
            select.appendChild(opt);
        });

        const occ = sequence.length > 0 ? _lxCnctCompterOccurrencesSequence(sequence) : 0;
        resume.textContent = sequence.length === 0
            ? 'Choisissez le premier mot.'
            : `${occ} chaine(s) trouvee(s) pour : ${sequence.join(' ')}`;

        const hasOption = options.length > 0;
        btnAjouter.style.pointerEvents = hasOption ? '' : 'none';
        btnAjouter.style.opacity = hasOption ? '1' : '0.55';

        btnRetirer.style.pointerEvents = sequence.length > 0 ? '' : 'none';
        btnRetirer.style.opacity = sequence.length > 0 ? '1' : '0.55';

        btnReset.style.pointerEvents = sequence.length > 0 ? '' : 'none';
        btnReset.style.opacity = sequence.length > 0 ? '1' : '0.55';

        const peutValider = sequence.length >= 2 && occ > 0;
        btnValider.style.pointerEvents = peutValider ? '' : 'none';
        btnValider.style.opacity = peutValider ? '1' : '0.55';
    };

    btnAjouter.addEventListener('click', () => {
        const mot = _lxCnctNormaliserToken(select.value);
        if (!mot) return;
        sequence.push(mot);
        render();
    });

    btnRetirer.addEventListener('click', () => {
        if (sequence.length === 0) return;
        sequence.pop();
        render();
    });

    btnReset.addEventListener('click', () => {
        sequence.length = 0;
        render();
    });

    btnValider.addEventListener('click', async () => {
        const seq = _lxCnctNormaliserSequence(sequence);
        if (seq.length < 2) return;

        const source = _lxCnctCleSequence(seq);
        const substitut = source;
        const nb = _lxCnctFusionnerSequence(seq, substitut);
        if (nb < 1) return;

        lxConcatRegles.set(source, { tokens: seq, substitut });
        await _lxSauvegarderCnct();

        lxVueDonnees.forEach(d => { d.selectionne = false; });
        tabOccLexico.forEach(d => { d.selectionne = false; });
        agreguerLexico();
        _lxRefreshTable();
        overlay.remove();
    });

    render();
    document.body.appendChild(overlay);
}

// ============================================================
// LISTES DE MOTS OUTILS PRÉDÉFINIES ET GESTION
// ============================================================

const _LX_STOP_LISTS = {
    // Formes élidées : l'apostrophe coupe le token, seule la partie avant reste
    // ex. j\'ai → token "j" + token "ai" ; qu\'il → "qu" + "il"
    
    'Articles': ['au', 'aux', 'de', 'des', 'du', 'd','l', 'la', 'le', 'les', 'un', 'une'],
    'Pronoms ': ['elle', 'elles', 'en', 'il', 'ils', 'je', 'j','lui', 'me', 'moi', 'nous', 'on', 'se', 'soi', 'te', 'toi', 'tu', 't', 'vous', 'y','s','m', 't',    'ça', 'ce', 'ceci', 'cela', 'cet', 'cette', 'ces', 'c','dont', 'lequel', 'laquelle', 'lesquels', 'lesquelles', 'où', 'que', 'qui', 'quoi','qu', 'quels', 'quelles','aucun', 'aucune', 'certains', 'certaines', 'chacun', 'chacune', 'nul', 'nulle', 'personne', 'plusieurs', 'quelque', 'quelques', 'rien', 'tout', 'toute', 'tous', 'toutes'],
    'Prépositions': ['à', 'après', 'avant', 'avec', 'chez', 'contre', 'dans', 'depuis', 'dès', 'durant', 'en', 'entre', 'hormis', 'hors', 'malgré', 'par', 'parmi', 'pendant', 'pour', 'sans', 'selon', 'sous', 'sur', 'vers'],
    'Conjonctions de subordination': ['alors', 'bien', 'comme', 'lorsque', 'parce', 'puisque', 'quand', 'que', 'quoique', 'si'],
    'Adverbes de négation': ['jamais', 'ne', 'non', 'n', 'nullement', 'pas', 'plus', 'point'],
    'Adverbes de quantité': ['assez', 'autant', 'beaucoup', 'davantage', 'encore', 'environ', 'peu', 'presque', 'trop', 'très'],
    'Adverbes courants': ['ainsi', 'aussi', 'bien', 'bientôt', 'cependant', 'certainement', 'déjà', 'enfin', 'ensuite', 'justement', 'là', 'maintenant', 'mal', 'même', 'notamment', 'parfois', 'pourtant', 'puis', 'rarement', 'souvent', 'surtout', 'toujours', 'toutefois', 'vraiment'],
    'Auxiliaires': ['a', 'ai', 'as', 'aurais', 'aurait', 'aurez', 'aurons', 'auront', 'aura', 'avaient', 'avais', 'avait', 'avez', 'avions', 'avoir', 'avons', 'est', 'été', 'être', 'furent', 'fut', 'ont', 'sera', 'serait', 'serez', 'serons', 'seront', 'serais', 'sois', 'soit', 'sommes', 'sont', 'était', 'étaient', 'étais', 'étiez', 'étions'],
    'Verbes support': ['aller', 'devoir', 'dire', 'donner', 'faire', 'falloir', 'faut', 'mettre', 'pouvoir', 'prendre', 'savoir', 'sembler', 'valoir', 'venir', 'voir', 'vouloir'],
};

/**
 * Ouvre la modale de gestion des mots outils (ajout, suppression, listes prédéfinies).
 */
function _lxOuvrirGestionMotsOutils() {
    document.getElementById('lx-mo-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lx-mo-overlay';
    overlay.className = 'lx-options-overlay';
    overlay.style.zIndex = '210';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'lx-options-modal lx-mo-modal';
    overlay.appendChild(modal);

    // ---- En-tête ----
    const hdr = document.createElement('div');
    hdr.className = 'lx-options-header';
    const titreEl = document.createElement('h3');
    titreEl.className = 'lx-options-title';
    titreEl.textContent = 'Gestion des mots outils';
    hdr.appendChild(titreEl);
    const btnCloseHdr = document.createElement('div');
    btnCloseHdr.className = 'close';
    btnCloseHdr.textContent = '✖️';
    btnCloseHdr.style.cursor = 'pointer';
    btnCloseHdr.addEventListener('click', () => overlay.remove());
    hdr.appendChild(btnCloseHdr);
    modal.appendChild(hdr);

    // ---- Corps ----
    const body = document.createElement('div');
    body.className = 'lx-options-body lx-mo-body';
    modal.appendChild(body);

    // --- Section 1 : Mots outils actifs (liste scrollable) ---
    const sec1 = document.createElement('div');
    sec1.className = 'lx-mo-section-title';
    sec1.textContent = 'Mots outils actifs';
    body.appendChild(sec1);

    const listWrap = document.createElement('div');
    listWrap.className = 'lx-mo-list';
    body.appendChild(listWrap);

    const btnClear = document.createElement('button');
    btnClear.className = 'btn btn-secondary';
    btnClear.style.cssText = 'font-size:11px; padding:2px 8px; margin-top:4px; margin-bottom:2px;';
    btnClear.textContent = 'Tout supprimer';
    btnClear.addEventListener('click', () => {
        lxMotsOutils.clear();
        _appliquerChangement();
    });
    body.appendChild(btnClear);

    // --- Section 2 : Ajout manuel ---
    const sec2 = document.createElement('div');
    sec2.className = 'lx-mo-section-title';
    body.appendChild(sec2);
    sec2.textContent = 'Ajouter manuellement';

    const addRow = document.createElement('div');
    addRow.className = 'lx-mo-add-row';
    body.appendChild(addRow);

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'Un ou plusieurs mots séparés par des espaces ou virgules…';
    addInput.className = 'lx-lemma-input';
    addInput.style.cssText = 'flex:1; font-size:13px;';
    addRow.appendChild(addInput);

    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-secondary';
    btnAdd.style.cssText = 'padding:4px 12px; font-size:13px; white-space:nowrap;';
    btnAdd.textContent = '＋ Ajouter';

    function doAddManual() {
        const val = addInput.value.trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,;]+/).filter(Boolean).forEach(w => lxMotsOutils.add(w));
        addInput.value = '';
        _appliquerChangement();
        addInput.focus();
    }
    btnAdd.addEventListener('click', doAddManual);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddManual(); } });
    addRow.appendChild(btnAdd);

    // --- Section 3 : Listes prédéfinies ---
    const sec3 = document.createElement('div');
    sec3.className = 'lx-mo-section-title';
    sec3.textContent = 'Listes prédéfinies';
    body.appendChild(sec3);

    const predDiv = document.createElement('div');
    predDiv.className = 'lx-mo-predefined';
    body.appendChild(predDiv);

    // Construire les blocs de catégories
    Object.entries(_LX_STOP_LISTS).forEach(([cat, formes]) => {
        const catDiv = document.createElement('div');
        catDiv.className = 'lx-mo-cat';
        predDiv.appendChild(catDiv);

        const catHead = document.createElement('div');
        catHead.className = 'lx-mo-cat-head';
        catDiv.appendChild(catHead);

        const toggl = document.createElement('span');
        toggl.className = 'lx-mo-cat-toggle';
        toggl.textContent = '▶';
        catHead.appendChild(toggl);

        const catName = document.createElement('span');
        catName.className = 'lx-mo-cat-name';
        catName.textContent = cat;
        catHead.appendChild(catName);

        const badge = document.createElement('span');
        badge.className = 'lx-mo-cat-badge';
        catHead.appendChild(badge);

        const btnTout = document.createElement('button');
        btnTout.className = 'btn btn-secondary lx-mo-cat-btn';
        btnTout.textContent = 'Tout ajouter';
        btnTout.addEventListener('click', e => {
            e.stopPropagation();
            formes.forEach(f => lxMotsOutils.add(f));
            _appliquerChangement();
        });
        catHead.appendChild(btnTout);

        const wordsDiv = document.createElement('div');
        wordsDiv.className = 'lx-mo-cat-words';
        wordsDiv.style.display = 'none';
        catDiv.appendChild(wordsDiv);

        formes.forEach(forme => {
            const btn = document.createElement('button');
            btn.className = 'lx-mo-word-btn';
            btn.dataset.forme = forme;
            btn.textContent = forme;
            btn.addEventListener('click', () => {
                if (lxMotsOutils.has(forme)) lxMotsOutils.delete(forme);
                else lxMotsOutils.add(forme);
                _appliquerChangement();
            });
            wordsDiv.appendChild(btn);
        });

        catHead.addEventListener('click', () => {
            const open = wordsDiv.style.display !== 'none';
            wordsDiv.style.display = open ? 'none' : '';
            toggl.textContent = open ? '▶' : '▼';
        });

        // Méthodes de mise à jour de l'état visuel
        catDiv._updateState = () => {
            const n = formes.filter(f => !lxMotsOutils.has(f)).length;
            badge.textContent = n === 0 ? '✓ tous ajoutés' : `${n} disponible${n > 1 ? 's' : ''}`;
            badge.style.color = n === 0 ? '#4caf50' : '#888';
            btnTout.style.display = n === 0 ? 'none' : '';
            wordsDiv.querySelectorAll('.lx-mo-word-btn').forEach(b => {
                const active = lxMotsOutils.has(b.dataset.forme);
                b.classList.toggle('lx-mo-word-btn--active', active);
                b.title = active ? 'Cliquez pour retirer' : 'Cliquez pour ajouter';
            });
        };
    });

    // ---- Pied de page ----
    const footer = document.createElement('div');
    footer.className = 'lx-options-footer';
    const btnFermer = document.createElement('label');
    btnFermer.className = 'btnfonction btnlarge';
    btnFermer.textContent = 'Fermer';
    btnFermer.addEventListener('click', () => overlay.remove());
    footer.appendChild(btnFermer);
    modal.appendChild(footer);

    // ---- Mise à jour centralisée ----
    function _refreshList() {
        listWrap.innerHTML = '';
        const sorted = [...lxMotsOutils].sort((a, b) => a.localeCompare(b, 'fr'));
        if (sorted.length === 0) {
            const vide = document.createElement('div');
            vide.className = 'lx-mo-vide';
            vide.style.padding = '6px 10px';
            vide.textContent = 'Aucun mot outil défini.';
            listWrap.appendChild(vide);
        } else {
            sorted.forEach(forme => {
                const row = document.createElement('div');
                row.className = 'lx-mo-list-row';
                const span = document.createElement('span');
                span.className = 'lx-mo-list-forme';
                span.textContent = forme;
                row.appendChild(span);
                const del = document.createElement('span');
                del.className = 'lx-mo-list-del';
                del.textContent = '×';
                del.title = 'Retirer';
                del.addEventListener('click', () => {
                    lxMotsOutils.delete(forme);
                    _appliquerChangement();
                });
                row.appendChild(del);
                listWrap.appendChild(row);
            });
        }
        btnClear.style.display = lxMotsOutils.size === 0 ? 'none' : '';
    }

    function _appliquerChangement() {
        _lxRefreshTable();
        _lxSauvegarderOut();
        _refreshList();
        predDiv.querySelectorAll('.lx-mo-cat').forEach(cd => { if (cd._updateState) cd._updateState(); });
    }

    // Rendu initial
    _refreshList();
    predDiv.querySelectorAll('.lx-mo-cat').forEach(cd => { if (cd._updateState) cd._updateState(); });

    document.body.appendChild(overlay);
    setTimeout(() => addInput.focus(), 60);
}

// ============================================================
// SÉLECTION RECTANGLE (rubber-band)
// ============================================================

var _lxRBActif    = false;  // dragging en cours
var _lxRBMoved    = false;  // a-t-on bougé de plus de 5 px ?
var _lxRBOrigin   = null;   // { x, y } en coords client (viewport)
var _lxRBOverlay  = null;   // div visuel du rectangle
var _lxRBClickRow = null;   // <tr> sous le curseur au moment du mousedown

/**
 * Installe les handlers mousedown sur le conteneur du tableau.
 * Les events mousemove et mouseup sont sur document (installés dans _lxInjecterStyles).
 */
function _lxRBInstaller(wrap) {
    wrap.addEventListener('mousedown', e => {
        // S'active uniquement sur les étiquettes de forme
        if (!e.target.classList.contains('lx-forme-txt')) return;
        e.preventDefault(); // empêche la sélection de texte natif

        _lxRBActif    = true;
        _lxRBMoved    = false;
        _lxRBOrigin   = { x: e.clientX, y: e.clientY };
        _lxRBClickRow = e.target.closest('tr');

        // Crée l'overlay (caché jusqu'au premier déplacement significatif)
        _lxRBOverlay = document.createElement('div');
        _lxRBOverlay.className = 'lx-rb-overlay';
        _lxRBOverlay.style.display = 'none';
        document.body.appendChild(_lxRBOverlay);
    });
}

/** Handler mousemove document — déplace/redimensionne le rectangle et prévisualise la sélection. */
function _lxRBMouseMove(e) {
    if (!_lxRBActif || !_lxRBOverlay) return;
    const dx = e.clientX - _lxRBOrigin.x;
    const dy = e.clientY - _lxRBOrigin.y;
    if (!_lxRBMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    _lxRBMoved = true;
    _lxRBOverlay.style.display = '';

    const left   = Math.min(_lxRBOrigin.x, e.clientX);
    const top    = Math.min(_lxRBOrigin.y, e.clientY);
    const width  = Math.abs(dx);
    const height = Math.abs(dy);

    _lxRBOverlay.style.left   = left   + 'px';
    _lxRBOverlay.style.top    = top    + 'px';
    _lxRBOverlay.style.width  = width  + 'px';
    _lxRBOverlay.style.height = height + 'px';

    // Prévisualiser les lignes intersectant le rectangle (coords viewport)
    const rbRect = { left, top, right: left + width, bottom: top + height };
    document.querySelectorAll('#lx-tbody tr.lx-row').forEach(tr => {
        const spanForme = tr.querySelector('.lx-forme-txt');
        if (!spanForme) return;
        const r = spanForme.getBoundingClientRect();
        const ok = r.left < rbRect.right && r.right > rbRect.left &&
                   r.top  < rbRect.bottom && r.bottom > rbRect.top;
        tr.classList.toggle('lx-rb-hover', ok);
    });
}

/** Handler mouseup document — finalise la sélection et supprime l'overlay. */
function _lxRBMouseUp(e) {
    if (!_lxRBActif) return;
    _lxRBActif = false;

    if (!_lxRBMoved) {
        // Clic simple : bascule la ligne cliquée
        if (_lxRBClickRow) {
            const chk = _lxRBClickRow.querySelector('input[type="checkbox"]');
            if (chk) {
                chk.checked = !chk.checked;
                chk.dispatchEvent(new Event('change'));
            }
        }
    } else {
        // Drag : sélectionne toutes les lignes en surbrillance
        document.querySelectorAll('#lx-tbody tr.lx-row').forEach(tr => {
            if (tr.classList.contains('lx-rb-hover')) {
                _lxRBSelectRow(tr, true);
            }
            tr.classList.remove('lx-rb-hover');
        });
        _lxMajSelBar();
    }

    if (_lxRBOverlay) { _lxRBOverlay.remove(); _lxRBOverlay = null; }
}

/** Sélectionne ou désélectionne une ligne <tr> en synchronisant l'item de données. */
function _lxRBSelectRow(tr, valeur) {
    const tdRk = tr.querySelector('.lx-td-rk');
    const idx  = tdRk ? parseInt(tdRk.textContent, 10) - 1 : -1;
    if (idx < 0 || idx >= lxVueDonnees.length) return;
    const item = lxVueDonnees[idx];
    if (!item) return;
    item.selectionne = valeur;
    tr.classList.toggle('lx-row--sel', valeur);
    const chk = tr.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = valeur;
}

function _lxRecupererFormesSelectionnees() {
    const formes = new Set();

    tabOccLexico.forEach(item => {
        if (item && item.selectionne) formes.add(item.forme);
    });

    lxVueDonnees.forEach(item => {
        if (item && item.selectionne) formes.add(item.forme);
    });

    return formes;
}

function _lxAppliquerFormesSelectionnees(formesSelectionnees, donnees) {
    const setSel = formesSelectionnees instanceof Set ? formesSelectionnees : new Set();

    tabOccLexico.forEach(item => {
        if (!item) return;
        item.selectionne = setSel.has(item.forme);
    });

    donnees.forEach(item => {
        if (!item) return;
        item.selectionne = setSel.has(item.forme);
    });
}

// ============================================================
// RAFRAÎCHISSEMENT (filtres actifs)
// ============================================================

function _lxRefreshTable() {
    const recherche = (document.getElementById('lx-search')?.value || '').toLowerCase().trim();
    const formesSelectionnees = _lxRecupererFormesSelectionnees();
    const _matchRecherche = d => !recherche || d.forme.startsWith(recherche) || formesSelectionnees.has(d.forme);
    lxFiltreListeTexteActif = recherche.length > 0;

    // --- Thématiques : ligthm-inactive = exclu du filtre lexico ---
    const thmLabels   = [...document.querySelectorAll('#lxPnlThm .ligthm[data-code]')];
    const thmInactifs = new Set(thmLabels.filter(l => l.classList.contains('ligthm-inactive')).map(l => l.dataset.code));
    // Filtre actif dès qu'au moins une thématique est désactivée (même si toutes le sont)
    const filtreThm   = thmInactifs.size > 0;

    // --- Variables : btn sans --actif = modalité exclue ---
    const varBtns = [...document.querySelectorAll('#lxPnlVar .btn-onoff-ent[data-v]:not([data-vide="1"])')];
    const varMap = new Map();
    varBtns.forEach(btn => {
        const v = btn.dataset.v;
        if (!varMap.has(v)) varMap.set(v, { total: 0, actifs: new Set() });
        const e = varMap.get(v);
        e.total++;
        if (btn.classList.contains('btn-onoff-ent--actif')) e.actifs.add(Number(btn.dataset.m));
    });
    const filtreVarBrut = [...varMap.values()].some(e => e.actifs.size < e.total);
    const filtreVarPossible = !lxIgnorerFiltreVariablesInitial && filtreVarBrut;

    // Si filtre variables actif, calculer les indices d'entretiens valides
    let entActifsVarCandidate = null;
    if (filtreVarPossible) {
        entActifsVarCandidate = new Set();
        tabEnt.forEach((ent, i) => {
            for (const [v, { total, actifs }] of varMap) {
                if (actifs.size >= total) continue;
                const modEnt = Array.isArray(ent.tabDat)
                    ? ent.tabDat.find(d => Number(d.v) === Number(v) && (d.l === 'all' || d.l === undefined))
                    : null;
                const m = modEnt ? Number(modEnt.m) : 0;
                if (!actifs.has(m)) return;
            }
            entActifsVarCandidate.add(i);
        });
    }

    // Un filtre variables n'est retenu que s'il réduit effectivement le sous-corpus.
    const filtreVar = !!entActifsVarCandidate && entActifsVarCandidate.size < tabEnt.length;
    const entActifsVar = filtreVar ? entActifsVarCandidate : null;

    // --- Entretiens (boutons on/off) ---
    const entBtns      = [...document.querySelectorAll('#lxPnlEnt .btn-onoff-ent[data-ent-idx]')];
    const entActifsChk = new Set(entBtns.filter(b => b.classList.contains('btn-onoff-ent--actif')).map(b => Number(b.dataset.entIdx)));
    const filtreEnt    = entBtns.some(b => !b.classList.contains('btn-onoff-ent--actif'));

    const filtreEntFinal = filtreVar || filtreEnt;
    let entActifsFinal = null;
    if (filtreEntFinal) {
        const base = entActifsVar ?? new Set([...Array(tabEnt.length).keys()]);
        entActifsFinal = filtreEnt
            ? new Set([...base].filter(i => entActifsChk.has(i)))
            : base;
    }

    const filtreQuestions = lxOptExclureQuestions;
    const filtreSelectionCorpus = filtreThm || filtreEntFinal;

    // "Corpus complet visible" = aucune sélection structurelle active.
    // Le filtre "questions" peut modifier le périmètre affiché sans activer le mode spécificités.
    lxCorpusCompletVisible = !filtreSelectionCorpus;
    lxSpecifActives = filtreSelectionCorpus;

    let données;
    lxHistogrammeComparatifActif = filtreSelectionCorpus;

    if (filtreThm || filtreEntFinal || filtreQuestions) {
        // ---- Filtre structurel actif : réagrégation depuis tabLexico ----
        // On recompte les occurrences réelles pour chaque forme dans le contexte filtré.

        const occActives = tabLexico.filter(item => {
            // Filtre questions : exclure les locuteurs dont le nom se termine par '?'
            if (filtreQuestions && item.locuteur && item.locuteur.endsWith('?')) return false;
            // Filtre entretien
            if (filtreEntFinal && !entActifsFinal.has(item.entretien)) return false;
            // Filtre thématique : l'occurrence doit appartenir à au moins une thématique active.
            // Les occurrences sans thématique (hors extrait) sont exclues si le filtre est actif.
            if (filtreThm) {
                if (item.thematiques.length === 0) return false;
                if (item.thematiques.every(t => thmInactifs.has(t))) return false;
            }
            return true;
        });

        // Réagrégation légère : occTotal et nbEnt dans le contexte courant
        const aggMap = new Map();
        occActives.forEach(item => {
            const cle = (item.substitut && item.substitut.trim()) ? item.substitut.trim() : item.forme;
            if (!aggMap.has(cle)) aggMap.set(cle, { occTotal: 0, entretiens: new Set() });
            const e = aggMap.get(cle);
            e.occTotal++;
            e.entretiens.add(item.entretien);
        });

        données = [];
        tabOccLexico.forEach(d => {
            if (!aggMap.has(d.forme)) return;
            if (!_matchRecherche(d)) return;
            const agg = aggMap.get(d.forme);
            données.push({ ...d, occTotalGlobal: d.occTotal, occTotal: agg.occTotal, nbEnt: agg.entretiens.size });
        });

        // Les spécificités n'ont de sens que si un sous-corpus est sélectionné (thm/var/ent).
        if (lxSpecifActives) {
            const gt = tabLexico.length;
            const pt = occActives.length;
            données.forEach(item => {
                item.pValue   = _lxPLafon(gt, pt, item.occTotalGlobal, item.occTotal);
                item.specSign = item.occTotal > item.occTotalGlobal * pt / gt ? 'POS' : 'NEG';
            });
        }

        // Re-trier selon le critère choisi par l'utilisateur
        données.sort((a, b) => {
            if (lexicoTriPar === 'alpha') {
                const cmp = a.forme.localeCompare(b.forme, 'fr', { sensitivity: 'base' });
                return lexicoDesc ? cmp : -cmp;
            }
            if (lexicoTriPar === 'nbEnt') {
                const cmp = b.nbEnt - a.nbEnt;
                return lexicoDesc ? cmp : -cmp;
            }
            if (lexicoTriPar === 'pval') {
                return lexicoDesc ? a.pValue - b.pValue : b.pValue - a.pValue;
            }
            if (lexicoTriPar === 'rel') {
                const relA = (Number.isFinite(a.occTotalGlobal) && a.occTotalGlobal > 0)
                    ? (a.occTotal / a.occTotalGlobal)
                    : 1;
                const relB = (Number.isFinite(b.occTotalGlobal) && b.occTotalGlobal > 0)
                    ? (b.occTotal / b.occTotalGlobal)
                    : 1;
                const cmp = relB - relA;
                return lexicoDesc ? cmp : -cmp;
            }
            // freq (défaut) : tri par fréquence filtrée décroissante
            const cmp = b.occTotal - a.occTotal;
            return lexicoDesc ? cmp : -cmp;
        });
    } else {
        // Aucun filtre structurel : on utilise tabOccLexico déjà trié
        données = recherche ? tabOccLexico.filter(_matchRecherche) : tabOccLexico;
    }

    // ---- Application des options d'affichage ----
    if (!lxOptAfficherChiffres) données = données.filter(d => !/^[0-9]+$/.test(d.forme));
    if (lxOptOccMin > 1) données = données.filter(d => d.occTotal >= lxOptOccMin);
    if (lxOptLemmatiserVerbes && !lxOptAfficherVerbesLemmes) données = données.filter(d => !_lxFormeEstLemmeVerbeMasquable(d.forme));
    // Le filtrage des spécificités négatives n'est pertinent que si les spécificités sont actives.
    if (lxSpecifActives && !lxOptAfficherSpecNeg) données = données.filter(d => !d.specSign || d.specSign !== 'NEG');
    if (lxMotsOutils.size > 0) données = données.filter(d => !lxMotsOutils.has(d.forme));

    _lxAppliquerFormesSelectionnees(formesSelectionnees, données);

    const tbody = document.getElementById('lx-tbody');
    if (tbody) _lxRendreTable(tbody, données);

    const bar = document.getElementById('lx-infobar');
    if (bar) _lxMajInfoBar(bar, données);
    _lxMajEnteteBarre();
    _lxMajSelBar();

    // Synchroniser le nuage avec la liste effectivement affichee.
    if (document.getElementById('lx-wordle-panel')) {
        requestAnimationFrame(() => _lxRendreWordle());
    }
}

// ============================================================
// STYLES CSS (injectés une seule fois)
// ============================================================

// ============================================================
// SPÉCIFICITÉ — formule de Lafon (1980)
// ============================================================

function _lxFAC(xp) {
    if (xp <= 1) return 0;
    if (xp <= 21) {
        let z = 1;
        for (let i = 2; i <= xp; i++) z *= i;
        return Math.log(z);
    }
    const x = xp + 0.5;
    return x * Math.log(x) - x + Math.log(2 * Math.PI) / 2
         - 1/12    * (1 / (2 * x))
         + 7/360   * Math.pow(1 / (2 * x), 3)
         - 31/1260 * Math.pow(1 / (2 * x), 5)
         + 127/1680 * Math.pow(1 / (2 * x), 7)
         - 511/1188 * Math.pow(1 / (2 * x), 9);
}

function _lxSpecif(gt, pt, f, k) {
    const num = _lxFAC(f) + _lxFAC(gt - f) + _lxFAC(pt) + _lxFAC(gt - pt);
    const den = _lxFAC(gt) + _lxFAC(k) + _lxFAC(f - k) + _lxFAC(pt - k) + _lxFAC(gt - f - pt + k);
    return Math.exp(num - den);
}

function _lxPLafon(gt, pt, f, k) {
    if (gt <= 0 || pt <= 0 || f <= 0 || k < 0) return 1;
    if (f - k < 0 || pt - k < 0 || gt - f - pt + k < 0) return 1;
    const theorique = f * pt / gt;
    let ss = 0;
    if (k <= theorique) {
        // Spécificité négative : somme de k à 0
        for (let j = k; j >= 0; j--) {
            const s = _lxSpecif(gt, pt, f, j);
            if (!isFinite(s)) break;
            ss += s;
        }
    } else {
        // Spécificité positive : somme de k vers f
        let delta = 1, j = k;
        while (delta > 1e-10 && j <= f && j <= pt) {
            delta = _lxSpecif(gt, pt, f, j);
            if (!isFinite(delta)) break;
            ss += delta;
            j++;
        }
    }
    return Math.min(ss, 1);
}

// ============================================================
// PERSISTANCE — fichiers .cnct, .lem et .out
// ============================================================

/**
 * Chargement initial des concatenations (.cnct), lemmatisations (.lem) et mots outils (.out).
 * Appelée à la fin de extraireLexico(), avant l'agrégation.
 */
async function _lxChargerFichiersAnnexes() {
    // ---- Fichier .cnct ----
    try {
        lxConcatRegles = new Map();
        const res = await window.electronAPI.lireAnnexeLexico('.cnct');
        if (res && res.success && res.content) {
            res.content.split('\n').forEach(raw => {
                const ligne = String(raw || '').trim();
                if (!ligne) return;

                const sep = ligne.indexOf('\t');
                const sourceBrut = sep > 0 ? ligne.slice(0, sep).trim() : ligne;
                const suite = sep > 0 ? ligne.slice(sep + 1).trim() : '';
                if (!sourceBrut) return;

                const tokens = _lxCnctNormaliserSequence(sourceBrut.split(/\s+/));
                if (tokens.length < 2) return;

                const source = tokens.join(' ');
                const sep2 = suite.indexOf('\t');
                const substitut = (sep2 >= 0 ? suite.slice(0, sep2) : suite).trim() || source;

                lxConcatRegles.set(source, { tokens, substitut });
            });

            if (lxConcatRegles.size > 0) {
                const nb = _lxAppliquerToutesConcatenations();
                console.log(`[Lexico] ${lxConcatRegles.size} regle(s) de concatenation chargee(s) depuis .cnct (${nb} occurrence(s) fusionnee(s))`);
            }
        }
    } catch (e) {
        console.warn('[Lexico] Impossible de lire le fichier .cnct :', e);
    }

    // ---- Fichier .lem ----
    try {
        const res = await window.electronAPI.lireAnnexeLexico('.lem');
        if (res && res.success && res.content) {
            const lemMap = new Map();
            res.content.split('\n').forEach(ligne => {
                const sep = ligne.indexOf('\t');
                if (sep > 0) {
                    const forme = ligne.slice(0, sep).trim();
                    const suite = ligne.slice(sep + 1).trim();
                    if (!suite) return;

                    const sep2 = suite.indexOf('\t');
                    const substitut = sep2 >= 0 ? suite.slice(0, sep2).trim() : suite;
                    const typeForme = sep2 >= 0 ? suite.slice(sep2 + 1).trim() : '';

                    if (forme && substitut) lemMap.set(forme, { substitut, typeForme });
                }
            });
            if (lemMap.size > 0) {
                tabLexico.forEach(item => {
                    const entry = lemMap.get(item.forme);
                    if (entry && entry.substitut) {
                        item.substitut = entry.substitut;
                        item.typeForme = entry.typeForme || '';
                    }
                });

                // Si l'option verbes n'est pas active, ignorer les substitutions automatiques marquées V.
                if (!lxOptLemmatiserVerbes) {
                    tabLexico.forEach(item => {
                        if (item.typeForme === 'V') {
                            item.substitut = '';
                            item.typeForme = '';
                        }
                    });
                }
                console.log(`[Lexico] ${lemMap.size} lemmatisation(s) chargée(s) depuis .lem`);
            }
        }
    } catch (e) {
        console.warn('[Lexico] Impossible de lire le fichier .lem :', e);
    }

    // ---- Fichier .out ----
    try {
        const res = await window.electronAPI.lireAnnexeLexico('.out');
        if (res && res.success && res.content) {
            lxMotsOutils = new Set();
            res.content.split('\n').forEach(ligne => {
                const forme = ligne.trim();
                if (forme) lxMotsOutils.add(forme);
            });
            console.log(`[Lexico] ${lxMotsOutils.size} mot(s) outil(s) chargé(s) depuis .out`);
        } else {
            // Pas de fichier .out : on garde l'ensemble vide
            lxMotsOutils = new Set();
        }
    } catch (e) {
        console.warn('[Lexico] Impossible de lire le fichier .out :', e);
    }
}

/**
 * Sauvegarde l'état courant des lemmatisations dans le fichier .lem.
 * Reconstruit la map forme→substitut depuis tabLexico.
 */
async function _lxSauvegarderLem() {
    const lemMap = new Map();
    tabLexico.forEach(item => {
        if (item.substitut && item.substitut.trim()) {
            lemMap.set(item.forme, {
                substitut: item.substitut.trim(),
                typeForme: item.typeForme || ''
            });
        }
    });
    const content = [...lemMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
        .map(([forme, entry]) => forme + '\t' + entry.substitut + '\t' + entry.typeForme)
        .join('\n');
    try {
        await window.electronAPI.sauvegarderAnnexeLexico('.lem', content);
        console.log(`[Lexico] ${lemMap.size} lemmatisation(s) sauvegardée(s) dans .lem`);
    } catch (e) {
        console.warn('[Lexico] Impossible de sauvegarder le fichier .lem :', e);
    }
}

/**
 * Sauvegarde l'ensemble des regles de concatenation courantes dans le fichier .cnct.
 */
async function _lxSauvegarderCnct() {
    const content = [...lxConcatRegles.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
        .map(([source, regle]) => {
            const substitut = String(regle?.substitut || source).trim() || source;
            return source + '\t' + substitut + '\tC';
        })
        .join('\n');

    try {
        await window.electronAPI.sauvegarderAnnexeLexico('.cnct', content);
        console.log(`[Lexico] ${lxConcatRegles.size} regle(s) de concatenation sauvegardee(s) dans .cnct`);
    } catch (e) {
        console.warn('[Lexico] Impossible de sauvegarder le fichier .cnct :', e);
    }
}

/**
 * Sauvegarde l'ensemble des mots outils courants dans le fichier .out.
 */
async function _lxSauvegarderOut() {
    const content = [...lxMotsOutils].sort((a, b) => a.localeCompare(b, 'fr')).join('\n');
    try {
        await window.electronAPI.sauvegarderAnnexeLexico('.out', content);
        console.log(`[Lexico] ${lxMotsOutils.size} mot(s) outil(s) sauvegardé(s) dans .out`);
    } catch (e) {
        console.warn('[Lexico] Impossible de sauvegarder le fichier .out :', e);
    }
}

function _lxVrbNormaliserCasse(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/\u2019/g, "'")
        .normalize('NFC')
        .trim();
}

function _lxVrbNormaliserPli(str) {
    return _lxVrbNormaliserCasse(str)
        .replace(/œ/g, 'oe')
        .replace(/æ/g, 'ae')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function _lxVrbAjouterRacine(indexMap, racineBrute) {
    const racine = _lxVrbNormaliserCasse(racineBrute).replace(/[^\p{L}]/gu, '');
    if (!racine || racine.length < 2) return;
    const init = racine.charAt(0);
    if (!indexMap.has(init)) indexMap.set(init, new Set());
    indexMap.get(init).add(racine);
}

function _lxVrbFinaliserIndex(indexMap) {
    const out = new Map();
    for (const [k, racines] of indexMap.entries()) {
        out.set(k, [...racines].sort((a, b) => b.length - a.length));
    }
    return out;
}

function _lxVrbParserIrreguliers(content) {
    const irrMap = new Map();
    let infCourantAffiche = '';

    content.split(/\r?\n/).forEach(raw => {
        const ligne = String(raw || '').trim();
        if (!ligne) return;

        if (ligne.startsWith('>>')) {
            infCourantAffiche = _lxVrbNormaliserCasse(ligne.slice(2).trim());
            if (infCourantAffiche && !infCourantAffiche.endsWith('+')) infCourantAffiche += '+';

            const infNorm = _lxVrbNormaliserCasse(infCourantAffiche.replace(/\+$/, ''));
            if (infNorm) irrMap.set(infNorm, infCourantAffiche);
            return;
        }

        if (!infCourantAffiche) return;
        const formeNorm = _lxVrbNormaliserCasse(ligne).replace(/[^\p{L}]/gu, '');
        if (formeNorm) irrMap.set(formeNorm, infCourantAffiche);
    });

    return irrMap;
}

async function _lxChargerDicosVerbes() {
    if (_lxVrbDicos.charges) return true;

    const res = await window.electronAPI.lireDicosVerbesLexico();
    if (!res || !res.success) {
        const msg = res && res.error ? res.error : 'Erreur inconnue';
        throw new Error(msg);
    }

    const indexGrp1 = new Map();
    const indexGrp2 = new Map();

    String(res.grp1 || '').split(/\r?\n/).forEach(ligne => _lxVrbAjouterRacine(indexGrp1, ligne));
    String(res.grp2 || '').split(/\r?\n/).forEach(ligne => _lxVrbAjouterRacine(indexGrp2, ligne));

    _lxVrbDicos.grp1 = _lxVrbFinaliserIndex(indexGrp1);
    _lxVrbDicos.grp2 = _lxVrbFinaliserIndex(indexGrp2);
    _lxVrbDicos.irr = _lxVrbParserIrreguliers(String(res.irg || ''));
    _lxVrbDicos.charges = true;

    console.log(`[Lexico] Dicos verbes chargés: grp1=${[..._lxVrbDicos.grp1.values()].reduce((s, a) => s + a.length, 0)}, grp2=${[..._lxVrbDicos.grp2.values()].reduce((s, a) => s + a.length, 0)}, irr=${_lxVrbDicos.irr.size}`);
    return true;
}

function _lxTrouverLemmaVerbe(forme) {
    const mot = _lxVrbNormaliserCasse(forme).replace(/[^\p{L}]/gu, '');
    if (!mot || mot.length < 2) return null;

    const irr = _lxVrbDicos.irr.get(mot);
    if (irr) return irr;

    const init = mot.charAt(0);

    const racinesER = _lxVrbDicos.grp1.get(init) || [];
    for (const r of racinesER) {
        let term = null;

        if (mot.startsWith(r)) {
            term = mot.slice(r.length);
        }

        if (term !== null && _LX_TERM_ER.has(_lxVrbNormaliserCasse(term))) {
            return r + 'er+';
        }
    }

    const racinesIR = _lxVrbDicos.grp2.get(init) || [];
    for (const r of racinesIR) {
        let term = null;

        if (mot.startsWith(r)) {
            term = mot.slice(r.length);
        }

        if (term !== null && _LX_TERM_IR.has(_lxVrbNormaliserCasse(term))) {
            return r + 'ir+';
        }
    }

    return null;
}

async function _lxLemmatiserVerbesAuto() {
    if (!Array.isArray(tabLexico) || tabLexico.length === 0) return;

    try {
        await _lxChargerDicosVerbes();
    } catch (e) {
        console.warn('[Lexico] Chargement des dictionnaires verbaux impossible:', e);
        alert('Dictionnaires de verbes introuvables. Vérifiez le dossier Dico.');
        return;
    }

    const total = tabLexico.length;
    let reconnus = 0;
    let modifies = 0;

    const sb = document.getElementById('status-bar');
    const pb = document.getElementById('progress-bar');

    for (let i = 0; i < total; i++) {
        const item = tabLexico[i];
        if (!_lxVrbContexteAutorise(i)) continue;

        const lemma = _lxTrouverLemmaVerbe(item.forme);
        
        if (lemma) {
            reconnus++;
            const hasManualSubst = item.substitut && item.substitut.trim() && item.typeForme !== 'V';
            if (!hasManualSubst && (item.substitut !== lemma || item.typeForme !== 'V')) {
                item.substitut = lemma;
                item.typeForme = 'V';
                modifies++;
            }
        }

        if (i % _lxVrbProgressTick === 0 || i === total - 1) {
            const pct = Math.round(((i + 1) / total) * 100);
            if (pb) pb.style.width = pct + '%';
            if (sb) sb.innerText = `Lemmatisation verbale en cours... ${pct}% (${i + 1}/${total})`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    agreguerLexico();
    _lxRefreshTable();
    await _lxSauvegarderLem();

    if (pb) pb.style.width = '0%';
    const msg = `Lemmatisation verbale: ${reconnus} forme(s) reconnue(s), ${modifies} substitution(s) mise(s) à jour.`;
    console.log(`[Lexico] ${msg}`);
    if (sb) sb.innerText = msg;
}

async function _lxAnnulerLemmatisationVerbesAuto() {
    if (!Array.isArray(tabLexico) || tabLexico.length === 0) return;

    const total = tabLexico.length;
    let annules = 0;
    const sb = document.getElementById('status-bar');
    const pb = document.getElementById('progress-bar');

    for (let i = 0; i < total; i++) {
        const item = tabLexico[i];
        if (item.typeForme === 'V') {
            item.substitut = '';
            item.typeForme = '';
            annules++;
        }

        if (i % _lxVrbProgressTick === 0 || i === total - 1) {
            const pct = Math.round(((i + 1) / total) * 100);
            if (pb) pb.style.width = pct + '%';
            if (sb) sb.innerText = `Annulation lemmatisation verbale... ${pct}% (${i + 1}/${total})`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    agreguerLexico();
    _lxRefreshTable();
    await _lxSauvegarderLem();

    if (pb) pb.style.width = '0%';
    const msg = `Lemmatisation verbale annulée: ${annules} substitution(s) de type V retirée(s).`;
    console.log(`[Lexico] ${msg}`);
    if (sb) sb.innerText = msg;
}

async function _lxAppliquerOptionLemmatisationVerbes(activer) {
    if (activer) await _lxLemmatiserVerbesAuto();
    else await _lxAnnulerLemmatisationVerbesAuto();
}

function _lxInjecterStyles() {
    if (document.getElementById('lx-styles')) return;
    const s = document.createElement('style');
    s.id = 'lx-styles';
    s.textContent = `
        /* ---- Panneaux latéraux ---- */
        .lx-panel {
            display: flex; flex-direction: column;
            flex-shrink: 0; min-width: 0;
            border-right: 1px solid #d0d0d0; background: #fafafa;
            overflow: hidden;
        }
        .lx-panel.lx-hidden { display: none !important; }
        .lx-panel-head {
            display: flex; justify-content: space-between; align-items: center;
            padding: 5px 8px; font-size: 0.9rem; font-weight: bold;
            color: var(--couleur-titre);
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
            border-bottom: 1px solid #d0d0d0; flex-shrink: 0;
        }
        .lx-panel-close {
            cursor: pointer; color: #aaa; font-size: 13px; padding: 0 3px; border-radius: 2px;
        }
        .lx-panel-close:hover { color: #333; background: #ddd; }
        .lx-panel-body { overflow-y: auto; flex: 1; }
        .lx-pnl-onoff {
            width: 24px !important;  
            margin: 0 6px 0 0 !important; flex-shrink: 0; float: none !important;
        }
        .lx-pnl-onoff::before {
            width: 14px !important; height: 14px !important; margin-top: 1px !important;
        }
        .lx-empty { padding: 10px 8px; font-size: 13px; color: #aaa; font-style: italic; }

        /* Panneau thématiques : les lignes héritent des classes ligthm de la page principale.
           On adapte juste la largeur du panneau pour les libellés longs. */
        #lxPnlThm .conteneur_cat { padding: 4px 2px; }
        #lxPnlThm .ligthm { font-size: 13px; padding: 4px 6px 6px 6px; min-height: 24px; }

        /* Panneau variables : les classes tap-* viennent de styles.css */
        #lxPnlVar .tap-mod-lbl { min-width: 0; flex: 1; font-size: 0.85rem; }
        #lxPnlVar .tap-var-lbl { font-size: 0.9rem; }
        #lxPnlVar .tap-collapse-btn { font-size: 0.75rem; }

        /* ---- Entretiens ---- */
        .lx-ent-row {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 8px; font-size: 13px; color: #333;
        }
        .lx-ent-row:hover { background: #eee; cursor: pointer; }
        .lx-ent-nom { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #lxPnlVar .tap-mod-lbl { cursor: pointer; }

        /* ---- Panneau index principal ---- */
        .lx-index { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .lx-infobar {
            display: flex; gap: 24px; padding: 5px 12px; flex-shrink: 0; font-size: 14px;
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
            border-bottom: 1px solid #d0d0d0;
        }
        .lx-info-occ  { color: #2e7d32; }
        .lx-info-diff { color: var(--couleur-titre); }
        .lx-searchbar { padding: 5px 10px; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; }
        .lx-search-input {
            width: 100%; padding: 4px 8px; box-sizing: border-box;
            border: 1px solid #ccc; border-radius: 4px; font-size: 14px;
        }
        .lx-search-input:focus { outline: none; border-color: var(--couleur-titre); }

        /* ---- Table ---- */
        .lx-table-wrap { flex: 1; overflow: auto; }
        .lx-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
        .lx-table thead th {
            position: sticky; top: 0; z-index: 5;
            padding: 4px 6px; border: 1px solid #d4d4d4;
            font-size: 11px; white-space: nowrap; color: var(--couleur-titre);
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
        }
        .lx-sortable { cursor: pointer; user-select: none; }
        .lx-sortable:hover { background: #e0eaf4 !important; }
        .lx-table td {
            padding: 1px 6px; border-bottom: 1px solid #efefef;
            white-space: nowrap; vertical-align: middle;
        }
        .lx-row:hover td { background: #f0f5fb; }
        .lx-row--sel td  { background: #d6eaff; }
        .lx-th-chk,   .lx-td-chk   { width: 26px;  text-align: center; }
        .lx-th-rk,    .lx-td-rk    { width: 36px;  text-align: right; color: #bbb; font-size: 10px; }
        .lx-th-forme, .lx-td-forme  { width: auto;  overflow: hidden; text-overflow: ellipsis; }
        .lx-th-freq,  .lx-td-freq   { width: 56px;  text-align: right; color: #555; }
        .lx-th-bar,   .lx-td-bar    { width: 220px; }
        .lx-th-nbent, .lx-td-nbent  { width: 52px;  text-align: right; color: #555; }
        .lx-th-pval,  .lx-td-pval   { width: 52px;  text-align: right; font-size: 11px; }

        /* Barre de fréquence / proportion */
        .lx-bar-wrap {
            display: flex; align-items: center; gap: 6px;
        }
        .lx-bar-outer {
            position: relative; height: 10px;
            flex: 1 1 auto;
            background: #e4e4e4; border-radius: 3px; overflow: hidden; margin: 1px 2px;
        }
        .lx-bar-inner {
            height: 100%; border-radius: 3px;
            background: linear-gradient(90deg, #4f84bb, #7aa8d4);
        }

        /* Graduation logarithmique dans l'en-tête */
        .lx-scale { position: relative; height: 14px; font-size: 9px; color: #999; }
        .lx-scale-mark { position: absolute; transform: translateX(-50%); white-space: nowrap; }

        /* ---- Modale Options ---- */
        .lx-options-overlay {
            position: fixed; inset: 0; z-index: 200;
            background: rgba(0,0,0,0.25);
            display: flex; align-items: center; justify-content: center;
        }
        .lx-options-modal {
            background: var(--couleur-block, #fff);
            border: 1px solid #ccc; border-radius: 6px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.18);
            min-width: 340px; max-width: 480px; width: 360px;
            display: flex; flex-direction: column;
        }
        .lx-options-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 14px;
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block, #fff));
            border-bottom: 1px solid #d0d0d0; border-radius: 6px 6px 0 0;
        }
        .lx-options-title { margin: 0; font-size: 1rem; font-weight: bold; color: var(--couleur-titre); }
        .lx-options-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
        .lx-opt-row { display: flex; align-items: center; gap: 8px; font-size: 14px; flex-wrap: wrap; }
        .lx-opt-row input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; flex-shrink: 0; margin: 0; }
        .lx-opt-row label { cursor: pointer; }
        .lx-opt-occ-wrap { display: flex; align-items: center; gap: 4px; margin-left: 2px; }
        .lx-opt-occ-wrap input[type="number"] {
            width: 60px; padding: 2px 4px;
            border: 1px solid #ccc; border-radius: 3px; font-size: 13px;
        }
        .lx-opt-occ-wrap select { padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
        .lx-options-footer {
            padding: 10px 16px; border-top: 1px solid #e0e0e0;
            display: flex; justify-content: flex-end;
        }

        /* ---- Cellule forme : texte + bouton ➕ ---- */
        .lx-td-forme { display: flex; align-items: center; gap: 4px; overflow: hidden; }
        .lx-forme-txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lx-forme-txt.lx-lemme-verbe {
            color: #0b5394;
            font-weight: 600;
            text-decoration: underline dotted rgba(11, 83, 148, 0.55);
            text-underline-offset: 2px;
        }
        .lx-forme-txt.lx-lemme-manuel {
            color: #7a1f5c;
            font-weight: 600;
            text-decoration: underline dotted rgba(122, 31, 92, 0.5);
            text-underline-offset: 2px;
        }
        .lx-forme-txt.lx-lemme-verbe.lx-lemme-manuel {
            color: #5a2a8a;
            text-decoration-style: double;
        }
        .lx-btn-det {
            flex-shrink: 0; font-size: 10px; line-height: 1;
            padding: 1px 3px; border-radius: 3px; border: none;
            background: transparent; color: #2c5e8c; cursor: pointer;
            opacity: 0; transition: opacity 0.15s;
        }
        .lx-btn-expand {
            flex-shrink: 0; font-size: 10px; line-height: 1;
            padding: 1px 3px; border-radius: 3px; border: none;
            background: transparent; color: #2c5e8c; cursor: pointer;
            opacity: 0; transition: opacity 0.15s;
        }
        .lx-btn-ungrp {
            flex-shrink: 0; font-size: 11px; line-height: 1;
            padding: 1px 4px; border-radius: 3px; border: none;
            background: transparent; color: #9f2f2f; cursor: pointer;
            opacity: 0; transition: opacity 0.15s;
        }
        .lx-row:hover .lx-btn-det,
        .lx-row:hover .lx-btn-expand,
        .lx-row:hover .lx-btn-ungrp { opacity: 1; }
        .lx-btn-det:hover { background: #c5daf7; }
        .lx-btn-expand:hover { background: #c5daf7; }
        .lx-btn-ungrp:hover { background: #f8d6d6; }

        .lx-sub-row td { background: #f8fbff; }
        .lx-sub-row:hover td { background: #eef5ff; }
        .lx-td-forme-sub { padding-left: 20px; }
        .lx-forme-sub::before {
            content: '>';
            color: #8aa5c3;
            margin-right: 6px;
        }

        /* ---- Modal occurrences en contexte ---- */
        .lx-occ-ligne {
            padding: 8px 8px; border-bottom: 1px solid #efefef;
            font-size: 13px;
        }
        .lx-occ-ligne:hover { background: #f5f8ff; }
        .lx-occ-meta {
            display: flex; gap: 10px; font-size: 11px; color: #888;
            margin-bottom: 3px;
        }
        .lx-occ-ent { font-weight: bold; color: var(--couleur-titre); }
        .lx-occ-loc { font-style: italic; }
        .lx-occ-ctx {
            display: flex;
            align-items: baseline;
            line-height: 1.6;
            min-width: 500px;
        }
        .lx-occ-avant {
            flex: 1 1 0; min-width: 0;
            text-align: right; white-space: nowrap; overflow: hidden;
            color: #555; padding-right: 8px;
            mask-image: linear-gradient(to right, transparent 0%, black 30%);
            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 30%);
        }
        .lx-occ-apres {
            flex: 1 1 0; min-width: 0;
            text-align: left; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis;
            color: #555; padding-left: 8px;
        }
        .lx-occ-mot { flex: 0 0 auto; white-space: nowrap; color: #1a237e; background: #e8f0fb; padding: 0 4px; border-radius: 2px; }
        .lx-occ-mot.lx-lemme-verbe {
            color: #0a3d73;
            background: #dbeeff;
            box-shadow: inset 0 -2px 0 rgba(10, 61, 115, 0.25);
        }
        .lx-occ-mot.lx-lemme-manuel {
            color: #6f2456;
            background: #f6e3f0;
            box-shadow: inset 0 -2px 0 rgba(111, 36, 86, 0.23);
        }
        .lx-occ-mot.lx-lemme-verbe.lx-lemme-manuel {
            color: #5a2a8a;
            background: #ece4f8;
            box-shadow: inset 0 -2px 0 rgba(90, 42, 138, 0.24);
        }
        .lx-occ-entete {
            padding: 5px 12px; font-size: 12px; font-weight: bold;
            color: var(--couleur-titre);
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
            border-top: 1px solid #d0d0d0; border-bottom: 1px solid #d0d0d0;
            position: sticky; top: 0; z-index: 1;
        }
        .lx-occ-cloud-filter-badge {
            display: inline-block;
            margin-left: 10px;
            padding: 2px 8px;
            border: 1px solid #9fb5d9;
            border-radius: 999px;
            background: #eef4ff;
            color: #45689f;
            font-size: 11px;
            font-weight: 600;
            vertical-align: middle;
        }

        .lx-kwic-cloud-wrap {
            flex-shrink: 0;
            border-top: 1px solid #d0d0d0;
            background: #fcfdff;
            padding: 0 10px 6px 10px;
            overflow: hidden;
        }
        .lx-kwic-cloud-handle {
            height: 8px;
            margin: 0 -10px 6px -10px;
            cursor: ns-resize;
            user-select: none;
            background: linear-gradient(to bottom, #d7dee9, #eef2f8 55%, transparent 55%);
            border-bottom: 1px solid #dde4ef;
        }
        .lx-kwic-cloud-handle:hover {
            background: linear-gradient(to bottom, #aac2ea, #dbe8fb 55%, transparent 55%);
            border-bottom-color: #9db8e6;
        }
        .lx-kwic-cloud-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 7px;
        }
        .lx-kwic-cloud-title {
            color: var(--couleur-titre);
            font-weight: bold;
            font-size: 12px;
        }
        .lx-kwic-cloud-count {
            color: #6f7f98;
            font-weight: normal;
            font-size: 11px;
        }
        .lx-kwic-cloud-legend {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .lx-kwic-cloud-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 8px;
        }
        .lx-kwic-cloud-filters {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .lx-kwic-chip {
            border: 1px solid #c9d3e6;
            background: #fff;
            color: #5c6f8f;
            border-radius: 999px;
            padding: 2px 9px;
            font-size: 11px;
            cursor: pointer;
        }
        .lx-kwic-chip:hover {
            border-color: #8eb0e8;
            color: #2859a8;
            background: #f4f8ff;
        }
        .lx-kwic-chip--actif {
            border-color: #5d8ddb;
            background: #e8f0ff;
            color: #2859a8;
            font-weight: bold;
        }
        .lx-kwic-cloud-sort {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #5c6f8f;
        }
        .lx-kwic-cloud-sort select {
            border: 1px solid #ccd5e6;
            border-radius: 5px;
            padding: 2px 6px;
            background: #fff;
            color: #40526f;
            font-size: 11px;
        }
        .lx-kwic-legend-item {
            font-size: 10px;
            border: 1px solid #ccc;
            border-radius: 999px;
            padding: 1px 7px;
            white-space: nowrap;
        }
        .lx-kwic-legend-thm { color: #2f7d4b; border-color: #2f7d4b66; background: #2f7d4b18; }
        .lx-kwic-legend-mod { color: #a05a2c; border-color: #a05a2c66; background: #a05a2c18; }
        .lx-kwic-legend-ent { color: #2a4f9d; border-color: #2a4f9d66; background: #2a4f9d18; }
        .lx-kwic-cloud-body {
            min-height: 48px;
            overflow-y: auto;
            border: 1px solid #ebeff8;
            border-radius: 6px;
            padding: 8px;
            background: #fff;
            line-height: 2.1;
        }
        .lx-kwic-tag {
            display: inline-block;
            appearance: none;
            border: 1px solid;
            border-radius: 6px;
            padding: 1px 8px;
            margin: 2px 4px;
            transition: transform 0.12s ease, box-shadow 0.12s ease;
            cursor: pointer;
            user-select: none;
            background-clip: padding-box;
        }
        .lx-kwic-tag:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(60, 75, 110, 0.12);
        }
        .lx-kwic-tag:active { transform: translateY(0); }
        .lx-kwic-tag--actif {
            outline: 2px solid rgba(42, 79, 157, 0.28);
            outline-offset: 1px;
            box-shadow: 0 0 0 2px rgba(42, 79, 157, 0.10), 0 3px 8px rgba(50, 70, 110, 0.16) !important;
            transform: translateY(-1px);
        }
        .lx-kwic-cloud-note {
            margin-top: 6px;
            font-size: 10px;
            color: #7a879d;
        }
        .lx-kwic-cloud-empty {
            font-size: 12px;
            color: #8a8a8a;
            font-style: italic;
            padding: 4px 2px;
        }

        /* ---- Barre de sélection multiple ---- */
        .lx-selbar {
            display: flex; align-items: center; gap: 0px; flex-shrink: 0;
            padding: 4px 10px; font-size: 13px;
            background: #e6effc; border-bottom: 1px solid #aac4e8;
        }
        .lx-selbar--hidden { display: none !important; }
        .lx-selbar-count { color: #1a4f8a; font-weight: bold; flex: 1; }
       .lx-selbar-btn {
        font-size: 12px !important;
        padding: 2px 8px !important;
        height: 30px;
        }
        .lx-selbar-btn--hidden { display: none !important; }

        .lx-th-chk-all {
            width: 14px;
            height: 14px;
            cursor: pointer;
            vertical-align: middle;
        }
        .lx-th-chk-all--hidden {
            visibility: hidden;
            pointer-events: none;
        }

        /* ---- Rubber-band rectangle ---- */
        .lx-rb-overlay {
            position: fixed; pointer-events: none; z-index: 9999;
            border: 1.5px solid #2962ff;
            background: rgba(41,98,255,0.07);
            box-sizing: border-box;
        }
        .lx-rb-hover td { background: #d8eaff !important; }

        /* Curseur sur les étiquettes de forme pour signaler la sélection possible */
        .lx-forme-txt { cursor: default; user-select: none; }

        /* ---- Modale Lemmatisation ---- */
        .lx-lemma-modal { min-width: 320px; max-width: 460px; width: 400px; }
        .lx-lemma-body { gap: 6px !important; }
        .lx-lemma-label {
            font-size: 13px; font-weight: bold; color: #555; margin-bottom: 2px;
        }
        .lx-lemma-listbox {
            border: 1px solid #ccc; border-radius: 3px; overflow-y: auto;
            max-height: 200px; min-height: 48px;
            background: #f2f2f2; padding: 4px 8px;
            font-size: 13px; color: #333; margin-bottom: 4px;
        }
        .lx-lemma-listitem { padding: 1px 2px; line-height: 1.6; }
        .lx-lemma-input {
            width: 100%; box-sizing: border-box; padding: 5px 8px;
            border: 1px solid #aaa; border-radius: 4px; font-size: 14px;
            background: #fff;
        }
        .lx-lemma-input:focus { outline: none; border-color: var(--couleur-titre); }
        .lx-lemma-footer { justify-content: space-between !important; }
        .lx-lemma-mo-group {
            display: flex; align-items: center; gap: 2px;
        }
        .lx-lemma-btnmo  { opacity: 0.8; margin: 0 !important; }
        .lx-lemma-btnmo:hover  { opacity: 1; }
        .lx-lemma-btnlemma {
            opacity: 0.35; pointer-events: none; margin: 0 !important;
            color: #2e73d8 !important;
        }
        .lx-lemma-btnlemma--actif { opacity: 1 !important; pointer-events: auto !important; }
        .lx-lemma-btneditmo {
            margin: 0 !important; padding: 0 7px !important;
            font-size: 15px !important; opacity: 0.75;
            min-width: 0 !important;
        }
        .lx-lemma-btneditmo:hover { opacity: 1; }

        /* ---- Modale Gestion Mots Outils ---- */
        .lx-mo-modal {
            min-width: 500px; max-width: 620px; width: 560px;
            max-height: 82vh; display: flex; flex-direction: column;
        }
        .lx-mo-body {
            flex: 1; overflow-y: auto;
            max-height: calc(82vh - 110px);
            gap: 4px !important;
        }
        .lx-mo-section-title {
            font-size: 12px; font-weight: bold; color: var(--couleur-titre);
            padding: 8px 0 5px; border-bottom: 1px solid #e0e0e0; margin-bottom: 6px;
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .lx-mo-list {
            border: 1px solid #ddd; border-radius: 4px;
            max-height: 300px; min-height: 300px;
            overflow-y: auto; background: #fff;
        }
        .lx-mo-list-row {
            display: flex; align-items: center;
            padding: 3px 8px 3px 10px; border-bottom: 1px solid #f0f0f0;
            font-size: 13px;
        }
        .lx-mo-list-row:last-child { border-bottom: none; }
        .lx-mo-list-row:hover { background: #f5f8ff; }
        .lx-mo-list-forme { flex: 1; color: #333; }
        .lx-mo-list-del {
            cursor: pointer; color: #ccc; font-size: 16px; line-height: 1;
            padding: 0 3px; border-radius: 2px; flex-shrink: 0;
        }
        .lx-mo-list-del:hover { color: #c62828; background: #ffe0e0; }
        .lx-mo-vide { font-size: 12px; color: #bbb; font-style: italic; }
        .lx-mo-add-row { display: flex; gap: 6px; align-items: center; }
        .lx-mo-predefined { display: flex; flex-direction: column; gap: 4px; }
        .lx-mo-cat { border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; }
        .lx-mo-cat-head {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 8px; background: #f5f7fa;
            cursor: pointer; user-select: none;
        }
        .lx-mo-cat-head:hover { background: #eaeefc; }
        .lx-mo-cat-toggle { font-size: 9px; color: #aaa; width: 10px; flex-shrink: 0; }
        .lx-mo-cat-name { font-size: 13px; font-weight: 600; color: #333; flex: 1; }
        .lx-mo-cat-badge { font-size: 11px; }
        .lx-mo-cat-btn { font-size: 11px !important; padding: 1px 7px !important; white-space: nowrap; }
        .lx-mo-cat-words { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; background: #fafafa; }
        .lx-mo-word-btn {
            background: #f0f0f0; border: 1px solid #ccc; border-radius: 10px;
            padding: 2px 9px; font-size: 12px; cursor: pointer; color: #444;
            transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        .lx-mo-word-btn:hover { background: #d6e9ff; border-color: #90c0f0; color: #1a4f8a; }
        .lx-mo-word-btn--active { background: #d4edda; border-color: #88c98a; color: #2e7d32; }
        .lx-mo-word-btn--active:hover { background: #ffd6d6; border-color: #f09090; color: #c62828; }

        /* ---- Modale Spontanéité ---- */
        .lx-spont-modal {
            min-width: 760px; max-width: 980px; width: 86vw;
            max-height: 86vh;
        }
        .lx-spont-body {
            gap: 8px !important;
            overflow-y: auto;
            max-height: calc(86vh - 120px);
        }
        .lx-spont-resume {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px;
            border: 1px solid #d8deea;
            border-radius: 4px;
            background: #f7faff;
            font-size: 13px;
        }
        .lx-spont-kpi {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #2d405a;
            line-height: 1.4;
            flex-wrap: wrap;
        }
        .lx-spont-kpi > span { color: #4a607c; }
        .lx-spont-kpi > strong {
            color: #16293f;
            font-size: 14px;
        }
        .lx-spont-kpi--occ > strong {
            font-size: 18px;
            letter-spacing: 0.02em;
        }
        .lx-spont-kpi--bar {
            width: 100%;
        }
        .lx-spont-bar {
            width: 100%;
            height: 28px;
            display: flex;
            overflow: hidden;
            border-radius: 4px;
            border: 1px solid #b9c8df;
            background: #e8eef8;
        }
        .lx-spont-bar-seg {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 12px;
            font-weight: 600;
            padding: 0 8px;
        }
        .lx-spont-bar-seg > span {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .lx-spont-bar-seg--spont {
            background: linear-gradient(90deg, #2f7d4b, #43a36b);
            color: #fff;
        }
        .lx-spont-bar-seg--non {
            background: linear-gradient(90deg, #8a4f20, #bc7430);
            color: #fff;
        }
        .lx-spont-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--couleur-titre);
            font-weight: bold;
            margin-top: 2px;
        }
        .lx-spont-ordre {
            padding: 6px 8px;
            border: 1px solid #d8deea;
            border-radius: 4px;
            background: #fff;
            font-size: 12px;
            color: #39465a;
            line-height: 1.5;
        }
        .lx-spont-details {
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            overflow: auto;
        }
        .lx-spont-entete {
            position: sticky;
            top: 0;
            z-index: 1;
            padding: 4px 10px;
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
            border-top: 1px solid #d0d0d0;
            border-bottom: 1px solid #d0d0d0;
            font-size: 12px;
            font-weight: bold;
            color: var(--couleur-titre);
        }
        .lx-spont-ligne {
            display: flex;
            align-items: baseline;
            gap: 8px;
            padding: 4px 8px;
            border-bottom: 1px solid #f0f0f0;
            font-size: 12px;
        }
        .lx-spont-rg {
            width: 24px;
            color: #888;
            text-align: right;
            flex-shrink: 0;
        }
        .lx-spont-loc {
            width: 140px;
            color: #666;
            flex-shrink: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .lx-spont-ctx {
            display: flex;
            align-items: baseline;
            min-width: 0;
            flex: 1;
        }

        /* ---- Panneau Wordle ---- */
        .lx-wordle-panel {
            flex-shrink: 0;
            height: 220px;
            display: flex;
            flex-direction: column;
            border-top: 2px solid #c0c0c0;
            background: #fff;
        }
        .lx-wordle-handle {
            height: 3px; flex-shrink: 0;
            cursor: ns-resize; user-select: none;
            background:  #f4f4f4; 
            );
        }
        .lx-wordle-handle:hover { background-color: #b0c8ee; }
        .lx-wordle-header {
            display: flex; align-items: center; gap: 8px;
            padding: 3px 10px; flex-shrink: 0; font-size: 13px;
            background: linear-gradient(to top, #e1e1e1c9, var(--couleur-block));
            border-bottom: 1px solid #e0e0e0;
        }
        .lx-wordle-title { color: var(--couleur-titre); font-weight: bold; }
        .lx-wordle-sel {
            font-size: 12px; padding: 1px 4px;
            border: 1px solid #ccc; border-radius: 3px;
        }
        .lx-wordle-close {
            margin-left: auto; cursor: pointer;
            color: #aaa; font-size: 13px; padding: 0 3px; border-radius: 2px;
        }
        .lx-wordle-close:hover { color: #333; background: #ddd; }
        .lx-wordle-canvas { flex: 1; display: block; width: 100%; }
    `;
    document.head.appendChild(s);

    // Events document-level pour le rubber-band (installés une seule fois)
    if (!window._lxDocEventsInstall) {
        window._lxDocEventsInstall = true;
        document.addEventListener('mousemove', _lxRBMouseMove);
        document.addEventListener('mouseup',   _lxRBMouseUp);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && _lxRBActif) {
                _lxRBActif = false;
                document.querySelectorAll('#lx-tbody tr.lx-rb-hover').forEach(tr => tr.classList.remove('lx-rb-hover'));
                if (_lxRBOverlay) { _lxRBOverlay.remove(); _lxRBOverlay = null; }
            }
        });
    }
}

// ============================================================
// MODAL — OCCURRENCES EN CONTEXTE
// ============================================================

function _lxEchapHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Restaure les apostrophes élidées dans le texte tokenisé :
// "c est" → "c'est", "j ai" → "j'ai", "l homme" → "l'homme", etc.
function _lxRestaurerElisions(texte) {
    // JS \b n'est pas fiable avec les lettres accentuées ;
    // on exige ici un token isolé précédé d'un début de chaîne ou d'un espace.
    return texte.replace(/(^|\s)(c|d|j|l|m|n|qu|s|t) (?=\S)/gi, "$1$2\u2019");
}

/**
 * Retourne les N mots avant et après l'entrée `rang` dans tabLexico,
 * en restant dans le même entretien.
 */
function _lxContexteParRang(rang, entretien, Navant, Napres) {
    if (Napres === undefined) Napres = Navant;
    const avant = [];
    for (let i = rang - 1; i >= 0 && avant.length < Navant; i--) {
        if (tabLexico[i].entretien !== entretien) break;
        avant.unshift(tabLexico[i].forme);
    }
    const apres = [];
    for (let i = rang + 1; i < tabLexico.length && apres.length < Napres; i++) {
        if (tabLexico[i].entretien !== entretien) break;
        apres.push(tabLexico[i].forme);
    }
    return { avant: avant.join(' '), apres: apres.join(' ') };
}

/**
 * Ouvre la fenêtre modale globale (dlg/ssdlg) avec toutes les occurrences
 * actives de `forme`, avec leur contexte avant/après.
 */
function _lxOuvrirModalOccurrences(forme, cloudFilterKey = '', cloudTypeFiltre = 'ALL', cloudTri = 'PVAL') {
    // ---- Filtrage des occurrences pour cette forme ----
    // Réutilise la même logique que la table principale pour éviter les écarts de décompte.
    const occurrencesBase = _lxOccurrencesActivesPourForme(forme, {
        inclureQuestions: !lxOptExclureQuestions
    });
    const modalitesIndex = _lxNuageModalitesParEntretien();
    const occurrences = cloudFilterKey
        ? occurrencesBase.filter(item => _lxKwicCategoriesOccurrence(item, modalitesIndex).some(cat => cat.key === cloudFilterKey))
        : occurrencesBase;

    // ---- Construction du contenu HTML ----
    const formeEch = _lxEchapHtml(forme);
    // Stockage pour la vue arbre
    _lxArbreOccs  = occurrences;
    _lxArbreForme = forme;

    const categoriesSpecifiques = _lxNuageCategoriesSpecifiquesKWIC(forme, occurrencesBase, {
        inclureQuestions: !lxOptExclureQuestions
    });
    const filtreCatActif = categoriesSpecifiques.find(cat => cat.key === cloudFilterKey) || null;

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
                    border-bottom:1px solid #d0d0d0; flex-shrink:0;
                    background:linear-gradient(to top,#e1e1e1c9,var(--couleur-block)); border-radius:5px 5px 0 0;">
            <div style="font-weight:bold; font-size:1rem; color:var(--couleur-titre);">
                Occurrences de <em>${formeEch}</em>
                <span style="font-size:0.85rem; font-weight:normal; color:#666; margin-left:10px;">
                    (${occurrences.length} occurrence${occurrences.length > 1 ? 's' : ''}${occurrences.length !== occurrencesBase.length ? ` / ${occurrencesBase.length}` : ''})
                </span>
                ${filtreCatActif ? `<span class="lx-occ-cloud-filter-badge">Filtre : ${_lxEchapHtml(filtreCatActif.label)}</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <button onclick="_lxArbreOuvrir()" title="Afficher l'arborescence de contexte"
                    style="background:none; border:1px solid #bbb; border-radius:4px; padding:3px 9px;
                           cursor:pointer; font-size:0.85rem; color:var(--couleur-titre);
                           display:${occurrences.length > 0 ? 'inline-block' : 'none'}">
                    𖣂 Arbre
                </button>
                <div class="close" onclick="hidedlg()" style="cursor:pointer;">✖️</div>
            </div>
        </div>
        <div style="flex:1; overflow-y:auto; overflow-x:auto; padding:0;">
    `;

    if (occurrences.length === 0) {
        html += `<div style="padding:30px; color:#999; text-align:center; font-style:italic;">
                    Aucune occurrence active pour cette forme.
                 </div>`;
    } else {
        // Tri par rang : préserve l'ordre du corpus (interviews dans l'ordre, puis position dans l'interview)
        const triees = [...occurrences].sort((a, b) => a.rang - b.rang);

        let dernierEntretien = -1;
        let dernierLocuteur  = null;
        triees.forEach(item => {
            // En-tête de groupe à chaque changement d'entretien
            if (item.entretien !== dernierEntretien) {
                dernierEntretien = item.entretien;
                dernierLocuteur  = null;
                const entNomGrp = (tabEnt[item.entretien] && tabEnt[item.entretien].nom)
                    ? _lxEchapHtml(tabEnt[item.entretien].nom)
                    : `Entretien ${item.entretien + 1}`;
                html += `<div class="lx-occ-entete">${entNomGrp}</div>`;
            }

            // Locuteur : affiché uniquement en cas de changement
            const locNom = item.locuteur ? _lxEchapHtml(item.locuteur) : '';
            const showLoc = locNom && locNom !== dernierLocuteur;
            if (showLoc) dernierLocuteur = locNom;

            // Contexte via l'index rang dans tabLexico
            const ctx   = _lxContexteParRang(item.rang, item.entretien, 8, 15);
            const avant = ctx.avant ? _lxEchapHtml(_lxRestaurerElisions(ctx.avant)) : '';
            const apres = ctx.apres ? _lxEchapHtml(_lxRestaurerElisions(ctx.apres)) : '';
            const classesMot = _lxClassesLemmeItem(item);
            const classAttrMot = classesMot ? ' lx-occ-mot ' + classesMot : ' lx-occ-mot';

            html += `
                <div class="lx-occ-ligne">
                    ${showLoc ? `<div class="lx-occ-meta"><span class="lx-occ-loc">${locNom}</span></div>` : ''}
                    <div class="lx-occ-ctx">
                        <span class="lx-occ-avant">${avant ? avant + '\u202f' : ''}</span><strong class="${classAttrMot.trim()}">${_lxEchapHtml(item.forme)}</strong><span class="lx-occ-apres">${apres ? '\u202f' + apres : ''}</span>
                    </div>
                </div>
            `;
        });
    }
    html += `</div>`;
    html += _lxNuageCategoriesHTML(forme, categoriesSpecifiques);

    // ---- Affichage dans la modale globale ----
    const dlg   = document.getElementById('dlg');
    const ssdlg = document.getElementById('ssdlg');
    if (!dlg || !ssdlg) return;

    ssdlg.style.top         = '5%';
    ssdlg.style.width       = '70%';
    ssdlg.style.marginLeft  = '15%';
    ssdlg.style.maxHeight   = '85vh';
    ssdlg.style.overflowY   = 'auto';
    ssdlg.style.display     = 'flex';
    ssdlg.style.flexDirection = 'column';
    ssdlg.style.padding     = '0';

    ssdlg.innerHTML = html;
    _lxKwicCloudInitialiser(forme, categoriesSpecifiques, occurrencesBase, modalitesIndex, cloudFilterKey, cloudTypeFiltre, cloudTri);
    dlg.style.display = 'block';
}

// ============================================================
// ARBRE DE CONTEXTE — KWIC par nœuds (transcription de Lexico2.bas)
// ============================================================

// Variables d'état pour la vue arbre (partagées entre fonctions)
var _lxArbreOccs       = [];   // occurrences filtrées courantes
var _lxArbreForme      = '';   // forme cible courante
var _lxArbreNodesAvant = [];   // trie côté gauche
var _lxArbreNodesApres = [];   // trie côté droit
var _lxArbreAvantSeqs  = [];   // séquences avant par occurrence (closest-first)
var _lxArbreApresSeqs  = [];   // séquences après par occurrence (closest-first)
var _LX_RMAX = 5;              // profondeur des tries (modifiable via la combo)
var _lxArbreZoom = 1;          // facteur vertical du layout (1 = normal, <1 = compressé)
// Variables d'état pour le pan (glisser-déplacer) du graphe
var _lxPanDragging = false;
var _lxPanStartX = 0, _lxPanStartY = 0;
var _lxPanTx = 0, _lxPanTy = 0;

function _lxArbreDefinirZoom(valeur) {
    const zoom = Math.max(0.1, Math.min(1, Number(valeur) || 1));
    if (Math.abs(zoom - _lxArbreZoom) < 0.001) return;
    _lxArbreZoom = zoom;
    _lxArbreOuvrir();
}

function _lxArbreMaxNb(nodes) {
    let max = 1;
    for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].nb > max) max = nodes[i].nb;
    }
    return max;
}

function _lxArbreStrokeWidth(nb, maxNb) {
    if (maxNb <= 1) return 2;
    const ratio = Math.max(0, Math.min(1, nb / maxNb));
    return 1 + Math.sqrt(ratio) * 17;
}

function _lxPanStart(e) {
    _lxPanDragging = true;
    _lxPanStartX = e.clientX - _lxPanTx;
    _lxPanStartY = e.clientY - _lxPanTy;
    const svg = document.getElementById('lx-arbre-svg');
    if (svg) svg.style.cursor = 'grabbing';
    e.preventDefault();
}
function _lxPanMove(e) {
    if (!_lxPanDragging) return;
    _lxPanTx = e.clientX - _lxPanStartX;
    _lxPanTy = e.clientY - _lxPanStartY;
    const g = document.getElementById('lx-arbre-pan');
    if (g) g.setAttribute('transform', `translate(${_lxPanTx},${_lxPanTy})`);
}
function _lxPanEnd() {
    if (!_lxPanDragging) return;
    _lxPanDragging = false;
    const svg = document.getElementById('lx-arbre-svg');
    if (svg) svg.style.cursor = 'grab';
}

/**
 * Construit un trie à partir d'une liste de séquences de mots.
 * seqList[i] est un array de mots, le mot d'index 0 est le plus proche de la cible (rang 0).
 * Retourne un tableau plat de nœuds : nodes[0] = racine implicite.
 */
function _lxTrieBuild(seqList) {
    const nodes = [{ id: 0, mot: '', rang: -1, parentId: null, nb: 0, nbpass: 0, children: [] }];

    for (const seq of seqList) {
        let cur = 0; // id nœud courant (commence à la racine)
        for (let r = 0; r < Math.min(seq.length, _LX_RMAX); r++) {
            const mot = seq[r];
            if (!mot) break;
            // Cherche un enfant existant avec le même mot
            let childId = nodes[cur].children.find(cid => nodes[cid].mot === mot);
            if (childId === undefined) {
                childId = nodes.length;
                nodes.push({ id: childId, mot, rang: r, parentId: cur, nb: 0, nbpass: 0, children: [] });
                nodes[cur].children.push(childId);
            }
            nodes[childId].nb++;
            cur = childId;
        }
    }
    return nodes;
}

/**
 * Trie récursivement les enfants de chaque nœud par nb décroissant,
 * afin que les branches les plus fréquentes apparaissent en haut.
 */
function _lxTrieSortByNb(nodes) {
    for (const n of nodes) {
        if (n.children.length > 1)
            n.children.sort((a, b) => nodes[b].nb - nodes[a].nb);
    }
}

/**
 * Calcule le nombre de feuilles (rang = _LX_RMAX-1, ou nœuds terminaux) dans le sous-arbre de id.
 * Équivalent de DescFinal() en VB6.
 */
function _lxDescFinal(id, nodes) {
    const n = nodes[id];
    if (n.children.length === 0) return 1;
    let sum = 0;
    for (const cid of n.children) sum += _lxDescFinal(cid, nodes);
    return sum;
}

/**
 * Assigne xPos et yPos à chaque nœud du trie pour le rendu SVG.
 * Utilise un parcours DFS suivant l'ordre des enfants (déjà triés par nb décroissant)
 * pour garantir : pas de croisement de lignes, nœuds importants en haut.
 * sens = 'avant' ou 'apres'.
 */
function _lxTrieLayout(nodes, sens, svgW, svgH) {
    const centerX = svgW / 2;
    const colW    = (svgW / 2) / (_LX_RMAX + 1);
    const totalLeaves = _lxDescFinal(0, nodes);
    const Hlig = totalLeaves > 0 ? Math.max(4, ((svgH - 30) / totalLeaves) * _lxArbreZoom) : svgH;

    // DFS pour calculer l'index de la première feuille de chaque nœud
    const firstLeaf = new Array(nodes.length).fill(0);
    let leafCounter = 0;
    function dfs(id) {
        firstLeaf[id] = leafCounter;
        if (nodes[id].children.length === 0) {
            leafCounter++;
        } else {
            for (const cid of nodes[id].children) dfs(cid);
        }
    }
    dfs(0);

    for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        n.xPos = sens === 'avant'
            ? centerX - (n.rang + 1) * colW
            : centerX + (n.rang + 1) * colW;
        const nLeaves = _lxDescFinal(i, nodes);
        n.yPos = firstLeaf[i] * Hlig + nLeaves * Hlig / 2 + 15;
    }

    if (nodes.length > 1) {
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 1; i < nodes.length; i++) {
            if (nodes[i].yPos < minY) minY = nodes[i].yPos;
            if (nodes[i].yPos > maxY) maxY = nodes[i].yPos;
        }
        const deltaY = svgH / 2 - (minY + maxY) / 2;
        for (let i = 1; i < nodes.length; i++) {
            nodes[i].yPos += deltaY;
        }
    }
    nodes[0].xPos = centerX;
    nodes[0].yPos = svgH / 2;
}

/**
 * Reconstruit la chaîne (closest-first) depuis nodeId jusqu'aux enfants de la racine.
 * Retourne un array de mots [mot_rang0, mot_rang1, ...].
 */
function _lxArbreChaine(nodeId, nodes) {
    const chain = [];
    let cur = nodeId;
    while (cur > 0) {
        chain.push(nodes[cur].mot);
        cur = nodes[cur].parentId;
    }
    return chain; // chain[0] = nœud cliqué, chain[chain.length-1] = fils de racine (rang 0)
                  // l'ordre est donc : rang_cliqué, rang_cliqué-1, ..., rang_0
    // NB : pour le matching, on inverse pour avoir closest-first = [rang0, rang1, ... rang_cliqué]
}

/**
 * Rendu SVG d'un seul trie (avant ou après).
 * Retourne des éléments SVG (<line> et <g>) sous forme de chaîne.
 */
function _lxArbreSVGSide(nodes, sens) {
    let svg = '';
    const maxNb = _lxArbreMaxNb(nodes);
    // Lignes parent → enfant (y compris depuis la racine/centre vers les nœuds rang 0)
    for (let i = 1; i < nodes.length; i++) {
        const n  = nodes[i];
        const p  = nodes[n.parentId];
        const sw  = _lxArbreStrokeWidth(n.nb, maxNb);
        const col = n.nbpass > 0 ? '#2962ff' : `rgb(${230},${230},${230})`;
        const midX = ((p.xPos + n.xPos) / 2).toFixed(1);
        const d = `M ${p.xPos.toFixed(1)},${p.yPos.toFixed(1)} C ${midX},${p.yPos.toFixed(1)} ${midX},${n.yPos.toFixed(1)} ${n.xPos.toFixed(1)},${n.yPos.toFixed(1)}`;
        svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}"
                      data-nid="${i}" data-sens="${sens}" class="lx-arbre-line"/>`;
    }
    // Nœuds rang 0 : connecter à la ligne centrale (position fictive centre)
    // Labels des nœuds
    for (let i = 1; i < nodes.length; i++) {
        const n   = nodes[i];
        const col = n.nbpass > 0 ? '#2962ff' : (n.nb < 2 ? '#aaa' : 'rgb(${230},${230},${230}');
        const fw  = n.nbpass > 0 ? 'bold' : 'normal';
        const fs  = Math.max(9, 13 - n.rang);
        svg += `<g class="lx-arbre-noeud" data-nid="${i}" data-sens="${sens}"
                   onclick="_lxChercheChemin(${i},'${sens}')"
                   style="cursor:pointer">
                  <title>${_lxEchapHtml(n.mot)} (${n.nb})</title>
                  <text x="${n.xPos.toFixed(1)}" y="${n.yPos.toFixed(1)}"
                        text-anchor="${sens === 'avant' ? 'end' : 'start'}"
                        font-size="${fs}" font-weight="${fw}" fill="${col}"
                        font-family="sans-serif">${_lxEchapHtml(n.mot)}</text>
                </g>`;
    }
    return svg;
}

/**
 * Construit et retourne le HTML complet de la vue arbre (SVG + zone de concordances).
 */

/**
 * Sérialise le SVG arbre (pan remis à 0) et retourne { svgStr, w, h }.
 */
function _lxArbreSVGData() {
    const svg = document.getElementById('lx-arbre-svg');
    const pan = document.getElementById('lx-arbre-pan');
    if (!svg) return null;
    const saved = pan ? pan.getAttribute('transform') : null;
    if (pan) pan.setAttribute('transform', 'translate(0,0)');
    const svgStr = new XMLSerializer().serializeToString(svg);
    if (pan && saved) pan.setAttribute('transform', saved);
    return { svgStr, w: svg.width.baseVal.value, h: svg.height.baseVal.value };
}

/** Dessine le SVG sur un canvas off-screen et appelle cb(canvas). */
function _lxArbreVersCanvas(cb) {
    const data = _lxArbreSVGData();
    if (!data) return;
    const blob = new Blob([data.svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = data.w; canvas.height = data.h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, data.w, data.h);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        cb(canvas);
    };
    img.src = url;
}

/** Copie le graphe arbre dans le presse-papiers (PNG). */
function _lxArbreCopier() {
    _lxArbreVersCanvas(canvas => {
        canvas.toBlob(blob => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                .then(() => question('Graphe copie dans le presse-papiers !', ['OK']))
                .catch(e => question('Copie impossible : ' + e.message, ['OK']));
        }, 'image/png');
    });
}

 
/** Enregistre le graphe arbre en PNG. */
function _lxArbreEnregistrer() {
    _lxArbreVersCanvas(canvas => {
        canvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'arbre_' + _lxArbreForme + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 'image/png');
    });
}

function _lxArbreHTML(forme) {
    const formeEch = _lxEchapHtml(forme);
    const W = 800, H = Math.max(200, _lxArbreOccs.length * 18 + 40);

    // Layout des deux tries
    _lxTrieLayout(_lxArbreNodesAvant, 'avant', W, H);
    _lxTrieLayout(_lxArbreNodesApres, 'apres',  W, H);

    const svgAvant = _lxArbreSVGSide(_lxArbreNodesAvant, 'avant');
    const svgApres = _lxArbreSVGSide(_lxArbreNodesApres, 'apres');

    // Largeur approx. de l'étiquette centrale pour le fond blanc
    const labelW = forme.length * 8 + 20;

    return `
    <!-- En-tête arbre -->
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
                border-bottom:1px solid #d0d0d0; flex-shrink:0;
                background:linear-gradient(to top,#e1e1e1c9,var(--couleur-block)); border-radius:5px 5px 0 0;">
        <div style="font-weight:bold; font-size:1rem; color:var(--couleur-titre);">
            Arbre de contexte — <em>${formeEch}</em>
            <span style="font-size:0.8rem; font-weight:normal; color:#666; margin-left:8px;">
                (${_lxArbreOccs.length} occ., profondeur ${_LX_RMAX})
            </span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
            <label style="font-size:0.8rem; color:#666; white-space:nowrap; display:flex; align-items:center; gap:4px;">
                Zoom :
                <input type="range" min="0.1" max="1" step="0.1" value="${_lxArbreZoom}"
                       oninput="_lxArbreDefinirZoom(this.value)"
                       style="width:80px; vertical-align:middle;">
                <span style="min-width:2.8em; text-align:right; color:#444;">${_lxArbreZoom.toFixed(1)}×</span>
            </label>
            <label style="font-size:0.8rem; color:#666; white-space:nowrap;">Profondeur :
                <select onchange="_LX_RMAX=Number(this.value); _lxArbreOuvrir()"
                        style="font-size:0.8rem; border:1px solid #bbb; border-radius:3px; padding:1px 4px; margin-left:3px;">
                    ${[2,3,4,5,6,7,8].map(v => `<option value="${v}"${v === _LX_RMAX ? ' selected' : ''}>${v}</option>`).join('')}
                </select>
            </label>
            <button onclick="_lxArbreCopier()" title="Copier le graphe (PNG)"
                style="background:none; border:1px solid #bbb; border-radius:4px;
                       padding:3px 9px; cursor:pointer; font-size:0.85rem; color:var(--couleur-titre);">📋</button>
            <button onclick="_lxArbreEnregistrer()" title="Enregistrer le graphe (PNG)"
                style="background:none; border:1px solid #bbb; border-radius:4px;
                       padding:3px 9px; cursor:pointer; font-size:0.85rem; color:var(--couleur-titre);">💾</button>
            <button onclick="_lxArbreRetourListe()" title="Retour à la liste"
                style="background:none; border:1px solid #bbb; border-radius:4px;
                       padding:3px 9px; cursor:pointer; font-size:0.85rem; color:var(--couleur-titre);">← Liste</button>
            <div class="close" onclick="hidedlg()" style="cursor:pointer;">✖️</div>
        </div>
    </div>
    <!-- SVG arbre — déplaçable par glisser-déposer -->
    <div id="lx-arbre-cadre" style="flex:1; overflow:hidden; min-height:0; position:relative; background:#fafafa; border-bottom:1px solid #e0e0e0;">
      <div style="position:absolute; top:4px; right:8px; font-size:0.72rem; color:#bbb; pointer-events:none; z-index:1;">✥ déplacer</div>
      <svg id="lx-arbre-svg" width="${W}" height="${H}"
           style="display:block; margin:0 auto; cursor:grab; user-select:none;"
           onmousedown="_lxPanStart(event)">
        <g id="lx-arbre-pan" transform="translate(0,0)">
          <!-- Ligne centrale (mot cible) -->
          <line x1="${W/2}" y1="0" x2="${W/2}" y2="${H}"
                stroke="#e0e0e0" stroke-width="1" stroke-dasharray="4,4"/>
          ${svgAvant}
          ${svgApres}
          <!-- Mot cible rendu EN DERNIER pour rester au-dessus des lignes -->
          <rect x="${W/2 - labelW/2}" y="${H/2 - 13}" width="${labelW}" height="18"
                fill="white" rx="3" opacity="0.92"/>
          <text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="13"
                font-weight="bold" fill="#1a237e" font-family="sans-serif">${formeEch}</text>
        </g>
      </svg>
    </div>
    <!-- Zone de concordances filtrées par clic -->
    <div id="lx-arbre-ctx" style="flex:0 0 auto; max-height:30vh; overflow-y:auto; padding:8px 14px;
              font-size:0.85rem; color:#555; font-style:italic;">
        Cliquez sur un nœud pour afficher les concordances correspondantes.
    </div>`;
}

/**
 * Ouvre la vue arbre dans la modale existante (remplace le contenu de ssdlg).
 * Appelée par le bouton "🌿 Arbre" dans l'en-tête de la modale d'occurrences.
 */
function _lxArbreOuvrir() {
    const forme = _lxArbreForme;
    const occs  = _lxArbreOccs;
    if (!occs || occs.length === 0) return;

    // Construit les séquences avant/après et les trie ensemble pour conserver
    // la correspondance entre les index : occs[i] ↔ avantSeqs[i] ↔ apresSeqs[i]
    const _combined = [];
    for (const item of occs) {
        const ctx = _lxContexteParRang(item.rang, item.entretien, _LX_RMAX, _LX_RMAX);
        const avt = ctx.avant ? ctx.avant.split(' ').filter(Boolean).reverse() : [];
        const apr = ctx.apres ? ctx.apres.split(' ').filter(Boolean) : [];
        _combined.push({ item, avt, apr });
    }
    // Tri alphabétique par contexte gauche (comme le VB6), les trois tableaux restent synchronisés
    _combined.sort((a, b) => a.avt.join(' ').localeCompare(b.avt.join(' ')));
    _lxArbreAvantSeqs = _combined.map(e => e.avt);
    _lxArbreApresSeqs = _combined.map(e => e.apr);
    _lxArbreOccs      = _combined.map(e => e.item);

    // Construit les tries et trie les enfants par importance décroissante
    _lxArbreNodesAvant = _lxTrieBuild(_lxArbreAvantSeqs);
    _lxArbreNodesApres = _lxTrieBuild(_lxArbreApresSeqs);
    _lxTrieSortByNb(_lxArbreNodesAvant);
    _lxTrieSortByNb(_lxArbreNodesApres);

    // Injecte dans la modale
    const ssdlg = document.getElementById('ssdlg');
    if (!ssdlg) return;
    ssdlg.style.overflowY = 'hidden';
    ssdlg.innerHTML = _lxArbreHTML(forme);

    // Initialise le pan : centre verticalement le graphe dans le cadre
    _lxPanDragging = false;
    _lxPanTx = 0;
    _lxPanTy = 0;
    requestAnimationFrame(() => {
        const cadre = document.getElementById('lx-arbre-cadre');
        const svg   = document.getElementById('lx-arbre-svg');
        const pan   = document.getElementById('lx-arbre-pan');
        if (cadre && svg && pan) {
            const svgH = parseInt(svg.getAttribute('height'));
            _lxPanTy = Math.round((cadre.clientHeight - svgH) / 2);
            pan.setAttribute('transform', `translate(0,${_lxPanTy})`);
        }
    });
    document.addEventListener('mousemove', _lxPanMove);
    document.addEventListener('mouseup',   _lxPanEnd);
}

/**
 * Retour à la liste d'occurrences depuis la vue arbre.
 */
function _lxArbreRetourListe() {
    document.removeEventListener('mousemove', _lxPanMove);
    document.removeEventListener('mouseup',   _lxPanEnd);
    _lxOuvrirModalOccurrences(_lxArbreForme);
}

/**
 * Met à jour les attributs visuels du SVG après modification de nbpass.
 */
function _lxArbreRedessiner() {
    const svg = document.getElementById('lx-arbre-svg');
    if (!svg) return;

    // Lignes
    svg.querySelectorAll('path.lx-arbre-line').forEach(el => {
        const nid  = Number(el.dataset.nid);
        const sens = el.dataset.sens;
        const nodes = sens === 'avant' ? _lxArbreNodesAvant : _lxArbreNodesApres;
        const n    = nodes[nid];
        if (!n) return;
        const sw  = _lxArbreStrokeWidth(n.nb, _lxArbreMaxNb(nodes));
        el.setAttribute('stroke-width', n.nbpass > 0 ? Math.min(20, sw + 1) : sw);
        el.setAttribute('stroke', n.nbpass > 0 ? '#2962ff' : `rgb(${180 - n.rang * 15},${180 - n.rang * 15},${180 - n.rang * 15})`);
    });

    // Labels
    svg.querySelectorAll('g.lx-arbre-noeud').forEach(el => {
        const nid  = Number(el.dataset.nid);
        const sens = el.dataset.sens;
        const nodes = sens === 'avant' ? _lxArbreNodesAvant : _lxArbreNodesApres;
        const n    = nodes[nid];
        if (!n) return;
        const txt = el.querySelector('text');
        if (!txt) return;
        txt.setAttribute('fill',        n.nbpass > 0 ? '#2962ff' : (n.nb < 2 ? '#aaa' : '#333'));
        txt.setAttribute('font-weight', n.nbpass > 0 ? 'bold' : 'normal');
    });
}

/**
 * Équivalent de ChercheChemin() en VB6.
 * Appelée au clic sur un nœud SVG.
 * nodeId : index dans le trie ; sens : 'avant' ou 'apres'.
 */
function _lxChercheChemin(nodeId, sens) {
    // Réinitialise nbpass sur tous les nœuds des deux tries
    for (const n of _lxArbreNodesAvant) n.nbpass = 0;
    for (const n of _lxArbreNodesApres) n.nbpass = 0;

    const nodesClique = sens === 'avant' ? _lxArbreNodesAvant : _lxArbreNodesApres;
    const n = nodesClique[nodeId];
    if (!n) return;

    // Reconstruit la chaîne depuis le nœud cliqué jusqu'à la racine (closest-first)
    // _lxArbreChaine renvoie [mot_rang_cliqué, ..., mot_rang_0]
    const chaineBrute = _lxArbreChaine(nodeId, nodesClique);
    // On inverse pour obtenir closest-first = [rang0, rang1, ..., rang_cliqué]
    const chaine = chaineBrute.slice().reverse();
    const depth  = chaine.length;

    // Concordances matchées (index dans _lxArbreOccs)
    const matchesIdx = [];

    if (sens === 'avant') {
        // Matching : les `depth` premiers éléments de avantSeqs[i] (closest-first) == chaine
        for (let i = 0; i < _lxArbreAvantSeqs.length; i++) {
            const seq = _lxArbreAvantSeqs[i];
            if (seq.length < depth) continue;
            if (seq.slice(0, depth).join(' ') === chaine.join(' ')) {
                matchesIdx.push(i);
                // Incrémente nbpass sur le chemin correspondant dans l'arbre avant
                _lxArbreMarquerChemin(nodeId, _lxArbreNodesAvant);
                // Trouve et marque le chemin correspondant dans l'arbre après
                _lxArbreMarquerCheminSeq(_lxArbreApresSeqs[i], _lxArbreNodesApres);
            }
        }
    } else {
        // Matching : les `depth` premiers éléments de apresSeqs[i] (closest-first) == chaine
        for (let i = 0; i < _lxArbreApresSeqs.length; i++) {
            const seq = _lxArbreApresSeqs[i];
            if (seq.length < depth) continue;
            if (seq.slice(0, depth).join(' ') === chaine.join(' ')) {
                matchesIdx.push(i);
                _lxArbreMarquerChemin(nodeId, _lxArbreNodesApres);
                _lxArbreMarquerCheminSeq(_lxArbreAvantSeqs[i], _lxArbreNodesAvant);
            }
        }
    }

    // Met à jour le SVG
    _lxArbreRedessiner();

    // Étiquette en ordre naturel du texte :
    //   avant → chaineBrute = [mot_cliqué_farthest, ..., mot_rang0_closest] = ordre texte
    //   après → chaine      = [mot_rang0_closest, ..., mot_cliqué_farthest]  = ordre texte
    const label = sens === 'avant' ? chaineBrute.join(' ') : chaine.join(' ');
    _lxArbreAfficherConcordances(matchesIdx, label, sens);
}

/**
 * Marque le chemin de nodeId jusqu'à la racine en incrémentant nbpass.
 */
function _lxArbreMarquerChemin(nodeId, nodes) {
    let cur = nodeId;
    while (cur > 0) {
        nodes[cur].nbpass++;
        cur = nodes[cur].parentId;
    }
}

/**
 * Trouve le chemin correspondant à une séquence de mots dans un trie et marque nbpass.
 * seq = [mot_rang0, mot_rang1, ...] (closest-first).
 */
function _lxArbreMarquerCheminSeq(seq, nodes) {
    let cur = 0; // racine
    for (let r = 0; r < Math.min(seq.length, _LX_RMAX); r++) {
        const mot    = seq[r];
        const childId = nodes[cur].children.find(cid => nodes[cid].mot === mot);
        if (childId === undefined) break;
        nodes[childId].nbpass++;
        cur = childId;
    }
}

/**
 * Affiche les lignes de concordance correspondant aux occurrences matchées.
 */
function _lxArbreAfficherConcordances(matchesIdx, chaineLabel, sens) {
    const zone = document.getElementById('lx-arbre-ctx');
    if (!zone) return;

    if (matchesIdx.length === 0) {
        zone.innerHTML = '<em style="color:#999">Aucune concordance pour ce nœud.</em>';
        return;
    }

    const formeEch = _lxEchapHtml(_lxArbreForme);
    const dir      = sens === 'avant' ? '←' : '→';
    let html = `<div style="margin-bottom:6px; color:#333; font-style:normal; font-weight:bold;">
                    ${dir} <em>${_lxEchapHtml(chaineLabel)}</em>
                    <span style="font-weight:normal; color:#666; font-size:0.85em;"> — ${matchesIdx.length} concordance${matchesIdx.length > 1 ? 's' : ''}</span>
                </div>`;

    for (const idx of matchesIdx) {
        const item  = _lxArbreOccs[idx];
        const ctx   = _lxContexteParRang(item.rang, item.entretien, 8, 15);
        const avant = ctx.avant ? _lxEchapHtml(_lxRestaurerElisions(ctx.avant)) : '';
        const apres = ctx.apres ? _lxEchapHtml(_lxRestaurerElisions(ctx.apres)) : '';
        const classesMot = _lxClassesLemmeItem(item);
        const classAttrMot = classesMot ? 'lx-occ-mot ' + classesMot : 'lx-occ-mot';
        html += `<div style="padding:2px 0; line-height:1.5;">
                    <span style="color:#888;">${avant ? avant + '\u202f' : ''}</span><strong class="${classAttrMot}" style="padding:0 2px;">${_lxEchapHtml(item.forme)}</strong><span style="color:#888;">${apres ? '\u202f' + apres : ''}</span>
                 </div>`;
    }

    zone.innerHTML = html;
}

 