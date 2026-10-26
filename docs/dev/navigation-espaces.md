# Navigation par espaces et consultations liées

La navigation principale est un état de session, jamais une donnée du corpus.
`useEspacesTravail.ts` distingue l’écran affiché de la dernière vue de traitement
(`corpus` ou `entretien`). Les quatre espaces utilisent cette même navigation.

Les composants suivent ces espaces sous `components/preparer/`, `traiter/`,
`analyser/` et `organiser/`. Seul `traiter/` distingue les vues `corpus/` et
`entretien/`. Voir [l’organisation des composants](../../src/renderer/components/README.md).
Ce classement ne déplace pas les composables ni les modèles métier.

## Masquage et fermeture

Changer d’espace conserve l’éditeur monté et l’entretien ouvert.
Le watcher de `vue` met l’audio en pause dès que l’écran n’est plus Entretien.
Il n’y a pas de lecture simultanée dans plusieurs espaces ; revenir ne relance
jamais l’audio. `retourCorpus()` reste une vraie fermeture avec sauvegarde et
contrôles de session. Les ouvertures d’autres entretiens gardent leurs protections.

## Filtres Cas

Synthèse et Lexico déterminent la présence de cas à partir de leurs définitions,
chargées avec le corpus et renouvelées par les commandes et les tirages distants.
Aucune requête de projection supplémentaire ne conclut à une absence de cas.
Une définition vide compte ; une lecture de matériaux en erreur ne change pas
la visibilité. Les analyses ne sont accessibles qu’après ouverture du corpus.

Sans définition, la dimension Cas disparaît et sa consultation se replie vers
Thèmes dans Synthèse, Entretiens dans Lexico. Cela ne modifie aucun critère et
ne lance aucun calcul. Un filtre visant des cas supprimés reste signalé avec
une action explicite de retrait. Synthèse conserve le bilan de son résultat
jusqu’au prochain calcul ; retirer un critère ne réécrit pas cet ancien résultat.

## Ajouts contextuels

`DialogueAjoutCas.vue` et `DialogueAjoutRecueil.vue` sont des dialogues natifs
limités aux destinations, au passage et à la création simple. Les gestionnaires
complets restent uniquement dans `OrganiserExporter.vue`, montés au premier accès.

La sélection est capturée avant l’ouverture et vérifiée par
`enregistrerRepereSelection(attendu)` à la confirmation. Annuler avant confirmation
n’écrit rien. Les commandes existantes gardent publication, capacités fournisseur
et restrictions de lecture seule. L’ajout ne change pas la sélection du gestionnaire
caché et ne navigue pas automatiquement après réussite.

Une erreur conserve les identités du repère, du rattachement ou de l’item pour
le rejeu. Une création simple de recueil conserve aussi son identité de commande.
Échap peut fermer une tentative inachevée sans la perdre ; abandonner est explicite.
Un recueil créé avant un échec ultérieur reste conservé si l’ajout est abandonné.
Les réponses d’un ancien corpus ne remplissent pas le nouvel écran.

## Retours au travail précédent

`useRetoursContextuels.ts` porte une pile de huit destinations au maximum.
`sonal.ts` lui fournit capture et restauration typées : espace, sous-espace,
objet sélectionné, sélection du texte, onglet d’entretien et position audio.

Les panneaux restent montés. `useContextesPanneaux.ts` leur permet de prêter
une restauration de leurs réglages locaux : recherche, tri, familles,
numérotation, etc. Aucun contenu métier ni résultat d’analyse n’est réinjecté.
`contexteVisuel.ts` conserve le focus et le défilement ; la sélection du texte
suit les corrections de la même source sans créer de repère persistant.
Une suppression complète de la sélection est signalée au retour.

Une consultation empile seulement après ouverture réussie. Revenir dépile après
restauration réussie ; un refus laisse la destination disponible pour réessayer.
L’ouverture d’une source déjà présente en mémoire ne recharge pas son éditeur.
Changer de source réutilise la préparation de sortie existante : sauvegarde si
l’accès l’autorise, aucune nouvelle écriture en consultation seule ou après
rétrogradation. L’ouverture reste celle du cycle habituel. Un objet supprimé revient à son panneau disponible avec une explication,
sans sélectionner silencieusement un autre objet.

Le retour à une analyse ne recalcule pas un résultat périmé : son avertissement
reste visible et son actualisation reste explicite. Les restaurations de défilement
interviennent après mise à jour de l’interface de retour.

Les commandes libres de la barre, des onglets d’espace, des répertoires et du
guidage terminent la chaîne. La fermeture explicite d’un entretien et le changement
de corpus effacent aussi les retours. Le guidage pédagogique reste distinct de
cette chaîne de consultations.

## Associations du passage sélectionné

L’entretien expose un résumé repliable seulement lorsqu’une sélection de texte
existe. `editor/associationsPassage.ts` compare cette plage aux repères des ajouts
manuels et des recueils, ainsi qu’aux règles de cas applicables dans l’entretien
ouvert. Le calcul porte sur cette seule source ; changer la sélection ne reprojette
pas tous les entretiens du corpus.

Les correspondances exactes, incluses et chevauchantes sont conservées. Un cas
indique séparément l’ajout manuel et chaque raison d’inclusion automatique. Un
recueil apparaît une seule fois avec ses occurrences ; l’utilisateur choisit
l’occurrence à ouvrir lorsqu’il y en a plusieurs.

Les définitions de personnes sont chargées une fois puis réutilisées tant que le
répertoire et le tirage distant n’ont pas changé. Un repère absent, une règle
invalide ou une lecture des personnes impossible produit un résultat incomplet,
jamais un faux bilan « aucune association ». Les changements de texte, ajouts,
retraits, règles, tirages et changements de corpus renouvellent le résumé.
La consultation reste disponible en lecture seule. Ouvrir un objet associé empile
le passage courant dans les retours contextuels ; une occurrence de recueil reçoit
le focus après ouverture.

## Tests

- `test/analysesCasVisibilite.test.ts` : premier et dernier cas, repli et restrictions.
- `test/retoursContextuels.test.ts` : pile, refus, bornes et requêtes anciennes.
- `test/contexteVisuel.test.ts` : sélection remappée et passage supprimé.
- `test/contextesPanneaux.test.ts` : réglages propres aux consultations.
- `test/associationsPassage.test.ts` : correspondances, règles et occurrences multiples.
- `test/couturesRenderer.test.ts` : préparation de sortie et absence d’écriture interdite.
- `test/casRenderer.test.ts`, `test/recueilsRenderer.test.ts` : reprise des ajouts.
- `e2e/filtres-cas.e2e.ts`, `e2e/ajouts-contextuels.e2e.ts`,
  `e2e/retours-contextuels.e2e.ts`, `e2e/associations-passage.e2e.ts`,
  `e2e/cas.e2e.ts`, `e2e/recueils.e2e.ts` : recettes locales dans Electron.

Les restrictions et les protections distantes restent celles des commandes
existantes. Ces recettes locales ne remplacent pas une recette serveur réelle.
