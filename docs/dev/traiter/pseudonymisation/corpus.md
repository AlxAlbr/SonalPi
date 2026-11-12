# Pseudonymisation au niveau corpus

Le niveau corpus partage des définitions, inventorie leurs usages et coordonne
les opérations qui peuvent toucher plusieurs entretiens.

## Règles partagées

Une règle vit dans `corpus.crp.reglesAnon` :

```ts
interface RegleAnon {
  id: string
  entite: string[]
  pseudos: string[]
  categorie?: string
}
```

L’identifiant est l’autorité qui rattache une annotation à la règle. Les alias et
pseudonymes servent à la détection et à l’affichage, mais ne remplacent pas cette
identité.

Une règle ne possède pas d’état « actif ». Une définition remise en chantier
devient un brouillon local dans un entretien ; elle ne reste pas une règle corpus
mise en veille.

## Scan du corpus

`scannerCorpus` lit les règles et les entretiens pour produire, par règle et par
entretien, les compteurs suivants :

| Compteur | Sens |
|---|---|
| `anon` | Correspondances couvertes par une décision visible d’anonymisation. |
| `exc` | Correspondances couvertes par une exception visible. |
| `non` | Correspondances sans décision, affichées « À anonymiser ». |
| `incl` | Décisions présentes mais masquées par une décision englobante. |

Le scan est une requête. Il ne pose aucune annotation et n’écrit aucun compteur
dans les fichiers. Le détail porte une empreinte du texte, des annotations et de
la définition afin de refuser l’application d’un choix devenu périmé.

L’application en lot depuis le corpus écrit chaque entretien séparément. Les
poses, retraits, ajouts d’exception et retraits d’exception sont explicites ; une
liste vide ne signifie jamais « appliquer partout ».

## Vue d’ensemble des opérations

| Opération | Lit les entretiens | Modifie les décisions | Modifie la règle |
|---|---:|---:|---:|
| Créer ou importer une règle | non | non | oui |
| Appliquer une règle | cibles | oui | non |
| Ajouter une variante | non | non | oui |
| Renommer une variante | tous | choix liés à l’ancien pseudo | oui |
| Retirer une variante | tous | replie les choix liés vers la variante conservée | oui |
| Dissocier une règle | tous | retire uniquement les liens `regle` | supprime la règle |
| Supprimer partout | tous | retire les décisions liées | supprime la règle |

Une opération globale commence par un inventaire frais. Les copies utilisées pour
préparer l’écriture restent privées au main ; le renderer reçoit un bilan, jamais
une autorité modifiable.

## Créer ou importer une règle

La création valide la définition, refuse les collisions d’alias et écrit le seul
`corpus.crp`. Elle ne recherche ni ne pose automatiquement les correspondances.

L’import de règles applique la même séparation : il ajoute ou complète les
définitions, mais ne renomme aucun usage existant. Les identifiants étrangers ne
servent pas à réattribuer une annotation locale.

L’import ciblé de correspondances peut créer des définitions et mettre à jour les
locuteurs explicitement sélectionnés. Il ne pose, ne retire et ne réaffecte aucune
décision textuelle. Une collision entre portée locale et portée corpus exige une
résolution explicite avant l’import.

## Ajouter ou retirer une variante

### Ajouter une variante

L’ajout reçoit la définition complète attendue et le nouveau pseudonyme. Il relit
la règle avant écriture et refuse une définition périmée, un doublon ou une
troisième variante.

Seul `corpus.crp` change. Les annotations, exceptions, brouillons, définitions
locales, locuteurs et personnes restent intacts. L’ajout ne choisit jamais cette
nouvelle variante pour des occurrences existantes.

### Retirer une variante

Le retrait n’est pas un simple changement de tableau. Il exige un bilan global et
un remplacement explicite par la variante qui reste déclarée.

Seules les annotations :

- de type `anon` ;
- explicitement liées à la règle ;
- portant la variante retirée ;

voient leur `pseudo` remplacé. Leur état, leur plage et leur identité restent
inchangés. Les exceptions et décisions incluses sont donc repliées elles aussi si
elles mémorisent cette variante.

Les décisions indépendantes, les choix historiques différents et les mémoires
locales ne sont pas rattachés implicitement.

## Renommer une variante

Le renommage remplace une variante déclarée et les décisions d’anonymisation
liées qui utilisent réellement l’ancien pseudo. Les exceptions conservent leur
état et leur pseudo mémorisé ; elles ne sont pas transformées en décision visible.

Un pseudo identique dans une autre règle produit un avertissement de collision,
mais jamais une fusion. Un changement de casse reste une modification explicite.
Retrait, permutation et renommage sont des intentions distinctes.

Le moteur pur est dans `src/shared/corpus/renommageAnon.ts`.

## Dissocier une règle

La dissociation transforme une portée corpus en portées locales :

1. inventaire de tous les liens explicites vers la règle ;
2. ajout d’une `DefinitionAnonLocale` complète dans chaque entretien concerné ;
3. retrait du champ `regle` des annotations liées ;
4. vérification de l’absence de référence restante ;
5. retrait de la règle du corpus.

Les pseudos choisis, exceptions, décisions incluses, plages et identifiants sont
conservés. Les alias, variantes inutilisées et catégorie de la règle deviennent
la mémoire locale déclarée.

Une définition locale, un brouillon ou une décision indépendante recouvrante est
un obstacle. Le moteur ne fusionne pas ces données et ne choisit pas laquelle
doit gagner.

Une règle sans usage est simplement retirée. Aucun entretien ne reçoit alors une
définition locale arbitraire.

Le moteur pur est dans `src/shared/corpus/dissociationAnon.ts`.

## Supprimer une règle partout

La suppression globale est destructive et distincte de la dissociation :

1. seules les annotations `type:'anon'` dont `regle` correspond sont attribuées à
   la règle ;
2. ces décisions, exceptions et décisions incluses sont retirées ;
3. la règle est retirée après preuve qu’aucun lien ne subsiste.

Le texte original n’est pas modifié : retirer une décision le rend simplement
visible. Une décision indépendante auparavant masquée peut également redevenir
visible ; le bilan le signale.

Les définitions locales, brouillons, locuteurs, personnes et annotations d’autres
règles restent intacts. Un pseudo semblable ne suffit jamais à attribuer une
décision à la règle supprimée.

Le moteur pur est dans `src/shared/corpus/suppressionAnon.ts`.

## Obstacles communs

Les opérations globales refusent notamment :

- une source absente ou dans un format non pris en charge ;
- une plage ou une annotation incohérente ;
- des identifiants d’annotation ambigus ;
- une définition modifiée depuis l’aperçu ;
- une mémoire locale invalide ;
- une collision de portée qui demanderait une fusion implicite ;
- une opération globale incompatible déjà engagée.

Le refus intervient avant la préparation des écritures lorsque la preuve complète
ne peut pas être établie.

## Barrières temporaires

Sur les fournisseurs distants, certaines opérations publient temporairement une
barrière dans `corpus.crp` :

- `dissociationAnon` ;
- `suppressionAnon` ;
- `retraitVarianteAnon`.

La définition reste présente pendant le traitement des entretiens. Les chemins
d’écriture coopérants refusent alors de réintroduire un ancien lien ou un ancien
choix. La barrière et la définition ne sont retirées qu’après le contrôle final.

Ces champs protègent les versions actuelles de l’application ; ils ne fournissent
pas une isolation universelle contre une écriture directe ou un ancien client.

## Carte du code et tests

| Sujet | Code principal | Tests principaux |
|---|---|---|
| Validation des définitions | `definitionsAnon.ts`, `reglesAnon.ts` | `test/definitionsAnon.test.ts`, `test/variantesAnon.test.ts` |
| Scan et application | `scanAnon.ts`, `applicationMasse.ts` | `test/scanAnon.test.ts`, `test/lotAnon.test.ts` |
| Renommage | `renommageAnon.ts` | `test/renommageAnon.test.ts` |
| Retrait de variante | `retraitVarianteAnon.ts` | `test/retraitVarianteAnon.test.ts` |
| Dissociation | `dissociationAnon.ts` | `test/dissociationAnon.test.ts` |
| Suppression globale | `suppressionAnon.ts` | `test/suppressionAnon.test.ts` |
| Correspondances | `tablesCorrespondance.ts`, `importCorrespondancesEntretiens.ts` | `test/importCorrespondancesEntretiens.test.ts` |

Les protocoles de publication et de reprise sont décrits dans
[fournisseurs.md](fournisseurs.md).
