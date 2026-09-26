# GitLab — authentification OAuth pour la distribution

**Statut : O0 à O4 livrés — OAuth est le seul mécanisme d’authentification GitLab ; le PAT est retiré du client, du coffre, de l’interface et des tests. Restent la qualification réelle (O5) et la documentation finale (O6).**
**Ce plan est distinct de [plan-gitlab4.md](plan-gitlab4.md) : il traite l’authentification, pas la fiabilisation du bail et de la publication.**

## 1. Décision proposée

Remplacer le PAT par OAuth comme unique mécanisme d’authentification GitLab à
l’issue du chantier.

```text
Credential GitLab
└── Access token OAuth obtenu dans le navigateur
```

OAuth réutilise le client GitLab et les mécanismes existants de découverte, de
publication et de gestion des corpus. Il ne crée pas une seconde implémentation.

Le PAT existant n’est conservé que pendant la transition nécessaire pour
qualifier OAuth et permettre aux utilisateurs déjà configurés de se reconnecter.
Il disparaît ensuite de l’interface, du contrat du client, des tests fonctionnels
hors migration et du coffre.
Une instance sans application OAuth Sonal correctement enregistrée ne sera alors
pas compatible avec la connexion GitLab.

## 2. Pourquoi ce chantier maintenant

Le parcours PAT actuel est fonctionnel, mais il demande à l’utilisateur de :

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
- Retirer le parcours PAT après migration des configurations existantes.
- Éviter toute fuite de secret dans les logs, diagnostics ou erreurs.
- Tester le renouvellement, l’expiration, la révocation et les réponses perdues.
- Ne pas modifier le modèle de bail ou le format du corpus.

## 5. Hors périmètre initial

- Ne pas créer de serveur d’authentification Sonal.
- Ne pas créer de projet GitLab implicitement.
- Ne pas gérer les utilisateurs, groupes ou permissions GitLab.
- Ne pas supprimer le PAT avant que le flux OAuth soit qualifié sur l’instance cible.
- Ne pas conserver de mode PAT de secours dans le produit final.
- Ne pas faire de l’OAuth une condition de consultation d’un projet.
- Ne pas exposer les tokens au renderer.
- Ne pas afficher les tokens dans les logs, les captures de diagnostic ou les messages d’erreur.
- Ne pas copier le modèle non sécurisé de la V1.
- Ne pas écrire les tokens en clair dans le système de fichiers lorsque le coffre
  système est disponible.
- Ne pas confondre l’expiration d’un token OAuth avec l’expiration d’un bail GitLab.
- Ne pas ajouter de second stockage de présence ou de second système de coordination.

## 6. Modèle de credential

Le client GitLab reçoit uniquement un credential OAuth, par exemple :

```ts
interface CredentialOAuthGitLab {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}
```

Le `CredentialProvider` est interne au main et fournit notamment :

```ts
interface CredentialProviderGitLab {
  actuel(): Promise<CredentialOAuthGitLab | null>
  refresh(credential: CredentialOAuthGitLab): Promise<CredentialOAuthGitLab>
  revoquer?(credential: CredentialOAuthGitLab): Promise<void>
}
```

Le renderer ne voit que des résultats d’état :

```ts
type EtatAuthentificationGitLab =
  | { etat: 'non-connecte' }
  | { etat: 'connecte' }
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
peut l’enregistrer. La création d’une application par un utilisateur peut servir
à la qualification, mais la distribution finale exige un `Client ID` stable et
administré durablement pour chaque instance prise en charge.

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
- l’absence de collision entre deux fenêtres Sonal.

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

- l’access token OAuth ;
- le refresh token ;
- l’expiration ;
- les scopes observés ;
- la date de dernière rotation.

Les tokens OAuth doivent être écrits avec les mêmes garanties de sécurité que
le coffre existant :

- `safeStorage` lorsqu’il est disponible ;
- absence de secrets en clair dans les préférences ;
- absence de secrets dans les messages IPC normés ;
- écriture atomique ;
- permissions de fichier restrictives ;
- suppression ou remplacement contrôlé lors d’une déconnexion.

Un refresh token ne doit pas être rafraîché par plusieurs appels concurrents. Un
`single-flight` par compte est nécessaire.

## 9. Adaptation de l’API

Le `ClientGitLab` doit utiliser le credential OAuth avec l’en-tête :

```http
Authorization: Bearer <access-token>
```

Les endpoints de commit, de découverte, de branches et de lecture doivent être
rejoués sur l’instance GitLab ciblée avant de retirer la prise en charge interne
du header `PRIVATE-TOKEN`.

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

Les scopes trop larges doivent être signalés dans la documentation. Une instance
qui refuse l’application OAuth ou les scopes nécessaires est déclarée incompatible,
sans réactivation d’un parcours PAT.

## 11. Expérience utilisateur

```text
Se connecter à GitLab
→ navigateur GitLab
→ consentement
→ retour dans Sonal
→ projets accessibles
```

L’interface finale ne propose aucun champ de saisie de PAT. Lors de la migration,
une configuration PAT existante demande une reconnexion OAuth sans perdre les
destinations, miroirs ou candidats locaux. L’activation du mode OAuth seul purge
les PAT hérités du coffre, y compris pour les comptes qui ne se reconnectent pas.

Après connexion :

- afficher l’état de la connexion OAuth ;
- proposer « Se déconnecter » ;
- proposer « Oublier ce compte » avec confirmation ;
- ne jamais afficher le token ;
- expliquer clairement qu’une déconnexion ne supprime pas le projet GitLab ;
- conserver les destinations comme pour les autres comptes distants.

La déconnexion ne supprime pas le miroir local, les candidats de récupération ou
les journaux de session. Les tokens OAuth seuls sont oubliés et, lorsque GitLab
le permet, révoqués.

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
- réutilisation accidentelle d’un PAT hérité après la migration ;
- une révocation interprétée comme une permission métier.

TLS doit rester vérifié. Une option globale `rejectUnauthorized: false` est
interdite. Les diagnostics doivent expurger les tokens, codes, headers Authorization
et fragments de callback.

## 14. Lots de réalisation

### O0 — Décision et tests de contrat

- [x] Confirmer les instances GitLab cibles : aucune imposée, l’utilisateur choisit, l’instance est détectée depuis l’adresse du projet.
- [x] Choisir la stratégie d’enregistrement : registre de la distribution **et** application créée par l’utilisateur (`Client ID` saisi, non secret).
- [x] Vérifier la callback loopback et la redirect URI : port fixe 7474, testée sur port libre.
- [x] Mesurer les scopes sur REST et commits : `api` est exigé, `write_repository` ne suffit pas.
- [x] Définir le contrat `CredentialOAuthGitLab`.
- [x] Définir la migration : coffre en format 4, purge des PAT, comptes et destinations conservés.
- [x] Décrire les comptes multi-instance : une entrée par instance et par compte, destinations rattachées au compte.

### O1 — Credential OAuth

- [x] Introduire le `CredentialProvider` OAuth dans le main.
- [x] Faire fonctionner le `ClientGitLab` avec OAuth sans dupliquer le client.
- [x] Tester l’en-tête Bearer sur tous les endpoints utilisés.
- [ ] Tester le transport Git LFS avec OAuth si LFS reste supporté — aucun transport LFS n’existe encore en V2.
- [x] Garder les secrets hors du renderer et des diagnostics.

### O2 — Flux Authorization Code + PKCE

- [x] Ouvrir le navigateur depuis le main.
- [x] Implémenter la callback loopback bornée.
- [x] Vérifier `state`, PKCE et expiration de la tentative.
- [x] Échanger le code contre les tokens.
- [x] Gérer annulation, refus, erreur réseau et code déjà utilisé.
- [x] Tester deux connexions concurrentes.

### O3 — Stockage et rotation

- [x] Stocker access token, refresh token, expiration et scopes dans le coffre.
- [x] Implémenter le refresh single-flight.
- [x] Gérer la rotation et le remplacement d’un token révoqué.
- [ ] Tester le redémarrage de l’application — couvert par la persistance du coffre, pas encore par un test de bout en bout.
- [x] Tester la déconnexion et l’oubli d’un compte.
- [x] Vérifier qu’aucun token ne reste dans les logs ou les fichiers de diagnostic.

### O4 — Intégration et retrait du PAT

- [x] Ajouter « Se connecter à GitLab » dans l’interface.
- [x] Demander une reconnexion OAuth pour les comptes existants.
- [x] Conserver leurs destinations, miroirs et candidats locaux pendant la migration.
- [x] Purger tous les PAT du coffre : format 4, suppression à la lecture.
- [x] Retirer la saisie de PAT, le header `PRIVATE-TOKEN` et le stockage associé.
- [x] Afficher l’état OAuth sans exposer le secret.
- [x] Ne pas modifier le contrat du bail ou du corpus.
- [x] Vérifier la création d’un corpus dans un projet existant.
- [ ] Rebrancher le banc Playwright : il pilotait la saisie du jeton, il lui faut une entrée de qualification OAuth (il échoue avec un message explicite en attendant).

### O5 — Qualification réelle

- [ ] Tester sur l’instance Huma-Num ou l’institution cible.
- [ ] Tester un projet autorisé et un projet interdit.
- [ ] Tester lecture seule puis édition.
- [ ] Tester commit, renouvellement, reprise et fermeture.
- [ ] Tester expiration, refresh et révocation.
- [ ] Tester deux comptes et deux instances.
- [ ] Tester le binaire empaqueté.
- [ ] Tester la reprise après crash avec token expiré.
- [x] Tester la purge d’un compte PAT sans perte de données locales (banc unitaire).
- [x] Vérifier qu’aucune nouvelle connexion PAT n’est possible (plus aucun champ ni API ne l’accepte).

### O6 — Documentation et pilote

- [x] Documenter l’enregistrement de l’application OAuth : `docs/dev/gitlab-oauth.md`.
- [x] Documenter les scopes, leur mesure et les révocations.
- [x] Documenter la migration des comptes existants.
- [x] Indiquer qu’une application OAuth enregistrée est requise sur chaque instance.
- [x] Ajouter les limites par instance GitLab.
- [ ] Recueillir les retours des utilisateurs non techniques.
- [ ] Documenter OAuth comme unique mode de connexion GitLab.

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
| Instance inconnue | Message OAuth compréhensible, sans stack trace. |
| Instance sans application Sonal | Connexion déclarée indisponible, sans proposition de PAT. |
| Compte PAT hérité | Reconnexion OAuth demandée ; données locales conservées et PAT purgé du coffre. |
| Nouvelle saisie de PAT | Aucun parcours utilisateur ni API applicative ne l’accepte. |
| Deux instances | Aucun token ni callback envoyé à la mauvaise instance. |
| LFS | Les médias suivent le mode d’authentification sans fuite du secret. |
| Binaire empaqueté | Connexion et opérations passent hors du mode développement. |

## 16. Critères de sortie

- [ ] OAuth fonctionne sur l’instance cible avec une application enregistrée.
- [ ] Le renderer n’a accès à aucun secret OAuth.
- [ ] TLS et les diagnostics sont conformes aux règles V2.
- [ ] Le refresh est concurrent-safe et les erreurs sont distinguées.
- [ ] OAuth est l’unique mode d’authentification GitLab exposé et accepté.
- [ ] Aucun PAT n’est conservé après l’activation du mode OAuth seul.
- [ ] Les destinations, miroirs et candidats locaux survivent à la migration vers OAuth.
- [ ] Le flux est validé dans le binaire Electron.
- [ ] Les limites de scopes et d’instance sont documentées.
- [ ] La liste des instances compatibles et de leurs `Client ID` est documentée.

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
