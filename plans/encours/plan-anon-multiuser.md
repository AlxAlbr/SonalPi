# Anonymisation × multi-utilisateur (plan-anon-multiuser)

> **Avancement** : M1 ✅ et M2 ✅ implémentés et validés (2026-02).
> M1 — garde d'unicité (`creerRegle` défensive + `regleAnonCreer` →
> `{ regle, existait }`), cran 🌐 grisé hors ligne, scénario deux postes
> contre les piles A ET B réelles
> (`test/webdav/scenario-promotion-concurrente.test.ts`).
> M2 — lot de masse sous verrou court par entretien
> (`TransactionsCorpus.appliquerRegleLot` + `appliquerRegleLotLocal`, IPC
> `corpus:appliquerRegleAnonLot` remplaçant le handler mono), badge 🔒
> nominal + checkbox désactivée dans le drill-down, bouton grisé hors ligne,
> compteurs ajustés sans re-scan (`ajusterScanApresApplication`), scénario
> deux postes « échec nommé puis coexistence » sur piles A ET B réelles
> (`test/webdav/scenario-anon-masse.test.ts`).

> Resserrement des deux coutures entre l'anonymisation **dans son état actuel**
> (fin de [plan_anon_suite_ok.md](plan_anon_suite_ok.md) : table, brouillons,
> slider 3 crans, règles corpus + scan + application en masse) et la couche
> multi-utilisateur E0→E4 (verrous, sessions, transactions, voir
> [plan-multiuser.md](plan-multiuser.md)).
>
> Les évolutions fonctionnelles de l'anonymisation (multi-alias, incluses,
> paramètres, refonte du panneau Pseudos…) restent dans
> [plan_anon_fin.md](plan_anon_fin.md) — HORS périmètre ici. Ce plan ne fait que
> rendre les gestes anonymisation existants corrects quand le corpus est DISTANT.
>
> Deux constats motivent le plan (audit 2026-02) :
>
> 1. **La promotion brouillon/fichier → corpus fonctionne** en distant (flux B
>    transaction pour la règle + flux A autosave pour le reliage des
>    occurrences), MAIS la création de règle n'est pas défensive : deux postes
>    peuvent fabriquer un DOUBLON de règle pour la même entité (§M1).
> 2. **L'application en masse est cassée en distant** : le handler ne passe ni
>    par les transactions ni par les verrous — il lève la garde globale
>    `lectureSeule`, et même levée, il écrirait le miroir sans verrou, sans
>    If-Match et sans publication serveur (divergence silencieuse garantie).
>    Le panneau base de données a déjà résolu le problème identique avec
>    `poserValeurLot` : on réutilise EXACTEMENT ce motif (§M2).

---

## 0. Périmètre

### On fait (2 mouvements, dans l'ordre)

1. **M1 — Promotion → corpus sécurisée en distant** : garde d'unicité
   entité→règle DANS la transaction (réutilisation, jamais de doublon) ;
   cran 🌐 du slider grisé hors ligne (politique α §4.6.1 du plan multiuser,
   écrite mais non implémentée côté UI).
2. **M2 — Application en masse sous verrou** : le panneau Pseudos du corpus
   applique une règle sur des entretiens fermés via des transactions courtes
   PAR ENTRETIEN (verrou → GET frais → PUT If-Match → libérer), badges 🔒
   nominaux sur les entretiens tenus par autrui (checkbox désactivée),
   bilan succès/échecs nommés, compteurs ajustés localement SANS re-scan.

### On laisse de côté (différé)

- Toute nouvelle fonctionnalité d'anonymisation → [plan_anon_fin.md](plan_anon_fin.md).
- Réparation de doublons de règles préexistants dans un corpus : la garde M1
  empêche les NOUVEAUX doublons ; aucun doublon n'est possible aujourd'hui en
  mono-poste, donc pas de ramasse-miettes.
- Tolérance du scan aux doublons (état devenu impossible après M1).
- Réglages des cadences (hors périmètre depuis E4).

---

## M1 — Promotion brouillon/fichier → corpus sécurisée en distant

### 1.1 Le trou actuel

`promouvoirCorpus` (useEntretien.ts) vérifie l'absence de règle AVANT la
transaction, sur le MIROIR (données du dernier pull). La transaction
`regleAnonCreer` fait certes un GET frais… mais `creerRegle`
(shared/corpus/reglesAnon.ts) n'y cherche PAS l'entité : elle crée
aveuglément. Fenêtre de course = « tout le temps depuis le dernier pull »,
pas une course de millisecondes :

> Max pousse « Hôpital Sainte-Anne » (règle `reg_aaa`). Olivier, qui n'a pas
> re-tiré depuis, pousse la même entité depuis un autre entretien : sa
> transaction VOIT `reg_aaa` dans le GET frais mais crée quand même
> `reg_bbb`. Deux règles pour la même entité → `trouverRegleParEntite`
> arbitraire, scan double-compteur, masse concurrente, réconciliation qui
> n'en finit pas de diverger.

Le multi-pseudo (« garder les deux », cap ≤ 2 pseudos) avait été conçu pour
la défensivité : il donne le chemin de sortie une fois la règle existante
DÉTECTÉE. Il manque seulement la détection au bon endroit.

### 1.2 Garde d'unicité dans la transaction

- `creerRegle(corpus, entite, pseudos, genId)` devient défensive : si
  `trouverRegleParEntite(corpus, entite)` trouve une règle dans les données
  fraîches, elle la RENVOIE au lieu d'en créer (aucune mutation). PURE,
  testable headless.
- `store.regleAnonCreer` (corpusStore.ts) renvoie désormais
  `{ regle, existait }` — `existait = true` quand la garde a répondu.
- `promouvoirCorpus` (useEntretien.ts) traite `existait = true` exactement
  comme son chemin « règle trouvée avant coup » actuel : pseudos identiques
  → `appliquerCorpus` direct ; sinon → dialogue `dialoguePorteeCorpus`
  (Aligner / Garder les deux), inchangé.
- `regleAnonAjouterPseudo` est déjà défensive (doublon casse-insensible,
  cap ≤ 2) : aucun changement.

### 1.3 Cran 🌐 grisé hors ligne (politique α)

Dans Entretien.vue, le cran corpus du slider porte déjà `:disabled="roContenu ||
l.etat === 'corpus'"` ; `lectureSeule` (le computed global « distant ET hors
ligne » de sonal.ts) est déjà déstructuré dans le composant. Ajouter simplement
`|| lectureSeule` + tooltip « nécessite une connexion au corpus partagé ».
Le clic résiduel (course entre grisage et panne) échoue proprement via
l'ErreurTransaction « Serveur injoignable » de la transaction — pas de corruption.

### 1.4 Tests

- Headless (règles pures) : `creerRegle` sur corpus contenant déjà l'entité →
  renvoie l'existante, `reglesAnon` inchangé ; casse-insensible sur alias.
- Scénario deux postes (banc embarqué puis piles Docker A ET B) : max publie
  une promotion ; olivier, SANS pull intermédiaire, promeut la même entité →
  UNE SEULE règle côté serveur ; pseudos divergents → dialogue Aligner /
  Garder les deux proposé à olivier, les deux issues laissent une règle unique.

---

## M2 — Application en masse sous verrou (panneau Pseudos du corpus)

### 2.1 Le trou actuel

`appliquerMasse` (Corpus.vue) → IPC `corpus:appliquerRegleAnon` →
`store.appliquerRegleAnon` : seule la garde GLOBALE `verifierEcriture()`
protège l'écriture. En distant, `lectureSeule = true` en permanence → chaque
clic lève « Corpus distant ouvert en lecture seule… ». Et même levée, la
fonction écrirait le fichier MIROIR directement : sans verrou entretien
(l'entretien peut être ouvert chez olivier), sans If-Match, sans publication
serveur, sans mise à jour du manifeste — nos annotations locales seraient
écrasées silencieusement au prochain pull qui ramène un changement serveur.
L'UI, elle, n'est jamais grisée (checkboxes désactivées uniquement si « rien
à traiter »).

### 2.2 Transaction par entretien — même motif que le lot de valeurs

Nouvelle méthode `TransactionsCorpus.appliquerRegleLot(cibles)` où
`cibles = [{ entretienId, regleId }]` :

- Regroupement par entretien, exécution séquentielle, UN cycle par fichier :
  verrou court (providerPourEntretien / cheminVerrouEntretien, variante A ou B
  mesurée à l'ouverture) → GET frais de `entretiens/<id>.json` DU SERVEUR →
  `instructionsAppliquerRegle(data, regle, genId)` (PURE, déjà prête) →
  push des annotations (`auteur: 'corpus'`, pseudo primaire) → PUT If-Match →
  écriture THROUGH du miroir + `noterEtagPublie` → libérer TOUJOURS en `finally`.
- Refus de verrou → échec NOMMÉ (« X est ouvert par Y »), sans bloquer les
  autres entretiens du lot. Divergence 412, réseau → échec nommé aussi
  (miroir non modifié). Zéro retry v1, parité poserValeurLot.
- Défense en profondeur : entretien OUVERT chez nous (session tenue) →
  chemin store existant (`appliquerRegleAnon` avec garde levée +
  `noterSale`), comme `poserValeurLot` le fait déjà via `getSessions`.
- Résultat : `ResultatLotAnon { succes: [{ id, nb, titre }], echecs: [{ id,
  raison }] }`.

Côté LOCAL (aucune couche distante) : conserver la boucle store actuelle,
enveloppée dans le MÊME format de résultat — l'UI consomme une seule forme.

IPC : nouveau handler `corpus:appliquerRegleAnonLot(ids: string[], regleId)`
qui choisit local/distant ; l'appel Corpus.vue remplace la boucle JS actuelle
(une seule requête IPC pour toute la sélection).

### 2.3 UI du drill-down (option tranchée : « a » — ne pas tenter)

- Badge 🔒 nominal sur chaque ligne d'entretien du drill-down (façon
  TableDonnées) : `🔒 {userId}` + tooltip « verrou tenu par X — application
  impossible tant que cette session tient ». Checkbox désactivée si
  `e.non === 0 || !!badgeVerrou(e.id)`.
- Bouton « Appliquer en masse » : désactivé si rien de coché OU hors ligne
  (`lectureSeule`, tooltip « nécessite une connexion au corpus partagé »).
- Bilan après exécution : message succès total (« ✓ N occurrence(s) dans M
  entretien(s) ») + échecs nommés listés. Les badges 🔒 restent visibles :
  un échec « ouvert par X » s'explique de lui-même.

### 2.4 Compteurs ajustés localement, SANS re-scan (choix produit)

Les écritures passant par GET frais + THROUGH, les fichiers locaux sont à jour
après le lot : un re-scan complet est superflu. À la place, une fonction PURE
`ajusterScanApresApplication(scan, succes)` (shared/corpus/scanAnon.ts) qui,
pour chaque succès `{ id, nb }`, met à jour `parEntretien[id]`
(`non -= nb`, `anon += nb`) et les totaux de la règle. Testable headless.
Edge assumé : si un GET frais a révélé des changements serveur pendant le lot,
les compteurs affichés peuvent différer légèrement de la vérité jusqu'au
prochain pull — cohérent avec la philosophie « le pull est la synchro ».

### 2.5 Tests

- Headless : `ajusterScanApresApplication` (succès multiples, id absent du
  scan, nb supérieur au compteur → borné à 0).
- Banc WebDAV embarqué : masse heureuse multi-fichiers (contenus serveur
  vérifiés, manifeste à jour → le tirage suivant est no-op) ; refus nominatif
  (verrou tenu par olivier → échec nommé, AUTRES entretiens réussis) ;
  divergence 412 injectée ; hors ligne (échec net, miroir intact) ;
  entretien ouvert chez nous (chemin défense, publication suit la session).
- Scénario deux postes (piles A ET B) : olivier tient le verrou d'un
  entretien, max applique la règle sur trois entretiens → deux succès,
  un échec nommé ; olivier publie ensuite → ses annotations coexistent avec
  celles posées par la masse (jamais d'écrasement).

---

## Ordre et validation finale

| Mouvement | Contenu | Dépend de |
|---|---|---|
| M1 | Garde d'unicité + cran 🌐 hors ligne | — (petit, d'abord) |
| M2 | Lot de masse sous verrou + UI drill-down + compteurs | — |

Chaque mouvement : typecheck propre, suite headless verte, scénarios banc
embarqué verts, puis validation contre les DEUX piles Docker (variante A pour
le verrou entretien contre pile A, variante B contre pile B) conformément à la
règle posée dans plan-multiuser.md. Les tests Docker partagent l'état serveur :
respecter `fileParallelism: false`.
