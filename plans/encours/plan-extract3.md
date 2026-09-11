# Plan d’extraction du domaine Corpus

## Objectif

Clarifier le domaine Corpus en deux temps indépendants :

1. ramener `src/renderer/composables/useCorpus.ts` à une façade qui assemble les
   sous-domaines propres au corpus ;
2. extraire ensuite de `src/renderer/composables/sonal.ts` les coordinations liées
   au cycle de vie du corpus, aux médias et au mode distant.

Ces deux temps ne doivent pas être menés ensemble. Le premier concerne l’état et
les gestes du scope Corpus. Le second concerne l’orchestration applicative entre
Profil, Corpus, Entretien, Audio et Démo.

L’extraction ne doit modifier ni le comportement, ni les appels IPC, ni la
persistance, ni l’API plate exposée par `utiliserSonal()`.

## Organisation visée

Conserver les points d’entrée publics actuels :

```text
src/renderer/composables/useCorpus.ts
src/renderer/composables/sonal.ts
```

Créer progressivement :

```text
src/renderer/composables/corpus/
├── useThemesCorpus.ts
├── useVariablesCorpus.ts
├── useAnonymisationCorpus.ts
├── useCategoriesNotesCorpus.ts
├── useJournalCorpus.ts
├── useNotesCorpus.ts
├── useSelectionCorpus.ts
├── useMediasCorpus.ts
├── useDistantCorpus.ts
└── useCycleCorpus.ts
```

La liste du second temps est une cible de responsabilité, pas une obligation de
créer tous les fichiers. Si un module exige presque tout le contexte de
`creerSonal()`, il faut réduire sa frontière ou le laisser dans la façade.

## Principes communs

1. `useCorpus.ts` reste la façade publique du scope Corpus.
2. `sonal.ts` reste le point de composition de l’application et le fournisseur
   du contexte Vue.
3. Une `ref` publique doit rester la même `ref`. Une fonction publique conserve
   sa signature et sa sémantique.
4. Les objets retournés par `useCorpus()` et `creerSonal()` doivent conserver
   leurs propriétés actuelles.
5. Ne pas introduire de `provide`/`inject` entre les nouveaux modules.
6. Les dépendances sont passées explicitement et limitées aux capacités utiles.
7. Ne pas importer `sonal.ts` depuis les modules de modèle du premier temps.
8. Conserver l’ordre des appels IPC et des rafraîchissements après mutation.
9. Ne pas déplacer vers le renderer les algorithmes purs de `src/shared/corpus/`.
10. Ne pas mélanger extraction, changement fonctionnel et nettoyage métier.
11. Chaque lot doit être validable et annulable seul.
12. Les minuteurs, abonnements IPC et watchers ne doivent être installés qu’une
    fois et doivent être nettoyés lorsque leur API le permet.

## Contrats internes recommandés

### Sauvegarde préalable

Les mutations qui comptent les usages doivent continuer à vider la sauvegarde de
l’entretien ouvert avant leur appel IPC :

```ts
type ViderEntretien = () => Promise<void>
```

Cette capacité est injectée uniquement aux modules qui en ont besoin, notamment
les thèmes, variables, catégories de notes et passerelles agrégées.

### Mise à jour des définitions

Chaque module propriétaire d’un référentiel expose sa fonction de chargement :

```ts
maj(...): void
reinitialiser(): void
```

`useCorpus.ts` et `sonal.ts` gardent l’ordre d’application d’un corpus chargé.
Les modules ne doivent pas se charger mutuellement.

### Effets transversaux

Le journal du corpus reçoit des effets ciblés au lieu de connaître les modules :

```ts
interface EffetsAnnulationCorpus {
  rafraichirMatrice: () => Promise<boolean>
  perimerScanAnon: () => void
}
```

Le contrat exact doit reprendre les impacts actuellement renvoyés par le main,
sans inventer un rafraîchissement global.

### Accès aux autres scopes pendant le second temps

Les modules d’orchestration reçoivent des interfaces réduites de Profil,
Entretien et Audio. Ils ne reçoivent pas le résultat complet de
`utiliserSonal()` et n’importent pas `sonal.ts`.

Une dépendance circulaire se résout par une fonction stable, comme les holders
actuels `sauverEntretien` et `raccrocherModeCorpus`, et non par un contexte géant.

# Temps 1 — Extraire le scope `useCorpus.ts`

## Résultat du premier temps

`useCorpus.ts` doit rester propriétaire de :

- `membership`, qui est l’index léger des entretiens du corpus ;
- l’instanciation des modules du scope Corpus ;
- les passerelles générales vers les inventaires Notes et Personnes si leur
  extraction n’apporte pas de frontière plus claire ;
- la composition explicite de son API plate actuelle.

Une taille résiduelle de 120 à 220 lignes est raisonnable. Le nombre de lignes
n’est pas un objectif en soi.

## Étape 0 — Verrouiller le contrat actuel

Avant le premier déplacement :

- relever toutes les propriétés renvoyées par `useCorpus()` ;
- relever les usages de `corpus.*` dans `sonal.ts` ;
- relever les propriétés provenant de `useCorpus()` qui sont exposées par
  `utiliserSonal()` ;
- vérifier les imports directs de `useCorpus.ts` et `useNotesCorpus.ts` ;
- exécuter typecheck, tests unitaires, build et tests E2E corpus ciblés.

Commandes de référence :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/themes.e2e.ts \
  e2e/donnees.e2e.ts \
  e2e/table-donnees.e2e.ts \
  e2e/notes-corpus.e2e.ts \
  e2e/journal-corpus.e2e.ts \
  e2e/anonymisation.e2e.ts
```

## Étape 1 — Extraire les catégories de notes

Créer `corpus/useCategoriesNotesCorpus.ts` avec :

- `categoriesNote` et `messageCategorieNote` ;
- normalisation et chargement des catégories ;
- résolution du nom, de la couleur et de la catégorie par défaut ;
- ajout, renommage, changement de couleur et suppression ;
- vidage préalable de l’entretien avant le compte d’usages nécessaire à une
  suppression.

Le module reçoit uniquement `flush`. Il ne connaît ni les notes agrégées, ni
l’entretien ouvert, ni le journal du corpus.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/notes-feuille.e2e.ts \
  e2e/notes-corpus.e2e.ts
```

## Étape 2 — Extraire les thèmes

Créer `corpus/useThemesCorpus.ts` avec :

- `codebook`, `codeCourant`, `usages`, `resumes` et `messageTheme` ;
- chargement et tri du codebook ;
- arbre des thèmes ;
- résolution des noms, couleurs, tailles et états actifs ;
- peinture des segments thématiques ;
- ajout, modification, déplacement, migration et suppression des thèmes ;
- rafraîchissement des usages et résumés.

Le module reçoit `flush`. Le retrait des codages de l’entretien ouvert lors
d’une suppression lancée depuis l’éditeur reste dans l’orchestration de
`sonal.ts`, car il croise deux scopes.

Points de vigilance :

- conserver le choix automatique du premier thème ;
- conserver le calcul de couleur depuis `codeExport` ;
- conserver les règles de peinture et de pondération ;
- vider l’entretien avant tout compte d’usages ;
- maintenir ensemble usages et résumés thématiques.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/themes.e2e.ts \
  e2e/theme-entretien.e2e.ts \
  e2e/marquage.e2e.ts
```

## Étape 3 — Extraire les variables et la matrice

Créer `corpus/useVariablesCorpus.ts` avec :

- `variables`, `messageVar`, `varsGen`, `varsLoc` et `modalitesDe` ;
- chargement et tri des variables ;
- ajout, renommage et suppression des variables et modalités ;
- statut privé ;
- modèles de modalités intégrés ou importés par l’utilisateur ;
- `matrice`, ses états de chargement et sa protection contre les résultats
  périmés ;
- écriture d’une cellule, écriture en lot et saisie libre par libellé ;
- remise à zéro de la matrice lors d’un changement de corpus.

Ce module restera probablement le plus volumineux du premier temps. Ne pas le
scinder entre définitions et matrice si cela oblige les deux parties à partager
presque toutes leurs refs. Un second découpage pourra être envisagé après
validation à comportement constant.

Points de vigilance :

- conserver la génération qui invalide une requête de l’ancien corpus ;
- conserver le dernier résultat pendant un rafraîchissement ;
- conserver la bannière globale et son effacement ;
- laisser remonter les erreurs IPC de saisie en lot ;
- ne pas modifier la gestion des verrous par ligne, qui reste dans `sonal.ts` au
  premier temps.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/donnees.e2e.ts \
  e2e/table-donnees.e2e.ts \
  e2e/meta-entretien.e2e.ts
```

## Étape 4 — Extraire l’anonymisation du corpus

Créer `corpus/useAnonymisationCorpus.ts` avec :

- `reglesAnon` et `paramsAnon` ;
- état, fraîcheur, erreur et date du scan ;
- rafraîchissement des règles ;
- péremption et remise à zéro du scan ;
- protection contre deux scans concurrents ;
- écriture des paramètres d’anonymisation.

Les promotions, divergences et occurrences de l’entretien restent dans
`entretien/useAnonymisationEntretien.ts`. Le module Corpus ne porte que les
règles partagées, les paramètres et leur projection agrégée.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/anonymisation.e2e.ts \
  e2e/motsLiaison.e2e.ts \
  e2e/parcours.e2e.ts
```

## Étape 5 — Extraire le journal du corpus

Créer `corpus/useJournalCorpus.ts` avec :

- `entreesJournalCorpus` ;
- les révisions Personnes et Notes ;
- lecture du journal ;
- annulation d’une entrée ;
- déclenchement ciblé des projections indiquées par l’impact renvoyé.

Le module reçoit `flush`, le rafraîchissement de matrice et la péremption du scan
anon. Il ne reçoit pas les objets complets des autres modules.

Les passerelles `lireNotes`, `commanderNotes`, `lirePersonnes` et
`commanderPersonnes` peuvent rester dans `useCorpus.ts`. Si elles forment un
ensemble suffisamment autonome, créer un module dédié dans un lot séparé, sans
le mélanger à l’extraction du journal.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/journal-corpus.e2e.ts \
  e2e/notes-corpus.e2e.ts \
  e2e/personnes.e2e.ts
```

## Étape 6 — Déplacer le composable de vue des notes

Déplacer :

```text
composables/useNotesCorpus.ts
→ composables/corpus/useNotesCorpus.ts
```

Mettre à jour uniquement l’import de `components/corpus/NotesCorpus.vue` et les
chemins relatifs internes. Ce composable reste un adaptateur de vue qui consomme
`utiliserSonal()` ; il ne doit pas être confondu avec les définitions de
catégories possédées par `useCategoriesNotesCorpus.ts`.

Ne pas profiter du déplacement pour changer filtres, tri, export Markdown,
watchers ou chargement.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/notes-corpus.e2e.ts
```

## Étape 7 — Nettoyer la façade `useCorpus.ts`

Après validation de tous les modules :

1. supprimer les imports devenus inutiles ;
2. regrouper modèle commun, création des modules et passerelles agrégées ;
3. conserver un `return` explicite et plat ;
4. conserver les noms et l’ordre logique de l’API actuelle ;
5. vérifier qu’aucun module interne n’importe `useCorpus.ts` ou `sonal.ts` ;
6. vérifier que chaque projection est remise à zéro au changement de corpus.

## Matrice de propriété du premier temps

| État ou action | Propriétaire cible |
|---|---|
| `membership` | façade `useCorpus.ts` |
| thèmes, usages et résumés | `useThemesCorpus.ts` |
| variables, modalités, modèles et matrice | `useVariablesCorpus.ts` |
| règles, paramètres et scan anon | `useAnonymisationCorpus.ts` |
| catégories de notes | `useCategoriesNotesCorpus.ts` |
| journal et révisions agrégées | `useJournalCorpus.ts` |
| filtres et affichage des notes agrégées | `useNotesCorpus.ts` |
| inventaires Notes et Personnes | façade ou passerelle dédiée |

## Critères de fin du premier temps

- `useCorpus.ts` se lit comme une composition du scope Corpus ;
- son API publique n’a pas changé ;
- les modules ne dépendent ni de l’entretien complet ni de `sonal.ts` ;
- l’ordre des IPC et des rafraîchissements est conservé ;
- les requêtes périmées de matrice et de scan ne peuvent pas remplacer l’état
  du corpus courant ;
- les tests unitaires, le build et les E2E locaux ciblés passent.

# Temps 2 — Extraire l’orchestration Corpus de `sonal.ts`

## Précondition

Ne commencer ce temps qu’après validation et stabilisation complète du premier.
Les modules de `useCorpus.ts` doivent fournir des contrats stables avant
d’extraire les coutures qui les utilisent.

`sonal.ts` reste le compositeur racine. Il continue d’instancier Profil, Corpus,
Entretien, Audio et Démo, d’installer le contexte Vue et d’exposer l’API plate de
`utiliserSonal()`.

## Étape 8 — Caractériser l’orchestration actuelle

Avant tout déplacement :

- relever toutes les propriétés du `return` de `creerSonal()` après résolution
  des spreads `profil`, `corpus`, `ent` et `demo` ;
- inventorier les watchers, intervalles et abonnements IPC installés par
  `creerSonal()` ;
- identifier les dépendances croisées entre ouverture de corpus, session
  distante, entretien ouvert, audio et démo ;
- relever l’ordre exact de `appliquerCorpus()` ;
- relever l’ordre exact d’ouverture et de fermeture d’un entretien ;
- exécuter toute la suite locale avant le premier déplacement.

Validation de référence :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local
```

Les tests de pile distante se lancent uniquement si le banc Nextcloud existant
est disponible. Ne télécharger ni reprovisionner aucune image Docker.

## Étape 9 — Extraire la sélection dans la vue Corpus

Créer `corpus/useSelectionCorpus.ts` avec :

- `corpusSelId` et `corpusSelMeta` ;
- calcul des détails depuis un entretien lu ;
- sélection, désélection et rafraîchissement ;
- nettoyage au changement de corpus.

Le module reçoit les variables courantes et une capacité de lecture ciblée d’un
entretien. Il ne connaît ni la navigation globale, ni l’audio, ni le distant.

Les actions « ouvrir », « aller aux notes », « aller aux locuteurs » et « saisir
les données » restent coordonnées par `sonal.ts` à cette étape.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/meta-entretien.e2e.ts \
  e2e/navigation.e2e.ts \
  e2e/table-donnees.e2e.ts
```

## Étape 10 — Extraire les médias du corpus

Créer `corpus/useMediasCorpus.ts` avec :

- inventaire des audios et formes d’onde ;
- vérification des références manquantes ;
- régénération des formes d’onde ;
- résolution des URL de waveform ;
- chargement du média d’un entretien ouvert ;
- assignation, effacement et réassociation locale ;
- remplacement d’une transcription depuis un SRT ;
- état et messages de confirmation SRT ;
- désignation et état d’un audio distant.

Ce module reçoit des capacités réduites de l’entretien, du lecteur audio, de la
sélection Corpus et du distant. Il ne reçoit pas l’objet complet renvoyé par
`creerSonal()`.

Si les médias locaux et la désignation distante forment deux contrats plus
simples, les extraire en deux lots successifs. Ne pas effectuer ce découpage en
même temps que le déplacement initial.

Points de vigilance :

- un audio reste référencé, jamais copié dans le corpus local ;
- une forme d’onde reste un dérivé régénérable ;
- le modèle de l’entretien ouvert suit immédiatement une mutation audio ;
- une transcription existante n’est jamais écrasée sans confirmation ;
- notes, valeurs, brouillons anon et legacy survivent au remplacement SRT ;
- les échecs de rapatriement distant conservent leur diagnostic.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/audio.e2e.ts \
  e2e/audio-panneau-meta.e2e.ts \
  e2e/persistance.e2e.ts
```

Compléter avec `e2e/audio-distant.e2e.ts` si la pile est déjà disponible.

## Étape 11 — Extraire l’état distant

Créer `corpus/useDistantCorpus.ts` avec :

- identifiant distant courant, connectivité et dernier tirage ;
- progression des transferts ;
- badges de verrou et présences ;
- verrous orphelins et leurs actions ;
- statut de session et erreur de publication ;
- lecture seule des définitions et gardes par ligne ;
- tirage manuel ou silencieux ;
- publication immédiate ;
- minuteurs et abonnements IPC associés.

Le module reçoit des callbacks explicites pour :

- rafraîchir le corpus sans fermer l’entretien ;
- détecter les divergences anon après tirage ;
- préparer ou annuler la sauvegarde de l’entretien ;
- rendre l’éditeur non modifiable ;
- nettoyer sélection et reprise quand le miroir change.

`ouvrirCorpusDistant()` peut rester dans le cycle général jusqu’à l’étape
suivante. L’objectif de ce lot est d’extraire l’état et les protocoles distants,
pas encore toutes les transitions de navigation.

Points de vigilance :

- les badges viennent du serveur et restent décisionnels pour les gardes ;
- les présences restent seulement informatives ;
- un échec de tirage silencieux ne remplace pas les données affichées ;
- une session dégradée annule la sauvegarde au lieu de tenter une écriture ;
- aucun intervalle ni abonnement IPC n’est dupliqué ;
- la fermeture de l’application attend toujours la préparation requise.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
```

Puis, si la pile existante est disponible :

```bash
npx playwright test --project=pile \
  e2e/audio-distant.e2e.ts \
  e2e/multi-utilisateur.e2e.ts
```

## Étape 12 — Extraire le cycle du corpus et des entretiens

Créer `corpus/useCycleCorpus.ts` pour les transitions qui forment un même
sillage applicatif :

- appliquer un corpus chargé ;
- préparer une bascule ;
- ouvrir un dossier local, un récent ou un corpus distant ;
- créer un corpus local ou distant ;
- rafraîchir le miroir sans fermer l’entretien ;
- ouvrir, fermer et reprendre un entretien ;
- navigation Accueil, Corpus et Entretien ;
- réagir à la suppression externe du corpus courant.

La façade `sonal.ts` doit rester propriétaire de l’instanciation initiale et des
holders nécessaires pour casser les cycles. Le module reçoit des façades
réduites de Profil, Corpus, Entretien, Audio et Distant.

L’ordre de `appliquerCorpus()` reste visible et inchangé :

1. réinitialiser l’entretien et son lecteur ;
2. mettre à jour le dossier et nettoyer les états du corpus précédent ;
3. charger membership et référentiels ;
4. charger paramètres et projections ;
5. vérifier les médias ;
6. lancer les dérivés de fond ;
7. raccrocher le mode Démo.

L’ordre de fermeture d’un entretien distant reste également inchangé : préparer
la sauvegarde, publier et libérer, mémoriser la reprise, vider l’entretien, puis
vider le lecteur.

Ne pas déplacer dans ce module l’import, la migration et la fusion au même
moment. Ils seront traités dans le lot suivant.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/navigation.e2e.ts \
  e2e/multi-corpus.e2e.ts \
  e2e/persistance.e2e.ts \
  e2e/suppression.e2e.ts
```

## Étape 13 — Extraire les opérations sur les entretiens du corpus

Après stabilisation du cycle, déplacer dans un module dédié ou dans
`useCycleCorpus.ts` si la frontière reste simple :

- ajout d’un entretien depuis texte et/ou audio ;
- migration depuis SonalPi1 ;
- import d’un entretien migré ;
- export `.sonal` ;
- renommage et suppression ;
- dialogue de suppression ;
- fusion d’une copie divergente ;
- raccourcis d’ouverture vers segment, données, locuteurs et notes.

La fusion reste une coordination avec `useEntretien()` : le module ne prend pas
possession du modèle ouvert. L’import et la migration continuent d’utiliser les
pipelines existants sans modifier leur normalisation.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/import-export.e2e.ts \
  e2e/migration-v1.e2e.ts \
  e2e/migration.e2e.ts \
  e2e/parcours.e2e.ts \
  e2e/suppression.e2e.ts
```

## Étape 14 — Nettoyer `sonal.ts`

Une fois tous les lots validés :

1. conserver en tête l’instanciation de Profil, Corpus, Audio et Entretien ;
2. conserver explicitement les holders qui cassent les cycles ;
3. regrouper la création des modules d’orchestration ;
4. garder dans `sonal.ts` les watchers réellement transversaux ;
5. rendre visible la composition finale de l’API de `utiliserSonal()` ;
6. éviter les spreads de nouveaux modules internes ;
7. vérifier les collisions entre les API Profil, Corpus, Entretien, Démo et
   orchestration ;
8. conserver `fournirSonal()` et `utiliserSonal()` inchangés.

Une taille résiduelle de 350 à 550 lignes est acceptable si elle décrit
réellement la composition et les coutures entre scopes.

## Matrice de propriété du second temps

| État ou action | Propriétaire cible |
|---|---|
| création des scopes et contexte Vue | `sonal.ts` |
| navigation globale | `sonal.ts` ou `useCycleCorpus.ts` |
| sélection et métadonnées d’une carte | `useSelectionCorpus.ts` |
| audios, waveforms, SRT et désignation | `useMediasCorpus.ts` |
| verrous, présences, tirage et publication | `useDistantCorpus.ts` |
| changement de corpus et ouverture/fermeture | `useCycleCorpus.ts` |
| import, migration, export et suppression | module d’opérations ou cycle |
| état propre de l’entretien ouvert | `useEntretien.ts` |
| état propre du corpus | `useCorpus.ts` et ses modules |

## Critères de fin du second temps

- `sonal.ts` se lit comme le compositeur des scopes de l’application ;
- les détails de sélection, médias et synchronisation distante n’y sont plus
  implémentés directement ;
- `utiliserSonal()` expose exactement le même contrat ;
- aucune coordination extraite n’importe `sonal.ts` ;
- les cycles sont résolus par des capacités explicites, pas par un contexte
  global transmis aux modules ;
- les changements de corpus nettoient toutes les projections de l’ancien ;
- les intervalles et abonnements IPC ne sont installés qu’une fois ;
- les sauvegardes, publications et libérations de verrou gardent leur ordre ;
- les tests unitaires, le build et les E2E locaux passent ;
- les scénarios distants passent lorsque la pile existante est disponible.

## Validation commune à chaque lot

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

En fin de chaque temps :

```bash
npx playwright test --project=local
```

Pour les scénarios Nextcloud, démarrer uniquement les bancs déjà présents avec
`npm run nc:up` ou `npm run nc-b:up`. Ne jamais télécharger ni reprovisionner les
images Docker.
