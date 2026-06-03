// Tests unitaires de LocalStorage sur un vrai fs (dossier temporaire).
// Le module est CommonJS : Node ESM l'importe via l'export par défaut.

import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import LocalStorage from '../modules/storage/LocalStorage.js';

const storage = new LocalStorage();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonal-localstorage-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('ecrireFichier + lireFichier : round-trip UTF-8', async () => {
  const p = path.join(dir, 'a.txt');
  const contenu = 'Bonjour — accents: éàü, ★ ok';
  const w = await storage.ecrireFichier(p, contenu);
  assert.strictEqual(w.success, true);

  const r = await storage.lireFichier(p);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.content, contenu);
  assert.strictEqual(typeof r.size, 'number');
  assert.match(r.modified, /^\d{4}-\d{2}-\d{2}T/); // ISO
});

test('lireFichier : échec propre sur fichier absent', async () => {
  const r = await storage.lireFichier(path.join(dir, 'nope.txt'));
  assert.strictEqual(r.success, false);
  assert.ok(r.error);
});

test('verifierExistence : vrai / faux', async () => {
  const p = path.join(dir, 'b.txt');
  assert.strictEqual(await storage.verifierExistence(p), false);
  await storage.ecrireFichier(p, 'x');
  assert.strictEqual(await storage.verifierExistence(p), true);
});

test('derniereModif : ISO si présent, null si absent', async () => {
  const p = path.join(dir, 'c.txt');
  assert.strictEqual(await storage.derniereModif(p), null);
  await storage.ecrireFichier(p, 'x');
  assert.match(await storage.derniereModif(p), /^\d{4}-\d{2}-\d{2}T/);
});

test('listerFichiers : forme { name, path }', async () => {
  const sub = path.join(dir, 'liste');
  fs.mkdirSync(sub);
  await storage.ecrireFichier(path.join(sub, 'r1.rcl'), '1');
  await storage.ecrireFichier(path.join(sub, 'note.txt'), '2');

  const res = await storage.listerFichiers(sub);
  assert.strictEqual(res.success, true);
  const noms = res.files.map(f => f.name).sort();
  assert.deepStrictEqual(noms, ['note.txt', 'r1.rcl']);
  for (const f of res.files) {
    assert.ok('name' in f && 'path' in f);
    assert.strictEqual(f.path, path.join(sub, f.name));
  }
  // filtrage .rcl à la charge de l'appelant (comme dans lister-recueils)
  assert.deepStrictEqual(res.files.filter(f => f.name.endsWith('.rcl')).map(f => f.name), ['r1.rcl']);
});

test('supprimerFichier : supprime puis n\'existe plus', async () => {
  const p = path.join(dir, 'd.txt');
  await storage.ecrireFichier(p, 'x');
  const res = await storage.supprimerFichier(p);
  assert.strictEqual(res.success, true);
  assert.strictEqual(await storage.verifierExistence(p), false);
});

test('verrous : no-op renvoyant success (travail local mono-utilisateur)', async () => {
  const p = path.join(dir, 'e.txt');
  assert.deepStrictEqual(await storage.verrouillerFichier(p), { success: true, readOnly: false });
  assert.deepStrictEqual(await storage.deverrouillerFichier(p), { success: true });
  assert.deepStrictEqual(await storage.rafraichirVerrou(p), { success: true });
  const v = await storage.verifierVerrou(p);
  assert.strictEqual(v.success, true);
  assert.strictEqual(v.locked, false);
});
