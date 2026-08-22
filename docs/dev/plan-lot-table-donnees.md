# Plan — Saisie des valeurs en corpus distant : bouton par ligne + lot par colonne

Statut : **RÉALISÉ** (phases 1 à 5 — voir `docs/dev/multi-utilisateur.md` § « Écriture de
valeurs sans session » ; scénario e2e n° 3 dans `e2e/multi-utilisateur.e2e.ts`).
Périmètre visé : `src/renderer/components/TableDonnees.vue`, `src/main/distant/transactions.ts`,
`src/main/index.ts` (IPC), `src/renderer/composables/{sonal,useCorpus}.ts`, e2e + tests contrat.

## 1. Problème

En corpus distant, la Table de données est **consultable mais jamais éditable** :
la garde `CorpusStore.verifierEcritureEntretien` exige de tenir le verrou de
l'entretien visé (`ecrituresAutorisees`), or entrer dans la table ferme toute
session d'écriture — donc **aucune** cellule n'est éditable, même sans verrou
concurrent. De plus, écrire la valeur d'un entretien non ouvert poserait un
problème de publication non résolu (`noterSale` ne fait rien sans session :
l'écriture locale ne partirait jamais et serait écrasée au pull suivant).

Rendre chaque cellule éditable demanderait un mécanisme verrou+publication par
saisie, glissant côté UX (courses avec l'ouverture d'un entretien) et côté
protocole (beaucoup de petits cycles réseau).

## 2. Décision proposée

Deux gestes complémentaires, alignés sur ce que veut faire l'utilisateur :

### A. Par LIGNE — bouton « Saisir… » → onglet Donnée de l'entretien

Un petit bouton sur la ligne de l'entretien ouvre CET entretien directement sur
son **onglet Donnée** (écran Entretien). Le verrou existant reprend tout son sens :
- entretien libre → le verrou nous est accordé à l'ouverture, saisie permise ;
- entretien ouvert ailleurs → ouverture en **lecture seule** avec bandeau 🔒
  nominatif (comportement existant), les champs de l'onglet sont grisés.

Aucune nouvelle règle de protocole : on réutilise exactement le cycle
`ouvrirEntretien` (acquisition §4.1) + saisie + publication finale §4.4.

### B. Par COLONNE — modification en lot des entretiens non ouverts

Un bouton dans l'en-tête de chaque colonne (variables de portée **entretien**)
ouvre une modale « Modifier en lot » : choisir UNE valeur, l'appliquer à tous
les entretiens **non ouverts**. Exécution séquentielle rapide, **un verrou
entretien court par entretien** (acquérir → GET frais → PUT If-Match → libérer,
le motif §4.7 appliqué au fichier entretien). Tout échec ponctuel (entretien
ouvert entre-temps par autrui, divergence 412, réseau) est **signalé
nommément** dans un récapitulatif, sans bloquer les autres entretiens du lot.

### Hors périmètre v1 (décisions explicites)

- **Portée locuteur** : pas de lot v1 (les locuteurs diffèrent d'un entretien à
  l'autre ; il faudrait choisir « quel locuteur » par entretien). Le bouton
  ligne couvre ce besoin au cas par cas.
- Les cellules restent non éditables en distant (pas de saisie cellule par
  cellule) — c'est le contournement volontaire de la complexité initiale.
- Pas de « vider la valeur » en v1 (poser `—` = valeur vide suffira si trivial ;
  sinon report).

## 3. Phase 1 — Bouton ligne « Saisir… » (renderer seul, petit)

1. `sonal.ts` : nouvelle fonction
   ```ts
   async function allerSaisieDonnees(id: string) {
     await ouvrirEntretien(id)            // verrou acquis OU lecture seule 🔒
     if (ent.ouvertId.value === id) ent.ongletDroite.value = 'donnees'
   }
   ```
   (aucun changement main : `corpus:lireEntretien` fait déjà tout le travail)
2. `TableDonnees.vue` : dans la cellule ligne-ent, bouton `.aller-saisie`
   (« Saisir… »), visible hors lecture seule, tooltip « Ouvrir cet entretien
   sur l'onglet Donnée ». Placé après les badges 🔒/👁.
3. En corpus local : même geste (l'ouverture marche pareil, garde absente).
4. Tests : extension d'`e2e/table-donnees.e2e.ts` — cliquer le bouton arrive
   sur `.panneau.donnees` avec l'éditeur monté ; retour Corpus fonctionne.

## 4. Phase 2 — Lot côté MAIN (le cœur protocolaire)

Nouvelle méthode `TransactionsCorpus.poserValeurLot(lot)` — le lot ne touche
**pas** corpus.json (pas de verrou corpus) : un cycle par ENTRETIEN.

1. **Regrouper** les items par `entretienId` (un seul verrou/aller-retour par
   entretien même si plusieurs valeurs demandées — v1 : 1 variable, donc 1 item).
2. **Cas « session à nous »** : si `sessions` tient déjà l'id (impossible depuis
   la table aujourd'hui, mais défense en profondeur), écrire via le chemin
   existant (`store.poserValeur` garde levée + `noterSale`) — pas de verrou.
3. **Cas général**, par entretien, séquentiellement :
   - `providerPourEntretien().acquerir(cheminVerrouEntretien(id))` (variante A
     files_lock ou B conditionnelle, §8 — réutiliser les helpers privés de
     `supprimerEntretien`) ; refus → échec `« id » ouvert par X`, continuer ;
   - GET frais de `entretiens/<id>.json` (+ ETag observé, motif `etatEtag`) ;
   - mutation pure locale via `corpusModel.poserValeur(data, cible, idVar, idMod)`
     + `lastModified` (parité `store.poserValeur`, sans toucher au membership) ;
   - PUT **If-Match** ; 412 → échec « divergence », continuer (pas de retry v1) ;
   - écrire le MÊME contenu dans le fichier du MIROIR local (écriture atomique,
     même utilitaire que le store) → la matrice est fraîche sans pull complet ;
   - `liberer` en `finally` (toujours, y compris sur échec).
4. **Retour IPC** : `{ succes: string[]; echecs: Array<{ id: string; raison: string }> }`.
5. **Corpus local** : branche simple — boucle `store.poserValeur` directe
   (garde inexistante), mêmes résultats.
6. IPC handler `corpus:poserValeurLot` + exposition preload (idiome existant).

Tests contrat (`test/webdav/transactions.test.ts` + store) :
- lot de 2 libres → 2 succès, fichiers serveur ET miroir à jour, verrous libérés ;
- un tenu par autrui → échec nominatif, l'autre réussit quand même ;
- divergence 412 simulée → échec, miroir NON modifié pour cet item ;
- verrou toujours libéré sur échec (assertion serveur).

## 5. Phase 3 — Modale lot côté RENDERER

1. Nouveau composant `LotVariable.vue` (idiome `EditionVariables` : voile +
   modale), ouvert depuis un bouton `.lot-var` du `<th>` (uniquement variables
   de portée `entretien`, uniquement si `!lectureSeule`).
2. Contenu : libellé de la variable, choix de la valeur (select modalités +
   « autre… » comme les cellules), liste des entretiens ciblés AVEC leurs
   badges 🔒/👁 actuels (**informatif** : la décision reste au moment de
   l'exécution), compteur « Appliquer à N entretiens ».
3. À l'exécution : bouton occupé pendant l'appel ; puis **récapitulatif dans la
   modale** (« n entretien(s) modifié(s) » / liste des échecs avec raison
   nominative) ; fermeture → `rafraichirMatrice()`.
4. Erreur globale (réseau) → bannière standard `erreurs.ts`.

## 6. Phase 4 — Scénario visible à deux postes (scénario 3)

Dans `multi-utilisateur.e2e.ts`, même mécanique narration/DEMO_PAUSE_MS :

1. `amorcer()` crée un SECOND entretien (`ID2`) pour avoir deux lignes cibles.
2. Max ouvre `ID` (verrou). Olivier ouvre la base de données : colonne présente.
3. Olivier lance le LOT sur « Ville » → récap attendu : `ID2` modifié, `ID`
   refusé (« ouvert par max »). Vérifications SERVEUR : `ID2.valeursGen` = 1
   valeur, `ID.valeursGen` vide, verrou `ID` toujours tenu par max.
4. Max referme ; Olivier utilise le BOUTON LIGNE de `ID` → atterrit sur
   l'onglet Donnée, saisit « Lyon », referme (publication finale §4.4).
5. Serveur : `ID.valeursGen` = 1 valeur. La table montre tout après Actualiser.
6. Narration démo à chaque étape (bandeaux), vérrouillage/skip pile absente
   identiques aux scénarios 1–2.

## 7. Phase 5 — Documentation

- `docs/user/multi-utilisateur.md` : les deux gestes, sémantique du refus
  (« ouvert entre-temps »), portée entretien seulement en lot.
- `docs/dev/multi-utilisateur.md` : section « écriture de valeurs sans session »
  (verrou court par entretien, miroir écrit-through, pas de membership).
- Mettre à jour l'en-tête du test e2e et ce plan (statut → réalisé).

## 8. Points de vigilance

| Point | Décision |
|---|---|
| Verrou global au lot | REFUSÉ : verrou PAR entretien, jamais global (un lot long ne doit pas geler le corpus) |
| Battement/TTL | Inutile : verrou tenu quelques centaines de ms par entretien |
| Divergence 412 | Échec signalé, pas de retry auto (v1) — l'utilisateur relance le lot |
| Entretien ouvert CHEZ NOUS | Chemin session existant (garde + noterSale), jamais d'auto-concurrence |
| Cohérence miroir | Écriture through (même contenu serveur + miroir) → matrice fraîche, pull suivant no-op |
| Presence 👁 | Jamais décisionnelle : le lot peut modifier un entretien seulement consulté |
| Taille du lot | Séquentiel suffit (WebDAV local ~10 ms/op) ; parallélisme inutile et risqué |

## 9. Ordre d'exécution & estimation

1 → 5 dans l'ordre (chaque phase laisse l'app cohérente et testée) :
Phase 1 petite (renderer seul) · Phase 2 moyenne (protocole + tests contrat) ·
Phase 3 moyenne (UI) · Phase 4 petite-moyenne (e2e) · Phase 5 petite.

## 10. Et après ? — l'enchaînement naturel vers la saisie par cellule

> Réalisé : voir `plan-saisie-cellule-table.md` (statut RÉALISÉ — décisions
> produit tranchées : le lot ⇊ est conservé ; Entrée = valide + descend la
> colonne).

Le lot n'est pas un cul-de-sac : il construit le primitif qui rendra la saisie
par cellule facile. La progression se fait en trois étapes cumulatives :

| Étape | Geste utilisateur | Ce qui existe après |
|---|---|---|
| 1 (phase 1) | par LIGNE — « Saisir… » ouvre l'onglet Donnée de l'entretien | cycle verrou existant (§4.1/§4.4), zéro protocole nouveau |
| 2 (phases 2–3) | par COLONNE — lot sur les entretiens non ouverts | **le primitif transactionnel** : verrou court par entretien → GET frais → PUT If-Match → libérer, avec rapport d'échecs nominatif |
| 3 (ultérieure) | par CELLULE — édition directe dans la table | réutilise le primitif de l'étape 2 avec UN item ; reste à faire : activer les cellules des lignes sans badge 🔒 et soigner le refus en ligne (cellule inchangée + raison) |

Pourquoi c'est peu coûteux une fois l'étape 2 faite :

- **~80 % du travail est commun** : la difficulté réelle n'a jamais été
  « enregistrer une valeur » mais « publier proprement sans session ouverte »
  (verrou A/B, divergence 412, cohérence miroir) — c'est exactement le
  primitif de la phase 2, appelé ici avec N items, là avec 1 ;
- le déclencheur change seulement : blur/change d'une cellule au lieu du
  bouton « Appliquer » ;
- les saisies rapprochées se sérialisent naturellement (même barrière que
  celle imposée aux transactions rapprochées, observée en e2e).

Le choix lot-vs-cellule est donc avant tout un choix PRODUIT (geste adapté à
l'usage : corriger une cellule vs traiter une variable entière), pas un choix
de complexité : les deux partagent le même socle protocolaire.
