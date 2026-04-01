 

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
            let locuteursTrouvés = postLocut.locut;

            console.log ("importation du fichier Srt \tabseg = ", tabSeg, "\n locut = ", locuteursTrouvés);
            window.tabLocImport = locuteursTrouvés; // stockage temporaire dans le window global pour récupération ultérieure
            let formatSonal = tabSegToSonal (tabSeg,locuteursTrouvés)
            //console.log("format sonal = \n", formatSonal);
            return {formatSonal};
}


async function convertVTT(content) { // conversion du fichier VTT (WebVTT) en tableau

    if (!content || content.length < 1) { console.log("pas de contenu"); return; }

    // split du texte par lignes
    let lignesFich = content.split("\n");
    var nblig = lignesFich.length;
    let locut = [''];

    let rgSeg = 0;
    tabSeg = new Array(1);
    tabSeg[rgSeg] = new Array(6);

    let inBlock = false; // pour ignorer les blocs NOTE et STYLE

    for (s = 0; s < nblig; s++) {

        let ligne = lignesFich[s].trim();

        // en-tête WEBVTT (et métadonnées éventuelles sur la même ligne)
        if (ligne.startsWith("WEBVTT")) { continue; }

        // blocs NOTE et STYLE : ignorer jusqu'à la prochaine ligne vide
        if (ligne.startsWith("NOTE") || ligne.startsWith("STYLE")) { inBlock = true; continue; }
        if (inBlock) { if (ligne === "") { inBlock = false; } continue; }

        let posflèche = ligne.indexOf("-->"); // test d'une ligne de timestamps

        if (posflèche > -1) { // nouveau segment

            tabSeg.push();
            rgSeg++;
            tabSeg[rgSeg] = new Array(6);

            // extraire les timestamps en ignorant les attributs de positionnement VTT (position:, line:, align:…)
            let tpsBrut = ligne.split("-->");
            let debStr = tpsBrut[0].trim();
            let finStr = tpsBrut[1].trim().split(/\s+/)[0]; // premier token seulement

            tabSeg[rgSeg][1] = TimeToSec(debStr);
            tabSeg[rgSeg][2] = TimeToSec(finStr);
            tabSeg[rgSeg][3] = 0;     // locuteur (indéfini par défaut)
            tabSeg[rgSeg][4] = "";
            tabSeg[rgSeg][5] = false;
            tabSeg[rgSeg][6] = 0;

        } else {

            if (ligne === "") { continue; } // ligne vide → ignorer

            // identifiant de cue (ligne directement suivie d'un timestamp) → ignorer
            if (s < nblig - 1 && lignesFich[s + 1].indexOf("-->") > -1) { continue; }

            let lignetxt = ligne.replace(/\r?\n|\r/, "");

            // 1. balise <v Nom> : locuteur au format VTT natif
            const vTagMatch = lignetxt.match(/^<v\s+([^>]+)>/);
            if (vTagMatch) {
                const nomLoc = vTagMatch[1].trim();
                if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
                tabSeg[rgSeg][3] = locut.indexOf(nomLoc);
                lignetxt = lignetxt.replace(/^<v\s+[^>]+>/, "");
            }
            // 2. préfixe "Speaker N" (format Whisper/diarisation)
            else if (/^Speaker\s+\d+/.test(lignetxt)) {
                let rg = Number(lignetxt.substr(8, 1)) + 1;
                let nomLoc = "Speaker " + rg;
                if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
                tabSeg[rgSeg][3] = locut.indexOf(nomLoc);
                lignetxt = lignetxt.substr(11); // suppression du préfixe "Speaker N "
            }

            // suppression des balises VTT restantes (<b>, <i>, <c.class>, timestamps, etc.)
            lignetxt = lignetxt.replace(/<[^>]+>/g, "");

            tabSeg[rgSeg][4] += lignetxt;
        }
    }

    // trimage des textes
    for (s = 0; s < tabSeg.length; s++) {
        if (!tabSeg[s][4] || tabSeg[s][4].trim() === "") { continue; }
        tabSeg[s][4] = tabSeg[s][4].trim() + " "; // espace final pour séparation entre segments
    }

    // suppression du rang 0
    tabSeg.splice(0, 1);

    console.log("importation du fichier VTT \tabseg = ", tabSeg, "\n locut = ", locut);
    window.tabLocImport = locut;
    let formatSonal = tabSegToSonal(tabSeg, locut);
    return { formatSonal };
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
    
async function convertTXT(content,ext) { // conversion du fichier TXT en tableau

        // split du texte par lignes \n
        lignesFich = content.split("\n");
        var nblig = lignesFich.length;

        var locut = [""] // locut[0] n'existe pas
        tabSeg = [];
        let segCourant = null;

        // --- Détection du format ---
        // Format A : lignes de timestamps  "00:01:30 [Locuteur]"
        // Format B : locuteur en ligne     "Speaker 1: texte..."  (pas de timestamp)
        const timeRegex  = /^(\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?)\s*(.*)$/;
        const locInRegex = /^([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s\-]{0,38}?)\s*:\s*(.+)$/;

        let hasTimestamp = false;
        let hasLocInline = false;
        for (let i = 0; i < Math.min(nblig, 20); i++) {
            const l = lignesFich[i].trim();
            if (!l) continue;
            if (timeRegex.test(l)) { hasTimestamp = true; break; }
            if (locInRegex.test(l)) { hasLocInline = true; }
        }
        const formatB = !hasTimestamp && hasLocInline;

        // -------------------------------------------------------
        // FORMAT B : "Speaker 1: texte" — un segment par prise de parole
        // -------------------------------------------------------
        if (formatB) {

            for (s = 0; s < nblig; s++) {
                let ligne = lignesFich[s].trim();
                if (ligne.length < 1) { continue; }

                const locMatch = ligne.match(locInRegex);
                if (locMatch) {
                    // nouvelle prise de parole → nouveau segment
                    const nomLoc    = locMatch[1].trim();
                    const texteApres = locMatch[2].trim();
                    if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
                    const idxLoc = locut.indexOf(nomLoc);
                    segCourant = [null, 0, 0, idxLoc, texteApres, false, 0];
                    tabSeg.push(segCourant);
                } else {
                    // ligne de continuation
                    if (!segCourant) {
                        segCourant = [null, 0, 0, 0, "", false, 0];
                        tabSeg.push(segCourant);
                    }
                    segCourant[4] += (segCourant[4].length > 0 ? " " : "") + ligne;
                }
            }

        // -------------------------------------------------------
        // FORMAT A : "00:01:30 [Locuteur]" puis texte en-dessous
        // -------------------------------------------------------
        } else {

            for (s = 0; s < nblig; s++) {
                let ligne = lignesFich[s].trim();
                if (ligne.length < 1) { continue; }

                const match = ligne.match(timeRegex);
                if (match) {
                    const rawTime = match[1].replace(/\s/g, '');
                    const debSec  = TimeToSec(rawTime);

                    if (segCourant) { segCourant[2] = debSec; } // fermeture du segment précédent

                    const nomLoc = match[2] ? match[2].trim() : "";
                    if (nomLoc && !locut.includes(nomLoc)) { locut.push(nomLoc); }
                    const idxLoc = nomLoc ? locut.indexOf(nomLoc) : 0;

                    segCourant = [null, debSec, debSec, idxLoc, "", false, 0];
                    tabSeg.push(segCourant);

                } else {
                    // ligne de texte
                    if (!segCourant) {
                        segCourant = [null, 0, 0, 0, "", false, 0];
                        tabSeg.push(segCourant);
                    }
                    // locuteur éventuel en début de paragraphe : "Nom : texte"
                    const locMatch = ligne.match(locInRegex);
                    if (locMatch) {
                        const nomLoc    = locMatch[1].trim();
                        const texteApres = locMatch[2].trim();
                        if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
                        segCourant[3]  = locut.indexOf(nomLoc);
                        segCourant[4] += (segCourant[4].length > 0 ? " " : "") + texteApres;
                    } else {
                        segCourant[4] += (segCourant[4].length > 0 ? " " : "") + ligne;
                    }
                }
            }
        }

        //console.log("tabSeg après import du txt = ", tabSeg);

        window.tabLocImport = locut; // stockage temporaire dans le window global pour récupération ultérieure
        let formatSonal = tabSegToSonal(tabSeg, locut);

        //console.log("format sonal = \n", formatSonal);
        return {formatSonal};

    }


async function importSONAL(content) { // importation d'un fichier SONAL (html) --> permet de vérifier l'ajustement des thématiques et des variables au corpus avant importation

 


    let fichierSonal = extractFichierSonal(content);

    const { codeMap } = await fusionTabThm(fichierSonal.tabThm);
    const tabDatAligned = await fusionTabVar(fichierSonal.tabVar, fichierSonal.tabDic, fichierSonal.tabDat);
    await fusionTabAnon(fichierSonal.tabAnon);

    window.tabLocImport = fichierSonal.tabLoc; // stockage temporaire dans le window global
    
    window.tabAnonImport = fichierSonal.tabAnon; // stockage temporaire dans le window global

    let formatSonal = String(content);

    // Remappage des codes de thématiques dans le HTML de l'entretien (cas libellé connu/code différent, et cas 3)
    if (codeMap && codeMap.size > 0) {
        codeMap.forEach((nvCode, ancCode) => {
            // ancCode et nvCode sont déjà des codes complets (ex : "cat_5" → "cat_7")
            const regex = new RegExp(`\\b${ancCode}\\b`, 'g');
            formatSonal = formatSonal.replace(regex, nvCode);
        });
    }

    return { formatSonal, tabDatAligned: tabDatAligned || [] };

 

}


async function fusionTabThm(tabThmFich) { // mise à jour du tabThm à partir d'un fichier sonal importé

    if (!tabThmFich || tabThmFich.length < 1) { return { codeMap: new Map() }; }

    // récupération du tabThm courant
    let tabThm = await window.electronAPI.getThm();
    const codeMap = new Map(); // remappage oldCode → newCode pour les conflits (cas 3)
    let modified = false;

    // Retourne la partie du libellé avant "//" en minuscules (comparaison insensible à la casse)
    function baseLabel(nom) {
        return (nom || '').split('//')[0].trim().toLowerCase();
    }

    // Trouve le premier code "cat_N" libre dans tabThm (codes au format "cat_1", "cat_2"…)
    function nextFreeCode() {
        const used = new Set(
            tabThm
                .map(t => { const m = String(t.code).match(/cat_(\d+)$/); return m ? Number(m[1]) : null; })
                .filter(n => n !== null)
        );
        let c = 1;
        while (used.has(c)) c++;
        return "cat_" + c;
    }

    for (const thm of tabThmFich) {
        const bl = baseLabel(thm.nom);
        const inCorpusByLabel = tabThm.find(t => baseLabel(t.nom) === bl);
        const inCorpusByCode  = tabThm.find(t => t.code === thm.code); // comparaison en string

        // Cas 1 : même libellé (base) ET même code → rien à faire
        if (inCorpusByLabel && inCorpusByLabel.code === thm.code) {
            thm.nvcode = "ok";
            console.log("thématique inchangée :", thm.nom);
            continue;
        }

        // Libellé existant avec code différent → remapper vers le code du corpus
        if (inCorpusByLabel && inCorpusByLabel.code !== thm.code) {
            codeMap.set(thm.code, inCorpusByLabel.code); // ex : "cat_5" → "cat_2"
            thm.nvcode = inCorpusByLabel.code;
            console.log(`Remappage code ${thm.code} → ${inCorpusByLabel.code} pour "${thm.nom}"`);
            continue;
        }

        // Cas 2 : libellé nouveau ET code libre → ajouter avec toutes ses propriétés
        if (!inCorpusByCode) {
            tabThm.push({ nom: thm.nom, code: thm.code, couleur: thm.couleur || "", taille: thm.taille || "", rang: thm.rang ?? 0, act: thm.act ?? true, cmpct: thm.cmpct ?? false });
            thm.nvcode = thm.code;
            modified = true;
            console.log(`Nouvelle thématique ajoutée (code inchangé) : "${thm.nom}" code: ${thm.code}`);
            continue;
        }

        // Cas 3 : libellé nouveau mais code déjà pris → nouveau code + remappage HTML
        const nc = nextFreeCode();
        tabThm.push({ nom: thm.nom, code: nc, couleur: thm.couleur || "", taille: thm.taille || "", rang: thm.rang ?? 0, act: thm.act ?? true, cmpct: thm.cmpct ?? false });
        codeMap.set(thm.code, nc); // ex : "cat_5" → "cat_7"
        thm.nvcode = nc;
        modified = true;
        console.log(`Nouvelle thématique, code ${thm.code} déjà pris → nouveau code ${nc} pour "${thm.nom}"`);
    }

    if (modified) {
        await window.electronAPI.setThm(tabThm);
        await affichListThmCrp(tabThm);
    }

    return { codeMap };

}


async function fusionTabVar(tabVarFich, tabDicFich, tabDatFich) { // mise à jour du tabVar à partir d'un fichier sonal importé

    if (!tabVarFich || tabVarFich.length<1) {return}

    // comparaison de libellés insensible à la casse
    const eqLib = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

    // récupération du tabVar courant
    let tabVar = await window.electronAPI.getVar();
    let situation = "ras"; 

    tabVarFich.forEach(vari => {

        console.log("variable dans le corpus :", vari.v, vari.lib);

        if (tabVar.some(v => v.v === vari.v && eqLib(v.lib, vari.lib))) {
            vari.nvcode = "ok"; // Pas de changement
            console.log("variable inchangée :", vari.v);
        }

        else if (tabVar.some(v => v.v != vari.v && eqLib(v.lib, vari.lib))) {

            // Trouver le code existant correspondant au nom
            const vTrouve = tabVar.find(v => eqLib(v.lib, vari.lib) && v.v !== vari.v);
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

        } else if (!tabVar.some(v => v.v === vari.v && eqLib(v.lib, vari.lib))) {
            vari.nvcode = "ajouter";
            situation = "ajout";
            tabVar.push(vari)
            console.log("nouvelle variable ajoutée :", vari.v);

        }

    });


    console.log("situation de mise à jour du tabVar :", situation);

    //mise à jour du tabVar si nécessaire
    if (situation === "ajout") {
        console.log("mise à jour du tabVar avec ajouts");
        let envoi = await window.electronAPI.setVar(tabVar);
    }

    // --- Fusion du tabDic : merge des modalités du fichier dans le tabDic global ---
    let tabDic = await window.electronAPI.getDic();

    // Table de correspondance : code variable dans le fichier → code global
    const mapV = new Map();
    tabVarFich.forEach(fVar => {
        const gVar = tabVar.find(v => eqLib(v.lib, fVar.lib));
        if (gVar) mapV.set(Number(fVar.v), Number(gVar.v));
        else mapV.set(Number(fVar.v), Number(fVar.v));
    });

    // Table de correspondance : (v_fich|m_fich) → m_global
    const mapM = new Map();
    (tabDicFich || []).forEach(fDic => {
        if (Number(fDic.m) === 0) { mapM.set(`${Number(fDic.v)}|0`, 0); return; }
        const globalV = mapV.get(Number(fDic.v)) ?? Number(fDic.v);
        const gDic = tabDic.find(d => d.v == globalV && eqLib(d.lib, fDic.lib));
        if (gDic) {
            mapM.set(`${Number(fDic.v)}|${Number(fDic.m)}`, Number(gDic.m));
        } else {
            // Nouvelle modalité : ajouter au tabDic global
            const ligsDic = tabDic.filter(d => d.v == globalV);
            const maxM = ligsDic.length > 0 ? Math.max(...ligsDic.map(d => Number(d.m))) : 0;
            const newM = maxM + 1;
            tabDic.push({ v: globalV, m: newM, lib: fDic.lib });
            mapM.set(`${Number(fDic.v)}|${Number(fDic.m)}`, newM);
        }
    });
    await window.electronAPI.setDic(tabDic);

    // Remapper les codes dans tabDatFich (alignement sur les codes globaux)
    (tabDatFich || []).forEach(dat => {
        const newV = mapV.get(Number(dat.v)) ?? Number(dat.v);
        const newM = mapM.get(`${Number(dat.v)}|${Number(dat.m)}`) ?? Number(dat.m);
        dat.v = newV;
        dat.m = newM;
    });

    return tabDatFich; // tableau de données recodé, aligné sur les codes globaux
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

                
                    if (!content || content.length < 2 || content === undefined || content === '{ undefined }') {
                        //console.warn(`Aucun contenu trouvé pour ${id} après nettoyage.`);
                        return null;
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
    locut = [''] // locut[0] n'existe pas

    for (s = 0; s< tabSeg.length;s++){

        let txt = tabSeg[s][4]

        if (!txt || txt.trim() === ""){continue} // segment vide    

        let spk = txt.indexOf("Speaker ") // recherche d'un speaker

        if (spk == 0) { // récupération du rang

            let rg = txt.substr(8,1)
            rg = Number(rg)+1               

            tabSeg[s][3] = rg  //affectation du locuteur

            // faut-il ajouter un nouveau locuteur dans le tableau des locuteurs ?
            // le nomLoc existe-til déjà dans le tableau des locuteurs ?
            let nomLoc = "Speaker " + (rg);

            if (!locut.includes(nomLoc)) {
                locut.push(nomLoc);
            }

            /*
            if (rgmax < rg+1) {
                rgmax = rg+1 
                locutTemp.push("Speaker " + (rg+1))
            }; // mémorisation du speaker le plus élevé atteint
            */
 
            //suppression du préfixe "speaker"
            tabSeg[s][4] = txt.substr(11)
            
        } 

        //suppression des "speaker 0 etc.", qui apparaissent de manière intempestive dans le corps du texte
        // on ne garde que ceux qui figurent au début des segments
        for (i=0;i<10;i++){
            tabSeg[s][4] = tabSeg[s][4].replaceAll("Speaker " + i + ":","")
        }     
 
    };

    console.log("locuteurs identifiés dans convert speakers: ", locut);

    /*
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
    */  

    return { tabSeg, locut }
 


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

 
// ajour éventuel des locuteurs
if (locut && locut.length>1){

    const locJSON = JSON.stringify(locut, null);

    html += `
    <script id="loc-json" type="application/json">
        
            ` + locJSON + `         
        
        </script> 
        `;
}


html += `<div id="contenuText"> 
`
 
    var rkMax=1;
    var sgMax=1; 

    for (s=0;s<tabSeg.length;s++){
        
        
        // création des spans internes
        if (!tabSeg[s][4] || tabSeg[s][4].length == 0 || tabSeg[s][4].trim() === ""){continue}

        html += `<span class="lblseg sautlig" 
        data-deb="${tabSeg[s][1]}" 
        data-fin="${tabSeg[s][2]}" 
        data-loc="${tabSeg[s][3]}"
        tabindex="${rkMax}" 
        data-rksg="${sgMax}"
        >`



        // Un seul span compacté par segment : data-len = nombre d'éléments (mots, ponctuations, espaces)
        var texte = tabSeg[s][4];
        const elements = texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];

        html += `<span data-rk="${rkMax}" data-sg="${sgMax}" data-len="${elements.length}">${texte}</span></span>`;
        rkMax += elements.length;

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
            convertVTT,
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
        window.convertVTT = convertVTT;
        window.convertJSON = convertJSON;
        window.convertPURGE = convertPURGE;
        window.convertTXT = convertTXT;
        window.Phrasifier = Phrasifier;
        window.HTMLTOTABSEG = HTMLTOTABSEG;
        window.importSONAL = importSONAL;
        window.extractFichierSonal = extractFichierSonal;
        window.fusionTabVar = fusionTabVar;

    }
    