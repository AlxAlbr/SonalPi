# Spec des formats `.crp` et `.sonal`

> **But (PlanPoo Phase 0)** : geler le contrat des fichiers utilisateurs. C'est *ce que les
> classes devront produire à l'identique* après refacto. La non-régression de ces formats est
> le principe directeur n°1.
>
> **Source de vérité** : la logique de format vit dans les modules ES `src/domain/corpus.mjs`
> (`parseCorpus`/`serializeCorpus`) et `src/domain/sonal.mjs` (`parseSonal`), consommés par le
> renderer (via `window.SonalDomain`) **et** par les tests. Les tests `test/corpus.test.mjs` et
> `test/sonal.test.mjs` exécutent ce **vrai code** sur des **fixtures isolées et immuables**
> (`test/fixtures/`, copie figée jamais éditée par l'appli) et verrouillent les invariants par
> golden master (`test/golden/`). Le golden corpus ignore les métadonnées volatiles
> (`lastModified`/`lastAccess`/`fileSize`).

---

## 1. `.crp` — fichier Corpus

**Forme** : un objet JSON sérialisé sur **une seule ligne** :

```js
JSON.stringify({ tabThm, tabEnt, tabVar, tabDic, tabAnon })
```

Produit par [gestion_corpus.js:947](../modules/gestion_corpus.js#L947) (`sauvegarderCorpus`).
Les clés racine sont exactement : **`tabThm`, `tabEnt`, `tabVar`, `tabDic`, `tabAnon`**.

> ⚠️ L'ordre des clés n'est pas garanti par le format (c'est du JSON). Le golden applique un
> tri canonique des clés ; ne pas considérer l'ordre comme un invariant. Les **tableaux**, eux,
> conservent leur ordre.

### `tabThm[]` — codebook (catégories)
Champs : `code` (`cat_XXX`), `nom`, `couleur` (hex ou ""), `taille` (nombre ou ""),
`cmpct` (bool), `rang` (string : "0" racine, "1" enfant…), `act` (bool).

### `tabEnt[]` — entretiens
Champs observés : `id`, `nom`, `notes`, `tabLoc[]` (libellés des locuteurs, index 0 = vide),
`hms` (`HH:MM:SS`), `tabThm[]`, `rtrPath` (nom du `.sonal`), `audioPath`, `imgPath`,
`tabVar[]`, `tabDic[]`, `tabDat[]`, `tabAnon[]`, `lastModified` (timestamp **ou** ISO),
`fileSize` (`"0.02 Mo"`), `lastAccess` (ISO).

### `tabVar[]` — variables (EAV, définitions)
`v` (id numérique), `lib` (libellé), `champ` (`"gen"` = général / `"loc"` = par locuteur),
`priv` (string `"true"`/`"false"`).

### `tabDic[]` — modalités (dictionnaire)
`v` (renvoie à la variable), `m` (id modalité, `0` = vide), `lib` (libellé).

### `tabDat[]` — valeurs (EAV, données) — *présent au niveau entretien*
`e` (id entretien, string), `v` (variable), `l` (locuteur : numéro ou `"all"`), `m` (modalité).
> Source de vérité visée (PlanPoo §5) : les **valeurs** (`tabDat`) sont maîtres dans le **`.sonal`** ;
> le `tabDat` au niveau corpus est une **vue calculée** (union des locaux). Les **définitions**
> (`tabVar`/`tabDic`) sont maîtres dans le **`.crp`**.

### `tabAnon[]` — règles d'anonymisation
`entite`, `remplacement`, `occurrences`, `indexCourant`, `matchPositions[]`
(`{start, end, isException, isNonTraite}`), et compteurs d'état
`indexCourant_anon`/`_exc`/`_non`. Champs additionnels selon contexte : `source`
(`"Global"`/`"Entretien"`), `presentMaisNonAnonymise`, `nbOccurrencesNonTraitees`.

---

## 2. `.sonal` — fichier Entretien

**Forme** : un document **HTML complet** (`<!DOCTYPE html>`). L'en-tête `<style>` contient les
classes `.cat_XXX` dérivées du codebook (taille/graisse/couleur). Le corps porte le texte
segmenté dans `#segments`, structuré en spans.

### 2.1 Segments — `span.lblseg`
Un segment = une prise de parole. Attributs :

| Attribut | Sens |
|---|---|
| `data-rksg` | rang du segment (ordre) |
| `data-deb` / `data-fin` | bornes temporelles (secondes, ex. `4.317`) |
| `data-loc` | id du locuteur (renvoie à `tabLoc`) |
| `data-statut` | `deb` / `fin` (début/fin de tour de parole) |
| `data-nomloc` | nom du locuteur (présent sur la 1re ligne du tour) |

Classes additionnelles : `sautlig`, `ligloc` (mise en forme).

### 2.2 Fragments / Tokens — `span[data-rk]`
**Fragment** = *run de tokens consécutifs au même formatage* (≠ un mot, cf. MODELE_OBJET §2).
Attributs : `data-rk` (rang — désigne le **Token**, atome jamais matérialisé seul),
`data-sg` (segment d'appartenance), `data-len` (longueur).

### 2.3 Trois calques orthogonaux sur les fragments
Un même fragment peut cumuler n'importe quelle combinaison (cf. classes observées
`cat_008 cat_007 anon debsel finsel`) :

1. **Codage** : classe(s) `cat_XXX` (combinables).
2. **Anonymisation** : classes `anon` / `anon-exception` + `data-pseudo` (le pseudonyme affiché)
   + `data-anon-nt` (marqueur). **Asymétrie à 3 états à préserver** (MODELE_OBJET §5) :
   - *anonymisé* → `class="… anon"` + `data-pseudo`
   - *exception* → `class="… anon-exception"` (pas de pseudo)
   - *présent-non-anonymisé* → **aucun span dédié** (le golden le documente par omission)
3. **Commentaire** : `data-obs` (texte), `data-auth` (auteur), `data-finobs` (borne de fin)
   — annotation persistée et autonome (Phase 5). À distinguer du `commentaire` d'un item de Recueil.

### Invariants verrouillés par le golden (`src/domain/sonal.mjs`, testé via jsdom)
- liste des **segments** `{rksg, deb, fin, loc, statut, nomloc}` triée par `rksg` ;
- **locuteurs** distincts `(loc, nomloc)` ;
- **codages** : comptage par classe `cat_XXX` ;
- **anon** : `{rk, pseudo, type: anon|anon-exception, nt}` (asymétrie 3 états) ;
- **commentaires** : `{rk, auteur, obs, finobs}`.

---

## Régénérer les golden après un changement *intentionnel* de format

```bash
npm run test:update     # réécrit test/golden/*.json
git diff test/golden/   # relire et valider le diff avant de commiter
```

Sans `UPDATE_GOLDEN`, `npm test` compare et **échoue** sur toute divergence — c'est le filet.
