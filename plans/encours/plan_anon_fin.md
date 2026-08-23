# Anonymisation — finitions & parité V1 (plan_anon_fin)

> Plan **final** de rattrapage de la pseudonymisation dans **SonalPiTestV2 (V2)**,
> pour atteindre la parité fonctionnelle de **SonalPi V1** sur le périmètre *cœur*
> (compteurs + navigation, panneau corps « Pseudos », multi-alias + incluses,
> paramètres). Il s'appuie sur tout ce qui est déjà acquis dans
>  [plan_anon_suite_ok.md](plan_anon_suite_ok.md) (étapes 0→3b terminées : table,
> brouillons, exceptions, locuteurs/gouttière, règles corpus + scan + application
> en masse + round-trip `.sonal`).
>
> **Différence de contexte avec V1 (ce plan ne le redit pas, on s'y réfère)** :
> V1 a un modèle objet flou (DOM = source de vérité, `window.tabAnon`, deux
> `tabHtml`, cache `matchPositions`) et un éditeur HTML statique ; V2 a un
> **modèle d'objet précis** (`Annotation`, `RegleAnon`, `BrouillonAnon`, `Locuteur`
> dans `entretiens/<id>.json` / `corpus.json`) et un **éditeur TipTap** (positions
> PM remappées par `remap.ts`). On n'implémente donc **pas** le code V1 : on
> **porte les comportements**, en requêtes + modèles, sans la plomberie DOM V1.
>
> **Règle de fin d'étape** : chaque étape valide son **round-trip `.sonal`**
> (importer un `.sonal` SonalPi → éditer → exporter → relire sans perte), cf.
> §Validation.
>
> **Point de départ** : **277/277 tests headless** passent, typecheck node+web OK,
> build OK, e2e anonymisation + import-export OK (état de fin de `plan_anon_suite`).

---

## 1. Périmètre

### On fait (4 étapes, dans l'ordre)

1. **Étape 1 — Compteurs & navigation (niveau entretien, onglet « Pseudonymisation
   des textes »)** : compléter les compteurs de la ligne — ajouter **« à
   anonymiser »** (requête live), **scinder les compteurs par variante** pour le
   **multi-pseudo** (aujourd'hui les occurrences sont agrégées toutes variantes
   confondues). Sous-étape **1b** : **navigation de compteur en compteur** (◄ i/N ►
   + allée vers le mot dans l'éditeur) au clic sur un compteur.
2. **Étape 2 — Panneau « Pseudos » corpus (parité V1, refonte)** : passer du
   panneau simplifié actuel à la version V1 — badges/états par entretien
   (✓/orange/⚠), vérification détaillée, application en masse par sélection,
   import/export de table de correspondance, filtre/recherche. S'appuie sur
   `scanAnon`/`applicationMasse` déjà présents, enrichis des états « incluse » /
   « variante » issus de l'étape 3.
3. **Étape 3 — Multi-alias & incluses** : regrouper les **alias** (`Lyon/Lyons`)
   d'une entité au niveau entretien comme au corpus, gérer les **chevauchements
   de règles** (« le large absorbe l'étroit » → occurrences **incluses**), avec
   le modèle annotations (conservation + masquage, restauration au retrait).
4. **Étape 4 — Paramètres V1** (modale « ⚙ Paramètres de pseudonymisation », niveau
   corpus) : **priorité de validation** (`corpus` défaut | `entretien`), **mots de
   liaison / articles** (détection d'affixes « à Lyon » → propose « Lyon » +
   interrupteur), **thématiques / catégories d'entités** (opt-in, PER/LOC/ORG/DAT,
   badge par entité + recherche par catégorie au corpus).

### On laisse de côté (différé, HORS ce plan)

- **Export anonymisé dans les AUTRES formats** (txt/word/srt/html du document) :
  ici, l'anonymisation n'est exportée qu'au round-trip `.sonal` (et dans le flux
  existant `.sonal`). Les exports « document final » pseudonymisés (module V1
  `anon-export-document.js`) sont **hors-plan** — c'est le point nominal de sortie
  du présent plan.


---

## 2. Étape 1 — Compteurs & navigation (niveau entretien)

### 1a. Compteurs de la ligne (compléter + scinder multi-pseudo)

**État actuel** (`brouillonsAnon.ts` → `LigneAnon`) : `nb` (total),
`nbAnonymise` (⬤ barré), `nbException` (◌ clair) — **toutes variantes confondues** ;
**pas** de « à anonymiser ». Vue : `Entretien.vue` onglet anon, colonne `État · Occ.`
(`l.occ-action`). 277 tests passent.

**Objectif** : chaque ligne affiche désormais, **par variante** quand multi-pseudo,
trois sous-compteurs `anonymisé / exception / à anonymiser`, plus l'**exposant
« +N incluse(s) »** (livré à l'étape 3, réserve l'emplacement).

- **« À anonymiser » = REQUÊTE** (principe déjà acté `plan_anon` §2) : occurrences
  du texte de l'entité **non couvertes** par une annotation anon de la ligne
  (`règles ∩ texte − (anonymisé ∪ exception)`), pour la **ligne courante** de
  l'entretien ouvert. Codée en pur dans
  `shared/entretien/anonymisation.ts` (réutiliser `aplatir`/`occurrencesDe`/
  `instructionsValiderAnon`) ou dans un nouveau module pur dédié. **Rien de stocké**.
  Le calcul se fait à l'affichage de l'onglet + au clic « ⟳ rafraîchir » (pas à
  chaque frappe — cf. périmètre).
- **Scission par variante (multi-pseudo ≤2 déjà en place)** : la projection
  `lignesAnonUnifiees` doit dériver les occurrences de la ligne **par
  `pseudo` effectivement appliqué** → compteurs `nbAnonymise[a]`, `nbException[a]`
  **par variante**, agrégés en UI par variante. Une occurrence **incluse** est
  **comptée dans AUCUNE variante** (ni anon, ni à anonymiser) — elle ne monte
  que dans l'exposant (+N) — cf. étape 3.
- **Exceptions** : le compteur existe déjà (◌) ; on le conserve tel quel, juste
  scindé par variante là où pertinent et affiché en cohérence avec « à anonymiser »
  (une exception n'est **jamais** « à anonymiser »).

### 1b. Navigation entre occurrences (loupe ◄ i/N ►)

Au clic sur un compteur (ou un bouton loupe) de la ligne :

- **`◄ i/N ►`** navigue dans les occurrences de **cette catégorie** (anonymisées /
  exceptions / à anonymiser / variante précise en multi-pseudo).
- Chaque pas **cale l'éditeur TipTap sur le mot** (sélection/scroll, décoration
  transitoire « hit » — miroir `.reperage-hit` V1) **sans poser de marquage**
  (repérage non destructif).
- **Navigation « à anonymiser »** : cible les matchs non couverts (requête 1a) ;
  sur un « à anonymiser », on peut agir (bascule exception / anonymiser) depuis le
  même flux — réutiliser `basculerException`/`basculerAnonymise` et
  `instructionsValiderAnon`.
- Positions : les annotations sont déjà remappées (`remap.ts`) ; les matchs « à
  anonymiser » sont calculés en PM depuis `aplatir`+`plageVersPM` → cohérent avec
  le curseur.
- **Incluses = NON navigables** (parité I-INC) : le clic sur une incluse retombe
  sur la **règle large** englobante.

### À vérifier (fin d'étape 1)

- Round-trip `.sonal` inchangé (compteurs/navigation = requêtes, **rien** ne se
  sérialise en plus).
- Typecheck, build, tests green, e2e.

### Tests (proposés)

- Pur : compteur « à anonymiser » correct (matchs non couverts, exception jamais
  « à anonymiser », anon déjà posée exclue, multi-variante scindée, incluse hors
  compteurs) — étendre `brouillonsAnon.test.ts` / nouveau `compteursAnon.test.ts`.
- Navigation : liste des occurrences d'une catégorie, ordre ◄ i/N ►, position PM
  correcte ; sans mutation du modèle.

---

## 3. Étape 2 — Panneau « Pseudos » corpus (parité V1, refonte)

**État actuel** (`Corpus.vue`) : panneau deux colonnes — table des règles
(Entité | Pseudo | Anon. | Exc. | À anon. | 🔍 loupe) + drill-down droit par
entretien (checbox + appliquer en masse) déjà fonctionnel, alimenté par
`scanAnon` (pur) et `corpusStore.appliquerRegleAnon`.

**Objectif** : se rapprocher de la **version V1** (`tableau_global.js` /
`anon-scan.js`) :

- **États/badges par entretien** dans le drill-down : ✓ vert « tout traité »,
  orange « à traiter », ⚠/règle absente, et **« incluse »** (exposant) dès
  l'étape 3. Compteurs **par variante** dès le multi-pseudo (alignement étape 1).
- **Vue détaillée d'une règle** (drill-down enrichi) : occurrences par entretien
  avec **contexte** (« avant / match / après »), état par occurrence, actions
  (anonymiser / exception / ↺ autre variante) consenties par la portée
  (V1 : l'application/édition par occurrence vit **au niveau entretien** ; le
  panneau corpus reste surtout **vérification + application en masse**).
- **Application en masse enrichie** : cocher des entretiens (déjà là) + vue des
  résultats par entretien (nb posé), **sans rouvrir** (écriture atomique, déjà
  en place). « ↗ Ouvrir » vers l'entretien (déjà là).
- **Filtre / recherche** dans le panneau : retrouver une entité (déjà un champ de
  recherche V1) — et, à l'étape 4, **filtrer par catégorie/thématique**.
- **Fusion/nettoyage des règles** : parité `cleEntite`/`cleAnon` insensible à la
  casse (déjà présente au run `corpus.json.reglesAnon`) et **`regleEnCollisionAlias`**
  (à livrer avec l'étape 3 multi-alias) — pas de doublon de règle au ré-import
  (déjà testé e2e « Karine unique »).

### À vérifier (fin d'étape 2)

- Round-trip `.sonal` : panneau reflète fidèlement l'`anon-json` (règles corpus + 
  brouillons), la réimportation ne crée **ni doublon ni perte** (étendre l'e2e
  existant).
- Scan inchangé en vérité (toujours une requête, jamais de cache stale).

### Tests

- Étendre `scanAnon.test.ts` (états par entretien, variantes, incluses à l'étape 3)
  et le store (`appliquerRegleAnon` résultats), e2e panneau sans doublon.

---

## 4. Étape 3 — Multi-alias & incluses

### 3a. Multi-alias (grouper `Lyon/Lyons` → une entité)

**État actuel** : `RegleAnon.entite: string[]` existe ; `scanAnon` itère déjà les
alias au corpus ; la **saisie entretien** ne crée qu'une entité (une ligne = un
texte). Le regroupement fin des alias + collision n'est pas porté.

**Objectif (parité V1 `clesAlias`/`regleEnCollisionAlias`)** :

- **Saisie multi-alias** : séparateur (`,`, `/` ou espace contrôlé) → `entite: []`
  ; invariant I2 : jamais alias multiples **ET** pseudos multiples sur la même
  règle (reprendre du `plan_anon` §3.1).
- **Groupement à la projection entretien** : une ligne peut couvrir plusieurs
  textes d'alias (le `cleEntite` au niveau **alias**, pas au texte d'une
  occurrence seule) ; la ligne affiche le **groupe complet** d'alias.
- **Collision d'alias entre règles** (une entité qui serait contenue dans deux
  groupes) : éclatement à la fusion (parité V1 « garder les alias libres ») +
  dialogue de divergence. Pur + tests.
- **Application en masse** : `instructionsAppliquerRegle` (déjà multi-alias) reste
  le cœur ; vérifier les compteurs par alias.

### 3b. Incluses (chevauchement de règles)

**Objectif (parité V1 §10, en régime annotations)** : deux règles qui se
chevauchent (`Marie → Lucie` ⊂ `Sainte Marie de la mer → ville`) → **« le large
absorbe l'étroit »**, l'interne devient **incluse**.

- **Détection = requête** : un match de la règle étroite recouvert par une
  annotation d'une **autre** règle → `incluse` (ni « à anonymiser », ni comptée
  « anonymisé » — comptage « règle unique, partout », cohérent entretien ↔ corpus).
- **Application d'un run large** : les annotations étroites internes sont
  **conservées mais masquées** (rendu + export ne voient que la plus large). Modèle
  = version propre de `data-pseudo-absorbe` : au retrait de l'annotation large,
  l'étroite **réapparaît telle quelle, variante comprise** — restauration
  **gratuite** (aucun attribut à consommer), cf. `plan_anon` §3.4.
  - **Réserve** : une **exception** étroite interne est masquée aussi (pas
    d'exception dans une entité plus grande) et revit au retrait.
- **UI/compteurs** : incluse **non navigable**, pas d'action directe (le clic
  retombe sur la règle large) ; **exposant « +N absorbed »** sur le compteur +
  **tooltip** « plus N absorbée(s) par *entité absorbante* (non comptée(s) ici) »
  — wording repris (jamais « dont »). Révèle l'emplacement réservé à l'étape 1a.
- **Round-trip `.sonal`** : la **persistance** des inclusions doit refléter la
  lecture V1 (le run large est ce qui est sérialisé ; la « réapparition » au
  retrait est re-dérivée, pas stockée). À valider en e2e avec un fixture
  chevauchant (étendre `entretien1.sonal` ou nouveau fixture).

### À vérifier (fin d'étape 3)

- Import d'un `.sonal` SonalPi avec **chevauchement** → modèle → ré-export → les
  spans larges/étroits sont fidèles et les compteurs cohérents entretien ↔ corpus.
- La projection entretien **et** le scan corpus comptent l'incluse pareil.

### Tests

- Pur : détection d'inclusion, absorption à la pose (large par-dessus étroite,
  et ordre inverse), restauration au retrait (variante comprise, exception
  redevient « à traiter »), comptage exclu partout.
- e2e round-trip chevauchant ; typecheck/build green.

---

## 5. Étape 4 — Paramètres V1 (priorité / articles / catégories)

> Modale « ⚙ Paramètres de pseudonymisation » au niveau corpus (parité
> `anon-params.js`), persistée dans `corpus.json` (nouveau champ additif
> `paramsAnon?` — **pas de bump** de `formatVersion`). Sous-étapes 4a/4b/4c.

### 4a. Priorité de validation (défaut : `corpus` | `entretien`)

- Réglage partagé qui décide **quelle portée Entrée applique** sur la validation
  d'une ligne **au niveau entretien** (Maj+Entrée fait l'inverse).
- Défaut **`corpus`** (comme V1). Modèle : `paramsAnon.prioriteValidation`.
- Dans `Entretien.vue` : routing d'`Entrée`/`Maj+Entrée` sur la ligne de saisie →
  `changerPorteeAnon(entite, 'corpus'|'entretien')`. Les 3 crans du slider restent
  inchangés (la priorité ne pilote que la touche courte).

### 4b. Mots de liaison / articles (détection d'affixes)

- Liste partagée de **mots de liaison** (articles `le/la/les`, prépositions
  `à/de/à la…`) + **interrupteur** (activé par défaut).
- Comportement (parité V1) : quand on pseudonymise une expression commençant par
  un de ces mots suivi d'un nom propre (« **à Lyon** »), on **propose** aussi la
  règle générale sans le mot (« **Lyon** »), pour capter l'entité partout.
- Côté V2 : la proposition se fait à la **validation entretien** (dialogue
  « pseudonymiser aussi : *Lyon* ? »), créant une 2ᵉ règle/ligne. Pur : helper
  `proposerRegleCoeurAffixe` (miroir V1) + tests.
- **Réserve périmètre** : la détection d'affixes est une **suggestion** (jamais
  une pose automatique) ; si trop lourd pour cette passe, on peut livrer **4b en
  4b-lecture** (réglage + interrupteur persistés) et différer la proposition —
  à trancher au début de 4b, sans perte (cf. §7).

### 4c. Thématiques / catégories d'entités (opt-in)

- Réglage partagé, **désactivé par défaut**, liste **PER, LOC, ORG, DAT** (libre :
  ajout/retrait — miroir `param-thematiques` V1).
- Une **catégorie par entité** (champ additif `RegleAnon.categorie?`, source de
  vérité = la règle à sa portée courante : entretien brouillon/document, corpus
  pour corpus — remontée via le cycle de portée, cf. V1).
- **UI minimaliste** (parité V1) : **badge/chip cliquable** dans la colonne Actions
  (niveaux entretien ET corpus) pour assigner/retirer la catégorie ; **recherche
  par catégorie** dans le panneau corpus (« Rechercher ») : si le terme saisi
  correspond **exactement** à une catégorie active → bascule en **filtre par
  catégorie** ; sinon recherche texte habituelle.
- `format.ts` : `ParamsAnon {thematiques:{actif,liste}, motsLiaison:{actif,liste},
  prioriteValidation}` + `RegleAnon.categorie?` (additifs, pas de bump).
- Store/IPC : lecture/écriture `paramsAnon` + IPC + preload + `env.d.ts`.
- **Stockage `.sonal`** : la catégorie d'une règle corpus est déjà dans
  `corpus.json` (pas dans le `.sonal`) ; à valider qu'aucune fuite ni perte au
  round-trip.

### À vérifier (fin d'étape 4)

- Round-trip `.sonal` : les paramètres sont **corpus-only** (ne fuient pas dans le
  `.sonal` d'un entretien), la catégorie d'une règle corpus survit export/import.
- Chaque sous-étape : typecheck/build/tests green.

### Tests

- Pur priorité (routing Entrée/Maj+Entrée) ; affixe `proposerRegleCoeurAffixe` ;
  catégorie (assignation, remontée document→corpus, recherche par catégorie vs
  texte). Store + IPC params.

---

## 6. Validation Sonal (import/export) — fil rouge

Chaque étape **se termine** par la vérification du round-trip `.sonal` (critères
déjà actés dans `plan_anon_suite` §4.3) :

| Étape | Ce qu'on valide au `.sonal` |
|---|---|
| **1** | compteurs/navigation = requêtes → **aucun changement** de sérialisation (import→export adverses `tabAnon`/spans identiques). |
| **2** | panneau reflète l'`anon-json` sans doublon ni perte (e2e étendu). |
| **3** | chevauchement & multi-alias : spans larges/étroits et groupes d'alias fidèles à travers import→édit→export→ré-import. |
| **4** | params = corpus-only (pas de fuite dans le `.sonal`) ; catégorie d'une règle corpus survit au round-trip. |

E2E de référence : `e2e/anonymisation.e2e.ts` (+ fixtures dans `test/fixtures`).

---

## 7. Ordre proposé des livraisons & dépendances

1. **Étape 1a** — compteurs « à anonymiser » + scission multi-variante (pur +
   projection + UI). Indépendante.
2. **Étape 1b** — navigation ◄ i/N ► au clic sur un compteur (s'appuie sur 1a pour
   « à anonymiser »).
3. **Étape 3a** — multi-alias (saisie/groupement/collision) → sert l'étape 2
   (groupe affiché) et prépare 3b.
4. **Étape 3b** — incluses (absorption/restauration/exposant) → complète les
   compteurs 1a (exposant « +N ») et le scan corpus 2.
5. **Étape 2** — refonte panneau « Pseudos » corpus (à faire **après** 3a/3b pour
   afficher groupes, variantes et incluses, et **avant** 4 pour intégrer la
   recherche par catégorie).
6. **Étape 4a→4c** — paramètres (priorité → mots de liaison → catégories).

Points à trancher en cours (sans bloquer) :
- **4b en deux temps** (réglage seul, puis proposition d'affixe) si la suggestion
  s'avère lourde.
- Emplacement exact de l'action « ↺ autre variante » dans le panneau corpus (garde
  V1 : l'édition par occurrence reste au niveau **entretien**).

Chaque livrable = module(s) PUR + UI + tests headless + typecheck/build + e2e
round-trip, comme dans `plan_anon_suite`.

---

## 8. Hors plan (pour mémoire)

- **Export anonymisé dans les autres formats** du document (txt/word/srt/html du
  module V1 `anon-export-document.js`) et, plus largement, tout export de
  l'anonymisation **hors** du flux `.sonal`. À traiter dans un plan ultérieur
  (nécessite `extraireTexteAnonymiseDepuisSpans`-équivalent en V2, hors périmètre ici).

---

## 9. Finir plan-migration.md (E4 — `tabAnon` du `.crp`)

> Le chantier migration V1 → V2 (`plans/encours/plan-migration.md`) est implémenté —
> **E0 à E3 + E5 fait** (lecture/aperçu, mapping définitions, entretiens+audio,
> création corpus+UI, documentation). Sa dernière étape **E4** (« `tabAnon` →
> `reglesAnon` ») a été **volontairement reportée ici** (décision Q3(b) du plan
> migration) : le mapping du `tabAnon` corpus et de ses settings dépend du
> modèle anon V2 de CE plan. **Blocage de fin de chantier : fermer E4.**

### Inventaire (fait côté migration, vérifié sur corpus réel TestAnon)

| Élément du `.crp` V1 | État en V2 | Ce qui manque → à livrer ici |
|---|---|---|
| Règles `tabAnon` **portées par les `.sonal`** (`anon-json`) | ✅ déjà migrées par E2 (dédupliquées par `cleEntite` dans `corpus.json.reglesAnon`) | rien |
| Règle `tabAnon` **sans occurrence dans un `.sonal`** (ex. `ejdieji→njjjj`) | — | mapping `tabAnon` → règle V2 (`entite[0]`, `pseudos[0..1]` = `remplacement`/`remplacementAlt`) ; `fusionnerReglesAnon` rend la fusion idempotente pour les entités déjà importées |
| `thematique` d'une règle (PER/LOC/ORG/DAT) | — | `RegleAnon.categorie?` (étape 4c, §5) — **attention** : si l'entité existe déjà via un `.sonal`, la catégorie du `.crp` doit être *rapportée* (update), pas filtrée par la déduplication |
| `paramsAnonCorpus` (motsLiaison, `thematiques{actif,liste}`, prioriteValidation) | — | `ParamsAnon` (étape 4, §5) — import depuis le `.crp` à l'ouverture du chantier |
| warning « règles d'anonymisation non migrées » dans la modale de migration | — | à remplacer par le mapping E4 (Q3(b) révoqué) |

### Enchâssement & validation

- S'appuie sur l'**étape 4** de CE plan (`paramsAnon` + `RegleAnon.categorie?`,
  additifs, pas de bump) → à faire **en fin d'étape 4** (au plus tard après 4c),
  ou en livrable dédié branché sur 4c.
- La forme du mapping est celle de `parserAnonJson` (`importSonal.ts`) — même
  shape `{entite, remplacement, remplacementAlt}` que l'`anon-json` ; à partager
  dans `shared/` si le parseur du `.crp` doit le réutiliser (`migrationCrp.ts`).
- Validation : corpus réel V1 (TestAnon — `ejdieji→njjjj` seul ajout, les autres
  déjà importés ; `Maison des Habitants` cat. ORG, `Speaker 1` cat. LOC) + e2e
  `migrer:executer` étendu + round-trip `.sonal` (critère étape 4 du §6 : la
  catégorie d'une règle corpus survit export/import).
