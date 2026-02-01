////////////////////////////////////////////////////////////////
// variables de gestion du projet 
////////////////////////////////////////////////////////////////

 

// Les fonctions de thematisation.js seront disponibles globalement
// car le script est chargé dans index.html avant gestion_corpus.js

let Corpus = {}; // objet global pour stocker les infos du corpus
let tabThm = []; // tableau des thématiques
let tabVar = []; // tableau des variables
let tabDic = []; // tableau des dictionnaires
let tabDat = []; // tableau des données
let tabEnt = []; // tableau des entretiens
let ent_cur = -1; // entretien courant

async function initFromMain() {
  Corpus = await window.electronAPI.getCorpus();
  Corpus.folder = await window.electronAPI.getDossProjet();
}

 



////////////////////////////////////////////////////////////////
// Corpus
////////////////////////////////////////////////////////////////

 


//===============================================================================================
// lecture de ficher corpus (l'accès au fichier se fait dans le renderer)
//===============================================================================================

async function lireCorpus(fileContent){

     
 
  // 1 détermination du type de corpus (Sonal 2 ou 3)
 if (fileContent.indexOf("<|THEM|") > -1){
    console.log("corpus Sonal 2 détecté")
    lireCrpSonal2(fileContent)
    return ;
 } else {
    console.log("corpus Sonal 3 détecté")
    
    // chargement des tableaux de données
    if (!fileContent) throw new Error('Impossible de lire le fichier');


        console.log("les tableaux de données ont été remis à zéro");

        const crp = JSON.parse(fileContent);
        tabThm = crp.tabThm || [];
        tabVar = crp.tabVar || [];
        tabDic = crp.tabDic || [];
        tabDat = crp.tabDat || [];
        tabEnt = crp.tabEnt || [];
        tabHtml = [];
        tabGrph = [];
        ent_cur = crp.ent_cur || -1;

        
        // toutes les thématiques sont actives par défaut
        for (let i=0; i<tabThm.length; i++){
            tabThm[i].act = true;
            tabThm[i].cmpct = false; 
        }
        



        //mise à jour dans main
        await window.electronAPI.setThm(tabThm);
        await window.electronAPI.setEnt(tabEnt);
        await window.electronAPI.setVar(tabVar); 
        await window.electronAPI.setDic(tabDic);
        await window.electronAPI.setDat(tabDat);
        await window.electronAPI.setGrph(-1, tabGrph);
        window.electronAPI.setEntCur(ent_cur);

        console.log("les tableaux de données ont été chargés depuis le corpus");
        console.log("tabThm :", tabThm);
        console.log("tabVar :", tabVar);
        console.log("tabDic :", tabDic);
        console.log("tabDat :", tabDat);
        console.log("tabEnt :", tabEnt);
 

}

 
// chargement des thématiques    
 
loadThm(tabThm); // création des classes css
affichListThmCrp(tabThm, 'conteneur_cat') // affichage de la liste des thématiques;

 

// chargement des entretiens 
await window.electronAPI.setHtml(-1, []);


loadHtml(0,Number(tabEnt.length-1)).then( () => { 

         afficherEnt(0,Number(tabEnt.length-1));
         inventaireVariables(); // inventaire des variables utilisées dans les entretiens
});  


document.getElementById('fenetreAccueil').classList.add('dnone'); // masquage de la fenêtre d'accueil
 


}

//-------------------------------------------------------------------------------
// lecture d'un corpus Sonal 2
//-------------------------------------------------------------------------------
async function lireCrpSonal2(contenu){

    console.log ("lecture du corpus Sonal 2");  
    
        // récupération du corpus 
        Corpus= await window.electronAPI.getCorpus();
 
        console.log("corpus en cours : " + Corpus.url);
        console.log("Dossier source : " + Corpus.folder);
 

        // split par lignes du contenu du fichier 
        contenu = contenu.replace(/\r?\n|\r/,'\n') // uniformisation des sauts de ligne
        // split du texte par lignes \n
        lignesFich = contenu.split("\n");

         
        //========================
        //  Extraction des thèmes
        //========================

        let debThm=-1;
        let nbl = lignesFich.length;
         
        let rgThm=0;

        for (l=0;l<nbl;l++){ // défilement les lignes
            
            if (lignesFich[l].substring(0,7) == "<|THEM|"){debThm=l; continue} // repérage de la balise d'ouverture
            if (lignesFich[l].substring(0,7) == ">|THEM|"){debThm=-1;break}  // fin

            if (debThm>0){ // ajout des thèmes à la liste
                
                if (lignesFich[l].substring(0,1) == ">"){continue}  // évitement des intercalaires
                
                rgThm++;
                let parts = lignesFich[l].split(",")
                 
                tabThm.push({ // ajout au tableau des thématiques
                    code: "cat_"+ parts[0], 
                    couleur: convertColor(parts[1]),
                    nom: parts[2].replace(/\r/g, ''),
                    taille : "16px",
                    cmpct: false,
                    rang: "0",
                    act: true
                })

                /*
                tabThm[rgThm] = {} // 1 =code 2= couleur 3=libellé 4= niveau ???
                
                
                
                tabThm[rgThm].code = parts[0]
                tabThm[rgThm].couleur = convertColor(parts[1])
                tabThm[rgThm].nom =parts[2]
 */

            }

        }

        window.electronAPI.setThm(tabThm);

        //===========================
        //  Extraction des variables
        //===========================

        let debVar=-1;
        
        let rgVar=0;

        for (l=0;l<nbl;l++){ // défilement les lignes
            
            if (lignesFich[l].substring(0,6) == "<|POS|"){debVar=l; continue} // repérage de la balise d'ouverture
            if (lignesFich[l].substring(0,6) == ">|POS|"){debVar=-1;break}  // fin

            if (debVar>0){ // ajout des variables à la liste
                //rgVar++;
                let parts = lignesFich[l].split(",")
                let publicVar = true;
                
                if (parts[2]) {
                    if (parts[2].replace(/\r/g, '') == "1") {publicVar = true;} 
                }

                tabVar.push({v:Number(parts[0]),
                lib:parts[1].replace(/\r/g, ''),
                public:publicVar,
                champ:'gen'
                })
                
                /*tabVar[rgVar] = new Array (3) // 1 = code, 2 = libellé,3= publique/privé

                
                                
                for (p=1;p<4;p++) {
                tabVar[rgVar][p] = parts[p-1] 
                }
                */

 
            }

        }

        //console.log(tabVar);

        window.electronAPI.setVar(tabVar); 

        //============================
        //  Extraction du dictionnaire
        //============================

        let debDic=-1;

        
        tabDic =[]; // réinitialisation du tableau des dictionnaires

 

        for (l=0;l<nbl;l++){ // défilement les lignes
            
            if (lignesFich[l].substring(0,6) == "<|DIC|"){debDic=l; continue} // repérage de la balise d'ouverture
            if (lignesFich[l].substring(0,6) == ">|DIC|"){debDic=-1; break}  // fin

            if (debDic>0){ // ajout des modalités au dictionnaire
                
                let parts = lignesFich[l].split(",")
                
                let varcur= Number(parts[0]);
                let modcur= Number(parts[1]);

                tabDic.push({v: varcur, m: modcur, lib: parts[2].replace(/\r/g, '')}) // ajout de la modalité
                 

            }

        }
 
        window.electronAPI.setDic(tabDic);


        //========================
        //  Extraction des entretiens
        //========================

        let debEnt=-1;
        let rgEnt=0;

        for (l=0;l<nbl;l++){ // défilement les lignes
            
            if (lignesFich[l].substring(0,7) == "<|ENTR|"){debEnt=l; continue} // repérage de la balise d'ouverture
            if (lignesFich[l].substring(0,7) == ">|ENTR|"){debEnt=-1;break}  // fin

            if (debEnt>0){ // ajout des entretiens à la liste
                
                if (lignesFich[l].substring(0,1) == ">"){continue}  // évitement des intercalaires
                
                rgEnt++;

                console.log("lecture de l'entretien " + rgEnt);
                let parts = lignesFich[l].split(",")
                parts[0] = parts[0].replace(/\r/g, '') // retrait des sauts de ligne dans le nom de fichier
                let nomEnt = parts[0].substring(0,parts[0].lastIndexOf("."))   
 



                tabEnt.push({ // ajout au tableau des entretiens
                id: rgEnt, 
                nom:nomEnt,
                rtrPath:nomEnt+".Sonal", 
                audioPath: [Corpus.folder.replace(/\\/g, '/'), parts[0]].join('/'),
                imgPath:nomEnt+".BMP",
                couleur:convertColor(parts[1]),
                act:Number(parts[2]),
                notes:'', 
                hms: '00:00:00',
                tabThm: tabThm.slice(), // ajout au tableau des thématiques
                tabVar: tabVar.slice(), // ajout au tableau des données
                tabDic: tabDic.slice()  // ajout du dictionnaire

                }) 

                
                // conversion du fichier .rtr en .sonal

                // définition de l'adresse corpus.folder + nomEnt+".rtr"
                let rtrPath = [Corpus.folder.replace(/\\/g, '/'),nomEnt].join('/') + ".rtr";
                
                let extractRtr = await convertRtrToSonal(rgEnt, rtrPath) 
                
                // mise à jour des notes et du tabdat dans l'entretien
                tabEnt[rgEnt-1].notes = extractRtr.notes;
                tabEnt[rgEnt-1].tabDat = extractRtr.tabDat;
                tabEnt[rgEnt-1].tabLoc = extractRtr.tabLoc;

                await window.electronAPI.setEnt(tabEnt);
 

                let fichierSonal = sauvHtml(extractRtr.tabLoc, tabThm, tabVar,  tabDic, extractRtr.tabDat, extractRtr.notes, extractRtr.html);
                
                console.log("le fichier Sonal a été converti pour l'entretien " + nomEnt);
                // écriture du fichier Sonal
                let sonalPath = [Corpus.folder.replace(/\\/g, '/'),nomEnt].join('/') + ".Sonal";
                await window.electronAPI.sauvegarderFichier(sonalPath, fichierSonal);

            }

        }
 
          //mise à jour dans main
       
        window.electronAPI.setEnt(tabEnt);
        
       

        console.log("les tableaux de données ont été chargés depuis le corpus Sonal 2");

        console.log("tabent" + JSON.stringify(tabEnt))
  
         // définition du nom du nouveau corpus (ajout .Pi avant crp)
         let nouveauNomCrp = Corpus.url.substring(0, Corpus.url.lastIndexOf(".")) + ".Sonal_Pi.crp";   

          const contenuCrp = JSON.stringify({ tabThm, tabEnt, tabVar, tabDic /*, tabDat */ });
  
          
 
                result = await window.electronAPI.sauvegarderFichier(
                nouveauNomCrp,
                contenuCrp
                );

                if (result.success) {
                    
                     await window.electronAPI.ouvrirCorpusLocal(nouveauNomCrp);

                } 
            


 
}

 async function convertRtrToSonal(rgEnt, fichRtr){ // fonction de conversion des fichiers RTR
    // vers Sonal. Ouvre le fichier, récupère les balises pour remplir les notes et le tabdat puis 
    // lit le texte et le convertir en spans 

    let tabXtrLocal=[]; // tableau des extraits locaux

    async function getXtrRtr(ligne){
    
        // split par :: 

        let parts = ligne.split("::");
        let position = Number(parts[1].replace(/\,/g, '.')) // conversion de la position en nombre;
        let thms = parts[2];

        return {position: position, thms: thms}
        
    
    }

    async function nouvelExtraitRtr(deb, fin, thms){
        tabXtrLocal.push( {debut: deb, fin: fin, thms: thms, texte: '' } )
    }


    function subdiviserExtraits(texte) {

        const regex =  /(\[>[^\]]+\]:?|\[\d+(?:,\d+)?\])/g;
        const matches = [...texte.matchAll(regex)];
        const segments = [];
        
        let locuteurActuel = null; // Garder trace du locuteur courant
        
        // Premier segment (peut être sans balise)
        if (matches.length === 0) {
            // Pas de balise du tout dans le texte
            segments.push({
            balise: null,
            type: null,
            locuteur: null,
            texte: texte.trim()
            });
            return segments;
        }
        
        // Texte avant la première balise (s'il existe)
        const premiereBalisePosistion = matches[0].index;
        if (premiereBalisePosistion > 0) {
            const texteAvant = texte.slice(0, premiereBalisePosistion).trim();
            if (texteAvant) {
            segments.push({
                balise: null,
                type: null,
                locuteur: null,
                texte: texteAvant
            });
            }
        }
        
        // Traiter chaque balise et son texte associé
        matches.forEach((match, i) => {
            const balise = match[0];
            const positionBalise = match.index;
            const positionFinBalise = positionBalise + balise.length;
            
            // Déterminer où s'arrête le texte de ce segment
            const prochaineBalise = matches[i + 1];
            const finTexte = prochaineBalise ? prochaineBalise.index : texte.length;
            
            // Extraire le texte entre cette balise et la suivante
            const texteSegment = texte.slice(positionFinBalise, finTexte).trim();
            
            // Créer le segment
            if (balise.startsWith('[>')) {
            // Nouvelle balise de locuteur : mettre à jour le locuteur actuel
            locuteurActuel = balise.match(/\[>([^\]]+)\]/)[1];
            
            segments.push({
                balise: balise,
                type: 'locuteur',
                locuteur: locuteurActuel,
                texte: texteSegment
            });
            } else {
            // Balise de synchro : garder le locuteur précédent
            segments.push({
                balise: balise,
                type: 'synchro',
                locuteur: locuteurActuel, // Réutilise le dernier locuteur connu
                valeur: balise.match(/\[(\d+(?:,\d+)?)\]/)[1],
                texte: texteSegment
            });
            }
        });
        
            return segments;
        } 

    function extraireLocuteurs(texte) {
            const regex = /\[>([^\]]+)\]/g;
            const matches = [...texte.matchAll(regex)];
            const locuteurs = ['', ...new Set(matches.map(match => match[1]))];
            
            return locuteurs;
        }

 

    // récupérer le contenu du fichier .rtr
    const contentRtr = await window.electronAPI.readFileContent(fichRtr);

    tabLocLocal = extraireLocuteurs(contentRtr);
    console.log("locuteurs trouvés dans l'entretien converti" + JSON.stringify(tabLocLocal)) ;

    // mise en lignes du contenu
    const lignesFich = contentRtr.replace(/\r?\n|\r/g,'\n').split("\n");

    // console.log("contenu du fichier" + contentRtr.substring(1,100)+"...");
    // conversion en .sonal (simple remplacement des balises)

    // récupération des notes 

    let notes = ""
    let debObs=-1;

     for (lg=0;lg<lignesFich.length;lg++){ // défilement les lignes
            
            if (lignesFich[lg].substring(0,6) == "<|OBS|"){debObs=lg; continue} // repérage de la balise d'ouverture
            if (lignesFich[lg].substring(0,6) == ">|OBS|"){debObs=-1;break}  // fin

            if (debObs>0){ // ajout des modalités au dictionnaire
                
                notes += lignesFich[lg] + "\n"                

            }

     }      
 
    // récupération des data
    
    let debDat=-1;
    let tabDatLocal = [];

     for (lg=0;lg<lignesFich.length;lg++){ // défilement les lignes
            
            if (lignesFich[lg].substring(0,7) == "<|ATTR|"){debDat=lg; continue} // repérage de la balise d'ouverture
            if (lignesFich[lg].substring(0,7) == ">|ATTR|"){debDat=-1;break}  // fin

            if (debDat>0){ // récupérartion du tabdat local
                
                lignedat = lignesFich[lg].split(",");                 
                tabDatLocal.push( {e:rgEnt, v:Number(lignedat[0]), l: 'all', m: Number(lignedat[1]) } )

            }

     }      

  
     // reconstitution des extraits 
     let debXtr = -1; 
    for (lg=0;lg<lignesFich.length;lg++){ // défilement des lignes
            
            if (lignesFich[lg].substring(0,2) == "::") {
                
                if (debXtr==-1){// nouvel extrait, récupération des infos d'ouverture
                
                    {debXtr=lg; 
                    
                    // nouvel extrait, récupération des infos d'ouverture
                    let xtr = await getXtrRtr(lignesFich[lg]);
                     nouvelExtraitRtr(xtr.position, -1, xtr.thms, '' );   
                 
                    continue} // repérage de la balise d'ouverture

                } else { // fin d'extrait, récupération de la position de fin

                // nouvel extrait, récupération des infos d'ouverture
                let xtr = await getXtrRtr(lignesFich[lg]);

                //console.log("position de fin de l'extrait :" + xtr.position)
                 tabXtrLocal[tabXtrLocal.length -1].fin = xtr.position;

                debXtr=-1;

                 

                }
            }

            

            if (debXtr>0){ // ajout des modalités au dictionnaire
                
               // ajout de la ligne à l'extrait le plus avancé                
                tabXtrLocal[tabXtrLocal.length -1].texte += lignesFich[lg] + "\n";

            }

     }      

     console.log("le tableau des extraits est finalisé" + JSON.stringify(tabXtrLocal).substring(1,100)+"...");  

     // création d'un tableau de segments (subdivisions des extraits, ils en récupèrent les thm mais 
     // la position et le contenu sont subdivisés à chaque changement de locuteur ou répérage de point de synchro)

     let tabSegLocal= []; 

     console.log("nombre d'extraits dans l'entretien " + rgEnt + " : " + tabXtrLocal.length);

     let contenuHtml = ``;  
     let segCourant= 1; 
     let spnCourant= 1;

     // défilement des extraits 
     for (let ext=0; ext<tabXtrLocal.length; ext++){
        
        console.log("analyse de l'extrait " + ext)
         
        let posDeb = tabXtrLocal[ext].debut;
        let posFin = tabXtrLocal[ext].fin;
        let thmsXtr = tabXtrLocal[ext].thms;
        
        // mise en tableau éventuelle des thématiques
        let chaineCat=""; 
        let tabThmsXtr = thmsXtr.split(",");
        tabThmsXtr.forEach((thm) => {
        thm = "cat_" + thm;

        if (chaineCat ==""){    
            chaineCat = thm;
        } else {
            chaineCat += "," + thm;
        }
        });



        // découpage des extraits en segments 
        let segments = await subdiviserExtraits(tabXtrLocal[ext].texte);

        console.log("segments trouvés :" + segments.length)

        // 1 repérage des changements de locuteurs "balise d'ouverture"
        let posCourante = posDeb;
        let texteCourant = "";
        let locuteurCourant = null;
        

        let rkLoc = 0;
        let nomLoc = "???";

        segments.forEach( (seg) => {
            
                if (seg.type === null) { // simple portion de texte
                        
                } 
                
                else if (seg.type === 'locuteur') { // changement de locuteur

                    rkLoc= tabLocLocal.indexOf(seg.locuteur);
                    nomLoc = seg.locuteur;

                } 
                
                else if (seg.type === 'synchro') { // changement de position
                    posCourante = seg.valeur;
                }    
 


                // création du span pour le segment
                        contenuHtml += `<span class="lblseg sautlig" 
                        data-deb="${posCourante}" 
                        data-fin="${posFin}" 
                        data-loc="${rkLoc}"
                        data-nomloc="${nomLoc}"
                        tabindex="${spnCourant}" 
                        data-rksg="${segCourant}"
                        >`
                        
 

                        // Regex qui capture chaque mot, ponctuation et espace séparément
                        var texte = seg.texte;
                        
                        const elements = texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g);

                        let chaine = "";

                        if (elements) {
                            for (const elem of elements) {
                                chaine += `<span data-rk="${spnCourant}" data-sg="${segCourant}" class="${chaineCat}">${elem}</span>`;
                                spnCourant++;
                            }
                        }
                        
                        contenuHtml += chaine + `</span>`

                        segCourant++;



            


        });
        
        
        
      
    
    
    }

    // finalisation
    //contenuHtml += `</div>`;
    console.log("conversion en Sonal terminée pour l'entretien " + rgEnt + "tabdat "+JSON.stringify(tabDatLocal) + "tabloc " + JSON.stringify(tabLocLocal) );
    
    return {notes: notes, tabDat: tabDatLocal, tabLoc: tabLocLocal, html: contenuHtml}
 }
 

/**
 * Fonction de sauvegarde 
 */
async function sauvegarderCorpus(avecBackup = false) {

// récupération du chemin d'accès au corpus
const Corpus = await window.electronAPI.getCorpus();
let corpusActuel = Corpus.url;  

 // console.log('Corpus actuel:', corpusActuel);

  if (!corpusActuel) {
    alert('Aucun corpus ouvert');
    return { success: false, error: 'Aucun corpus ouvert' };
  }
  
  // récupération du contenu actuel
  const tabThm = await window.electronAPI.getThm();
  const tabEnt = await window.electronAPI.getEnt();
  const tabVar = await window.electronAPI.getVar();
  const tabDic = await window.electronAPI.getDic();
 // const tabDat = await window.electronAPI.getDat();

  const contenu = JSON.stringify({ tabThm, tabEnt, tabVar, tabDic /*, tabDat */ });
  
 // console.log('💾 Sauvegarde en cours... de ' , contenu);
  
  let result;

  if (Corpus.type ==="distant"){
    if (avecBackup) {
      result = await window.electronAPI.sauvegarderAvecBackup(
        corpusActuel,
        contenu
      );
    } else {
      result = await window.electronAPI.sauvegarderSurServeur(
        corpusActuel,
        contenu
      );
    }
  } else  if (Corpus.type ==="local") {
    result = await window.electronAPI.sauvegarderFichier(
      corpusActuel,
      contenu
    );
  }

  if (result.success) {
    contenuModifie = false;
    document.title = '📝 Corpus';
    console.log('✅ Fichier sauvegardé');
    
    // Notification visuelle
    afficherNotification('Corpus mis à jour', 'success');
    
    return result;
  } else {
    console.error('❌ Erreur:', result.error);
    afficherNotification('Erreur: ' + result.error, 'error');
    
    return result;
  }
}


/*
async function lireacoté(dossier, fichier) {

    console.log("lecture du fichier " + fichier + " dans le dossier " + dossier)

    // reconstitution de l'adresse
const fileContent = await window.electronAPI.readFileContent(fichier);

console.log("contenu du fichier " + fileContent)
return fileContent;

}
*/
 

function ajoutMulti(files){

   

    for (var i = 0; i < files.length; i++) {

        nomFichText =  files[i].name;
        console.log ("chargement du fichier " + nomFichText)
    
        let detailsf = dossfichext(nomFichText)
    
        let extens = String(detailsf[2]) // récupération de l'extension
        const ext = extens.toUpperCase();
         
       
        switch(ext) {
                       
                      
    
                        case ".SONAL":
                        ajoutEnt(files[i])
                        
                        
      
                        
                        break;
                   
                        
    
                       };
        
        
    
    
    }

    setTimeout(() => {
        console.log("fin normale du processus, il y a " + tabEnt.length + " entretiens")
        triEntretiens(); // tri des entretiens par ordre alphabétique
        fusionThm(); 
        loadThm();
        afflistThm()
        affEntretiens() 
      }, "1000");

   

   


}

 
var ajoutEnt= function(fich){

    lignesFich=[];  // vidage du tableau
    
    
    var reader = new FileReader();
        
        reader.onload = function(){
        var text = reader.result;

        text = text.replace(/\r?\n|\r/,'\n') // uniformisation des sauts de ligne
        // split du texte par lignes \n
        lignesFich = text.split("\n");

        };

    reader.readAsText(fich);

    reader.onloadend = function() {

    let donnéesEnt = chargerHTML(fich);
    
    // retrait de l'extension dans le nom du fichier
    let nomFich = fich.name.replace(/\.[^/.]+$/, "");
     
    tabEnt.push({nom: nomFich, loc: donnéesEnt[1],  thm: donnéesEnt[2] , notes: "`" + donnéesEnt[3] + "`", html:"`"+ donnéesEnt[4] + "`", tabVar: donnéesEnt[5], tabDic: donnéesEnt[6], tabDat: donnéesEnt[7]  }) ;
     
    } 

    

}
 
function triEntretiens() { // fonction permettant de trier les entretiens par ordre alphabétique
    tabEnt.sort((a, b) => {
        if (a.nom < b.nom) {
            return -1;
        }
        if (a.nom > b.nom) {
            return 1;
        }       
        return 0;
    });      
    console.log("tri des entretiens effectué")
    return tabEnt;  

}

function affEntretiens(){

    const conteneur=document.getElementById('entretiens');

    conteneur.innerHTML="";


    // création des canvas
    for (ent=0;ent<tabEnt.length;ent++){

        const div = document.createElement('div');
        div.dataset.nom = tabEnt[ent].nom;
        div.classList.add("fondcnv");
        conteneur.appendChild(div);

        const cnv = document.createElement('canvas');
        cnv.dataset.nom = tabEnt[ent].nom;
        cnv.dataset.rk = ent;
        cnv.classList.add('cnv');
        cnv.title=tabEnt[ent].nom;


        div.appendChild(cnv);


        // ajout d'un listener pour le clic
        cnv.addEventListener('mouseup', function() {
             
            let rgEnt = Number(this.dataset.rk)

            // récupération de la position du canvas
            const  rect= this.getBoundingClientRect();
            // récupération de la position du clic
            const event = window.event; 
            const x = event.clientX - rect.left;
            const width = rect.width;      

            let ratio = x/width; // ratio de la position du clic par rapport à la largeur du canvas
       


            voirEntretien(rgEnt)

                        
            let nbmots= getNbSpans(); // nombre de mots           
            let pos = Math.round(nbmots * ratio); // position du mot dans le texte

            let mot = getSpan(pos); // récupération du mot à la position
            if (!mot) {return} // si le mot n'existe pas, on sort de la fonction
        
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
            
 
        })




    }    


    dessinTousEntretiens()
 

}

// affichage d'un entretien
async function voirEntretien(rangEnt){

    ent_cur = rangEnt; // mise à jour de l'entretien courant
    // récupération du tabent 
    if (!tabEnt){await window.electronAPI.getEnt();}
    // récupération du html
    if (!tabHtml){ await window.electronAPI.getHtml(rangEnt);} 

    const fen = document.getElementById('segments-contenu')
    const text  = tabHtml[rangEnt].replace(/`/g,'') // suppression des backticks; 
    //effaceSel() // effacement des sélections
    //effaceSurv() // effacement des surlignages

    
    const tabLoc =  tabEnt[rangEnt].tabLoc; // récupération des locuteurs

    fen.innerHTML =text; 
    checkloc(tabLoc);//affichage des locuteurs 
    multiThm(); // définition des couches thématiques multiples
    document.getElementById("titreEnt").innerHTML = tabEnt[rangEnt].nom; // affichage du nom de l'entretien
    document.getElementById('fenEnt').classList.remove("dnone"); 



}


// fonction de dessin des entretiens
async function dessinTousEntretiens(){

    
   // wait("dessin en cours") // affichage du message de chargement

    // dessine les entretiens dans les canvas   
    console.log("dessin des entretiens")



    // dessin de la forme graphique
    for (let e=0;e<tabEnt.length;e++){
    
        
        const canva = document.querySelector(`canvas[data-id="${tabEnt[e].id}"]`);
        
       
         
        // récupération du tabGrph 
        let tabGrphEnt = await window.electronAPI.getGrph (e);   

         
        // s'il est vide appeler résumé graphique 
        if (!tabGrphEnt || tabGrphEnt.length ==0 ) 
            {
                console.log("tabGrph vide pour l'entretien " + e);
                console.log("appel de resumeGraphique pour l'entretien " + e);
                const html = await window.electronAPI.getHtml(e); // suppression des backticks;        
                tabGrphEnt = await resumeGraphique(html);

             // sauvegarde du tabGrph dans le corpus
                await window.electronAPI.setGrph(e, tabGrphEnt);
                dessinResumeGraphique(canva, tabGrphEnt);
                }
            else { // dessiner à partir du tabGrph existant
                dessinResumeGraphique(canva, tabGrphEnt);
            };   


       
    }

    console.log("fin du dessin des entretiens")
   // endWait()

}


// fonction de création du résumé graphique d'un entretien    
async function resumeGraphique(html) {

    
 
     
    // récupération des catégories thématiques du corpus
    tabThm = await window.electronAPI.getThm(); // récupération des thématiques dans main.js 
    if (tabThm.length == 0) {return} // s'il n'y a pas de thématiques, on sort de la fonction

    let tabGrphEnt = [{"pos":0, "width":0, "catsThm":0} ]; // tableau des graphismes à dessiner // première ligne non nulle pour distinguer mes tabgrph déjà calculés (mais vides) de ceux qui doivent être calculés

     
    // Créer un conteneur temporaire pour analyser le HTML
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = html;
    
     
    // nombre de mots
    const nbmots = compterElements(tempContainer, "span","lblseg")

    var derPosMot = -99; // position du dernier mot affiché

    const mots = tempContainer.querySelectorAll('span');
    
    for (let mot of mots) {
         
            if (!mot.classList || mot.classList.length === 0) { continue; }

            // c'est un mot
            if (!mot.classList.contains('lblseg') ){ 
                
               // console.log("mot " + mot.innerText + " avec la classe " + mot.classList.value)

                

                 // mise en tableau des classes
                let cats = mot.classList.value.split(" ")
                      
       
     
                let catsThm=[];
                let thmtrouvé = false;
                
                // reconstitution de la chaine
                for (c=0;c<cats.length;c++){

                    if (cats[c].lastIndexOf("cat_") >-1){

                        // récupération du rang
                        let rkc = getRkThm(cats[c]);

                        if (rkc != -1){

                                catsThm.push(rkc) ;
                                thmtrouvé = true;   
                        }
                    }  

                }

                if (!thmtrouvé){continue;} // on ne garde que les mots qui ont un thème
                    
                        
                    // affichage de la "colonne" du mot dans le canvas

                    //const ctx = canva.getContext('2d');


                    let ratioMot= mot.dataset.rk/ nbmots
 
                    
                    // calcul de la position du mot dans l'ensemble
 
                    let posMot = Math.round(1000 * ratioMot)                      
                    
                    if ( posMot == derPosMot){continue} // n'affiche que tous les  pixels

                  
                    // mise à jour du dernier mot affiché
                    derPosMot = posMot; 
                    
                   
                    tabGrphEnt.push({"pos":posMot, "width":1, "catsThm":catsThm});

                    /*
                    for (thm=0;thm<catsThm.length;thm++){
                                                 
                        // récupération du rang thm
                        let rkc = Number(catsThm[thm]);

                        if (tabThm[rkc]){
                            

                            ctx.fillStyle ="rgba(200,200,200,0.5)"; // couleur par défaut

                             
                                let estAct=tabThm[rkc]?.act

                                if (estAct==undefined) {estAct=true} // si pas de valeur, on considère que le thème est actif

                               // console.log("thème " + tabThm[rkc].nom + " avec la couleur " + tabThm[rkc].couleur + " et l'activité " + tabThm[rkc].act + "estact" + estAct)

                            if (estAct  == true && tabThm[rkc].couleur) { 
                            ctx.fillStyle = tabThm[rkc].couleur; 
                            };

                            tabGrphEnt.push({"pos":posMot, "width":1, "catsThm":catsThm});

                            ctx.fillRect(posMot, hauteur/(catsThm.length) *thm, 1, hauteur/(catsThm.length));


                        }   


 
                         

                    }
*/
                    
 


                        
            } 

            
    }
 
    tempContainer.remove();
    
    
    // contraction du tableau des graphismes pour factoriser les catsthm successifs identiques
    let tabGrphEntComp = [];

    for (let i=0; i<tabGrphEnt.length; i++){
        if (i==0){
            tabGrphEntComp.push(tabGrphEnt[i]);
        } else {
            let dernier = tabGrphEntComp[tabGrphEntComp.length -1]; 
            if (JSON.stringify(dernier.catsThm) === JSON.stringify(tabGrphEnt[i].catsThm)){
                // même catégorie, on étend la largeur
                dernier.width += tabGrphEnt[i].width;
            } else {
                tabGrphEntComp.push(tabGrphEnt[i]);
            }
        }
    }

//console.log("fin de la création du tableau des graphismes compacté pour l'entretien", tabGrphEntComp)
    
return tabGrphEntComp;
 
}


async function dessinResumeGraphique(canva, tabGrphEnt){

    //console.log("dessin du résumé graphique dans le canvas", canva, tabGrphEnt)
    
    // récupération des catégories thématiques du corpus
    tabThm = await window.electronAPI.getThm(); // récupération des thématiques dans main.js 
    if (tabThm.length == 0) {return} // s'il n'y a pas de thématiques, on sort de la fonction

    const ctx = canva.getContext('2d');
    ctx.clearRect(2, 0, canva.width, canva.height-4); // effacement du canvas


            const rect = canva.getBoundingClientRect();          
            // Taille d'affichage souhaitée
            const displayWidth = rect.width; //1000;
            const displayHeight = rect.height; //31;
            
            // ✅ Obtenir le ratio de pixels de l'appareil
            const dpr = window.devicePixelRatio || 1;
            
            // ✅ Définir la taille CSS
            canva.style.width = displayWidth + 'px';
            canva.style.height = displayHeight + 'px';
            
            // ✅ Ajuster la résolution interne du canvas
            canva.width = displayWidth * dpr;
            canva.height = displayHeight * dpr;
            
            // ✅ Mettre à l'échelle le contexte pour compenser
            ctx.scale(dpr, dpr);
            
           



    // défilement des éléments du tableau des graphismes
    for (let i=0; i<tabGrphEnt.length; i++){
        let posMot = tabGrphEnt[i].pos;
        let catsThm = tabGrphEnt[i].catsThm;
        const hauteur = canva.height ;
        const largeur = canva.width ;

        for (thm=0;thm<catsThm.length;thm++){   

                // récupération du rang thm
                let rkc = Number(catsThm[thm]);

                if (tabThm[rkc]){
                                

                    ctx.fillStyle ="rgba(200,200,200,0.5)"; // couleur par défaut
                    ctx.strokeStyle = 'rgba(200,200,200,0.5)'; // couleur de bordure par défaut';
                    ctx.globalAlpha = 0.6;
                                
                    let estAct=tabThm[rkc]?.act

                    if (estAct==undefined) {estAct=true} // si pas de valeur, on considère que le thème est actif

                    // console.log("thème " + tabThm[rkc].nom + " avec la couleur " + tabThm[rkc].couleur + " et l'activité " + tabThm[rkc].act + "estact" + estAct)

                    if (estAct  == true ){
                        if (tabThm[rkc].couleur) { 
                        ctx.fillStyle = tabThm[rkc].couleur; } // on met la couleur de fond
                    else {
                        ctx.strokeStyle ="rgba(63, 62, 62, 1)";  // on ne met que la bordure
                    }
                    };

                    // définition de la position relative dans le canvas
                    let lft =  Math.round((posMot / 1000) * largeur);
                    let wth = Math.round((tabGrphEnt[i].width / 1000) * largeur);
                    ctx.fillRect(lft,  hauteur/(catsThm.length) *thm, wth,  hauteur/(catsThm.length));
                    ctx.strokeRect(lft,  hauteur/(catsThm.length) *thm, wth,  hauteur/(catsThm.length));


                    }   

        }
    }
}





function fusionThm(){ // fusionne les thèmes de la liste des entretiens et les range dans un tableau

    tabThm = [];

    for (let i=0; i<tabEnt.length; i++){
        let thm = JSON.parse(tabEnt[i].thm);
        for (let j=0; j<thm.length;j++){
            if (!tabThm.find(thmItem => thmItem.code === thm[j].code)) {
               
                tabThm.push({code: thm[j].code, couleur: thm[j].couleur, nom : thm[j].nom, taille : thm[j].taille, cmpct: "false", rang : thm[j].rang, act: "true"}) 
                 
            }
        }
    }

     
    // console.log("après fusion des thèmes"  , tabThm)
    return tabThm;
}

 



var tabRechCrp = [] // tableau des résultats de recherche dans le corpus

async function rechercherDansCorpus(chaine){

    rgCherche = 0;
    tabRechCrp = [];


    for (let e=0;e<tabEnt.length;e++){ // défilement des entretiens

        if (tabEnt[e].actif == 0){continue} // si l'entretien n'est pas actif, on passe au suivant

        
       

        const canva = document.querySelector(`canvas[data-id="${tabEnt[e].id}"]`);

        // calcul de la position relative du canvas dans son conteneur
        const canvaLeft = canva.getBoundingClientRect().left - canva.parentElement.getBoundingClientRect().left;
        const canvaWidth = canva.getBoundingClientRect().width;

        // effacement des anciennes div d'occurrences
        const anciennesDivs = canva.parentElement.querySelectorAll('.occurence-canvas');
        anciennesDivs.forEach(div => div.remove());


        const html = await window.electronAPI.getHtml(e); 

        if (!String(html).includes(chaine)) {continue} // si l'entretien ne contient pas la chaîne, on passe au suivant 

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = html.replace(/`/g,'');// suppression des backticks;        

        const nbmots = compterElements(tempContainer, "span","lblseg")
         
        
        document.getElementById('status-bar').innerText = `Recherche dans le corpus : traitement de l'entretien ${e+1} sur ${tabEnt.length}`;

        let segments = tempContainer.querySelectorAll('.lblseg');
         console.log("recherche dans l'entretien " + e + " nombre de mots " + nbmots + " nombre de segments " + segments.length)

        for (let seg of segments){
            //const seg = tempContainer.querySelector(`span[data-rksg="${s}"]`);
        
           

            if (seg.innerText.includes(chaine)) {
                
                let m=seg.tabIndex; // rang du 1er mot dans l'entretien
                
                for (let mot of seg.children) {

                    m++;

                    if (mot.innerText.includes(chaine)) {

                        // contexte environnant le mot
                        let rkMot = m;
                        let contexteDeb = Math.max(0, rkMot -15);
                        let contexteFin = Math.min(nbmots -1, rkMot +15);
                        let contexteTexte = "<a>";

                        for (let rkC = contexteDeb; rkC <= contexteFin; rkC++){
                            let motC = tempContainer.querySelector(`span[data-rk="${rkC}"]`);   
                            if (motC) {
                                // ajout du mot au contexte
                                if (rkC != rkMot-1){
                                    contexteTexte += motC.innerText  ;
                                } else {
                                    contexteTexte += "<b>" + motC.innerText + "</b> ";
                                }

                            }
                        }

                        contexteTexte += "</a>"

                        // ajout de l'entretien dans le tableau des résultats
                        if (mot.dataset.rk !== undefined && mot.dataset.rk !== null && mot.dataset.rk !== 0) { 
                        tabRechCrp.push({ent: e, rk: mot.dataset.rk, contexte : contexteTexte});
                            

                        // dessin de la trouvaille dans le canva
                        /*
                        const ctx = canva.getContext('2d');
                            
                        ctx.fillStyle ="rgba(255, 0, 0, 1)"; 
                        ctx.fillRect(posMot, 0, 2, 2);
                        */

                        // ou ajout de divs sur le canvas
                        let ratioMot= mot.dataset.rk/ nbmots // calcul de la position du mot dans l'ensemble
                        let posMot = Math.round(1000 * ratioMot)  
                        canva.parentElement.style.position = "relative";
                        const divOccur = document.createElement('div');
                        divOccur.classList.add('occurence-canvas');
                        divOccur.style.left = `calc(${canvaLeft + (posMot / 1000) * canvaWidth}px  - 1px)`;  

                        divOccur.addEventListener('click', async function(event) {
                            
                            event.stopPropagation(); // empêche le clic de remonter au canvas
                            event.preventDefault(); // empêche le comportement par défaut

                            await afficherHtmlAtPos(e, 0, mot.dataset.rk);
                            //let mot = getSpan(mot.dataset.rk); // récupération du mot à la position
                            //if (!mot) {return} // si le mot n'existe pas, on sort de la fonction
                        
                            //mot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });    
                        
                        
                        canva.parentElement.appendChild(divOccur);
                        }
                    }
                }
            }
        }
          
    } 

    console.log("résultats de la recherche dans le corpus", tabRechCrp)
 
    if (tabRechCrp.length > 0){
        rgCherche = 1;
        afficherResultatRecherche();
    } else {
       document.getElementById('rechinfo').innerHTML =`<label style="color: red;" > Aucune occurrence trouvée !</label>`;
    }   

}

function afficherResultatRecherche(){

  const fondResults = document.getElementById('rechinfo')

    fondResults.innerHTML =`Résultats de la recherche : ${tabRechCrp.length} occurrences trouvées. `;

    // défilement des résultats
    const listeResults = document.createElement('div');
    listeResults.id = "listrechcrp";
    listeResults.classList.add('liste-rech-crp');
    fondResults.appendChild(listeResults);

    let entCourant = -1;
    function ajoutTitreEntResult(e){
        const divTitre = document.createElement('div');
        divTitre.classList.add('titre-ent-rech');
        divTitre.innerHTML = `Entretien : <b>${tabEnt[e].nom}</b>`;
        listeResults.appendChild(divTitre);
    }

    for (let r=0; r<tabRechCrp.length; r++){
        if (entCourant != tabRechCrp[r].ent){
            entCourant = tabRechCrp[r].ent;
            ajoutTitreEntResult(entCourant);
        }
        
        const divResult = document.createElement('div');
        divResult.classList.add('occurence-rech');
        divResult.dataset.entOcc = tabRechCrp[r].ent;
        divResult.dataset.rkOcc = tabRechCrp[r].rk;
        divResult.innerHTML = tabRechCrp[r].contexte;
        
        divResult.addEventListener('click', async function() {
            const e = Number(this.dataset.entOcc);
            const rk = Number(this.dataset.rkOcc);
            await afficherHtmlAtPos(e, 0, rk);
            //let mot = getSpan(rk); // récupération du mot à la position
            //if (!mot) {return} // si le mot n'existe pas, on sort de la fonction
        });

        listeResults.appendChild(divResult);



    }
}


/////////////////////////////////////////////////////////////////////////////////:
// EXPORTATION DES FONCTIONS
/////////////////////////////////////////////////////////////////////////////////
// Export CommonJS pour utilisation dans main.js (contexte Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        lireCorpus,
        sauvegarderCorpus,
        initFromMain,
        rechercherDansCorpus
    };
}

// Export global pour utilisation dans le renderer (contexte navigateur)
if (typeof window !== 'undefined') {
    window.lireCorpus = lireCorpus;
    window.sauvegarderCorpus = sauvegarderCorpus;
    window.initFromMain = initFromMain;
    window.rechercherDansCorpus = rechercherDansCorpus;
}
