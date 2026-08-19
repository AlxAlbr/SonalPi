# Anonymisation — démarrage (onglet entretien, v1 simple)

> Suite « doucement mais orientée SonalPi » de [plan_anon.md](plan_anon.md).
> On ne fait QUE l'entretien, et dans l'entretien QUE le texte (pas les locuteurs,
> pas le corpus). L'objectif nº 1 : **prouver que le système tient dans l'éditeur
> TipTap** (SonalPi gérait ça en direct dans le DOM ; ici tout passe par le modèle
> + décorations + remap).

---

## AVANCEMENT (point de reprise)

- **Sous-étape 1 — FAITE** ✅ : moteur pur + adaptateur texte↔PM, sans UI.
  - `src/shared/entretien/anonymisation.ts` : `occurrencesDe` (casse, frontières
    de mot Unicode, ponctuation de bord), `chevauche`, `aplair` /
    `offsetVersPM` / `plageVersPM` (séparateur `\n` anti-franchissement de
    bloc). Aucune `RegleAnon`, aucune persistance ajoutée (cf. §1).
  - `test/anonymisation.test.ts` : 12 tests. **170/170 tests** passent (15
    fichiers, +1). Typecheck node OK.
  - Discussion tenue : le matcher ne tourne **qu'à la validation d'une ligne** (pas
    à la frappe) → aucun souci de perf en v1, même sur un gros entretien. Le coût
    réel ne viendrait qu'avec le surlignage live « à traiter » (différé) et le
    scan corpus (étape 2) — alors debouncer/mémoïser.
- **Sous-étape 2 — FAITE** ✅ : décorations TipTap + preuve remap.
  - `src/renderer/editor/decorations.ts` : les segments couverts par une
    occurrence `anon` portent la classe `anon` + l'attribut `data-pseudo`
    (pseudos multiples d'un chevauchement joints par ` / `). L'underline
    (`box-shadow`) ne concerne plus QUE les codages : le marqueur de l'anon,
    c'est le barré, pas un trait.
  - `src/renderer/styles/editeur.css` : `.editeur .anon` = texte barré
    (rouge `#c0392b`, couleur grisée) + `::after { content: " [" attr(data-pseudo) "]" }`
    (pseudo NON barré, bleu `#1565c0`). En chevauchement anon+codage, le trait
    coloré du codage reste visible par-dessus le barré.
  - `test/remap.test.ts` : helper `anonymiser` + 3 tests (insertion avant /
    après, suppression chevauchant le début) → l'occurrence anon suit le remap
    comme un codage (le pseudo survit). **173/173 tests** passent. Typecheck
    web OK.
- **Sous-étape 3 — FAITE** ✅ : onglet « Anon » + tableau + flux.
  - `useEntretien.ts` : `ongletDroite` gagne `'anon'` ; projection
    `selectionAnon` (sélection snappée au mot via `snapToWord`, recalculée au
    `onSelectionUpdate`) ; `lignesAnon` (requête : groupement des occurrences
    anon par entité+pseudo, recalculée dans `rafraichir`) ; commandes
    `validerAnon(entite, pseudo)` (aplair → `occurrencesDe` → `plageVersPM` →
    relabel des occurrences existantes de l'entité + pose sur les matchs non
    couverts) et `supprimerAnon(ids)`. Non journalisé en v1 (le batch ne se
    moule pas sur les inverses à 1 action ; le ✕ reste l'inverse manuel).
  - `Entretien.vue` : 5ᵉ onglet (icône `logoanon.png`) + ligne d'accueil +
    panneau : ligne brouillon issue de la sélection (Nom readonly + Pseudo + ✓),
    lignes existantes (Nom + Pseudo éditable @change=relabler + nb + ↻
    revalider + ✕ supprimer). Styles dédiés (`.ligne-anon`, `.brouisson`, …).
  - Build `electron-vite build` OK, typecheck web+node OK, **173/173 tests**.
- **Sous-étape 4 — FAITE** ✅ : round-trip léger testé headless.
  - `test/exportSonal.test.ts` : nouveau bloc « round-trip anon » — import du
    fixture SonalPi `entretien1.sonal` (pseudos « Marie »/« test » + 1
    exception) → export → on vérifie les `data-pseudo` et la classe
    `anon-exception` ré-émis → ré-import : pseudos + états + compte
    préservés. Couvre la chaîne annotation→span→annotation.
  - L'import produisait déjà les `Annotation{type:'anon', pseudo, etat}` depuis
    les spans `.anon`/`.anon-exception` ; l'export les ré-sérialisait déjà en
    `data-pseudo`. Les décorations (sous-étape 2) affichent barré+`[pseudo]`.
  - **Limite v1 connue** : le bloc `tabAnon` (table de règles SonalPi) reste
    en pass-through `legacy` — non régénéré depuis les occurrences (pas de
    `RegleAnon` en v1). Donc si on importe un `.sonal`, qu'on ajoute des
    occurrences via l'onglet Anon, puis qu'on exporte : les **spans**
    (`data-pseudo`) sont à jour, mais le `tabAnon` est figé à l'import. SonalPi
    relit les bons spans ; sa table de règles est juste périmée. Retrait du
    pass-through `tabAnon` prévu avec le `RegleAnon` corpus (étape 2).
  - Rendu visuel confirmé à la main (barré gris épais + `[pseudo]` bleu
    non barré, tient au remap).

---

## v1 TERMINÉE

L'onglet « Anon » entretien est complet pour le périmètre différé : sélection
→ ligne brouillon → pseudo → valider → toutes les occurrences barrées +
`[pseudo]` inline ; relabel, revalider (↻), supprimer (✕) ; round-trip
`.sonal` sans perte sur les spans. Locuteurs, portées, multi-alias/pseudo,
incluses, corpus = étape 2 (cf. plan_anon.md).

---

## 0. Décisions actées

---

## 0. Décisions actées

- **Application** : valider une ligne → applique à **toutes les occurrences** de
  l'entité dans le texte (modèle SonalPi). Le système d'**exception** par
  occurrence viendra plus tard (clic occurrence → « laisser en clair »).
- **Rendu** : texte original **barré** + **pseudo affiché inline entre
  crochets** juste après, ex. `K̶a̶r̶i̶n̶e̶ [Marie]` (décoration inline + CSS
  `::after`, pas de widget).
- **Différé** (le modèle de données reste `entite: string[]` / `pseudos: string[]`
  pour ne pas bloquer la suite) : portée (slider brouillon/document/corpus),
  multi-alias `Lyon/Lyons`, multi-pseudo `a/b`, cas des incluses, compteurs par
  variante, **locuteurs/gouttière** (nécessite de reprendre le rendu gouttière
  de SonalPi : nom puis texte dessous, pour laisser la place au barré+pseudo).
- **Onglet** : 5ᵉ onglet « Anon » dans [Entretien.vue](../src/renderer/components/Entretien.vue),
  icône `logoanon.png`.

---

## 1. La distinction centrale : OccurrenceAnon (entretien) ≠ RegleAnon (corpus)

C'est la chose à garder propre pour ne pas empoisonner la suite.

| | **OccurrenceAnon** | **RegleAnon** |
|---|---|---|
| Niveau | **Entretien** | **Corpus** (plus tard) |
| Nature | une **décision sur une plage de texte** : barrer « Karine » → « Marie » ici, dans CET entretien | un **mappage réutilisable** `entité → pseudo` partagé par tous les entretiens |
| Stockage | `Annotation{type:'anon', from, to, pseudo, etat}` dans `entretiens/<id>.json` (déjà en place, remappé par [remap.ts](../src/renderer/editor/remap.ts)) | `corpus.json.reglesAnon` (le champ existe, pass-through) |
| Périmètre v1 | **oui, c'est tout ce qu'on fait** | **non, pas maintenant** |

**Conséquence pour v1** : on n'introduit **pas** de `RegleAnon` du tout (pas de
champ `reglesAnon` dans `EntretienFichier` — contrairement au plan initial §3.1,
qui rangeait une règle `document` dans le fichier entretien). Le « tableau » de
l'onglet Anon n'est **pas** un tableau de règles persistées : c'est une
**requête dérivée des occurrences** (groupement par texte d'entité + pseudo).
Le `RegleAnon` corpus viendra avec l'étape 2, et c'est lui qui rendra possibles
les portées, le « à traiter » inter-entretiens, l'application en masse.

> À terme (SonalPi), une `OccurrenceAnon` **référencera** sa `RegleAnon` par id
> (`annotation.regle`) et ne portera plus que le **choix de variante** par
> occurrence. En v1, l'occurrence porte directement le pseudo (champ `pseudo`
> déjà présent sur le type `Annotation`) ; le champ `regle` reste inutilisé.

### Conséquence assumée du « occurrences seulement »

Sans règle persistée, le mappage entité→pseudo **ne survit pas à l'absence
d'occurrence** : si l'on supprime toutes les occurrences de « Karine », la ligne
disparaît du tableau ; il faudra re-saisir le pseudo la prochaine fois. C'est le
prix d'un v1 minimal. Le « brouillon » (règle à 0 occurrence) est différé — il
demande une `RegleAnon` entretien, qui arrive avec la distinction propre du
corpus.

---

## 2. Modèle de données v1

### 2.1 OccurrenceAnon (existant, on l'utilise tel quel)

```ts
// déjà dans src/shared/entretien/annotation.ts
interface Annotation {
  type: 'anon'
  from: number        // position PM, remappée
  to: number
  pseudo: string      // pseudo effectivement appliqué à CETTE occurrence
  etat: 'anonymise' | 'exception'   // v1 : 'anonymise' seulement
  regle?: string      // inutilisé en v1 (vide) — référence future à la RegleAnon
}
```

Rien à créer, rien à migrer. L'import `.sonal` produit déjà ces annotations
depuis les spans `.anon`/`.anon-exception` (avec `pseudo`), l'export les
re-sérialise en `data-pseudo`.

### 2.2 Requête « tableau » (jamais stockée)

Une ligne du tableau = groupement d'occurrences par **(texte d'entité, pseudo)** :

```ts
interface LigneAnon {
  entite: string        // texte courant entre from/to d'une occurrence représentante
  pseudo: string
  nb: number            // occurrences de ce groupe (à terme : scindé par variante)
  occurrenceIds: string[]
}
```

- Le « texte d'entité » d'une occurrence = `doc.textBetween(from, to)` (dérivé
  au moment de la requête, jamais stocké → si le texte est édité, l'entité suit).
- Dédup insensible à la casse au niveau du groupement ? **Non pour v1** : on
  groupe sur le texte exact (la dédup canonique est un invariant `RegleAnon` ;
  elle viendra avec le corpus). On groupe donc sur `entite.toLowerCase()` pour
  fusionner « Karine »/« karine » dans une même ligne (cohérent avec la
  détection insensible à la casse).

### 2.3 Pas de `reglesAnon` dans `EntretienFichier`

Décision explicite (voir §1). Donc **pas de bump** de `formatVersion`, pas de
champ additif côté entretien. La persistance n'utilise que `annotations` (déjà
sauvé/relu par `ecrireEntretien`/`lireEntretien`).

---

## 3. Moteur pur (port minimal du POC2)

Nouveau fichier `src/shared/entretien/anonymisation.ts` — **pur, aucun DOM,
aucun ProseMirror** (testable headless, critère POC3). On repart du
[POC2 anonymisation.ts](../../POC2/src/renderer/model/anonymisation.ts) mais on
le simplifie pour v1 (pas d'incluses, pas de multi-alias) :

```ts
// texte plat + positions → occurrences d'une entité
export function occurrencesDe(texte: string, entite: string): Plage[]
```

- Insensible à la casse, **frontières de mot Unicode** (regex `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`)
  → « Paul » ne matche pas dans « Pauline ».
- Ponctuation de bord rognée (« Lyon. » ≡ « Lyon ») via `rognerPonctuationBords`
  du POC2 (porté). La ponctuation **interne** stricte : un match multi-mots ne
  franchit pas une ponctuation interne — à vérifier par un test comparatif
  (point ouvert nº 3 du plan initial ; reporté à la sous-étape tests).
- **Chevauchement** : « la plus longue gagne » (principe des incluses, gardé
  même si la détection *incluse* comme état distinct est différée).

### Adaptateur texte ↔ positions PM

Le moteur raisonne sur du **texte plat** ; l'éditeur est ProseMirror. On ajoute
un petit adaptateur qui réutilise l'arithmétique existante
([positions.ts](../src/shared/entretien/positions.ts) : `debutBloc`,
`charVersPM`, et la lecture des longueurs de blocs déjà factorisée dans
[requetes.ts](../src/shared/corpus/requetes.ts) `longueursDoc`) :

```ts
export interface TextePlat { texte: string; blocs: { debut: number; longueur: number }[] }
export function aplatir(corpsTexte: unknown): TextePlat
export function plageVersPM(t: TextePlat, debut: number, fin: number): { from: number; to: number }
```

À la validation : on aplatit le doc, on matche l'entité, on convertit chaque
plage en positions PM, et pour chaque plage non déjà couverte par une
`OccurrenceAnon` existante, on pose l'annotation.

---

## 4. Décorations TipTap (la preuve que ça tient)

[decorations.ts](../src/renderer/editor/decorations.ts) gère déjà `type:'anon'`
(aujourd'hui : simple trait gris). On l'enrichit pour les occurrences `anon` :

- classe `anon` (+ `anon-exception` plus tard) sur la décoration inline ;
- `data-pseudo` porté comme attribut ;
- CSS dans [editeur.css](../src/renderer/styles/editeur.css) (non-scoped, comme
  tout le rendu ProseMirror) :

```css
.editeur .anon {
  text-decoration: line-through;
  text-decoration-color: #c0392b;
  color: #555;
}
.editeur .anon::after {
  content: " [" attr(data-pseudo) "]";
  text-decoration: none;          /* le pseudo n'est PAS barré */
  color: #1565c0;
  font-style: normal;
  font-weight: 600;
}
```

**Tenue au remap** : les positions `from`/`to` des `OccurrenceAnon` sont
remappées à chaque transaction par [remap.ts](../src/renderer/editor/remap.ts)
(mécanisme déjà acquis en POC3 pour les codages). Donc frapper/supprimer du texte
autour d'une occurrence anonymisée **décale** la décoration, ne la casse pas.
C'est précisément ce qu'on veut démontrer. (Test remap dédié à ajouter dans
[test/remap.test.ts](../test/remap.test.ts).)

---

## 5. Onglet « Anon » — UI (Entretien.vue)

5ᵉ bouton d'onglet (icône `logoanon.png`), panneau = un tableau façon SonalPi :

```
┌──────────────────┬──────────────┬───────┬─────┐
│ Nom              │ Pseudo       │ Occ.  │  ✕  │
├──────────────────┼──────────────┼───────┼─────┤
│ [sélection cour.]│ [à saisir]   │   —   │     │  ← ligne brouillon (si sélection)
│ Karine           │ Marie        │   3   │  ✕  │  ← ligne existante
│ pas              │ non          │  12   │  ✕  │
└──────────────────┴──────────────┴───────┴─────┘
```

### Flux

1. **Sélection dans l'éditeur (onglet Anon actif)** → le texte sélectionné
   remplit le **Nom** d'une **ligne brouillon** en tête de tableau (champ Pseudo
   vide, focus dessus).
   - Si une ligne existante a déjà cette entité (insensible à la casse) → on ne
     crée pas de brouillon, on **sélectionne/scroll** vers cette ligne (et le
     focus va sur son Pseudo, pour édition éventuelle).
2. **Saisie du pseudo + Entrée / bouton valider** →
   - moteur : `occurrencesDe(texteAplat, entite)` ;
   - pour chaque plage **non déjà couverte** par une `OccurrenceAnon` existante,
     poser une `Annotation{type:'anon', pseudo, etat:'anonymise'}` (commande de
     domaine, journalisée comme un codage).
   - rafraîchir décorations + tableau.
3. **Édition du Pseudo d'une ligne existante** → relabel 1↔1 trivial : map sur
   les occurrences du groupe, `annotation.pseudo = nouveau` (l'équivalent
   `relabelPseudoEnPlace` de SonalPi, sans le démarquage).
4. **Suppression d'une ligne (✕)** → retirer toutes les occurrences du groupe
   (dé-barrer). Non journalisé pour v1 (comme la suppression de thème/locuteur).

### Rendu de la sélection courante

`useEntretien` expose déjà `selectionVide`. On ajoute une projection
`selectionAnon: { texte: string; from: number; to: number } | null` recalculée
au `onSelectionUpdate` (le `from`/`to` sert au snap au mot à la validation, via
[snap.ts](../src/renderer/editor/snap.ts) existant).

### Onglet par défaut

`ongletDroite` gagne `'anon'`. L'accueil (onglet « maison ») gagne une ligne
« Anon — pseudonymiser le texte (barré + pseudo). ».

---

## 6. Sous-étapes livrables (ordre proposé)

1. **Moteur pur + adaptateur + tests** (headless) —
   `anonymisation.ts` + `test/anonymisation.test.ts` : occurrence simple, casse,
   frontières de mot, ponctuation de bord, « la plus longue gagne », et
   `aplair/plageVersPM` rond avec `longueursDoc`. **Rien d'UI.**
2. **Décorations** — enrichir `decorations.ts` + CSS `editeur.css` ; test remap
   qu'une occurrence anon survit à une édition autour.
3. **Onglet + tableau + flux de validation** dans `Entretien.vue` et
   `useEntretien.ts` (projection `selectionAnon`, commande de pose d'occurrences,
   relabel, suppression).
4. **Round-trip léger** — s'assurer qu'un `.sonal` SonalPi anonymisé s'affiche
   barré+pseudo à l'import (décorations) et repart correctement à l'export
   (déjà fait par `exportSonal` via `data-pseudo`). Pas de nouvelle sérialisation
   en v1 (les occurrences sont le modèle, l'export les lit déjà).

---

## 7. Points encore à trancher

1. **Décoration live des « à traiter » ?** En v1 « occurrences seulement », on
   ne matche l'entité qu'**à la validation**. Donc si l'utilisateur tape un
   nouveau « Karine » alors qu'une ligne « Karine→Marie » existe, ce nouveau
   mot n'est **pas** signalé (pas de surlignage « à traiter » en temps réel).
   Pour le signaler, il faudrait lancer le matcher à chaque édition (requête,
   mémoïsable). → **Je propose de différer** (v1 : rien de vivant, juste le
   bouton « (re)valider » de la ligne qui re-strike les nouvelles occurrences).
   OK ?

2. **Édition du texte d'une occurrence.** Si l'utilisateur édite le texte à
   l'intérieur d'une plage barrée (ex. « Karine » → « Karinne »), l'occurrence
   reste (remap), mais son « texte d'entité » dérive → la ligne du tableau
   changerait de nom. Comportement v1 proposé : on **laisse** (l'occurrence est
   toujours là, barrée, pseudo affiché ; le tableau reflète le texte courant).
   Pas d'action corrective. OK ?

3. *(reporté)* NER / suggestion d'entités : comme SonalPi, on ne détecte que
   les entités saisies. Hors périmètre v1.
