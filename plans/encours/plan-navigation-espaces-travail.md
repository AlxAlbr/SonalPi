# Navigation par espaces de travail — plan d’exécution

Statut : proposition issue de la discussion, prête à être détaillée puis exécutée par lots.
Ce document ne signifie pas que les changements sont déjà réalisés.

## 1. Objectif et décisions retenues

Remplacer les nombreux lanceurs de la barre supérieure par quatre entrées lisibles :

| Entrée principale | Contenu |
| --- | --- |
| **Préparer et gérer** | Tableau de bord ; Documents cadre. |
| **Importer et traiter** | Organisation existante à deux niveaux : Corpus / Entretien. |
| **Analyser et interpréter** | Synthèse ; Lexico ; Analyses croisées. |
| **Rédiger et exporter** | Recueils ; accès aux exports existants. |

Ce sont des espaces de travail, pas un parcours obligatoire. On peut passer de l’un à l’autre pendant la recherche.

Décisions complémentaires :

- **Cas remplace Journal dans les onglets du corpus**, au sein d’Importer et traiter. Le nombre d’onglets du corpus n’augmente pas.
- Cas ne devient pas un nouvel onglet dans l’entretien, ni un panneau latéral supplémentaire.
- Les cas ne sont pas réservés à l’export CAQDAS : ils servent aussi à organiser les matériaux et peuvent être utilisés dans les analyses.
- Recueils reste dans Rédiger et exporter : c’est un outil de composition de documents, pas de préparation de la collecte.
- Depuis l’entretien, conserver les actions contextuelles **Ajouter à un cas…** et **Ajouter à un recueil…**.
- Un ajout contextuel ne doit pas faire quitter automatiquement l’entretien. L’ouverture de la destination reste un choix explicite.
- Retirer Journal de la barre du corpus ne supprime ni l’historique, ni les commandes d’annulation, ni le journal propre à l’entretien.
- **Priorité : rendre visibles les associations aux cas et aux recueils depuis le passage consulté**, sans encombrer le texte.
- **Priorité : permettre le retour au travail précédent**, à sa position et avec ses filtres, après consultation d’une source ou d’un objet lié.
- Articuler les espaces avec les parcours du pas à pas déjà amorcés, sans transformer la navigation libre en suite d’étapes obligatoires.

## 2. Choix à confirmer avant le code

Ces points n’ont pas été arrêtés pendant la discussion. Les propositions ci-dessous servent de base au premier lot.

### 2.1 Présentation des espaces

Cible proposée : une barre principale de quatre entrées et, pour l’espace actif, une navigation secondaire. Les outils s’affichent dans la zone de travail ; les quatre entrées ne sont pas seulement des menus lançant les anciennes grandes modales.

Dans Importer et traiter, conserver les onglets et le niveau Corpus / Entretien existants. Éviter d’ajouter une nouvelle rangée redondante de navigation. Le fil d’Ariane doit distinguer l’accueil général, le corpus ouvert et le contexte de traitement, sans prétendre qu’un entretien est la page active lorsque l’on consulte une analyse.

À arbitrer sur une maquette : largeur des intitulés, retour au traitement, affichage du contexte d’entretien depuis les autres espaces et comportement sur une fenêtre étroite.

### 2.2 Entrée et retour dans un espace

Proposition :

- à l’ouverture d’un corpus, afficher Importer et traiter / Corpus / Accueil ;
- au premier accès aux autres espaces, afficher respectivement Tableau de bord, Synthèse et Recueils ;
- mémoriser ensuite le dernier sous-espace visité pendant l’ouverture de ce corpus ;
- revenir dans Importer et traiter au contexte précédent, sans rouvrir un entretien qui a été explicitement fermé ;
- réinitialiser les destinations, sélections et requêtes en attente lors d’un changement de corpus ;
- ne pas persister cette navigation dans les fichiers métier.

### 2.3 Accès secondaire au journal du corpus

Proposition à valider : une commande discrète **Historique des actions…**, dans les actions du corpus, ouvre le panneau existant en dialogue. Il ne faut pas rendre les annulations actuellement accessibles introuvables.

Le retrait concerne l’onglet du corpus uniquement. **Le journal de l’entretien reste inchangé.** Ne pas entreprendre une refonte ou une extension du moteur du journal dans ce chantier.

Préserver aussi un retour arrière directement accessible depuis **Personnes**, sans imposer d’ouvrir un autre outil après une correction. Proposition : une commande **Annuler une modification…** donnant accès aux actions récentes d’origine Personnes, avec leur libellé et leur état d’annulabilité. Une action immédiate après une modification peut compléter cet accès, mais ne doit jamais annuler implicitement la dernière action globale d’un autre outil. Le choix visuel reste à maquetter.

Cette interface réutilise les entrées et contrôles du journal existant. Elle ne promet pas que toutes les opérations Personnes sont annulables et ne crée pas une annulation distante actuellement absente. L’accès secondaire général conserve les autres opérations prises en charge, notamment celles des notes.

### 2.4 Portée de la rubrique Exports

Proposition : un point d’accès aux exports existants, avec une portée explicite : **Exporter le corpus…**, **Exporter l’entretien…** lorsque le contexte le permet, et accès aux exports propres aux outils.

Conserver les boutons contextuels utiles dans l’entretien, les recueils et les analyses. Ne pas inventer de nouveaux formats ni une composition multi-analyses pour remplir cette rubrique. L’organisation précise des raccourcis reste à valider après inventaire des exports disponibles.

## 3. État technique constaté

### 3.1 Coquille et navigation

- `src/renderer/components/app/BarreOutils.vue` contient les lanceurs actuels.
- `src/renderer/App.vue` héberge Corpus et Entretien avec `v-show`, ainsi que les grandes modales métier.
- `src/renderer/composables/sonal.ts` assemble les outils, leurs fermetures mutuelles, les retours aux sources et la navigation guidée.
- `src/renderer/composables/corpus/useCycleCorpus.ts` gère le cycle du corpus et de l’entretien.
- `src/renderer/components/corpus/Corpus.vue` porte aujourd’hui l’état local des onglets, dont Journal, et une protection de sortie de la pseudonymisation.

**Point critique : `retourCorpus()` ferme réellement l’entretien**, avec les opérations de sauvegarde et de session associées. Il ne suffit donc pas de l’appeler pour masquer l’entretien et afficher un autre espace.

### 3.2 Outils réutilisables

- Cas : `components/corpus/CasCorpus.vue`, `components/app/CasModale.vue`, `composables/corpus/useCasCorpus.ts`.
- Recueils : `components/corpus/RecueilsCorpus.vue`, `components/app/RecueilsModale.vue`, `composables/corpus/useRecueilsCorpus.ts`.
- Préparation : `components/corpus/TableauBord.vue`, `components/corpus/DocsCadre.vue` et leurs enveloppes modales/composables.
- Analyses : `components/synthese/SyntheseModale.vue`, `components/lexico/LexicoModale.vue`, `components/analyses/AnalysesCroiseesModale.vue` et leurs composables.
- Exports : `components/corpus/ModaleExportCorpus.vue`, `components/entretien/ModaleExportEntretien.vue`, `export/` et les exports propres aux outils.

Les chemins de cette liste sont relatifs à `src/renderer/`, sauf indication contraire. Les composants d’analyse peuvent nécessiter une extraction du contenu hors de leur enveloppe modale : ne pas supposer qu’un panneau autonome existe déjà.

### 3.3 Ajout de passages

Dans `components/entretien/Entretien.vue`, le menu contextuel appelle actuellement `afficherCasPourAssociation()` ou `afficherRecueils()`.

- Pour les cas, une sélection est capturée lors de l’ouverture de l’association.
- Pour les recueils, l’ajout s’appuie sur `enregistrerRepereSelection()` au moment de la commande. Une nouvelle interface ne doit pas perdre la sélection entre ces étapes.
- Les deux parcours disposent d’états d’ajout en attente : les conserver pour permettre une reprise après échec sans doublon.
- Les contenus restent référencés par entretien et repère. Aucun déplacement ou copie des passages n’est nécessaire.

### 3.4 Travaux voisins

Le répertoire de travail comporte déjà des modifications, notamment sur `App.vue`, `BarreOutils.vue`, `sonal.ts`, le cycle du corpus et les analyses. Ne pas les écraser ni revenir à une ancienne version de ces fichiers.

Relire avant exécution les plans actifs sur la synthèse, le lexico, les analyses croisées et les exports. La référence `plans/encours/synthese-corpus-onglets.md` décrit encore Journal dans la navigation : la mettre à jour à la livraison, sans réécrire l’historique des décisions comme si cette nouvelle organisation existait déjà.

### 3.5 Pas à pas : un découpage déjà amorcé

- `src/renderer/composables/parcours/catalogue.ts` ordonne les parcours de préparation et de traitement, sans prérequis entre eux ; l’analyse y est annoncée à venir.
- `src/renderer/composables/parcours/preparation.ts` définit « Préparer son terrain » : tableau de bord, documents du projet, entretien préparatoire et note de préparation.
- `src/renderer/composables/parcours/types.ts` décrit les destinations et les surfaces du guide ; une étape est validée par l’état métier, pas par le seul clic.
- `src/renderer/composables/parcours/presentation.ts` calcule les progressions et recommande le parcours suivant sans confondre leurs acquis.

Le rapprochement est donc une continuité de l’existant, pas la création d’une méthode entièrement nouvelle. Il n’est pas strictement univoque : le parcours de préparation utilise déjà des fonctions du corpus et de l’entretien, qui resteront dans Importer et traiter.

### 3.6 Annulation des modifications de personnes : vérification effectuée

La lecture de `src/main/corpusStore.ts`, `src/renderer/composables/corpus/useJournalCorpus.ts` et `src/renderer/components/corpus/PanneauJournalCorpus.vue` confirme un fonctionnement existant, pas seulement une intention :

- renommage d’une personne ;
- association, dissociation ou déplacement de l’association d’un locuteur vers une personne, via la commande de liaison ;
- refus simple de rapprochement et annulation de ce refus.

L’annulation vérifie que l’état attendu est encore présent et refuse d’écraser une modification ultérieure incompatible. Le composable actualise les projections concernées, dont Personnes et, selon l’action, Notes.

Limites à préserver : historique en mémoire limité aux dix dernières actions prises en charge, pendant la session du corpus ; annulation du journal du corpus indisponible en distant. Ne pas généraliser cette couverture aux créations, suppressions, réunions/séparations ou rapprochements composites : ces opérations ne bénéficient pas toutes de ces inverses.

Vérification exécutée : `npx vitest run test/journalCorpus.test.ts` — **11 tests réussis**. La suite couvre notamment les renommages successifs, les liaisons/déliaisons, les refus simples et le rejet d’une annulation devenue incompatible. Un scénario d’interface existe dans `e2e/journal-corpus.e2e.ts` pour le renommage et l’association ; il n’a pas été exécuté lors de cette vérification.

## 4. Contrats à préserver

### 4.1 Séparer affichage et cycle de vie

Introduire un état typé d’espace de travail, distinct de la vue de traitement `corpus | entretien` et de l’accueil général.

- Un changement d’espace ne doit pas détourner les commandes métier de fermeture ou d’ouverture.
- Proposition : comme avec les fenêtres actuelles, consulter un autre espace garde l’entretien ouvert en arrière-plan. Documenter ce comportement, notamment la conservation de la session distante.
- Un véritable retour au corpus, l’ouverture d’un autre entretien ou la fermeture du corpus continuent à passer par les protections existantes.
- Si une sortie est refusée, garder la destination et les indicateurs de navigation cohérents avec l’écran effectivement affiché.
- Préserver la protection de sortie de la pseudonymisation et examiner les autres brouillons avant de généraliser la navigation.
- Définir explicitement le comportement de la lecture audio lors d’un changement d’espace ; ne pas la modifier accidentellement.

Conserver l’éditeur monté et vérifier sélection, position de lecture, onglet actif, contenu non encore sauvegardé et reprise audio. Distinguer ce qui doit survivre à un simple masquage de ce qui peut être réinitialisé après une fermeture réelle.

### 4.2 Une destination, une instance de gestion

Prévoir des actions typées pour ouvrir un espace/sous-espace, un cas, un recueil ou un passage source. Éviter les clics DOM simulés et les états locaux contradictoires.

Ne pas monter deux gestionnaires complets de cas ou de recueils pour disposer à la fois d’un onglet et d’un dialogue d’ajout. Extraire une interface d’association limitée, partageant les commandes existantes.

Les changements de visibilité doivent aussi adapter les chargements : plusieurs projections dépendent actuellement des indicateurs d’ouverture de modale, par exemple `casOuverts`. Remplacer ces dépendances par une notion explicite de panneau actif lorsque nécessaire.

### 4.3 Fraîcheur et données

- Charger les panneaux au premier accès et conserver leurs résultats pendant une actualisation.
- Actualiser les cas après une modification pertinente ou un tirage distant réussi, sans relancer tous les outils cachés.
- Empêcher une réponse asynchrone d’un ancien corpus de remplir l’écran du nouveau.
- Conserver les permissions, capacités fournisseur, modes lecture seule et contrôles de publication existants.
- Préserver les distinctions entre matériaux inclus automatiquement et rattachements manuels des cas.
- Ne modifier ni le format des données, ni la sémantique des règles de cas, ni les formats d’export.

### 4.4 Associations visibles sans nouvelle donnée métier

À partir du passage sélectionné, dériver les liens vers les cas et les recueils depuis les références et les règles existantes. Ne pas ajouter une deuxième liste d’associations persistée sur l’annotation.

- Distinguer les rattachements manuels des inclusions automatiques dans un cas ; indiquer simplement la raison d’une inclusion automatique.
- Un même recueil peut citer un passage plusieurs fois : permettre de retrouver les occurrences sans multiplier inutilement les noms dans le résumé.
- Définir avant le code la correspondance entre sélection, annotation et passage référencé : identifiants/repères, égalité, inclusion et chevauchement. Ne pas assimiler sans précision un lien partiel à une association de toute la sélection.
- Examiner les fonctions de projection existantes avant de créer un calcul parallèle ; prévoir une indexation en mémoire ou un calcul ciblé si nécessaire.
- Actualiser les associations après ajout, retrait, modification des règles et actualisation distante. Distinguer « aucune association » de « associations non encore vérifiées » ou d’un résultat incomplet.
- En consultation seule, les liens restent consultables sans exposer d’action d’écriture interdite.

### 4.5 Retour au contexte de travail

Le retour au travail précédent ne se confond ni avec le fil d’Ariane, ni avec l’onglet mémorisé d’un espace. Il restitue le contexte quitté lors d’une consultation liée.

- Mémoriser en session une destination typée et son contexte : corpus, espace, sous-espace, objet sélectionné, filtres, tri, position de lecture et, pour une source, entretien et passage.
- Réutiliser les états déjà conservés par les panneaux ; ne pas copier le contenu métier ni réinjecter un ancien résultat d’analyse au-dessus de données actualisées.
- Prévoir une petite pile bornée pour les consultations imbriquées ; un retour dépile au lieu de créer une boucle. Une navigation libre explicite termine la chaîne de consultation, selon une règle à valider sur la maquette.
- Restaurer le contexte seulement après une navigation réussie, en respectant les contrôles de sauvegarde, fermeture et autorisation existants.
- Si l’objet a disparu, revenir au panneau disponible et expliquer sobrement l’absence ; ne pas sélectionner silencieusement un autre objet.
- Vider ces retours au changement ou à la fermeture du corpus. Ne pas rejouer automatiquement l’audio lors d’une restauration de position.

## 5. Parcours cibles

### A. Organiser les cas

Importer et traiter → Corpus → Cas remplace l’ancien accès Journal.

Le panneau donne accès à l’ensemble des fonctions existantes : création individuelle et par lots, familles, règles, matériaux, mémos, attributs et retour aux sources. Préférer la largeur de travail disponible plutôt que conserver inutilement les cartes d’entretiens à côté ; à vérifier sur la maquette.

### B. Ajouter un passage à un cas

1. Dans l’entretien, sélectionner un passage/une annotation et choisir Ajouter à un cas…
2. Ouvrir un dialogue ciblé : rappel du passage, choix d’un ou plusieurs cas et création simple si nécessaire.
3. Confirmer ; rester dans l’entretien, à la même position.
4. Afficher une confirmation courte avec une action explicite pour ouvrir un cas. Si plusieurs cas sont concernés, permettre de choisir la destination.
5. En cas d’annulation, ne rien ajouter. En cas d’échec, préserver la demande pour réessayer sans doublon.

L’ouverture explicite du cas mène à Importer et traiter / Corpus / Cas. Elle utilise le vrai parcours de retour au corpus et ses protections ; elle ne doit pas forcer une sortie ayant échoué.

### C. Ajouter un passage à un recueil

Même principe, avec choix du recueil et de l’emplacement. La création simple d’un recueil peut rester accessible.

Après réussite, proposer Ouvrir le recueil, sans y naviguer automatiquement. L’ouverture explicite mène à Rédiger et exporter / Recueils et sélectionne le bon document.

Tester particulièrement le maintien de la sélection malgré la prise de focus par le dialogue et la création différée du repère.

### D. Revenir au matériau source

Depuis un cas, un recueil ou une analyse, ouvrir le bon entretien et le bon passage dans Importer et traiter. Maintenir les protections de changement d’entretien.

Proposer ensuite une action contextualisée, par exemple **Revenir au recueil « Entrée dans le métier »** ou **Revenir à la synthèse**. Elle restitue l’objet, les filtres, le tri et la position de lecture précédents, pas seulement l’espace général. Le même mécanisme permet de revenir au passage de départ après ouverture explicite d’un cas ou d’un recueil depuis l’entretien.

### E. Préparer et exporter

Préparer et gérer expose Tableau de bord et Documents cadre, avec les capacités d’accès actuelles. Les parcours guidés qui les ouvrent doivent aboutir dans le nouvel espace.

Rédiger et exporter expose la composition des recueils et les exports existants. Les cas restent gérés dans le corpus, y compris lorsqu’ils sont utilisés par un export CAQDAS.

### F. Voir les associations du passage consulté

Depuis une annotation ou un passage sélectionné, rendre accessible un résumé discret, par exemple :

> Cas : Enseignants débutants · Recueils : Entrée dans le métier

Le placement exact reste à maquetter : zone contextuelle existante ou détail dépliable, sans nouvel onglet ni marquage permanent de tout le texte. Les noms ouvrent les objets correspondants et enregistrent le contexte permettant de revenir au passage.

Pour les cas, préciser si le passage est ajouté manuellement ou inclus automatiquement. Une inclusion automatique ne doit pas être présentée comme un rattachement supprimable d’un clic. Pour les recueils, ouvrir l’occurrence pertinente ou proposer un choix lorsqu’il y en a plusieurs.

### G. Faire correspondre navigation et pas à pas

Utiliser les mêmes repères de vocabulaire et les mêmes destinations pour le travail libre et le guidage :

| Parcours pédagogique | Espace de référence | Articulation |
| --- | --- | --- |
| Préparer son terrain, existant | Préparer et gérer | Conserver les étapes qui passent par le corpus et l’entretien. |
| Traitement, existant | Importer et traiter | Adapter ses cibles à la navigation réorganisée, sans perdre les acquis. |
| Analyse, annoncée à venir | Analyser et interpréter | Prévoir sa place et ses destinations ; son contenu pédagogique reste un chantier distinct. |
| Rédaction/restitution, éventuel | Rédiger et exporter | Piste future, pas un parcours existant à annoncer comme disponible. |

Le pas à pas explique une démarche ; les espaces donnent accès aux outils. Un parcours peut donc traverser plusieurs espaces. Terminer une étape ou un parcours ne verrouille ni ne débloque l’accès aux rubriques.

Prévoir un accès contextuel pour reprendre un parcours disponible, sans multiplier les barres de progression ni afficher un guidage permanent hors du mode concerné. Conserver une distinction claire entre **Reprendre le pas à pas** et **Revenir à mon travail précédent** : l’une reprend une étape pédagogique, l’autre une consultation libre.

## 6. Exécution par lots

### Lot 0 — Valider la navigation et établir la référence

- [ ] Confirmer les propositions de la section 2 et le comportement audio/session de la section 4.
- [ ] Maquetter les quatre espaces, l’onglet Cas, les deux dialogues d’ajout, le résumé des associations et l’action de retour au contexte précédent.
- [ ] Définir la correspondance entre passage sélectionné et associations, ainsi que le comportement des consultations imbriquées.
- [ ] Cartographier les étapes actuelles du pas à pas vers leurs espaces et destinations, y compris celles qui traversent plusieurs espaces ; préserver les identifiants et acquis existants.
- [ ] Inventorier les entrées indirectes : menu applicatif, raccourcis, guidage, retours aux sources, exports, tests et documentation.
- [ ] Relever l’état des tests ciblés avant modification et distinguer les échecs préexistants.

Sortie attendue : destinations et transitions définies, sans ambiguïté entre masquage et fermeture d’entretien.

### Lot 1 — Poser la navigation commune

- [ ] Créer l’état typé de navigation et les actions de destination, intégrés à l’orchestration existante.
- [ ] Remplacer la barre actuelle par les quatre entrées ; adapter le fil d’Ariane, l’accueil général et la réinitialisation par corpus.
- [ ] Préserver l’éditeur et les brouillons ; appliquer les protections avant de valider une transition.
- [ ] Ajouter le mécanisme de mémorisation/restauration du contexte et la pile bornée des consultations liées, avec réinitialisation par corpus.
- [ ] Ajouter les premiers tests de changement d’espace, retour au traitement, consultations imbriquées et refus de sortie.

Les anciennes enveloppes peuvent subsister temporairement pendant les lots suivants, mais ce n’est pas l’interface finale.

### Lot 2 — Installer Cas dans le corpus

- [ ] Remplacer l’onglet Journal par Cas dans `Corpus.vue`, ses types, son titre et sa présentation.
- [ ] Adapter l’initialisation et l’actualisation de `CasCorpus.vue` à son intégration comme panneau.
- [ ] Préserver les fonctions de familles, lots, attributs et ouverture des sources.
- [ ] Déplacer l’accès au journal vers la commande secondaire validée, sans supprimer son moteur ni toucher au journal de l’entretien.
- [ ] Ajouter dans Personnes l’accès aux annulations prises en charge, avec libellé explicite, restrictions existantes et actualisation des projections après succès.
- [ ] Préparer l’ouverture directe d’un cas depuis les autres parcours.

### Lot 3 — Séparer les ajouts contextuels de la gestion complète

- [ ] Extraire les dialogues ciblés d’association aux cas et d’ajout aux recueils.
- [ ] Préserver les références source, contrôles d’écriture et états de reprise existants.
- [ ] Maintenir le focus, la sélection et la position dans l’entretien après ajout ou annulation.
- [ ] Ajouter les confirmations et ouvertures explicites des destinations, avec retour au passage de départ.
- [ ] Construire le résumé des associations sur les références et projections existantes ; couvrir les inclusions automatiques, les rattachements manuels, les occurrences multiples et les résultats incomplets.
- [ ] Actualiser ce résumé après les mutations pertinentes sans recalculer tout le corpus à chaque mouvement de sélection.
- [ ] Supprimer l’ancienne grande modale Cas une fois tous ses accès remplacés.

### Lot 4 — Installer les autres espaces

- [ ] Intégrer Tableau de bord et Documents cadre dans Préparer et gérer.
- [ ] Intégrer Synthèse, Lexico et Analyses croisées dans Analyser et interpréter, sans perdre les filtres ni les liens entre outils.
- [ ] Intégrer Recueils et les accès aux exports dans Rédiger et exporter.
- [ ] Extraire les contenus réutilisables des grandes modales lorsque nécessaire.
- [ ] Remplacer les fermetures mutuelles de fenêtres par la navigation commune ; conserver les vrais dialogues de confirmation, d’édition ou d’export.
- [ ] Brancher les cas, recueils et analyses au retour contextuel : sélection, filtres, tri et position de lecture.
- [ ] Adapter la navigation guidée et toutes les ouvertures programmatiques ; réviser les surfaces, ancres et textes des étapes existantes.
- [ ] Préserver la progression du pas à pas et sa validation métier ; rendre sa reprise cohérente avec les espaces sans créer implicitement les parcours encore absents.

### Lot 5 — Stabiliser et documenter

- [ ] Vérifier largeur réduite, défilement, hauteur de l’en-tête, focus, clavier et lecteurs d’écran.
- [ ] Garantir que les panneaux cachés ne prennent pas le focus et que leurs raccourcis ne capturent pas les actions de l’écran actif.
- [ ] Mettre à jour les aides, visites guidées, captures et documentation des onglets.
- [ ] Retirer les états, styles et enveloppes devenus inutiles après vérification des appels restants.
- [ ] Exécuter la validation ci-dessous et consigner les résultats réels.

## 7. Validation

### 7.1 Contrôles automatisés

Commandes de base :

```bash
npm run typecheck
npm run build
npx vitest run test/cas*.test.ts test/recueils*.test.ts test/journal*.test.ts test/synthese.test.ts test/lexico.test.ts test/analysesCroisees.test.ts
npx playwright test e2e/navigation.e2e.ts e2e/cas.e2e.ts e2e/casLots.e2e.ts e2e/casFamilles.e2e.ts e2e/casAttributs.e2e.ts e2e/recueils.e2e.ts e2e/journal-corpus.e2e.ts e2e/journal.e2e.ts e2e/tableaubord.e2e.ts e2e/docs-cadre.e2e.ts e2e/synthese.e2e.ts e2e/export-corpus.e2e.ts e2e/parcours.e2e.ts e2e/multi-corpus.e2e.ts --project=local
```

Ajouter une suite dédiée à la nouvelle navigation, ainsi que les tests manquants de passage entre les outils d’analyse. Adapter les sélecteurs aux nouveaux parcours sans retirer les assertions métier existantes.

Pour tout test réel GitLab ou Nextcloud, appeler d’abord `preparer_bancs_docker` avec les seuls bancs nécessaires. Aucun téléchargement d’image, provisioning ou boucle de disponibilité maison. Le nom du projet Playwright ne suffit pas à garantir qu’un scénario n’utilise aucun serveur : vérifier les suites avant de les lancer.

### 7.2 Scénarios d’acceptation obligatoires

- Quatre entrées principales, avec une rubrique active identifiable ; plus de liste globale de tous les outils.
- Cas prend la place de Journal dans le corpus ; aucun nouvel onglet dans l’entretien.
- Cas n’est plus présenté comme un outil réservé à l’export.
- Ajout à un cas/recueil sans changement d’espace, sans perte de sélection ou doublon ; annulation sans écriture.
- Reprise d’un ajout après erreur et absence d’ouverture de destination avant réussite.
- Ouverture explicite du bon cas/recueil ; retour au bon entretien et au bon passage.
- Associations visibles à la demande, sans encombrer le texte ; distinction manuel/automatique et résolution des occurrences multiples d’un recueil.
- Correspondance correcte des associations pour une sélection exacte, partielle ou chevauchante ; aucun faux « aucune association » pendant le chargement ou après une erreur.
- Résumé actualisé après ajout, retrait, changement de règle ou actualisation distante ; consultation autorisée en lecture seule.
- Aller-retour analyse → source → analyse restaurant filtres, tri et position ; aller-retour entretien → cas/recueil → entretien restaurant le passage.
- Consultations imbriquées sans boucle ; destination supprimée traitée explicitement ; contexte conservé si le retour est refusé et vidé au changement de corpus.
- Édition en cours préservée lors d’un simple changement d’espace ; vraie fermeture respectant les contrôles existants.
- Échec de sauvegarde/publication ou refus de sortie : pas de navigation mensongère ni de perte de données.
- Fonctionnement local, consultation distante et édition distante autorisée ; capacités des documents cadre inchangées.
- Actualisation du panneau Cas après changements pertinents, avec résultat antérieur conservé si possible en cas d’échec.
- Changement de corpus sans sélection, demande d’ajout ou résultat asynchrone provenant du précédent.
- Journal du corpus encore accessible par son accès secondaire ; journal de l’entretien inchangé.
- Depuis Personnes, annulation d’un renommage et d’une association sans passer par l’ancien onglet Journal ; vérifier aussi dissociation, déplacement d’association et refus simple.
- Annulation Personnes devenue incompatible refusée sans écrasement ; aucune confusion avec une action récente de Notes ; limites de session et indisponibilité distante conservées.
- Exports et filtres d’analyse utilisant les cas inchangés ; exports contextuels toujours accessibles.
- Parcours guidés et raccourcis cohérents avec les nouvelles destinations.
- Parcours de préparation traversant Préparer et gérer puis Importer et traiter sans rupture du guidage ; ancres visibles et progression conservée.
- Navigation libre sans validation artificielle d’étape ni prérequis entre espaces ; reprise du guide distincte du retour à la consultation précédente.

## 8. Hors périmètre

- Nouveaux formats d’export ou modification de la représentation des cas pour les CAQDAS.
- Refonte des cas, de leurs règles, des attributs ou des recueils.
- Achèvement fonctionnel du journal.
- Création complète des futurs parcours pédagogiques d’analyse et de rédaction ; seule leur articulation avec la navigation est préparée ici.
- Modification des protocoles de sauvegarde, des droits ou des sessions distantes.
- Nouveau système de routage ou dépendance supplémentaire sans nécessité démontrée.

La réussite se mesure d’abord à la lisibilité des espaces et à la continuité du travail, pas au seul remplacement visuel de boutons.
