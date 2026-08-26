# Passer de SonalPi V1 à la V2 (SonalPiTestV2)

Guide utilisateur de la migration : un corpus SonalPi V1 (`.crp` + `.Sonal`) devient
un corpus V2 (dossier dédié : `corpus.json` + `entretiens/` + `png/`), en
préservant l'identité du projet et son contenu.

---

## 1. Le parcours en 4 étapes

Depuis l'**Accueil**, la carte **« 🚚 Migrer un corpus SonalPi (V1)… »** ouvre la
modale de migration.

1. **Choisir le `.crp`** — le fichier est LU (détection d'encodage automatique :
   UTF-8 ou windows-1252, comme SonalPi). Rien n'est écrit.
2. **Aperçu** — nom du corpus, date de création, nombre d'entretiens, thèmes,
   variables et règles d'anonymisation. Si le `.crp` est illisible ou d'une
   version inconnue, un refus clair s'affiche.
3. **Choisir le dossier dédié** — un dossier = un corpus. Il est pré-rempli
   avec `Documents/Sonal/<nom-du-corpus>`, modifiable. **On n'écrase jamais** :
   un dossier qui contient déjà un `corpus.json` (ou le corpus d'un mode démo)
   est refusé. Un dossier non vide sans `corpus.json` demande un avertissement
   confirmé (ses fichiers non liés restent en place).
4. **Migrer** — le corpus V2 est créé, **ouvert automatiquement** et ajouté aux
   Récents.

## 2. Ce qui est migré

| Contenu V1 | Devenir V2 |
|---|---|
| `nom` du projet (ou nom de fichier du `.crp`) | `corpus.json.nom` — l'identité voyage avec le corpus, elle survit au renommage du dossier |
| `dateCreation`, chemin du `.crp` | trace `meta.sourceV1` dans `corpus.json` |
| `tabThm` (thèmes, couleurs, tailles, hiérarchie) | `codebook` — **l'arbre thématique est repris tel quel**, y compris les suppressions faites en V1 (rien n'est ré-injecté) |
| `tabVar` / `tabDic` (variables + modalités) | `variables` (portée entretien/locuteur, privé, modalités) |
| chaque entretien (`.Sonal`) | un entretien V2 `entretiens/<id>.json` : texte, annotations (thèmes, anon), locuteurs, valeurs — avec la trace `meta.sourceV1.rtrPath` |
| `audioPath` de chaque entretien | `meta.audioRef` — **chemin absolu référencé, aucune copie** (l'audio reste où il est) |
| règles d'anonymisation portées par les `.Sonal` (`anon-json`) | `corpus.json.reglesAnon` (dédupliquées par entité) |

### Cas particuliers

- **`.Sonal` manquant sur disque** : l'entretien est quand même créé — vide, avec
  son audio s'il y en a un. Le corpus V2 reflète toujours le corpus V1.
- **Audio absent** : `audioRef` reste `null`, l'entretien est importé quand même.
- **Un seul `.crp` par dossier dédié** : si le dossier V1 contient plusieurs
  `.crp`, on les migre **un par un**, chacun vers son propre dossier dédié.
- **Idempotence** : re-migrer le même `.crp` vers le même dossier est refusé par
  les gardes (on n'écrase jamais).

## 3. Consignes

- **Ne pas supprimer l'ancien dossier V1 tout de suite** : il reste lisible par
  SonalPi V1 tant que la migration n'a pas été validée côté V2. Aucun fichier V1
  n'est jamais modifié ou renommé par la migration.
- Si un `.Sonal` référencé a été déplacé, remettez-le à son emplacement d'origine
  (à côté du `.crp`) **avant** de migrer — sinon l'entretien arrivera vide.
- Après migration, vérifiez à l'ouverture de chaque entretien que le lecteur
  charge bien l'audio (le bandeau d'intégrité du corpus signale les références
  manquantes).

## 4. Ce qui n'est PAS migré

La migration couvre tout le contenu effectif des entretiens et les définitions
du corpus : texte + codages, audio, thèmes, variables EAV, **notes** (`txtnotes`
→ note « générale », la chaîne brute restant en `legacy.notes` sans perte),
**anonymisation** (règles `tabAnon` → `reglesAnon`, y compris les règles isolées
sans occurrence dans un `.sonal`, leur `thematique` → `categorie`, et les
réglages `paramsAnonCorpus` → `paramsAnon`) et **commentaires** posés sur le
texte (spans `data-obs` / `data-auth` / `data-finobs` → annotations
`Annotation{type:'commentaire'}`). Ne restent hors périmètre que :

| Élément V1 | Statut | Pourquoi |
|---|---|---|
| Corpus **distants** (GitLab / serveur) en V1 | hors périmètre | Migration locale uniquement |
| Archives / export `.zip` V1 | hors périmètre | À étudier plus tard |
| Migration **inverse** V2 → V1 | hors périmètre | — |

## 5. Détails techniques (pour la curiosité / le dépannage)

- **Encodages** : le `.crp` et les `.Sonal` sont détectés (`chardet`) puis
  décodés (`iconv-lite`) comme SonalPi V1 le fait — UTF-8 ou windows-1252.
  Les accents survivent.
- **Versions `.crp` acceptées** : non renseignée (corpus sauvés V1) ou `1.0`.
  Toute autre version → refus propre.
- **Identifiants** : les ids V1 sont **conservés comme identité** pour les
  thèmes (`cat_NNN`) et reproduits déterministes pour les variables
  (`v{n}`, `v{n}m{m}`) — la parité d'ids avec les `.sonal` importés est
  préservée. Les entretiens reçoivent de nouveaux ids V2 opaques ; le lien avec
  l'original est gardé dans `meta.sourceV1.rtrPath`.
- **Dérive de définitions** : si un `.sonal` embarquait des copies divergentes
  des thèmes/variables (plus récentes, ou périmées), **le `.crp` fait foi**
  (règle Q7) — les définitions du corpus ne sont pas contaminées, l'entretien
  n'apporte que son texte, ses annotations, ses locuteurs et ses valeurs.