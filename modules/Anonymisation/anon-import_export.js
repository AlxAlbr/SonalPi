////////////////////////////////////////////////////////////////////////
// GESTION DE L'EXPORT TABLE DE CORRESPONDANCE
////////////////////////////////////////////////////////////////////////

/**
 * Exporte la table de correspondance des anonymisations validées en JSON
 * Format: [{"entite_init": "XXX", "entite_pseudo":"YYYY"}, ...]
 * Seules les lignes avec entité initiale, entité de remplacement et occurrences > 0 sont exportées
 */
function exportTableCorrespondance() {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        question("Aucune donnée d'anonymisation à exporter.", ['OK']);
        return;
    }

    // Créer un tableau avec les lignes validées
    const correspondances = [];

    for (let i = 0; i < window.tabAnon.length; i++) {
        const paire = window.tabAnon[i];
        
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
        question("Aucune anonymisation validée à exporter. Veuillez d'abord valider au moins une ligne.", ['OK']);
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
    question(`Export réussi : ${correspondances.length} correspondance(s) exportée(s).`, ['OK']);
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
                    // Contexte entretien : règles déjà validées (occurrences>0) + application au texte ouvert.
                    // NB : window.tabAnon = array ACTIF de l'entretien (≠ `tabAnon` nu de gestion_corpus.js).
                    traiterImportCorrespondances(allCorrespondances, {
                        reglesExistantes: (window.tabAnon || [])
                            .filter(p => p && p.entite && p.occurrences > 0)
                            .map(p => ({ entite: p.entite, remplacement: p.remplacement })),
                        appliquer: appliquerImportCorrespondances
                    });
                }
            } catch (error) {
                notifErreur(`Erreur lors de la lecture du fichier ${file.name}:\n${error.message}`);
            }
        };
        
        reader.readAsText(file);
    });
    
    // Réinitialiser l'input pour permettre de recharger le même fichier
    document.getElementById('file-import-correspondance').value = '';
}

/**
 * Applique les correspondances importées au tableau d'anonymisation
 * @param {Array} correspondances - Les correspondances à appliquer
 */
async function appliquerImportCorrespondances(correspondances) {
    console.log("=== APPLICATION DES CORRESPONDANCES IMPORTEES ===");
    console.log(`Correspondances à appliquer: ${correspondances.length}`);

    // L'array ACTIF de l'entretien est window.tabAnon (celui que le tableau affiche et que
    // lit appliquerAnonymisationPour). Le `tabAnon` nu est un AUTRE binding (let de
    // gestion_corpus.js) → on alias ici pour ne pas écrire dans le mauvais tableau.
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) window.tabAnon = [];
    const tabAnon = window.tabAnon;

    let compteurAjoutes = 0;
    let compteurDoublons = 0;
    const altsCorpus = []; // entités passées en multi-pseudo (« garder les deux ») → MAJ corpus

    correspondances.forEach((corr, corrIdx) => {
        const entiteInit = corr.entite_init.trim();
        const entiePseudo = corr.entite_pseudo.trim();
        const entiePseudoAlt = (corr.entite_pseudo_alt || '').trim();
        console.log(`[${corrIdx + 1}] Traitement: "${entiteInit}" -> "${entiePseudo}"${entiePseudoAlt ? ' (+ ' + entiePseudoAlt + ')' : ''}`);

        // « Garder les deux » : pose l'alt sur une ligne mono (alt distinct), et note l'entité pour
        // répercuter au corpus. Renvoie true si l'alt a été posé.
        const poserAlt = (ligne) => {
            if (entiePseudoAlt && !estMultiPseudo(ligne) &&
                !pseudosDe(ligne).some(p => p.toLowerCase() === entiePseudoAlt.toLowerCase())) {
                ligne.remplacementAlt = entiePseudoAlt;
                altsCorpus.push({ entite: entiteInit, alt: entiePseudoAlt });
                return true;
            }
            return false;
        };

        // Vérifier s'il existe déjà une ligne avec cette entité
        let idxLigneExistante = -1;
        for (let i = 0; i < tabAnon.length; i++) {
            if (tabAnon[i].entite && tabAnon[i].entite.trim() === entiteInit) {
                idxLigneExistante = i;
                break;
            }
        }

        if (idxLigneExistante >= 0) {
            const ligne = tabAnon[idxLigneExistante];
            if (ligne.occurrences === 0) {
                // Ligne non validée → mettre à jour pseudo (+ alt éventuel).
                ligne.remplacement = entiePseudo;
                poserAlt(ligne);
                compteurAjoutes++;
            } else if (poserAlt(ligne)) {
                // Ligne déjà validée → « garder les deux » : on ajoute l'alt sans toucher aux occurrences.
                compteurAjoutes++;
            } else {
                compteurDoublons++;
            }
        } else {
            // Créer une nouvelle ligne (réutilise une ligne vide si dispo)
            let idxLigneVide = -1;
            for (let i = 0; i < tabAnon.length; i++) {
                if (tabAnon[i].entite.trim() === '') {
                    idxLigneVide = i;
                    break;
                }
            }

            if (idxLigneVide === -1) {
                const ligne = { entite: entiteInit, remplacement: entiePseudo, occurrences: 0, indexCourant: 0, matchPositions: [] };
                poserAlt(ligne);
                tabAnon.push(ligne);
            } else {
                tabAnon[idxLigneVide].entite = entiteInit;
                tabAnon[idxLigneVide].remplacement = entiePseudo;
                poserAlt(tabAnon[idxLigneVide]);
            }

            compteurAjoutes++;
        }
    });

    // Répercuter l'alt sur la règle CORPUS (sinon la fusion « corpus autoritaire » au save l'écrase).
    for (const a of altsCorpus) {
        await ajouterPseudoAltCorpus(a.entite, a.alt);
    }
    
    // Rafraîchir le tableau pour afficher les nouvelles lignes
    affichTableauAnon();
    
    // Valider tous les imports (comme si on avait appuyé sur Entrée)
    validerImportsAutomatic(correspondances);
    
    // Afficher un message de confirmation
    let message = `✅ Import réussi : ${compteurAjoutes} correspondance(s) importée(s).`;
    if (compteurDoublons > 0) {
        message += `\n⚠️ ${compteurDoublons} doublon(s) trouvé(s) (déjà anonymisé).`;
    }
    question(message, ['OK']);
}

/**
 * Valide automatiquement les correspondances importées
 * @param {Array} correspondances - Les correspondances importées
 */
function validerImportsAutomatic(correspondances) {
    const tabAnon = window.tabAnon || []; // array actif de l'entretien (cf. appliquerImportCorrespondances)
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
    
    // NB : on opère sur window.tabAnon = array ACTIF de l'entretien (celui que le tableau
    // affiche et que compterExceptions/appliquerAnonymisationPour lisent), PAS le `tabAnon` nu
    // (let de gestion_corpus.js, AUTRE binding non posé sur window). Indispensable pour que la
    // restauration .sonal soit cohérente avec l'affichage et la réapplication.

    // Si le tableau est vide (fichier anonymisé), initialiser avec des lignes vides
    if (donneeImportees.length === 0) {
        console.log("Tableau vide détecté (fichier anonymisé), initialisation avec lignes vides");
        window.tabAnon = [];
        // Ajouter quelques lignes vides pour permettre l'anonymisation
        for (let i = 0; i < 3; i++) {
            window.tabAnon.push({
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

    // Remplacer window.tabAnon complètement
    window.tabAnon = donneeImportees;
    
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
    
    // Parcourir chaque paire d'anonymisation (array ACTIF de l'entretien — cf. importerAnonSonal ;
    // idxPaire doit indexer le MÊME array que compterExceptions, qui lit window.tabAnon).
    window.tabAnon.forEach((paire, idxPaire) => {
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
