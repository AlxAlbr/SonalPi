# Plan — onglets Corpus et intégration de la pseudonymisation

> Transformer le panneau autonome « Pseudos » en onglet de la vue Corpus.
> Le premier livrable déplace l’existant sans enrichir la gestion des règles.
> L’édition complète des correspondances sera traitée dans un chantier ultérieur.

## 1. Décisions UX

### 1.1 Barre d’onglets

La colonne gauche de la vue Corpus reprend le patron de la vue Entretien :

- boutons composés uniquement d’une icône ;
- nom fourni par l’infobulle et le libellé accessible ;
- onglet actif visuellement identifiable ;
- **Accueil** ouvert par défaut.

Ordre normal :

1. **Accueil** ;
2. **Thèmes** ;
3. **Recherche** ;
4. **Pseudonymisation**.

En mode démonstration, **Pas à pas** reste un onglet supplémentaire avec une icône dédiée. Son activation automatique au démarrage du parcours est conservée.

### 1.2 Disposition générale

Pour **Accueil**, **Thèmes**, **Recherche** et **Pas à pas** :

- le contenu de l’onglet occupe la colonne gauche ;
- les cartes d’entretiens restent dans la grande colonne droite ;
- cliquer une carte remplace temporairement le contenu de gauche par les métadonnées de l’entretien ;
- le bouton de retour ramène vers l’onglet qui était actif.

Pour **Pseudonymisation** :

- les cartes d’entretiens sont masquées ;
- l’onglet utilise toute la largeur de la vue Corpus ;
- la table récapitulative est à gauche ;
- le détail ouvert par la loupe est à droite ;
- revenir sur un autre onglet restaure immédiatement les cartes.

### 1.3 Accueil

L’accueil suit le modèle de l’accueil des onglets d’Entretien. Il présente brièvement les possibilités de la vue Corpus avec l’icône et le nom de chaque onglet :

- **Thèmes** : consulter le codebook et ouvrir son édition ;
- **Recherche** : chercher du texte dans tous les entretiens ;
- **Pseudonymisation** : contrôler et appliquer les règles partagées au corpus ;
- **Pas à pas**, uniquement en mode démonstration : suivre le parcours guidé.

Ce premier accueil reste explicatif. Il ne devient pas encore un tableau de bord statistique.

### 1.4 Pseudonymisation

Le premier livrable conserve les capacités actuelles :

- chargement des règles corpus ;
- scan agrégé des entretiens ;
- recherche d’une entité ou d’un pseudo ;
- filtre par catégorie lorsqu’il est activé ;
- compteurs anonymisés, exceptions, incluses et à traiter ;
- sélection d’une règle par la loupe ;
- détail par entretien sous forme d’accordéons ;
- modification locale de l’état des occurrences ;
- validation en masse avec les contraintes de verrou existantes ;
- accès aux paramètres de pseudonymisation ;
- ouverture d’un entretien à l’occurrence sélectionnée.

Ne font pas partie de ce livrable :

- créer une règle depuis l’onglet ;
- modifier directement ses entités ou ses pseudos ;
- supprimer une règle depuis l’onglet ;
- importer ou exporter une table de correspondance ;
- reprendre toutes les commandes supplémentaires de SonalPi V1.

## 2. État existant à réutiliser

L’essentiel du comportement se trouve déjà dans
[`Corpus.vue`](../../src/renderer/components/corpus/Corpus.vue) : état de sélection,
scan, accordéons, diff local et validation. Le cœur métier reste inchangé :

- [`scanAnon.ts`](../../src/shared/corpus/scanAnon.ts) pour le scan pur ;
- [`useCorpus.ts`](../../src/renderer/composables/useCorpus.ts) pour les règles,
  paramètres et projections ;
- les IPC existants `reglesAnon`, `scanAnon`, `appliquerRegleAnonLot` et
  `regleAnonCategoriser` ;
- la politique de verrouillage et les retours d’échec nominatifs existants.

La V1 sert de référence UX pour le séparateur réglable et la lecture en deux
parties. Elle ne doit pas être portée directement : le modèle de données et les
commandes V2 restent la source de vérité.

## 3. Architecture de composants

### 3.1 Extraire le contenu de pseudonymisation

Créer un composant dédié, par exemple
`src/renderer/components/corpus/PseudonymisationCorpus.vue`, et y déplacer :

- le rendu de la table et du détail ;
- l’état de règle sélectionnée et d’accordéon ouvert ;
- l’état local des cases et exceptions ;
- les paramètres et filtres propres à l’onglet ;
- le calcul et l’application du diff ;
- le séparateur redimensionnable ;
- le message de résultat.

`Corpus.vue` conserve l’orchestration de la navigation, les cartes et les
métadonnées. Le composant de pseudonymisation reçoit les dépendances de corpus
nécessaires ou utilise `utiliserSonal()` comme les autres vues. Il émet les
intentions de navigation vers une occurrence au lieu de changer lui-même la vue
globale.

Cette extraction évite de conserver un écran autonome imbriqué dans un fichier
déjà volumineux. Elle ne doit pas déplacer le cœur pur du scan dans Vue.

### 3.2 État de navigation

Étendre l’état actuel de la barre :

```ts
type OngletCorpus = 'accueil' | 'themes' | 'recherche' | 'anon' | 'pas-a-pas'
```

`pas-a-pas` n’est proposé que lorsque le mode démonstration est actif. L’onglet
actif demeure monté lors d’une ouverture d’entretien afin de préserver son
contexte de retour.

La sélection d’une carte ne change pas `ongletCorpus`. Les métadonnées sont une
surcouche temporaire de la colonne gauche ; leur bouton de retour utilise donc
naturellement l’onglet mémorisé.

## 4. Navigation protégée

### 4.1 Détecter un vrai brouillon

Extraire le calcul du diff actuellement inclus dans `valider()` afin de pouvoir
l’utiliser à la fois pour :

- déterminer si des changements existent ;
- construire `CibleRegleAnon[]` à la validation.

L’état est sale uniquement si une case ou une exception diffère du dernier scan
détaillé. Déplier un entretien, filtrer la table, déplacer le séparateur ou
sélectionner une règle ne rend pas l’onglet sale.

### 4.2 Garde de sortie

Avant de quitter l’onglet Pseudonymisation ou d’ouvrir un entretien depuis une
occurrence, si un diff existe, afficher trois choix :

- **Valider** : appliquer le diff, puis naviguer seulement si la validation ne
  laisse pas de changements en attente ;
- **Abandonner** : reconstruire les états locaux depuis le dernier scan, puis
  naviguer ;
- **Rester** : fermer la demande et conserver l’utilisateur dans l’onglet.

Un échec de validation, notamment un verrou acquis entre le scan et l’écriture,
ne doit pas faire quitter silencieusement l’écran. Le résultat nominatif reste
affiché et l’utilisateur peut corriger, abandonner ou réessayer.

La même fonction de garde doit être utilisée par tous les boutons de la barre
d’onglets et par le bouton `↗` du détail. Il ne faut pas dupliquer les règles de
navigation dans chaque bouton.

### 4.3 Retour depuis un entretien

Le bouton `↗` mémorise avant l’ouverture :

- l’onglet `anon` ;
- l’id de la règle sélectionnée ;
- l’id de l’entretien déplié ;
- les positions de défilement de la table et du détail.

Au retour vers le Corpus :

- l’onglet Pseudonymisation est toujours actif ;
- la règle et l’accordéon sont restaurés s’ils existent encore ;
- la position de lecture est restaurée après le rendu ;
- si le scan a été invalidé pendant l’édition, il est rafraîchi avant de
  restaurer ce contexte.

Si la règle ou l’entretien a disparu, revenir sur l’état vide correspondant
sans erreur.

## 5. Cycle de vie du scan

### 5.1 Chargement et invalidation

Ne plus rescanner aveuglément à chaque aller-retour. Conserver dans le scope
corpus :

- un indicateur « scan déjà chargé » ;
- un indicateur « scan périmé » ;
- éventuellement l’instant du dernier scan pour l’affichage.

Comportement :

1. première activation de Pseudonymisation : charger règles et scan ;
2. activations suivantes : réutiliser le résultat tant qu’il est frais ;
3. modification susceptible de changer les règles, le texte ou les annotations
   anon : marquer le scan périmé ;
4. retour dans l’onglet avec scan périmé : rafraîchir ;
5. proposer en permanence une action **Actualiser** pour forcer le scan.

Le chargement doit afficher un état d’attente et empêcher deux scans
concurrents. Une erreur conserve le dernier résultat utilisable et affiche un
message permettant de réessayer.

### 5.2 Événements qui périment le scan

Au minimum :

- sauvegarde d’un entretien dont le texte ou les annotations ont changé ;
- création, modification ou suppression d’une règle corpus depuis l’entretien ;
- application du diff depuis l’onglet corpus ;
- actualisation d’un corpus distant ;
- ajout, suppression ou import d’un entretien ;
- changement de corpus.

Après une validation réussie dans l’onglet, un rafraîchissement immédiat garde
les compteurs et détails cohérents. L’invalidation sert surtout aux changements
réalisés ailleurs.

## 6. Séparateur et dimensions

Remplacer l’ajustement automatique seul par un séparateur vertical manipulable :

- largeur initiale calculée à partir de la largeur naturelle du tableau ;
- limites garantissant une table utilisable et un détail lisible ;
- déplacement à la souris et, si possible dans le même composant, au pointeur ;
- largeur enregistrée dans `localStorage` ;
- clé propre à la pseudonymisation corpus ;
- restauration seulement si la valeur reste compatible avec la largeur
  disponible ;
- adaptation lors d’un redimensionnement de fenêtre.

Le séparateur porte un rôle accessible et peut être ajusté au clavier. Sur une
fenêtre trop étroite pour respecter les deux minima, les panneaux passent en
pile verticale plutôt que de devenir inutilisables.

## 7. Adaptations de l’interface

Dans `Corpus.vue` :

- ajouter les icônes Accueil et Pseudonymisation à la barre existante ;
- remplacer les boutons avec texte par des boutons icône seuls ;
- donner une icône dédiée à Pas à pas ;
- ajouter les `title`, libellés accessibles et états actifs ;
- supprimer le bouton haut **Pseudos** ;
- supprimer l’overlay, son fond cliquable et son bouton de fermeture ;
- conserver le bouton **Base de données** tant que cette vue n’est pas devenue
  un onglet ;
- conserver les commandes de synchronisation distante ;
- afficher la grille cartes/panneau pour tous les onglets sauf `anon` ;
- afficher le composant de pseudonymisation en pleine largeur pour `anon`.

Dans le composant de pseudonymisation :

- garder les paramètres derrière l’engrenage ;
- ajouter **Actualiser** avec un état occupé ;
- conserver un état vide explicite si le corpus n’a aucune règle ;
- conserver le détail vide invitant à cliquer la loupe ;
- ne pas afficher de croix de fermeture, la barre d’onglets remplit ce rôle.

## 8. Tests

### 8.1 Tests unitaires

Ajouter des tests sur les fonctions extraites :

- diff vide immédiatement après chargement ;
- détection des poses, retraits, exceptions et retraits d’exception ;
- abandon qui rétablit exactement le dernier scan ;
- scan frais/périmé et absence de double chargement ;
- restauration bornée d’une largeur mémorisée invalide.

Les tests existants de `scanAnon.ts` doivent rester inchangés et continuer à
valider le cœur métier.

### 8.2 Tests E2E

Couvrir au minimum :

1. Accueil est l’onglet par défaut et décrit les autres icônes ;
2. les onglets sont affichés uniquement par icône avec infobulle/libellé ;
3. Thèmes et Recherche conservent leurs comportements actuels ;
4. les cartes restent visibles hors Pseudonymisation ;
5. Pseudonymisation masque les cartes et affiche table + détail en pleine
   largeur ;
6. la loupe sélectionne une règle et permet de déplier un entretien ;
7. le séparateur change la largeur et celle-ci survit à une réouverture ;
8. un changement local puis un changement d’onglet propose Valider / Abandonner
   / Rester ;
9. le bouton `↗` applique la même garde ;
10. le retour de l’entretien restaure règle, accordéon et défilement ;
11. une modification effectuée dans l’entretien invalide puis rafraîchit le
    scan ;
12. en corpus distant, un entretien verrouillé reste non modifiable et les
    autres peuvent être validés ;
13. Pas à pas conserve son activation et utilise une icône en mode démo.

Exécuter :

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e -- e2e/anonymisation.e2e.ts e2e/navigation.e2e.ts
```

Les bancs Nextcloud existants sont seulement démarrés si les scénarios distants
sont nécessaires ; aucune image Docker ne doit être retéléchargée.

## 9. Ordre de réalisation

1. Extraire `PseudonymisationCorpus.vue` sans changer le comportement du panneau.
2. Étendre la barre d’onglets et créer l’accueil explicatif.
3. Remplacer overlay/cartes par les deux dispositions conditionnelles.
4. Ajouter le séparateur réglable et persistant.
5. Extraire le diff et mettre en place la garde de navigation.
6. Préserver et restaurer le contexte lors de l’ouverture d’un entretien.
7. Ajouter le cycle frais/périmé et le bouton Actualiser.
8. Nettoyer les anciens états, styles et commentaires liés au panneau autonome.
9. Compléter les tests unitaires et E2E.
10. Mettre à jour la documentation utilisateur avec la nouvelle navigation.

## 10. Critères de fin

Le chantier est terminé lorsque :

- le bouton et l’overlay **Pseudos** n’existent plus ;
- la navigation Corpus est homogène avec celle d’Entretien ;
- l’accueil explique les onglets ;
- les cartes et métadonnées fonctionnent comme auparavant hors
  Pseudonymisation ;
- l’onglet Pseudonymisation offre toutes les fonctions du panneau V2 actuel ;
- aucun changement d’occurrence ne peut être perdu silencieusement ;
- le retour depuis un entretien conserve le contexte de travail ;
- le scan n’est relancé que lorsqu’il est absent, périmé ou explicitement
  demandé ;
- le séparateur est réglable, persistant et accessible ;
- les tests existants et nouveaux passent.

## 11. Suite hors périmètre

Un chantier séparé pourra enrichir la table à partir des enseignements de la V1 :
création, renommage, suppression, import/export et résolution de conflits depuis
l’onglet. Les futurs espaces Personnes, atelier thématique et Données pourront
ensuite rejoindre la navigation Corpus sans conditionner ce premier livrable.
