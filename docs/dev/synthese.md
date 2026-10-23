# Synthèse

Synthèse est un résultat dérivé conservé en mémoire. Elle ne modifie ni `corpus.json` ni les
entretiens.

## Organisation

- `src/shared/synthese/moteur.ts` intersecte les plages sur les positions ProseMirror.
- `src/renderer/editor/synthese.ts` prépare les tours de parole et projette le mode de texte.
- `useSyntheseCorpus.ts` charge au plus quatre sources en parallèle, projette les cas et publie
  atomiquement le résultat avec ses diagnostics.
- les vues d’ensemble et Extraits consomment la même collection.

Le moteur reçoit les codages, les tours de parole et les plages de cas déjà préparés. Il
applique un OU dans une dimension et un ET entre dimensions. Les segments recouvrants sont
réunis, mais une frontière de locuteur reste une coupure. Un calcul sans thème ni cas retourne
toujours un résultat vide.

Les bornes et identifiants restent indépendants du mode d’affichage. Le passage, son contexte
et ses locuteurs sont reprojetés à la demande en original ou en pseudonymisé ; une vue ne garde
donc pas les deux textes. Une modification des définitions ou de l’entretien ouvert marque le
résultat comme périmé.

L’export TXT utilise la collection visible et propose `resultats/synthese/` pour un corpus
local, ou le dossier Documents pour un corpus distant.
