//////////////////////////////////////////////////////////////////
// REFI-QDA (REFI Project Exchange, .qdpx) import / export
//
// S'appuie sur le format REFI-QDA standard (https://www.qdasoftware.org/project/)
// et sur l'implémentation de référence de QualCoder (refi.py).
//
// Ce module s'exécute côté RENDERER (chargé dans index.html) : il traduit
// le modèle de données de SonalPi (tabThm / tabEnt / tabVar / tabDic / tabDat)
// vers / depuis la structure REFI-QDA, puis délègue l'emballage .qdpx (zip)
// au processus main via les canaux IPC "refi:export-qdpx" et "refi:import-qdpx".
//
// Limitations volontaires (cohérentes avec le périmètre de SonalPi) :
//   - Sources textuelles uniquement (pas d'images / audio / vidéo comme sources
//     codables distinctes ; l'audio lié à un entretien reste référencé via
//     audioPath mais n'est pas exporté comme AudioSource REFI).
//   - Pas de hiérarchie de codes (SonalPi n'a qu'une liste plate de thèmes) ;
//     tous les codes sont exportés au premier niveau du CodeBook.
//   - Annotations / notes d'entretien exportées comme Note REFI.
//////////////////////////////////////////////////////////////////

const REFI_NS = "urn:QDA-XML:project:1.0";

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

// Génère un GUID REFI-QDA (8-4-4-4-13) à partir de crypto.randomUUID si dispo,
// sinon repli aléatoire. Le 13e groupe (QualCoder) est toléré par les lecteurs.
function refiGuid() {
  let hex;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === 'function') {
    hex = crypto.randomUUID().replace(/-/g, '');
  } else {
    hex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
  hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function escXml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nowDateTime() {
  // REFI attend YYYY-MM-DDTHH:MM:SSZ
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
}

// Convertit une couleur SonalPi ("#RRGGBB" ou "") en couleur REFI ("#RRGGBB").
// Couleur par défaut (gris) si vide, pour rester lisible ailleurs.
function sonalColorToRefi(c) {
  if (!c || typeof c !== 'string') return "#7f7f7f";
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c.toLowerCase();
  return "#7f7f7f";
}

// ---------------------------------------------------------------------------
// Export : SonalPi -> REFI-QDA (.qdpx)
//
// On construit côté renderer :
//   - users, codeBook (codes), variables, sources (texte + codages + notes)
// puis on envoie un objet structuré { projectXml, sourceFiles: [{name,content}] }
// au main, qui zippe le tout en .qdpx (project.qde + /sources/*).
// ---------------------------------------------------------------------------

// Extrait le texte brut d'un entretien et la liste de ses codages, à partir du
// HTML (format .sonal ou rendu). Retourne :
//   { fullText, codings: [{ code, pos0, pos1, text }], locuteurs: [], notes }
// On parcourt les spans .lblseg (segments) puis leurs enfants (spans de mots)
// pour reconstituer le texte caractère par caractère et noter, pour chaque
// mot, sa (ses) classe(s) de thème. Les codages sont les zones contiguës
// partageant le même code.
function htmlToRefiSource(htmlStr, tabThm) {
  // Petit parseur DOM sans dépendance au navigateur : on utilise le DOMParser
  // disponible côté renderer (Electron).
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');
  const conteneur = doc.getElementById('contenuText') || doc.body;

  // Ensemble des codes SonalPi valides (classes CSS = code) pour filtrer.
  const codesValides = new Set((tabThm || []).map(t => t.code));

  let fullText = '';
  // Pour chaque mot (span), on conserve : { start, end, codes:Set }
  const mots = [];
  const segs = conteneur.querySelectorAll('.lblseg');
  segs.forEach((seg) => {
    const deb = seg.getAttribute('data-deb') || 0;
    const fin = seg.getAttribute('data-fin') || 0;
    const loc = seg.getAttribute('data-loc') || '';
    // Un lblseg contient un ou plusieurs spans de mots (data-rk) et
    // éventuellement des spans .ligloc / .anon qu'on traite comme du texte.
    const enfants = seg.querySelectorAll('span[data-rk], .ligloc, .anon');
    if (enfants.length === 0) {
      // lblseg compact (un seul span data-rk avec data-len) : texte dans seg
      const txt = seg.textContent || '';
      const codes = new Set();
      seg.classList.forEach(cl => { if (codesValides.has(cl)) codes.add(cl); });
      pushMots(mots, txt, codes, fullText, loc);
      fullText += txt;
      return;
    }
    enfants.forEach(enf => {
      const txt = enf.textContent || '';
      if (enf.classList && enf.classList.contains('ligloc')) {
        // ligne de locuteur : texte brut (non codé) — pas un mot codable
        fullText += txt;
        return;
      }
      const codes = new Set();
      if (enf.classList) {
        enf.classList.forEach(cl => { if (codesValides.has(cl)) codes.add(cl); });
      }
      pushMots(mots, txt, codes, fullText, loc);
      fullText += txt;
    });
    // saut implicite entre segments : on n'ajoute rien (le dernier mot porte
    // déjà son texte). On insère une fin de ligne pour la lisibilité du texte
    // exporté, sans impacter les positions (ajouté APRÈS l'enregistrement des mots).
    fullText += '\n';
  });

  // Fusion des mots contigus partageant exactement le même jeu de codes en codages.
  const codings = [];
  let cur = null; // { code, pos0, pos1 }
  // On ne code que les zones couvertes par AU MOINS un code. Un mot peut porter
  // plusieurs codes (multiThm) : on émet un codage par code.
  // On regroupe par code, en parcourant les mots dans l'ordre.
  const parCode = new Map(); // code -> [{pos0,pos1}]
  mots.forEach(m => {
    m.codes.forEach(code => {
      if (!parCode.has(code)) parCode.set(code, []);
      parCode.get(code).push({ pos0: m.start, pos1: m.end, text: m.text });
    });
  });
  parCode.forEach((zones, code) => {
    // Fusionner les zones contiguës (pos1 d'une == pos0 de la suivante)
    zones.sort((a, b) => a.pos0 - b.pos0);
    let run = null;
    zones.forEach(z => {
      if (run && run.pos1 === z.pos0) {
        run.pos1 = z.pos1;
        run.text += z.text;
      } else {
        if (run) codings.push({ code, pos0: run.pos0, pos1: run.pos1, text: run.text });
        run = { pos0: z.pos0, pos1: z.pos1, text: z.text };
      }
    });
    if (run) codings.push({ code, pos0: run.pos0, pos1: run.pos1, text: run.text });
  });
  codings.sort((a, b) => a.pos0 - b.pos0);

  // Notes : extraites depuis <div id="txtnotes">
  let notes = '';
  const txtnotes = doc.getElementById('txtnotes');
  if (txtnotes) notes = (txtnotes.textContent || '').trim();

  return { fullText, codings, notes };
}

function pushMots(mots, txt, codes, offset, loc) {
  if (!txt) return;
  const start = offset + 0; // offset correspond à fullText AVANT ajout
  const end = start + txt.length;
  mots.push({ start, end, text: txt, codes, loc });
}

// Construit le XML REFI-QDA (project.qde) à partir des données SonalPi
// collectées. `sources` est un tableau d'objets :
//   { guid, name, fullText, plainFile, richFile, notes, codings:[{code,pos0,pos1,text}], memo }
// `codes` est le tabThm, `variables` le tabVar/tabDic/tabDat.
function buildRefiProjectXml(opts) {
  const { projectName, version, userGuid, codes, sources, variables, cases } = opts;
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<Project xmlns:xsd="http://www.w3.org/2001/XMLSchema" ';
  xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
  xml += `name="${escXml(projectName)}" `;
  xml += `origin="SonalPi ${version}" `;
  xml += `creatingUserGUID="${userGuid}" `;
  xml += `creationDateTime="${nowDateTime()}" `;
  xml += `xmlns="${REFI_NS}"`;
  xml += '>\n';

  // --- Users ---
  xml += '<Users>\n';
  xml += `<User guid="${userGuid}" name="Sonal" />\n`;
  xml += '</Users>\n';

  // --- CodeBook ---
  xml += '<CodeBook>\n<Codes>\n';
  (codes || []).forEach(c => {
    xml += refiCodeXml(c);
  });
  xml += '</Codes>\n</CodeBook>\n';

  // --- Variables ---
  xml += refiVariablesXml(variables);

  // --- Cases (un cas = un entretien SonalPi, portant ses variables) ---
  xml += refiCasesXml(cases, variables);

  // --- Sources ---
  xml += '<Sources>\n';
  (sources || []).forEach(s => {
    xml += refiTextSourceXml(s);
  });
  xml += '</Sources>\n';

  // --- Description globale ---
  xml += `<Description>Exporté depuis SonalPi ${version}</Description>\n`;

  xml += '</Project>\n';
  return xml;
}

function refiCodeXml(c) {
  let xml = `<Code guid="${refiGuid()}" name="${escXml(c.nom)}" isCodable="true" color="${sonalColorToRefi(c.couleur)}"`;
  const memo = c.memo ? escXml(c.memo) : '';
  if (!memo) {
    xml += ' />\n';
  } else {
    xml += `>\n<Description>${memo}</Description>\n</Code>\n`;
  }
  return xml;
}

// Variables SonalPi -> Variables REFI. On mappe chaque variable tabVar à une
// Variable REFI de type Text (SonalPi ne distingue pas numérique/texte : tout
// est modalité (tabDic) référencée par tabDat).
function refiVariablesXml(variables) {
  if (!variables || !variables.tabVar || variables.tabVar.length === 0) return '';
  let xml = '<Variables>\n';
  const varGuids = new Map(); // rkVar -> guid
  variables.tabVar.forEach(v => {
    const g = refiGuid();
    varGuids.set(v.v, g);
    xml += `<Variable guid="${g}" name="${escXml(v.lib)}" typeOfVariable="Text">\n`;
    xml += '<Description />\n</Variable>\n';
  });
  xml += '</Variables>\n';
  variables._varGuids = varGuids; // réutilisé par refiCasesXml
  return xml;
}

// Un cas REFI par entretien, portant ses valeurs de variables (tabDat local).
function refiCasesXml(cases, variables) {
  if (!cases || cases.length === 0) return '';
  let xml = '<Cases>\n';
  const varGuids = variables && variables._varGuids ? variables._varGuids : new Map();
  cases.forEach(ca => {
    xml += `<Case guid="${refiGuid()}" name="${escXml(ca.nom)}">\n`;
    xml += '<Description />\n';
    (ca.dat || []).forEach(d => {
      const vg = varGuids.get(d.v);
      if (!vg) return;
      // valeur = libellé de la modalité (tabDic) ou valeur brute
      const lib = modaliteLibelle(variables, d.v, d.m);
      xml += '<VariableValue>\n';
      xml += `<VariableRef targetGUID="${vg}" />\n`;
      xml += `<TextValue>${escXml(lib)}</TextValue>\n`;
      xml += '</VariableValue>\n';
    });
    // SourceRef : lien cas -> sa source texte
    if (ca.sourceGuid) {
      xml += `<SourceRef targetGUID="${ca.sourceGuid}" />\n`;
    }
    xml += '</Case>\n';
  });
  xml += '</Cases>\n';
  return xml;
}

function modaliteLibelle(variables, rkVar, rkMod) {
  if (!variables || !variables.tabDic) return String(rkMod);
  const d = variables.tabDic.find(x => x.v == rkVar && x.m == rkMod);
  return d ? (d.lib != null ? d.lib : String(rkMod)) : String(rkMod);
}

function refiTextSourceXml(s) {
  let xml = '<TextSource ';
  // Pas de richTextPath (texte brut uniquement) — conforme MAXQDA.
  xml += `plainTextPath="internal://${s.plainFile}" `;
  xml += `creatingUser="${s.userGuid}" `;
  xml += `creationDateTime="${nowDateTime()}" `;
  xml += `guid="${s.guid}" `;
  xml += `name="${escXml(s.name)}">\n`;
  if (s.memo) {
    xml += `<Description>${escXml(s.memo)}</Description>\n`;
  }
  // Codages
  (s.codings || []).forEach(cd => {
    xml += `<PlainTextSelection guid="${refiGuid()}" `;
    xml += `startPosition="${cd.pos0}" endPosition="${cd.pos1}" `;
    xml += `name="${escXml(cd.text.slice(0, 60))}" `;
    xml += `creatingUser="${s.userGuid}" `;
    xml += `creationDateTime="${nowDateTime()}">\n`;
    xml += `<Coding guid="${refiGuid()}" creatingUser="${s.userGuid}">\n`;
    xml += `<CodeRef targetGUID="${cd.codeGuid}" />\n`;
    xml += '</Coding>\n</PlainTextSelection>\n';
  });
  xml += '</TextSource>\n';
  return xml;
}

// Fonction principale d'export, appelée depuis l'UI (index.html / menu).
// Récupère les données du corpus via l'API electron, lit chaque entretien,
// construit le project.qde + les fichiers sources, puis demande au main
// d'écrire le .qdpx.
async function exporterRefiQda() {
  const Corpus = await window.electronAPI.getCorpus();
  if (!Corpus || !Corpus.url) {
    if (typeof dialog === 'function') dialog('Message', 'Aucun corpus ouvert.');
    return { success: false, error: 'Aucun corpus ouvert' };
  }

  const tabThm = await window.electronAPI.getThm() || [];
  const tabEnt = await window.electronAPI.getEnt() || [];
  const tabVar = await window.electronAPI.getVar() || [];
  const tabDic = await window.electronAPI.getDic() || [];

  if (tabEnt.length === 0) {
    if (typeof dialog === 'function') dialog('Message', 'Le corpus ne contient aucun entretien à exporter.');
    return { success: false, error: 'Corpus vide' };
  }

  // guid par code (pour référencer dans les codages)
  const codeGuids = new Map();
  tabThm.forEach(c => codeGuids.set(c.code, refiGuid()));
  // On reconstruit le codeBook avec les guids
  const codesForXml = tabThm.map(c => ({ ...c, _guid: codeGuids.get(c.code) }));

  const userGuid = refiGuid();
  const sources = [];
  const cases = [];
  const sourceFiles = []; // { nom, contenu }

  for (let i = 0; i < tabEnt.length; i++) {
    const ent = tabEnt[i];
    // Charger le HTML de l'entretien (depuis le fichier .sonal / source)
    let htmlStr = '';
    try {
      let cheminEnt = '';
      if (Corpus.type === 'local') {
        cheminEnt = await window.electronAPI.createPath(Corpus.folder, ent.rtrPath);
      } else {
        cheminEnt = [Corpus.folder, ent.rtrPath].filter(Boolean).join('/');
        cheminEnt = await window.electronAPI.lireFichierServeur(cheminEnt);
      }
      if (Corpus.type === 'local') {
        htmlStr = await window.electronAPI.readFileContent(cheminEnt);
      } else {
        htmlStr = cheminEnt && cheminEnt.content ? cheminEnt.content : '';
      }
    } catch (e) {
      console.warn('REFI export : lecture entretien échouée', ent.nom, e);
    }
    if (!htmlStr) continue;

    const { fullText, codings, notes } = htmlToRefiSource(htmlStr, tabThm);

    const guid = refiGuid();
    const plainFile = refiGuid() + '.txt';
    const nom = (ent.nom || ('entretien_' + (i + 1))) + '.txt';

    // codages -> codeGuid
    const codingsXml = codings.map(cd => ({
      code: cd.code,
      codeGuid: codeGuids.get(cd.code),
      pos0: cd.pos0,
      pos1: cd.pos1,
      text: cd.text
    })).filter(cd => cd.codeGuid);

    sources.push({
      guid, name: nom, plainFile, userGuid,
      codings: codingsXml,
      memo: notes || ''
    });
    sourceFiles.push({ nom: plainFile, contenu: fullText });

    // cas = entretien, avec ses variables (tabDat local)
    cases.push({
      nom: ent.nom || ('entretien_' + (i + 1)),
      dat: ent.tabDat || [],
      sourceGuid: guid
    });
  }

  const variables = { tabVar, tabDic };
  const projectXml = buildRefiProjectXml({
    projectName: Corpus.fileName ? Corpus.fileName.replace(/\.crp$/i, '') : 'SonalPi',
    version: '1.0',
    userGuid,
    codes: codesForXml,
    sources,
    variables,
    cases
  });

  // Déléguer l'écriture du .qdpx au main (zip)
  const result = await window.electronAPI.invoke('refi:export-qdpx', {
    projectXml,
    sourceFiles,
    defaultName: (Corpus.fileName ? Corpus.fileName.replace(/\.crp$/i, '') : 'corpus')
  });

  if (result && result.success) {
    if (typeof dialog === 'function') dialog('Message', 'Corpus exporté au format REFI-QDA (.qdpx).\n\nFichier : ' + result.filePath);
  } else {
    if (typeof dialog === 'function') dialog('Message', 'Échec de l\'export REFI-QDA : ' + (result && result.error ? result.error : 'erreur inconnue'));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Import : REFI-QDA (.qdpx) -> SonalPi
//
// Le main lit le .qdpx (zip), extrait project.qde + /sources/*.txt, et renvoie
// un objet { projectXml, sourceFiles } au renderer. Ce module parse le XML et
// reconstitue tabThm / tabEnt / tabVar / tabDic / tabDat + le HTML de chaque
// entretien (format .sonal compact) prêt à être enregistré dans le dossier
// du nouveau corpus.
// ---------------------------------------------------------------------------

function parseRefiProject(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  const project = doc.documentElement;
  const projectName = project.getAttribute('name') || 'Import REFI-QDA';

  // Détecter le namespace de version (1.0 ou 0:4)
  const nsMatch = (project.namespaceURI || '').match(/QDA-XML:project:(\S+)/);
  const nsVer = nsMatch ? nsMatch[1] : '1.0';
  const ns = `urn:QDA-XML:project:${nsVer}`;
  const q = (tag) => `${ns}:${tag}`;
  function byTag(parent, tag) {
    return parent ? Array.from(parent.getElementsByTagName(q(tag))) : [];
  }
  function child(parent, tag) {
    return parent ? parent.getElementsByTagName(q(tag))[0] : null;
  }

  // --- Users ---
  const users = new Map();
  const usersEl = child(project, 'Users');
  if (usersEl) {
    byTag(usersEl, 'User').forEach(u => {
      users.set(u.getAttribute('guid'), u.getAttribute('name') || 'default');
    });
  }

  // --- CodeBook (Codes) ---
  const codeBook = child(project, 'CodeBook');
  const codesEl = codeBook ? child(codeBook, 'Codes') : null;
  const codes = []; // { guid, name, color, memo, isCodable }
  if (codesEl) {
    byTag(codesEl, 'Code').forEach(c => {
      codes.push({
        guid: c.getAttribute('guid'),
        name: c.getAttribute('name') || 'code',
        color: c.getAttribute('color') || '',
        isCodable: c.getAttribute('isCodable') !== 'false',
        memo: (child(c, 'Description') || {}).textContent || ''
      });
    });
  }

  // --- Variables ---
  const variables = []; // { guid, name, type }
  const varEl = child(project, 'Variables');
  if (varEl) {
    byTag(varEl, 'Variable').forEach(v => {
      variables.push({
        guid: v.getAttribute('guid'),
        name: v.getAttribute('name') || 'variable',
        type: v.getAttribute('typeOfVariable') || 'Text'
      });
    });
  }

  // --- Cases (variables values + source links) ---
  const cases = []; // { guid, name, values:[{varGuid,value}], sourceGuids:[] }
  const casesEl = child(project, 'Cases');
  if (casesEl) {
    byTag(casesEl, 'Case').forEach(ca => {
      const values = byTag(ca, 'VariableValue').map(vv => {
        const ref = child(vv, 'VariableRef');
        const valEl = child(vv, 'TextValue') || child(vv, 'IntegerValue') ||
          child(vv, 'FloatValue') || child(vv, 'BooleanValue') ||
          child(vv, 'DateValue') || child(vv, 'DateTimeValue');
        return {
          varGuid: ref ? ref.getAttribute('targetGUID') : null,
          value: valEl ? valEl.textContent : ''
        };
      });
      const sourceGuids = byTag(ca, 'SourceRef').map(sr => sr.getAttribute('targetGUID'));
      cases.push({
        guid: ca.getAttribute('guid'),
        name: ca.getAttribute('name') || 'cas',
        values,
        sourceGuids
      });
    });
  }

  // --- Sources (texte) ---
  const sources = []; // { guid, name, plainPath, richPath, memo, codings:[{codeGuid,pos0,pos1,text}] }
  const sourcesEl = child(project, 'Sources');
  if (sourcesEl) {
    byTag(sourcesEl, 'TextSource').forEach(ts => {
      const memo = child(ts, 'Description');
      const codings = byTag(ts, 'PlainTextSelection').map(sel => {
        const coding = child(sel, 'Coding');
        const codeRef = coding ? child(coding, 'CodeRef') : null;
        return {
          codeGuid: codeRef ? codeRef.getAttribute('targetGUID') : null,
          pos0: parseInt(sel.getAttribute('startPosition') || '0', 10),
          pos1: parseInt(sel.getAttribute('endPosition') || '0', 10)
        };
      });
      sources.push({
        guid: ts.getAttribute('guid'),
        name: ts.getAttribute('name') || 'source',
        plainPath: ts.getAttribute('plainTextPath') || '',
        richPath: ts.getAttribute('richTextPath') || '',
        memo: memo ? memo.textContent : '',
        codings
      });
    });
  }

  return { projectName, ns, users, codes, variables, cases, sources };
}

// Construit le modèle SonalPi (tabThm, tabEnt, tabVar, tabDic, tabDat) à partir
// des données REFI-QDA parsées + du contenu des fichiers sources texte.
// `sourceContents` : Map guid -> texte (depuis /sources/*.txt).
function refiToSonalModel(refi, sourceContents) {
  // --- tabThm : un thème par code codable ---
  // SonalPi utilise des codes "cat_XXX". On préfixe pour éviter collisions.
  const tabThm = [];
  const codeMap = new Map(); // refi guid -> sonal code
  refi.codes.forEach((c, idx) => {
    // On ignore les catégories pures (non codables) comme simples conteneurs :
    // leurs codes enfants seront remontés au premier niveau (SonalPi est plat).
    if (!c.isCodable) return;
    const sonalCode = 'cat_' + String(idx + 1).padStart(3, '0');
    codeMap.set(c.guid, sonalCode);
    tabThm.push({
      code: sonalCode,
      couleur: sonalColorToRefi(c.color) || '',
      nom: c.name,
      taille: '',
      cmpct: 'false',
      rang: '1',
      act: 'true'
    });
  });
  // Garantir au moins le thème "Pondérations" par défaut (cohérence SonalPi)
  if (tabThm.length === 0) {
    tabThm.push({ code: 'cat_001', couleur: '', nom: 'Pondérations', taille: '', cmpct: 'false', rang: '0', act: 'true' });
  }

  // --- Variables : tabVar / tabDic / tabDat ---
  const tabVar = [];
  const tabDic = [];
  const varMap = new Map(); // refi var guid -> { v, modalites: Map(value->m) }
  refi.variables.forEach((vr, idx) => {
    const rkVar = idx + 1;
    varMap.set(vr.guid, { v: rkVar, lib: vr.name, modalites: new Map() });
    tabVar.push({ v: rkVar, lib: vr.name, champ: 'all', priv: 'false' });
    tabDic.push({ v: rkVar, m: 0, lib: '' }); // modalité 0
  });

  // --- Sources -> entretiens ---
  const tabEnt = [];
  let entId = 0;
  refi.sources.forEach((s) => {
    const fullText = sourceContents.get(s.guid) || '';
    if (fullText === '' && s.codings.length === 0) return; // source vide inutile

    // Construire le HTML SonalPi : un segment par "paragraphe" (saut de ligne),
    // avec un span par mot, et les classes de thème appliquées selon les codages.
    const html = buildSonalHtmlFromText(fullText, s.codings, codeMap, tabThm);

    entId++;
    const rtrPath = `${entId}_${sanitiseFileName(s.name)}.Sonal`;
    tabEnt.push({
      id: entId,
      nom: s.name.replace(/\.txt$/i, ''),
      rtrPath,
      audioPath: '',
      imgPath: '',
      actif: 1,
      tabLoc: [],
      tabVar: tabVar,
      tabDic: tabDic,
      tabDat: [],
      tabAnon: [],
      notes: s.memo || ''
    });
    // Stocker le HTML pour écriture par le main
    s._html = html;
    s._rtrPath = rtrPath;
    s._entId = entId;
  });

  // --- Cases -> variables des entretiens (tabDat) ---
  // On associe chaque cas à son entretien via les SourceRef, et on convertit
  // les valeurs REFI en modalités SonalPi (tabDic + tabDat).
  refi.cases.forEach(ca => {
    let ent = null;
    if (ca.sourceGuids.length > 0) {
      ent = tabEnt.find(e => refi.sources.find(s => s.guid === ca.sourceGuids[0] && s._entId === e.id));
    }
    // Repli : si aucun lien source, on associe au cas suivant l'ordre.
    if (!ent && tabEnt.length > 0) ent = tabEnt[tabEnt.length - 1];
    if (!ent) return;

    ca.values.forEach(val => {
      if (!val.varGuid) return;
      const vm = varMap.get(val.varGuid);
      if (!vm) return;
      let m = vm.modalites.get(val.value);
      if (m === undefined) {
        m = vm.modalites.size + 1;
        vm.modalites.set(val.value, m);
        tabDic.push({ v: vm.v, m, lib: val.value });
      }
      ent.tabDat.push({ e: String(ent.id), v: vm.v, l: 'all', m });
    });
  });

  return { tabThm, tabEnt, tabVar, tabDic, sources: refi.sources };
}

// Construit un HTML au format SonalPi (.sonal) à partir du texte brut et des
// codages REFI. On découpe le texte en segments (un par ligne), et en mots
// (spans data-rk) auxquels on applique la classe de thème quand le mot chevauche
// un codage.
function buildSonalHtmlFromText(fullText, codings, codeMap, tabThm) {
  const lignes = fullText.split(/\r?\n/);
  let rk = 1, sg = 1;
  let html = `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8">\n</head>\n<body><div id="contenuText">`;

  lignes.forEach((ligne) => {
    if (ligne.trim() === '') { return; }
    const segDeb = 0, segFin = 0, segLoc = '';
    const mots = ligne.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];
    if (mots.length === 0) return;

    html += `<span class="lblseg sautlig" data-deb="${segDeb}" data-fin="${segFin}" data-loc="${segLoc}" tabindex="${rk}" data-rksg="${sg}">`;
    mots.forEach(mot => {
      const start = rk - 1; // position approximative (index du mot dans le flux)
      // Déterminer les codes chevauchant ce mot (par position approximative)
      const classes = [];
      codings.forEach(cd => {
        const sonalCode = codeMap.get(cd.codeGuid);
        if (!sonalCode) return;
        // Approximation : on code par index de mot. Pour rester robuste sans
        // recalcul exact des offsets texte, on code le mot si son index de mot
        // tombe dans [pos0, pos1[ (positions caractère -> on ne peut pas croiser
        // exactement). On procède plutôt via une seconde passe plus fiable.
      });
      const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
      html += `<span data-rk="${rk}" data-sg="${sg}" data-len="${mots.length}"${cls}>${escHtml(mot)}</span>`;
      rk++;
    });
    html += `</span>`;
    sg++;
  });

  html += `</div></body></html>`;

  // Seconde passe fiable : recalculer les offsets caractère sur le texte brut
  // et réappliquer les classes de codage. On reconstruit le HTML à partir d'une
  // table (start,end -> codes) pour ne pas dépendre d'index de mot approximatifs.
  return applyCodingsToHtml(fullText, html, codings, codeMap);
}

// Version fiable : on regénère le HTML en parcourant le texte caractère par
// caractère, en segmentant sur les sauts de ligne, et en appliquant les classes
// de thème selon la position caractère (pos0/pos1 du codage).
function applyCodingsToHtml(fullText, _unused, codings, codeMap) {
  const lignes = fullText.split(/\r?\n/);
  let html = `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8">\n</head>\n<body><div id="contenuText">`;
  let pos = 0; // position caractère courante dans fullText
  let rk = 1, sg = 1;

  lignes.forEach((ligne) => {
    // Le saut de ligne compte 1 caractère dans fullText.
    const ligneLen = ligne.length;
    const segDeb = 0, segFin = 0, segLoc = '';
    const mots = ligne.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) || [];
    if (mots.length === 0) {
      pos += ligneLen + 1; // ligne vide + saut
      return;
    }
    html += `<span class="lblseg sautlig" data-deb="${segDeb}" data-fin="${segFin}" data-loc="${segLoc}" tabindex="${rk}" data-rksg="${sg}">`;
    let linePos = 0;
    mots.forEach(mot => {
      const motStart = pos + linePos;
      const motEnd = motStart + mot.length;
      // Codes dont la zone chevauche ce mot.
      const classes = [];
      codings.forEach(cd => {
        const sonalCode = codeMap.get(cd.codeGuid);
        if (!sonalCode) return;
        if (cd.pos0 < motEnd && cd.pos1 > motStart) classes.push(sonalCode);
      });
      const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
      html += `<span data-rk="${rk}" data-sg="${sg}" data-len="1"${cls}>${escHtml(mot)}</span>`;
      linePos += mot.length;
      rk++;
    });
    html += `</span>`;
    sg++;
    pos += ligneLen + 1; // + saut de ligne
  });

  html += `</div></body></html>`;
  return html;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitiseFileName(name) {
  return String(name || '').replace(/[<>:"/\\|?*]/g, '_').trim() || 'source';
}

// Fonction principale d'import : demande au main d'ouvrir un .qdpx, reçoit
// { projectXml, sourceFiles }, reconstruit le modèle SonalPi, puis demande la
// création d'un nouveau corpus local et l'écriture des fichiers .sonal.
async function importerRefiQda() {
  // 1. Sélection + lecture du .qdpx par le main (dézippe).
  const data = await window.electronAPI.invoke('refi:import-qdpx');
  if (!data || !data.success) {
    if (typeof dialog === 'function') dialog('Message', 'Import REFI-QDA annulé ou échoué : ' + (data && data.error ? data.error : ''));
    return { success: false };
  }

  // 2. Parser le project.xml
  let refi;
  try {
    refi = parseRefiProject(data.projectXml);
  } catch (e) {
    if (typeof dialog === 'function') dialog('Message', 'Impossible de lire le project.xml : ' + e.message);
    return { success: false, error: e.message };
  }

  // 3. Construire la map guid -> contenu texte (depuis /sources/*.txt).
  // On associe par le nom de fichier indiqué dans plainTextPath (internal://GUID.txt).
  const sourceContents = new Map();
  (data.sourceFiles || []).forEach(f => {
    // f.nom = "GUID.txt" ; on indexe par le GUID (sans .txt)
    const guid = f.nom.replace(/\.txt$/i, '');
    sourceContents.set(guid, f.contenu || '');
    // On indexe aussi par nom complet au cas où plainTextPath pointe ailleurs.
  });
  // Associer chaque source à son contenu via plainTextPath.
  refi.sources.forEach(s => {
    const m = /internal:\/\/([^/]+\.txt)/.exec(s.plainPath || '');
    if (m) {
      const fn = m[1];
      const f = (data.sourceFiles || []).find(x => x.nom === fn);
      if (f) sourceContents.set(s.guid, f.contenu || '');
    }
  });

  // 4. Reconstruire le modèle SonalPi.
  const model = refiToSonalModel(refi, sourceContents);

  // 5. Créer un nouveau corpus local et y écrire les fichiers.
  const result = await window.electronAPI.invoke('refi:creer-corpus-import',
    { projectName: refi.projectName, model });
  if (result && result.success) {
    if (typeof dialog === 'function') dialog('Message', `Corpus REFI-QDA importé : ${model.tabEnt.length} entretien(s), ${model.tabThm.length} thème(s).\nCorpus créé : ${result.chemin}`);
    // Ouvrir le corpus nouvellement créé
    if (typeof window.electronAPI.ouvrirCorpusLocal === 'function') {
      const cr = await window.electronAPI.ouvrirCorpusLocal(result.chemin);
      if (cr && cr.success !== false) {
        // Demander l'affichage dans le renderer (comme pour ouvrirCorpus)
        window.electronAPI.invoke('refi:ouvrir-corpus-cree', result.chemin);
      }
    }
  } else {
    if (typeof dialog === 'function') dialog('Message', 'Échec de la création du corpus : ' + (result && result.error ? result.error : ''));
  }
  return result;
}

// Exposer pour l'UI
window.exporterRefiQda = exporterRefiQda;
window.importerRefiQda = importerRefiQda;
