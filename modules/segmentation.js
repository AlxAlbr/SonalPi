function clicSeg(rk,sg){ //ce qu'il se passe quand on clique sur un mot

 
     
    if (!rk){return}
    if (!sg){return}

    // ⭐ Vérifier si c'est un clic sur un mot anonymisé en mode pseudo (seulement en mode anon)
    const chkAnon = document.getElementById('chkAnon');
    const span = getSpan(rk);
    if (typeAction === "anon" && chkAnon && chkAnon.checked && span && (span.classList.contains('anon') || span.classList.contains('anon-exception'))) {
        // Afficher le menu d'exception pour ce mot
        if (typeof showMenuException !== 'undefined' && typeof trouverOccurrenceAnonyme !== 'undefined') {
            const result = trouverOccurrenceAnonyme(rk, rk);
            if (result) {
                const { idxPaire, matchIdx } = result;
                showMenuException(span, idxPaire, matchIdx);
                return;
            }
        }
    }
     
    selSegment(sg,false)
    

            let seg = getSeg(sg)
            if (seg) {
    
                if (audio.paused == true ) {
                posi = Number(seg.dataset.deb)
                poslecteur(posi)
                }
            }

      // ⭐ Mettre à jour seg_cur avant le return pour que la navigation au clavier parte du bon segment
      seg_cur = sg;
      if (typeAction !="cat" && typeAction !="anon") { return;} // si on n'est pas en mode catégorie ou anon, on ne fait rien

    /*
    if (mode_cat==false && sg >0) { // comportement hors mode de catégorisation
        
            // récupération de la position du segment courant
            let seg = getSeg(sg)
            posi = Number(seg.dataset.deb)
            poslecteur(posi)
    
        //return
    };
    */ 
     
      // selSegment(sg)
    
       seg_cur=sg;
       mot_cur=rk;
    
        if (debSel!= rk && finSel==0 ) { // si le mot cliqué n'est pas le mot de début de sélection
        
            //effaceSel(); // on efface la sélection précédente
            //effaceSurv(); // on efface le survol précédent

            // récupération de la position du segment courant
            let seg = getSeg(sg)
            if (seg) {
    
                if (audio.paused == true ) {
                posi = Number(seg.dataset.deb)
                poslecteur(posi)
                }
            }
         
        }
    
        // Protection : si une sélection est en cours (debSel posé, finSel pas encore fixé),
        // compléter directement sans passer par getThm, quelles que soient les classes du mot.
        if (debSel && !finSel) { finSel = Number(rk); survOk(); return; }

        if (debSel==0){
            // si le mot a déjà une catégorie, afficher directement sa continuité thématique
            const spnClic = getSpan(rk);
            if (spnClic && Array.from(spnClic.classList).some(c => c.startsWith("cat_"))) {
                getThm(rk);
                return;
            }
            debSel=Number(rk);
            afficherMenuSelAttente();
            return; // sinon, définition du début de sélection
        }
    
        if (debSel!=0 && finSel!=0){
            
            if (debSel>rk || finSel<rk ) {
                // Mot hors de la sélection courante
                const spnClic = getSpan(rk);
                if (spnClic && Array.from(spnClic.classList).some(c => c.startsWith("cat_"))) {
                    // Mot thématisé → sélectionner directement sa portion thématique
                    effaceSurv();
                    getThm(rk);
                    return;
                }
                debSel=0;finSel=0;
                effaceSurv();
                thmEnCours(spnClic ? spnClic.classList.value : '');
            } else (
                survSeg(rk) // on survole le mot cliqué
            )
    
        } // retour à zéro

        if (debSel>0 ){ // il y a déjà un rang de début, on définit un rang de fin

           // if (debSel==rk){debSel=0;finSel=0;return}
                  
            if (finSel==0){finSel=Number(rk);survOk();return}

            // ajouter les classes debsel et fin (si aucune classe n'est déjà présente = quand la sélection à la souris ne fonctionne pas)
            if (document.querySelectorAll(".debsel , .finsel").length==0) {
            const Spn1 = getSpan(debSel);
            const Spn2 = getSpan(finSel);
            Spn1.classList.add("debsel")        
            Spn2.classList.add("finsel")
            }

             // effacement de la sélection de segment (sauf en mode locuteurs)
            if (typeAction !== "loc") {
                document.querySelectorAll('.lblseg.segselected').forEach(segment => segment.classList.remove('segselected'));
            }
            
            getThm(rk)
        } 
         
        
    
    }
    
    
    function survSeg(rk){//ce qu'il se passe quand on survole un mot
    
      
          
        
            if (typeAction !="cat" && typeAction !="loc") { return;} // si on n'est pas en mode catégorie ou locuteur, on ne fait rien


            if (debSel==0){return;}
            if (debSel!=0 && finSel !=0){return;}
            let rang2 = Number(rk)
    
            var survsel=rk;
    
          

            // effacement de la classe de survol
            const tousLbl = document.querySelectorAll('.survseg'); // document.getElementsByClassName("survseg")
             
    
            tousLbl.forEach((survseg,index) => {
    
                let rang = Number(survseg.dataset.rk)
                   //console.log(rang)  
                if (rang>=rang2){        
                        survseg.classList.remove('survseg');
                } 
    
                });
    
        // ajout de la classe de survol
        
     
        
        for (sg =debSel;sg<=rang2;sg++){     
            
            conteneur = getSpan(sg)
            if (conteneur) {conteneur.classList.add('survseg');}
    
        }

           // effacement de la sélection de segment (sauf en mode locuteurs où segselected doit persister)
            if (typeAction !== "loc") {
                document.querySelectorAll('.lblseg.segselected').forEach(segment => segment.classList.remove('segselected'));
            }
    
        // ajout de la classe de survol
    
    
    }
    
    
    function survOk(){

        document.querySelectorAll(".survseg").forEach(el => el.classList.add("survok"));
        document.querySelectorAll(".survseg").forEach(el => el.classList.remove("survseg"));
        afficherMenuSel();
    }
    function effaceSurv(){
     // effacement de la classe de survol
    
     document.querySelectorAll(".survok").forEach(el => el.classList.remove("survok"));
     document.querySelectorAll(".survseg").forEach(el => el.classList.remove("survseg"));
     document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));   
    
     /*
     const tousLbl = document.querySelectorAll('.survseg'); // document.getElementsByClassName("survseg")
            
            tousLbl.forEach((survseg,index) => {
    
                survseg.classList.remove('survseg');
                survseg.classList.remove('debsel');  
                survseg.classList.remove('finsel');         
     
    
            });
     */               
     
    
    }
    
     
    function effaceSel(){
     // effacement de la classe de survol SAUF pour les anonymisations
     const tousLbl = document.querySelectorAll('.segselect, .debsel , .finsel'); // document.getElementsByClassName("survseg")
            
            tousLbl.forEach((survseg,index) => {
    
                survseg.classList.remove('segselect');
                
                // Si ce n'est pas une anonymisation, retirer debsel et finsel
                if (!survseg.classList.contains('anon')) {
                    survseg.classList.remove('debsel');      
                    survseg.classList.remove('finsel');
                }
    
            });
            
            // Retirer aussi le surlignage des occurrences
            clearHighlightOccurrences();
    }
    
    

// fonction de sélection des mots d'après leur rang
/*
function getSpan(sg) {

    let chaine = `[data-rk="`+ sg + `"]`
    const conteneur = document.querySelector(chaine);
    //console.log("cont : " + conteneur)
    return conteneur;


}

// fonction de sélection des segments d'après leur rang
function getSeg(sg) {

    let chaine = `[data-rksg="`+ sg + `"]`
    const conteneur = document.querySelector(chaine);
    return conteneur;
    
    
    }

*/
 

function getSegContent(sg){ // fonction renvoyant le contenu d'un segment

     
    let chaine = `[data-rksg="`+ sg + `"]`
    const conteneur = document.querySelector(chaine);

    if (!conteneur) {return ("par trouvé");}

    var texte = "";

    const mots = conteneur.children;
    
     

    for (let mot of mots) {
              
        
        texte += mot.innerText ;
         
        
    
    }

     
    


    return texte;
    

}


function getNbSegs(){ // fonction permettant de compter le nombre de segments

    segs = document.getElementsByClassName('lblseg')

    const tableau = Array.from(segs)

    return tableau.length;

    
}

 
function getNbSpans(){ // fonction permettant de compter le nombre de spans

    const nbspn = compterElements(document.getElementById('segments'), "span","lblseg")
    
    return nbspn;
    
    
}
    


function compterElements(conteneur, type, classeExclue) {

    return Array.from(conteneur.querySelectorAll(type))
                .filter(el => !el.classList.contains(classeExclue))
                .length;
}

function nbMotsEnt(html){ // fonction permettant de compter le nombre de mots dans un entretien

    if (!html){return 0;}
    
    const div = document.createElement('div');
    div.innerHTML = html;


    div.innerHTML = html.replace(/`/g,'');// suppression des backticks;        

            // nombre de mots
        let mots = div.querySelectorAll("span")

            // nombre de mots       
           const derSpan = [...mots]
                .filter(m => !m.classList.contains('lblseg'))
                .reduce((max, m) => Number(m.dataset.rk) > Number(max?.dataset?.rk ?? -1) ? m : max, null);

            let nbMots = derSpan
                ? Number(derSpan.dataset.rk) + Number(derSpan.dataset.len || 0)
                : 0;
    console.log("nb mots trouvés " + nbMots )     
    return nbMots;

}

function décalageRk(deb, aj){

    if (deb<0) {return}; 
     

    const mots = document.querySelectorAll('span');
    index=deb
    
    for (m=deb;m<mots.length;m++)  {
            
        if (mots[m].dataset.rk < deb ){
            continue;
        }

            if (!mots[m].classList.contains('lblseg') ){ 
                mots[m].dataset.rk =Number(mots[m].dataset.rk)+ aj;
            } 

            if (mots[m].classList.contains('lblseg')){
                mots[m].tabIndex =Number(mots[m].tabIndex)+ aj;
            }

          



    index++;
             
    }


 

}

function ajustRk(){ // correction des rangs pour corriger les manquants 
    
    const mots = document.querySelectorAll('span');
    var evolRK = 0
    var nbVus= 0;
    var derSegVu = 0;

    for (m=1;m<mots.length;m++)  {
        evolRK = 0;

        // détection des décalages dans le rang des mots
        if (!mots[m].classList.contains('lblseg')  ){  // si on est dans un span du texte
            nbVus++;  
            let rk_cur = Number(mots[m].dataset.rk)

            //console.log ("rang courant " + rkcur)

            if (rk_cur>nbVus){
                
                evolRK = Number(nbVus - rk_cur);

            }  

            if (rk_cur<nbVus){
                
                evolRK = Number(rk_cur- nbVus);

            }  

        

            if (evolRK !=0){
                
                let ancRg =Number(mots[m].dataset.rk);
                let nvRg = Number(ancRg + evolRK);
                               
                mots[m].dataset.rk =nvRg
                

                
            }  

            // ajustement du segment complet 

            let rgSeg= Number(mots[m].dataset.sg);

            if (rgSeg!=derSegVu) {

                derSegVu = rgSeg; // mémorisation du segment courant (pour n'ajuster qu'en cas de changement)
                
                seg=getSeg(rgSeg);

                if (seg){
                    seg.tabIndex = mots[m].dataset.rk;
                }
            }    
        }




             
    }

}

function reinitRk(){ // fonction de réinitialisation générale des rangs des mots et des segments

var m = 1; 
var s=0; 
     
const fond = document.getElementById("segments")
const mots = fond.querySelectorAll('span');

for (let mot of mots) {
 
        // c'est un mot
        if (!mot.classList.contains('lblseg') ){ 
            mot.dataset.rk =m;
            mot.dataset.sg =(s-1);

            m++;  // incrémentation 
        } 

        // c'est un segment
        if (mot.classList.contains('lblseg')){

            mot.tabIndex =m;
            mot.dataset.rksg = s; 

            mot.removeAttribute("data-sg"); // pour des raisons pas claires, certains segments ont l'attribut sg alors que le rang de segment est stocké dans le dataset "rksg" pas sg

            s++; 
        }

      



 
         
}


    
}

 


/////////////////////////////////////////////////////////////////////////////////////////////
// SAUVEGARDE DES SEGMENTS
/////////////////////////////////////////////////////////////////////////////////////////////

var divSegments = document.getElementById('segments')   





// Piles undo/redo — le plus récent est en fin de tableau (pop/push)
var BkUp = [];
var BkUpRedo = [];
var MAX_HISTORY = 20;


function initBkUp(){
    console.log("init backup");
    BkUp = [];
    BkUpRedo = [];
    let divSegments = document.getElementById('segments');
    divSegments.addEventListener("paste", () => backUp());
}

function backUp(){ // mémorisation de l'état courant avant une modification

    let currentHTML = document.getElementById('segments').innerHTML;

    // Ne pas sauvegarder si identique au dernier état déjà mémorisé
    if (BkUp.length > 0 && BkUp[BkUp.length - 1] === currentHTML) { return; }

    // Nouvelle action : effacer la pile de rétablissement
    BkUpRedo = [];

    // Empiler l'état courant
    BkUp.push(currentHTML);

    // Limiter l'historique
    if (BkUp.length > MAX_HISTORY) { BkUp.shift(); }

    console.log("backup — " + BkUp.length + " état(s) en mémoire");
}

function undo(){

    console.log("undo — " + BkUp.length + " état(s) undo, " + BkUpRedo.length + " état(s) redo");

    if (BkUp.length === 0) {
        console.log("Rien à annuler");
        res = question("Il n'y a aucune action à annuler",["ok"])
        return;
    }

    // Sauvegarder l'état courant pour permettre le redo
    BkUpRedo.push(document.getElementById('segments').innerHTML);

    // Restaurer l'état précédent
    document.getElementById('segments').innerHTML = BkUp.pop();

    console.log("undo terminé — reste " + BkUp.length + " état(s)");
}

function redo(){

    console.log("redo — " + BkUpRedo.length + " état(s) redo");

    if (BkUpRedo.length === 0) {
        res = question("Il n'y a aucune action à refaire",["ok"])
        //console.log("Rien à refaire");
        return;
    }

    // Sauvegarder l'état courant pour permettre un undo ultérieur
    BkUp.push(document.getElementById('segments').innerHTML);

    // Restaurer l'état suivant
    document.getElementById('segments').innerHTML = BkUpRedo.pop();

    console.log("redo terminé — reste " + BkUpRedo.length + " état(s) redo");
}

 function selSegment(seg,edit){
  


    // if (noSel == false) {return} // si la sélection est activée, on ne fait rien

    if (seg === null || seg === undefined){return} // ⭐ !seg excluait le segment 0 (falsy)


    //console.log ("sélection du segment " + seg)
    seg = Number(seg); // ⭐ dataset.sg est une chaîne, forcer la conversion numérique
    if (seg<0){seg=0};
    seg_cur=seg ; 
    //if (seg>=TabSeg.length) {seg= TabSeg.length-1}
    
    let infos = infoSeg(seg); // récupération des infos sur le segment

    

    // retrait des sélecteurs partout
    
    const segs = document.querySelectorAll('.lblseg');

    for (let segment of segs) {
        
        segment.classList.remove('segselected');
        
        if (segment.dataset.rksg == seg) {
            //console.log ("ajout du segselect dans le seg " + seg)
            // ⭐ La classe segselected doit être ajoutée SEULEMENT pour la fonction locuteurs
            // !debSel gère à la fois null, undefined et 0
            if (!debSel && !finSel && typeAction === "loc"){
            segment.classList.add('segselected')
            }
        }
        
    }
         
   
   

   // conteneur.classList.add('.segselect');

    
    const conteneur = getSeg(seg) 
    let locuteur = conteneur.dataset.loc;
    let rksg = Number(conteneur.dataset.rksg) +1 ;
 
    ////console.log(infos[0].db)

    // affichage détaillé du segment courant 
    document.getElementById('lbldetails').textContent = 'Segment ' + rksg + '/' + getNbSegs();
    document.getElementById('lblpos').textContent = SecToTime(infos[0].db ,true) + " - " + SecToTime(infos[0].fn ,true) 
       
    

/*

    if (edit==true){ 
        document.getElementById('txtseg').classList.remove("dnone")
        document.getElementById('btnsplit').classList.remove("dnone")
        poslecteur (TabSeg[seg][1]);
        /*document.getElementById(nom).contentEditable =true;
        document.getElementById(nom).style.backgroundColor="white"
        dsTxtArea=true;
    } else {
        document.getElementById('txtseg').classList.add("dnone")
        document.getElementById('btnsplit').classList.add("dnone")
        /*document.getElementById(nom).contentEditable =false;
        document.getElementById(nom).style.backgroundColor="none"
        dsTxtArea=false; 
    }

     */

    // affichage du locuteur courant

    let rgloc = conteneur.dataset.loc 

    const locuts = document.querySelectorAll('.btnloc');

    for (let loc of locuts) {
        loc.classList.remove('isselloc');
  
    }
      
 
    if ( rgloc>0){
    let nombtnloc = "btnloc" + rgloc
    let btnloc =  document.getElementById(nombtnloc)
        if (btnloc) {
            btnloc.classList.add("isselloc");
        }
    }


     

   barreProg(seg);


    return; 


 //'détermination de la position de la ligne  à modifier

    //position du cadre (à déduire)
    var PosCadre = document.getElementById("contenu").getBoundingClientRect();
    PosYC = PosCadre.top;
    PosXC = PosCadre.left;

    // Scroll
    
    var scrlY = window.scrollY;


    //position de l'étiquette
    
    //var nomSeg = String("sg" + (seg));
    var segmodif =getSeg(seg)
    

    var Pos = segmodif.getBoundingClientRect();
    var PosY = Number(Pos.top - 5)   ; //Pos.top;
    var PosX = Number(Pos.left - 10);
    var PosH = Number(Pos.height)  + 10;
    var PosW = Number(Pos.width + 30);

    //document.getElementById("info").innerText = "pos du seg : " + PosY + " /n pos du scroll : " + scrlY + " /n pos du cadre : " + PosYC;

      
 
 

    // évitement de la sortie de l'écran
    var ht = window.innerHeight;
    if (PosY>ht -120) {
        document.body.scrollTop = document.body.scrollTop + ht - 210;
    }   

    if (PosY<0) {
        document.body.scrollTop = document.body.scrollTop + PosY;
    } 



}
function infoSeg(seg){
 
  
  if (!seg){return}

    const sg = getSeg(seg)

    var posdeb = Number(sg?.dataset?.deb ?? 0);
    var posfin = Number(sg?.dataset?.fin ?? 0);
    let locut = Number(sg?.dataset?.loc ?? 0);

    let result = [{db: posdeb, fn: posfin, loc:locut}];
     
    return result;
    
};


function SplitSeg(debS,finS){

console.log("découpage du segment entre les mots " + debS + " et " + finS)

    backUp();

            // procédure de segmentation sur la base de la position des mots

           
            // variables
            var rksg1; // rang du segment 1
            var rkDbSg1; // rang du premier mot du segment 1
            var rkFnSg1 ; // rang du dernier mot du segment 1

            var rksgf; // rang du segment final
            var rkDbSgf; // rang du premier mot du segment final
            var rkFnSgf ; // rang du dernier mot du segment final

            var posDebSeg; // position de départ du segment
            var posFinSeg; // position de fin du segment

            var posCalcD; // inférence de position dans le segment de début
            var posCalcF; // inférence de position dans le segment de fin
           
            var nbmotsSeg;
            let chaine= "";
            let rgsuiv = 0;
            let duree = 0;
            let nbmAv=0; // nombre de mots AVANT le premier mot choisi dans le segment (fusion)
            let nbmAp=0; // nombre de mots APRES le dernier mot choisi dans le segment (fusion)

        // segment de début

            // récupération de l'index dans le span de début
            //chaine = `[data-rk="`+ debS + `"]`
            const spnDbs = getSpan(debS) 
              
            
            // récupération du segment parent
            const spnSg1 = spnDbs.parentNode
            rksg1 = spnSg1.dataset.rksg
            rkDbSg1 = spnSg1.tabIndex

            posDebSeg = Number(spnSg1.dataset.deb)
            posFinSeg = Number(spnSg1.dataset.fin)
            

             // définition du nombre de mots entre le début du segment et le mot de début 
            //var nbmotsAv = Number(debS - rkDbSg1);


            // définition du nombre de mots dans le segment
            // récupération de l'index dans le span de début
            rgsuiv = Number(rksg1)+1;
            const spnSuiv = getSeg(rgsuiv)
            
            if(spnSuiv) {
            rkFnSg1  = Number(spnSuiv.tabIndex) - 1; 
            } else {
            rkFnSg1 = getNbSpans()
            }
            
            nbmS = rkFnSg1  - rkDbSg1;
            nbmAv = debS - rkDbSg1;
        
            duree = Number(posFinSeg)-Number(posDebSeg)
            // inférence de la position du mot dans la bande
            posCalcD = posDebSeg + (nbmAv/nbmS) *(duree)
            posCalcD = posCalcD.toFixed(3)

                console.log("Segment de début \n ---------------------------------------");
                console.log("on est dans le segment " + rksg1 + " qui débute au mot " + rkDbSg1 + " et se termine au mot " + rkFnSg1)
                console.log("la position de départ est " + debS)
                console.log("il y a " + nbmAv + "mots avant dans le segment" )

                //console.log("position supposée " + posCalcD);
                 

        


        // segment de fin

                    // récupération de l'index dans le span de début
                    const spnFns = getSpan(finS)
                    
                    
                    // récupération du segment
                    const spnSg2 = spnFns.parentNode
                    rksgf = spnSg2.dataset.rksg
                    rkDbSgf = spnSg2.tabIndex

                    posDebSeg = Number(spnSg2.dataset.deb)
                    posFinSeg = Number(spnSg2.dataset.fin)
                    

                    // définition du nombre de mots entre le début du segment et le mot de début 
                    //var nbmotsAv = Number(debS - rkDbSg1);


                    // définition du nombre de mots dans le segment
                    // récupération de l'index dans le span de début
                    rgsuiv = Number(rksgf)+1;
                    const spnSuiv2 = getSeg(rgsuiv);

                    if (spnSuiv2) {
                    rkFnSgf  = Number(spnSuiv2.tabIndex)-1; 
                    } else {
                    rkFnSgf = getNbSpans();    
                    }
                    
                    nbmS = rkFnSgf  - rkDbSgf;
                    nbmAp =  rkFnSgf - finS ;
                
                    duree = Number(posFinSeg)-Number(posDebSeg)
                    // inférence de la position du mot dans la bande
                    posCalcF = posDebSeg + ((nbmS - nbmAp)/nbmS) *(duree)
                    posCalcF = posCalcF.toFixed(3)


            
            
                    console.log("Segment de fin \n ---------------------------------------");
                    console.log("on est dans le segment " + rksgf + " qui débute au mot " + rkDbSgf + " et se termine au mot " + rkFnSgf)
                    console.log("la position de fin est " + finS)
                    console.log("il y a " + nbmAp + "mots après dans le segment" )
                        
                    //console.log("position supposée " + posCalcF);
            

                    console.log("analyse de la situation \n ---------------------------------------");
                    console.log("nombre de segments impliqués "+ Number(rksgf-rksg1+1));
                    console.log("nombre de mots dans le seg 1 avant le début" + (nbmAv));
                    console.log("nombre de mots dans le seg f après la fin" + (nbmAp));

            // conditions d'arrêt
            // si le début est après la fin
            if (debS>finS){ return;}

            if (!rkDbSg1 || !rkFnSgf){ return;} // si les segments n'existent pas

            // si le début ou la fin sont hors du texte
            if (debS<rkDbSg1 || finS>rkFnSgf){ return;} 


            // si la sélection correspond exactement à un segment    
            if (rksgf==rksg1 && nbmAv ==0 && nbmAp ==0){
                console.log("Rien à segmenter")
                seg_cur = rksg1; 
                debSel=0;
                finSel=0;
               effaceSurv();
                return;
            }
    
                       
    
            // Création d'un nouveau segment interne   
                 
                
                // clone à partir du segment contenant la position de départ
                let nvSeg1 = spnSg1.cloneNode(false);
                spnSg1.dataset.fin = posCalcD;

                // rang du segment ajouté
                let rksgaj = Number(rksg1);

                if (nbmAv>0){rksgaj++} // incrémenté de 1 si le premier n'est pas vide
              

                // mise à jour des informations
                nvSeg1.tabIndex = debS;
                nvSeg1.dataset.rksg = rksgaj;
                nvSeg1.dataset.deb = posCalcD;
                nvSeg1.dataset.fin = posCalcF;
                nvSeg1.dataset.statut="deb"

                // Création d'un segment final
                let  nvSeg2 = document.createElement("span");
                
                // clone à partir du segment précédent
                nvSeg2 = nvSeg1.cloneNode(false);

                if (nbmAp>0){rksgaj++} // incrémenté de 1 si le premier n'est pas vide
                nvSeg2.tabIndex = Number(finS+1);
                nvSeg2.dataset.rksg = Number(rksgaj);
                nvSeg2.dataset.deb = posCalcF;
                nvSeg2.dataset.fin = posFinSeg;
                nvSeg2.dataset.statut="fin"
                 
                 

                // reconstitution du segment intérieur
                for (sg =debS;sg<=rkFnSgf;sg++){       

                    const spnOrrig = getSpan(sg)

                    if (!spnOrrig) {continue;}

               

                    // création d'un nouveau span
                    let nvSpn = spnOrrig.cloneNode(true)
                    nvSpn.dataset.sg = nvSeg2.dataset.rksg;
                    //nvSpn.innerHTML = spnOrrig.innerHTML;
                    
                    // défition du segment ou ajouter le span échangé
                    
                    // si avant la fin
                    var segArrivee;

                        if (sg<=finS) {
                            nvSpn.dataset.sg = nvSeg1.dataset.rksg;
                            segArrivee = nvSeg1

                        } else {

                            nvSpn.dataset.sg = nvSeg2.dataset.rksg;
                            segArrivee = nvSeg2

                        }


                    segArrivee.appendChild(nvSpn)
                    // suppression du mot recopié
                    spnOrrig.remove()


                    
            } 


            //if (debS - rkDbSg1==0) {spnSg1.remove() }




            // ajout du nouveau segment intérieur après le segment de départ

            var nbaj = Number(rksg1-rksgf);  // définition du nombre de segments ajoutés

            
                    const fond = document.getElementById("segments")
                                
                    rgsuiv = Number(rksg1)+1;
                    
                    //console.log("rang segment suivant (rgsui): " + rgsuiv)

                    const segSuiv = getSeg(rgsuiv) 

                    console.log("segment suivant (rgsui): " + segSuiv.innerText)

                    if (segSuiv == null) {
                        console.log("segment suivant null, on ajoute à la fin")
                         return
                    }


                        //
                        if (nbmAv>0) { nbaj ++;} // ne crée le span précédent que s'il y a du contenu
                           
                        fond.insertBefore(nvSeg1,segSuiv)
                        

                        

                        if (nbmAp>0) { // ne crée le span suivant que s'il y a du contenu
                            fond.insertBefore(nvSeg2,segSuiv)
                            nbaj ++;
                        }







             
            
            // décalage des segments suivants

             

 
            var spnCur= segSuiv // calage du contrôleur sur le premier span du nouveau segment

            
            // Parcourir tous les éléments suivants jusqu'à la fin
            while (spnCur.nextElementSibling) {

                // incrémentation des contrôleurs

                 
                    
                    spnCur.dataset.rksg = Number(spnCur.dataset.rksg) + nbaj

                    if (spnCur) {
                            
                        const mots = spnCur.children;  

                        for (let mot of mots) {
                        
                            mot.dataset.sg = Number(mot.dataset.sg) + nbaj //mots
                            
                            if (mot.classList.contains("ligloc")){
                            mot.dataset.rk = Number(mot.dataset.rk) + nbaj //lignes locut
                            }
                        }
                    }

                                

                  
                 
 

                // 

            spnCur = spnCur.nextElementSibling; // Aller au frère suivant
             
             
            }

            // suppression des spans vides 
            const mots = document.querySelectorAll('span');

            mots.forEach((mot, index) => {  
                    if (mot.innerText.trim()=="") {
                      // mot.remove();
                    }
            });

            // suppression des segments vidés suite à la fusion            
            const lblsegments = document.querySelectorAll('.lblseg');
    
            lblsegments.forEach((oldseg, index) => {
                             
                // suppression des tous les segments vides
                if (oldseg.hasChildNodes() == false) {
                oldseg.remove();
                     
                }

 
            })
            
            
            debSel=0;
            finSel=0;
  
            effaceSurv();
            effaceSel();
            seg_cur = nvSeg1.dataset.rksg

            //selSegment(seg_cur,false)

            return(seg_cur);

 


}


function Phrasifier(){ // petite fonction visant à regrouper les segments en phrases 

    var nbseg = TabSeg.length ;
    const finPhrase = new Set(['.', '?', '!'])
    var asquizzer = [];


    
    for (s=0;s<TabSeg.length- 1;s++){
        
        const str = TabSeg[s][4];
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

function compactSegs(){ // fonction compactant tous les segments d'un même locuteur
 
 
    
    // changement de locuteur le plus avancé
    let derchg;

    for (s = TabSeg.length-1;s>-1;s--){

        if (TabSeg[s][3] != TabSeg[s-1][3]){
            derchg=s;
            break;
        }

    }

   

    let debut=-1;
    

    let loc = "init"
    
    for (s=0;s<derchg;s++){

        if (TabSeg[s][3] != "" && TabSeg[s][3] != loc ){ // il y a changement de locuteur
            
           

            loc = TabSeg[s][3] ;

            if (debut<0){ // s'il n'y a pas de début défini
                
                debut=s;
                

            } else { // s'il y a déjà un début, alors c'est la fin
                fin = s
                

                if (fin-debut > 1) {

                  
                    // empilement de tous les segments sur le premier

                    for (s2=debut+1;s2<fin;s2++){

                        // fusion des textes
                        let str = TabSeg[debut][4] 
                        let endtxt = str.slice((str.length-1));
                        let spc = "";

                        if (endtxt != " ") { spc = " "} // si pas d'espace à la fin du segment de début > ajout

                        TabSeg[debut][4] += spc + TabSeg[s2][4]; 
                        
                        TabSeg[debut][2] = TabSeg[s2][2];

                        TabSeg[s2][4] =""; //vidage du segment
                    }



                    
                    

                }

                debut = s; 
            }

            
        }  



    }
    
    // effacement des segments vidés
    
    for (s=0;s<TabSeg.length;s++){

        if (TabSeg[s][4]=="") {
            //alert("il faut supprimer la ligne "+ s)
            TabSeg.splice(s,1);
            s--;
            seg_cur--;
        }

    }

    affSegments(0);
    selSegment(seg_cur,false);


}

////////////////////////////////////////////////
// compactage des segments
////////////////////////////////////////////////

function inlineSeg(seg){

     
    backUp();


      let sg1 = getSeg(seg)  
      if (sg1) {
        //console.log ("modif du seg 1")
        //sg1.classList.add("cmpct") 
        sg1.classList.remove("sautlig") 

      }

       seg++;

      let sg2 = getSeg(Number(seg));

      if (sg2) {
        //console.log ("modif du seg " +seg )
        //sg2.classList.add("cmpct") 
        sg2.classList.remove("sautlig") 

        
      }
         

}

function compactJusqua(seg){

backUp();

    if (seg=="tout") {seg = getNbSegs()} 

    for (s=0 ; s<seg; s++ ){

        let sg1 = getSeg(s)  
      if (sg1) {
        
    sg1.classList.remove("sautlig") 

      }
    };
}

function decompact(){
    
    backUp();

seg = getNbSegs() 

for (s=0 ; s<seg; s++ ){

    let sg1 = getSeg(s)  
  if (sg1) {
    
    sg1.classList.add("sautlig") 

  }
};
}



function fusionSegs(seg){

     
    TabSeg[seg][4] = TabSeg[seg][4] + " " + TabSeg[seg+1][4]; // fusion des textes
    TabSeg[seg][2] = TabSeg[seg+1][2];

    TabSeg.splice(seg+1,1);
    

}


// ============================================================
// Menu d'attente — affiché dès le 1er clic (debSel posé, finSel en attente)
// ============================================================
function afficherMenuSelAttente() {

    const oldMenu = document.getElementById('menu-sel');
    if (oldMenu) oldMenu.remove();

    const spnDeb = getSpan(debSel);
    let topPos = 120;
    if (spnDeb) {
        const rect = spnDeb.getBoundingClientRect();
        topPos = Math.max(60, Math.min(rect.top, window.innerHeight - 300));
    }

    const menu = document.createElement('div');
    menu.id = 'menu-sel';
    menu.style.top = topPos + 'px';
    menu.innerHTML = `
        <div class="menu-sel-titre">
            Cliquez pour terminer la sélection
            <span class="menu-sel-close" onmousedown="annulerDebSel()">✕</span>
        </div>
        <div class="menu-sel-action" onmousedown="annulerDebSel()">✕ Annuler la sélection</div>`;
    document.body.appendChild(menu);

    // rAF pour suivre le scroll
    let _rafAttenteId;
    const _majPos = () => {
        const m = document.getElementById('menu-sel');
        if (!m) return;
        const spn = getSpan(debSel);
        if (spn) {
            const r = spn.getBoundingClientRect();
            m.style.top = Math.max(60, Math.min(r.top, window.innerHeight - 300)) + 'px';
        }
        _rafAttenteId = requestAnimationFrame(_majPos);
    };
    _rafAttenteId = requestAnimationFrame(_majPos);
    window._menuSelRaf = _rafAttenteId;
}

function annulerDebSel() {
    debSel = 0; finSel = 0;
    const menu = document.getElementById('menu-sel');
    if (menu) menu.remove();
    if (window._menuSelRaf) {
        cancelAnimationFrame(window._menuSelRaf);
        window._menuSelRaf = null;
    }
    effaceSel();
    effaceSurv();
}

// ============================================================
// Menu de sélection — panneau droit, affiché dès que debSel+finSel sont posés
// ============================================================
async function afficherMenuSel() {

    if (typeAction !== 'cat' && typeAction !== 'loc') return;
    if (!debSel || !finSel) return;

    // Supprimer l'ancien menu s'il existe
    const oldMenu = document.getElementById('menu-sel');
    if (oldMenu) oldMenu.remove();

    // Position verticale : hauteur du premier mot de la sélection, clampée au viewport
    const spnDeb = getSpan(debSel);
    let topPos = 120;
    if (spnDeb) {
        const rect = spnDeb.getBoundingClientRect();
        topPos = Math.max(60, Math.min(rect.top , window.innerHeight - 300));
    }

    // Catégories présentes sur TOUS les spans de la sélection (intersection)
    const deb = Number(debSel);
    const fin = Number(finSel);
    let catsCommunes = null;
    for (let rk = deb; rk <= fin; rk++) {
        const sp = getSpan(rk);
        if (!sp) continue;
        const catsSp = Array.from(sp.classList).filter(c => c.startsWith('cat_'));
        if (catsCommunes === null) {
            catsCommunes = catsSp;
        } else {
            catsCommunes = catsCommunes.filter(c => catsSp.includes(c));
        }
        if (catsCommunes.length === 0) break;
    }
    if (!catsCommunes) catsCommunes = [];

    // Construction du HTML
    let chaine = `
        <div class="menu-sel-titre">
            Sélection...
            <span class="menu-sel-close" onmousedown="fermerMenuSel()">✕</span>
        </div>`;

    // En-tête contextuel selon le mode
    if (typeAction === 'cat') {
        chaine += `<div class="menu-sel-action menu-title-cat" style="font-size: 14px;">Catégories</div>`;
    } else if (typeAction === 'loc') {
        const segCurEl = getSeg(seg_cur);
        const rgloc = segCurEl ? (segCurEl.dataset.loc || 0) : 0;
        const nomLoc = (typeof locut !== 'undefined' && locut[rgloc]) ? locut[rgloc] : 'Locuteur';
        chaine += `<div class="menu-sel-action menu-title-loc" style="font-size: 14px;">${nomLoc}</div>`;
    }

    if (catsCommunes.length > 0) {
        for (const cat of catsCommunes) {
            const rkc = getRkThm(cat);
            const thm = (tabThm && tabThm[rkc]) ? tabThm[rkc] : null;
            const nom = thm ? thm.nom : cat;
            const couleur = (thm && thm.couleur) ? thm.couleur : '#ccc';
            chaine += `<div class="menu-sel-item" style="border-left: 4px solid ${couleur};">
                <span>${nom}</span>
                <span class="menu-sel-cat-close" onmousedown="supprimerCatSel('${cat}', ${deb}, ${fin})">✕</span>
            </div>`;
        }
        chaine += `<div class="menu-sel-action" style = "font-size: 14px;" onmousedown="effacerToutesCatsSel(${deb}, ${fin})">✖ Tout retirer</div>
        `;
    }

    chaine += `
        <div class="menu-sel-action" onmousedown="addComment()">💬 Commenter...</div>
        <div class="menu-sel-action" onmousedown="navigator.clipboard.writeText(exportTxt(${deb}, ${fin}, true))">📋 Copier</div>
        <div class="menu-sel-action" onmousedown="ouvrirMenuAjoutRecueil(${deb}, ${fin}, exportTxt(${deb}, ${fin}), event.target)">📌 Ajouter au recueil</div>`;

    const menu = document.createElement('div');
    menu.id = 'menu-sel';
    menu.style.top = topPos + 'px';
    menu.innerHTML = chaine;
    document.body.appendChild(menu);

    // Repositionnement en continu via rAF (fonctionne quel que soit le conteneur scrollable)
    let _rafMenuSel = null;
    const _majPosMenuSel = () => {
        const m = document.getElementById('menu-sel');
        if (!m) return; // menu fermé, on arrête
        const spn = getSpan(debSel);
        if (spn) {
            const r = spn.getBoundingClientRect();
            m.style.top = Math.max(60, Math.min(r.top , window.innerHeight - 300)) + 'px';
        }
        _rafMenuSel = requestAnimationFrame(_majPosMenuSel);
    };
    _rafMenuSel = requestAnimationFrame(_majPosMenuSel);
    window._menuSelRaf = _rafMenuSel;

    // Fermeture au prochain clic hors du menu
    setTimeout(() => {
        document.addEventListener('mousedown', _fermerMenuSelSiHors);
    }, 0);
}

function fermerMenuSel() {
    const menu = document.getElementById('menu-sel');
    if (menu) menu.remove();
    document.removeEventListener('mousedown', _fermerMenuSelSiHors);
    if (window._menuSelRaf) {
        cancelAnimationFrame(window._menuSelRaf);
        window._menuSelRaf = null;
    }
    effaceSel();
    effaceSurv();
    debSel = 0; finSel = 0;
    thmEnCours('');
}

function _fermerMenuSelSiHors(e) {
    const menu = document.getElementById('menu-sel');
    // Ne pas fermer si le clic vient d'une étiquette de catégorie (panneau latéral)
    if (e.target.closest('.ligthm')) return;
    if (menu && !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', _fermerMenuSelSiHors);
        if (window._menuSelRaf) {
            cancelAnimationFrame(window._menuSelRaf);
            window._menuSelRaf = null;
        }
    }
}

async function supprimerCatSel(cat, deb, fin) {
    // Retire la catégorie de tous les spans de la sélection
    for (let rk = deb; rk <= fin; rk++) {
        const sp = getSpan(rk);
        if (sp) sp.classList.remove(cat);
    }
    backUp();
    await majUIApresModifCatsSelection(deb);
    afficherMenuSel(); // rafraîchissement
}

async function effacerToutesCatsSel(deb, fin) {
    backUp();
    for (let rk = deb; rk <= fin; rk++) {
        const sp = getSpan(rk);
        if (!sp) continue;
        Array.from(sp.classList)
            .filter(c => c.startsWith('cat_'))
            .forEach(c => sp.classList.remove(c));
    }
    await majUIApresModifCatsSelection(deb);
    afficherMenuSel(); // rafraîchissement
}

async function majUIApresModifCatsSelection(deb) {
    const cible = getSpan(deb);
    const classes = cible ? cible.classList.value : '';
    thmEnCours(classes);
    effaceSurv();
    multiThm('segments');

    // Synchronise aussi le résumé graphique après retrait de catégories.
    const segs = document.getElementById('segments');
    const canva = document.getElementById('graphEnt');
    if (segs && canva) {
        const html = segs.innerHTML;
        const tabGrphEnt = await resumeGraphique(html.replace(/`/g, ''));
        dessinResumeGraphique(0, canva, tabGrphEnt);
    }
}


// affichage du menu contextuel
async function showMenu(button, typeAction){


    if (!button) {return}; 

    

    // suppression de l'ancien menu s'il existe
    const oldMenu = document.getElementById("contextMenu")
    if (oldMenu) {oldMenu.remove()}

    // on crée un nouveau menu contextuel
    const fondseg = document.getElementById("segments")
    const menuSeg=document.createElement("div");
    menuSeg.id="contextMenu"
    menuSeg.classList.add("context-menu", "dnone")
    fondseg.appendChild(menuSeg)

    
    // 1 - récupération de la position du bouton
    const rect = button.getBoundingClientRect();
           
        
        var chaine = ""; 

          // locuteur

            // récupération du segment 
            const seg = button.parentNode
            let rgloc = seg.dataset.loc;
            if (!rgloc) {rgloc=0}
            
            let loc = locut[rgloc];

             chaine += `
            <div >
            <label class="menu-title menu-title-loc"> Qui parle ? </label>
            <div class="close closemnucont " onclick="hidedlg()" >x</div>
            <div class="divider"></div>
            <div class="menu-item  " onclick="showSousMenu(this, 'loc')"> ` +  loc + ` </div>   

            </div>
            <div class="divider"></div>
        `

        // catégories

            chaine += `
             <div >
                <label class="menu-title menu-title-cat"> Catégories </label>
                
            <div class="divider"></div>
            
        `

           


         // mise en tableau des classes
         let cats = button.classList.value.split(" ")

      
      
            // reconstitution de la chaine
            for (c=0;c<cats.length;c++){

                if (cats[c].lastIndexOf("cat_") >-1){
                    let rkc = await getRkThm(cats[c]);

                    chaine += ` <div class="menu-item menu-cat ` + cats[c] + `" onmousedown = "thmSeg(` + debSel+ `,` + finSel + `,'` +   cats[c]+ `'); showMenu(` + getSpan(finSel) + `, 'cat')">` +  
                         splitNomThm(tabThm[rkc].nom)[0] 
                         + `  </div> `;   

                }
            }

            chaine += `<div class="divider"></div>
             
            ` 


        
            /*
             chaine += `

            <div id = "cmbNvCat" class="menu-item menu-add" onclick="showSousMenu(this, 'cat')"> Ajouter... </div>

            <div class="divider"></div>
            
            `
*/
         
           
        


        chaine += `<div class="divider"></div>
            
            <div class="menu-item menu-title-com" onmousedown = "addComment()"> Commenter </div>
            
            <div class="menu-item menu-title-search" onmousedown = "
            dispPanneauG('', 'fond_rech'); 
            document.getElementById('imgpansearch').style.opacity=1;
            document.getElementById('txtRech').focus();
            document.getElementById('txtRech').value = exportTxt(`+ debSel + `, `+ finSel + `, false);
            rechercher();
            "> Rechercher... </div>

             <div class="menu-item menu-title-copy" onmousedown = "navigator.clipboard.writeText(exportTxt(`+ debSel + `, `+ finSel + `, true))"> Copier </div>
        ` 

        menuSeg.innerHTML=chaine; 
  
        
        menuSeg.style.top=rect.top  -  fondseg.getBoundingClientRect().top + fondseg.scrollTop; 
        menuSeg.style.left=rect.left + rect.width + 10 -  fondseg.getBoundingClientRect().left; 
        menuSeg.classList.remove('dnone'); 
       

    
        
        menuSeg.classList.remove('dnone'); 

            
 
        document.addEventListener("mousedown", () => {
        if (!menuSeg.classList.contains('dnone')){
            menuSeg.classList.add('dnone'); 
            }
        });





}

// barre de progression sur le résumé graphique de l'entretien
function barreProg(seg){
    
     // on se base sur la position du premier mot du segment sur l'ensemble des mots de l'entretien car s'appuyer 
     // sur le temps ne fonctionnerait pas dans une situation où la bande son n'est pas chargée. 
     // par ailleurs, c'est sur la base des mots que le dessin général de l'entretien est réalisé. En s'appuyant sur le temps 
     // il y a des décalages. 

    let lig  = document.getElementById('lblposlect'); 

    // récupération de la position en mot 

    const segment = getSeg(seg)
    let motDeb = segment.tabIndex; 

    
    // récupération de la durée totale du fichier son
    let lastmot = getNbSpans() -1;

 
    if (lastmot<0){return}

    // let infoslast = infoSeg(lastseg);  //récupération des infos sur le dernier segment
    //posfin = infoslast[0].fn

 
    //let ratio = poslect/posfin;
     let ratio = motDeb/lastmot
    
    
 

    // récupération de la largeur du canvas
    let cnv = document.getElementById('graphEnt');
    

   
   
    //position du canva
    posCnv = cnv.getBoundingClientRect();
   
    let posX =  Number(ratio * (posCnv.width));
    posX=posX.toFixed(0)
    lig.style.marginLeft = posX + "px";


}