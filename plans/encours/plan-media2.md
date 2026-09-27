# Médias distants — corpus GitLab et stockage WebDAV secondaire

**Statut : proposition d'architecture corrigée. Première phase : permettre à une
personne travaillant sur un corpus GitLab de choisir un fichier audio déjà présent
sur un stockage WebDAV, puis de le lire à distance pendant la correction de la
transcription. La lecture ne demande ni copie locale préalable, ni empreinte du
fichier. La vidéo utilise le même mécanisme lorsqu'elle est lisible par Chromium,
mais reste secondaire par rapport à l'audio.**

**Avancement : M1 et M2 livrés. M3 à M5 restent à faire.**

| Lot | État | Où |
|---|---|---|
| M1 — modèle et configuration locale | Livré : référence additive `fournisseur`, base média locale par destination GitLab, configuration testée depuis l'ouverture GitLab, résolution des médias retirée au miroir GitLab | `src/shared/format.ts`, `src/shared/gitlab.ts`, `src/main/medias/baseMedia.ts`, `src/main/distant/coffre.ts`, `src/main/distant/miroir.ts`, `src/renderer/components/accueil/CorpusDistant.vue` |
| M2 — contrat de transport | Livré : information `HEAD` avec repli `PROPFIND`, lecture de plage en flux validée, délai et annulation, sonde de capacité bornée et paresseuse | `src/main/webdav/lectureMedia.ts`, `src/main/webdav/client.ts`, `src/main/medias/capacite.ts` |
| M3 — désignation et publication GitLab | À faire | — |
| M4 — lecture distante audio | À faire | — |
| M5 — vidéo et validation applicative | À faire | — |

Deux conséquences assumées jusqu'à M3 : un entretien GitLab qui désigne un média
affiche encore l'état « média désigné sur le Nextcloud » et son bouton de
rapatriement, devenu sans effet sur ce fournisseur ; même avec une base média
déclarée, le geste de désignation n'est pas encore proposé sur un corpus GitLab.

Ce document remplace l'ancien plan média. GitLab reste le magasin du
corpus ; Nextcloud, Sharedoc ou un autre serveur WebDAV compatible peut devenir le
magasin des médias. Les deux destinations ont des identifiants et des droits
indépendants.

## 1. Décision

Ne pas utiliser GitLab LFS comme stockage principal des audios et vidéos. GitLab
porte les transcriptions, définitions, métadonnées et historiques de modification.

Chaque personne peut associer localement au corpus GitLab une **base de médias
WebDAV** avec son propre compte. Les références partagées dans les entretiens sont
des chemins relatifs à cette base. L'URL, l'identité et le secret WebDAV restent
sur le poste.

La première phase est limitée à la lecture :

- les personnes déposent elles-mêmes les fichiers sur Nextcloud ou Sharedoc ;
- Sonal permet de parcourir la base et de désigner un fichier existant ;
- Sonal publie seulement le chemin relatif dans l'entretien GitLab ;
- la lecture distante est choisie explicitement par la personne ;
- aucun téléversement ni aucune suppression distante n'est piloté par Sonal ;
- aucun téléchargement complet n'est nécessaire avant de commencer à travailler ;
- aucun cache local complet n'est créé automatiquement.

Un corpus GitLab sans base de médias reste pleinement utilisable. Une panne du
service de médias ne doit jamais bloquer l'accès à la transcription.

## 2. Parcours utilisateur

### 2.1 Déclarer la base de médias

À l'ouverture d'un corpus GitLab, la personne peut déclarer ou modifier :

```text
Médias distants

[ ] Utiliser un dossier WebDAV

URL du dossier : …
Identifiant : …
Mot de passe d'application : …
```

Cette déclaration est persistée localement et liée à la destination GitLab, y
compris sa branche et sa racine telles qu'elles participent déjà à l'identité de
la destination. Elle n'est jamais publiée dans le corpus.

La gestion du secret, l'obligation HTTPS, l'authentification HTTP Basic et les
mots de passe d'application réutilisent les mécanismes du connecteur WebDAV
existant. L'adresse et le secret saisis traversent uniquement l'IPC de
configuration vers le main ; ils ne sont jamais renvoyés par le coffre ni
exposés au parcours de lecture. La première phase ne prétend pas prendre en
charge tous les mécanismes d'authentification possibles de WebDAV.

Le test effectué à l'enregistrement vérifie la connexion et l'accès au dossier.
Une indisponibilité ultérieure est signalée sans empêcher l'ouverture du corpus.

### 2.2 Désigner un média

Depuis un entretien, la personne parcourt la base configurée et choisit un fichier.
Sonal vérifie que le chemin reste sous cette base, puis publie la référence dans
l'entretien GitLab selon les règles normales de session et de publication GitLab.

Aucun SHA-256 n'est calculé. La désignation ne doit jamais provoquer une lecture
complète du média.

Tous les comptes doivent configurer comme base le dossier partagé lui-même. Le
point de montage peut différer entre le propriétaire et les destinataires ; seul
le chemin interne au dossier partagé doit rester identique.

### 2.3 Lire le média

La personne choisit « Lire depuis le serveur ». Le lecteur reçoit une URL interne
opaque et le process main relaie les demandes de plages vers WebDAV. L'adresse et
les identifiants WebDAV ne sont jamais renvoyés au renderer par ce parcours.

L'audio est le parcours prioritaire. Pour une vidéo, Sonal tente le même parcours
si le format et le codec sont pris en charge par Chromium et si le serveur honore
les plages. La qualité de l'expérience dépend alors de la connexion ; aucune
mesure ponctuelle de débit ne devient une règle d'architecture.

Si les plages ne fonctionnent pas, Sonal arrête la réponse et annonce que la
lecture distante n'est pas disponible. Il ne télécharge pas silencieusement le
fichier entier.

## 3. Modèle de données

### 3.1 Référence partagée

La référence publiée dans l'entretien est volontairement minimale :

```json
{
  "meta": {
    "audioDistant": {
      "fournisseur": "webdav",
      "chemin": "audio/entretien-1.m4a"
    }
  }
}
```

Elle ne contient :

- ni URL ou nom d'instance ;
- ni identifiant de compte ou de magasin local ;
- ni secret ;
- ni politique de cache propre à une personne ;
- ni empreinte exigeant la lecture complète du média ;
- ni taille ou type qui deviendraient obsolètes si le fichier était remplacé.

La taille, le type MIME, l'ETag et la date de modification sont des observations
d'exécution. Ils sont relus sur le serveur et ne constituent pas l'identité
partagée du média.

### 3.2 Configuration locale

La configuration locale associe une destination GitLab à une base WebDAV. Sa
forme conceptuelle est :

```ts
interface BaseMediaWebDAVLocale {
  destinationGitLabId: string
  urlBase: string
  utilisateur: string
  secretDisponible: boolean
}
```

Le secret reste dans le coffre existant ou en mémoire lorsque le stockage sécurisé
n'est pas disponible. La structure exacte peut réutiliser une identité WebDAV déjà
connue, mais une base média ne doit pas apparaître comme un corpus WebDAV dans les
récents.

### 3.3 Compatibilité

Le champ historique `audioDistant: { chemin }` reste lisible :

- dans un corpus WebDAV, il continue à désigner un fichier du backend du corpus ;
- dans un corpus GitLab, il désigne un fichier de la base média locale une fois
  celle-ci configurée ;
- l'ajout de `fournisseur: "webdav"` est additif et permet aux nouvelles écritures
  d'exprimer explicitement le transport.

Le miroir GitLab ne doit plus chercher `audioDistant.chemin` dans le dépôt GitLab.
La résolution des médias d'un corpus GitLab appartient au module média secondaire.

Les références `audioRef` locales existantes restent valides et ne sont jamais
converties automatiquement.

## 4. Remplacement d'un fichier au même chemin

Le chemin relatif est l'identité fonctionnelle choisie par les personnes. Si le
fichier est remplacé au même chemin, la prochaine ouverture ou lecture utilise
automatiquement la nouvelle version. Aucune intervention dans GitLab n'est
nécessaire.

Une lecture en cours ne doit toutefois jamais assembler des plages provenant de
deux versions différentes :

1. le main observe l'ETag ou, à défaut, `Last-Modified` et la taille au début ;
2. les demandes suivantes utilisent un validateur conditionnel lorsque le serveur
   en fournit un ;
3. si la version change pendant la lecture, le flux courant est interrompu puis le
   lecteur est rechargé sur la nouvelle version.

L'ETag sert uniquement à garder une lecture cohérente. Il n'est ni publié dans le
corpus, ni utilisé comme identité durable du média.

## 5. Contrat de lecture WebDAV

### 5.1 Information sur le fichier

Le transport fournit une primitive d'information qui essaie `HEAD`, puis un
`PROPFIND` de profondeur 0 si nécessaire. Elle retourne, lorsqu'ils existent :

- taille ;
- type MIME ;
- ETag ;
- `Last-Modified`.

Une absence de type fiable n'est pas fatale. Le main choisit un type sûr à partir
du type annoncé et de l'extension ; la compatibilité réelle reste celle du lecteur
Chromium.

### 5.2 Lecture de plage

La primitive de plage accepte seulement :

- `bytes=debut-fin` ;
- `bytes=debut-`.

Les plages en suffixe et les plages multiples ne sont pas exprimables par son API.
Le corps est rendu comme flux ; il n'est jamais assemblé en mémoire.

Pour une demande de plage, le main contrôle :

- le statut `206` ;
- la syntaxe et la cohérence de `Content-Range` ;
- l'égalité entre la plage demandée et la plage annoncée ;
- la cohérence de `Content-Length` lorsqu'il est présent ;
- la quantité d'octets effectivement transmise ;
- la cohérence du validateur de version pendant la lecture.

Une réponse `200` à une demande de plage signifie que le serveur ignore la plage.
Le corps est annulé immédiatement : il n'est transmis ni au lecteur ni au disque.
Les réponses incohérentes, tronquées, trop longues, `416` inattendues ou arrivées
après un changement de version sont refusées.

### 5.3 Annulation et limites

Le changement de position, la fermeture de l'entretien ou le remplacement du
média annule la requête WebDAV correspondante. L'annulation du renderer est
propagée jusqu'au `fetch` du main. Le délai, la concurrence et la backpressure sont
gérés dans le main.

La sonde, contrairement au lecteur, lit au plus quelques kilo-octets en mémoire.
Le lecteur lui-même n'a pas besoin d'une limite de plage pour protéger la mémoire,
puisqu'il relaie le corps en flux.

## 6. Capacité mesurée sans écriture

La prise en charge des plages est une propriété de la base WebDAV utilisée avec un
compte donné. Elle a trois états :

```ts
type CapacitePlages = 'inconnue' | 'oui' | 'non'
```

Elle n'est pas ajoutée au profil du backend GitLab ni au profil de verrouillage du
corpus WebDAV. Elle vit dans le module média et est indexée par la configuration
locale de la base.

Aucun fichier jetable n'est créé. La capacité est mesurée paresseusement sur le
média choisi avec une petite plage réelle, à travers le même client que la lecture :

- `206` avec plage et corps exacts → `oui` ;
- `200`, réponse incohérente ou plage non honorée → `non` ;
- panne, authentification impossible ou délai dépassé → elle reste `inconnue` et
  l'indisponibilité est affichée.

L'en-tête `Accept-Ranges` n'est jamais utilisé comme preuve : il est absent sur les
deux serveurs déjà qualifiés alors que leurs plages fonctionnent.

## 7. Protocole interne Electron

Le renderer utilise une URL opaque, par exemple :

```text
sonal-media://distant/<identifiant-entretien>
```

Le chemin WebDAV ne figure pas dans cette URL. Le handler du process main :

1. vérifie que l'entretien appartient au corpus courant ;
2. relit sa référence partagée ;
3. résout la base WebDAV locale du corpus GitLab courant ;
4. valide le chemin relatif contre les remontées, séparateurs ambigus et encodages
   multiples ;
5. traduit la demande `Range` de Chromium ;
6. relaie le flux et les en-têtes validés ;
7. propage l'annulation.

Un changement de corpus invalide immédiatement les anciennes URLs. Le renderer ne
reçoit jamais le secret, l'URL WebDAV ou une URL signée.

Le protocole `sonal-media` existant continue de servir les fichiers locaux et les
formes d'onde. Un nouvel hôte opaque distingue les médias WebDAV relayés des
chemins locaux autorisés.

## 8. États d'interface

Le lecteur distingue au minimum :

- média local ;
- média WebDAV disponible, lecture distante proposée ;
- base média non configurée sur ce poste ;
- connexion ou authentification indisponible ;
- fichier absent ou renommé ;
- serveur ne prenant pas en charge les plages ;
- format ou codec non lisible ;
- fichier remplacé, lecteur en cours de rechargement.

L'état « base non configurée » indique qu'une référence existe et propose de
déclarer le dossier. Une erreur de média ne masque ni la transcription, ni les
commandes d'édition.

La première phase ne produit pas de forme d'onde pour un média WebDAV. Le bandeau,
le curseur temporel et le résumé thématique restent utilisables sans image de
forme d'onde.

## 9. Qualification déjà réalisée

Deux implémentations indépendantes ont été mesurées : une instance Sharedoc et le
Nextcloud du banc. Les deux acceptent l'authentification Basic avec mot de passe
d'application et servent des plages fermées ou ouvertes exactes.

| Comportement | Sharedoc | Nextcloud | Conséquence |
|---|---|---|---|
| Plage fermée | `206` exact | `206` exact | lecture par plages possible |
| Plage ouverte | `206` exact | `206` exact | lecture jusqu'à la fin possible |
| Plage en suffixe | renvoie le début du fichier | correcte | suffixes interdits |
| `Accept-Ranges` | absent | absent | capacité mesurée par un vrai `GET` |
| Type MIME | correct sur le média testé | correct | valeur contrôlée, jamais supposée |
| Authentification | Basic, mot de passe d'application | Basic, mot de passe d'application | mécanisme commun réutilisable |

Sur Sharedoc, une demande en suffixe reçoit un `206` syntaxiquement valide mais un
`Content-Range` décrivant le début du fichier. Les octets correspondent également
au début. Comparer la réponse exacte à la demande est donc une exigence du contrat,
pas une précaution théorique.

Les mesures de débit ne sont pas conservées comme capacité du serveur. Le confort
de lecture, surtout vidéo, dépend du réseau du poste au moment de l'utilisation.
Le lecteur et le buffering donnent le résultat réel sans seuil global arbitraire.

Les essais historiques de `PUT`, `MKCOL` et `DELETE` prouvent que les deux bancs
pourront servir à une phase d'écriture ultérieure. Ils ne font pas partie des
critères de sortie de la première phase.

## 10. Bancs et tests

### 10.1 Bancs

| Banc | Apport |
|---|---|
| Serveur WebDAV mémoire | erreurs et dialectes impossibles à provoquer sûrement sur un serveur réel |
| Nextcloud A, port 8080 | WebDAV réel avec le banc principal |
| Nextcloud B, port 8081 | WebDAV réel sans dépendance à `files_lock` |
| Sharedoc autorisé | qualification d'une seconde implémentation |
| GitLab du poste de maintenance | publication de la référence dans un entretien |

Les piles Docker existantes sont seulement démarrées ; aucune image n'est
retéléchargée ni reprovisionnée pour ces tests.

### 10.2 Variantes du serveur mémoire

- plages exactes ;
- plage ignorée avec réponse `200` et gros corps ;
- `Content-Range` différent de la demande ;
- corps tronqué ou plus long qu'annoncé ;
- `HEAD` refusé mais `PROPFIND` disponible ;
- `Accept-Ranges` absent ;
- ETag modifié entre deux plages ;
- `401`, `403`, `404`, `416`, délai et coupure ;
- réponse annulée après un seek.

### 10.3 Matrice de première phase

| Cas | Attendu |
|---|---|
| Audio avec plages | lecture immédiate sans copie complète préalable |
| Seek au milieu du média | nouvelle plage exacte, ancienne requête annulée |
| Réponse `200` à une plage | corps annulé, aucun téléchargement silencieux |
| Réponse incohérente Sharedoc simulée | refus explicite, aucun assemblage |
| Remplacement avant une nouvelle lecture | nouvelle version lue automatiquement |
| Remplacement pendant la lecture | flux interrompu puis lecteur rechargé |
| Base non configurée | transcription utilisable, action de configuration proposée |
| Service indisponible | transcription et travail GitLab intacts |
| Fichier absent | état normal et réessai possible |
| Vidéo prise en charge | lecture et seek par le même proxy |
| Vidéo trop lente ou codec refusé | erreur média non bloquante |
| Secret et URL | absents des IPC de lecture, logs et outils du renderer |

Un E2E doit piloter un véritable élément `<audio>`, lire puis effectuer plusieurs
seeks. Un test du client HTTP seul ne prouve pas le comportement de Chromium avec
le protocole Electron. Un E2E vidéo plus court valide au moins un format supporté.

Les tests réels s'ignorent si leur banc est absent, mais l'absence de qualification
est annoncée explicitement dans la sortie.

Les scénarios de téléversement, de publication après transfert, d'annulation et de
réconciliation après réponse perdue appartiennent à la phase d'écriture future.

## 11. Lots de réalisation

### M1 — Modèle et configuration locale

- ajouter la référence WebDAV additive sans `storeId`, cache, taille ni empreinte ;
- conserver la lecture des références historiques ;
- persister une base média locale liée à une destination GitLab ;
- réutiliser le coffre, l'authentification Basic et les règles HTTPS existantes ;
- distinguer une base média d'une destination de corpus WebDAV ;
- retirer au miroir GitLab la résolution des médias dans le dépôt GitLab.

### M2 — Contrat de transport

- ajouter l'information `HEAD` avec repli `PROPFIND` ;
- ajouter la lecture de plage rendue comme flux ;
- valider strictement `Content-Range` et la longueur réelle ;
- propager délai et annulation ;
- mesurer paresseusement la capacité sur le média choisi ;
- couvrir les dialectes du serveur mémoire et les deux piles Nextcloud.

### M3 — Désignation et publication GitLab

- parcourir la base média ;
- désigner un fichier sans le lire entièrement ;
- publier la référence dans la session GitLab de l'entretien ;
- gérer le fichier absent ou renommé comme un état normal ;
- afficher l'état « base non configurée sur ce poste ».

Cette étape écrit uniquement la petite référence dans GitLab. Elle n'effectue
aucune écriture WebDAV et ne comporte donc aucune transaction entre deux magasins.

### M4 — Lecture distante audio

- ajouter l'hôte opaque au protocole `sonal-media` ;
- brancher le lecteur audio sur le flux distant choisi par la personne ;
- propager les seeks et annulations ;
- recharger automatiquement un fichier remplacé ;
- conserver l'édition de la transcription pendant toute panne média ;
- ne produire ni forme d'onde ni copie locale automatique.

### M5 — Vidéo et validation applicative

- essayer la lecture vidéo avec le même proxy ;
- accepter uniquement les formats réellement lus par Chromium ;
- vérifier le comportement sur une connexion insuffisante sans inventer un seuil
  de débit global ;
- rejouer les E2E dans les binaires Linux et Windows ;
- rejouer le contrat sur Sharedoc autorisé.

La vidéo peut être reportée sans remettre en cause la sortie audio si les essais
Chromium ou réseau montrent qu'elle demande un traitement spécifique.

### M6 — Écriture WebDAV, hors première phase

Une phase ultérieure pourra ajouter téléversement, progression, reprise et
suppression. Elle devra publier la référence GitLab seulement après vérification du
transfert WebDAV. C'est à ce moment seulement que l'ordre entre les deux magasins
et les réponses perdues deviennent des sujets de transaction.

## 12. Critères de sortie

La première phase audio est acceptable lorsque :

- un corpus GitLab sans stockage média reste pleinement utilisable ;
- chaque poste peut associer son propre accès Nextcloud ou Sharedoc au corpus ;
- un fichier existant peut être désigné sans lecture complète ;
- l'audio commence à être lisible sans téléchargement complet préalable ;
- le seek utilise des plages validées et n'assemble rien en mémoire ;
- une réponse `200` à une demande de plage n'entraîne aucun téléchargement
  silencieux ;
- un fichier remplacé au même chemin est repris automatiquement ;
- une panne, un refus ou un fichier absent ne bloque jamais la transcription ;
- aucune empreinte complète n'est exigée ;
- après leur saisie de configuration, les secrets et l'URL WebDAV ne sont jamais renvoyés par le main ;
- les références WebDAV historiques des corpus Nextcloud restent fonctionnelles ;
- un E2E utilise réellement le lecteur Chromium et plusieurs seeks ;
- les tests Nextcloud et GitLab existants restent verts.

La vidéo est un critère complémentaire de M5, pas un prérequis à la livraison du
parcours audio.

## 13. Emplacement du code

| Emplacement | Responsabilité |
|---|---|
| `src/main/webdav/` | primitives de transport : information, plage streamée, erreurs typées, TLS, Basic, délai et annulation |
| `src/main/medias/` | configuration de la base locale, capacité mesurée, résolution de référence, cohérence de version et proxy |
| `src/shared/` | forme additive de la référence et contrats IPC sans secret |
| `src/main/index.ts` ou module de protocole extrait | hôte `sonal-media://distant/` et réponse streamée |
| renderer | choix de lecture distante et états du lecteur, sans connaissance de WebDAV |

Points d'intégration existants à traiter explicitement :

- `src/shared/format.ts` limite actuellement `audioDistant` au chemin Nextcloud ;
- `src/main/distant/miroir.ts` suppose actuellement que le média vit dans le même
  backend que le corpus ;
- `src/main/corpusStore.ts` résout aujourd'hui une désignation distante vers une
  copie locale du miroir ;
- `src/main/gitlab/politiqueGestes.ts` annonce actuellement
  `mediasPartages: false` pour GitLab ;
- le protocole `sonal-media` ne sert aujourd'hui que des fichiers locaux.

Les capacités de l'interface doivent distinguer la lecture d'un média référencé,
la désignation d'un fichier existant et le téléversement. Elles ne peuvent plus
être déduites du seul fournisseur du corpus.

## 14. Décisions retenues et points restant à préciser

Décisions retenues :

- la base WebDAV est locale au poste ;
- la référence partagée est un chemin relatif ;
- le remplacement au même chemin devient automatiquement la version courante ;
- aucune empreinte n'est calculée ;
- la lecture distante est un choix explicite ;
- aucun téléchargement complet ou cache automatique dans la première phase ;
- l'authentification réutilise le parcours WebDAV Basic existant ;
- l'audio est prioritaire et la vidéo est essayée sans bloquer sa livraison.

Deux choix d'interface restent à préciser avant M4 :

1. mémoriser ou non, par entretien et par poste, le choix « média local » ou
   « lecture depuis le serveur » ;
2. lorsque le serveur ne sait pas servir les plages, se limiter à un message
   d'indisponibilité ou proposer aussi une association manuelle avec un fichier
   déjà présent sur le poste.
