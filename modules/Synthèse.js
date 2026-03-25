async function synthese(critereEt){ // fonction permettant de compiler toutes les parties d'entretien relatives au(x) thème(s) sélectionné(s)

 if (tabThm.length == 0){
  tabThm = await window.electronAPI.getThm()
}
if (tabEnt.length == 0){
  tabEnt = await window.electronAPI.getEnt()
}

    let tabHtml = await window.electronAPI.getHtml();
//console.log("début de la synthèse. TabTHm=" + JSON.stringify (tabThm) + " / tabEnt=" + JSON.stringify (tabEnt) );



    function finalizeExtrait(extrait, fin, entretien, resetLocCur) {
        extrait.fin = fin;
        tabExt.push({ ...extrait, entretien });
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

    var tabExt=[] // tableau des extraits sélectionné

    // Créer un conteneur temporaire pour analyser le HTML
    const tempContainer = document.createElement('div');

    // création d'une div pour afficher le tableau

    const divSynthese = document.createElement("div");
    divSynthese.id = "divSynthese";

    divSynthese.innerHTML = `<h3 style="margin-left:10px;">Extraits sélectionnés
     <label id = "btn-quit" class="btn btn-secondary" style = "padding: 10px;float:right;margin-top:-5px" onclick="hideSynthese();">Quitter ✖️</label>
    </h3>`;
    divSynthese.classList.add("fondtabdat");
    document.body.appendChild(divSynthese);

    const divFondSynth = document.createElement("div");
    divFondSynth.id = "fondSynthese";
    divFondSynth.classList.add("fondsynth");
    document.body.appendChild(divFondSynth);

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
                
                // création d'un conteneur temporaire pour copier le contenu
                let textCopié =  "« ";
                let nbInterv = 0;
                tabExt[i].texte.forEach(mot => {
                    
                    // y'a-t-il changement de locteur?
                    if (mot.classList.contains('ligloc')){
                        nbInterv++;

                        if (nbInterv > 1) {
                            textCopié += "\n" + mot.dataset.nomloc + ": \n";
                        } else {
                            textCopié += mot.dataset.nomloc + ": \n";
                        }

                        if (nbInterv>1){
                            textCopié += "- "; // double saut de ligne entre les interventions
                        }
                    }
                    
                    textCopié += mot.innerText ;
                });

                textCopié += " »\n";

                // correction des espaces avant et après la ponctuation (ne doit pas y avoir mot.mot)
                textCopié = textCopié.replace(/\s([,.!?:;])}/g, "$1"); // supprime les espaces avant la ponctuation
                textCopié = textCopié.replace(/([,.!?:;])\s/g, "$1 "); // ajoute un espace après la ponctuation

                // ajout des infos sur l'entretien
                
                textCopié += "Entretien : " + tabEnt[tabExt[i].entretien].nom + " " + (await varsPubliquesXtr(tabExt[i]))[1] + "\n";              

                navigator.clipboard.writeText(textCopié).then(() => {
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