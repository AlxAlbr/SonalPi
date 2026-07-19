# Plan — Commentaires en marge (parité SonalPi)

> Commenter un passage sélectionné, afficher les commentaires en marge du texte en ne
> décalant QUE les tours de parole concernés, créer/éditer via un menu contextuel
> (clic droit). Difficulté globale : **moyenne**, très découpable ; un seul point
> graphiquement délicat (l'empilement vertical), contourné par une décision de
> conception (§3.2).

## 1. Ce qui existe déjà (l'essentiel du modèle est prêt)

- **Le type d'annotation existe** : `AnnotationType = 'codage' | 'anon' | 'commentaire'`
  (`shared/entretien/annotation.ts`), avec les champs `texte` (le commentaire) et
  `auteur` déjà déclarés. Un commentaire EST une annotation à plage `from/to` — le
  choix « ça dépend d'une annotation » est déjà acté dans le modèle.
- **Le remap est gratuit** : `editor/remap.ts` remappe TOUTES les annotations à chaque
  transaction, quel que soit leur type. Un commentaire suit le texte édité sans
  travail supplémentaire.
- **Le clic droit saura où il est** : les décorations inline portent déjà
  `data-annot-ids` (la liste des annotations couvrant le segment) — un handler
  `contextmenu` lit cet attribut, ou résout par position (`annotations.filter(a =>
  a.from <= pos && pos < a.to)`). Aucune instrumentation à ajouter.
- **La gouttière montre le chemin** : `editor/locuteursGutter.ts` construit déjà des
  décorations PAR PARAGRAPHE (widget au début de chaque bloc). Le « décalage par
  tour » utilisera exactement le même idiome (node decoration par paragraphe).
- **Ce qui MANQUE** : la création/édition (UI), l'affichage en marge, le journal, et
  la parité `.sonal` — le parser legacy extrait déjà les `data-obs` (`commentaires()`
  dans `import/legacy/sonal.mjs`) mais l'import les JETTE, et l'export ne les émet pas.

## 2. Référence SonalPi (ce qu'on imite, ce qu'on corrige)

- Création : bouton « Commenter » sur la sélection → dialogue signataire + texte
  (signataire mémorisé pour les fois suivantes).
- Stockage : spans `class="obs"` + `data-obs` (texte), `data-auth` (auteur),
  `data-finobs` (borne de fin).
- Affichage : pseudo-élément `::after` absolu dans une marge droite FIXE
  (`left:78%; width:18%`) + trait connecteur. **Le texte n'est jamais décalé** chez
  SonalPi — la marge est réservée en permanence. Notre parti pris (décaler seulement
  les tours commentés) est une AMÉLIORATION, pas une parité.
- Limite connue de SonalPi qu'on ne veut pas reproduire : deux commentaires proches
  se recouvrent dans la marge (cartes positionnées au pixel, pas de gestion de
  collision) — voir §3.2.

## 3. Décisions de conception (les questions à trancher, avec recommandation)

### 3.1 À quoi s'accroche un commentaire ? → au PASSAGE, pas au codage

Deux lectures du « clic droit sur une annotation » :
- (a) le commentaire est une annotation AUTONOME (plage `from/to`) — c'est le modèle
  actuel ;
- (b) le commentaire est LIÉ à un codage existant (référence par id) — cascade de
  suppression, orphelinage, un id de plus à maintenir.

**Recommandation : (a).** Le clic droit sur un codage crée simplement un commentaire
sur la MÊME plage (copie des bornes) ; le clic droit sur une sélection commente la
sélection. On obtient le geste voulu sans dépendance entre annotations — et un
commentaire peut exister sans codage (cas réel : annoter un passage non codé).

### 3.2 L'empilement dans la marge → UNE colonne de cartes PAR TOUR

Le point graphiquement dur n'est pas le décalage, c'est **plusieurs commentaires au
même endroit** (positionnement vertical au passage près = mesures DOM + gestion de
collisions, fragile). Simplification structurante :

> La marge d'un tour commenté est UNE colonne (flex) qui empile les cartes de tous
> les commentaires du tour, dans l'ordre du texte.

- Alignement « au tour près », pas « au passage près » : lisible, zéro mesure DOM,
  zéro collision (l'empilement, c'est le flux normal de la colonne).
- Mécanique : node decoration sur les paragraphes intersectant ≥ 1 commentaire →
  classe `p.commente` (`position:relative; padding-right: <marge>`) ; UN widget par
  tour commenté (conteneur absolu `left:100%; top:0`) qui contient les cartes.
- Le survol d'une carte surligne la plage dans le texte (et réciproquement) — c'est
  ce qui rend le « au tour près » suffisant.
- Si une colonne dépasse la hauteur du tour : elle déborde vers le bas (les tours
  suivants ne sont PAS repoussés en v1 — à réévaluer à l'usage).

### 3.3 Édition → modale (v1), pas d'édition en place

Éditer dans la carte (contenteditable DANS un widget ProseMirror) = conflits de focus
et de sélection avec l'éditeur. **V1 : clic sur la carte → petite fenêtre** (même
idiome voile+modale que EditionThemes/EditionVariables) : auteur pré-rempli
(mémorisé), textarea, Supprimer/Valider — le dialogue SonalPi, dans notre idiome.

### 3.4 L'auteur → champ pré-rempli mémorisé (parité SonalPi)

L'annotation porte déjà `auteur`. Mémoriser le dernier signataire dans le profil
(settings.json, comme les récents) et pré-remplir. Pas de système d'identité.

### 3.5 Le menu contextuel → générique mais MINIMAL en v1

Construire un petit composant `MenuContextuel.vue` réutilisable (position souris,
liste d'entrées, fermeture clic-ailleurs/Échap) — il servira ensuite (retirer un
codage, anonymiser…). Mais v1 ne met QUE :
- sélection non vide → « 💬 Commenter la sélection » ;
- clic sur un passage annoté → « 💬 Commenter ce passage » (bornes de l'annotation) +
  si commentaires présents : « ✏️ Modifier le commentaire… » (un item par commentaire).

### 3.6 Parité `.sonal` → v2, avec une question à instruire

À faire pour le round-trip, mais séparable :
- **Import** : `commentaires()` du parser legacy (rk/auteur/obs/finobs) → annotations
  `commentaire` en réutilisant le mapping rang→position PM déjà fait pour les codages.
- **Export** : émettre `data-obs`/`data-auth`/`data-finobs` sur les fragments couverts
  (les bornes d'annotations font déjà partie des frontières de fragments).
- ⚠ Question à instruire AVANT : le format exact côté SonalPi est incohérent selon
  l'ancienneté (`data-obs = "auteur : texte"` concaténé dans le vieux code, vs
  `data-auth` séparé lu par le domaine et le CSS ; rôle exact de `finobs`).
  → Trancher en testant un aller-retour réel avec SonalPi, pas sur lecture du code.

## 4. Architecture (par fichier)

| Fichier | Rôle | Nouveau ? |
|---------|------|-----------|
| `shared/entretien/entretien.ts` | `ajouterCommentaire`, `modifierCommentaire`, `retirerAnnotation` (existe) | fonctions à ajouter |
| `shared/entretien/journal.ts` | actions `poserCommentaire` / `modifierCommentaire` / `retirerCommentaire` (libellés du panneau Journal) | à compléter |
| `editor/commentaires.ts` | plugin : node decorations (`p.commente`) + widgets (colonne de cartes par tour), survol carte ↔ plage | **nouveau** |
| `editor/decorations.ts` | teinte discrète de la plage commentée (l'idiome segments/empilement absorbe le type sans effort) | retouche |
| `components/MenuContextuel.vue` | menu clic droit générique | **nouveau** |
| `components/EditionCommentaire.vue` | modale auteur+texte (idiome voile) | **nouveau** |
| `components/Entretien.vue` | handler `contextmenu` sur l'éditeur, branchement menu + modale | retouche |
| `composables/useEntretien.ts` | gestes : commenter la sélection / le passage, éditer, supprimer (+ autosave, comme les codages) | retouche |
| `import/sas.ts` + `exportSonal.ts` | parité `.sonal` (§3.6) | v2 |

## 5. Jalons

1. **C1 — geste + modèle** : menu contextuel minimal, modale, `ajouterCommentaire`,
   journal, teinte de plage (sans marge : le commentaire n'est visible qu'au survol
   du passage, title). *Déjà utilisable.*
2. **C2 — la marge** : plugin `commentaires.ts` (décalage par tour + colonne de
   cartes), survol croisé carte/plage, clic carte → modale. *Le livrable visuel.*
3. **C3 — finitions** : suppression depuis la carte, compteur de commentaires dans le
   panneau latéral ou le Journal, e2e (commenter → recharger → la carte est là).
4. **C4 (v2) — parité `.sonal`** : aller-retour testé avec SonalPi (§3.6).

## 6. Difficulté & risques

- **C1 : facile** — tout l'idiome existe (modales, annotations, journal, autosave).
- **C2 : moyen** — LE morceau neuf est le plugin de marge ; la décision §3.2 (colonne
  par tour) le ramène à ~un widget par paragraphe, même famille que la gouttière
  locuteurs. Sans cette décision, c'est le double (mesures, collisions) pour un gain
  faible.
- **Risques** :
  - largeur : marge en `%` du bloc éditeur → sur écran étroit le texte devient
    colonne ; prévoir un seuil (pas de marge sous ~900 px, retour au survol C1) ;
  - impression/export PDF éventuel : les widgets absolus sortent du flux — hors
    scope v1, à noter ;
  - performances : un widget par TOUR commenté (pas par commentaire), reconstruit
    comme la gouttière — même profil de coût, pas d'inquiétude ;
  - `finobs` (§3.6) : ne pas coder l'export sur une hypothèse — tester contre SonalPi.
