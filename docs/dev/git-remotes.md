# Dépôts et remotes — GitLab (origine) + GitHub (miroir de CI)

## Situation

Deux remotes :

| Remote | URL | Rôle |
|---|---|---|
| `origin` | `https://gitlab.huma-num.fr/mbeligne/SonalPiTestV2.git` | dépôt d'origine (huma-num) |
| `github` | `https://github.com/PUD-GA/SonalPiTestV2.git` | miroir **privé** pour la CI GitHub Actions (empaquetage Windows) |

L'upstream de la branche courante (`multiongletcorpus`, et `main` par défaut) est
`github`, volontairement : huma-num a été en panne, et la CI vit sur GitHub.
Un `git push` sans argument part donc **vers GitHub uniquement**.

## Commandes utiles

| Besoin | Commande |
|---|---|
| Situation locale vs GitHub | `git status` (ou `git status -sb`, plus compact : `## multiongletcorpus...github/multiongletcorpus`) |
| Situation locale vs GitLab | `git fetch origin` puis `git log --oneline --left-right multiongletcorpus...origin/multiongletcorpus` |
| Comparer les fichiers vs GitLab | `git fetch origin && git diff --stat origin/multiongletcorpus` |
| Pousser vers GitHub (par défaut) | `git push` |
| Pousser vers GitLab exprès | `git push origin multiongletcorpus` |
| Pousser vers les deux | `git push origin multiongletcorpus && git push github multiongletcorpus` |

⚠️ `git status origin/main` **ne fonctionne pas** : `git status` accepte des chemins
de fichiers, pas un nom de branche distante. Il faut passer par `git fetch` puis
`git log` / `git diff` ci-dessus.

## Règles

- Le push vers GitLab est **explicite et volontaire**, jamais automatique.
- Ne pas ajouter GitHub en second push-URL du remote `origin` tant que huma-num
  n'est pas fiable : un push vers les deux échouerait en bloc si GitLab ne répond.
- `out/`, `dist/`, `node_modules/`, `test-results/` sont ignorés : aucun artefact
  de build n'est poussé.
- Quand GitLab reviendra : le repo reste l'origine ; GitHub est uniquement le
  miroir de travail pour la CI.

## Liens

- Empaquetage et CI : [empaquetage-ci.md](empaquetage-ci.md).
- Démarrage local, commandes : [developpement.md](developpement.md).