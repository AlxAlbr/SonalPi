# Plan — Thématiques d'entités (pseudonymisation)

## Objectif

Permettre à l'utilisateur de **catégoriser** chaque entité pseudonymisée par une
**thématique** (PER, LOC, ORG, DAT…), puis de **retrouver** toutes les entités
d'une thématique via la case « Rechercher » déjà présente au niveau corpus.

Fonctionnalité **optionnelle** (opt-in) : elle n'apparaît que si l'utilisateur
l'active dans les paramètres. Interface volontairement minimale — aucun nouveau
panneau, aucune nouvelle colonne.

**Workflow visé (entretien-first)** : l'utilisateur travaille au niveau des
**entretiens**. La thématique s'y pose et **remonte** au corpus en suivant le
cycle de portée existant 🚧 brouillon → 📄 document → 📁 corpus. Elle devient
recherchable au corpus une fois la règle promue en portée corpus.

## Décisions retenues (Q/R du 2026-07-01)

| Point | Décision |
|-------|----------|
| Granularité | **Par entité/règle** (la ligne `{entite, remplacement}`). Toutes les occurrences de l'entité héritent de la thématique. |
| Cardinalité | **Une seule** thématique par entité (ou aucune). |
| Assignation | **Badge/chip cliquable** dans la colonne Actions (niveaux entretien ET corpus). |
| Source de vérité | La **règle à sa portée courante** (entretien pour brouillon/document ; corpus pour corpus). Remontée via le cycle de portée. |
| Recherche | Dans la case « Rechercher » existante (niveau corpus). |
| Réglage | Niveau **corpus** (comme les mots de liaison), **désactivé par défaut**. Défauts : PER, LOC, ORG, DAT. Ajout/retrait libre. |

### Point d'attention recherche (casse)

La recherche corpus est aujourd'hui **insensible à la casse**
([tableau_global.js:1542](tableau_global.js#L1542) et
[:1574](tableau_global.js#L1574) : `.toLowerCase().includes()`).
Mettre les thèmes en majuscules ne suffit donc pas à les distinguer du texte
(« PER » matcherait « Pierre »).

**Solution retenue** (« match texte simple » robustifié, sans nouvel élément
d'UI) : si le terme saisi **correspond exactement** à une thématique active
(comparaison insensible à la casse sur le vocabulaire contrôlé), on bascule en
**filtre par thématique** ; sinon, recherche texte habituelle. Le vocabulaire
étant contrôlé et court, la collision avec une vraie recherche texte est
négligeable.

## Modèle de données

### Réglage (niveau corpus)

Étendre `window.paramsAnonCorpus` (déjà persisté dans le `.crp` via
`setParamsAnon` / `getMotsLiaison`) avec un bloc `thematiques` :

```js
window.paramsAnonCorpus = {
  motsLiaison: [...],              // existant
  thematiques: {                  // NOUVEAU
    actif: false,                 // opt-in
    liste: ["PER", "LOC", "ORG", "DAT"]
  }
}
```

Défaut si absent : `{ actif: false, liste: THEMES_DEFAUT }`. Aucune migration de
`.crp` nécessaire (lecture défensive avec valeurs par défaut).

### Thématique d'une entité (source de vérité = règle à sa portée)

La thématique est un attribut **de l'entité**, porté par la **règle elle-même**
(champ supplémentaire), là où elle vit à sa portée courante :

```js
{ entite: "...", remplacement: "...", portee: "document|corpus", /* ... */, thematique: "PER" }  // ou absente
```

- Portée **corpus** : la règle vit dans le store corpus (accédé via
  `window.electronAPI.getAnon()` / `persisterReglesCorpus`, clé `cleEntite()` —
  [anon-regles.js:126](anon-regles.js#L126)), persisté automatiquement dans le
  `.crp` (sérialisation JSON complète, cf.
  [tableau_global.js:2970](tableau_global.js#L2970)).
- Portée **document / brouillon** : la règle vit dans `window.tabAnon` de
  l'entretien, persisté via `sauvegarderTabAnonEnt()` → `tabEnt[rk].tabAnon`. La
  thématique y est stockée en attendant la promotion.
- Une thématique retirée de la liste des paramètres : les entités qui la
  portaient conservent la valeur en donnée (pas de purge destructive) mais le
  badge l'affiche en « inconnue/grisée » ; option « nettoyer » possible plus tard.

#### Deux points de plomberie pour la remontée (⚠ critiques)

La thématique doit **survivre** au passage entretien → corpus. Deux endroits à
traiter, sinon elle se perd silencieusement :

1. **La normalisation corpus jette les champs inconnus.**
   `fusionnerRegles` ([anon-regles.js:316](anon-regles.js#L316)) reconstruit un
   objet épuré `{ entite, remplacement, remplacementAlt }` (volontairement, pour
   ne pas polluer le `.crp`). Toute règle qui remonte/se resynchronise y perd
   `thematique`.
   → **Correctif : ajouter `thematique: p.thematique` à l'objet reconstruit**
   (une ligne). `normaliserRegle` fait déjà `{...regle}`, il préserve tout : seul
   `fusionnerRegles` filtre.

2. **La fusion est « corpus prioritaire » (première liste gagnante).**
   `synchroniserTabAnonGlobal` / `reconstituerTabAnonGlobal` passent le global
   AVANT le local ([anon-regles.js:414](anon-regles.js#L414)). Pour une entité
   **déjà au corpus**, une thématique modifiée depuis l'entretien serait écrasée
   par la valeur corpus à la resync.
   → **Parade (déjà employée pour le renommage de pseudo) : écrire selon la
   portée de la ligne au moment du clic** (voir Phase 2), plutôt que de compter
   sur la fusion pour ce cas. La fusion ne sert qu'à porter la thématique des
   règles **document/brouillon** lors de leur promotion (elles n'ont pas de
   contrepartie corpus, donc pas d'écrasement).

## Découpage en phases

### Phase 1 — Réglage « Thématiques » dans la modale Paramètres

Fichier : [anon-params.js](anon-params.js).

1. Ajouter une constante `THEMES_DEFAUT = ["PER", "LOC", "ORG", "DAT"]`.
2. Sous la section « Mots de liaison » de la modale, ajouter une section
   « Thématiques d'entités » :
   - Un interrupteur **Activer / Désactiver** (checkbox ou toggle).
   - Un éditeur de **chips** identique à celui des mots de liaison
     (`_renderChipsLiaison` → factoriser en `_renderChips(cible)` ou dupliquer)
     avec champ + bouton « Ajouter » et bouton « ↺ Réinitialiser » (→ `THEMES_DEFAUT`).
   - Les chips/champ sont grisés/masqués tant que l'interrupteur est off.
3. Normalisation à l'ajout : `trim`, un seul token, **stockage en MAJUSCULES**
   (convention), dédoublonnage. (Facultatif : borne de longueur.)
4. Brouillon : gérer `_thematiquesBrouillon = { actif, liste }` à côté de
   `_motsLiaisonBrouillon`, amorcé depuis l'effectif courant.
5. `enregistrerParamsAnonCorpus` : inclure `thematiques` dans l'objet `params`
   sauvegardé (le reste du flux `setParamsAnon` + `sauvegarderCorpus` est inchangé).
6. Helper d'accès global `getThematiques()` (miroir de `getMotsLiaison()`) :
   renvoie `{ actif, liste }` effectif (corpus sinon défauts).

### Phase 2 — Badge/chip dans la colonne Actions

**Sélecteur partagé** — extraire une petite fonction réutilisable
`ouvrirSelecteurThematique(ancre, valeurCourante, onChoix)` (popover positionné
sur le badge, liste des thématiques actives + « Aucune », fermeture au clic
extérieur). Elle sera appelée par les deux niveaux, dans leurs deux idiomes de
rendu.

**Écriture selon la portée** — helper commun `definirThematiqueEntite(regle, valeur)` :
- portée **corpus** → poser `thematique` sur la règle corpus (résolue par
  `cleEntite` dans le store `getAnon()`), `persisterReglesCorpus(...)` puis
  `sauvegarderCorpus(false)` (même schéma que le renommage de pseudo,
  [tableau_global.js:1801](tableau_global.js#L1801)/[:1834](tableau_global.js#L1834)) ;
- portée **document / brouillon** → poser `thematique` sur la règle
  `window.tabAnon[i]` puis `sauvegarderTabAnonEnt()`. Elle remontera au corpus
  via `fusionnerRegles` (Point 1) à la promotion.

#### Niveau corpus — [tableau_global.js](tableau_global.js), `creerLigneAnonGen` (~[:1706](tableau_global.js#L1706))

1. Si `getThematiques().actif`, insérer dans `tdActions` (avant les boutons) un
   **badge** :
   - Entité sans thématique → chip discret « ＋ thème ».
   - Entité avec thématique → chip coloré affichant le libellé (ex. « PER »).
2. Au clic → `ouvrirSelecteurThematique(...)`. (Ici toutes les lignes sont de
   portée corpus → écriture store corpus.)
3. Exposer la thématique sur la ligne pour la recherche : `tr.dataset.thematique`,
   rafraîchi après choix.

#### Niveau entretien — [tableau_base.js](tableau_base.js), rendu ligne (colonne Actions ~[:656](tableau_base.js#L656))

1. Même badge, visible si `getThematiques().actif`, uniquement pour les lignes
   ayant une entité non vide (idéalement pas les brouillons vides).
2. ⚠ Rendu en **chaîne HTML** ici (pas en DOM comme au corpus) : le badge est
   posé via un `onclick` global (ex. `ouvrirBadgeThematique(i)`) qui lit
   `window.tabAnon[i]` et appelle le sélecteur/`definirThematiqueEntite` partagés.
3. Écriture **selon la portée de la ligne** (voir helper ci-dessus) : c'est ce
   qui fait remonter proprement la thématique sans se faire écraser par la fusion.

#### Styles

Réutiliser le style « chip » existant des mots de liaison
([anon-params.js:119](anon-params.js#L119)) ; éventuellement une couleur par
thématique (palette fixe indexée sur la liste) dans
[anon-styles.js](anon-styles.js) ou `ajouterStylesAnonGen`.

### Phase 3 — Recherche par thématique (niveau corpus)

Fichier : [tableau_global.js](tableau_global.js), `appliquerFiltrePseudos` (~[:1540](tableau_global.js#L1540)).

1. Récupérer la liste des thématiques actives une fois (`getThematiques()`).
2. En tête de fonction : si `getThematiques().actif` **et** le terme saisi
   (normalisé, trim, comparaison insensible à la casse) est **exactement** l'une
   des thématiques actives → passer en **mode filtre thématique** :
   ligne visible ssi `tr.dataset.thematique` (normalisé) === terme.
   Ce mode se combine avec le `select` de filtre d'état comme aujourd'hui.
3. Sinon : comportement actuel inchangé (substring entité/pseudo).
4. Le compteur `X / N` reste géré tel quel.

> Placeholder de la case : envisager « Rechercher (entité, pseudo, ou thème)… »
> quand la fonctionnalité est active, pour la découvrabilité.

### Phase 4 — Aide, robustesse, export

1. **Aide** : ajouter un paragraphe dans [anon-help.js](anon-help.js) (à côté du
   « 7️⃣ Paramètres ⚙ — mots de liaison ») décrivant les thématiques et la
   recherche par thème.
2. **Lecture défensive** partout : `getThematiques()` renvoie toujours un objet
   valide même si `paramsAnonCorpus.thematiques` est absent (ancien `.crp`).
3. **Désactivation** : si `actif=false`, aucun badge ni logique de recherche
   thématique ; les valeurs `thematique` déjà en donnée sont conservées (non
   destructif) et réapparaissent si on réactive.
4. **Export table de correspondance** : décider si `thematique` est incluse
   (cf. [anon-import_export.js](anon-import_export.js), `entite_init/entite_pseudo`).
   Proposition : champ optionnel `thematique` dans le JSON exporté, ignoré à
   l'import s'il est absent. À confirmer avant implémentation.

## Fichiers touchés (récapitulatif)

| Fichier | Rôle |
|---------|------|
| [anon-params.js](anon-params.js) | Section « Thématiques » (toggle + chips), brouillon, sauvegarde, `getThematiques()` |
| [anon-regles.js](anon-regles.js) | ⚠ Point 1 : carrier `thematique` dans `fusionnerRegles` (~[:316](anon-regles.js#L316)) — indispensable à la remontée |
| [tableau_global.js](tableau_global.js) | Badge Actions corpus, sélecteur + `definirThematiqueEntite` partagés, recherche par thème |
| [tableau_base.js](tableau_base.js) | Badge Actions entretien (rendu string HTML + onclick), écriture selon portée |
| [anon-styles.js](anon-styles.js) | Style badge/couleurs (optionnel) |
| [anon-help.js](anon-help.js) | Documentation utilisateur |

## Ordre d'implémentation conseillé

1. Phase 1 (réglage + `getThematiques()`) — testable isolément (persistance `.crp`).
2. **Point 1** (`fusionnerRegles` porte `thematique`) — prérequis de toute remontée ; trivial et sans risque.
3. Phase 2 entretien (badge + `definirThematiqueEntite` par portée) — cœur du workflow entretien-first.
4. Phase 2 corpus (badge, réutilise le sélecteur partagé) + `tr.dataset.thematique`.
5. Phase 3 (recherche corpus) — dépend du `dataset.thematique`.
6. Phase 4 (aide/export/robustesse).

## Points à confirmer avant de coder

- **Interrupteur** : checkbox simple suffit-il, ou toggle stylé attendu ?
- **Couleur par thématique** : souhaitée, ou badge neutre unique ?
- **Export** : inclure `thematique` dans la table de correspondance JSON ?
- **Recherche entretien** : le filtre par thème est-il utile aussi au niveau
  entretien, ou strictement corpus ? (Le plan le limite au corpus, seul niveau
  doté d'une case Rechercher aujourd'hui.)
