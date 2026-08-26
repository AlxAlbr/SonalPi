# Plan — Thème inactif : filtrer le marquage et bloquer le codage

> Aujourd'hui le flag `actif` d'une catégorie du codebook est **purement décoratif** :
> il ne fait que griser le thème dans les listes (`EditionThemes.vue`, panneau
> « Thématiques » d'[Entretien.vue](../../src/renderer/components/Entretien.vue),
> consultation de [Corpus.vue](../../src/renderer/components/Corpus.vue)). Les codages
> d'un thème inactif restent pleinement affichés dans l'éditeur (soulignés, couleurs,
> tailles) et on peut continuer à coder avec. Cible : rendre le flag **effectif** en
> (a) **filtrant** le marquage d'un thème inactif et (b) **bloquant** le codage sur ce
> thème. Le cas « un ou plusieurs thèmes inactifs » est couvert par construction : la
> logique est un prédicat par code.

## Décisions

- **D1 — Filtrer l'affichage par code.** On injecte un prédicat `estCodeActif(code)`
  dans le scope entretien (`useEntretien` → `pluginDecorations` →
  `construireDecorations`), même idiome d'injection que `couleurTrait`/`tailleTrait`.
  Dans `construireDecorations`, on filtre les annotations à la source : on écarte les
  `codage` dont le code est inactif AVANT le découpage en segments. Du coup un thème
  inactif ne compte **ni** pour les soulignés, **ni** pour la hauteur des barres de
  chevauchement, **ni** pour la taille de police, **ni** pour `data-annot-*`/infobulles.
  Les `anon` et `commentaires`, non liés à un thème, ne sont pas concernés.
- **D2 — Bloquer le codage, pas le retrait.** Dans `coderAvec` : si le thème est
  inactif ET qu'aucun codage de ce code ne couvre déjà la plage → `hintCodage`
  (« Thème inactif — réactivez-le pour coder. ») et retour sans rien poser. S'il
  existe déjà un codage sur la plage (re-clic même thème, geste de retrait), on
  **l'autorise** : le nettoyage d'un thème inactif reste possible.
- **D3 — Grisage renforcé, bouton cliquable + hint (pas `:disabled`).** Le grisage
  actuel est trop discret (`opacity` 0.5 / 0.5 / 0.45). On marque davantage la
  désactivation sur les trois surfaces — proposition : `opacity` ≈ 0.3 partout
  (`.liste-thm li.inactif`, `.liste-thm-lecture li.inactif`, `.theme-coder.inactif`),
  pour que la différence soit lisible d'un coup d'œil. Le bouton d'un thème inactif
  reste visible, grisé et **cliquable** pour que le hint explique le refus : un
  `:disabled` est rejeté (un bouton désactivé sans explication ne dit pas pourquoi).

- **D3b — `estCodeActif` OBLIGATOIRE.** Résolveur requis sur `pluginDecorations` /
  `construireDecorations` ET dep requise de `useEntretien` (pas de défaut "tout
  actif"). Coût de migration négligeable : ce résolveur n'est appelé qu'en
  production (`sonal.ts`) et **une seule fois dans les tests**
  (`test/decorations.test.ts:34`, à enrichir d'un `() => true`) ; aucun `useEntretien(`
  dans les tests. Rendre le filtrage explicite évite un repli silencieux qui
  réafficherait par erreur un thème inactif.
- **D4 — Même filtre sur la peinture des cartes/lecteur.** `peintureSegment`
  ([useCorpus.ts](../../src/renderer/composables/useCorpus.ts)) colore les cartes du
  corpus et la bande du lecteur selon les thèmes couvrants. Par cohérence, un thème
  inactif n'y peint pas (réutilisation du même prédicat) : une catégorie « sans
  effet » ne pèse ni sur l'éditeur ni sur les résumés.
- **D5 — Export inchangé.** `exportSonal` écrit `act: cat.actif` sur la **définition**
  du thème et les codages sortent tels quels ; on ne retire PAS les codages d'un thème
  inactif à l'export. Round-trip sans perte : les passages restent codés et le thème
  peut être réactivé plus tard. L'état inactif voyage donc par la catégorie, pas par
  les annotations.

## Réalisé

- `useCorpus.ts` : `estCodeActif(code)` (catégorie inactive → false, absente →
  `` true ``) ; exposé et injecté dans `useEntretien` (via `sonal.ts`) ; utilisé
  dans `peintureSegment` (un thème inactif ne peint ni couleur ni pondération).
- `useEntretien.ts` : dep obligatoire `estCodeActif` ; passée à `pluginDecorations` ;
  refus dans `coderAvec` (thème inactif sans codage déjà posé sur la plage → hint,
  rien posé ; le re-clic/retrait reste possible).
- `decorations.ts` : `pluginDecorations` / `construireDecorations` prennent
  `estCodeActif` et filtrent les codages inactifs à la source (ni souligné, ni
  hauteur de barres, ni taille, ni compte/titre).
- Grisage : `opacity` → `0.3` sur `Corpus.vue`, `EditionThemes.vue`, `Entretien.vue`.
- **Clic droit sur un thème → bascule actif/passif** (sans ouvrir l'édition) :
  nouveau composant `MenuTheme.vue` (menu flottant téléporté, même patron que
  `MenuContexte` — couche plein écran + Escape), branché sur le panneau
  Thématiques d'`Entretien.vue` et la consultation de `Corpus.vue`
  (`@contextmenu` → `modifierTheme(id, { actif })`). Masqué en lecture seule.
  Un thème inactif réactivé: repose le marquage des codages restés au modèle.
- Tests : nouvel e2e `theme-entretien.e2e.ts` (clic droit → « Passer en passif »
  masque le marquage, « Passer en actif » le restaure).
- **Repli des sous-thèmes dans `EditionThemes.vue`** : petite icône ▾/▸ à gauche
  d'une catégorie qui a des enfants directes pour replier/déplier sa branche.
  `.shared/corpus/categories.ts` : `NoeudTheme.aEnfants` + fonction pure
  `visiblesThemes(arbre, replies)` (filtrage d'affichage, la catégorie repliée
  reste visible, ses descendants sont masqués). `replies` est un `ref` LOCAL au
  composant — état de VUE, jamais persisté, indépendant par écran, sans aucun
  impact modèle ni multi-utilisateur (cohérent avec D3b/D5 et l'Option A
  confirmée : seul l'actif/passif est partagé). Nouveaux tests PUR dans
  `test/corpus.test.ts` (`aEnfants`, `visiblesThemes` : repli racine / repli
  d'un enfant / aucune restitution). Même icône ajoutée au **panneau Thématiques
  de l'Entretien** (span `@click.stop` dans le bouton, pour rester du HTML
  valide) et à la **consultation du Corpus** — chaque écran garde son propre
  `repliesThemes`. Icône agrandie (`width 1.4rem, font-size 0.9rem`). Nouvel e2e
  `theme-entretien.e2e.ts` (replier « Pondérations » masque ses enfants sans
  coder, déplier les restaure).
  Au panneau Entretien : ajout du **compteur de codages** (`usages`) aligné à
  droite de chaque thème (comme la consultation Corpus), et **espace resserré**
  icône↔nom (gap `.theme-coder` 0.45→0.3rem, `.depliant` 1.4→1.1rem).
- **UX de création** (`EditionThemes.vue`) : le champ nom est **auto-focusé et
  présélectionné** au clic sur « + Thème parent » / « + enfant », pour nommer
  sans effacer « Nouveau thème » ; un clic dans un champ nom sélectionne aussi
  tout son texte (`@focus → select()`). `ajouterTheme`/`ajouterSousTheme`
  renvoient désormais l'id créé (retour inoffensif : seuls ce composant les
  utilise). Nouvel e2e (focus + taper remplace le nom).
- Tests : nouveaux cas PUR `test/decorations.test.ts` (marquage masqué, actif
  préservé, chevauchement, compte) ; e2e `theme-entretien.e2e.ts` (décocher →
  marquage masqué de l'éditeur, codage refusé avec hint).

Périmètre du test `peintureSegment` : la fonction est une fermeture interne du
composable (dépend de `codebook.value`, `tailleTheme`, `couleurTrait`), pas un
module PUR testable tel quel — elle n'avait aucun test PUR avant non plus. Le
filtre qu'elle réutilise (`estCodeActif`) est couvert par les tests de décorations.

## Étapes

1. **`useCorpus.ts`** : exposer `estCodeActif(code)` (= retrouver la catégorie par id,
   `cat?.actif ?? true`) ; l'ajouter aux retours et à l'appel de `useEntretien` (avec
   `tailleTrait`, `nomCode`, etc.).
2. **`useEntretien.ts`** : ajouter `estCodeActif: (code: string) => boolean` aux deps
   (D3b, obligatoire) ; le passer à `pluginDecorations` ; l'utiliser dans `coderAvec`
   (D2).
3. **`decorations.ts`** : `pluginDecorations(…, estCodeActif)` →
   `construireDecorations` ; filtrer `actives` par
   `a.type !== 'codage' || estCodeActif(a.code ?? '')` en plus de `estOrpheline`.
   Mettre à jour l'unique appel de test (`test/decorations.test.ts:34`) avec
   `() => true`.
4. **Grisage renforcé (D3)** : passer `opacity` à ≈ 0.3 sur `Corpus.vue`,
   `EditionThemes.vue` et `Entretien.vue`.
5. **`useCorpus.ts` — `peintureSegment`** : écarter les codes inactifs (D4).
6. **Tests** :
   - pur décorations : un thème inactif n'émet aucun marquage sur sa plage ; sur un
     chevauchement avec un thème actif, la hauteur/barres ignore le code inactif ; un
     thème actif reste affiché.
   - PUR `peintureSegment` : un code inactif n'ajoute ni couleur ni pondération.
   - e2e : décocher un thème → son marquage disparaît de l'éditeur / sa pastille de
     carte ne peint plus ; cliquer un thème inactif avec une sélection → hint, aucun
     codage posé ; re-clic sur un passage déjà codé de ce thème → retrait OK.

## Hors périmètre

- Masquer carrément le thème (au-delà du grisage actuel) dans les listes : le grisage
  est conservé, on garde la visibilité de l'existence du thème.
- Gestion du thème inactif comme « à refléter sur un autre poste » : rien de neuf,
  `actif` est déjà une définition persistée/partagée (parité SonalPi, champ existant).
