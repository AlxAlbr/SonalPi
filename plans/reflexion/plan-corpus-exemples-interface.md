# Plusieurs corpus exemples — interface et parcours d’ouverture

Statut : refonte implémentée dans l'application, après la
[maquette interactive](../maquettes/corpus-exemples-interface.md).
Le catalogue précède la création, Préparer et suivre commence par la création guidée,
et l'exemple annoté est disponible en exploration libre. Installation et reprise sont
séparées ; les travaux d'apprentissage sont retrouvés dans les parcours, pas dans les Récents.
La qualification locale et les essais du paquet Linux sont réussis.
Restent le retour utilisateur, le sélecteur natif Windows et la qualification distante réelle.

## 1. Objectif et périmètre

Permettre de découvrir SonalPi avec plusieurs corpus exemples, adaptés à différents
objectifs, notamment un corpus déjà annoté pour **Analyser et interpréter**.

Le sujet est l’interface : choisir un exemple, l’ouvrir une première fois, retrouver
son travail et passer à un autre exemple sans confusion ni perte de données.
La fabrication des corpus, leurs annotations et le contenu d’un futur tutoriel
d’analyse ne sont pas traités ici.

**Orientation retenue : « Parcours pas à pas » ouvre directement « Choisir un
parcours pas à pas ». Le corpus adapté est préparé ou repris seulement après ce
choix.** Une entrée distincte permet d’explorer librement les corpus exemples.

**Recommandation complémentaire : retrouver les copies d’apprentissage uniquement
dans l’interface pas à pas, pas dans les Récents.** Leur progression et leurs dossiers
restent conservés. Plusieurs exemples ne nécessitent pas plusieurs corpus ouverts
simultanément : conserver un corpus actif.

## 2. Constat avant la refonte

### 2.1 Deux cartes, mais déjà deux corpus de travail possibles

Dans `src/renderer/components/accueil/Accueil.vue`, « Mini Corpus Test » propose :

- **Découverte pas à pas** : un corpus initialement sans entretien, rempli au fil
  des exercices ;
- **En autonomie** : un autre corpus, avec les quatre entretiens et leurs audios
  déjà importés, mais sans préparation spécifique pour l’analyse thématique.

Ce ne sont donc pas simplement deux façons de consulter le même corpus.
Le choix du guidage détermine aussi le contenu de départ et le dossier de travail.
Les sources sont communes, les travaux sont indépendants.

### 2.2 La fenêtre d’« import » est surtout une installation initiale

`src/renderer/components/accueil/ModaleDemo.vue` demande :

1. où placer les sources de la démo ;
2. où placer le corpus correspondant au mode choisi.

Elle saute les questions déjà résolues. Quand les sources et le corpus sont reconnus,
la carte passe directement par `preparer()` dans `composables/demo.ts`.

Cette fonction ne fait pas qu’ouvrir : elle vérifie et copie les sources si nécessaire, peut importer
les entretiens manquants selon leur titre, écrit le marqueur et mémorise les dossiers.
La réouverture reste donc mêlée à la préparation initiale. La détection par titre
peut notamment réintroduire un entretien source après son renommage ou sa suppression.
Pour plusieurs exemples modifiables, il faut distinguer nettement **ouvrir mon travail**
et **repartir de l’exemple initial**.

### 2.3 Le guidage possède déjà plusieurs parcours

Le catalogue actuel propose Préparation et Traitement, avec des progressions séparées.
« Analyse — à venir » est affiché, mais aucun parcours d’analyse n’est implémenté.

Le guidage est néanmoins activé par `demo.mode === 'pas-a-pas'` : il reste attaché
au type de corpus plutôt qu’à un choix d’accompagnement indépendant.

### 2.4 Les espaces de travail existent indépendamment de ces parcours

La barre propose déjà **Préparer et suivre**, **Importer et traiter** et
**Analyser et interpréter**. Ce dernier contient Synthèse, Lexico et Analyses croisées.

Un corpus annoté est particulièrement utile pour les outils fondés sur les thèmes ;
Lexico peut déjà servir sur un corpus transcrit non annoté. Il ne faut donc pas
présenter l’annotation comme une obligation pour accéder à tout l’espace d’analyse.

**Changer d’espace doit continuer à travailler sur le corpus courant.** Cliquer sur
« Analyser et interpréter » ne doit jamais charger implicitement un autre exemple.

## 3. Alternatives examinées et orientation retenue

### A — Ajouter une troisième carte à l’existant

Conserver les deux cartes et ajouter **Explorer un corpus annoté**.
Adapter la fenêtre actuelle pour connaître un troisième corpus.

**Avantages :** évolution visuelle limitée, accès immédiat au nouveau besoin.

**Limites :** une carte décrit un accompagnement, une autre une autonomie, une autre
un contenu. Chaque ajout risque d’allonger les conditions et les champs spécifiques
(`corpusPasAPas`, `corpusAutonomie`, puis `corpusAnalyse`…). Le choix reste ambigu.

**Avis :** acceptable comme transition courte, pas comme organisation cible.
Même pour cette solution, ne pas faire d’« analyse » un troisième mode de guidage.

### B — Choisir le parcours avant de préparer son corpus — retenue

Deux entrées complémentaires remplacent les cartes actuelles :

- **Parcours pas à pas** → choisir ce que l’on veut apprendre → commencer la
  création guidée ou préparer/reprendre le corpus adapté, selon le parcours ;
- **Explorer les corpus exemples** → choisir le contenu que l’on veut explorer
  librement → préparer ou reprendre sa copie → ouvrir l’espace conseillé.

La fenêtre d'installation est commune à l'entrée directe par Traitement et à
l'exploration libre. Préparer et suivre utilise le dialogue ordinaire **Nouveau
corpus local** pour sa première étape. Dans tous les cas, le choix de l'objectif
vient d'abord et une copie compatible existante n'est jamais recréée.

Le catalogue des parcours devient accessible sans ouvrir ni créer un corpus.
Préparation et Traitement peuvent partager une même copie d’apprentissage ; Analyse
peut disposer d’une autre copie déjà annotée. Il n’y a pas automatiquement un corpus
par parcours.

**Avantages :** l’utilisateur choisit son objectif avant toute question de fichiers ;
les copies d’apprentissage se retrouvent avec les parcours et leur progression.

**Limite :** nécessite de séparer le catalogue, le cycle d’ouverture du corpus et le
guidage actuellement rassemblés dans le fonctionnement de la démo.

### C — Une bibliothèque dédiée de corpus exemples

L’accueil conserve un bouton **Explorer les corpus exemples…**. Il ouvre une page
avec les exemples, leur description, leur contenu initial et les travaux déjà commencés.

**Avantages :** pertinent avec beaucoup de terrains ou plusieurs variantes par terrain.

**Limites :** ajoute un écran et un clic pour un catalogue aujourd’hui très petit.
Risque de construire trop tôt un gestionnaire complet de copies et de versions.

**Avis :** évolution possible de B si le catalogue s’étoffe. Prévoir une liste de
descriptions commune, mais ne pas construire cette bibliothèque dès maintenant.

## 4. Interface recommandée

### 4.1 Accueil : deux entrées complémentaires

```text
Découvrir SonalPi
[Parcours pas à pas]              [Explorer les corpus exemples]
Apprendre les gestes,            Essayer librement les outils
étape par étape.                 sur un exemple fourni.

Vos corpus
[Nouveau corpus local] [Ouvrir un corpus local] …

Récents
Les corpus de travail, sans les copies d’apprentissage.
```

**Parcours pas à pas** ouvre directement **Choisir un parcours pas à pas**, sans
fenêtre d’import préalable et sans basculer vers un corpus d’exercice.

```text
Choisir un parcours pas à pas

Préparer et suivre
Créer votre corpus, puis organiser le terrain et les documents du projet.
[Commencer…] ou [Continuer — 3 étapes sur 5]

Importer et traiter
Apprendre à importer et travailler les entretiens.
[Commencer…] ou [Continuer — 3 étapes sur …]

Analyser et interpréter
Explorer des entretiens déjà annotés.
[À venir] tant que le parcours n’est pas disponible
```

Conserver la présentation actuelle : **cartes des parcours en haut, détail du
parcours sélectionné en dessous**. L'ordre du détail devient : objectif, progression,
liste des étapes, **Commencer / Continuer**, puis **Votre corpus d'exercice**.
Cliquer sur une carte ne lance aucune étape ; le dossier et les options ne doivent
pas prendre visuellement le dessus sur ce que l'on va apprendre.

Consulter ce catalogue ne crée aucun fichier, ne change pas le corpus actif et ne
lance aucune étape. Fermer le catalogue laisse le travail courant intact.
La progression affichée correspond à la copie d’apprentissage associée au parcours,
pas à un total agrégé entre différentes copies.

**Explorer les corpus exemples** présente une sélection simple des contenus fournis,
notamment les entretiens déjà importés actuels et, lorsqu’il sera disponible, le
corpus annoté. Pas de bibliothèque complexe, de filtres ou de sélecteur sans choix
réel pour cette première version.

### 4.2 Création guidée ou installation automatique, selon le parcours

**Choix retenu : apprendre à créer le corpus dans Préparer et suivre, mais installer
automatiquement les fichiers d'exercice.** La création du corpus est un geste métier ;
la copie des sources ne doit pas devenir un exercice. Ce choix remplace la règle
précédente qui plaçait toute la préparation hors des étapes.

#### Préparer et suivre : cinq étapes, dont la création du corpus

1. **Créer votre corpus** : nommer le projet et choisir son dossier avec le vrai
   dialogue **Nouveau corpus local**, accompagné par le guide.
2. Organiser le suivi.
3. Ajouter les documents du projet.
4. Créer l'entretien préparatoire.
5. Écrire une note de préparation.

**Commencer** mène directement à la création guidée, sans installation préalable
d'un corpus vide et sans deuxième assistant de création. Le catalogue et ce début
de guide doivent donc fonctionner avant qu'un corpus d'apprentissage soit ouvert.
Le corpus courant reste intact jusqu'à la réussite de la création et de son ouverture.
La première étape n'est acquise qu'après cette réussite, jamais au clic sur le bouton.
En cas d'annulation ou d'échec, ne mémoriser ni corpus utilisable ni étape réalisée.

Si une copie compatible existe déjà, y compris après une entrée directe par
Traitement, sa création est acquise après vérification de son identité. Ne pas
imposer de la recréer. **Continuer** rejoint l'étape suivante accessible. Revoir
**Créer votre corpus** explique le geste et reconnaît le corpus existant ; cela ne
crée pas silencieusement un nouveau dossier. Refaire le geste dans un autre corpus
reste une demande explicite via les options.

Cliquer directement sur une étape de préparation accessible sans corpus passe
d'abord par la création guidée, puis rejoint **l'étape choisie**. Annoncer cette
destination avant la création et respecter les autres prérequis pédagogiques.

#### Importer et traiter : conserver une entrée directe simple

Si aucune copie compatible n'existe, **Commencer** présente l'emplacement proposé,
prépare un corpus vide et les fichiers d'exercice, puis lance l'étape choisie.
Ce préalable technique n'ajoute pas d'étape au parcours Traitement. Les véritables
imports d'entretiens restent à faire par l'utilisateur.

```text
Parcours pas à pas → Choisir un parcours
  Préparer et suivre → Créer votre corpus (étape 1) → Étape suivante ou choisie
  Importer et traiter → Installer si nécessaire → Étape choisie
  Continuer un parcours → Ouvrir le corpus existant → Reprendre sans réinstaller
```

La fenêtre d'installation de Traitement rappelle le parcours, les fichiers qui
seront disponibles et un emplacement modifiable, sans imposer deux sélecteurs :

```text
Préparer le corpus pour « Importer et traiter »
Les fichiers d'exercice seront préparés pour vous.
Votre progression et vos modifications seront conservées.
Emplacement : Documents/Sonal/Apprentissage/…             [Modifier…]
[Retour aux parcours]                           [Préparer et commencer]
```

Pour l'exploration libre, la même fenêtre présente l'exemple plutôt que le parcours,
propose un emplacement dans les exemples et utilise **Ouvrir ma copie**.

#### Informations de corpus après les étapes et l'action principale

Le bloc discret **Votre corpus d'exercice** indique le dossier et, si nécessaire,
la réutilisation de la même copie par Préparation et Traitement. Une copie existante
ne repasse ni par le choix de dossier ni par la réinstallation de son contenu.
Ne plus placer un grand bloc **Pour ce parcours** au-dessus des étapes.

Les détails des fichiers sources restent facultatifs, avec un accès durable
**Voir les fichiers d'exercice** pendant le parcours. Les sources sont installées
automatiquement après validation, séparément du corpus de travail. Les audios sont
référencés, jamais dupliqués ; les sources historiques restent à leur emplacement.
Conserver l'objectif et l'étape choisie jusqu'au lancement, sans second catalogue.

### 4.3 Reprise : depuis le parcours, sans nouvelle préparation

Le catalogue affiche **Commencer**, **Continuer** ou **Revoir le parcours**, avec
la progression de la copie associée. **Continuer** est une demande explicite de
reprendre le guidage ; une simple ouverture de l’application ou du catalogue ne
relance aucune étape.

Pour l’exploration libre, le bouton reste **Reprendre mon corpus**.
Dans les deux cas :

- rouvrir le dossier existant avec les modifications de la personne ;
- ne pas réimporter les entretiens supprimés ou renommés ;
- ne pas remettre les annotations ou filtres à l’état de l’exemple fourni ;
- ne pas reproposer le choix de dossier tant que le corpus est retrouvé.

Sous **Votre corpus d'exercice**, les **Options du corpus d'exercice** regroupent
l'action secondaire **Commencer dans un nouveau corpus…**. Elle conserve le travail
actuel et ses acquis. Si plusieurs parcours partagent cette copie, préciser lesquels
utiliseront le nouveau corpus ; ne pas transférer silencieusement les progressions.
Dans Préparer et suivre, cette action reprend la création guidée.

**Choisir un autre corpus d'exercice** n'apparaît dans ces options que lorsque
plusieurs corpus d'apprentissage sont réellement enregistrés. Ne pas afficher un
sélecteur pour un seul corpus ni une entrée abstraite **Autres copies…**.
Le choix du corpus à reprendre ne suffit pas à changer le corpus actif.

**Retrouver mon dossier…** apparaît uniquement lorsqu'un dossier connu manque.
Le rattachement depuis un autre profil passe par **Ouvrir un corpus local**,
puis par la reconnaissance du marqueur, sans bouton permanent de récupération
sur chaque parcours. Les anciens corpus restent accessibles, y compris après la
fin d'un parcours. Aucune réinitialisation destructive n'est prévue.

### 4.4 Arrivée dans le corpus annoté

En exploration libre, ouvrir le corpus puis **Analyser et interpréter**, initialement
sur Synthèse, sans déclencher un calcul lourd ni lancer un tutoriel.

Présenter un repère compact, refermable :

> Corpus exemple pour l’analyse. Vous pouvez modifier cette copie.
> Choisissez un thème puis cliquez sur « Calculer », ou explorez Lexico.

Éviter un résultat vide sans explication : la Synthèse demande un thème ou un cas.
Adapter le repère si la personne a retiré ces éléments. La préparation de critères
de démonstration n’est pas indispensable à cette évolution d’interface.

Quand un véritable parcours d’analyse sera disponible, **Commencer** ou **Continuer**
mènera à sa première étape pertinente, qui pourra déterminer l’onglet et les gestes
à proposer. Ne pas appliquer cette destination pédagogique à l’exploration libre.

Les autres espaces restent accessibles. Ouvrir un extrait amène à sa source dans
le même corpus. La destination dépend de l’action choisie, pas d’une modification
globale de l’ouverture de tous les corpus.

### 4.5 Guidage et copies d’apprentissage

Distinguer la **destination durable de la copie** (apprentissage ou exploration
libre) et l’**activation temporaire du guide**. Arrêter le guide ne transforme pas
une copie d’apprentissage en corpus ordinaire et ne la fait pas entrer dans les Récents.

Dans une copie d’apprentissage, proposer **Mettre le guide en pause** et
**Revenir aux parcours**. Tous les outils restent utilisables pendant la pause :

- quitter le guide ne change pas de corpus et ne perd pas sa progression ;
- reprendre le guide ne recharge pas l’exemple initial ;
- plusieurs parcours compatibles peuvent partager la même copie ;
- un corpus déjà rempli ne reçoit pas aveuglément les exercices conçus pour un
  corpus vide ; vérifier l’état de la copie avant de proposer la prochaine étape ;
- le corpus annoté peut être proposé en exploration libre avant que le guide
  d’analyse existe. Ne pas annoncer ce parcours comme disponible prématurément.

Pour commencer un guide depuis une copie d’exploration libre, revenir au catalogue
et préparer ou retrouver la copie d’apprentissage correspondante ; ne pas convertir
silencieusement le travail libre. Les médias peuvent rester communs, pas les modifications.
La disponibilité pédagogique ne verrouille aucun outil métier.

### 4.6 Changer d’exemple et gérer les situations inhabituelles

Le choix d’un autre parcours ou exemple est explicite, depuis l’accueil ou une
action **Revenir aux parcours** / **Changer d’exemple…**. Consulter la sélection
ne suffit pas à changer de corpus. Le changement intervient après **Commencer**,
**Continuer** ou **Ouvrir ma copie**. Si la cible utilise un autre corpus, l’annoncer
avant la bascule. Ne pas ajouter de sélecteur permanent dans chaque espace.

Le passage utilise les protections ordinaires de changement de corpus : sauvegarde,
sortie de session distante éventuelle, arrêt du guidage et nettoyage des états
d’analyse. Une erreur ou une annulation ne doit pas ouvrir le corpus cible.

| Situation | Réponse d’interface proposée |
| --- | --- |
| Corpus déjà utilisé | Reprendre directement ; nouvelle copie en action secondaire. |
| Dossier déplacé ou absent | « Nous ne retrouvons plus votre corpus. » Action **Retrouver mon dossier…** ; **Commencer dans un nouveau corpus…** reste dans les options ; fermeture/annulation sans bascule. |
| Dossier choisi contenant un travail | Refuser l’écrasement ; proposer un autre emplacement ou l’ouverture du corpus reconnu. |
| Corpus illisible | Expliquer qu’il ne peut pas être ouvert ; ne pas le remplacer automatiquement. |
| Fichiers sources manquants | Signaler les fonctions concernées et proposer de retrouver/restaurer les fichiers nécessaires, sans reconstruire le corpus de travail. |
| Exemple fourni dans une version plus récente | Préserver le travail existant ; proposer une nouvelle copie, jamais un remplacement silencieux. |
| Préparation échouée | Garder la fenêtre et l’erreur visibles ; ne pas afficher « prêt » ni mémoriser une copie comme utilisable. |

### 4.7 Récents : exclure les copies d’apprentissage

**Proposition recommandée : les copies utilisées par les parcours pas à pas ne
figurent pas dans les Récents.** Leur point d’entrée normal et leur historique de
progression sont regroupés dans **Parcours pas à pas**.

Avantages : les exercices ne prennent pas la place des recherches dans une liste
courte ; on retrouve un objectif et sa progression plutôt qu’un nom de dossier ;
les ouvertures ne contournent plus involontairement le choix du parcours.

Cette séparation suppose des garanties :

- le catalogue conserve les copies et progressions après fermeture de l’application ;
- un parcours terminé et ses anciennes copies restent accessibles ;
- **Retrouver mon dossier…** récupère un dossier connu déplacé ; **Ouvrir un corpus
  local** rattache un corpus d'apprentissage reconnu depuis un autre profil,
  sans recréer ses données ;
- l’exclusion vaut pour l’accueil, le menu applicatif et les mécanismes qui utilisent
  les Récents au démarrage ou après la suppression du corpus courant ;
- aucune copie d’apprentissage n’est chargée automatiquement depuis ces mécanismes ;
- pauser le guidage ou utiliser librement les outils dans cette copie ne change pas
  cette règle.

Il s’agit d’une organisation de l’interface, pas d’un verrou sur les fichiers.
Si « Ouvrir un corpus local » reçoit une copie d’apprentissage reconnue, la rattacher
au catalogue et y présenter sa reprise, sans ajout aux Récents et sans étape lancée
automatiquement. La lecture de son identité ne doit pas imposer une bascule préalable.

**Périmètre proposé :** les copies créées par **Explorer les corpus exemples** restent
des travaux libres et peuvent figurer dans les Récents, comme l’autonomie actuelle.
Elles se retrouvent aussi depuis les exemples. Exclure tous les exemples serait un
autre choix, non nécessaire pour isoler les exercices guidés.

Ne pas supprimer des dossiers pour nettoyer les Récents. Pour les anciens corpus
pas à pas, enregistrer d’abord leur accès dans le catalogue, puis retirer seulement
leurs raccourcis. En cas d’identité illisible ou ambiguë, ne pas faire disparaître
l’accès au corpus sans solution de récupération.

## 5. Évolution minimale de la logique

### 5.1 Séparer quatre notions

| Notion | Rôle |
| --- | --- |
| Exemple / point de départ | Description et identité stables du contenu fourni ; plusieurs états initiaux peuvent provenir du même terrain. |
| Copie de travail | Dossier réel, nom, modifications et usage durable : apprentissage ou exploration libre. |
| Parcours | Accompagnement compatible, progression conservée dans cette copie. |
| Destination | Espace à afficher après l’ouverture, selon l’action demandée. |

Ne pas créer une matrice automatique « chaque exemple × chaque mode × chaque espace ».
Une copie ne change pas d’identité lorsque l’utilisateur quitte le guide ou change d’espace.

### 5.2 Catalogue et mémoire des corpus, sans gestionnaire surdimensionné

Prévoir les descriptions des parcours et des exemples indépendamment du corpus
actif : identifiants stables, titres, résumés, points de départ compatibles et
destinations conseillées. Le catalogue doit pouvoir afficher une progression
mémorisée sans appliquer le corpus au modèle actif ; vérifier les données réelles
et les conditions pédagogiques lors de la reprise.

Mémoriser l’association parcours → copie d’apprentissage, avec la possibilité que
plusieurs parcours désignent la même copie. Le choix fait avant l’ouverture porte
jusqu’au lancement du guide, sans seconde sélection.

Remplacer les champs spécifiques `corpusPasAPas` / `corpusAutonomie` par une
collection de travaux rattachés aux exemples. Leur lecture ancienne sert uniquement
à normaliser les données existantes, pas à maintenir deux systèmes en parallèle. Les réglages du profil mémorisent les
emplacements et le dernier travail utilisé ; le marqueur du corpus conserve son
origine et sa progression. Une identité d’exemple ne doit pas être déduite du nom
du dossier ni des titres des entretiens.

Séparer **créer/installer un nouveau corpus d'exercice** et **ouvrir un corpus existant**.
Seule la première installe le point de départ. La seconde n'en réapplique pas le contenu.
Le dialogue ordinaire de création doit pouvoir annoncer l'usage apprentissage avant
l'écriture et l'ouverture, sans fabriquer ensuite une deuxième copie pour le guide.
Les vérifications de présence et les opérations sur les fichiers restent côté main.

Gérer l’éligibilité aux Récents côté main, pas seulement par un filtre visuel dans
`Accueil.vue`. Aujourd’hui, `finaliserBasculeLocale()` appelle `ajouterRecent()` à
chaque ouverture locale, avant même que le constructeur de démo pose son marqueur.
La nouvelle préparation doit donc annoncer l’usage d’apprentissage avant cette
inscription, tout en conservant les protections de la transition locale.

Utiliser une règle commune pour l’inscription, la liste, le menu, le démarrage et
le choix de secours après suppression du corpus courant. Le marqueur persistant
permet de reconnaître cet usage même si le guide est en pause ou le profil est neuf.
La mémoire des copies d’apprentissage est indépendante de la liste limitée des
Récents : elle ne doit pas perdre une copie parce que d’autres corpus ont été ouverts.

Lors de la préparation, revérifier la destination côté main avant toute écriture.
La garde actuelle fondée principalement sur `membership` ne suffit pas à qualifier
un dossier de vide : des documents cadre, variables ou autres données peuvent déjà
constituer un travail sans aucun entretien. Ne pas confondre ce cas avec un squelette
réellement vierge ; refuser également les collisions avec les sources et les autres copies.

### 5.3 Compatibilité avec les corpus actuels

- reconnaître les anciens marqueurs `mode: 'pas-a-pas' | 'autonomie'` ;
- rattacher ces deux variantes aux points de départ correspondants ;
- préserver leurs dossiers distincts : **aucune fusion automatique** ;
- conserver toutes les progressions, y compris l'ancien champ `validees` ;
- reconnaître la création du corpus comme acquise sur un corpus d'apprentissage
  existant vérifié, sans décaler les identifiants des quatre anciennes étapes de préparation ;
- ne pas transformer un corpus « autonomie » en corpus annoté ;
- ne pas déplacer les sources ni imposer une réinstallation ;
- permettre le rattachement au catalogue depuis un dossier sans mémoire locale du profil ;
- transférer les anciens accès pas à pas vers le catalogue avant de retirer leurs
  raccourcis des Récents, sans supprimer ni déplacer les données ;
- conserver le comportement des Récents pour les anciens corpus en autonomie ;
- ne pas assimiler un corpus utilisateur sans marqueur à un exemple en fonction de son nom.

### 5.4 Répartition du code après réalisation

| Fichier / zone | Réalisation |
| --- | --- |
| `src/renderer/components/accueil/Accueil.vue` | Deux entrées : catalogue des parcours et exploration des exemples ; Récents sans apprentissage. |
| `src/renderer/components/accueil/InstallationExemple.vue` | Installation commune à Traitement et à l'exploration libre ; ancien `ModaleDemo.vue` supprimé. |
| `src/renderer/components/accueil/DecouverteExemples.vue`, `CatalogueParcours.vue` | Un seul catalogue global, indépendant de la vue Corpus et des données appliquées au modèle. |
| `src/renderer/components/accueil/NouveauCorpus.vue` | Utiliser le même dialogue et la même commande pour la création ordinaire et la première étape guidée. |
| `src/renderer/composables/useExemples.ts`, `parcours/useGuide.ts` | Cycle explicite des travaux et guide séparés ; ancien `demo.ts` supprimé, sans adaptateur permanent. |
| `src/main/exemples.ts`, `src/shared/exemples.ts` | Identités, registre des travaux, gardes et préparation des installations ; lecture compatible des anciennes données. |
| `src/shared/format.ts` | Identité d’exemple, mémoire des copies et lecture des anciens marqueurs. |
| `src/main/index.ts`, `src/preload/index.ts` | Présence, ouverture, gardes, rattachement des copies et politique commune des Récents. |
| `src/renderer/composables/parcours/` et composants de parcours | Catalogue accessible sans corpus chargé, progression par copie et lancement du parcours sélectionné après ouverture. |
| `src/renderer/composables/sonal.ts`, `corpus/useCycleCorpus.ts` | Utiliser le cycle sécurisé d’ouverture et appliquer ensuite la destination choisie. |
| `src/renderer/composables/useEspacesTravail.ts` | Réutiliser les commandes de navigation existantes, sans seconde navigation propre aux exemples. |

### 5.5 Remplacer l'orchestration obsolète plutôt que l'envelopper

**Décision : préserver les travaux existants, pas l'architecture de la démo.**
Le commit `248a420` fournit le point de retour avant ce changement de parcours.
La réalisation peut supprimer ou réécrire les anciens composants quand cela réduit
le nombre d'états, de chemins d'ouverture et de dépendances.

L'inspection avant réalisation a identifié les points à remplacer :

- `demo.ts` réunit le constructeur du corpus, la mémoire de deux modes, les étapes
  de traitement, le catalogue et le moteur du guide. `preparer()` installe les sources,
  ouvre un corpus, réimporte par titre, pose son marqueur puis ouvre un second catalogue.
  Ce flux doit être remplacé, pas rappelé depuis les nouveaux boutons.
- `ParcoursPasAPas.vue` lit directement le modèle Sonal actif pour son catalogue.
  Réécrire cette partie pour afficher des descriptions et des progressions sans
  appliquer un autre corpus. Ne pas ajouter un deuxième catalogue qui synchroniserait
  son état avec l'ancien.
- `EtapePasAPas.fait()` et la persistance actuelle supposent un corpus déjà chargé.
  Traiter le début **Créer votre corpus** dans le lancement du parcours, avec un
  résultat explicite de création réussie. Ne pas fabriquer un corpus provisoire
  simplement pour satisfaire ces anciennes dépendances.
- `NouveauCorpus.vue` expose déjà le nom, le dossier et la commande de création.
  Réutiliser ou refactorer ce dialogue unique pour le guidage ; ne pas lui ajouter
  un second assistant spécialisé qui recopierait son comportement.

Organisation cible limitée à trois responsabilités, sans framework supplémentaire :

1. Des descriptions de parcours/exemples consultables sans corpus actif, et une
   mémoire des travaux associés. Une seule sélection de parcours et de corpus.
2. Un cycle explicite **créer/installer** ou **ouvrir**, passant par les commandes
   métier et les protections de transition locales existantes. Il porte la demande
   de parcours et d'étape jusqu'à son arrivée ; l'installation des sources reste séparée.
3. Un guide pour le corpus effectivement ouvert, avec ses prédicats métier, ses
   acquis et sa pause. Le guide de création utilise le dialogue ordinaire, puis
   transmet la suite au même guide, sans deuxième moteur ni machine d'états générique.

Conserver ce qui protège les données ou fournit un geste métier : pipeline d'import,
stockage, sauvegarde, fermeture de session distante, navigation d'espace et rendu du
guide. Déplacer les définitions de traitement hors du constructeur de démo si elles
restent utiles. Les aides pures de progression et de lecture des anciens marqueurs
peuvent rester ; supprimer les branches et handlers sans appelants après bascule.

La compatibilité se concentre sur la lecture des données : anciens marqueurs,
emplacements et identifiants d'étapes. Ne pas conserver `ModeDemo`, les deux mémoires
et les nouvelles collections comme trois sources de vérité. Mettre les tests sur les
nouveaux parcours et les données préservées, pas sur les anciennes classes CSS ou
l'ancien enchaînement de fenêtres. Ne jamais garder une copie du vieux système
uniquement pour faire passer ces tests.

## 6. Suivi de réalisation

Le constructeur de démo et l'assistant à deux dossiers ont été supprimés.
`useExemples` possède le catalogue et les demandes de lancement ; `useGuide` ne gère
plus leur affichage et n'installe aucun corpus. La création ordinaire et la création
guidée passent par la même commande et les mêmes transitions locales.
Les descriptions et prédicats pédagogiques utiles restent partagés, sans second catalogue.

### Préalable — Organiser les contenus fournis

- [x] Déplacer les sources actuelles dans `CorpusTest/CorpusSynth/`.
- [x] Adapter les accès en développement et dans les paquets, sans changer les
  emplacements des sources déjà installées ni le fonctionnement de la démo.
- [x] Réserver `CorpusTest/CorpusSynthAnnot/` pour la variante annotée.
- [x] Convertir le corpus annoté SonalPi1 en corpus SonalPi2 enregistré.
- [x] Retirer les originaux SonalPi1 et les références de provenance devenues inutiles.
  Les contrôles du corpus exemple portent désormais sur ses seules données V2.
- [x] Réassigner les références audio à l'installation de chaque copie annotée,
  sans modifier le modèle fourni et sans dupliquer les audios.

Les deux contenus sont proposés dans l'interface réelle des exemples.

### Lot 1 — Valider le parcours d’interface

La [maquette interactive et ses scénarios](../maquettes/corpus-exemples-interface.md)
sont disponibles pour validation. Elle ne manipule aucun corpus réel et ne remplace
pas les futurs tests d'intégration. Les validations utilisateur ci-dessous restent ouvertes.

- [x] Préparer une maquette interactive autonome des parcours, de la reprise et de l'exploration libre.
- [x] Retenir le choix du parcours avant la préparation du corpus (variante B).
- [x] Conserver les cartes cliquables et le détail du parcours sélectionné en dessous.
- [x] Mettre les informations de corpus sous les étapes et le bouton principal.
- [x] Faire de **Créer votre corpus** la première étape de Préparer et suivre (cinq étapes).
- [x] Garder l'installation des sources automatique et l'entrée directe par Traitement.
- [x] Réserver les actions secondaires aux options ; récupération seulement si le dossier manque,
  et choix d'un autre corpus seulement s'il en existe plusieurs.
- [ ] Valider la maquette accueil → catalogue des parcours → préparation si nécessaire → guidage.
- [x] Retenir et appliquer l'exclusion des travaux d'apprentissage des Récents, pas des explorations libres.
- [ ] Valider la reprise et le rattachement des copies depuis le catalogue, y compris après achèvement.
- [ ] Valider l’emplacement proposé et l’accès facultatif aux sources.
- [x] Définir les intitulés des parcours, des exemples et des actions de reprise.
- [x] Vérifier navigation clavier, fermeture/annulation, retour du focus et fenêtre étroite
  sur la maquette puis sur le catalogue réel.

### Lot 2 — Remplacer l'orchestration de démo

- [x] Identifier les dépendances à supprimer ou réécrire, et les protections métier à conserver.
- [x] Remplacer `preparer(mode)` et l'ancien assistant, sans adaptateur permanent ni double catalogue.
- [x] Brancher **Créer votre corpus** sur le dialogue ordinaire, sans corpus provisoire.
- [x] Rendre le catalogue consultable sans ouvrir de corpus ; lire la progression des copies associées.
- [x] Introduire la distinction durable apprentissage / exploration libre et la lecture compatible de l'existant.
- [x] Migrer les accès pas à pas vers le catalogue puis appliquer la politique des Récents côté main.
- [x] Séparer ouverture et installation avant d'ajouter un nouvel exemple à l'interface.
- [x] Préserver les anciens dossiers, sources et progressions, y compris les accès aux dossiers manquants.
- [x] Étendre les gardes aux différentes copies, aux chemins imbriqués et aux travaux sans entretien.

### Lot 3 — Livrer l’interface multi-exemples

- [x] Remplacer les cartes par les entrées retenues et l'installation commune à Traitement et aux exemples.
- [x] Placer les informations de corpus après les étapes et l'action principale.
- [x] Ajouter continuer/revoir et les options contextuelles de nouveau corpus, choix de corpus et récupération.
- [x] Transmettre le parcours choisi jusqu'au démarrage du guide, sans seconde sélection.
- [x] Ouvrir initialement l'exemple annoté sur Synthèse, sans guide ni calcul automatique.
- [x] Conserver les exercices et prédicats pédagogiques existants ; la pause laisse les outils ordinaires libres.
- [x] Mettre à jour la documentation utilisateur et `docs/dev/ouverture-corpus.md`.

### Lot 4 — Vérifier les parcours et les non-régressions

Vérifications automatiques locales ajoutées : installation hors destination avant
fermeture, refus de fermeture sans publication, ancien profil et anciens acquis,
références audio réassignées, aucune réimportation à la reprise, rattachement manuel
sans bascule, dossiers déplacés, plusieurs travaux, refus d'écrasement et clavier.
Les parcours de préparation et de traitement sont exercés avec les vrais outils.
Bilan des vérifications exécutées :

- [x] Contrôle des types et build.
- [x] 148 fichiers de tests unitaires locaux, 1 937 tests réussis.
- [x] 34 scénarios E2E applicatifs et 15 scénarios de maquette réussis.
- [x] Construction du paquet Linux et deux tests d'installation réels depuis ce paquet,
  pour le corpus transcrit et le corpus annoté, avec vérification des références audio.
- [ ] Essai manuel du sélecteur natif et de l'installeur Windows.
- [ ] Qualification GitLab/Nextcloud réelle des changements de contexte ; la fermeture
  refusée est vérifiée localement, pas sur les bancs Docker dans cette réalisation.

Scénarios prioritaires :

1. Ouvrir le catalogue sans créer de fichier ni changer de corpus ; choisir le parcours
   avant toute préparation, sans devoir connaître les fichiers SRT ni leur organisation.
2. Reprise après modification, renommage ou suppression d’un entretien : aucune réimportation.
3. Deux exemples et plusieurs copies : données, progressions et filtres ne se mélangent pas.
4. Changer d’espace ne change jamais de corpus ; quitter le guide conserve le travail.
5. Reprise des anciens modes : pas à pas depuis le catalogue, autonomie depuis les
   exemples ou les Récents ; rattachement possible depuis un nouveau profil.
6. Dossier déplacé, sources absentes, corpus illisible, annulation et échec d’écriture.
7. Refus d’écraser un corpus, même sans entretien mais avec des données de préparation.
8. Changement depuis un entretien modifié ou une session distante : protections conservées.
9. Arrivée dans Synthèse compréhensible, sans annoncer un guide d’analyse inexistant.
10. **Continuer** reprend le bon parcours et la bonne copie, sans nouveau choix du parcours.
11. Une copie d’apprentissage n’entre jamais dans les Récents, même lors de sa
    préparation initiale, après pause du guide ou via l’ouverture manuelle d’un dossier.
12. Les copies d’apprentissage n’apparaissent pas dans le menu des Récents et ne sont
    pas choisies au démarrage ni comme corpus de secours après suppression.
13. Un parcours terminé et toutes ses copies restent accessibles ; la migration des
    anciens raccourcis ne supprime ni données ni accès.
14. Revenir au catalogue ou annuler la préparation laisse le corpus courant intact ;
    un parcours d’import conserve les véritables gestes d’import à réaliser.
15. Cliquer sur une carte affiche ses étapes en dessous sans ouvrir de corpus ;
    le dossier et ses options apparaissent après les étapes et l'action principale.
16. Cliquer sur une étape disponible prépare ou reprend la bonne copie, puis lance
    cette étape précise ; une annulation ou un échec ne lance pas le guidage.
17. Réutiliser une copie compatible pour un autre parcours ne repropose pas son
    installation et ne réinitialise ni les données ni les progressions ; la création
    du corpus est déjà acquise dans Préparer et suivre.
18. Sans corpus d'exercice, Préparer et suivre commence par le dialogue ordinaire
    de création, sans installation préalable ni corpus provisoire ; nom et dossier
    sont choisis par l'utilisateur. La première étape compte dans les cinq étapes.
19. Annuler ou échouer pendant la création ne valide aucune étape et conserve le
    corpus actif ; après réussite, rejoindre la prochaine étape ou celle choisie.
20. Revoir la création d'un corpus existant ne crée pas de nouveau dossier et ne
    remet rien à zéro. Refaire le geste passe par une demande explicite de nouveau corpus.
21. Un seul corpus enregistré : aucun sélecteur superflu ; dossier retrouvé : aucune
    action de récupération permanente ; plusieurs travaux : anciennes progressions accessibles.

Bases de tests existantes : `e2e/demo.e2e.ts`, `e2e/pas-a-pas.e2e.ts`,
`e2e/preparation-pas-a-pas.e2e.ts`, `e2e/multi-corpus.e2e.ts`,
`e2e/espaces-contexte.e2e.ts`, `test/marqueurDemo.test.ts` et `test/corpusStore.test.ts`.
Les tests d’interface peuvent utiliser de petites données de test : leur réalisation
ne dépend pas de la rédaction du futur corpus pédagogique complet.

## 7. Synthèse des choix

Orientation retenue et recommandations pour une première version :

1. **Parcours pas à pas → Choisir un parcours → Créer, installer ou reprendre selon le besoin**.
   Préparer et suivre apprend la création ; Traitement peut préparer son corpus automatiquement.
   Pas d'import préalable au choix ni de second catalogue après l'ouverture.
2. **Explorer les corpus exemples** comme entrée distincte pour l’exploration libre.
3. **Cartes cliquables, étapes puis action principale, informations de corpus en dessous**.
   **Créer votre corpus** est une étape de Préparer et suivre ; l'installation des fichiers
   reste automatique. Une étape choisie reste la destination après création ou installation.
   Les options de changement de corpus et de récupération n'apparaissent qu'au besoin.
4. **Reprendre sans reconstruire**, nouvelle copie comme alternative non destructive.
5. **Copies d’apprentissage hors des Récents**, retrouvées avec leur progression dans
   le catalogue ; copies d'exploration libre toujours éligibles aux Récents.
6. **Guidage activable ou suspendable**, sans changer l’usage ni l’identité de la copie.
7. **Un seul corpus actif**, aucun changement implicite lors de la consultation du
   catalogue ou de la navigation entre espaces.

8. **Remplacer plutôt qu'empiler** : les anciens mécanismes de démo peuvent être supprimés
   ou réécrits. Préserver les données, les protections de transition et les gestes métier,
   pas l'ancien découpage du code.

Les outils d'analyse et le modèle métier des corpus restent les mêmes. Le catalogue,
l'entrée dans les exemples et leur cycle de reprise sont refondus sans chercher à
conserver à tout prix l'orchestration actuelle.
