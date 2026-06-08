// Tests du VRAI parseur .sonal (domain/sonal.mjs) via DOM jsdom, sur le VRAI corpus.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { assertGolden } from './helpers/golden.mjs';
import { parseSonal, serializeSonal } from '../domain/sonal.mjs';
import { Entretien } from '../domain/entretien.mjs';

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

// ── Écriture (.sonal) : golden de format + round-trip parse(serialize) ───────

test('.sonal : golden master de serializeSonal (format figé)', () => {
  const sonal = serializeSonal({
    tabLoc: ['', 'Enquêteur', 'Karine'],
    tabThm: [{ code: 'cat_001', nom: 'Thème', couleur: '#ff0000', taille: 18 }],
    tabVar: [{ v: 1, lib: 'Sexe', champ: 'loc', priv: 'false' }],
    tabDic: [{ v: 1, m: 1, lib: 'F' }],
    tabDat: [{ e: '1', v: 1, l: 2, m: 1 }],
    notes: 'Quelques notes',
    html: '<span class="lblseg" data-rksg="0" data-deb="0.0" data-fin="1.0" data-loc="1">Bonjour</span>',
    tabAnon: [{ entite: 'Karine', remplacement: 'Marie', occurrences: 0, indexCourant: 0, matchPositions: [] }],
  });
  assertGolden('sonal-serialize-synthetique', sonal);
});

// Round-trip sur de VRAIES données : ré-emballer le corps d'un .sonal via
// serializeSonal ne doit pas altérer ce que parseSonal en extrait.
for (const nom of ENTRETIENS) {
  test(`.sonal : round-trip parse(serialize) préserve les invariants (${nom})`, () => {
    const html = fs.readFileSync(path.join(FIXTURES, `${nom}.sonal`), 'utf8');
    const corps = new JSDOM(html).window.document.getElementById('contenuText')?.innerHTML ?? '';
    const regenere = serializeSonal({
      tabLoc: [], tabThm: [], tabVar: [], tabDic: [], tabDat: [], notes: '', html: corps, tabAnon: [],
    });
    assert.deepStrictEqual(parseSonal(regenere, doc), parseSonal(html, doc));
  });
}

test('.sonal : Entretien.serialiserSonal utilise ses propres données', () => {
  const ent = Entretien.fromJSON({
    id: '1', nom: 'E1', tabLoc: ['', 'A'], notes: 'n',
    tabDat: [{ e: '1', v: 1, l: 1, m: 2 }],
    tabAnon: [{ entite: 'X', remplacement: 'Y' }],
  });
  const html = '<span class="lblseg" data-rksg="0" data-loc="1">x</span>';
  const direct = serializeSonal({
    tabLoc: ['', 'A'], tabDat: [{ e: '1', v: 1, l: 1, m: 2 }], notes: 'n',
    tabAnon: [{ entite: 'X', remplacement: 'Y' }],
    tabThm: [], tabVar: [], tabDic: [], html,
  });
  assert.strictEqual(ent.serialiserSonal({ html, tabThm: [], tabVar: [], tabDic: [] }), direct);
});
