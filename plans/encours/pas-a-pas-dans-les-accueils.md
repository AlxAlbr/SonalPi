# Intégrer le parcours pas à pas dans les accueils

## Objectif

Supprimer l’onglet « Pas à pas » du corpus et intégrer l’accompagnement aux accueils existants, sans rendre les consignes moins accessibles pendant le travail.

**Principe : un seul parcours partagé, plusieurs points d’accès, une seule instance du guidage.**

## 1. Décisions UX

### Accueil du corpus : le point de référence du parcours

En mode découverte pas à pas, afficher dans cet ordre :

1. Le titre et la courte introduction du corpus.
2. Un bloc « Découverte pas à pas », à l’emplacement actuel du rappel Ctrl+F / Cmd+F.
3. Le rappel du raccourci de recherche, conservé mais visuellement secondaire.
4. La présentation des outils existants.

Le bloc du parcours contient :

- une progression textuelle « X étapes sur 6 réalisées » ;
- les six étapes existantes, avec leurs numéros actuels, états et prérequis ;
- une action principale « Commencer » ou « Continuer : [étape] » lorsqu’aucune étape n’est active ;
- l’identification de l’étape en cours lorsqu’un guidage est déjà lancé ;
- un état « Parcours terminé », sans empêcher de réessayer une étape.

Le bouton Continuer propose la première étape non validée dont le prérequis est satisfait. Il ne prétend pas restaurer une étape active après redémarrage : seuls les acquis sont actuellement persistés. Si aucune étape n’est éligible, ne pas proposer d’action trompeuse.

La liste reste directement visible : six étapes ne justifient pas un nouvel écran ou un sous-onglet. Supprimer sa mention comme outil autonome dans la liste des outils.

**Hors mode pas à pas, conserver la présentation actuelle**, y compris le raccourci de recherche à sa place habituelle. Ne pas transformer ce changement en tutoriel imposé aux corpus ordinaires ou au mode autonomie.

### Accueil de l’entretien : un rappel, pas une seconde liste

Afficher en tête un bloc compact, uniquement en mode pas à pas :

- la progression globale et le titre de l’étape active, si elle existe ;
- sinon, une invitation à continuer le parcours ;
- un bouton explicite « Voir le parcours dans le corpus ».

Ne pas recopier la liste complète ni dupliquer la consigne détaillée. Ne pas lancer aveuglément une étape depuis l’entretien ouvert : le parcours existant utilise des entretiens de démonstration précis et certaines étapes nécessitent un passage par le corpus.

Conserver les conseils audio, recherche et la présentation des outils sous ce bloc.

### Pendant l’action : une consigne indépendante de l’Accueil

Dans l’entretien, déplacer l’emplacement partagé des consignes **juste sous la barre d’onglets et avant le panneau actif**. Il doit rester disponible sur Notes, Locuteurs, Thématiques, Données, etc.

- Présenter le titre, l’instruction immédiate et « Arrêter » sans imposer un panneau trop haut.
- Pour les textes longs, séparer une instruction courte toujours visible des explications dépliables. Ne jamais masquer dans les détails une information nécessaire au geste immédiat.
- Utiliser un contrôle accessible avec un état développé/replié explicite ; réinitialiser cet état lors du changement d’étape.
- Placer également les messages de fin d’étape et de reprise d’une étape déjà réalisée dans cette zone.
- Ne pas créer une seconde consigne complète dans l’Accueil de l’entretien.

Conserver les surbrillances et bulles existantes pour les étapes qui les utilisent. Leur redesign général ne fait pas partie de cette évolution.

## 2. Constats techniques à prendre en compte

- `src/renderer/composables/demo.ts` porte déjà les six étapes, les prérequis, la validation, les messages et la persistance des acquis.
- `src/renderer/components/corpus/PasAPas.vue` mélange la liste des étapes et le guidage global téléporté : le déplacer tel quel ou le dupliquer dans les accueils serait fragile.
- Dans `Corpus.vue`, l’onglet actif est local. Le passage en mode pas à pas sélectionne actuellement l’onglet dédié.
- Dans `Entretien.vue`, l’ancre `ancre-guide-pp` est actuellement située après les panneaux, ce qui peut reléguer la consigne en bas de la colonne.
- Les vues Corpus et Entretien restent montées avec `v-show` dans `App.vue`. Les téléportations nécessitent des ancres disponibles et des conditions de visibilité explicites.
- `retourCorpus()` ferme l’entretien puis change de vue, mais ne choisit pas l’onglet du corpus. Une sélection de carte peut aussi masquer l’Accueil derrière les métadonnées.

## 3. Réalisation par étapes

### Étape A — Séparer présentation et guidage

Extraire de `PasAPas.vue` deux responsabilités, avec des noms à confirmer lors de l’implémentation :

- `ParcoursPasAPas.vue` : progression, liste, états et activation ; aucune téléportation ni boucle d’animation.
- `GuidagePasAPas.vue` : surbrillances, bulles, consignes contextuelles et messages de fin/reprise ; aucune liste d’étapes.

Installer **une seule instance** du guidage dans la coquille `App.vue`, après les vues qui fournissent les ancres. La garder indépendante des onglets ; son activation dépend du mode découverte et de l’état du parcours.

Points de vigilance :

- démarrer correctement le suivi si une étape est déjà active au montage ;
- arrêter les animations au démontage, à la fin du guidage et à la sortie du mode ;
- ne rien afficher sur l’accueil général de l’application ou pour un autre corpus ;
- conserver le comportement de pause lorsque la cible appartient à une vue masquée ;
- ne pas téléporter vers une ancre absente ni multiplier les messages après navigation ;
- transférer les styles avec leur responsabilité et supprimer le composant ancien une fois ses usages remplacés.

Conserver le moteur de validation et le format du marqueur `demo`. Ajouter seulement les états dérivés utiles à l’affichage, sans dupliquer la progression dans les composants.

### Étape B — Intégrer le parcours à l’Accueil du corpus

Dans `src/renderer/components/corpus/Corpus.vue` :

- retirer la valeur d’onglet `pas-a-pas`, son bouton, son icône si elle devient inutilisée et ses branches de libellé ;
- remplacer l’ouverture automatique de cet onglet par l’ouverture de l’Accueil du corpus ;
- insérer le composant de parcours à l’emplacement retenu ;
- déplacer le rappel de recherche uniquement en mode découverte ;
- conserver les cartes et toutes les fonctions métier du corpus ;
- mettre à jour les commentaires devenus inexacts.

Le démarrage d’une nouvelle découverte conserve le lancement initial prévu par le code existant. La réouverture d’un corpus restaure les acquis sans lancer arbitrairement une nouvelle étape.

Vérifier aussi l’ouverture successive de deux corpus pas à pas : un simple observateur du booléen `pasAPas` ne suffit pas si celui-ci reste vrai.

### Étape C — Rendre les retours au parcours explicites

Ajouter une demande de navigation typée et partagée, relayée par l’orchestration Sonal, pour atteindre le parcours sans accéder au DOM ni appeler les internes d’un composant.

Le chemin « Voir/Revenir au parcours » doit :

1. utiliser la fermeture sécurisée existante si un entretien est ouvert ;
2. demander l’Accueil du corpus en respectant les gardes de sortie d’onglet existantes ;
3. effacer la sélection de carte et l’extrait de recherche qui pourraient masquer le parcours ;
4. ramener le bloc du parcours en vue, avec un focus pertinent pour une navigation au clavier.

Si la fermeture ou une garde refuse la navigation, rester sur l’écran courant et ne pas effacer prématurément le message utile à l’utilisateur.

Conserver le comportement du retour générique « Corpus » : cette évolution ne doit pas réinitialiser l’onglet à chaque navigation ordinaire. Ne pas sélectionner Accueil systématiquement à chaque étape ; cela perturberait notamment l’import du SRT dans les métadonnées.

Raccorder à cette navigation dédiée :

- le bouton de l’Accueil de l’entretien ;
- les boutons des messages de fin et de reprise ;
- les fins d’étapes qui reviennent déjà automatiquement au corpus.

Conserver l’exception actuelle de la note à chaud, qui laisse l’utilisateur dans l’entretien après validation.

### Étape D — Adapter l’entretien et les consignes

Dans `src/renderer/components/entretien/PanneauAccueilEntretien.vue`, ajouter le rappel compact décrit plus haut, connecté à l’état partagé.

Dans `src/renderer/components/entretien/Entretien.vue`, remonter l’ancre du guide entre la barre d’onglets et les panneaux.

Dans le guidage extrait et, si nécessaire, dans les textes de `demo.ts` :

- distinguer instruction immédiate et explication longue ;
- remplacer les formulations spatiales devenues fausses (« ci-dessous », « à droite ») ;
- clarifier les retours avec « Accueil du corpus » ou « parcours dans le corpus », sans confusion avec l’accueil général ;
- vérifier que consignes, messages et rappel d’Accueil ne répètent pas le même contenu.

## 4. Tests et critères d’acceptation

### Tests ciblés

Compléter les tests unitaires de présentation/état dérivé pour :

- le compteur, les prérequis et le choix de l’étape proposée ;
- l’état terminé et la possibilité de réessayer ;
- l’absence de composant de parcours hors mode découverte ;
- le routage explicite vers le parcours, y compris un refus de navigation ;
- le montage avec une étape déjà active et l’arrêt du guidage.

Adapter `e2e/pas-a-pas.e2e.ts` et `e2e/demo.e2e.ts`, puis couvrir les scénarios suivants :

1. Nouvelle découverte : Accueil du corpus actif, liste en tête, aucun onglet Pas à pas.
2. Parcours complet : les six étapes restent réalisables et leurs prérequis sont conservés.
3. Notes puis Locuteurs : la consigne reste visible après changement d’onglet et précède le panneau métier.
4. Consigne longue : les explications se déplient sans masquer le geste ou les contrôles nécessaires.
5. Retour depuis un autre onglet, une recherche ou une carte sélectionnée : le parcours est effectivement visible.
6. Fin d’étape, arrêt et nouvel essai : pas de consignes ou de surbrillances dupliquées.
7. Réouverture : progression conservée, aucune étape démarrée sans le comportement explicitement prévu.
8. Changement de corpus, y compris entre deux corpus pas à pas : aucun état de guidage ne fuit vers le suivant.
9. Corpus ordinaire et autonomie : pas de parcours, raccourcis et accueils inchangés.
10. Ctrl+F / Cmd+F puis Échap : recherche fonctionnelle et retour au bon onglet.

Compléter `e2e/navigation.e2e.ts` si nécessaire pour les retours explicites. Privilégier les libellés accessibles et les attributs de test stables plutôt que les anciens sélecteurs d’onglet.

### Commandes de validation

```bash
npm run typecheck
npx vitest run <fichiers-de-tests-unitaires-ajoutés>
npm run test:e2e -- e2e/pas-a-pas.e2e.ts e2e/demo.e2e.ts e2e/navigation.e2e.ts --project=local --workers=1
```

Adapter la liste aux tests effectivement ajoutés. Les scénarios ciblés sont locaux et ne nécessitent pas de banc Docker. Si une validation distante est ajoutée, appeler `preparer_bancs_docker` avant les tests concernés, sans téléchargement ni reprovisionnement.

### Revue visuelle et clavier

Vérifier au minimum une fenêtre confortable et une fenêtre de faible hauteur :

- parcours immédiatement repérable dans l’Accueil du corpus ;
- consigne accessible sans défiler jusqu’au bas d’un panneau long ;
- hauteur du guide raisonnable et contrôles métier toujours accessibles ;
- absence de superposition gênante avec les modales ;
- focus visible, boutons explicites, progression compréhensible sans couleur ;
- raccourcis de recherche et d’écoute toujours découvrables.

## 5. Documentation et limites

Mettre à jour les pages utilisateur concernées, notamment `docs/user/vue-corpus.md`, ainsi que les descriptions du parcours qui mentionnent encore un onglet dédié. Les commentaires de code décriront le comportement sans référence à ce plan.

Ne pas modifier dans ce chantier :

- le format des corpus, les IPC ou les transports distants ;
- les objectifs et prédicats métier des six étapes ;
- le choix des entretiens et fichiers de démonstration ;
- les retours automatiques entre corpus et entretien, sauf leur destination d’onglet explicite ;
- le fonctionnement général des autres onglets ;
- la persistance de l’étape active ou d’un nouveau mode de tutoriel.

Le dépôt comporte déjà des modifications en cours, notamment dans `Corpus.vue`, `sonal.ts`, `useCycleCorpus.ts` et la documentation. Les préserver et limiter les changements à cette évolution.

## Définition de terminé

L’onglet dédié a disparu ; le parcours complet est accessible en tête de l’Accueil du corpus ; l’Accueil de l’entretien fournit un point de reprise ; les consignes accompagnent l’action sur les autres onglets ; les retours retrouvent réellement le parcours ; la progression et les six étapes restent fonctionnelles, sans effet sur les corpus hors découverte.
