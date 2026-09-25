# GitLab — authentification OAuth pour la distribution

**Statut : proposition de chantier ; le connecteur GitLab et son parcours PAT sont fonctionnels, OAuth reste à concevoir et qualifier.**
**Ce plan est distinct de [plan-gitlab4.md](plan-gitlab4.md) : il traite l’authentification, pas la fiabilisation du bail et de la publication.**

## 1. Décision proposée

Conserver le PAT comme mécanisme immédiatement disponible et ajouter OAuth comme
mode d’authentification recommandé pour une diffusion large.

Le client GitLab utilisera un même contrat d’API, avec deux sources de credential :

```text
Credential GitLab
├── PAT saisi manuellement
└── Access token OAuth obtenu dans le navigateur
```

OAuth ne doit pas devenir une seconde implémentation du client GitLab, ni un
second mécanisme de découverte, de publication ou de gestion des corpus.

Le premier objectif est de supprimer la manipulation du secret pour les
utilisateurs qui disposent d’une application OAuth Sonal correctement enregistrée
sur leur instance. Le PAT reste le repli pour les bancs, les instances sans
application enregistrée et les utilisateurs qui ne peuvent pas utiliser OAuth.

## 2. Pourquoi ce chantier maintenant

Le parcours PAT est fonctionnel, mais il demande à l’utilisateur de :

1. créer un jeton d’accès personnel ;
2. choisir ou faire valider les permissions ;
3. copier un secret dans Sonal ;
4. le saisir à chaque première connexion lorsque le coffre n’est pas disponible.

Pour un premier pilote technique, cette contrainte est acceptable. Pour une
diffusion à des équipes non techniques, elle devient une barrière importante.

OAuth apporte :

- une authentification dans le navigateur GitLab ;
- un consentement explicite ;
- des scopes associés à l’application ;
- une durée de vie et une révocation mieux maîtrisées ;
- une réduction des manipulations de secrets.

Le client REST, la découverte des projets, les commits conditionnels, les baux,
les journaux et les miroirs restent inchangés.

## 3. État de référence

Le dépôt contient déjà :

- `ClientGitLab` et les opérations REST GitLab ;
- la découverte des projets et des branches ;
- la création d’un corpus dans un projet existant ;
- le coffre de secrets et la distinction compte/destination ;
- le bail versionné et la publication conditionnelle ;
- les tests sur instance GitLab réelle et le binaire Electron.

Le flux V1 n’est pas repris tel quel. Il présente des propriétés à ne pas
réintroduire :

- TLS désactivé ou non vérifié ;
- informations de callback ou d’autorisation potentiellement journalisées ;
- stockage des tokens indexé par projet plutôt que par compte et instance ;
- obligation de créer une application OAuth pour chaque utilisateur ;
- hypothèses de refresh et d’expiration trop générales.

La V2 doit traiter le main process comme propriétaire de l’authentification. Le
renderer ne reçoit ni secret, ni code OAuth, ni access token, ni refresh token.

## 4. Objectifs

- Permettre `Se connecter à GitLab` avec le flux Authorization Code + PKCE.
- Supporter les instances GitLab auto-hébergées compatibles.
- Réutiliser le client API et tous les contrats de publication existants.
- Stocker les credentials dans le coffre système lorsqu’il est disponible.
- Permettre la révocation et la déconnexion d’un compte.
- Gérer plusieurs comptes et plusieurs instances.
- Conserver le PAT comme mode manuel et solution de repli.
- Éviter toute fuite de secret dans les logs, diagnostics ou erreurs.
- Tester le renouvellement, l’expiration, la révocation et les réponses perdues.
- Ne pas modifier le modèle de bail ou le format du corpus.

## 5. Hors périmètre initial

- Ne pas créer de serveur d’authentification Sonal.
- Ne pas créer de projet GitLab implicitement.
- Ne pas gérer les utilisateurs, groupes ou permissions GitLab.
- Ne pas remplacer le PAT dans le premier lot.
- Ne pas faire de l’OAuth une condition de consultation d’un projet.
- Ne pas exposer les tokens au renderer.
- Ne pas afficher les tokens dans les logs, les captures de diagnostic ou les messages d’erreur.
- Ne pas copier le modèle non sécurisé de la V1.
- Ne pas écrire les tokens en clair dans le système de fichiers lorsque le coffre
  système est disponible.
- Ne pas confondre l’expiration d’un token OAuth avec l’expiration d’un bail GitLab.
- Ne pas ajouter de second stockage de présence ou de second système de coordination.

## 6. Modèle de credential

Le client GitLab ne doit pas connaître la provenance du secret. Il doit recevoir
un credential abstrait, par exemple :

```ts
interface CredentialGitLab {
  source: 'pat' | 'oauth'
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
}
```

Le `CredentialProvider` est interne au main et fournit notamment :

```ts
interface CredentialProviderGitLab {
  actuel(): Promise<CredentialGitLab | null>
  refresh(credential: CredentialGitLab): Promise<CredentialGitLab>
  revoquer?(credential: CredentialGitLab): Promise<void>
}
```

Le renderer ne voit que des résultats d’état :

```ts
type EtatAuthentificationGitLab =
  | { etat: 'non-connecte' }
  | { etat: 'connecte'; source: 'pat' | 'oauth' }
  | { etat: 'a-rafraichir' }
  | { etat: 'erreur'; raison: 'annule' | 'expire' | 'revocation' | 'reseau' }
```

Les valeurs réelles et les messages utilisateur seront définis pendant le
premier lot. Les strings ci-dessus sont un contrat de conception, pas une API
renderer.

## 7. Flux OAuth cible

### 7.1 Application et instance

Une application OAuth est enregistrée sur une instance GitLab. Le premier lot doit
examiner deux stratégies :

1. **Application institutionnelle** : l’institution enregistre une application
   Sonal et fournit un `Client ID` ; l’utilisateur clique sur connexion.
2. **Application créée par l’utilisateur** : l’utilisateur enregistre sa propre
   application sur l’instance ; le parcours reste possible mais reste moins simple.

La stratégie recommandée est l’application institutionnelle lorsque l’institution
la peut enregistrer. Le PAT et la création d’application manuelle restent des
solutions de repli.

Le `Client ID` est une configuration non secrète. Aucun secret client OAuth ne
doit être requis pour une application desktop publique utilisant PKCE.

### 7.2 Authorization Code + PKCE

Le flux cible est :

```text
renderer demande « Se connecter »
        ↓
main ouvre le navigateur vers /oauth/authorize
        ↓
GitLab authentifie l’utilisateur et affiche le consentement
        ↓
GitLab redirige vers la callback loopback
        ↓
main vérifie state et PKCE
        ↓
main échange le code contre access token et refresh token
        ↓
main chiffre les tokens dans le coffre
        ↓
main ouvre ou découvre le projet
```

Le `state`, le `code_verifier` et le code d’autorisation restent en mémoire dans
le main pendant l’échange. Ils ne sont jamais écrits dans les logs.

La callback doit vérifier au minimum :

- l’origine et le chemin de callback attendus ;
- la présence du `state` ;
- l’absence de collision avec une autre connexion ;
- l’expiration de la tentative ;
- l’absence de code déjà utilisé.

### 7.3 Redirect URI

La redirect URI doit être enregistrée sur l’application GitLab. Le premier lot doit
qualifier au minimum :

- une callback loopback `127.0.0.1` ou `localhost` ;
- le port et son comportement si plusieurs connexions sont lancées ;
- la compatibilité avec la configuration de l’instance ;
- la absence de collision entre deux fenêtres Sonal.

La callback HTTP ne doit pas devenir un service permanent. Elle est ouverte
uniquement pendant l’authentification et fermée après échange ou abandon.

## 8. Stockage et rotation

La clé de stockage doit être liée à l’identité du compte et de l’instance, pas au
projet ouvert. Exemple logique :

```text
instance URL + account id GitLab
```

Un même compte peut ouvrir plusieurs destinations sans dupliquer ses tokens.

Le stockage doit distinguer :

- le PAT actif ;
- l’access token OAuth ;
- le refresh token ;
- l’expiration ;
- les scopes observés ;
- la date de dernière rotation.

Les tokens OAuth doivent être écrits avec les mêmes garanties que les secrets
PAT existants :

- `safeStorage` lorsqu’il est disponible ;
- absence de secrets en clair dans les préférences ;
- absence de secrets dans les messages IPC normés ;
- écriture atomique ;
- permissions de fichier restrictives ;
- suppression ou remplacement contrôlé lors d’une déconnexion.

Un refresh token ne doit pas être rafraîché par plusieurs appels concurrents. Un
`single-flight` par compte est nécessaire.

## 9. Adaptation de l’API

Le `ClientGitLab` doit accepter une abstraction de credential et choisir l’en-tête
selon la source :

```http
Authorization: Bearer <access-token>
```

pour OAuth, et :

```http
PRIVATE-TOKEN: <pat>
```

pour le mode PAT historique.

Le choix exact doit être vérifié sur l’instance GitLab ciblée. Les endpoints de
commit, de découverte, de branches et de lecture doivent être rejoués avec les
deux modes.

Pour Git LFS, l’adaptateur doit utiliser le mécanisme d’authentification accepté
par l’instance pour le token fourni. Le client ne doit pas supposer que le header
HTTP du REST est identique au transport LFS.

Une réponse HTTP 401 ou 403 ne doit pas être interprétée comme une permission
fonctionnelle définitive sans distinguer :

- token expiré ;
- token révoqué ;
- scopes insuffisants ;
- projet interdit ;
- problème réseau ou instance indisponible.

## 10. Scopes et permissions

Les scopes OAuth doivent être le plus restrictifs possible, mais leur compatibilité
doit être établie sur les endpoints réellement utilisés.

Le premier lot mesure au minimum :

- la découverte des projets ;
- la découverte des branches ;
- la lecture d’un fichier ;
- la publication d’un commit conditionnel ;
- la lecture ou l’écriture LFS si cette capacité est supportée.

Il ne faut pas supposer que `read_api` et `write_repository` suffisent partout
pour l’API Repository Commits. La matrice des versions GitLab et des instances
cible doit être conservée comme preuve.

Les scopes trop larges doivent être signalés dans la documentation. Le mode PAT
peut rester disponible pour les installations qui refusent l’application OAuth ou
les scopes nécessaires.

## 11. Expérience utilisateur

### PAT

```text
Se connecter avec un PAT
URL de l’instance
Utilisateur
Jeton d’accès personnel
Charger les projets accessibles
```

### OAuth

```text
Se connecter à GitLab
→ navigateur GitLab
→ consentement
→ retour dans Sonal
→ projets accessibles
```

Après connexion :

- afficher la source `OAuth` ou `PAT` ;
- proposer « Se déconnecter » ;
- proposer « Oublier ce compte » avec confirmation ;
- ne jamais afficher le token ;
- expliquer clairement qu’une déconnexion ne supprime pas le projet GitLab ;
- conserver les destinations comme pour les autres comptes distants.

La déconnexion ne supprime pas le miroir local, les candidats de récupération ou
les journaux de session. Le secret seul est oublié ou révoqué selon le mode.

## 12. Persistence et reprise

Le plan OAuth ne doit pas perturber les garanties de `plan-gitlab4.md`.

- Un miroir local déjà installé reste protégé avant le premier tirage.
- Une opération de publication en attente reste réconciliée avant toute nouvelle tentative.
- Une perte de token ne détruit pas le candidat local.
- Une session GitLab dont le credential n’est plus valide est dégradée ou bloquée selon le contrat existant.
- Le renderer ne déconnecte pas un corpus à cause d’un simple échec de rafraîchissement transitoire.
- Le token OAuth expiré ne donne pas une extension locale du bail.
- Une réponse perdue pendant le refresh ou la publication reste distinguée d’un échec certain.

## 13. Sécurité

Risques à traiter explicitement :

- fuite du `code_verifier` ;
- réutilisation d’un `state` ;
- interception de la callback loopback ;
- ouverture d’une fenêtre OAuth concurrente ;
- journalisation de l’URL d’autorisation complète ;
- journalisation du token endpoint ou de la réponse token ;
- stockage en clair d’un refresh token ;
- accès du renderer au secret ;
- redirection vers une instance différente ;
- confusion entre PAT et OAuth ;
- une révocation interprétée comme une permission métier.

TLS doit rester vérifié. Une option globale `rejectUnauthorized: false` est
interdite. Les diagnostics doivent expurger les tokens, codes, headers Authorization
et fragments de callback.

## 14. Lots de réalisation

### O0 — Décision et tests de contrat

- [ ] Confirmer les instances GitLab cibles.
- [ ] Choisir la stratégie d’enregistrement de l’application OAuth.
- [ ] Vérifier la callback loopback et la redirect URI sur l’instance cible.
- [ ] Mesurer les scopes nécessaires sur REST, commits et LFS.
- [ ] Définir le contrat `CredentialGitLab`.
- [ ] Décrire les comptes multi-instance et la hiérarchie des destinations.

### O1 — Abstraction des credentials

- [ ] Introduire le `CredentialProvider` dans le main.
- [ ] Faire fonctionner le ClientGitLab avec PAT et OAuth sans duplication du client.
- [ ] Tester les en-têtes REST pour les deux sources.
- [ ] Tester le transport Git LFS pour les deux sources si LFS reste supporté.
- [ ] Garder les secrets hors du renderer et des diagnostics.

### O2 — Flux Authorization Code + PKCE

- [ ] Ouvrir le navigateur depuis le main.
- [ ] Implémenter la callback loopback bornée.
- [ ] Vérifier `state`, PKCE et expiration de la tentative.
- [ ] Échanger le code contre les tokens.
- [ ] Gérer annulation, refus, erreur réseau et code déjà utilisé.
- [ ] Tester deux connexions concurrentes.

### O3 — Stockage et rotation

- [ ] Stocker access token, refresh token, expiration et scopes dans le coffre.
- [ ] Implémenter le refresh single-flight.
- [ ] Gérer la rotation et le remplacement d’un token révoqué.
- [ ] Tester le redémarrage de l’application.
- [ ] Tester la déconnexion et l’oubli d’un compte.
- [ ] Vérifier qu’aucun token ne reste dans les logs ou les fichiers de diagnostic.

### O4 — Intégration du parcours

- [ ] Ajouter « Se connecter à GitLab » dans l’interface.
- [ ] Conserver « Connexion par PAT » comme repli.
- [ ] Persister les destinations OAuth comme les destinations PAT.
- [ ] Afficher la source de connexion sans exposer le secret.
- [ ] Ne pas modifier le contrat du bail ou du corpus.
- [ ] Vérifier la création d’un corpus dans un projet existant.

### O5 — Qualification réelle

- [ ] Tester sur l’instance Humanum ou l’institution cible.
- [ ] Tester un projet autorisé et un projet interdit.
- [ ] Tester lecture seule puis édition.
- [ ] Tester commit, renouvellement, reprise et fermeture.
- [ ] Tester expiration, refresh et révocation.
- [ ] Tester deux comptes et deux instances.
- [ ] Tester le binaire empaqueté.
- [ ] Tester la reprise après crash avec token expiré.
- [ ] Tester le mode PAT en parallèle.

### O6 — Documentation et pilote

- [ ] Documenter l’enregistrement de l’application OAuth.
- [ ] Documenter les scopes et les révocations.
- [ ] Documenter le repli PAT.
- [ ] Ajouter les limites par instance GitLab.
- [ ] Recueillir les retours des utilisateurs non techniques.
- [ ] Décider si OAuth devient le chemin recommandé ou reste optionnel.

## 15. Matrice minimale de recette

| Scénario | Preuve attendue |
|---|---|
| Connexion OAuth valide | Aucun PAT saisi ; le navigateur revient dans Sonal. |
| Consentement refusé | Aucun token créé et aucun miroir modifié. |
| `state` invalide | Connexion refusée et journalisation sans secret. |
| PKCE invalide | Aucun échange de token. |
| Callback concurrente | Une seule tentative gagne et l’autre est refusée. |
| Access token expiré | Refresh unique et session maintenue si le refresh réussit. |
| Refresh refusé | Connexion déclarée expirée ; candidat local conservé. |
| Token révoqué | État OAuth invalide explicite, sans faux succès. |
| Instance inconnue | Message PAT ou OAuth compréhensible, sans stack trace. |
| PAT après OAuth | Les deux comptes restent distincts et correctement stockés. |
| Deux instances | Aucun token ni callback envoyé à la mauvaise instance. |
| LFS | Les médias suivent le mode d’authentification sans fuite du secret. |
| Binaire empaqueté | Connexion et opérations passent hors du mode développement. |

## 16. Critères de sortie

- [ ] OAuth fonctionne sur l’instance cible avec une application enregistrée.
- [ ] Le renderer n’a accès à aucun secret OAuth.
- [ ] TLS et les diagnostics sont conformes aux règles V2.
- [ ] Le refresh est concurrent-safe et les erreurs sont distinguées.
- [ ] Le PAT reste utilisable sans régression.
- [ ] Les destinations et miroirs OAuth sont persistés comme les destinations PAT.
- [ ] Le flux est validé dans le binaire Electron.
- [ ] Les limites de scopes et d’instance sont documentées.
- [ ] Une décision claire est prise sur le caractère recommandé ou optionnel d’OAuth.

## 17. Relation avec les autres plans

`plan-gitlab4.md` reste la référence pour :

- le bail et son expiration ;
- la file par entretien ;
- les autosaves et la reprise ;
- la publication conditionnelle ;
- la veille et le réveil ;
- la fermeture et la récupération locale.

Ce plan ne doit pas remplacer ces garanties par une simple logique d’authentification.
Il fournit uniquement le credential dont le client GitLab a besoin pour les
opérations déjà définies.
