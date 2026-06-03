// Tests du VRAI code .crp (src/domain/corpus.mjs) sur le VRAI corpus.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertGolden } from './helpers/golden.mjs';
import { parseCorpus, serializeCorpus } from '../src/domain/corpus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fixtures isolées (immuables) : copie figée, jamais éditée par l'appli en GUI.
const CRP = path.join(__dirname, 'fixtures', 'TestInterop1.crp');
const content = fs.readFileSync(CRP, 'utf8');

// Métadonnées runtime, mises à jour à chaque ouverture/sauvegarde : hors contrat de
// format pour le golden du parseur (sinon toute sauvegarde GUI ferait échouer le test).
const VOLATILE = ['lastModified', 'lastAccess', 'fileSize'];
function sansVolatiles(state) {
  const clone = structuredClone(state);
  for (const ent of clone.tabEnt || []) for (const k of VOLATILE) if (k in ent) ent[k] = '<volatile>';
  return clone;
}

test('.crp : parseCorpus normalise le codebook (act/cmpct)', () => {
  const { tabThm } = parseCorpus(content);
  assert.ok(tabThm.length > 0, 'tabThm non vide');
  for (const thm of tabThm) {
    assert.strictEqual(thm.act, true);
    assert.strictEqual(thm.cmpct, false);
  }
});

test('.crp : golden master de parseCorpus (état réel chargé, hors métadonnées volatiles)', () => {
  assertGolden('corpus-TestInterop1', sansVolatiles(parseCorpus(content)));
});

test('.crp : serializeCorpus produit un JSON aux clés racine attendues', () => {
  const state = parseCorpus(content);
  const out = serializeCorpus(state);
  const reparsed = JSON.parse(out);
  assert.deepStrictEqual(
    Object.keys(reparsed).sort(),
    ['tabAnon', 'tabDic', 'tabEnt', 'tabThm', 'tabVar']
  );
});

test('.crp : round-trip serialize(parse) stable', () => {
  const out1 = serializeCorpus(parseCorpus(content));
  const out2 = serializeCorpus(parseCorpus(out1));
  assert.strictEqual(out1, out2);
});
