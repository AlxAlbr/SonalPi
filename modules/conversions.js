 

   async function convertJSON(lignesFich) { // conversion de l'objet JSON en tableau
    
        var nbseg = lignesFich.length ;
        let tabSeg = new Array(nbseg);
    
        for (s=0;s<nbseg;s++){
            tabSeg[s]=  new Array(6);
        }
      
        
        for (s=0;s<nbseg;s++){


            tabSeg[s][1]= lignesFich[s].start.toFixed(2) ;
            tabSeg[s][2]= lignesFich[s].end.toFixed(2);
            tabSeg[s][3]= ""; // locuteur
            tabSeg[s][4]= lignesFich[s].text;
            tabSeg[s][5]= false ; // non sélectionné par défaut
            tabSeg[s][6]= lignesFich[s].avg_logprob


        }

        // récupération des locuteurs
        const postLocut = await convertSpeaker(tabSeg);
        tabSeg = postLocut.tabSeg;
        locut = postLocut.locut;

        //console.log ("importation du fichier JSON \tabseg = ", tabSeg, "\n locut = ", locut);
        return { tabSeg, locut } ;


    };
    
    async function convertSRT(content) { // conversion du fichier SRT en tableau
        
        if (!content || content.length<1) {console.log("pas de contenu"); return;}

        // split du texte par lignes \n
        let lignesFich = content.split("\n");
        var nblig = lignesFich.length  ;       
        var locut = [""];

        let rgSeg=0;
        tabSeg = new Array (1);
        tabSeg[rgSeg]=  new Array(6);


        for (s=0;s<nblig;s++){
             
            let ligne = lignesFich[s].trim()     
            
            let posflèche= ligne.lastIndexOf("-->") // recherche d'un indicateur de coordonnées
    
            if (posflèche>-1) { // ajout d'un segment

                tabSeg.push();
                rgSeg++;

                tabSeg[rgSeg]=  new Array(6);

                let tps = ligne.split("-->") 
                let deb = TimeToSec(tps[0])
                let fin = TimeToSec(tps[1])

                tabSeg[rgSeg][1]= deb  ;
                tabSeg[rgSeg][2]= fin;
                tabSeg[rgSeg][3]= ""; // locuteur
                tabSeg[rgSeg][4]= "" //
                tabSeg[rgSeg][5]= false ; // non sélectionné par défaut
                tabSeg[rgSeg][6]= 0;

            } else {
            
                if (ligne=="" || isNaN(ligne)==false) { // évitement des numéros de sous-titre et sauts de ligne
    
                    if (s<nblig-1) {
    
                        if (lignesFich[s+1].lastIndexOf("-->") > -1){ continue;}               
                    
                    }
    
                 
                }
    
                let lignetxt = ligne.replace(/\r?\n|\r/,"") // retrait des sauts de ligne 
                tabSeg[rgSeg][4]+= lignetxt // ajout du texte au segment courant

            }

        }
    


    

            //"trimage" des portions de texte
            for (s=0;s<tabSeg.length;s++){
                if (!tabSeg[s][4] || tabSeg[s][4].trim() === ""){continue}
                let txttrim = tabSeg[s][4].trim();
                tabSeg[s][4]= txttrim + " " // ajout d'un espace final pour séparation entre segments;

            }
             

            // suppression du rang 0
            tabSeg.splice(0,1)

 

            // récupération des locuteurs
            const postLocut = await convertSpeaker(tabSeg);
            tabSeg = postLocut.tabSeg;
            locut = postLocut.locut;

            //console.log ("importation du fichier Srt \tabseg = ", tabSeg, "\n locut = ", locut);

            let formatSonal = tabSegToSonal (tabSeg,locut)

            //console.log("format sonal = \n", formatSonal);
            return {formatSonal};
}

   
    
function convertPURGE(content) { // converstion d'un fichier PURGE en tabseg

    if (!content || content.length<1) {console.log("pas de contenu"); return;}

    // split du texte par lignes \n
        lignesFich = content.split("\n");
        var nblig = lignesFich.length  ;       
         
        //récupération des locuteurs (première ligne)
        let locut =  lignesFich[0].split("\t") ;
       
            
        // récupération du segment courant (seconde ligne)
        let lig = lignesFich[1].split("\t") ;
        seg_cur=lig[1]
        //seg_lu=lig[1]
    
        // récupération de la vitesse de lecture (troisième ligne)
        lig = lignesFich[2].split("\t") ;
         
    
    
        // récupération des notes
    
 
        let debutSegments=0 ;
        let debutMemo=0;
        let notes = "";
    
        for (s=3;s<nblig;s++){
             
            
             
            if (lignesFich[s].substr(0,6) == "Memo :") {debutMemo=s+1}
            if (lignesFich[s].substr(0,9) == "Début\tFin") {debutSegments=(s+1);break;}
            
            if (s>=debutMemo){notes= notes + lignesFich[s] + " \r\n";} //ajout de la ligne aux notes
    
        }
    
    
        
    
    
        
        // suppression des premières lignes puis importation des segments en masse
        lignesFich.splice(0,debutSegments);
    
        var nbseg = lignesFich.length  ;
        tabSeg = new Array(nbseg);

        for (s=0;s<nbseg;s++){
            tabSeg[s]=  new Array(6);
        }
      
        
        for (s=0;s<nbseg;s++){
            
            cases = lignesFich[s].split("\t") 
            tabSeg[s][1]= cases[0]  ;
            tabSeg[s][2]= cases[1];
            tabSeg[s][3]= cases[2]; // locuteur
            tabSeg[s][4]= cases[3] //
            tabSeg[s][5]= false ; // non sélectionné par défaut
            tabSeg[s][6]= 0;

            
        }
    
       let formatSonal = tabSegToSonal (tabSeg,locut, notes)

             console.log("format sonal = \n", formatSonal);
            return {formatSonal};
         
    };
    
async function convertTXT(lignesFich) { // conversion du fichier TXT en tableau
        
        // split du texte par lignes \n
        lignesFich = content.split("\n");
        var nblig = lignesFich.length  ;       
        var locut = [""] // locut[0] n'existe pas
        let rgSeg=0;
        tabSeg = new Array (1);
        tabSeg[rgSeg]=  new Array(6);   
        for (s=0;s<nblig;s++){
             
            let ligne = lignesFich[s].trim()
            if (ligne.length<1) {continue} // ligne vide
    
            // il n'y a que le texte à récupérer
            tabSeg[rgSeg][4] = ligne // texte
            
        }

        // recherche des locuteurs (sait-on jamais)
        const postLocut = await convertSpeaker(tabSeg);
            tabSeg = postLocut.tabSeg;
            locut = postLocut.locut;
    

       let formatSonal = tabSegToSonal (tabSeg,locut); 

            //console.log("format sonal = \n", formatSonal);
            return {formatSonal};

    }


async function importSONAL(content) { // importation d'un fichier SONAL (html) --> permet de vérifier l'ajustement des thématiques et des variables au corpus avant importation

 


    let fichierSonal = extractFichierSonal(content);

    await fusionTabThm(fichierSonal.tabThm);
    await fusionTabVar(fichierSonal.tabVar, fichierSonal.tabDic, fichierSonal.tabDat);
    await fusionTabAnon(fichierSonal.tabAnon);

    window.tabLocImport = fichierSonal.tabLoc; // stockage temporaire dans le window global
    console.log("--> locteurs " + JSON.stringify(fichierSonal.tabLoc));
    window.tabAnonImport = fichierSonal.tabAnon; // stockage temporaire dans le window global
    console.log("--> anonymisations " + JSON.stringify(fichierSonal.tabAnon));
    
    // stockage du tabloc importé pour l'ajout d'entretien (centralisé via main)
    //if (window && window.electronAPI && typeof window.electronAPI.setTabLoc === 'function') {
    //    await window.electronAPI.setTabLoc(fichierSonal.tabLoc);
    //} else {
    //    window.tabLocImport = fichierSonal.tabLoc; // fallback
    //}

 
 
    let formatSonal = String(content);

    return {formatSonal};

    //return fichierSonal;

}


async function fusionTabThm(tabThmFich) { // mise à jour du tabThm à partir d'un fichier sonal importé

    if (!tabThmFich || tabThmFich.length<1) {return}

    // récupération du tabThm courant
    let tabThm =   await window.electronAPI.getThm();
    let situation = "ras"; 
    
    tabThmFich.forEach(thm => {

             console.log("code dans le corpus :", thm.nom, thm.code);
        if (tabThm.some(t => t.nom === thm.nom && t.code === thm.code)) {
            thm.nvcode = "ok"; // Pas de changement
            console.log("thématique inchangée :", thm.nom);
        }
        else if (tabThm.some(t => t.nom != thm.nom && t.code === thm.code)) {
            // Trouver le code existant correspondant au nom
            const tTrouve = tabThm.find(t => t.code !== thm.code && t.nom === thm.nom);
            if (tTrouve) {
                thm.nvcode = tTrouve.code; // Ajoute le code trouvé dans la ligne du thm
                console.log(`Mise à jour du code pour la thématique ${thm.nom} : ${thm.code} -> ${tTrouve.code}`);
            }
        } else  if (!tabThm.some(t => t.nom === thm.nom && t.code === thm.code)) {
            thm.nvcode = "ajouter";
            situation = "ajout";
            tabThm.push(thm)
            console.log("nouvelle thématique ajoutée :", thm.nom);

        }

    });

    console.log("situation de mise à jour du tabThm :", situation);

    //mise à jour du tabThm si nécessaire
    if (situation ="ajout") {
        console.log("mise à jour du tabThm avec ajouts");
        let envoi = await window.electronAPI.setThm(tabThm);
        let affichage = await affichListThmCrp(tabThm); 
    }
    return;



}


async function fusionTabVar(tabVarFich, tabDicFich, tabDatFich) { // mise à jour du tabVar à partir d'un fichier sonal importé

    if (!tabVarFich || tabVarFich.length<1) {return}

    // récupération du tabVar courant
    let tabVar = await window.electronAPI.getVar();
    let situation = "ras"; 

    tabVarFich.forEach(vari => {

        console.log("variable dans le corpus :", vari.v, vari.lib);

        if (tabVar.some(v => v.v === vari.v && v.lib === vari.lib)) {
            vari.nvcode = "ok"; // Pas de changement
            console.log("variable inchangée :", vari.v);
        }

        else if (tabVar.some(v => v.v != vari.v && v.lib === vari.lib)) {

            // Trouver le code existant correspondant au nom
            const vTrouve = tabVar.find(v => v.lib === vari.lib && v.v !== vari.v);
            if (vTrouve) {
                vari.nvcode = vTrouve.lib; // Ajoute le code trouvé dans la ligne de la variable
                console.log(`Mise à jour du code pour la variable ${vari.v} : ${vari.lib} -> ${vTrouve.lib}`);

                // remplacement avec le nouveau code dans le tabDicFich
                tabDicFich.forEach(dic => {
                    if (dic.v === vari.v) {
                        dic.v = vTrouve.v;
                    }
                });

                // même chose pour le tabDatFich
                tabDatFich.forEach(dat => {
                    if (dat.v === vari.v) {
                        dat.v = vTrouve.v;
                    }
                });


            }

        } else  if (!tabVar.some(v => v.v === vari.v && v.lib === vari.lib)) {
            vari.nvcode = "ajouter";
            situation = "ajout";
            tabVar.push(vari)
            console.log("nouvelle variable ajoutée :", vari.v);

        }

    });


    console.log("situation de mise à jour du tabVar :", situation);

    //mise à jour du tabVar si nécessaire
    if (situation ="ajout") {
        console.log("mise à jour du tabVar avec ajouts");
        let envoi = await window.electronAPI.setVar(tabVar);
       
    }
    return;
}

async function fusionTabAnon(tabAnonFich) { // mise à jour du tabAnon à partir d'un fichier sonal importé

    return; // plus tard

    if (!tabAnonFich || tabAnonFich.length<1) {return}

    // récupération du tabAnon courant
    let tabAnon = window.tabAnonImport || []; // fallback si non disponible via preload

    tabAnonFich.forEach(anon => {

        console.log("anonymisation dans le corpus :", anon.type, anon.valeur);

        if (!window.tabAnon.some(a => a.type === anon.type && a.valeur === anon.valeur)) {
            window.tabAnon.push(anon)
            console.log("nouvelle anonymisation ajoutée :", anon.type, anon.valeur);
        }

    });

    // mise à jour du tabAnon si nécessaire
    window.tabAnonImport = tabAnon; // stockage dans le window global pour récupération ultérieure

}


function extractFichierSonal(htmlString) {  

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');


    function extractJSON(id) { // nettoyage et parsing d'un bloc JSON dans le HTML
            const regex = new RegExp(
                `<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`,
                'i'
            );
            const match = htmlString.match(regex);
            if (match) {
                let content = '';
                try {
                    // Nettoyage  
                    content = match[1]
                        .replace(/\s+/g, ' ')           // Normaliser les espaces
                        .replace(/,\s*,+/g, ',')        // Supprimer virgules multiples
                        .replace(/^\s*,+\s*/, '')       // Retirer virgules au début
                        .replace(/\s*,+\s*$/, '')       // Retirer virgules à la fin
                        .replace(/{\s*,+\s*/, '{')      // Retirer virgules après {
                        .replace(/,+\s*}/g, '}')        // Retirer virgules avant }
                        .replace(/\[\s*,+\s*/, '[')     // Retirer virgules après [
                        .replace(/,+\s*\]/g, ']')       // Retirer virgules avant ]
                        .trim();

                    // Supprimer les '}' terminaux en excès (accolades fermantes orphelines)
                    (function removeOrphanClosingBraces() {
                        const countOpen = s => (s.match(/{/g) || []).length;
                        const countClose = s => (s.match(/}/g) || []).length;
                        // Tant que le nombre de '}' est supérieur au nombre de '{', on enlève la dernière '}'
                        while (countClose(content) > countOpen(content)) {
                            content = content.replace(/}\s*$/, '');
                        }
                    })();

                    // Retirer les accolades externes si elles encadrent un tableau/objet
                    if (content.startsWith('{') && content.endsWith('}')) {
                        let inner = content.slice(1, -1).trim();
                        
                        // Si le contenu interne est un tableau ou objet valide
                        if (inner.startsWith('[') || inner.startsWith('{')) {
                            content = inner;
                        }
                    }

                
                    return JSON.parse(content);

                } catch (e) {
                    console.error(`Erreur parsing ${id}:`, e);
                    console.log('Contenu complet qui a échoué:', content);
                    return null;
                }
            }
            return null;
        }
    
    const tabLoc = extractJSON('loc-json');
    const tabThm = extractJSON('cat-json');
    const tabVar = extractJSON('var-json');
    const tabDic = extractJSON('dic-json');
    const tabDat = extractJSON('dat-json');
    const tabAnon = extractJSON('anon-json');
    
     

    const notes = doc.getElementById('txtnotes')?.innerHTML.trim() || '';
    const html = doc.getElementById('contenuText')?.innerHTML.trim() || '';
    
    return { tabLoc, tabThm, tabVar, tabDic, tabDat,  notes, html, tabAnon };
}

function Phrasifier(tabSeg){ // petite fonction visant à regrouper les segments en phrases

    var nbseg = tabSeg.length ;
    const finPhrase = new Set(['.', '?', '!'])
    var asquizzer = [];

        function fusionSegs(seg){

            tabSeg[seg][4] = tabSeg[seg][4] + tabSeg[seg+1][4]; // fusion des textes
            tabSeg[seg][2] = tabSeg[seg+1][2];

            tabSeg.splice(seg+1,1);
        

        }
    
    for (s=0;s<tabSeg.length- 1;s++){

        const str = tabSeg[s][4];
        var endtxt = str.slice((str.length-1));
        const estFin = finPhrase.has(endtxt) ;

        if (estFin==false) {
            //concaténation des séquences 

            fusionSegs(s)
            s --;
        }

        
    }

    affSegments(0)

}

async function convertSpeaker(tabSeg) { // fonction permettant de récupérer les "speakers n" dans le srt et de créer un tableau de locuteurs

    let rgmax = 0;
    let locutTemp=[""] // locut[0] n'existe pas

    for (s = 0; s< tabSeg.length;s++){

        let txt = tabSeg[s][4]

        let spk = txt.indexOf("Speaker ") // recherche d'un speaker

        if (spk == 0) { // récupération du rang

            let rg = txt.substr(8,1)
            rg = Number(rg)

            tabSeg[s][3] = rg +1  //affectation du locuteur
            if (rgmax < rg+1) {
                rgmax = rg+1 
                locutTemp.push("Speaker " + (rg+1))
                }; // mémorisation du speaker le plus élevé atteint
 
            //suppression du préfixe "speaker"
            tabSeg[s][4] = txt.substr(11)
            
        } 

        //suppression des "speaker 0 etc.", qui apparaissent de manière intempestive dans le corps du texte
        // on ne garde que ceux qui figurent au début des segments
        for (i=0;i<10;i++){
            tabSeg[s][4] = tabSeg[s][4].replaceAll("Speaker " + i + ":","")
        }     
 
    };
    console.log("locuteurs identifiés dans convert speakers: ", locutTemp);
    // stocker dans le main via preload API si disponible
    if (window && window.electronAPI && typeof window.electronAPI.setTabLoc === 'function') {
        try {
            await window.electronAPI.setTabLoc(locutTemp);
        } catch (err) {
            console.error('Erreur setTabLoc:', err);
            // fallback to window global
            window.tabLocImport = locutTemp;
        }
    } else {
        window.tabLocImport = locutTemp; // fallback
    }

    return {tabSeg, locutTemp}
 


}

function tabSegToSonal(tabSeg,locut,notes){

let html =`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fichier Whispurge</title>
   <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet"  type="text/css">  
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous"> 
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
</head>
    
<body>` 

console.log ("génération du sonal avec tabloc = ", locut);
// ajour éventuel des locuteurs
if (locut && locut.length>1){

    const locJSON = JSON.stringify(locut, null);

    html += `<script id="loc-json" type="application/json">
        
            ` + locJSON + `         
        
        </script> 
        `;
}


html += `<div id="contenuText"> 
`
 
    var rkMax=1;
    var sgMax=1; 

    for (s=0;s<tabSeg.length;s++){

        html += `<span class="lblseg sautlig" 
        data-deb="${tabSeg[s][1]}" 
        data-fin="${tabSeg[s][2]}" 
        data-loc="${tabSeg[s][3]}"
        tabindex="${rkMax}" 
        data-rksg="${sgMax}"
        >`
        
        // création des spans internes
        if (!tabSeg[s][4]){continue}

        // Regex qui capture chaque mot, ponctuation et espace séparément
        var texte = tabSeg[s][4];
        const elements = texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g);

        let chaine = "";

        for (const elem of elements) {
        chaine += `<span data-rk="${rkMax}" data-sg="${sgMax}">${elem}</span>`;
        rkMax++;
        }
        
        html += chaine + `</span>`

        sgMax++;
    }

    html += `</div>
    </body>
    </html>`
     
    html=String(html);

    return html;

}


    function HTMLTOTABSEG(){ // reconstitue un tableau de données (pour exports notamment ) depuis le HTML
        
        let rgSeg=0;
        tabSeg = new Array (1);
        tabSeg[rgSeg]=  new Array(6);



        const tousSeg = document.querySelectorAll('.lblseg'); // document.getElementsByClassName("survseg")
            
            tousSeg.forEach((segment,index) => {

                tabSeg.push();
                tabSeg.push();
                rgSeg++;

                tabSeg[rgSeg]=  new Array(6);

                tabSeg[rgSeg][1]= segment.dataset.deb  ;
                tabSeg[rgSeg][2]= segment.dataset.fin;
                tabSeg[rgSeg][3]= segment.dataset.loc // locuteur

                tabSeg[rgSeg][4]= getSegContent(rgSeg-1)

                tabSeg[rgSeg][5]= false ; // non sélectionné par défaut
                tabSeg[rgSeg][6]= 0; 


            });
    tabSeg.splice(0,1);

    return tabSeg;

    }
    

    /////////////////////////////////////////////////////////////////////////////////:
    // EXPORTATION DES FONCTIONS
    /////////////////////////////////////////////////////////////////////////////////
    // Export CommonJS pour utilisation dans main.js (contexte Node.js)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            convertSRT,
            convertJSON,
            convertPURGE,
            importSONAL,
            extractFichierSonal,
            convertTXT,
            Phrasifier,
            HTMLTOTABSEG
        };
    }
    
    // Export global pour utilisation dans le renderer (contexte navigateur)
    if (typeof window !== 'undefined') {
        
        window.convertSRT = convertSRT;
        window.convertJSON = convertJSON;
        window.convertPURGE = convertPURGE;
        window.convertTXT = convertTXT;
        window.Phrasifier = Phrasifier;
        window.HTMLTOTABSEG = HTMLTOTABSEG;
        window.importSONAL = importSONAL;
        window.extractFichierSonal = extractFichierSonal;

    }
    