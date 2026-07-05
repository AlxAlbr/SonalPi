# BILAN SonalAsynchro — le set minimum, et après

> Étape 7 de [DEMARRAGE.md](DEMARRAGE.md). Synthèse de ce que SonalAsynchro livre, de ce
> qui a été vérifié (et comment), des **écarts de parité assumés** avec SonalPi,
> et de la **décision de suite**.

## 1. Ce que le set minimum livre

SonalAsynchro est le premier incrément **produit** de la réécriture asynchrone (plan B) :
architecture propre — **modèle = vérité, DOM = projection, ProseMirror sans Yjs,
fichiers = I/O** — sur laquelle un chercheur fait un vrai (petit) travail SonalPi.

| Fonction | État | Où |
|---|---|---|
| Corpus local (dossier `corpus.json` + `entretiens/*.json`) | ✅ | étape 2 |
| Import `.sonal` / `.srt` / `.vtt` (sas unique) | ✅ | étape 3 |
| Édition WYSIWYG ; annotations qui suivent le texte (remap) | ✅ | étapes 0-1 |
| Thèmes : CRUD codebook, couleur, codage, extraits | ✅ | étape 5 |
| Locuteurs : gouttière, attribution, renommage par référence, scission | ✅ | étape 4 |
| Données EAV : variables/modalités, saisie gen/loc, matrice-requête | ✅ | étape 6 |
| Persistance atomique + `.bak` par session + fraîcheur/version | ✅ | étape 2 |
| Export `.sonal` recomposé (ouvrable dans SonalPi) | ✅ | étape 3 |

## 2. Ce qui a été vérifié

- **Automatique** : **67 tests unitaires** (moteur de remap, mapping char↔PM,
  import/export golden, store fichiers, CRUD codebook/EAV, couleurs) +
  **24 e2e Playwright-Electron** (dont le **parcours complet** bout-en-bout :
  `parcours.e2e.ts`). Typecheck + build verts.
- **Manuel** (le seul non automatisable) : réouverture d'un export dans **SonalPi**
  — fait, OK après deux correctifs (ouvrir via *importer un entretien*, pas
  *ouvrir corpus* ; couleur de codage synthétisée à l'export). Cf. [PARITE.md](PARITE.md).

## 3. Écarts de parité ASSUMÉS avec SonalPi

Ce ne sont pas des bugs : ce sont des choix (souvent des simplifications du modèle
v2) dont on accepte la conséquence sur le round-trip `.sonal`.

| Écart | Nature | Statut |
|---|---|---|
| **Fragmentation `.sonal` recomposée** aux frontières d'annotations | le nombre de `<span data-rk>` peut différer ; les **comptes par catégorie sont préservés** (golden) | assumé (MODELE_OBJET2 : le `Fragment` est démis) |
| **`data-statut` (deb/fin de tour) non ré-émis** | c'est un dérivé (run de blocs de même `loc`) ; SonalPi le recalcule | assumé (MODELE_OBJET2 §4) |
| **EAV créées dans SonalAsynchro non exportées** vers `.sonal` | variables/valeurs *modélisées* (corpus.variables, valeursGen/Loc) pas encore réémises en tabVar/tabDic/tabDat ; l'export réémet le **pass-through `legacy`** (EAV *importées* préservées) | **gap révélé par l'étape 7** — à traiter (option B ci-dessous) |
| **Anonymisation** : pseudo sur l'annotation (`data-pseudo`) ; règles en `legacy` | pas d'UI ; modèle prêt (`type:'anon'`, logique matching POC2 vendorée) | différé (hors set minimum) |
| **Couleur de codage synthétisée** si non choisie (angle d'or) | l'export porte une couleur ; SonalPi l'affiche | assumé |
| **Audio / timing** (`deb`/`fin`) portés mais inertes | pas de synchro média | différé (post-POC) |
| **Multi-corpus** : un seul dossier fixe (`userData/corpus`) | store déjà paramétré par `dir` | différé (avec les verrous) |

## 4. La décision de suite

Le set minimum est **complet et prouvé**. Options, non exclusives :

| Option | Ce que ça ferme | Effort | Risque neuf |
|---|---|---|---|
| **A — Anonymisation (UI)** | la dernière grande fonction SonalPi manquante ; modèle + matching déjà là | moyen | faible |
| **B — Round-trip EAV complet** | l'écart de parité le plus visible (§3) : exporter les variables/valeurs modélisées + importer tabVar/tabDic/tabDat dans le modèle (fin du pass-through `legacy`) | moyen | faible |
| **C — Multi-utilisateur (verrous) + multi-corpus** | le paradigme asynchrone SonalPi (dossier partagé, verrou par entretien) + « ouvrir un corpus… » | moyen-élevé | moyen (concurrence fichiers) |
| **D — Audio / timing** | la couche ancrée `deb`/`fin` sur l'audio | élevé | élevé (risque neuf) |
| **E — Bascule synchrone (Yjs)** | valider la couture de réversibilité DEMARRAGE3 : remplacer le conteneur d'état par des ydoc | élevé | élevé (change de cible) |

> **Recommandation.** Pour *finir proprement la parole donnée du set minimum*,
> **B** (round-trip EAV) est le plus honnête : l'étape 7 a montré que les données
> saisies dans SonalAsynchro ne repartent pas dans le `.sonal`. Ensuite **A** (anonymisation)
> complète le tableau fonctionnel SonalPi. **C/D/E** sont des paris plus lourds à
> tenir en connaissance de cause. Décision : à l'utilisateur.
