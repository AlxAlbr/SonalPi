# Vue Corpus

La barre supérieure propose trois espaces de travail :

- **Préparer et suivre** réunit l’**Accueil**, le **Tableau de bord** et les
  **Documents cadre** du projet. Ses onglets à icônes occupent la colonne de
  gauche ; le contenu de travail reste à droite. L’Accueil présente les autres
  onglets et garde le tableau de bord sous les yeux. Dans le Tableau de bord, les
  colonnes, lignes et badges se créent à gauche et la grille s’édite à droite.
  Une colonne ou une ligne s’ajoute après l’intitulé choisi, par défaut le dernier,
  ou en premier. La grille défile horizontalement et verticalement plutôt que de
  se comprimer ; glissez le bord droit d’un intitulé de colonne ou le bord bas
  d’un intitulé de ligne pour régler sa taille, et double-cliquez pour revenir au défaut.
- **Importer et traiter** donne accès au corpus et aux entretiens décrits ci-dessous.
- **Analyser et interpréter** réunit la **Synthèse**, **Lexico** et les
  **Analyses croisées**. Ses trois onglets occupent la colonne de gauche, avec
  les filtres de l’outil actif dessous ; les résultats restent à droite.
  **Masquer les filtres** réduit la colonne à ses onglets. Chaque onglet garde
  ses critères, ses résultats et ses réglages d’affichage quand on le quitte.

Les boutons **Recueils** et **Cas** ouvrent encore leur fenêtre par-dessus le
traitement.
On passe librement d’un espace à l’autre : consulter la préparation ou une
analyse ne ferme pas l’entretien ouvert, et **Importer et traiter** le retrouve
tel qu’il a été laissé. Les deux espaces à onglets reprennent le dernier onglet
visité, y compris après une ouverture dans l’entretien ; **Préparer et suivre**
s’ouvre d’abord sur son Accueil.

La vue Corpus s’ouvre sur l’onglet **Accueil**. Sa barre d’icônes donne accès à :

- **Notes**, pour consulter les notes de tous les entretiens ;
- **Personnes**, pour relier les locuteurs d’entretiens différents ;
- **Pseudonymisation**, pour contrôler et appliquer les règles partagées ;
- **Thèmes**, pour consulter le codebook et réorganiser ses codages ;
- **Données**, pour consulter et saisir les variables de l’ensemble du corpus ;
- **Journal**, pour annuler les actions récentes prises en charge dans le corpus.

Lorsque la découverte pas à pas est active, une fenêtre permet de choisir entre **Préparer son terrain** et **Traiter ses entretiens**. Le premier accompagne le tableau de bord, les documents cadre, la création d’un entretien planifié et sa note préparatoire. Le second reprend les six étapes d’import, de documentation, de transcription et de codage. Chaque parcours conserve sa propre progression et peut être commencé dans n’importe quel ordre. **Analyse** est annoncé comme « à venir », sans action inactive présentée comme utilisable.

Après le choix, la fenêtre se ferme et l’Accueil retrouve la disposition d’un corpus ordinaire. Un bandeau compact indique le parcours retenu et propose **Continuer** ou **Revoir**, ainsi que **Voir les étapes de ce parcours — ou changer de parcours**. Une nouvelle découverte ouvre le choix sans lancer d’étape automatiquement. Une ouverture par **Récents** ne rouvre pas la fenêtre : elle restaure le dernier parcours choisi dans le bandeau, sans relancer son guidage. **Ctrl + F** reste disponible.

La recherche dans le texte de tous les entretiens reste accessible avec **Ctrl + F**, et non depuis la barre d’icônes.

Les **Documents cadre** de l’espace **Préparer et suivre** forment l’espace documentaire propre au corpus (voir [docs-cadre.md](docs-cadre.md)).

Les cartes d’entretiens restent visibles dans Accueil et Journal. Un clic sur une carte affiche ses métadonnées à gauche. Dans Thèmes, un atelier remplace les cartes à droite du codebook. Notes, Personnes, Données et Pseudonymisation occupent toute la largeur et masquent temporairement les cartes.

Dans un entretien du parcours, l’Accueil nomme le parcours actif, rappelle sa progression et propose soit de revoir ce parcours, soit de revenir au catalogue. La consigne active reste placée sous la barre d’onglets, quel que soit l’outil affiché ; ses explications complémentaires peuvent être dépliées. Dans le Tableau de bord et les Documents cadre, la consigne se place également dans le panneau de travail.

## Chargement et actualisation

Lors de la première ouverture d’un outil, un état de chargement discret remplace sa zone de contenu. Les actualisations suivantes gardent le dernier résultat lisible à l’écran. Si une relecture échoue, l’outil indique que ce résultat peut ne plus être à jour ; si rien n’a encore pu être lu, il propose **Réessayer**. Les entretiens indisponibles sont résumés dans un détail replié et n’empêchent pas de consulter les autres.

Dans un corpus distant, le bouton global **Actualiser** renouvelle aussi l’outil affiché. Une réussite n’ajoute pas de message de confirmation.

## Thèmes

À gauche, l’arbre conserve ses couleurs, ses compteurs et le crayon d’édition.
À droite, trois opérations réorganisent les codages du **corpus local** :

- **Transférer…** déplace tous les codages vers une thématique existante ou
  nouvelle. **Conserver la thématique source** est cochée par défaut ; décochez
  cette case pour retirer la source et promouvoir ses sous-thèmes vers son
  ancien parent.
- **Fusionner…** réunit deux thématiques dans une thématique résultante déjà
  existante. Le résultat peut être l’une des deux thématiques ou une troisième.
  Les thématiques non retenues comme résultat sont retirées et leurs sous-thèmes
  directs sont déplacés vers le résultat. Une destination qui créerait un cycle
  dans la hiérarchie n’est pas proposée.
- **Diviser…** répartit les codages vers deux à quatre thématiques déjà
  présentes dans le codebook. Créez-les auparavant avec le crayon si nécessaire.

Avant toute écriture, l’aperçu annonce passages, entretiens, orphelins, doublons
prévisibles et éventuels fichiers indisponibles. Une fusion indique aussi les
sous-thèmes déplacés. Seuls les codages sont modifiés : transcriptions,
commentaires et pseudonymisations restent inchangés. Si la cible possède déjà
un codage sur la plage exacte, celui-ci est conservé et le doublon source retiré.

Pour diviser, dépliez un entretien et choisissez une destination pour chaque
codage, ou attribuez tous ses codages à une destination. Sur une ligne
sélectionnée, les touches **1 à 4** choisissent la destination correspondante.
Les codages sans texte, notamment les orphelins, apparaissent séparément.
Sans destination, un codage reste sur la source. **Supprimer la source après
répartition complète** exige une destination pour tous les codages, orphelins
compris. Les destinations conservent leur position actuelle dans le codebook. Si la
source est supprimée, ses sous-thèmes sont replacés sous son ancien parent.

**Consulter l’entretien** conserve l’atelier mais invalide son aperçu. Au
retour, recalculez avec les choix existants ; ils ne sont réutilisés que si les
fichiers restent valides. Sinon, **Repartir de l’état actuel** redemande tous les
choix. Aucune nouvelle annotation n’est répartie automatiquement. Le changement
de corpus efface le brouillon.

**Confirmer et appliquer** est la seule étape d’écriture. Tout changement depuis
l’aperçu refuse l’opération locale et demande un recalcul. Les contrôles restent
désactivés pendant l’exécution. En local, en cas de résultat inconnu, rouvrez le corpus
pour vérifier ou reprendre la transaction avant un nouveau lancement. Ces
opérations ne sont **pas annulables dans le Journal du corpus**.

Sur **WebDAV/Nextcloud connecté**, le transfert et la division sont disponibles,
toujours avec source conservée. La fusion et la suppression de source restent
désactivées. Les aperçus lisent le serveur ; les membres indisponibles sont nommés,
sans être comptés comme des usages nuls. Fermez vos sessions d’entretien actives
ou récupérables avant leur réaffectation.

Les entretiens sont traités un par un, sans atomicité globale. Le bilan distingue
les succès acquis et les entretiens à reprendre. **Recalculer et reprendre** relit
l’état actuel, conserve les destinations choisies et redemande les choix de division.
Seuls les codages encore sur la source sont proposés. Le suivi survit à la fermeture
du bilan et au redémarrage.

Si une réponse est inconnue, **Vérifier la publication** vérifie le serveur sans
rejouer l’envoi. Une publication non confirmée reste bloquante. Une fois les issues
certaines, reprenez explicitement ou choisissez **Clôturer le suivi sans reprendre** :
les réaffectations réussies et l’éventuelle cible créée par un transfert restent en place, sans annulation.

Sur **GitLab connecté**, les trois opérations sont disponibles. L’aperçu indique
les entretiens observés libres, tenus sur un autre poste, ouverts localement ou
d’état inconnu. Cette observation n’est pas une réservation : chaque droit est
vérifié de nouveau avant l’écriture. Vous pouvez tenter tous les entretiens prévus
ou traiter seulement ceux observés libres ; les autres restent dans le suivi.

Un transfert sans conservation, une fusion ou une division avec suppression
conserve les thématiques à retirer jusqu’à ce que toutes les réaffectations aient
réussi. GitLab relit alors tout le corpus et les supprime dans un commit protégé. Une nouvelle référence ou une
publication concurrente bloque seulement cette finalisation : les succès restent
acquis et **Recalculer et reprendre** permet de terminer plus tard. Ce parcours
est limité aux corpus de 248 entretiens lorsqu’il retire des thématiques ; les
opérations qui conservent la source n’ont pas cette limite globale.

Hors ligne ou en lecture seule, les boutons restent désactivés avec leur motif.
L’édition habituelle du codebook par le crayon conserve ses capacités propres.

## Notes

L’onglet Notes rassemble les notes de tous les entretiens. Le panneau de gauche permet de rechercher, filtrer et trier les résultats. Les filtres portent notamment sur la catégorie, l’entretien, le statut, la date, les passages importants et les liens vers des commentaires. Les affichages **Tableau** (par défaut) et **Feuille** présentent le même inventaire. **Exporter** produit un fichier Markdown avec les seules notes actuellement affichées.

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

Le tableau présente quatre colonnes : **Entité originale**, **Pseudonyme / remplacement**, **État corpus** et **Actions**. Les badges verts comptent les occurrences anonymisées, les gris les exceptions laissées en clair et les orange les occurrences à traiter. Les incluses (`*`) sont masquées par une décision englobante et ne gonflent pas les compteurs traités. Une règle sans usage reste neutre ; un résultat périmé ou absent n’est jamais présenté comme un succès. Les trois premières colonnes sont centrées. **Légende et aide** présente les badges, les couleurs des lignes et les icônes d’action dans un encart ouvert au départ. Cliquez sur son titre ou le signe **−** pour le replier, puis sur **+** pour le rouvrir.

La recherche utilise les entités, pseudonymes et catégories complets, même lorsque le texte affiché est abrégé. Combinez-la avec le filtre d’état et, si les catégories sont actives, le filtre de catégorie. Les en-têtes d’entité et de pseudo permettent le tri dans les deux sens. Un même pseudo peut appartenir à plusieurs règles : le signalement de collision ne propose aucune fusion.

**Ajouter une règle** se trouve à droite du filtre **Toutes les règles / À traiter…** et fonctionne aussi lorsque le tableau est vide. **Import règles 📥**, **Export règles 📤** et **Paramètres ⚙** sont regroupés en haut à droite. Renseignez l’entité et ses alias, puis un pseudonyme, ou deux variantes pour une entité unique. Un groupe de plusieurs alias ne peut avoir qu’un pseudo. La catégorie peut être choisie lorsqu’elle est disponible. **Créer la définition** ne modifie aucun entretien : le scan affiche les occurrences à traiter. Annuler n’écrit rien ; un chevauchement partiel d’alias doit être résolu plutôt que tronqué. La création est indisponible hors ligne ou en lecture seule.

Cliquez sur le pseudonyme affiché pour modifier le champ **Pseudonymes**. **Dans un corpus local, GitLab ou WebDAV**, saisissez par exemple **Claire / Rebecca**, en conservant Claire, puis **Enregistrer** : Rebecca devient un second choix sans changer les passages déjà traités, les exceptions ou les locuteurs. Deux variantes maximum sont autorisées pour une entité unique ; un groupe de plusieurs alias conserve un seul pseudonyme. La création d’une règle utilise le même séparateur **/** pour les alias et les pseudonymes. Modifier une valeur ouvre le bilan du **renommage**, à confirmer séparément. **Dans un corpus local, GitLab ou WebDAV**, conserver une seule des deux valeurs ouvre le bilan du retrait, à confirmer séparément. Si l’ajout n’a pas pu être confirmé, fermez la fenêtre puis **Actualiser** pour vérifier la règle avant de recommencer. Sur GitLab ou WebDAV, après un ajout non confirmé, utilisez **⟳ Actualiser** en haut du corpus pour vérifier le résultat, sans répéter l’ajout. Après une interruption, rouvrir le corpus permet de reconnaître un ajout déjà enregistré. Si le résultat ne peut pas être vérifié, l’ajout reste bloqué : faites examiner le corpus, sans recommencer à l’aveugle. Une autre modification peut rester indisponible jusqu’à ce que le poste détenteur libère le corpus ou qu’un administrateur examine sa réservation ; aucun forçage n’est proposé. Un renommage en attente ouvre directement son suivi, sans nouvel ajout ni répétition. Si un retrait GitLab ou WebDAV est déjà engagé, son suivi apparaît dans le panneau : **Relire le suivi GitLab** ou **Relire le suivi WebDAV** vérifie l’avancement sans recommencer les remplacements. Un retrait engagé ouvre directement son suivi avant toute nouvelle modification des pseudonymes.

Pour **retirer une variante dans un corpus local, GitLab ou WebDAV**, remplacez par exemple **Claire / Rebecca** par **Rebecca**, puis **Enregistrer**. Le bilan indique les choix liés qui passeront de Claire à Rebecca, y compris ceux masqués. Les exceptions restent en clair, mais leur pseudonyme mémorisé devient Rebecca. Le texte d’origine, les choix indépendants, les noms et pseudonymes enregistrés dans chaque entretien et les locuteurs restent inchangés. Examinez le bilan et, si nécessaire, **Voir les passages concernés**, puis cochez l’accord nommant le remplacement et cliquez sur **Remplacer les choix et retirer la variante**. **Annuler** ne modifie rien. Une variante inutilisée est seulement retirée de la règle. Au local, fermez les entretiens ouverts en modification puis examinez un nouveau bilan. Sur GitLab ou WebDAV, les entretiens ciblés ouverts restent à traiter ; aucune fermeture forcée n’est proposée. Ce retrait n’est pas annulable depuis le Journal. Au local, après un retrait interrompu, fermez la fenêtre et rouvrez le corpus pour vérifier les changements déjà enregistrés avant toute nouvelle tentative ; ne répétez pas le retrait à l’aveugle.

**Sur GitLab ou WebDAV**, cliquez d’abord sur **Préparer le retrait de variante** pour examiner les choix enregistrés sur le serveur. Les entretiens sont mis à jour l’un après l’autre ; ceux indisponibles restent à traiter, sans fermeture forcée. Les remplacements déjà enregistrés sont conservés et les deux variantes restent proposées jusqu’à la fin. Un entretien non ciblé utilisant la variante restante peut encore être édité. Si le retrait s’interrompt, **Relire le suivi GitLab** ou **Relire le suivi WebDAV** vérifie l’avancement sans refaire les remplacements. **Recalculer la reprise** prépare un nouveau bilan des choix restants ou nouveaux : examinez-le et cochez à nouveau l’accord. Après un arrêt de l’application, rouvrez le même corpus pour retrouver le suivi. Une réservation persistante peut empêcher la suite : faites examiner le corpus, sans forcer sa libération ni recommencer à l’aveugle.

La loupe d’une règle ouvre son détail par entretien. Dépliez un entretien pour modifier l’état de ses occurrences liées, puis choisissez **Valider**, ou **Abandonner** pour revenir aux décisions chargées. Les variantes réellement appliquées restent affichées. Les règles à plusieurs pseudos et les décisions indépendantes sont en lecture seule dans ce détail : ouvrez l’occurrence pour les modifier dans l’entretien. Les pseudonymes de locuteurs se saisissent séparément dans le panneau Locuteurs.

Le bilan distingue les poses, retraits, exceptions ajoutées et exceptions retirées réellement obtenus. Les intentions en échec restent à reprendre ; les succès ne sont pas rejoués. Le lot n’est pas une transaction atomique de tous les entretiens.

Dans l’entretien, valider ou promouvoir une ligne qui couvrirait une exception interne demande une confirmation. L’exception n’est pas supprimée : elle redevient visible si la décision englobante est retirée. Une modification pendant cette confirmation impose de recommencer.

**Actualiser** force une nouvelle analyse du corpus. Si le texte ou les décisions ont changé depuis le chargement du détail, la validation refuse les anciennes positions : actualisez et examinez les occurrences à nouveau. Un échec conserve le dernier résultat lisible, avec un avertissement.

La séparation entre la table et le détail se déplace à la souris ou avec les flèches du clavier lorsqu’elle a le focus. Sa position est mémorisée. Sur une fenêtre étroite, les deux panneaux sont empilés.

Si des changements ne sont pas validés au moment de quitter l’onglet, de changer de règle, de replier le détail, d’actualiser ou d’ouvrir une occurrence, l’application propose de les **Valider**, de les **Abandonner** ou de **Rester**. Le retour d’un entretien restaure la règle, l’entretien déplié et la position de lecture.

### Tables de correspondance

**Export règles 📤** ouvre l’export des correspondances et propose quatre choix : toutes les définitions ou seulement les utilisées, corpus seul ou corpus et entretiens, texte et/ou locuteurs, catégories incluses ou non. Les valeurs par défaut sont utilisées, corpus et entretiens, texte et locuteurs, catégories disponibles. Un locuteur explicitement pseudonymisé est inclus même sans tour de parole. Les exceptions, attentes et décisions masquées seules ne rendent pas une correspondance utilisée.

L’aperçu distingue règles partagées, définitions textuelles locales et couples locuteur/pseudo, avec leurs provenances et les divergences. Les nouvelles déclarations locales mémorisent tous leurs alias, variantes inutilisées et catégories, même sans occurrence. Les anciens fichiers sont reconstruits avec les informations encore disponibles ; aucune catégorie ou graphie perdue auparavant n’est inventée. Un entretien illisible ou une décision invalide est signalé, jamais assimilé à zéro usage. L’export partiel exige une acceptation explicite.

Le format **V2** conserve nature, portée, catégories, variantes déclarées et choisies et provenance par entretien. **Export compatible V1** est une action distincte : elle aplatit nature, portée, états et provenance ; les lignes sans pseudo ne sont pas convertibles. Une seconde confirmation reconnaît ces limites. La table contient les **identités originales** : elle ne doit pas être diffusée comme un document pseudonymisé. La destination doit être un JSON hors du corpus et de son miroir ; aucun fichier source n’est modifié.

Pour l’export distant, l’aperçu consulte le **miroir local du poste**, pas le serveur. Il peut inclure des sauvegardes locales non encore publiées et manquer des publications récentes. Actualisez le corpus avant d’ouvrir le dialogue. Les changements non sauvegardés ne sont pas inclus. L’écriture exporte exactement l’aperçu mémorisé, pendant cinq minutes au maximum.

**Import règles 📥** ouvre l’import des correspondances et accepte un ou plusieurs JSON V1/V2 (20 fichiers et 8 Mio maximum). Les lignes distinguent ajouts, identiques, divergences, invalides et ciblage par entretien. Les divergences sont **ignorées par défaut**. Retenez explicitement une définition, ajoutez une seconde variante compatible ou remplacez la définition. Ajouter une variante conserve la catégorie existante ; remplacer ne renomme pas les pseudonymes déjà choisis dans les textes. Les identifiants étrangers ne réaffectent jamais une autre règle : le rapprochement repose sur les alias.

Les champs permettent de corriger une combinaison invalide sans troncature. **Recalculer l’aperçu** valide ces corrections et remet les décisions à leur défaut ; aucune écriture ne précède **Confirmer l’import des définitions**. Les définitions sont revalidées sur la base fraîche avant la seule écriture du corpus. Un changement depuis l’aperçu refuse l’application. Annuler ne modifie rien.

**Dans un corpus local, GitLab ou WebDAV**, la section **Cibles locales**, **Entretiens GitLab ciblés** ou **Entretiens WebDAV ciblés** permet de choisir chaque entretien et locuteur existant de même nom. Rien n’est présélectionné. Un même nom ne garantit pas la même personne : vérifiez l’entretien, l’index et le pseudo actuel, puis choisissez confirmé, refusé ou non précisé. Aucun locuteur absent n’est créé, aucun lien `Personne` n’est réassigné et aucune autre étiquette n’est synchronisée.

Les définitions textuelles locales se retiennent dans les seuls entretiens sélectionnés, avec leurs alias, variantes et catégories, y compris un brouillon sans pseudo. Elles ne posent, ne retirent et ne renomment aucune occurrence. Un remplacement doit conserver les pseudos déjà choisis ; les chevauchements partiels et les alias déjà déclarés au corpus nécessitent une résolution de portée et sont refusés dans ce parcours.

Cochez la confirmation des seuls entretiens et décisions choisis, puis **Confirmer l’import ciblé**. Modifier une cible annule cette confirmation. Fermez les entretiens ouverts et recalculez l’aperçu ; une modification du corpus ou d’un fichier cible impose également un nouvel aperçu. Les très anciens formats doivent d’abord être enregistrés dans le format actuel.

Toutes les mutations sont préparées avant une transaction locale à journal durable. Après interruption, la réouverture du corpus reprend l’intention ; une modification concurrente n’est jamais écrasée. Ce mécanisme de reprise n’est pas une action annulable du Journal utilisateur. Le bilan distingue définitions partagées, définitions locales, libellés de locuteurs et entretiens réellement modifiés.

**Sur GitLab**, l’aperçu d’import lit un commit publié, pas les sauvegardes du miroir. Les cibles doivent déjà être enregistrées au format actuel et leurs sessions locales/récupérables fermées. Le corpus et les fichiers choisis sont relus sous baux, puis publiés dans **un seul commit de données** ; une version changée ou un bail tiers refuse tout le groupe. La sélection est limitée à 124 entretiens, avec une borne supplémentaire de taille. Un résultat de publication indéterminé impose de **rouvrir le corpus pour réconcilier**, jamais de rejouer l’import. Si seul le miroir n’a pas pu être installé, la publication reste acquise : rouvrez le corpus pour le tirer.

**Sur WebDAV/Nextcloud**, l’aperçu d’import lit le **serveur**, jamais les sauvegardes du miroir. Fermez toutes les sessions locales ou récupérables avant de confirmer. Les cibles doivent déjà être au format actuel ; la sélection est limitée à 100 entretiens, avec une borne supplémentaire de taille. Les copies sont préparées sous verrous avant publication, puis envoyées **fichier par fichier avec garde de version** : le groupe n’est pas atomique.

Une interruption conserve les succès acquis. Rouvrez le même corpus et choisissez **Import règles 📥** : le dialogue **Import WebDAV à reprendre** indique les fichiers confirmés, restants ou indéterminés, les cibles et le bilan prévu. Relisez-les, cochez la confirmation puis **Reprendre l’import WebDAV**. Les publications déjà reconnues ne sont pas rejouées et aucune compensation n’est appliquée. Un contenu modifié depuis, même déjà confirmé, refuse la reprise sans écrasement. La confirmation doit être renouvelée après un refus. Un suivi indisponible interdit toute application jusqu’à **Relire le suivi WebDAV**.

Tant que l’import reste incomplet, les autres écritures, ouvertures en édition et actualisations du miroir sont bloquées. Après un arrêt brutal, des verrous peuvent rester tenus : vérifiez les autres postes et faites intervenir leur détenteur ou l’administrateur. **Le même compte Nextcloud peut être actif ailleurs ; aucun verrou natif n’est forcé ni libéré automatiquement.** En cas de conflit, conservez le suivi pour examen ; aucune clôture forcée ni résolution automatique n’est proposée.

En lecture seule ou hors ligne, l’application est désactivée. Un aperçu d’import publié distant exige le serveur et ne se replie pas sur le miroir ; l’export distant demeure, lui, explicitement fondé sur le miroir.

#### Renommer une variante — local, GitLab et WebDAV

Cliquez sur un pseudonyme dans la table, saisissez le nouveau libellé, puis **Préparer l’inventaire**. Celui-ci distingue les annotations à renommer, celles masquées, les exceptions, autres variantes, décisions indépendantes et occurrences en attente. Dépliez **Décisions liées** pour examiner les positions et libellés concernés. Un pseudo déjà partagé par une autre règle est signalé, sans fusionner les identités.

Les fichiers doivent être au format actuel ; une source absente, une décision incohérente ou une collision avec une mémoire locale indépendante bloque la préparation. **En local**, fermez tous les entretiens en édition ; toute modification d’un fichier depuis l’inventaire impose un recalcul et une nouvelle confirmation. **Sur GitLab ou WebDAV**, une session ouverte sur une cible la diffère, tandis que les entretiens étrangers au changement restent disponibles.

Cochez la confirmation, puis **Confirmer le renommage global**. Seuls les usages textuels déjà pseudonymisés, liés à la règle et portant l’ancienne variante changent, y compris les usages masqués. Les exceptions, autres variantes, décisions indépendantes, mémoires locales et libellés de locuteurs restent intacts. Aucune occurrence en attente n’est appliquée. **Annuler** ou Échap ferme le dialogue sans écriture avant publication.

**En local**, en cas d’interruption, rouvrez le corpus : son journal durable reprend l’intention sans rejouer les fichiers acquis ni écraser une modification concurrente. Ce n’est pas une action annulable du Journal utilisateur.

**Sur GitLab**, l’inventaire lit tous les entretiens à partir d’un commit publié, jamais du miroir. **Seuls les entretiens concernés sont verrouillés pour leur publication** : les autres peuvent rester ouverts et être modifiés. Le renommage n’a plus de limite de 124 membres ; des bornes de volume restent applicables.

La nouvelle variante est publiée dans la définition, puis les décisions consenties sont renommées entretien par entretien. **Le lot n’est pas atomique** : une cible tenue ou modifiée est différée et les autres succès restent acquis. Les anciens choix restent lisibles pendant un lot incomplet ; une sauvegarde actuelle ne peut pas réintroduire involontairement un ancien choix lié après son remplacement.

Le dialogue **Lot GitLab à reprendre** affiche les publications acquises et les cibles restantes. Cliquez sur **Recalculer la reprise**, examinez le nouvel inventaire, puis confirmez à nouveau. Un nouvel usage découvert n’est jamais modifié sans ce consentement. Une publication inconnue est réconciliée sans rejouer son commit. Si le suivi est indisponible, cliquez sur **Relire le suivi GitLab** avant de continuer. Si seul le miroir n’a pas pu être installé, **rouvrez le corpus pour tirer le serveur, sans rejouer le renommage**. Les anciens clients et écritures directes de l’API ne sont pas couverts par ce protocole.

**Sur WebDAV/Nextcloud**, l’aperçu lit tous les membres du **serveur**, jamais le miroir. La définition est publiée d’abord, puis les seuls entretiens consentis, avec verrous courts et PUT conditionnels. Le groupe **n’est pas atomique** : les succès sont acquis, les cibles tenues ou modifiées différées. Le dialogue **Lot WebDAV à reprendre** affiche le suivi ; **Recalculer la reprise** demande un inventaire frais puis une nouvelle confirmation, sans ajouter implicitement les usages découverts. **Relire le suivi WebDAV** est obligatoire si son état est indisponible. Fermer le dialogue n’annule pas les publications acquises.

Une réponse perdue ne provoque pas un second PUT si l’image publiée est reconnue. Si son issue reste inconnue, **aucun rejeu ni forçage de verrou n’est proposé** : relire l’original ne prouve pas le refus du premier envoi. Après relance, même un verrou persistant du même compte n’est pas supposé disponible ; faites examiner les autres postes et le serveur. Une panne du miroir après publication nécessite réouverture et tirage, pas un nouveau renommage.

Une sauvegarde ordinaire de session peut elle aussi rester indéterminée et bloquer le changement de définition. Fermez le dialogue et utilisez **Actualiser dans le bandeau du corpus** pour relire le serveur. Une publication reconnue n’est pas rejouée ; une autosave locale plus récente reste à publier. Si l’issue ou le verrou ne peuvent pas être prouvés, le blocage reste en place. Les choix liés déjà publiés restent lisibles, mais un nouveau choix doit utiliser la variante actuelle ; ni locuteurs ni `Personne` ne sont synchronisés.

#### Dissocier une règle — local, GitLab et WebDAV

**Dissocier** retire la règle du corpus, mais conserve les pseudonymes et les exceptions dans chaque entretien concerné. Chaque entretien garde aussi tous les noms, variantes de pseudonyme et catégorie de la règle, même ceux qui n’étaient pas utilisés. Vous pouvez ensuite les gérer séparément dans chaque entretien. Le texte, les autres règles, vos choix indépendants et les locuteurs ne changent pas.

Cliquez sur l’icône fichier **📄 (Dissocier)** dans la colonne Actions. **En local, le bilan s’affiche automatiquement.** Sur GitLab ou WebDAV, cliquez sur **Préparer la dissociation globale**. Examinez les entretiens concernés ; **Voir les passages concernés** affiche les détails si vous le souhaitez. Cochez votre confirmation puis **Confirmer la dissociation globale**. **Annuler** ne modifie rien. Une règle inutilisée est simplement retirée du corpus.

Depuis l’entretien, le choix **Entretien 📄** propose d’abord d’enregistrer et de fermer votre édition, puis ouvre ce même dialogue. La dissociation concerne l’ensemble des entretiens utilisant la règle, pas seulement celui que vous venez de fermer.

Si des choix enregistrés séparément dans un entretien concernent déjà les mêmes noms, le dialogue vous indique lesquels vérifier. Ils ne sont jamais remplacés automatiquement. Si un entretien est encore ouvert en modification, fermez-le puis fermez et rouvrez le dialogue.

**En cas d’interruption locale, rouvrez le corpus** pour terminer ce qui reste. Les changements déjà enregistrés sont conservés. Si une vérification empêche de continuer, ne relancez pas l’opération ; demandez de l’aide avec les **Informations pour l’assistance**. Cette action n’est pas annulable depuis le Journal.

**Sur GitLab et WebDAV**, les entretiens sont mis à jour l’un après l’autre. Le suivi indique l’avancement et les entretiens restant à modifier. Si le serveur ne confirme pas le résultat, utilisez **Relire le suivi GitLab** ou **Relire le suivi WebDAV** avant de continuer. Utilisez ensuite **Recalculer la reprise**, examinez le nouveau bilan et confirmez-le. Vous ne confirmez jamais de nouveaux entretiens sans les avoir vus. Si la règle est déjà retirée mais que votre copie n’est pas à jour, seule la lecture du suivi est proposée.

Sur GitLab, cette version ne permet pas une dissociation nécessitant plus de **248 entretiens transférés encore présents dans le corpus**. Le dialogue bloque alors la confirmation ; il ne découpe pas automatiquement l’opération.

Le passage d’une règle corpus vers un brouillon reste indisponible.

#### Supprimer une règle partout — local, GitLab et WebDAV

**Supprimer partout** retire la règle du corpus et les pseudonymisations et exceptions qui en dépendent dans les entretiens. Les autres règles, vos choix indépendants, les noms et pseudonymes enregistrés séparément et les locuteurs sont conservés.

Le texte d’origine n’est pas modifié. Il redevient visible là où aucun autre choix ne le pseudonymise. Un autre choix peut donc continuer à masquer certains passages. Les choix indépendants qui redeviennent visibles sont signalés dans le bilan.

Cliquez sur la croix rouge **✖ (Supprimer partout)**. **En local, le bilan s’affiche automatiquement.** Sur GitLab ou WebDAV, cliquez sur **Préparer la suppression globale**. Vérifiez les entretiens concernés, consultez au besoin **Voir les passages concernés**, cochez votre confirmation puis **Confirmer la suppression globale**. **Annuler** ne change rien. Si un entretien est encore ouvert en modification, fermez-le puis fermez et rouvrez le dialogue.

**Cette suppression ne peut pas être annulée depuis le Journal.** En cas d’interruption, fermez le dialogue puis **rouvrez le corpus** pour vérifier ce qui a été enregistré avant toute nouvelle suppression. Les changements déjà enregistrés sont conservés. Si vous ne pouvez pas continuer, demandez de l’aide avec les **Informations pour l’assistance**.

À la différence de la suppression, **Dissocier** conserve les pseudonymes et les exceptions pour les gérer séparément dans chaque entretien.

**Sur GitLab et WebDAV**, les entretiens sont traités l’un après l’autre. Un entretien occupé ou modifié peut rester à traiter ; les suppressions déjà enregistrées sont conservées. Utilisez **Relire le suivi GitLab** ou **Relire le suivi WebDAV** pour vérifier l’avancement, puis **Recalculer la reprise**, examinez le nouveau bilan et confirmez-le. De nouveaux entretiens ne sont jamais ajoutés à votre accord sans vous être présentés. Tant que le résultat reste incertain ou que votre copie n’est pas à jour, seule la relecture est proposée. Après une réouverture, un droit encore détenu par un autre poste n’est jamais forcé.

La finalisation GitLab est limitée à **248 entretiens traités encore présents dans le corpus** ; le dialogue refuse un lot plus grand, sans découpage automatique. Il ne s’agit pas d’une limite au nombre d’entretiens du corpus.

**Sur WebDAV aussi**, une interruption n’autorise ni à répéter les retraits déjà enregistrés ni à forcer un verrou. Rouvrez le corpus, relisez le suivi puis confirmez un nouveau bilan pour les entretiens restants.
