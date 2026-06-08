// Tests de l'agrégat Document (domain/document.mjs) via jsdom.
// Structure sur de VRAIES fixtures .sonal ; calques (codage/anon/commentaire) sur cas contrôlés.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { Document, Segment, Fragment, Extrait, renumeroter } from '../domain/document.mjs';
import { parseSonal, segments as segmentsPlats } from '../domain/sonal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const { window } = new JSDOM('');
const doc = window.document;

const sonal1 = fs.readFileSync(path.join(FIXTURES, 'entretien1.sonal'), 'utf8');

test('Document : fromSonal construit autant de segments que le lecteur plat', () => {
  const document = Document.fromSonal(sonal1, doc);
  assert.strictEqual(document.segments().length, segmentsPlats(sonal1, doc).length);
  for (const s of document.segments()) assert.ok(s instanceof Segment);
});

test('Document : 1er segment — champs ↔ data-* (fixture entretien1)', () => {
  const seg = Document.fromSonal(sonal1, doc).segments()[0];
  // <span class="lblseg sautlig ligloc" data-deb="0.700" data-fin="4.317" data-loc="3" data-rksg="0" data-statut="deb" data-nomloc="commentaire">
  assert.strictEqual(seg.rang, 0);
  assert.strictEqual(seg.debut, 0.7);
  assert.strictEqual(seg.fin, 4.317);
  assert.strictEqual(seg.locuteur, '3');
  assert.strictEqual(seg.statut, 'deb');
  assert.strictEqual(seg.nomLocuteur, 'commentaire');
  assert.ok(seg.fragments().length >= 1);
  for (const f of seg.fragments()) assert.ok(f instanceof Fragment);
});

test('Document : fragments du 1er segment — rang/longueur/segment/texte + codage cat_005', () => {
  const frags = Document.fromSonal(sonal1, doc).segments()[0].fragments();
  const f0 = frags[0];
  assert.strictEqual(f0.rang, 1);
  assert.strictEqual(f0.longueur, 5);
  assert.strictEqual(f0.segment, 0);
  assert.strictEqual(f0.texte, 'Bonjour, merci ');
  assert.strictEqual(f0.estCode(), false);
  // Le 2e fragment porte la catégorie cat_005.
  const code = frags.find((f) => f.categories.includes('cat_005'));
  assert.ok(code, 'un fragment cat_005 existe');
  assert.strictEqual(code.estCode(), true);
});

test('Document : locuteurs() cohérent avec parseSonal', () => {
  const document = Document.fromSonal(sonal1, doc);
  const attendus = parseSonal(sonal1, doc).locuteurs.map((l) => `${l.loc}|${l.nomloc ?? ''}`).sort();
  const obtenus = document.locuteurs().map((l) => `${l.loc}|${l.nomloc ?? ''}`).sort();
  assert.deepStrictEqual(obtenus, attendus);
});

// ── Calques inline sur cas contrôlés ─────────────────────────────────────────

test('Fragment : détecte anon / anon-exception / commentaire', () => {
  const html = `
    <span class="lblseg" data-rksg="0" data-loc="1">
      <span data-rk="1" data-sg="0" data-len="1" class="anon" data-pseudo="Marie">Karine</span>
      <span data-rk="2" data-sg="0" data-len="1" class="anon-exception">Paul</span>
      <span data-rk="3" data-sg="0" data-len="1" data-obs="à vérifier" data-auth="MB" data-finobs="5">texte</span>
      <span data-rk="4" data-sg="0" data-len="1" class="cat_001 cat_002">codé</span>
    </span>`;
  const frags = Document.fromHtml(html, doc).segments()[0].fragments();
  assert.deepStrictEqual(frags[0].anon, { type: 'anon', pseudo: 'Marie', nt: null });
  assert.deepStrictEqual(frags[1].anon, { type: 'anon-exception', pseudo: null, nt: null });
  assert.strictEqual(frags[2].anon, null);
  assert.deepStrictEqual(frags[2].commentaire, { auteur: 'MB', obs: 'à vérifier', finobs: '5' });
  assert.deepStrictEqual(frags[3].categories, ['cat_001', 'cat_002']);
});

// ── Round-trip : Document.toSonal puis relecture ─────────────────────────────

// ── Requêtes de codage (3b) ──────────────────────────────────────────────────

test('Document : categoriesPresentes / fragmentsCodes (fixture entretien1)', () => {
  const document = Document.fromSonal(sonal1, doc);
  assert.ok(document.categoriesPresentes().includes('cat_005'));
  assert.ok(document.fragmentsCodes().every((f) => f.estCode()));
  assert.ok(document.fragmentsCodes().length <= document.fragments().length);
});

test('Document : extraitsParCategorie regroupe les fragments contigus d\'une catégorie', () => {
  // cat_001 : a+b contigus (1 extrait), cat_002 rompt, puis d (seg0) + e (seg1)
  // contigus → fusionnés en UN extrait qui enjambe le segment.
  const html = `
    <span class="lblseg" data-rksg="0" data-loc="1">
      <span data-rk="1" data-sg="0" data-len="1" class="cat_001">a</span>
      <span data-rk="2" data-sg="0" data-len="1" class="cat_001">b</span>
      <span data-rk="3" data-sg="0" data-len="1" class="cat_002">c</span>
      <span data-rk="4" data-sg="0" data-len="1" class="cat_001">d</span>
    </span>
    <span class="lblseg" data-rksg="1" data-loc="1">
      <span data-rk="5" data-sg="1" data-len="1" class="cat_001">e</span>
    </span>`;
  const document = Document.fromHtml(html, doc);
  const ext = document.extraitsParCategorie('cat_001');
  assert.strictEqual(ext.length, 2);
  assert.ok(ext.every((e) => e instanceof Extrait));
  assert.deepStrictEqual(ext.map((e) => e.texte), ['ab', 'de']); // d(seg0)+e(seg1) fusionnés
  assert.strictEqual(ext[0].debut, 1);
  assert.strictEqual(ext[0].fin, 2);
  assert.strictEqual(ext[0].categorie, 'cat_001');
});

test('Document : un extrait peut enjamber deux segments', () => {
  // Dernier fragment de seg0 et premier de seg1 portent cat_001, contigus → 1 extrait.
  const html = `
    <span class="lblseg" data-rksg="0" data-loc="1">
      <span data-rk="1" data-sg="0" data-len="1" class="">x</span>
      <span data-rk="2" data-sg="0" data-len="1" class="cat_001">fin seg0</span>
    </span>
    <span class="lblseg" data-rksg="1" data-loc="1">
      <span data-rk="3" data-sg="1" data-len="1" class="cat_001">début seg1</span>
    </span>`;
  const ext = Document.fromHtml(html, doc).extraitsParCategorie('cat_001');
  assert.strictEqual(ext.length, 1);
  assert.deepStrictEqual(ext[0].fragments().map((f) => f.texte), ['fin seg0', 'début seg1']);
});

test('Document : extraits(predicat) — ensemble de catégories actives (ex. synthèse OU)', () => {
  const html = `
    <span class="lblseg" data-rksg="0" data-loc="1">
      <span data-rk="1" data-sg="0" data-len="1" class="cat_001">a</span>
      <span data-rk="2" data-sg="0" data-len="1" class="cat_002">b</span>
      <span data-rk="3" data-sg="0" data-len="1" class="">c</span>
      <span data-rk="4" data-sg="0" data-len="1" class="cat_001">d</span>
    </span>`;
  const actifs = new Set(['cat_001', 'cat_002']);
  const ext = Document.fromHtml(html, doc).extraits((f) => f.categories.some((c) => actifs.has(c)));
  assert.deepStrictEqual(ext.map((e) => e.texte), ['ab', 'd']); // a+b fusionnés, c rompt, d seul
});

// ── Renumérotation (3c-i) ────────────────────────────────────────────────────

test('renumeroter : data-rk séquentiel, data-rksg par segment, data-sg = rang segment', () => {
  // rangs volontairement faux en entrée.
  const html = `
    <span class="lblseg" data-rksg="9">
      <span data-rk="50" data-sg="7" class="cat_001">a</span>
      <span data-rk="51" data-sg="7" class="">b</span>
    </span>
    <span class="lblseg" data-rksg="3">
      <span data-rk="80" data-sg="1" class="">c</span>
    </span>`;
  const d = Document.fromHtml(renumeroter(html, doc), doc);
  const segs = d.segments();
  assert.deepStrictEqual(segs.map((s) => s.rang), [0, 1]);
  assert.deepStrictEqual(segs[0].fragments().map((f) => f.rang), [1, 2]);
  assert.deepStrictEqual(segs[1].fragments().map((f) => f.rang), [3]);
  // data-sg de chaque fragment = rang (rksg) de son segment
  assert.deepStrictEqual(segs[0].fragments().map((f) => f.segment), [0, 0]);
  assert.deepStrictEqual(segs[1].fragments().map((f) => f.segment), [1]);
});

test('renumeroter : idempotent', () => {
  const corps = new JSDOM(sonal1).window.document.getElementById('contenuText')?.innerHTML ?? '';
  const une = renumeroter(corps, doc);
  const deux = renumeroter(une, doc);
  assert.strictEqual(deux, une);
});

test('renumeroter : préserve le codage (les classes cat_xxx restent)', () => {
  const corps = new JSDOM(sonal1).window.document.getElementById('contenuText')?.innerHTML ?? '';
  const avant = Document.fromHtml(corps, doc).categoriesPresentes().sort();
  const apres = Document.fromHtml(renumeroter(corps, doc), doc).categoriesPresentes().sort();
  assert.deepStrictEqual(apres, avant);
});

test('Document : toSonal puis fromSonal préserve les segments', () => {
  const d1 = Document.fromSonal(sonal1, doc);
  const regenere = d1.toSonal({ tabLoc: [], tabThm: [], tabVar: [], tabDic: [], tabDat: [], notes: '', tabAnon: [] });
  const d2 = Document.fromSonal(regenere, doc);
  assert.deepStrictEqual(d2.segments().map((s) => s.toJSON()), d1.segments().map((s) => s.toJSON()));
});
