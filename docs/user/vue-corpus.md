# Vue Corpus

La vue Corpus s’ouvre sur l’onglet **Accueil**. Sa barre d’icônes donne accès à :

- **Thèmes**, pour consulter le codebook et ouvrir son édition ;
- **Personnes**, pour relier les locuteurs d’entretiens différents ;
- **Données**, pour consulter et saisir les variables de l’ensemble du corpus ;
- **Pseudonymisation**, pour contrôler et appliquer les règles partagées ;
- **Pas à pas**, lorsque le parcours de démonstration est actif.

La recherche dans le texte de tous les entretiens est accessible avec **Ctrl + F**, et non depuis la barre d’icônes.

Les cartes d’entretiens restent visibles dans Accueil, Thèmes et Pas à pas. Un clic sur une carte affiche ses métadonnées à gauche. Personnes, Données et Pseudonymisation occupent toute la largeur et masquent temporairement les cartes.

## Personnes

Le répertoire distingue les **personnes du corpus** et les **locuteurs locaux**. Choisissez un locuteur non lié pour créer une personne, ou pour l’associer à une personne existante. Deux homonymes peuvent rester distincts. Une personne ne peut être associée qu’à un locuteur par entretien.

La personne sélectionnée possède un nom de référence modifiable. Les noms locaux, pseudonymes et valeurs des variables ne sont jamais modifiés par cette opération. Les variables de locuteur sont présentées côte à côte : une différence d’âge ou de profession entre entretiens peut être légitime.

**C’est la même personne…** ouvre une confirmation depuis un rapprochement proposé. Si des entretiens désignent déjà séparément la même personne, utilisez **Réunir…**, choisissez la personne correspondante, puis le nom à conserver. La personne réunie s’ouvre après réussite. L’opération est bloquée si plusieurs locuteurs du même entretien seraient rattachés à cette personne.

**Reprendre aussi certaines données…** est une option repliée dans la confirmation. Elle permet une copie ponctuelle depuis un entretien source vers le locuteur affiché, pas vers tous les membres de la personne. Le pseudo et le statut interviewer sont décochés par défaut ; remplacer une valeur existante demande une autorisation explicite. Refermer la section annule la reprise. Aucune règle d’anonymisation du texte n’est modifiée.

Un locuteur sans lien propose directement deux choix : créer une personne ou l’associer à une personne existante. Pour un locuteur déjà associé, **Modifier l’association…** permet de choisir une autre personne ou de supprimer l’association, après confirmation. Cette modification concerne uniquement le locuteur sélectionné. Après une dissociation volontaire, renommer le locuteur ne recrée pas automatiquement une personne ; vous pouvez toujours l’associer explicitement. Une personne sans entretien peut être examinée ou supprimée lorsque tous les entretiens sont lisibles. **À vérifier** affiche les rapprochements proposés, les références absentes et les personnes possédant plusieurs locuteurs dans un même entretien. Aucune association incorrecte n’est supprimée automatiquement.

Dans l’onglet Notes d’un entretien, **Concerne** associe une note à un ou plusieurs locuteurs. La section **Notes liées** d’une personne agrège ces notes sans les copier : leur contenu, leur catégorie, leur date et leur statut restent propres à l’entretien. Une association modifiée actualise automatiquement cette liste. **Ouvrir l’entretien dans Notes** permet de modifier la note dans son contexte.

**Ouvrir l’entretien** accède directement à son onglet Locuteurs ; le retour conserve la sélection du répertoire et actualise les données. **Actualiser** permet aussi de relire le corpus. Le séparateur est redimensionnable à la souris ou au clavier, avec une largeur mémorisée ; les panneaux s’empilent dans une fenêtre étroite.

Ces corrections sont disponibles dans les **corpus locaux**. La réunion de deux personnes est journalisée pour être terminée après une interruption ; une modification extérieure inconnue bloque sa reprise plutôt que d’être écrasée. Dans un corpus distant, le répertoire est consultable et les verrous sont indiqués, mais les corrections restent désactivées. La séparation d’une personne réunie reste à implémenter.

Au nommage local, un nom spécifique sans candidat crée une personne ; un nom identique ou un rôle équivalent dans un autre entretien ouvre une proposition sans choix présélectionné. Sélectionnez la bonne personne : un aperçu montre les informations manquantes qui seront complétées à la confirmation, notamment le pseudonyme et les métadonnées. Les valeurs déjà renseignées et le statut interviewer restent inchangés par défaut. Si plusieurs entretiens sources sont disponibles, choisissez celui dont vous souhaitez reprendre les informations.

**Choisir les données à reprendre, ou ne rien reprendre…** permet de modifier cette sélection ou de cocher **Ne reprendre aucune donnée**. Refermer cette section conserve vos choix. Seul **Confirmer** applique l’association et la reprise affichée. **Plus tard** et Échap ne prennent aucune décision ; **Ce n’est pas cette personne** ou **Aucune de ces personnes** mémorise le refus des propositions affichées, révocable dans le répertoire. Lorsqu’un locuteur est déjà associé, la confirmation indique que seule son association sera modifiée ; pour réunir tous les entretiens, utilisez le répertoire Personnes.

## Données

Le panneau de gauche permet de rechercher les variables, de les filtrer par portée et de choisir les colonnes visibles. La recherche réduit seulement la liste : elle ne masque pas de colonne sans action explicite. Le crayon ouvre l’édition des variables et de leurs modalités.

La matrice de droite conserve la saisie directe et la navigation au clavier. Son panneau gauche peut être redimensionné ou replié. Dans un corpus distant, **Saisir…** ouvre l’entretien concerné sur son onglet Données ; le retour au corpus restaure la matrice et les colonnes choisies.

## Pseudonymisation

La loupe d’une règle ouvre son détail par entretien. Dépliez un entretien pour modifier l’état de ses occurrences, puis choisissez **Valider**. **Actualiser** force une nouvelle analyse du corpus.

La séparation entre la table et le détail se déplace à la souris ou avec les flèches du clavier lorsqu’elle a le focus. Sa position est mémorisée. Sur une fenêtre étroite, les deux panneaux sont empilés.

Si des changements ne sont pas validés au moment de quitter l’onglet ou d’ouvrir une occurrence, l’application propose de les **Valider**, de les **Abandonner** ou de **Rester**. Le retour d’un entretien restaure la règle, l’entretien déplié et la position de lecture.
