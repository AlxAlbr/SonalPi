/**
 * Module d'affichage de la table d'anonymisation globale
 * Affiche toutes les combinaisons anonymisation du corpus avec les entretiens concernés
 */

// reconstituerTabAnonGlobal a été déplacée dans anon-scan.js (refacto Tâche 3).

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
        afficherVerificationDansPanneau(anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus);
        
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
function afficherVerificationDansPanneau(anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus = []) {
    // Page dédiée : la vérification d'une entité s'affiche toujours dans la zone droite
    // (#fond_verif_anon), sous forme d'accordéons par entretien.
    const fondVerif = document.getElementById("fond_verif_anon");
    if (!fondVerif) return;
    // Mémoriser l'entité en cours de vérification pour le rafraîchissement automatique
    window._lastVerifiedAnon = { entite: anon.entite, pseudo: anon.remplacement };
    window._anonDetailDirty = false; // nouvelle entité affichée = nouvelle session sans modifications
    fondVerif.innerHTML = '';
    if (entretiensNonAnonymisee.length > 0 || entretiensAnonymisee.length > 0 || entretiensExclus.length > 0) {
        afficherOccurrencesEnAccordeon(fondVerif, anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus);
    } else {
        fondVerif.innerHTML = '<div style="padding:20px;color:#999;">Aucune occurrence trouvée.</div>';
    }
}

/**
 * Affiche les occurrences d'une entité dans une modale avec accordéons
 * @param {HTMLElement} fondVerif - Conteneur du panneau droit (#fond_verif_anon) où insérer la modale
 * @param {Object} anon - Paire {entite, remplacement}
 * @param {Array} entretiensNonAnonymisee - Entretiens non-anonymisés
 * @param {Array} entretiensAnonymisee - Entretiens anonymisés
 */
async function afficherOccurrencesEnAccordeon(fondVerif, anon, entretiensNonAnonymisee, entretiensAnonymisee, entretiensExclus = []) {
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
        
        // Légende des couleurs (en tête, avant le titre de l'entité)
        const legende = document.createElement("div");
        legende.style.cssText = "padding:8px 12px;background:#f5f5f5;border-bottom:1px solid #eee;font-size:11px;color:#555;display:flex;flex-direction:column;gap:5px;";
        legende.innerHTML = `
            <div style="display:flex;align-items:center;gap:14px;">
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="font-size:13px;line-height:1;">🚫</span> Mettre cette occurrence en exception</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="font-size:14px;line-height:1;color:#1976d2;">↗</span> Voir l'occurrence dans l'entretien</span>
            </div>
        `;
        scrollContainer.appendChild(legende);

        // Titre (après la légende)
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
        
        fondVerif.appendChild(modale);
        
    } catch (error) {
        console.error("Erreur dans afficherOccurrencesEnAccordeon():", error);
        fondVerif.textContent = "Erreur lors du chargement";
        fondVerif.style.color = "#d32f2f";
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
    const bgCouleur = toutEstTraite ? "#f1f8e9" : "#fff3e0";
    const labelCouleur = toutEstTraite ? "#558b2f" : "#f57c00";

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
        // Mettre à jour le fond du header selon l'état courant
        const toutTraite = nbNon === 0 && (nbApp + nbExc) > 0;
        header.style.backgroundColor = toutTraite ? '#f1f8e9' : '#fff3e0';
        label.style.color = toutTraite ? '#558b2f' : '#f57c00';
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
                // Case décochée : bouton exception complètement caché
                checkboxOcc.style.display = "";
                spanExceptionToggle.style.display = "none";
                btnException.style.display = "none";
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
            window._anonDetailDirty = true;
        });

        // Clic sur le bouton droit → active l'exception (seulement si la checkbox est cochée)
        btnException.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!checkboxOcc.checked) return;
            btnException._pendingExclusion = true;
            checkboxOcc.checked = false;
            appliquerEtatException(true);
            updateBtnExceptionState();
            mettreAJourTexteOcc();
            mettreAJourBadges();
            window._anonDetailDirty = true;
        });

        checkboxOcc.addEventListener("change", () => {
            updateBtnExceptionState();
            mettreAJourTexteOcc();
            mettreAJourBadges();
            window._anonDetailDirty = true;
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
                // Demander si des modifications sont en attente
                if (window._anonDetailDirty) {
                    const rep = await question(
                        'Modifications non enregistrées\nDes modifications n\'ont pas été validées. Voulez-vous les enregistrer avant d\'ouvrir l\'entretien ?',
                        ['Enregistrer', 'Ignorer', 'Annuler']
                    );
                    if (rep === 'annuler') return;
                    if (rep === 'enregistrer') {
                        const btnValider = document.querySelector('#fond_verif_anon .btn-primary');
                        if (btnValider) btnValider.click();
                        await new Promise(r => setTimeout(r, 400));
                    }
                    window._anonDetailDirty = false;
                }

                const occCat = occ.exclue ? 'exc' : occ.applique ? 'anon' : 'non';
                const occIdxInCat = occurrences
                    .slice(0, occurrences.indexOf(occ))
                    .filter(o =>
                        (occCat === 'exc'  &&  o.exclue) ||
                        (occCat === 'anon' && !o.exclue &&  o.applique) ||
                        (occCat === 'non'  && !o.exclue && !o.applique)
                    ).length;

                await window.electronAPI.setEntCur(entIndex);
                await window.electronAPI.editerEntretien(entIndex, {
                    entite: anon.entite,
                    pseudo: anon.remplacement,
                    spanId: occ.spanId,
                    occCat,
                    occIdxInCat
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
 * Ajuste la hauteur d'un textarea pour afficher tout son contenu sans barre de
 * défilement (les pseudos longs s'enroulent sur plusieurs lignes).
 * Nécessite que le textarea soit déjà inséré dans le DOM (scrollHeight = 0 sinon).
 * @param {HTMLTextAreaElement} ta
 */
function autoResizeTextarea(ta) {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
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
            const lignesMaj = [];
            if (totalAjouter   > 0) lignesMaj.push(`✅ ${totalAjouter} occurrence(s) anonymisée(s)`);
            if (totalRetirer   > 0) lignesMaj.push(`↩️ ${totalRetirer} occurrence(s) dé-pseudonymisée(s)`);
            if (totalExclure   > 0) lignesMaj.push(`🚫 ${totalExclure} exception(s) ajoutée(s)`);
            if (totalDesexclure > 0) lignesMaj.push(`🔓 ${totalDesexclure} exception(s) retirée(s)`);
            dialog('Message', `Changements enregistrés :\n${lignesMaj.join('\n')}`);
            window._anonDetailDirty = false;
            // Level 2 : mise à jour du cache sans invalider le scan global
            await mettreAJourCacheEntite(anon.entite, anon.remplacement);
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
 * Dimensionne le panneau gauche (table des pseudonymes) sur la largeur NATURELLE
 * de son tableau, au lieu du 33 % fixe qui tronquait les colonnes sur petit écran.
 * - Mesure la largeur réelle du tableau rendu (table.scrollWidth) : elle reflète la
 *   somme des colonnes même quand le panneau est trop étroit pour les afficher.
 * - Borne le résultat entre un minimum lisible et une fraction de la page (pour
 *   laisser de la place au panneau de droite).
 * - Ne fait RIEN si l'utilisateur a déjà choisi une largeur via le séparateur
 *   (valeur mémorisée en %), afin de respecter son réglage.
 * @param {HTMLElement} pageAnon - conteneur #divAnonGenPage
 * @param {HTMLElement} gauche - panneau gauche (.anon-page-gauche)
 * @param {HTMLTableElement} table - la table des pseudonymes
 */
function ajusterLargeurPanneauGauche(pageAnon, gauche, table) {
    if (!pageAnon || !gauche || !table) return;

    // Respecter une largeur déjà ajustée manuellement (mémorisée en %).
    const saved = parseFloat(localStorage.getItem('anonPageGaucheWidth'));
    if (!isNaN(saved)) return;

    const largeurTable = table.scrollWidth;
    if (!largeurTable) return; // page non encore visible : mesure impossible

    // Marge : padding gauche du conteneur + largeur d'une barre de défilement.
    const CHROME = 28;
    const largeurPage = pageAnon.getBoundingClientRect().width || window.innerWidth;
    const MIN_PX = 280;
    const MAX_PX = largeurPage * 0.65; // ne jamais dépasser 65 % pour garder le panneau droit utile

    const cible = Math.max(MIN_PX, Math.min(largeurTable + CHROME, MAX_PX));
    gauche.style.flexBasis = Math.round(cible) + 'px';
}

/**
 * Crée l'encart-légende repliable du panneau gauche (corpus), inspiré de
 * #legende-anon côté entretien. Comportement type « fenêtre » :
 *  - bouton « – » pour réduire, « ▢ » pour réagrandir ;
 *  - déployé à la 1re ouverture après chaque démarrage de l'app, puis l'état
 *    suit le choix de l'utilisateur pour le reste de la session
 *    (flag de session window._anonLegendeReduite, remis à zéro à chaque lancement).
 * Peut être rouvert via ouvrirLegendeCorpus() (bouton « ? »).
 * @returns {HTMLElement}
 */
function creerEncartLegendeCorpus() {
    // État de SESSION (window, remis à zéro à chaque lancement de l'app) plutôt que
    // localStorage : l'encart est déployé à la 1re ouverture après chaque démarrage,
    // et reste replié pour le reste de la session si l'utilisateur le replie.
    if (typeof window._anonLegendeReduite === 'undefined') {
        window._anonLegendeReduite = false; // 1er rendu de la session → déployé
    }

    const encart = document.createElement('div');
    encart.id = 'anon-corpus-legende';
    encart.className = 'anon-corpus-legende';

    const header = document.createElement('div');
    header.className = 'anon-corpus-legende-header';
    header.innerHTML = `<span style="font-weight:600;">ℹ️ Légende</span>`;

    const btnToggle = document.createElement('button');
    btnToggle.className = 'anon-corpus-legende-toggle';
    header.appendChild(btnToggle);

    const contenu = document.createElement('div');
    contenu.className = 'anon-corpus-legende-contenu';
    contenu.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="btn-nav-cat btn-nav-cat-anon" style="pointer-events:none;">N</span> anonymisées</span>
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="btn-nav-cat btn-nav-cat-exc" style="pointer-events:none;">N</span> exceptions</span>
            <span style="display:inline-flex;align-items:center;gap:3px;"><span class="btn-nav-cat btn-nav-cat-non" style="pointer-events:none;">N</span> à traiter</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#fff3e0;border:1px solid #ffb74d;display:inline-block;flex-shrink:0;"></span>ligne orange = occurrences à traiter</span>
            <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#e8f5e9;border:1px solid #a5d6a7;display:inline-block;flex-shrink:0;"></span>ligne verte = entièrement traité</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;border-top:1px solid #eee;padding-top:5px;">
            <span><strong>📂 Importer</strong> : ajoute des règles (entité→pseudo) depuis un ou plusieurs fichiers JSON ; en cas d'entité déjà définie, un choix est proposé.</span>
            <span><strong>📤 Exporter règles</strong> : règles en JSON, <em>réimportable</em> (dans ce corpus ou un autre).</span>
            <span><strong>💾 Exporter CSV</strong> : état du corpus (anonymisé/non par entretien) — <em>non réimportable</em>.</span>
        </div>
    `;

    encart.appendChild(header);
    encart.appendChild(contenu);

    const appliquerEtat = (reduit) => {
        contenu.style.display = reduit ? 'none' : '';
        btnToggle.textContent = reduit ? '▢' : '–';
        btnToggle.title = reduit ? 'Agrandir' : 'Réduire';
        encart.classList.toggle('reduit', reduit);
    };

    // État initial = état de session courant (déployé au 1er rendu, sinon dernier choix).
    let reduit = window._anonLegendeReduite;
    appliquerEtat(reduit);

    const toggle = () => {
        reduit = !reduit;
        window._anonLegendeReduite = reduit; // mémoriser pour la session (re-rendus du panneau)
        appliquerEtat(reduit);
    };
    btnToggle.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    header.addEventListener('click', toggle);

    // Hook d'ouverture pour le bouton « ? ».
    encart._ouvrir = () => { reduit = false; window._anonLegendeReduite = false; appliquerEtat(false); };

    return encart;
}

/**
 * Ouvre (déplie) l'encart-légende du corpus. Branché sur le bouton « ? ».
 * Réservé : pourra ouvrir une aide plus développée par la suite.
 */
function ouvrirLegendeCorpus() {
    const encart = document.getElementById('anon-corpus-legende');
    if (encart && encart._ouvrir) encart._ouvrir();
}

/**
 * Affiche la table d'anonymisation globale avec les combinaisons et entretiens associés
 * Affiche d'abord les entités sans tester leur présence - la vérification se fait via des boutons
 */
// mettreAJourCacheEntite, lancerScanCorpus et appliquerResultatsScan ont été
// déplacées dans anon-scan.js (refacto Tâche 3).

async function affichAnonGen() {
    console.log("lancement de affichAnonGen")
    try {
        // Récupérer la liste des entretiens
        const tabEnt = await window.electronAPI.getEnt();
        
        // NOUVELLE LOGIQUE: Reconstituer le tabAnon à chaque chargement
        // Appel de la fonction existante de gestion_corpus.js
        let conflitsPseudo = [];
        if (typeof reconstituerTabAnonGlobal === 'function') {
            conflitsPseudo = await reconstituerTabAnonGlobal(tabEnt) || [];
        }
        // Signaler ici (ouverture délibérée de l'onglet Pseudos) les conflits de pseudo détectés
        // — pas à chaque ouverture du corpus.
        if (typeof signalerConflitsPseudo === 'function') signalerConflitsPseudo(conflitsPseudo);

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
        // (afficherVerificationDansPanneau, verifierEtAfficherEtatEntite, focaliserOccurrenceCorpus)
        // sans la modifier. La page est persistante : recréée seulement si absente.
        let pageAnon = document.getElementById("divAnonGenPage");
        if (!pageAnon) {
            pageAnon = document.createElement("div");
            pageAnon.id = "divAnonGenPage";
            pageAnon.classList.add("fondtabdat");
            pageAnon.innerHTML = `
                <div id="anon-page-banner" class="header-tabdat" style="display:flex;align-items:center;height:50px;padding:0 10px;margin-bottom:0;border-bottom:1px solid #ccc;">
                    <h3 class="logo-anon" style="margin:0;flex:1;">Table Pseudonymisation (Corpus)</h3>
                    <div id="anon-stale-banner" style="display:none;align-items:center;gap:8px;margin-right:12px;padding:4px 10px;background:#fff3e0;border:1px solid #ffb74d;border-radius:4px;font-size:0.82rem;color:#e65100;">
                        ⚠️ Des entretiens ont été ouverts. Relancez l'analyse pour rafraîchir.
                        <button id="btn-scan-stale" class="btn btn-secondary" style="padding:4px 10px;font-size:0.82rem;">Scan</button>
                    </div>
                    <input type="file" id="file-import-corpus" multiple accept=".json" style="display:none;" onchange="importTableCorpus(this.files)">
                    <label id="btn-import-anon" class="btn btn-secondary" style="padding:10px;margin-right:6px" onclick="document.getElementById('file-import-corpus').click()" title="Importer une ou plusieurs tables de règles JSON (ajoute des règles au corpus)">Importer 📂</label>
                    <label id="btn-export-regles-anon" class="btn btn-secondary" style="padding:10px;margin-right:6px" onclick="exporterReglesCorpusJSON();" title="Exporter les règles (entité→pseudo) en JSON, réimportable dans un autre corpus">Exporter règles 📤</label>
                    <label id="btn-export-anon" class="btn btn-secondary" style="padding:10px;margin-right:6px" onclick="exporterTableCorpusCSV();" title="Exporter l'état du corpus en CSV (anonymisé/non par entretien) — non réimportable">Exporter CSV 💾</label>
                    <label id="btn-quit-anon" class="btn btn-secondary" style="padding:10px" onclick="hideAnonGen();" title="Fermer la table">Quitter ✖️</label>
                </div>
                <div id="anon-page-content" style="display:flex;flex:1;min-height:0;overflow:hidden;">
                    <div id="fond_anon_corpus" class="anon-page-gauche"></div>
                    <div id="anonPageResizer" class="anon-page-resizer" title="Glisser pour redimensionner"></div>
                    <div id="fond_verif_anon" class="anon-page-droite">
                        <div class="info-no-content" style="padding:10px">
                            <label style="width:100%;display:block;margin:5px">Cliquez sur 🔍 pour vérifier la présence d'une entité dans les entretiens.</label>
                        </div>
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

        // Gestion de la bannière de péremption dans le bandeau
        const staleBanner = document.getElementById('anon-stale-banner');
        const syncStaleBanner = () => {
            if (!staleBanner) return;
            const stale = !!window._anonScanCache && !!window._anonScanStale;
            staleBanner.style.display = stale ? 'flex' : 'none';
        };
        syncStaleBanner();
        const btnScanStale = document.getElementById('btn-scan-stale');
        if (btnScanStale) {
            // Remplacer le listener à chaque ouverture (évite les doublons)
            const newBtn = btnScanStale.cloneNode(true);
            btnScanStale.parentNode.replaceChild(newBtn, btnScanStale);
            newBtn.addEventListener('click', async () => {
                await lancerScanCorpus(tabEnt, anonValides, lignes, compteur);
                syncStaleBanner();
                syncGroupeFiltresEtat();
            });
        }

        // En-tête du panneau gauche (bouton ➕). Le scan manuel a été retiré :
        // l'analyse se lance automatiquement à l'ouverture (voir auto-scan plus bas),
        // et le rafraîchissement après modif d'entretien passe par la bannière « stale ».
        const divEntete = document.createElement("div");
        divEntete.style = "border-bottom:1px solid #ccc; padding:6px 10px; display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-shrink:0;";
        divEntete.innerHTML = `
            <label id="btn-add-anon" class="btn btn-primary" onclick="ajouterNouvelleEntiteAnonGen();" title="Ajouter une nouvelle entité">Ajouter une entité</label>
            <label id="btn-aide-anon" class="btn btn-secondary" onclick="ouvrirLegendeCorpus();" title="Afficher la légende / l'aide" style="font-weight:bold;">?</label>
        `;
        divAnonGen.appendChild(divEntete);

        // Encart-légende repliable (ouvert au 1er affichage, replié ensuite)
        divAnonGen.appendChild(creerEncartLegendeCorpus());

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
                ${nbConflits || nbCollisions ? `
                <optgroup label="Sans calcul (règles seules)">
                    ${nbConflits ? `<option value="conflits">Conflits de pseudo (${nbConflits})</option>` : ''}
                    ${nbCollisions ? `<option value="collisions">Collisions de pseudo (${nbCollisions})</option>` : ''}
                </optgroup>` : ''}
                <optgroup label="Avec vérification du corpus">
                    <option value="a_traiter">À traiter</option>
                    <option value="avec_exceptions">Avec exceptions</option>
                    <option value="bouclees">Entièrement anonymisées</option>
                    <option value="inutilisees">Inutilisées (0 occurrence)</option>
                </optgroup>
            </select>
            <input type="text" id="anon-gen-recherche" class="anon-gen-recherche"
                   placeholder="🔎 Rechercher (entité ou pseudo)…" autocomplete="off">
            <span id="anon-gen-compteur" class="anon-gen-compteur"></span>
        `;
        divAnonGen.appendChild(divFiltres);

        // Conteneur du tableau avec scroll
        const fondTab = document.createElement("div");
        // Le tableau prend toute la hauteur restante du panneau (flex column de divAnonGen)
        // et scrolle à l'intérieur : plus de nombre magique calc(100vh - …) à recalibrer.
        fondTab.style.flex = "1";
        fondTab.style.minHeight = "0";
        fondTab.style.overflow = "auto";
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
        thEntite.innerHTML = `Entité Originale <span class="sort-indicator"></span>`;
        thEntite.classList.add("header-col-ent", "th-sortable");
        thEntite.title = "Trier par entité originale";
        headerRow.appendChild(thEntite);

        const thRemplacement = document.createElement("th");
        thRemplacement.innerHTML = `Pseudonyme / Remplacement <span class="sort-indicator"></span>`;
        thRemplacement.classList.add("header-col-var", "th-sortable");
        thRemplacement.title = "Trier par pseudonyme";
        thRemplacement.style.minWidth = "200px";
        headerRow.appendChild(thRemplacement);

        const thEtat = document.createElement("th");
        thEtat.textContent = "État corpus";
        thEtat.classList.add("header-col-etat-corpus");
        thEtat.style.display = "none"; // visible seulement après un scan valide
        headerRow.appendChild(thEtat);

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

        // Dimensionner le panneau gauche sur la largeur réelle du tableau
        // (remplace le 33 % rigide qui tronquait les colonnes sur petit écran).
        ajusterLargeurPanneauGauche(pageAnon, fondAnonCorpus, table);

        // Ajuster la hauteur des champs pseudo (textarea) à leur contenu initial :
        // impossible à la création (hors DOM), donc fait une fois la table insérée.
        fondTab.querySelectorAll("textarea.anon-pseudo-input").forEach(autoResizeTextarea);

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
        const inputRecherche = document.getElementById("anon-gen-recherche");
        const compteur = document.getElementById("anon-gen-compteur");

        // Remonter le filtre dans l'en-tête, calé à gauche (les boutons restent à droite
        // grâce au margin-right:auto). Le câblage tient par l'id, donc le déplacement du
        // nœud DOM ne casse rien.
        if (selectFiltre && divEntete) {
            selectFiltre.style.marginRight = 'auto';
            divEntete.insertBefore(selectFiltre, divEntete.firstChild);
        }

        const FILTRES_ETAT = new Set(['a_traiter', 'avec_exceptions', 'bouclees', 'inutilisees']);

        // Masquer/afficher le groupe de filtres d'état selon disponibilité du scan
        const syncGroupeFiltresEtat = () => {
            const scanValide = !!window._anonScanCache && !window._anonScanStale;
            const optgroup = selectFiltre.querySelector('optgroup[label="Avec vérification du corpus"]');
            if (optgroup) optgroup.style.display = scanValide ? '' : 'none';
            // Si le filtre actif est d'état et scan invalide, repasser sur "toutes"
            if (!scanValide && FILTRES_ETAT.has(selectFiltre.value)) {
                selectFiltre.value = 'toutes';
            }
        };
        syncGroupeFiltresEtat();

        const appliquerFiltrePseudos = () => {
            const filtre = selectFiltre.value;
            const recherche = (inputRecherche.value || '').trim().toLowerCase();
            const estEtat = FILTRES_ETAT.has(filtre);
            const stats = window._anonScanCache;

            let nbVisibles = 0;
            for (const tr of lignes) {
                const e = (tr.dataset.entite || '').trim();
                const pData = (tr.dataset.pseudo || '').trim();
                const inputP = tr.querySelector('.anon-pseudo-input');
                const p = (inputP ? inputP.value : pData).trim();

                let ok = true;
                if (filtre === 'conflits') ok = entitesEnConflit.has(e);
                else if (filtre === 'collisions') ok = pseudosEnCollision.has(pData);
                else if (estEtat) {
                    const st = stats ? stats.get(`${e}|${pData}`) : null;
                    if (!st) ok = false;
                    else if (filtre === 'a_traiter') ok = st.nbNon >= 1;
                    else if (filtre === 'avec_exceptions') ok = st.nbExc >= 1;
                    else if (filtre === 'bouclees') ok = (st.nbAnon + st.nbExc) > 0 && st.nbNon === 0;
                    else if (filtre === 'inutilisees') ok = (st.nbAnon + st.nbExc + st.nbNon) === 0;

                }

                if (ok && recherche) {
                    ok = e.toLowerCase().includes(recherche) || p.toLowerCase().includes(recherche);
                }

                tr.style.display = ok ? '' : 'none';
                if (ok) nbVisibles++;
            }
            compteur.textContent = `${nbVisibles} / ${lignes.length}`;
        };

        // === TRI PAR COLONNE (clic sur l'en-tête Entité ou Pseudonyme) ===
        const triState = { col: 'entite', sens: 1 }; // défaut : Entité A→Z

        const valeurTri = (tr, col) => {
            if (col === 'pseudo') {
                const inp = tr.querySelector('.anon-pseudo-input');
                return (inp ? inp.value : (tr.dataset.pseudo || '')).trim();
            }
            return (tr.dataset.entite || '').trim();
        };

        const rendreIndicateursTri = () => {
            [[thEntite, 'entite'], [thRemplacement, 'pseudo']].forEach(([th, col]) => {
                const ind = th.querySelector('.sort-indicator');
                if (!ind) return;
                const actif = triState.col === col;
                ind.textContent = actif ? (triState.sens === 1 ? '▲' : '▼') : '↕';
                ind.style.opacity = actif ? '1' : '0.3';
            });
        };

        const trierTable = () => {
            [...lignes]
                .sort((a, b) => valeurTri(a, triState.col)
                    .localeCompare(valeurTri(b, triState.col), 'fr', { sensitivity: 'base' }) * triState.sens)
                .forEach(tr => tbody.appendChild(tr));
            rendreIndicateursTri();
        };

        const clicTriColonne = (col) => {
            if (triState.col === col) triState.sens = -triState.sens; // même colonne → on inverse
            else { triState.col = col; triState.sens = 1; }           // nouvelle colonne → A→Z
            trierTable();
        };

        thEntite.addEventListener('click', () => clicTriColonne('entite'));
        thRemplacement.addEventListener('click', () => clicTriColonne('pseudo'));

        if (selectFiltre && inputRecherche && compteur) {
            selectFiltre.addEventListener('change', appliquerFiltrePseudos);
            inputRecherche.addEventListener('input', appliquerFiltrePseudos);
            appliquerFiltrePseudos();
        }
        trierTable(); // applique le tri par défaut (Entité A→Z) + affiche les indicateurs

        // === AUTO-SCAN À L'OUVERTURE ===
        // - Cache valide  → on réaffiche l'état immédiatement, sans rescanner.
        // - Aucun cache   → premier affichage : scan automatique en arrière-plan
        //                   (silencieux, table utilisable, l'état se remplit ensuite).
        // - Cache périmé  → on ne rescanne PAS ici : la bannière « Actualiser » s'en charge
        //                   (un rescan auto après modif d'entretien serait coûteux/surprenant).
        if (window._anonScanCache && !window._anonScanStale) {
            appliquerResultatsScan(window._anonScanCache, lignes);
        } else if (!window._anonScanCache && anonValides.length > 0) {
            if (compteur) compteur.textContent = '⏳ Analyse du corpus…';
            lancerScanCorpus(tabEnt, anonValides, lignes, compteur, true)
                .then(() => {
                    syncStaleBanner();
                    syncGroupeFiltresEtat();
                    appliquerFiltrePseudos();
                })
                .catch(err => console.error('[Auto-scan] échec :', err));
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
    // textarea (et non input) pour que les pseudos longs s'enroulent sur plusieurs
    // lignes au lieu de défiler horizontalement. La hauteur s'ajuste au contenu et
    // les retours à la ligne sont bloqués : la valeur reste une seule ligne logique.
    const tdRemplacement = document.createElement("td");
    const inputPseudo = document.createElement("textarea");
    inputPseudo.className = "anon-pseudo-input";
    inputPseudo.dataset.entite = anon.entite;
    inputPseudo.value = anon.remplacement;
    inputPseudo.placeholder = "Pseudonyme";
    inputPseudo.rows = 1;
    inputPseudo.addEventListener("input", () => autoResizeTextarea(inputPseudo));
    inputPseudo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault(); // pas de saut de ligne dans un pseudo
    });
    tdRemplacement.appendChild(inputPseudo);
    tr.appendChild(tdRemplacement);

    // Colonne 3: État corpus (cachée par défaut, visible après un scan valide)
    const tdEtat = document.createElement("td");
    tdEtat.classList.add("td-etat-corpus");
    tdEtat.style.display = "none";
    tdEtat.style.textAlign = "center";
    tdEtat.style.padding = "4px 8px";
    tr.appendChild(tdEtat);

    // Colonne 4: Actions
    const tdActions = document.createElement("td");
    tdActions.style.minWidth = "120px";
    tdActions.style.textAlign = "center";
    tdActions.style.paddingTop = "8px";
    tdActions.style.paddingBottom = "8px";
    
    // Bouton Vérifier pour cette entité
    const btnVerifier = document.createElement("button");
    btnVerifier.textContent = "🔍";
    btnVerifier.style.height = "33px";
    btnVerifier.style.width = "33px";
    btnVerifier.style.padding = "5px";
    btnVerifier.style.fontSize = "16px";
    btnVerifier.style.lineHeight = "1";
    btnVerifier.classList.add("btn");
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
        await persisterReglesCorpus(tabAnon);
        
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
async function hideAnonGen() {
    if (window._anonDetailDirty) {
        const rep = await question(
            'Modifications non enregistrées\nDes modifications dans le panneau de détail n\'ont pas été validées. Voulez-vous les enregistrer avant de quitter ?',
            ['Enregistrer', 'Ignorer', 'Annuler']
        );
        if (rep === 'annuler') return;
        if (rep === 'enregistrer') {
            const btnValider = document.querySelector('#fond_verif_anon .btn-primary');
            if (btnValider) btnValider.click();
            // Laisser la sauvegarde se terminer avant de fermer
            await new Promise(r => setTimeout(r, 400));
        }
        window._anonDetailDirty = false;
    }
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

        // Une entité = UN pseudo (décision « corpus autoritaire »). On vérifie au niveau ALIAS
        // (insensible à la casse) : si un alias en jeu (y compris dans un groupe "A/B") est déjà
        // pris par une règle, on n'ajoute jamais un second pseudo (sinon ligne fantôme : la
        // persistance, dédupliquée par alias, n'en garderait qu'un).
        const tabAnonGlobal = await window.electronAPI.getAnon();
        const existante = regleEnCollisionAlias(entite, tabAnonGlobal);

        if (existante) {
            if (cleAnon(existante.entite, existante.remplacement) === cleAnon(entite, pseudo)) {
                question(`La combinaison "${entite}" → "${pseudo}" existe déjà.`, ['OK']);
            } else {
                question(`L'entité « ${existante.entite} » a déjà le pseudonyme « ${existante.remplacement} ». ` +
                         `Une entité ne peut avoir qu'un seul pseudonyme : modifiez la règle existante pour le changer.`, ['OK']);
            }
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
        await persisterReglesCorpus(tabAnonGlobal);

        // Fermer la modale
        overlay.remove();

        // Ajouter une nouvelle ligne au tableau
        ajouterLigneAuTableauAnonGen(nouvelleEntite);

        // Level 2 : si un scan valide existe, calculer l'état de cette nouvelle entité
        // et l'ajouter au cache sans invalider le scan global.
        if (window._anonScanCache && !window._anonScanStale && window._anonIndexInverse) {
            const key = `${entite}|${pseudo}`;
            window._anonScanCache.set(key, { nbAnon: 0, nbExc: 0, nbNon: 0, nbEntretiens: 0 });
            // mettreAJourCacheEntite rend la td visible et écrit les badges
            await mettreAJourCacheEntite(entite, pseudo);
            const thEtat = document.querySelector('.header-col-etat-corpus');
            if (thEtat) thEtat.style.display = '';
        }
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
    await persisterReglesCorpus(tabAnon);

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
 * Exporte les RÈGLES du corpus (entité→pseudo) en JSON, au format de la table de
 * correspondance [{ entite_init, entite_pseudo }, ...] — donc **réimportable** via 📂 Importer
 * (dans ce corpus ou un autre). À distinguer de exporterTableCorpusCSV (rapport d'état, non
 * réimportable).
 */
async function exporterReglesCorpusJSON() {
    const tabAnonGlobal = (await window.electronAPI.getAnon()) || [];
    const correspondances = tabAnonGlobal
        .filter(a => a.entite && a.entite.trim() && a.remplacement && a.remplacement.trim())
        .map(a => ({ entite_init: a.entite.trim(), entite_pseudo: a.remplacement.trim() }));

    if (correspondances.length === 0) {
        dialog('Message', 'Aucune règle à exporter.');
        return;
    }

    const json = JSON.stringify(correspondances, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `regles_corpus_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    question(`Export réussi : ${correspondances.length} règle(s) exportée(s).`, ['OK']);
}

/**
 * Import d'une (ou plusieurs) table(s) de correspondance JSON au niveau du CORPUS.
 * Contrairement à l'entretien (qui applique au texte ouvert), ici on AJOUTE des règles
 * au tabAnon global (.crp). Réutilise le moteur de conflits partagé (anon-correspondance.js)
 * avec un callback d'application propre au corpus.
 * @param {FileList} files
 */
async function importTableCorpus(files) {
    if (!files || files.length === 0) return;

    // Lire + parser + valider tous les fichiers
    const allCorrespondances = [];
    for (const file of Array.from(files)) {
        try {
            const arr = JSON.parse(await file.text());
            if (!Array.isArray(arr)) throw new Error("le fichier n'est pas un tableau JSON");
            arr.forEach(c => {
                if (!c.entite_init || !c.entite_pseudo) {
                    throw new Error("chaque correspondance doit avoir 'entite_init' et 'entite_pseudo'");
                }
                allCorrespondances.push(c);
            });
        } catch (e) {
            if (typeof notifErreur === 'function') notifErreur(`Erreur lecture ${file.name} :\n${e.message}`);
            else dialog('Erreur', `Erreur lecture ${file.name} : ${e.message}`);
        }
    }

    // Réinitialiser l'input (permet de recharger le même fichier)
    const input = document.getElementById('file-import-corpus');
    if (input) input.value = '';

    if (allCorrespondances.length === 0) {
        dialog('Message', 'Aucune correspondance valide trouvée dans le(s) fichier(s).');
        return;
    }

    // Règles déjà présentes dans le corpus (toutes les paires entité→pseudo du global).
    const reglesExistantes = (await window.electronAPI.getAnon() || [])
        .filter(a => a.entite && a.remplacement)
        .map(a => ({ entite: a.entite, remplacement: a.remplacement }));

    // Moteur partagé : détecte les conflits (entité déjà mappée) et applique via le callback corpus.
    traiterImportCorrespondances(allCorrespondances, {
        reglesExistantes,
        appliquer: appliquerImportCorpus
    });
}

/**
 * Applique au CORPUS les correspondances retenues (après résolution des conflits) :
 * ajoute les règles au tabAnon global, persiste le .crp, met à jour la table et le cache de scan.
 * @param {Array<{entite_init:string, entite_pseudo:string}>} correspondances
 */
async function appliquerImportCorpus(correspondances) {
    const tabAnonGlobal = (await window.electronAPI.getAnon()) || [];
    let ajoutes = 0;
    let doublons = 0;
    const nouvelles = [];

    for (const corr of correspondances) {
        const entite = (corr.entite_init || '').trim();
        const pseudo = (corr.entite_pseudo || '').trim();
        if (!entite || !pseudo) continue;

        // Une entité = UN pseudo (corpus autoritaire) : si un alias en jeu est déjà pris (insensible
        // à la casse, quel que soit son pseudo, y compris via un groupe "A/B"), on n'ajoute pas de
        // second pseudo → on l'ignore (compté en « déjà présente(s) »). La résolution « remplacer »
        // passe par le dialogue de conflit d'import (traiterImportCorrespondances), pas par cet ajout direct.
        const existe = regleEnCollisionAlias(entite, tabAnonGlobal) !== null;
        if (existe) { doublons++; continue; }

        const regle = { entite, remplacement: pseudo, occurrences: 0, indexCourant: 0, matchPositions: [] };
        tabAnonGlobal.push(regle);
        nouvelles.push(regle);
        ajoutes++;
    }

    if (ajoutes > 0) {
        // Persister (règles propres uniquement, cf. persisterReglesCorpus)
        await persisterReglesCorpus(tabAnonGlobal);

        for (const r of nouvelles) {
            await ajouterLigneAuTableauAnonGen(r);
            // Level 2 : si un scan valide existe, calculer l'état de la nouvelle entité sans l'invalider
            if (window._anonScanCache && !window._anonScanStale && window._anonIndexInverse) {
                window._anonScanCache.set(`${r.entite}|${r.remplacement}`, { nbAnon: 0, nbExc: 0, nbNon: 0, nbEntretiens: 0 });
                await mettreAJourCacheEntite(r.entite, r.remplacement);
            }
        }
    }

    let message = `✅ Import corpus : ${ajoutes} règle(s) ajoutée(s).`;
    if (doublons > 0) message += `\n⚠️ ${doublons} règle(s) déjà présente(s) (ignorée(s)).`;
    question(message, ['OK']);
}

/**
 * Exporte l'état du corpus en CSV : une ligne par règle (entité, pseudo) avec, par entretien,
 * ✅ anonymisé / ❌ non-anonymisé. À distinguer de l'export/import JSON de la table de
 * correspondance (les règles seules), géré par anon-correspondance.js / anon-import_export.js.
 */
async function exporterTableCorpusCSV() {
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
// ajouterStylesAnonGen a été déplacée dans anon-styles.js (refacto Tâche 3).

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
