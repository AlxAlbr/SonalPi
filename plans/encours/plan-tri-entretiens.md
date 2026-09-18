# Plan — Tri persistant des entretiens

> Statut : à implémenter.
> Référence UX : SonalPi1, menu « Entretiens » et ses quatre tris.

## 1. Décision

L'appartenance au corpus et l'ordre des entretiens deviennent deux données
explicites :

```ts
interface CorpusFichier {
  membership: Record<string, EntretienRef>
  ordreEntretiens?: string[]
}

interface EntretienRef {
  titre: string
  date: string | null
  lastModified: string
  rangAjout?: number
}
```

- `membership` reste l'index des entretiens appartenant au corpus ;
- `ordreEntretiens` est l'ordre courant persistant ;
- `rangAjout` est immuable et permet de restaurer l'ordre d'ajout ;
- les fichiers `entretiens/<id>.json` restent la vérité pour la date réelle de
  modification et la longueur du texte.

Les deux champs sont additifs afin d'ouvrir les corpus existants sans migration
bloquante ni changement de `formatVersion`.

L'ordre des clés de `membership` n'est plus la donnée persistante faisant foi.
Il pourra néanmoins être reconstruit dans le même ordre en mémoire pour garder
les consommateurs actuels compatibles pendant cette évolution.

## 2. Invariants et normalisation

Un helper partagé centralise les invariants, par exemple dans
`shared/corpus/ordreEntretiens.ts`.

### 2.1 Ordre courant

La normalisation construit la liste effective ainsi :

1. conserver les ids valides et uniques de `ordreEntretiens` ;
2. retirer les doublons et les ids absents du `membership` ;
3. ajouter à la fin les ids du `membership` qui manquent dans la liste ;
4. si `ordreEntretiens` est absent, reprendre l'ordre actuel des clés du
   `membership`.

Après normalisation, chaque id du `membership` apparaît exactement une fois
dans `ordreEntretiens`.

Le helper reconstruit aussi un nouvel objet `membership` dans cet ordre. Cette
projection permet aux vues qui utilisent encore `Object.entries(membership)`
de suivre immédiatement l'ordre explicite. `ordreEntretiens` reste néanmoins
la source de vérité.

### 2.2 Rang d'ajout

Les `rangAjout` doivent être des entiers positifs ou nuls, uniques dans le
corpus.

- Si tous les rangs sont valides, ils ne sont jamais modifiés.
- Si un ancien corpus a des rangs absents, invalides ou dupliqués, tous les
  rangs sont attribués une seule fois selon l'ordre courant normalisé.
- Une création reçoit `max(rangAjout) + 1`.
- Une suppression ne renumérote rien.

Cette réparation couvre les corpus existants et évite les ambiguïtés de dates,
les collisions à la milliseconde et les horloges différentes entre postes.

### 2.3 Points de mutation

- Création/import : ajouter l'id à `membership`, lui attribuer son `rangAjout`,
  puis l'ajouter à `ordreEntretiens`.
- Suppression : retirer l'id des deux structures.
- Tri : remplacer uniquement `ordreEntretiens`, puis reconstruire la projection
  ordonnée de `membership`.
- Renommage et modification du contenu : ne changent ni le rang d'ajout ni
  l'ordre courant.

Les préparateurs centralisés de `CorpusStore` couvrent déjà la création vide,
l'import, le distant et la migration V1. La migration V1 importe les
entretiens séquentiellement dans l'ordre de `tabEnt` : les rangs obtenus
reproduisent donc cet ordre.

## 3. Modes de tri

```ts
export type ModeTriEntretiens = 'alpha' | 'ajout' | 'modif' | 'longueur'
```

Tous les tris ont un départage déterministe. Le `rangAjout`, puis l'id, servent
de critères secondaires quand le critère principal est identique.

### 3.1 Alphabétique

- comparer les titres avec `Intl.Collator('fr', {
  usage: 'sort', sensitivity: 'base', numeric: true })` ;
- ordre croissant ;
- ne lire aucun fichier d'entretien.

### 3.2 Ordre d'ajout

- comparer `rangAjout` ;
- du plus ancien au plus récent ;
- ne lire aucun fichier d'entretien.

### 3.3 Date de modification

Le `lastModified` du `membership` n'est pas fiable : les sauvegardes ordinaires
ne réécrivent volontairement pas `corpus.json`.

Le tri lit donc `EntretienFichier.lastModified` :

- du plus récent au plus ancien ;
- une date absente ou invalide est placée à la fin ;
- les égalités sont départagées par le rang d'ajout puis l'id.

### 3.4 Longueur

Pour rester fidèle à SonalPi1, la longueur est le nombre de mots du texte, pas
le nombre de caractères du résumé thématique.

Un helper pur extrait récursivement les nœuds texte du document ProseMirror et
compte les mots selon une règle Unicode testée. Le tri va du plus long au plus
court, avec le même départage déterministe.

Pour les tris `modif` et `longueur`, un entretien référencé mais absent,
illisible ou de version non supportée fait échouer l'opération avant toute
écriture. Un tri partiel silencieux serait trompeur.

## 4. Exécution locale et distante

### 4.1 Local

`CorpusStore.trierEntretiens(mode)` :

1. vérifie le droit d'écriture ;
2. ouvre et normalise le corpus ;
3. lit les fichiers d'entretien seulement pour `modif` et `longueur` ;
4. calcule le nouvel ordre ;
5. met à jour `ordreEntretiens` et la projection `membership` ;
6. écrit `corpus.json` atomiquement ;
7. renvoie le `CorpusFichier` mis à jour.

`alpha` et `ajout` restent des opérations en O(n) sans lecture des entretiens.
`modif` et `longueur` lisent chaque entretien une fois.

### 4.2 Distant

Les tris `alpha` et `ajout` passent par la transaction de définitions existante
(verrou corpus, GET frais, PUT conditionnel).

Les tris `modif` et `longueur` ont besoin d'une orchestration dédiée dans
`main/distant/transactions.ts` :

1. prendre le verrou corpus et rafraîchir `corpus.json` ;
2. lire directement les versions publiées des entretiens depuis WebDAV ;
3. garder ces contenus en mémoire, sans écraser les fichiers du miroir local ;
4. calculer et écrire le nouvel ordre dans le miroir ;
5. publier `corpus.json` avec `If-Match` ;
6. restaurer le contenu local antérieur si la publication échoue certainement,
   selon le mécanisme de réconciliation existant ;
7. toujours libérer le verrou.

Aucun verrou d'entretien n'est nécessaire puisque les fichiers sont seulement
lus. Si un entretien est publié pendant le balayage, le tri porte sur la
version publiée observée lors de sa lecture ; cela n'endommage ni le contenu ni
le membership.

Avant un tri `modif` ou `longueur`, le renderer force l'enregistrement de
l'entretien actuellement ouvert. En distant, il demande sa publication
immédiate ; si elle échoue, le tri est annulé. Les modifications d'autres
utilisateurs non encore publiées ne peuvent naturellement pas être prises en
compte.

La lecture distante de tous les entretiens a un coût réseau réel. Il est limité
aux deux tris fondés sur le contenu et assumé comme une action utilisateur
ponctuelle.

## 5. Chemin d'implémentation

### 5.1 Modèle partagé

- `shared/format.ts` :
  - `ordreEntretiens?: string[]` dans `CorpusFichier` ;
  - `rangAjout?: number` dans `EntretienRef` ;
  - `ModeTriEntretiens`.
- Nouveau helper `shared/corpus/ordreEntretiens.ts` :
  - normalisation de la liste et des rangs ;
  - ajout et retrait d'un id ;
  - projection ordonnée du membership ;
  - comparateurs et calcul pur du nouvel ordre ;
  - métrique de longueur textuelle.
- `shared/corpus/squelette.ts` et préparation de migration V1 : initialiser
  `ordreEntretiens: []`.

### 5.2 Store local

- Normaliser l'ordre dans `CorpusStore.preparerOuverture()` pour que tous les
  corpus renvoyés au renderer aient une projection cohérente.
- Adapter `preparerCreationEntretienVide()` et `preparerImportEntretien()`.
- Adapter la préparation de suppression afin de retirer l'id de l'ordre.
- Ajouter `trierEntretiens(mode)` et une variante interne acceptant des
  métriques déjà lues, réutilisable par le distant.

La normalisation d'un corpus courant n'est pas écrite simplement parce qu'il a
été ouvert. Elle est persistée lors de la prochaine mutation, notamment dès le
premier tri.

### 5.3 IPC et distant

- `main/distant/transactions.ts` : transaction de tri fondée sur les contenus
  publiés pour `modif` et `longueur`.
- `main/index.ts` : canal `corpus:trierEntretiens` choisissant le chemin local
  ou distant.
- `preload/index.ts` et `renderer/env.d.ts` :
  `corpus.trierEntretiens(mode)`.
- Faire accepter au canal `menu:action` un argument optionnel typé pour le mode
  de tri.

### 5.4 Menu et renderer

- `menuApplication.ts` : sous-menu « Trier les entretiens » avec les quatre
  entrées.
- `useOperationsCorpus.ts` : opération qui appelle l'IPC puis remplace
  `membership.value` par la projection renvoyée.
- `sonal.ts` : routage du menu, garde corpus non vide et hors lecture seule,
  puis enregistrement/publication préalable pour les tris dépendant du contenu.

Aucun composant visuel n'a besoin d'être réécrit dans cette tranche : le
membership renvoyé reste projeté dans `ordreEntretiens`. Les consommateurs
pourront migrer progressivement vers un helper explicite sans changer le
format.

## 6. Tests

### 6.1 Normalisation partagée

- corpus ancien sans liste ni rang : reprise de l'ordre courant ;
- liste avec doublons, ids inconnus et ids manquants ;
- réparation de rangs absents, invalides ou dupliqués ;
- stabilité des rangs après tri et suppression ;
- ajout après suppression : attribution de `max + 1` ;
- projection du membership conforme à la liste explicite.

### 6.2 Tris purs

- alpha : casse, accents, nombres et titres équivalents ;
- ajout : rangs non contigus ;
- modification : décroissant, date invalide et égalités ;
- longueur : texte vide, ponctuation, accents, apostrophes et contenu
  ProseMirror imbriqué ;
- départages déterministes.

### 6.3 CorpusStore

- `ordreEntretiens` et `rangAjout` posés à la création et à l'import ;
- suppression dans les deux structures ;
- persistance réelle de l'ordre dans `corpus.json` ;
- tri par modification fondé sur le fichier entretien et non sur le ref ;
- échec atomique si un fichier requis manque ou est illisible ;
- migration V1 : rangs dans l'ordre de `tabEnt`.

### 6.4 Distant

- `alpha` et `ajout` ne téléchargent aucun entretien ;
- `modif` et `longueur` utilisent le serveur même si le miroir est obsolète ;
- les lectures ne remplacent pas un entretien local ouvert ;
- échec de lecture : aucun PUT de `corpus.json` ;
- refus de verrou et conflit `412` ;
- réconciliation après réponse PUT perdue ;
- libération du verrou dans tous les cas.

### 6.5 Coutures

- contrat IPC/preload/types ;
- transmission du second argument de `menu:action` ;
- routage des quatre items ;
- mise à jour réactive du membership.

Le menu natif n'a pas besoin d'un test Playwright. Sa construction et ses
callbacks peuvent être testés au niveau unitaire ou par les tests de couture.

## 7. Annulation et portée

Le tri n'entre pas dans le journal d'annulation : il ne modifie aucun contenu
d'entretien et un autre tri permet de choisir un nouvel ordre. Le tri par ordre
d'ajout reste toujours récupérable grâce aux rangs immuables.

Un réordonnancement manuel par glisser-déposer pourra plus tard modifier
`ordreEntretiens` avec exactement le même mécanisme, sans évolution du format.

## 8. Évaluation de complexité

La structure elle-même reste simple : une liste, un rang immuable et un helper
de normalisation. Grâce à la projection ordonnée du membership, la majorité du
renderer ne change pas.

La seule partie sensiblement plus complexe est la fraîcheur distante des deux
tris qui lisent le contenu. Cette complexité existe quelle que soit la manière
de stocker l'ordre ; elle ne vient pas de `ordreEntretiens`.
