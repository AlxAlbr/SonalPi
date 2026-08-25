# Plan — Onglet Notes : catégories au niveau corpus

> Les **catégories de note** (post-collecte, résumé, réflexion, générale + catégories
> personnalisées nom + couleur) sont une typologie transverse : elles doivent vivre
> **au niveau du corpus**, partagées par tous les entretiens (comme les thèmes/codebook
> et les variables). Les **notes** restent **par entretien** (comme les locuteurs) et
> référencent un `categorieId` du corpus.
>
> Ce plan **corrige** la première version où les catégories ont été modélisées par
> entretien. Le code actuel (déjà implémenté et testé) porte `categoriesNote` sur
> `EntretienFichier` + `PayloadEntretien` et les gestes dans `useEntretien`. Il faut
> **déplacer** ce périmètre vers le corpus sans toucher au reste (notes, surlignage,
> vues cartes/texte, migration V1 du texte libre).

## Décision de suppression : **(b) refus si utilisée** (parité thèmes)

Quand on supprime une catégorie référencée par au moins une note (dans n'importe quel
entretien du corpus), on **refuse** la suppression et on affiche le compte d'usages,
comme `supprimerCategorie` le fait pour les codages de thème. L'utilisateur doit
d'abord ôter la catégorie de ses notes (la réassigner) avant de la supprimer.

- Implique un **scan des entretiens** du corpus (lecture des fichiers `notes[].categorieId`).
- On réutilise `chargerEntretiens()` (`corpusStore.ts:503`) — déjà utilisé par
  `compterUsagesCategorie`/`usagesParCategorie` pour les codages.

## État actuel (déjà en place, à déplacer)

Implémenté et validé (typecheck + build + 544 tests) :

- `src/shared/format.ts` : types `NoteCategory`, `Note` ; `categoriesNote?` **sur
  `EntretienFichier` et `PayloadEntretien`** (à RETIRER) ; `notes?` sur les deux (à garder).
- `src/shared/entretien/notes.ts` : `CATEGORIES_NOTE_DEFAUT`, `normaliserCategoriesNote`,
  `normaliserNotes`, `prochainRang`, `renumeroterRangs`, `genIdNote`, `genIdCategorieNote`.
- `src/renderer/notes/sanitiser.ts` : `sanitiserCorpsNote`, `corpsNoteEnTexte`, `echapperTexte`.
- `src/renderer/import/importSonal.ts` : migre le `<textarea>` V1 en une note « générale »
  (rang 0, privée, sans date) ; **écrit aussi `categoriesNote` dans le payload** (à RETIRER).
- `src/renderer/composables/useEntretien.ts` : refs `notes` + `categoriesNote` + `brouillonNote`
  (réactif) ; gestes notes + gestes catégories ; `donneesExport` inclut les deux.
- `src/renderer/components/Entretien.vue` : onglet Notes complet (cartes/texte, modale,
  volet catégories, surlignage `<mark>`, glisser-déposer).
- `test/notes.test.ts` : 18 tests (normalisation, rangs, sanitisation, migration).

## Cible

| Périmètre | Localisation | Modèle |
|---|---|---|
| Catégories de note (`NoteCategory`) | **`corpus.json`** → `CorpusFichier.categoriesNote?` | comme `codebook`/`variables` (définitions corpus) |
| Notes (`Note`) | **entretien** → `EntretienFichier.notes?` | comme `locuteurs` (donnée par entretien) |
| Persistance des catégories | **store corpus** (IPC transactionnelle) | comme `ajouterCategorie`/`supprimerCategorie` |
| Exposition UI | `useCorpus` → `...corpus` (sonal.ts) | l'entretien les consomme en lecture |

## 1. Format — `src/shared/format.ts`

- **Retirer** `categoriesNote?: NoteCategory[]` de `EntretienFichier` et `PayloadEntretien`
  (chercher `categoriesNote` dans ce fichier : 2 occurrences à supprimer).
- **Ajouter** sur `CorpusFichier` (après `paramsAnon?`, ~ligne 130) :
  ```ts
  /** Catégories de note : typologie partagée par tout le corpus (comme le
   *  codebook). Champ ADDITIF optionnel : absent d'un corpus existant →
   *  normalisé en bacs par défaut à la lecture ; pas de bump. */
  categoriesNote?: NoteCategory[]
  ```
- `Note` et `NoteCategory` restent dans ce fichier (déjà déclarés).
- `notes?: Note[]` reste sur `EntretienFichier`/`PayloadEntretien` (inchangé).

## 2. Logique partagée — `src/shared/entretien/notes.ts`

- Garder `CATEGORIES_NOTE_DEFAUT` (les 4 bacs, ids stables `ncat_*`).
- Garder `normaliserCategoriesNote` (sert au corpus à la lecture).
- Garder `normaliserNotes`, `prochainRang`, `renumeroterRangs`, `genIdNote`, `genIdCategorieNote`.
- **Ajouter** un helper de comptage (pur, prend une liste de `Note[]`) :
  ```ts
  /** Nombre de notes référençant `categorieId` parmi les entretiens fournis. */
  export function compterUsagesCategorieNote(
    entretiens: { notes?: Note[] }[],
    categorieId: string,
  ): number {
    return entretiens.reduce(
      (n, e) => n + (e.notes ?? []).filter((x) => x.categorieId === categorieId).length,
      0,
    )
  }
  ```
  (Le store l'appellera sur `this.datas()` — cf. `compterUsagesCategorie`.)

## 3. Store corpus — `src/main/corpusStore.ts`

Suivre **exactement** le motif des thèmes (lire → appliquer shared → écrire atomique).
Repères : `ajouterCategorie` (l. 522), `modifierCategorie` (l. 530),
`supprimerCategorie` (l. 717), `compterUsagesCategorie` (l. 548),
`ecrireJsonAtomique` + `this.ouvrir()`/`this.ecrire()`.

Ajouter (groupe « Codebook » voisin, ou nouveau sous-groupe « Notes ») :

```ts
// ── Catégories de note (définitions corpus) — lire → muter → écrire ────────
categoriesNote(): NoteCategory[] {
  const c = this.ouvrir()
  return normaliserCategoriesNote(c.categoriesNote)
}
ajouterCategorieNote(nom: string, couleur: string): { id: string; corpus: CorpusFichier } {
  const corpus = this.ouvrir()
  const liste = normaliserCategoriesNote(corpus.categoriesNote)
  const id = genIdCategorieNote()
  liste.push({ id, nom: nom.trim() || 'note', couleur: couleur || '#9e9e9e' })
  corpus.categoriesNote = liste
  this.ecrire(corpus)
  return { id, corpus }
}
renommerCategorieNote(id: string, nom: string): CorpusFichier {
  const corpus = this.ouvrir()
  const liste = normaliserCategoriesNote(corpus.categoriesNote)
  const c = liste.find((x) => x.id === id); if (!c) return corpus
  c.nom = nom.trim() || c.nom
  corpus.categoriesNote = liste; this.ecrire(corpus); return corpus
}
majCouleurCategorieNote(id: string, couleur: string): CorpusFichier {
  // même sillage que renommer, sur c.couleur
}
compterUsagesCategorieNote(id: string): number {
  return compterUsagesCategorieNote(this.datas(), id)
}
supprimerCategorieNote(id: string): ResultatSuppressionCategorie {
  const usages = this.compterUsagesCategorieNote(id)
  if (usages > 0) return { ok: false, usages }
  const corpus = this.ouvrir()
  const liste = normaliserCategoriesNote(corpus.categoriesNote).filter((x) => x.id !== id)
  corpus.categoriesNote = liste
  this.ecrire(corpus)
  return { ok: true, corpus }
}
```

Notes :
- `ResultatSuppressionCategorie` existe déjà (`shared/format.ts`) — le réutiliser
  (`{ ok: true; corpus } | { ok: false; usages: number }`).
- `genId` (helper du store) existe ; on préfère `genIdCategorieNote` (shared/notes) pour
  le préfixe `ncat_` stable — vérifier l'import.
- Imports : `NoteCategory`, `ResultatSuppressionCategorie` depuis `../shared/format` ;
  `normaliserCategoriesNote`, `genIdCategorieNote`, `compterUsagesCategorieNote` depuis
  `../shared/entretien/notes`.

## 4. IPC — `src/main/index.ts` + `src/preload/index.ts` + `src/renderer/env.d.ts`

Repères : `ipcMain.handle('corpus:ajouterCategorie', …)` (l. 450),
`'corpus:supprimerCategorie'` (l. 459), `'corpus:usagesParCategorie'` (l. 462).

`src/main/index.ts` — enregistrer (à côté des autres `corpus:*`) :
```ts
ipcMain.handle('corpus:categoriesNote', () => store.categoriesNote())
ipcMain.handle('corpus:ajouterCategorieNote', (_e, nom, couleur) =>
  store.ajouterCategorieNote(nom, couleur))
ipcMain.handle('corpus:renommerCategorieNote', (_e, id, nom) =>
  store.renommerCategorieNote(id, nom))
ipcMain.handle('corpus:majCouleurCategorieNote', (_e, id, couleur) =>
  store.majCouleurCategorieNote(id, couleur))
ipcMain.handle('corpus:supprimerCategorieNote', (_e, id) =>
  store.supprimerCategorieNote(id))
ipcMain.handle('corpus:compterUsagesCategorieNote', (_e, id) =>
  store.compterUsagesCategorieNote(id))
```

`src/preload/index.ts` — surface `corpus:` (après `supprimerCategorie`, ~l. 99) :
```ts
categoriesNote: (): Promise<NoteCategory[]> =>
  ipcRenderer.invoke('corpus:categoriesNote'),
ajouterCategorieNote: (nom: string, couleur: string): Promise<{ id: string; corpus: CorpusFichier }> =>
  ipcRenderer.invoke('corpus:ajouterCategorieNote', nom, couleur),
renommerCategorieNote: (id: string, nom: string): Promise<CorpusFichier> =>
  ipcRenderer.invoke('corpus:renommerCategorieNote', id, nom),
majCouleurCategorieNote: (id: string, couleur: string): Promise<CorpusFichier> =>
  ipcRenderer.invoke('corpus:majCouleurCategorieNote', id, couleur),
supprimerCategorieNote: (id: string): Promise<ResultatSuppressionCategorie> =>
  ipcRenderer.invoke('corpus:supprimerCategorieNote', id),
compterUsagesCategorieNote: (id: string): Promise<number> =>
  ipcRenderer.invoke('corpus:compterUsagesCategorieNote', id),
```

`src/renderer/env.d.ts` — typer la surface `corpus:` (chercher `ajouterCategorie:`) :
ajouter les 6 signatures correspondantes + importer `NoteCategory`,
`ResultatSuppressionCategorie`.

## 5. Composable corpus — `src/renderer/composables/useCorpus.ts`

Repères : `codebook` ref (l. 32), `majCodebook` (l. 103), `ajouterTheme` (l. 119),
`supprimerTheme` (l. 144), `rafraichirUsages` (l. 109).

- Ref + normalisation à la lecture :
  ```ts
  const categoriesNote = ref<NoteCategory[]>(CATEGORIES_NOTE_DEFAUT.map((c) => ({ ...c })))
  function majCategoriesNote(liste: NoteCategory[]) {
    categoriesNote.value = liste.slice()
  }
  ```
- Dans le `charger`/`appliquerCorpus` (là où `majCodebook(c.codebook)` est appelé), ajouter
  `majCategoriesNote(normaliserCategoriesNote(c.categoriesNote))`. Les corpus existants
  (sans le champ) obtiennent les 4 bacs par défaut en mémoire — écrits sur disque au
  premier geste d'édition (comme `paramsAnon`).
- Gestes (async, IPC, rafraîchissement du ref) :
  ```ts
  async function ajouterCategorieNote(nom, couleur): Promise<string> {
    const r = await window.sonal.corpus.ajouterCategorieNote(nom, couleur)
    majCategoriesNote(r.corpus.categoriesNote ?? [])
    return r.id
  }
  async function renommerCategorieNote(id, nom) { /* IPC → majCategoriesNote */ }
  async function majCouleurCategorieNote(id, couleur) { /* idem */ }
  async function supprimerCategorieNote(id): Promise<string | null> {
    messageCategorieNote.value = null
    const r = await window.sonal.corpus.supprimerCategorieNote(id)
    if (!r.ok) {
      messageCategorieNote.value =
        `« ${nomCategorieNote(id)} » est utilisée ${r.usages}× — retire-la d'abord de tes notes.`
      return null
    }
    majCategoriesNote(r.corpus.categoriesNote ?? [])
    return id
  }
  ```
  + un `messageCategorieNote` ref (comme `messageTheme`) pour l'erreur de suppression.
  + helpers `nomCategorieNote(id)` / `couleurCategorieNote(id)` (fallback « générale »/gris
    si l'id n'existe pas — utile tant que la liste n'est pas chargée ou après suppression).
- Exposer dans le `return` : `categoriesNote`, `majCategoriesNote`, les 4 gestes,
  `nomCategorieNote`, `couleurCategorieNote`, `messageCategorieNote`.

## 6. Orchestrateur — `src/renderer/composables/sonal.ts`

- `...corpus` (return, ~l. 1027) propage déjà `categoriesNote` et les gestes au scope
  global → `Entretien.vue` les récupère via `utiliserSonal()`. **Rien à faire** côté
  exposition, juste vérifier que `useCorpus` les retourne (§5).
- Optionnel : un `watch(corpus.categoriesNote, () => ent.rafraichirDecorations())` n'a
  pas de sens (les notes ne sont pas des décorations du texte) — **ne pas ajouter**.

## 7. Composable entretien — `src/renderer/composables/useEntretien.ts`

- **Retirer** : ref `categoriesNote`, `normaliserCategoriesNote` à l'ouverture, le reset
  dans `reinitialiser`, les gestes `ajouterCategorieNote`/`renommerCategorieNote`/
  `supprimerCategorieNote`/`choisirCouleurCategorieNote`/`nomCategorieNote`/
  `couleurCategorieNote`, et leur sortie du `return`.
- **Retirer** `categoriesNote` de `payloadCourant()` et de `donneesExport()`.
- **Garder** : `notes`, `brouillonNote`, `ajouterNote`/`editerNote`/`validerNote`/
  `annulerNote`/`supprimerNote`/`reordonnerNotes`/`marquerPassage`, `notesEnTexte`.
- `notesEnTexte()` a besoin du **nom** de catégorie : passer la résolution via `deps`
  (comme `nomCode`, `modalitesDe`). Ajouter au `deps` de `useEntretien` :
  ```ts
  /** Nom d'une catégorie de note depuis son id (le composable ne porte plus
   *  les catégories — elles vivent au corpus). */
  nomCategorieNote: (id: string) => string
  ```
  Et `notesEnTexte` utilise `deps.nomCategorieNote(n.categorieId)` au lieu de la ref
  locale. Fournir l'implémentation dans `sonal.ts` (qui a `corpus.nomCategorieNote`).
- `ajouterNote` : la catégorie par défaut devient **la première catégorie du corpus**
  transmise par deps, OU une valeur passée. Plus simple : `ajouterNote()` prend la
  catégorie par défaut depuis un accesseur `deps.categorieNoteDefaut()` (renvoie l'id de
  la 1re catégorie). Sinon, laisser `Entretien.vue` fixer `brouillonNote.categorieId`
  après `ajouterNote()`. **Recommandation : accesseur deps** (parité avec `nomCode`).

## 8. Migration V1 — `src/renderer/import/importSonal.ts`

- **Retirer** la construction de `categoriesNote` (le `CATEGORIES_NOTE_DEFAUT.map(...)`)
  et ne plus l'inclure dans le `payload` retourné. Les catégories vivent au corpus.
- La note migrée référence `ncat_generale` (id stable d'un bac par défaut) → résolu côté
  corpus dès que le corpus est chargé (normalisation à la lecture, §5).
- `legacy.notes` continue de porter la chaîne brute (inchangé, pour le futur export).

⚠ Point d'attention : à l'import d'un entretien V1, le **corpus** doit déjà exister avec
ses catégories (les défauts, normalisés à la lecture). Si l'import crée un corpus neuf,
s'assurer que `categoriesNote` y est normalisé (le `charger` du corpus le fait à la
lecture). Vérifier le chemin `importerEntretienV1` (sonal.ts:555) : le corpus est déjà
ouvert avant l'import → ses catégories sont en mémoire. OK.

## 9. UI — `src/renderer/components/Entretien.vue`

- Destructuring : retirer du bloc `useEntretien` les symboles catégories
  (`categoriesNote`, `ajouterCategorieNote`, `renommerCategorieNote`,
  `supprimerCategorieNote`, `choisirCouleurCategorieNote`, `nomCategorieNote`,
  `couleurCategorieNote`) et les récupérer depuis le scope **corpus** (ils arrivent via
  `utiliserSonal()` grâce au `...corpus`). Vérifier qu'aucun nom ne collisionne.
- Le volet catégories (⚙) appelle désormais les gestes corpus (async) — les handlers
  `@change`/`@click` deviennent `async` (ou appellent des wrappers `async` locaux).
  La suppression peut échouer : afficher `messageCategorieNote` (comme `messageTheme`
  pour les thèmes).
- Le select « Catégorie » du formulaire de note + l'option « autre… » (mini-modale
  trouver-ou-créer) : `ajouterCategorieNote` est maintenant async et renvoie l'id après
  IPC → `validerCreationCategorie` devient `async` et `await` avant de sélectionner.
- `notesEnTexte` (computed `texteExpand`) : inchangé côté template (le composable
  résout via deps).
- Le reste (cartes, glisser-déposer, surlignage, modale) est **inchangé**.

## 10. Tests

### `test/notes.test.ts` (à ajuster)

- Supprimer l'assertion `r.payload.categoriesNote` dans les tests d'import (le payload
  ne porte plus les catégories). Remplacer par un test de **normalisation corpus** :
  `normaliserCategoriesNote(undefined)` → 4 bacs ; `normaliserCategoriesNote([...])`
  → copie.
- Ajouter un test pour `compterUsagesCategorieNote` (pur) :
  ```ts
  const ents = [{ notes: [{ categorieId: 'a' }, { categorieId: 'b' }] }, { notes: [{ categorieId: 'a' }] }]
  expect(compterUsagesCategorieNote(ents, 'a')).toBe(2)
  expect(compterUsagesCategorieNote(ents, 'x')).toBe(0)
  ```
- Les autres tests (sanitisation, rangs, ids, migration V1 d'une note) restent valables.

### `test/corpusStore.test.ts` (à compléter)

- Ajouter un test du store corpus pour les 4 gestes de catégorie de note + le
  **refus si utilisée** :
  - créer une catégorie → elle apparaît dans `corpus.json` ;
  - supprimer une catégorie sans note référente → ok ;
  - créer une note (entretien) référençant la catégorie → `supprimerCategorieNote`
    renvoie `{ ok: false, usages: 1 }` et le fichier corpus est inchangé ;
  - `compterUsagesCategorieNote` reflète le compte.
- Suivre le motif des tests thèmes existants dans ce fichier.

### e2e (optionnel, plus tard)

- Ouvrir un entretien, créer une catégorie depuis le volet, créer une note l'utilisant,
  tenter de supprimer la catégorie → message de refus ; ôter la catégorie de la note,
  supprimer → ok.

## 11. Ordre d'exécution suggéré

1. `format.ts` (déplacer le champ) — cassera typecheck, c'est le signal.
2. `shared/entretien/notes.ts` (ajouter `compterUsagesCategorieNote`).
3. `corpusStore.ts` (gestes) + `main/index.ts` + `preload` + `env.d.ts` (IPC).
4. `useCorpus.ts` (ref + gestes + exposition).
5. `useEntretien.ts` (retirer le périmètre catégories, passer `nomCategorieNote` +
   `categorieNoteDefaut` en deps, ajuster `notesEnTexte`/`ajouterNote`).
6. `sonal.ts` (fournir les deps au `useEntretien`).
7. `importSonal.ts` (retirer `categoriesNote` du payload).
8. `Entretien.vue` (rebrancher les symboles depuis le corpus ; handlers async).
9. `test/notes.test.ts` + `test/corpusStore.test.ts`.
10. `npm run typecheck && npm run build && npm test`.

## 12. Risques / points de vigilance

- **Collision de noms** au destructuring de `Entretien.vue` : `nomCategorieNote`/
  `couleurCategorieNote` existaient côté entretien ; après le déplacement, vérifier
  qu'ils viennent bien du corpus et qu'aucun résidu ne reste côté `useEntretien`.
- **Accès async** : les gestes corpus sont `async` (IPC) — les handlers du volet
  catégories et de la mini-modale « autre… » doivent `await`. Un oubli casse la flow
  (sélection d'une catégorie à peine créée).
- **Normalisation à la lecture** : un corpus existant n'a pas `categoriesNote` →
  `useCorpus` doit normaliser **avant** qu'un entretien ne tente d'afficher une note
  (sinon `nomCategorieNote` tombe sur le fallback). Comme le corpus est chargé avant
  l'ouverture d'un entretien, c'est OK ; juste s'assurer que `majCategoriesNote` est
  appelé dans le même chemin que `majCodebook`.
- **Pas d'écriture immédiate des défauts** : les 4 bacs par défaut ne sont écrits dans
  `corpus.json` qu'au premier geste d'édition (parité `paramsAnon`). Acceptable : tant
  qu'aucune catégorie personnalisée n'est créée, le fichier corpus reste sans le champ
  et la normalisation se refait à chaque lecture.
