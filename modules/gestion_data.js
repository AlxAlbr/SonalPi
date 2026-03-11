////////////////////////////////////////////////////////////////
//DATA
////////////////////////////////////////////////////////////////

// gestion des métadonnées associées aux entretiens


//var tabDat = []; // tableau des données de l'entretien
var rgEnt = 1; // mémorise le rang de l'entretien courant (1 par défaut dans Whispurge)

var txtmod_cur = null; // mémorisation du texte de modalité en cours de modification (pour le menu)

// AJOUTER UNE VARIABLE
function addVar(mode) {

    console.log("Ajout d'une nouvelle variable au tableau existant" + JSON.stringify(tabVar));
    
    var rkVar = Number(document.getElementById("lblCodeVar").value); 

    // le rang existe-t-il déjà? 
    const existe = tabVar.some(item => item.v == rkVar);
    if (existe){ // si oui -> mise à jour
        
        sauvVar(rkVar, mode); 
        hidedlg(); 
        return; 
    }

    var newVar = document.getElementById("lblLibVar").value;
    var champ = document.querySelector('input[name="chkVarChmp"]:checked').value;
    var priv = document.querySelector('input[name="chkVarPriv"]:checked').value;

    

    if (newVar) { // création d'une nouvelle variable 
        
        
        tabVar.push({'v': rkVar, 'lib': newVar, 'champ': champ, 'priv': priv }); // Ajouter la nouvelle variable au tableau
        tabDic.push ({ 'v': rkVar, 'm' : 0 , 'lib' : "" }) // Ajouter la modalité 0
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
        sauvModas();  

        if (mode =="loc") {
        affichDataEnt();
        } else if (mode=="gen") {
        affichDataGen();
        }
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
        

        // ajout des modalités
        
        // 1 - récupération de la liste des modalités
       
        const ligsDic= tabDic.filter (dic => dic.v == rgVar && dic.m !=0) ;

        //if (ligsDic.length==0){return;}

        const fondDico = document.getElementById("dico")
        fondDico.innerHTML=""; 
        
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
                 
                fondMod.appendChild(divLib);


            

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
 
         
        // Mise à jour des modalités
        sauvModas(mode);  

        console.table("Tableau des variables mis à jour :", tabVar);

        // sauvegarde du tableau des variables
        await electronAPI.setVar(tabVar);


            if(mode=='loc'){
               
                affichDataEnt();

            } 

            if (mode=='gen'){
                await window.sauvegarderCorpus(false);
                updateVarsDsEnt() ;// modification dans les fichiers Sonal de tous les entretiens
                await window.majFichierSonal();
                 affichDataGen(); 
            } 


      
              
    } else {
        alert("Veuillez entrer un nom de variable.");
    }
}

// suppression d'une variable
async function supprVar(rgVar, mode) {
    console.log("Suppression de la variable à l'index :", rgVar, "mode:", mode);

    // message d'avertissement 

    if (!confirm("Êtes-vous sûr de vouloir supprimer cette variable ? \n Attention! Cette action est irréversible et entraînera la suppression de toutes les modalités associées dans tous les entretiens.")) {
        return;
    }
    // recherche de la variable à supprimer
    const varIndex = tabVar.findIndex(vr => vr.v == rgVar);

    if (varIndex !== -1) {
    
        
    
        // suppression de la variable du tableau
        tabVar.splice(varIndex, 1);

        // suppression des modalités associées
        tabDic = tabDic.filter(item => item.v != rgVar);

        // sauvegarde du tableau des variables
        await electronAPI.setVar(tabVar);

        if(mode=='loc'){
            
            affichDataEnt();
        } else if (mode=='gen'){
            await window.sauvegarderCorpus(false);
            updateVarsDsEnt() ;// modification dans les fichiers Sonal de tous les entretiens
            await window.majFichierSonal();


            affichDataGen(); 
        }

        hidedlg();
    } else {
        alert("Variable non trouvée.");
    }
}

// sauvegarde des modalités depuis la fenêtre d'édition des variables
function sauvModas(ode) {

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
        if (input.value != input.lib && rkV && rkM) {
            chgDic(rkV, rkM, input.value)
        };

    });

    
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

                var moda =maxMod+1; 
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

    const rkLigDic= tabDic.findIndex (vr => vr.v == v && vr.m === m);
    if (rkLigDic > -1){
        tabDic[rkLigDic].lib = lib; 
    } else {
        tabDic.push({'v':Number(v), 'm':m, 'lib':lib})
    }

    await electronAPI.setDic(tabDic); // sauvegarde du tabdic

}

// valider un changement de modalité
async function validMod(rgEnt, v, l, m, lib){
    
    if (!rgEnt) {
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

          
        tabDic.push({'v':v, 'm':m,'lib':lib })

        await window.electronAPI.setDic(tabDic); // sauvegarde du tabdic

        // console.log(tabDic)
    } else {
        m = tabDic[rgTabDic].m
    }
    
   

    // Mise à jour du tabdat
    // recherche de l'index 

    tabDat = await window.electronAPI.getDat(); // on recharge le tabdat pour être sûr d'avoir la dernière version à jour
    const ligDat = tabDat.findIndex(vr => vr.v == v && vr.l === l) ;

    if(ligDat ==-1){
        tabDat.push({'e' : rgEnt,'v' : v, 'l' : l, 'm' : m})
    } else {

        tabDat[ligDat].m=m; // mise à jour de la modalité
    }

    await window.electronAPI.setDat(tabDat); // sauvegarde du tabdat

    // mise à jour du tabdat dans le tabent de l'entretien
    const ligEnt = tabEnt.find(ent => ent.rg === rgEnt);
    if (ligEnt){
        const varModif = ligEnt.tabDat.find(d => d.v == v && d.l === l);
        if (varModif){
            varModif.m = m;
        } else {
            ligEnt.tabDat.push({'v' : v, 'l' : l, 'm' : m})
        }
    }

    await window.electronAPI.setEnt(tabEnt); // sauvegarde du tabent
    


    document.getElementById("menudic").style.display="none"; 




}

// récupérer une valeur de modalité
// e = index tableau de tabEnt (pas le .id)
async function getMod(e,v,l) {

    console.log("recherche de la valeur prise pour l'entretien ", e, "à la variable" , v)

    let moda = 0;
    let libellé = "";

    // accès direct par index tableau (e est l'index, pas le .id)
    if (!tabEnt[e]) {
        tabEnt = await window.electronAPI.getEnt(); // on recharge le tabent pour être sûr d'avoir la dernière version à jour
    }
    
    const entObj = tabEnt[e];
    const tabDatEnt = entObj.tabDat;
    
    // utilisation du tabDic LOCAL de l'entretien (comme affichDataGen)
    const tabDicLoc = entObj.tabDic ;

     // récupération de la valeur de modalité dans le tabdat
                const ligDat = tabDatEnt.filter(d => d.v == v && d.l == l);
                                
                // si elle n'existe pas on la crée
                if (ligDat.length==0){
                    if (tabDat) { tabDat.push({'e' : e,'v' : v, 'l' : l, 'm' : 0 }) }
                    // la valeur est nulle
                    moda=0 

                } else {

                    moda  = ligDat[0].m
                    
                    if (moda>0){
                        // cherche d'abord dans le tabDic local, puis global en fallback
                        const ligDic = tabDicLoc.find(item => item.v == v && item.m == ligDat[0].m)
                                    || tabDic.find(item => item.v == v && item.m == ligDat[0].m);
                        libellé  = ligDic ? ligDic.lib : "";
                    }
                }
return [moda, libellé]
}


// fonction d'affichage des variables/modalités pour un seul entretien 
async function affichDataEnt(){

     
    // récupération des tableaux de données nécessaires à l'affiachage
    if (!tabEnt) {tabEnt = await window.electronAPI.getEnt()};
    if (!tabVar) {tabVar = await window.electronAPI.getVar()};
    if (!tabDic) {tabDic = await window.electronAPI.getDic()};
    if (!tabDat) {tabDat = await window.electronAPI.getDat()};


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
 


    varGen.forEach(async (v, index) => {

/*
        const div = document.createElement("div");
        div.textContent = v.lib;
        div.classList.add("ligvar");
        div.setAttribute("onclick", "editVar(" + v.v + ")");
         //div.className = v.priv === "true" ? "var-privee" : "var-publique"; // Ajouter une classe selon le statut
        
        divGen.appendChild(div);
*/

                const fondGen = document.createElement("div");
                fondGen.style="display:flex; flex-direction:row;  align-items:center;margin-left:10px"
                fondGen.classList.add("ligmod"); 
                if (estMainWindow) {fondGen.style.pointerEvents="none";fondGen.classList.add("txtmod-inactif")}
                //fondGen.setAttribute("onclick", "menuMod('" + v.v + "'); alert('clic')");
                fondVarGen.appendChild(fondGen);

                const div = document.createElement("div");
                div.textContent = v.lib;
                div.title = v.lib;
                div.classList.add("ligvar");
                div.dataset.v = v.v;
                div.setAttribute("onclick", "editVar('" + v.v + "', 'loc')"); // Ajouter un gestionnaire d'événement pour l'édition
                //if (estMainWindow) {div.style.pointerEvents="none";div.classList.add("txtmod-inactif")}
                //div.className = v.priv === "true" ? "var-privee" : "var-publique"; // Ajouter une classe selon le statut
                fondGen.appendChild(div);

                const divmod = document.createElement("input");
                divmod.type = "text";
                                
                let findModa = await getMod(rkEnt,v.v,"all"); // récupération de la valeur de modalité pour l'entretien courant, la variable v et le locuteur "all" (champ général)
                var moda =findModa[0]; 
                var libellé =findModa[1]; 
               
                
                divmod.value = libellé; 
                divmod.classList.add("txtmod");
                divmod.placeholder = "modalité";
                //divmod.setAttribute("onchange", "sauvMod('" +  v2.v + " , " + "', this.value, " + index + ")");
                divmod.setAttribute('onkeydown', 'if(event.key==="Enter"){validMod('+ rgEnt + ',' + v.v + ', "all", ' + moda + ' , this.value) }');
                if (estMainWindow) {divmod.style.pointerEvents="none"}

                divmod.dataset.v =  v.v;
                //div.className = v2.priv === "true" ? "var-privee" : "var-publique"; // Ajouter une classe selon le statut
                fondGen.appendChild(divmod);

               

    });

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

    locut.forEach((l, index) => {
       // console.log("Traitement du locuteur :", l, "à l'index :", index);

        if (l && index>0 && locut[index].lastIndexOf("?") == -1) { // on en traite pas le rang 0 ni les questions

            // création de la ligne de fond de la variable
            const divLoc = document.createElement("div");
            divLoc.textContent = locut[index];
            divLoc.classList.add("liglocvar");
            fondVarLoc.appendChild(divLoc);

            varLoc.forEach(async (v2, index2) => {


                const fondLoc = document.createElement("div");
                fondLoc.style="display:flex; flex-direction:row;  align-items:center;margin-left:10px"
                fondLoc.classList.add("ligmod"); 
                if (estMainWindow) {fondLoc.classList.add("txtmod-inactif")}
                //fondLoc.setAttribute("onclick", "menuMod('" + v2.v + "'); alert('clic')");
                fondVarLoc.appendChild(fondLoc);

                const div = document.createElement("div");
                div.textContent = v2.lib;
                div.classList.add("ligvar");
                div.dataset.v = index2;
                div.setAttribute("onclick", "editVar('" + v2.v + "', 'loc')"); // Ajouter un gestionnaire d'événement pour l'édition
                //div.className = v2.priv === "true" ? "var-privee" : "var-publique"; // Ajouter une classe selon le statut
                 if (estMainWindow) {div.style.pointerEvents="none"}

                fondLoc.appendChild(div);

                const divmod = document.createElement("input");
                divmod.type = "text";
                
                
                let findModa = await getMod(rkEnt,v2.v,index); 
                var moda =findModa[0]; 
                var libellé =findModa[1]; 
               
                
                divmod.value = libellé; 
                divmod.classList.add("txtmod");
                divmod.placeholder = "modalité";
                //divmod.setAttribute("onchange", "sauvMod('" +  v2.v + " , " + "', this.value, " + index + ")");
                divmod.setAttribute('onkeydown', 'if(event.key==="Enter"){validMod('+ rgEnt + ','  + v2.v + ',' + index + ',' + moda + ' , this.value) }');
                if (estMainWindow) {divmod.style.pointerEvents="none";}
                divmod.dataset.v =  v2.v;
                //div.className = v2.priv === "true" ? "var-privee" : "var-publique"; // Ajouter une classe selon le statut
                fondLoc.appendChild(divmod);

    

            });

        }
    });

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
    if (!tabVar) {tabVar = await window.electronAPI.getVar()}; // récupération des variables existantes
    if (!tabDic) {tabDic = await window.electronAPI.getDic()}; // récupération des modalités existantes

    //tabVar = []; // réinitialisation du tableau des variables
    //tabDic = []; // réinitialisation du tableau des modalités

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


  

    await window.electronAPI.setVar(tabVar); // sauvegarde des variables mises à jour
    await window.electronAPI.setDic(tabDic); // sauvegarde des modalités mises à jour


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

    // console.log("Affichage du tableau des données (tabvar) :");
    console.table("envoie le tabDat " + JSON.stringify(tabDat));

    // création d'une div pour afficher le tableau

    const divTabDat = document.createElement("div");
    divTabDat.id = "divTabDat";
    
    divTabDat.innerHTML = `<h3>Tableau des données    
    <div class="close" onclick="hideTabDat()">×</div>
    </h3>`;
    divTabDat.classList.add("fondtabdat");
     
    document.body.appendChild(divTabDat);

    // création du fond du tableau
    const fondTab = document.createElement("div");
    fondTab.style.overflow = "auto";
    fondTab.style.maxHeight = "calc(100vh - 70px)";

    divTabDat.appendChild(fondTab);

    // création du tableau HTML
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    table.appendChild(thead);
    table.appendChild(tbody);   
    fondTab.appendChild(table);

    // création de l'en-tête du tableau
    const headerRow = document.createElement("tr");
        
        // première colonne : entretien
        const th = document.createElement("th");
        th.textContent = "Entretien";
        headerRow.appendChild(th);

    tabVar.forEach(enteteVar => {
        const th = document.createElement("th");
        th.textContent = enteteVar.lib;
        headerRow.appendChild(th);


        th.addEventListener("click", function() {
            editVar(enteteVar.v, 'gen');
        });

    });
    thead.appendChild(headerRow);


    // création des lignes du tableau
    tabEnt.forEach(dataRow => {
        const tr = document.createElement("tr");    

        // colonne du nom de l'entretien
        const tdEnt = document.createElement("td");
        tdEnt.textContent =  dataRow.nom;
        tr.appendChild(tdEnt);

        tabVar.forEach(caseVar => {
    
            const td = document.createElement("td");

            // récupération de la valeur de la variable dans le tabDat de l'entretien

            // console.log("Recherche de la valeur de la variable ", caseVar.lib, "dans l'entretien ", dataRow.tabVar);
             
            // recherche dans le tabvar local le rang de la variable de la colonne
            const rkVarLoc = dataRow.tabVar.find(v => v.lib === caseVar.lib);
            
            if (rkVarLoc){
                // console.log("Rang local de la variable recherchée :", rkVarLoc.v);

                const varLoc = rkVarLoc.v;
                // console.log("Code local de la variable recherchée :", varLoc);

                if (dataRow.tabDat == undefined){return}; // évitement des fichiers vides

                // recherche dans le tabDat local la ligne correspondant à la variable  
                const ligDat = dataRow.tabDat.filter(d => d.v === varLoc );

                //console.log("Lignes de tabDat locale pour la variable " + caseVar.lib + " dans l'entretien " + dataRow.nom + " :", ligDat);
                
                if (ligDat.length > 0) { // Vérifier s'il y a des résultats
                    // console.log("Lignes de tabDat locale trouvées :", ligDat);
                    
                    // Traiter chaque résultat
                    ligDat.forEach(ligne => {
                    
                        const modalite = dataRow.tabDic.find(dc => dc.v === varLoc && dc.m === ligne.m);
                        
                        if (modalite) {
                         if (modalite.lib != "" && modalite.lib != undefined && modalite.lib != "undefined") {
                            if (ligne.l != "all") {
                                
                               
                                    td.innerHTML += "<b>" + dataRow.tabLoc[ligne.l] + "</b> : " + modalite.lib + "   <br>" ;

                            } else {
                        
                                td.textContent += modalite.lib ;
                        
                            }
                         }
                        }
                    });
                    
                } else {
                    td.textContent = "---";
                }
            }
            
            //console.log("Valeur trouvée :", modalite?.lib || "--- à la var " + caseVar.lib + " dans l'entretien " + dataRow.nom);

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

}

function hideTabDat(){
    const divTabDat = document.getElementById("divTabDat");
    if (divTabDat){
        divTabDat.remove();
    }
};

async function updateVarsDsEnt(){ // fonction de mise à jour des variables générales après modification
    
    // récupération du tableau des entretiens
    tabEnt = await window.electronAPI.getEnt();
    
    // récupération du tableau des variables générales
    tabVar = await window.electronAPI.getVar();

    console.log("tab à appliquer partout" + tabVar)

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
                    const modalite = ent.tabDic.find(dc => dc.v == v.v && dc.m === ligne.m && ligne.m>0);
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
            chaineText += ` ${v.lib} : ${modas.length > 0 ? modas.join(", ") : "---"}`;
        }

        //console.log("Chaine des variables publiques pour l'entretien " + rkEnt + " :\n" + chaineHtml);
        return [chaineHtml, chaineText];
    }else {
        //console.log("Entretien non trouvé ou pas de données pour l'entretien n°" + rkEnt);
        return ["", ""];
    }
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

