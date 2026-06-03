// Tests du VRAI parseur .sonal (src/domain/sonal.mjs) via DOM jsdom, sur le VRAI corpus.

import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { assertGolden } from './helpers/golden.mjs';
import { parseSonal } from '../src/domain/sonal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fixtures isolées (immuables) : copie figée, jamais éditée par l'appli en GUI.
const FIXTURES = path.join(__dirname, 'fixtures');
const ENTRETIENS = ['entretien1', 'entretien2', 'entretien3'];

// Un document jsdom partagé fournit createElement/querySelectorAll comme dans le renderer.
const { window } = new JSDOM('');
const doc = window.document;

for (const nom of ENTRETIENS) {
  test(`.sonal : golden master du vrai parseur (${nom})`, () => {
    const html = fs.readFileSync(path.join(FIXTURES, `${nom}.sonal`), 'utf8');
    assertGolden(`sonal-${nom}`, parseSonal(html, doc));
  });
}
