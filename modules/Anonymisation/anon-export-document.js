////////////////////////////////////////////////////////////////////////
// EXPORT DU DOCUMENT ANONYMISÉ (texte final : txt / word / srt / html)
//
// Extrait de anon-import_export.js (todo2.md, Étape 0) sans changement de comportement.
// Produit le DOCUMENT exporté (le texte avec les pseudonymes appliqués), à distinguer de
// la table de correspondance (les règles entité↔pseudo, restée dans anon-correspondance).
//
// Dépend de getNbSpans (segmentation.js), exportThmcss (thematisation.js), effaceSel/effaceSurv
// (segmentation.js) et de globaux runtime de l'entretien. Chargé UNIQUEMENT dans
// edition_entretien.html — seule fenêtre où ces fonctions étaient disponibles auparavant.
////////////////////////////////////////////////////////////////////////

/**
 * Export txt avec anonymisations/pseudonymisations appliquées
 * Utilise le texte affiché (qui inclut les classes CSS anon et anon-exception)
 */
function exportTxtAvecAnonymisation(){
    let nbspans = getNbSpans();
    let rgDeb = 1;
    let rgFin = nbspans;

    let detailsf = dossfichext(nomFichText);
    
    // Extraire le texte avec les anonymisations appliquées
    let txtAnonymise = exportTxtAvecClasses(rgDeb, rgFin, true);
    
    SauvegarderSurDisque(txtAnonymise, detailsf[1] + "_anonymise.txt", "UTF-8");
}

/**
 * Extrait le texte d'un ensemble de spans en appliquant les anonymisations
 * Fonction utilitaire réutilisable pour tous les exports
 * @param {NodeList|Array} spans - Liste des spans à traiter
 * @param {number} startIndex - Index de départ dans la liste
 * @param {number} endIndex - Index de fin (optionnel, traite tous si non spécifié)
 * @returns {Object} {texte: string, nextIndex: number} - Le texte extrait et l'index suivant
 */
function extraireTexteAnonymiseDepuisSpans(spans, startIndex, endIndex = null) {
    let texteExtrait = "";
    let i = startIndex;
    const maxIndex = endIndex !== null ? endIndex : spans.length - 1;
    
    while (i <= maxIndex && i < spans.length) {
        const span = spans[i];
        
        if (!span) {
            i++;
            continue;
        }
        
        // Si c'est une anonymisation (classe 'anon')
        if (span.classList.contains('anon')) {
            // Chercher le pseudo du dernier span de cette anonymisation
            let pseudo = span.dataset.pseudo;
            
            // Parcourir jusqu'au finsel pour trouver le pseudo
            let j = i;
            while (j <= maxIndex && j < spans.length) {
                const nextSpan = spans[j];
                if (nextSpan && nextSpan.classList.contains('finsel') && nextSpan.classList.contains('anon')) {
                    pseudo = nextSpan.dataset.pseudo || pseudo || span.textContent;
                    i = j + 1; // Avancer après le finsel
                    break;
                }
                j++;
            }
            
            // Ajouter le pseudo entre crochets
            texteExtrait += "[" + (pseudo || span.textContent) + "]";
        }
        // Si c'est une exception (anon-exception)
        else if (span.classList.contains('anon-exception')) {
            // Parcourir jusqu'au finsel pour récupérer tout le texte original
            let texteException = span.textContent;
            
            if (!span.classList.contains('finsel')) {
                let j = i + 1;
                while (j <= maxIndex && j < spans.length) {
                    const nextSpan = spans[j];
                    texteException += nextSpan.textContent;
                    if (nextSpan && nextSpan.classList.contains('finsel') && nextSpan.classList.contains('anon-exception')) {
                        i = j + 1;
                        break;
                    }
                    j++;
                }
            } else {
                i++;
            }
            
            texteExtrait += texteException;
        }
        // Sinon, texte normal
        else {
            texteExtrait += span.textContent;
            i++;
        }
    }
    
    return { texte: texteExtrait, nextIndex: i };
}

/**
 * Extraction du texte avec les anonymisations/pseudonymisations
 * Remplace les spans anonymisés par leur pseudo (ou texte original pour exceptions)
 */
function exportTxtAvecClasses(rgDeb, rgFin, avecLoc){
    var txtAnonymise = "";    
    var locuteur_courant = -1;
    var segment_courant = -1;
    var i = rgDeb;

    while (i <= rgFin){
        let span = document.querySelector('[data-rk="'+i+'"]');
        if (!span) {i++; continue;}

        let rgseg = span.dataset.sg; 
        if (!rgseg) {i++; continue;}

        let seg = getSeg(rgseg);
        if (!seg) {i++; continue;}

        if (avecLoc == true){
            // ajout du locuteur si changement
            if (locuteur_courant != seg.dataset.loc){
                locuteur_courant = seg.dataset.loc;
                let loc = locut[locuteur_courant].replaceAll("?","") ;
                if (loc) {txtAnonymise += "\r\n \r\n" + loc + " : \r\n";}
                segment_courant = -1; // Réinitialiser le segment car nouveau locuteur
            }
        }

        // Ajouter un espace si on change de segment (même locuteur)
        if (segment_courant !== -1 && segment_courant != rgseg) {
            txtAnonymise += " ";
        }
        segment_courant = rgseg;

        // Utiliser la fonction commune pour extraire le texte anonymisé
        // On crée un pseudo-tableau avec le span courant pour compatibilité
        const tousLesSpans = Array.from(document.querySelectorAll('[data-rk]'));
        const indexActuel = tousLesSpans.findIndex(s => s.dataset.rk == i);
        
        if (indexActuel !== -1) {
            const indexFin = tousLesSpans.findIndex(s => s.dataset.rk == rgFin);
            const resultat = extraireTexteAnonymiseDepuisSpans(tousLesSpans, indexActuel, indexFin);
            
            if (resultat.texte) {
                txtAnonymise += resultat.texte;
            }
            
            // Mettre à jour i en fonction du prochain index
            const prochainSpan = tousLesSpans[resultat.nextIndex];
            i = prochainSpan ? parseInt(prochainSpan.dataset.rk) : rgFin + 1;
        } else {
            i++;
        }
    }

    return txtAnonymise;
}

/**
 * Exporte le document Word avec anonymisation/pseudonymisation appliquée
 * Similaire à exportWord() mais utilise le texte anonymisé
 */
function exportWordAvecAnonymisation(){

    // Basculement du html en tableau
    HTMLTOTABSEG()

    let txtobs = document.getElementById("txtnotes").value
     
    const doc = new docx.Document({


    sections: [
     {
    properties: {


    },
    children: [
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: nomFichText,
            bold: true
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "",
            bold: true
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "Exporté par whispurge : www.sonal-info.com/whispurge.html", 
           italics : true
          }),
     ]
      }),

      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "", 
            
          }),
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "---", 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "", 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "Notes : " + txtobs, 
            
          })
     ]
      }),
      new docx.Paragraph({
        children: [
           
          new docx.TextRun({
            text: "---" , 
            
          })
     ]
      }),
    ]
  }
]

});

  


for (s=0;s<TabSeg.length;s++){

// défintion du locuteur

var loc = "" 
if (locut[TabSeg[s][3]]){loc= locut[TabSeg[s][3]]}
var changeloc = false
if (s>0 && TabSeg[s][3]!=TabSeg[s-1][3]) {
    changeloc = true 
}

if (s==0) {changeloc = true }

var italouinon=false
// italouinon
if (loc.indexOf("?")>-1){italouinon=true}
loc = loc.replaceAll("?","") ;
loc += " : ";

// ajout de la position chronométrique
let posit = TabSeg[s][1]
if (posit) {loc += SecToTime(TabSeg[s][1],true)};

// ajout du locuteur
if (changeloc==true){
    doc.addSection({
    properties: {
            type: docx.SectionType.CONTINUOUS
            },

    children: [ 
    new docx.Paragraph({
        children: [
            new docx.TextRun({
            text: "",
            }),
            
        ],
        }),
        new docx.Paragraph({
        children: [
            new docx.TextRun({
            text: loc,
            italics: italouinon,
            }),
            
        ],
        }),
    ],
    })
}

// Récupération du texte du segment avec anonymisation appliquée
let texteSegment = obtenirTexteSegmentAnonymise(s);

// ajout du texte
doc.addSection({
properties: {
           type: docx.SectionType.CONTINUOUS
        },

  children: [ 
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: texteSegment,
          italics: italouinon,
           
        }),
      ],
    }),
  ],
})

}


docx.Packer.toBlob(doc).then((blob) => {
console.log("Blob créé:", blob);

// Génération du nom de fichier
let nomFichier = "transcription"; // Nom par défaut

if (typeof nomFichText !== 'undefined' && nomFichText) {
    let detailsf = dossfichext(nomFichText);
    nomFichier = detailsf[1]; // Récupère le nom sans extension
    console.log("Nom extrait:", nomFichier);
}

const nomComplet = nomFichier + "_anonymise.docx";
console.log("Nom de fichier final:", nomComplet);

// Utilisation de la méthode native du navigateur (plus fiable que FileSaver.js)
const url = window.URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = nomComplet;
link.style.display = 'none';
document.body.appendChild(link);
link.click();

// Nettoyage après un court délai
setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    console.log("Document exporté:", nomComplet);
}, 100);
});




}

/**
 * Obtient le texte d'un segment avec les anonymisations appliquées
 * @param {number} indexSegment - L'index du segment dans TabSeg
 * @returns {string} Le texte du segment avec anonymisations
 */
function obtenirTexteSegmentAnonymise(indexSegment) {
    // Récupérer le segment HTML correspondant
    const segments = document.querySelectorAll('.lblseg');
    const segment = segments[indexSegment];
    
    if (!segment) {
        return TabSeg[indexSegment][4]; // Retourner le texte brut si segment non trouvé
    }
    
    // Parcourir tous les spans du segment et utiliser la fonction commune
    const spans = segment.querySelectorAll('span');
    const resultat = extraireTexteAnonymiseDepuisSpans(spans, 0);
    
    return resultat.texte;
}

/**
 * Exporte le fichier SRT avec anonymisation/pseudonymisation appliquée
 */
function exportSrtAvecAnonymisation(){

    var txtSrt;
    txtSrt ="";
    var loc_cur = -1; // mémorisation du locuteur
    
    if (TabSeg.length<1){
        console.log("pas de tabseg")
        HTMLTOTABSEG()
    }

    for (s=0;s<TabSeg.length;s++){

        txtSrt += (s+1) + "\r"
         
        let tpsdeb = Number(TabSeg[s][1]);
        if (tpsdeb !=undefined)  {
            tpsdeb = SecToTime(tpsdeb,false)
            tpsdeb = tpsdeb.replaceAll(".",",")
        };

        let tpsfin = Number(TabSeg[s][2]);
        if (tpsfin !=undefined) { 
            tpsfin = SecToTime(tpsfin,false) 
            tpsfin = tpsfin.replaceAll(".",",")
        };

        txtSrt += tpsdeb + " --> " + tpsfin + "\r"

        // Ajout du locuteur
        loc_cur = TabSeg[s][3]
        let loc = locut[loc_cur].replaceAll("?","") ;   
        if (loc) {txtSrt += loc + " : ";}
        
        // Récupération du texte du segment avec anonymisation appliquée
        let txt = obtenirTexteSegmentAnonymise(s);
        
        txtSrt +=  txt +  "\r \r"
    }
 
    let detailsf = dossfichext(nomFichText)

    SauvegarderSurDisque(txtSrt, detailsf[1] + "_anonymise.srt", "UTF-8")
}

/**
 * Génère le contenu HTML du fichier .Sonal avec texte anonymisé mais SANS la table d'anonymisation
 * Version anonymisée irréversible destinée au partage
 * @returns {string} Le contenu HTML anonymisé
 */
function sauvHtmlAnonymise(){

    var contenuHtml =`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fichier Whispurge (Version anonymisée)</title>
   <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet"  type="text/css">  
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous"> 
   
   `

    const locJSON = JSON.stringify(locut, null);
    const thmJSON = JSON.stringify(tabThm,null)
    const varJSON = JSON.stringify(tabVar,null)
    const dicJSON = JSON.stringify(tabDic,null)
    const datJSON = JSON.stringify(tabDat,null)
    // PAS d'export de tabAnon - c'est le point clé de cette fonction

    contenuHtml += exportThmcss();

    contenuHtml += `</head>
 
<body>
`
    // sauvegarde des locuteurs
    contenuHtml += `<script id="loc-json" type="application/json">
        
            ` + locJSON + `         
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="cat-json" type="application/json">
        
            
            ` + thmJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="var-json" type="application/json">
        
            ` + varJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="dic-json" type="application/json">
           
            ` + dicJSON + `          
        
<`+ `/script> 
`;  

    contenuHtml += `<script id="dat-json" type="application/json">
           
            ` + datJSON + `          
        
<`+ `/script> 
`; 

    // PAS de sauvegarde de l'anonymisation - table vide
    contenuHtml += `<script id="anon-json" type="application/json">
           
            []          
        
<`+ `/script> 
`;

    // sauvegarde des notes
    let notes = document.getElementById('txtnotes').value ;
    contenuHtml +=`
    <div style="margin-bottom: 5px !important; 
	margin-bottom: 5px !important;
	margin: 40px;"
	>

    <H2 > Notes</H2>
    
        <div id="txtnotes">
        ` + notes + `
        </div>
    </div>
    `; 

    // suppression du menu contextuel 
    const oldMenu = document.getElementById("contextMenu")
    if (oldMenu) {oldMenu.remove()}

    // suppression des surlignements
    effaceSel();
    effaceSurv();

    // Générer le contenu avec texte anonymisé
    let segmentsAnonymises = AnonymiserSegments(contenuHtml);

    // sauvegarde du contenu HTML principal
    contenuHtml +=` <div id="contenuText"> 
     `

    contenuHtml += segmentsAnonymises  

    contenuHtml +=` 
</div></body>`

    return contenuHtml;
}

/**
 * Génère le HTML des segments avec texte anonymisé mais sans les classes/attributs d'anonymisation
 * Le texte est définitivement remplacé par les pseudonymes
 * @returns {string} Le HTML des segments anonymisés
 */

