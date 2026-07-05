# DEMARRAGE — SonalAsynchro : le set minimum SonalPi (asynchrone, propre)

> **Changement de nature.** POC1/2/3 étaient des POC de *risque* ; leurs risques sont levés
> (annotations-calque et fusion CRDT au POC1-2, ancrage sans CRDT au POC3 — 12 tests verts,
> `../POC3/test/remap.test.ts`). SonalAsynchro est le premier incrément **produit** : une app avec laquelle un
> chercheur peut faire un vrai (petit) travail SonalPi — **importer un entretien, locutariser,
> thématiser, saisir des données** — sur l'architecture de [../POC3/DEMARRAGE3.md](../POC3/DEMARRAGE3.md)
> (modèle = vérité, DOM = projection, fichiers = I/O, ProseMirror sans Yjs). Le domaine reste le **plan
> conceptuel** de [../POC2/docs/MODELE_OBJET2.md](../POC2/docs/MODELE_OBJET2.md) (§1-§7 + règles de
> lecture n°1-3, communes aux deux cibles) ; son **plan technique SonalAsynchro** (fichiers, positions PM,
> identités, format natif) est [docs/MODELE_OBJET.md](docs/MODELE_OBJET.md) — le remplaçant des
> §8-§13 de MODELE_OBJET2 pour ce régime.

**Principe directeur** : plus *risk-first* mais **chemin-utilisateur-first** — chaque étape livre un
geste complet du chercheur, vérifiable sur un entretien réel. Le juge de paix n'est plus un test de
convergence : c'est **SonalPi lui-même** (un export doit s'y rouvrir).

---

## Le set minimum (périmètre)

**Dedans** — le cycle de travail élémentaire :

1. **Corpus local** : créer / ouvrir un dossier de corpus (`corpus.json` + `entretiens/*.json` —
   spec : [MODELE_OBJET §3](docs/MODELE_OBJET.md)).
2. **Import d'entretien** : `.srt`/`.vtt` (transcription) et `.sonal` (reprise de l'existant) ;
   `.txt` en bonus si gratuit.
3. **Éditeur** : texte en blocs WYSIWYG, corrections libres, undo/redo — les annotations suivent
   (acquis POC3).
4. **Locuteurs** : liste par entretien, renommage, attribution d'un bloc, scission de bloc.
5. **Thèmes** : codebook de corpus (créer/renommer/couleur/actif), poser/retirer un codage à la
   sélection (snap-to-mot), lecture des extraits d'un thème.
6. **Données** : variables/modalités de corpus (portée `gen`/`loc`), saisie des valeurs (fiche
   entretien, fiche locuteur), matrice corpus en lecture.
7. **Sauvegarde native + export `.sonal`** rouvrable dans SonalPi.

**Dehors** — différé, avec la raison :

| Différé | Pourquoi maintenant serait prématuré | Ce qui est déjà prêt |
|---|---|---|
| Anonymisation (UI) | gros morceau UI ; le set minimum n'en a pas besoin | modèle prêt (`type:'anon'`, 3 états, logique POC2 `anonymisation.ts` réutilisable telle quelle) |
| Audio + timing (UI) | différé depuis MODELE_OBJET2 §4 | `deb`/`fin` **conservés** à l'import (voir décision D2), jamais perdus |
| Multi-utilisateur (verrous) | c'est l'étape 4 de POC3, orthogonale au set minimum | le format « un fichier par entretien » est déjà à la bonne granularité |
| Hiérarchie du codebook (`rang` enfant) | le codage à plat couvre le geste de base | champ `rang` importé/réexporté sans UI (pas de perte au round-trip) |
| Recueil, synthèse, stats, exports csv/srt | lecture avancée, pas le cycle élémentaire | les requêtes (Extrait) en sont la base |

---

## Ce qui se réutilise (l'essentiel du SonalAsynchro existe déjà)

| Source | Pièce | Usage SonalAsynchro |
|---|---|---|
| **POC3** | `model/annotation.ts`, `model/entretien.ts`, `editor/remap.ts` + 12 tests | **le moteur** — vendoré tel quel, tests compris |
| **POC2** | squelette electron-vite (main/preload/renderer, IPC) | copié, sans `collab/` ni deps Yjs |
| **POC2** | `snap.ts` (snap-to-mot), `annotationsDecorations.ts` | adaptés : lisent le modèle TS au lieu du `Y.Array` |
| **POC2** | `model/anonymisation.ts` (matching pur) | embarqué sans UI (prêt pour un POC5) |
| **POC1** | `domain/sonal.mjs` (parse/serialize) + **fixtures + golden tests** | la mécanique de non-régression du format — reprise telle quelle |
| **POC1** | `importerSonal.ts` / `exporterSonal.ts` | adaptés : cible = modèle TS (plus de `Y.Doc`, plus d'ancres à créer — les positions absolues du parseur **sont** le format SonalAsynchro) |
| **SonalPi** | `domain/conversions.mjs` (`convertSRT`/`convertVTT`/`convertSpeaker`) | **réutilisé tel quel** — modules ES purs, déjà extraits pour test (voir D1) |

> À noter : l'adaptation POC1→SonalAsynchro des importeurs est une **simplification** (le POC1 convertissait les
> positions en ancres Yjs ; SonalAsynchro les garde telles quelles). Le seul code vraiment neuf du SonalAsynchro est
> **de l'UI** et la **persistance dossier**.

---

## Décisions structurantes (à acter avant d'écrire)

**D1 — Le sas d'import unique : tout format étranger passe par `.sonal`.** SonalPi fait déjà
`.srt/.vtt/.txt → formatSonal → import` ; ses convertisseurs sont des **modules ES purs et testés**
(`SonalPi/domain/conversions.mjs`, détection de locuteurs comprise — `convertSpeaker`, `<v Nom>` VTT).
SonalAsynchro reprend la même topologie : `fichier étranger → conversions.mjs → chaîne .sonal → importerSonal →
modèle`. Un **seul** point d'entrée dans le modèle (l'adaptateur `.sonal`), zéro parseur neuf, fidélité
de comportement garantie (mêmes cues, même détection de locuteurs que SonalPi). *(Repli si le `.mjs`
traîne une dépendance DOM cachée : parseur SRT propre d'~60 lignes, `convertSpeaker` gardé comme
référence de comportement.)*

**D2 — Le schéma TipTap est un contrat, gelé dès l'étape 0.** `doc › bloc` (paragraphe) avec attributs
`{ loc: number|null, deb: number|null, fin: number|null }`. Le `loc` est un **attribut de bloc**
(MODELE_OBJET2 §4). `deb`/`fin` sont **inertes** (aucune UI, aucune contrainte) mais portés par le bloc
pour survivre au round-trip `.sonal` et préparer l'audio. Règle de scission (Entrée) : le nouveau bloc
hérite `loc`, prend `deb=null` (le timing exact redeviendra un sujet au POC audio). **Pas de *marks*
utilisateur** (gras/italique) au set minimum — le `.sonal` n'en a pas, tout le visuel vient des
décorations. Toute évolution ultérieure du schéma = **migration explicite** des JSON natifs — d'où :
on le fige d'abord.

**D3 — Identités (révisé — règle n°3 de MODELE_OBJET2).** Les identités internes sont des **chaînes
opaques** : **déterministes à l'import** (une `Categorie` importée reprend son `cat_XXX`, une variable
son `v` — le sas est ainsi **idempotent**), **aléatoires à la création** dans l'app. Les codes legacy
(`cat_XXX`, `v`/`m` numériques) sont des **attributs d'export** `.sonal` (`codeExport`/`vExport`/
`mExport`, renumérotés à l'export si absents) — jamais des identités allouées par `max+1` : sous verrou
ce serait sûr, mais on n'écrit pas dans le format natif une identité qui casserait la bascule Yjs
(couture DEMARRAGE3). Exception assumée : **`Locuteur.index` numérique par entretien** est conservé
(un seul écrivain sous verrou ; c'est ce que `data-loc` référence) — dette de couture consignée dans
MODELE_OBJET §4. Annotations : id aléatoire. Renommer un locuteur = éditer une entrée de la liste,
zéro retouche du texte.

**D4 — `corpus.json` porte les types complets de MODELE_OBJET2, l'UI n'en montre qu'une partie.**
`codebook`, `variables` (modalités imbriquées), `membership` ont une UI ; `reglesAnon`, `personnes`
existent dans le type (import `.sonal` y range les règles d'anon trouvées) mais restent sans UI. Même
règle pour les **annotations `anon` et `commentaire`** trouvées dans un `.sonal` : importées, portées
par le modèle (elles suivent le remapping comme les codages), sans UI, **réexportées sans perte**. On ne
perd rien à l'import, on n'affiche que le set minimum.

**D5 — UI : trois zones, sobre.** Colonne gauche = corpus (liste des entretiens, ouvrir/importer).
Centre = éditeur. Panneau droit à onglets = **Thèmes | Locuteurs | Données**. Vue 3 sans lib de
composants (cohérent POC2). L'ergonomie fine de SonalPi (drag-drop, filigranes, transitions) est
explicitement **hors sujet** : on vise le geste, pas le polish.

**D6 — Version et fraîcheur du format natif (plan-amelior §2.3.b/f).** Chaque fichier porte un
`formatVersion` : version inconnue → **refus poli** (jamais d'écrasement ni de lecture partielle),
montée de version → **migration explicite** à l'ouverture. Fraîcheur croisée : `membership.lastModified`
mis à jour à chaque sauvegarde d'un entretien ; à l'ouverture, un `entretiens/<id>.json` plus ancien
qu'attendu (fichier restauré, copie partielle du dossier) → **alerte**, pas d'écrasement silencieux.
**Filet anti-erreur : `.bak` à 2 générations, tourné par session** — au **premier** enregistrement qui
suit l'ouverture d'un entretien, la version sur disque bascule en `.bak1` (l'ancien `.bak1` devient
`.bak2`). L'autosave, lui, ne fait que remplacer le fichier courant — s'il tournait les générations, le
filet ne protégerait que des dernières secondes, pas d'une erreur aperçue après coup. Restauration =
geste manuel (fichiers texte lisibles), pas d'UI au set minimum. Détail : MODELE_OBJET §5.

---

## Étapes

### Étape 0 — Squelette + moteur vendoré

Copie du squelette electron-vite POC2 (sans `collab/`, sans deps Yjs) ; `model/` + `editor/remap.ts` +
tests POC3 vendorés ; TipTap monté avec le **schéma D2** ; panneau debug listant les annotations du
modèle (il restera : c'est la fenêtre sur la vérité).

- **Critères** : fenêtre + éditeur au schéma cible ; les 12 tests POC3 passent dans SonalAsynchro ;
  `typecheck` vert.

### Étape 1 — Le moteur devient visible (fin de l'étape 1 de POC3)

Décorations + snap branchés sur le modèle ; codebook **en dur** (2-3 thèmes) ; sélectionner → coder,
re-cliquer → retirer.

- **Critères** (les critères UI 2-3 de DEMARRAGE3-étape 1) :
  1. coder un passage, éditer partout (avant/dedans/bornes, undo) → le surlignage suit, le panneau
     debug confirme que c'est le **modèle** qui a bougé ;
  2. deux thèmes superposés sur une même plage se composent visuellement ;
  3. plage supprimée → l'annotation apparaît *orpheline* dans le panneau debug ;
  4. le test « `model/` sans import externe » (POC3) passe toujours.

> **Limite assumée (set minimum)** : l'historique (Ctrl+Z) ne couvre que le **texte** (ProseMirror).
> Poser/retirer une annotation n'entre pas dans l'undo — l'inverse est un geste explicite (retirer /
> re-poser). Un undo unifié texte+annotations est faisable plus tard (transactions englobantes), pas
> requis ici ; en revanche, les annotations **suivent** correctement l'undo du texte (prouvé POC3).

### Étape 2 — Persistance : le dossier de corpus

Main process + IPC (le renderer ne touche pas au disque) : créer un corpus (dossier), ouvrir, lister
via `membership`, sauvegarder un entretien (**écriture atomique** write-tmp-rename + rotation `.bak`
D6), sauvegarde du `corpus.json`. Autosave débouncé + sauvegarde explicite. Gestion minimale du
membership : **renommer** un entretien (édite le titre dans `corpus.json`, rien d'autre) et
**supprimer** = retrait du membership + fichier déplacé dans `corbeille/` du dossier corpus (jamais
effacé — cohérent « pas de perte silencieuse »).

- **Critères** :
  1. round-trip complet : coder, fermer l'app, rouvrir → texte + annotations + positions intacts
     (test automatisé sur la sérialisation, e2e Electron pour la survie au redémarrage — repris de la
     mécanique POC2) ;
  2. un crash simulé pendant l'écriture ne corrompt pas le fichier précédent (atomicité) ;
  3. `membership` = la seule liste (pas de scan du dossier à l'affichage, cohérent MODELE_OBJET2 §1) ;
  4. **version et fraîcheur (D6)** : un fichier de `formatVersion` inconnue est refusé poliment ; un
     `entretiens/<id>.json` plus ancien que le `lastModified` du membership déclenche une alerte
     (test : maquiller l'horodatage), jamais un écrasement ;
  5. **`.bak` par session (D6)** : trois sessions d'édition → `.bak1`/`.bak2` correspondent bien aux
     deux sessions précédentes (pas aux deux derniers autosaves) ; restaurer un `.bak` à la main
     redonne un entretien ouvrable.

### Étape 3 — Import / export (le sas D1)

`importerSonal` (POC1 adapté) = point d'entrée unique du modèle ; `conversions.mjs` (SonalPi) en amont
pour `.srt`/`.vtt`/`.txt` ; à l'import : `cat-json`/`var-json`/`dic-json` → **fusion dans
`corpus.json`** (par `code`/`v`, c'est le « sas d'import » de MODELE_OBJET2 §12), contenu + valeurs +
locuteurs → `entretiens/<id>.json`, règles d'anon → `reglesAnon` (sans UI, D4). `exporterSonal`
(POC1 adapté) : recomposition d'un `.sonal` auto-suffisant.

> **Point d'attention** : le parseur `.sonal` produit des offsets **caractère** dans un texte concaténé ;
> le modèle SonalAsynchro attend des positions **ProseMirror**, qui comptent les frontières de blocs. L'import
> passe donc par une conversion char→PM dédiée et testée sur les fixtures (au POC1, ce travail était
> fait par la création d'ancres Yjs ; ici c'est une arithmétique de blocs). L'export fait l'inverse.

- **Critères** :
  1. importer un `.srt` réel → entretien éditable, blocs = cues, locuteurs détectés, `deb`/`fin` posés ;
  2. importer un `.sonal` réel (fixtures POC1) → thèmes/locuteurs/valeurs visibles et **justes**
     (vérifié par golden, mécanique POC1 reprise) ;
  3. exporter puis **rouvrir dans SonalPi** : texte, codages, locuteurs, données au rendez-vous
     (vérification manuelle documentée + golden round-trip automatisé) ;
  4. importer deux `.sonal` partageant des codes → le codebook fusionne (pas de doublon `cat_005`).

### Étape 4 — Locuteurs

Onglet Locuteurs : liste de l'entretien (issue de l'import ou créée à la main), renommage, ajout.
Attribution : gouttière de bloc (nom du locuteur affiché devant le bloc, cliquable → menu). Entrée
scinde le bloc (hérite `loc`, D2). Rendu : nom en gouttière + teinte discrète par locuteur.

- **Critères** :
  1. changer le `loc` d'un bloc = une commande de domaine (visible au panneau debug), pas une retouche
     de texte ;
  2. renommer un locuteur → répercuté sur tous ses blocs sans toucher aux blocs (référence par index,
     D3) ;
  3. le tour de parole reste **dérivé** (blocs consécutifs même `loc` rendus groupés) — rien de stocké.

### Étape 5 — Thèmes (le codebook de corpus)

Onglet Thèmes : CRUD sur `corpus.json` (nom, couleur, actif ; ordre manuel ; hiérarchie différée),
sélection du « thème courant », codage à la sélection (snap), vue **Extraits** d'un thème (requête :
annotations du code → `textBetween`, avec le locuteur d'attribution calculé par `plage ∩ blocs.loc`).

- **Critères** :
  1. renommer/recolorer `cat_005` → tout l'affichage suit **sans écrire dans aucun entretien**
     (référence par id — *la* démonstration de l'architecture) ;
  2. un extrait à cheval sur deux blocs sort en **une** entité (invariant MODELE_OBJET2 §4) ;
  3. supprimer un thème encore utilisé → politique explicite (refus tant que des annotations le
     référencent, avec compteur — le compteur est une requête).

### Étape 6 — Données (EAV)

Onglet Données : CRUD variables (lib, portée `gen`|`loc`) + modalités ; fiche **entretien**
(`valeursGen`) et fiche **locuteur** (`valeursLoc`) en saisie par listes de modalités ; vue **matrice
corpus** (lignes = entretiens/locuteurs, colonnes = variables) **calculée** en lisant les fichiers du
dossier.

- **Critères** :
  1. la matrice est juste après modification d'une valeur puis réouverture — et il n'existe **aucun**
     fichier/champ qui la stocke (grep-able : « requête, pas cache ») ;
  2. une valeur de portée `loc` vit chez son locuteur (le sentinelle `l="all"` n'existe nulle part) ;
  3. supprimer une modalité utilisée → même politique qu'en 5.3 (refus + compteur-requête).

### Étape 7 — Bilan de parité (le juge de paix)

Scénario bout-en-bout **sur un entretien réel** : import `.sonal` SonalPi → corriger le texte,
réattribuer un bloc, poser/retirer des thèmes, saisir des données → export → **réouverture dans
SonalPi**. Rédiger le tableau des écarts assumés (fragments recomposés différemment, `statut deb|fin`
de tour retiré, ordre des spans…) et la décision de suite : anonymisation (POC5 ?), verrous
multi-utilisateur (étape 4 POC3), audio, ou bascule Yjs (couture DEMARRAGE3).

---

## Stratégie de test

- **Headless (vitest)** : le moteur (tests POC3 repris), les requêtes (extraits, matrice, compteurs
  d'usage), la sérialisation native (round-trip), les imports/exports sur les **fixtures immuables du
  POC1** avec golden (la non-régression de format est le garde-fou n°1 — FORMATS.md).
- **e2e (Playwright-Electron, repris POC2)** : un scénario par étape, minimal — survie au redémarrage
  (é2), import `.srt` (é3), codage à la sélection (é5). *(Harnais posé dès l'étape 0 :
  `e2e/smoke.e2e.ts` — fenêtre + schéma D2 + coder/retirer + remap in vivo ; `npm run test:e2e`
  rebuild puis lance. Tourne sous WSLg — pilotable en autonomie.)*
- **Manuel documenté** : la réouverture dans SonalPi (é3.3, é7) — non automatisable, consignée dans
  un `PARITE.md` avec captures.

## Garde-fous

1. Ceux de DEMARRAGE3, inchangés : modèle = vérité ; toute édition = transaction PM ; requête, pas
   cache ; `model/` sans DOM (test mécanique conservé).
2. Les **invariants de robustesse** (MODELE_OBJET2, règle n°3) : référence pendante **inerte,
   conservée, signalée** ; identités opaques (D3) ; le sas d'import est le **seul** flux
   applications→définitions (charger un entretien n'écrit jamais une définition) ; **aucune réparation
   silencieuse** — les incohérences se signalent.
3. **Le schéma TipTap et le format natif sont des contrats** : toute évolution = migration explicite
   (`formatVersion`, D6).
4. **Compat SonalPi = golden** : on ne casse pas un golden sans diff relu (mécanique POC1/FORMATS.md).
5. **Pas de polish** : un geste qui marche sobrement vaut mieux que deux à moitié stylés — l'ergonomie
   SonalPi n'est pas l'objet du SonalAsynchro.
6. **Pas de nouvelle dépendance** sans besoin démontré (l'UI se fait en Vue 3 nu).

## Ordre d'exécution (checklist)

- [x] Étape 0 : squelette electron-vite + moteur POC3 vendoré (12 tests verts) + schéma D2 gelé
      *(fait — 16 tests verts : 12 moteur repris + 4 sur le schéma D2 réel via TipTap/happy-dom ;
      typecheck vert ; build main/preload/renderer vert ; App.vue monte l'éditeur + panneau debug du
      modèle avec « Coder la sélection » ; surlignage/décorations reportés à l'étape 1)*
- [x] Étape 1 : décorations + snap sur le modèle ; coder/retirer à la sélection ; panneau debug
      *(fait — surlignage projeté depuis le modèle ([decorations.ts](src/renderer/editor/decorations.ts)),
      toggle coder/re-coder, composition de thèmes superposés par balayage de segments (soulignés
      empilés), orpheline non rendue ; 4 e2e `marquage.e2e.ts` + 3 smoke, 16 unitaires, typecheck/build
      verts)*
- [x] Étape 2 : dossier de corpus (IPC, écriture atomique) ; round-trip + survie au redémarrage
      *(fait — store fichiers [corpusStore.ts](src/main/corpusStore.ts) : `corpus.json` +
      `entretiens/<id>.json`, write-tmp-rename atomique, `.bak` 2 générations tournées par session,
      `formatVersion` + fraîcheur croisée (D6), membership = seule liste, suppression → `corbeille/` ;
      IPC main/preload ; App.vue = liste/nouveau/renommer/supprimer + autosave débouncé + bannières
      refus-version/périmé. 11 tests store headless + 3 e2e persistance (round-trip redémarrage, refus
      version, fraîcheur) ; total 27 unitaires + 10 e2e, typecheck/build verts)*
- [x] Étape 3 : sas d'import (conversions SonalPi + importerSonal POC1 adapté) ; export `.sonal` ;
      golden verts ; réouverture SonalPi vérifiée
      *(fait côté code — `import/` : mapping char↔ProseMirror ([positions.ts](src/renderer/import/positions.ts)),
      import ([importSonal.ts](src/renderer/import/importSonal.ts)) + export ([exportSonal.ts](src/renderer/import/exportSonal.ts))
      sur fixtures POC1, sas unique ([sas.ts](src/renderer/import/sas.ts)) SRT/VTT via converters SonalPi
      vendorés, fusion codebook au corpus (idempotente). UI : boutons Importer/Exporter (dialogs main),
      codebook lu du corpus. 48 unitaires (positions 5 + import 8 + export 4 + sas 2 + store 13 + …) +
      11 e2e (dont import→export via dialog stub). **Réouverture dans SonalPi = test MANUEL** à faire, cf.
      [PARITE.md](PARITE.md) — pas encore effectué)*
- [x] Étape 4 : locuteurs (gouttière, renommage par référence, scission de bloc)
      *(fait — [model/locuteurs.ts](src/renderer/model/locuteurs.ts) pur (renommer/ajouter/nomDe,
      index=exception d'identité MODELE_OBJET §4) ; [editor/locuteursGutter.ts](src/renderer/editor/locuteursGutter.ts)
      = gouttière cliquable (nom en tête de tour, **tour dérivé** = run de blocs même loc) + teinte par
      locuteur ; panneau Locuteurs (liste/renommer/ajouter/attribuer) ; attribution = `updateAttributes`
      (transaction PM), scission hérite `loc` nativement. 57 unitaires + 4 e2e locuteurs (15 e2e total).
      NB régression corrigée : `locuteurs` réactif → clone plat avant l'IPC (proxy Vue non clonable))*
- [x] Étape 5 : thèmes (CRUD corpus, codage, extraits, politique de suppression)
      *(fait — store : `ajouter/modifier/deplacer/supprimerCategorie` + `usagesParCode` (requête, scan
      local du dossier) ; suppression REFUSÉE si utilisée (compteur). Décorations : couleur résolue
      depuis le codebook (couleur STOCKÉE prioritaire, repli angle d'or) → recolorer se reflète en direct
      SANS écrire d'entretien. UI : onglets Thèmes/Locuteurs/Extraits (+ debug toujours visible),
      panneau Thèmes (couleur/nom/actif/ordre/suppr), vue Extraits (requête : 1 annotation = 1 extrait,
      même à cheval sur des blocs ; locuteurs attribués = plage ∩ blocs.loc). 63 unitaires + 3 e2e thèmes
      (18 e2e total). NB : color input piloté par `fill` en e2e ; debug remis hors onglets pour ne pas
      casser les e2e existants)*
- [x] Étape 6 : données (CRUD variables, fiches de saisie, matrice-requête)
      *(fait — types `Variable`/`Modalite`/`MatriceCorpus` ; store : CRUD variable+modalité,
      `compterUsagesVariable/Modalite` + `matriceCorpus` (REQUÊTE = scan local), suppression REFUSÉE si
      utilisée. Valeurs = APPLICATIONS chez leur propriétaire : `meta.valeursGen` (entretien),
      `Locuteur.valeursLoc` (locuteur) — **pas de sentinelle `l="all"`**. UI : onglet Données (variables
      + modalités, fiche entretien, fiche par locuteur, **matrice** table). `meta` passé en réactif (clone
      plat IPC). 67 unitaires + 3 e2e (round-trip valeur→matrice, valeur loc chez locuteur, suppr modalité
      refusée) ; 23 e2e total)*

**LE SET MINIMUM EST COMPLET** (étapes 0-6). Reste hors set minimum : anonymisation (UI), audio/timing,
multi-utilisateur (verrous) + sélecteur multi-corpus, import EAV `.sonal` dans le modèle (aujourd'hui en
pass-through `legacy`). Cf. étape 7 (bilan de parité) pour la décision de suite.
- [x] Étape 7 : bilan de parité (`PARITE.md` + [BILAN.md](BILAN.md)) + décision de suite
      *(fait — juge de paix bout-en-bout `parcours.e2e.ts` : import réel → coder → renommer locuteur →
      saisir une donnée → export cohérent. BILAN.md : écarts assumés (dont le **gap EAV export** révélé
      par l'étape 7) + matrice de décision A/B/C/D/E. 67 unitaires + 24 e2e verts. Décision de suite = à
      l'utilisateur ; reco : B (round-trip EAV) puis A (anonymisation))*
