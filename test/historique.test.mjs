// Tests de HistoriqueDocument (src/domain/document.mjs) — logique pure undo/redo.

import { test } from 'node:test';
import assert from 'node:assert';
import { HistoriqueDocument } from '../src/domain/document.mjs';

test('Historique : séquence memoriser → annuler → retablir', () => {
  const h = new HistoriqueDocument();
  // États successifs A → B → C ; on mémorise avant chaque changement.
  h.memoriser('A');
  h.memoriser('B');                       // annuler=[A,B]
  assert.strictEqual(h.annuler('C'), 'B'); // restaure B, retablir=[C], annuler=[A]
  assert.strictEqual(h.annuler('B'), 'A'); // restaure A, retablir=[C,B], annuler=[]
  assert.strictEqual(h.annuler('A'), null); // plus rien à annuler
  assert.strictEqual(h.retablir('A'), 'B'); // refait B, annuler=[A], retablir=[C]
  assert.strictEqual(h.retablir('B'), 'C'); // refait C
  assert.strictEqual(h.retablir('C'), null); // plus rien à refaire
});

test('Historique : memoriser ignore un état identique au dernier', () => {
  const h = new HistoriqueDocument();
  h.memoriser('A');
  h.memoriser('A');
  assert.strictEqual(h.tailleAnnuler, 1);
});

test('Historique : une nouvelle mémorisation vide la pile de rétablissement', () => {
  const h = new HistoriqueDocument();
  h.memoriser('A');
  h.annuler('B');                 // retablir=[B]
  assert.strictEqual(h.peutRetablir, true);
  h.memoriser('B');               // nouvelle action → retablir vidée
  assert.strictEqual(h.peutRetablir, false);
});

test('Historique : annuler/retablir renvoient null sur pile vide', () => {
  const h = new HistoriqueDocument();
  assert.strictEqual(h.annuler('X'), null);
  assert.strictEqual(h.retablir('X'), null);
  assert.strictEqual(h.peutAnnuler, false);
  assert.strictEqual(h.peutRetablir, false);
});

test('Historique : limite la profondeur (MAX_HISTORY)', () => {
  const h = new HistoriqueDocument(2);
  h.memoriser('A');
  h.memoriser('B');
  h.memoriser('C');               // A est évincé → annuler=[B,C]
  assert.strictEqual(h.tailleAnnuler, 2);
  assert.strictEqual(h.annuler('D'), 'C');
  assert.strictEqual(h.annuler('C'), 'B');
  assert.strictEqual(h.annuler('B'), null); // A a bien été perdu
});
