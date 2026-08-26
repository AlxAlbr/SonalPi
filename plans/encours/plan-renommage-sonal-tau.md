# Plan : renommage SonalPiTestV2 → SonalTau + vocabulaire des versions

> Objectif double. (1) Donner au produit un vrai nom — **SonalTau** — en remplacement
> de « SonalPiTestV2 » et de l'étiquette « la V2 ». (2) Mettre fin à la surcharge de
> « v1/v2 » : dans le repo, ce sigle désigne aujourd'hui quatre choses différentes
> (générations de produit, versions du format natif, tranches de fonctionnalité,
> release) sans jamais préciser laquelle. Le renommage supprime l'un des quatre sens ;
> le vocabulaire ci-dessous qualifie les trois autres.

> **Statut** : E1–E4 implémentés et validés (typecheck, 606 tests unitaires, build, e2e
> navigation + migration-v1 verts). E5 reste à faire (action utilisateur : dépôt GitLab,
> renommage du dossier).

## Vocabulaire cible (la règle à appliquer partout)

| Terme | Sens | Exemples |
|---|---|---|
| **SonalPi V1** (ou « SonalPi » nu) | L'ancien produit (`Vscode/SonalPi`). Seul usage légitime du mot « SonalPi ». | `.crp` version `1.0`, `.sonal`, encodages UTF-8/windows-1252, `meta.sourceV1` |
| **SonalTau** | Ce produit. Le label « V2 »/« la V2 » disparaît du repo. | « corpus SonalTau », « format natif SonalTau » |
| **formatVersion** | Version du format natif (aujourd'hui `3`). Indépendante du produit ; chaque bump = migration explicite au store. Les caches distants (`miroir.ts`, `coffre.ts`) ont chacun leur propre `formatVersion`. | « formatVersion 1 → 2 », « entretien formatVersion 2 » |
| **itération** | Tranche de fonctionnalité dans SonalTau (remplace le « v1 » de périmètre des plans). | « hors périmètre de l'itération 1 », « pas de retry (itération 1) » |
| **release** | Version livrée du produit = semver dans `package.json`, affichée dans l'app. | `0.2.0` |
| **versions externes** | Protocoles, modèles, standards tiers. Toujours précédés de leur domaine, jamais confondus avec nos versions. | « protocole chunking v2 de Nextcloud », « OCS v1 (Nextcloud) », « modèle `parakeet_…-v1` » |

**Règle absolue : jamais « v1/v2 » nu ; toujours qualifier la dimension.** Dans le code,
un commentaire « v1 » ambigu doit être retravaillé (produit / formatVersion / itération /
release), jamais laissé tel quel.

## Décisions à prendre avant de commencer

1. **Dépôt GitLab** : créer `mbeligne/SonalTau` et archiver `SonalPiTestV2` (recommandé),
   ou garder l'URL actuelle ? (action manuelle de l'utilisateur)
2. **Dossier local** : renommer `SonalPiTestV2` → `SonalTau` en DERNIER (recommandé —
   les chemins de ce plan vivent dans le dossier), ou maintenant ?
3. **Terme pour les tranches de fonctionnalité** : « itération » (recommandé), ou
   « tranche », ou pas de numéro (« non retenu pour l'instant ») ?
4. **Politique de version** : semver avec bump à chaque jalon + affichage « À propos »
   (recommandé), ou garder `0.1.0` inerte ?

*Positions retenues par défaut* : 1 = nouveau dépôt ; 2 = dossier en dernier ; 3 = itération ;
4 = semver + bump `0.2.0` à la fin de ce plan. Les étapes ci-dessous les supposent.

---

## E1. Renommage du nom de produit — ✅ FAIT

Note de résultat : la passe a aussi rattrapé les occurrences hors liste du plan (cartes UI de
l'Accueil « Migration V1 vers V2 », `modele-objet.md`, e2e, tests). Le mapping legacy
(`migrationCrp.ts` et compagnie) est conservé tel quel : dans ces fichiers le couple V1↔V2 est
le mapping explicite ancien produit → modèle SonalTau.

### E1.1 Remplacer « SonalPiTestV2 »/« sonalpitestv2 » → « SonalTau »/« sonaltau »

| Fichier | Contenu |
|---|---|
| `package.json` | `name: "sonaltau"`, description |
| `src/renderer/index.html` | `<title>SonalTau — set minimum</title>` |
| `src/renderer/App.vue` | en-tête « SonalPiTestV2 — » → « SonalTau — » |
| `README.md` | titre + intro (« Réécriture en cours du cœur de SonalPi… ») |
| `docs/dev/README.md` | titre + intro |
| `docs/dev/developpement.md` | mention « bug de SonalPiTestV2 » |
| `docs/dev/modele-objet.md` | mentions |
| `docs/user/migration-v1.md` | titre + mentions (« corpus V2 » → « corpus SonalTau ») |
| `docs/user/multi-utilisateur.md` | mentions |
| `electron.vite.config.ts` | commentaire de tête |
| `src/shared/format.ts` | « Contrat du FORMAT NATIF SonalPiTestV2 » |
| `src/shared/corpus/eav.ts`, `src/renderer/import/eav.ts` | « MODÈLE SonalPiTestV2 » |
| `src/renderer/import/importSonal.ts` | « charge utile SonalPiTestV2 » |
| `plans/choix/plan-corpus-onglets.md` | « champ purement SonalPiTestV2 » |
| `plans/reflexion/reflexion-stt.md` | titre + corps |
| `package-lock.json` | régénéré par `npm install` (pas d'édition manuelle) |

### E1.2 Remplacer le « V2 » nu qui désigne le produit → « SonalTau »

| Fichier | Avant | Après |
|---|---|---|
| `src/renderer/components/MigrationCorpus.vue` | « SonalPi V1 → V2 », « passe en V2 », « recréé en V2 », « vers la V2 », « la V2 y pose » | « SonalPi V1 → SonalTau », « en SonalTau », etc. — garder les libellés « SonalPi (V1) » |
| `src/preload/index.ts` | « Crée le corpus V2 dans le dossier dédié » | « corpus SonalTau » |
| `src/main/index.ts` | « Migration SonalPi V1 → V2 » | « SonalPi V1 → SonalTau » |
| `src/renderer/composables/sonal.ts` | « Migration SonalPi V1 → V2 », « crée le corpus V2 » | idem |
| `src/shared/corpus/squelette.ts` | « Un corpus V2 vierge » | « un corpus SonalTau vierge » |
| `docs/user/migration-v1.md` | tous les « V2 » produit | « SonalTau » |

### E1.3 « SonalPi » nu désignant CE produit → « SonalTau »

- `e2e/util.ts` : commentaire « L'app atterrit sur l'ACCUEIL (flux SonalPi) » → « flux SonalTau ».
- `src/renderer/composables/sonal.ts` : « Navigation SonalPi : Accueil → Corpus → Entretien » → « Navigation : Accueil → Corpus → Entretien » (c'est notre flux, pas un héritage).

### E1.4 « SonalPi » = ANCIEN produit : à GARDER telles quelles

Tout le mapping legacy (`migrationCrp.ts`, conventions « SonalPi » dans
`importSonal.ts`/`exportSonal.ts`/`eav.ts`, `legacy/`), `encodage.ts` (« EXACTEMENT la
logique V1 »), « parité accordéon V1 » (`scanAnon.ts`), « Doctrine V1 » (`corpusStore.ts`),
dialogue « Corpus SonalPi (V1) » (`main/index.ts`), libellés UI de `MigrationCorpus.vue`,
colonnes « Contenu V1 » de `migration-v1.md`, tests `migration-v1.e2e.ts` et les tests
legacy. Le dashboard « SonalPi V1 » de `sonal.ts` (détails d'entretien) aussi.

Ne pas toucher non plus : `docker/compose*.yml` (projets `sonal-nc-a/b`, volumes
existants — interdiction de re-provisionner, cf. AGENTS.md), préfixes e2e `sonal-`
(répertoires temporaires, internes).

---

## E2. Glossaire des versions — ✅ FAIT

1. Écrire **`docs/dev/versions.md`** : le tableau « Vocabulaire cible » ci-dessus,
   enrichi des exemples réels du repo (fichiers, champs, commentaires), et la règle.
2. Lier depuis **`docs/dev/README.md`** (sommaire) et **`README.md`** (tableau
   Documentation).
3. Ajouter dans **`AGENTS.md`** une section courte « Vocabulaire des versions »
   (jamais « v1/v2 » nu ; SonalPi = ancien produit ; SonalTau ; formatVersion ;
   itération ; release) pour que les agents appliquent la règle.

---

## E3. Passe de désambiguïsation « v1/v2 » — ✅ FAIT

Note de résultat : en plus du tableau, la passe a qualifié toutes les « parité V1 »/
« façon V1 » → « SonalPi V1 », les « corpus v2 » des tests e2e → « SonalTau » ou
« formatVersion 2 », et renommé `migrerV2VersV3` → `migrerFormatV2Vers3` (+ le paramètre
`v1` de `migrerEntretienFormatV1` → `donnees`).

À traiter fichier par fichier ; hors périmètre : versions externes (qualifier sans
renommer), références produit V1 (garder).

| Fichier | Avant | Après |
|---|---|---|
| `plans/reflexion/reflexion-ffmpeg.md` | « assume désormais (v1) », « Décision v1 », « comportement v1 » | « (release initiale) », « Décision (release initiale) », « comportement actuel » |
| `plans/reflexion/reflexion-chunking.md` | « hors v1 » | « hors de l'itération 1 » |
| `plans/reflexion/reflexion-chunking.md` | « chunking v2 » | « protocole chunking v2 de Nextcloud » (externe) |
| `docs/dev/plan-lot-table-donnees.md` | « Hors périmètre v1 », « pas de retry v1 », « v1 : 1 variable » | « (itération 1) » à chaque occurrence |
| `docs/dev/plan-saisie-cellule-table.md` | idem | idem |
| `src/main/distant/transactions.ts` | « (v1 : UN verrou…) », « Pas de retry v1 » | « (itération 1 : …) » |
| `src/main/distant/miroir.ts` | « Pas de chunking v1 » | « Pas de chunking (itération 1) » |
| `src/main/webdav/sondes.ts` | « OCS v1 » | « protocole OCS v1 (Nextcloud) » |
| `src/shared/format.ts` | « v2 : … », « v3 : … » | « formatVersion 2 : … », « formatVersion 3 : … » |
| `src/main/corpusStore.ts` | « Migration v1→v2 », « v2→v3 », « Ancien dossier audio (v2) », « entretien v2 isolé » | « formatVersion 1→2 », « formatVersion 2→3 », etc. |
| `plans/reflexion/reflexion-visibilite-etags.md` | « PUT v1 …», « PUT v2 … » (variantes de scénario) | « scénario A », « scénario B » |
| `docs/dev/ouverture-corpus.md` | « la migration V1 » | « la migration depuis SonalPi V1 » (précision) |

À vérifier en cours de passe : `plans/encours/plan-multiuser-finition.md` (les « migration
V1 » sont produit → garder ; relire « deux versions parallèles », contexte prose) et
`plans/reflexion/reflexion-stt.md` (« parakeet_realtime_eou_120m-v1 » = nom de modèle
externe → garder).

---

## E4. Politique de version applicative — ✅ FAIT

`package.json` passé à `0.2.0` (premier jalon = le renommage). « À propos » (affichage de la
version dans l'app) non implémenté — optionnel, à décider plus tard.

1. **Décision par défaut** : semver dans `package.json`. Le renommage est le premier
   jalon → bump **`0.2.0`** à la fin de ce plan. Bump à chaque jalon fonctionnel.
2. **(Optionnel)** « À propos » minimal : exposer `app.getVersion()` via le preload et
   l'afficher sur l'Accueil (pied de page). Hors scope si non souhaité.
3. Le lien release ≠ formatVersion est tranché par le glossaire (E2) : `formatVersion`
   ne bouge que sur migration structurelle, `package.json` sur jalon.

---

## E5. Dépôt Git — en dernier, quand tout est vert

1. (Utilisateur) créer le dépôt `mbeligne/SonalTau` sur GitLab ; archiver l'ancien.
2. `git remote set-url origin https://gitlab.huma-num.fr/mbeligne/SonalTau.git` puis
   `git push -u origin main`.
3. Renommer le dossier local : `mv SonalPiTestV2 SonalTau` — APRÈS la validation.
   `Vscode/SonalPi` (l'ancien produit) reste tel quel.

---

## Vérifications (avant E5) — ✅ exécutées

```bash
npm install          # régénère package-lock.json (name → sonaltau)
npm run typecheck    # OK
npm test             # 606 OK | 21 skipped
npm run build        # OK
npx playwright test e2e/navigation.e2e.ts e2e/migration-v1.e2e.ts --workers=1   # 6/6 OK
```

**Contrôles finaux — ✅ faits** :

```bash
grep -rni "SonalPiTestV2\|sonalpitestv2" --exclude-dir=node_modules --exclude-dir=out .   # vide (hors ce plan et versions.md)
```

Revue manuelle des « V1/V2 » restants : seuls survivent les cas documentés dans
`docs/dev/versions.md` — l'exception duplication legacy (`migrationCrp.ts`, couple V1↔V2 =
mapping ancien produit → modèle SonalTau), les références qualifiées `.sonal`/`.crp` de
l'ancien produit, les versions externes (Nextcloud chunking v2, OCS v1, modèles) et les ids
de données (`v1`, `v2`… variables de fixture).