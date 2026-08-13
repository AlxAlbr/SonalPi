# Plan — Nettoyage documentaire et des commentaires (« plan-clean »)

> **Objectif** : faire passer SonalAsynchro d'un dossier de chantier (qui porte toutes les étapes
> de sa construction) à un **produit présentable à des développeurs extérieurs** : documentation
> autonome, commentaires de code auto-suffisants, aucune référence à des fichiers hors du dossier
> (`../POC2`, `../POC3`) ni à un vocabulaire de chantier disparu (étapes, D1–D6, D-S1…D-S15, S1–S8).
>
> Ce plan complète les autres plans de `docs/` ; il ne change **aucun comportement** du produit
> (documentation et commentaires uniquement — un seul renommage de section dans un doc).

## Décisions actées

| # | Décision | Choix |
|---|---|---|
| C1 | Autonomie du modèle objet | **Fusion** de `../../POC2/docs/MODELE_OBJET2.md` dans [`MODELE_OBJET.md`](MODELE_OBJET.md) — **sans** les sections Yjs (§8-§13, qui relèvent de `../SonalSynchroYjs`). |
| C2 | Documents de chantier | **Supprimer** `DEMARRAGE.md`, `SUITE.md`, `BILAN.md`. **Conserver** `PARITE.md` (procédure de vérification encore utile — le « juge de paix » SonalPi). |
| C3 | Commentaires de code | **Auto-suffisants** : chaque commentaire énonce la règle elle-même, sans renvoyer à un document externe ni à une décision numérotée. |
| C4 | `docs/plan-*.md` existants | **Hors périmètre** : leurs références à DEMARRAGE/D4/D-S12 ne sont pas réécrites dans ce chantier. |

## Hors périmètre

- **`../SonalSynchroYjs/`** : dossier frère, non touché (il garde ses propres références).
- **`out/`** : artefacts de build — les commentaires nettoyés y suivront au prochain build.
- **`test-results/`**, historique git : rien à faire.
- Aucun changement de code, d'API, de schéma ProseMirror ou de format fichier. Les chaînes des
  `describe`/`test` peuvent être reformulées, les assertions jamais.

## Inventaire (état au 2026-08-13)

Références à traiter (hors `out/`) :

- **`MODELE_OBJET2` / `POC2`** : `README.md`, `DEMARRAGE.md`, `BILAN.md`, `SUITE.md`,
  `docs/MODELE_OBJET.md`, `PARITE.md`, et ~15 fichiers sources (`src/shared/**`,
  `src/renderer/editor/*`, `src/renderer/import/*`).
- **`DEMARRAGE` / décisions D1–D6** : `README.md`, `docs/MODELE_OBJET.md`, sources
  (`importSonal.ts`, `sas.ts`, `schema.ts`, `positions.ts`, `corpusStore.ts`, `format.ts`,
  `remap.ts` → DEMARRAGE3), e2e et tests (`schema.test.ts`, `corpusStore.test.ts`,
  `remap.test.ts`, `locuteurs.e2e.ts`, `marquage.e2e.ts`, `persistance.e2e.ts`, `smoke.e2e.ts`…).
- **`SUITE` / D-S1…D-S15 / S1–S8** : sources (`App.vue`, composables `sonal.ts`, `useCorpus.ts`,
  `useEntretien.ts`, `useProfil.ts`, `useAudio.ts`, `useSynchroAudio.ts`, `editor/*`,
  `import/*`, `shared/entretien/*`, `shared/corpus/*`, `main/*`, composants `Corpus.vue`,
  `EditionThemes.vue`, `Entretien.vue`), CSS (`base.css`, `editeur.css`), e2e et tests.

Soit **~45 fichiers**, presque toujours 1 à 5 lignes de commentaire chacun.

## Phase 1 — `docs/MODELE_OBJET.md` autonome

But : un seul document, lisible sans quitter le dossier, qui porte **le domaine + la technique**.

1. **Importer le plan conceptuel** de `../../POC2/docs/MODELE_OBJET2.md` :
   - §1 (agrégats), §2 (`Annotation`), §3 (patron à 3 étages), §4 (Segment › Token, locuteurs),
     §5 (EAV), §6 (anonymisation), §7 (recueil & lecture) + les **règles de lecture n°1–3**
     (invariants de robustesse).
   - **Adapter au régime fichiers** pendant l'import : remplacer les mentions `ydoc`/rooms/serveur
     par leur équivalent actuel (`corpus.json`, `entretiens/<id>.json`, verrous) dès qu'une phrase
     du plan conceptuel y fait allusion.
   - §10 (« inventaires = requêtes ») et §12 (« sas d'import ») sont classés « plan technique »
     dans POC2 mais portent des **concepts de domaine** cités par le code (`requetes.ts`,
     `import.ts`) : reprendre leur substance dans la partie technique locale, reformulée fichiers.
2. **Ne pas importer** : §8-§13 (mapping CRDT/Yjs → relève de `SonalSynchroYjs`), le préambule
   « cible CRDT/Yjs (POC2) ». **§14 (REFI-QDA)** : non importé par défaut (piste future) — à
   arbitrer au moment de la rédaction ; si conservé, en annexe marquée « piste ».
3. **Fusionner** avec le contenu actuel de `MODELE_OBJET.md` (conteneur d'état, positions PM,
   identités, format natif, verrous) : structure cible =
   *Partie I — le domaine (§1-§7 importés, renumérotés si nécessaire)* ;
   *Partie II — la technique fichiers* (existant, expurgé de ses renvois POC2/POC3/DEMARRAGE).
4. **Stabilité des numéros de section** : le code référence aujourd'hui « MODELE_OBJET2 §2/§4/§5/
   §6/§10/§12 ». Comme les commentaires deviennent auto-suffisants (C3), **aucune contrainte de
   numérotation** — choisir la numérotation la plus claire pour le lecteur.
5. Réécrire l'en-tête du document : il n'est plus « pas un nouveau modèle » par rapport à un
   document externe, il **est** le modèle objet de SonalAsynchro.

**Critère de sortie** : `grep -r "POC2\|POC3\|MODELE_OBJET2\|DEMARRAGE" docs/MODELE_OBJET.md` → vide.

## Phase 2 — Suppression des documents de chantier

1. **Absorber le strict nécessaire avant suppression** :
   - De `BILAN.md` : le tableau des **écarts de parité assumés** → déplacé dans `PARITE.md`
     (c'est sa vocation : ce qu'on vérifie à la réouverture dans SonalPi). Le reste (synthèse de
     chantier) disparaît.
   - De `SUITE.md` : vérifier que chaque piste non réalisée est déjà couverte par un
     `docs/plan-*.md` (anon, comment, corpus-onglets, multiuser, tutoriel) ; sinon l'ajouter en
     une ligne au plan correspondant. Les décisions D-S* réalisées n'ont plus à exister comme
     références : leur substance migre dans les commentaires (phase 3).
   - De `DEMARRAGE.md` : les décisions D1–D6 encore pertinentes sont déjà incarnées dans le code
     et `MODELE_OBJET.md` (format versionné D6, sas d'import D1…) ; rien d'autre à conserver.
2. **Supprimer** `DEMARRAGE.md`, `SUITE.md`, `BILAN.md`.
3. **Réécrire `README.md`** pour un lecteur extérieur :
   - retirer les liens `../POC2/docs/MODELE_OBJET2.md` → pointer vers `docs/MODELE_OBJET.md` ;
   - retirer le vocabulaire de chantier (« premier incrément », « set minimum », « étapes 0–7 »,
     « étape » dans le tableau docs) → décrire l'**état présent** du produit ;
   - tableau « Documentation » : retirer les lignes DEMARRAGE/BILAN/SUITE, garder MODELE_OBJET,
     PARITE, les plan-*.md ;
   - la carte des sections du code (`categories.ts §2`, `locuteurs.ts §4`…) pointe désormais vers
     les sections de `docs/MODELE_OBJET.md` fusionné — ou perd ses numéros (au plus simple) ;
   - garder le lien de réversibilité vers `../SonalSynchroYjs` (dossier vivant, présenté comme
     tel) — c'est la seule référence externe légitime restante.
4. **`PARITE.md`** (conservé) : remplacer ses renvois « MODELE_OBJET2 §4 » par une phrase
   auto-suffisante ou un renvoi vers `docs/MODELE_OBJET.md`.

## Phase 3 — Commentaires de code auto-suffisants

Règle de réécriture (C3) : **le commentaire dit la règle, pas son historique**. Exemples :

| Avant | Après (principe) |
|---|---|
| `Synchro audio (S7, D-S14) — le temps est porté par des ANCRES…` | `Le temps est porté par des ancres {pos, t} positionnées dans le texte, remappées à chaque édition — jamais par des attributs de bloc.` |
| `Contrat de schéma D2 (DEMARRAGE) — GELÉ, révisé S7` | `Schéma gelé : doc › bloc{loc}. Toute évolution = migration de format explicite.` |
| `volatil (D-S9), actions de modèle seules (D-S3)` | `Journal volatil (session, jamais persisté) ; seules les actions de modèle y entrent — la frappe de texte reste sur Ctrl+Z.` |
| `Sas d'import (D1) : tout format étranger passe par .sonal` | (inchangé dans l'esprit — déjà auto-suffisant, retirer juste « (D1) ») |
| `MODELE_OBJET2 §5, SUITE S1` | `Valeurs chez leur propriétaire : portée entretien → meta.valeursGen, portée locuteur → Locuteur.valeursLoc.` |

Méthode :

1. Traiter par grappes cohérentes (une grappe = un concept) : **ancres temporelles** (S7/D-S14/
   D-S15 : `audio.ts`, `migration.ts`, `entretien.ts`, `attribution.ts`, `lecture.ts`,
   `useSynchroAudio.ts`, `exportSonal.ts`, `importSonal.ts`, `corpusStore.ts`, tests
   `audio/attribution/importSonal/exportSonal/sas`), **journal** (D-S3/D-S9), **scopes UI**
   (D-S12), **politique de suppression des thèmes** (D-S10), **table de données / point de
   reprise** (D-S11), **hiérarchie des thèmes** (D-S8), **sas d'import** (D1), **format versionné**
   (D6), **schéma** (D2), **EAV** (§5), etc.
2. Pour chaque fichier : lire le commentaire **et** la décision d'origine dans `SUITE.md` /
   `DEMARRAGE.md` (encore présents à ce stade — d'où l'ordre : phase 3 **avant** la suppression
   effective de la phase 2, ou extraire d'abord un mémo des décisions).
   ⚠️ **Ordonnancement** : la phase 3 doit précéder le `git rm` de la phase 2 (les fichiers
   supprimés sont la source des règles à réécrire). En pratique : phases 1 → 3 → 2, ou extraire
   les décisions dans un fichier temporaire.
3. Ne pas « enrichir » : un commentaire court qui dit la règle vaut mieux qu'un paragraphe.
   Supprimer aussi les vestiges signalés comme tels (« vestige D-S7 » → dire simplement que la
   requête Extraits reste disponible pour un futur écran de recueil).

## Phase 4 — Validation

1. `npm run typecheck` — vert (aucune signature touchée, mais les commentaires JSDoc peuvent
   casser un lien de doc).
2. `npm test` — 100 tests verts (les descriptions de tests reformulées ne changent rien).
3. `npm run build` — vert (régénère `out/` avec les commentaires nettoyés).
4. Grep final de conformité, attendu **vide** (hors `out/` régénéré, `test-results/`, et les
   `docs/plan-*.md` hors périmètre C4) :

   ```
   grep -rn "MODELE_OBJET2\|POC2\|POC3\|DEMARRAGE\|SUITE\.md\|BILAN\.md\|D-S[0-9]\+\|D[1-6]\b" \
     src/ e2e/ test/ README.md PARITE.md docs/MODELE_OBJET.md
   ```

5. Relecture à froid : ouvrir `README.md` puis `docs/MODELE_OBJET.md` comme un développeur qui
   découvre le dépôt — aucune question ne doit rester sans réponse à l'intérieur du dossier.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Perte de la trace des décisions (le vocabulaire D-S* disparaît) | L'historique git conserve DEMARRAGE/SUITE/BILAN ; le commit de nettoyage est un point de repère explicite. |
| Réécriture de commentaire qui déforme une règle | Relire la décision d'origine avant chaque réécriture (d'où l'ordre des phases) ; revue humaine du diff, fichier par fichier. |
| `PARITE.md` devient orphelin de ses références | Traité en phase 2.4. |
| Un futur plan-*.md cite une décision supprimée | Assumé (C4) : ces plans seront assainis lors de leur propre exécution. |

## Ordre d'exécution recommandé

1. **Phase 1** (doc autonome) — 1 commit.
2. **Phase 3** (commentaires, en s'appuyant sur DEMARRAGE/SUITE encore présents) — 1 commit par
   grappe ou un commit unique relu attentivement.
3. **Phase 2** (absorber → supprimer → réécrire README/PARITE) — 1 commit.
4. **Phase 4** (validation complète) — commit de clôture si ajustements.
