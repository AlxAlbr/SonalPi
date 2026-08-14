# SonalAsynchro

Réécriture du cœur de **SonalPi** pour essayer de simplifier le fonctionnement et le code.
A l'origine, SonalPi fonctionne en multi-utilisateur de manière asynchrone, pourquoi avoir précisé alors "SonalAsynchro" ? 
Par opposition ici  à la construction et au test aussi d'une version synchro (cf SonalSynchroYjs)

## Partie 1 : Les données 

### I) Différentes natures des données

Deux niveaux bien différenciés : Corpus / Entretien
Deux états  : ce qui est stocké / ce qui est reconstruit, recalculé


| Nature | Exemple | Plan technique | Stockée ? |
|---|---|---|---|
| **Définition** (existe avant tout usage) | `Categorie`, `RegleAnon`, `Variable`/`Modalite` | `corpus.json` | oui (primaire) |
| **Application** (décision portée par un entretien) | codage, masquage, métadonnée (données d'une variable), commentaire | `entretiens/<id>.json` | oui (primaire) |
| **Requête** (agrégation dérivable) | `Extrait`, matrice EAV, passage « à anonymiser »| — | non — **calculée** |


L'objectif, c'est d'éviter la redondance des informations qui existe malheureusement dans la version actuelle de SonalPi


### II) Différentes représentations des données et intéractions


Il faut distinguer plusieurs représentations des mêmes données dans l'application:

| Représentation | Rôle | Statut |
|---|---|---|
| Objets en mémoire (`Entretien`, `Corpus`) dans le processus renderer d'Electron | les données vivantes | **considéré comme la vérité en cas de conflit** |
| Le DOM / l'éditeur  WYSIWYG Tiptap: https://tiptap.dev/ | ce que voit l'utilisateur | une projection, recalculée *depuis* le modèle (décorations, gouttière des locuteurs) |
| `entretiens/<id>.json` | la persistance | de l'I/O : écrit *depuis* le modèle, relu *vers* le modèle |

Pour entrer plus en détail dans les intéractions, lire les sous-sections suivantes : sinon passer à la partie Le modèle d'objet

#### 1) DOM ↔ objet en mémoire 

##### a) Montée (DOM → modèle)

Quand vous tapez, TipTap produit une transaction ProseMirror : le doc ProseMirror (corpsTexte dans EntretienFichier de format.ts ) est un arbre de nœuds : doc → bloc → text. Par exemple, si vous tapez « a », ProseMirror ne modifie rien en place. Il construit une transaction (Transaction, tr en abrégé) qui contient :
- les steps (étapes) : ici un ReplaceStep = « insère "a" à la position 42 »
- le nouvel état du document (un nouvel arbre, l'ancien reste intact)
- tr.mapping : la carte des positions — « l'ancienne position 50 est devenue 51 »

Le plugin maison — remap.ts — qui observe tr.mapping et met à jour les positions du modèle (bornes from/to des annotations, pos des ancres temporelles)

#### b) Descente (modèle → DOM)

TipTap ne sait pas ce qu'est une annotation. Ce sont les décorations — decorations.ts — qui projettent le modèle dans le rendu : surlignages, gouttière des locuteurs, plage en cours de lecture audio. Le DOM est recalculé depuis le modèle, jamais l'inverse.


### 2) Objet mémoire ↔ fichier

C'est le domaine du main process : corpusStore.ts sérialise Entretien vers entretiens/<id>.json (écriture atomique write-tmp-rename + .bak), le relit et vérifie formatVersion. Le renderer passe par le pont IPC du preload.


### 3) Commandes métier

Coder un passage, renommer un locuteur, saisir une valeur EAV : ce sont des fonctions pures de src/shared/ (entretien.ts, locuteurs.ts, requetes.ts…), sans DOM ni I/O — c'est le garde-fou testé par remap.test.ts:170. Le composable useEntretien.ts orchestre : commande de domaine → mise à jour du modèle → sauvegarde via IPC → le rendu suit.


Pour résumer, TipTap est le moteur du passage DOM ↔ doc ProseMirror (arbre de nœuds immutable doc → bloc → text, champ corpsTexte du modèle), rien de plus. L'originalité de l'architecture — et ce qui rend le modèle testable headless — c'est que tout le reste (remap, décorations, commandes, persistance) est du code applicatif délibérément hors de l'éditeur.
- Ce que TipTap ne sait pas faire (et ne fait pas) :
savoir qu'une plage du texte est codée avec le thème « entretien/qualité » → c'est le calque annotations du modèle + les décorations
- mettre à jour les positions des annotations quand le texte bouge → c'est remap.ts qui lit tr.mapping
- sauvegarder quoi que ce soit sur disque → c'est le main process via IPC

 Le doc ProseMirror n'est qu'une partie du modèle — à côté vivent annotations[], locuteurs[], ancres[] (pour la synchronisation audio ↔ texte.), que TipTap ne connaît pas. 



## Partie 2 : Le modèle d'objet réduit


> **Par rapport à SonalPi.** (a) Le `Corpus` ne *contient* pas les entretiens : il en garde des
> **références légères** (`EntretienRef`) ; le contenu vit dans des fichiers séparés. (b) Les
> trois overlays inline de SonalPi (codage / anonymisation / commentaire, portés par des
> fragments HTML) **fusionnent** en un seul concept : **`Annotation`** . (c) Les tables
> dupliquées local↔corpus (`tabDat`, `tabAnon`) **disparaissent** : une seule vérité par donnée
> + des requêtes (§5, §6).



Le domaine a **deux agrégats** : Corpus et Entretein
Un agrégat conceptuel ≠ un fichier physique :
  - Corpus (concept) = corpus.json + N fichiers entretien + requêtes
  - Entretien (concept) = entretiens/<id>.json, seul  MAIS dépendant du corpus pour interpréter ses références (cat_005, etc.)


```mermaid
classDiagram
    direction LR

    class Corpus {
        <<agrégat — définitions + membership>>
        +Categorie[] codebook        «définition»
        +RegleAnon[] reglesAnon       «définition (instruction)»
        +Variable[] variables         «définition (schéma EAV) — possède ses Modalite»
        +EntretienRef[] membership    «liste + métadonnées légères»
    }

    class EntretienRef {
        +string id
        +string titre
        +date date
        +string statut
        «PAS le contenu — juste de quoi lister/ouvrir»
    }

    class Categorie {
        +string id                    «opaque — déterministe à l'import»
        +string nom                   «libellé affiché»
        +string couleur?              «optionnel»
        +int ordre                    «ordre d'affichage (définition, pas dérivé)»
        +string parent                «id du parent, null = racine — hiérarchie»
        +bool actif
        +string codeExport            «cat_XXX — attribut d'export .sonal, pas l'identité»
    }

    class Entretien {
        <<agrégat — applications, 1 fichier dédié>>
        +Document corpsTexte          «doc ProseMirror (JSON)»
        +Annotation[] annotations     «codage | anon | commentaire»
        +Ancre[] ancres               «points de mesure temporels {pos, t}»
        +Map valeursGen               «idVar→idMod — variables de portée entretien»
        +Locuteur[] locuteurs         «possèdent leurs valeursLoc»
        +audioRef
    }

    class Locuteur {
        +int index                    «identifiant par entretien (référencé par blocs)»
        +string nom                   «nom affiché»
        +bool interviewer?            «optionnel : ses tours en italique»
        +Map valeursLoc               «idVar→idMod — variables de portée locuteur»
        +string personneRef           «→ Personne.id, optionnel»
    }

    class Bloc {
        +int loc        «-> Locuteur.index (attribut de paragraphe)»
    }

    class Annotation {
        <<concept unificateur — étage 2>>
        +string id
        +string type    «codage | anon | commentaire»
        +number from    «position ProseMirror, remappée aux éditions»
        +number to      «position ProseMirror, remappée aux éditions»
        +string auteur
        +string code    «codage → ref Categorie.id»
        +string regle   «anon → ref RegleAnon.id (pseudo lu depuis la règle)»
        +string etat    «anon → anonymise | exception»
        +string texte   «commentaire → contenu autonome»
    }


    Corpus "1" o-- "*" EntretienRef : membership
    Corpus "1" o-- "*" Categorie : codebook (définition)
    Corpus "1" o-- "*" RegleAnon : règles globales (définition)
    Corpus "1" o-- "*" Variable : schéma EAV (définition)
    Variable "1" o-- "*" Modalite : valeurs possibles (entité dépendante)
    Corpus "1" o-- "*" Personne : registre (optionnel)
    Categorie "1" o-- "*" Categorie : parent (hiérarchie auto-référencée)
    EntretienRef "1" ..> "1" Entretien : référence (fichier distinct)
    Entretien "1" *-- "1" Document : doc ProseMirror
    Entretien "1" *-- "*" Ancre
    Entretien "1" o-- "*" Annotation
    Entretien "1" o-- "*" Locuteur : possèdent leurs valeursLoc
    Locuteur "*" ..> "0..1" Personne : est (par personneRef)
    Bloc "*" --> "1" Locuteur : loc
    Annotation "*" ..> "0..1" Categorie : code (codage, par id)
    Annotation "*" ..> "0..1" RegleAnon : règle (anon, par id)

```


### Cxplications sur des différences SonalPi / SonalAsyncro 

#### Sur les Catégories

L'ordre des variables et la hiérarchie du codebook ne sont dérivables de rien : ils vivent explicitement sur l'entité — champ ordre et champ parent pour la hiérarchie du codebook. Dans SonalPi, l'ordre était un artefact de la position dans tabThm — une vérité logée dans la forme du
stockage.


#### Le bloc

- **Token** *(atome — sans objet propre)* : la plus petite unité (un caractère, une ponctuation, un
  espace). on a repris le choix de SonalPi d'une **granularité du snap-to-mot** (une sélection est étendue aux frontières de mot) mais pourrait facilement être une option avec l'architecture actuel. 
- **Bloc** : le texte vit dans des **paragraphes** du document ProseMirror, **édités librement**(WYSIWYG) — on n'importe **pas** la rigidité « une ligne par *cue* SRT ». Ce qui subsiste du « segment » : le **locuteur** (`loc`,  attribut de bloc éditable ; tour de parole = dérivé) et le **timing**, porté non par le bloc  mais par les **ancres temporelles** `{pos, t}` du modèle. 

> **Les niveaux imbriqués de SonalPi s'effondrent en WYSIWYG.** Le segment vient de la
> **retranscription assistée (SRT / sortie IA)** : une **unité horodatée** (`deb`/`fin`), fine.
> Les niveaux de SonalPi — `ligloc` (bloc locuteur), `lblseg sautlig` (une ligne par *cue*),
> fragments — étaient des **artefacts du pipeline de transcription + d'un rendu non-éditable**,
> pas des nécessités du domaine. En WYSIWYG, ils s'effondrent :
> - **tour de parole** (`ligloc`) → **dérivé** (run de blocs consécutifs de même `loc`), non
>   stocké. À l'**import**, les cues consécutifs d'un même locuteur non nul fusionnent en un
>   paragraphe (le tour), leurs frontières survivant en ancres internes ; aucun geste
>   d'**édition** ne fusionne ;
> - **`lblseg sautlig`** (une ligne par cue) → **pas une contrainte** : la structure de
>   paragraphes est authored par l'utilisateur ; la segmentation SRT n'est que la mise en page
>   initiale d'import.
>

-  Ici, **le marquage ne coupe plus le texte** (calque de décorations) : la plage de tokens **taillée par le marquage** (un changement de codage/anon/commentaire qui coupait le span n'a plus d'existence stockée. Il  survit au mieux comme notion **dérivée de rendu** (une suite de texte couverte par un même jeu de décorations) — jamais persistée.
- **`Locuteur`** *(promu en entité)* : indexé **par entretien**. Il **possède ses valeurs EAV de
  portée locuteur** (`valeursLoc: idVar→idMod`, cf. §5) et peut **référencer (`0..1`) une
  `Personne` du corpus** (identité stable, cf. note). Le `loc` est au **niveau du bloc**, pas de
  l'annotation : donner un locuteur à une sous-partie = **scinder le bloc** (asymétrie SonalPi
  conservée — aucune fusion physique inverse : deux blocs adjacents de même `loc` restent deux
  paragraphes, rendus groupés).


> **Invariant — un codage peut enjamber plusieurs blocs/locuteurs.** Les positions `from`/`to`
> vivent dans l'espace de positions linéaire du document ProseMirror, qui traverse les nœuds :
> une `Annotation` peut couvrir un passage à cheval sur plusieurs tours de parole, **en une
> seule entité** (rendu par une décoration qui surligne le texte des deux côtés de la
> frontière). C'est plus simple que SonalPi, qui devait coder « en deux temps » (un fragment par
> segment) puis **re-fusionner à la lecture**.
>
> **Conséquence assumée — l'attribution au locuteur devient une requête.** Un codage transverse
> n'« appartient » pas à un locuteur : « ce codage relève de quel(s) locuteur(s) ? » = calculé (jamais stocké). Important pour les stats par locuteur


### Reflexion sur une categorie pas encore implémentée...

 Pas encore implémenté; c'est plus pour garder trace de mes réflecions sur le sujet

> **`Personne` (corpus) — identité stable d'un locuteur à travers le corpus.** Un même humain
> (l'**interviewer**, souvent le même chercheur sur N entretiens ; un **interviewé** récurrent en
> longitudinal) peut apparaître comme `Locuteur` dans plusieurs entretiens. On introduit une entité
> **`Personne` au niveau corpus** ; le `Locuteur` (par entretien) la **référence** (`0..1`, **optionnel** —
> un locuteur non identifié reste valide). **Répartition des attributs** (règle « daté = entretien ») : âge à
> la date, `valeursLoc`, rôle dans *cet* entretien → restent sur le **`Locuteur`** ; `Personne` ne porte que
> l'**identité**. Les « attributs stables d'une personne » se lisent par **requête** sur ses apparitions
> (conflits éventuels = signal qualité), plutôt que stockés deux fois.
>
> **Découplée de l'anonymisation (décidé).** `Personne` ne référence **pas** `RegleAnon`. Le cas « deux
> graphies → un pseudo » est déjà couvert par les **alias slash** de `RegleAnon.entite` (`["Jean Martin",
> "Jean-Martin"] → X`), système généraliste valable pour personnes *comme* lieux/organisations. `Personne`
> reste donc une pure **identité de locuteur** ; sa justification est désormais l'**interopérabilité**
> (export CAQDAS → `Case`, cf. §14) et l'identité **trans-entretien** (longitudinal).


### Le modèle objet dans le code


Le domaine a **deux agrégats**  et la structure du code les reflète directement — un dossier par agrégat, un fichier par concept du doc, chacun étiqueté par sa section :

| Agrégat | Contenu | Code |
|---|---|---|
| **Corpus** | définitions (codebook, variables EAV) + membership | [`src/shared/corpus/`](src/shared/corpus/) |
| **Entretien** | applications (annotations, locuteurs, valeurs) | [`src/shared/entretien/`](src/shared/entretien/) |

```
src/shared/
  format.ts              le contrat du format natif (types), versionné (FORMAT_VERSION)
  corpus/                ── agrégat Corpus ──
    index.ts             surface publique (barrel) + carte des sections
    categories.ts        codebook : CRUD des thèmes + hiérarchie
    variables.ts         base de données EAV : variables & modalités
    requetes.ts         inventaires = requêtes (usages, matrice, poserValeur)
    import.ts           sas d'import .sonal (fusion idempotente par id)
  entretien/             ── agrégat Entretien ──
    entretien.ts         commandes d'annotation (poser/retirer un codage)
    annotation.ts       le concept unificateur Annotation + requêtes (orphelines)
    locuteurs.ts        locuteurs par entretien (référence par index)
```

Tout ce qui est sous `shared/` est **pur** : aucune I/O, aucun DOM, aucun accès electron — donc
testable en headless (un test garde-fou vérifie mécaniquement que `entretien/` n'importe jamais le
DOM/ProseMirror).


## Structure générale

```
src/
  main/          process Electron : store fichiers (écriture atomique + .bak), IPC, dialogs
  preload/       pont IPC typé (le renderer ne touche jamais au disque)
  renderer/      app Vue 3
    editor/      TipTap/ProseMirror : schéma, remap des positions, décorations, gouttière, snap
    import/      sas .sonal / .srt / .vtt (convertisseurs SonalPi vendorés) + export
    composables/ orchestration UI (useCorpus, useEntretien, useProfil, sonal)
    components/   Accueil, Corpus, Entretien, TableDonnees
  shared/        le modèle objet pur (voir ci-dessus) — chargé par main ET renderer
```

`shared/` est la frontière **technique** (code commun aux deux process Electron) ; `corpus/` et
`entretien/` sont les frontières **du domaine**. Ne pas confondre les deux découpages.

## Démarrer

```bash
npm install
npm run dev          # app en développement (electron-vite)
npm run build        # build main + preload + renderer
npm run start        # prévisualiser le build

npm test             # tests unitaires (vitest, headless)
npm run test:e2e     # e2e Playwright + Electron (build puis lance ; tourne sous WSLg)
npm run typecheck    # vue-tsc + tsc
```

**Pile** : Electron + Vue 3 + TipTap/ProseMirror (sans Yjs), electron-vite, vitest, Playwright.




