////////////////////////////////////////////////////////////////////////
// GESTION DES LOCUTEURS 
////////////////////////////////////////////////////////////////////////





// tableau des locuteurs 

var  locut = ['','Question?','Réponse','Réponse 2'];



async function chargeLocut(){

    locut = await window.electronAPI.getTabLoc();

    if (!locut) { locut = ['', 'Question?', 'Réponse', 'Réponse 2']; }

    const divloc = document.getElementById('locuteurs');
    divloc.innerHTML = "";

    // Trier : interrogateurs (nom se terminant par ?) en premier, par ordre alphabétique
    let locutEntries = [];
    for (let i = 1; i < locut.length; i++) {
        if (locut[i] != "") {
            locutEntries.push({ index: i, name: locut[i] });
        }
    }
    locutEntries.sort((a, b) => {
        const aIsInterro = a.name.endsWith('?');
        const bIsInterro = b.name.endsWith('?');
        if (aIsInterro && !bIsInterro) return -1;
        if (!aIsInterro && bIsInterro) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const entry of locutEntries) {
        divloc.appendChild(createLocutRow(entry.index, entry.name));
    }

    const btnPlus = document.createElement('label');
    btnPlus.id = "btnLocPlus";
    btnPlus.className = "btnfonction btnbleu dnone";
    btnPlus.style.cssText = "position:relative; float:right; padding:5px; margin:3px";
    btnPlus.textContent = "➕";
    btnPlus.addEventListener('click', ajoutLocut);
    divloc.appendChild(btnPlus);

    const btnValid = document.createElement('label');
    btnValid.id = "btnvalidloc";
    btnValid.className = "btnfonction btnlarge dnone";
    btnValid.style.cssText = "position:relative; margin-top:15px";
    btnValid.textContent = " Valider ";
    btnValid.addEventListener('click', validLocut);
    divloc.appendChild(btnValid);
}

function createLocutRow(loc, name) {
    const div = document.createElement('div');

    const label = document.createElement('label');
    label.id = "btnloc" + loc;
    label.className = "btnfonction btnloc btnloc" + loc + " btnlarge";
    if (name.endsWith("?")) {
        label.classList.add("qst");
    }
    label.textContent = name;
    label.addEventListener('click', () => { selLoc(loc); affectLoc(loc); });

    const input = document.createElement('input');
    input.type = "text";
    input.className = "txtloc btnloc" + loc + " dnone";
    input.id = "txtloc" + loc;
    input.value = name;
    input.addEventListener('focus', function() {
        this.setSelectionRange(0, this.value.length);
        dsTxtArea = false;
        dsTxtAutre = true;
    });
    input.addEventListener('focusout', function() { dsTxtAutre = false; });
    input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') { validLocut(); }
    });

    div.appendChild(label);
    div.appendChild(input);
    return div;
}

async function ajoutLocut(){

    

    const newLoc = locut.length;
    locut.push("Nouveau (" + newLoc + ")");
    console.log("ajout locuteur " + locut);

    await electronAPI.setTabLoc(locut);

    // Insertion de la nouvelle ligne avant les boutons de contrôle
    const divloc = document.getElementById('locuteurs');
    const btnPlus = document.getElementById('btnLocPlus');
    divloc.insertBefore(createLocutRow(newLoc, locut[newLoc]), btnPlus);

    setTimeout(function() {
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
    console.log("type d'action : " + typeAction)
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
                
                if (!loc) {loc=locPrec}
                
                // ajout d'un locuteur
                if (loc!=locPrec){ 

                    if (tabLoc[loc]){
                    seg.dataset.nomloc = tabLoc[loc].replaceAll("?","")
                    } else {
                    seg.dataset.nomloc = "???"}
                    seg.classList.add('ligloc')

                    // ajout des couleurs de locuteur
                    seg.classList.remove('loc0','loc1','loc2','loc3','loc4','loc5','loc6','loc7','loc8','loc9', 'loc10','loc11','loc12','loc13','loc14','loc15','loc16','loc17','loc18','loc19','loc20');
                    
                    if (typeAction === "loc") {
                        seg.classList.add('loc' + (loc) );    
                    }


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
            let conteneurHtml = document.getElementById("segments");
            html = conteneurHtml ? conteneurHtml.innerHTML : "";
        }

        let tabStatsLoc = [];
        for (let i = 0; i < tabLoc.length + 1; i++){
            tabStatsLoc.push({ loc: tabLoc[i], locIndex: i, nbInt: 0, nbMots: 0, nbSec: 0 });
        }

        let segs = document.querySelectorAll('.lblseg');
        let loc_cur = -1;

        const segsArray = Array.from(segs);
        for (let i = 0; i < segsArray.length; i++) {
            const seg = segsArray[i];
            let loc = seg.dataset.loc;
            const locNum = parseInt(loc);
            if (isNaN(locNum) || locNum <= 0 || locNum >= tabLoc.length || !tabStatsLoc[locNum]) continue;

            if (locNum != loc_cur) {
                tabStatsLoc[locNum].nbInt += 1;
                loc_cur = locNum;
            }

            let mots = seg.textContent.trim().split(/\s+/).filter(m => m.length > 0);
            tabStatsLoc[locNum].nbMots += mots.length;

            let debut = parseFloat(seg.dataset.deb);
            let fin;
            const nextSeg = segsArray[i + 1];
            if (nextSeg) {
                fin = parseFloat(nextSeg.dataset.deb);
            } else {
                fin = parseFloat(seg.dataset.fin);
            }
            if (!isNaN(debut) && !isNaN(fin) && fin > debut) {
                tabStatsLoc[locNum].nbSec += fin - debut;
            }
        }

        // ne garder que les locuteurs ayant des mots
        let statsActifs = tabStatsLoc.slice(1).filter(s => s.loc && s.nbMots > 0);

        // tri par nombre de mots décroissant
        statsActifs.sort((a, b) => b.nbMots - a.nbMots);

        // dessin du graphe des locuteurs sur le canvas
        //dessinGraphLoc();

        const totalMots = statsActifs.reduce((s, e) => s + e.nbMots, 0);
        const totalMotsQ = statsActifs.filter(e => e.loc && e.loc.includes("?")).reduce((s, e) => s + e.nbMots, 0);
        const maxMots = statsActifs.length > 0 ? statsActifs[0].nbMots : 1;

        // affichage
        const conteneurStats = document.getElementById(nomConteneur);
        if (!conteneurStats) return;

        conteneurStats.innerHTML = "";

        const titre = document.createElement('h2');
        titre.textContent = "Statistiques";
        conteneurStats.appendChild(titre);
        
        // ajout d'un bouton de fermeture
        const btnFermer = document.createElement('span');
        btnFermer.textContent = "×";
        btnFermer.className = "close";
        titre.appendChild(btnFermer);


        for (const entry of statsActifs) {
            const pct = Math.round((entry.nbMots / maxMots) * 100);
            const min = Math.floor(entry.nbSec / 60);
            const sec = Math.round(entry.nbSec % 60);
            const duree = entry.nbSec > 0 ? `${min}m${sec < 10 ? '0' : ''}${sec}s` : "—";

            const row = document.createElement('div');
            row.className = "stats-loc-row";

            const bar = document.createElement('span');
            bar.className = "stats-loc-bar";
            bar.style.width = pct + "%";
            bar.style.backgroundColor = `var(--coul-loc${entry.locIndex})`;

            const text = document.createElement('span');
            text.className = "stats-loc-text";
            text.innerHTML = `<strong>${entry.loc}</strong> — ${entry.nbInt} interv. · ${entry.nbMots} mots · ${duree}`;

            const counter = document.createElement('span');
            counter.className = "stats-loc-counter";

            const loupe = document.createElement('span');
            loupe.className = "stats-loupe";
            loupe.title = `Naviguer dans les segments de ${entry.loc}`;

            // collecte des interventions (premier segment de chaque prise de parole)
            let intervIdx = 0;
            loupe.addEventListener('click', () => {
                const locIdx = String(entry.locIndex);
                const allSegs = Array.from(document.querySelectorAll('.lblseg'));
                // ne garder que les segments qui démarrent une nouvelle intervention
                const interventions = allSegs.filter((seg, i) => {
                    if (String(seg.dataset.loc) !== locIdx) return false;
                    const prev = allSegs[i - 1];
                    return !prev || String(prev.dataset.loc) !== locIdx;
                });
                if (interventions.length === 0) return;
                if (intervIdx >= interventions.length) intervIdx = 0;
                const seg = interventions[intervIdx];
                const rk = Number(seg.dataset.rksg ?? seg.dataset.rk);
                selSegment(rk);
                seg.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // mise en relief du loc-graph de l'intervention atteinte
                document.querySelectorAll('.loc-graph').forEach(s => {
                    s.classList.remove('loc-graph-dimmed', 'loc-graph-active');
                    if (s.dataset.loc !== locIdx) {
                        s.classList.add('loc-graph-dimmed');
                    }
                });
                const activeSpan = document.querySelector(`.loc-graph[data-rk="${rk}"]`);
                if (activeSpan) activeSpan.classList.add('loc-graph-active');

                intervIdx = (intervIdx + 1) % interventions.length;
                const shown = intervIdx === 0 ? interventions.length : intervIdx;
                counter.textContent = `${shown}/${interventions.length}`;
            });
            loupe.textContent = "🔎";

            row.appendChild(bar);
            row.appendChild(text);
            row.appendChild(counter);
            row.appendChild(loupe);
            conteneurStats.appendChild(row);
        }

        if (totalMots > 0) {
            const sep = document.createElement('hr');
            sep.style.margin = "15px 15px";
            conteneurStats.appendChild(sep);

            const total = document.createElement('p');
            total.innerHTML = `<strong>Total :</strong> ${totalMots} mots`;
            conteneurStats.appendChild(total);

            if (totalMotsQ > 0) {
                const pctQ = ((totalMotsQ / totalMots) * 100).toFixed(1);
                const pQuestions = document.createElement('p');
                pQuestions.innerHTML = `<strong>Questions :</strong> ${pctQ} % des mots`;
                conteneurStats.appendChild(pQuestions);
            }
        }
    }



    function dessinGraphLoc() {
        const canva = document.getElementById('graphEnt');
        if (!canva) return;

        // 1. Masquer tous les xtr-graph
        document.querySelectorAll('.xtr-graph').forEach(s => s.style.display = 'none');

        // 2. Supprimer les loc-graph existants
        document.querySelectorAll('.loc-graph').forEach(s => s.remove());

        // 3. Récupérer tous les segments
        const segsArray = Array.from(document.querySelectorAll('.lblseg'));
        if (segsArray.length === 0) return;

        // 4. Calcul de la durée totale
        const firstDeb = parseFloat(segsArray[0].dataset.deb);
        let lastFin = NaN;
        for (let i = segsArray.length - 1; i >= 0; i--) {
            const f = parseFloat(segsArray[i].dataset.fin);
            if (!isNaN(f) && f > 0) { lastFin = f; break; }
        }
        if (isNaN(lastFin)) {
            const lastDeb = parseFloat(segsArray[segsArray.length - 1].dataset.deb);
            lastFin = isNaN(lastDeb) ? firstDeb + 1 : lastDeb + 1;
        }
        const totalDuration = lastFin - firstDeb;
        if (isNaN(firstDeb) || totalDuration <= 0) return;

        // 5. Hauteur du canvas
        const hauteur = canva.getBoundingClientRect().height || 30;

        // 6. Le parent doit être en position relative
        canva.parentElement.style.position = 'relative';

        // 7. Parcours des segments pour créer des blocs par locuteur
        let i = 0;
        while (i < segsArray.length) {
            const seg = segsArray[i];
            const loc = parseInt(seg.dataset.loc);
            if (isNaN(loc) || loc <= 0) { i++; continue; }

            // Trouver la fin du bloc continu de ce locuteur
            let j = i;
            while (j + 1 < segsArray.length && parseInt(segsArray[j + 1].dataset.loc) === loc) { j++; }

            // Temps de début et de fin du bloc
            const debut = parseFloat(seg.dataset.deb);
            let fin;
            if (j + 1 < segsArray.length) {
                fin = parseFloat(segsArray[j + 1].dataset.deb);
            } else {
                fin = parseFloat(segsArray[j].dataset.fin);
            }
            if (isNaN(debut) || isNaN(fin) || fin <= debut) { i = j + 1; continue; }

            const lft = ((debut - firstDeb) / totalDuration * 100).toFixed(3);
            const wth = ((fin - debut) / totalDuration * 100).toFixed(3);

            const span = document.createElement('span');
            span.classList.add('loc-graph');
            span.style.left = lft + '%';
            span.style.width = wth + '%';
            span.style.top = '0px';
            span.style.height = hauteur + 'px';
            span.style.backgroundColor = `var(--coul-loc${loc})`;
            span.title = locut[loc] || '';

            const rkSeg = Number(seg.dataset.rksg ?? seg.dataset.rk);
            span.dataset.loc = String(loc);
            span.dataset.rk = String(rkSeg);
            span.addEventListener('click', () => {
                selSegment(rkSeg);
                seg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            canva.parentElement.appendChild(span);
            i = j + 1;
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
            statsLocs,
            dessinGraphLoc
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
         window.dessinGraphLoc = dessinGraphLoc;
    }