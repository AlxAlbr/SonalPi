# Plan onglets Corpus — vision long terme

> La vue Corpus est aujourd'hui un écran unique (thèmes en consultation + cartes d'entretiens,
> [Corpus.vue](../../src/renderer/components/Corpus.vue)) plus un écran séparé « base de données ».
> Cible : lui donner une **navigation par onglets**, pendant de la colonne droite de la vue
> Entretien (Thèmes / Loc / Données / Journal). Ce plan est un plan d'**idées à long terme** :
> il précise surtout l'onglet **Personnes** (activation de la décision D4) et l'onglet
> **Thématique** (l'atelier du codebook), les deux points neufs. Le reste est du déplacement
> d'existant.

---

## 1. Cible : cinq onglets

| Onglet | Contenu | Ancrage existant |
|---|---|---|
| **Accueil** | la vue Corpus actuelle (thèmes en consultation + cartes d'entretiens) | [Corpus.vue](../../src/renderer/components/Corpus.vue), renommage |
| **Personnes** | identités transverses aux entretiens (pendant corpus de « Loc ») | `corpus.json.personnes` + `Locuteur.personneRef` — **déjà dans le modèle** (D4, « sans UI ») |
| **Thématique** | l'**atelier du codebook** : fusion/scission de thèmes (IA en assistance), qualité du codage, accord inter-codeurs | à créer — voir §4 |
| **Données** | la matrice EAV, aujourd'hui écran séparé | [TableDonnees](../../src/renderer/components/TableDonnees.vue), `vue === 'donnees'` descend en onglet |
| **Anon** | règles de portée corpus, scan, application en masse | = panneau « Pseudos » d'E2.2 du plan anon — ce plan-ci lui donne juste son emplacement |

Squelette : même patron que la nav `ongletDroite` d'[Entretien.vue](../../src/renderer/components/Entretien.vue)
(`ongletCorpus: 'accueil' | 'personnes' | 'thematique' | 'donnees' | 'anon'`). L'état
`vue === 'donnees'` de [sonal.ts](../../src/renderer/composables/sonal.ts) disparaît au profit de
`vue === 'corpus'` + onglet ; `rafraichirMatrice()` se déclenche à l'activation de l'onglet
(comportement actuel d'`allerDonnees` conservé).

## 2. Onglet Accueil

La vue actuelle, telle quelle. Seule évolution envisagée à terme : la colonne droite « cartes »
peut s'enrichir (spectrogramme corpus), mais c'est hors de ce plan.

## 3. Onglet Personnes

**L'idée** : quand deux entretiens ont un locuteur du même nom, ce sont souvent — mais pas
toujours — la même personne. L'outil doit (a) le **proposer** au moment où l'utilisateur nomme un
locuteur, (b) permettre de le **déclarer après coup** depuis l'onglet, et (c) ne **jamais trancher
en silence** (principe repris du plan anon).

### 3.1 Modèle (presque tout existe déjà)

- `corpus.json.personnes` (D4, pass-through actuel) se type :

  ```jsonc
  "personnes": { "<id>": { "nom": "Marie Dupont", "note": "" } }
  ```

  Identité opaque (règle n°3), comme les catégories.
- `Locuteur.personneRef: string | null` ([format.ts](../../src/shared/format.ts:28)) : le lien.
  Un locuteur référence **au plus une** personne ; une personne est référencée par **au plus un
  locuteur par entretien** (invariant : deux locuteurs d'un même entretien ne sont pas la même
  personne — garde à la liaison, dialogue si l'utilisateur insiste… non : refus simple, c'est
  une incohérence de saisie des locuteurs, à corriger côté locuteurs).
- **Refus mémorisé** : si l'utilisateur répond « non, homonyme », il ne faut pas redemander à
  chaque renommage. Pattern `pseudoEtat` du plan anon : la **suggestion est une requête**
  (même nom canonique — clé insensible à la casse, comme `cleEntite` —, `personneRef` nul, pas de
  refus), le **refus est persisté**. Incarnation proposée : `Locuteur.personneRefus: string[]`
  (ids de personnes refusées) dans `entretiens/<id>.json` — le refus est une décision *sur ce
  locuteur*, il vit avec lui. À trancher (§7.1).

### 3.2 Le dialogue au nommage

Au `renommerLoc` / à la création d'un locuteur ([locuteurs.ts](../../src/shared/entretien/locuteurs.ts)) :

1. Requête : le nom canonique matche-t-il une **personne** existante, ou le nom d'un **locuteur
   d'un autre entretien** encore sans personne ?
2. Si oui → dialogue non bloquant : « *Marie* existe aussi dans *Entretien B*. Même personne ? »
   - **Oui** : s'il n'y a pas encore de `Personne`, elle est créée (nom = le nom saisi) et les
     deux locuteurs la référencent ; sinon, simple liaison.
   - **Non** : refus mémorisé (§3.1), on ne redemande plus pour ce couple.
   - **Fermer** : rien n'est écrit, la suggestion restera visible dans l'onglet (badge).
3. Le renommage d'un locuteur **lié** ne renomme pas la personne (dialogue : « renommer aussi la
   personne / délier / annuler ») — le nom de personne est le nom de référence, les locuteurs
   peuvent en diverger (« Marie », « M. Dupont »).

### 3.3 L'onglet

- **Liste des personnes** : nom, nombre d'entretiens liés, badge « suggestions en attente »
  (requête §3.1). Drill-down : les locuteurs liés (entretien, nom local), délier, renommer.
- **Actions** : créer une personne à la main ; **lier** un locuteur (sélecteur des locuteurs sans
  personne) ; **fusionner** deux personnes (les `personneRef` de l'absorbée sont réécrits —
  commande de domaine multi-fichiers, sous verrous, même mécanique que l'application en masse
  d'E2.2) ; supprimer (les `personneRef` deviennent pendants → règle n°3 : inertes, conservés,
  listés par la requête « références pendantes »).
- **Signal qualité** (requête, rien de stocké) : pour une personne, les **valeurs de variables de
  portée locuteur divergentes** entre ses entretiens (âge saisi 42 ici, 43 là) sont listées —
  signalées, jamais réparées d'office. La propagation d'une valeur à tous les locuteurs de la
  personne est une action explicite.

### 3.4 Synergies et bords

- **Anonymisation** : c'est la synergie forte. Une personne est par construction une entité
  sensible transverse → depuis l'onglet Personnes, « pseudonymiser cette personne » = créer une
  `RegleAnon` de portée corpus dont les alias sont les noms des locuteurs liés + proposer le
  pseudo d'étiquette sur chacun (E1.4). Le rapprochement de personnes devient le **point d'entrée
  naturel** de l'anonymisation corpus.
- **Round-trip `.sonal`** : le legacy n'a pas de personnes → export : rien à émettre (les
  étiquettes locales suffisent) ; import : rien à lire. Aucune contrainte de parité — c'est un
  champ purement SonalPiTestV2, additif, pas de bump de `formatVersion`.
- **Bascule Yjs** : `personnes` suit le traitement standard des définitions corpus (id opaque
  déjà conforme) ; `personneRef` est une référence par id, rien à coudre.

## 4. Onglet Thématique — l'atelier du codebook

**Le partage qui rend l'onglet décidable** : *lire* le codage vs *le retravailler*. La lecture
analytique (recueils d'extraits, spécificités lexicales) est le territoire de **Synthèse** et
**Lexico** de SonalPi ([synthese.js](../../SonalPi/modules/synthese.js),
[lexico.js](../../SonalPi/modules/lexico.js)) — leur portage est un chantier à part, hors de ce
plan. L'onglet Thématique, lui, est l'**atelier** : l'endroit où l'on retravaille la
thématisation elle-même. C'est un moment réel et mal outillé de l'analyse qualitative — entre
deux passes de codage, un thème s'avère fourre-tout, deux thèmes sont des doublons, l'arbre ne
tient plus — et aucun logiciel n'accompagne bien ce moment. (Les vues graphes envisagées un
temps ici sont écartées : redondantes avec Lexico/Synthèse dans l'esprit, et la piste
d'intégration gephi-lite n'est pas bonne — GPL-3, pas embarquable proprement. La carte de
théorisation, autre usage des « graphs » de QualCoder, est renvoyée en annexe A.)

### 4.1 Fusion, scission, harmonisation

- **Fusion** de deux thèmes : presque gratuite dans le modèle — les annotations référencent les
  catégories **par id**, fusionner = réécrire les références vers la catégorie conservée puis
  supprimer l'absorbée. Commande de domaine multi-fichiers sous verrous, même mécanique que la
  fusion de personnes (§3.3) et l'application en masse d'E2.2. Premier livrable de l'onglet,
  sans IA.
- **Scission** d'un thème : sélectionner un thème → la requête rassemble tous ses extraits
  (tous entretiens) → l'utilisateur répartit vers 2+ sous-catégories (ou nouvelles catégories
  sœurs). À la main c'est déjà utile (une vue « trier les extraits ») ; l'IA (§4.2) en fait un
  vrai outil.
- **Candidats détectés automatiquement** (requêtes, rien de stocké, aucune IA requise) : deux
  thèmes qui codent très souvent les mêmes plages = candidats à la **fusion** ; un thème à gros
  effectif et forte hétérogénéité lexicale (la matière de Lexico) = candidat à la **scission**.
  L'atelier signale du travail à faire même sans modèle branché.

### 4.2 L'IA en assistance, sous validation

Le patron est celui déjà établi partout dans ces plans : **suggestion = brouillon, rien de
tranché en silence**. Le LLM ne pose jamais une annotation ni ne crée une catégorie — il produit
des **propositions** que l'utilisateur valide extrait par extrait ou en masse, corrige à la main,
ou rejette ; à la validation seulement, les commandes de domaine écrivent.

- **Scénario nominal (scission)** : « voici les N extraits codés *Travail* — propose une
  partition en 2-3 sous-thèmes avec libellés et l'affectation de chaque extrait ». L'écran de
  tri de §4.1 affiche les propositions pré-classées ; validation par colonne ou par extrait.
- **Second codeur** : faire coder un entretien par le LLM (sur le codebook existant) et
  **se comparer à lui** dans la vue d'accord inter-codeurs (§4.3) — déléguer le regard, pas la
  décision. Variante ciblée : « trouve les passages qui ressemblent aux extraits codés X mais ne
  sont pas codés X » (audit de complétude).
- **Sensibilité des données — la règle** : les entretiens sont des données sensibles.
  **Ollama local par défaut** ; un modèle **externe** n'est autorisé que sur le texte
  **pseudonymisé** — le pipeline d'anonymisation devient le *sas de sortie vers
  l'IA*, ce qui est une raison de plus de le faire tôt. Configuration (endpoint, modèle) au
  niveau profil utilisateur, jamais dans le corpus partagé.
- **Précédent à examiner** : QualCoder a intégré une assistance IA au codage (portée par kaixxx,
  l'auteur de noScribe) — regarder ce qu'ils ont retenu et ce qui frustre leurs utilisateurs
  avant de figer l'UX.

### 4.3 Fonctions voisines du même onglet

- **Accord inter-codeurs** : `Annotation.auteur` existe déjà
  ([annotation.ts](../../src/shared/entretien/annotation.ts:13)), et [plan-multiuser](../encours/plan-multiuser.md)
  est posé. Vue de comparaison des codages de deux auteurs sur le même entretien (divergences,
  réconciliation, éventuellement un kappa) — fonction classique de NVivo/MAXQDA, et le débouché
  naturel du « second codeur » IA.
- **Santé du codage** (tableau de bord, toutes requêtes) : couverture par entretien (% de texte
  codé), thèmes jamais utilisés, annotations orphelines, références pendantes.
- **Courbe de saturation** : ordre de première apparition de chaque thème au fil des entretiens —
  quand les nouveaux thèmes cessent d'apparaître, le corpus sature (grounded theory). L'angle
  chronologique propre à Sonal, très peu cher.

## 5. Onglet Données

Déplacement pur : l'écran `donnees` ([App.vue](../../src/renderer/App.vue:52)) devient le contenu de
l'onglet ; `allerDonnees` devient « aller à l'onglet ». Le composant TableDonnees ne change pas.
À terme, l'onglet est le lieu naturel des colonnes « personne » (nom de la personne liée à côté
du locuteur) une fois §3 fait.

## 6. Onglet Anon

Rien à concevoir ici : le contenu est le panneau « Pseudos » d'E2.2 du plan anon
(table des règles corpus, scan, drill-down, application en masse). Ce plan fixe seulement son
emplacement (un onglet, pas un panneau flottant) et la synergie §3.4 (entrée depuis Personnes).

## 7. Points à trancher

1. **Où vit le refus de rapprochement** (§3.1) : `Locuteur.personneRefus` dans l'entretien
   (recommandé — décision locale au locuteur, voyage avec lui) ou table de paires dans
   `corpus.json` (centralisé mais référence des locuteurs d'entretiens → couplage inverse) ?
2. **La personne porte-t-elle des valeurs ?** Aujourd'hui les variables de portée `locuteur`
   restent sur le locuteur, la personne n'a que nom+note, la divergence est un signal (§3.3).
   L'alternative — une portée `personne` où la valeur vit sur la personne — est plus juste
   conceptuellement mais casse la parité `.sonal` (le legacy ne connaît que le locuteur).
   Recommandé : statu quo signalé, portée `personne` réexaminée après usage réel.
3. **Où vivent les brouillons de scission** (§4.2) : volatils (perdus à la fermeture — simple,
   recommandé pour commencer) ou persistés (reprendre un tri en cours — nouvel objet, à ne faire
   que si le besoin se confirme) ?
4. **Fusion et `codeExport`** : la catégorie absorbée avait un `cat_XXX` stable — l'export
   `.sonal` après fusion doit-il le réémettre (alias) ou l'abandonner (les annotations pointent
   la conservée) ? À trancher avec un test de round-trip.
5. **Ordre des onglets** et libellés définitifs (« Accueil » vs « Entretiens » ?) — au moment du
   squelette.

## 8. Ordre de mise en œuvre proposé

1. **Squelette onglets + Données** — structurel, petit, sans nouveau modèle (Accueil = renommage,
   Données = déplacement §5).
2. **Personnes** (§3) — le modèle est prêt (D4), la valeur est immédiate et ouvre l'entrée
   anonymisation (§3.4).
3. **Anon** — au rythme du plan anon (E2 suppose E1 stable) ; l'onglet peut
   exister avant, vide avec renvoi.
4. **Thématique — atelier sans IA** : fusion (§4.1), candidats automatiques, santé du codage
   (§4.3) — tout est requêtes + une commande de domaine, aucune dépendance nouvelle.
5. **Thématique — IA** : scission assistée puis second codeur (§4.2), Ollama local d'abord ;
   le sas « externe via pseudonymisation » suppose l'anon corpus (étape 3).
6. **Accord inter-codeurs** — quand [plan-multiuser](../encours/plan-multiuser.md) rendra le cas réel
   fréquent (la vue peut naître avant, alimentée par le second codeur IA).

---

## Annexe A — la carte de théorisation (écartée pour l'instant, consignée pour mémoire)

L'autre usage des « graphs » de QualCoder (issue #1229) et des « maps » de MAXQDA : le chercheur
**dessine son modèle** — un tableau blanc où les thèmes sont posés comme nœuds, reliés par des
flèches **typées** qui sont des *affirmations du chercheur*, pas des mesures (« la précarité
financière *alimente* le renoncement aux soins », « la honte *masque* X »), chaque lien pouvant
porter un mémo et des extraits à l'appui. C'est l'étape entre le codage et l'écriture de
l'article : le brouillon visuel de la théorie.

Techniquement ce serait un **nouvel agrégat persisté** (`corpus.json.cartes` : nœuds, arcs
typés, positions ; références pendantes vers thèmes supprimés → règle n°3). Côté rendu, une
techno directement adéquate dans le navigateur existe :
[vue-flow](https://vueflow.dev) (MIT, Vue 3, nœuds/arêtes interactifs) — pas de détour par
gephi-lite ni par un moteur de graphe.

**Pourquoi c'est écarté** : usage incertain pour l'instant (à réexaminer si la pratique le
réclame), et l'atelier (§4) répond mieux au besoin identifié aujourd'hui. Si l'idée revit, elle
mérite son plan dédié.
