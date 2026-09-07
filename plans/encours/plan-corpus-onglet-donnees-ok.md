# Plan — transformer « Base de données » en onglet Données du corpus

> Remplacer l’écran autonome « Base de données » par un onglet de la vue Corpus.
> L’onglet adopte une disposition en deux parties : pilotage des variables à
> gauche, matrice de saisie à droite. Le premier livrable conserve le modèle EAV,
> les commandes métier et la fenêtre actuelle d’édition des variables.

## 1. Objectif et périmètre

L’accès actuel repose sur :

- le bouton **Base de données** au-dessus de la navigation du corpus ;
- l’état global `vue === 'donnees'` ;
- le rendu autonome de
  [`TableDonnees.vue`](../../src/renderer/components/TableDonnees.vue) dans
  [`App.vue`](../../src/renderer/App.vue) ;
- `allerDonnees()`, qui ferme l’entretien éventuel, rafraîchit la matrice puis
  change de vue.

La cible est :

- un bouton icône **Données** dans la barre d’onglets du corpus ;
- `vue === 'corpus'` pendant toute la consultation de la matrice ;
- une colonne gauche consacrée aux variables et aux filtres ;
- une grande colonne droite consacrée à la matrice ;
- un rafraîchissement de la projection lors de l’activation de l’onglet ;
- la suppression du bouton et de l’écran autonomes.

Le chantier est une évolution d’interface. Il ne modifie pas :

- le format du corpus ;
- la représentation EAV ;
- les IPC de lecture ou d’écriture ;
- les règles de verrouillage ;
- les modalités d’édition en lot ;
- la fenêtre actuelle d’édition des variables.

Ne font pas partie du premier livrable :

- éditer les définitions ou les modalités directement dans la colonne gauche ;
- ajouter des statistiques avancées ou des graphiques ;
- filtrer les lignes selon leurs valeurs ;
- créer une portée supplémentaire ;
- modifier l’onglet Données propre à un entretien.

## 2. Décisions UX

### 2.1 Navigation du corpus

Étendre l’état local de [`Corpus.vue`](../../src/renderer/components/Corpus.vue) :

```ts
type OngletCorpus =
  | 'accueil'
  | 'themes'
  | 'recherche'
  | 'donnees'
  | 'anon'
  | 'pas-a-pas'
```

Ordre proposé des onglets :

1. **Accueil** ;
2. **Thèmes** ;
3. **Recherche** ;
4. **Données** ;
5. **Pseudonymisation** ;
6. **Pas à pas**, uniquement lorsque le parcours de démonstration est actif.

Le libellé affiché et accessible est **Données**, comme dans la vue Entretien.
L’icône `donnees.png` existante est réutilisée.

L’onglet Accueil mentionne le nouvel outil : « consulter et saisir les variables
pour l’ensemble du corpus ».

### 2.2 Disposition générale

L’onglet Données masque les cartes d’entretiens, comme l’onglet
Pseudonymisation, et utilise toute la largeur disponible sous la barre
d’onglets.

Son contenu est divisé en deux parties :

```text
┌────────────────────────┬─────────────────────────────────────────────┐
│ Variables              │ Table de données                           │
│                        │                                             │
│ Recherche…             │ Entretien │ Sexe │ Âge │ Profession │ …    │
│ Toutes / Ent. / Loc.   │                                             │
│                        │                                             │
│ Variables d’entretien  │                                             │
│ ☑ Date                 │                                             │
│ ☑ Lieu                 │                                             │
│                        │                                             │
│ Variables de locuteur  │                                             │
│ ☑ Âge                  │                                             │
│ ☑ Profession           │                                             │
│                        │                                             │
│ ✏ Éditer les variables │                                             │
└────────────────────────┴─────────────────────────────────────────────┘
```

La séparation exprime deux rôles distincts :

- **à gauche, piloter la structure visible** ;
- **à droite, comparer et saisir les valeurs**.

Il ne faut pas placer les entretiens dans la colonne gauche. Leur comparaison
transversale est précisément la valeur de la matrice, et une liste ferait
doublon avec les cartes du corpus.

### 2.3 Colonne gauche : variables et filtres

La colonne gauche contient :

- un titre **Variables** ;
- une recherche par nom de variable, insensible à la casse ;
- le filtre segmenté **Toutes / Entretien / Locuteurs** actuellement placé dans
  l’en-tête de la table ;
- la liste des variables regroupées par portée ;
- une case par variable pour afficher ou masquer sa colonne ;
- les actions **Tout afficher** et **Tout masquer** ;
- le statut privé sous une forme discrète, avec une infobulle explicite ;
- la nature de la saisie : `texte libre` ou nombre de modalités ;
- le bouton crayon **Éditer les variables**, qui ouvre la modale existante.

La recherche filtre seulement la liste de gauche. Elle ne doit pas masquer à
elle seule des colonnes de la matrice : effacer une recherche ne doit jamais
modifier implicitement la sélection de l’utilisateur.

Le filtre de portée agit sur la matrice et sur la liste :

- **Toutes** affiche les variables cochées des deux portées et les lignes
  locuteurs ;
- **Entretien** affiche les variables d’entretien cochées et masque les lignes
  locuteurs ;
- **Locuteurs** affiche les variables de locuteur cochées tout en conservant les
  lignes entretien comme séparateurs, conformément au comportement actuel.

Toutes les variables sont cochées par défaut. La sélection est un état de vue,
non persisté dans le corpus. Elle est réconciliée après l’édition des
définitions :

- une variable nouvellement créée devient visible ;
- une variable supprimée disparaît de la sélection ;
- un renommage ou un changement de statut se reflète immédiatement.

Si aucune variable n’est cochée dans la portée active, la partie droite affiche
un état vide explicite avec une action **Tout afficher**.

### 2.4 Partie droite : matrice de saisie

La partie droite conserve le comportement actuel de `TableDonnees.vue` :

- titre **Table de données** ;
- légende de navigation clavier ;
- lignes entretien et locuteur ;
- cellules `select` ou texte libre ;
- en-têtes collants ;
- modification en lot depuis une colonne d’entretien ;
- erreurs inline ;
- badges de verrou et de présence ;
- bouton **Saisir…** pour un corpus distant ;
- bouton **Reprendre** lorsqu’un entretien a été fermé auparavant.

La liste de variables visibles fournie à la table devient l’intersection entre :

1. la portée active ;
2. les variables cochées.

Le tableau conserve son défilement horizontal. Masquer des colonnes est un outil
de travail, pas une obligation destinée à faire tenir artificiellement toute la
matrice à l’écran.

### 2.5 Largeur et adaptation aux fenêtres étroites

La colonne gauche a une largeur initiale comprise entre 260 et 300 px. Un
séparateur vertical permet de la redimensionner :

- manipulation au pointeur ;
- rôle `separator` et ajustement au clavier ;
- limites garantissant un minimum utilisable aux deux parties ;
- largeur mémorisée dans `localStorage` avec une clé propre à l’onglet Données ;
- valeur rebornée lors d’un redimensionnement de fenêtre.

Prévoir une commande pour replier complètement la colonne gauche. La matrice
peut ainsi récupérer toute la largeur lorsque le corpus contient beaucoup de
variables.

Sous un seuil où les deux minima ne tiennent plus, passer en disposition
verticale : panneau des variables au-dessus, matrice en dessous. La matrice
reste la zone principale et conserve son propre défilement.

## 3. Architecture de composants

### 3.1 Responsabilités de `Corpus.vue`

[`Corpus.vue`](../../src/renderer/components/Corpus.vue) reste responsable de :

- l’onglet actif ;
- la garde de sortie de Pseudonymisation ;
- la sélection temporaire d’un entretien depuis les cartes ;
- l’affichage des cartes pour Accueil, Thèmes, Recherche et Pas à pas ;
- l’affichage pleine largeur de Pseudonymisation et Données ;
- le déclenchement du rafraîchissement de la matrice à l’entrée dans Données.

Le passage vers Données doit emprunter `choisirOnglet('donnees')`. Il bénéficie
ainsi de la même garde que les autres onglets si Pseudonymisation contient des
changements non validés.

### 3.2 Évolution de `TableDonnees.vue`

Conserver `TableDonnees.vue` comme composant dédié, mais le transformer d’écran
autonome en contenu d’onglet. Il porte :

- l’état de portée ;
- la recherche de variables ;
- la sélection des colonnes ;
- la disposition gauche/droite ;
- le séparateur ;
- la matrice et sa navigation clavier ;
- les modales `EditionVariables` et `LotVariable`.

Le composant ne change pas directement la vue globale. Il continue d’utiliser
`utiliserSonal()` pour les définitions, la projection et les commandes de
saisie.

Le style `.donnees-ecran` ne doit plus supposer qu’il est placé directement sous
l’en-tête d’`App.vue`. Sa hauteur doit être calculée dans le contexte de la vue
Corpus, sous sa barre d’onglets, sans créer un deuxième écran `.ecran` imbriqué.

Éviter de déplacer la logique de navigation clavier dans `Corpus.vue`.
[`tableNavigation.ts`](../../src/renderer/tableNavigation.ts) reste la source de
vérité pure pour les déplacements entre cellules.

### 3.3 Projection des variables visibles

Faire dériver une seule collection `variablesVisibles`, utilisée à la fois par :

- les colonnes rendues ;
- la construction de `grilleCellules()` ;
- les états vides ;
- la disponibilité de la légende clavier.

Cela évite qu’une colonne masquée reste atteignable au clavier ou qu’un registre
de focus conserve une géométrie différente de celle du tableau affiché.

Les références DOM des cellules démontées doivent être retirées du registre
comme aujourd’hui.

### 3.4 Séparateur

Le comportement est proche de celui de
[`PseudonymisationCorpus.vue`](../../src/renderer/components/PseudonymisationCorpus.vue),
mais il n’est pas nécessaire de créer immédiatement une abstraction commune.
Les contraintes et seuils des deux écrans ne sont pas forcément identiques.
Une extraction partagée ne sera faite que si les deux implémentations restent
réellement isomorphes après usage.

## 4. Navigation et cycle de vie

### 4.1 Activation de l’onglet

Lors de chaque transition d’un autre onglet vers Données :

1. vider la sélection de carte et l’extrait de recherche, comme pour les autres
   changements d’onglet ;
2. appeler `rafraichirMatrice()` ;
3. afficher l’état de chargement sans lancer plusieurs requêtes concurrentes ;
4. conserver le dernier résultat si le rafraîchissement échoue et laisser la
   bannière globale signaler l’erreur.

Un clic sur l’onglet déjà actif ne doit pas nécessairement relancer la requête.
Une commande **Actualiser** pourra être ajoutée dans l’en-tête de la matrice si
le besoin d’un rafraîchissement forcé est confirmé ; elle n’est pas requise pour
le déplacement initial.

Les écritures de cellules continuent de rafraîchir la projection après succès,
comme le fait actuellement `validerCelluleTable()`.

### 4.2 Ouverture d’un entretien depuis la matrice

Le bouton **Saisir…** d’un corpus distant conserve le comportement actuel :

- ouvrir l’entretien concerné ;
- activer son onglet Données ;
- respecter le verrou ou la lecture seule.

`ongletCorpus` reste égal à `donnees` pendant l’ouverture de l’entretien. Au
retour vers le corpus, l’utilisateur retrouve donc l’onglet Données, sa portée,
sa sélection de colonnes et sa largeur de panneau. La matrice est alors
rafraîchie pour refléter la saisie faite dans l’entretien.

Le bouton **Reprendre** suit la même règle : il ouvre l’entretien sans perdre le
contexte local de l’onglet.

### 4.3 Suppression de la vue globale `donnees`

Lorsque tous les accès ont migré :

- retirer `'donnees'` du type de `vue` dans
  [`sonal.ts`](../../src/renderer/composables/sonal.ts) et dans les dépendances
  qui reprennent ce type, notamment le mode démonstration ;
- supprimer `allerDonnees()` et son exposition par `utiliserSonal()` ;
- supprimer le rendu autonome de `TableDonnees` dans `App.vue` ;
- supprimer le segment **Table de données** du fil d’Ariane ;
- conserver `allerSaisieDonnees()`, qui sert toujours depuis la matrice ;
- vérifier qu’aucun test ou parcours de démonstration ne dépend encore de
  `vue === 'donnees'`.

Le fil d’Ariane indique seulement que l’utilisateur se trouve dans le Corpus.
Le changement entre Accueil et Données se fait désormais exclusivement avec la
barre d’onglets.

## 5. Adaptations de l’interface existante

Dans `Corpus.vue` :

- importer et rendre `TableDonnees` ;
- ajouter l’onglet Données avec `icoDonnees` ;
- supprimer le bouton haut **Base de données** ;
- conserver dans la barre haute les seules commandes transversales, notamment
  la synchronisation distante ;
- afficher `.grille-corpus` seulement pour Accueil, Thèmes, Recherche et Pas à
  pas ;
- afficher Données et Pseudonymisation dans deux conteneurs pleine largeur
  distincts ;
- ajouter Données à la présentation de l’onglet Accueil.

Dans `TableDonnees.vue` :

- déplacer le filtre de portée dans le panneau gauche ;
- ajouter recherche, sélection et regroupement des variables ;
- conserver le crayon d’édition dans ce panneau ;
- ne dupliquer ni le titre ni le filtre dans l’en-tête droit ;
- garder à droite les actions liées à la matrice, dont Reprendre ;
- adapter les états vides selon l’absence de définition ou de sélection ;
- ajouter le séparateur, son repli et la disposition étroite.

Dans la terminologie utilisateur et les tests, préférer désormais **Données** à
**Base de données** pour le nom de l’onglet. Le titre interne **Table de données**
reste pertinent au-dessus de la matrice.

## 6. Accessibilité

L’onglet Données suit le patron de la barre existante :

- `title="Données"` ;
- `aria-label="Données"` ;
- `aria-current="page"` lorsqu’il est actif ;
- icône décorative avec `alt=""`.

Dans le panneau gauche :

- chaque case est associée au nom complet de la variable ;
- les groupes de portée ont un intitulé lisible ;
- le statut privé n’est pas communiqué par la seule icône ;
- Tout afficher et Tout masquer sont de vrais boutons ;
- la recherche porte un libellé accessible.

Le séparateur :

- est focalisable ;
- expose son orientation et sa valeur ;
- se déplace avec les flèches ;
- ne piège pas le focus lorsqu’il est remplacé par la disposition verticale.

Le masquage d’une colonne contenant la cellule focalisée doit rendre le focus à
un élément stable du panneau gauche ou de l’en-tête de table.

## 7. Tests

### 7.1 Tests unitaires

Conserver les tests de navigation existants et compléter les fonctions pures si
la sélection des variables est extraite :

- toutes les variables visibles par défaut ;
- intersection correcte entre portée et cases cochées ;
- recherche insensible à la casse sans effet sur les colonnes cochées ;
- réconciliation après ajout et suppression d’une variable ;
- aucune colonne visible produit une grille de navigation vide ;
- restauration bornée d’une largeur mémorisée invalide.

`grilleCellules()` doit continuer à être testée avec la collection réellement
visible : navigation horizontale entre colonnes cochées et saut des lignes de
portée incompatible.

### 7.2 Tests E2E

Adapter les aides de [`e2e/util.ts`](../../e2e/util.ts) :

- `entrerDonnees()` clique l’onglet accessible **Données**, et non le bouton
  texte supprimé ;
- les scénarios qui veulent retrouver les cartes choisissent explicitement
  l’onglet Accueil au lieu de compter sur un changement de vue global ;
- `retourCorpus()` reste réservé au retour depuis un entretien.

Couvrir au minimum :

1. l’onglet Données apparaît dans la barre avec son icône et son libellé
   accessible ;
2. le bouton haut **Base de données** et le segment de fil d’Ariane autonome ont
   disparu ;
3. activer Données masque les cartes et affiche le panneau Variables avec la
   matrice ;
4. toutes les variables sont visibles par défaut ;
5. décocher une variable retire sa colonne sans modifier les données ;
6. Tout afficher et Tout masquer produisent les états attendus ;
7. la recherche réduit seulement la liste de gauche ;
8. les filtres Toutes, Entretien et Locuteurs conservent la sémantique actuelle
   des lignes et colonnes ;
9. le crayon ouvre toujours `EditionVariables` et une variable créée apparaît
   cochée ;
10. saisie par sélection, saisie libre et modification en lot continuent
    d’écrire chez le bon propriétaire ;
11. Tab, Maj+Tab, Entrée et Maj+Entrée suivent seulement les colonnes visibles ;
12. les erreurs inline, verrous, présences et boutons Saisir restent visibles ;
13. le séparateur est réglable et sa largeur est restaurée ;
14. le repli donne toute la largeur à la matrice ;
15. sur fenêtre étroite, les deux parties s’empilent sans rendre la matrice
    inaccessible ;
16. Saisir ou Reprendre ouvre l’entretien, puis le retour restaure l’onglet
    Données et rafraîchit la matrice ;
17. quitter Pseudonymisation pour Données respecte sa garde de changements non
    validés.

Les scénarios principaux concernés sont :

- [`e2e/donnees.e2e.ts`](../../e2e/donnees.e2e.ts) ;
- [`e2e/table-donnees.e2e.ts`](../../e2e/table-donnees.e2e.ts) ;
- [`e2e/navigation.e2e.ts`](../../e2e/navigation.e2e.ts) ;
- les scénarios distants qui saisissent depuis la matrice.

Exécuter au minimum :

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e -- e2e/donnees.e2e.ts e2e/table-donnees.e2e.ts e2e/navigation.e2e.ts
```

Les bancs Nextcloud existants sont seulement démarrés si les scénarios distants
sont nécessaires. Aucune image Docker ne doit être retéléchargée.

## 8. Documentation

Mettre à jour [`docs/user/vue-corpus.md`](../../docs/user/vue-corpus.md) :

- ajouter Données à la liste des onglets ;
- expliquer le panneau Variables et la sélection de colonnes ;
- préciser que les cartes sont masquées dans Données ;
- décrire le retour depuis Saisir ou Reprendre ;
- remplacer les références à l’écran ou au bouton autonome.

Mettre à jour les documents développeur qui décrivent encore quatre vues
globales ou `vue === 'donnees'`. Le modèle EAV lui-même ne change pas.

Après réalisation, mettre aussi à jour la section Onglet Données du plan de
vision long terme afin qu’elle décrive l’interface effectivement retenue plutôt
qu’un simple déplacement inchangé du composant.

## 9. Ordre de réalisation

1. Ajouter l’onglet Données et y rendre provisoirement la table existante.
2. Déclencher `rafraichirMatrice()` à l’activation et au retour d’un entretien.
3. Mettre en place la disposition pleine largeur propre à Données.
4. Construire le panneau gauche et déplacer le filtre de portée.
5. Ajouter la sélection de colonnes, les actions globales et la recherche.
6. Brancher `variablesVisibles` sur le rendu et la navigation clavier.
7. Ajouter le séparateur redimensionnable, son repli et sa persistance.
8. Ajouter la disposition verticale sur fenêtre étroite.
9. Supprimer le bouton, la vue globale, le fil d’Ariane et `allerDonnees()`.
10. Adapter les tests, les aides E2E et la documentation.
11. Vérifier les parcours locaux, distants et le retour depuis un entretien.

## 10. Critères de fin

Le chantier est terminé lorsque :

- **Base de données** n’est plus un écran ni un bouton autonome ;
- **Données** est un onglet du Corpus ;
- l’onglet présente les variables à gauche et la matrice à droite ;
- l’utilisateur peut choisir les colonnes visibles sans modifier les données ;
- le filtre de portée conserve sa sémantique actuelle ;
- la matrice conserve toutes ses capacités de saisie et de navigation clavier ;
- la fenêtre d’édition des variables et la modification en lot fonctionnent
  toujours ;
- les règles de verrouillage local et distant sont inchangées ;
- Saisir et Reprendre restaurent le contexte Données au retour ;
- la disposition reste utilisable sur une fenêtre étroite ;
- `vue === 'donnees'` et `allerDonnees()` ont disparu ;
- les tests unitaires, E2E, le typecheck et le build passent.

## 11. Évolutions ultérieures possibles

Après validation de cette première version, le panneau gauche pourra accueillir
sans remettre en cause la matrice :

- un taux de remplissage par variable ;
- le nombre de modalités utilisées ;
- un filtre « valeurs manquantes » pour la variable sélectionnée ;
- un accès rapide au détail des modalités ;
- une sélection enregistrée comme préférence utilisateur ;
- des colonnes liées aux personnes lorsque cette fonction existera.

Ces enrichissements doivent rester des projections ou des préférences locales.
Ils ne doivent pas alourdir le format du corpus sans besoin métier confirmé.
