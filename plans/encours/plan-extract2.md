# Plan d’extraction de `useEntretien.ts`

## Objectif

Ramener `src/renderer/composables/useEntretien.ts` à un rôle de façade et de
coordinateur, sans modifier le comportement de l’éditeur, la persistance, les
appels IPC ni l’API plate exposée par `utiliserSonal()`.

Le fichier compte actuellement environ **2 500 lignes et 110 Ko**. Il réunit au
même endroit :

- le modèle réactif de l’entretien ouvert ;
- la construction de l’éditeur TipTap et de ses plugins ;
- la recherche et le remplacement ;
- le journal et ses inverses ;
- les gestes de codage et de commentaire ;
- les locuteurs et leur rapprochement avec les personnes du corpus ;
- les notes et leurs interactions DOM ;
- les valeurs générales et par locuteur ;
- toute l’anonymisation, y compris la portée corpus ;
- l’ouverture, la réinitialisation, l’autosauvegarde, l’export et la fusion.

L’extraction doit séparer ces responsabilités sans créer un nouveau « contexte
géant » simplement déplacé dans un autre fichier.

## Résultat visé

Conserver le point d’entrée actuel :

```text
src/renderer/composables/useEntretien.ts
```

Créer des composables internes dans :

```text
src/renderer/composables/entretien/
├── useRechercheEntretien.ts
├── useJournalEntretien.ts
├── useValeursEntretien.ts
├── useNotesEntretien.ts
├── useLocuteursEntretien.ts
├── useAnonymisationEntretien.ts
└── useAnnotationsEntretien.ts
```

`useEntretien.ts` doit rester propriétaire de l’assemblage :

- modèle commun `entretien`, `locuteurs`, `meta` et données legacy ;
- création de l’éditeur et ordre de ses plugins ;
- cycle d’ouverture et de fermeture d’un entretien ;
- file et debounce de sauvegarde ;
- sérialisation du payload et export ;
- projections transversales et synchronisation audio ;
- composition explicite de l’API publique actuelle.

Une taille résiduelle de 600 à 800 lignes est acceptable si ces lignes décrivent
réellement cette orchestration. Le but n’est pas d’atteindre artificiellement un
nombre de lignes.

## Contraintes non négociables

1. Ne changer ni les noms ni la nature des propriétés actuellement renvoyées par
   `useEntretien()` : une `ref` doit rester la même `ref`, et une fonction doit
   garder sa signature et sa sémantique.
2. Ne pas modifier `sonal.ts` ni les composants pour accompagner une extraction,
   sauf ajout d’un test ou correction de typage strictement nécessaire.
3. Conserver l’ordre des plugins TipTap et les callbacks actuels de
   `onUpdate`, `onSelectionUpdate`, `handleClick` et `handleKeyDown`.
4. Conserver l’ordre des effets après une mutation : modèle, journal,
   projections, décorations, gouttière, compteurs anonymisation, repérage, puis
   planification de sauvegarde selon le geste concerné.
5. Ne pas déplacer dans le renderer les algorithmes purs déjà présents dans
   `src/shared/entretien/`. Les nouveaux composables restent des adaptateurs Vue,
   TipTap, DOM et IPC autour de ces fonctions pures.
6. Ne pas introduire de `provide`/`inject` interne ni de bus d’événements. Les
   dépendances entre modules doivent rester visibles dans leurs paramètres.
7. Ne pas faire de nettoyage fonctionnel pendant un déplacement : suppression de
   code mort, changement de libellé, nouvelle gestion d’erreur ou optimisation
   feront l’objet de changements séparés.
8. Une étape d’extraction doit pouvoir être relue, testée et annulée seule.

## Contrats internes recommandés

### Accès à l’éditeur

Les modules créés avant TipTap ne doivent pas capturer une valeur `null` ni
prendre possession de l’éditeur. Ils reçoivent une fonction stable :

```ts
type LireEditeur = () => Editor | null
```

Elle est appelée uniquement au moment d’un geste. Cela permet de préparer les
handlers du menu contextuel et des commentaires avant de construire les plugins,
sans dupliquer l’éditeur ni créer de dépendance circulaire entre composables.

### Effets de mutation

Chaque module reçoit seulement les capacités dont il a besoin, par exemple :

```ts
interface EffetsMutationEntretien {
  planifierSauvegarde: () => void
  rafraichirProjections: () => void
  rafraichirDecorations: () => void
  rafraichirGouttiere: () => void
}
```

Cette interface est à réduire pour chaque module. Un module de valeurs n’a, par
exemple, aucune raison de recevoir la gouttière ou l’anonymisation. Il faut éviter
un objet `contexte` contenant toutes les refs et toutes les fonctions de la
façade.

### Chargement et remise à zéro

Un module propriétaire d’état persistant ou volatil expose les hooks nécessaires
au coordinateur :

```ts
charger(...): void
reinitialiser(): void
```

L’ouverture reste orchestrée dans `useEntretien.ts`, dans le même ordre
qu’aujourd’hui. Elle appelle les hooks des modules entre le vidage du modèle et le
rafraîchissement final. La remise à zéro doit fermer aussi les menus, dialogues,
brouillons de formulaire et repérages volatils.

### API publique

Le grand objet final de `useEntretien.ts` reste écrit explicitement. Ne pas
répandre aveuglément les objets internes avec `...module`, car une collision de
nom pourrait modifier silencieusement l’API de `creerSonal()`.

## Étape 0 — Verrouiller le comportement actuel

Avant le premier déplacement :

- relever la liste actuelle des propriétés du `return` de `useEntretien()` ;
- vérifier tous les usages directs de `ent.*` dans `sonal.ts` ;
- vérifier les déstructurations de `utiliserSonal()` dans les composants
  d’entretien ;
- exécuter le typecheck, les tests unitaires et le build ;
- ajouter une couverture de caractérisation pour la recherche d’entretien, qui
  ne possède actuellement pas de scénario ciblé.

Créer idéalement `e2e/recherche-entretien.e2e.ts` couvrant :

- ouverture avec `Ctrl+F` ou `Cmd+F` ;
- préremplissage depuis une sélection ;
- compteur et navigation cyclique ;
- remplacement courant ;
- remplacement global en une transaction annulable ;
- fermeture et disparition des décorations ;
- recherche autorisée mais remplacement interdit en lecture seule.

Commandes de référence :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/recherche-entretien.e2e.ts
```

## Étape 1 — Extraire la recherche et le remplacement

Créer `useRechercheEntretien.ts` avec :

- `rechercheOuverte`, `rechercheTexte` et `remplacementTexte` ;
- `occurrencesRecherche` et `indexRecherche` ;
- calcul et envoi des décorations au plugin de recherche ;
- navigation et calage de l’occurrence active ;
- remplacement courant et remplacement global ;
- ouverture, fermeture et raccourci clavier global ;
- installation et retrait de l’écouteur `keydown`.

Le module reçoit seulement `LireEditeur` et `ouvertId`. Il expose en plus une
méthode interne appelée par `onUpdate` lorsque `transaction.docChanged` est vrai.
Le plugin `pluginRecherche()` reste construit dans `useEntretien.ts` et conserve
sa position actuelle dans la liste des plugins.

Points de vigilance :

- `onUpdate` doit recalculer uniquement lorsque la boîte est ouverte ;
- une simple transaction de sélection ne doit pas planifier de sauvegarde ;
- le focus sur `#champ-recherche` doit toujours attendre `nextTick()` ;
- le nettoyage du raccourci ne doit être enregistré qu’une fois.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/recherche-entretien.e2e.ts
```

## Étape 2 — Extraire le journal

Créer `useJournalEntretien.ts` avec :

- l’état `journal` et la génération des identifiants d’entrée ;
- la construction du `CtxInverse` à partir du modèle et de l’éditeur ;
- `entreesJournal` et `rafraichirJournal` ;
- `annulerEntree` ;
- une petite fonction typée d’enregistrement d’une action ;
- la remise à zéro du journal à l’ouverture ou à la fermeture.

Le `journal` brut reste accessible à `pluginRemapJournal`. Les autres modules ne
doivent plus connaître `genIdJournal` : ils reçoivent uniquement la capacité
d’enregistrer un libellé et un `Inverse`.

`annulerEntree` reçoit les effets nécessaires pour reproduire exactement le
sillage actuel d’une annulation. Ne pas généraliser ce sillage à toutes les
mutations : certaines actions ne rafraîchissent volontairement qu’une partie de
l’interface.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/journal.e2e.ts
```

## Étape 3 — Extraire les valeurs d’entretien

Créer `useValeursEntretien.ts` avec :

- `setValeurGen` ;
- `setValeurLoc`.

Le module reçoit `meta`, `locuteurs`, le résolveur de libellé du corpus, la
capacité d’ajouter une entrée au journal, son rafraîchissement et la
planification de sauvegarde.

Cette petite extraction sert à valider les contrats internes avant les domaines
plus couplés. Elle ne doit pas déplacer les définitions de variables du corpus ni
changer la propriété des valeurs EAV.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local e2e/donnees.e2e.ts e2e/journal.e2e.ts
```

## Étape 4 — Extraire les notes

Créer `useNotesEntretien.ts` avec :

- `notes`, `brouillonNote` et `avertissementNote` ;
- chargement et normalisation des notes lues ;
- création, édition, validation, suppression et réordonnancement ;
- édition directe du titre et du corps ;
- conversion de toutes les notes en texte ;
- marquage DOM des passages ;
- liaison des passages aux commentaires ;
- `commentairesPourLiaison`, `menuLiensNote` et la synchronisation de la zone
  hors modale ;
- navigation depuis une référence de note vers le commentaire correspondant ;
- nettoyage de l’identifiant d’un locuteur supprimé dans les notes.

Le module reçoit `locuteurs`, `entretien`, `LireEditeur`, les deux résolveurs de
catégorie et la planification de sauvegarde. Il expose une capacité dédiée telle
que `retirerLocuteur(id)` au futur module des locuteurs, au lieu de lui donner le
droit de modifier directement toutes les notes.

Points de vigilance :

- `document` reste utilisé au moment du geste, pas à l’import du module ;
- le HTML du `contenteditable` reste la source pendant l’édition ;
- la sanitisation et la décoration des références conservent leur ordre ;
- les références pendantes vers un commentaire supprimé restent conservées ;
- le brouillon et les références DOM volatiles sont bien remis à zéro lors du
  changement d’entretien ;
- l’ouverture d’un entretien continue de normaliser les anciennes notes.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/notes-feuille.e2e.ts \
  e2e/commentaires.e2e.ts \
  e2e/marquage.e2e.ts
```

## Étape 5 — Extraire les locuteurs et les personnes

Créer `useLocuteursEntretien.ts` avec :

- `selectionVide` et l’attribution du bloc ou de la sélection ;
- renommage, ajout, rôle interviewer, pseudo et couleur ;
- suppression et dialogue de confirmation ;
- message, dialogue et sérialisation des rapprochements de personnes ;
- reprise sélective des données d’un autre locuteur ;
- rafraîchissement de la gouttière et journalisation associée.

Le tableau `locuteurs` reste chargé par le coordinateur, car il appartient au
payload commun et est utilisé par l’éditeur, le journal et les notes. Le module
possède seulement ses états d’interface volatils et expose un hook pour mettre à
jour `selectionVide` depuis `onSelectionUpdate`.

Injecter une fonction dédiée pour retirer un locuteur des notes. Ne pas importer
`useNotesEntretien` depuis ce module.

Points de vigilance :

- conserver la file `nommagesPersonnes` et toutes les gardes contre les données
  devenues périmées pendant un appel IPC ;
- conserver le `viderSauvegarde()` avant les commandes de personnes ;
- ne pas relier deux locuteurs du même entretien à la même personne ;
- conserver l’attribution TipTap, le remap et les positions journalisées ;
- remettre à zéro messages et dialogues au changement d’entretien.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/locuteurs.e2e.ts \
  e2e/personnes-nommage.e2e.ts \
  e2e/personnes-nommage-simplifie.e2e.ts \
  e2e/personnes-reprise-nommage.e2e.ts
```

## Étape 6 — Extraire l’anonymisation locale et corpus

Créer d’abord un unique `useAnonymisationEntretien.ts` en déplaçant la logique
sans la réécrire. Il possède :

- sélection, messages et brouillons d’anonymisation ;
- `pseudosDeclares` et projection `lignesAnon` ;
- compteurs « anonymisé », « exception » et « à anonymiser » ;
- repérage et navigation entre occurrences ;
- validation locale, suppression et changement de pseudo ou d’état ;
- gestion des alias, inclusions et entités déjà présentes ;
- changement de portée entre brouillon, entretien et corpus ;
- dialogues de divergence et suggestions liées aux mots de liaison ;
- catégorisation des règles ;
- détection des divergences après tirage.

Le module expose :

- un hook de chargement de `brouillonsAnon` et `pseudosDeclares` ;
- un hook de remise à zéro ;
- un hook appelé par `onSelectionUpdate` ;
- `rafraichirLignesAnon()` pour la projection globale ;
- une opération unique pour rafraîchir compteurs et repérage après une mutation ;
- une description d’occurrence destinée au menu contextuel, afin que le futur
  module d’annotations ne connaisse pas directement les règles multi-pseudo.

La fusion de copies divergentes (`fusionPossible` et `absorberFusion`) reste dans
`useEntretien.ts` à cette étape : c’est une opération de cycle de vie qui fusionne
annotations, ancres, locuteurs, valeurs et anonymisation. Elle lit les refs
exposées par le module, mais ne doit pas être enfouie dans le seul domaine anon.

### Découpage interne éventuel

Après validation de l’extraction à comportement constant, réévaluer la taille et
les dépendances du nouveau module. S’il reste difficile à lire, faire deux lots
supplémentaires, jamais simultanément avec le premier déplacement :

```text
useReperageAnonymisation.ts
usePorteeAnonymisation.ts
```

Le premier porterait compteurs, hits et navigation. Le second porterait les
transitions de portée, les règles corpus, les dialogues et la réconciliation.
`useAnonymisationEntretien.ts` resterait leur coordinateur et l’API consommée par
la façade. Ne pas effectuer ce second découpage si les paramètres nécessaires
reconstituent presque tout le module.

Points de vigilance :

- conserver les appels IPC et leurs attentes dans le même ordre ;
- conserver la distinction entre brouillon, occurrence locale et règle corpus ;
- ne jamais perdre `pseudosDeclares` lors d’un simple changement de document ;
- ne pas rafraîchir les compteurs à chaque frappe si ce n’est pas le comportement
  actuel ;
- conserver le repérage actif et sa décoration après chaque mutation ;
- garder les exceptions et leurs pseudos-mémoire ;
- ne pas mélanger cette extraction avec une modification des algorithmes purs.

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

Si le banc Nextcloud est déjà disponible, compléter avec les scénarios de
publication et de divergence concernés. Ne télécharger ni reprovisionner aucune
image Docker.

## Étape 7 — Extraire codages, menu éditeur et commentaires

Créer `useAnnotationsEntretien.ts` avec :

- `hintCodage`, `coderAvec` et `retirerCodagesDuCode` ;
- projection et état du menu contextuel ;
- création, édition et suppression des commentaires ;
- retrait d’un codage depuis le menu ;
- bascule d’une occurrence anon entre exception et anonymisée ;
- bascule du pseudo d’une occurrence depuis le menu.

Le nom « annotations » reflète la frontière réelle : ces gestes opèrent tous sur
`entretien.annotations` et alimentent les plugins de décorations, le journal et
la sauvegarde. Le module reçoit du composable d’anonymisation uniquement les
capacités nécessaires pour décrire une occurrence, retrouver son pseudo de ligne
et rafraîchir l’état anon après mutation.

`useEntretien.ts` continue de brancher :

```ts
pluginMenuContexte(entretien, annotations.ouvrirMenuContexte)
pluginCommentairesMarge(entretien, annotations.editerCommentaire)
```

Points de vigilance :

- le menu doit toujours se fermer avant l’ouverture d’une modale ;
- le dédoublonnage des codages et le choix de la plage la plus large restent
  inchangés ;
- le signataire est mémorisé avant la mutation du commentaire ;
- toutes les mutations conservant une entrée de journal doivent continuer à
  utiliser un objet inverse remappable ;
- les commentaires liés aux notes restent résolus depuis le même modèle réactif.

Validation ciblée :

```bash
npm run typecheck
npm test
npm run build
npx playwright test --project=local \
  e2e/theme-entretien.e2e.ts \
  e2e/commentaires.e2e.ts \
  e2e/journal.e2e.ts \
  e2e/anonymisation.e2e.ts
```

## Étape 8 — Nettoyer la façade sans changer son rôle

Une fois tous les modules extraits :

1. supprimer uniquement les imports devenus inutiles ;
2. regrouper clairement la création du modèle, des modules, de l’éditeur, de la
   sauvegarde et du cycle de vie ;
3. conserver une fonction centrale de rafraîchissement dont l’ordre reste
   explicite ;
4. appeler les hooks `charger` et `reinitialiser` de chaque module dans le cycle
   de vie ;
5. conserver `payloadCourant()` et `donneesExport()` comme inventaires lisibles
   de ce qui est sérialisé ;
6. conserver le `return` public explicite et dans le même ordre logique ;
7. vérifier qu’aucun composable extrait n’importe `sonal.ts` ou
   `utiliserSonal()`.

À la fin, `useEntretien.ts` doit se lire comme une composition de domaines et non
comme leur implémentation détaillée.

## Matrice de propriété cible

| État ou action | Propriétaire cible |
|---|---|
| `entretien`, `locuteurs`, `meta`, legacy | façade `useEntretien.ts` |
| éditeur, plugins et synchronisation audio | façade `useEntretien.ts` |
| ouverture, sauvegarde, payload, export et fusion | façade `useEntretien.ts` |
| recherche, occurrences et raccourci | `useRechercheEntretien.ts` |
| journal, inverses et projection affichable | `useJournalEntretien.ts` |
| valeurs générales et par locuteur | `useValeursEntretien.ts` |
| notes, brouillon, marquage et liens | `useNotesEntretien.ts` |
| gestes locuteurs et rapprochement personnes | `useLocuteursEntretien.ts` |
| lignes, repérage, validation et portée anon | `useAnonymisationEntretien.ts` |
| codages, menu contextuel et commentaires | `useAnnotationsEntretien.ts` |
| `rafraichir()` transversal | façade, par composition des projections |

## Validation commune à chaque lot

Exécuter après chaque extraction :

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Puis exécuter les E2E ciblés indiqués dans l’étape. En fin de plan :

```bash
npx playwright test --project=local
```

Pour les scénarios Nextcloud, utiliser uniquement les bancs déjà présents avec
`npm run nc:up` ou `npm run nc-b:up`. Si le serveur n’est pas disponible, laisser
les tests concernés se sauter ; ne pas faire de `pull` et ne pas
reprovisionner.

## Critères de fin

Le découpage est terminé lorsque :

- `useEntretien.ts` ne contient plus les détails des panneaux Notes, Locuteurs,
  Données ou Anonymisation ;
- la façade conserve seule le modèle commun, TipTap, la persistance et
  l’orchestration ;
- l’API exposée par `utiliserSonal()` n’a pas changé ;
- aucun module extrait ne dépend de la façade complète ni de `sonal.ts` ;
- chaque état volatil est nettoyé au changement d’entretien ;
- les sauvegardes gardent leur debounce, leur sérialisation et leur ordre ;
- les tests unitaires, le build et tous les E2E locaux passent ;
- les changements ont été réalisés par lots indépendants, sans refonte métier
  cachée dans les déplacements.
