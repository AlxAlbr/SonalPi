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
// des règles au .crp (todo2.md). Seul le callback `appliquer` change.
//
// Chargé dans index.html ET edition_entretien.html (ce dernier en chemins antislash).
// Dépend uniquement de `question` (utilitaires) + DOM.
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
    if (_ctxImportCorrespondance && typeof _ctxImportCorrespondance.appliquer === 'function') {
        _ctxImportCorrespondance.appliquer(correspondances);
    } else {
        console.error("Import correspondance : aucun callback d'application (ctx.appliquer).");
    }
}

/**
 * Traite les correspondances importées en détectant les conflits, puis applique
 * (directement si aucun conflit, sinon via le dialogue de résolution).
 * @param {Array} allCorrespondances - Toutes les correspondances importées [{entite_init, entite_pseudo}]
 * @param {{reglesExistantes: Array<{entite:string, remplacement:string}>, appliquer: Function}} ctx
 */
function traiterImportCorrespondances(allCorrespondances, ctx) {
    console.log("=== TRAITEMENT DES CORRESPONDANCES ===");
    _ctxImportCorrespondance = ctx || {};

    const conflits = [];
    const valides = [];
    const mapEntites = {}; // { entite_init: [{ pseudo, source }] }

    // Règles déjà présentes (pour l'entretien = règles validées occurrences>0 ; pour le corpus =
    // toutes). La détection de conflit se fait AU NIVEAU ALIAS (regleEnCollisionAlias) : un import
    // "Lyon/Lyons" entre en conflit avec une règle existante "Lyon" même s'ils ne sont pas la même
    // chaîne. Cohérent avec fusionnerRegles / l'ajout direct.
    const reglesExistantes = ((ctx && ctx.reglesExistantes) || []).filter(r => r && r.entite && r.remplacement);
    console.log(`Total règles déjà présentes : ${reglesExistantes.length}`);

    // Regrouper les pseudos importés par entité
    allCorrespondances.forEach((corr, idx) => {
        const entiteInit = corr.entite_init.trim();
        const entiePseudo = corr.entite_pseudo.trim();
        if (!mapEntites[entiteInit]) mapEntites[entiteInit] = [];
        mapEntites[entiteInit].push({ pseudo: entiePseudo, source: `Fichier ${idx + 1}` });
    });

    console.log(`Entités uniques à traiter: ${Object.keys(mapEntites).length}`);

    // Analyser les conflits
    Object.keys(mapEntites).forEach(entiteInit => {
        const pseudos = mapEntites[entiteInit];
        const pseudosUniques = [...new Set(pseudos.map(p => p.pseudo))];

        // Cas 1: un alias de l'entité importée est déjà pris par une règle existante (insensible à la casse)
        const regleExistante = regleEnCollisionAlias(entiteInit, reglesExistantes);
        if (regleExistante) {
            const pseudoExistant = regleExistante.remplacement;
            // Ne sont en conflit que les pseudos importés DIFFÉRENTS (insensible à la casse) de l'existant.
            const differents = pseudosUniques.filter(p => p.toLowerCase() !== String(pseudoExistant).toLowerCase());
            if (differents.length === 0) {
                // Réimport à l'identique → simple doublon (pas un conflit) : on laisse
                // l'étape d'application le détecter et l'ignorer.
                valides.push({ entite_init: entiteInit, entite_pseudo: pseudoExistant });
            } else {
                conflits.push({
                    type: 'deja-anonymisee',
                    entite_init: entiteInit,
                    pseudo_existant: pseudoExistant,
                    pseudos_import: differents
                });
            }
        }
        // Cas 2: Plusieurs pseudos différents pour la même entité (dans l'import)
        else if (pseudosUniques.length > 1) {
            conflits.push({
                type: 'multi-pseudo',
                entite_init: entiteInit,
                options: pseudosUniques
            });
        }
        // Pas de conflit
        else {
            valides.push({
                entite_init: entiteInit,
                entite_pseudo: pseudos[0].pseudo
            });
        }
    });

    console.log(`Conflits détectés: ${conflits.length} · Correspondances valides: ${valides.length}`);

    if (conflits.length > 0) {
        afficherDialogueResolutionConflits(conflits, valides, allCorrespondances);
    } else if (valides.length > 0) {
        appliquerCorrespondancesImport(valides);
    } else {
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
    if (dialogue) {
        dialogue.parentElement.remove();
    }
}

/**
 * Valide la résolution des conflits et applique l'anonymisation (via le ctx courant)
 * @param {Array} conflits - Les conflits détectés
 * @param {Array} valides - Les correspondances valides
 */
function validerResolutionConflits(conflits, valides) {
    console.log("=== VALIDATION RESOLUTION CONFLITS ===");
    const correspondancesFinales = [...valides];

    conflits.forEach((conflit, idx) => {
        const radio = document.querySelector(`input[name="conflit-${idx}"]:checked`);
        if (radio) {
            const choix = radio.value;
            if (choix !== 'skip') {
                if (conflit.type === 'deja-anonymisee' && choix === 'existing') {
                    // Garder l'existant, ne rien faire
                } else {
                    correspondancesFinales.push({
                        entite_init: conflit.entite_init,
                        entite_pseudo: choix
                    });
                }
            }
        }
    });

    // Fermer le dialogue
    fermerDialogueConflits();

    // Appliquer les correspondances (callback injecté : entretien=DOM, corpus=règles .crp)
    appliquerCorrespondancesImport(correspondancesFinales);
}
