# Authentification GitLab — repères développeur

`ServiceAuthentificationGitLab` conserve les accès dans le main et fournit des
clients REST/LFS authentifiés. Le renderer reçoit des états publics, jamais les
jetons ni le code d’autorisation. Connexion, choix du projet et ouverture d’un
corpus sont trois opérations distinctes.

## Instance et application OAuth

L’instance est détectée depuis l’adresse du projet, sous-chemin éventuel compris,
puis présentée à l’utilisateur. Une application OAuth doit y être enregistrée :
soit par la distribution dans `INSTANCES_GITLAB_OAUTH`, soit par saisie locale de
son `client_id`, mémorisé dans `instances-gitlab.json`. Cet identifiant est public.
Le registre embarqué ne doit annoncer que des applications réellement configurées.

| Configuration de production | Valeur |
|---|---|
| Flux | Authorization Code + PKCE, application publique sans secret client. |
| Callback | `http://127.0.0.1:7474/callback`, à déclarer exactement sur l’instance. |
| Scope | `api`. |
| Transport vers GitLab | HTTPS validé ; HTTP réservé aux hôtes locaux de test. |

Le port de callback est fixe par défaut ; un poste ne peut pas y mener deux
connexions simultanées. Les substitutions de port des tests ne changent pas
l’URI à enregistrer pour une distribution normale.

Le scope `api` est nécessaire au parcours de publication par l’API des commits.
Les essais du connecteur ont montré que `read_api write_repository` permettait
la lecture mais refusait ces publications. Ne pas réduire le scope sur la seule
base d’un test de connexion réussi ; `api` reste un accès large au compte.

Sans application OAuth connue, le parcours peut accepter un jeton personnel.
Il est vérifié par `GET /user`, puis stocké dans le même coffre. Un échec de
connexion ne doit pas provoquer un changement silencieux de compte ou d’instance.

## Cycle des secrets

- `state` et `code_verifier` sont éphémères dans le main ; le code d’autorisation
  ne s’échange qu’une fois. Le callback valide le retour avant d’accepter le compte.
- Les tokens OAuth et personnels sont chiffrés avec `safeStorage` si le trousseau
  est disponible ; sinon, ils restent uniquement en mémoire pour la session.
- Les requêtes concurrentes partagent un seul renouvellement OAuth par compte,
  pour ne pas perdre le refresh token lors de sa rotation.
- Un renouvellement refusé déconnecte le compte sans supprimer destinations,
  miroirs ou candidats de récupération.
- Déconnecter OAuth tente la révocation distante puis retire le secret local.
  Déconnecter un jeton personnel retire sa copie locale sans le révoquer dans GitLab.

Une erreur réseau ou un HTTP 403 n’est pas une preuve de credential expiré.
Un HTTP 401 ou l’absence d’accès après échec de renouvellement relève du parcours
de reconnexion. Les services conservent cette distinction pour ne pas demander
inutilement un nouveau secret.

Ne jamais journaliser l’URL d’autorisation, le callback complet, les codes,
les jetons ou `Authorization`. Les messages publics utilisent les erreurs
normalisées, pas les corps bruts susceptibles de contenir des secrets.

## Où intervenir et vérifier

| Responsabilité | Emplacement |
|---|---|
| Service et clients associés au compte | `src/main/gitlab/authentification.ts` |
| Détection d’instance | `src/main/gitlab/detectionInstance.ts` |
| Flux, callback, PKCE et renouvellement | `src/main/gitlab/oauth/` |
| Comptes, destinations et stockage sécurisé | `src/main/distant/coffre.ts` |
| Contrats publics | `src/shared/gitlab.ts` |
| Orchestration du formulaire | `src/renderer/composables/corpus/useProjetGitLab.ts` |

Tests : `test/gitlab/authentification.test.ts`, `test/gitlab/oauthConnexion.test.ts`,
`test/gitlab/oauthCoffre.test.ts` et `test/projetGitLabRenderer.test.ts`.
Une recette GitLab à jeton personnel ne démontre pas, à elle seule, le parcours OAuth.
