////////////////////////////////////////////////////////////////////////
// EXPORT DU DOCUMENT ANONYMISÉ (texte final : txt / word / srt / html)
//
// Extrait de anon-import_export.js (refacto) sans changement de comportement.
// Produit le DOCUMENT exporté (le texte avec les pseudonymes appliqués), à distinguer de
// la table de correspondance (les règles entité↔pseudo, restée dans anon-correspondance).
//
// Dépend de getNbSpans (segmentation.js), exportThmcss (thematisation.js), effaceSel/effaceSurv
// (segmentation.js) et de globaux runtime de l'entretien. Chargé UNIQUEMENT dans
// edition_entretien.html — seule fenêtre où ces fonctions étaient disponibles auparavant.
////////////////////////////////////////////////////////////////////////

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
                // Point de passage unique (plan-locuteurs-pseudo.md Étape 0) : repli = nom réel tant
                // que la pseudonymisation du libellé n'existe pas → sortie inchangée aujourd'hui.
                let loc = nomLocAffiche(locuteur_courant, { anonymise: true });
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
            // Borne l'extraction au SEGMENT courant : sinon l'extracteur consomme tout le document
            // d'un coup et la boucle locuteur/segment (ci-dessus) ne tourne qu'une fois → étiquettes
            // de locuteur et séparation des segments perdues. On s'arrête au dernier span contigu de
            // même data-sg, sans dépasser rgFin.
            const indexFinGlobal = tousLesSpans.findIndex(s => s.dataset.rk == rgFin);
            let indexFinSeg = indexActuel;
            while (indexFinSeg + 1 < tousLesSpans.length
                   && (indexFinGlobal === -1 || indexFinSeg + 1 <= indexFinGlobal)
                   && tousLesSpans[indexFinSeg + 1].dataset.sg == rgseg) {
                indexFinSeg++;
            }
            const resultat = extraireTexteAnonymiseDepuisSpans(tousLesSpans, indexActuel, indexFinSeg);

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

    // ANONYMISATION DES LIBELLÉS (plan-locuteurs-pseudo.md) : le bloc loc-json ne doit pas fuiter les
    // vrais noms. Pour chaque locuteur pseudonymisé (libellé confirmé OU suggéré), on sérialise le
    // PSEUDO (nomLocAffiche) ; le statut interrogateur « ? » est préservé. Locuteur sans pseudo (ou
    // refusé) → nom réel (relève du garde-fou export, non traité ici).
    const locAnonymise = (locut || []).map((nom, i) => {
        if (!nom) return nom;
        const estQ = String(nom).endsWith('?');
        const aff = (typeof nomLocAffiche === 'function')
            ? nomLocAffiche(i, { anonymise: true })
            : String(nom).replace(/\?/g, '');
        return estQ ? aff + '?' : aff;
    });
    const locJSON = JSON.stringify(locAnonymise, null);
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
    let segmentsAnonymises = AnonymiserSegments();

    // sauvegarde du contenu HTML principal
    contenuHtml +=` <div id="contenuText"> 
     `

    contenuHtml += segmentsAnonymises  

    contenuHtml +=` 
</div></body>`

    return contenuHtml;
}

/**
 * Génère le HTML des segments avec texte anonymisé mais sans les classes/attributs d'anonymisation.
 * Le texte est DÉFINITIVEMENT remplacé par les pseudonymes (version irréversible pour le partage) :
 * - run anonymisé (debsel.anon … finsel.anon) → remplacé par « [pseudo] » (pseudo lu sur le finsel →
 *   gère le multi-pseudo par occurrence) ; les spans absorbés (incluses, .anon nus internes) sont
 *   couverts par le run large et vidés ;
 * - exception (.anon-exception) → texte original conservé, classe retirée ;
 * - « à anonymiser » (data-anon-nt) → texte original conservé (non anonymisé), attribut retiré.
 * La STRUCTURE des segments (data-rk/data-sg/data-deb…) est préservée → le fichier reste réouvrable.
 * @returns {string} Le HTML des segments anonymisés
 */
function AnonymiserSegments() {
    const segmentsEl = document.getElementById('segments');
    if (!segmentsEl) return '';
    // LIBELLÉS de locuteurs : sur un CLONE (sans toucher le DOM live), remplacer data-nomloc par le nom
    // AFFICHÉ anonymisé et retirer les marqueurs runtime — sinon le vrai nom fuiterait via le ::before
    // du libellé dans le fichier partagé. Cœur partagé _anonymiserLiglocsDansElement (anon-regles.js).
    const clone = segmentsEl.cloneNode(true);
    _anonymiserLiglocsDansElement(clone);
    // Cœur partagé _anonymiserHtml (anon-regles.js) : remplace chaque run par « [pseudo] », garde
    // exceptions/à-traiter en clair, préserve la structure. (cf. anon.md §8)
    return _anonymiserHtml(clone.innerHTML);
}

