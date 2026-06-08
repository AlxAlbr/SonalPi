// Tests du domaine EAV pur (domain/metadonnees.mjs).
//
// Fidélité du format + vue calculée : sur la VRAIE fixture (.crp immuable).
// Logique de valeurs (max+1, réutilisation, cascade) : sur cas synthétiques.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertGolden } from './helpers/golden.mjs';
import { parseCorpus } from '../domain/corpus.mjs';
import {
  Variable, Modalite, Donnee,
  unionDonnees, inventorierVariables,
  lireValeur, definirValeur, renommerModalite,
  ajouterVariable, modifierVariable, supprimerVariable, retirerVariableDesDonnees,
} from '../domain/metadonnees.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const state = parseCorpus(fs.readFileSync(CRP, 'utf8'));

// ── Fidélité du mapping noms explicites ↔ clés gelées ────────────────────────

test('EAV : fromJSON→toJSON est sans perte sur le vrai .crp', () => {
  for (const o of state.tabVar) assert.deepStrictEqual(Variable.fromJSON(o).toJSON(), o);
  for (const o of state.tabDic) assert.deepStrictEqual(Modalite.fromJSON(o).toJSON(), o);
  for (const ent of state.tabEnt)
    for (const o of ent.tabDat || []) assert.deepStrictEqual(Donnee.fromJSON(o).toJSON(), o);
});

// ── Vue calculée : union des tabDat locaux (remplace le rebuild legacy) ───────

// Réimplémentation du « rebuild » historique (gestion_data.js:inventaireVariables)
// pour prouver l'équivalence stricte de la nouvelle vue calculée.
function rebuildLegacy(entretiens) {
  const out = [];
  entretiens.forEach(ent => {
    const eId = String(ent.id);
    (ent.tabDat || []).forEach(d => {
      if (d.v == null || d.l == null || d.m == null) return;
      const i = out.findIndex(x => x.e == eId && x.v == d.v && x.l == d.l);
      if (i > -1) out[i].m = d.m;
      else out.push({ e: eId, v: d.v, l: d.l, m: d.m });
    });
  });
  return out;
}

test('EAV : unionDonnees reproduit exactement le rebuild legacy', () => {
  const calculee = unionDonnees(state.tabEnt).map(d => d.toJSON());
  assert.deepStrictEqual(calculee, rebuildLegacy(state.tabEnt));
});

test('EAV : unionDonnees n\'a aucun triplet (e,v,l) en double', () => {
  const vus = new Set();
  for (const d of unionDonnees(state.tabEnt)) {
    const cle = `${d.entretien}|${d.variable}|${d.locuteur}`;
    assert.ok(!vus.has(cle), `triplet dupliqué : ${cle}`);
    vus.add(cle);
  }
});

test('EAV : golden master de la vue calculée corpus', () => {
  assertGolden('metadonnees-union-TestInterop1', unionDonnees(state.tabEnt).map(d => d.toJSON()));
});

test('EAV : inventorierVariables est un sur-ensemble sans libellé en double', () => {
  const variables = inventorierVariables(state.tabEnt, state.tabVar);
  for (const o of state.tabVar)
    assert.ok(variables.some(v => v.code === o.v && v.libelle === o.lib), `variable connue conservée : ${o.lib}`);
  const libelles = variables.map(v => v.libelle);
  assert.strictEqual(libelles.length, new Set(libelles).size, 'libellés uniques');
});

// ── Logique de valeurs (cas synthétiques) ────────────────────────────────────

test('EAV : lireValeur retourne 0/"" si la donnée est absente', () => {
  assert.deepStrictEqual(lireValeur([], 1, 'all', []), { modalite: 0, libelle: '' });
});

test('EAV : lireValeur résout le libellé via le dictionnaire', () => {
  const donnees = [new Donnee('e1', 1, 'all', 2)];
  const modalites = [new Modalite(1, 2, 'Femme')];
  assert.deepStrictEqual(lireValeur(donnees, 1, 'all', modalites), { modalite: 2, libelle: 'Femme' });
});

test('EAV : definirValeur crée une modalité (code = max+1) et la donnée', () => {
  const modalites = [new Modalite(1, 0, ''), new Modalite(1, 3, 'Homme')];
  const r = definirValeur([], modalites, { entretien: 'e1', variable: 1, locuteur: 'all', libelle: 'Femme' });
  assert.strictEqual(r.modalite, 4); // max(0,3)+1
  assert.ok(r.modalites.some(m => m.code === 4 && m.libelle === 'Femme'));
  assert.deepStrictEqual(r.donnees.at(-1).toJSON(), { e: 'e1', v: 1, l: 'all', m: 4 });
});

test('EAV : definirValeur démarre à 1 si aucune modalité n\'existe', () => {
  const r = definirValeur([], [], { entretien: 'e1', variable: 7, locuteur: 0, libelle: 'X' });
  assert.strictEqual(r.modalite, 1);
});

test('EAV : definirValeur réutilise une modalité de même libellé', () => {
  const modalites = [new Modalite(1, 5, 'Femme')];
  const r = definirValeur([], modalites, { entretien: 'e1', variable: 1, locuteur: 'all', libelle: 'Femme' });
  assert.strictEqual(r.modalite, 5);
  assert.strictEqual(r.modalites.length, 1, 'aucune modalité ajoutée');
});

test('EAV : definirValeur écrase la modalité d\'un triplet (e,v,l) existant', () => {
  const donnees = [new Donnee('e1', 1, 'all', 2)];
  const modalites = [new Modalite(1, 2, 'A'), new Modalite(1, 3, 'B')];
  const r = definirValeur(donnees, modalites, { entretien: 'e1', variable: 1, locuteur: 'all', libelle: 'B' });
  assert.strictEqual(r.donnees.length, 1);
  assert.strictEqual(r.donnees[0].modalite, 3);
});

test('EAV : renommerModalite renomme l\'existante ou ajoute la manquante', () => {
  const m0 = [new Modalite(1, 2, 'Ancien')];
  assert.strictEqual(renommerModalite(m0, 1, 2, 'Nouveau')[0].libelle, 'Nouveau');
  const ajoute = renommerModalite(m0, 1, 9, 'Neuf');
  assert.strictEqual(ajoute.length, 2);
  assert.deepStrictEqual(ajoute.at(-1).toJSON(), { v: 1, m: 9, lib: 'Neuf' });
});

// ── Définitions de variables ─────────────────────────────────────────────────

test('EAV : ajouterVariable crée la variable et sa modalité 0', () => {
  const r = ajouterVariable([], [], { code: 1, libelle: 'Sexe', portee: 'loc', privee: 'false' });
  assert.deepStrictEqual(r.variables[0].toJSON(), { v: 1, lib: 'Sexe', champ: 'loc', priv: 'false' });
  assert.deepStrictEqual(r.modalites[0].toJSON(), { v: 1, m: 0, lib: '' });
});

test('EAV : modifierVariable remplace la définition repérée par code', () => {
  const variables = [new Variable(1, 'Sexe', 'loc', 'false')];
  const r = modifierVariable(variables, { code: 1, libelle: 'Genre', portee: 'loc', privee: 'true' });
  assert.deepStrictEqual(r[0].toJSON(), { v: 1, lib: 'Genre', champ: 'loc', priv: 'true' });
});

test('EAV : supprimerVariable retire variable, modalités et données', () => {
  const variables = [new Variable(1, 'A', 'gen', 'false'), new Variable(2, 'B', 'gen', 'false')];
  const modalites = [new Modalite(1, 1, 'x'), new Modalite(2, 1, 'y')];
  const donnees = [new Donnee('e1', 1, 'all', 1), new Donnee('e1', 2, 'all', 1)];
  const r = supprimerVariable(variables, modalites, 1);
  assert.deepStrictEqual(r.variables.map(v => v.code), [2]);
  assert.deepStrictEqual(r.modalites.map(m => m.variable), [2]);
  assert.deepStrictEqual(retirerVariableDesDonnees(donnees, 1).map(d => d.variable), [2]);
});
