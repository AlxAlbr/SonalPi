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
  organisation des thèmes, variables, saisie des données, notes, commentaires,
  pseudonymisation, retour sur une modification et exports individuel et par lot.
  Dix-sept chapitres et cinquante-deux réponses FAQ sont disponibles.
- Sommaire utilisateur : regroupé selon les parties du plan, avec seulement les
  rubriques qui contiennent déjà des chapitres publiés.
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
- Commentaires : **chapitre T11 rédigé et vérifié**, capture V2 et quatre réponses FAQ ;
  création, marge, modification, notes liées, suppression, lecture seule et sorties.
  Une correction ciblée empêche désormais l’édition en lecture seule.
- Pseudonymisation : **chapitre T12 rédigé et vérifié localement**, deux captures V2
  et quatre réponses FAQ ; portées, occurrences, variantes, exceptions, contrôle
  corpus et rapport avant export. Aucun changement applicatif.
- Annulation et restauration : **chapitre T13 rédigé et vérifié dans le paquet Linux**,
  deux captures V2 et quatre réponses FAQ ; frappe, Journaux de session, copie ZIP
  locale et ouverture d’une restauration séparée. L’accès général aux Actions récentes
  du corpus a été ajouté à l’interface.
- Export d’entretien : **chapitre O05 rédigé et vérifié dans le paquet Linux**, deux captures V2
  et quatre réponses dans la section Exports et partage de la FAQ ; sept formats,
  options, sous-titres, HTML, pseudonymisation et contrôle avant diffusion.
- Export de lot : **chapitre O06 rédigé et vérifié dans le paquet Linux**, deux captures
  et quatre nouvelles réponses FAQ ; sélection, formats combinés, copie des médias,
  rapport, bilan et reprise. Un avertissement rappelle que les médias copiés restent
  les originaux même si le texte est pseudonymisé.
- FAQ : **une page unique**, réorganisée en neuf parties et cinquante-deux questions.
  Les pages FAQ thématiques prévues deviennent des sections de cette page.
- `markdown-it` et ses types : retirés ; aucun nouveau lecteur Electron ou Vue.
- Accueil : **essai UX anticipé à la demande**, deux étages et deux colonnes,
  copies d’exemples séparées des corpus personnels, cartes Documentation et FAQ.
  Réalisé et vérifié, à relire ; la consolidation finale reste au lot 8.
- Huit fichiers utilisateur préexistants : **inchangés**.

**À relire d’abord : l’essai d’accueil en deux colonnes et les chapitres T11 à O06.
Prochaine rédaction : O07 — Transférer vers QualCoder.** Le paquet Linux contient O05 et O06,
T13 avec sa restauration vérifiée, T11 et les ajustements d’accueil ; T12 est vérifié localement.
L’installation attend les liens de diffusion. La page générale sur la sauvegarde et
le déplacement reste à rédiger à partir de l’essai désormais réussi. Les procédures
distantes et les paquets Windows/macOS restent à qualifier.
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
Vingt-quatre illustrations V2 accompagnent les chapitres disponibles.

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
| T11 | Commenter un passage — `traiter/commentaires.html` | V2 entretien ; sélection, auteur, édition, retrait et export. | Rédigé et vérifié localement, à relire |
| T12 | Pseudonymiser et vérifier un entretien — `traiter/pseudonymiser.html` | V1 pseudonymisation, V2 vue-corpus ; règles, occurrences, variantes, exceptions et contrôle. | Rédigé et vérifié localement, à relire |
| T13 | Revenir sur une modification — `traiter/annuler-restaurer.html` | V2 journaux et sauvegardes ; vérifier précisément les opérations annulables et leur portée. | Rédigé et vérifié dans le paquet Linux, à relire |

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
| O05 | Exporter un entretien — `organiser/exporter-entretien.html` | V1 export, export V2 ; contenu effectif et options propres à chaque format. | Rédigé et vérifié dans le paquet Linux, à relire |
| O06 | Exporter un lot d’entretiens — `organiser/exporter-corpus.html` | Doc développeur et outil V2 ; sélection, options, rapport, erreurs et annulation. | Rédigé et vérifié dans le paquet Linux, à relire |
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
| F01 | Questions fréquentes — `faq/premiers-pas.html` | Cinquante-deux réponses classées en neuf parties ; ne pas dupliquer les procédures. | Sept réponses acceptées ; quarante-cinq nouvelles à relire |
| F02 | Section Exports et partage de F01 — `faq/premiers-pas.html#exports-partage` | Alimenter lors de A06, T12 et O05–O08. | Huit réponses vérifiées dans le paquet Linux, à compléter et relire |
| F03 | Future section Analyses de F01 | Alimenter lors de N01–N06. | À compléter dans la FAQ unique |
| F04 | Future section Travail collectif et migration de F01 | Alimenter lors de E01–M02, après recettes réelles. | À compléter dans la FAQ unique |
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
natifs restent à qualifier. Les cartes étaient encore prévues au lot 8 à ce stade ;
l’essai anticipé demandé ensuite est décrit ci-dessous. Les huit textes utilisateur
antérieurs sont conservés sans modification.

## 19. Essai UX de l’accueil en deux colonnes

L’utilisateur a demandé d’anticiper l’organisation de l’accueil pour éviter que
les nouvelles cartes repoussent ses corpus récents tout en bas. Il a créé un commit
avant l’essai afin de pouvoir revenir en arrière. La version est implémentée et
vérifiée, **à relire avant de poursuivre T11** ; cela ne clôt pas le lot 8.
Le guide reste à **douze chapitres, trente-deux réponses FAQ et quinze illustrations**.

### Disposition et comportements

- En fenêtre large : **Découvrir SonalPi** à gauche, **Corpus exemples** à droite ;
  puis **Vos corpus** à gauche, **Reprendre votre travail** à droite.
- Après le premier retour utilisateur, Découvrir réunit les quatre cartes :
  **Parcours pas à pas**, **Explorer les corpus exemples**, **Documentation utilisateur**
  et **FAQ**. Explorer est donc à gauche, et non dans le bloc des copies à droite.
  Le site continue d’annoncer son périmètre documentaire partiel.
- Exemples présente les copies récentes. Les deux blocs de droite utilisent des listes
  compactes visibles, avec défilement si nécessaire, dans l’esprit des anciens Récents :
  nom, chemin et retrait, sans tuile par corpus. Les corpus
  d’apprentissage restent dans les parcours. Les récents personnels ne sont pas
  mélangés aux copies libres ; le nom d’un dossier ne sert jamais à les classer.
- À 800 pixels ou moins : récents personnels, actions de corpus, découverte, exemples.
  L’ordre du DOM change aussi : le clavier ne saute pas entre des blocs visuellement
  déplacés par le seul CSS. Le retour à une grande largeur rétablit les deux étages.
- Les listes ont une hauteur bornée. Six copies aux noms longs ne repoussent pas
  le premier corpus personnel hors de la fenêtre testée à 1024 × 768.
- Les quatre commandes locales/distantes sont conservées. **Migration SonalPi1 vers
  SonalPi2** devient une rubrique native repliable, fermée au départ. Les contrôles
  d’ouverture, les assistants et les gardes de migration restent en place.
- Retirer un raccourci récent conserve le dossier et les données ; le catalogue
  garde le travail d’exploration enregistré. Le menu conserve sa liste commune de
  récents, son ordre et ses limites, sans dupliquer la mémoire du profil.

### Code et documentation

- `Accueil.vue` porte la disposition et conserve la demande de connexion lorsqu’un
  récent distant ne peut pas être rouvert seul. `ListeRecents.vue` partage les deux
  listes, les boutons d’ouverture et les retraits ; les chemins restent consultables.
- La réponse des récents locaux peut porter `exemple`, métadonnée transitoire issue
  du marqueur reconnu côté main. Aucun changement de version des fichiers corpus,
  aucune migration, aucun déplacement des dossiers et aucune nouvelle dépendance.
- `application.ouvrirDocumentation` accepte uniquement `guide` ou `faq` et appelle
  le même ouvreur que le menu Aide. Le renderer ne fournit aucun chemin arbitraire.
  L’ouverture ne change pas le corpus courant et ne crée pas de fenêtre Electron.
- Guide de repérage, exemples, corpus local, FAQ et README actualisés pour les nouveaux
  emplacements. Les huit anciens textes Markdown restent inchangés.
- Documentation développeur Accueil actualisée. L’intégration des cartes est anticipée
  dans le plan ; le lot 8 garde la relecture d’ensemble et la livraison.
- Captures de l’essai produites par Electron : `test-results/accueil-deux-colonnes.png`
  et `test-results/accueil-etroit.png`. Ce sont des artefacts de recette ignorés, pas
  de nouvelles illustrations embarquées dans le guide.

### Recette

- Typage, compilation et empaquetage Linux réussis ; `git diff --check` sans erreur.
- **54 tests ciblés réussis**, dont cinq nouveaux tests de composant : classement par
  identité et non par nom, texte échappé, cartes d’aide sans bascule de corpus,
  ordre réactif au clavier, ouverture/retrait et demande de connexion GitLab simulée.
- **37/37 scénarios Electron locaux réussis** : quatre nouveaux scénarios de disposition
  et de cartes, reprise de corpus, catalogue et exercices, menus, imports du guide,
  pilotes documentaires, migrations locales et interface GitLab avec API simulée.
- La nouvelle recette vérifie le classement réel fourni par le main, un corpus personnel
  nommé comme un exemple, l’ouverture puis le retrait d’une copie sans suppression,
  la vue large à 1280 × 800 et la vue étroite à 700 × 800. Le clavier suit la vue étroite.
  Un second cas utilise six copies et deux corpus personnels à 1024 × 768, sans débordement
  horizontal ni disparition du premier récent personnel sous le bas de la fenêtre.
- Les deux cartes ouvrent les pages attendues sans changer le corpus chargé ni ses
  fichiers. Une entrée d’aide inconnue est refusée. Le cas sans récent reste utilisable ;
  la rubrique de migration se déplie au clavier et ouvre l’assistant local.
- **5/5 scénarios réussis dans le paquet Linux** : les quatre nouveaux scénarios, puis
  consultation des douze chapitres et quinze images hors ligne, sans JavaScript,
  à 390 pixels. Les cartes visent bien `resources/documentation` du paquet.
- Une première campagne a réussi **34/36** : l’attente d’un sous-titre de parcours était
  restée sur « Suivi et documents du projet » alors que le code déjà présent affiche
  « Tableau de bord et documents du projet » ; le pilote Corpus comparait le bouton
  entier, qui contenait alors aussi le chemin, au seul nom du dossier. Le retour UX
  suivant remet le chemin à côté du bouton, dans une ligne compacte. Les attentes
  ont été ajustées au libellé réel et au sous-élément du nom. La campagne finale ajoute
  le cas des nombreuses copies et réussit 37/37.
- Les recettes de migration déplient maintenant la rubrique avant de choisir leur
  assistant. Le helper de qualification GitLab est adapté, mais aucun serveur réel
  n’a été sollicité : cette évolution ne qualifie ni réseau ni publication distante.
- Retours visuels suivants : Explorer rejoint les quatre cartes de Découvrir, les
  deux listes de droite redeviennent des lignes compactes, puis leurs fonds passent
  au vert clair (`#edf7ed`, bordure `#c9dfcb`). Les blocs de gauche gardent leur fond.
  Les 54 tests ont été rejoués après le déplacement de la carte ; la campagne longue
  suivante a été interrompue par la nouvelle demande après 34 réussites sans échec.
  Compilation et **4/4 scénarios de disposition** ont ensuite réussi avec le vert clair.
  Les captures sont renouvelées. Le paquet Linux précédent ne comprend pas encore
  ces derniers ajustements visuels.
- Nouvel essai demandé : suppression du fond et du cadre des deux sections de listes.
  Une section vide n’est plus rendue, y compris après retrait du dernier raccourci.
  Les cartes de création, d’ouverture et d’exploration restent proposées. Les positions
  de la grille sont explicites en fenêtre large pour qu’une liste absente ne déplace
  pas une carte de gauche vers la droite ; l’ordre du DOM reste prioritaire en étroit.
  **9/9 tests de composant et 6/6 scénarios Electron réussis**, avec les quatre
  combinaisons de listes, la disparition au dernier retrait, les cadres absents,
  les noms longs et les largeurs 1280, 1024 et 700 pixels. Les attentes d’ordre utilisent
  désormais les identifiants des sections pour préserver les retouches de libellés
  faites en parallèle par l’utilisateur. Typage et compilation réussis ; captures
  renouvelées, dont `test-results/accueil-sans-recents.png`. Pas de nouvel empaquetage.
- Ajustement visuel suivant : les deux titres d’accès sont soulignés ; leurs listes
  sont décalées de 0,85 rem vers la droite. La carte Vos corpus reçoit le fond vert
  clair ; le titre d’accès aux corpus de travail et leurs noms utilisent un vert foncé.
  Le bleu des exemples est conservé. Compilation et **6/6 scénarios Electron** réussis,
  avec vérification des couleurs, du soulignement et du décalage dans la fenêtre réelle.
- La rubrique Migration est ensuite limitée à la colonne de gauche ; la migration
  GitLab est placée sous la migration locale. L’ordre reste naturel en fenêtre étroite.
  Compilation et **6/6 scénarios Electron** réussis, avec contrôle de la largeur de
  la rubrique et de l’empilement des deux entrées.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/accueilRenderer.test.ts test/exemples.test.ts test/transitionContexte.test.ts test/documentation.test.ts test/menuApplication.test.ts
npm run build
npx playwright test e2e/accueil-disposition.e2e.ts e2e/multi-corpus.e2e.ts e2e/demo.e2e.ts e2e/menu-application.e2e.ts e2e/migration-v1.e2e.ts e2e/documentation.e2e.ts e2e/documentation-socle.e2e.ts e2e/documentation-pilotes.e2e.ts --project=local --workers=1
npm run pack:dir
ACCUEIL_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/accueil-disposition.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Recueillir le retour sur cet essai UX, puis reprendre **T11 — Commenter un passage**.
Les procédures distantes et les paquets Windows/macOS restent à qualifier ; les liens
publics d’installation et l’essai de restauration restent les autres prérequis ouverts.

## 20. Accueil de Préparation et suivi

À la demande de l’utilisateur, l’onglet **Accueil** ne montre plus la grille du
Tableau de bord dans sa partie droite. Il affiche une introduction à l’espace et
le lien vers le kit pédagogique fourni :
`https://logiquali-41533a.gitpages.huma-num.fr/`.
La formulation est corrigée grammaticalement ; le terme « enquête quantitative »
est conservé conformément au texte demandé.

### Réalisation

- `PreparerSuivre.vue` affiche la présentation uniquement sur Accueil. La grille
  devient visible dans son seul onglet **Tableau de bord**. Elle reste montée pour
  conserver les brouillons et les réglages ; les boutons de gauche restent disponibles.
- Le lien est utilisable au clavier et s’ouvre dans le navigateur habituel, pas dans
  la fenêtre Electron. Son URL est fixe dans `src/shared/ressourcesPedagogiques.ts`.
- `application.ouvrirKitPedagogique` n’accepte aucune URL du renderer : le main ouvre
  seulement cette ressource. Les protections de navigation de la fenêtre ne sont
  pas assouplies ; un refus d’ouverture reçoit un message compréhensible.
- Documentation développeur des espaces et du tableau de bord actualisée. Le guide
  conserve ses douze chapitres, trente-deux réponses FAQ et quinze illustrations.
  La capture `test-results/accueil-preparation.png` reste un artefact de recette ignoré.

### Vérifications

- Typage et compilation réussis.
- **60 tests ciblés réussis** : navigation par espaces, sécurité de la fenêtre,
  modèle et commandes du tableau de bord, documentation. Deux nouveaux tests
  vérifient l’adresse précise du kit et l’erreur d’ouverture du navigateur.
- **17/17 scénarios Electron locaux réussis** : nouvelle recette Accueil de
  Préparation, cinq parcours de navigation, quatre de conservation du contexte,
  six du tableau de bord et le parcours pédagogique complet de préparation.
- Le nouveau scénario vérifie l’introduction et l’absence de grille sur Accueil,
  le lien activé au clavier, la conservation de l’URL applicative et d’une seule
  fenêtre Electron, puis l’accès au tableau, la conservation d’un brouillon après
  aller-retour sur Accueil et le retour à l’entretien. Les fichiers du corpus et
  de l’entretien sont comparés : aucune modification par la consultation.
- L’ouverture du navigateur est interceptée pendant la recette : elle qualifie
  l’adresse et la délégation, pas la disponibilité ou le contenu du site externe.
  Aucun banc distant réel n’a été sollicité.
- L’ancien test de navigation attendait encore les titres Colonne/Ligne/Badges ;
  l’interface déjà présente affiche Ajouter une colonne/ligne/un badge. Cette
  attente périmée a été ajustée sans modifier les libellés de l’application.
  Après interruption de la première campagne, la campagne finale réussit 17/17.
- Le paquet n’a pas été régénéré pendant ces ajustements UX ; sa recette sera
  renouvelée avec la disposition retenue après relecture.

Reproduction :

```bash
npm run typecheck
npx vitest run test/documentation.test.ts test/securiteFenetre.test.ts test/espacesTravail.test.ts test/tableaubord.test.ts test/tableaubordRenderer.test.ts
npm run build
npx playwright test e2e/accueil-preparation.e2e.ts e2e/espaces.e2e.ts e2e/espaces-contexte.e2e.ts e2e/tableaubord.e2e.ts e2e/preparation-pas-a-pas.e2e.ts --project=local --workers=1
```

La suite documentaire prévue à ce stade était **T11 — Commenter un passage**,
réalisée ci-dessous.

## 21. Commenter un passage

Page ajoutée : [Commenter un passage](../../docs/user/traiter/commentaires.html).
La navigation l’insère après les notes et avant la FAQ. Le guide comporte désormais
**treize chapitres**, **trente-six réponses FAQ** et **seize illustrations V2**.

### Sources et adaptations

- V2 : `MenuContexte.vue`, `EditionCommentaire.vue`, `useAnnotationsEntretien.ts`,
  `commentairesMarge.ts`, le remappage des annotations et le journal de l’entretien.
  Les tutoriels V1 examinés ne fournissaient pas de procédure autonome équivalente.
- Une sélection à la souris, puis un clic droit dans cette sélection, ouvre
  **Commenter la sélection**. La plage est ajustée aux mots ; l’auteur est facultatif
  et le dernier signataire validé est proposé lors de la création suivante.
- La carte en marge et la teinte du passage sont distinctes du texte transcrit.
  Les cartes sont masquées sous 1 000 pixels de largeur ; la teinte et le clic droit
  restent disponibles. Plusieurs commentaires peuvent se chevaucher.
- Le clic sur une carte ou l’entrée du menu contextuel ouvre la même fenêtre pour
  modifier l’auteur ou le texte. **Annuler** et Échap conservent la version précédente ;
  Ctrl+Entrée valide. Les changements suivent l’enregistrement de l’entretien.
- Les notes peuvent référencer un commentaire sans en copier le texte. Sa suppression
  conserve la note et la transcription ; le journal de la session peut rétablir
  la création, la modification ou la suppression tant que l’entretien reste ouvert.
- Les exports TXT, SRT, VTT, DOCX et PDF ne rendent pas les commentaires. Le `.sonal`
  complet et l’HTML les conservent ; QualCoder les reprend comme annotations.
  Leur auteur et leur texte ne sont pas pseudonymisés automatiquement.

### Correction rencontrée pendant la recette

Le clic droit et les cartes pouvaient encore ouvrir les commandes de commentaire
alors que l’entretien était annoncé en lecture seule. Le plugin laisse désormais
le menu natif dans cet état et les fonctions de création, d’édition, de validation
et de suppression refusent la mutation. Les cartes restent visibles, avec un curseur
de consultation. Aucun format de fichier ni service distant n’est modifié.

### Documentation et capture

- Sommaire HTML, README, navigation Notes/Commentaires/FAQ et quatre réponses FAQ
  actualisés : marge masquée, suppression, pseudonymisation et formats d’export.
- Capture `medias/commentaire-passage.png`, produite dans la vraie application sur
  une copie temporaire de **Entretiens déjà importés**, **1Coordinatrice** : passage
  « ça devait être en 2012 », auteur Karine D. et vérification du carnet de terrain.
- Documentation développeur ajoutée dans `docs/dev/traiter/commentaires.md`.

### Recette

- Typage, compilation et empaquetage Linux réussis ; `git diff --check` sans erreur.
- **64 tests ciblés réussis** : modèle et journal des commentaires, migration `.sonal`,
  formats d’export, golden `.sonal`, QualCoder et liens du site documentaire.
- **9/9 scénarios Electron locaux réussis** : création, teinte et marge, modification,
  suppression, persistance, retrait contextuel d’un codage, liaison depuis une note,
  lecture seule et parcours documentaire hors ligne.
- Le nouveau scénario principal utilise une copie de **1Coordinatrice**. Il vérifie
  la sélection réelle, la mémorisation du signataire, la carte et le survol depuis
  le passage, l’édition, l’annulation d’un second commentaire, la marge masquée à
  900 pixels, l’export `.sonal`, la suppression immédiate puis le rétablissement par
  le Journal. La transcription, les ancres et les locuteurs restent identiques.
- Le second scénario ouvre un entretien avec une réponse simulée en lecture seule :
  la carte reste consultable, sans menu SonalPi ni fenêtre d’édition, et le fichier
  n’est pas modifié. Aucun verrou distant réel n’est qualifié.
- **3/3 scénarios réussis dans le paquet Linux** : les deux recettes T11 et la lecture
  des treize chapitres, seize images et trente-six réponses FAQ hors ligne, sans
  JavaScript, à 390 pixels. Le paquet inclut aussi les derniers ajustements d’accueil.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/commentaires.test.ts test/commentairesMigration.test.ts test/exportFormats.test.ts test/exportSonalGolden.test.ts test/exportQualcoder.test.ts test/documentation.test.ts
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-commentaires.e2e.ts --project=local --workers=1
npx playwright test e2e/documentation-commentaires.e2e.ts e2e/commentaires.e2e.ts e2e/notes-feuille.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
COMMENTAIRES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-commentaires.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Faire relire T11 et les quatre réponses FAQ, puis poursuivre le lot 4 avec
**T12 — Pseudonymiser et vérifier un entretien**, suivi de l’export d’entretien.
L’installation attend les liens publics ; la sauvegarde attend toujours un essai
de restauration. Les procédures distantes et les paquets Windows/macOS restent
à qualifier.

## 22. Pseudonymiser et vérifier un entretien

Page ajoutée : [Pseudonymiser et vérifier un entretien](../../docs/user/traiter/pseudonymiser.html).
La navigation l’insère après les commentaires et avant la FAQ. Le guide comporte
maintenant **quatorze chapitres**, **quarante réponses FAQ** et **dix-huit illustrations V2**.

### Sources et périmètre

- Sources développeur relues intégralement : vue d’ensemble, entretien, corpus,
  fournisseurs et sorties sous `docs/dev/traiter/pseudonymisation/`.
- Sources applicatives vérifiées dans le panneau d’entretien, le tableau corpus,
  le menu contextuel, le modèle des définitions et le rapport d’export.
- Le chapitre explique le parcours courant : sélection ou saisie d’une entité,
  pseudonyme, brouillon, portée entretien ou corpus, occurrences, exceptions,
  variantes, compteurs, contrôle transversal et sortie pseudonymisée.
- Le texte original reste stocké. La vue d’entretien barre l’occurrence et affiche
  son pseudonyme ; l’export applique la projection seulement si l’option correspondante
  est activée. Une exception reste volontairement en clair.
- Plusieurs graphies partagent un seul pseudonyme. Une seule entité peut déclarer
  deux variantes, choisies occurrence par occurrence. Les deux formes ne peuvent
  pas être combinées dans la même définition.
- Le contrôle corpus distingue pseudonymisés, exceptions, passages à traiter et
  inclusions. Une règle partagée ne décide pas automatiquement les autres entretiens.
- Le chapitre reste centré sur les gestes usuels. Les opérations globales avancées
  de renommage, retrait de variante, dissociation et suppression restent documentées
  côté développeur et seront reprises dans les chapitres d’organisation ou de
  travail collectif adaptés.

### Documentation et captures

- Sommaire HTML, README, navigation Commentaires/Pseudonymisation/FAQ et quatre
  réponses FAQ actualisés : anonymat, passages à traiter, exceptions et variantes.
- `medias/pseudonymisation-entretien.png` montre **Fatima → Nadia** dans
  **1Coordinatrice**, avec une occurrence pseudonymisée et une exception.
- `medias/verification-pseudonymisation.png` montre la même règle dans le tableau
  corpus, ses deux compteurs et le détail de l’entretien.
- La page rappelle séparément les pseudonymes de locuteurs, les notes, commentaires,
  données, titres, fichiers et médias. Le rapport d’export est présenté comme une
  aide au contrôle, jamais comme une garantie d’anonymat.
- Aucun changement applicatif n’a été nécessaire.

### Recette

- Typage, compilation, empaquetage Linux et `git diff --check` réussis.
- **322 tests ciblés réussis** dans 25 fichiers : définitions, brouillons, décisions,
  compteurs, scans, variantes, lots, projections, sorties et liens documentaires.
- **26/26 scénarios Electron locaux réussis** : les deux nouvelles recettes manuelles,
  le parcours documentaire, le tableau et les échanges de règles, variantes,
  dissociations, retraits et suppressions locales.
- La recette principale installe une copie temporaire de **Entretiens déjà importés**,
  applique **Nadia** aux deux mentions de **Fatima**, pousse la règle au corpus,
  laisse la dernière occurrence en exception puis contrôle et valide ses états dans
  la vue corpus. Le texte, les ancres et les locuteurs restent identiques.
- La seconde recette déclare **Nadia / Amina** et bascule une occurrence avec le menu
  contextuel. Elle vérifie un compteur par variante. Rejouée trois fois de suite,
  elle reste stable après l’attente explicite du remplissage depuis la sélection.
- **3/3 scénarios réussis dans le paquet Linux** : les deux recettes T12 et la lecture
  hors ligne, sans JavaScript, des quatorze chapitres, dix-huit images et quarante
  réponses FAQ à 390 pixels.
- Aucun serveur GitLab ou Nextcloud réel n’a été sollicité. Le chapitre n’annonce
  donc pas de différence distante non qualifiée ; les protocoles fournisseurs restent
  couverts par leur documentation et leurs recettes dédiées.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/anonymisation.test.ts test/anonymisationPromotion.test.ts test/basculeAnon.test.ts test/brouillonsAnon.test.ts test/compteursAnon.test.ts test/definitionsAnon.test.ts test/definitionsAnonLocales.test.ts test/editionPseudosAnon.test.ts test/editionPseudosAnonRenderer.test.ts test/legendeAnonRenderer.test.ts test/lotAnon.test.ts test/presentationAnon.test.ts test/projectionTexteAnon.test.ts test/pseudonymisationCoherence.test.ts test/pseudonymisationCorpus.test.ts test/pseudonymisationExport.test.ts test/pseudonymisationProjection.test.ts test/pseudonymisationSorties.test.ts test/retraitVarianteAnon.test.ts test/retraitVarianteAnonPanneau.test.ts test/retraitVarianteAnonRenderer.test.ts test/scanAnon.test.ts test/tableReglesAnonRenderer.test.ts test/variantesAnon.test.ts test/documentation.test.ts
npm run build
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-pseudonymisation.e2e.ts --project=local --workers=1
npx playwright test e2e/documentation-pseudonymisation.e2e.ts e2e/anonymisation.e2e.ts e2e/dissociation-anon.e2e.ts e2e/retrait-variante-anon.e2e.ts e2e/suppression-anon.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
PSEUDONYMISATION_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-pseudonymisation.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Faire relire T12 et ses quatre réponses FAQ, puis poursuivre avec
**T13 — Revenir sur une modification**. L’installation attend les liens publics ;
la sauvegarde attend toujours un essai de restauration. Les procédures distantes
et les paquets Windows/macOS restent à qualifier.

## 23. Revenir sur une modification

Page ajoutée : [Revenir sur une modification](../../docs/user/traiter/annuler-restaurer.html).
La navigation l’insère après la pseudonymisation et avant la FAQ. Le guide comporte
maintenant **quinze chapitres**, **quarante-quatre réponses FAQ** et
**vingt illustrations V2**.

### Sources et périmètre

- Le chapitre distingue quatre mécanismes réels : annuler avant validation, l’historique
  de frappe ProseMirror, les Journaux d’actions en mémoire et la copie ZIP persistante.
- Le Journal de l’entretien garde dix inverses pendant l’ouverture : codages,
  commentaires, attribution ou renommage de locuteur et valeurs de variables.
  La frappe reste dans `Ctrl/Cmd+Z` et possède son propre rétablissement.
- Le Journal du corpus garde dix actions locales prises en charge, principalement
  certaines modifications de notes et de Personnes. Les états annulable,
  inapplicable et bloqué sont expliqués sans promettre une reprise distante.
- La sauvegarde ZIP est créée après vidage des écritures en attente. Elle conserve
  le corpus, pas les médias externes, et se restaure en la décompressant dans un
  dossier vide ouvert comme corpus distinct.
- L’essai demandé de restauration a réussi : l’état sauvegardé est rouvert dans
  un nouveau dossier tandis que le corpus de travail conserve ses modifications
  plus récentes.

### Documentation et interface

- Sommaire HTML, README, navigation Pseudonymisation/Annulation/FAQ et quatre
  réponses FAQ actualisés : fermeture du Journal, flèche grisée, différence entre
  Journal et sauvegarde, présence des médias dans le ZIP.
- `medias/journal-entretien.png` montre trois catégories d’actions annulables dans
  l’entretien, avec une transcription et un commentaire réels de la recette.
- `medias/actions-recentes-corpus.png` montre l’annulation d’une note modifiée
  depuis la vue corpus.
- La fenêtre générale **Actions récentes** du corpus était implémentée mais seulement
  exposée avec un filtre depuis Personnes. Un bouton accessible a été ajouté dans
  la barre du corpus et dans la présentation de son Accueil.
- Une page développeur centralise les limites des deux Journaux, l’archive et leurs
  recettes dans `docs/dev/traiter/journaux-sauvegardes.md`.

### Recette

- Typage, compilation, empaquetage Linux et `git diff --check` réussis.
- **41 tests ciblés réussis** dans cinq fichiers pour les Journaux, le ZIP et les
  liens documentaires.
- **7/7 scénarios Electron locaux réussis** : deux recettes T13, trois scénarios du
  Journal d’entretien, le scénario Personnes du corpus et la lecture documentaire.
- La première recette vérifie `Ctrl/Cmd+Z`, le rétablissement, trois entrées du
  Journal d’entretien, l’annulation isolée d’un codage, la remise à zéro après
  fermeture, la modification d’une note depuis le corpus et son annulation dans
  la fenêtre générale.
- La seconde crée un ZIP après renommage, modifie ensuite le corpus courant,
  décompresse l’archive dans un autre dossier et vérifie que les deux états restent
  séparés.
- Le scénario existant du Journal du corpus reprend désormais explicitement
  l’espace **Importer et traiter** après changement de corpus ; il ne dépend plus
  de l’espace mémorisé précédemment.
- **3/3 scénarios réussis dans le paquet Linux** : les deux recettes T13 et la
  lecture hors ligne, sans JavaScript, des quinze chapitres, vingt images et
  quarante-quatre réponses FAQ à 390 pixels.
- Aucun serveur GitLab ou Nextcloud réel n’a été sollicité. Le Journal distant est
  annoncé comme indisponible, conformément à l’interface actuelle.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/journal.test.ts test/journalCorpus.test.ts test/journalCorpusRenderer.test.ts test/archiveCorpus.test.ts test/documentation.test.ts
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-annuler-restaurer.e2e.ts --project=local --workers=1
npx playwright test e2e/documentation-annuler-restaurer.e2e.ts e2e/journal.e2e.ts e2e/journal-corpus.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
JOURNAL_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-annuler-restaurer.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Faire relire T13 et ses quatre réponses FAQ, puis poursuivre avec
**O05 — Exporter un entretien**. La future page générale sur la sauvegarde et le
déplacement pourra reprendre l’essai de restauration désormais réussi.
L’installation attend les liens publics ; les procédures distantes et les paquets
Windows/macOS restent à qualifier.

## 24. Exporter un entretien

Page ajoutée : [Exporter un entretien](../../docs/user/organiser/exporter-entretien.html).
Elle ouvre la partie **Organiser et exporter** du sommaire. Une nouvelle page
La section [Exports et partage](../../docs/user/faq/premiers-pas.html#exports-partage)
complète la FAQ unique avec quatre réponses. Le guide comporte maintenant **seize chapitres**,
**quarante-huit réponses FAQ** et **vingt-deux illustrations V2**.

### Sources et périmètre

- Les sept formats de la fenêtre ont été vérifiés dans les générateurs et dans
  l’application : SONAL, TXT, SRT, VTT, HTML, DOCX et PDF.
- Le chapitre distingue les formats de lecture, les sous-titres et le fichier
  d’échange SONAL. Aucun export individuel n’est présenté comme une sauvegarde
  du corpus V2.
- Les options sont expliquées selon leur effet réel : en-tête, notes publiques,
  variables non privées, coordonnées, locuteurs, thèmes et pseudonymisation.
- SRT et VTT n’émettent que les segments possédant deux bornes valides. Le HTML
  référence éventuellement le média local sans le copier ; sa version
  pseudonymisée retire le lecteur.
- Les commentaires sont conservés dans SONAL et dans le contenu technique du
  HTML, mais ne sont pas rendus dans la page. Ils sont absents de TXT, SRT, VTT,
  DOCX et PDF.
- Le rapport de pseudonymisation reste une aide au contrôle. Titres, notes,
  commentaires, catégories, variables et médias demandent une vérification séparée.

### Corrections applicatives

- Les catégories de notes étaient disponibles dans la source de l’export, mais
  perdues lors de la construction de l’instantané. Elles sont maintenant portées
  jusqu’aux sorties individuelles et de lot ; les notes retrouvent leur vraie rubrique.
- Les descriptions de formats ne présentent plus SONAL comme une sauvegarde et
  précisent les limites temporelles des sous-titres et la référence externe du média HTML.
- Le CSS de thème du HTML pouvait produire les valeurs invalides `null` ou un nombre
  isolé à la place de la règle de taille. Il émet maintenant la taille valide et
  espace correctement le libellé d’une variable de sa valeur.

### Documentation et captures

- `medias/options-export-entretien.png` montre les options HTML, la
  pseudonymisation et son avertissement.
- `medias/export-entretien-html.png` montre la sortie réelle avec une note publique,
  une variable, la légende, un codage et une transcription pseudonymisée. Le titre
  et la note restent volontairement en clair pour illustrer le contrôle nécessaire.
- La navigation relie Annulation, Export d’entretien et la section Exports et partage
  de la FAQ. Le sommaire possède désormais trois parties non vides.

### Recette

- Typage, compilation, empaquetage Linux et `git diff --check` réussis.
- **89 tests ciblés réussis** dans cinq fichiers pour les formats, les services,
  la pseudonymisation et le site documentaire.
- **3/3 scénarios Electron locaux réussis** : la nouvelle recette des sept formats,
  le round-trip SONAL existant et la lecture documentaire hors ligne.
- La nouvelle recette produit les sept fichiers à partir d’un entretien contenant
  repères temporels, codage, commentaire, note publique et privée, variable publique
  et privée, pseudonyme et décision textuelle. Elle inspecte les fichiers TXT, SRT,
  VTT, HTML, SONAL et DOCX, puis vérifie la signature et la taille du PDF.
- La page HTML exportée est rouverte hors ligne, sans JavaScript, avant sa capture.
  Le rapport de pseudonymisation est consulté et enregistré séparément.
- **2/2 scénarios réussis dans le paquet Linux** : la recette O05 et la lecture
  hors ligne des seize chapitres, vingt-deux images et de la FAQ unique.
- Aucun serveur GitLab ou Nextcloud réel n’a été sollicité. Le chapitre reste
  centré sur l’entretien ouvert et n’annonce pas de publication distante.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/exportFormats.test.ts test/exportEntretienService.test.ts test/exportCorpusService.test.ts test/pseudonymisationExport.test.ts test/documentation.test.ts
SONAL_DOC_CAPTURES=1 npx playwright test e2e/documentation-exporter-entretien.e2e.ts --project=local --workers=1
npx playwright test e2e/documentation-exporter-entretien.e2e.ts e2e/import-export.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
EXPORT_ENTRETIEN_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-exporter-entretien.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Faire relire O05, ses deux captures et les quatre réponses Exports et partage, puis
poursuivre avec **O06 — Exporter un lot d’entretiens**. L’installation attend les
liens publics ; les procédures distantes et les paquets Windows/macOS restent à qualifier.

## 25. Regrouper la FAQ en une page structurée

À la suite de la relecture utilisateur, les deux pages de FAQ ont été regroupées.
Le chemin historique `faq/premiers-pas.html` est conservé pour ne pas casser le menu
Aide ni les liens déjà présents, mais la page s’intitule désormais simplement
**Questions fréquentes**.

### Organisation retenue

Les quarante-huit questions sont classées sous neuf parties :

1. Démarrer et retrouver un corpus ;
2. Transcriptions, entretiens et médias ;
3. Codage et thèmes ;
4. Locuteurs et prises de parole ;
5. Variables et données ;
6. Notes et commentaires ;
7. Pseudonymisation ;
8. Annulation et sauvegarde ;
9. Exports et partage.

Chaque partie est un titre de niveau 2 et chaque question un titre de niveau 3.
Le sommaire renvoie aux neuf parties plutôt que d’afficher une liste plate de
quarante-huit liens. La page séparée `faq/fichiers-partage.html` a été retirée ;
ses quatre réponses sont intégrées dans **Exports et partage**.

Les anciennes destinations F02 à F04 du plan deviennent des sections thématiques
à compléter dans F01, et non de nouvelles pages. Cette règle sera appliquée aux
futures questions sur les analyses, le travail collectif et la migration.

### Vérification

- `test/documentation.test.ts` vérifie tous les liens et toutes les ancres de la
  page fusionnée.
- `e2e/documentation.e2e.ts` vérifie les neuf parties, les quarante-huit questions,
  la navigation depuis le chapitre Export et l’affichage étroit hors ligne.
- Le test documentaire réussit localement et dans le paquet Linux, sans JavaScript.
- Le guide reste à **seize chapitres**, **quarante-huit réponses FAQ** et
  **vingt-deux illustrations V2**.

### Suite

Poursuivre avec **O06 — Exporter un lot d’entretiens**. Les nouvelles questions
seront ajoutées dans la partie adaptée de la FAQ unique.

## 26. Exporter un lot d’entretiens

Page ajoutée : [Exporter un lot d’entretiens](../../docs/user/organiser/exporter-corpus.html).
Le guide comporte **dix-sept chapitres**, **cinquante-deux réponses FAQ** classées
sous neuf parties et **vingt-quatre illustrations V2**.

### Périmètre et relecture

- Vérification des fichiers déjà préparés : recette, panneau, service d’export,
  écriture des fichiers et captures. Les assertions de la recette ont été complétées
  avec une sélection partielle, un PDF combiné et un média local réellement copié.
- Le chapitre explique la sélection des entretiens, TXT/HTML individuels, DOCX/PDF
  combinés, le rapport séparé, l’index, les erreurs partielles et l’arrêt après
  l’entretien courant. Il ne présente pas le lot comme une sauvegarde.
- L’index et les titres des fichiers ou documents peuvent rester identifiants.
  Réutiliser un dossier peut remplacer l’index ou les documents combinés ; le guide
  recommande donc une destination neuve pour chaque essai.
- Les copies de médias restent des originaux même si les pages sont pseudonymisées
  et sans lecteur. Un avertissement explicite est ajouté au panneau lorsque cette
  copie est cochée. Le libellé de la case conserve aussi sa disposition sur une ligne
  de texte cohérente.
- Quatre réponses sont ajoutées à la section Exports et partage de la FAQ unique :
  document combiné, médias originaux, arrêt et réussite partielle.
- Sommaire, README, navigation et documentation développeur actualisés.

### Captures

- `medias/export-corpus-reglages.png` montre deux entretiens et les formats choisis
  à gauche, avec le récapitulatif à droite.
- `medias/export-corpus-resultat.png` montre le bilan réussi, recadré sur son contenu
  utile sans la zone vide du panneau.

### Recette

- Typage et compilation réussis ; paquet Linux reconstruit ; `git diff --check` réussi.
- **41 tests ciblés réussis** dans quatre fichiers : assemblage du corpus, service du
  lot, DOCX combiné et intégrité du site documentaire. L’arrêt en cours de lot et
  la conservation de l’index partiel sont notamment couverts par le service.
- **10/10 scénarios Electron locaux réussis** : trois recettes documentaires de lot,
  six scénarios existants d’export de corpus et lecture documentaire.
- La première recette produit TXT, HTML et DOCX pour deux entretiens, consulte et
  enregistre le rapport, inspecte les fichiers et l’index, puis produit un second
  lot partiel avec un PDF combiné.
- La recette média vérifie que les WAV copiés sont identiques aux originaux, avec
  et sans pseudonymisation. Elle rouvre la page HTML non pseudonymisée hors ligne
  et vérifie que son lecteur charge le média par un chemin relatif.
- La troisième recette vérifie qu’un entretien illisible n’empêche pas un bilan
  partiel, qu’il reste absent de l’index et que l’annulation du choix de dossier
  permet de reprendre les réglages sans écrire de nouveau lot.
- **4/4 scénarios réussis dans le paquet Linux** : trois recettes de lot et navigation
  hors ligne, sans JavaScript, des dix-sept chapitres et de la FAQ à 390 pixels.
- Aucun serveur GitLab ou Nextcloud réel n’a été sollicité. Les affirmations du
  chapitre ne constituent pas une qualification de ces fournisseurs.

Commandes principales :

```bash
npm run typecheck
npx vitest run test/exportCorpus.test.ts test/exportCorpusService.test.ts test/exportDocxCorpus.test.ts test/documentation.test.ts
npx playwright test e2e/documentation-exporter-lot.e2e.ts e2e/export-corpus.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
npm run pack:dir
EXPORT_LOT_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" DOCS_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" npx playwright test e2e/documentation-exporter-lot.e2e.ts e2e/documentation.e2e.ts --project=local --workers=1
```

### Suite

Faire relire O06 et ses quatre réponses FAQ, puis poursuivre avec
**O07 — Transférer vers QualCoder**. L’installation attend les liens publics ;
les procédures distantes et les paquets Windows/macOS restent à qualifier.


