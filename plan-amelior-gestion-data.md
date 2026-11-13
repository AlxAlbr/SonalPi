# Plan d'amélioration de la gestion des variables (tabVar / tabDic / tabDat)

Ce document analyse la gestion actuelle des métadonnées d'entretiens (variables, modalités, valeurs) et propose un plan en deux phases : d'abord des améliorations à architecture constante, puis l'exploration d'un changement d'architecture où **l'entretien devient l'unique niveau d'écriture** et le corpus une simple agrégation.

---

## 0. État des lieux

### 0.1 Les trois tableaux

| Tableau | Contenu | Niveau conceptuel |
|---------|---------|-------------------|
| `tabVar` | définitions des variables `{v, lib, champ: gen/loc, priv}` | **Corpus** (partagé par tous les entretiens) |
| `tabDic` | dictionnaire des modalités `{v, m, lib}` | **Corpus** (partagé) |
| `tabDat` | valeurs prises `{e, v, l, m}` | **Entretien** (propre à chacun) |

### 0.2 Où ces tableaux sont-ils stockés aujourd'hui ?

Pour un corpus de N entretiens, chaque tableau existe en **plusieurs exemplaires simultanés** :

1. **Variables globales du renderer** (`tabVar`, `tabDic`, `tabDat`, `tabEnt` dans `gestion_corpus.js:15-17`) — cache mémoire, souvent périmé.
2. **Store du process main** via IPC (`get/setVar`, `get/setDic`, `get/setDat`, `get/setEnt` — `preload.js:79-94`) — la « vraie » mémoire de travail.
3. **Copies locales dans chaque entretien** : `ent.tabVar`, `ent.tabDic` (copies intégrales du global, resynchronisées à chaque sauvegarde — `gestion_corpus.js:907-910` et `updateVarsDsEnt`, `gestion_data.js:1480`) et `ent.tabDat` (données locales, désignées « source de vérité » dans `validMod`, `gestion_data.js:556`).
4. **Fichier `.crp`** : contient `tabVar` et `tabDic` au niveau racine **et** une copie dans chaque élément de `tabEnt` (`gestion_corpus.js:919`). Soit **N+1 copies de tabVar/tabDic dans un seul fichier**.
5. **Fichiers `.sonal`** (un par entretien) : chacun embarque `tabVar` global, `tabDic` global, `tabThm` global et le `tabDat` local (`sauvHtml`, `gestion_fichiers.js:796-870`). Soit **N copies de plus**.

Au total, un corpus de 30 entretiens persiste `tabVar` **61 fois** (1 racine .crp + 30 dans tabEnt du .crp + 30 dans les .sonal).

### 0.3 La double écriture identifiée

Concrètement, une modification de variable (`addVar`/`sauvVar`, `gestion_data.js:16-265`) déclenche en cascade :

```
setVar(tabVar)                    → store main
sauvegarderCorpus(false)          → réécrit tout le .crp (avec N+1 copies)
updateVarsDsEnt()                 → recopie tabVar dans chaque ent.tabVar + setEnt
majFichierSonal()                 → RÉÉCRIT LES N FICHIERS .sonal (chacun avec tabVar/tabDic globaux)
```

Et une modification de **valeur** (`validMod`, `gestion_data.js:514`) écrit dans `ent.tabDat` (déclaré source de vérité) tandis que le `tabDat` global est reconstruit par agrégation… à **trois endroits différents avec trois implémentations différentes** :

- `inventaireVariables` (`gestion_data.js:875-890`) — reconstruction avec dédoublonnage `findIndex`;
- `cleanVariables` (`gestion_data.js:1741-1744`) — reconstruction par `flatMap` + tri;
- `sauvegarderCorpus` (`gestion_corpus.js:913-917`) — reconstruction par `flatMap` sans dédoublonnage ni tri.

### 0.4 Autres fragilités constatées

- **Types hétérogènes** : `d.e` est tantôt `String(ent.id)`, tantôt un rang, tantôt un id numérique ; les comparaisons alternent `==`, `===`, `String(...)===String(...)`. `cleanVariables` normalise, mais les écritures en amont ne respectent pas toutes la convention.
- **Champ `e` redondant** dans `ent.tabDat` : l'entretien parent est connu, le champ ne sert qu'à l'agrégation et doit être resynchronisé (`{...d, e: String(ent.id)}`).
- **Partage de référence** : `updateVarsDsEnt` et `sauvegarderCorpus` font `ent.tabVar = tabVar` — tous les entretiens pointent alors vers **le même objet tableau** en mémoire renderer (l'IPC clone ensuite, mais toute mutation locale avant envoi affecte tous les entretiens).
- **Code mort ou cassé** : `changeDat` (`gestion_data.js:847`) pose `.codeMod` sur un tableau retourné par `filter` (aucun effet) ; gros blocs commentés dans `inventaireVariables` ; fonctions de debug `pointvariables`.
- **Risque de résurrection** : au chargement, `loadHtml` écrase `ent.tabVar`/`ent.tabDic` avec le contenu du `.sonal` (`gestion_entretiens.js:366-369`), puis `inventaireVariables` **réinjecte dans le tabVar global** toute variable trouvée dans un `ent.tabVar` (`gestion_data.js:922-927`). Une variable supprimée du corpus mais présente dans un `.sonal` non réécrit (échec réseau, fichier restauré, autre utilisateur) **ressuscite silencieusement**.
- **Coût d'écriture** : chaque ajout/édition de variable réécrit N fichiers `.sonal` complets (HTML inclus) — coûteux en local, très coûteux en mode distant/GitLab (N requêtes serveur ou commits).

---

## Phase 1 — Améliorations à architecture constante

Objectif : fiabiliser sans rien changer aux formats de fichiers ni aux flux. Chaque item est indépendant et livrable séparément, dans l'ordre proposé.

### 1.1 Unifier la reconstruction du tabDat global

Créer une fonction unique `rebuildTabDatGlobal(tabEnt)` (dans `gestion_data.js`) qui : filtre les lignes invalides, normalise les types, dédoublonne sur `(e, v, l)`, trie. Remplacer les trois implémentations (`inventaireVariables`, `cleanVariables`, `sauvegarderCorpus`) par des appels à cette fonction. C'est le prérequis de tout le reste : une seule définition de « qu'est-ce qu'un tabDat global valide ».

### 1.2 Normaliser les types aux frontières d'écriture

Créer un petit module de helpers :

```js
normDatLigne(d, entId)  // → { e: String(entId), v: Number, l: "all"|Number, m: Number }
memeLigneDat(a, b)      // comparaison canonique (e, v, l)
```

L'appliquer partout où l'on **pousse** dans un `ent.tabDat` (`validMod`, `getMod`, import) au lieu de compter sur `cleanVariables` pour rattraper après coup. Documenter la convention (`e` = `String(ent.id)`, jamais le rang) en tête de `gestion_data.js`.

### 1.3 Supprimer le code mort et clarifier les rôles

- Supprimer `changeDat` (cassée, jamais utile), les blocs commentés d'`inventaireVariables`, les fonctions de pointage debug (ou les garder derrière un flag).
- Renommer/commenter clairement les trois fonctions de synchronisation restantes en indiquant **le sens du flux** : `inventaireVariables` (entretiens → global, au chargement), `updateVarsDsEnt` (global → entretiens, après édition), `cleanVariables` (assainissement).

### 1.4 Casser le partage de référence

Dans `updateVarsDsEnt` et `sauvegarderCorpus`, remplacer `ent.tabVar = tabVar` par une copie (`structuredClone(tabVar)` ou `tabVar.map(v => ({...v}))`). Faible coût, supprime une classe entière de bugs d'aliasing.

### 1.5 Encadrer la résurrection de variables

Dans `inventaireVariables`, ne plus ajouter aveuglément au global toute variable trouvée dans un `ent.tabVar`. Deux garde-fous possibles (cumulables) :

- ne fusionner depuis les entretiens que si le `tabVar` global est **vide** (cas réparation/migration), sinon considérer le `.crp` comme faisant autorité ;
- si une variable « inconnue » remonte d'un `.sonal`, la signaler à l'utilisateur (notification « variable X trouvée dans l'entretien Y mais absente du corpus — réintégrer ? ») au lieu de l'ajouter en silence.

### 1.6 Réduire les réécritures massives

`addVar`/`sauvVar`/`supprVar` appellent `majFichierSonal()` sans bornes → N fichiers réécrits à chaque édition de variable. Améliorations sans changer le format :

- **différer** : marquer les entretiens « à réécrire » (dirty flag) et réécrire au moment de la sauvegarde corpus ou à la fermeture, plutôt qu'à chaque frappe de dialogue ;
- au minimum, **dédupliquer** les appels successifs (une édition de variable enchaîne aujourd'hui `sauvegarderCorpus` + `updateVarsDsEnt` + `majFichierSonal` + parfois `affichDataGen` qui relance `inventaireVariables` qui refait `setDat`…).

### 1.7 Fonction de vérification de cohérence (dev)

Ajouter `verifierCoherenceDonnees()` exécutable en console : détecte les `ent.tabDat` avec `e` divergent, les modalités de `tabDat` absentes de `tabDic`, les variables de `tabDic`/`tabDat` absentes de `tabVar`, les doublons `(e,v,l)`, les divergences entre `tabDat` global et l'agrégat des locaux. Servira de filet pendant la Phase 2.

### 1.8 Documenter le modèle de données

Un court `docs/modele-donnees.md` (ou une section de CLAUDE.md) : les trois tableaux, la convention de types, les lieux de stockage, le sens des flux de synchronisation. Indispensable avant de toucher à l'architecture.

**Critère de sortie de la Phase 1** : une seule fonction d'agrégation, des types canoniques à l'écriture, `verifierCoherenceDonnees()` qui passe sur les corpus de test (dont CorpusTuto), aucune régression sur : édition de valeur (fenêtre entretien + tableau global), ajout/édition/suppression de variable, tris à plat, export CSV, import d'un `.sonal` étranger, mode distant/GitLab.

---

## Phase 2 — Changement d'architecture : l'entretien comme seul niveau d'écriture

### 2.1 La piste explorée

> Écrire uniquement au niveau de l'entretien ; le corpus n'est plus qu'une **agrégation calculée** des données d'entretiens.

Il faut d'emblée distinguer les deux natures de données, car la piste ne s'applique pas de la même façon aux deux :

- **`tabDat` (valeurs)** : la piste s'applique **pleinement et naturellement**. C'est déjà presque le cas (`ent.tabDat` est la source de vérité, le global est reconstruit). Il suffit d'aller au bout : le `tabDat` global cesse d'être persisté et devient une **vue calculée** (mémoïsée), jamais écrite dans le `.crp` ni considérée comme autoritaire.
- **`tabVar` / `tabDic` (définitions)** : la piste appliquée naïvement (« le tabVar du corpus = union des tabVar d'entretiens ») est **dangereuse**. Les définitions sont intrinsèquement un objet de niveau corpus : codes partagés, ordre d'affichage global, variables définies avant toute saisie. Les effets de bord sont analysés en 2.3.

D'où la **variante recommandée (architecture cible)** :

| Donnée | Écriture | Lecture corpus |
|--------|----------|----------------|
| `tabVar`, `tabDic`, ordre des variables | **Corpus uniquement** (racine du `.crp`), un seul point d'écriture | directe |
| `tabDat` | **Entretien uniquement** (`ent.tabDat` dans le `.sonal`) | vue agrégée calculée à la demande |
| Copies `ent.tabVar`/`ent.tabDic` dans `.crp` | **supprimées** | — |
| Copies `tabVar`/`tabDic` dans `.sonal` | conservées comme **instantané d'export** (portabilité), **jamais relues** au chargement d'un corpus | seulement à l'import d'un `.sonal` étranger, via `fusionTabVar` |

### 2.2 Ce que ça apporte

- Le `.crp` maigrit énormément (N+1 → 1 copie des définitions) et le diff GitLab devient lisible.
- Éditer une **valeur** ne touche plus qu'un seul `.sonal` (déjà le cas dans `validerCellGen`) ; éditer une **définition** ne touche plus que le `.crp` — plus de réécriture des N `.sonal` à chaque édition de variable.
- Multi-utilisateur (distant/GitLab) : les verrous par entretien (`isEntretienLocked`) deviennent réellement suffisants pour les valeurs, puisque deux utilisateurs éditant deux entretiens n'écrivent plus jamais les mêmes données.
- Le bug de résurrection disparaît structurellement : les `.sonal` ne sont plus une source pour les définitions.

### 2.3 Effets de bord et points de vigilance (à traiter AVANT de se lancer)

C'est la partie critique. Chaque point ci-dessous est un piège identifié dans le code actuel.

#### a) Suppression de variable — le problème des tombstones
Dans un modèle « corpus = agrégation », supprimer une variable exige de purger les N `ent.tabDat`. Si un `.sonal` n'est pas réécrit (coupure réseau en mode distant, fichier restauré depuis une sauvegarde, verrou posé par un autre utilisateur), ses lignes orphelines **reviendront à la prochaine agrégation**. À traiter :
- l'agrégation doit **filtrer par les variables existantes** (`tabDat agrégé = lignes dont v ∈ tabVar`) — les orphelines deviennent inertes au lieu de polluer ;
- prévoir un nettoyage paresseux : à la réécriture normale d'un `.sonal` (n'importe quelle cause), purger ses lignes orphelines ;
- ne **pas** tenter de réécrire les N fichiers de façon « atomique » : c'est impossible en distant, il faut que le système tolère les fichiers en retard.

#### b) Fraîcheur des `.sonal` au chargement
Aujourd'hui `loadHtml` fait confiance au `.sonal` pour `ent.tabDat` (avec déjà une rustine : « ne pas écraser un tabDat .crp valide avec un .sonal stale vide », `gestion_entretiens.js:368-369`). Si le `.crp` ne porte plus **aucune** copie des valeurs, le `.sonal` devient l'unique dépositaire : un `.sonal` corrompu/tronqué = perte des valeurs de l'entretien, sans filet. À décider explicitement :
- soit accepter (c'est la logique « un fichier = un entretien », cohérente avec l'esprit Sonal) et renforcer les sauvegardes (`sauvegarderAvecBackup`) ;
- soit versionner : ajouter un champ `datVersion`/`lastModified` dans le `.sonal` **et** dans l'entrée `tabEnt` du `.crp`, pour détecter au chargement un `.sonal` plus ancien que ce que le corpus a connu, et alerter au lieu d'écraser en silence.

#### c) Attribution des codes de modalités (`m = max+1`)
`validMod` et `addMod` allouent un nouveau code `m` en prenant le max **global** de `tabDic`. Tant que `tabDic` reste au niveau corpus (variante recommandée), pas de problème en mono-poste. Mais en multi-utilisateur distant, deux clients peuvent allouer le même `m` pour deux libellés différents entre deux rafraîchissements → **collision de codes** : les `ent.tabDat` des deux entretiens pointent le même `m` avec deux sens différents. Vigilance :
- la fusion au `rafraichirCorpus` doit détecter les collisions `(v, m)` avec libellés différents et re-mapper (réutiliser la mécanique de `fusionTabVar`, qui sait déjà faire ce remapping pour l'import) ;
- alternative plus robuste à terme : clés de modalités par libellé normalisé plutôt que par code séquentiel, ou allocation de code côté serveur.

#### d) Ce que l'agrégation ne peut PAS produire
Si « le corpus = agrégation des entretiens », ces informations n'ont **aucun entretien porteur** et doivent impérativement rester (ou devenir) des données de niveau corpus, sinon elles disparaissent :
- une **variable définie mais encore jamais saisie** (créée en début de campagne) ;
- une **modalité de dictionnaire jamais utilisée** (nomenclatures PCS pré-remplies par `ajoutListeModas`) ;
- l'**ordre d'affichage** des variables (`repositionnerVar` réordonne `tabVar` — c'est un état purement corpus) ;
- le caractère **privé/public** et le champ gen/loc : portés par `tabVar`, donc corpus.

C'est l'argument décisif pour la variante hybride : ces données n'étant pas agrégeables, un modèle 100 % entretien obligerait à élire un « entretien porteur » ou à dupliquer — on retomberait dans le problème actuel.

#### e) Performance de l'agrégation
Consommateurs actuels du `tabDat` global : `affichDataGen` (tableau de données), l'export CSV (passe par le DOM), et les tris à plat (qui, eux, lisent déjà directement les `ent.tabDat`). L'agrégation par `flatMap` sur tout `tabEnt` est O(total des lignes) — négligeable pour des corpus de dizaines/centaines d'entretiens, mais :
- ne pas la recalculer dans des boucles (aujourd'hui `affichDataGen` → `inventaireVariables` → reconstruction complète à chaque ouverture du tableau **et** à chaque changement de filtre via `changerFiltreGen`) ;
- prévoir une mémoïsation simple invalidée par toute écriture dans un `ent.tabDat` (un compteur de version suffit).

#### f) Compatibilité et migration des corpus existants
- **Lecture** : les `.crp` existants contiennent `ent.tabVar`/`ent.tabDic`/`crp.tabDat` — le loader doit les **ignorer sans erreur** (et non les supprimer à la lecture : on ne réécrit pas un fichier qu'on ne fait qu'ouvrir).
- **Écriture** : la première sauvegarde après migration purge naturellement les copies. Attention au cache `_dernierContenuCrp` (`gestion_corpus.js:927-940`) : le contenu changeant de forme, la première sauvegarde post-migration ne doit pas être « skippée ».
- **Mode mixte** : en distant/GitLab, un utilisateur avec l'ancienne version et un autre avec la nouvelle écriront des `.crp` de formes différentes. Prévoir soit un champ `formatVersion` dans le `.crp` avec refus poli des versions inconnues, soit une période où la nouvelle version lit les deux formes et écrit la nouvelle.
- **Import Sonal 2** (`lireCrpSonal2`) et **import `.sonal` étranger** (`importSONAL`/`fusionTabVar`) : à re-tester intégralement, ce sont eux qui peuplent les structures.

#### g) Le `.sonal` doit-il rester autoportant ?
Aujourd'hui un `.sonal` est un fichier autonome : il embarque thèmes, variables, dictionnaire — c'est ce qui permet `importSONAL` dans un autre corpus. Si on cesse d'y écrire `tabVar`/`tabDic`, on casse la portabilité. Recommandation : **continuer à les écrire** dans le `.sonal` (instantané au moment de la sauvegarde), mais ne **jamais les relire** au chargement d'un corpus. Coût : la duplication sur disque subsiste dans les `.sonal`, mais elle devient inoffensive (jamais source de vérité). C'est un compromis à acter explicitement.

#### h) Ordre des opérations au chargement
La séquence actuelle (`chargerCorpus` → `loadHtml` → `cleanVariables` → `inventaireVariables` → `reconstituerTabAnonGlobal`) mélange lecture, réparation et resynchronisation. En cible, elle devient : lire `.crp` (définitions) → lire les `.sonal` (valeurs + html) → construire la vue agrégée → vérification de cohérence (le `verifierCoherenceDonnees` de la Phase 1) avec **signalement** des anomalies plutôt que réparation silencieuse. Le comportement de réparation silencieuse actuel masque les bugs ; en changer est aussi un changement de philosophie à assumer.

### 2.4 Découpage proposé de la Phase 2

1. **2a — tabDat calculé** : supprimer `setDat`/`getDat` comme stockage autoritaire ; `tabDat` global devient `getTabDatGlobal()` (agrégation mémoïsée, filtrée par `tabVar`). Le `.crp` n'écrit plus `crp.tabDat` (déjà le cas) ni les copies ; les consommateurs (`affichDataGen`, `validerCellGen`) passent par la vue. Risque faible, gain immédiat.
2. **2b — définitions à écriture unique** : supprimer `updateVarsDsEnt` et la synchro `ent.tabVar = tabVar` de `sauvegarderCorpus` ; le loader ignore `ent.tabVar`/`ent.tabDic` ; `majFichierSonal` n'est plus appelé lors des éditions de définitions (le `.sonal` sera rafraîchi à sa prochaine écriture pour toute autre raison — voir 2.3.a nettoyage paresseux). C'est ici que se joue la décision 2.3.g.
3. **2c — versionnage et multi-utilisateur** : champ `formatVersion` dans le `.crp`, horodatage des `.sonal`, gestion des collisions de modalités au `rafraichirCorpus` (2.3.c).
4. **2d — retrait des rustines** : une fois 2a-2c stabilisés, simplifier `inventaireVariables` (réduit à un contrôle de cohérence), supprimer les reconstructions défensives de `cleanVariables` devenues redondantes.

**Prérequis absolu** : Phase 1 terminée (surtout 1.1, 1.2 et 1.7 — impossible de valider une migration sans fonction de cohérence).

**Jeu de tests de non-régression** (à dérouler sur CorpusTuto + un corpus réel, en local ET en distant/GitLab) :
- créer/éditer/supprimer une variable (gen et loc), réordonner ;
- saisir des valeurs dans la fenêtre entretien et dans le tableau global, avec locuteurs multiples ;
- tris à plat (toggle, isolation, non-réponses), export CSV, variables publiques (`varsPubliquesEnt`/`varsPubliquesXtr`) ;
- fermer/rouvrir le corpus (persistance), rafraîchir un corpus distant modifié par ailleurs ;
- importer un `.sonal` étranger avec variables en conflit de codes ;
- ouvrir un ancien `.crp` (pré-migration) et vérifier qu'une sauvegarde produit le nouveau format.

---

## Synthèse

| | Phase 1 | Phase 2 |
|---|---|---|
| Risque | faible (refactoring interne) | moyen (format de fichiers, multi-utilisateur) |
| Gain | fiabilité, lisibilité, moins d'écritures redondantes | fin structurelle de la double écriture, .crp léger, multi-utilisateur sain |
| Point dur | discipline sur les types et les flux | suppression de variable (tombstones), fraîcheur des `.sonal`, collisions de modalités |

La piste « tout au niveau entretien » est la bonne **pour les valeurs (`tabDat`)** — le code y tend déjà. Pour les **définitions (`tabVar`/`tabDic`)**, l'agrégation pure crée plus de problèmes qu'elle n'en résout (résurrection, codes en collision, données non agrégeables) : la cible saine est l'hybride « définitions au corpus, valeurs à l'entretien, agrégat calculé jamais persisté ».
