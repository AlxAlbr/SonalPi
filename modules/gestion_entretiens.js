/////////////////////////////////////////////////////////////////////
// GESTION DES ENTRETIENS
/////////////////////////////////////////////////////////////////////

//const { compterElements } = require("./utilitaires");

// ajout d'un entretien
async function ajouterEntretien(fichTxt, fichAudio){
    
    //console.log("ajout d'un entretien")

    // initialiser le storage centralisé des locuteurs (main) — fallback sur window
    if (window && window.electronAPI && typeof window.electronAPI.setTabLoc === 'function') {
        window.electronAPI.setTabLoc([]).catch(err => console.warn('setTabLoc init failed', err));
    } else {
        window.tabLocImport = [];
    }
     
    



    // récupération du corpus
    let Corpus = await window.electronAPI.getCorpus();

    if (fichTxt == null && fichAudio == null) {
    const result = await window.electronAPI.ajouterEntretien();

        if (result.canceled) {
            console.log("Ajout d'entretien annulé");
            return;
        }

        fichTxt = result.textFiles[0]; // adresse du fichier txt (O)
        fichAudio = result.audioFiles[0]; // adresse du fichier audio (O)
    }    
    
    
    let nomFichTxtO = fichTxt.replace(/^.*[\\\/]/, '');// nom du fichier d'origine (O) (sans chemin d'accès) 
    let extFichTxtO = nomFichTxtO.substring(nomFichTxtO.lastIndexOf(".")).toLowerCase(); // extension du fichier d'origine (O)
    let nomFichTxtA = nomFichTxtO.replace(new RegExp(extFichTxtO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '.sonal'); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)
    
    /*
    if (Corpus.type == "distant") {
        // Supprimer les caractères spéciaux problématiques pour un serveur
        nomFichTxtA = nomFichTxtA
            .replace(/\s+/g, '_')              // remplacer espaces par underscores
            .replace(/[^a-zA-Z0-9._-]/g, '')   // garder seulement alphanumériques, underscore, tiret, point
            .replace(/\.{2,}/g, '.');  
    }
        */
            

    //let cheminFichTxtA = await window.electronAPI.createPath(Corpus.folder, nomFichTxtA); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)

    //console.log("fichier texte d'origine (O): " + fichTxt + "\n fichier texte d'arrivée (A): " + cheminFichTxtA)

     
    


        // lecture du contenu du fichier d'origine
        let content = await window.electronAPI.readFileContent(fichTxt);
        if (!content) {
            console.error("Impossible de lire le fichier texte à l'adresse " + fichTxt);
            return;
        }

        // Prise en compte des fichiers JSON
        if (extFichTxtO === ".json") {content=JSON.parse(content);}


        // mise en tableau du contenu
        content = content.replace(/\r?\n|\r/g,'\n') // uniformisation des sauts de ligne
        
        

        let fichApresConversion = ""; // contenu après conversion

        // conversion du fichier sélectionné 
        switch (extFichTxtO) {
            case ".txt":
                fichApresConversion = convertTXT(lignesFich);

                break;


            case ".srt":
            case ".vtt":

                // conversion VTT -> HTML

                fichApresConversion = await convertSRT(content);
                  console.log("locuteurs dans fich ", window.tabLocImport)
                break;

            case ".purge":
                fichApresConversion = await convertPURGE(content);
                 console.log("après conversion de fichier purge = ", fichApresConversion.formatSonal)
                break;

            case ".sonal":
                fichApresConversion = await importSONAL(content);
                //console.log("après conversion de fichier Sonal = ", fichApresConversion)
                //fichApresConversion = String(lignesFich); //importSONAL(lignesFich);
                break;

            case ".json":
                fichApresConversion = await convertJSON(content);
            break;



        }

        // après conversion, écriture du fichier texte dans le dossier du corpus (local ou distant)
        //console.log(fichApresConversion); 

        // Extraire la string de l'objet si nécessaire et s'assurer que c'est une string
        if (typeof fichApresConversion === 'object') {
            if (fichApresConversion && fichApresConversion.formatSonal) {
                fichApresConversion = fichApresConversion.formatSonal;
            } else {
                // Convertir l'objet en string JSON puis le parser si nécessaire
                fichApresConversion = JSON.stringify(fichApresConversion);
            }
        }
        
        // S'assurer que fichApresConversion est toujours une string
        if (typeof fichApresConversion !== 'string') {
            fichApresConversion = String(fichApresConversion);
        }
        
        //console.log("Contenu après conversion (string):", typeof fichApresConversion, fichApresConversion.substring(0, 100) + '...');   


        if (Corpus.type == "local") {

            let cheminFichTxtA = await window.electronAPI.createPath(Corpus.folder, nomFichTxtA); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)
            
            let fichExists = await window.electronAPI.doesFileExists(cheminFichTxtA);
            
            let overwrite = null;
            if (fichExists) {
            
                overwrite = confirm(`Le fichier ${nomFichTxtA} existe déjà dans le dossier du corpus. Voulez-vous l'écraser ?`);
            
            }
            if (fichExists && overwrite || !fichExists) { // si le fichier existe et qu'on veut l'écraser, ou s'il n'existe pas, on l'écrit
                const res = await window.electronAPI.sauvegarderFichier(cheminFichTxtA, fichApresConversion);
                console.log('Résultat écriture fichier local:', res);
            }
 

        } else if (Corpus.type == "distant") {

            let cheminFichTxtA =  [Corpus.folder,nomFichTxtA].join('/');
            const res = await window.electronAPI.sauvegarderSurServeur(cheminFichTxtA, fichApresConversion);
            console.log('Résultat sauvegarde serveur:', res);
        }
    


    // création de l'image de l'audio
    let fichImg =""
    if(fichAudio){
        let nomFichTxt = fichTxt.replace(/^.*[\\\/]/, '');// nom du fichier d'origine (O) (sans chemin d'accès) 
        fichImg = String(nomFichTxt).replace(/\.[^.]+$/, '.' + "png")
      

    }    


    // Création du tableau des entretiens
    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main


    if (!tabEnt) {tabEnt = []}; // initialisation si inexistant

    //console.log("Id de l'entretien ajouté" , tabEnt.length > 0 ? Math.max(...tabEnt.map(ent => ent.id)) + 1 : 1); // ID unique

    
    // création d'un nouvel entretien
        // récupérer les locuteurs importés (si présents)
    console.log("--> 2 locteurs " + JSON.stringify(window.tabLocImport));
    console.log("--> 2 anonymisations " + JSON.stringify(window.tabAnonImport));

        /*
        let importedLoc = [];
        if (window && window.electronAPI && typeof window.electronAPI.getTabLoc === 'function') {
            try { importedLoc = await window.electronAPI.getTabLoc(); } catch (e) { console.warn('getTabLoc failed', e); }
        } else if (typeof window !== 'undefined') { importedLoc = window.tabLocImport; }
         */

        let nouveauEnt = {
        id: tabEnt.length > 0 ? Math.max(...tabEnt.map(ent => ent.id)) + 1 : 1, // ID unique
        notes: "",
        tabLoc: window.tabLocImport, // tableau des locuteurs importé
        nom: nomFichTxtA.replace(/\.[^/.]+$/, ''), // nom du fichier sans extension
        hms: "00:00:00",
        tabThm: [],
        rtrPath: nomFichTxtA, // nom du fichier texte (sans l'adresse)
        audioPath: fichAudio ? String(fichAudio) : "", // S'assurer que c'est une string
        imgPath : "", //fichImg,
        tabVar: [],
        tabDic: [],
        tabDat: [],
        tabAnon: window.tabAnonImport, // tableau des anonymisations importé
    };

    // ajout de l'entretien au tableau
    tabEnt.push(nouveauEnt);

    // mise à jour du tableau des entretiens dans main
    await window.electronAPI.setEnt(tabEnt);

    // mise à jour du corpus
    window.sauvegarderCorpus();


    let rknv = tabEnt.length - 1; // rang de l'entretien ajouté
    console.log("Entretien ajouté avec le rang " + rknv, nouveauEnt);

  // chargement des entretiens PUIS affichage
    loadHtml(rknv,rknv).then(() => {
    afficherEnt(rknv,rknv);
    //CreerWaveform(fichAudio, fichImg)    
    });  
 



}

async function ajouterPlusieursEntretiens(selectedTextFiles) {
    
     let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main


    if (!tabEnt) {tabEnt = []}; // initialisation si inexistant



    // mise à jour du tableau des entretiens dans main
   
   for (const file of selectedTextFiles) {
    await ajouterEntretien(file);
    }

}

//============================================================================
// chargement du html d'un ou de plusieurs entretiens
//============================================================================
async function loadHtml(rgDep, rgFin){

    let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
    if (Corpus==null){alert("Aucun corpus n'est chargé"); return};

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    
    
    for (let e=rgDep; e<=rgFin; e++){
       
        //console.log("chargement de l'entretien " + e)
        if (!tabEnt[e]) {console.error("L'entretien " + e + " n'existe pas."); continue;}
       
        //console.log("chargement du HTML de l'entretien " + e + " : " + tabEnt[e].rtrPath)
        // let htmlEnt = await window.electronAPI.getHtml(e); // récupération du HTML en cache
        
        // vidage du HTML en cache pour forcer le rechargement
        //await window.electronAPI.setHtml(e, []);
        tabHtml[e] = null; // mise à jour du tableau local
        
       // if (!htmlEnt) { // pas de html en cache, on le charge
        

            // message d'affichage du chargement
            let lblmessage = document.getElementsByClassName('info-no-content')[0]
            if (lblmessage) lblmessage.innerText = "Chargement de l'entretien " + (e+1) + " / " + tabEnt.length + " ...";    
            
            document.getElementById('status-bar').innerText = "Chargement de l'entretien " + (e+1) + " / " + tabEnt.length + " ...";
            document.getElementById('progress-bar').style.width = ((e+1)/tabEnt.length)*100 + "%"; 

            // 1 - Définition du chemin du fichier de l'entretien
            let cheminEnt  =""; 
            
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, tabEnt[e].rtrPath);
            } else {
                cheminEnt = [Corpus.folder, tabEnt[e].rtrPath].join('/');      
            }

            // 1bis - Vérification de l'existence du fichier de l'entretien
            let existFile = await window.electronAPI.doesFileExists(cheminEnt);
            if (!existFile) {
                dialog("Message", "Le fichier de l'entretien " + tabEnt[e].nom + " est introuvable à l'adresse :\n'" + cheminEnt+ "'");
                continue;
            } 

            // 2 - lecture du contenu du fichier de l'entretien
            console.log("lecture du fichier : " + cheminEnt)
            let contenuEnt = await window.electronAPI.readFileContent(cheminEnt);
            const metadata = await window.electronAPI.getFileMetadata(cheminEnt);

            if (metadata.success) {
                // Ajouter à l'élément de TabEnt
                tabEnt[e].lastModified = metadata.lastModified;
                tabEnt[e].fileSize = (metadata.size / (1000 * 1000)).toFixed(2) + " Mo"; // Convertir en Mo et formater
            }

            if (!contenuEnt) {
                console.error("Impossible de lire le fichier de l'entretien à l'adresse " + cheminEnt);
                dialog("Message", "Impossible de lire le fichier de l'entretien à l'adresse " + cheminEnt);
                return;
            }
 
            
           // 3 - Extraction des données de l'entretien

            // selon type

            let typeFich = tabEnt[e].rtrPath.substring(tabEnt[e].rtrPath.lastIndexOf(".")).toUpperCase();

            
            switch(typeFich) {

                case ".SONAL":
                
                    
                    let donnéesEnt = await extractFichierSonal(contenuEnt);
                    tabHtml[e] = String(donnéesEnt.html); // HTML de l'entretien
                     
                    tabEnt[e].tabVar = donnéesEnt.tabVar;
                    tabEnt[e].tabDic = donnéesEnt.tabDic;   
                    tabEnt[e].tabDat = donnéesEnt.tabDat;
                    tabEnt[e].tabAnon = donnéesEnt.tabAnon;                

                    tabEnt[e].lastAccess = new Date().toISOString();

                    await window.electronAPI.setEnt(tabEnt); // mise à jour du tableau des entretiens dans main


                    await window.electronAPI.setHtml(e, String(tabHtml[e]));

                    //console.log("dictionnaires : " + JSON.stringify(donnéesEnt.tabDic));
                    //console.log("données : " + JSON.stringify(donnéesEnt.tabDat));

                break;

                default:
                    console.error("Type de fichier non reconnu : " + typeFich);
                    tabHtml[e] = ""; // initialiser avec une chaîne vide
                break;
            }

            // mise en cache du HTML de l'entretien
            //console.log("➤ [LIGNE 314] Avant setHtml, tabHtml[" + e + "] = " + (tabHtml[e] ? tabHtml[e].substring(0, 50) + '...' : 'NULL/UNDEFINED'));
            
            
            
            //console.log("HTML de l'entretien " + e + " mis en cache ", (tabHtml[e] ? tabHtml[e].substring(0, 100) : 'VIDE') + '...'   );






 
    }
            // fin du chargement de l'entretien}  
        document.getElementById('status-bar').innerText = "Entretiens chargés "; 
        document.getElementById('progress-bar').style.width = "0%"; 

}

//============================================================================
// affichage d'un ou de plusieurs entretiens
// ============================================================================
async function afficherEnt(rgDep, rgFin){

    console.log("affichage des entretiens de " + rgDep + " à " + rgFin)

    tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main

    const conteneur=document.getElementById('fond_ent_corpus');

    // affichage complet
    if (rgDep==0 && rgFin==tabEnt.length-1 && tabEnt.length>0) {
    conteneur.innerHTML = "";
    }

    // en cas de nouveau corpus, on vide le conteneur
    if (rgFin==-1 || tabEnt.length==0) {
     conteneur.innerHTML = "";
    }


    // défilement des entretiens
    let e;
    for (e=rgDep;e<=rgFin;e++){

         // message d'affichage du chargement  
        document.getElementById('status-bar').innerText = "Affichage de l'entretien " + (e+1) + " / " + tabEnt.length + " ...";
        document.getElementById('progress-bar').style.width = ((e+1)/tabEnt.length)*100 + "%"; 

    
        // 1 - Création (éventuelle) du conteneur

        // recherche s'il n'existe pas déjà
        let existingEnt = conteneur.querySelector(`div.ligent[data-id='${tabEnt[e].id}']`);
        
        if (!existingEnt) {

            // div de fond de l'entretien
            const div = document.createElement('div');
            div.dataset.id = tabEnt[e].id;
            div.dataset.rtrPath = tabEnt[e].rtrPath;
            div.classList.add('ligent');
            div.title=tabEnt[e].nom;
            //div.innerText = tabEnt[e].nom;
            div.style.cursor ="pointer";

            conteneur.appendChild(div);

           
            // étiquette du nom
            const lbl = document.createElement('div');
            lbl.classList.add('lbl-nom-ent');
            lbl.innerText = tabEnt[e].nom;
            div.appendChild(lbl);

            //cadre de l'image
            const divE = document.createElement('div');
            divE.classList.add('fond-cnv-ent');
            div.appendChild(divE)


            // image de fond
            const img = document.createElement('img');

            let cheminImg  ="../img/waveform.png"; // image par défaut


            if (tabEnt[e].imgPath !="" && tabEnt[e].imgPath !== null && tabEnt[e].imgPath !== undefined) {

                if (Corpus.type == "local") {
                    cheminImg = await window.electronAPI.createPath(Corpus.folder, tabEnt[e].imgPath);
                } else {
                    cheminImg = [Corpus.folder, tabEnt[e].imgPath].join('/');    
                }


            // si le fichier d'image existe bien à l'emplacement indiqué, on l'affiche    
            
            let existFile = window.electronAPI.doesFileExists(cheminImg);
            if (existFile==true){
            img.src = cheminImg; 
            }   

            } 

           
            img.alt = "";
            img.dataset.id = tabEnt[e].id
            img.classList.add('ligent-img');
            divE.appendChild(img);


            // canvas
            const cnv = document.createElement('canvas');
            cnv.dataset.id = tabEnt[e].id;
            cnv.classList.add('cnvent');
            cnv.title=tabEnt[e].nom;
            divE.appendChild(cnv);

            cnv.width = divE.clientWidth;
            cnv.height = divE.clientHeight;

            // bouton 
            const btn = document.createElement('button');
            btn.classList.add('btn','btn-sm','btn-edit');
            btn.dataset.id = tabEnt[e].id;
            btn.title = "Editer l'entretien"
            div.appendChild(btn);

            // 2 - ajout des listeners

            // ajout d'un listener pour le clic sur l'entretien
            div.addEventListener('click', function(event) {

                event.stopPropagation(); //pas de propagation au niveau supérieur
                let idEnt = Number(this.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
    

                dispPanneauG('imgpandet', 'fond_ent_corpus')
                afficherDetailsEnt(rkEnt);
            })

            // ajout d'un listener pour le clic droit sur l'entretien
            div.addEventListener('contextmenu', function(event) {
                event.preventDefault(); // Empêche le menu contextuel par défaut
                let idEnt = Number(this.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
 
            });

            // ajout d'un listener pour le clic sur le canvas (avec position en X)
            cnv.addEventListener('mouseup', function(event) {
                event.stopPropagation(); //pas de propagation au niveau supérieur
                let idEnt = Number(this.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
                let posX = event.clientX; // position du clic en X
                let ratio = (posX - this.getBoundingClientRect().left) / this.getBoundingClientRect().width; // ratio de redimensionnement

                // voirEntretien(rkEnt)   
                //console.log("clic sur le canvas de l'entretien " + rkEnt + " à la position X: " + posX)

                // affichage de l'entretien à la position cliquée
                afficherHtmlAtPos(rkEnt, ratio);


            })

            // ajour d'un listener sur le bouton play
            btn.addEventListener('click', async function(event) {
                event.stopPropagation(); // Empêche la propagation de l'événement au div parent
                let idEnt = Number(this.parentElement.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
                console.log("clic sur le bouton play de l'entretien " + rkEnt)
                
                let editable = true;  // le fichier peut être édité

                await window.electronAPI.setEntCur(rkEnt)

                // vérification que l'entertien est accessible (si distant)
                    // récupération du corpus 
                    let Corpus = await electronAPI.getCorpus();

                    if (Corpus.type == "distant"){
                        let result = await electronAPI.isEntretienLocked(rkEnt)
                         if (result.locked==true) {
                                    console.log("l'entretien est verrouillé par " + result.user)
                                    alert(`L'entretien est actuellement édité par ${result.user}. \n Vous ne pouvez pas l'éditer pour le moment.`);
                                    editable=false; 
                                    return   // Ne pas ouvrir la fenêtre d'édition
                        }
                                
                                
                }

                if (editable) await window.electronAPI.editerEntretien(rkEnt); 
            })

 


            // dessin des catégories

            // récupération du html en cache
            let htmlEnt = await window.electronAPI.getHtml(e); // récupération du HTML en cache
             
            if (!htmlEnt) { // pas de html en cache, on le charge
                await loadHtml(e,e); // chargement du HTML de l'entretien
                htmlEnt = await window.electronAPI.getHtml(e); // récupération du HTML en cache
                htmlEnt = String(htmlEnt).replace(/`/g,''); // suppression des backticks;
            }

            let tabGrphEnt = await window.electronAPI.getGrph(e); // récupération du tableau des graphismes de l'entretien
            
            if (!tabGrphEnt || tabGrphEnt.length==0) { // pas de graphique en cache, on le crée
            tabGrphEnt = await resumeGraphique(htmlEnt); // élaboration du résumé graphique de l'entretien
            // sauvegarde du tabGrph dans le corpus
            await window.electronAPI.setGrph(e, tabGrphEnt);
            }

            //console.log("HTML de l'entretien " + e + " pour affichage ", htmlEnt.substring(0, 100) + '...'   );
            dessinResumeGraphique(cnv, tabGrphEnt); // résumé graphique de l'entretien

        }

        // 2 - remplissage du canvas
        //if (!tabEnt[t].html){ // si le HTML n'est pas encore chargé
         
        //}
    

    }

         // message de fin  
        document.getElementById('status-bar').innerText = "Prêt " 
        document.getElementById('progress-bar').style.width = "0"; 

}    

 
async function  afficherHtmlAtPos(rkEnt, ratio, rkmot){

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    let html = await window.electronAPI.getHtml(Number(rkEnt)); // récupération du HTML en cache   

    console.log("affichage de l'entretien " + rkEnt + " à la position " + ratio  );


    //déselection de tous les autres entretiens
    document.querySelectorAll('div.ligent').forEach(div => {
        div.classList.remove('active-ligent');
    });

    // définition du conteneur (ligne de l'entretien)
    let conteneur =  document.querySelector(`div.ligent[data-id='${tabEnt[rkEnt].id}']`);
    conteneur.classList.add('active-ligent');

    //let conteneur = document.getElementById('fond_ent_corpus');
    // suppression de l'ancien conteneur fenent
    let ancienFen = document.querySelector('div.fenent');

    if (ancienFen) {

        //console.log("il y a une ancienne fenêtre d'entretien ouverte avec le dataset" + conteneur.dataset.id)

        if (ancienFen.dataset.id != tabEnt[rkEnt].id){   
            //console.log("suppression de l'ancienne fenêtre d'entretien")
            ancienFen.remove();
        }
    }

    ancienFen = document.querySelector('div.fenent');

    // création d'une div 
    if (!ancienFen){

        // conteneur
        let divFond = document.createElement('div');
        divFond.id = 'fenEnt';
        divFond.classList.add('fenent');
        divFond.classList.remove('dnone'); 
        divFond.dataset.id = tabEnt[rkEnt].id;
        divFond.contentEditable = false;
            
 
        //divFond.setAttribute('onclick', "this.classList.add('dnone')"); // désactivation du menu contextuel
        conteneur.after(divFond); 
    
        // entête
        let divEntete = document.createElement('div');
        divEntete.classList.add('entete-fenent','ligne-variables-ent');
        divEntete.innerHTML = (await varsPubliquesEnt(rkEnt))[0]; // ajout des variables publiques dans l'entête;

        divFond.appendChild (divEntete);

        let btnFermer = document.createElement('button');
        btnFermer.classList.add('btn-close-fenent');
        btnFermer.innerText = "X";
        btnFermer.addEventListener('click', function(event) {
            event.stopPropagation(); // Empêche la propagation de l'événement au div parent
            divFond.remove()
            conteneur.classList.remove('active-ligent');
        });

        divEntete.appendChild(btnFermer);


        // fenêtre de contenu
        divSeg = document.createElement("div");
        divSeg.id = "segments-contenu";
        divSeg.classList.add('fenent-contenu');


        divFond.appendChild (divSeg);
        divSeg.innerHTML = html.replace(/`/g,'') // suppression des backticks; ;

        // surlignement des mots recherchés
        let txtcherché = document.getElementById('txtRech').value;
        if (txtcherché != "") {
        divSeg.innerHTML = divSeg.innerHTML.replace(new RegExp(`(${txtcherché})`, 'gi'), '<mark>$1</mark>');
        }

        multiThm('segments-contenu'); // définition des couches thématiques multiples
    
    }

    // Récupérer divSeg même si la fenêtre existe déjà
    divSeg = document.getElementById('segments-contenu');

    //fenSeg = document.getElementById('fenEnt')
    let mot; 

    console.log("recherche du mot à la proportion " + ratio + "ou directement au mot " + rkmot)
    if (rkmot === undefined || rkmot === null){
            let nbmots= compterElements(divSeg, 'span','.lblseg'); // nombre de mots           
            let pos = Math.round(nbmots * ratio); // position du mot dans le texte

            mot = await getSpan(pos); // récupération du mot à la position

    } else {
            mot = await getSpan(rkmot); // récupération du mot à la position
    }
            if (!mot) {console.log ("mot introuvable")  ; return} // si le mot n'existe pas, on sort de la fonction
            
          
 
            
            // Alternative : utiliser scrollIntoView
            mot.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            

                /*
                // Scroller jusqu'à la position désirée
                const fen = document.getElementById('segments'); // Conteneur du texte
                const scrollPosition = fen.scrollHeight * ratio ; // Calcul de la position en fonction du ratio
                fen.scrollTo({
                top: scrollPosition - fen.clientHeight / 2, // Centrer le texte dans la fenêtre
                behavior: 'smooth' // Animation fluide
                });
                */
            


}


async function afficherDetailsEnt(rk){

    console.log("affichage des détails de l'entretien " + rk)
    
    

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
  

    // récupération de l'entretien
    let ent = tabEnt[rk];


    // ajouter le marqueur de sélection sur la div de l'entretien

    // déselection de tous les autres entretiens
    document.querySelectorAll('div.ligent').forEach(div => {
        div.classList.remove('active-ligent');
    });

    let conteneurEnt = document.querySelector(`div.ligent[data-id='${ent.id}']`);
    if (conteneurEnt) {
        conteneurEnt.classList.add('active-ligent');
    }


    // affichage des métadonnées
    let conteneur = document.getElementById('fond_gen_corpus');
    conteneur.innerHTML = "";
    conteneur.classList.remove('dnone');
    conteneur.classList.add('fond-info-ent');

    // identifiant : conteneur + span éditable pour le nom (éviter de lire le label)
    let infoId = document.createElement('div');
    infoId.style.backgroundColor = "#ffffffff";
    infoId.classList.add('item-info-ent', 'id-info-ent', 'floating-label-container');

    // span éditable contenant uniquement le nom
    let nameSpan = document.createElement('span');
    nameSpan.classList.add('nom-info-ent');
    nameSpan.contentEditable = true;
    nameSpan.innerText = ent.nom;

    // valider le changement de nom (entrée) sur le span éditable
    nameSpan.addEventListener('keydown', function(event) {
        if (event.key === "Enter") {
            event.preventDefault(); // Empêche le saut de ligne
            this.blur(); // Retire le focus de l'élément
            // mise à jour du nom dans le tableau des entretiens
            let nouveauNom = this.innerText.trim();
            if (nouveauNom !== "") {
                ent.nom = nouveauNom;
                tabEnt[rk].nom = nouveauNom;
                window.electronAPI.setEnt(tabEnt);
                window.sauvegarderCorpus();

                console.log("Nouveau nom de l'entretien " + rk + " : " + nouveauNom);
                // mise à jour de l'étiquette dans le conteneur de l'entretien
                let conteneurEnt = document.querySelector(`div.ligent[data-id='${ent.id}']`);
                if (conteneurEnt) {
                    let lblNom = conteneurEnt.querySelector('.lbl-nom-ent');
                    if (lblNom) {
                        lblNom.innerText = nouveauNom;
                    }
                }
            }
        }
    });

    infoId.appendChild(nameSpan);

    conteneur.appendChild(infoId);

    // nom du fichier dans le corpus
    let labelId = document.createElement('label');
    labelId.innerText = "Nom";
    labelId.classList.add('mdc-floating-label','floatingstatic');
    infoId.appendChild(labelId);

    // informations sur l'origine des fichiers
    let infoTxt = document.createElement('div');
    infoTxt.innerText = "";
    infoTxt.classList.add('item-info-ent','floating-label-container');
    conteneur.appendChild(infoTxt);
    
    let txtSpan = document.createElement('span');
    txtSpan.classList.add('nom-info-ent');
    txtSpan.innerText = ent.rtrPath;
    infoTxt.appendChild(txtSpan);

    let labelTxt = document.createElement('label');
    labelTxt.innerText = "Fichier texte: ";
    labelTxt.classList.add('mdc-floating-label','floatingstatic');
    infoTxt.appendChild(labelTxt);

    
    // proposer le changement de fichier texte?
    let btnChangeTxt = document.createElement('button');
    btnChangeTxt.innerText = "...";
    btnChangeTxt.style.padding = "2px 6px";
    btnChangeTxt.style.float = "right";
    btnChangeTxt.classList.add('dnone');
    btnChangeTxt.addEventListener('click', function() {
        
        // logique pour changer le fichier texte
    });
     

    infoTxt.appendChild(btnChangeTxt);

    // dimensions du fichier
    let infoDimValue = document.createElement('div');
    infoDimValue.innerText = ent.fileSize ? `Taille : ${ent.fileSize}` : "Taille : ??";
    infoDimValue.style= "padding: 5px 0px 0px 5px; width:25%; font-size:0.8em; color:#555;margin-right: 10px;float:left;";
    infoDimValue.classList.add('floating-label-container');
    infoTxt.appendChild(infoDimValue);

    // dernière modification du fichier
    let infoDate = document.createElement('div');
    infoDate.innerText = ent.lastModified ? `Dernière modification : ${new Date(ent.lastModified).toLocaleString()}` : "Dernière modification : ??";
    infoDate.style= "padding: 5px 0px 0px 5px; width:60%; font-size:0.8em; color:#555;float:left;";
    infoDate.classList.add('floating-label-container');
    infoTxt.appendChild(infoDate);

    let infoAud = document.createElement('div');
    infoAud.innerText =  "";
    infoAud.classList.add('item-info-ent','floating-label-container');
    conteneur.appendChild(infoAud);

    let labelAud = document.createElement('label');
    labelAud.innerText = "Fichier Audio ";
    labelAud.classList.add('mdc-floating-label','floatingstatic');
    infoAud.appendChild(labelAud);

    let audioSpan = document.createElement('span');
    audioSpan.classList.add('nom-info-ent');
    audioSpan.innerText = ent.audioPath;
    infoAud.appendChild(audioSpan);

    // proposer le changement de fichier audio?
    let btnChangeAud = document.createElement('button');
    btnChangeAud.innerText = "...";
    btnChangeAud.style.padding = "2px 6px";
    btnChangeAud.style.float = "right";
    btnChangeAud.addEventListener('click', async () => {
            const result = await window.electronAPI.selectAudioFiles();
            if (!result.canceled && result.filePaths.length > 0) {
                selectedAudioFiles = result.filePaths;
                console.log("Fichier audio sélectionné pour l'entretien " + rk + " : " + selectedAudioFiles[0]);
                // mise à jour de l'affichage
                audioSpan.innerText = selectedAudioFiles[0];
                // mise à jour du tableau des entretiens
                ent.audioPath = String(selectedAudioFiles[0]);
                tabEnt[rk].audioPath = String(selectedAudioFiles[0]);
                await window.electronAPI.setEnt(tabEnt);


                // création de la nouvelle image de l'audio
                let nomFichAudio = ent.audioPath.replace(/^.*[\\\/]/, '');// nom du fichier d'origine (O) (sans chemin d'accès) 
                let fichImg = String(nomFichAudio).replace(/\.[^.]+$/, '.' + "png")
                ent.imgPath = fichImg;
                tabEnt[rk].imgPath = fichImg;
                await window.electronAPI.setEnt(tabEnt);
                CreerWaveform(selectedAudioFiles[0], fichImg)
                
                // sauvegarde du corpus
                window.sauvegarderCorpus();
            }
        });


    infoAud.appendChild(btnChangeAud);
 
    // bouton de retrait du corpus
    let btnSuppr = document.createElement('button');
    btnSuppr.innerText = "Supprimer l'entretien du corpus";
    btnSuppr.classList.add('btn','btn-warning');

    btnSuppr.addEventListener('click', function() {
       // logique pour supprimer l'entretien du corpus
       console.log("Suppression de l'entretien " + ent.nom);
       retirerEnt(rk); 
    });

    conteneur.appendChild(btnSuppr);


    // infos sur les variables
    let divVars = document.createElement('div');
    divVars.innerText = "variables associées : " + JSON.stringify(ent.tabVar) + "\n dictionnaires associés : " + JSON.stringify(ent.tabDic) + "\n données associées : " + JSON.stringify(ent.tabDat);
    

 

    //conteneur.appendChild(divVars);

};

async function retirerEnt(rk){

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    console.log("retrait de l'entretien " + rk)
    let id = tabEnt[rk].id

       // recherche du conteneur de l'entretien
    let conteneurEnt = document.querySelector(`div.ligent[data-id='${id}']`);
    if (conteneurEnt) {
        conteneurEnt.remove(); // suppression du conteneur de l'entretien
    }
   
     // retrait de l'entretien du tabEEnt
    tabEnt.splice(rk,1);
    // mise à jour du tableau des entretiens dans main
    await window.electronAPI.setEnt(tabEnt);
    // sauvegarde du corpus
    window.sauvegarderCorpus();
}


//=============================================================================
// affichage du contenu d'un fichier .Sonal dans la fenêtre issue de WhisPurge
//=============================================================================
async function afficherWhisPurge(){

    let rkEnt = await window.electronAPI.getEntCur();


    console.log("affichage whispurge du contenu de l'entretien " + rkEnt)

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
  
    // récupération de l'entretien
    let ent = tabEnt[rkEnt];

    // ajouter le nom de l'entretien dans le titre de la page html courante
    document.title =   ent.nom;
    
    // chargement du fichier audio éventuel
    console.log("chemin audio de l'entretien " + rkEnt + " : " + ent.audioPath)
        
        // définition du lecteur
        var audio = document.getElementById('lecteur'); 
        audio.src = ent.audioPath;
        audio.load()

    /*if (ent.audioPath !=""){
        let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
        let cheminAudio  ="";
        if (Corpus.type == "local") {
            cheminAudio = await window.electronAPI.createPath(Corpus.folder, ent.audioPath);
        } else {
            cheminAudio = [Corpus.folder, ent.audioPath].join('/');      
        }
;
    }*/

    // locuteurs
    let tabLoc = ent.tabLoc; // récupération des locuteurs
    await window.electronAPI.setTabLoc(tabLoc); // mise à jour du storage centralisé des locuteurs (main)

    //console.log("locuteur trouvé :" + tabLoc[1] )





    // récupération du html
    let html = await window.electronAPI.getHtml(Number(rkEnt)); // récupération du HTML en cache

    //console.log("contenu html " + html.substring(0, 100)+ "...")

    // recopiage du contenu du html dans segments
    document.getElementById('segments').innerHTML = html.replace(/`/g,''); // suppression des backticks

        // anonymisation

    window.tabAnon = ent.tabAnon; // récupération des anonymisations
    console.log("anonymisations trouvées :" + JSON.stringify(window.tabAnon) )
    initAnon();

    // effacement des sélections et surlignages
    effaceSel();
    effaceSurv();

    // création des classes css 
        
    
    loadThm();
    afflistThm("", 'conteneur_cat') 
       


    // affichage des thématiques multiples dans le texte
    multiThm('segments');


    // affichage des locuteurs

    // récupération des locuteurs 
    //let tabLoc = JSON.parse(ent.tabLoc);
    console.log("locuteurs trouvés :" + tabLoc )
    chargeLocut();
    checkloc(tabLoc);

    //=======================================================
    // panneaux latéraux
    //=======================================================

    // thématiques 
    //afflistThm(tabThm, 'fond_thm')


    // affichage des notes
    document.getElementById('txtnotes').value = ent.notes;

 

    // variables 
    tabVar = await window.electronAPI.getVar(); // récupération des variables  
    tabDic = await window.electronAPI.getDic(); // récupération des dictionnaires
    tabDat = ent.tabDat; // récupération des données
 

    console.log("variables trouvées :" + JSON.stringify(tabVar) )
    console.log("dictionnaires trouvés :" + JSON.stringify(tabDic) )
    console.log("données trouvées :" + JSON.stringify(tabDat) )




    // élaboration du résumé graphique de l'entretien
    let tabGrphEnt = await resumeGraphique(html.replace(/`/g,''));    

    console.log("tableau graphique de l'entretien " + rkEnt + " : ", tabGrphEnt[1])
    // dessin du graphe de l'entretien
    dessinResumeGraphique( document.getElementById("graphEnt"),tabGrphEnt   );

}


//================================================================================
// Sauvegarde modifs entretien
//================================================================================
async function miseàjourEntretien(rkEnt){ // depuis WhisPurge

    if (typeof rkEnt !== 'number' || rkEnt < 0) {
        console.error("rkEnt invalide:", rkEnt);
        return;
    }

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    
    if (!tabEnt || !tabEnt[rkEnt]) {
        console.error("Entretien non trouvé au rang:", rkEnt);
        return;
    }

    let ent = tabEnt[rkEnt];

    
    // 1 mise à jour des attributs de l'entretien
    // récupération des locuteurs
    tabLoc = await window.electronAPI.getTabLoc();
    if (typeof tabLoc !== 'undefined') {
        ent.tabLoc = tabLoc;
    }
    

    // récupération des variables
   ent.tabVar = tabVar;
   ent.tabDic = tabDic;
   ent.tabDat = tabDat;
   ent.tabAnon = window.tabAnon; 
  
    // récupération des notes
    const notesElem = document.getElementById('txtnotes');
    if (notesElem) {
        ent.notes = notesElem.value;

    }
    
    console.log("2 - entretien mis à jour :", ent);
    
    try {
        // mise à jour du tableau des entretiens
         await window.electronAPI.setEnt(tabEnt);

         window.sauvegarderCorpus(false);
 
    } catch(err) {
        
        console.error("ERREUR lors de setEnt:", err);
        return;
    }
    
    try {


        // sauvegarde du html en cache

        // suppression du menu contextuel 
        const oldMenu = document.getElementById("contextMenu")
        if (oldMenu) {oldMenu.remove()}

        //suppression des surlignements
        effaceSel();
        effaceSurv();
        

        const conteneurHtml = document.getElementById("segments");

         

        if (conteneurHtml) {
            cleanHTML() // nettoyage du html du conteneur
            let contenuHtml = String(conteneurHtml.innerHTML).replace(/`/g,''); 

            await window.electronAPI.setHtml(rkEnt, contenuHtml);
            

            // sauvegarde du fichier de l'entretien
  
             

            const contenuFichierSonal = sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, tabDat, ent.notes, contenuHtml, ent.tabAnon); // conversion du HTML en format Sonal


            let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
            let cheminEnt = ""; 
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
                const res = await window.electronAPI.sauvegarderFichier(cheminEnt, contenuFichierSonal);
            } else {
                cheminEnt = [Corpus.folder, ent.rtrPath].join('/');    
                const res = await window.electronAPI.sauvegarderSurServeur(cheminEnt, contenuFichierSonal);  
            }
            
            console.log("4b - fichier de l'entretien sauvegardé :", res);

            

        } else {
            console.error("3 - ERREUR: conteneurHtml not found");
        }
    } catch(err) {
        console.error("ERREUR lors de setHtml:", err);
    }
     
}

 

async function majFichierSonal(rkD,rkF){ // permet de réécrire un fichier Sonal depuis les données en mémoire

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    let tabThm = await window.electronAPI.getThm(); // récupération des thématiques depuis main
    let tabVar = await window.electronAPI.getVar(); // récupération des variables depuis main
    let tabDic = await window.electronAPI.getDic(); // récupération des dictionnaires depuis main

    if (!rkD || rkD<0){rkD=0}
    if (!rkF || rkF>tabEnt.length){rkF=tabEnt.length}

    for (let rkEnt=rkD; rkEnt<rkF; rkEnt++){
    
        console.log("mise à jour du fichier Sonal de l'entretien " + rkEnt)
     


   
    let ent = tabEnt[rkEnt];
    let tabDat = tabEnt[rkEnt].tabDat; // récupération des données de l'entretien

    
    // création d'un fichier Sonal à partir des données mémorisées  
    let contenuFichierSonal = window.sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, tabDat, ent.notes, await window.electronAPI.getHtml(rkEnt), tabAnon);

     try {
 
            let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
            let cheminEnt = ""; 
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
                const res = await window.electronAPI.sauvegarderFichier(cheminEnt, contenuFichierSonal);
            } else {
                cheminEnt = [Corpus.folder, ent.rtrPath].join('/');    
                const res = await window.electronAPI.sauvegarderSurServeur(cheminEnt, contenuFichierSonal);  
            }
            
              

        }  catch(err) {
            console.error("impossible de modifier:", err);
        }
 
    }
}

// conversion des anciens fichiers RTR
async function ChargerRtr(element, index){
    
    

        let nomfich = element.nom
        const adrFich = await window.electronAPI.createPath(dossProjet, nomfich); // définition de l'adresse du Rtr

        // ajout de l'extension rtr
        const adrRtr = adrFich +".Rtr"  

        

        // y'a-t-il un fichier rtr associé au fichier?
        const existRtr = await window.electronAPI.doesFileExists(adrRtr); 

        if (existRtr==false){return}; 

        // récupération du contenu du RTR
        const content = await window.electronAPI.readFileContent(adrRtr);
        
        
            // split par lignes du contenu du fichier 
            let contenu = content.replace(/\r?\n|\r/,'\n') // uniformisation des sauts de ligne
            // split du texte par lignes \n
            lignesFich = contenu.split("\n");

            //===========================
            //  durée
            //===========================
            
            element.hms = lignesFich[0]

            //===========================
            // Observations 
            //===========================

            let debObs=-1;
            let nbl = lignesFich.length;
            
            let observations =""

            for (l=0;l<nbl;l++){ // défilement les lignes
                
                if (lignesFich[l].substring(0,6) == "<|OBS|"){debObs=l; continue} // repérage de la balise d'ouverture
                if (lignesFich[l].substring(0,6) == ">|OBS|"){debObs=-1;break}  // fin

                if (debObs>0){ // récupération des observations
                observations +=   lignesFich[l]
                
                }

            }

            element.notes = observations;

            //===========================
            // Récupération des attributs
            //===========================

            let debAttr=-1;
             
            
            let posFinAttr;

            for (l=0;l<nbl;l++){ // défilement les lignes
                
                if (lignesFich[l].substring(0,7) == "<|ATTR|"){debAttr=l; continue} // repérage de la balise d'ouverture
                if (lignesFich[l].substring(0,7) == ">|ATTR|"){posFinAttr=l+1;break}  // fin

                if (debAttr>0){ // récupération des attributs
                
                let parts = lignesFich[l].split(",");

                let nomVar = tabVar[Number(parts[0])].nom

                element[nomVar] = tabDic [Number(parts[0])] [Number(parts[1])];
                
                }

            }


        // récupération des extraits

            for (l=posFinAttr;l<nbl;l++){ // défilement les lignes

                var vdeb; 
                var vfin;
                var chainethm;
                var txttags;
                var contenuXtr = "";
                var txtlig = lignesFich[l].trim();

                // y a -t-il une balise ?
                let posbal =  txtlig.lastIndexOf("::");
               
                if (posbal>-1) { //il y a une balise
                  

                    if (posbal==txtlig.length-2) { //si la ligne se termine par :: c'est une balise fermante

                        //récupération de la position de fin
                        let sspts = txtlig.replaceAll("::","");
                        sspts = sspts.trim();
                        sspts = sspts.replace(",",".")
                        vfin  = Number(sspts) // valeur de fin
                         

                        tabXtr.push({
                            ent:index,
                            deb:vdeb,
                            fin:vfin,
                            thm:chainethm,
                            tags:txttags,
                            text:contenuXtr
                        })
                        
                        
                        contenuXtr =""
                        

                        } else { // balise fermante

                        vdeb=txtlig.substring(2,posbal-1); // valeur de début
                        vdeb=vdeb.replace(",",".");
                        vdeb=Number(vdeb);

                        let postag =  txtlig.lastIndexOf("Tags=");
                        chainethm = txtlig.substring(posbal+2,postag);// thèmes
                        txttags = txtlig.substring(postag+5);// tags
                        }


                } else { // il n'y a pas de balise, on ajoute le texte
                         
                        contenuXtr+=lignesFich[l]
                }
                
 
            }
        
}




////////////////////////////////////////////////////////////////////////////////////
// DESSIN DES WAVEFORMS
////////////////////////////////////////////////////////////////////////////////////

async function CreerWaveform(audioFile,nomFichierImage){
 
    // Retourner immédiatement pour ne pas bloquer le thread principal
    setTimeout(async () => {
        // Notification visuelle
        afficherNotification('Le fichier son est en cours d\'analyse /n Merci de patienter.', 'success');

        // récupération du corpus
        let Corpus = await window.electronAPI.getCorpus();
        
        let cheminFichTxtA = ""
        if (Corpus.type == "local"){ 	
            cheminFichTxtA = await window.electronAPI.createPath(Corpus.folder, nomFichierImage); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)
        } else if (Corpus.type == "distant") {
            cheminFichTxtA =  [Corpus.folder,nomFichierImage].join('/');
        }

        // le fichier existe-t-il déjà?
        const existFichA = await window.electronAPI.doesFileExists(cheminFichTxtA);
        if (existFichA==true){
            console.log("Le fichier de forme d'onde " + nomFichierImage + " existe déjà. Il ne sera pas recréé.");
            return; // sortie de la fonction
        }

        try {
            console.time('Chargement total');
            console.log('Chargement du fichier...');
            console.time('Lecture fichier');
            
            const result = await window.electronAPI.loadAudioFile(audioFile);
            
            if (!result.success) {
                console.error('Erreur:', result.error);
                return;
            }
            console.timeEnd('Lecture fichier');
            afficherNotification('Décodage audio /n Merci de patienter.', 'success');
            console.log('Décodage audio...');
            console.time('Décodage audio');
            
            const uint8Array = new Uint8Array(result.data);
            const arrayBuffer = uint8Array.buffer;
            
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            console.timeEnd('Décodage audio');
            console.log('Dessin de la forme d\'onde...');
            console.time('Dessin');
            
            // Création d'un canvas pour créer et enregistrer l'image
            let canva = document.createElement('canvas');
            canva.width = 800;
            canva.height = 31;
            document.body.appendChild(canva); 

            const ctx = canva.getContext('2d');

            if (!audioBuffer || audioBuffer.numberOfChannels === 0) {
                console.error('AudioBuffer invalide ou sans canal');
                return;
            }

            const data = audioBuffer.getChannelData(0); // Premier canal
            const width = canva.width || canva.clientWidth;
            const height = canva.height || canva.clientHeight;
            const step = Math.max(1, Math.ceil(data.length / width));
            const amp = height / 2;

            ctx.strokeStyle = '#d6d6d6ff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;

                // Trouver les valeurs min/max dans ce segment
                for (let j = 0; j < step; j++) {
                    const idx = (i * step) + j;
                    if (idx >= data.length) break;
                    const datum = data[idx];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }

                const x = i;
                const yMin = (1 + min) * amp;
                const yMax = (1 + max) * amp;

                if (i === 0) {
                    ctx.moveTo(x, amp);
                }

                ctx.lineTo(x, yMin);
                ctx.lineTo(x, yMax);
            }

            ctx.stroke();

            console.timeEnd('Dessin');
            console.timeEnd('Chargement total');

            // enregistrement du canvas sous forme d'image dans le dossier de projet
            const dataURL = canva.toDataURL('image/png');
            // Conversion du dataURL en binaire dans le renderer (évite l'utilisation de Buffer)
            // On utilise fetch -> arrayBuffer -> Uint8Array
            const response = await fetch(dataURL);
            const arrayBuffer2 = await response.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer2);

            // définition du nom du fichier
            // récupération du corpus
            let Corpus = await window.electronAPI.getCorpus();
            
            if (Corpus.type == "local"){ 	
                let cheminFichTxtA = await window.electronAPI.createPath(Corpus.folder, nomFichierImage); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)
                const res = await window.electronAPI.sauvegarderFichier(cheminFichTxtA, buffer);
                console.log('Résultat écriture fichier local:', res);
            } else if (Corpus.type == "distant") {
                let cheminFichTxtA =  [Corpus.folder,nomFichierImage].join('/');
                const res = await window.electronAPI.sauvegarderSurServeur(cheminFichTxtA, buffer);
                console.log('Résultat sauvegarde serveur:', res);
            }

            // Nettoyer le canvas temporaire
            document.body.removeChild(canva);

        } catch (error) {
            console.error('Erreur de chargement:', error);
        }
    }, 0);

    // Retourner immédiatement
    return Promise.resolve();
}

function dessinWaveform(audioBuffer, canva ) {
    
    
}



/////////////////////////////////////////////////////////////////////////////////:
// EXPORTATION DES FONCTIONS
/////////////////////////////////////////////////////////////////////////////////
// Export CommonJS pour utilisation dans main.js (contexte Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ajouterEntretien,
        ajouterPlusieursEntretiens,
        afficherEnt,
        loadHtml,
        afficherWhisPurge,
        miseàjourEntretien
    };
}

// Export global pour utilisation dans le renderer (contexte navigateur)
if (typeof window !== 'undefined') {
    window.ajouterEntretien = ajouterEntretien;
    window.ajouterPlusieursEntretiens = ajouterPlusieursEntretiens;
    window.afficherEnt = afficherEnt;
    window.loadHtml = loadHtml;
    window.afficherWhisPurge = afficherWhisPurge;
    window.miseàjourEntretien = miseàjourEntretien;
}