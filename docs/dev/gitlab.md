# GitLab — qualification et état du chantier

**État : étude V1 et caractérisation V2 en cours ; aucun connecteur GitLab V2
ni protocole GitLab réel validé à ce stade.**

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

Base inspectée : `c99ba4f7667b5108c8eef915d2889768894e0b2c`.
Tests exécutés avec transports injectés en mémoire et fichiers temporaires de
fixtures. Pas de requête vers un compte GitLab, pas de banc Docker démarré,
pas de dépendance installée, pas de suppression de données existantes.

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

`test/webdav/lecture.test.ts` vérifie le premier contrat de lecture distante :
l'adaptateur WebDAV expose des empreintes qui ne sont pas des gardes d'écriture,
les binaires sont téléchargés en flux, et le miroir utilise bien le lecteur
injecté plutôt que son client WebDAV pour les lectures.

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
| Partiellement traitée | `MiroirWebDAV.tirer()` installait les fichiers successivement et avançait le manifeste en cours de route. | La préparation et le journal d'installation sont en place. La validation métier complète des candidats reste à ajouter avant installation. |
| Moyenne | `televerserFichier()` vérifie le nom par inventaire puis envoie sans précondition de création. | Tester deux téléversements homonymes concurrents ; protéger l'envoi lui-même, pas seulement la liste préalable. |
| Moyenne | `distant:ouvrir` appelle migration et réconciliation de fichiers après tirage. | Distinguer consultation et mutations explicites avant une ouverture GitLab avec compte lecteur. |

Une suspension UI n'est pas une garantie serveur. De même, une copie locale
retrouvée dans un test de session ne prouve pas qu'un tirage d'ouverture ne
l'aura pas remplacée avant ce test. Ces frontières méritent leurs propres
régressions avant l'extraction des classes.

## 5. Frontières d'extraction repérées

| Emplacement | Couplage actuel | Première couture envisagée |
|---|---|---|
| `distant/miroir.ts`, `distant/installationMiroir.ts` | La lecture, le transfert et l'installation locale sont injectés ou séparés ; le manifeste v2 identifie la destination. | Ajouter la validation métier des candidats avant installation. |
| `distant/lecture.ts`, `lecteurWebDAV.ts`, `transfert.ts`, `transfertWebDAV.ts` | Les contrats de lecture et de transfert sont distincts, avec adaptateurs WebDAV sans publication. | Ajouter les adaptateurs GitLab à SHA fixé et LFS après stabilisation du miroir commun. |
| `distant/coordination.ts`, `observationVerrousWebDAV.ts` | Observation des badges séparée du tirage de contenu. | Étendre ce port avec prudence lors de l'injection de l'acquisition et de la publication sous droit. |
| `distant/sessions.ts` | Providers créés en interne, appels DAV et scans de verrous. | Coordination injectée avec publication sous droit détenu ; récupération locale séparée. |
| `distant/transactions.ts` | Providers, relectures et PUT mêlés aux mutations locales. | Préparer les opérations métier puis exécuter selon le connecteur, commande par commande. |
| `distant/publication.ts` | Création de dossiers et squelette WebDAV. | Création initiale spécifique, distincte du contrat général de publication. |
| `distant/coffre.ts`, `shared/distant.ts` | Compte monomorphe URL DAV/login, versions ETag publiques. | Destination discriminée et versions internes opaques, migrations compatibles. |
| `docsCadreDistant.ts` | Lectures directes via client DAV. | Lecteur borné indépendant du fournisseur, sans aspirer les docs dans le miroir. |
| `main/index.ts` | Les handlers spécialisés utilisent encore directement certains services du contexte. | Déplacer progressivement les intentions vers la façade et vérifier la génération capturée. |
| `distant/contexte.ts` | Première façade et fabrique Nextcloud : assemblage cohérent, actualisation, démarrage et fermeture. | Garder ce cycle commun tout en extrayant les ports de lecture, publication et coordination. |

La première façade est maintenant introduite sans interface universelle de
stockage. Elle assemble les services Nextcloud existants, protège la bascule et
ignore le résultat d'un tirage terminé après remplacement du contexte. Les
contrats spécialisés seront extraits avec le lecteur puis la coordination,
sans leur attribuer prématurément des garanties communes.

## 6. Qualification GitLab encore nécessaire

Pas de Docker accessible et ressources locales contraintes : ne pas installer
GitLab ni nettoyer le poste pour débloquer artificiellement le chantier.
Cible de banc : une instance, deux projets avec LFS activé/désactivé, deux comptes,
deux postes logiques. Une qualification sur l'instance institutionnelle reste
nécessaire après les essais reproductibles.

| Question | Vérification ciblée | État |
|---|---|---|
| Gardes des actions | Create exclusif ; update/delete/move périmés ; action invalide refusant tout le commit. | Non exécuté. |
| Locks V1 et REST | Commit sous verrou détenu par autrui, même compte sur deux postes, reprise puis ancien détenteur. | Code V1 inspecté ; serveur non testé. |
| Bail versionné candidat | Publication + mutation réelle du verrou, ancienne génération, renouvellement concurrent, réponse perdue. | Non exécuté ; option non sélectionnée. |
| Dépendances métier | Source lue mais non écrite, transaction corpus face à une session longue. | Non exécuté. |
| LFS média | Batch upload, objet, pointeur, association au projet et lecture binaire depuis le second compte sans push Git. | Download texte retrouvé en V1 ; parcours V2 non qualifié. |
| Détection | Réglage projet actif/inactif, 403, timeout, lecteur sans droit d'envoi, revérification. | Parcours décidé ; non implémenté. |
| OAuth institutionnel | Configuration disponible, scopes REST/LFS, renouvellement et certificat. | Parcours V1 inspecté ; instance non testée. |
| Coût | Commits de coordination, CI, limites de débit, mémoire et disque des médias. | Non mesuré. |

Aucun résultat fictif d'un faux serveur ne doit remplir la colonne des preuves
réelles. Aucun seuil de charge arbitraire ne remplace les volumes des équipes.

## 7. Résultats reproductibles de la première itération

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
- Aucun test sauté dans cette sélection ; les bancs serveurs réels et les E2E
  ne sont **pas sélectionnés**, et donc pas validés.
- La suite `test/webdav` complète donne **215 tests réussis et 21 sautés** :
  les six fichiers dépendant des bancs réels sont sautés faute de serveur.
- La suite globale a ensuite donné **1 190 tests réussis**, 21 sautés et trois
  suites non chargées (`archiveCorpus`, `exportDocx`, `exportDocxCorpus`) à cause
  de `jszip` absent du `node_modules` local. Les erreurs réseau Happy DOM pendant
  le démontage n'ont pas fait échouer d'autre suite.
- Vitest exécuté localement : 4.1.9. Aucune installation de dépendance effectuée.

### Vérification de types et environnement

`npm run typecheck` est bloqué par une dépendance absente du `node_modules`
existant : `pdfjs-dist` dans `ApercuPdf.vue` (TS2307).
La vérification main lancée séparément par
`./node_modules/.bin/tsc --noEmit -p tsconfig.node.json` signale aussi l'absence
de `jszip` et `docx` dans les modules d'archive/export.

Ces dépendances sont déclarées dans `package.json`, mais leur installation locale
est incomplète ; les fichiers concernés n'ont pas été modifiés dans cette
itération. Ne pas annoncer le typecheck vert ni lancer une réinstallation
sans tenir compte de la place disponible. Build et E2E non exécutés ; la suite
globale n'a pas été relancée après les dernières extractions.

## 8. Prochaine étape bornée

La façade, le lecteur injecté, l'observation séparée des verrous, le manifeste
v2, le journal d'installation locale et le transfert injecté sont en place.
La suite bornée est :

1. Ajouter la validation métier des candidats préparés avant leur installation.
2. Continuer à déplacer les intentions des handlers vers le contexte, en
   capturant le contexte de départ pour les commandes asynchrones.

En parallèle, reprendre la qualification GitLab dès qu'un moteur Docker doté
de ressources suffisantes ou un projet de test autorisé est disponible.
L'étude V1 est exploitable dès maintenant ; elle n'impose pas de toucher aux
sources V1 ni de réinstaller les services existants.
