/**
 * Module d'affichage de la table d'anonymisation globale
 * Affiche toutes les combinaisons anonymisation du corpus avec les entretiens concernés
 */

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

    // Map pour tracker les paires (entité, pseudo) uniques
    const mapEntitePseudo = new Map();
    
    // Parcourir tous les entretiens et inventorier
    for (let i = 0; i < entretiens.length; i++) {
        const ent = entretiens[i];
        console.log(`[Entretien ${i}] ${ent.nom || 'Sans nom'}:`, ent.tabAnon ? `${ent.tabAnon.length} règle(s)` : 'Pas de tabAnon');
        
        if (!ent.tabAnon || ent.tabAnon.length === 0) {
            continue;
        }

        // Parcourir les règles d'anonymisation de cet entretien
        ent.tabAnon.forEach((regle, idx) => {
            console.log(`  [${idx}] ${regle.entite} → ${regle.remplacement}`);
            
            if (!regle.entite || !regle.remplacement) {
                return;
            }

            const entite = regle.entite.trim();
            const pseudo = regle.remplacement.trim();
            
            if (!entite || !pseudo) return;

            // Créer une clé unique
            const cle = `${entite}|${pseudo}`;
            
            // Si pas encore dans la map, ajouter
            if (!mapEntitePseudo.has(cle)) {
                mapEntitePseudo.set(cle, {
                    entite: entite,
                    remplacement: pseudo,
                    occurrences: 0,
                    indexCourant: 0,
                    matchPositions: []
                });
            }
        });
    }

    // Récupérer l'ancien tabAnon global pour préserver les entrées ajoutées manuellement
    // (qui ne sont pas encore dans un entretien local)
    const ancienTabAnon = await window.electronAPI.getAnon();
    if (ancienTabAnon && ancienTabAnon.length > 0) {
        for (const ancien of ancienTabAnon) {
            if (!ancien.entite || !ancien.remplacement) continue;
            const entite = ancien.entite.trim();
            const pseudo = ancien.remplacement.trim();
            if (!entite || !pseudo) continue;
            const cle = `${entite}|${pseudo}`;
            if (!mapEntitePseudo.has(cle)) {
                mapEntitePseudo.set(cle, {
                    entite: entite,
                    remplacement: pseudo,
                    occurrences: 0,
                    indexCourant: 0,
                    matchPositions: []
                });
            }
        }
    }

    // Convertir la map en tableau
    const newTabAnon = Array.from(mapEntitePseudo.values());
    
    // tri du tabAnon par ordre alphabétique des entités
    newTabAnon.sort((a, b) => a.entite.localeCompare(b.entite));

    console.log(`✅ TabAnon reconstitué : ${newTabAnon.length} paire(s) unique(s)`, newTabAnon);
    
    // Mettre à jour dans le main process
    await window.electronAPI.setAnon(newTabAnon);
}

/**
 * Vérifie l'état d'une seule entité et met à jour sa ligne dans le tableau
 * @param {string} entite - Entité à vérifier
 * @param {string} pseudo - Pseudonyme correspondant
 * @param {Array} tabEnt - Tableau des entretiens
 */
async function verifierEtAfficherEtatEntite(entite, pseudo, tabEnt) {
    try {
        // Afficher la barre de progression
        if (typeof wait === 'function') {
            wait(`Vérification de "${entite}" en cours...`);
        }
        
        // Vérifier pour chaque entretien
        const promessesVerification = tabEnt.map((ent, i) => 
            verifierEtatAnonymisation(i, entite, pseudo)
                .then(etat => ({
                    index: i,
                    nom: ent.nom,
                    id: ent.id,
                    etat
                }))
        );
        
        const resultats = await Promise.all(promessesVerification);
        
        const entretiensNonAnonymisee = [];
        const entretiensAnonymisee = [];
        const entretiensExclus = [];
        
        for (const res of resultats) {
            if (res.etat === 'anonymisee') {
                entretiensAnonymisee.push({ id: res.id, nom: res.nom, index: res.index });
            } else if (res.etat === 'non-anonymisee') {
                entretiensNonAnonymisee.push({ id: res.id, nom: res.nom, index: res.index });
            } else if (res.etat === 'exclue') {
                entretiensExclus.push({ id: res.id, nom: res.nom, index: res.index });
            }
        }
        
        // Fermer le dialogue d'attente
        if (typeof endWait === 'function') {
            endWait();
        }
        
        // Mettre à jour la ligne
        const anon = { entite, remplacement: pseudo };
        mettreAJourLigneAvecEtats(anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus);
        
        console.log(`✅ Vérification terminée pour "${entite}"`);
        
    } catch (error) {
        console.error("Erreur dans verifierEtAfficherEtatEntite():", error);
        if (typeof endWait === 'function') {
            endWait();
        }
    }
}

/**
 * Met à jour la ligne d'une entité avec les états d'anonymisation
 * @param {Object} anon - Paire {entite, remplacement}
 * @param {Array} entretiensNonAnonymisee - Entretiens non-anonymisés
 * @param {Array} entretiensAnonymisee - Entretiens anonymisés
 */
function mettreAJourLigneAvecEtats(anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus = []) {
    // Page dédiée : la vérification d'une entité s'affiche toujours dans la zone droite
    // (#fond_verif_anon), sous forme d'accordéons par entretien.
    const fondVerif = document.getElementById("fond_verif_anon");
    if (!fondVerif) return;
    // Mémoriser l'entité en cours de vérification pour le rafraîchissement automatique
    window._lastVerifiedAnon = { entite: anon.entite, pseudo: anon.remplacement };
    fondVerif.innerHTML = '';
    if (entretiensNonAnonymisee.length > 0 || entretiensAnonymisee.length > 0 || entretiensExclus.length > 0) {
        afficherOccurrencesEnAccordeon(fondVerif, anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus);
    } else {
        fondVerif.innerHTML = '<div style="padding:20px;color:#999;">Aucune occurrence trouvée.</div>';
    }
}

/**
 * Affiche les occurrences d'une entité dans une modale avec accordéons
 * @param {HTMLElement} tdEntretiens - Cellule du tableau où insérer la modale
 * @param {Object} anon - Paire {entite, remplacement}
 * @param {Array} entretiensNonAnonymisee - Entretiens non-anonymisés
 * @param {Array} entretiensAnonymisee - Entretiens anonymisés
 */
async function afficherOccurrencesEnAccordeon(tdEntretiens, anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus = []) {
    try {
        const tabEnt = await window.electronAPI.getEnt();

        // Conteneur principal de la modale
        const modale = document.createElement("div");
        modale.style.position = "relative";
        modale.style.backgroundColor = "white";
        modale.style.border = "1px solid #ddd";
        modale.style.borderRadius = "4px";
        modale.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        modale.style.overflow = "hidden";
        modale.style.display = "flex";
        modale.style.flexDirection = "column";
        modale.style.height = "500px";
        // Confiner les clics à la modale d'occurrences (évite de déclencher
        // d'éventuels handlers de clic des conteneurs parents).
        modale.addEventListener("click", e => e.stopPropagation());
        
        // Bouton de fermeture (haut droite)
        const btnClose = document.createElement("button");
        btnClose.innerHTML = "✖️";
        btnClose.className = "close";
        btnClose.style.position = "absolute";
        btnClose.style.top = "8px";
        btnClose.style.right = "18px";
        btnClose.style.zIndex = "100";
        btnClose.style.width = "30px";
        btnClose.style.height = "30px";
        btnClose.style.cursor = "pointer";
        btnClose.style.padding = "0";
        btnClose.style.display = "flex";
        btnClose.style.alignItems = "center";
        btnClose.style.justifyContent = "center";
        btnClose.style.transition = "all 0.2s";
        
        btnClose.addEventListener("click", () => {
            modale.remove();
        });
        modale.appendChild(btnClose);
        
        // Conteneur scrollable pour le contenu
        const scrollContainer = document.createElement("div");
        scrollContainer.style.overflowY = "auto";
        scrollContainer.style.overflowX = "hidden";
        scrollContainer.style.flex = "1";
        scrollContainer.style.paddingTop = "10px";
        scrollContainer.style.paddingBottom = "60px"; // espace pour le bouton sticky en bas
        
        // Titre
        const titre = document.createElement("div");
        titre.style.padding = "10px 12px";
        titre.style.fontWeight = "bold";
        titre.style.color = "#333";
        titre.style.fontSize = "14px";
        titre.style.borderBottom = "1px solid #eee";
        titre.innerHTML = `Occurrences de <strong>"${anon.entite}"</strong> → <strong>"${anon.remplacement}"</strong>`;
        scrollContainer.appendChild(titre);
        
        // Case à cocher globale
        const checkboxGlobaleDiv = document.createElement("div");
        checkboxGlobaleDiv.style.padding = "10px 12px";
        checkboxGlobaleDiv.style.borderBottom = "1px solid #eee";
        checkboxGlobaleDiv.style.display = "flex";
        checkboxGlobaleDiv.style.alignItems = "center";
        checkboxGlobaleDiv.style.gap = "8px";
        checkboxGlobaleDiv.style.backgroundColor = "#f9f9f9";
        
        const checkboxGlobale = document.createElement("input");
        checkboxGlobale.type = "checkbox";
        checkboxGlobale.style.cursor = "pointer";
        checkboxGlobale.style.width = "18px";
        checkboxGlobale.style.height = "18px";
        checkboxGlobale.id = "checkbox-globale-" + Date.now(); // ID unique pour la modale
        
        const labelGlobale = document.createElement("label");
        labelGlobale.textContent = "Affecter le pseudonyme à toutes les occurrences non traitées";
        labelGlobale.style.cursor = "pointer";
        labelGlobale.style.fontWeight = "600";
        labelGlobale.style.color = "#1565c0";
        labelGlobale.style.fontSize = "13px";
        labelGlobale.style.margin = "0";
        
        checkboxGlobaleDiv.appendChild(checkboxGlobale);
        checkboxGlobaleDiv.appendChild(labelGlobale);
        scrollContainer.appendChild(checkboxGlobaleDiv);
        
        modale.appendChild(scrollContainer);
        
        // Récupérer toutes les occurrences
        const tousLesEntretiens = [...entretiensNonAnonymisee, ...entretiensAnonymisee, ...entretiensExclus];
        const occurrencesParEntretien = {};
        
        for (const ent of tousLesEntretiens) {
            const occurrences = await trouverOccurrencesAvecContexte(
                ent.index, 
                anon.entite, 
                anon.remplacement
            );
            const entIdStr = String(ent.id); // Utiliser une clé string pour la cohérence
            occurrencesParEntretien[entIdStr] = {
                nom: ent.nom,
                index: ent.index,
                anonymisee: entretiensAnonymisee.some(e => e.id === ent.id),
                occurrences: occurrences
            };
        }
        
        // Créer les accordéons pour chaque entretien
        for (const ent of tousLesEntretiens) {
            const entIdStr = String(ent.id);
            const entData = occurrencesParEntretien[entIdStr];
            if (entData && entData.occurrences.length > 0) {
                const accordeon = creerAccordeonEntretien(
                    entIdStr,
                    entData.nom,
                    entData.index,
                    entData.anonymisee,
                    entData.occurrences,
                    anon
                );
                scrollContainer.appendChild(accordeon);
            }
        }
        
        // Ajouter un gestionnaire global pour la checkbox globale
        checkboxGlobale.addEventListener("change", () => {
            const tousLesAccordeons = scrollContainer.querySelectorAll(".accordion-entretien");
            for (const accordeon of tousLesAccordeons) {
                const checkboxEnt = accordeon._checkboxEntretien;
                const checkboxesOcc = accordeon._checkboxesOccurrences;
                
                if (checkboxEnt) {
                    checkboxEnt.checked = checkboxGlobale.checked;
                }
                if (checkboxesOcc) {
                    checkboxesOcc.forEach(cb => {
                        cb.checked = checkboxGlobale.checked;
                        cb.dispatchEvent(new Event('change'));
                    });
                }
                if (accordeon._mettreAJourBadges) {
                    accordeon._mettreAJourBadges();
                }
            }
        });
        
        // Bouton Valider (sticky en bas)
        const btnValider = document.createElement("button");
        btnValider.textContent = "Valider";
        btnValider.style.position = "absolute";
        btnValider.style.bottom = "0";
        btnValider.style.left = "0";
        btnValider.style.right = "0";
        //btnValider.style.width = "100%";
        btnValider.style.padding = "12px";
        btnValider.classList.add("btn",  "btn-primary")
        btnValider.style.transition = "all 0.2s";
        
        btnValider.addEventListener("click", async () => {
            await validerOccurrencesSelectionnees(scrollContainer, occurrencesParEntretien, anon);
            modale.remove();
            // Rafraîchir la cellule du tableau avec l'état réel après sauvegarde
            const tabEntFresh = await window.electronAPI.getEnt();
            await verifierEtAfficherEtatEntite(anon.entite, anon.remplacement, tabEntFresh);
        });
        modale.appendChild(btnValider);
        
        tdEntretiens.appendChild(modale);
        
    } catch (error) {
        console.error("Erreur dans afficherOccurrencesEnAccordeon():", error);
        tdEntretiens.textContent = "Erreur lors du chargement";
        tdEntretiens.style.color = "#d32f2f";
    }
}

/**
 * Crée un accordéon pour un entretien
 * @param {string} entId - ID de l'entretien
 * @param {string} entNom - Nom de l'entretien
 * @param {number} entIndex - Index de l'entretien
 * @param {boolean} anonymisee - Si l'entretien est déjà anonymisé
 * @param {Array} occurrences - Tableau des occurrences
 * @param {Object} anon - Paire {entite, remplacement}
 * @returns {HTMLElement}
 */
function creerAccordeonEntretien(entId, entNom, entIndex, anonymisee, occurrences, anon) {
    const accordeon = document.createElement("div");
    accordeon.className = "accordion-entretien";
    accordeon.style.borderBottom = "1px solid #eee";
    accordeon.style.marginLeft = "16px";
    // Marqueurs pour la navigation entretien -> corpus
    accordeon.dataset.entIndex = entIndex;
    accordeon.dataset.entId = entId;

    // Calcul de l'état visuel : bleu si tout traité (anonymisé ou exclu), orange sinon
    // On ne tient PAS compte de anonymisee : des variantes de casse peuvent rester non traitées
    const toutEstTraite = occurrences.length > 0 && occurrences.every(occ => occ.applique || occ.exclue);
    const bgCouleur = toutEstTraite ? "#e3f2fd" : "#fff3e0";
    const labelCouleur = toutEstTraite ? "#15c095" : "#f57c00";

    // En-tête de l'accordéon
    const header = document.createElement("div");
    header.style.padding = "10px 12px";
    header.style.backgroundColor = bgCouleur;
    header.style.cursor = "pointer";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";
    header.style.userSelect = "none";
    header.style.transition = "background-color 0.2s";
    
    // Checkbox de l'entretien
    const checkboxEnt = document.createElement("input");
    checkboxEnt.type = "checkbox";
    checkboxEnt.style.cursor = "pointer";
    checkboxEnt.style.width = "18px";
    checkboxEnt.style.height = "18px";
    checkboxEnt.checked = toutEstTraite;
    checkboxEnt.dataset.entId = entId;
    
    // Label de l'entretien
    const label = document.createElement("label");
    label.textContent = entNom;
    label.style.cursor = "pointer";
    label.style.fontWeight = "600";
    label.style.color = labelCouleur;
    label.style.margin = "0";
    label.style.flex = "1";

    // Compteurs d'occurrences (bleu = anonymisé, orange = exception, rouge = non traité)
    const nbApplique  = occurrences.filter(o => o.applique && !o.exclue).length;
    const nbExclue    = occurrences.filter(o => o.exclue).length;
    const nbNonTraite = occurrences.filter(o => !o.applique && !o.exclue).length;

    const divCompteurs = document.createElement("div");
    divCompteurs.style.display = "flex";
    divCompteurs.style.gap = "4px";
    divCompteurs.style.alignItems = "center";
    divCompteurs.style.flexShrink = "0";

    const creerBadge = (count, color, title) => {
        if (count === 0) return null;
        const badge = document.createElement("span");
        badge.textContent = count;
        badge.title = title;
        badge.style.backgroundColor = color;
        badge.style.color = "white";
        badge.style.borderRadius = "50%";
        badge.style.width = "20px";
        badge.style.height = "20px";
        badge.style.fontSize = "11px";
        badge.style.fontWeight = "bold";
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.flexShrink = "0";
        return badge;
    };
    [
        [nbApplique,  "#15c095", "Occurrence(s) anonymisée(s)"],
        [nbExclue,    "#555", "Occurrence(s) exclue(s)"],
        [nbNonTraite, "#ff9800", "Occurrence(s) non traitée(s)"]
    ].forEach(([count, color, title]) => {
        const badge = creerBadge(count, color, title);
        if (badge) divCompteurs.appendChild(badge);
    });

    // Flèche d'expansion
    const fleche = document.createElement("span");
    fleche.innerHTML = "▼";
    fleche.style.fontSize = "12px";
    fleche.style.color = "#666";
    fleche.style.transition = "transform 0.2s";
    fleche.style.display = "inline-block";
    fleche.style.marginLeft = "4px";
    
    header.appendChild(checkboxEnt);
    header.appendChild(label);
    header.appendChild(divCompteurs);
    header.appendChild(fleche);

    // Contenu de l'accordéon (liste des occurrences)
    const contenu = document.createElement("div");
    contenu.style.display = "none";
    contenu.style.padding = "10px 12px";
    contenu.style.backgroundColor = "#fafafa";
    
    // Référence vers toutes les occurrences de cet accordéon (pour recalculer les badges)
    const occurrencesRefs = [];

    const mettreAJourBadges = () => {
        let nbApp = 0, nbExc = 0, nbNon = 0;
        occurrencesRefs.forEach(({checkboxOcc, btnException}) => {
            if (btnException._pendingExclusion) nbExc++;
            else if (checkboxOcc.checked) nbApp++;
            else nbNon++;
        });
        divCompteurs.innerHTML = "";
        [
            [nbApp,  "#15c095", "Occurrence(s) anonymisée(s)"],
            [nbExc,  "#555", "Occurrence(s) exclue(s)"],
            [nbNon,  "#ff9800", "Occurrence(s) non traitée(s)"]
        ].forEach(([count, color, title]) => {
            const badge = creerBadge(count, color, title);
            if (badge) divCompteurs.appendChild(badge);
        });
    };

    // Ajouter les occurrences
    for (let i = 0; i < occurrences.length; i++) {
        const occ = occurrences[i];

        const occDiv = document.createElement("div");
        occDiv.style.marginBottom = "10px";
        occDiv.style.paddingBottom = "8px";
        occDiv.style.marginLeft = "25px";
        occDiv.style.borderBottom = i === occurrences.length - 1 ? "none" : "1px solid #ddd";
        occDiv.style.display = "flex";
        occDiv.style.alignItems = "flex-start";
        occDiv.style.gap = "8px";
        // Marqueur pour la navigation entretien -> corpus (retrouver l'occurrence cible)
        if (occ.spanId) occDiv.dataset.occSpanid = occ.spanId;
        
        // Checkbox pour l'occurrence
        const checkboxOcc = document.createElement("input");
        checkboxOcc.type = "checkbox";
        checkboxOcc.checked = occ.exclue ? false : occ.applique;
        checkboxOcc.style.cursor = "pointer";
        checkboxOcc.style.width = "16px";
        checkboxOcc.style.height = "16px";
        checkboxOcc.style.marginTop = "2px";
        checkboxOcc.style.flexShrink = "0";
        checkboxOcc.dataset.occIndex = i;
        checkboxOcc.dataset.entId = entId;

        // Icône d'exception (remplace la checkbox à gauche quand exception active)
        const spanExceptionToggle = document.createElement("span");
        spanExceptionToggle.textContent = "🚫";
        spanExceptionToggle.title = "Retirer l'exception";
        spanExceptionToggle.style.display = "none";
        spanExceptionToggle.style.fontSize = "15px";
        spanExceptionToggle.style.width = "16px";
        spanExceptionToggle.style.cursor = "pointer";
        spanExceptionToggle.style.flexShrink = "0";
        spanExceptionToggle.style.marginTop = "2px";
        spanExceptionToggle.style.lineHeight = "1";
        
        // Texte avec contexte
        const texteDiv = document.createElement("div");
        texteDiv.style.flex = "1";
        texteDiv.style.fontSize = "13px";
        texteDiv.style.color = occ.exclue ? "#aaa" : "#555";
        texteDiv.style.lineHeight = "1.4";
        texteDiv.style.fontFamily = "monospace";
        if (occ.exclue) {
            texteDiv.style.fontStyle = "italic";
            occDiv.style.backgroundColor = "#f5f5f5";
            occDiv.style.borderRadius = "4px";
            occDiv.title = "Occurrence explicitement exclue de l'anonymisation — cliquer sur 🚫 pour réactiver";
        }
        
        const contextAvant = occ.contextAvant ? `<span style="color:${occ.exclue ? '#bbb' : '#999'};">${escapeHtml(occ.contextAvant)}</span>` : '';
        const entiteHtml = `<strong style="font-weight:bold;padding:2px 2px; border-radius:2px;">${escapeHtml(occ.entite)}</strong>`;
        const pseudoHtml = occ.applique ? `<span class="pseudo">[${escapeHtml(anon.remplacement)}]</span>` : '';
        const contextApres = occ.contextApres ? `<span style="color:${occ.exclue ? '#bbb' : '#999'};">${escapeHtml(occ.contextApres)}</span>` : '';
        
        texteDiv.innerHTML = `${contextAvant}${entiteHtml}${pseudoHtml}${contextApres}`;

        const mettreAJourTexteOcc = () => {
            const exclu = btnException._pendingExclusion;
            const checked = checkboxOcc.checked;
            const ctxColor = exclu ? '#bbb' : '#999';
            const cAvant = occ.contextAvant ? `<span style="color:${ctxColor};">${escapeHtml(occ.contextAvant)}</span>` : '';
            const eHtml = `<strong style="font-weight:bold;padding:2px 2px; border-radius:2px;">${escapeHtml(occ.entite)}</strong>`;
            const pHtml = checked && !exclu ? `<span class="pseudo">[${escapeHtml(anon.remplacement)}]</span>` : '';
            const cApres = occ.contextApres ? `<span style="color:${ctxColor};">${escapeHtml(occ.contextApres)}</span>` : '';
            texteDiv.innerHTML = `${cAvant}${eHtml}${pHtml}${cApres}`;
        };
        
        // Bouton exception 🚫 (droite — visible uniquement quand case cochée, active l'exception)
        const btnException = document.createElement("button");
        btnException.textContent = "🚫";
        btnException.title = "Marquer comme exception (ne pas anonymiser)";
        btnException.style.border = "none";
        btnException.style.background = "none";
        btnException.style.padding = "0 2px";
        btnException.style.fontSize = "13px";
        btnException.style.lineHeight = "1";
        btnException.style.flexShrink = "0";
        btnException.style.alignSelf = "flex-start";
        btnException.style.marginTop = "1px";
        btnException._pendingExclusion = occ.exclue;

        const appliquerEtatException = (exclu) => {
            if (exclu) {
                texteDiv.style.color = "#aaa";
                texteDiv.style.fontStyle = "italic";
                occDiv.style.backgroundColor = "#f5f5f5";
                occDiv.style.borderRadius = "4px";
            } else {
                texteDiv.style.color = occ.exclue ? "#aaa" : "#555";
                texteDiv.style.fontStyle = occ.exclue ? "italic" : "normal";
                occDiv.style.backgroundColor = "";
            }
        };

        const updateBtnExceptionState = () => {
            if (btnException._pendingExclusion) {
                // Exception active : icône 🚫 à gauche, checkbox et bouton droit cachés
                checkboxOcc.style.display = "none";
                spanExceptionToggle.style.display = "inline";
                btnException.style.display = "none";
            } else if (checkboxOcc.checked) {
                // Case cochée : bouton droit disponible (ghost)
                checkboxOcc.style.display = "";
                spanExceptionToggle.style.display = "none";
                btnException.style.display = "";
                btnException.style.opacity = "0.35";
                btnException.style.pointerEvents = "auto";
                btnException.style.cursor = "pointer";
            } else {
                // Case décochée : bouton droit désactivé
                checkboxOcc.style.display = "";
                spanExceptionToggle.style.display = "none";
                btnException.style.display = "";
                btnException.style.opacity = "0.1";
                btnException.style.pointerEvents = "none";
                btnException.style.cursor = "default";
            }
        };
        updateBtnExceptionState();

        // Clic sur l'icône gauche → retire l'exception
        spanExceptionToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            btnException._pendingExclusion = false;
            appliquerEtatException(false);
            updateBtnExceptionState();
            mettreAJourTexteOcc();
            mettreAJourBadges();
        });

        // Clic sur le bouton droit → active l'exception
        btnException.addEventListener("click", (e) => {
            e.stopPropagation();
            btnException._pendingExclusion = true;
            checkboxOcc.checked = false;
            appliquerEtatException(true);
            updateBtnExceptionState();
            mettreAJourTexteOcc();
            mettreAJourBadges();
        });

        checkboxOcc.addEventListener("change", () => {
            updateBtnExceptionState();
            mettreAJourTexteOcc();
            mettreAJourBadges();
        });

        // Bouton ↗ : ouvre l'entretien sur le segment de cette occurrence
        const btnNav = document.createElement("button");
        btnNav.textContent = "↗";
        btnNav.title = "Aller à ce segment dans l'entretien";
        btnNav.style.border = "none";
        btnNav.style.background = "none";
        btnNav.style.padding = "0 2px";
        btnNav.style.fontSize = "14px";
        btnNav.style.lineHeight = "1";
        btnNav.style.flexShrink = "0";
        btnNav.style.alignSelf = "flex-start";
        btnNav.style.marginTop = "1px";
        btnNav.style.cursor = "pointer";
        btnNav.style.color = "#1976d2";
        btnNav.addEventListener("click", async (e) => {
            e.stopPropagation();
            try {
                // Mettre à jour l'entretien courant dans main avant l'ouverture
                // (le renderer de la fenêtre d'édition lit ent_cur via getEntCur).
                await window.electronAPI.setEntCur(entIndex);
                await window.electronAPI.editerEntretien(entIndex, {
                    entite: anon.entite,
                    pseudo: anon.remplacement,
                    spanId: occ.spanId
                });
            } catch (err) {
                console.error("Erreur lors de l'ouverture de l'entretien:", err);
            }
        });

        occDiv.appendChild(checkboxOcc);
        occDiv.appendChild(spanExceptionToggle);
        occDiv.appendChild(texteDiv);
        occDiv.appendChild(btnException);
        occDiv.appendChild(btnNav);

        // Stocker les references pour la validation
        checkboxOcc._occurrence = occ;
        checkboxOcc._entIndex = entIndex;
        checkboxOcc._anon = anon;
        checkboxOcc._btnException = btnException;
        occurrencesRefs.push({ checkboxOcc, btnException });

        contenu.appendChild(occDiv);
    }
    
    accordeon.appendChild(header);
    accordeon.appendChild(contenu);
    
    // Stopper la propagation des clics pour éviter de déclencher d'éventuels handlers parents
    accordeon.addEventListener("click", (e) => e.stopPropagation());

    // Événement click sur le header pour ouvrir/fermer
    header.addEventListener("click", (e) => {
        // Ne pas déclencher si on clique sur la checkbox
        if (e.target !== checkboxEnt && !checkboxEnt.contains(e.target)) {
            contenu.style.display = contenu.style.display === "none" ? "block" : "none";
            fleche.style.transform = contenu.style.display === "none" ? "rotate(0deg)" : "rotate(180deg)";
        }
    });
    
    // Gestion des checkboxes
    checkboxEnt.addEventListener("change", () => {
        const allCheckboxesOcc = contenu.querySelectorAll('input[type="checkbox"][data-occ-index]');
        allCheckboxesOcc.forEach(cb => {
            cb.checked = checkboxEnt.checked;
            cb.dispatchEvent(new Event('change'));
        });
    });
    
    // Stocker les checkboxes pour la validation
    accordeon._checkboxEntretien = checkboxEnt;
    accordeon._checkboxesOccurrences = contenu.querySelectorAll('input[type="checkbox"][data-occ-index]');
    accordeon._mettreAJourBadges = mettreAJourBadges;
    
    return accordeon;
}

/**
 * Échappe les caractères HTML
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Trouve les occurrences d'une entité dans un entretien avec contexte
 * Cherche AUSSI les occurrences déjà pseudonymisées (avec data-pseudo)
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité à chercher
 * @param {string} pseudo - Pseudonyme (pour vérifier si appliqué)
 * @returns {Promise<Array>} Tableau des occurrences avec contexte
 */
async function trouverOccurrencesAvecContexte(indexEnt, entite, pseudo) {
    try {
        const htmlContent = await window.electronAPI.getHtml(indexEnt);
        
        if (!htmlContent) {
            return [];
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        return trouverOccurrencesDansDoc(tempDiv, entite, pseudo);

    } catch (error) {
        console.error("Erreur dans trouverOccurrencesAvecContexte():", error);
        return [];
    }
}

/**
 * Cœur de la détection d'occurrences, opérant sur un document HTML DÉJÀ parsé.
 * Extrait de trouverOccurrencesAvecContexte pour permettre le scan « passe unique »
 * du corpus (§4 du plan) : un seul parse HTML par entretien, réutilisé pour toutes
 * les paires, au lieu d'un fetch+parse par (entité × entretien).
 * @param {HTMLElement} tempDiv - racine DOM contenant le HTML de l'entretien
 * @param {string} entite - entité à chercher
 * @param {string} pseudo - pseudonyme (pour détecter l'application)
 * @returns {Array} occurrences (mêmes objets {entite, contextAvant, contextApres, applique, exclue, spanId})
 */
function trouverOccurrencesDansDoc(tempDiv, entite, pseudo) {
    try {
        const occurrences = [];
        // Insensible à la casse ('i') + tous les alias « / » de l'entité (alternance échappée).
        const regexEntite = construireRegexEntite(entite, 'gi');
        if (!regexEntite) {
            return [];
        }
        
        // Ensemble des spans déjà traités (pour éviter les doublons)
        const spansTraites = new Set();
        
        // Parcourir tous les spans avec data-rk
        const allSpans = Array.from(tempDiv.querySelectorAll('[data-rk]'));
        
        for (const span of allSpans) {
            const spanId = span.dataset.rk;
            
            // Sauter les spans debsel avec ce pseudo : ils seront traités dans la 2e passe
            // avec le contexte reconstruit depuis les siblings.
            if (span.classList.contains('debsel') && span.dataset.pseudo === pseudo) {
                continue;
            }
            
            // === CHERCHER L'ENTITÉ ORIGINALE (NON PSEUDONYMISÉE) ===
            const texteSpan = span.textContent;
            let match;
            regexEntite.lastIndex = 0;
            
            while ((match = regexEntite.exec(texteSpan)) !== null) {
                const contextAvantStart = Math.max(0, match.index - 40);
                const contextAvantEnd = match.index;
                const contextApresStart = match.index + match[0].length;
                const contextApresEnd = Math.min(texteSpan.length, contextApresStart + 40);
                
                let contextAvant = texteSpan.substring(contextAvantStart, contextAvantEnd).trim();
                let contextApres = texteSpan.substring(contextApresStart, contextApresEnd).trim();
                
                // Si le contexte est vide (entité en début/fin de span), chercher dans les siblings
                if (!contextAvant && span.previousSibling) {
                    const textePrev = (span.previousSibling.textContent || '').trimEnd();
                    contextAvant = '...' + textePrev.slice(-40).trimStart();
                } else if (contextAvantStart > 0 && contextAvant.length > 0) {
                    contextAvant = '...' + contextAvant;
                }
                
                if (!contextApres && span.nextSibling) {
                    const texteNext = (span.nextSibling.textContent || '').trimStart();
                    contextApres = texteNext.slice(0, 40).trimEnd() + '...';
                } else if (contextApresEnd < texteSpan.length && contextApres.length > 0) {
                    contextApres = contextApres + '...';
                }
                
                // Vérifier si le pseudo a déjà été appliqué, ou si l'occurrence est explicitement exclue
                const applique = span.classList.contains('debsel') && span.dataset.pseudo === pseudo;
                const exclue = span.classList.contains('anon-exception');
                
                occurrences.push({
                    entite: match[0],
                    contextAvant: contextAvant,
                    contextApres: contextApres,
                    applique: applique,
                    exclue: exclue,
                    spanId: spanId
                });
                
                spansTraites.add(spanId);
            }
        }
        
        // === CHERCHER LES OCCURRENCES DÉJÀ PSEUDONYMISÉES ===
        // Structure post-pseudo : [...] [debsel] [anon]* [finsel] [...]
        // On reconstitue le contexte depuis le parent commun : on accumule le texte
        // de tous les enfants avant le debsel, et après le finsel.
        const spansPseudoDebsel = Array.from(tempDiv.querySelectorAll(`[data-pseudo="${pseudo}"].debsel`));
        
        for (const spanDebsel of spansPseudoDebsel) {
            const spanId = spanDebsel.dataset.rk;
            if (spansTraites.has(spanId)) continue;
            
            // Trouver le finsel (peut être debsel lui-même si entité 1 mot)
            let finselSpan = spanDebsel;
            if (!spanDebsel.classList.contains('finsel')) {
                let sib = spanDebsel.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && sib.dataset && sib.dataset.pseudo === pseudo
                        && sib.classList.contains('finsel')) {
                        finselSpan = sib;
                        break;
                    }
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && !sib.classList.contains('anon')
                        && (sib.textContent || '').trim() !== '') {
                        break;
                    }
                    sib = sib.nextSibling;
                }
            }
            
            // Stratégie : reconstruire tout le texte du parent en 3 phases
            // (avant / entité / après), puis si le contexte avant/après est trop court,
            // remonter au grand-parent pour enrichir.
            const collectContext = (startNode, direction) => {
                // direction = 'before' (remonter) ou 'after' (descendre)
                let parts = [];
                let len = 0;
                let node = direction === 'before' ? startNode.previousSibling : startNode.nextSibling;
                
                while (node && len < 60) {
                    const t = node.textContent || '';
                    if (t) {
                        if (direction === 'before') parts.unshift(t);
                        else parts.push(t);
                        len += t.length;
                    }
                    node = direction === 'before' ? node.previousSibling : node.nextSibling;
                }
                
                // Si contexte insuffisant, remonter au parent et continuer
                if (len < 30 && startNode.parentNode) {
                    const parentNode = startNode.parentNode;
                    let parentSib = direction === 'before' ? parentNode.previousSibling : parentNode.nextSibling;
                    while (parentSib && len < 60) {
                        const t = parentSib.textContent || '';
                        if (t) {
                            if (direction === 'before') parts.unshift(t);
                            else parts.push(t);
                            len += t.length;
                        }
                        parentSib = direction === 'before' ? parentSib.previousSibling : parentSib.nextSibling;
                    }
                }
                
                return parts.join('');
            };
            
            // Texte de l'entité (debsel → finsel)
            let entityText = '';
            let cur = spanDebsel;
            while (cur) {
                entityText += cur.textContent || '';
                if (cur === finselSpan) break;
                cur = cur.nextSibling;
            }
            
            const rawAvant = collectContext(spanDebsel, 'before');
            const rawApres = collectContext(finselSpan, 'after');
            
            const contextAvant = rawAvant.length > 40
                ? '...' + rawAvant.slice(-40).trimStart()
                : rawAvant;
            const contextApres = rawApres.length > 40
                ? rawApres.slice(0, 40).trimEnd() + '...'
                : rawApres;
            
            occurrences.push({
                entite: entityText.trim(),
                contextAvant: contextAvant,
                contextApres: contextApres,
                applique: true,
                spanId: spanId
            });
            
            spansTraites.add(spanId);
        }
        
        // === 3ÈME PASSE : entités multi-mots NON TRAITÉES ===
        // La regex du 1er pass cherche dans span.textContent de chaque span individuel
        // et ne peut pas trouver une entité multi-mots répartie sur plusieurs spans
        // (structure un-mot-par-span après cleanHTML). On fait ici un parcours token par token.
        const tokensEntite = entite.trim().split(/[\s\u00A0]+/).filter(t => t);
        if (tokensEntite.length > 1) {
            const spansFiltrés = allSpans.filter(s => s.textContent.trim() !== '');
            for (let i = 0; i <= spansFiltrés.length - tokensEntite.length; i++) {
                const estMatch = tokensEntite.every((tok, j) => spansFiltrés[i + j].textContent.trim() === tok);
                if (!estMatch) continue;
                const firstSpan = spansFiltrés[i];
                const spanId = firstSpan.dataset.rk;
                if (spansTraites.has(spanId)) continue; // déjà compté par une autre passe
                const applique = firstSpan.classList.contains('debsel') && firstSpan.dataset.pseudo === pseudo;
                const exclue   = firstSpan.classList.contains('anon-exception');
                const spansBefore = spansFiltrés.slice(Math.max(0, i - 5), i).map(s => s.textContent).join(' ');
                const spansAfter  = spansFiltrés.slice(i + tokensEntite.length, i + tokensEntite.length + 5).map(s => s.textContent).join(' ');
                occurrences.push({
                    entite: tokensEntite.join(' '),
                    contextAvant: spansBefore ? '...' + spansBefore.slice(-40) : '',
                    contextApres: spansAfter  ? spansAfter.slice(0, 40) + '...'  : '',
                    applique, exclue, spanId
                });
                spansTraites.add(spanId);
            }
        }

        return occurrences;

    } catch (error) {
        console.error("Erreur dans trouverOccurrencesDansDoc():", error);
        return [];
    }
}

/**
 * Pré-filtre du scan corpus : indique si l'entité PEUT figurer dans un entretien,
 * en testant si au moins un de ses alias (séparés par « / ») a tous ses tokens
 * présents dans l'ensemble des mots de l'entretien (insensible à la casse).
 * Conservateur : ne doit jamais écarter un entretien qui contient réellement l'entité
 * (les spans déjà pseudonymisés/exclus conservent le mot original dans leur textContent).
 * @param {string} entite
 * @param {Set<string>} motsPresents - mots (lowercased) présents dans l'entretien
 * @returns {boolean}
 */
function entitePeutEtrePresente(entite, motsPresents) {
    return entite.split('/').some(alias => {
        const tokens = alias.trim().toLowerCase().split(/[\s ]+/).filter(t => t);
        return tokens.length > 0 && tokens.every(t => motsPresents.has(t));
    });
}

/**
 * Scan « état » du corpus (Phase 2, §4) : pour chaque paire (entité, pseudo),
 * agrège sur tous les entretiens le nombre d'occurrences anonymisées / exceptions /
 * non traitées, et le nombre d'entretiens où l'entité apparaît.
 * Optimisé par la passe unique : un seul parse HTML par entretien + pré-filtre par Set de mots.
 * Met à jour la barre de progression globale si disponible.
 * @param {Array} anonValides - paires {entite, remplacement}
 * @param {Array} tabEnt - entretiens (l'index dans ce tableau = index getHtml)
 * @returns {Promise<Map<string,{nbAnon:number,nbExc:number,nbNon:number,nbEntretiens:number}>>}
 *          clé = `${entite.trim()}|${remplacement.trim()}`
 */
async function scannerEtatCorpus(anonValides, tabEnt) {
    const stats = new Map();
    for (const a of anonValides) {
        stats.set(`${a.entite.trim()}|${a.remplacement.trim()}`,
                  { nbAnon: 0, nbExc: 0, nbNon: 0, nbEntretiens: 0 });
    }

    const n = tabEnt.length;
    for (let i = 0; i < n; i++) {
        let html = null;
        try { html = await window.electronAPI.getHtml(i); } catch (e) { html = null; }

        if (typeof updateProgressBar === 'function') {
            updateProgressBar(Math.round(((i + 1) / n) * 100));
        }

        if (html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Pré-filtre : un seul Set de mots pour tout l'entretien.
            const motsPresents = new Set();
            tempDiv.querySelectorAll('[data-rk]').forEach(s => {
                const t = s.textContent.trim();
                if (t) motsPresents.add(t.toLowerCase());
            });

            for (const a of anonValides) {
                const entite = a.entite.trim();
                const pseudo = a.remplacement.trim();
                if (!entitePeutEtrePresente(entite, motsPresents)) continue;

                const occ = trouverOccurrencesDansDoc(tempDiv, entite, pseudo);
                if (occ.length === 0) continue;

                const st = stats.get(`${entite}|${pseudo}`);
                if (!st) continue;
                st.nbAnon += occ.filter(o => o.applique && !o.exclue).length;
                st.nbExc  += occ.filter(o => o.exclue).length;
                st.nbNon  += occ.filter(o => !o.applique && !o.exclue).length;
                st.nbEntretiens += 1;
            }
        }

        // Laisser respirer l'UI (rendu de la barre de progression) périodiquement.
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }

    return stats;
}

/**
 * Retire le pseudo de certaines occurrences spécifiques dans un entretien
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesARetirer - Tableau des occurrences avec spanId et data-pseudo
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function retirerPseudoOccurrencesSpecifiques(indexEnt, occurrencesARetirer, anon) {
    try {
        console.log(`Retrait du pseudo pour ${occurrencesARetirer.length} occurrence(s) dans l'entretien ${indexEnt}`);
        
        // Récupérer l'HTML de l'entretien
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        
        if (!htmlContent) {
            dialog('Message', 'Impossible de récupérer le contenu de l\'entretien.');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Créer un set des spanIds à traiter
        const spanIdsARetirer = new Set(occurrencesARetirer.map(occ => occ.spanId));

        let nbRetraits = 0;

        // Parcourir tous les spans marqués debsel (début du pseudo)
        const debselSpans = Array.from(tempDiv.querySelectorAll('[data-pseudo].debsel'));

        for (const debselSpan of debselSpans) {
            const spanId = debselSpan.dataset.rk;
            
            // Vérifier si ce span doit être retiré
            if (!spanIdsARetirer.has(spanId)) {
                continue;
            }

            // Vérifier que c'est bien le pseudo qu'on veut retirer
            if (debselSpan.dataset.pseudo !== anon.remplacement) {
                continue;
            }

            // Trouver le finsel correspondant
            let finselSpan = debselSpan;
            if (!debselSpan.classList.contains('finsel')) {
                let sib = debselSpan.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && sib.dataset && sib.dataset.pseudo === anon.remplacement
                        && sib.classList.contains('finsel')) {
                        finselSpan = sib;
                        break;
                    }
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && !sib.classList.contains('anon')) {
                        break;
                    }
                    sib = sib.nextSibling;
                }
            }

            // Reconstituer le texte original (fusion de debsel → finsel)
            let texteOriginal = '';
            let cur = debselSpan;
            while (cur) {
                texteOriginal += cur.textContent || '';
                if (cur === finselSpan) break;
                cur = cur.nextSibling;
            }

            // Créer un span neutre avec le texte original
            const spanContexte = document.createElement('span');
            Array.from(debselSpan.attributes).forEach(attr => {
                if (attr.name !== 'data-pseudo' && attr.name !== 'data-rk') {
                    spanContexte.setAttribute(attr.name, attr.value);
                }
            });
            spanContexte.dataset.rk = debselSpan.dataset.rk;
            spanContexte.textContent = texteOriginal;
            
            // Retirer les classes de pseudonymisation (sauf anon-exception qui marque l'exclusion)
            ['anon', 'debsel', 'finsel'].forEach(c => {
                spanContexte.classList.remove(c);
            });
            spanContexte.classList.add('anon-exception'); // empêche la ré-application au rechargement
            delete spanContexte.dataset.pseudo;

            // Remplacer debselSpan par le nouveau span et supprimer jusqu'à finselSpan
            const parent = debselSpan.parentNode;
            if (parent) {
                // Stocker le point d'insertion AVANT les suppressions :
                // pour les entités multi-mots, nextSibling de debsel serait supprimé dans la boucle.
                const insertionPoint = finselSpan.nextSibling;
                
                // Supprimer tous les spans de debsel à finsel (inclus)
                let toDelete = debselSpan;
                while (toDelete && parent.contains(toDelete)) {
                    const next = toDelete.nextSibling;
                    if (toDelete.nodeType === Node.ELEMENT_NODE) {
                        parent.removeChild(toDelete);
                    }
                    if (toDelete === finselSpan) break;
                    toDelete = next;
                }
                
                // Insérer le nouveau span (insertionPoint peut être null → append en fin de parent)
                parent.insertBefore(spanContexte, insertionPoint);
                nbRetraits++;
                console.log(`  ✓ Pseudo retiré pour "${texteOriginal}"`);
            }
        }

        if (nbRetraits === 0) {
            console.log(`Aucune occurrence à retirer pour "${anon.entite}"`);
            return;
        }

        const finalHtmlContent = tempDiv.innerHTML;
        console.log(`✅ ${nbRetraits} pseudo(s) retiré(s)`);

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal
        try {
            if (typeof window.majFichierSonal === 'function') {
                await window.majFichierSonal(indexEnt, indexEnt + 1);
                console.log(`Fichier Sonal réécrit pour l'entretien ${indexEnt}`);
            }
        } catch (errMaj) {
            console.error('Erreur lors de majFichierSonal:', errMaj);
        }

    } catch (error) {
        console.error("Erreur dans retirerPseudoOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du retrait du pseudo: ${error.message}`);
    }
}

/**
 * Marque des occurrences spécifiques comme exceptions (anon-exception) dans un entretien
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesAMarquer - Occurrences à marquer comme exceptions
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function marquerExceptionOccurrencesSpecifiques(indexEnt, occurrencesAMarquer, anon) {
    try {
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        if (!htmlContent) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const spanIdsAMarquer = new Set(occurrencesAMarquer.map(occ => occ.spanId));
        let nbMarquages = 0;

        for (const spanId of spanIdsAMarquer) {
            const span = tempDiv.querySelector(`[data-rk="${spanId}"]`);
            if (!span) continue;

            if (span.classList.contains('debsel')) {
                // Occurrence déjà pseudonymisée → reconstituer le texte et remplacer par un span anon-exception
                let finselSpan = span;
                if (!span.classList.contains('finsel')) {
                    let sib = span.nextSibling;
                    while (sib) {
                        if (sib.nodeType === Node.ELEMENT_NODE && sib.dataset && sib.dataset.pseudo === anon.remplacement && sib.classList.contains('finsel')) {
                            finselSpan = sib; break;
                        }
                        if (sib.nodeType === Node.ELEMENT_NODE && !sib.classList.contains('anon')) break;
                        sib = sib.nextSibling;
                    }
                }
                let texteOriginal = '';
                let cur = span;
                while (cur) {
                    texteOriginal += cur.textContent || '';
                    if (cur === finselSpan) break;
                    cur = cur.nextSibling;
                }
                const spanExc = document.createElement('span');
                Array.from(span.attributes).forEach(attr => {
                    if (attr.name !== 'data-pseudo' && attr.name !== 'data-rk') spanExc.setAttribute(attr.name, attr.value);
                });
                spanExc.dataset.rk = span.dataset.rk;
                spanExc.textContent = texteOriginal;
                ['anon', 'debsel', 'finsel'].forEach(c => spanExc.classList.remove(c));
                spanExc.classList.add('anon-exception');
                delete spanExc.dataset.pseudo;
                const parent = span.parentNode;
                if (parent) {
                    const insertionPoint = finselSpan.nextSibling;
                    let toDelete = span;
                    while (toDelete && parent.contains(toDelete)) {
                        const next = toDelete.nextSibling;
                        if (toDelete.nodeType === Node.ELEMENT_NODE) parent.removeChild(toDelete);
                        if (toDelete === finselSpan) break;
                        toDelete = next;
                    }
                    parent.insertBefore(spanExc, insertionPoint);
                    nbMarquages++;
                }
            } else if (!span.classList.contains('anon-exception')) {
                // Occurrence non encore pseudonymisée → ajouter anon-exception directement
                span.classList.add('anon-exception');
                nbMarquages++;
            }
        }

        if (nbMarquages === 0) return;
        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);
        if (typeof window.majFichierSonal === 'function') await window.majFichierSonal(indexEnt, indexEnt + 1);
    } catch (error) {
        console.error("Erreur dans marquerExceptionOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du marquage de l'exception: ${error.message}`);
    }
}

/**
 * Retire le statut d'exception d'occurrences spécifiques (les remet à l'état non-traité)
 * @param {number} indexEnt - Index de l'entretien
 * @param {Array} occurrencesADesexclure - Occurrences à dés-exclure
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function retirerExceptionOccurrencesSpecifiques(indexEnt, occurrencesADesexclure, anon) {
    try {
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        if (!htmlContent) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const spanIdsADesexclure = new Set(occurrencesADesexclure.map(occ => occ.spanId));
        let nbRetraits = 0;

        for (const spanId of spanIdsADesexclure) {
            const span = tempDiv.querySelector(`[data-rk="${spanId}"]`);
            if (!span || !span.classList.contains('anon-exception')) continue;
            span.classList.remove('anon-exception');
            nbRetraits++;
        }

        if (nbRetraits === 0) return;
        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);
        if (typeof window.majFichierSonal === 'function') await window.majFichierSonal(indexEnt, indexEnt + 1);
    } catch (error) {
        console.error("Erreur dans retirerExceptionOccurrencesSpecifiques():", error);
        dialog('Message', `Erreur lors du retrait de l'exception: ${error.message}`);
    }
}

/**
 * Valide et applique les occurrences sélectionnées
 * @param {HTMLElement} scrollContainer - Conteneur avec les accordéons
 * @param {Object} occurrencesParEntretien - Données des occurrences par entretien
 * @param {Object} anon - Paire {entite, remplacement}
 */
async function validerOccurrencesSelectionnees(scrollContainer, occurrencesParEntretien, anon) {
    try {
        const accordeons = scrollContainer.querySelectorAll(".accordion-entretien");
        const changementsParEntretien = {}; // {entIdStr: {aAjouter: [], aRetirer: [], aExclure: [], aDesexclure: []}}
        
        // === PHASE 1: Collecter les changements pour chaque entretien ===
        for (const accordeon of accordeons) {
            const checkboxEnt = accordeon._checkboxEntretien;
            const checkboxesOcc = accordeon._checkboxesOccurrences;
            
            if (!checkboxEnt || checkboxesOcc.length === 0) continue;
            
            const entIdStr = checkboxEnt.dataset.entId;
            if (!changementsParEntretien[entIdStr]) {
                changementsParEntretien[entIdStr] = { aAjouter: [], aRetirer: [], aExclure: [], aDesexclure: [] };
            }
            
            // Parcourir chaque occurrence pour déterminer si elle doit être ajoutée/retirée/exclue
            for (const cbOcc of checkboxesOcc) {
                const occ = cbOcc._occurrence;
                const estCochee = cbOcc.checked;
                const etaitAppliquee = occ.applique;
                const etaitExclue = occ.exclue;
                const pendingExclusion = cbOcc._btnException ? cbOcc._btnException._pendingExclusion : etaitExclue;
                
                // Cas 1: checkbox cochée + pas encore appliquée + pas d'exception en attente → AJOUTER le pseudo
                if (estCochee && !etaitAppliquee && !pendingExclusion) {
                    changementsParEntretien[entIdStr].aAjouter.push(occ);
                }
                
                // Cas 2: checkbox décochée + était appliquée → RETIRER le pseudo
                if (!estCochee && etaitAppliquee) {
                    changementsParEntretien[entIdStr].aRetirer.push(occ);
                }

                // Cas 3: bouton 🔒 activé + pas encore exclue → MARQUER EXCEPTION
                if (pendingExclusion && !etaitExclue) {
                    changementsParEntretien[entIdStr].aExclure.push(occ);
                }

                // Cas 4: bouton 🔒 désactivé + était exclue → RETIRER EXCEPTION
                if (!pendingExclusion && etaitExclue) {
                    changementsParEntretien[entIdStr].aDesexclure.push(occ);
                }
            }
        }
        
        // === PHASE 2: Appliquer les changements par entretien ===
        let totalAjouter = 0, totalRetirer = 0, totalExclure = 0, totalDesexclure = 0;
        const tabEntPourMaj = await window.electronAPI.getEnt();
        let tabEntModifie = false;
        
        for (const entIdStr in changementsParEntretien) {
            const { aAjouter, aRetirer, aExclure, aDesexclure } = changementsParEntretien[entIdStr];
            
            if (aAjouter.length === 0 && aRetirer.length === 0 && aExclure.length === 0 && aDesexclure.length === 0) {
                continue; // Pas de changement pour cet entretien
            }
            
            const entData = occurrencesParEntretien[entIdStr];
            if (!entData) continue;
            
            // 1. D'abord retirer les exceptions (pour que les pseudonymisations suivantes voient un HTML propre)
            if (aDesexclure.length > 0) {
                await retirerExceptionOccurrencesSpecifiques(entData.index, aDesexclure, anon);
                totalDesexclure += aDesexclure.length;
            }

            // 2. Pseudonymiser seulement les spans sélectionnés
            if (aAjouter.length > 0) {
                const spanIdsATraiter = new Set(aAjouter.map(occ => occ.spanId));
                await pseudonymiserEntretienSpecifique(entData.index, anon.entite, anon.remplacement, spanIdsATraiter, true);
                totalAjouter += aAjouter.length;

                // Ajouter au tabAnon local les variantes de casse explicitement traitées
                const entretien = tabEntPourMaj[entData.index];
                if (entretien) {
                    const tabAnonLocal = entretien.tabAnon || [];
                    const entitesDejaPresentes = new Set(tabAnonLocal.map(p => p.entite));
                    for (const occ of aAjouter) {
                        if (!entitesDejaPresentes.has(occ.entite)) {
                            tabAnonLocal.push({ entite: occ.entite, remplacement: anon.remplacement });
                            entitesDejaPresentes.add(occ.entite);
                            tabEntModifie = true;
                        }
                    }
                    entretien.tabAnon = tabAnonLocal;
                }
            }

            // 3. Retirer les pseudonymes désélectionnés
            if (aRetirer.length > 0) {
                await retirerPseudoOccurrencesSpecifiques(entData.index, aRetirer, anon);
                totalRetirer += aRetirer.length;
            }

            // 4. Marquer les nouvelles exceptions
            if (aExclure.length > 0) {
                await marquerExceptionOccurrencesSpecifiques(entData.index, aExclure, anon);
                totalExclure += aExclure.length;
            }

            // Recalculer les stats (occurrences + matchPositions) depuis le HTML mis à jour
            await recalculerStatsAnonEntretien(entData.index, anon.entite, anon.remplacement, tabEntPourMaj);
            tabEntModifie = true;
        }

        // Sauvegarder les mises à jour du tabAnon local
        if (tabEntModifie) {
            await window.electronAPI.setEnt(tabEntPourMaj);
        }
        
        // === PHASE 3: Message de confirmation ===
        const totalChangements = totalAjouter + totalRetirer + totalExclure + totalDesexclure;
        if (totalChangements > 0) {
            const lignes = [];
            if (totalAjouter   > 0) lignes.push(`✅ ${totalAjouter} occurrence(s) anonymisée(s)`);
            if (totalRetirer   > 0) lignes.push(`↩️ ${totalRetirer} occurrence(s) dé-pseudonymisée(s)`);
            if (totalExclure   > 0) lignes.push(`🚫 ${totalExclure} exception(s) ajoutée(s)`);
            if (totalDesexclure > 0) lignes.push(`🔓 ${totalDesexclure} exception(s) retirée(s)`);
            dialog('Message', `Changements enregistrés :\n${lignes.join('\n')}`);
        } else {
            dialog('Message', 'Aucun changement effectué.');
        }
        
    } catch (error) {
        console.error("Erreur dans validerOccurrencesSelectionnees():", error);
        dialog('Message', `Erreur lors de la validation: ${error.message}`);
    }
}

/**
 * Relit le HTML sauvegardé d'un entretien et recalcule occurrences + matchPositions
 * pour la règle (entite, pseudo) dans tabEntArr[indexEnt].tabAnon.
 * Les champs start/end de matchPositions sont des placeholders (-1) : ils seront
 * réindexés sur le DOM réel lors de la prochaine ouverture de l'entretien.
 * @param {number} indexEnt
 * @param {string} entite
 * @param {string} pseudo
 * @param {Array} tabEntArr - tableau des entretiens (sera modifié en place)
 */
async function recalculerStatsAnonEntretien(indexEnt, entite, pseudo, tabEntArr) {
    try {
        const occurrences = await trouverOccurrencesAvecContexte(indexEnt, entite, pseudo);

        const nbApplique   = occurrences.filter(o => o.applique && !o.exclue).length;
        const nbExclue     = occurrences.filter(o => o.exclue).length;
        const nbNonTraite  = occurrences.filter(o => !o.applique && !o.exclue).length;
        const total        = nbApplique + nbExclue;

        const entretien = tabEntArr[indexEnt];
        if (!entretien) return;
        if (!entretien.tabAnon) entretien.tabAnon = [];

        let regle = entretien.tabAnon.find(p => p.entite === entite);
        if (!regle) {
            if (total === 0 && nbNonTraite === 0) return;
            regle = { entite, remplacement: pseudo, occurrences: 0, indexCourant: 0, matchPositions: [] };
            entretien.tabAnon.push(regle);
        }

        regle.occurrences = total;
        regle.nonTraiteOccurrences = nbNonTraite;
        // start/end sont des placeholders : réindexés à l'ouverture individuelle de l'entretien
        regle.matchPositions = [
            ...Array.from({ length: nbApplique }, () => ({ start: -1, end: -1, isException: false })),
            ...Array.from({ length: nbExclue },   () => ({ start: -1, end: -1, isException: true }))
        ];
    } catch (err) {
        console.error(`Erreur recalculerStatsAnonEntretien(${indexEnt}):`, err);
    }
}

/**
 * Câble le séparateur déplaçable de la page Pseudos (zone gauche = table, zone droite = détail).
 * Par défaut la zone gauche occupe 1/3 ; l'utilisateur peut ajuster, la largeur est mémorisée.
 * @param {HTMLElement} pageAnon - le conteneur #divAnonGenPage
 */
function initAnonPageResizer(pageAnon) {
    const gauche = pageAnon.querySelector('.anon-page-gauche');
    const resizer = pageAnon.querySelector('.anon-page-resizer');
    if (!gauche || !resizer) return;

    const MIN = 15, MAX = 70; // bornes en % de largeur de page

    // Restaurer la largeur mémorisée (sinon défaut CSS = 1/3)
    const saved = parseFloat(localStorage.getItem('anonPageGaucheWidth'));
    if (!isNaN(saved) && saved >= MIN && saved <= MAX) {
        gauche.style.flexBasis = saved + '%';
    }

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = pageAnon.getBoundingClientRect();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        const onMove = (ev) => {
            let pct = ((ev.clientX - rect.left) / rect.width) * 100;
            pct = Math.max(MIN, Math.min(MAX, pct));
            gauche.style.flexBasis = pct + '%';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            localStorage.setItem('anonPageGaucheWidth', parseFloat(gauche.style.flexBasis) || '');
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

/**
 * Affiche la table d'anonymisation globale avec les combinaisons et entretiens associés
 * Affiche d'abord les entités sans tester leur présence - la vérification se fait via des boutons
 */
async function affichAnonGen() {
    console.log("lancement de affichAnonGen")
    try {
        // Récupérer la liste des entretiens
        const tabEnt = await window.electronAPI.getEnt();
        
        // NOUVELLE LOGIQUE: Reconstituer le tabAnon à chaque chargement
        // Appel de la fonction existante de gestion_corpus.js
        if (typeof reconstituerTabAnonGlobal === 'function') {
            await reconstituerTabAnonGlobal(tabEnt);
        }
        
        // Récupérer le tabAnon (reconstitué ou existant)
        const tabAnonGlobal = await window.electronAPI.getAnon();
        
        if (!tabAnonGlobal || tabAnonGlobal.length === 0) {
            dialog('Message', 'Aucune anonymisation définie dans le corpus.');
            return;
        }
        
        // Filtrer les anonymisations valides (avec entité et remplacement)
        const anonValides = tabAnonGlobal.filter(a => a.entite && a.entite.trim() && a.remplacement && a.remplacement.trim());

        // === INDEX POUR LES FILTRES INSTANTANÉS (Famille 1, sans scan) ===
        // Calculés depuis les règles seules : aucune lecture du texte des entretiens.
        //  - conflit  : une même entité est mappée sur plusieurs pseudos différents (arbitrage)
        //  - collision : un même pseudo est partagé par plusieurs entités différentes (fuite/confusion)
        const idxParEntite = new Map(); // entite (trim) -> Set(pseudo)
        const idxParPseudo = new Map(); // pseudo (trim) -> Set(entite)
        for (const a of anonValides) {
            const e = a.entite.trim();
            const p = a.remplacement.trim();
            if (!idxParEntite.has(e)) idxParEntite.set(e, new Set());
            idxParEntite.get(e).add(p);
            if (!idxParPseudo.has(p)) idxParPseudo.set(p, new Set());
            idxParPseudo.get(p).add(e);
        }
        const entitesEnConflit = new Set([...idxParEntite].filter(([, s]) => s.size > 1).map(([e]) => e));
        const pseudosEnCollision = new Set([...idxParPseudo].filter(([, s]) => s.size > 1).map(([p]) => p));

        // Variable pour stocker l'état d'édition
        window.anonGenEditState = {};

        // === CRÉATION DES LIGNES SANS VÉRIFICATION ===
        const lignes = [];
        
        for (const anon of anonValides) {
            const tr = creerLigneAnonGen(anon, tabEnt);
            lignes.push(tr);
        }
        
        // Créer le conteneur principal
        const divAnonExistant = document.getElementById("divAnonGen");
        if (divAnonExistant) divAnonExistant.remove();

        // Page dédiée plein écran à deux zones (ouverte par le bouton « Pseudos ») :
        // gauche = table des pseudonymes (#fond_anon_corpus),
        // droite = vérification / occurrences par entretien (#fond_verif_anon).
        // On conserve volontairement ces id pour réutiliser la logique de rendu existante
        // (mettreAJourLigneAvecEtats, verifierEtAfficherEtatEntite, focaliserOccurrenceCorpus)
        // sans la modifier. La page est persistante : recréée seulement si absente.
        let pageAnon = document.getElementById("divAnonGenPage");
        if (!pageAnon) {
            pageAnon = document.createElement("div");
            pageAnon.id = "divAnonGenPage";
            pageAnon.classList.add("fondtabdat");
            pageAnon.innerHTML = `
                <div id="fond_anon_corpus" class="anon-page-gauche"></div>
                <div id="anonPageResizer" class="anon-page-resizer" title="Glisser pour redimensionner"></div>
                <div id="fond_verif_anon" class="anon-page-droite">
                    <div class="info-no-content" style="padding:10px">
                        <label style="width:100%;display:block;margin:5px">Cliquez sur 🔍 pour vérifier la présence d'une entité dans les entretiens.</label>
                    </div>
                </div>
            `;
            document.body.appendChild(pageAnon);
            initAnonPageResizer(pageAnon);
        }

        const fondAnonCorpus = document.getElementById("fond_anon_corpus");
        const divAnonGen = document.createElement("div");
        divAnonGen.id = "divAnonGen";
        fondAnonCorpus.innerHTML = '';
        divAnonGen.style.height = '100%';
        divAnonGen.style.display = 'flex';
        divAnonGen.style.flexDirection = 'column';
        fondAnonCorpus.appendChild(divAnonGen);

        // En-tête avec titre et boutons
        const divEntete = document.createElement("div");
        divEntete.style = "border-bottom:1px solid #ccc; padding:8px 10px 6px 10px;";
        divEntete.classList.add("header-tabdat");
        divEntete.innerHTML = `
            <h3 class="logo-anon" style="margin:0; width:100%">Table d'Anonymisation - Pseudonymes
                <label id="btn-export-anon" class="btnbleu" onclick="exportAnonGen();" title="Exporter les anonymisations" style="font-size:1.2rem"> 💾 </label>
                <label id="btn-add-anon" class="btnbleu" onclick="ajouterNouvelleEntiteAnonGen();" title="Ajouter une nouvelle entité" style="font-size:1.2rem"> ➕ </label>
                <label id="btn-quit-anon" class="btnbleu" onclick="hideAnonGen();" title="Fermer la table" style="font-size:1.2rem; float:right; margin-right:6px"> ✖️ </label>
            </h3>
        `;
        divAnonGen.appendChild(divEntete);

        // === BARRE DE FILTRAGE (Phase 1 : filtres instantanés + recherche + tri) ===
        // Opère uniquement sur les lignes déjà rendues (masquer/montrer + réordonner) :
        // aucun scan du texte, tout est déduit des règles via les index ci-dessus.
        const nbConflits = entitesEnConflit.size;
        const nbCollisions = pseudosEnCollision.size;
        const divFiltres = document.createElement("div");
        divFiltres.className = "anon-gen-filtres";
        divFiltres.innerHTML = `
            <select id="anon-gen-filtre" class="anon-gen-select" title="Filtrer les entités">
                <option value="toutes">Toutes les entités</option>
                <optgroup label="Sans calcul (règles seules)">
                    <option value="conflits">Conflits de pseudo${nbConflits ? ` (${nbConflits})` : ''}</option>
                    <option value="collisions">Collisions de pseudo${nbCollisions ? ` (${nbCollisions})` : ''}</option>
                </optgroup>
                <optgroup label="Avec vérification du corpus">
                    <option value="a_traiter">À traiter</option>
                    <option value="avec_exceptions">Avec exceptions</option>
                    <option value="bouclees">Entièrement anonymisées</option>
                    <option value="partielles">Partiellement traitées</option>
                </optgroup>
            </select>
            <button id="anon-gen-rescan" class="anon-gen-rescan" title="Recalculer l'état du corpus" style="display:none">↻</button>
            <input type="text" id="anon-gen-recherche" class="anon-gen-recherche"
                   placeholder="🔎 Rechercher (entité ou pseudo)…" autocomplete="off">
            <select id="anon-gen-tri" class="anon-gen-select" title="Trier la liste">
                <option value="az">Entité A→Z</option>
                <option value="za">Entité Z→A</option>
            </select>
            <span id="anon-gen-compteur" class="anon-gen-compteur"></span>
        `;
        divAnonGen.appendChild(divFiltres);

        // Conteneur du tableau avec scroll
        const fondTab = document.createElement("div");
        fondTab.style.overflow = "auto";
        fondTab.style.maxHeight = "calc(100vh - 210px)";
        fondTab.style.paddingLeft = "10px";
        fondTab.style.paddingBottom = "120px";
        divAnonGen.appendChild(fondTab);

        // Création de la table HTML
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const tbody = document.createElement("tbody");
        table.appendChild(thead);
        table.appendChild(tbody);
        fondTab.appendChild(table);

        // En-tête du tableau
        const headerRow = document.createElement("tr");
        
        const thEntite = document.createElement("th");
        thEntite.textContent = "Entité Originale";
        thEntite.classList.add("header-col-ent");
        headerRow.appendChild(thEntite);

        const thRemplacement = document.createElement("th");
        thRemplacement.textContent = "Pseudonyme / Remplacement";
        thRemplacement.classList.add("header-col-var");
        thRemplacement.style.minWidth = "200px";
        headerRow.appendChild(thRemplacement);

        const thActions = document.createElement("th");
        thActions.textContent = "Actions";
        thActions.classList.add("header-col-var");
        thActions.style.minWidth = "120px";
        headerRow.appendChild(thActions);

        thead.appendChild(headerRow);

        // === OPTIMISATION: Ajouter toutes les lignes d'un coup via DocumentFragment ===
        const fragment = document.createDocumentFragment();
        for (const tr of lignes) {
            fragment.appendChild(tr);
        }
        tbody.appendChild(fragment);

        // Ajouter styles CSS si nécessaire
        ajouterStylesAnonGen();

        // Ajouter listeners aux boutons d'action
        document.querySelectorAll('.btn-apply-anon').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const entite = btn.dataset.entite;
                const pseudoInput = document.querySelector(`.anon-pseudo-input[data-entite="${entite}"]`);
                if (pseudoInput) {
                    await appliquerAnonymisationGlobale(entite, pseudoInput.value);
                }
            });
        });

        // === CÂBLAGE DE LA BARRE DE FILTRAGE ===
        const selectFiltre = document.getElementById("anon-gen-filtre");
        const btnRescan = document.getElementById("anon-gen-rescan");
        const inputRecherche = document.getElementById("anon-gen-recherche");
        const selectTri = document.getElementById("anon-gen-tri");
        const compteur = document.getElementById("anon-gen-compteur");

        // Filtres nécessitant un scan du corpus (coûteux). Le résultat est mis en cache
        // pour la durée d'affichage de la page ; il est recalculé à la réouverture
        // (affichAnonGen recrée ce contexte) ou via le bouton ↻.
        const FILTRES_ETAT = new Set(['a_traiter', 'avec_exceptions', 'bouclees', 'partielles']);
        let cacheStatsCorpus = null;

        const appliquerFiltrePseudos = async () => {
            const filtre = selectFiltre.value;
            const recherche = (inputRecherche.value || '').trim().toLowerCase();
            const estEtat = FILTRES_ETAT.has(filtre);

            // Le bouton ↻ n'a de sens que pour les filtres d'état (état du corpus).
            if (btnRescan) btnRescan.style.display = estEtat ? '' : 'none';

            // Filtre d'état : lancer le scan corpus si pas encore en cache (fenêtre de progression).
            if (estEtat && !cacheStatsCorpus) {
                if (typeof wait === 'function') wait("Vérification du corpus en cours…");
                try {
                    cacheStatsCorpus = await scannerEtatCorpus(anonValides, tabEnt);
                } catch (e) {
                    console.error("Erreur lors du scan d'état du corpus:", e);
                } finally {
                    if (typeof endWait === 'function') endWait();
                }
            }

            let nbVisibles = 0;
            for (const tr of lignes) {
                const e = (tr.dataset.entite || '').trim();
                const pData = (tr.dataset.pseudo || '').trim();
                // Le pseudo peut avoir été édité dans l'input : on lit la valeur courante pour la recherche.
                const inputP = tr.querySelector('.anon-pseudo-input');
                const p = (inputP ? inputP.value : pData).trim();

                let ok = true;
                if (filtre === 'conflits') ok = entitesEnConflit.has(e);
                else if (filtre === 'collisions') ok = pseudosEnCollision.has(pData);
                else if (estEtat) {
                    const st = cacheStatsCorpus ? cacheStatsCorpus.get(`${e}|${pData}`) : null;
                    if (!st) ok = false;
                    else if (filtre === 'a_traiter') ok = st.nbNon >= 1;
                    else if (filtre === 'avec_exceptions') ok = st.nbExc >= 1;
                    else if (filtre === 'bouclees') ok = st.nbAnon > 0 && st.nbNon === 0 && st.nbExc === 0;
                    else if (filtre === 'partielles') ok = st.nbAnon >= 1 && st.nbNon >= 1;
                }

                if (ok && recherche) {
                    ok = e.toLowerCase().includes(recherche) || p.toLowerCase().includes(recherche);
                }

                tr.style.display = ok ? '' : 'none';
                if (ok) nbVisibles++;
            }
            compteur.textContent = `${nbVisibles} / ${lignes.length}`;
        };

        const trierPseudos = () => {
            const sens = selectTri.value === 'za' ? -1 : 1;
            [...lignes]
                .sort((a, b) => a.dataset.entite.localeCompare(b.dataset.entite, 'fr', { sensitivity: 'base' }) * sens)
                .forEach(tr => tbody.appendChild(tr));
        };

        if (selectFiltre && inputRecherche && selectTri && compteur) {
            selectFiltre.addEventListener('change', appliquerFiltrePseudos);
            inputRecherche.addEventListener('input', appliquerFiltrePseudos);
            selectTri.addEventListener('change', trierPseudos);
            if (btnRescan) {
                btnRescan.addEventListener('click', () => {
                    cacheStatsCorpus = null; // forcer un nouveau scan
                    appliquerFiltrePseudos();
                });
            }
            appliquerFiltrePseudos();
        }

    } catch (error) {
        console.error("Erreur dans affichAnonGen():", error);
        if (typeof closeWaitDialog === 'function') {
            closeWaitDialog();
        }
        dialog('Message', `Erreur lors de l'affichage de l'anonymisation: ${error.message}`);
    }
}

/**
 * Crée une ligne de tableau pour une anonymisation
 * @param {Object} anon - Paire {entite, remplacement}
 * @param {Array} tabEnt - Tableau des entretiens (passé au bouton 🔍 Vérifier)
 * @returns {HTMLTableRowElement}
 */
function creerLigneAnonGen(anon, tabEnt) {
    const tr = document.createElement("tr");
    tr.classList.add("ligne-anon-gen");
    tr.dataset.entite = anon.entite;
    tr.dataset.pseudo = anon.remplacement;

    // Colonne 1: Entité
    const tdEntite = document.createElement("td");
    tdEntite.textContent = anon.entite;
    tdEntite.style.fontStyle = "italic";
    tdEntite.style.color = "#666";
    tr.appendChild(tdEntite);

    // Colonne 2: Remplacement (ÉDITABLE)
    const tdRemplacement = document.createElement("td");
    tdRemplacement.innerHTML = `
        <input type="text" 
               class="anon-pseudo-input" 
               data-entite="${anon.entite}" 
               value="${anon.remplacement}"
               placeholder="Pseudonyme"
               style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
    `;
    tr.appendChild(tdRemplacement);

    // Colonne 4: Actions
    const tdActions = document.createElement("td");
    tdActions.style.minWidth = "120px";
    tdActions.style.textAlign = "center";
    tdActions.style.paddingTop = "8px";
    tdActions.style.paddingBottom = "8px";
    
    // Bouton Vérifier pour cette entité
    const btnVerifier = document.createElement("button");
    btnVerifier.textContent = "";
    btnVerifier.style.height="33px";
    btnVerifier.style.width="33px";
    btnVerifier.style.padding = "5px"
    btnVerifier.classList.add("btn",  "logo-search")
    btnVerifier.style.transition = "all 0.2s";
    btnVerifier.title = `Vérifier la présence de "${anon.entite}" dans les entretiens`;
    
    btnVerifier.addEventListener("click", async (e) => {
        e.preventDefault();
        await verifierEtAfficherEtatEntite(anon.entite, anon.remplacement, tabEnt);
    });

    // Bouton Supprimer la règle
    const btnSupprimer = document.createElement("button");
    btnSupprimer.textContent = "✖";
    btnSupprimer.style.height = "33px";
    btnSupprimer.style.width = "33px";
    btnSupprimer.style.padding = "5px";
    btnSupprimer.style.marginLeft = "6px";
    btnSupprimer.classList.add("btn", "btn-danger");
    btnSupprimer.title = `Supprimer la règle "${anon.entite}" → "${anon.remplacement}"`;

    btnSupprimer.addEventListener("click", async (e) => {
        e.preventDefault();
        await supprimerRegleAnonGen(anon.entite, anon.remplacement, tr);
    });

    tdActions.appendChild(btnVerifier);
    tdActions.appendChild(btnSupprimer);
    tr.appendChild(tdActions);

    return tr;
}

/**
 * Vérifie l'état d'anonymisation d'une paire entité/pseudo dans un entretien
 * OPTIMISÉ: Pré-filtrage texte brut + extraction textContent minimal
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité originale à chercher
 * @param {string} pseudo - Pseudonyme/remplacement
 * @returns {Promise<string>} 'anonymisee', 'non-anonymisee', ou null
 */
async function verifierEtatAnonymisation(indexEnt, entite, pseudo) {
    try {
        const htmlContent = await window.electronAPI.getHtml(indexEnt);
        
        if (!htmlContent) {
            return null;
        }

        // Frontières de mots français (les \b standard ne gèrent pas les accents)
        // Insensible à la casse ('i') + tous les alias « / » de l'entité.
        const regexEntite = construireRegexEntite(entite, 'i');
        if (!regexEntite) {
            return null;
        }

        // === VÉRIFICATION NON-ANONYMISÉE — approche HTML brut ===
        //
        // On nettoie la chaîne HTML en plusieurs passes pour isoler le texte transcrit
        // non traité (ni pseudonymisé, ni exception).
        //
        // Passe 1 — Supprimer les spans avec data-pseudo (debsel/finsel pseudonymisés).
        //   Leur textContent est le mot ORIGINAL (ex : "jacqueline"), leur attribut
        //   data-pseudo contient le pseudo (ex : "marie"). Les deux disparaissent.
        //
        // Passe 2 — Supprimer les spans class "anon" sans data-pseudo (mots intermédiaires
        //   d'entités multi-mots, et spans anon-exception — \banon\b matche aussi
        //   "anon-exception" car le tiret est une frontière de mot).
        //
        // Passe 3 — Supprimer TOUS les tags HTML restants (attributs inclus).
        //   Seul le texte transcrit non pseudonymisé et non-exception subsiste.

        const plainText = htmlContent
            // Passe 1 : spans portant data-pseudo
            .replace(/<span\b[^>]*data-pseudo\s*=[^>]*>[^<]*<\/span>/gi, ' ')
            // Passe 2 : spans portant class anon ou anon-exception sans data-pseudo
            .replace(/<span\b[^>]*class="[^"]*\banon\b[^"]*"[^>]*>[^<]*<\/span>/gi, ' ')
            // Passe 3 : suppression de tous les tags restants
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');

        // Pré-filtre : au moins un alias présent (insensible à la casse), puis confirmation regex.
        const lowerPlain = plainText.toLowerCase();
        const auMoinsUnAliasPresent = parseAliases(entite).some(a => lowerPlain.includes(a.toLowerCase()));
        if (auMoinsUnAliasPresent && regexEntite.test(plainText)) {
            return 'non-anonymisee';
        }

        // === VÉRIFICATION EXCLUE ===
        // Vérifié AVANT anonymisée : si l'entité a des occurrences pseudonymisées ET des
        // exceptions dans le même entretien, l'entretien est classé 'exclue' (les
        // catégories doivent être exclusives — présence d'une exception prime sur
        // le fait que d'autres occurrences soient pseudonymisées).
        const tempDivExc = document.createElement('div');
        tempDivExc.innerHTML = htmlContent;
        const excSpans = tempDivExc.querySelectorAll('.anon-exception');
        for (const span of excSpans) {
            if (regexEntite.test(span.textContent)) {
                return 'exclue';
            }
        }

        // === VÉRIFICATION ANONYMISÉE ===
        // Atteint seulement si AUCUNE exception n'existe pour cette entité.
        const regexDataPseudo = new RegExp(`data-pseudo="${escapeRegex(pseudo)}"`, 'i');
        if (regexDataPseudo.test(htmlContent)) {
            return 'anonymisee';
        }
        
        return null;

    } catch (error) {
        console.error("Erreur dans verifierEtatAnonymisation():", error);
        return null;
    }
}

/**
 * Vérifie si un pseudo/remplacement est présent dans un entretien
 * OPTIMISÉ: Test rapide d'abord, puis vérification DOM si nécessaire
 * @param {number} indexEnt - Index de l'entretien dans tabEnt
 * @param {string} pseudo - Pseudo à chercher
 * @returns {Promise<boolean>}
 */
async function verifierPresencePseudoEnEnt(indexEnt, pseudo) {
    try {
        // Récupérer le contenu HTML de l'entretien
        const htmlContent = await window.electronAPI.getHtml(indexEnt);
        
        if (!htmlContent) {
            return false;
        }

        // OPTIMISATION: Pré-filtrage rapide sur HTML brut
        const lowerHtml = htmlContent.toLowerCase();
        const lowerPseudo = pseudo.toLowerCase();
        
        if (!lowerHtml.includes(lowerPseudo)) {
            return false;
        }

        // Créer un DOM temporaire pour une vérification fiable
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // Récupérer tous les spans avec data-rk
        const tousLesSpans = Array.from(tempDiv.querySelectorAll('[data-rk]'));
        
        const regexPseudo = new RegExp(`\\b${escapeRegex(pseudo)}\\b`, 'i');
        
        // Vérifier si le pseudo est présent dans n'importe quel span
        for (const span of tousLesSpans) {
            const spanText = span.textContent;
            if (regexPseudo.test(spanText)) {
                return true;
            }
        }
        
        return false;

    } catch (error) {
        console.error("Erreur dans verifierPresencePseudoEnEnt():", error);
        return false;
    }
}

/**
 * Échappe les caractères spéciaux pour la regex
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Découpe un champ « entité » en alias séparés par « / ».
 * "Saint-Étienne / St-Étienne" → ["Saint-Étienne", "St-Étienne"]
 * Espaces autour du « / » ignorés, parts vides ignorées. Sans « / » : un seul alias.
 * @param {string} entite
 * @returns {string[]}
 */
function parseAliases(entite) {
    if (!entite) return [];
    return entite.split('/').map(s => s.trim()).filter(Boolean);
}

/**
 * Construit une regex (avec frontières de mots français) couvrant tous les alias d'une entité.
 * Chaque alias est échappé (aucun footgun regex). Les alias les plus longs sont placés en tête
 * de l'alternance pour être préférés en cas de recouvrement.
 * @param {string} entite - chaîne « entité » (peut contenir des alias séparés par « / »)
 * @param {string} flags - flags de la RegExp (ex. 'gi', 'i')
 * @returns {RegExp|null} null si aucun alias exploitable
 */
function construireRegexEntite(entite, flags) {
    const FR = '[a-zA-ZÀ-ÖØ-öø-ÿ0-9_]';
    const alias = parseAliases(entite).sort((a, b) => b.length - a.length);
    if (alias.length === 0) return null;
    const alternation = alias.map(a => escapeRegex(a)).join('|');
    return new RegExp(`(?<!${FR})(?:${alternation})(?!${FR})`, flags);
}

/**
 * Tokenize une chaîne exactement comme la segmentation le fait
 * Pour matcher l'ordre des spans dans le DOM
 */
function tokenizeCommeSegmentation(texte) {
    return texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];
}

/**
 * Pseudonymise un entretien spécifique en éclatant les spans de phrase pour isoler l'entité.
 * Approche DOM : les entretiens compressés ont un span par phrase ; chaque span contenant
 * l'entité est découpé en sous-spans :
 *   - texte avant  → span neutre (attributs préservés, classes anon retirées)
 *   - mots de l'entité → un span par mot : class="anon", debsel sur le 1er,
 *                        finsel sur le dernier, data-pseudo sur les deux
 *   - texte après  → span neutre
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité originale
 * @param {string} pseudo - Pseudonyme/remplacement
 */
async function pseudonymiserEntretienSpecifique(indexEnt, entite, pseudo, spanIdsATraiter = null, suppressDialog = false) {
    
    console.log(`Pseudonymisation dans l'entretien index ${indexEnt} pour l'entité "${entite}" avec le pseudo "${pseudo}"`);
    
    try {
        if (!pseudo || pseudo.trim().length === 0) {
            dialog('Message', 'Pseudonyme invalide.');
            return;
        }

        // Récupérer l'HTML de l'entretien
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        htmlContent = htmlContent.replace(/`/g, '');
        
        if (!htmlContent) {
            dialog('Message', 'Impossible de récupérer le contenu de l\'entretien.');
            return;
        }

        // === APPROCHE DOM : éclater les spans pour isoler l'entité ===

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Trouver le data-rk maximum pour générer de nouvelles valeurs uniques
        let maxRk = -1;
        tempDiv.querySelectorAll('[data-rk]').forEach(span => {
            const rk = parseInt(span.dataset.rk);
            if (!isNaN(rk) && rk > maxRk) maxRk = rk;
        });
        let nextRk = maxRk + 1;

        // Regex pour l'entité (insensible à la casse, mots entiers)
        // Note: \b ne fonctionne pas avec les caractères accentués français (é, è, à, ç…)
        // On utilise des lookahead/lookbehind négatifs couvrant l'alphabet français complet.
        // 'gi' : insensible à la casse + tous les alias « / » pointent vers le même pseudo.
        const regexEntite = construireRegexEntite(entite.trim(), 'gi');
        if (!regexEntite) {
            if (!suppressDialog) dialog('Message', 'Entité invalide.');
            return;
        }

        let nbRemplacements = 0;

        // Snapshot avant modification pour éviter les conflits d'itération
        const allSpans = Array.from(tempDiv.querySelectorAll('[data-rk]'));

        for (const span of allSpans) {
            // Ignorer les spans déjà marqués debsel avec ce pseudo
            if (span.classList.contains('debsel') && span.dataset.pseudo === pseudo) {
                continue;
            }

            // Ignorer les spans marqués comme exception (sauf si aDesexclure a déjà retiré la classe)
            if (span.classList.contains('anon-exception')) {
                continue;
            }

            // Si une liste de spanIds est fournie, n'appliquer que sur ces spans spécifiques
            if (spanIdsATraiter && !spanIdsATraiter.has(span.dataset.rk)) {
                continue;
            }

            const texteSpan = span.textContent;

            // Test rapide : l'entité est-elle présente dans ce span ?
            regexEntite.lastIndex = 0;
            if (!regexEntite.test(texteSpan)) {
                continue;
            }

            // Collecter les fragments : [texte, entité, texte, entité, ...]
            const fragments = [];
            let lastIndex = 0;
            let match;
            regexEntite.lastIndex = 0;

            while ((match = regexEntite.exec(texteSpan)) !== null) {
                if (match.index > lastIndex) {
                    fragments.push({ type: 'text', content: texteSpan.substring(lastIndex, match.index) });
                }
                fragments.push({ type: 'entity', content: match[0] });
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < texteSpan.length) {
                fragments.push({ type: 'text', content: texteSpan.substring(lastIndex) });
            }

            if (!fragments.some(f => f.type === 'entity')) continue;

            // Utilitaire : span neutre (texte hors entité) héritant des attributs du span d'origine
            const creerSpanContexte = (texte) => {
                const s = document.createElement('span');
                Array.from(span.attributes).forEach(attr => {
                    if (attr.name !== 'data-pseudo') s.setAttribute(attr.name, attr.value);
                });
                s.dataset.rk = nextRk++;
                s.textContent = texte;
                ['anon', 'anon-exception'].forEach(c => s.classList.remove(c));
                delete s.dataset.pseudo;
                return s;
            };

            // Construire les nouveaux éléments DOM
            const newElements = [];

            for (const fragment of fragments) {
                if (fragment.type === 'text') {
                    if (fragment.content.length > 0) {
                        newElements.push(creerSpanContexte(fragment.content));
                    }
                } else {
                    // Entité (éventuellement multi-mots) : un span par mot
                    const allTokens = fragment.content.split(/(\s+)/);
                    const wordTokens = allTokens.filter(t => t.trim() !== '');
                    const totalWords = wordTokens.length;
                    let wordIdx = 0;

                    for (const token of allTokens) {
                        if (token.trim() === '') {
                            // Espace inter-mots → span neutre
                            if (token.length > 0) newElements.push(creerSpanContexte(token));
                        } else {
                            // Mot de l'entité → span avec classes anon
                            const wordSpan = document.createElement('span');
                            Array.from(span.attributes).forEach(attr => {
                                if (attr.name !== 'data-pseudo') wordSpan.setAttribute(attr.name, attr.value);
                            });
                            wordSpan.dataset.rk = nextRk++;
                            wordSpan.textContent = token;

                            // Réinitialiser les classes anon héritées, puis appliquer
                            ['anon', 'anon-exception', 'debsel', 'finsel'].forEach(c => wordSpan.classList.remove(c));
                            delete wordSpan.dataset.pseudo;
                            wordSpan.classList.add('anon');

                            if (wordIdx === 0) {
                                // Premier mot : debsel + data-pseudo
                                wordSpan.classList.add('debsel');
                                wordSpan.dataset.pseudo = pseudo;
                            }
                            if (wordIdx === totalWords - 1) {
                                // Dernier mot : finsel + data-pseudo
                                wordSpan.classList.add('finsel');
                                wordSpan.dataset.pseudo = pseudo;
                            }

                            wordIdx++;
                            newElements.push(wordSpan);
                        }
                    }

                    nbRemplacements++;
                    console.log(`  → "${fragment.content}" isolé en ${wordTokens.length} span(s) [pseudo="${pseudo}"]`);
                }
            }

            // Remplacer le span d'origine par les nouveaux éléments
            const parent = span.parentNode;
            if (parent) {
                const nextSibling = span.nextSibling;
                parent.removeChild(span);
                newElements.forEach(el => parent.insertBefore(el, nextSibling));
            }
        }

        if (nbRemplacements === 0) {
            dialog('Message', `L'entité "${entite}" n'a pas été trouvée dans cet entretien.`);
            return;
        }

        const finalHtmlContent = tempDiv.innerHTML;
        console.log(`✅ ${nbRemplacements} occurrence(s) traitée(s)`);

        // Sauvegarder l'HTML modifié
        await window.electronAPI.setHtml(indexEnt, finalHtmlContent);

        // Réécriture du fichier .sonal avec le nouveau HTML
        try {
            if (typeof window.majFichierSonal === 'function') {
                console.log(`Appel de majFichierSonal(${indexEnt}, ${indexEnt + 1})`);
                await window.majFichierSonal(indexEnt, indexEnt + 1);
                console.log(`Fichier Sonal réécrit pour l'entretien ${indexEnt}`);
            } else {
                console.warn('Fonction majFichierSonal non disponible');
            }
        } catch (errMaj) {
            console.error('Erreur lors de majFichierSonal:', errMaj);
            dialog('Message', `HTML mis à jour mais erreur lors de la réécriture du fichier Sonal: ${errMaj.message}`);
        }

        // Récupérer le nom de l'entretien
        const tabEnt = await window.electronAPI.getEnt();
        const entName = tabEnt[indexEnt] ? tabEnt[indexEnt].nom : `Entretien ${indexEnt}`;

        if (!suppressDialog) {
            dialog('Message', `Pseudonyme "${pseudo}" enregistré dans "${entName}" (${nbRemplacements} occurrence(s)).\n\nNote: Les changements ont été sauvegardés.`);
        }

        // Mettre à jour juste le badge au lieu de recharger tout (plus rapide)
        mettreAJourBadgeApresAnonymisation(indexEnt, entite, pseudo);

    } catch (error) {
        console.error("Erreur dans pseudonymiserEntretienSpecifique():", error);
        dialog('Message', `Erreur: ${error.message}`);
    }
}

/**
 * Met à jour juste le badge d'un entretien après anonymisation (évite un rechargement complet)
 * Transforme le badge de orange (non-anonymisé) à bleu (anonymisé)
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} entite - Entité anonymisée
 * @param {string} pseudo - Pseudonyme appliqué
 */
function mettreAJourBadgeApresAnonymisation(indexEnt, entite, pseudo) {
    const divAnonGen = document.getElementById("divAnonGen");
    if (!divAnonGen) return;

    // Chercher le badge orange correspondant
    let badgeTrouve = null;
    const allBadges = divAnonGen.querySelectorAll('span[data-index-ent]');
    
    for (const badge of allBadges) {
        if (badge.dataset.indexEnt == indexEnt && 
            badge.dataset.entite === entite && 
            badge.dataset.pseudo === pseudo) {
            badgeTrouve = badge;
            break;
        }
    }
    
    if (!badgeTrouve) return;

    console.log(`Mise à jour du badge pour "${entite}" → "${pseudo}" dans entretien ${indexEnt}`);
    
    // Cloner le badge pour supprimer les anciens event listeners
    const newBadge = badgeTrouve.cloneNode(true);
    
    // Transformer de orange (non-anonymisé) à bleu (anonymisé)
    newBadge.style.backgroundColor = "#64B5F6";
    newBadge.style.borderColor = "#42A5F5";
    newBadge.style.border = "1px solid #42A5F5";
    newBadge.style.cursor = "pointer";
    newBadge.style.padding = "4px 8px";
    newBadge.style.fontWeight = "600";
    newBadge.style.borderRadius = "4px";
    newBadge.style.fontSize = "0.9em";
    newBadge.style.transition = "all 0.2s";
    newBadge.title = "Déjà anonymisé - Clic pour voir";
    
    // Retirer les attributs de data (pas nécessaires pour les anonymisés)
    delete newBadge.dataset.entite;
    delete newBadge.dataset.pseudo;
    delete newBadge.dataset.indexEnt;
    
    // Ajouter nouvel event listener pour voir l'entretien
    newBadge.addEventListener("click", () => {
        hideAnonGen();
        afficherDetailsEnt(indexEnt);
    });

    // Hover effects pour le badge bleu
    newBadge.addEventListener("mouseover", () => {
        newBadge.style.backgroundColor = "#42A5F5";
        newBadge.style.borderColor = "#1565c0";
        newBadge.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    });

    newBadge.addEventListener("mouseout", () => {
        newBadge.style.backgroundColor = "#64B5F6";
        newBadge.style.borderColor = "#42A5F5";
        newBadge.style.boxShadow = "none";
    });
    
    // Remplacer le badge dans le DOM
    badgeTrouve.parentNode.replaceChild(newBadge, badgeTrouve);
    console.log(`✅ Badge mis à jour (transformation orange → bleu)`);
}

/**
 * Applique l'anonymisation globalement à tous les entretiens
 * @param {string} entite - Entité originale
 * @param {string} pseudo - Pseudonyme/remplacement à appliquer
 */
async function appliquerAnonymisationGlobale(entite, pseudo) {
    try {
        if (!pseudo || pseudo.trim().length === 0) {
            dialog('Message', 'Veuillez entrer un pseudonyme valide.');
            return;
        }

        // Mettre à jour le tabAnon global
        let tabAnon = await window.electronAPI.getAnon();
        let found = false;
        
        for (const anon of tabAnon) {
            if (anon.entite && anon.entite.trim() === entite.trim()) {
                anon.remplacement = pseudo;
                found = true;
                break;
            }
        }

        if (!found) {
            // Ajouter une nouvelle entrée si elle n'existe pas
            tabAnon.push({
                entite: entite,
                remplacement: pseudo,
                occurrences: 0,
                indexCourant: 0,
                matchPositions: []
            });
        }

        // Sauvegarder les changements
        await window.electronAPI.setAnon(tabAnon);
        
        dialog('Message', `Pseudonyme "${pseudo}" appliqué globalement.\n\nNote: Vous devez relancer l'anonymisation depuis le module d'anonymisation pour appliquer les changements à tous les entretiens.`);
        
        // Rafraîchir l'affichage
        affichAnonGen();

    } catch (error) {
        console.error("Erreur dans appliquerAnonymisationGlobale():", error);
        dialog('Message', `Erreur: ${error.message}`);
    }
}

/**
 * Ouvre un entretien depuis le tableau d'anonymisation
 */
async function ouvrirEntretienAnonGen(indexEnt) {
    try {
        hideAnonGen();
        
        // Appeler la fonction d'affichage existante avec l'index de l'entretien
        afficherDetailsEnt(indexEnt);
        
    } catch (error) {
        console.error("Erreur:", error);
        dialog('Message', `Erreur: ${error.message}`);
    }
}

/**
 * Masque la table d'anonymisation
 */
function hideAnonGen() {
    // Page dédiée : on retire entièrement l'overlay (table + zone de vérification).
    const page = document.getElementById("divAnonGenPage");
    if (page) {
        page.remove();
        window._lastVerifiedAnon = null;
        return;
    }
    const div = document.getElementById("divAnonGen");
    if (div) div.remove();
}

/**
 * Ajoute une nouvelle entité/pseudo au tableau d'anonymisation globale
 * Ouvre une modale pour saisir l'entité et le pseudo, puis met à jour le tableau
 */
async function ajouterNouvelleEntiteAnonGen() {
    try {
        // Créer la modale
        afficherModaleAjoutEntiteAnon();
    } catch (error) {
        console.error("Erreur dans ajouterNouvelleEntiteAnonGen():", error);
        dialog('Message', `Erreur: ${error.message}`);
    }
}

/**
 * Affiche une modale pour ajouter une nouvelle entité d'anonymisation
 */
function afficherModaleAjoutEntiteAnon() {
    // Vérifier si une modale existe déjà
    let modaleExistante = document.getElementById("modaleAjoutAnon");
    if (modaleExistante) modaleExistante.remove();

    // Créer le fond semi-transparent
    const overlay = document.createElement("div");
    overlay.id = "modaleAjoutAnon";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "10000";

    // Créer la boîte de dialogue
    const modale = document.createElement("div");
    modale.style.backgroundColor = "white";
    modale.style.borderRadius = "8px";
    modale.style.padding = "30px";
    modale.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)";
    modale.style.width = "400px";
    modale.style.fontFamily = "sans-serif";
    modale.style.zIndex = "10001";

    // Titre
    const titre = document.createElement("h3");
    titre.textContent = "Ajouter une nouvelle entité";
    titre.style.marginTop = "0";
    titre.style.marginBottom = "20px";
    titre.style.color = "#333";
    modale.appendChild(titre);

    // Champ Entité
    const labelEntite = document.createElement("label");
    labelEntite.textContent = "Entité originale :";
    labelEntite.style.display = "block";
    labelEntite.style.marginBottom = "8px";
    labelEntite.style.fontWeight = "bold";
    labelEntite.style.color = "#555";
    modale.appendChild(labelEntite);

    const inputEntite = document.createElement("input");
    inputEntite.id = "inputEntiteAnon";
    inputEntite.type = "text";
    inputEntite.placeholder = "Ex: Marie";
    inputEntite.style.width = "100%";
    inputEntite.style.padding = "10px";
    inputEntite.style.marginBottom = "15px";
    inputEntite.style.border = "1px solid #ccc";
    inputEntite.style.borderRadius = "4px";
    inputEntite.style.boxSizing = "border-box";
    inputEntite.style.fontSize = "14px";
    modale.appendChild(inputEntite);

    // Champ Pseudonyme
    const labelPseudo = document.createElement("label");
    labelPseudo.textContent = "Pseudonyme :";
    labelPseudo.style.display = "block";
    labelPseudo.style.marginBottom = "8px";
    labelPseudo.style.fontWeight = "bold";
    labelPseudo.style.color = "#555";
    modale.appendChild(labelPseudo);

    const inputPseudo = document.createElement("input");
    inputPseudo.id = "inputPseudoAnon";
    inputPseudo.type = "text";
    inputPseudo.placeholder = "Ex: P1";
    inputPseudo.style.width = "100%";
    inputPseudo.style.padding = "10px";
    inputPseudo.style.marginBottom = "25px";
    inputPseudo.style.border = "1px solid #ccc";
    inputPseudo.style.borderRadius = "4px";
    inputPseudo.style.boxSizing = "border-box";
    inputPseudo.style.fontSize = "14px";
    modale.appendChild(inputPseudo);

    // Conteneur des boutons
    const conteneurBoutons = document.createElement("div");
    conteneurBoutons.style.display = "flex";
    conteneurBoutons.style.justifyContent = "flex-end";
    conteneurBoutons.style.gap = "10px";

    // Bouton Annuler
    const btnAnnuler = document.createElement("button");
    btnAnnuler.textContent = "Annuler";
    btnAnnuler.classList.add("btn", "btnfonction");
    
    btnAnnuler.style.padding = "10px 20px";
    btnAnnuler.style.backgroundColor = "#ccc";
    btnAnnuler.style.border = "1px solid #999";
    btnAnnuler.style.borderRadius = "4px";
    btnAnnuler.style.cursor = "pointer";
    btnAnnuler.style.fontSize = "14px";
    btnAnnuler.addEventListener("click", () => overlay.remove());
    conteneurBoutons.appendChild(btnAnnuler);

    // Bouton OK
    const btnOK = document.createElement("button");
    btnOK.textContent = "Ajouter";
    btnOK.style.padding = "10px 20px";
    btnOK.style.backgroundColor = "#4CAF50";
    btnOK.style.color = "white";
    btnOK.style.border = "none";
    btnOK.style.borderRadius = "4px";
    btnOK.style.cursor = "pointer";
    btnOK.style.fontSize = "14px";
    btnOK.style.fontWeight = "bold";
    btnOK.addEventListener("click", async () => {
        const entite = inputEntite.value.trim();
        const pseudo = inputPseudo.value.trim();

        if (!entite) {
            question("Veuillez entrer l'entité originale.", ['OK']);
            inputEntite.focus();
            return;
        }

        if (!pseudo) {
            question("Veuillez entrer le pseudonyme.", ['OK']);
            inputPseudo.focus();
            return;
        }

        // Vérifier si cette combinaison existe déjà
        const tabAnonGlobal = await window.electronAPI.getAnon();
        const existe = tabAnonGlobal.some(a => 
            a.entite && a.entite.trim() === entite && 
            a.remplacement && a.remplacement.trim() === pseudo
        );

        if (existe) {
            question(`La combinaison "${entite}" → "${pseudo}" existe déjà.`, ['OK']);
            return;
        }

        // Ajouter la nouvelle entité
        const nouvelleEntite = {
            entite: entite,
            remplacement: pseudo,
            occurrences: 0,
            indexCourant: 0,
            matchPositions: []
        };

        tabAnonGlobal.push(nouvelleEntite);
        await window.electronAPI.setAnon(tabAnonGlobal);

        // Fermer la modale
        overlay.remove();

        // Ajouter une nouvelle ligne au tableau
        ajouterLigneAuTableauAnonGen(nouvelleEntite);

        //dialog('Message', `Entité "${entite}" → "${pseudo}" ajoutée avec succès.`);
    });
    conteneurBoutons.appendChild(btnOK);

    modale.appendChild(conteneurBoutons);
    overlay.appendChild(modale);
    document.body.appendChild(overlay);

    // Focus sur le premier champ
    inputEntite.focus();

    // Permettre Enter pour soumettre
    inputPseudo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            btnOK.click();
        }
    });

    inputEntite.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            inputPseudo.focus();
        }
    });
}

/**
 * Ajoute une nouvelle ligne au tableau d'anonymisation sans recharger complètement
 * @param {Object} anon - Objet contenant {entite, remplacement}
 */
async function ajouterLigneAuTableauAnonGen(anon) {
    const divAnonGen = document.getElementById("divAnonGen");
    if (!divAnonGen) return;

    const tbody = divAnonGen.querySelector("table tbody");
    if (!tbody) return;

    const tabEnt = await window.electronAPI.getEnt();

    // Utiliser creerLigneAnonGen pour garantir un affichage identique aux lignes existantes
    const tr = creerLigneAnonGen(anon, tabEnt);

    // Insérer à la bonne position alphabétique
    const lignes = Array.from(tbody.querySelectorAll("tr[data-entite]"));
    const ligneApres = lignes.find(l => l.dataset.entite.localeCompare(anon.entite) > 0);
    if (ligneApres) {
        tbody.insertBefore(tr, ligneApres);
    } else {
        tbody.appendChild(tr);
    }

    // Scroller jusqu'à la nouvelle ligne puis la mettre en évidence
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
        tr.classList.add("ligent-flash");
        setTimeout(() => tr.classList.remove("ligent-flash"), 3000);
    }, 400);

    console.log(`✅ Nouvelle ligne ajoutée au tableau pour "${anon.entite}" → "${anon.remplacement}"`);
}

/**
 * Supprime une règle d'anonymisation du tabAnon global, retire le pseudo de tout le corpus
 * et retire la ligne du tableau
 * @param {string} entite - Entité à supprimer
 * @param {string} pseudo - Pseudonyme associé
 * @param {HTMLTableRowElement} tr - Ligne du tableau à retirer
 */
async function supprimerRegleAnonGen(entite, pseudo, tr) {
    const reponse = await question(
        `Supprimer la règle "${entite}" → "${pseudo}" ?\nLe pseudonyme sera retiré de tous les entretiens du corpus.`,
        ["Supprimer", "Annuler"]
    );
    if (reponse !== "supprimer") return;

    const tabEnt = await window.electronAPI.getEnt();
    let nbEntretiensModifies = 0;

    // Retirer le pseudo de chaque entretien du corpus
    for (let i = 0; i < tabEnt.length; i++) {
        const modifie = await retirerPseudoDeEntretien(i, pseudo, entite);
        if (modifie) nbEntretiensModifies++;

        // Nettoyer le tabAnon local de cet entretien
        if (tabEnt[i].tabAnon && tabEnt[i].tabAnon.length > 0) {
            tabEnt[i].tabAnon = tabEnt[i].tabAnon.filter(
                a => !(a.entite === entite && a.remplacement === pseudo)
            );
        }
    }

    // Sauvegarder les entretiens mis à jour (tabAnon locaux nettoyés)
    await window.electronAPI.setEnt(tabEnt);

    // Retirer du tabAnon global
    let tabAnon = await window.electronAPI.getAnon();
    tabAnon = tabAnon.filter(a => !(a.entite === entite && a.remplacement === pseudo));
    await window.electronAPI.setAnon(tabAnon);

    // Retirer la ligne du tableau avec animation
    tr.style.transition = "opacity 0.3s";
    tr.style.opacity = "0";
    setTimeout(() => tr.remove(), 300);

    const msg = nbEntretiensModifies > 0
        ? `Règle "${entite}" → "${pseudo}" supprimée.\n${nbEntretiensModifies} entretien(s) nettoyé(s).`
        : `Règle "${entite}" → "${pseudo}" supprimée.`;
    dialog('Message', msg);
}

/**
 * Retire toutes les occurrences d'un pseudo dans un entretien
 * Variante sans filtre par spanId — retire TOUTES les occurrences du pseudo
 * @param {number} indexEnt - Index de l'entretien
 * @param {string} pseudo - Pseudonyme à retirer
 * @param {string} entite - Entité correspondante (pour les logs)
 * @returns {Promise<boolean>} true si au moins une occurrence retirée
 */
async function retirerPseudoDeEntretien(indexEnt, pseudo, entite) {
    try {
        let htmlContent = await window.electronAPI.getHtml(indexEnt);
        if (!htmlContent) return false;
        htmlContent = htmlContent.replace(/`/g, '');

        // Vérification rapide : le pseudo est-il présent ?
        if (!htmlContent.includes(`data-pseudo="${pseudo}"`)) return false;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const debselSpans = Array.from(tempDiv.querySelectorAll(`[data-pseudo="${pseudo}"].debsel`));
        if (debselSpans.length === 0) return false;

        let nbRetraits = 0;

        for (const debselSpan of debselSpans) {
            // Trouver le finsel correspondant
            let finselSpan = debselSpan;
            if (!debselSpan.classList.contains('finsel')) {
                let sib = debselSpan.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE
                        && sib.dataset && sib.dataset.pseudo === pseudo
                        && sib.classList.contains('finsel')) {
                        finselSpan = sib;
                        break;
                    }
                    if (sib.nodeType === Node.ELEMENT_NODE && !sib.classList.contains('anon')) break;
                    sib = sib.nextSibling;
                }
            }

            // Reconstituer le texte original (fusion debsel → finsel)
            let texteOriginal = '';
            let cur = debselSpan;
            while (cur) {
                texteOriginal += cur.textContent || '';
                if (cur === finselSpan) break;
                cur = cur.nextSibling;
            }

            // Créer un span neutre avec le texte original
            const spanContexte = document.createElement('span');
            Array.from(debselSpan.attributes).forEach(attr => {
                if (attr.name !== 'data-pseudo' && attr.name !== 'data-rk') {
                    spanContexte.setAttribute(attr.name, attr.value);
                }
            });
            spanContexte.dataset.rk = debselSpan.dataset.rk;
            spanContexte.textContent = texteOriginal;
            ['anon', 'debsel', 'finsel'].forEach(c => spanContexte.classList.remove(c));
            delete spanContexte.dataset.pseudo;

            // Remplacer debsel→finsel par le span neutre
            const parent = debselSpan.parentNode;
            if (parent) {
                const insertionPoint = finselSpan.nextSibling;
                let toDelete = debselSpan;
                while (toDelete && parent.contains(toDelete)) {
                    const next = toDelete.nextSibling;
                    if (toDelete.nodeType === Node.ELEMENT_NODE) parent.removeChild(toDelete);
                    if (toDelete === finselSpan) break;
                    toDelete = next;
                }
                parent.insertBefore(spanContexte, insertionPoint);
                nbRetraits++;
            }
        }

        if (nbRetraits === 0) return false;

        await window.electronAPI.setHtml(indexEnt, tempDiv.innerHTML);

        if (typeof window.majFichierSonal === 'function') {
            await window.majFichierSonal(indexEnt, indexEnt + 1);
        }

        console.log(`  ✓ Entretien ${indexEnt} : ${nbRetraits} occurrence(s) de "${pseudo}" retirée(s)`);
        return true;

    } catch (error) {
        console.error(`Erreur retirerPseudoDeEntretien(${indexEnt}):`, error);
        return false;
    }
}

/**
 * Exporte la table d'anonymisation
 */
async function exportAnonGen() {
    try {
        const tabAnonGlobal = await window.electronAPI.getAnon();
        const tabEnt = await window.electronAPI.getEnt();
        
        if (!tabAnonGlobal || tabAnonGlobal.length === 0) {
            dialog('Message', 'Aucune anonymisation à exporter.');
            return;
        }

        // Créer un fichier CSV
        let csv = "Entité Originale,Pseudonyme,Entretiens (✅ = Anonymisé | ❌ = Non-anonymisé)\n";

        for (const anon of tabAnonGlobal) {
            if (!anon.entite || !anon.entite.trim() || !anon.remplacement || !anon.remplacement.trim()) {
                continue;
            }

            const entretiensData = [];
            
            for (let i = 0; i < tabEnt.length; i++) {
                const etat = await verifierEtatAnonymisation(i, anon.entite, anon.remplacement);
                if (etat === 'anonymisee') {
                    entretiensData.push(`✅ ${tabEnt[i].nom}`);
                } else if (etat === 'non-anonymisee') {
                    entretiensData.push(`❌ ${tabEnt[i].nom}`);
                }
            }

            const entiteEchappee = `"${anon.entite.replace(/"/g, '""')}"`;
            const remplacementEchappee = `"${anon.remplacement.replace(/"/g, '""')}"`;
            const entretiensEchappes = `"${entretiensData.join('; ').replace(/"/g, '""')}"`;
            
            csv += `${entiteEchappee},${remplacementEchappee},${entretiensEchappes}\n`;
        }

        // Télécharger le fichier
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const lien = document.createElement("a");
        const url = URL.createObjectURL(blob);
        lien.setAttribute("href", url);
        lien.setAttribute("download", "anonymisation_globale.csv");
        lien.style.visibility = "hidden";
        document.body.appendChild(lien);
        lien.click();
        document.body.removeChild(lien);

        dialog('Message', 'Table d\'anonymisation exportée avec succès.');

    } catch (error) {
        console.error("Erreur export:", error);
        dialog('Message', `Erreur lors de l'export: ${error.message}`);
    }
}

/**
 * Ajoute les styles CSS nécessaires pour l'affichage
 */
function ajouterStylesAnonGen() {
    // Vérifier si les styles sont déjà présents
    if (document.getElementById("styles-anon-gen")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "styles-anon-gen";
    style.textContent = `
        /* Styles spécifiques pour la table d'anonymisation */
        .ligne-anon-gen {
            transition: background-color 0.2s;
        }

        /* Barre de filtrage de la page Pseudos */
        .anon-gen-filtres {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid #eee;
            flex-wrap: wrap;
        }
        .anon-gen-select {
            padding: 5px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #fff;
            font-size: 0.9em;
            cursor: pointer;
        }
        .anon-gen-recherche {
            flex: 1;
            min-width: 140px;
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .anon-gen-recherche:focus {
            outline: none;
            border-color: #1565c0;
            box-shadow: 0 0 4px rgba(21, 101, 192, 0.25);
        }
        .anon-gen-compteur {
            font-size: 0.8em;
            color: #888;
            white-space: nowrap;
        }
        .anon-gen-rescan {
            padding: 4px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #fff;
            cursor: pointer;
            font-size: 0.95em;
            line-height: 1;
        }
        .anon-gen-rescan:hover {
            background: #f0f0f0;
            border-color: #1565c0;
        }

        .ligne-anon-gen:hover {
            background-color: #f5f5f5;
        }

        /*
        .logo-anon::before {
            content: "🔐 ";
            margin-right: 8px;
        }

        .logo-variables::before {
            content: "📊 ";
            margin-right: 8px;
        }
        */

        /* Input pour le pseudonyme */
        .anon-pseudo-input {
            font-weight: bold;
            color: #1565c0;
            padding: 6px 8px;
            border: 2px solid #90CAF9;
            border-radius: 4px;
            font-size: 0.95em;
            
        }

        .anon-pseudo-input:hover {
            border-color: #64B5F6;
            box-shadow: 0 0 4px rgba(21, 101, 192, 0.2);
        }

        .anon-pseudo-input:focus {
            outline: none;
            border-color: #1565c0;
            box-shadow: 0 0 6px rgba(21, 101, 192, 0.3);
        }

        /* Bouton d'application globale */
        .btn-apply-anon {
            background-color: #FFC107;
            color: #333;
            border: 1px solid #FFB300;
            border-radius: 4px;
            padding: 6px 12px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .btn-apply-anon:hover {
            background-color: #FFB300;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            transform: translateY(-1px);
        }

        .btn-apply-anon:active {
            transform: translateY(0);
        }

        /* Badges - Anonymisés (bleu) */
        span[style*="64B5F6"] {
            transition: all 0.2s !important;
        }

        /* Badges - Non-anonymisés (orange) - cliquables */
        span[style*="FFA500"] {
            transition: all 0.2s !important;
        }

        /* Styles pour les accordéons */
        .accordion-entretien {
            border-bottom: 1px solid #eee;
        }

        .accordion-entretien:hover {
            background-color: #fafafa;
        }

        



        /* Conteneur modale d'occurrences */
        div[style*="500px"] {
            display: flex;
            flex-direction: column;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Navigation entretien -> corpus : focalise le tableau global sur une occurrence précise.
 * - Ouvre le panneau corpus si fermé
 * - Déclenche la vérification de l'entité pour générer les accordéons
 * - Défile vers la ligne, déplie l'accordéon de l'entretien, défile vers l'occurrence et la met en évidence (flash 2s)
 *
 * @param {{entite: string, pseudo: string, rkEnt: number, spanId: string}} payload
 */
async function focaliserOccurrenceCorpus(payload) {
    if (!payload || !payload.entite) return;
    const { entite, pseudo, rkEnt, spanId } = payload;

    // Cible courante + purge synchrone des modales résiduelles avant tout await
    window._lastVerifiedAnon = { entite, pseudo };
    const fondVerif = document.getElementById("fond_verif_anon");
    if (fondVerif) fondVerif.innerHTML = '';

    // Page dédiée : s'assurer qu'elle est ouverte, puis vérifier l'entité cible.
    //  - page fermée : affichAnonGen() la construit (table + zone de vérification) ;
    //  - page ouverte : on enchaîne directement sur la vérification.
    const pageOuverte = !!document.getElementById("divAnonGenPage");
    if (!pageOuverte) {
        await affichAnonGen();
    }
    try {
        const tabEnt = await window.electronAPI.getEnt();
        if (typeof verifierEtAfficherEtatEntite === 'function') {
            await verifierEtAfficherEtatEntite(entite, pseudo, tabEnt);
        }
    } catch (err) {
        console.error("focaliserOccurrenceCorpus: erreur vérification", err);
    }

    // Défiler vers la ligne du tableau
    let ligne = pseudo
        ? document.querySelector(`tr.ligne-anon-gen[data-entite="${CSS.escape(entite)}"][data-pseudo="${CSS.escape(pseudo)}"]`)
        : null;
    if (!ligne) ligne = document.querySelector(`tr.ligne-anon-gen[data-entite="${CSS.escape(entite)}"]`);
    if (ligne) ligne.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Attendre l'apparition de l'accordéon cible (la modale est rendue de façon
    // asynchrone par afficherOccurrencesEnAccordeon, fire-and-forget depuis verifier...).
    if (!fondVerif) return;
    let accordeon = null;
    for (let i = 0; i < 50; i++) {
        accordeon = fondVerif.querySelector(
            `.accordion-entretien[data-ent-index="${CSS.escape(String(rkEnt))}"]`
        );
        if (accordeon) break;
        await new Promise(r => setTimeout(r, 100));
    }
    if (!accordeon) return;

    // Déplier l'accordéon de l'entretien cible
    const contenu = accordeon.children[1];
    if (contenu && contenu.style.display === 'none') {
        const header = accordeon.children[0];
        if (header) header.click();
    }

    // Défiler vers l'occurrence + flash
    await new Promise(r => setTimeout(r, 100));
    if (!spanId) return;
    const occDiv = accordeon.querySelector(`[data-occ-spanid="${CSS.escape(String(spanId))}"]`);
    if (occDiv) {
        occDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        occDiv.classList.remove('nav-highlight');
        void occDiv.offsetWidth;
        occDiv.classList.add('nav-highlight');
        setTimeout(() => occDiv.classList.remove('nav-highlight'), 2200);
    }
}

// Exposer la fonction pour qu'index.html puisse l'invoquer
if (typeof window !== 'undefined') {
    window.focaliserOccurrenceCorpus = focaliserOccurrenceCorpus;
}
