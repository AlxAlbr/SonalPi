# Vue Corpus

La vue Corpus s’ouvre sur l’onglet **Accueil**. Sa barre d’icônes donne accès à :

- **Thèmes**, pour consulter le codebook et ouvrir son édition ;
- **Recherche**, pour chercher dans le texte de tous les entretiens ;
- **Personnes**, pour relier les locuteurs d’entretiens différents ;
- **Données**, pour consulter et saisir les variables de l’ensemble du corpus ;
- **Pseudonymisation**, pour contrôler et appliquer les règles partagées ;
- **Pas à pas**, lorsque le parcours de démonstration est actif.

Les cartes d’entretiens restent visibles dans Accueil, Thèmes, Recherche et Pas à pas. Un clic sur une carte affiche ses métadonnées à gauche. Personnes, Données et Pseudonymisation occupent toute la largeur et masquent temporairement les cartes.

## Personnes

Le répertoire distingue les **personnes du corpus** et les **locuteurs locaux**. Choisissez un locuteur non lié pour créer une personne, ou pour le lier à une personne existante. Deux homonymes peuvent avoir des fiches distinctes. Une personne ne peut être liée qu’à un locuteur par entretien.

La fiche permet de modifier le nom de référence et une note, puis d’enregistrer. Les noms locaux, pseudonymes et valeurs des variables ne sont jamais modifiés par cette opération. Les variables de locuteur sont présentées côte à côte : une différence d’âge ou de profession entre entretiens peut être légitime.

**Délier** retire un lien, **Déplacer vers…** le réaffecte après confirmation. Une fiche ne peut être supprimée qu’une fois vide et lorsque tous les entretiens sont lisibles. **À vérifier** affiche les références absentes et les personnes possédant plusieurs locuteurs dans un même entretien. Aucun lien incorrect n’est supprimé automatiquement.

**Ouvrir l’entretien** accède directement à son onglet Locuteurs ; le retour conserve la sélection du répertoire et actualise les données. **Actualiser** permet aussi de relire le corpus. Le séparateur est redimensionnable à la souris ou au clavier, avec une largeur mémorisée ; les panneaux s’empilent dans une fenêtre étroite.

Cette première version permet les corrections dans les **corpus locaux**. Dans un corpus distant, le répertoire est consultable et les verrous sont indiqués, mais les corrections restent désactivées. Les suggestions automatiques au nommage, les fusions et les séparations ne sont pas encore disponibles.

## Données

Le panneau de gauche permet de rechercher les variables, de les filtrer par portée et de choisir les colonnes visibles. La recherche réduit seulement la liste : elle ne masque pas de colonne sans action explicite. Le crayon ouvre l’édition des variables et de leurs modalités.

La matrice de droite conserve la saisie directe et la navigation au clavier. Son panneau gauche peut être redimensionné ou replié. Dans un corpus distant, **Saisir…** ouvre l’entretien concerné sur son onglet Données ; le retour au corpus restaure la matrice et les colonnes choisies.

## Pseudonymisation

La loupe d’une règle ouvre son détail par entretien. Dépliez un entretien pour modifier l’état de ses occurrences, puis choisissez **Valider**. **Actualiser** force une nouvelle analyse du corpus.

La séparation entre la table et le détail se déplace à la souris ou avec les flèches du clavier lorsqu’elle a le focus. Sa position est mémorisée. Sur une fenêtre étroite, les deux panneaux sont empilés.

Si des changements ne sont pas validés au moment de quitter l’onglet ou d’ouvrir une occurrence, l’application propose de les **Valider**, de les **Abandonner** ou de **Rester**. Le retour d’un entretien restaure la règle, l’entretien déplié et la position de lecture.
