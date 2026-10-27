# Locuteurs — vue d’ensemble

Un locuteur appartient à un entretien. Il porte les informations locales d’un
participant et reçoit les tours de parole de la transcription. Une personne est
une identité transverse facultative, définie au corpus, qui rapproche des
locuteurs de plusieurs entretiens sans absorber leurs données.

## Trois identifiants, trois usages

| Identifiant | Portée | Usage |
|---|---|---|
| `Locuteur.index` | Un entretien | Référence numérique `loc` des paragraphes et cible des valeurs de locuteur. |
| `Locuteur.id` | Identité stable du locuteur | Liaisons de notes, rapprochements et réconciliation des versions. |
| `Personne.id` | Corpus | Référence `Locuteur.personneRef` vers une fiche transverse. |

Un index identique dans deux entretiens ne désigne pas la même personne. Un nom
identique non plus. Les homonymes restent possibles ; un rapprochement ne doit
jamais se déduire de la seule égalité des libellés.

Les nouveaux locuteurs reçoivent un identifiant opaque. Les anciens fichiers
peuvent ne pas en avoir : les lectures complètent les identités en mémoire sans
réécrire les fichiers pour une simple consultation.

## Ce qui appartient au locuteur

`Locuteur` conserve son nom local, son rôle d’interviewer, son pseudonyme et son
éventuel état de refus importé, sa couleur, ses `valeursLoc` et son lien de
personne. Les marqueurs `personneDeliee` et `rapprochementsRefuses` mémorisent les
choix qui empêchent certaines propositions automatiques.

`Personne`, au contraire, ne contient que `id` et `nom`. Relier deux locuteurs à
une fiche ne synchronise ni leurs noms, ni leurs pseudonymes, ni leurs valeurs.
Une reprise ponctuelle d’informations est un choix séparé du rapprochement.

Les notes restent également dans leurs entretiens. La fiche Personne affiche
celles qui visent ses locuteurs par `locuteurIds`, sans les déplacer ni les copier.

## Invariants

1. Un tour de parole référence un index de locuteur du même entretien.
2. Renommer une entrée ne réécrit pas les paragraphes qui la référencent.
3. Une personne ne peut pas représenter deux locuteurs du même entretien dans
   les commandes de liaison ou de regroupement.
4. Délier une personne ne supprime ni le locuteur ni ses données.
5. Les pseudonymes de locuteur sont indépendants des règles textuelles.
6. Les suggestions de rapprochement sont recalculées ; seuls les liens et les
   refus décidés sont persistés.

## Carte du code

| Responsabilité | Emplacement |
|---|---|
| Types | `src/shared/format.ts` |
| CRUD local, libellés et couleurs | `src/shared/entretien/locuteurs.ts` |
| Attribution de texte | `src/renderer/editor/attribution.ts` |
| Gouttière | `src/renderer/editor/locuteursGutter.ts` |
| Gestes dans l’entretien | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Inventaire et commandes de personnes | `src/shared/corpus/personnes.ts` |
| Suggestions, refus et reprise de données | `src/shared/corpus/rapprochementsPersonnes.ts` |
| Stockage et dispatch | `src/main/corpusStore.ts`, `src/main/index.ts` |

## Parcours de lecture

- [entretien.md](entretien.md) : attribution, suppression, rôle et pseudonyme.
- [personnes.md](personnes.md) : répertoire, rapprochements, regroupements,
  séparations et disponibilité distante.
- [variables.md](../variables.md) : valeurs portées par chaque locuteur.
- [Notes](../notes/README.md) : liens vers les locuteurs et agrégation.
- [Modèle objet](../../modele-objet.md#locuteurs-et-personnes) : vue d’ensemble du format.
