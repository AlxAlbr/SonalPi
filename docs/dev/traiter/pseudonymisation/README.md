# Pseudonymisation — vue d’ensemble

Ce dossier décrit la pseudonymisation telle qu’elle fonctionne aujourd’hui dans
SonalPi2. Il privilégie le modèle mental, les invariants et la carte du code. Les
anciens journaux de livraison restent consultables dans l’historique Git et dans
les plans, mais ne constituent pas la documentation de référence.

La pseudonymisation remplace des passages explicitement décidés par des
pseudonymes. Elle ne promet pas, à elle seule, l’anonymat complet d’un document :
les titres, notes, commentaires, catégories et variables sont des champs libres
que l’utilisateur doit vérifier séparément.

## Les quatre notions à distinguer

| Notion | Stockage | Sens |
|---|---|---|
| Règle corpus | `corpus.json.reglesAnon` | Définition partagée : alias, un ou deux pseudonymes et catégorie facultative. |
| Définition locale | `definitionsAnonLocales` dans un entretien | Mémoire complète d’une définition propre à cet entretien. |
| Brouillon | `brouillonsAnon` et définition locale en état `brouillon` | Définition locale qui n’a pas encore de décision posée. |
| Décision | `Annotation{type:'anon'}` | Choix effectué sur une plage : pseudonymiser ou laisser en exception. |

Une correspondance « À anonymiser » n’est pas une donnée stockée. Elle est
recalculée en recherchant les alias dans le texte puis en comparant les plages
trouvées aux décisions existantes.

## Les trois portées

```text
brouillon local  ⇄  décisions de l’entretien  ⇄  règle partagée au corpus
```

- **Brouillon** : la définition existe localement, sans annotation posée.
- **Entretien** : des décisions existent, mais ne référencent aucune règle corpus.
- **Corpus** : les décisions portent `regle: <id>` et utilisent la définition
  partagée dans `corpus.json`.

Ces états ne sont pas un simple drapeau. Ils découlent du stockage réel :
présence d’un brouillon, présence d’annotations et présence ou non d’un lien de
règle.

Les transitions importantes sont les suivantes :

| Transition | Effet |
|---|---|
| Brouillon → entretien | Pose des décisions sur les occurrences choisies et consomme le brouillon. |
| Entretien → brouillon | Retire les décisions de cette définition ; les correspondances redeviennent « À anonymiser ». |
| Entretien → corpus | Crée ou rejoint une règle partagée et rattache les décisions concernées. |
| Corpus → entretien | Dissocie la règle : les décisions et leurs choix sont conservés localement. |
| Corpus → brouillon | Dissocie, puis retire dans l’entretien les décisions de la définition tout en conservant sa mémoire locale complète. |

Une sortie depuis la portée corpus commence toujours par un inventaire global
frais. Si seul l’entretien courant utilise la règle, l’application peut être
silencieuse : l’entretien est sauvegardé, sa session est fermée techniquement,
l’opération est appliquée, puis l’entretien est rouvert. Si plusieurs entretiens
sont concernés, le bilan global et le consentement restent explicites.

## Ce qui fait foi

1. Le texte original reste dans `corpsTexte`.
2. Une décision textuelle est portée par une annotation et non par le texte
   remplacé.
3. Le pseudo effectivement choisi est mémorisé sur l’annotation.
4. Le lien `regle` attribue explicitement une décision à une règle corpus.
5. Une définition locale conserve alias, variantes et catégorie, mais aucune
   position ni aucun compteur.
6. Les compteurs et occurrences « À anonymiser » sont des requêtes dérivées.

Un même pseudonyme utilisé par deux règles ne fusionne jamais leurs identités.
L’attribution repose sur l’identifiant de règle et sur les plages, pas sur la
ressemblance des libellés.

## Invariants de définition

`validerDefinitionAnon` applique les règles communes :

- au moins un alias ;
- un pseudonyme au minimum, sauf pour un brouillon ;
- deux variantes de pseudonyme au maximum ;
- plusieurs alias avec un seul pseudonyme, ou une seule entité avec deux
  variantes, jamais les deux à la fois ;
- normalisation NFC, espaces périphériques retirés et doublons insensibles à la
  casse éliminés ;
- catégorie facultative.

Les collisions de portée restent explicites. Une définition locale qui recouvre
une règle corpus n’est ni fusionnée ni convertie automatiquement.

## Décisions visibles et inclusions

Deux annotations peuvent être imbriquées. La décision englobante visible prime
sur la plage qu’elle couvre ; l’annotation interne reste stockée et peut redevenir
visible si l’englobante est retirée.

La même règle de visibilité est partagée par :

- le scan et les compteurs ;
- l’éditeur et les passages ;
- les exports ;
- les recueils, synthèses, analyses croisées et cas ;
- Lexico.

Une exception conserve le texte en clair. Une décision d’anonymisation sans
pseudo exploitable conserve également le texte en clair. Ces deux cas sont
signalés dans le rapport d’export.

## Locuteurs et texte : deux systèmes indépendants

Les noms de locuteur utilisent `Locuteur.pseudo` et `pseudoEtat`. Ils ne sont pas
rattachés aux règles textuelles et ne créent aucune règle corpus. Un même nom
peut donc être pseudonymisé dans les tours de parole sans que ses occurrences
dans la transcription le soient, et inversement.

L’export des correspondances rapproche ces informations pour l’utilisateur,
mais ne leur donne pas une identité métier commune.

## Organisation du code

| Responsabilité | Emplacement principal |
|---|---|
| Détection, classification et compteurs | `src/shared/entretien/anon/` |
| Définitions et opérations corpus pures | `src/shared/corpus/*Anon.ts` |
| Scan global | `src/shared/corpus/scanAnon.ts` |
| Projection visible commune | `src/shared/entretien/anon/projectionTexte.ts` |
| Services locaux reprenables | `src/main/*Anon.ts` |
| Protocoles GitLab | `src/main/gitlab/*Anon.ts` |
| Protocoles WebDAV | `src/main/distant/*AnonWebDAV.ts` |
| Orchestration renderer | `src/renderer/composables/` |
| Panneaux d’entretien et de corpus | `src/renderer/components/traiter/{entretien,corpus}/` |
| Exports | `src/shared/export/` et `src/renderer/export/` |

La logique métier pure doit rester dans `src/shared/`. Le renderer prépare les
intentions et affiche les bilans ; il ne fournit jamais au main une copie faisant
autorité pour une opération globale.

## Parcours de lecture

- [entretien.md](entretien.md) : brouillons, décisions, exceptions, inclusions et
  transitions locales.
- [corpus.md](corpus.md) : règles partagées, scan et opérations globales.
- [fournisseurs.md](fournisseurs.md) : différences entre local, GitLab et WebDAV,
  journaux et reprise.
- [sorties.md](sorties.md) : projection pseudonymisée, rapports et formats de
  sortie.

Pour le modèle de données général, voir aussi
[`../../modele-objet.md`](../../modele-objet.md#pseudonymisation). Pour les capacités et
gardes communes à tous les gestes, voir
[gestes par fournisseur](../../distant/gestes.md).
