////////////////////////////////////////////////////////////////////////
// GESTION DE L'EXPORT TABLE DE CORRESPONDANCE
////////////////////////////////////////////////////////////////////////

// Vrai si toutes les occurrences détectées d'une règle sont des incluses (absorbées par une autre
// règle plus large) → rien d'« appliqué en propre » à consigner dans la table de correspondance (§2.2).
function estEntierementIncluse(paire) {
    const mp = paire.matchPositions || [];
    return mp.length > 0 && mp.every(m => m.isIncluded);
}

/**
 * Exporte la table de correspondance des anonymisations validées en JSON
 * Format: [{"entite_init": "XXX", "entite_pseudo":"YYYY"}, ...]
 * Lignes exportées : entité + remplacement + MATÉRIALISÉES (occurrences de texte OU libellé de locuteur).
 */
function exportTableCorrespondance() {
    if (typeof window.tabAnon === 'undefined' || !window.tabAnon) {
        question("Aucune donnée d'anonymisation à exporter.", ['OK']);
        return;
    }

    // Créer un tableau avec les lignes validées
    const correspondances = [];

    // Champ `thematique` OPTIONNEL (plan-thematiques-entites.md, Phase 4) : ajouté seulement si la
    // fonctionnalité est ACTIVE au corpus ET si la valeur est présente. Désactivée → l'export n'émet
    // pas les thématiques (cohérent avec le masquage badges/recherche). Ignoré à l'import s'il est absent.
    const themesActifs = (typeof getThematiques === 'function') && getThematiques().actif;
    const pousser = (entite_init, entite_pseudo, paire) => {
        const c = { entite_init, entite_pseudo };
        if (themesActifs && paire && paire.thematique) c.thematique = paire.thematique;
        correspondances.push(c);
    };

    const spansExport = document.querySelectorAll('[data-rk]');
    for (let i = 0; i < window.tabAnon.length; i++) {
        const paire = window.tabAnon[i];

        // Ligne validée = entité + remplacement + MATÉRIALISÉE : occurrences de TEXTE OU libellé de
        // locuteur (plan-locuteurs-pseudo.md). Sinon une pseudonymisation de LIBELLÉ (occ texte=0)
        // manquerait dans la clé « qui est qui ».
        const aLibelle = (typeof aLibellePseudonymise === 'function') && aLibellePseudonymise(paire);
        if (!(paire.entite && paire.remplacement && (paire.occurrences > 0 || aLibelle))) continue;

        const pseudosLigne = pseudosDe(paire);
        // Variantes réellement portées par les LIBELLÉS correspondants. Indispensable pour une règle
        // label-only et pour le cas texte=primaire / locuteur=alternatif : la table « qui est qui » doit
        // alors contenir les deux correspondances réellement utilisées.
        const clesEntite = new Set(clesAlias(paire.entite));
        const utilisesLibelles = new Set();
        document.querySelectorAll('.ligloc.loc-anon[data-nomloc][data-locpseudo]').forEach(lig => {
            if (!clesAlias(lig.dataset.nomloc || '').some(k => clesEntite.has(k))) return;
            const dp = (lig.dataset.locpseudo || '').trim().toLowerCase();
            if (dp) utilisesLibelles.add(dp);
        });

        // Label-only (0 occurrence de TEXTE) : exporter la variante réellement choisie sur le libellé.
        // Repli primaire pour les anciens DOM marqués sans data-locpseudo exploitable.
        if (!(paire.occurrences > 0)) {
            const variantes = pseudosLigne.filter(p => utilisesLibelles.has(p.toLowerCase()));
            (variantes.length > 0 ? variantes : [paire.remplacement])
                .forEach(p => pousser(paire.entite, p, paire));
            continue;
        }

        if (pseudosLigne.length > 1) {
            // Multi-pseudo : exporter chaque variante RÉELLEMENT appliquée dans le texte OU au libellé.
            const utilises = new Set(utilisesLibelles);
            (paire.matchPositions || []).forEach(m => {
                if (m.isException || m.isNonTraite || m.isIncluded) return; // incluse : couverte par l'autre règle
                const dp = ((spansExport[m.start] && spansExport[m.start].dataset.pseudo) || '').toLowerCase();
                if (dp) utilises.add(dp);
            });
            const variantes = pseudosLigne.filter(p => utilises.has(p.toLowerCase()));
            // Si aucune variante propre n'a pu être détectée : n'exporter le primaire QUE si la ligne
            // n'est pas entièrement absorbée (sinon rien d'« appliqué » à consigner).
            if (variantes.length > 0) {
                variantes.forEach(p => pousser(paire.entite, p, paire));
            } else if (!estEntierementIncluse(paire)) {
                pousser(paire.entite, paire.remplacement, paire);
            }
        } else if (!estEntierementIncluse(paire)) {
            pousser(paire.entite, paire.remplacement, paire);
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
    
    if (!files || files.length === 0) {
        return;
    }
    
    // Lire tous les fichiers et les parser
    const allCorrespondances = [];
    let filesLoaded = 0;
    const totalFiles = files.length; 
    
    
    Array.from(files).forEach((file, fileIdx) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            filesLoaded++;
            
            try {
                const correspondances = JSON.parse(e.target.result);
                
                // Vérifier que c'est un tableau
                if (!Array.isArray(correspondances)) {
                    throw new Error("Le fichier n'est pas un tableau JSON valide");
                }
                
                // Valider la structure de chaque correspondance
                correspondances.forEach((corr, corrIdx) => {
                    if (!corr.entite_init || !corr.entite_pseudo) {
                        throw new Error("Chaque correspondance doit avoir 'entite_init' et 'entite_pseudo'");
                    }
                    allCorrespondances.push(corr);
                });
                
                
                // Quand tous les fichiers sont chargés, traiter les imports
                if (filesLoaded === totalFiles) {
                    // Contexte entretien : règles déjà validées (occurrences>0) + application au texte ouvert.
                    // NB : window.tabAnon = array ACTIF de l'entretien (≠ `tabAnon` nu de gestion_corpus.js).
                    traiterImportCorrespondances(allCorrespondances, {
                        reglesExistantes: (window.tabAnon || [])
                            .filter(p => p && p.entite && p.occurrences > 0)
                            .map(p => ({ entite: p.entite, remplacement: p.remplacement, remplacementAlt: p.remplacementAlt })),
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
        // Champ thematique OPTIONNEL (round-trip) : restauré s'il est présent, ignoré sinon.
        const themeImport = (corr.thematique || '').trim().toUpperCase();

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
            if (tabAnon[i].entite && cleEntite(tabAnon[i].entite) === cleEntite(entiteInit)) {
                idxLigneExistante = i;
                break;
            }
        }

        if (idxLigneExistante >= 0) {
            const ligne = tabAnon[idxLigneExistante];
            if (themeImport) ligne.thematique = themeImport;
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
                if (themeImport) ligne.thematique = themeImport;
                poserAlt(ligne);
                tabAnon.push(ligne);
            } else {
                tabAnon[idxLigneVide].entite = entiteInit;
                tabAnon[idxLigneVide].remplacement = entiePseudo;
                if (themeImport) tabAnon[idxLigneVide].thematique = themeImport;
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
            const pseudosImportes = [corr.entite_pseudo, corr.entite_pseudo_alt]
                .filter(Boolean).map(p => p.trim().toLowerCase());
            const memeEntite = tabAnon[i].entite && cleEntite(tabAnon[i].entite) === cleEntite(corr.entite_init);
            const contientPseudoImporte = pseudosDe(tabAnon[i]).some(p => pseudosImportes.includes(p.toLowerCase()));
            if (memeEntite && contientPseudoImporte && tabAnon[i].occurrences === 0) {

                // Appliquer l'anonymisation
                appliquerAnonymisationPour(i);

                // Désactiver l'édition si des occurrences ont été trouvées
                if (tabAnon[i].occurrences > 0) {
                    desactiverEditionLigne(i);
                    // Import au niveau ENTRETIEN → portée 'document' (local, ne remonte pas au corpus,
                    // §11ter). Une éventuelle divergence avec le corpus a déjà été résolue par le moteur
                    // de conflit ; à la réouverture, une entité réellement au corpus se naturalise en corpus.
                    tabAnon[i].portee = 'document';
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
        return;
    }

    
    // NB : on opère sur window.tabAnon = array ACTIF de l'entretien (celui que le tableau
    // affiche et que compterExceptions/appliquerAnonymisationPour lisent), PAS le `tabAnon` nu
    // (let de gestion_corpus.js, AUTRE binding non posé sur window). Indispensable pour que la
    // restauration .sonal soit cohérente avec l'affichage et la réapplication.

    // Si le tableau est vide (fichier anonymisé), initialiser avec des lignes vides
    if (donneeImportees.length === 0) {
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

    // Remplacer window.tabAnon complètement. Les règles et brouillons viennent d'anon-json ;
    // l'état de chaque occurrence vient, lui, des marqueurs du HTML chargé.
    window.tabAnon = donneeImportees;

    const resultat = reappliquerAnonymisationsSonal();

    // N'afficher qu'après la réindexation : les compteurs doivent déjà refléter le DOM chargé.
    affichTableauAnon();
    return resultat;
}

/**
 * Restaure les caches d'anonymisation depuis le DOM chargé.
 *
 * Malgré son nom historique, cette fonction ne « rejoue » plus matchPositions : start/end sont des
 * indices runtime rendus périmés par le compactage, la normalisation ou une édition du document.
 * Le HTML marqué porte l'état effectif par occurrence (pseudo réellement choisi, exception,
 * occurrence incluse). anon-json reste autoritaire pour les règles, les portées et les brouillons.
 *
 * Repli legacy : si anon-json annonce des occurrences traitées absentes du HTML, elles restent
 * explicitement « à traiter ». On avertit l'utilisateur au lieu de deviner à partir d'indices
 * potentiellement faux.
 *
 * @returns {{source:string, avertissementLegacy:boolean}}
 */
function reappliquerAnonymisationsSonal() {
    if (!Array.isArray(window.tabAnon)) {
        return { source: 'dom', avertissementLegacy: false };
    }

    // data-anon-nt est un marqueur runtime : repartir du DOM persistant avant de le recalculer.
    document.querySelectorAll('[data-anon-nt]').forEach(s => s.removeAttribute('data-anon-nt'));

    let etatPersistantManquant = false;

    window.tabAnon.forEach((paire, idxPaire) => {
        if (!paire || !paire.entite || !paire.entite.trim()) return;

        const anciennesPositions = Array.isArray(paire.matchPositions) ? paire.matchPositions : [];
        const nbTraiteAnnonce = anciennesPositions.length > 0
            ? anciennesPositions.filter(m => m && m.isNonTraite !== true).length
            : Math.max(0, Number(paire.occurrences) || 0);

        // Un brouillon appartient à anon-json mais ne doit jamais être détecté/appliqué tout seul.
        if ((paire.portee || 'corpus') === 'brouillon') {
            paire.matchPositions = [];
            paire.occurrences = 0;
            paire.indexCourant = 0;
            return;
        }

        // Lecture seule du DOM : reindexerMatchPositions classe les occurrences sans poser ni
        // retirer anon/anon-exception et conserve donc le data-pseudo réellement sauvegardé.
        reindexerMatchPositions(idxPaire);
        paire.occurrences = paire.matchPositions.length;
        paire.indexCourant = paire.occurrences > 0
            ? Math.min(Math.max(0, Number(paire.indexCourant) || 0), paire.occurrences - 1)
            : 0;

        const nbTraiteDansDom = paire.matchPositions.filter(m => m && m.isNonTraite !== true).length;
        if (nbTraiteAnnonce > nbTraiteDansDom) etatPersistantManquant = true;
    });

    if (typeof detecterLibellesASuggerer === 'function') detecterLibellesASuggerer();

    if (etatPersistantManquant) {
        const message = "Le fichier annonce des occurrences pseudonymisées qui ne sont pas marquées dans son HTML. Elles ont été laissées « à traiter » : vérifiez l'entretien avant tout export.";
        if (typeof dialog === 'function') dialog('Restauration de la pseudonymisation', message);
        else console.warn(message);
    }

    return { source: 'dom', avertissementLegacy: etatPersistantManquant };
}
