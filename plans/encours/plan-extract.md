# Plan d’extraction progressive des composants Vue

## Objectif

Réduire les responsabilités des plus gros composants sans modifier le comportement,
la persistance ni l’apparence de l’application.

Les principaux candidats actuels sont :

| Composant | Taille approximative | Priorité |
|---|---:|---|
| `components/entretien/Entretien.vue` | 3 238 lignes | Très haute |
| `components/corpus/Corpus.vue` | 1 312 lignes | Haute |
| `components/corpus/PseudonymisationCorpus.vue` | 1 027 lignes | À réévaluer après `Corpus.vue` |
| `components/donnees/TableDonnees.vue` | 835 lignes | À réévaluer après `Entretien.vue` |

La taille seule ne justifie pas une extraction. Le résultat recherché est surtout une
frontière claire : chaque panneau possède son état d’interface, ses gestes et ses styles,
tandis que le composant d’écran conserve la navigation et la disposition générale.

## Avancement

- [x] `PanneauDonneesEntretien.vue` : template, saisie libre, édition des variables et
  styles extraits. Typecheck, tests unitaires, build et `e2e/donnees.e2e.ts` validés.
- [x] `PanneauJournalEntretien.vue` : liste, annulation et styles extraits. Typecheck,
  tests unitaires, build et `e2e/journal.e2e.ts` validés.
- [x] `PanneauAccueilEntretien.vue` : raccourcis, présentation des onglets, icônes et
  styles extraits. Typecheck, tests unitaires, build et `e2e/navigation.e2e.ts` validés.
- [x] `PanneauThemesEntretien.vue` : arbre, repli, codage, menu contextuel, édition et
  styles extraits. Typecheck, tests unitaires, build, `e2e/theme-entretien.e2e.ts` et
  `e2e/themes.e2e.ts` validés.
- [x] `PanneauLocuteursEntretien.vue` : chargement des personnes liées, tableau,
  rapprochement, attribution, suppression et styles extraits. Typecheck, tests unitaires,
  build et les quatre suites E2E ciblées validés.
- [x] `PanneauNotesEntretien.vue` : cartes, feuille éditable, filtres, brouillon,
  catégories, liaisons aux commentaires et styles extraits. Un test couvre désormais
  la conservation du brouillon entre deux onglets. Typecheck, tests unitaires, build
  et les trois suites E2E ciblées validés.
- [x] `PanneauAnonymisationEntretien.vue` : lignes, brouillons, repérage, écouteurs
  de sélection, dialogues et styles extraits. Les dialogues sont téléportés hors de
  la colonne collante pour conserver leur empilement. Un test couvre l'alimentation
  depuis la sélection et la conservation du brouillon entre deux onglets. Typecheck,
  tests unitaires, build et les trois suites E2E ciblées validés.
- [x] Nettoyage final de `Entretien.vue` : la coquille conserve la navigation, la
  disposition, le média, l'éditeur, la recherche et ses fenêtres contextuelles. La
  suite E2E locale complète a été exécutée et les scénarios instables ont été validés
  après correction ou relance ciblée.

## Principes de travail

1. Extraire un seul panneau à la fois.
2. Déplacer ensemble son script, son template et ses styles spécifiques.
3. Ne pas modifier la logique métier pendant un déplacement.
4. Conserver les classes CSS, attributs `data-*`, libellés et sélecteurs utilisés par les tests.
5. Conserver `v-show` pour les panneaux actuellement montés en permanence. Le remplacer par
   `v-if` ferait perdre leur état local et modifierait leur cycle de vie.
6. Les panneaux peuvent appeler directement `utiliserSonal()`, comme les composants existants.
   Les props restent réservées à l’état d’affichage possédé par le parent.
7. Ne pas extraire simultanément un panneau et la partie correspondante de
   `useEntretien.ts`. La façade actuelle doit rester stable pendant le découpage visuel.
8. Ne pas créer de composant générique avant d’avoir rencontré au moins deux usages réellement
   identiques.
9. Faire un changement validable et réversible à chaque étape.

## Point de départ recommandé : le panneau Données de l’entretien

Créer :

```text
src/renderer/components/entretien/PanneauDonneesEntretien.vue
```

C’est le meilleur premier lot car le panneau est suffisamment conséquent pour rendre
l’extraction utile, mais reste peu couplé à TipTap et au DOM de l’éditeur. Les panneaux Notes
et Pseudonymisation apporteraient un gain plus important, mais manipulent sélection, focus,
`contenteditable`, écouteurs DOM et fenêtres téléportées ; ils sont donc plus risqués pour un
premier découpage.

### Contenu à déplacer

Depuis `Entretien.vue` :

- le bloc `<aside>` de l’onglet Données ;
- l’état local `editerVariables` ;
- `AUTRE` et `celluleLibre` ;
- `cleGen`, `cleLoc` et `libelleCell` ;
- `surSelectGen`, `surSelectLoc`, `surLibreGen` et `surLibreLoc` ;
- `focaliserLibre` ;
- la fenêtre `EditionVariables` et son état d’ouverture ;
- les styles spécifiques `.saisie-eav*`, `.fiche-loc*`, `.h4-ent` et `.h4-loc`.

Le nouveau composant récupère par `utiliserSonal()` :

- `varsGen`, `varsLoc`, `meta` et `locuteurs` ;
- `setValeurGen`, `setValeurLoc` ;
- `modalitesDe`, `modaliteParLibelle`.

Il reçoit un booléen pour la lecture seule effective :

```vue
<PanneauDonneesEntretien
  v-show="ongletDroite === 'donnees'"
  :lecture-seule="roContenu"
/>
```

`Entretien.vue` retire ensuite uniquement les imports, variables et méthodes devenus inutiles.
Les styles communs tels que `.panneau`, `.corpus-tete`, `.mini`, `.crayon` et `.vide` restent
fournis par `styles/base.css`.

### Validation du premier lot

Vérifier notamment :

- ouverture et fermeture de l’éditeur de variables ;
- saisie d’une modalité d’entretien ;
- saisie d’une modalité de locuteur ;
- saisie libre via « autre… » ;
- persistance après fermeture et réouverture ;
- grisage complet en lecture seule ;
- absence de changement visuel du panneau.

Commandes :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/donnees.e2e.ts
```

## Découpage proposé pour `Entretien.vue`

Procéder dans cet ordre, du moins risqué au plus couplé.

### 1. `PanneauDonneesEntretien.vue`

Premier lot décrit ci-dessus.

### 2. `PanneauJournalEntretien.vue`

Déplacer :

- la liste du journal ;
- l’affichage de l’heure et de l’annulabilité ;
- l’action `annulerEntree` ;
- les styles `.liste-journal`, `.heure`, `.lib-journal` et `.annuler-entree`.

Ce lot simple confirme que le modèle d’extraction et la gestion des styles scoped sont corrects.

Test ciblé :

```bash
npm run build && npx playwright test --project=local e2e/journal.e2e.ts
```

### 3. `PanneauAccueilEntretien.vue`

Déplacer la présentation de l’entretien, les raccourcis et la liste descriptive des onglets.
Ce composant est presque uniquement présentatif. Il peut importer lui-même les icônes utilisées
dans cette liste.

### 4. `PanneauThemesEntretien.vue`

Déplacer :

- l’arbre visible et l’état de repli ;
- le menu de thème actif/passif ;
- l’ouverture de `EditionThemes` ;
- le codage par clic ;
- les styles du panneau Thématiques.

`MenuTheme` et `EditionThemes` deviennent des enfants de ce panneau. La sélection TipTap reste
accessible par les commandes exposées par `utiliserSonal()`.

Tests ciblés :

```bash
npm run build
npx playwright test --project=local e2e/theme-entretien.e2e.ts e2e/themes.e2e.ts
```

### 5. `PanneauLocuteursEntretien.vue`

Déplacer :

- le chargement des noms de personnes liées ;
- le tableau des locuteurs et ses actions ;
- le rapprochement de nommage ;
- l’attribution des blocs ;
- la confirmation de suppression ;
- les styles du panneau Locuteurs.

`RapprochementNommage` devient un enfant du panneau. Il faut conserver la réaction aux changements
de `personneRef` et le comportement de focus du dialogue.

Tests ciblés :

```bash
npm run build
npx playwright test --project=local \
  e2e/locuteurs.e2e.ts \
  e2e/personnes-nommage.e2e.ts \
  e2e/personnes-nommage-simplifie.e2e.ts \
  e2e/personnes-reprise-nommage.e2e.ts
```

### 6. `PanneauNotesEntretien.vue`

Cette extraction produira le gain le plus important, mais doit rester un lot isolé.

Déplacer ensemble :

- les vues cartes et feuille ;
- les filtres et la copie dans le presse-papier ;
- le brouillon et la fenêtre d’édition ;
- la création de catégorie ;
- les directives et références DOM de la feuille ;
- le marquage des passages ;
- la liaison aux commentaires ;
- le glisser-déposer ;
- `MenuLiensNote` ;
- tous les styles propres aux notes.

Points de vigilance :

- conserver l’enregistrement de la zone éditée hors modale ;
- conserver le nettoyage HTML avant `v-html` ;
- ne pas casser la sélection lors du marquage ou de la liaison ;
- conserver le `Teleport` et son ordre d’empilement ;
- maintenir le panneau monté lors du changement d’onglet.

Tests ciblés :

```bash
npm run build
npx playwright test --project=local \
  e2e/notes-feuille.e2e.ts \
  e2e/commentaires.e2e.ts \
  e2e/marquage.e2e.ts
```

Ajouter un test ciblé si les scénarios existants ne couvrent pas la conservation d’un brouillon
lors d’un aller-retour entre deux onglets.

### 7. `PanneauAnonymisationEntretien.vue`

À faire en dernier, car ce panneau dépend directement de la sélection de l’éditeur et installe des
écouteurs sur son DOM.

Déplacer ensemble :

- les lignes existantes et les lignes de saisie ;
- le calcul des libellés raccourcis ;
- les références et déplacements de focus ;
- l’alimentation depuis la sélection TipTap ;
- les écouteurs `mouseup` et leur nettoyage ;
- les compteurs et la navigation entre occurrences ;
- les dialogues de portée et de suggestion ;
- les styles du tableau d’anonymisation.

Points de vigilance :

- un seul jeu d’écouteurs doit être installé sur l’éditeur ;
- les écouteurs doivent être retirés au démontage ;
- audio et vidéo doivent continuer à partager le même éditeur ;
- les brouillons saisis doivent survivre à un changement d’onglet ;
- le repérage actif doit rester cohérent après validation ou suppression.

Tests ciblés :

```bash
npm run build
npx playwright test --project=local \
  e2e/anonymisation.e2e.ts \
  e2e/motsLiaison.e2e.ts \
  e2e/parcours.e2e.ts
```

### 8. Nettoyage final de la coquille `Entretien.vue`

Une fois les panneaux extraits, `Entretien.vue` doit principalement conserver :

- la barre d’actions et le statut de publication ;
- la barre d’onglets ;
- la grille générale ;
- la zone média et `EditorContent` ;
- la recherche/remplacement flottante ;
- le menu contextuel et l’édition de commentaire liés à l’éditeur ;
- l’assemblage des panneaux.

On pourra alors décider si `BarreRechercheEntretien.vue` ou `ZoneMediaEntretien.vue` apportent une
frontière utile. Il ne faut pas les extraire uniquement pour atteindre un nombre de lignes cible.

## Découpage ultérieur de `Corpus.vue`

Commencer seulement après stabilisation d’`Entretien.vue`.

Ordre proposé :

1. `RechercheCorpus.vue` : requête, résultats, extrait courant, marqueurs et raccourci clavier ;
2. `PanneauThemesCorpus.vue` : consultation, repli, menu actif/passif et édition ;
3. `FicheEntretienCorpus.vue` : métadonnées et actions de l’entretien sélectionné ;
4. `ListeEntretiensCorpus.vue` : cartes, reprise, verrous, présences et marqueurs de recherche.

`Corpus.vue` conservera la navigation des onglets du corpus, la sélection courante et
l’assemblage de `TableDonnees`, `PersonnesCorpus` et `PseudonymisationCorpus`.

Tests à répartir selon le lot :

```bash
npm run build
npx playwright test --project=local \
  e2e/navigation.e2e.ts \
  e2e/themes.e2e.ts \
  e2e/table-donnees.e2e.ts \
  e2e/parcours.e2e.ts
```

## Composants à ne pas découper immédiatement

### `PseudonymisationCorpus.vue`

Malgré sa taille, il représente actuellement un flux cohérent : sélection d’une règle, chargement
des occurrences, édition locale, validation et garde de sortie. Le séparer trop tôt créerait de
nombreuses props et émissions entre une table et un détail partageant le même état.

Après le découpage de `Corpus.vue`, envisager d’abord l’extraction de logique dans des composables
locaux avant de séparer le template :

- gestion de la largeur et de la disposition ;
- édition locale des occurrences et construction du diff ;
- restauration du contexte de navigation.

### `TableDonnees.vue`

Le composant est volumineux mais encore lisible et cohérent. Une séparation future pourrait donner :

- `PanneauVariablesDonnees.vue` ;
- `MatriceDonnees.vue` ;
- `TableDonnees.vue` comme coordinateur des colonnes visibles et de la navigation clavier.

Cette extraction ne devient prioritaire que si de nouvelles fonctions alourdissent la matrice.

## Découpage ultérieur de `useEntretien.ts`

`useEntretien.ts` reste volumineux après les extractions visuelles. Son découpage doit constituer
une phase distincte, une fois les frontières des panneaux éprouvées.

Ordre possible :

1. `useRechercheEntretien.ts` ;
2. `useValeursEntretien.ts` ;
3. `useNotesEntretien.ts` ;
4. `useLocuteursEntretien.ts` ;
5. `useAnonymisationEntretien.ts`.

`useEntretien.ts` restera la façade qui compose ces modules et expose temporairement la même API à
`sonal.ts` et aux composants. Cette stabilité évite de mélanger changement d’architecture et
régression fonctionnelle.

## Validation commune à chaque lot

À chaque extraction :

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Puis exécuter les E2E ciblés du panneau. À la fin du découpage d’un écran, exécuter la suite E2E
locale complète, puis la suite complète si l’environnement Nextcloud est déjà disponible. Ne pas
télécharger ni reprovisionner les images Docker pour cette validation.

## Critères de fin

Le découpage est terminé lorsque :

- `Entretien.vue` et `Corpus.vue` décrivent surtout la composition de leur écran ;
- chaque panneau possède son état d’interface et ses styles spécifiques ;
- aucune longue chaîne de props ne reproduit artificiellement la façade `utiliserSonal()` ;
- les changements d’onglet conservent les brouillons, le focus utile et les états de panneau ;
- les sélecteurs E2E et le rendu restent inchangés ;
- typecheck, tests unitaires, build et E2E ciblés passent après chaque lot.
