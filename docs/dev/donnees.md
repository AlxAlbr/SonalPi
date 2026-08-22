# Les données

Deux niveaux bien différenciés : **Corpus** / **Entretien**.
Deux états : ce qui est **stocké** / ce qui est **reconstruit, recalculé**.

## 1. Différentes natures des données

| Nature | Exemple | Plan technique | Stockée ? |
|---|---|---|---|
| **Définition** (existe avant tout usage) | `Categorie`, `RegleAnon`, `Variable`/`Modalite` | `corpus.json` | oui (primaire) |
| **Application** (décision portée par un entretien) | codage, masquage, métadonnée (données d'une variable), commentaire | `entretiens/<id>.json` | oui (primaire) |
| **Requête** (agrégation dérivable) | `Extrait`, matrice EAV, passage « à anonymiser »| — | non — **calculée** |

L'objectif, c'est d'éviter la redondance des informations qui existe malheureusement dans la version actuelle de SonalPi.

## 2. Différentes représentations des données et interactions

Il faut distinguer plusieurs représentations des mêmes données dans l'application :

| Représentation | Rôle | Statut |
|---|---|---|
| Objets en mémoire (`Entretien`, `Corpus`) dans le processus renderer d'Electron | les données vivantes | **considéré comme la vérité en cas de conflit** |
| Le DOM / l'éditeur WYSIWYG Tiptap: https://tiptap.dev/ | ce que voit l'utilisateur | une projection, recalculée *depuis* le modèle (décorations, gouttière des locuteurs) |
| `entretiens/<id>.json` | la persistance | de l'I/O : écrit *depuis* le modèle, relu *vers* le modèle |

### 1) DOM ↔ objet en mémoire

#### a) Montée (DOM → modèle)

Quand vous tapez, TipTap produit une transaction ProseMirror : le doc ProseMirror
(`corpsTexte` dans `EntretienFichier` de `format.ts`) est un arbre de nœuds : doc → bloc → text.
Par exemple, si vous tapez « a », ProseMirror ne modifie rien en place. Il construit une
transaction (`Transaction`, `tr` en abrégé) qui contient :

- les **steps** (étapes) : ici un `ReplaceStep` = « insère "a" à la position 42 »
- le **nouvel état** du document (un nouvel arbre, l'ancien reste intact)
- `tr.mapping` : la carte des positions — « l'ancienne position 50 est devenue 51 »

Le plugin maison — `remap.ts` — observe `tr.mapping` et met à jour les positions du modèle
(bornes from/to des annotations, pos des ancres temporelles).

#### b) Descente (modèle → DOM)

TipTap ne sait pas ce qu'est une annotation. Ce sont les **décorations** — `decorations.ts` —
qui projettent le modèle dans le rendu : surlignages, gouttière des locuteurs, plage en cours de
lecture audio. Le DOM est recalculé depuis le modèle, jamais l'inverse.

### 2) Objet mémoire ↔ fichier

C'est le domaine du **main process** : `corpusStore.ts` sérialise `Entretien` vers
`entretiens/<id>.json` (écriture atomique write-tmp-rename + `.bak`), le relit et vérifie
`formatVersion`. Le renderer passe par le pont IPC du preload.

### 3) Commandes métier

Coder un passage, renommer un locuteur, saisir une valeur EAV : ce sont des fonctions pures de
`src/shared/` (`entretien.ts`, `locuteurs.ts`, `requetes.ts`…), sans DOM ni I/O — c'est le
garde-fou testé par le test **« discipline d'architecture »** de `test/remap.test.ts`. Le
composable `useEntretien.ts` orchestre : commande de domaine → mise à jour du modèle → sauvegarde
via IPC → le rendu suit.

## Résumé

Pour résumer, **TipTap est le moteur du passage DOM ↔ doc ProseMirror** (arbre de nœuds immutable
`doc → bloc → text`, champ `corpsTexte` du modèle), rien de plus. L'originalité de l'architecture
— et ce qui rend le modèle testable headless — c'est que tout le reste (remap, décorations,
commandes, persistance) est du code applicatif délibérément hors de l'éditeur.

- Ce que TipTap ne sait pas faire (et ne fait pas) :
  - savoir qu'une plage du texte est codée avec le thème « entretien/qualité » → c'est le calque
    annotations du modèle + les décorations ;
  - mettre à jour les positions des annotations quand le texte bouge → c'est `remap.ts` qui lit
    `tr.mapping` ;
  - sauvegarder quoi que ce soit sur disque → c'est le main process via IPC.

Le doc ProseMirror n'est qu'une **partie** du modèle — à côté vivent `annotations[]`,
`locuteurs[]`, `ancres[]` (pour la synchronisation audio ↔ texte), que TipTap ne connaît pas.
