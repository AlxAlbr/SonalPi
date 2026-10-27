# Parcours guidés — repères développeur

Le guide accompagne des actions réelles sur un corpus d’apprentissage. Il ne
simule pas les outils et ne remplace pas leurs commandes métier. Une étape est
validée par le résultat observé, jamais par le seul clic sur un bouton.
L’installation du corpus est décrite dans [corpus exemples](exemples.md).

## Trois états à ne pas confondre

| État | Rôle et durée |
|---|---|
| Catalogue ouvert | Choix d’un parcours et consultation de sa progression ; ne change pas le corpus courant. |
| Acquis du parcours | Étapes validées et contexte minimal, persistés dans `corpus.json.demo.parcours`. |
| Étape active | Accompagnement en cours, en mémoire ; activé par une demande explicite, pas par une simple ouverture. |

`dernierParcoursId` mémorise un parcours, pas une étape active. Ouvrir le corpus
ou le catalogue ne redémarre donc aucun exercice. Consulter le catalogue ne ferme
pas l’entretien et ne crée aucun dossier ; le profil peut seulement initialiser
sa mémoire ou rattacher des travaux reconnus.

`useExemples` prépare la demande de lancement, ouvre ou installe le corpus, puis
active l’étape choisie. **Continuer** cherche la prochaine étape accessible après
relecture des acquis ; un choix explicite d’étape reste ce choix, sous réserve
de ses prérequis.

## Définition et validation d’une étape

Les contrats sont dans `src/renderer/composables/parcours/types.ts`.
Une `DefinitionParcours` porte ses étapes, son titre et sa disponibilité.
Chaque `EtapePasAPas` décrit notamment :

- `cible()` et `texte()` : élément à montrer et consigne selon l’état de l’interface ;
- `fait()` : condition métier réellement observée ;
- `requiere` : prérequis éventuel, limité au même parcours ;
- `fini()` et `retest()` : bilan d’une première réussite ou d’une étape déjà acquise ;
- `panneauSur` et `vueFin` : surface d’accompagnement et vue où rester après réussite.

`useGuide` observe la condition de l’étape active, enregistre les acquis et affiche
le bilan. À l’ouverture, il peut aussi reconnaître des gestes déjà réalisés,
uniquement pour le parcours du corpus ouvert, sans retirer les acquis mémorisés.
Les annotations fournies dans un corpus d’analyse ne doivent pas prévalider le
parcours de traitement.

Une validation doit distinguer un brouillon d’un objet enregistré, et un résultat
périmé d’un résultat à jour. Les contrôles du fournisseur restent ceux de la
commande ordinaire : le guide n’accorde aucun droit supplémentaire.

## Les quatre parcours

Le catalogue les ordonne sans imposer de prérequis entre parcours.

### Préparer et suivre

`preparation.ts` définit quatre gestes : renseigner la problématique du tableau
de bord, ajouter le guide d’entretien aux documents du projet, créer l’entretien
préparatoire puis y écrire une note. Seule la note exige la création de cet
entretien. Son identité est mémorisée dans le contexte du parcours ; un titre
ressemblant ne suffit pas à désigner la source suivie.

Les prédicats sont isolés dans `predicatsPreparation.ts`. Modifier une condition
doit rester cohérent avec les commandes réelles du
[tableau de bord](../preparer/tableau-bord.md), des
[documents cadre](../preparer/docs-cadre.md) et des
[notes](../traiter/notes/README.md).

### Importer et traiter

La définition est dans `useGuide.ts`. Elle s’appuie notamment sur la coordinatrice
pour le travail transcrit et sur la retraitée pour l’arrivée d’un audio sans
transcription. Les gardes de choix de fichiers ne s’appliquent que pendant les
étapes concernées ; la pause ne doit pas bloquer les imports ordinaires.

Après certains imports guidés, l’entretien ne s’ouvre pas automatiquement : le
bilan doit rester visible dans le corpus. Ce comportement passe par
`ouvrirApresImport()`, et non par une variante de l’import métier.

### Analyser et interpréter

`analyse.ts` définit quatre étapes : synthèse du thème « Sens de l’utilité »,
concordances d’« enfants », matrice de deux thèmes sur quatre entretiens avec
couverture, puis retour d’une cellule aux passages de la coordinatrice dans
Synthèse. Seule cette dernière étape exige la matrice comme prérequis.
Les trois outils restent utilisables indépendamment.

Les critères, sélections et résultats à jour valident les étapes. Un calcul
incomplet ou périmé ne suffit pas. Les consignes et bilans restent dans l’espace
d’analyse grâce aux surfaces et à `vueFin`.

### Organiser et exporter

`organisation.ts` définit quatre étapes : créer un cas par règle sur
`1Coordinatrice`, structurer le recueil « Regards sur le bénévolat », y ajouter
un passage de la coordinatrice, puis exporter les quatre entretiens en TXT avec
pseudonymisation. Seul l’ajout du passage exige la structure du recueil.
Le cas et le recueil doivent être enregistrés, pas simplement prévisualisés.

Le panneau d’export transmet au guide la demande et son résultat métier.
Annulation, échec et lot partiel ne valident pas l’étape. Ce résultat temporaire
est effacé au changement de corpus ; seuls les acquis validés sont persistés.
L’export du corpus est distinct de l’export propre au recueil.

## Pause, navigation et changement de corpus

Le résumé **Démo :** vit dans la coquille de l’application, sous la barre des
espaces, et reste visible dans Préparer, Traiter, Analyser et Organiser,
y compris en pause. Il donne accès au catalogue.
**Sortir de la démo** met le guide en pause après un retour réussi à l’accueil :
une fermeture d’entretien refusée ne doit pas faire croire que la sortie a réussi.

La pause conserve le corpus et ses acquis. Changer de corpus arrête l’étape,
efface les bilans et les résultats temporaires ; une génération de guide empêche
une réponse asynchrone de l’ancien parcours de s’afficher dans le nouveau corpus.
Le guidage reste distinct des
[retours de consultation](../navigation-espaces.md#retours-au-travail-précédent).

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Contrats des étapes et surfaces | `src/renderer/composables/parcours/types.ts` |
| Ordre, progression affichée et prochaine étape | `src/renderer/composables/parcours/catalogue.ts`, `presentation.ts` |
| Activation, observation, pause et persistance | `src/renderer/composables/parcours/useGuide.ts` |
| Lecture et sérialisation des acquis | `src/renderer/composables/parcours/marqueur.ts` |
| Scénarios de préparation, analyse et organisation | `src/renderer/composables/parcours/preparation.ts`, `analyse.ts`, `organisation.ts` |
| Résumé permanent et sortie de démo | `src/renderer/components/app/ResumeParcoursPasAPas.vue` |

Pour modifier une étape, vérifier son prédicat, ses prérequis, sa surface et son
bilan, puis tester première réussite, reprise et pause. Les tests de référence sont :

- `test/parcoursCatalogue.test.ts`, `test/parcoursPasAPas.test.ts` et
  `test/marqueurDemo.test.ts` : indépendance des parcours, progression et persistance ;
- `test/parcoursAnalyse.test.ts`, `test/parcoursOrganisation.test.ts` : validations métier ;
- `e2e/preparation-pas-a-pas.e2e.ts`, `e2e/pas-a-pas.e2e.ts`,
  `e2e/analyse-pas-a-pas.e2e.ts` et `e2e/organisation-pas-a-pas.e2e.ts` : gestes réels ;
- `e2e/demo.e2e.ts` : ouverture du catalogue, reprise et bilan de remise à zéro.
