# Documentation utilisateur V2 — cadrage et suivi de rédaction

Référence : [plan de refonte](plan-documentation-utilisateur-v2.md).

Le lancement du travail a été accepté. Le présent document fixe une base de
rédaction. Les pilotes ont été relus et acceptés ; le support choisi ensuite est
le HTML direct, ouvert dans le navigateur, sans conversion Markdown.

## 1. État d’avancement

- Lot 1 : inventaire, sommaire détaillé, règles éditoriales et points de contrôle établis.
- Lot 2 : trois pages pilotes et sept réponses FAQ rédigées ; parcours locaux
  exécutés dans l’application, trois captures V2 produites.
- Relecture utilisateur des pilotes : **acceptée**.
- Lot 3 : **réalisé en HTML statique**, navigation hors ligne et paquet Linux vérifiés.
- Lot 4 : **sous-lots rédigés et vérifiés localement**, à relire : présentation,
  découverte des exemples, import, gestion des entretiens, correction, locuteurs,
  organisation des thèmes, variables, saisie des données et notes. Douze chapitres
  et trente-deux réponses FAQ sont disponibles.
- Import Word/PDF : **ajouté à la demande de l’utilisateur**, selon le principe V1 ;
  sélection, dépôt et paquet Linux vérifiés, documentation et capture actualisées.
- Imports repris de Whispurge : **TXT tabulé et noms SRT ajoutés et vérifiés** ;
  cinq exemples SRT/TXT du guide testés, sans durée inventée pour le dernier passage.
- Locuteurs : **chapitre T04 rédigé et vérifié**, deux captures V2 et cinq réponses FAQ ;
  correction du rafraîchissement des couleurs et ajout demandé des statistiques,
  des durées estimées et de la navigation dans les prises de parole.
- Thèmes : **chapitre T07 rédigé et vérifié**, capture V2 et trois réponses FAQ ;
  descriptions, hiérarchie, apparence, désactivation et suppression. Aucun changement applicatif.
- Données : **chapitre T09 rédigé et vérifié**, deux captures V2 et quatre réponses FAQ ;
  correction ciblée du branchement d’import des modèles dans le preload.
- Export CSV de la table : **ajouté à la demande de l’utilisateur**, colonnes visibles,
  privées sur choix explicite, trois scénarios de recette et capture actualisée.
- Notes : **chapitre T10 rédigé et vérifié**, deux captures V2 et quatre réponses FAQ ;
  catégories, enregistrement, statuts, consultation et export Markdown. Aucun changement applicatif.
- `markdown-it` et ses types : retirés ; aucun nouveau lecteur Electron ou Vue.
- Accueil et fichiers utilisateur préexistants : **inchangés**.

**Prochaine rédaction : T11 — Commenter un passage**, puis pseudonymisation et export
d’entretien. Les derniers contrôles sont ceux des notes (section 18) : 91 tests ciblés,
9 scénarios Electron locaux et 4 scénarios dans le paquet Linux.
L’installation attend les liens de diffusion ; la sauvegarde attend un essai de
restauration. Les procédures distantes et les paquets Windows/macOS restent à qualifier.
Le plan et ce suivi sont regroupés dans `plans/encours/`.

Les nouveaux textes se lisent depuis [le sommaire HTML](../../docs/user/index.html),
ou depuis le menu Aide de SonalPi. Les huit textes antérieurs sont identifiés
séparément dans le [README du dossier](../../docs/user/README.md) et ne sont pas
copiés dans le paquet documentaire.

## 2. Cadre éditorial retenu pour les pilotes

### Public et ton

- Une personne qui mène une étude qualitative, sans présumer de compétence technique.
- Vouvoiement ; phrases courtes ; titres orientés tâche.
- Expliquer d’abord l’utilité, puis l’action et son résultat.
- Employer les noms visibles dans l’interface : **Thématiques** dans l’entretien,
  **Thèmes** dans la vue corpus ; ne pas uniformiser au prix d’un faux libellé.
- Employer « thème » pour la notion, « codage » pour son association à un passage.
- Introduire les autres notions au moment où elles servent. Ne pas exiger une
  connaissance préalable des cas, recueils ou attributs pour commencer à coder.
- Ne pas reprendre les identifiants, modèles de fichiers ou mécanismes de
  publication dans les explications courantes.

### Format des pages

1. But et exemple concret.
2. Prérequis, uniquement s’ils sont nécessaires.
3. Chemin d’accès et étapes numérotées.
4. Résultat attendu et conservation du travail.
5. Précaution ou difficulté courante, si utile.
6. Deux ou trois liens voisins et retour au sommaire.

Une page d’orientation peut remplacer les étapes par une carte des notions et
des espaces. Les précautions sur les données ne sont pas cachées dans des détails.
Une FAQ répond en quelques phrases et renvoie à la page de référence.

### Fil rouge et illustrations

Utiliser le terrain fictif fourni sur l’aide aux devoirs dans les associations.
Pour le premier codage, choisir **Entretiens déjà importés**, entretien
**1Coordinatrice**, et créer **Engagement bénévole**. Ce point de départ évite
d’exiger un import avant de lire le pilote et ne suppose pas un thème déjà existant.

Le nom de projet de l’exemple de création est **Enquête dans les associations** ;
son dossier est **Enquete-associations**. La distinction sert à expliquer les Récents.

Les illustrations sont de vraies captures V2, recadrées sur le contenu utile,
sans montage des commandes ni données réelles. Aucun média V1 n’est recopié.
Quinze illustrations V2 accompagnent les chapitres disponibles.

## 3. Sommaire détaillé et registre des pages

Les chemins ci-dessous sont relatifs à `docs/user/`. Ils désignent des destinations
de rédaction, pas des liens vers des fichiers déjà créés. Le sommaire utilisateur
ne donne de liens que vers les textes effectivement disponibles.

États : **À rédiger** ; **Rédigé et vérifié localement, à relire** ;
**Pilote vérifié localement et accepté**. La validation
éditoriale et la qualification d’une procédure distante sont distinctes d’une
simple lecture du code ou d’un essai local. Les pages sont désormais écrites
directement en HTML, avec `style.css` comme présentation commune.

### Découvrir et démarrer

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| A01 | Présenter SonalPi — `demarrer/presentation.html` | V1 introduction ; fonctions présentes, absence de transcription automatique et précautions de confidentialité. | Rédigé et vérifié localement, à relire |
| A02 | Comprendre les notions et se repérer — `demarrer/se-reperer.html` | V1 introduction, V2 navigation ; distinguer changer d’espace et fermer l’entretien. | Pilote vérifié localement et accepté |
| A03 | Installer et mettre à jour — `demarrer/installation.html` | V1 installation ; vérifier liens publics, paquets distribués et parcours par système. | À rédiger |
| A04 | Choisir un parcours ou un exemple — `demarrer/exemples-parcours.html` | V2 découverte ; installation, copies distinctes, reprise, pause et remise à zéro. | Rédigé et vérifié localement, à relire |
| A05 | Créer et retrouver un corpus local — `demarrer/corpus-local.html` | V1 projet ; création, dossier existant, récents, retrait et réouverture. | Pilote vérifié localement et accepté |
| A06 | Retrouver ses fichiers, sauvegarder et déplacer — `demarrer/sauvegarder-deplacer.html` | V1 projet/entretiens, archive V2 ; vérifier contenu natif, médias externes et restauration. | À rédiger |

### Préparer et suivre

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| P01 | Organiser le tableau de bord — `preparer/tableau-de-bord.html` | V2 vue-corpus, doc développeur ; cellules, structure, badges et sauvegarde. | À rédiger |
| P02 | Réunir les documents du projet — `preparer/documents-projet.html` | V2 docs-cadre ; ajout, navigation, aperçus et limites local/distant. | À rédiger |
| P03 | Utiliser les modèles fournis — `preparer/documents-exemples.html` | V2 docs-cadre ; consultation et enregistrement d’une copie sans modification du modèle. | À rédiger |

### Importer et traiter

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| T01 | Préparer et importer une transcription — `traiter/importer.html` | V1 entretiens ; formats acceptés, exemples SRT/TXT testés, locuteurs et contrôle du résultat. | Rédigé et vérifié localement, à relire |
| T02 | Gérer les entretiens et leurs médias — `traiter/gerer-entretiens.html` | V1 entretiens ; nom, tri, suppression, références audio/vidéo et réassociation. | Rédigé et vérifié localement, à relire |
| T03 | Relire et corriger un entretien — `traiter/corriger.html` | V1 édition ; enregistrement, texte/média, repères et raccourcis réellement actifs. | Rédigé et vérifié localement, à relire |
| T04 | Identifier les locuteurs et les tours de parole — `traiter/locuteurs.html` | V1 locuteurs ; noms, rôles, attribution, suppression, pseudo et rapprochements. Statistiques et navigation ajoutées, durées estimées et limites explicites. | Rédigé et vérifié localement, à relire |
| T05 | Relier une personne entre plusieurs entretiens — `traiter/personnes.html` | V2 vue-corpus ; création, association, corrections et conséquences. | À rédiger |
| T06 | Coder un premier passage avec un thème — `traiter/premier-codage.html` | V1 catégories/codage ; création de thème, sélection, pose, retrait et réouverture. | Pilote vérifié localement et accepté |
| T07 | Organiser et documenter ses thèmes — `traiter/organiser-themes.html` | V1 catégories, V2 vue-corpus ; hiérarchie, descriptions, couleurs, activation et suppression. | Rédigé et vérifié localement, à relire |
| T08 | Réorganiser les codages — `traiter/reorganiser-codages.html` | V2 vue-corpus ; transfert/fusion/division, aperçu, reprise et différences fournisseurs. | À rédiger |
| T09 | Définir les variables et saisir les données — `traiter/donnees.html` | V1 base de données, V2 table ; portée, modalités, confidentialité, saisie, lots et export CSV. | Rédigé et vérifié localement, à relire |
| T10 | Écrire et consulter des notes — `traiter/notes.html` | V1 notes, V2 vue-corpus ; catégories partagées, enregistrement, statuts, consultation et export Markdown filtré. | Rédigé et vérifié localement, à relire |
| T11 | Commenter un passage — `traiter/commentaires.html` | V2 entretien ; sélection, auteur, édition, retrait et export. | À rédiger |
| T12 | Pseudonymiser et vérifier un entretien — `traiter/pseudonymiser.html` | V1 pseudonymisation, V2 vue-corpus ; règles, occurrences, variantes, exceptions et contrôle. | À rédiger |
| T13 | Revenir sur une modification — `traiter/annuler-restaurer.html` | V2 journaux et sauvegardes ; vérifier précisément les opérations annulables et leur portée. | À rédiger |

### Analyser et interpréter

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| N01 | Rechercher dans les entretiens — `analyser/rechercher.html` | V2 recherche ; distinguer recherche corpus et recherche/remplacement d’entretien. | À rédiger |
| N02 | Rassembler des passages avec Tri et synthèse — `analyser/tri-synthese.html` | V2 synthese ; critères, calcul, extraits, copie, export et retour à la source. | À rédiger |
| N03 | Explorer les mots avec Lexico — `analyser/lexico.html` | V2 lexico ; index, filtres, concordances, bilan et export. | À rédiger |
| N04 | Adapter le traitement lexical — `analyser/traitement-lexical.html` | V2 lexico ; mots outils, regroupements, concaténations et annulation. | À rédiger |
| N05 | Comparer avec les analyses croisées — `analyser/analyses-croisees.html` | Doc développeur et outil V2 ; mesures, critères et retour aux passages. | À rédiger |
| N06 | Vérifier et interpréter les résultats — `analyser/verifier-resultats.html` | V2 outils/parcours ; filtres, sources manquantes, péremption et précautions d’interprétation. | À rédiger |

### Organiser et exporter

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| O01 | Constituer et consulter un cas — `organiser/cas.html` | V2 cas/vue-corpus ; cas vide, personne, passage, entretien entier, fiche et suppression. | À rédiger |
| O02 | Construire des familles et des attributs de cas — `organiser/familles-attributs.html` | V2 cas ; règles, création en lot, actualisation et avertissements. | À rédiger |
| O03 | Composer un recueil — `organiser/recueils.html` | Doc développeur et outil V2 ; structure, citations, liaison, actualisation et export. | À rédiger |
| O04 | Associer un passage et retrouver ses utilisations — `organiser/associations-passages.html` | V2 vue-corpus ; ajouts contextuels, associations, chevauchements et retour. | À rédiger |
| O05 | Exporter un entretien — `organiser/exporter-entretien.html` | V1 export, export V2 ; contenu effectif et options propres à chaque format. | À rédiger |
| O06 | Exporter un lot d’entretiens — `organiser/exporter-corpus.html` | Doc développeur et outil V2 ; sélection, options, rapport, erreurs et annulation. | À rédiger |
| O07 | Transférer vers QualCoder — `organiser/qualcoder.html` | V2 cas, doc développeur ; sources, cas, attributs, limites et données non pseudonymisées. | À rédiger |
| O08 | Vérifier les données avant diffusion — `organiser/verifier-partage.html` | V2 sorties ; texte, notes, variables privées, médias originaux et rapport sensible. | À rédiger |

### Travailler à plusieurs et migrer

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| E01 | Choisir local ou distant — `travailler-ensemble/choisir.html` | V2 distant ; emplacement des données, droits, limites et travail hors ligne. | À rédiger |
| E02 | Créer, partager et ouvrir sur Nextcloud — `travailler-ensemble/nextcloud.html` | V2 corpus-distant ; accès, création, partage du dossier et ouverture par un collègue. | À rédiger |
| E03 | Préparer et ouvrir sur GitLab — `travailler-ensemble/gitlab.html` | V2 corpus-distant ; projet, branche, OAuth/jeton, accès et médias. | À rédiger |
| E04 | Travailler au quotidien à plusieurs — `travailler-ensemble/quotidien.html` | V2 multi-utilisateur ; droits, badges, enregistrement/publication et fermeture. | À rédiger |
| E05 | Retrouver les médias du corpus partagé — `travailler-ensemble/medias.html` | V2 textes contradictoires ; vérifier chaque configuration et la lecture audio/vidéo. | À rédiger |
| E06 | Reprendre après une interruption — `travailler-ensemble/reprendre.html` | V2 multi-utilisateur ; coupure, réponse inconnue, conflit et travail conservé. | À rédiger |
| M01 | Migrer un corpus local V1 — `migration/local-v1.html` | V2 migration ; bilan, destination, contenu repris, médias référencés et contrôle final. | À rédiger |
| M02 | Migrer un corpus GitLab V1 — `migration/gitlab-v1.html` | V2 migration/corpus-distant ; destination, copies médias, Autres, interruption et reprise. | À rédiger |

### Questions et vocabulaire

| ID | Page et chemin cible | Source principale ; contrôle à réaliser | État |
| --- | --- | --- | --- |
| F01 | Questions sur les premiers pas — `faq/premiers-pas.html` | Vingt-sept réponses liées aux chapitres ; ne pas dupliquer leurs procédures. | Sept réponses acceptées ; vingt nouvelles à relire |
| F02 | Questions sur les fichiers, exports et confidentialité — `faq/fichiers-partage.html` | Alimenter lors de A06, T12 et O05–O08. | À rédiger |
| F03 | Questions sur les analyses — `faq/analyses.html` | Alimenter lors de N01–N06. | À rédiger |
| F04 | Questions sur le collectif et la migration — `faq/collectif-migration.html` | Alimenter lors de E01–M02, après recettes réelles. | À rédiger |
| G01 | Glossaire — `glossaire.html` | Reprendre les définitions courtes de A02 puis compléter sans créer un cours technique. | À rédiger |

## 4. Matrice d’adaptation des sous-sections V1

Source : branche `main` du dépôt V1, commit `e8bebf9`, dossier `Tutos/`.
Les noms des fichiers sont conservés ci-dessous, y compris la numérotation
historique qui saute de `06-3` à `06-5`.

Actions : **Adapter** conserve l’intention pédagogique mais vérifie les gestes ;
**Réécrire** remplace une explication devenue inadéquate ; **Écarter** ne reprend
pas l’élément tel quel. Toutes les captures V1 sont écartées des pages V2.

| Fichier V1 et sous-section | Action et destination | Point de contrôle V2 |
| --- | --- | --- |
| `00-introduction` : Qu’est-ce que Sonal ? | Adapter → A01, A02. | Fonctions disponibles ; ne pas promettre une transcription automatique intégrée. |
| Fonctionnalités principales | Adapter → A01. | Ajouter les usages V2, distinguer fichiers gérés et médias référencés. |
| Confidentialité des données | Réécrire → A01, E01, O08. | Ne pas affirmer « aucune donnée sur les réseaux » pour tous les usages. |
| `01-installer` : Télécharger l’exécutable | Réécrire → A03. | URL de diffusion V2, version et installateurs réellement disponibles. |
| Télécharger le code source | Écarter de la procédure courante → A03 en complément éventuel. | Ne pas renvoyer à un miroir privé comme source publique de téléchargement. |
| Compatibilité | Réécrire → A03. | Vérifier chaque système ; ne pas conseiller de contourner une protection sans contexte. |
| `02-projet` : Introduction au corpus | Adapter → A02, A05. | Cadre commun conservé ; modèle `.crp` remplacé par le dossier V2. |
| Créer un nouveau projet / définir le répertoire / nommer | Réécrire → A05. | Dossier dédié, nom proposé, ouverture existante et premier espace affiché. |
| Ouvrir un corpus / récents | Adapter → A05. | Nom de dossier dans la liste, raccourci et mémoire de navigation. |
| Ouvrir un corpus local | Réécrire → A05. | Sélectionner un dossier, pas un `.crp`. |
| Ouvrir un corpus distant | Réécrire → E02, E03. | Parcours Nextcloud et GitLab distincts. |
| Encadré sauvegarde et fichiers référencés | Réécrire → A06. | Données natives, médias et restauration ; pas de promesse sur une copie partielle. |
| `03-entretiens` : Texte, audio, vidéo | Réécrire → T01, T02. | La vidéo n’est plus à présenter seulement comme une fonction future. |
| Comment ajouter les entretiens | Adapter → T01. | Emplacement du bouton, assistant et dépôt de fichiers réellement disponibles. |
| Formats audio et texte | Réécrire → T01, T02. | Vérifier extensions et capacités de lecture/import, pas seulement une liste V1. |
| Structures texte de type 1/type 2 et sous-titres | Adapter → T01. | Rejouer les exemples pour vérifier locuteurs et repères temporels. |
| Le fichier `.Sonal` / rechargement | Réécrire → A06, O05, M01. | Ne pas présenter l’HTML V1 comme le stockage natif V2 ni conseiller de réimporter pour rouvrir. |
| Gérer / renommer un entretien | Adapter → T02. | Édition du titre et résultat enregistré. |
| Supprimer un entretien | Réécrire → T02. | Confirmer destination des fichiers, médias intacts et possibilités de restauration. |
| Ajouter ou modifier le fichier son | Adapter → T02, E05. | Référence locale versus média partagé et réglage propre au poste. |
| Trier les entretiens | Réécrire → T02. | Critères disponibles, contraintes distantes et persistance. |
| Affichage proportionnel des entretiens | Adapter si disponible → T02. | Ne pas confondre longueur de transcription et durée audio. |
| `04-bdd` : Pourquoi décrire les entretiens/répondants | Adapter → T09. | Distinguer portée entretien/locuteur et personnes du corpus. |
| Accéder à la base de données | Réécrire → T09. | Onglet Données, vue corpus et entretien. |
| Ajouter une variable / libellé | Adapter → T09. | Commandes actuelles et validation du nom. |
| Champ de la variable | Adapter → T09. | Portée entretien ou locuteur et ordre des colonnes. |
| Niveau de publicité | Réécrire → T09, O08. | Confidentialité par sortie ; éviter une garantie universelle sur toutes les exportations. |
| Ajouter des modalités / ordre | Adapter → T09. | Saisie directe, `autre…` et création vérifiés ; aucune commande de réorganisation des modalités proposée dans l’édition actuelle. |
| Modèle de variable préconçu | Adapter si disponible → T09. | Vérifier les modèles V2 au lieu de recopier les exemples V1. |
| Position de la variable | Réécrire → T09. | Colonnes groupées par portée et sélection de visibilité ; pas de commande V2 de réordonnancement des définitions à recopier de la V1. |
| Modifier / supprimer une variable | Réécrire → T09. | Impacts sur les valeurs, confirmation et limites fournisseurs. |
| Exporter la base de données | Réécrire → T09, O08. | CSV des colonnes affichées ajouté après T09, avec privées exclues par défaut ; le modèle JSON reste distinct des réponses et de la sauvegarde. |
| `05-categories` : Surligneurs, thèmes et importance | Adapter → T06, T07. | Ne pas réduire les thèmes à des couleurs ; présenter les Pondérations sans les imposer. |
| Catégories proposées par défaut / crayon | Adapter → T06, T07. | Corpus neuf et corpus migré n’ont pas nécessairement les mêmes thèmes. |
| Code numérique à trois chiffres | Écarter du manuel courant. | Les identifiants ne sont pas une tâche utilisateur. |
| Libellé et astuce `//` | Réécrire → T07. | La V2 possède une description explicite ; vérifier la reprise des anciens libellés. |
| Rang et organisation hiérarchique | Réécrire → T07. | Expliquer parents et sous-thèmes, pas l’algorithme V1 des rangs. |
| Couleur / taille de police | Adapter → T07. | Effet sur les passages, pas sur le nom du thème dans le panneau. |
| Clones / enfants | Réécrire → T07. | `+ enfant` crée un sous-thème réglé séparément ; aucune commande de clonage présentée dans la fenêtre V2. |
| Modifier / déplacer une catégorie | Adapter → T07. | Déplacement dans la fratrie ou vers un autre parent. |
| `06-modification` : Correction, codage et pseudonymisation | Adapter → T03. | Présenter des tâches complémentaires sans imposer l’ancien fonctionnement des modes. |
| Accéder à la fenêtre d’édition | Adapter → T03, T06. | Crayon de la carte ; distinguer sélectionner et ouvrir un entretien. |
| `06-1-fonctionnement` : Texte et audio synchronisés | Adapter → T03. | Qualité des repères et comportements de navigation V2. |
| Contrôle lecteur / espace / double espace | Réécrire → T03. | Tester les raccourcis selon le focus et le système. |
| Différents modes | Réécrire → A02, T03. | Onglets et fonctions V2 réellement présents. |
| `06-2-mode-edition` : Corriger le texte | Adapter → T03. | Sélection, saisie, suppression, ajout et repères. |
| Bouton vert / Entrée pour confirmer | Réécrire → T03, T13. | Ne pas recopier la validation périodique V1 ; distinguer enregistrement et publication. |
| Coordonnées temporelles | Adapter → T03. | Manipulations et conséquences sur la synchronisation. |
| `06-3-mode-locuteurs` : Renommer | Adapter → T04. | Renommage local versus personne partagée du corpus. |
| Identifier l’interrogateur avec `?` | Réécrire → T04. | Contrôler le rôle enquêteur et ses effets sur les analyses. |
| Ajouter / supprimer un locuteur | Adapter → T04. | Sort des paroles déjà attribuées et messages de confirmation. |
| Affecter un passage | Adapter → T04. | Sélection multi-mots et multi-paragraphes. |
| Statistiques de tours de parole | Adapter → T04 ; ajout demandé réalisé. | Bouton Statistiques : tours, mots, parts et durées estimées sans extrapolation ni silences repérés attribués ; section 17. |
| Naviguer dans les prises de parole | Adapter → T04 ; ajout demandé réalisé. | Suivante parcourt cycliquement les tours d’une voix et cale le lecteur si possible ; section 17. |
| `06-5-mode-categories` : Sélectionner à la souris | Adapter → T06. | Sélection V2 et extension aux mots entiers. |
| Premier clic / survol / dernier clic | Écarter du pilote ; vérifier avant toute reprise → T06. | Ne pas décrire la sélection spéciale V1 comme le geste ordinaire V2. |
| Choisir une ou plusieurs catégories | Réécrire → T06. | Un clic pose, un autre retire sur la même plage exacte. |
| Mur de catégories | Écarter de T07 en l’état. | Aucune commande correspondante dans les panneaux et l’édition V2 examinés ; pas de procédure reprise de la V1. |
| Sortir de la portion catégorisée | Réécrire → T06. | Pas de confirmation additionnelle du codage ; sélectionner ensuite un autre passage. |
| Superposer plusieurs codages | Adapter → T06. | Plusieurs thèmes par passage et chevauchements conservés. |
| Modifier une catégorisation | Réécrire → T06, T13. | Retrait sur plage identique ou commande contextuelle, pas simple reproduction du clic V1. |
| `06-6-notes` : Notes et mémos | Adapter → T10. | Multiples notes, catégories distinctes des thèmes, Concerne, consultation corpus et export Markdown vérifiés. |
| Validation avec l’entretien | Réécrire → T10. | Valider dans la fenêtre de saisie ; enregistrement direct dans la feuille de l’entretien. Annuler ne revient pas sur les catégories partagées. |
| `06-7-base-donnees` : Saisir et ajouter une modalité | Adapter → T09. | Ne pas refaire une seconde page autonome qui duplique la saisie corpus. |
| Ajouter/éditer des variables depuis l’entretien | Adapter → T09. | Définition commune au corpus, effets sur les autres entretiens. |
| `06-8-pseudonymisation` : Ajouter des pseudonymes | Réécrire → T12. | Table corpus, occurrences et texte original préservé ; vérifier les règles V2. |
| Ajouter des exceptions (inachevé) | Réécrire → T12. | Compléter par une procédure vérifiée et ses limites. |
| `06-9-export` : Bouton et formats | Réécrire → O05. | Options par format, données sensibles et distinction avec une sauvegarde. |
| `index.html`, CSS, polices et navigation V1 | Écarter comme support technique ; conserver l’intention du sommaire. | HTML direct et style commun V2, sans dépendance de rendu. |

## 5. Répartition des huit textes utilisateur actuels

Les sources se trouvent encore à leur emplacement d’origine dans `docs/user/`.
Aucune ligne de ces fichiers n’a été supprimée ou transformée en nouvelle vérité
sans contrôle. Les destinations sont les ID du sommaire ci-dessus.

| Source et sous-section | Destination / traitement | Contrôle particulier |
| --- | --- | --- |
| `vue-corpus` : ouverture, quatre espaces, mémoire et retours | A02 ; N06 pour les retours d’analyse. | Éviter les détails de pile ; distinguer fermeture et changement d’espace. |
| Découverte guidée, démos et exploration libre | A04. | Vérifier nombre d’étapes et comportement courant, pas ceux d’un ancien plan. |
| Cartes, recherche et accès aux outils | A02, T02, N01. | Descriptions séparées par tâche. |
| Ajouter un passage à un cas ou à un recueil | O04. | Confirmation sans navigation forcée et annulation sans écriture. |
| Voir les utilisations du passage | O04. | Inclusion exacte/englobante/chevauchante, plusieurs occurrences et vérification incomplète. |
| Chargement et actualisation | N06, E04. | Dernier résultat lisible versus résultat complet et à jour. |
| Thèmes : transfert, fusion, division et reprises | T08. | Local, WebDAV et GitLab à qualifier séparément. |
| Notes | T10. | Deux modes d’enregistrement, consultation, statuts sans restriction d’accès personnelle, copie et export des notes filtrées. |
| Personnes | T05. | Associations entre entretiens, renommage et corrections. |
| Cas | O01. | Fusionner avec `cas.md`, ne pas maintenir une seconde description. |
| Annuler une modification de personnes | T05, T13. | Limites des annulations et portées. |
| Données | T09. | Fusionner avec les procédures issues de la V1. |
| Pseudonymisation et tables de correspondance | T12, O08. | Séparer usage simple, gestion des règles et confidentialité. |
| Renommer une variante / dissocier / supprimer une règle partout | T12, E04, E06. | Impacts et reprises par fournisseur, pas d’explication principale en termes de transactions. |
| `docs-cadre` : présentation / contenu jamais modifié | P02, P03. | Distinguer consulter, ouvrir ailleurs et modifier. |
| Corpus local / sous-dossiers / ajout | P02. | Copie du fichier, homonymes, dépôt et opérations réservées au gestionnaire de fichiers. |
| Aperçus et formats | P02. | Formats réellement prévisualisés et limites ; ne pas confondre stockage et aperçu. |
| Documents exemples | P03. | Modèles en lecture seule et copie utilisateur. |
| Corpus distant | P02, E02. | Consultation Nextcloud et absence sur GitLab à revérifier. |
| Fichiers cachés et exclusions | P02 en difficulté courante si nécessaire. | Ne pas encombrer l’initiation avec l’inventaire technique. |
| `synthese` : procédure, vues et contexte | N02. | Exemple concret et retour à la source. |
| Texte original / résultat périmé ou incomplet | N02, N06, O08. | Diffusion et possibilités d’export/navigation. |
| `lexico` : lire l’index et concordances | N03. | Ce qui est compté et ce qui relève du contexte. |
| Limiter les matériaux | N03. | Sans restriction versus sélection explicite, rôles enquêteurs et intersection des critères. |
| Traitement lexical | N04. | Mots outils, regroupements, concaténations et annulation. |
| Bilan / exporter | N03, N06, O08. | Bilan public, champs privés, tableau affiché et destination locale/distante. |
| `cas` : cas, personne, thème, variable, recueil | A02, O01. | Définitions cohérentes ; ne pas reprendre le tutoiement. |
| Ouvrir / cas vide / depuis une personne | O01. | Conditions de création et règle dynamique. |
| Créer en lot / entretiens entiers | O01, O02. | Séparer débuter et automatiser ; contrôler le périmètre des matériaux. |
| Depuis un passage / exemple des paroles et des passages sur Marie | O01, O04. | Le cas d’une personne n’est pas nécessairement la totalité des passages qui parlent d’elle. |
| Fiche / retrait / suppression / avertissements | O01. | Sources conservées, références retirées et cas incomplets. |
| Famille depuis une variable / compléter / dissoudre | O02. | Effets de mise à jour et absence d’élargissement silencieux. |
| Attributs saisis / dérivés | O02. | Valeur dérivée indisponible versus valeur vide. |
| Export QualCoder | O07. | Source originale, cas résolus, attributs et limites de transfert. |
| `corpus-distant` : création Nextcloud / partage | E02. | Droits du collègue et adresse propre à chaque compte. |
| GitLab : préparer le projet / créer | E03. | Branche, OAuth, jeton et dépôt non initialisé. |
| Médias partagés | E05. | Ne pas conserver la contradiction avec `multi-utilisateur.md`. |
| Migration GitLab | M02. | Harmoniser avec `migration-v1.md`. |
| Opérations sur tout le corpus / quotidien | E04, E06. | Conséquences utilisateur et refus sans écrasement. |
| `multi-utilisateur` : tableau des capacités | E01–E05. | À réétablir depuis le code et les essais, pas à recopier comme contrat actuel. |
| Principe / badges | E04. | Dire qui peut faire quoi ; détail technique facultatif. |
| Publication refusée / divergence | E06. | Fusion et récupération réellement proposées selon le fournisseur. |
| Après un crash / hors ligne | E06. | Travail conservé, actions possibles et cas bloquants ; éviter les garanties générales. |
| Audio distant | E05. | Audio local, serveur et espace externe à distinguer. |
| Table de données : cellule, ligne, colonne | T09, E04. | Portée des lots, exclusions et publication de la session ouverte. |
| Différences GitLab / bonnes pratiques | E03–E06. | Réconcilier avec les fonctions récentes et les essais. |
| `migration-v1` : parcours local / consignes | M01. | Libellés des cartes, original intact et contrôle avant suppression de l’ancienne version. |
| Contenu migré / cas particuliers / non converti | M01, M02. | Expliquer le résultat, pas les champs internes ; vérifier les fichiers absents. |
| Documents conservés dans Autres | M01, M02. | Copie sans conversion et absence de réintégration automatique des anciens résultats. |
| GitLab : nouveau dépôt, médias et reprise | M02. | Destination indépendante, médias copiés et capacités de lecture. |
| Détails techniques | Documentation développeur si encore utiles. | Ne pas les intégrer au parcours courant de migration. |

## 6. Divergences et questions à résoudre

| Sujet | Constat | Décision de rédaction / état |
| --- | --- | --- |
| Médias partagés GitLab | `multi-utilisateur.md` les dit absents ; `corpus-distant.md` et les formulaires les proposent. | Bloquer la généralisation ; vérifier E03/E05 sur banc réel au lot 6. |
| Audio distant | Un texte le décrit exclusivement local, d’autres décrivent médias serveur et espace externe. | Rédiger par configuration ; ne pas fusionner ces affirmations. |
| Carte migration locale | Ancien libellé dans `migration-v1.md`. | Utiliser le libellé actuel lors de M01 ; texte source encore inchangé. |
| Nom dans les Récents | Un essai a montré le nom de dossier, pas le nom de projet. | Expliqué explicitement dans A05 et F01 ; pas de changement d’application dans ce chantier. |
| Sélection/codage V1 | V1 décrit un mode de sélection spécial et une sortie de portion. | Pilote fondé sur sélection à la souris et clic unique ; second clic sur plage exacte = retrait. |
| Validation d’édition V1 | V1 décrit une confirmation périodique avec bouton vert ou Entrée. | Ne pas reprendre ; décrire le véritable enregistrement V2 dans T03. |
| Installation/distribution | Les liens V1 et le miroir CI ne prouvent pas une diffusion publique V2. | A03 attend une vérification des points de téléchargement et des systèmes. |
| Formats de transcription | Écart initial Word/PDF, puis améliorations retrouvées dans Whispurge. | Résolu : extraction DOCX/PDF, TXT tabulé Tadddam/NVivo et préfixes SRT nommés. Cinq exemples du guide testés ; détails en sections 10 et 12. |
| Gestes sur les locuteurs V1 | Crayon, point d’interrogation dans le nom, suppression en vidant le champ et graphiques. | T04 décrit la saisie directe, l’interrupteur Interv. et la croix. Un bilan V2 et sa navigation ont ensuite été ajoutés à la demande ; section 17. |
| Hiérarchie et codages | Un parent peut être interprété à tort comme recevant automatiquement les codages de ses enfants. | T07 et F01 distinguent organiser, coder et transférer. Compteurs propres, absence de codage automatique et déplacement de branche vérifiés. |
| Désactivation des thèmes | Un thème passif peut être pris pour un thème supprimé ou un réglage de vue temporaire. | T07 précise la conservation des codages et la portée corpus. Les enfants ne sont pas désactivés avec leur parent. |
| Couleur des noms | La couleur choisie était enregistrée mais les libellés déjà affichés ne se renouvelaient pas. | Corrigé dans `locuteursGutter.ts` ; deux tests unitaires et recette Electron de T04. |
| Variables privées | Le statut est parfois décrit comme une exclusion universelle de tous les exports. | T09/F01 distinguent exports de lecture, corpus et `.sonal` complet ; vérification pour les deux portées dans `test/exportFormats.test.ts`. |
| Import de modèle | Le bouton appelait `dialog.choisirJson`, exposé à tort dans le groupe `export` du preload. | Fonction replacée dans `dialog` conformément au contrat ; export/import réels et application du modèle vérifiés en développement et dans le paquet Linux. |
| Table de données V1 | V1 propose export CSV et déplacement manuel de variables/modalités. | Export CSV ajouté en section 16 ; le déplacement manuel reste absent. Le modèle JSON ne transporte aucune réponse. |
| Export et confidentialité | Les protections des exports de lecture ne valent pas pour toutes les sorties, notamment QualCoder et médias originaux. | O05–O08 doivent expliciter les différences, pas promettre un export anonyme. |
| Sauvegarde | L’export de lecture et un dossier sans médias externes peuvent être insuffisants. | A06 doit tester l’archive et la restauration avant une procédure complète. |
| Étendue de l’aide embarquée | L’utilisateur demande une navigation simple sans lecteur spécifique. | Décidé : HTML direct ouvert dans le navigateur, pas de conversion ni de moteur de recherche. |

### Réserve de questions FAQ pour les prochains lots

En plus des vingt-sept réponses présentes dans F01 :
- Comment retrouver un enregistrement d’équipe inaccessible ? → E05, puis F04.
  La recherche d’un fichier local déplacé est désormais expliquée dans T02/F01.
- Que faut-il sauvegarder pour pouvoir reprendre sur un autre poste ? → A06, puis F02.
- Le texte pseudonymisé et les médias peuvent-ils être partagés tels quels ? → T12/O08, puis F02.
- Pourquoi mes filtres ne donnent-ils aucun résultat ? → N02/N03/N05, puis F03.
- Pourquoi une analyse est-elle incomplète ou plus à jour ? → N06, puis F03.
- Puis-je modifier un entretien déjà ouvert par un collègue ? → E04, puis F04.
- Que puis-je encore faire sans réseau ? → E06, puis F04.
- Que faire si une publication a échoué ? → E06, puis F04.
- Puis-je conserver et rouvrir mon ancien corpus V1 ? → M01/M02, puis F04.

## 7. Vérifications des pilotes

Référence de code : V2 `38436ac` ; essais réalisés le 28 octobre 2026, sur
l’environnement Linux local, avec un profil et des dossiers temporaires isolés.
Aucun corpus personnel ni banc distant utilisé.

### Sources fonctionnelles vérifiées

- `Accueil.vue`, `NouveauCorpus.vue`, `useCycleCorpus.ts`, documentation de
  l’ouverture et de la navigation : création, récents et changements d’espace.
- `DecouverteExemples.vue`, `InstallationExemple.vue`, `shared/exemples.ts` :
  exemple libre et copie distincte des parcours.
- `Entretien.vue`, `PanneauThemesEntretien.vue`, `EditionThemes.vue`,
  `useAnnotationsEntretien.ts`, `editor/snap.ts` et `trouverCodage()` : onglet,
  création, sélection, codage et retrait sur plage exacte.

### Recette exécutée dans Electron

Les deux scénarios sont conservés dans `e2e/documentation-pilotes.e2e.ts`.

1. Création : annulation sans création, nouveau corpus vide, nom de projet,
   premier espace affiché, réouverture récente, sélection d’un dossier déjà
   utilisé sans remplacement, retrait du raccourci sans suppression et
   réouverture par le dossier.
2. Codage : installation de la copie **Entretiens déjà importés**, ouverture de
   **1Coordinatrice**, création de **Engagement bénévole**, sélection du passage,
   pose/retrait/repose, état **à jour**, changement d’espace et réouverture de
   l’entretien avec son codage conservé.

Commandes de reproduction :

```bash
npm run build
npx playwright test e2e/documentation-pilotes.e2e.ts --project=local --workers=1
```

Pour renouveler explicitement les trois illustrations :

```bash
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-pilotes.e2e.ts --project=local --workers=1
```

Résultat : build et `npm run typecheck` réussis ; **2 scénarios réussis**.
Un contrôle des sept fichiers Markdown de ce chantier a vérifié leurs 38 liens
et ressources, y compris les ancres de la FAQ, ainsi que l’absence d’espaces finaux.
Les sélecteurs natifs de fichiers sont remplacés par les réponses choisies pour
la recette automatisée.
Le choix manuel du dossier et les comportements propres à Windows/macOS restent
à qualifier. La sélection de texte est une sélection DOM réelle ; le glisser
physique de la souris n’est pas simulé dans ces deux scénarios.

Les précautions générales et certaines variantes (thème inactif, consultation
seule, publication distante) sont étayées par les sources examinées, pas par une
nouvelle recette complète de tous ces cas. Les pilotes ne certifient pas le lot
collectif. La recette du site HTML et de son paquet est décrite ci-dessous.

### Retour éditorial

Les trois pages et la FAQ ont été acceptées. Leur contenu est repris en HTML,
sans conserver une seconde version Markdown.

## 8. Site HTML local — décision et recette

L’utilisateur a demandé une solution plus simple que le lecteur envisagé :
les pages sont écrites directement en HTML. Aucun convertisseur, serveur,
JavaScript, lecteur Vue ou fenêtre Electron supplémentaire. `markdown-it` et
`@types/markdown-it` ont été désinstallés ; le verrou npm est revenu à son état
antérieur à leur installation.

- Entrée du guide : `docs/user/index.html`.
- FAQ : `docs/user/faq/premiers-pas.html`.
- Présentation partagée : `docs/user/style.css`.
- Navigation : sommaire, liens internes, ancres et Précédent / Suivant.
- Recherche et impression : fonctions habituelles du navigateur.
- Menu Aide : ouvre le guide ou la FAQ par `shell.openPath`, sans commande de corpus.
- Empaquetage : les fichiers HTML/CSS et les illustrations sont copiés dans
  `resources/documentation/`, sans les huit anciens textes Markdown.

Vérifications exécutées :

- `npm run typecheck` et build réussis.
- `test/documentation.test.ts` et `test/menuApplication.test.ts` : **7 tests réussis**,
  dont les liens, ancres, illustrations, feuilles de style et messages d’échec.
- Recettes locales des pilotes et du site : **3 scénarios réussis**.
- `npm run pack:dir`, puis ouverture depuis le paquet Linux : **1 scénario réussi**.
  Le guide et la FAQ du paquet sont parcourus dans Chromium hors ligne, JavaScript
  désactivé ; les illustrations sont présentes et l’entretien reste ouvert.
- Consultation sur une largeur de 390 pixels et accès clavier vérifiés.

Reproduction de la recette du site :

```bash
npm run build
npx playwright test e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation.e2e.ts --project=local --workers=1
```

L’appel au système ouvrant le navigateur est intercepté par la recette pour
récupérer le chemin, puis les vrais fichiers sont lus dans Chromium. L’association
HTML propre au poste et les paquets Windows/macOS restent à qualifier manuellement.

## 9. Premier sous-lot du socle V1

Pages ajoutées :

- [Découvrir SonalPi](../../docs/user/demarrer/presentation.html) : usages, place de
  la transcription, données locales/distantes et précautions avant diffusion.
- [Parcours et corpus exemples](../../docs/user/demarrer/exemples-parcours.html) :
  choix, préparation, progression, reprise, copies distinctes et remise à zéro.
- [Préparer et importer une transcription](../../docs/user/traiter/importer.html) :
  formats, trois exemples SRT/TXT, ajout avec ou sans média et vérification du résultat.

Le sommaire et les liens Précédent / Suivant relient les six chapitres. Les quatre
nouvelles réponses FAQ concernent la transcription automatique, Word/PDF, le choix
d’un exemple et l’absence des démos dans les Récents. Deux captures V2 complètent
les trois premières. Aucun mécanisme d’édition ou de génération HTML n’a été ajouté.

### Adaptations importantes

- Le premier état du guide signalait l’absence de l’import DOCX/PDF. À la demande
  de l’utilisateur, cet import a depuis été ajouté ; la section suivante en donne
  la recette. Un document du projet reste distinct d’une transcription d’entretien.
- Les exemples SRT utilisent `Speaker N:` ; les exemples TXT montrent les noms
  suivis de deux-points, puis la variante avec temps sur une ligne séparée.
- Un nom de locuteur n’identifie pas à lui seul son rôle d’enquêteur.
- L’import travaille dans le corpus, sans réécrire la transcription d’origine ;
  réimporter ajoute un autre entretien plutôt que remplacer le premier.
- Les limites entre sauvegarde, export et pseudonymisation sont rappelées sans
  anticiper les futures procédures avancées.

### Vérifications exécutées

- `npm run typecheck` et build : réussis.
- `test/documentation.test.ts`, `test/documentationImports.test.ts`, `test/sas.test.ts` :
  **13 tests réussis**. Le texte des exemples est lu directement dans la page HTML
  et passe par le véritable importeur ; les locuteurs et les temps sont contrôlés.
- Documentation, pilotes et import/export SONAL : **6 scénarios réussis**.
- Découverte et sources d’exercice : **11 scénarios ciblés réussis**, dont
  consultation sans bascule, préparation, exploration annotée, reprise sans
  réimport et remise à zéro des parcours Préparation et Traitement.
- Import SRT avec audio, audio seul et entretien sans fichier : **3 scénarios réussis**.
- Paquet Linux : navigation des six chapitres et de la FAQ, hors ligne et sans
  JavaScript, **1 scénario réussi**. Les cinq illustrations chargent correctement.
- Lecture étroite à 390 pixels : vérifiée sur tous les chapitres. Les blocs
  d’exemple restent lisibles sans faire déborder la page.

Les scénarios ajoutés sont dans `e2e/documentation-socle.e2e.ts`. Les captures
peuvent être renouvelées avec `SONAL_DOC_CAPTURES=1` sur ce seul fichier.
Les vérifications de découverte s’appuient aussi sur `e2e/demo.e2e.ts` et
`e2e/sources-demo.e2e.ts` ; les variantes média sur `e2e/audio.e2e.ts`.
Les associations HTML et les sélecteurs natifs Windows/macOS restent à qualifier ;
aucun nouveau test distant réel n’a été exécuté pour ce sous-lot.

### Suite

Poursuivre le lot 4 avec la gestion des entretiens et médias, puis la relecture et
la correction. Préparer ensuite la procédure de sauvegarde/déplacement avec un
essai de restauration. L’installation reste à rédiger lorsque les liens de
diffusion publique V2 et les systèmes effectivement distribués sont confirmés.
Les cartes de l’accueil restent au lot 8 ; le reste du manuel reste **À rédiger**.

## 10. Import direct Word et PDF

L’utilisateur a demandé de reprendre le fonctionnement V1, sans ajouter de catalogue
de limites dans l’interface ou la documentation. Les pages présentent donc le même
ajout de fichier, avec Word/PDF dans les formats disponibles.

### Référence V1 et adaptation

- V1 `main.js`, `file:readContent` : Word par `mammoth.extractRawText`, PDF par
  `pdf-parse`, puis `convertTXT` dans `modules/gestion_entretiens.js`.
- V2 : `mammoth` ajouté pour Word ; PDF.js déjà présent utilisé pour extraire les
  lignes de texte, dans l’ordre des pages. Pas de seconde bibliothèque PDF.
- Le texte extrait passe dans `sas.ts` par le convertisseur TXT déjà repris de V1,
  avec le nom du document d’origine pour nommer l’entretien.
- Sélection et glisser-déposer utilisent le même extracteur dans le main.
- Les fichiers d’origine ne sont jamais réécrits. Une erreur de lecture est affichée
  dans la fenêtre d’ajout et ne crée pas d’entretien vide. Une autre sélection permet
  de reprendre. Aucun avertissement préventif supplémentaire n’a été ajouté.

### Contenu actualisé

- `traiter/importer.html` : Word et PDF figurent dans la table des formats.
- `faq/premiers-pas.html` : la réponse Word/PDF décrit l’ajout direct.
- `medias/ajouter-entretien.png` : capture de la fenêtre avec les six extensions.
- La documentation développeur du traitement décrit le circuit d’extraction.

### Recette

- `npm run typecheck` et build réussis.
- **37 tests unitaires réussis** : extraction Word/PDF, texte et accents,
  plusieurs pages PDF, documents endommagés ou sans texte, conservation de
  l’original, ancien import SONAL/SRT/TXT et exemples du guide.
- **17 scénarios Electron locaux réussis**, dont les quatre combinaisons
  Word/PDF × sélection/dépôt, la reprise après erreur et les parcours guidés.
- `npm run pack:dir`, puis **5 scénarios d’import réussis dans le paquet Linux**.
- **1 scénario documentaire réussi dans ce paquet** : lecture des six chapitres
  et de la FAQ hors ligne, sans JavaScript.

Fichiers de recette : `test/importBureautique.test.ts`,
`test/fixtures/transcriptionsBureautiques.ts` et `e2e/import-bureautique.e2e.ts`.
La recette empaquetée utilise `IMPORT_E2E_EXECUTABLE` :

```bash
IMPORT_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/import-bureautique.e2e.ts --project=local --workers=1
```

## 11. Gestion des entretiens et correction

Deux chapitres supplémentaires reprennent les parties correspondantes de la V1 :

- [Gérer les entretiens et leurs médias](../../docs/user/traiter/gerer-entretiens.html) :
  sélectionner/ouvrir, renommer, trier, associer ou détacher un média, retrouver un
  fichier déplacé, assigner un SRT/VTT et supprimer un entretien.
- [Relire et corriger un entretien](../../docs/user/traiter/corriger.html) :
  correction directe, écoute, recherche/remplacement, enregistrement et reprise.

Deux captures illustrent la fiche d’entretien et la recherche/remplacement.
Quatre réponses FAQ expliquent le détachement de l’audio, les fichiers locaux
introuvables, la conservation des corrections à la fermeture et le tri par longueur.
La navigation enchaîne maintenant les huit chapitres et la FAQ.

### Points vérifiés et adaptations V1

- Le nom se valide en quittant son champ ; ne pas imposer la validation Entrée V1.
- Le tri par longueur utilise les mots du texte, pas la durée audio.
- Effacer l’audio détache le fichier ; remplacer le média conserve le texte.
- Assigner un SRT/VTT à un entretien existant remplace le texte et ses annotations,
  avec confirmation lorsqu’il contient déjà du texte ; notes et média sont conservés.
- Supprimer un entretien archive ses fichiers internes et conserve les médias sources.
  La commande Annuler de l’édition du texte ne restaure pas un entretien supprimé.
- Le texte s’enregistre automatiquement ; Entrée crée un paragraphe, pas une
  confirmation de correction. Recherche, remplacement et double-espace ont été rejoués.

### Recette

- Typecheck et **37 tests unitaires réussis** sur l’import et la documentation.
- **20 scénarios Electron réussis** : fiche, renommage/tri, médias, SRT, recherche,
  correction, fermeture/réouverture, suppression et lecture du guide hors ligne.
- **1 scénario vidéo sauté**, car `TestVideo/seance.webm` est absent. Les commandes
  communes sont vérifiées sur l’audio ; aucune nouvelle qualification vidéo complète
  n’est revendiquée pour ce sous-lot.
- Deux sélecteurs de `e2e/audio.e2e.ts` utilisaient une classe désormais commune à
  plusieurs boutons : ils ciblent maintenant le nom exact de la commande locale.
- Paquet Linux reconstruit : **1 scénario documentaire réussi**, huit chapitres,
  FAQ, sept images et affichage étroit hors ligne, sans JavaScript.

Le nouveau scénario est `e2e/documentation-traitement.e2e.ts`. Les captures sont
renouvelables avec `SONAL_DOC_CAPTURES=1` sur ce fichier. Les recettes existantes
utilisées sont celles des métadonnées, médias, recherche, suppression, persistance
et raccourcis. Aucun comportement applicatif n’a été modifié pour ces deux pages.

### Suite

La suite prévue ici était les locuteurs et les tours de parole ; elle est maintenant
réalisée en section 13. Poursuivre par l’organisation des thèmes puis les données.
La sauvegarde/déplacement reste à traiter avec un essai de restauration ; l’installation
attend la confirmation des points de diffusion V2.

## 12. Imports repris de Whispurge

À la demande de l’utilisateur, comparaison avec le dépôt local `whispurge` :
commit `6c5704c` (« import format Nvivo Tadddam »), import TXT dans
`WHSPRG/JS/Anonymisation/import_export.js`, noms SRT dans
`WHSPRG/JS/locutarisation.js` et regroupement dans `segmentation.js`.

### Reprise retenue

- TXT `secondes<TAB>locuteur<TAB>texte`, sans en-tête : temps et noms reconnus,
  décimales à point ou virgule, validation stricte et numéros de lignes d’origine.
- Les lignes incomplètes, sans locuteur ou texte, et les temps invalides ou
  décroissants bloquent l’import sans création d’entretien.
- SRT : préfixes `Nom : texte`, notamment `Alice:` et `SPEAKER_00:` ;
  `Speaker N` garde sa numérotation, `None:` ne crée aucun locuteur.
  Les passages sans préfixe restent sans locuteur, même dans un fichier mixte.
- Espaces rétablis entre les lignes des sous-titres SRT/VTT.
- Formats TXT existants conservés. La V2 garde son regroupement par tour et ses
  repères internes ; pas de reprise du renommage N+1 ni de la fin arbitraire
  de cinq secondes du dernier passage TXT de Whispurge.
- `traiter/importer.html` comporte désormais cinq exemples SRT/TXT testés.

### Recette

- Typage et compilation réussis ; **163 tests ciblés réussis** sur l’import,
  les exemples documentaires, la migration et les exports.
- **8 scénarios Electron réussis** : cinq exemples du guide, refus d’un TXT
  invalide puis nouvelle sélection, et non-régression Word/PDF par choix/dépôt.
- La recette empaquetée de la section suivante inclut le guide enrichi.

Tests ajoutés : `test/importTranscriptions.test.ts`. Les recettes documentaires
sont complétées dans `test/documentationImports.test.ts` et
`e2e/documentation-socle.e2e.ts`.

## 13. Locuteurs et tours de parole

Page ajoutée : [Identifier les locuteurs et les tours de parole](../../docs/user/traiter/locuteurs.html).
Le sommaire et les liens Précédent / Suivant l’insèrent entre la correction et le
premier codage. Le guide comporte **neuf chapitres**, la FAQ **dix-neuf réponses**
et les pages **huit illustrations V2**.

### Sources et adaptations

- V1 : `Tutos/06-3-mode-locuteurs.html`, explication de l’utilité des locuteurs
  et attribution d’un paragraphe ou d’une sélection.
- V2 : `PanneauLocuteursEntretien.vue`, `useLocuteursEntretien.ts`,
  `editor/attribution.ts`, `editor/locuteursGutter.ts`,
  `shared/entretien/locuteurs.ts` et `shared/corpus/rapprochementsPersonnes.ts`.
  Documentation développeur : `docs/dev/traiter/locuteurs/`.
- Les noms s’éditent directement et s’appliquent en quittant le champ.
  Aucun crayon ni validation V1 supplémentaire à chercher.
- Le rôle se règle avec **Interv.**, pas avec le seul nom « Enquêteur » ni
  l’ajout manuel de `?`. Les tours correspondants sont en italique.
- Une attribution sans sélection porte sur le paragraphe courant ; une sélection
  peut être scindée en paragraphes pour distinguer les voix. Le texte et les
  codages sont conservés. **aucun** retire l’attribution sans supprimer le locuteur.
- La croix remplace la suppression V1 par vidage du nom. Un locuteur inutilisé
  disparaît sans confirmation ; sinon Annuler/Supprimer est proposé. Le texte,
  les notes et la fiche Personne sont conservés, mais l’attribution et les liens
  du locuteur aux notes sont retirés. Ne pas promettre une restauration.
- Le nommage peut créer une Personne ou proposer un rapprochement. Le chapitre
  explique **Plus tard**, la confirmation et la reprise d’informations cochée
  par défaut, sans anticiper toute la procédure du répertoire Personnes (T05).
- Le pseudo de locuteur change le libellé, pas les mentions du nom dans les
  phrases ni les médias. Le nom original reste conservé et visible dans l’éditeur.
- Lors de cette première recette, les statistiques et la loupe V1 n’étaient pas
  proposées dans le panneau V2 examiné. Elles ont ensuite été adaptées à la demande
  de l’utilisateur ; voir la section 17 pour le bilan et ses limites.

### Correction rencontrée pendant la recette

Le changement de couleur ne renouvelait pas le libellé déjà affiché dans le texte,
malgré un enregistrement correct. La couleur est désormais incluse dans la clé
utilisée pour rafraîchir ce libellé. C’est la seule modification applicative de ce
sous-lot ; elle ne touche ni les paroles ni leurs attributions.

### Recette

- `npm run typecheck` et compilation réussis.
- **116 tests unitaires ciblés réussis** : locuteurs, rafraîchissement de couleur
  avec/sans pseudo, attribution, personnes, import et documentation.
- **20 scénarios Electron locaux réussis** : guide, pilotes, import, correction,
  attribution, rôle, suppression, création de personne, rapprochements et reprise
  facultative des informations.
- Nouveau scénario `e2e/documentation-locuteurs.e2e.ts` : copie de
  **Entretiens déjà importés**, **1Coordinatrice**, noms Enquêteur/Fatima,
  rôle, pseudo posé/retiré, couleur, ajout, attribution d’une sélection, **aucun**,
  annulation puis confirmation de suppression et réouverture. Texte comparé sans
  les libellés pour vérifier qu’aucune parole n’est effacée. La fiche Personne
  subsiste après suppression du locuteur.
- Nouvelle capture `medias/locuteurs-entretien.png`, produite dans cette recette.
- `npm run pack:dir`, puis **1 scénario documentaire réussi dans le paquet Linux** :
  neuf chapitres, FAQ et huit images, hors ligne et sans JavaScript ; lecture à
  390 pixels, navigation clavier et entretien resté ouvert.

Reproduction du nouveau scénario et renouvellement explicite de sa capture :

```bash
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-locuteurs.e2e.ts --project=local --workers=1
npm run pack:dir
DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation.e2e.ts --project=local --workers=1
```

Les tests utilisent de vrais fichiers et l’éditeur Electron. Les sélecteurs natifs
et la sélection de texte sont pilotés comme dans les recettes précédentes ; la
couleur est posée par un événement de champ, sans automatiser la palette système.
Le clavier et les ressources documentaires sont testés dans Chromium. Les menus
natifs Windows/macOS et les corpus distants ne sont pas qualifiés par ce sous-lot.

### Suite

T07 est maintenant rédigé et vérifié en section 14. La suite du lot 4 est
**T09 — Définir les variables et saisir les données**. Les usages transversaux
des personnes restent au lot 5. Les cartes de l’accueil restent au lot 8.
Installation et sauvegarde restent conditionnées respectivement aux liens de
diffusion et à un essai de restauration.

## 14. Organiser et documenter ses thèmes

Page ajoutée : [Organiser et documenter ses thèmes](../../docs/user/traiter/organiser-themes.html).
Elle suit le premier codage dans le sommaire et la navigation Précédent / Suivant.
Le guide comporte **dix chapitres**, la FAQ **vingt-deux réponses** et l’ensemble
**neuf illustrations V2**.

### Sources et adaptations

- V1 : `Tutos/05-categories.html` et la partie codage de `06-5-mode-categories.html`.
  Conserver la grille d’analyse et l’utilité des descriptions, pas les codes
  numériques, les rangs à régler manuellement ou les commandes absentes de la V2.
- V2 : `EditionThemes.vue`, `PanneauThemesEntretien.vue`, `MenuTheme.vue`,
  `Corpus.vue`, `useThemesCorpus.ts`, les commandes de suppression dans `sonal.ts`
  et `corpusStore.ts`, ainsi que `shared/corpus/categories.ts` et `requetes.ts`.
  Documentation développeur : `docs/dev/traiter/thematiques/`.
- Ouverture depuis **Thèmes** au corpus ou **Thématiques** dans l’entretien.
  Même définition commune au corpus ; les noms et descriptions s’appliquent en
  quittant leur champ. Fermer l’édition ne revient pas à annuler ses modifications.
- Description explicite plutôt que l’astuce V1 `Nom//description`. **ⓘ** et
  **ⓘ tout** la consultent sans poser de codage.
- **+ enfant** crée un sous-thème. **▲▼** le déplacent parmi ceux du même parent ;
  **⤵** change le parent ou le remet au premier niveau. Les descendants suivent
  et les codages gardent le même thème. La commande de retour au premier niveau
  est citée avec son libellé actuel « — racine du codebook — ».
- Aucun codage automatique du parent ; son compteur ne totalise pas les enfants.
  Ne pas confondre déplacement dans la grille et transfert/fusion de codages (T08).
- Couleur et taille portent sur les passages codés, pas sur le nom du thème dans
  la liste. Les Pondérations sont expliquées en complément facultatif, sans leur
  attribuer un calcul automatique de l’importance.
- **Actif** et le menu contextuel règlent la désactivation pour le corpus.
  Le texte codé reste conservé ; les marques reviennent à la réactivation.
  Désactiver un parent ne désactive pas ses enfants. Replier une branche n’est
  qu’un geste d’affichage.
- Suppression : refus depuis le corpus si le thème est utilisé ; depuis un
  entretien, refus si un autre l’utilise, sinon confirmation et retrait des codages
  locaux. Les enfants d’un thème supprimé remontent d’un niveau et conservent
  leurs codages. Le texte n’est pas effacé ; aucune restauration n’est promise.
- Les commandes de clonage et le mur de catégories V1 ne sont pas présentés comme
  des outils disponibles. Aucun comportement applicatif n’a été modifié pour T07.

### Recette

- `npm run typecheck`, compilation et empaquetage Linux réussis.
- **171 tests unitaires ciblés réussis** : modèle du corpus, stockage, thèmes,
  documentation et exemples d’import.
- **27/27 scénarios Electron réussis lors de la campagne finale**, dont les deux
  nouveaux scénarios de `e2e/documentation-themes.e2e.ts`, les recettes des thèmes
  et la non-régression des chapitres précédents.
- Lors de la première campagne, **26/27 réussis** : le pilote de création de corpus
  a trouvé un `m` ajouté au nom attendu. La relance isolée des deux pilotes a
  réussi **2/2**, sans modification du test ni de l’application. La campagne
  complète rejouée ensuite a réussi **27/27**. La cause de l’échec initial reste
  non établie ; aucune correction applicative n’a été introduite pour le masquer.
- **1 scénario documentaire réussi dans le paquet Linux** : dix chapitres, FAQ et
  neuf images, hors ligne et sans JavaScript ; affichage à 390 pixels et clavier.
- Nouvelle capture `medias/edition-themes.png`, produite dans l’application avec
  le terrain fictif. Les noms longs restent tronqués dans les champs étroits de
  l’interface ; aucun montage ni agrandissement artificiel de la fenêtre d’édition.

Le premier scénario utilise une copie de **Entretiens déjà importés**, entretien
**1Coordinatrice** : Engagement bénévole, Motivations et Parcours, description,
ordre, repli, déplacement sous Vie associative puis retour au premier niveau.
Il code Motivations, vérifie les compteurs distincts du parent/enfant, renomme
en Raisons, recolore, change la taille puis la remet par défaut, désactive le
parent puis l’enfant et réactive ce dernier. Le fichier de l’entretien est comparé
octet pour octet après les changements de définition : il n’est pas réécrit.
La grille et la description sont ensuite retrouvées depuis le corpus et dans
**2RetraiteAnticipee**, sans y créer de codage.

Le second scénario utilise les données fictives minimales de test : parent
inutilisé et enfant codé, refus de suppression de l’enfant depuis le corpus,
suppression du parent, remontée de l’enfant avec son codage intact, annulation
puis confirmation de suppression depuis l’entretien. Le texte est conservé à
la réouverture. Le refus lorsqu’un autre entretien utilise le thème est rejoué
par `e2e/theme-entretien.e2e.ts`.

Commandes ciblées et renouvellement explicite de l’illustration :

```bash
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-themes.e2e.ts --project=local --workers=1
npm run pack:dir
DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation.e2e.ts --project=local --workers=1
```

Comme pour les recettes précédentes, le choix de dossier est préparé par la recette
et la sélection de texte est une sélection DOM réelle. La couleur est renseignée
par le champ du navigateur, sans recette de la palette native de chaque système.
Les corpus distants et les paquets Windows/macOS ne sont pas qualifiés ici.

### Suite

T09 est maintenant rédigé et vérifié en section 15. La suite du lot 4 concerne
les notes (T10), puis les commentaires (T11). Les opérations de transfert, fusion
et division des codages restent réservées au chapitre T08 du lot 5.
Installation et sauvegarde attendent toujours les liens de diffusion et l’essai
de restauration ; les cartes de l’accueil restent au lot 8.

## 15. Définir les variables et saisir les données

Page ajoutée : [Définir les variables et saisir les données](../../docs/user/traiter/donnees.html).
Elle suit l’organisation des thèmes dans le sommaire et la navigation.
Le guide comporte **onze chapitres**, la FAQ **vingt-six réponses** et l’ensemble
**onze illustrations V2**.

### Sources et adaptations

- V1 : `Tutos/04-bdd.html` et `06-7-base-donnees.html`. Conserver la description
  des répondants et du contexte, sans reproduire les commandes disparues.
- V2 : `EditionVariables.vue`, `PanneauDonneesEntretien.vue`, `TableDonnees.vue`,
  `LotVariable.vue`, `useVariablesCorpus.ts`, les commandes de valeurs et de
  suppression, `shared/corpus/variables.ts` et `requetes.ts`.
  Source documentaire : `docs/dev/traiter/variables.md`.
- Confidentialité confrontée à `formatSonal/exportSonal.ts` et
  `shared/export/formatsTexte.ts` : le SONAL complet conserve les variables
  privées et leurs valeurs, contrairement aux copies de lecture et au SONAL
  pseudonymisé. Ne pas généraliser « privée = exclue de tous les fichiers ».
- Une définition de variable est commune au corpus ; une valeur appartient à
  l’entretien ou au locuteur choisi. Une seule valeur à la fois, pas de remplissage
  automatique lors de la création et pas de propagation entre entretiens par
  simple liaison à une Personne.
- La portée est choisie avec les deux boutons de création ; aucun changement
  de portée n’est proposé dans l’édition. Le chapitre conseille une nouvelle
  variable du bon type et une reprise contrôlée en cas d’erreur.
- Saisie depuis l’entretien et depuis la table : listes de modalités, texte libre,
  puis `autre…`. Une nouvelle saisie crée ou réutilise une modalité par libellé.
  `—` retire une valeur sans supprimer sa modalité ; vide n’est pas une réponse Non.
- Le tableau regroupe les variables d’entretien puis celles de locuteur.
  Les cases de l’autre portée ne sont pas saisissables. Recherche du panneau,
  colonnes cochées et filtres de portée ne suppriment aucune valeur.
- Les lots ne sont proposés que sur les colonnes d’entretien. Le filtre
  **Seulement les entretiens sans valeur** est décoché par défaut ; il protège
  les réponses existantes. Sans ce filtre, les valeurs peuvent être remplacées.
  Une valeur vide efface les réponses ciblées. Le bilan doit être contrôlé.
- Renommer une définition répercute son nouveau libellé sans ressaisie des
  réponses. Les suppressions utilisées sont refusées ; une définition inutilisée
  peut disparaître sans confirmation supplémentaire. Les usages dans les cas
  ou familles sont aussi signalés, sans anticiper leurs procédures avancées.
- Modèles intégrés et personnels : ajout de modalités, pas de réponses.
  **Exporter ce modèle** produit un JSON avec nom et modalités ; l’import le
  rend disponible dans Mes modèles du profil, sans créer de variable.
- Dans ce premier état de T09, aucune commande d’export CSV direct ni de
  réorganisation manuelle des variables/modalités n’avait été trouvée. L’export
  CSV est depuis ajouté à la demande de l’utilisateur en section 16 ; la
  réorganisation manuelle reste absente. Le modèle JSON ne devient pas pour
  autant un export des réponses ou une sauvegarde.

### Correction rencontrée pendant la recette

Le parcours réel d’import de modèle échouait avant l’ouverture du sélecteur :
`choisirJson` était exposé sous `window.sonal.export`, alors que l’appel et le
contrat renderer attendent `window.sonal.dialog.choisirJson`.
La fonction a été replacée dans `dialog` dans `src/preload/index.ts`, sans
modifier le format des modèles ni l’IPC du main. C’est la seule modification
applicative de ce sous-lot. La recette exporte un modèle puis importe ce vrai
fichier et l’applique à une autre variable, en développement et dans le paquet.

### Recette

- Typage, compilation et empaquetage Linux réussis.
- **165 tests unitaires ciblés réussis** : corpus, stockage, mapping EAV,
  exports, documentation et exemples d’import. Deux tests supplémentaires de
  `test/exportFormats.test.ts` vérifient, pour les deux portées, la présence
  d’une variable privée renseignée dans le SONAL complet et son absence des
  copies TXT/HTML et du SONAL pseudonymisé, sans modification de la source.
- Les tests historiques d’export émettent encore des avertissements Happy DOM
  sur des chargements de ressources SONAL interrompus ; aucun de ces tests
  n’échoue. La disponibilité hors ligne du guide est vérifiée séparément.
- **21/21 scénarios Electron locaux réussis** : les deux nouveaux scénarios de
  `e2e/documentation-donnees.e2e.ts`, les recettes Données/Table de données,
  navigation clavier, lots et non-régression des chapitres précédents.
- **3/3 scénarios réussis dans le paquet Linux** : les deux recettes Données
  complètes, dont export/import du modèle, et la lecture des onze chapitres et
  de la FAQ hors ligne, sans JavaScript, à 390 pixels, avec accès clavier et
  onze illustrations chargées. L’entretien de départ reste ouvert pendant l’aide.

Le premier scénario installe une copie de **Entretiens déjà importés**, puis crée
**Lieu de rencontre** (entretien) et **Ancienneté** (locuteur). Il saisit dans
**1Coordinatrice**, ajoute une réponse via **autre…**, efface puis réaffecte une
valeur, contrôle les deux portées sur disque et retrouve les réponses dans la
table. Une modification de **2RetraiteAnticipee** ne renseigne pas les autres
entretiens. Les refus de suppression, le renommage d’une variable/modalité et
le maintien de la visibilité d’une variable privée sont vérifiés. Le texte,
les annotations et les repères temporels restent identiques à la source.

Le second utilise les données fictives minimales de test et deux entretiens :
modèle de **Relecture**, export JSON contrôlé, import sans création de variable,
application depuis **Mes modèles**, modèle intégré **Statut d’activité**, puis
suppression de définitions inutilisées. Le lot limité aux lignes vides conserve
la réponse déjà présente ; un second lot avec `—` retire les deux valeurs.

Illustrations produites : `medias/edition-variables.png` et
`medias/table-donnees.png`. La table est recadrée sur les colonnes et lignes utiles,
sans montage. Les réglages d’affichage ne sont pas présentés comme une suppression.

Reproduction et renouvellement explicite des deux captures :

```bash
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-donnees.e2e.ts --project=local --workers=1
npm run pack:dir
DONNEES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-donnees.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

Les choix des sélecteurs natifs sont préparés par la recette, avec de vrais fichiers
lus et écrits. Les droits et publications Nextcloud/GitLab, ainsi que les paquets
Windows/macOS, ne sont pas qualifiés par ces essais locaux.

### Suite

Faire relire T09 et les quatre réponses FAQ, puis poursuivre le lot 4 avec
**T10 — Écrire et consulter des notes**, puis **T11 — Commenter un passage**.
La pseudonymisation et l’export d’entretien suivront avec leurs précautions de
partage. Installation et sauvegarde restent conditionnées aux liens de diffusion
et à l’essai de restauration ; les cartes de l’accueil restent au lot 8.

## 16. Export CSV de la table de données

L’utilisateur a demandé l’ajout d’un export CSV après la rédaction de T09.
Le chapitre est complété par une procédure d’export, une capture et une réponse
FAQ. Le guide reste à **onze chapitres**, avec **vingt-sept réponses FAQ** et
**douze illustrations V2**. La capture de la table a été renouvelée avec le bouton.

### Périmètre et précautions

- **Exporter CSV…** reprend les colonnes cochées et le filtre de portée.
  La recherche dans le panneau Variables ne réduit pas les colonnes exportées.
- Les variables privées affichées sont exclues par défaut à chaque ouverture.
  Une case explicite permet de les inclure ; un rappel indique alors que le
  fichier contiendra leurs réponses. Sans colonne exportable, le bouton est désactivé.
- Tous les entretiens de la table sont visés. Les lignes de locuteur ne sont
  émises que si elles sont affichées. Entretien, Type de ligne et Locuteur
  identifient chaque ligne ; le nom de l’entretien est répété pour faciliter le tri.
- Les noms et les réponses inclus restent en clair, sans pseudonymisation
  automatique. Ce CSV n’est ni un export de modèle ni une sauvegarde complète.
- Le fichier est en UTF-8 avec BOM, séparateur point-virgule et fins de ligne
  CRLF. Les guillemets sont doublés ; retours de ligne et séparateurs sont
  conservés dans leur cellule. Les cellules pouvant devenir des formules dans
  un tableur sont préfixées pour rester du texte. Les en-têtes homonymes sont distingués.
- L’export attend les saisies en cours puis relit la matrice. Une source absente,
  une réponse sans modalité connue ou une relecture en échec interdit de produire
  un fichier silencieusement incomplet. Une annulation ne signale pas de réussite.
- Le choix de fichier réutilise le dialogue d’enregistrement existant. Une
  erreur d’écriture est expliquée sans imposer le diagnostic technique au lecteur.
  Les fichiers du corpus ne sont pas modifiés par l’export.

### Code et documentation

- Conversion pure : `src/shared/corpus/exportDonnees.ts`.
- Choix et confirmation : `ExportDonnees.vue`, intégré à `TableDonnees.vue`.
  La table suit ses écritures de cellules pour attendre leur fin avant l’export.
- Le fichier est écrit via `dialog.choisirExport` ; aucun nouvel IPC ni dépendance.
- `traiter/donnees.html`, `faq/premiers-pas.html` et la documentation développeur
  des variables sont actualisés. Les formulations indiquant l’absence de CSV
  appartiennent désormais à l’historique de T09, pas à la procédure courante.

### Recette

- Typage, compilation et empaquetage Linux réussis.
- **184 tests ciblés réussis**, dont **19 tests CSV** : portées, propriétaires,
  privées, ordre/filtre, caractères spéciaux, formules, en-têtes homonymes,
  réponses inconnues, entretiens manquants et corpus vide.
- **24/24 scénarios Electron locaux réussis**, dont les trois nouveaux scénarios
  de `e2e/export-donnees.e2e.ts` : contenu des fichiers et annulations ; saisie
  libre immédiatement avant export ; sources absentes, réponse inconnue,
  fichier illisible, erreur d’écriture et reprise. Les fichiers du corpus sont
  comparés après son ouverture, pour ne pas confondre migration initiale et export.
- **6/6 scénarios réussis dans le paquet Linux** : trois exports CSV, deux
  scénarios Données et lecture du guide hors ligne, sans JavaScript, à 390 pixels.
- Le format est contrôlé à partir des vrais fichiers écrits, avec un lecteur de
  CSV de test. L’ouverture manuelle dans Excel/LibreOffice et les dialogues natifs
  Windows/macOS restent à qualifier ; aucun nouveau banc distant réel n’a été utilisé.

Commandes de reproduction :

```bash
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/export-donnees.e2e.ts e2e/documentation-donnees.e2e.ts --project=local --workers=1
npm run pack:dir
DONNEES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/export-donnees.e2e.ts e2e/documentation-donnees.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

La suite du plan reste les notes (T10), puis les commentaires (T11).

## 17. Statistiques des locuteurs de l’entretien

L’utilisateur a demandé de reprendre ce module V1 avant de poursuivre la rédaction.
Le bouton **📊 Statistiques** ouvre désormais un bilan dans l’onglet **Locuteurs**,
avec un bouton **🔎 Suivante** par voix. T04 et la FAQ sont complétés ; le guide reste
à **onze chapitres**, avec **vingt-huit réponses FAQ** et **treize illustrations V2**.
Les constats d’absence dans la recette initiale de T04 appartiennent à son historique.

### Sources et adaptation

- V1 : `Tutos/06-3-mode-locuteurs.html`, capture `Tutos/media/stats_loc.png`,
  `modules/locutarisation.js`, fonction `statsLocs`. Le bilan associait tours,
  mots, durées et part des questions. Sa durée jusqu’au début du segment suivant
  pouvait attribuer une pause au locuteur précédent : ce calcul n’est pas repris.
- V2 : paragraphes consécutifs de même index regroupés, repères temporels séparés
  du texte et comptage Unicode commun aux longueurs d’entretiens. Aucun changement
  du schéma de l’éditeur, du format natif, des IPC ni des dépendances.
- Le bilan indique tours et mots, barres et pourcentages des mots, total et part
  des enquêteurs selon **Interv.**, en ordre décroissant des mots. **Sans locuteur**
  participe au total ; une référence inconnue est rangée dans cette ligne.
  Les groupes entièrement blancs ne créent pas d’intervention ; les locuteurs
  sans texte ne gonflent pas la liste. Les homonymes ne sont pas fusionnés.
- Les durées sont interpolées uniquement entre repères utilisables couvrant du
  texte. Les silences repérés entre deux passages ne sont pas attribués ; aucune
  extrapolation avant le premier repère, après le dernier ou depuis le média.
  Couverture incomplète signalée comme partielle ; absence de durée par un tiret.
  Des repères incohérents retirent les durées, pas les nombres de mots et de tours.
  Ce n’est pas une mesure automatique de voix : les pauses non repérées restent
  indissociables du passage chronométré qui les contient.
- **Suivante** rejoint le début du tour, puis boucle après le dernier. Le compteur
  est remis à zéro si le découpage change. Le lecteur est calé si un média et des
  repères sont disponibles, sans démarrer une lecture arrêtée. La consultation
  n’écrit aucun contenu, annotation ni journal et reste disponible en lecture seule.
- Texte, attribution, rôle, nom et couleur sont suivis réactivement. La projection
  est aussi renouvelée après l’ouverture sans événement de modification. Le bilan
  se ferme au changement d’entretien ; le résumé thématique et le lecteur restent
  inchangés. Les noms affichés sont en clair, pas pseudonymisés.

### Code et documentation

- Calcul pur : `src/shared/entretien/statistiquesLocuteurs.ts`.
- Projection des paragraphes : `src/renderer/composables/useEntretien.ts`.
- Affichage et navigation : `StatistiquesLocuteurs.vue`, ouvert depuis
  `PanneauLocuteursEntretien.vue` seulement dans l’onglet actif.
- Chapitre T04, sommaire, README et FAQ actualisés ; documentation développeur
  enrichie dans `docs/dev/traiter/locuteurs/entretien.md`.
- Capture `locuteurs-entretien.png` renouvelée pour montrer la commande ; nouvelle
  capture `statistiques-locuteurs.png` issue de la vraie application et de la copie
  de **1Coordinatrice** : Fatima, 551 mots sur 715, 16 tours ; Enquêteur, 164 mots,
  17 tours. Aucun montage ni média V1 recopié.

### Recette

- Typage, compilation et empaquetage Linux réussis.
- **144 tests ciblés réussis**, dont **20 nouveaux tests** du calcul et du composant :
  tours groupés, index zéro/non consécutifs, homonymes, non attribués, comptage,
  repères absents/partiels/incohérents, exclusion des silences, nombreuses ancres,
  navigation cyclique, réactivité, lecture seule et noms affichés sans HTML injecté.
- **25/25 scénarios Electron locaux réussis** : trois nouveaux scénarios dans
  `e2e/statistiques-locuteurs.e2e.ts`, plus les recettes locuteurs, audio,
  métadonnées, nommage, correction et aide documentaire.
- La nouvelle recette importe un SRT de cinq passages et un WAV synthétique.
  Alice a neuf mots et deux tours, Bob quatre mots et un tour, quatre mots restent
  sans locuteur. Les durées sont de trois, deux et une secondes, sans les silences
  entre cues. Les clics se calent à 0, 8 puis 0 secondes, sans lecture ni modification
  du fichier. La réattribution et l’ajout de mots actualisent le bilan ; la réouverture
  conserve le texte corrigé. Un second scénario fonctionne sans audio ni repères.
- Le troisième scénario vérifie le clavier et les commandes accessibles dans une
  vraie fenêtre Electron annoncée en lecture seule. La réponse d’ouverture est
  simulée à cette fin : aucun serveur ni verrou distant réel n’est qualifié.
- **5/5 scénarios réussis dans le paquet Linux** : trois scénarios statistiques,
  recette T04 avec bilan et consultation du guide hors ligne, sans JavaScript,
  à 390 pixels. Le nouveau lien FAQ mène au bilan ; les treize images sont lisibles.
- Pendant la mise au point, deux attentes de la recette ont été corrigées : une
  sélection sans son point laissait un petit tour à l’ancienne voix ; une frappe
  en fin de document visait un reste d’espace de cette voix plutôt que le passage
  réattribué. La recette sélectionne désormais la phrase complète et édite le
  paragraphe ciblé. Ces essais n’ont pas nécessité de changement applicatif.
  Un import dynamique non supporté dans le pilote Electron a également été retiré
  au profit du passage direct de la donnée de test.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/statistiquesLocuteurs.test.ts test/statistiquesLocuteursRenderer.test.ts test/locuteurs.test.ts test/locuteursGutter.test.ts test/attribution.test.ts test/audio.test.ts test/ordreEntretiens.test.ts test/personnes.test.ts test/importTranscriptions.test.ts test/documentation.test.ts
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-locuteurs.e2e.ts --project=local --workers=1
npx playwright test e2e/statistiques-locuteurs.e2e.ts e2e/locuteurs.e2e.ts e2e/audio.e2e.ts e2e/audio-panneau-meta.e2e.ts e2e/personnes-nommage.e2e.ts e2e/personnes-nommage-simplifie.e2e.ts e2e/documentation-locuteurs.e2e.ts e2e/documentation.e2e.ts e2e/documentation-traitement.e2e.ts --project=local --workers=1
npm run pack:dir
STATS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/statistiques-locuteurs.e2e.ts e2e/documentation-locuteurs.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

La prochaine rédaction prévue à ce stade était **T10 — Écrire et consulter des notes**,
réalisée ci-dessous. Les procédures distantes et les paquets Windows/macOS restent
à qualifier. Les cartes de l’accueil et les huit textes antérieurs restent inchangés.

## 18. Écrire et consulter des notes

Page ajoutée : [Écrire et consulter des notes](../../docs/user/traiter/notes.html).
La navigation l’insère après les données et avant la FAQ. Le guide comporte désormais
**douze chapitres**, **trente-deux réponses FAQ** et **quinze illustrations V2**.
Aucune modification applicative n’a été nécessaire pour ce sous-lot.

### Sources et adaptations

- V1 : `Tutos/06-6-notes.html`, utilité des mémos libres et validation avec l’entretien.
  Cette intention est conservée, sans reprendre l’ancienne fenêtre de texte unique.
- V2 : `PanneauNotesEntretien.vue`, `useNotesEntretien.ts`, `NotesCorpus.vue`,
  `ModaleNoteCorpus.vue`, `useNotesCorpus.ts`, modèles Notes et conversion Markdown.
  Sources complémentaires : `docs/dev/traiter/notes/` et ancien `docs/user/vue-corpus.md`,
  laissé inchangé. Les commentaires restent le sujet suivant, pas une seconde page T11.
- Création et édition dans une fenêtre : **Valider** applique le contenu, **Annuler**
  abandonne la saisie. Dans la **Feuille** de l’entretien, le corps est enregistré
  directement ; le titre s’applique en quittant son champ. Attendre **à jour** et
  vérifier par réouverture. Ne pas promettre la conservation d’un brouillon fermé.
- Une carte avec titre n’affiche pas le corps : expliquer la feuille et le crayon,
  plutôt que laisser croire à une perte. Le glisser des cartes règle l’ordre propre
  à l’entretien ; le tri du corpus est indépendant.
- Catégories de notes distinctes des thèmes. **autre…**, puis **＋**, crée une catégorie
  partagée. Création et couleur s’appliquent immédiatement au corpus, même si la note
  est ensuite annulée. Aucune commande de renommage ou suppression de catégorie non
  proposée par ces vues n’est inventée depuis les seules méthodes internes.
- **Concerne** associe la note aux locuteurs de l’entretien, sans copie, et permet
  son agrégation dans une fiche de personne si ces locuteurs y sont reliés.
  Les liens vers des commentaires existants sont introduits brièvement ; leur
  création sera expliquée en T11. Le parcours de liaison existant a été rejoué.
- **privé** est le statut initial, pas un droit personnel ni un chiffrement.
  La note reste lisible dans le corpus, y compris en lecture seule. Les exports
  de transcription avec notes retiennent les publiques ; le presse-papier et
  le Markdown des Notes conservent les notes affichées, privées comprises.
  La prose des notes n’est pas automatiquement pseudonymisée avec la transcription.
- Corpus : Tableau/Feuille, recherche, accès rapides Résumés/Toutes les notes,
  filtres détaillés et tris. Modification locale par le crayon ; les cibles Concerne
  et la création de liens passent par l’entretien. Un inventaire indisponible ou
  ancien n’est pas présenté comme complet ou à jour.
- Suppression immédiate, sans confirmation, dans l’entretien ; confirmation dans
  la vue corpus. Les notes ne sont pas des passages de transcription : les paroles
  et annotations restent inchangées. L’export Markdown n’est pas une sauvegarde.

### Documentation et captures

- Chapitre, sommaire HTML, README et navigation Données/Notes/FAQ actualisés.
- Quatre réponses FAQ : note/commentaire ; corps absent de la carte ; portée du
  statut privé ; inclusion des privées dans l’export Markdown.
- Deux captures produites dans la vraie application sur une copie temporaire de
  **Entretiens déjà importés**, **1Coordinatrice** : `edition-note.png` et
  `notes-corpus.png`. Noms et texte fictifs ; pas de média V1 ni de montage.
- Documentation développeur Notes enrichie : effets des catégories indépendants
  du brouillon, suppression, affichage des cartes et portée réelle des tests.

### Recette

- `npm run typecheck`, compilation et empaquetage Linux réussis.
- **91 tests ciblés réussis**, dont deux nouveaux contrôles de confidentialité :
  le Markdown conserve les privées et l’ordre reçus, sans modifier les sources ;
  une transcription pseudonymisée ne remplace pas les noms dans ses notes publiques.
  Les tests couvrent également normalisation, nettoyage HTML, références, catégories,
  inventaire, état attendu, commandes locales, exports et liens documentaires.
- Les tests historiques de formats émettent encore des messages Happy DOM
  `AbortError` / `NetworkError` lors de l’arrêt de chargements de styles legacy
  externes. Les assertions réussissent ; le nouveau guide ne charge aucune de
  ces ressources, comme le confirme son test hors ligne et sans JavaScript.
- **9/9 scénarios Electron locaux réussis** : trois nouvelles recettes Notes,
  consultation du guide et cinq scénarios Notes existants.
- Le premier nouveau scénario crée puis annule un brouillon, valide un résumé
  public avec marque importante et cible Fatima, puis une réflexion privée.
  Il vérifie l’édition directe dans la feuille, l’ordre par glisser, l’annulation
  d’une édition, la copie réelle du texte filtré et la réouverture depuis le corpus.
  L’édition corpus préserve les cibles et le rang. Deux vrais fichiers Markdown
  sont téléchargés : toutes les notes, puis seulement Public. L’export conserve
  les noms et ne modifie pas le fichier d’entretien. Les deux chemins de suppression
  sont vérifiés, avec annulation puis confirmation depuis le corpus. La transcription,
  les annotations et les ancres sont comparées au fichier de départ.
- Le deuxième vérifie qu’une catégorie créée subsiste après annulation de la note,
  puis qu’une couleur changée subsiste après annulation de son édition, sans réécrire
  le contenu de la note. Le champ couleur est piloté par événement de formulaire,
  sans automatiser la palette du système.
- Le troisième vérifie consultation et copie d’une note privée, avec création et
  édition indisponibles, dans une vraie fenêtre Electron annoncée en lecture seule.
  La réponse d’ouverture est simulée : aucun verrou ou service distant réel n’est
  qualifié. Le test distant unitaire utilise uniquement un serveur WebDAV en mémoire.
- **4/4 scénarios réussis dans le paquet Linux** : les trois nouveaux scénarios et
  le guide hors ligne, sans JavaScript, à 390 pixels. Les douze chapitres, leurs quinze
  images, la navigation et les nouveaux liens FAQ sont vérifiés sans fermer l’entretien.
- Pendant la mise au point, les sélecteurs de catégorie et de statut ont été ajustés
  aux libellés des listes et à leurs espaces. Un repassage du paquet a d’abord réussi
  3/4 : le pilote lisait le presse-papier avant la fin de sa copie asynchrone. Il attend
  désormais le témoin **Copié !** ; la campagne finale réussit 4/4. Aucun changement
  applicatif n’a été nécessaire. La capture de création est prise après désélection
  du passage marqué, sans retouche.

Commandes principales :

```bash
npx vitest run test/notes.test.ts test/notesCorpus.test.ts test/notesCorpusDistant.test.ts test/notesMarkdown.test.ts test/exportFormats.test.ts test/documentation.test.ts
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-notes.e2e.ts e2e/notes-feuille.e2e.ts e2e/notes-corpus.e2e.ts e2e/notes-navigation.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run typecheck
npm run pack:dir
NOTES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-notes.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

**T11 — Commenter un passage**, puis pseudonymisation et export d’entretien.
L’installation attend toujours les liens de diffusion, la sauvegarde un essai de
restauration. Les procédures distantes, les paquets Windows/macOS et leurs dialogues
natifs restent à qualifier. Les cartes de l’accueil restent au lot 8 ; les huit
textes utilisateur antérieurs sont conservés sans modification.


