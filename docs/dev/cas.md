# Cas analytiques — modèle et fonctionnement

> Cette page décrit le socle présent dans le code. Les créations en lot, les règles
> d’entretiens entiers, les familles et les attributs saisis ou dérivés sont disponibles.
> L’export QualCoder est accessible depuis Corpus → Exporter le corpus et produit un
> projet `.qda` textuel ; l’audio reste différé.
> Guide fonctionnel : [Utiliser les cas](../user/cas.md).

## 1. Rôle des objets

Un cas est un dossier analytique nommé, constitué de matériaux référencés dans leurs
sources. Il n’est ni une copie de transcription ni un code thématique.

| Objet | Responsabilité |
| --- | --- |
| `EntretienFichier` | Texte, annotations, locuteurs, valeurs générales et repères de passage |
| `Locuteur` | Participation locale à un entretien, rôle, valeurs descriptives et lien facultatif à une personne |
| `Personne` | Identité transverse, indépendante des noms locaux et pseudonymes |
| `Cas` | Unité d’étude, mémo, règles et rattachements manuels |
| `RegleCas` | Critères de sélection automatique des matériaux |
| `RattachementCas` | Relation manuelle entre un cas et un repère d’entretien |
| `ReperePassage` | Bornes vivantes d’une plage dans la transcription |
| `ProjectionCas` | Résultat de lecture calculé : passages, provenance, diagnostics et métriques |

`Personne` contient actuellement `id` et `nom`, pas de valeurs de variables.
Les valeurs restent sur les locuteurs locaux et peuvent varier entre entretiens.
Une personne peut être utilisée par plusieurs cas ; créer une personne ne crée pas
implicitement son cas.

Un recueil est un document éditorial ordonné, avec titres et textes de liaison.
Il peut partager les primitives de repérage avec un cas, mais pas sa sémantique.
Un rattachement de cas ne référence jamais un identifiant de codage ou de commentaire.

## 2. État des fonctionnalités

| Fonction | État dans le code consulté |
| --- | --- |
| Cas créé depuis une personne | Présent, règle dynamique |
| Cas créé depuis une sélection libre | Présent, avec premier rattachement |
| Ajouts manuels à un cas possédant une règle | Présents |
| Association d’une sélection à plusieurs cas | Présente |
| Mémo, renommage, suppression et navigation vers les sources | Présents |
| Repères vivants, provenance et diagnostics | Présents |
| Cas volontairement vide à la création | Présent, sans personne ni repère obligatoire |
| Plusieurs personnes : cas collectif ou un cas par personne | Présent, aperçu et commande atomique de lot |
| Entretiens entiers : cas collectif ou un cas par entretien | Présent, y compris sources vides et futurs ajouts |
| Règles de modalités | Présentes, portées locuteur et entretien distinctes |
| Familles | Présentes, création et complément explicites, dissolution sans cascade |
| Attributs de cas | Présents : définitions, saisies, dérivations propres/familiales et diagnostics frais |
| Vues séparées automatique/manuelle/ensemble | Présentes, avec métriques et diagnostics par vue |
| Projet natif QualCoder `.qda` | Présent via Corpus → Exporter le corpus ; audio et REFI-QDA différés |

Le socle de création vide et de vues séparées est couvert par des tests unitaires,
de persistance et d’interface Electron. L’export QualCoder est couvert par un modèle
de test et une recette Electron ; cela ne certifie pas encore les pertes hors périmètre,
l’audio, les positions Unicode sur toutes les versions Qt ou le rapport de confidentialité.

## 3. Modèle persistant actuel

Types définis dans [cas.ts](../../src/shared/corpus/cas.ts) et
[reperesPassages.ts](../../src/shared/entretien/reperesPassages.ts) :

```ts
interface Cas {
  id: string
  nom: string
  memo: string
  creeLe: string
  modifieLe: string
  regles: RegleCas[]
  rattachements: RattachementCas[]
  familleId?: string
  valeursAttributsSaisis?: Record<string, string>
  derivationsPropres?: DerivationAttributCas[]
}

interface MembrePersonneCas {
  personneId: string
  inclureEnqueteurs: boolean
}

type RegleCas =
  | ({ type: 'personne' } & MembrePersonneCas)
  | { type: 'personnes'; membres: MembrePersonneCas[] }
  | { type: 'entretiens'; entretienIds: string[] }
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'entretien' }
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'locuteur'; inclureEnqueteurs: boolean }

interface RattachementCas {
  id: string
  source: { entretienId: string; repereId: string }
  provenance: 'manuel'
  creeLe: string
}

interface ReperePassage {
  id: string
  from: number
  to: number
}
```

### Répartition entre fichiers

```text
corpus.json
  personnes[personneId]
  attributsCas[attributId] → libellé, type, confidentialité, ordre, modalités de saisie
  famillesCas[familleId] → origine et derivationsAttributs[] partagées
  cas[casId]
    familleId? → organisation, sans seconde liste de membres
    regles[] → personneId, membres[], entretienIds[] ou variableId/modaliteId
    rattachements[] → { entretienId, repereId }
    valeursAttributsSaisis? → attributId vers texte ou modalité
    derivationsPropres? → recettes du cas hors famille

entretiens/<entretienId>.json
  corpsTexte
  locuteurs[] → personneRef
  reperesPassages[] → { id, from, to }
```

Les positions sont des positions ProseMirror, pas des offsets de texte brut.
Elles restent dans l’entretien pour être remappées avec la transcription, sans devoir
modifier `corpus.json` à chaque correction de texte. Le texte du passage n’est jamais
la source de vérité dans le cas.

Le format natif actuel est **8**, défini dans [format.ts](../../src/shared/format.ts).
`corpus.cas` est optionnel dans le type ; la normalisation prend en charge son absence.
La migration 5 → 6 conserve telles quelles les anciennes règles `personne`, leurs filtres
individuels, les cas vides, les ajouts manuels et les recueils. Elle ne matérialise aucun
texte automatique en repère. Corpus et entretiens changent de version selon le protocole
existant, sous verrous en distant. Les migrations depuis les versions antérieures restent
prises en charge. La migration 6 → 7 initialise `famillesCas` sans transformer les anciennes
règles, filtres, dates ou références. La migration 7 → 8 initialise `attributsCas`,
conserve valeurs et recettes valides et met à jour les versions des entretiens sans
matérialiser de valeur dérivée. La finalisation persiste bien `corpus.json` et les
entretiens en local comme dans la transaction distante. Un fichier courant sans collection
facultative reste lisible ; les filtres de vue ne sont pas persistés.

### Invariants

- L’identité du cas est indépendante de son nom.
- Les noms sont uniques après trim, normalisation NFKC et comparaison en minuscules françaises.
- Une nouvelle création peut être volontairement vide, avec nom obligatoire et mémo facultatif.
- Un cas devenu vide est conservé.
- Le même couple cas/source/repère n’est pas ajouté deux fois.
- Des repères distincts aux mêmes bornes restent des objets distincts.
- Un repère peut être référencé par plusieurs cas ou partagé avec un recueil.
- Retirer un rattachement ne supprime pas le repère ni ses autres usages.
- Les règles et les rattachements manuels peuvent coexister sans statut particulier.

La normalisation actuelle exclut les cas entièrement mal formés plutôt que d’en
lire une partie. Une référence syntaxiquement valide mais introuvable est conservée
pour diagnostic. Lors d’une évolution de format, ne pas laisser une ancienne
normalisation supprimer les cas portant les nouvelles règles.

## 4. Résolution et provenance

[projeterCas](../../src/renderer/editor/cas.ts) reçoit les définitions, le cas et les
sources chargées. La lecture n’écrit rien dans le corpus.

### Contribution automatique

La règle de personne sélectionne les paragraphes dont le locuteur local est lié à
`personneId`. Les blocs consécutifs du même locuteur forment une intervention.
Le filtre `inclureEnqueteurs` porte sur le rôle local, pas sur l’identité de la personne.
Les paroles sans locuteur ou d’autres participants ne sont pas retenues par cette règle.
Une règle `personnes` réunit ces interventions en conservant un filtre par membre.

Une règle `entretiens` référence des IDs du membership. La projection recalcule toute
l’étendue du document courant, sans repère fixé à la taille initiale. Elle inclut questions,
réponses et blocs sans locuteur. L’origine est `regle-entretien`. Une source vide reste
un membre disponible, mais ajoute zéro passage textuel et zéro volume. Une source retirée
du corpus et une source illisible ont des diagnostics distincts.

Le chargement déduplique les sources et leur parsing est partagé entre les projections
via `projeterCasDepuisSourcesPreparees`. Les règles d’entretiens ne nécessitent pas
l’inventaire des personnes ni la lecture des entretiens non référencés.

### Modalités et observations locales

Une règle `modalite` utilise les IDs de variable et modalité, jamais leurs libellés.
La portée enregistrée doit correspondre à celle de la variable courante.

- `locuteur` : interventions des participations portant `valeursLoc[variableId]`,
  y compris sans `personneRef` ou sans ID local ancien ; sélection par index local.
  Le filtre enquêteurs porte uniquement sur `interviewer === true` dans chaque source.
- `entretien` : document entier dont `meta.valeursGen[variableId]` correspond à la modalité,
  selon les mêmes bornes dynamiques que les règles d’entretiens entiers.

L’origine `regle-modalite` garde les IDs et l’index local, ou `null` pour une source entière.
`observationsModalite` compte les propriétaires admissibles, même muets, une fois par source :
membres, valeurs absentes, références de valeurs invalides, enquêteurs exclus et sources illisibles.
Les ajouts manuels ne changent aucun de ces compteurs. Il ne s’agit pas des attributs du cas.
Une source indisponible ou invalide porte un diagnostic, jamais une valeur simplement manquante.
Le chargement et le parsing sont partagés entre modalités ; aucun registre de personnes requis.

### Contribution manuelle

La référence `{ entretienId, repereId }` est résolue dans l’entretien courant.
Les primitives de [passages.ts](../../src/renderer/editor/passages.ts) produisent texte,
locuteurs et état : disponible, repère orphelin/introuvable, entretien hors corpus,
source invalide ou indisponible. Les règles diagnostiquent aussi une personne absente.

Une source inaccessible n’est pas une preuve d’absence de matériaux.
Un repère dont `from >= to` reste présent, mais son texte n’est plus exploitable.

### Chevauchements

La projection conserve les contributions avec leurs origines. Les métriques de volume
calculent leur union par entretien pour ne compter chaque zone qu’une fois.
`ProjectionCas.vues` fournit trois résultats : `tous`, `regles` et `manuels`, avec passages,
diagnostics et métriques propres. Les champs de premier niveau de la projection restent
ceux de l’ensemble complet ; filtrer la lecture ne modifie pas les matériaux du cas.
Le composable expose `modeMateriauxCas` et `vueMateriauxCas`, sans nouvelle écriture ni
relecture des sources au changement de filtre. Le filtre revient à `tous` au changement
de cas ou de corpus.

Le nombre de passages peut donc dépasser le nombre de plages distinctes de cette union.
Le nombre de mots sans double compte n’est pas un nombre de formes lexicales différentes.
Les métriques textuelles actuelles sont calculées sur le texte original, même lorsque
les extraits sont affichés pseudonymisés.

Si un passage automatique est aussi ajouté manuellement, retirer le rattachement
manuel n’efface pas sa contribution automatique. Modifier ou supprimer un codage
n’a aucun effet sur le rattachement autonome.

## 5. Commandes, écritures et concurrence

`CommandeCas` expose actuellement : création, création en lot (`creer-lot`), renommage,
modification du mémo, suppression du cas, ajout multi-cas et retrait d’un rattachement,
les commandes familiales, ainsi que création/modification/suppression de définition,
saisie de valeur et ajout/retrait de dérivation propre ou familiale.
Le renderer ne remplace pas toute la collection depuis une copie périmée.

Pour un lot, l’aperçu alloue les identités, propose des noms uniques et signale les cas
utilisant déjà les mêmes critères. Les homonymes ne sont pas fusionnés. La commande
valide tous les cas sur une copie de travail avant toute mutation du dictionnaire cible ;
une collision de nom, d’identité ou une source supprimée refuse tout le lot. Le store
persiste la commande par une seule écriture corpus. Un rejeu avec les mêmes identités et
le même contenu ne recrée rien. Après une réponse perdue, le renderer conserve la commande
exacte jusqu’à confirmation ou abandon explicite ; abandonner ne constitue pas un rollback.

Pour une sélection nouvelle :

1. Revalider la sélection et créer son repère dans l’entretien.
2. Enregistrer l’entretien ; en distant, publier la source avant la référence corpus.
3. Vérifier l’existence du repère depuis le main.
4. Appliquer la commande ciblée aux définitions courantes du corpus.
5. Annoncer le succès après confirmation de l’association.

[casOrchestration.ts](../../src/main/casOrchestration.ts) assure l’ordre
publication/vérification/commande de définitions. Les transactions distantes utilisent un verrou corpus court, une lecture fraîche et
une écriture conditionnelle. L’ajout d’une dérivation verrouille et relit aussi tous les
entretiens de contrôle ; les sources restent inchangées et seule la définition corpus est
publiée. Les sources détenues par la session sont publiées avant ce contrôle. Aucun choix
utilisateur ne maintient un verrou de transaction ouvert.

Si le repère a été enregistré mais pas l’association, le composable conserve une
tentative avec les mêmes identifiants. Le rejeu d’un ajout identique évite une duplication ;
un identifiant réutilisé avec un contenu différent est un conflit.
Toutes les commandes ne sont pas des opérations sans effet au rejeu : un retrait déjà
effectué est signalé, par exemple. Les préconditions protègent les renommages et suppressions.

Supprimer un cas ne supprime ni personne, ni entretien, ni annotation.
Le retrait volontaire d’un entretien retire ses rattachements manuels après confirmation,
mais conserve les cas et les règles. La confirmation et son empreinte incluent aussi les
cas utilisant cet entretien entier. Une indisponibilité temporaire ne provoque pas ce retrait.
La suppression d’une personne utilisée par une règle est refusée avec les noms des cas
concernés. Une fusion redirige les règles vers l’identité conservée et déduplique leurs
membres ; si l’une des règles incluait les enquêteurs, leur union conserve cette inclusion.
La séparation d’une personne n’ajoute pas implicitement la nouvelle identité aux cas.

### Commandes familiales

`FamilleCas` contient `id`, `nom`, `creeLe` et `origine` : `variableId`, `portee`,
`inclureEnqueteurs` uniquement pour les locuteurs. `corpus.famillesCas` porte les recettes ;
les membres se déduisent exclusivement de `Cas.familleId`. Aucun cas agrégat n’est ajouté.
Les noms de familles sont uniques entre familles, les noms de cas entre tous les cas.
Deux familles d’une même variable sont autorisées par création explicite, sous noms distincts.

La création et le complément portent la famille attendue et les nouveaux cas à IDs stables.
Le modèle valide l’ensemble sur une copie avant mutation, puis le store écrit un seul corpus.
Une modalité ne peut apparaître qu’une fois dans une famille. Deux compléments concurrents
sur la même modalité refusent le second lot entier plutôt que fusionner des identités.
La création ordinaire ne permet pas de contourner la commande familiale.
Un rejeu exact n’ajoute rien ; réutiliser une identité avec un contenu différent est un conflit,
y compris si un tiers a modifié ce cas après la première publication.

L’aperçu montre toutes les modalités déclarées : celles observées sont présélectionnées,
les autres nécessitent une sélection explicite. Les membres muets comptent comme observés.
Les sources illisibles rendent l’aperçu incomplet ; enregistrer conserve la recette, pas
une certification de vide. Les définitions sont revalidées dans la transaction fraîche.
Aucune lecture, actualisation ou projection ne crée de cas pour une nouvelle modalité.
La commande en attente survit à la fermeture de la fenêtre et réutilise ses IDs après
réponse perdue. Un changement de corpus invalide aperçu, tentative et réponse retardée.

La dissolution compare la famille et la liste attendue des IDs de membres : un complément
concurrent impose une nouvelle confirmation. Elle efface seulement l’organisation et les
`familleId`, conserve règles, noms, mémos et rattachements, et se rejoue sans cascade.
Une famille vide après suppression de ses cas reste visible et peut être dissoute.
Les usages de variables/modalités comprennent familles et règles, en local comme en distant.
Une variable utilisée ne peut pas changer de portée ; renommer ses libellés ne renomme pas les cas.
Dissoudre ne libère donc pas une variable encore référencée par les règles des cas détachés.

Le canal IPC générique `casCommander(CommandeCas)` et son retour `CorpusFichier` portent
ces commandes sans nouveau canal. L’orchestration conserve publication préalable des repères,
GET frais sous verrou et PUT conditionnel. Le cycle local/distant charge aussi `famillesCas` ;
les changements de définitions et les sources sauvegardées invalident les projections.

## 6. Extensions du modèle validées

### Socle présent : un seul objet Cas, deux modes de lecture

Conserver `regles[]` et `rattachements[]` :

- aucune règle : **Manuel**, éventuellement vide dès sa création ;
- règle présente : **Avec règle**, avec ou sans enrichissement manuel.

« Mixte » décrit une combinaison, pas un troisième type ni un statut de migration.
Tous les cas éditables peuvent recevoir des ajouts. Les exclusions individuelles des
résultats automatiques restent hors périmètre ; les ajouts manuels sont retirables.

Les vues séparent automatique, manuel et ensemble, avec métriques propres.
Les rattachements manuels survivent à un changement de critères.

### Règles disponibles

```text
Personnes : membres { personneId, inclureEnqueteurs }[]
Entretiens : entretienIds[]
Modalité : variableId, modaliteId, portee, filtre enquêteurs si locuteur
```

Les nouveaux parcours produisent une règle avec une liste pour une union homogène.
Les anciennes règles multiples de personne conservent leur sémantique et leurs filtres.
Il n’est pas prévu de construire arbitrairement des unions de règles hétérogènes.

- Personnes : interventions locales des identités choisies.
- Entretiens : sources entières, y compris leurs futurs ajouts.
- Variable de locuteur : interventions des locuteurs portant localement la modalité,
  même sans identité Personne associée.
- Variable d’entretien : textes complets des entretiens portant la modalité.

Les créations depuis plusieurs personnes ou fichiers proposent **un cas collectif**
ou **un cas par élément**. La création en lot n’impose pas une famille persistante.
L’éditeur de critères d’un cas existant reste à implémenter ; la fiche expose actuellement
ses critères en lecture seule.

### Attributs présents

`DefinitionAttributCas` est un registre séparé des variables EAV : ID, libellé, type
`texte | modalites`, confidentialité, ordre et modalités de saisie. Les valeurs saisies
vivent sur le cas. `DerivationAttributCas` conserve seulement l’attribut cible, la variable
source et sa portée ; aucune valeur calculée n’est persistée.

Une dérivation propre est réservée à un cas avec règle hors famille. Un membre de famille
reçoit ses dérivations exclusivement depuis `FamilleCas.derivationsAttributs`, tout en
conservant ses valeurs saisies. Un attribut ne peut pas être à la fois saisi et dérivé
sous le même ID pour un cas.

[observationsAttributs.ts](../../src/shared/corpus/observationsAttributs.ts) énumère les
propriétaires admissibles, calcule statuts et observations puis projette valeurs saisies
et recettes. Le renderer réutilise les sources déjà chargées pour les matériaux et recalcule
les attributs à chaque actualisation, sauvegarde de source, changement de cas, variable,
famille ou membership.

Ne pas étendre implicitement `Variable.portee` à `cas` : les variables sources conservent
leurs deux portées actuelles. Une nouvelle définition issue d’une variable privée est
proposée privée par défaut dans l’interface ; la confidentialité reste éditable et visible.

## 7. Contrat des attributs dérivés

La dérivation utilise **exclusivement les membres sélectionnés par la règle**.
Les ajouts manuels n’ajoutent aucune observation, valeur manquante ou contradiction.
Une saisie manuelle ne doit pas masquer une dérivation invalide sous le même attribut.

Exemple : un locuteur de B décrit A. Son passage ajouté au cas A sera un matériau de A,
mais sa valeur Taille ne participera pas au calcul de l’attribut de A.

Les variables doivent être de **même portée** que les observations sélectionnées :

- personnes ou variable de locuteur → valeurs de variables de locuteur ;
- entretiens ou variable d’entretien → valeurs de variables d’entretien.

Les dérivations entre portées sont différées. L’égalité de valeurs ne suffit pas à
justifier une dérivation : l’utilisateur choisit la propriété pertinente.

Pour chaque cas et variable, énumérer les propriétaires admissibles, y compris sans
intervention, et dédupliquer les observations par propriétaire, pas par passage.
Comparer les IDs de modalités au sein d’une même variable.

| Observations | Résultat |
| --- | --- |
| Aucune valeur | Attribut absent |
| Une valeur distincte, sans manque | Disponible |
| Une valeur distincte et des manques | Disponible avec avertissement |
| Plusieurs valeurs distinctes | Indisponible pour cette dérivation |
| Lecture nécessaire impossible ou référence invalide | Non vérifiable, indisponible |

Le contrôle porte sur tous les entretiens concernés, pas seulement entretien par
entretien. Une variation peut être légitime : deux âges ne prouvent pas une erreur,
mais interdisent un âge unique non daté sur ce périmètre.

**Politique familiale stricte :** si Taille est incohérente pour A, Taille est indisponible
pour A/B/C. Les autres attributs restent utilisables. Aucun choix partiel par cas.
Une dérivation devenue invalide conserve sa recette et son diagnostic, pas une ancienne
valeur présentée comme encore valide. `suspensionFamille` garde le diagnostic local mais
masque valeur et libellé pour tous les membres dès qu’un cas est conflictuel ou non vérifiable.
Après correction, l’actualisation recalcule et réactive la valeur.

La valeur dérivée et les diagnostics sont des résultats, pas des copies persistées
faisant autorité. Leur confidentialité dépend aussi de celle de la variable source.

## 8. Export et protection des données

L’export prévu produit un projet natif QualCoder `.qda`, ciblant l’installation locale
`/home/belignem/Vscode/QualCoder`. Audio et REFI-QDA ne conditionnent pas ce premier export.
Aucun exporteur natif QualCoder n’est disponible dans le socle décrit ici.

Conserver les transcriptions complètes comme sources et projeter l’union des matériaux
d’un cas vers les plages QualCoder. Un filtre de lecture automatique/manuelle ne doit
pas omettre silencieusement des matériaux lors de l’export.
Les règles deviennent un résultat daté : leur dynamisme n’est pas conservé dans la cible.

Les positions ProseMirror ne sont pas directement exportables. Produire texte final
et correspondances de positions ensemble, après choix de pseudonymisation ; valider
Unicode, préfixes de locuteurs et remplacements de longueur différente dans QualCoder.
`textePassage()` est une extraction pour lecture, pas cette projection complète.

Le mode pseudonymisé actuel n’est pas une garantie d’anonymat : noms et mémos des cas
ne sont pas automatiquement transformés, et un locuteur sans pseudo peut rester nommé.
L’export doit contrôler textes, attributs, familles, notes, commentaires, auteurs et rapports.
Une appartenance à une famille issue d’une variable privée peut être sensible en elle-même.

## 9. Carte du code et validation

| Fichier | Responsabilité |
| --- | --- |
| [shared/corpus/cas.ts](../../src/shared/corpus/cas.ts) | Types, définitions d’attributs, commandes, normalisation et usages |
| [shared/corpus/observationsAttributs.ts](../../src/shared/corpus/observationsAttributs.ts) | Observations, diagnostics, politique familiale et projection des attributs |
| [shared/format.ts](../../src/shared/format.ts) | Format natif et relation corpus/entretiens |
| [shared/entretien/reperesPassages.ts](../../src/shared/entretien/reperesPassages.ts) | Repères autonomes et orphelins |
| [renderer/editor/remap.ts](../../src/renderer/editor/remap.ts) | Remappage avec les éditions |
| [renderer/editor/passages.ts](../../src/renderer/editor/passages.ts) | Lecture et diagnostic des passages référencés |
| [renderer/editor/cas.ts](../../src/renderer/editor/cas.ts) | Projection des règles et rattachements, métriques |
| [main/casOrchestration.ts](../../src/main/casOrchestration.ts) | Publication avant commande corpus |
| [main/corpusStore.ts](../../src/main/corpusStore.ts) | Persistance locale et migration |
| [main/distant/transactions.ts](../../src/main/distant/transactions.ts) | Transactions de définitions distantes |
| [renderer/composables/corpus/useCasCorpus.ts](../../src/renderer/composables/corpus/useCasCorpus.ts) | Chargement, sélection, commandes et reprise d’association |
| [renderer/components/corpus/CasCorpus.vue](../../src/renderer/components/corpus/CasCorpus.vue) | Répertoire, fiche et parcours actuels |
| [renderer/components/corpus/DefinitionsAttributsCas.vue](../../src/renderer/components/corpus/DefinitionsAttributsCas.vue) | Registre, modalités de saisie et confidentialité |
| [renderer/components/corpus/AttributsCasFiche.vue](../../src/renderer/components/corpus/AttributsCasFiche.vue) | Saisies, dérivations propres et diagnostics du cas |
| [renderer/components/corpus/AttributsFamilleFiche.vue](../../src/renderer/components/corpus/AttributsFamilleFiche.vue) | Recettes partagées, disponibilité et valeurs par membre |
| [renderer/components/corpus/CreationFamilleCas.vue](../../src/renderer/components/corpus/CreationFamilleCas.vue) | Aperçu des deux portées, sélection opt-in et reprise de création/complément |
| [renderer/components/corpus/CreationLotCas.vue](../../src/renderer/components/corpus/CreationLotCas.vue) | Sélection multiple, aperçu, contrôle des noms et reprise de création |
| [renderer/components/CasModale.vue](../../src/renderer/components/CasModale.vue) | Fenêtre globale |

Les tests existants se trouvent dans `test/cas*.test.ts`, `test/personnes.test.ts`,
`test/webdav/transactions.test.ts` et les scénarios `e2e/cas*.e2e.ts`.
Les tests couvrent modèle, observations, projection, store, reprise renderer, migrations
jusqu’à v8, contrôle frais distant, concurrence et confidentialité. Les parcours Electron
couvrent notamment 30 cas individuels, leur collectif, familles aux deux portées, saisie,
dérivation familiale, suspension après conflit et réactivation après correction.
Lors de l’extension, couvrir en particulier :

- migration des cas avec et sans ajouts, sans conversion spéciale des mixtes ;
- lot rejoué sans doublons, règle dynamique et ajout multi-cas ;
- retrait manuel laissant une contribution automatique recouvrante ;
- membres sans texte, valeurs manquantes et lectures incomplètes ;
- ajouts sans effet sur les attributs, conflit familial puis correction ;
- références supprimées, sources distantes modifiées, réponse réseau perdue ;
- export avec texte exact, attributs aux bonnes portées et confidentialité des rapports.

Une évolution des structures exige une migration explicite vers la prochaine version
native disponible. Préserver règles, filtres, repères, rattachements et recueils existants.
Les bancs Nextcloud utilisent les images déjà présentes : aucun téléchargement Docker.

Pour le suivi des travaux, voir [le plan des cas](../../plans/encours/plan-cas2.md)
et [le plan d’export](../../plans/encours/plan-export-sonalpi.md).
