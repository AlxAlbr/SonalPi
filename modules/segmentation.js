function clicSeg(rk,sg){ //ce qu'il se passe quand on clique sur un mot

 

    if (!rk){return}
    if (!sg){return}

     
    selSegment(sg,false)
    

      if (typeAction !="cat") { return;} // si on n'est pas en mode catégorie, on ne fait rien

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
    
        //if (debSel==0){debSel=rk;console.log("def deb"); console.log("debsel",debSel); return} // définition du début
    
        if (debSel!=0 && finSel!=0){
            
            if (debSel>rk || finSel<rk ) {
                debSel=0;finSel=0;
                effaceSurv();
            } else (
                survSeg(rk) // on survole le mot cliqué
            )
    
        } // retour à zéro

        if (debSel>0 ){ // il y a déjà un rang de début, on définit un rang de fin

           // if (debSel==rk){debSel=0;finSel=0;return}
                  
            if (finSel==0){finSel=rk;survOk();return}

            // ajouter les classes debsel et fin (si aucune classe n'est déjà présente = quand la sélection à la souris ne fonctionne pas)
            if (document.querySelectorAll(".debsel , .finsel").length==0) {
            const Spn1 = getSpan(debSel);
            const Spn2 = getSpan(finSel);
            Spn1.classList.add("debsel")        
            Spn2.classList.add("finsel")
            }

            
            listenersFinSel();
            if (rk==finSel) {showMenu(getSpan(finSel), typeAction)};
            //debSel=0;finSel=0;
            return;
        } 
    
        //console.log("debsel",debSel)
        //console.log("finsel",finSel)
        //seg_cur=`+ n + `;selSegment(` + n + `,false) ; dsTxtArea=true;
    
        survSeg(rk);
        
        // récupération de la sélection courante (debsel finsel) à partir du thm courant   
        getThm(rk)
         
        
    
    }
    
    
    function survSeg(rk){//ce qu'il se passe quand on survole un mot
    
          
        
            if (typeAction !="cat") { return;} // si on n'est pas en mode catégorie, on ne fait rien


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
    
        // ajout de la classe de survol
    
    
    }
    
    
    function survOk(){
        document.querySelectorAll(".survseg").forEach(el => el.classList.add("survok"));
        document.querySelectorAll(".survseg").forEach(el => el.classList.remove("survseg"));
        
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





var BkUp = []
var RgBkUp=1;


function initBkUp(){
    RgBkUp=0;
    BkUp =[0]
    divSegments = document.getElementById('segments')
    //divSegments.addEventListener("input", () => backUp());
    divSegments.addEventListener("paste", () => backUp());
    //divSegments.addEventListener("focusout", () => cleanHTML());

for (i = 0; i < BkUp.length; i++) {
    
    BkUp[i]="";
     
    }
}

function backUp(){ // mémorisation des dernières modifications

    if (BkUp[1]==document.getElementById('segments').innerHTML){return;}

    // agrandissement du tableau de données
    if (BkUp.length < 20){

         BkUp.push("");

    }
    
    // suppression des rangs inférieurs
    if (RgBkUp>0) {
        BkUp.splice(0,RgBkUp)
        RgBkUp=1;
    }

    for (b=BkUp.length-1;b>1;b--){
        
        BkUp[b]= BkUp[Number(b)-1];

    }

    
    BkUp[1]=document.getElementById('segments').innerHTML;


}

function undo(){

    if (RgBkUp<BkUp.length-1) {
        RgBkUp++;
         
    }

   //console.log("annulation - rang" + RgBkUp)
    document.getElementById('segments').innerHTML= BkUp[RgBkUp]

}

function redo(){

if (RgBkUp>1) {
    RgBkUp--;
     
}

   //console.log("annulation - rang" + RgBkUp)
document.getElementById('segments').innerHTML= BkUp[RgBkUp]

}

 function selSegment(seg,edit){
  


    // if (noSel == false) {return} // si la sélection est activée, on ne fait rien

    if (!seg){return}


    //console.log ("sélection du segment " + seg)
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
            segment.classList.add('segselected')
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