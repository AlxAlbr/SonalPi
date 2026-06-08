// Tests de l'agrégat racine Corpus (domain/corpus.mjs).
// Getters dérivés sur méta synthétique ; sous-objets sur la VRAIE fixture .crp.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCorpus, Corpus } from '../domain/corpus.mjs';
import { Entretien } from '../domain/entretien.mjs';
import { Variable, Modalite, unionDonnees } from '../domain/metadonnees.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const state = parseCorpus(fs.readFileSync(CRP, 'utf8'));

function corpusFixture(meta = {}) {
  return Corpus.fromParts({ corpus: meta, tabEnt: state.tabEnt, tabVar: state.tabVar, tabDic: state.tabDic });
}

test('Corpus : getters dérivés local/collaboratif/gitlab depuis type', () => {
  const local = corpusFixture({ type: 'local' });
  assert.strictEqual(local.estLocal, true);
  assert.strictEqual(local.estCollaboratif, false);
  assert.strictEqual(local.estGitlab, false);

  const distant = corpusFixture({ type: 'distant' });
  assert.strictEqual(distant.estLocal, false);
  assert.strictEqual(distant.estCollaboratif, true);
  assert.strictEqual(distant.estDistant, true);
  assert.strictEqual(distant.estGitlab, false);

  const gitlab = corpusFixture({ type: 'gitlab' });
  assert.strictEqual(gitlab.estCollaboratif, true);
  assert.strictEqual(gitlab.estDistant, false);
  assert.strictEqual(gitlab.estGitlab, true);
});

test('Corpus : aucun type ouvert → ni local ni collaboratif (pas de faux positif)', () => {
  const vide = new Corpus();
  assert.strictEqual(vide.estLocal, false);
  assert.strictEqual(vide.estCollaboratif, false);
  assert.deepStrictEqual(vide.entretiens(), []);
});

test('Corpus : méta exposée (dossier/nomFichier/url)', () => {
  const c = corpusFixture({ type: 'local', folder: '/tmp/corpus', fileName: 'x.crp', url: 'http://h/x' });
  assert.strictEqual(c.dossier, '/tmp/corpus');
  assert.strictEqual(c.nomFichier, 'x.crp');
  assert.strictEqual(c.url, 'http://h/x');
});

test('Corpus : fromParts construit les sous-objets typés', () => {
  const c = corpusFixture();
  assert.strictEqual(c.entretiens().length, state.tabEnt.length);
  for (const e of c.entretiens()) assert.ok(e instanceof Entretien);
  assert.strictEqual(c.variables().length, state.tabVar.length);
  for (const v of c.variables()) assert.ok(v instanceof Variable);
  for (const m of c.modalites()) assert.ok(m instanceof Modalite);
});

test('Corpus : entretienParId retrouve par identité (comparaison lâche)', () => {
  const id = state.tabEnt[0].id;
  const c = corpusFixture();
  const e = c.entretienParId(id);
  assert.ok(e instanceof Entretien);
  assert.strictEqual(e.identifiant, id);
});

test('Corpus : donnees() = union des tabDat locaux (cohérent avec metadonnees.unionDonnees)', () => {
  const c = corpusFixture();
  assert.deepStrictEqual(
    c.donnees().map(d => d.toJSON()),
    unionDonnees(state.tabEnt).map(d => d.toJSON())
  );
});

test('Corpus : toEntretiens/toVariables/toModalites re-sérialisent sans perte', () => {
  const c = corpusFixture();
  assert.deepStrictEqual(c.toEntretiens(), state.tabEnt);
  assert.deepStrictEqual(c.toVariables(), state.tabVar);
  assert.deepStrictEqual(c.toModalites(), state.tabDic);
});
