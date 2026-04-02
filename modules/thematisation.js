
/////////////////////////////////////////////
// ThEMATISATION
////////////////////////////////////////////

 

 
let thm_cur = "cat_000";
let modeFiltre= "false"; // mémorise l'usage que l'on fait des boutons de thématiques
let thmAct=[];
let tabXtr = [];
var taille_def = 18; // taille de police par défaut
var dragO = null; // thématique en cours de déplacement 
var dragA = null; // thématique cible du déplacement

let filigraneActif = false;
const FILIGRANE_OPACITE = 0.75; // opacité du voile blanc (0 = invisible, 1 = blanc total)

async function loadThm(){

    //console.log("chargement des thématiques (filigrane=" + filigraneActif + ")");
    // récupération du tableau des thématiques

   

         
    let tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main
    
    // Créer une nouvelle balise <style>
    const style = document.createElement('style');
    style.id = 'thm-styles';
    style.type = 'text/css';

    // Ajouter des règles CSS
    style.innerHTML = ``
    
    /*
        .survseg {
        background-color:  rgba(185, 185, 185, 0.25);
        transition: 1s;
        }

        .cat_000 {
            backgroundcolor : rgb(91 91 91 / 72%)
        }

    `;
    */

    // Ajouter la feuille de style au document
    document.head.appendChild(style);

   /* 
    tabThm=[];
         
    tabThm.push({code: "cat_pond1", couleur: "", nom : "Important 1" , taille : "22px"})
    
    tabThm.push({code: "cat_001", couleur: "#34b154", nom : "vert pomme  ", taille : ""}) 
    tabThm.push({code: "cat_002", couleur: "#685db5", nom : "mauve", taille : ""}) 
    tabThm.push({code: "cat_003", couleur: "#468cd7", nom : "bleu", taille : ""}) 
*/

     // ajout des attributs manquants si besoin
        tabThm.forEach(row => {
            row.rang ??= 0;
            row.cmpct ??= "false"; 
            row.act ??= "true"; 
        });

        

    for (let t=0;t<tabThm.length;t++){
        createThm(tabThm[t].code, tabThm[t].couleur, tabThm[t].taille, filigraneActif);
    }


    //afflistThm();
}


async function afflistThm(tabThm, conteneur){

    conteneur = document.getElementById(conteneur);
    console.log("ajout des thm dans le conteneur" + conteneur)
    
    if (!tabThm) {
    tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main
    }

    conteneur.innerHTML = "";


    for (let t=0;t<tabThm.length;t++){

        const div = document.createElement('label');
        div.dataset.code = tabThm[t].code;
        div.dataset.couleur = tabThm[t].couleur;
        div.dataset.rkthm = t;
        div.dataset.cmpct = tabThm[t].cmpct
        div.classList.add(tabThm[t].code);
        div.classList.add('ligthm');
        div.title=splitNomThm(tabThm[t].nom)[1]; // ajout de la description éventuelle en info-bulle

        // ajout du rang
        let chnRg ="rang_0"
        let rang = tabThm[t].rang
        div.dataset.rang= rang; 

        if (rang){
            chnRg = "rang_" + rang;

        }
      

        div.classList.add(chnRg);
        div.innerHTML = `<a>${splitNomThm(tabThm[t].nom)[0]}</a>`; // ne conserve que le nom, pas la description
        div.style.cursor ="pointer"

        

                // ajout du marqueur de liste
                if (t < (tabThm.length-1)){// si ce n'est pas le dernier
                    var rg1 = tabThm[t].rang;
                    var rg2 = tabThm[Number(t+1)].rang;

                    
             
                    if (rg2>rg1){ // et que le suivant est de rang sup
        
                      

                        if (tabThm[t].cmpct ==undefined){tabThm[t].cmpct ==false}
        
                        //console.log("y'a des momes, c'est compacté? " + tabThm[t].cmpct)
        
                        compactThm(tabThm,t,tabThm[t].cmpct)


                        if (tabThm[t].cmpct!= true){ 
                            
                            
                            div.classList.remove('ligfam')
                            div.classList.add('ligfam-cmpct')
                        
                        } else {
                            div.classList.remove('ligfam-cmpct')
                            div.classList.add('ligfam')
                            
                        }
        
                    }
                }


            if (tabThm[t].couleur){
                div.style.backgroundColor = tabThm[t].couleur +"30"
            }
            
            conteneur.appendChild(div);

 
            // ajout des listeners
              div.addEventListener('mousedown', async (event) => {
         
                 
                const rect = div.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const width = rect.width;      

                
                    // compactage du segment
                let rangthm = Number(div.dataset.rkthm);
                
                console.log("x = "+ x + "widht = " + width)

                if (x > width - 45) {      
                    
                    console.log("clic sur la flèche")
                     
                    let fam= aEnfants(rangthm);

                    if (fam==false){return};

                    var compact = tabThm[rangthm].cmpct

                    if (compact == undefined || compact == false) {
                    
                    compact  = true; 
                    }       
                    else if (compact == true) {
                    
                    compact = false;
                    } 
                
                    tabThm[rangthm].cmpct = compact;

                     
                     
                    // sauvegarde du tableau des thématiques
                    //await window.electronAPI.setThm(tabThm);
                    
                    compactThm(tabThm,rangthm,compact)

                    
 

                } 
                else  {

                    thm_cur = div.dataset.code;
                    
                    
                    if (!debSel && !finSel){

                        if (seg_cur>0){

                            
                            let seg_suiv = seg_cur ;
                            seg_suiv ++;

                            console.log("seg_cur = " + seg_cur + "  seg_suiv = " + seg_suiv ) 

                            // définition du rang du premier mot du segment
                            let segDeb = document.querySelector(".lblseg[data-rksg='"+ seg_cur +"']")
                            let segSuiv  = document.querySelector(".lblseg[data-rksg='"+ seg_suiv +"']")
                            
                            console.log(segDeb.dataset.rksg + "  " + segSuiv.dataset.rksg)


                            if (segDeb && segSuiv){
                                
                                debSel = segDeb.tabIndex;
                                finSel = segSuiv.tabIndex;
                                finSel-- ; 

                                 console.log("nouveau debSel = " + debSel + " finSel = " + finSel)
                            }

                        }
                        

                    }
                    thmSeg(debSel,finSel,thm_cur)
                    //selThmCur(thm_cur) 
                    

                }


                    
                    

                });


        }


        
        // compactage des thm lus
        
        for (let t2=0;t2<tabThm.length-1;t2++){

            //console.log("tabThm["+ t2 +"].cmpct  " + tabThm[t2].cmpct + "\n  enfants " + aEnfants(t2))

            if (tabThm[t2].cmpct==true && aEnfants(t2)==true){
                  compactThm(tabThm,t2,tabThm[t2].cmpct)}
        }

      
        //listenersThm();
}
 
// Affichage de la liste des THM dans le corpus
async function affichListThmCrp(tabThm){

    if (!tabThm) {
    tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main
    }

    compterCatActifs(); // mise à jour du compteur de catégories actives
    
    console.log("affichage des catégories")
    const conteneur=document.getElementById('conteneur_cat');

    // mise à jour des classes CSS de la page principale
    loadThm();
    
    conteneur.innerHTML = ``;

    for (let t=0;t<tabThm.length;t++){
        const div = document.createElement('label');
        div.dataset.code = tabThm[t].code;
        div.dataset.couleur = tabThm[t].couleur;
        div.dataset.rkthm = t;
        div.dataset.cmpct = tabThm[t].cmpct
        div.classList.add(tabThm[t].code);
        div.classList.add('ligthm');

        if (tabThm[t].act == false || tabThm[t].act =="false") {
            div.classList.add ("ligthm-inactive")
        }

        div.title=splitNomThm(tabThm[t].nom)[1]; // ajout de la description éventuelle en info-bulle


        // ajout du rang
        let chnRg ="rang_0"
        let rang = tabThm[t].rang
        div.dataset.rang= rang; 

        if (rang){
            chnRg = "rang_" + rang;

        }
      

        div.classList.add(chnRg);
        div.innerText = splitNomThm(tabThm[t].nom)[0];
        div.style.cursor ="pointer"

        

                // ajout du marqueur de liste
                if (t < (tabThm.length-1)){// si ce n'est pas le dernier
                    var rg1 = tabThm[t].rang;
                    var rg2 = tabThm[Number(t+1)].rang;

                                 
                    if (rg2>rg1){ // et que le suivant est de rang sup
        
                      
                        //console.log("analyse de la thm" + t + "nom = " + tabThm[t].nom +  " compact = "+ tabThm[t].cmpct )

                        if (tabThm[t].cmpct == undefined){tabThm[t].cmpct ==false}
        
                        //console.log("y'a des momes, c'est compacté? " + tabThm[t].cmpct)
        
                        //compactThm(tabThm,t,tabThm[t].cmpct)



                        if (tabThm[t].cmpct!=true ){ 
                            
                            div.classList.remove('ligfam')
                            div.classList.add('ligfam-cmpct')
                        
                        } else {

                  
                            div.classList.remove('ligfam-cmpct')
                            div.classList.add('ligfam')
                            
                        }
        
                    }
                }

                 if (rang >0){

                        if (tabThm[t].cmpct!=true ){ 
 
 
                            div.classList.remove('ligthm-cmpct')
                             
                        
                        } else {

                            div.classList.add('ligthm-cmpct')
                            
                            
                        }
        
                    }       
                    
                

            if (tabThm[t].couleur){
                div.style.backgroundColor = tabThm[t].couleur +"30"
            }

    

            conteneur.appendChild(div);

 // ajout d'un listener au clic gauche
    div.addEventListener('mousedown', async (event) => {
        const rect = div.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const width = rect.width;

        // compactage du segment
        let rangthm = Number(event.target.dataset.rkthm);

        if (x > width - 45) {

                let fam= aEnfants(rangthm);

            if (fam==false){return};

            var compact = tabThm[rangthm].cmpct

            if (compact == undefined || compact == false || compact == "false") {
            
            compact  = true; 
            }       
            else if (compact == true || compact == "true") {
            
            compact = false;
            } 
        
            tabThm[rangthm].cmpct = compact;
            // sauvegarde du tableau des thématiques
           // await window.electronAPI.setThm(tabThm);
            
            compactThm(tabThm,rangthm,compact)


    }  else {


        // activation / désactivation du thm

        // en cas de clic gauche --> activation / désactivation
        if (tabThm[rangthm].act == false || tabThm[rangthm].act =="false") {
            tabThm[rangthm].act = true
            div.classList.remove ("ligthm-inactive")  

        } else {
            tabThm[rangthm].act = false
            div.classList.add ("ligthm-inactive")  
        }
        
         
        // propagation aux enfants éventuels    
            
            for (let t2= rangthm+1; t2<tabThm.length;t2++){

                
                if (tabThm[t2].rang > tabThm[rangthm].rang){
                   
                    tabThm[t2].act = tabThm[rangthm].act
                } else { // fin de la boucle et sortie
                    
                    break
                }

            }
        
        // évitement     


        await window.electronAPI.setThm(tabThm);
        
        // redessin de tous les graphs 
        //dessinTousEntretiens();
            affichageExtraitsCorpus(typeof selCatCritereEt !== 'undefined' ? selCatCritereEt : false);
  
    }

    

});
        
// listerner au clic droit
div.addEventListener('contextmenu', async (event) => {
 event.preventDefault();


        // désactivation des tous les thèmes
        let rangthm = Number(event.target.dataset.rkthm);

        // désactivation de tous les autres thèmes
        tabThm.forEach(row => {
             row.act = false; 
        });

        // ajout du 
        //const ligneTHM = document.querySelectorAll('.ligthm');
        //ligneTHM.forEach(ligne => {
        //ligne.classList.add ("ligthm-inactive") 
        //});

       
        tabThm[rangthm].act = true
        //div.classList.remove ("ligthm-inactive")  
                // propagation aux enfants éventuels    
            
            for (let t2= rangthm+1; t2<tabThm.length;t2++){

                console.log("le rang suivant est plus grand ? " + t2 + " = " + tabThm[t2].rang)
                if (tabThm[t2].rang > tabThm[rangthm].rang){
                    console.log("oui")
                    tabThm[t2].act = tabThm[rangthm].act
                } else { // fin de la boucle et sortie
                    console.log("non")
                    break
                }

            }
         
        await window.electronAPI.setThm(tabThm);
        
        // redessin de tous les graphs 
        //dessinTousEntretiens();
        affichageExtraitsCorpus(typeof selCatCritereEt !== 'undefined' ? selCatCritereEt : false);


});

}


        
        // compactage des thm lus
        for (let t2=0;t2<tabThm.length-1;t2++){

            //console.log("tabThm["+ t2 +"].cmpct  " + tabThm[t2].cmpct + "\n  enfants " + aEnfants(t2))

            if (tabThm[t2].cmpct==true && aEnfants(t2)==true){
                  compactThm(tabThm,t2,tabThm[t2].cmpct)}
        }

        //listenersThm();


}    


// Affichage de la liste des THM dans le corpus
async function affichListThmEdit(tabThm){

 
    if (!tabThm) {
    tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main
    }

    let thmDragged = null;

    const conteneur=document.getElementById('fond-thm-edit');
    
    conteneur.innerHTML = ``;

    let t;
    for (let t=0;t<tabThm.length;t++){
        const div = document.createElement('label');
        div.dataset.code = tabThm[t].code;
        div.dataset.nom = tabThm[t].nom;
        div.dataset.couleur = tabThm[t].couleur;
        div.dataset.rkthm = t;
        div.dataset.cmpct = tabThm[t].cmpct
        div.classList.add(tabThm[t].code);
        div.classList.add('ligthm');
        div.title= tabThm[t].nom ; // ajout de la description éventuelle en info-bulle


        // ajout du rang
        let chnRg ="rang_0"
        let rang = tabThm[t].rang
        div.dataset.rang= rang; 

        if (rang){
            chnRg = "rang_" + rang;

        }
      

        div.classList.add(chnRg);
        div.innerText = splitNomThm(tabThm[t].nom)[0];
        div.style.cursor ="pointer"

        

        /*
                // ajout du marqueur de liste
                if (t < (tabThm.length-1)){// si ce n'est pas le dernier
                    var rg1 = tabThm[t].rang;
                    var rg2 = tabThm[Number(t+1)].rang;

                    
             
                    if (rg2>rg1){ // et que le suivant est de rang sup
        
                      

                        if (tabThm[t].cmpct ==undefined){tabThm[t].cmpct ==false}
        
                        //console.log("y'a des momes, c'est compacté? " + tabThm[t].cmpct)
        
                        //compactThm(tabThm,t,tabThm[t].cmpct)



                        if (tabThm[t].cmpct!=true ){ 
                           // console.log("la ligne ", t, " est compactée")
                            
                            div.classList.remove('ligfam')
                            div.classList.add('ligfam-cmpct')
                        
                        } else {

                           // console.log("la ligne ", t, " est décompactée")
                            div.classList.remove('ligfam-cmpct')
                            div.classList.add('ligfam')
                            
                        }
        
                    }
                }
*/

            if (tabThm[t].couleur){
                
                div.style.backgroundColor = tabThm[t].couleur +"30"


            }

    

            conteneur.appendChild(div);

        // ajout d'un listener pour le clic
        div.addEventListener('mousedown', (event) => {
        const rect = div.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const width = rect.width;

            // compactage du segment
            let rangthm = Number(event.target.dataset.rkthm);

            if (x > width - 45) {

                return; 
                let fam= aEnfants(rangthm);

                if (fam=="false"){return};

                var compact = tabThm[rangthm].cmpct

                if (compact == undefined || compact == false || compact == "false") {
            
            compact  = true; 
                }       
                else if (compact == true || compact == "true") {
            
            compact = false;
                } 
        
                tabThm[rangthm].cmpct = compact;     

                compactThm(tabThm,rangthm,compact)

            } else if (x <10) {

                
                // déplacement de la thématique
                div.draggable = true;
                div.addEventListener('dragstart', (event) => {
                     
                    dragO = Number(div.dataset.rkthm);
                    try {
                        event.dataTransfer.setData('text/plain', String(dragO));
                        event.dataTransfer.effectAllowed = 'move';
                    } catch (e) {
                        
                    }
                    console.log("dragstart de la thématique " + dragO)
                    div.classList.add('dragging');
                     
                });

                
            } else {
                
                
                let catForm = document.getElementById("cat-form");
                catForm.dataset.placerapres = -2; 

                // fermeture si ouvert sans modifs
                if (!catForm.classList.contains("dnone") ) {

                     
            

                    if (catForm.dataset.rkthm == rangthm && catForm.dataset.rkthm != undefined) {

   
                         
                        annulChgThm()
                        return
                    }

                }

             
                catForm.dataset.rkthm = rangthm;
                catForm.classList.add("dnone");
             
                selModifThm(tabThm, event.target.dataset.code)

                // positionnement du formulaire

                // redimensionnement de tous les autres
                const fond = document.getElementById("fond-thm-edit")
                const lignes = fond.querySelectorAll('.ligthm')
                lignes.forEach(ligne => {
                    ligne.style.height="45px";
                    ligne.innerText = splitNomThm(ligne.dataset.nom)[0];
                });

                // écartement du thm modifié
                div.style.height= "400px"; 
                div.innerText = "";

                setTimeout(function() {
                const rect = div.getBoundingClientRect();
                
                // Position de défilement verticale (axe Y)
                // récupération du scroll du conteneur fond-cat 
                const fondCat = document.getElementById('fond-cat')
                const scrollY = fondCat.scrollTop;

                
                const rawTop = scrollY + rect.top - 50;
                const maxTop = fondCat.clientHeight - 400 - 10;
                catForm.style.top = Math.min(rawTop, maxTop) + "px";
                catForm.style.left = rect.left + "px";
                catForm.style.width = rect.width + "px";
                catForm.classList.remove("dnone");
                catForm.style.height = "400px"

                    const lblNomCat = document.getElementById("lblNomCat");

                    lblNomCat.focus();
                    lblNomCat.select();

                // chargement de la combo des thm existants
                chargerCmbMoveThm(rangthm);



                }, 150); // délai pour laisser le temps au navigateur de calculer les positions

            /*
                // paramétrage du bouton 
                let btnX = document.getElementById('valider-modif-cat')
                    btnX.addEventListener('mousedown', (event) => {
                        validerModifsThm(tabThm, rangthm);
                        let formul = document.getElementById('cat-form');
                        formul.classList.add("dnone");
                    });
            */


                // réaction de la text area
                const lblNomCat = document.getElementById("lblNomCat");
                lblNomCat.addEventListener("keydown", (event) => {
                    if(event.key==='Enter'){
                        event.preventDefault();
                        validerModifsThm();
                        annulChgThm();
                    }
                });

                // ajout d'une nouvelle catégorie après
                /*
                const lblNomCatPlus = document.getElementById("btnthmAjoutApres");
                lblNomCatPlus.addEventListener("click", (event) => {
                  ajoutThmApres(rangthm, 'nouvelle');
                });

                // ajout d'une nouvelle catégorie clone
                const lblNomCatClone = document.getElementById("btnthmAjoutClone");
                lblNomCatClone.addEventListener("click", (event) => {
                  ajoutThmApres(rangthm, 'clone');
                });
                */
            }

        });

        div.addEventListener('mousemove', (event) => {
         //récupération de la position de la souris
         let pos = div.getBoundingClientRect();

         const x = event.clientX - pos.left;

         if (x<10){
            div.style.cursor ="move";
         } else {
            div.style.cursor ="pointer";
         }

        });

        // réaction au survol  
        div.addEventListener('dragover', (event) => {
                    event.preventDefault();  
                    // track potential drop target
                    dragA = Number(div.dataset.rkthm);
                    // small visual cue could be added here if desired
                });

        // handle actual drop on the target
        div.addEventListener('drop', (event) => {
            event.preventDefault();
            div.classList.remove('dragging');

            // ensure numeric indices
            const from = Number(dragO);
            const to = Number(dragA);

            console.log("déplacement de la thématique " + from + " vers la position " + to)

            // perform move only when valid and different
            if (!isNaN(from) && !isNaN(to) && from !== to) {
                moveThm(tabThm, from, to);
                affichListThmEdit(tabThm);
            }

            // cleanup
            dragO = null;
            dragA = null;
        });

        // ensure dragged element cleans up the dragging class if drag ends without drop
        div.addEventListener('dragend', (event) => {
            div.classList.remove('dragging');
            // leave dragO/dragA cleanup to drop handler; if no drop happened, clear here
            dragO = null;
            dragA = null;
        });

    //next thématique
    }


        
        // compactage des thm lus
        let t2; 
        for (let t2=0;t2<tabThm.length-1;t2++){

            //console.log("tabThm["+ t2 +"].cmpct  " + tabThm[t2].cmpct + "\n  enfants " + aEnfants(t2))

            if (tabThm[t2].cmpct==true && aEnfants(t2)==true){
                  compactThm(tabThm, t2,tabThm[t2].cmpct)}
        }

}    

async function validerModifsThm(){


        // récupération de la liste des thm
        tabThm= await window.electronAPI.getThm();

        // récupération du rang du thm via le dataset de catform
        const catForm = document.getElementById("cat-form");
        const rangthm = Number(catForm.dataset.rkthm);
        let placerApres = Number(catForm.dataset.placerapres)


        // Récupérer les valeurs des champs du formulaire
        const code = document.getElementById('lblCodeCat').value;
        const nom = document.getElementById('lblNomCat').value;
        const rang = document.getElementById('lblrang').innerText;
        const couleur = document.getElementById('chkcatcoul').checked ? document.getElementById('colorFond').value : "";
        const taille = document.getElementById('chkcatpol').checked ? document.querySelector('.lblTaillePol').innerText : "";

        // cache de la zone de saisie
        catForm.classList.add("dnone")
  

         
        let trouvé = false; 

 

        // récupération de la feuille de style
        //const sheet = document.styleSheets[0];
        const styleTag = document.getElementById('thm-styles') || document.querySelector('style'); // Sélectionne la balise <style> des thématiques
        const sheet = styleTag.sheet; // Accède à sa feuille de style
        

        // Parcourir les règles CSS
        for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
           
          //  console.log("vérification de la règle " + rule.selectorText + " avec le code " + code)
            
            // Vérifier si la règle concerne la classe  
            if (rule.selectorText === ".cat_" + code) {
                     

                    if (couleur) {rule.style.backgroundImage =`linear-gradient(rgba(0, 0, 0, 0) 60%, ` + couleur + `60 95%, ` + couleur + ` 100%)`;
                    } else {    
                         
                        rule.style.backgroundImage ="";
                    }

                    if (taille > taille_def) {

                        rule.style.fontWeight= "bold";
                    } else {
                        rule.style.fontWeight= "normal";
                    }


                    rule.style.fontSize = taille;
      
                //let lblligthm = document.querySelector(".cat_" + code)
                //lblligthm.innerText = nom; 

                // mise à jour du tableau des thématiques
                const row = tabThm.find(item => item.code == "cat_" + code); // Trouver la ligne correspondante
                if (row) {
                    
                    row['nom'] = nom;
                    row['couleur'] = couleur; // Mettre à jour la couleur
                    row['taille'] = taille;
                    row['rang'] = rang;
                    row['act'] = "true"; // Assure que la thématique est active
                    
                    console.log("après changement ", row)
                    trouvé = true;
                    break;      
                    
                } else {

                    console.log("pas trouvé")
                    
                }



 

            }
    
            
    }

    if (!trouvé) { // pas trouvée, alors ajout
        
       console.log("ajout de la thématique " + code)
        tabThm.push({code: "cat_" + code, couleur: couleur, nom : nom, taille : taille, cmpct: "false", rang : rang, act:"true"}) 
        
        createThm("cat_" + code,couleur, taille )
       

    }

    
    // déplacement éventuel
    if (placerApres>=-1) {
    
        // récupération de l'index
        const index = tabThm.findIndex(item => item.code === "cat_" + code);
        if (index !== -1) { 
        
            if (index > placerApres ){placerApres++}

            moveThm(tabThm,index,placerApres)
            
        }

    }

 
    

    // enregistrement du tabThm dans le main
    console.log("enregistrement des modifs de thématiques ", tabThm[rangthm]);
    let envoi = await window.electronAPI.setThm(tabThm);
 
     affichListThmEdit(tabThm);

     
 
}

// fonction de création des classes CSS des catégories
function createThm(code, couleur, taille, filigrane){

    var font = "";

    // Construction du gradient selon le mode filigrane
    var bgImage = '';
    if (couleur) {
        let gradient = `linear-gradient(rgba(0, 0, 0, 0) 60%, ${couleur}60 95%, ${couleur} 100%)`;
        if (filigrane) {
            bgImage = `background-image: linear-gradient(rgba(250, 250, 250, ${FILIGRANE_OPACITE}), rgba(250, 250, 250, ${FILIGRANE_OPACITE})), ${gradient};`;
        } else {
            bgImage = `background-image: ${gradient};`;
        }
    }

    if (taille > taille_def) {
        font = `font-size: ${taille}; font-weight: bold;`;
    }

    // Créer une nouvelle balise <style>
    const style = document.querySelector('style');
    const sheet = style.sheet;

    // Si la règle existe déjà, la mettre à jour plutôt que d'en ajouter une nouvelle
    for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        if (rule.selectorText === '.' + code) {
            if (couleur && filigrane) {
                rule.style.backgroundImage = `linear-gradient(rgba(250, 250, 250, ${FILIGRANE_OPACITE}), rgba(250, 250, 250, ${FILIGRANE_OPACITE})), linear-gradient(rgba(0, 0, 0, 0) 60%, ${couleur}60 95%, ${couleur} 100%)`;
            } else if (couleur) {
                rule.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0) 60%, ${couleur}60 95%, ${couleur} 100%)`;
            } else {
                rule.style.backgroundImage = '';
            }
            rule.style.fontSize = taille > taille_def ? taille : '';
            rule.style.fontWeight = taille > taille_def ? 'bold' : '';
            rule.style.paddingBottom = '4px';
            return;
        }
    }

    // Ajouter des règles CSS (seulement si la règle n'existait pas)
    style.innerHTML += `
    .${code} {
    ${bgImage}
    ${font}
    padding-bottom: 4px;
    }
    `;

}

// fonction d'ajout d'une nouvelle thématique
async function ajoutThm(){

// récupération du tableau des thm
let tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main

// définition du rang le plus avancé
let derrang = tabThm.length -1




// récupération du rang du thm via le dataset de catform
const catForm = document.getElementById("cat-form");
catForm.dataset.rkthm = derrang;

// ajout d'une thématique après la dernière
await ajoutThmApres('nouvelle');


// scroll jusqu'au max  

//const derthm = document.querySelectorAll('.ligthm')[derrang];

catForm.scrollIntoView({ behavior: "smooth", block: "end" });

}

async function ajoutThmApres(typeAjout){

 
// récupération du rang du thm via le dataset de catform
const catForm = document.getElementById("cat-form");
const rangthm = Number(catForm.dataset.rkthm);

// récupération du tableau des thm
let tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main 



    // validation des modfis
    //validerModifsThm(tabThm, rangthm)
   // fermeture du formulaire
   //annulChgThm();

                // positionnement du formulaire

                // redimensionnement de tous les autres
    const fond = document.getElementById("fond-thm-edit")
    const lignes = fond.querySelectorAll('.ligthm')
    lignes.forEach(ligne => {
                    ligne.style.height="45px";
                    ligne.innerText = splitNomThm(ligne.dataset.nom)[0];
    });   



    var nvcode="";

    // définition d'un code par incrémentation
    for (let t=1;t<1000;t++){

        nvcode = `cat_`+ String(t).padStart(3, "0"); 

        // mise à jour du tableau des thématiques
        const row = tabThm.find(item => item.code == nvcode); // Trouver la ligne correspondante

        if (!row) {

            break;
        }


    }

    console.log("ajout d'une thématique après le rang " + rangthm + " avec le code " + nvcode)

    // ouverture d'un nouveau formulaire
     
    catForm.dataset.rkthm = rangthm    // nouveau thm
    catForm.classList.add("dnone");

   // réinitialisation des champs
   //catForm.reset();

   if (typeAjout =="nouvelle"){
    document.getElementById("lblCodeCat").value = nvcode.replace("cat_","");
    document.getElementById("lblNomCat").value = "Nouvelle catégorie";
    document.getElementById("lblrang").innerText = "0";
    document.getElementById("chkcatcoul").checked = false;
    document.getElementById("colorFond").value = "#ffffff";
    document.getElementById("en-tete_cat_edit").style.backgroundColor = "#ffffff";
    document.getElementById("chkcatpol").checked = false;
    document.querySelector('.lblTaillePol').innerText = taille_def;

   } if (typeAjout =="clone"){
    document.getElementById("lblCodeCat").value = nvcode.replace("cat_","");
 
   }


    

   // récupération du label de la thématique
 
   // recherche des .ligthm  avec le data-rkthm = rangthm
   const divCible = fond.querySelectorAll('[data-rkthm="' + rangthm + '"]')
   
   if (divCible.length==0){alert("erreur lors de l'ajout de la thématique"); return;}
    
    

    // ajout d'une ligne vide pour le nouveau thm
    const divNew = document.createElement('label');
    divNew.classList.add('ligthm');
    divNew.classList.add('asuppr');
    divNew.style.backgroundColor= "#f5f5f5ff";
    divNew.style.height= "400px";
    divNew.innerText= " ";

   if (divCible.length > 0) {
        divCible[0].insertAdjacentElement('afterend', divNew);
        } else {
        console.error('divCible introuvable');
}

    const fondCat = document.getElementById('fond-cat')
    const scrollY = fondCat.scrollTop;

    let posNv = divCible[0].getBoundingClientRect();
    const rawTopNv = posNv.top + scrollY - 50;
    const maxTopNv = fondCat.clientHeight - 400 - 10;
    catForm.style.top = Math.min(rawTopNv, maxTopNv) + "px";
    catForm.style.left = posNv.left + "px";
    catForm.style.width = posNv.width + "px";
    catForm.style.height = "400px"
    catForm.classList.remove("dnone");

    catForm.dataset.rkthm = rangthm;
    catForm.dataset.placerapres = rangthm

    // Délai pour laisser le DOM se mettre à jour avant de focus/select
    setTimeout(() => {
        const lblNomCat = document.getElementById("lblNomCat");
        if (lblNomCat) {
            lblNomCat.focus();
            lblNomCat.select();
        }
    }, 100);
    
}


async function thmSeg(deb, fin, thm){ // affecter un code de catérogie

    

    if (deb==0 || fin==0){

        //selModifThm(thm)
        return;
    }

    backUp();

    for (sg =deb;sg<=fin;sg++){       


        const conteneur = getSpan (sg);
        
        if (!conteneur){continue}
        if (!conteneur.classList.contains(thm)){
            conteneur.classList.add(thm);
        } else {
            conteneur.classList.remove(thm);
        }


    }

    const cible = getSpan (deb);
    const classes = cible.classList.value;

    thmEnCours(classes)
   
    effaceSurv();
    multiThm('segments');

    // mise à jour du dessin de l'entretien
    const html = document.getElementById("segments").innerHTML; 
    const canva = document.getElementById("graphEnt")
    let tabGrphEnt = await resumeGraphique(html.replace(/`/g,''));
    dessinResumeGraphique(0, canva, tabGrphEnt);

    

 

}

function thmEnCours(thmSpan){

    console.log("thm en cours pour" + thmSpan )
   

    //effacement des sel
    const ligthm = document.querySelectorAll('.ligthm');
    
    if (thmSpan =="") {

        ligthm.forEach((lig, index) => {
            lig.classList.remove("thm-nonsel")
            lig.classList.remove("thm-sel")

        })
        return;
    }

    ligthm.forEach((lig, index) => {
        lig.classList.add("thm-nonsel")
        lig.classList.remove("thm-sel")
    })


    let tabClasses = thmSpan.split(" ");

    //resélection
    for (let t=0;t<tabClasses.length;t++) {
    
        let chaine = `[data-code="`+ tabClasses[t].trim() + `"]`
         
        var ligne = document.querySelector(chaine);
        
        if (ligne) {
            ligne.classList.remove("thm-nonsel")
            ligne.classList.add("thm-sel")
        }

 
    }  

;


}

function selThmCur(t) { // sélectionne la thématique courante dans la liste

    thmSeg(debSel,finSel,thm_cur)

    return

    const containers = document.querySelectorAll('.ligthm');
    
    // Ajouter un event listener à chaque conteneur
    containers.forEach((container, index) => {
    
        if (container.dataset.code == thm_cur){
            container.classList.add("thm-sel")
            
            }       
            else {
            container.classList.remove("thm-sel")
        }

        });

        const styleSheet = document.styleSheets[0];

        // Parcourir les règles CSS de la feuille de style
        for (let i = 0; i < styleSheet.cssRules.length; i++) {
        const rule = styleSheet.cssRules[i];
        
        // Vérifier si la règle correspond à la classe cible
        if (rule.selectorText == '.survseg') {
            
            rule.style.backgroundcolor = tabThm[t].couleur;  // Modifier une propriété
            
            break;
        }
        }

}

function selModifThm(tabThm, thm){ // sélection d'une catégorie pour modification

   // dialog("Cat");

     

    let thmpt = "." + thm
    const lblThm = document.querySelector(thmpt)

        var rkthm =lblThm.dataset.rkthm;

        document.getElementById("lblCodeCat").value = thm.replace("cat_","");
       // document.getElementById("lblTypeModif").innerText = "Modifier la catégorie " + thm
        document.getElementById("btnthmsuppr").classList.remove("dnone");
         
        //selection de tout le texte de LblNomCat et focus
        const lblNomCat = document.getElementById("lblNomCat");
        lblNomCat.value = tabThm[rkthm].nom;
        //lblNomCat.style.height = '25px'; 

        lblNomCat.focus();
        // retour au premier caractère 
        lblNomCat.setSelectionRange(0, 0);
        lblNomCat.select();

        let coulfond="none";
        let taillepol="none";
        

        const row = tabThm.find(item => item.code == thm); // Trouver la ligne correspondante

                if (row) {
                                        
                   coulfond = row['couleur'] ; 
                   taillepol = row['taille'] ;
                                                          
                } else {    
                    coulfond = null;
                    taillepol = null;
                }

        //window.getComputedStyle(lblThm).backgroundColor;

        //console.log("la taille de la police est " + taillepol)
 
        // récupération de la couleur        
        let entete = document.getElementById('en-tete_cat_edit');    
        console.log("la couleur de fond est " + coulfond)

        
        if (coulfond !="none" && coulfond !=null && coulfond !="") {
    
        document.getElementById("colorFond").value = coulfond;
        document.getElementById("chkcatcoul").checked = true;
        entete.style.backgroundColor = String(coulfond + "30");
              
        } 
        else
         {
        document.getElementById("en-tete_cat_edit").style.backgroundColor = "#ffffff";
        document.getElementById("colorFond").value = "#ffffff";
        document.getElementById("chkcatcoul").checked = false;
        entete.style.backgroundColor = "white";
        }

        //loadComboMoveThm(rkthm)



        // récupération de la police
        if (taillepol !="none" && taillepol !=null && taillepol !="") { 
            console.log("il y a une taille de police : " + taillepol)
            
            let fontSize = taillepol //window.getComputedStyle(lblThm).fontSize;

                      
            document.getElementById("chkcatpol").checked = true;
            document.querySelector(".lblTaillePol").innerText = taillepol;
            document.querySelector(".lblTaillePol").style.fontSize = taillepol;
            taille_cur = parseInt(taillepol) || 16; // Valeur par défaut si la conversion échoue
        } else {

            console.log("pas de taille de police" + taille_def)
            document.getElementById("chkcatpol").checked = false;
            document.querySelector(".lblTaillePol").innerText = taille_def
            document.querySelector(".lblTaillePol").style.fontSize = taille_def;
        }

 

         // récupération du rang
         let rang = tabThm[rkthm].rang

         if (rang) {
         document.getElementById("lblrang").innerText = rang;
         }



}

async function chargerCmbMoveThm(rkthm){

    tabThm= await window.electronAPI.getThm();

    // combo de sélection des thèmes pour déplacement
    placerApres=-2 ;
    // position courante
    let sel = document.getElementById('cmbPosThm');
    
    let rgprec= Number(rkthm-1);

    //console.log("est après le rkthm" + rgprec)
    if (rkthm>0) {sel.innerText = splitNomThm(tabThm[rgprec].nom)[0]};
    
    
    let cmb = document.getElementById('listCmbThm');
    
    cmb.innerHTML=` <li onclick="cmbMoveThm(-1)">En premier</li>
    <li onclick="cmbMoveThm(-1)" disabled style="border-bottom:1px solid grey> - </li>`; //vidage

    // chargement des lignes 
    for (let t2=0;t2<tabThm.length;t2++){

        // caractérisation de la classe
        let ajoutrg =""
        let rg = tabThm[t2].rang

        if (rg>0) {
            ajoutrg= "  -  ".repeat(rg)
        }

        let souscoul = tabThm[t2].couleur 
        if (souscoul){souscoul+="25"}

         cmb.innerHTML+=` <li onclick="cmbMoveThm(`+ (t2)+`)" style ="background-color: ` + souscoul + `">`+ ajoutrg + " " + splitNomThm(tabThm[t2].nom)[0] + ` </li>`
    
    }
}


 



async function supprStyle(){

    // suppression de la thématique
    
    //message d'avertissement
    if (confirm("Voulez-vous vraiment supprimer cette catégorie ?\n\nCette action est irréversible !")) {

    } else {
        return 
    }

    

     const code = document.getElementById("lblCodeCat").value;

    // récupération de la feuille de style
    const styleTag = document.getElementById('thm-styles') || document.querySelector('style'); // Sélectionne la balise <style> des thématiques
    const sheet = styleTag.sheet; // Accède à sa feuille de style

    // Parcourir les règles CSS
    for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];

        // Vérifier si la règle concerne la classe
        if (rule.selectorText === ".cat_" + code) {
            sheet.deleteRule(i);
            break;
        }
    }

    // Mise à jour du tableau des thématiques
    tabThm = tabThm.filter(item => item.code !== "cat_" + code);

    // enregistrement du tabThm dans le main
    console.log("enregistrement des modifs de thématiques après suppression ", tabThm);
    window.electronAPI.setThm(tabThm);


    return ; 
    
    // suppression des classes correspondantes dans les entretiens

    // récupération des contenus html des entretiens
    let tabEnt = await window.electronAPI.getEnt();
    for (let e=0;e<tabEnt.length;e++){

        let htmlEnt =  await window.electronAPI.getHtml(e);
        const conteneur = document.createElement('div');
        conteneur.innerHTML = htmlEnt;
        const mots = conteneur.querySelectorAll('span');
        mots.forEach(mot => {
            mot.classList.remove("cat_" + code);
        });

        // remise à jour du html de l'entretien
        await window.electronAPI.setHtml(e, conteneur.innerHTML);

    }

 
      
 
    

}

function existThm(thm){
 
    document.getElementById("lblTypeModif").innerText = "Ajouter une catégorie"

    for (let t=0;t<tabThm.length;t++){

        if (tabThm[t].code == "cat_" + thm) {

            document.getElementById("lblTypeModif").innerText = "Modifier la catégorie"
            document.getElementById("btnthmsuppr").classList.remove("dnone");
            return true;
        }
    }

    return false; 
}

function exportThmcss(){

var chaineCss = `<style> 


    body { margin: 20px; padding: 60px; font-family: Arial, sans-serif; background-color: #f4f4f4; color: #333; };
    h1 { font-size: 24px; margin-bottom: 10px; };
    h2 { font-size: 20px; margin-bottom: 8px; };
    
    `

    for (let t=0;t<tabThm.length;t++){
         
        chaineCss += `.` + tabThm[t].code + `{
        
        ` 
        
        if (tabThm[t].couleur){
            chaineCss += `background-image: linear-gradient(rgba(0, 0, 0, 0) 60%, ` + tabThm[t].couleur + `60 95%, ` + tabThm[t].couleur + ` 100%); 
            `
        }
        
        if (tabThm[t].taille){
            chaineCss += `font-size: ` + tabThm[t].taille + `;
            font-weight: bold;
            `
        }

        chaineCss += `
        }
    `
    }    

chaineCss += `
</style>
 `;


return chaineCss;
}

async function compactThm(tabThm, rkthm, compact){

//console.log ("compactage du " + rkthm + "statut " + compact)
    if (!tabThm) {tabThm = await window.electronAPI.getThm();} // récupération du tableau des thématiques depuis main
    
    let chaine = `[data-rkthm="`+ rkthm + `"]`
    let ligdep =  document.querySelector(chaine)
    
    if (!ligdep){   return};
         

    if (compact != true ){ 
                            
        ligdep.classList.remove('ligfam')
        ligdep.classList.add('ligfam-cmpct')
    
    } else {
        ligdep.classList.remove('ligfam-cmpct')
        ligdep.classList.add('ligfam')

    }

    var rang =  tabThm[rkthm].rang
    if (rang==undefined) {rang=0};

    rkthm++;
    
    for (t = rkthm ; t<tabThm.length;t++){
    

        let chaine = `[data-rkthm="`+ t + `"]`
        let lig =  document.querySelector(chaine)

        let rang2=tabThm[t].rang
        if (rang2==undefined) {rang2=0};

        

        if (rang2 > rang) {


            if (compact == true){
                
                //lig.style.display ="none"; 
                lig.classList.add("ligthm-cmpct");
                //lig.style.height = "1px"; 
                //lig.style.fontSize= "1px";
                 

            } else {

                lig.classList.remove("ligthm-cmpct");

 
            }

        } else if (rang2 <= rang){

            return; 
        }




    }

    tabThm[rkthm].cmpct = compact;

   // await window.electronAPI.setThm(); 

}

async function aEnfants(tabThm, rg){
//let result = "false";

if (!tabThm) {tabThm = await window.electronAPI.getThm();} // récupération du tableau des thématiques depuis main

    var rang =  tabThm[rg]?.rang
    if (rang==undefined) {rang=0};

    let rg2=Number(rg+1);
    if (rg2>tabThm.length){return false}

    //console.log("comparaison des rangs " + rg + " et après " + rg2 )
    let rang2=tabThm[rg2]?.rang
    if (rang2==undefined) {rang2=0}

    //console.log ("enfants? " + rang + " ? " + rang2)

    if (Number(rang2) > Number(rang)) {return true} 
    
    return false;
}

function nbEnfants(tabThm, rk){
    //let result = "false";
    
        var rang =  tabThm[rk]?.rang
        if (rang=="undefined") {rang=0};
        var nbEnfs = 0; 

        // décompte du nombre d'enfants
        
        for (thm = rk+1 ; thm<tabThm.length;thm++) {
             
            if (thm>tabThm.length){return nbEnfs}
        
            let rang2=tabThm[thm]?.rang
            
            if (rang2=="undefined") {rang2=0}
        
            ////console.log ("enfants? " + rang + " ? " + rang2)
        
            if (Number(rang2) > Number(rang)) {
            nbEnfs++; 
            } else 
            {return nbEnfs;}
            
        }
        
        return nbEnfs; 

    }

function cmbMoveThm(value){
    
    console.log("placement après le thm " + value)
        
        value=Number(value);
        
        if (value>0) {
            lib = splitNomThm(tabThm[value].nom)[0];

        } else {
            lib = "En premier"
        }

         


        document.getElementById("cmbPosThm").textContent = lib;

        document.querySelector("details").removeAttribute("open"); // Ferme la liste

        placerApres=value;
        document.getElementById("cat-form").dataset.placerapres = placerApres
    
}

function moveThm(tab, dep, arr){
    
let nbmov = nbEnfants(tab, dep) + 1

console.log("nombre d'enfants= "+nbmov)

    if (dep < 0 || dep >= tab.length || arr < 0 ||  arr >= tab.length) {
        console.error("Index hors limites");
        return;
    }

    const element = tab.splice(dep, nbmov); // Retire l'élément à fromIndex
    
    if (dep<arr) {arr = arr-(nbmov-1)}  

    tab.splice(arr, 0, ...element); // Insère l'élément à la nouvelle position


// mémorise le changement 
window.electronAPI.setThm(tab);

}



// création des règles pour prendre en compte les thématiques multiples
async function multiThm(conteneurID){

    tabThm = await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main
   

    // défilement des spans
    const conteneur = document.getElementById(conteneurID)
     
    const mots = conteneur.querySelectorAll('span');

    let m=0
    var derClasslist = "";

     

    for (let mot of mots) {
        m++;

        
        
        //if (mot.classList.contains('lblseg')) {continue}


        // mise en tableau des classes
        let cats = mot.classList.value.split(" ")

        

        if(derClasslist == cats){ // une seule fois par suite de mots
            return
        }
        derClasslist = cats;

        if (cats.length<=1){continue;}

   

        let chaine = "";
        var nbcats = 0
        var catsThm=[];

        // reconstitution de la chaine
        for (c=0;c<cats.length;c++){

            if (cats[c].lastIndexOf("cat_") >-1){

                // récupération du rang
                let rkc = getRkThm(cats[c]);

                if (!tabThm[rkc].couleur){continue}


                chaine += "." + cats[c]
                nbcats++;
                catsThm.push(cats[c]) // ajoute la ligne au tableau des "vraies thématiques"
            }  

        }

       
        if (nbcats==0){continue};

        if (existCss(chaine) == "true"){continue};


        
        // choix de la première cat pour la couleur de dégradé
        
        let rk1 = getRkThm(catsThm[0]);
        if (rk1=="false") {
             
            catsThm.splice(0,1);
             
            rk1 = getRkThm(catsThm[0]);
        }

        let coul1 = tabThm[rk1].couleur;
        let epaisseur =  10 ; // Math.round(20/catsThm.length);
        let seuildep = 90 - (nbcats-1)*epaisseur; 

        //console.log("avec " + nbcats + "catégories on va démarrer à  " + seuildep)

                // reconstitution du background pour intégrer les lignes supplémentaires
                let chainecoul =""
                nbcats=1                    

                for (c=1;c<catsThm.length;c++){

                    if (catsThm[c].lastIndexOf("cat_") <0){continue}
                    
                    let rkn = getRkThm(catsThm[c]);
                    if (rkn =="false"){continue}

                    nbcats++;

                    let coul = tabThm[rkn].couleur;
                    let prog = seuildep + (epaisseur) *(c)  
                    let prog2 = prog + epaisseur   ; 
                    chainecoul += `, white ` + (prog) + `%,`
                    chainecoul += `white ` + (prog+3) + `%,`
                    chainecoul += coul + ` ` + (prog+3) + `%,`
                    chainecoul += coul + ` ` + prog2 + `%`
                
                }

                


                
        let background;
        if (filigraneActif) {
            background = `background-image: linear-gradient(rgba(250, 250, 250, ${FILIGRANE_OPACITE}), rgba(250, 250, 250, ${FILIGRANE_OPACITE})), linear-gradient(rgba(0, 0, 0, 0) 50%, ` + coul1 + `60 ` + seuildep + `%,` + coul1 + ` ` + Number(seuildep +7) + `% ` + chainecoul +  ` );`
        } else {
            background = `background-image: linear-gradient(rgba(0, 0, 0, 0) 50%, ` + coul1 + `60 ` + seuildep + `%,` + coul1 + ` ` + Number(seuildep +7) + `% ` + chainecoul +  ` );`
        }
         
        // ajout éventuel d'un nouveau style

        const style = document.querySelector('style');
        const sheet = style.sheet;

        // Ajouter des règles CSS via CSSOM pour ne pas écraser les modifications existantes
        const ruleText = chaine + ` { ` + background + ` line-height: ` + (1.5 + (0.05 * nbcats)) + `em; }`;
        sheet.insertRule(ruleText, sheet.cssRules.length);


         





    }

}
 
function getRkThm(code){

 
     
    
    for (let t=0;t<tabThm.length;t++){

        if (tabThm[t].code == code) {
       

            return t; 

        }
    }

    return "false"; 

}

function getThm(rk){

    var ruptAv=0; 
    var ruptAp=0;
    //var tabRuptAv = [];
    //var tabRuptAp = [];
    var spnCur;
    var classesCur;
    effaceSel();

    const spn = getSpan(rk)

    var classes = spn.classList.value
    

    if (classes == "") { thmEnCours(""); return};

     

    var tabClasses = classes.split(" ")

    // on ne garde que les classes thématiques
    tabClasses = tabClasses.filter(cls => cls.startsWith("cat_"));
    if (tabClasses.length==0) {thmEnCours(""); return;}

    for (sp=rk ; sp>0 ; sp--) {

        // le mot a-t-il encore toutes les catégories?
        spnCur = getSpan(sp);

            if(!spnCur){continue}; 

        classesCur = spnCur.classList.value

            for (cat = 0;cat<tabClasses.length;cat++){
                
                 
                if (classesCur.indexOf(tabClasses[cat])<0 ){
                    ruptAv = sp;
                    //tabRuptAv.push({spnrup : sp, thm : tabClasses[cat]})          
                 }
            }
        if (ruptAv > 0){break}

    }

   // console.log("rupture de la continuité thématique au rang " + ruptAv)

    // partie ultérieure 
    
    let nbSpns = getNbSpans();

        for (sp = rk;sp<nbSpns;sp++ ) {

        // le mot a-t-il encore toutes les catégories?
        spnCur = getSpan(sp);

        if(!spnCur){continue}; 

        classesCur = spnCur.classList.value

        if (classesCur==""){
            ruptAp = sp;
            break;
        }

        for (cat = 0;cat<tabClasses.length;cat++){
            
             if (classesCur.indexOf(tabClasses[cat])<0 ){
                ruptAp = sp;
                                     
            }
        }
            if (ruptAp > 0){break}

    }

    
    debSel = ruptAv + 1; 
    finSel = ruptAp -1; 
    
   

    for (sg =debSel;sg<=finSel;sg++){     
        
        conteneur = getSpan(sg)
        if (conteneur) {conteneur.classList.add('survseg');}

    }


    let Spn1 = getSpan(debSel)
    Spn1.classList.add("debsel")

   
    
    let Spn2 = getSpan(finSel)
    Spn2.classList.add("finsel")

     

    listenersFinSel() // ajout du listener lié à fin sel
     
    thmEnCours(classes)
   


}

// vérifie si une règle css existe déjà (pour ne pas la duppliquer)
function existCss(chaine){

    const styleTag = document.querySelector('style');
    const sheet = styleTag.sheet; // Accède à sa feuille de style
    

    // Parcourir les règles CSS
    for (let i = 0; i < sheet.cssRules.length; i++) {
    const rule = sheet.cssRules[i];

        // Vérifier si la règle concerne la classe  
        if (rule.selectorText === chaine) {        
        return "true";        
        }        
    }

    return "false"; 
}

function filtrerThm(){

    document.getElementById('filtreCat').classList.toggle('btnfiltre_actif')

}

function estActifThm(mot){ // vérifie que le mot contient bien une des classes actives

    for (th=0; th<thm.length;th++){

        if (mot.classList.contains(thmCherché)== true) {

        }

    }

return "false"; 
}

function ascendantActif(rkthm){ // permet de définir si un ascendant du thème est actif (ce qui le rend actif )


    // défilement des thèmes 
        // si actif et descendance --> descendance active

        // si actif et ascendance --> Ascendance active (mais pas frères et soeurs)???



    let rang = Number(tabThm[rkthm].rang);
    
    if (rang==0){return "false"} // le thm n'a pas d'ascendant

    for (rk=rkthm-1; rk>0;rk--){
        let rang2 = Number(tabThm[rk].rang);

        console.log(rang + " = " + rang2)
        if (rang2 == rang ||rang2 > rang) {return "false"} // même niveau ou inférieur - > on passe
        
        if (rang2 < rang && tabThm[rk].act==true) {return "true"}

    }

    return "false"; 

}

function isoleThm(){// met en forme l'affichage pour ne conserver que les mots actifs

    
    tabXtr = []
 
    // isolation 
    var contenuHtml="";
    var nbmotstrouvés=0; 
    var premMotTrouvé=-1; 
    var statutDerMot="false"; 


    backUp();

    const conteneur = document.getElementById("segments")
    const mots = conteneur.querySelectorAll('span');
    let thmCherché ="";
    let m=0
 

    for (let mot of mots) {
        

        if (mot.classList.contains('lblseg')) {continue}; 
        
        m++;

        // le mot contient-il l'un de thèmes actif? 
        let estActif = "false"

        // quel mode de filtrage
        let modefiltre = document.getElementsByName('filtreEtOu').value;

        for (th=0; th<tabThm.length;th++){


            if (tabThm[th].act==true ) {            
            
                thmCherché =  tabThm[th].code

                // un des thèmes trouvés, temporairement actif
                if (mot.classList.contains(thmCherché) == true) {
                    estActif="true";                      
                }

                // mais s'il en manque un : inactif
                if (mot.classList.contains(thmCherché) == false) {
                    if (modefiltre =="et")  {
                        estActif="false"; 
                                         
                        break;

                    }

                }
                 

            }   

        
        }

        if (estActif=="false") { // si le mot n'a pas le thm demandé

            //mot.classList.add("dnone")
            mot.style.fontSize ="2px"

            if (statutDerMot =="true") { // fermeture de l'extrait

                tabXtr[tabXtr.length-1].rkfin = mot.dataset.rk; 
    
               }

             
        } else {
            //mot.classList.remove("dnone")
             
           nbmotstrouvés++; 
           
           if (premMotTrouvé == -1){ premMotTrouvé =  mot.dataset.rk} // mémorisation du premier extrait

           if (statutDerMot =="false") { // début d'un nouvel extrait

            tabXtr.push({txt: mot.innerText, rkdeb: mot.dataset.rk, rkfin:null, thm:mot.classList, comm:"commentaire"  })

            // mise en forme des lbl précédentes

             

           }

           if (statutDerMot =="true") { // ajout du mot à l'extrait

            tabXtr[tabXtr.length-1].txt += mot.innerText.trim() + " "; 
            

           }


            mot.style.removeProperty("font-size");
        }


        statutDerMot=estActif; 

    }    

        

    ////////////////////////////////////////////////////////////////////////    
    // cache des lignes de locuteurs qui ne contiennent pas la thématique
    ////////////////////////////////////////////////////////////////////////

    let s=0
    let derLoc =""; 
    let locChangé="false"; 
    
    const segs = conteneur.querySelectorAll('.lblseg');

    for (let seg of segs) {
    s++;     


            // le segment contient-il l'un de thèmes actifs? 
            
            estActif = "false"
            for (th=0; th<tabThm.length;th++){
    
                if (tabThm[th].act==true) {            
                
                    thmCherché =  tabThm[th].code
    
                    posthm = seg.innerHTML.lastIndexOf(thmCherché)

                    if (posthm>-1) {
                        estActif="true"; 
                    }
                }   
    
            
            }

         
          

          let rgloc = seg.dataset.loc; 
          

          if (rgloc != derLoc) {
            
            locChangé="true";
          }


        if (estActif=="false") {
            seg.removeAttribute("data-nomloc");

        } else {
            seg.style.fontSize="18px";

                   

 
          
            //ajout nom du locuteur - si changement
           if (locChangé=="true") {
            
            nomloc=locut[rgloc]
            seg.setAttribute("data-nomloc", nomloc);
            derLoc=rgloc;
            locChangé="false";
        }
            
        }


    }
   
    
    voirBoutonFiltre();
    resumeGraphique(document.getElementById("segments").innerHTML, document.getElementById("graphEnt"));
      if (premMotTrouvé > -1) {scrollToRk(premMotTrouvé);} 

}

function voirBoutonFiltre(){


    let boutonfiltre = document.getElementById("fermerfiltre")
    let resultatfiltre = document.getElementById("resultatfiltre")

    boutonfiltre.innerHTML = ``

    let libellé = ` <label style="min-width: 120px; " > Filtre actif : </label>   
     `

    tabThm.forEach(row => {
        
        if(row.act == true){

        libellé += `<label class=" blocfiltre ` + row.code + `"  style="background-color:` + row.couleur + ` !important;" >` + row.nom.substring(0,20) + `... </label> ` 
        }; 
      });

    boutonfiltre.innerHTML +=libellé; 
    resultatfiltre.innerHTML =  `Copier les ` + tabXtr.length + ` extraits ` ; 

    setTimeout(() => {
        const largeur = boutonfiltre.offsetWidth + 30; // Récupère la largeur réelle
        boutonfiltre.style.left = `calc(100% - ${largeur}px)`; // Applique la position
        resultatfiltre.style.left = boutonfiltre.style.left ; 
        resultatfiltre.style.top = "175px"; 
      }, "100");

      boutonfiltre.classList.remove("dnone")
      resultatfiltre.classList.remove("dnone")


}

function ThmActifs(rk, mode){
    

    // affectation de la valeur faux par défaut en cas d'absence
    tabThm.forEach(row => {
       row.act ??= false; 
      });


     
 

    // affichage
 
    const ligs = document.querySelectorAll('.ligthm');
 
    let rg=0
    for (let lig of ligs) {
        
        if (tabThm[rg]) {

                lig.classList.remove("ligthm-active")
                lig.classList.add("ligthm-inactive")

            if (tabThm[rg].act ==true ){
                
                lig.classList.add("ligthm-active")
                lig.classList.remove("ligthm-inactive")
               
            } 
        }
        rg++; 
    }   

    

   

 
 

//}



}


function auMoisUnact(){ // vérifie si au moins une thématique est actif

    let unAct = "false"; 
    let nbUnAct = 0;

    tabThm.forEach(row => {
       if (row.act == true){
        unAct="true";
        } else {
            nbUnAct++;
        }; 
    });

    return [unAct, nbUnAct];

}


function TousThmAct(){// remise en activité de tous les thm

    tabThm.forEach(row => {
        row.act = "true"
   });
   const ligs = document.querySelectorAll('.ligthm');

   for (let lig of ligs) {

       lig.classList.remove("ligthm-active")
       lig.classList.remove("ligthm-inactive")
      }   

}


function defiltre(){

     console.log("defiltre")

    const conteneur = document.getElementById("segments")
    const mots = conteneur.querySelectorAll('span');
   
    tabThm.forEach(row => {
        row.act = true; 
    });

    
    document.getElementById("fermerfiltre").classList.add("dnone"); 
    document.getElementById("resultatfiltre").classList.add("dnone"); 

   
    afflistThm(); 
    if(!mots){console.log("pas de spans trouvés")}

    for (let mot of mots) {

     mot.style.removeProperty("font-size");
    }    

 

   resumeGraphique(document.getElementById("segments").innerHTML, document.getElementById("graphEnt"));
   checkloc(locut) // remise en ordre des noms de locuteurs

}

function modifCss(regle, attribut, valeur){

    console.log ("css " + regle + " - " + attribut + " - " + valeur )

    
    const styleTag = document.querySelector('style'); // Sélectionne la première balise <style>
    const styleSheet = styleTag.sheet; // Accède à sa feuille de style

    // Parcourir les règles CSS de la feuille de style
    for (let i = 0; i < styleSheet.cssRules.length; i++) {
    const rule = styleSheet.cssRules[i];
    
    // Vérifier si la classe correspond à la classe cible
    if (rule.selectorText ==  regle) {
        
        console.log (" ok css " + regle + " - " + attribut + " - " + valeur )
        
        rule.style[attribut] = valeur ;   
        
        break;
    }
    }



}

function copierSynth(){

var txtHtml = `
<table style="width:100%;border:1px solid grey">
 
<thead>
<tr>
 
<th style="background-color: #2e73d8;color:'white';">Extraits</th>
 
</tr>
</thead>
<tbody> ` 

var txtPlain = ""
 
tabXtr.forEach(d => 
        txtHtml +=  `<tr>` + d.txt + `</tr>`
  
)

tabXtr.forEach(d => 
         txtPlain +=  d.txt + `\r\n \r\n` 

)


txtHtml += `</tbody><table>`

CopiePressePapier(txtHtml, txtPlain);

}





function voirSynth(){


    
    // Sélectionner le conteneur où ajouter le tableau
    const container = document.getElementById("fondsynth");
    
    if (container) {container.innerHTML=""}
 

    // Créer un tableau et son en-tête
    const table = document.createElement("table");
    table.innerHTML = `
    <thead>
        <tr>
        <th>Catégorie(s)</th>
        <th>Extrait</th>
        <th>commentaire</th>
        </tr>
    </thead>
    <tbody></tbody>
    `;

    // Ajouter le tableau au conteneur
    container.appendChild(table);

    tabXtr.forEach(d =>ajoutLigSynth(d.thm, d.txt, d.comm));



        document.getElementById("synthese").classList.remove('dnone');


        function ajoutLigSynth(col1, col2, col3) {
            const tbody = table.querySelector("tbody"); // Sélectionne le tbody
            
            const tr = document.createElement("tr"); // Crée une ligne
            tr.innerHTML = `
              <td>${col1}</td>
              <td>${col2}</td>
              <td>${col3}</td>
            `;
          
            tbody.appendChild(tr); // Ajoute la ligne au tableau
          }

}

function fermeSynth(){

    document.getElementById("synthese").classList.add('dnone'); 
}




// affichage de la liste des catégories pour le filtrage (proche de afflistthm mais apparence et comportement spécifiques)
function afflistThmFltr(){
    
    let dialog= document.getElementById('ssdlg')
    if (dialog) {
        dialog.style.top = "10%";
        dialog.style.display = "flex";
        dialog.style.flexDirection = "column";
        dialog.style.height="80vh";
         
    }
    const conteneur=document.getElementById('listThmFltr');
    
    conteneur.innerHTML = "";


    for (let t=0;t<tabThm.length;t++){



        const div = document.createElement('label');

        div.classList.add(tabThm[t].code);
        div.classList.add('ligthmF');
        div.title=splitNomThm(tabThm[t].nom)[1]; // ajout de la description éventuelle en info-bulle

        // ajout du rang
        let chnRg ="rang_0"
        let rang = tabThm[t].rang
        div.dataset.rang= rang; 

        if (rang){
            chnRg = "rang_" + rang;

        }
      

        div.classList.add(chnRg);
        //div.innerText = tabThm[t].nom;
        div.style.cursor ="pointer"

        if (tabThm[t].couleur){
            div.style.backgroundColor = tabThm[t].couleur +"30"
        }

             // checkbox
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "cbthmF";
            checkbox.dataset.rkthm = t;
            checkbox.checked = tabThm[t].act;
             
             

            // étiquette
            const label = document.createElement("span");
            label.className = "lblthm";
            label.innerText = splitNomThm(tabThm[t].nom)[0]; // ne conserve que le nom, pas la description

            // Ajout
            div.appendChild(checkbox);
            div.appendChild(label);

            conteneur.appendChild(div);

 
        }


        
        // compactage des thm lus
        
        for (let t2=0;t2<tabThm.length-1;t2++){

            //console.log("tabThm["+ t2 +"].cmpct  " + tabThm[t2].cmpct + "\n  enfants " + aEnfants(t2))

            if (tabThm[t2].cmpct=="true" && aEnfants(t2)=="true"){
                  compactThm(tabThm,t2,tabThm[t2].cmpct)}
        }

        listenersThmF();
}

// fonction permettant de distinguer le nom de la thématique (avant // ) des descriptions éventuelles (après //)
function splitNomThm(nom){
    if (!nom || nom.trim() =="") {return ["", ""]};

    let pos = nom.indexOf("//");
    if (pos>-1){
        return [nom.substring(0,pos).trim(), nom.substring(pos+2).trim()];
    }
    return [nom.trim(), ""];
}

function selAllCat(){
 
    const checkboxes = document.querySelectorAll('#listThmFltr input[type="checkbox"]');
    
    let nbCases = checkboxes.length;
   // if (nbCases==0){return}
    
    // nombre de cases cochées
    let nbCasesCochées = 0;
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            nbCasesCochées++;
        }
    });

    // mise à jour de la check box en entête
    let chkAll = document.getElementById("chkAllFiltre");
    if (nbCasesCochées == nbCases) {
        chkAll.innerText = "☐  Tout (dé)sélectionner ";
    } else {
        chkAll.innerText = "☑  Tout (dé)sélectionner";
    };
 
    // (dé)coche toutes les cases
    checkboxes.forEach(checkbox => {
         
        if (nbCasesCochées == nbCases) {
            checkbox.checked = false; // Décoche toutes les cases si toutes sont cochées
        } else {
            checkbox.checked = true;
        }

        // mise à jour du tableau des thématiques   
        const rangthm = Number(checkbox.dataset.rkthm);
        tabThm[rangthm].act = checkbox.checked;

        let lig = checkbox.parentElement;
        if (checkbox.checked) {
            lig.classList.remove("ligthm-inactive");
            lig.classList.add("ligthm-active");
        } else {
            lig.classList.remove("ligthm-active");
            lig.classList.add("ligthm-inactive");
        }
         
    });



}
      
 function listenersThmF(){
    // Sélectionner tous les éléments avec la classe CSS
    const containers = document.querySelectorAll('.cbthmF');

    // listener sur les check boxes
    containers.forEach(container => {
      container.addEventListener('change', (event) => { 
        const checkbox = event.target;
        const rangthm = Number(checkbox.dataset.rkthm);
        tabThm[rangthm].act = checkbox.checked;
        
               
        let lig = checkbox.parentElement;
        if (checkbox.checked) {
            lig.classList.remove("ligthm-inactive");
            lig.classList.add("ligthm-active");
        } else {
            lig.classList.remove("ligthm-active");
            lig.classList.add("ligthm-inactive");
        }

        // prise en compte de la descendance
        // quel est le mode de filtrage
         
        let modefiltre = document.querySelector('input[name="filtreEtOu"]:checked').value;
        console.log("mode de filtrage " + modefiltre + "valeur " + checkbox.checked)
        if (modefiltre =="ou" && checkbox.checked==true) { // si mode OU et activation d'une thématique, on active la descendance
        let fam= aEnfants(rangthm);
        
            if (fam=="true"){
                let rkthm2 = Number(rangthm) + 1;
                while (rkthm2 < tabThm.length) {
                    let rang2 = Number(tabThm[rkthm2].rang);
                    if (rang2 > tabThm[rangthm].rang) {
                        tabThm[rkthm2].act = true;
                        // mise à jour de la check box
                        let chk = document.querySelector('.cbthmF[data-rkthm="' + rkthm2 + '"]');
                        if (chk) {
                            chk.checked = true;
                        }
                    } else {
                        break;  
                    }
                    rkthm2++;
                }
            }
        }


      });     
    });

}


// Supprime les règles CSS multi-catégories générées par multiThm()
// afin qu'elles soient recréées avec la bonne opacité de filigrane
function purgeMultiThmCss() {
    const sheet = document.querySelector('style').sheet;
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const sel = sheet.cssRules[i].selectorText || '';
        if ((sel.match(/\.cat_/g) || []).length > 1) {
            sheet.deleteRule(i);
        }
    }
}

function catsEnFiligrane() {
  filigraneActif = true;
  const btnFilig = document.getElementById('filgraneCat');
  if (btnFilig) btnFilig.classList.add('btn-bleu-actif');
  purgeMultiThmCss();
  loadThm().then(() => {
    if (document.getElementById('segments')) multiThm('segments');
    if (document.getElementById('segments-contenu')) multiThm('segments-contenu');
  });
}

function removeCatsEnFiligrane() {
  filigraneActif = false;
  const btnFilig = document.getElementById('filgraneCat');
  if (btnFilig) btnFilig.classList.remove('btn-bleu-actif');
  purgeMultiThmCss();
  loadThm().then(() => {
    if (document.getElementById('segments')) multiThm('segments');
    if (document.getElementById('segments-contenu')) multiThm('segments-contenu');
  });
}

function filigraneCats() {
  if (filigraneActif) {
    removeCatsEnFiligrane();
  } else {
    catsEnFiligrane();
  }
}


async function compterCatActifs(){

    tabThm= await window.electronAPI.getThm(); // récupération du tableau des thématiques depuis main

    let nbActifs = 0;
    tabThm.forEach(row => {
        if (row.act == true){
            nbActifs++;
        }
    });

    if (nbActifs < tabThm.length) {
    document.getElementById('lbl-nb-cat').innerText = "(" + nbActifs + " / " + tabThm.length + ")";
    } else {
    document.getElementById('lbl-nb-cat').innerText = "(" + tabThm.length + ")";
    }
}
// Export CommonJS pour utilisation dans main.js (contexte Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadThm,
        afflistThm,
        createThm,
        thmSeg,
        selModifThm,
        ajoutThm,
        aEnfants,
        compactThm,
        supprStyle,
        filtrerThm,
        isoleThm,
        defiltre,
        copierSynth,
        voirSynth,
        fermeSynth,
        afflistThmFltr,
        selAllCat, 
        affichListThmCrp,
        affichListThmEdit,
        chargerCmbMoveThm,
        cmbMoveThm,
        moveThm,
        multiThm,
        ajoutThmApres,
        catsEnFiligrane,
        removeCatsEnFiligrane
         

    };
}

// Export global pour utilisation dans le renderer (contexte navigateur)
if (typeof window !== 'undefined') {
    window.loadThm = loadThm;
    window.afflistThm = afflistThm;
    window.createThm = createThm;
    window.thmSeg = thmSeg;
    window.selModifThm = selModifThm;
    window.ajoutThm = ajoutThm;
    window.aEnfants = aEnfants;
    window.compactThm = compactThm;
    window.supprStyle = supprStyle;
    window.filtrerThm = filtrerThm;
    window.isoleThm = isoleThm;
    window.defiltre = defiltre;
    window.copierSynth = copierSynth;
    window.voirSynth = voirSynth;
    window.fermeSynth = fermeSynth;
    window.afflistThmFltr = afflistThmFltr;
    window.selAllCat = selAllCat;
    window.affichListThmCrp = affichListThmCrp;
    window.affichListThmEdit = affichListThmEdit;
    window.chargerCmbMoveThm = chargerCmbMoveThm;
    window.cmbMoveThm = cmbMoveThm;
    window.moveThm = moveThm;
    window.multiThm = multiThm;
    window.ajoutThmApres = ajoutThmApres;
    window.catsEnFiligrane = catsEnFiligrane;
    window.removeCatsEnFiligrane = removeCatsEnFiligrane;
    
    // listener IPC pour rafraîchir la liste des thématiques
    if (window.electronAPI && typeof window.electronAPI.onThematisationRefresh === 'function') {
        window.electronAPI.onThematisationRefresh(async (data) => {
            // data est optionnel — récupérer tabThm si nécessaire
            let tabThm = data?.tabThm ?? await window.electronAPI.getThm();
            try {
                affichListThmCrp(tabThm);
            } catch (e) {
                console.error('Erreur lors du rafraîchissement des thématiques :', e);
            }
        });
    }

}

