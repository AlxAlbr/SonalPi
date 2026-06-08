// Point d'entrée ESM du renderer.
//
// Chargé via <script type="module" src="domain/index.mjs"> dans index.html.
// Expose la couche domaine sur window.SonalDomain pour que le code legacy
// (scripts globaux) puisse l'appeler sans être lui-même converti en module.

import { parseCorpus, serializeCorpus, Corpus } from './corpus.mjs';
import { parseSonal, serializeSonal } from './sonal.mjs';
import * as metadonnees from './metadonnees.mjs';
import { Entretien } from './entretien.mjs';
import { Categorie, Codebook } from './codebook.mjs';
import { RegleAnon, fusionnerReglesAnon } from './anonymisation.mjs';
import { Document, Segment, Fragment, Extrait, renumeroter, HistoriqueDocument } from './document.mjs';
import * as conversions from './conversions.mjs';

window.SonalDomain = {
  parseCorpus, serializeCorpus, parseSonal, serializeSonal, metadonnees,
  Entretien, Corpus, Categorie, Codebook, RegleAnon, fusionnerReglesAnon,
  Document, Segment, Fragment, Extrait, renumeroter, HistoriqueDocument,
  conversions,
};
