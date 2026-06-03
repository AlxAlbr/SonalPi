# Anonymisation / Pseudonymisation — Architecture et conventions

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `modules/Anonymisation/tableau_base.js` | Logique principale du tableau d'anonymisation par entretien |
| `modules/Anonymisation/tableau_global.js` | Vue globale corpus (toutes les paires de tous les entretiens) |
| `modules/Anonymisation/import_export.js` | Export/import JSON de la table de correspondance |
| `modules/Anonymisation/help.js` | Modal d'aide utilisateur (UI uniquement) |
| `modules/tests_affichage_anonymisation.js` | Tests unitaires (console navigateur) |
| `main.js` ligne ~31 | Déclaration de `tabAnon` global (main process Electron) |
| `preload.js` lignes 97-98 | Exposition IPC : `getAnon()` / `setAnon()` |

---

## Modèle de données

### Structure d'une paire d'anonymisation

```js
{
  entite: "Jean Dupont",         // texte original à remplacer
  remplacement: "PERSONNE_1",    // pseudo
  occurrences: 3,                // nombre d'occurrences substituées dans le texte
  indexCourant: 0,               // index interne (usage interne)
  matchPositions: [],            // positions des matches (usage interne)
  source: "Global" | "Local",   // origine de la règle
  existeLocalement: true|false,  // présente dans le tabAnon local de l'entretien
  presentMaisNonAnonymise: true  // exception : entité connue mais non substituée
}
```

### Deux niveaux de stockage

| Niveau | Stockage | Accès |
|---|---|---|
| **Global** (corpus) | `tabAnon` dans `main.js` (main process) | `window.electronAPI.getAnon()` / `setAnon()` |
| **Local** (entretien) | `ent.tabAnon` dans `tabEnt[i]` | `window.electronAPI.getEnt()` puis `ent.tabAnon` |

La fusion des deux niveaux se fait via `fusionnerTabAnon(tabAnonGlobal, tabAnonLocal)` dans `tableau_base.js`. Le niveau local peut surcharger le global (même clé `entite|remplacement`).

---

## Flux principal (entretien individuel)

1. **Sélection** dans le texte → entité ajoutée automatiquement à `window.tabAnon` sur la dernière ligne vide
2. **Saisie du pseudo** dans le champ "Entité de remplacement" → `Entrée` → `gererEntrePseudo(idx)`
3. **Validation** → `validerLigneAnon(idx)` → `appliquerAnonymisationPour(idx)` → substitution dans les spans `[data-rk]`
4. **Affichage** → `affichTableauAnon()` rerender le tableau UI
5. **Sauvegarde** → appelée explicitement ; le tabAnon local est stocké dans `ent.tabAnon`

### Exceptions

- Clic sur un span anonymisé → menu contextuel → "⊘ Ajouter une exception"
- L'occurrence est marquée `presentMaisNonAnonymise = true` et reste visible dans le texte
- Annulation : même clic → "Supprimer l'exception"

---

## Flux global (vue corpus)

- `reconstituerTabAnonGlobal(entretiens)` : reconstruit le `tabAnon` global à partir de tous les `ent.tabAnon` (+ préserve les entrées ajoutées manuellement au global)
- `verifierEtAfficherEtatEntite(entite, pseudo, tabEnt)` : vérification **paresseuse** d'une seule paire (déclenchée par le bouton 🔍 d'une ligne), via `verifierEtatAnonymisation()` par entretien puis `mettreAJourLigneAvecEtats()`
- Les états sont : `'anonymisee'`, `'non-anonymisee'`, `'exclue'`

> Historique : `demarrerVerificationGlobale()` / `verifierEtAfficherEtatsAnonymisations()` (vérification globale de toutes les paires en parallèle) ont été **supprimées** sur `PseudoGlobal` — sans appelant depuis l'adoption de la vérification paresseuse par bouton 🔍.

### Propagation global ↔ local (montée / descente d'une règle)

Une règle créée dans un entretien ne se propage **pas** en push direct : chaque entretien va **chercher** le global à son ouverture. C'est un cycle à deux étages, déclenchés à deux moments.

**Montée (local → global)** — au moment où l'entretien source est **enregistré** :
- `sauvegarderModifsEnt()` (fermeture + « Oui », ou sauvegarde explicite) → `miseàjourEntretien(rkEnt)` →
  `synchroniserTabAnonGlobal(getAnon(), tabAnonNettoye)` → `setAnon(...)`.
- `synchroniserTabAnonGlobal()` (`gestion_corpus.js`) **ajoute** la paire `entité|pseudo` au global *si la clé n'existe pas déjà* (marquée `source: 'Entretien'`) ; elle n'écrase jamais → le global **accumule**.
- Voie secondaire : ouvrir la **page Pseudos** déclenche `reconstituerTabAnonGlobal(tabEnt)`, qui rebâtit le global depuis tous les `ent.tabAnon` (à jour en mémoire dès l'anonymisation via `sauvegarderTabAnonEnt()` → `setEnt`).

**Descente (global → local)** — à l'**ouverture** d'un autre entretien :
- `afficherWhisPurge()` → `window.tabAnon = fusionnerTabAnon(getAnon(), ent.tabAnon)`.
- Les paires du global sont injectées avec `source: 'Global'`. Tant qu'elles ne sont pas validées localement (`existeLocalement` absent), elles restent **en attente** = **propositions**.
- `detecterOccurrencesToutesLesPaires()` repère ensuite leurs occurrences dans le texte → affichées **non traitées** (`data-anon-nt`), à valider ou mettre en exception. **Aucune application automatique.**

**Conséquences pratiques :**
- Une règle d'un entretien A apparaît dans B **à la prochaine ouverture de B**, *à condition que A ait été enregistré* (sinon la règle reste locale à A — sauf passage par la page Pseudos qui reconstruit le global depuis la mémoire).
- Garde-fou (`gestion_entretiens.js`, `afficherWhisPurge`) : à la sauvegarde, les paires `source === 'Global' && !existeLocalement` sont **exclues** du `ent.tabAnon` local, pour éviter qu'à la réouverture une proposition non validée soit traitée comme locale et appliquée automatiquement.

### Page dédiée « Pseudos » (branche PseudoGlobal)

Le bouton **« Pseudos »** (`#btn-anon-globale`, `onclick="affichAnonGen()"`) ouvre une **page dédiée
plein écran** (et non un onglet). `affichAnonGen()` construit un overlay `#divAnonGenPage`
(classe `.fondtabdat`) **à deux zones** séparées par un curseur déplaçable
(`.anon-page-resizer`, câblé par `initAnonPageResizer`, largeur mémorisée dans `localStorage`) :
- **gauche** `#fond_anon_corpus` (`.anon-page-gauche`) : table des pseudonymes — **1/3 par défaut** ;
- **droite** `#fond_verif_anon` (`.anon-page-droite`) : vérification / occurrences par entretien — **2/3 par défaut**.

Ces `id` sont **identiques** à ceux de la version « onglet » (`TestOrgaOngletCorpus`) afin que toute
la logique de rendu (`mettreAJourLigneAvecEtats`, `verifierEtAfficherEtatEntite`,
`afficherOccurrencesEnAccordeon`) fonctionne sans modification. `hideAnonGen()` retire l'overlay.

- **3 pastilles** par ligne (couleurs cohérentes) = `.btn-nav-cat-anon` (vert), `.btn-nav-cat-exc`
  (gris), `.btn-nav-cat-non` (orange) → anonymisée / exception / **non traitée**.
- **Exceptions au niveau du corpus** : `marquerExceptionOccurrencesSpecifiques()` /
  `retirerExceptionOccurrencesSpecifiques()` (une case blanche **non traitée** ≠ une exception).

### Entités non traitées (entretien)

- Marquées par l'attribut **`data-anon-nt`** sur les spans (classe runtime, **non persistée** :
  retirée dans `compactHtml()` de `gestion_fichiers.js`).
- Clic → `showMenuNonTraite()` (au lieu de `showMenuException()`) ; aiguillage dans
  `segmentation.js` (`clicSeg`) via `match.isNonTraite`.
- **Curseur de navigation par type** : `clicCompteur(btn, idx, cat)` avec `cat ∈ {anon, exc, non}`
  (`tableau_base.js`) — navigue dans l'entretien occurrence par occurrence d'un type donné.

### Navigation entretien ↔ corpus (IPC)

- **entretien → corpus** : menu « ↗ Voir au niveau du corpus » → `allerVueCorpus(idxPaire, matchIdx)`
  → `electronAPI.demandeVueCorpus({entite, pseudo, rkEnt, spanId})` → `main.js` marque
  `entWindow._navRetourCorpus`, ferme la fenêtre, puis émet `ouvrir-vue-corpus-anon` dans `closed`
  → `index.html` appelle `focaliserOccurrenceCorpus(payload)` (ouvre la page, défile, flash `.nav-highlight`).
- **corpus → entretien** : flèche `↗` d'une occurrence → `electronAPI.editerEntretien(entIndex, {entite, pseudo, spanId})`
  → `main.js` stocke `entWindow._navTarget` → `edition_entretien.html` le récupère (pull) via
  `getNavTarget()` et focalise le span `[data-rk=spanId]` (MutationObserver sur `#segments`).
- À la fermeture sans navigation : `entretien-ferme-refresh-anon` → rafraîchit la page Pseudos si ouverte.

> **Note de portage** : sur `PseudoGlobal`, les boutons « Base de données » et « Pseudos »
> restent des **pages dédiées** (pas d'onglets). Les modifs « filtres Base de données »
> (`gestion_data.js`) de `TestOrgaOngletCorpus` n'ont **pas** été importées.

---

## DOM

- Les mots du texte sont dans des spans avec l'attribut `data-rk`
- La recherche d'entités passe par `tokenizeCommeSegmentation()` (même logique que le module de segmentation)
- `entitePresenterDansDOM(entite)` vérifie la présence sans modifier le DOM
- `detecterOccurrencesToutesLesPaires()` scanne toutes les paires en une passe (optimisé : construit un `Set` des mots présents une seule fois)

---

## Import / Export

- **Export** : `exportTableCorrespondance()` → JSON `[{ entite_init, entite_pseudo }, ...]`, uniquement les lignes avec `occurrences > 0`
- **Import** : `importTableCorrespondance(files)` → accepte plusieurs fichiers JSON ; gestion des conflits si une entité a déjà un pseudo différent
- En cas de conflit : l'utilisateur choisit entre garder l'existant, utiliser l'import, ou "⊘ Pas d'anonymisation"

---

## Points d'attention

- **Ne pas confondre** `tabAnon` global (main process) et `window.tabAnon` (renderer, entretien courant)
- `nettoyerPairesOrphelines()` supprime les paires dont l'entité n'existe pas dans le texte courant, **sauf** : lignes vides, `presentMaisNonAnonymise === true`, règles globales non encore appliquées localement (`source === 'Global' && !existeLocalement`)
- La clé de déduplication est toujours `entite.toLowerCase()|remplacement.toLowerCase()`
- `autoGrowTextarea()` est appelé sur les textareas du tableau pour adapter leur hauteur


## TODO
plan_filtres_pseudos : voir si je fais la phase 1 élargie (pour le reste, c'est fait)
A faire : plan_collab_pseudos
