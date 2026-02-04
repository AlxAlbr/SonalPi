////////////////////////////////////////////////////////////////////////
// GESTION DES LOCUTEURS 
////////////////////////////////////////////////////////////////////////





// tableau des locuteurs 

var  locut = ['','Question?','Réponse','Réponse 2'];



async function chargeLocut(){

    

    locut =  await window.electronAPI.getTabLoc()    ;


    var divloc = document.getElementById('locuteurs');

    divloc.innerHTML="";

    let txthtml = "";

    for (loc=1;loc < locut.length;loc++){
        
        if (locut[loc]!="") {

        txthtml += `<div>
            <label id = "btnloc` + loc + `" class="btnfonction btnloc btnlarge"  onclick= "selLoc(`+ loc +`); affectLoc(`+ loc +`)" type="button" ;  >` + locut[loc]+ `</label>
            <input type="text" class="txtloc dnone" id=txtloc`+ loc + `  value="`+ locut[loc] + `" onfocus="this.setSelectionRange(0, this.value.length);dsTxtArea=false;dsTxtAutre=true" onfocusout="dsTxtAutre=false"  onkeydown="if(event.key==='Enter'){validLocut()}" >
            
            </div>`
        }    

    }

    txthtml += `<label  id = "btnLocPlus" class = "btnfonction btnpetit dnone" style = "position:relative; float:right; padding:5px; margin:3px" onclick="ajoutLocut()"> + </label>`
    //txthtml += `<label id= "btnedit" class = "btnfonction btnpetit" style = "position:relative; float:right; margin-top:5px" onclick="modifLocut()"> ... </label>`
 
    txthtml += `<label id= "btnvalidloc" class = "btnfonction btnlarge dnone" style = "position:relative;margin-top:15px" onclick="validLocut()"> Valider locut.</label>`

    // <button id="BtnEditM" class="btn btn-outline-secondary imgbtn imgpen " onclick="";   type="button" style ="float:right;margin:5px; "></button></div>

    //txthtml += `<br><button id = "btnloc` + loc + ` " class="btn btn-secondary btn-sm "  onclick= "affectloc(`+ loc +`)" type="button" style="height:35px;min-width:280px;margin-top:5px;";  > Ajouter/modifier </button> <br>` 

    divloc.innerHTML = txthtml
    
 
     
}
async function ajoutLocut(){

    locut.push("Nouveau (" + locut.length + ")");
    console.log("ajout locuteur " + locut );
    
    await electronAPI.setTabLoc(locut);
    chargeLocut()

        setTimeout( function() {
        modifLocut();
        
    }, 100);

    

}

function modifLocut(){

    const collection = document.querySelectorAll('.btnloc');

    collection.forEach(btnloc => {
    btnloc.classList.add('dnone');
    });

   const collection2 = document.querySelectorAll('.txtloc');

    collection2.forEach(btnloc => {
    btnloc.classList.remove('dnone');
    });

    

    btn = document.getElementById("btnvalidloc");
    btn.classList.remove('dnone');

    var btn = document.getElementById("btnLocPlus");
    btn.classList.remove('dnone');

}

async function validLocut(){

    
    const collection2 = document.querySelectorAll('.txtloc');

    collection2.forEach(function(txtloc, index) {
    
    let txt =txtloc.value;
 
    
    if (locut[index] != txt  ) { // si locuteur a été changé

       if (txt.trim() !="") {
        locut[index+1] = txt
       } else {
        locut.splice(index+1,1)
       }

    };

        
    });

    await electronAPI.setTabLoc(locut);
    tabLocut = locut;
    chargeLocut();
    màjLoc();
    //affSegments(0);

}

function màjLoc(){
     

    
    const collection2 = document.querySelectorAll('.lblseg');

    collection2.forEach(function(seg, index) {

    let loc =seg.dataset.loc;
         
    if (seg.dataset.nomloc) {
    
        if (locut[loc]) {
        seg.dataset.nomloc = locut[loc].replaceAll("?","")
        }

    }

    //ligloc.innerText = locutaff;


    
});

mefQuestions();

    
}


function selLoc(loc){

    //const collection = document.getElementsByClassName(".btnloc");
    const collection = document.querySelectorAll('.btnloc');

    collection.forEach(btnloc => {
    btnloc.classList.remove('isselloc');
    });

    

    let nombtn = String("btnloc" +loc); 
    var element = document.getElementById(nombtn);
    element.classList.add('isselloc');

    

    //$(nombtn).addClass('btncoché');
    
    

    

}

function affectLoc(loc) {
  
    backUp();

    // comportement en cas de sélection active dans le document 
    if (debSel>0 && finSel>0){
        var split = true;  
        SplitSeg(debSel,finSel)
         

    }

    //console.log("affectation du locuteur " + loc + "au segment " + seg_cur)


    // modification du loc associé au segment courant
    const seg = getSeg(seg_cur)
    if (!seg) {return}

    seg.dataset.loc = loc;

    checkloc(locut);
    mefQuestions()
    seg_cur++;
    selSegment(seg_cur);
    return;



    seg.classList.add('ligloc')

    //console.log ("locuteur affecté")

    

    // effacement d'un éventuel locuteur avant

    //console.log ("recherche d'un locuteur avant")
    

    /*
    var lgn = getLigLoc(seg_cur); 

    if (lgn) {
               
        lgn.remove();
        
        //console.log("locuteur avant trouvé et supprimé")
    } else {//console.log("pas de locuteur avant")
        }
     
 */

      // si le segment précédent est d'un autre locuteur
    let rgSegPrec = Number(seg_cur-1)

   

    let locprec="X";
    
    if (rgSegPrec>-1) {
    
        var segprec =  getSeg(rgSegPrec);
    
        if (segprec){locprec = segprec.dataset.loc};

        } 
     
    //console.log ("locuteur du segment actuel : " + loc + " / locuteur du segment précédent : " + locprec) 

    seg.removeAttribute("data-nomloc");

    //let conteneur = document.getElementById("fondseg")
    if (loc != locprec && loc != "" ) {    
    
    seg.dataset.nomloc = locut[loc].replaceAll("?","");


    //console.log ("création d'une nouvelle ligne de locuteur dans le segment courant") 
/*
    const newElement = document.createElement('h4');
    newElement.innerHTML = locut[loc]  + `<label class="close closeloc" onclick="supprLigLoc('lgnLoc_`+ seg_cur + `')">×</label>`;
    newElement.id = "lgnLoc_" + seg_cur;      
    newElement.classList.add ("ligloc");
    newElement.dataset.rk = seg_cur;
    newElement.dataset.loc = loc;
    newElement.dataset.ajout = "ajout avant au changement de loc";
    newElement.contentEditable=false;

        // > ajout de la nouvelle ligne de locuteur
        seg.dataset.loc = loc;
        
        seg.prepend(newElement);
        

        */
    }    


    

    // ajout du changement de locuteur dans le span suivant
    let rgplus = Number(seg_cur)+1; 
    const segSuiv = getSeg(rgplus)

    if (segSuiv) {

        let nextloc =  segSuiv.dataset.loc;
        segSuiv.dataset.nomloc = ""; 
        
        segSuiv.removeAttribute("data-nomloc");
        
        if (nextloc != loc ) {

            segSuiv.dataset.nomloc = locut[nextloc].replaceAll("?","");

        }

        /*
        let lgn2 = getLigLoc(segSuiv.dataset.rksg)

        
        let nomlignesuiv= "lgnLoc_"+ segSuiv.dataset.rksg;
        var lgn2 = document.getElementById(nomlignesuiv); 
        
       
        if (lgn2) {
        
               
            lgn2.remove();
            
            console.log("locuteur après trouvé et supprimé")
        } else {console.log("pas de locuteur après")}






        
        let premspan = segSuiv.firstElementChild;
        let estLoc = premspan.classList.contains("ligloc");

        console.log( "prochain loc :" + nextloc + " est loc :" + estLoc);


        if (estLoc==true){
   
            if (nextloc == loc) {

                premspan.remove();
                 

            }
        }
 


        if (nextloc != loc ) {

            let rksuiv = Number(seg_cur)+1;
            const newElement = document.createElement('h4');
            newElement.innerHTML = locut[nextloc];
            newElement.id = "lgnLoc_" + rksuiv;      
            newElement.classList.add ("ligloc");
            newElement.dataset.rk = rksuiv;
            newElement.dataset.loc = nextloc;
            newElement.contentEditable=false;
            newElement.dataset.ajout = "ajout après au changement de loc";
        
                // > ajout de la ligne de locuteur en dessous
                // sélection du prochain élément

                segSuiv.prepend(newElement);
                segSuiv.dataset.loc = nextloc;            
            
                
        } 


 */   


    }



    //target.parentNode.insertBefore(newElement, target); 

    // si le segment précédent est de la même thématique
        // Effacement de l'ancienne ligne de locuteur

    
    //TabSeg[seg_cur][3]= loc;
    //compactSegs()
    //affSegments(0)

    


}



 

// fonction permettant de mettre en forme tous les segments qui contiennent 
function mefQuestions(){

    

    const toussegs = document.querySelectorAll('.lblseg');


        for (let seg of toussegs) {
                 
            let loc= Number(seg.dataset.loc)
            let nomloc  = locut[loc]

             if (loc < locut.length ) {

                if (nomloc.indexOf("?")>-1) {  
            
                    seg.classList.add("qst");

                } else {

                    seg.classList.remove("qst");
                }

             }    
            
   
        }

        


}

async function convertSpeaker() {

    let rgmax = 0;
    
    for (s = 0; s< TabSeg.length;s++){

        let txt = TabSeg[s][4]

        let spk = txt.indexOf("Speaker ") // recherche d'un speaker

        if (spk == 0) { // récupération du rang

            let rg = txt.substr(8,1)
            rg = Number(rg)
             
            TabSeg[s][3] = rg +1  //affectation du locuteur
            if (rgmax < rg+1) {rgmax = rg+1 }; // mémorisation du speaker le plus élevé atteint
 
            //suppression du préfixe "speaker"
            TabSeg[s][4] = txt.substr(11)

            
        } 

        //suppression des "speaker 0", qui apparaissent de manière intempestive dans le corps du texte
        for (i=0;i<10;i++){
            TabSeg[s][4] = TabSeg[s][4].replaceAll("Speaker " + i + ":","")
        }     
 
    };


    // mise à jour des noms des locuteurs

    for (loc=1;loc<rgmax +1;loc++){
        locut[loc] = "Speaker " + loc

    };

 
    for (loc=rgmax+1;loc<locut.length+1;loc++){
        
        locut.splice(loc,1)

    };

    await electronAPI.setTabLoc(locut);


}

function checkloc(tabLoc){


    console.log("vérification des locuteurs dans les segments" +  tabLoc)

    let segs = document.querySelectorAll('.lblseg');
    let locPrec = -1;
    let loc = 0;
    
    for (let seg of segs) {
        
        seg.removeAttribute("data-nomloc");
        seg.classList.remove('ligloc')
    
        // segment courant
        let rg = seg.dataset.rk;
        
    
            
            if (seg) {
                loc= seg.dataset.loc
                
                // ajout d'un locuteur
                if (loc!=locPrec){ 

                    if (tabLoc[loc]){
                    seg.dataset.nomloc = tabLoc[loc].replaceAll("?","")
                    } else {seg.dataset.nomloc = "???"}
                    seg.classList.add('ligloc')
                    

                };
    
                locPrec=loc;
            }
            
           
    
    
    
    }
        
    
    }
    

async function statsLocs(tabLoc, html, nomConteneur){ // fonction de statistiques des locuteurs


        if (!tabLoc) {
            tabLoc = await window.electronAPI.getTabLoc();
        }
         
        if (!html){
            console.log("pas de contenu pour les stats des locuteurs")
            let conteneurHtml = document.getElementById("segments");
            html = conteneurHtml.innerHTML;
        }

 


        // création d'un conteneur temporaire pour l'analyse
        let tempContainer = document.createElement('div');
        tempContainer.innerHTML = html;

        let tabStatsLoc = [];

        for (let i=0; i<tabLoc.length +1; i++){
            tabStatsLoc.push({loc:tabLoc[i], nbInt:0, nbMots:0, nbSec:0}); // initialisation des stats (nbint = interventions) pour chaque locuteur
        }

        let segs = document.querySelectorAll('.lblseg');
        let loc_cur = -1;

        for (let seg of segs) {
            let loc= seg.dataset.loc

            // si changement de locuteur
            if (loc && loc != loc_cur && loc < tabLoc.length){
 
                tabStatsLoc[loc].nbInt += 1; // incrémentation du nombre d'interventions
                loc_cur = loc;
            }

            // comptage des mots
            let mots = seg.textContent.trim().split(/\s+/);
            tabStatsLoc[loc].nbMots += mots.length;

            // comptage du temps (en secondes)
            let debut = parseFloat(seg.dataset.deb);
            let fin = parseFloat(seg.dataset.fin);
            let duree = fin - debut;
            tabStatsLoc[loc].nbSec += duree;

        }


         console.log("tabstatsloc"+ JSON.stringify(tabStatsLoc))   
        // tri des locuteurs par nombre de mots décroissant
         tabStatsLoc.sort((a, b) => b.nbMots - a.nbMots);  

         console.log("tabstatsloc après tri"+ JSON.stringify(tabStatsLoc))   
          

        // affichage des statistiques dans le conteneur spécifié
        let conteneurStats = document.getElementById(nomConteneur);
        if (conteneurStats){
            let htmlStats = "<h2>Statistiques </h2><br><ul>";
            for (let i=0; i< tabLoc.length-1; i++){ //  
                htmlStats += `<li><strong>${tabStatsLoc[i].loc}</strong> : ${tabStatsLoc[i].nbInt} interventions, ${tabStatsLoc[i].nbMots} mots, ${Math.round(tabStatsLoc[i].nbSec / 60)} minutes</li>`;
            }
            htmlStats += "</ul>";


            // part des questions/réponses
            let totalMots = 0;    
            let totalMotsQ = 0;

                for (let i=0; i< tabLoc.length-1; i++){
                    totalMots += tabStatsLoc[i].nbMots;
                    if (tabStatsLoc[i].loc.includes("?")){
                       totalMotsQ += tabStatsLoc[i].nbMots;
                    }
                    
                }

            let pourcentageQ = ((totalMotsQ / totalMots) * 100).toFixed(2);
            htmlStats += `<br>
            <p><strong>Total des mots :</strong> ${totalMots} mots</p>`;
            htmlStats += `<p><strong>% de questions :</strong>  (${pourcentageQ} %)</p>`;


            conteneurStats.innerHTML = htmlStats;
        }
    }



    /////////////////////////////////////////////////////////////////////////////////:
    // EXPORTATION DES FONCTIONS
    /////////////////////////////////////////////////////////////////////////////////
    // Export CommonJS pour utilisation dans main.js (contexte Node.js)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            chargeLocut,
            ajoutLocut,
            modifLocut,
            validLocut,
            màjLoc,
            selLoc,
            affectLoc,
            mefQuestions,
            convertSpeaker,
            checkloc, 
            statsLocs
        };
    }
    
    // Export global pour utilisation dans le renderer (contexte navigateur)
    if (typeof window !== 'undefined') {
         window.chargeLocut = chargeLocut;
         window.ajoutLocut = ajoutLocut;
         window.modifLocut = modifLocut;
         window.validLocut = validLocut;
         window.màjLoc = màjLoc;
         window.selLoc = selLoc;
         window.affectLoc = affectLoc;
         window.mefQuestions = mefQuestions;
         window.convertSpeaker = convertSpeaker;
         window.checkloc = checkloc;
         window.statsLocs = statsLocs;
    }