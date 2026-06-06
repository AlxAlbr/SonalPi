// Point d'entrée ESM du renderer (pont Option A → Option B).
//
// Chargé via <script type="module" src="src/index.mjs"> dans index.html.
// Expose la couche domaine sur window.SonalDomain pour que le code legacy
// (scripts globaux) puisse l'appeler sans être lui-même converti en module.

import { parseCorpus, serializeCorpus, Corpus } from './domain/corpus.mjs';
import { parseSonal, serializeSonal } from './domain/sonal.mjs';
import * as metadonnees from './domain/metadonnees.mjs';
import { Entretien } from './domain/entretien.mjs';
import { Categorie, Codebook } from './domain/codebook.mjs';
import { RegleAnon, fusionnerReglesAnon } from './domain/anonymisation.mjs';
import { Document, Segment, Fragment, Extrait } from './domain/document.mjs';

window.SonalDomain = {
  parseCorpus, serializeCorpus, parseSonal, serializeSonal, metadonnees,
  Entretien, Corpus, Categorie, Codebook, RegleAnon, fusionnerReglesAnon,
  Document, Segment, Fragment, Extrait,
};
