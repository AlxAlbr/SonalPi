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
| D-S11 ✅ | Table de données éditable (vue dédiée, à la SonalPi) — **FAIT** | La table = la **matrice rendue éditable** (projection, pas une table stockée : valeurs toujours chez leur propriétaire `valeursGen`/`valeursLoc` ; re-requête après édition, pas de cache). Éditer une cellule = **écriture ciblée `poserValeur(entretienId, cible, idVar, idMod)`** (transform pur sur `EntretienFichier` dans `shared/` + I/O au store). **Coexistence résolue par le verrou entretien** (granularité déjà en place) : la **ligne de l'entretien TENU est en lecture seule** → la table n'écrit jamais dans un entretien ouvert (un seul chemin d'écriture, zéro double-vérité). Mono-utilisateur : « tenu » = `ouvertId`. Corpus partagé (plus tard) : « tenu » = verrouillé par quiconque → même UI, source du lock additive. Vue dédiée = un état de vue + bouton. `.bak` non roté pour une valeur scalaire (trop granulaire) |
| D-S12 | Décomposition UI **par scope de données** (composables d'abord) | On découpe l'UI par **périmètre de données**, PAS par écran. Trois scopes : **profil** (dossier courant, récents), **corpus** (membership léger + codebook + variables + **requêtes** matrice/usages), **entretien** (le SEUL entretien ouvert : éditeur + modèle). Règle : **1 scope = 1 composable** (`useProfil`/`useCorpus`/`useEntretien`), consommé par plusieurs vues (`Corpus.vue` **et** `Database.vue` partagent `useCorpus`). Isomorphe au stockage (`corpus.json` + fichiers par entretien) et à la logique (`shared/corpus.ts` vs `model/entretien.ts`). **Principe de charge** : le renderer ne tient JAMAIS tous les entretiens — working set = définitions corpus (petit) + membership (métadonnées, pas le contenu) + **un** entretien ouvert + résultats de requêtes transitoires ; tout transverse reste dans le **main** (scan disque → projection). Jamais de cache dans le renderer (« requête, pas cache ») ; l'indexation éventuelle irait dans le **store**, invisible aux composants. **Composables d'abord, composants ensuite** ; pas de Pinia tant que des composables suffisent |
| D-S13 | **Invariant audio** (unité de surlignage & timecodes des blocs scindés) | L'unité de surlignage audio est **le bloc**, jamais le tour (le tour peut être grand ; le bloc = un cue SRT ou un fragment de cue). **Constat** : même SonalPi n'a aucun timecode réel sous le cue — ses positions par mot sont une **interpolation linéaire** fabriquée à la scission (`SplitSeg`). **Choix SonalAsynchro** : ne persister QUE les timecodes **mesurés** (bornes de cue) ; les bornes des blocs scindés restent **`null` en modèle** (D-S5) — le format `.sonal` ressort un `deb`/`fin` vide, round-trip préservé. La borne manquante est **dérivée à la lecture** (S6), par une fonction pure : marcher à gauche jusqu'au dernier `deb` mesuré, à droite jusqu'au prochain `fin`/`deb` mesuré, répartir proportionnellement à la longueur de texte des blocs intermédiaires. **L'interpolation est une dérivation, pas un état stocké** (cohérent « modèle = vérité », « requête, pas cache », comme le *tour dérivé* D-S2). Conséquence pour S4 : la scission « attribuer la sélection » ne touche qu'aux bornes de la sélection → seuls le 1er et le dernier bloc couverts peuvent recevoir un timecode `null` ; les blocs intérieurs sont des cues entiers et gardent leurs timecodes mesurés. **S4 ne code aucune logique audio** ; il se contente de respecter cet invariant (nulls aux fragments internes). |

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
  (S5) ; bouton retour au corpus. Le panneau debug (Modèle) reste, en dev.
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
  premier bloc de chaque tour (style `ligloc`), le texte reprend toute la largeur. Teinte pâle par
  locuteur conservée (repère) — à retirer si elle s'avère du bruit.
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
- [ ] S5 : journal d'actions (10 dernières, annulation sélective, D-S3/D-S9)
- [ ] S6 : audio — copie dans le corpus (D-S4), lecteur, synchro v1, seek par tour
