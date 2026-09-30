# GitLab — qualification et état du chantier

**État : préversion d'édition d'entretien GitLab exposée ; gardes REST, LFS Locks,
bail versionné, reprise locale et transferts LFS streamés qualifiés sur le banc Docker.**
**La CI et le quota LFS institutionnels restent à qualifier.**

Le [plan directeur](../../plans/encours/plan-gitlab3.md) fixe la cible : miroir
commun, édition exclusive, publications conditionnelles, médias selon les
capacités du projet, sans serveur Sonal ni clone Git.
Ce document consigne les preuves obtenues et les questions restantes. Une
lecture de code, un test simulé et un essai serveur ne sont pas interchangeables.

## 1. Sources et méthode

### V1

Dépôt confirmé par le responsable : `/home/belignem/Vscode/SonalPi`.
Le checkout de travail reste `webdav` (`f5625df`) ; il n'a pas été modifié.
Les sources ont été lues à des références Git déjà présentes localement, sans
fetch, checkout ni exécution de la V1.

| Référence | Commit | Utilisation dans l'étude |
|---|---|---|
| `origin/main` local | `d54db6e931f179e2b727cb199140596e0ff41597` | Client GitLab, OAuth et ouverture, `package.json` annonce 1.0.79. |
| Tag `v1.0.78` | `3238df9e4150a7dcc76b356feeef06c9ba853a7d` | Comparaison avec une référence taguée. |
| Checkout `webdav` | `f5625df` | Esquisse de généralisation, pas assimilée à la version distribuée. |

`modules/gitlab_api.js`, `modules/gitlab_oauth.js` et `main.js` sont identiques
entre les deux premières références. Les modules renderer de gestion de corpus
et d'entretiens diffèrent. Le `package.json` du tag `v1.0.78` annonce encore
1.0.77 : identifier une preuve par commit et fichier, pas seulement par le nom
d'une version. La version exacte utilisée par chaque équipe reste à relever.

**Retour utilisateur acquis : la V1 GitLab a été utilisée et fonctionne.**
Ce retour valide son intérêt pratique et fournit des parcours à reprendre.
Il ne faut pas le remplacer par une conclusion d'échec tirée d'une absence de
tests automatisés. Les scénarios de concurrence et médias précisés ci-dessous
restent toutefois à qualifier pour la V2.

### V2

Base initialement inspectée : `c99ba4f7667b5108c8eef915d2889768894e0b2c`.
Les premières itérations ont utilisé des transports injectés en mémoire et des
fichiers temporaires. Le banc Docker préexistant est désormais démarré avec des
projets synthétiques séparés ; aucune dépendance n'a été installée et aucun ancien
projet, volume, conteneur ou fichier de qualification n'a été supprimé.

## 2. Acquis V1 et différences à traiter

Les repères de lignes ci-dessous concernent `origin/main` au commit indiqué.

| Sujet | Preuve inspectée | Conclusion pour la V2 |
|---|---|---|
| Connexion navigateur | `modules/gitlab_oauth.js:47–159`, PKCE S256, state et loopback sur 7474. | Parcours déjà construit, à reprendre et sécuriser ; inutile de réinventer l'expérience utilisateur. |
| Tokens | `refreshToken`, `saveToken`, `loadToken` dans le même module. | Renouvellement et coffre font partie des usages ; vérifier rotation et appels concurrents dans la V2. |
| Lecture distante | `gitlab_api.js::lireFichier`, `_listerRecursif`. | Repository Files, arbre récursif paginé ; la V2 doit fixer un commit pour la cohérence de lecture. |
| Publication | `ecrireFichier`, `_flushWriteQueue` (`:205–295`). | Écritures regroupées sur 150 ms, endpoint fichier ou commit multi-actions. Bon retour d'expérience sur le regroupement. |
| Gardes de version | Corps des requêtes update/delete/multi-actions. | Pas de `last_commit_id` dans les mutations inspectées ; le batching ne démontre pas une protection entre postes. |
| Exclusion | `verrouillerFichier` (`:454–498`), `deverrouillerFichier`, `verifierVerrou`. | LFS Locks déjà intégrés ; qualification ciblée de ce mécanisme avant décision V2. |
| Même compte sur deux postes | Un 409 est accepté en édition si le nom du propriétaire correspond au compte courant. | La V2 doit distinguer utilisateur, poste et session ; ne pas reprendre cette réouverture implicite. |
| Renouvellement | `rafraichirVerrou` (`:575`) est un no-op. | Les LFS Locks sont persistants ; le cycle de bail V2 n'est pas déjà démontré par la V1. |
| LFS indisponible | 403/404 d'acquisition deviennent `readOnly: true, lfsUnavailable: true`. | LFS conditionne l'édition V1, pas seulement les médias. 403 ne suffit pas à conclure que LFS est désactivé. |
| Lecture d'objets LFS | `_downloadLfsObject` (`:621–654`), opération batch `download`. | Une vraie lecture LFS existe ; elle est orientée texte, pas un transfert média binaire borné. |
| Téléchargement média | `_downloadFromUrl` accumule les chunks puis convertit en UTF-8 (`:660–704`). | Ce chemin ne peut pas être porté comme lecteur de gros audio/vidéo ; pipeline binaire séparé nécessaire. |
| Upload LFS | `initialiserGitattributes`, `_migrerSonalVersLFS`. | Les mutations inspectées réécrivent du texte via REST ; pas de batch upload d'objet dans ce client. La règle `.gitattributes` seule ne prouve pas l'upload LFS. |
| Ouverture | `main.js::ouvrirCorpusGitLab` (`:1995`), initialisation de `.gitattributes` et création du `.crp` absent. | La consultation V2 doit au contraire être sans mutation implicite, avec création séparée. |
| Branche | Client par défaut sur `main`, ouverture sans autre argument, URL web avec `main`. | Choisir et mémoriser explicitement la branche dans la V2. |

### Transport et confidentialité à ne pas recopier

Les clients inspectés comportent `rejectUnauthorized: false`. Le callback OAuth
journalise `req.url`, susceptible de contenir le code d'autorisation. Le lecteur
LFS journalise l'URL de téléchargement et ajoute l'authentification du compte
quand les actions reçues n'en fournissent pas, y compris après redirection.

Ce sont des points précis à remplacer : TLS validé, diagnostics expurgés,
contrôle des origines et pas de propagation automatique des credentials GitLab.
Ils ne remettent pas en cause les parcours fonctionnels déjà utilisés.

### Conséquence du choix « corpus éditable sans LFS média »

On ne peut pas recopier le verrouillage V1 et simplement désactiver le bouton
audio lorsque LFS est absent : ce client refuse alors aussi l'édition.

Séparer au minimum les capacités publiques suivantes :

- consultation du corpus ;
- édition exclusive qualifiée ;
- lecture des médias partagés ;
- téléversement des médias ;
- résultat de détection connu ou indéterminé.

**Décision de protocole encore ouverte :** établir si une coordination indépendante
du LFS média est nécessaire et acceptable, par exemple les baux versionnés du
plan. L'absence de serveur GitLab de test empêche de trancher les gardes et le coût.
Le fait qu'un projet annonce LFS activé ne prouve pas non plus que toutes les API
de verrouillage/transfert fonctionnent avec le compte concerné.

## 3. Ce qui est caractérisé côté V2

### Socle existant rejoué

| Comportement | Tests principaux |
|---|---|
| Acquisition, refus, lecture fraîche, publication conditionnelle | `test/webdav/session.test.ts`, `verrous.test.ts`, `verrousFilesLock.test.ts`. |
| Révision modifiée pendant publication, réponse perdue reconnue | `test/webdav/session.test.ts`. |
| Publication avant libération, fermeture bloquée, copies de divergence | `test/webdav/session.test.ts`, `test/fermetureApplication.test.ts`. |
| Transactions, mutations liées et retours d'échec | `test/webdav/transactions.test.ts`. |
| Tirage incrémental, audio désigné, transferts, comptes | `test/webdav/webdav.test.ts`. |
| Création distante et présence | `test/webdav/publication.test.ts`, `presence.test.ts`. |
| Bascule préparée et refus sans mutation de la cible | `test/transitionContexte.test.ts`. |
| Renderer, documents cadre et refus des notes distantes | `test/distantRenderer.test.ts`, `docsCadreDistant.test.ts`, `notesCorpusDistant.test.ts`. |

Ces scénarios couvrent les comportements simulés, pas le contrat réel des
instances Nextcloud A/B ni celui de GitLab.

### Tests ajoutés

`test/webdav/miroir-contrat.test.ts` ajoute sept scénarios :

- tirage sans publication ni acquisition de verrou ;
- exclusion préservant le contenu **et** sa version, avec actualisation des autres fichiers ;
- exclusion dès le premier tirage, sans inventer de version locale ;
- disparition distante d'un fichier exclu, puis archivage quand l'exclusion est levée ;
- inventaire 403 ou 503 sans fausse suppression ni modification du manifeste ;
- reconstruction d'un miroir avec exclusions explicites et fichiers de récupération préservés.

Le dernier test ne prétend pas couvrir le démarrage Electron : **l'appelant
fournit les exclusions**. Leur découverte automatique après crash reste un autre
problème, décrit ci-dessous.

`test/distantRenderer.test.ts` ajoute quatre scénarios :

- échec de tirage silencieux suspendant un entretien sans oublier sa session ;
- même protection après un tirage manuel, avec propagation de l'erreur ;
- retour du réseau ne réactivant pas une session déjà dégradée ;
- échec de la copie de récupération signalé sans réactiver l'éditeur.

`test/webdav/contexte.test.ts` couvre la première façade de contexte : assemblage
complet sans démarrage anticipé de la présence, fermeture du cycle de vie et
protection d'une copie journalisée pendant l'ouverture complète.

Le registre du contexte courant porte maintenant une génération à chaque
bascule. Les commandes distantes d'actualisation, navigation, désignation,
téléversement, publication, reprise et présence capturent cette génération ;
leur réponse, leur erreur et leurs événements de progression sont ignorés si
un autre contexte a été installé entre-temps. La même garde couvre désormais
l'ouverture et la fermeture des sessions d'édition, les mutations de définitions,
les principales transactions d'entretiens et de personnes, ainsi que les attentes
des documents cadre. Les dialogues locaux conservent aussi le dossier capturé
et refusent leur résultat si un autre corpus a été installé pendant l'attente.
Quatre tests couvrent une réponse retardée, une erreur retardée, la réinstallation
du même objet et deux générations successives de corpus locaux. La façade porte
les intentions de session et de définitions correspondantes.

`test/webdav/lecture.test.ts` vérifie le premier contrat de lecture distante :
l'adaptateur WebDAV expose des empreintes qui ne sont pas des gardes d'écriture,
les binaires sont téléchargés en flux, et le miroir utilise bien le lecteur
injecté plutôt que son client WebDAV pour les lectures.

`src/main/gitlab/client.ts` et `lecture.ts` portent le second adaptateur. Chaque
tirage résout la branche une fois vers un commit, puis pagination, inventaires
et lectures de texte emploient uniquement ce SHA. Le client garde le jeton dans
le main, interdit les redirections, borne délai et taille des réponses, relaie
l'annulation et limite les reprises après 429. Dix tests sans serveur couvrent
branche avec `/`, pagination, racine de corpus, empreintes de blob, lecture
brute à SHA fixé, chemins ambigus, symlinks, sous-modules, refus HTTP expurgé,
429, réponse volumineuse et annulation.

`MiroirDistant` ne construit plus de client WebDAV. `MiroirWebDAV` assemble les
ports existants dans un adaptateur séparé, tandis que le premier contexte GitLab
injecte un nouveau lecteur figé à chaque tirage. Un test d'intégration ouvre un
corpus sous une racine du dépôt, vérifie la consultation seule, avance la branche,
puis confirme que le tirage suivant reste cohérent sur le nouveau SHA. Toutes
les requêtes observées sont des GET.

Le coffre v3 distingue maintenant les comptes GitLab, qui portent l'instance et
le jeton chiffré, des destinations, qui portent projet, branche et racine. La
migration v2 ajoute le discriminant WebDAV sans changer les identifiants ni les
récents existants. Trois tests couvrent la séparation compte/destinations, le
renouvellement du jeton sans nouveau miroir et la migration WebDAV compatible.

Les modales de création et d'ouverture distantes proposent deux onglets,
Nextcloud et GitLab. La création GitLab produit un squelette dans un projet
existant, puis l'ouvre comme une destination normale ; aucun projet GitLab ni
dossier distant n'est créé implicitement. L'ouverture permet de retrouver les
comptes et destinations déjà configurés. Le formulaire demande l'adresse du
projet et, lors de la première configuration d'une instance, son Client ID
OAuth public. Une seule action enchaîne la détection de l'instance, la connexion
dans le navigateur, la vérification du projet et son ouverture ou la création
du corpus. La racine facultative reste rangée dans les options avancées. Un
guide intégré reprend la préparation du projet et de l'application OAuth, sans
configuration LFS. L'exploration de la liste des projets n'est pas exposée. Les
deux formulaires utilisent `useProjetGitLab` et un seul appel IPC
`gitlab:preparerProjet`. Le main lit le projet et l'utilisateur, puis retourne
la branche par défaut annoncée par GitLab. Aucune liste de branches n'est chargée
et aucun sélecteur n'est affiché. Un dépôt sans branche par défaut est refusé avec
une invitation à l'initialiser ; aucune branche `main` n'est supposée.
Ces lectures n'envoient que des requêtes GET. Les destinations déjà enregistrées
conservent leur branche mémorisée. L'ouverture
prépare entièrement le miroir avant la bascule, n'enregistre la destination
qu'après une lecture réussie, puis active l'édition des entretiens sous bail.
Les opérations de corpus, Docs cadre et médias partagés restent indisponibles
dans cette tranche.

`e2e/gitlab-consultation.e2e.ts` joue ce parcours sur le banc réel avec deux
comptes et deux profils Electron isolés. Chacun découvre son projet, consulte le
corps en édition contrôlée, publie une modification, actualise, revient au corpus
local puis rouvre GitLab. Un profil est relancé et rouvre son récent GitLab en
rejouant OAuth lorsque le coffre système est indisponible. Un autre parcours tue
le processus après une autosave non publiée, puis vérifie que le candidat reste
visible et en lecture seule tant que le bail ancien est actif. Les deux miroirs
restent distincts. Un projet inaccessible est refusé sans créer de miroir. Le
projet de référence dont LFS est désactivé reste ouvrable pour consulter ses
transcriptions. La fixture est amorcée dans une racine synthétique unique avant
le lancement ; elle est ensuite conservée pour examen. Les six scénarios
réussissent aussi dans le binaire Linux produit par `electron-builder --dir`.

`gitlab/bailGitLab.ts` introduit un droit d'édition opaque, propre au main et à
une génération. Le fichier de bail vit sous `.sonal/verrous/`, porte un chemin
haché et ne peut pas être fourni directement par un plan de publication. Il
enregistre l'identité de session, une génération, une échéance et un compteur.
L'acquisition, la reprise, le renouvellement et la libération restent sérialisés
par ce port. `gitlab/publication.ts` compile au plus 250 actions, refuse les
chemins de bail, les doublons et les gardes mal formées, puis ajoute au même
commit la mutation conditionnelle du bail. Une réponse réseau perdue suspend le
droit et interdit tout rejeu automatique.

Le client REST écrit désormais avec une requête JSON bornée, un délai, une
annulation, l'interdiction des redirections et aucun retry, y compris sur 429.
Les refus et réponses serveur sont expurgés. Huit tests en mémoire couvrent
l'exclusion du même compte sur deux postes, la reprise à horloge décalée, la
sérialisation, le conflit de garde, l'ancienne génération, la réponse perdue et
la limite 429. Un essai GitLab réel confirme qu'une reprise à horloge décalée
refuse atomiquement l'ancienne génération, que la génération courante publie et
que sa libération conditionnelle réussit.

`gitlab/journalPublication.ts` sépare désormais les métadonnées de l'opération et
son candidat opaque. Le journal est stocké sous le `userData`, par destination,
dans `operations-gitlab/<destinationId>/`. Les actions sensibles ne sont pas dans
le JSON lisible : elles sont dans un fichier candidat temporaire séparé, protégé
en `0600`, avec empreinte et taille dans les métadonnées. Une opération confirmée
ou refusée est supprimée ; une opération indéterminée reste disponible pour une
recherche de commit au redémarrage. Une recherche ne rejoue rien : elle vérifie le
contenu au commit trouvé. Cinq tests de journal et deux tests d'intégration
publisher-journal couvrent le stockage, la corruption, l'absence, la confirmation
et la conservation après perte de réponse. `gitlab/session.ts` orchestre ensuite
ouverture, lecture fraîche, révisions locales, publication, renouvellement,
fermeture et réconciliation des opérations pending. `assemblageSession.ts` relie
ces ports à un stockage local atomique et distingue le chemin local de la racine
GitLab, tandis que le renderer ne voit pas les détails du bail. Huit tests de session, deux
tests de stockage local, un test d'assemblage et trois tests de façade couvrent
le cycle normal, le refus d'un second poste, la reprise, l'expiration, la réponse
perdue, l'absence de rejeu, la reconstruction sur disque après un redémarrage
simulé, la reprise d'une autosave non publiée, la protection du tirage et le refus
de fermer un contexte bloqué. Une copie locale et sa base distante sont
désormais journalisées avant toute publication ; au redémarrage, le tirage exclut
cette copie et la session ne reprend qu'après l'expiration du bail. Le main
construit cette factory, rejoue ses intentions de session et réconcilie les
opérations confirmées avant d'ouvrir une destination. L'ouverture de l'entretien
passe par le même contrat que Nextcloud, mais les opérations de corpus et les
médias partagés restent désactivés tant que leurs plans GitLab ne sont pas
qualifiés.

`test/webdav/coordination.test.ts` vérifie que les badges de verrous coopératifs
sont observés par un port de coordination séparé. Le miroir n'inventorie plus
`verrous/` et ne donne donc aucune sémantique d'exclusion aux empreintes de contenu.

Deux tests supplémentaires de `miroir-contrat.test.ts` couvrent la migration du
manifeste WebDAV v1 vers le format discriminé v2 sans retéléchargement, ainsi que
le refus d'un manifeste appartenant à une autre destination sans toucher au miroir.

`test/webdav/installation-miroir.test.ts` vérifie la reprise d'un journal après
une interruption entre deux remplacements et le refus d'un journal appartenant
à une autre destination. Le miroir prépare désormais tous les JSON et médias
accessibles avant installation, puis ne publie le nouveau manifeste qu'après
les remplacements et archivages. Un échec pendant la préparation ne modifie
aucun fichier visible ; un arrêt pendant l'installation conserve les candidats
et reprend les actions de manière idempotente au tirage suivant.

La vue métier préparée est maintenant validée avant le premier remplacement :
JSON objets, versions supportées, structure minimale du corpus et des entretiens,
chemins sans collision de casse et cohérence du membership. Un entretien sous
session reste exclu de cette validation, comme de son remplacement. Quatre tests
vérifient les refus d'un JSON invalide, d'un membership incomplet, d'une version
inconnue ou de chemins incompatibles, sans altérer ni amorcer le miroir.

`distant/transfert.ts` sépare désormais les transferts binaires de la lecture
d'inventaire et de texte. `TransfertWebDAV` conserve le téléchargement streamé,
le téléversement streamé, la création des dossiers et le refus des collisions.
Le test du lecteur injecté vérifie aussi qu'un média passe par ce port sans
retomber sur le client WebDAV détenu par le miroir.

`test/webdav/session.test.ts` couvre aussi la copie séparée du dernier état reçu
du renderer après rétrogradation. Elle n'est jamais replacée dans le miroir
publiable et n'est acceptée que pour une session effectivement dégradée.
Deux scénarios de redémarrage vérifient ensuite que le premier tirage préserve
le fichier local : par le journal commun des acquisitions, et par l'observation
du verrou distant pour les anciennes sessions qui ne possèdent pas ce journal.

### Correction minimale issue de la caractérisation

Dans `useDistantCorpus.actualiserDistant`, l'erreur d'un tirage manuel était
relancée **avant** de passer `enLigne` à `false`. L'éditeur restait donc modifiable
alors que le même échec d'un tirage périodique le suspendait.

Le nouveau test manuel a reproduit ce défaut. Le changement déplace la mise à
jour de `enLigne` avant la relance : même suspension pour les deux parcours,
erreur toujours remontée, session et contenu non effacés.
La durée du droit est désormais bornée localement. Chaque acquisition et
renouvellement réussi fournit au gestionnaire de sessions une durée garantie.
Après des échecs réseau, l'édition est suspendue à son échéance ; une publication
manuelle arrivée avant le prochain battement applique la même garde. Trois tests
couvrent la tolérance avant échéance, le refus après échéance et le report de
l'échéance après renouvellement.

Lors d'une rétrogradation, le renderer fige maintenant l'éditeur, capture son
état courant avant toute attente, annule le debounce, puis transmet cette copie
à un canal de récupération dédié. Le main ne l'accepte que pour une session
dégradée et l'écrit parmi les divergences, sans réautoriser l'écriture du miroir
ni la publication. Une fermeture ultérieure effectue encore son annulation
ordinaire, sans créer une seconde autosauvegarde.

## 4. Écarts à traiter avant de généraliser le distant

**Constats de lecture du code courant, sauf mention du test ajouté.** Ils ne sont
pas validés comme des garanties acquises par les suites vertes.

| Priorité | Constat | Travail à prévoir |
|---|---|---|
| Traitée | Une exception de renouvellement pouvait conserver la session sans date limite locale. | Une échéance issue du provider suspend maintenant la session et bloque aussi la publication ; la reprise contrôlée reste à concevoir. |
| Haute | `publierInterne()` protège le JSON par son ETag, mais ne lie pas sa publication au fichier de verrou coopératif. | Tester la reprise entre deux battements ; distinguer garantie DAV native et coopérative, ne pas exporter cette hypothèse vers GitLab. |
| Traitée | Le handler `distant:ouvrir` tirait avant création des nouvelles sessions ; ses exclusions ne venaient que de sessions déjà actives. | Les acquisitions sont maintenant journalisées pour les deux variantes. L'ouverture relit ce journal et observe les orphelins distants avant le premier tirage. |
| Traitée | La rétrogradation copiait le fichier sur disque puis annulait le debounce renderer de 600 ms. | L'état courant du renderer est maintenant conservé dans une copie de récupération séparée, sans publication autorisée. |
| Traitée | `MiroirWebDAV.tirer()` installait les fichiers successivement et avançait le manifeste en cours de route. | La préparation, la validation de la vue métier et le journal d'installation précèdent désormais tout remplacement visible. |
| Moyenne | `televerserFichier()` vérifie le nom par inventaire puis envoie sans précondition de création. | Tester deux téléversements homonymes concurrents ; protéger l'envoi lui-même, pas seulement la liste préalable. |
| Moyenne | `distant:ouvrir` appelle migration et réconciliation de fichiers après tirage. | Distinguer consultation et mutations explicites avant une ouverture GitLab avec compte lecteur. |

Une suspension UI n'est pas une garantie serveur. De même, une copie locale
retrouvée dans un test de session ne prouve pas qu'un tirage d'ouverture ne
l'aura pas remplacée avant ce test. Ces frontières méritent leurs propres
régressions avant l'extraction des classes.

## 5. Frontières d'extraction repérées

### Contrats IPC des accès distants

Les contrats partagés sont séparés par responsabilité :

- `src/shared/distant.ts` : résultats d'ouverture, tirages, sessions et `ApiDistant` ;
- `src/shared/webdav.ts` : destinations, connexion et création WebDAV, `ApiWebDAV` ;
- `src/shared/gitlab.ts` : préparation de projet et destinations GitLab, `ApiGitLab`.

Le preload vérifie ses trois objets avec `satisfies` ; `env.d.ts` référence ces
mêmes interfaces au lieu de recopier les signatures. `sonal.webdav` configure et
ouvre les destinations WebDAV ; `sonal.gitlab` fait de même pour GitLab.
`sonal.distant` conserve les services du corpus courant, selon les capacités du
fournisseur, ainsi que la disponibilité du coffre sécurisé.

Le nom du corpus à créer est `nomCorpus` pour les deux fournisseurs ; `nomProjet`
désigne le projet GitLab. Les demandes peuvent transporter le secret saisi vers
le main, mais les destinations publiques retournées n'en contiennent jamais.
Ces changements ne modifient ni le format du coffre, ni les identifiants des
récents et miroirs. Les tests du pont sont dans `test/preloadDistant.test.ts`.
La préparation en lecture seule est testée dans `test/gitlab/preparationProjet.test.ts` ;
l'invalidation du formulaire et ses réponses tardives dans `test/projetGitLabRenderer.test.ts`.

### Services main

| Emplacement | Couplage actuel | Première couture envisagée |
|---|---|---|
| `distant/miroir.ts`, `distant/miroirWebDAV.ts`, `distant/installationMiroir.ts`, `distant/validationMiroir.ts` | Le miroir commun ne construit aucun transport ; l'adaptateur WebDAV conserve la compatibilité des sessions et transactions. | Stabiliser les ports de publication avant de généraliser le contexte éditable. |
| `distant/lecture.ts`, `lecteurWebDAV.ts`, `transfert.ts`, `transfertWebDAV.ts` | Les contrats de lecture et de transfert sont distincts, avec adaptateurs WebDAV sans publication. | Ajouter le transfert GitLab/LFS seulement après sa qualification dédiée. |
| `gitlab/client.ts`, `gitlab/lecture.ts`, `gitlab/contexte.ts`, `gitlab/preparationProjet.ts`, `gitlab/ouverture.ts` | Client borné en lecture et mutation sans retry, lecteur à SHA fixé, préparation du projet par URL, contexte GitLab et service d'ouverture. | Garder la préparation du formulaire indépendante des sessions et de la publication. |
| `gitlab/bailGitLab.ts`, `gitlab/publication.ts`, `gitlab/journalPublication.ts`, `gitlab/session.ts`, `gitlab/assemblageSession.ts` | Droit opaque, bail versionné, commit conditionnel, journal durable, cycle local d'une session et chemins local/distant explicites. | Tester la reprise après crash et la fermeture applicative complète. |
| `distant/coordination.ts`, `observationVerrousWebDAV.ts` | Observation des badges Nextcloud séparée du tirage de contenu. | Garder ce port d'observation distinct ; ne pas le confondre avec le bail GitLab. |
| `distant/sessions.ts` | Providers créés en interne, appels DAV et scans de verrous. | Coordination injectée avec publication sous droit détenu ; récupération locale séparée. |
| `distant/transactions.ts` | Providers, relectures et PUT mêlés aux mutations locales. | Préparer les opérations métier puis exécuter selon le connecteur, commande par commande. |
| `distant/publication.ts` | Création de dossiers et squelette WebDAV. | Création initiale spécifique, distincte du contrat général de publication. |
| `distant/coffre.ts`, `shared/distant.ts` | Coffre v3 discriminé ; comptes GitLab séparés des destinations, migration WebDAV compatible. | Étendre les capacités publiques sans exposer les versions ni secrets internes. |
| `docsCadreDistant.ts` | Lectures directes via client DAV. | Lecteur borné indépendant du fournisseur, sans aspirer les docs dans le miroir. |
| `main/index.ts` | Les principales commandes distantes, sessions, transactions et attentes de documents capturent leur génération ; quelques orchestrations spécialisées restent à inventorier. | Terminer l'inventaire résiduel sans déplacer les règles métier dans les handlers. |
| `distant/contexte.ts` | Façade et fabrique Nextcloud : assemblage cohérent, cycle de vie, sessions, définitions, actualisation, transferts, publication et reprise. | Garder ce cycle commun tout en extrayant les ports de lecture, publication et coordination. |

La première façade est maintenant introduite sans interface universelle de
stockage. Elle assemble les services Nextcloud existants, protège la bascule et
ignore le résultat d'un tirage terminé après remplacement du contexte. Les
contrats de lecture, de découverte et de publication GitLab sont extraits. Le
bail reste un connecteur spécialisé jusqu'à ce que son journal durable et son
intégration aux sessions existent.

L'orchestration d'ouverture GitLab vit désormais dans `gitlab/ouverture.ts` :
le service `ServiceOuvertureGitLab` porte les trois opérations explicites
(créer, enregistrer, ouvrir), la séquence commune des nouvelles destinations,
la réconciliation des journaux et la construction du résultat public sans
secret. Il reçoit le répertoire du profil, l'identité de session, le coffre et
deux effets explicites — fermer l'ancien contexte, installer le préparé.
Les handlers IPC de `main/index.ts` ne gardent que la file de transitions,
restée propriétaire unique de la sérialisation des bascules.
L'ordre et les échecs (préparation, coffre, fermeture, installation) sont
couverts par `test/gitlab/ouverture.test.ts`, avec les vrais journaux pour la
réconciliation et le premier tirage.

## 6. Qualification GitLab encore nécessaire

Un banc Docker préexistant a été retrouvé après la première étude. Docker est
accessible et les ressources visibles sont suffisantes ; l'image locale contient
GitLab CE 18.11.0-ce.0, avec volumes et données déjà initialisés. Le Compose a été
corrigé, l'image locale épinglée et le pull interdit. Un nouveau conteneur utilise
les volumes nommés ; l'ancien conteneur défectueux reste conservé.

Le banc est maintenant reproductible avec deux projets LFS activé/désactivé,
deux comptes et deux postes logiques. Les essais ci-dessous utilisent uniquement
des données synthétiques dédiées. Une qualification institutionnelle reste
nécessaire pour les droits, quotas, OAuth et certificats de la cible réelle.

| Question | Vérification ciblée | État |
|---|---|---|
| Gardes des actions | Create exclusif ; update/delete/move périmés ; action invalide refusant tout le commit. | Validés sur GitLab 18.11 : create exclusif, gardes `last_commit_id` périmées pour update/delete/move et atomicité d'un commit contenant une action invalide. |
| Locks V1 et REST | Commit sous verrou détenu par autrui, même compte sur deux postes, reprise puis ancien détenteur. | LFS Lock imposé aux commits REST d'un autre compte ; après reprise par `user2`, l'ancien `user1` est refusé. Deux jetons de `user1` restent toutefois le même détenteur : le second poste peut publier sous le verrou du premier. |
| Bail versionné candidat | Publication + mutation réelle du verrou, ancienne génération, renouvellement concurrent, réponse perdue, série longue. | Acquisition concurrente : un seul create réussit. Après reprise par une nouvelle génération du même compte, publication et mutation périmée de l'ancien sont refusées atomiquement ; la génération courante publie. Deux renouvellements concurrents donnent un succès et un refus. Deux campagnes de 480 renouvellements simulés à 60 s ont pris 182,3 s et 174,5 s, soit environ 380 et 363 ms par commit sur le banc local. La série est accélérée et ne mesure pas une pause réelle de 60 s. |
| Résultat indéterminé | Couper la réponse après acceptation, retrouver l'opération au bon commit et vérifier son contenu. | Un proxy local laisse GitLab répondre 201 puis détruit la connexion avant toute réponse au client. L'opération est retrouvée par son identifiant dans l'historique et son fichier est vérifié. |
| Dépendances métier | Source lue mais non écrite, transaction corpus face à une session longue. | Une action `chmod` sans changement de mode protège la source par `last_commit_id` sans transporter son contenu : fraîche, elle est acceptée ; périmée, elle refuse aussi la mutation de la cible. Le contenu, le mode et le `last_commit_id` de la source restent inchangés. |
| LFS média | Batch upload, objet, pointeur, association au projet et lecture binaire depuis le second compte sans push Git. | Parcours complet validé avec un binaire de 1 048 833 octets. Un objet de 32 MiB a ensuite été produit et relu en flux depuis un fichier, sans Keep-Alive mémoire proportionnel : envoi 286 ms, lecture 190 ms, pic de heap du banc 15,2 MiB puis 18,2 MiB, SHA-256 et taille vérifiés. Un upload de 8 MiB annulé après 524 288 octets a été repris avec le même OID puis relu intégralement. Le projet sans LFS refuse le batch. Le refus pour quota réel reste à qualifier. |
| Détection | Réglage projet actif/inactif, 403, timeout, lecteur sans droit d'envoi, revérification. | Deux projets réels exposent correctement `lfs_enabled=true/false` aux comptes de test ; erreurs et revérification restent à implémenter. |
| OAuth institutionnel | Configuration disponible, scopes REST/LFS, renouvellement et certificat. | Parcours V1 inspecté ; instance non testée. |
| Coût | Commits de coordination, CI, limites de débit, mémoire et disque des médias. | Les deux campagnes de 480 commits et le transfert LFS de 32 MiB sont mesurés. Le projet de banc ne contient ni `.gitlab-ci.yml` ni runner disponible : aucune CI réelle n'a été déclenchée, donc son coût et ses collisions restent inconnus. Les statistiques de stockage GitLab consultées après campagne sont restée en cache ; le comptage direct donnait 1 117 commits sur la branche principale. |

Aucun résultat fictif d'un faux serveur ne doit remplir la colonne des preuves
réelles. Aucun seuil de charge arbitraire ne remplace les volumes des équipes.

## 7. Résultats reproductibles de la première itération

### Qualification GitLab Docker

Le banc utilise GitLab CE 18.11.0, deux comptes, deux jetons distincts pour les
deux postes logiques de `user1`, et deux projets dédiés avec LFS actif/inactif.
Les secrets temporaires restent hors dépôt dans un fichier `0600`.

```sh
set -a
source /home/belignem/TestGitlabLocal/qualification.env
set +a
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:gitlab
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:gitlab:long
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:gitlab:e2e
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:gitlab:e2e:packaged
```

Résultat : **14 tests réguliers réussis**, plus une campagne longue volontairement
sautée par le script normal. Ils prouvent la création exclusive, l'atomicité d'un
commit multi-actions refusé, les gardes `last_commit_id` sur update/delete/move,
les capacités des deux projets, l'application des LFS Locks, le bail versionné,
le transfert LFS volumineux en flux, l'annulation/reprise, la réconciliation et
le coordinateur GitLab par bail versionné.
La limite importante est confirmée : GitLab identifie le propriétaire du verrou
par compte, pas par poste ou session. Deux postes partageant le même compte ne
sont donc pas exclus l'un de l'autre par ce mécanisme seul.

Le candidat de bail versionné distingue au contraire deux générations du même
compte. Deux acquisitions concurrentes produisent un seul gagnant ; une reprise
rend ensuite atomiquement impossible la publication de l'ancienne génération.
Deux renouvellements concurrents fondés sur la même garde donnent aussi un seul
gagnant. Deux séries accélérées de 480 renouvellements, chacune représentant
huit heures à un battement de 60 s sans attendre réellement ce délai, ont pris
182,3 s et 174,5 s. Cela correspond à environ 380 et 363 ms par commit sur cette
instance locale. Le banc ne possède ni configuration CI ni runner : la série ne
permet pas de conclure sur le coût d'une CI et cette interaction reste ouverte.
Un proxy local reproduit aussi un résultat indéterminé réel : GitLab accepte le
commit et produit sa réponse, puis la connexion est détruite avant que le client
ne reçoive le statut. L'identifiant d'opération permet de retrouver le bon commit
et d'en vérifier le contenu sans rejouer la mutation.

Pour une dépendance métier lue, GitLab accepte une action `chmod` qui renvoie le
mode déjà observé sous `last_commit_id`. Si cette source change avant le commit,
toute la publication est refusée ; son contenu n'est jamais inclus dans le corps
de publication. La qualification vérifie aussi qu'une garde fraîche ne change ni
le mode ni le `last_commit_id` de la source.

Le transfert LFS complet sans push Git est validé avec un binaire de
1 048 833 octets, puis avec un objet de 32 MiB produit et relu en flux sur disque.
Le second compte vérifie la taille et le SHA-256. Les pics de heap du processus de
qualification sont restés à environ 15,2 Mo pendant l'envoi et 18,2 Mo pendant la
lecture ; ce ne sont pas des mesures de la mémoire du serveur GitLab. Un envoi de
8 MiB annulé après environ 0,5 à 0,75 MiB a été recommencé avec le même OID,
puis relu intégralement. Le refus pour quota réel reste non testé : aucun quota LFS n'est
configuré sur le projet dédié, et la qualification ne modifie pas ses réglages
pour en fabriquer un. Les fichiers et verrous synthétiques sont conservés pour
examen ; aucun nettoyage automatique n'est effectué hors suppression explicitement
exercée par le scénario de garde delete.

### Tests exécutés

```sh
npm test -- \
  test/webdav/session.test.ts \
  test/webdav/transactions.test.ts \
  test/webdav/webdav.test.ts \
  test/webdav/verrous.test.ts \
  test/webdav/verrousFilesLock.test.ts \
  test/webdav/publication.test.ts \
  test/webdav/presence.test.ts \
  test/webdav/miroir-contrat.test.ts \
  test/webdav/installation-miroir.test.ts \
  test/webdav/contexte.test.ts \
  test/webdav/lecture.test.ts \
  test/webdav/coordination.test.ts \
  test/transitionContexte.test.ts \
  test/fermetureApplication.test.ts \
  test/couturesRenderer.test.ts \
  test/distantRenderer.test.ts \
  test/docsCadreDistant.test.ts \
  test/notesCorpusDistant.test.ts
```

- Avant modification : **222 tests réussis dans 12 fichiers**.
- Après ajout de dix cas et la première correction : **232 tests réussis dans 13 fichiers**.
- Après ajout des trois cas d'expiration du droit : **235 tests réussis dans 13 fichiers**.
- Après protection du debounce : **237 tests réussis dans ces 13 fichiers** ;
  **241 tests réussis dans 14 fichiers** avec `test/couturesRenderer.test.ts`.
- Après protection du premier tirage : **243 tests réussis dans 14 fichiers**.
- Après introduction de la façade et de sa couture d'ouverture : **245 tests
  réussis dans 15 fichiers**.
- Après injection du lecteur distant : **247 tests réussis dans 16 fichiers**.
- Après séparation de l'observation des verrous et manifeste v2 : **251 tests
  réussis dans 17 fichiers**.
- Après ajout de l'installation locale reprenable : **254 tests réussis dans
  18 fichiers**.
- Après validation métier avant installation : **258 tests réussis dans les
  mêmes 18 fichiers**.
- Après capture de la génération du contexte pour les premières commandes de
  la façade : **261 tests réussis dans les mêmes 18 fichiers**.
- Après extension aux sessions, transactions et documents : **263 tests réussis
  dans les mêmes 18 fichiers**.
- Le client, le lecteur, le contexte, le coffre, la découverte, le bail, le
  publieur, le journal, l'orchestrateur, l'assemblage, le stockage local et la
  façade de session GitLab donnent **52 tests unitaires réussis**. Avec le banc
  configuré, `npm run test:gitlab` donne **67 réussites et un saut**, ce saut
  étant la campagne longue réservée à sa commande dédiée.
- L'E2E GitLab opt-in a réussi sur le banc réel dans le build et le binaire
  empaqueté : deux comptes, deux profils, découverte, consultation,
  actualisation, bascule local ↔ GitLab, redémarrage, réouverture d'un récent,
  refus d'un jeton invalide et consultation d'un projet sans LFS.
- Aucun test sauté dans la sélection WebDAV.
- La suite `test/webdav` complète donne **219 tests réussis et 21 sautés** :
  les six fichiers dépendant des bancs réels sont sautés faute de serveur.
- La suite globale donne **1 274 tests réussis et 37 sautés** dans 109 fichiers
  réussis et 7 fichiers sautés. Les erreurs réseau Happy DOM pendant le démontage
  n'ont pas fait échouer les suites.
- Vitest exécuté localement : 4.1.9. Aucune installation de dépendance effectuée.

### Vérification de types et environnement

`npm run typecheck`, la vérification main séparée avec
`./node_modules/.bin/tsc --noEmit -p tsconfig.node.json`, `npm run build` et
l'E2E GitLab dans le binaire empaqueté passent sur le banc réel dans
l'installation locale courante. Aucune dépendance n'a été installée pendant
cette itération.

## 8. Prochaine étape bornée

La consultation GitLab à deux profils, la découverte des projets et branches,
les récents après redémarrage, la bascule local ↔ GitLab et le binaire empaqueté
sont désormais joués sur le banc. L'ouverture reste sans commit, verrou,
présence ni sonde. Un jeton invalide ne crée pas de miroir ; un projet connu
comme archivé est refusé ; une réponse 404 reste expliquée comme une ressource
introuvable ou inaccessible, jamais comme un projet vide. Un projet sans LFS
permet toujours de consulter les transcriptions.

La sortie locale de L3 est couverte. La série longue et les transferts LFS
volumineux, annulés et repris sont également qualifiés. Le journal local, la
réconciliation bornée, l'orchestrateur de session, son stockage local et les
intentions de la façade main sont maintenant assemblés et testés. Une
reconstruction sur disque après un redémarrage simulé confirme une publication
dont la réponse avait été perdue, sans double publication. Une autosave non
publiée est désormais conservée dans un journal de session, protégée avant le
tirage et reprise après expiration du bail. Le banc ne permet pas de conclure sur une CI, faute de configuration et de runner,
ni sur un refus de quota, faute de quota configuré ; ces deux points demandent
une campagne dédiée sans modifier abusivement le projet de qualification.

Un smoke test sur le projet Humanum `mbeligne/sonalpi2corpustest` (projet 7287)
a confirmé l'URL, l'authentification par deux PAT du même compte, LFS activé, la
lecture du projet, la création d'un fichier synthétique, la mise à jour gardée par
`last_commit_id` et la relecture avec le second PAT. Les fichiers synthétiques et
les commits de qualification sont conservés pour examen ; aucun contenu utilisateur
n'a été utilisé. L'E2E Humanum passe dans quatre scénarios sur cinq avec deux PAT de deux
comptes ; le scénario sans LFS est sauté car aucun second projet sans LFS n'est
configuré. La recette complète reste à compléter sur cette instance.

Le coordinateur GitLab par bail versionné, le publieur conditionnel, le journal
durable, l'orchestrateur de session et l'assemblage de stockage sont maintenant
extraits, testés en mémoire et validés sur le banc réel. Le cycle complet
local — acquisition, lecture, autosave, publication, renouvellement et fermeture —
est également passé sur le projet GitLab réel. Le main construit la factory,
rejoue ses intentions de session, réconcilie les opérations confirmées et protège
la reprise d'une autosave non publiée après redémarrage. L'E2E renderer
vérifie maintenant l'édition, la publication et la fermeture. Le prochain lot
technique qualifie la CI, le quota LFS et la fermeture applicative bloquée
de L4. La fermeture normale, la publication finale au retour au corpus et la
protection après crash forcé sont couvertes par l'E2E empaqueté. La limite « même compte sur deux
postes » écarte toujours LFS Locks seuls ; le bail versionné reste le candidat
principal. L'étude V1 reste exploitable sans toucher à ses sources ni réinstaller
les services existants.

L'ouverture en lecture seule nomme désormais le compte qui tient l'entretien,
lorsque le bail l'identifie : le bandeau de l'éditeur et le refus d'assignation
audio reprennent cet identifiant au lieu d'un « un autre utilisateur » générique.
Le bail GitLab ne dit ni poste ni heure d'acquisition, donc ces deux champs
restent vides et l'interface omet l'heure. Le comportement est couvert par des
tests simulés (dépôt en mémoire, deux comptes, sessions du même compte, bail
expiré repris, refus sans bail lisible) et par le scénario E2E à deux comptes,
qui exige la bannière nommant le détenteur réel après l'avoir vérifié par le
bail.

Les listes portent en outre un badge 🔒, observé à l'ouverture du corpus et à
chaque actualisation, sans aucun commit. Le commit de branche est résolu une
seule fois par tirage : l'observateur des baux lit au même commit que le miroir.
L'inventaire de `.sonal/verrous/` est paginé et seuls les fichiers dont le nom
est l'empreinte attendue d'un entretien du membership sont lus — le bail du
corpus, ceux d'autres corpus et les fichiers étrangers ne sont jamais
demandés. Un inventaire en échec n'est pas un « personne ne tient rien » : le
tirage aboutit quand même, et le renderer affiche « 🔒 détenteurs : indisponible »
pour que l'absence de badge ne soit pas prise pour une absence d'exclusion.
Les deux fournisseurs sont alignés : sur Nextcloud, une panne du PROPFIND des
verrous faisait jusqu'ici échouer le pull entier ; elle ne retire plus rien aux
contenus et se signale de la même façon. Le coût par actualisation est donc d'une requête d'inventaire plus
une requête par entretien réellement détenu, la résolution de branche étant
partagée avec le tirage du miroir. Sur l'instance locale du banc, un GET de
branche, d'inventaire ou de fichier brut répond en 0,09 à 0,17 s : observer un
corpus de trois entretiens tenus coûte environ quatre requêtes, soit une
demi-seconde, et aucun commit. Un bail expiré ne badge pas, un ancien marqueur
badge toujours, un bail illisible est omis sans être deviné, et un inventaire en
échec (dossier absent, 403, coupure) laisse la consultation ouverte sans badge.
Un badge n'autorise ni ne refuse quoi que ce soit : l'exclusion se vérifie à
l'ouverture, par le bail. Ces comportements sont couverts par des tests simulés
(racine imbriquée, branche à '/', deux corpus d'un même dépôt, expirations,
contenu corrompu, dossier absent, 403, coupure, pagination) et par le scénario
E2E à deux comptes, joué sur le banc : le second profil voit le badge du premier
avant d'ouvrir, s'ouvre en lecture seule avec une bannière qui le nomme, puis
récupère l'entretien une fois le bail expiré et le badge effacé.

## 9. Définitions du corpus sous bail

Les définitions du corpus GitLab sont désormais modifiables. Elles constituent
le premier lot d'écritures : tout ce qui précède ne faisait que lire.

### Portée des gestes

`gitlab/politiqueGestes.ts` classe chaque commande du corpus selon ce qu'elle
doit savoir pour se calculer : `definitions-corpus` (le seul `corpus.json`),
`definitions-avec-sources` (des entretiens publiés), `tri-contenus`,
`suppression-definition`, `suppression-entretien`, ou `indisponible` sur un
corpus distant. Le classement est par commande, et par
variante de commande pour CAS et les recueils : insérer un passage se distingue
d'insérer un texte, un tri alphabétique se distingue d'un tri par dernière
modification. Le main nomme le geste de chaque handler et refuse par son nom tout
geste hors de portée du fournisseur courant, y compris par appel IPC direct.
Une interface grisée ne suffit donc pas.

`matriceCapacites` déduit de ces portées la matrice publique reçue avec le
résultat d'ouverture. Elle remplace le drapeau unique qui déverrouillait aussi
des gestes inexistants : sur GitLab, les définitions simples, les gestes à
sources, les tris par contenu, les suppressions de définitions et le renommage
d'entretien sont ouverts. La suppression d'entretien et les métadonnées d'un
entretien hors session restent bloquées. Le hors ligne et la consultation seule
s'appliquent au-dessus de la matrice ; l'édition d'un entretien garde en plus sa
garde de session.

### Préparation isolée

`gitlab/preparationDefinitions.ts` construit un `CorpusStore` neuf dans un
dossier temporaire initialisé avec le seul `corpus.json` lu sur GitLab, et le
détruit en `finally`. Le store du miroir actif ne sert jamais à préparer et
n'est jamais déverrouillé : il reste en lecture seule, et ne reçoit ni base
fraîche ni candidat avant que leur statut soit certain.

L'absence de fichiers d'entretien n'est pas une garde suffisante. Certaines
lectures du store ignorent volontairement un entretien absent et concluraient
à tort à zéro usage ; le store temporaire est donc en mode **corpus seul**,
où toute lecture, tout inventaire et toute écriture d'entretien échoue avec une
erreur dédiée (`ErreurCorpusSeul`). Une suppression reçoit explicitement
l'inventaire complet du membership frais ; le helper vérifie que chaque source
est présente avant d'autoriser ce seul inventaire. C'est une seconde garde,
jamais un remplacement du dispatch.

L'autorisation d'écriture y est une capacité propre à ce store, bornée à un
callback synchrone et révoquée en `finally`. Un callback qui retourne une
Promise est refusé : aucune continuation ne doit survivre à l'autorisation ni à
la suppression du dossier.

### Déroulement d'une transaction

`TransactionsGitLab.executerDefinitions` prend le bail de `corpus.json`, lit et
valide le fichier frais avec son `last_commit_id`, prépare dans le store corpus
seul, compare le candidat à la base fraîche **normalisée** (jamais aux seuls
octets reçus ni au miroir), puis publie `update corpus.json` et la mutation
conditionnelle du bail dans le même commit. Après confirmation seulement, le
candidat est installé localement par un plan `remplacement` de
`TransactionsFichiersCorpus` dont le `corpusAvant` est l'état **local** réellement
remplacé, jamais la base fraîche du serveur. L'ajout et l'import passent par le
même helper : leur plan local est reconstruit sur l'état local, ce qui les rend
acceptables même depuis un miroir en retard.

Une commande sans changement est un succès sans commit de données ; l'acquisition
et la libération du bail restent payées, et les octets frais sont néanmoins
installés avant le retour, pour ne pas rester sur une base périmée. Un refus
métier ne publie rien et ne modifie pas le miroir.

Une publication dont la réponse s'est perdue est réconciliée immédiatement : le
commit est retrouvé, et l'état de bail qu'il portait est adopté — la reprise est
acceptée si le compteur publié vaut exactement le compteur porté, incrémenté d'un.
La libération qui suit porte alors la bonne garde, et l'appelant installe son
candidat au lieu d'apprendre qu'il ignore. Si l'historique ne permet pas de
conclure, l'entrée reste journalisée et le résultat demeure indéterminé.

Un poste qui s'arrête entre la perte de réponse et la réconciliation ne laisse
aucun droit en mémoire. À l'ouverture, le bail de `corpus.json` est alors rendu
s'il porte encore notre compte **et** la génération de l'opération retrouvée : une
reprise par un tiers change la génération, donc un bail qui la porte encore est le
nôtre. À défaut des deux preuves, rien n'est touché et le bail expire comme
avant. Un bail de corpus n'ayant pas d'entretien à rouvrir, son refus le dit
ainsi — « retenu par ce poste, qui a peut-être déjà terminé », avec l'échéance. Les lectures et le tirage restent permis, et c'est le tirage
normal qui installe l'état publié.

### File de commits et collision de branche

L'API Repository de GitLab est conditionnelle **par tête de branche** : deux
commits envoyés au même instant se percutent, même sur des fichiers sans rapport
(qualifié sur banc, `9:reference update: reference does not point to expected
object`). Toutes les publications et toutes les mutations de bail passent donc par
une **file unique par destination** (`BailGitLab.serierCommit`). Un appel
réentrant s'exécute au lieu d'attendre : il est déjà dans la section critique.

Elle appartient à la **destination** : toutes les sessions d'un même corpus et ses
transactions de corpus partagent le même objet, passé à chaque coordinateur. Un
lien par `BailGitLab` laisserait deux entretiens ouverts se percuter — c'est
précisément le montage réel, où chaque session a son coordinateur.

Cette file ne couvre pas deux postes distincts. Le cas entre deux postes est absorbé par
un réessai vérifié : sur un refus 400/409, les gardes du plan sont relues, et si
aucune n'a bougé le refus ne concernait pas notre édition — le même commit repart
une fois après 400 ms. Une garde déplacée reste un conflit métier, et le refus
nommé tient. Aucun message d'erreur du serveur n'est lu pour décider.

### Sérialisation et reprise

`FileOperationsContexte` est la file unique du contexte : elle couvre la
transaction corpus entière, les tirages et leurs installations, et l'entrée en
fermeture. Sans elle, un tirage commencé avant une publication pourrait
réinstaller une base plus ancienne après le succès de cette publication. La
fermeture verrouille l'entrée, attend l'opération déjà engagée, puis ferme les
sessions ; la capture de génération du main reste utile pour écarter une réponse
tardive, mais elle ne remplace pas cette barrière.

Le journal de publication porte désormais une nature explicite et versionnée,
`session-entretien` ou `transaction-corpus`. Une entrée écrite avant cette
distinction n'est reconnue comme transaction de corpus que si son `resourceHash`
correspond exactement à la ressource canonique de `corpus.json` **et** que
l'ensemble de ses actions lui est compatible ; la forme de sa première action ne
suffit jamais. Toute entrée non classée avec certitude reste récupérable, bloque
sa ressource et n'est jamais rejouée. À l'ouverture, une publication de session
confirme son journal de session ; une transaction de corpus ne le confirme jamais.

### Couverture

`test/gitlab/transactions.test.ts` couvre le refus métier sans effet local, la
commande sans changement sur miroir à jour puis périmé, la garde périmée, le
bail tenu par un tiers, la préparation refusée sur toute lecture d'entretien,
la sérialisation de deux transactions et d'un tirage, la fermeture attendue puis
le refus suivant, l'ajout et l'import depuis un miroir en retard, la réponse
perdue retrouvée, le retry bloqué, la réapplication sans effet et la reprise d'une
installation interrompue. `test/gitlab/politiqueGestes.test.ts` énumère les
gestes de CAS, de recueils, de tris et de suppression, sans régression des
parcours déjà acquis. `test/distantRenderer.test.ts` vérifie la matrice publique
des deux fournisseurs et la primauté du hors ligne.

**Qualifié sur banc.** Le jalon de recette à deux comptes a validé le coût en
requêtes et en commits, les commandes concurrentes, la garde périmée par un tiers
et la reprise après coupure ; les mesures sont consignées au §16 du plan. Le
manifeste GitLab n'est volontairement pas mis à jour après une installation issue
d'un GET ou d'un commit : le prochain tirage peut donc retélécharger le fichier,
ce qui reste sans effet.

## 10. Définitions qui lisent les entretiens publiés

Les gestes qui ajoutent une référence — un rattachement ou une création de cas qui
en porte, une dérivation de famille ou de cas, l'insertion d'un passage de recueil
ou le changement de sa source — se calculent sur les **versions publiées** des
entretiens qu'ils contrôlent. Le tri par modification ou par longueur relit, lui,
tous les entretiens sans en garder aucun. Ces gestes sont écrits, couverts par des tests et qualifiés sur le banc réel :
`PORTEEES_OVERTES_GITLAB` les ouvre. Les suppressions de définitions sont elles
aussi ouvertes depuis leur qualification à deux comptes ; le dispatch refuse
tout le reste par son nom.

### Portées distinctes

`politiqueGestes.ts` distingue désormais quatre portées au lieu de deux :
`definitions-avec-sources` pour ce qui écrit une référence ou une recette,
`tri-contenus` pour les tris par contenu, `suppression-definition` pour le retrait
d'un thème, d'une variable, d'une modalité, d'une catégorie de note ou d'une règle,
et `suppression-entretien`. Les capacités `definitionsAvecSources` et `triContenu`
en découlent séparément : un fournisseur peut savoir garder des sources sans
savoir trier, ou l'inverse.

### Sources publiées et gardées

Une source nécessaire entre dans le commit sous une garde `chmod` sans effet,
avec son mode courant et son `last_commit_id`, mais sans son contenu. Le geste se
déroule ainsi :

1. un aperçu sans droit, sur la tête de branche, compte les sources et refuse
   le dépassement avant tout commit de coordination ;
2. les sources que nous détenons sont publiées, et un résultat incertain arrête la
   commande ; une source tenue par un tiers n'est jamais publiée en son nom, et son
   travail non publié n'est ni lu ni remplacé ;
3. le bail de `corpus.json` est acquis ;
4. la branche est résolue **une fois** en SHA ; `corpus.json` et chaque source sont
   lues à ce SHA, un seul contenu par source ;
5. le geste est préparé dans le store temporaire, avec ces sources comme seules
   lectures autorisées ; le miroir n'est ni consulté ni écrit ;
6. `corpus.json`, les gardes de sources et la mutation du bail partent dans le
   **même commit** ; une source qui a bougé depuis la lecture fait donc refuser le
   tout, et le corpus publié reste intact.

Le store de préparation (`preparationDefinitions.ts`) dépose les sources lues et
n'accorde de droit de lecture qu'à elles : toute autre lecture est une erreur
(`ErreurCorpusSeul`), jamais une absence, et une écriture d'entretien y reste
refusée même pour une source prévue. C'est ce qui rend les validations locales
indépendantes de l'état du miroir : un miroir périmé ne produit ni faux refus ni
fausse validation.

### Suppressions et sessions déjà ouvertes

Une suppression de thème, catégorie de note, règle d'anonymisation, variable ou
modalité relit **tous** les entretiens du membership frais au même SHA. Les
sessions locales sont publiées avant ce décompte. Si aucun usage ne subsiste, le
commit retire la définition et garde chaque entretien par un `chmod` sans effet
sous son `last_commit_id`. Une publication concurrente périme donc une garde et
fait refuser tout le retrait.

La protection réciproque se trouve dans chaque publication de session. Avant le
commit, SonalPi relit `corpus.json`, valide toutes les références du candidat,
puis ajoute le corpus inchangé sous son `last_commit_id`. Une session ouverte
avant un retrait ne peut ainsi pas réintroduire ensuite la définition : elle
reste éditable avec son candidat local, mais sa publication est refusée jusqu'au
retrait de la référence. Si le corpus change entre validation et commit alors que
l'entretien et son bail sont intacts, la session relit les définitions et réessaie
une fois. Une mutation indépendante peut ainsi aboutir ; une suppression rend la
référence invalide et conserve le candidat sans l'écrire.

La file de commits locale simplifie ce protocole sur un même poste, mais ne le
remplace pas : deux postes ont deux files. Ce sont les gardes croisées — tous les
entretiens dans le commit de suppression, `corpus.json` dans le commit de session
— qui ferment la course distribuée.

La limite interne autorise 248 sources au plus dans les 250 actions du commit.
La limite de 2 Mio porte toujours sur le corps final, mais les contenus des
sources n'y sont plus recopiés. Une suppression trop grande est refusée ; elle
n'est ni découpée ni publiée avec moins de gardes. Les tests simulés sont dans
`definitionsSources.test.ts`, `referencesDefinitions.test.ts` et
`session.test.ts`. La recette réelle de `qualificationSuppressions.test.ts` a
réussi le 26 septembre 2026 sur GitLab CE 18.11, à deux comptes :

| Scénario | Résultat mesuré |
|---|---|
| Suppression face à une session déjà ouverte | 1 commit de données, 3 commits au total, 7 requêtes, 2,2 s |
| Définition utilisée dans une version publiée | refus avec un usage, 0 commit de données, 2 commits de coordination, 6 requêtes, 0,9 s |

Le premier scénario retire le thème, refuse ensuite l'ancien candidat avec le
motif `references` sans dégrader la session, puis accepte le candidat corrigé.
Le second conserve la définition et le corpus distant intacts. Le fichier de
qualification reste sauté sans les variables du banc ; un saut n'est pas une
nouvelle preuve, mais ne retire pas celle consignée ici.

### Capacités

`PORTEEES_OVERTES_GITLAB` accorde désormais `definitions-corpus`,
`definitions-avec-sources`, `tri-contenus` et `suppression-definition`. Un
rattachement CAS, une dérivation, un passage de recueil, les tris par modification
et par longueur, ainsi que les suppressions de définitions sont proposés par
l'interface. Le main continue de refuser par son nom tout ce qui n'est pas dans
la liste. La suppression d'entretien reste absente.

### Le tri sur un corpus calme

Le tri ne produit qu'un ordre : une lecture légèrement périmée donne un rang faux,
corrigé au tri suivant, et ne crée jamais de référence pendante. Aucun entretien
n'est donc gardé, et le commit ne porte que `corpus.json` et le bail. En échange,
le tri refuse **avant** toute acquisition dès qu'un entretien est tenu, y compris
par notre propre application : l'observation distante fraîche et les sessions
locales du contexte sont combinées, une observation en panne vaut un refus, et les
détenteurs trouvés sont nommés. Les contenus sont lus par l'endpoint brut, au SHA du
corpus, hors de la limite de lecture avec garde, soit 1,5 Mio de fichier.

L'interface ne publie plus l'entretien ouvert pour faire passer un tri : elle
annonce que le tri de contenu demande la fermeture de tous les entretiens
(`verifierTriContenu` dans `useDistantCorpus.ts`).

Les commandes du renderer consomment réellement ces capacités. Un corpus qui ne
sait pas garder de sources refuse donc **avant** d'enregistrer un repère dans
l'entretien : l'association d'un passage à un cas, l'ajout d'une dérivation de
famille ou de cas, et l'insertion d'un passage dans un recueil. Le refus est
nommé, et le main garde le sien par geste pour les appels IPC directs.

### Bornes

Quatre limites existent et ne se confondent plus :

| Limite | Valeur | Périmètre |
|---|---|---|
| Actions du commit | 250 | le plan complet, **bail compris** ; 248 sources au maximum |
| Plan sérialisé | 2 Mio | actions métier, échappement compris |
| Corps HTTP | 2 Mio | corps exact, bail compris |
| Réponse de lecture | 2 Mio | réponse JSON base64 d'un fichier avec garde, soit **1,5 Mio de fichier** |

Les trois bornes de taille portent la même valeur, `TAILLE_MAX_DOCUMENT_GITLAB`
dans `client.ts`. Les aligner n'est pas cosmétique : un fichier est élargi par le
base64 à la lecture (1,34 fois) et par l'échappement à la publication (1,13 fois,
mesuré sur un entretien réel), donc à bornes égales le plus grand fichier lisible
tient nécessairement sous le plan. L'invariant « ce qui s'ouvre s'enregistre » est
vérifié par un test sur un entretien de la taille maximale lisible.

La lecture reste bornée à environ 1,5 Mio par fichier. La taille des sources ne
se cumule toutefois plus dans le plan : seules les petites actions `chmod`, le
candidat de `corpus.json` et le bail occupent le corps de publication. La borne
de 248 sources est donc désormais un véritable compte d'actions, indépendant de
la taille cumulée des transcriptions.

`verifierBornesPublication` mesure le corps final au moment de l'envoi ;
`verifierBornesAnticipees` fait le même calcul avant l'acquisition du droit, bail
réservé. Un dépassement est refusé par son nom, jamais contourné par plusieurs
commits ni par la suppression d'une garde. Un entretien trop gros pour la lecture
avec garde est refusé en nommant l'entretien et la limite franchie : il reste
consultable et éditable, mais ne peut plus porter de référence ni de recette.

### Une garde légère ne périme personne

Le fait décisif a été mesuré sur le banc : un `chmod` demandant le mode déjà
observé contrôle `last_commit_id` sans modifier le fichier. Son contenu, son mode
et son propre `last_commit_id` restent inchangés. Une garde périmée renvoie HTTP
400 et fait refuser atomiquement les autres actions du commit.

Le mode n'est jamais supposé : le GET du fichier fournit `execute_filemode`, et
la garde renvoie exactement cette valeur. Les revalidations après conflit et la
réconciliation après perte de réponse relisent seulement les métadonnées par
HEAD, sans télécharger la transcription. Les scénarios simulés et réels se
trouvent dans `bailPublication.test.ts`, `journal.test.ts`,
`contrat-gitlab.test.ts` et `qualificationSources.test.ts`.

### Couverture

`test/gitlab/definitionsSources.test.ts` couvre la garde des sources dans le
commit, l'absence de double lecture, le refus atomique quand une source change
pendant la préparation, un repère absent de la version publiée, une source
disparue, la borne de 248 sources refusée avant le bail, la publication préalable
d'une source détenue et son échec, puis le tri : corpus publié sans aucune source
gardée, refus avant acquisition, entretien illisible, tri sans changement.
`test/gitlab/contexte.test.ts` couvre le refus de tri sur un entretien local, sur un
détenteur nommé et sur une observation en panne, ainsi que la publication préalable
d'une source détenue. `test/gitlab/bailPublication.test.ts` couvre les bornes du
commit et du corps. `test/distantRenderer.test.ts` couvre la règle de tri côté
interface, et `test/casRenderer.test.ts` le refus d'une association de passage
sur un corpus qui ne garde pas les sources, avant l'enregistrement du repère.
`test/gitlab/qualificationBanc.ts` porte le harnais partagé des deux bancs :
pile réelle, comptage des commits et lectures directes de l'API.

**Qualifié sur banc** (deux comptes, GitLab CE 18.11) pour la mesure de la garde,
pour le jalon d du lot C, pour le jalon D1 des gestes à sources et pour le jalon
D2 des suppressions de définitions. Les résultats et les réserves sont consignés
dans le plan (`test/gitlab/qualificationDefinitions.test.ts`,
`test/gitlab/qualificationSources.test.ts`,
`test/gitlab/qualificationSuppressions.test.ts`).

**Non qualifié sur banc.** Le volume du corpus pilote : nombre d'entretiens,
taille brute et réponse base64 du plus gros fichier, nombre réel de sources
d'un rattachement et d'une dérivation, mémoire pendant un geste à sources. La borne interne reste de 250 actions et celle du corps HTTP de 2 Mio. Un fichier
individuel exceptionnel est refusé par son nom tant que ce relevé n'a pas été
fait.

## 11. Retrait d'un entretien : deux droits, une archive

Le retrait d'un entretien est le premier geste GitLab qui protège **deux**
ressources à la fois. Le chemin Nextcloud, lui, publie `corpus.json` puis déplace
le fichier, et accepte un état dégradé où le membership est à jour et l'archive
pas. L'API Repository accepte `update` et `move` dans le même commit, avec leurs
gardes : le retrait GitLab est donc atomique, à condition de distinguer les
actions distantes du plan local.

### Ce qui est publié, et ce qui reste local

Le commit de données porte exactement quatre actions : la mise à jour gardée de
`corpus.json`, le déplacement gardé du JSON d'entretien vers son archive, et le
renouvellement des deux baux. Les sauvegardes `.bak1`, `.bak2` et les PNG ne sont
jamais dans le dépôt : leur archivage est un plan local, écrit dans le journal de
publication et appliqué par `appliquerTransactionFichiers` après la confirmation.
Les médias référencés ne sont ni lus ni déplacés.

`CorpusStore` sépare désormais les deux moitiés du geste :
`preparerRetraitEntretien` calcule le retrait métier sur la base qui le portera —
donc la base fraîche protégée —, et `inventorierFichiersSuppression` relève les
fichiers du miroir. Un inventaire local ne décide jamais de ce que GitLab reçoit.

### Archive : un nom choisi une fois

La première destination est `corbeille/<id>.json`. Si elle est prise, un suffixe
stable dérivé de l'identifiant d'opération la rend non conflictuelle, et ce chemin
exact est journalisé : un redémarrage retrouve la même archive, et deux tentatives
ne s'échangent pas leurs fichiers. Deux noms pris sont un refus explicite — le
code ne compte pas sur un écrasement de GitLab, et un test de contrat vérifie
cette hypothèse sur l'instance réelle. La règle locale est la même, sans aléa :
une collision constatée après la préparation suspend l'application et conserve le
journal, au lieu de détruire une archive existante.

### Ordre des droits

L'ordre est global et immuable : le droit de `corpus.json`, puis celui de
`entretiens/<id>.json`, et la libération en ordre inverse. Avant toute acquisition,
notre session sur l'entretien est fermée : son candidat est d'abord publié, et une
fermeture refusée, dégradée ou indéterminée arrête la commande sans acquérir le
droit du corpus. Fermer notre session ne réserve rien — entre la libération et la
seconde acquisition, un autre poste peut gagner, et il est alors nommé.

`PublieurGitLab.publierSousDroits` prend une liste de droits, tient la file de
commits de la destination une seule fois, prépare toutes les transitions avant
d'envoyer quoi que ce soit, et n'en confirme aucune si la préparation ou
l'écriture du journal échoue. Le cas à un droit délègue à cette primitive : il
n'existe qu'un seul protocole. Sur un refus, chaque droit est jugé sur sa propre
garde — les autres ne sont pas présentés comme intacts par supposition.

### Journal composite et reprise

Le journal gagne une nature `suppression-entretien` et une version qui porte une
**liste** de droits, le chemin d'archive, l'empreinte SHA-256 du JSON déplacé et
le plan local complet. Les entrées anciennes à un droit restent lisibles et sont
projetées vers une liste d'un élément.

La réconciliation d'un `move` ne compare plus la destination à `action.content`,
qui n'existe pas dans la requête GitLab : elle vérifie le départ du chemin
ancien, la présence de l'archive et l'empreinte du JSON lu pendant la
préparation. L'empreinte est portée par l'action elle-même, ce qui rend la
vérification possible pour tout déplacement, pas seulement pour une suppression.

Une confirmation distante ne supprime plus l'entrée : elle passe à l'état
`confirme-a-installer`. C'est ce qui permet à `reprendreOperationsGitLab` de
terminer l'archive locale au démarrage, avant le tirage — un tirage ne sait pas
où sont les `.bak`. La reprise locale d'abord, les publications composites
ensuite, le tirage normal enfin.

### Capacités

`suppression-entretien` est dans `PORTEEES_OVERTES_GITLAB` : l'analyse et la
suppression sont proposées par l'interface et acceptées par le main, qui continue
de refuser par son nom tout ce qui n'est pas dans la liste.

### Qualification à deux comptes

Les huit scénarios sont dans `test/gitlab/qualificationSuppressionEntretien.test.ts`
et ont réussi sur GitLab CE 18.11, à deux comptes, le 27 septembre 2026.

| Scénario | Résultat mesuré |
|---|---|
| Suppression nominale | 1 commit de données, 5 commits au total, 9 requêtes, ≈ 2,2 s |
| Entretien tenu par l'autre compte | refus nommant `user2`, 0 commit de données, aucune archive |
| Ouverture entre les deux acquisitions | le second compte gagne le bail entretien, refus nommé, aucune archive |
| Réponse du commit de données perdue | commit retrouvé, 1 commit de données, deux baux rendus, plan local appliqué une fois |
| Arrêt après commit, nouveau processus | l'historique répond, archive locale terminée, aucun commit supplémentaire |
| Collision d'archive, dépôt et miroir | suffixe stable des deux côtés, aucune archive écrasée |
| Entretien modifié entre la lecture et l'envoi | commit refusé, version concurrente et membership intacts, aucune archive |
| Corpus modifié entre la lecture et l'envoi | commit refusé, entretien et archive intacts, l'autre version du corpus conservée |

Les quatre preuves d'activation sont réunies : retrait et archive dans un même
commit, exclusion effective par les deux baux, réconciliation sans rejeu,
récupération locale après un véritable renouvellement de la pile applicative.

Trois corrections de harnais ont été nécessaires, toutes dans
`test/gitlab/qualificationBanc.ts`, et toutes conséquences d'un contrat que les
tests simulés ne vérifiaient pas :

- la session de qualification tenait son bail sur un identifiant de session
  plutôt que sur le **chemin distant**. Une suppression concurrente ne la
  rencontrait donc jamais : le refus par un tiers n'était pas réellement testé.
  Le harnais utilise désormais `ressourcePartagee`, comme `assemblageSession.ts` ;
- le filtre `path` de l'API des commits est un **préfixe**. Compter un fichier
  revient à compter son dossier, et un nom de fichier ne donne pas de compte
  fiable : les archives se comptent par `…/corbeille` ;
- l'entrée de `membership` du corpus de qualification portait un `lastModified`
  nul, ce qu'un miroir refuse. Le corpus de qualification était donc valide pour
  une transaction, mais pas pour un tirage.

Une sonde de contrat a été ajoutée pour le `move` gardé vers une archive occupée :
GitLab refuse bien le déplacement et ne l'écrase pas. Le double de dépôt, qui
traitait un `move` comme une mise à jour de sa destination, a été corrigé en
conséquence.

Ce que la qualification **n'a pas** mesuré : la taille réelle d'un entretien de
travail. Le `move` ne transporte pas de contenu, mais la préparation lit encore
le JSON avec sa garde pour valider sa version et calculer l'empreinte de
l'archive. La borne de lecture s'applique donc au retrait, soit environ 1,5 Mio
de contenu avec la limite actuelle de 2 Mio sur la réponse base64.

## 12. Écritures d'entretien depuis les vues corpus

Les gestes `valeurs.lot` et `regles.lot` ont chacun leur portée et leur capacité
publique. WebDAV retrouve ses transactions courtes existantes ; le chemin GitLab
exécute une transaction indépendante par entretien, de sorte qu'un refus ne retire
pas les succès précédents. Les deux portées GitLab sont dans
`PORTEEES_OVERTES_GITLAB` depuis la qualification à deux comptes ci-dessous.

Un entretien fermé reçoit un bail court. La préparation lit l'entretien et
`corpus.json` au même SHA, valide les références, puis publie dans un commit :

- le candidat de l'entretien sous son `last_commit_id` ;
- `corpus.json` inchangé sous sa propre garde ;
- la transition du bail entretien.

La garde de corpus ne prend aucun bail de corpus et ne modifie pas son
`last_commit_id`. Elle empêche seulement de publier une valeur ou une annotation
qui référencerait une définition supprimée pendant la préparation. Un changement
indépendant des définitions provoque une nouvelle lecture et une seule nouvelle
tentative.

Quand notre application tient déjà l'entretien, elle modifie sa copie de session,
la marque sale et utilise la publication ordinaire. Une session dégradée ou une
référence supprimée laisse ce candidat éditable et produit un échec nommé dans le
lot. Les publications courtes ont la nature de journal
`transaction-entretien` : elles ne sont ni rattachées au journal d'une session,
ni comptées comme transactions bloquantes de `corpus.json`. Après un arrêt, leur
confirmation est réconciliée avant le tirage, sans rejeu du geste.

Les tests simulés couvrent la pose de valeur, la pseudonymisation, la suppression
concurrente d'une modalité, la réutilisation d'une session et les résultats
partiels.

### Qualification à deux comptes

Les douze scénarios sont dans
`test/gitlab/qualificationEcrituresEntretien.test.ts` et ont réussi sur GitLab
CE 18.11, à deux comptes, le 27 septembre 2026.

| Scénario | Résultat mesuré |
|---|---|
| Valeur dans un entretien fermé | 1 commit de données, 3 commits au total, 6 requêtes, 1,3 s |
| Pseudonymisation d'un entretien fermé | 1 commit de données ; un seul commit touche le dossier des entretiens |
| Entretien tenu par l'autre compte | refus nommant `user2`, aucun commit de données, miroir non écrit |
| Même compte, autre session | refus « retenu par ce poste » avec son échéance, aucun commit de données |
| Session locale déjà ouverte | un seul envoi de commit, celui du candidat ; l'entretien suivant prend 3 commits |
| Lot mêlé (1 succès, 1 refus) | 16 requêtes, 8 envois de commit ; succès conservés, refus nommé par entretien |
| Entretien modifié entre lecture et envoi | commit refusé, version concurrente et miroir intacts |
| Modalité retirée pendant la préparation | refus après une relecture, aucune référence invalide publiée |
| Corpus modifié indépendamment | une relecture, 4 envois de commit, 1 commit de données, thème concurrent conservé |
| Réponse du commit de données perdue | commit retrouvé, 3 envois de commit, un seul commit de données |
| Arrêt après envoi, historique illisible, nouveau processus | entrée `transaction-entretien` conservée puis réconciliée sans rejeu, miroir réparé par le tirage, geste suivant libre |
| Requête jamais partie | absence reconnue, une relecture, un seul commit de données dans le dépôt |

Une garantie s'ajoute aux preuves du tableau : `corpus.json` garde son contenu
et son `last_commit_id` à travers un commit de données, ce qui confirme sur
l'instance réelle qu'une garde inchangée ne périme personne.

Quatre enseignements de qualification à retenir :

- **La décision appartient à l'acquisition.** Aucun de ces scénarios ne consulte
  un badge : un entretien tenu est refusé même quand aucune observation n'a eu
  lieu, et un entretien sans badge est réellement tenté.
- **Notre session n'est jamais doublée.** Le lot passe par la publication de la
  session quand nous détenons l'entretien, et par un bail court sinon.
- **Un changement indépendant du corpus coûte une relecture, pas un refus.** Un
  thème ajouté entre la lecture et l'envoi fait relire le corpus une fois, puis
  aboutit ; seule une définition supprimée fait échouer l'entretien.
- **Un envoi qui n'est jamais parti est reconnu.** Le geste relit une fois et
  aboutit, avec un seul commit de données dans le dépôt : rien n'est laissé
  journalisé d'indéterminé.

Ce que la qualification **n'a pas** mesuré : le coût d'un lot de grande taille,
la borne de taille d'un entretien écrit, et la coexistence d'un grand nombre de
transactions courtes sur la même branche. Le banc ne possède ni configuration CI
ni runner : le coût de pipeline de ces commits reste inconnu.
