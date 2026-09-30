# GitLab — authentification OAuth ou par jeton personnel

Sonal privilégie le flux Authorization Code + PKCE auprès des instances GitLab.
Un jeton d’accès personnel est aussi accepté lorsque l’instance ne propose pas
OAuth. Ce document décrit ce qu'un exploitant d'instance doit enregistrer, et ce
que Sonal exige de cette application.

## Instance choisie par l'utilisateur

Sonal n'impose pas une instance : l'adresse du projet saisie dans « Nouveau
corpus distant » ou « Ouvrir un corpus distant » sert à détecter l'instance qui
l'héberge (sonde de `/api/v4/version`, du sous-chemin le plus profond vers la
racine). L'instance est affichée et modifiable avant la connexion.

Une application OAuth doit être enregistrée sur cette instance. Deux origines
sont acceptées :

| Origine | Client ID | Qui l'obtient |
|---|---|---|
| `institution` | déclarés dans le registre `INSTANCES_GITLAB_OAUTH` | l'institution enregistre Sonal une fois pour tous ses utilisateurs ; rien à saisir. |
| `poste` | saisi une fois par l'utilisateur, mémorisé dans `instances-gitlab.json` | l'utilisateur crée sa propre application sur son instance. |

Le `client_id` est une valeur publique : il n'a pas à être chiffré, et n'est
jamais demandé en même temps qu'un mot de passe. Sur une instance sans application
connue, l’utilisateur peut choisir un jeton d’accès personnel avec le scope `api`.

## Ce que Sonal attend de l'application

| Élément | Valeur attendue |
|---|---|
| Adresse | `https://<hôte>` de l'instance, HTTPS vérifié, sous-chemin éventuel. |
| Redirect URI | `http://127.0.0.1:7474/callback`, déclarée telle quelle. |
| Scopes | `api` (voir la mesure ci-dessous). |
| Secret client | Aucun. L'application est publique et utilise PKCE. |

Enregistrement dans `Settings → Applications` : nom et description identifiant
Sonal, redirect URI ci-dessus, scopes `api`, **PKCE coché**, secret laissé vide.

## Port de callback

Le port est fixe : c'est le moyen le plus simple de faire correspondre la
redirect URI déclarée sur l'instance, y compris derrière plusieurs postes.
Deux connexions simultanées sur le même poste ne sont pas possibles ; la
seconde est refusée avec un message explicite.

## Scopes : ce que dit l'instance

Mesure faite sur une instance GitLab CE de qualification, avec un token OAuth
réel et les endpoints réellement appelés par Sonal.

| Endpoint Sonal | `read_api` | `read_api write_repository` | `api` |
|---|---|---|---|
| `GET /user` | 200 | 200 | 200 |
| `GET /projects?membership=true` | 200 | 200 | 200 |
| `GET /projects/:id` | 200 | 200 | 200 |
| `GET /projects/:id/repository/branches/:branche` | 200 | 200 | 200 |
| `GET /projects/:id/repository/tree` | 200 | 200 | 200 |
| `GET /projects/:id/repository/files/...` | 200 | 200 | 200 |
| `POST /projects/:id/repository/commits` | 403 | 403 | **201** |

Le refus de publication avec `read_api write_repository` est explicite :

```json
{"error":"insufficient_scope",
 "error_description":"The request requires higher privileges than provided by the access token.",
 "scope":"ai_workflows api read_api"}
```

`write_repository` ne vaut que pour la Repository Files API ; la publication de
Sonal passe par l'API des commits, que GitLab réserve au scope `api`. Aucun
assemblage plus étroit ne permet donc de publier : `api` est le minimum réel,
et c'est ce scope que Sonal demande. Il est large — accès complet à l'API pour
le compte connecté — et cette limite est celle de l'instance, pas de Sonal.

## Cycle de vie du credential

- Le `state` et le `code_verifier` naissent et meurent dans le main, en mémoire.
- Le code d'autorisation est échangé une seule fois ; un rejeu est refusé.
- Les deux tokens sont chiffrés par le trousseau du poste (`safeStorage`) quand
  il est disponible ; sinon ils restent en mémoire pour la session.
- Le renouvellement est unique par compte : plusieurs requêtes concurrentes
  partagent un seul échange, car GitLab ne réémet qu'un refresh token.
- Un refresh refusé retire le credential : le compte est déclaré déconnecté,
  les destinations, miroirs et candidats locaux sont conservés.
- « Se déconnecter » révoque le token OAuth chez GitLab s'il l'accepte, puis
  efface le credential local. Cela ne supprime ni le projet GitLab, ni le miroir local.
- Un jeton personnel est vérifié avec `GET /user`, puis chiffré dans le même coffre.
  Sans stockage sécurisé, il reste seulement en mémoire pour la session.
- Déconnecter un compte à jeton personnel efface sa copie locale sans révoquer le
  jeton dans GitLab.

## Diagnostic

Ni l'URL d'autorisation, ni le code, ni les tokens, ni l'en-tête
`Authorization` ne doivent apparaître dans un journal ou une capture de
diagnostic. Les refus d'instance sont traduits à partir du seul champ `error`
normalisé par GitLab ; le corps reçu n'est pas recopié.
