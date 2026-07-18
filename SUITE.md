# SUITE — SonalAsynchro v2 : la parité d'usage SonalPi

> **Origine.** Le set minimum est complet et bilanté ([BILAN.md](BILAN.md)). Ce plan vient du **bilan
> utilisateur** post-étape 7 : les gestes marchent, mais l'*usage* doit se rapprocher de SonalPi
> (enchaînement des écrans, clic-pour-coder, locuteur en ligne, données à deux niveaux) — plus le gap
> EAV, un journal d'actions annulables, et l'audio. Même architecture (modèle = vérité, ProseMirror
> sans Yjs, fichiers) ; même méthode (headless d'abord, un e2e par geste, non-régression rejouée).

## Décisions actées (discussion du bilan)

| # | Décision | Choix |
|---|---|---|
| D-S1 | Clic sur un thème **sans sélection** de texte | **ne rien faire** (message discret) — pas de codage accidentel |
| D-S2 | Blocs adjacents de même `loc` après attribution | **groupement visuel seul** (tour dérivé, MODELE_OBJET2 §4) — jamais de fusion physique des paragraphes |
| D-S3 | Périmètre du journal d'actions annulables | **actions de modèle seules** (codages, locuteurs, valeurs) ; la frappe de texte reste sur Ctrl+Z |
| D-S4 | Lien du fichier audio | **copié dans le dossier corpus** (`audio/<idEntretien>.<ext>`), `audioRef` en chemin **relatif** — « un dossier = un corpus » reste vrai |
| D-S5 | Scission d'un bloc (attribution, Entrée) et timecodes | le 1er fragment garde `deb`, le dernier garde `fin`, les milieux à `null` (inertes ; la synchro audio tolère les trous) |
| D-S6 | Toggle de codage | conservé : re-cliquer le même thème sur la même plage = retirer |
| D-S7 | Onglet Extraits | retiré de l'UI ; la **requête reste dans le code** (resservira pour recueil/lecture) |
| D-S8 | Hiérarchie des thèmes | portée par **`parent`** (modèle) ; `rang` SonalPi = profondeur **dérivée à l'export**, reconstruite à l'import |
| D-S9 | Journal | **volatil** (session) — pas persisté dans le format natif |
| D-S10 | Thèmes : portée & gestion depuis l'entretien | codebook **toujours au corpus** (pas de thème « local »). **Créer** depuis l'écran entretien = écrit le codebook corpus (visible partout). **Supprimer** depuis l'entretien : refusé si un **autre** entretien l'utilise (`compterUsagesCode` avec `exceptId`) ; sinon suppression du codebook **+ retrait des codages de CET entretien** (confirmation avec le compte) — modèle=vérité : le renderer retire ses annotations, le store retire la définition. **Acte destructif non réversible → avertissement explicite à l'utilisateur** (« retire N codages ici, irréversible ») ; assumé (pas d'orphelin, pas d'undo — cohérent « pas de cruft ») |
| D-S11 ✅ | Table de données éditable (vue dédiée, à la SonalPi) — **FAIT** | La table = la **matrice rendue éditable** (projection, pas une table stockée : valeurs toujours chez leur propriétaire `valeursGen`/`valeursLoc` ; re-requête après édition, pas de cache). Éditer une cellule = **écriture ciblée `poserValeur(entretienId, cible, idVar, idMod)`** (transform pur sur `EntretienFichier` dans `shared/` + I/O au store). **Coexistence (rév. 2026-07-17) : SORTIR d'un entretien (retour Corpus/Accueil ou table) le FERME** (sauvegarde → `reinitialiser`) → personne n'écrit dans un entretien ouvert ailleurs (un seul chemin d'écriture, zéro double-vérité) et **aucune ligne n'est verrouillée** (le verrou par ligne mono-utilisateur déroutait : rien ne le déverrouillait). Un **point de reprise volatil** (id + position audio + curseur texte, même statut que le journal D-S9) rouvre l'entretien d'un clic là où on en était — bouton « ↩ Reprendre » aux écrans Corpus et Table. Conséquence assumée : « recolorer un thème se reflète en direct sur l'éditeur ouvert » n'est plus observable depuis l'UI (aller au Corpus ferme l'entretien) — l'invariant par-référence se prouve à la réouverture. Corpus partagé (plus tard) : le verrou par ligne redevient nécessaire (« tenu » = verrouillé par quiconque) — UI additive. Vue dédiée = un état de vue + bouton. `.bak` non roté pour une valeur scalaire (trop granulaire) |
| D-S12 | Décomposition UI **par scope de données** (composables d'abord) | On découpe l'UI par **périmètre de données**, PAS par écran. Trois scopes : **profil** (dossier courant, récents), **corpus** (membership léger + codebook + variables + **requêtes** matrice/usages), **entretien** (le SEUL entretien ouvert : éditeur + modèle). Règle : **1 scope = 1 composable** (`useProfil`/`useCorpus`/`useEntretien`), consommé par plusieurs vues (`Corpus.vue` **et** `Database.vue` partagent `useCorpus`). Isomorphe au stockage (`corpus.json` + fichiers par entretien) et à la logique (`shared/corpus.ts` vs `model/entretien.ts`). **Principe de charge** : le renderer ne tient JAMAIS tous les entretiens — working set = définitions corpus (petit) + membership (métadonnées, pas le contenu) + **un** entretien ouvert + résultats de requêtes transitoires ; tout transverse reste dans le **main** (scan disque → projection). Jamais de cache dans le renderer (« requête, pas cache ») ; l'indexation éventuelle irait dans le **store**, invisible aux composants. **Composables d'abord, composants ensuite** ; pas de Pinia tant que des composables suffisent |
| D-S13 | **Invariant audio** (unité de surlignage & timecodes des blocs scindés) | L'unité de surlignage audio est **le bloc**, jamais le tour (le tour peut être grand ; le bloc = un cue SRT ou un fragment de cue). **Constat** : même SonalPi n'a aucun timecode réel sous le cue — ses positions par mot sont une **interpolation linéaire** fabriquée à la scission (`SplitSeg`). **Choix SonalAsynchro** : ne persister QUE les timecodes **mesurés** (bornes de cue) ; les bornes des blocs scindés restent **`null` en modèle** (D-S5) — le format `.sonal` ressort un `deb`/`fin` vide, round-trip préservé. La borne manquante est **dérivée à la lecture** (S6), par une fonction pure : marcher à gauche jusqu'au dernier `deb` mesuré, à droite jusqu'au prochain `fin`/`deb` mesuré, répartir proportionnellement à la longueur de texte des blocs intermédiaires. **L'interpolation est une dérivation, pas un état stocké** (cohérent « modèle = vérité », « requête, pas cache », comme le *tour dérivé* D-S2). Conséquence pour S4 : la scission « attribuer la sélection » ne touche qu'aux bornes de la sélection → seuls le 1er et le dernier bloc couverts peuvent recevoir un timecode `null` ; les blocs intérieurs sont des cues entiers et gardent leurs timecodes mesurés. **S4 ne code aucune logique audio** ; il se contente de respecter cet invariant (nulls aux fragments internes). |
| D-S14 | **Ancres temporelles dans le texte** (S7 — généralise D-S13, prépare le word-level) | Le temps est porté par des **ancres** `{pos, t}` : une position dans le texte (remappée aux éditions, **comme les annotations**) + un temps **mesuré** (jamais fabriqué — D-S13 tient). Les attrs `deb`/`fin` des blocs sortent du modèle (re-dérivés à l'export pour le round-trip `.sonal`). Un SRT pose 2 ancres par cue ; un format à timecodes par MOT en posera une par mot — même mécanisme, seule la densité change. **Invariants de perf actés d'avance** (analyse : ~30 000 ancres pour 2-3 h word-level) : (1) les ancres sont des **données triées HORS DOM** — jamais un nœud/décoration par ancre ; (2) **une seule décoration inline** à la fois (la plage entre les 2 ancres encadrant `t`) ; (3) lookups en **dichotomie** O(log n) (le balayage linéaire actuel de `debsDerives` disparaît) ; (4) remap par plage/paresseux **si la mesure l'exige** (une insertion ne décale que les ancres en aval, d'un même offset). L'interpolation D-S13 demeure : dérivation entre ancres au prorata du texte, jamais stockée |
| D-S15 | **Fusion des tours à l'IMPORT** (S7 fin) | Les cues consécutifs d'un MÊME locuteur **non nul** deviennent UN paragraphe (le tour) à l'import ; leurs frontières survivent en **ancres internes** — aucune perte. **Sans locuteur, pas de fusion** (un bloc par cue : un SRT non diarisé ne devient pas un seul pavé) ; le `data-loc="0"` SonalPi (= aucun locuteur, locut[0] n'existe pas) est normalisé en `null` à l'import. Fusion d'**import** uniquement — D-S2 tient, aucun geste d'édition ne fusionne. **Export symétrique** : un `.lblseg` par INTERVALLE d'ancres — le tour ressort re-découpé en cues avec leurs `data-deb`/`data-fin` (à une frontière portant 2 ancres, la 1re — t min — ferme le cue de gauche, la dernière ouvre celui de droite) → SonalPi garde sa granularité cue, et le ré-import re-fusionne : round-trip **canonique et stable** |

---

## S1 — Round-trip EAV complet (le gap du bilan)

Fermer l'écart révélé par l'étape 7 : les EAV *créées* dans SonalAsynchro doivent repartir dans le `.sonal`,
et les EAV d'un `.sonal` doivent entrer dans le **modèle** (fin du pass-through `legacy` pour
var/dic/dat ; `anon` et `notes` restent en pass-through).

- **Import** : `tabVar`/`tabDic` → `corpus.variables` (ids **déterministes** — règle n°3 : `v{n}`,
  `v{n}m{m}` — fusion idempotente par id) ; `tabDat` → `meta.valeursGen` (`l="all"`) et
  `Locuteur.valeursLoc` (`l=index`), mapping `(v,m)` → `(idVar,idMod)`.
- **Export** : variables modélisées → `tabVar`/`tabDic` (via `vExport`/`mExport`) ; valeurs →
  `tabDat` (le sentinelle `l="all"` est **réintroduit à l'export seulement** — artefact de format,
  jamais du modèle).
- **Critères** : golden round-trip EAV sur les 3 fixtures (entretien1 porte var/dic/dat) ; une valeur
  saisie dans SonalAsynchro ressort dans l'export et est lue par `extractFichierSonal` (le parseur SonalPi,
  headless) ; double import du même fichier = zéro doublon de variable.

## S2 — L'enchaînement SonalPi : Accueil → Corpus → Entretien (+ données à 2 niveaux)

Le chantier **structurant** : App.vue devient trois vues.

- **Accueil** : « Créer un corpus… » (choisir un dossier), « Ouvrir un corpus… » (`openDirectory`),
  liste des **récents** (petits chemins mémorisés dans `userData/settings.json`). Le main recrée le
  `CorpusStore` au changement (déjà paramétré par `dir`).
- **Écran Corpus** : membership (ajouter / importer / renommer / supprimer / ouvrir un entretien) ;
  **gestion complète des thèmes** (CRUD, couleur, ordre, hiérarchie — déménage ici) ; **variables +
  modalités** (CRUD) ; **matrice corpus** (requête).
- **Écran Entretien** : l'éditeur + panneaux latéraux — thèmes (liste **cliquable pour coder**, S3),
  locuteurs, **fiche données de CET entretien** (valeursGen + valeursLoc de ses locuteurs), journal
  (S5) ; bouton retour au corpus. ~~Le panneau debug (Modèle) reste, en dev~~ — **retiré après S5**
  (perçu comme doublon du Journal ; l'observable e2e du modèle = les décorations, ids `data-annot-ids`).
- **Coût assumé** : migration des sélecteurs d'une partie des 24 e2e (les écrans changent) + nouveaux
  e2e de navigation.
- **Critères** : créer un corpus dans un dossier choisi, y importer un `.sonal`, ouvrir l'entretien,
  revenir au corpus ; ouvrir **deux corpus différents** successivement (les récents marchent) ;
  fraîcheur / `.bak` / refus de version inchangés ; toute la suite e2e migrée verte.

## S3 — Thèmes : clic = coder, hiérarchie

- **Clic sur un thème** (écran entretien) = coder la **sélection courante** (snap) ; sans sélection →
  rien + hint (D-S1) ; re-clic même plage/même thème = retirer (D-S6). **Suppression** du sélecteur
  et du bouton « Coder la sélection » de la barre. Double-clic = renommer (conservé).
- **Hiérarchie** : « + thème » (racine) et « + sous-thème » (enfant du thème visé) → `parent` ;
  affichage indenté (groupé par parent, ▲▼ déplacent dans la fratrie) ; **export** `rang` =
  profondeur ; **import** reconstruit `parent` depuis la séquence des `rang` (aujourd'hui perdu !).
- **Créer / supprimer depuis l'entretien** (D-S10) : « + thème » écrit le codebook **corpus** (pas de
  thème local) ; supprimer refuse si un **autre** entretien l'utilise (`compterUsagesCode` + `exceptId`),
  sinon retire la définition **et** les codages de cet entretien (confirmation avec le compte). Le store
  ne fait que supprimer la définition ; le renderer retire ses annotations `code===id` puis autosave.
- **Critères** : sélection + clic thème → codage posé (e2e) ; sans sélection → rien ; sous-thème
  indenté ; import d'une fixture à rang 0/1 → hiérarchie reconstruite ; export → `rang` corrects
  (golden) ; round-trip hiérarchie sans perte ; supprimer un thème utilisé par un **autre** entretien
  → refus + compte ; supprimer un thème propre à cet entretien → codages retirés ici, autres intacts.

## S4 — Locuteurs : attribuer la sélection, ligne au-dessus

- **Bouton dynamique** : sélection non vide → « Attribuer la sélection » — **scinde** les blocs aux
  bornes si elles tombent en milieu de bloc (commande headless testée), pose `loc` sur les blocs
  couverts ; sélection vide → « au bloc courant » (actuel). Les annotations suivent la scission
  (remap, prouvé POC3). Timecodes : D-S5. **Aucune fusion physique** (D-S2).
- **Rendu** : la gouttière gauche disparaît ; le nom du locuteur devient une **ligne au-dessus** du
  premier bloc de chaque tour (style `ligloc`), le texte reprend toute la largeur. ~~Teinte pâle par
  locuteur conservée (repère)~~ — **RETIRÉE (2026-07-18, décision utilisateur : rendu neutre)**, en
  même temps que l'arrivée de l'**interviewer** (parité SonalPi) : `Locuteur.interviewer?` (booléen
  ADDITIF au modèle — pas de bump de format), interrupteur compact « ? » dans l'onglet Loc, tours de
  l'interviewer en **italique gris** (classe `bloc-interviewer`, équivalent du `.qst` SonalPi), label
  de gouttière « Nom ? ». Le « ? » DANS le nom (convention SonalPi) est un **artefact de format** :
  détecté/nettoyé à l'import, réintroduit dans tabLoc à l'export seulement (même patron que `l="all"`
  EAV) — round-trip prouvé par unitaire. **Suppression d'un locuteur** (✕ par ligne, même idiome que
  les thèmes D-S10) : bannière de confirmation in-app avec le compte de blocs → ses blocs passent à
  `loc: null` (« aucun ») en UNE transaction (remap/journal la voient passer), l'entrée quitte la
  liste (`supprimerLocuteur` pur). Non journalisé (destructif non réversible) ; les entrées de journal
  visant ce locuteur se grisent d'elles-mêmes (estApplicable).
- **Critères** : attribuer une sous-partie d'un bloc → bloc scindé, `loc` posé, annotations intactes
  (unitaire + e2e) ; deux blocs adjacents même loc → **une** ligne locuteur ; renommage répercuté
  (non-régression étape 4).

## S5 — Journal d'actions (annulation sélective, hors texte)

- `model/journal.ts` : entrées `{id, horodatage, libellé, inverse}` enregistrées par les **commandes
  de modèle** de l'entretien ouvert — coder/retirer, attribuer `loc` (ancien→nouveau), renommer un
  locuteur, saisir une valeur (ancienne→nouvelle). **10 dernières** affichées (panneau écran
  entretien, à la place d'Extraits — D-S7). Volatil (D-S9).
- **Annuler une entrée** = appliquer son inverse **si encore applicable** (l'annotation existe
  encore, le locuteur existe…) ; sinon l'entrée est grisée « non annulable ». Grâce au remap, retirer
  un codage ancien est sûr même si le texte a bougé depuis.
- La frappe de texte reste sur **Ctrl+Z** (note affichée dans le panneau).
- **Critères** : coder 3 passages, annuler le 1er → les 2 autres intacts (e2e) ; annuler une
  attribution de locuteur → l'ancien `loc` restauré ; une entrée dont la cible a disparu est grisée ;
  unitaires headless sur les inverses.

## S6 — Audio : lecteur + synchro

- **Assigner** : dialog fichier → **copie** dans `<corpus>/audio/` (D-S4), `audioRef` relatif.
- **Lecteur** : barre en bas de l'écran entretien (play/pause, position, vitesse).
- **Synchro v1** (lecture seule, pas d'édition de timecodes) : pendant la lecture, le bloc courant
  est surligné (`deb ≤ t <` le `deb` suivant ; **tolère les `deb=null`** des blocs scindés en les
  rattachant au cue précédent) ; **clic sur la ligne locuteur → seek** au `deb` du tour.
- **Point d'attention technique** : servir le fichier audio au renderer — en dev le renderer est en
  `http://localhost` (Vite) et ne lit pas `file://` → protocole custom (`registerFileProtocol`) ou
  lecture IPC → blob. À trancher à l'implémentation.
- **Critères** : importer un `.srt` + assigner l'audio → la lecture suit les blocs (e2e avec un petit
  fichier audio de fixture) ; clic-tour → seek ; copier le dossier corpus ailleurs → l'audio suit.

## S7 — Ancres temporelles : surlignage fin, prêt pour le word-level (D-S14)

> **Origine.** Retour utilisateur post-S6 (import SRT réel) : les cues consécutifs d'un même locuteur
> gagneraient à être fusionnés en tours lisibles, le surlignage au bloc deviendrait alors trop
> grossier, et des formats à timecodes **par mot** arrivent à terme. Constat : le concept existe déjà
> en interne — `ancres()` dans `shared/entretien/audio.ts` convertit les blocs en paires
> (position-texte, temps) avant d'interpoler. S7 promeut ce concept interne en **modèle de première
> classe** ; chaque fonctionnalité audio ajoutée sur « deb/fin par bloc » renchérirait la migration.

- **Modèle** : `EntretienFichier` gagne `ancres: {pos, t}[]` (triées par `pos`) ; les attrs
  `deb`/`fin` des paragraphes **sortent du schéma** → **bump `formatVersion` + migration explicite**
  (garde-fou 3 / D6 ; migration mécanique : `deb` → ancre au début du bloc, `fin` → ancre à la fin,
  `null` → rien). Import SRT/VTT : 2 ancres par cue. **Export `.sonal`** : `data-deb`/`data-fin`
  re-dérivés par bloc (ancre exactement à la frontière → valeur, sinon vide — le format legacy
  conserve la sémantique D-S5, round-trip prouvé par les goldens existants).
- **Remap** : les ancres suivent les éditions comme les annotations (plugin dédié sur le modèle de
  `journalRemap`, ou extension de `pluginRemap` — à trancher à l'implémentation ; politique de bornes
  identique). **Simplification clé attendue** : `attribuerSelectionTr` (S4) et la scission (Entrée)
  n'ont PLUS de logique de timecodes — une ancre vit à une position de texte, une coupe ne la déplace
  pas. D-S5 cesse d'être du code (le `setNodeMarkup` pré-split + `typesAfter`), il devient une
  conséquence gratuite du remap.
- **Lecture** : `shared/entretien/audio.ts` réécrit sur les ancres du modèle — l'interpolation D-S13
  garde son esprit (prorata de longueur de texte entre ancres), mais les lookups passent en
  **dichotomie** (invariant perf n°3 ; le balayage linéaire par tick disparaît). Le surlignage devient
  une **décoration inline unique** entre les 2 ancres encadrant `t` (invariant n°2) — avec un SRT au
  cue, visuellement identique à `.bloc-lu` aujourd'hui ; avec des ancres au mot, suivi type karaoké,
  sans rien changer d'autre. Seek clic-tour, clic-bande, cache d'égalité (`posBlocLu` → plage lue) et
  défilement doux inchangés dans l'esprit.
- **Fusion des tours à l'IMPORT — TRANCHÉ et FAIT (D-S15)** : un paragraphe par tour de parole
  (cues consécutifs de même loc non nul), les frontières de cues survivant en ancres internes —
  sans perte. Décision d'**import** (la structure initiale du doc), PAS une fusion d'édition —
  D-S2 intact. Round-trip résolu par l'export **par intervalle d'ancres** (un lblseg par cue,
  pas par bloc). Le rendu « ligne au-dessus » (S4 reporté) devient naturel — toujours optionnel.
- **Critères** : unitaires headless (migration formatVersion ; remap d'ancres sur
  insertion/suppression/scission — y compris ancre à la frontière de coupe ; interpolation = mêmes
  résultats que les goldens D-S13 actuels ; round-trip `.sonal` deb/fin re-dérivés) ; e2e (la lecture
  suit après une édition PENDANT la lecture ; seek ; import SRT → surlignage inchangé visuellement) ;
  **garde-fou perf** : un doc synthétique long (~30 000 ancres) — la frappe ne déclenche ni remap O(n)
  du DOM ni plus d'UNE décoration, le tick de lecture reste en dichotomie (compter les opérations dans
  un unitaire plutôt qu'un benchmark fragile).

---

## Garde-fous (inchangés + spécifiques)

1. Ceux de DEMARRAGE : modèle = vérité ; transaction PM ; requête, pas cache ; `model/` sans DOM ;
   invariants règle n°3 ; golden `.sonal`.
2. **S2 d'abord un squelette** : les trois vues avec les panneaux *déplacés tels quels*, la
   non-régression e2e migrée verte, PUIS les évolutions de panneaux (S3-S5). Pas de refonte des
   gestes pendant le déménagement.
3. Le format natif n'évolue pas (tout existe : `parent`, `variables`, `audioRef`) — **sauf** si S6
   exige un champ neuf → bump `formatVersion` + migration explicite (D6).
4. Chaque étape : unitaires headless du cœur + 1-3 e2e du geste + non-régression complète rejouée.

## Ordre d'exécution (checklist)

- [x] S1 : round-trip EAV complet (import modèle + export tabVar/tabDic/tabDat ; golden fixtures)
      → `import/eav.ts` (mapping pur : `v{n}`/`v{n}m{m}`, `l="all"`+`e` réintroduits à l'export seul) ;
        var/dic/dat sortis du pass-through `legacy` (reste `anon`+`notes`) ; fusion variables idempotente
        au store. 81 unitaires (dont eav + golden 3 fixtures + relu par `extractFichierSonal`) + 24 e2e verts.
- [x] S2 : Accueil → Corpus → Entretien ; multi-corpus + récents ; données à 2 niveaux ; e2e migrés
      → **Incrément 1 (squelette)** : `App.vue` = état `vue` (accueil/corpus/entretien, `v-show` pour
        garder l'éditeur monté), panneaux relocalisés (Thèmes CRUD + Variables + matrice → Corpus ;
        Locuteurs + fiche valeurs de CET entretien + debug → Entretien), Extraits retiré de l'UI (D-S7),
        Données scindées par niveau, fil d'Ariane + bouton retour. Helpers e2e `ouvrir`/`ouvrirSurCorpus`/
        `entrerEntretien`/`retourCorpus` ; 8 specs migrés + `navigation.e2e.ts`.
      → **Incrément 2 (multi-corpus)** : main `store` MUTABLE + `changerDossier` (les handlers capturent la
        variable, pas la valeur) ; `settings.json` du profil (récents, cap 8) ; IPC `dossierCourant`/`recents`/
        `ouvrirDossier`/`choisirDossier` (dialog `openDirectory`+`createDirectory`). Accueil : carte « Corpus
        courant » + « Ouvrir un corpus… » + liste des récents. `appliquerCorpus` réinitialise l'entretien
        ouvert au changement. `multi-corpus.e2e.ts` (2 dossiers isolés + round-trip récents). 81 unit + **26 e2e**.
- [x] S3 : thèmes — clic = coder (D-S1/D-S6) ; hiérarchie parent↔rang ; création/suppression depuis
      l'entretien (D-S10) — **COMPLET**
      → D-S10 : onglet Thématique gagne « + Thème » (crée au corpus) et un ✕ par thème. Supprimer depuis
        l'entretien = `compterUsagesCode(id, exceptId=ouvertId)` : si un AUTRE entretien l'utilise → refus
        (message) ; sinon confirmation destructive (« retire N codages ici, irréversible ») → retrait des
        annotations du modèle + `supprimerCategorie(id, exceptId)` au store. IPC `compterUsagesCode` +
        `supprimerCategorie` gagnent `exceptId`. 100 unit + 32 e2e (dont le refus multi-entretien).
      → clic=coder : onglet **Thématique** (écran entretien, à côté de Locuteurs/Données) — clic sur un thème
        code la sélection courante (snap), re-clic = retirer (D-S6), sans sélection = message discret (D-S1).
        Sélecteur + bouton « Coder la sélection » **retirés de la barre**. Panneau Thèmes de l'écran Corpus =
        gestion pure. 6 specs e2e migrées (`coderTheme` helper).
      → hiérarchie (D-S8) : règles dans `shared/corpus.ts` — `ajouterCategorie(+parent)`, `deplacerCategorie`
        par FRATRIE, `retirerCategorie` PROMEUT les enfants, `parentsDepuisRangs` (import : parent = dernier
        nœud à profondeur d-1), `ordreThemes` (pré-ordre + profondeur + premier/dernier fratrie). Import
        reconstruit `parent` depuis `rang` ; export en **pré-ordre** avec `rang`=profondeur → round-trip prouvé
        (golden entretien1). UI : arbre indenté (corpus + onglet coder), bouton « + sous », ▲▼ bornés à la
        fratrie. 99 unit + 29 e2e.
- [~] S4 : locuteurs — **attribuer la sélection FAIT** ; ligne au-dessus du tour **reportée** (laissée de côté)
      → `editor/attribution.ts` : commande headless `attribuerSelectionTr` (sélection non vide) — scinde tête/queue
        aux bornes (snap au mot via `snapBornes`, coupe seulement si borne en milieu de bloc), pose `loc` sur les
        blocs couverts. **Timecodes D-S5/D-S13** : coupe → borne `null` (fragment gauche garde `deb`, droit garde
        `fin`, cues intérieurs entiers intacts) — aucune valeur fabriquée, interpolation dérivée à la lecture (S6).
        Annotations remappées par `pluginRemap` (enjambe la coupe, prouvé POC3). Aucune fusion physique (D-S2).
        `attribuerLoc` branche : sélection vide → bloc courant (geste étape 4) ; non vide → attribution. Bouton à
        libellé dynamique (`selectionVide`). **109 unit** (+ `attribution.test.ts` : mono/multi-blocs, bloc entier,
        loc=null, remap enjambant) + **34 e2e** (2 S4 : scission+loc+label ; codage survit à la scission).
        Rendu « ligne au-dessus » NON fait (gouttière conservée) — à reprendre si besoin.
- [x] S5 : journal d'actions (10 dernières, annulation sélective, D-S3/D-S9) — **COMPLET**
      → `shared/entretien/journal.ts` (PUR, garde-fou de pureté vert) : entrées `{id, horodatage, libellé,
        inverse}`, l'**inverse = donnée typée** (jamais une closure) — `retirerAnnotation` / `reposerAnnotation`
        (l'OBJET retiré) / `restaurerLocs` (positions de blocs) / `renommerLocuteur` / `poserValeurGen|Loc` ;
        `enregistrer` (tête, cap 10), `estApplicable(inverse, ctx)`, `appliquerInverse`, `annuler` (applique
        PUIS retire l'entrée ; cible disparue → rien, entrée grisée). `ctx.blocs` (locDe/poserLoc) **injecté**
        par la couche éditeur — le module ignore ProseMirror.
      → `editor/journalRemap.ts` : les inverses en attente **suivent les éditions** comme le modèle —
        l'annotation fantôme est remappée (même politique de bornes que `remapperAnnotations`) ; refermée =
        orpheline = « non annulable » (le critère « cible disparue → grisée » DÉCOULE du remap). Positions de
        blocs mappées ; `setNodeMarkup` ne déplace rien → pas d'interférence entre annulations.
      → `attribuerSelectionTr` renvoie désormais `{tr, blocs:[{pos, ancien}]}` (l'inverse de l'attribution).
        Annuler une attribution restaure les `loc`, la **scission demeure** (D-S2). Journal vidé à l'ouverture
        d'un entretien (volatil PAR entretien). Hors périmètre assumé : + Locuteur (pas de suppression
        modélisée), suppression de thème (D-S10 : non réversible). Libellés lisibles via deps injectées
        (`nomCode`, `libelleValeur` — les noms vivent au corpus). Onglet **Journal** (écran entretien) : 10
        entrées max, ↩ par entrée (désactivé si grisée), note « la frappe = Ctrl+Z ».
      → **120 unit** (+11 : cap/ordre, chaque inverse, annuler, remap fantôme/blocs, cible supprimée) +
        **37 e2e** (+3 : 3 codages→annuler le 1er, les 2 autres intacts ; attribution annulée→loc restauré
        + 4 blocs ; toggle→entrée « posé » grisée, « retiré » annulable→re-pose).
- [x] S6 : audio — copie dans le corpus (D-S4), lecteur, synchro v1, seek par tour — **COMPLET**
      → **Cœur pur** `shared/entretien/audio.ts` : `debsDerives`/`finsDerivees` (interpolation D-S13 par
        ANCRES : chaque borne mesurée = un point (position-texte cumulée, temps), les bornes `null` des
        blocs scindés sont interpolées linéairement au prorata de la longueur de texte — dérivation, jamais
        stockée), `indexBlocCourant` (deb ≤ t < deb suivant ; trous rattachés au cue précédent ; après la
        fin du dernier bloc → null), `debutTour`/`tempsTour` (tour dérivé D-S2). `renderer/audio/enveloppe.ts` :
        enveloppe min/max pure (calquée sur le worker SonalPi).
      → **Main** : protocole `sonal-media://corpus/audio/…` (registerSchemesAsPrivileged + protocol.handle,
        Range → seek de l'<audio>, anti-traversal borné à `<corpus>/audio/`) — le renderer Vite ne lit pas
        file:// (point d'attention tranché : protocole custom, PAS d'IPC-blob). Store : `assignerAudio`
        (copie `audio/<id>.<ext>`, `audioRef` RELATIF, watermark membership), `ecrireWaveform`
        (`audio/<id>.png` — PNG DÉRIVÉ persisté, entorse assumée à « requête, pas cache » : décodage
        complet coûteux, régénérable, copié avec le dossier), `audios` (scan → cartes Corpus).
      → **Renderer** : composable `useAudio` (D-S12 — PAS de « composant dynamique » : un <audio> caché +
        état réactif partagé `position/duree/enLecture/vitesse` ; lecteur, barre de position et bloc-lu
        sont trois CONSOMMATEURS de ce même état). `LecteurAudio.vue` EN HAUT de l'écran entretien (comme
        SonalPi ; ≠ plan initial « barre en bas ») : play/pause, temps, vitesse ±0.25, ±5 s, bande = PNG
        waveform + curseur (ratio temps) + clic = seek TEMPOREL (≠ SonalPi qui vise le texte — choix acté).
        `editor/lecture.ts` : décoration `bloc-lu` pilotée par setMeta, position remappée sur les éditions ;
        défilement doux vers le bloc lu. Clic gouttière → seek au deb du TOUR (gouttière cliquable même
        vide : min-height). Waveform générée au fil : fetch sonal-media → decodeAudioData → enveloppe →
        canvas → PNG écrit par le main ; régénérée à l'ouverture si absente.
      → **Import « un geste » (rev. après essai utilisateur)** : le dialogue multiSelections (peu guidé)
        est remplacé par UNE modale à la SonalPi (`ajout-entretien.html`) — `AjoutEntretien.vue` : deux
        zones « Fichier d'entretien » / « Fichier son », clic (dialogue filtré) OU glisser-déposer
        (`webUtils.getPathForFile` au preload ; garde anti-navigation drop global), Valider dès qu'UNE
        zone est remplie. Texte seul = import ; texte+audio = import+assignation+onde ; **audio seul =
        entretien au texte VIDE à transcrire + lecteur** (décision utilisateur — absorbe et REMPLACE
        l'ex-« + Ajouter un document » ; pas de création « vierge » sans fichier, retirée sur décision
        utilisateur). Les DEUX boutons de la barre (Importer / + Ajouter un document) → UN bouton
        « + Ajouter un entretien ». Gap comblé au passage (révélé par la migration e2e) : le sas d'import
        ne gérait PAS le `.txt` pourtant proposé par le filtre depuis l'étape 3 → branche `convertTXT`
        (convertisseur SonalPi vendoré) ajoutée à `sas.ts`. Bouton
        « Assigner un audio… » sur la fiche entretien (vue Corpus) pour l'après-coup ; cartes Corpus =
        vraie forme d'onde (l'ex-placeholder « spectrogramme »). Format natif INCHANGÉ (audioRef existait).
      → **133 unit** (+13 : interpolation D-S13 cues entiers/scindés/sans ancre, blocCourant trous/bornes,
        tour, enveloppe, sas .txt) + **40 e2e** (+3 : import SRT+WAV via la modale → copie + PNG + lecteur +
        surlignage qui suit `currentTime` + clic-tour → 0 s + clic-bande → durée/2 ; audio SEUL → entretien
        vide à taper + lecteur ; assigner à un entretien existant → carte avec onde, texte sans timecodes =
        zéro surlignage). Helper e2e `ajouterParModale` (stub showOpenDialog à compteur : un dialogue par
        zone).
- [x] S7 : ancres temporelles (D-S14) + fusion des tours à l'import (D-S15) — **COMPLET (2026-07-17)**.
      → **Cœur pur** : `shared/entretien/audio.ts` réécrit — `Ancre {pos, t}` (position PM persistée),
        `projeterAncres` (co-parcours O(n) → coordonnée texte cumulée ; les frontières de blocs pèsent 0),
        `plageCourante` (DICHOTOMIE ; trous et ancres effondrées enjambés vers la gauche ; « fin exacte =
        encore lu » conservé), `tempsAuPoint` (interpolation D-S13 ; frontière partagée fin_i/deb_i+1 →
        le deb du cue qui commence), `debutTour` conservé. `positions.ts` DÉMÉNAGÉ dans
        `shared/entretien/` (la migration du main s'en sert ; arithmétique pure).
      → **Format v2** : `FORMAT_VERSION=2`, `ancres[]` dans EntretienFichier/PayloadEntretien ; les attrs
        `deb`/`fin` SORTIS du schéma (BlocAttributs = `loc` seul). Migration EXPLICITE à la lecture
        (`shared/entretien/migration.ts` pur, appelé par corpusStore : réécrite aussitôt, lastModified
        préservé — migrer ≠ éditer ; corpus.json = bump de numéro seul). Import SRT/VTT → 2 ancres par
        cue ; export `.sonal` re-dérive data-deb/data-fin (ancre PILE à la frontière du bloc, Map pos→t) ;
        round-trip golden étendu aux ancres.
      → **Remap** : `remapperAncres` (assoc -1 : taper au début d'un cue = dans le cue, à sa fin = dans le
        trou) branché dans `pluginRemap` à côté des annotations. `attribuerSelectionTr` VIDÉ de toute
        logique timecodes (les `tr.split` nus suffisent) — l'ex-D-S5 est prouvé comme CONSÉQUENCE du remap
        par un unitaire (les ancres enjambent la coupe, aucune borne fabriquée ni perdue).
      → **Lecture** : plugin `lecture.ts` = UNE décoration INLINE `.plage-lue` (ex-`.bloc-lu`, e2e migrés)
        sur [ancre g, ancre d], remappée entre deux ticks ; `useEntretien` : mémo de projection invalidé
        par IDENTITÉ du doc PM (tick sans édition = dichotomie pure, zéro reconstruction), `majPlageLue`
        (garde d'égalité), `tempsDuBloc` réécrit (x du début du tour → tempsAuPoint).
      → **Garde-fou perf tenu** : unitaire à 30 000 ancres, un Proxy COMPTE les accès au tableau —
        plageCourante et tempsAuPoint restent ≤ ~O(log n) accès (un balayage linéaire ferait échouer).
      → **Fusion des tours (D-S15, fin d'étape)** : `importSonal` étape 1b — chaque segment devient un
        cue `{deb, fin, de, a}` ; les consécutifs de même loc NON NUL fusionnent (texte concaténé,
        annotations décalées, cues décalés) ; ancres émises PAR CUE (internes au tour), dédupliquées si
        cues jointifs (même pos, même t). ⚠ piège rattrapé : `convertTXT`/`convertVTT` posent
        `data-loc="0"` pour « aucun locuteur » → normalisé en `null` à l'import, sinon la fusion collait
        tout un texte brut en un bloc. Export réécrit : boucle par bloc × par intervalle d'ancres
        (jalons = ancres internes au texte du bloc), `debParPos` (dernière ancre à pos) / `finParPos`
        (première) pour les frontières à 2 ancres, bloc vide → un segment vide quand même ; fragments
        d'annotations calculés PAR SEGMENT. Unitaires : tour fusionné → 2 lblsegs avec leurs timecodes →
        ré-import re-fusionné identique (ancres égales) ; SRT utilisateur (None + Speaker 3 ×2 +
        Speaker 7) → 3 blocs, 8 ancres, frontière interne partagée.
      → **Clic-texte = seek (parité SonalPi, demande utilisateur)** : un clic DANS le texte cale la tête
        de lecture au temps interpolé à cet endroit précis (`tempsAuTexte` : pos → coordonnée texte →
        `tempsAuPoint` ; la barre sur l'onde suit par réactivité, play reprend là, le surlignage se cale
        sur le cue cliqué). Branché par `handleClick` (editorProps — un clic, pas un drag de sélection :
        coder n'est pas gêné) → dep injectée `clicTexte` (l'orchestrateur seek si un audio est chargé).
        La gouttière fait `stopPropagation` (le clic-tour ne double pas le clic-texte). Sans ancre →
        null → aucun seek (texte sans timecodes). S'affinera tout seul avec des ancres au mot.
      → **141 unit + 40 e2e verts** (audio.e2e enrichi : clic dans le cue 2 → currentTime ∈ [1, 2.5] +
        ÉDITER pendant la lecture → le surlignage reste sur le même texte). ⚠ piège : `npx playwright
        test` ne rebuilde PAS (bundle renderer périmé = surlignage absent, fichiers écrits en vieux
        format) — passer par `npm run test:e2e`.
- [x] S8 : fenêtre d'édition des thèmes (crayon, parité SonalPi) + taille de police — **COMPLET
      (2026-07-18)**.
      → **UI** : l'édition des thèmes sort des panneaux → `EditionThemes.vue`, une modale PARTAGÉE
        ouverte par un bouton crayon ✏️ depuis l'écran Corpus ET l'onglet Thématique de l'Entretien
        (décision utilisateur : même geste que SonalPi, mais l'arbre garde nos ▲▼ + « + sous » — pas
        de drag & drop). La modale porte TOUT le CRUD : « + Thème parent », nom (input direct, plus de
        double-clic), couleur, taille, actif, « + enfant », ▲▼, ✕ ; en-tête de colonnes
        (thème / Aa / nbre / actif — retour utilisateur). Un seul modèle derrière (codebook
        corpus) ; seule la POLITIQUE de suppression dépend du prop `contexte` (D-S10 inchangé :
        `corpus` → refus si utilisé quelque part ; `entretien` → refus si un AUTRE l'utilise, sinon
        confirmation + retrait des codages). Les panneaux deviennent COMPACTS : Corpus = consultation
        (pastille/nom/usages), Entretien = clic-pour-coder pur. `.crayon` mutualisé dans base.css ;
        `themeEnEdition`/`finRenommerTheme`/`focusChamp` (renommage in-place) supprimés de useCorpus.
      → **Taille de police (parité SonalPi)** : `Categorie.taille?: number` (px) — champ ADDITIF
        optionnel, pas de bump de formatVersion (comme `Locuteur.interviewer`). Import : `tabThm[].taille`
        (nombre nu SonalPi, '' = absent) → modèle ; export symétrique (`cat.taille ?? ''`) — round-trip.
        Patch : `taille: undefined` PRÉSENT dans le patch = retour à la taille du texte (le spread
        écrase, JSON.stringify retire la clé ; l'IPC structured-clone préserve la clé undefined).
        Rendu : `pluginDecorations` reçoit un 2ᵉ résolveur injecté `tailleTrait` (même idiome que
        `couleurTrait`, D-S12) → `font-size` **+ `font-weight:bold`** sur les segments codés (comme
        SonalPi : son CSS généré pose taille et gras ENSEMBLE — sonal.mjs — pas de gras stocké, il
        découle de la taille) ; sur un chevauchement la plus GRANDE l'emporte (les tailles ne
        s'empilent pas comme les soulignés box-shadow). Le watch `codebook` → refresh existant couvre
        le retaillage en direct.
      → **Affichage des tailles (retour utilisateur)** : le choix « par défaut » du sélecteur affiche
        **16** (la vraie taille du texte : `.editeur` hérite du 16px navigateur — constante
        `TAILLE_TEXTE`, l'éventail `TAILLES` ne re-liste pas le défaut) ; « Aa » devient l'EN-TÊTE de
        la colonne (ligne `.entete-liste` = clones `.fantome` invisibles d'une ligne → mêmes largeurs,
        « Aa » pile au-dessus du sélecteur) ; dans l'onglet Thématique, le NOM du thème est rendu à sa
        taille choisie (`.theme-nom` font-size inline) — l'onglet donne à voir le rendu du codage.
      → **Amorçage RÉVISÉ (demande utilisateur, fin de la démo produit)** : un corpus neuf naît
        **VIDE** — AUCUN entretien (l'« Entretien Karine » des étapes 0/1 était un vestige de démo) et
        codebook = le SEUL bloc « Pondérations » par défaut de SonalPi, aux MÊMES codes ET intitulés
        que lui (cat_001 parent « Pondérations » SANS effet, couleur `#ffffff` = soulignement
        invisible ; cat_002..004 « ★★★ Très important / ★★☆ Assez important / ★☆☆ Important » dont
        l'effet est la TAILLE seule — gras inclus — décroissante 24/22/20). Rendu des noms dans
        l'onglet Thématique : taille UNIFORME (décision utilisateur, revient sur l'aperçu à-la-taille
        — l'effet taille+gras ne s'applique qu'au marquage dans le texte). Plus de Famille/Travail/Lieu en production. La baseline de démo
        (e1 Karine + 3 thèmes démo + Pondérations en cat_004..007) DÉMÉNAGE dans
        **`test/seedDemo.ts`** (`ecrireSeedDemo(dirCorpus)`, IDEMPOTENT — ⚠ ne jamais écraser un
        corpus existant : les e2e de persistance RELANCENT l'app sur le même dossier), écrite par
        `storeNeuf` (unit) et par `lancer` (e2e, dans le corpus par défaut du profil) AVANT
        l'ouverture — les specs existantes gardent leurs ids/contenus historiques. multi-corpus :
        dirB pré-peuplé (corpus existant), dirC VIERGE → prouve le nouvel amorçage dans la vraie app
        (0 carte + 4 thèmes Pondérations au panneau). ⚠ import `.sonal` : les codes qui collisionnent
        avec un codebook existant → l'existant fait foi (règle n°3, inchangé) — un corpus NEUF
        n'occupe plus que cat_001..004.
      → **Suppression d'entretien durcie (questions utilisateur sur « qu'est-ce que ça supprime »)** :
        (1) `supprimerEntretien` déplace AUSSI les médias `audio/<id>.*` (audio assigné + PNG d'onde)
        en `corbeille/` — plus d'orphelins sur disque, un futur entretien de même id n'hérite d'aucun
        audio ; la sémantique reste « corbeille, jamais d'effacement » (le json + `.bak` déménagent,
        le membership est le seul index touché ; la corbeille n'est jamais vidée par l'app) ;
        (2) le ✕ d'une carte ouvre désormais une bannière de CONFIRMATION (idiome D-S10) au lieu de
        supprimer immédiatement — `entretienASupprimer`/`demander`/`confirmerSuppressionEntretien`
        (orchestration sonal.ts). `.confirm-suppr`/`.confirm-actions` promus dans base.css (3 vues :
        Corpus, Entretien-locuteurs, EditionThemes — ⚠ la bannière locuteurs était devenue SANS style
        quand la modale thèmes a emporté la copie scoped d'Entretien.vue). Supprimer un CORPUS entier
        reste hors app (un dossier = un corpus → explorateur de fichiers) ; par contre l'Accueil gagne
        un ✕ par récent = retirer le RACCOURCI de la liste (IPC `corpus:retirerRecent`, settings.json
        du profil — le dossier sur disque n'est jamais touché), et la carte « Ouvrir un corpus… »
        explicite qu'elle sert aussi à CRÉER un corpus (nouveau dossier dans le picker).
      → **Résumé thématique sur les cartes Corpus (parité SonalPi, demande utilisateur)** : coder un
        passage COLORE la bande de l'entretien à l'endroit correspondant. Mécanisme SonalPi analysé
        (`resumeGraphique`/`dessinResumeGraphique`, gestion_corpus.js) et reproduit : la position est
        la PROPORTION DANS LE TEXTE (rang/longueur — PAS le temps audio ; approximation assumée,
        identique à SonalPi), le calque est HTML par-dessus l'image d'onde (spans `.xtr-graph`
        left/width en %), un chevauchement s'empile en DÉGRADÉ VERTICAL à bandes égales, les thèmes
        BLANCS ne peignent pas (le « sans effet »), les pondérations (taille > 16, règle SonalPi)
        posent une bordure noire en bas, un CLIC sur un segment rouvre l'entretien à cet endroit
        (`ouvrirAuSegment` = ouvrirEntretien + allerAuTexte). Implémentation : REQUÊTE pure
        `resumeThematique(data)` dans shared/corpus/requetes.ts (codages → coordonnée texte via
        `pmVersTranches`, balayage de bornes en segments élémentaires comme les décorations, fusion
        des adjacents identiques, orphelines exclues ; type `SegmentThematique {deb, fin, pos, codes}`
        en %) + `resumesThematiques()` au store (scan) → IPC → `useCorpus.resumes`, rafraîchi avec les
        usages (ouverture + après-sauvegarde). Calque translucide (opacity .45) : l'onde reste lisible
        sous la couleur. L'ONDE elle-même passe au GRIS NEUTRE SonalPi (rgb(165,165,165), fill 6 % —
        la couleur est réservée au calque).
      → **Rév. (retours utilisateur : « pas côté entretien » + « toujours vert »)** : (1) la BANDE du
        lecteur (écran Entretien) porte aussi le calque — `resumeOuvert` recalculé LIVE dans
        `rafraichir()` (même requête pure, sur le modèle en session : coder se reflète immédiatement),
        et les bornes texte des segments sont RE-PROJETÉES EN TEMPS via les ancres (`tempsAuTexte` sur
        `pos`/`posFin`, nouveau champ du segment) — la bande est un axe temporel (le curseur y vit),
        donc mieux que l'approximation texte de SonalPi ; sans ancre, repli % texte. Peinture partagée
        `peintureSegment(codes)` (useCorpus) entre cartes et bande ; calque de bande décoratif
        (pointer-events none — le clic reste un seek). (2) le PNG d'onde persisté ne se régénérait que
        s'il était ABSENT → l'ex-onde verte restait. `regenererOndesManquantes()` (sonal.ts) régénère
        EN FOND, à l'ouverture du corpus, toute onde manquante (`void` — ne bloque pas l'arrivée à
        l'écran) ; la migration après un changement de RENDU est MANUELLE et simple (décision
        utilisateur — un nom versionné a été essayé puis retiré comme sur-ingénierie) : supprimer les
        `audio/<id>.png` → régénérés en gris au prochain lancement.
      → **150 unit + 46 e2e verts** (unit : segments %/pos/fusion/chevauchement/orpheline ; e2e :
        coder → la carte porte un `.xtr-graph` titré/coloré calé à 0 %, clic → l'entretien rouvre sur
        le texte). Anciennement : **146 unit + 45 e2e** (unit : taille importée/exportée/retirée au store + seed
        Pondérations vérifié + médias→corbeille ; e2e : `suppression.e2e.ts` — Annuler ne fait rien,
        confirmer → carte disparue + json en corbeille/ ; adaptés à
        la modale — sélecteurs `li[data-nom="…"]`, les noms sont des inputs donc hasText ne les voit
        pas — + nouveau : poser 24 → `.annot` ET `.theme-nom` portent `font-size:24px`, revenir au
        défaut → plus de font-size ; helpers `ouvrirEditionThemes`/`fermerEditionThemes`).
