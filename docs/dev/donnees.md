# Données — stockage, calculs et circulation

Pour modifier une fonction, commencer par identifier **qui possède la donnée**,
si elle est enregistrée ou calculée, et quel circuit autorise sa modification.
Le [modèle objet](modele-objet.md) décrit les objets ; cette page explique leur
circulation entre l’éditeur, la mémoire et les fichiers.

## Définitions, usages et résultats calculés

| Nature | Exemples | Propriétaire |
|---|---|---|
| Définition partagée | Thème, variable et modalités, règle de pseudonymisation, catégorie de note. | `corpus.json`. |
| Usage ou décision d’entretien | Codage, pseudonyme appliqué, valeur de variable, note. | `entretiens/<id>.json`. |
| Définition éditoriale ou analytique | Recueil et ses items, cas et ses règles, réglages Lexico. | `corpus.json`. |
| Résultat calculé | Résumé thématique, passages résolus d’un cas, matrice, index lexical. | Mémoire ou cache de calcul ; pas une seconde définition partagée. |

Enregistrer les critères d’une analyse ne signifie pas enregistrer son résultat.
Un cache accélère une lecture ; il ne devient pas la référence après modification
des sources. Une source inaccessible produit un diagnostic, pas un résultat vide
supposé complet.

## Éditeur et positions dans le texte

`EntretienFichier.corpsTexte` est le document ProseMirror sérialisé en JSON.
Les annotations, ancres temporelles et repères de passage vivent à côté de lui.
Le DOM n’est ni un format de sauvegarde, ni le détenteur des codages.

Lors d’une correction :

1. TipTap/ProseMirror produit une transaction et un nouvel état du document ;
2. `src/renderer/editor/remap.ts` lit `tr.mapping` pour déplacer les positions
   des annotations, ancres et repères avec le texte ;
3. les décorations projettent les décisions métier dans l’éditeur.

Une position ProseMirror n’est pas un indice de caractère du texte brut : elle
compte aussi la structure du document. Utiliser les conversions de
`src/shared/entretien/positions.ts`, pas une addition sur une chaîne de caractères.
Une plage entièrement supprimée peut rester comme objet orphelin ; ne pas la
supprimer silencieusement pour rendre le résultat plus simple.

## Commandes et persistance

Deux circuits courants coexistent :

```text
Édition d’un entretien ouvert
  → commande pure ou transaction de l’éditeur
  → modèle en mémoire → sauvegarde via window.sonal
  → main : contrôle de l’accès et écriture autorisée

Commande de définition corpus
  → demande ciblée via window.sonal
  → main : relecture, contrôles et transaction du fournisseur
  → opération pure → enregistrement → état confirmé renvoyé au renderer
```

Les commandes ciblées expriment une intention et, lorsque nécessaire, l’état
attendu de leur cible. Renvoyer tout un dictionnaire ancien depuis le renderer
risquerait d’écraser les changements d’une autre action.

Le main assure les écritures et contrôles de format. Une écriture atomique protège
le remplacement d’un fichier ; elle ne rend pas atomique une opération touchant
plusieurs fichiers ou plusieurs serveurs. Ces opérations ont leurs propres
transactions, journaux ou bilans partiels.

## Ce qui fait foi selon la situation

- **Entretien ouvert** : la mémoire peut contenir un travail non encore sauvegardé.
  Une projection de cet entretien doit en tenir compte au lieu de relire une
  ancienne version du fichier.
- **Corpus local** : les fichiers sont la persistance. Le main les relit pour les
  commandes qui l’exigent ; une copie réactive ancienne ne gagne pas un conflit.
- **Corpus distant** : le serveur porte les données publiées. Le miroir et les
  sauvegardes de session peuvent contenir un travail local non publié : il faut
  le conserver, mais il n’autorise pas à écraser le serveur.

**Sauvegardé localement ne signifie pas publié.** Une perte de réseau ou de droit
ne se résout pas en déclarant le renderer prioritaire. Suivre les parcours de
[session et récupération](distant/README.md).

## Format natif et compatibilité

Le contrat est dans `src/shared/format.ts` : types de fichiers, `FORMAT_VERSION`
et contrôle de version. Le numéro courant doit se lire dans le code, pas être
recopié dans chaque document.

Une évolution nécessitant une transformation structurelle du format demande un
changement de version et une migration explicite. Un champ optionnel additif,
avec un comportement défini quand il manque, n’impose pas à lui seul ce changement.
Une version non prise en charge est refusée, jamais interprétée partiellement.
Les caches et suivis peuvent avoir leur propre version, indépendante du format natif.

Ne pas confondre `formatVersion` avec la
[version livrée de l’application](developpement.md#vocabulaire-et-version-applicative).
Pour une évolution du format, vérifier lecture ancienne, conversion, réouverture,
aller-retour d’export et comportement distant ; la lecture d’un miroir ne doit
pas introduire une migration distante implicite.

## Où vérifier

- `test/remap.test.ts` : positions, suppressions et annulation de frappe.
- `test/corpusStore.test.ts` : lecture, enregistrement et migrations locales.
- `test/transitionContexte.test.ts` : changement de corpus et refus de fermeture.
- Les tests métier et fournisseur référencés dans la page de la fonction modifiée.
