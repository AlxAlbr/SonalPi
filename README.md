# SonalPi2

Réécriture en cours du cœur de **SonalPi1** pour essayer de simplifier le fonctionnement et le code.

## Dépôt et branches de travail

Le dépôt de référence est désormais [AlxAlbr/SonalPi](https://github.com/AlxAlbr/SonalPi),
accessible par le remote `origin`. Il héberge les deux versions :

| Branche | Rôle |
|---|---|
| `main` | V1, toujours branche par défaut du dépôt. |
| `ImportFlora` | Travail complémentaire sur la V1. |
| `baseV2` | Base du développement V2, anciennement `multiongletcorpus`. |
| `test-new-design` | Évolutions de l'interface V2. |
| `max-suite-aide2` | Compléments de documentation V2. |
| `essai-crp-multionglet` | Évolution du stockage et de l'ouverture des corpus V2. |

Les trois dernières branches partent de `baseV2` et sont parallèles : aucune ne
contient automatiquement les évolutions des deux autres. La V1 et la V2 ont des
historiques Git indépendants ; leur présence dans le même dépôt ne les fusionne pas.

Les anciens dépôts V2 sont conservés comme archives, sans synchronisation automatique.
Le dossier local d'origine a été renommé `SonalPiTestV2_ARCHIVE` ; poursuivre le travail
V2 dans `SonalPi`, sur la branche choisie. Voir les
[consignes Git](docs/dev/outillage/git-remotes.md).

La livraison stable V2 vise `2.0.0`. L'import des branches ne change ni la version
applicative actuelle ni les mises à jour reçues par les utilisateurs de la V1.

## En bref

- **Deux niveaux de données** : le **Corpus** (définitions : codebook, variables EAV, règles
  d'anonymisation) et l'**Entretien** (applications : codages, masquages, commentaires). Pour
  chaque donnée, deux états : ce qui est **stocké** dans les fichiers et ce qui est **calculé**
  à la demande (requêtes, agrégations).
- **Un modèle d'objet réduit** par rapport à SonalPi1 : ses trois overlays inline (codage /
  anonymisation / commentaire) **fusionnent** en un seul concept — `Annotation` — et le Corpus ne
  garde que des **références légères** aux entretiens. Plus de tables dupliquées local↔corpus :
  une seule vérité par donnée.
- **Édition WYSIWYG** (TipTap/ProseMirror), mais le cœur applicatif vit **hors de l'éditeur** :
  remap des positions, décorations, commandes métier pures, persistance — tout est délibérément
  séparé du DOM, donc **testable headless**.

Les détails techniques (modèle d'objet, représentations des données, architecture, développement)
sont dans la **[documentation développeur](docs/dev/README.md)**.

## Nouveautés

- beaucoup de test unit et e2e : permet de dev en étant sur que ce qu'on fait ne casse pas d'autres fonctionnalités
- essai corpus pédagogique : parcours Pas à Pas reste à construire 
- possible travail sur vidéo normalement
- garde la précision des timestamps (ne sont pas réduit au tour de parole)
- Onglet note à pris du grade
- ajout d'un journal d'actions avec possibilité de revenir en arrière
- Travail sur webdav Nextcloud avancé : à tester

Les moins : beaucoup de choses restent à tester (pas encore fait de build)

## Démarrer

Vérifier la branche avant de lancer l'application. Dans un clone du dépôt, pour
partir de la base V2, avec un répertoire de travail propre :

```bash
git fetch origin
git switch baseV2
npm ci
```

Après un changement entre V1 et V2, relancer `npm ci` : les dépendances diffèrent
entre les deux versions. Pour travailler sur une évolution déjà commencée,
sélectionner sa branche dérivée plutôt que `baseV2`.

```bash
npm run dev          # app en développement (electron-vite)
npm run build        # build main + preload + renderer
npm run start        # prévisualiser le build

npm test                # tests unitaires (vitest, headless)
npm run test:e2e        # e2e Playwright + Electron (build puis lance ; tourne sous WSLg)
npm run diagnostic:e2e  # diagnostics Electron manuels, hors de la suite normale
npm run typecheck       # vue-tsc + tsc
```

**Pile** : Electron + Vue 3 + TipTap/ProseMirror (sans Yjs), electron-vite, vitest, Playwright.

## Documentation

| Public | Doc |
|---|---|
| Utilisateur | [Guide et FAQ V2](docs/user/index.html) — pages HTML locales ; [sources antérieures](docs/user/README.md) |
| Développeur | [Documentation développeur](docs/dev/README.md) |
| Vocabulaire | [Produits, version applicative et format des données](docs/dev/developpement.md#vocabulaire-et-version-applicative) |

## Plans (`plans/`)

Le dossier `plans/` range les documents de travail en trois catégories :

- **`plans/encours/`** — les plans prévus d'être réalisés à court terme :
  découpés en étapes, ils guident l'implémentation en cours ou imminente.
- **`plans/choix/`** — les propositions qui demandent un arbitrage pour une
  vision à plus moyen terme : options posées, décision pas encore prise.
- **`plans/reflexion/`** — les réflexions apparues en cours d'implémentation
  sur certains sujets : analyse d'un problème, options et conséquences, sans
  engagement de réalisation.
