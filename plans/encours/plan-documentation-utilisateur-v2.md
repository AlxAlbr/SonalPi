# Refonte de la documentation utilisateur SonalPi V2

Statut : en cours. Le cadrage et les pages pilotes ont été acceptés. Le lot 3
utilise désormais des pages HTML écrites directement, ouvertes dans le navigateur
habituel depuis le menu Aide. La navigation hors ligne et l’inclusion dans le
paquet Linux sont vérifiées. Le premier sous-lot du socle V1 ajoute la présentation,
la découverte des exemples et l’import des transcriptions. La gestion des entretiens,
la correction, les locuteurs, les thèmes, les données, les notes, les commentaires,
la pseudonymisation, l’annulation et l’export d’un entretien portent l’ensemble
à seize chapitres et quarante-huit réponses FAQ.
L’import Word/PDF a été repris de la V1 ; les TXT tabulés Tadddam/NVivo et les noms
SRT ont été adaptés de Whispurge. La table de données propose maintenant un export
CSV des colonnes affichées, avec variables privées sur choix explicite. Le guide
enrichi et cet export sont vérifiés dans le paquet Linux.
Le bilan des locuteurs demandé ensuite reprend les tours, mots, parts et navigation
V1, avec des durées estimées seulement sur les passages chronométrés. Sa recette,
sa capture et le guide enrichi sont également vérifiés dans le paquet Linux.
Le chapitre Notes est ensuite rédigé et vérifié, avec deux captures et quatre réponses
FAQ : enregistrement, catégories, consultation, statuts et export Markdown. Aucune
modification applicative n’a été nécessaire pour ce sous-lot.
L’utilisateur a ensuite demandé d’essayer l’organisation de l’accueil avant la fin
du manuel. Une version en deux étages et deux colonnes est implémentée, à relire :
exemples et copies séparés des corpus personnels, documentation et FAQ accessibles.
Le lot 8 conserve la consolidation et la livraison finale.
L’accueil de Préparer et suivre est également ajusté à la demande : introduction
et lien vers le kit pédagogique à droite, grille réservée à l’onglet Tableau de bord.
Le chapitre Commentaires suit avec une capture et quatre réponses FAQ : sélection,
marge, édition, suppression, liens depuis les notes et précautions d’export. Une
garde ciblée empêche les mutations dans un entretien ouvert en lecture seule.
Le chapitre Pseudonymisation ajoute ensuite deux captures et quatre réponses FAQ :
portées, occurrences, variantes, exceptions, contrôle corpus et rapport avant export.
Le chapitre Revenir sur une modification distingue la frappe, les deux Journaux de
session et la sauvegarde ZIP. Sa recette restaure l’archive dans un dossier séparé ;
l’accès général aux Actions récentes du corpus est ajouté à l’interface.
Le chapitre Exporter un entretien vérifie ensuite les sept formats, leurs options,
les sous-titres et les données sensibles. La FAQ unique est réorganisée en neuf
parties, dont une section consacrée aux exports et au partage.

Le [suivi de rédaction](suivi-documentation-utilisateur-v2.md) contient
le sommaire détaillé, la matrice des sources, les divergences et les recettes.
Les chapitres se lisent depuis le [sommaire utilisateur](../../docs/user/index.html).

## 1. Objectif

Repartir d’une structure éditoriale neuve pour produire une documentation V2
accessible aux personnes qui découvrent SonalPi, en adaptant la pédagogie des
tutoriels V1 plutôt qu’en convertissant mécaniquement leurs pages.

L’essai UX anticipé répartit les entrées sur deux étages, sans repousser les récents :

```text
Découvrir SonalPi                   Corpus exemples
[Parcours] [Explorer les exemples]  Liste des copies récentes
[Documentation utilisateur] [FAQ]   (défilement si nécessaire)

Vos corpus                         Reprendre votre travail
[Créer / ouvrir local ou distant]  [Corpus personnels récents]

[Migration SonalPi1 vers SonalPi2 — rubrique repliable]
```

Après le premier retour, Explorer les corpus exemples rejoint Découvrir SonalPi ;
les deux blocs de droite présentent des listes compactes, sans cartes par corpus.
Un nouvel essai retire aussi le fond et le cadre des sections de listes, et les masque
entièrement lorsqu’elles sont vides, sans déplacer les cartes de gauche.

En fenêtre étroite, les corpus personnels récents passent en premier, puis les
commandes de corpus, la découverte et les exemples. Le clavier suit ce même ordre.

Les quatre entrées répondent à des besoins différents :

- **Parcours pas à pas** : apprendre en réalisant des exercices accompagnés.
- **Explorer les corpus exemples** : essayer librement les outils.
- **Documentation utilisateur** : comprendre une notion ou réaliser une tâche.
- **FAQ** : obtenir une réponse courte à une question ou à une difficulté.

La documentation et la FAQ ne doivent pas créer de corpus d’exercice ni lancer
un parcours. Leur consultation ne doit pas modifier le travail courant.

## 2. Ce que montre l’examen initial

### Sources consultées

- V1 : `/home/belignem/Vscode/SonalPi`, branche `main`, commit `e8bebf9`, dossier
  `Tutos/`. Le dépôt local est sur `main`, sans modification de travail.
- V2 : les huit fichiers de `docs/user/`, soit environ 1 540 lignes.
- Interface : `src/renderer/components/accueil/Accueil.vue`, `src/renderer/App.vue`
  et l’organisation des composants.
- Repères V2 : documentation développeur sur la navigation, les parcours guidés
  et les exports ; formulaires de création et d’ouverture des corpus distants.

Cet examen permet de cadrer la refonte. Il ne remplace pas la vérification de
chaque procédure dans l’application, prévue dans les lots de rédaction.

### V1 : une bonne base pédagogique, mais pas un manuel V2 complet

Le dossier contient **15 pages de contenu**, un index et **70 médias**, pour
un volume d’environ **533 Mo** de médias. L’index annonce un manuel incomplet
pour la version 1.0.81.

Ses points forts sont à conserver : progression depuis le premier corpus,
explication de l’utilité des fonctions, exemples concrets, procédures illustrées
et encadrés « Bon à savoir ».

Ses limites imposent une véritable adaptation :

- L’essentiel porte sur les corpus, les imports, les variables, les catégories
  et l’édition des entretiens. Les outils V2 ne sont pas tous couverts.
- Le corpus V1 est présenté comme un `.crp`, l’entretien comme un fichier
  `.Sonal` HTML : ce n’est pas le modèle de travail natif de la V2.
- Les gestes de sélection, les validations, les raccourcis et les emplacements
  des commandes doivent être revérifiés, pas repris par analogie.
- La page sur la pseudonymisation s’arrête sur une explication inachevée des
  exceptions ; l’export d’entretien est seulement esquissé.
- Les captures et animations montrent la V1. Les recopier donnerait de mauvais
  repères et alourdirait fortement le paquet.
- Certaines pages chargent des styles ou des polices sur Internet : ne pas
  reprendre cette dépendance pour une aide disponible hors ligne.

### V2 : une réserve d’informations, pas encore une documentation organisée

`docs/user/` contient des informations utiles sur les nouveautés, mais sans
sommaire d’ensemble ni chemin de découverte. `vue-corpus.md` concentre à lui seul
435 lignes et plusieurs sujets qui méritent leurs propres pages.

Les textes alternent tutoiement et vouvoiement, procédures, détails internes et
bilans de fonctions ajoutées. Ils ne doivent pas devenir tels quels le futur manuel.

Des divergences sont déjà visibles :

- `multi-utilisateur.md` indique que les médias partagés ne sont pas pris en
  charge sur GitLab, alors que `corpus-distant.md` décrit leur configuration
  WebDAV et que les formulaires de l’application la proposent.
- La présentation générale de l’audio distant comme exclusivement local ne
  suffit plus à décrire les différentes configurations.
- `migration-v1.md` cite encore une carte « Migrer un corpus SonalPi1… », tandis
  que l’accueil distingue désormais les migrations locale et GitLab.

**Conséquence :** les anciennes documentations sont des sources à confronter aux
comportements actuels. Une divergence ne se règle pas en choisissant arbitrairement
le texte le plus récent.

### L’accueil est prêt à accueillir deux entrées supplémentaires

Le bloc existe déjà avec **Parcours pas à pas** et **Explorer les corpus exemples**.
L’ajout des boutons est limité ; le vrai chantier est le contenu et sa consultation.

Aucun lecteur de documentation utilisateur n’a été identifié dans les éléments
examinés. Le projet ne déclare pas de dépendance dédiée au rendu Markdown.
Le mode de consultation et l’empaquetage doivent donc être traités explicitement.

## 3. Principes éditoriaux proposés

1. **Écrire pour une personne non technicienne.** Expliquer le but, le résultat
   attendu et les précautions sur les données, avant les détails.
2. **Conserver la pédagogie V1, adopter l’organisation V2.** Un démarrage progressif,
   puis des pages consultables indépendamment, regroupées par espace de travail.
3. **Employer le vouvoiement**, des titres orientés action et les libellés réels
   de l’interface. Introduire les anciens termes seulement s’ils aident à migrer.
4. **Une page, une tâche ou un petit ensemble cohérent.** Éviter de reconstruire
   un grand fichier cumulatif comme `vue-corpus.md`.
5. **Séparer manuel et FAQ.** La FAQ répond brièvement et renvoie à la procédure
   complète ; elle ne maintient pas une seconde version du manuel.
6. **Distinguer ce qui est disponible, limité ou absent.** Ne pas présenter un
   chantier prévu comme une fonction utilisable.
7. **Illustrer avec les corpus fictifs fournis.** Pas de données réelles,
   d’identifiants, de secrets ni de chemins personnels dans les captures.
8. **Préserver les précautions essentielles.** Pseudonymiser ne garantit pas
   l’anonymat ; un export de lecture n’est pas une sauvegarde complète.
9. **Ne pas imposer les mécanismes internes au lecteur.** Les informations
   d’assistance restent facultatives ; les explications d’architecture vont dans
   `docs/dev/`, pas dans le texte principal.

### Gabarit d’une page pratique

- À quoi sert cette fonction ?
- Avant de commencer, si un prérequis est nécessaire.
- Où aller dans l’application ?
- Étapes courtes, puis résultat attendu.
- Ce qui est conservé, modifié ou supprimé, lorsque c’est important.
- Limites ou différences entre corpus local, Nextcloud et GitLab, si pertinentes.
- Liens vers les notions voisines et les questions fréquentes.

## 4. Sommaire cible proposé

Les rubriques ci-dessous donnent la structure générale, pas l’obligation de produire
une grosse page par rubrique. Le découpage établi au lot 1 figure dans le suivi de
rédaction ; il reste ajustable après relecture des pilotes.

### A. Découvrir et démarrer

- Ce qu’est SonalPi, ce qu’il permet et ses limites.
- Installer et mettre à jour la V2 : versions réellement distribuées, liens vérifiés.
- Comprendre corpus, entretien, locuteur, personne, thème, variable, cas et recueil.
- Se repérer dans l’accueil et les quatre espaces ; retrouver son travail.
- Choisir entre parcours guidés et exploration libre des exemples.
- Créer, ouvrir et retrouver un corpus local.
- Comprendre où sont ses données, sauvegarder et déplacer son travail.

### B. Préparer et suivre

- Organiser le suivi avec le tableau de bord.
- Ajouter et consulter les documents du projet.
- Utiliser les documents exemples et les modèles.

### C. Importer et traiter

- Ajouter un entretien : texte, audio, vidéo et formats effectivement acceptés.
- Préparer une transcription et vérifier son import.
- Gérer les entretiens : nom, ordre, média associé et suppression.
- Relire et corriger ; naviguer entre texte et média ; utiliser les repères temporels.
- Identifier les locuteurs, corriger les tours de parole et relier les personnes.
- Créer les thèmes, coder un passage et réorganiser les codages.
- Définir les variables et renseigner les données.
- Écrire des notes et des commentaires.
- Pseudonymiser et contrôler les remplacements.
- Comprendre l’enregistrement et les possibilités réelles d’annulation/restauration.

### D. Analyser et interpréter

- Rechercher dans les entretiens.
- Rassembler les passages avec Tri et synthèse.
- Explorer les mots et les concordances avec Lexico.
- Comparer avec les analyses croisées.
- Comprendre filtres, résultats incomplets ou périmés et retour au contexte.
- Interpréter avec prudence : un chiffre ou une fréquence n’est pas une conclusion.

### E. Organiser et exporter

- Distinguer cas, personnes, thèmes et recueils.
- Constituer des cas ; aborder ensuite règles, familles et attributs.
- Composer un recueil avec des citations et des textes de liaison.
- Exporter un entretien, un lot, un recueil ou un résultat d’analyse.
- Transférer vers QualCoder : contenu repris et limites.
- Contrôler les informations sensibles avant un partage.

### F. Travailler à plusieurs et reprendre l’existant

- Choisir entre corpus local et corpus distant.
- Créer, partager et ouvrir un corpus Nextcloud.
- Préparer et ouvrir un corpus GitLab ; configurer ses médias si nécessaire.
- Comprendre qui peut modifier, ce qui est publié et ce qui reste sur son poste.
- Faire face à une coupure, une publication refusée ou un arrêt inattendu.
- Migrer un corpus V1 local ou GitLab et vérifier le résultat.

### G. FAQ et glossaire

Une FAQ classée par situation, un glossaire bref et des liens vers les pages du guide.

## 5. Correspondance initiale des sources

Cette table donne les destinations principales. Le suivi de rédaction complète la
correspondance à l’échelle des sous-sections et identifie les fonctions à vérifier.

| Source V1 dans `Tutos/` | Destination V2 et adaptation principale |
|---|---|
| `00-introduction.html` | Présentation, notions et confidentialité ; reformuler les promesses sur le stockage et le réseau. |
| `01-installer.html` | Installation V2 ; vérifier distributions et liens, ne pas renvoyer aux installateurs V1. |
| `02-projet.html` | Corpus local/distant et sauvegarde ; remplacer la logique `.crp` par celle du dossier de corpus V2. |
| `03-entretiens.html` | Imports et gestion des entretiens ; contrôler formats, médias, suppression et tri. |
| `04-bdd.html` et `06-7-base-donnees.html` | Variables et saisie des données ; articuler vue corpus et vue entretien. |
| `05-categories.html` | Création et organisation des thèmes ; revoir hiérarchie, options et vocabulaire. |
| `06-modification.html` et `06-1-fonctionnement.html` | Ouverture d’un entretien, lecture et repérage ; vérifier commandes et raccourcis V2. |
| `06-2-mode-edition.html` | Correction de la transcription ; réécrire les modalités de validation/enregistrement. |
| `06-3-mode-locuteurs.html` | Locuteurs et tours de parole ; compléter par les personnes partagées du corpus. |
| `06-5-mode-categories.html` | Codage des passages ; revérifier entièrement les gestes de sélection. |
| `06-6-notes.html` | Notes d’entretien et consultation au niveau corpus ; compléter les possibilités V2. |
| `06-8-pseudonymisation.html` | Pseudonymisation ; reprendre l’intention, rédiger une procédure V2 complète. |
| `06-9-export.html` | Export d’entretien ; compléter, puis distinguer les autres exports et la sauvegarde. |

| Source actuelle dans `docs/user/` | Utilisation dans la refonte |
|---|---|
| `vue-corpus.md` | Répartir navigation, découverte, thèmes, notes, personnes, données et pseudonymisation dans leurs pages. |
| `docs-cadre.md` | Documents du projet et exemples, dans Préparer et suivre. |
| `synthese.md` | Base de la page Tri et synthèse, à enrichir d’un exemple. |
| `lexico.md` | Base des pages Lexico ; harmoniser le ton et alléger les détails secondaires. |
| `cas.md` | Pages Cas ; séparer initiation et usages avancés. |
| `corpus-distant.md` | Création, partage et accès ; séparer Nextcloud et GitLab. |
| `multi-utilisateur.md` | Quotidien du collectif et dépannage ; réconcilier les capacités avant rédaction. |
| `migration-v1.md` | Migration locale et GitLab ; sortir les explications de modèle interne. |

Les principaux compléments sans chapitre dédié dans ces tutoriels V1 concernent
les quatre espaces, le tableau de bord, les documents, les personnes au niveau
corpus, les analyses, les cas, les recueils et le fonctionnement collectif V2.

## 6. Source documentaire et consultation dans l’application

### Décision : écrire directement les pages HTML

Après validation des pilotes, l’utilisateur a demandé la solution la plus simple :
un petit site HTML local, sans lecteur Vue, sans conversion Markdown et sans
nouvelle fenêtre Electron. `markdown-it` et ses types, installés pendant l’examen
de la première piste, ont été désinstallés sans avoir servi à une implémentation.

Les pages utilisateur sont écrites directement dans `docs/user/`, avec une feuille
de style partagée. Pas de serveur, de JavaScript, de police externe ou de nouvelle
dépendance. Les trois pilotes et la FAQ ont été repris en HTML ; leurs anciennes
copies Markdown ne sont pas maintenues en parallèle.

```text
docs/user/
  index.html                Sommaire du guide.
  style.css                 Présentation commune.
  demarrer/*.html
  preparer/*.html
  traiter/*.html
  analyser/*.html
  organiser/*.html
  travailler-ensemble/*.html
  migration/*.html
  faq/*.html
  glossaire.html
  medias/                   Illustrations V2 sélectionnées.
```

Les huit anciens fichiers Markdown restent disponibles comme sources de travail,
via le README du dossier, mais ne sont pas embarqués dans le site. Leurs détails
développeur utiles seront repris dans `docs/dev/` avant leur retrait éventuel.

### Consultation

Le menu **Aide → Documentation utilisateur** ouvre `index.html` ; **Aide → FAQ**
ouvre les questions fréquentes. Le système utilise l’application associée au HTML,
habituellement le navigateur. Ces ouvertures ne passent pas par le cycle du corpus.
Les cartes de l’accueil ont été anticipées à la demande pour l’essai UX ; elles
utilisent le même ouvreur que le menu Aide. Le lot 8 garde la validation d’ensemble.

Le sommaire, les liens entre pages et les liens **Précédent / Suivant** suffisent.
La recherche et l’impression sont celles du navigateur ; pas de moteur de recherche
spécifique au guide. La compilation copie HTML, CSS et illustrations dans les
ressources de l’application, à l’extérieur de l’archive applicative.

À vérifier : liens et ancres valides, ressources toutes locales, lecture au clavier,
affichage étroit et paquet utilisable hors ligne. Aucun lien documentaire ne doit
changer le corpus, fermer l’entretien ou lancer un exercice.

Le sous-texte actuel « Un terrain fictif sur l’aide aux devoirs… » ne concerne que
les exercices et exemples. Il faudra le repositionner ou le reformuler pour qu’il
ne semble pas décrire toute la documentation et la FAQ.

## 7. Réalisation par lots

Chaque lot se termine par un bilan : pages produites, gestes vérifiés, illustrations
refaites et points restant à trancher. Valider un petit ensemble avant le suivant.

### Lot 1 — Cadrer et inventorier

- Valider le sommaire cible et les règles éditoriales.
- Compléter la matrice V1/V2 par sous-section : conserver l’explication, adapter,
  réécrire, écarter ou créer.
- Pour chaque page prévue, noter ses sources, ses points à vérifier et son état :
  à rédiger, rédigée, vérifiée dans l’application, relue, publiable.
- Relever les divergences documentaires et préparer une liste de questions FAQ.
- Choisir le petit corpus fictif utilisé comme fil rouge, de préférence parmi les
  exemples déjà fournis.

**Validation :** le périmètre est couvert sans doublons ; aucune divergence connue
n’est transformée silencieusement en affirmation utilisateur.

### Lot 2 — Rédiger un échantillon pilote

Produire trois pages courtes :

1. Comprendre les notions et se repérer dans les quatre espaces.
2. Créer et retrouver un corpus local, en adaptant le chapitre V1 correspondant.
3. Coder un premier passage avec un thème, en adaptant la procédure V1.

Ajouter quelques questions FAQ liées et un petit nombre de captures V2.
Faire relire ensemble le niveau d’explication, le ton et le découpage.

**Validation :** les gestes sont exécutables tels qu’écrits dans la V2 ; le modèle
éditorial est approuvé avant de rédiger le reste.

### Lot 3 — Mettre en place le site HTML local

- Reprendre les pilotes directement en HTML avec un sommaire et un style commun.
- Ajouter les liens entre pages et **Précédent / Suivant**.
- Ouvrir le guide et la FAQ depuis le menu Aide, sans modifier le corpus.
- Copier le site dans les ressources du paquet et vérifier la navigation hors ligne.

**Validation :** réalisée sur le paquet Linux. Les pages s’ouvrent sans serveur,
sans JavaScript et sans fermer l’entretien. La prise en charge des associations
HTML du poste reste celle du système ; Windows/macOS restent à qualifier.

### Lot 4 — Adapter le socle V1

Rédiger par sous-lots relus séparément :

- Présentation, installation, corpus local, emplacement des données et sauvegarde.
- Imports, médias, gestion des entretiens, correction et repères temporels.
- Locuteurs, thèmes, variables, notes et commentaires.
- Pseudonymisation et export d’entretien, avec les précautions de partage.

Chaque sous-lot remplace les gestes et illustrations V1 par des indications V2
vérifiées. Enrichir la FAQ au fil des difficultés rencontrées.

**Validation :** une personne peut aller du premier corpus à un entretien corrigé,
codé et exporté sans chercher une commande V1 ni supposer qu’un export est une sauvegarde.

### Lot 5 — Documenter les usages propres à la V2

Avancer par espace, plutôt que tout rédiger d’un bloc :

- Préparer : tableau de bord et documents.
- Traiter : personnes, vues transversales et réorganisation des codages.
- Analyser : Tri et synthèse, Lexico, analyses croisées et retour aux sources.
- Organiser : cas, recueils, exports de corpus et QualCoder.

Réutiliser les informations actuelles après vérification, sans reprendre leur
organisation cumulative. Vérifier particulièrement les avertissements sur les
résultats incomplets/périmés et les informations sensibles dans les exports.

**Validation :** chaque outil a une explication de son utilité et au moins une
procédure courante ; les usages avancés n’encombrent pas l’entrée en matière.

### Lot 6 — Collectif, migration et situations de reprise

- Vérifier et documenter séparément Nextcloud et GitLab : préparation des accès,
  partage, médias, publication, consultation et limites.
- Réécrire les situations de coupure, arrêt inattendu et publication refusée en
  termes de travail conservé et d’actions possibles.
- Documenter les migrations locale et GitLab, le contrôle du résultat et la
  conservation des originaux.
- Confronter les procédures aux bancs réels avant d’affirmer leur validité.

**Validation :** les différences entre fournisseurs sont explicites ; aucune
promesse générale de récupération ou d’édition hors ligne ne dépasse les capacités
vérifiées. Les tests réels commencent par `preparer_bancs_docker`, sans téléchargement
d’images ni réinstallation des bancs.

### Lot 7 — Consolider la FAQ et relire l’ensemble

La FAQ se constitue dès le pilote ; ce lot l’organise et élimine les doublons.
Premières questions candidates, à confirmer lors de la rédaction :

- Dois-je créer un corpus pour travailler sur un seul entretien ?
- SonalPi réalise-t-il lui-même la transcription de mes enregistrements ?
- Puis-je travailler sans audio ? Pourquoi le média n’est-il plus retrouvé ?
- Quelle différence entre locuteur, personne, thème, cas et recueil ?
- Où mon travail est-il enregistré ? Un export suffit-il à le sauvegarder ?
- Pourquoi une commande est-elle indisponible ? Puis-je travailler sans réseau ?
- Un collègue a ouvert l’entretien : que puis-je encore faire ?
- Que faire si une analyse n’est plus à jour ou ne couvre pas tout le corpus ?
- Le texte pseudonymisé et les fichiers exportés sont-ils prêts à être diffusés ?
- Puis-je conserver mon ancien corpus V1 après migration ?

Chaque réponse reste courte, indique une action utile et renvoie à une page précise.
Relire le glossaire, les termes de l’interface et les précautions de confidentialité.

**Validation :** on trouve une réponse par sa question courante, sans connaître le
nom technique de la fonction ; la FAQ ne contredit pas le guide.

### Lot 8 — Intégrer les deux cartes et livrer

- Finaliser l’accueil en deux colonnes essayé à la demande, avec **Documentation
  utilisateur** et **FAQ**, sans retirer les parcours ni les exemples. Le terrain
  fictif reste attaché aux exercices, pas au texte général de l’aide.
- Brancher les cartes sur les deux entrées du même ensemble documentaire.
- Vérifier les quatre cartes, les liens guide/FAQ et le clavier. Conserver le
  menu Aide pour consulter la documentation sans passer par l’accueil.
- Mettre à jour le sommaire du dépôt et tous les liens vers les pages remplacées.
- Retirer les anciennes pages devenues redondantes après vérification de la reprise.
- Qualifier le paquet hors ligne et faire une recette de découverte utilisateur.

**Validation :** les cartes ouvrent des contenus utilisables, pas des rubriques
vides ; aucun lien ni média ne dépend du poste de développement.

Une ouverture publique partielle reste possible après le socle si elle est souhaitée,
mais elle doit annoncer clairement son périmètre et ne publier que des pages validées.

## 8. Vérifications et entretien dans la durée

### Pour chaque page publiée

- Libellés et procédure contrôlés dans la version actuelle.
- Résultat attendu et conséquences sur les données expliqués.
- Différences local/Nextcloud/GitLab vérifiées lorsqu’elles sont mentionnées.
- Aucune promesse tirée seulement d’un ancien texte ou d’un plan de développement.
- Liens internes, ancres et médias valides ; capture utile, lisible et sans donnée réelle.
- Précautions exactes sur suppression, sauvegarde, publication et confidentialité.
- Relecture éditoriale effectuée.

### Pour le site HTML embarqué

Contrôler les liens, ancres et ressources ; tester l’ouverture guide/FAQ depuis
le menu, la navigation et la préservation de l’entretien ouvert. Tester les pages
hors ligne et sans JavaScript, y compris celles copiées dans le paquet produit.

### Après la refonte

Lorsqu’un comportement utilisateur change, mettre à jour dans la même évolution
la page concernée, les questions liées et les captures devenues trompeuses.
La traçabilité des vérifications reste dans le suivi de travail, pas au milieu
des explications destinées au lecteur.

## 9. Décisions de lancement et points encore ouverts

Le vouvoiement, les trois pilotes et le niveau d’explication ont été acceptés.
Le support choisi est le HTML direct, ouvert dans le navigateur, sans conversion.
La page d’accueil du site regroupe les chapitres selon les parties du plan et
n’affiche pas les rubriques encore vides. Les cartes de l’application sont désormais accessibles dans l’essai
UX anticipé ; leur intégration finale reste au lot 8.

**À relire d’abord : l’essai d’accueil en deux colonnes et les chapitres T11 à O05**.
La dernière recette figure dans la section 25 du suivi.

**Prochaine rédaction : poursuivre le lot 4 avec O06 — Exporter un lot d’entretiens**.
Le chapitre Exporter un entretien (O05), ses deux captures et ses quatre réponses
FAQ sont rédigés et vérifiés dans le paquet Linux, à relire. Le chapitre Revenir sur une
modification (T13), ses deux captures et ses quatre réponses
FAQ sont rédigés et vérifiés dans le paquet Linux, à relire. Le chapitre Pseudonymisation
(T12), ses deux captures et ses quatre réponses FAQ sont rédigés et vérifiés localement,
à relire. Le chapitre Commentaires (T11), sa capture
et ses quatre réponses FAQ sont rédigés et vérifiés dans le paquet Linux, à relire. Le chapitre Notes (T10),
ses deux captures et ses quatre réponses FAQ sont également à relire.
Le chapitre sur les variables et les données (T09), avec ses quatre réponses
FAQ et ses deux captures, est rédigé et vérifié localement, à relire. Un défaut de
branchement de l’import des modèles a été corrigé et vérifié dans le paquet Linux.
L’export CSV et les statistiques de locuteurs demandés ensuite ont été ajoutés,
documentés et vérifiés dans le paquet Linux. Les notes, les commentaires et la
pseudonymisation, le retour sur une modification et l’export individuel ont également
été documentés ; la suite éditoriale est maintenant l’export d’un lot d’entretiens.
L’installation attend la confirmation des liens de diffusion V2. L’essai de
restauration d’une copie ZIP locale a réussi ; la page générale sur la sauvegarde
et le déplacement reste à rédiger.
Les huit fichiers utilisateur préexistants restent inchangés. L’accueil applicatif
fait désormais l’objet de l’essai UX, sans changement du contenu des corpus.
