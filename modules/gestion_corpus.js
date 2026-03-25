////////////////////////////////////////////////////////////////
// variables de gestion du projet 
////////////////////////////////////////////////////////////////

// Note: loadHtml and afficherEnt are available from gestion_entretiens.js
// loaded via <script> tags in index.html

 

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

    const rep = await question("Le corpus que vous avez sélectionné semble être un corpus Sonal 2. \n Une copie au format Sonal π va être créée à côté du corpus d'origine. \n Le fichier original ne sera pas modifié.", ["Ok", "Annuler"]);

    if (rep === 'annuler') {
         
        return; // saveComplete() n'est pas appelé → la fenêtre reste ouverte
    }

    if (rep === 'ok') {
            
            dialog("Message","Corpus en cours de création. \n Merci de patienter.");
            await lireCrpSonal2(fileContent);
    } 

    

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


loadHtml(0,Number(tabEnt.length-1)).then( async () => { 

         afficherEnt(0,Number(tabEnt.length-1));
        await cleanVariables(); // nettoyage du tabdat des éventuelles données obsolètes
         inventaireVariables(); // inventaire des variables utilisées dans les entretiens
});  


document.getElementById('fenetreAccueil').classList.add('dnone'); // masquage de la fenêtre d'accueil

  let Corpus = await window.electronAPI.getCorpus();

    // si corpus distant, affichage du bouton rafraichir : id="btn-rafraichir"
    if (Corpus.type == "distant"){  
        document.getElementById('btn-rafraichir').classList.remove('dnone'); // affichage du bouton de rafraichissement
    } else {
        document.getElementById('btn-rafraichir').classList.add('dnone');
    }



}

//-------------------------------------------------------------------------------
// lecture d'un corpus Sonal 2
//-------------------------------------------------------------------------------
async function lireCrpSonal2(contenu){

    console.log ("lecture du corpus Sonal 2");  
    
        // récupération du corpus 
        Corpus= await window.electronAPI.getCorpus();
 
  
 
        // remise à zéro
        tabThm =  [];
        tabVar =  [];
        tabDic =  [];
        tabDat =  [];
        tabEnt =  [];
        tabHtml = [];
        tabGrph = [];
        ent_cur = -1;



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
        let nbIntercalaires = 0;

        // Ajout des thèmes de pondération
          tabThm.push({ // ajout au tableau des thématiques
                    code: "cat_pond", 
                    couleur: "",
                    nom: "Pondérations",
                    taille : "16",
                    cmpct: false,
                    rang: "0",
                    act: true
           })


            for (p=1;p<6;p++){ // défilement les lignes
                    tabThm.push({ // ajout au tableau des thématiques
                    code: "cat_pond"+p, 
                    couleur: "",
                    nom: "★".repeat(p) + "☆".repeat(5-p),
                    taille : (16 + p),
                    cmpct: false,
                    rang: "1",
                    act: true
                })
        }


        for (l=0;l<nbl;l++){ // défilement les lignes
            
            if (lignesFich[l].substring(0,7) == "<|THEM|"){debThm=l; continue} // repérage de la balise d'ouverture
            if (lignesFich[l].substring(0,7) == ">|THEM|"){debThm=-1;break}  // fin

            if (debThm>0){ // ajout des thèmes à la liste
                
                if (lignesFich[l].substring(0,1) == ">"){
                     
                    nbIntercalaires++;
                    let nomIntercalaire = lignesFich[l].substring(1).trim();

                    tabThm.push({ // ajout au tableau des thématiques
                        code: "cat_int_"+nbIntercalaires, 
                        couleur: "",
                        nom: nomIntercalaire,
                        taille : "16",
                        cmpct: false,
                        rang: "0",
                        act: false
                    })

                    rgThm = "1"; // les thèmes suivants seront rangés après les intercalaires
                    continue
                }  // évitement des intercalaires
                
                 
                let parts = lignesFich[l].split(",")
                 
                tabThm.push({ // ajout au tableau des thématiques
                    code: "cat_"+ parts[0], 
                    couleur: convertColor(parts[1]),
                    nom: parts[2].replace(/\r/g, ''),
                    taille : "16",
                    cmpct: false,
                    rang: rgThm,
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

                if (parts[0] && parts[1]) {
                    tabVar.push({v:Number(parts[0]),
                    lib:parts[1].replace(/\r/g, ''),
                    public:publicVar,
                    champ:'gen'
                    })
                }
                
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
                if (parts[0] && parts[1]) {

                    let varcur= Number(parts[0]);
                    let modcur= Number(parts[1]);

                    tabDic.push({v: varcur, m: modcur, lib: parts[2].replace(/\r/g, '')}) // ajout de la modalité

                }

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

                if (parts.length < 3) {continue} // évitement des lignes vides

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
        
       

        //console.log("les tableaux de données ont été chargés depuis le corpus Sonal 2");

        //console.log("tabent" + JSON.stringify(tabEnt))
  
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
        
        let posTags = parts[2].indexOf("Tags="); // repérage de la position des tags
        if (posTags == -1) {posTags = parts[2].length} // si pas de tags, la fin de la chaîne est la fin des thématiques
       
        // extraction des thèmes 
        let thms = parts[2].substring(0, posTags); 
        // extrait les tags après "Tags="
        let tags = parts[2].substring(posTags + 5);
        if (tags.length>0) {console.log("tags trouvés : " + tags)} 
        return {position: position, thms: thms, tags: tags}
        
    
    }

    async function nouvelExtraitRtr(deb, fin, thms, tags){
        tabXtrLocal.push( {debut: deb, fin: fin, thms: thms, tags:tags, texte: '' } )
    }


    function subdiviserExtraits(texte) {

        const regex =  /(\[>[^\]]+\]:?|\[\d+(?:,\d+)?\]|\n)/g;
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
            } else if (balise === '\n') {
            // Saut de ligne : créer un segment de type saut de ligne
            segments.push({
                balise: balise,
                type: 'sautligne',
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
    //console.log("locuteurs trouvés dans l'entretien converti" + JSON.stringify(tabLocLocal)) ;

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
                     nouvelExtraitRtr(xtr.position, -1, xtr.thms, xtr.tags );   
                 
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

   //  console.log("le tableau des extraits est finalisé" + JSON.stringify(tabXtrLocal).substring(1,100)+"...");  

     // création d'un tableau de segments (subdivisions des extraits, ils en récupèrent les thm mais 
     // la position et le contenu sont subdivisés à chaque changement de locuteur ou répérage de point de synchro)

     let tabSegLocal= []; 

    // console.log("nombre d'extraits dans l'entretien " + rgEnt + " : " + tabXtrLocal.length);

     let contenuHtml = ``;  
     let segCourant= 1; 
     let spnCourant= 1;

     // défilement des extraits 
     for (let ext=0; ext<tabXtrLocal.length; ext++){
        
      //  console.log("analyse de l'extrait " + ext)
         
        let posDeb = tabXtrLocal[ext].debut;
        if (posDeb.length>0) {posDeb = posDeb.replace(/\,/g, '.')}; // conversion de la position en nombre;
        let posFin = tabXtrLocal[ext].fin;
        if (posFin.length>0) {posFin = posFin.replace(/\,/g, '.');} ; // conversion de la position en nombre;
        
        let thmsXtr = tabXtrLocal[ext].thms;
        let tagsXtr = tabXtrLocal[ext].tags;
        
        //console.log("tags de l'extrait " + ext + " : " + tagsXtr);
        //console.log("thématiques de l'extrait " + ext + " : " + thmsXtr);
        
        // mise en tableau éventuelle des thématiques
        let chaineCat=""; 
        let tabThmsXtr = thmsXtr.split(",");
        tabThmsXtr.forEach((thm) => {
        
        // évitement des thm vides (000)
        if (thm.trim() === "000") { return}

        thm = "cat_" + thm;

            if (chaineCat ==""){    
                chaineCat = thm;
            } else {
                chaineCat += "  " + thm;
            }

        });



        // découpage des extraits en segments 
        let segments = await subdiviserExtraits(tabXtrLocal[ext].texte);

        //console.log("segments trouvés :" + segments.length)

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
                
                else if (seg.type === 'sautligne') { // saut de ligne
                    // on ne fait rien, le saut de ligne est juste un séparateur
                }
                
                else if (seg.type === 'synchro') { // changement de position
                    posCourante = seg.valeur.replace(/,/g, '.');
                    return; // le segment de texte associé à la balise de synchro n'est pas traité, on passe directement au segment suivant
                }    
 

                        // prise en compte des tags éventuels 

                        let classTags = "";

                        if (tagsXtr.length>0) {
                        classTags = "tagssegs"
                        }

                        // création du span pour le segment
                        contenuHtml += `<span class="lblseg sautlig ${classTags}" 
                        data-deb="${posCourante}" 
                        data-fin="${posFin}" 
                        data-loc="${rkLoc}"
                        data-nomloc="${nomLoc}"
                        tabindex="${spnCourant}" 
                        data-rksg="${segCourant}"
                        data-tags="${tagsXtr}"
                        >`
                        
                         
 

                        // Séparation par espaces en conservant les espaces
                        var texte = seg.texte;
                        
                        const elements = texte.split(/(\s+)/);

                        let chaine = "";
                        let pond_cur = "";

                        if (elements) {
                            for (const elem of elements) {

                               
                                // interception des pondérations (OUVERTURE)
                                if (elem.trim().startsWith("{+") && elem.trim().endsWith("}")) {
                                                                
                                    

                                    let pond = Number(elem.trim().substring(3,1)); // extraction de la valeur de pondération
                                    
                                    
                                    if (Number(pond) >= 1 && Number(pond) <= 5) {
                                        pond_cur = " cat_pond" + pond;
                                    
                                    }

                                    continue ; // le mot n'est pas ajouté au texte, seule la classe de pondération est mémorisée

                                }    

                                // interception des pondérations (FERMETURE)
                                if (elem.trim().startsWith("{-") && elem.trim().endsWith("}")) {
                                        pond_cur = "";
                                        continue; // le mot n'est pas ajouté au texte, seule la classe de pondération est mémorisée
                                }

                                
                                    chaine += `<span class="${chaineCat}${pond_cur}" data-rk="${spnCourant}" data-sg="${segCourant}">${elem}</span>`;
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
  let tabEnt = await window.electronAPI.getEnt();
  const tabVar = await window.electronAPI.getVar();
  const tabDic = await window.electronAPI.getDic();

  // Synchronisation de tabVar et tabDic globaux dans chaque entretien (les locaux sont toujours alignés sur le global)
  tabEnt.forEach(ent => {
      ent.tabVar = tabVar;
      ent.tabDic = tabDic;
  });
  await window.electronAPI.setEnt(tabEnt);

  // Reconstruction du tabDat global depuis les tabDat locaux de chaque entretien
  const tabDatGlobal = tabEnt.flatMap(ent =>
      (ent.tabDat || []).map(d => ({...d, e: String(ent.id)}))
  );
  await window.electronAPI.setDat(tabDatGlobal);

  const contenu = JSON.stringify({ tabThm, tabEnt, tabVar, tabDic });
  
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

async function rafraichirCorpus() {

    if (Corpus.type !=="distant"){
        return; // le rafraîchissement ne se fait que pour les corpus distants
    }

     // récupération du tableau des entretiens
     tabEnt = await window.electronAPI.getEnt();

    // défilement des entretiens 
    for (let ent=0;ent<tabEnt.length;ent++){

        console.log("vérification de la nécessité de rafraîchir l'entretien " + tabEnt[ent].nom + JSON.stringify(tabEnt[ent]));
            
        let fich =  [Corpus.folder,tabEnt[ent].rtrPath].join('/');

        // récupération de la dernière date de modification
        let dateModif = await window.electronAPI.getLastModified(fich);

        console.log("date de modification du fichier " + fich + " : " + dateModif + " comparée à la date de modification enregistrée " + tabEnt[ent].lastModified);
        // comparaison avec la date de modification enregistrée dans le tabEnt
        if (dateModif > tabEnt[ent].lastModified) {
            console.log("le fichier " + fich + " a été modifié depuis la dernière lecture, il va être rechargé au rang" + ent);

            // rechargement du fichier .Sonal correspondant
            // récupération du contenu du fichier .Sonal
            loadHtml(ent, ent).then( () => {

                //console.log("affichage au rang " + ent );
                afficherEnt(ent, ent);
                //inventaireVariables(); // inventaire des variables utilisées dans les entretiens
                // flash
                const divEnt = document.querySelector(`div.ligent[data-id='${tabEnt[ent].id}']`);
                divEnt.classList.add("ligent-flash");
 
            })

             
            tabEnt[ent].lastModified = dateModif;

            await window.electronAPI.setEnt(tabEnt);

        }

            // rechargement de l'entretien

        // définition du nom sur le serveur 

 


    }

    await window.electronAPI.setEnt(tabEnt);
    console.log("rafraîchissement du corpus terminé")
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

    reader.onloadend = async function() {

        // Sauvegarder les globaux avant le parsing (chargerHTML les écrase)
        const savedTabVar = tabVar ? tabVar.slice() : [];
        const savedTabDic = tabDic ? tabDic.slice() : [];

        let donnéesEnt = chargerHTML(fich);

        // chargerHTML a écrasé tabVar/tabDic avec les valeurs du fichier — on capture avant de restaurer
        const fileTabVar = tabVar ? tabVar.slice() : [];
        const fileTabDic = tabDic ? tabDic.slice() : [];
        const fileTabDat = (donnéesEnt[7] || []).slice();

        // Restaurer les globaux du corpus
        tabVar = savedTabVar;
        tabDic = savedTabDic;

        // Aligner les codes du fichier sur les globaux (met à jour tabVar/tabDic si nouvelles vars/modas)
        const tabDatAligne = (typeof fusionTabVar === 'function')
            ? (await fusionTabVar(fileTabVar, fileTabDic, fileTabDat) || fileTabDat)
            : fileTabDat;

        // retrait de l'extension dans le nom du fichier
        let nomFich = fich.name.replace(/\.[^/.]+$/, "");

        tabEnt.push({
            nom: nomFich,
            loc: donnéesEnt[1],
            thm: donnéesEnt[2],
            notes: "`" + donnéesEnt[3] + "`",
            html: "`" + donnéesEnt[4] + "`",
            tabVar: tabVar,     // global (source de vérité)
            tabDic: tabDic,     // global (source de vérité)
            tabDat: tabDatAligne
        });
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
                dessinResumeGraphique(e,canva, tabGrphEnt);
                }
            else { // dessiner à partir du tabGrph existant
                dessinResumeGraphique(e,canva, tabGrphEnt);
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

    let tabGrphEnt = [{"pos":0, "width":0, "catsThm":0, "rkMot":0} ]; // tableau des graphismes à dessiner // première ligne non nulle pour distinguer mes tabgrph déjà calculés (mais vides) de ceux qui doivent être calculés

     
    // Créer un conteneur temporaire pour analyser le HTML
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = html;
    
     
    // nombre de mots
    let mots = tempContainer.querySelectorAll("span")
    
         
    // nombre de mots

    const derSpan = [...mots]
        .filter(m => !m.classList.contains('lblseg'))
        .reduce((max, m) => Number(m.dataset.rk) > Number(max?.dataset?.rk ?? -1) ? m : max, null);

    let nbmots = derSpan
        ? Number(derSpan.dataset.rk) + Number(derSpan.dataset.len || 0)
        : 0;


   // console.log ("le mot le plus avancé contient " + derMot.textContent + "avec la longueur " + derMot.dataset.len  )

 

    var derPosMot = -99; // position du dernier mot affiché

     
    
    for (let mot of mots) {
         
            if (!mot.classList || mot.classList.length === 0) { 
                tabGrphEnt.push({"pos":0, "width":1, "catsThm":[]});
                continue; 
            }

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


                    let ratioMot = Number((mot.dataset.rk / nbmots*100).toFixed(3))
 
                    
                    // calcul de la position du mot dans l'ensemble
 
                    let posMot = ratioMot   // position relative (2 décimales)  

                    // nombre de mots dans le span 
                    let nbMotsDsSpan = 1 
                    
                    if (mot.dataset.len) { nbMotsDsSpan = Number(mot.dataset.len)}; 

                    let largeurMot = (nbMotsDsSpan / nbmots * 100).toFixed(3) //Number(nbmots/100).toFixed(3); // position relative (2 décimales)  
                    
                    if ( posMot == derPosMot){continue} // n'affiche que tous les  pixels

                  
                    // mise à jour du dernier mot affiché
                    derPosMot = posMot; 
                    
                   
                    tabGrphEnt.push({"pos":posMot, "width":largeurMot, "catsThm":catsThm, "rkMot":mot.dataset.rk, "len": nbMotsDsSpan});

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
                let valprec = Number(dernier.width);
                dernier.width = valprec + Number(tabGrphEnt[i].width);
            } else {
                tabGrphEntComp.push(tabGrphEnt[i]);
            }
        }
    }

// filtrer le tableau pour ne garder que les graphismes qui ont une position à zéro
tabGrphEntComp = tabGrphEntComp.filter(grph => grph.pos > 0);

//console.log("fin de la création du tableau des graphismes compacté pour l'entretien", tabGrphEntComp)
    
return tabGrphEntComp;
 
}


async function dessinResumeGraphique(rkEnt, canva, tabGrphEnt){

    //console.log("dessin du résumé graphique dans le canvas", canva, tabGrphEnt)
    
    // récupération des catégories thématiques du corpus
    tabThm = await window.electronAPI.getThm(); // récupération des thématiques dans main.js 
    if (tabThm.length == 0) {return} // s'il n'y a pas de thématiques, on sort de la fonction

    const ctx = canva.getContext('2d');
    //ctx.clearRect(2, 0, canva.width, canva.height-4); // effacement du canvas

    //effacement de tous les spans éventuels dans le canvas
    const spans = document.querySelectorAll('.xtr-graph[data-e="' + rkEnt + '"]');
    spans.forEach(span => span.remove());


    /*

            const rect = canva.getBoundingClientRect();    
            console.log("dimensions du canvas : " + rect.width + "x" + rect.height);

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
            
           
*/
    let rangEnt = canva.dataset.id;
     

    // défilement des éléments du tableau des graphismes
    for (let i=0; i<tabGrphEnt.length; i++){
        let posMot = tabGrphEnt[i].pos;
        let catsThm = tabGrphEnt[i].catsThm;
        let rkMot = tabGrphEnt[i].rkMot;
         // récupération du rang de l'entretien à partir du dataset du canvas

        

        //const hauteur = canva.height ;
        //const largeur = canva.width ;
        const largeur = document.querySelector('.fond-cnv-ent').getBoundingClientRect().width; // largeur du canvas en pixels
        const hauteur = document.querySelector('.ligent-img').getBoundingClientRect().height; // hauteur du canvas en pixels

        //console.log("dimensions du canvas : " + largeur + "x" + hauteur);

        let nbCouleurs = 0; 
        let nbPond = 0;
        let tabCoul = []; // tableau des couleurs utilisées pour les thèmes de l'extrait
         let couleurBordure = ''; // couleur de bordure par défaut';
        for (thm=0;thm<catsThm.length;thm++){   

                // récupération du rang thm
                let rkc = Number(catsThm[thm]);

                if (tabThm[rkc]){
                                
                    let couleurFond = "rgba(200,200,200,0.5)"; // couleur par défaut
                   
                   
                         
                    let estAct=tabThm[rkc]?.act

                    if (estAct==undefined) {estAct=true} // si pas de valeur, on considère que le thème est actif

                    // console.log("thème " + tabThm[rkc].nom + " avec la couleur " + tabThm[rkc].couleur + " et l'activité " + tabThm[rkc].act + "estact" + estAct)

                    

                        if (tabThm[rkc].couleur) { 
                            nbCouleurs++;
                            tabCoul.push(tabThm[rkc].couleur);
                         
                        } 
                        
                         // les catégories  dont la police est supérieure à la taille de police par défaut sont des pondérations affichées en bordure
                           if (tabThm[rkc].taille && Number(tabThm[rkc].taille) > 16) {
                            //couleurBordure = 'rgba(200,200,200,0.5)';
                            nbPond++;
                           }

                        
                     
                        //ctx.strokeStyle ="rgba(63, 62, 62, 1)";  // on ne met que la bordure
                            //couleurBordure = "rgba(63, 62, 62, 1)"; // couleur de bordure par défaut
                       
                    
                    

                }
        }

                    // définition des couleurs de fond en css
                    const stops = [];
                    
                    for (let c = 0; c < tabCoul.length; c++) {
                        const coul = tabCoul[c];
                        const posDeb = (c / nbCouleurs * 100).toFixed(3);
                        const posFin = ((c + 1) / nbCouleurs * 100).toFixed(3);
                        stops.push(`${coul} ${posDeb}%`, `${coul} ${posFin}%`);
                    }

                    chaineCoul = `linear-gradient(to bottom, ${stops.join(', ')})`;

                     
                    // création de l'étiquette de l'extrait 
                    // définition de la position relative dans le canvas
                    //let lft =  Math.round((posMot) * largeur) ; // position du mot dans le canvas en pourcentage
                    let lft = tabGrphEnt[i].pos;  
                    let wth = tabGrphEnt[i].width; 
                    //ctx.fillRect(lft,  hauteur/(catsThm.length) *thm, wth,  hauteur/(catsThm.length));
                    //ctx.strokeRect(lft,  hauteur/(catsThm.length) *thm, wth,  hauteur/(catsThm.length));

                    // création d'un span dans le canvas 
                    let span = document.createElement('span');
                    //span.dataset.rk = rkc;
                    span.dataset.thm = catsThm.join(","); // on stocke les thèmes de l'extrait dans le dataset du span
                    span.dataset.e = rkEnt; 
                    span.classList.add("xtr-graph");
                    
                    span.style.left = lft + '%';
                    span.style.top = '0px';
                    span.style.width = wth + '%';
                    span.style.height = hauteur + 'px';
                    span.style.borderColor = couleurBordure;

                   
                    span.style.background = chaineCoul;   
                    
                    if (nbPond > 0) {
                        //span.style.border = '1px solid rgba(0, 0, 0, 0.5)';
                        span.style.borderBottom = '3px solid rgb(0, 0, 0)';
                        //span.style.height = (hauteur+4) + 'px';
                        //span.style.borderTop = '3px solid rgb(0, 0, 0)';
                    }
                   

                    // définition du conteneur parent du canvas comme positionné en relatif pour que les spans soient positionnés par rapport à lui
                    canva.parentElement.style.position = "relative";

                    canva.parentElement.appendChild(span);

                    span.addEventListener('click', (e) => {
                        e.stopPropagation(); // empêche la propagation vers div.ligent (qui supprimerait fenEnt)
                        afficherHtmlAtPos(rkEnt, posMot,rkMot);
                    });

                    // ajout d'un listener pour le clic sur le span


    }
}


async function affichageExtraitsCorpus(critereEt = false){
       // défilement des tous les xtr-graph
        
       tabThm = await window.electronAPI.getThm(); // récupération des thématiques dans main.js
       const thmActifs = tabThm.filter(th => th.act === true || th.act === "true");
       //console.log("affichage des extraits du corpus en fonction des thématiques actives")

       // Regroupe les thèmes actifs en familles (indices dans tabThm) :
       // OR à l'intérieur d'une famille complète (parent + toute sa descendance actifs),
       // AND entre groupes distincts.
       function buildGroupesEt(actifs, thm) {
           const activeRks = new Set(actifs.map(th => thm.indexOf(th)));
           const groupes = [];
           const visites = new Set();
           for (let i = 0; i < thm.length; i++) {
               if (!activeRks.has(i) || visites.has(i)) continue;
               const rangParent = Number(thm[i].rang ?? 0);
               const famille = [i];
               let j = i + 1;
               while (j < thm.length && Number(thm[j].rang ?? 0) > rangParent) {
                   famille.push(j);
                   j++;
               }
               const familleComplete = famille.length > 1 && famille.every(rk => activeRks.has(rk));
               if (familleComplete) {
                   groupes.push(famille);
                   famille.forEach(rk => visites.add(rk));
               } else {
                   groupes.push([i]);
                   visites.add(i);
               }
           }
           return groupes;
       }

       const groupesEt = critereEt ? buildGroupesEt(thmActifs, tabThm) : [];

        const xtrGraph = document.querySelectorAll('.xtr-graph')
        xtrGraph.forEach(xtr => {     
            
            
            // l'xtr a-t-il une thématique active
            let thmXtr = xtr.dataset.thm.split(","); // récupération des thèmes de l'extrait
            let affiche = false;

            if (critereEt) {
                // ET avec exception famille : chaque groupe doit être satisfait
                // (OR à l'intérieur d'une famille complète, AND entre groupes)
                affiche = groupesEt.length > 0 && groupesEt.every(
                    groupe => groupe.some(rk => thmXtr.includes(String(rk)))
                );
            } else {
                // OU : l'extrait contient au moins une catégorie active
                for (let t=0; t<thmXtr.length; t++){
                    if (!tabThm[Number(thmXtr[t])]) {continue}
                    if (tabThm[Number(thmXtr[t])].act) {
                        affiche = true;
                        break;
                    }
                }
            }

            if (affiche) {
                xtr.style.display =  "block";
                }
            else {
                xtr.style.display =  "none";
            }

            /*

                let thm = tabThm[Number(thmXtr[t])];
            

                // recherche du thème dans le tableau des thèmes
                // console.log("recherche du thème " + thmXtr + " dans le tableau des thèmes")

                let rangthm = tabThm.findIndex(thm => thm.nom === thmXtr[t]);
                //console.log("rang du thème " + thmXtr + " dans le tableau des thèmes : " + rangthm + "et le thème est actif? :" + tabThm[rangthm]?.act)

                if (rangthm !== -1 && tabThm[rangthm]) {

                    xtr.style.display = tabThm[rangthm].act ? "block" : "none";
                    affiche = true;
                }
            */

        }) 

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

        function enregistrerOccurence(contexteTexte, e, rkMot, nbMots, canva, canvaLeft, canvaWidth) {
            if (rkMot === undefined || rkMot === null || rkMot == 0) { return; }

            tabRechCrp.push({ ent: e, rk: rkMot, contexte: contexteTexte + "</a>" });

            // marquage de l'occurrence sur le canvas
            const ratioMot = rkMot / nbMots;
            const posMot = Math.round(1000 * ratioMot);
            canva.parentElement.style.position = "relative";
            const divOccur = document.createElement('div');
            divOccur.classList.add('occurence-canvas');
            divOccur.style.left = `calc(${canvaLeft + (posMot / 1000) * canvaWidth}px - 1px)`;
            divOccur.addEventListener('click', async function(event) {
                event.stopPropagation();
                event.preventDefault();
                await afficherHtmlAtPos(e, 0, rkMot);
            });
            canva.parentElement.appendChild(divOccur);
        }

    

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

        if (!String(html).toLowerCase().includes(chaine.toLowerCase())) {continue} // si l'entretien ne contient pas la chaîne, on passe au suivant 

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = html.replace(/`/g,'');// suppression des backticks;        

            // nombre de mots
        let nbMots = nbMotsEnt(html);
        
        document.getElementById('status-bar').innerText = `Recherche dans le corpus : traitement de l'entretien ${e+1} sur ${tabEnt.length}`;

        let segments = tempContainer.querySelectorAll('.lblseg');
         console.log("recherche dans l'entretien " + e + " nombre de mots " + nbMots + " nombre de segments " + segments.length)

        for (let seg of segments){

            if (!seg.textContent.toLowerCase().includes(chaine.toLowerCase())) { continue; }

            const chaineLow = chaine.toLowerCase();
            const nbMotsChaine = chaine.trim().split(/\s+/).filter(w => w.length > 0).length;

            // Construction de la liste plate des mots du segment.
            // On utilise toujours baseRk (et non baseRk+i) car dans le format compacté
            // (conversions.js, data-len > 1) il n'existe qu'un seul span par segment :
            // les rk virtuels baseRk+i ne correspondent à aucun élément du DOM.
            let wordList = [];
            for (let motSpan of seg.children) {
                const baseRk = Number(motSpan.dataset.rk);
                const words = motSpan.textContent.split(/\s+/).filter(w => w.length > 0);
                for (let i = 0; i < words.length; i++) {
                    wordList.push({ rk: baseRk, text: words[i] });
                }
            }

            // Recherche de toutes les occurrences dans le texte reconstitué du segment
            // Le padding ' ... ' permet de respecter les frontières de mots ("je " ne trouve pas "jeudi")
            const segText = ' ' + wordList.map(w => w.text).join(' ') + ' ';
            let searchStart = 0;
            while (true) {
                const idx = segText.toLowerCase().indexOf(chaineLow, searchStart);
                if (idx === -1) break;

                // rang du premier mot du match dans wordList
                // (slice(1, idx) retire le padding initial avant de compter)
                const iMot = segText.slice(1, idx).split(/\s+/).filter(w => w.length > 0).length;
                if (iMot >= wordList.length) { searchStart = idx + 1; continue; }

                const rkMot = wordList[iMot].rk;

                const contexteDeb = Math.max(0, iMot - 15);
                const contexteFin = Math.min(wordList.length - 1, iMot + nbMotsChaine - 1 + 15);
                let contexteTexte = "<a>";

                for (let c = contexteDeb; c <= contexteFin; c++) {
                    const isMatch = c >= iMot && c < iMot + nbMotsChaine;
                    contexteTexte += isMatch
                        ? "<b>" + wordList[c].text + "</b> "
                        : wordList[c].text + " ";
                }

                enregistrerOccurence(contexteTexte, e, rkMot, nbMots, canva, canvaLeft, canvaWidth);
                searchStart = idx + 1;
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


let triCorpusEnCours = false; // verrou pour éviter les relances simultanées

async function triEntCorpus(mode) { // fonction permettant de trier les entretiens par ordre alphabétique

    if (triCorpusEnCours) {
        console.warn("triEntCorpus déjà en cours, appel ignoré");
        afficherNotification("Tri en cours, veuillez patienter…", "warning");
        return;
    }
    triCorpusEnCours = true;
    afficherNotification("Tri en cours…", "info");

    try {
    let tabEntCorpus = await window.electronAPI.getEnt();
    tabHtml = await window.electronAPI.getHtml();
    tabGrph = await window.electronAPI.getGrph();
    
    // Créer un tableau d'indices [0, 1, 2, ...]
    const indices = Array.from({length: tabEntCorpus.length}, (_, i) => i);
    
    switch(mode) {
    
    case "alpha":
    // Trier les indices basés sur le nom des entretiens
    indices.sort((a, b) => {
        if (tabEntCorpus[a].nom.toLowerCase() < tabEntCorpus[b].nom.toLowerCase()) return -1;
        if (tabEntCorpus[a].nom.toLowerCase() > tabEntCorpus[b].nom.toLowerCase()) return 1;
        return 0;
    });
    break;

    case "ordre-ajout":
        // Trier les indices basés sur la date de création des entretiens
        indices.sort((a, b) => {
            const dateA = tabEntCorpus[a].id; // on suppose que l'id est basé sur la date de création
            const dateB = tabEntCorpus[b].id;
            return dateA - dateB; // tri croissant (du plus ancien au plus récent)
        });

        break;
    

    case "date-modification":
        // Trier les indices basés sur la date de création des entretiens
        indices.sort((a, b) => {
            const dateA = new Date(tabEntCorpus[a].lastModified);
            const dateB = new Date(tabEntCorpus[b].lastModified);
            return dateB - dateA; // tri décroissant (du plus récent au plus ancien)
        });
        break;

    case "longueur":
        // Trier les indices basés sur la longueur des entretiens
        indices.sort((a, b) => {
            const longueurA = nbMotsEnt(tabHtml[a]);
            const longueurB = nbMotsEnt(tabHtml[b]);
            return longueurB - longueurA; // tri décroissant (du plus long au plus court)
        });
        break;
    
        
    }


            
    // Réorganiser tous les tableaux selon l'ordre de tri
    const tabEntTrié = indices.map(i => tabEntCorpus[i]);
    const tabHtmlTrié = indices.map(i => tabHtml[i]);
    const tabGrphTrié = indices.map(i => tabGrph[i]);
    
    // Mettre à jour les variables globales
    tabEnt = tabEntTrié;
    tabHtml = tabHtmlTrié;
    tabGrph = tabGrphTrié;
  
   

    // Mettre à jour main.js
    await window.electronAPI.setEnt(tabEnt);

    for (let index = 0; index < tabHtml.length; index++) {
        await window.electronAPI.setHtml(index, tabHtml[index]);
    }

    for (let index = 0; index < tabGrph.length; index++) {
        await window.electronAPI.setGrph(index, tabGrph[index]);
    }

   

    console.log("tri des entretiens du corpus effectué");

    await afficherEnt(0,tabEnt.length-1); // réaffichage de la liste des entretiens

    return { tabEnt: tabEntTrié, tabHtml: tabHtmlTrié, tabGrph: tabGrphTrié };

    } catch(err) {
        console.error("Erreur dans triEntCorpus :", err);
    } finally {
        triCorpusEnCours = false; // libération du verrou dans tous les cas
        if (mode==="longueur") {
            await echelleEnt(); // mise à l'échelle des entretiens après tri par longueur
        }
    }
}


async function echelleEnt(){ // fonction permettant de mettre à l'échelle les entretiens en fonction de leur longueur

    let tabEntCorpus = await window.electronAPI.getEnt();

    // --- MODE RETOUR : si déjà à l'échelle, restaurer les valeurs d'origine ---
    const premierDiv = document.querySelector(`div.fond-cnv-ent[data-id="${tabEntCorpus[0]?.id}"]`);
    if (premierDiv && premierDiv.dataset.echelle === "true") {
        for (let i=0; i<tabEntCorpus.length; i++){
            const divEnt = document.querySelector(`div.fond-cnv-ent[data-id="${tabEntCorpus[i].id}"]`);
            if (!divEnt) continue;
            divEnt.style.flex = divEnt.dataset.flexOrigine ?? "";
            delete divEnt.dataset.flexOrigine;
            delete divEnt.dataset.echelle;
            const cnv = divEnt.querySelector('canvas.cnvent');
            if (cnv) {
                cnv.width = divEnt.clientWidth;
                cnv.height = divEnt.clientHeight;
            }
        }
        return;
    }

    // --- MODE MISE À L'ÉCHELLE ---
    let tabHtml = await window.electronAPI.getHtml();

    const MAX_LARGEUR = 66; // largeur maximale en % pour l'entretien le plus long

    let longueurs = tabEntCorpus.map(ent => nbMotsEnt(tabHtml[tabEntCorpus.indexOf(ent)]));
    let maxLongueur = Math.max(...longueurs);

    for (let i=0; i<tabEntCorpus.length; i++){
        let longueur = longueurs[i];
        let ratio = (longueur / maxLongueur) * MAX_LARGEUR; // ratio en % plafonné à MAX_LARGEUR
         
        let divEnt = document.querySelector(`div.fond-cnv-ent[data-id="${tabEntCorpus[i].id}"]`);
        if (!divEnt) { console.warn("fond-cnv-ent introuvable pour l'entretien id=" + tabEntCorpus[i].id); continue; }

        // sauvegarde de la flex d'origine avant modification
        divEnt.dataset.flexOrigine = divEnt.style.flex ?? "";
        divEnt.dataset.echelle = "true";

        divEnt.style.flex = `0 0 ${ratio.toFixed(2)}%`; // on met à l'échelle la largeur en fonction de la longueur de l'entretien

        // mise à jour des dimensions du canvas interne
        const cnv = divEnt.querySelector('canvas.cnvent');
        if (cnv) {
            cnv.width = divEnt.clientWidth;
            cnv.height = divEnt.clientHeight;
        }
    }
}


function question(message, bouttons) { // fonction d'affichage d'une question avec des boutons de réponse personnalisés, qui retourne une promesse résolue avec la valeur (minuscules) du bouton cliqué
   
    return new Promise(resolve => {

        const element = document.getElementById('dlg');
        const contenu = document.getElementById('ssdlg');

        contenu.style.top = "30%";
        contenu.style.width = "40%";
        contenu.style.height = "";
        const nlIndex = message.indexOf('\n');
        const msgTitre  = nlIndex !== -1 ? message.slice(0, nlIndex) : message;
        const msgDetail = nlIndex !== -1 ? message.slice(nlIndex + 1) : '';

        contenu.innerHTML = `
            
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px;">
                <img id = "logo" src="img/logoSonal.png"  alt="" style="height:40px; width:auto;">
                <div class="close" onclick="hidedlg();_questionResolve('annuler')" style="cursor:pointer; font-size:24px; font-weight:bold;">×</div>
              </div>

           <p style="padding:20px 20px 0 20px; font-size:1.1rem; margin:0;">${msgTitre}</p>${msgDetail ? `<p style="padding:6px 20px 20px 20px; font-size:0.88rem; color:#888; white-space:pre-wrap; margin:0;">${msgDetail}</p>` : ''}`;

        const divBtns = document.createElement('div');
        divBtns.style.cssText = "display:flex; flex-direction:row; justify-content:right; gap:3px; margin-top:30px;";

        (bouttons || []).forEach(btn => {
            const isPositive = /^(oui|valider|ok)$/i.test(btn.trim());
            const lbl = document.createElement('label');
            lbl.className = 'btnfonction btnquestion' + (isPositive ? ' btnoui' : '');
            lbl.textContent = btn;
            lbl.addEventListener('click', () => {
                hidedlg();
                window._questionResolve(btn.trim().toLowerCase());
            });
            divBtns.appendChild(lbl);
        });

        contenu.appendChild(divBtns);

        window._questionResolve = (val) => {
            window._questionResolve = () => {}; // neutralise les appels doubles
            resolve(val);
        };

        element.style.display = "block";
    });
}




/////////////////////////////////////////////////////////////////////////////////:
// EXPORTATION DES FONCTIONS
/////////////////////////////////////////////////////////////////////////////////
// Export CommonJS pour utilisation dans main.js (contexte Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        lireCorpus,
        sauvegarderCorpus,
        rafraichirCorpus,
        initFromMain,
        rechercherDansCorpus,  
        echelleEnt,
        affichageExtraitsCorpus,
        triEntCorpus,
    };
}

// Export global pour utilisation dans le renderer (contexte navigateur)
if (typeof window !== 'undefined') {
    window.lireCorpus = lireCorpus;
    window.sauvegarderCorpus = sauvegarderCorpus;
    window.initFromMain = initFromMain;
    window.rechercherDansCorpus = rechercherDansCorpus;
    window.affichageExtraitsCorpus = affichageExtraitsCorpus;
    window.rafraichirCorpus = rafraichirCorpus;
    window.triEntCorpusAlpha = triEntCorpus;
    window.echelleEntretiens = echelleEnt;
}   