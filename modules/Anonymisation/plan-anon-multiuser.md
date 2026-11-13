# Plan — Anonymisation multi-utilisateur (corpus partagés)

> **État : note de conception (rien d'implémenté).** Objectif : gérer proprement les **corpus
> partagés** (distant / GitLab) côté anonymisation, quand **plusieurs utilisateurs** travaillent en
> même temps. Deux briques : (1) **afficher un cadenas 🔒** sur les entretiens **verrouillés** (édités
> par un autre utilisateur) dans la **vue détail d'occurrences** du panneau corpus ; (2) définir la
> **politique d'accès** quand un fichier n'est pas accessible (avertir + accord → repli sur le cache).

---

## 1. Contexte & problème

Sur un corpus **distant/GitLab**, chaque entretien est un fichier partagé. SonalPi pose un **verrou
LFS** quand un utilisateur l'édite (cf. [gitlab_api.js](../gitlab_api.js) — `verrouillerFichier`,
`isEntretienLocked`). Aujourd'hui :

- le **panneau corpus** (drill-down d'une entité → occurrences par entretien) lit le **cache mémoire**
  `tabHtml` (chargé à l'ouverture du corpus) via `getHtml(i)` — il ne reflète donc pas forcément
  l'état réel si un autre utilisateur a modifié l'entretien depuis ;
- la vue détail **n'affiche aucun verrou** : on peut consulter les occurrences d'un entretien
  actuellement **édité par quelqu'un d'autre** sans le savoir, sur des données potentiellement
  **périmées** ;
- les verrous ne sont vérifiés **que** sur les chemins d'**édition** (ouverture entretien, édition de
  cellule), avec un dialogue bloquant.

> ⚠️ **Ne pas confondre deux « verrous » homonymes.**
> - **🔒 verrou d'anonymisation** (déjà existant, [tutoriel](../../CorpusTuto/tutoriel.md) §2.1) : une
>   **règle corpus** est utilisée dans un autre entretien → on ne peut pas la rétrograder. Concept
>   *métier*, intra-corpus.
> - **🔒 verrou multi-utilisateur** (CE plan) : un **entretien (fichier)** est **édité par un autre
>   utilisateur**. Concept *concurrentiel*, inter-utilisateurs.
>
> Il faudra une **icône / sémantique distincte** (ex. 🔒 + nom d'utilisateur, ou un glyphe différent
> comme 👤🔒) pour ne pas les amalgamer visuellement.

---

## 2. État actuel (ce sur quoi s'appuyer)

| Brique | Où | Comportement |
|---|---|---|
| Verrou entretien | `isEntretienLocked(rk)` → `{locked, user}` ([preload.js:183](../../preload.js#L183)) ; LFS Locks ([gitlab_api.js](../gitlab_api.js) `verrouillerFichier`/`deverrouillerFichier`) | renvoie qui édite |
| Check à l'ouverture | [gestion_entretiens.js:606](../gestion_entretiens.js#L606) | si verrouillé → dialogue bloquant, refuse d'ouvrir ; sinon recharge la version distante |
| Check à l'édition cellule | [gestion_data.js:1377](../gestion_data.js#L1377) | si verrouillé → dialogue + restaure la valeur (lecture seule) |
| Lecture HTML | `getHtml(rk)` → cache `tabHtml` ([main.js:32](../../main.js#L32), chargé [main.js:193](../../main.js#L193)) | **cache**, pas de relecture fichier par accès |
| Vue détail occurrences | [`afficherOccurrencesEnAccordeon`](tableau_global.js#L173) → `trouverOccurrencesAvecContexte` → `getHtml` | lit le cache ; **aucune** conscience des verrous |
| Type de corpus | `getCorpus().type` ∈ `local` / `distant` / `gitlab` | la logique verrou ne concerne que `distant`/`gitlab` |

---

## 3. Brique A — Cadenas 🔒 par entretien dans la vue détail

**But** : dans le drill-down d'une entité (accordéon « occurrences par entretien »), signaler les
entretiens **verrouillés par un autre utilisateur**, avec le nom de l'éditeur.

**Point d'intégration** : la boucle qui crée un accordéon par entretien dans
[`afficherOccurrencesEnAccordeon`](tableau_global.js#L173) (et `creerAccordeonEntretien`). Pour chaque
`ent` :
- appeler `isEntretienLocked(ent.index)` (uniquement si `getCorpus().type` ∈ {distant, gitlab}) ;
- si `locked` : afficher un **badge 🔒** à côté du nom de l'entretien + **infobulle** « Édité par
  {user} — données possiblement non à jour » ;
- sinon : rien (ou un état « à jour » discret).

**Considérations**
- **Perf** : N entretiens = N appels `isEntretienLocked`. Prévoir un **batch** (un seul appel
  renvoyant la map `{rk → lock}`) ou une **mise en cache courte** des statuts de verrou, rafraîchie à
  l'ouverture du drill-down (les LFS locks n'expirent pas → pas de timer, juste invalidation au refresh).
- **Lecture seule assumée** : le cadenas est **informatif** ; il n'empêche pas de *lire* les
  occurrences (on lit le cache de toute façon), il **prévient** que la source peut avoir changé.
- **Cohérence d'icône** : choisir un visuel qui ne collise pas avec le 🔒 d'anonymisation (cf. §1).

---

## 4. Brique B — Politique d'accès « fichier inaccessible → cache »

**Question d'origine** : si le fichier n'est pas accessible, va-t-on chercher dans le cache **après**
un message d'avertissement demandant l'accord de l'utilisateur ? → **Aujourd'hui : non** (on lit le
cache silencieusement). À **définir** :

**Politique proposée**
1. Quand une opération corpus a besoin du contenu d'un entretien (drill-down, scan corpus, export) et
   que la **version fichier** n'est **pas accessible** (verrouillé en écriture par un autre, hors-ligne,
   erreur réseau) :
   - tenter d'obtenir la version à jour ; en cas d'échec →
   - **avertir** l'utilisateur (« Impossible de relire l'entretien X (édité par {user} / hors-ligne).
     Continuer sur la **dernière version en cache** (possiblement périmée) ? ») ;
   - sur **accord** → utiliser le cache `tabHtml`, en marquant la donnée **« cache / non vérifié »**
     dans l'UI (cf. cadenas / mention) ;
   - sur **refus** → annuler l'opération pour cet entretien.
2. Distinguer **lecture** (tolérante : cache OK avec avertissement) et **écriture/anonymisation
   corpus** (stricte : interdite sur un entretien verrouillé, comme déjà fait à l'édition).

> Décision à acter : pour la **lecture seule** (drill-down), un avertissement **une fois** par session/
> entretien suffit-il, ou à chaque accès ? (Éviter le harcèlement de pop-ups.)

---

## 5. Sémantique & garde-fous à trancher

- **Anonymisation corpus touchant un entretien verrouillé** : une règle corpus appliquée globalement
  (`appliquerAnonymisationGlobale`, export réouvrable) écrit dans les entretiens. Sur un entretien
  **verrouillé par autrui**, il faut **refuser/différer** l'écriture (ne pas corrompre la version de
  l'autre) — réutiliser le check `isEntretienLocked` côté écriture, comme à l'édition.
- **Fraîcheur du cache** : à l'ouverture du drill-down, faut-il **recharger** les entretiens non
  verrouillés depuis le serveur (comme le fait l'ouverture d'entretien, [gestion_entretiens.js:617](../gestion_entretiens.js#L617) `loadHtml`) pour limiter le périmé ? Compromis perf/fraîcheur.
- **Mon propre verrou** : ne pas afficher 🔒 « par un autre » si c'est **moi** qui édite (LFS expose
  `lockedBy` / `estMonVerrou`, cf. [gitlab_api.js:473](../gitlab_api.js#L473)).

---

## 6. Découpage proposé (phases)

1. **MVP lecture** : cadenas 🔒 + infobulle « édité par {user} » dans l'accordéon corpus (Brique A),
   avec un check `isEntretienLocked` batché. Purement informatif.
2. **Politique cache** : avertissement + accord avant repli cache quand la relecture échoue (Brique B),
   + mention « cache / non vérifié » dans l'UI.
3. **Écriture sûre** : refus d'anonymisation corpus sur entretien verrouillé (garde-fou §5).
4. **Fraîcheur** (option) : refresh des verrous + rechargement des entretiens à l'ouverture du
   drill-down.

---

## 7. Autres adaptations identifiées (au-delà de la lecture)

Le plan initial (Briques A/B) traite la **lecture** (cadenas, cache). Mais l'anonymisation a un **état
partagé** plus large que les fichiers entretien : le **jeu de règles corpus**. Adaptations à prévoir.

### 7.1 Le jeu de règles corpus partagé — risque RÉÉVALUÉ (bien moindre que craint)

> **Correction d'une analyse initiale erronée.** Le jeu de règles corpus n'est **pas** un fichier
> partagé écrasable en « last-write-wins ». La **source de vérité** = les `tabAnon` **des entretiens**
> (protégés par les verrous fichier) ; le `tabAnon` global est une **vue reconstruite par UNION** via
> [`reconstituerTabAnonGlobal`](anon-scan.js#L25) + [`fusionnerRegles`](anon-regles.js#L292).

**Garde-fous existants qui limitent fortement le risque :**
- **Reconstruction par union, non destructive.** `fusionnerRegles` prend l'ancien global **en premier
  (autoritaire)** ; les entretiens ne peuvent qu'**ajouter** des entités. Deux users ajoutant des
  entités **différentes** dans leurs entretiens (verrouillés) respectifs → l'union garde **les deux**.
  Pas d'écrasement.
- **Suppression d'une règle partagée bloquée.** [`regleEstIsolee(entite)`](tableau_base.js#L1129)
  parcourt **tous** les entretiens : une règle corpus n'est supprimable que si **aucun autre** ne la
  **traite réellement** (anonymisée/exception). Sinon elle survit → pas de fuite chez l'autre.
- **Conflits signalés, pas perdus.** `conflitsPseudoParEntite` remonte les entités à pseudos divergents
  (le pseudo du corpus est conservé) → signalés via `signalerConflitsPseudo`.
- **Multi-pseudo « garder les deux »** : merge intra-session quand on voit le pseudo existant.

**Risques RÉSIDUELS (réels mais étroits, à traiter dans le plan) :**
- **Pseudo divergent pour la MÊME entité — uniquement dans la fenêtre STRICTEMENT concurrente.**
  - **Cas séquentiel (déjà géré, RAS).** Si le 2ᵉ user a une vue à jour (corpus ouvert/rechargé APRÈS
    que le 1ᵉʳ a fait remonter sa règle), sa saisie de « la métropole » déclenche
    [`resoudreConflitCorpus`](tableau_base.js#L1826) → dialogue interactif **« garder les deux / aligner »**.
    Aucun code multi-user nécessaire.
  - **Cas simultané (le seul résidu).** Pas de **propagation live** : `getAnon()`/`getEnt()` = snapshot
    de l'ouverture. Si A pousse « Lyon → [grande ville] » et que B saisit « la métropole » **avant
    d'avoir rechargé**, B ne voit pas la règle de A → **aucun dialogue**. La divergence ne ressort qu'au
    **rechargement** suivant, et via [`signalerConflitsPseudo`](anon-scan.js#L68) qui est **purement
    informatif** (« une entité = un pseudo, celui du corpus est conservé ») — `fusionnerRegles` a déjà
    tranché (un gagne, l'autre « ignoré »). **Ce n'est PAS** le « garder les deux » interactif.
  - **À améliorer (au choix)** : (a) **réduire la fenêtre** — re-check serveur des règles **avant** de
    poser une règle corpus (ramène au dialogue « garder les deux ») ; (b) **rendre le report interactif**
    — que `signalerConflitsPseudo` propose « garder les deux » sur les divergences détectées au reload.
- **Garde-fou de suppression sur `tabEnt` potentiellement périmé.** `regleEstIsolee` lit le `tabEnt`
  **chargé** ; si un autre user vient de commencer à utiliser la règle (pas encore re-synchronisé chez
  moi), je pourrais la croire isolée. Atténuation native : la reconstitution par union la **ressuscite**
  dès qu'il sauve → incohérence **transitoire**, pas définitive.
- **Cap multi-pseudo (≤2) en concurrence** : deux `alt` divergents ajoutés en parallèle → à réconcilier.

> **Bilan** : l'architecture (source = entretiens verrouillés + union + `regleEstIsolee` + signalement)
> rend l'écrasement **destructeur** improbable. Le vrai reste-à-faire ici est la **réconciliation des
> pseudos divergents inter-session** (aujourd'hui : un gagne + conflit signalé en différé), pas un
> verrou anti-écrasement.

### 7.2 Garanties inter-utilisateurs

- **« Tout vert » n'est pas inter-user.** Le scan corpus lit le **cache** ; un autre user peut avoir
  des occurrences non appliquées → l'export « sûr » ne l'est **pas réellement**. → fraîcheur + statut,
  voire **verrou d'export** (snapshot cohérent).
- **Export pendant édition concurrente.** L'export réouvrable/HTML écrit dans **tous** les entretiens
  ([`exporterCorpusReouvrable`](tableau_global.js)) → garde-fou écriture (§5) **+** cohérence du
  snapshot (que faire des entretiens verrouillés au moment de l'export ?).

### 7.3 Infra verrous & identité

- **Verrou du jeu de règles** : les locks actuels sont **per-fichier entretien** ; le store de règles
  n'est **pas** une ressource verrouillable → en ajouter une (ou la porter par le fichier corpus).
- **Stale locks** : les LFS locks **n'expirent pas** ([gitlab_api.js:10](../gitlab_api.js#L10)) → un
  crash en tenant un verrou bloque les autres. → UX « qui tient / forcer le déverrouillage ».
- **Identité / audit** : tracer **qui** a créé/modifié quelle règle (utile pour réconcilier, et pour
  l'affichage « édité par {user} » déjà prévu en Brique A).

### 7.4 Étendre la politique cache (Brique B) au-delà du drill-down

La politique « relecture échouée → avertir + accord → cache » (§4) doit aussi couvrir le **scan
corpus** ([anon-scan.js](anon-scan.js)) et l'**export** — partout où une opération corpus lit
`getHtml(i)` sur des entretiens possiblement périmés.

> 🎯 **Priorité (révisée).** Le jeu de règles est **mieux protégé que craint** (union + `regleEstIsolee`
> + signalement — §7.1) : pas d'écrasement destructeur à craindre en priorité. Les vrais points
> ouverts, par ordre d'impact : (1) **réconciliation des pseudos divergents inter-session** (§7.1,
> détection différée → à rendre explicite) ; (2) **garanties inter-user à l'export** (§7.2, « tout vert »
> basé sur le cache) ; (3) le **cadenas** (Brique A) et la **politique cache** (Brique B), surtout
> informatifs/UX.

---

## 8. Questions ouvertes (à trancher avant rédaction détaillée)

- [ ] **Icône** du verrou multi-utilisateur (vs 🔒 anonymisation) : 🔒+nom ? 👤 ? couleur ?
- [ ] **Batch vs unitaire** pour `isEntretienLocked` (existe-t-il déjà un endpoint « tous les
      verrous » ? sinon, en ajouter un).
- [ ] **Fréquence d'avertissement** cache (une fois/session vs par accès).
- [ ] **Lecture** sur entretien verrouillé : tolérée (cache + avertissement) — confirmé ?
- [ ] **Rechargement** au drill-down : on garde le cache (rapide) ou on rafraîchit (frais) ?
