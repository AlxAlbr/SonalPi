// Point d'entrée ESM du renderer (pont Option A → Option B).
//
// Chargé via <script type="module" src="src/index.mjs"> dans index.html.
// Expose la couche domaine sur window.SonalDomain pour que le code legacy
// (scripts globaux) puisse l'appeler sans être lui-même converti en module.

import { parseCorpus, serializeCorpus, Corpus } from './domain/corpus.mjs';
import { parseSonal } from './domain/sonal.mjs';
import * as eav from './domain/eav.mjs';
import { Entretien } from './domain/entretien.mjs';

window.SonalDomain = { parseCorpus, serializeCorpus, parseSonal, eav, Entretien, Corpus };
