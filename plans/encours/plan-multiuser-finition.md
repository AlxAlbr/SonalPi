# Plan multi-utilisateur — finitions

> Le plan multi-utilisateur initial (architecture hybride miroir local + WebDAV) est
> achevé pour son chemin normal. La carte du code vit dans
> [docs/dev/multi-utilisateur.md](../../docs/dev/multi-utilisateur.md) et la documentation
> utilisateur dans
> [docs/user/multi-utilisateur.md](../../docs/user/multi-utilisateur.md).
>
> Ce plan porte les derniers cas limites de divergence. Le correctif empêchant la perte
> physique d'une copie est en place. Le chantier restant consiste principalement à rendre
> les conflits compréhensibles et résolubles sans décision silencieuse.

## 1. État actuel

### Réalisé

- Chaque copie de divergence porte un UUID :
  `sessions/<id>.divergence-<sessionId>.copie-<uuid>.json`.
- L'écriture refuse de remplacer une copie existante.
- Les anciens noms sans UUID restent lisibles.
- Deux publications 412 successives d'une même session conservent leurs deux contenus.
- Une session dégradée reste explicitement suivie jusqu'à son acquittement.
- Les lectures ordinaires ne prennent plus de verrou d'écriture.
- Les ouvertures d'édition, publications, battements et fermetures sont sérialisés.
- Les bascules de corpus et la fermeture de l'application attendent le nettoyage distant.
- Les transactions distantes et les suppressions d'entretien sont conditionnelles et
  réconciliables après une réponse perdue.
- Le miroir ne synchronise pas `sessions/` : les copies locales ne sont pas retirées par un
  tirage distant.

### Couverture existante utile

| Domaine | Banc |
|---|---|
| Cycle complet d'un verrou | `test/webdav/session.test.ts`, piles A et B |
| Divergence 412, création et lecture d'une copie | `test/webdav/session.test.ts` |
| Coexistence de deux copies sous le même `sessionId` | `test/webdav/session.test.ts` |
| Chemin heureux divergence → fusion → publication | `test/webdav/scenario-e3b-divergence.test.ts` |
| Fonctions pures de fusion actuelles | `test/e3b-fusion-reconciliation.test.ts` |
| Reprise après crash | tests de sessions et de verrous files_lock |
| Transactions de définitions et d'entretiens | `test/webdav/transactions.test.ts` |
| Fermeture, bascule et coutures renderer/main | tests de fermeture et de transition de contexte |

## 2. Priorité immédiate — identité stable des locuteurs

**Statut : réalisé.**

Cette évolution structurelle précède le gestionnaire de divergences. Elle est utile à tous les
futurs rapprochements et évite de continuer à créer des locuteurs uniquement identifiés par leur
position.

Le lot autonome livre :

- `Locuteur.id?: string` sans remplacement des index existants ;
- un UUID opaque attribué immédiatement à chaque nouveau locuteur ;
- un complément déterministe et idempotent des anciens locuteurs lors de leur première ouverture
  en écriture ;
- aucune sauvegarde déclenchée uniquement pour ce complément : les identifiants sont persistés
  avec la prochaine écriture normale ;
- la conservation des identifiants lors du remplacement d'une transcription ;
- l'attribution d'identifiants lors de l'import d'un nouvel entretien ;
- le même identifiant calculé sur deux postes partis du même entretien et du même index.

Le complément historique utilise un SHA-256 de l'identifiant de l'entretien et de l'ancien index.
Les nouveaux locuteurs utilisent un UUID. Les tests unitaires complets, le typecheck et le build
sont validés.

## 3. Décisions fonctionnelles du gestionnaire

### 3.1 Gestionnaire de divergences

La file implicite qui proposait uniquement la copie la plus récente est remplacée par un
**gestionnaire de divergences**.

Il présente :

- la version serveur actuelle ;
- toutes les copies locales de l'entretien, datées et ordonnées ;
- les différences structurées de chaque copie ;
- l'origine connue de chaque différence lorsque l'instantané de base le permet ;
- les choix nécessaires pour composer la version à publier.

Le gestionnaire est accessible de deux façons :

- automatiquement à l'ouverture d'un entretien concerné ;
- depuis un bouton « Divergences » avec compteur au niveau du corpus.

Le bouton et les fonctions de récupération ne sont visibles que lorsqu'un problème existe.
Le fonctionnement normal de l'application reste inchangé.

« Plus tard » ferme le gestionnaire sans retirer aucune copie. L'utilisateur peut choisir
librement la copie à examiner ; il n'est plus obligé de fermer et rouvrir l'entretien pour
drainer une pile.

### 3.2 Comparaison à trois versions

Les nouvelles sessions d'édition conservent la version commune qui sert de base à la session.
Une divergence peut alors comparer :

1. l'instantané de base ;
2. la version serveur actuelle ;
3. la copie locale.

L'instantané :

- ne contient que le JSON de l'entretien, jamais l'audio ou la vidéo ;
- n'entraîne aucune requête réseau supplémentaire, car l'ouverture sous verrou effectue déjà
  un GET frais ;
- est écrit localement et référencé par la session ;
- est dédupliqué par contenu ou ETag afin que plusieurs copies issues de la même base le
  partagent ;
- est supprimé après une fermeture normale dès qu'aucune session, copie ou résolution ne le
  référence ;
- est conservé après un crash ou une divergence ;
- est écrit atomiquement.

Le calcul des différences reste paresseux : il n'est lancé qu'à l'ouverture du gestionnaire.
Le chemin heureux ne paie donc que le coût local de conservation temporaire d'un JSON.

Les anciennes copies sans instantané restent compatibles. Elles utilisent une comparaison à
deux versions et le gestionnaire signale clairement que l'origine d'une absence ou d'une
modification est ambiguë.

### 3.3 Résolution des différences structurées

Aucune différence sémantique n'est résolue silencieusement.

Pour un élément présent dans la copie mais absent du serveur, le gestionnaire demande pour
chaque élément s'il faut :

- restaurer la version de la copie ;
- respecter son absence côté serveur ;
- laisser la décision en attente.

Avec un instantané de base, le gestionnaire distingue autant que possible un ajout local d'une
suppression distante. Sans base, il présente l'absence comme ambiguë.

Pour une même variable EAV modifiée différemment des deux côtés, le gestionnaire affiche :

- la cible et la variable ;
- la valeur de base lorsqu'elle est connue ;
- la valeur serveur ;
- la valeur de chaque copie concernée.

L'utilisateur choisit explicitement la valeur à conserver. Cette règle vaut pour les variables
générales et les variables de locuteurs.

La même discipline s'applique aux annotations, ancres, brouillons d'anonymisation,
pseudonymes déclarés et autres données structurées. Les éléments identiques sont dédupliqués ;
les modifications concurrentes restent à arbitrer.

### 3.4 Utilisation de l'identité stable dans les divergences

`Locuteur` reçoit un champ additif `id?: string` :

- les nouveaux locuteurs reçoivent immédiatement un identifiant opaque ;
- les anciens locuteurs sont complétés lors de leur première ouverture en écriture ;
- l'index reste la référence interne des blocs ProseMirror, des EAV, du journal, des requêtes
  et des imports/exports existants ;
- le gestionnaire apparie les locuteurs par identifiant lorsque celui-ci existe ;
- pour une ancienne version sans identifiant, le rapprochement par index et nom est présenté
  comme incertain et doit être confirmé ;
- une divergence structurelle de listes de locuteurs n'est jamais fusionnée automatiquement.

Cette évolution reste additive : elle ne provoque ni remplacement général des index ni bump de
format uniquement pour la fusion.

### 3.5 Transcriptions différentes

Le gestionnaire affiche les différences de transcription, mais ne fusionne pas automatiquement
le texte.

L'utilisateur choisit une transcription complète : serveur ou copie. Les annotations et ancres
de cette transcription sont conservées. Les éléments positionnels de l'autre transcription ne
sont pas injectés automatiquement, car leurs positions ne sont plus fiables.

Les métadonnées indépendantes du texte restent résolubles séparément. La copie non retenue reste
consultable jusqu'à la validation et à la publication de la résolution.

### 3.6 Validation et publication d'une résolution

Appliquer des choix dans le gestionnaire crée un brouillon local de résolution. Cela ne détruit
aucune copie source.

Avant publication :

1. Sonal acquiert le verrou d'entretien ;
2. relit la version serveur ;
3. vérifie que la comparaison utilisée est encore valable ;
4. publie avec `If-Match`.

Les copies sources, l'instantané et le brouillon ne sont nettoyés qu'après confirmation de la
publication serveur.

Si un nouveau 412 survient :

- le brouillon composé est conservé comme nouvelle proposition locale ;
- la nouvelle version serveur est chargée ;
- le gestionnaire recalcule les différences ;
- les choix déjà effectués sont conservés lorsqu'ils restent applicables ;
- aucune source n'est supprimée avant la publication finalement confirmée.

## 4. Copies dont l'entretien a été supprimé

Une copie liée à un entretien absent du membership reste un artefact local récupérable. Elle est
visible dans le gestionnaire au niveau du corpus, mais ne peut pas être fusionnée vers un fichier
absent.

Les choix proposés sont :

- conserver la copie ;
- l'exporter ;
- la jeter explicitement.

La restauration directe de l'entretien supprimé n'est pas proposée depuis ce dialogue, afin de
ne pas annuler implicitement la suppression réalisée par un autre utilisateur.

### 4.1 Exports de récupération

Deux exports sont disponibles uniquement depuis le parcours de récupération :

- un paquet complet `*.sonal-recup.json` ;
- un export `.sonal` pour l'interopérabilité habituelle.

Le paquet de récupération est un format public versionné, distinct du JSON interne brut. Il
contient au minimum :

- le type et la version du paquet ;
- les données complètes de l'entretien ;
- le titre et l'identifiant d'origine ;
- les informations de la copie et, lorsqu'il existe, son instantané de base ;
- les définitions de catégories et de variables nécessaires à l'interprétation des données.

### 4.2 Import d'un paquet de récupération

Sonal accepte l'import d'un `*.sonal-recup.json` et :

1. valide intégralement sa structure et sa version au runtime ;
2. affiche un aperçu avant toute écriture ;
3. propose de créer un nouvel entretien ou de rapprocher le paquet d'un entretien existant ;
4. génère un nouvel identifiant en cas de collision ;
5. présente les catégories et variables absentes ou contradictoires ;
6. n'utilise jamais automatiquement une référence audio locale non vérifiée ;
7. exécute l'import sous les mêmes garanties transactionnelles que les autres créations et
   imports d'entretien.

L'import arbitraire du JSON interne n'est pas exposé.

## 5. Interaction avec la reprise après crash

Lorsqu'un corpus contient à la fois des verrous orphelins et des copies de divergence :

1. le dialogue de reprise après crash est présenté en premier ;
2. « Reprendre et publier » ou « Abandonner » traite le verrou sans retirer les copies ;
3. « Plus tard » laisse le verrou et les copies intacts ;
4. après traitement des verrous, le compteur de divergences est actualisé ;
5. le gestionnaire est ensuite proposé lors de l'ouverture de l'entretien concerné.

Une copie de divergence n'est jamais prise pour le contenu à publier automatiquement lors de la
reprise d'un verrou orphelin.

## 6. Travail d'implémentation restant

### A. Modèle de persistance

- Définir le manifeste ou l'enveloppe associant session, copie, instantané de base et brouillon
  de résolution.
- Conserver la lecture des copies historiques nommées sans UUID ou sans métadonnées de base.
- Ajouter les écritures atomiques et le comptage de références des instantanés.
- Nettoyer les instantanés non référencés après fermeture normale.
- Préserver les artefacts nécessaires après crash, délai dépassé ou publication incertaine.

### B. Moteur pur de comparaison et de résolution

- Comparer base, serveur et copie par identité stable.
- Classer ajouts, suppressions et modifications concurrentes.
- Produire des décisions explicites et sérialisables.
- Détecter les conflits EAV par cible et identifiant de variable.
- Traiter les locuteurs avec identifiant, puis avec un rapprochement incertain pour les anciens
  fichiers.
- Afficher les différences de texte sans tenter de remapper automatiquement les positions.
- Construire un nouveau fichier à partir des décisions sans modifier les entrées.
- Garantir l'idempotence d'une décision rejouée.

### C. Interface du gestionnaire

- Ajouter le bouton et le compteur au niveau du corpus.
- Ajouter l'ouverture automatique pour l'entretien courant.
- Lister toutes les copies et leurs états : à traiter, résolution préparée, publiée ou
  publication à reprendre.
- Présenter les différences et recueillir les choix par élément.
- Signaler les comparaisons ambiguës sans instantané de base.
- Gérer « Plus tard » sans perte de sélection.
- Gérer les copies d'entretiens supprimés avec conserver, exporter ou jeter.
- Ne montrer les outils techniques de récupération qu'en présence d'un incident.

### D. Publication et reprise

- Publier le brouillon sous verrou depuis un GET frais.
- Revalider ou recalculer les décisions si le serveur a changé.
- Préserver le brouillon et les sources après un nouveau 412.
- Nettoyer uniquement après succès confirmé ou réconcilié.
- Ordonner reprise de crash puis gestion des divergences.

### E. Import et export de récupération

- Définir le schéma versionné de `*.sonal-recup.json`.
- Ajouter sa validation runtime stricte.
- Exporter sans référence audio dangereuse ou ambiguë.
- Importer sous transaction avec aperçu, gestion des identifiants et rapprochement des
  définitions.
- Proposer également l'export `.sonal` depuis le gestionnaire.

## 7. Cas de test restants

### Serveur WebDAV embarqué

1. **Chemin heureux sans divergence**
   - aucun calcul de diff ;
   - aucune requête réseau supplémentaire ;
   - instantané supprimé à la fermeture ;
   - aucun bouton de récupération visible.

2. **Cycle de vie des instantanés**
   - création à l'ouverture d'édition ;
   - partage d'une même base entre plusieurs copies ;
   - conservation après crash ou divergence ;
   - nettoyage après publication confirmée ;
   - reprise après interruption pendant une écriture ou un nettoyage.

3. **Divergences enchaînées dans un même lancement et après redémarrage**
   - C1 et C2 coexistent ;
   - les deux sont visibles dans le gestionnaire ;
   - chaque différence peut être retenue ou rejetée ;
   - la résolution cumulée ne crée aucun doublon.

4. **Fusion puis nouveau 412**
   - le brouillon et les copies sources restent présents ;
   - les choix encore valables sont conservés ;
   - les nouvelles différences sont proposées ;
   - la seconde publication réunit les apports retenus sans duplication.

5. **Traitement partiel d'une pile**
   - jeter C1 ne retire pas C2 ;
   - remettre C2 à plus tard conserve son état ;
   - le compteur reste exact ;
   - une copie publiée disparaît seulement après confirmation serveur.

6. **Sémantique à trois versions**
   - ajout local ;
   - suppression distante ;
   - modification concurrente du même élément ;
   - conflit EAV général et par locuteur ;
   - locuteurs avec identifiants stables ;
   - rapprochement incertain d'anciens locuteurs ;
   - choix d'une transcription complète lorsque les textes diffèrent ;
   - comparaison ambiguë d'une ancienne copie sans base.

7. **Entretien supprimé**
   - le tirage retire l'entretien sans toucher aux copies ;
   - aucune fusion vers un fichier absent n'est possible ;
   - conserver, exporter et jeter ont chacun un résultat net ;
   - le paquet de récupération exporté est réimportable ;
   - l'import gère collision d'identifiant, définitions absentes et référence audio invalide.

8. **Crash et divergences existantes**
   - le dialogue des verrous orphelins apparaît avant le gestionnaire ;
   - reprendre, abandonner ou remettre à plus tard préserve les copies ;
   - aucune copie n'est publiée automatiquement comme contenu de reprise.

### Coutures renderer/main

- Le compteur apparaît et disparaît avec l'état réel des copies.
- L'ouverture automatique ne se déclenche que pour l'entretien concerné.
- Les décisions restent présentes après fermeture et réouverture du gestionnaire.
- Une rétrogradation immédiate pendant la publication fige l'écriture sans perdre le brouillon.
- Les exports de récupération ne sont pas visibles sur le chemin normal.
- Une erreur d'import n'écrit ni membership, ni entretien, ni définition partielle.

### Piles Docker A et B

1. **Divergence d'entretien et transaction `corpus.json` concurrente**
   - une règle d'anonymisation est publiée pendant la session divergente ;
   - le tirage, la réconciliation de portée et le gestionnaire ne se masquent pas ;
   - la résolution finale contient les décisions retenues des deux mécanismes.

2. **Trois postes**
   - Max tient le verrou ;
   - Olivier contourne et modifie le fichier ;
   - Marie tire pendant l'incident ;
   - Max reçoit un 412 et lui seul crée une copie locale ;
   - aucun poste n'observe un état intermédiaire incohérent ;
   - les badges et verrous finaux sont cohérents.

3. **Publication d'une résolution puis nouvelle divergence**
   - rejouer le cycle complet contre files_lock et contre les verrous applicatifs ;
   - vérifier la conservation des artefacts tant que le commit n'est pas confirmé.

Les piles Docker existantes doivent seulement être démarrées avec les commandes du projet. Les
images et volumes ne doivent jamais être retéléchargés ou reprovisionnés.

## 8. Ordre de réalisation

1. **Réalisé :** identité stable des locuteurs et validation complète.
2. Définir le schéma des instantanés, copies et brouillons de résolution.
3. Écrire le moteur pur de comparaison à trois versions et ses tests.
4. Construire le gestionnaire et son compteur.
5. Brancher publication, nouveau 412 et nettoyage après confirmation.
6. Ajouter les copies orphelines et les exports de récupération.
7. Ajouter l'import versionné `*.sonal-recup.json`.
8. Couvrir les interactions crash/divergence sur le banc embarqué.
9. Terminer par les scénarios concurrents sur les piles Docker A et B.
