# Ouverture des corpus et récents — repères développeur

Une ouverture remplace le corpus courant, pas seulement l’écran affiché.
Elle engage les sauvegardes de l’entretien, la fermeture des sessions distantes,
le store du main et les données réactives du renderer. Une nouvelle entrée dans
l’interface doit réutiliser ce cycle, pas affecter directement le dossier courant.

## Les chemins d’entrée

| Action | Point d’entrée renderer | Suite côté main |
|---|---|---|
| Démarrage | `useCycleCorpus.chargerCorpus()` | Lecture des Récents, puis ouverture du premier récent local admissible. |
| Ouvrir un dossier | `useCycleCorpus.choisirDossier()`, puis `useProfil` | Choix natif et `changerDossier()`, sauf corpus d’apprentissage reconnu. |
| Créer un corpus local | `NouveauCorpus.vue`, puis `creerNouveauCorpus()` | `corpus:creerNouveau` et transition locale. |
| Cliquer sur un récent | `useCycleCorpus.ouvrirRecent()` | Ouverture locale ou commande du fournisseur distant. |
| Créer ou reprendre un exemple | `useExemples` | Installation explicite ou ouverture ordinaire ; voir [corpus exemples](exemples.md). |
| Ouvrir ou créer sur un serveur | `CorpusDistant.vue`, `NouveauCorpusDistant.vue` | Commandes WebDAV ou GitLab, jamais ouverture locale du miroir. |

Le démarrage charge éventuellement un corpus mais laisse l’Accueil affiché.
Sans récent local admissible, il ne crée aucun corpus d’exercice. Un retour à
l’accueil par `allerAccueil()` ferme l’entretien ; il ne désactive pas à lui seul
le corpus courant.

Après une ouverture explicite, `restaurerNavigationProjet()` lit la mémoire locale
du profil. En l’absence d’emplacement enregistré, il ouvre l’Accueil de
**Préparer et suivre** et affiche l’aiguillage de première ouverture. Le choix
« entretien » mène à la vue Corpus ou, pour un corpus vide, à l’ajout d’entretien.
Ce choix est indisponible si le corpus est vide et que les droits ne permettent
pas d’ajout. Les ouvertures suivantes restaurent le dernier espace et son onglet.
Voir [navigation et espaces](../navigation-espaces.md#aiguillage-à-la-première-ouverture).

## Circuit d’une bascule locale

```text
useCycleCorpus : préparer les sauvegardes de sortie
  → useProfil ou corpus.creerNouveau
  → handler IPC du main
  → préparer la cible, fermer le contexte précédent, finaliser l’ouverture
  → useCycleCorpus.appliquerCorpus : remplacer les données affichées
```

`src/main/transitionContexte.ts` porte les transitions locales. L’ordre importe :

1. `CorpusStore.preparerOuverture()` lit et vérifie la cible sans l’écrire.
2. Le main ferme le contexte précédent. Une publication ou une libération de
   session refusée empêche la bascule normale.
3. `CorpusStore.finaliserOuverture()` revérifie que la cible n’a pas changé,
   applique les préparations nécessaires, puis le main installe le nouveau store.
4. Le renderer quitte l’ancien état distant après réussite de l’ouverture locale,
   puis `appliquerCorpus()` renouvelle les données, sélections, analyses et médias.
   Le guidage de l’ancien corpus est arrêté avant les relectures asynchrones.

Le renderer prépare ses sauvegardes selon les droits de la session : une session
dégradée n’autorise pas une dernière écriture ordinaire. La fermeture effective
et ses contrôles restent côté main. Les captures et générations de contexte
écartent les réponses devenues obsolètes après une bascule.

## Ce qui constitue un corpus neuf

Un dossier correspond à un corpus. L’ouverture ordinaire peut amorcer un dossier
sans `corpus.json`, contrairement à la réouverture automatique depuis les Récents.

Le contenu initial vient de `src/shared/corpus/squelette.ts` : version courante,
quatre catégories du bloc Pondérations, aucun entretien, et valeurs initiales des
autres fonctions, notamment tableau de bord et traitements Lexico. Ce même
squelette sert à la création distante. Ne pas dupliquer ces défauts dans un dialogue.

Chaque instance de `CorpusStore` ne peut amorcer qu’une fois. Après ouverture,
la disparition de `corpus.json` produit `CORPUS_SUPPRIME`, avant toute création de
dossier : une commande ne doit pas recréer silencieusement le corpus supprimé.

Deux autres parcours ont des règles différentes :

- l’installation d’un exemple exige un dossier vide ou absent, même sans entretien ;
- la migration SonalPi1 reprend les définitions du `.crp`, pas celles d’un corpus neuf.

## Récents : mémoire du poste et règles de sélection

Les Récents sont enregistrés dans le `settings.json` du profil, pas dans le corpus.
Le main fournit une liste fraîche à l’accueil et au menu applicatif.

| Entrée | Identité et admissibilité |
|---|---|
| Locale | Chemin du dossier ; présence de `corpus.json` et exclusion des corpus d’apprentissage reconnus. |
| Distante | Identifiant du compte WebDAV ou de la destination GitLab ; accès encore enregistré dans le coffre. |

Une entrée distante admissible ne prouve pas que le serveur répond ni que le
secret est disponible. L’accueil peut demander de repasser par l’assistant de
connexion. Le fournisseur et l’identifiant servent à rouvrir le corpus, jamais
le chemin de son miroir.

Le démarrage et le choix de secours après suppression ne sélectionnent que le
premier récent **local** admissible. Ils n’ouvrent pas automatiquement un serveur.
Les listes locales et distantes sont chacune limitées à huit entrées ; elles ne
forment pas un historique chronologique commun.

Les explorations libres figurent dans les Récents ; les corpus d’apprentissage
restent dans **Parcours pas à pas**, même après achèvement ou pause. Cette
exclusion est appliquée côté main, pas seulement dans le composant d’accueil.
Un ancien raccourci d’apprentissage reconnu est d’abord rattaché au registre des
exemples, puis retiré des Récents, sans déplacer ni supprimer ses données.

Pour l’accueil, une entrée locale peut porter la métadonnée transitoire `exemple`,
issue de `ExemplesLocaux.reconnaitre`, jamais du nom du dossier. Le renderer range
ces copies dans Corpus exemples et les autres entrées dans Reprendre votre travail.
Le menu conserve la liste commune, l’ordre et les limites restent inchangés.
Ce champ ne modifie ni `settings.json.recents` ni le format des fichiers corpus.

**Retirer un récent supprime uniquement le raccourci**, ni le dossier, ni le
miroir, ni le compte ou les fichiers serveur.

## Si le corpus courant disparaît sur disque

La récupération suit quatre couches :

1. `CorpusStore` lève la sentinelle `CORPUS_SUPPRIME`, sans réamorçage.
2. Le preload intercepte cette erreur et appelle `corpus:apresSuppression`.
3. Le main cherche le premier récent local vivant et admissible, ou renvoie `null`.
4. `useCycleCorpus` applique le corpus de secours ou un état sans corpus courant,
   affiche une explication et revient à l’Accueil.

L’erreur de la commande initiale reste propagée. **Cette commande n’est jamais
rejouée sur le corpus de secours.** La garde de bascule du renderer absorbe les
notifications simultanées.

## Entrées distantes

La création distante publie le corpus sur le serveur avant de l’ouvrir par son
fournisseur ; elle ne crée pas un corpus local à synchroniser ensuite.
Elle ne partage pas à elle seule les accès avec les collègues et ne réserve pas
une session d’entretien.

Pour Nextcloud, le circuit de création prépare les dossiers parents, sonde les
capacités sur une cible existante, puis publie le squelette avec une condition
de création exclusive. Un refus de sonde ne nettoie que la feuille créée par
cette tentative ; un dossier préexistant ne doit pas être supprimé. Le compte
est enregistré après publication, pour ne pas conserver d’accès fantôme.

Les mécanismes sont dans `src/main/distant/publication.ts`,
`src/main/webdav/sondes.ts` et les handlers de `src/main/index.ts`.
Voir [le cycle distant](../distant/README.md), [WebDAV](../distant/webdav.md),
[GitLab](../distant/gitlab.md) et le
[parcours utilisateur](../../user/corpus-distant.md) avant de modifier ces assistants.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Sauvegarde de sortie, application du corpus et choix de vue | `src/renderer/composables/corpus/useCycleCorpus.ts` |
| Restauration de navigation et aiguillage initial | `src/renderer/composables/sonal.ts`, `src/renderer/components/app/AiguillagePremiereOuverture.vue` |
| Lecture et retrait des récents côté renderer | `src/renderer/composables/useProfil.ts` |
| Profil, filtrage des récents, handlers et installation du store | `src/main/index.ts` |
| Préparation, fermeture et finalisation d’une bascule locale | `src/main/transitionContexte.ts` |
| Lecture, amorçage et détection de suppression | `src/main/corpusStore.ts` |
| Relais de la sentinelle de suppression | `src/preload/index.ts` |

Tests de référence : `test/transitionContexte.test.ts` (ordre des opérations et
refus de fermeture), `test/corpusStore.test.ts` (ouverture et suppression),
`e2e/multi-corpus.e2e.ts` (bascule, récents, retrait et purge après suppression) et
`e2e/demo.e2e.ts` (exclusion et rattachement des corpus d’apprentissage).
Pour une modification distante, ajouter les tests du fournisseur concerné :
les recettes locales ne vérifient pas les garanties du serveur.
