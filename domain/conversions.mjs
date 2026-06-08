// Conversions d'import : transforment un contenu de fichier (chaîne) en structure
// (tableau de segments → HTML « format Sonal »), ou extraient les données d'un
// fichier .sonal déjà formé. Logique PURE (chaîne → structure) : aucun DOM vivant,
// IPC ou fs. Importable en Node (tests) comme dans le renderer (via domain/index.mjs).
//
// Périmètre (slice 1, cf. plans/PlanPoo.md « recueil/conversions ») : seuls les
// morceaux SANS canal-window ni doublon sont ici — `convertPURGE`, `tabSegToSonal`
// (sa dépendance) et `extractFichierSonal`. Les convertisseurs SRT/VTT/TXT/JSON
// (qui planquent les locuteurs dans `window.tabLocImport`) et la fusion corpus
// (`fusionTab*`, qui mute l'état via IPC) restent côté renderer pour l'instant.
//
// ⚠️ Différences assumées avec les ex-fonctions du renderer (non-régression visée) :
//  - les globaux implicites (`s`, `lignesFich`, `seg_cur`, `cases`) deviennent des
//    locales `let` (obligatoire : un module ESM est en strict mode) ;
//  - `convertPURGE` ne fait plus l'effet de bord `seg_cur = …` : il **retourne**
//    `segCourant`, à charge de l'appelant renderer de l'appliquer ;
//  - `extractFichierSonal` reçoit le `doc` parsé en argument (comme sonal.mjs) au
//    lieu d'instancier `new DOMParser()` lui-même → testable en Node.

// Génère le HTML « format Sonal » à partir d'un tableau de segments.
// tabSeg[s] = [ _, deb, fin, loc, texte, sel, _ ]. `notes` est accepté pour
// compatibilité de signature mais non inséré (comportement d'origine conservé).
export function tabSegToSonal(tabSeg, locut, notes) {

  let html = `
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

<body>`;

  // ajout éventuel des locuteurs
  if (locut && locut.length > 1) {
    const locJSON = JSON.stringify(locut, null);
    html += `
    <script id="loc-json" type="application/json">

            ` + locJSON + `

        </script>
        `;
  }

  html += `<div id="contenuText">
`;

  let rkMax = 1;
  let sgMax = 1;

  for (let s = 0; s < tabSeg.length; s++) {

    // création des spans internes
    if (!tabSeg[s][4] || tabSeg[s][4].length == 0 || tabSeg[s][4].trim() === "") { continue; }

    html += `<span class="lblseg sautlig"
        data-deb="${tabSeg[s][1]}"
        data-fin="${tabSeg[s][2]}"
        data-loc="${tabSeg[s][3]}"
        tabindex="${rkMax}"
        data-rksg="${sgMax}"
        >`;

    // Un seul span compacté par segment : data-len = nombre d'éléments (mots, ponctuations, espaces)
    const texte = tabSeg[s][4];
    const elements = texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];

    html += `<span data-rk="${rkMax}" data-sg="${sgMax}" data-len="${elements.length}">${texte}</span></span>`;
    rkMax += elements.length;

    sgMax++;
  }

  html += `</div>
    </body>
    </html>`;

  html = String(html);

  return html;
}

// Convertit un fichier PURGE en « format Sonal ».
// Renvoie `{ formatSonal, segCourant }` (segCourant = position atteinte lue en
// ligne 2 du .purge ; l'ancien code l'écrivait dans le global `seg_cur`).
// Renvoie `undefined` si le contenu est vide (comportement d'origine).
export function convertPURGE(content) {

  if (!content || content.length < 1) { return; }

  // split du texte par lignes \n
  const lignesFich = content.split("\n");
  const nblig = lignesFich.length;

  // récupération des locuteurs (première ligne)
  const locut = lignesFich[0].split("\t");

  // récupération du segment courant (seconde ligne) → ex-effet de bord `seg_cur`
  let lig = lignesFich[1].split("\t");
  const segCourant = lig[1];

  // récupération de la vitesse de lecture (troisième ligne)
  lig = lignesFich[2].split("\t");

  // récupération des notes
  let debutSegments = 0;
  let debutMemo = 0;
  let notes = "";

  for (let s = 3; s < nblig; s++) {
    if (lignesFich[s].substr(0, 6) == "Memo :") { debutMemo = s + 1; }
    if (lignesFich[s].substr(0, 9) == "Début\tFin") { debutSegments = (s + 1); break; }
    if (s >= debutMemo) { notes = notes + lignesFich[s] + " \r\n"; } // ajout de la ligne aux notes
  }

  // suppression des premières lignes puis importation des segments en masse
  lignesFich.splice(0, debutSegments);

  const nbseg = lignesFich.length;
  const tabSeg = new Array(nbseg);

  for (let s = 0; s < nbseg; s++) {
    tabSeg[s] = new Array(6);
  }

  for (let s = 0; s < nbseg; s++) {
    const cases = lignesFich[s].split("\t");
    tabSeg[s][1] = cases[0];
    tabSeg[s][2] = cases[1];
    tabSeg[s][3] = cases[2]; // locuteur
    tabSeg[s][4] = cases[3];
    tabSeg[s][5] = false; // non sélectionné par défaut
    tabSeg[s][6] = 0;
  }

  const formatSonal = tabSegToSonal(tabSeg, locut, notes);

  return { formatSonal, segCourant };
}

// Extrait les données d'un fichier .sonal (HTML) : blocs JSON embarqués + notes/contenu.
// `htmlString` = source brute ; `doc` = document déjà parsé (renderer : DOMParser ;
// tests : jsdom ou stub à `getElementById`). Pur : ne mute rien.
export function extractFichierSonal(htmlString, doc) {

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
          return null;
        }
        return JSON.parse(content);

      } catch (e) {
        console.error(`Erreur parsing ${id}:`, e);
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

  return { tabLoc, tabThm, tabVar, tabDic, tabDat, notes, html, tabAnon };
}

// Regroupe les segments en phrases : fusionne tout segment ne se terminant pas par
// une ponctuation forte (. ? !) avec le suivant. Mute tabSeg en place et le renvoie.
// Pur : l'ancien rafraîchissement UI `affSegments(0)` est laissé au renderer.
export function Phrasifier(tabSeg) {
  const finPhrase = new Set(['.', '?', '!']);

  function fusionSegs(seg) {
    tabSeg[seg][4] = tabSeg[seg][4] + tabSeg[seg + 1][4]; // fusion des textes
    tabSeg[seg][2] = tabSeg[seg + 1][2];
    tabSeg.splice(seg + 1, 1);
  }

  for (let s = 0; s < tabSeg.length - 1; s++) {
    const str = tabSeg[s][4];
    const endtxt = str.slice((str.length - 1));
    const estFin = finPhrase.has(endtxt);
    if (estFin == false) {
      fusionSegs(s);
      s--;
    }
  }

  return tabSeg;
}

// Extrait les locuteurs « Speaker N » d'un tableau de segments (issu d'un SRT/VTT) :
// affecte le locuteur, retire le préfixe « Speaker N » du texte, et nettoie les
// « Speaker i: » intempestifs. Mute tabSeg en place ; renvoie { tabSeg, locut }.
// Pur : l'ancien stash window.tabLocImport / setTabLoc (déjà commenté) est supprimé.
export function convertSpeaker(tabSeg) {
  const locut = ['']; // locut[0] n'existe pas

  for (let s = 0; s < tabSeg.length; s++) {
    const txt = tabSeg[s][4];
    if (!txt || txt.trim() === "") { continue; } // segment vide

    const spk = txt.indexOf("Speaker "); // recherche d'un speaker
    if (spk == 0) {
      let rg = txt.substr(8, 1);
      rg = Number(rg) + 1;
      tabSeg[s][3] = rg; // affectation du locuteur

      const nomLoc = "Speaker " + (rg);
      if (!locut.includes(nomLoc)) { locut.push(nomLoc); }

      tabSeg[s][4] = txt.substr(11); // suppression du préfixe "Speaker N"
    }

    // suppression des "Speaker i:" intempestifs dans le corps du texte
    for (let i = 0; i < 10; i++) {
      tabSeg[s][4] = tabSeg[s][4].replaceAll("Speaker " + i + ":", "");
    }
  }

  return { tabSeg, locut };
}

// ── Convertisseurs de formats d'import (slice 2b) ────────────────────────────
// Tous PURS : chaîne (ou tableau JSON) → { formatSonal, locuteurs } (ou { tabSeg,
// locut } pour JSON, forme d'origine conservée). L'ancien `window.tabLocImport`
// est supprimé : les locuteurs sont RENVOYÉS. Dépendances internes au module :
// TimeToSec, convertSpeaker, tabSegToSonal.

// "HH:MM:SS,ms" (ou "MM:SS") → secondes. Pur.
export function TimeToSec(time) {
  const sspart = time.split(":");
  let pas = 0;
  let secs = 0;
  for (let ss = sspart.length - 1; ss > -1; ss--) {
    let valeur = sspart[ss];
    valeur = valeur.replace(",", "."); // virgules décimales → points
    secs += Number(valeur * Math.pow(60, pas));
    pas++;
  }
  return secs;
}

// Tableau JSON (objets {start,end,text,avg_logprob}) → { tabSeg, locut }.
export function convertJSON(lignesFich) {
  const nbseg = lignesFich.length;
  let tabSeg = new Array(nbseg);
  for (let s = 0; s < nbseg; s++) { tabSeg[s] = new Array(6); }
  for (let s = 0; s < nbseg; s++) {
    tabSeg[s][1] = lignesFich[s].start.toFixed(2);
    tabSeg[s][2] = lignesFich[s].end.toFixed(2);
    tabSeg[s][3] = ""; // locuteur
    tabSeg[s][4] = lignesFich[s].text;
    tabSeg[s][5] = false; // non sélectionné par défaut
    tabSeg[s][6] = lignesFich[s].avg_logprob;
  }
  const postLocut = convertSpeaker(tabSeg);
  tabSeg = postLocut.tabSeg;
  const locut = postLocut.locut;
  return { tabSeg, locut };
}

// SRT → { formatSonal, locuteurs }.
export function convertSRT(content) {
  if (!content || content.length < 1) { return; }

  const lignesFich = content.split("\n");
  const nblig = lignesFich.length;

  let rgSeg = 0;
  let tabSeg = new Array(1);
  tabSeg[rgSeg] = new Array(6);

  for (let s = 0; s < nblig; s++) {
    const ligne = lignesFich[s].trim();
    const posfleche = ligne.lastIndexOf("-->"); // indicateur de coordonnées

    if (posfleche > -1) { // ajout d'un segment
      tabSeg.push();
      rgSeg++;
      tabSeg[rgSeg] = new Array(6);

      const tps = ligne.split("-->");
      tabSeg[rgSeg][1] = TimeToSec(tps[0]);
      tabSeg[rgSeg][2] = TimeToSec(tps[1]);
      tabSeg[rgSeg][3] = ""; // locuteur
      tabSeg[rgSeg][4] = "";
      tabSeg[rgSeg][5] = false;
      tabSeg[rgSeg][6] = 0;
    } else {
      if (ligne == "" || isNaN(ligne) == false) { // numéros de sous-titre / sauts de ligne
        if (s < nblig - 1) {
          if (lignesFich[s + 1].lastIndexOf("-->") > -1) { continue; }
        }
      }
      const lignetxt = ligne.replace(/\r?\n|\r/, "");
      tabSeg[rgSeg][4] += lignetxt; // ajout du texte au segment courant
    }
  }

  // trimage des portions de texte
  for (let s = 0; s < tabSeg.length; s++) {
    if (!tabSeg[s][4] || tabSeg[s][4].trim() === "") { continue; }
    tabSeg[s][4] = tabSeg[s][4].trim() + " "; // espace final de séparation
  }

  tabSeg.splice(0, 1); // suppression du rang 0

  const postLocut = convertSpeaker(tabSeg);
  tabSeg = postLocut.tabSeg;
  const locuteurs = postLocut.locut;
  const formatSonal = tabSegToSonal(tabSeg, locuteurs);
  return { formatSonal, locuteurs };
}

// WebVTT → { formatSonal, locuteurs }. Gère <v Nom> et "Speaker N" inline.
export function convertVTT(content) {
  if (!content || content.length < 1) { return; }

  const lignesFich = content.split("\n");
  const nblig = lignesFich.length;
  const locut = [''];

  let rgSeg = 0;
  let tabSeg = new Array(1);
  tabSeg[rgSeg] = new Array(6);

  let inBlock = false; // pour ignorer les blocs NOTE et STYLE

  for (let s = 0; s < nblig; s++) {
    const ligne = lignesFich[s].trim();

    if (ligne.startsWith("WEBVTT")) { continue; }
    if (ligne.startsWith("NOTE") || ligne.startsWith("STYLE")) { inBlock = true; continue; }
    if (inBlock) { if (ligne === "") { inBlock = false; } continue; }

    const posfleche = ligne.indexOf("-->");

    if (posfleche > -1) { // nouveau segment
      tabSeg.push();
      rgSeg++;
      tabSeg[rgSeg] = new Array(6);

      const tpsBrut = ligne.split("-->");
      const debStr = tpsBrut[0].trim();
      const finStr = tpsBrut[1].trim().split(/\s+/)[0]; // premier token (ignore position:, line:…)

      tabSeg[rgSeg][1] = TimeToSec(debStr);
      tabSeg[rgSeg][2] = TimeToSec(finStr);
      tabSeg[rgSeg][3] = 0;
      tabSeg[rgSeg][4] = "";
      tabSeg[rgSeg][5] = false;
      tabSeg[rgSeg][6] = 0;
    } else {
      if (ligne === "") { continue; }
      if (s < nblig - 1 && lignesFich[s + 1].indexOf("-->") > -1) { continue; } // identifiant de cue

      let lignetxt = ligne.replace(/\r?\n|\r/, "");

      // 1. balise <v Nom>
      const vTagMatch = lignetxt.match(/^<v\s+([^>]+)>/);
      if (vTagMatch) {
        const nomLoc = vTagMatch[1].trim();
        if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
        tabSeg[rgSeg][3] = locut.indexOf(nomLoc);
        lignetxt = lignetxt.replace(/^<v\s+[^>]+>/, "");
      }
      // 2. préfixe "Speaker N"
      else if (/^Speaker\s+\d+/.test(lignetxt)) {
        const rg = Number(lignetxt.substr(8, 1)) + 1;
        const nomLoc = "Speaker " + rg;
        if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
        tabSeg[rgSeg][3] = locut.indexOf(nomLoc);
        lignetxt = lignetxt.substr(11);
      }

      lignetxt = lignetxt.replace(/<[^>]+>/g, ""); // balises VTT restantes
      tabSeg[rgSeg][4] += lignetxt;
    }
  }

  for (let s = 0; s < tabSeg.length; s++) {
    if (!tabSeg[s][4] || tabSeg[s][4].trim() === "") { continue; }
    tabSeg[s][4] = tabSeg[s][4].trim() + " ";
  }

  tabSeg.splice(0, 1);

  const formatSonal = tabSegToSonal(tabSeg, locut);
  return { formatSonal, locuteurs: locut };
}

// TXT (3 formats : C texte brut, B "Speaker N: texte", A "HH:MM:SS [Loc]") →
// { formatSonal, locuteurs }.
export function convertTXT(content, ext) {
  const lignesFich = content.split("\n");
  const nblig = lignesFich.length;

  const locut = [""]; // locut[0] n'existe pas
  const tabSeg = [];
  let segCourant = null;

  const timeRegex  = /^(\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?)\s*(.*)$/;
  const locInRegex = /^([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\/\-]*(?:[ \/\-][A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\/\-]*){0,2})\s*:\s*(.+)$/;

  let hasTimestamp = false;
  let hasLocInline = false;
  for (let i = 0; i < Math.min(nblig, 20); i++) {
    const l = lignesFich[i].trim();
    if (!l) continue;
    if (timeRegex.test(l)) { hasTimestamp = true; break; }
    if (locInRegex.test(l)) { hasLocInline = true; }
  }
  const formatB = !hasTimestamp && hasLocInline;
  const formatC = !hasTimestamp && !hasLocInline;

  if (formatC) {
    for (let s = 0; s < nblig; s++) {
      const ligne = lignesFich[s].trim();
      if (ligne.length < 1) { continue; }
      tabSeg.push([null, 0, 0, 0, ligne, false, 0]);
    }
  } else if (formatB) {
    for (let s = 0; s < nblig; s++) {
      const ligne = lignesFich[s].trim();
      if (ligne.length < 1) { continue; }

      const locMatch = ligne.match(locInRegex);
      if (locMatch) {
        const nomLoc = locMatch[1].trim();
        const texteApres = locMatch[2].trim();
        if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
        const idxLoc = locut.indexOf(nomLoc);
        segCourant = [null, 0, 0, idxLoc, texteApres, false, 0];
        tabSeg.push(segCourant);
      } else {
        if (!segCourant) {
          segCourant = [null, 0, 0, 0, "", false, 0];
          tabSeg.push(segCourant);
        }
        segCourant[4] += (segCourant[4].length > 0 ? " " : "") + ligne;
      }
    }
  } else {
    for (let s = 0; s < nblig; s++) {
      const ligne = lignesFich[s].trim();
      if (ligne.length < 1) { continue; }

      const match = ligne.match(timeRegex);
      if (match) {
        const rawTime = match[1].replace(/\s/g, '');
        const debSec = TimeToSec(rawTime);
        if (segCourant) { segCourant[2] = debSec; }

        const nomLoc = match[2] ? match[2].trim() : "";
        if (nomLoc && !locut.includes(nomLoc)) { locut.push(nomLoc); }
        const idxLoc = nomLoc ? locut.indexOf(nomLoc) : 0;

        segCourant = [null, debSec, debSec, idxLoc, "", false, 0];
        tabSeg.push(segCourant);
      } else {
        if (!segCourant) {
          segCourant = [null, 0, 0, 0, "", false, 0];
          tabSeg.push(segCourant);
        }
        const locMatch = ligne.match(locInRegex);
        if (locMatch) {
          const nomLoc = locMatch[1].trim();
          const texteApres = locMatch[2].trim();
          if (!locut.includes(nomLoc)) { locut.push(nomLoc); }
          segCourant[3] = locut.indexOf(nomLoc);
          segCourant[4] += (segCourant[4].length > 0 ? " " : "") + texteApres;
        } else {
          segCourant[4] += (segCourant[4].length > 0 ? " " : "") + ligne;
        }
      }
    }
  }

  const formatSonal = tabSegToSonal(tabSeg, locut);
  return { formatSonal, locuteurs: locut };
}
