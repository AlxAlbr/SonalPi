# Plan multi-utilisateur — finitions (cas de test restants)

> Le plan multi-utilisateur initial (architecture hybride miroir local + WebDAV) est mené à
> son terme : E0–E4 implémentés et validés contre les deux piles Docker réelles (A avec
> files_lock, B sans). Il est archivé ; la carte du code vit dans
> [docs/dev/multi-utilisateur.md](../../docs/dev/multi-utilisateur.md) et la doc utilisateur
> dans [docs/user/multi-utilisateur.md](../../docs/user/multi-utilisateur.md).
>
> Ce document liste ce qui reste à couvrir : essentiellement des **cas limites autour des
> divergences et de leur fusion** — le chemin heureux (une divergence → proposition → fusion →
> publication) est testé, les enchaînements et les interactions ne le sont pas encore.

## Déjà couvert (pour mémoire)

| Domaine | Banc |
|---|---|
| Cycle verrou complet (acquisition, battement, refus d'un tiers, libération) | banc embarqué + piles A et B (`test/webdav/session.test.ts`, `scenario-deux-postes.test.ts`) |
| Divergence 412 par contournement → copie → fusion assistée → publication réunissant les deux apports | `test/e3b-fusion-reconciliation.test.ts` + `test/webdav/scenario-e3b-divergence.test.ts` (A et B) |
| Décisions pures de fusion (union par id/index/clef, courant gagne, garde texte identique) | `test/e3b-fusion-reconciliation.test.ts` |
| Réconciliation I-POR-3 post-pull (règle corpus poussée pendant une session) | idem |
| Transactions de définitions (double verrou, GET frais, ordre canonique) | `test/webdav/transactions.test.ts` + scénarios deux postes |
| Présence, badges, audio locaux, reprise crash | `test/webdav/presence.test.ts`, corpusStore.test.ts, e2e multi-postes |

## A. Divergences enchaînées

Chaque rétrogradation dépose une copie `sessions/<id>.divergence-<sessionId>.json`. Deux
découvertes faites en relisant le code (à corriger AVANT d'écrire ces tests) :

- **Écrasement silencieux dans un même lancement.** Le `sessionId` du nom de fichier est
  `SESSION_ID`, généré UNE FOIS PAR LANCEMENT d'app (`src/main/index.ts`), pas par session
  d'entretien. Deux 412 successifs sur le même entretien dans le même lancement écrivent donc
  le MÊME chemin (`degrader()` fait un `writeFileSync` direct) : la première copie disparaît
  sans qu'aucun dialogue ne demande quoi garder.
- **Le dialogue ne propose que la copie la plus récente.** `proposerFusionDivergence`
  (`sonal.ts`) prend `.at(-1)` sur la liste filtrée par entretien : les copies plus anciennes
  restent sur disque, listées par l'API mais jamais proposées à l'utilisateur.

Options de correction (non exclusives) :

(a) horodater le nom de copie (`<id>.divergence-<sessionId>-<heure>.json`) — plus aucun
écrasement, `listerDivergences` trie déjà par date ; (b) proposer TOUTES les copies d'un
entretien au dialogue (file ou liste) au lieu de la seule dernière ; (c) avant d'écrire une
nouvelle copie, fusionner l'existante dedans (union par id, même mécanique que
`fusionnerEntretiens`) — aucune perte même en gardant le nommage actuel.
*Position retenue : **(a)** seul + une info de pile (voir ci-dessous).*

- **(a)** est le seul qui corrige la PERTE à la source (elle a lieu à l'écriture, avant toute
  UI). Coût minimal : le nom dans `degrader()`, la seule attention réelle étant une
  `REGEX_DIVERGENCE` rétrocompatible (anciens ET nouveaux noms acceptés).
- **(b)** est sur-ingénierie : le mécanisme actuel DRAINE déjà la pile — `.at(-1)` propose la
  plus récente à chaque ouverture, « Fusionner »/« Jeter » la retire, la prochaine ouverture
  propose la précédente. Ajouter : dans le dialogue, mention du nombre restant (« N autre(s)
  copie(s) en attente ») pour que l'utilisateur sache que la pile n'est pas vide.
- **(c)** écarté : fusionner deux instantanés de notre propre travail sans les montrer est
  l'écrasement sémantique silencieux qu'on cherche à éliminer (cf. B3), et redondant avec (a).

Pourquoi ne pas jeter les copies anciennes en ne gardant que la dernière : chaque copie
détient un travail qui N'EXISTE NULLE PART AILLEURS. Après un 412, la réouverture recharge
la VERSION SERVEUR (le contenu mis de côté n'y est pas) ; les modifications suivantes partent
de cette base, donc la copie suivante ne contient pas la précédente. L'ancienneté d'une copie
ne dit rien de sa redondance. Le volume reste faible par construction : une copie = un
incident de contournement (rare), et le chemin normal est la résolution immédiate au dialogue
(l'accumulation suppose des « Plus tard » répétés). Pas de ramasse-miettes ; si besoin un jour,
un nettoyage des copies très anciennes se rajoutera.

Cas à tester une fois la correction posée :

1. **Deuxième divergence avant résolution de la première.** Max subit un 412 (copie C1),
   rouvre l'entretien, choisit « Plus tard », retravaille, subit un second 412 (copie C2)
   — DANS LE MÊME LANCEMENT (le cas critique découvert ci-dessus) puis DANS UN SECOND
   lancement. Attendu : C1 et C2 coexistent dans `listerDivergences`, aucune n'écrase l'autre ;
   la fusion de C1 puis de C2 cumule les apports sans doublon (les ids de C1 déjà absorbés
   sont absents de C2… sauf si le contournement a réintroduit les mêmes ids — à préciser).
   *Banc : embarqué.*
2. **Fusion → publication → nouveau 412.** Après absorption d'une copie, le serveur bouge
   encore avant notre publication : nouvelle rétrogradation, nouvelle copie. Vérifier que la
   boucle divergence/fusion peut se rejouer sans perte ni duplication et que l'UI re-propose
   bien le dialogue à chaque fois.
   *Banc : embarqué.*
3. **« Jeter » sur une copie, l'autre conservée.** Deux copies pendantes, on jette C1 :
   C2 reste proposable et fusionnable (et effectivement RE-proposée — cf. découverte sur
   `.at(-1)`).
   *Banc : embarqué.*

## B. Sémantique de la fusion — cas à trancher AVANT d'écrire les tests

La fusion est une union par identité stable, « le courant gagne ». Trois zones d'ombre à
arbitrer (décision consignée ici, puis test qui l'incarne) :

1. **Résurrection d'éléments supprimés côté serveur.** Si le contournement (ou une édition UI
   web) SUPPRIME une annotation que notre copie de divergence contient encore, l'union par id
   la réintroduit : la suppression d'autrui est annulée en silence. Options : (a) accepter
   (la copie représente « notre travail », on ne perd rien), (b) signaler dans le bilan de
   fusion (« X éléments présents dans la copie mais absents de la version actuelle »),
   (c) proposer un choix par élément. Position retenue : …
2. **Locuteurs et décalage d'index.** L'identité d'un locuteur est son INDEX, référencé par
   les blocs du transcript (`attrs.loc` dans le doc ProseMirror), les EAV (`CibleValeur`), le
   journal d'undo/redo, les requêtes, la migration SonalPi1 et l'export. Si le contournement insère
   un locuteur en tête alors que notre copie en avait ajouté un en queue, les indices de la
   copie pointent chez nous vers d'autres tours. La garde « texte identique » ne protège pas
   ici (ajouter un locuteur ne change pas `corpsTexte`).

   Options étudiées :

   - **(a) Remplacer l'index par un id opaque partout** (comme les catégories, `genId('cat')`) :
     identité robuste, mais coût disproportionné — réécriture des `attrs.loc` de TOUS les
     entretiens existants (migration de données lourde, bump de format), refonte journal /
     requêtes / import-export / migration SonalPi1. Le seul lieu où deux versions parallèles
     coexistent est la fusion d'une copie de divergence (rare).
   - **(b) Champ ADDITIF `id?: string` sur `Locuteur`** (même idiome que `pseudo`/`couleur`,
     pas de bump de version) : `genId('loc')` à la création (`ajouterLocuteur`), backfill
     opportuniste à l'ouverture des fichiers anciens ; la fusion apparie PAR ID quand les deux
     côtés en ont un, repli `index + nom` sinon ; garde conservatrice — listes structurellement
     divergentes (nombres/ordres incompatibles) → PAS de fusion automatique des locuteurs,
     proposition manuelle.

   NB : l'id règle l'IDENTITÉ, pas la politique de conflit — deux `valeursLoc` contradictoires
   sur un même locuteur restent « courant gagne » silencieux (cf. point 3 ci-dessous).
   *Position retenue : **(b)** — champ additif `id?: string`. Les catégories peuvent se
   permettre un id opaque natif car rien ne les référençait avant ; les locuteurs, eux, sont
   index-couplés de bout en bout (blocs du transcript, EAV, journal d'undo/redo, requêtes,
   import/export `.sonal`, migration SonalPi1). Une refonte complète imposerait de réécrire les
   `attrs.loc` de tous les entretiens existants (migration lourde + bump de format) pour
   couvrir un seul scénario rare : deux versions parallèles d'un même entretien ne coexistent
   que dans une copie de divergence. Le champ additif donne aux FUSIONS une identité stable
   sans toucher au format ni au code existant ; l'index reste la clef interne d'un fichier
   (ordre des tours), l'id n'est consulté que pour apparier deux versions.*
3. **Valeurs EAV modifiées des deux côtés.** « Le courant gagne » est silencieux : le bilan ne
   compte que les AJOUTS de la copie. Une valeur que les deux postes ont fixée différemment
   prend ours sans que personne ne le sache. À trancher : le bilan doit-il compter des
   « conflits écartés » affichés au dialogue ?
   *Position retenue : …*

## C. Interactions avec le reste du protocole

1. **Copie pendante + entretien supprimé par un tiers.** Oliviers supprime l'entretien
   (double verrou, MOVE corbeille) pendant que max garde une copie de divergence. Attendu :
   l'ouverture du dialogue ne cible plus rien de cassé ; la copie reste listée (elle est un
   artefact local) avec une issue nette (« jeter »), jamais une fusion vers un fichier absent ;
   le pull qui retire l'entretien du miroir n'efface pas les copies de `sessions/`.
   *Banc : embarqué, puis A/B.*
2. **Reprise crash §4.5 avec divergences existantes.** Des copies pendantes + verrous orphelins
   d'un crash : « Abandonner » (déverrouille sans publier) doit préserver les copies ; les
   deux mécanismes (dialogue orphelins, dialogue fusion) doivent se proposer dans un ordre
   compréhensible à l'ouverture du corpus puis de l'entretien.
   *Banc : embarqué.*
3. **Divergence entretien + transaction corpus.json concurrente dans la même fenêtre.** Max
   subit un 412 d'entretien PENDANT qu'olivier pousse une règle anon (transaction corpus) :
   au prochain pull, max doit traverser ET la réconciliation I-POR-3 ET la proposition de
   fusion, dans cet ordre ou l'inverse, sans que l'une masque l'autre (aujourd'hui testés
   séparément seulement).
   *Banc : piles A et B (scénario deux postes étendu).*
4. **Trois postes.** Max tient le verrou ; olivier contourne (UI web) et écrit ; marie tire à
   mi-chemin. Attendu : badges cohérents chez les trois, publication de max en 412, copie chez
   max seul, marie ne voit jamais d'état intermédiaire incohérent.
   *Banc : piles A et B.*

## Bancs et cadence

- Les cas A et C1/C2 se jouent sur le **serveur WebDAV embarqué** (rapides, déterministes) ;
  C3/C4 et toute décision issue de B se rejouent sur les **deux piles Docker** (variante A pour
  le verrou entretien, variante B partout), comme les scénarios `test/webdav/scenario-*.test.ts`
  (`fileParallelism: false` déjà en place).
- Ordre suggéré : trancher B1–B3 → A1–A3 + C1/C2 sur le banc embarqué → C3/C4 contre Docker.
