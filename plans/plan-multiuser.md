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
>
> **Révision (2026-08)** : passe « portabilité des backends » (§15). Le plan reste écrit pour
> Nextcloud — c'est le backend d'atterrissage — mais la séparation qu'il pose ne doit pas le
> verrouiller. Ce que la V1 (serveur autogéré + GitLab, puis tentative d'unification webdav en
> branche) a enseigné sur les backends — invariants, pièges, coutures — est consigné au §15 et
> dans l'annexe. Les étapes E0-E4 sont inchangées ; on y ajoute seulement deux actes à faible
> coût (profil de capacités dès E0, champ réservé pour les rôles — §15.2/§15.6).

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
  principal — révocable individuellement, et seul accepté en Basic auth WebDAV quand la 2FA est
  active), stockés via `safeStorage` d'Electron dans `userData`. Saisie manuelle du jeton au set
  minimum ; raffinement possible (E0 ou plus tard) : le **Login Flow v2** de Nextcloud
  (`/index.php/login/v2` — l'app ouvre le navigateur, l'utilisateur s'authentifie, l'app reçoit un
  mot de passe d'application généré pour elle, comme le client Desktop officiel). Chemin distant du
  corpus saisi ou choisi par navigation WebDAV. NB : un dossier **partagé** Nextcloud apparaît à un chemin
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

#### 4.6.1 Définitions corpus hors ligne — politique α (refus, pas de file d'attente)

Le « éditer hors ligne à mes risques » du §4.6 ne couvre que le **contenu d'entretien** (flux A :
annotations, règles *document*, locuteurs — tout ce qui s'écrit dans `entretiens/<id>.json`).
Les **définitions corpus** (flux B : codebook, variables, `reglesAnon` de portée corpus,
membership, création/suppression/renommage d'entretien) suivent une politique plus stricte :

- **Hors ligne, toute écriture dans `corpus.json` est refusée** (commande grisée + tooltip
  « nécessite une connexion au corpus partagé »). Cela inclut la transition de portée
  document→corpus d'une règle anon (le cran 📁 du slider est inactif tant que le serveur est
  injoignable), l'édition d'une règle déjà corpus, et toutes les transactions de §4.7.
- **Pas de file d'attente ni de « compteur de changements corpus en attente »** : on n'enregistre
  pas d'intention différée. Motivation : un différé non borné réintroduirait la fusion
  multi-source différée que l'agrégat propre (`corpus.json` autoritaire) a précisément tuée
  ([plan_anon.md](plan_anon.md) §2), et laisserait s'accumuler des collisions d'alias avec des
  collègues qui poussent pendant l'absence — conflits pires au retour qu'au moment de la saisie.
  En ligne, ce différé n'apporte rien (la transaction est ~2 allers-retours, imperceptible).
- **Ce que l'utilisateur perd en mobilité** : promouvoir une règle au corpus. Ce qui **reste
  fonctionnel** : la règle en portée *document* continue à anonymiser localement — rien n'est
  bloqué côté travail, seule la promotion est reportée à la reconnexion. La transition étant un
  acte ponctuel (règle « mûre »), le coût est marginal.
- **Honnêteté de l'UI** : le slider affiche « corpus » (gras) **seulement après** que le serveur
  a validé la transaction. Hors ligne, la règle reste affichée « document » — pas de mensonge.
  L'indicateur de session (§10) ne porte ainsi que le flux A : « modifications locales non
  publiées » — un seul compteur, une seule sémantique.

> Cette politique simplifie E3 : un seul chemin pour les définitions, pas de mécanique de
> reprise différée, pas de réconciliation I-POR-3 à rejouer au retour (la réconciliation ne se
> produit qu'à l'ouverture et après chaque pull quand le `corpus.json` a bougé, cf. §4.8).

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

### 4.8 Transactions multi-fichiers (projection des transitions de portée)

WebDAV n'offre **pas de transaction cross-ressource** : un `PUT` porte sur un fichier, point.
Or, certaines opérations touchent à la fois `corpus.json` et `entretiens/<id>.json`. Le protocole
§4 n'en parle qu'implicitement — ce paragraphe explicite les invariants manquants, révélés par la
projection du module Anonymisation ([plan_anon.md](plan_anon.md) E2.1) dans le régime multi-user.

**Cas type : transition de portée document→corpus d'une `RegleAnon`.** Physiquement, c'est un
*déplacement* de la règle (par id) depuis `entretiens/<id>.json.reglesAnon` vers
`corpus.json.reglesAnon` ; les `Annotation{type:'anon', regle: id}` ne bougent pas (elles
référencent par id). C'est donc une écriture dans **deux** fichiers.

Trois invariants à poser :

1. **Ordre canonique des verrous** pour toute transaction touchant `(entretien, corpus)` :
   **verrou corpus avant verrou entretien** (toujours dans cet ordre, jamais l'inverse).
   Sans convention, deux utilisateurs faisant l'un une transition de portée, l'autre une
   suppression d'entretien (qui prend aussi les deux verrous), peuvent s'interbloquer. Fixer
   l'ordre supprime la course. Symétrique de la règle classique « verrou parent avant enfant ».
2. **Politique de publication — redondance transitoire assumée** : on publie l'entretien (sans la
   règle) **après** la transaction corpus, pas avant. Fenêtre observable : un collègue qui pull
   entre les deux voit `corpus.json` avec la règle **et** `entretiens/<id>.json` qui la contient
   encore (jusqu'à la publication de l'entretien, ≤ TTL publication). C'est bénin : l'id résout
   des deux côtés, les annotations ne pendotent jamais. Alternative écartée : publier l'entretien
   *avant* la transaction corpus → fenêtre où la règle « n'existe plus nulle part » et où les
   annotations deviennent pendantes (inertes, signalées) jusqu'au prochain pull. La redondance
   transitoire est préférable à la pendancé transitoire.
   - **Conséquence lecture** : le scan corpus (panneau Pseudos, [plan_anon.md](plan_anon.md) E2.2)
     doit **tolérer qu'une règle soit présente des deux côtés pendant < TTL publication** — c'est
     un état normal, pas un bug. Ne pas alerter dessus.
3. **Réconciliation I-POR-3 après chaque pull**, pas seulement à l'ouverture de l'entretien.
   `reconcilierPorteesDivergentesAOuverture` (SonalPi, intra-machine) devient **post-pull** en
   multi-user : une règle corpus partageant un alias avec une règle *document* de l'entretien
   ouvert peut **apparaître** pendant la session (un collègue l'a poussée entre deux pulls). Au
   prochain pull `§3.2` qui ramène un `corpus.json` modifié, l'app rejoue la réconciliation sur
   l'entretien ouvert → dialogue `resoudreConflitCorpus` (aligner / garder les deux → bascule
   corpus). Sans ça, la règle *document* diverge silencieusement et la propre publication de
   l'utilisateur casse I-POR-3.

**Même trou pour `supprimerEntretien`** (§4.7) : `MOVE` vers `corbeille/` est atomique pour **un**
fichier, pas pour la paire `(corpus.json, entretiens/<id>.json)`. Si le `corpus.json` (membership
mis à jour) est publié d'abord puis le `MOVE` échoue, le corpus référence un entretien disparu —
ou inversement. À borner par la même politique (ordre des verrous + publication corpus d'abord,
`MOVE` ensuite, et au redémarrage un ramasse-miettes qui détecte un membership pointant vers un
fichier absent → réparation assistée).

> Formulation pour la doc : *le verrou protège un fichier à la fois ; toute opération qui touche
> plusieurs fichiers suit un ordre fixe (corpus avant entretien) et accepte une briève
> redondance transitoire, jamais une perte.*

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
   **Identités opaques partout** : toutes les entités créées côté app (entretiens, catégories,
   variables, modalités) reçoivent un id aléatoire `genId('<préfixe>')` — unique *par
   construction*, donc la création offline divergente (§4.6) ne peut pas produire de collision
   d'id (deux `cat_005` distincts, etc.). Pour les catégories, `codeExport` (`cat_NNN`,
   séquentiel) reste un attribut de **présentation à l'export**, jamais une identité : les
   codebooks mélangeant ids legacy `cat_NNN` (bootstrap, imports `.sonal` anciens) et ids
   `cat-xxxx` sont supportés ; à la fusion, une collision de `codeExport` est bénigne (affichage
   seul) et peut être re-numérotée sans toucher aux références.
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

- **Détection automatique et transparente** : `GET /ocs/v1.php/cloud/capabilities` → clé
  `files.locking` (ex. `"1.0"`). Présente → la variante A remplace la B pour le verrou **des
  fichiers de données** (le protocole §4 est inchangé ; seul le `VerrouProvider` diffère). Cette
  sonde fait partie de la **connexion** (E0, au même titre que la sonde de préconditions §5.4) :
  elle est répétée à chaque ouverture de corpus — un admin peut installer le plugin entre deux
  sessions, c'est gratuit (une requête, cachée pour la session). **L'utilisateur ne choisit rien** :
  pas de checkbox, pas de question. S'il demande à voir l'état (écran Corpus → à propos du corpus),
  message informatif : « verrouillage natif disponible / indisponible — en cas d'indisponibilité,
  l'app utilise son propre verrou (fonctionnel, invisible dans l'UI web Nextcloud) ». C'est une
  caractéristique du serveur, pas une préférence utilisateur ; l'app s'adapte.
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
| **E0 — Couche WebDAV + miroir lecture** | client WebDAV minimal (fetch Node, zéro dépendance lourde : PROPFIND/GET/PUT/DELETE/MOVE + préconditions), config compte (`safeStorage`), **sonde §5.4 + sonde capabilities §8 (détection files_lock, transparente — pas de checkbox)**, pull incrémental §3, écran Corpus branché sur le miroir. Livrable : *ouvrir un corpus distant en lecture seule* | — |
| **E1 — Écriture sous verrou (variante B)** | `VerrouProvider` + provider PUT-conditionnel, cycle complet §4 (ouverture, publication périodique, fermeture, reprise crash), désamorçage `corpus.json` §4.7 (1ᵉʳ point), UI états + lecture seule. Livrable : *deux postes, un éditeur à la fois, zéro perte* | E0 |
| **E2 — Variante A** | **provider files_lock** (LOCK/UNLOCK/PROPFIND) branché derrière le `VerrouProvider` d'E1, sélectionné automatiquement quand la sonde capabilities d'E0 dit `files.locking` présent ; affichage détenteur enrichi, doc admin (`lock_timeout`). Livrable : *même comportement qu'E1, verrou visible dans l'UI web* | E1 |
| **E3 — Définitions + dégradé** | transactions `corpus.json` §4.7, suppression/renommage sous double verrou (ordre canonique §4.8), hors ligne §4.6 **+ politique α pour les définitions §4.6.1**, divergence + fusion assistée §6, **réconciliation I-POR-3 post-pull §4.8** | E1 |
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
- **Transactions multi-fichiers §4.8** : sur le serveur WebDAV embarqué, rejouer la transition
  document→corpus d'une `RegleAnon` pendant qu'un second client pull à mi-chemin (entre le `PUT
  corpus.json` et la publication de l'entretien) → vérifier que (a) l'id résout des deux côtés,
  (b) le scan ne signale pas la redondance transitoire comme un bug, (c) une règle corpus
  partagant un alias poussée concurrente déclenche bien la réconciliation post-pull côté entretien
  ouvert. Ces scénarios ne sont pas couverts par les tests « un fichier à la fois » et sont le
  banc spécifique de §4.8.

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
- **Redondance transitoire multi-fichier** (§4.8) : pendant la fenêtre entre le `PUT corpus.json`
  et la publication de l'entretien, une règle peut exister des deux côtés. Le scan corpus
  ([plan_anon.md](plan_anon.md) E2.2) **doit tolérer** cet état (l'id résout, les annotations ne
  pendotent pas) et ne pas le signaler comme un conflit. À l'inverse, une annotation dont l'id
  ne résout **nulle part** (règle supprimée concurrente) reste signalée comme pendante — c'est
  le vrai signal à faire remonter.

## 14. Points à trancher

1. **Cadences par défaut** : publication 5 min / battement 60 s / TTL 5 min / marge 2 min /
   pull doux 60 s — à valider sur un Nextcloud réel pendant E1.
2. **« Éditer hors ligne à mes risques »** : offert dès E3 ou lecture seule d'abord ?
3. **Fusion assistée** : périmètre de l'automatique (annotations seules ?) — sur cas réels en E3.
4. **`userId`** : login Nextcloud d'office (simple, cohérent avec files_lock) ou libre ?
5. **Publication périodique** : activée par défaut (recommandé) ou opt-in ?
6. **Portabilité** : acter le profil de capacités (§15.2) comme partie de la connexion dès E0
   (coût quasi nul, une requête de plus à la configuration) — oui/non ?
7. **Rôles & permissions (§15.6)** : réserver le champ dans `corpus.json` dès E3 ; le modèle de
   rôles complet (qui peut quoi) est-il au périmètre de cette itération ou d'une suivante ?

---

## 15. Portabilité des backends — ce que la conception Nextcloud ne doit pas verrouiller

> Le plan est écrit pour WebDAV ; il ne doit pas *verrouiller* l'architecture sur Nextcloud. Cette
> section pose, en concepts, ce que la réflexion V1 sur les backends (serveur autogéré, GitLab,
> puis tentative d'unification webdav, branche `webdav` de SonalPi) a enseigné — non pas en code
> à importer, mais en invariants à garantir dès la conception, avant même que le deuxième backend
> existe. Règle d'usage : chaque étape E0-E4 doit pouvoir être relue contre §15.2 ; ce que le plan
> décrit n'est jamais que l'*instance WebDAV* d'un schéma plus général.

### 15.1 Trois primitives, pas un backend

Tout backend se réduit à trois capacités orthogonales. Le piège historique de V1 était de les
confondre dans une seule couche (« API distante ») : les conversions URL↔chemin, les filtres
d'extension (.sonal/.crp/.rcl) et les pointeurs LFS sont toutes des fuites de la couche transport
dans le domaine.

1. **Transport** — comment les octets voyagent : HTTP/WebDAV (ce plan), dépôt Git (GitLab V1),
   montage réseau (SMB/NFS), système de fichiers local.
2. **Atomicité / exclusion** — quelle primitive garantit « un seul écrivain » et « pas
   d'écrasement » : PUT conditionnel (`If-None-Match`/`If-Match`, WebDAV), verrou natif
   (`files_lock`), `O_EXCL` (montage), ref update atomique (Git), LFS lock (GitLab V1).
3. **Ancrage de fraîcheur / identité de version** — ce qui permet de comparer deux versions :
   ETag, hash de contenu, SHA de commit, (mtime+taille en dernier recours).

Le `VerrouProvider` du plan est déjà la bonne couture pour (2) ; la couche miroir pour (1). Il
manque une explicitation de (3) : **l'ancrage de fraîcheur est une donnée du contrat de backend**, pas un
postulat WebDAV. Toute la mécanique de §4.6 (« comparer à la version de départ ») et des filets §6
(`If-Match`) n'est qu'une instanciation de (3).

### 15.2 Profil de capacités (le contrat de backend)

À la configuration d'un corpus partagé, le backend public son profil — c'est la généralisation des
deux sondes : préconditions §5.4 et capabilities files_lock §8. Le protocole de session (§4) ne
dépend que de ces capacités, **jamais du nom du backend** — la leçon V1 des flags `estDistant`/
`hasLock` : le code métier teste des capacités, pas des noms de transports.

| Capacité | Valeurs possibles | Impact sur le protocole |
|---|---|---|
| Test-and-set atomique | préconditions HTTP / LOCK natif / `O_EXCL` / ref Git / **aucune** | Détermine la variante de verrou ; « aucune » → lecture seule ou dégradé probabiliste (annexe) |
| Ancrage de fraîcheur | ETag / hash / SHA / mtime+taille | Base du « comparer à la version de départ » (§4.6) et du garde de publication |
| Verrou imposé par le serveur | oui (`files_lock`) / non (conventionnel) | Les filets §6 sont probables ou seulement théoriques |
| Travail hors ligne possible | oui (Git, local) / oui avec cache (WebDAV, ce plan) / non | Portée réelle du §4.6 ; le plan la *construit*, ne la postule pas |
| Règles de nommage imposées | oui / non | S'il y en a, la couche normalise à la frontière, jamais dans le domaine (§15.4) |

Sonde §5.4 étendue : pour chaque capacité, un test réel sur le serveur cible, à la connexion
(E0), répétable. Un backend qui ment sur son profil est refusé ou dégradé — comme V1 refusait (trop
tard) un GitLab sans LFS.

### 15.3 Le miroir : réponse générale au « réseau optionnel »

Le plan justifie le miroir contre la latence du client desktop Nextcloud ; c'est trop étroit.
Conceptuellement, le miroir est la réponse à la question « que se passe-t-il si le réseau n'est
pas là ? ». Le schéma général est : **source autoritaire + copie de travail locale + cycle
d'écriture sous primitive atomique** — chaque backend en est une instance :

- WebDAV : pull incrémental par ETags (ce plan §3).
- Dépôt Git (GitLab V1) : le miroir est un clone local ; le cycle devient verrou → fetch → travail
  local → commit + push → déverrouillage, avec la même « version de départ » (le merge est ancré
  sur une base, pas sur une horloge).
- Montage local : pas de miroir, la copie de travail est le système de fichiers.

Conséquence de vocabulaire à acter dès E0 pour ne pas coupler la conception à WebDAV :
« miroir » → **copie de travail locale**, « serveur » → **source autoritaire**. Le plan peut
continuer à dire « miroir » ; la documentation et le code s'appuient sur les termes génériques.

### 15.4 La couture : où l'abstraction passe (et ne passe pas)

Ce que V1 a appris  : **quand la couture est mal placée, le code se remplit de
cas particuliers backend**. Invariants à écrire noir sur blanc, et à faire vérifier par la revue de
chaque étape :

1. **Le domaine et le renderer ignorent le backend.** Ils ne connaissent que source autoritaire,
   copie locale, verrous, sessions, publication. (Le plan le dit déjà pour le renderer ; l'étendre
   au `CorpusStore` : il opère sur la copie locale, point.)
2. **Les formats partagés sont indépendants du backend.** `corpus.json` et `entretiens/<id>.json`
   sont la seule interopérabilité ; un backend n'impose jamais une transformation de format visible
   du domaine (base64, pointeurs, chemins encodés). V1 devait convertir URL↔chemin et filtrer
   .sonal/.crp/.rcl : tout cela disparaît si la couche backend normalise à la frontière.
3. **Pas de dispatch par type dans la logique métier.** V1 testait `Corpus.type == 'distant' ||
   'gitlab'` à quinze endroits ; les capacités du §15.2 remplacent les tests de type.
4. **Une interface annoncée doit être implémentée et testée sur chaque backend.** Le critère
   d'acceptation d'une abstraction n'est pas qu'elle « ressemble » à générique, c'est que chaque
   backend réel passe le même banc (§15.5).

### 15.5 La portabilité est une propriété testée, pas un espoir

La sonde §5.4 est l'embryon d'un **banc de conformité** : un même jeu de tests fonctionnels
(lire, écrire, verrouiller, battement, forçage, pull, publier, merger), joué contre tout backend
candidat **sans connaître son identité**. C'est ce qui a manqué à V1 : serveur et GitLab n'ont
jamais été testés contre un même contrat, d'où leurs divergences de comportement. Concrètement :
extraire le serveur WebDAV embarqué de §12 en un **harness de conformité** ; le banc devient la
porte d'entrée de tout backend futur — et si GitLab revenait, il y passerait à son tour.

### 15.6 Rôles et permissions : une couche produit, pas backend

V1 avait conçu un modèle de rôles (Maintainer/Owner/Developer, `options.json`, restriction
d'ajout/suppression d'entretiens) que ce plan ne couvre pas : le membership existe, les rôles non.
Positionnement portable : les rôles sont de la **logique produit**, stockée dans `corpus.json` ;
le backend ne fournit que deux primitives — « qui suis-je » et « puis-je écrire cette ressource ».
Nextcloud les fournit (login, files_lock owner), un dépôt Git les approxime (droits de branche),
SMB pas du tout : le provider normalise. Ne pas attendre le deuxième backend pour réserver au moins
le champ dans `corpus.json` (point 7 du §14) — c'est le seul vrai angle mort hérité de V1, et le
moins cher à prévoir maintenant.

### 15.7 Discipline de déploiement : une abstraction d'abord, un backend à la fois

Le message de commit V1 le dit mieux que nous : *« webdav n'est pas encore abordé, il faut d'abord
vérifier/stabiliser cette API »*. La séquence gagnante est : **stabiliser la séparation, puis
brancher le backend** — jamais l'inverse. Concrètement pour V2 : on ne construit pas le deuxième
backend maintenant ; on construit la séparation qui rendra le deuxième backend une affaire de
`provider` + banc de conformité, et non une refonte du protocole. Le plan la respecte déjà
(E0-E2 : un seul backend, abstractions posées d'abord) ; cette section la rend explicite et
opposable en revue.

---

## Annexe — transports sans WebDAV (dossier Syncthing, SMB, Drive…)

Hors Nextcloud, l'hybride ne s'applique pas ; trois replis, portés par la même interface
`VerrouProvider` (jamais au niveau du set minimum multi-utilisateur, consignés pour mémoire) :

- **Montage réseau direct** (SMB/NFS) : les primitives locales sont fiables → création exclusive
  (`O_EXCL`) d'un `<id>.lock` = test-and-set correct ; le reste du cycle §4 s'applique tel quel
  (le « serveur » est le montage).
- **Dépôt Git (GitLab/gitea, cf. V1)** : le test-and-set est le **ref update atomique** ; le verrou
  devient un état du serveur d'API (LFS lock V1) ou une branche de coordination, et l'ancrage de
  fraîcheur est le **SHA du dernier commit touchant le fichier** (« version de départ » du §4.6 =
  base du merge). La copie de travail locale est le clone (§15.3). Le reste du cycle §4
  s'applique tel quel ; c'est le second candidat naturel quand Nextcloud ne convient pas.
- **Dossier à synchronisation opportuniste** (Syncthing, Drive) : aucune primitive atomique →
  protocole probabiliste de la v1 de ce plan : revendications à nom unique
  (`verrous/<id>/claim-<sessionId>.json`), élection déterministe `(acquiredAt, sessionId)`,
  ouverture optimiste sous surveillance continue avec rétrogradation, et filets renforcés
  (détection des copies de conflit du synchroniseur). Détail complet dans l'historique git de ce
  fichier (version du 2026-07-19 avant révision).
