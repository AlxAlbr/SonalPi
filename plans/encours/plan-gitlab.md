# Corpus hébergés sur GitLab — plan d'intégration dans SonalPi2

**Statut : proposition à valider, aucune implémentation engagée.**

## 1. Objectif et recommandation

Permettre d'ouvrir, créer et modifier un corpus SonalPi2 hébergé dans un projet
GitLab, avec le même travail quotidien que pour Nextcloud : copie locale,
autosauvegarde, publication, édition exclusive d'un entretien, actualisation,
protection contre les écrasements et récupération après incident.

**Recommandation : conserver l'architecture V2 et ajouter un backend GitLab REST,
pas porter le stockage de la V1 ni transformer l'application en client Git.**
Le modèle métier, `CorpusStore`, l'éditeur et les formats JSON restent communs.
Les différences doivent vivre dans les adaptateurs de lecture, publication et
coordination, avec quelques capacités explicites dans l'interface.

Le socle Nextcloud est un bon point de départ, mais il n'est pas encore indépendant
du transport. Un simple `ClientGitLab` imitant `ClientWebDAV` serait insuffisant :
GitLab publie des commits, ne fournit pas les mêmes préconditions HTTP et conserve
l'historique des contenus supprimés. Les garanties de concurrence doivent être
prouvées avant d'autoriser la première édition GitLab.

### Décisions proposées

| Sujet | Proposition |
|---|---|
| Transport | API REST GitLab v4, dans le main Electron ; ni clone, ni binaire Git requis. |
| Adresse d'un corpus | Instance + ID numérique de projet + branche explicitement choisie + sous-dossier relatif. |
| Format | `corpus.json` et `entretiens/<id>.json` V2 ; pas de double écriture `.crp`/`.sonal`. |
| Écriture | Commits conditionnels ; commit multi-fichiers pour une opération métier indivisible. |
| Sessions | Réutiliser le cycle V2 et ses copies de récupération. |
| Verrous | Prototype de verrous coopératifs versionnés, sur la même branche que les données ; décision définitive après banc réel et mesure du coût. |
| Présence 👁 | Non disponible dans le premier périmètre GitLab ; ne pas créer un commit par lecteur et par minute. |
| Audio/vidéo | Association locale conservée ; lecture sélective des médias déjà hébergés, bornée et testée ; téléversement volumineux/LFS reporté. |
| Authentification | PAT pour le banc et la première préversion ; OAuth PKCE pour retrouver le parcours navigateur de la V1 avant diffusion générale. |
| Migration V1 | Import explicite vers une nouvelle destination V2 ; jamais de conversion automatique du dépôt source. |

Ces choix sont des propositions, notamment les verrous versionnés, le périmètre
média et l'absence initiale de présence. Les arbitrages bloquants sont regroupés
à la fin du document.

## 2. État des lieux vérifié

### 2.1 Sources et limites de cette étude

- V2 : `/home/belignem/Vscode/SonalPiTestV2`, branche `multiongletcorpus`,
  HEAD `5511f658fce59212feb28617782228980bf4b8b9` ; lecture du code courant.
- V1 : `/home/belignem/Vscode/SonalPi`, branche `AmeliorPseudo`,
  HEAD `7e7b58de3a2d7a7f2c3ea292a9406ff71575ed9f` ; analyse statique du parcours GitLab.
- Documentation officielle GitLab : références en fin de document. Elle décrit
  les API, mais ne remplace pas une validation sur les versions des instances visées.
- Aucun test applicatif ou serveur n'a été exécuté pour cette étude ; aucune
  connexion à un compte réel, aucun dépôt distant modifié.
- Des travaux locaux préexistants sur la documentation et les bancs de charge
  étaient présents dans la V2. Ils ne font pas partie de ce chantier.

### 2.2 Le socle V2 à préserver

| Élément existant | Rôle et intérêt pour GitLab |
|---|---|
| `src/main/corpusStore.ts` | Persistance locale, gardes d'écriture, préparation/finalisation d'ouverture ; continue de travailler sur un dossier miroir. |
| `src/shared/corpus/`, `src/shared/entretien/` | Modèle et transformations métier ; aucune connaissance du serveur à ajouter. |
| `src/main/distant/miroir.ts` — `MiroirWebDAV` | Tirage incrémental, manifeste, exclusions des entretiens en session, corbeille locale, médias désignés. |
| `src/main/distant/sessions.ts` — `SessionsDEntretien` | Acquisition, lecture fraîche, autosauvegarde locale, publication, sérialisation par entretien, rétrogradation, copies de divergence et reprise. |
| `src/main/distant/transactions.ts` — `TransactionsCorpus` | Définitions, création/import/suppression, lots, personnes, sources de passages et migrations sous protection distante. |
| `src/main/transactionsFichiers.ts` | Plans de création/suppression et reprise durable des opérations locales. |
| `src/main/verrous/types.ts` — `VerrouProvider` | Contrat d'exclusion existant : acquérir, battre, libérer, observer. |
| `src/main/distant/coffre.ts` — `CoffreComptes` | Secrets chiffrés via `safeStorage`, repli en mémoire sans trousseau, identités et migrations du coffre. |
| `src/main/transitionContexte.ts`, `src/main/index.ts` | Bascule refusée si une session ne peut pas être fermée ; installation du nouveau contexte après préparation. |
| `src/renderer/composables/corpus/useDistantCorpus.ts` | Actualisation, état réseau, badges, état de session, publication manuelle. |
| `src/shared/entretien/fusion.ts` | Fusion applicative existante, sans fusion automatique de transcriptions différentes. |

Invariants à conserver :

1. Le miroir ne pousse jamais spontanément ses fichiers ; seules les commandes
   et sessions autorisées publient.
2. Une lecture ordinaire d'entretien ne prend pas de verrou et ne déclenche pas
   d'autosauvegarde.
3. Après acquisition, la version distante fraîche fait foi ; une publication
   est conditionnée par la version effectivement lue.
4. Une modification arrivée pendant une publication reste sale : conserver les
   révisions monotones des sessions.
5. Une copie sale, dégradée ou récupérable après crash n'est jamais écrasée par un
   tirage ; sa conservation doit être vérifiée avant le premier tirage de reprise.
6. Une publication finale précède la libération, ou les deux sont atomiques.
   Une fermeture échouée ne doit pas basculer sur un autre corpus.
7. Aucun secret enregistré ne revient au renderer, dans les événements, les
   exports ou les logs. La saisie initiale est transmise au main puis effacée de l'UI.
8. Les récents distants passent par l'ouverture distante, jamais par le chemin
   du miroir ouvert comme un corpus local.

**Ne pas assimiler les intentions documentées à des garanties déjà testées.**
Par exemple, la documentation évoque une poursuite d'édition hors ligne sous
verrou, alors que `useDistantCorpus.entretienEditable` dépend aussi de
`enLigne`. Caractériser le comportement réel avant extraction ; ce chantier
n'introduit ni édition hors ligne illimitée ni file de commits différés.
Le gestionnaire de divergences enrichi décrit dans
[plan-multiuser-finition.md](plan-multiuser-finition.md) est un chantier distinct :
GitLab doit réutiliser le mécanisme effectivement livré, sans en supposer la finition.

### 2.3 Les couplages à enlever, sans réécriture générale

- `MiroirWebDAV` utilise directement `propfind`, les ETags, `MKCOL`, les transferts
  et les erreurs WebDAV. Son `accesClient()` expose même le client concret.
- `SessionsDEntretien` reçoit un `ClientWebDAV`, fabrique les deux providers
  concrets et contient des scans et reprises spécifiques aux verrous DAV.
- `TransactionsCorpus` fait de même, avec des publications séquentielles et des
  compensations adaptées à WebDAV ; le verrou corpus est toujours un
  `ProviderPutConditionnel`.
- `ProfilCapacites` ne décrit aujourd'hui que `preconditions` et `filesLock`.
- `ConfigCorpusDistant`, `DemandeConnexion` et les écrans supposent une URL DAV,
  un login et un mot de passe d'application.
- `src/main/index.ts` construit tout ce contexte et choisit les variantes DAV.
- `src/main/docsCadreDistant.ts` consulte directement WebDAV et construit une
  URL Nextcloud ; l'IPC `docsCadre:ouvrirDansNextcloud` est spécifique.
- Les médias utilisent une désignation relative déjà réutilisable
  (`meta.audioDistant.chemin`), mais les actions et messages parlent de Nextcloud.

Le but n'est donc pas d'introduire un grand `Storage` universel : il faut extraire
les quelques contrats nécessaires au **travail distant**, à côté du store local.

### 2.4 Ce que la V1 apporte réellement

Références V1 principales : `modules/gitlab_api.js`, `modules/gitlab_oauth.js`,
`main.js::ouvrirCorpusGitLab`, `modules/gestion_corpus.js::rafraichirCorpus`,
`modules/gestion_entretiens.js`, `saisie-distant.html` et `parametres-gitlab.html`.

À reprendre comme besoins et retour d'expérience :

- instances GitLab configurables, groupes/sous-groupes, projet et chemin de corpus ;
- connexion navigateur OAuth avec PKCE, `state` et jetons conservés côté main ;
- récents, ouverture, import/sauvegarde des entretiens, actualisation collaborative ;
- affichage d'un entretien tenu par autrui et possibilité de consulter ;
- option V1 `restrictionAjoutSuppr` à examiner avec les utilisateurs concernés.

À **ne pas porter tel quel** :

- branche `main` imposée dans le parcours réel, même si le client accepte une branche ;
- création automatique du `.crp` absent et écritures de `.gitattributes` à l'ouverture ;
- debounce de 150 ms et batching traités comme une protection contre les conflits :
  les écritures inspectées n'envoient pas de `last_commit_id` ;
- LFS Locks sans expiration et identification du propriétaire par nom/username ;
- permissions limitées à des contrôles renderer ;
- TLS désactivé avec `rejectUnauthorized: false` et journalisation de l'URL du
  callback OAuth, susceptible de contenir le code d'autorisation ;
- actualisation incomplète des suppressions et de certaines données d'anonymisation ;
- promesse implicite de partage audio : aucun pipeline audio binaire GitLab
  fonctionnel n'a été établi dans ce code ;
- prétendue conversion automatique des `.sonal` en LFS par simple réécriture via
  Repository Files : upload des objets et génération des pointeurs non démontrés.

La V1 est une **référence fonctionnelle, pas une preuve de sûreté du protocole**.
Aucun banc GitLab/OAuth/concurrence dédié n'a été identifié dans ses tests.

## 3. Périmètre fonctionnel et limites annoncées

### Première livraison utilisable en équipe

- Configurer une instance, sélectionner un projet accessible, sa branche et un
  sous-dossier ; afficher la destination complète avant validation.
- Ouvrir un corpus V2 existant, retrouver son compte dans les récents, actualiser.
- Créer un corpus V2 dans une destination libre d'un **projet existant**, sans
  toucher aux autres fichiers. La création de projets/groupes n'est pas nécessaire.
- Consulter en lecture seule quand les droits ou capacités ne permettent pas
  l'édition ; ne jamais déguiser un refus d'accès en corpus vide.
- Éditer et publier un entretien ; appliquer les mutations déjà autorisées en
  distant : définitions, imports, suppressions, lots, liens et personnes.
- Retrouver les protections, copies de divergence et reprises de la V2.
- Consulter les Docs cadre, ouvrir le projet/dossier dans GitLab sans jeton dans
  l'URL, associer un média local et consulter les médias distants pris en charge.
- Expliquer les limites GitLab dans l'UI : présence absente, médias non
  téléversables, droits de branche, quotas, jeton expiré.

### Hors périmètre initial

- Clone local, staging, rebase, fusion textuelle Git, push forcé, gestion de merge
  requests, branches personnelles et travail asynchrone par fusion de branches.
- Édition simultanée d'un même entretien ; ajout d'un CRDT/Yjs.
- Administration des membres/groupes GitLab depuis Sonal.
- Bascule transparente du même corpus entre Nextcloud et GitLab ou synchronisation
  bidirectionnelle entre ces deux serveurs.
- Upload de médias de plusieurs Go via des commits base64 ; client LFS complet.
- Restauration d'une ancienne version Git depuis Sonal ; l'historique reste
  consultable dans GitLab, mais n'est pas un nouveau gestionnaire de versions UI.
- Conversion destructive d'un corpus V1 en place.

Les fonctionnalités actuellement refusées en distant, par exemple l'édition des
notes de corpus et certaines annulations/corrections, restent refusées. Ce projet
ne doit pas étendre indirectement leur périmètre.

## 4. Architecture cible

### 4.1 Coutures proposées

Les noms suivants sont des noms de travail, à fixer au premier lot d'extraction.

```text
Renderer / preload : commandes Sonal + capacités publiques
                         |
               ContexteCorpusDistant (main)
                /          |           \
         MiroirDistant   Sessions   TransactionsCorpus
                \          |           /
                  contrats distants
                    /            \
       adaptateur WebDAV       adaptateur GitLab
       client + providers      REST + commits + verrous
                    \            /
                     CorpusStore
                   (dossier local)
```

Séparer trois responsabilités plutôt que faire implémenter des méthodes DAV à GitLab :

1. **Lecture distante** : inventaire relatif, lecture d'un fichier avec sa version,
   téléchargement borné/streamé, navigation et lien web. GitLab peut fixer un
   instantané de lecture ; WebDAV garde sa stratégie existante.
2. **Publication distante** : appliquer un plan de créations/modifications/
   déplacements/suppressions assorti de versions attendues ; retourner les
   versions publiées et un résultat confirmé ou indéterminé. La stratégie
   WebDAV conserve son ordre et ses compensations ; GitLab utilise un commit.
3. **Coordination** : fabrique de providers, inventaire des verrous, reprise et
   présence optionnelle. Les particularités files_lock/LFS ne remontent pas
   dans le métier.

Ne pas annoncer une atomicité multi-fichiers universelle : c'est une capacité
GitLab, pas une garantie de l'adaptateur WebDAV. Les plans métier doivent exprimer
l'ordre de sûreté nécessaire lorsque la publication n'est pas atomique.

Créer une fabrique `creerContexteDistant(config, secret, ...)` qui assemble le
backend, le miroir, les sessions, les transactions et éventuellement la présence.
L'extraction vise le bloc distant de `index.ts`, pas tous ses handlers IPC.

### 4.2 Versions, contenus et erreurs

Introduire des types qui ne confondent pas trois notions :

| Notion | WebDAV | GitLab |
|---|---|---|
| Empreinte de contenu pour éviter un téléchargement | ETag existant | `blob_id` de l'arbre Git |
| Garde d'écriture d'un fichier | ETag lu | `last_commit_id` renvoyé pour ce fichier |
| Instantané de lecture du corpus | Pas d'instantané global garanti | SHA du commit résolu depuis la branche |

Une version est opaque pour les sessions. Un SHA de tête de branche ou un
`blob_id` **ne remplace pas** arbitrairement le `last_commit_id` d'un fichier.
La lecture de contenu et de sa garde doit correspondre au même état observé.

Le manifeste local devient versionné et identifié par backend/destination.
L'évolution doit lire les anciens manifestes DAV sans perdre les copies sales ;
une reconstruction du cache n'autorise jamais leur suppression.

Normaliser les erreurs à la frontière du backend : `absent`, `authentification`,
`interdit`, `conflit`, `limite`, `reseau`, `delai`, `format`, `capaciteInsuffisante`,
ainsi qu'un résultat de publication `indetermine`. Garder le code HTTP pour le
diagnostic expurgé. Un `400` GitLab n'est pas toujours un conflit ; un `404` de
projet privé peut masquer un défaut d'accès.

### 4.3 Comptes, secrets et compatibilité

- Remplacer les configurations monomorphes par une union discriminée
  `type: 'webdav' | 'gitlab'`. Idem pour les demandes de connexion/création.
- Configuration GitLab : URL canonique d'instance, `projectId`, chemin/nom du
  projet pour affichage, `branche`, `racineCorpus`, ID utilisateur GitLab stable,
  mode d'authentification et références de secrets côté main uniquement.
- Utiliser la branche par défaut du projet comme **suggestion**, jamais `main`
  codé en dur. Une fois sélectionnée, mémoriser son nom sans suivre silencieusement
  un changement de branche par défaut.
- Identité du miroir GitLab : backend + instance (sous-chemin compris) + ID projet
  + branche + racine corpus + compte. Exclure le jeton : le renouveler ne crée
  pas un nouveau miroir. Deux branches/comptes ne doivent jamais partager un cache.
- Migrer le coffre actuel de version 2 : comptes sans discriminant = WebDAV,
  IDs et références Nextcloud conservés. Écriture atomique, sauvegarde de migration,
  reprise idempotente et test avec secrets seulement en mémoire.
- Séparer à terme connexion à une instance et emplacement de corpus pour réutiliser
  un OAuth entre projets ; ne pas coupler cette amélioration à une réorganisation
  risquée de tous les IDs Nextcloud.
- Capacités publiques : lecture, édition, création, présence, lecture média,
  téléversement média, lien web ; conserver les diagnostics techniques DAV dans
  leur branche. Les refus sont aussi appliqués côté main, pas seulement via boutons.

Les récents peuvent conserver `type: 'distant'` et leur ID ; ajouter le libellé de
fournisseur/destination à l'affichage. Aucun besoin de changer le format métier
`FORMAT_VERSION` (actuellement 8) uniquement pour ajouter GitLab.

## 5. Protocole GitLab : décisions à prouver

### 5.1 Lecture d'un corpus cohérent

1. Résoudre le projet puis la branche vers un commit `S`.
2. Lire `corpus.json`, les fichiers nécessaires et toutes les pages de l'arbre
   sous `racineCorpus`, avec `ref=S`, pas avec un nom de branche qui peut avancer.
3. Télécharger seulement les contenus dont l'empreinte a changé ; récupérer
   les gardes d'écriture quand nécessaires. Éviter une requête de métadonnées
   pour chaque entretien inchangé à chaque minute.
4. Préparer les JSON dans une zone locale temporaire ; valider format et
   cohérence du membership avant installation. Un JSON manquant/invalide n'est
   pas un corpus vide à amorcer.
5. Installer le tirage sans toucher aux entretiens exclus ; déplacer les vraies
   disparitions dans la corbeille locale. Ne jamais déduire une suppression d'une
   liste tronquée, d'un timeout, d'un 403 ou d'une pagination inachevée.
6. Mettre à jour l'instantané et les empreintes effectivement appliquées, sans
   avancer la base des entretiens exclus. Signaler ensuite les changements à l'UI.

Autoriser uniquement les fichiers de contenu prévus : ne pas aspirer tous les
JSON d'un dépôt arbitraire. Exclure caches, verrous, sessions, corbeille, fichiers
locaux d'audio et fichiers techniques. Rejeter symlinks/sous-modules pour les
chemins du corpus ; contrôler aussi les collisions de noms sur Windows.

L'ouverture en lecture seule doit être réellement sans écriture serveur : ne pas
appeler automatiquement les actuels `migrerFormatSiNecessaire()` et
`reconcilierFichiersOrphelins()`. Un ancien format nécessitant une mutation est
refusé avec une proposition de migration explicite, ou lu via une conversion
locale démontrée non publiée ; pas de migration cachée avec un compte lecteur.

### 5.2 Écriture conditionnelle et opérations atomiques

Utiliser `POST /projects/:id/repository/commits` et son tableau `actions[]` :

- création : action `create`, refus si le chemin existe ;
- mise à jour/suppression/déplacement : `last_commit_id` de la version observée,
  selon les garanties réellement vérifiées pour chaque action ;
- création/import d'entretien : entretien + membership dans le même commit ;
- suppression : membership + déplacement du JSON vers une corbeille au nom
  unique dans le même commit ;
- mutations liées de personnes/définitions/entretiens et migration de format :
  même plan métier, commit atomique si le lot tient dans les limites validées.

Ne pas recopier les deux PUT de création Nextcloud en deux commits GitLab.
Ne pas découper silencieusement une opération indivisible si le lot dépasse la
limite : refuser avant publication et prévoir ultérieurement un protocole dédié.

**Pas de faux compare-and-swap de branche :** `start_sha` n'est pas un paramètre
« tête attendue » et `force: true` n'est jamais une solution de concurrence.
La documentation donne des gardes par fichier, pas un CAS global de branche.
Les commits sans changement doivent être reconnus comme tels, sans provoquer
une boucle de publication ni transformer un vrai refus en succès.

Un changement extérieur d'un fichier lu mais non écrit mérite un traitement
explicite : un verrou Sonal protège seulement des clients coopératifs. Les
opérations qui dépendent de sources inchangées doivent inventorier ces sources,
les relire sous protection et tester la portée exacte de leur validation ; ne
pas prétendre disposer d'une isolation sérialisable face à tout éditeur GitLab.

### 5.3 Verrous : prototype retenu et porte de décision

**Ne pas partir des LFS Locks V1 comme si c'était files_lock Nextcloud.** Leur
existence ne prouve pas que l'API de commits interdit une modification du JSON
verrouillé. Ils n'offrent pas non plus directement le cycle de bail V2.

Prototype recommandé : fichiers `verrous/<id>.lock.json` et
`verrous/corpus.lock.json` dans la racine du corpus, sur **la même branche**.

- Acquisition : création exclusive du fichier ; un seul gagnant entre deux postes.
- Battement : mise à jour conditionnelle avec la garde détenue ; identité de
  session aléatoire, machine stable, utilisateur GitLab identifié par ID.
- Reprise d'un bail expiré : remplacement conditionnel du fichier observé, après
  politique TTL/marge et confirmation ; un ancien propriétaire ne récupère pas
  implicitement son droit d'écrire.
- Libération : suppression conditionnelle ; ne jamais supprimer un verrou qui
  a été repris par autrui.
- Publication : commit contenant **la modification de données ET une mutation
  conditionnelle du verrou détenu**. Cela lie la publication à la génération du
  bail au moment du commit, pas à un GET de vérification fait avant le commit.
  Le contenu du verrou doit réellement changer (compteur/nonce si nécessaire).
- Sérialiser publication et battement ; après succès, avancer ensemble versions
  du contenu et du verrou. La fermeture peut publier et supprimer son verrou
  dans un seul commit si le banc prouve cette opération.
- Garder l'ordre canonique corpus puis entretiens triés pour les opérations à
  plusieurs verrous. Borner/renouveler les transactions longues et traiter la
  perte d'un verrou avant de publier leurs résultats.

Ce besoin dépasse les quatre méthodes actuelles de `VerrouProvider` : prévoir
une couture de **publication sous bail**, sans exposer les actions GitLab aux
sessions. Vérifier puis écrire en deux requêtes ne suffit pas.

**Coût à accepter ou à résoudre avant généralisation :** un bail battu toutes
les 60 secondes produit environ 480 commits sur huit heures, par session, hors
publications et prises/libérations. Désactiver la présence ne supprime pas ce
coût. Mesurer volume, latence, quotas, bruit historique, pipelines et contention.
Les messages peuvent porter `[skip ci]`, mais les politiques GitLab peuvent
restreindre cette convention ; recommander un projet de données sans CI active.

Ne pas déplacer simplement les verrous dans une autre branche : cela empêche
la garde atomique verrou + contenu. Ne pas allonger arbitrairement le TTL pour
masquer la charge au prix d'une reprise de crash dégradée.

**Porte de décision :** si les gardes ou le coût ne sont pas satisfaisants,
livrer seulement la consultation et rouvrir un arbitrage documenté : service
externe de baux, protocole LFS réellement démontré, ou mode optimiste avec une
UX différente. Aucun basculement silencieux vers « dernier écrivain gagnant ».

### 5.4 Échecs, résultats incertains et reprise

- Journaliser localement avant envoi : identifiant d'opération, destination,
  versions de base, chemins et empreintes candidates ; aucun secret.
- Distinguer refus certain et réponse perdue après commit possible.
- Pour une réponse perdue, rechercher la preuve de l'opération (identifiant de
  commit connu ou marqueur d'opération non sensible dans son message), comparer
  les contenus et versions au bon instantané, puis actualiser l'état courant.
  L'égalité avec la tête actuelle n'est pas la seule preuve : un autre commit
  peut déjà avoir succédé au nôtre.
- Ne pas renvoyer aveuglément un POST de commit, un import ou une suppression.
  Si la conclusion reste inconnue, conserver le journal/candidat et bloquer
  la transition concernée ; ne pas annoncer « publié ».
- En conflit, garder la copie locale et utiliser le parcours de divergence V2.
  Pas de relire-la-version-puis-réécrire le même candidat sans réévaluation.
- Un retry borné est possible pour une contention de branche sans changement
  des fichiers ni baux concernés, après revalidation ; sinon intervention utilisateur.
- Avant tout tirage de réouverture, identifier les sessions/journaux locaux à
  protéger. Reprendre avec une nouvelle acquisition conditionnelle et une
  comparaison à la base conservée, jamais avec un verrou hérité du lancement précédent.
- Force-push, suppression/recréation de branche, retour à une ancienne histoire :
  détecter autant que possible une rupture d'ascendance, suspendre les écritures
  et préserver les copies. Exiger une branche sans force-push dans le périmètre
  supporté ; aucune garantie absolue contre un administrateur réécrivant le dépôt.

## 6. Authentification, droits et sécurité des données

### Connexion

- PAT : champ masqué, scope minimal documenté. Pour les API d'écriture retenues,
  prévoir `api` ; `write_repository` concerne Git-over-HTTP et ne suffit pas à
  remplacer ce scope pour les commits REST. Valider les scopes de lecture sur
  l'ensemble des endpoints utilisés, pas seulement Repository Files.
- OAuth : application publique avec PKCE S256, `state` aléatoire vérifié,
  navigateur système, callback loopback, durée bornée et fermeture du listener.
  Documenter l'enregistrement de l'application et du redirect URI par instance,
  ainsi que le cas où le port local est occupé. Pas de secret client embarqué.
- Tester le renouvellement en cours de session, la rotation du refresh token,
  les appels simultanés n'entraînant qu'un renouvellement, l'annulation et la
  révocation. Conserver les deux jetons dans le coffre ou en mémoire seulement.
- HTTPS et validation TLS obligatoires hors boucle locale des tests ; prendre
  en charge les certificats institutionnels via une configuration de confiance
  explicite, jamais via une désactivation globale de la vérification.
- Pas de jeton en query string, URL de média, URL d'ouverture web, logs, message
  d'erreur ou manifeste. Refuser les URLs contenant des identifiants intégrés.
- Pour le JSON/API, refuser les redirections non prévues ; pour un média/LFS,
  si une redirection est nécessaire, en valider la destination et ne jamais
  propager automatiquement les credentials GitLab à une autre origine.

### Permissions et destinations

Vérifier utilisateur, accès au projet, branche existante/protégée, archivage du
projet et possibilité de pousser. Les rôles sont indicatifs : la règle effective
d'une branche peut interdire un push à un Developer. Recontrôler les erreurs
serveur à chaque mutation, y compris après retrait de droits en session.

Séparer dans l'UI `enLigne`, `lectureAutorisee` et `editionAutorisee` : le seul
computed actuel `!enLigne` ne décrit pas un compte GitLab en lecture seule.
Les sondes d'écriture utilisent une destination de test explicitement autorisée,
pas des commits cachés dans le corpus d'un utilisateur.

Valider les chemins à l'entrée IPC et après décodage : pas de `..`, absolu,
anti-slash, NUL, sortie de racine ou encodage double ambigu. Encoder séparément
ID/projet, chemin de fichier et paramètres `ref`. Tester espaces, accents,
sous-groupes et branches contenant `/`. Tous les appels restent côté main.

### Point bloquant : données sensibles et historique Git

**Supprimer ou anonymiser le contenu courant ne supprime pas les versions
précédentes du dépôt.** Les transcriptions, anciens noms, chemins locaux,
identités des auteurs et traces des verrous peuvent rester dans l'historique,
les clones, forks et sauvegardes.

Avant usage réel : projet privé, habilitations adaptées et politique de conservation
validée par les responsables du corpus. Si l'effacement effectif des versions
antérieures est une exigence, GitLab peut être inadapté ; ne pas promettre un
« effacement RGPD » par un simple commit. Une réécriture d'historique éventuelle
relève d'une procédure administrative distincte, pas d'une fonction automatique.
Les fixtures, messages de commits et captures des tests doivent rester synthétiques.

## 7. Médias, documents et migration V1

### Médias et Docs cadre

- Conserver `audioRef`, `audio-locaux.json`, le protocole local `sonal-media` et la
  génération locale des formes d'onde. Aucun chemin spécifique à un poste ne
  doit être ajouté au partage pour remplacer une association locale.
- Réutiliser `audioDistant.chemin` pour un média relatif à la racine du corpus
  GitLab ; changer son commentaire Nextcloud sans changer gratuitement le format.
- Lire les médias déjà présents par API raw, en flux vers un temporaire puis
  renommage, avec timeout, annulation, progression et cache. Un échec média ne
  bloque pas la lecture des transcriptions.
- Détecter les pointeurs LFS : soit résoudre explicitement le contenu via le
  mécanisme validé (par exemple raw avec `lfs=true` sur les versions compatibles),
  soit afficher « média LFS non pris en charge ». Ne jamais lire un pointeur
  texte comme un fichier audio ; ne pas affirmer que changer `.gitattributes`
  téléverse un objet LFS.
- Les gros JSON peuvent aussi rencontrer les limites GitLab : tester tailles et
  fréquences ; le seuil de throttling documenté n'est pas une limite universelle
  de taille. Rendre les limites locales configurables et documentées.
- `distant:televerserAudio` est refusé côté main pour GitLab tant que la capacité
  manque. Le sélecteur et l'UI expliquent l'alternative, sans envoi base64 implicite.
- Extraire le lecteur distant de Docs cadre : inventaire, aperçus bornés,
  téléchargement d'une copie, URL web construite dans le main. Renommer la
  commande en `ouvrirSurServeur` et adapter preload, types, composable et tests.
  Conserver la lecture seule et les vérifications de signature/encodage.

### Migration V1 explicite, dans un lot séparé

La migration locale actuelle est documentée dans
[docs/user/migration-v1.md](../../docs/user/migration-v1.md) et repose notamment
sur `src/shared/corpus/migrationCrp.ts` et `CorpusStore.migrerDepuisV1`.
Elle n'importe pas aujourd'hui un corpus GitLab V1 directement.

Parcours proposé :

1. Choisir projet/branche/chemin `.crp` V1 ; figer un commit source.
2. Télécharger dans une zone temporaire privée le `.crp`, les `.sonal` référencés
   et les annexes nécessaires ; résoudre les vrais pointeurs LFS ou arrêter
   avec un bilan nominatif. Ne pas exécuter ni afficher comme HTML de confiance
   les fichiers importés.
3. Réutiliser la migration locale V2 ; produire le bilan : entretiens, thèmes,
   variables/EAV, locuteurs, annotations, anonymisation, audio introuvable,
   éléments ignorés et options V1 non reprises.
4. Tester spécifiquement `tabAnon`, `paramsAnonCorpus` et les blocs JSON embarqués
   dans les `.sonal`, ainsi que l'absence d'un fichier référencé.
5. Choisir une **nouvelle destination** V2, vérifier l'absence de corpus et
   publier explicitement. Pour les gros corpus, préparer une destination non
   publiée/branche d'import et ne la rendre utilisable qu'une fois complète ;
   ne pas simuler un commit atomique en découpant silencieusement un import.
6. Conserver le dépôt/chemin V1 intact. Aucun fonctionnement mixte V1/V2 sur les
   mêmes fichiers et aucun import automatique des anciens jetons.

`restrictionAjoutSuppr` nécessite un choix de produit : la reprendre comme règle
Sonal par corpus avec contrôle main, ou annoncer son absence. Une règle stockée
dans un JSON que les membres peuvent modifier n'est pas une permission GitLab.
Ne pas reprendre implicitement `options.json` à la racine de tout le projet.

## 8. Lots de réalisation et critères de sortie

Chaque lot doit être relisible et validable séparément. Les chemins nouveaux
ci-dessous sont proposés ; les tests existants sont conservés.

### L0 — Contrat GitLab et preuve de concurrence (bloquant pour l'écriture)

**Livrables :** petit client/banc isolé dans `test/gitlab/`, fixtures synthétiques,
rapport de protocole dans `docs/dev/gitlab.md` (versions serveur testées,
requêtes, réponses, garanties et limites). Pas de branchement à l'éditeur.

- Projet/branche de test dédié, deux identités et deux clients indépendants.
- Vérifier création exclusive, update/delete/move avec garde périmée, commit
  multi-actions refusé en totalité si une garde est fausse.
- Vérifier acquisition, battement, reprise et publication sous bail atomique.
- Provoquer réponse perdue, changement extérieur, création concurrente,
  suppression/recréation de fichier et garde devenue invalide après réécriture
  d'historique ; ne pas présumer que toutes les versions GitLab réagissent pareil.
- Mesurer 1 puis plusieurs sessions pendant une durée représentative : commits,
  requêtes, latences, 429, pipelines et croissance du dépôt.

**Sortie :** preuve exploitable et arbitrage écrit sur les verrous/coût. Si échec,
les lots de lecture restent possibles mais L4/L5 ne sont pas activés.

### L1 — Extraction minimale avec Nextcloud seul

**Fichiers :** `src/main/distant/{miroir,sessions,transactions}.ts`,
`src/main/verrous/types.ts`, `src/main/index.ts` ; nouveaux contrats et fabrique
sous `src/main/distant/`.

- Ajouter interfaces de lecture/publication/coordination et erreurs communes.
- Injecter les providers ; sortir les scans/orphelins DAV des sessions communes.
- Conserver initialement les classes/adaptateurs WebDAV pour éviter un renommage
  massif simultané ; faire disparaître progressivement les imports DAV du cœur.
- Séparer les plans métier des exécutions réseau, en commençant par créer/importer
  et supprimer un entretien, puis les corrections multi-fichiers.
- Caractériser fermeture, résultat incertain, copie sale et reprise avant extraction.

**Sortie :** mêmes scénarios Nextcloud A/B et mêmes erreurs fonctionnelles ; pas
encore de bouton GitLab. Toute différence de comportement est explicitée et testée.

### L2 — Types, coffre et client GitLab de lecture

**Fichiers :** `src/shared/distant.ts`, `src/shared/format.ts`,
`src/main/distant/coffre.ts`, nouveaux `src/main/gitlab/{client,types}.ts`.

- Migration du coffre, identité de destination et renouvellement du PAT.
- Client injectant le transport pour les tests : URL, headers, délais,
  pagination complète, annulation, erreurs et limites de débit.
- Découverte utilisateur/projet/branche, accès raw, lectures versionnées.
- Tests sous-chemin d'instance, branche autre que `main`, racine et sous-dossier.

**Sortie :** anciens comptes Nextcloud intacts ; aucun secret observable dans les
retours publics ; deux destinations proches restent isolées.

### L3 — Ouverture GitLab en consultation de bout en bout

**Fichiers :** adaptateur GitLab et miroir, fabrique de contexte,
`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/env.d.ts`,
`CorpusDistant.vue`, `useDistantCorpus.ts`, parcours des récents.

- Sélecteur de fournisseur, connexion PAT avancée, destination explicite.
- Tirage figé sur SHA et incrémental ; compte lecteur sans aucun commit caché.
- Gardes main de lecture seule, état réseau distinct des permissions.
- Docs cadre/médias locaux au minimum ; statut clair pour capacités différées.
- Bascule local ↔ Nextcloud ↔ GitLab et oubli de compte non destructif.

**Sortie :** deux postes consultent/actualisent le même corpus, y compris après
modification extérieure ; aucun fichier local récupérable n'est écrasé.
Cette étape est une préversion de consultation, pas « le support GitLab terminé ».

### L4 — Verrous et sessions d'édition

**Dépendances :** L0 accepté, L1–L3 validés.

**Fichiers :** nouveau provider/coordination GitLab, publications GitLab,
`SessionsDEntretien`, états publics et UI de reprise/divergence.

- Implémenter le protocole validé, la publication sous bail et son journal.
- Préserver autosauvegarde locale, publication périodique/manuelle, révisions
  monotones, fermeture et rétrogradation.
- Reprise après crash avant pull destructeur ; bail repris par un tiers,
  session devenue périmée, perte réseau et jeton expiré.

**Sortie :** un seul éditeur sur un entretien, deux entretiens éditables en
parallèle, aucune publication d'un ancien propriétaire, aucune perte silencieuse.

### L5 — Transactions et création de corpus

**Fichiers :** `TransactionsCorpus`, exécuteur de plans GitLab,
`src/main/distant/publication.ts` ou son adaptateur, `NouveauCorpusDistant.vue`.

- Création du squelette partagé dans une destination libre, sans `MKCOL` factice
  ni dossiers vides artificiels ; compte mémorisé après publication confirmée.
- Prévoir le projet sans commit : création explicite de la première branche si
  permise, sinon message guidé ; jamais un défaut de branche assimilé à une racine vide.
- Commits atomiques d'ajout/import/suppression et corrections liées ; traiter
  lots EAV/anonymisation, liens de personnes, références de passages et migrations.
- Vérifier tous les handlers qui choisissent aujourd'hui `transactions` : aucun
  chemin de mutation ne doit retomber sur un store local sans garde distante.
- Limites de taille/actions, absence de changement, refus droits et réconciliation
  d'un commit confirmé malgré perte de réponse.

**Sortie :** parité avec les mutations distantes actuellement supportées, sans
membership partiel ; deux créations concurrentes ne s'écrasent pas.

### L6 — Médias, Docs cadre et finitions d'interface

**Fichiers :** `src/main/docsCadreDistant.ts`, `src/shared/media.ts`,
`src/shared/format.ts`, `DesignationAudioDistante.vue`, `LecteurAudio.vue`,
`DocsCadre.vue`, `useDocsCadre.ts`, preload et main.

- Libellés pilotés par fournisseur/capacités, pas une multiplication de branches
  `if GitLab` dans l'éditeur.
- Désignation et rapatriement sélectif GitLab, pointeurs LFS, progression,
  récupération après média inaccessible, navigation et liens web sans secrets.
- Maintenir les seuils d'aperçu Docs cadre et les refus de mutation distante.
- Présence indisponible explicitement, badges de verrou conservés ; upload média
  désactivé et expliqué côté renderer **et** main.

**Sortie :** un corpus texte reste utilisable sans audio ; documents et médias
ne provoquent ni chargement mémoire non borné ni fuite de jeton.

### L7 — OAuth PKCE et permissions utilisateur

**Fichiers :** nouveau `src/main/gitlab/oauth.ts`, coffre, formulaires,
tests dédiés aux callbacks et au renouvellement.

- Reprendre le parcours V1, pas son transport TLS ni ses logs.
- Enregistrement de l'application OAuth et aide par instance ; entrée PAT
  conservée comme option avancée si souhaitée.
- Réauthentification sans perdre la session locale, refus de droits et lecture seule.
- Décider/documenter le sort de `restrictionAjoutSuppr` avant migration des équipes V1.

**Sortie :** utilisateur non technicien connecté via navigateur ; tests de state
invalide, callback répété, expiration, rotation, port occupé et annulation ; aucun
jeton persisté en clair si le trousseau OS est indisponible.

### L8 — Migration V1, validation finale et documentation

**Livrables :** import explicite GitLab V1, fixtures de migration,
`docs/user/corpus-gitlab.md`, mise à jour des cartes d'architecture/ouverture,
aide OAuth, limites média/historique et procédure d'exploitation du banc.

- Import `.crp`/`.sonal` figé sur un commit ; bilan et destination séparée.
- Banc end-to-end deux postes et essais sur l'instance institutionnelle cible.
- Vérification application empaquetée : OAuth, liens externes, absence de
  dépendance au binaire Git, lecture médias et reprise après redémarrage.
- Synthèse des fonctionnalités livrées/reportées et compatibilités serveur réelles.

**Sortie :** les équipes V1 disposent d'un chemin de migration vérifié ; le
support GitLab n'est déclaré général qu'après critères transverses ci-dessous.

**Ordre conseillé :** L0 et la caractérisation Nextcloud d'abord ; L1 → L2 → L3 ;
puis L4 → L5. L6/L7 peuvent être préparés après L3, sans multiplier les writers
sur les mêmes contrats. L8 vient après stabilisation du format et des publications.

## 9. Stratégie de tests et définition de terminé

### Bancs

1. **Unitaires purs** : identités, chemins, types/capacités, coffre, plans métier,
   erreurs, manifeste, calcul des versions, classification des résultats incertains.
2. **Faux serveur GitLab HTTP** : pagination, erreurs, délais, réponse perdue,
   mutations concurrentes déterministes. Ne pas fabriquer une fausse garantie
   de CAS que le vrai serveur n'a pas.
3. **Contrat GitLab réel** : projet jetable dédié, deux comptes, version serveur
   enregistrée. Tests réseau opt-in, secrets via environnement/trousseau, sortie
   expurgée. Pas de test d'écriture dans le dépôt source de Sonal ni dans un corpus
   utilisateur. Nettoyage uniquement des ressources de test identifiées.
4. **Non-régression Nextcloud** : conserver les bancs mémoire et les deux piles
   existantes A/B. Utiliser seulement `npm run nc:up` et `npm run nc-b:up` si besoin ;
   **aucun pull d'image, re-provisioning, nettoyage de volumes ou serveur recréé**.
   L'absence d'un serveur entraîne un skip déclaré, pas une validation réelle.
5. **E2E Electron deux profils** : décliner les scénarios de
   `e2e/multi-utilisateur.e2e.ts`, `audio-distant.e2e.ts` et `docs-cadre.e2e.ts`.

### Matrice minimale de recette

| Scénario | Attendu |
|---|---|
| A et B acquièrent le même entretien | Un seul éditeur ; l'autre consulte avec un refus explicite. |
| A et B publient deux entretiens différents | Les deux publications aboutissent sans conflit métier artificiel de tête de branche. |
| Un fichier est modifié dans l'UI GitLab pendant une session | Publication ancienne refusée ; copie locale conservée ; pas de merge textuel automatique. |
| Bail repris, ancien poste revenant après veille | Aucun write/delete avec l'ancienne garde ne réussit. |
| Une action d'un commit multi-fichiers est invalide | Aucune autre action visible, miroir métier non confirmé. |
| Réponse perdue après commit accepté | Opération reconnue sans doublon et sans rollback d'une publication réelle. |
| Import/suppression simultanés et modifications de définitions | Membership cohérent, sources préservées, pas d'écrasement. |
| Crash avant/après commit et avant/après libération | Reprise déterministe, copie sale protégée avant tirage, journal conservé si incertain. |
| Fermeture ou changement de corpus avec publication bloquée | Refus de bascule, état de travail récupérable. |
| Jeton expiré/révoqué, rôle changé, branche protégée | Message distinct du hors-ligne ; aucune mutation permise par la seule UI. |
| Pagination interrompue, 429, 5xx ou fichier inaccessible | Aucun faux diagnostic de suppression ; backoff borné et UI réactive. |
| Branche avec `/`, sous-groupe, accents, sous-chemin d'instance | Adressage exact ; aucune sortie de racine ni collision de miroir. |
| Force-push/reset, fichier supprimé puis recréé | Suspension/revalidation explicite, jamais écrasement avec une garde obsolète acceptée aveuglément. |
| JSON de format inconnu, symlink, fichier trop gros | Refus contrôlé ; pas d'amorçage/migration cachée. |
| Deux corpus de branches/racines/comptes différents | Isolation des miroirs, secrets, sessions, événements et récents. |
| Migration coffre et réouverture Nextcloud | Identités et secrets existants conservés ; aucun détour par ouverture locale. |
| Média LFS/absent/volumineux et Docs cadre mal formés | Lecture texte intacte, téléchargements bornés, erreurs compréhensibles. |
| Import V1 avec anonymisation et audio local introuvable | Bilan vérifiable, sources inchangées, aucune perte silencieuse. |

Commandes existantes à utiliser au fil des lots :

```sh
npm run typecheck
npm test -- test/webdav
npm test -- test/transitionContexte.test.ts test/fermetureApplication.test.ts test/distantRenderer.test.ts
npm test -- test/docsCadreDistant.test.ts test/notesCorpusDistant.test.ts
npm test
npm run build
npm run test:multiuser
```

Ajouter les tests `test/gitlab/` aux commandes/CI locales sans rendre les accès
réels obligatoires pour la suite hors réseau. Documenter les variables du banc,
les skips, versions testées et résultats distincts des mocks.

### Définition de terminé

- [ ] Le protocole de concurrence réel et son coût sont validés, pas seulement simulés.
- [ ] Aucun chemin d'écriture GitLab sans garde ; aucun résultat incertain effacé.
- [ ] Sessions, transactions et reprise conservent les invariants V2.
- [ ] Nextcloud A/B et corpus locaux n'ont pas régressé.
- [ ] Comptes existants migrés sans perte de secrets/récents/copies récupérables.
- [ ] Création, consultation, édition, fermeture et réouverture testées à deux postes.
- [ ] Périmètre média et présence clairement affiché ; aucun faux support LFS.
- [ ] OAuth sécurisé et parcours empaqueté testés sur les systèmes supportés.
- [ ] Migration V1 explicitement validée, ou annoncée comme lot restant sans promettre sa disponibilité.
- [ ] Politique de confidentialité/historique approuvée pour l'usage visé.

## 10. Arbitrages à obtenir avant de développer au-delà du prototype

1. **Instances cibles** : huma-num uniquement ou GitLab auto-hébergés variés et
   gitlab.com ? Quelles versions, politique OAuth, quotas et certificats ?
2. **Historique sensible** : les corpus envisagés peuvent-ils légalement et
   pratiquement conserver les versions antérieures des transcriptions ?
3. **Collaboration** : conserver un verrou exclusif comme Nextcloud est la
   proposition ; le coût des commits de bail est-il acceptable sur le banc ?
4. **Médias** : fichiers locaux suffisants au départ, médias déjà présents/LFS,
   ou téléversement partagé indispensable dès la première livraison ?
5. **Parité V1** : OAuth navigateur avant diffusion générale et import des anciens
   corpus proposés ; la restriction ajout/retrait est-elle utilisée et obligatoire ?
6. **Échelle** : nombres d'entretiens/postes, taille maximale d'un JSON, fréquence
   des lots et volume média ; fixer les seuils d'acceptation de charge à L0.

Le premier travail concret recommandé est donc **L0 accompagné de tests de
caractérisation V2**, et non la copie du module GitLab V1 ni l'ajout immédiat du
formulaire. Il permet de sécuriser le seul point où la généralisation Nextcloud
ne peut pas reposer sur une simple interface : la publication concurrente fiable.

## Références

### Projet

- [Architecture multi-utilisateur](../../docs/dev/multi-utilisateur.md).
- [Ouverture et récents](../../docs/dev/ouverture-corpus.md).
- [Guide corpus distant](../../docs/user/corpus-distant.md).
- [Migration locale V1](../../docs/user/migration-v1.md).
- [Finitions des divergences](plan-multiuser-finition.md).

### GitLab — garanties à confronter aux versions cibles

- [Commits API](https://docs.gitlab.com/api/commits/) : actions groupées,
  `last_commit_id`, `start_sha`, `force`.
- [Repository Files API](https://docs.gitlab.com/api/repository_files/) : versions,
  accès raw/LFS, erreurs et gardes.
- [Repositories API](https://docs.gitlab.com/api/repositories/) : arbres paginés,
  blobs, instantanés et comparaison.
- [Branches API](https://docs.gitlab.com/api/branches/) : branche par défaut,
  protection et droits de push.
- [Scopes des jetons](https://docs.gitlab.com/security/tokens/access_token_scopes/).
- [OAuth 2.0](https://docs.gitlab.com/api/oauth2/).
- [Limites de débit](https://docs.gitlab.com/rate_limits/non_configurable/).
- [Pipelines et skip CI](https://docs.gitlab.com/ci/pipelines/).
