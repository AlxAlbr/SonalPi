const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const iconv = require('iconv-lite');
const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const _pdfParse = require('pdf-parse/lib/pdf-parse.js');
const pdfParse = _pdfParse.default || _pdfParse;
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

// utilisateur 
var utilisateur="";
 

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

// Handlers pour récupérer et mettre à jour l'utilisateur
ipcMain.handle('get-user', () => { return utilisateur; });
ipcMain.handle('set-user', (_, newUser) => {
  utilisateur = newUser;
  return true;
});

 

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

// Demande de fermeture de la fenetre courante depuis le renderer
ipcMain.on('window-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
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
  
  // remplacement complet du tableau
  if (rk === undefined || rk === null) {
    tabHtml = html;
    return true;
  }

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
ipcMain.handle('get-grph', (_, rk) => { 
  if (rk === undefined || rk === null) {
    return tabGrph;
  } else {
    return tabGrph[rk];
  }
});

ipcMain.handle('set-grph', (_, rk, newTabGrph) => {
  
  // remplacement complet du tableau
  if (rk === undefined || rk === null) {
    tabGrph = newTabGrph;
    return true;
  }

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
      { name: 'Fichiers texte', extensions: ['sonal', 'sonal.html','srt','txt','md','json','purge','docx','pdf'] }
          
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
      // Fichiers Word : extraction du texte brut via mammoth
      if (path.extname(filePath).toLowerCase() === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value; // texte brut
      }

      // Fichiers PDF : extraction du texte brut via pdf-parse
      if (path.extname(filePath).toLowerCase() === '.pdf') {
        const buf = fs.readFileSync(filePath);
        const data = await pdfParse(buf);
        return data.text; // texte brut
      }

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
      const api = remoteAPI();
      if (!api) throw new Error('Aucune API distante initialisée');
      const result = await api.lireFichier(filePath);
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
      const api = remoteAPI();
      if (!api) {
        return { success: false, error: 'Pas de connexion au serveur' };
      }

      const result = await api.lireFichier(filePath);
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

// Vérifier l'existence d'un fichier (local ou distant)
ipcMain.handle('file:exists', async (_, filePath) => {
  
  console.log('📁 Vérification existence:', filePath);
  if (!filePath) return false;

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
      const exists = fs.existsSync(filePath);
      console.log(`  ✅ Local: ${exists ? 'Existe' : 'N\'existe pas'}`);
      return exists;
    } else {
      // Fichier distant - utiliser verifierExistence (plus léger)
      const api = remoteAPI();
      if (!api) {
        console.log('  ❌ Distant: Pas de connexion au serveur');
        return false;
      }

      try {
        const exists = await api.verifierExistence(filePath);
        return exists;
      } catch (err) {
        console.log(`  ❌ Distant: Erreur - ${err.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Erreur vérification existence:', error);
    return false;
  }
});

// Récupérer la date de modification d'un fichier (local ou distant)
ipcMain.handle('file:lastModified', async (_, filePath) => {
  console.log('🕒 Dernière modif:', filePath);
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
      const stats = fs.statSync(filePath);
      const lastModified = stats.mtime.toISOString();
      console.log(`  ✅ Local: ${lastModified}`);
      return lastModified;
    }

    if (!serveurAPI) {
      console.log('  ❌ Distant: Pas de connexion au serveur');
      return null;
    }

    try {
      const lastModified = await serveurAPI.derniereModif(filePath);
      return lastModified;
    } catch (err) {
      console.log(`  ❌ Distant: Erreur - ${err.message}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Erreur récupération dernière modif:', error);
    return null;
  }
});


// récupérer la date de modification du fichier


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
  const result = await remoteAPI().lireFichier(filePath);

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
  await remoteAPI().deverrouillerFichier(filePath);
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

// Boîte de dialogue "Enregistrer sous" + écriture du fichier
ipcMain.handle('dialog:saveFile', async (event, { filename, content, encoding }) => {

  // Chemin par défaut : dossier du projet local, sinon Documents
  const defaultDir = (Corpus.folder && Corpus.type !== 'distant')
    ? Corpus.folder
    : app.getPath('documents');
  const defaultPath = path.join(defaultDir, filename);

  // Filtres basés sur l'extension
  const ext = path.extname(filename).replace('.', '') || '*';
  const filters = [{ name: 'Fichier', extensions: [ext] }, { name: 'Tous les fichiers', extensions: ['*'] }];

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    if (encoding && encoding !== 'utf8' && encoding !== 'UTF-8') {
      const buf = iconv.encode(content, 'win1252');
      fs.writeFileSync(filePath, buf);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    console.log('✅ Fichier enregistré :', filePath);
    return { success: true, filePath };
  } catch (error) {
    console.error('❌ Erreur saveFile :', error);
    return { success: false, error: error.message };
  }
});

// Handler pour sauvegarder sur le serveur
ipcMain.handle('sauvegarder-sur-serveur', async (event, filePath, content) => {
  console.log('💾 Demande de sauvegarde sur serveur');
  console.log('   Fichier:', filePath);
  console.log('   Taille:', content.length, 'caractères');

  const api = remoteAPI();
  if (!api) {
    console.error('❌ Aucune API distante initialisée');
    return {
      success: false,
      error: 'Non connecté. Ouvrez d\'abord un fichier distant.'
    };
  }

  try {
    const result = await api.ecrireFichier(filePath, content);
    
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

  const api = remoteAPI();
  if (!api) {
    return {
      success: false,
      error: 'Non connecté au serveur'
    };
  }

  try {
    // 1. Télécharger la version actuelle
    console.log('📥 Téléchargement version actuelle...');
    const ancienneVersion = await api.lireFichier(filePath);

    if (ancienneVersion.success) {
      // 2. Créer un backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const extension = filePath.split('.').pop();
      const cheminBackup = filePath.replace(`.${extension}`, `.backup-${timestamp}.${extension}`);

      console.log('📦 Création backup:', cheminBackup);
      await api.ecrireFichier(cheminBackup, ancienneVersion.content);
    }

    // 3. Sauvegarder la nouvelle version
    console.log('💾 Sauvegarde nouvelle version...');
    const result = await api.ecrireFichier(filePath, content);
    
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
            height: 400,
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
                if (parentWindow && !parentWindow.isDestroyed()) {
                    parentWindow.focus();
                }
            }
        };
        
        ipcMain.on('prompt-response', handler);

        // Si la fenêtre est fermée sans validation
        promptWindow.on('closed', () => {
            ipcMain.removeListener('prompt-response', handler);
            resolve(null);
            if (parentWindow && !parentWindow.isDestroyed()) {
                parentWindow.focus();
            }
        });
    });
}



module.exports = { nouveauCorpus };


async function compacterCorpus() { // fonction permettant de compacter les données du corpus dans un seul fichier JSON (pour faciliter l'export et la sauvegarde)
 
  const corpusComp = {
    meta: {
      nom: Corpus.fileName,
      url: Corpus.url,
      type: Corpus.type,
      lastChange: new Date().toISOString()
    },
    tabThm,
    tabVar,
    tabDic,
    tabDat,
    tabEnt,
    tabHtml,
    tabGrph
  };

  const json = JSON.stringify(corpusComp, null, '\t');

  // Nom par défaut basé sur le corpus, emplacement au choix
  const defaultName = Corpus.fileName
    ? Corpus.fileName.replace('.crp', '.json')
    : 'corpus.json';
  const defaultDir = (Corpus.folder && Corpus.type !== 'distant')
    ? Corpus.folder
    : app.getPath('documents');

  const { canceled, filePath: dest } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter la sauvegarde',
    defaultPath: path.join(defaultDir, defaultName),
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (canceled || !dest) return null;

  fs.writeFileSync(dest, json, 'utf8');

  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Sauvegarde exportée',
    message: 'La sauvegarde a été exportée avec succès.',
    detail: dest,
    buttons: ['OK']
  });

  return corpusComp;

}

module.exports = { compacterCorpus };


async function archiverCorpus() {
  // Vérification qu'un corpus est ouvert
  if (!Corpus.folder || !Corpus.fileName) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Aucun corpus ouvert',
      message: 'Veuillez ouvrir un corpus avant d\'exporter une archive.',
      buttons: ['OK']
    });
    return null;
  }

  const estDistant = Corpus.type === 'distant';

  // Nom par défaut : même nom que le corpus + date
  const baseName = Corpus.fileName.replace('.crp', '');
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const defaultName = `${baseName}_${timestamp}.zip`;
  const defaultDir = estDistant ? app.getPath('documents') : Corpus.folder;

  // Boîte de dialogue "Enregistrer sous"
  const { canceled, filePath: dest } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter l\'archive du corpus',
    defaultPath: path.join(defaultDir, defaultName),
    filters: [
      { name: 'Archive ZIP', extensions: ['zip'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (canceled || !dest) return null;

  const zip = new AdmZip();
  const erreurs = [];

  if (estDistant) {
    // ─── Corpus distant : télécharger les fichiers via serveurAPI ───────────

    // 1. Fichier .crp : on sérialise l'état en mémoire (données courantes)
    const corpusContent = JSON.stringify({ tabThm, tabEnt, tabVar, tabDic }, null, 2);
    zip.addFile(Corpus.fileName, Buffer.from(corpusContent, 'utf8'));

    // 2. Fichiers .sonal référencés dans tabEnt
    for (const ent of tabEnt) {
      if (ent.rtrPath) {
        const cheminDistant = Corpus.folder + '/' + ent.rtrPath;
        try {
          const result = await serveurAPI.lireFichier(cheminDistant);
          if (result.success && result.content) {
            const entryPath = ent.rtrPath.replace(/\\/g, '/');
            zip.addFile(entryPath, Buffer.from(result.content, 'utf8'));
          } else {
            erreurs.push(ent.rtrPath);
          }
        } catch (e) {
          console.error('Erreur téléchargement distant:', ent.rtrPath, e);
          erreurs.push(ent.rtrPath);
        }
      }
    }

  } else {
    // ─── Corpus local : lecture via fs ──────────────────────────────────────

    // 1. Fichier .crp
    const cheminCrp = path.join(Corpus.folder, Corpus.fileName);
    if (fs.existsSync(cheminCrp)) {
      zip.addLocalFile(cheminCrp);
    } else {
      erreurs.push(Corpus.fileName);
    }

    // 2. Fichiers .sonal référencés dans tabEnt
    for (const ent of tabEnt) {
      if (ent.rtrPath) {
        const cheminSonal = path.join(Corpus.folder, ent.rtrPath);
        if (fs.existsSync(cheminSonal)) {
          const dirRelative = path.dirname(ent.rtrPath);
          zip.addLocalFile(cheminSonal, dirRelative !== '.' ? dirRelative : '');
        } else {
          erreurs.push(ent.rtrPath);
        }
      }
    }
  }

  // Écriture du zip
  zip.writeZip(dest);

  // Message de confirmation
  const detail = erreurs.length > 0
    ? `Archive créée : ${dest}\n\nFichiers introuvables (ignorés) :\n${erreurs.join('\n')}`
    : dest;
  await dialog.showMessageBox(mainWindow, {
    type: erreurs.length > 0 ? 'warning' : 'info',
    title: 'Archive exportée',
    message: erreurs.length > 0
      ? 'Archive créée avec des fichiers manquants.'
      : 'L\'archive a été créée avec succès.',
    detail,
    buttons: ['OK']
  });

  return dest;
}

module.exports = { archiverCorpus };



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
    //entWindow.webContents.openDevTools();
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
      if ((Corpus.type == "distant" || Corpus.type == "gitlab") && remoteAPI()) {

        // définition de l'adresse du fichier distant
        let adrFile = cheminEnt = [Corpus.folder, tabEnt[rgEnt].rtrPath].filter(Boolean).join('/');
        //verrouillage
        try {
          const lockResult = await remoteAPI().verrouillerFichier(adrFile);
          if (lockResult.readOnly) {
            // Fichier déjà verrouillé par quelqu'un d'autre (409)
            dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Fichier verrouillé',
              message: `L'entretien est actuellement édité par ${lockResult.lockedBy || 'un autre utilisateur'}. Vous ne pouvez pas l'éditer pour le moment.`,
              buttons: ['OK']
            });
            entWindow.close();
          } else if (!lockResult.success) {
            // Erreur API ou réseau : proposer lecture seule ou annulation
            console.warn('⚠️ Verrouillage impossible :', lockResult.error);
            const { response } = await dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Verrouillage impossible',
              message: `Impossible de verrouiller l'entretien (${lockResult.error || 'erreur réseau'}).\n\nSans verrou, d'autres utilisateurs pourraient modifier ce fichier en même temps.`,
              buttons: ['Ouvrir en lecture seule', 'Annuler'],
              defaultId: 0,
              cancelId: 1,
            });
            if (response === 1) {
              entWindow.close();
            } else {
              entWindow.webContents.send('fichier-lecture-seule', {
                message: 'Ouvert en lecture seule (verrouillage indisponible)',
              });
            }
          }
        } catch (error) {
          console.error('Erreur inattendue lors du verrouillage :', error);
          const { response } = await dialog.showMessageBox(parentWindow, {
            type: 'warning',
            title: 'Verrouillage impossible',
            message: `Une erreur inattendue empêche le verrouillage.\n\nSans verrou, d'autres utilisateurs pourraient modifier ce fichier en même temps.`,
            buttons: ['Ouvrir en lecture seule', 'Annuler'],
            defaultId: 0,
            cancelId: 1,
          });
          if (response === 1) {
            entWindow.close();
          } else {
            entWindow.webContents.send('fichier-lecture-seule', {
              message: 'Ouvert en lecture seule (verrouillage indisponible)',
            });
          }
        }
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
      if ((Corpus.type == "distant" || Corpus.type == "gitlab") && remoteAPI()) {
        let adrFile = cheminEnt = [Corpus.folder, tabEnt[rgEnt].rtrPath].filter(Boolean).join('/');
        remoteAPI().deverrouillerFichier(adrFile)
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
  //console.log("vérification du verrouillage de l'entretien " + rgEnt + " de type " + Corpus.type)
  
  if ((Corpus.type == "distant" || Corpus.type == "gitlab") && remoteAPI()) {
    try {
      let adrFile = [Corpus.folder, tabEnt[rgEnt].rtrPath].filter(Boolean).join('/');
      const result = await remoteAPI().verifierVerrou(adrFile);
      
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
    // Retourner comme Uint8Array : transfert structuré binaire, pas de sérialisation élément par élément
    return {
      success: true,
      data: new Uint8Array(buffer)
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
const GitLabAPI  = require('./modules/gitlab_api.js');
const GitLabOAuth = require('./modules/gitlab_oauth.js');
const { affichListThmCrp } = require('./modules/thematisation.js');
const { miseàjourEntretien } = require('./modules/gestion_entretiens.js');

let serveurAPI = null;
let gitlabAPI  = null;

/** Renvoie l'API distante active selon le type du corpus courant */
function remoteAPI() {
  if (Corpus.type === 'gitlab') return gitlabAPI;
  return serveurAPI;
}




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

// ========================================
// Ouverture de corpus GitLab
// ========================================

/**
 * Ouvre une modale de connexion GitLab, authentifie via OAuth 2.0,
 * puis charge le fichier .crp racine du projet.
 *
 * @param {BrowserWindow} parentWindow
 * @param {object|null}   savedConfig   Config pré-remplie (instanceUrl, projectPath, clientId, filePath)
 */
async function ouvrirCorpusGitLab(parentWindow, savedConfig = null) {
  console.log('🦊 Ouverture corpus GitLab...');

  // 1. Afficher la modale de saisie des paramètres GitLab
  const config = await creerFenetreGitLab(parentWindow, savedConfig);

  if (!config) {
    console.log('❌ Annulé par l\'utilisateur');
    return null;
  }

  const { instanceUrl, projectPath, clientId, filePath } = config;

  try {
    // 2. Lancer le flux OAuth 2.0
    const oauth = new GitLabOAuth(instanceUrl, clientId);

    // Essayer de récupérer un token sauvegardé
    const tokenKey = `gitlab:${instanceUrl}:${projectPath}`;
    const storageDir = app.getPath('userData');
    let token = oauth.loadToken(storageDir, tokenKey);

    if (!token) {
      console.log('🔑 Pas de token sauvegardé, lancement du flux OAuth...');
      token = await oauth.authenticate();
      oauth.saveToken(storageDir, tokenKey, token);
    }

    // 3. Créer l'instance GitLabAPI
    gitlabAPI = new GitLabAPI(instanceUrl, projectPath, token.access_token);

    // 4. Tester la connexion
    const test = await gitlabAPI.testerConnexion();
    if (!test.success) {
      // Token peut-être expiré → essayer de rafraîchir
      if (token.refresh_token) {
        console.log('🔄 Token expiré, tentative de rafraîchissement...');
        const newToken = await oauth.refreshToken(token.refresh_token);
        oauth.saveToken(storageDir, tokenKey, newToken);
        gitlabAPI = new GitLabAPI(instanceUrl, projectPath, newToken.access_token);
        // Vérifier que le nouveau token est valide (et initialiser currentUser)
        const testApresRefresh = await gitlabAPI.testerConnexion();
        if (!testApresRefresh.success) {
          throw new Error('Token rafraîchi invalide — reconnexion OAuth nécessaire');
        }
      } else {
        throw new Error('Token invalide et pas de refresh_token disponible');
      }
    }

    // 5. S'assurer que .gitattributes contient les règles LFS (fire-and-forget,
    //    non bloquant — la connexion ne doit pas attendre cette opération)
    gitlabAPI.initialiserGitattributes();

    // 6. Lire le fichier corpus
    const result = await gitlabAPI.lireFichier(filePath);

    if (!result.success) {
      gitlabAPI = null;
      throw new Error(result.error || 'Impossible de lire le fichier corpus');
    }

    console.log('✅ Corpus GitLab chargé');
    console.log(`   Taille: ${result.size} caractères`);

    // 6. Mettre à jour l'objet Corpus
    const fichProj  = filePath.substring(filePath.lastIndexOf('/') + 1);
    const dosspProj = filePath.substring(0, filePath.lastIndexOf('/'));

    Corpus.url        = `${instanceUrl}/${projectPath}/-/blob/main/${filePath}`;
    Corpus.fileName   = fichProj;
    Corpus.folder     = dosspProj;
    Corpus.content    = result.content;
    Corpus.lastChange = new Date().toISOString();
    Corpus.type       = 'gitlab';

    // Ajouter aux fichiers récents avec type 'gitlab' et config pour pré-remplissage
    recentFilesManager.addGitlabCorpus(Corpus.url, fichProj, { instanceUrl, projectPath, filePath, clientId });

    return { success: true, size: result.size, modified: result.modified };

  } catch (error) {
    console.error('❌ Erreur ouverture corpus GitLab:', error.message);
    gitlabAPI = null;

    await dialog.showMessageBox(parentWindow, {
      type: 'error',
      title: 'Erreur de connexion GitLab',
      message: 'Impossible de se connecter au corpus GitLab.',
      detail: error.message,
      buttons: ['OK'],
      defaultId: 0
    });

    return { success: false, error: error.message };
  }
}

/**
 * Crée la fenêtre modale de saisie des paramètres GitLab
 */
function creerFenetreGitLab(parentWindow, prefill = null) {
  const gitlabWindow = new BrowserWindow({
    width: 520,
    height: 480,
    parent: parentWindow,
    closable: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  gitlabWindow.setMenu(null);
  gitlabWindow.loadFile('saisie-gitlab.html');

  flouterSousModale(mainWindow);

  return new Promise((resolve) => {
    gitlabWindow.webContents.on('did-finish-load', () => {
      if (prefill) {
        gitlabWindow.webContents.send('pre-fill-gitlab', prefill);
      }
    });

    const onSubmit = (_event, data) => {
      gitlabWindow.close();
      resolve(data);
    };

    ipcMain.once('gitlab-saisie-submit', onSubmit);

    gitlabWindow.on('closed', () => {
      ipcMain.removeListener('gitlab-saisie-submit', onSubmit);
      deflouterSousModale(parentWindow);
      resolve(null);
    });
  });
}

/** Handler IPC : ouvrir un corpus GitLab */
ipcMain.handle('ouvrir-corpus-gitlab', async (event, savedConfig) => {
  console.log('🦊 Handler ouvrir-corpus-gitlab');
  const result = await ouvrirCorpusGitLab(mainWindow, savedConfig || null);
  if (result && result.success) {
    mainWindow.webContents.send('afficher-corpus', result);
  }
  return result;
});

/** Handler IPC : ouvrir la page d'aide GitLab dans une fenêtre Electron */
ipcMain.handle('ouvrir-aide-gitlab', () => {
  const helpWindow = new BrowserWindow({
    width: 820,
    height: 700,
    title: 'Aide — Connexion GitLab',
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });
  helpWindow.setMenu(null);
  helpWindow.loadFile('GitlabHelp.html');
});

/**
 * Fonction pour lister les fichiers du même dossier
 */
async function listerFichiersDossier(filePath) {
  const api = remoteAPI();
  if (!api) {
    return {
      success: false,
      error: 'Pas de connexion au serveur'
    };
  }

  // Extraire le dossier parent
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

  console.log('📂 Liste du dossier:', dirPath);

  return await api.listerFichiers(dirPath);
}

/**
 * Fonction pour sauvegarder sur le serveur
 */
async function sauvegarderSurServeur(filePath, content) {
  const api = remoteAPI();
  if (!api) {
    return {
      success: false,
      error: 'Pas de connexion au serveur'
    };
  }

  return await api.ecrireFichier(filePath, content);
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
function ouvrirAjoutEntretien() {
  const entWindow = new BrowserWindow({
    width: 700,
    height: 680,
    titleBarStyle: process.platform === 'darwin' ? 'default' : 'default',
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
}

ipcMain.handle('ajout-entretien', () => ouvrirAjoutEntretien());

 
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

  addGitlabCorpus(url, name, config) {
    let recentFiles = store.get('recentFiles', []);
    recentFiles = recentFiles.filter(f => f.path !== url);
    recentFiles.unshift({
      path: url,
      name: name,
      openedAt: new Date().toISOString(),
      type: 'gitlab',
      config: config, // { instanceUrl, projectPath, filePath, clientId }
    });
    recentFiles = recentFiles.slice(0, this.maxFiles);
    store.set('recentFiles', recentFiles);
    this.updateMenu();
    return recentFiles;
  }

  getAll() {
    let recentFiles = store.get('recentFiles', []);
    // Filtrer : garder les fichiers distants et gitlab, vérifier l'existence des fichiers locaux
    recentFiles = recentFiles.filter(file => {
      if (file.type === 'remote' || file.type === 'gitlab') {
        return true;
      }
      return fs.existsSync(file.path);
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
                    label: `${file.type === 'remote' || file.type === 'gitlab' ? '🌐 ' : ''}${file.name}`,
                    //sublabel: file.path,
                    click: () => {
                      if (file.type === 'gitlab') {
                        ouvrirCorpusGitLab(mainWindow, file.config).then((result) => {
                          if (result && result.success) {
                            mainWindow.webContents.send('afficher-corpus', result);
                          }
                        });
                      } else if (file.type === 'remote') {
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

// Windows/Linux : récupérer le fichier passé en argument avant l'event ready
let pendingFilePath = null;
for (let i = 1; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) continue;
  if (arg.includes('electron') || arg.includes('.exe')) continue;
  try {
    if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      pendingFilePath = arg;
      break;
    }
  } catch (_) {}
}

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
    mainWindow.once('ready-to-show', async () => {
      mainWindow.setIcon(iconPath);
      mainWindow.show();

      // Vérification des mises à jour (ignorée silencieusement en développement)
      autoUpdater.checkForUpdatesAndNotify();

      // Windows/Linux : ouvrir le fichier passé en argument
      if (pendingFilePath) {
        const result = await ouvrirCorpus(pendingFilePath);
        if (result && result.success) {
          mainWindow.webContents.send('afficher-corpus', result);
        }
        pendingFilePath = null;
      }
    });

    // Activer DevTools avec F12 ou Ctrl+Shift+I
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F12' ||
            (input.control && input.shift && (input.key === 'I' || input.key === 'i'))) {
          mainWindow.webContents.toggleDevTools();
        }
      }
    });



  });

  // Mise à jour disponible : informer l'utilisateur
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise à jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible.`,
      detail: 'Elle sera téléchargée en arrière-plan et installée à la prochaine fermeture.'
    });
  });

  // Mise à jour téléchargée : proposer le redémarrage
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      title: 'Mise à jour prête',
      message: 'La mise à jour a été téléchargée. Redémarrer Sonal pour l\'installer ?'
    }).then(result => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erreur autoUpdater:', err.message);
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
              mainWindow.webContents.send('afficher-corpus', result);
            }
          }
        },
        {  // ouvrir un corpus GitLab
          label: '🦊 Ouvrir corpus GitLab...',
          click: async () => {
            const result = await ouvrirCorpusGitLab(mainWindow);
            if (result && result.success) {
              mainWindow.webContents.send('afficher-corpus', result);
            }
          }
        },
   
  
         
         { type: 'separator' },
        {
          label: '💾 Enregistrer corpus',
          click: () => { // Envoyer un message au renderer
          mainWindow.webContents.send('demander-sauvegarde');
         } 
        },
          { type: 'separator' },
       
      {
        label: '🪂 Faire une copie de sauvegarde du corpus (ZIP)',
          click: async () => {
          await archiverCorpus();
        }
      },
       
        
        { type: 'separator' },
        { 
          label: 'Quitter', 
          role: 'quit'  
          
        }
      ]
    },

   
    { // menu entretiens
      label: 'Entretiens',
      submenu: [
        { 
          label: 'Ajouter un entretien',
          click: () => mainWindow.webContents.send('menu:ajouter-entretien') 
        },
       
        { type: 'separator' },
      
        { 
          label: 'Trier les entretiens',
          submenu: [
            { label: 'Par ordre alphabétique', click: () => mainWindow.webContents.send('menu:tri-entretiens', 'alpha') },
            { label: 'Par ordre d\'ajout', click: () => mainWindow.webContents.send('menu:tri-entretiens', 'ordre-ajout') },
            { label: 'Par date de modification', click: () => mainWindow.webContents.send('menu:tri-entretiens', 'date-modification') },
            { label: 'Par longueur', click: () => mainWindow.webContents.send('menu:tri-entretiens', 'longueur') }
          ]
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
       
         
      
 
      ]
    },
     /*
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
  if (gitlabAPI) gitlabAPI.nettoyerTousLesVerrous();
});

app.on('window-all-closed', async () => {
  if (serveurAPI) await serveurAPI.nettoyerTousLesVerrous();
  if (gitlabAPI) gitlabAPI.nettoyerTousLesVerrous();
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

