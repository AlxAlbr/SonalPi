# Parcours pédagogiques différenciés par phase de travail

## Conclusion de l’analyse

L’idée est pertinente. Le parcours actuel apprend surtout le traitement d’entretiens déjà collectés, alors que SonalPi couvre aussi la préparation du terrain et commence à couvrir l’analyse. Des parcours distincts rendraient l’apprentissage plus proche du cycle réel d’un projet et éviteraient de présenter une longue suite d’étapes sans objectif homogène.

La séparation doit toutefois porter sur les **objectifs pédagogiques**, pas créer plusieurs moteurs de tutoriel ni plusieurs corpus de démonstration. La cible recommandée est donc :

- un corpus d’apprentissage partagé ;
- un catalogue de parcours indépendants ;
- une progression propre à chaque parcours ;
- une seule étape active à la fois ;
- une seule instance du guidage global ;
- aucune obligation de terminer « Préparation » avant « Traitement ».

Le mode `pas-a-pas` reste un mode de découverte. `preparation`, `traitement` et, plus tard, `analyse` deviennent des identifiants de parcours à l’intérieur de ce mode. Il ne faut pas multiplier les valeurs de `ModeDemo` ni les dossiers de corpus de test.

Le parcours d’analyse ne doit pas être construit tout de suite. Les fonctions **Lexico** et **Synthèse** sont encore indiquées « à venir » ; afficher un parcours qui promettrait ces résultats serait trompeur. L’architecture doit l’autoriser, mais son contenu sera ajouté lorsque Cas, Recueils et les outils de synthèse formeront un scénario cohérent.

## Objectifs UX

### Accueil général

Conserver une seule entrée **Découverte pas à pas**. Elle prépare ou rouvre le corpus d’apprentissage, puis conduit au catalogue des parcours dans l’Accueil du corpus.

Pour une nouvelle découverte, ne plus lancer automatiquement la première étape du traitement. L’utilisateur choisit d’abord son objectif :

1. **Préparer son terrain** — tableau de bord, documents cadre, entretien planifié et notes préparatoires ;
2. **Traiter ses entretiens** — le parcours actuel, conservé avec ses six étapes ;
3. **Analyser son corpus** — absent de la première livraison, ou présenté uniquement comme information « à venir » sans bouton de démarrage.

À la réouverture d’un ancien corpus de démonstration, sélectionner directement **Traiter ses entretiens** si son ancien marqueur contient déjà des étapes validées. Cela évite de désorienter les personnes ayant commencé le parcours actuel.

### Accueil du corpus

Le bloc **Découverte pas à pas** présente d’abord des cartes compactes :

- titre et objectif du parcours ;
- progression `X étapes sur N` ;
- état `À commencer`, `En cours` ou `Terminé` ;
- action `Découvrir`, `Continuer` ou `Revoir`.

Une seule liste détaillée est affichée à la fois, sous les cartes. Un bouton **Tous les parcours** revient au catalogue. Il ne faut pas afficher simultanément dix étapes ou davantage.

Lorsqu’une étape est active, le bloc identifie à la fois le parcours et l’étape :

> Préparer son terrain · Étape en cours : Ajouter les documents du projet

La fin d’un parcours propose :

- de revoir ses étapes ;
- de revenir au catalogue ;
- éventuellement de découvrir le parcours recommandé suivant, sans le lancer automatiquement.

### Accueil de l’entretien

Le rappel compact indique le parcours actif en plus de l’étape :

- `Préparer son terrain — 3 étapes sur 4` ;
- ou `Traiter ses entretiens — 2 étapes sur 6` ;
- bouton **Voir ce parcours dans le corpus** ;
- lien secondaire **Voir tous les parcours**.

Il ne recopie jamais la liste détaillée.

### Guidage pendant l’action

Conserver une seule instance de `GuidagePasAPas.vue`. Elle doit pouvoir utiliser quatre surfaces :

- Corpus ;
- Entretien ;
- Tableau de bord ;
- Docs cadre projet.

Les deux grandes fenêtres modales doivent fournir une ancre de consigne juste sous leur en-tête. Le guide ne doit pas rester derrière leurs voiles, actuellement placés à un `z-index` élevé. Une étape peut pointer le bouton réel de la barre d’outils, puis déplacer sa consigne dans la fenêtre une fois celle-ci ouverte.

Le guidage continue à observer le modèle métier, jamais le simple clic ni la présence d’un élément dans le DOM.

## Contenu du parcours « Préparer son terrain »

Le premier scénario proposé comporte quatre étapes courtes.

### 1. Organiser le suivi du projet

Objectif : découvrir le Tableau de bord et renseigner une information transversale.

Geste proposé :

- ouvrir **Tableau de bord** depuis la barre d’outils ;
- ouvrir la cellule traversante **Problématique** ;
- saisir une courte note et appliquer.

Validation : la cellule `#traversant / problematique` contient une note non vide.

Cette étape s’appuie sur les identifiants fixes du tableau, pas sur la position visuelle de la colonne.

### 2. Rassembler les documents cadre

Objectif : distinguer les documents de projet des notes d’entretien.

Geste proposé :

- ouvrir **Docs cadre projet** ;
- ajouter au corpus un petit guide d’entretien fourni avec les sources de démonstration ;
- vérifier qu’il apparaît dans **Vos Documents**.

Validation : le document attendu est présent dans l’inventaire des documents du projet.

Ajouter une ressource légère, par exemple `CorpusTest/docs/Guide-entretien-demo.txt`, et l’intégrer au contrôle de complétude des sources. Le guide doit utiliser le vrai sélecteur de fichier, comme le parcours de traitement utilise les vrais SRT et audios.

Ne pas faire passer un document exemple embarqué pour un document du projet : les deux catégories doivent rester pédagogiquement distinctes.

### 3. Préparer un entretien avant la collecte

Objectif : montrer qu’un entretien peut exister sans audio ni transcription.

Geste proposé :

- revenir au corpus ;
- choisir **+ Ajouter un entretien** ;
- conserver les deux zones de fichiers vides ;
- nommer l’entretien `Entretien préparatoire` ;
- valider.

Validation : l’entretien vide créé existe. Conserver son identifiant dans le contexte du parcours afin que la suite ne dépende ni de l’ordre des cartes ni d’un titre susceptible d’être renommé.

### 4. Écrire une note de préparation

Objectif : préparer les questions, hypothèses ou points de vigilance avant l’entretien.

Geste proposé :

- ouvrir l’entretien préparatoire ;
- ouvrir Notes ;
- créer une note intitulée `Avant l’entretien` avec un contenu libre.

Validation : l’entretien enregistré à l’étape précédente contient au moins une note non vide.

Fin du parcours : expliquer que l’audio et le SRT pourront être assignés plus tard depuis les métadonnées, puis proposer le parcours **Traiter ses entretiens**.

## Contenu du parcours « Traiter ses entretiens »

Conserver les six étapes et leurs prédicats métier actuels :

1. Charger un entretien ;
2. Prendre des notes à chaud ;
3. Lier la transcription ;
4. Renommer les locuteurs ;
5. Créer une thématique et annoter ;
6. Saisir une variable.

Renommer seulement le parcours, pas les objectifs des étapes.

Rendre toutes les cibles déterministes avant de permettre l’enchaînement avec le parcours de préparation :

- cibler explicitement la carte `1Coordinatrice` pour renommer, coder et saisir une variable ;
- ne plus utiliser le premier `.crayon-entretien` trouvé ;
- cibler `2RetraiteAnticipee` pour les étapes 2a et 2b ;
- ne jamais supposer que les entretiens de démonstration occupent les premières positions, car l’entretien préparatoire peut déjà exister.

Les deux parcours doivent fonctionner dans n’importe quel ordre.

## Architecture cible

### 1. Séparer le moteur, le catalogue et les définitions

Découper l’actuel `src/renderer/composables/demo.ts`, qui cumule préparation du corpus et définition du traitement :

- `demo/useDemoCorpus.ts` : création, sources, mémoire des dossiers et restauration du marqueur ;
- `parcours/useParcours.ts` : étape active, prérequis, validation, reprise, fin et navigation ;
- `parcours/catalogue.ts` : registre ordonné des parcours disponibles ;
- `parcours/traitement.ts` : six étapes actuelles ;
- `parcours/preparation.ts` : quatre nouvelles étapes ;
- `parcours/presentation.ts` : états dérivés purs utilisés par les accueils.

Les noms exacts peuvent suivre les conventions du dépôt, mais les responsabilités doivent rester séparées.

### 2. Introduire des identités composées

Définir des types partagés :

```ts
type ParcoursId = 'preparation' | 'traitement' | 'analyse'

type EtapeActive = {
  parcoursId: ParcoursId
  etapeId: string
} | null

interface DefinitionParcours {
  id: ParcoursId
  titre: string
  resume: string
  disponible: () => boolean
  indisponibilite?: () => string | null
  etapes: EtapePasAPas[]
}
```

Les prérequis sont résolus dans le parcours courant par défaut. Un éventuel prérequis inter-parcours devra être explicite ; aucun n’est nécessaire dans cette première version.

Les messages de fin et de reprise portent aussi `parcoursId`, afin de toujours revenir à la bonne liste.

### 3. Faire évoluer la persistance sans casser les corpus existants

Étendre additivement `MarqueurDemo` :

```ts
interface MarqueurDemo {
  mode: ModeDemo
  racineSources: string
  validees?: string[] // lecture de compatibilité.
  parcours?: Partial<Record<ParcoursId, {
    validees: string[]
    contexte?: Record<string, string>
  }>>
}
```

Règles de migration :

- si `parcours` est absent, lire `validees` comme progression de `traitement` ;
- lors de la première écriture, produire `parcours.traitement` et conserver temporairement `validees` seulement si une compatibilité descendante est réellement nécessaire ;
- ne jamais confondre des identifiants d’étapes appartenant à deux parcours ;
- enregistrer dans `contexte` uniquement les identifiants d’artefacts nécessaires à la suite, notamment l’entretien préparatoire ;
- ne pas persister l’étape active, conformément au comportement actuel ;
- ne pas incrémenter `FORMAT_VERSION` pour ce champ additif déjà optionnel.

La mémoire de profil conserve un seul `corpusPasAPas`.

### 4. Généraliser les états dérivés

Le moteur expose, sans recalcul dans les composants :

- progression de chaque parcours ;
- première étape éligible de chaque parcours ;
- parcours actif et étape active ;
- parcours terminés ;
- parcours recommandé suivant ;
- disponibilité et motif d’indisponibilité.

`ParcoursPasAPas.vue` devient un catalogue et délègue la liste détaillée à un composant dédié, par exemple `ListeEtapesParcours.vue`.

### 5. Généraliser les surfaces de navigation

Étendre la demande de navigation typée actuellement utilisée pour revenir au parcours :

```ts
type DestinationGuide =
  | { surface: 'catalogue' }
  | { surface: 'parcours'; parcoursId: ParcoursId }
  | { surface: 'corpus-accueil'; parcoursId: ParcoursId }
  | { surface: 'entretien'; entretienId: string; onglet?: OngletEntretien }
  | { surface: 'tableau-bord' }
  | { surface: 'docs-cadre' }
```

Chaque surface enregistre un gestionnaire auprès de l’orchestration Sonal. Le moteur ne clique pas le DOM et ne manipule pas les internes d’un composant.

Pour les étapes pédagogiques, privilégier le geste réel : le guide pointe d’abord **Tableau de bord** ou **Docs cadre projet**, et l’utilisateur ouvre la fenêtre. La navigation programmée sert aux retours et aux fins d’étapes, pas à escamoter l’action enseignée.

### 6. Ajouter des ancres et des cibles stables

Ajouter des attributs stables aux éléments nécessaires :

- boutons Tableau de bord et Docs cadre ;
- ancre de guide dans chaque grande fenêtre ;
- cellule `Problématique` et formulaire de cellule ;
- action d’ajout de document et liste **Vos Documents** ;
- titre de création d’un entretien vide ;
- carte de l’entretien préparatoire par identifiant ;
- création et formulaire de note.

Ne pas utiliser de sélecteur `nth-child`, de texte traduit ni d’ordre de carte pour valider ou cibler une étape.

### 7. Garder les prédicats dans le modèle réactif

Le moteur continue à valider des résultats métier :

- contenu réel d’une cellule du tableau ;
- présence réelle d’un document de projet ;
- existence réelle d’un entretien vide ;
- note réellement enregistrée ;
- prédicats actuels du traitement.

Exposer au moteur les données réactives nécessaires, notamment l’inventaire Docs cadre et le tableau. Pour les ressources créées pendant une étape, capturer leur identifiant après la mutation et le mémoriser dans le contexte du parcours. Ne jamais valider sur un clic ou sur la seule ouverture d’une fenêtre.

## Réalisation par étapes

### Étape A — Socle multi-parcours

1. Écrire les types `ParcoursId`, `DefinitionParcours`, `EtapeActive` et progression par parcours.
2. Extraire le moteur de `demo.ts` sans changer le comportement du traitement.
3. Ajouter le nouveau format de progression et la lecture de compatibilité de `validees`.
4. Adapter `GuidagePasAPas.vue`, les messages et la navigation à l’identité composée.
5. Maintenir tous les tests actuels du traitement au vert avant d’ajouter le nouveau contenu.

### Étape B — Catalogue dans les accueils

1. Remplacer la liste unique par les cartes de parcours et une liste détaillée sélectionnée.
2. Adapter les actions Commencer, Continuer, Revoir et Tous les parcours.
3. Enrichir le rappel de l’Accueil de l’entretien avec le titre du parcours.
4. Modifier la nouvelle découverte pour arriver sur le catalogue sans étape active.
5. Restaurer directement le traitement pour les anciens marqueurs ayant une progression.

### Étape C — Surfaces Tableau de bord et Docs cadre

1. Ajouter les ancres de consigne sous les en-têtes des deux fenêtres.
2. Faire suivre le guide entre barre d’outils, fenêtre et formulaire actif.
3. Vérifier les niveaux de superposition, le focus, Échap et les faibles hauteurs.
4. Exposer les données réactives nécessaires aux prédicats.
5. Ajouter les cibles `data-tour` stables.

### Étape D — Parcours Préparation

1. Ajouter le document léger aux sources de démonstration et à leur vérification de complétude.
2. Implémenter les quatre définitions d’étape et leurs textes courts/détails.
3. Capturer l’identifiant de l’entretien préparatoire.
4. Gérer les fins, reprises et nouveaux essais sans dupliquer les documents ou entretiens.
5. Proposer le traitement à la fin sans le démarrer automatiquement.

### Étape E — Durcir le parcours Traitement

1. Déplacer ses définitions dans leur module.
2. Remplacer les cibles dépendantes de l’ordre par des cibles d’entretien précises.
3. Vérifier son exécution après le parcours de préparation et avant celui-ci.
4. Conserver exactement ses prérequis, sa persistance et l’exception de la note à chaud.

### Étape F — Préparer, sans livrer, le parcours Analyse

1. Réserver l’identifiant `analyse` dans les types, sans progression artificielle.
2. Définir les critères d’entrée produit : Cas et Recueils stabilisés, objectif de comparaison clair, sortie observable et documentation disponible.
3. Concevoir ensuite un scénario séparé, probablement autour de : constituer des Cas, rassembler des passages dans un Recueil, comparer des données/thèmes et produire une sortie.
4. Ne pas inclure Lexico ou Synthèse tant que leurs fonctions ne sont pas utilisables.

## Tests

### Tests unitaires

Ajouter des tests purs pour :

- progression indépendante des parcours ;
- prérequis limités au parcours courant ;
- choix de la prochaine étape ;
- fin d’un parcours sans terminer les autres ;
- recommandation du parcours suivant ;
- migration de `demo.validees` vers `traitement` ;
- conservation du contexte d’artefacts ;
- indisponibilité expliquée d’un parcours ;
- absence de démarrage automatique à la réouverture.

Tester les nouveaux prédicats :

- note de la cellule Problématique ;
- document cadre présent ;
- entretien préparatoire identifié ;
- note enregistrée sur le bon entretien.

### Tests E2E

Couvrir au minimum :

1. Nouvelle découverte : catalogue visible, aucune étape active, aucun ancien onglet Pas à pas.
2. Parcours Préparation complet avec les vrais Tableau de bord, Docs cadre, création vide et Notes.
3. Consigne visible dans les grandes fenêtres et jamais derrière leur voile.
4. Fermeture d’une fenêtre en cours d’étape, puis reprise sans doublon.
5. Réouverture : progression des deux parcours conservée, aucune étape relancée.
6. Ancien marqueur `validees` : traitement restauré sans perte.
7. Préparation puis Traitement : toutes les cibles du traitement visent les bons entretiens.
8. Traitement puis Préparation : mêmes résultats.
9. Fin d’un parcours : l’autre reste indépendant et démarrable.
10. Corpus autonomie et corpus ordinaire : aucun catalogue pédagogique.
11. Retour depuis Entretien, Tableau de bord et Docs cadre : bon parcours affiché et focus visible.
12. Fenêtre basse : consigne compacte, formulaires et boutons toujours accessibles.

Les scénarios restent locaux et ne nécessitent pas de banc Docker.

### Commandes de validation

```bash
npm run typecheck
npx vitest run test/parcoursPasAPas.test.ts test/parcoursCatalogue.test.ts test/marqueurDemo.test.ts
npm run test:e2e -- e2e/demo.e2e.ts e2e/pas-a-pas.e2e.ts e2e/preparation-pas-a-pas.e2e.ts e2e/navigation.e2e.ts --project=local --workers=1
```

Adapter les noms aux fichiers créés.

## Documentation

Mettre à jour :

- `docs/user/vue-corpus.md` pour le catalogue et les progressions séparées ;
- `docs/user/docs-cadre.md` pour le rôle du parcours de préparation ;
- la présentation de **Mini Corpus Test** dans l’Accueil ;
- la documentation développeur de la démo, des sources et du marqueur `demo`.

Les textes doivent parler de **parcours de préparation**, **parcours de traitement** et, plus tard, **parcours d’analyse**, plutôt que d’un unique « pas à pas ».

## Limites et points de vigilance

- Les parcours restent des exercices dans un corpus d’apprentissage, pas une checklist imposée aux corpus réels.
- Une action libre reste possible en dehors du guidage ; le moteur ne verrouille pas Tableau de bord ou Docs cadre.
- Les documents cadre distants ne sont pas modifiables depuis SonalPi : le parcours de préparation doit rester local tant qu’un scénario distant spécifique n’est pas défini.
- Le contexte mémorise des identifiants, jamais des sélecteurs DOM.
- Les acquis sont monotones comme aujourd’hui : supprimer plus tard le document ou la note ne décoche pas rétroactivement l’étape.
- Les parcours ne doivent pas se polluer : aucun sélecteur générique ne choisit « la première carte ».
- Le catalogue ne doit pas devenir un nouvel écran profond : il reste dans l’Accueil du corpus.
- Le parcours Analyse sera livré seulement lorsqu’il pourra mener à un résultat concret, pas pour exposer des boutons encore incomplets.

## Définition de terminé

La découverte propose deux parcours réellement utilisables dans un même corpus d’apprentissage. Chacun possède sa progression, ses prérequis, ses messages et sa reprise ; un seul guidage global accompagne l’action dans Corpus, Entretien, Tableau de bord et Docs cadre. Les anciens acquis du traitement sont conservés, les deux parcours fonctionnent dans n’importe quel ordre, et l’architecture permet d’ajouter ultérieurement Analyse sans modifier de nouveau le moteur ni le format général de progression.
