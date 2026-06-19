////////////////////////////////////////////////////////////////////////
// SCAN DU CORPUS (analyse de présence des entités dans tous les entretiens)
//
// Extrait de tableau_global.js (refacto Tâche 3) sans changement de comportement.
// Regroupe :
//   - reconstituerTabAnonGlobal : inventaire des règles présentes dans tabEnt → tabAnon global ;
//   - lancerScanCorpus          : scan « passe unique » (index inversé + parse une fois par entretien) ;
//   - appliquerResultatsScan    : projection des stats du scan sur les lignes de la table ;
//   - mettreAJourCacheEntite    : rafraîchissement ciblé du cache pour une seule entité.
//
// Toutes reçoivent leurs données par paramètre (tabEnt, anonValides, lignes, compteur) et ne
// dépendent que de anon-detection.js (construireIndexInverse, entretiensCandidats,
// trouverOccurrencesDansDoc), de persisterReglesCorpus (gestion_corpus.js), des globaux runtime
// (window._anonIndexInverse / _anonScanCache / _anonScanStale) et des utilitaires d'UI
// (wait/endWait/updateProgressBar). Aucun appel vers une fonction propre à tableau_global.js.
//
// Chargé UNIQUEMENT dans index.html (panneau Pseudos du corpus), après anon-detection.js.
////////////////////////////////////////////////////////////////////////

/**
 * Reconstitue le tabAnon global à partir des entretiens
 * - Inventorie tous les tabAnon présents dans tabEnt
 * @param {Array} entretiens - Tableau des entretiens (tabEnt)
 */
async function reconstituerTabAnonGlobal(entretiens) {
    console.log("Reconstitution du tabAnon global à partir des entretiens...");

    if (!entretiens || entretiens.length === 0) {
        console.log("❌ Aucun entretien fourni");
        return;
    }

    // Inventaire des règles, « corpus AUTORITAIRE » : l'ancien global EN PREMIER (son pseudo
    // gagne pour une entité déjà connue), PUIS les entretiens (qui ne peuvent qu'AJOUTER des
    // entités nouvelles). fusionnerRegles déduplique sur l'ENTITÉ seule → une entité = un pseudo.
    const ancienTabAnon = await window.electronAPI.getAnon() || [];
    const listesEntretiens = entretiens.map(ent => (ent && ent.tabAnon) ? ent.tabAnon : []);

    // Signaler (sans le perdre en silence) ce que la fusion tranche : entités auxquelles le
    // corpus et/ou des entretiens donnent des pseudos différents. Le 1er (= corpus) est retenu.
    const conflits = conflitsPseudoParEntite(ancienTabAnon, ...listesEntretiens);

    const newTabAnon = fusionnerRegles(ancienTabAnon, ...listesEntretiens);

    // tri du tabAnon par ordre alphabétique des entités
    newTabAnon.sort((a, b) => a.entite.localeCompare(b.entite));

    console.log(`✅ TabAnon reconstitué : ${newTabAnon.length} paire(s) unique(s)`, newTabAnon);

    if (conflits.length > 0) {
        console.warn(`⚠️ ${conflits.length} entité(s) avec des pseudos divergents (le pseudo du corpus est conservé) :`, conflits);
    }

    // Mettre à jour dans le main process (règles propres uniquement)
    await persisterReglesCorpus(newTabAnon);

    // On RENVOIE les conflits (sans afficher de dialogue ici) : la signalisation est faite par
    // l'appelant qui correspond à une action délibérée (ouverture de l'onglet Pseudos, scan),
    // pas à chaque ouverture du corpus. cf. signalerConflitsPseudo.
    return conflits;
}

/**
 * Affiche (dialogue) un récapitulatif des conflits de pseudo détectés par reconstituerTabAnonGlobal.
 * Appelé depuis l'ouverture du panneau Pseudos (affichAnonGen) — action délibérée de l'utilisateur.
 * @param {Array<{entite:string, pseudoRetenu:string, pseudosIgnores:string[]}>} conflits
 */
function signalerConflitsPseudo(conflits) {
    if (!conflits || conflits.length === 0) return;
    const apercu = conflits.slice(0, 8)
        .map(c => `• « ${c.entite} » → « ${c.pseudoRetenu} » (ignoré${c.pseudosIgnores.length > 1 ? 's' : ''} : ${c.pseudosIgnores.map(p => `« ${p} »`).join(', ')})`)
        .join('\n');
    const reste = conflits.length > 8 ? `\n… et ${conflits.length - 8} autre(s).` : '';
    dialog('Message',
        `⚠️ Pseudos en conflit\n\n` +
        `${conflits.length} entité(s) ont des pseudonymes différents selon le corpus / les entretiens.\n` +
        `Règle appliquée : une entité = un seul pseudo, celui du corpus est conservé.\n\n` +
        apercu + reste);
}

/**
 * Level 2 — Met à jour le cache de scan pour une seule entité,
 * sans marquer le cache comme stale (action depuis le panneau Corpus).
 * Met aussi à jour les badges et la couleur de la ligne dans le DOM.
 * Ne fait rien si le cache n'existe pas ou est déjà stale.
 */
async function mettreAJourCacheEntite(entite, pseudo) {
    if (!window._anonScanCache || window._anonScanStale) return;
    if (!window._anonIndexInverse) return;

    const key = `${entite.trim()}|${pseudo.trim()}`;
    const st = { nbAnon: 0, nbExc: 0, nbNon: 0, nbEntretiens: 0 };

    const candidats = entretiensCandidats(entite, window._anonIndexInverse);
    for (const i of candidats) {
        let html = null;
        try { html = await window.electronAPI.getHtml(i); } catch (e) { continue; }
        if (!html) continue;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const occ = trouverOccurrencesDansDoc(tempDiv, entite.trim(), pseudo.trim());
        if (occ.length === 0) continue;

        st.nbAnon += occ.filter(o => o.applique && !o.exclue).length;
        st.nbExc  += occ.filter(o => o.exclue).length;
        st.nbNon  += occ.filter(o => !o.applique && !o.exclue).length;
        st.nbEntretiens += 1;
    }

    window._anonScanCache.set(key, st);

    // Mise à jour DOM : badges + couleur de ligne
    const tr = document.querySelector(`tr[data-entite="${CSS.escape(entite)}"][data-pseudo="${CSS.escape(pseudo)}"]`);
    if (!tr) return;
    const tdEtat = tr.querySelector('.td-etat-corpus');
    if (tdEtat) {
        tdEtat.style.display = ''; // toujours rendre visible si un scan est valide
        let badgesHtml = '';
        if (st.nbAnon > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-anon" title="${st.nbAnon} occurrence(s) anonymisée(s)">${st.nbAnon}</span> `;
        if (st.nbExc  > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-exc"  title="${st.nbExc} exception(s)">${st.nbExc}</span> `;
        if (st.nbNon  > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-non"  title="${st.nbNon} occurrence(s) non traitée(s)">${st.nbNon}</span>`;
        tdEtat.innerHTML = badgesHtml || '<span style="color:#bbb;font-size:0.8rem;">—</span>';
    }
    if (st.nbNon > 0) {
        tr.style.backgroundColor = '#fff3e0';
    } else if ((st.nbAnon + st.nbExc) > 0) {
        tr.style.backgroundColor = '#e8f5e9';
    } else {
        tr.style.backgroundColor = '';
    }
}

/**
 * Lance le scan du corpus avec index inversé.
 * Construit window._anonIndexInverse (une fois), calcule les stats par entité,
 * stocke dans window._anonScanCache, puis déclenche l'affichage (étape 3).
 */
async function lancerScanCorpus(tabEnt, anonValides, lignes, compteur, silencieux = false) {
    // silencieux = true : pas d'overlay bloquant (auto-scan en arrière-plan à l'ouverture).
    if (!silencieux && typeof wait === 'function') wait('Analyse du corpus en cours…');
    try {
        // 1. Construire l'index inversé (ou le réutiliser s'il est déjà en mémoire)
        if (!window._anonIndexInverse) {
            window._anonIndexInverse = await construireIndexInverse(tabEnt);
        }
        const index = window._anonIndexInverse;

        // 2. Calculer les stats — PASSE UNIQUE.
        //    Au lieu de re-parser le HTML d'un entretien une fois par entité candidate
        //    (coûteux : N parses × M entités), on construit d'abord la liste des entités
        //    candidates PAR entretien (via l'index inversé), puis on parse chaque
        //    entretien UNE SEULE FOIS et on teste toutes ses entités candidates d'affilée.
        const stats = new Map();
        const entretienVersEntites = new Map(); // idxEnt -> [anon, ...]
        for (const a of anonValides) {
            stats.set(`${a.entite.trim()}|${a.remplacement.trim()}`,
                      { nbAnon: 0, nbExc: 0, nbNon: 0, nbEntretiens: 0 });
            for (const i of entretiensCandidats(a.entite, index)) {
                if (!entretienVersEntites.has(i)) entretienVersEntites.set(i, []);
                entretienVersEntites.get(i).push(a);
            }
        }

        const indices = [...entretienVersEntites.keys()];
        for (let k = 0; k < indices.length; k++) {
            const i = indices[k];
            let html = null;
            try { html = await window.electronAPI.getHtml(i); } catch (e) { continue; }
            if (!html) continue;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html; // un seul parse, réutilisé pour toutes les entités de cet entretien

            for (const a of entretienVersEntites.get(i)) {
                const occ = trouverOccurrencesDansDoc(tempDiv, a.entite.trim(), a.remplacement.trim());
                if (occ.length === 0) continue;

                const st = stats.get(`${a.entite.trim()}|${a.remplacement.trim()}`);
                if (!st) continue;
                st.nbAnon += occ.filter(o => o.applique && !o.exclue).length;
                st.nbExc  += occ.filter(o => o.exclue).length;
                st.nbNon  += occ.filter(o => !o.applique && !o.exclue).length;
                st.nbEntretiens += 1;
            }

            if (typeof updateProgressBar === 'function') {
                updateProgressBar(Math.round(((k + 1) / indices.length) * 100));
            }
            if (k % 5 === 4) await new Promise(r => setTimeout(r, 0)); // laisser respirer l'UI
        }

        // 3. Stocker le cache et marquer comme valide
        window._anonScanCache = stats;
        window._anonScanStale = false;

        // 4. Mettre à jour l'affichage : colonne + coloration + filtres d'état
        appliquerResultatsScan(stats, lignes);
        // Débloquer le groupe de filtres d'état dans le sélecteur
        const selectFiltre = document.getElementById('anon-gen-filtre');
        if (selectFiltre) {
            const optgroup = selectFiltre.querySelector('optgroup[label="Avec vérification du corpus"]');
            if (optgroup) optgroup.style.display = '';
        }

    } catch (err) {
        console.error('[Scan] Erreur :', err);
    } finally {
        if (!silencieux && typeof endWait === 'function') endWait();
    }
}

/**
 * Applique les résultats du scan sur les lignes du tableau :
 * - affiche la colonne "État corpus" avec badges colorés
 * - colore la ligne en orange clair si nbNon > 0
 * - met à jour window._anonScanCache pour les filtres d'état
 */
function appliquerResultatsScan(stats, lignes) {
    // Rendre visible l'en-tête de la colonne
    const thEtat = document.querySelector('.header-col-etat-corpus');
    if (thEtat) thEtat.style.display = '';

    for (const tr of lignes) {
        const e = (tr.dataset.entite || '').trim();
        const p = (tr.dataset.pseudo || '').trim();
        const st = stats.get(`${e}|${p}`);
        const tdEtat = tr.querySelector('.td-etat-corpus');
        if (!tdEtat) continue;

        tdEtat.style.display = '';

        if (!st || (st.nbAnon === 0 && st.nbExc === 0 && st.nbNon === 0)) {
            tdEtat.innerHTML = '<span style="color:#bbb;font-size:0.8rem;">—</span>';
            tr.style.backgroundColor = '';
            continue;
        }

        // Badges (réutilise les classes btn-nav-cat existantes)
        let badgesHtml = '';
        if (st.nbAnon > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-anon" title="${st.nbAnon} occurrence(s) anonymisée(s)">${st.nbAnon}</span> `;
        if (st.nbExc  > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-exc"  title="${st.nbExc} exception(s)">${st.nbExc}</span> `;
        if (st.nbNon  > 0) badgesHtml += `<span class="btn-nav-cat btn-nav-cat-non"  title="${st.nbNon} occurrence(s) non traitée(s)">${st.nbNon}</span>`;
        tdEtat.innerHTML = badgesHtml;

        // Coloration de la ligne
        if (st.nbNon > 0) {
            tr.style.backgroundColor = '#fff3e0'; // orange : occurrences à traiter
        } else if ((st.nbAnon + st.nbExc) > 0) {
            tr.style.backgroundColor = '#e8f5e9'; // vert : entièrement traité
        } else {
            tr.style.backgroundColor = '';
        }
    }
}
