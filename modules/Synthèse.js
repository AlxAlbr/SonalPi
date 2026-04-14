// Variables globales pour la synthèse
var tabExt = []; // tableau des extraits sélectionnés

async function synthese(critereEt){ // fonction permettant de compiler toutes les parties d'entretien relatives au(x) thème(s) sélectionné(s)

 if (tabThm.length == 0){
  tabThm = await window.electronAPI.getThm()
}
if (tabEnt.length == 0){
  tabEnt = await window.electronAPI.getEnt()
}

    let tabHtml = await window.electronAPI.getHtml();
//console.log("début de la synthèse. TabTHm=" + JSON.stringify (tabThm) + " / tabEnt=" + JSON.stringify (tabEnt) );



    // Fonction utilitaire : traite le texte d'un extrait (anonymisation + ponctuation)
    function traiterTexteExtrait(spans) {
        let texte = "";
        let locuteurs = new Set();
        let categories = new Set();
        let nbInterv = 0;

        spans.forEach(mot => {
            // Gestion des locuteurs (ajoute un préfixe)
            if (mot.classList.contains('ligloc')) {
                nbInterv++;
                if (nbInterv > 1) {
                    texte += "\n" + mot.dataset.nomloc.replace("?", "") + ": \n- ";
                } else {
                    texte += mot.dataset.nomloc.replace("?", "") + ": ";
                }
                locuteurs.add(mot.dataset.nomloc.replace("?", "").trim());
            }
            
            // Gestion de l'anonymisation (indépendant du traitement ci-dessus)
            if (mot.classList.contains('anon')) {
                if (mot.classList.contains('finsel')) {
                    texte += mot.dataset.pseudo ? "[" + mot.dataset.pseudo + "]" : "[anonyme]";
                }
                // sinon ignorer ce mot (ne rien ajouter)
            } else {
                // Pas d'anonymisation, ajouter le texte du mot
                texte += mot.innerText;
            }

            // Récupérer les catégories
            const thmClasses = Array.from(mot.classList).filter(c => c.startsWith('cat_'));
            thmClasses.forEach(c => {
                const thm = tabThm.find(t => t.code === c);
                if (thm) categories.add(thm.nom.split('//')[0].trim());
            });
        });

        // Correction des espaces avant et après la ponctuation
        texte = texte.replace(/\s+([,.!?:;])/g, "$1"); // supprime les espaces avant la ponctuation
        texte = texte.replace(/([,.!?:;])([^\s\n»])/g, "$1 $2"); // ajoute un espace après la ponctuation si manquant

        return {
            texte: texte,
            locuteurs: Array.from(locuteurs),
            categories: Array.from(categories)
        };
    }

    function finalizeExtrait(extrait, fin, entretien, resetLocCur) {
        extrait.fin = fin;
        const traitement = traiterTexteExtrait(extrait.texte);
        
        tabExt.push({
            ...extrait,
            entretien,
            texteTraite: traitement.texte,
            locuteurs: traitement.locuteurs,
            categories: traitement.categories
        });
        
        if (resetLocCur) resetLocCur(); // réinitialisation du locuteur courant
    }

    function titreEnt(entretien){
        let ent = document.createElement('div');
        ent.classList.add("titreent");
        ent.classList.add("titreentsynth");
        ent.innerText = tabEnt[entretien].nom;
        ent.dataset.ent = entretien;
        return ent;
    }

    async function variablesEnt(entretien){
        let vrEnt = document.createElement('div');
        vrEnt.classList.add("ligne-variables-ent");
        vrEnt.innerHTML = (await varsPubliquesEnt(entretien))[0]; // ajout des variables publiques dans l'entête;
        vrEnt.dataset.ent = entretien;
        return vrEnt;
    }

    function titreEntPlan(entretien){
        let ent = document.createElement('div');
        ent.classList.add("titreplansynth");
        ent.innerText = tabEnt[entretien].nom;
        ent.dataset.nbXtr = 0;
        ent.dataset.ent = entretien;

         
        ent.addEventListener('click', () => {
        
            // recherche du titreent avec le même data-ent dans le divSynthese
            const divSynthese = document.getElementById("divSynthese");
            const titreEntSynth = divSynthese.querySelector(`.titreent[data-ent='${entretien}']`);

            //scroll jusqu'à ce titreent
            if (titreEntSynth){
                titreEntSynth.scrollIntoView({behavior: "smooth", block: "start"});
            }

        });

        return ent;
    }

    function nbXtrPlansynth(){
        const titres = document.querySelectorAll('.titreplansynth');
        titres.forEach(titre => {
            const ent = titre.dataset.ent;
            const nbXtr = tabExt.filter(extrait => extrait.entretien == ent).length;
            titre.dataset.nbXtr = nbXtr;

            // créer une div contenant le nombre d'extraits
            let nbX = document.createElement('div')
            nbX.classList.add('nbxtrplansynth')
            nbX.innerText = nbXtr 

            titre.appendChild(nbX)
            //titre.innerText = tabEnt[ent].nom + " (" + nbXtr + " extrait" + (nbXtr>1?"s":"") +")";
        });
    }

    function prefixe(tabmots, m){//fonction permettant de récupérer les mots précédents le début de l'extrait

        let chaine = []
        let iter = 0
        for (let i=m-2; i>m-50; i--){

            if (i<0){continue;}
            if (tabmots[i].classList.contains("lblseg")){continue;} // on ne garde que les mots qui ne sont pas des segments
            iter++
            opac = 0.8 - (iter/20)
            if (opac < 0.1){opac = 0.1;}

            let spn = tabmots[i].cloneNode(true); // clone le mot
            spn.style.opacity=opac;

            spn.classList.add('prefixe' );
            
            chaine.splice(0,0,spn);



        }
                // dernier span (...) pour signifier la coupure

                let spn = document.createElement('span');
                spn.style.opacity=opac;
                spn.classList.add('prefixe' );
                spn.
                spn.innerText = "... ";
                chaine.splice(0,0,spn);


        return chaine ;
    }

    function suffixe(tabmots, m){//fonction permettant de récupérer les mots suivant la fin  de l'extrait

        let chaine = []

        for (let i=m+1; i<m +11; i++){

            if (i>=tabmots.length){continue;}
            if (tabmots[i].classList.contains("lblseg")){continue;} // on ne garde que les mots qui ne sont pas des segments

            let spn = tabmots[i].cloneNode(true); // clone le mot
            spn.classList.add('prefixe');
            chaine.push(spn);

        }


        return chaine ;
    }


    function afficherContexte(extrait) {
        const existing = document.getElementById('divContexteExtrait');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'divContexteExtrait';
        overlay.classList.add('contexte-extrait-overlay');

        // En-tête avec titre et bouton fermer
        const header = document.createElement('div');
        header.classList.add('contexte-extrait-header');
        const titre = document.createElement('span');
        titre.innerText = 'Contexte — ' + tabEnt[extrait.entretien].nom;
        const btnClose = document.createElement('button');
        btnClose.classList.add('btn-close-contexte');
        btnClose.innerText = '✖';
        btnClose.title = 'Fermer';
        btnClose.addEventListener('click', () => overlay.remove());
        header.appendChild(titre);
        header.appendChild(btnClose);
        overlay.appendChild(header);

        // Contenu de l'entretien
        const contenu = document.createElement('div');
        contenu.classList.add('contexte-extrait-contenu');
        let html = tabHtml[extrait.entretien];
        if (html) html = html.replace(/`/g, '');
        contenu.innerHTML = html || '';

        // Mise en évidence des mots de l'extrait
        const spans = contenu.querySelectorAll('span');
        let premierSpan = null;
        for (let idx = extrait.debut - 1; idx <= extrait.fin - 2; idx++) {
            if (spans[idx]) {
                spans[idx].classList.add('highlight-contexte');
                if (!premierSpan) premierSpan = spans[idx];
            }
        }

        overlay.appendChild(contenu);
        document.body.appendChild(overlay);

        if (premierSpan) {
            requestAnimationFrame(() => {
                const offsetInContenu = premierSpan.offsetTop - contenu.offsetTop;
                contenu.scrollTop = offsetInContenu - contenu.clientHeight / 2 + premierSpan.offsetHeight / 2;
            });
        }
    }

    function getLocSynth(entretien, loc){ // fonction permettant de récupérer le nom du locuteur à partir de son entretien d'origine et de son code
       
        let locNom = "inconnu";
        let tabloc = tabEnt[entretien].tabLoc;
        if (tabloc) {
            locNom = tabloc[loc];
        } else {"pas de tabloc"}

        return locNom;
    }

    // Réinitialiser tabExt pour la nouvelle synthèse
    tabExt = [];

    // Créer un conteneur temporaire pour analyser le HTML
    const tempContainer = document.createElement('div');

    // création d'une div pour afficher le tableau

    const divSynthese = document.createElement("div");
    divSynthese.id = "divSynthese";
        divSynthese.innerHTML = `
        <div id="header-synthese" class="header-tabdat" style="height:50px;"> 
            <h3 class="logo-filtre" style="margin-left:10px;">Extraits sélectionnés
                <label id="btn-quit" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px;margin-right:8px" onclick="hideSynthese();">Quitter ✖️</label>
                <label id="btn-export-dat" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px" onclick="exportSynthese();">Exporter 📥</label>

            </h3>
        </div>
        `;
    divSynthese.classList.add("fondtabdat");
    document.body.appendChild(divSynthese);

    const divFondSynth = document.createElement("div");
    divFondSynth.id = "fondSynthese";
    divFondSynth.classList.add("fondsynth");
        // Make the content area sit clearly under the header (like in Base de données)
        divFondSynth.style.overflow = "auto";
        divFondSynth.style.maxHeight = "calc(100vh - 80px)";
        divFondSynth.style.paddingLeft = "10px";
        // append inside the synthese container so header stays above content
        divSynthese.appendChild(divFondSynth);

    divFondSynth.addEventListener('contextmenu', function(event) {
        event.preventDefault();
        event.stopPropagation();

        const oldMenu = document.getElementById('ctx-menu-fondsynth');
        if (oldMenu) oldMenu.remove();

        const selection = window.getSelection();
        const texteSelectionne = selection ? selection.toString().trim() : '';

        const menu = document.createElement('div');
        menu.id = 'ctx-menu-fondsynth';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 2px 2px 6px rgba(0,0,0,0.2);
            z-index: 9999;
            min-width: 180px;
            font-size: 0.9em;
            cursor: default;
        `;

        const itemCopier = document.createElement('div');
        itemCopier.innerText = '📋 Copier';
        itemCopier.style.cssText = 'padding: 6px 12px;';
        itemCopier.style.opacity = texteSelectionne ? '1' : '0.4';
        itemCopier.style.pointerEvents = texteSelectionne ? 'auto' : 'none';
        itemCopier.addEventListener('mouseenter', () => itemCopier.style.background = '#f0f0f0');
        itemCopier.addEventListener('mouseleave', () => itemCopier.style.background = '');
        itemCopier.addEventListener('click', () => {
            navigator.clipboard.writeText(texteSelectionne).catch(() => {
                document.execCommand('copy');
            });
            menu.remove();
        });
        menu.appendChild(itemCopier);

        document.body.appendChild(menu);

        const fermerMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', fermerMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', fermerMenu), 0);
    });

    const divPlanSynth = document.createElement("div");
    divPlanSynth.id = "planSynthese";
    divPlanSynth.classList.add("plansynth");
    divFondSynth.appendChild (divPlanSynth);

    // Fonction pour traiter un entretien
    async function traiterEntretien(i) {
        return new Promise((resolve) => {
            // Mise à jour de l'interface utilisateur
            document.getElementById('status-bar').innerText = "Analyse de l'entretien " + (i+1) + " / " + tabEnt.length + " ...";
            document.getElementById('progress-bar').style.width = ((i+1)/tabEnt.length)*100 + "%";

            //let html = await window.electronAPI.getHtml(i)
            let html = tabHtml[i];
            if (html) {html = html.replace(/`/g,'')} // suppression des backticks qui posent problème dans le DOM

            tempContainer.innerHTML = html;
            const mots = tempContainer.querySelectorAll('span');

            let  m=0 // initialisation du rang des mots
            let extraitEnCours = false;
            let extrait = { debut: 0, fin: 0, texte: [] };
            let locCur = -1; // initialisation du locuteur courant

            for (let mot of mots) {
                m++;

                if (!mot.classList || mot.classList.length === 0) {
                            
                    if (extraitEnCours) {
                        extraitEnCours = false;
                        //extrait.texte.push (...suffixe(mots,m));  
                        finalizeExtrait(extrait, m, i, () => { locCur = -1; });
                        extrait = { debut: 0, fin: 0, texte: [] };
                        continue; // passer au mot suivant
                    }
                }    

                if (!mot.classList.contains('lblseg')) {
                    let estActif = false;

                    //console.log("analyse du mot " + m + " / " + mots.length + " de l'entretien " + (i+1) + "classlist : " + mot.classList.value );

                    // vérification si le mot appartient aux catégories actives
                    if (critereEt) {
                        // ET avec exception famille : chaque groupe doit être satisfait
                        // (OR à l'intérieur d'une famille complète, AND entre groupes)
                        estActif = groupesEt.length > 0 && groupesEt.every(
                            groupe => [...groupe].some(code => mot.classList.contains(code))
                        );
                    } else {
                        // OU : le mot contient AU MOINS UNE catégorie active
                        for (let cls of mot.classList) {
                            if (cls.startsWith('cat_')) {
                                estActif = thmActifs.some(th => th.code === cls);
                                if (estActif) break;
                            }
                        }
                    }



                    if (estActif == true) {


                        //mot.classList.value=""; // réinitialisation des classes du mot pour la synthèse

                        // y'a-t-il changement de locuteur ?

                                let loc = mot.parentNode.dataset.loc;
                                let locNom = getLocSynth(i, loc);

                                if (loc != locCur){
                                    mot.classList.add('ligloc');
                                    mot.dataset.nomloc = locNom;
                                    locCur = loc;
                                }


                        if (!extraitEnCours) {
                            extraitEnCours = true;
                            extrait.debut = m;
                            //extrait.texte.push (...prefixe(mots,m));

                            extrait.texte.push (mot);
                            extrait.classes = mot.classList.value.split(" ");
                            } else {

                            extrait.texte.push (mot);
                        }
                    } else {
                        if (extraitEnCours) {
                            extraitEnCours = false;
                            //extrait.texte.push (...suffixe(mots,m));  
                            finalizeExtrait(extrait, m, i, () => { locCur = -1; });
                            extrait = { debut: 0, fin: 0, texte: [] };
                        }
                    }
                }
            }

            if (extraitEnCours) {
                //extrait.texte.push (...suffixe(mots,m));
                finalizeExtrait(extrait, m, i, () => { locCur = -1; });
            }

            // Utiliser setTimeout pour permettre la mise à jour de l'interface
            setTimeout(() => {
                resolve();
            }, 0);
        });
    }

    // Pré-calcul des catégories actives (utilisé par le critère ET)
    const thmActifs = tabThm.filter(th => th.act === true || th.act === "true");

    // Regroupe les actifs en familles : si un parent ET toute sa descendance sont actifs,
    // ils forment un groupe OR (l'un suffit). Sinon chaque actif est un groupe solo (AND).
    function buildGroupesEt(actifs, thm) {
        const activeSet = new Set(actifs.map(th => th.code));
        const groupes = [];
        const visites = new Set();
        for (let i = 0; i < thm.length; i++) {
            const th = thm[i];
            if (!activeSet.has(th.code) || visites.has(th.code)) continue;
            const rangParent = Number(th.rang ?? 0);
            // collecter toute la descendance directe/indirecte
            const famille = [th];
            let j = i + 1;
            while (j < thm.length && Number(thm[j].rang ?? 0) > rangParent) {
                famille.push(thm[j]);
                j++;
            }
            // la famille complète = parent + descendants tous actifs
            const familleComplete = famille.length > 1 && famille.every(m => activeSet.has(m.code));
            if (familleComplete) {
                groupes.push(new Set(famille.map(m => m.code)));
                famille.forEach(m => visites.add(m.code));
            } else {
                groupes.push(new Set([th.code]));
                visites.add(th.code);
            }
        }
        return groupes;
    }

    const groupesEt = critereEt ? buildGroupesEt(thmActifs, tabThm) : [];

    // Traitement asynchrone des entretiens (entretiens inactifs exclus)
    for (let i = 0; i < tabHtml.length; i++) {
        if (tabEnt[i] && tabEnt[i].actif === 0) continue;
        await traiterEntretien(i);
    }

        //suppression du conteneur temporaire

        tempContainer.remove();


        // affichage du tableau des extraits
        const conteneur = divFondSynth;

        //conteneur.innerHTML="";

        // défilement des extraits
        console.log("il y a " + tabExt.length + " extraits à afficher dans la synthèse");

        for (let i=0; i<tabExt.length; i++){

            if (i>0){
                if (tabExt[i].entretien != tabExt[i-1].entretien){
                    conteneur.appendChild(titreEnt(tabExt[i].entretien));
                    conteneur.appendChild(await variablesEnt(tabExt[i].entretien));
                    divPlanSynth.appendChild(titreEntPlan(tabExt[i].entretien));
                }
            }   else {conteneur.appendChild(titreEnt(tabExt[i].entretien));
                    conteneur.appendChild(await variablesEnt(tabExt[i].entretien));
                    divPlanSynth.appendChild(titreEntPlan(tabExt[i].entretien));
            }

            // création de la div de l'extrait
            const div = document.createElement('div');
            div.classList.add("extrait-synthese");
            div.dataset.description = "Extrait " + (i+1) + " / " + tabExt.length;


            conteneur.appendChild(div);
            
            // boutton de copie de l'extrait
            const btnCopy = document.createElement('div');
            btnCopy.classList.add('btn-copy-extrait');
            
            btnCopy.title = "Copier l'extrait dans le presse-papiers";
            btnCopy.addEventListener('click', async () => {
                
                // Utiliser le texte traité directement
                let textCopié = "« " + (tabExt[i].texteTraite || "") + " »\n";
                
                // Ajout des infos sur l'entretien
                textCopié += "Entretien : " + tabEnt[tabExt[i].entretien].nom + " " + (await varsPubliquesXtr(tabExt[i]))[1] + "\n";

                // HTML version (plus simpliste, basée sur le texte traité)
                let htmlCopié = "<p>« " + (tabExt[i].texteTraite || "").replace(/\n/g, '<br>') + " »</p>";
                htmlCopié += "<em>Entretien : " + tabEnt[tabExt[i].entretien].nom + " " + (await varsPubliquesXtr(tabExt[i]))[1] + "</em><br>";

                const blobHtml = new Blob([htmlCopié], { type: 'text/html' });
                const blobText = new Blob([textCopié], { type: 'text/plain' });
                navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]).then(() => {
                   btnCopy.classList.add('btn-copied-extrait');
                   setTimeout(() => {
                    btnCopy.classList.remove('btn-copied-extrait');
                   }, 1000);

                }).catch(err => {
                    alert("Erreur lors de la copie : " + err);
                });
            });

            locCur = -1;

            // bouton de contexte de l'extrait
            const btnContext = document.createElement('div');
            btnContext.classList.add('btn-context-extrait');
            btnContext.title = "Afficher le contexte de cet extrait";
            btnContext.innerText = '⛶';
            btnContext.addEventListener('click', () => {
                afficherContexte(tabExt[i]);
            });

            div.appendChild(btnCopy);
            div.appendChild(btnContext);
            for (m=0;m<tabExt[i].texte.length;m++){

                 div.appendChild(tabExt[i].texte[m]);
            }


         



        }


        

        nbXtrPlansynth();

        multiThm("fondSynthese"); // affichage des thms multicouches

        console.log("fin de la synthèse");

        divSynthese.appendChild(conteneur);

        //document.getElementById('fenSynt').classList.remove("dnone");
        document.getElementById('status-bar').innerText = "Synthèse terminée. " + tabExt.length + " extraits compilés.";
        document.getElementById('progress-bar').style.width = "0%";

}

function hideSynthese(){
    const divsynthese = document.getElementById("divSynthese");
    if (divsynthese){
        divsynthese.remove();
    }
};

// ---------------------------------------------------------------
// Export de la synthèse (appelle dialogExportSyntheseChoixOptions)
// ---------------------------------------------------------------
function exportSynthese() {
    // Affichage du dialog avec l'entête standard
    let element = document.getElementById('dlg');
    element.style.display = "block";
    
    let contenu = document.getElementById('ssdlg');
    contenu.style.top = "20%";
    contenu.style.height = "";
    
    contenu.innerHTML = `
        <!-- En-tête permanent (logo + fermeture) -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <img src="img/logoSonal.png" alt="" style="height:36px; width:auto;">
            <div class="close" onclick="hidedlg()">✖️</div>
        </div>
        <!-- Viewport glissant -->
        <div style="overflow:hidden; margin-left:-20px; margin-right:-20px; margin-bottom:-20px;">
            <div id="export-slider-synthese" style="display:flex; width:200%; transition:transform 0.35s cubic-bezier(.4,0,.2,1); transform:translateX(0);">
                <!-- Panneau 1 : choix du format -->
                <div style="width:50%; padding:0px 20px 20px; box-sizing:border-box;">
                    <h3 style="margin-top:0;margin-bottom:18px;">1 - Choisissez un format d'export</h3>
                    <div class="menudrlnt">
                        <div class="lblmnuxprt" onclick="dialogExportSyntheseChoixOptions('txt')"><label class="lblformat">.txt</label> <span class="lbldetails">Texte brut</span></div>
                        <!-- <div class="lblmnuxprt" onclick="dialogExportSyntheseChoixOptions('csv')"><label class="lblformat">.csv</label> <span class="lbldetails">Format tabulaire (importable dans Excel)</span></div>
                        <div class="lblmnuxprt" onclick="dialogExportSyntheseChoixOptions('html')"><label class="lblformat">.html</label> <span class="lbldetails">Page web interactive avec audio</span></div> !-->
                        <div class="lblmnuxprt" onclick="dialogExportSyntheseChoixOptions('docx')"><label class="lblformat">.docx</label> <span class="lbldetails">Traitement de texte (Word)</span></div>
                        <div class="lblmnuxprt" onclick="dialogExportSyntheseChoixOptions('pdf')"><label class="lblformat">.pdf</label> <span class="lbldetails">Document PDF</span></div>
                    </div>
                </div>
                <!-- Panneau 2 : options (rempli dynamiquement par dialogExportSyntheseChoixOptions) -->
                <div id="export-panel-options-synthese" style="width:50%; padding:0px 20px 20px; box-sizing:border-box;"></div>
            </div>
        </div>`;
}

async function genererExportTxtSynthese(opts) {
    let txt = "SYNTHÈSE DES EXTRAITS SÉLECTIONNÉS\n";
    txt += "Exporté par Sonal π (version " + window.versionSonal + ") le " + new Date().toLocaleString() + "\n";
    
    txt += "=".repeat(70) + "\n\n";

    let entretienCourant = -1;

    for (let i = 0; i < tabExt.length; i++) {
        const extrait = tabExt[i];

        // Changement d'entretien
        if (entretienCourant !== extrait.entretien) {
            entretienCourant = extrait.entretien;
            txt += "\n" + "-".repeat(70) + "\n";
            txt += "ENTRETIEN : " + tabEnt[extrait.entretien].nom + "\n";
            
            if (opts.vars) {
                const varsTexte = (await varsPubliquesEnt(extrait.entretien))[1];
                txt += "Variables : " + varsTexte + "\n";
            }
            txt += "-".repeat(70) + "\n\n";
        }

        // Numérotation de l'extrait avec timestamp et catégories
        let header = ``;
        if (opts.time) {
            const startTime = SecToTime(extrait.debut, true);
            const endTime = SecToTime(extrait.fin, true);
            header += `${startTime} -> ${endTime} `;
        }
        if (opts.thm && extrait.categories && extrait.categories.length > 0) {
            header += `[${extrait.categories.join(" | ")}] `;
        }

        if (!opts.time && !opts.thm) {
            header += `Extrait ${i + 1} `;
        }

        txt += header + "\n";

        // Contenu de l'extrait (pré-traité)
        let contenuTexte = extrait.texteTraite || "";
        
        // Filtrer les locuteurs si option désactivée
        if (!opts.loc) {
            contenuTexte = contenuTexte.replace(/^[^:]*:\s*/gm, "");
        }

        txt += contenuTexte + "\n\n";
    }

    return txt;
}

async function genererExportCsvSynthese(opts) {
    const SEP = ";";
    const csvCell = (val) => {
        const s = (val === null || val === undefined) ? "" : String(val).trim();
        if (s.includes(SEP) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    const lignes = [];

    // En-tête
    let entete = ["Extrait#", "Entretien", "Texte"];
    if (opts.loc) entete.push("Locuteur");
    if (opts.vars) entete.push("Variables entretien");
    if (opts.thm) entete.push("Catégories");
    lignes.push(entete.map(csvCell).join(SEP));

    // Données
    for (let i = 0; i < tabExt.length; i++) {
        const extrait = tabExt[i];
        
        // Utiliser le texte traité (sans locuteurs si option désactivée)
        let texte = extrait.texteTraite || "";
        if (!opts.loc) {
            texte = texte.replace(/^[^:]*:\s*/gm, "");
        }
        // Remplacer les retours à la ligne par des espaces pour CSV
        texte = texte.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

        let ligne = [
            csvCell(String(i + 1)),
            csvCell(tabEnt[extrait.entretien].nom),
            csvCell(texte)
        ];

        if (opts.loc) {
            ligne.push(csvCell(extrait.locuteurs.join(", ")));
        }

        if (opts.vars) {
            const varsTexte = (await varsPubliquesEnt(extrait.entretien))[1];
            ligne.push(csvCell(varsTexte));
        }

        if (opts.thm) {
            ligne.push(csvCell(extrait.categories.join(", ")));
        }

        lignes.push(ligne.join(SEP));
    }

    return lignes.join('\n');
}

// ---------------------------------------------------------------
// Boîte d'export synthèse en deux étapes : sélection du format → options
// ---------------------------------------------------------------
function dialogExportSyntheseChoixOptions(format) {
    // Config par format : [activé, cochéParDéfaut]
    // Colonnes : variables | locuteurs | catégories thm | horodatage
    const CFG = {
        txt: [[true, true], [true, true], [true, true], [true, true]],
        csv: [[true, true], [true, true], [true, true], [false, true]],
        html: [[true, true], [true, true], [true, true], [true, true]],
        docx: [[true, true], [true, true], [true, true], [true, true]],
        pdf:  [[true, true], [true, true], [true, true], [true, true]],
    };
    const LABELS = { txt: '.txt', csv: '.csv', html: '.html', docx: '.docx', pdf: '.pdf' };

    const cfg = CFG[format] || CFG.txt;
    const [ov, ol, oth, ot] = cfg;

    const opt = (id, classes, label, [enabled, checked]) => {
        const dis = enabled ? '' : ' disabled';
        const chk = checked ? ' checked' : '';
        const fade = enabled ? '' : 'opacity:0.75;';
        return `<label class="${classes}" style="display:flex;align-items:center;gap:10px;padding:6px 0;${fade}cursor:${enabled ? 'pointer' : 'default'}">
                    <input type="checkbox" id="${id}"${chk}${dis} style="width:15px;height:15px;flex-shrink:0;cursor:inherit;">
                    ${label}
                </label>`;
    };

    const panel = document.getElementById('export-panel-options-synthese');
    panel.innerHTML = `
        <h3 style="margin-top:0;margin-bottom:18px;">2 - Choisissez les éléments à intégrer à l'export au format ${LABELS[format]}</h3>
        <div style="margin-bottom:18px;">
            <hr style="margin: 6px 0;">
            ${opt('opt-vars-synth', 'logo-variables', 'Variables', ov)}
            <hr style="margin: 6px 0;">
            ${opt('opt-time-synth', 'logo-time', 'Coordonnées temporelles', [true, true])}
            ${opt('opt-loc-synth', 'logo-loc', 'Locuteurs', ol)}
            <hr style="margin: 6px 0;">
            ${opt('opt-thm-synth', 'logo-cat', 'Catégories thématiques', oth)}
                       
            <hr style="margin:6px 0;">
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;">
            <label class="btnfonction" style="flex:1;text-align:center;cursor:pointer;padding:8px 0;margin-top:6px; height:36px"
                onclick="document.getElementById('export-slider-synthese').style.transform='translateX(0)'">
            ← Retour
            </label>
            <label class="btn btn-primary" style="flex:3;text-align:center;cursor:pointer;padding:8px 0;"
                onclick="exportSyntheseFormat('${format}')">
            📥 Exporter
            </label>
        </div>`;

    // Glissement vers le panneau 2
    document.getElementById('export-slider-synthese').style.transform = 'translateX(-50%)';
}

// ---------------------------------------------------------------
// Génération de l'export au format sélectionné
// ---------------------------------------------------------------
async function exportSyntheseFormat(format) {
    // Lecture des options
    const getChk = id => {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    };
    
    const opts = {
        vars: getChk('opt-vars-synth'),
        loc: getChk('opt-loc-synth'),
        thm: getChk('opt-thm-synth'),
        time: getChk('opt-time-synth'),
    };

    hidedlg();

    // Vérification qu'il existe des extraits à exporter
    if (!tabExt || tabExt.length === 0) {
        afficherNotification("Aucun extrait à exporter.", "warning");
        return;
    }

    let contenuExport = '';
    let nomFichier = '';

    if (format === 'txt') {
        contenuExport = await genererExportTxtSynthese(opts);
        nomFichier = 'Synthèse_' + new Date().toISOString().split('T')[0] + '.txt';
        SauvegarderSurDisque(contenuExport, nomFichier, 'UTF-8');
    } else if (format === 'csv') {
        contenuExport = await genererExportCsvSynthese(opts);
        nomFichier = 'Synthèse_' + new Date().toISOString().split('T')[0] + '.csv';
        SauvegarderSurDisque(contenuExport, nomFichier, 'UTF-8');
    } else if (format === 'docx') {
        nomFichier = 'Synthèse_' + new Date().toISOString().split('T')[0] + '.docx';
        await genererExportDocxSynthese(opts, nomFichier);
    } else if (format === 'pdf') {
        nomFichier = 'Synthèse_' + new Date().toISOString().split('T')[0] + '.pdf';
        await genererExportPdfSynthese(opts, nomFichier);
    } else if (format === 'html') {
        nomFichier = 'Synthèse_' + new Date().toISOString().split('T')[0] + '.html';
        contenuExport = await genererExportHtmlSynthese(opts);
        SauvegarderSurDisque(contenuExport, nomFichier, 'UTF-8');
    }

    afficherNotification("Synthèse exportée en " + format.toUpperCase() + " : " + nomFichier, "success");
}

// ---------------------------------------------------------------
// EXPORT SYNTHÈSE - Format DOCX (via IPC au main process)
// ---------------------------------------------------------------
async function genererExportDocxSynthese(opts, nomFichier) {
    try {
        // Sérialiser les extraits pour IPC (utiliser les données pré-traitées)
        const extraitsSerialized = tabExt.map(extrait => ({
            debut: extrait.debut,
            fin: extrait.fin,
            entretien: extrait.entretien,
            texteTraite: extrait.texteTraite,
            categories: extrait.categories,
            locuteurs: extrait.locuteurs
        }));

        // Récupérer les variables de chaque entretien si needed
        const entretienVariables = {};
        if (opts.vars) {
            for (let i = 0; i < tabEnt.length; i++) {
                const [, varsTexte] = await varsPubliquesEnt(i);
                entretienVariables[i] = varsTexte;
            }
        }

        // Préparer les données à envoyer au main process
        const donnees = {
            extraits: extraitsSerialized,
            entretiens: tabEnt.map((ent, idx) => ({
                ...ent,
                variables: entretienVariables[idx] || ""
            })),
            themes: tabThm,
            opts: opts,
            nomFichier: nomFichier
        };
        
        // Appeler le handler IPC
        const result = await window.electronAPI.exportSynthesisDocx(donnees);
        
        if (result.success) {
            afficherNotification("Synthèse exportée en DOCX : " + nomFichier, "success");
        } else if (!result.canceled) {
            afficherNotification("Erreur lors de l'export DOCX : " + result.error, "error");
        }
    } catch (error) {
        console.error("Erreur :", error);
        afficherNotification("Erreur lors de l'export DOCX", "error");
    }
}

// ---------------------------------------------------------------
// EXPORT SYNTHÈSE - Format PDF (via IPC au main process)
// ---------------------------------------------------------------
async function genererExportPdfSynthese(opts, nomFichier) {
    try {
        // Générer le contenu TXT
        const contenuTxt = await genererExportTxtSynthese(opts);
        
        // Appeler le handler IPC
        const result = await window.electronAPI.exportSynthesisPdf({
            contenuTxt: contenuTxt,
            nomFichier: nomFichier
        });
        
        if (result.success) {
            afficherNotification("Synthèse exportée en PDF : " + nomFichier, "success");
        } else if (!result.canceled) {
            afficherNotification("Erreur lors de l'export PDF : " + result.error, "error");
        }
    } catch (error) {
        console.error("Erreur :", error);
        afficherNotification("Erreur lors de l'export PDF", "error");
    }
}

// ---------------------------------------------------------------
// EXPORT SYNTHÈSE - Format HTML (avec boutons play et audio)
// ---------------------------------------------------------------
async function genererExportHtmlSynthese(opts) {
    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Synthèse Sonal</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 {
            color: #548dc1;
            border-bottom: 2px solid #548dc1;
            padding-bottom: 10px;
        }
        h2 {
            color: #548dc1;
            margin-top: 30px;
            border-left: 4px solid #548dc1;
            padding-left: 10px;
        }
        h3 {
            color: #666;
            margin-top: 20px;
            font-size: 1.1em;
        }
        .meta {
            color: #999;
            font-size: 0.9em;
            font-style: italic;
            margin-bottom: 30px;
        }
        .extrait-container {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 5px;
            border-left: 3px solid #548dc1;
        }
        .extrait-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            font-weight: bold;
            color: #333;
        }
        .btn-play {
            background: none;
            border: 1px solid #548dc1;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            cursor: pointer;
            color: #548dc1;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            padding: 0;
            transition: all 0.3s;
        }
        .btn-play:hover {
            background: #548dc1;
            color: #fff;
        }
        .btn-play.playing {
            background: #548dc1;
            color: #fff;
        }
        .extrait-text {
            font-style: italic;
            color: #555;
            margin: 10px 0;
            padding: 0 10px;
        }
        .speaker-line {
            font-weight: bold;
            color: #548dc1;
            margin: 8px 0 4px 0;
        }
        .categories {
            font-size: 0.85em;
            color: #998844;
            font-weight: bold;
        }
        .audio-controls {
            margin: 20px 0;
            padding: 15px;
            background: #f0f0f0;
            border-radius: 5px;
        }
        footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #999;
            font-size: 0.9em;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>Synthèse des Extraits Sélectionnés</h1>
    <p class="meta">Exporté par Sonal π (version ${window.versionSonal || ''}) le ${new Date().toLocaleString()}</p>
    
    <div class="audio-controls">
        <label>Fichiers audio disponibles :</label>
        <div id="audio-files-list"></div>
    </div>
`;

    let entretienCourant = -1;

    for (let i = 0; i < tabExt.length; i++) {
        const extrait = tabExt[i];
        const entInfo = tabEnt[extrait.entretien];

        // Changement d'entretien
        if (entretienCourant !== extrait.entretien) {
            entretienCourant = extrait.entretien;
            html += `<h2>${entInfo.nom}</h2>`;

            if (opts.vars) {
                const varsTexte = (await varsPubliquesEnt(extrait.entretien))[1];
                html += `<p><strong>Variables :</strong> ${varsTexte}</p>`;
            }

            // Ajouter si le fichier audio existe
            if (entInfo.audioPath) {
                html += `<audio id="audio-ent-${extrait.entretien}" style="width:100%; margin-bottom: 20px;" controls>
                    <source src="${entInfo.audioPath}" type="audio/mpeg">
                    Votre navigateur ne supporte pas le lecteur audio.
                </audio>`;
            }
        }

        // En-tête de l'extrait
        let headerHTML = `Extrait ${i + 1}`;
        if (opts.time) {
            const startTime = secToTime(extrait.debut);
            headerHTML += ` ${startTime}`;
        }

        let categs = '';
        if (opts.thm) {
            const thmClasses = Array.from(extrait.texte[0].classList).filter(c => c.startsWith('cat_'));
            if (thmClasses.length > 0) {
                const thmNoms = thmClasses.map(c => {
                    const thm = tabThm.find(t => t.code === c);
                    return thm ? thm.nom.split('//')[0].trim() : null;
                }).filter(nom => nom);
                if (thmNoms.length > 0) {
                    categs = ` <span class="categories">[${thmNoms.join(" | ")}]</span>`;
                }
            }
        }

        html += `<div class="extrait-container">
                    <div class="extrait-header">
                        <button class="btn-play" data-deb="${extrait.debut}" data-aud="audio-ent-${extrait.entretien}">▶</button>
                        <span>${headerHTML}${categs}</span>
                    </div>
                    <div class="extrait-text">`;

        // Contenu de l'extrait
        let isNewSpeaker = true;
        extrait.texte.forEach((mot) => {
            if (mot.classList.contains('ligloc')) {
                if (!isNewSpeaker) html += `</div>`;
                html += `<div class="speaker-line">${opts.loc ? mot.dataset.nomloc.replace("?", "") + ": " : ""}</div><div>`;
                isNewSpeaker = true;
            }

            if (mot.classList.contains('anon')) {
                if (!mot.classList.contains('finsel')) {
                    return;
                } else {
                    html += (mot.dataset.pseudo ? `[${mot.dataset.pseudo}]` : '[anonyme]');
                }
            } else {
                html += mot.innerText;
            }
        });

        html += `</div></div></div>`;
    }

    html += `
    <footer>Sonal π</footer>
    <script>
        document.querySelectorAll('.btn-play').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const audioId = this.dataset.aud;
                const aud = document.getElementById(audioId);
                if (!aud) return;
                
                aud.currentTime = parseFloat(this.dataset.deb);
                aud.play();
                
                document.querySelectorAll('.btn-play.playing').forEach(function(b) { 
                    b.classList.remove('playing'); 
                });
                this.classList.add('playing');
                
                aud.addEventListener('pause', () => { 
                    this.classList.remove('playing'); 
                }, { once: true });
            });
        });
    </script>
</body>
</html>`;

    return html;
}
