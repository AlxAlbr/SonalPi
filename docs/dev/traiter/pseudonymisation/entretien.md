# Pseudonymisation dans un entretien

Ce document décrit le niveau entretien : ce qui est enregistré avec la
transcription, ce qui est recalculé et la manière dont les changements de portée
sont présentés.

## Données enregistrées

### Décisions textuelles

Une décision est une `Annotation` de type `anon` :

```ts
{
  id,
  type: 'anon',
  from,
  to,
  pseudo?,
  etat?: 'anonymise' | 'exception',
  regle?,
}
```

- `from` et `to` désignent la plage ProseMirror dans le texte original.
- `pseudo` conserve le choix appliqué ou la mémoire associée à une exception.
- `etat: 'exception'` signifie que le texte doit rester visible.
- l’absence d’état est traitée comme `anonymise`.
- `regle` rattache explicitement la décision à une règle corpus ; son absence
  indique une décision locale.

Le texte n’est jamais remplacé dans `corpsTexte`. La substitution par `[pseudo]`
est une projection d’affichage ou d’export.

### Définitions locales

`definitionsAnonLocales` conserve une définition complète propre à l’entretien :

```ts
{
  entite: string[],
  pseudos: string[],
  categorie?: string,
  etat: 'declaration' | 'brouillon',
}
```

Cette mémoire contient les alias et variantes inutilisés, ce que les seules
annotations ne permettent pas de reconstituer. Elle ne contient aucune position,
aucun compteur et aucun identifiant de règle corpus.

### Brouillons

`brouillonsAnon` représente la saisie locale encore en chantier. Un brouillon
peut ne pas avoir de pseudonyme. Lorsqu’il est validé, les décisions demandées
sont posées et le brouillon est consommé.

La définition locale en état `brouillon` est la mémoire complète. Le tableau de
l’entretien fusionne cette mémoire, les brouillons de saisie et les annotations
pour afficher une seule ligne par groupe d’alias.

`pseudosDeclares` conserve encore certaines déclarations historiques nécessaires
aux choix locaux. Les nouveaux parcours utilisent de préférence
`definitionsAnonLocales`, qui porte aussi les alias et la catégorie.

## Données recalculées

### Recherche des correspondances

`occurrencesDe` et `matchesAliases` recherchent les alias sans distinction de
casse, aux frontières de mot Unicode. Les alias qui se recouvrent sont
dédupliqués en privilégiant le plus long.

Pour chaque correspondance, `classerPlage` calcule un état :

| État | Signification |
|---|---|
| `anon` | Une décision visible pseudonymise cette plage. |
| `exc` | Une exception visible laisse cette plage en clair. |
| `non` | Aucune décision ne couvre la correspondance : elle est « À anonymiser ». |
| `incl` | Une décision existe mais est masquée par une décision englobante. |

`non` et `incl` ne sont pas des états enregistrés sur le document. Ils sont
recalculés à partir du texte et des annotations.

### Inclusions

Les annotations imbriquées restent toutes stockées. Sur chaque portion, la règle
commune de visibilité détermine celle qui produit le résultat visible.

Une décision incluse :

- n’est pas comptée comme une seconde décision visible ;
- conserve son état et son pseudo ;
- peut redevenir visible si la décision englobante disparaît ;
- doit être prise en compte par les opérations globales qui ciblent son lien de
  règle, même lorsqu’elle est actuellement masquée.

`projectionTexte.ts` porte cette sémantique commune pour éviter des résultats
différents entre l’éditeur, les passages et les exports.

## Gestes locaux

### Créer un brouillon

Une sélection ou la ligne de saisie ajoute une entité locale. Tant qu’aucune
décision n’est posée, elle reste en chantier. Le tableau affiche les
correspondances recalculées dans le texte.

### Poser une décision

Valider une correspondance crée une annotation. Pour une définition comportant
deux variantes, le pseudo choisi est mémorisé sur chaque annotation.

Une exception crée aussi une annotation : elle exprime un choix volontaire de
laisser cette occurrence en clair. Une exception interne est protégée lorsqu’une
pose englobante risquerait de la masquer ; l’entretien demande alors une
confirmation.

### Revenir au brouillon

Le retour en chantier retire les décisions appartenant à la définition locale,
y compris les décisions incluses, sans supprimer des annotations indépendantes
qui les englobent. Alias, variantes et catégorie sont conservés dans une
définition locale en état `brouillon`.

Les passages retirés redeviennent des correspondances « À anonymiser » au prochain
recalcul.

### Promouvoir au corpus

La promotion crée ou rejoint une règle corpus compatible, puis rattache les
décisions locales concernées par son identifiant. Une collision d’alias ou une
définition incompatible est refusée ; aucune fusion implicite n’est tentée.

Le pseudo partagé par deux définitions ne suffit jamais à les considérer comme
identiques.

## Sortir d’une règle corpus depuis l’entretien

Le bouton entretien ne transforme pas uniquement le fichier ouvert. Il demande
d’abord un inventaire frais de tous les membres du corpus.

### Seul l’entretien courant est concerné

Le cycle est automatique :

1. sauvegarder l’entretien ;
2. fermer techniquement sa session ;
3. revalider et appliquer la dissociation globale ;
4. rafraîchir les règles ;
5. rouvrir l’entretien à sa position précédente.

Pour la destination **entretien**, les décisions gardent leurs plages, états et
pseudos, mais perdent leur lien `regle`. Une définition locale complète en état
`declaration` est ajoutée.

Pour la destination **brouillon**, les décisions dissociées sont ensuite retirées
et la définition locale passe en état `brouillon`.

### Plusieurs entretiens sont concernés

Le parcours global s’ouvre avec un bilan complet. Une destination locale ne doit
pas retirer silencieusement la portée partagée des autres entretiens.

Si la situation change entre le premier inventaire et l’écriture, l’application
directe est abandonnée au profit du dialogue global frais.

## Locuteurs

Les locuteurs sont pseudonymisés par `Locuteur.pseudo` et `pseudoEtat` :

- pseudo non vide et non refusé : le pseudo est utilisé ;
- refus explicite ou pseudo absent : le nom reste en clair lorsque le format
  demande les locuteurs.

Ce mécanisme est indépendant des annotations textuelles. Les commandes de
pseudonymisation du texte ne modifient ni les locuteurs ni les `Personne`.

## Carte du code et tests

| Sujet | Code principal | Tests principaux |
|---|---|---|
| Détection et plages | `src/shared/entretien/anon/anonymisation.ts` | `test/anonymisation.test.ts` |
| Classification et inclusions | `classification.ts`, `projectionTexte.ts` | `test/scanAnon.test.ts`, `test/projectionTexteAnon.test.ts` |
| Brouillons et lignes | `brouillonsAnon.ts`, `compteursAnon.ts` | `test/brouillonsAnon.test.ts`, `test/compteursAnon.test.ts` |
| Définitions locales | `definitionsLocales.ts` | `test/definitionsAnonLocales.test.ts` |
| Promotion et changements de portée | composables d’entretien et `sonal.ts` | `test/anonymisationPromotion.test.ts`, `e2e/dissociation-anon.e2e.ts` |
| Rendu ProseMirror | `src/renderer/editor/` | `test/pseudonymisationProjection.test.ts` |
