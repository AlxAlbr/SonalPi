// Tests du domaine de conversions pur (domain/conversions.mjs).
//
// Logique chaîne→structure : sur cas synthétiques déterministes (convertPURGE,
// tabSegToSonal) + extraction des blocs JSON d'un .sonal (extractFichierSonal).
// Aucune dépendance jsdom : `extractFichierSonal` reçoit un `doc` stub minimal
// (il ne s'en sert que pour getElementById('txtnotes'|'contenuText')).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertPURGE, tabSegToSonal, extractFichierSonal, Phrasifier, convertSpeaker } from '../domain/conversions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── tabSegToSonal : un segment → un span lblseg compacté ─────────────────────
test('tabSegToSonal : structure du span et data-len (tokens)', () => {
  // tabSeg[s] = [ _, deb, fin, loc, texte, sel, _ ]
  const tabSeg = [[undefined, '0', '2', '1', 'Bonjour le monde']];
  const html = tabSegToSonal(tabSeg, [''], '');

  assert.match(html, /class="lblseg sautlig"/);
  assert.match(html, /data-deb="0"/);
  assert.match(html, /data-fin="2"/);
  assert.match(html, /data-loc="1"/);
  // "Bonjour le monde" = Bonjour · ␣ · le · ␣ · monde = 5 tokens
  assert.match(html, /data-len="5"/);
  assert.match(html, /Bonjour le monde<\/span><\/span>/);
});

test('tabSegToSonal : segment au texte vide est ignoré', () => {
  const tabSeg = [[undefined, '0', '1', '1', '   '], [undefined, '1', '2', '1', 'Salut']];
  const html = tabSegToSonal(tabSeg, [''], '');
  assert.equal((html.match(/class="lblseg/g) || []).length, 1);
  assert.match(html, /Salut/);
});

test('tabSegToSonal : locuteurs émis en bloc loc-json quand > 1', () => {
  const html = tabSegToSonal([[undefined, '0', '1', '1', 'x']], ['', 'Alice', 'Bob'], '');
  assert.match(html, /id="loc-json"/);
  assert.match(html, /Alice/);
  assert.match(html, /Bob/);
});

// ── convertPURGE : .purge → { formatSonal, segCourant } ──────────────────────
test('convertPURGE : extrait les segments, le format Sonal et segCourant', () => {
  const purge = [
    '\tAlice\tBob',                 // ligne 0 : locuteurs
    'segcur\t5\tx',                 // ligne 1 : position atteinte → segCourant = "5"
    'vitesse\t1',                   // ligne 2 : vitesse de lecture
    'Memo :',                       // ligne 3 : début des notes
    'ma note',                      // ligne 4 : note
    'Début\tFin\tLoc\tTexte',       // ligne 5 : en-tête des segments
    '0\t1.5\t1\tBonjour',           // ligne 6 : segment
    '1.5\t3\t2\tSalut',             // ligne 7 : segment
  ].join('\n');

  const res = convertPURGE(purge);

  assert.equal(res.segCourant, '5');
  assert.equal(typeof res.formatSonal, 'string');
  // deux segments matérialisés
  assert.equal((res.formatSonal.match(/class="lblseg/g) || []).length, 2);
  assert.match(res.formatSonal, /Bonjour/);
  assert.match(res.formatSonal, /Salut/);
  // locuteurs présents
  assert.match(res.formatSonal, /Alice/);
});

test('convertPURGE : contenu vide → undefined (comportement d\'origine)', () => {
  assert.equal(convertPURGE(''), undefined);
  assert.equal(convertPURGE(null), undefined);
});

// ── extractFichierSonal : blocs JSON + notes/contenu (doc stub) ──────────────
const stubDoc = (notes, html) => ({
  getElementById: (id) =>
    id === 'txtnotes' ? { innerHTML: notes }
    : id === 'contenuText' ? { innerHTML: html }
    : null,
});

test('extractFichierSonal : parse les blocs JSON embarqués + notes/html', () => {
  const htmlString = `<!DOCTYPE html><html><body>
    <script id="var-json" type="application/json">[{"v":1,"lib":"Sexe"}]</script>
    <script id="dic-json" type="application/json">[{"v":1,"m":1,"lib":"F"}]</script>
    <div id="contenuText"><span>hi</span></div>
    </body></html>`;

  const res = extractFichierSonal(htmlString, stubDoc('  mes notes  ', '<span>hi</span>'));

  assert.deepEqual(res.tabVar, [{ v: 1, lib: 'Sexe' }]);
  assert.deepEqual(res.tabDic, [{ v: 1, m: 1, lib: 'F' }]);
  assert.equal(res.tabThm, null);   // bloc cat-json absent
  assert.equal(res.tabAnon, null);  // bloc anon-json absent
  assert.equal(res.notes, 'mes notes');
  assert.equal(res.html, '<span>hi</span>');
});

test('extractFichierSonal : smoke test sur une vraie fixture .sonal', () => {
  const sonal = fs.readFileSync(path.join(__dirname, 'fixtures', 'entretien1.sonal'), 'utf8');
  const res = extractFichierSonal(sonal, stubDoc('', ''));
  assert.equal(typeof res, 'object');
  // les champs attendus existent (arrays ou null, jamais une exception)
  for (const k of ['tabLoc', 'tabThm', 'tabVar', 'tabDic', 'tabDat', 'tabAnon']) {
    assert.ok(res[k] === null || Array.isArray(res[k]), `${k} doit être array|null`);
  }
});

// ── Phrasifier : fusion des segments jusqu'à ponctuation forte ───────────────
test('Phrasifier : fusionne jusqu\'à une fin de phrase (. ? !)', () => {
  const tabSeg = [
    [undefined, '0', '1', '1', 'Bonjour'],
    [undefined, '1', '2', '1', ' le monde.'],
    [undefined, '2', '3', '1', 'Salut !'],
  ];
  Phrasifier(tabSeg);
  assert.equal(tabSeg.length, 2);
  assert.equal(tabSeg[0][4], 'Bonjour le monde.');
  assert.equal(tabSeg[0][2], '2');   // fin reprise du segment fusionné
  assert.equal(tabSeg[1][4], 'Salut !');
});

// ── convertSpeaker : extraction des locuteurs « Speaker N » ──────────────────
test('convertSpeaker : affecte les locuteurs et retire les préfixes', () => {
  const tabSeg = [
    [undefined, '0', '1', '0', 'Speaker 0: bonjour'],
    [undefined, '1', '2', '0', 'Speaker 1: salut'],
  ];
  const res = convertSpeaker(tabSeg);
  assert.deepEqual(res.locut, ['', 'Speaker 1', 'Speaker 2']);
  assert.equal(res.tabSeg[0][3], 1);
  assert.equal(res.tabSeg[0][4], 'bonjour');
  assert.equal(res.tabSeg[1][4], 'salut');
});

test('convertSpeaker : nettoie les « Speaker i: » intempestifs dans le corps', () => {
  const tabSeg = [[undefined, '0', '1', '0', 'texte Speaker 3: parasite']];
  const res = convertSpeaker(tabSeg);
  assert.equal(res.locut.length, 1);          // aucun locuteur en tête de segment
  assert.equal(res.tabSeg[0][4], 'texte  parasite');
});

// ── TimeToSec + convertJSON/SRT/VTT/TXT ───────────────────────────
import { TimeToSec, convertJSON, convertSRT, convertVTT, convertTXT } from '../domain/conversions.mjs';

test('TimeToSec : HH:MM:SS(,ms) → secondes', () => {
  assert.equal(TimeToSec('00:01:30'), 90);
  assert.equal(TimeToSec('01:00:00'), 3600);
  assert.equal(TimeToSec('00:00:01,5'), 1.5); // virgule décimale
  assert.equal(TimeToSec('00:05'), 5);
});

test('convertJSON : tableau Whisper → { tabSeg, locut }', () => {
  const arr = [
    { start: 0, end: 1.5, text: 'Bonjour', avg_logprob: -0.1 },
    { start: 1.5, end: 3, text: 'Salut', avg_logprob: -0.2 },
  ];
  const res = convertJSON(arr);
  assert.equal(res.tabSeg.length, 2);
  assert.equal(res.tabSeg[0][1], '0.00');
  assert.equal(res.tabSeg[0][4], 'Bonjour');
  assert.deepEqual(res.locut, ['']);
});

test('convertSRT : deux cues → formatSonal à 2 segments', () => {
  const srt = [
    '1', '00:00:00,000 --> 00:00:02,000', 'Bonjour le monde.', '',
    '2', '00:00:02,000 --> 00:00:04,000', 'Salut tout le monde.',
  ].join('\n');
  const res = convertSRT(srt);
  assert.equal((res.formatSonal.match(/class="lblseg/g) || []).length, 2);
  assert.match(res.formatSonal, /Bonjour le monde\./);
  assert.match(res.formatSonal, /Salut tout le monde\./);
  assert.deepEqual(res.locuteurs, ['']); // aucun "Speaker N"
});

test('convertVTT : balises <v Nom> → locuteurs nommés', () => {
  const vtt = [
    'WEBVTT', '',
    '00:00:00.000 --> 00:00:02.000', '<v Alice>Bonjour', '',
    '00:00:02.000 --> 00:00:04.000', '<v Bob>Salut',
  ].join('\n');
  const res = convertVTT(vtt);
  assert.deepEqual(res.locuteurs, ['', 'Alice', 'Bob']);
  assert.match(res.formatSonal, /Bonjour/);
  assert.match(res.formatSonal, /Salut/);
});

test('convertTXT : format C (texte brut) → un segment par ligne', () => {
  const txt = 'Première ligne de texte.\nDeuxième ligne.';
  const res = convertTXT(txt);
  assert.equal((res.formatSonal.match(/class="lblseg/g) || []).length, 2);
  assert.match(res.formatSonal, /Première ligne de texte\./);
  assert.deepEqual(res.locuteurs, ['']);
});

test('convertTXT : format B ("Nom: texte") → locuteurs', () => {
  const txt = 'Alice: Bonjour tout le monde\nBob: Salut';
  const res = convertTXT(txt);
  assert.deepEqual(res.locuteurs, ['', 'Alice', 'Bob']);
  assert.match(res.formatSonal, /Bonjour tout le monde/);
});
