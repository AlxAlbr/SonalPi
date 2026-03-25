//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FONCTIONS UTILITAIRES
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// fonction de sélection des segments d'après leur rang
function getSeg(sg) {

    let chaine = `[data-rksg="`+ sg + `"]`
    const conteneur = document.querySelector(chaine);
    return conteneur;
    
    
    
}

// fonction de sélection des mots d'après leur rang
function getSpan(sg) {

    let chaine = `[data-rk="`+ sg + `"]`
    const conteneur = document.querySelector(chaine);
    //console.log("cont : " + conteneur)
    return conteneur;


}


// récupération du rang d'entretien à partir de son identifiant
async function getRkEnt(entId) {

    let tabEnt = await window.electronAPI.getEnt();
    let rkEnt = tabEnt.findIndex(tabEnt => tabEnt.id === entId);
    
    if (rkEnt !== -1) {
        return rkEnt;
    }

  return -1; // Si non trouvé
}

// décompte des éléments du DOM d'un certain type, en excluant une classe donnée
function compterElements(conteneur, type, classeExclue) {

    return Array.from(conteneur.querySelectorAll(type))
                .filter(el => !el.classList.contains(classeExclue))
                .length;
}


// conversion de coordonnées en secondes en hh:mm;ss, avec ou sans décimales
function SecToTime(time,ssDec){ 

    time = Number(time);

    var nbhr = Math.floor(time / 3600);
    var nbmin = Math.floor((time - nbhr*3600)/60);
    var nbsec = Number(time - nbhr*3600 - nbmin * 60);  
    nbsec=nbsec.toFixed(3);

    if(ssDec==true){nbsec = Math.floor(nbsec)}

    nbhr = String(nbhr);
    nbmin = String(nbmin);
    nbsec = String(nbsec);
    
    
    
    

    return nbhr.padStart(2, "0") + ':' + nbmin.padStart(2, '0')  + ':' + nbsec.padStart(2, '0');


};

// conversion de données hh:mm:ss en secondes
function TimeToSec(time) { 

     
let sspart =  time.split(":");

let pas=0;
let secs = 0;


for (ss=sspart.length-1;ss>-1;ss--) {

     
    let valeur =  sspart[ss]
    valeur = valeur.replace(",",".") // remplacement des virgules par des points

    secs += Number(valeur * Math.pow(60,pas))
    
    pas++;

}

return secs;

}


// conversion d'une couleur VB6 (BGR) en code HTML (RVB)
function convertColor(vb6Color) {
  // Extraire les composantes rouge, vert et bleu
  const red = (vb6Color >> 16) & 0xFF; // Décalage de 16 bits et masque
  const green = (vb6Color >> 8) & 0xFF; // Décalage de 8 bits et masque
  const blue = vb6Color & 0xFF; // Masque pour la composante bleue

  // Convertir en code hexadécimal HTML
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

// conversion d'une couleur hexadécimale en RGBA avec alpha
function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(x => x + x).join('');
  }
  var r = parseInt(hex.substring(0,2), 16);
  var g = parseInt(hex.substring(2,4), 16);
  var b = parseInt(hex.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}


// conversion d'une couleur RGB en code HTML hexadécimal
function rgbToHex(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}


// Notification d'erreur visible pour l'utilisateur final (toast en bas à droite)
function notifErreur(message) {
    console.error("[notifErreur]", message);
    const div = document.createElement('div');
    div.className = 'notif-erreur';
    div.innerHTML = `<span class="notif-erreur-msg">&#9888; ${message}</span><button class="notif-erreur-close" title="Fermer">&times;</button>`;
    div.querySelector('.notif-erreur-close').addEventListener('click', () => div.remove());
    document.body.appendChild(div);
    setTimeout(() => { if (div.isConnected) div.remove(); }, 8000);
}

/////////////////////////////////////////////////////////////////////////////////:
// EXPORTATION DES FONCTIONS
/////////////////////////////////////////////////////////////////////////////////
// Export CommonJS pour utilisation dans main.js (contexte Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getSeg,
        getSpan,
        getRkEnt,
        compterElements,
        convertColor,
        rgbToHex,
        SecToTime,
        TimeToSec,
        hexToRgba,
        notifErreur
    };
}

// Export global pour utilisation dans le renderer (contexte navigateur)
if (typeof window !== 'undefined') {
    window.getSeg = getSeg;
    window.getSpan = getSpan;
    window.getRkEnt = getRkEnt;
    window.compterElements = compterElements;
    window.convertColor = convertColor;
    window.rgbToHex = rgbToHex;
    window.SecToTime = SecToTime;
    window.TimeToSec = TimeToSec;
    window.hexToRgba = hexToRgba;
    window.notifErreur = notifErreur;
}
