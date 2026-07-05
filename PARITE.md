# PARITÉ SonalPi — journal des vérifications manuelles

> Le seul test qui **ne s'automatise pas** : rouvrir un `.sonal` exporté par SonalAsynchro
> dans SonalPi. Tout le reste (import, mapping des positions, round-trip, fusion
> du codebook) est couvert par 48 tests unitaires + 11 e2e. Cette page consigne
> les vérifications faites à la main, avec captures si utile.

## Comment produire un `.sonal` à tester

1. Lancer SonalAsynchro (`npm run dev` dans `SonalAsynchro/`).
2. Importer un `.sonal` réel (bouton **Importer**) ou coder l'entretien seed.
3. **Exporter .sonal** → choisir un emplacement.
4. Ouvrir le fichier obtenu dans **SonalPi** — via **« importer un entretien »**, PAS
   « ouvrir un corpus » (ce dernier attend du JSON `.crp` → `JSON.parse` sur du HTML
   → *« unexpected token '<' »*).

## Écarts de format ASSUMÉS (attendus, pas des bugs)

- **Fragmentation interne** recalculée aux frontières d'annotations : un même
  codage peut ressortir en un nombre de `<span data-rk>` différent de l'original
  (le *nombre de codages par catégorie* est, lui, préservé — vérifié en golden).
- **`data-statut` (deb/fin de tour)** non ré-émis : c'est un dérivé (run de blocs
  de même `loc`), retiré du modèle (MODELE_OBJET2 §4). SonalPi le recalcule.
- **Blocs non encore modélisés** (`var/dic/dat/anon`, notes) : ré-émis tels quels
  depuis le pass-through `legacy` (round-trip sans perte jusqu'aux étapes 5/6).
- **Anonymisation** : le pseudo appliqué est porté par l'annotation (`data-pseudo`
  ré-émis) ; les *règles* (`tabAnon`) transitent via `legacy`.
- **Couleur des codages synthétisée.** SonalAsynchro ne *stocke* pas encore de couleur sur
  les catégories (étape 5) — il en synthétise une par hash à l'affichage. À l'export,
  une catégorie sans couleur reçoit **la même couleur synthétisée** (sinon SonalPi
  affiche le codage sans couleur → invisible). Une catégorie porteuse d'une couleur
  (ex. import d'un `.sonal` coloré) garde la sienne.

## Journal

| Date | Fixture / source | Résultat dans SonalPi | Notes |
|---|---|---|---|
| 2026-07-04 | seed codé → export | ouvre en entretien ✓ ; **codages d'abord invisibles** | cause : catégories seed sans couleur → CSS `.cat_XXX{}` vide. **Corrigé** : couleur synthétisée à l'export. Autre piste initiale : ouvert par erreur via « ouvrir corpus » (→ erreur `<`). |
| _(à refaire)_ | seed codé → export (après correctif couleur) | _(à vérifier)_ | confirmer que les codages sont **visibles et colorés** |
| _(à faire)_ | .srt importé → export | _(à vérifier)_ | |

> ⚠️ **À faire par l'utilisateur** : re-tester après le correctif couleur, et
> confirmer que les codages apparaissent bien colorés dans SonalPi.
