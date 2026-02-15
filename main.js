const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const iconv = require('iconv-lite');
//const fetch = require('node-fetch') 
const http = require('http');
const https = require('https');

let mainWindow;

 
////////////////////////////////////////////////////////////////
// variables générales du projet 
////////////////////////////////////////////////////////////////

let Corpus = {filePath : null, folder : null, fileName : null, type : null, lastChange : null, content: null}; // tableau des infos du corpus ouvert

var tabThm = [{"code":"cat_001","couleur":"","nom":"Pondérations","taille":"","cmpct":"false","rang":"0","act":"true"},{"code":"cat_002","couleur":"","nom":"★★★ Très important","taille":24,"cmpct":"false","rang":"1","act":"true"},{"code":"cat_003","couleur":"","nom":"★★☆ Assez important","taille":22,"cmpct":"false","rang":"1","act":"true"},{"code":"cat_004","couleur":"","nom":"★☆☆ Important","taille":20,"cmpct":"false","rang":"1","act":"true"}];  // tableau des thématiques
var tabVar = [{"v":1,"lib":"sexe","champ":"gen","priv":"false"}]; // tableau des variables
var tabDic = [{"v":1,"m":0},{"v":1,"m":1,"lib":"Homme"},{"v":1,"m":2,"lib":"Femme"},{"v":1,"m":3,"lib":"Autre"}]; // dictionnaire
var tabDat = []; // tableau des métadonnées (valeurs des variables pour chaque entretien)
var tabEnt = []; // tableau des entretiens
var tabHtml = []; // tableau des contenus HTML des entretiens
var tabGrph = []; // tableau des représentations simplifiées des entretiens (pour l'affichage graphique) 
var ent_cur = -1; // entretien courant
var tabLocImport = []; // locuteurs importés (stockage central dans le main)

 

// Handlers pour mettre à jour et récupérer le corpus
ipcMain.handle('get-corpus', () => { return Corpus;});
ipcMain.handle('get-corpus-content', () => { 

  const data = {
    thematiques: tabThm,
    entretiens: tabEnt,
    variables: tabVar,
    dictionnaire: tabDic
};

const blob = new Blob(
    [JSON.stringify(data, null, '\t')], 
    { type: 'application/json' }
);

  Corpus.content = blob
  return Corpus.content;
});

ipcMain.handle('set-corpus', (_, newCorpus) => {
  Corpus = newCorpus;
  return true;
});


// Handlers pour mettre à jour et récupérer la liste des catégories (tabThm)
ipcMain.handle('get-thm', () => {return tabThm;});
ipcMain.handle('set-thm', (_, newTabThm) => {
  tabThm = newTabThm;
  // Envoyer à toutes les fenêtres ouvertes
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('update-cat', tabThm);
  });
  return true;
});


// Handlers pour récupérer et mettre à jour le tableau des entretiens 
ipcMain.handle('get-ent', () => { return tabEnt; });
ipcMain.handle('set-ent', (_, newTabEnt) => {
  tabEnt = newTabEnt;
  return true;
});

// Handlers pour récupérer et mettre à jour le tableau des locuteurs importés
ipcMain.handle('get-tabloc', () => { return tabLocImport; });
ipcMain.handle('set-tabloc', (_, newTabLoc) => {
  tabLocImport = newTabLoc;
  return true;
});

// Handlers pour récupérer et mettre à jour l'entretien courant 
ipcMain.handle('get-ent_cur', () => { console.log("demande get-ent_cur"); return ent_cur; });
ipcMain.handle('set-ent_cur', (_, newEntCur) => {
  console.log("mise à jour de ent_cur avec nouvelle valeur :" + newEntCur);
  ent_cur = newEntCur;
  return true;
});

// ⭐ Handler pour les logs du renderer (XXXXX peut être viré à la fin XXXXX)
// DÉSACTIVÉ - pour éviter l'interception des logs dans VSCode
/*
ipcMain.handle('log', (event, level, message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // Afficher dans la console du main
  if (level === 'error') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  // Optionnel: écrire dans un fichier log
  try {
    const logFile = path.join(app.getPath('userData'), 'app.log');
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    console.error('Erreur écriture fichier log:', err);
  }
  
  return true;
});
*/

// ⭐ Handler pour confirmer la fin de sauvegarde avant fermeture
ipcMain.handle('save-complete', (event) => {
  //console.log("✅ Renderer a confirmé la sauvegarde - fermeture autorisée");
  // Récupérer la fenêtre qui a émis le signal et la fermer
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.destroy(); // Force la fermeture sans déclencher 'close' à nouveau
  }
  return true;
});

// ⭐ Handler pour mettre à jour le canvas après sauvegarde
ipcMain.handle('update-canvas-after-save', (event, rkEnt) => {
 // console.log("📊 Demande de mise à jour du canvas pour l'entretien:", rkEnt);
  
  // Trouver la fenêtre corpus principale (supposée être mainWindow)
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Envoyer un message à la fenêtre corpus pour rafraîchir le canvas
    mainWindow.webContents.send('refresh-canvas', rkEnt);
    //console.log("✅ Signal de rafraîchissement envoyé à la fenêtre corpus");
  } else {
    //console.error("❌ Fenêtre corpus introuvable");
  }
  
  return true;
});


ipcMain.handle('get-var', () => { return tabVar; });
ipcMain.handle('set-var', (_, newTabVar) => {
  tabVar = newTabVar;
  return true;
});

ipcMain.handle('get-dic', () => { return tabDic; });
ipcMain.handle('set-dic', (_, newTabDic) => {
  tabDic = newTabDic;
  return true;
});

ipcMain.handle('get-dat', () => { return tabDat; });
ipcMain.handle('set-dat', (_, newTabDat) => {
  tabDat = newTabDat;
  return true;
});

// Handlers pour récupérer et mettre à jour les tableaux des contenus HTML 
ipcMain.handle('get-html', (_, rk) => { 
if (rk === undefined || rk === null) {
    return tabHtml;
  } else {
    return tabHtml[rk]; 
  }
});
ipcMain.handle('set-html', (_, rk, html) => {
  
  // vidage si besoin
  if (rk === -1) {
    tabHtml = [];
    console.log("le tabHtml a été vidé");
    return true;
  }
  
  // S'assurer que le tableau est assez grand pour l'index rk
  if (rk >= tabHtml.length) {
    tabHtml.length = rk + 1;
  }

  tabHtml[rk] = html;
  console.log ("le tabHtml de l'entretien " + rk + " a été correctement modifié");
  return true;
});

// Handlers pour récupérer et mettre à jour les tableaux des représentations graphiques 
ipcMain.handle('get-grph', (_, rk) => { console.log("demande getGrph pour le rang " + rk); return tabGrph[rk]; });
ipcMain.handle('set-grph', (_, rk, newTabGrph) => {
  
    // vidage si besoin
  if (rk === -1) {
    tabGrph = [];
    console.log("le tabGrph a été vidé");
    return true;
  }

   if (rk >= tabGrph.length) {
    tabGrph.length = rk + 1;
  }
  tabGrph[rk] = newTabGrph;
  return true;
});






///////////////////////////////////////////////////////////////////////////////////////////
// Handlers pour l'ouverture et la gestion de fichiers
///////////////////////////////////////////////////////////////////////////////////////////



// Boite de dialogue open file pour le corpus 
ipcMain.handle('dialog:openCorpus', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un fichier',
    properties: ['openFile'],
    filters: [
      { name: 'Corpus Sonal', extensions: ['crp'] },
    ],
  });

  if (canceled) {
    return null;
  }

  // détermination du répertoire source
  const dirPath = path.dirname(filePaths[0]);
   
   
  return [dirPath, filePaths[0]]; // Retourne le chemin du dossier et du fichier
  //return [filePaths[0]]; // retourne le chemin du fichier
});

// Boite de dialogue open file pour les fichiers texte à importer
ipcMain.handle('dialog:openTextFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un fichier',
    properties: ['openFile'],
    filters: [
      { name: 'Fichiers texte', extensions: ['sonal', 'sonal.html','srt','txt','md','json','purge'] }
          
    ],
  });

  if (canceled) {
    return { canceled: true, filePaths: [], dirPath: '' };
  }

  const dirPath = filePaths.length > 0 ? path.dirname(filePaths[0]) : '';
  return { canceled: false, filePaths, dirPath };

});

  // Boite de dialogue open file pour les fichiers audio à importer
ipcMain.handle('dialog:openAudioFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un fichier',
    properties: ['openFile'],
    filters: [
      { name: 'Fichiers audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }
    ],
  });

  if (canceled) {
    return { canceled: true, filePaths: [], dirPath: '' };
  }

  const dirPath = filePaths.length > 0 ? path.dirname(filePaths[0]) : '';
  return { canceled: false, filePaths, dirPath };
});

// Lire le contenu d'un fichier (local ou distant)
ipcMain.handle('file:readContent', async (_, filePath) => {

 

  if (!filePath) return null;

  function localOuDistant(filePath) {
    try {
      const u = new URL(filePath);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:') {
        return 'remote';
      }
      return 'local';
    } catch (e) {
      // pas une URL → probablement un chemin système
      return fs.existsSync(filePath) ? 'local' : 'remote';
    }
  }

  if (localOuDistant(filePath) === 'local') {
    try {
      let buf = fs.readFileSync(filePath);
      const encoding = chardet.detect(buf);
       
      const content = (encoding === 'ISO-8859-1' || encoding === 'windows-1252')
        ? iconv.decode(buf, 'windows-1252')
        : iconv.decode(buf, 'utf8');
      return content; // string
    } catch (err) {
      console.error('Erreur de lecture du fichier local :', err);
      throw err;
    }
  } else {
    try {
      // attendre le téléchargement et renvoyer une string décodée
      const result =  await serveurAPI.lireFichier(filePath);
       
      return result.content;
    } catch (err) {
      console.error('Erreur lecture fichier distant :', err);
      throw err;
    }
  }
});

// Récupérer les métadonnées d'un fichier (local ou distant)
ipcMain.handle('file:getMetadata', async (_, filePath) => {
  if (!filePath) return null;

  function localOuDistant(filePath) {
    try {
      const u = new URL(filePath);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:') {
        return 'remote';
      }
      return 'local';
    } catch (e) {
      return fs.existsSync(filePath) ? 'local' : 'remote';
    }
  }

  try {
    if (localOuDistant(filePath) === 'local') {
      // Fichier local
      const stats = fs.statSync(filePath);
      return {
        success: true,
        lastModified: stats.mtime.toISOString(),
        size: stats.size,
        type: 'local'
      };
    } else {
      // Fichier distant
      if (!serveurAPI) {
        return { success: false, error: 'Pas de connexion au serveur' };
      }
      
      const result = await serveurAPI.lireFichier(filePath);
      if (result.success) {
        return {
          success: true,
          lastModified: result.modified || new Date().toISOString(),
          size: result.size,
          type: 'remote'
        };
      } else {
        return { success: false, error: result.error };
      }
    }
  } catch (error) {
    console.error('Erreur lors de la lecture des métadonnées:', error);
    return { success: false, error: error.message };
  }
});

// Reconstruire l'adresse d'un fichier   
ipcMain.handle('file:createPath', async (_, ...args) => {
  if (!args || args.length === 0) return null;
  try {
    const filePath = path.join(...args);
    return filePath;
  } catch (err) {
    console.error("Erreur de construction du lien :", err);
    return null;
  }
});

// Vérifier l'existence d'un fichier 
ipcMain.handle('file:exists', async (_, fileName) => {
  
  console.log(fileName)
  if (!fileName) return false;

  if (fs.existsSync(fileName)) {
    return true;
  } else {return false} ;

   
});

// copier/coller 
ipcMain.handle('file:copyFile', async (_, source, destination) => {
  try {
    fs.copyFileSync(source, destination);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Gérer l'ouverture d'un fichier distant
ipcMain.handle('ouvrir-fichier-distant', async (event, filePath) => {
  const result = await serveurAPI.lireFichier(filePath);
  
  if (result.success) {
    if (result.readOnly) {
      // Afficher un message à l'utilisateur
      event.sender.send('fichier-lecture-seule', {
        message: `Fichier ouvert en lecture seule (verrouillé par ${result.lockInfo?.user})`,
        lockedBy: result.lockInfo
      });
    } else {
      // Le fichier est éditable, le rafraîchissement automatique est déjà lancé
      event.sender.send('fichier-editable');
    }
  }
  
  return result;
});

// Gérer la fermeture d'un fichier distant
ipcMain.handle('fermer-fichier-distant', async (event, filePath) => {
  await serveurAPI.deverrouillerFichier(filePath);
});

 
// Enregistrer localement un fichier
ipcMain.handle('sauvegarder-fichier', async (event, filePath, content) => {
  if (!filePath || !content) {
    return { success: false, error: 'Fichier ou contenu invalide' };
  }

  try {
    fs.writeFileSync(filePath, content);
    console.log('✅ fichier sauvegardé localement');
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde du fichier :', error);
    return { success: false, error: error.message };
  }
});

// Handler pour sauvegarder sur le serveur
ipcMain.handle('sauvegarder-sur-serveur', async (event, filePath, content) => {
  console.log('💾 Demande de sauvegarde sur serveur');
  console.log('   Fichier:', filePath);
  console.log('   Taille:', content.length, 'caractères');
  
  // Vérifier que serveurAPI existe
  if (!serveurAPI) {
    console.error('❌ serveurAPI non initialisé');
    return {
      success: false,
      error: 'Non connecté au serveur. Ouvrez d\'abord un fichier distant.'
    };
  }
  
  try {
    // Utiliser serveurAPI.ecrireFichier (pas serveurSync)
    const result = await serveurAPI.ecrireFichier(filePath, content);
    
    if (result.success) {
      console.log('✅ Sauvegarde réussie');
    } else {
      console.error('❌ Échec sauvegarde:', result.error);
    }

    if (!result.success && result.error.includes('verrouillé')) {
    event.sender.send('fichier-verrouille', {
      message: 'Impossible de sauvegarder : fichier verrouillé par un autre utilisateur',
      lockedBy: result.lockedBy
     });
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Exception:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Handler pour sauvegarder avec backup
ipcMain.handle('sauvegarder-avec-backup', async (event, filePath, content) => {
  console.log('💾 Demande de sauvegarde avec backup');
  
  if (!serveurAPI) {
    return {
      success: false,
      error: 'Non connecté au serveur'
    };
  }
  
  try {
    // 1. Télécharger la version actuelle
    console.log('📥 Téléchargement version actuelle...');
    const ancienneVersion = await serveurAPI.lireFichier(filePath);
    
    if (ancienneVersion.success) {
      // 2. Créer un backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const extension = filePath.split('.').pop();
      const cheminBackup = filePath.replace(`.${extension}`, `.backup-${timestamp}.${extension}`);
      
      console.log('📦 Création backup:', cheminBackup);
      await serveurAPI.ecrireFichier(cheminBackup, ancienneVersion.content);
    }
    
    // 3. Sauvegarder la nouvelle version
    console.log('💾 Sauvegarde nouvelle version...');
    const result = await serveurAPI.ecrireFichier(filePath, content);
    
    if (result.success) {
      result.backupCreated = ancienneVersion.success;
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Exception:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

 

//=============================================
// Création d'un nouveau corpus
//=============================================

 
//const fs = require('fs').promises;
const gestionCorpus = require('./modules/gestion_corpus.js');

// Ajouter ce handler IPC pour la sélection de dossier
ipcMain.handle('select-folder', async (event) => {
    const result = await dialog.showOpenDialog({
        title: 'Sélectionner le dossier du corpus',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Sélectionner'
    });
    return result;
});

ipcMain.handle('nouveau-corpus', async (event) => {
  console.log("Création d'un nouveau corpus demandée");
     result = await nouveauCorpus();

 
  return result;

});

async function nouveauCorpus() {
    try {
        // Demander le dossier et le nom via la fenêtre modale
        const resultat = await demanderDossierEtNom(mainWindow);
        
        if (!resultat) {
            return { success: false, message: 'Opération annulée' };
        }

        const { dossierCorpus, nomProjet } = resultat;

        // Nettoyer le nom
        const nomNettoye = nomProjet.replace(/[<>:"/\\|?*]/g, '_').trim();
        
        if (!nomNettoye) {
            return { success: false, message: 'Nom de projet invalide' };
        }

        // Vérifier que le fichier n'existe pas déjà
        const cheminFichier = path.join(dossierCorpus, `${nomNettoye}.crp`);
        
        console.log("Chemin du nouveau corpus :", cheminFichier);

        try {
            await fs.access(cheminFichier);
            // Le fichier existe déjà
            const reponse = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Fichier existant',
                message: `Le fichier "${nomNettoye}.crp" existe déjà dans ce dossier.`,
                buttons: ['Annuler', 'Écraser'],
                defaultId: 0,
                cancelId: 0
            });
            
            if (reponse.response === 0) {
                return { success: false, message: 'Opération annulée' };
            }
        } catch (error) {
            // Le fichier n'existe pas, c'est OK
        }

        // Créer le fichier avec le tableau JSON
        const donneesInitiales = {
            nom: nomNettoye,
            dateCreation: new Date().toISOString(),
            version: '1.0',
            tabEnt: [],
            tabThm: [{"code":"cat_001","couleur":"","nom":"Pondérations","taille":"","cmpct":"false","rang":"0","act":"true"},{"code":"cat_002","couleur":"","nom":"★★★ Très important","taille":24,"cmpct":"false","rang":"1","act":"true"},{"code":"cat_003","couleur":"","nom":"★★☆ Assez important","taille":22,"cmpct":"false","rang":"1","act":"true"},{"code":"cat_004","couleur":"","nom":"★☆☆ Important","taille":20,"cmpct":"false","rang":"1","act":"true"}],
            tabVar: [],
            tabDic: [], 
            tabDat: [],
            tabHtml: [],
            tabGrph: []
        };

        const jsonString = JSON.stringify(donneesInitiales, null, 2);
        await fs.writeFileSync(cheminFichier, jsonString, 'utf8');

        const corpus = await ouvrirCorpus(cheminFichier);
        if (corpus && corpus.success) {
            mainWindow.webContents.send('afficher-corpus', corpus);
        }

        return {
            success: true,
            message: 'Corpus créé avec succès',
            chemin: cheminFichier,
            nom: nomNettoye
        };

    } catch (error) {
        console.error('Erreur lors de la création du corpus:', error);
        return {
            success: false,
            message: `Erreur: ${error.message}`
        };
    }
}

// Fonction pour afficher la fenêtre modale
function demanderDossierEtNom(parentWindow) {
    return new Promise((resolve) => {
        const promptWindow = new BrowserWindow({
            width: 600,
            height: 350,
            titleBarStyle: process.platform === 'darwin' ? 'default' : 'default', // pour voir les boutons sur macOS
            parent: parentWindow,
            // modal: true,
            closable: true,
            show: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
            
        });

        // Charger le fichier HTML externe
        promptWindow.loadFile('nouveau_corpus.html');
        
        // Retirer le menu de la fenêtre modale
        promptWindow.setMenu(null);
        

        promptWindow.once('ready-to-show', () => {
         // promptWindow.webContents.openDevTools();
            promptWindow.show();
            
        });

        

        // Recevoir la réponse
        const handler = (event, value) => {
            if (event.sender === promptWindow.webContents) {
                ipcMain.removeListener('prompt-response', handler);
                promptWindow.close();
                resolve(value);
            }
        };
        
        ipcMain.on('prompt-response', handler);

        // Si la fenêtre est fermée sans validation
        promptWindow.on('closed', () => {
            ipcMain.removeListener('prompt-response', handler);
            resolve(null);
        });
    });
}



module.exports = { nouveauCorpus };

////////////////////////////////////////////////////////////////////////////////////
// Catégories
////////////////////////////////////////////////////////////////////////////////////

// Fonction pour afficher la fenêtre modale d'édition des catégories
function editerCategories(parentWindow) {


  return new Promise((resolve) => {
    const catWindow = new BrowserWindow({
      width: 900,
      height: 900,
      titleBarStyle: process.platform === 'darwin' ? 'default' : 'default', // pour voir les boutons sur macOS
      parent: parentWindow,
      // modal: true,
      closable: true,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    // chargement de la fenêtre edition_categories.html
    catWindow.loadFile('edition_categories.html');
    //catWindow.webContents.openDevTools();
    // Retirer le menu de la fenêtre modale
    catWindow.setMenu(null);

    catWindow.once('ready-to-show', () => {
      
        // définition de l'icône
      const iconPath = path.join(__dirname, 'icon', 'icon.png') 
      catWindow.setIcon(iconPath);
      catWindow.show();
      flouterSousModale(mainWindow);

    });



   // Déclencher une fonction à la fermeture
    catWindow.on('closed', () => {
      
      deflouterSousModale(mainWindow);
      resolve(null);
    });

  });
}

// Écouter la demande d'ouverture depuis le renderer
ipcMain.handle('afficher-categories', async () => {
  // pass the mainWindow as parent so the created window is modal to it
  editerCategories(mainWindow);
});

module.exports = { editerCategories };

/////////////////////////////////////////////////////////////////////////////////////
// ENTRETIENS
/////////////////////////////////////////////////////////////////////////////////////

// fonction pour afficher la fenêtre modale d'édition des entretiens

async function editerEntretien(parentWindow, rgEnt){
   
  

  // ouvrir la fenêtre modale

  return new Promise((resolve) => {
    const entWindow = new BrowserWindow({
      width: 900,
      height: 900,
      titleBarStyle: process.platform === 'darwin' ? 'default' : 'default', // pour voir les boutons sur macOS
      parent: parentWindow,
      // modal: true,
 
      show: false,
      frame:true,
      resizable: true,
      minimizable: true,
      maximizable: true,
      fullscreenable: true,
      closable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    // chargement de la fenêtre edition_categories.html
    entWindow.loadFile('edition_entretien.html');
    entWindow.webContents.openDevTools();
    // Retirer le menu de la fenêtre modale
    entWindow.setMenu(null);
    flouterSousModale(mainWindow);

    

    entWindow.once('ready-to-show', async () => {
              // définition de l'icône
      const iconPath = path.join(__dirname, 'icon', 'icon.png') 
      entWindow.setIcon(iconPath);
      entWindow.show();
      entWindow.maximize()


        // verrouiller le fichier sur le serveur
      if (Corpus.type == "distant" && serveurAPI) {

        // définition de l'adresse du fichier distant
        let adrFile = cheminEnt = [Corpus.folder, tabEnt[rgEnt].rtrPath].join('/');
        //verrouillage
        await serveurAPI.verrouillerFichier(adrFile)
        .then((result) => {
          if (!result.success) {
            // Le fichier est verrouillé par un autre utilisateur
            dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Fichier verrouillé',
              message: `L'entretien est actuellement édité par ${result.lockInfo.user}. Vous ne pouvez pas l'éditer pour le moment.`,
              buttons: ['OK']
            });
            entWindow.close(); // fermer la fenêtre d'édition
            return; 
          }
 
        })
        .catch((error) => {
          console.error('Erreur lors du verrouillage du fichier :', error);
          dialog.showMessageBox(parentWindow, {
            type: 'error',
            title: 'Erreur',
            message: `Une erreur est survenue lors du verrouillage de l'entretien.`,
            buttons: ['OK']
          });
          entWindow.close(); // fermer la fenêtre d'édition
          return; 
        });
      }

    });

    //  gestion de la fermeture de la fenêtre
    entWindow.on('close', (event) => {
       
      
      // Empêcher la fermeture pour le moment
      event.preventDefault();
      
      // Demander au renderer d'exécuter la sauvegarde
       
      entWindow.webContents.send('save-and-close');

      

    });

   // Déclencher une fonction à la fermeture
    entWindow.on('closed', () => {
       
      // déverrouiller le fichier sur le serveur
      if (Corpus.type == "distant" && serveurAPI) {
        let adrFile = cheminEnt = [Corpus.folder, tabEnt[rgEnt].rtrPath].join('/');
        serveurAPI.deverrouillerFichier(adrFile)
      }
      deflouterSousModale(mainWindow);
      resolve(null);
    });

  });
}

// Écouter la demande d'ouverture depuis le renderer
ipcMain.handle('editer-entretien', async (event, rgEnt) => {
  return editerEntretien(mainWindow, rgEnt);
});

// renvoyer le statut de verrouillage du fichier  
ipcMain.handle('entretien-locked', async (event, rgEnt) => {
  console.log("vérification du verrouillage de l'entretien " + rgEnt + " de type " + Corpus.type)
  
  if (Corpus.type == "distant" && serveurAPI) {
    try {
      let adrFile = [Corpus.folder, tabEnt[rgEnt].rtrPath].join('/');
      const result = await serveurAPI.verifierVerrou(adrFile);
      
      if (!result.success) {
        console.log("impossible de vérifier le verrouillage de l'entretien");
        return { locked: false, user: null, timestamp: null };
      }
      
      if (result.locked) {
        console.log("ENTRETIEN-LOCKED : l'entretien est verrouillé par " + result.lockInfo.user);
        return {
          locked: true,
          user: result.lockInfo.user,
          timestamp: result.lockInfo.timestamp
        };
      }
      
      return { locked: false, user: null, timestamp: null };
    } catch (error) {
      console.error('Erreur lors de la vérification du verrouillage :', error);
      return { locked: false, user: null, timestamp: null };
    }
  }
  
  return { locked: false, user: null, timestamp: null };
});



// Handler IPC pour charger un fichier audio
ipcMain.handle('load-audio-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    // Retourner le buffer sous forme d'array pour le transfert
    return {
      success: true,
      data: Array.from(buffer)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});



//========================================
// ouverture d'un fichier Corpus local
//===========================================

ipcMain.handle('ouvrir-corpus-local', async (event, filePath) => {
  
  
  const result = await ouvrirCorpus(filePath);
  if (result && result.success) {
    console.log("📂 Corpus local ouvert avec succès");
    mainWindow.webContents.send('afficher-corpus', result);
  }
  return result;
});

// Handler pour ouvrir un corpus distant avec retry (depuis la liste récente)
ipcMain.handle('ouvrir-corpus-distant-avec-retry', async (event, url) => {
  console.log('🌐 Ouverture corpus distant depuis récents:', url);
  const result = await ouvrirCorpusDistantAvecRetry(mainWindow, null, url);
  if (result && result.success) {
    console.log("📂 Corpus distant ouvert avec succès");
    mainWindow.webContents.send('afficher-corpus', result);
  }
  return result;
});

// ouverture de corpus local
async function ouvrirCorpus(filePath) {
 
console.log('📂 Ouverture corpus local...' + filePath);
 
    if (!filePath){
    // Ouvre le sélecteur de fichier
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner un fichier',
      properties: ['openFile'],
      filters: [
        { name: 'Corpus Sonal', extensions: ['crp'] },
      ],
    });

    if (canceled || !filePaths[0]) return;

    console.log('📂 Fichier sélectionné:', filePaths[0]);
    filePath = filePaths[0];
    } 

    // infos générrales sur le corpus
    Corpus.url = filePath;


    Corpus.folder = path.dirname(filePath);
    Corpus.fileName = path.basename(filePath);
    Corpus.lastChange = new Date().toISOString();
    Corpus.type = "local"; 

     
    // lecture du fichier local
  
    try {
      let content = fs.readFileSync(filePath); // Lis le fichier 

      const encoding = chardet.detect(content); // détection du type d'encodage

      if (encoding == "ISO-8859-1") {
        content = iconv.decode(content, 'windows-1252'); // conversion en UTF-8 si nécessaire
      } else { 
        content  = iconv.decode(content, 'utf8')
      }
      //console.log("contenu du fichier \n" + content)
      Corpus.content = content.toString();
      

      return {
        success: true,
         
      };

    } catch (err) {
      console.error('Erreur de lecture du fichier :', err);
      return null;  
    } 
  
}
 


// ========================================
// Ouverture de corpus distant
// ========================================

// Configuration anti-popup Windows


app.commandLine.appendSwitch('auth-server-whitelist', '');
app.commandLine.appendSwitch('ignore-certificate-errors');

app.on('login', (event) => {
  event.preventDefault();
});



const ServeurAPI = require('./modules/serveur_api.js');
const { affichListThmCrp } = require('./modules/thematisation.js');
const { miseàjourEntretien } = require('./modules/gestion_entretiens.js');

let serveurAPI = null;




// fonction d'appel de fichier distant

async function ouvrirCorpusDistantAvecRetry(mainWindow, filePath, previousUrl = null) {
  console.log('🌐 Ouverture corpus distant avec retry...');
  
  let urlData;
  
  // Si un chemin de fichier est fourni ET qu'on a déjà une connexion
  if (filePath && serveurAPI) {
    console.log('🔑 Utilisation de la connexion existante');
    
    try {
      const result = await serveurAPI.lireFichier(filePath);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      

      
      return {
        success: true,
        content: result.content,
        url : path.join(serveurAPI.baseUrl, filePath), 
        filePath: filePath,
        folder: filePath.substring(0, filePath.lastIndexOf('/')),
        baseUrl: serveurAPI.baseUrl,
        size: result.size,
        modified: result.modified,
        type: 'distant'
      };
    } catch (error) {
      console.error('❌ Erreur:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Sinon, demander les credentials (avec URL pré-remplie si disponible)
  urlData = await creerFenetreURL(mainWindow, previousUrl);
  
  if (!urlData) {
    console.log('❌ Annulé');
    return null;
  }
  
 // LOGS DÉTAILLÉS
  console.log('\n=== DONNÉES REÇUES DE LA FENÊTRE ===');
  console.log('URL complète:', urlData.url);
  console.log('Username:', urlData.username);
  console.log('Password:', urlData.password.substring(0, 3) + '***');
  console.log('====================================\n');

  
  try {
    const urlObj = new URL(urlData.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
    const extractedFilePath = urlObj.pathname.substring(1);
    
    console.log('Base URL extraite:', baseUrl);
    console.log('File Path extrait:', extractedFilePath);
    
    // VÉRIFIER que les credentials sont corrects
    console.log('Création ServeurAPI avec:');
    console.log('  baseUrl:', baseUrl);
    console.log('  username:', urlData.username);
    console.log('  password:', urlData.password ? 'SET' : 'NOT SET');
    
    serveurAPI = new ServeurAPI(baseUrl, urlData.username, urlData.password);
    
    // Test immédiat avec test-auth.php
    console.log('\n🔌 Test de connexion avec test-auth.php...');
    const testResult = await serveurAPI.request('test-auth.php', 'GET');
    console.log('Résultat test:', JSON.stringify(testResult, null, 2));
    
    // Si on arrive ici, l'auth fonctionne !
    console.log('✅ Authentification OK!\n');
    
    // Maintenant lire le vrai fichier
    const result = await serveurAPI.lireFichier(extractedFilePath);
     
    if (!result.success) {
      serveurAPI = null; // Réinitialiser en cas d'échec
      throw new Error(result.error);
    }
    
    console.log('✅ Fichier chargé via API');
    console.log(`   Taille: ${result.size} octets`);
    
    // Sauvegarder les credentials SEULEMENT si succès
    credentialsManager.save(urlData.url, urlData.username, urlData.password);

    console.log ("extractedFilePath " + extractedFilePath + " baseUrl " + baseUrl)
    
    // infos générrales sur le corpus
    let cheminComplet = new URL(extractedFilePath, baseUrl).toString();
    let dosspProj = extractedFilePath.substring(0, extractedFilePath.lastIndexOf('/'));
    let fichProj = extractedFilePath.substring(extractedFilePath.lastIndexOf('/') + 1);

    Corpus.url = cheminComplet;
    Corpus.fileName = fichProj;
    Corpus.folder = dosspProj; 
    Corpus.content = result.content;
    Corpus.lastChange = new Date().toISOString();
    Corpus.type = "distant"; 
    
    // Ajouter l'URL du corpus distant à la liste des récents
    console.log('📝 Ajout du corpus distant aux fichiers récents');
    recentFilesManager.addRemoteCorpus(cheminComplet, fichProj);

    return {
      success: true,
      size: result.size,
      modified: result.modified,
       
    };
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    
    serveurAPI = null; // IMPORTANT : Réinitialiser en cas d'erreur
    
    // Si erreur d'authentification 401, proposer une nouvelle saisie
    if (error.message.includes('401') || 
        error.message.includes('Authentication') ||
        error.message.includes('Invalid credentials')) {
      
      console.log('🔐 Erreur 401 - Identifiants invalides');
      
      // Supprimer les credentials obsolètes
      if (urlData?.url) {
        credentialsManager.remove(urlData.url);
      }
      
      // Proposer à l'utilisateur de réessayer
      const reponse = await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Authentification échouée',
        message: 'Les identifiants fournis sont invalides ou expirés.',
        detail: 'Voulez-vous réessayer avec d\'autres identifiants ?',
        buttons: ['Réessayer', 'Annuler'],
        defaultId: 0,
        cancelId: 1
      });
      
      // Si l'utilisateur clique sur "Réessayer"
      if (reponse.response === 0) {
        console.log('🔄 Relance de la saisie des identifiants...');
        // Relancer la fonction en conservant l'URL
        const urlObj = new URL(urlData.url);
        const baseUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
        const extractedFilePath = urlObj.pathname.substring(1);
        const previousUrl = new URL(extractedFilePath, baseUrl).toString();
        
        // Réinitialiser serveurAPI et credentials
        serveurAPI = null;
        credentialsManager.remove(urlData.url);
        
        // Appeler avec l'URL pré-remplie
        return ouvrirCorpusDistantAvecRetry(mainWindow, filePath, previousUrl);
      }
      
      return {
        success: false,
        error: 'Authentification échouée - Opération annulée par l\'utilisateur'
      };
    }
    
    // Pour toutes les autres erreurs, afficher un message générique
    console.log('❌ Erreur lors de l\'accès au corpus distant:', error.message);
    
    // Déterminer le type d'erreur et le message approprié
    let errorTitle = 'Erreur d\'accès au corpus distant';
    let errorMessage = 'Une erreur est survenue lors de l\'accès au corpus distant.';
    let errorDetail = error.message;
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      errorTitle = 'Serveur introuvable';
      errorMessage = 'Le serveur n\'a pas pu être trouvé.';
      errorDetail = 'Vérifiez que l\'URL est correcte et que le serveur est accessible.';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorTitle = 'Connexion refusée';
      errorMessage = 'Le serveur a refusé la connexion.';
      errorDetail = 'Vérifiez que le serveur est accessible sur le port indiqué.';
    } else if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
      errorTitle = 'Délai d\'attente dépassé';
      errorMessage = 'La connexion au serveur a expiré.';
      errorDetail = 'Vérifiez votre connexion internet et la disponibilité du serveur.';
    } else if (error.message.includes('404') || error.message.includes('Not Found')) {
      errorTitle = 'Fichier non trouvé';
      errorMessage = 'Le fichier spécifié n\'existe pas sur le serveur.';
      errorDetail = 'Vérifiez que le chemin du fichier est correct.';
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorTitle = 'Accès refusé';
      errorMessage = 'Vous n\'avez pas la permission d\'accéder à ce fichier.';
      errorDetail = 'Vérifiez vos droits d\'accès sur le serveur.';
    } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
      errorTitle = 'Erreur serveur';
      errorMessage = 'Le serveur a rencontré une erreur interne.';
      errorDetail = 'Veuillez réessayer plus tard.';
    }
    
    // Afficher la boîte de dialogue d'erreur
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: errorTitle,
      message: errorMessage,
      detail: errorDetail,
      buttons: ['OK'],
      defaultId: 0
    });
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

// fonction d'appel de fichier distant

async function ouvrirCorpusDistant(mainWindow, filePath) {
  console.log('🌐 Ouverture corpus distant...');
  return ouvrirCorpusDistantAvecRetry(mainWindow, filePath, null);
}

/**
 * Fonction pour lister les fichiers du même dossier
 */
async function listerFichiersDossier(filePath) {
  if (!serveurAPI) {
    return {
      success: false,
      error: 'Pas de connexion au serveur'
    };
  }
  
  // Extraire le dossier parent
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
  
  console.log('📂 Liste du dossier:', dirPath);
  
  return await serveurAPI.listerFichiers(dirPath);
}

/**
 * Fonction pour sauvegarder sur le serveur
 */
async function sauvegarderSurServeur(filePath, content) {
  if (!serveurAPI) {
    return {
      success: false,
      error: 'Pas de connexion au serveur'
    };
  }
  
  return await serveurAPI.ecrireFichier(filePath, content);
}


// floutage des fenêtres inactives (derrière modale)
 
function flouterSousModale(parentWindow) {
  // Injecter un overlay dans la fenêtre parente
 // Injecter un overlay dans la fenêtre parente
  // Désactiver visuellement la fenêtre parente
  parentWindow.webContents.executeJavaScript(`
    document.body.style.filter = 'brightness(0.7)';
    document.body.style.pointerEvents = 'none';
  `);
}

function deflouterSousModale(parentWindow) {
  // Retirer l'overlay de la fenêtre parente
  parentWindow.webContents.executeJavaScript(`
    document.body.style.filter = '';
    document.body.style.pointerEvents = '';
  `);
  
  // Remettre le focus sur la fenêtre parente
  parentWindow.focus();
}


// fenêtre de saisie URL/USER/Mot de passe
function creerFenetreURL(parentWindow, previousUrl = null) {
  const urlWindow = new BrowserWindow({
    width: 500,
    height: 600,
    titleBarStyle: process.platform === 'darwin' ? 'default' : 'default', // pour voir les boutons sur macOS
    parent: parentWindow,
    //modal: true,
    closable: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), 
      
    }
  });

  // Retirer le menu de la fenêtre modale
  urlWindow.setMenu(null);
  
  urlWindow.loadFile('saisie-url.html');
  
  flouterSousModale(mainWindow);

  return new Promise((resolve) => {
    // Envoyer l'URL précédente si elle existe
    urlWindow.webContents.on('did-finish-load', () => {
      if (previousUrl) {
        console.log('📝 Pré-remplissage avec l\'URL précédente:', previousUrl);
        urlWindow.webContents.send('pre-fill-url', previousUrl);
      }
    });
    
    // Attendre que l'utilisateur soumette le formulaire
    ipcMain.once('url-saisie-submit', (event, data) => {
      urlWindow.close();
      resolve(data);
    });
    
    // Si l'utilisateur ferme la fenêtre sans soumettre
    urlWindow.on('closed', () => {
      deflouterSousModale(parentWindow);
      resolve(null);
    });
  });
}


 
// gestion des mots de passe enregistrés CREDENTIALS (pour accès au serveur )
 
class CredentialsManager {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'credentials.enc');
    this.cache = {}; // Cache en mémoire pour performances
    
    console.log('🔐 Fichier credentials:', this.configPath);
  }

  /**
   * Charge tous les credentials depuis le fichier
   */
  loadAll() {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.log('📝 Aucun fichier de credentials existant');
        return {};
      }

      const data = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(data);
      
      console.log(`🔑 ${Object.keys(config).length} serveur(s) trouvé(s)`);
      return config;
      
    } catch (error) {
      console.error('❌ Erreur lecture credentials:', error);
      return {};
    }
  }

  /**
   * Sauvegarde tous les credentials dans le fichier
   */
  saveAll(config) {
    try {
      // Créer le dossier si nécessaire
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('💾 Credentials sauvegardés');
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde credentials:', error);
    }
  }

  /**
   * Obtient la clé du serveur depuis une URL
   */
  getServerKey(url) {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
  }

  /**
   * Récupère les credentials pour une URL
   */
  get(url) {
    const serverKey = this.getServerKey(url);
    
    // Vérifier le cache d'abord
    if (this.cache[serverKey]) {
      console.log('⚡ Credentials depuis le cache');
      return this.cache[serverKey];
    }

    // Charger depuis le fichier
    const config = this.loadAll();
    const stored = config[serverKey];
    
    if (!stored) {
      console.log('🔍 Aucun credentials pour', serverKey);
      return null;
    }

    try {
      // Déchiffrer le mot de passe
      const encryptedBuffer = Buffer.from(stored.password, 'base64');
      const password = safeStorage.decryptString(encryptedBuffer);
      
      const credentials = {
        username: stored.username,
        password: password
      };
      
      // Mettre en cache
      this.cache[serverKey] = credentials;
      
      console.log('🔓 Credentials déchiffrés pour', serverKey);
      return credentials;
      
    } catch (error) {
      console.error('❌ Erreur déchiffrement:', error);
      // Si échec, supprimer cette entrée corrompue
      this.remove(url);
      return null;
    }
  }

  /**
   * Sauvegarde les credentials pour une URL
   */
  save(url, username, password) {
    const serverKey = this.getServerKey(url);
    
    try {
      // Chiffrer le mot de passe
      const encryptedPassword = safeStorage.encryptString(password);
      
      // Charger la config existante
      const config = this.loadAll();
      
      // Ajouter/Mettre à jour
      config[serverKey] = {
        username: username,
        password: encryptedPassword.toString('base64'),
        dateEnregistrement: new Date().toISOString(),
        urlExemple: url // Pour référence
      };
      
      // Sauvegarder
      this.saveAll(config);
      
      // Mettre en cache
      this.cache[serverKey] = { username, password };
      
      console.log('🔒 Credentials sauvegardés pour', serverKey);
      return true;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      return false;
    }
  }

  /**
   * Supprime les credentials pour une URL
   */
  remove(url) {
    const serverKey = this.getServerKey(url);
    
    // Retirer du cache
    delete this.cache[serverKey];
    
    // Retirer du fichier
    const config = this.loadAll();
    if (config[serverKey]) {
      delete config[serverKey];
      this.saveAll(config);
      console.log('🗑️ Credentials supprimés pour', serverKey);
    }
  }

  /**
   * Efface tous les credentials
   */
  clear() {
    this.cache = {};
    
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
      console.log('🗑️ Tous les credentials effacés');
    }
  }

  /**
   * Liste tous les serveurs enregistrés
   */
  listServers() {
    const config = this.loadAll();
    return Object.keys(config).map(serverKey => ({
      serveur: serverKey,
      username: config[serverKey].username,
      dateEnregistrement: config[serverKey].dateEnregistrement
    }));
  }
}

// Instance globale
const credentialsManager = new CredentialsManager();


// Ouvrir une modale de sélection personnalisée
ipcMain.handle('ajout-entretien', async () => {
  

  const entWindow = new BrowserWindow({
    width: 700,
    height: 780,
    titleBarStyle: process.platform === 'darwin' ? 'default' : 'default', // pour voir les boutons sur macOS
    parent: mainWindow,
    // modal: true,
    closable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true, 
      sandbox: false
    }
  });
  
  entWindow.setMenu(null);

  entWindow.loadFile('ajout-entretien.html');
 
  entWindow.once('ready-to-show', () => {
    
    entWindow.show();
    flouterSousModale(mainWindow);
  });

  // Attendre que la modale retourne des données
  return new Promise((resolve) => {
    ipcMain.once('ajout-entretien-result', (event, data) => {
      entWindow.close();
      resolve(data);
    });
    
    entWindow.on('closed', () => {
      deflouterSousModale(mainWindow);
      resolve({ canceled: true });
    });
  });
});

 
//////////////////////////////////////////////////////////////////////////////////////
// Enregistrement des fichiers récents
////////////////////////////////////////////////////////////////////////////////////////


const Store = require('electron-store');
 

// Configuration du store
const store = new Store({
  defaults: {
    recentFiles: []
  }
});

// Classe pour gérer les fichiers récents
class RecentFilesManager {
  constructor(maxFiles = 10) {
    this.maxFiles = maxFiles;
  }

  add(filePath) {

     
    if (!fs.existsSync(filePath)) {
      return;
    }

    let recentFiles = store.get('recentFiles', []);
    recentFiles = recentFiles.filter(f => f.path !== filePath);
    
    recentFiles.unshift({
      path: filePath,
      name: path.basename(filePath),
      openedAt: new Date().toISOString(),
      type: 'local'
    });
    
    recentFiles = recentFiles.slice(0, this.maxFiles);
    store.set('recentFiles', recentFiles);
    this.updateMenu();
    
    return recentFiles;
  }

  addRemoteCorpus(url, name) {
    let recentFiles = store.get('recentFiles', []);
    // Supprimer si déjà dans la liste
    recentFiles = recentFiles.filter(f => f.path !== url);
    
    recentFiles.unshift({
      path: url,
      name: name,
      openedAt: new Date().toISOString(),
      type: 'remote'
    });
    
    recentFiles = recentFiles.slice(0, this.maxFiles);
    store.set('recentFiles', recentFiles);
    this.updateMenu();
    
    return recentFiles;
  }

  getAll() {
    let recentFiles = store.get('recentFiles', []);
    // Filtrer : garder les fichiers distants, vérifier l'existence des fichiers locaux
    recentFiles = recentFiles.filter(file => {
      if (file.type === 'remote') {
        return true; // Garder les fichiers distants
      }
      return fs.existsSync(file.path); // Vérifier l'existence des fichiers locaux
    });
    store.set('recentFiles', recentFiles);
    
    return recentFiles;
  }

  remove(filePath) {
    let recentFiles = store.get('recentFiles', []);
    recentFiles = recentFiles.filter(f => f.path !== filePath);
    store.set('recentFiles', recentFiles);
    this.updateMenu();
  }

  clear() {
    store.set('recentFiles', []);
    this.updateMenu();
  }

  
   updateMenu() {
    if (!menuParDefaut) {
      console.warn('pas de menu.');
      return;
    }

    const recentFiles = this.getAll();
    const mainWindow = BrowserWindow.getAllWindows()[0];
    
    if (!mainWindow) return;

    // Mettre à jour la partie "Fichiers récents" dans le template
    this.updateRecentFilesInTemplate(menuParDefaut, recentFiles);
    
    // Reconstruire et appliquer le menu
    const menu = Menu.buildFromTemplate(menuParDefaut);
    Menu.setApplicationMenu(menu);
  }

  // Mettre à jour "Fichiers récents" dans le template
  updateRecentFilesInTemplate(menuTemplate, recentFiles) {

    

    menuTemplate.forEach(menuItem => {
      if (menuItem.submenu) {
        menuItem.submenu.forEach(subItem => {
          if (subItem.label === '🗃️ Corpus récents') {
            // Remplacer le sous-menu
            subItem.submenu = recentFiles.length > 0 
              ? [
                  ...recentFiles.map(file => ({
                    label: `${file.type === 'remote' ? '🌐 ' : ''}${file.name}`,
                    //sublabel: file.path,
                    click: () => {
                      if (file.type === 'remote') {
                        // Ouvrir corpus distant avec l'URL pré-remplie
                        ouvrirCorpusDistantAvecRetry(mainWindow, null, file.path).then((result) => {
                          if (result && result.success) {
                            mainWindow.webContents.send('afficher-corpus', result);
                          }
                        });
                      } else {
                        // Ouvrir corpus local
                        ouvrirCorpus(file.path).then((result) => {
                          if (result && result.success) {
                            mainWindow.webContents.send('afficher-corpus', result);
                          }
                        });
                      }
                    } 

                  })),
                  { type: 'separator' },
                  {
                    label: 'Effacer la liste',
                    click: () => this.clear()
                  }
                ]
              : [{ label: 'Aucun fichier récent', enabled: false }];
          }
        });
      }
    });
  }
  
}



// Initialiser le manager
const recentFilesManager = new RecentFilesManager(10);

// ====================================
// ENREGISTRER LES HANDLERS IPC EN PREMIER
// ====================================
ipcMain.handle('get-recent-files', () => {
  return recentFilesManager.getAll();
});

ipcMain.handle('add-recent-file', (event, filePath) => {
  return recentFilesManager.add(filePath);
});

ipcMain.handle('remove-recent-file', (event, filePath) => {
  recentFilesManager.remove(filePath);
});

ipcMain.handle('clear-recent-files', () => {
  recentFilesManager.clear();
});

ipcMain.handle('open-file-dialog', async () => {
  const window = BrowserWindow.getFocusedWindow();
  await recentFilesManager.openFileDialog(window);
});

ipcMain.handle('update-recent-files-menu', async () => {
 recentFilesManager.updateMenu();
});



//////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////
// lancement de l'application
//////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

app.on('ready', () => {

  // définition de l'icône
  const iconPath = path.join(__dirname, 'icon', 'icon.png') 
 
  


  // création de la fenêtre principale
  mainWindow = new BrowserWindow({
    //fullscreen: true, 
    show:false, 
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
      // icon: iconPath  // Retiré des options pour le définir après
       
    },
    });

    mainWindow.loadFile(path.join(__dirname,  "index.html"));
    mainWindow.maximize()

    // Définir l'icône après le chargement de la fenêtre
    mainWindow.once('ready-to-show', () => {
      mainWindow.setIcon(iconPath);
      mainWindow.show();
    });

    mainWindow.webContents.openDevTools()



  });



  /////////////////////////////////////////////////////
  // menus
  /////////////////////////////////////////////////////
  
  const menuParDefaut = [
    { // menu corpus
      label: 'Corpus',
      submenu: [
        { 
                label: '📂+ Nouveau corpus',
                accelerator: 'CmdOrCtrl+N',
                click: async () => {
                    const mainWindow = BrowserWindow.getAllWindows()[0];
                    await nouveauCorpus(mainWindow);
                } 
        },
        { type: 'separator' },
        { 
          label: '📂 Ouvrir corpus',
          click: async () => { 
          const result = await ouvrirCorpus(); 
            if (result && result.success) {
              
              mainWindow.webContents.send('afficher-corpus', result);
            } 
          }
        },
         {
            label: '🗃️ Corpus récents',
            submenu: [{ label: 'Aucun fichier récent', enabled: false }]
          },
      { type: 'separator' },
        {  // ouvrir un corpus distant
          label: '🌐 Ouvrir corpus distant...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await ouvrirCorpusDistant(mainWindow);
            if (result && result.success) {                  
            //traiterCorpus(result); 

              // Envoyer le contenu au renderer
              mainWindow.webContents.send('afficher-corpus', result);
            }  
          }
        },
   
  
         
         { type: 'separator' },
        {
          label: 'Enregistrer corpus',
          click: () => { // Envoyer un message au renderer
          mainWindow.webContents.send('demander-sauvegarde');
         } 
        },
        /*
         {
        label: '💾 Sauvegarder avec backup',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => {
          mainWindow.webContents.send('demander-sauvegarde-backup');
        }
      },*/
        
        { type: 'separator' },
        { 
          label: 'Quitter', 
          role: 'quit'  
          
        }
      ]
    },

    /*
    { // menu entretiens
      label: 'Entretiens',
      submenu: [
        { 
          label: 'Ajouter un entretien',
          click: () => {  } 
        },
       
        { type: 'separator' },
      
                { 
        label: 'Supprimer',
          click: () => { console.log('supprimer ') } 
        }
      ]
    },
        { // menu entretiens
      label: 'Catégories',
      submenu: [
        { 
          label: 'Editer les catégories',
          click: () => { editerCategories(mainWindow); } 
        },
       
        { type: 'separator' },
      
                { 
        label: 'Exporter les catégories',
          click: () => { console.log('supprimer ') } 
        }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' }
      ]
    }
      */
  ]

  const menu = Menu.buildFromTemplate(menuParDefaut)
  Menu.setApplicationMenu(menu)





app.on('before-quit', async () => {
  console.log('🚪 Fermeture de l\'application...');
  if (serveurAPI) await serveurAPI.nettoyerTousLesVerrous();
});

app.on('window-all-closed', async () => {
  if (serveurAPI) await serveurAPI.nettoyerTousLesVerrous();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS
app.on('open-file', async (event, path) => {
  event.preventDefault();
  console.log('Fichier ouvert:', path);

           const result = await ouvrirCorpus(path); 
            if (result && result.success) {
  
              mainWindow.webContents.send('afficher-corpus', result);
            }
  
});

// Windows/Linux
(async () => {
  if (process.argv.length >= 2) {
    for (let i = 1; i < process.argv.length; i++) {
      const filePath = process.argv[i];
      
      // Ignorer les arguments qui commencent par -- (flags Electron)
      if (filePath.startsWith('--')) continue;
      
      // Ignorer le chemin de l'app elle-même
      if (filePath.includes('electron') || filePath.includes('.exe')) continue;
      
      // Vérifier que c'est un fichier
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        console.log('Fichier ouvert:', filePath);
        const result = await ouvrirCorpus(filePath);
        if (result && result.success) {
          mainWindow.webContents.send('afficher-corpus', result);
        }
        break;  // Traiter seulement le premier fichier valide
      }
    }
  }
})();

