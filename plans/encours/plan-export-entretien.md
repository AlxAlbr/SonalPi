# Plan — Export d'entretien « générique » (fenêtre multi-formats à la V1)

> Statut : implémenté (phase 1, 2 et 3 : modale, formats texte, HTML autonome,
> DOCX/PDF). Reste à trancher côté utilisateur : aligner les tests e2e sur les
> boutons retirés de la barre d'actions par le travail en cours (hors périmètre).
> Référence UX : la fenêtre d'export de SonalPi V1 (`edition_entretien.html`,
> `modules/gestion_entretiens.js`), jugée très bonne et à reprendre quasi telle quelle.

## 1. Objectif

Remplacer le bouton unique « Exporter .sonal » de la barre d'actions de
`Entretien.vue` par un bouton **« Exporter »** qui ouvre une fenêtre en deux
étapes, copie de la V1 :

1. **Étape 1 — format** : liste de formats (.sonal, .txt, .srt, .vtt, .html,
   .docx, .pdf) présentés en lignes cliquables « extension + description » ;
2. **Étape 2 — options** : cases à cocher « quels éléments intégrer »
   (en-tête, notes, variables, coordonnées temporelles, locuteurs,
   catégories thématiques, pseudonymisation), configurées par format,
   puis boutons « ← Retour » / « Exporter ».

Le `.sonal` redevient simplement UN des formats proposés (l'implémentation
actuelle, `exporter()` dans `useOperationsCorpus.ts`, est conservée telle quelle
derrière ce choix).

Décisions actées (avec l'utilisateur) :

- **Notes privées jamais exportées** : les notes `statut: 'prive'` sont
  filtrées dans TOUS les formats, sans option dédiée ;
- **PDF via `printToPDF`** (pas pdfkit) : le HTML autonome de la phase 2 sert
  de source, imprimé en PDF — rendu identique à l'export HTML, zéro nouvelle
  lib ; pdfkit reste un replan seulement si la pagination pose problème ;
- **Player audio masqué en corpus distant** : le HTML n'embarque l'audio que
  si un fichier local référencé existe ;
- **Bouton « Exporter »** à la place de « Exporter .sonal », même position
  (droite de la barre d'actions), ouverture de la modale ;
- **`.sonal` : pseudonymisation proposée mais NON cochée par défaut** — la copie
  d'archivage ne doit pas transformer les données par surprise (la V1 la
  cochait ; écart assumé, validé par les e2e round-trip).

## 2. Ce que fait la V1 (source d'inspiration, à lire avant de coder)

| Élément V1 | Où | À reprendre |
| --- | --- | --- |
| Fenêtre « dlg » à 2 panneaux glissants (slider CSS `translateX`) | `edition_entretien.html:2428` (case `'Export'` de `dialog()`) | Structure : panneau 1 formats, panneau 2 options, glissement animé, bouton Retour |
| Matrice d'options par format `[activé, cochéParDéfaut]` | `edition_entretien.html:2822` (`dialogExportChoixOptions`, constante `CFG`) | La matrice elle-même (adaptée aux possibilités V2) |
| Libellés d'options (notes, variables, temps, locuteurs, thèmes, anonymisation, en-tête) | id. | Libellés, ordre, séparateurs `<hr>` |
| Dispatch par format | `gestion_entretiens.js:2039` (`exportEntretien`) | Le switch + suffixe `_anonymise` + nommage `titre_date.ext` |
| TXT (`construireTxtEntretien`) | `gestion_entretiens.js:2558` | Gabarit : en-tête, notes, variables, puis texte avec `[time]`/locuteur/`[thème]` |
| SRT / VTT (segments `.lblseg` → cues) | `gestion_entretiens.js:2039` cases `srt`/`vtt` | Un cue par segment borné par des ancres ; `<v Locuteur>` en VTT, classe `cat_*` en `<c.…>` |
| HTML autonome (player audio, CSS thèmes, légende, sections) | `gestion_entretiens.js:2648` | Le principe d'une page autonome ; voir §5 pour le périmètre V2 |
| DOCX/PDF via IPC main (libs `docx` et `pdfkit`) | `main.js:3608` (`construireDocxBuffer`), `main.js:3755` | Principe (buffer construit au main) ; réécriture TS, pas de port du code |

Ce qu'on ne reprend PAS : le HTML injecté par chaînes de caractères dans
`innerHTML`, les appels globaux `onclick`, l'état global `tabEnt/ent_cur`.

## 3. Architecture cible (V2)

### 3.1 Composants

- **`ModaleExportEntretien.vue`** (nouveau, `src/renderer/components/entretien/`)
  : modale Teleport-to-body sur le modèle des modales existantes
  (`RecueilsModale.vue` : fond, `role="dialog"`, Échap pour fermer).
  Contient le slider à deux panneaux. Reçoit en prop la liste des formats
  et la matrice d'options ; émet `exporter({ format, options })`.
- **`Entretien.vue`** : le bouton devient `Exporter` et ouvre la modale
  (état local `exportOuvert`, ou via le contexte `utiliserSonal()` si d'autres
  vues doivent y accéder — pas nécessaire aujourd'hui).

### 3.2 Logique d'export

- **`src/renderer/composables/entretien/useExportEntretien.ts`** (nouveau) :
  - `ouvrirEntreeExport()` : assemble une `EntreeExport` (même chose que
    `exporter()` de `useOperationsCorpus.ts` fait déjà : `sauver()` puis
    `donneesExport()` + codebook/variables/règles corpus) ;
  - `exporter(format, options)` : délègue au générateur, puis appelle
    `window.sonal.dialog.choisirExport(nomFichier, contenu)`.
- **`src/renderer/import/exportFormats.ts`** (nouveau, à côté de
  `exportSonal.ts`) : générateurs purs `entreeExport + options → string`
  pour txt/srt/vtt/html. Testables unitairement (vitest, dossier `test/`).

### 3.3 Source de vérité des segments : réutiliser `exporterSonal()`

Point clé de conception. La V1 parsait son `compactHtml()` (DOM live) pour
txt/srt/vtt/html. En V2, l'équivalent existe déjà et est testé :
**`exporterSonal()`** produit le fragment HTML segmenté (spans `.lblseg` avec
`data-deb`/`data-fin`/`data-loc`/`data-nomloc`, classes `cat_*`, `data-pseudo`,
commentaires `data-obs`…).

Donc : chaque générateur construit d'abord le `.sonal` en mémoire via
`exporterSonal(entree)`, puis **parse le fragment avec `DOMParser`** (comme la
V1) et projette vers le format demandé. Bénéfices : une seule logique de
découpage en segments (ancres, tours de parole, fragments de codage), déjà
validée par les tests du round-trip ; pas de duplication.

### 3.4 Pseudonymisation à l'export (option « Anonymiser »)

Comme en V1 : l'option applique la pseudonymisation **définitivement** dans le
fichier produit.

- Sur le fragment parsé : remplacer le texte des spans `.anon` (non-exception)
  par leur `data-pseudo`, retirer classes/attributs anon ; vider `tabAnon` ;
- Locuteurs : nom affiché = pseudo du locuteur quand il en a un
  (`l.pseudo`, `l.pseudoEtat !== 'refuse'`), entre crochets `[Pseudo]` comme
  en V1 ; les autres gardent leur nom en clair ;
- Nom de fichier : suffixe `_anonymise` avant l'extension ;
- Le `.sonal` exporté pseudonymisé suit la même règle (V1 le faisait aussi).

## 4. Matrice d'options par format (proposition, à ajuster)

Options : `entete`, `notes`, `vars`, `time`, `loc`, `thm`, `anon`.
Format `[activé, cochéParDéfaut]`, reprise de la `CFG` V1 adaptée :

| Format | entete | notes | vars | time | loc | thm | anon |
| --- | --- | --- | --- | --- | --- | --- | --- |
| .sonal | – | – | – | – | – | – | ✔/✘ |
| .txt | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✘ | ✔/✘ | ✔/✔ |
| .srt | – | – | – | – | ✔/✔ | – | ✔/✘ |
| .vtt | – | ✔/✔ | – | – | ✔/✘ | ✔/✘ | ✔/✘ |
| .html | ✔/✘ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ |
| .docx | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✘ | ✔/✘ | ✔/✔ |
| .pdf | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✔ | ✔/✘ | ✔/✘ | ✔/✘ |

Notes de traduction V1→V2 :

- **Notes** : les notes V2 sont structurées (`Note` : catégorie, titre, date,
  statut privé/public, corps). Export en TEXTE PLAT groupé par catégorie,
  trié par `rang`, format « **titre** — corps », en-tête de section par
  catégorie. Les notes `statut: 'prive'` sont exclues de tout export
  (décision actée).
- **Variables** : via `exporterVariables`/`exporterValeurs` déjà en place
  (`valeursGen` + valeurs locuteurs).
- **Temps** : dérivé des `ancres` (déjà re-dérivé en `data-deb`/`data-fin`
  par `exporterSonal`) ; formats `HH:MM:SS` comme V1 (`SecToTime`).
- **Thèmes** : classes `cat_*` déjà posées par `exporterSonal` ; le titre
  `data-` ou la légende peut être reconstruit depuis le codebook
  (`cat.nom`, `cat.couleur`).

## 5. Formats et phases

### Phase 1 — Socle + formats texte (txt, srt, vtt, .sonal)

1. `ModaleExportEntretien.vue` (2 panneaux, matrice d'options, Retour/Exporter)
   branchée sur le bouton `Exporter` de `Entretien.vue` ; choix `.sonal`
   appelle l'`exporter()` existante (inchangée) ;
2. `useExportEntretien.ts` + `exportFormats.ts` : construction de
   l'`EntreeExport`, parsage du fragment `exporterSonal`, générateurs
   txt/srt/vtt avec options (locuteurs, temps, thèmes, anon) ;
3. Tests unitaires des générateurs (fragments avec ancres, codages, commentaires,
   pseudo ; vérifier cues srt/vtt bornés aux ancres, txt avec/sans temps).

Livrable : bouton « Exporter » complet pour tous les formats texte.

### Phase 2 — HTML autonome

Reprise du principe V1 : page autonome avec player `<audio>` (uniquement si un
audio local référencé existe — chemin `file://` ; en corpus distant, player
MASQUÉ, décision actée), sections notes/variables, légende des thèmes
(couleurs du codebook), CSS des `cat_*`. Le JS de play-par-segment de la V1
peut être repris tel quel (il ne dépend que de `data-deb` et de l'id audio).

### Phase 3 — PDF (via printToPDF) et DOCX

**PDF — `webContents.printToPDF` (décision actée)** :

- Aucune nouvelle dépendance : le HTML autonome de la phase 2 est la source ;
- Un handler IPC (`export:entretienPdf`) qui reçoit le HTML, l'imprime dans une
  `BrowserWindow` cachée via `webContents.printToPDF`, et écrit le buffer via
  un dialogue natif ;
- Replan uniquement si la pagination « navigateur » pose un vrai problème :
  pdfkit (lib V1) en replan.

**DOCX (nécessite le main)** :

- Ajouter la dépendance `docx` (même lib que V1) au process main et un handler
  IPC (`export:entretienDocx`) qui reçoit le contenu texte intermédiaire (même
  approche que V1 : les générateurs du renderer produisent un texte à
  marqueurs, le main construit le buffer) — réécriture TS de
  `construireDocxBuffer` ;
- Étendre l'écriture : `dialog:choisirExport` n'écrit que des chaînes UTF-8 ;
  ajouter une variante binaire (Buffer/Uint8Array) ou un handler dédié qui
  enchaîne dialogue + `writeFileSync(buffer)`.

### Option non planifiée (à trancher plus tard)

- `.csv` et synthèse d'extraits : hors périmètre entretien (ça relève de la
  synthèse/recueils V1, autre chantier) ;
- export multi-entretiens (corpus entier) : autre chantier.

## 6. Points de vigilance

- Ne PAS toucher à `exportSonal.ts` : le `.sonal` reste bit-à-bit ce qu'il est
  aujourd'hui (tests round-trip l'attestent). La modale ne fait que l'appeler
  pour le choix `.sonal`.
- Les générateurs doivent rester purs (pas d'accès DOM live ni au store) :
  entrée = `EntreeExport` + options, sortie = `{ nomFichier, contenu }`.
  Facilite les tests et réutilise la règle « l'export est une photographie ».
- Le parsage DOMParser du fragment `exporterSonal` doit tolérer les mêmes cas
  que les tests existants (blocs vides, ancres aux frontières, multi-codage).

## 7. Piste d'évolution — projection directe du modèle JSON

Le pivot actuel est le FRAGMENT HTML sérialisé par `exporterSonal` : les
formats texte le re-parsent avec DOMParser. C'est le port fidèle de la V1 (qui
parsait aussi son HTML compacté) et le choix prudent : la logique de
segmentation vit dans un code déjà testé, sans le toucher.

Si une évolution le justifie (gros transcrits, formats structurés type CSV ou
REFI-QDA), refactorer en une fonction PURE `projeterSegments(entree)` extraite
de `exporterSonal` : un pipeline JSON modèle → segments typés → N formats,
sans aller-retour DOM. Précondition : les tests golden/round-trip du `.sonal`
restent verts (filet de sécurité) ; le refactor ne doit changer AUCUN octet de
l'export `.sonal`.
