# L'ouverture d'un corpus

L'ouverture ordinaire, l'installation d'un exemple et l'activation du guide sont
séparées. **Reprendre un travail ne réinstalle jamais son contenu initial.**

## 1. Les chemins d'entrée

| Action | Renderer | Processus principal |
| --- | --- | --- |
| Démarrage | `useCycleCorpus.chargerCorpus()` | Liste des Récents, puis ouverture du premier récent local vivant et admissible. |
| Ouvrir un corpus local | `useProfil.choisirDossier()` puis cycle sécurisé | Choix natif et `changerDossier()`, sauf corpus d'apprentissage reconnu. |
| Clic sur un récent | `useCycleCorpus.ouvrirRecent()` | Ouverture locale ou fournisseur distant, selon l'entrée. |
| Nouveau corpus local | `NouveauCorpus.vue`, `creerNouveauCorpus()` | `corpus:creerNouveau`, transition locale ordinaire. |
| Préparer un corpus d'apprentissage | `InstallationExemple.vue`, `useExemples` | Choix de l’emplacement, préparation d’un nouveau corpus, puis publication après fermeture du contexte courant. |
| Installer un exemple libre | `InstallationExemple.vue`, `useExemples` | Préparation d'un nouveau corpus, puis publication après fermeture du contexte courant. |
| Reprendre un exemple | `useExemples`, puis le cycle ordinaire | Vérification d'identité, ouverture, sans import ni copie de sources. |
| Ouvrir/créer un corpus distant | Assistants Nextcloud ou GitLab | Commandes du fournisseur, jamais ouverture locale du miroir. |

Consulter le catalogue ne ferme pas l'entretien, ne change pas le corpus actif et
ne crée aucun dossier d'exercice. Le profil peut normaliser ses anciens raccourcis.
Une ouverture effective continue à utiliser la sauvegarde et les protections de
transition du corpus courant.

## 2. L'amorçage ordinaire et ses limites

Un dossier = un corpus. `CorpusStore.preparerOuverture()` calcule la lecture ou
l'amorçage ; `finaliserOuverture()` applique la préparation après vérification de
la cible. Un dossier neuf reçoit les quatre catégories du bloc Pondérations,
les autres blocs vides et la version courante du format.

Chaque store ne peut amorcer qu'une fois. Ensuite, si `corpus.json` disparaît,
`ouvrir()` lève la sentinelle `CORPUS_SUPPRIME` au lieu de recréer un corpus fantôme.
Cette garde précède toute création de dossier.

L'installation d'un exemple est plus stricte que l'ouverture ordinaire : **le dossier
cible doit être vide ou absent**, même si les fichiers présents ne sont pas des
entretiens ou si `membership` est vide. Aucun ancien squelette n'est reconstruit
pour accueillir un exemple.

La migration SonalPi1 reste une autre commande : ses définitions viennent du `.crp`,
pas du bloc Pondérations d'un corpus neuf.

## 3. Les Récents et le démarrage

Les Récents ne contiennent que les corpus ordinaires et les explorations libres.
Les corpus d'apprentissage restent accessibles depuis **Parcours pas à pas**, même
après achèvement ou pause du guide.

La règle est appliquée côté main : inscription, liste, menu, démarrage et choix de
secours après suppression du corpus courant. Le marqueur est posé avant la première
inscription possible d'un nouveau corpus d'apprentissage.

Lors de la lecture des anciens Récents, un corpus d'apprentissage reconnu est d'abord
rattaché au registre des exemples, puis seul son raccourci est retiré des Récents.
Les dossiers et leurs données ne sont jamais déplacés ou supprimés pour ce nettoyage.
Un dossier absent ou sans `corpus.json` n'est pas rouvert automatiquement.

Le démarrage ouvre le premier récent **local** admissible, pas un fournisseur distant.
Sans récent admissible, aucun corpus d'exercice n'est créé ; l'Accueil reste affiché.
Les destinations distantes restent identifiées par leur fournisseur et leur identifiant,
jamais par un chemin de miroir.

## 4. Les corpus exemples et le guidage

### Responsabilités

| Fichier | Rôle |
| --- | --- |
| `src/shared/exemples.ts` | Identités des contenus, usages, mémoire du profil, résumés et demande d'installation. |
| `src/main/exemples.ts` | Reconnaissance, registre des travaux, gardes, préparation des nouveaux corpus et restauration des sources. |
| `src/renderer/composables/useExemples.ts` | Choix du parcours/exemple, création ou reprise explicite, transmission de l'étape choisie. |
| `src/renderer/composables/parcours/useGuide.ts` | Observation et validation des gestes sur le corpus ouvert, acquis, contexte et pause. |
| `components/accueil/DecouverteExemples.vue` et `CatalogueParcours.vue` | Une seule fenêtre de découverte, accessible indépendamment de la vue courante. |

L'ancien `demo.ts`, son flux `preparer(mode)`, les handlers `demo:*` et l'assistant
à deux dossiers ont été supprimés. Ils ne restent pas comme couche de compatibilité.
Le pipeline d'import, les prédicats pédagogiques et les protections du cycle ordinaire
sont conservés.

### Identité et mémoire

Le champ additif `corpus.json.demo` conserve l'origine et les acquis :

```text
{ id, exemple: 'synth' | 'synth-annote', usage: 'apprentissage' | 'libre',
  racineSources, parcours, parcoursApprentissage?, dernierParcoursId? }
```

L'identifiant est créé à l'installation. Le nom du dossier et les titres des entretiens
ne servent jamais à reconnaître un exemple. `dernierParcoursId` n'est pas une étape
active : aucune étape ne redémarre à la seule ouverture du corpus ou du catalogue.

`settings.json.exemples` mémorise les emplacements des travaux, un corpus d’apprentissage
par parcours et la dernière exploration choisie pour chaque contenu. La liste n'est pas
limitée à huit comme les Récents. Les progressions sont relues depuis les corpus ;
un travail introuvable ou illisible reste enregistré, sans progression inventée.

Seul le format actuel est reconnu : identité explicite (`id`, `exemple`, `usage`),
parcours d’apprentissage indiqué et acquis séparés dans `parcours`. Il n’y a pas de
migration des anciens marqueurs ou des anciennes mémoires du profil. La reprise entre
sessions relit directement `settings.json.exemples` et le marqueur du corpus, sans les
convertir ni lancer de guide.

**Ouvrir un corpus local** recevant un corpus d'apprentissage reconnu le rattache au
catalogue sans basculer vers lui, sans lancer d'étape et sans inscription aux Récents.
Les dossiers déplacés sont retrouvés par leur identité ; un autre corpus ne remplace
pas silencieusement l'accès d'origine.

### Création et installation

Préparer et suivre compte quatre étapes métier ; la création du corpus n’est pas une
étape pédagogique. Au premier lancement, `InstallationExemple.vue` propose un emplacement
modifiable, puis prépare le corpus vierge avant de lancer l’étape choisie. Le dialogue
ordinaire `NouveauCorpus.vue` reste réservé aux corpus de l’utilisateur.

Chaque parcours possède son propre corpus d’apprentissage. **Préparer et suivre** crée un
corpus vierge, sans variable ajoutée. Traitement installe un autre corpus vide et les
fichiers d'exercice avant l'étape choisie. La variable de saisie libre « Ville » est
préparée uniquement pour **Importer et traiter**. **Analyser et interpréter** utilise
sa propre copie de `CorpusSynthAnnot`, avec les quatre entretiens annotés et leurs
variables. **Organiser et exporter** utilise une autre copie de `CorpusSynthAnnot`.
`EXEMPLES_PAR_PARCOURS` fixe le contenu attendu pour chacun des quatre parcours.
Les noms de dossiers proposés utilisent des caractères sans accents et des underscores,
par exemple `Sonal/Apprentissage/Analyser_et_interpreter`. Les copies libres suivent la
même convention (`Entretiens_transcrits`, `Corpus_annote`), avec un suffixe `_2` si un
emplacement est déjà enregistré. Les libellés affichés et les emplacements existants
restent inchangés.

`ExemplesLocaux.preparerInstallation()` construit le nouveau corpus dans un dossier
temporaire hors du travail courant. Pour l'exploration transcrite, le renderer convertit
les quatre SRT par le sas habituel, puis le main utilise `CorpusStore.importerEntretien()`.
Le corpus annoté part des données V2 fournies et ses références audio sont réassignées
aux fichiers installés sur le poste, sans modifier le modèle fourni.

Le main prépare la cible avant fermeture du contexte courant ; il ne publie qu'après
la fermeture réussie. Il revérifie alors la destination, installe les sources manquantes,
puis publie le corpus complet avec son marqueur avant de l'enregistrer et de l'ouvrir.
Les sources, les exemples fournis et les autres corpus ne peuvent pas être utilisés
comme destination, y compris par un chemin imbriqué ou un lien symbolique.

### Parcours d’analyse

`parcours/analyse.ts` définit quatre étapes sur les trois outils : synthèse du thème
« Sens de l’utilité », concordances d’« enfants », matrice de deux thèmes sur quatre
entretiens avec affichage de la couverture, puis retour d’une cellule aux passages de
la coordinatrice dans la synthèse. Seule cette dernière étape exige la matrice comme
prérequis ; les trois outils restent accessibles indépendamment.

Les validations observent les critères, les résultats à jour et les sélections métier,
jamais le seul clic sur un bouton. Les résultats incomplets ou périmés ne valident pas
une étape. Les acquis ne sont redérivés que pour le parcours du corpus ouvert : les
annotations fournies ne prévalident pas le parcours de traitement. Les étapes et leurs
bilans restent dans l’espace d’analyse grâce à `vueFin` et à son ancre dédiée.

### Parcours d’organisation et d’export

`parcours/organisation.ts` définit quatre étapes : créer un cas par règle sur
`1Coordinatrice`, structurer le recueil « Regards sur le bénévolat » avec un titre et
un texte libre, y associer un passage de la coordinatrice, puis exporter les quatre
entretiens en TXT avec pseudonymisation. Seul l’ajout du passage exige la structure
du recueil comme prérequis. Le cas et le recueil doivent être enregistrés ; une
prévisualisation ou un brouillon ne suffit pas.

Le panneau d’export transmet au guide la demande et son résultat métier. Une annulation,
un échec ou un lot partiel ne valide pas l’étape. Ce résultat temporaire est effacé lors
d’un changement de corpus ; seuls les acquis validés sont persistés. Les consignes et
bilans disposent d’une ancre dans l’espace d’organisation et accompagnent aussi le
passage par l’entretien. L’export du corpus est distingué de l’export propre au recueil.

### Reprise, sources et remise à zéro

Reprendre ouvre le corpus existant. Aucun entretien supprimé ou renommé n'est réimporté,
aucun codage n'est réappliqué et aucune progression n'est remise à zéro. Les conditions
réelles des exercices sont vérifiées à l'ouverture ; une étape explicitement choisie
reste distincte de **Continuer**, qui cherche la prochaine étape accessible.

Les sources communes sont les quatre SRT, les quatre MP3 et le guide d'entretien de
`CorpusTest/CorpusSynth/`. Seul le contenu de ce sous-dossier est installé directement
sous `srt/`, `audio/`, `docs/`. Les audios restent référencés, jamais dupliqués dans
chaque corpus. Leur emplacement est relu depuis le registre des exemples.

Une reprise n'a pas besoin de restaurer les sources pour lire les textes et annotations.
La restauration est une action explicite : elle ajoute seulement les fichiers manquants,
sans remplacer un guide ou un autre fichier déjà présent. Les étapes qui demandent une
sélection ouvrent directement le sous-dossier utile.

Dans un corpus d’apprentissage, le résumé du parcours est placé dans la coquille de
l’application, sous la barre des espaces. Son titre commence par **Démo :**. Il reste donc
visible dans Préparer, Traiter, Analyser et Organiser, y compris lorsque le guide est en
pause. Le catalogue s’ouvre depuis ce résumé ; la barre des espaces ne porte pas de bouton
de parcours supplémentaire. **Sortir de la démo** met le guide en pause après le retour
réussi à l’accueil.

Le catalogue ne présente ni chemin ni sélection de copies. **Recommencer cette démo**
prépare un corpus neuf, ferme le contexte courant, puis remplace le dossier de cette démo
avec sauvegarde temporaire et restauration en cas d’échec. L’identifiant reste stable,
mais le contenu et la progression repartent du début. Les démos d’analyse et d’organisation restaurent le
corpus annoté fourni, tandis que Préparation et Traitement repartent sur un corpus vide. La confirmation précise que les
autres corpus ne sont pas modifiés. Après réussite, le dialogue existant affiche un bilan
avec l’emplacement conservé et attend **Commencer la première étape** pour lancer le guide.
Revenir au catalogue ou fermer le bilan ne lance aucune étape. Ce bilan ne fait pas partie
des étapes pédagogiques. **Retrouver mon dossier…** apparaît seulement quand
le dossier connu manque. Mettre le guide en pause ne change ni le corpus ni ses acquis.
Les contrôles propres aux exercices n'empêchent pas les imports ordinaires pendant cette
pause.

## 5. Le corpus courant supprimé sur disque

Quatre couches coopèrent :

| Couche | Rôle |
| --- | --- |
| `CorpusStore` | Lève `CORPUS_SUPPRIME` après consommation de l'amorçage ; ne recrée rien. |
| Main, `corpus:apresSuppression` | Choisit le premier récent local vivant et admissible, sans corpus d'apprentissage. |
| Preload, `invoquer()` | Demande la bascule, notifie les abonnés, puis propage l'erreur de l'opération initiale. |
| Renderer, `useCycleCorpus` | Applique la nouvelle situation ou revient à l'Accueil sans corpus, avec une information explicative. |

Une opération visant le corpus supprimé n'est jamais rejouée sur le corpus de secours.
Plusieurs notifications simultanées sont absorbées par la garde de bascule.

## 6. Invariants et tests

- Ne jamais confondre **installer** et **ouvrir**. Il n'y a plus de détection d'import
  manquant par titre lors d'une reprise.
- Refuser tout travail dans une destination d'installation, même sans entretien.
- Préparer sans écrire dans la cible, fermer le contexte précédent, puis publier.
- Ne pas abandonner l'état distant côté renderer avant la réussite d'une ouverture.
- Préserver les dossiers, les anciens acquis et les accès aux travaux indisponibles.
- Réserver les écritures de fichiers au main ; aucune opération de disque dans le catalogue.
- Conserver un seul corpus actif et un seul catalogue, sans relance implicite du guide.

Tests principaux : `test/exemples.test.ts`, `test/transitionContexte.test.ts`,
`test/corpusStore.test.ts`, `test/marqueurDemo.test.ts`, `e2e/demo.e2e.ts`,
`test/parcoursAnalyse.test.ts`, `e2e/pas-a-pas.e2e.ts`, `e2e/preparation-pas-a-pas.e2e.ts`,
`e2e/analyse-pas-a-pas.e2e.ts`, `test/parcoursOrganisation.test.ts`,
`e2e/organisation-pas-a-pas.e2e.ts` et `e2e/sources-demo.e2e.ts`.

## 7. Le problème historique de « résurrection »

L'ancien enchaînement pouvait considérer un dossier simplement existant comme prêt,
puis reconstruire son contenu. La présence vérifiée du marqueur et la sentinelle de
suppression avaient limité ce problème. La séparation actuelle retire également la
réinstallation du chemin de reprise : le modèle fourni ne sert qu'à créer un nouveau
travail, jamais à réparer automatiquement un corpus modifié.

## 8. La branche distante : créer et rouvrir un corpus sur serveur

La création distante continue à suivre les commandes de son fournisseur. Pour Nextcloud,
l'ordre des opérations reste important :

1. `PublieurCorpus.preparerRacine()` repère le plus long préfixe existant par PROPFIND,
   puis crée les segments manquants parent d'abord. Les préfixes techniques Nextcloud
   ne sont pas adressables comme des dossiers ordinaires.
2. `profilerServeur()` sonde les préconditions sur une cible existante ; un refus ne
   nettoie que la feuille créée par cette opération, jamais un dossier préexistant.
3. `publierSquelette(nom)` publie `corpus.json` sous `If-None-Match: *`. Une création
   concurrente est refusée, sans écrasement.
4. Le compte est enregistré en dernier pour ne pas laisser d'accès fantôme après un échec.
5. Le renderer ouvre le corpus créé par le fournisseur. Le squelette est commun à la
   création locale et distante.

Un récent distant est rouvert par son fournisseur et son identifiant, jamais par son
miroir local. Les récents distants ne sont pas ouverts automatiquement au démarrage.
La création ne partage pas le corpus avec les collègues et ne crée pas un verrou de
travail à sa naissance. Voir [multi-utilisateur.md](multi-utilisateur.md),
[gitlab.md](gitlab.md) et la [documentation utilisateur](../user/corpus-distant.md).
