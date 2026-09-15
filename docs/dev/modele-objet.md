# Modèle objet — vue à 3 niveaux

> Ce document décrit le modèle d'objet de **SonalPi2**, recalé sur le **code actuel**.
> Il reprend la structure « vue à 3 niveaux » des premières réflexions (POC `MODELE_OBJET.md`) :
> une **vue d'ensemble** stable, puis des **sous-schémas par préoccupation** (un diagramme et un
> ancrage code chacun), puis des **notes en prose**. Contrairement à SonalPi1, le modèle est
> ici **explicite** : il est directement écrit en TypeScript dans `src/shared/`.

---

> Pour les cas analytiques, leur persistance et leurs évolutions prévues,
> voir la page dédiée [Cas analytiques — modèle et fonctionnement](cas.md).

## Principe d'organisation (les 3 niveaux)

| Niveau | Contenu | Section |
|---|---|---|
| **1 — Vue d'ensemble** | les **agrégats**, le patron à 3 étages et la colonne vertébrale du texte | §1, §2 — court et stable |
| **2 — Sous-schémas par préoccupation** | un cluster cohérent, sa logique, son lien avec les fichiers | §3 à §10 — un diagramme chacun |
| **3 — Notes en prose** | asymétries, non-implémenté, carte code ↔ modèle | §11, §12 |

> **Ce qui s'est effondré depuis SonalPi1.** Le code actuel a **supprimé** une grande partie de
> la complexité que le doc initial devait documenter : la **double tenue** EAV local↔corpus
> (SonalPi2 : une seule vérité par donnée), la **triple tenue** d'anonymisation (règle ↔ occurrence ↔
> cache corpus), les **fragments** coupés par le marquage (SonalPi2 : plages de positions ProseMirror),
> et l'`Extrait` (SonalPi2 : une **requête**). Chaque sous-schéma ci-dessous le constate au passage.

---

# Niveau 1 — Vue d'ensemble

## 1. Les agrégats

> **Qu'est-ce qu'un « agrégat » ?** (terme *Domain-Driven Design*) : une **frontière de
> cohérence**, un cluster d'objets traité comme une seule unité. Ici chaque agrégat est **explicite**
> et reflète un fichier : `corpus.json` = **Corpus**, `entretiens/<id>.json` = **Entretien**.

Le domaine a **deux agrégats** — un concept ≠ un fichier physique :
- **Corpus** (concept) = `corpus.json` (définitions + membership) + N fichiers entretien + requêtes ;
- **Entretien** (concept) = `entretiens/<id>.json`, seul MAIS dépendant du corpus pour interpréter
  ses références (`cat_005`, `v3m1`…).

> **Fondamental : le Corpus ne *contient* pas les entretiens.** Il n'en garde que des **références
> légères** (`EntretienRef` : titre, date, lastModified — rien du contenu). Le contenu vit dans un
> fichier séparé par entretien.

```mermaid
classDiagram
    direction LR

    class CorpusFichier {
        <<corpus.json — agrégat Corpus>>
        +Record codebook «Categorie[]»
        +Record variables «Variable[]»
        +Record reglesAnon «RegleAnon[]»
        +Record personnes «Personne[]»
        +Record membership «EntretienRef[]»
        +string nom?
        +meta? sourceV1, demo
    }

    class EntretienRef {
        +string titre
        +string date
        +string lastModified
        «PAS le contenu — de quoi lister/ouvrir»
    }

    class Categorie {
        +string id «opaque, déterministe à l'import»
        +string nom
        +string couleur?
        +int taille?
        +int ordre «explicite, jamais dérivé»
        +string parent «null = racine — hiérarchie»
        +bool actif
        +string codeExport «cat_XXX — export .sonal, pas l'identité»
    }

    class Variable {
        +string id «opaque, déterministe: v{n}»
        +string lib
        +portee «entretien | locuteur»
        +bool priv
        +int ordre
        +int vExport «code export .sonal»
        +Modalite[] modalites
    }

    class RegleAnon {
        +string id
        +string[] entite «alias séparés par entité»
        +string[] pseudos «1..2 pseudos»
    }

    class EntretienFichier {
        <<entretiens/<id>.json — agrégat Entretien>>
        +unknown corpsTexte «doc ProseMirror (JSON)»
        +Annotation[] annotations «codage | anon | commentaire»
        +Ancre[] ancres «{pos, t}»
        +Locuteur[] locuteurs
        +MetaEntretien meta «valeursGen, audioRef»
        +BrouillonAnon[] brouillonsAnon?
        +pseudosDeclares?
        +legacy?
    }

    class Annotation {
        +string id
        +type «codage | anon | commentaire»
        +int from «position PM, remappée»
        +int to «position PM, remappée»
        +string auteur
        +string code? «codage → Categorie.id»
        +string regle? «anon → RegleAnon.id»
        +string pseudo? «anon — le pseudo appliqué»
        +etat? «anonymise | exception»
        +string texte? «commentaire → contenu autonome»
    }

    class Ancre {
        +int pos «position PM, remappée»
        +float t «temps MESURÉ (secondes)»
    }

    class Locuteur {
        +int index «identité par entretien — les blocs le référence»
        +string nom
        +bool interviewer? «tours en italique»
        +string pseudo? / pseudoEtat? «pseudonymisation du libellé»
        +string couleur?
        +Record valeursLoc «idVar→idMod — portée locuteur»
        +string personneRef «→ Personne, facultatif»
    }

    CorpusFichier "1" o-- "*" EntretienRef : membership
    CorpusFichier "1" o-- "*" Categorie : codebook
    CorpusFichier "1" o-- "*" Variable : schéma EAV
    Variable "1" o-- "*" Modalite : modalités (dépendantes)
    CorpusFichier "1" o-- "*" RegleAnon
    EntretienRef "1" ..> "1" EntretienFichier : référence (fichier distinct)
    EntretienFichier "1" *-- "*" Annotation
    EntretienFichier "1" *-- "*" Ancre
    EntretienFichier "1" o-- "*" Locuteur
    Annotation "*" ..> "0..1" Categorie : code (codage, par id)
    Annotation "*" ..> "0..1" RegleAnon : regle (anon, par id)
    Locuteur "1" o-- "*" Modalite : valeursLoc (par id)
```

### Le patron à 3 étages (clé de lecture)

Le codage, l'anonymisation et les données EAV suivent le même empilement — c'est la **nature des
données** de [donnees.md](donnees.md) :

| Étage | Rôle | Codage | Anonymisation | Stocké où |
|---|---|---|---|---|
| **1. Définition** | posée une fois | `Categorie` | `RegleAnon` | **`corpus.json`** |
| **2. Application** | la décision sur le texte/l'entretien | `Annotation{type:'codage'}` | `Annotation{type:'anon'}` | **`entretiens/<id>.json`** |
| **3. Lecture** | la vue dérivée, recalculée | `resumeThematique` | `scannerCorpus` (statuts) | **rien** (calculé) |

**Lecture verticale** : on **définit** un terme (étage 1 → corpus) ; il se **matérialise** sur un
entretien (étage 2 → fichier entretien) ; on le **relit** de façon agrégée (étage 3 → calculé).
Les valeurs EAV suivent le même patron (§4).

> **L'exception `Annotation{type:'commentaire'}`.** Il vit à l'**étage 2** (décision sur une plage du
> texte) mais n'a **aucun étage 1** : il ne dérive d'aucun dictionnaire, il **porte son propre
> contenu** (`texte` + `auteur`). C'est ce qui le rend *autonome* — là où `codage` et `anon` ne sont
> que la **projection** d'une définition stockée ailleurs.

---

## 2. La colonne vertébrale du texte : WYSIWYG, positions PM, ancres

Le texte vit dans un **document ProseMirror** édité librement (WYSIWYG) — champ `corpsTexte` de
`EntretienFichier`. Il n'y a **plus** de `Token`, `Fragment`, `Segment` ni `Extrait` de SonalPi1 :
la retranscription fine (une unité horodatée par *cue* SRT) ne se matérialise **plus** comme
structure de texte.

- **Bloc** *(paragraphe)* : le texte est organisé en **paragraphes** libres. Ce qui subsiste de
  l'ancien « segment », c'est le **locuteur** (`loc`, attribut éditable du bloc ; le tour de parole
  est **dérivé** : run de blocs consécutifs de même `loc`, jamais stocké) et le **timing**.
- **Le timing n'est pas porté par le bloc** : il vit dans les **ancres temporelles**
  `Ancre {pos, t}` — une position ProseMirror (`pos`, remappée aux éditions) + un temps **mesuré**
  (`t`, secondes, bornes de cue SRT). *Jamais de temps fabriqué* : l'interpolation entre deux ancres
  est une **dérivation à la lecture** (requête, pas cache). Code : `entretien/audio.ts`
  (`projeterAncres`, `plageCourante`, `tempsAuPoint`).
- **Positions ProseMirror** : les annotations et ancres référencent des positions **linéaires du
  doc PM**, qui traversent les paragraphes (chaque bloc = open + contenu + close). L'arithmétique
  pure vit dans `entretien/positions.ts` (`debutBloc`, `charVersPM`, `pmVersTranches`) — utilisée
  par le store (migration), l'import/export et les requêtes.
- **Granularité du snap-to-mot** : une sélection est étendue aux **frontières de mot** (choix
  SonalPi1 conservé) — la couche éditeur (`editor/snap.ts`) le fait avant de poser une annotation.
  Rien dans le modèle n'impose la longueur d'une plage.

> **Conséquence : un marquage ne coupe plus le texte.** Une `Annotation` est une **plage de
> positions** [from, to[ sur le doc PM ; elle peut **enjamber plusieurs blocs/locuteurs** en une
> seule entité. La « plage taillée par le marquage » (fragment coupé) de SonalPi1 n'a plus
> d'existence stockée — au mieux une notion **dérivée de rendu** (décorations), jamais persistée.

---

# Niveau 2 — Sous-schémas par préoccupation

> Chaque sous-schéma détaille un cluster cohérent : son **diagramme minimal** et son **ancrage
> code** (fichiers, types, fonctions). Tous vivent sous `src/shared/` — des fonctions **pures**,
> testables headless, sans DOM ni I/O.

## 3. Annotation (le concept unificateur)

> **Cadrage.** Les trois overlays inline de SonalPi1 (codage / anonymisation / commentaire,
> portés par des fragments HTML) **fusionnent** en **un seul concept** : `Annotation`. Le patron
> à 3 étages (§1) suppose que les annotations portent une *borne* de plage `[from, to[` — les
> seules unités de texte sont des **positions ProseMirror**.

```mermaid
classDiagram
    direction LR

    class Annotation {
        +string id
        +type «codage | anon | commentaire»
        +int from
        +int to
        +string auteur
        +string code? «codage → Categorie.id»
        +string regle? «anon → RegleAnon.id»
        +string pseudo? «anon : pseudo appliqué»
        +etat? «anonymise | exception»
        +string texte? «commentaire : contenu autonome»
    }

    class EntretienFichier

    EntretienFichier "1" *-- "*" Annotation : annotations[]
```

- **Codage** : `{type:'codage', code}` — le `code` référence une `Categorie` **par id** (référence,
  pas copie). Geste « re-coder = retirer » = `trouverCodage` (`entretien/entretien.ts`).
- **Anonymisation** : `{type:'anon', regle?, pseudo?, etat}` — `etat` = `'anonymise' | 'exception'` ;
  `pseudo` est pour l'instant porté **sur l'annotation** (provisoire : quand `RegleAnon` sera
  pleine, on lira le pseudo **depuis la règle**, via `regle`). Détail en §6.
- **Commentaire** : `{type:'commentaire', texte, auteur}` — contenu **autonome**, aucun étage 1.
- **Remap** : les positions `from`/`to` d'une annotation **suivent les éditions du texte** — le
  plugin `editor/remap.ts` observe `tr.mapping` de ProseMirror et met à jour les bornes à chaque
  transaction. Sérialisées avec le document → valides par construction à la relecture (pas de
  reindexation).
- **Orphelines** : une annotation dont la plage a été **entièrement supprimée** (`from >= to`) est
  dite *orpheline* (`estOrpheline`, `annotation.ts`) : **conservée** (pas de suppression
  silencieuse), listée, exclue des requêtes de lecture.

**Code** : `src/shared/entretien/annotation.ts`, `src/shared/entretien/entretien.ts`
(commandes `ajouterCodage`, `retirerAnnotation`, `trouverCodage`), `src/renderer/editor/remap.ts`.

## 4. EAV — variables & valeurs

> **Cadrage.** Le cœur « base de données ». Contrairement à SonalPi1, la **double tenue
> locale↔corpus a disparu** : le **schéma** (`Variable` + `Modalite`) vit au **corpus**, les
> **valeurs** vivent **chez leur propriétaire** côté entretien. Une seule vérité par donnée.

```mermaid
classDiagram
    direction LR

    class Variable {
        +string id «v{n} — déterministe»
        +string lib
        +portee «entretien | locuteur»
        +bool priv
        +int ordre
        +int vExport «code export .sonal»
        +Modalite[] modalites
    }

    class Modalite {
        +string id «v{n}m{m} — déterministe»
        +string lib
        +int mExport
    }

    class MetaEntretien {
        +Record valeursGen «idVar→idMod, portée entretien»
        +string audioRef
    }

    class Locuteur {
        +Record valeursLoc «idVar→idMod, portée locuteur»
    }

    Variable "1" o-- "*" Modalite : modalités (dépendantes)
    MetaEntretien "*" ..> "1" Variable : valeursGen
    Locuteur "*" ..> "1" Variable : valeursLoc
```

- **Variable** : `portee` = `'entretien'` (valeur dans `meta.valeursGen`) ou `'locuteur'` (valeur
  dans `Locuteur.valeursLoc`). *Plus de sentinelle `l="all"`* : la valeur va chez son propriétaire.
- **Modalité** : entité **dépendante** d'une variable (identité relative, imbriquée).
- **Ids déterministes** : `v{n}` / `v{n}m{m}` (maper `eav.ts`) → deux imports du même fichier
  produisent les mêmes ids → **fusion idempotente** par id.
- **Pose d'une valeur** : `poserValeur` (`corpus/requetes.ts`) édite chez le propriétaire —
  `valeursGen` ou `valeursLoc`, champ `valeursLoc` du `Locuteur`. La portée de la **valeur n'est
  plus un attribut de la donnée**, il est décidé par le **schéma** de la variable.
- La **matrice corpus** (`matriceCorpus`) est une **requête** qui lit les valeurs chez leurs
  propriétaires (table de données) — jamais un cache.

**Code** : `src/shared/corpus/variables.ts` (CRUD), `src/shared/corpus/eav.ts` (mapping legacy),
`src/shared/corpus/requetes.ts` (`poserValeur`, `matriceCorpus`, `compterUsages*`), types dans
`src/shared/format.ts` (`Variable`, `Modalite`, `MetaEntretien`, `Locuteur.valeursLoc`).

## 5. Codebook & requêtes

> **Cadrage.** La préoccupation « définition » du codage : le **codebook** hiérarchique, et ses
> vues **dérivées** (résumé thématique, matrice) qui n'ont plus d'`Extrait` stocké.

```mermaid
classDiagram
    direction LR

    class Categorie {
        +string id
        +string nom
        +string couleur? / int taille?
        +int ordre
        +string parent «null = racine»
        +bool actif
        +string codeExport «cat_XXX»
    }

    Categorie "1" o-- "*" Categorie : parent (hiérarchie auto-référencée)
```

- **L'ordre et la hiérarchie sont des définitions** : `ordre` (fratrie, réordonnable) et `parent`
  (arbre) vivent **explicitement** sur l'entité — *rien n'est dérivable de la forme du stockage*
  (en SonalPi1, l'ordre était un artefact de la position dans `tabThm`).
- **`codeExport` ≠ identité** : l'id est **opaque** (injecté par `genId`, unique par construction —
  sûr en création offline divergente) ; `codeExport` (`cat_XXX`) n'est qu'un attribut de **lisibilité
  à l'export `.sonal`**.
- **Sous-schéma** : une fraction arbitraire de la hiérarchie peut être consultée à plat en
  **pré-ordre** (`ordreThemes`, `corpus/categories.ts`) — sert à l'affichage indenté ET à l'export
  (`rang` = profondeur, reconstruit à l'import par `parentsDepuisRangs`).

**Requêtes (lecture, jamais stockées)** — `corpus/requetes.ts` :
- `compterUsagesCategorie` / `usagesParCategorie` — comptages d'usage (politique « refus si
  utilisé » à la suppression) ;
- `resumeThematique` / `resumesThematiques` — le **résumé thématique** d'un entretien (parité
  SonalPi1 `resumeGraphique`) : les codages projetés sur l'axe du texte, en %, avec bornes jointe
  (`SegmentThematique`). C'est le **successeur de l'`Extrait`** ;
- `matriceCorpus` — voir §4.

**Code** : `src/shared/corpus/categories.ts`, `src/shared/corpus/requetes.ts`, types dans
`src/shared/format.ts` (`Categorie`, `SegmentThematique`).

## 6. Anonymisation

> **Cadrage.** Le patron à 3 étages appliqué à l'anonymisation. **Règle = vérité corpus** ;
> **occurrence = une `Annotation{type:'anon'}`** à l'entretien. La **triple tenue** de SonalPi1
> (DOM ↔ `tabAnon` entretien ↔ `tabAnon` corpus) **a disparu** : le calcul (statuts) est une
> **requête** re-dérivée du texte + des annotations.

```mermaid
classDiagram
    direction LR

    class RegleAnon {
        +string id
        +string[] entite «alias»
        +string[] pseudos «≤2»
    }

    class Annotation {
        <<type:'anon'>>
        +string regle? «→ RegleAnon.id»
        +string pseudo «pseudo appliqué»
        +etat «anonymise | exception»
    }

    class BrouillonAnon {
        +string entite
        +string pseudo?
    }

    RegleAnon "1" o-- "0..*" Annotation : regle (instancie)
    Annotation "1" o-- "0..1" BrouillonAnon : consommé à la validation
```

- **`RegleAnon` (corpus)** : `{entite[], pseudos[]}` — un mappage `entité → pseudo(s)` **partagé**,
  seule vérité « règle ». `entite[]`/`pseudos[]` gardent la forme unidimensionnelle du futur
  multi-alias / multi-pseudo (≤2, `entretien/anon/pseudos.ts`). Pas de `actif` : le brouillon est
  entretien-local, ce n'est pas un drapeau de règle.
- **Couverture d'un match** : les occurrences d'une entité sont détectées insensible à la casse,
  aux **frontières de mot Unicode** (`occurrencesDe`, `entretien/anon/anonymisation.ts`).
  `scannerCorpus` (`corpus/scanAnon.ts`) classe chaque match en 3 états — **requête** :
  `anon` (couvert, pseudo ∈ pseudos de la règle) / `exc` (exception) / `non` (à traiter). Priorité :
  une occurrence dans une **exception n'est jamais « à traiter »**.
- **Application** : poser une `Annotation{type:'anon'}` sur la plage d'un match. En **masse** sur un
  entretien **fermé** (depuis l’onglet Pseudonymisation du corpus) : `instructionsAppliquerRegle`
  (`entretien/anon/applicationMasse.ts`) calcule les occurrences à poser (sans toucher aux déjà
  couvertes), puis le store écrit atomiquement.
- **Brouillons** (`BrouillonAnon`, `entretiens/<id>.json.brouillonsAnon`) : une entité saisie sans
  occurrence posée. **Entretien-local, pas une règle.** Validé → consommé, des `Annotation{type:'anon'}`
  sont posées. (`entretien/anon/brouillonsAnon.ts`, `cleEntite`).
- **États** : seuls *anonymisé* et *exception* sont **stockés** (`Annotation.etat`). Le 3ᵉ état
  (*présent mais non anonymisé* = `non`) n'a **aucune** annotation — détecté seulement en passant la
  règle sur le texte (strict parallèle d'un mot **non codé**) → **compteurs**, jamais stockés.

**Code** : `src/shared/corpus/reglesAnon.ts`, `src/shared/corpus/scanAnon.ts`,
`src/shared/entretien/anon/` (`anonymisation.ts`, `brouillonsAnon.ts`, `pseudos.ts`,
`applicationMasse.ts`, barrel `index.ts`).

## 7. Locuteurs

> **Cadrage.** Le locuteur est **promu en entité** (indexé par entretien) — il possède ses valeurs
> EAV de portée locuteur (`valeursLoc`) et peut référencer une `Personne` du corpus.

```mermaid
classDiagram
    direction LR

    class EntretienFichier

    class Locuteur {
        +int index «identité — les blocs le référence par `loc`»
        +string nom
        +bool interviewer?
        +string pseudo? / pseudoEtat? «pseudonymisation du libellé»
        +string couleur? «palette définie»
        +Record valeursLoc
        +string personneRef «→ Personne, facultatif»
    }

    class Bloc {
        +int loc «→ Locuteur.index (attribut de paragraphe)»
    }

    EntretienFichier "1" o-- "*" Locuteur
    Bloc "*" --> "1" Locuteur : loc (par index)
```

- **L'identité = l'index** : les blocs référencent un locuteur **par `index`** numérique (par
  entretien) — l'exception assumée à l'identité opaque (sous verrou il n'y a qu'un écrivain, et
  c'est ce que le `.sonal` référence). **Renommer = éditer l'entrée** ; les blocs, qui ne portent
  que l'index, ne sont pas touchés (référence, pas copie).
- **`loc` au niveau du bloc, pas de l'annotation** : donner un locuteur à une sous-partie = **scinder
  le bloc** (asymétrie SonalPi1 conservée — aucune fusion physique inverse : deux blocs adjacents de
  même `loc` restent deux paragraphes, rendus groupés).
- **Pseudo du libellé** : `pseudo` (pseudonyme du nom) + `pseudoEtat` (`'confirme' | 'refuse'`) —
  décisions **persistées** ; la **suggestion** (nom matchant une règle corpus) est une **requête**
  de l'étape 3, jamais stockée. Rendu par dérivation pure `libelleGouttiere`
  (`entretien/locuteurs.ts`). Ordre des cas : un **refus explicite prime** sur le pseudo.
  L'interface ne propose plus la bascule confirmer/refuser : poser un pseudo pseudonymise
  directement les étiquettes. Le champ `pseudoEtat` survit pour la **parité fichiers SonalPi1** :
  un refus importé d'un `.sonal` reste honoré au rendu, mais il n'est plus saisissable ici.
- **Couleur** : choisie (palette définie `PALETTE_PASTILLES_LOCUTEURS`) ou **auto par index** ;
  stable car l'index est l'identité.
- **`personneRef`** : pointe vers une `Personne` du corpus, ou vaut `null`. Dans un corpus distant, les liaisons simples passent par un verrou corpus court, puis par la session déjà ouverte ou par un verrou court avec GET frais et PUT conditionnel de l’entretien.
- **Rapprochements** : les suggestions sont recalculées et ne sont jamais stockées. Elles couvrent les noms normalisés identiques, les rôles équivalents et deux variantes proches strictes : une lettre différente avec un mot commun, ou les mêmes mots dans un ordre différent. Les variantes proches exigent plusieurs mots afin qu’un prénom ou un nom seul ne suffise pas. En distant, la cible et sa source sont verrouillées et relues dans l’ordre de leurs ids. Un refus simple publie uniquement la cible ; un rapprochement ou un refus créant une définition publie celle-ci avant les associations et conserve les réussites en cas d’échec ultérieur.
- **`personneDeliee`** : marqueur optionnel de déliaison volontaire, conservé dans l’entretien. Empêche la recréation automatique au nommage, y compris après un refus ; une liaison explicite le retire. Son absence conserve le comportement des anciens fichiers.

**Code** : `src/shared/entretien/locuteurs.ts`, type `Locuteur` dans `src/shared/format.ts`.

## 8. Journal d'actions (undo/redo)

> **Cadrage.** *Nouveau* par rapport au doc initial (SonalPi1 n'avait pas ce patron). Seules les
> actions de **modèle** y entrent (codages, locuteurs, valeurs) — la frappe de texte reste sur
> Ctrl+Z. Les Journaux sont **volatils** et ne proposent pas de rétablissement : le Journal
> d’entretien est vidé à son ouverture, tandis que celui du corpus est vidé lors d’une bascule
> de corpus ou au redémarrage.

```mermaid
classDiagram
    direction LR

    class Journal {
        +EntreeJournal[] entrees «la + récente en tête, cap 10»
    }

    class EntreeJournal {
        +string id
        +string horodatage
        +string libelle
        +Inverse inverse «donnée typée, jamais une closure»
    }

    Journal "1" o-- "*" EntreeJournal
```

- **L'inverse est une DONNÉE typée** (union `Inverse` : retirer/reposer une annotation, restaurer
  des `loc` de blocs, renommer un locuteur, poser/effacer une valeur gen/loc) — jamais une closure :
  on peut la tester headless, vérifier son applicabilité et la **remapper** comme le modèle.
- **Pendant journal du remap** : `editor/journalRemap.ts` remappe les positions portées par les
  inverses (annotation retirée à re-poser, positions de blocs à restaurer) en même temps que le
  modèle. « Cible disparue → grisé » en découle : `estApplicable` refus `false` sans toucher à rien.
- **Cap** : `CAP_JOURNAL = 10` entrées affichées.
- **Journal du corpus** : ses inverses ciblés vivent dans le main, qui relit les fichiers et
  vérifie l’état produit par l’action avant d’écrire. Le premier raccordement couvre les commandes
  simples du répertoire Personnes. Les rapprochements composites, réunions, séparations,
  réussites partielles et opérations distantes ne créent pas d’entrée.
- **Hors périmètre (assumé)** : ajouter un locuteur (pas de suppression modélisée), supprimer un
  thème (acte destructif **non réversible** → pas d'entrée).

**Code** : `src/shared/entretien/journal.ts`, `src/renderer/editor/journalRemap.ts`,
`src/shared/corpus/journal.ts`, `src/main/journalCorpus.ts`.

## 9. Persistance & stockage

> **Cadrage.** La préoccupation **technique** : *où* et *comment* les fichiers sont lus/écrits.
> Volontairement **hors du domaine** pur (`shared/` ne fait aucune I/O) — c'est le rôle du
> **main process**.

```mermaid
classDiagram
    direction LR

    class format "contrat" {
        <<corpus.json / entretiens/<id>.json>>
        +int formatVersion «FORMAT_VERSION = 3»
        +versionSupportee(v)
    }

    class CorpusStore {
        <<main process>>
        +écriture atomique write-tmp-rename + .bak
        +relit et vérifie formatVersion
    }

    class Preload {
        <<pont IPC typé — le renderer ne touche jamais au disque>>
    }

    CorpusStore ..> format : sérialise / relit
    Preload ..> CorpusStore : IPC
```

- **Deux fichiers** : `corpus.json` (agrégat Corpus : définitions + membership) et
  `entretiens/<id>.json` (agrégat Entretien : texte + annotations + ancres + locuteurs + meta).
  Le **contrat de format** (types + `FORMAT_VERSION = 3`) est centralisé dans `src/shared/format.ts`,
  **partagé main ⇄ renderer**.
- **Versionnage** : toute évolution de structure = **bump de `FORMAT_VERSION` + migration
  explicite** ; une version inconnue est **refusée poliment**, jamais lue partiellement
  (`versionSupportee`). Les champs **additifs optionnels** (ex. `meta.sourceV1`, `brouillonsAnon`,
  `pseudo`, `couleur`, `demo`) ne bumpent pas.
- **Écriture** : `_corpusStore` (main) écrit **atomiquement** (write-tmp-rename + `.bak`), relit et
  vérifie la version. Le renderer passe par le pont IPC du **preload** — jamais accès direct au disque.
- **`legacy`** : blocs `.sonal` non modélisés (règles d'anon, notes), transportés tels quels pour un
  export **sans perte**.

**Code** : `src/shared/format.ts`, `src/main/corpusStore.ts`, `src/preload/index.ts`.

---

# Niveau 3 — Notes en prose

## 10. Notes d'entretien

> **Cadrage.** Les notes vivent HORS du texte : contrairement aux annotations (§3), elles ne
> portent aucune position ProseMirror. Une note est un court document autonome rattaché à une
> catégorie définie au CORPUS (même logique que le codebook : définitions partagées, usages
> dans les entretiens).

```mermaid
classDiagram
    class Note {
        +string id
        +string categorieId «→ NoteCategory.id (corpus)»
        +string titre? «affiché seul en vue cartes»
        +string corps «HTML sanitisé : texte échappé + <mark>/<em>»
        +string[] locuteurIds «cibles facultatives dans l'entretien»
        +number rang «ordre manuel, défaut = max + 1»
        +string? date
    }
    NoteCategory "1" o-- "*" Note : categorieId
```

- **Le corps est stocké en HTML sanitisé** — c'est LE contrat du format (`format.ts`) : texte
  échappé, seules `<mark>` (passage important, gras) et `<em>` (lié à un commentaire, italique)
  survivent, avec leurs attributs de liaison aux commentaires. Tout le reste de la frappe ou du
  collage est aplati en texte : on ne perd jamais le contenu, jamais le formatage parasite.
- **L'hygiène HTML est un module renderer** (`renderer/notes/sanitiser.ts`), pas du domaine pur :
  il parse le HTML via le DOM et nettoie des conteneurs VIVANTS (contenteditable en cours de
  frappe). C'est l'exemple type du fragment qui n'est ni modèle pur (`shared/`), ni composant —
  voir [architecture.md](architecture.md), « Où placer un module dans le renderer ? ».
- **Les références de commentaire ne sont jamais persistées** : les spans `[auteur : début…]`
  affichés sont reconstruits à l'affichage depuis les liens (`data-liens`) et jetés à la
  sauvegarde.
- **Cibles facultatives** : `locuteurIds` associe une note à zéro, un ou plusieurs locuteurs du
  même entretien. La note reste propriétaire de son contenu ; une personne agrège les notes de
  ses locuteurs sans les copier. Supprimer un locuteur retire ses références des notes.
- **Ordre = `rang` manuel** (« après la dernière » = max + 1), réordonnancement manuel.
- **Catégories au corpus** : CRUD + comptages d'usage (politique « refus si utilisée ») dans
  `shared/corpus/categories.ts` (§5).

**Code** : `src/shared/entretien/notes.ts` (modèle pur), `src/renderer/notes/sanitiser.ts`
(hygiène HTML), types `Note` / `NoteCategory` dans `src/shared/format.ts`.

## 11. Notes de cadrage

- **Asymétrie Catégorie ↔ Locuteur** (§5 vs §7) : la **catégorie** descend au **texte** (par
  positions, un codage peut enjamber des blocs) ; le **locuteur** reste au **bloc** — lui *crée* une
  frontière de bloc quand on l'affecte à une sous-partie.
- **Conséquence assumée — l'attribution au locuteur devient une requête.** Un codage transverse
  n'« appartient » pas à un locuteur : « ce codage relève de quel(s) locuteur(s) ? » = calculé
  (jamais stocké). Important pour les stats par locuteur.
- **`Personne` (corpus).** `personnes: Record<string, Personne>` contient une identité opaque
  et un nom de référence. Les noms ne sont pas uniques. Les liens sont portés uniquement par les
  `personneRef` des locuteurs ; aucune valeur EAV ni note ne migre sur la personne.
  L’inventaire main complète les anciens ids de locuteurs en mémoire, expose les fichiers
  indisponibles et ne transmet pas les transcriptions. Les commandes locales créent, lient,
  délient, déplacent et modifient les fiches. Une création écrit la définition avant le lien ;
  un échec de la seconde écriture conserve une fiche vide et produit une erreur explicite.
  La suppression exige une fiche vide et un inventaire complet. Les anciens corpus reçoivent
  `personnes: {}` en mémoire, sans migration de version ni écriture lors de la consultation.
  Les suggestions exactes et les refus révocables sont disponibles dans le répertoire.
  La commande `fusionner` vérifie que l’inventaire correspond encore à l’aperçu confirmé,
  exige un inventaire complet et refuse les doublons de locuteurs dans un même entretien.
  Elle conserve un id et son nom, réaffecte tous les liens, redirige les refus visant la fiche
  absorbée et retire les refus internes au groupe. La commande `separer` crée une nouvelle
  définition et y déplace les liens choisis, tout en exigeant qu’un locuteur reste sur la fiche
  d’origine. Les notes liées restent dans leurs entretiens et suivent leur locuteur par agrégation.
  `TransactionsFichiersCorpus` journalise les états avant/après des entretiens modifiés. Une
  fusion remplace les liens avant de retirer la définition absorbée ; une séparation crée la
  définition avant de remplacer les liens. La reprise accepte les états avant ou après connus,
  jamais un état extérieur divergent. Une reprise de données optionnelle
  fait partie du même journal ; elle ne concerne que le locuteur cible explicitement affiché.
  En distant, le renommage de définition est transactionnel et les associations simples utilisent
  `TransactionsCorpus.executerEntretien`. Les corrections avec source stabilisent les définitions
  et tous les entretiens concernés. Créations, refus composites et séparations publient la nouvelle
  définition avant les liens. Une réunion publie les liens avant de retirer la définition absorbée,
  de sorte qu’un échec conserve les deux définitions et puisse être repris. Une suppression verrouille
  et relit tous les entretiens avant de confirmer que la fiche est vide. Toute réussite partielle est
  conservée et remontée nominativement au renderer.
- **Découplée de l'anonymisation.** `Personne` ne référence pas `RegleAnon` : le cas
  « deux graphies → un pseudo » est couvert par les **alias** `entite[]` (§6), système généraliste
  pour personnes comme lieux/organisations. `Personne` est une identité transverse de locuteur,
  jamais exportée dans le format historique `.sonal`.
- **Non implémenté dans SonalPi2** : le **Recueil** (§6 de l'ancien doc — collecte d'`ItemRecueil`),
  le **Storage multi-backend** (factory Local/Serveur/GitLab/Nextcloud : SonalPi2 ne persiste qu'en local,
  cf. §9).
- **Frontière `shared/` pure** : tout ce qui est modélisé ici vit sous `src/shared/` comme
  fonctions **pures**. Un test **garde-fou** — « discipline d'architecture » dans `test/remap.test.ts`
  — vérifie mécaniquement que `src/shared/entretien/` n'importe jamais le DOM/ProseMirror.

## 12. Carte code ↔ modèle

Le domaine a **deux agrégats** et la structure du code les reflète directement — un dossier par
agrégat, un fichier par concept :

| Agrégat | Contenu | Code |
|---|---|---|
| **Corpus** | définitions (codebook, variables EAV, règles) + membership | `src/shared/corpus/` |
| **Entretien** | applications (annotations, locuteurs, valeurs, ancres) | `src/shared/entretien/` |

```
src/shared/
  format.ts               le contrat du format natif (types), versionné (FORMAT_VERSION)
  corpus/                 ── agrégat Corpus ──
    index.ts                surface publique (barrel) + carte des sections
    categories.ts           codebook : CRUD des thèmes + hiérarchie      (§5)
    variables.ts            base de données EAV : variables & modalités  (§4)
    requetes.ts             inventaires = requêtes (usages, matrice, poserValeur, résumé) (§4, §5)
    eav.ts                  mapping EAV legacy `.sonal`/`.crp`           (§4)
    reglesAnon.ts           règles d'anonymisation corpus                (§6)
    scanAnon.ts             scan des statuts d'anonymisation (requête)   (§6)
    import.ts               sas d'import .sonal (fusion idempotente par id)
    migrationCrp.ts         sas de migration du .crp SonalPi1
  entretien/              ── agrégat Entretien ──
    index.ts                surface publique (barrel) + carte des sections
    positions.ts            positions ProseMirror + tranches (texte plat) (§2)
    annotation.ts           le concept unificateur Annotation            (§3)
    audio.ts                ancres temporelles {pos, t}                  (§2)
    entretien.ts            commandes d'annotation (coder/retirer)       (§3)
    journal.ts              journal d'actions annulables                 (§8)
    locuteurs.ts            locuteurs (dont pseudo/pseudoEtat/couleur)   (§7)
    notes.ts                notes d'entretien (catégories, rangs)         (§10)
    migration.ts            migration formatVersion 1→2 des entretiens
    anon/                   ── domaine anonymisation ──                  (§6)
      anonymisation.ts        moteur (texte plat, plages)
      applicationMasse.ts     application en masse (entretien fermé)
      brouillonsAnon.ts       brouillons d'anonymisation
      pseudos.ts              multi-pseudo ≤2, affichage
```

> Le stockage (le disque) est **séparé** du domaine : `shared/` contient les fonctions métier
> pures, `main/corpusStore.ts` leur I/O — le pendant logiciel de « le modèle vs sa persistance »
> (voir [architecture.md](architecture.md) et [donnees.md](donnees.md)).
