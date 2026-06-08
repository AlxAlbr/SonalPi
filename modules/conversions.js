 

// Délègue au domaine pur (domain/conversions.mjs).
// Restaure le global `locut` (canal historique encore lu plus loin dans l'import).
async function convertJSON(lignesFich) {
    const res = window.SonalDomain.conversions.convertJSON(lignesFich);
    locut = res.locut;
    return res; // { tabSeg, locut }
}
    
// Délègue au domaine pur (domain/conversions.mjs).
async function convertSRT(content) {
    const res = window.SonalDomain.conversions.convertSRT(content);
    return res; // { formatSonal, locuteurs }
}


// Délègue au domaine pur (domain/conversions.mjs).
async function convertVTT(content) {
    const res = window.SonalDomain.conversions.convertVTT(content);
    return res; // { formatSonal, locuteurs }
}


// Délègue au domaine pur (domain/conversions.mjs).
// Le domaine renvoie { formatSonal, segCourant } ; on réapplique ici l'effet de bord
// historique `seg_cur` (position atteinte), qui n'a pas sa place dans le code pur.
function convertPURGE(content) {
    const res = window.SonalDomain.conversions.convertPURGE(content);
    if (res) seg_cur = res.segCourant;
    return res; // { formatSonal, segCourant } — les appelants lisent .formatSonal
}
    
// Délègue au domaine pur (domain/conversions.mjs).
async function convertTXT(content, ext) {
    const res = window.SonalDomain.conversions.convertTXT(content, ext);
    return res; // { formatSonal, locuteurs }
}
async function importSONAL(content) { // importation d'un fichier SONAL (html) --> permet de vérifier l'ajustement des thématiques et des variables au corpus avant importation

 


    let fichierSonal = extractFichierSonal(content);

    const { codeMap } = await fusionTabThm(fichierSonal.tabThm);
    const tabDatAligned = await fusionTabVar(fichierSonal.tabVar, fichierSonal.tabDic, fichierSonal.tabDat);
    await fusionTabAnon(fichierSonal.tabAnon);

    let formatSonal = String(content);

    // Remappage des codes de thématiques dans le HTML de l'entretien (cas libellé connu/code différent, et cas 3)
    if (codeMap && codeMap.size > 0) {
        codeMap.forEach((nvCode, ancCode) => {
            // ancCode et nvCode sont déjà des codes complets (ex : "cat_5" → "cat_7")
            const regex = new RegExp(`\\b${ancCode}\\b`, 'g');
            formatSonal = formatSonal.replace(regex, nvCode);
        });
    }

    return { formatSonal, tabDatAligned: tabDatAligned || [], locuteurs: fichierSonal.tabLoc, tabAnon: fichierSonal.tabAnon };

 

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


// Délègue au domaine pur (domain/conversions.mjs).
// Le domaine reçoit le `doc` déjà parsé (il n'instancie pas DOMParser) — on le construit ici.
function extractFichierSonal(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    return window.SonalDomain.conversions.extractFichierSonal(htmlString, doc);
}

// Délègue au domaine pur (domain/conversions.mjs).
// Le domaine mute tabSeg en place (fusion des phrases) ; le rafraîchissement UI
// `affSegments(0)` reste ici (hors du code pur).
function Phrasifier(tabSeg) {
    window.SonalDomain.conversions.Phrasifier(tabSeg);
    affSegments(0);
}

// Délègue au domaine pur (domain/conversions.mjs).
// Le domaine mute tabSeg et renvoie { tabSeg, locut } ; on restaure le global
// `locut` (canal historique encore lu par convertSRT/VTT/JSON).
async function convertSpeaker(tabSeg) {
    const res = window.SonalDomain.conversions.convertSpeaker(tabSeg);
    locut = res.locut;
    return res;
}

// Délègue au domaine pur (domain/conversions.mjs).
function tabSegToSonal(tabSeg, locut, notes) {
    return window.SonalDomain.conversions.tabSegToSonal(tabSeg, locut, notes);
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
    