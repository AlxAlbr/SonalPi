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

L’interface fixe la portée au moment de la création et ne propose pas de commande
pour réordonner les définitions ou les modalités. La sélection des colonnes dans
la table ne change que leur affichage.

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

Le corpus natif et l’export `.sonal` complet conservent les variables privées et
leurs valeurs. Le `.sonal` pseudonymisé les écarte. Le modèle JSON de modalités
ne contient ni réponses, ni statut privé ; ce n’est pas un export de la table.
La table propose **Exporter CSV…** : colonnes visibles, filtre de portée,
variables privées exclues sauf choix explicite. Les noms des entretiens et
locuteurs restent en clair, sans pseudonymisation automatique.

`src/shared/corpus/exportDonnees.ts` produit un CSV UTF-8 avec BOM, séparateur
point-virgule, cellules entre guillemets et fins de lignes CRLF. Les cellules
pouvant être interprétées comme des formules sont préfixées pour rester du texte.
Les colonnes fixes Entretien, Type de ligne et Locuteur conservent le contexte
sur chaque ligne. Les en-têtes des variables distinguent les deux portées.

`ExportDonnees.vue` présente le périmètre et le choix explicite des privées.
La table attend les saisies en cours, relit la matrice et vérifie le corpus.
Un entretien absent de la matrice ou une modalité inconnue bloque la production,
plutôt que de transformer l’erreur en valeur vide. Une lecture échouée n’autorise
pas l’export du dernier résultat gardé en mémoire. Le dialogue d’enregistrement
existant écrit le CSV ; annuler ne produit aucun fichier.

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
`test/exportFormats.test.ts` vérifie aussi les deux portées privées dans le SONAL
complet et les copies de lecture. Le [chapitre utilisateur](../../user/traiter/donnees.html)
et ses deux captures sont couverts par `e2e/documentation-donnees.e2e.ts` :
saisie libre, modalités, cohérence panneau/table, lots et modèles réellement
exportés/importés. `DONNEES_E2E_EXECUTABLE` permet de rejouer ces parcours dans
le paquet Linux ; `SONAL_DOC_CAPTURES=1` renouvelle les illustrations.

`test/exportDonnees.test.ts` couvre le format CSV, les deux portées, les privées,
les caractères spéciaux, les formules et les refus de données incomplètes.
`e2e/export-donnees.e2e.ts` vérifie les fichiers produits, la sélection des colonnes,
l’option privée, l’annulation, la dernière saisie, les erreurs de lecture/écriture
et la conservation du corpus après ouverture. Le même exécutable empaqueté peut
être choisi avec `DONNEES_E2E_EXECUTABLE`.

Voir aussi le [modèle objet](../modele-objet.md#thèmes-et-variables).
