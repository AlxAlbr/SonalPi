// Tests de RègleAnon pure (domain/anonymisation.mjs).
// Fidélité du format sur la VRAIE fixture ; fusion sur cas synthétiques + équivalence legacy.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCorpus } from '../domain/corpus.mjs';
import { RegleAnon, fusionnerReglesAnon } from '../domain/anonymisation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const state = parseCorpus(fs.readFileSync(CRP, 'utf8'));
const tabAnon = state.tabAnon;

// ── Fidélité + accesseurs ────────────────────────────────────────────────────

test('RegleAnon : toJSON sans perte sur le vrai tabAnon', () => {
  assert.ok(tabAnon.length > 0, 'fixture a des règles');
  for (const o of tabAnon) assert.deepStrictEqual(RegleAnon.fromJSON(o).toJSON(), o);
});

test('RegleAnon : accesseurs ↔ clés gelées (ex. Karine→Marie)', () => {
  const r = RegleAnon.fromJSON(tabAnon[0]);
  assert.strictEqual(r.entite, tabAnon[0].entite);
  assert.strictEqual(r.remplacement, tabAnon[0].remplacement);
  assert.strictEqual(r.occurrences, tabAnon[0].occurrences);
  assert.deepStrictEqual(r.positions, tabAnon[0].matchPositions || []);
});

test('RegleAnon : cle() insensible à la casse, estVide()', () => {
  assert.strictEqual(new RegleAnon({ entite: 'Karine', remplacement: 'Marie' }).cle(), 'karine|marie');
  assert.strictEqual(new RegleAnon({ entite: 'KARINE', remplacement: 'marie' }).cle(), 'karine|marie');
  assert.strictEqual(new RegleAnon({ entite: '', remplacement: '' }).estVide(), true);
  assert.strictEqual(new RegleAnon({ entite: 'X', remplacement: '' }).estVide(), true);
  assert.strictEqual(new RegleAnon({ entite: 'X', remplacement: 'Y' }).estVide(), false);
});

// ── Fusion : équivalence stricte au legacy synchroniserTabAnonGlobal ─────────

// Réimplémentation du chemin principal (map-building) de
// gestion_corpus.js:synchroniserTabAnonGlobal, pour prouver l'équivalence.
function synchroniserLegacy(global, local) {
  const mapGlobal = new Map();
  (global || []).forEach(p => {
    if (p.entite && p.remplacement) {
      mapGlobal.set(`${p.entite.toLowerCase()}|${p.remplacement.toLowerCase()}`, p);
    }
  });
  (local || []).forEach(p => {
    if (!p.entite || !p.remplacement) return;
    const key = `${p.entite.toLowerCase()}|${p.remplacement.toLowerCase()}`;
    if (!mapGlobal.has(key)) {
      mapGlobal.set(key, {
        entite: p.entite, remplacement: p.remplacement,
        occurrences: p.occurrences || 0, indexCourant: p.indexCourant || 0,
        matchPositions: p.matchPositions || [], source: p.source || 'Entretien',
      });
    }
  });
  return Array.from(mapGlobal.values());
}

test('fusionnerReglesAnon reproduit synchroniserTabAnonGlobal (legacy)', () => {
  const global = [
    { entite: 'Karine', remplacement: 'Marie', occurrences: 2, indexCourant: 0, matchPositions: [] },
  ];
  const local = [
    { entite: 'karine', remplacement: 'marie' },              // doublon (casse) → ignoré
    { entite: 'Paul', remplacement: 'Pierre' },               // nouveau → ajouté (source Entretien)
    { entite: '', remplacement: '' },                          // vide → ignoré
  ];
  assert.deepStrictEqual(
    fusionnerReglesAnon(global, local).map(r => r.toJSON()),
    synchroniserLegacy(global, local)
  );
});

test('fusionnerReglesAnon : ajoute les nouvelles règles locales avec source Entretien', () => {
  const res = fusionnerReglesAnon([], [{ entite: 'Paul', remplacement: 'Pierre' }]);
  assert.strictEqual(res.length, 1);
  assert.deepStrictEqual(res[0].toJSON(), {
    entite: 'Paul', remplacement: 'Pierre', occurrences: 0, indexCourant: 0, matchPositions: [], source: 'Entretien',
  });
});

test('fusionnerReglesAnon : ne dédoublonne pas en double et préserve la global', () => {
  const global = [{ entite: 'A', remplacement: 'B' }, { entite: 'C', remplacement: 'D' }];
  const res = fusionnerReglesAnon(global, []);
  assert.deepStrictEqual(res.map(r => r.cle()), ['a|b', 'c|d']);
  assert.deepStrictEqual(res[0].toJSON(), global[0]); // global conservée telle quelle
});
