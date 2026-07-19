# Plan multi-utilisateur — SonalAsynchro (architecture hybride miroir local + WebDAV)

> Incarnation de l'étape « Multi-utilisateur (verrous) » différée depuis [DEMARRAGE.md](../DEMARRAGE.md)
> (piste C de [BILAN.md](../BILAN.md)), dans le cadre posé par [MODELE_OBJET.md](MODELE_OBJET.md) :
> concurrence = **verrou par fichier, un écrivain à la fois**.
>
> **Révision (2026-07-19)** : la première version de ce plan faisait travailler l'app directement
> dans un dossier synchronisé par le client Nextcloud Desktop, et se battait contre la latence de
> propagation (verrous probabilistes à revendications + élection). Cette version retient
> l'architecture **hybride** : le corpus de référence vit sur le serveur Nextcloud, chaque poste
> travaille sur un **miroir local**, et le cycle **verrou → téléchargement → travail local →
> téléversement → déverrouillage** parle **directement au serveur en WebDAV**. Deux variantes de
> verrou selon que le plugin [files_lock](https://github.com/nextcloud/files_lock) est installé
> (variante A) ou non (variante B) — les deux sont **atomiques**, car c'est le serveur qui tranche.
> L'ancien protocole « dossier synchronisé » est relégué en annexe pour les transports non-WebDAV.

---

## 1. Pourquoi l'hybride (ce que le modèle checkout/checkin dissout)

Travailler dans un dossier synchronisé exposait à quatre menaces ; les voici revisitées :

| Menace (régime « dossier synchronisé ») | En hybride WebDAV |
|---|---|
| **Latence de propagation inconnue** : on ne sait jamais si sa copie locale est fraîche ni quand ses écritures arrivent | **disparaît par construction** : après le verrou, on télécharge la version serveur (autoritaire) ; on publie *avant* de déverrouiller → le suivant lit forcément notre version. Le verrou couvre tout le cycle lecture-modification-écriture |
| **Aucune primitive atomique inter-machines** dans un dossier | WebDAV en fournit : `PUT` conditionnel `If-None-Match: *` = **test-and-set atomique côté serveur** (§5). Deux demandes « vraiment en même temps » → le serveur n'en accepte qu'une, même sans plugin |
| **Copies de conflit** fabriquées par le client de synchro | plus de client de synchro sur ce dossier : l'app est le seul canal. Le résidu (édition via l'UI web, forçage de verrou) est intercepté par `If-Match` à la publication (§6) |
| **Horloges non fiables** | ne servent plus qu'à des décisions grossières (péremption de verrou, à la minute près) — plus jamais à départager deux prétendants |

Ce que ça coûte, assumé : une petite couche **miroir** (téléchargement incrémental par ETags, §3),
une **visibilité différée** du travail des autres (atténuée par la publication périodique, §4.3),
et la configuration d'un **compte** par utilisateur. En échange : plus aucune dépendance au client
Nextcloud Desktop, une histoire de crash saine (§4.5), et le même niveau de sûreté avec ou sans
plugin.

## 2. Topologie

```
Serveur Nextcloud (référence)              Poste (par machine)
  …/MonCorpus/                               userData/miroirs/<corpusId>/
    corpus.json                                corpus.json                ← miroir
    entretiens/<id>.json                       entretiens/<id>.json      ← miroir
    verrous/<id>.lock.json   (variante B)      audio/<id>.*              ← LOCAL PUR : audio ET onde,
    presence/<user>.json     (E4)                                           jamais poussés (§3.3)
                                               .manifeste.json           ← ETags vus (local pur)
                                               sessions/<id>.json        ← copie de travail (local pur)
```

- **Le miroir vit dans `userData`**, jamais dans une zone synchronisée par un client desktop —
  sinon deux transports se marchent dessus (piège n°1, à documenter et à détecter : refuser un
  chemin contenant un dossier `.sync-exclude.lst`/config Nextcloud).
- **`CorpusStore` ne change presque pas** : il opère sur le miroir exactement comme sur le dossier
  d'aujourd'hui (mêmes chemins, mêmes écritures atomiques, mêmes `.bak`). Toute la nouveauté tient
  dans une couche `MiroirWebDAV` (process main) : `tirer()` (pull incrémental), `publier()` (push
  d'un fichier), et le `VerrouProvider` (§4-§5). Le renderer ne voit rien de tout ça.
- **Compte** : URL serveur + login + **mot de passe d'application** (jamais le mot de passe
  principal), stockés via `safeStorage` d'Electron dans `userData`. Chemin distant du corpus saisi
  ou choisi par navigation WebDAV. NB : un dossier **partagé** Nextcloud apparaît à un chemin
  propre à chaque compte (`/remote.php/dav/files/<user>/…`) — la config est donc par utilisateur,
  c'est normal.
- **Un corpus local « classique » reste possible** : `VerrouAucun` + pas de miroir = le
  comportement actuel, inchangé (défaut).

## 3. Le miroir (lecture du corpus)

### 3.1 Pull incrémental

À l'ouverture du corpus (et sur « Actualiser », et avant toute acquisition de verrou) :
`PROPFIND Depth: 1` sur `MonCorpus/` et `entretiens/` → `getetag` par fichier, comparés au
`.manifeste.json` local → `GET` des seuls fichiers changés, suppression locale des disparus
(déplacés vers une corbeille du miroir, jamais effacés). Les JSON sont petits : le pull complet
d'un corpus de 50 entretiens reste sous la seconde sur un lien correct.

### 3.2 Fraîcheur des vues

Les vues corpus (cartes, matrice, table de données) sont déjà des requêtes sans cache : après un
pull, une re-requête suffit. Pas de watcher fichier ici — le déclencheur est le pull (ouverture,
action utilisateur, minuterie douce ~60 s quand l'écran Corpus est affiché, et notification de
publication §4.3).

### 3.3 Audio et forme d'onde : entièrement locaux

Le coloriage thématique de la forme d'onde n'est **pas dans le PNG** : le PNG est l'enveloppe
neutre ([waveform.ts](../src/renderer/audio/waveform.ts)), et les couleurs sont un **calque**
dérivé par requête (`resumesThematiques` : annotations de l'entretien + couleurs du codebook) —
deux ingrédients qui voyagent **déjà** dans `entretiens/<id>.json` et `corpus.json`. La bande
coloriée s'affiche donc chez tous **sans rien partager de plus** : il suffit que chaque poste ait
le fond d'onde, et celui-ci est un dérivé que chaque poste sait fabriquer depuis son audio
(`regenererOndesManquantes` le fait déjà en fond dès qu'un audio est présent sans onde).

Hypothèse de travail assumée : **chaque utilisateur dispose des mêmes fichiers audio** (transmis
par le canal de son choix — clé USB, un dossier Nextcloud à côté du corpus… l'app n'en fait pas
son affaire). D'où :

- **`audio/` est local pur** (audio ET PNG) : rien de binaire ne transite par le serveur, le
  dossier distant ne contient que du JSON (+ verrous/présence).
- `meta.audioRef` reste dans le JSON partagé. Sur un poste qui n'a pas (encore) le fichier :
  carte et calque thématique affichés normalement mais **sans fond d'onde**, lecteur désactivé
  avec message net + action « **Associer l'audio local…** » (copie le fichier fourni dans le
  miroir sous le nom attendu `audio/<id>.<ext>` — sans toucher au JSON ni au serveur) ; l'onde
  est alors régénérée automatiquement et tout redevient identique aux autres postes.
- `assignerAudio` (première assignation, qui écrit `audioRef`) modifie le JSON de l'entretien →
  sous verrou de l'entretien, comme toute écriture ; la copie audio et le PNG, eux, restent dans
  le miroir local.

## 4. Le cycle de vie d'une session d'écriture (commun aux deux variantes)

### 4.1 Ouverture d'un entretien en écriture

1. **Acquérir le verrou** (§5 ou §6). Refus → ouverture en **lecture seule** + affichage du
   détenteur (qui, depuis quand). Fin.
2. **`GET` du fichier** depuis le serveur (pas confiance au miroir : c'est la version d'après-verrou
   qui fait foi) ; mémoriser son **ETag** — il servira de garde à la publication. Écrire dans le
   miroir, ouvrir.
3. Cas hors ligne / serveur injoignable : §4.6.

### 4.2 Pendant la session

- **Autosave inchangé** (600 ms, [useEntretien.ts:359](../src/renderer/composables/useEntretien.ts#L359)) :
  il n'écrit que le miroir local — aucune contrainte réseau, aucun churn serveur.
- **Battement du verrou** : rafraîchissement périodique (§5.3/§6.3) pour que les autres voient un
  verrou « vivant ».

### 4.3 Publication périodique (recommandée, réglable)

Toutes les N min (défaut proposé : 5) et sur « Publier maintenant » : `PUT` du fichier **sous
verrou toujours tenu**, avec `If-Match: <etag courant>` ; mémoriser le nouvel ETag. Les autres
postes voient ainsi le travail en cours (lecture seule fraîche au prochain pull) et un crash ne
laisse en souffrance que quelques minutes. L'UI affiche l'état de session : **publié** /
**modifications locales non publiées (depuis HH:MM)**.

### 4.4 Fermeture

1. Flush de l'autosave → `PUT` final avec `If-Match` → vérifier le succès.
2. **Puis seulement** libérer le verrou.
3. `PUT` refusé `412` (quelqu'un a contourné le verrou : édition via l'UI web, forçage §5.4) →
   **ne pas écraser** : filets §6.

L'ordre publication-puis-déverrouillage est l'invariant central du protocole : un verrou ne se
libère jamais sur un contenu non publié (sauf abandon explicite de l'utilisateur).

### 4.5 Crash et reprise

Après un crash : la copie de travail locale (`sessions/<id>.json`) a les dernières modifications
(600 ms max), et le verrou est **toujours tenu** côté serveur. Au redémarrage, l'app détecte la
session interrompue → dialogue « reprendre et publier / examiner / abandonner (déverrouille sans
publier, la copie locale part en divergence §6) ». Personne n'a pu écraser entre-temps : le crash
est le scénario où ce modèle brille.

### 4.6 Hors ligne

- Serveur injoignable à l'ouverture : **lecture seule** depuis le miroir (proprement daté :
  « copie du JJ/MM HH:MM »), ou « éditer hors ligne à mes risques » (pas de verrou — choix
  explicite, jamais silencieux).
- Retour en ligne d'une édition hors ligne : acquérir le verrou, `GET`, comparer à la version de
  départ (ETag mémorisé au dernier pull) — inchangée → publier normalement ; changée → divergence
  + fusion assistée (§6).
- Coupure **en cours de session** verrouillée : continuer localement, réessayer battement et
  publication en tâche de fond ; avertir si le verrou a pu périmer (§5.4) — au retour, revalider
  le verrou avant le `PUT` final.

### 4.7 `corpus.json` : transactions courtes + désamorçage du point chaud

Deux mesures :

- **Désamorçage (préalable, vaut aussi pour le mono-utilisateur)** :
  [corpusStore.ts:155-162](../src/main/corpusStore.ts#L155-L162) réécrit `corpus.json`
  (`membership.lastModified`) à **chaque** sauvegarde d'entretien. En hybride, publier un entretien
  obligerait donc à prendre aussi le verrou corpus à chaque fermeture. Correctif :
  `ecrireEntretien`/`poserValeur`/`assignerAudio` ne touchent plus `corpus.json` ; le
  `lastModified` affiché par les cartes est dérivé du fichier entretien lui-même
  (`chargerEntretiens` l'a déjà en main). Le membership n'est écrit que par : création, import,
  renommage, suppression.
- **Transactions de définitions** (codebook, variables, règles corpus, membership) : verrou corpus
  → `GET corpus.json` → transform pur (`shared/corpus`) → `PUT If-Match` → déverrouillage, le tout
  **par commande** (~2 allers-retours serveur, imperceptible à cette fréquence). Verrou refusé →
  « définitions en cours de modification par X ». `supprimerEntretien` exige verrou corpus **et**
  verrou de l'entretien ; côté serveur, `MOVE` vers `corbeille/` (atomique), miroir aligné au pull.

## 5. Variante B — verrou par fichier à PUT conditionnel (sans plugin)

Présentée en premier car c'est la **base commune** : elle fonctionne sur tout Nextcloud (et tout
serveur WebDAV correct), la variante A n'étant qu'un raffinement quand le plugin est là.

### 5.1 Le principe

`verrous/<id>.lock.json`, créé par `PUT` avec l'en-tête **`If-None-Match: *`** : le serveur ne
l'accepte que si le fichier **n'existe pas** — sinon `412 Precondition Failed`. C'est un
test-and-set atomique : deux demandes strictement simultanées → le serveur en sert une, l'autre
reçoit `412`. Le problème « vraiment en même temps » de l'ancien plan n'existe plus.

```jsonc
// verrous/ent-abc123.lock.json
{ "userId": "max", "machineId": "portable-max", "sessionId": "s-a1b2c3d4",
  "acquiredAt": "2026-07-19T10:02:11Z", "refreshedAt": "2026-07-19T10:07:11Z",
  "ttl": 300 }
```

### 5.2 Opérations

| Opération | Requête | Résultat |
|---|---|---|
| Acquérir | `PUT verrous/<id>.lock.json` + `If-None-Match: *` | `201` = obtenu (mémoriser l'ETag) ; `412` = tenu → `GET` du fichier pour afficher qui |
| Battement | `PUT` du même fichier (refreshedAt) + `If-Match: <etag>` | `412` = notre verrou a été forcé entre-temps → se rétrograder immédiatement (§5.4) |
| Libérer | `DELETE` + `If-Match: <etag>` | idempotent côté app |
| Forcer (périmé) | `DELETE If-Match: <etag observé>` puis `PUT If-None-Match: *` | atomique : deux forçages simultanés → un seul gagne chaque étape |

Le battement `If-Match` fait double emploi utile : c'est à la fois la preuve de vie et la
**détection de forçage** — un détenteur dont le verrou a été repris l'apprend au battement suivant
(≤ 60 s), passe en lecture seule et ses modifications non publiées partent en divergence (§6).

### 5.3 Cadences et péremption

Battement 60 s ; `ttl` 300 s ; verrou **périmé** quand `refreshedAt` accuse plus de `ttl` + marge
de dérive (120 s — les horloges n'ont besoin d'être justes qu'à la minute). Périmé → l'UI propose
« Forcer » avec dialogue (qui, depuis quand, risques). Verrous orphelins > 24 h : nettoyés
silencieusement à l'ouverture du corpus.

### 5.4 Sonde serveur

À la configuration du corpus partagé, l'app **vérifie le contrat** sur le serveur réel : séquence
`PUT If-None-Match: *` (attendu `201`) → même `PUT` (attendu `412`) → `PUT If-Match` bon puis
mauvais ETag (`2xx` puis `412`) → `DELETE`. Un serveur qui échoue à la sonde est refusé pour la
variante B (et le cas est loggé) — on ne construit pas un verrou sur un serveur qui ignore les
préconditions.

### 5.5 Limites (vs variante A)

Le verrou est **conventionnel** : invisible dans l'UI web de Nextcloud, non imposé par le serveur
(quelqu'un peut modifier `entretiens/<id>.json` via le web malgré lui). Les deux points sont
couverts : le premier par la présence (§8), le second par `If-Match` à la publication (§6).
Déblocage administrateur = supprimer le fichier verrou (documenté).

## 6. Filets de non-perte (rôle réduit, mais conservés)

Le protocole étant correct, les filets ne couvrent plus que les contournements : édition via l'UI
web, forçage de verrou, édition hors ligne assumée, restauration serveur d'une vieille version.

1. **`If-Match` sur toute publication** (§4.3/§4.4) : un `412` signifie que la version serveur
   n'est plus celle obtenue sous verrou → jamais d'écrasement ; la version locale est sauvée en
   `sessions/<id>.divergence-<sessionId>.json` (local, hors serveur) + dialogue.
2. **Fusion assistée** : les charges utiles sont largement fusionnables par construction —
   annotations/ancres/locuteurs par id, valeurs EAV par (cible, idVar), `corpus.json` en `Record`
   par id (mécanique `fusionnerImport` existante,
   [corpusStore.ts:212](../src/main/corpusStore.ts#L212)). Politique : `corpsTexte` identique →
   fusion automatique proposée des annotations ; `corpsTexte` différent → choix par fichier (pas de
   merge de texte au set minimum). Divergences réelles sur `corpus.json` (renommage concurrent
   d'une même catégorie) → dialogue — « rien de tranché en silence ».
3. **`auteur`** sur `Annotation` (champ existant) enfin alimenté par `userId` (§7) — la matière
   première de toute réconciliation lisible.

> Formulation de la garantie, pour la doc utilisateur : *le verrou rend le conflit impossible dans
> l'app et improbable en dehors ; quoi qu'il arrive, une perte silencieuse est impossible — au pire
> un dialogue de réconciliation.*

## 7. Identité

```jsonc
// config app (userData), demandée à la première connexion d'un corpus partagé
{ "userId": "max",              // affichable ; par défaut le login Nextcloud
  "machineId": "portable-max",  // généré, modifiable
  "sessionId": "s-…" }          // aléatoire PAR OUVERTURE — un verrou n'est jamais hérité
```

## 8. Variante A — files_lock (raffinement recommandé quand disponible)

- **Détection** : `GET /ocs/v1.php/cloud/capabilities` → clé `files.locking` (ex. `"1.0"`).
  Présente → la variante A remplace la B pour le verrou **des fichiers de données** (le protocole
  §4 est inchangé ; seul le `VerrouProvider` diffère).
- **Primitives** (vérifiées sur le dépôt files_lock) :

| Opération | Requête | Notes |
|---|---|---|
| Verrouiller | `LOCK /remote.php/dav/files/<user>/<chemin>` + `X-User-Lock: 1` | `200` = obtenu ; `423` = tenu. Type 0 (« user owned manual lock ») |
| Déverrouiller | `UNLOCK …` + `X-User-Lock: 1` | `423` = tenu par un autre ; `412` = pas verrouillé |
| État | `PROPFIND` ns `http://nextcloud.org/ns` : `lock`, `lock-owner`, `lock-owner-displayname`, `lock-time`, `lock-timeout` | alimente l'UI (qui, depuis quand) |

- **Ce que A apporte de plus que B** : le verrou est **visible** dans l'UI web et les clients
  Nextcloud (cadenas), et **imposé par le serveur** (une modification via le web est rejetée →
  le filet §6.1 ne devrait plus jamais se déclencher) ; déblocage par le détenteur, le propriétaire
  du fichier (UI web) ou l'admin (`occ files:lock --unlock`).
- **Péremption** : par défaut les verrous files_lock **n'expirent pas** (`lock-timeout: 0`).
  Doc admin : `occ config:app:set --value '3600' files_lock lock_timeout` (1 h). Battement =
  re-`LOCK` périodique (période `lock-timeout/3`, sinon 5 min). L'app garde sa propre notion de
  « périmé » (via `lock-time`) pour proposer le forçage même sur un serveur sans timeout.
- Le verrou **corpus** (§4.7) et les fichiers `presence/` peuvent rester en variante B même quand A
  est active (transactions courtes, la visibilité web n'y apporte rien) — un seul code de plus haut
  niveau, deux providers interchangeables par ressource.

## 9. Présence (E4, best effort)

`presence/<userId>-<machineId>.json` (`{ userId, entretienOuvert?, refreshedAt }`), `PUT` toutes
les 60 s, purge > 10 min. Purement informatif : badges « ouvert par Olivier » sur les cartes et les
lignes de la table de données (le « verrou par ligne » anticipé par D-S11 de [SUITE.md](../SUITE.md)).
Jamais utilisé pour décider — la décision, c'est le verrou. En variante A, l'essentiel (qui tient
quoi) vient déjà du PROPFIND ; la présence n'ajoute que « consulte sans verrou ».

## 10. UI

- États affichés partout où l'on ouvre : **libre** / **tenu par moi (autre session)** /
  **tenu par X depuis HH:MM** / **périmé** (+ bouton Forcer, confirmé).
- Tenu par autrui → **lecture seule** (éditeur non éditable, commandes de domaine désactivées —
  un seul chemin d'écriture, comme aujourd'hui ; sortir de l'entretien le ferme déjà, D-S11).
- **Statut de session** dans l'entretien ouvert : publié / non publié depuis HH:MM + « Publier
  maintenant » ; indicateur hors-ligne.
- Écran Corpus : horodatage du dernier pull + « Actualiser ».

## 11. Étapes de mise en œuvre (chacune livrable et testable)

| Étape | Contenu | Dépend de |
|---|---|---|
| **E0 — Couche WebDAV + miroir lecture** | client WebDAV minimal (fetch Node, zéro dépendance lourde : PROPFIND/GET/PUT/DELETE/MOVE + préconditions), config compte (`safeStorage`), sonde §5.4, pull incrémental §3, écran Corpus branché sur le miroir. Livrable : *ouvrir un corpus distant en lecture seule* | — |
| **E1 — Écriture sous verrou (variante B)** | `VerrouProvider` + provider PUT-conditionnel, cycle complet §4 (ouverture, publication périodique, fermeture, reprise crash), désamorçage `corpus.json` §4.7 (1ᵉʳ point), UI états + lecture seule. Livrable : *deux postes, un éditeur à la fois, zéro perte* | E0 |
| **E2 — Variante A** | détection capabilities, provider files_lock (LOCK/UNLOCK/PROPFIND), affichage détenteur enrichi, doc admin (`lock_timeout`) | E1 |
| **E3 — Définitions + dégradé** | transactions `corpus.json` §4.7, suppression/renommage sous double verrou, hors ligne §4.6, divergence + fusion assistée §6 | E1 |
| **E4 — Finitions** | présence §9, badges table de données, régime audio §3.3 (« Associer l'audio local… », lecteur dégradé sans audio), réglages (cadences), doc utilisateur | E2/E3 |

## 12. Tests

- **Pur (vitest)** : décisions de verrou (péremption avec horloges décalées ± 10 min, forçage,
  rétrogradation au battement `412`), diff de manifeste ETags, fusion assistée — tables de vérité.
- **Intégration sans Nextcloud** : un **serveur WebDAV embarqué dans les tests** (Node) qui honore
  les préconditions → cycle complet rejouable en vitest, y compris la course d'acquisition (deux
  clients, un seul `201`), le crash sans libération, le `412` de publication après forçage. C'est
  le banc d'essai central ; la sonde §5.4 sert aussi de test de conformité du serveur embarqué.
- **Variante A** : contrat contre un Nextcloud Docker + files_lock (suite manuelle/CI optionnelle) ;
  en unitaire, client moqué (`200/423`, PROPFIND).
- **e2e** : scénario lecture seule (« tenu par X » simulé en posant un fichier verrou) ; le vrai
  deux-instances reste un test manuel documenté.

## 13. Points de vigilance

- **Double transport** : le miroir en `userData` n'est jamais dans une zone synchronisée ; si des
  membres de l'équipe synchronisent par ailleurs le dossier corpus avec le client desktop, leur
  dire de ne pas y toucher à la main — toute modification hors app est de toute façon interceptée
  par `If-Match`, mais autant prévenir le dialogue de divergence.
- **Gros fichiers** : rien de binaire ne transite par l'app (§3.3 : audio et ondes locaux, le
  serveur ne porte que du JSON) — aucun besoin d'upload par morceaux. Si un « partage d'audio via
  l'app » devenait souhaité un jour, l'API d'upload par morceaux de Nextcloud serait le prérequis —
  consigné en évolution.
- **Quota / droits** : un partage en lecture seule côté Nextcloud doit être détecté à la sonde
  (le `PUT` échoue) → corpus ouvert en lecture seule d'emblée, message net.
- **Multi-corpus** : « ouvrir un corpus… » (piste C de BILAN) devient « corpus locaux + corpus
  distants configurés » — le sélecteur arrive naturellement avec E0.

## 14. Points à trancher

1. **Cadences par défaut** : publication 5 min / battement 60 s / TTL 5 min / marge 2 min /
   pull doux 60 s — à valider sur un Nextcloud réel pendant E1.
2. **« Éditer hors ligne à mes risques »** : offert dès E3 ou lecture seule d'abord ?
3. **Fusion assistée** : périmètre de l'automatique (annotations seules ?) — sur cas réels en E3.
4. **`userId`** : login Nextcloud d'office (simple, cohérent avec files_lock) ou libre ?
5. **Publication périodique** : activée par défaut (recommandé) ou opt-in ?

---

## Annexe — transports sans WebDAV (dossier Syncthing, SMB, Drive…)

Hors Nextcloud, l'hybride ne s'applique pas ; deux replis, portés par la même interface
`VerrouProvider` (jamais au niveau du set minimum multi-utilisateur, consignés pour mémoire) :

- **Montage réseau direct** (SMB/NFS) : les primitives locales sont fiables → création exclusive
  (`O_EXCL`) d'un `<id>.lock` = test-and-set correct ; le reste du cycle §4 s'applique tel quel
  (le « serveur » est le montage).
- **Dossier à synchronisation opportuniste** (Syncthing, Drive) : aucune primitive atomique →
  protocole probabiliste de la v1 de ce plan : revendications à nom unique
  (`verrous/<id>/claim-<sessionId>.json`), élection déterministe `(acquiredAt, sessionId)`,
  ouverture optimiste sous surveillance continue avec rétrogradation, et filets renforcés
  (détection des copies de conflit du synchroniseur). Détail complet dans l'historique git de ce
  fichier (version du 2026-07-19 avant révision).
