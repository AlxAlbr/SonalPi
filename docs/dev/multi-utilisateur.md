# Le fonctionnement multi-utilisateur (distant)

Cette page décrit l'architecture du mode **corpus distant** (WebDAV / Nextcloud) : comment deux
postes éditent le même corpus sans jamais s'écraser, ce que chaque fichier du dossier distant
signifie, et où vit chaque pièce dans le code. Cette page est la **carte vers le code**, pas une
re-spécification ; les cas limites restant à couvrir par les tests sont listés dans
[plans/encours/plan-multiuser-finition.md](../../plans/encours/plan-multiuser-finition.md).

## La topologie en une phrase

Le serveur ne fait que **stocker des fichiers JSON** ; tout l'ordre social vient de trois
primitives WebDAV (PUT conditionnel `If-None-Match: *` = test-and-set atomique, `If-Match` =
garde anti-écrasement, LOCK natif quand files_lock est installé) et d'une discipline locale :
**le miroir tire, les sessions publient, personne n'écrit jamais en cachette.**

## Les fichiers côté serveur

| Chemin | Rôle | Code |
|---|---|---|
| `corpus.json` | définitions + membership | `CorpusStore` (`src/main/corpusStore.ts`) |
| `entretiens/<id>.json` | contenu d'un entretien | idem |
| `verrous/<id>.lock.json` | verrou d'écriture **variante B** (sans plugin) | `ProviderPutConditionnel` |
| `entretiens/<id>.json` **verrouillé nativement** | verrou **variante A** (files_lock) | `ProviderFilesLock` |
| `presence/<user>-<machine>.json` | « ce poste consulte tel entretien » — informatif | `PresenceDistante` |
| `sessions/.verrous-natifs.json`, `sessions/<id>.divergence-<session>.json` | journal local (variante A), copies de divergence | `SessionsDEntretien` |

NB : `sessions/` et `presence/` sont **hors contenu** (`DOSSIERS_HORS_CONTENU` dans
`distant/miroir.ts`) — le miroir ne les télécharge pas.

## Les deux variantes de verrou (§8) — un contrat, deux providers

Le protocole (cycle §4) ignore totalement la variante : il ne connaît que le contrat
`VerrouProvider` (`src/main/verrous/types.ts`) — `acquerir / battre / liberer / etat`.
La variante est **choisie automatiquement à chaque ouverture** par une sonde capabilities
(`sonderFilesLock`, main/index.ts) ; l'utilisateur ne choisit rien.

- **Variante B** (`ProviderPutConditionnel`) : marche sur tout serveur WebDAV honnête.
  Acquérir = PUT `If-None-Match:*` (201 obtenu / 412 tenu). Le battement rafraîchit sous
  `If-Match <notre etag>` : un 412 au battement = quelqu'un nous a pris le verrou → rétrogradation.
- **Variante A** (`ProviderFilesLock`) : LOCK/UNLOCK WebDAV + props `nc:` lues par PROPFIND.
  Le filet change de nature : un PUT d'un tiers sous notre verrou est refusé **423 par le
  serveur lui-même** (le scénario réel E3b vérifie les deux sens).

Invariant §15.2 : **le protocole est identique, seul le provider diffère.** Tout nouveau code
doit passer par le contrat, jamais par une variante.

## Le cycle de session (§4)

`SessionsDEntretien` (`src/main/distant/sessions.ts`), un objet par corpus distant ouvert :

```
ouvrir   : acquerir(verrou) → GET serveur (la version d'après-verrou fait foi)
           → ETag mémorisé (garde de publication)
écrire   : autosave local uniquement (miroir), session marquée « sale »
battre   : 60 s — preuve de vie ; échec → rétrogradation (§5.2)
publier  : PUT If-Match <etag> sous verrou toujours tenu ; 412 → divergence (§6)
fermer   : publication finale PUIS déverrouillage — ORDRE INVARIANT (§4.4)
```

Points de couture à connaître en revue :

- **La rétrogradation** met la copie locale de côté hors serveur
  (`degrader()` → `sessions/<id>.divergence-<sessionId>.json`) puis retire la session.
  Elle n'est ni perdue ni publiée en silence.
- **Les orphelins** (crash sans libération, §4.5) sont détectés à l'ouverture du corpus ;
  dialogue « Reprendre et publier » (ordre invariant appliqué aussi là) / « Abandonner ».
- La variante A tient un **journal local** (`sessions/.verrous-natifs.json`) car files_lock
  n'enregistre ni machine ni session.

## Les transactions de définitions (§4.7/§4.8)

Les mutations du flux B (codebook, variables, règles corpus, membership, renommage/suppression
d'entretien) passent par `TransactionsCorpus` (`src/main/distant/transactions.ts`) :
verrou corpus TOUJOURS variante B → GET frais si périmé → mutation locale → PUT If-Match →
libération garantie. La suppression d'un entretien est en **double verrou** avec ordre
canonique : corpus avant entretien, publication avant MOVE corbeille, libération en ordre
inverse (§4.8).

Hors ligne : politique α — les gestes flux B exigent la connexion (refus immédiat net),
l'édition des entretiens sous verrou continue (flux A). C'est le computed `lectureSeule`
(`composables/sonal.ts`) observé par l'UI, alimenté par le pull (le pull EST la sonde réseau).

## Écriture de valeurs sans session — le lot par entretien (plan-lot-table-donnees.md)

La table de données propose trois gestes d'écriture qui ne passent NI par une session
d'écriture, NI par `corpus.json` :

1. **Par ligne** (`allerSaisieDonnees`, renderer seul) : ouvrir l'entretien sur son onglet
   Donnée — le cycle verrou existant §4.1/§4.4 fait tout le travail.
2. **Par colonne** (`TransactionsCorpus.poserValeurLot`) : le lot ne touche pas `corpus.json`
   (jamais de verrou corpus, jamais de verrou global) — UN cycle court par ENTRETIEN :
   acquerir → GET frais → mutation pure (`corpusModel.poserValeur` + `lastModified`, sans
   toucher au membership) → PUT If-Match → écriture THROUGH du MIROIR (même contenu que le
   serveur : la matrice est fraîche sans pull complet, le prochain tirage devient no-op),
   `liberer` TOUJOURS en `finally`. Exécution séquentielle ; tout échec ponctuel (refus de
   verrou nominatif, divergence 412 sans retry v1, réseau) est signalé nommément dans le
   retour IPC `{ succes: string[]; echecs: { id, raison }[] }` SANS bloquer les autres
   entretiens du lot. Défense en profondeur : si un entretien visé était ouvert CHEZ NOUS
   (impossible depuis la table aujourd'hui, mais l'option `getSessions` le couvre),
   l'écriture passe par le chemin session existant (`poserValeur` + `noterSale`). En corpus
   local, la branche `poserValeurLotLocal` boucle directement sur le store (garde inexistante).
   La modale propose un filtre « lignes sans valeur » (aide au ciblage 100 % renderer :
   matrice + badges ; les exclus restent affichés grisés avec leur raison).
   La présence 👁 n'est JAMAIS décisionnelle : un entretien seulement consulté peut être
   modifié par le lot.
3. **Par cellule** (`validerCelluleTable` dans `useCorpus.ts`) : la saisie directe dans la
   grille réutilise EXACTEMENT le primitif du lot avec UN item — verrou court, GET frais,
   PUT If-Match, miroir written-through, mêmes résultats en local (`poserValeurLotLocal`).
   Garde PAR LIGNE côté renderer (`tableLigneEditable` : tout badge 🔒 est autrui dans la
   table, qui ne tient jamais de session) → les cellules des lignes verrouillées sont
   désactivées. Un refus transactionnel (verrou pris entre-temps, divergence 412) revient
   en ERREUR INLINE sur LA cellule (bord rouge + tooltip nominatif), sans bloquer les
   autres ; les rejets IPC (réseau) remontent à la bannière globale. Navigation clavier :
   modèle pur `src/renderer/tableNavigation.ts` (grille des cellules éditables + voisine
   dans 4 sens — Entrée/Shift+Entrée bas/haut en sautant lignes sans cellule et lignes 🔒,
   Tab/Shift+Tab droite/gauche), focus immédiat sans attendre le réseau, commits
   sérialisés par entretien (file renderer, jamais d'auto-concurrence 412). Note
   Chromium : sur un `<select>` fermé, le keyup d'Entrée est avalé → keydown sans
   preventDefault. Scénario e2e n° 4 (`multi-utilisateur.e2e.ts`).
   (Remplace l'ancien comportement « cellule active + refus par bannière du main ».)

## Divergence & fusion assistée (§6, E3b)

Une publication 412 signifie : quelqu'un a écrit derrière le verrou. Chaîne complète :

1. `SessionsDEntretien.degrader()` met la copie de côté + callback rétrogradation ;
2. l'API copies (`listerDivergences/lireDivergence/supprimerDivergence`, chemins validés contre
   `^sessions\/([^/]+)\.divergence-([^/]+)\.json$` — traversal impossible) expose les copies ;
3. à la réouverture de l'entretien, le dialogue `DivergenceCopie.vue` propose la fusion ;
4. la décision pure vit dans `shared/entretien/fusion.ts` : garde `corpsIdentiques`
   (**on ne fusionne jamais deux textes**) puis union par identité stable — annotations par id,
   ancres par position, locuteurs par index, valeurs EAV par clef, brouillons par entité ;
   le courant gagne les conflits ;
5. la fusion absorbée, la copie est jetée explicitement.

Réconciliation I-POR-3 post-pull (§4.8 point 3) : une règle corpus apparue pendant la session
est croisée avec les lignes locales par `detecterDivergencesPortee`
(`shared/entretien/anon/reconciliation.ts`) au prochain tirage — mêmes choix que le dialogue de
promotion (« Aligner / Garder les deux »), jamais de divergence silencieuse.

## Présence (§9, E4) — informatif, JAMAIS décisionnel

`PresenceDistante` (`src/main/distant/presence.ts`) : PUT `presence/<user>-<machine>.json`
toutes les 60 s (+ immédiat à l'ouverture/fermeture d'un entretien via IPC
`distant:noterEntretienOuvert`). À la lecture : entrées > 10 min mortes (filtrage, pas de
suppression chez les autres), notre propre poste exclu, erreurs ignorées (best effort).
Consommation : badges 👁 sur cartes Corpus et lignes de la table de données
(`presencesSur(id)` dans sonal.ts). **Règle d'or : la présence décrit, le verrou décide.**

## Audio local sur un poste distant (§3.3, E4)

`meta.audioRef` est un chemin absolu **du poste qui a assigné**. Chez les autres, le fichier
est manquant — c'est normal et attendu :

- lecteur dégradé avec message net (`LecteurAudio.vue`, branche `url && erreur`) ;
- action « Associer l'audio local… » → `CorpusStore.associerAudioLocal()` : **référence** le
  fichier là où il est (jamais de copie, parité avec `assignerAudio` v3) dans
  `<corpus>/audio-locaux.json` — fichier machine-local jamais poussé (le miroir ne fait que
  tirer). Écrire notre chemin dans le JSON partagé déclencherait des publications en cascade ;
- résolution effective : `audiosResolus()` — ref partagée si le fichier existe ici, sinon
  retombée locale ; consommée par `audios()`, `verifierAudios()` et `cheminMediaAbs()`
  (whitelist du protocole `sonal-media`). L'onde se régénère ensuite toute seule (dérivé local).

## Où sont les tests

| Banc | Fichier |
|---|---|
| Verrous, sessions, reprise crash (serveur WebDAV embarqué) | `test/webdav/session.test.ts` |
| Contrat Nextcloud réel (piles Docker A et B) | `test/webdav/contrat-nextcloud.test.ts` |
| Transactions de définitions + lot de valeurs | `test/webdav/transactions.test.ts` |
| Scénario deux postes (E3a, piles réelles) | `test/webdav/scenario-deux-postes.test.ts` |
| Scénario divergence→fusion (E3b, piles réelles) | `test/webdav/scenario-e3b-divergence.test.ts` |
| Fusion/réconciliation purs | `test/e3b-fusion-reconciliation.test.ts` |
| Présence | `test/webdav/presence.test.ts` |
| Audio local (association, retombée) | `test/corpusStore.test.ts` (section §3.3) |

Les piles Docker se lancent avec `npm run nc:up` (A, :8080) et `npm run nc-b:up` (B, :8081) +
provision ; les tests contre elles s'activent automatiquement quand elles répondent
(`fileParallelism: false` — les bancs partagent l'état serveur). Le scénario visible à
deux postes n° 3 (lot par colonne + saisie par ligne, plan-lot-table-donnees.md §6) vit dans
`e2e/multi-utilisateur.e2e.ts`.
