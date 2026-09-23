////////////////////////////////////////////////////////////////////////
// EXPORT DU DOCUMENT ANONYMISÉ (texte final : txt / word / srt / html)
//
// Extrait de anon-import_export.js (refacto) sans changement de comportement.
// Produit le DOCUMENT exporté (le texte avec les pseudonymes appliqués), à distinguer de
// la table de correspondance (les règles entité↔pseudo, restée dans anon-correspondance).
//
// Dépend de getNbSpans (segmentation.js), exportThmcss (thematisation.js), effaceSel/effaceSurv
// (segmentation.js) et de globaux runtime de l'entretien. Le noyau d'extraction bornée est aussi
// chargé dans index.html afin que les exports de synthèse partagent exactement les mêmes garanties.
////////////////////////////////////////////////////////////////////////

/**
 * Construit une erreur d'extraction sans recopier le texte sensible dans le message.
 */
function erreurExtractionAnonymisee(code) {
    const error = new Error(
        "Extraction anonymisée interrompue : marquage de pseudonymisation incomplet ou incohérent. " +
        "Vérifiez les occurrences dans l'entretien avant de recommencer."
    );
    error.name = 'ErreurExtractionAnonymisee';
    error.code = code;
    return error;
}

/**
 * Retrouve le run structurel contenant un span `.anon`.
 *
 * La recherche porte sur la liste COMPLÈTE fournie, et non sur les seules bornes d'extraction :
 * une copie ou un export par segment peut couper un run valide. Les spans d'espacement neutres
 * sont admis à l'intérieur d'un run, comme dans le validateur des exports définitifs.
 */
function trouverRunAnonPourExtraction(spans, index) {
    const courant = spans[index];
    if (!courant || !courant.classList || !courant.classList.contains('anon')) {
        throw erreurExtractionAnonymisee('SPAN_ANON_ATTENDU');
    }

    const estAnon = span => !!span && !!span.classList && span.classList.contains('anon');
    const estNeutre = span => !!span && !estAnon(span)
        && !(span.classList && span.classList.contains('anon-exception'))
        && !(span.textContent || '').trim();

    // Remonter jusqu'au debsel du run. Un finsel antérieur ferme nécessairement un autre run.
    let debut = -1;
    for (let j = index; j >= 0; j--) {
        const span = spans[j];
        if (j < index && estAnon(span) && span.classList.contains('finsel')) break;
        if (estAnon(span) && span.classList.contains('debsel')) {
            debut = j;
            break;
        }
        if (!estAnon(span) && !estNeutre(span)) break;
    }
    if (debut < 0) throw erreurExtractionAnonymisee('DEBUT_ANON_ABSENT');

    // Le premier finsel ferme le run. Un nouveau debsel ou du texte clair avant lui est incohérent.
    let fin = -1;
    for (let j = debut; j < spans.length; j++) {
        const span = spans[j];
        if (j > debut && estAnon(span) && span.classList.contains('debsel')) break;
        if (!estAnon(span) && !estNeutre(span)) break;
        if (estAnon(span) && span.classList.contains('finsel')) {
            fin = j;
            break;
        }
    }
    if (fin < index) throw erreurExtractionAnonymisee('FIN_ANON_ABSENTE');

    const pseudoDebut = (spans[debut].dataset.pseudo || '').trim();
    const pseudoFin = (spans[fin].dataset.pseudo || '').trim();
    if (!pseudoDebut && !pseudoFin) throw erreurExtractionAnonymisee('PSEUDO_ABSENT');
    if (pseudoDebut && pseudoFin && pseudoDebut !== pseudoFin) {
        throw erreurExtractionAnonymisee('PSEUDOS_INCOHERENTS');
    }

    return { debut, fin, pseudo: pseudoFin || pseudoDebut };
}

/**
 * Extrait une plage d'une liste COMPLÈTE de spans en appliquant les anonymisations.
 *
 * Une plage bornée qui intersecte un run `.anon` produit exactement une fois le pseudo dans cette
 * plage, même si debsel ou finsel est hors des bornes. Une `.anon-exception` conserve simplement son
 * texte : les exceptions n'ont, par conception, ni debsel ni finsel. Un run réellement incomplet
 * ou sans pseudo lève une erreur ; le texte original n'est jamais utilisé comme pseudo de secours.
 *
 * @param {NodeList|Array} spans - Liste complète et ordonnée des spans du document
 * @param {number} startIndex - Index inclusif de début de la plage
 * @param {number|null} endIndex - Index inclusif de fin (toute la liste si omis)
 * @returns {{texte:string, nextIndex:number}}
 */
function extraireTexteAnonymiseDepuisSpans(spans, startIndex, endIndex = null) {
    const tousLesSpans = Array.from(spans || []);
    if (tousLesSpans.length === 0) return { texte: '', nextIndex: 0 };

    let i = Number.isFinite(Number(startIndex)) ? Math.max(0, Number(startIndex)) : 0;
    const maxIndexDemande = endIndex === null || endIndex === undefined
        ? tousLesSpans.length - 1
        : Number(endIndex);
    const maxIndex = Number.isFinite(maxIndexDemande)
        ? Math.min(tousLesSpans.length - 1, maxIndexDemande)
        : tousLesSpans.length - 1;
    if (i > maxIndex) return { texte: '', nextIndex: i };

    let texteExtrait = '';
    while (i <= maxIndex) {
        const span = tousLesSpans[i];
        if (!span) {
            i++;
            continue;
        }

        const estAnon = !!span.classList && span.classList.contains('anon');
        const estException = !!span.classList && span.classList.contains('anon-exception');
        if (estAnon && estException) throw erreurExtractionAnonymisee('ETATS_INCOHERENTS');

        if (estAnon) {
            const run = trouverRunAnonPourExtraction(tousLesSpans, i);
            texteExtrait += '[' + run.pseudo + ']';
            // Ne pas consommer ce qui est hors de la plage : un export par segment doit pouvoir
            // traiter le fragment du même run dans le segment suivant, sans divulguer son texte.
            i = Math.min(run.fin, maxIndex) + 1;
        } else {
            // Exception ou texte normal : même traitement textuel. Surtout, ne pas chercher de
            // finsel pour une exception et ne pas agréger les spans voisins.
            texteExtrait += span.textContent || '';
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
    const segmentsEl = document.getElementById('segments');
    const documentAnon = preparerDocumentAnonymise(segmentsEl ? segmentsEl.innerHTML : '', locut);

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

    // Même instantané et même nettoyage que la modale d'export et le corpus réouvrable.
    const locJSON = JSON.stringify(documentAnon.tabLoc, null);
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

    // Le nettoyage s'effectue uniquement sur la copie : ne pas effacer les sélections ou
    // les marqueurs d'anonymisation du document de travail pendant un export.
    const segmentsAnonymises = documentAnon.html;

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
    return _anonymiserHtml(segmentsEl.innerHTML); // texte ET libellés, sur une copie
}

