const { contextBridge, ipcRenderer } = require('electron');
const { webUtils } = require('electron');
// Les modules ne doivent PAS être exposés directement au renderer
// Le renderer doit utiliser IPC pour communiquer avec main.js
// qui lui utilisera les modules

// exposition des fonctions du Main
contextBridge.exposeInMainWorld('electronAPI', {

  // sélection de fichiers et dossiers
  openFileCorpus: () => ipcRenderer.invoke('dialog:openCorpus'),
  ouvrirCorpusLocal: (filePath) => ipcRenderer.invoke('ouvrir-corpus-local', filePath),
  selectTextFiles: () => ipcRenderer.invoke('dialog:openTextFiles'),
  selectAudioFiles: () => ipcRenderer.invoke('dialog:openAudioFiles'),
  sendResult: (data) => ipcRenderer.send('ajout-entretien-result', data),
  // récupération du chemin (pour drag & drop) 
  getFilePaths: (files) => {
    return files.map(file => webUtils.getPathForFile(file));
  },

  // création d'un nouveau corpus
  créerNouveauCorpus: () => ipcRenderer.invoke('nouveau-corpus'),
  
    // ouvrir les fichiers audio
  loadAudioFile: (filePath) => ipcRenderer.invoke('load-audio-file', filePath),
  loadAudioSamplesFfmpeg: (filePath, samplingInterval) => ipcRenderer.invoke('load-audio-samples-ffmpeg', filePath, samplingInterval),

  // Fonctions de gestion des fichiers
  readFileContent: (filePath) => ipcRenderer.invoke('file:readContent', filePath),
  getFileMetadata: (filePath) => ipcRenderer.invoke('file:getMetadata', filePath),
  doesFileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  getLastModified: (filePath) => ipcRenderer.invoke('file:lastModified', filePath),
  getDir: (filePath) => ipcRenderer.invoke('file:getPath', filePath),
  createPath: (...args) => ipcRenderer.invoke('file:createPath', ...args),
  // Pour soumettre les données de l'URL
  submitURL: (data) => ipcRenderer.send('url-saisie-submit', data),
  // Écouter le pré-remplissage de l'URL
  onPreFillUrl: (callback) =>
    ipcRenderer.on('pre-fill-url', (event, url) => callback(url)),
  
 // pour récupérer le contenu d'un fichier corpus
  onAfficherCorpus: (callback) => 
    ipcRenderer.on('afficher-corpus', (event, donnees) => callback(donnees)),

  // pour récupérer le contenu d'un fichier corpus JSON
  onAfficherCorpusJSON: (callback) => 
    ipcRenderer.on('afficher-corpus-json', (event, donnees) => callback(donnees)),

  // gestion de la modale d'ajout d'entretien ---
  ajouterEntretien: () => ipcRenderer.invoke('ajout-entretien'), 

  

  // wrapper invoke générique + helpers set/get pour fich/doss ---
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Mettre à jour et récupérer le corpus
  setCorpus: (corpus) => ipcRenderer.invoke('set-corpus', corpus),
  getCorpus: () => ipcRenderer.invoke('get-corpus'),
  getCorpusContent: () => ipcRenderer.invoke('get-corpus-content'),

  // mettre à jour et récupérer le tabThm
  setThm: (tabThm) => ipcRenderer.invoke('set-thm', tabThm),
  getThm: () => ipcRenderer.invoke('get-thm'),

  // mettre à jour et récupérer le tabEnt
  setEnt: (tabEnt) => ipcRenderer.invoke('set-ent', tabEnt),
  getEnt: () => ipcRenderer.invoke('get-ent'),

  // mettre à jour et récupérer les locuteurs importés (tabLoc)
  setTabLoc: (tabLoc) => ipcRenderer.invoke('set-tabloc', tabLoc),
  getTabLoc: () => ipcRenderer.invoke('get-tabloc'),

  // mettre à jour et récupérer les variables
  setVar: (tabVar) => ipcRenderer.invoke('set-var', tabVar),
  getVar: () => ipcRenderer.invoke('get-var'),

  setDic: (tabDic) => ipcRenderer.invoke('set-dic', tabDic),
  getDic: () => ipcRenderer.invoke('get-dic'),

  setDat: (tabDat) => ipcRenderer.invoke('set-dat', tabDat),
  getDat: () => ipcRenderer.invoke('get-dat'),

  // mettre à jour et récupérer le contenu html des entretiens
  setHtml: (rk, tabHtml) => ipcRenderer.invoke('set-html', rk, tabHtml),
  getHtml: (rk) => ipcRenderer.invoke('get-html', rk),

  // mettre à jour et récupérer le tableau des graphismes
  setGrph: (rk, tabGrph) => ipcRenderer.invoke('set-grph', rk, tabGrph),
  getGrph: (rk) => ipcRenderer.invoke('get-grph', rk),

  // mettre à jour et récupérer l'entretien courant
  setEntCur: (ent_cur) => ipcRenderer.invoke('set-ent_cur', ent_cur),
  getEntCur: () => ipcRenderer.invoke('get-ent_cur'),

  // mettre à jour et récupérer l'utilisateur
  setUser: (user) => ipcRenderer.invoke('set-user', user),
  getUser: () => ipcRenderer.invoke('get-user'),

  // Fonction pour envoyer les logs au main process (DÉSACTIVÉE)
  // log: (level, message) => ipcRenderer.invoke('log', level, message),

  // Sauvegarder le corpus
  sauvegarderFichier: (filePath, content) => ipcRenderer.invoke('sauvegarder-fichier', filePath, content),

  // Boîte de dialogue "Enregistrer sous"
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),

  // Sauvegarder sur le serveur
  sauvegarderSurServeur: (cheminFichier, contenu) => 
    ipcRenderer.invoke('sauvegarder-sur-serveur', cheminFichier, contenu),
  
  sauvegarderAvecBackup: (cheminFichier, contenu) =>
    ipcRenderer.invoke('sauvegarder-avec-backup', cheminFichier, contenu),
  
  // Écouter les demandes de sauvegarde
  onDemanderSauvegarde: (callback) =>
    ipcRenderer.on('demander-sauvegarde', () => callback()),
  
  onDemanderSauvegardeBackup: (callback) =>
    ipcRenderer.on('demander-sauvegarde-backup', () => callback()),

  // Écouter les notifications de fichier verrouillé
  onFichierLectureSeule: (callback) =>
    ipcRenderer.on('fichier-lecture-seule', (event, data) => callback(data)),

  // Ecoute personnalisée pour rafraîchir les thématiques
  onThematisationRefresh: (callback) =>
    ipcRenderer.on('thematisation:refresh', (event, data) => callback(data)),
  

  ////////////////////////////////////////////////////////////////////////////
  // CATEGORIES
  ///////////////////////////////////////////////////////////////////////////

  afficherCategories: () => ipcRenderer.invoke('afficher-categories'),
  ajouterCategorie: () => ipcRenderer.invoke('ajouter-categorie'),
  editerCategorie: () => ipcRenderer.invoke('editer-categorie'),
  validerCategorie: (data) => ipcRenderer.send('valider-categorie', data),
  supprimerCategorie: (id) => ipcRenderer.send('supprimer-categorie', id),
  
  // Écouter le signal de rafraîchissement du canvas
  onUpdateCat: (callback) =>
    ipcRenderer.on('update-cat', (event, data) => callback(data)),
  

  
  ////////////////////////////////////////////////////////////////////////////
  // ENTRETIEN
  ///////////////////////////////////////////////////////////////////////////
  
  isEntretienLocked: (rk) => ipcRenderer.invoke('entretien-locked', rk),
  editerEntretien: (rk) => ipcRenderer.invoke('editer-entretien', rk),

  // Écouter la demande du menu pour ajouter un entretien
  onMenuAjouterEntretien: (callback) =>
    ipcRenderer.on('menu:ajouter-entretien', () => callback()),

  // Écouter la demande du menu pour trier les entretiens
  onMenuTriEntretiens: (callback) =>
    ipcRenderer.on('menu:tri-entretiens', (event, mode) => callback(mode)),

  // Écouter le signal de fermeture de la fenêtre
  onSaveAndClose: (callback) =>
    ipcRenderer.on('save-and-close', () => callback()),
  
  // Confirmer la fin de sauvegarde au main process
  saveComplete: () => ipcRenderer.invoke('save-complete'),

  // Demander la fermeture de la fenetre courante
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // Signal pour mettre à jour le canvas après sauvegarde
  updateCanvasAfterSave: (rkEnt) => ipcRenderer.invoke('update-canvas-after-save', rkEnt),
  
  // Écouter le signal de rafraîchissement du canvas
  onRefreshCanvas: (callback) =>
    ipcRenderer.on('refresh-canvas', (event, rkEnt) => callback(rkEnt)),

  

});


contextBridge.exposeInMainWorld('recentFiles', {
  getAll: () => ipcRenderer.invoke('get-recent-files'),
  add: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  remove: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  clear: () => ipcRenderer.invoke('clear-recent-files'),
  openDialog: () => ipcRenderer.invoke('open-file-dialog'),
  updateMenu: () => ipcRenderer.invoke('update-recent-files-menu'),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data))
});

