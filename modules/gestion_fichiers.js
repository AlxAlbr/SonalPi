
function chargeAudio(event) {

    var fichAudio =""
    
    var input = event.target;
    var fichiers = event.target.files;
     fichAudio = input.files[0];
    
    openAudio(fichAudio);
    convertAudio(fichAudio);
    const simplifiedData = simplifySamples(audioData, 1000);
    console.log(simplifiedData); // Points à afficher

    }
    
    function openAudio(file){
        objectURL = URL.createObjectURL(file);
    
    //var audio = document.getElementById('lecteur');
    
    var source = document.getElementById('sourceLecteur');
    source.src = objectURL;
    
    audio.load(); 
    audio.playbackRate = 1;
    
    document.getElementById('lblaudio').innerText=file.name ; 
    document.getElementById('btnfichaudio').classList.add('btngeant_ok');
    document.getElementById('lecteur').style.display="block";
    audiook=true;
    
    
    
    
    checkok();
    
    };
    
    
    function chargeText(event) {
    
    var fichText =""
    
    var input = event.target;
    var fichiers = event.target.files;
    
    fichText = input.files[0]
    nomFichText =  input.files[0].name;
    
    let detailsf = dossfichext(nomFichText)
    
    let extens = String(detailsf[2]) // récupération de l'extension
    const ext = extens.toUpperCase();
     
    
     
    switch(ext) {
                       
        case '.JSON':
        
        openJson(fichText);
    
        break;
    
        case ".PURGE":
        case ".SRT":
        case ".VTT":   
        openFich(fichText,ext);
        
        break;
    
        case ".SONAL":
        openFich(fichText,ext);
        break
    
        };
    
        
    
        
    
    };
    
    function lireDrag(files) {
    
     console.log("lire drag")
    
        for (var i = 0; i < files.length; i++) {
    
        nomFichText =  files[i].name;
    
        let detailsf = dossfichext(nomFichText)
    
        let extens = String(detailsf[2]) // récupération de l'extension
        const ext = extens.toUpperCase();
         
    
    
        switch(ext) {
                       
                       case '.JSON':
                       
                       openJson(files[i]);
    
                       break;
                   
                       case ".PURGE":
                       case ".SRT":
                       case ".VTT":   
                       openFich(files[i],ext)
                      
                        break;
    
                        case ".SONAL":
                        openFich(files[i],ext);
       
                        
                        break;
                   
                        case '.MP3':
                        case '.WAV':
                        case '.M4A':  
                        case '.AAC':       
    
                        openAudio(files[i]);
                        break;
    
                       };
        
        
    
    
        }
    
    
    }
    
    
    var openFich = function(fich,ext) {
    
    
        //wait("Chargement en cours. Merci de patienter "); // affichage de l'indicateur de chargement
        //var input = event.target;
        lignesFich=[];  // vidage du tableau
    
    
        var reader = new FileReader();
            
            reader.onload = function(){
            var text = reader.result;
                
            
            text = text.replace(/\r?\n|\r/g,'\n') // uniformisation des sauts de ligne
            // split du texte par lignes \n
            lignesFich = text.split("\n");
             
            };
    
        reader.readAsText(fich);
    
        reader.onloadend = function() {
             
    
        switch (ext) {
    
            case ".PURGE" :
                
                convertPURGE();
                affSegments(0);
                chargeLocut();
                loadThm()
                //selSegment(seg_cur,false);
                break;
    
            case ".SRT":
            case ".VTT":
                convertSRT();
                Phrasifier();
                convertSpeaker();
                affSegments(0);
                chargeLocut();
                loadThm()
                
                break;
    
            case ".SONAL":
                chargerHTML(fich);
                chargeLocut();
                loadThm();
                multiThm('segments'); 
                affichDataEnt(); 
                
                // mise à jour du dessin de l'entretien
                const html = document.getElementById("segments").innerHTML; 
                const canva = document.getElementById("graphEnt")
                dessinResumeGraphique(tabEnt.length-1, html, canva);
                 
               
    
               
                
                break;    
        };
        
        listenerGraph()

        checkloc(locut);  // vérification / ajout des changements de locuteur (en css)
    
        listenerLblSeg() // ajout des listeners sur les catégories
      
        initBkUp();
        
        document.getElementById('lbltext').innerText=nomFichText ; 
        document.getElementById('btnfichtext').classList.add('btngeant_ok');
        textok=true;
        checkok();
         
    }
    
    
    
    
    
    
    //endWait()
    
    };
    
    function openJson(fich){
       
        objectURL = URL.createObjectURL(fich);
    
      var request = new XMLHttpRequest();
    
      request.open("GET", objectURL);
      //request.responseType = "json";
      request.responseType = "text";
      request.send();
    
      request.onload = function () {
      var SGMTSText = request.response;
      SGMTS  = JSON.parse(SGMTSText);  
    
      };
    
    
      request.onloadend = function () {
     
      convertJSON();
      Phrasifier();
      convertSpeaker();
      affSegments(0)
      chargeLocut()
      loadThm()
    
    };
    
    document.getElementById('lbltext').innerText=fich.name ; 
    document.getElementById('btnfichtext').classList.add('btngeant_ok');
    textok=true;
    checkok();
    
    }
    
    function convertJSON() { // conversion de l'objet JSON en tableau
    
        var nbseg = SGMTS.segments.length ;
        TabSeg = new Array(nbseg);
    
        for (s=0;s<nbseg;s++){
            TabSeg[s]=  new Array(6);
        }
      
        
        for (s=0;s<nbseg;s++){
             
             
            TabSeg[s][1]= SGMTS.segments[s].start.toFixed(2) ;
            TabSeg[s][2]= SGMTS.segments[s].end.toFixed(2);
            TabSeg[s][3]= ""; // locuteur
            TabSeg[s][4]= SGMTS.segments[s].text;
            TabSeg[s][5]= false ; // non sélectionné par défaut
            TabSeg[s][6]= SGMTS.segments[s].avg_logprob
            
            
        }
    
        
    
    };
    
    function convertSRT() { // conversion du fichier SRT en tableau
        
        var nblig = lignesFich.length  ;       
         

        let rgSeg=0;
        TabSeg = new Array (1);
        TabSeg[rgSeg]=  new Array(6);
        
    
        for (s=0;s<nblig;s++){
             
            let ligne = lignesFich[s].trim()     
            
            let posflèche= ligne.lastIndexOf("-->") // recherche d'un indicateur de coordonnées
    
            if (posflèche>-1) { // ajout d'un segment
                
                TabSeg.push();
                rgSeg++;
                 
                TabSeg[rgSeg]=  new Array(6);
    
                let tps = ligne.split("-->") 
                let deb = TimeToSec(tps[0])
                let fin = TimeToSec(tps[1])
    
                TabSeg[rgSeg][1]= deb  ;
                TabSeg[rgSeg][2]= fin;
                TabSeg[rgSeg][3]= ""; // locuteur
                TabSeg[rgSeg][4]= "" //
                TabSeg[rgSeg][5]= false ; // non sélectionné par défaut
                TabSeg[rgSeg][6]= 0; 
    
            } else {
            
                if (ligne=="" || isNaN(ligne)==false) { // évitement des numéros de sous-titre et sauts de ligne
    
                    if (s<nblig-1) {
    
                        if (lignesFich[s+1].lastIndexOf("-->") > -1){ continue;}               
                    
                    }
    
                 
                }
    
                let lignetxt = ligne.replace(/\r?\n|\r/,"") // retrait des sauts de ligne 
                TabSeg[rgSeg][4]+= lignetxt + " "
            
             
            }
            
         
        }
    
    
        // suppression du rang 0
        TabSeg.splice(0,1)
        
    
        //"trimage" des portions de texte
        for (s=0;s<TabSeg.length;s++){
            
            let txttrim = TabSeg[s][4].trim();
            TabSeg[s][4]= txttrim;
    
        }
     
    }
    
    
    
    
    function VTTtoTABSEG() { // conversion du fichier VTT en tableau
    
    }
    
    function convertPURGE() { // converstion d'un fichier PURGE en tabseg
    
         
    
        //récupération des locuteurs (première ligne)
        locut =  lignesFich[0].split("\t") ;
       
            
        // récupération du segment courant (seconde ligne)
        let lig = lignesFich[1].split("\t") ;
        seg_cur=lig[1]
        //seg_lu=lig[1]
    
        // récupération de la vitesse de lecture (troisième ligne)
        lig = lignesFich[2].split("\t") ;
        audio.playbackRate = Number(lig[1])
        document.getElementById("lblspd").innerText = "x " + lig[1];
    
    
        // récupération des notes
    
        let  nblig = lignesFich.length;
        let debutSegments=0 ;
        let debutMemo=0;
        notes = "";
    
        for (s=3;s<nblig;s++){
             
            
             
            if (lignesFich[s].substr(0,6) == "Memo :") {debutMemo=s+1}
            if (lignesFich[s].substr(0,9) == "Début\tFin") {debutSegments=(s+1);break;}
            
            if (s>=debutMemo){notes= notes + lignesFich[s] + " \r\n";} //ajout de la ligne aux notes
    
        }
    
    
        document.getElementById("txtnotes").value = notes; 
    
    
        
        // suppression des premières lignes puis importation des segments en masse
        lignesFich.splice(0,debutSegments);
    
        var nbseg = lignesFich.length  ;
        TabSeg = new Array(nbseg);
    
        for (s=0;s<nbseg;s++){
            TabSeg[s]=  new Array(6);
        }
      
        
        for (s=0;s<nbseg;s++){
            
            cases = lignesFich[s].split("\t") 
            
            TabSeg[s][1]= cases[0]  ;
            TabSeg[s][2]= cases[1];
            TabSeg[s][3]= cases[2]; // locuteur
            TabSeg[s][4]= cases[3] //
            TabSeg[s][5]= false ; // non sélectionné par défaut
            TabSeg[s][6]= 0;
            
            
        }
    
         
    };
    
    function HTMLTOTABSEG(){ // reconstitue un tableau de données (pour exports notamment ) depuis le HTML
        
        let rgSeg=0;
        TabSeg = new Array (1);
        TabSeg[rgSeg]=  new Array(6);
    
    
    
        const tousSeg = document.querySelectorAll('.lblseg'); // document.getElementsByClassName("survseg")
            
            tousSeg.forEach((segment,index) => {
    
                
                TabSeg.push();
                rgSeg++;
                 
                TabSeg[rgSeg]=  new Array(6);
    
    
                TabSeg[rgSeg][1]= segment.dataset.deb  ;
                TabSeg[rgSeg][2]= segment.dataset.fin;
                TabSeg[rgSeg][3]= segment.dataset.loc // locuteur
    
                TabSeg[rgSeg][4]= getSegContent(rgSeg-1)
                
                
    
                TabSeg[rgSeg][5]= false ; // non sélectionné par défaut
                TabSeg[rgSeg][6]= 0; 
     
    
            });
    
    TabSeg.splice(0,1);
     
    
    }
    
    
    function chargerHTML(adrFile) {
    
    
    
        /* Avec FETCH  // ne fonctionne pas dans le cas d'une page Internet (problème de Same Origin)
        fetch(adrFile)
        .then(response => response.text())
        .then(html => {
          document.getElementById('aspirateur').innerHTML = html;
    
          
          // récupération des locuteurs
          const listelocut = document.getElementById('listloc');
           
          listelocut.forEach((element) => console.log(element));
    
    
          // récupération du texte
          const element = document.getElementById('contenuText').innerHTML;
          document.getElementById('fondseg').innerHTML = element;
            
          
    
    
        })
        .catch(err => console.error('Erreur lors du chargement:', err));
        */
    
        //////////////////////////////////////////////////////////////
    
        var nblig = lignesFich.length  ;  
        
        var dsCat = false;
        var lignecat ="";
        var dsNotes = false;
        var contenuNotes = "";
    
        var dsContenuHtml = false ;
        var contenuHtml = "" ;        
        
    
     
    
        for (s=0;s<nblig;s++){
             
            let ligne = lignesFich[s].trim() 
    
            // recherche des locuteurs
    
            if (ligne.indexOf("loc-json") > -1){
    
                var ligneloc = lignesFich[s+2].trim() 
                 
    
                locut = JSON.parse(ligneloc)
                 
                 
            }
    
            // recherche des catégories (sur plusieurs lignes éventuellement)
            
            if (ligne.indexOf("cat-json") > -1){
             
                dsCat = true 
                
                s=s+2
            }
    
            if (dsCat){

                if (lignesFich[s].trim() != "</script>"){
                
                lignecat += lignesFich[s].trim() 
                
                } else {
                    
                    dsCat=false
                    tabThm = JSON.parse(lignecat);
                            tabThm.forEach(row => {
                            row.cmpct = "false"; 
                            row.act = true; 
                        }); 
     
                }
    
          
    
    
            }
    
            if (ligne.indexOf("var-json") > -1){
    
                var lignevar = lignesFich[s+2].trim() 
                 
    
                tabVar = JSON.parse(lignevar)
                 
                 
            }

            
            if (ligne.indexOf("dic-json") > -1){
    
                var lignedic = lignesFich[s+2].trim() 
                 
    
                tabDic = JSON.parse(lignedic)
                 
                 
            }
            
            if (ligne.indexOf("dat-json") > -1){
    
                var lignedat = lignesFich[s+2].trim() 
                 
    
                tabDat = JSON.parse(lignedat)
                 
                 
            }
    
            if (ligne.indexOf("anon-json") > -1) {
                var ligneanon = lignesFich[s+2].trim();
                const donneeAnon = JSON.parse(ligneanon);
                importerAnonSonal(donneeAnon);
            }
            
    
    
            // ajout (ligne à ligne du contenu textuel)
            if (ligne.indexOf('<div id="txtnotes">') > -1){
               dsNotes=true ;        
                continue;
            }
    
            if (ligne.indexOf('</div>') > -1){
               dsNotes=false ;        
                
            
            }
    
            if (dsNotes==true){
                contenuNotes += ligne + " \n";
            }
    
    
    
    
            // ajout du contenu HTML (ligne à ligne du contenu textuel)
            if (ligne.indexOf('<div id="contenuText">') > -1){
                dsContenuHtml=true ;        
                
                continue;
            }
    
            if (ligne.indexOf('</div></body>') > -1){
                
                dsContenuHtml =false ;        
            
            }
    
            if (dsContenuHtml==true){
               
                contenuHtml += ligne + " ";
            }
        
            
        
        }
    
    
    let notes= document.getElementById("txtnotes");
    if (notes) {notes.value = contenuNotes};
     
    
    contenuHtml = contenuHtml.trim(); 
    contenuHtml = contenuHtml.replace(/[\u200B-\u200F\uFEFF]/g, "");
    contenuHtml = contenuHtml.replaceAll('class=""', "");

        

    const parser = new DOMParser();
    const doc = parser.parseFromString(contenuHtml, "text/html");
    
    let segments = document.getElementById("segments")
    segments.innerHTML = "" // vide le contenu avant d'ajouter les nœuds
    if (segments) {segments.append(...doc.body.childNodes);} // Ajoute les nœuds proprement
    
    //cleanHTML();
    
    //document.getElementById("segments").innerHTML = parserHTML(contenuHtml);
    
    //document.getElementById("segments").insertAdjacentHTML("beforeend", contenuHtml)
    
    return [adrFile,locut, lignecat,contenuNotes,contenuHtml, tabVar, tabDic, tabDat];
     
               
    
    }
    
    function parserHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        return doc.body.innerHTML; // Retourne une version propre du HTML
    }
    
    
//////////////////////////////////////////////////////////////
// Enregistrer fichiers
//////////////////////////////////////////////////////////////

function dossfichext(fich) { // renvoie le dossier, le nom de fichier sans extension, et l'extension d'un fichier
    var derpoint = fich.lastIndexOf(".");
    var extens = fich.substr(derpoint);
    extens = extens.toUpperCase()
    var derslash = fich.lastIndexOf("/") +1;
    var fichier = fich.substr(derslash,derpoint - derslash);
    dossier = fich.substr(0, derslash);

    return [dossier,fichier, extens];
}


async function exportFichierSonal(){
    
    // fonction permettant de sauvegarder le travail en cours
    console.log("demande d'export de l'entretien " + ent_cur); 
    if (ent_cur==-1){ent_cur = await window.electronAPI.getEntCur()}

    let adrFich = tabEnt[ent_cur].rtrPath; // récupération du chemin du fichier d'origine


    let detailsf = dossfichext(adrFich)

            // récupération des caractéristiques de l'entretien
            let ent = tabEnt[ent_cur];
            let notes= document.getElementById("txtnotes");
            if (notes) {ent.notes = notes.value};


            // compactage du html du conteneur 
            let contenuHtmlCmpct = await compactHtml();
            contenuHtmlCmpct = String(contenuHtmlCmpct).replace(/`/g,'');

          

            // sauvegarde du fichier de l'entretien
            const contenuFichierSonal = sauvHtml(ent.tabLoc, tabThm, tabVar, tabDic, ent.tabDat, ent.notes, contenuHtmlCmpct, ent.tabAnon); // conversion du HTML en format Sonal


    SauvegarderSurDisque(contenuFichierSonal,detailsf[1] + ".Sonal", "UTF-8")
     
}

function SauvPurge(){

    var TxtFile= "" //nomFichText + "\r\n" + "[Début] \t   [Fin] \t  [locuteur] \t [texte]" ;

    // ajout des locuteurs:
    TxtFile = "Locuteurs : "  ;
    for (l=1;l<locut.length;l++){ 
    TxtFile += "\t" + locut[l];    
    }

    TxtFile += "\r\nPosition atteinte : \t" + seg_cur ;
    TxtFile += "\r\nVitesse lecture : \t" + audio.playbackRate;

    var notes = document.getElementById("txtnotes").value;
    TxtFile += "\r\nMemo : \r\n" + notes ;

    TxtFile += "\r\nDébut\tFin\tLocuteur\tTexte\tSlectionné\tTexte initial\r\n" ;

    // ajout des segments
    for (n=0;n<TabSeg.length;n++){ 
        
        let chaineSeg=""
        
        for (n2=1;n2<7;n2++) { 

        TxtFile += TabSeg[n][n2] + "\t";
        }

        chaineSeg = chaineSeg.replace(/\r?\n|\r/,"") // retrait des sauts de ligne

        TxtFile +=  chaineSeg + "\r\n" 
    }

    


    //return TxtFile;

    
    var textEncoder = new CustomTextEncoder('UTF-8', {NONSTANDARD_allowLegacyEncoding: true})
    var TxtANSI = textEncoder.encode([TxtFile]);

    return TxtANSI;
    

}

function sauvHtml(tabLoc, tabThm, tabVar, tabDic, tabDat, notes, html, tabAnon){ // fonction permettant de sauvegarder le fichier au format HTML

var contenuHtml =`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fichier Whispurge</title>
   <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet"  type="text/css">  
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous"> 
   
   `

const locJSON = JSON.stringify(tabLoc, null);
const thmJSON = JSON.stringify(tabThm,null)
const varJSON = JSON.stringify(tabVar,null)
const dicJSON = JSON.stringify(tabDic,null)
const datJSON = JSON.stringify(tabDat,null)
const anonJSON = JSON.stringify(tabAnon, null);


contenuHtml += exportThmcss();

contenuHtml += `</head>
 
<body>
`
// sauvegarde des locuteurs


contenuHtml += `<script id="loc-json" type="application/json">
        {
            ` + locJSON + `         
        }
<`+ `/script> 
`;  


contenuHtml += `<script id="cat-json" type="application/json">
        {
            
            ` + thmJSON + `          
        }
<`+ `/script> 
`;  

contenuHtml += `<script id="var-json" type="application/json">
        {
            ` + varJSON + `          
        }
<`+ `/script> 
`;  

contenuHtml += `<script id="dic-json" type="application/json">
        {   
            ` + dicJSON + `          
        }
<`+ `/script> 
`;  

contenuHtml += `<script id="dat-json" type="application/json">
        {   
            ` + datJSON + `          
        }
<`+ `/script> 
`;  

contenuHtml += `<script id="anon-json" type="application/json">
        {   
            ` + anonJSON + `          
        }
<`+ `/script> 
`;  


// sauvegarde des notes

 
contenuHtml +=`
    <div style="margin-bottom: 5px !important; 
	margin-bottom: 5px !important;
	margin: 40px;"
	>

    <H2 > Notes</H2>
    
        <div id="txtnotes">
        ` + notes + `
        </div>
    </div>
    `; 





//let segments = document.getElementById('segments').innerHTML // getHtml() // appelle d'une fonction d'affichage complet du html( caché )


// sauvegarde du contenu HTML principal
contenuHtml +=` <div id="contenuText"> 
     `

contenuHtml += html

contenuHtml +=` 
</div></body>`



return contenuHtml;
}

 
 
function cleanHTML(){ // fonction servant à nettoyer le html des erreurs eventuelles

    effaceSurv();
    console.log("efface surv ok");

    backUp();
    console.log("backup ok");

    const conteneur = document.getElementById('segments');
    const segs = conteneur.querySelectorAll('.lblseg');

    const fragment = document.createDocumentFragment();
    let rkMot = 1; // compteur global de mots
    let rkSeg = 0; // compteur global de segments

    for (let seg of segs) {

        // Clone du lblseg sans ses enfants
        const nvSeg = seg.cloneNode(false);
        nvSeg.removeAttribute('style');
        nvSeg.removeAttribute('id');
        nvSeg.removeAttribute('title');
        nvSeg.classList.remove('segselected');
        nvSeg.tabIndex = rkMot;      // rang du premier mot de ce segment
        nvSeg.dataset.rksg = rkSeg;

        // Traitement récursif des nœuds : aplatit les lblseg imbriqués
        const traiterNoeud = (enfant) => {

            // Nœud texte brut : on l'encapsule dans un span
            if (enfant.nodeType === Node.TEXT_NODE) {
                const texte = enfant.textContent
                    .replace(/\u00A0/g, ' ')
                    .replace(/\u202F/g, ' ')
                    .trim();
                if (!texte) return;
                const nvSpan = document.createElement('span');
                nvSpan.textContent = texte;
                nvSpan.dataset.rk = rkMot;
                nvSpan.dataset.sg = rkSeg;
                nvSeg.appendChild(nvSpan);
                rkMot++;
                return;
            }

            if (enfant.nodeType !== Node.ELEMENT_NODE) return;

            // lblseg imbriqué : on descend récursivement dans ses enfants
            if (enfant.classList.contains('lblseg')) {
                for (let sousEnfant of enfant.childNodes) {
                    traiterNoeud(sousEnfant);
                }
                return;
            }

            // Span ligloc (changement de locuteur) : on le conserve tel quel
            if (enfant.classList.contains('ligloc')) {
                nvSeg.appendChild(enfant.cloneNode(true));
                return;
            }

            // Span de mot : nettoyage + découpage en mots et espaces
            const texte = enfant.textContent
                .replace(/\u00A0/g, ' ')
                .replace(/\u202F/g, ' ');

            const parts = texte.split(/(\s+)/);

            if (parts.length === 1 && enfant.dataset.len==1) { // s'il n'y a qu'un seul mot et qu'on est en mode compression!, on le clone simplement
                const nvSpan = enfant.cloneNode(false); // clone superficiel : classes et attributs, sans enfants
                nvSpan.dataset.rk = rkMot;
                nvSpan.dataset.sg = rkSeg;
                nvSpan.textContent = texte.trim();
                nvSeg.appendChild(nvSpan);
                rkMot++;
                return;
            }

            // Copie explicite de la className (préserve les classes thématiques)
            // On exclut 'lblseg' pour éviter de créer des segments imbriqués
            const classesMot = Array.from(enfant.classList)
                .filter(c => c !== 'lblseg' && c !== 'sautlig')
                .join(' ');

            for (let part of parts) {
                if (part === '') continue;
                const nvSpan = document.createElement('span');
                nvSpan.className = classesMot;
                nvSpan.textContent = part;
                nvSpan.dataset.rk = rkMot;
                nvSpan.dataset.sg = rkSeg;
                if (enfant.dataset.obs) {
                    nvSpan.dataset.auth = enfant.dataset.auth;
                    nvSpan.dataset.obs = enfant.dataset.obs || "";
                    nvSpan.dataset.finobs = enfant.dataset.finobs || "";
                }

                if (enfant.dataset.pseudo) {
                    nvSpan.dataset.pseudo = enfant.dataset.pseudo || "";
                }
                
                nvSeg.appendChild(nvSpan);
                rkMot++;
            }
        };

        // Défilement des nœuds enfants directs du segment original
        for (let enfant of seg.childNodes) {
            traiterNoeud(enfant);
        }

        fragment.appendChild(nvSeg);
        rkSeg++;
    }

    // Remplacement du contenu en un seul reflow
    conteneur.innerHTML = '';
    conteneur.appendChild(fragment);

    checkloc(locut); // correction éventuelle des changements de locuteurs

    endWait();

}

function compactHtml(){ // fonction servant à compacter le html (notamment pour les exports en .sonal)

    console.log("compactage du html en cours...")

    const conteneur = document.getElementById("segments");
    const segs = conteneur.querySelectorAll('.lblseg');

    const fragment = document.createDocumentFragment();

    for (let seg of segs) {

        // Clone du lblseg sans ses enfants
        const nvSeg = seg.cloneNode(false);

        let spanReceveur = null;  // span en cours d'accumulation
        let texteAccumule = "";
        let lenChaine = 0;
        let classesReceveur = null;

        const enfants = Array.from(seg.childNodes);

        const flush = () => {
            if (!spanReceveur) return;
            spanReceveur.textContent += texteAccumule;
            if (lenChaine > 0) spanReceveur.dataset.len = lenChaine + 1;
            nvSeg.appendChild(spanReceveur);
            spanReceveur = null;
            texteAccumule = "";
            lenChaine = 0;
            classesReceveur = null;
        };

        for (let enfant of enfants) {

            // Nœud texte brut : on flush et on ignore (ne devrait pas arriver après cleanHTML)
            if (enfant.nodeType === Node.TEXT_NODE) {
                flush();
                continue;
            }

            if (enfant.nodeType !== Node.ELEMENT_NODE) continue;

            // Span ligloc : on flush puis on le conserve tel quel
            if (enfant.classList.contains('ligloc')) {
                flush();
                nvSeg.appendChild(enfant.cloneNode(true));
                continue;
            }

            const classesMot = Array.from(enfant.classList).sort().join(' ');

            // Nouveau groupe : classes différentes, segment différent, attribut obs ou data-pseudo
            if (!spanReceveur || classesReceveur !== classesMot || enfant.dataset.obs || enfant.dataset.pseudo) {
                flush();
                spanReceveur = enfant.cloneNode(false); // premier span du groupe
                spanReceveur.textContent = enfant.textContent;
                spanReceveur.removeAttribute('data-len');
                classesReceveur = classesMot;
            } else {
                // Même groupe : on accumule
                texteAccumule += enfant.textContent;
                lenChaine++;
            }
        }

        flush(); // dernier groupe

        fragment.appendChild(nvSeg);
    }

    // Extraction du HTML compacté sans modifier le DOM
    const tmp = document.createElement('div');
    tmp.appendChild(fragment);

    //console.log("fin du compactage");

    return tmp.innerHTML;
}    
async function SauvegarderSurDisque(textToWrite, fileNameToSaveAs, format) {

    const encoding = (format && format !== 'UTF-8') ? 'windows-1252' : 'utf8';

    const result = await window.electronAPI.saveFileDialog({
        filename: fileNameToSaveAs,
        content: textToWrite,
        encoding: encoding
    });

    if (!result.success && !result.canceled) {
        console.error('Erreur lors de la sauvegarde :', result.error);
    }

    return result;
}
    
    
    
    
    function exportWord(){
    
        // Basculement du html en tableau
        HTMLTOTABSEG()
    
    
        let txtobs = document.getElementById("txtnotes").value
         
        const doc = new docx.Document({
    
    
        sections: [
         {
        properties: {
    
    
        },
        children: [
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: nomFichText,
                bold: true
              }),
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "",
                bold: true
              }),
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "Exporté par whispurge : www.sonal-info.com/whispurge.html", 
               italics : true
              }),
         ]
          }),
    
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "", 
                
              }),
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "---", 
                
              })
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "", 
                
              })
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "Notes : " + txtobs, 
                
              })
         ]
          }),
          new docx.Paragraph({
            children: [
               
              new docx.TextRun({
                text: "---" , 
                
              })
         ]
          }),
        ]
      }
    ]
    
    });
    
      
    
    
    
    for (s=0;s<TabSeg.length;s++){
    
    // défintion du locuteur
    
    var loc = "" 
    if (locut[TabSeg[s][3]]){loc= locut[TabSeg[s][3]]}
    var changeloc = false
    if (s>0 && TabSeg[s][3]!=TabSeg[s-1][3]) {
        changeloc = true 
    }
    
    if (s==0) {changeloc = true }
    
    var italouinon=false
    // italouinon
    if (loc.indexOf("?")>-1){italouinon=true}
    loc = loc.replaceAll("?","") ;
    loc += " : ";
    
    // ajout de la position chronométrique
    let posit = TabSeg[s][1]
    if (posit) {loc += SecToTime(TabSeg[s][1],true)};
    
    // ajout du locuteur
    if (changeloc==true){
        doc.addSection({
        properties: {
                type: docx.SectionType.CONTINUOUS
                },
    
        children: [ 
        new docx.Paragraph({
            children: [
                new docx.TextRun({
                text: "",
                }),
                
            ],
            }),
            new docx.Paragraph({
            children: [
                new docx.TextRun({
                text: loc,
                italics: italouinon,
                }),
                
            ],
            }),
        ],
        })
    }
    
    // ajout du texte
    doc.addSection({
    properties: {
               type: docx.SectionType.CONTINUOUS
            },
    
      children: [ 
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: TabSeg[s][4],
              italics: italouinon,
               
            }),
          ],
        }),
      ],
    })
    
    }
    
    
    docx.Packer.toBlob(doc).then((blob) => {
    console.log(blob);
    
    let nomf = dossfichext(nomFichText);
    let nomf2 = nomf[1] + ".docx"
    
    
    saveAs(blob, nomf2);
    console.log("Document created successfully");
    });
    
    
    
    
    
    
    }
    
 
    
    async function exportSrt(){
    
    
      let nbSegs = getNbSegs();

    let rgDeb = 1;
    let rgFin = nbSegs;
    var txtSrt = "";
    var locuteur_courant;
  
    var RkSegs=0;
        for (m=rgDeb;m<=rgFin;m++){
        
            // récupération du segment
             let seg = getSeg(m);
            if (!seg) {continue;}

            RkSegs++;
            txtSrt += RkSegs + " \r\n"; // numéro du segment
                     
                let deb = seg.dataset.deb; 
                let fin = seg.dataset.fin; 

                if (deb) {txtSrt += SecToTime(deb,false).replace(".",",") + " --> " ;}
                if (fin) {txtSrt += SecToTime(fin,false).replace(".",",") + "\r\n";}
                
                    locuteur_courant = seg.dataset.loc;
                    let loc = locut[locuteur_courant].replaceAll("?","") ;
                    if (loc) {txtSrt +=  loc.trim() + ": " }

            // ajout du texte
            let texte = seg.textContent;
            if (texte) {txtSrt += texte + " \r\n \r\n";}

        }
          

     
    if (ent_cur==-1){ent_cur = await window.electronAPI.getEntCur()}

    let adrFich = tabEnt[ent_cur].rtrPath; // récupération du chemin du fichier d'origine

    let detailsf = dossfichext(adrFich)
    
    
    SauvegarderSurDisque(txtSrt,detailsf[1] + ".srt", "UTF-8")
    
    
    }

    async function exportTxtComplet(){
    // définition du nombre de mots

    let nbSegs = getNbSegs();

    let rgDeb = 1;
    let rgFin = nbSegs;

    
    if (ent_cur==-1){ent_cur = await window.electronAPI.getEntCur()}

    let adrFich = tabEnt[ent_cur].rtrPath; // récupération du chemin du fichier d'origine

    let detailsf = dossfichext(adrFich)



    let txtEnt = exportTxt(rgDeb, rgFin, true, true, true)


    SauvegarderSurDisque(txtEnt,detailsf[1] + ".txt", "UTF-8")

    }


    // fonction d'extraction du texte brut
    function exportTxt(rgDeb, rgFin, avecLoc, avecDat, avecTime){

        var txtBrut;
        txtBrut ="";    
        var locuteur_courant;
        locuteur_courant=-1; 


        for (m=rgDeb;m<=rgFin;m++){
        
            // récupération du segment
             let seg = getSeg(m);
            if (!seg) {continue;}


            if (avecLoc==true){ // ajout du locuteur

                // ajout du locuteur si changement
                if (locuteur_courant != seg.dataset.loc){
                
                    locuteur_courant = seg.dataset.loc;
                    let loc = locut[locuteur_courant].replaceAll("?","") ;
                    if (loc) {txtBrut += "\r\n \r\n" + loc.trim() + ": " }

                        if (avecTime==true) {
                            let deb = seg.dataset.deb; 
                            let fin = seg.dataset.fin; 

                            if (deb) {txtBrut += " [" +  SecToTime(deb,true) + "]" ;}
                            //if (fin) {txtBrut += SecToTime(fin,true) + " ";}
                        }
                    txtBrut += "\r\n";
                }
            }



            // ajout du texte
            let texte = seg.textContent;
            if (texte) {txtBrut += texte + " ";}

        }
    
        console.log(txtBrut);
        return txtBrut;

    }
    





//////////////////////////////////////////////////////////////////////////////////////////////
// RECHERCHER/REMPLACER
//////////////////////////////////////////////////////////////////////////////////////////////

var rgCherche = 0;
var tabTrv = []

function rechercher() { // fonction de recherche de texte dans les segments de la fenêtre d'édition
 
    console.log("lancement d'une recherche depuis? ")

    let chaine = document.getElementById("txtRech").value.trim();

    chaine = chaine.toLowerCase(); 
    if (!chaine) {
        alert("Veuillez saisir une chaîne à rechercher.");
        return;
    }

    const conteneur=document.getElementById("segments");
    

    tabTrv = []; // Réinitialise le tableau des mots trouvés

    // 1 trouver les segments contenant la chaîne recherchée
    const segments = conteneur.querySelectorAll('.lblseg'); // Sélectionne tous les segments        
    
    segments.forEach((segment, index) => { // Pour chaque segment
            let segmentText = segment.innerText.toLowerCase(); // Vérifie le texte du segment en minuscules
            
            
            if (segmentText.includes(chaine)) { // Si le segment contient la chaîne recherchée
                            
         

                let mots = segment.querySelectorAll('span'); // Sélectionne tous les spans dans le segment

                mots.forEach(mot => {

                    mot.classList.remove('highlight');

                    let tabMts = chaine.split(" "); // Sépare la chaîne en mots

                    for(m2=0; m2<tabMts.length; m2++) { // Pour chaque mot de la chaîne

                        if (mot.textContent.trim().toLowerCase().includes(tabMts[m2])) {
                            mot.classList.add('highlight');

                            if (m2==0){tabTrv.push(mot);}
                        }
                    }

                });
            };
        });
           

                    document.getElementById("lblResultRech").innerText = (rgCherche+1) + "/" +  tabTrv.length ; 
                    // scroll vers le premier mot trouvé

                        if (tabTrv.length > 0) {
                        motTrv = tabTrv[rgCherche]; // On prend le rang du premier mot trouvé
                        conteneur.scrollTop = motTrv.offsetTop - conteneur.offsetTop; // Fait défiler le conteneur pour afficher le segment

                        document.getElementById("resultRech").classList.remove("dnone"); 
                        document.getElementById("btnSuppRech").classList.remove("dnone"); 

                        } else {
                            alert("Aucun mot trouvé.");
                        }
                    
        

}




function suivant() { // fonction de recherche de texte dans les segments (suivant)

    const conteneur=document.getElementById("segments");
    
    
    
    if (rgCherche < tabTrv.length - 1) {
        rgCherche++;
    } else {
        rgCherche = 0; // Recommence au début si on atteint la fin
    }

    let motTrv = tabTrv[rgCherche];

    if (motTrv) {
        deselRech()
        document.getElementById("lblResultRech").innerText = (rgCherche+1) + "/" +  tabTrv.length ; 
        motTrv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        motTrv.classList.add('contour');  
    }
}

function précédent() { // fonction de recherche de texte dans les segments (suivant)

    const conteneur=document.getElementById("segments");
    
      
    if (rgCherche > 0) {
        rgCherche--;
    } else {
        rgCherche = tabTrv.length - 1; // Recommence au début si on atteint la fin
    }

    let motTrv = tabTrv[rgCherche];
    
    if (motTrv) {
        deselRech()
        document.getElementById("lblResultRech").innerText = (rgCherche+1) + "/" +  tabTrv.length ; 
        motTrv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        motTrv.classList.add('contour'); 
         
    }
}

function deselRech() { // fonction de désélection des mots trouvés
         
    tabTrv.forEach(mot => {
     
        mot.classList.remove('contour');
    });

    
}

function annulRech() { // fonction de désélection des mots trouvés
    const conteneur=document.getElementById("segments");
    
    tabTrv.forEach(mot => {
        mot.classList.remove('highlight');
        mot.classList.remove('contour');
    });

    tabTrv = []; // Réinitialise le tableau de travail
    rgCherche = 0; // Réinitialise le rang de recherche
    if (document.getElementById("lblResultRech")) {document.getElementById("lblResultRech").innerText = "0/0";} // Réinitialise l'affichage du résultat de recherche
    if (document.getElementById("txtRech")) {document.getElementById("txtRech").value = "";} // Réinitialise le champ de recherche
    if (document.getElementById("txtRemp")) {document.getElementById("txtRemp").value = "";} // Réinitialise le champ de remplacement
    if (document.getElementById("resultRech")) {document.getElementById("resultRech").classList.add("dnone");}
   // if (document.getElementById("btnSuppRech")) {document.getElementById("btnSuppRech").classList.add("dnone");}

    // fenêtre de corpus 
    if (document.getElementById("rechinfo")) {document.getElementById("rechinfo").innerText = "";} // Réinitialise les résultats de recherche dans la fenêtre de corpus
    const occRech = document.querySelectorAll('.occurence-canvas');
    occRech.forEach(occ => {
        occ.remove();
    });
}

function remplacer() { // fonction de remplacement de texte dans les segments

    backUp(); // Sauvegarde l'état actuel avant de remplacer

    let chaine = document.getElementById("txtRech").value.trim().toLowerCase();
    let remp = document.getElementById("txtRemp").value;

    if (!chaine) {
        alert("Rien à rechercher.");
        return;
    }


    const mot = tabTrv[rgCherche]; // Prend le mot courant dans le tableau des mots trouvés

    if (!mot) {
        alert("Aucun mot trouvé à remplacer.");
        return;
    }



    let rgmot = Number(mot.dataset.rk); // Récupère le rang du mot  

    let tabMtsRech = chaine.split(" "); // Sépare la chaîne en mots
    let tabMtsRemp = remp.split(" "); // Sépare la chaîne en mots

                    for(m2=0; m2<tabMtsRech.length; m2++) { // Pour chaque mot de la chaîne

                        const ssmot = getSpan(Number(rgmot+m2))// Texte du mot en minuscules

                        
                        if (ssmot){
                         
                            if (ssmot.textContent.trim().toLowerCase().includes(tabMtsRech[m2])) {
                          
                                let motremp = tabMtsRemp[m2] || ""; // Si le mot de remplacement est vide, on le remplace par une chaîne vide
                                ssmot.innerHTML = ssmot.innerHTML.replace(new RegExp(ssmot.textContent.trim(), 'g'), motremp);
                            }
                        }
    }


 
        if (mot.textContent.includes(chaine)) {
            mot.innerHTML = mot.innerHTML.replace(new RegExp(chaine, 'g'), remp);
            mot.classList.remove('highlight'); // Retire la classe highlight après le remplacement
            mot.classList.remove('contour');
        }
  

        suivant()
    //annulRech(); // Réinitialise la recherche après le remplacement
}

function remplacerTout() { // fonction de remplacement de texte dans les segments (tout)
    backUp(); // Sauvegarde l'état actuel avant de remplacer

    let chaine = document.getElementById("txtRech").value.trim();
    let remp = document.getElementById("txtRemp").value;

    if (!chaine) {
        alert("Rien à rechercher.");
        return;
    }

    const conteneur = document.getElementById("segments");
    const segments = conteneur.querySelectorAll('.lblseg'); // Sélectionne tous les segments

    let nbMatchs =0
    segments.forEach(segment => { // Pour chaque segment
        let segmentText = segment.innerText.toLowerCase(); // Vérifie le texte du segment en minuscules
        
        if (segmentText.includes(chaine.toLowerCase())) { // Si le segment contient la chaîne recherchée
            
            segment.innerText = segment.innerText.replace(new RegExp(chaine, 'gi'), remp); // Remplace la chaîne dans le segment
            nbMatchs++; 
        }
    });

    //cleanHTML()

    alert(nbMatchs + " remplacement(s) effectué(s) dans tout le document")
    //annulRech(); // Réinitialise la recherche après le remplacement
}



    /////////////////////////////////////////////////////////////////////////////////:
    // EXPORTATION DES FONCTIONS
    /////////////////////////////////////////////////////////////////////////////////
    // Export CommonJS pour utilisation dans main.js (contexte Node.js)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            sauvHtml
        };
    }
    
    // Export global pour utilisation dans le renderer (contexte navigateur)
    if (typeof window !== 'undefined') {
        window.sauvHtml = sauvHtml;
    }