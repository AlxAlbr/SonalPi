// Golden-file maison (ESM) : indépendant de t.assert.snapshot (Node 22+) pour
// rester portable sur tout Node (la machine a 18.19 par défaut + 24 via nvm).
//
// assertGolden(name, value) :
//   - lit test/golden/<name>.json
//   - si UPDATE_GOLDEN=1 ou fichier absent  -> écrit le golden et passe
//   - sinon                                 -> compare et échoue sur divergence
//
// Régénérer tous les golden :  npm run test:update

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, '..', 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// Tri récursif des clés -> sérialisation canonique stable (indépendante de
// l'ordre d'insertion). Les tableaux conservent leur ordre.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonical(value[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonical(value), null, 2) + '\n';
}

export function assertGolden(name, value) {
  const file = path.join(GOLDEN_DIR, `${name}.json`);
  const serialized = stableStringify(value);

  if (UPDATE || !fs.existsSync(file)) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, serialized, 'utf8');
    return;
  }

  const expected = fs.readFileSync(file, 'utf8');
  assert.strictEqual(
    serialized,
    expected,
    `Golden master "${name}" a divergé.\n` +
      `Si le changement est attendu, régénérez avec : npm run test:update`
  );
}
