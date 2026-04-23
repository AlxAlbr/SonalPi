/////////////////////////////////////////////////////////////////////
// GESTION DES ENTRETIENS
/////////////////////////////////////////////////////////////////////

//const { compterElements } = require("./utilitaires");

// ajout d'un entretien
// batchMode = true : ne pas sauvegarder ni afficher après l'ajout (géré par ajouterPlusieursEntretiens)
async function ajouterEntretien(fichTxt, fichAudio, batchMode = false){
    
    //console.log("ajout d'un entretien")

    // initialiser le storage centralisé des locuteurs (main) — fallback sur window
    if (window && window.electronAPI && typeof window.electronAPI.setTabLoc === 'function') {
        window.electronAPI.setTabLoc([]).catch(err => console.warn('setTabLoc init failed', err));
    } else {
        window.tabLocImport = [];
    }

    // récupération du corpus
    let Corpus = await window.electronAPI.getCorpus();

    // Vérification de la restriction GitLab
    if (Corpus.type === 'gitlab') {
        const isOwner = await window.electronAPI.getGitlabUserIsOwner();
        const opts = await window.electronAPI.getGitlabOptions();
        if (opts.restrictionAjoutSuppr && !isOwner) {
            await question("Permission refusée", "Le responsable du projet a restreint l'ajout d'entretiens aux Maintainer/Owner.", ["OK"]);
            return;
        }
    }

    if (fichTxt == null && fichAudio == null) {
    const result = await window.electronAPI.ajouterEntretien();

        if (result.canceled) {
            console.log("Ajout d'entretien annulé");
            return;
        }

        fichTxt = result.textFiles[0]; // adresse du fichier txt (O)
        fichAudio = result.audioFiles[0]; // adresse du fichier audio (O)
    }    
    
    
    let nomFichTxtA;
    let fichApresConversion;
    let tabDatImport = [];

    if (fichTxt) {

        let nomFichTxtO = fichTxt.replace(/^.*[\\\/]/, '');// nom du fichier d'origine (O) (sans chemin d'accès) 
        let extFichTxtO = nomFichTxtO.substring(nomFichTxtO.lastIndexOf(".")).toLowerCase(); // extension du fichier d'origine (O)
        nomFichTxtA = nomFichTxtO.replace(new RegExp(extFichTxtO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '.sonal'); // nom du fichier d'arrivée (A) à créer dans le projet (si local?)
    
        /*
        if (Corpus.type == "distant") {
            // Supprimer les caractères spéciaux problématiques pour un serveur
            nomFichTxtA = nomFichTxtA
                .replace(/\s+/g, '_')              // remplacer espaces par underscores
                .replace(/[^a-zA-Z0-9._-]/g, '')   // garder seulement alphanumériques, underscore, tiret, point
                .replace(/\.{2,}/g, '.');  
        }
            */

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

        fichApresConversion = ""; // contenu après conversion

        // conversion du fichier sélectionné 
        switch (extFichTxtO) {
            case ".txt":
                fichApresConversion = await convertTXT(content);
                break;

            case ".srt":
            case ".vtt":
                fichApresConversion = await convertSRT(content);
                break;

            case ".purge":
                fichApresConversion = await convertPURGE(content);
                break;

            case ".sonal":
                fichApresConversion = await importSONAL(content);
                break;

            case ".json":
                fichApresConversion = await convertJSON(content);
                break;

            case ".docx":
                fichApresConversion = await convertTXT(content);
                break;

            case ".pdf":
                fichApresConversion = await convertTXT(content);
                break;
        }

        // Capturer le tabDat aligné AVANT la conversion en string (uniquement pour .sonal)
        tabDatImport = (typeof fichApresConversion === 'object' && fichApresConversion && fichApresConversion.tabDatAligned)
            ? fichApresConversion.tabDatAligned
            : [];

        // Extraire la string de l'objet si nécessaire et s'assurer que c'est une string
        if (typeof fichApresConversion === 'object') {
            if (fichApresConversion && fichApresConversion.formatSonal) {
                fichApresConversion = fichApresConversion.formatSonal;
            } else {
                fichApresConversion = JSON.stringify(fichApresConversion);
            }
        }
        
        if (typeof fichApresConversion !== 'string') {
            fichApresConversion = String(fichApresConversion);
        }

    } else {
        // Pas de fichier de transcription — contenu par défaut
        let audioBaseName = fichAudio
            ? fichAudio.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')
            : 'entretien';
        nomFichTxtA = audioBaseName + '.sonal';
        fichApresConversion = `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8">\n</head>\n<body><div id="contenuText"><span class="lblseg sautlig" data-deb="0" data-fin="0" data-loc="" tabindex="1" data-rksg="1"><span data-rk="1" data-sg="1" data-len="3">(pas de transcription)</span></span></div>\n</body>\n</html>`;
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
 

        } else if (Corpus.type == "distant" || Corpus.type == "gitlab") {

            let cheminFichTxtA = [Corpus.folder, nomFichTxtA].filter(Boolean).join('/');
            const res = await window.electronAPI.sauvegarderSurServeur(cheminFichTxtA, fichApresConversion);
            console.log('Résultat sauvegarde serveur:', res);
        }
    


    // création de l'image de l'audio
    let fichImg =""
    if(fichAudio){
        let basePourImg = fichTxt ? fichTxt : fichAudio;
        let nomFichPourImg = basePourImg.replace(/^.*[\\\/]/, '');// nom du fichier d'origine (sans chemin d'accès)
        fichImg = String(nomFichPourImg).replace(/\.[^.]+$/, '.' + "png")
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
        imgPath : fichImg, // image de la forme d'onde (vide si pas d'audio)
        tabVar: tabVar,   // global, synchronisé par fusionTabVar
        tabDic: tabDic,   // global, synchronisé par fusionTabVar
        tabDat: tabDatImport,
        tabAnon: window.tabAnonImport, // tableau des anonymisations importé
    };

    // ajout de l'entretien au tableau
    tabEnt.push(nouveauEnt);

    // mise à jour du tableau des entretiens dans main
    await window.electronAPI.setEnt(tabEnt);

    let rknv = tabEnt.length - 1; // rang de l'entretien ajouté
    console.log("Entretien ajouté avec le rang " + rknv, nouveauEnt);

    // Génération de la waveform en arrière-plan (fire-and-forget)
    if (fichAudio && fichImg) {
        setTimeout(() => CreerWaveform(String(fichAudio), fichImg, async () => {
            // callback : mettre à jour l'image dans l'UI si l'entretien est déjà affiché
            let tabEntCur = await window.electronAPI.getEnt();
            let Corpus = await window.electronAPI.getCorpus();
            if (!tabEntCur || !Corpus) return;
            let id = tabEntCur[rknv] ? tabEntCur[rknv].id : null;
            if (!id) return;
            let conteneurEnt = document.querySelector(`div.ligent[data-id='${id}']`);
            if (conteneurEnt) {
                let imgEl = conteneurEnt.querySelector('.ligent-img');
                let chemin = Corpus.type === 'local'
                    ? await window.electronAPI.createPath(Corpus.folder, fichImg)
                    : [Corpus.folder, fichImg].filter(Boolean).join('/');
                if (imgEl) imgEl.src = chemin + '?t=' + Date.now();
            }
        }), 2000);
    }

    if (!batchMode) {
        // sauvegarde et affichage immédiats (mode ajout unitaire)
        await window.sauvegarderCorpus();
        await loadHtml(rknv, rknv);
        await afficherEnt(rknv, rknv);
    }

    return rknv;

}

async function ajouterPlusieursEntretiens(selectedTextFiles) {

    // Mémorise le rang de départ pour n'afficher que les nouveaux entretiens
    let tabEntInitial = await window.electronAPI.getEnt();
    if (!tabEntInitial) tabEntInitial = [];
    const premierRang = tabEntInitial.length;

    // Ajout séquentiel en mode batch (sans sauvegarde ni affichage intermédiaires)
    for (const file of selectedTextFiles) {
        await ajouterEntretien(file, null, true);
    }

    // Une seule sauvegarde du corpus à la fin
    await window.sauvegarderCorpus();

    // Chargement et affichage de tous les nouveaux entretiens en une passe
    let tabEntFinal = await window.electronAPI.getEnt();
    if (!tabEntFinal) tabEntFinal = [];
    const dernierRang = tabEntFinal.length - 1;

    if (dernierRang >= premierRang) {
        await loadHtml(premierRang, dernierRang);
        await afficherEnt(premierRang, dernierRang);
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
            if (lblmessage) lblmessage.innerText = "Chargement de l'entretien " + (e+1) + " / " + tabEnt.length + "..."     
            
            document.getElementById('status-bar').innerText = "Chargement de l'entretien " + (e+1) + " / " + tabEnt.length + " (" + tabEnt[e].nom + ")";
            document.getElementById('progress-bar').style.width = ((e+1)/tabEnt.length)*100 + "%"; 

            // 1 - Définition du chemin du fichier de l'entretien
            let cheminEnt  =""; 
            
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, tabEnt[e].rtrPath);
            } else {
                cheminEnt = [Corpus.folder, tabEnt[e].rtrPath].filter(Boolean).join('/');
            }

            // 1bis - Vérification de l'existence du fichier de l'entretien
            let existFile = await window.electronAPI.doesFileExists(cheminEnt);
            if (!existFile) {
                dialog("Message", "Le fichier de l'entretien " + tabEnt[e].nom + " est introuvable à l'adresse :\n'" + cheminEnt+ "'");
                continue;
            } 

            // 2 - lecture du contenu du fichier de l'entretien
            //console.log("lecture du fichier : " + cheminEnt)
            let contenuEnt = await window.electronAPI.readFileContent(cheminEnt);
            const metadata = await window.electronAPI.getFileMetadata(cheminEnt);

            if (metadata.success) {
                // Ajouter à l'élément de TabEnt
                tabEnt[e].lastModified = metadata.lastModified;
                tabEnt[e].fileSize = (metadata.size / (1000 * 1000)).toFixed(2) + " Mo"; // Convertir en Mo et formater
                await window.electronAPI.setEnt(tabEnt); // mise à jour du tableau des entretiens dans main
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
                     
                    if (donnéesEnt.tabVar)  tabEnt[e].tabVar  = donnéesEnt.tabVar;
                    if (donnéesEnt.tabDic)  tabEnt[e].tabDic  = donnéesEnt.tabDic;
                    if (donnéesEnt.tabDat)  tabEnt[e].tabDat  = donnéesEnt.tabDat;
                    if (donnéesEnt.tabAnon) tabEnt[e].tabAnon = donnéesEnt.tabAnon;
                    if (donnéesEnt.tabLoc)  tabEnt[e].tabLoc  = donnéesEnt.tabLoc;

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

    

    tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main


    //console.log("affichage des entretiens de " + rgDep + " à " + rgFin + " \n tabent : ", tabEnt);

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
        document.getElementById('status-bar').innerText = "Affichage de l'entretien " + (e+1) + " / " + tabEnt.length + " (" + tabEnt[e].nom + ")"; 
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
            if (tabEnt[e].actif === 0) div.classList.add('ligent--inactif');

            conteneur.appendChild(div);

            // bouton on/off
            const btnOnOff = document.createElement('button');
            btnOnOff.classList.add('btn-onoff-ent');
            btnOnOff.title = 'Activer / désactiver cet entretien';
            if (tabEnt[e].actif !== 0) btnOnOff.classList.add('btn-onoff-ent--actif');
            div.appendChild(btnOnOff);

            // étiquette du nom
            const lbl = document.createElement('div');
            lbl.classList.add('lbl-nom-ent');
            lbl.innerText = tabEnt[e].nom;
            div.appendChild(lbl);

            //cadre de l'image
            const divE = document.createElement('div');
            divE.classList.add('fond-cnv-ent');
            divE.dataset.id = tabEnt[e].id;
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
                console.log("recherche de l'image à ladresse : " + cheminImg)
            let existFile = await window.electronAPI.doesFileExists(cheminImg);
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
            div.addEventListener('click', async function(event) {

                console.log("affichage de l'entretien " + this.dataset.id)
                event.stopPropagation(); //pas de propagation au niveau supérieur

                // récupération du tabEnt
                let idEnt = Number(this.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
    
                console.log("Rang de l'entretien cliqué : " + rkEnt)
                dispPanneauG('imgpandet', 'fond_ent_corpus')
                await window.electronAPI.setEntCur(rkEnt) // mise à jour de l'entretien courant dans main
                afficherDetailsEnt(rkEnt);
            })

            // ajout d'un listener pour le clic droit sur l'entretien
            div.addEventListener('contextmenu', async function(event) {
                event.preventDefault(); // Empêche le menu contextuel par défaut
                let idEnt = Number(this.dataset.id)
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
 
            });

            // ajout d'un listener pour le clic sur le canvas (avec position en X)
            cnv.addEventListener('click', function(event) {
                event.stopPropagation(); // empêche le click de remonter au div.ligent (qui appellerait afficherDetailsEnt et supprimerait fenEnt)
            });

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
                 
                désélectEntretiens() // désélection de tous les autres entretiens

                //console.log("clic sur le bouton play de l'entretien " + rkEnt)
                
                let editable = true;  // le fichier peut être édité

                await window.electronAPI.setEntCur(rkEnt)

                // vérification que l'entertien est accessible (si distant)
                    // récupération du corpus 
                    let Corpus = await electronAPI.getCorpus();

                    if (Corpus.type == "distant" || Corpus.type == "gitlab"){
                        let result = await electronAPI.isEntretienLocked(rkEnt)
                         if (result.locked==true) {
                                    console.log("l'entretien est verrouillé par " + result.user)
                                    alert(`L'entretien est actuellement édité par ${result.user}. \n Vous ne pouvez pas l'éditer pour le moment.`);
                                    editable=false; 
                                    return   // Ne pas ouvrir la fenêtre d'édition
                        }

                        // Rechargement de la version distante avant ouverture
                        // pour s'assurer d'avoir la version la plus récente
                        console.log("Rechargement de l'entretien " + rkEnt + " depuis le serveur...");
                        await loadHtml(rkEnt, rkEnt);
                }

                if (editable) await window.electronAPI.editerEntretien(rkEnt); 
            })

            // bouton on/off : bascule l'état actif de l'entretien
            btnOnOff.addEventListener('click', async function(event) {
                event.stopPropagation();
                let idEnt = Number(this.parentElement.dataset.id);
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
                if (rkEnt === -1) return;
                tabEnt[rkEnt].actif = (tabEnt[rkEnt].actif === 0) ? 1 : 0;
                await window.electronAPI.setEnt(tabEnt);
                //await window.sauvegarderCorpus();
                const ligentDiv = this.parentElement;
                if (tabEnt[rkEnt].actif === 0) {
                    ligentDiv.classList.add('ligent--inactif');
                    this.classList.remove('btn-onoff-ent--actif');
                } else {
                    ligentDiv.classList.remove('ligent--inactif');
                    this.classList.add('btn-onoff-ent--actif');
                }

                compterEntActifs(); 
            });

            // bouton on/off : clic droit → désactive tous les autres entretiens sauf celui-ci
            btnOnOff.addEventListener('contextmenu', async function(event) {
                event.preventDefault();
                event.stopPropagation();
                let idEnt = Number(this.parentElement.dataset.id);
                let rkEnt = tabEnt.findIndex(ent => ent.id === idEnt);
                if (rkEnt === -1) return;
                // activer celui-ci, désactiver tous les autres
                tabEnt.forEach((ent, i) => { ent.actif = (i === rkEnt) ? 1 : 0; });
                await window.electronAPI.setEnt(tabEnt);
                // mettre à jour tous les boutons et lignes dans le DOM
                document.querySelectorAll('div.ligent').forEach(ligentDiv => {
                    const id = Number(ligentDiv.dataset.id);
                    const rk = tabEnt.findIndex(ent => ent.id === id);
                    const btn = ligentDiv.querySelector('.btn-onoff-ent');
                    if (id === idEnt) {
                        ligentDiv.classList.remove('ligent--inactif');
                        if (btn) btn.classList.add('btn-onoff-ent--actif');
                    } else {
                        ligentDiv.classList.add('ligent--inactif');
                        if (btn) btn.classList.remove('btn-onoff-ent--actif');
                    }
                });

                compterEntActifs(); 
            });


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
            dessinResumeGraphique(e, cnv, tabGrphEnt); // résumé graphique de l'entretien

        }

        // 2 - remplissage du canvas
        //if (!tabEnt[t].html){ // si le HTML n'est pas encore chargé
         
        //}
    

    }

         // message de fin  
        document.getElementById('status-bar').innerText = "Prêt " 
        document.getElementById('progress-bar').style.width = "0"; 

         compterEntActifs(); 

 
}    

async function compterEntActifs(){ // fonction permettant de compter et d'afficher le nombre d'entretiens actifs

tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
let nbActifs = tabEnt.filter(ent => ent.actif !== 0).length;

    if (nbActifs < tabEnt.length) {
    document.getElementById('lbl-nb-ent').innerText = "(" + nbActifs + " / " + tabEnt.length + ")";
    } else {
    document.getElementById('lbl-nb-ent').innerText = "(" + tabEnt.length + ")";
    }
}
 
async function  afficherHtmlAtPos(rkEnt, ratio, rkmot){

   console.log("affichage de l'entretien " + rkEnt + " à la position " + ratio  + "ou au mot " + rkmot);

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    let html = await window.electronAPI.getHtml(Number(rkEnt)); // récupération du HTML en cache   

    


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

        console.log("il y a une ancienne fenêtre d'entretien ouverte avec le dataset" + conteneur.dataset.id)

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
        divFond.addEventListener('click', function(event) {
            event.stopPropagation(); // Empêche la propagation de l'événement au div parent
        });

        divFond.addEventListener('contextmenu', function(event) {
            event.preventDefault();
            event.stopPropagation();

            // suppression d'un éventuel menu contextuel existant
            const oldMenu = document.getElementById('ctx-menu-fenent');
            if (oldMenu) oldMenu.remove();

            const selection = window.getSelection();
            const texteSelectionne = selection ? selection.toString().trim() : '';

            // création du menu
            const menu = document.createElement('div');
            menu.id = 'ctx-menu-fenent';
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

            // item : copier la sélection
            const itemCopier = document.createElement('div');
            itemCopier.innerText = '📋 Copier';
            itemCopier.style.cssText = 'padding: 6px 12px;';
            itemCopier.style.opacity = texteSelectionne ? '1' : '0.4';
            itemCopier.style.pointerEvents = texteSelectionne ? 'auto' : 'none';
            itemCopier.addEventListener('mouseenter', () => itemCopier.style.background = '#f0f0f0');
            itemCopier.addEventListener('mouseleave', () => itemCopier.style.background = '');
            itemCopier.addEventListener('click', () => {
                navigator.clipboard.writeText(texteSelectionne).then(() => {
                    afficherNotification('Texte copié dans le presse-papier', 'success');
                }).catch(() => {
                    document.execCommand('copy'); // fallback
                });
                menu.remove();
            });
            menu.appendChild(itemCopier);

            

            document.body.appendChild(menu);

            // fermeture au prochain clic n'importe où
            const fermerMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('mousedown', fermerMenu);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', fermerMenu), 0);
        });
 
        //divFond.setAttribute('onclick', "this.classList.add('dnone')"); // désactivation du menu contextuel
        conteneur.after(divFond); 
    
        // entête
        let divEntete = document.createElement('div');
        divEntete.classList.add('entete-fenent');
        divEntete.textContent = tabEnt[rkEnt].nom; // nom de l'entretien dans l'entête

        //divEntete.innerHTML = (await varsPubliquesEnt(rkEnt))[0]; // ajout des variables publiques dans l'entête;

        divFond.appendChild (divEntete);

        let btnFermer = document.createElement('button');
        btnFermer.classList.add('btn-close-fenent');
        btnFermer.innerText = "X";
        btnFermer.addEventListener('click', function(event) {
            event.stopPropagation(); // Empêche la propagation de l'événement au div parent
            console.log("fermeture de la fenêtre d'entretien")
            désélectEntretiens()
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
            
        console.log("calcul de la position du mot à afficher en fonction du ratio " + ratio)

        const fen = document.getElementById('segments-contenu');
        if (fen) {
            const scrollPosition = fen.scrollHeight * ratio;
            fen.scrollTo({
                top: scrollPosition - fen.clientHeight / 2, // centrer verticalement
                behavior: 'smooth'
            });
        }
        return;

    } else {
            mot = await getSpan(rkmot); // récupération du mot à la position
             
            mot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
           
    if (!mot) {console.log ("mot introuvable")  ; return} // si le mot n'existe pas, on sort de la fonction
            
          
 
            
      
            
            

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

function désélectEntretiens() { // supprime la sélection et l'affichage des détails d'un entretien
 
    console.log("deselection de tous les entretiens")
    // déselection de tous les autres entretiens
    document.querySelectorAll('div.ligent').forEach(div => {
        div.classList.remove('active-ligent');
    });

    // suppression de la fenêtre d'entretien
    let fenEnt =  document.getElementById('fenEnt')
    if (fenEnt) fenEnt.remove(); // fermeture de la fenêtre d'entretien si elle est ouverte

    // masquage de la fenêtre d'information de l'entretien
    dispPanneauG('imgpancat','fond_thm_corpus')
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
        const fenEnt =  document.getElementById('fenEnt')
        if (fenEnt) fenEnt.remove(); // fermeture de la fenêtre d'entretien si elle est ouverte 

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


    // wrapper flex pour mettre l'id et le nom côte à côte
    let wrapperNomId = document.createElement('div');
    wrapperNomId.style.cssText = "display:flex; flex-direction:row; gap:5px; align-items:flex-end;";
    wrapperNomId.classList.add('container-nom-id');
    conteneur.appendChild(wrapperNomId);

    // champ id (non éditable) avec floating label "Id"
    let infoIdNum = document.createElement('div');
    infoIdNum.style.backgroundColor = "#ffffffff";
    infoIdNum.style.width = "50px";
    infoIdNum.style.flexShrink = "0";
    infoIdNum.classList.add('item-info-ent', 'floating-label-container');

    let idSpan = document.createElement('span');
    idSpan.classList.add('nom-info-ent');
    idSpan.contentEditable = false;
    idSpan.innerText = ent.id;
    infoIdNum.appendChild(idSpan);

    let labelIdNum = document.createElement('label');
    labelIdNum.innerText = "Id";
    labelIdNum.classList.add('mdc-floating-label', 'floatingstatic');
    infoIdNum.appendChild(labelIdNum);

    wrapperNomId.appendChild(infoIdNum);

    // identifiant : conteneur + span éditable pour le nom  
    let infoId = document.createElement('div');
    infoId.style.backgroundColor = "#ffffffff";
    infoId.style.flex = "1";
    infoId.classList.add('item-info-ent', 'id-info-ent', 'floating-label-container');

    // span éditable contenant uniquement le nom
    let nameSpan = document.createElement('span');
    nameSpan.classList.add('nom-info-ent');
    nameSpan.contentEditable = true;
    nameSpan.innerText = ent.nom;

    // valider le changement de nom (entrée) sur le span éditable
    nameSpan.addEventListener('keydown', function(event) {
        infoId.classList.add("en-edition"); // ajouter une classe pour indiquer que le champ est en cours d'édition
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
            infoId.classList.remove("en-edition")
            infoId.classList.remove("validation-ok"); 
            infoId.classList.add("validation-ok"); 
        }
    });

    infoId.appendChild(nameSpan);

    wrapperNomId.appendChild(infoId);

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

    infoDate.addEventListener('click', async function() {

        // récupère la date de modification du fichier (local ou distant)
        let cheminEnt = "";
        if (Corpus.type == "local") {
            cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
        } else {
            cheminEnt = [Corpus.folder, ent.rtrPath].filter(Boolean).join('/');
        }

        await window.electronAPI.getLastModified(cheminEnt).then(lastModified => {
            if (!lastModified) {
                infoDate.innerText = "Dernière modification : ??";
                return;
            }
            console.log("Dernière modification du fichier:", lastModified);
            infoDate.innerText = `Dernière modification : ${new Date(lastModified).toLocaleString()}`;
        }).catch(error => {
            console.error("Erreur lors de la récupération de la dernière modification:", error);
        });


    });

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

                // fire-and-forget : l'UI reste réactive ; l'image s'affiche quand prête
                CreerWaveform(selectedAudioFiles[0], fichImg, async () => {
                    const elCont = document.querySelector(`div.ligent[data-id='${ent.id}']`);
                    if (elCont && ent.imgPath) {
                        const imgEl = elCont.querySelector('.ligent-img');
                        const chemin = Corpus.type === 'local'
                            ? await window.electronAPI.createPath(Corpus.folder, ent.imgPath)
                            : [Corpus.folder, ent.imgPath].join('/');
                        imgEl.src = chemin + '?t=' + Date.now(); // évite le cache
                    }
                });

                // sauvegarde du corpus sans attendre la waveform
                window.sauvegarderCorpus();
             }
        });


    infoAud.appendChild(btnChangeAud);
 
    // bouton de retrait du corpus
    let btnSuppr = document.createElement('button');
    btnSuppr.innerText = "❌️ Supprimer l'entretien du corpus";
    btnSuppr.classList.add('btn','btn-warning');

    btnSuppr.addEventListener('click', function() {
       // logique pour supprimer l'entretien du corpus
       console.log("Suppression de l'entretien " + ent.nom);
       retirerEnt(rk); 
    });

    conteneur.appendChild(btnSuppr);



    // infos sur les variables
    let divVars = document.createElement('div');
    divVars.style.height = "570px";
    divVars.style.overflowY = "auto";
    //divVars.innerText = "variables associées : " + JSON.stringify(ent.tabVar) + "\n dictionnaires associés : " + JSON.stringify(ent.tabDic) + "\n données associées : " + JSON.stringify(ent.tabDat);
    
    conteneur.appendChild(divVars);

    let titreVarGen = document.createElement('H3');
    titreVarGen.innerText = "Variables générales";
    titreVarGen.style.marginTop = "20px";
    titreVarGen.style.marginBottom = "10px";
    titreVarGen.style.marginLeft = "1px";
    titreVarGen.classList.add( 'logo-variables');
    divVars.appendChild(titreVarGen);

    let divVarGen = document.createElement('div');
    divVarGen.id = "listVarGenContent";
    divVars.appendChild(divVarGen);


    let titreVarLoc = document.createElement('H3');
    titreVarLoc.innerText = "Variables par locuteur";
    titreVarLoc.style.marginTop = "20px";
    titreVarLoc.style.marginBottom = "10px";
    titreVarLoc.classList.add('logo-variables');
    divVars.appendChild(titreVarLoc);

    let divVarLoc = document.createElement('div');
    divVarLoc.id = "listVarLocContent";
    divVars.appendChild(divVarLoc);


    setTimeout(() => {

    affichDataEnt(Number(tabEnt[rk].id)); // affichage des variables, dictionnaires et données associées à l'entretien    
    }, 50);
    


};

async function retirerEnt(rk){

    // Vérification de la restriction GitLab
    let CorpusRet = await window.electronAPI.getCorpus();
    if (CorpusRet.type === 'gitlab') {
        const isOwner = await window.electronAPI.getGitlabUserIsOwner();
        const opts = await window.electronAPI.getGitlabOptions();
        if (opts.restrictionAjoutSuppr && !isOwner) {
            await question("Permission refusée", "Le responsable du projet a restreint la suppression d'entretiens aux Maintainer/Owner.", ["OK"]);
            return;
        }
    }

    // demande de confirmation via question 
    let res = await question("Êtes-vous sûr de vouloir supprimer cet entretien du corpus ? \nLe fichier .Sonal correspondant ne sera pas supprimé physiquement, seulement retiré du corpus", ["Ok", "Annuler"]);
    if (res != "ok") return; // si l'utilisateur annule, on sort de la fonction
    
    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    
    let id = tabEnt[rk].id

       // recherche du conteneur de l'entretien
    let conteneurEnt = document.querySelector(`div.ligent[data-id='${id}']`);
    if (conteneurEnt) {
        conteneurEnt.remove(); // suppression du conteneur de l'entretien
    }
   
     // retrait de l'entretien du tabEEnt
    tabEnt.splice(rk,1);
    tabHtml.splice(rk,1); // retrait du HTML en cache
    tabGrph.splice(rk,1); // retrait du graphique en cache

    // mise à jour du tableau des entretiens dans main
    await window.electronAPI.setEnt(tabEnt);
    await window.electronAPI.setHtml(null, tabHtml); // remplacement complet du tableau HTML
    await window.electronAPI.setGrph(null, tabGrph); // remplacement complet du tableau graphique

    // sauvegarde du corpus
    window.sauvegarderCorpus();

    // recharger le corpus
    await afficherEnt(0, tabEnt.length-1); // réaffichage de tous les entretiens restants
    
}


//=============================================================================
// affichage du contenu d'un fichier .Sonal dans la fenêtre issue de WhisPurge
//=============================================================================
async function afficherWhisPurge(){

    let rkEnt = await window.electronAPI.getEntCur();
    //Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main

    //console.log("affichage whispurge du contenu de l'entretien " + rkEnt)

    tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
  
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

    // remise en mots de l'entretien

    wait("Chargement en cours");
    setTimeout(() => {
        cleanHTML();
        endWait();
        initBkUp();
    }, 50);


   // document.getElementById('lblspin').classList.add('dnone'); // fin de l'attente

        // anonymisation

    window.tabAnon = ent.tabAnon; // récupération des anonymisations
    //console.log("anonymisations trouvées :" + JSON.stringify(window.tabAnon) )
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
    tabDat = await window.electronAPI.getDat(); // récupération des données
    
    // alignement des variables, dictionnaires de l'entretien avec le tableau général
    // (en cas de modifications dans la fenêtre de gestion des variables, les variables, dictionnaires et données associés à l'entretien sont mis à jour dans le tableau des entretiens, mais pas dans les variables renderer tabVar, tabDic et tabDat qui sont utilisées pour l'affichage et l'édition de l'entretien — cette étape permet de remettre tout ça en cohérence)
    if (typeof tabVar !== 'undefined') {
        tabEnt[rkEnt].tabVar = tabVar;
    }
    if (typeof tabDic !== 'undefined') {
        tabEnt[rkEnt].tabDic = tabDic;
    }

    // mémorisation des caractéristiques de l'entretien
    await window.electronAPI.setEnt(tabEnt)

   // console.log("variables trouvées :" + JSON.stringify(tabVar) )
   // console.log("dictionnaires trouvés :" + JSON.stringify(tabDic) )
   // console.log("données trouvées :" + JSON.stringify(tabDat) )




    // élaboration du résumé graphique de l'entretien
    let tabGrphEnt = await resumeGraphique(html.replace(/`/g,''));    

    console.log("tableau graphique de l'entretien " + rkEnt + " : ", tabGrphEnt[1])
    
    // chargement de l'image de l'entretien, si elle existe
    if (ent.imgPath) {
        let imgEnt = document.getElementById('imgEnt');
        let cheminImg = "";
        if (Corpus.type == "local") {
            cheminImg = await window.electronAPI.createPath(Corpus.folder, ent.imgPath);
        } else {  
            cheminImg = [Corpus.folder, ent.imgPath].join('/');
        }
        let existImg = await window.electronAPI.doesFileExists(cheminImg);
        if (existImg) imgEnt.src = cheminImg; 
    }


    // dessin du graphe de l'entretien
    dessinResumeGraphique(0, document.getElementById("graphEnt"),tabGrphEnt);

}


//================================================================================
// Sauvegarde modifs entretien
//================================================================================
async function miseàjourEntretien(rkEnt){ // depuis WhisPurge

    if (typeof rkEnt !== 'number' || rkEnt < 0) {
        console.error("rkEnt invalide:", rkEnt);
        notifErreur("Sauvegarde impossible : identifiant d'entretien invalide (" + rkEnt + ").");
        return;
    }

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    
    if (!tabEnt || !tabEnt[rkEnt]) {
        console.error("Entretien non trouvé au rang:", rkEnt);
        notifErreur("Sauvegarde impossible : entretien introuvable (rang " + rkEnt + ").");
        return;
    }

    let ent = tabEnt[rkEnt];

    
    // 1 mise à jour des attributs de l'entretien
    // récupération des locuteurs
    tabLoc = await window.electronAPI.getTabLoc();
    if (typeof tabLoc !== 'undefined') {
        ent.tabLoc = tabLoc;
    }
    
    // mémorisation de la modification
    ent.lastModified = Date.now();

    // récupération des variables
   ent.tabVar = tabVar;
   ent.tabDic = tabDic;
   // ent.tabDat : ne pas écraser avec la variable renderer (peut être []) —
   // le tabEnt frais chargé via getEnt() contient déjà le tabDat correct mis à jour par validMod
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

         await window.sauvegarderCorpus(false);
 
    } catch(err) {
        
        console.error("ERREUR lors de setEnt:", err);
        notifErreur("Erreur lors de la mise à jour de l'entretien en mémoire : " + (err.message || err));
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
           // cleanHTML() // nettoyage du html du conteneur
            
            //let contenuHtml = String(conteneurHtml.innerHTML).replace(/`/g,''); 
            //await window.electronAPI.setHtml(rkEnt, contenuHtml);

            wait("Sauvegarde en cours. Merci de patienter...");

            // Laisser le navigateur repeindre le spinner avant de bloquer le thread
            await new Promise(resolve => setTimeout(resolve, 50));

            // compactage du html du conteneur 
            let contenuHtmlCmpct = await compactHtml();
            contenuHtmlCmpct = String(contenuHtmlCmpct).replace(/`/g,'');

            await window.electronAPI.setHtml(rkEnt, contenuHtmlCmpct);

            // sauvegarde du fichier de l'entretien
            const contenuFichierSonal = sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, ent.tabDat, ent.notes, contenuHtmlCmpct, ent.tabAnon); // conversion du HTML en format Sonal

            let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
            let cheminEnt = ""; 
            let res;
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
                res = await window.electronAPI.sauvegarderFichier(cheminEnt, contenuFichierSonal);
            } else {
                cheminEnt = [Corpus.folder, ent.rtrPath].filter(Boolean).join('/');
                res = await window.electronAPI.sauvegarderSurServeur(cheminEnt, contenuFichierSonal);
            }

            console.log("4b - fichier de l'entretien sauvegardé :", res);
            if (!res?.success) {
                notifErreur("Le fichier de l'entretien n'a pas pu être sauvegardé sur le disque (chemin : " + cheminEnt + ").");
            }
            endWait();



        } else {
            console.error("3 - ERREUR: conteneurHtml not found");
            notifErreur("Sauvegarde impossible : la fenêtre d'édition (\"segments\") est introuvable.");
        }
    } catch(err) {
        console.error("ERREUR lors de setHtml:", err);
        endWait();
        notifErreur("Erreur lors de la sauvegarde du fichier : " + (err.message || err));
    }
     
}

 

async function majFichierSonal(rkD,rkF){ // permet de réécrire un fichier Sonal depuis les données en mémoire

    let tabEnt = await window.electronAPI.getEnt(); // récupération du tableau des entretiens depuis main
    let tabThm = await window.electronAPI.getThm(); // récupération des thématiques depuis main
    let tabVar = await window.electronAPI.getVar(); // récupération des variables depuis main
    let tabDic = await window.electronAPI.getDic(); // récupération des dictionnaires depuis main

     if (!rkD || !rkD){rkD=0; rkF=tabEnt.length} // si les rangs de début et de fin ne sont pas précisés, on traite tous les entretiens

    if (!rkD || rkD<0){rkD=0}
    if (!rkF || rkF>tabEnt.length){rkF=tabEnt.length}

    for (let rkEnt=rkD; rkEnt<rkF; rkEnt++){
    
        console.log("mise à jour du fichier Sonal de l'entretien " + rkEnt)
     


   
    let ent = tabEnt[rkEnt];
    let tabDat = tabEnt[rkEnt].tabDat; // récupération des données de l'entretien

    
    // création d'un fichier Sonal à partir des données mémorisées  
    let contenuFichierSonal = window.sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, tabDat, ent.notes, await window.electronAPI.getHtml(rkEnt), ent.tabAnon);

     try {
 
            let Corpus = await window.electronAPI.getCorpus(); // récupération du corpus depuis main
            let cheminEnt = ""; 
            if (Corpus.type == "local") {
                cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
                const res = await window.electronAPI.sauvegarderFichier(cheminEnt, contenuFichierSonal);
            } else {
                cheminEnt = [Corpus.folder, ent.rtrPath].filter(Boolean).join('/');
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

// onDone(nomFichierImage) est appelé quand le fichier PNG est créé
async function CreerWaveform(audioFile, nomFichierImage, onDone) {

    // Fire-and-forget : on lance le travail en arrière-plan sans bloquer l'appelant
    (async () => {
        try {
            const statusBar = document.getElementById('status-bar');
            if (statusBar) {statusBar.textContent = 'Génération de la forme d\'onde en cours…';statusBar.classList.add('status-bar--blink');}

            const Corpus = await window.electronAPI.getCorpus();

            let cheminFichTxtA = Corpus.type === 'local'
                ? await window.electronAPI.createPath(Corpus.folder, nomFichierImage)
                : [Corpus.folder, nomFichierImage].join('/');

            const existFichA = await window.electronAPI.doesFileExists(cheminFichTxtA);
            if (existFichA) {
                console.log("Forme d'onde déjà existante : " + nomFichierImage);
                if (statusBar) {
                    statusBar.textContent = 'Prêt.';
                    statusBar.classList.remove('status-bar--blink');
                }
                if (onDone) onDone(nomFichierImage);
                return;
            }

            // 1. Chargement IPC — result.data est un Uint8Array (binaire, pas Array.from)
            const result = await window.electronAPI.loadAudioFile(audioFile);
            if (!result.success) { console.error('Erreur loadAudioFile:', result.error); return; }

            if (statusBar) { statusBar.textContent = 'Dessin en cours…'; statusBar.classList.add('status-bar--blink'); }

            // 2. Décodage dans le renderer (AudioContext garanti disponible, async natif)
            const audioContext = new AudioContext();
            const arrayBuffer = result.data.buffer.slice(
                result.data.byteOffset,
                result.data.byteOffset + result.data.byteLength
            );
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioContext.close();
            if (statusBar) statusBar.classList.remove('status-bar--blink');

            // 3. Transfert du canal audio au Worker (sans copie) pour calcul min/max
            const channelData = audioBuffer.getChannelData(0); // Float32Array
            const transferable = channelData.buffer.slice(
                channelData.byteOffset,
                channelData.byteOffset + channelData.byteLength
            );
            const width = 800;

            const { minValues, maxValues } = await new Promise((resolve, reject) => {
                const worker = new Worker('modules/waveform.worker.js');
                worker.postMessage({ channelData: new Float32Array(transferable), width }, [transferable]);
                worker.onmessage = (e) => { worker.terminate(); resolve(e.data); };
                worker.onerror  = (err) => {
                    worker.terminate();
                    console.error('Worker error:', err.message, err.filename, 'line', err.lineno);
                    reject(new Error(err.message || 'Worker error'));
                };
            });

            // 4. Dessin sur canvas (instantané)
            const canva = document.createElement('canvas');
            canva.width = width;
            canva.height = 31;
            document.body.appendChild(canva);
            const ctx = canva.getContext('2d');
            const amp = canva.height / 2;

            ctx.beginPath();
            ctx.moveTo(0, (1 + maxValues[0]) * amp);
            for (let i = 1; i < width; i++) ctx.lineTo(i, (1 + maxValues[i]) * amp);
            for (let i = width - 1; i >= 0; i--) ctx.lineTo(i, (1 + minValues[i]) * amp);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fill();

            ctx.strokeStyle = 'rgb(165,165,165)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, (1 + maxValues[0]) * amp);
            for (let i = 1; i < width; i++) ctx.lineTo(i, (1 + maxValues[i]) * amp);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, (1 + minValues[0]) * amp);
            for (let i = 1; i < width; i++) ctx.lineTo(i, (1 + minValues[i]) * amp);
            ctx.stroke();

            document.body.removeChild(canva);

            // 5. Conversion dataURL → Uint8Array via atob() (pas de fetch, compatible CSP Electron)
            const dataURL = canva.toDataURL('image/png');
            const base64 = dataURL.split(',')[1];
            const binStr = atob(base64);
            const pngBuffer = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) pngBuffer[i] = binStr.charCodeAt(i);

            // 6. Sauvegarde
            if (Corpus.type === 'local') {
                const chemin = await window.electronAPI.createPath(Corpus.folder, nomFichierImage);
                await window.electronAPI.sauvegarderFichier(chemin, pngBuffer);
            } else {
                const chemin = [Corpus.folder, nomFichierImage].join('/');
                await window.electronAPI.sauvegarderSurServeur(chemin, pngBuffer);
            }

            console.log('Forme d\'onde créée :', nomFichierImage);
            if (statusBar) statusBar.textContent = 'Prêt.';
            if (onDone) onDone(nomFichierImage);

        } catch (err) {
            console.error('Erreur CreerWaveform:', err);
            const statusBar = document.getElementById('status-bar');
            if (statusBar) { statusBar.classList.remove('status-bar--blink'); statusBar.textContent = 'Prêt.'; }
        }
    })();

    return nomFichierImage; // retour immédiat
}

function dessinWaveform(audioBuffer, canva ) { // dessin du waveform dans un canvas déjà créé

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
// ---------------------------------------------------------------
// Export d'un entretien avec options (appele depuis dialogExportChoixOptions)
// ---------------------------------------------------------------
async function exportEntretien(format) {

    // Lecture des options AVANT fermeture de la boite de dialogue
    const getChk = id => {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    };
    const opts = {
        anon: getChk('opt-anon'),
        notes: getChk('opt-notes'),
        vars: getChk('opt-vars'),
        loc:  getChk('opt-loc'),
        thm:  getChk('opt-thm'),
        time: getChk('opt-time'),
    };

    hidedlg();

    if (ent_cur === -1) ent_cur = await window.electronAPI.getEntCur();
    const adrFich = tabEnt[ent_cur].rtrPath;
    const detailsf = dossfichext(adrFich);
    const suffixeAnon = opts.anon ? '_anonymise' : '';

    // préparation des données de l'entretien
    const ent = tabEnt[ent_cur];
    let contenuHtmlCmpct = await compactHtml(); // compactage du html
    let tabAnonloc = ent.tabAnon; 
    if (opts.anon) { // anonymisation éventuelle
        contenuHtmlCmpct = AnonymiserHtml(contenuHtmlCmpct); // remplacement des pseudos dans le texte
        tabAnonloc = [] //suppression de la table d'anonymisation de l'export
    } 

    //if (opts.vars) {
        let txtvars = (await varsPubliquesEnt(ent_cur))[1]; // récupération des variables associées à l'entretien
    //}
    switch (format) {

        case 'sonal': { // tout est exporté par défaut, seule l'anonymisation est en option
           
            
            contenuHtmlCmpct = String(contenuHtmlCmpct).replace(/`/g, ''); // mise en string
           
 
            const contenu = sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, ent.tabDat, ent.notes, contenuHtmlCmpct, tabAnonloc); // création du fichier Sonal
            SauvegarderSurDisque(contenu, detailsf[1] +  suffixeAnon + '.Sonal', 'UTF-8'); // enregistrement

            

            break;
        }

        case 'txt': {

            let TxtExport = "Exporté par Sonal π (version " + window.versionSonal + ") le " + new Date().toLocaleString() + "\n\n";
            
            TxtExport += "Entretien : " + ent.nom + "\n\n";


            if (opts.notes) {
                const notes = "Notes de l'entretien :\n" + (ent.notes || "Aucune note") + "\n\n";
                TxtExport += notes;
            }

            if (opts.vars) {
               
               TxtExport += "Variables associées :\n" + txtvars + "\n\n";
            }


            // défilement des mots pour construire le texte exporté
            // les thèmes sont portés par chaque span-mot (pas par le lblseg)
            // ligne d'en-tête [time] locuteur uniquement si le locuteur change
            // [thème] inséré inline quand le thème change d'un mot au suivant
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contenuHtmlCmpct;

            const mots = tempDiv.querySelectorAll('span:not(.lblseg)');
            let seg_cur = null;
            let loc_cur = '';
            let thm_cur = '';

            mots.forEach(mot => {
                const seg = mot.closest('.lblseg');
                if (!seg) return;

                // locuteur du segment parent
                let locNom = '';
                if (opts.loc) {
                    const locIdx = seg.dataset.loc;
                    locNom = locut[locIdx] ? locut[locIdx].replaceAll('?', '').trim() : '';
                }

                // thèmes portés par le mot lui-même (span)
                let thmStr = '';
                if (opts.thm) {
                    const thmClasses = Array.from(mot.classList).filter(c => c.startsWith('cat_'));
                    const thmNoms = thmClasses.map(c => {
                        const thm = tabThm.find(t => t.code === c);
                        return thm ? thm.nom.split('//')[0].trim() : null;
                    }).filter(nom => nom);
                    thmStr = thmNoms.join(', ');
                }

                const isFirst   = seg_cur === null;
                const segChange = seg !== seg_cur;
                const locChange = locNom !== loc_cur;
                const thmChange = thmStr !== thm_cur;

                if (isFirst || (segChange && locChange)) {
                    // premier mot ou changement de locuteur : ligne d'en-tête complète
                    let ligne = isFirst ? '' : '\n\n';
                    if (opts.time) {
                        const deb = seg.dataset.deb;
                        if (deb) ligne +=  SecToTime(deb, true) + " ";
                    }
                    if (opts.loc && locNom) ligne += locNom + ' ';
                    if (opts.thm && thmStr) ligne += '[' + thmStr + '] ';
                    TxtExport += ligne + '\n';
                } else if (segChange) {
                    // nouveau segment, même locuteur : saut de ligne simple
                    TxtExport += '\n';
                    if (opts.thm && thmChange) TxtExport += '[' + (thmStr || '–') + '] ';
                } else if (opts.thm && thmChange) {
                    // même segment, thème différent du mot précédent : marqueur inline
                    TxtExport += ' [' + (thmStr || '–') + '] ';
                }

                TxtExport += mot.textContent;
                seg_cur = seg;
                loc_cur = locNom;
                thm_cur = thmStr;
            });

            TxtExport += '\n';

            SauvegarderSurDisque(TxtExport, detailsf[1] + suffixeAnon + '.txt', 'UTF-8');
            
            break;
        }

        case 'srt': {
            let txtSrt = '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contenuHtmlCmpct;

            const segs = tempDiv.querySelectorAll('.lblseg');

            segs.forEach((seg, idx) => {
                const deb = seg.dataset.deb;
                const fin = seg.dataset.fin;
                if (deb && fin) {
                    const timeDeb = SecToTime(deb, false);
                    const timeFin = SecToTime(fin, false);
                    const text = seg.textContent.trim().replace(/\s+/g, ' ');
                   
                    if (opts.loc) { // ajout du locuteur en préfixe du texte (optionnel)
                        const locIdx = seg.dataset.loc;
                        const locNom = locut[locIdx] ? locut[locIdx].replaceAll('?', '').trim() : '';
                        if (locNom) {
                            text = locNom + ': ' + text;
                        }
                    }

                    txtSrt += (idx + 1) + '\n' + timeDeb + ' --> ' + timeFin + '\n' + text + '\n\n';
                }            
                });    


            SauvegarderSurDisque(txtSrt, detailsf[1] + suffixeAnon + '.srt', 'UTF-8');
            break;
        }

        case 'vtt': {
            let txtVtt = 'WEBVTT\n\n';

            if (opts.notes && ent.notes) {
                // NOTE block: no blank lines allowed inside, compress them
                const noteContent = ent.notes.replace(/\n{2,}/g, '\n').trim();
                txtVtt += 'NOTE\n' + noteContent + '\n\n';
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contenuHtmlCmpct;
            const segs = tempDiv.querySelectorAll('.lblseg');

            segs.forEach((seg, idx) => {
                const deb = seg.dataset.deb;
                const fin = seg.dataset.fin;
                if (!deb || !fin) return;

                const timeDeb = SecToTime(deb, false);
                const timeFin = SecToTime(fin, false);

                // build cue payload word by word (preserves theme tags)
                let payload = '';
                if (opts.thm) {
                    seg.querySelectorAll('span').forEach(mot => {
                        const thmClasses = Array.from(mot.classList).filter(c => c.startsWith('cat_'));
                        const word = mot.textContent;
                        if (thmClasses.length > 0) {
                            payload += '<c.' + thmClasses[0] + '>' + word + '</c>';
                        } else {
                            payload += word;
                        }
                    });
                    payload = payload.trim().replace(/\s+/g, ' ');
                } else {
                    payload = seg.textContent.trim().replace(/\s+/g, ' ');
                }

                // wrap with speaker voice tag if needed
                if (opts.loc) {
                    const locIdx = seg.dataset.loc;
                    const locNom = locut[locIdx] ? locut[locIdx].replaceAll('?', '').trim() : '';
                    if (locNom) payload = '<v ' + locNom + '>' + payload + '</v>';
                }

                txtVtt += (idx + 1) + '\n' + timeDeb + ' --> ' + timeFin + '\n' + payload + '\n\n';
            });

            SauvegarderSurDisque(txtVtt, detailsf[1] + suffixeAnon + '.vtt', 'UTF-8');
            break;
        }

        case 'html':
            alert('Export HTML non encore implemente.');
            break;

        case 'docx':
            alert('Export .docx non encore implemente.');
            break;
    }
}


function AnonymiserHtml (contenuHtml) {

    // affecter le contenu html à un conteneur temporaire pour manipulation
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contenuHtml;
    
    //sélectionner tous les mots qui contiennent la classe anon mais pas finsel et anon (dernier span qui contient le pseudo)
    const motsASuppr = tempDiv.querySelectorAll('span.anon:not(.finsel)');

    motsASuppr.forEach(mot => {
        mot.remove(); // Supprimer les spans intermédiaires de l'anonymisation
    });


    const motsAAnonymiser = tempDiv.querySelectorAll('span.anon.finsel');

    motsAAnonymiser.forEach(mot => {
        const pseudo = mot.dataset.pseudo ; // Récupérer le pseudo 
        if (pseudo) {
            mot.textContent = "[" + pseudo + "]"; // Remplacer le texte du span par le pseudo
            mot.classList.remove('anon', 'finsel'); // Retirer les classes d'anonymisation
            delete mot.dataset.pseudo; // Supprimer l'attribut de pseudo
        }
    });
        
    htmlAnonymise = tempDiv.innerHTML;
    tempDiv.remove(); // Nettoyer le conteneur temporaire
    
    return htmlAnonymise;
}