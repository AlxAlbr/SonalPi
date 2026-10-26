# Navigation par espaces de travail — plan d’exécution

Statut : terminé. Les quatre espaces, les ajouts ciblés, les filtres Cas,
les retours au contexte, le résumé des associations et la stabilisation finale
sont livrés. Cas et Recueils vivent dans **Organiser et exporter** ; l’entretien
reste monté lors des consultations et les parcours guidés conservent leurs acquis.

Livraison finale :

- un résumé repliable apparaît pour la sélection courante, sans marquage permanent
  du texte ; il distingue les ajouts manuels et les inclusions automatiques des cas ;
- la correspondance couvre les sélections exactes, incluses ou chevauchantes ;
  les repères et règles impossibles à vérifier produisent un bilan incomplet,
  jamais un faux « aucune association » ;
- un recueil n’apparaît qu’une fois et propose le choix de l’occurrence lorsqu’un
  même passage y figure plusieurs fois ; l’occurrence ouverte reçoit le focus ;
- le calcul reste ciblé sur l’entretien ouvert. L’inventaire des personnes est
  mis en cache et invalidé après modification ou tirage distant ;
- les noms des cas et recueils ouvrent une consultation liée et conservent le
  retour vers le passage sélectionné, y compris en lecture seule ;
- les raccourcis des panneaux masqués ne capturent plus l’écran actif ; le résumé,
  son focus et sa largeur ont été vérifiés à 760 px ;
- aides utilisateur, documentation développeur et plan sont actualisés.

Validation finale : typage et build réussis ; **225 tests ciblés réussis** sur
25 fichiers ; suite complète, **3247 tests réussis** sur 216 fichiers
(29 fichiers et 254 tests ignorés). **52 tests d’interface locaux réussis**,
dont le nouveau scénario `e2e/associations-passage.e2e.ts`, les quatre espaces,
les parcours guidés, les ajouts, retours, cas, recueils, exports et journaux.
La suite complète émet encore des avertissements Happy DOM lors de l’abandon de
chargements CSS externes, sans échec. Les contrôles d’accessibilité couvrent les
libellés, la structure, le focus et le clavier ; aucune session manuelle avec un
lecteur d’écran n’a été menée. Aucun banc distant réel n’a été utilisé ; les
protections distantes restent couvertes par les suites simulées existantes.

Réorganisation des composants réalisée séparément : les fichiers suivent les
espaces `preparer/`, `traiter/`, `analyser/` et `organiser/`. Seul `traiter/`
garde les vues `corpus/` et `entretien/` ; les composants partagés restent au
niveau commun le plus proche. Voir `src/renderer/components/README.md`.
Les 73 fichiers déplacés conservent templates, styles et logique ; seuls les
chemins d’import, les imports de tests et les références documentaires changent.
Les composables métier ne sont ni déplacés ni modifiés par cette réorganisation.

Validation de la réorganisation : référence de **302 tests réussis** sur 25 suites ;
typage et build réussis ; **494 tests ciblés réussis** sur 44 suites.
Recette locale : **103 tests d’interface réussis sur 104**. Le scénario
`e2e/themes-operations.e2e.ts` « la consultation conserve l’atelier… » échoue
lorsqu’il écrit directement après avoir fermé la session d’entretien.
Le même échec a été reproduit dans une copie de référence reconstituée à partir
de l’état exact précédant les déplacements. Il est laissé inchangé, hors du
périmètre structurel ; aucune protection de sauvegarde n’est assouplie.
Aucun banc distant réel utilisé. Cette réorganisation ne clôt pas les travaux
fonctionnels et de validation encore ouverts ci-dessous.

Cinquième incrément livré :

- Synthèse et Lexico ne proposent Cas qu’à partir d’une définition existante,
  même vide ; le premier cas ne sélectionne rien automatiquement et la disparition
  du dernier replie la dimension consultée sans effacer aucun filtre ;
- les bilans ordinaires de Synthèse ne demandent plus de cas sans cas créé ; une
  restriction visant un cas supprimé reste signalée, avec retrait explicite.
  Le bilan du résultat Synthèse conserve ses critères jusqu’au prochain calcul ;
- dialogues natifs ciblés pour les deux ajouts, avec rappel du passage,
  choix des destinations et création simple ; Recueils propose aussi l’emplacement ;
- annulation sans écriture, sélection capturée avant la prise de focus,
  confirmation sans quitter l’entretien et ouverture facultative de la destination ;
- états de reprise et identités de commande conservés après erreur, y compris
  une création simple de recueil dont la réponse a été perdue ; l’ajout ne change
  plus la sélection du gestionnaire complet caché ;
- les gestionnaires restent chacun uniques dans Organiser et exporter,
  chargés au premier accès ; les anciennes enveloppes `CasModale.vue` et
  `RecueilsModale.vue` sont supprimées ;
- pile de huit consultations au maximum, avec retour explicite vers le passage,
  le cas, le recueil ou l’analyse ; réglages de lecture et défilements restaurés,
  sans réinjecter de résultats métier ni recalculer une analyse automatiquement ;
- une navigation libre par les espaces ou les objets du répertoire termine la
  chaîne ; un retour refusé la conserve et un changement de corpus la vide ;
- la sélection d’un passage suit les corrections du texte pendant la consultation ;
  une suppression est signalée. Un cas, recueil ou entretien disparu n’est jamais
  remplacé silencieusement par un autre objet ;
- comportement audio conservé : quitter l’écran Entretien met en pause ; un
  retour ne relance jamais la lecture. La distinction masquage/fermeture sert
  au cycle de vie des données, pas à autoriser plusieurs espaces actifs.

Vérifications du cinquième incrément : référence avant modification,
**51 tests ciblés réussis** sur cinq suites. Typage et build réussis ;
**337 tests ciblés réussis** sur 32 suites et **51 tests d’interface locaux réussis**,
notamment les nouveaux `filtres-cas`, `ajouts-contextuels` et `retours-contextuels`.
Les tests couvrent le premier/dernier cas, les restrictions conservées,
l’annulation, le rejeu sans doublon, l’emplacement Recueils, le focus natif,
la largeur 760 px et la chaîne Lexico → passage → cas → passage → Lexico,
avec correction du texte et restauration de sa sélection.
Le refus de retour est couvert par le composable, pas par une nouvelle recette
serveur. Aucun banc distant réel utilisé ; la suite complète n’a pas été relancée.
Le résumé des associations et les recettes distantes restent hors de cet incrément.

Quatrième incrément livré (première partie du lot 4) :

- quatre entrées principales ; **Organiser et exporter** propose **Cas**,
  **Recueils** et **Exporter le corpus**, avec Cas au premier accès et mémorisation
  du dernier onglet pour le corpus ouvert ;
- Cas quitte le corpus, sans rétablir Journal ; le lanceur global Recueils et
  celui de l’export dans les onglets du corpus sont retirés ; l’accueil renvoie
  explicitement vers Cas et Recueils par les commandes communes ;
- `afficherCas(id?)` et `afficherRecueils(id?)` ouvrent les bonnes destinations
  sans fermer l’entretien ; le traitement conserve sa vue précédente et l’audio
  suit la pause commune, sans reprise automatique ;
- une seule instance de chaque gestionnaire, chargée au premier accès, conservée
  entre les onglets et partagée provisoirement avec sa fenêtre d’ajout contextuel ;
- l’entrée Exporter le corpus présente le lanceur du dialogue existant, sans
  modifier les formats, les contrôles ni les exports contextuels ;
- Recueils efface sélection, projections et ajout en attente au changement de
  corpus ; les réponses de lectures, de commandes ou de création de repère du
  précédent corpus ne remplissent pas le nouveau panneau ;
- retour dans la pseudonymisation simplement masquée sans relecture des choix
  non validés ; sa garde reste appliquée à un véritable changement d’onglet ;
- accès indirects de retour au corpus, menu et pas à pas réaccordés au quatrième
  espace ; documentation et références des plans voisins mises à jour.

Le résumé des associations et la stabilisation sont livrés dans la livraison finale.

Vérifications du quatrième incrément : référence avant modification,
**51 tests ciblés réussis** sur cinq suites ; après livraison, typage et build
réussis, **314 tests ciblés réussis** sur 27 suites et **47 tests d’interface
locaux réussis**. Couverture : quatre espaces, instance unique et filtres Cas,
sources modifiées, ajout contextuel Recueils, garde de pseudonymisation et
conservation des choix pendant le masquage, export texte/DOCX/QualCoder, journaux,
changement de corpus et pas à pas. Largeur de 760 px vérifiée par le scénario Cas.
Aucun banc distant réel utilisé et aucune suite complète relancée dans cet
incrément ; les résultats de suite complète ci-dessous restent historiques.
Les dialogues ciblés d’ajout, les retours contextuels et le masquage des critères
Cas sans cas créé ne font pas partie de cette validation.

Troisième incrément livré (lot 2) :

- **Importer et traiter / Corpus / Cas** remplace Journal, sans ajouter d’onglet ;
  Cas occupe toute la largeur et son lanceur global disparaît ;
- navigation du corpus typée et mémorisée dans `useEspacesTravail.ts` ; la vue
  Corpus enregistre sa commande d’ouverture pour garder la protection de sortie
  de la pseudonymisation, y compris lors d’une ouverture programmée ;
- familles, lots, attributs, mémos, filtres et ouverture des sources conservés ;
  chargement au premier accès, actualisation au retour et après un changement
  pertinent ou un tirage distant ; les erreurs gardent les projections précédentes
  et les réponses d’un ancien corpus sont ignorées ;
- une seule instance de `CasCorpus.vue`, déplacée par Teleport entre l’onglet
  et la fenêtre d’association provisoire ; filtres et brouillons conservés,
  instance réinitialisée au changement de corpus ;
- **Historique des actions…** sous les onglets ouvre le journal existant en
  dialogue ; **Personnes / Annuler une modification…** présente seulement les
  entrées Personnes, avec les mêmes restrictions et actualisations après annulation ;
  Échap ferme le dialogue et le focus revient à la commande d’ouverture ;
- après sauvegarde d’un entretien, reprojeter les matériaux sans relire les
  personnes : cette lecture appelle elle-même la sauvegarde et créerait une boucle ;
- `afficherCas(id?)` prépare une ouverture directe, en fermant réellement
  l’entretien et en refusant toute sortie ayant échoué ; son utilisation depuis
  une confirmation d’association reste à brancher dans le lot suivant ;
- documentation mise à jour : `docs/user/cas.md`, `docs/user/vue-corpus.md`,
  `docs/dev/cas.md` et `synthese-corpus-onglets.md`.

Vérifications du troisième incrément : référence avant modification, **144 tests**
ciblés réussis ; après livraison, typage et build réussis, **153 tests ciblés**
réussis sur 14 suites ; suite complète, **3220 tests réussis** sur 210 fichiers
(29 fichiers et 254 tests ignorés). **53 tests d’interface locaux** réussis,
notamment `e2e/cas-navigation.e2e.ts` (filtres, source modifiée, largeur 760 px et
changement de corpus), le refus de quitter la pseudonymisation dans
`e2e/anonymisation.e2e.ts` et les annulations Personnes/Notes. Aucun banc distant
réel utilisé ; la consultation distante est couverte ici par le test du panneau
et ses restrictions, pas par une nouvelle recette serveur.

Stabilisation de l'architecture après les deux premiers incréments :

- la visibilité des panneaux dépend uniquement de la navigation ; les indicateurs
  utilisés par le guidage et le clavier sont dérivés et en lecture seule ;
- les composables métier ne gèrent plus l'affichage ou la fermeture des anciens
  panneaux-modales ; seules les fenêtres Cas et Recueils gardent leur fermeture mutuelle ;
- la barre, les onglets et le guidage passent par les mêmes commandes d'ouverture ;
  les documents sont relus à chaque accès et Lexico recharge seulement un index
  absent ou périmé, sans effacer le contexte des outils quittés ;
- les panneaux de préparation restent montés entre les onglets ; les deux espaces
  sont remontés au changement de corpus pour effacer leurs états locaux ;
- régressions : `test/espacesTravail.test.ts`, `test/docsCadreRenderer.test.ts`,
  `test/tableaubordRenderer.test.ts` et `e2e/espaces-contexte.e2e.ts` ; les helpers
  d'e2e ne recliquent plus sur le sous-onglet déjà repris par la barre.

Deuxième incrément livré :

- espace `analyser/AnalyserInterpreter.vue` : onglets **Synthèse**, **Lexico** et
  **Analyses croisées** en haut de la colonne de gauche, filtres de l'outil actif
  dessous, résultats à droite ; ordre et onglet par défaut arrêtés sur Synthèse ;
- parties gauche et droite inversées pour Lexico et Synthèse, inchangées pour
  Analyses croisées qui avait déjà sa configuration à gauche ;
- « Masquer les filtres » est commun à l'espace : la colonne se réduit à un rail
  d'onglets, toujours accessible ;
- les trois fenêtres (`LexicoModale`, `SyntheseModale`, `AnalysesCroiseesModale`)
  sont remplacées par six panneaux (`SyntheseCote`, `SynthesePanneau`,
  `LexicoCote`, `LexicoPanneau`, `AnalysesCote`, `AnalysesPanneau`) ; les boutons
  correspondants de la barre et les fermetures mutuelles entre analyses
  disparaissent ;
- la dimension de filtres choisie rejoint les composables, qui la réinitialisent
  avec le corpus ; les autres réglages d'affichage restent dans les panneaux,
  montés en `v-show` pour survivre à un changement d'onglet ;
- « Afficher dans Synthèse » depuis une cellule bascule sur l'onglet Synthèse avec
  ses critères préremplis ; ouvrir une source (concordance, extrait, passage)
  mène au traitement, puis l'espace reprend son onglet et ses résultats ;
- `afficherCas` et `afficherRecueils` reviennent d'abord au traitement depuis
  les deux espaces, et non plus depuis la préparation seule ;
- tests : `test/espacesTravail.test.ts`, `e2e/espaces.e2e.ts`,
  `e2e/synthese.e2e.ts`, helper `ouvrirAnalyse` dans `e2e/util.ts`.

Vérifications exécutées : `npm run typecheck` et `npm run build` sans erreur ;
`npm test` — 209 fichiers et 3202 tests réussis (29 fichiers et 254 tests
ignorés) ;
la liste d'e2e de la section 7.1 complétée par `e2e/espaces.e2e.ts` — **33 tests
réussis** sur le projet `local`.

Vérification de la stabilisation : typage et build réussis ; **295 tests unitaires**
réussis sur 25 suites (espaces, documents cadre, tableau de bord, analyses, cas,
recueils, journal et parcours) ; **43 tests d'interface** réussis sur `local`
(espaces, espaces-contexte, docs-cadre, tableaubord, synthese, preparation-pas-a-pas,
navigation, cas, casLots, casFamilles, casAttributs, recueils, journal-corpus, journal,
export-corpus, parcours, multi-corpus et pas-a-pas). Aucun banc distant réel utilisé.

Premier incrément livré :

- état de navigation typé (`composables/espaces.ts`, `useEspacesTravail.ts`) distinct
  de la vue de traitement ; l'entretien ouvert reste monté quand on consulte la
  préparation, l'audio se met en pause, et **Importer et traiter** y revient ;
- barre principale à deux entrées ; les cinq outils restants ouvrent encore leur
  fenêtre et basculent d'abord sur le traitement ;
- espace `preparer/PreparerSuivre.vue` : onglets **Tableau de bord** et
  **Documents cadre** à gauche, contenu à droite ;
- tableau de bord scindé : cartes Badges/Ligne/Colonne à gauche
  (`corpus/PanneauTableauBord.vue`), grille à droite (`corpus/TableauBord.vue`) ;
- documents cadre scindés : listes (`corpus/DocsCadreCote.vue`) et aperçu
  (`corpus/DocsCadrePanneau.vue`) ; les deux modales d'origine sont supprimées ;
- guidage de préparation et déposer de fichiers réaccordés aux nouveaux ancres ;
- tests : `test/espacesTravail.test.ts`, `e2e/espaces.e2e.ts`, mises à jour de
  `tableaubord`, `docs-cadre`, `preparation-pas-a-pas`, `pas-a-pas`.

Le chantier est clos. Les entrées, le résumé et le comportement à fenêtre étroite
sont couverts par les recettes locales ; aucune donnée métier ni nouveau parcours
pédagogique n’a été ajouté hors du périmètre prévu.

## 1. Objectif et décisions retenues

Remplacer les nombreux lanceurs de la barre supérieure par quatre entrées lisibles :

| Entrée principale | Contenu |
| --- | --- |
| **Préparer et suivre** | Tableau de bord ; Documents cadre. |
| **Importer et traiter** | Organisation existante à deux niveaux : Corpus / Entretien ; sans onglet Cas ni Recueils. |
| **Analyser et interpréter** | Synthèse ; Lexico ; Analyses croisées ; filtres Cas visibles seulement si des cas existent. |
| **Organiser et exporter** | Cas ; Recueils ; Exporter le corpus. |

Ce sont des espaces de travail, pas un parcours obligatoire. On peut passer de l’un à l’autre pendant la recherche.

Décisions complémentaires :

- **Cas et Recueils sont regroupés dans Organiser et exporter**. Cas quitte les onglets du corpus ; Journal n’y revient pas. La barre d’Importer et traiter est allégée, sans nouvel onglet Recueils.
- Cas ne devient pas un nouvel onglet dans l’entretien, ni un panneau latéral supplémentaire.
- Les cas ne sont pas réservés à l’export CAQDAS : ils servent aussi à organiser les matériaux et peuvent être utilisés dans les analyses.
- Recueils reste un outil de composition de documents ; Cas rassemble les matériaux d’une unité étudiée. Leur regroupement ne les réserve ni à une étape finale ni à l’export.
- Au bas de l’accueil d’Importer et traiter, afficher : **« Retrouvez les fonctionnalités Cas et Recueils dans l’espace Organiser et exporter. »** Proposer des liens explicites vers les deux destinations, par les commandes de navigation communes.
- Dans Analyser et interpréter, ne pas exposer de rubrique ou filtre Cas tant qu’aucun cas n’a été créé ; les analyses ordinaires restent entièrement utilisables sans cas.
- Depuis l’entretien, conserver les actions contextuelles **Ajouter à un cas…** et **Ajouter à un recueil…**.
- Un ajout contextuel ne doit pas faire quitter automatiquement l’entretien. L’ouverture de la destination reste un choix explicite.
- Retirer Journal de la barre du corpus ne supprime ni l’historique, ni les commandes d’annulation, ni le journal propre à l’entretien.
- **Priorité : rendre visibles les associations aux cas et aux recueils depuis le passage consulté**, sans encombrer le texte.
- **Priorité : permettre le retour au travail précédent**, à sa position et avec ses filtres, après consultation d’une source ou d’un objet lié.
- Articuler les espaces avec les parcours du pas à pas déjà amorcés, sans transformer la navigation libre en suite d’étapes obligatoires.

## 2. Choix à confirmer avant le code

Le nom **Organiser et exporter**, son contenu et le masquage des filtres Cas
sans cas créé sont arrêtés. Les propositions restantes ci-dessous précisent
la présentation et les transitions à valider avant leur implémentation.

### 2.1 Présentation des espaces

Cible proposée : une barre principale de quatre entrées et, pour l’espace actif, une navigation secondaire. Les outils s’affichent dans la zone de travail ; les quatre entrées ne sont pas seulement des menus lançant les anciennes grandes modales.

Dans Importer et traiter, conserver le niveau Corpus / Entretien et les onglets de traitement, en retirant l’onglet Cas livré provisoirement. Ne pas le remplacer par Recueils ou Journal. Organiser et exporter propose une navigation secondaire **Cas / Recueils / Exporter le corpus**. Éviter d’ajouter une nouvelle rangée redondante de navigation. Le fil d’Ariane doit distinguer l’accueil général, le corpus ouvert et le contexte de traitement, sans prétendre qu’un entretien est la page active lorsque l’on consulte une analyse.

À arbitrer sur une maquette : largeur des intitulés, retour au traitement, affichage du contexte d’entretien depuis les autres espaces et comportement sur une fenêtre étroite.

### 2.2 Entrée et retour dans un espace

Proposition :

- à l’ouverture d’un corpus, afficher Importer et traiter / Corpus / Accueil ;
- au premier accès aux autres espaces, afficher l’Accueil de préparation déjà livré et Synthèse ; pour Organiser et exporter, proposer Cas comme onglet initial ;
- mémoriser ensuite le dernier sous-espace visité pendant l’ouverture de ce corpus ;
- entrer dans Organiser et exporter par la barre ou par un objet lié masque l’entretien sans le fermer, comme les autres espaces ; conserver le contexte et appliquer le comportement audio commun ;
- revenir dans Importer et traiter au contexte précédent, sans rouvrir un entretien qui a été explicitement fermé ;
- réinitialiser les destinations, sélections et requêtes en attente lors d’un changement de corpus ;
- ne pas persister cette navigation dans les fichiers métier.

### 2.3 Accès secondaire au journal du corpus

Proposition à valider : une commande discrète **Historique des actions…**, dans les actions du corpus, ouvre le panneau existant en dialogue. Il ne faut pas rendre les annulations actuellement accessibles introuvables.

Le retrait concerne l’onglet du corpus uniquement. **Le journal de l’entretien reste inchangé.** Ne pas entreprendre une refonte ou une extension du moteur du journal dans ce chantier.

Préserver aussi un retour arrière directement accessible depuis **Personnes**, sans imposer d’ouvrir un autre outil après une correction. Proposition : une commande **Annuler une modification…** donnant accès aux actions récentes d’origine Personnes, avec leur libellé et leur état d’annulabilité. Une action immédiate après une modification peut compléter cet accès, mais ne doit jamais annuler implicitement la dernière action globale d’un autre outil. Le choix visuel reste à maquetter.

Cette interface réutilise les entrées et contrôles du journal existant. Elle ne promet pas que toutes les opérations Personnes sont annulables et ne crée pas une annulation distante actuellement absente. L’accès secondaire général conserve les autres opérations prises en charge, notamment celles des notes.

### 2.4 Portée de l’entrée Exporter le corpus

Dans Organiser et exporter, **Exporter le corpus** devient le point d’accès
principal au parcours d’export existant. Déplacer son lanceur depuis la barre
du corpus ; réutiliser les choix de portée, contrôles et dialogues actuels.
Il n’est pas nécessaire de réécrire l’assistant ni de créer une nouvelle
interface d’export pour lui donner cette place.

Conserver les exports contextuels de l’entretien, des recueils et des analyses,
ainsi que les accès du menu et du clavier utiles. Un export d’entretien ne doit
pas être présenté comme un export du corpus. Ne pas inventer de nouveaux formats
ni une composition multi-analyses pour remplir cette rubrique.

### 2.5 Ne montrer les filtres Cas que lorsqu’ils sont utiles

Dans les outils d’Analyser et interpréter qui proposent déjà cette dimension
(actuellement Synthèse et Lexico), masquer l’onglet de critères **Cas** lorsque
le corpus ne contient aucun cas créé. Ne pas ajouter une dimension Cas à un
outil qui n’en possède pas. Adapter aussi les aides et bilans ordinaires :
sans cas et sans filtre Cas, ne pas mentionner des cas à choisir ou à créer
pour pouvoir poursuivre l’analyse.

- Déterminer la présence de cas depuis leurs définitions dans le corpus, et non
  depuis le nombre de passages projetés, la recherche ou les familles affichées.
  Un cas manuel vide compte comme un cas existant.
- L’espace Organiser et exporter et son onglet Cas restent toujours accessibles,
  même sans cas, pour permettre leur découverte et leur création.
- Après la création du premier cas, rendre le filtre disponible au retour dans
  les analyses, sans l’ouvrir, le sélectionner ni l’appliquer automatiquement.
- Après la suppression du dernier cas, masquer cette entrée ; si le panneau de
  critères Cas était consulté, revenir à une dimension disponible sans modifier
  les autres filtres ni lancer automatiquement un calcul.
- Si des critères mémorisés désignent des cas supprimés, ne pas cacher une
  restriction encore appliquée ni élargir silencieusement l’analyse. Conserver
  un avertissement visible dans le bilan et permettre de retirer explicitement
  ce filtre, en respectant les diagnostics existants.
- Suivre les créations, suppressions, actualisations distantes et changements
  de corpus. Ne pas confondre données non encore chargées ou erreur de lecture
  avec absence de cas.

## 3. État technique constaté

### 3.1 Coquille et navigation

- `src/renderer/components/app/BarreOutils.vue` contient les lanceurs actuels.
- `src/renderer/App.vue` héberge Corpus et Entretien avec `v-show`, ainsi que les grandes modales métier.
- `src/renderer/composables/sonal.ts` assemble les outils, leurs fermetures mutuelles, les retours aux sources et la navigation guidée.
- `src/renderer/composables/corpus/useCycleCorpus.ts` gère le cycle du corpus et de l’entretien.
- `src/renderer/components/traiter/corpus/Corpus.vue` portait initialement l’état local des onglets, dont Journal. Cet état typé appartient à `useEspacesTravail.ts` ; Cas et Recueils vivent désormais dans `organiser/OrganiserExporter.vue`, Journal conserve son dialogue secondaire. La protection de sortie de la pseudonymisation reste appliquée par Corpus.

**Point critique : `retourCorpus()` ferme réellement l’entretien**, avec les opérations de sauvegarde et de session associées. Il ne suffit donc pas de l’appeler pour masquer l’entretien et afficher un autre espace.

### 3.2 Outils réutilisables

- Cas : `components/organiser/cas/CasCorpus.vue`, `components/organiser/cas/DialogueAjoutCas.vue`, `composables/corpus/useCasCorpus.ts`.
- Recueils : `components/organiser/recueils/RecueilsCorpus.vue`, `components/organiser/recueils/DialogueAjoutRecueil.vue`, `composables/corpus/useRecueilsCorpus.ts`.
- Retours : `composables/useRetoursContextuels.ts`, `useContextesPanneaux.ts`, `contexteVisuel.ts` et l’orchestration de `sonal.ts`.
- Préparation : `components/preparer/tableau-bord/` et `components/preparer/documents-cadre/`, avec leurs composables existants.
- Analyses : `components/analyser/synthese/` (`SyntheseCote.vue`, `SynthesePanneau.vue`),
  `components/analyser/lexico/` (`LexicoCote.vue`, `LexicoPanneau.vue`),
  `components/analyser/analyses-croisees/` (`AnalysesCote.vue`, `AnalysesPanneau.vue`) et leurs
  composables ; les trois enveloppes modales d'origine sont supprimées.
- Exports : `components/organiser/export/ModaleExportCorpus.vue`, `components/traiter/entretien/ModaleExportEntretien.vue`, `export/` et les exports propres aux outils.

Les chemins de cette liste sont relatifs à `src/renderer/`, sauf indication contraire. Les composants d’analyse peuvent nécessiter une extraction du contenu hors de leur enveloppe modale : ne pas supposer qu’un panneau autonome existe déjà.

### 3.3 Ajout de passages

Dans `components/traiter/entretien/Entretien.vue`, le menu contextuel appelle actuellement `afficherCasPourAssociation()` ou `afficherRecueilsPourAssociation()`.

- Pour les cas, une sélection est capturée lors de l’ouverture de l’association.
- Pour les recueils aussi, la sélection est capturée à l’ouverture du dialogue ; `enregistrerRepereSelection(attendu)` la vérifie au moment de confirmer, sans créer de repère en cas d’annulation.
- Les deux parcours disposent d’états d’ajout en attente : les conserver pour permettre une reprise après échec sans doublon.
- Les contenus restent référencés par entretien et repère. Aucun déplacement ou copie des passages n’est nécessaire.

### 3.4 Travaux voisins

Le répertoire de travail comporte déjà des modifications, notamment sur `App.vue`, `BarreOutils.vue`, `sonal.ts`, le cycle du corpus et les analyses. Ne pas les écraser ni revenir à une ancienne version de ces fichiers.

Relire avant exécution les plans actifs sur la synthèse, le lexico, les analyses croisées et les exports. La référence `plans/encours/synthese-corpus-onglets.md` a été mise à jour à la livraison de Cas : elle distingue actuellement l’onglet Cas de l’accès secondaire au journal. La référence, les plans d’analyse, d’export et les guides ont été actualisés au déplacement vers Organiser et exporter. La visibilité conditionnelle dans les analyses, les dialogues et les retours sont désormais décrits comme livrés.

### 3.5 Pas à pas : un découpage déjà amorcé

- `src/renderer/composables/parcours/catalogue.ts` ordonne les parcours de préparation et de traitement, sans prérequis entre eux ; l’analyse y est annoncée à venir.
- `src/renderer/composables/parcours/preparation.ts` définit « Préparer son terrain » : tableau de bord, documents du projet, entretien préparatoire et note de préparation.
- `src/renderer/composables/parcours/types.ts` décrit les destinations et les surfaces du guide ; une étape est validée par l’état métier, pas par le seul clic.
- `src/renderer/composables/parcours/presentation.ts` calcule les progressions et recommande le parcours suivant sans confondre leurs acquis.

Le rapprochement est donc une continuité de l’existant, pas la création d’une méthode entièrement nouvelle. Il n’est pas strictement univoque : le parcours de préparation utilise déjà des fonctions du corpus et de l’entretien, qui resteront dans Importer et traiter.

### 3.6 Annulation des modifications de personnes : vérification effectuée

La lecture de `src/main/corpusStore.ts`, `src/renderer/composables/corpus/useJournalCorpus.ts` et `src/renderer/components/traiter/corpus/PanneauJournalCorpus.vue` confirme un fonctionnement existant, pas seulement une intention :

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

Organiser et exporter → Cas devient la destination de gestion, en remplacement
de l’accès provisoire Importer et traiter → Corpus → Cas. L’historique des actions
conserve son accès secondaire dans le corpus.

Le panneau donne accès à l’ensemble des fonctions existantes : création individuelle
et par lots, familles, règles, matériaux, mémos, attributs et retour aux sources.
Conserver la largeur de travail disponible et les états déjà mémorisés. L’accueil
d’Importer et traiter renvoie vers Cas et Recueils dans le nouvel espace.

### B. Ajouter un passage à un cas

1. Dans l’entretien, sélectionner un passage/une annotation et choisir Ajouter à un cas…
2. Ouvrir un dialogue ciblé : rappel du passage, choix d’un ou plusieurs cas et création simple si nécessaire.
3. Confirmer ; rester dans l’entretien, à la même position.
4. Afficher une confirmation courte avec une action explicite pour ouvrir un cas. Si plusieurs cas sont concernés, permettre de choisir la destination.
5. En cas d’annulation, ne rien ajouter. En cas d’échec, préserver la demande pour réessayer sans doublon.

L’ouverture explicite du cas mène à **Organiser et exporter / Cas** et sélectionne
le bon cas. Ce changement d’espace conserve l’entretien ouvert et son contexte ;
il ne doit plus appeler `retourCorpus()` pour fermer l’entretien. Préserver les
protections pertinentes des panneaux quittés, sans forcer une sortie refusée.

### C. Ajouter un passage à un recueil

Même principe, avec choix du recueil et de l’emplacement. La création simple d’un recueil peut rester accessible.

Après réussite, proposer Ouvrir le recueil, sans y naviguer automatiquement. L’ouverture explicite mène à **Organiser et exporter / Recueils**, conserve l’entretien ouvert et sélectionne le bon document.

Tester particulièrement le maintien de la sélection malgré la prise de focus par le dialogue et la création différée du repère.

### D. Revenir au matériau source

Depuis un cas, un recueil ou une analyse, ouvrir le bon entretien et le bon passage dans Importer et traiter. Maintenir les protections de changement d’entretien.

Proposer ensuite une action contextualisée, par exemple **Revenir au recueil « Entrée dans le métier »** ou **Revenir à la synthèse**. Elle restitue l’objet, les filtres, le tri et la position de lecture précédents, pas seulement l’espace général. Le même mécanisme permet de revenir au passage de départ après ouverture explicite d’un cas ou d’un recueil depuis l’entretien.

### E. Préparer, suivre et exporter

Préparer et suivre expose Tableau de bord et Documents cadre, avec les capacités d’accès actuelles. Les parcours guidés qui les ouvrent doivent aboutir dans le nouvel espace.

Organiser et exporter expose **Cas**, **Recueils** et **Exporter le corpus**.
Les cas restent des outils d’organisation et d’analyse, y compris sans projet
d’export CAQDAS. L’entrée d’export réutilise le parcours existant ; les exports
propres à l’entretien, aux recueils et aux analyses restent accessibles dans
leur contexte.

### F. Voir les associations du passage consulté

Depuis une annotation ou un passage sélectionné, rendre accessible un résumé discret, par exemple :

> Cas : Enseignants débutants · Recueils : Entrée dans le métier

Le placement exact reste à maquetter : zone contextuelle existante ou détail dépliable, sans nouvel onglet ni marquage permanent de tout le texte. Les noms ouvrent les objets correspondants et enregistrent le contexte permettant de revenir au passage.

Pour les cas, préciser si le passage est ajouté manuellement ou inclus automatiquement. Une inclusion automatique ne doit pas être présentée comme un rattachement supprimable d’un clic. Pour les recueils, ouvrir l’occurrence pertinente ou proposer un choix lorsqu’il y en a plusieurs.

### G. Faire correspondre navigation et pas à pas

Utiliser les mêmes repères de vocabulaire et les mêmes destinations pour le travail libre et le guidage :

| Parcours pédagogique | Espace de référence | Articulation |
| --- | --- | --- |
| Préparer son terrain, existant | Préparer et suivre | Conserver les étapes qui passent par le corpus et l’entretien. |
| Traitement, existant | Importer et traiter | Adapter ses cibles à la navigation réorganisée, sans perdre les acquis. |
| Analyse, annoncée à venir | Analyser et interpréter | Prévoir sa place et ses destinations ; son contenu pédagogique reste un chantier distinct. |
| Organisation/restitution, éventuel | Organiser et exporter | Piste future, pas un parcours existant à annoncer comme disponible. |

Le pas à pas explique une démarche ; les espaces donnent accès aux outils. Un parcours peut donc traverser plusieurs espaces. Terminer une étape ou un parcours ne verrouille ni ne débloque l’accès aux rubriques.

Prévoir un accès contextuel pour reprendre un parcours disponible, sans multiplier les barres de progression ni afficher un guidage permanent hors du mode concerné. Conserver une distinction claire entre **Reprendre le pas à pas** et **Revenir à mon travail précédent** : l’une reprend une étape pédagogique, l’autre une consultation libre.

## 6. Exécution par lots

### Lot 0 — Valider la navigation et établir la référence

- [x] Confirmer les propositions de la section 2 et le comportement audio/session de la section 4.
- [x] Maquetter les quatre espaces, les entrées Cas / Recueils / Exporter le corpus dans Organiser et exporter, les deux dialogues d’ajout, le résumé des associations et l’action de retour au contexte précédent.
- [x] Définir la correspondance entre passage sélectionné et associations, ainsi que le comportement des consultations imbriquées.
- [x] Cartographier les étapes actuelles du pas à pas vers leurs espaces et destinations, y compris celles qui traversent plusieurs espaces ; préserver les identifiants et acquis existants.
- [x] Inventorier les entrées indirectes : menu applicatif, raccourcis, guidage, retours aux sources, exports, tests et documentation.
- [x] Relever l’état des tests ciblés avant modification et distinguer les échecs préexistants.

Sortie attendue : destinations et transitions définies, sans ambiguïté entre masquage et fermeture d’entretien.

### Lot 1 — Poser la navigation commune

- [x] Créer l’état typé de navigation et les actions de destination, intégrés à l’orchestration existante.
- [x] Remplacer la barre actuelle par les quatre entrées ; adapter le fil d’Ariane, l’accueil général et la réinitialisation par corpus.
- [x] Préserver l’éditeur et les brouillons ; appliquer les protections avant de valider une transition.
- [x] Ajouter le mécanisme de mémorisation/restauration du contexte et la pile bornée des consultations liées, avec réinitialisation par corpus.
- [x] Ajouter les premiers tests de changement d’espace, retour au traitement, consultations imbriquées et refus de sortie.

Les anciennes enveloppes peuvent subsister temporairement pendant les lots suivants, mais ce n’est pas l’interface finale.

### Lot 2 — Installer Cas dans le corpus (incrément livré)

Ce lot décrit l’étape déjà réalisée. La décision révisée déplace Cas vers
Organiser et exporter dans le lot 4 ; les acquis métier, l’accès à l’historique
et les annulations Personnes restent à préserver.

- [x] Remplacer l’onglet Journal par Cas dans `Corpus.vue`, ses types, son titre et sa présentation.
- [x] Adapter l’initialisation et l’actualisation de `CasCorpus.vue` à son intégration comme panneau.
- [x] Préserver les fonctions de familles, lots, attributs et ouverture des sources.
- [x] Déplacer l’accès au journal vers la commande secondaire validée, sans supprimer son moteur ni toucher au journal de l’entretien.
- [x] Ajouter dans Personnes l’accès aux annulations prises en charge, avec libellé explicite, restrictions existantes et actualisation des projections après succès.
- [x] Préparer l’ouverture directe d’un cas depuis les autres parcours.

### Lot 3 — Séparer les ajouts contextuels de la gestion complète

- [x] Extraire les dialogues ciblés d’association aux cas et d’ajout aux recueils.
- [x] Préserver les références source, contrôles d’écriture et états de reprise existants.
- [x] Maintenir le focus, la sélection et la position dans l’entretien après ajout ou annulation.
- [x] Ajouter les confirmations et ouvertures explicites vers Organiser et exporter / Cas ou Recueils, sans fermer l’entretien, avec retour au passage de départ.
- [x] Construire le résumé des associations sur les références et projections existantes ; couvrir les inclusions automatiques, les rattachements manuels, les occurrences multiples et les résultats incomplets.
- [x] Actualiser ce résumé après les mutations pertinentes sans recalculer tout le corpus à chaque mouvement de sélection.
- [x] Supprimer l’ancienne grande modale Cas une fois tous ses accès remplacés.

### Lot 4 — Installer les autres espaces

- [x] Intégrer Tableau de bord et Documents cadre dans Préparer et suivre.
- [x] Intégrer Synthèse, Lexico et Analyses croisées dans Analyser et interpréter :
  onglets à gauche, filtres de l’outil actif dessous, résultats à droite ; filtres
  et liens entre outils conservés.
- [x] Créer Organiser et exporter avec les entrées Cas, Recueils et Exporter le corpus ; mémoriser son dernier onglet pour le corpus courant.
- [x] Déplacer Cas depuis le corpus et intégrer Recueils dans ce nouvel espace, sans double instance de gestion ni perte de fonctionnalités ; supprimer le lanceur global Recueils.
- [x] Réorienter `afficherCas(id?)`, l’ouverture d’un recueil et les accès indirects vers le nouvel espace ; retirer la fermeture d’entretien liée à l’ancienne destination Corpus / Cas.
- [x] Déplacer l’accès principal Exporter le corpus dans ce nouvel espace, en réutilisant le parcours existant et en conservant les exports contextuels.
- [x] Retirer l’onglet Cas de la barre du corpus sans rétablir Journal ; ajouter au bas de son accueil le renvoi explicite vers Cas et Recueils dans Organiser et exporter.
- [x] Masquer les filtres Cas dans Synthèse et Lexico sans cas créé ; adapter les aides, les bilans et le repli de la dimension consultée, sans modifier silencieusement les critères.
- [x] Extraire les contenus réutilisables des modales d’analyse ; Cas et Recueils
  gardent chacun leur unique gestionnaire dans l’espace d’organisation,
  distinct des dialogues d’ajout ciblés.
- [x] Remplacer les fenêtres de gestion par la navigation commune ; les deux dialogues ciblés d’ajout restent exclusifs, sans fermeture de l’entretien. Conserver les vrais dialogues de confirmation, d’édition ou d’export.
- [x] Brancher les cas, recueils et analyses au retour contextuel : sélection, filtres, tri et position de lecture.
- [x] Adapter la navigation guidée et toutes les ouvertures programmatiques ; réviser les surfaces, ancres et textes des étapes existantes.
- [x] Préserver la progression du pas à pas et sa validation métier ; rendre sa reprise cohérente avec les espaces sans créer implicitement les parcours encore absents.

### Lot 5 — Stabiliser et documenter

- [x] Vérifier largeur réduite, défilement, hauteur de l’en-tête, focus, clavier et lecteurs d’écran.
- [x] Garantir que les panneaux cachés ne prennent pas le focus et que leurs raccourcis ne capturent pas les actions de l’écran actif.
- [x] Mettre à jour les aides, visites guidées, captures et documentation des onglets.
- [x] Retirer les états, styles et enveloppes devenus inutiles après vérification des appels restants.
- [x] Exécuter la validation ci-dessous et consigner les résultats réels.

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
- Organiser et exporter regroupe Cas, Recueils et Exporter le corpus ; Cas et Recueils ne figurent plus dans la barre du corpus, sans rétablissement de Journal ni nouvel onglet dans l’entretien.
- L’accueil d’Importer et traiter indique en bas où retrouver Cas et Recueils ; ses liens ouvrent les bonnes destinations dans Organiser et exporter.
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
- Sans cas créé, aucun onglet de critères Cas ni aide ordinaire invitant à choisir des cas dans les analyses ; Synthèse et Lexico restent utilisables avec les autres critères.
- Création du premier cas, y compris vide : filtre Cas disponible sans sélection automatique ; suppression du dernier : entrée masquée, panneau de critères consulté replié vers une dimension disponible.
- Critères mémorisés visant des cas supprimés : restriction et diagnostic restent visibles dans le bilan avec une action explicite de retrait ; aucun élargissement silencieux de l’analyse.
- Visibilité Cas mise à jour après tirage distant et changement de corpus ; chargement ou erreur ne sont pas interprétés comme une absence confirmée de cas.
- Sémantique des exports et des filtres d’analyse utilisant les cas inchangée ; exports contextuels toujours accessibles et entrée Exporter le corpus réutilisant le parcours existant.
- Parcours guidés et raccourcis cohérents avec les nouvelles destinations.
- Parcours de préparation traversant Préparer et suivre puis Importer et traiter sans rupture du guidage ; ancres visibles et progression conservée.
- Navigation libre sans validation artificielle d’étape ni prérequis entre espaces ; reprise du guide distincte du retour à la consultation précédente.

## 8. Hors périmètre

- Nouveaux formats d’export ou modification de la représentation des cas pour les CAQDAS.
- Refonte des cas, de leurs règles, des attributs ou des recueils.
- Achèvement fonctionnel du journal.
- Création complète des futurs parcours pédagogiques d’analyse et de rédaction ; seule leur articulation avec la navigation est préparée ici.
- Modification des protocoles de sauvegarde, des droits ou des sessions distantes.
- Nouveau système de routage ou dépendance supplémentaire sans nécessité démontrée.

La réussite se mesure d’abord à la lisibilité des espaces et à la continuité du travail, pas au seul remplacement visuel de boutons.
