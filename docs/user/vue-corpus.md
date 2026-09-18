# Vue Corpus

La vue Corpus s’ouvre sur l’onglet **Accueil**. Sa barre d’icônes donne accès à :

- **Notes**, pour consulter les notes de tous les entretiens ;
- **Personnes**, pour relier les locuteurs d’entretiens différents ;
- **Pseudonymisation**, pour contrôler et appliquer les règles partagées ;
- **Thèmes**, pour consulter le codebook et ouvrir son édition ;
- **Données**, pour consulter et saisir les variables de l’ensemble du corpus ;
- **Journal**, pour annuler les actions récentes prises en charge dans le corpus ;
- **Pas à pas**, lorsque le parcours de démonstration est actif.

La recherche dans le texte de tous les entretiens est accessible avec **Ctrl + F**, et non depuis la barre d’icônes.

La barre d’outils supérieure donne aussi accès à **Docs cadre projet**, l’espace documentaire propre au corpus (voir [docs-cadre.md](docs-cadre.md)).

Les cartes d’entretiens restent visibles dans Accueil, Thèmes, Journal et Pas à pas. Un clic sur une carte affiche ses métadonnées à gauche. Notes, Personnes, Données et Pseudonymisation occupent toute la largeur et masquent temporairement les cartes.

## Chargement et actualisation

Lors de la première ouverture d’un outil, un état de chargement discret remplace sa zone de contenu. Les actualisations suivantes gardent le dernier résultat lisible à l’écran. Si une relecture échoue, l’outil indique que ce résultat peut ne plus être à jour ; si rien n’a encore pu être lu, il propose **Réessayer**. Les entretiens indisponibles sont résumés dans un détail replié et n’empêchent pas de consulter les autres.

Dans un corpus distant, le bouton global **Actualiser** renouvelle aussi l’outil affiché. Une réussite n’ajoute pas de message de confirmation.

## Notes

L’onglet Notes rassemble les notes de tous les entretiens. Le panneau de gauche permet de rechercher, filtrer et trier les résultats. Les filtres portent notamment sur la catégorie, l’entretien, le statut, la date, les passages importants et les liens vers des commentaires. Les affichages **Cartes**, **Feuille** et **Tableau** présentent le même inventaire. **Exporter** produit un fichier Markdown avec les seules notes actuellement affichées.

Dans un corpus local, le crayon modifie le titre, le corps, la catégorie, la date et le statut d’une note existante. La croix la supprime après confirmation. Ces deux gestes alimentent le Journal du corpus et peuvent être annulés tant que la note ou son ordre n’a pas changé depuis. La création, l’ordre, les locuteurs concernés et les liens vers les commentaires restent gérés dans l’entretien.

Dans un corpus distant, l’onglet consulte les notes du dernier miroir synchronisé. L’édition et la suppression directes sont désactivées : **Ouvrir dans l’entretien** utilise le verrou habituel et constitue le chemin d’édition. Le cadenas signale qu’un entretien risque de s’ouvrir en lecture seule. Le bouton global **Actualiser** tire les changements du serveur puis renouvelle l’inventaire ; en cas d’échec, le dernier inventaire lisible reste affiché.

Les filtres, le tri, le mode d’affichage et la largeur du panneau sont conservés pendant un changement d’onglet ou un aller-retour dans un entretien. La largeur est mémorisée sur le poste et les panneaux s’empilent dans une fenêtre étroite.

## Personnes

Le répertoire distingue les **personnes du corpus** et les **locuteurs locaux**. Choisissez un locuteur non lié pour créer une personne, ou pour l’associer à une personne existante. Deux homonymes peuvent rester distincts. Une personne ne peut être associée qu’à un locuteur par entretien.

Le volet gauche sépare la recherche, les rapprochements à vérifier, le répertoire et les locuteurs sans lien valide dans des cartes aux teintes douces. Les cartes **Répertoire** et **Locuteurs sans lien valide** peuvent être repliées pour faciliter la consultation des corpus volumineux. L’aide générale de l’onglet est accessible à côté du bouton **Actualiser**.

La personne sélectionnée possède un nom de référence modifiable. Les noms locaux, pseudonymes et valeurs des variables ne sont jamais modifiés par cette opération. Les variables de locuteur sont présentées côte à côte : une différence d’âge ou de profession entre entretiens peut être légitime.

**C’est la même personne…** ouvre une confirmation depuis un rapprochement proposé. Si des entretiens désignent déjà séparément la même personne, utilisez **Réunir…**, choisissez la personne correspondante, puis le nom à conserver. La personne réunie s’ouvre après réussite. L’opération est bloquée si plusieurs locuteurs du même entretien seraient rattachés à cette personne.

**Séparer…** corrige le cas inverse : sélectionnez les locuteurs placés par erreur sur une même fiche, puis nommez la nouvelle personne. Au moins un locuteur doit rester sur la fiche d’origine. La séparation change uniquement les associations ; les noms locaux, pseudonymes, rôles, données et notes restent inchangés.

Lorsque des informations diffèrent réellement, la confirmation propose de **reprendre toutes les informations disponibles** depuis un entretien source vers le locuteur affiché. Cette copie ponctuelle remplace son pseudonyme, son statut et les valeurs de variables disponibles, sans modifier les autres membres de la personne ni créer de synchronisation future. Si aucune information ne changerait, cette option n’est pas affichée.

Un locuteur sans lien propose directement deux choix : créer une personne ou l’associer à une personne existante. Pour un locuteur déjà associé, **Modifier l’association…** permet de choisir une autre personne ou de supprimer l’association, après confirmation. Cette modification concerne uniquement le locuteur sélectionné. Après une dissociation volontaire, renommer le locuteur ne recrée pas automatiquement une personne ; vous pouvez toujours l’associer explicitement. Une personne sans entretien peut être examinée ou supprimée lorsque tous les entretiens sont lisibles. **À vérifier** affiche chaque rapprochement une seule fois entre deux identités, avec les entretiens déjà réunis de chaque côté. Son panneau présente uniquement la décision à prendre et des boutons pour ouvrir chacun des entretiens concernés. Après **Personne différente**, la décision s’ouvre dans **Écartées**, où l’association manuelle reste disponible. Ce filtre signale aussi les références absentes et les personnes possédant plusieurs locuteurs dans un même entretien. Aucune association incorrecte n’est supprimée automatiquement.

Dans l’onglet Notes d’un entretien, **Concerne** associe une note à un ou plusieurs locuteurs. La section **Notes liées** d’une personne agrège ces notes sans les copier : leur contenu, leur catégorie, leur date et leur statut restent propres à l’entretien. Une association modifiée actualise automatiquement cette liste. **Ouvrir l’entretien dans Notes** permet de modifier la note dans son contexte.

**Ouvrir l’entretien** accède directement à son onglet Locuteurs ; le retour conserve la sélection du répertoire et actualise les données. Dans l’éditeur, si la définition d’une Personne référencée a disparu, la ligne signale explicitement la référence absente et invite à corriger l’association dans Personnes. **Actualiser** permet aussi de relire le corpus. Le séparateur est redimensionnable à la souris ou au clavier, avec une largeur mémorisée ; les panneaux s’empilent dans une fenêtre étroite.

Dans un **corpus local**, toutes ces corrections sont disponibles. La réunion et la séparation de personnes utilisent un journal technique pour être terminées après une interruption ; une modification extérieure inconnue bloque leur reprise plutôt que d’être écrasée. Ce mécanisme est distinct du Journal visible du corpus.

Dans un **corpus distant connecté**, les corrections du répertoire sont disponibles sous verrous : création, renommage, association, refus, suppression d’une fiche vide, rapprochement, réunion et séparation. Les entretiens concernés sont verrouillés dans un ordre stable et relus depuis le serveur avant la modification. Un entretien déjà ouvert par votre session conserve sa sauvegarde habituelle. Un verrou détenu par une autre personne ou une modification concurrente provoque un refus explicite sans écrasement.

Les opérations composées publient les données dans un ordre qui évite les références absentes. Une création ou une séparation publie d’abord la nouvelle définition, puis les associations. Une réunion modifie d’abord les entretiens et retire seulement ensuite la définition absorbée. Si une publication intermédiaire échoue, les éléments déjà confirmés sont conservés et le message les nomme. Actualisez alors le répertoire : une réunion peut être relancée, tandis que les associations restant après une création ou une séparation peuvent être corrigées directement. La suppression d’une fiche vide contrôle préalablement tous les entretiens dans leur état frais. Hors ligne, le répertoire reste consultable sans écriture.

Au nommage local, un nom spécifique sans candidat crée une personne ; un nom identique, une graphie proche stricte ou un rôle équivalent dans un autre entretien ouvre une proposition sans choix présélectionné. Chaque proposition indique sa raison, par exemple « même nom », « une lettre différente » ou « mêmes mots dans un ordre différent ». Une identité déjà reliée à plusieurs entretiens apparaît sur une seule ligne, accompagnée des titres de ces entretiens. Un prénom ou un nom seul n’est jamais proposé sur la seule base d’une ressemblance approximative. Sélectionnez la bonne personne : la reprise de son pseudonyme et de son statut interviewer/interviewé est cochée par défaut. Seules les informations manquantes sont complétées ; les valeurs déjà renseignées et les autres variables restent inchangées. Décochez la case pour effectuer uniquement le rapprochement. Si plusieurs entretiens sources possèdent les mêmes informations, aucune sélection supplémentaire n’est demandée. Lorsqu’elles diffèrent, le pseudonyme et le statut de chaque entretien sont affichés avant de choisir la source.

Seul **Confirmer** applique l’association et la reprise proposée. **Plus tard** et Échap ne prennent aucune décision ; **Ce n’est pas cette personne** ou **Aucune de ces personnes** mémorise le refus des propositions affichées, révocable dans le répertoire. Lorsqu’un locuteur est déjà associé, la confirmation indique que seule son association sera modifiée ; pour réunir tous les entretiens, utilisez le répertoire Personnes.

## Cas

Le bouton global **Cas**, à côté de **Recueils**, ouvre les dossiers analytiques.
Ils rassemblent les interventions de personnes, des entretiens entiers et/ou des ajouts manuels,
sans les copier hors de leurs entretiens. Une personne du répertoire et un cas restent
deux objets distincts.

Le guide [Utiliser les cas](cas.md) décrit la création individuelle ou en lot, les cas
collectifs et les vues des matériaux. Il distingue les évolutions encore prévues :
familles, attributs et export QualCoder.

## Journal

Le Journal du corpus conserve en mémoire jusqu’aux dix dernières actions annulables prises en charge pendant la session. Les actions récentes apparaissent en premier et le bouton **↩** restaure leur état antérieur. Le Journal survit aux changements d’onglet et à un aller-retour dans un entretien, mais il est vidé au changement de corpus et au redémarrage de l’application.

Le Journal couvre les actions simples réalisées depuis Personnes : renommer une personne, associer, dissocier ou déplacer un locuteur, écarter un rapprochement simple et annuler un refus. Il couvre aussi la modification et la suppression d’une note réalisées depuis l’onglet Notes du corpus. Les créations de notes, reprises de données, réunions et opérations partiellement réussies n’apparaissent pas. Les actions effectuées dans un entretien restent rattachées à cet entretien et ne sont pas ajoutées au Journal du corpus.

Une action dont la cible a changé depuis reste visible mais ne peut plus être annulée. Le Journal n’écrase jamais cette modification plus récente. Il ne constitue pas un historique d’audit, n’est enregistré dans aucun fichier et ne propose pas de rétablissement après une annulation. L’annulation des actions d’un corpus distant n’est pas encore disponible.

## Données

Le panneau de gauche permet de rechercher les variables, de les filtrer par portée et de choisir les colonnes visibles. La recherche réduit seulement la liste : elle ne masque pas de colonne sans action explicite. Le crayon ouvre l’édition des variables et de leurs modalités.

La matrice de droite conserve la saisie directe et la navigation au clavier. Son panneau gauche peut être redimensionné ou replié. Dans un corpus distant, **Saisir…** ouvre l’entretien concerné sur son onglet Données ; le retour au corpus restaure la matrice et les colonnes choisies.

## Pseudonymisation

La loupe d’une règle ouvre son détail par entretien. Dépliez un entretien pour modifier l’état de ses occurrences, puis choisissez **Valider**. **Actualiser** force une nouvelle analyse du corpus.

La séparation entre la table et le détail se déplace à la souris ou avec les flèches du clavier lorsqu’elle a le focus. Sa position est mémorisée. Sur une fenêtre étroite, les deux panneaux sont empilés.

Si des changements ne sont pas validés au moment de quitter l’onglet ou d’ouvrir une occurrence, l’application propose de les **Valider**, de les **Abandonner** ou de **Rester**. Le retour d’un entretien restaure la règle, l’entretien déplié et la position de lecture.
