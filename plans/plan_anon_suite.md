# Anonymisation — suite (étapes 1 → 3)

> Suite de [plan-anon-debut.md](plan-anon-debut.md) (v1 terminée : onglet « Anon »
> entretien, occurrences, barré+`[pseudo]`, round-trip `.sonal`). On reprend la
> trajectoire de [plan_anon.md](plan_anon.md) (étape 2 du modèle) **sans** le
> multi-alias, le multi-pseudo ni les incluses — différés indéfiniment ici.

---

## AVANCEMENT (point de reprise)

- **Étape 0 — FAITE** ✅ : table + `BrouillonAnon` (slider 2 crans + cran corpus grisé).
  - `src/shared/format.ts` : `BrouillonAnon {entite, pseudo?}` + champ additif
    `brouillonsAnon?` dans `EntretienFichier`/`PayloadEntretien` (pas de bump).
  - `src/shared/entretien/brouillonsAnon.ts` : module PUR (ajout/maj/retrait/sans
    doublon de cle, insensible à la casse) + projection `lignesAnonUnifiees` :
    l'état d'une ligne est DÉRIVÉ (`brouillon` si 0 occurrence, `entretien`
    sinon), le texte d'entité se lit sur le doc injecté.
  - `useEntretien.ts` : `brouillonsAnon` en session, commandes `creerBrouillon`/
    `majBrouillonLigne`/`validerAnon` (consomme le brouillon)/`supprimerLigneAnon`/
    `changerPorteeAnon`, payload incluant `brouillonsAnon` (chargé `?? []`).
  - `Entretien.vue` : tableau par entité (Nom / Pseudo / slider 3 crans / compteur /
    ✕), ligne de saisie en bas (seed depuis la sélection, Entrée valide, blur =
    auto-brouillon persisté). Le cran « corpus » (🌐) est présent mais **inactif**
    (disabléd) — il s'activera à l'étape 3.
  - Persistance : `corpusStore` écrit/relit `brouillonsAnon` tels quels.
  - **Tests** : `test/brouillonsAnon.test.ts` (module pur + dérivation d'état +
    consommation à la validation, 11 tests), persistance store (save/reload,
    champ additif) dans `corpusStore.test.ts`, non-fuite dans le `.sonal`
    (export identique avec/sans brouillons) dans `exportSonal.test.ts`.
    **187/187 tests** passent, typecheck node+web OK, build OK.
  - Limite v1 assumée (plan §0.3) : les brouillons restent internes à
    SonalAsynchro — pas de sérialisation dans le `tabAnon` du `.sonal` avant
    l'étape 3. Navigation ◄ i/N ► sur les brouillons « entité seule » : différée.

- **Étape 1 (2.1 → 2.6) — FAITE** ✅ : exceptions par occurrence.
  - §2.1 Modèle : rien à migrer côté `Annotation.etat` — l'import produit déjà
    les exceptions (span `.anon-exception`), l'export les re-sérialise (classe,
    jamais de `data-pseudo`). **Sémantique tranchée (option 2)** : le pseudo
    d'une exception n'est jamais sérialisé à l'export ; en modèle il est
    conservé comme mémoire locale — qu'elle vienne de la bascule dans l'app ou
    d'un `data-pseudo` hors-convention importé — invisible à l'écran et dans
    le `.sonal`, pour un restore sans perte.
  - §2.2 Rendu : `decorations.ts` distingue par `etat` — `anonymise` → classe
    `anon` (barré + [pseudo]), `exception` → classe `anon-exception` (PAS de
    barré, PAS de [pseudo] ::after) ; sur un segment couvrant les deux, le barré
    l'emporte. `editeur.css` : `.editeur .anon-exception { text-decoration:
    underline dotted #bbb }`.
  - §2.3 Menu contextuel : plugin ProseMirror `pluginMenuAnon`
    (`editor/menuContexteAnon.ts`) — `handleDOMEvents.contextmenu` +
    `posAtCoords` → occurrence anon couvrante par `find` sur le modèle → choix
    laissé à l'UI (`ouvrirMenuAnon`). Composant `MenuContexteAnon.vue`
    (Téléporté à body, couche z=1000, fermeture clic-hors-menu / Escape) :
    « Laisser en clair (exception) » → `basculerException(id)` (etat='exception',
    pseudo conservé en mémoire) ; « Remettre en anonymisé » →
    `basculerAnonymise(id)` (etat='anonymise', pseudo = mémoire de l'exception,
    sinon pseudo de la ligne via `pseudoDeLigne`). Hors occurrence → `false`,
    menu natif conservé.
  - §2.4 Tweak `validerAnon` : logique extraite en fonction PURE
    `instructionsValiderAnon` (`anonymisation.ts`) — relabel des occurrences
    ANONYMISÉES seules (exceptions intactes), pose d'un match bloquée par une
    exception couvrante (y compris conteneur : pas d'absorption sur une
    exception). `useEntretien.validerAnon` applique les instructions (relabel /
    retraits / poses) sur la table réactive.
  - §2.5 Compteurs : la ligne du tableau affiche le compteur scindé
    `anonymisé / exception` (`nbAnonymise` / `nbException` de la projection
    `lignesAnonUnifiees`) ; le « à traiter » vivra avec l'étape 3.
  - §2.6 Tests : `test/basculeAnon.test.ts` (instructionsValiderAnon : relabel
    ne touche pas les exceptions, exception bloquante en couverture comme en
    conteneur, absorption conservée sur l'anonymisé pur), survie de l'`etat` au
    remap (`remap.test.ts`), conservation du `data-pseudo` hors-convention à
    l'import (mémoire) + jamais d'émission sur les exceptions à l'export
    (`importSonal.test.ts`/`exportSonal.test.ts`), compteurs scindés
    (`brouillonsAnon.test.ts`). **209/209 tests** passent, typecheck node+web
    OK, build OK.

- **Étape 2 (3.1 → 3.4) — FAITE** ✅ : locuteurs / gouttière (refonte visuelle +
  table de l'onglet + round-trip `.sonal`). Reste optionnel : le dialogue
  « pseudonymiser aussi l'étiquette ? » à la validation d'une ligne Anon
  (miroir SonalPi `proposerPseudoLocuteur`) — reporté à l'étape 3 (suggestion),
  comme le plan le permet (§3.3).
  - §3.1 Modèle : `Locuteur.pseudo?` / `Locuteur.pseudoEtat?`
    (`'confirme' | 'refuse'`), champs ADDITIFS optionnels — pas de bump de
    `formatVersion`. Le pseudo est porté par le LOCUTEUR (référence, pas de
    copie dans les blocs) ; le rendu suit. Invariant de matérialisation du plan
    (§3.1 : une règle est matérialisée si ≥ 1 occurrence OU ≥ 1 locuteur
    confirmé) à garder pour le scan de l'étape 3.
  - §3.2 Gouttière : libellé AU-DESSUS du bloc (layout SonalPi `.ligloc`) —
    `locuteursGutter.ts` refait (widget `display:block` dans le contenu du
    paragraphe, décorations seules : schéma intact, positions/remap sans
    conséquence). Placement : 1er bloc d'un tour (comme le header « deb »
    SonalPi) → libellé ; tour sans locuteur → gouttière vide cliquable (`.vide`) ;
    continuations → RIEN (pas de ligne vide). Rendu du pseudo : nom BARRÉ +
    `[pseudo]` dans un span sœur (le line-through ne se propage pas) ; refus →
    nom en clair + ⊘. Clic-tour conservé (curseur + seek audio). `editeur.css`
    : `.gouttiere-loc` en bloc, `.loc-nom` barré conditionnellement (class
    `loc-anon`), `.loc-pseudo` atomic. Texte des tours étiquetés DÉCALÉ d'un
    cran à droite (`.lbl-tour` : padding sur tout bloc d'un locuteur nommé, y
    compris scissions Entrée ; marge négative du widget pour garder le libellé
    à l'extrême gauche). NOM coloré : le nom s'écrit dans la couleur du locuteur
    (choisie ou auto par index) — inline style, la pastille de la gouttière a
    été RETIRÉE (décision utilisateur : le carré vit dans le tableau).
  - §3.3 Onglet Locuteurs : petit TABLEAU (Couleur | Nom | Pseudo | Interv. |
    ✕) — carré de couleur auto-rempli par index (`couleurPourLocuteur`, palette
    prédéfinie de 10), clic → palette (Téléportée, ∅ = retour auto) →
    `choisirCouleurLoc` pose `Locuteur.couleur` : le NOM du locuteur s'écrit
    dans cette couleur dans l'éditeur, SANS toucher au pseudo (décision utilisateur).
    Champ **Pseudo** + interrupteur ✓ confirmer / ⊘ refuser (parité SonalPi
    `loc-anon`/`loc-suggere-refuse`) dans `useEntretien`
    (`setPseudoLoc`/`setPseudoEtatLoc`/`choisirCouleurLoc`, hors journal comme
    l'interrupteur interviewer). Pas de suggestion ici (étape 3).
  - §3.4 Round-trip `.sonal` : marqueurs du libellé sur les `.ligloc` — IMPORT
    (`importSonal.ts`) : `loc-anon` + `data-locpseudo` → `Locuteur.pseudo` +
    `pseudoEtat:'confirme'` ; `loc-suggere-refuse` → `pseudoEtat:'refuse'`
    (aucun pseudo sur un refus). EXPORT (`exportSonal.ts`) : le 1er segment du
    1er bloc de chaque tour reçoit `ligloc` + `data-nomloc` (vrai nom) + le
    marqueur selon l'état (`loc-anon` + `data-locpseudo` si pseudo posé non
    refusé ; `loc-suggere-refuse` si refus). La couleur est interne à l'app et
    ne se sérialise pas ; `data-nomloc-barre` reste un artefact de rendu SonalPi
    (re-dérivé à son ouverture — on n'émet JAMAIS le nom réel barré).
  - §3.5 Tests : `libelleGouttiere`/`couleurPourLocuteur`/`nomDeCouleur` (purs)
    + DOM du libellé (happy-dom, garde « sans pseudo rien n'est barré ») dans
    `test/locuteurs.test.ts` ; round-trip `.ligloc` (import des marqueurs,
    export `loc-anon`/`data-locpseudo` sans perte, refus sans `data-locpseudo`)
    dans `test/importSonal.test.ts`/`exportSonal.test.ts`.
    **227/227 tests** passent, typecheck node+web OK, build OK.

---

## 0. Périmètre

### On fait (3 étapes, dans l'ordre)

1. **Exceptions** par occurrence (clic droit → menu « ajouter une exception » /
   « remettre en anonymisé »).
2. **Locuteurs / gouttière** : pseudonymiser l'étiquette de prise de parole,
   rendu « Nom̶ [Pseudo] » — nécessite de reprendre la gouttière (nom au-dessus
   du bloc, à la SonalPi, pour laisser la place au barré+pseudo sans décaler le
   texte).
3. **Portée (brouillon/document/corpus) + panneau « Pseudos » du corpus** à la
   SonalPi : `RegleAnon` partagée, scan, application en masse.

### On laisse de côté (différé, hors ce plan)

- Multi-alias (`Lyon/Lyons`), multi-pseudo (`a/b`), cas des incluses.
- NER / suggestion automatique d'entités (seules les entités saisies sont
  détectées, comme SonalPi).
- « À traiter » en temps réel dans l'éditeur (le match live à chaque frappe) —
  sauf là où c'est peu coûteux (requête ponctuelle à l'ouverture / au scan).

### Principe directeur maintenu (cf. plan-anon-debut §1)

Trois concepts, **deux seuls nouveaux types** :

- **OccurrenceAnon** = décision sur une plage de texte. **Ce n'est PAS un type
  nouveau** : c'est l'`Annotation` existante ([annotation.ts](../src/shared/entretien/annotation.ts))
  filtrée par `type === 'anon'`, qui porte déjà `pseudo`, `etat`
  (`'anonymise' | 'exception'`) et `regle?` (id). Vit dans
  `entretiens/<id>.json` (annotations). En v1 on l'utilise déjà telle quelle ;
  le champ `regle` reste vide en v1 (occurrences **standalone**), rempli à
  l'étape 3 pour les occurrences **rule-backed** (portée « corpus »).
- **`RegleAnon`** = mappage `entité → pseudo` partagé. **Nouveau type** (étape 3),
  vit dans `corpus.json.reglesAnon` (seule vérité « règle »).
- **`BrouillonAnon`** = draft entretien-local, **pas une règle**. **Nouveau type**
  (étape 3), vit dans `entretiens/<id>.json.brouillonsAnon`.

« OccurrenceAnon » est donc seulement le **nom conceptuel** qu'on donne à « une
annotation de type anon », pour la distinguer du discours avec la règle et le
brouillon — le code parle de `Annotation` filtrée par `type==='anon'`.

---

## 1. Vue d'ensemble & faisabilité

| Étape | Risque | Effort | Dépend de |
|---|---|---|---|
| **0 — Table + BrouillonAnon** | faible | moyen | v1 (acquis) |
| **1 — Exceptions** | faible | moyen | v1 + étape 0 (compteurs dans la table) |
| **2 — Locuteurs/gouttière** | **moyen-visuel** (refonte gouttière) | moyen-haut | v1 |
| **3 — Règles corpus + panneau** | élevé (vertical slice main+renderer+IPC) | haut | v1 + étape 0 (slider gagne le cran corpus) ; (3b dépend de 3a) |

- **0 et 1 et 2 sont indépendantes** (l'une ne bloque pas l'autre). L'ordre
  0→1→2 reflète le risque croissant.
- Le pseudo locuteur **« suggéré »** (un locuteur dont le nom matche une règle
  corpus) **straddle 2 et 3** : en étape 2 on ne fait que *confirmer/refuser*
  (manuel) ; la suggestion dérivée du corpus vient en étape 3 (une fois les
  `RegleAnon` existantes).
- **Étape 3 à scinder** en 3a (lecture) / 3b (écriture) pour garder des
  livrables testables (cf. §4).

Critère de fin global : un entretien SonalPi anonymisé (texte + locuteurs +
exceptions) s'affiche fidèlement, s'édite (exceptions, pseudos locuteurs),
s'enrichit de règles de portée corpus, et repart vers SonalPi sans perte.

---

## Étape 0 — Table à la SonalPi + `BrouillonAnon` (slider 2-crans)

> Refonte de l'UI v1 (« lignes dérivées + ligne brouillon éphémère ») en vraie
> table à la SonalPi, et introduction du `BrouillonAnon` (persisté,
> entretien-local, **pas une règle**). Le slider a **2 crans**
> (brouillon / entretien) ; le 3ᵉ (corpus) est **désactivé/caché** et
> s'activera à l'étape 3. Reste dans le modèle propre : aucune règle stockée
> à l'entretien.

### 0.1 Modèle

- **`BrouillonAnon`** `{entite, pseudo?}` dans [format.ts](../src/shared/format.ts)
  + champ additif `brouillonsAnon: BrouillonAnon[]` dans
  `EntretienFichier`/`PayloadEntretien`. **Pas de bump** de `formatVersion`.
  Pseudo optionnel (« entité seule » — sa navigation ◄ i/N ► viendra plus
  tard ; en étape 0, un tel brouillon est un draft inerte).
- **OccurrenceAnon** standalone inchangée (v1) : `Annotation{type:'anon',
  pseudo, etat:'anonymise'}`, sans `regle`.

### 0.2 UI — table (refonte de l'onglet Anon)

- Une **ligne par entité** : Nom / Pseudo / **slider brouillon·entretien** /
  compteurs / actions. Le cran « corpus » est présent mais **grisé/
  inactif** (prépare l'étape 3).
- **État d'une ligne DÉRIVÉ** (pas stocké comme portée) : `brouillon` = un
  `BrouillonAnon` existe pour cette entité (0 occurrence) ; `entretien` =
  occurrences standalone posées (pas de règle).
- **Seeding d'une nouvelle ligne** : sélection dans le texte → remplit le Nom
  d'une ligne brouillon (comme v1) ; OU saisie directe dans une ligne vide en
  bas de table.
- **Validation (Entrée)** sur une ligne brouillon → portée « entretien » :
  applique à toutes les occurrences (v1 `validerAnon`), le brouillon est
  **consommé** (retiré de `brouillonsAnon`).
- **Auto-brouillon** : changer de ligne **sans Entrée** → la ligne reste en
  brouillon (persistée). Pseudo optionnel.
- **Compteurs** par ligne : `anonymisé` (et `exception` dès l'étape 1). Le
  « à traiter » n'existe pas encore (pas de règle corpus) — il arrive en 3.

### 0.3 Ce que ça prépare (et ce que ça diffère)

- Installe la **table UX + le conteneur slider** que les étapes 1 (compteurs
  d'exception par ligne, menu par occurrence) et 3 (cran corpus + promotions)
  viennent habiter.
- Fait vivre le `BrouillonAnon` **tôt et à bas risque** (entretien-local,
  aucune double vérité — ce n'est pas une règle).
- **Différé** : la navigation/loupe ◄ i/N ► sur les brouillons « entité seule »
  (post-3) ; la sérialisation des brouillons dans le `.sonal` — en étape 0 les
  brouillons sont **internes à SonalAsynchro** (survivent par le fichier
  entretien, ne fuient pas dans le `tabAnon` legacy).

  **Stockage SonalPi (à considérer pour l'import/export étape 3)** : les
  brouillons y sont des **entrées du `tabAnon`** (le bloc `anon-json` du
  `.sonal`), au même titre que les règles document/corpus, distinguées par un
  champ `portee: 'brouillon'` (avec `occurrences:0`). Le `anon-json` est donc
  le tableau `tabAnon` sérialisé, brouillons compris. Aujourd'hui
  `importSonal.ts` met tout `anon-json` en pass-through `legacy.tabAnon` et ne
  produit des `OccurrenceAnon` que depuis les **spans** `.anon` → les
  brouillons d'un `.sonal` SonalPi sont **perdus pour le modèle** (survivent
  seulement dans le pass-through). À l'étape 3 : parser `legacy.tabAnon` →
  entrées `portee:'brouillon'` (= `BrouillonAnon`), entrées `portee:'corpus'`/
  undefined (= `RegleAnon`) ; l'export régénère `anon-json` depuis
  `BrouillonAnon` + `RegleAnon` (les occurrences restent en spans).
  `matchPositions` (cache SonalPi) peut être émis vide — SonalPi le re-dérive
  à l'import.

### 0.4 Tests (headless)

- `BrouillonAnon` : persistance (save/reload l'entretien), auto-save au blur
  d'une ligne non validée, **consommation** à la validation (Entrée →
  occurrences posées + brouillon retiré).
- Dérivation de l'état d'une ligne : brouillon (0 occ.) vs entretien (occ.
  posées) — la table reflète le modèle sans portée stockée.
- Round-trip léger : les brouillons ne fuient pas dans le `tabAnon` du `.sonal`
  (legacy inchangé) — connu et assumé jusqu'à l'étape 3.

---

## 2. Étape 1 — Exceptions par occurrence

> Une **exception** = une `OccurrenceAnon` qu'on laisse **volontairement en
> clair** (texte non remplacé). Mémorisée pour ne jamais redevnir « à traiter »
> toute seule. Parité SonalPi `anon-exception`.

### 2.1 Modèle (déjà en place, on l'active)

`Annotation{type:'anon', etat:'exception', pseudo?: string}` existe déjà ;
l'import `.sonal` produit déjà les exceptions (span `.anon-exception`), l'export
les re-sérialise. Rien à migrer.

**Sémantique (tranchée en session : option 2 — mémoire locale, y compris à
l'import)** : une exception **n'est pas barrée** et **n'affiche jamais de
`[pseudo]`** — le texte reste lisible. Le pseudo d'une exception n'est
**jamais sérialisé à l'EXPORT** (un span `.anon-exception` ne porte pas de
`data-pseudo` — convention SonalPi vérifiée dans son code : SonalPi supprime
le `data-pseudo` lui-même en posant l'exception) ; en MODÈLE il est conservé
comme mémo locale, qu'il vienne de la bascule dans l'app (l'occurrence
anonymisée portait son pseudo) ou d'un `data-pseudo` hors-convention présent
sur le span importé. Cette mémo sert à « remettre en anonymisé » sans perte
(cas de l'entité à une seule occurrence). Quand les `RegleAnon` existeront
(étape 3), le vrai porteur du pseudo sera la règle et cette mémoire deviendra
morte (l'exception référencera la règle par `regle`). On ne stocke jamais
autre chose que `etat` + ce pseudo-mémoire.

### 2.2 Rendu (décorations + CSS)

- `decorations.ts` : distinguer les occurrences par `etat`.
  - `etat:'anonymise'` → classe `anon` (barré + `[pseudo]`, comme v1).
  - `etat:'exception'` → classe `anon-exception` (PAS de barré, PAS de
    `::after`). Marqueur discret pour que l'utilisateur sache que c'est tracé :
    léger soulignement pointillé gris (pour le distinguer du texte brut).
- `editeur.css` : `.editeur .anon-exception { text-decoration: underline dotted #bbb; }`
  (pas de `line-through`, pas de `::after`).

### 2.3 Interaction : menu contextuel (clic droit sur l'occurrence)

- Plugin ProseMirror : `props.handleDOMEvents.contextmenu(view, event)` →
  `posAtCoords` → résoudre l'`OccurrenceAnon` couvrante (via les
  `data-annot-ids` de la décoration, ou un `find` sur `entretien.annotations`).
  - Si le clic tombe sur une occurrence `anon` → ouvrir un menu flottant (petit
    composant Vue, positionné à l'événement) :
    - si `etat:'anonymise'` → **« Laisser en clair (exception) »** →
      `basculerException(id)` met `etat='exception'` et **conserve le pseudo
      en mémoire de modèle** (jamais affiché, jamais exporté — option 2, cf. §2.1).
    - si `etat:'exception'` → **« Remettre en anonymisé »** →
      `basculerAnonymise(id)` remet `etat='anonymise'`, `pseudo` = pseudo
      mémorisé de l'exception s'il est présent, sinon celui de la ligne
      (règle) courante.
  - Sinon (texte non anon) → pas de menu (ou menu neutre plus tard).
- Pas de suppression d'occurrence ici (le ✕ de la ligne reste l'acte destructif).

### 2.4 Tweak `validerAnon` (sous-étape 3 v1)

Aujourd'hui `validerAnon` relabel TOUTES les occurrences de l'entité (y compris
les exceptions) → ça écraserait la mémoire de pseudo d'une exception. À corriger
(FAIT, §2.4) :
- relabel **seulement** les `etat:'anonymise'` (les exceptions gardent leur état
  et leur pseudo-mémoire intacts) ;
- « poser nouveau » sur un match : si le match est couvert par une **exception**
  de l'entité → **ne pas striker** (l'exception reste, le match reste en
  clair), y compris pour un match qui CONTIENT une exception (pas d'absorption
  par-dessus une exception). C'est le respect de la mémorisation : une
  exception ne repasse jamais « à traiter ».

### 2.5 Compteurs & tableau

La ligne du tableau gagne un compteur scindé : `anonymisé / exception / à
traiter`. En v1 (occurrences only, pas de « à traiter » live), on affiche
`anonymisé` et `exception` (le « à traiter » viendra avec l'étape 3, requête
sur le corpus). Navigation occurrence-par-occurrence (◄ i/N ►) — différé si
trop tôt, on commence par le compteur seul.

### 2.6 Tests (headless)

- `anonymisation` : une exception couvrante bloque la pose d'une nouvelle
  occurrence sur le même match (test sur `validerAnon` via le moteur).
- `decorations`/remap : une exception survit au remap (son `etat` est préservé).
- Round-trip : une exception importée → ré-exportée garde sa classe
  `anon-exception` et **pas** de `data-pseudo` (déjà couvert par le test v1, à
  compléter si besoin).

---

## 3. Étape 2 — Locuteurs / gouttière

> Pseudonymiser l'**étiquette de prise de parole** (axe séparé du texte, cf.
> plan_anon §1.1 / §3.3). Le locuteur est un **objet du modèle** : le pseudo
> devient un champ, le rendu suit par référence (plus de hack DOM SonalPi).

### 3.1 Modèle — `Locuteur` (évolution douce)

```ts
interface Locuteur {
  // … existant …
  pseudo?: string                          // pseudo appliqué à l'étiquette
  pseudoEtat?: 'confirme' | 'refuse'        // absent = rien ; « suggéré » = REQUÊTE (étape 3)
}
```

- **Confirmé / refusé** = les deux états **persistés** (parité SonalPi).
- **Suggéré** = REQUÊTE, jamais stocké : un locuteur sans `pseudoEtat` dont le
  nom matche un alias d'une `RegleAnon` corpus → *suggérable*. Calculé à
  l'affichage (étape 3 seulement, quand le corpus existe).
- Invariant (plan §3.3) : une règle est **matérialisée** si elle a ≥ 1
  `OccurrenceAnon` OU ≥ 1 locuteur confirmé — à garder pour le scan corpus.

### 3.2 Refonte gouttière (le point risqué)

Aujourd'hui ([locuteursGutter.ts](../src/renderer/editor/locuteursGutter.ts)) :
le nom est une décoration `inline-block` de largeur fixe **à gauche du bloc,
même ligne**. Pour barrer le nom + afficher `[pseudo]` sans décaler le texte,
il faut le nom **au-dessus du bloc** (layout SonalPi `.ligloc`) :

```
[Enquêteur̶]  [Pseudo]
Le texte du tour commence ici, pleine largeur…
```

- `locuteursGutter.ts` : passer d'une décoration inline-gauche à un **widget
  au-dessus** du paragraphe (ou un bloc-gutter). Attention aux points qui
  s'appuient sur la géométrie actuelle :
  - **synchro audio** (barre de lecture, clic-tour) — `tempsDuBloc`/`clicTour`
    ne dépendent pas de la gouttière, mais le rendu visuel du bloc-lu oui ;
  - **scission/fusion** de blocs et le remap des ancres — la gouttière est un
    widget, elle suit les positions, mais le `Paragraph` doit accepter le
  widget au-dessus sans casser le schema.
- `editeur.css` : `.gouttiere-loc` passe en bloc au-dessus (flex column), nom
  + pseudo sur une ligne, texte dessous. Préserver le clic-tour (seek audio au
  début du tour) sur le nom.
- Rendu du pseudo locuteur : même idiome CSS que le texte anon — `.loc-anon`
  barré + `::after [pseudo]` (le `display:inline-block` atomique pour ne pas
  barrer le pseudo, cf. astuce v1).

### 3.3 Interaction

- Onglet **Locuteurs** : par locuteur, un champ **Pseudo** + un interrupteur
  **confirmer / refuser** (miroir de l'interrupteur « interviewer » existant).
  Pas de suggestion ici (étape 3).
- **(Optionnel, à trancher)** au moment de valider une ligne Anon dont l'entité
  matche un nom de locuteur → dialogue « pseudonymiser aussi l'étiquette ? »
  (miroir SonalPi `proposerPseudoLocuteur`). Couvre le cas du locuteur non cité
  dans le texte (règle matérialisée par le seul libellé). À juger : ça peut
  attendre l'étape 3 (suggestion) sans perte.

### 3.4 Round-trip `.sonal`

- **Import** : les marqueurs SonalPi sur les `.ligloc`
  (`loc-anon` / `data-locpseudo` / `loc-suggere-refuse`) → `Locuteur.pseudo` /
  `pseudoEtat`. À ajouter à [importSonal.ts](../src/renderer/import/importSonal.ts).
- **Export** : re-sérialiser ces marqueurs sur les `.lblseg.ligloc` à partir de
  `Locuteur.pseudo`/`pseudoEtat`. À ajouter à [exportSonal.ts](../src/renderer/import/exportSonal.ts).

### 3.5 Tests (headless)

- `locuteurs` : poser/confirmer/refuser un pseudo, le rendu suit par référence.
- Round-trip : import d'un `.sonal` SonalPi avec locuteurs pseudonymisés →
  modèle → ré-export → marqueurs `data-locpseudo` préservés (golden, sur un
  fixture à créer ou étendre `entretien1.sonal`).

---

## 4. Étape 3 — Règles corpus + brouillons + panneau « Pseudos »

> On introduit la **`RegleAnon`** (mappage corpus partagé), les **`BrouillonAnon`**
> (drafts entretien-locaux, **pas des règles**) et le scan inter-entretiens.
> Modèle figé (cf. §4.0) : **aucune règle stockée à l'entretien**. **À scinder**
> en 3a (lecture) puis 3b (écriture).

### 4.0 Modèle figé (zéro double vérité sur les règles)

Trois objets, trois lieux — **aucune règle n'est stockée à l'entretien** :

| Objet | Lieu | Rôle |
|---|---|---|
| `BrouillonAnon` `{entite, pseudo?}` | `entretiens/<id>.json` (champ additif `brouillonsAnon`) | draft entretien-local, **PAS une règle**. Pseudo optionnel (« entité seule » pour naviguer plus tard). Auto-sauvé au blur d'une ligne non validée (parité table SonalPi). Promotable en « entretien » (apply) ou « corpus » (règle). |
| `OccurrenceAnon` | `entretiens/<id>.json` (annotations) | décision sur une plage. **Standalone** (pseudo porté, pas de `regle` = portée « entretien ») **OU rule-backed** (`regle: id`, pseudo = règle = portée « corpus » appliquée ici). |
| `RegleAnon` `{id, entite[], pseudos[]}` | `corpus.json.reglesAnon` | la SEULE vérité « règle » : partagée, active. Pas de `actif` (le brouillon est entretien-local, pas un drapeau de règle). |

**Le slider (table de l'onglet Anon, une ligne par entité)** = indicateur d'état
**et** action de promotion :
- **brouillon** → la ligne est un `BrouillonAnon` (0 occurrence). Visible
  **dans l'onglet Anon de l'entretien** (pas dans le panneau corpus).
- **entretien** → occurrences appliquées ici, standalone (pas de règle) =
  notre « valider » v1.
- **corpus** → une `RegleAnon` existe et est appliquée ici ; le scan localise
  les « à traiter » dans les **autres** entretiens (requête, **sans marquer
  leur texte**).

**Navigation (loupe ◄ i/N ►)** = étape **ultérieure** (post-3). En 3, un
brouillon « entité seule » est un draft inerte (à naviguer plus tard).

**Pas de réconciliation continue** : un brouillon (draft personnel) peut
coexister avec une règle corpus de même entité. À la **promotion**
brouillon → corpus, si une règle corpus de même entité existe avec un pseudo
divergent → **dialogue une fois** (aligner / garder les deux = multi-pseudo,
différé). Contrairement à SonalPi I-POR-3, rien à réconcilier à l'ouverture
(le brouillon n'est pas une vérité concurrente).

### 4.1 Étape 3a — `RegleAnon` corpus + scan + panneau lecture

- **Type** `RegleAnon` dans [format.ts](../src/shared/format.ts) :
  ```ts
  interface RegleAnon { id: string; entite: string[]; pseudos: string[] }
  ```
  (pas de `actif` : le brouillon est entretien-local, pas un drapeau de règle.)
  Typer `corpus.json.reglesAnon` de `Record<string, unknown>` (pass-through) en
  `Record<string, RegleAnon>`. Champ déjà présent → **pas de bump** de
  `formatVersion`.
- **Référence** : `OccurrenceAnon.regle` (id) pour les occurrences
  **rule-backed** (portée « corpus »). Les **standalone** (portée « entretien »)
  restent sans `regle`, pseudo porté. Migration douce : à l'ouverture d'un
  entretien v1 (occurrences standalone), **on ne force pas** le lien à une
  règle — elles restent standalone. Le sas ne crée des règles corpus **qu'à la
  promotion** (3b).
- **Scan = requête** (moteur `anonymisation.ts` pur, réutilisé) : lire
  `entretiens/*.json`, pour chaque règle corpus classer les occurrences par
  entretien — appliqué (OccurrenceAnon rule-backed couvrante) / exception /
  à traiter (match non couvert). Badges par état. **Pas de marquage** dans le
  texte des entretiens non ouverts. **Pas de cache** (mémoïsation volatile).
- **Panneau « Pseudos » dans [Corpus.vue](../src/renderer/components/Corpus.vue)** :
  table des règles corpus (entité, pseudo, compteurs globaux par état),
  drill-down par entretien avec contexte. **Lecture seule en 3a**. Les
  brouillons n'y figurent pas (entretien-local).
- **IPC** : `corpus:reglesAnon` (lire/écrire), `corpus:scanAnon` (requête).
- **Tests headless** : scan sur un dossier de test (≥ 2 entretiens), compteurs
  corrects, drill-down.

### 4.2 Étape 3b — Cran corpus + slider 3-crans + application en masse

- **`BrouillonAnon`** déjà introduit en **étape 0** (entretien-local). En 3b on
  active le **3ᵉ cran du slider** (corpus) et les promotions qui créent des
  règles. Le cran corpus, grisé en étape 0, devient actif.
- **Promotions** (le slider agit) :
  - **brouillon → entretien** : poser les `OccurrenceAnon` standalone
    (v1 valider), retirer le brouillon.
  - **brouillon → corpus** : créer la `RegleAnon` (ou réutiliser une existante
    même entité ; dialogue si pseudo divergent), poser les occurrences
    rule-backed, retirer le brouillon.
  - **entretien → corpus** : créer/réutiliser la règle, **lier** les
    occurrences standalone existantes (`regle: id`).
  - **corpus → entretien** : **délier** les occurrences (re-passent
    standalone) ; la règle corpus est supprimée **seulement si isolée**
    (aucun autre entretien ne la référence — garde I-POR-5). Sinon refusé (🔒).
  - **corpus → brouillon / suppression** : retirer les occurrences + créer un
    brouillon (ou supprimer) ; garde « isolée » sur la règle corpus.
- **Application en masse** depuis le panneau corpus (valider des occurrences
  cochées sur des entretiens fermés) : ouvrir l'entretien sous verrou, poser les
  `OccurrenceAnon` rule-backed, sauver. L'atomicité fichier remplace la
  plomberie SonalPi `setHtml`/`majFichierSonal`.
- **Retrait du pass-through `tabAnon`** : une fois le `RegleAnon` corpus
  autoritaire et le round-trip vérifié (e2e : importer un `.sonal` anonymisé
  SonalPi → exporter → rouvrir dans SonalPi sans perte), on retire le
  `legacy.tabAnon` (limite v1 connue, plan-anon-debut). En 3b les règles corpus
  sont re-sérialisées en `anon-json` (forme SonalPi `remplacement`/
  `remplacementAlt`, `portee:'corpus'`) depuis `corpus.json.reglesAnon`, ET les
  `BrouillonAnon` depuis `entretiens/<id>.json.brouillonsAnon` (entrées
  `portee:'brouillon'`, `occurrences:0`) — cf. stockage SonalPi §0.3. À
  l'import 3b, on parse `legacy.tabAnon` pour produire ces deux types (les
  brouillons actuellement perdus pour le modèle deviennent des
  `BrouillonAnon`).

### 4.3 Tests (headless + e2e)

- Scan : compteurs appliqué/exception/à-traiter corrects sur ≥ 2 entretiens ;
  aucun texte marqué dans les entretiens non ouverts.
- Promotions : brouillon→entretien (occurrences standalone), entretien→corpus
  (lien posé), corpus→entretien refusé si règle non isolée.
- e2e : round-trip SonalPi complet (texte + locuteurs + exceptions + règles
  corpus) sans perte.

---

## 5. Dépendances croisées & points à trancher

1. **Modèle figé** (cf. §4.0) : brouillon entretien-local (pas une règle) +
   règle corpus-only. Plus de point ouvert sur la modélisation.
2. **Suggestion de pseudo locuteur** : straddle étapes 2/3. En 2 : manuel
   (confirmer/refuser). La suggestion dérivée du corpus vient en 3a (requête
   sur `corpus.json.reglesAnon`).
3. **Menu contextuel exceptions vs tableau** : le clic droit est l'UX souhaitée.
   Repli si trop lourd : action « exception/anonymisé » dans un drill-down du
   tableau (occurrence par occurrence). À juger en 2.3.
4. **Refonte gouttière (étape 2)** : risque visuel ; prévoir de valider la
   synchro audio (barre de lecture, clic-tour) et le remap des ancres après le
   changement de layout.
5. **`formatVersion`** : `reglesAnon` corpus déjà présent (pass-through) →
   typage additif sans bump. `Locuteur.pseudo/pseudoEtat` = champs additifs →
   pas de bump. À confirmer au démarrage de chaque étape.
6. **« À traiter » live** : hors périmètre sauf requêtes ponctuelles (ouverture
   d'entretien en 3, scan corpus en 3a). Le match live à chaque frappe reste
   différé.

---

## 6. Ordre proposé des livraisons

1. **Étape 0** (table + BrouillonAnon, slider 2-crans) — `BrouillonAnon` +
   champ `brouillonsAnon` + refonte onglet Anon en table + slider 2-crans +
   validation (Entrée) / auto-brouillon (blur) + tests.
2. **Étape 1** (exceptions) — rendu exception → menu contextuel →
   tweak `validerAnon` → compteurs (dans la table) → tests.
3. **Étape 2** (locuteurs/gouttière) — `Locuteur.pseudo/pseudoEtat` →
   refonte gouttière (nom au-dessus) → onglet Locuteurs (pseudo+interrupteur)
   → round-trip import/export → tests.
4. **Étape 3a** (`RegleAnon` corpus + scan + panneau lecture) — type + IPC +
   scan (pur) + panneau Corpus.vue + tests.
5. **Étape 3b** (cran corpus + promotions + masse) — activation du 3ᵉ cran +
   promotions (brouillon/entretien/corpus) + application en masse + retrait
   `tabAnon` legacy + e2e.

Chaque sous-étape livrable + tests headless, comme en v1.
