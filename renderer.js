// Dans le renderer avec contextIsolation, les modules sont chargés via <script>
// Les fonctions de gestion_corpus.js sont disponibles globalement
// car le fichier est chargé comme script dans index.html

 

let contenuModifie = false;

// Recevoir les données et afficher dans le DOM
window.electronAPI.onAfficherCorpus(async (resultat) => {

  if (!resultat || !resultat.success) {
    console.error('Erreur lors de la réception du corpus:', resultat ? resultat.error : 'Résultat invalide');
    return;
  }

  
  
  let Corpus = await window.electronAPI.getCorpus();

   
  console.log("URL : " + Corpus.url + " \n dossier : " + Corpus.folder    )

  document.title = Corpus.url;

 // document.getElementById('nomCorpus').textContent = 'Fichier: ' + Corpus.fileName;
 // document.getElementById('cheminCorpus').textContent = `Chemin: ${Corpus.folder}`;

  window.recentFiles.add(Corpus.url); // mémorisation de l'ouverture du corpus


    

  lireCorpus(Corpus.content);  // lecture du fichier crp ()
 

  
 
});



// Recevoir les données et afficher dans le DOM un corpus JSON (pour les sauvegardes exportées)
window.electronAPI.onAfficherCorpusJSON(async (resultat) => {

console.log("Affichage du corpus JSON reçu...");

  if (!resultat || !resultat.success) {
    console.error('Erreur lors de la réception du corpus:', resultat ? resultat.error : 'Résultat invalide');
    return;
  }
  
     

  
  let Corpus = await window.electronAPI.getCorpus();
  let tabEnt = await window.electronAPI.getEnt(); 
  let tabThm = await window.electronAPI.getThm();
   
  console.log("URL : " + Corpus.url + " \n dossier : " + Corpus.folder    )

  document.title = "SAUVEGARDE DU CORPUS : " + Corpus.url;
  Corpus.type = "sauvegarde"; // marquer le corpus comme sauvegarde (pour éviter les confusions avec un corpus normal)

  loadThm(tabThm); // création des classes css
  affichListThmCrp(tabThm, 'conteneur_cat') // affichage de la liste des thématiques;


  afficherEnt(0,Number(tabEnt.length-1));
  inventaireVariables(); // inventaire des variables utilisées dans les entretiens
 
});
 


/**
 * Écouteurs pour les demandes du menu
 */
window.electronAPI.onDemanderSauvegarde(async () => {
  await sauvegarderCorpus(false);
});

window.electronAPI.onDemanderSauvegardeBackup(async () => {
  await sauvegarderCorpus(true);
});

window.electronAPI.onMenuAjouterEntretien(() => ajouterEntretien());
window.electronAPI.onMenuTriEntretiens((mode) => triEntCorpus(mode));
 

/**
 * Bouton de sauvegarde dans l'interface
 */
document.getElementById('btn-sauvegarder')?.addEventListener('click', async () => {
  await sauvegarderCorpus(false);
});

 

/**
 * Raccourci clavier Ctrl+S (en plus du menu)
 */
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    await sauvegarderCorpus(false);
  }
});

/**
 * Afficher une notification
 */
function afficherNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Avertir avant fermeture si modifications non sauvegardées
window.addEventListener('beforeunload', (e) => {
  if (contenuModifie) {
    e.returnValue = 'Vous avez des modifications non sauvegardées';
    return e.returnValue;
  }
});

window.sauvegarderCorpus = sauvegarderCorpus;

/*
// Quand vous recevez l'info "lecture seule"
ipcRenderer.on('fichier-lecture-seule', (event, data) => {
 
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = `🔒 Lecture seule (${data.lockedBy.user})`;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);

 
 
});

ipcRenderer.on('fichier-editable', () => {
  document.getElementById('badge-lecture-seule').style.display = 'none';
  document.getElementById('btn-sauvegarder').disabled = false;
});
*/






