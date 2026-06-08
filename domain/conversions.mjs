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
