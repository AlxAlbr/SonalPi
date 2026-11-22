# Locuteurs — vue d’ensemble

Le modèle natif distingue l’identité commune du corpus (`Locuteur`) et ses données
locales dans un entretien (`ParticipationLocuteur`). Le répertoire affiché est une
projection calculée de ces objets, pas une troisième identité persistée.

## Trois identifiants, trois usages

| Identifiant | Portée | Usage |
|---|---|---|
| `ParticipationLocuteur.index` | Un entretien | Référence numérique `loc` des paragraphes. |
| `ParticipationLocuteur.id` | Un entretien | Notes et commandes avec `{ entretienId, participationId }`. |
| `Locuteur.id` | Corpus | Association par `ParticipationLocuteur.locuteurRef`. |

Les ids natifs sont obligatoires et stables. Les importateurs peuvent recevoir des
participations sans id (`ParticipationImport`) ; ils les complètent avant toute
persistance. Une consultation ne fabrique jamais d’id.

Un index identique dans deux entretiens ne désigne pas une même identité. Un nom
identique non plus. À l’import V1, chaque participation reçoit sa propre identité
corpus, même pour deux noms égaux ou deux libellés de rôle comme « Enquêteur ».

## Propriétaires des données

`ParticipationLocuteur` conserve son nom local, son rôle, son pseudonyme et sa
décision éventuelle, sa couleur, ses `valeursLoc` et son `locuteurRef`. Une absence
d’association explicite reste `null`. `associationRetiree` conserve un retrait
volontaire ; `rapprochementsRefuses` contient des références structurées :

- `{ type: 'locuteur', locuteurId }` ;
- `{ type: 'participation', entretienId, participationId }`.

`Locuteur` ne contient que `id` et `nom`. Relier deux participations ne synchronise
ni leurs noms, ni leurs pseudonymes, ni leurs valeurs. Une reprise ponctuelle de
données est un choix séparé du rapprochement.

Les notes restent dans leurs entretiens, avec des `participationIds` locaux.
Les variables locales ont la portée `participation` et leurs valeurs restent dans
`valeursLoc`, jamais dans le répertoire commun.

## Invariants et compatibilité

1. Les paragraphes référencent des index, les commandes des ids stables.
2. Une identité ne représente pas deux participations du même entretien.
3. Un regroupement ou une séparation ne déplace ni les notes ni les valeurs.
4. Les pseudonymes de participation restent indépendants des règles textuelles.
5. Seuls les liens et les refus décidés sont persistés ; les suggestions sont calculées.
6. L’ouverture directe exige le format natif V2 et sa structure complète.
   Les fichiers V1 passent par l’import ; les documents incompatibles sont refusés
   sans conversion ni réécriture.

## Carte du code

| Responsabilité | Emplacement |
|---|---|
| Types et validation | `src/shared/format.ts`, `src/shared/locuteurs.ts`, `src/shared/natif/validation.ts` |
| Opérations d’identité | `src/shared/corpus/identitesLocuteurs.ts` |
| Création au nommage et rapprochement communs | `src/shared/corpus/nommageLocuteurs.ts` |
| Inventaire et contrats | `src/shared/corpus/inventaireLocuteurs.ts`, `contratsLocuteurs.ts` |
| Suggestions et reprise | `src/shared/corpus/rapprochementsLocuteurs.ts` |
| Répertoire calculé | `src/shared/corpus/repertoireLocuteurs.ts` |
| Attribution et gouttière | `src/renderer/editor/attribution.ts`, `locuteursGutter.ts` |
| Gestes d’entretien | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Stockage et dispatch | `src/main/corpusStore.ts`, `src/main/index.ts` |

La consultation utilise désormais la vue commune, y compris en distant. Le nouveau
parcours de corrections corpus est raccordé sur GitLab et WebDAV, avec protections
et reprise propres à chaque fournisseur. Depuis l’entretien ouvert, renommage,
création et rapprochement sont également raccordés sur GitLab et WebDAV, sans second
droit sur l’entretien courant.
Les deux anciens composants corpus et le module de relais métier sont supprimés.
La lecture est harmonisée sous `inventaireIdentitesLocuteurs`, sans ancien alias.
Les anciennes commandes, leurs relais et leur point d’entrée sont supprimés, sans
alias ni adaptation de stockage. Voir le bilan courant par fournisseur.

## Parcours de lecture

- [qualification.md](qualification.md) : bilan local, captures et réserves de qualification.
- [fournisseurs.md](fournisseurs.md) : raccord distant, garanties et étapes restantes.

- [entretien.md](entretien.md) : attribution, suppression, rôle et pseudonyme.
- [corpus.md](corpus.md) : inventaire, corrections, droits et retrait historique.
- [variables.md](../variables.md) : valeurs portées par chaque participation.
- [Notes](../notes/README.md) : liens locaux et agrégation.
- [Modèle objet](../../modele-objet.md#locuteurs-et-participations) : relations du format.
