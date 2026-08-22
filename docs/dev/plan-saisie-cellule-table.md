# Plan — Saisie par cellule dans la Table de données (navigation clavier + publication sans session)

Statut : **RÉALISÉ** (phases 1 à 4).
Phase 1 : garde par ligne `tableLigneEditable` (`sonal.ts`), commit unitaire via
`poserValeurLot` à UN item (`validerCelluleTable` dans `useCorpus.ts`), erreur
inline `cell-erreur` + tooltip nominatif ; test contrat locuteur ajouté.
Phase 2 : modèle pur `src/renderer/tableNavigation.ts` (`grilleCellules` +
`celluleVoisine`, 4 sens), registre de focus `refsCellules`, gestes Entrée/
Shift+Entrée/Tab/Shift+Tab câblés ; tests unitaires + e2e clavier.
Phase 3 : scénario e2e n° 4 dans `multi-utilisateur.e2e.ts` (refus inline à
deux postes, garde par ligne après Actualiser, re-saisie réussie) ; scénario n° 2
mis à jour (garde par ligne remplace l'ancien « refus par bannière du main »).
Phase 4 : docs user/dev mises à jour. Note Chromium conservée ci-dessous.
Validation finale : typecheck, 433 tests unitaires, 5 e2e table-donnees,
4 e2e multi-utilisateur — au vert.

Note Chromium (phase 2) : sur un `<select>` fermé, le keyup d'Entrée est AVALÉ →
les selects écoutent `keydown.enter` sans preventDefault (le déroulant ouvert se
ferme normalement).

Extension de `plan-lot-table-donnees.md` (réalisé), dont §10
esquissait la présente étape 3 (« par CELLULE »).
Périmètre visé : `src/renderer/components/TableDonnees.vue`,
`src/renderer/composables/{sonal,useCorpus}.ts`, e2e + tests contrat.
**Côté main : RIEN de nouveau** — le primitif `poserValeurLot` (phase 2 du plan
précédent) est réutilisé tel quel, appelé avec UN item au lieu de N.

## 1. Objectif

Rendre les cellules directement éditables dans la table (aujourd'hui : bouton
ligne « Saisir… » vers l'onglet Donnée, ou lot ⇊ par colonne), avec une
sémantique clavier type tableur qui fait naturellement le remplissage de
colonne. Le geste « corriger une cellule » et le geste « traiter une colonne
entière » coexistent : le choix lot-vs-cellule est un choix PRODUIT (cf.
`plan-lot-table-donnees.md` §10), pas un remplacement.

## 2. Décisions produit (tranchées en amont du plan)

| Question | Décision | Pourquoi |
|---|---|---|
| Garde-t-on le bouton lot ⇊ ? | **OUI** | gestes distincts : cellule = valeurs hétérogènes ; lot = UNE valeur pour tous, avec refus nommés des entretiens verrouillés sans bloquer les autres. Initialiser une variable sur 30 entretiens dont 2 ouverts ailleurs reste un geste de lot. |
| Entrée | **valide ET descend** à la même colonne | c'est elle qui rend le remplissage de colonne agréable ; sans elle l'utilisateur retombe sur le lot et l'extension perd son intérêt |
| Tab | cellule suivante sur la même ligne (à droite) | convention tableur universelle |
| Échap | annule la saisie, reste sur place | déjà implémenté sur les cellules libres (`celluleLibre = null`) |
| Shift+Entrée | valide ET remonte (colonne) | symétrique du défaut Excel ; gratuit une fois la liste plate écrite (§5) |
| Shift+Tab | cellule précédente sur la même ligne (à gauche) | convention tableur universelle |
| Blur | valide (comportement actuel conservé) | quitter la cellule = saisie terminée |

Nuance importante : « descendre » ≠ ligne visuelle suivante. Les lignes
locuteurs s'intercalent sous chaque ligne entretien, et une colonne n'a de
cellule que sur les lignes de SA portée. La descente saute donc :
- les lignes sans cellule dans cette colonne (locuteurs sous une colonne ent,
  séparateurs entretien sous une colonne loc) ;
- les lignes NON ÉDITABLES (entretien verrouillé 🔒 par autrui).

## 3. Socle réutilisé — zéro protocole nouveau

- **Publication d'UNE cellule** = `poserValeurLot([{ entretienId, cible,
  idVar, idMod }])` : verrou court → GET frais → PUT If-Match → miroir
  écrit-through → libérer. Retour `{ succes, echecs }` → ici 0 ou 1 item,
  donc succès OU raison nominative. Corpus local : `poserValeurLotLocal`,
  mêmes résultats.
- **Saisie libre** : trouve-ou-crée la modalité par libellé via
  `modaliteParLibelle` (idiome existant des cellules et de `LotVariable.vue`),
  AVANT l'appel au lot.
- Les saisies rapprochées se sérialisent (même barrière que les transactions
  rapprochées, observée en e2e) — voir toutefois §8 sur la file par entretien.

## 4. Phase 1 — Édition par ligne (garde verrou + commit unitaire)

1. `sonal.ts` : exposer `tableLigneEditable(id): boolean` =
   `!lectureSeule.value && !badgeVerrou(id)` — dans la table on ne tient
   JAMAIS de session (y entrer ferme toute session d'écriture), donc tout
   badge 🔒 est nécessairement autrui. (Ne pas confondre avec
   `entretienEditable`, propre à l'écran Entretien ouvert.)
2. `TableDonnees.vue` :
   - remplacer `:disabled="lectureSeule"` des cellules par
     `:disabled="!tableLigneEditable(e.entretienId)"` (les badges 🔒/👁 et le
     bouton « Saisir… » restent les marqueurs visuels par ligne) ;
   - nouvelle fonction commune `validerCellule(entId, index?, idVar, idMod)`
     : construit l'`ItemLotValeur` (`cible: {type:'entretien'} |
     {type:'locuteur', index}`), appelle `poserValeurLot([item])`, puis
     `rafraichirMatrice()` ;
   - `surSelectGen/Loc` et `surLibreGen/Loc` passent par `validerCellule`
     (les fonctions Libelle résolvent d'abord `modaliteParLibelle`) ;
   - **erreur inline non bloquante** : ref (`celluleErreur`, clé de cellule
     même convention que `celluleLibre`) alimenté par `echecs[0].raison`
     quand le lot échoue → bordure rouge + tooltip nominatif sur LA cellule ;
     effacé au focus suivant ou à `rafraichirMatrice()`. Jamais de blocage
     ni de bannière globale pour un refus unitaire (la bannière reste pour
     les erreurs IPC/réseau globales).
3. Tests contrat (`test/webdav/transactions.test.ts`) : le chemin « lot à UN
   item » est déjà couvert par les tests du lot — ajouter au besoin un cas
   locuteur (`cible: {type:'locuteur', index}`) si absent.

## 5. Phase 2 — Navigation clavier (le cœur UX)

1. **Registre de focus** : Map `cle → HTMLElement` peuplée par des fonctions
   `:ref` (idiome existant `focaliserLibre`). Clé = même convention que
   `cleGen`/`cleLoc`.
2. **Modèle de déplacement PUR** (testable sans DOM) : à partir de
   `matrice × variablesVisibles × filtrePortee`, calculer la liste plate des
   cellules éditables dans l'ordre VISUEL (lignes × colonnes, en excluant
   cellules absentes (portée) et lignes non éditables). Fonction
   `celluleSuivante(cle, sens: 'bas'|'haut'|'droite'|'gauche')` → clé cible
   ou null (les quatre sens couvrent Entrée/Shift+Entrée et Tab/Shift+Tab).
3. **Gestes** :
   - Entrée sur `<input>` libre : commit (blur existant) + focus bas ;
     Shift+Entrée : commit + focus haut ;
   - Entrée / Shift+Entrée sur `<select>` : focus bas / haut (la valeur est
     déjà validée au `change`) ;
   - Tab / Shift+Tab : droite / gauche (on reprend la main pour rester dans
     le modèle de cellules éditables — Tab natif sauterait aussi badges,
     boutons ⇊ et « Saisir… ») ;
   - `scrollIntoView({ block: 'nearest' })` sur la cible.
4. **Focus immédiat, transaction en arrière-plan** : la navigation ne doit
   PAS attendre le cycle réseau (~4 allers-retours). On déplace le focus
   tout de suite ; le commit part en tâche et marque l'erreur inline sur la
   cellule QUITTÉE en cas d'échec. Sérialisation par entretien côté renderer
   (file d'attente `Map<entretienId, Promise>`) : deux commits rapprochés
   sur le MÊME fichier ne doivent jamais se croiser (sinon risque 412 par
   auto-concurrence).
5. Vider la valeur : poser « — » (`idMod = ''`) marche déjà via le select ;
   rien de dédié en v1 (parité avec le lot).

## 6. Phase 3 — e2e

1. `e2e/table-donnees.e2e.ts` (corpus local) : édition directe d'une cellule
   (select ET texte libre), Entrée → focus sur la ligne suivante de la
   colonne (saut des lignes locuteur), Échap annule, erreur impossible en
   local (pas de garde) — la matrice se met à jour après chaque commit.
2. `e2e/multi-utilisateur.e2e.ts` — scénario 4 (même mécanique narration/
   DEMO_PAUSE_MS) : Max tient le verrou de `ID`. Olivier, dans la table :
   - saisit une cellule de `ID` → refus inline rouge « ouvert par max », la
     navigation continue ;
   - saisit une cellule de `ID2` → succès, miroir fraîchi, matrice à jour
     sans pull complet ;
   - vérifications SERVEUR : `ID.valeursGen` inchangé, `ID2.valeursGen` à
     jour, verrou toujours tenu par max.

## 7. Phase 4 — Documentation

- `docs/user/multi-utilisateur.md` + `docs/user/corpus-distant.md` : les trois
  gestes désormais côte à côte (cellule / ligne / lot), sémantique clavier,
  refus inline nominatif.
- `docs/dev/multi-utilisateur.md` : une ligne — la saisie par cellule réutilise
  le primitif §« écriture de valeurs sans session » avec UN item.
- Mettre à jour `plan-lot-table-donnees.md` §10 (étape 3 → réalisé) et ce plan
  (statut → réalisé).

## 8. Points de vigilance

| Point | Décision |
|---|---|
| Verrou global / session longue pendant la saisie | REFUSÉ comme pour le lot : verrou COURT par validation de cellule, jamais tenu entre deux saisies |
| Deux commits rapprochés sur le MÊME entretien | File d'attente renderer par `entretienId` (auto-concurrence interdite → sinon 412 contre soi-même) |
| Attente réseau avant déplacement du focus | REFUSÉ : focus immédiat, transaction en arrière-plan, erreur inline a posteriori |
| Ligne verrouillée 🔒 | cellules désactivées (visuellement évident), la descente les SAUTE — le lot reste le bon outil quand il y en a beaucoup |
| Divergence 412 (autrui écrit entre notre GET et PUT) | échec inline nommé, pas de retry v1 — l'utilisateur resaisit la cellule (parité lot) |
| Refus unitaire vs bannière | refus de cellule = inline rouge + tooltip ; bannière `erreurs.ts` réservée aux erreurs IPC/réseau globales |
| Tab natif | repris : il faut naviguer cellule éditable → cellule éditable, pas cellule → badge/bouton |
| Shift+Entrée (remonter) | FAIT en phase 2 (§5) : symétrique du défaut Excel, gratuit via la liste plate |
| Présence 👁 | jamais décisionnelle, comme partout (§8 du plan précédent) |

## 9. Ordre d'exécution & estimation

1 → 4 dans l'ordre (chaque phase laisse l'app cohérente et testée) :
Phase 1 petite-moyenne (garde par ligne + commit unitaire + erreur inline) ·
Phase 2 moyenne (modèle de déplacement pur + registre de focus + file par
entretien) · Phase 3 moyenne (deux scénarios e2e) · Phase 4 petite.

Le gros du protocole étant déjà réglé par le plan précédent, la difficulté
restante est purement renderer : garde par ligne correcte, navigation dans une
grille à lignes groupées, et asynchronisme discret (focus immédiat, erreurs à
posteriori sans jamais casser le rythme de saisie).

## 10. Filtre « lignes sans valeur » dans la modale de lot — RÉALISÉ

Extension de `LotVariable.vue` (le lot ⇊ existant).

**Idée** : dans la modale, un filtre « seulement les entretiens SANS valeur
pour cette variable ». C'est exactement le cas d'usage principal du lot :
initialiser une variable là où il manque quelque chose, sans écraser des
valeurs déjà saisies.

1. **Cibles filtrées** : partir de la liste actuelle (`Object.entries(membership)`)
   et n'y garder que les entretiens où `matrice` ne porte pas de valeur pour
   `idVar` (côté renderer, purement local — la matrice est déjà requêtée ;
   penser au cas locuteur : v1 = portée entretien uniquement, comme le lot).
2. **Exclusion des verrouillés 🔒** : retrancher aussi ceux dont le badge
   `badgeVerrou(id)` est non nul (corpus distant) — ils seraient de toute
   façon refusés nommément ; les exclure en amont rend le compteur
   « Appliquer à N entretiens » honnête. En corpus local : aucun verrou,
   rien à exclure. **Fait : filtre désactivé par défaut (parité avec le
   comportement historique), exclus affichés grisés avec raison, bouton
   désactivé à zéro cible.**
3. **Compteur + liste** : le titre devient « Appliquer à N entretien(s) sans
   valeur (M ignorés : valeur présente ou 🔒) » — M déplié dans la liste,
   grisés avec raison, pour que l'exclusion reste transparente (parité avec
   l'esprit « informatif, jamais caché » du plan précédent §8).
4. **Sémantique inchangée** : la décision reste celle du serveur au moment de
   l'exécution (un entretien peut se faire verrouiller entre le filtre et le
   clic) — le filtre est une AIDE AU CIBLAGE, pas une garantie ; le récap
   nominatif reste la vérité.
5. Tests : extension du scénario 3 e2e (un entretien avec valeur, un sans,
   un tenu par autrui → le lot filtré ne touche que le sans-valeur libre) +
   test contrat léger si un paramètre de filtrage descendait côté main
   (v1 : NON — filtrage 100 % renderer, zéro protocole).
