# Plusieurs corpus exemples — interface et parcours d’ouverture

Statut : sources réorganisées et corpus annoté converti en SonalPi2.
Une [maquette interactive](../maquettes/corpus-exemples-interface.md) permet de
valider le choix du parcours avant la préparation, la reprise et l'exploration libre.
La séparation des copies d’apprentissage et des Récents reste proposée ci-dessous.
Le fonctionnement actuel de l'application n'a pas encore été refondu.

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

## 2. Ce que fait réellement l’interface actuelle

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

- **Parcours pas à pas** → choisir ce que l’on veut apprendre → préparer ou
  reprendre le corpus adapté → commencer ou continuer le parcours ;
- **Explorer les corpus exemples** → choisir le contenu que l’on veut explorer
  librement → préparer ou reprendre sa copie → ouvrir l’espace conseillé.

La fenêtre de préparation est commune aux deux entrées, mais intervient après le
choix pédagogique ou le choix d’exemple. Elle n’apparaît pas si la copie est déjà prête.

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
Organiser le terrain et les documents du projet.
[Commencer…] ou [Continuer — 2 étapes sur …]

Importer et traiter
Apprendre à importer et travailler les entretiens.
[Commencer…] ou [Continuer — 3 étapes sur …]

Analyser et interpréter
Explorer des entretiens déjà annotés.
[À venir] tant que le parcours n’est pas disponible
```

Conserver la présentation actuelle : **cartes des parcours en haut, détail du
parcours sélectionné en dessous**. Cliquer sur une carte affiche ses étapes et
le préalable de préparation, sans lancer le parcours.

Consulter ce catalogue ne crée aucun fichier, ne change pas le corpus actif et ne
lance aucune étape. Fermer le catalogue laisse le travail courant intact.
La progression affichée correspond à la copie d’apprentissage associée au parcours,
pas à un total agrégé entre différentes copies.

**Explorer les corpus exemples** présente une sélection simple des contenus fournis,
notamment les entretiens déjà importés actuels et, lorsqu’il sera disponible, le
corpus annoté. Pas de bibliothèque complexe, de filtres ou de sélecteur sans choix
réel pour cette première version.

### 4.2 Après le choix du parcours : préparer seulement ce qui manque

**Choix retenu : préparer ou charger le corpus est un préalable visible, pas une
première étape pédagogique.** Il ne reçoit ni numéro, ni case à cocher, et ne compte
pas dans le total des étapes ou la progression. Il ne doit pas être présenté comme
un exercice à refaire à chaque parcours.

Dans le détail sous les cartes, afficher un bloc **Pour ce parcours**, avant la
liste des étapes :

- copie absente : présenter le contenu nécessaire et proposer
  **Préparer le corpus et commencer** ;
- copie prête : afficher **Votre corpus d’apprentissage est prêt**, la progression
  et **Continuer le parcours** (ou **Commencer** si aucune étape n’a été réalisée) ;
- copie compatible déjà utilisée par un autre parcours : annoncer sa réutilisation,
  sans nouvelle préparation ni remise à zéro.

Le bouton de préparation ouvre la fenêtre d’emplacement décrite ci-dessous.
Cliquer directement sur une étape disponible, pour la commencer ou la revoir,
passe par le même préalable : préparer ou ouvrir la copie si nécessaire, puis
rejoindre **l’étape choisie**, sans imposer de recommencer à la première.
Respecter les prérequis pédagogiques des étapes ; en cas d’annulation ou d’échec,
ne lancer aucune étape et conserver la sélection pour réessayer.

```text
Parcours pas à pas
  → Choisir un parcours pas à pas
      → Commencer…
          → Présenter le corpus adapté et son emplacement
          → Préparer les fichiers nécessaires
          → Ouvrir la copie et commencer le parcours choisi
      → Continuer
          → Retrouver la copie et sa progression
          → Ouvrir la copie et reprendre le parcours choisi
```

Le parcours détermine son point de départ conseillé. L’utilisateur n’a pas à choisir
entre des variantes techniques de corpus pour savoir laquelle permet de le suivre.
Si une copie compatible existe déjà, elle peut être réutilisée : annoncer par exemple
« Ce parcours utilise votre corpus d’apprentissage de préparation et de traitement ».
Ne pas demander à nouveau son emplacement et ne pas le réinitialiser.

Lorsqu’une préparation est nécessaire, la fenêtre commune rappelle le parcours
sélectionné, ce qui sera disponible et l’emplacement proposé :

```text
Préparer le corpus pour « Importer et traiter »

Vous apprendrez à importer les entretiens dans votre copie d’apprentissage.
Les fichiers d’exercice seront préparés pour vous.
Votre progression et vos modifications seront conservées.

Emplacement : Documents/Sonal/Apprentissage/…             [Modifier…]

[Retour aux parcours]                           [Préparer et commencer]
```

Pour l’exploration libre, la même fenêtre présente l’exemple plutôt que le parcours,
propose un emplacement dans les exemples et utilise **Ouvrir ma copie**.

Principes :

- montrer ce que la personne trouvera, avant de demander où le ranger ;
- proposer un emplacement lisible et modifiable, sans imposer deux sélecteurs ;
- préparer automatiquement les fichiers nécessaires, après validation ;
- laisser le détail des fichiers sources dans une zone facultative ;
- conserver un accès **Voir les fichiers d’exercice** pour le véritable import ;
- distinguer la préparation technique des fichiers de l’import enseigné : si
  importer un entretien est un exercice, ne pas réaliser cet exercice à la place
  de l’utilisateur ;
- conserver le choix du parcours jusqu’à l’arrivée dans le corpus : ne pas rouvrir
  un second catalogue demandant de choisir à nouveau.

La « copie » désigne le corpus de travail, pas une duplication systématique des
médias. Conserver la séparation entre sources et corpus et le référencement des
audios. Les sources historiques restent à leur emplacement.

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

Si plusieurs copies d’apprentissage existent, le détail du parcours permet de
choisir **Autres copies…**. Le catalogue indique clairement laquelle sera reprise.
Il devient le point d’accès durable à ces données, y compris pour un parcours terminé.

Une action secondaire **Créer une nouvelle copie…** permet de repartir de zéro,
dans un autre dossier. Elle laisse l’ancienne copie et sa progression accessibles.
Si plusieurs parcours partagent une copie, préciser lesquels utiliseront la nouvelle
copie ; ne pas déplacer silencieusement les progressions de l’ancienne.
Aucune réinitialisation destructive n’est prévue dans cette première version.

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
| Dossier déplacé ou absent | « Nous ne retrouvons plus votre corpus. » Actions **Retrouver le dossier…**, **Créer une nouvelle copie…**, **Annuler**. |
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
- **Retrouver une copie d’apprentissage…** permet de rattacher un dossier déplacé
  ou utilisé depuis un autre profil, sans recréer ses données ;
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

### 5.2 Catalogue et mémoire génériques, sans gestionnaire surdimensionné

Prévoir les descriptions des parcours et des exemples indépendamment du corpus
actif : identifiants stables, titres, résumés, points de départ compatibles et
destinations conseillées. Le catalogue doit pouvoir afficher une progression
mémorisée sans appliquer le corpus au modèle actif ; vérifier les données réelles
et les conditions pédagogiques lors de la reprise.

Mémoriser l’association parcours → copie d’apprentissage, avec la possibilité que
plusieurs parcours désignent la même copie. Le choix fait avant l’ouverture porte
jusqu’au lancement du guide, sans seconde sélection.

Remplacer à terme les champs spécifiques `corpusPasAPas` / `corpusAutonomie` par une
collection de travaux rattachés aux exemples. Les réglages du profil mémorisent les
emplacements et le dernier travail utilisé ; le marqueur du corpus conserve son
origine et sa progression. Une identité d’exemple ne doit pas être déduite du nom
du dossier ni des titres des entretiens.

Séparer les commandes **préparer une nouvelle copie** et **ouvrir une copie existante**.
Seule la première installe le point de départ. La seconde n’en réapplique pas le contenu.
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
- conserver toutes les progressions, y compris l’ancien champ `validees` ;
- ne pas transformer un corpus « autonomie » en corpus annoté ;
- ne pas déplacer les sources ni imposer une réinstallation ;
- permettre le rattachement au catalogue depuis un dossier sans mémoire locale du profil ;
- transférer les anciens accès pas à pas vers le catalogue avant de retirer leurs
  raccourcis des Récents, sans supprimer ni déplacer les données ;
- conserver le comportement des Récents pour les anciens corpus en autonomie ;
- ne pas assimiler un corpus utilisateur sans marqueur à un exemple en fonction de son nom.

### 5.4 Points de code concernés lors d’une future réalisation

| Fichier / zone | Évolution envisagée |
| --- | --- |
| `src/renderer/components/accueil/Accueil.vue` | Deux entrées : catalogue des parcours et exploration des exemples ; Récents sans apprentissage. |
| `src/renderer/components/accueil/ModaleDemo.vue` | Présentation de l’exemple, emplacement proposé, première ouverture et erreurs. |
| `src/renderer/composables/demo.ts` | Séparer installation, reprise et guidage ; remplacer les branches par mode. |
| `src/shared/format.ts` | Identité d’exemple, mémoire des copies et lecture des anciens marqueurs. |
| `src/main/index.ts`, `src/preload/index.ts` | Présence, ouverture, gardes, rattachement des copies et politique commune des Récents. |
| `src/renderer/composables/parcours/` et composants de parcours | Catalogue accessible sans corpus chargé, progression par copie et lancement du parcours sélectionné après ouverture. |
| `src/renderer/composables/sonal.ts`, `corpus/useCycleCorpus.ts` | Utiliser le cycle sécurisé d’ouverture et appliquer ensuite la destination choisie. |
| `src/renderer/composables/useEspacesTravail.ts` | Réutiliser les commandes de navigation existantes, sans seconde navigation propre aux exemples. |

## 6. Plan de réalisation proposé

### Préalable — Organiser les contenus fournis

- [x] Déplacer les sources actuelles dans `CorpusTest/CorpusSynth/`.
- [x] Adapter les accès en développement et dans les paquets, sans changer les
  emplacements des sources déjà installées ni le fonctionnement de la démo.
- [x] Réserver `CorpusTest/CorpusSynthAnnot/` pour la variante annotée.
- [x] Convertir le corpus annoté SonalPi1 en corpus SonalPi2 enregistré.
- [x] Retirer les originaux SonalPi1 et les références de provenance devenues inutiles.
  Les contrôles du corpus exemple portent désormais sur ses seules données V2.
- [ ] Adapter les références audio lors de l'installation de l'exemple annoté
  sur un autre ordinateur.

Cette organisation des fichiers n'ajoute pas encore d'exemple dans l'interface.

### Lot 1 — Valider le parcours d’interface

La [maquette interactive et ses scénarios](../maquettes/corpus-exemples-interface.md)
sont disponibles pour validation. Elle ne manipule aucun corpus réel et ne remplace
pas les futurs tests d'intégration. Les validations utilisateur ci-dessous restent ouvertes.

- [x] Préparer une maquette interactive autonome des parcours, de la reprise et de l'exploration libre.
- [x] Retenir le choix du parcours avant la préparation du corpus (variante B).
- [x] Conserver les cartes cliquables et le détail du parcours sélectionné en dessous.
- [x] Présenter la préparation comme un préalable visible, hors étapes et progression.
- [ ] Valider la maquette accueil → catalogue des parcours → préparation si nécessaire → guidage.
- [ ] Confirmer l’exclusion des copies d’apprentissage des Récents, pas des copies libres.
- [ ] Valider la reprise et le rattachement des copies depuis le catalogue, y compris après achèvement.
- [ ] Valider l’emplacement proposé et l’accès facultatif aux sources.
- [ ] Définir les intitulés distinguant les variantes et les copies déjà commencées.
- [x] Vérifier sur la maquette navigation clavier, fermeture/annulation, retour du focus et fenêtre étroite.
  Ces vérifications restent à refaire après intégration dans l'application.

### Lot 2 — Séparer identité, reprise et accompagnement

- [ ] Rendre le catalogue consultable sans ouvrir de corpus ; lire la progression des copies associées.
- [ ] Introduire la distinction durable apprentissage / exploration libre et la lecture compatible de l’existant.
- [ ] Migrer les accès pas à pas vers le catalogue puis appliquer la politique des Récents côté main.
- [ ] Séparer ouverture et installation avant d’ajouter un nouvel exemple à l’interface.
- [ ] Préserver les anciens dossiers, sources et progressions.
- [ ] Étendre les gardes aux différentes copies et aux travaux sans entretien.

### Lot 3 — Livrer l’interface multi-exemples

- [ ] Remplacer les cartes par les entrées retenues et la fenêtre commune.
- [ ] Ajouter les actions continuer, revoir, retrouver une copie et créer une nouvelle copie.
- [ ] Transmettre le parcours choisi jusqu’au démarrage du guide, sans seconde sélection.
- [ ] Ouvrir l’exemple d’analyse dans l’espace adapté lorsqu’il sera disponible.
- [ ] Garder les guides existants compatibles sans attendre un tutoriel d’analyse.
- [ ] Mettre à jour la documentation utilisateur et `docs/dev/ouverture-corpus.md`.

### Lot 4 — Vérifier les parcours et les non-régressions

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
15. Cliquer sur une carte affiche son détail en dessous sans ouvrir de corpus ; le
    préalable de préparation n’ajoute aucune étape et ne modifie pas la progression.
16. Cliquer sur une étape disponible prépare ou reprend la bonne copie, puis lance
    cette étape précise ; une annulation ou un échec ne lance pas le guidage.
17. Réutiliser une copie compatible pour un autre parcours ne repropose pas son
    installation et ne réinitialise ni les données ni les progressions.

Bases de tests existantes : `e2e/demo.e2e.ts`, `e2e/pas-a-pas.e2e.ts`,
`e2e/preparation-pas-a-pas.e2e.ts`, `e2e/multi-corpus.e2e.ts`,
`e2e/espaces-contexte.e2e.ts`, `test/marqueurDemo.test.ts` et `test/corpusStore.test.ts`.
Les tests d’interface peuvent utiliser de petites données de test : leur réalisation
ne dépend pas de la rédaction du futur corpus pédagogique complet.

## 7. Synthèse des choix

Orientation retenue et recommandations pour une première version :

1. **Parcours pas à pas → Choisir un parcours → Préparer ou reprendre le corpus adapté**.
   Pas d’import préalable ni de second choix du parcours après l’ouverture.
2. **Explorer les corpus exemples** comme entrée distincte pour l’exploration libre.
3. **Cartes cliquables et détail en dessous**, avec un préalable visible de préparation,
   non compté parmi les étapes. La fenêtre commune de première ouverture propose un
   emplacement modifiable et n’apparaît que si nécessaire. Un accès direct à une étape
   disponible passe par le même préalable avant de rejoindre l’étape choisie.
4. **Reprendre sans reconstruire**, nouvelle copie comme alternative non destructive.
5. **Copies d’apprentissage hors des Récents**, retrouvées avec leur progression dans
   le catalogue ; copies d’exploration libre toujours éligibles aux Récents (proposition).
6. **Guidage activable ou suspendable**, sans changer l’usage ni l’identité de la copie.
7. **Un seul corpus actif**, aucun changement implicite lors de la consultation du
   catalogue ou de la navigation entre espaces.

Ces choix répondent au besoin de plusieurs exemples tout en limitant la refonte :
les outils d’analyse et le modèle métier des corpus restent les mêmes ; c’est
l’entrée dans les exemples, leur identité et leur cycle de reprise qui sont clarifiés.
