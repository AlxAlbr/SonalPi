# Plan — Pseudonymisation en corpus partagé (distant / GitLab)

Analyse du problème de propagation/cohérence des règles d'anonymisation en mode
collaboratif, et plan d'implémentation de la solution retenue (**Option A**).

> Statut : **document de conception, aucun code modifié.**
> Prérequis de lecture : [anon.md](anon.md) (modèle de données, flux global ↔ local).

---

## 1. Architecture distante existante (les faits)

Deux fichiers de nature différente coexistent en distant/GitLab :

| Fichier | Contenu | Verrouillé ? |
|---|---|---|
| **`.crp`** (1 seul, partagé) | `{ tabThm, tabVar, tabDic, tabDat, tabEnt, tabAnon }` — donc le **`tabAnon` global** ET le **`ent.tabAnon` local de chaque entretien** (inclus dans `tabEnt`) | ❌ **Non** |
| **`.Sonal`** (1 par entretien, `rtrPath`) | le **texte** de l'entretien (spans déjà anonymisés) | ✅ Oui, individuellement |

Trois moments clés :

- **Ouverture du corpus** : [chargement du `.crp`](modules/gestion_corpus.js#L135-L141) → `tabAnon`
  global + tous les `ent.tabAnon` chargés. **Seul** moment où les règles entrent côté client.
- **Sauvegarde d'un entretien** : `miseàjourEntretien` → `synchroniserTabAnonGlobal` → puis
  [`sauvegarderCorpus()`](modules/gestion_corpus.js#L914) qui **réécrit le `.crp` en entier**
  (`JSON.stringify({…, tabAnon})`). Le `.Sonal` est écrit séparément.
- **Rafraîchissement collab** ([toutes les 30 s](index.html#L734) en GitLab) :
  [`rafraichirCorpus`](modules/gestion_corpus.js#L997) relit le `.crp` distant mais ne resynchronise
  **que** `tabThm`/`tabVar`/`tabDic`, le **texte** des `.Sonal` modifiés, et les métadonnées
  `nom`/`actif`/`act` ([l.1083](modules/gestion_corpus.js#L1083)). **Il ignore totalement `tabAnon`**
  (global et local).

**Conséquence structurelle** : le verrou protège le **texte** (`.Sonal`), mais les **règles**
vivent dans le `.crp` non verrouillé, en *last-writer-wins*.

---

## 2. Les problèmes

| # | Problème | Cause |
|---|---|---|
| **P0** ⚠️ | **Contournement du verrou à l'écriture du `.Sonal`** : depuis le détail d'une entité dans la vue Pseudos corpus, appliquer un pseudo / poser-retirer une exception réécrit le **texte** des entretiens concernés (`majFichierSonal` → `sauvegarderSurServeur`) **sans aucune vérification de verrou**. → X peut **écraser sur le serveur le `.Sonal` d'un entretien verrouillé et édité par Y** (perte de contenu primaire, silencieuse, irréversible). `appliquerAnonymisationGlobale` aggrave : réécriture **en masse** de tous les entretiens contenant l'entité. | chemin d'écriture corpus → `.Sonal` sans `isEntretienLocked` |
| **P1** | **Écrasement des règles** : deux users ont le corpus ouvert ; chacun `sauvegarderCorpus` réécrit tout le `.crp` depuis **son** instantané. Comme le refresh ne récupère jamais le `tabAnon` d'autrui, **le dernier qui sauve efface les règles ajoutées par l'autre** (global + `ent.tabAnon` des autres entretiens). | `.crp` = blob mutable partagé, pas de read-merge-write |
| **P2** | **Pas de propagation à chaud** : une règle « Lyon » créée par X n'apparaît jamais chez Y (corpus ouvert), même après 30 s. | `rafraichirCorpus` n'inclut pas `tabAnon` |
| **P3** | **Cas du verrou (règles)** : pendant que B est verrouillé par Y, X crée et sauve « Lyon » dans le global. Quand Y relâche B, son écrasement du `.crp` depuis son instantané périmé **peut effacer « Lyon »**. | P1 + absence de réconciliation à la libération |
| **P4** | **Conflits non arbitrés** : X fait `Lyon→VILLE_1`, Y fait `Lyon→VILLE_A`. `synchroniserTabAnonGlobal` n'ajoute que si la clé `entité\|pseudo` est absente → **les deux** entrées coexistent → deux pseudos contradictoires pour « Lyon », sans détection. | clé d'unicité = `entité\|pseudo`, pas `entité` |

### Hiérarchie de gravité
- **P0 est le plus grave et doit être réglé en premier.** Il détruit le **contenu primaire**
  (le texte de l'entretien) d'une ressource **verrouillée**, silencieusement et sur le serveur ;
  il rend le verrou **mensonger** (Y croit son entretien protégé pendant qu'il l'édite). Il est de
  surcroît **indépendant** de P1–P4 (autre fichier, autre chemin) et **moins cher** à corriger
  (un simple garde de verrou). → priorité absolue.
- **P1–P4** ne perdent que des **règles** (métadonnée reconstructible) ; le modèle étant *grow-only*,
  les pertes y sont « rares et réparables ».
- ⚠️ Nuance corrigée : on ne peut **pas** dire « le texte d'un entretien verrouillé reste protégé ».
  Il l'est uniquement quand il est édité **via la fenêtre entretien** (qui prend le verrou) ; le
  **chemin d'écriture de la vue Pseudos corpus, lui, le contourne** (c'est P0).

### Sur l'idée d'un « fichier de delta sous verrou »
Stocker les changements tant qu'il y a un verrou, supprimé quand il n'y en a plus :
**résout P3/P4 mais pas P1**, et coûte cher (cycle de vie fragile : crash → journal orphelin ;
« plus aucun verrou » est soi-même un problème distribué ; race sur le journal). Il **réimplémente**
ce que la sémantique d'union donne presque gratuitement. → À conserver **uniquement** comme support
d'**arbitrage humain** (P4), pas comme mécanisme de correctness.

---

## 3. Correctif P0 — prioritaire et indépendant

> **À régler avant P1–P4** : c'est le seul problème qui détruit du **contenu primaire** sur une
> ressource **verrouillée**. Indépendant du chantier d'union (autre fichier, autre chemin de code).

### Où
Toute action de la vue Pseudos corpus qui aboutit à `majFichierSonal(i, …)` :
`pseudonymiserEntretienSpecifique`, `retirerPseudoOccurrencesSpecifiques`,
`marquerExceptionOccurrencesSpecifiques`, `retirerExceptionOccurrencesSpecifiques`,
`validerOccurrencesSelectionnees`, `retirerPseudoDeEntretien`, et `appliquerAnonymisationGlobale`
(boucle sur tous les entretiens) — toutes dans
[modules/Anonymisation/tableau_global.js](modules/Anonymisation/tableau_global.js), via
[`majFichierSonal`](modules/gestion_entretiens.js#L1620) → `sauvegarderSurServeur(rtrPath, …)`.

### Quand l'écriture a réellement lieu
Dans l'accordéon de vérification (zone droite `#fond_verif_anon`), **cocher/décocher une occurrence
et le bouton exception 🚫 ne font que *préparer*** (`_pendingExclusion`, état coché). L'écriture dans
le `.Sonal` n'a lieu qu'au clic sur **« Valider »**
([`validerOccurrencesSelectionnees`](modules/Anonymisation/tableau_global.js), qui regroupe les
changements **par entretien** puis **boucle par entretien** → `majFichierSonal`) et via
`appliquerAnonymisationGlobale`. C'est donc là, et seulement là, que le garde doit être **autoritaire**.

### Deux couches (les deux nécessaires)

**Couche UI (confort)** — éviter de préparer une action qui sera refusée :
- ligne d'un entretien verrouillé par un autre → **🔒 « verrouillé par {lock.user} »**
  (info déjà fournie par `lireFichier`/`lockInfo`) ;
- ligne **dépliable en lecture seule** (voir les occurrences/états est sans risque et utile —
  *ne pas* la rendre non-dépliable) ;
- contrôles d'écriture **grisés/inertes** : case d'occurrence, exception 🚫 / retrait d'exception,
  case de la ligne entretien ; entretien verrouillé **exclu** de la case globale
  « Affecter à toutes les occurrences non traitées » ;
- flèche **↗ « aller à l'entretien » conservée** : la fenêtre entretien gère déjà le verrou
  (ouverture en **lecture seule**) → la consultation reste sûre.

**Couche écriture (correction, non négociable)** — re-tester le verrou **au moment d'écrire**, car
l'accordéon est rendu de façon paresseuse (au clic 🔍) et le polling de verrous tourne toutes les 30 s :
il a pu être affiché *plusieurs minutes* avant le clic « Valider ». Sans ce re-check, on prépare
pendant que l'entretien est libre, l'autre le verrouille entre-temps, et « Valider » écrit quand même.
→ Dans la **boucle par entretien** de `validerOccurrencesSelectionnees` (et dans
`appliquerAnonymisationGlobale`), avant chaque `majFichierSonal(i, …)` :
1. `const lock = await window.electronAPI.isEntretienLocked(i);`
2. si verrouillé par un autre → **sauter** cet entretien et le **rapporter**
   (« entretien X verrouillé entre-temps, non appliqué »).

> Seule la **couche écriture** garantit la correction ; la couche UI n'est que du confort.

### Durcissement (course résiduelle)
Le re-check au Valider laisse une **micro-course** quand personne ne tient le verrou (on écrit sans le
prendre, quelqu'un ouvre pile à cet instant). Pour l'éliminer : `verrouiller(i)` → écrire →
`déverrouiller(i)`, ou **refuser si déjà verrouillé** (plutôt qu'attendre, pour ne pas entrer en
contention avec un éditeur actif).

### Comportement attendu (récap sur l'écran « Occurrences de … »)

| Élément | Si entretien verrouillé par un autre |
|---|---|
| Ligne entretien | 🔒 + « verrouillé par X », **dépliable en lecture seule** |
| Cases (occurrence / ligne) | grisées (UI) **+** ignorées au Valider (écriture) |
| Exception 🚫 / retrait | grisé (UI) **+** ignoré au Valider |
| Case globale « toutes non traitées » | exclut l'entretien verrouillé + rapport |
| Flèche ↗ | conservée (ouvre en lecture seule, déjà géré) |
| **Valider** / `appliquerAnonymisationGlobale` | **re-check `isEntretienLocked` par entretien avant `majFichierSonal`** → skip + rapport |

### Granularité
Le bon niveau est **Entretien** : l'unité d'écriture est le **`.Sonal` entier** — un verrou
« Segment » ne protégerait rien ici (toute action réécrit tout le fichier), et « Tout » (corpus) est
inutile. L'API existante suffit (`isEntretienLocked`, `verrouillerFichier`, `lockInfo.user`).

### Effort
Faible : ~quelques lignes par fonction d'écriture + un helper `peutEcrireEntretien(i)`. **Aucune
dépendance** au reste du plan.

---

## 4. Solutions envisagées (de la plus simple à la plus complète) — pour P1–P4

- 🟢 **Option A — modèle « union-convergent »** (retenue). Exploiter le fait que
  `synchroniserTabAnonGlobal` est purement additif : **toujours unionner le distant avant
  d'écrire ou d'afficher**. Règle P1/P2/P3 pour le cas courant (ajout de règles). ~50 l., sans
  nouveau fichier ni verrou.
- 🟡 **Option B — détection + arbitrage des conflits** (couche au-dessus de A, pour P4).
- 🔴 **Option C — sortir les règles du `.crp`** vers un stockage verrouillable dédié
  (`pseudos.json` en read-merge-write sous verrou, ou `ent.tabAnon` dans le `.Sonal`). Correction
  de fond mais migration des corpus existants.

**Recommandation** : A maintenant ; B ensuite si besoin ; C seulement pour une garantie forte à long terme.

---

## 5. Plan d'implémentation — Option A (P1–P4)

### Principe
Le `tabAnon` est un **ensemble qui ne fait que croître**. On en fait un modèle convergent en
garantissant qu'on **union toujours le distant avant d'écrire (sauvegarde) ou d'afficher (refresh)**.

### Brique réutilisable
[`synchroniserTabAnonGlobal(a, b)`](modules/gestion_corpus.js#L31) fait déjà l'union de deux tables
globales (clé `entité.toLowerCase()|pseudo.toLowerCase()`, ajout seulement). On la réutilise telle
quelle pour le global. Pour les `ent.tabAnon` locaux, prévoir un petit helper `unionTabAnon(a, b)`
(même logique par paire) ou généraliser l'existant.

### Modif 1 — `sauvegarderCorpus()` : read-merge-write
**Fichier** : [modules/gestion_corpus.js:914](modules/gestion_corpus.js#L914)
**Insertion** : juste **avant** `const contenu = JSON.stringify({ tabThm, tabEnt, tabVar, tabDic, tabAnon });`
([~l.946](modules/gestion_corpus.js#L946)), pour `type === 'distant' || 'gitlab'` :

```
1. Relire le .crp distant :
     cheminCrp = (gitlab) [Corpus.folder, Corpus.fileName]  |  (distant) Corpus.url
     result = await electronAPI.lireFichierServeur(cheminCrp)   // déjà utilisé en l.1006
     crpDistant = JSON.parse(result.content)

2. Union du GLOBAL :
     tabAnon = await synchroniserTabAnonGlobal(crpDistant.tabAnon || [], tabAnon)
     await electronAPI.setAnon(tabAnon)

3. Réconcilier tabEnt (LE PIÈGE, voir ci-dessous) :
     - base = crpDistant.tabEnt
     - n'y réinjecter QUE le(s) entretien(s) que CE user a réellement modifié
       (celui qu'on vient de sauver), en unionnant son ent.tabAnon
     - autres entretiens : garder la version distante (ne pas écraser)
```

Le `JSON.stringify` existant écrit ensuite la version mergée. Le cache `_dernierContenuCrp`
([l.979](modules/gestion_corpus.js#L979)) reste mis à jour après écriture (reflètera le contenu mergé).

#### ⚠️ Le piège du `tabEnt`
`sauvegarderCorpus` écrit aujourd'hui **tout** `tabEnt` depuis l'instantané local — c'est ce qui
écrase les `ent.tabAnon` (et `nom`/`actif`) des autres entretiens modifiés entre-temps (P1/P3).
L'étape 3 est donc **indispensable** : sans elle, l'union du global ne suffit pas. On ne réécrit du
local que la ligne de l'entretien sauvegardé ; tout le reste vient du `crpDistant` fraîchement relu.

### Modif 2 — `rafraichirCorpus()` : tirer `tabAnon` du distant
**Fichier** : [modules/gestion_corpus.js:997](modules/gestion_corpus.js#L997). `corpusDistant` est déjà
parsé en [l.1015](modules/gestion_corpus.js#L1015). Deux branches (gitlab et distant).

**Branche gitlab** — à côté du merge `tabVar`/`tabDic` ([l.1064-1071](modules/gestion_corpus.js#L1064-L1071)) :

```
// Global : union (jamais d'écrasement → pas de perte de règles locales non encore sauvées)
if (corpusDistant.tabAnon) {
    const local = await electronAPI.getAnon();
    const fusion = await synchroniserTabAnonGlobal(corpusDistant.tabAnon, local);
    await electronAPI.setAnon(fusion);
    // si la page Pseudos est ouverte → la rafraîchir (affichAnonGen)
}
```

**Dans la boucle métadonnées** ([l.1080-1089](modules/gestion_corpus.js#L1080-L1089)) : pour chaque
entretien **non ouvert/non verrouillé par soi**, unionner `entDistant.tabAnon` dans
`tabEntLocal[ent].tabAnon` (en plus des champs `nom`/`actif`/`act` déjà copiés). L'entretien
éventuellement ouvert localement ne doit **pas** être écrasé (sa version en cours fait foi).

**Branche distant** ([l.1136+](modules/gestion_corpus.js#L1136)) : aujourd'hui ne relit que les
`.Sonal`. Ajouter une relecture du `.crp` (`lireFichierServeur(Corpus.url)`) puis le même union
global + per-entretien.

### Concurrence résiduelle (durcissement optionnel, 2ᵉ temps)
Le read-merge-write réduit fortement la fenêtre de course, mais un TOCTOU subsiste (Y écrit entre
la relecture et l'écriture de X).

- **GitLab** : *optimistic concurrency* — passer le `last_commit_id`/SHA du `.crp` lu à l'API
  d'update, et **réessayer (re-merge)** sur 409 (compare-and-swap). Point d'insertion : `main.js`
  (`sauvegarderSurServeur`) + `gitlab_api.js`.
- **Serveur « distant »** : idem si l'API expose une version/etag ; sinon accepter la fenêtre courte.

L'union seule rend déjà toute perte *rare et réparable* (ensemble croissant : la règle perdue revient
au prochain refresh/sauvegarde d'un autre).

### Conflits P4 (Option B, à brancher au même endroit)
Au moment des unions (Modif 1 & 2), détecter quand une **même `entité`** a des **pseudos différents**
entre distant et local. Au lieu d'empiler les deux, marquer un `conflit` et l'exposer dans la page
Pseudos. Seul cas qui demande un arbitrage humain — et seul endroit où un petit registre de conflits
a du sens (pas de fichier de verrou).

---

## 6. Effort / périmètre

| Élément | Fichier | Ampleur |
|---|---|---|
| **P0** — garde de verrou avant écriture corpus → `.Sonal` | `tableau_global.js` (fonctions d'écriture) + helper `peutEcrireEntretien` | faible |
| Read-merge-write | `gestion_corpus.js` (`sauvegarderCorpus`) | ~25 l. |
| Union au refresh (×2 branches) | `gestion_corpus.js` (`rafraichirCorpus`) | ~25 l. |
| Helper `unionTabAnon` per-entretien | `gestion_corpus.js` | ~10 l. (ou généraliser l'existant) |
| (option) CAS GitLab | `main.js` + `gitlab_api.js` | moyen |
| (option) détection conflits P4 | unions + UI page Pseudos | moyen |

**Hors P0 : aucun nouveau fichier, aucun nouveau verrou** — on s'appuie sur la sémantique d'union
déjà présente. **P0 réutilise l'API de verrou existante** (`isEntretienLocked`, `verrouillerFichier`).

---

## 7. Ordre de réalisation suggéré
0. **P0 d'abord** — garde de verrou (« quick ») avant toute écriture corpus → `.Sonal` ; puis
   durcissement « correct » (verrouiller/écrire/déverrouiller). **Indépendant, prioritaire.**
1. Helper `unionTabAnon` + union du global au **refresh** (Modif 2, branche gitlab) → règle P2, faible risque.
2. **Read-merge-write** dans `sauvegarderCorpus` + réconciliation `tabEnt` (Modif 1) → règle P1/P3.
3. Étendre à la branche **distant** de `rafraichirCorpus`.
4. (option) Détection conflits P4 + UI.
5. (option) CAS GitLab pour la concurrence résiduelle.
