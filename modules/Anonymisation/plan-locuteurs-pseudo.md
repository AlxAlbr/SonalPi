# Plan — Pseudonymisation des locuteurs

> Pseudonymiser les **libellés de locuteurs** (étiquettes de prise de parole) **depuis l'onglet
> Pseudonymisation uniquement**, en réutilisant le moteur de règles existant. L'onglet Locuteurs
> reste **inchangé**. À lire avec [anon.md](anon.md).

## Décisions actées (arbitrage utilisateur)

| Question | Choix |
|---|---|
| Point d'entrée | **Onglet Pseudonymisation seul**. Aucune UI ajoutée dans l'onglet Locuteurs. |
| Déclencheur | À la **validation d'une règle**, si l'entité **est le nom d'un locuteur** → dialogue « appliquer aussi au libellé du locuteur ? ». |
| Stockage | **DOM-natif** : on marque le `.ligloc` (classe `loc-anon` + `data-locpseudo`). Le DOM est la source de vérité (anon.md §2) → persiste dans le `.sonal` comme le texte. |
| Pseudo | **Pas stocké en double** : `data-locpseudo` porte le pseudo (baked, comme `data-pseudo` du texte) ; le vrai nom reste dans `data-nomloc`. |
| Portée (local / corpus) | **Le slider de la règle** (brouillon/document/corpus). Pattern *suggest-then-confirm-locally*, identique au texte. |
| Trou « locuteur jamais nommé dans le texte » | **Fermé** : le match règle↔locuteur ignore le compte d'occurrences texte. |

## Constat de départ

Locuteurs et anonymisation sont **disjoints** :
- `locut = ['', 'Jacques?', 'Jacques', 'Paul', …]` (chaînes indexées), persisté **par entretien**
  dans `tabEnt[].tabLoc` ([main.js:88](../../main.js#L88)).
- Le libellé affiché est peint en CSS : [styles.css:1425](../../css/styles.css#L1425)
  `.ligloc::before { content: attr(data-nomloc) }`. `data-nomloc` = nom **sans `?`** (posé par
  [locutarisation.js:185](../locutarisation.js#L185)). Le 1ᵉʳ segment d'un tour porte
  `class="lblseg … ligloc"` + `data-loc` (index) + `data-nomloc`.
- L'anonymisation agit **uniquement sur les spans de texte** (`.anon`) ; elle ne voit jamais les
  libellés.

**Fuite à corriger en priorité** : [exportTxtAvecClasses](anon-export-document.js#L110) écrit
`locut[loc]` en clair et [sauvHtmlAnonymise](anon-export-document.js#L175) sérialise `locut` tel quel
→ un locuteur « Karine » apparaît **en clair dans l'export anonymisé**.

## Principe : le libellé calque le texte (même comportement, axe séparé)

| Aspect | Texte (existant) | Locuteur (ce plan) |
|---|---|---|
| Marquage | `.anon` + `data-pseudo` sur le span | `loc-anon` + `data-locpseudo` sur le `.ligloc` |
| Original conservé | texte du span | `data-nomloc` (vrai nom) |
| Suggestion (nouvel entretien) | occurrence « à anonymiser » (`isNonTraite`) | `.ligloc` dont le nom matche une règle, pas encore `loc-anon` |
| Décision | locale, par entretien | locale, par entretien |
| Visuel | barré + `::after [pseudo]` | barré + `::after [pseudo]` |
| Persistance | DOM / `.sonal` | DOM / `.sonal` |
| Portée (local/corpus) | slider de la règle | **même** slider |
| Moteur | occurrences/spans | **axe séparé** (pas le moteur d'occurrences) |

**La seule différence est mécanique, pas fonctionnelle** : le libellé **ne passe pas** par le moteur
d'occurrences (spans `debsel`/`finsel`, `matchPositions`, `analyserOccurrences`). Il vit sur son
propre axe (marquage du `.ligloc` + rendu CSS). Choix **délibéré** : on garde le libellé **hors** du
moteur d'occurrences, le chemin coûteux/risqué (badges, incluses, multi-pseudo…) — écarté.

### Pourquoi ça ne touche ni le `.crp` ni `fusionnerRegles`

- Le marquage vit dans le **HTML du document** → persiste dans le `.sonal` (anon.md §2) et voyage dans
  le `.crp` comme le HTML (via l'embarquement `tabEnt`/`tabHtml`, anon.md §3.4). **Aucune** structure
  dédiée.
- La règle corpus reste le `{entite, remplacement}` propre. [fusionnerRegles](anon-regles.js#L296)
  **reconstruit** chaque règle corpus from scratch ([anon-regles.js:316](anon-regles.js#L316)) → tout
  champ ajouté à une règle corpus serait **effacé**. On n'y met donc **rien** : la portée corpus émerge
  de la fusion de la règle dans chaque entretien (anon.md §6), exactement comme pour le texte.

## Modèle DOM

Sur **chaque** `.ligloc[data-loc="X"]` du locuteur pseudonymisé (il y en a un par tour de parole) :

```html
<!-- avant -->
<span class="lblseg sautlig ligloc" data-loc="2" data-nomloc="Speaker 2">…</span>
<!-- après application (locuteur 2 → "Témoin A") -->
<span class="lblseg sautlig ligloc loc-anon" data-loc="2" data-nomloc="Speaker 2"
      data-locpseudo="Témoin A">…</span>
```

- `data-nomloc` **inchangé** (vrai nom, barré seulement visuellement) → export non-anonymisé OK.
- `data-locpseudo` = pseudo, lu par `::after` et par l'export anonymisé.
- Marquer **tous** les `.ligloc[data-loc="X"]` = miroir du « marquer toutes les occurrences ».

## Étapes

### Étape 0 — Point de passage `nomLocAffiche` (✅ fait — refacto no-op)
Helper [nomLocAffiche(ref, {anonymise})](../locutarisation.js#L13) dans `locutarisation.js` (chargé
dans les deux fenêtres) : renvoie `data-locpseudo` du `.ligloc` quand `anonymise` **et** posé, sinon le
nom réel sans « ? ». `data-locpseudo` n'existe pas encore → **no-op** (repli = nom réel), sortie
inchangée aujourd'hui, mais le point de passage unique est en place. Lit le pseudo sur le **DOM** → utile
seulement là où l'entretien est rendu (fenêtre d'édition).

**Branchés** (contextes DOM rendus) :
- [exportTxtAvecClasses](anon-export-document.js#L110) — export texte anonymisé, via
  [gestion_fichiers.js:1436](../gestion_fichiers.js#L1436).
- [synthese.js](../synthese.js#L27) — lisait `data-nomloc`.
- [exportTableCorrespondance](anon-import_export.js#L17) — la **clé « qui est qui »** inclut désormais
  les règles matérialisées **par libellé** (`occ-texte=0` + `aLibellePseudonymise` → entrée
  `entité → pseudo primaire`) ; sinon un locuteur pseudonymisé sans occurrence texte manquait dans la clé.

**Fait — `sauvHtmlAnonymise`** (export irréversible de partage) : les **deux** fuites neutralisées —
- `loc-json` sérialise les **pseudos** ([anon-export-document.js:175](anon-export-document.js#L175),
  `nomLocAffiche`, statut « ? » préservé) ;
- [AnonymiserSegments](anon-export-document.js#L283) remplace `data-nomloc` par le nom anonymisé +
  retire `loc-anon`/`loc-suggere`/`loc-suggere-refuse` sur un **clone** (DOM live intact ;
  `_anonymiserHtml` n'agit que sur les `[data-rk]`, donc préserve le libellé).

Locuteur **sans pseudo** ou **refusé** → nom réel (relève du garde-fou export, point ouvert #3). Les
blocs var/dic/dat référencent le locuteur par **index** (→ pseudo via loc-json), pas par nom.

**⚠️ Source du pseudo selon le contexte (point ouvert #4)** : seuls les contextes lisant des
**entretiens non rendus** posent problème. [varsPubliquesEnt(rkEnt)](../gestion_data.js#L1535) (appelé
en synthèse pour des entretiens non ouverts, [synthese.js:712](../synthese.js#L712)) et les stats corpus
lisent `ent.tabLoc[]` sans DOM → `data-locpseudo` **inatteignable**, à **dériver des règles**. En
revanche [varsPubliquesXtr](../gestion_data.js#L1572) itère les spans de l'extrait (`xtr.texte`) →
**routable** comme les autres. Non branchés ici.

### Étape 1 — Visuel du libellé pseudonymisé (✅ fait)
[styles.css:1449](../../css/styles.css#L1449) : `.ligloc.loc-anon::before { content: attr(data-nomloc-barre)
" [" attr(data-locpseudo) "]" }` → header « **Nom̶ [Pseudo]** », calqué sur le rendu du texte (nom barré
+ remplacement entre crochets). **Pas de `::after`** : le `.ligloc` enveloppe le texte du 1er segment,
donc un `::after` tombe à la **fin de la parole** (bug constaté à l'usage). **Barré du seul nom** : un
`::before` unique ne peut pas barrer une *sous-chaîne* (`content` = chaîne indivisible, `text-decoration`
frapperait aussi le pseudo) → le barré est **intégré aux caractères du nom** via l'overlay combinant
**U+0336** dans un attribut dérivé `data-nomloc-barre` (`barrerTexte`/`majBarreLoc`, locutarisation.js),
posé/retiré selon l'état du libellé partout où les classes `loc-*` changent, re-dérivé à l'ouverture par
`detecterLibellesASuggerer`. `data-nomloc` reste le **vrai nom** (source de vérité, export non-anon). Le
barré porte le vrai nom → **supprimé par `AnonymiserSegments`** pour ne pas fuiter dans l'export anonymisé.
Coût : accessibilité dégradée (lecteurs d'écran lisent les combining chars). Non gated par `mode-anon`.
Inerte tant qu'aucun `.ligloc` ne porte `loc-anon`.

### Étape 2 — Dialogue à la validation d'une règle (✅ fait)
[proposerPseudoLocuteur](tableau_base.js#L2243) (renvoie `{matched, marked}`), appelée par
[validerLigneAnon](tableau_base.js#L2129) **avant** le calcul de portée : matche les alias de l'entité
(`clesAlias`) contre `data-nomloc` de chaque `.ligloc` ; si match → dialogue opt-in (calque de
`proposerRegleCoeurAffixe`) ; si « Oui » → pose `loc-anon` + `data-locpseudo` (= pseudo primaire) sur
tous les `.ligloc` concernés (N→1 couvert), `backUp()` + `syncHtmlVersMainProcess()`. **Ask-once** : pas
de redemande si déjà marqués avec ce pseudo.

**Gate de portée unifié** — une règle est **matérialisée** (donc document/corpus, jamais brouillon) si
elle marque **quelque chose** : occurrences de TEXTE (`occ>0`) **OU** un libellé de locuteur (`marked`).
Conséquence **assumée** : *une règle peut être document/corpus avec 0 occurrence de texte* si sa
matérialisation est le libellé. Cohérent avec l'UX du texte (la matérialisation n'apparaît qu'à
document/corpus, jamais en brouillon). ✅ Vérifié : `nettoyerTabAnon` ([:778](tableau_base.js#L778))
conserve une telle règle **locale** (seuls les fantômes corpus `occ=0` sont jetés) → pas de
rétrogradation ni perte du libellé au round-trip.
- **occ=0, libellé décliné OU pas un locuteur** → brouillon. Avertissement « pas trouvé dans le texte »
  **seulement si** `!matched` (sinon = brouillon de locuteur volontairement décliné).
- Affixe de liaison : appelé **uniquement** si `occ>0` (pertinent pour le texte seul).
- **Slider de portée** (`changerPorteeLigne`) : doit compter le libellé comme « appliqué »
  ([aLibellePseudonymise](tableau_base.js#L2076)) — sinon une règle label-only (occ=0) est traitée en
  brouillon et le routage **corpus↔document casse** (la transition repassait par `validerLigneAnon`
  qui remettait `corpus`). ✅ corrigé. *Ripple type du state « document occ=0 » — en traquer d'autres.*
Persistance round-trip `.sonal` (y compris règle document occ=0) : ✅ vérifiée (cf. Étape 5b).

### Étape 3 — Suggestion en nouvel entretien (✅ fait)
[detecterLibellesASuggerer](tableau_base.js) (appelée en fin de `detecterOccurrencesToutesLesPaires` →
tourne à l'**ouverture** ET au **scan**) : pour chaque `.ligloc` pas encore `loc-anon`, si son nom
matche une règle **non-brouillon** (locale ou corpus fusionnée, anon.md §6) → pose `loc-suggere` +
`data-locpseudo-suggere`. CSS : « Nom → Pseudo **?** » en pointillé atténué. **Confirmation** par
clic-droit (menu Étape 4 étendu) → `confirmerPseudoLibelleLocuteur` promeut `loc-suggere`→`loc-anon`
(opt-in **LOCAL**). Marqueurs **runtime** (re-dérivés, suggestions périmées auto-nettoyées).

**Sécurité export — la suggestion est pseudonymisée par DÉFAUT** : un libellé affiché « Nom → Pseudo ? »
sort **pseudonymisé** à l'export (`nomLocAffiche` lit `data-locpseudo-suggere`), pas en clair → on évite
la mauvaise surprise. **Trois états**, au clic-droit :
- **suggéré** (`loc-suggere`, pointillé « Nom → Pseudo ? ») → pseudonymisé à l'export par défaut ;
  menu : ✓ Pseudonymiser (confirmer) / ✕ Ne pas pseudonymiser (refuser).
- **confirmé** (`loc-anon`, plein) → explicite + enregistre la règle (voir ci-dessous).
- **refusé** (`loc-suggere-refuse`, « Nom ⊘ », **persisté**) → reste EN CLAIR ;
  `detecterLibellesASuggerer` ne le re-suggère plus ; ré-activable au clic-droit (`data-locpseudo-suggere`
  conservé).

**Confirmer enregistre la règle localement** (`existeLocalement=true`) → la règle corpus fusionnée
s'**affiche dans le tableau** (sinon fantôme caché par le filtre [affichTableauAnon](tableau_base.js#L486)
qui masque les Global occ-texte=0) et **survit à la sauvegarde**, comme règle corpus à 0 occurrence de
texte (matérialisé = texte OU libellé). **Symétrie au retrait** : si la règle n'a plus aucune
matérialisation texte (Global, occ=0), elle redevient fantôme (`existeLocalement=false`, disparaît).

**Persistance — le libellé (HTML, `compactHtml`-préservé) est la source de vérité, pas un flag `tabAnon`.**
Deux passes `occ>0`-aveugles supprimaient/cachaient la règle à la réouverture (matérialisé = texte OU
libellé) :
- `nettoyerPairesOrphelines` supprimait une règle Global `existeLocalement=true` à 0 occurrence texte
  (ni occ, ni brouillon, ni fantôme) → ajout de **`aLibellePseudonymise`** à sa garde.
- `existeLocalement` ne survit pas toujours à la ré-fusion → `detecterLibellesASuggerer` le **re-dérive**
  du libellé `loc-anon`, **avant** `affichTableauAnon` et la sauvegarde d'ouverture
  ([gestion_entretiens.js:1405](../gestion_entretiens.js#L1405)) → la règle réapparaît et est ré-enregistrée.

**Reste / dépendances** :
- `loc-suggere` non strippé à `compactHtml` (persiste dans le `.sonal` **de travail**, mais self-corrigé
  à l'ouverture). Dans l'**export de partage**, `AnonymiserSegments` le retire déjà (cf. sauvHtml).
- ✅ **`regleEstIsolee` / 🔒 compte désormais les libellés** : `_aOccurrenceTraitee` retourne vrai aussi
  pour une règle **matérialisée par libellé** (proxy `existeLocalement && occ-texte=0 && non-brouillon`,
  fiable car un libellé confirmé persiste `existeLocalement=true` dans `ent.tabAnon`, et un fantôme non
  confirmé en est exclu). ⇒ downgrade corpus→document **bloqué (🔒)** si des libellés sont confirmés dans
  d'autres entretiens — plus d'orphelinage silencieux. Couvre les deux usages (`regleEstIsolee` **et**
  `marquerVerrousPortee`).
- ✅ Nettoyage des orphelins **au plain open** : `detecterLibellesASuggerer` démarque un libellé
  `loc-anon` **sans règle non-brouillon correspondante** (ex. règle corpus supprimée au panneau Pseudos)
  → retour au vrai nom dès l'ouverture, plus seulement au scan.

**Audit `occ>0`-aveugle (label-blindness) — passe systématique** : tous les sites testant `occ>0` pour
« matérialisé/utilisé/appliqué » ont été revus. Corrigés (ajout `aLibellePseudonymise` ou proxy libellé) :
gate de portée, filtre d'affichage, `nettoyerPairesOrphelines`, slider, `_aOccurrenceTraitee` (isolement
+ 🔒), `exportTableCorrespondance`, `aDesAnonymisations` (active `chkAnon` → menu clic-droit), split
validées/attente. **Hors-sujet / skip assumé** : batch brouillons (`validerAnonEnAttente`, lit les champs
d'édition — un libellé n'est pas un brouillon) ; filtre fantômes (`existeLocalement` protège déjà) ;
`reconcilierPorteesDivergentesAOuverture` (skip `occ=0`) — edge rare, `relabelPseudoEnPlace` est text-only
(reconcilier une divergence de pseudo **sur un libellé** demanderait un mécanisme dédié).

### Étape 4 — Menu contextuel du libellé (✅ fait)
`showMenuLibelleLocuteur` + `retirerPseudoLibelleLocuteur` ([anon-menus.js](anon-menus.js)), branchés
dans le handler de `attacheExceptionListeners` : **clic-droit** sur le libellé (`::before` du `.ligloc`,
détecté car **hors `[data-rk]`**) — items selon l'état (retirer / confirmer / refuser / ré-activer).
**Local**, toujours accessible (même locuteur non cité dans le texte). ⚠️ Distinct de la **suppression de
règle** (garde [regleEstIsolee](tableau_base.js#L1118) / I-POR-5 inchangée) : la règle corpus n'est
**PAS** supprimée.

**« Ne plus pseudonymiser » = REFUS persistant, pas suppression** : loc-anon → `loc-suggere-refuse`
(⊘, persisté), pseudo gardé dans `data-locpseudo-suggere`. Corrige un bug latent : un simple retrait de
`loc-anon` laissait la règle corpus **re-suggérer** le locuteur à la réouverture (→ re-pseudonymisé par
défaut à l'export). La règle **corpus reste au `.crp`** ; sa ligne locale disparaît car plus aucune
matérialisation (texte OU libellé) — inévitable, mais désormais **explicite et réversible** (le libellé
« Nom ⊘ » est la surface de gestion). Pour une règle Global label-only, `existeLocalement` repasse à
`false` (retour fantôme).

**Suppression de la RÈGLE** (≠ opt-out) : 2ᵉ item du menu d'un libellé confirmé, « 🗑 Supprimer la
règle… » → `supprimerRegleDepuisLibelle` délègue à [supprimeLigneAnon](tableau_base.js#L1029), qui
applique le garde-fou d'isolement : règle utilisée **uniquement ici** → supprimée (+ proposition de la
retirer du corpus) ; règle **partagée** (🔒, labels comptés) → refus + renvoi au **panneau Pseudos**
(seul endroit pour supprimer une règle corpus partagée, comme pour le texte). Une règle de libellé seul
y apparaît sous le filtre « Inutilisées » (le scan corpus compte le texte, pas les libellés).

### Étape 5 — Propagation suppression/édition → libellé (✅ fait, partiel)
[resynchroniserLibellesLocuteurs](tableau_base.js#L2085) réaligne les `.ligloc.loc-anon` sur l'état
courant des règles : pour chaque libellé marqué, on cherche une règle **non-brouillon** dont un alias
d'entité matche `data-nomloc` → aucune (supprimée / reparquée brouillon / entité renommée) = **démarque**
(retour au vrai nom) ; pseudo changé = **réécrit** `data-locpseudo`. Indépendant des occurrences (couvre
les règles label-only). Persiste via `syncHtmlVersMainProcess`. Hooks :
[supprimeLigneAnon](tableau_base.js#L1029) (suppression — le bug constaté), `changerPorteeLigne` (parking
📁/📄→🚧), [relabelPseudoEnPlace](tableau_base.js#L1856) (édition de pseudo, occ>0).

### Étape 5b — Hooks d'édition restants (✅ fait)
Tous via `resynchroniserLibellesLocuteurs` :
- **Label-only** (occ=0) édité → `sauvAnon` Cas 3 hooké.
- **Renommage / vidage d'entité** (Cas 1/4) → `demarquerLigneEtRemettreEnAttente` hooké.
- **Catch-all bouton scan** ([verifierEntretien](tableau_base.js#L317)) pour la re-locutarisation/dérive
  → hooké.

✅ **Vérifié — persistance saine** : `cleanHTML` ([gestion_fichiers.js:930](../../gestion_fichiers.js#L930))
et `compactHtml` ([:1056](../../gestion_fichiers.js#L1056)) **préservent** `loc-anon`/`data-locpseudo`/
`data-nomloc` (`cloneNode(false)` garde les attributs du `.lblseg` ; un `.ligloc` enfant est cloné en
profondeur). Donc le scan ne les efface pas, et le **round-trip `.sonal` est sain** → le ⚠️ des Étapes
1/2 est **levé**.

### Étape 6 — Statut libellés au panneau corpus (✅ fait)
Le panneau Pseudos colore chaque règle vert/orange selon son état à travers le corpus. Pour les règles
**personne** (matérialisées par libellé, **0 occurrence de texte**), le scan calcule maintenant un statut
**sans compteur** : [accumulerStatsLibellesCorpus](anon-scan.js) remplit `st.nbLocPending`/`nbLocResolu`,
et [appliquerResultatsScan:348](anon-scan.js#L348) colore la ligne **orange** (≥1 locuteur à
pseudonymiser) ou **vert** (tous résolus : pseudonymisés ou refusés), sinon « — ».
- **Candidats via `tabEnt[i].tabLoc`** (noms de locuteurs) → pas de nouvel index inversé.
- **Tout-ou-rien** par locuteur : un seul test d'état (1er `.ligloc` matchant), pas de comptage
  d'occurrences. `loc-anon`/`loc-suggere-refuse` = résolu ; `loc-suggere` / non marqué = pending.
- **Priorité texte** (demandée) : une entité **texte+personne** garde sa couleur texte (le test `nbNon`
  passe avant ; `nbLoc*` calculés mais ignorés).
- **Cache** : pas d'invalidation ajoutée dans les fns libellé (fenêtre édition ≠ fenêtre corpus) — la
  fermeture d'entretien pose déjà `_anonScanStale` ([gestion_entretiens.js:1302](../gestion_entretiens.js#L1302)).
- ✅ **Filtres d'état** ([tableau_global.js:1447](tableau_global.js#L1447)) intègrent les libellés, même
  logique priorité-texte que la coloration : une règle personne avec un libellé (résolu **ou** pending)
  n'est **plus « Inutilisées »** ; « à traiter » inclut les libellés **pending** ; « bouclées » inclut
  les personne-seules **toutes résolues**.
- ✅ **Loupe 🔍 (drill-down)** : pour une entité **personne-pure** (0 occurrence texte),
  `verifierEtAfficherEtatEntite` affiche `etatLibellesParEntretien` + `afficherVueLibellesLoc` (liste par
  entretien **vert** = résolu/refusé / **orange** = à pseudonymiser, + bouton **↗ Ouvrir**) au lieu de
  « aucune occurrence trouvée ». Candidats via `tabLoc`, tout-ou-rien. ⚠️ Non couvert : entité personne
  **multi-pseudo** (routée vers `verifierEtAfficherEtatMultiEntite`, texte) — cas rare.
- ✅ **Package COMBINÉ (texte+personne)** : coloration, filtres et loupe fusionnent texte+libellé.
  - **Coloration/filtres** ([anon-scan.js](anon-scan.js), [tableau_global.js:1447](tableau_global.js#L1447)) :
    orange si à traiter **d'un côté OU l'autre** (`nbNon>0 || nbLocPending>0`), vert si tout fait des
    deux, « — » si rien. Pastille **👤●/👤✓** dans la colonne État pour expliquer la couleur combinée
    (icône, pas un compteur — le nombre est en `title`).
  - **Loupe** : drill-down texte **+ section « 👤 Libellés locuteur »** dessous (liste par entretien
    vert/orange + Ouvrir), via `construireHtmlLibellesLoc(…, compact=true)` ajoutée après
    `afficherVerificationDansPanneau`. Entité personne-pure → liste seule (inchangé).
- ✅ **Suppression d'une règle corpus** (`supprimerRegleAnonGen`) : (a) vide la **vue détaillée**
  (`#fond_verif_anon`) si elle montrait l'entité supprimée ; (b) `retirerLibelleDeEntretien` **démarque
  les libellés** dans chaque entretien (le retrait texte `retirerPseudoDeEntretien` ne touche que le
  texte) → « supprimer = retirer partout », plus d'orphelin dans le HTML sauvegardé.

## Effets de bord — checklist

- [ ] **Re-locutarisation desync** ⚠️ principal : [locutarisation.js](../locutarisation.js#L185)
      réécrit `data-nomloc` (l.185/302/341/548) ; si un segment change de `data-loc`, son
      `loc-anon`/`data-locpseudo` devient **périmé**. → re-sync **dans le bouton scan**
      [verifierEntretien](tableau_base.js#L317) (qui re-dérive déjà l'état depuis le DOM) : revérifier
      chaque `.ligloc.loc-anon` contre les règles, purger les marquages périmés. Pas de hook sur chaque
      mutation locutarisation — l'utilisateur re-scanne, comme pour le texte.
- [ ] **Deux `tabHtml`** (anon.md §3.4) : le marquage libellé étant dans le HTML, il subit le **même**
      piège cache main vs renderer figé → repartir d'un `getHtml()` **frais**. Pas un piège neuf, le
      même que le texte.
- [ ] **Export** (Étape 0) : `exportTxtAvecClasses` écrit `locut[loc]` (tableau, pas le DOM) → doit
      lire le `.ligloc` courant pour capter `data-locpseudo`.
- [ ] **`?` interrogateur** : `data-nomloc` est **déjà** sans `?` → le match est direct, le statut
      « question » (`data-loc`/classe `qst`) reste géré ailleurs, intact. Point ouvert #1 de l'ancien
      plan = **caduc**.
- [ ] **N→1** : un même nom = plusieurs `.ligloc` (chaque tour) **et** parfois plusieurs `data-loc`
      (« Jacques? » + « Jacques ») → marquer tous les index dont le nom matche.
- [ ] **Multi-pseudo** : le libellé prend le **primaire** (`remplacement`). Pas d'incluses, pas de
      runs → aucune des complications du §9/§10.
- [ ] **`mode-anon`** : vérifier que le toggle « voir les pseudos » couvre bien les `.ligloc` (scope
      `#segments`).

## Points ouverts (à trancher à l'implémentation)

1. **Suggestion (Étape 3)** : auto-marquer « à pseudonymiser » à l'ouverture, ou seulement au
   prochain passage dans la table ? (Coût : une passe `O(règles × locuteurs)` au `cleanHTML`.)
2. **Style de la suggestion** non confirmée (pointillé ? badge ?) vs le barré ferme.
3. **Garde-fou export** : avertir si un `.ligloc` `loc-anon` n'a plus de règle correspondante (pseudo
   orphelin après suppression de règle hors propagation Étape 4).
4. **Source du pseudo selon le contexte** : le pseudo de libellé vit dans le DOM (`data-locpseudo`),
   donc la source diffère :
   - **Contextes rendus** (export texte, `sauvHtmlAnonymise`, synthèse d'extrait `varsPubliquesXtr`
     qui itère les spans `xtr.texte`) → pseudo **atteignable** → lire le DOM via `nomLocAffiche`.
   - **Agrégats multi-entretiens non rendus** (`varsPubliquesEnt(rkEnt)` en synthèse, stats corpus
     `statsLocs`/`dessinGraphLoc`) → **aucun DOM** → **dériver des règles corpus**
     (`cleEntite(tabLoc[i]) → remplacement`). Sémantiquement correct (agrégat ⇒ portée corpus), au prix
     de perdre l'opt-in par entretien.
   - **Orthogonal** : un **toggle anon/non-anon** sur la synthèse (intention de l'export) reste une
     feature séparée — il choisit *si* on anonymise, pas *comment* on atteint le pseudo.
