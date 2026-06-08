// Tests du Codebook pur (domain/codebook.mjs).
// Fidélité du format + hiérarchie sur la VRAIE fixture .crp ; activation sur cas synthétiques.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCorpus } from '../domain/corpus.mjs';
import { Categorie, Codebook } from '../domain/codebook.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const state = parseCorpus(fs.readFileSync(CRP, 'utf8'));
const tabThm = state.tabThm;

// ── Fidélité du mapping ──────────────────────────────────────────────────────

test('Codebook : toJSON sans perte sur le vrai tabThm', () => {
  for (const o of tabThm) assert.deepStrictEqual(Categorie.fromJSON(o).toJSON(), o);
  assert.deepStrictEqual(Codebook.fromJSON(tabThm).toJSON(), tabThm);
});

test('Categorie : accesseurs explicites ↔ clés gelées', () => {
  const c = Categorie.fromJSON(tabThm[1]); // cat_002, rang "1"
  assert.strictEqual(c.code, tabThm[1].code);
  assert.strictEqual(c.nom, tabThm[1].nom);
  assert.strictEqual(c.couleur, tabThm[1].couleur);
  assert.strictEqual(c.taille, tabThm[1].taille);
  assert.strictEqual(c.compacte, tabThm[1].cmpct);
  assert.strictEqual(c.niveau, Number(tabThm[1].rang));
  assert.strictEqual(c.active, tabThm[1].act);
});

// ── Hiérarchie : équivalence stricte au legacy thematisation.js:nbEnfants ─────

function nbEnfantsLegacy(tab, rk) {
  let rang = tab[rk]?.rang; if (rang == 'undefined') rang = 0;
  let n = 0;
  for (let thm = rk + 1; thm < tab.length; thm++) {
    let rang2 = tab[thm]?.rang; if (rang2 == 'undefined') rang2 = 0;
    if (Number(rang2) > Number(rang)) n++; else return n;
  }
  return n;
}

test('Codebook : nbDescendants reproduit exactement nbEnfants (legacy)', () => {
  const cb = Codebook.fromJSON(tabThm);
  for (let i = 0; i < tabThm.length; i++) {
    assert.strictEqual(cb.nbDescendants(i), nbEnfantsLegacy(tabThm, i), `index ${i}`);
  }
});

test('Codebook : racine cat_001 possède des enfants ; cat_002 a pour parent cat_001', () => {
  const cb = Codebook.fromJSON(tabThm);
  // Fixture : cat_001 (rang 0) suivie de cat_002/cat_003 (rang 1).
  assert.strictEqual(cb.racines()[0].code, 'cat_001');
  assert.strictEqual(cb.aEnfants(0), true);
  assert.ok(cb.nbDescendants(0) >= 2);
  assert.ok(cb.enfantsDirects(0).some(c => c.code === 'cat_002'));
  assert.strictEqual(cb.parent(1)?.code, 'cat_001');
});

test('Codebook : parCode/indexParCode', () => {
  const cb = Codebook.fromJSON(tabThm);
  assert.strictEqual(cb.indexParCode('cat_002'), 1);
  assert.strictEqual(cb.parCode('cat_002').nom, tabThm[1].nom);
  assert.strictEqual(cb.parCode('cat_inexistant'), undefined);
});

// ── Hiérarchie sur cas synthétique (arbre contrôlé) ──────────────────────────

test('Codebook : descendants/enfantsDirects/parent sur un arbre 0>1>2', () => {
  const cb = Codebook.fromJSON([
    { code: 'A', rang: '0', act: true },   // 0
    { code: 'B', rang: '1', act: true },   // 1  (enfant de A)
    { code: 'C', rang: '2', act: true },   // 2  (enfant de B)
    { code: 'D', rang: '1', act: true },   // 3  (enfant de A)
    { code: 'E', rang: '0', act: true },   // 4  (racine)
  ]);
  assert.strictEqual(cb.nbDescendants(0), 3);                          // B, C, D
  assert.deepStrictEqual(cb.descendants(0).map(c => c.code), ['B', 'C', 'D']);
  assert.deepStrictEqual(cb.enfantsDirects(0).map(c => c.code), ['B', 'D']); // pas C
  assert.strictEqual(cb.parent(2)?.code, 'B');
  assert.strictEqual(cb.parent(1)?.code, 'A');
  assert.strictEqual(cb.parent(4), undefined);                         // racine
  assert.deepStrictEqual(cb.racines().map(c => c.code), ['A', 'E']);
});

// ── Activation ───────────────────────────────────────────────────────────────

test('Codebook : nbActives / auMoinsUneActive', () => {
  const actif = Codebook.fromJSON([{ code: 'A', rang: '0', act: false }, { code: 'B', rang: '0', act: true }]);
  assert.strictEqual(actif.nbActives(), 1);
  assert.strictEqual(actif.auMoinsUneActive(), true);

  const inactif = Codebook.fromJSON([{ code: 'A', rang: '0', act: false }]);
  assert.strictEqual(inactif.nbActives(), 0);
  assert.strictEqual(inactif.auMoinsUneActive(), false);
});
