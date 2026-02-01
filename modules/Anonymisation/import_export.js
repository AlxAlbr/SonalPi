////////////////////////////////////////////////////////////////////////
// GESTION DE L'EXPORT TABLE DE CORRESPONDANCE
////////////////////////////////////////////////////////////////////////

/**
 * Exporte la table de correspondance des anonymisations validées en JSON
 * Format: [{"entite_init": "XXX", "entite_pseudo":"YYYY"}, ...]
 * Seules les lignes avec entité initiale, entité de remplacement et occurrences > 0 sont exportées
 */
function exportTableCorrespondance() {
    if (typeof tabAnon === 'undefined' || !tabAnon) {
        alert("⚠️ Aucune donnée d'anonymisation à exporter.");
        return;
    }
    
    // Créer un tableau avec les lignes validées
    const correspondances = [];
    
    for (let i = 0; i < tabAnon.length; i++) {
        const paire = tabAnon[i];
        
        // Vérifier que la ligne a été validée (entité + remplacement + au moins une occurrence)
        if (paire.entite && paire.remplacement && paire.occurrences > 0) {
            correspondances.push({
                entite_init: paire.entite,
                entite_pseudo: paire.remplacement
            });
        }
    }
    
    // Vérifier s'il y a des données à exporter
    if (correspondances.length === 0) {
        alert("⚠️ Aucune anonymisation validée à exporter. Veuillez d'abord valider au least une ligne.");
        return;
    }
    
    // Créer le contenu JSON
    const jsonContent = JSON.stringify(correspondances, null, 2);
    
    // Créer un blob et télécharger
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Générer un nom de fichier avec la date/heure
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `table_correspondance_${timestamp}.json`;
    
    // Déclencher le téléchargement
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Afficher un message de confirmation
    alert(`✅ Export réussi : ${correspondances.length} correspondance(s) exportée(s).`);
}

////////////////////////////////////////////////////////////////////////
// GESTION DE L'IMPORT TABLE DE CORRESPONDANCE
////////////////////////////////////////////////////////////////////////

/**
 * Gère l'import de fichiers JSON contenant des tables de correspondance
 * @param {FileList} files - Les fichiers sélectionnés par l'utilisateur
 */
function importTableCorrespondance(files) {
    console.log("=== DEBUT IMPORT ===");
    console.log("Fichiers sélectionnés:", files.length);
    
    if (!files || files.length === 0) {
        console.log("Aucun fichier sélectionné");
        return;
    }
    
    // Lire tous les fichiers et les parser
    const allCorrespondances = [];
    let filesLoaded = 0;
    const totalFiles = files.length; 
    
    console.log(`Total fichiers à charger: ${totalFiles}`);
    
    Array.from(files).forEach((file, fileIdx) => {
        console.log(`[File ${fileIdx + 1}] Lecture du fichier: ${file.name}`);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            filesLoaded++;
            console.log(`[File ${fileIdx + 1}] Fichier chargé (${filesLoaded}/${totalFiles})`);
            
            try {
                const correspondances = JSON.parse(e.target.result);
                console.log(`[File ${fileIdx + 1}] JSON parsé, nombre de correspondances: ${Array.isArray(correspondances) ? correspondances.length : 'N/A'}`);
                
                // Vérifier que c'est un tableau
                if (!Array.isArray(correspondances)) {
                    throw new Error("Le fichier n'est pas un tableau JSON valide");
                }
                
                // Valider la structure de chaque correspondance
                correspondances.forEach((corr, corrIdx) => {
                    console.log(`[File ${fileIdx + 1}] Correspondance ${corrIdx}: "${corr.entite_init}" -> "${corr.entite_pseudo}"`);
                    if (!corr.entite_init || !corr.entite_pseudo) {
                        throw new Error("Chaque correspondance doit avoir 'entite_init' et 'entite_pseudo'");
                    }
                    allCorrespondances.push(corr);
                });
                
                console.log(`[File ${fileIdx + 1}] Total accumulé: ${allCorrespondances.length} correspondances`);
                
                // Quand tous les fichiers sont chargés, traiter les imports
                console.log(`Vérification: filesLoaded=${filesLoaded}, totalFiles=${totalFiles}, condition=${filesLoaded === totalFiles}`);
                if (filesLoaded === totalFiles) {
                    console.log("=== TOUS LES FICHIERS CHARGES ===");
                    console.log(`Total de correspondances à traiter: ${allCorrespondances.length}`);
                    traiterImportCorrespondances(allCorrespondances);
                }
            } catch (error) {
                alert(`❌ Erreur lors de la lecture du fichier ${file.name}:\n${error.message}`);
            }
        };
        
        reader.readAsText(file);
    });
    
    // Réinitialiser l'input pour permettre de recharger le même fichier
    document.getElementById('file-import-correspondance').value = '';
}

/**
 * Traite les correspondances importées en détectant les conflits
 * @param {Array} allCorrespondances - Toutes les correspondances importées
 */
function traiterImportCorrespondances(allCorrespondances) {
    console.log("=== TRAITEMENT DES CORRESPONDANCES ===");
    const conflits = [];
    const valides = [];
    
    // Créer un map pour déterminer les conflits
    const mapEntites = {}; // { entite_init: [{ pseudo, source }] }
    const entitesDejaAnonym = new Set();
    
    // Récupérer les entités déjà anonymisées
    for (let i = 0; i < tabAnon.length; i++) {
        if (tabAnon[i].entite && tabAnon[i].occurrences > 0) {
            console.log(`Entité déjà anonymisée: "${tabAnon[i].entite}" -> "${tabAnon[i].remplacement}"`);
            entitesDejaAnonym.add(tabAnon[i].entite.trim());
        }
    }
    console.log(`Total entités déjà anonymisées: ${entitesDejaAnonym.size}`);
    
    // Traiter chaque correspondance importée
    allCorrespondances.forEach((corr, idx) => {
        const entiteInit = corr.entite_init.trim();
        const entiePseudo = corr.entite_pseudo.trim();
        
        // Initialiser l'entrée si nécessaire
        if (!mapEntites[entiteInit]) {
            mapEntites[entiteInit] = [];
        }
        
        mapEntites[entiteInit].push({
            pseudo: entiePseudo,
            source: `Fichier ${idx + 1}`
        });
    });
    
    console.log(`Entités uniques à traiter: ${Object.keys(mapEntites).length}`);
    
    // Analyser les conflits
    Object.keys(mapEntites).forEach(entiteInit => {
        const pseudos = mapEntites[entiteInit];
        
        // Cas 1: Entité déjà anonymisée
        if (entitesDejaAnonym.has(entiteInit)) {
            const pseudoExistant = tabAnon.find(p => p.entite && p.entite.trim() === entiteInit)?.remplacement;
            console.log(`CONFLIT DEJA-ANONYMISEE: "${entiteInit}" (existant: "${pseudoExistant}", imports: ${pseudos.map(p => p.pseudo).join(', ')})`);
            conflits.push({
                type: 'deja-anonymisee',
                entite_init: entiteInit,
                pseudo_existant: pseudoExistant,
                pseudos_import: pseudos.map(p => p.pseudo)
            });
        }
        // Cas 2: Plusieurs pseudos différents pour la même entité
        else if (pseudos.length > 1 && new Set(pseudos.map(p => p.pseudo)).size > 1) {
            console.log(`CONFLIT MULTI-PSEUDO: "${entiteInit}" (options: ${pseudos.map(p => p.pseudo).join(', ')})`);
            conflits.push({
                type: 'multi-pseudo',
                entite_init: entiteInit,
                options: pseudos.map(p => p.pseudo)
            });
        }
        // Pas de conflit
        else {
            console.log(`VALIDE: "${entiteInit}" -> "${pseudos[0].pseudo}"`);
            valides.push({
                entite_init: entiteInit,
                entite_pseudo: pseudos[0].pseudo
            });
        }
    });
    
    console.log(`=== RÉSUMÉ ===`);
    console.log(`Conflits détectés: ${conflits.length}`);
    console.log(`Correspondances valides: ${valides.length}`);
    
    // S'il y a des conflits, afficher le dialogue
    if (conflits.length > 0) {
        console.log("Affichage du dialogue de résolution des conflits...");
        afficherDialogueResolutionConflits(conflits, valides, allCorrespondances);
    } else if (valides.length > 0) {
        // Pas de conflits, appliquer directement
        console.log("Application directe des correspondances valides...");
        appliquerImportCorrespondances(valides);
    } else {
        console.log("Aucune correspondance valide");
        alert("⚠️ Aucune correspondance valide trouvée dans les fichiers.");
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
 * Valide la résolution des conflits et applique l'anonymisation
 * @param {Array} conflits - Les conflits détectés
 * @param {Array} valides - Les correspondances valides
 */
function validerResolutionConflits(conflits, valides) {
    console.log("=== VALIDATION RESOLUTION CONFLITS ===");
    const correspondancesFinales = [...valides];
    
    console.log(`Conflits à traiter: ${conflits.length}`);    // Récupérer les choix de l'utilisateur pour chaque conflit
    conflits.forEach((conflit, idx) => {
        const radio = document.querySelector(`input[name="conflit-${idx}"]:checked`);
        if (radio) {
            const choix = radio.value;
            
            if (choix !== 'skip') {
                if (conflit.type === 'deja-anonymisee' && choix === 'existing') {
                    // Garder l'existant, ne rien faire
                } else {
                    // Ajouter la correspondance choisie
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
    
    // Appliquer les correspondances
    appliquerImportCorrespondances(correspondancesFinales);
}

/**
 * Applique les correspondances importées au tableau d'anonymisation
 * @param {Array} correspondances - Les correspondances à appliquer
 */
function appliquerImportCorrespondances(correspondances) {
    console.log("=== APPLICATION DES CORRESPONDANCES IMPORTEES ===");
    console.log(`Correspondances à appliquer: ${correspondances.length}`);
    
    let compteurAjoutes = 0;
    let compteurDoublons = 0;
    
    correspondances.forEach((corr, corrIdx) => {
        console.log(`[${corrIdx + 1}] Traitement: "${corr.entite_init}" -> "${corr.entite_pseudo}"`);
        const entiteInit = corr.entite_init.trim();
        const entiePseudo = corr.entite_pseudo.trim();
        
        // Vérifier s'il existe déjà une ligne avec cette entité
        let idxLigneExistante = -1;
        for (let i = 0; i < tabAnon.length; i++) {
            if (tabAnon[i].entite && tabAnon[i].entite.trim() === entiteInit) {
                idxLigneExistante = i;
                break;
            }
        }
        
        if (idxLigneExistante >= 0) {
            // La ligne existe, mettre à jour si nécessaire
            if (tabAnon[idxLigneExistante].occurrences === 0) {
                // Ligne non validée, la mettre à jour
                tabAnon[idxLigneExistante].remplacement = entiePseudo;
                compteurAjoutes++;
            } else {
                // Ligne déjà validée, c'est un doublon
                compteurDoublons++;
            }
        } else {
            // Créer une nouvelle ligne
            // Chercher une ligne vide
            let idxLigneVide = -1;
            for (let i = 0; i < tabAnon.length; i++) {
                if (tabAnon[i].entite.trim() === '') {
                    idxLigneVide = i;
                    break;
                }
            }
            
            if (idxLigneVide === -1) {
                // Ajouter une nouvelle ligne
                tabAnon.push({
                    entite: entiteInit,
                    remplacement: entiePseudo,
                    occurrences: 0,
                    indexCourant: 0,
                    matchPositions: []
                });
                idxLigneVide = tabAnon.length - 1;
            } else {
                // Remplir la ligne vide
                tabAnon[idxLigneVide].entite = entiteInit;
                tabAnon[idxLigneVide].remplacement = entiePseudo;
            }
            
            compteurAjoutes++;
        }
    });
    
    // Rafraîchir le tableau pour afficher les nouvelles lignes
    affichTableauAnon();
    
    // Valider tous les imports (comme si on avait appuyé sur Entrée)
    validerImportsAutomatic(correspondances);
    
    // Afficher un message de confirmation
    let message = `✅ Import réussi : ${compteurAjoutes} correspondance(s) importée(s).`;
    if (compteurDoublons > 0) {
        message += `\n⚠️ ${compteurDoublons} doublon(s) trouvé(s) (déjà anonymisé).`;
    }
    alert(message);
}

/**
 * Valide automatiquement les correspondances importées
 * @param {Array} correspondances - Les correspondances importées
 */
function validerImportsAutomatic(correspondances) {
    correspondances.forEach(corr => {
        // Chercher la ligne correspondante dans tabAnon
        for (let i = 0; i < tabAnon.length; i++) {
            if (tabAnon[i].entite && tabAnon[i].entite.trim() === corr.entite_init.trim() && 
                tabAnon[i].remplacement && tabAnon[i].remplacement.trim() === corr.entite_pseudo.trim() &&
                tabAnon[i].occurrences === 0) {
                
                // Appliquer l'anonymisation
                appliquerAnonymisationPour(i);
                
                // Désactiver l'édition si des occurrences ont été trouvées
                if (tabAnon[i].occurrences > 0) {
                    desactiverEditionLigne(i);
                }
                
                break;
            }
        }
    });
    
    // Rafraîchir le tableau final
    affichTableauAnon();
}


/**
 * Importe et reconstitue l'anonymisation depuis les données .Sonal
 * @param {Array} donneeImportees - Le contenu de anon-json du fichier .Sonal
 */
function importerAnonSonal(donneeImportees) {
    if (!donneeImportees || !Array.isArray(donneeImportees)) {
        console.log("Pas de données d'anonymisation à importer");
        return;
    }

    console.log("Import anonymisation depuis .Sonal :", donneeImportees.length, "lignes");
    
    // Si le tableau est vide (fichier anonymisé), initialiser avec des lignes vides
    if (donneeImportees.length === 0) {
        console.log("Tableau vide détecté (fichier anonymisé), initialisation avec lignes vides");
        tabAnon = [];
        // Ajouter quelques lignes vides pour permettre l'anonymisation
        for (let i = 0; i < 3; i++) {
            tabAnon.push({
                entite: "",
                remplacement: "",
                occurrences: 0,
                indexCourant: 0,
                matchPositions: []
            });
        }
        affichTableauAnon();
        return;
    }
    
    // Remplacer tabAnon complètement
    tabAnon = donneeImportees;
    
    // Rafraîchir l'affichage du tableau
    affichTableauAnon();
    
    // Réappliquer les anonymisations validées
    reappliquerAnonymisationsSonal();
    
    console.log("✅ Importation complète, anonymisations réappliquées");
}

/**
 * Réapplique toutes les anonymisations validées sur le texte
 * Préserve aussi les lignes en attente (sans appliquer l'anonymisation)
 * Gère correctement les exceptions avec isException
 */
function reappliquerAnonymisationsSonal() {
    const tousLesSpans = document.querySelectorAll('[data-rk]');
    
    // Parcourir chaque paire d'anonymisation
    tabAnon.forEach((paire, idxPaire) => {
        // SUBTILITÉ 1 : Si occurrences === 0, c'est une ligne en attente
        // On NE la réapplique PAS sur le texte, mais elle reste dans le tableau
        if (paire.occurrences === 0) {
            console.log(`Ligne ${idxPaire} en attente : "${paire.entite}" -> "${paire.remplacement}" (non réappliquée)`);
            return; // Skip la réapplication, mais la ligne existe toujours dans tabAnon
        }
        
        // SUBTILITÉ 2 : Si occurrences > 0, réappliquer avec exceptions
        if (!paire.matchPositions || paire.matchPositions.length === 0) {
            return; // Ligne validée mais sans matchPositions (cas anormal)
        }
        
        // Pour chaque match position stockée
        paire.matchPositions.forEach((match, matchIdx) => {
            for (let i = match.start; i <= match.end; i++) {
                if (tousLesSpans[i]) {
                    // SUBTILITÉ 2 : Vérifier isException pour appliquer la bonne classe
                    if (match.isException) {
                        // Exception : afficher le texte original sans remplacement
                        tousLesSpans[i].classList.add('anon-exception');
                        // Retirer le pseudo pour ne pas afficher le remplacement
                        delete tousLesSpans[i].dataset.pseudo;
                    } else {
                        // Anonymisé normalement
                        tousLesSpans[i].classList.add('anon');
                        // Ajouter le pseudo aux spans de début et fin
                        if (i === match.start || i === match.end) {
                            tousLesSpans[i].dataset.pseudo = paire.remplacement;
                        }
                    }
                    
                    // Ajouter les classes de position (debsel/finsel)
                    if (i === match.start) {
                        tousLesSpans[i].classList.add('debsel');
                    }
                    if (i === match.end) {
                        tousLesSpans[i].classList.add('finsel');
                    }
                }
            }
        });
        
        console.log(`Ligne ${idxPaire} réappliquée : "${paire.entite}" (${paire.occurrences} occurrences, ${compterExceptions(idxPaire)} exceptions)`);
    });
}

/**
 * Export txt avec anonymisations/pseudonymisations appliquées
 * Utilise le texte affiché (qui inclut les classes CSS anon et anon-exception)
 */
function exportTxtAvecAnonymisation(){
    let nbspans = getNbSpans();
    let rgDeb = 1;
    let rgFin = nbspans;

    let detailsf = dossfichext(nomFichText);
    
    // Extraire le texte avec les anonymisations appliquées
    let txtAnonymise = exportTxtAvecClasses(rgDeb, rgFin, true);
    
    SauvegarderSurDisque(txtAnonymise, detailsf[1] + "_anonymise.txt", "UTF-8");
}

/**
 * Extrait le texte d'un ensemble de spans en appliquant les anonymisations
 * Fonction utilitaire réutilisable pour tous les exports
 * @param {NodeList|Array} spans - Liste des spans à traiter
 * @param {number} startIndex - Index de départ dans la liste
 * @param {number} endIndex - Index de fin (optionnel, traite tous si non spécifié)
 * @returns {Object} {texte: string, nextIndex: number} - Le texte extrait et l'index suivant
 */
function extraireTexteAnonymiseDepuisSpans(spans, startIndex, endIndex = null) {
    let texteExtrait = "";
    let i = startIndex;
    const maxIndex = endIndex !== null ? endIndex : spans.length - 1;
    
    while (i <= maxIndex && i < spans.length) {
        const span = spans[i];
        
        if (!span) {
            i++;
            continue;
        }
        
        // Si c'est une anonymisation (classe 'anon')
        if (span.classList.contains('anon')) {
            // Chercher le pseudo du dernier span de cette anonymisation
            let pseudo = span.dataset.pseudo;
            
            // Parcourir jusqu'au finsel pour trouver le pseudo
            let j = i;
            while (j <= maxIndex && j < spans.length) {
                const nextSpan = spans[j];
                if (nextSpan && nextSpan.classList.contains('finsel') && nextSpan.classList.contains('anon')) {
                    pseudo = nextSpan.dataset.pseudo || pseudo || span.textContent;
                    i = j + 1; // Avancer après le finsel
                    break;
                }
                j++;
            }
            
            // Ajouter le pseudo entre crochets
            texteExtrait += "[" + (pseudo || span.textContent) + "]";
        }
        // Si c'est une exception (anon-exception)
        else if (span.classList.contains('anon-exception')) {
            // Parcourir jusqu'au finsel pour récupérer tout le texte original
            let texteException = span.textContent;
            
            if (!span.classList.contains('finsel')) {
                let j = i + 1;
                while (j <= maxIndex && j < spans.length) {
                    const nextSpan = spans[j];
                    texteException += nextSpan.textContent;
                    if (nextSpan && nextSpan.classList.contains('finsel') && nextSpan.classList.contains('anon-exception')) {
                        i = j + 1;
                        break;
                    }
                    j++;
                }
            } else {
                i++;
            }
            
            texteExtrait += texteException;
        }
        // Sinon, texte normal
        else {
            texteExtrait += span.textContent;
            i++;
        }
    }
    
    return { texte: texteExtrait, nextIndex: i };
}

/**
 * Extraction du texte avec les anonymisations/pseudonymisations
 * Remplace les spans anonymisés par leur pseudo (ou texte original pour exceptions)
 */
function exportTxtAvecClasses(rgDeb, rgFin, avecLoc){
    var txtAnonymise = "";    
    var locuteur_courant = -1;
    var segment_courant = -1;
    var i = rgDeb;

    while (i <= rgFin){
        let span = document.querySelector('[data-rk="'+i+'"]');
        if (!span) {i++; continue;}

        let rgseg = span.dataset.sg; 
        if (!rgseg) {i++; continue;}

        let seg = getSeg(rgseg);
        if (!seg) {i++; continue;}

        if (avecLoc == true){
            // ajout du locuteur si changement
            if (locuteur_courant != seg.dataset.loc){
                locuteur_courant = seg.dataset.loc;
                let loc = locut[locuteur_courant].replaceAll("?","") ;
                if (loc) {txtAnonymise += "\r\n \r\n" + loc + " : \r\n";}
                segment_courant = -1; // Réinitialiser le segment car nouveau locuteur
            }
        }

        // Ajouter un espace si on change de segment (même locuteur)
        if (segment_courant !== -1 && segment_courant != rgseg) {
            txtAnonymise += " ";
        }
        segment_courant = rgseg;

        // Utiliser la fonction commune pour extraire le texte anonymisé
        // On crée un pseudo-tableau avec le span courant pour compatibilité
        const tousLesSpans = Array.from(document.querySelectorAll('[data-rk]'));
        const indexActuel = tousLesSpans.findIndex(s => s.dataset.rk == i);
        
        if (indexActuel !== -1) {
            const indexFin = tousLesSpans.findIndex(s => s.dataset.rk == rgFin);
            const resultat = extraireTexteAnonymiseDepuisSpans(tousLesSpans, indexActuel, indexFin);
            
            if (resultat.texte) {
                txtAnonymise += resultat.texte;
            }
            
            // Mettre à jour i en fonction du prochain index
            const prochainSpan = tousLesSpans[resultat.nextIndex];
            i = prochainSpan ? parseInt(prochainSpan.dataset.rk) : rgFin + 1;
        } else {
            i++;
        }
    }

    return txtAnonymise;
}

/**
 * Exporte le document Word avec anonymisation/pseudonymisation appliquée
 * Similaire à exportWord() mais utilise le texte anonymisé
 */
function exportWordAvecAnonymisation(){

    // Basculement du html en tableau
    HTMLTOTABSEG()

    let txtobs = document.getElementById("txtnotes").value
     
    const doc = new docx.Document({


    sections: [
     {
    properties: {


    },
    children: [
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: nomFichText,
            bold: true
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "",
            bold: true
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "Exporté par whispurge : www.sonal-info.com/whispurge.html", 
           italics : true
          }),
     ]
      }),

      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "", 
            
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "---", 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "", 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "Notes : " + txtobs, 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "---" , 
            
          })
     ]
      }),
    ]
  }
]

});

  


for (s=0;s<TabSeg.length;s++){

// défintion du locuteur

var loc = "" 
if (locut[TabSeg[s][3]]){loc= locut[TabSeg[s][3]]}
var changeloc = false
if (s>0 && TabSeg[s][3]!=TabSeg[s-1][3]) {
    changeloc = true 
}

if (s==0) {changeloc = true }

var italouinon=false
// italouinon
if (loc.indexOf("?")>-1){italouinon=true}
loc = loc.replaceAll("?","") ;
loc += " : ";

// ajout de la position chronométrique
let posit = TabSeg[s][1]
if (posit) {loc += SecToTime(TabSeg[s][1],true)};

// ajout du locuteur
if (changeloc==true){
    doc.addSection({
    properties: {
            type: docx.SectionType.CONTINUOUS
            },

    children: [ 
    new docx.Paragraph({
        children: [
            new docx.TextRun({
            text: "",
            }),
            
        ],
        }),
        new docx.Paragraph({
        children: [
            new docx.TextRun({
            text: loc,
            italics: italouinon,
            }),
            
        ],
        }),
    ],
    })
}

// Récupération du texte du segment avec anonymisation appliquée
let texteSegment = obtenirTexteSegmentAnonymise(s);

// ajout du texte
doc.addSection({
properties: {
           type: docx.SectionType.CONTINUOUS
        },

  children: [ 
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: texteSegment,
          italics: italouinon,
           
        }),
      ],
    }),
  ],
})

}


docx.Packer.toBlob(doc).then((blob) => {
console.log("Blob créé:", blob);

// Génération du nom de fichier
let nomFichier = "transcription"; // Nom par défaut

if (typeof nomFichText !== 'undefined' && nomFichText) {
    let detailsf = dossfichext(nomFichText);
    nomFichier = detailsf[1]; // Récupère le nom sans extension
    console.log("Nom extrait:", nomFichier);
}

const nomComplet = nomFichier + "_anonymise.docx";
console.log("Nom de fichier final:", nomComplet);

// Utilisation de la méthode native du navigateur (plus fiable que FileSaver.js)
const url = window.URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = nomComplet;
link.style.display = 'none';
document.body.appendChild(link);
link.click();

// Nettoyage après un court délai
setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    console.log("Document exporté:", nomComplet);
}, 100);
});




}

/**
 * Obtient le texte d'un segment avec les anonymisations appliquées
 * @param {number} indexSegment - L'index du segment dans TabSeg
 * @returns {string} Le texte du segment avec anonymisations
 */
function obtenirTexteSegmentAnonymise(indexSegment) {
    // Récupérer le segment HTML correspondant
    const segments = document.querySelectorAll('.lblseg');
    const segment = segments[indexSegment];
    
    if (!segment) {
        return TabSeg[indexSegment][4]; // Retourner le texte brut si segment non trouvé
    }
    
    // Parcourir tous les spans du segment et utiliser la fonction commune
    const spans = segment.querySelectorAll('span');
    const resultat = extraireTexteAnonymiseDepuisSpans(spans, 0);
    
    return resultat.texte;
}

/**
 * Exporte le fichier SRT avec anonymisation/pseudonymisation appliquée
 */
function exportSrtAvecAnonymisation(){

    var txtSrt;
    txtSrt ="";
    var loc_cur = -1; // mémorisation du locuteur
    
    if (TabSeg.length<1){
        console.log("pas de tabseg")
        HTMLTOTABSEG()
    }

    for (s=0;s<TabSeg.length;s++){

        txtSrt += (s+1) + "\r"
         
        let tpsdeb = Number(TabSeg[s][1]);
        if (tpsdeb !=undefined)  {
            tpsdeb = SecToTime(tpsdeb,false)
            tpsdeb = tpsdeb.replaceAll(".",",")
        };

        let tpsfin = Number(TabSeg[s][2]);
        if (tpsfin !=undefined) { 
            tpsfin = SecToTime(tpsfin,false) 
            tpsfin = tpsfin.replaceAll(".",",")
        };

        txtSrt += tpsdeb + " --> " + tpsfin + "\r"

        // Ajout du locuteur
        loc_cur = TabSeg[s][3]
        let loc = locut[loc_cur].replaceAll("?","") ;   
        if (loc) {txtSrt += loc + " : ";}
        
        // Récupération du texte du segment avec anonymisation appliquée
        let txt = obtenirTexteSegmentAnonymise(s);
        
        txtSrt +=  txt +  "\r \r"
    }
 
    let detailsf = dossfichext(nomFichText)

    SauvegarderSurDisque(txtSrt, detailsf[1] + "_anonymise.srt", "UTF-8")
}

/**
 * Génère le contenu HTML du fichier .Sonal avec texte anonymisé mais SANS la table d'anonymisation
 * Version anonymisée irréversible destinée au partage
 * @returns {string} Le contenu HTML anonymisé
 */
function sauvHtmlAnonymise(){

    var contenuHtml =`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fichier Whispurge (Version anonymisée)</title>
   <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet"  type="text/css">  
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous"> 
   
   `

    const locJSON = JSON.stringify(locut, null);
    const thmJSON = JSON.stringify(tabThm,null)
    const varJSON = JSON.stringify(tabVar,null)
    const dicJSON = JSON.stringify(tabDic,null)
    const datJSON = JSON.stringify(tabDat,null)
    // PAS d'export de tabAnon - c'est le point clé de cette fonction

    contenuHtml += exportThmcss();

    contenuHtml += `</head>
 
<body>
`
    // sauvegarde des locuteurs
    contenuHtml += `<script id="loc-json" type="application/json">
        
            ` + locJSON + `         
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="cat-json" type="application/json">
        
            
            ` + thmJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="var-json" type="application/json">
        
            ` + varJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="dic-json" type="application/json">
           
            ` + dicJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="dat-json" type="application/json">
           
            ` + datJSON + `          
        
<`+ `/script> 
`; 

    // PAS de sauvegarde de l'anonymisation - table vide
    contenuHtml += `<script id="anon-json" type="application/json">
           
            []          
        
<`+ `/script> 
`;

    // sauvegarde des notes
    let notes = document.getElementById('txtnotes').value ;
    contenuHtml +=`
    <div style="margin-bottom: 5px !important; 
	margin-bottom: 5px !important;
	margin: 40px;"
	>

    <H2 > Notes</H2>
    
        <div id="txtnotes">
        ` + notes + `
        </div>
    </div>
    `; 

    // suppression du menu contextuel 
    const oldMenu = document.getElementById("contextMenu")
    if (oldMenu) {oldMenu.remove()}

    // suppression des surlignements
    effaceSel();
    effaceSurv();

    // Générer le contenu avec texte anonymisé
    let segmentsAnonymises = genererSegmentsAnonymises();

    // sauvegarde du contenu HTML principal
    contenuHtml +=` <div id="contenuText"> 
     `

    contenuHtml += segmentsAnonymises  

    contenuHtml +=` 
</div></body>`

    return contenuHtml;
}

/**
 * Génère le HTML des segments avec texte anonymisé mais sans les classes/attributs d'anonymisation
 * Le texte est définitivement remplacé par les pseudonymes
 * @returns {string} Le HTML des segments anonymisés
 */
function genererSegmentsAnonymises() {
    // Cloner le conteneur de segments pour ne pas modifier l'original
    const segmentsOriginal = document.getElementById('segments');
    const segmentsClone = segmentsOriginal.cloneNode(true);
    
    // Parcourir tous les segments du clone
    const segments = segmentsClone.querySelectorAll('.lblseg');
    
    segments.forEach((segment, index) => {
        // Supprimer les classes d'anonymisation
        const spans = segment.querySelectorAll('span');
        spans.forEach(span => {
            span.classList.remove('anon', 'anon-exception', 'debsel', 'finsel');
            delete span.dataset.pseudo;
        });
        
        // Obtenir le texte anonymisé de ce segment (depuis l'original, pas le clone)
        const texteAnonymise = obtenirTexteSegmentAnonymise(index);
        
        // Vider le segment et recréer les spans avec le texte anonymisé
        segment.innerHTML = '';
        
        // Découper le texte en mots et créer des spans simples
        const mots = texteAnonymise.match(/[\wÀ-ÿ\[\]]+|[^\w\s]|[\s]+/g);
        
        if (mots) {
            // Récupérer le data-sg original
            const segmentOriginal = segmentsOriginal.querySelectorAll('.lblseg')[index];
            const firstSpanOriginal = segmentOriginal ? segmentOriginal.querySelector('span[data-sg]') : null;
            const dataSg = firstSpanOriginal ? firstSpanOriginal.dataset.sg : index;
            
            let rk = 1; // Commence à 1 comme dans l'original
            mots.forEach((mot) => {
                const span = document.createElement('span');
                span.dataset.rk = rk;
                span.dataset.sg = dataSg;
                span.textContent = mot; // textContent échappe automatiquement le HTML
                segment.appendChild(span);
                rk++;
            });
        } else if (texteAnonymise) {
            // Si pas de mots détectés, mettre le texte tel quel
            const segmentOriginal = segmentsOriginal.querySelectorAll('.lblseg')[index];
            const firstSpanOriginal = segmentOriginal ? segmentOriginal.querySelector('span[data-sg]') : null;
            const dataSg = firstSpanOriginal ? firstSpanOriginal.dataset.sg : index;
            
            const span = document.createElement('span');
            span.dataset.rk = 1;
            span.dataset.sg = dataSg;
            span.textContent = texteAnonymise;
            segment.appendChild(span);
        }
    });
    
    return segmentsClone.innerHTML;
}
