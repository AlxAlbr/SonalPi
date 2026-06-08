# PlanPoo 2 — Vers une architecture « objets = source de vérité » (Niveau 2)

> **Document de travail prospectif.** Ceci n'est PAS la suite naturelle de [PlanPoo.md](PlanPoo.md) :
> c'est un **deuxième chantier, optionnel et d'une autre nature** — un changement d'**architecture**.
> À ne lancer que sur une **branche dédiée**, après avoir mesuré l'effort. Le premier chantier
> (PlanPoo) est terminé et autosuffisant ; l'app fonctionne sans celui-ci.
>
> **🛑 État réel à l'arrêt (à lire avant le reste).** Ce chantier a été **partiellement réalisé puis
> arrêté volontairement**. Concrètement, seules les **commandes EAV** (variables / modalités / valeurs,
> §2) sont en place ; le reste de la *surface cible* décrite ci-dessous est resté **prospectif**.
> Surtout, la famille **« événements » + l'Étape C (synchro multi-fenêtres) a été tentée puis RETIRÉE**
> (cf. §4) : dans cette app les vues **s'excluent mutuellement** (ouvrir l'une ferme les autres), donc
> il n'y a jamais deux copies vivantes du modèle à synchroniser — le bénéfice qui motivait toute
> l'architecture événements est **sans objet**. **L'architecture retenue se limite donc à
> commandes + requêtes** (pas d'événements). Les sections §2 et §7 ci-dessous décrivent la *cible
> initiale* et sont conservées comme trace de réflexion : lire chaque mention d'« événements » /
> « Étape C » à la lumière de cet encart.

---

## 0. Continuité & différence avec le premier chantier (PlanPoo.md)

### Ce qu'on a fait (PlanPoo — « étape 1 »)
Un **refactoring strangler SANS changer l'architecture** : extraire la logique métier dans des
**modules de domaine purs et testés** (`domain/*.mjs`), pendant que le renderer continue de
**déléguer** à ces modules via `window.SonalDomain`. L'app n'a **jamais cessé de fonctionner**,
aucun comportement visible ni format n'a changé. Modèle conservé :

```
État canonique = globaux du process MAIN (tabEnt/tabVar/tabDic/tabDat/tabThm + Corpus meta)
              ↕  IPC « données » : get-* / set-*
Renderer = scripts globaux + domaine ESM (wrappers de snapshots : pull → wrap → opère → push)
```

Acquis réutilisables (≈ **78 tests** Node, `npm test`) :
`metadonnees.mjs` (Variable/Modalite/Donnee), `corpus.mjs` (parse/serializeCorpus + agrégat
`Corpus`), `entretien.mjs` (`Entretien`), `codebook.mjs` (`Categorie`/`Codebook`),
`anonymisation.mjs` (`RegleAnon`), `sonal.mjs` (parse/serializeSonal), `document.mjs`
(`Document`/`Segment`/`Fragment`/`Extrait` + `renumeroter` + `HistoriqueDocument`).

> **Plafond assumé de l'étape 1** : les classes de domaine sont des **wrappers de lecture/requête +
> logique pure**, PAS des objets vivants qui possèdent leur état et se persistent. Les **commandes**
> (ajouter/supprimer/renommer un entretien…) sont restées des **fonctions libres** dans le renderer.
> Cf. PlanPoo §6 (décision Phase 3 : « main = source de vérité, domaine = wrappers »).

### Ce que vise ce chantier (PlanPoo2 — « étape 2 »)
Faire des **objets la source de vérité**, avec de **vraies commandes** (`corpus.ajouterEntretien()`
qui possède l'état **et** se persiste). Cela **impose de changer la topologie de la vérité** et la
**frontière IPC** : on passe d'une frontière « données » (get/set de blobs) à une frontière
« **commandes + événements** ».

### La vraie différence (à garder en tête)
| | Étape 1 (PlanPoo) | Étape 2 (PlanPoo2) |
|---|---|---|
| Nature | refactoring **interne**, strangler | changement **d'architecture** |
| Comportement | inchangé (non-régression stricte) | inchangé pour l'utilisateur, mais **frontière IPC réécrite** |
| Réversibilité | très réversible, par petits pas | plus engageant (touche main + renderer + IPC) |
| Source de vérité | **main**, via get/set | **main**, via **agrégat vivant** + commandes/événements |
| Domaine | wrappers de snapshots (renderer) | **modèle exécuté dans le main** |
| Risque | faible | moyen/élevé (chemin central + persistance) |

### Continuité (l'essentiel n'est pas jeté)
Le **domaine pur de l'étape 1 EST la fondation** de l'étape 2 : ces classes deviennent **le modèle
du main**, quasi inchangées. Ce qui change, c'est **la frontière** (IPC) et **le lieu d'exécution**
(main), pas la logique métier. On capitalise, on ne réécrit pas le métier.

### ⚠️ Prérequis pratique
**Créer une branche dédiée à partir de la branche actuelle** (celle qui contient tout l'étape 1) :
```bash
git checkout <branche-étape-1>
git checkout -b archi-niveau2     # tout le travail PlanPoo2 vit ici
```
Ne pas faire ça sur la branche de l'étape 1 : l'étape 2 est exploratoire et engageante.

### Dettes héritées de PlanPoo (toujours valables)
- Validation **GUI distant/gitlab** (tout n'a été validé qu'en local).
- `recueil.js` non encapsulé (dépend du Document).
- Éditions structurelles du `.sonal` = couche de vue (décision §8 PlanPoo) — **reste vrai** ici
  (voir §5 ci-dessous, « l'édition DOM survit »).

---

## 1. Pourquoi l'Option A (vérité dans le main)

On a comparé trois cibles (cf. discussion) :

- **A — Vérité dans le MAIN ; renderer = vue mince (commandes/événements).** ✅ Idiome Electron,
  réconcilie avec le plan d'origine (`Corpus.storage()` = `StorageFactory`, déjà main-side), donne
  de vraies méthodes de commande qui possèdent état + persistance.
- **B — Vérité dans le RENDERER ; main = stockage bête.** ❌ Bloqué par le **multi-fenêtres**
  (`index.html` + `edition_entretien.html` = deux contextes JS → deux copies du modèle → synchro).
  Faisable seulement en consolidant à une fenêtre ou via un bus de synchro.
- **C — Repository/Store explicite.** Orthogonal (pattern DDD), à combiner avec A.

**Retenu : A**, éventuellement structuré avec un Repository (C) pour load/save.

```
MAIN (modèle vivant)                         RENDERER(s) (vue)
  Corpus ── possède ──► Entretien[]                 envoie des COMMANDES ──►
  .ajouterEntretien() { persiste via Storage }      ◄── reçoit ÉTAT / ÉVÉNEMENTS pour (re)rendre
  StorageFactory (déjà là, Phase 1)
```

~~Bonus structurel : les **événements diffusés à toutes les fenêtres** rendent la **synchro
multi-fenêtres gratuite** (fini le « push puis re-pull / rafraîchir » manuel).~~
> ⚠️ Ce « bonus » était la motivation centrale — il s'est révélé **sans objet** : les vues s'excluent
> (ouvrir l'une ferme les autres), donc pas de multi-fenêtres à synchroniser. Événements abandonnés (§4).

---

## 2. Surface IPC cible (CQRS-léger)

> ⚠️ **Cible initiale (CQRS-léger à trois familles), partiellement abandonnée.** Telle qu'imaginée
> au départ, la surface visait trois familles. **La famille « Événements » a finalement été abandonnée**
> (cf. encart en tête + §4) : l'archi réelle se limite à **commandes + requêtes**, et les commandes
> **n'émettent pas d'événement** — elles **renvoient directement l'état modifié** dans leur retour
> (`{ ok, tabVar, tabDic, … }`). La table « Événements » plus bas est barrée pour cette raison.

Trois familles étaient visées pour remplacer les `get-*`/`set-*` :
- **Commandes** (renderer → main, `invoke`) : verbe d'intention ; le main mute l'agrégat, **persiste**,
  retourne `{ok, …}` **avec les tranches d'état modifiées** (et non un événement — cf. encart).
- **Requêtes** (renderer → main, `invoke`) : lire pour afficher ; retourne un **snapshot** (`toJSON`),
  jamais muté par le renderer.
- ~~**Événements** (main → fenêtres, `send`) : « l'état a changé » → re-render.~~ **Abandonné** (§4).

Convention : `agrégat:verbe` (commande), `agrégat:état` (requête). ~~`agrégat:participePassé` (événement).~~

### Commandes — Corpus (cycle de vie)
| Canal | Charge | Retour |
|---|---|---|
| `corpus:ouvrir` | `{source:'local'\|'distant'\|'gitlab', config}` | `{ok, etat}` |
| `corpus:sauvegarder` | `{}` | `{ok}` |
| `corpus:rafraichir` | `{}` (collaboratif) | `{ok}` |
| `corpus:fermer` | `{}` | `{ok}` |

### Commandes — Entretiens
| Canal | Charge | Retour |
|---|---|---|
| `corpus:ajouterEntretien` | `{fichierTexte, fichierAudio?}` | `{ok, id}` |
| `corpus:supprimerEntretien` | `{id}` | `{ok}` (cascade) |
| `entretien:renommer` | `{id, nom}` | `{ok}` |
| `entretien:enregistrerDocument` | `{id, html, notes}` | `{ok}` (écrit le `.sonal`) |
| `entretien:verrouiller` / `:deverrouiller` | `{id}` | `{ok}` |

### Commandes — Variables / Modalités (EAV)
| Canal | Charge |
|---|---|
| `corpus:ajouterVariable` | `{code, libelle, portee, privee}` |
| `corpus:modifierVariable` / `:supprimerVariable` | `{code, …}` (cascade pour suppr) |
| `entretien:definirValeur` | `{entretien, variable, locuteur, libelle}` → `{ok, modalite}` |
| `corpus:renommerModalite` | `{variable, code, libelle}` |

### Commandes — Codebook / Anonymisation
| Canal | Charge |
|---|---|
| `corpus:ajouterCategorie` / `:modifierCategorie` / `:supprimerCategorie` / `:deplacerCategorie` | `{…}` |
| `entretien:ajouterRegleAnon` / `:supprimerRegleAnon` | `{id, entite, remplacement}` |

### Requêtes (lecture)
| Canal | Retour |
|---|---|
| `corpus:etat` | snapshot `{meta, entretiens[], variables, modalites, codebook, …}` |
| `entretien:document` `{id}` | `{html, notes, …}` |
| `corpus:donnees` | vue calculée (union `tabDat`) si besoin |

### ~~Événements (main → fenêtres)~~ — ABANDONNÉ (cf. encart en tête + §4)
> Famille **non retenue** : les vues s'excluent mutuellement, donc rien à synchroniser entre fenêtres.
> Les commandes renvoient l'état modifié dans leur retour ; pas de canal `send` côté main.
> Table conservée pour mémoire de la cible initiale uniquement.

| ~~Canal~~ | ~~Charge~~ |
|---|---|
| ~~`corpus:ouvert`~~ | ~~`{etat}`~~ |
| ~~`corpus:modifie`~~ | ~~`{etat}` (ou un delta)~~ |
| ~~`entretien:modifie`~~ | ~~`{id}`~~ |
| ~~`entretien:verrou-change`~~ | ~~`{id, verrouille, utilisateur}`~~ |
| ~~`progression`~~ | ~~`{message, pourcent}`~~ |

### Disparaissent (cible initiale — **non atteinte**, voir encart)
> En pratique, seuls `get-var`/`set-var` et `get-dic`/`set-dic` sont *partiellement* court-circuités par
> les commandes EAV (qui renvoient l'état). Tous les autres get/set ci-dessous **sont conservés** : le
> chantier s'est arrêté à l'EAV.

~~`get-corpus`/`set-corpus`, `get-ent`/`set-ent`, `get-var`/`set-var`, `get-dic`/`set-dic`,
`get-dat`/`set-dat`, `get-thm`/`set-thm` → remplacés par `corpus:etat` (lecture) + commandes
(écriture) + événements (synchro).~~ Cible non atteinte ; pas d'événements (abandonnés). Le cycle
« pull → muter → push » **survit** pour tout sauf l'EAV.

---

## 3. Décision préalable : exécuter le domaine dans le main

Le domaine est en **ESM pur** ; le main est en **CommonJS** (`package.json` sans `"type":"module"`).
Pour exécuter `domain/*` dans le main, trancher :
- **import dynamique** `await import('./domain/…')` depuis le CommonJS (faible friction, async à l'init), **ou**
- passer le projet/main en **ESM** (`"type":"module"` + ajustements), **ou**
- une **étape de build** (esbuild) — cf. PlanPoo §2 (Option B « bundler »), restée optionnelle.

Recommandation : **import dynamique** pour commencer (zéro outillage), réévaluer si besoin.

> **✅ Décision actée (spike validé).** L'import dynamique ESM-depuis-CommonJS **fonctionne** :
> `await import(pathToFileURL('domain/corpus.mjs'))` charge le domaine dans un contexte
> CommonJS, et `Corpus.fromParts(...)` s'instancie **sans `window`/DOM**. Spike non destructif posé
> dans `main.js` (`app.on('ready')`, loggue `[spike PlanPoo2] … ✓` — à retirer en Étape A).
> **Caveat clé** : côté main, importer les **modules de domaine directement** (`corpus.mjs`,
> `document.mjs`…), **PAS `index.mjs`** (qui pose `window.SonalDomain` et n'a pas de `window` en main).
> Le domaine devient ainsi consommé des deux côtés : `window.SonalDomain` (renderer) / `import` (main).

---

## 4. Y aller **incrémentalement** (même un changement d'archi peut se stranglier)

L'astuce : un **shim de compatibilité** garde les `get/set` vivants au-dessus d'un agrégat réel,
le temps de migrer les appelants un par un.

1. **Étape A — Agrégat unique dans le main, derrière un shim.** Remplacer les globaux
   `tabEnt`/`tabVar`/… par **une instance `Corpus`** dans le main. Les `get-*`/`set-*` existants
   deviennent des **adaptateurs** (`get-ent` → `corpus.toEntretiens()` ; `set-ent` → reconstruit
   l'agrégat). Le renderer **ne bouge pas**. Le main devient *vraiment* autoritaire, sans casser.
2. **Étape B — Commandes en parallèle (strangler).** Ajouter les canaux `corpus:*`/`entretien:*` ;
   migrer les appelants du renderer de « pull-mutate-push » vers « envoyer une commande », **un par un**.
   Les shims get/set restent tant que tous les appelants ne sont pas migrés.
3. ~~**Étape C — Événements + vues réactives.** Émettre `corpus:modifie` après chaque commande ;
   les fenêtres se re-rendent depuis l'état reçu ; supprimer les rafraîchissements manuels.~~
   **❌ ABANDONNÉE** (tentée puis retirée — voir le bloc d'avancement plus bas).
4. **Étape D — Retrait des shims.** Une fois plus aucun appelant get/set, supprimer ces canaux.
5. **Étape E — Nettoyage.** Les fonctions libres de mutation du renderer deviennent de minces
   émetteurs de commandes ; la logique vit dans l'agrégat (main).

> Ainsi l'étape 2, bien que « changement d'archi », se déroule **derrière un shim**, par petits pas
> testables — fidèle à l'esprit strangler de l'étape 1.

> **🟡 EN COURS — pivot vers une tranche VERTICALE d'abord (validé avec l'utilisateur).** Constat en
> cadrant `main.js` : les **écritures** des globaux sont **centralisées** (7 handlers `set-*`,
> bon), mais (1) la forme de l'agrégat domaine ≠ l'état du main (meta + 5 tableaux + `ent_cur`,
> getters `dossier` vs `folder`…) et (2) les **lectures** des globaux (`Corpus.folder`/`.type`, `tabEnt`)
> sont **dispersées** dans `main.js`. Donc l'Étape A « horizontale » (swap d'état complet) est
> invasive. **On pivote** : faire **une commande de bout en bout** d'abord (proof du pattern, faible
> risque, informatif), la consolidation d'état venant ensuite. (a) et (b) **convergent** au même
> point d'arrivée tant qu'on fait la consolidation à la fin.
>
> **✅ Posé** : helper `domaine()` dans `main.js` (import dynamique **mémoïsé** des modules
> `domain/*`), et **1ʳᵉ commande** `corpus:ajouterVariable` (`{code,libelle,portee,privee}`) qui
> exécute `metadonnees.ajouterVariable` côté main et réécrit `tabVar`/`tabDic`. **DORMANTE** : nouveau
> canal, l'ancien chemin `gestion_data.js:addVar` intact (rien câblé côté renderer). Persistance `.crp`
> = flux sauvegarde existant. Vérifié : `node --check` + preuve fonctionnelle du corps du handler en Node.
> **🟡 Bascule renderer FAITE (à valider GUI)** : `gestion_data.js:addVar` (branche création)
> n'exécute plus le domaine en local — il **envoie la commande** `corpus:ajouterVariable` (via le
> `invoke` générique du preload), puis **re-tire** `tabVar`/`tabDic` (`getVar`/`getDic`) pour que la
> suite (positionnement, modalités, affichage) travaille à jour. `repositionnerVar` + `setVar`
> restent côté renderer (colle transitoire, attendue en voie (a)). **À valider en GUI** : créer une
> variable (position + modalités) → apparaît/persiste, console propre. **Boucle commande prouvée
> de bout en bout : renderer → main → domaine → état → renderer.**
> **✅ Bloc « Commandes — Variables / Modalités (EAV) » COMPLET** (5 commandes d'écriture) :
> - `corpus:ajouterVariable` (bascule `addVar`, ✅ GUI)
> - `corpus:modifierVariable` (bascule `sauvVar`, ✅ GUI)
> - `corpus:supprimerVariable` (bascule `supprVar`, ✅ GUI — **cascade** `tabVar`/`tabDic`/`tabEnt`/`tabDat`)
> - `entretien:definirValeur` (bascule `validMod` — modalité max+1 + valeur dans le `tabDat` de l'entretien) 🟡 à valider GUI
> - `corpus:renommerModalite` (bascule `chgDic`) 🟡 à valider GUI
>
> Patron constant : handler main (exécute le domaine, met à jour les globaux) + `electronAPI.invoke(...)`
> côté renderer + re-pull des globaux impactés. ⚠️ `chgDic` étant appelé en boucle, ses appelants
> (`addVar`/`sauvModas`) sont passés en `for...of await` (le re-pull de `tabDic` doit précéder la
> sauvegarde du `.crp` qui lit le `tabDic` local). Les **lectures** (`getMod`/`inventaireVariables`)
> restent locales (domaine renderer) — deviendront des *requêtes* (`corpus:etat`/`:donnees`) plus tard.
> **✅ Colle re-pull supprimée (Option 1) — « les commandes renvoient l'état ».** Chaque commande EAV
> renvoie les tranches modifiées (`{ ok, tabVar, tabDic, tabEnt?, tabDat?, modalite? }`) et le renderer
> les utilise directement, **au lieu** de `getVar/getDic/getEnt/getDat` séparés. → 1 aller-retour au
> lieu de 2-5 par commande. Aucun re-pull EAV restant.
>
> **⚠️ Cadrage consolidation complète (Étape A horizontale) — REPORTÉE.** Mesure dans `main.js` :
> ≈ **200 lectures de globaux**, dont **`Corpus` méta = 112** (folder/type/url/content — I/O fichier,
> Storage, dialogues), **sans rapport avec l'EAV**. La consolidation *complète* (agrégat = état unique,
> réécrire toutes les lectures) est donc **chère et risquée à cause de `Corpus`**, pour un bénéfice
> surtout interne (le main tiendrait un agrégat vivant). Une consolidation *EAV-only* serait petite
> (~12 sites hors handlers) mais à bénéfice modeste. **Décision : ne pas consolider pour l'instant** —
> l'architecture commande (les événements ont été abandonnés, cf. plus bas) donne l'essentiel ; la consolidation reste un
> **idéal lointain optionnel**.
>
> **❌ Étape C — TENTÉE puis RETIRÉE (multi-fenêtres sans objet).** Une première slice avait été
> posée : le main diffusait `corpus:modifie` à toutes les fenêtres sauf l'émettrice
> (`diffuserCorpusModifie`), `preload` exposait `onCorpusModifie`, et `gestion_data.js` rafraîchissait
> la vue de données si elle était ouverte. **Ce code a été entièrement retiré.** Raison : dans cette
> app, **les vues s'excluent mutuellement** — ouvrir une fenêtre ferme les autres, donc il n'y a jamais
> deux copies vivantes du modèle à synchroniser. Le bénéfice phare de l'Étape C (synchro multi-fenêtres
> gratuite, qui motivait toute l'architecture événements) est donc **sans objet ici**. Aucune trace
> dans le code : ni `diffuserCorpusModifie`, ni `onCorpusModifie`, ni le canal `corpus:modifie`.
> **Conséquence** : l'Étape C est abandonnée pour de bon (pas « à faire plus tard »), et avec elle la
> famille « événements » de la surface IPC cible (§2). L'archi retenue se limite à **commandes +
> requêtes** ; les commandes renvoient directement l'état modifié (cf. bloc EAV ci-dessus).

---

## 5. Points durs & garde-fous

- **Édition DOM (segmentation) — elle survit.** On ne transforme PAS chaque découpe en commande IPC.
  La fenêtre entretien **édite le `.sonal` en local** (interaction DOM riche = vue) et n'envoie
  **qu'une** commande `entretien:enregistrerDocument {id, html}` **à la sauvegarde**. On garde l'UX
  fluide **et** la vérité dans le main. (Lève la tension « vue mince vs édition lourde ».)
- **Verrous / collaboratif.** Les commandes côté main sont le bon endroit pour centraliser les
  verrous (vérifier/poser avant mutation distante) — à valider en **distant/gitlab** (dette héritée).
- **Coût de sérialisation.** ~~`corpus:etat` renvoie un gros snapshot ; préférer des **événements delta**
  (`entretien:modifie {id}` + requête ciblée) pour les gros corpus.~~ *Garde-fou caduc (pas d'événements).*
  En pratique les commandes EAV renvoient déjà des **deltas** (les seules tranches touchées), pas tout l'état.
- **Atomicité.** Une commande = une transaction (muter + persister + émettre). En cas d'échec de
  persistance, ne pas émettre / rollback l'agrégat.
- **Tests.** L'agrégat enrichi de commandes reste **pur et testable en Node** (les commandes
  renvoient un nouvel état ou mutent l'agrégat en mémoire ; l'I/O est injecté via le Repository/Storage).

---

## 6. Critères de réussite

> Critères de la **cible initiale**. Le chantier ayant été arrêté à l'EAV (et les événements
> abandonnés, cf. encart en tête), plusieurs ne s'appliquent plus — annotés ci-dessous.

- ~~Plus aucun `get-*`/`set-*` de **données métier** dans l'IPC~~ — **non atteint / non visé** : seul l'EAV
  est passé en commandes ; le reste reste volontairement sur get/set (cf. §4 et docs/ARCHITECTURE.md).
- ~~`Corpus` (main) est l'**unique** détenteur de l'état~~ — **non visé** : consolidation reportée (§4).
- ~~Les deux fenêtres restent synchronisées sans rafraîchissement manuel (via événements).~~
  **Abandonné** : pas de multi-fenêtres simultané (les vues s'excluent), donc rien à synchroniser.
- Le domaine `domain/*` est réutilisé **tel quel** comme modèle du main (peu de modifications). ✅ (EAV)
- App iso-fonctionnelle pour l'utilisateur ; formats `.crp`/`.sonal` toujours préservés (golden). ✅
- Validé en GUI **local ET distant/gitlab**. 🟡 reste à valider (distant/gitlab + commandes 🟡 de §4).

---

## 7. Ordre conseillé (récap) — *ce qui a réellement été fait en gras*

```
0. Brancher (archi-niveau2) ───────────────────────────────────────────►  ✅ fait (branche TestPoo2)
1. Décider l'exécution du domaine dans le main (import dynamique)          ✅ fait (helper domaine())
2. Étape A : agrégat Corpus dans le main, derrière shim get/set            ⏸ reportée (consolidation, §4)
3. Étape B : canaux commandes, migration des appelants un par un           ✅ partiel : bloc EAV uniquement
4. Étape C : événements + vues réactives                                   ❌ abandonnée (tentée puis retirée, §4)
5. Étape D : retrait des shims get/set                                     ⏸ non fait (get/set conservés)
6. Étape E : nettoyage des fonctions libres → émetteurs de commandes       ⏸ non fait
```

> **Point d'arrêt réel** : seules les étapes 0, 1 et **B-pour-l'EAV** sont en place. L'Étape C
> (événements) est **abandonnée définitivement** ; les étapes A, D, E sont **reportées** sans échéance.

> Rappel final : ce chantier est **optionnel**, et il a été **arrêté volontairement** après l'EAV.
> L'étape 1 (PlanPoo) a déjà isolé et testé le métier ; l'étape 2 ne se justifierait pleinement que
> si l'on voulait des **objets vivants détenteurs de la vérité** ET une **synchro multi-fenêtres** —
> or cette dernière est **sans objet ici** (les vues s'excluent). L'architecture actuelle
> (main = vérité via wrappers + commandes EAV) est **saine et suffisante** ; c'est le point d'équilibre
> assumé (voir aussi [ARCHITECTURE.md](../docs/ARCHITECTURE.md), section « Coexistence assumée des deux patterns IPC »).
