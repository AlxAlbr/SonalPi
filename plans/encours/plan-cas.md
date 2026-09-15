# Plan — cas analytiques persistants

> Objectif : permettre de constituer dans SonalPi des cas compatibles avec le
> travail attendu dans QualCoder, puis de les exporter avec leurs passages.
> Les cas sont accessibles par un bouton **Cas** placé à côté de **Recueils**.
> Ils réutilisent les repères de passage vivants, mais ne sont pas des recueils.
> L’export REFI-QDA reste un chantier distinct. Sa preuve d’import est requise
> avant de développer l’adaptateur, pas avant de commencer les cas dans SonalPi.

## 1. Décisions de départ

Décisions issues de la réflexion actuelle :

1. Un cas est une unité d’étude persistante : personne, organisation, groupe,
   situation, événement ou autre objet analytique nommé.
2. Une sélection libre peut être associée à un ou plusieurs cas, comme avec
   l’action « Mark » de QualCoder.
3. Le rattachement porte sur la plage de texte, jamais sur une annotation.
4. Un cas et un recueil sont deux objets métier distincts.
5. Aucun recueil n’est converti en cas dans ce chantier.
6. Les cas et les recueils peuvent partager les primitives techniques
   d’ancrage, de résolution et de diagnostic.
7. Les passages restent dans leurs entretiens ; ils ne sont jamais copiés dans
   le cas comme source de vérité.
8. Le premier livrable crée un cas soit depuis une personne, soit avec une
   première sélection manuelle. Les règles d’entretien ou de modalité, les
   attributs structurés et les liens de notes viennent ensuite.
9. L’interface ne propose pas de cas volontairement vide avec seulement un nom
   et un mémo. Un cas peut néanmoins devenir vide si ses matériaux disparaissent.
10. Le cas doit être utile avant l’export : on peut le créer, le relire, vérifier
   ses matériaux et ouvrir leur contexte dans SonalPi.
11. L’export QualCoder consomme les cas ; il ne doit pas être le seul endroit où
    leurs rattachements manuels existent.

## 2. Pourquoi le cas n’est pas un recueil

### 2.1 Cas QualCoder

Dans QualCoder, l’utilisateur sélectionne un cas, surligne librement une portion
d’un document puis choisit « Mark ». QualCoder enregistre une relation dans
`case_text` :

```text
caseid, fid, pos0, pos1, owner, date, memo
```

Cette relation signifie que la plage `[pos0, pos1[` de la source relève du cas.
Elle ne crée ni code, ni annotation, ni document composé. Le soulignement est
reconstruit à l’affichage depuis la relation persistée.

Le cas porte également un nom, un mémo et des attributs. Il sert à consulter ou
filtrer ensemble les matériaux d’une unité d’étude.

QualCoder autorise techniquement la création d’un cas encore vide : une ligne
`cases` peut exister avant toute ligne `case_text`, avec un mémo et des attributs
vides. Cette possibilité facilite notamment la préparation d’une liste de cas ou
leur import tabulaire avant l’affectation des sources. Elle ne signifie pas qu’un
nom et un mémo suffisent à donner une utilité analytique au cas.

### 2.2 Recueil SonalPi

Un recueil est un document éditorial ordonné. Comme dans SonalPi V1, il permet :

- d’organiser des citations dans un ordre choisi ;
- de créer des titres hiérarchiques ;
- d’intercaler des textes de liaison ;
- de commenter chaque citation ;
- de déplacer des items ou des sections ;
- de produire un document Markdown ou texte brut.

La V2 remplace la copie faisant autorité par un passage vivant, mais conserve
cette finalité éditoriale.

### 2.3 Différence visible dans le produit

| Recueil | Cas |
| --- | --- |
| Prépare une synthèse ou un article | Définit une unité d’étude |
| Liste ordonnée | Ensemble sans ordre éditorial |
| Titres et textes libres | Nom, mémo et attributs |
| Commentaire par citation | Provenance du rattachement |
| Une citation peut être répétée volontairement | Un doublon identique est accidentel |
| Exporté comme document | Exporté comme objet QDA interrogeable |

Exemple :

- le cas **Marie** rassemble les passages associés à Marie ;
- le recueil **Article sur les trajectoires professionnelles** agence des
  passages de Marie, Paul et Léa sous plusieurs sections avec des transitions.

Le partage d’un `ReperePassage` ne transforme jamais l’un de ces objets en
l’autre.

### 2.4 Cas, thème ou variable ?

Le nom seul ne permet pas de décider. Il faut regarder la question analytique :

| Notion | Question principale |
| --- | --- |
| Thème | « De quoi parle ce passage ? Quel concept illustre-t-il ? » |
| Variable | « Quelle propriété possède cette personne, ce locuteur ou cet entretien ? » |
| Cas | « À quelle unité identifiée ces matériaux appartiennent-ils ou se rapportent-ils ? » |

**« Mobilisation »** est normalement un thème si l’on code toutes les évocations
du phénomène. **« Mobilisation de l’usine A en mars 2024 »** peut devenir un cas
si cet événement précis constitue une unité étudiée à travers plusieurs sources,
y compris des passages qui ne prononcent pas le mot « mobilisation ».

**« Établissement = A »** est d’abord une modalité de variable si elle décrit les
entretiens ou locuteurs. Si l’établissement A devient lui-même une unité comparée,
porte des attributs propres et rassemble des matériaux de plusieurs sources, un
cas peut être généré depuis cette modalité. Il ne faut pas recopier manuellement
une information que la variable permet déjà de résoudre.

Avant de créer un cas, l’interface doit donc pouvoir répondre à deux questions :

1. quelle unité précise ce cas représente-t-il ?
2. par quelle règle ou quel premier passage ses matériaux sont-ils définis ?

Un nom et un mémo sans règle ni matériau constituent au mieux un brouillon. Même
si QualCoder l’autorise, SonalPi ne le propose pas dans le parcours ordinaire.

## 3. Périmètre du premier livrable

### Inclus

- bouton global **Cas** à côté de **Recueils** ;
- création d’un cas depuis une personne, avec aperçu de ses interventions ;
- création d’un cas manuel avec une première sélection libre ;
- renommage, modification du mémo et suppression d’un cas ;
- liste et recherche des cas ;
- association d’une nouvelle sélection libre à un ou plusieurs cas ;
- consultation des passages, groupés par entretien ;
- ouverture d’un passage dans son contexte source ;
- retrait d’un passage du cas sans effet sur la source ;
- texte vivant suivant les corrections de transcription ;
- diagnostics des repères orphelins et sources indisponibles ;
- affichage pseudonymisé par défaut, avec bascule locale vers l’original ;
- persistance locale et distante avec commandes ciblées ;
- projection métier réutilisable par le futur export QualCoder.

### Exclus du premier livrable

- création depuis un entretien ou une modalité ;
- règles dynamiques autres que la règle de personne ;
- exclusions manuelles de résultats automatiques ;
- attributs structurés propres aux cas ;
- association de notes existantes ;
- traitements lexicométriques filtrés par cas ;
- export REFI-QDA complet ;
- conversion entre cas et recueils ;
- médias, plages temporelles et codages audiovisuels.

Le premier livrable valide ainsi les deux usages principaux : un cas personnel
alimenté par une identité déjà structurée, et un cas manuel commencé depuis un
passage concret. Il ne crée pas de fiche vide sans appartenance définie.

## 4. Invariants métier

1. L’identité du cas est opaque et stable, indépendante de son nom.
2. Le nom est obligatoire et unique dans le corpus après normalisation définie.
3. Un cas nouveau possède au moins une règle de personne ou un rattachement
   manuel initial.
4. Un cas peut devenir vide si son dernier rattachement est retiré, si sa règle
   ne produit plus de passage ou si ses sources deviennent indisponibles ; il
   reste alors visible avec un diagnostic.
5. Un rattachement manuel désigne un cas et un repère d’entretien.
6. Un même repère peut être rattaché à plusieurs cas.
7. Le même couple `{ casId, entretienId, repereId }` n’est enregistré qu’une fois.
8. Deux repères différents ayant le même texte ou les mêmes bornes ne sont pas
   fusionnés automatiquement.
9. Le cas n’impose aucun ordre persistant à ses passages.
10. Un rattachement n’est ni un codage, ni un commentaire, ni une annotation.
11. Modifier ou supprimer une annotation ne modifie aucun rattachement de cas.
12. Retirer un rattachement ne supprime ni le repère, ni le texte, ni les autres
    usages du repère.
13. Supprimer un cas ne supprime aucune personne, source, annotation, note ou
    donnée descriptive.
14. Une référence cassée accidentellement reste visible et diagnostiquée. La
    suppression volontaire d’un entretien retire explicitement ses
    rattachements manuels après confirmation.
15. La lecture ou la projection d’un cas ne provoque aucune écriture.
16. Le mode original ou pseudonymisé est un choix de vue ou d’export, pas une
    copie du texte conservée dans le cas.

### 4.1 Unicité des noms

Proposition : comparer les noms après trim, normalisation Unicode et passage en
minuscules. Refuser par exemple la coexistence de `Marie`, ` marie ` et une forme
Unicode visuellement identique.

L’identifiant reste néanmoins la vérité. Deux dossiers portant sur la même
personne doivent recevoir des noms explicites, par exemple `Marie — vague 1` et
`Marie — vague 2`.

Cette contrainte simplifie l’interface et évite les collisions à l’import dans
QualCoder, où les noms de cas sont uniques.

## 5. Modèle persistant minimal

Noms indicatifs :

```ts
interface SourcePassageCas {
  entretienId: string
  repereId: string
}

interface RattachementCas {
  id: string
  source: SourcePassageCas
  provenance: 'manuel'
  creeLe: string
}

type RegleCas = {
  type: 'personne'
  personneId: string
  inclureEnqueteurs: boolean
}

interface Cas {
  id: string
  nom: string
  memo: string
  creeLe: string
  modifieLe: string
  regles: RegleCas[]
  rattachements: RattachementCas[]
}
```

Dans `CorpusFichier` :

```ts
cas?: Record<string, Cas>
```

### 5.1 Pourquoi les rattachements vivent avec le cas

La vue d’un cas doit pouvoir retrouver directement toutes ses sources sans
parcourir tous les entretiens. Les bornes restent toutefois dans
`EntretienFichier.reperesPassages`, afin qu’elles soient remappées avec le texte.

Le modèle est donc réparti :

```text
corpus.json
  cas[casId].rattachements[]
    -> { entretienId, repereId }

entretiens/<entretienId>.json
  reperesPassages[]
    -> { id, from, to }
```

Cette structure reprend le contrat des recueils sans reprendre leurs items,
leurs titres ou leur ordre. Les passages produits par `regles` sont dérivés et
ne sont pas recopiés dans `rattachements`.

### 5.2 Réutilisation et partage des repères

Une sélection associée simultanément à plusieurs cas crée un seul repère et un
rattachement dans chacun des cas choisis.

Un ajout ultérieur depuis une nouvelle sélection crée normalement un nouveau
repère, même si ses bornes ressemblent à un passage déjà recueilli ou rattaché.
Aucun rapprochement par texte ou positions n’est automatique.

Un repère peut techniquement être référencé par un recueil et un cas, mais cette
situation ne crée aucun lien métier entre eux. Supprimer l’un des usages ne
modifie pas l’autre.

### 5.3 Généraliser le nom de la primitive

Le commentaire actuel de `ReperePassage` indique qu’il est référencé par un
recueil. Le type est déjà assez générique pour les cas. Actualiser sa
documentation et les messages d’erreur pour parler de « passage référencé » et
non seulement de « passage recueilli ».

Ne pas créer `ReperePassageCas`, qui dupliquerait le remappage, la migration et
les diagnostics.

## 6. Commandes métier

Créer `src/shared/corpus/cas.ts` avec des fonctions pures et des commandes
ciblées :

```ts
type CommandeCas =
  | { type: 'creer'; cas: Cas }
  | { type: 'renommer'; casId: string; attendu: string; nom: string }
  | { type: 'modifier-memo'; casId: string; attendu: string; memo: string }
  | { type: 'supprimer-cas'; casId: string; attenduModifieLe: string }
  | {
      type: 'ajouter-rattachements'
      casIds: string[]
      rattachement: RattachementCas
    }
  | {
      type: 'retirer-rattachement'
      casId: string
      rattachementId: string
      attendu: RattachementCas
    }
```

Règles :

- `creer` refuse un cas sans règle et sans rattachement initial ;
- une règle de personne référence un `Personne.id`, jamais son nom ;
- les mutations relisent toujours le `corpus.json` courant ;
- le renderer n’envoie jamais une copie complète des cas à remplacer ;
- l’ajout multi-cas est une seule commande corpus afin d’éviter un succès
  partiel entre les cas ;
- la même commande rejouée après une réponse perdue est idempotente ;
- un identifiant de rattachement déjà utilisé avec un contenu différent est un
  conflit ;
- les erreurs distinguent cas supprimé, cas renommé, rattachement déjà retiré et
  référence de passage absente.

Pour l’ajout multi-cas, un rattachement partagé peut conserver le même identifiant
dans chaque cas. Son identité désigne alors l’opération d’association d’une même
sélection ; l’unicité effective reste le couple cas/rattachement.

## 7. Parcours d’association d’une sélection

### 7.1 Déclenchement

Dans le menu contextuel d’une sélection libre, ajouter :

```text
🗂 Associer à un cas…
📌 Ajouter au recueil…
```

L’action Cas n’apparaît que si `cible.plageSelection` est non vide. Un clic droit
sur une annotation sans sélection ne la fait pas apparaître.

Une sélection peut être couverte par des codes ou commentaires : cela ne change
rien. Le rattachement créé reste indépendant de ces annotations.

### 7.2 Choix des cas

Ouvrir la fenêtre Cas en mode association :

```text
Associer cette sélection à un ou plusieurs cas

Entretien : Entretien collectif A
Passage : « Depuis cet événement… »

Rechercher un cas : [________________]
☐ Marie
☐ Établissement A
☐ Épisode de mobilisation

[+ Créer un nouveau cas]

                         [Annuler] [Associer la sélection]
```

- afficher la sélection et sa source ;
- permettre de rechercher les cas ;
- autoriser plusieurs cases à cocher ;
- permettre de créer un nouveau cas sans quitter le parcours ;
- confirmer avec « Associer la sélection » ;
- ne créer aucune donnée si l’utilisateur annule avant confirmation.

La création intégrée demande le nom et un mémo facultatif, puis sélectionne le
nouveau cas dans la liste. Le bouton final devient « Créer et associer » si aucun
cas n’existait auparavant.

### 7.3 Ordre des écritures

Après confirmation :

1. revalider la sélection et l’entretien courant ;
2. créer un `ReperePassage` dans l’entretien ;
3. sauvegarder et, en distant, publier l’entretien ;
4. vérifier depuis le main que le repère existe dans la source publiée ;
5. exécuter la commande corpus qui rattache ce repère à tous les cas choisis ;
6. actualiser la fenêtre et annoncer le succès seulement après confirmation.

Ne pas maintenir le verrou corpus pendant le choix des cas. Le verrou court
n’est pris qu’à l’étape 5.

Si l’étape 5 échoue, le repère inutilisé reste sans danger et l’opération peut
être rejouée avec le même identifiant. Afficher un message permettant de réessayer
ou d’abandonner la tentative locale.

### 7.4 Sélection devenue invalide

La fenêtre modale empêche l’édition locale du document pendant le choix. Avant la
création du repère, vérifier néanmoins :

- que le même entretien est encore ouvert ;
- que la session est toujours éditable ;
- que la sélection est non vide ;
- que les bornes correspondent à la version courante.

En cas de changement de version non remappable, fermer le parcours avec une
explication et demander de sélectionner à nouveau. Ne jamais appliquer des
bornes capturées sur un autre document.

## 8. Fenêtre Cas

### 8.1 Accès global

Dans `src/renderer/App.vue`, placer le bouton **Cas** immédiatement à côté de
**Recueils** :

```text
SonalPi2 — à jour        [🗂 Cas] [📌 Recueils]
```

Le bouton est visible dans les vues corpus et entretien, pas à l’accueil.

Créer `src/renderer/components/CasModale.vue`, parallèle à
`RecueilsModale.vue`. Une seule grande fenêtre métier est ouverte à la fois :
ouvrir Cas ferme Recueils, et inversement.

### 8.2 Création d’un cas

Depuis la fenêtre Cas, **Nouveau cas** demande d’abord comment ses matériaux sont
définis :

```text
Créer un cas à partir de :

[Une personne…]
  Réunit dynamiquement ses interventions dans les entretiens.

[La sélection actuelle…]
  Crée un cas manuel avec ce premier passage.
  Indisponible si aucun passage n’est sélectionné.

Plus tard :
[Un entretien…] [Une modalité de variable…]
```

Aucune option « Cas vide » n’est proposée dans le parcours ordinaire.

#### Depuis une personne

L’utilisateur choisit une personne existante, puis voit un aperçu : entretiens,
locuteurs liés, nombre de passages, rôle des enquêteurs et sources indisponibles.
Le nom du cas est initialisé depuis la personne mais reste distinct. Le mémo est
facultatif.

```text
Créer depuis une personne

Personne *  [Marie__________________]
Nom du cas  [Marie__________________]
☐ Inclure les interventions où le locuteur est enquêteur

Aperçu : 3 entretiens · 48 interventions · 1 source indisponible
Mémo — facultatif
[__________________________________]

                           [Annuler] [Créer le cas]
```

La création enregistre une règle référencée par `Personne.id`. Elle ne matérialise
pas chaque intervention comme rattachement manuel.

#### Depuis une sélection

Ce parcours est disponible lorsqu’un entretien porte une sélection libre. Il
demande un nom et un mémo facultatif, montre le premier passage, puis propose
**Créer et associer la sélection**. Le cas n’est enregistré qu’avec son premier
rattachement.

Le nom est validé avant enregistrement. Un doublon affiche le cas existant et
propose d’y associer la sélection plutôt que de créer silencieusement une seconde
identité.

### 8.3 Mode d’alimentation, pas « type de cas »

Personne, organisation, groupe, situation et événement sont des interprétations
scientifiques ; QualCoder ne les impose pas comme types structurels. Le dialogue
ne demande donc pas « Quel type de cas ? ».

Il demande en revanche **comment le cas est alimenté** : personne ou premier
passage dans le périmètre initial, puis entretien ou modalité ultérieurement.
Cette distinction change réellement le calcul et la mise à jour des matériaux.

Les modes futurs restent des parcours séparés avec aperçu :

```text
[Créer depuis un entretien…]
[Créer par modalités d’une variable…]
```

« Établissement A » doit être généré depuis la modalité correspondante lorsque
celle-ci existe, plutôt que recréé manuellement sous le même nom.

### 8.4 Organisation

La fenêtre comporte deux colonnes :

**Répertoire à gauche** :

- recherche ;
- bouton « Nouveau cas » ;
- liste alphabétique ;
- nom et nombre de passages ;
- badges de problèmes ;
- état vide explicatif.

**Fiche à droite** :

- nom éditable ;
- mémo ;
- nombres de rattachements, sources et mots uniques ;
- liste des passages groupés par entretien ;
- provenance de chaque rattachement ;
- diagnostic des références ;
- actions « Voir dans l’entretien » et « Retirer du cas » ;
- suppression du cas avec confirmation.

Il n’y a ni titre de section, ni texte libre, ni déplacement manuel des passages.
L’ordre d’affichage est dérivé : titre d’entretien, puis position dans la source.

### 8.5 Mode d’affichage du texte

Le texte est pseudonymisé par défaut. Une bascule permet de voir l’original si
les droits de lecture le permettent.

Ce choix est local à la fenêtre et n’altère pas `modifieLe`. Contrairement au
mode d’un recueil éditorial, il ne constitue pas une préférence persistante du
cas.

Le nom et le mémo du cas peuvent eux-mêmes être identifiants. La fenêtre rappelle
que pseudonymiser les extraits ne pseudonymise pas automatiquement ces champs.

### 8.6 Navigation

« Voir dans l’entretien » ferme la fenêtre, ouvre l’entretien concerné et place
le curseur au début du passage.

Au retour dans Cas, la dernière fiche ouverte peut être restaurée comme préférence
locale. Cette mémoire d’interface ne vit pas dans `corpus.json`.

## 9. Résolution et projection

Créer `src/renderer/editor/cas.ts`, en factorisant avec les recueils uniquement
les primitives réellement communes.

Résultat indicatif :

```ts
type EtatPassageCas =
  | 'disponible'
  | 'repere-orphelin'
  | 'repere-introuvable'
  | 'entretien-hors-corpus'
  | 'source-indisponible'
  | 'source-invalide'

type OriginePassageCas =
  | {
      type: 'manuel'
      rattachementId: string
      source: SourcePassageCas
    }
  | {
      type: 'regle-personne'
      personneId: string
      entretienId: string
    }

type PassageCasProjete = {
  origine: OriginePassageCas
  etat: EtatPassageCas
  titreEntretien: string
  texte: string | null
  locuteurs: string[]
  from: number | null
  to: number | null
  diagnostic: string | null
}
```

La projection :

- charge chaque entretien une seule fois ;
- utilise la source ouverte en mémoire lorsqu’elle correspond ;
- ne transforme jamais une indisponibilité en absence définitive ;
- relit le texte depuis le repère ;
- calcule séparément nombre de rattachements et union textuelle ;
- conserve les chevauchements pour l’export, tout en signalant les doubles
  comptages possibles dans les métriques de vue ;
- ne persiste aucun aperçu de texte.

### 9.1 Factorisation avec Recueils

Extraire si nécessaire des fonctions communes pour :

- charger et classifier une source ;
- extraire le texte original ou pseudonymisé ;
- lister les locuteurs d’une plage ;
- produire les diagnostics de référence.

Ne pas créer une projection générique qui impose aux cas l’ordre des items ou
aux recueils la sémantique d’appartenance. Les sorties finales restent
`ProjectionCas` et `ProjectionRecueil`.

## 10. Suppressions et références cassées

| Action | Effet |
| --- | --- |
| Retirer un passage d’un cas | Supprime seulement le rattachement |
| Supprimer un cas | Supprime sa définition et ses rattachements |
| Supprimer un codage/commentaire | Aucun effet sur le cas |
| Supprimer un recueil | Aucun effet sur le cas |
| Supprimer le texte couvert | Repère orphelin conservé |
| Supprimer un entretien du corpus | Rattachements manuels de cas retirés après confirmation ; règles dynamiques inchangées |
| Remplacer toute la transcription | Repères rendus orphelins selon le contrat actuel |

La suppression d’un entretien doit avertir du nombre de recueils, de cas et de
rattachements concernés. Après confirmation, elle retire explicitement les
rattachements manuels de cas dans la même opération. Les cas eux-mêmes sont
conservés, même s’ils deviennent vides, et les règles dynamiques restent
inchangées. Les références des recueils suivent leur propre contrat éditorial et
ne sont pas supprimées automatiquement.

Une source toujours membre du corpus mais momentanément indisponible conserve en
revanche ses références, afin de ne pas confondre indisponibilité et suppression
volontaire.

Les repères inutilisés ne sont pas nettoyés dans le premier livrable. Un outil de
maintenance ultérieur pourra les inventorier, mais jamais les supprimer sans
vérifier toutes les références.

## 11. Format, migration et normalisation

La création des cas modifie le format natif. Passer de `FORMAT_VERSION = 4` à
`FORMAT_VERSION = 5`.

Migration 4 → 5 :

- ajouter `corpus.cas = {}` si absent ;
- préserver intégralement les recueils existants ;
- préserver et normaliser les `reperesPassages` ;
- passer les entretiens de version 4 à 5 sans changer leur contenu ;
- écrire corpus et entretiens selon la transaction de migration existante ;
- refuser une version inconnue plutôt que lire partiellement les cas.

La normalisation des cas :

- valide identifiants, noms, dates et tableaux ;
- exclut un cas entièrement mal formé plutôt que le lire partiellement ;
- conserve les rattachements bien formés même si leur source est absente ;
- ne tente aucun rapprochement par nom de cas, titre d’entretien ou texte.

Mettre à jour les squelettes, imports, copies, sauvegardes et fixtures qui
reconstruisent `CorpusFichier` ou `EntretienFichier`.

## 12. Persistance locale, distante et concurrence

### 12.1 Local

Ajouter au `CorpusStore` :

- `casCommander(commande)` ;
- normalisation à l’ouverture ;
- vérification de l’existence d’un repère avant publication de sa référence ;
- comptage et retrait confirmé des rattachements manuels lors d’une suppression
  d’entretien.

Toutes les écritures de `corpus.json` restent atomiques.

### 12.2 Distant

Les commandes de cas utilisent les transactions courtes de définitions :

```text
verrou corpus → GET frais → commande pure → PUT If-Match → déverrouillage
```

Pour l’ajout d’un passage :

```text
sauvegarde/publication entretien → transaction courte corpus
```

Ne jamais tenir simultanément le verrou de session de l’entretien et attendre
une interaction utilisateur. Ne jamais écrire clandestinement dans le miroir.

### 12.3 Conflits

Couvrir explicitement :

- deux postes renommant le même cas ;
- deux postes ajoutant des passages différents au même cas ;
- ajout pendant suppression du cas ;
- retrait déjà effectué ailleurs ;
- réponse réseau perdue après commit ;
- repère publié mais rattachement corpus refusé ;
- cas créé à distance pendant l’ouverture de la fenêtre ;
- entretien verrouillé ou ouvert en lecture seule.

Après conflit, recharger les cas depuis la version fraîche et conserver la
tentative d’ajout idempotente lorsque cela reste sûr.

## 13. IPC, preload et orchestration renderer

Ajouter :

- `src/shared/corpus/cas.ts` ;
- export dans `src/shared/corpus/index.ts` ;
- champ `cas` dans `src/shared/format.ts` ;
- commandes dans `src/main/corpusStore.ts` ;
- handler `corpus:casCommander` dans `src/main/index.ts` ;
- façade typée `casCommander` dans `src/preload/index.ts` et
  `src/renderer/env.d.ts` ;
- `src/renderer/composables/corpus/useCasCorpus.ts` ;
- `src/renderer/editor/cas.ts` ;
- `src/renderer/components/CasModale.vue` ;
- `src/renderer/components/corpus/CasCorpus.vue`.

Dans `src/renderer/composables/sonal.ts` :

- instancier le composable des cas ;
- lui fournir `cas`, `membership`, la source ouverte, l’enregistrement de repère
  et la navigation vers un passage ;
- rafraîchir la projection après sauvegarde de l’entretien ;
- fermer l’autre fenêtre globale lors de l’ouverture de Cas ou Recueils ;
- invalider la sélection et les projections au changement de corpus.

Dans le menu contextuel :

- ajouter `peutAjouterCas`, fondé uniquement sur `plageSelection` ;
- ajouter l’événement `ajouter-cas` ;
- ne pas réutiliser `plageCommenter`, qui peut provenir d’une annotation sans
  sélection libre.

## 14. Règles d’alimentation et évolutions

### 14.1 Cas à partir d’une personne — premier livrable

La règle référence `Personne.id` :

- retenir les interventions des locuteurs liés ;
- exclure les enquêteurs par défaut selon leur rôle local ;
- ne pas attribuer tout l’entretien à chaque personne ;
- laisser les passages sans locuteur hors de la règle ;
- diagnostiquer une personne supprimée ;
- permettre des ajouts manuels en plus de la règle.

La règle est dynamique par défaut : une correction de lien personne/locuteur
actualise les passages. Si une initialisation ponctuelle est souhaitée, elle doit
porter un libellé et un contrat différents.

Les ajouts manuels restent possibles : une intervention de Paul peut documenter
le cas Marie sans devenir une parole de Marie. La vue distingue le résultat de
la règle et les matériaux ajoutés.

### 14.2 Cas à partir d’un entretien — évolution

Une règle d’entretien associe la source entière et suit ses ajouts futurs. Elle
ne doit pas être matérialisée par une plage initiale qui cesserait de couvrir les
nouveaux paragraphes.

### 14.3 Cas par modalité — évolution

- variable d’entretien : sources entières admissibles ;
- variable de locuteur : interventions locales admissibles ;
- valeur absente : hors sélection avec compteur ;
- modalité supprimée : règle invalide ;
- aucune création automatique de nouveaux cas pour une modalité apparue plus
  tard sans action explicite.

### 14.4 Attributs de cas

Deux catégories restent distinctes :

- attribut saisi directement sur le cas ;
- valeur de locuteur ou d’entretien projetée vers le cas pour l’export.

Ne pas étendre immédiatement `Variable.portee` à `cas` sans revoir l’éditeur de
variables, la matrice EAV, les migrations et les exports existants.

Pour les valeurs longitudinales : aucune valeur donne un attribut absent, une
valeur distincte peut être proposée, plusieurs valeurs constituent un conflit à
résoudre. Ne choisir ni première ni dernière valeur silencieusement.

### 14.5 Notes

Le premier champ `memo` appartient directement au cas et correspond au mémo
général attendu par QualCoder.

L’association de notes d’entretien existantes reste différée. Elle exige de
trancher propriétaire, droits d’édition, statut privé/public et devenir de la
note lorsque le lien est retiré. Un commentaire éditorial de recueil n’est jamais
une note de cas implicite.

## 15. Contrat avec l’export QualCoder

Le futur export reçoit des cas déjà résolus :

```text
Cas exporté
  identité et nom
  mémo autorisé
  attributs arbitrés
  sources entières éventuelles
  sélections textuelles avec offsets projetés
  diagnostics et provenance
```

Il conserve les transcriptions complètes comme sources et rattache les passages
aux cas. Les codes thématiques sont projetés séparément.

Avant de figer l’adaptateur :

1. cibler une version publiée de QualCoder ;
2. produire un `.qdpx` minimal ;
3. tester `Case`, `SourceRef` et `SelectionRef` ;
4. tester si nécessaire le mécanisme cas/code à GUID identique reconnu par
   `clean_up_case_codes_and_case_text()` ;
5. vérifier qu’aucun code technique ne reste après import ;
6. vérifier la consultation du contexte et les rapports filtrés par cas.

Le modèle SonalPi reste indépendant du contournement d’import éventuellement
requis par QualCoder.

L’assistant d’export pourra combiner :

- cas persistants sélectionnés ;
- personnes projetées temporairement en cas ;
- ou aucun cas.

Il devra prévenir les collisions de noms et les recouvrements. Il ne crée jamais
silencieusement de nouveaux cas persistants dans le corpus.

## 16. Lots de réalisation

### Lot 0 — contrat fonctionnel des cas

- [x] Valider les deux créations initiales : depuis une personne ou depuis une
  première sélection.
- [x] Confirmer qu’aucun cas volontairement vide n’est proposé.
- [x] Valider le modèle minimal et l’unicité des noms.
- [x] Valider le partage de `ReperePassage` et l’ordre des écritures.
- [x] Maquetter le bouton Cas et la fenêtre à deux colonnes.

Ce lot ne demande ni installation de QualCoder, ni génération XML. Il fixe ce
que l’utilisateur peut faire dans SonalPi.

### Lot 1 — modèle et format 5

- [x] Ajouter les types et commandes pures des cas.
- [x] Ajouter normalisation et migration 4 → 5.
- [x] Généraliser la documentation et les messages de `ReperePassage`.
- [x] Mettre à jour squelette, imports, copies et fixtures.
- [x] Tester identités, noms, idempotence et suppressions.

Validation : un corpus avec ou sans cas est relu sans perte ; aucune annotation
ni aucun recueil n’est créé ou modifié par une commande de cas.

### Lot 2 — résolution

- [x] Construire `ProjectionCas` et ses diagnostics.
- [x] Résoudre la règle de personne depuis les locuteurs liés.
- [x] Distinguer « paroles de la personne » et ajouts manuels au cas.
- [x] Factoriser l’extraction de passages avec Recueils sans fusion métier.
- [x] Calculer rattachements, sources distinctes et volume textuel unique.
- [x] Tester original, pseudonymisé, chevauchements et sources indisponibles.

Validation : un même repère donne le même passage courant dans un cas et un
recueil, mais des vues et métadonnées distinctes.

### Lot 3 — store, IPC et distant

- [x] Ajouter commandes locales et façade IPC typée.
- [x] Vérifier le repère avant toute référence corpus.
- [x] Publier l’entretien avant le rattachement distant.
- [x] Rendre l’ajout multi-cas idempotent et récupérable.
- [x] Couvrir conflits, réponses perdues et lecture seule.

Validation : aucun succès annoncé avant les deux écritures ; aucun corpus frais
écrasé depuis une copie renderer périmée.

### Lot 4 — fenêtre Cas

- [x] Ajouter le bouton à côté de Recueils.
- [x] Créer un cas depuis une personne avec aperçu.
- [x] Ne pas proposer de création volontairement vide.
- [x] Rechercher, renommer, documenter et supprimer un cas.
- [x] Afficher passages et diagnostics sans ordre éditorial.
- [x] Naviguer vers le contexte source.
- [x] Gérer affichage pseudonymisé/original comme préférence locale.

Validation : créer → fermer → rouvrir → retrouver une fiche identique.

### Lot 5 — association depuis l’éditeur

- [x] Ajouter « Associer à un cas… » pour une sélection libre.
- [x] Choisir plusieurs cas ou en créer un pendant le parcours.
- [x] Sauvegarder le repère puis les rattachements.
- [x] Retirer un rattachement sans toucher au passage source.
- [x] Tester annulation et reprise après échec partiel.

Validation : sélectionner → associer → corriger la transcription → constater la
correction dans le cas → supprimer un codage couvrant → conserver le passage.

### Lot 6 — règles et métadonnées avancées

- [ ] Cas dynamiques d’entretien.
- [ ] Règles par modalités après validation des portées.
- [ ] Attributs et conflits de projection.
- [ ] Liens de notes si leur contrat est validé.

### Lot 7 — preuve d’import puis export QualCoder

Avant l’adaptateur complet :

- [ ] Figer la version QualCoder et le schéma REFI-QDA.
- [ ] Prouver l’import d’un cas avec deux passages de deux sources.
- [ ] Choisir l’encodage standard ou le profil de compatibilité QualCoder.

Après cette preuve :

- [ ] Projection finale du texte et des offsets.
- [ ] Cas, mémos, attributs et sélections.
- [ ] Rapport de pertes et confidentialité.
- [ ] Import réel automatisé ou protocole reproductible sur fixture.

## 17. Matrice minimale de tests

| Domaine | Cas indispensables |
| --- | --- |
| Modèle | refus d’une création sans règle ni passage, doublon normalisé, identité stable, commande rejouée |
| Association | sélection libre, plusieurs cas, création pendant le parcours, aucun `annotationId` |
| Indépendance | suppression ou déplacement d’un codage/commentaire sans effet sur le cas |
| Repères | insertion avant/dans/aux bornes, suppression complète, undo/redo |
| Doublons | même repère deux fois refusé, repères distincts identiques conservés |
| Projection | source ouverte/fermée, texte original/pseudonymisé, plusieurs locuteurs |
| Références | repère absent, orphelin, entretien hors corpus, source invalide/indisponible |
| Suppressions | rattachement, cas et recueil sans cascade ; entretien avec retrait confirmé de ses rattachements manuels |
| Concurrence | deux ajouts, deux renommages, suppression concurrente, réponse perdue |
| Migration | corpus v4 avec recueils et repères, corpus vide, réouverture v5 |
| Interface | bouton global, création depuis personne ou sélection, aucun cas vide proposé, navigation vers source |
| QualCoder | import des cas, passages exacts, codes séparés, aucun code technique résiduel |

## 18. Comparaison avec `export-sonal-alt.md` commité

La version commitée et la version de travail gardent la même orientation de fond :
**des cas persistants dans SonalPi**. La version actuelle ne remplace donc pas ce
choix par une projection temporaire d’export.

| Sujet | Version commitée | Version de travail |
| --- | --- | --- |
| Finalité | Cas utiles dans SonalPi et à l’export | Cas surtout construits et relus pour préparer l’export QualCoder |
| Geste manuel | « Associer ce passage » et « Associer cette annotation » | « Associer cette sélection », sur le modèle de `Mark` |
| Annotation | Raccourci qui copie sa plage, malgré un libellé ambigu | Aucun lien annotation-cas ; raccourci différé et renommé s’il existe un jour |
| Preuve QualCoder | Compatibilité générale à vérifier | Explication concrète de `case_text`, `Mark` et `Unmark` |
| Recueils | Comparaison avec les recueils V1 | Distinction explicite avec les recueils V2 déjà implémentés |
| Conversion Recueil/Cas | Non définie | Explicitement absente du chantier |
| Ancrage | Nouveau rattachement autonome à concevoir | Réutilisation de `ReperePassage` et de son remappage |
| Stockage | Orientation encore à valider | Référence `{ entretienId, repereId }` portée par le cas |
| Interface | Vue des cas décrite abstraitement | Bouton Cas global et fenêtre distincte proposés ici |
| Premier lot | Cas manuels, y compris depuis annotation | Cas depuis personne ou première sélection libre ; aucun cas vide proposé |
| Portée produit | Traitements et moteur commun très présents | Même perspective, mais différée après le geste manuel et la preuve d’export |

### 18.1 Ce que la version actuelle clarifie réellement

- Le cas manuel correspond à une relation cas–source–plage, pas à une annotation.
- La fonction ne doit pas détourner les recueils.
- L’infrastructure de passages vivants existe désormais et doit être réutilisée.
- L’objectif immédiat est de préparer un export QualCoder fidèle, sans promettre
  dès le premier lot tous les traitements par cas.

### 18.2 Ce qui restait encore flou avant ce plan

- l’emplacement exact du bouton et la forme de la fenêtre ;
- le refus d’un cas créé avec seulement un nom et un mémo ;
- le modèle minimal du premier livrable ;
- le partage des repères entre plusieurs cas ;
- l’ordre des écritures entretien puis corpus ;
- l’absence d’ordre éditorial des passages ;
- le statut du mode pseudonymisé ;
- les limites précises du premier livrable ;
- la différence entre cas persistants et personnes projetées seulement à
  l’export ;
- le moment où arrivent règles, attributs et notes.

Le présent plan propose des réponses explicites à ces points, mais les arbitrages
de la section suivante doivent être validés avant l’implémentation.

## 19. Arbitrages validés

1. **Nom des cas** : unicité après trim, normalisation Unicode et comparaison
   insensible à la casse.
2. **Création depuis une personne** : règle dynamique dès le premier livrable.
3. **Mémo** : texte simple partagé, sans statut privé ou public dans le premier
   livrable.
4. **Ajout multi-cas** : association à plusieurs cas en une seule action dès le
   premier livrable.
5. **Suppression d’entretien** : avertissement détaillé, puis retrait explicite
   de ses rattachements manuels de cas après confirmation. Les cas et leurs
   règles dynamiques sont conservés.
6. **Cas devenus vides** : conservation dans SonalPi et omission par défaut de
   l’export avec avertissement.
7. **Affichage original** : accessible à tous les éditeurs du corpus tant
   qu’aucune permission plus précise n’existe.

La place de la preuve REFI-QDA est fixée : elle ne bloque pas les cas SonalPi,
mais elle bloque le développement de l’adaptateur d’export QualCoder.

## 20. Sources

- `plans/reflexion/export-sonal-alt.md` et sa version commitée.
- `plans/reflexion/export-sonal.md`.
- `plans/encours/plan-recueil.md`.
- `src/renderer/App.vue`.
- `src/renderer/components/RecueilsModale.vue`.
- `src/renderer/components/corpus/RecueilsCorpus.vue`.
- `src/renderer/composables/corpus/useRecueilsCorpus.ts`.
- `src/shared/corpus/recueils.ts`.
- `src/shared/entretien/reperesPassages.ts`.
- `src/renderer/editor/remap.ts`.
- `/home/belignem/Vscode/SonalPi/modules/recueil.js`.
- Documentation QualCoder : https://qualcoder.org/doc/en/3.3.-Cases/
- Gestion des cas : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/cases.py
- Marquage des passages : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/case_file_manager.py
- Import/export REFI-QDA : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/refi.py

**Critère central :** l’utilisateur doit pouvoir créer un cas depuis une
personne ou un premier passage concret, retrouver ses matériaux vivants après
réouverture, les distinguer d’un thème, d’une variable et d’un item de recueil,
puis les exporter vers QualCoder avec les pertes connues explicitement annoncées.
