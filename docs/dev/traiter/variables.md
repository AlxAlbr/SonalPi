# Variables et valeurs

Les variables décrivent les entretiens ou leurs locuteurs par des modalités.
Le schéma est partagé au corpus ; une valeur reste chez son propriétaire dans
l’entretien. La table de données est une vue calculée de ces valeurs, jamais
une seconde base à maintenir.

## Définitions, propriétaires et identités

| Notion | Stockage | Contenu |
|---|---|---|
| Variable | `corpus.json.variables` | `id`, `lib`, `portee`, `priv`, `ordre`, `vExport` et `modalites`. |
| Modalité | Dans sa variable | `id`, `lib` et `mExport`. |
| Valeur d’entretien | `EntretienFichier.meta.valeursGen` | Association `idVar → idMod`. |
| Valeur de locuteur | `Locuteur.valeursLoc` | Association `idVar → idMod`. |
| Matrice corpus | Rien | Lecture des valeurs des entretiens et de leurs locuteurs. |

`portee` vaut `entretien` ou `locuteur` et détermine le propriétaire. La valeur
ne répète ni cette portée ni les libellés. Renommer une variable ou une modalité
ne réécrit donc aucun entretien.

Les créations utilisent des identifiants opaques injectés dans le modèle pur.
Les ids déterministes `v{n}` et `v{n}m{m}` concernent le mapping historique de
SonalPi1, pas toutes les nouvelles variables. `vExport` et `mExport` sont des
codes numériques de compatibilité, distincts des identités.

Un locuteur lié à une personne conserve ses propres valeurs. Une liaison ne
propage pas la donnée dans les autres entretiens de cette personne.

## Éditer les définitions

`EditionVariables.vue` et `useVariablesCorpus.ts` orchestrent les créations,
renommages, modalités et statut privé. L’ordre d’affichage vient du champ
`ordre` ; il n’est pas déduit de l’ordre des clés du fichier.

Une variable ou une modalité utilisée ne se supprime pas en cascade. Le main
compte les valeurs et les usages dans les cas ou familles avant d’autoriser le
retrait. Les références de cas protègent également les changements de portée
qui rendraient leur règle incohérente.

Les modèles de modalités ne sont pas des valeurs préremplies. Choisir un modèle
ajoute ses libellés à la définition. Les modèles personnels vivent dans le
profil utilisateur et peuvent être importés en JSON sous la forme :

```json
{ "nom": "Situation", "modalites": ["En activité", "Sans activité"] }
```

L’import exige un nom et une liste non vide de libellés non vides. Il ne charge
aucune valeur dans les entretiens.

## Saisir une valeur

`poserValeur` édite le dictionnaire du propriétaire. `idMod: ''` efface la
valeur : ce n’est ni une nouvelle modalité ni une chaîne stockée comme réponse.
Une saisie libre dans la table trouve ou crée une modalité par son libellé avant
de poser son identifiant.

Le panneau Données de l’entretien et la table partagée lisent les mêmes
définitions. Pour l’affichage détaillé, les variables sont triées par `ordre`,
les références sans définition ne sont pas affichées comme des valeurs connues,
et les interviewers sont exclus des blocs de variables de locuteur.

La table corpus appelle le parcours de lot même pour une seule cellule. Une
cible est soit `{ type: 'entretien' }`, soit `{ type: 'locuteur', index }` ;
l’index est local à l’entretien, jamais un identifiant de personne.

## Modifier en lot

La fenêtre `LotVariable.vue` propose une valeur commune pour **une variable de
portée entretien**. L’API accepte également des cibles de locuteur, utilisées
notamment pour les cellules individuelles ; cela ne signifie pas que la fenêtre
propose un lot transverse de locuteurs.

Le lot vise les entretiens du corpus. Un filtre facultatif « lignes sans
valeur » aide à protéger les valeurs déjà présentes. Les badges et la matrice
servent à préparer la sélection, mais ne garantissent pas que l’écriture sera
encore possible à l’exécution.

Les items sont regroupés par entretien. Le résultat distingue les identifiants
réussis et les échecs nommés avec leur raison. Un échec n’empêche pas le traitement
des autres entretiens ; le lot n’est pas une transaction globale tout-ou-rien.
La matrice est relue après l’opération. En cas d’échec de rafraîchissement, le
renderer garde le dernier résultat et affiche une erreur plutôt que de remplacer
la table par un faux résultat vide.

## Exécution locale, GitLab et WebDAV

Les créations et modifications de schéma relèvent des définitions corpus. Les
suppressions nécessitent les gardes propres aux usages publiés. La saisie de
valeurs relève du geste `valeurs.lot`, ouvert sur les trois fournisseurs.

- **Local** : le main applique les valeurs dans les fichiers d’entretien.
- **WebDAV** : une session déjà détenue est réutilisée. Sinon, un verrou court,
  une lecture serveur fraîche et une publication conditionnelle protègent
  l’entretien ; le miroir est actualisé après la réussite de cette publication.
- **GitLab** : une session éditable détenue est utilisée et publiée. Hors session,
  la transaction ciblée protège et publie l’entretien depuis sa version courante.

Un entretien tenu par autrui ou une divergence peut produire un échec ponctuel.
Écrire directement le miroir pour contourner cet échec est interdit. Les gardes
communes sont détaillées dans [gestes.md](../distant/gestes.md).

## Confidentialité et compatibilité

`priv` appartient à la définition de variable. Les exports textuels de diffusion
écartent les variables privées ; ce statut ne masque pas la donnée aux autres
utilisateurs du corpus. Il ne remplace ni les droits du fournisseur ni la
vérification des contenus libres avant diffusion.

Le mapping SonalPi1 traduit les valeurs générales vers la convention `l="all"`
et les valeurs de locuteur vers leur index. Cette sentinelle n’existe pas dans
le modèle natif. Les valeurs inconnues ne doivent pas donner naissance à de
faux locuteurs ou à des modalités implicites lors d’un export.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Contrats | `src/shared/format.ts` |
| CRUD et détails affichables | `src/shared/corpus/variables.ts` |
| Valeurs, compteurs et matrice | `src/shared/corpus/requetes.ts` |
| Mapping SonalPi1 | `src/shared/corpus/eav.ts` |
| Stockage et refus de suppression | `src/main/corpusStore.ts` |
| Lots locaux et WebDAV | `src/main/distant/transactions.ts` |
| Lots GitLab | `src/main/gitlab/contexte.ts`, `src/main/gitlab/transactions.ts` |
| Orchestration renderer | `src/renderer/composables/corpus/useVariablesCorpus.ts` |
| Éditeur, table et fenêtre de lot | `src/renderer/components/traiter/partages/donnees/` |
| Panneau d’entretien | `src/renderer/components/traiter/entretien/PanneauDonneesEntretien.vue` |

Tests principaux : `test/corpus.test.ts` (CRUD, valeurs et matrice),
`test/eav.test.ts` (mapping historique), `test/distantRenderer.test.ts`
(disponibilité), `e2e/donnees.e2e.ts` et `e2e/table-donnees.e2e.ts` (parcours).
Voir aussi le [modèle objet](../modele-objet.md#thèmes-et-variables).
