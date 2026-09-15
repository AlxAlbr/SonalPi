# Plan — Tableau de bord

> Statut : plan d'implémentation, rien n'est codé.
> Fonction : suivi visuel de l'avancement du travail sur le corpus — une grille
> lignes (entretiens) × colonnes (étapes), chaque cellule portant un marqueur
> « en cours » / « OK », un texte court, une date et, en corpus distant, un responsable.
> Découverte depuis le bouton « Tableau de bord » de la barre d'outils (déjà présent,
> désactivé dans `BarreOutils.vue`).

## 1. Intention

Le tableau de bord est une **vue de pilotage**, pas un éditeur : il répond à la
question « où en est le travail sur ce corpus ? » d'un coup d'œil. Il vit à
l'échelle du corpus (comme les recueils et les cas), pas à l'échelle d'un
entretien.

L'utilisateur ouvre une fenêtre avec une grille :

- **une ligne par entretien suivie**, initialisée avec une seule ligne « entretien 1 » ;
- **des colonnes-étapes** créées par défaut : « prise de contact », « enregistrement »,
  « note à chaud », « correction », « pseudonymisation », « variable », « thématisation » ;
- il peut ajouter, renommer, supprimer lignes et colonnes ;
- dans une case, il pose un marqueur « en cours » ou « OK », avec un texte court
  d'accompagnement et une date ; au survol, le contenu de la case est visible ;
- en corpus distant, la case peut porter un **responsable** (nom libre) qui dit
  qui s'occupe de cette étape pour cet entretien.

Le tableau est partagé avec le corpus (comme les recueils) : tous les postes
voient le même tableau, il doit donc suivre le protocole d'édition distant
existant.

## 2. Modèle proposé

Types purs dans `src/shared/corpus/tableaubord.ts`, contrat de sérialisation
dans `src/shared/format.ts`. Identifiants opaques (`genId` existant), l'ordre
des tableaux est l'ordre affiché (pas de champ `rang` redondant).

```ts
type StatutCellule = 'ok' | 'encours'

interface ColonneTableau { id: string ; nom: string }
interface LigneTableau   { id: string ; nom: string }

interface CelluleTableau {
  statut?: StatutCellule          // absent = case vide (rien posé)
  note?: string                   // texte court d'accompagnement
  date?: string                   // ISO — posée à la première saisie, conservée ensuite, modifiable (Q2)
  responsable?: string            // nom libre, surtout en corpus distant
}

interface TableauBord {
  colonnes: ColonneTableau[]
  lignes: LigneTableau[]
  /** cellules[ligneId][colonneId] ; absent = case jamais touchée */
  cellules: Record<string, Record<string, CelluleTableau>>
}
```

Colonnes par défaut (identités stables, jamais régénérées à l'ouverture) :
`contact`, `enregistrement`, `note-chaud`, `correction`, `pseudonymisation`,
`variable`, `thematisation`.

## 3. Décisions acquises et questions restantes

### Q1 — Stockage : `tableaubord.json` séparé ou `corpus.json` ? — Tranché

**Décision : `corpus.json.tableaubord`.** Le protocole distant est bâti autour d'un
seul fichier corpus (verrou court `verrous/corpus.lock.json`, GET frais, PUT
If-Match, miroir par ETag) ; un second fichier point chaud exigerait un nouveau
cycle de verrous, d'inventaire et de compatibilité entre clients de versions
différentes, pour un gain de taille négligeable. C'est le même arbitrage que
pour les recueils ; la migration vers un fichier dédié resterait possible un
jour, comme évolution explicite.

Les deux options, pour trace :

| Option | Avantages | Coûts |
| --- | --- | --- |
| A. `corpus.json.tableaubord` (retenu) | Zéro nouveau mécanisme : `TransactionsCorpus`, verrou corpus, miroir, publications et journal existent déjà — c'est le choix fait pour les recueils | Le point chaud `corpus.json` concentre encore une donnée (volume négligeable : quelques Ko) |
| B. Fichier dédié `tableaubord.json` dans le dossier du corpus | Découplage, fichier minuscule isolé | **Nouveau cycle de fichiers à distance** : le protocole actuel suppose UN fichier corpus (`CHEMIN_CORPUS = 'corpus.json'` dans `distant/transactions.ts`) ; un second fichier suppose un deuxième verrou court ou un verrou couvrant deux fichiers, un inventaire étendu du miroir, des plans de transaction, des conflits à deux cibles — pour un gain de taille de fichier négligeable |

### Q2 — La date : automatique à la première saisie, modifiable — Tranché

**La date est posée automatiquement à la première saisie du contenu de la
 cellule, puis conservée par défaut ; l'utilisateur peut la modifier.** Précisément :

- quand une commande pose ou change le statut / la note d'une cellule SANS date
  existante, le modèle pose la date du jour (date de saisie) ;
- si la cellule a déjà une date, les modifications suivantes **ne la déplacent
  pas** : c'est la date d'origine qui reste visible (l'utilisateur qui reprend
  une note en la complète ne perd pas la date de sa première intervention) ;
- le popover permet de modifier la date explicitement (ou de la vider — la
  prochaine modification la reposera) ;
- vider entièrement la cellule efface sa date (état « jamais touché »).

### Q3 — Les lignes sont-elles liées aux entretiens réels du corpus ? — Tranché

**Lignes libres.** Le nom « entretien 1 » est du texte, sans identité liée au
`membership` : le tableau ne référence rien hors de lui-même (invariant 2),
aucun diagnostic de référence cassée n'est à construire.

Un lot optionnel pourra proposer « créer une ligne par entretien du corpus »
comme geste d'amorçage, sans créer de lien durable.

### Q4 — Périmètre du marqueur — Tranché (proposition)

Trois états visuels : **vide**, **en cours**, **OK**. Pas de statuts personnalisés
ni de couleurs libres au premier livrable. La cellule s'édite dans un petit
popover (statut, note, responsable) ; le survol montre le contenu quand la cellule
est renseignée.

## 4. Comportements notables

- La création d'un tableau (corpus neuf) pose les 7 colonnes par défaut et une
  ligne « entretien 1 » ; un corpus existant reçoit le même tableau à la migration.
- Supprimer une colonne ou une ligne supprime ses cellules — **confirmation** si
  des cellules renseignées disparaissent ; suppression simple sinon.
- Renommer une colonne ou une ligne ne touche jamais les cellules (identités stables).
- La case se remplit au clic : la date du jour est posée à la première saisie et
  conservée lors des compléments suivants (modifiable ou vidable dans le
  popover) ; une case renseignée s'ouvre au clic et se vide via le popover.
- Le champ responsable est présent dans le popover quel que soit le corpus
  (simple et sans logique conditionnelle), mais n'a de sens affiché qu'en
  distant — à trancher à l'implémentation, sans bloquer.
- Hors ligne (corpus distant) : les mutations du tableau suivent la politique
  corpus — refus clair, pas de file d'attente implicite ; brouillon de saisie
  conservé à l'écran en cas de conflit.

## 5. Invariants

1. Identités opaques et stables pour colonnes, lignes (et indirection
   ligne×colonne pour les cellules) ; jamais dérivées des noms ni des positions.
2. Le tableau ne référence rien hors de lui-même : aucune dépendance au
   `membership`, aux annotations, aux repères — donc aucun état « cassé » possible.
3. Les cellules sont éditées par commandes ciblées (une cellule, une colonne, une
   ligne), jamais par remplacement global du tableau depuis une copie renderer.
4. La suppression d'une ligne/colonne ne supprime rien hors du tableau.
5. Lecture = projection : lire le tableau n'écrit jamais.

## 6. Intégration technique

| Couche | Travail |
| --- | --- |
| `src/shared/corpus/tableaubord.ts` | Types + commandes pures : `tableauBordParDefaut()`, `appliquerCommandeTableauBord()` (ajout/renommage/suppression de lignes et colonnes, édition de cellule), validation |
| `src/shared/format.ts` | Champ `tableaubord` de `CorpusFichier`, types exportés ; **bump `FORMAT_VERSION` 7 → 8** avec normalisation à la lecture (tableau par défaut si absent), comme pour recueils et cas |
| `src/main/corpusStore.ts` | Lecture du tableau avec le corpus, handler `corpus:commandeTableauBord` calqué sur les commandes recueils |
| `src/main/distant/transactions.ts` | Les mutations passent dans les `TransactionsCorpus` existantes (verrou corpus court, GET frais, commande ciblée, PUT If-Match) — rien à inventer, stockage dans `corpus.json` retenu |
| `src/preload/index.ts` | Contrat typé du pont |
| `src/renderer/composables/corpus/useTableauBordCorpus.ts` | Orchestration : ouverture, commandes, invalidation après tirage distant / changement de corpus / autosave, à l'image de `useRecueilsCorpus.ts` |
| `src/renderer/components/corpus/TableauBord.vue` | Fenêtre grille HTML (table), cellules cliquables, popover d'édition, info-bulle au survol, gestion des colonnes/lignes |
| `src/renderer/components/app/BarreOutils.vue` | Activer le bouton, brancher sur l'ouverture de la fenêtre |

Points d'attention hérités des chantiers précédents :

- auditer les chemins qui reconstruisent ou normalisent `corpus.json` (création,
  import V1, squelette, transactions distantes, miroir) pour que le tableau
  survive à toutes les réécritures — ne pas conclure « champ optionnel donc
  rétrocompatible » sans vérifier ;
- ignorer les réponses tardives d'un ancien corpus ou d'un ancien chargement ;
- en conflit distant, conserver la saisie en cours comme brouillon visible.

## 7. Découpage de réalisation

### Lot 0 — Arbitrages
- [x] Q1 : stockage — retenu `corpus.json.tableaubord`.
- [x] Q2 : date posée automatiquement à la première saisie, conservée ensuite,
      modifiable (ou vidable) par l'utilisateur.
- [x] Q3 : lignes libres, sans lien au `membership`.

### Lot 1 — Modèle pur et contrat
- [ ] `shared/corpus/tableaubord.ts` : types, tableau par défaut, commandes pures.
- [ ] `shared/format.ts` : champ + bump version 8 + normalisation à la lecture.
- [ ] Tests purs : commandes, suppressions avec/sans cellules, normalisation.

### Lot 2 — Store, IPC, distant
- [ ] Handler store + pont preload.
- [ ] Passage par `TransactionsCorpus` (option A) : conflit ciblé, hors ligne.
- [ ] Tests store : persistance, migration d'un corpus existant, distance.

### Lot 3 — Interface
- [ ] Composable + composant fenêtre + bouton actif.
- [ ] Survol, popover, confirmations de suppression.
- [ ] Invalidation après tirage distant / changement de corpus.

### Lot 4 — Finition
- [ ] Tests E2E du parcours : poser un marqueur, rouvrir, deuxième poste.
- [ ] Doc utilisateur (`docs/user`).

## 8. Matrice de tests minimale

| Domaine | Cas |
| --- | --- |
| Modèle pur | CRUD lignes/colonnes, édition de cellule, date posée à la première saisie puis conservée aux modifications suivantes, reposée après vidage de la date, suppression avec cellules renseignées (refus sans confirmation côté UI, perte assumée après), identités stables aux renommages |
| Format | Migration 7 → 8 : tableau par défaut injecté, conservation à toutes les réécritures (création, import, miroir, transactions) |
| Store | Round-trip complet, réécriture après commande, échec d'écriture |
| Distant | Deux postes éditent des cellules différentes (les deux passent), même cellule (conflit résolu par relire-modifier), hors ligne refusé, tirage rafraîchit la vue |
| UI | Survol révèle note/date/responsable, case vide vs renseignée, suppression confirmée |

`npm run typecheck`, `npm test`, `npm run build` à chaque lot ; scénario E2E en
lot 4. Les bancs Nextcloud ne sont pas requis par ce plan seul (images déjà en
place : `npm run nc:up` / `nc-b:up`, jamais de pull ni de reprovisioning).

## 9. Critère de réussite

L'utilisateur ouvre le tableau de bord, voit en un coup d'œil l'état d'avancement
de chaque entretien sur chaque étape, pose et modifie des marqueurs avec note,
date et responsable, ajuste sa grille, et retrouve — y compris depuis un second
poste après tirage distant — exactement ce tableau.

## 10. Sur la complexité (résumé)

**Modérée et bien bornée : plus simple que les recueils, car il n'y a aucun
ancrage dans les entretiens** — pas de remappage ProseMirror, pas de résolution
de références, pas d'état « cassé » possible (invariant 2). Le modèle pur tient
en un fichier d'une centaine de lignes. Le coût réel se concentre sur deux
points : (1) l'**arbitrage de stockage** — l'option B (fichier dédié) coûterait
cher côté protocole distant, l'option A est quasi gratuite ; (2) le **bump de
version de `corpus.json`**, à auditer sur tous les chemins de réécriture, comme
pour chaque évolution du format. L'interface est une grille HTML simple. En
ordre de grandeur : un chantier plus court que « recueils », comparable aux
ajouts d'agrégats déjà faits (cas, recueils) amputés de leur partie la plus
difficile.
