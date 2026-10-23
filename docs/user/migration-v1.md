# Passer de SonalPi1 à SonalPi2

Guide utilisateur de la migration : un corpus SonalPi1 (`.crp` + `.Sonal`) devient
un corpus SonalPi2 (dossier dédié : `corpus.json` + `entretiens/` + `png/`), en
préservant l'identité du projet et son contenu.

---

## 1. Le parcours en 4 étapes

Depuis l'**Accueil**, la carte **« 🚚 Migrer un corpus SonalPi1… »** ouvre la
modale de migration.

1. **Choisir le `.crp`** — le fichier est LU (détection d'encodage automatique :
   UTF-8 ou windows-1252, comme SonalPi1). Rien n'est écrit.
2. **Aperçu** — nom du corpus, date de création, nombre d'entretiens, thèmes,
   variables, règles d'anonymisation et éventuels réglages Lexico trouvés à côté
   du `.crp`. Si le `.crp` est illisible ou d'une
   version inconnue, un refus clair s'affiche.
3. **Choisir le dossier dédié** — un dossier = un corpus. Il est pré-rempli
   avec `Documents/Sonal/<nom-du-corpus>`, modifiable. **On n'écrase jamais** :
   un dossier qui contient déjà un `corpus.json` (ou le corpus d'un mode démo)
   est refusé. Un dossier non vide sans `corpus.json` demande un avertissement
   confirmé (ses fichiers non liés restent en place).
4. **Migrer** — le corpus SonalPi2 est créé, **ouvert automatiquement** et ajouté aux
   Récents.

## 2. Ce qui est migré

| Contenu SonalPi1 | Devenir SonalPi2 |
|---|---|
| `nom` du projet (ou nom de fichier du `.crp`) | `corpus.json.nom` — l'identité voyage avec le corpus, elle survit au renommage du dossier |
| `dateCreation`, chemin du `.crp` | trace `meta.sourceV1` dans `corpus.json` |
| `tabThm` (thèmes, couleurs, tailles, hiérarchie) | `codebook` — **l'arbre thématique est repris tel quel**, y compris les suppressions faites en SonalPi1 (rien n'est ré-injecté) |
| `tabVar` / `tabDic` (variables + modalités) | `variables` (portée entretien/locuteur, privé, modalités) |
| chaque entretien (`.Sonal`) | un entretien SonalPi2 `entretiens/<id>.json` : texte, annotations (thèmes, anon), locuteurs, valeurs — avec la trace `meta.sourceV1.rtrPath` |
| `audioPath` de chaque entretien | `meta.audioRef` — **chemin absolu référencé, aucune copie** (l'audio reste où il est) |
| règles d'anonymisation portées par les `.Sonal` (`anon-json`) | `corpus.json.reglesAnon` (dédupliquées par entité) |
| annexes Lexico `.out`, `.lem` et `.cnct` portant le même nom que le `.crp` | mots outils, regroupements et concaténations dans `corpus.json.lexico` |

### Cas particuliers

- **`.Sonal` manquant sur disque** : l'entretien est quand même créé — vide, avec
  son audio s'il y en a un. Le corpus SonalPi2 reflète toujours le corpus SonalPi1.
- **Audio absent** : `audioRef` reste `null`, l'entretien est importé quand même.
- **Annexe Lexico absente ou partiellement invalide** : la migration continue et le
  bilan indique les lignes ignorées. Le résultat d’analyse `.lexaf.json` n’est pas repris.
- **Un seul `.crp` par dossier dédié** : si le dossier SonalPi1 contient plusieurs
  `.crp`, on les migre **un par un**, chacun vers son propre dossier dédié.
- **Idempotence** : re-migrer le même `.crp` vers le même dossier est refusé par
  les gardes (on n'écrase jamais).

## 3. Consignes

- **Ne pas supprimer l'ancien dossier SonalPi1 tout de suite** : il reste lisible par
  SonalPi1 tant que la migration n'a pas été validée côté SonalPi2. Aucun fichier SonalPi1
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

| Élément SonalPi1 | Statut | Pourquoi |
|---|---|---|
| Corpus **GitLab** en SonalPi1 | Bilan disponible, migration non activée | Voir le parcours GitLab ci-dessous |
| Autres corpus **distants** en SonalPi1 | Non pris en charge | Le parcours opérationnel reste la migration locale |
| Archives / export `.zip` SonalPi1 | hors périmètre | À étudier plus tard |
| Migration **inverse** SonalPi2 → SonalPi1 | hors périmètre | — |

## GitLab : préparer un bilan (migration pas encore disponible)

Depuis l’entrée **« Migration SonalPi1 vers SonalPi2 »**, la carte **GitLab**
permet de préparer un bilan. La carte Local et sa politique média restent inchangées.

1. Choisissez un projet GitLab déjà enregistré dans l’application, ou indiquez
   l’adresse d’un nouveau projet SonalPi1. Les accès enregistrés sont réutilisés,
   sans redemander de connexion, y compris pour un nouveau projet sur la même
   instance. Une connexion n’est demandée que si aucun accès utilisable n’est
   disponible ou si GitLab le refuse. Le projet choisi doit contenir un `.crp`
   SonalPi1 ; sélectionner un corpus SonalPi2 ne le reconvertit pas sur place.
2. Si plusieurs `.crp` sont présents, choisissez le corpus à reprendre.
3. Indiquez un **autre projet GitLab**, accessible au même compte sur la même
   instance : il doit être vide ou contenir uniquement un README, une licence
   et des fichiers usuels de configuration Git. Un dépôt sans branche est accepté
   pour cette préparation.
4. Choisissez l’emplacement futur des médias : un espace Nextcloud/WebDAV déclaré,
   ou le nouveau dépôt GitLab. Le parcours de copie est implémenté, mais reste
   inactif avant vérification sur serveur réel. Il conserve les originaux.
5. Consultez le bilan : nombre d’entretiens et de médias, volume et destination.
   Une référence source inaccessible arrête la préparation et affiche une erreur.

**Rien n’est copié ni publié par ce bilan.** La copie, la reprise après arrêt et
la réouverture sont implémentées, mais attendent leur vérification sur serveur
réel, notamment la lecture sur un autre profil. Les boutons de migration et de
reprise restent désactivés. Fermer le bilan ne modifie ni la source ni les destinations.

Après qualification et activation, le parcours ouvrira le nouveau corpus et
l’ajoutera aux récents. Un arrêt conservera les copies acquises pour une reprise
confirmée sur le même poste, sans remplacer les fichiers existants ni supprimer
les originaux. Pour un espace média externe partagé, chaque autre profil devra
renseigner ses propres accès au même dossier.

## 5. Détails techniques (pour la curiosité / le dépannage)

- **Encodages** : le `.crp` et les `.Sonal` sont détectés (`chardet`) puis
  décodés (`iconv-lite`) comme SonalPi1 le fait — UTF-8 ou windows-1252.
  Les accents survivent.
- **Versions `.crp` acceptées** : non renseignée (corpus sauvés SonalPi1) ou `1.0`.
  Toute autre version → refus propre.
- **Identifiants** : les ids SonalPi1 sont **conservés comme identité** pour les
  thèmes (`cat_NNN`) et reproduits déterministes pour les variables
  (`v{n}`, `v{n}m{m}`) — la parité d'ids avec les `.sonal` importés est
  préservée. Les entretiens reçoivent de nouveaux ids SonalPi2 opaques ; le lien avec
  l'original est gardé dans `meta.sourceV1.rtrPath`.
- **Dérive de définitions** : si un `.sonal` embarquait des copies divergentes
  des thèmes/variables (plus récentes, ou périmées), **le `.crp` fait foi**
  (règle Q7) — les définitions du corpus ne sont pas contaminées, l'entretien
  n'apporte que son texte, ses annotations, ses locuteurs et ses valeurs.