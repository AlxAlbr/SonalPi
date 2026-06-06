// Tests de l'agrégat Entretien pur (src/domain/entretien.mjs).
// Fidélité du wrapper sur le VRAI entretien (fixture .crp immuable).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCorpus } from '../src/domain/corpus.mjs';
import { Entretien } from '../src/domain/entretien.mjs';
import { Donnee, Variable, Modalite } from '../src/domain/metadonnees.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const state = parseCorpus(fs.readFileSync(CRP, 'utf8'));
const brut = state.tabEnt[0];

test('Entretien : toJSON est sans perte sur le vrai entretien', () => {
  assert.deepStrictEqual(Entretien.fromJSON(brut).toJSON(), brut);
});

test('Entretien : accesseurs explicites ↔ clés gelées', () => {
  const e = Entretien.fromJSON(brut);
  assert.strictEqual(e.identifiant, brut.id);
  assert.strictEqual(e.nom, brut.nom);
  assert.strictEqual(e.notes, brut.notes);
  assert.strictEqual(e.duree, brut.hms);
  assert.strictEqual(e.fichierSonal, brut.rtrPath);
  assert.strictEqual(e.fichierAudio, brut.audioPath);
  assert.strictEqual(e.fichierImage, brut.imgPath);
});

test('Entretien : locuteurs (index 0 = vide) et nomLocuteur', () => {
  const e = Entretien.fromJSON(brut);
  assert.deepStrictEqual(e.locuteurs, brut.tabLoc || []);
  if ((brut.tabLoc || []).length > 1) {
    assert.strictEqual(e.nomLocuteur(1), brut.tabLoc[1]);
  }
});

test('Entretien : donnees()/variables()/modalites() renvoient des instances EAV', () => {
  const e = Entretien.fromJSON(brut);
  const donnees = e.donnees();
  assert.strictEqual(donnees.length, (brut.tabDat || []).length);
  for (const d of donnees) assert.ok(d instanceof Donnee);
  if ((brut.tabDat || []).length > 0) {
    assert.deepStrictEqual(donnees[0].toJSON(), brut.tabDat[0]);
  }
  for (const v of e.variables()) assert.ok(v instanceof Variable);
  for (const m of e.modalites()) assert.ok(m instanceof Modalite);
});

test('Entretien : champs bruts (anon/codebook) passés tels quels', () => {
  const e = Entretien.fromJSON(brut);
  assert.deepStrictEqual(e.reglesAnon, brut.tabAnon || []);
  assert.deepStrictEqual(e.categories, brut.tabThm || []);
});

test('Entretien : construit vide est inerte (pas d\'exception)', () => {
  const e = new Entretien();
  assert.deepStrictEqual(e.donnees(), []);
  assert.deepStrictEqual(e.locuteurs, []);
  assert.deepStrictEqual(e.toJSON(), {});
});
