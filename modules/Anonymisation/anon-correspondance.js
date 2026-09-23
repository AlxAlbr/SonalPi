////////////////////////////////////////////////////////////////////////
// TABLE DE CORRESPONDANCE — moteur de conflits PARTAGÉ (entretien + corpus)
//
// Cœur réutilisable de l'import d'une table de correspondance JSON
// [{ entite_init, entite_pseudo }, ...] : détection des conflits + dialogue de
// résolution. Indépendant du niveau : il ne connaît NI le tabAnon entretien NI le
// tabAnon corpus — tout passe par un « contexte » injecté à l'appel :
//
//   traiterImportCorrespondances(allCorrespondances, {
//       reglesExistantes: [{ entite, remplacement }, ...], // règles déjà présentes
//       appliquer: (correspondancesFinales) => { ... }      // callback d'application
//   })
//
// L'entretien applique les règles au texte ouvert (marquage DOM) ; le corpus ajoute
// des règles au .crp. Seul le callback `appliquer` change.
//
// Chargé dans index.html ET edition_entretien.html (ce dernier en chemins antislash).
// Dépend de `question` (utilitaires), du DOM et des primitives canoniques chargées avant lui :
// `parseAliases`, `cleEntite`, `regleEnCollisionAlias`, `pseudosDe`.
////////////////////////////////////////////////////////////////////////

// Contexte du dernier import lancé (règles existantes + callback d'application).
// Mémorisé ici car le bouton « Valider » du dialogue de conflits passe par un
// onclick HTML qui ne peut PAS sérialiser une fonction — il relit donc le ctx ici.
let _ctxImportCorrespondance = null;

/**
 * Applique les correspondances retenues via le callback du contexte courant.
 * @param {Array} correspondances
 */
function appliquerCorrespondancesImport(correspondances) {
    const appliquer = _ctxImportCorrespondance && _ctxImportCorrespondance.appliquer;
    // Le contexte contient un callback lié à la fenêtre courante : ne jamais le laisser survivre à
    // l'import (notamment après annulation puis nouvel import).
    _ctxImportCorrespondance = null;
    if (typeof appliquer === 'function') {
        appliquer(correspondances);
    } else {
        console.error("Import correspondance : aucun callback d'application (ctx.appliquer).");
    }
}

/** Indique si un dialogue/import détient encore un contexte d'application. */
function contexteImportCorrespondanceActif() {
    return _ctxImportCorrespondance !== null;
}

/**
 * Traite les correspondances importées en détectant les conflits, puis applique
 * (directement si aucun conflit, sinon via le dialogue de résolution).
 * @param {Array} allCorrespondances - Toutes les correspondances importées [{entite_init, entite_pseudo}]
 * @param {{reglesExistantes: Array<{entite:string, remplacement:string}>, appliquer: Function}} ctx
 */
function traiterImportCorrespondances(allCorrespondances, ctx) {
    _ctxImportCorrespondance = ctx || {};

    const conflits = [];
    const valides = [];
    // Clé = identité canonique de l'entité : la casse et l'ordre des alias ne doivent pas créer deux
    // groupes lors d'un round-trip JSON. La première graphie rencontrée est conservée à l'affichage.
    const mapEntites = new Map(); // cleEntite → { entite, pseudos, thematique }

    // Règles déjà présentes (pour l'entretien = règles validées occurrences>0 ; pour le corpus =
    // toutes). La détection de conflit se fait AU NIVEAU ALIAS (regleEnCollisionAlias) : un import
    // "Lyon/Lyons" entre en conflit avec une règle existante "Lyon" même s'ils ne sont pas la même
    // chaîne. Cohérent avec fusionnerRegles / l'ajout direct.
    const reglesExistantes = ((ctx && ctx.reglesExistantes) || []).filter(r => r && r.entite && r.remplacement);

    // Regrouper les pseudos importés par entité : on collecte le pseudo ET un éventuel
    // entite_pseudo_alt (multi-pseudo dans le fichier), dédupliqués (insensible à la casse). Ainsi le
    // round-trip d'un « a/b » — qu'il vienne de 2 lignes {entite,a}+{entite,b} OU d'une ligne portant
    // un alt — redonne bien l'ensemble {a, b}. (corrige : perte d'alt + perte du multi au round-trip)
    allCorrespondances.forEach((corr) => {
        const entiteInit = (corr.entite_init || '').trim();
        if (!entiteInit) return;
        const cle = cleEntite(entiteInit);
        if (!cle) return;
        if (!mapEntites.has(cle)) {
            mapEntites.set(cle, {
                entite: entiteInit,
                pseudos: [],
                thematique: (corr.thematique || '').trim()
            });
        }
        const groupe = mapEntites.get(cle);
        if (!groupe.thematique && corr.thematique) groupe.thematique = String(corr.thematique).trim();
        const ajout = (p) => {
            const v = (p || '').trim();
            if (v && !groupe.pseudos.some(x => x.toLowerCase() === v.toLowerCase())) {
                groupe.pseudos.push(v);
            }
        };
        ajout(corr.entite_pseudo);
        ajout(corr.entite_pseudo_alt);
    });

    const avecMeta = (groupe, corr) => {
        if (groupe.thematique) corr.thematique = groupe.thematique;
        return corr;
    };

    // Découper les collisions partielles : avec `Lyon` déjà connu, importer `Lyon/Lyons` ne doit
    // jamais jeter l'alias libre `Lyons`. Les règles valides réservées plus tôt dans le même import
    // participent aussi à la détection, afin que deux fichiers importés ensemble soient cohérents.
    const groupesDecoupes = [];
    const reglesReservees = reglesExistantes.slice();
    for (const groupe of mapEntites.values()) {
        const parProprietaire = new Map();
        for (const alias of parseAliases(groupe.entite)) {
            const proprietaire = regleEnCollisionAlias(alias, reglesReservees);
            if (!parProprietaire.has(proprietaire)) parProprietaire.set(proprietaire, []);
            parProprietaire.get(proprietaire).push(alias.trim());
        }
        for (const [regleExistante, aliases] of parProprietaire) {
            const sousGroupe = { ...groupe, entite: aliases.join('/'), pseudos: groupe.pseudos.slice() };
            groupesDecoupes.push({ groupe: sousGroupe, regleExistante });
            if (!regleExistante && sousGroupe.pseudos.length > 0 && sousGroupe.pseudos.length <= 2) {
                reglesReservees.push({
                    entite: sousGroupe.entite,
                    remplacement: sousGroupe.pseudos[0],
                    remplacementAlt: sousGroupe.pseudos[1]
                });
            }
        }
    }

    // Analyser les conflits. Cap système : une entité a AU PLUS 2 pseudos (anon.md §9).
    groupesDecoupes.forEach(({ groupe, regleExistante }) => {
        const entiteInit = groupe.entite;
        const pseudosUniques = groupe.pseudos;

        if (regleExistante) {
            // Comparer aux pseudos EXISTANTS — primaire ET alt (pas seulement le primaire).
            const existPseudos = pseudosDe(regleExistante);
            const existLower = existPseudos.map(p => p.toLowerCase());
            const nouveaux = pseudosUniques.filter(p => !existLower.includes(p.toLowerCase()));
            if (nouveaux.length === 0) {
                // Réimport : tous les pseudos importés sont déjà dans la règle → doublon (préserver l'existant + alt).
                valides.push(avecMeta(groupe, { entite_init: entiteInit, entite_pseudo: existPseudos[0], entite_pseudo_alt: existPseudos[1] }));
            } else {
                // Divergence avec l'existant → l'utilisateur tranche. « Garder les deux » n'est proposé
                // que si l'UNION des pseudos respecte le cap ≤2 (vérifié CONTRE l'alt existant).
                const union = [...new Set([...existLower, ...pseudosUniques.map(p => p.toLowerCase())])];
                conflits.push({
                    type: 'deja-anonymisee',
                    entite_init: entiteInit,
                    pseudo_existant: existPseudos.join('/'),
                    pseudos_import: nouveaux,
                    peutGarderLesDeux: union.length <= 2,
                    thematique: groupe.thematique
                });
            }
        } else if (pseudosUniques.length === 1) {
            valides.push(avecMeta(groupe, { entite_init: entiteInit, entite_pseudo: pseudosUniques[0] }));
        } else if (pseudosUniques.length === 2) {
            // 2 pseudos pour la même entité = multi-pseudo LÉGITIME (round-trip « a/b ») → garder les deux,
            // sans dialogue (ce n'est pas un conflit mais une donnée multi-pseudo valide, cap respecté).
            valides.push(avecMeta(groupe, { entite_init: entiteInit, entite_pseudo: pseudosUniques[0], entite_pseudo_alt: pseudosUniques[1] }));
        } else {
            // ≥3 pseudos → dépasse le cap : conflit, l'utilisateur choisit lequel appliquer.
            conflits.push({ type: 'multi-pseudo', entite_init: entiteInit, options: pseudosUniques, thematique: groupe.thematique });
        }
    });


    if (conflits.length > 0) {
        afficherDialogueResolutionConflits(conflits, valides, allCorrespondances);
    } else if (valides.length > 0) {
        appliquerCorrespondancesImport(valides);
    } else {
        _ctxImportCorrespondance = null;
        question("Aucune correspondance valide trouvée dans les fichiers.", ['OK']);
    }
}

/**
 * Affiche un dialogue modal pour résoudre les conflits
 * @param {Array} conflits - Les conflits détectés
 * @param {Array} valides - Les correspondances valides sans conflit
 * @param {Array} allCorrespondances - Toutes les correspondances importées
 */
function afficherDialogueResolutionConflits(conflits, valides, allCorrespondances) {
    // Créer la structure HTML du dialogue
    let dialogueHtml = `
        <div id="dialogue-conflits" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div style="
                background: white;
                border-radius: 8px;
                padding: 20px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            ">
                <h2 style="margin-top: 0; color: #333;">⚠️ Résolution des conflits d'anonymisation</h2>
                <p style="color: #666;">Pour chaque entité en conflit, sélectionnez comment l'anonymiser :</p>

                <div id="conflits-container">
    `;

    // Ajouter les conflits
    conflits.forEach((conflit, idx) => {
        dialogueHtml += `<div style="border: 1px solid #ddd; padding: 12px; margin: 10px 0; border-radius: 4px;">`;

        if (conflit.type === 'deja-anonymisee') {
            dialogueHtml += `
                <p style="margin: 0 0 10px 0; font-weight: bold;">Anonymiser "<span style="color: #d32f2f;">${conflit.entite_init}</span>" par :</p>
                <label style="display: block; margin: 5px 0;">
                    <input type="radio" name="conflit-${idx}" value="existing" checked>
                    <strong>${conflit.pseudo_existant}</strong> (existant)
                </label>
            `;
            conflit.pseudos_import.forEach(pseudo => {
                dialogueHtml += `
                    <label style="display: block; margin: 5px 0;">
                        <input type="radio" name="conflit-${idx}" value="${pseudo}">
                        ${pseudo} (import)
                    </label>
                `;
            });
            // « Garder les deux » : proposé uniquement si l'UNION des pseudos respecte le cap ≤2
            // (calculé contre le primaire ET l'alt existants). Crée un multi-pseudo : l'anonymisation
            // se choisit ensuite occurrence par occurrence.
            if (conflit.peutGarderLesDeux) {
                dialogueHtml += `
                    <label style="display: block; margin: 5px 0;">
                        <input type="radio" name="conflit-${idx}" value="both">
                        ⚖️ Garder les deux : « ${conflit.pseudo_existant} » + « ${conflit.pseudos_import[0]} » (choix par occurrence)
                    </label>
                `;
            }
            dialogueHtml += `
                <label style="display: block; margin: 5px 0;">
                    <input type="radio" name="conflit-${idx}" value="skip">
                    ⊘ Pas d'anonymisation
                </label>
            `;
        } else if (conflit.type === 'multi-pseudo') {
            dialogueHtml += `
                <p style="margin: 0 0 10px 0; font-weight: bold;">Anonymiser "<span style="color: #d32f2f;">${conflit.entite_init}</span>" par :</p>
            `;
            conflit.options.forEach((option, optIdx) => {
                dialogueHtml += `
                    <label style="display: block; margin: 5px 0;">
                        <input type="radio" name="conflit-${idx}" value="${option}" ${optIdx === 0 ? 'checked' : ''}>
                        ${option}
                    </label>
                `;
            });
            dialogueHtml += `
                <label style="display: block; margin: 5px 0;">
                    <input type="radio" name="conflit-${idx}" value="skip">
                    ⊘ Pas d'anonymisation
                </label>
            `;
        }

        dialogueHtml += `</div>`;
    });

    dialogueHtml += `
                </div>

                <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="fermerDialogueConflits()" style="
                        padding: 8px 16px;
                        background-color: #999;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    ">Annuler</button>
                    <button onclick="validerResolutionConflits(${JSON.stringify(conflits).replace(/"/g, '&quot;')}, ${JSON.stringify(valides).replace(/"/g, '&quot;')})" style="
                        padding: 8px 16px;
                        background-color: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    ">Valider et Appliquer</button>
                </div>
            </div>
        </div>
    `;

    // Injecter le dialogue dans le DOM
    const dialogueContainer = document.createElement('div');
    dialogueContainer.innerHTML = dialogueHtml;
    document.body.appendChild(dialogueContainer);
}

/**
 * Ferme le dialogue de résolution des conflits
 */
function fermerDialogueConflits() {
    const dialogue = document.getElementById('dialogue-conflits');
    if (dialogue) dialogue.parentElement.remove();
    _ctxImportCorrespondance = null;
}

/**
 * Valide la résolution des conflits et applique l'anonymisation (via le ctx courant)
 * @param {Array} conflits - Les conflits détectés
 * @param {Array} valides - Les correspondances valides
 */
function validerResolutionConflits(conflits, valides) {
    const correspondancesFinales = [...valides];

    conflits.forEach((conflit, idx) => {
        const radio = document.querySelector(`input[name="conflit-${idx}"]:checked`);
        if (!radio) return;
        const choix = radio.value;
        if (choix === 'skip') return;
        if (choix === 'both') {
            // Garder les deux → correspondance multi-pseudo : primaire = existant, alt = importé.
            const corr = {
                entite_init: conflit.entite_init,
                entite_pseudo: conflit.pseudo_existant,
                entite_pseudo_alt: conflit.pseudos_import[0]
            };
            if (conflit.thematique) corr.thematique = conflit.thematique;
            correspondancesFinales.push(corr);
            return;
        }
        if (conflit.type === 'deja-anonymisee' && choix === 'existing') return; // garder l'existant
        const corr = { entite_init: conflit.entite_init, entite_pseudo: choix };
        if (conflit.thematique) corr.thematique = conflit.thematique;
        correspondancesFinales.push(corr);
    });

    // Appliquer AVANT de fermer : appliquerCorrespondancesImport capture puis libère le contexte.
    appliquerCorrespondancesImport(correspondancesFinales);
    fermerDialogueConflits();
}
