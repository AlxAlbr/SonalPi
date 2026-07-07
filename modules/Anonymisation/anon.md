# Module Anonymisation — guide du module

> Synthèse de référence pour travailler sur l'anonymisation (pseudonymisation) de SonalPi.
> Sources : lecture du code + [todo.md](../../todo.md) / [todo2.md](../../todo2.md) /
> [todosynth.md](../../todosynth.md). À tenir à jour quand l'architecture bouge.

---

## 1. À quoi sert ce module

Remplacer des **entités** (noms, lieux…) par des **pseudos** dans les entretiens, à deux
niveaux :

- **Entretien** (`edition_entretien.html`, un entretien ouvert) : on **applique** des règles
  au texte → on marque le DOM (`debsel`/`finsel`/`anon`) et on affiche le pseudo.
- **Corpus** (`index.html`, panneau « Pseudos ») : on **gère des règles** (`entité → pseudo`)
  partagées par tous les entretiens, **sans toucher au texte** (aucun entretien ouvert). Un
  scan parcourt les entretiens pour compter où chaque règle s'applique.

---

## 2. Principe directeur : le DOM est la source de vérité

Le marquage DOM déjà présent est **suffisant et auto-descriptif**. On ne pose **pas**
d'identifiant d'occurrence (idée écartée, cf. todo.md « Écarté »).

Convention de marquage (produite par `cleanHTML` qui rend une structure **plate par
segment**, un span par mot) :

```html
<span class="debsel anon" data-pseudo="P">C</span><span class="anon">'</span>…<span class="finsel anon" data-pseudo="P">questionnaires</span>
```

- **Une occurrence anonymisée** = un **run contigu** de spans `.anon`, du `debsel.anon` au
  **premier** `finsel.anon` rencontré (appariement **structurel**, pas par pseudo — sinon
  collision quand 2 entités partagent un pseudo).
- Le **pseudo se lit** sur `data-pseudo` du `debsel`/`finsel`.
- **Exception** (= afficher l'original, ne pas remplacer) = run `.anon-exception`.
- **À traiter** = occurrence du texte de l'entité dont **aucun** span n'est
  `.anon`/`.anon-exception`.
- ⚠️ `debsel`/`finsel` existent **aussi sans** `.anon` (sélection souris, thématisation —
  cf. segmentation.js, thematisation.js) → **toujours filtrer sur `.anon`**.

`matchPositions` n'est qu'un **cache** d'indices de spans, re-dérivable du DOM.

---

## 3. Le modèle de données (et ses pièges)

### 3.1 `tabAnon` : DEUX variables homonymes ⚠️ piège récurrent

| Variable | Déclaration | Rôle |
|---|---|---|
| `tabAnon` **nu** | `let tabAnon` ([gestion_corpus.js:19](../gestion_corpus.js#L19)) | binding lexical global ; **N'EST PAS** sur `window`. Reliquat, source de bugs. |
| `window.tabAnon` | [tableau_base.js:96](tableau_base.js#L96) | **array ACTIF de l'entretien** : ce que la table affiche et ce que l'application DOM lit. |

Un `let` top-level **ne crée pas** de propriété `window`. Dans un fichier autre que
gestion_corpus.js, écrire `tabAnon = …` réassigne le **nu**, pas l'actif → l'affichage et
`appliquerAnonymisationPour` (qui lisent `window.tabAnon`) ne voient rien.

**Règle : côté entretien, toujours `window.tabAnon`.** Ce bug a été corrigé sur le chemin
d'import entretien (todo2 Étape 1) **puis** sur la restauration `.sonal`
(`importerAnonSonal`/`reappliquerAnonymisationsSonal`, [anon-import_export.js:260-352](anon-import_export.js#L260))
— 4 références alignées sur `window.tabAnon` (todosynth point B, ⏳ reste test manuel).

### 3.2 Forme d'une paire (runtime, entretien)

```js
{ entite, remplacement /*=pseudo PRIMAIRE*/, remplacementAlt /*=2e pseudo, optionnel*/,
  occurrences, indexCourant, matchPositions,
  portee /*='brouillon'|'document'|'corpus' ; undefined ≡ 'corpus' (legacy). Voir §11*/,
  source /*'Global'|'Local'|…*/, existeLocalement /* champs runtime, non persistés au .crp */ }
```

`remplacement` est **toujours** un pseudo unique applicable tel quel (jamais vide, jamais
« a/b ») ; le 2ᵉ pseudo vit dans `remplacementAlt`. Voir §9 (multi-pseudo). `portee` est **entretien
seulement** (le `.crp` ne la stocke pas) — voir §11.

### 3.3 Persistance

- **Corpus `.crp`** = **uniquement des règles** `{entite, remplacement, remplacementAlt?}`. Point
  d'entrée **unique** d'écriture : `persisterReglesCorpus()` ([anon-regles.js](anon-regles.js)),
  qui normalise via `reglesCorpusPropres` (retire occurrences/matchPositions/source). **Ne jamais
  appeler `setAnon` en direct.**
- **Déduplication unifiée (insensible à la casse)** : clés canoniques dans anon-regles.js —
  `cleAnon(entite, remplacement)` (paire) et `cleEntite(entite)` (entité seule). `fusionnerTabAnon`
  (runtime) et `nettoyerTabAnon` utilisent `cleAnon`. → « Paris » et « paris » = **la même règle**.
- **Une entité = au plus DEUX pseudos (corpus AUTORITAIRE)** : la primitive
  `fusionnerRegles(...listes)` déduplique sur **`cleEntite`** (entité seule, 1ʳᵉ occurrence gagnante)
  → le corpus ne stocke jamais deux *règles* concurrentes pour une entité, mais une règle peut porter
  un 2ᵉ pseudo via `remplacementAlt` (cf. §9). `reglesCorpusPropres`/`synchroniserTabAnonGlobal`/
  `reconstituerTabAnonGlobal` en sont des enveloppes ; `reconstituer` passe l'**ancien global EN
  PREMIER** (son pseudo gagne) puis les entretiens, et **signale** les divergences
  (`conflitsPseudoParEntite` → dialogue, rien perdu en silence).
- **Entretien `.sonal`** (bloc `anon-json`) = `tabAnon` local avec occurrences +
  matchPositions (+ champs runtime, considérés gelés).
- **Pas de « fantômes » dans le `tabAnon` local** : une règle venue **uniquement** du corpus
  (`source:'Global'`, `!existeLocalement`, `occurrences===0`) est fusionnée à l'ouverture pour
  affichage mais **n'appartient pas** à l'entretien. Les **deux** chemins de sauvegarde l'excluent :
  ouverture (`gestion_entretiens.js`) et sauvegarde principale (`nettoyerTabAnon`). Garde-fou
  **`occurrences===0`** : une règle globale *réellement appliquée* (occ>0) est conservée. Sinon
  les fantômes s'accumulent et **ressuscitent** au corpus via `reconstituerTabAnonGlobal`.
- ⚠️ Architecture `.crp`/`.sonal` **figée** (décision utilisateur) : le `.crp` embarque
  `tabEnt` (copie de chaque entretien) et chaque `.sonal` reduplique son entretien. Tout
  item « modèle cible » qui toucherait à ça est **gelé**.

### 3.4 ⚠️ DEUX `tabHtml` (cache renderer figé vs main autoritaire) — piège de perte d'anon

Le HTML marqué **est** la persistance de l'anonymisation (§2). Or il existe **deux** copies du
cache HTML, et la même chose pour `tabGrph` :

| Copie | Où | Mise à jour par |
|---|---|---|
| `tabHtml` **main** (AUTORITAIRE) | [main.js](../../main.js) handler `set-html` | l'anonymisation, par index via `setHtml(i, html)` ([anon-apply.js](anon-apply.js)) |
| `tabHtml` **renderer** (global implicite) | `gestion_corpus.js` (`tabHtml = …`) | **seulement** `loadHtml` à l'ouverture du corpus |

L'anonymisation depuis la vue corpus écrit **uniquement dans le main** (`setHtml(i)`) + réécrit le
`.sonal` sur disque (`majFichierSonal`, qui relit `getHtml(i)`). Le global **renderer reste figé** à
l'état d'ouverture du corpus — il **ne voit pas** les anonymisations de la session.

- **Règle d'or** : avant tout `setHtml(null, …)` / `setGrph(null, …)` (remplacement complet du
  tableau), **repartir d'un `getHtml()` / `getGrph()` frais**, JAMAIS du global renderer. Sinon on
  réécrase le main avec un instantané périmé → **toutes les anon de la session sont perdues** sur les
  entretiens restants. (Bug historique : `retirerEnt` splicait le global renderer puis le repoussait
  via `setHtml(null,…)` → entités « anonymisées » repassées « à anonymiser » dans le texte ET le
  tableau. Corrigé [gestion_entretiens.js — retirerEnt](../gestion_entretiens.js#L1251) ; `triEntCorpus`
  fait déjà bien : `getHtml()` frais d'abord.)
- À la **réouverture** d'un entretien, le texte est lu depuis le **cache main** (`getHtml(rkEnt)`,
  [gestion_entretiens.js](../gestion_entretiens.js#L1346)), pas depuis le disque → un cache main
  corrompu s'affiche tel quel. Tant que le `.sonal` n'a pas été réécrit (depuis ce cache corrompu),
  **rouvrir le corpus** (`loadHtml` relit le disque) restaure tout : utile pour diagnostiquer/récupérer.
- Penser aussi à invalider le scan corpus (`window._anonScanStale = true`, `_anonIndexInverse = null`)
  quand le corpus change (ajout/suppression d'entretien) — sinon badges périmés.

---

## 4. Carte des fichiers

| Fichier | Lignes | Rôle | Chargé dans |
|---|---|---|---|
| `anon-detection.js` | ~330 | **Détection pure** : tokenisation (`motsCles`, `escapeRegex`, `construireRegexEntite`), index inversé, **`analyserOccurrences` (fonction unifiée)**, `trouverOccurrencesDansDoc` (adaptateur corpus) + `construireContexteFlux` (contexte depuis le flux de tokens), `trouverMatchesEntiteDOM`. Pas d'état. | **les deux** |
| `anon-regles.js` | ~330 | **Cœur des règles corpus** (rapatrié de gestion_corpus.js) : clés canoniques (`cleAnon`, `clesAlias`, `cleEntite`, `regleEnCollisionAlias`), fusion/déduplication (`fusionnerRegles`, `conflitsPseudoParEntite`), persistance (`reglesCorpusPropres`, `persisterReglesCorpus`, `synchroniserTabAnonGlobal`) **+ helpers multi-pseudo** (`pseudosDe`, `estMultiPseudo`, `parsePseudos`, `analyserChampsEntitePseudo`, `normaliserRegle`, `ajouterPseudoAltCorpus`). Pas d'état UI. Charger **après** anon-detection.js. | **les deux** |
| `anon-correspondance.js` | 281 | **Moteur de conflits partagé** (import table de correspondance JSON) : `traiterImportCorrespondances` paramétré par `ctx={reglesExistantes, appliquer}`. Découplé. | **les deux** |
| `anon-scan.js` | 282 | Scan corpus : `reconstituerTabAnonGlobal`, `lancerScanCorpus`, `appliquerResultatsScan`, `mettreAJourCacheEntite`. | index.html |
| `anon-apply.js` | 479 | **Mutation du HTML d'entretien** : `pseudonymiserEntretienSpecifique`, `retirer/marquer…Exception…`. | index.html |
| `anon-styles.js` | 230 | CSS-in-JS `ajouterStylesAnonGen` (style injecté une fois). | index.html |
| `anon-import_export.js` | 352 | Import table correspondance **entretien** (`importTableCorrespondance`, `appliquerImportCorrespondances`) + **restauration `.sonal`** (`importerAnonSonal`, `reappliquerAnonymisationsSonal`). | edition_entretien.html |
| `anon-export-document.js` | 570 | Export du **document final** (txt/word/srt/html). | edition_entretien.html |
| `anon-help.js` | 136 | Aide UI. | edition_entretien.html |
| `tableau_base.js` | 2258 | **Table entretien** : `fusionnerTabAnon`, `affichTableauAnon`, validation de lignes, actions appliquer/exception/retrait, navigation, `reindexerMatchPositions`. | **les deux** |
| `tableau_global.js` | 2472 | **Panneau corpus** (`affichAnonGen`) : table des règles, vérification/badges par entretien, import/export corpus, orchestrateur `validerOccurrencesSelectionnees`. | index.html |

---

## 5. Contrainte d'architecture : scope global PAR fenêtre

**Pas de modules ES.** Chaque fenêtre charge ses `<script>` en **scope global** : tout
binding top-level est visible par les fichiers chargés **après**, dans la **même** fenêtre.
Conséquences :

- Un code « partagé » doit être chargé **dans les deux** HTML.
- ⚠️ **`edition_entretien.html` utilise des chemins ANTISLASH** (`modules\Anonymisation\…`)
  — piège à ne **jamais** oublier en ajoutant/extrayant un script utilisé côté entretien.
- **Ordre de chargement** : un module après ses dépendances (`anon-detection.js` en premier,
  utilitaires `question`/`dialog`/`notifErreur` avant les appelants).
- Scinder un gros fichier ne crée **aucune frontière réelle** (tout reste appelable partout)
  → le split table/panneau a été **abandonné** (gain cosmétique vs coût/risque).

Ordre effectif :
- **index.html** : detection → regles → correspondance → scan → tableau_base → tableau_global → apply → styles.
- **edition_entretien.html** : detection → regles → tableau_base → gestion_entretiens → correspondance → import_export → export-document → help.

---

## 6. Flux principaux

- **Ouverture entretien** ([gestion_entretiens.js:1357-1388](../gestion_entretiens.js#L1357)) :
  `window.tabAnon = fusionnerTabAnon(getAnon(), ent.tabAnon)` → `initAnon()` →
  (après `cleanHTML`) `detecterOccurrencesToutesLesPaires()` → `affichTableauAnon()` →
  sauvegarde du local nettoyé (exclut les règles `source:'Global'` non encore locales).
- **Restauration `.sonal`** (≠ ci-dessus) : `openFich('.SONAL')` →
  `chargerHTMLSONAL` → au bloc `anon-json` → `importerAnonSonal(donnees)` →
  `reappliquerAnonymisationsSonal()` (rejoue le marquage depuis `matchPositions`). **Ne passe
  PAS par `fusionnerTabAnon`** — flux distinct. (C'est ici que vit le bug `tabAnon` nu, B.)
- **Scan corpus** : panneau Pseudos → `reconstituerTabAnonGlobal` → `lancerScanCorpus`
  (index inversé + `trouverOccurrencesDansDoc` sur chaque entretien) → badges/états par règle.
- **Scan entretien** (« 🔍 Scan anonymisation entretien », pendant local du scan corpus —
  [tableau_base.js](tableau_base.js)) : `verifierEntretien()` → `detecterOccurrencesToutesLesPaires()`
  + `affichTableauAnon()` (re-dérive depuis le DOM, source de vérité §2) → bilan consolidé via
  `compterAnonATraiterEntretien()` : total « à anonymiser » (somme des `nbNon` = `isNonTraite`, toutes
  règles locales **et** corpus présentes-non-appliquées) + rappel **non bloquant** des brouillons ayant
  des occurrences réelles (`compterOccurrencesEntite`, I-POR-4 : un brouillon n'est jamais « à
  anonymiser »). **Limite assumée** : ne couvre que les entités déjà repérées (pas de NER) — même
  limite que le scan corpus.
- **Import table de correspondance** (JSON `[{entite_init, entite_pseudo}]`) : moteur de
  conflits partagé `traiterImportCorrespondances` ; côté entretien `appliquer` marque le DOM,
  côté corpus `appliquerImportCorpus` pousse des règles + `persisterReglesCorpus`.

---

## 7. Détection : deux vues, critères alignés mais pas encore unifiés

Le cœur historique des bugs : **deux implémentations** de la détection qui peuvent
re-diverger.

- Entretien : `reindexerMatchPositions`/`trouverMatchesEntiteDOM`.
- Corpus : `trouverOccurrencesDansDoc`.

**✅ Unifié (todosynth point C, ⏳ test manuel).** Une seule fonction
`analyserOccurrences(racineDOM, entite, pseudo)` ([anon-detection.js](anon-detection.js)) fait la
détection + classification pour les deux vues. Principe : chercher le **texte de l'entité** sur un
**flux de tokens couvrant TOUS les spans** (les spans anonymisés gardent leur texte d'origine), puis
**classer chaque occurrence par son premier span** : `.anon-exception` → exception ; `.anon` +
`data-pseudo===pseudo` → anon ; autre pseudo → exclu ; sinon → à-traiter. Le flux est tokenisé comme
la segmentation (mots ET ponctuation, espaces retirés) et le match est **exact token-par-token** →
**même comportement strict que les anciens matchers** pour la ponctuation **interne** (la ponctuation
entre mots bloque un match multi-mots ; tirets/apostrophes exigés). En revanche la ponctuation **de
bord** de l'entité est **rognée** (`rognerPonctuationBords`) : « Lyon. » ≡ « Lyon », « ...Loire » ≡
« Loire » — l'entité est captée quelle que soit la ponctuation qui la termine ou la précède (appliqué
aussi à `trouverMatchesEntiteDOM` et `construireRegexEntite`, donc cohérent partout). Gère uniformément
DOM **normalisé** (un token/span) et
**compacté** (`data-len>1`, entretiens jamais ouverts). Attribution par le **texte** (pas le
pseudo) → tue la collision.
- Adaptateur entretien : `reindexerMatchPositions` → `{start,end,isException,isNonTraite}` +
  marquage `data-anon-nt` (garde l'état : mute `matchPositions`, touche `window.tabAnon`).
- Adaptateur corpus : `trouverOccurrencesDansDoc` → `{applique,exclue,contextAvant,contextApres,
  entite,spanId}` (contexte reconstruit par `analyserOccurrences`/`construireContexteFlux`
  depuis le flux de tokens — robuste aux spans multi-mots des entretiens jamais ouverts).
- `trouverMatchesEntiteDOM` (matcher de plages live) **reste** : utilisé par
  `appliquerAnonymisationPour` (application réelle du marquage) et `compterOccurrencesEntite`.

Note : le matching reproduit **volontairement** l'ancien comportement strict pour la ponctuation
**interne** (token-par-token). **Seule déviation assumée** : la ponctuation **de bord** de l'entité est
désormais ignorée (cf. `rognerPonctuationBords` ci-dessus) — « Lyon. » et « Lyon » deviennent
équivalents, dans les deux sens.

---

## 8. Pièges / points de vigilance (checklist)

- **`window.tabAnon` vs `tabAnon` nu** côté entretien (§3.1). Toujours l'actif `window.`.
- **Antislash** des chemins de scripts dans `edition_entretien.html` (§5).
- **Ordre de chargement** des scripts (§5).
- **Persistance corpus** uniquement via `persisterReglesCorpus` (§3.3), jamais `setAnon`.
- **`setHtml(null,…)`/`setGrph(null,…)`** : repartir d'un `getHtml()`/`getGrph()` **frais**, jamais
  du global renderer figé → sinon perte des anon de session (§3.4).
- Filtrer sur **`.anon`** (debsel/finsel existent sans, §2).
- Appariement `debsel`→`finsel` **structurel**, pas par pseudo (collisions, §2).
- Refacto : **petites extractions vérifiables**, jamais mélanger déplacement de code et
  changement de comportement dans un même commit.
- **Export anonymisé** (`anon-export-document.js`) : tout passe par `extraireTexteAnonymiseDepuisSpans`
  (lit le DOM marqué → multi-pseudo via `data-pseudo` du `finsel`, longs runs en un seul `[pseudo]`,
  incluses couvertes par le run large). `AnonymiserSegments()` (export `.Sonal` anonymisé via `chkAnon`)
  est désormais **implémentée** (remplace définitivement chaque run par `[pseudo]`, structure des
  segments préservée → réouvrable). `exportTxtAvecClasses` borne l'extraction **au segment** (sinon
  étiquettes de locuteur perdues).
- **Multi-pseudo** : ne jamais aplatir une occurrence portant un pseudo autorisé, ni laisser
  un `remplacementAlt` orphelin au nettoyage de spans (§9).

---

## 9. Pseudos multiples (« a/b »)

Une entité peut avoir **au plus 2** pseudos légitimes (ex. `Lyon → ville` ET `ville de l'Est`),
le pseudo réel étant choisi **par occurrence**. Dissout la divergence corpus/entretien au lieu de
forcer un gagnant. Helpers dans [anon-regles.js](anon-regles.js).

- **Modèle** : `remplacement` (primaire, toujours valide) + `remplacementAlt` (2ᵉ pseudo,
  optionnel). Cap **≤ 2**. `pseudosDe(regle)` → la liste, `estMultiPseudo(regle)` → bool.
  Tout le code lisant `remplacement` continue de marcher (rayon de souffle minimal).
- **Création EXPLICITE uniquement** (jamais d'auto-union silencieuse). Deux portes :
  - **(a)** saisie directe `a/b` dans un champ pseudo (entretien *ou* panneau Pseudos corpus) —
    parse via `parsePseudos`/`analyserChampsEntitePseudo` ;
  - **(b)** dialogue de conflit « **garder les deux** » (validation entretien, collision corpus,
    import) — pose l'alt via `ajouterPseudoAltCorpus`. **Sans propagation** cross-entretiens.
- **Confinement** : l'**application/édition par occurrence** se fait **uniquement au niveau
  entretien** (menu « Anonymiser comme → primaire / alt »). Côté **corpus**, le multi-pseudo est
  de la **donnée passive** : affichage combiné `a/b`, **vue lecture seule** (drill-down 🔍 →
  `verifierEtAfficherEtatMultiEntite`), **pas** d'application en masse.
- **Défaut = primaire, travail préservé** : créer/promouvoir une règle multi-pseudo ne ré-écrit
  **jamais** une occurrence déjà appliquée ou en exception ; seules les occurrences « à traiter »
  reçoivent le primaire (rebascule par occurrence ensuite).
- **Compteurs / badges scindés par variante** : entretien (`affichTableauAnon`, catégories
  `anon0`/`anon1`) et corpus (`anon-scan.js`, 2 appels `analyserOccurrences`). Export table de
  correspondance = une entrée par variante **réellement appliquée**.
- **Invariants clés** : I2 — jamais `/` simultané côté entité ET côté pseudo. I5 — `remplacement`
  n'est jamais vide ni « a/b ». I6 — création/promotion préserve appliquées + exceptions.
- **Édition d'un pseudo EN PLACE** : si SEUL le pseudo change (nom inchangé), `sauvAnon` (Cas 4)
  appelle `relabelPseudoEnPlace` qui **réécrit `data-pseudo`** des occurrences au lieu de tout
  démarquer → les **choix par occurrence sont préservés** (l'ancien démarquage les perdait). Mapping
  net uniquement : renommage 1↔1, retrait d'alt (→ primaire), ajout d'alt / swap (no-op) ; **≥2
  changements simultanés → démarquage** (fallback). Conflit corpus → **dialogue rejoué** via
  `resoudreConflitCorpus` (extrait de `validerLigneAnon`, partagé) ; « Annuler » restaure l'ancien
  pseudo. Réalignement sur l'ensemble **résolu** (peut différer du saisi si aligné corpus). Les
  occurrences **incluses** suivent via `data-pseudo-absorbe` remappé (cohérent avec la restauration §10).
  Note `resoudreConflitCorpus` : si la saisie **inclut déjà** le(s) pseudo(s) corpus et ajoute un alt
  (total ≤ 2, ex. corpus `ville` + saisie `ville/cité`), l'extension est **silencieuse** (intention non
  ambiguë) — pas de dialogue « aligner sur le corpus » qui jetait le nouvel alt.
- ⬜ **Reste** (cf. ex-plan, branche `PseudoGlobal`) : réconcilier le cas où le primaire **local**
  diffère du primaire **corpus** (clé `cleAnon` différente → risque de 2 lignes pour une entité).

---

## 10. Occurrences « incluses » (chevauchement de règles)

Deux règles qui se **chevauchent** sur le même texte (`Marie → Lucie` et
`Sainte Marie de la mer → ville`). Le DOM est **plat** (un run = `debsel … finsel`, appariement au
**premier** `finsel`) → deux runs imbriqués sont impossibles. Décision : **le large absorbe l'étroit**.
L'occurrence interne (« Marie » dans le run `ville`) devient **incluse** : anonymisée *de fait* sous la
règle large, mais **passive** pour la règle étroite. (Détail : ex-`plan-occurrences-incluses.md`.)

- **Détection** : `analyserOccurrences(racine, entite, pseudo, pseudosRegle)` — 1er span `.anon` avec
  un `data-pseudo` **étranger** à `pseudosRegle` → état `'incluse'` (≠ autre **variante** de la même
  règle, qui reste captée par son propre pseudo). `pseudosRegle` **doit** être fourni pour activer la
  détection (sinon ancien comportement : étranger → exclu). Flag remonté : `isIncluded` (entretien) /
  `incluse` (corpus).
- **Absorption** (`appliquerAnonymisationPour`, [tableau_base.js](tableau_base.js)) : à la pose d'un
  run, un match strictement **à l'intérieur** d'un run étranger plus large (`_runEtrangerEnglobe`)
  n'est **pas** marqué (il reste incluse) ; à l'inverse les marqueurs étrangers **internes** au
  nouveau run sont **absorbés**. Converge dans les **deux ordres** d'application. Après pose,
  `recompterReglesChevauchant` réindexe les règles chevauchantes (→ incluse) ; symétriquement au
  retrait/édition d'une englobante, elles **se libèrent** (re-bascule « à traiter »). Une **exception
  étrangère** interne (texte mis en clair) est elle aussi **absorbée** quand le run posé est anonymisé
  → l'occurrence devient incluse (pas d'exception possible *dans* une entité plus grande).
  ⚠️ Piège : `debsel`/`finsel` sont **partagés** entre la *sélection de texte* et les runs
  d'anonymisation ; un VRAI run porte toujours un `data-pseudo`. `appliquerAnonymisationPour` **purge**
  les `debsel`/`finsel` sans `data-pseudo` (marqueurs de sélection résiduels) avant de marquer, et
  `_runEtrangerEnglobe` n'accepte comme frontière de run qu'un `debsel`/`finsel` **avec** `data-pseudo`
  — sinon, sélectionner une entité à l'intérieur d'un run la marquait par-dessus (double étiquette).
- **Comptage = règle unique, partout** : l'incluse est **exclue** du compteur « Anonymisé » **et** de
  « à traiter » (`nbNon`), mono ET multi, entretien ET corpus. Une ligne entièrement absorbée reste
  **verte** (`nbNon === 0`). Cohérent entretien ↔ corpus (le `data-pseudo` étranger / `applique=false`
  l'exclut naturellement des compteurs *appliqués*).
- **Signalement** : pas de 4ᵉ badge. **Exposant discret** (`.badge-incl-mark`) sur le badge
  « Anonymisé » + **tooltip** « plus N absorbée(s) par « *entité absorbante* » (non comptée(s) ici) »
  (helper `entitesAbsorbantes`, remonte au `debsel` pour lire le pseudo). Wording « **plus N…
  non comptée** », jamais « dont ». ⚠️ Ligne **100 % absorbée** : `nbAnon=0` → aucun badge → ni
  exposant ni tooltip (cas-bord assumé). *(Côté corpus le tooltip reste générique, non nommé.)*
  - **Multi-pseudo — exposant sur la BONNE variante** : à l'absorption, la variante d'origine est
    mémorisée dans `data-pseudo-absorbe` (avant d'effacer `data-pseudo`) et remontée jusqu'au match
    (`pseudoAbsorbe`). Le split des badges pose l'exposant sur le badge de cette variante (et non plus
    systématiquement sur le primaire). Une variante est affichée dès qu'elle a des occurrences réelles
    **ou** des incluses → si son unique occurrence est absorbée, badge **« 0* »** (compteur 0 + exposant)
    au lieu d'un repli. Seules les incluses **sans variante connue** (Scénario B / périmée) se replient
    sur le 1ᵉʳ badge rendu.
  - **Partie 2 — restauration au retrait/édition de l'englobante** : `restaurerAbsorbeesDansPortee`
    (appelée en §G-bis à la place de l'ancien « re-bascule non-traité ») re-pose `anon`+`debsel`/`finsel`
    +pseudo sur les occurrences absorbées de la portée libérée. **Réalignement** : variante de
    `data-pseudo-absorbe` si elle existe **encore** dans la règle, sinon le **primaire courant**.
    L'attribut `data-pseudo-absorbe` est **consommé** (supprimé) à la restauration.
    Réserves : (a) une **exception** absorbée n'est pas restaurée comme exception (pas de mémo d'état
    d'exception — elle redevient « à traiter ») ; (b) **persistance `.sonal`** : `data-pseudo-absorbe`
    part dans le HTML, cohérent (les occurrences encore absorbées restent incluses, les restaurées ont
    déjà perdu l'attribut) — à confirmer au test.
- **Lecture seule** (I-INC) : incluse **non navigable** dans la catégorie `anon` (compteur =
  navigation) ; en vue détaillée corpus, checkbox **cochée + désactivée**, **pas d'exception**
  (interdite sur ces occurrences) ; le clic sur le mot ouvre le menu de la règle **large**
  (`trouverOccurrenceAnonyme` **ignore** les matchs `isIncluded` → la cible retombe sur le run
  englobant). Les actions de menu (`pseudonymiserOccurrence`, `basculerException`,
  `marquerExceptionDepuisNonTraite`) **refusent** d'agir sur une incluse, et les gardes
  `if (match.isIncluded) return;` dans les boucles de démarquage/suppression empêchent de **percer**
  le run large — sinon marquage concurrent dans le run → **compteurs faux**.
- **Export** : document = **inchangé** (l'absorption rend déjà `[ville]`) ; table de correspondance =
  incluse **exclue** (couverte par l'entrée de la règle large), une ligne entièrement absorbée n'est
  pas exportée (`estEntierementIncluse`).

---

## 11. Portée d'une règle (slider 🚧 brouillon / 📄 document / 📁 corpus)

Une règle d'entretien porte une **portée** explicite, pilotée par un *slider à icônes* sous les
compteurs de chaque ligne. Elle répond à : *« cette anonymisation reste-t-elle locale à l'entretien
ou est-elle partagée au corpus ? »* (Implémenté depuis l'ex-`plan-portee-slider.md`.)

```
portee ∈ { 'brouillon', 'document', 'corpus' }   // legacy / undefined ≡ 'corpus' (rétro-compat)
```

| Portée | DOM marqué ? | Au corpus ? | Typo de ligne | Arrivée |
|---|---|---|---|---|
| **brouillon** 🚧 | non (`occ=0`) | non | *italique*, fond gris | saisie non validée / parking |
| **document** 📄 | oui (`occ>0`) | **non** (confiné à l'entretien) | normal | **Entrée** |
| **corpus** 📁 | oui (`occ>0`) | oui (règle `.crp`) | **gras** | **Shift+Entrée** |

La capacité **neuve** est **document** : anonymiser un entretien **sans** contaminer le corpus.
**brouillon** = draft complet (entité+pseudo) mais non appliqué, **persisté**. **corpus** = l'ancien
comportement (rendu explicite).

### Les DEUX chokepoints entretien→corpus (⚠️ piège)

Le corpus est *dérivé* de l'union des entretiens. Pour qu'une règle `document`/`brouillon` **ne fuie
pas**, il faut filtrer `(r.portee||'corpus')==='corpus'` aux **DEUX** points qui poussent du local
vers le `.crp` — en oublier un = fuite :
1. **Sauvegarde d'entretien** (le plus fréquent) : `synchroniserTabAnonGlobal` dans
   [gestion_entretiens.js](../gestion_entretiens.js) (à **chaque** save).
2. **Reconstitution** : `reconstituerTabAnonGlobal` ([anon-scan.js](anon-scan.js)).

### Invariants (I-POR)

- **I-POR-1** : `portee ∈ {brouillon, document, corpus}` ; `undefined ≡ corpus`. Toute ligne **créée
  par cette version** porte une portée **explicite** ; `undefined` ne désigne que du legacy.
- **I-POR-2** : seules les règles `corpus` (et legacy) remontent au corpus (les 2 chokepoints).
- **I-POR-3** : une règle `document`/`brouillon` ne **diverge jamais** du corpus. Toute divergence est
  résolue (dialogue `resoudreConflitCorpus`) à la création/validation **et à l'ouverture**
  (`reconcilierPorteesDivergentesAOuverture`, cas d'une règle corpus apparue *entre-temps* ailleurs) ;
  « garder les deux » fait basculer la règle en `corpus`.
- **I-POR-4** : `brouillon` ⇒ `occ=0`, aucun marquage. La détection auto l'**ignore**
  (`reindexerMatchPositions` ET `detecterOccurrencesNonTraitees` : garde `portee==='brouillon'`) →
  il ne devient jamais « à anonymiser » tout seul ; son repérage se fait à la demande (loupe).
- **I-POR-5** : on ne peut **quitter corpus** (→ document/brouillon) que si la règle est **isolée** —
  `regleEstIsolee` : aucune AUTRE fenêtre d'entretien ne la **traite réellement** (`_aOccurrenceTraitee`
  = ≥1 occurrence **anonymisée OU exception**, hors « à anonymiser » et incluse). Sinon transition
  **refusée** (🔒). Même garde-fou sur la **suppression** de ligne (`supprimeLigneAnon`).
- **I-POR-6** : `brouillon`/`document` survivent à `nettoyerTabAnon`/`nettoyerPairesOrphelines` ; les
  **fantômes** corpus (`source:'Global' && !existeLocalement && occ=0`) restent jetés.

### UI

- **Slider à icônes** empilé **sous** les compteurs (`changerPorteeLigne` exécute les transitions +
  gardes). Poignée bleue glissante, crans inactifs grisés ; **pas de lettres** (icônes seules). CSS
  `.portee-slider` / `.portee-thumb` / `.portee-cran` / `.verrou` dans [css/styles.css](../../css/styles.css).
- **🔒 verrou** posé par une passe **asynchrone** après chaque rendu (`marquerVerrousPortee`, lit
  `getEnt`) — le rendu étant synchrone, l'isolement ne peut pas être calculé pendant.
- **Encodage typographique** de la ligne, orthogonal : **fond** = statut (vert tout traité / orange à
  traiter / gris brouillon) ; **typo** = portée (gras corpus, italique brouillon). Le gras était libre
  (`.ligne-anonymisee` = vert sans `font-weight`).
- **Boutons** : plus de ✓ par ligne (le slider applique) ; ✖ sur les brouillons ; « Appliquer » du bas
  splitté en **🚧→📄** (`validerAnonEnAttente('document')`) / **🚧→📁** (`'corpus'`).
- **Loupe = repérage NON destructif** (`repererOccurrences`/`repererNav`) : compte + surligne
  (transitoire `.reperage-hit`) + navigation `◄ i/N ►`, **sans** poser de marquage (la ligne reste
  brouillon). Marche avec l'entité seule.

### Affichage compact des entités longues

`tronquerEntiteAffichage(texte, n=6)` ([anon-regles.js](anon-regles.js)) : « 6 premiers mots […] 6
derniers mots » au-delà de 12 mots. Corpus = cellule tronquée + texte complet en `title`. Entretien =
**uniquement les lignes appliquées** (`occ>0`), texte complet **révélé au focus** (relu depuis
`window.tabAnon`). ⚠️ Ne JAMAIS tronquer un brouillon : son `.value` est lu tel quel par
l'application. Garde-fou dans `sauvAnon` : si le champ montre le placeholder « … […] … » (non édité),
on **ne réécrit pas** l'entité complète.

---

## 12. Pseudonymisation des libellés de locuteurs

Pseudonymise les **étiquettes de prise de parole** (`.ligloc` → `data-nomloc`), sur un **axe séparé** du
moteur d'occurrences de texte (même comportement, plomberie distincte). Détail :
[plan-locuteurs-pseudo.md](plan-locuteurs-pseudo.md).

- **Stockage DOM-natif** (§2) : marqueurs posés sur le `.ligloc` — `loc-anon` + `data-locpseudo`
  (confirmé) ; `loc-suggere` + `data-locpseudo-suggere` (suggéré, **runtime**, re-dérivé) ;
  `loc-suggere-refuse` (refusé, **persisté**). **Rien dans `tabAnon`/`.crp`.** Persiste via le HTML :
  `cleanHTML`/`compactHtml` **préservent** ces marqueurs (`cloneNode` garde attributs+classes du `.lblseg`).
- **Rendu** : CSS `.ligloc.loc-anon::before` = « Nom̶ [Pseudo] » (nom barré + pseudo entre crochets, calqué
  sur le texte anonymisé ; suggéré = « Nom̶ [Pseudo] ? » pointillé). Le `::before` EST le libellé (un seul
  pseudo-élément, `content` indivisible → `text-decoration` frapperait aussi le pseudo) → le barré du **seul
  nom** est intégré aux caractères via l'overlay combinant **U+0336** dans `data-nomloc-barre` (dérivé de
  `data-nomloc` par `majBarreLoc`/`barrerTexte`, [locutarisation.js](../locutarisation.js) ; posé partout où
  les classes `loc-*` changent, re-dérivé à l'ouverture par `detecterLibellesASuggerer`, retiré à l'export).
  Lecture centralisée par **`nomLocAffiche(ref,{anonymise})`** : pseudo si `loc-anon` **ou** `loc-suggere`
  (suggestion = sûre par défaut à l'export), sinon nom réel.
- ⚠️ **Matérialisation = texte OU libellé** (invariant clé) : une règle est document/corpus (jamais
  brouillon) si elle marque des occurrences de TEXTE (`occ>0`) **ou** un libellé. ⇒ une règle peut être
  **document/corpus à 0 occurrence de texte**. Tout test `occ>0` valant « appliqué » doit l'inclure
  (`aLibellePseudonymise`, sinon slider mal routé). `nettoyerTabAnon` conserve ces règles **locales** ;
  confirmer une suggestion **corpus** pose `existeLocalement=true` (sinon fantôme caché par le filtre
  d'affichage `Global && occ-texte=0`).
- **Flux** ([tableau_base.js](tableau_base.js) sauf mention) :
  - *Création* : dialogue post-validation `proposerPseudoLocuteur` (miroir de `proposerRegleCoeurAffixe`),
    match d'alias `clesAlias` contre `data-nomloc`. Couvre le locuteur **non cité dans le texte**.
  - *Suggestion* (corpus → nouvel entretien) : `detecterLibellesASuggerer` en fin de
    `detecterOccurrencesToutesLesPaires` (ouverture + scan).
  - *Menu libellé* ([anon-menus.js](anon-menus.js)) : clic-droit sur le `.ligloc` (détecté car **hors
    `[data-rk]`**) — confirmer / refuser / ré-activer / retirer (local ; **≠** suppression de règle, §11).
  - *Propagation* : `resynchroniserLibellesLocuteurs` (suppression, parking 🚧, édition de pseudo,
    re-locutarisation via scan) → réaligne les `loc-anon` sur les règles **non-brouillon**.
- **Synthèse & recueils** ([synthese.js](../synthese.js), [recueil.js](../recueil.js),
  [segmentation.js](../segmentation.js)) : le texte des extraits de synthèse est pseudonymisé par
  `traiterTexteExtrait` (runs `.anon` → `[pseudo]` ; option `anonymise`, défaut vrai — l'AFFICHAGE
  synthèse et la copie restent toujours pseudonymisés, mais l'**export synthèse** expose une case
  « Pseudonymiser » cochée par défaut, décochée → re-traitement en clair depuis les spans
  d'origine, `traitementExtraitExport`). Les `.ligloc` de la synthèse sont
  **synthétiques** (posés sur le 1ᵉʳ mot d'une prise de parole) : `traiterEntretien` **recopie** les
  marqueurs `loc-*` + `data-locpseudo(-suggere)` + `data-nomloc-barre` depuis le vrai `.ligloc[data-loc]`
  du HTML — sans cette recopie, `nomLocAffiche` retombe sur le nom réel (affichage, exports synthèse,
  recueils). Libellé pseudonymisé rendu « [Pseudo] » (convention `locuteursExport`). La capture
  « Ajouter au recueil »/« Copier » depuis l'entretien (`txtSelectionSpans`) passe par
  `extraireTexteAnonymiseDepuisSpans` + `nomLocAffiche`. ⚠️ Un **recueil `.rcl` = instantané figé**
  (texte plat, non ré-anonymisable) : une règle créée *après* la capture ne s'y propage pas ; l'item
  extrait stocke le **nom de l'entretien source** (traçabilité, re-dérivation future possible).
  C'est pourquoi les DEUX entrées de recueil demandent la version AU CAS PAR CAS (« Pseudonymisée /
  Texte original / Annuler »), uniquement si la sélection contient réellement des éléments
  pseudonymisés (comparaison version pseudonymisée vs re-calcul clair depuis les mêmes spans) :
  **drop d'un extrait de synthèse** ([recueil.js](../recueil.js), handler `drop`) et **« Ajouter au
  recueil » depuis l'entretien** (`ouvrirMenuAjoutRecueil`, question posée AVANT le choix du recueil ;
  version claire via `txtSelectionSpans(deb, fin, {anonymise:false})`, segmentation.js). La COPIE
  presse-papiers, elle, reste toujours pseudonymisée (cohérente avec l'écran).
- **Export** : `nomLocAffiche` centralise la lecture ; les **fichiers exportés** sont désormais **tous**
  couverts — `exportTxtAvecClasses` + [synthese.js](../synthese.js) ; export **entretien** (`locuteursExport`
  via `nomLocAffiche` sur le **DOM live**, 6 formats — [gestion_entretiens.js](../gestion_entretiens.js)) ;
  export **corpus** (`locuteursExportCorpus` lit l'état sur les `.ligloc` du HTML **sauvegardé**, pas de DOM
  live — [tableau_global.js](tableau_global.js)). Locuteur pseudonymisé → « [Pseudo] », sinon nom en clair
  (gaté sur `opts.anon`). `sauvHtmlAnonymise` neutralise les **deux** fuites — `loc-json` sérialise les
  pseudos ; `AnonymiserSegments` réécrit `data-nomloc` (pseudo) + retire les marqueurs **ET
  `data-nomloc-barre`** (vrai nom barré) sur un **clone** (`_anonymiserHtml` n'agit que sur les `[data-rk]`).
  Le cœur ligloc est **mutualisé** : `_anonymiserLiglocsDansElement` ([anon-regles.js](anon-regles.js),
  les deux fenêtres).
- **Export CSV Base de données** (`exportTabDat`, [gestion_data.js](../gestion_data.js)) : question à
  l'export (Pseudonymiser / Noms réels / Annuler — l'ÉCRAN garde les noms réels, principe : seuls les
  exports sont pseudonymisables). Modale **sautée** (export direct, noms réels) si aucun `.ligloc`
  du corpus ne porte `loc-anon`/`loc-suggere` (HTML frais) — les deux réponses seraient identiques ;
  un refus explicite (`loc-suggere-refuse`) ne la déclenche pas. En mode pseudonymisé, la colonne locuteur est résolue par entretien
  (suivi de la cellule rowSpan `grp-last`, nom → index `tabLoc`) via **`locuteursAffiches`**
  ([locutarisation.js](../locutarisation.js), cœur promu — `locuteursExportCorpus` en est un wrapper)
  sur du HTML **frais** (`getHtml()`, §3.4). Fichier suffixé `_pseudonymisees`.
- **Export corpus RÉOUVRABLE anonymisé** (`exporterCorpusReouvrable`, [tableau_global.js](tableau_global.js)) :
  les vrais noms de locuteurs voyageaient par **trois canaux**, tous neutralisés (sans DOM live) —
  (1) `data-nomloc(-barre)` des `.ligloc` du HTML (`_anonymiserLiglocsDansElement`) ; (2) bloc `loc-json`
  des `.Sonal` ; (3) `tabEnt[].tabLoc` du `.crp` exporté. Le `tabLoc` pseudonymisé est dérivé des
  `.ligloc` **AVANT** le retrait des marqueurs (ils portent l'état), statut « ? » préservé, et sert aux
  canaux (2) et (3). Locuteur sans pseudo ou refusé → nom réel (garde-fou export global, point ouvert).
  ⚠️ Reste **array-only sans** résolution du pseudo (`ent.tabLoc[]`, à dériver des règles) : stats
  corpus → nom réel. ⚠️ Hors périmètre assumé : `notes` (texte libre), **noms de fichiers/entretiens**
  (`ent.nom`) et le **contenu des modalités** (variable libre contenant un nom) partent tels quels.
- **Variables « par locuteur »** (`v.champ === "loc"`, préfixe « Nom : modalité ») : pseudonymisées sur
  **tous** les chemins d'export via `varsPubliquesEnt(rkEnt, locAffiches)` ([gestion_data.js](../gestion_data.js)) —
  le tableau résolu (convention « [Pseudo] ») est **injecté par l'APPELANT**, jamais recalculé en interne
  (perf : appels en boucle ; cohérence : même source que les en-têtes de parole). Export **entretien** :
  `locuteursExport` (DOM live) gaté sur `opts.anon` ; export **corpus** : `locuteursExportCorpus` hissé et
  partagé en-têtes/variables ; **synthèse** : anon **systématique** (comme `texteTraite`) via le résolveur
  mémoïsé `creerResolveurLocAffSynthese` ([synthese.js](../synthese.js), `getHtml()` frais §3.4 +
  `locuteursAffiches`). `varsPubliquesXtr(xtr, {anon})` (copie d'extrait) se résout **seule**, sans IPC :
  les liglocs synthétiques de `xtr.texte` portent les marqueurs `loc-*`. Défaut (`null`/`anon:false`) =
  noms réels → l'ÉCRAN (vue synthèse comprise) inchangé.
- **Statut au panneau corpus** : le scan (`accumulerStatsLibellesCorpus`, anon-scan.js) colore une règle
  **personne** (0 occurrence texte) vert/orange selon l'état de ses libellés — candidats via
  `ent.tabLoc` (pas d'index), **tout-ou-rien** (1 test d'état/locuteur), sans compteur. Priorité au texte
  pour les entités texte+personne.

---
