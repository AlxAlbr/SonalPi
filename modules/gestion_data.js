////////////////////////////////////////////////////////////////
//DATA
////////////////////////////////////////////////////////////////

// gestion des métadonnées associées aux entretiens


//var tabDat = []; // tableau des données de l'entretien
var rgEnt ; // mémorise le rang de l'entretien courant ()
var placerApresVar = "dernier"; // valeur de positionnement pour les variables : "dernier" | "premier" | code_v

var txtmod_cur = null; // mémorisation du texte de modalité en cours de modification (pour le menu)

var colsVisibiliteData = {}; // visibilité des colonnes : { key: bool } — true = visible
var lignesVisibiliteData = {}; // visibilité des lignes par entretien : { idEnt: bool } — true = visible
var _handlerFermerColVis = null; // handler click-away panneau colonnes (référence unique pour removeEventListener)
var _handlerFermerLigVis = null; // handler click-away panneau lignes
var _colDefsData = []; // référence aux colDefs courants pour _updateInfoVisData
var _entretienesListData = []; // référence à entretiensList courant pour _updateInfoVisData

// AJOUTER UNE VARIABLE
async function addVar(mode) {

    console.log("Ajout d'une nouvelle variable au tableau existant" + JSON.stringify(tabVar));
    
    var rkVar = Number(document.getElementById("lblCodeVar").value); 

    // le rang existe-t-il déjà? 
    const existe = tabVar.some(item => item.v == rkVar);
    if (existe){ // si oui -> mise à jour
        console.log("la variables existe déjà, elle est seuelement mise à jour")
        await sauvVar(rkVar, mode); 
        hidedlg(); 
        return; 
    }

    var newVar = document.getElementById("lblLibVar").value;
    var champ = document.querySelector('input[name="chkVarChmp"]:checked').value;
    var priv = document.querySelector('input[name="chkVarPriv"]:checked').value;

    

    if (newVar) { // création d'une nouvelle variable 
        
        
        tabVar.push({'v': rkVar, 'lib': newVar, 'champ': champ, 'priv': priv }); // Ajouter la nouvelle variable au tableau
        tabDic.push ({ 'v': rkVar, 'm' : 0 , 'lib' : "" }) // Ajouter la modalité 0
        
        repositionnerVar(rkVar); // Appliquer le positionnement demandé
        await electronAPI.setVar(tabVar); // sauvegarder le tableau des variables
        await electronAPI.setDic(tabDic); // sauvegarder le tableau des modalités
        /*
        if (champ=="loc") { // création d'une modalité zéro dans le tabdat
            tabDat.push ({'e': rgEnt, 'v': rkVar, 'l': 0, 'm' : 0  })
        } else {
            tabDat.push ({'e': rgEnt, 'v': rkVar, 'l': "all", 'm' : 0  })
        }
        */

        document.getElementById("lblLibVar").value = ""; // Réinitialiser le champ de saisie
        

         
        // y'a-t-il des modalités à ajouter?
        const inputs = document.querySelectorAll(".libmoda");
        inputs.forEach(input => {
            let rkV = Number(input.dataset.v)
            let rkM = Number(input.dataset.m); 
            
            if (input.value != input.dataset.lib && rkV && rkM) {
                chgDic(rkV, rkM, input.value)
            }
        });


       // Mise à jour des modalités
        await sauvModas();  

        await window.sauvegarderCorpus(false);
        updateVarsDsEnt();
        await window.majFichierSonal();
        await affichDataGen();
        hidedlg();
    } else {
        alert("Veuillez entrer un nom de variable.");
    }
  
    
}


// Modifier une variable
async function editVar(rgVar, mode) {

    await dialog("Métadonnées"); // afficher la boîte de dialogue

    // console.log("Édition de la variable à l'index :", rgVar, "mode:", mode);
      
    //recherche dans le tableau tabVar l'index de la variable à modifier
    const rgVarToEdit = tabVar.findIndex(vr => vr.v == rgVar);
    if (rgVarToEdit === -1) {
        alert("Variable non trouvée au début");
        return;
    }

 
    const varToEdit = tabVar[rgVarToEdit];


    if (varToEdit) {
        document.getElementById("lblCodeVar").value = rgVar; // Stocker l'index de la variable à modifier
        document.getElementById("lblLibVar").value = varToEdit.lib;
        document.querySelector('input[name="chkVarChmp"][value="' + varToEdit.champ + '"]').checked = true;
        document.querySelector('input[name="chkVarPriv"][value="' + varToEdit.priv + '"]').checked = true;

        // Mise à jour du menu de positionnement
        remplirCmbVar(varToEdit.champ);
        const cmbPosVarEl = document.getElementById("cmbPosVar");
        if (cmbPosVarEl) cmbPosVarEl.textContent = "Conserver";

        // ajout des modalités
        
        // 1 - récupération de la liste des modalités
       
        const ligsDic= tabDic.filter (dic => dic.v == rgVar && dic.m !=0) ;

        //if (ligsDic.length==0){return;}

        const fondDico = document.getElementById("dico")
        fondDico.innerHTML=""; 
        fondDico.classList.add('floating-label-container')
        
        const etq = document.createElement("label");
        etq.textContent = "Modalités";
        etq.classList.add("mdc-floating-label", "floatingstatic");
            fondDico.appendChild(etq);
        
        // ajout des modalités
        ligsDic.forEach((mod, index) => {

                        
                // création de la div de fond de la modalité
                const fondMod = document.createElement("div");
                fondMod.classList.add("ligmoda"); 
                //fondMod.setAttribute("onclick", "menuMod('" + v.v + "'); alert('clic')");
                fondDico.appendChild(fondMod);

                // récupération des valeurs d'index
                var moda =mod.m; 
                var libellé =mod.lib; 

                // création de la case du code
                const divCode = document.createElement("input");
                divCode.type = "text";
                divCode.classList = "codemoda"
                divCode.disabled=true; 
                divCode.value = moda; 
                 
                fondMod.appendChild(divCode);


                // création de la case du libellé
                const divLib = document.createElement("input");
                divLib.type = "text";
                divLib.classList = "libmoda"
                divLib.dataset.m = moda
                divLib.dataset.v = rgVar
                divLib.dataset.lib = libellé
                divLib.value = libellé; 
                divLib.setAttribute('onfocus', 'dsTxtArea=false;dsTxtAutre=true');
                divLib.setAttribute('onfocusout', 'dsTxtAutre=false');
                 
                fondMod.appendChild(divLib);


                // ajout d'une croix pour supprimer la modalité
                divLib.insertAdjacentHTML('afterend', '<span class="supprmod" style="margin-left:5px; cursor:pointer;color:red;font-weight:bold">x</span>');
                const supprMod = divLib.nextSibling;
                supprMod.addEventListener('click', async function() {
       
                     
                  
                        // suppression de la modalité (retrait du composant de la page)
                        fondMod.remove();

                        // suppression de la modalité dans tabDic local et global
                        const indexDicGlobal = tabDic.findIndex(item => item.v == rgVar && item.m == moda);
                        if (indexDicGlobal !== -1) {
                            tabDic.splice(indexDicGlobal, 1);
                        }
                        

                    
                });




            

        }); 

        // afichage des modalités
        document.getElementById("fond_mod").style.display = "block";

        // Mettre à jour le bouton pour ajouter des modalités
        const addButton = document.getElementById("btnaddmod");
        addButton.setAttribute("onclick", "addMod('" + rgVar + "'); ");
        //console.log(addButton, addButton.getAttribute("onclick"));


        // Mettre à jour le bouton pour enregistrer les modifications
        const saveButton = document.getElementById("btnValidVar");
        saveButton.setAttribute("onclick", "sauvVar('" + rgVar + "', '" + mode + "'); hidedlg()");
        //console.log(saveButton, saveButton.getAttribute("onclick"));
    } else {
        alert("Variable non trouvée.");
    }
}

// enregistrer les modifications d'une variable
async function sauvVar(rgVar, mode) {

    // console.log("Enregistrement des modifications pour la variable à l'index :", rgVar, "mode:", mode);

    const updatedVar = {
        v : Number(document.getElementById("lblCodeVar").value), // Récupérer l'index de la variable
        lib: document.getElementById("lblLibVar").value,
        champ: document.querySelector('input[name="chkVarChmp"]:checked').value,
        priv: document.querySelector('input[name="chkVarPriv"]:checked').value
    };

     
    if (updatedVar.lib) {

        // recherche de la ligne correspondante dans tabvar
        const varmodifIndex = tabVar.findIndex (vr => vr.v == rgVar);

        if (varmodifIndex !== -1){
            console.log("variable trouvée pour modification au rang :", varmodifIndex);
             console.log ("tableau des variables avant mise à jour:", tabVar);
            tabVar[varmodifIndex] = updatedVar; // Mettre à jour la variable dans le tableau
            console.log ("Nouveau tableau des variables :", tabVar);

        } else {
            console.log ("La variable à modifier n'a pas été retrouvée")
        }
 
        repositionnerVar(updatedVar.v); // Appliquer le positionnement demandé
         
        // Mise à jour des modalités
        await sauvModas(mode);  

        console.table("Tableau des variables mis à jour :", tabVar);

        // sauvegarde du tableau des variables
        await electronAPI.setVar(tabVar);


            await window.sauvegarderCorpus(false);
            updateVarsDsEnt(); // modification dans les fichiers Sonal de tous les entretiens
            await window.majFichierSonal();
            await affichDataGen();


      
              
    } else {
        alert("Veuillez entrer un nom de variable.");
    }
}

// suppression d'une variable
async function supprVar(rgVar, mode) {
    console.log("Suppression de la variable à l'index :", rgVar, "mode:", mode);

    // message d'avertissement 
    let res = await question("Êtes-vous sûr de vouloir supprimer cette variable ? \nAttention! Cette action est irréversible et entraînera la suppression de toutes les modalités associées dans tous les entretiens.", ["Oui", "Non"]);
    if (res !== "oui") {
        return;
    }
    // recherche de la variable à supprimer
    const varIndex = tabVar.findIndex(vr => vr.v == rgVar);

    if (varIndex !== -1) {
    
    
        // suppression de la variable du tableau
        tabVar.splice(varIndex, 1);

        // suppression des modalités associées
        tabDic = tabDic.filter(item => item.v != rgVar);

        // suppression des enregistrements dans le tabDat local de chaque entretien
        tabEnt = await window.electronAPI.getEnt();
        tabEnt.forEach(ent => {
            if (Array.isArray(ent.tabDat)) {
                ent.tabDat = ent.tabDat.filter(d => d.v != rgVar);
            }
        });

        // reconstruction du tabDat global depuis les locaux
        tabDat = tabDat.filter(item => item.v != rgVar);

        // sauvegarde
        await electronAPI.setVar(tabVar);
        await electronAPI.setDic(tabDic);
        await electronAPI.setEnt(tabEnt);
        await electronAPI.setDat(tabDat);


        await window.sauvegarderCorpus(false);
        updateVarsDsEnt(); // modification dans les fichiers Sonal de tous les entretiens
        await window.majFichierSonal();
        await affichDataGen();

        hidedlg();
    } else {
        alert("Variable non trouvée.");
    }
}

// sauvegarde des modalités depuis la fenêtre d'édition des variables
async function sauvModas(ode) {

    // console.log("Sauvegarde des modalités");

    // récupération de la variable courante
    const rgVar = document.getElementById("lblCodeVar").value;

    // récupération des modalités
    const inputs = document.querySelectorAll(".libmoda");
    inputs.forEach(input => {
        let rkV = Number(input.dataset.v);
        let rkM = Number(input.dataset.m);
        let newValue = input.value;

        // console.log("Sauvegarde de la modalité pour la variable :", rkV, "et la modalité :", rkM, "avec la valeur :", newValue);

        // mise à jour de la modalité dans tabDic
        if (rkV && rkM && input.value) {
             chgDic(rkV, rkM, input.value)
        };

    });
     await electronAPI.setDic(tabDic);

    
}

// ajout d'une modalité à la variable éditée
function addMod(v) {

console.log ("ajout d'une modalité")

    const fondDico = document.getElementById("dico")

    // création de la div de fond de la modalité
                const fondMod = document.createElement("div");
                fondMod.classList.add("ligmoda"); 
                //fondMod.setAttribute("onclick", "menuMod('" + v.v + "'); alert('clic')");
                fondDico.appendChild(fondMod);

                // récupération des valeurs d'index
                // quel est le rang de modalité le plus avancé? 
                const ligsDic= tabDic.filter (vr => vr.v == v);
                const maxMod = Math.max(...ligsDic.map(item => item.m)); 

                if (maxMod == -Infinity) { // il n'existe aucune modalité pour cette variable), on commence à 1
                    var moda = 1;
                } else {
                    var moda = maxMod + 1;
                }
                tabDic.push({'v': Number(v), 'm' : moda , 'lib' :""})
                var libellé =""; 

                // création de la case du code
                const divCode = document.createElement("input");
                divCode.type = "text";
                divCode.classList = "codemoda"
                divCode.disabled=true; 
                divCode.value = moda; 
                 
                fondMod.appendChild(divCode);

                // création de la case du libellé
                const divLib = document.createElement("input");
                divLib.type = "text";
                divLib.classList = "libmoda"
                divLib.dataset.m = moda
                divLib.dataset.v = v
                divLib.dataset.lib = libellé
                divLib.value = libellé; 
                divLib.setAttribute('onfocus', 'dsTxtArea=false;dsTxtAutre=true');
                divLib.setAttribute('onfocusout', 'dsTxtAutre=false');
                 
                fondMod.appendChild(divLib);
                divLib.focus();

}

// ajout en masse de modalités issues de modèles
function ajoutListeModas(type){


    // console.log("Ajout de modalités pour le type :", type);

    //récupération de la variable courante
    const rgVar = document.getElementById("lblCodeVar").value;  
     
 
    var modsexe = ["", "Homme", "Femme", "Autre"];
    var modage5 = ["", "Moins de 20 ans", "20-24 ans", "25-29 ans", "30-34 ans", "35-39 ans", "40-44 ans", "45-49 ans", "50-54 ans", "55-59 ans", "60-64 ans", "65 ans et plus"];
    var modage10 = ["", "Moins de 18 ans", "18-24 ans", "25-34 ans", "35-44 ans", "45-54 ans", "55-64 ans", "65 ans et plus"];
    var modpcs1 = ["", "1 - Agriculteurs exploitants", "2 - Artisans, commerçants et chefs d’entreprise", "3 - Cadres et professions intellectuelles supérieures", "4 - Professions intermédiaires", "5 - Employés", "6 - Ouvriers", "7 - Autre"];
    var modpcs2 = ["", "10 - Exploitants de l’agriculture, sylviculture, pêche et aquaculture","21 - Artisans","22 - Commerçants et assimilés", "23 - Chefs d’entreprise de plus de 10 personnes", "31 - Professions libérales", "33 - Cadres administratifs et techniques de la fonction publique", "34 - Professeurs et professions scientifiques supérieures", "35 - Professions de l’information, de l’art et des spectacles", "37 - Cadres des services administratifs et commerciaux d’entreprise", "38 - Ingénieurs et cadres techniques d’entreprise", "42 - Professions de l’enseignement primaire et professionnel, de la formation continue et du sport", "43 - Professions intermédiaires de la santé et du travail social", "44 - Ministres du culte et religieux consacrés", "45 - Professions intermédiaires de la fonction publique (administration, sécurité)", "46 - Professions intermédiaires administratives et commerciales des entreprises", "47 - Techniciens", "48 - Agents de maîtrise (hors maîtrise administrative)", "52 - Employés administratifs de la fonction publique, agents de service et auxiliaires de santé" , "53 - Policiers, militaires, pompiers, agents de sécurité privée" , "54 - Employés administratifs d'entreprise", "55 - Employés de commerce", "56 - Personnels des services directs aux particuliers", "62 - Ouvriers qualifiés de type industriel", "63 - Ouvriers qualifiés de type artisanal", "64 - Conducteurs de véhicules de transport, chauffeurs-livreurs, coursiers", "65 - Conducteurs d’engins, caristes, magasiniers et ouvriers du transport (non routier)", "67 - Ouvriers peu qualifiés de type industriel", "68 - Ouvriers peu qualifiés de type artisanal", "69 - Ouvriers agricoles, des travaux forestiers, de la pêche et de l’aquaculture"];
    var modstatut = ["", "Étudiant", "Travailleur à temps plein", "Travailleur à temps partiel", "Chômeur", "Retraité", "Autre"];

    let tabmods = []; // tableau des modalités à ajouter
    switch(type) {
        case "sexe":
            tabmods = modsexe;
            break;
        case "age5":
            tabmods = modage5;
            break;
        case "age10":
            tabmods = modage10;
            break;
        case "pcs1":
            tabmods = modpcs1;
            break;
        case "pcs2":
            tabmods = modpcs2;
            break;
        case "statut":
            tabmods = modstatut;
            break;
    }


    // Mise à jour de l'affichage des modalités
  // 1 - récupération de la liste des modalités
       
         

        const fondDico = document.getElementById("dico")
        fondDico.innerHTML=""; 
        
        // ajout des modalités
        tabmods.forEach((mod, index) => {

            if (index===0){return}
     
            // création de la div de fond de la modalité
            const fondMod = document.createElement("div");
            fondMod.classList.add("ligmoda");
            //fondMod.setAttribute("onclick", "menuMod('" + v.v + "'); alert('clic')");
            fondDico.appendChild(fondMod);

                // récupération des valeurs d'index
                var moda =index; 
                var libellé =mod; 

                // création de la case du code
                const divCode = document.createElement("input");
                divCode.type = "text";
                divCode.classList = "codemoda"
                divCode.disabled=true; 
                divCode.value = moda; 
                 
                fondMod.appendChild(divCode);


                // création de la case du libellé
                const divLib = document.createElement("input");
                divLib.type = "text";
                divLib.classList = "libmoda"
                divLib.dataset.m = moda
                divLib.dataset.v = rgVar
                divLib.dataset.lib = libellé
                divLib.value = libellé; 
                divLib.setAttribute('onfocus', 'dsTxtArea=false;dsTxtAutre=true');
                divLib.setAttribute('onfocusout', 'dsTxtAutre=false');
                 
                fondMod.appendChild(divLib);


            

        }); 

        // afichage des modalités
        document.getElementById("fond_mod").style.display = "block";

        // si le champ de libellé de la variable est vide, on le remplit avec le nom du type de modalité
        const lblLibVar = document.getElementById("lblLibVar"); 
        if (lblLibVar.value === "") {
            lblLibVar.value =  type; // Mettre un libellé par défaut
        }   

}; 



async function chgDic(v,m, lib){

    const rkLigDic= tabDic.findIndex (vr => vr.v == v && vr.m == m);
    if (rkLigDic > -1){
        tabDic[rkLigDic].lib = lib; 
    } else {
        tabDic.push({'v':Number(v), 'm':m, 'lib':lib})
    }

    // sauvegarde du tabdic
 await electronAPI.setDic(tabDic);
}

// valider un changement de modalité
async function validMod(rgEnt, v, l, m, lib){
    
    if (!rgEnt) {
        console.log("récupération du entcur dans le main")
        rgEnt = await window.electronAPI.getEntCur();
    }

   console.log("on valide un changement de modalité pour l'entretien " + rgEnt + " la variable ", v, "le locuteur " , l ,  " et la modalité ", m , " le nouveau libellé sera " , lib)

    // la modalité saisie existe-t-elle déjà ?
    const rgTabDic = tabDic.findIndex(vr => vr.v === v && vr.lib === lib) ;
    
    console.log("la modalité a été trouvée au rang " + rgTabDic)

     // si non -->  ajout dans tabdic
    if (rgTabDic==-1){ // la modalité n'est pas trouvée

        
        // quel est le rang de modalité le plus avancé? 
        const ligsDic= tabDic.filter (vr => vr.v == v);
        const maxMod = Math.max(...ligsDic.map(item => item.m));   

        console.log("modalité la plus élevée pour la variable " + v + " = " + maxMod)
        if (isFinite(maxMod)) {
            m = maxMod+1; 
        } else {
            m=1; // si aucune modalité n'existe encore pour cette variable, on commence à 1
        }

        console.log("la nouvelle modalité sera " + m)  

        tabDic.push({'v':v, 'm':m,'lib':lib })

        await window.electronAPI.setDic(tabDic); // sauvegarde du tabdic

        // console.log(tabDic)
    } else {
        m = tabDic[rgTabDic].m
    }
    
   

    // mise à jour du tabdat local de l'entretien (source de vérité)
    const ligEnt = tabEnt.find(ent => ent.id == rgEnt);
    if (ligEnt){
        if (!Array.isArray(ligEnt.tabDat)) { ligEnt.tabDat = []; }
        const varModif = ligEnt.tabDat.find(d => d.e == rgEnt && d.v == v && d.l == l);
        if (varModif){
            varModif.m = m;
        } else {
            ligEnt.tabDat.push({'e' : String(rgEnt) , 'v' : v, 'l' : l, 'm' : m})
        }
    }

    await window.electronAPI.setEnt(tabEnt); // sauvegarde du tabent
    await window.electronAPI.setDic(tabDic); // sauvegarde du tabdic

    // Persister sur le serveur (distant / gitlab) — fire-and-forget pour ne pas bloquer l'UI
    const rkEnt = tabEnt.findIndex(ent => String(ent.id) === String(rgEnt));
    if (rkEnt !== -1) {
        window.majFichierSonal(rkEnt, rkEnt + 1)
            .then(() => window.sauvegarderCorpus(false))
            .catch(err => console.error('validMod : erreur sauvegarde distante', err));
    }

    const menudicEl = document.getElementById("menudic");
    if (menudicEl) menudicEl.style.display="none";

        // à la fin de validMod, juste avant de cacher le menu
        const inputValide = document.querySelector(`.txtmod[data-v="${v}"][data-l="${l}"]`)
        if (inputValide) {
            inputValide.dataset.m = m; // mise à jour du data-m avec la nouvelle valeur
            inputValide.classList.remove('validation-ok');
            void inputValide.offsetWidth; // force le reflow pour relancer l'animation
            inputValide.classList.add('validation-ok');
        }


}

// récupérer une valeur de modalité
// e = index tableau de tabEnt (pas le .id)
async function getMod(e,v,l) {

    //console.log("recherche de la valeur prise pour l'entretien ", e, "à la variable" , v)

    let moda = 0;
    let libellé = "";

    // accès direct par index tableau (e est l'index, pas le .id)
    if (!tabEnt[e]) {
        tabEnt = await window.electronAPI.getEnt(); // on recharge le tabent pour être sûr d'avoir la dernière version à jour
    }
    
    
    const tabDatEnt = tabEnt[e].tabDat;
    if (!tabDatEnt) {
        tabEnt[e].tabDat = [];
    }
    
                // récupération de la valeur de modalité dans le tabdat local
                const ligDat = tabEnt[e].tabDat.filter(d => d.v == v && d.l == l);
                                
                // si elle n'existe pas on la crée
                if (ligDat.length==0){
                    if ( tabEnt[e].tabDat ) { tabEnt[e].tabDat.push({'e' : String(tabEnt[e].id),'v' : v, 'l' : l, 'm' : 0 }) }
                    // la valeur est nulle
                    moda=0 

                } else {

                    moda  = ligDat[0].m
                    
                    if (moda>0){
                        // recherche dans le tabDic global (source de vérité)
                        const ligDic = tabDic.find(item => item.v == v && item.m == ligDat[0].m);
                        libellé  = ligDic ? ligDic.lib : "";
                    }
                }
return [moda, libellé]
}


// fonction d'affichage des variables/modalités pour un seul entretien 
async function affichDataEnt(){

     
    // récupération des tableaux de données nécessaires à l'affiachage
    tabEnt = await window.electronAPI.getEnt();
    tabVar = await window.electronAPI.getVar();
    tabDic = await window.electronAPI.getDic();
    tabDat = await window.electronAPI.getDat();


       let rkEnt = await window.electronAPI.getEntCur();
       let tabEnt_cur = await window.electronAPI.getEnt();
       rgEnt = String(tabEnt_cur[rkEnt].id);
       
    

    console.log("Affichage des données de l'entretien id = " + rgEnt + "rang = " + rkEnt);
    const fondVarGen = document.getElementById("listVarGenContent");
    fondVarGen.innerHTML = ""; // Réinitialiser le contenu

    // détection du contexte via l'URL (index.html = fenêtre principale, sinon fenêtre entretien)
    const estMainWindow = window.location.href.includes('index.html');

    //////////////////////////////////////////////////////////
    // sélection des variables ayant le champ "général"
    //////////////////////////////////////////////////////////



    // console.log("Variables disponibles :", tabVar);

    const varGen = tabVar.filter(v => v.champ === "gen");

    // console.log("Variables générales :", varGen);

    // création de la ligne de fond de la variable
 


    for (const v of varGen) {

                const fondGen = document.createElement("div");
                fondGen.style="display:flex; flex-direction:row;  align-items:center;margin-left:10px"
                fondGen.classList.add("ligmod"); 
                if (estMainWindow) {fondGen.style.pointerEvents="none";fondGen.classList.add("txtmod-inactif")}
                fondVarGen.appendChild(fondGen);

                const div = document.createElement("div");
                div.textContent = v.lib;
                div.title = v.lib;
                div.classList.add("ligvar");
                div.dataset.v = v.v;
                div.setAttribute("onclick", "editVar('" + v.v + "', 'loc')");
                fondGen.appendChild(div);

                const divmod = document.createElement("input");
                divmod.type = "text";
                                
                let findModa = await getMod(rkEnt, v.v, "all");
                var moda = findModa[0]; 
                var libellé = findModa[1]; 
               
                divmod.value = libellé; 
                divmod.classList.add("txtmod");
                divmod.placeholder = "modalité";
                divmod.setAttribute('onkeydown', 'this.classList.add("en-edition"); if(event.key==="Enter"){validMod('+ rgEnt + ',' + v.v + ', "all", ' + moda + ' , this.value);this.classList.remove("en-edition") };');
                if (estMainWindow) {divmod.style.pointerEvents="none"}
                divmod.dataset.v = v.v;
                divmod.dataset.l = "all";
                divmod.dataset.m = moda;
                divmod.setAttribute('onfocusout', 'this.classList.remove("en-edition")');
                fondGen.appendChild(divmod);

    }

    //////////////////////////////////////////////////////////
    // Variables locuteurs 
    //////////////////////////////////////////////////////////

    const fondVarLoc = document.getElementById("listVarLocContent");
    fondVarLoc.innerHTML = ""; // Réinitialiser le contenu

    // sélection des variables ayant le champ "locuteurs"
    const varLoc = tabVar.filter(v2 => v2.champ === "loc");

    // console.log("Variables locuteurs :", varLoc);
    if (estMainWindow) {
    locut = tabEnt[rkEnt].tabLoc // récupération de la liste des locuteurs
    }

    if (!locut){ // si pas de locuteur défini, on en crée un par défaut pour permettre l'affichage des variables locuteurs
        return;
    };

    for (const [index, l] of locut.entries()) {

        if (l && index>0 && locut[index].lastIndexOf("?") == -1) {

            const divLoc = document.createElement("div");
            divLoc.textContent = locut[index];
            divLoc.classList.add("liglocvar");
            fondVarLoc.appendChild(divLoc);

            for (const v2 of varLoc) {

                const fondLoc = document.createElement("div");
                fondLoc.style="display:flex; flex-direction:row;  align-items:center;margin-left:10px"
                fondLoc.classList.add("ligmod"); 
                if (estMainWindow) {fondLoc.classList.add("txtmod-inactif")}
                fondVarLoc.appendChild(fondLoc);

                const div = document.createElement("div");
                div.textContent = v2.lib;
                div.classList.add("ligvar");
                div.setAttribute("onclick", "editVar('" + v2.v + "', 'loc')");
                if (estMainWindow) {div.style.pointerEvents="none"}
                fondLoc.appendChild(div);

                const divmod = document.createElement("input");
                divmod.type = "text";
                
                let findModa = await getMod(rkEnt, v2.v, index); 
                var moda = findModa[0]; 
                var libellé = findModa[1]; 
               
                divmod.value = libellé; 
                divmod.classList.add("txtmod");
                divmod.placeholder = "modalité";
                divmod.setAttribute('onkeydown', 'this.classList.add("en-edition"); if(event.key==="Enter"){validMod('+ rgEnt + ','  + v2.v + ',' + index + ',' + moda + ' , this.value);this.classList.remove("en-edition") }');
                if (estMainWindow) {divmod.style.pointerEvents="none";}
                divmod.dataset.v = v2.v;
                divmod.dataset.l = index;
                divmod.dataset.m = moda;

                fondLoc.appendChild(divmod);
            }
        }
    }

    // ajout des listeners sur les libellés

    if (!estMainWindow) {
        listenersLibMod();
    }
     
}

function listenersLibMod(){

    
const inputs = document.querySelectorAll(".txtmod"); 

const menu = document.getElementById("menudic"); 


inputs.forEach(input => {

    // Affiche le menu sous l'input
    input.addEventListener("focus", function() {
     
    console.log("focus")

    // quel est le rang de modalité le plus avancé? 
    const ligsDic= tabDic.filter (vr => vr.v == input.dataset.v && vr.m != 0) ;
    const options = ligsDic.map(item => item.lib);    
    
    if (options.length==0){return}

    // mémorise le txtmod courant
    txtmod_cur = input; 

    // Positionne le menu sous l'input
    const rect = input.getBoundingClientRect();
    const conteneur = document.getElementById("contenu");
    const contRect = conteneur.getBoundingClientRect();

    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom   + window.scrollY + 3) + "px";
    menu.style.width = rect.width + "px"; 
    menu.innerHTML = options.map(opt => `<div class="menu-dic-item" style="padding:4px;cursor:pointer">${opt}</div>`).join("");
    menu.style.display = "block";

    });

}); 

// Clique sur une option du menu
menu.addEventListener("click", function(e) {
  if (e.target.classList.contains("menu-dic-item") && txtmod_cur) {
    
    txtmod_cur.value = e.target.textContent;
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    txtmod_cur.dispatchEvent(event);
    menu.style.display = "none";
    txtmod_cur = null;
  }
});

// Cache le menu si on clique ailleurs
document.addEventListener("click", function(e) {
  if (!e.target.classList.contains("txtmod") && !menu.contains(e.target)) {
    menu.style.display = "none";
    txtmod_cur = null;
  }
});

}; 


function changeDat(ent, codeVar, loc, codeMod){ // fonction de mise à jour des métadonnées d'un entretien

    // recherche de la ligne de tabdat correspondant à la variable pour le locuteur
    const ligDat = tabDat.filter(d => d.e === ent && d.v === codeVar && d.l === loc  );

    if (ligDat){
        ligDat.codeMod = codeMod; // on redéfinit la modalité pour l'entrée
    }

}

////////////////////////////////////////////////////////////////
// FONCTIONS GLOBALES
////////////////////////////////////////////////////////////////

async function inventaireVariables(){ // fonction d'inventaire des variables existantes

    // console.log("Inventaire des variables existantes :");

    tabEnt= await window.electronAPI.getEnt(); // récupération des entretiens
    tabVar = await window.electronAPI.getVar(); // récupération des variables existantes (toujours fraîches depuis le store)
    tabDic = await window.electronAPI.getDic(); // récupération des modalités existantes (toujours fraîches depuis le store)

    //tabVar = []; // réinitialisation du tableau des variables
    //tabDic = []; // réinitialisation du tableau des modalités

    // Reconstruction complète et propre du tabDat global depuis les tabDat locaux
    // (évite d'accumuler des entrées périmées entre appels successifs)
    const newTabDat = [];
    const tabEntFresh = await window.electronAPI.getEnt();
    tabEntFresh.forEach(ent => {
        const eId = String(ent.id);
        (ent.tabDat || []).forEach(datEnt => {
            if (datEnt.v == null || datEnt.l == null || datEnt.m == null) return;
            const ligExistante = newTabDat.findIndex(d => d.e == eId && d.v == datEnt.v && d.l == datEnt.l);
            if (ligExistante > -1) {
                newTabDat[ligExistante].m = datEnt.m;
            } else {
                newTabDat.push({e: eId, v: datEnt.v, l: datEnt.l, m: datEnt.m});
            }
        });
    });
    tabDat = newTabDat;
    await window.electronAPI.setDat(tabDat);

    var tabVarEnt = [];
    // défilement des entretiens
    tabEnt.forEach(ent => {

        tabVarEnt = ent.tabVar; // récupération des variables

        // evitement des tabvar vides
        if (!tabVarEnt || tabVarEnt.length==0){
            console.log("Aucune variable dans l'entretien n°" + ent.rk);
            return;
        }

        tabVarEnt.forEach(varEnt => {
            // console.log("Entretien n°" + ent.rk + " - Variable n°" + varEnt.v + " : " + varEnt.lib + " (champ : " + varEnt.champ + ", privée : " + varEnt.priv + ")");

              
            if (tabVar.some(v => v.v === varEnt.v && v.lib === varEnt.lib)) { // existe déjà
                varEnt.nvcode = "ok"; // Pas de changement
                //console.log("variable inchangée :", varEnt.v);
            }
            else if (tabVar.some(v => v.v != varEnt.v && v.lib === varEnt.lib)) { // existe avec un code différent
                varEnt.nvcode = "ok"; // Pas de changement
                // console.log("variable existante à un autre rang:", varEnt.v);

                // le rang du tabvar est imposé dans l'entretien
                ///alert("Attention : la variable '" + varEnt.lib + "' existe déjà avec un autre code. Le code de la variable dans l'entretien n°" + ent.rk + " sera conservé (" + varEnt.v + "). Veuillez vérifier la cohérence des variables.");




            } else  if (!tabVar.some(v => v.v === varEnt.v && v.lib === varEnt.lib)) {
                varEnt.nvcode = "ajouter";
                situation = "ajout";
                tabVar.push(varEnt)
                // console.log("nouvelle variable ajoutée :", varEnt.v);

            }



        });


        // console.log("Inventaire terminé. Variables actuelles :", tabVar);

        // tabDat global déjà reconstruit proprement au début de cette fonction



        tabDicEnt = ent.tabDic; // récupération des modalités
        
                // evitement des tabvar vides
        if (!tabDicEnt || tabDicEnt.length==0){
            // console.log("Aucune modalité dans l'entretien n°" + ent.rk);
            return;
        }
        
        // recopiage des modalités du tabdic qui n'existent pas encore dans le tabdic global (Pas là)
        /*
        tabDicEnt.forEach(dicEnt => { 

            if (!tabDic.some(d => d.v === dicEnt.v && d.m === dicEnt.m )) { // n'existe pas encore   
                if (dicEnt.m != "0" && dicEnt.m != 0 && dicEnt.m != null && dicEnt.m != undefined && isNumber(dicEnt.m)== true)  { // on n'ajoute pas les modalités nulles
                    tabDic.push(dicEnt);
                    // console.log("nouvelle modalité ajoutée :", dicEnt.v, dicEnt.m);
                }
            }

        });
        */

    });

      // console.log("Inventaire terminé. modalités actuelles :", tabDic);

    // reconstitution du tabdat global à partir des tabdat locaux des entretiens

  

    await window.electronAPI.setVar(tabVar); // sauvegarde des variables mises à jour
    await window.electronAPI.setDic(tabDic); // sauvegarde des modalités mises à jour
    await window.electronAPI.setDat(tabDat); // sauvegarde du tabDat global reconstitué


    // Correction des modalités et fichiers DAT

    /*
    // défilement des entretiens
    tabEnt.forEach(ent => {

        tabVar.forEach(vrbl => {
        
            
            tabDicEnt = ent.tabDic; // récupération des modalités
            tabDicEnt.forEach(dicEnt => {
                 
                // si le libellé 

                // récupération du libellé de variable dans le tabVar local
                let libVarLoc = tabVarEnt[dicEnt.v]?.lib ||"inconnu" 

                console.log("libellé de la variable locale :", libVarLoc);

                // correspondance dans le tabVar global
                let rkVarGlob = tabVar.findIndex(v => v.lib === libVarLoc);

                console.log("rang de la variable globale :", rkVarGlob);
                

                // recherche de la modalité dans tabdic
                if (tabDic.some(d => d.v === rkVarGlob && d.m === dicEnt.m)) { // existe déjà
                    console.log("modalité inchangée :", dicEnt.v, dicEnt.m);
                }




                else {
                    tabDic.push(dicEnt)
                    console.log("nouvelle modalité ajoutée :", rkVarGlob, dicEnt.m);
                }
            });


        });

    });
    */
  

 
}

async function affichDataGen(){

    await inventaireVariables();

    // Tri de tabVar : variables générales en premier, puis locuteurs (sans modifier le tableau d'origine)
    tabVar = [...tabVar].sort((a, b) => {
        if (a.champ === b.champ) return 0;
        return a.champ === "gen" ? -1 : 1;
    });

    // console.log("Affichage du tableau des données (tabvar) :");
    //console.table("envoie le tabDat " + JSON.stringify(tabDat));

    // création d'une div pour afficher le tableau
    // suppression de l'éventuel tableau existant avant de recréer
    const divTabDatExistant = document.getElementById("divTabDat");
    if (divTabDatExistant) divTabDatExistant.remove();

    const divTabDat = document.createElement("div");
    divTabDat.id = "divTabDat";

    // Détection du mode panneau (index.html avec fond_dat_corpus visible)
    const _fondDatCorpus = document.getElementById("fond_dat_corpus");
    const _estModePanneau = _fondDatCorpus && !_fondDatCorpus.classList.contains('dnone');

    if (_estModePanneau) {
        _fondDatCorpus.innerHTML = '';
        divTabDat.style.height = '100%';
        _fondDatCorpus.appendChild(divTabDat);
    } else {
        divTabDat.classList.add("fondtabdat");
        document.body.appendChild(divTabDat);
    }
    
    divEntete = document.createElement("div");
    divEntete.style="height:50px; border-bottom:1px solid #ccc"
    divEntete.classList.add("header-tabdat");

    // Calcul des filtres
    const hasVarLoc = tabVar.some(v => v.champ === "loc");
    const varAfficherGen = tabVar.filter(v => v.champ === "gen");
    const varAfficherLoc = tabVar.filter(v => v.champ === "loc");
    const showLocCol = hasVarLoc;
    const showLocRows = hasVarLoc;

    divEntete.innerHTML = `<h3 class="logo-variables" style="margin-left:10px;">Base de données
    ${_estModePanneau ? '' : '<label id="btn-quit" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px" onclick="hideTabDat();">Quitter ✖️</label>'}
    <label id="btn-export-dat" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px" onclick="exportTabDat();">Exporter 📥</label>
    <label id="btn-add-var" class="btn btn-primary" style="padding: 10px;float:right;margin-top:-5px;" onclick="dialog('Métadonnées');"> ➕ Ajouter une variable </label>
    <label id="btn-col-vis" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px;" title="Afficher/masquer des colonnes">👁 Variables</label>
    <label id="btn-lig-vis" class="btn btn-secondary" style="padding: 10px;float:right;margin-top:-5px;" title="Afficher/masquer des entretiens">👁 Lignes</label>
    </h3>`;
    divTabDat.appendChild(divEntete);

    // création du fond du tableau
    const fondTab = document.createElement("div");
    fondTab.style.overflow = "auto";
    fondTab.style.maxHeight = _estModePanneau ? "calc(100vh - 200px)" : "calc(100vh - 80px)";
    fondTab.style.paddingLeft = "10px";

    divTabDat.appendChild(fondTab);

    // Bandeau d'information sur les lignes/colonnes cachées
    const divInfoVis = document.createElement("div");
    divInfoVis.id = "info-vis-dat";
    divInfoVis.style.cssText = "display:none; padding:3px 10px 5px; font-size:0.82em; color:#999; font-style:italic; border-bottom:1px solid #eee;";
    fondTab.appendChild(divInfoVis);

    // création du tableau HTML
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    table.appendChild(thead);
    table.appendChild(tbody);   
    fondTab.appendChild(table);

    // Édition inline : délégation de clic sur le tbody
    tbody.addEventListener("click", function(e) {
        const td = e.target.closest("td.td-editable-gen");
        if (!td) return;
        activerEditionGen(td);
    });

    // création de l'en-tête du tableau
    // (hasVarLoc, varAfficher, showLocCol, showLocRows calculés dans le bloc header ci-dessus)
    const headerRow = document.createElement("tr");
    const colDefs = []; // [{key, label, cssClass}] — utilisé pour le panneau de visibilité

        // première colonne : entretien
        const th = document.createElement("th");
        th.textContent = "Entretien";
        th.classList.add("header-col-ent");
        headerRow.appendChild(th);

    // colonnes variables générales
    varAfficherGen.forEach(enteteVar => {
        const cssClass = `col-dat-gen-${enteteVar.v}`;
        const thV = document.createElement("th");
        thV.textContent = enteteVar.lib;
        thV.classList.add("header-col-var", cssClass);
        headerRow.appendChild(thV);
        colDefs.push({ key: `gen-${enteteVar.v}`, label: enteteVar.lib, cssClass });
        thV.addEventListener("click", function() { editVar(enteteVar.v, 'gen'); });
    });

        // colonne locuteur : après les variables générales
        if (showLocCol) {
        const thLoc = document.createElement("th");
        thLoc.textContent = "Locuteur";
        thLoc.classList.add("header-col-loc", "col-dat-locuteur");
        headerRow.appendChild(thLoc);
        colDefs.push({ key: 'locuteur', label: 'Locuteur', cssClass: 'col-dat-locuteur' });
        }

    // colonnes variables locuteurs
    varAfficherLoc.forEach(enteteVar => {
        const cssClass = `col-dat-loc-${enteteVar.v}`;
        const thV = document.createElement("th");
        thV.textContent = enteteVar.lib;
        thV.classList.add("header-col-var", cssClass);
        headerRow.appendChild(thV);
        colDefs.push({ key: `loc-${enteteVar.v}`, label: enteteVar.lib, cssClass });
        thV.addEventListener("click", function() { editVar(enteteVar.v, 'gen'); });
    });
    thead.appendChild(headerRow);


    // création des lignes du tableau : une ligne générale puis une ligne par locuteur
    tabEnt.forEach((dataRow, entIdx) => {
        const idEnt = String(dataRow.id);

        // Pré-calcul des valeurs générales (l = "all")
        const valeursGen = {};
        varAfficherGen.forEach(caseVar => {
            const ligDat = tabDat.filter(d => String(d.e) === idEnt && d.v == caseVar.v);
            const vals = [];
            ligDat.forEach(ligne => {
                const modalite = tabDic.find(dc => dc.v == caseVar.v && dc.m == ligne.m);
                if (modalite && modalite.lib && modalite.lib !== "undefined") vals.push(modalite.lib);
            });
            valeursGen[caseVar.v] = vals.join(" | ");
        });

        // Liste des locuteurs valides (index > 0, sans "?")
        const locuteursValides = [];
        if (dataRow.tabLoc) {
            dataRow.tabLoc.forEach((nom, idx) => {
                if (nom && idx > 0 && nom.lastIndexOf("?") === -1) {
                    locuteursValides.push({ idx, nom });
                }
            });
        }

        // Lignes locuteurs à afficher selon le filtre
        const locuteursAfficher = showLocRows ? locuteursValides : [];
        const totalRows = 1 + locuteursAfficher.length;

        // --- Ligne générale ---
        const trGen = document.createElement("tr");
        trGen.classList.add(entIdx % 2 === 0 ? "grp-pair" : "grp-impair", `ent-dat-${idEnt}`);
        if (locuteursAfficher.length === 0) trGen.classList.add("grp-last");

        // cellule entretien : rowSpan sur toutes les lignes du groupe
        const tdEnt = document.createElement("td");
        tdEnt.textContent = dataRow.nom;
        tdEnt.rowSpan = totalRows;
        tdEnt.style.verticalAlign = "top";
        tdEnt.classList.add("grp-last");
        trGen.appendChild(tdEnt);

        // cellules variables générales : rowSpan sur toutes les lignes du groupe
        varAfficherGen.forEach(caseVar => {
            const td = document.createElement("td");
            td.textContent = valeursGen[caseVar.v] || "---";
            td.rowSpan = totalRows;
            td.style.verticalAlign = "middle";
            td.dataset.entId = idEnt;
            td.dataset.varV = caseVar.v;
            td.dataset.loc = "all";
            td.classList.add("td-editable-gen", `col-dat-gen-${caseVar.v}`);
            trGen.appendChild(td);
        });

        // cellule locuteur vide + cellules vars loc dans trGen seulement s'il n'y a pas de lignes locuteurs
        // (sinon la première ligne locuteur remplit ces colonnes directement)
        if (locuteursAfficher.length === 0) {
            if (showLocCol) {
                const tdLocGen = document.createElement("td");
                tdLocGen.textContent = "";
                tdLocGen.classList.add("td-non-editable-gen", "col-loc", "col-dat-locuteur");
                trGen.appendChild(tdLocGen);
            }
            varAfficherLoc.forEach(caseVar => {
                const td = document.createElement("td");
                td.textContent = "";
                td.classList.add("td-non-editable-gen", `col-dat-loc-${caseVar.v}`);
                trGen.appendChild(td);
            });
        }
        tbody.appendChild(trGen);

        // --- Lignes locuteurs (variables "loc") ---
        locuteursAfficher.forEach((loc, rowIdx) => {
            const tr = document.createElement("tr");
            tr.classList.add(entIdx % 2 === 0 ? "grp-pair" : "grp-impair", `ent-dat-${idEnt}`);
            if (rowIdx === locuteursValides.length - 1) tr.classList.add("grp-last");

            // cellule locuteur (selon filtre)
            if (showLocCol) {
            const tdLoc = document.createElement("td");
            tdLoc.style.fontStyle = "italic";
            tdLoc.style.color = "#868686";
            tdLoc.textContent = loc.nom;
            tdLoc.classList.add("col-loc", "col-dat-locuteur");
            tr.appendChild(tdLoc);
            }

            // cellules variables locuteurs
            varAfficherLoc.forEach(caseVar => {
                const td = document.createElement("td");
                const ligDat = tabDat.filter(d => String(d.e) === idEnt && d.v == caseVar.v && d.l == loc.idx);
                const vals = [];
                ligDat.forEach(ligne => {
                    const modalite = tabDic.find(dc => dc.v == caseVar.v && dc.m == ligne.m);
                    if (modalite && modalite.lib && modalite.lib !== "undefined") vals.push(modalite.lib);
                });
                td.textContent = vals.length > 0 ? vals.join(" | ") : "---";
                td.dataset.entId = idEnt;
                td.dataset.varV = caseVar.v;
                td.dataset.loc = loc.idx;
                td.classList.add("td-editable-gen", `col-dat-loc-${caseVar.v}`);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    });

    // Initialiser le panneau de visibilité des colonnes
    const entretiensList = tabEnt.map(r => ({ id: String(r.id), nom: r.nom }));
    _setupColVisData(divTabDat, table, colDefs);
    _setupRowVisData(divTabDat, entretiensList);

}

/**
 * Initialise le panneau de visibilité des colonnes du tableau Base de données
 */
function _setupColVisData(divTabDat, table, colDefs) {
    _colDefsData = colDefs; // mémoriser pour _updateInfoVisData
    // Initialiser les nouvelles colonnes à visible par défaut
    colDefs.forEach(({ key }) => {
        if (colsVisibiliteData[key] === undefined) colsVisibiliteData[key] = true;
    });

    // Appliquer la visibilité courante
    _applyColVisData(colDefs);

    // Séparer les colonnes par groupe (exclure la colonne structurelle "Locuteur" du dropdown)
    const colsGen = colDefs.filter(c => c.key.startsWith("gen-"));
    const colsLoc = colDefs.filter(c => c.key.startsWith("loc-"));

    // Panneau dropdown
    const panneau = document.createElement("div");
    panneau.id = "panneau-col-vis";
    panneau.style.cssText = `
        display: none; position: absolute; z-index: 1000;
        background: white; border: 1px solid #ccc; border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 8px 12px;
        min-width: 200px; max-height: 340px; overflow-y: auto;
    `;

    // --- Helpers ---
    const creerLigneCheckbox = (label, indent, checked, onChange) => {
        const ligne = document.createElement("label");
        ligne.style.cssText = `display:flex; align-items:center; gap:8px; padding:3px 0;
            cursor:pointer; font-size:0.9em; padding-left:${indent}px;`;
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = checked;
        cb.addEventListener("change", () => onChange(cb));
        ligne.appendChild(cb);
        ligne.appendChild(document.createTextNode(label));
        panneau.appendChild(ligne);
        return cb;
    };

    const mettreAJourGroupe = (cbGroupe, cols) => {
        const total = cols.length;
        const coches = cols.filter(c => colsVisibiliteData[c.key] !== false).length;
        cbGroupe.checked = coches === total;
        cbGroupe.indeterminate = coches > 0 && coches < total;
    };

    const mettreAJourTout = (cbTout) => {
        const total = colDefs.length;
        const coches = colDefs.filter(c => colsVisibiliteData[c.key] !== false).length;
        cbTout.checked = coches === total;
        cbTout.indeterminate = coches > 0 && coches < total;
    };

    // --- Checkbox "Tout" ---
    const separator = document.createElement("div");
    separator.style.cssText = "font-weight:600; font-size:0.85em; color:#555; padding-bottom:4px; border-bottom:1px solid #eee; margin-bottom:4px;";
    separator.textContent = "Colonnes visibles";
    panneau.appendChild(separator);

    let cbTout, cbGen, cbLoc;
    const cbsGen = [], cbsLoc = [];

    cbTout = creerLigneCheckbox("Tout", 0, true, (cb) => {
        colDefs.forEach(c => { colsVisibiliteData[c.key] = cb.checked; });
        cbsGen.forEach(c => c.checked = cb.checked);
        cbsLoc.forEach(c => c.checked = cb.checked);
        if (cbGen) { cbGen.checked = cb.checked; cbGen.indeterminate = false; }
        if (cbLoc) { cbLoc.checked = cb.checked; cbLoc.indeterminate = false; }
        _applyColVisData(colDefs);
    });

    // --- Groupe "Variables d'entretien" ---
    if (colsGen.length > 0) {
        const sepGen = document.createElement("div");
        sepGen.style.cssText = "margin-top:6px; margin-bottom:2px;";
        panneau.appendChild(sepGen);

        cbGen = creerLigneCheckbox("Variables d'entretien", 12, true, (cb) => {
            colsGen.forEach((c, i) => {
                colsVisibiliteData[c.key] = cb.checked;
                cbsGen[i].checked = cb.checked;
            });
            cb.indeterminate = false;
            mettreAJourTout(cbTout);
            _applyColVisData(colDefs);
        });
        cbGen.style.accentColor = "#2E73D8";

        colsGen.forEach(col => {
            const cb = creerLigneCheckbox(col.label, 24, colsVisibiliteData[col.key] !== false, (cb) => {
                colsVisibiliteData[col.key] = cb.checked;
                mettreAJourGroupe(cbGen, colsGen);
                mettreAJourTout(cbTout);
                _applyColVisData(colDefs);
            });
            cbsGen.push(cb);
        });
    }

    // --- Groupe "Variables de locuteur" ---
    if (colsLoc.length > 0) {
        const sepLoc = document.createElement("div");
        sepLoc.style.cssText = "margin-top:6px; margin-bottom:2px;";
        panneau.appendChild(sepLoc);

        cbLoc = creerLigneCheckbox("Variables de locuteur", 12, true, (cb) => {
            colsLoc.forEach((c, i) => {
                colsVisibiliteData[c.key] = cb.checked;
                cbsLoc[i].checked = cb.checked;
            });
            colsVisibiliteData['locuteur'] = cb.checked;
            cb.indeterminate = false;
            mettreAJourTout(cbTout);
            _applyColVisData(colDefs);
        });
        cbLoc.style.accentColor = "#2E73D8";

        colsLoc.forEach(col => {
            const cb = creerLigneCheckbox(col.label, 24, colsVisibiliteData[col.key] !== false, (cb) => {
                colsVisibiliteData[col.key] = cb.checked;
                // La colonne Locuteur est visible si au moins une variable de locuteur l'est
                colsVisibiliteData['locuteur'] = colsLoc.some(c => colsVisibiliteData[c.key] !== false);
                mettreAJourGroupe(cbLoc, colsLoc);
                mettreAJourTout(cbTout);
                _applyColVisData(colDefs);
            });
            cbsLoc.push(cb);
        });
    }

    // Initialiser l'état indeterminate au chargement
    if (cbGen) mettreAJourGroupe(cbGen, colsGen);
    if (cbLoc) mettreAJourGroupe(cbLoc, colsLoc);
    mettreAJourTout(cbTout);

    divTabDat.style.position = "relative";
    divTabDat.appendChild(panneau);

    // Bouton toggle
    const btn = document.getElementById("btn-col-vis");
    if (btn) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = btn.getBoundingClientRect();
            const divRect = divTabDat.getBoundingClientRect();
            panneau.style.top = (rect.bottom - divRect.top + 4) + "px";
            panneau.style.right = (divRect.right - rect.right) + "px";
            panneau.style.display = panneau.style.display === "none" ? "block" : "none";
        });
    }

    // Fermer le panneau en cliquant ailleurs (handler unique, remplacé à chaque reconstruction)
    if (_handlerFermerColVis) document.removeEventListener("click", _handlerFermerColVis);
    _handlerFermerColVis = () => { panneau.style.display = "none"; };
    document.addEventListener("click", _handlerFermerColVis);
}

/**
 * Applique la visibilité des colonnes via une règle CSS dynamique
 */
function _applyColVisData(colDefs) {
    let styleEl = document.getElementById("col-vis-style-dat");
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "col-vis-style-dat";
        document.head.appendChild(styleEl);
    }
    const rules = colDefs
        .filter(({ key }) => colsVisibiliteData[key] === false)
        .map(({ cssClass }) => `#divTabDat table .${cssClass} { display: none; }`)
        .join("\n");
    styleEl.textContent = rules;
    _updateInfoVisData();
}

/**
 * Initialise le panneau de visibilité des lignes (entretiens) du tableau Base de données
 */
function _setupRowVisData(divTabDat, entretiensList) {
    _entretienesListData = entretiensList; // mémoriser pour _updateInfoVisData
    // Initialiser les nouveaux entretiens à visible par défaut
    entretiensList.forEach(({ id }) => {
        if (lignesVisibiliteData[id] === undefined) lignesVisibiliteData[id] = true;
    });

    // Appliquer la visibilité courante
    _applyRowVisData(entretiensList);

    // Panneau dropdown
    const panneau = document.createElement("div");
    panneau.id = "panneau-lig-vis";
    panneau.style.cssText = `
        display: none; position: absolute; z-index: 1000;
        background: white; border: 1px solid #ccc; border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 8px 12px;
        min-width: 200px; max-height: 340px; overflow-y: auto;
    `;

    // --- Helpers ---
    const creerLigne = (label, indent, checked, onChange) => {
        const ligne = document.createElement("label");
        ligne.style.cssText = `display:flex; align-items:center; gap:8px; padding:3px 0;
            cursor:pointer; font-size:0.9em; padding-left:${indent}px;`;
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = checked;
        cb.addEventListener("change", () => onChange(cb));
        ligne.appendChild(cb);
        ligne.appendChild(document.createTextNode(label));
        panneau.appendChild(ligne);
        return cb;
    };

    const mettreAJourTout = (cbTout) => {
        const total = entretiensList.length;
        const coches = entretiensList.filter(e => lignesVisibiliteData[e.id] !== false).length;
        cbTout.checked = coches === total;
        cbTout.indeterminate = coches > 0 && coches < total;
    };

    // Titre
    const titre = document.createElement("div");
    titre.style.cssText = "font-weight:600; font-size:0.85em; color:#555; padding-bottom:4px; border-bottom:1px solid #eee; margin-bottom:4px;";
    titre.textContent = "Entretiens visibles";
    panneau.appendChild(titre);

    const cbsEnt = [];
    const cbTout = creerLigne("Tout", 0, true, (cb) => {
        entretiensList.forEach((e, i) => {
            lignesVisibiliteData[e.id] = cb.checked;
            cbsEnt[i].checked = cb.checked;
        });
        cb.indeterminate = false;
        _applyRowVisData(entretiensList);
    });

    entretiensList.forEach(ent => {
        const cb = creerLigne(ent.nom, 12, lignesVisibiliteData[ent.id] !== false, (cb) => {
            lignesVisibiliteData[ent.id] = cb.checked;
            mettreAJourTout(cbTout);
            _applyRowVisData(entretiensList);
        });
        cbsEnt.push(cb);
    });

    mettreAJourTout(cbTout);

    divTabDat.style.position = "relative";
    divTabDat.appendChild(panneau);

    // Bouton toggle
    const btn = document.getElementById("btn-lig-vis");
    if (btn) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = btn.getBoundingClientRect();
            const divRect = divTabDat.getBoundingClientRect();
            panneau.style.top = (rect.bottom - divRect.top + 4) + "px";
            panneau.style.right = (divRect.right - rect.right) + "px";
            panneau.style.display = panneau.style.display === "none" ? "block" : "none";
        });
    }

    // Fermer le panneau en cliquant ailleurs (handler unique, remplacé à chaque reconstruction)
    if (_handlerFermerLigVis) document.removeEventListener("click", _handlerFermerLigVis);
    _handlerFermerLigVis = () => { panneau.style.display = "none"; };
    document.addEventListener("click", _handlerFermerLigVis);
}

/**
 * Applique la visibilité des lignes via une règle CSS dynamique
 */
function _applyRowVisData(entretiensList) {
    let styleEl = document.getElementById("lig-vis-style-dat");
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "lig-vis-style-dat";
        document.head.appendChild(styleEl);
    }
    const rules = entretiensList
        .filter(({ id }) => lignesVisibiliteData[id] === false)
        .map(({ id }) => `#divTabDat table .ent-dat-${id} { display: none; }`)
        .join("\n");
    styleEl.textContent = rules;
    _updateInfoVisData();
}

/**
 * Met à jour le bandeau d'information sur les lignes/colonnes cachées
 */
function _updateInfoVisData() {
    const divInfo = document.getElementById("info-vis-dat");
    if (!divInfo) return;

    const lister = (noms) => {
        if (noms.length === 1) return noms[0];
        return noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1];
    };

    const lignes = [];

    // Lignes cachées
    const entsCaches = _entretienesListData.filter(e => lignesVisibiliteData[e.id] === false);
    if (entsCaches.length > 0) {
        const label = entsCaches.length === 1 ? "Ligne cachée" : "Lignes cachées";
        lignes.push(`${label} : ${lister(entsCaches.map(e => e.nom))}`);
    }

    // Colonnes cachées — variables générales
    const genCaches = _colDefsData.filter(c => c.key.startsWith("gen-") && colsVisibiliteData[c.key] === false);
    if (genCaches.length > 0) {
        const label = genCaches.length === 1 ? "Variable d’entretien cachée" : "Variables d’entretien cachées";
        lignes.push(`${label} : ${lister(genCaches.map(c => c.label))}`);
    }

    // Colonnes cachées — variables de locuteur
    const locCaches = _colDefsData.filter(c => c.key.startsWith("loc-") && colsVisibiliteData[c.key] === false);
    if (locCaches.length > 0) {
        const label = locCaches.length === 1 ? "Variable de locuteur cachée" : "Variables de locuteur cachées";
        lignes.push(`${label} : ${lister(locCaches.map(c => c.label))}`);
    }

    divInfo.innerHTML = lignes.map(l => `<span>${l}</span>`).join("<br>");
    divInfo.style.display = lignes.length > 0 ? "block" : "none";
}

async function hideTabDat(){
    const divTabDat = document.getElementById("divTabDat");
    if (divTabDat) divTabDat.remove();

    // Mode panneau dans index.html : fond_dat_corpus n'existe que dans cette page
    const fondDatCorpus = document.getElementById("fond_dat_corpus");
    if (fondDatCorpus) {
        const container = document.querySelector('.container');
        if (container) container.classList.remove('plein-ecran');
        fondDatCorpus.classList.add('dnone');
        fondDatCorpus.innerHTML = '';
        document.querySelectorAll('.imgbtn_g').forEach(b => b.style.opacity = 0.3);
        return;
    }

    // Comportement original (edition_entretien.html)
    const rkEnt = await window.electronAPI.getEntCur();
    if (rkEnt !== -1) {
        await affichDataEnt();
    }
};

// Activer l'édition inline d'une cellule du tableau global
function activerEditionGen(td) {
    if (td.dataset.editing === "1") return; // déjà en cours d'édition
    td.dataset.editing = "1";

    const currentText = td.textContent === "---" ? "" : td.textContent;
    const v = td.dataset.varV;

    // Figer la largeur du td pour éviter tout redimensionnement lors de l'injection de l'input
    const tdWidth = td.getBoundingClientRect().width;
    td.style.width = tdWidth + "px";
    td.style.minWidth = tdWidth + "px";
    td.style.maxWidth = tdWidth + "px";

    // Récupération des modalités existantes pour cette variable
    const ligsDic = tabDic.filter(d => d.v == v && d.m != 0);
    const options = ligsDic.map(item => item.lib);

    // Remplacement du contenu de la cellule par un champ de saisie
    td.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentText;
    input.className = "txtmod-gen";
    td.appendChild(input);
    input.focus();
    input.select();

    // Création du menu déroulant des modalités existantes
    let dropdown = null;
    if (options.length > 0) {
        dropdown = document.createElement("div");
        dropdown.className = "menu-dic-gen";
        dropdown.innerHTML = options.map(opt =>
            `<div class="menu-dic-item-gen">${opt}</div>`
        ).join("");
        document.body.appendChild(dropdown);
        const positionner = () => {
            const rect = input.getBoundingClientRect();
            dropdown.style.left = rect.left + "px";
            dropdown.style.top = rect.bottom + 1 + "px";
            dropdown.style.width = Math.max(rect.width, 120) + "px";
        };
        positionner();

        // Sélection d'une modalité dans le menu (mousedown avant blur)
        dropdown.addEventListener("mousedown", async function(e) {
            if (e.target.classList.contains("menu-dic-item-gen")) {
                e.preventDefault(); // éviter le blur de l'input
                const valeur = e.target.textContent;
                cleanup();
                await validerCellGen(td, valeur);
            }
        });
    }

    const cleanup = () => {
        if (dropdown && dropdown.parentElement) dropdown.remove();
        td.style.width = "";
        td.style.minWidth = "";
        td.style.maxWidth = "";
        delete td.dataset.editing;
    };

    const annuler = () => {
        cleanup();
        td.textContent = currentText || "---";
    };

    input.addEventListener("keydown", async function(e) {
        if (e.key === "Enter") {
            const valeur = input.value;
            cleanup();
            await validerCellGen(td, valeur);
        } else if (e.key === "Escape") {
            annuler();
        }
    });

    input.addEventListener("blur", function() {
        setTimeout(() => {
            if (td.dataset.editing === "1") annuler();
        }, 200);
    });
}

// Valider la modification d'une cellule du tableau global et sauvegarder le fichier .sonal
async function validerCellGen(td, lib) {
    const entId = td.dataset.entId;
    const v = Number(td.dataset.varV);
    const loc = td.dataset.loc; // "all" ou index locuteur

    if (!lib || !lib.trim()) {
        td.textContent = "---";
        return;
    }

    // Trouver le rang actuel de l'entretien (robuste même si tabEnt a changé)
    tabEnt = await window.electronAPI.getEnt();
    const rkEnt = tabEnt.findIndex(ent => String(ent.id) === String(entId));
    if (rkEnt === -1) {
        console.error("validerCellGen : entretien introuvable id=" + entId);
        td.textContent = "---";
        return;
    }

    // Vérification du verrou pour les corpus distants
    const Corpus = await window.electronAPI.getCorpus();
    if (Corpus && (Corpus.type === "distant" || Corpus.type === "gitlab")) {
        const lockResult = await window.electronAPI.isEntretienLocked(rkEnt);
        if (lockResult && lockResult.locked === true) {
            alert(`L'entretien est actuellement édité par ${lockResult.user}.\nVous ne pouvez pas le modifier pour le moment.`);
            // Restaurer la valeur affichée
            const ligEnt = tabEnt[rkEnt];
            const ligDat = ligEnt && ligEnt.tabDat ? ligEnt.tabDat.find(d => d.v == v && d.l == loc) : null;
            const ligDic = ligDat ? tabDic.find(d => d.v == v && d.m == ligDat.m) : null;
            td.textContent = (ligDic && ligDic.lib) ? ligDic.lib : "---";
            return;
        }
    }

    // Mise à jour des données via validMod (gère tabDic et tabDat)
    await validMod(entId, v, loc, 0, lib);

    // Rechargement des données depuis le store
    tabEnt = await window.electronAPI.getEnt();
    tabDic = await window.electronAPI.getDic();
    tabDat = await window.electronAPI.getDat();

    // Mise à jour de l'affichage de la cellule
    td.textContent = lib;
    td.classList.remove("validation-ok-td");
    void td.offsetWidth;
    td.classList.add("validation-ok-td");

    try {
        // Réécriture du fichier .sonal uniquement pour cet entretien
        await window.majFichierSonal(rkEnt, rkEnt + 1);
        // Sauvegarde du fichier .crp pour persistance au redémarrage
        await window.sauvegarderCorpus(false);
    } catch(err) {
        afficherNotification("Erreur lors de la sauvegarde : " + (err.message || err), "error");
    }
}

async function exportTabDat() { // export CSV depuis le tableau HTML affiché — respecte la visibilité lignes/colonnes

    const table = document.querySelector("#divTabDat table");
    if (!table) {
        afficherNotification("Le tableau n'est pas affiché.", "error");
        return;
    }

    const SEP = ";";
    const csvCell = (val) => {
        const s = (val === null || val === undefined) ? "" : String(val).trim();
        if (s.includes(SEP) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    // Colonnes visibles (ordre conservé depuis _colDefsData)
    const visibleCols = _colDefsData.filter(c => colsVisibiliteData[c.key] !== false);

    // En-tête : "Entretien" toujours en premier, puis les colonnes visibles
    const allThs = Array.from(table.querySelectorAll("thead tr th"));
    const lignes = [];
    const headerCells = ["Entretien"];
    for (const col of visibleCols) {
        const th = allThs.find(th => th.classList.contains(col.cssClass));
        headerCells.push(th ? csvCell(th.textContent) : col.label);
    }
    lignes.push(headerCells.join(SEP));

    // Lignes du tbody : on saute les lignes cachées, et pour chaque td
    // on cherche la cellule par sa classe CSS de colonne (robuste face aux rowspan).
    table.querySelectorAll("tbody tr").forEach(tr => {
        if (getComputedStyle(tr).display === "none") return; // ligne cachée par le filtre "Lignes"

        const cells = Array.from(tr.cells);
        const estLigneGen = cells[0] && cells[0].classList.contains("grp-last");
        const rowCells = [];

        if (estLigneGen) {
            rowCells.push(csvCell(cells[0].textContent)); // colonne Entretien
        } else {
            rowCells.push(""); // colonne Entretien vide pour les lignes locuteurs
        }

        for (const col of visibleCols) {
            const td = cells.find(td => td.classList.contains(col.cssClass));
            if (!td || td.classList.contains("td-non-editable-gen")) {
                rowCells.push(""); // colonne absente dans cette ligne (rowspan ou vide intentionnel)
            } else {
                rowCells.push(csvCell(td.textContent));
            }
        }

        lignes.push(rowCells.join(SEP));
    });

    const contenuCsv = lignes.join("\r\n");

    const Corpus = await window.electronAPI.getCorpus();
    const nomBase = Corpus && Corpus.fileName
        ? Corpus.fileName.replace(/\.[^/.]+$/, '') + "_donnees"
        : "donnees";

    const result = await window.electronAPI.saveFileDialog({
        filename: nomBase + ".csv",
        content: contenuCsv,
        encoding: "win1252"  // compatible Excel français
    });

    if (result && result.success) {
        afficherNotification("CSV exporté : " + result.filePath, "success");
    } else if (result && !result.canceled) {
        afficherNotification("Erreur lors de l'export : " + (result.error || "inconnue"), "error");
    }
}

async function updateVarsDsEnt(){ // fonction de mise à jour des variables générales après modification
    
    // récupération du tableau des entretiens
    tabEnt = await window.electronAPI.getEnt();
    
    // récupération du tableau des variables générales
    tabVar = await window.electronAPI.getVar();

     

    // défilement des entretiens
    tabEnt.forEach(ent => {
        ent.tabVar = tabVar

    });
     
    await window.electronAPI.setEnt(tabEnt)
}

async function varsPubliquesEnt(rkEnt){ // Affichage des variables publiques pour un entretien donné

    //console.log("Affichage des variables publiques pour l'entretien n°" + rkEnt);   
    tabEnt = await window.electronAPI.getEnt();
    tabVar = await window.electronAPI.getVar();
    tabDic = await window.electronAPI.getDic(); // tabDic global = source de vérité

    const ent = tabEnt[rkEnt];

    if (ent && ent.tabDat) {

        //console.log("Entretien trouvé :", ent.nom);
        const varPub = tabVar.filter(v => v.priv === "false");  
         
        // création de la chaine 
        let chaineHtml = ""; 
        let chaineText = ""; 

        for (let i=0; i< varPub.length; i++){
            const v = varPub[i];

            // recherche dans le tabdat de l'entretien des différentes valeurs de la variable
            const ligDat = ent.tabDat.filter(d => d.v == v.v );
            
            let modas = [];
            if (ligDat.length > 0) { // Vérifier s'il y a des résultats
                //console.log("Lignes de tabDat locale trouvées :", ligDat);
                
                // récupération de la valeur de modalité
                modas = [];
                ligDat.forEach(ligne => {
                    const modalite = tabDic.find(dc => dc.v == v.v && dc.m === ligne.m && ligne.m>0);
                    if (modalite) {
                        // récupération du nom du locuteur si var par locuteurs
                        let modaLib = modalite.lib;
                        if (v.champ === "loc") {
                            const locName = ent.tabLoc[ligne.l];
                            modaLib = locName + " : " + modaLib;
                        }
                        modas.push(modaLib);
                    }
                });

            }    

            chaineHtml += `<label class="var-pub">${v.lib}\n<b>${modas.length > 0 ? modas.join(", ") : "---"}</b></label>\n`;
            chaineText += `${v.lib} : ${modas.length > 0 ? modas.join(", ") : "---"}`;
            chaineText += "\n";
        }

        //console.log("Chaine des variables publiques pour l'entretien " + rkEnt + " :\n" + chaineHtml);
        return [chaineHtml, chaineText];
    }else {
        //console.log("Entretien non trouvé ou pas de données pour l'entretien n°" + rkEnt);
        return ["", ""];
    }
}

async function varsPubliquesXtr(xtr){ // Variables publiques pour un extrait : variables d'entretien + variables des seuls locuteurs présents dans l'extrait

    tabEnt = await window.electronAPI.getEnt();
    tabVar = await window.electronAPI.getVar();
    tabDic = await window.electronAPI.getDic();

    const rkEnt = xtr.entretien;
    const ent = tabEnt[rkEnt];

    if (!ent || !ent.tabDat) {
        return ["", ""];
    }

    // Identification des noms de locuteurs présents dans l'extrait (via les spans ligloc)
    const nomsLocXtr = new Set();
    xtr.texte.forEach(mot => {
        if (mot.classList && mot.classList.contains('ligloc') && mot.dataset.nomloc) {
            nomsLocXtr.add(mot.dataset.nomloc);
        }
    });

    // Correspondance noms → indices dans tabLoc
    const indicesLocXtr = new Set();
    if (ent.tabLoc) {
        ent.tabLoc.forEach((nom, idx) => {
            if (nom && nomsLocXtr.has(nom)) {
                indicesLocXtr.add(idx);
            }
        });
    }

    const varPub = tabVar.filter(v => v.priv === "false");
    let chaineHtml = "";
    let chaineText = "";

    // Variables générales : une ligne par variable
    const varGen = varPub.filter(v => v.champ === "gen");
    for (const v of varGen) {
        const ligDat = ent.tabDat.filter(d => d.v == v.v);
        const modas = [];
        ligDat.forEach(ligne => {
            const modalite = tabDic.find(dc => dc.v == v.v && dc.m === ligne.m && ligne.m > 0);
            if (modalite) modas.push(modalite.lib);
        });
        chaineHtml += `<label class="var-pub">${v.lib}\n<b>${modas.length > 0 ? modas.join(", ") : "---"}</b></label>\n`;
        chaineText += ` ${v.lib} : ${modas.length > 0 ? modas.join(", ") : "---"}`;
    }

    // Variables locuteurs : groupées par locuteur (une entrée par locuteur avec toutes ses valeurs)
    const varLoc = varPub.filter(v => v.champ === "loc");
    if (varLoc.length > 0 && indicesLocXtr.size > 0) {
        // Construire un map idx → [valeurs de toutes les variables loc]
        const valsParLoc = new Map();
        indicesLocXtr.forEach(idx => valsParLoc.set(idx, []));

        for (const v of varLoc) {
            const ligDat = ent.tabDat.filter(d => d.v == v.v && indicesLocXtr.has(Number(d.l)));
            ligDat.forEach(ligne => {
                const modalite = tabDic.find(dc => dc.v == v.v && dc.m === ligne.m && ligne.m > 0);
                if (modalite) {
                    const idx = Number(ligne.l);
                    if (!valsParLoc.has(idx)) valsParLoc.set(idx, []);
                    valsParLoc.get(idx).push(modalite.lib);
                }
            });
        }

        valsParLoc.forEach((vals, idx) => {
            if (vals.length > 0) {
                const locName = ent.tabLoc[idx] || "?";
                chaineHtml += `<label class="var-pub">${locName}\n<b>${vals.join(", ")}</b></label>\n`;
                chaineText += ` ${locName} : ${vals.join(", ")}`;
            }
        });
    }

    return [chaineHtml, chaineText];
}

async function pointvariables(){ // fonction de pointage des variables dans les fichiers d'entretiens

     console.log("Pointage des variables dans les fichiers d'entretiens");
        // récupération du tableau des entretiens
        tabEnt = await window.electronAPI.getEnt();
        tabVar = await window.electronAPI.getVar();
        tabDic = await window.electronAPI.getDic();
        tabDat = await window.electronAPI.getDat();

        console.log("tabEnt", tabEnt);
        console.log("tabVar général", tabVar);
        console.log("tabDic général", tabDic);
        console.log("tabDat général", tabDat);


        // défilement des entretiens
        tabEnt.forEach(ent => {
            const tabVarEnt = ent.tabVar; // récupération des variables de l'entretien
            const tabDicEnt = ent.tabDic; // récupération des modalités de l'entretien
            const tabDatEnt = ent.tabDat; // récupération des données de l'entretien
        
        console.log("Traitement de l'entretien :", ent.nom);
        console.log("Variables de l'entretien :", tabVarEnt);
        console.log("Modalités de l'entretien :", tabDicEnt);
        console.log("Données de l'entretien :", tabDatEnt);
        }

    );
}

async function pointvariablesEnt(){
       
        console.log("tabVar ", tabVar);
        console.log("tabDic ", tabDic);
        console.log("tabDat ", tabDat);

}

function _dedupArray(arr, keyFn) {
    const seen = new Map();
    const cleaned = [];
    for (let i = arr.length - 1; i >= 0; i--) {
        const key = keyFn(arr[i]);
        if (!seen.has(key)) {
            seen.set(key, true);
            cleaned.unshift(arr[i]);
        }
    }
    return cleaned;
}

async function cleanVariables() { // fonction permettant de faire le ménage dans tabDat et tabDic

    tabEnt = await window.electronAPI.getEnt();

    // --- Correction des IDs dupliqués dans tabEnt ---
    const idsVus = new Map();
    let maxId = tabEnt.length > 0 ? Math.max(...tabEnt.map(e => Number(e.id) || 0)) : 0;
    tabEnt.forEach(ent => {
        const idNum = Number(ent.id);
        if (idsVus.has(idNum)) {
            maxId++;
            console.warn(`cleanVariables: ID dupliqué ${ent.id} corrigé en ${maxId} pour l'entretien "${ent.nom}"`);
            ent.id = maxId;
        } else {
            idsVus.set(idNum, true);
            ent.id = idNum; // normalisation en nombre
        }
    });

    // --- tabDat : nettoyage local puis rebuild global ---
    tabEnt.forEach(ent => {
        const eId = String(ent.id);

        if (!ent.tabDat || !Array.isArray(ent.tabDat)) {
            ent.tabDat = [];
        } else {
            ent.tabDat = _dedupArray(
                ent.tabDat
                    .filter(d =>
                        d.v !== null && d.v !== undefined &&
                        d.l !== null && d.l !== undefined &&
                        d.m !== null && d.m !== undefined
                    )
                    .map(d => ({ ...d, e: eId, v: Number(d.v), m: Number(d.m) })), // normalisation des types
                d => `${d.v}|${d.l}`
            ).sort((a, b) => String(a.v).localeCompare(String(b.v), undefined, {numeric: true}) || String(a.l).localeCompare(String(b.l), undefined, {numeric: true}) || String(a.m).localeCompare(String(b.m), undefined, {numeric: true}));
        }

        // --- tabDic : nettoyage local (ent.tabDic) ---
        if (!ent.tabDic || !Array.isArray(ent.tabDic)) {
            ent.tabDic = [];
        } else {
            ent.tabDic = _dedupArray(
                ent.tabDic.filter(d =>
                    d.v !== null && d.v !== undefined &&
                    d.m !== null && d.m !== undefined
                ),
                d => `${d.v}|${d.m}`
            ).sort((a, b) => String(a.v).localeCompare(String(b.v), undefined, {numeric: true}) || String(a.m).localeCompare(String(b.m), undefined, {numeric: true}));
        }
    });

    await window.electronAPI.setEnt(tabEnt);

    // Reconstruire le tabDat global par agrégation des tabDat locaux
    tabDat = tabEnt.flatMap(ent => ent.tabDat || [])
        .sort((a, b) => String(a.v).localeCompare(String(b.v), undefined, {numeric: true}) || String(a.l).localeCompare(String(b.l), undefined, {numeric: true}) || String(a.m).localeCompare(String(b.m), undefined, {numeric: true}));
    await window.electronAPI.setDat(tabDat);

    // Nettoyer le tabDic global (géré indépendamment, pas reconstruit depuis les locaux)
    tabDic = await window.electronAPI.getDic();

    // Normalisation des types (v et m → Number)
    tabDic = tabDic.map(d => ({ ...d, v: Number(d.v), m: Number(d.m) }));

    // Suppression des entrées avec lib vide ET m > 0 (marqueurs orphelins)
    tabDic = tabDic.filter(d =>
        d.v !== null && d.v !== undefined && !isNaN(d.v) &&
        d.m !== null && d.m !== undefined && !isNaN(d.m) &&
        (d.m === 0 || (d.lib !== undefined && d.lib !== null && d.lib !== '' && d.lib !== 'undefined'))
    );

    // Ajout des entrées m=0 manquantes pour chaque variable connue
    tabVar = await window.electronAPI.getVar();
    tabVar.forEach(vr => {
        if (!tabDic.some(d => d.v == vr.v && d.m === 0)) {
            tabDic.push({v: Number(vr.v), m: 0});
        }
    });

    tabDic = _dedupArray(
        tabDic,
        d => `${d.v}|${d.m}`
    ).sort((a, b) => String(a.v).localeCompare(String(b.v), undefined, {numeric: true}) || String(a.m).localeCompare(String(b.m), undefined, {numeric: true}));
    await window.electronAPI.setDic(tabDic);

    const nDoublonsIds = tabEnt.filter((e, i) => tabEnt.findIndex(x => x.id === e.id) !== i).length;
    console.log(`cleanVariables : tabDat = ${tabDat.length} entrées, tabDic global = ${tabDic.length} entrées après nettoyage. IDs dupliqués corrigés : ${nDoublonsIds}.`);
}

// ============================================================
// FONCTIONS DE POSITIONNEMENT DES VARIABLES
// ============================================================

// Remplit le menu déroulant "Placer après..." en filtrant par champ (gen/loc)
function remplirCmbVar(champ) {
    const cmb = document.getElementById("listCmbVar");
    const summaryEl = document.getElementById("cmbPosVar");
    if (!cmb || !summaryEl) return;

    placerApresVar = "dernier";
    summaryEl.textContent = "En dernier";

    const rgVar = Number(document.getElementById("lblCodeVar")?.value) || 0;

    cmb.innerHTML = `<li onclick="selPosVar('premier')">En premier</li>`;

    if (!tabVar || !tabVar.length) return;

    const varsFiltrées = tabVar.filter(v => v.champ === champ && v.v != rgVar);
    varsFiltrées.forEach(v => {
        cmb.innerHTML += `<li onclick="selPosVar(${v.v})">${v.lib}</li>`;
    });
}

// Sélection dans le menu déroulant : 'premier' | 'dernier' | code_v numérique
function selPosVar(code) {
    placerApresVar = code;
    const summaryEl = document.getElementById("cmbPosVar");
    if (!summaryEl) return;

    if (code === 'premier') {
        summaryEl.textContent = "En premier";
    } else if (code === 'dernier') {
        summaryEl.textContent = "En dernier";
    } else {
        const varRef = tabVar.find(v => v.v == code);
        summaryEl.textContent = varRef ? varRef.lib : "?";
    }

    const details = summaryEl.closest('details');
    if (details) details.removeAttribute("open");
}

// Repositionne la variable vCode dans tabVar selon placerApresVar
function repositionnerVar(vCode) {
    if (placerApresVar === "dernier") return; // pas de déplacement

    const currentIdx = tabVar.findIndex(v => v.v == vCode);
    if (currentIdx === -1) return;

    const [movedVar] = tabVar.splice(currentIdx, 1);

    if (placerApresVar === 'premier') {
        tabVar.unshift(movedVar);
    } else {
        const targetIdx = tabVar.findIndex(v => v.v == placerApresVar);
        if (targetIdx === -1) {
            tabVar.push(movedVar); // fallback : en dernier
        } else {
            tabVar.splice(targetIdx + 1, 0, movedVar);
        }
    }

    placerApresVar = "dernier"; // réinitialisation après usage
}
