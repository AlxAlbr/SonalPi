# Remotes Git — travailler et publier

Le code source V1 et V2 est désormais hébergé dans un dépôt commun. Ne pas confondre
ce dépôt avec les connecteurs GitLab et WebDAV de l'application : ces derniers
servent à accéder aux corpus, pas à publier le code source.

| Remote | Dépôt | Rôle |
|---|---|---|
| `origin` | `https://github.com/AlxAlbr/SonalPi.git` | Dépôt public de référence et CI GitHub. |

Les anciens dépôts V2 GitLab et GitHub restent des archives. Ils ne sont plus des
destinations de publication ; aucun double push ni aucune synchronisation
automatique avec eux n'est configuré dans ce dépôt. Le dossier local d'origine,
renommé `SonalPiTestV2_ARCHIVE`, est conservé pour consultation.

## Choisir la branche de travail

| Branche | Usage |
|---|---|
| `main` | V1 ; reste la branche par défaut du dépôt. |
| `ImportFlora` | Développement lié à la V1. |
| `baseV2` | Base de développement V2, importée de `multiongletcorpus`. |
| `test-new-design` | Évolutions de l'interface V2. |
| `max-suite-aide2` | Compléments de documentation V2. |
| `essai-crp-multionglet` | Évolution du stockage et de l'ouverture des corpus V2. |

Les trois branches dérivées de `baseV2` sont parallèles : leurs évolutions ne sont
pas toutes réunies dans une seule branche. La V1 et la V2 n'ont pas d'ancêtre Git
commun. Ne pas fusionner leurs historiques ni remplacer `main` pour synchroniser
le développement V2.

Un clone du dépôt ouvre normalement `main`, donc la V1. Avant de modifier les
fichiers ou de pousser, vérifier la branche, son upstream et le remote :

```sh
git status -sb
git branch -vv
git remote -v
```

Pour commencer sur la base V2, avec un répertoire de travail propre :

```sh
git fetch origin
git switch baseV2
npm ci
```

Pour poursuivre une évolution existante, sélectionner sa branche dérivée. Relancer
`npm ci` après un changement entre V1 et V2 pour installer les bonnes dépendances.

## Synchroniser et publier

Dans les exemples suivants, remplacer `<branche>` par la branche V2 concernée.
Son upstream doit être `origin/<branche>`.

| Besoin | Commande |
|---|---|
| Actualiser les références distantes | `git fetch origin`. |
| Comparer les commits de la base avec GitHub | `git log --oneline --left-right baseV2...origin/baseV2`. |
| Comparer une autre branche avec GitHub | `git log --oneline --left-right <branche>...origin/<branche>`. |
| Comparer les fichiers avec GitHub | `git diff --stat <branche> origin/<branche>`. |
| Avancer la branche active sans créer de fusion | `git pull --ff-only origin <branche>`, après avoir sélectionné cette branche. |
| Publier une nouvelle branche et définir son upstream | `git push -u origin <branche>`. |
| Publier une branche existante | `git push origin <branche>`. |

Avec les upstreams actuels et la configuration Git habituelle, `git push` sans
argument cible aussi `origin`. Préférer une destination et une branche explicites
pour éviter toute ambiguïté. Ne pas pousser toutes les branches ou tous les tags
pour publier une modification V2.

Une comparaison avec une branche distante exige un `fetch` réussi pour refléter
son état actuel. `git status origin/main` ne compare pas deux branches : utiliser
`git log` ou `git diff`.

## Règles à préserver

- `main` et `ImportFlora` restent inchangées lors d'une publication V2.
- Le dépôt est public : vérifier les fichiers et l'historique avant publication.
  Le `.gitignore` n'exclut pas les fichiers déjà suivis.
- `out/`, `dist/`, `release/`, `node_modules/` et les résultats de tests restent
  locaux ; les artefacts de fabrication ne sont pas poussés avec le code.
- La version stable V2 visée est `2.0.0`, pas une release à créer pendant l'import.
  Les tags de livraison et le remplacement futur de la V1 nécessitent une décision
  explicite, notamment pour ne pas diffuser une V2 expérimentale via l'updater V1.

Voir [empaquetage et CI](empaquetage-ci.md) pour l'état des workflows GitHub et
[développement](../developpement.md) pour les vérifications locales.
