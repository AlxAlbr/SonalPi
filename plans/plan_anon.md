# Plan anonymisation — SonalAsynchro

> Portage du travail d'anonymisation de SonalPi ([modules/Anonymisation](../../SonalPi/modules/Anonymisation/),
> guide de référence [anon.md](../../SonalPi/modules/Anonymisation/anon.md)) vers le modèle objet
> SonalAsynchro ([MODELE_OBJET.md](MODELE_OBJET.md)). Démarche par étapes : d'abord l'**entretien**
> (onglet dédié, texte + locuteurs), puis le **corpus**.

---

## 1. Ce que fait le module SonalPi (synthèse fonctionnelle)

Remplacer des **entités** (noms, lieux…) par des **pseudos**, à deux niveaux :

### 1.1 Niveau entretien (`edition_entretien.html`, table `tabAnon`)

- **Table de règles** `{entite, remplacement, remplacementAlt?, portee}` : saisie, validation,
  compteurs par ligne (anonymisé / exception / à traiter), navigation occurrence par occurrence.
- **Application au texte** : marquage DOM (`debsel`/`finsel`/`.anon` + `data-pseudo`) ; le DOM marqué
  **est** la persistance. « À anonymiser » = occurrence du texte de l'entité sans aucun marquage.
- **Exception** : occurrence volontairement laissée en clair (run `.anon-exception`) — décision
  mémorisée, l'occurrence ne repasse jamais « à traiter » toute seule.
- **Portée** (slider 🚧/📄/📁) : `brouillon` (règle saisie, non appliquée, persistée), `document`
  (appliquée, confinée à l'entretien), `corpus` (appliquée ET partagée au corpus).
- **Locuteurs** : pseudonymisation des **étiquettes de prise de parole**, axe séparé du texte —
  états confirmé / suggéré (dérivé du corpus) / refusé, rendu « Nom̶ [Pseudo] ».
- **Import table de correspondance** (JSON `[{entite_init, entite_pseudo}]`) avec moteur de conflits.
- **Exports anonymisés** : document (txt/word/srt/html), `.sonal` anonymisé (runs remplacés
  définitivement par `[pseudo]`), extraits de synthèse et recueils, CSV base de données.

### 1.2 Niveau corpus (`index.html`, panneau « Pseudos »)

- **Gestion de règles partagées** `entité → pseudo`, sans toucher au texte (aucun entretien ouvert).
- **Scan corpus** : parcourt les entretiens, compte où chaque règle s'applique, badges par état
  (appliqué / à traiter / exception), drill-down par entretien avec contexte.
- **Reconstitution** : le corpus est *dérivé* de l'union des entretiens (l'ancien global d'abord,
  divergences signalées par dialogue, rien de tranché en silence).
- **Application en masse** depuis la vue corpus (validation d'occurrences cochées).
- **Import/export** table de correspondance corpus, export corpus réouvrable anonymisé.

### 1.3 Catalogue des cas gérés (à couvrir dans le portage)

| Cas | Comportement SonalPi | Référence anon.md |
|---|---|---|
| **Multi-alias** (`Lyon/Lyons → ville`) | une entité = un groupe d'alias ; la règle « un alias = un pseudo » s'applique **par alias** (`clesAlias`, `regleEnCollisionAlias`) ; la fusion éclate les groupes et garde les alias libres (« Lyon→ville » + « Lyons→métropole » plutôt que perdre un alias) | anon-regles.js §clés |
| **Multi-pseudo** (`Lyon → ville/cité`) | ≤ 2 pseudos : `remplacement` (primaire, jamais vide) + `remplacementAlt` ; choix **par occurrence** ; création explicite seulement (saisie `a/b` ou dialogue « garder les deux ») ; défaut = primaire, ne réécrit jamais une occurrence déjà traitée ; compteurs scindés par variante ; interdit `/` des deux côtés à la fois (I2) | §9 |
| **Occurrences incluses** (`Marie→Lucie` ⊂ `Sainte Marie de la mer→ville`) | « le large absorbe l'étroit » : l'occurrence interne devient **incluse** — anonymisée de fait sous la règle large, passive pour la règle étroite (hors compteurs, non navigable, exception interdite) ; au retrait de l'englobante, restauration avec la variante mémorisée (`data-pseudo-absorbe`) | §10 |
| **Exception** | occurrence en clair mémorisée ; une exception interne à un run posé est absorbée (pas d'exception *dans* une entité plus grande) | §2, §10 |
| **Portée** | brouillon ⇒ 0 occurrence, ignoré par la détection auto (I-POR-4) ; document ne fuit jamais au corpus (I-POR-2) ; on ne quitte `corpus` que si la règle est isolée (aucun autre entretien ne la traite, I-POR-5) | §11 |
| **Déduplication insensible à la casse** | « Paris » ≡ « paris », clés canoniques `cleAnon`/`cleEntite` | §3.3 |
| **Ponctuation** | ponctuation **interne** stricte (bloque un match multi-mots) ; ponctuation **de bord** rognée (« Lyon. » ≡ « Lyon ») | §7 |
| **Pseudos de locuteurs** | axe séparé, états confirmé/suggéré/refusé, suggestion depuis le corpus, matérialise la règle (une règle peut être `document` à 0 occurrence de **texte**) | §12 |
| **Édition de pseudo en place** | renommage 1↔1 sans démarquage → les choix par occurrence sont préservés | §9 |
| **Collision de pseudos** | deux entités peuvent partager un pseudo → l'appariement des occurrences est structurel, jamais « par pseudo » | §2 |

---

## 2. Ce que le modèle SonalAsynchro change (et simplifie)

Le portage n'est **pas** une transposition du code : une grande partie de la complexité de SonalPi
vient de contraintes qui n'existent plus ici.

| Complexité SonalPi | Cause | En SonalAsynchro |
|---|---|---|
| `matchPositions` (cache), `data-anon-nt`, scan « stale », re-dérivation permanente depuis le DOM | le DOM marqué est la seule persistance | **« à anonymiser » est une REQUÊTE, jamais stockée** : `règles ∩ texte − (anonymisé ∪ exception)` — déjà implémentée en pur dans POC2 [anonymisation.ts](../../POC2/src/renderer/model/anonymisation.ts). Rien à invalider, rien qui se périme. |
| Réindexation après édition, appariement `debsel`→`finsel` structurel | spans plats, pas de positions | les décisions (anonymisé/exception) sont des **`Annotation{type:'anon', from, to}`** remappées par [remap.ts](../src/renderer/editor/remap.ts) à chaque transaction — acquis POC3, zéro réindexation |
| Deux `tabHtml` (main figé vs renderer), pertes d'anon de session | caches HTML dupliqués | un seul écrivain par fichier (verrou), commandes de domaine → n'existe pas |
| `window.tabAnon` vs `tabAnon` nu, ordre de chargement, antislashs | scope global par fenêtre, pas de modules | modules TS, imports explicites — n'existe pas |
| Marqueurs `loc-anon`/`data-locpseudo` sur les `.ligloc` du DOM | le locuteur n'existe que comme étiquette DOM | `Locuteur` est un **objet du modèle** ([locuteurs.ts](../src/shared/entretien/locuteurs.ts)) : le pseudo devient un champ, le rendu (gutter) suit par référence |
| Reconstitution du global + conflits fantômes | corpus = union recalculée des `.sonal` | `corpus.json` est **autoritaire** pour les règles de portée corpus (agrégat propre) ; le scan devient une requête de lecture du dossier |

**Ce qui est déjà en place** (rien à créer, seulement à activer) :
- `Annotation.type = 'anon'` avec `pseudo`, `etat: 'anonymise'|'exception'`, `regle?` (id) —
  [annotation.ts](../src/shared/entretien/annotation.ts) ; l'import `.sonal` produit déjà ces
  annotations depuis les spans `.anon`/`.anon-exception`, et l'export les re-sérialise
  ([importSonal.ts](../src/renderer/import/importSonal.ts), [exportSonal.ts](../src/renderer/import/exportSonal.ts)).
- `corpus.json.reglesAnon` existe (pass-through, sans UI — D4) — [format.ts](../src/shared/format.ts).
- Le moteur pur POC2 : `matcherRegles` (multi-alias natif : `entite: string[]`, frontières de mot
  Unicode → la ponctuation de bord est traitée par construction), résolution de chevauchement
  « la plus longue gagne » (= le principe des incluses), `aAnonymiser`.
- Le bloc legacy `tabAnon` du `.sonal` est transporté tel quel (`legacy.tabAnon`) — c'est la matière
  première de la migration des règles.

---

## 3. Modèle de données cible

### 3.1 `RegleAnon` (nouvelle entité, règle n°3 : identité opaque)

```jsonc
{
  "id": "…",                    // opaque ; déterministe à l'import .sonal si possible (sas idempotent)
  "entite": ["Lyon", "Lyons"],  // alias — invariant : jamais de "/" résiduel, le split est fait à la saisie
  "pseudos": ["ville"],         // 1 ou 2 ; pseudos[0] = primaire (jamais vide) — reprend remplacement/remplacementAlt
  "portee": "brouillon" | "document" | "corpus",
  "actif": true
}
```

- **Où vit la règle** (incarnation de la portée dans le régime fichiers) :
  - `portee: 'brouillon' | 'document'` → tableau `reglesAnon` **dans `entretiens/<id>.json`**
    (nouveau champ, additif) ;
  - `portee: 'corpus'` → `corpus.json.reglesAnon` (le champ existe déjà). La règle corpus est
    **une**, les entretiens la référencent par id — I-POR-2 (« document ne fuit pas ») devient
    structurel : une règle locale n'est physiquement pas dans `corpus.json`, plus de chokepoints
    à surveiller.
- **Invariants repris** : I2 (jamais alias multiples ET pseudos multiples sur la même règle),
  I5 (`pseudos[0]` jamais vide), cap ≤ 2 pseudos (parité `.sonal`), clés canoniques insensibles
  à la casse au niveau **alias** (reprendre la logique de `clesAlias`/`regleEnCollisionAlias`,
  réécrite en TS pur + tests).

### 3.2 `Annotation` anon (évolution douce du type existant)

- `regle: string` (id) devient la référence normale ; `pseudo` reste porté par l'annotation comme
  **choix de variante par occurrence** (multi-pseudo) — c'est déjà le champ existant, on précise
  sa sémantique : *pseudo effectivement appliqué à cette occurrence* (doit ∈ `regle.pseudos`,
  sinon référence pendante → inerte, conservée, signalée — règle n°3).
- `etat: 'anonymise' | 'exception'` inchangé.
- **Annotation orpheline** (`estOrpheline`) couvre déjà le cas « le texte de l'occurrence a été
  supprimé ».

### 3.3 `Locuteur` (pseudonymisation des étiquettes)

```ts
interface Locuteur {
  // … existant …
  pseudo?: string          // pseudo appliqué à l'étiquette
  pseudoEtat?: 'confirme' | 'refuse'   // absent = rien ; « suggéré » = REQUÊTE, jamais stocké
}
```

- « Suggéré » (SonalPi : `loc-suggere`, runtime re-dérivé) devient une **requête** : un locuteur
  sans `pseudoEtat` dont le nom matche un alias d'une règle corpus est *suggérable* — calculé à
  l'affichage, rien à persister ni à resynchroniser. Seuls **confirmé** et **refusé** (les deux
  états persistés de SonalPi) sont stockés.
- Invariant repris de §12 : une règle est **matérialisée** (donc non-brouillon) si elle a ≥ 1
  annotation OU ≥ 1 locuteur confirmé — le test « appliquée » doit inclure les libellés.

### 3.4 Les incluses en régime annotations

Deux annotations anon **ne se chevauchent jamais à l'application** (garde à la pose). Le cas
incluse survient quand on applique une règle **large** par-dessus une occurrence déjà couverte :

- **Détection** : requête — un match de la règle étroite recouvert par une annotation d'une
  **autre** règle est `incluse` (ni « à traiter », ni compté « anonymisé » — comptage « règle
  unique, partout », §10).
- **Application d'un run large** : les annotations étroites internes sont **conservées mais
  masquées** (le rendu et l'export ne voient que la plus large — même principe que
  `matcherRegles` : la plus longue gagne). C'est la version modèle de `data-pseudo-absorbe` :
  au retrait de l'annotation large, l'étroite **réapparaît telle quelle**, variante comprise —
  la « restauration » de SonalPi devient gratuite, aucun attribut à consommer.
  - Réserve reprise de SonalPi : une **exception** étroite interne est masquée aussi (pas
    d'exception dans une entité plus grande) et revit au retrait.
- **UI** : incluse non navigable, pas d'action directe (le clic retombe sur la règle large) ;
  signalement discret sur le compteur (exposant + tooltip « plus N absorbée(s)… »), wording repris.

---

## 4. Étape 1 — anonymisation au niveau entretien (onglet dédié)

Objectif : un onglet « Anon » dans la colonne droite de [Entretien.vue](../src/renderer/components/Entretien.vue)
(à côté de Thèmes / Loc / Données / Journal), couvrant **texte + locuteurs**, portées
`brouillon`/`document` seulement (pas encore de corpus). Chaque sous-étape est livrable et testable.

### E1.1 — Moteur pur + modèle (sans UI)

- Créer `src/shared/entretien/anonymisation.ts` : reprendre le POC2 `anonymisation.ts`
  (matcherRegles / aAnonymiser / chevauche) et l'étendre :
  - classification complète d'une occurrence : `a-traiter | anonymise | exception | incluse`
    (avec la variante de pseudo pour les annotations existantes) ;
  - adaptateur **texte ↔ positions PM** : concaténation des textes de blocs avec table de
    correspondance offsets → positions (s'appuyer sur l'existant de
    [requetes.ts](../src/shared/corpus/requetes.ts) §longueurs de blocs) ;
  - clés canoniques niveau alias (portage TS de `clesAlias`, `cleEntite`, `regleEnCollisionAlias`,
    `parsePseudos`, `analyserChampsEntitePseudo` — validation I2/I5 à la saisie).
- `RegleAnon` dans [format.ts](../src/shared/format.ts) + champ `reglesAnon: RegleAnon[]` (additif)
  dans `EntretienFichier`/`PayloadEntretien`. Champ optionnel → pas de bump de `formatVersion`
  (un lecteur v2 l'ignore sans danger) ; à confirmer.
- **Tests vitest** (headless, aucun DOM — critère POC3) : tous les cas du §1.3 — multi-alias,
  multi-pseudo, incluses (les deux ordres d'application convergent), exceptions, casse,
  ponctuation de bord, collision de pseudos entre entités.

### E1.2 — Onglet « Anon » : table des règles

- Table calquée sur la sémantique SonalPi : entité(s), pseudo(s) (saisie `a/b` parsée), compteurs
  **par variante** (anonymisé / exception / à traiter — tous dérivés par requête), typo de ligne
  (fond = statut, italique = brouillon).
- Portées `brouillon`/`document` (slider réduit à 2 crans pour l'instant — le cran 📁 arrive en
  Étape 2 ; prévoir le composant pour 3).
- Brouillon : persisté, jamais détecté automatiquement (I-POR-4) ; **loupe** = repérage non
  destructif (compte + surlignage transitoire + navigation, sans annotation posée).
- Validation de ligne : dédup insensible à la casse au niveau alias ; conflit d'alias → dialogue
  (pas de fusion silencieuse — principe « rien de tranché en silence »).

### E1.3 — Application, navigation, actions par occurrence

- **Appliquer** une règle = commande de domaine : poser une `Annotation(anon)` par occurrence
  « à traiter » avec `pseudo = pseudos[0]` (défaut primaire, I6 : ne réécrit jamais une occurrence
  déjà anonymisée ou en exception) ; gestion des incluses selon §3.4.
- **Menu par occurrence** (clic sur une occurrence dans l'éditeur) : anonymiser comme
  primaire / alt, marquer exception, retirer, naviguer ◄ i/N ►. Refus d'agir sur une incluse.
- **Rendu** : décorations depuis le modèle ([decorations.ts](../src/renderer/editor/decorations.ts),
  déjà branché sur `type:'anon'`) — enrichir : afficher le **pseudo** (style SonalPi « texte
  remplacé »), distinguer exception, et décorer les « à anonymiser » (requête) en attente.
  Commencer par surlignage + pseudo en tooltip ; le mode « aperçu anonymisé » (pseudo à la place
  du texte) peut venir ensuite.
- **Édition de pseudo en place** : renommage 1↔1 → réécrire `annotation.pseudo` (l'équivalent de
  `relabelPseudoEnPlace`, mais trivial ici : c'est un map sur les annotations de la règle) ;
  retrait d'un alt → occurrences de l'alt rebasculées sur le primaire ; ≥ 2 changements → dialogue.

### E1.4 — Locuteurs

- Champ `pseudo`/`pseudoEtat` sur `Locuteur` (§3.3) ; à la validation d'une règle dont un alias
  matche un nom de locuteur → dialogue « pseudonymiser aussi l'étiquette ? » (miroir de
  `proposerPseudoLocuteur`). Couvre le locuteur non cité dans le texte (règle matérialisée par le
  seul libellé).
- Rendu dans la **gutter** ([locuteursGutter.ts](../src/renderer/editor/locuteursGutter.ts)) et
  l'onglet Loc : « Nom̶ [Pseudo] » (nom barré + pseudo) — en CSS/Vue, plus besoin du hack U+0336.
- Actions : confirmer / refuser / retirer (sur l'objet Locuteur — la resynchronisation DOM de
  SonalPi disparaît, le rendu suit le modèle).

### E1.5 — Round-trip `.sonal`

- **Import** : modéliser `legacy.tabAnon` → `RegleAnon[]` (portée `document` par défaut — le
  `.sonal` ne porte pas la portée) ; relier les annotations anon importées à leur règle par
  matching entité/pseudo ; ids déterministes si le legacy en fournit (sas idempotent, MODELE_OBJET §4).
  Les marqueurs locuteurs (`loc-anon`/`data-locpseudo`/`loc-suggere-refuse` sur les `.ligloc`)
  → `Locuteur.pseudo`/`pseudoEtat`.
- **Export** : re-sérialiser `anon-json` (forme tabAnon attendue par SonalPi : `remplacement`/
  `remplacementAlt`), `data-pseudo` sur les spans (déjà fait), marqueurs locuteurs sur les `.ligloc`.
  Retirer `tabAnon` du pass-through legacy une fois le round-trip vérifié (e2e : importer un
  `.sonal` anonymisé de SonalPi → exporter → rouvrir dans SonalPi sans perte).

**Critère de fin d'Étape 1** : un entretien importé de SonalPi avec anonymisation (texte +
locuteurs + multi-pseudo + incluses) s'affiche fidèlement, s'édite (le remapping préserve les
annotations), s'enrichit de nouvelles règles, et repart vers SonalPi sans perte.

## 5. Étape 2 — anonymisation au niveau corpus

Prérequis : Étape 1 stable. Le corpus SonalAsynchro étant un agrégat propre (pas une union
recalculée), cette étape est nettement plus petite que son équivalent SonalPi.

### E2.1 — Règles de portée corpus

- Typer `corpus.json.reglesAnon` en `Record<id, RegleAnon>` (le champ existe) ; 3ᵉ cran du slider.
- **Transitions de portée** : document → corpus = déplacer la règle vers `corpus.json` (les
  annotations, qui référencent par id, ne bougent pas) ; corpus → document seulement si la règle
  est **isolée** (I-POR-5 : aucun autre entretien n'a d'annotation ou de locuteur confirmé la
  référençant — requête sur le dossier). Même garde sur la suppression.
- **Réconciliation à l'ouverture d'un entretien** (I-POR-3) : divergence entre une règle locale et
  une règle corpus partageant un alias → dialogue (aligner / garder les deux → bascule corpus,
  multi-pseudo par la porte explicite (b) du §9 SonalPi).

### E2.2 — Panneau « Pseudos » dans [Corpus.vue](../src/renderer/components/Corpus.vue)

- Table des règles corpus (affichage combiné `a/b`, entités longues tronquées + titre complet).
- **Scan = requête** : lire les `entretiens/*.json` du dossier, classer les occurrences par
  entretien (le moteur E1.1 est pur → réutilisé tel quel). Pas de cache à invalider ; mémoïsation
  volatile admise (règle n°3). Badges par état, scindés par variante ; statut des libellés de
  locuteurs (vert/orange tout-ou-rien, priorité au texte).
- **Drill-down** par entretien avec contexte (l'adaptateur texte du moteur fournit avant/après) ;
  multi-pseudo en **lecture seule** côté corpus (confinement §9 : l'application par occurrence
  reste au niveau entretien).
- **Application en masse** (valider des occurrences cochées sur des entretiens fermés) : commande
  qui ouvre l'entretien sous verrou, pose les annotations, sauve — l'atomicité fichier remplace
  toute la plomberie `setHtml`/`majFichierSonal`.

### E2.3 — Import/export

- **Table de correspondance** (JSON `[{entite_init, entite_pseudo}]`) : import avec moteur de
  conflits (portage de la sémantique `fusionnerRegles`/`conflitsPseudoParEntite` : dédup par
  alias, alias libres conservés, divergences signalées) ; export = une entrée par variante
  réellement appliquée, incluses exclues.
- **Exports anonymisés** (document texte, corpus) : s'appuyer sur `nomDeLocuteur` + pseudo et sur
  les annotations — chaque export existant gagne une option « pseudonymiser ». Périmètre exact à
  fixer quand les exports SonalAsynchro seront eux-mêmes définis (dépendance externe à ce plan).

## 6. Hors périmètre (assumé, pour mémoire)

- **NER / suggestion automatique d'entités** : comme SonalPi, seules les entités déjà saisies
  sont détectées.
- **Fuites documentées non couvertes par SonalPi non plus** : notes libres, noms de fichiers,
  contenu des modalités (anon.md §12, « hors périmètre assumé »).
- **Bascule Yjs** : les règles suivront le traitement standard (id opaque déjà prévu) ; les
  annotations anon sont déjà dans la famille couverte par la couture RelativePosition
  (MODELE_OBJET §6).

## 7. Points à trancher (avant ou pendant E1.1)

1. **`formatVersion`** : champ `reglesAnon` additif sans bump (recommandé) ou v3 explicite ?
2. **Cap multi-pseudo** : garder ≤ 2 (parité stricte `.sonal`/SonalPi, recommandé) ou généraliser
   `pseudos: string[]` avec cap logiciel ?
3. **Matching** : le moteur POC2 (frontières de mot Unicode sur texte plat) diffère du matcher
   token-par-token de SonalPi sur la ponctuation **interne** (SonalPi : « bloque un match
   multi-mots »). Vérifier sur cas réels si l'écart est acceptable, sinon durcir le regex —
   à trancher par un test comparatif dans E1.1.
4. **Aperçu anonymisé** dans l'éditeur (pseudo remplaçant visuellement le texte) : décoration
   widget + masquage, ou simple mode lecture ? Peut rester après E1.3.
