// Domaine : lecture ET écriture du fichier .sonal (Entretien).
//
// LECTURE (parseSonal & co) : lecteur canonique des invariants observables d'un .sonal,
// via DOM (createElement('div') + innerHTML + querySelectorAll('.lblseg') + .closest()
// + .dataset). `doc` = `document` réel dans le renderer ; un document jsdom dans les tests.
//
// ÉCRITURE (serializeSonal) : sérialisation pure (assemblage de chaîne, sans DOM) du .sonal,
// port fidèle de gestion_fichiers.js:sauvHtml (+ exportThmcss, ici paramétré par `cssFromCodebook(tabThm)` au lieu du global).
// Le renderer pourra y déléguer (tranche 2),
// en attendant, golden + round-trip parse(serialize) servent de filet de sécurité sur la sauvegarde.
//
// Voir docs/FORMATS.md §2.

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function buildRoot(html, doc) {
  const root = doc.createElement('div');
  root.innerHTML = html;
  return root;
}

/** Segments : span.lblseg -> {rksg, deb, fin, loc, statut, nomloc}, triés par rksg. */
export function segments(html, doc) {
  const root = buildRoot(html, doc);
  return [...root.querySelectorAll('.lblseg')]
    .map((seg) => ({
      rksg: seg.dataset.rksg ?? null,
      deb: seg.dataset.deb ?? null,
      fin: seg.dataset.fin ?? null,
      loc: seg.dataset.loc ?? null,
      statut: seg.dataset.statut ?? null,
      nomloc: seg.dataset.nomloc ?? null,
    }))
    .sort((a, b) => num(a.rksg) - num(b.rksg));
}

/** Locuteurs : couples distincts (loc, nomloc) rencontrés sur les segments. */
export function locuteurs(html, doc) {
  const seen = new Map();
  for (const s of segments(html, doc)) {
    if (s.loc == null) continue;
    const key = `${s.loc}|${s.nomloc ?? ''}`;
    if (!seen.has(key)) seen.set(key, { loc: s.loc, nomloc: s.nomloc ?? null });
  }
  return [...seen.values()].sort((a, b) => num(a.loc) - num(b.loc));
}

/** Codages : comptage par classe cat_XXX (un fragment peut en cumuler plusieurs). */
export function codages(html, doc) {
  const root = buildRoot(html, doc);
  const counts = {};
  for (const span of root.querySelectorAll('span')) {
    for (const cls of span.classList) {
      if (/^cat_\d+$/.test(cls)) counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  return counts;
}

/**
 *  Anon : préserve l'asymétrie à 3 états (MODELE_OBJET §5).
 *  type 'anon' / 'anon-exception' ; le 3e état (présent-non-anonymisé) n'a pas
 *  de span dédié et est donc absent de cette liste (documenté par omission).
 */
export function anon(html, doc) {
  const root = buildRoot(html, doc);
  const out = [];
  for (const span of root.querySelectorAll('span')) {
    let type = null;
    if (span.classList.contains('anon-exception')) type = 'anon-exception';
    else if (span.classList.contains('anon')) type = 'anon';
    if (!type) continue;
    out.push({
      rk: span.dataset.rk ?? null,
      pseudo: span.dataset.pseudo ?? null,
      nt: span.dataset.anonNt ?? null,
      type,
    });
  }
  return out.sort((a, b) => num(a.rk) - num(b.rk));
}

/** Commentaires : annotations data-obs/data-auth/data-finobs (Commentaire, cf. docs/MODELE_OBJET.md §2). */
export function commentaires(html, doc) {
  const root = buildRoot(html, doc);
  const out = [];
  for (const span of root.querySelectorAll('span')) {
    const d = span.dataset;
    if (!('obs' in d) && !('auth' in d) && !('finobs' in d)) continue;
    out.push({
      rk: d.rk ?? null,
      auteur: d.auth ?? null,
      obs: d.obs ?? null,
      finobs: d.finobs ?? null,
    });
  }
  return out.sort((a, b) => num(a.rk) - num(b.rk));
}

/** Extraction complète des invariants d'un .sonal. */
export function parseSonal(html, doc) {
  return {
    segments: segments(html, doc),
    locuteurs: locuteurs(html, doc),
    codages: codages(html, doc),
    anon: anon(html, doc),
    commentaires: commentaires(html, doc),
  };
}

// ── Écriture (.sonal) ────────────────────────────────────────────────────────

/**
 *  CSS du codebook (classes .cat_XXX). Port fidèle de thematisation.js:exportThmcss,
 *  paramétré par `tabThm` (au lieu du global). Pur.
 */
export function cssFromCodebook(tabThm = []) {
  // Les couleurs et tailles viennent d'un fichier importé (jamais de confiance) :
  // seules les formes HEX valides sont interpolées (pas d'échappement du bloc
  // <style>). Le sélecteur, lui, reste le code brut : classe FROISSÉE du format
  // SonalPi1, identique à celle portée par les spans du corps.
  var couleurHex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  function tailleBorn(taille) {
    var n = Number(taille);
    if (!Number.isFinite(n)) return null;
    return Math.min(72, Math.max(8, Math.round(n)));
  }
  var chaineCss = `<style>


    body { margin: 20px; padding: 60px; font-family: Arial, sans-serif; background-color: #f4f4f4; color: #333; };
    h1 { font-size: 24px; margin-bottom: 10px; };
    h2 { font-size: 20px; margin-bottom: 8px; };

    `;

  for (let t = 0; t < tabThm.length; t++) {
    const code = tabThm[t].code;
    if (typeof code !== 'string' || !code) continue;
    // Le sélecteur reste un identifiant, jamais du HTML ou une instruction CSS.
    const selecteur = Array.from(code).map((c, i) =>
      /^[a-zA-Z0-9_-]$/.test(c) && !(i === 0 && /[0-9]/.test(c)) && !(i === 1 && code[0] === '-' && /[0-9]/.test(c))
        ? c : `\\${c.codePointAt(0).toString(16)} `).join('');
    chaineCss += `.` + selecteur + `{

        `;

    if (tabThm[t].couleur && couleurHex.test(tabThm[t].couleur)) {
      chaineCss += `background-image: linear-gradient(rgba(0, 0, 0, 0) 60%, ` + tabThm[t].couleur + `60 95%, ` + tabThm[t].couleur + ` 100%);
            `;
    }

    var taille = tabThm[t].taille ? tailleBorn(tabThm[t].taille) : null;
    if (taille !== null) {
      chaineCss += `font-size: ` + taille + `;
            font-weight: bold;
            `;
    }

    chaineCss += `
        }
    `;
  }

  chaineCss += `
</style>
 `;

  return chaineCss;
}

/**
 *  Sérialise un .sonal complet (HTML). Port fidèle de gestion_fichiers.js:sauvHtml.
 *  Pur, sans DOM. L'ordre et la structure (blocs <script> loc/cat/var/dic/dat/anon,
 *  notes, #contenuText) sont l'invariant de format à préserver (cf. FORMATS.md §2).
 *
 *  @param {{tabLoc, tabThm, tabVar, tabDic, tabDat, notes, html, tabAnon}} parts
 *  @returns {string} le contenu .sonal
 */
export function serializeSonal({ tabLoc, tabThm, tabVar, tabDic, tabDat, notes, html, tabAnon } = {}) {
  var contenuHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fichier Whispurge</title>
   <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet"  type="text/css">
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">

   `;

  // Les valeurs JSON ne doivent jamais fermer leur balise script.
  const jsonInerte = (valeur) => JSON.stringify(valeur, null)?.replace(/</g, '\\u003c');
  const notesInertes = String(notes ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const locJSON = jsonInerte(tabLoc);
  const thmJSON = jsonInerte(tabThm);
  const varJSON = jsonInerte(tabVar);
  const dicJSON = jsonInerte(tabDic);
  const datJSON = jsonInerte(tabDat);
  const anonJSON = jsonInerte(tabAnon);

  contenuHtml += cssFromCodebook(tabThm);

  contenuHtml += `</head>

<body>
`;

  contenuHtml += `<script id="loc-json" type="application/json">
        {
            ` + locJSON + `
        }
<` + `/script>
`;

  contenuHtml += `<script id="cat-json" type="application/json">
        {

            ` + thmJSON + `
        }
<` + `/script>
`;

  contenuHtml += `<script id="var-json" type="application/json">
        {
            ` + varJSON + `
        }
<` + `/script>
`;

  contenuHtml += `<script id="dic-json" type="application/json">
        {
            ` + dicJSON + `
        }
<` + `/script>
`;

  contenuHtml += `<script id="dat-json" type="application/json">
        {
            ` + datJSON + `
        }
<` + `/script>
`;

  contenuHtml += `<script id="anon-json" type="application/json">
        {
            ` + anonJSON + `
        }
<` + `/script>
`;

  contenuHtml += `
    <div style="margin-bottom: 5px !important;
	margin-bottom: 5px !important;
	margin: 40px;"
	>

    <H2 > Notes</H2>

        <div id="txtnotes">
        ` + notesInertes + `
        </div>
    </div>
    `;

  contenuHtml += ` <div id="contenuText">
     `;

  contenuHtml += html;

  contenuHtml += `
</div></body>`;

  return contenuHtml;
}
