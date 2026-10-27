# Remotes Git — travailler et publier

Le projet utilise deux dépôts distants. Ne pas confondre leur rôle avec les
connecteurs GitLab et WebDAV de l’application : cette page concerne le code source.

| Remote | Dépôt | Rôle |
|---|---|---|
| `origin` | `https://gitlab.huma-num.fr/mbeligne/SonalPiTestV2.git` | Dépôt d’origine GitLab. |
| `github` | `https://github.com/PUD-GA/SonalPiTestV2.git` | Miroir privé de travail et CI d’empaquetage. |

## Vérifier sa branche

L’upstream des branches de travail est GitHub. Avec cette configuration,
`git push` sans argument publie **uniquement vers GitHub**. Vérifier la situation
réelle avant de pousser, notamment après création d’une branche :

```sh
git remote -v
git branch -vv
git status -sb
```

Dans les exemples suivants, remplacer `<branche>` par le nom de la branche.

| Besoin | Commande |
|---|---|
| Actualiser et comparer avec GitHub | `git fetch github`, puis `git log --oneline --left-right <branche>...github/<branche>`. |
| Actualiser et comparer avec GitLab | `git fetch origin`, puis `git log --oneline --left-right <branche>...origin/<branche>`. |
| Comparer les fichiers avec GitLab | `git diff --stat origin/<branche>`. |
| Définir l’upstream GitHub lors de la première publication | `git push -u github <branche>`. |
| Publier ensuite vers l’upstream GitHub | `git push`. |
| Publier volontairement vers GitLab | `git push origin <branche>`. |

Une comparaison avec une branche distante exige un `fetch` réussi pour refléter
son état actuel. `git status origin/main` ne compare pas deux branches : utiliser
`git log` ou `git diff`.

## Règles à préserver

- Le push GitLab reste explicite ; aucun double push automatique n’est configuré.
- Ne pas ajouter de seconde URL de push à `origin`. Une indisponibilité de GitLab
  ne doit pas bloquer la publication GitHub ni rendre son résultat ambigu.
- Publier sur un dépôt ne synchronise pas automatiquement l’autre.
- `out/`, `dist/`, `node_modules/` et `test-results/` sont ignorés ; les artefacts
  de fabrication ne sont pas poussés avec le code.

Voir [empaquetage et CI](empaquetage-ci.md) pour les workflows GitHub et
[développement](../developpement.md) pour les vérifications locales.
