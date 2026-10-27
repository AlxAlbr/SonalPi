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
2. **Bilan court** — nombre d’entretiens et reprise des réglages. Les listes de
   thèmes, variables et règles restent disponibles dans **« Voir les détails »**.
   Si le `.crp` est illisible ou d’une version inconnue, la migration est refusée.
3. **Choisir le dossier dédié** — un dossier = un corpus. Il est pré-rempli
   avec `Documents/Sonal/<nom-du-corpus>`, modifiable. **On n'écrase jamais** :
   un dossier qui contient déjà un `corpus.json` (ou le corpus d'un mode démo)
   est refusé. Un dossier non vide sans `corpus.json` demande un avertissement
   confirmé (ses fichiers non liés restent en place).
4. **Vérifier puis migrer** — après le choix du dossier, le bilan indique aussi les
   documents qui seront conservés dans **`Autres/`**, sans conversion, et les éventuels
   éléments non repris. Le corpus SonalPi2 est créé, **ouvert automatiquement** et
   ajouté aux Récents. L’ancien dossier reste intact.

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
| ancien résultat Lexico `.lexaf.json`, exports, documents ou formats inconnus non convertis | copies dans `Autres/`, avec les mêmes noms et sous-dossiers ; pas d’intégration automatique aux outils d’analyse |

### Cas particuliers

- **`.Sonal` manquant sur disque** : l'entretien est quand même créé — vide, avec
  son audio s'il y en a un. Le corpus SonalPi2 reflète toujours le corpus SonalPi1.
- **Audio absent** : `audioRef` reste `null`, l'entretien est importé quand même.
- **Annexe Lexico absente ou partiellement invalide** : les réglages reconnus sont
  repris, le bilan avertit des parties ignorées et le fichier incomplet est conservé
  dans `Autres/` s’il est accessible. Un résultat `.lexaf.json` est conservé tel quel,
  mais n’est pas transformé en analyse utilisable dans SonalPi2.
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

## 4. Documents conservés sans conversion

Dans les deux parcours, le dossier du `.crp` choisi est inventorié, y compris ses
sous-dossiers. Les documents supplémentaires sont copiés dans **`Autres/`** en
conservant leur arborescence et leurs octets d’origine. Ce n’est pas une nouvelle
analyse : un ancien résultat Lexico, un tableau exporté ou un document inconnu est
conservé comme fichier, sans être recalculé ou réinterprété.

- **Local** : `Autres/` se trouve dans le nouveau dossier SonalPi2. Les médias
  référencés conservent leur politique habituelle : aucune copie de ces médias.
- **GitLab** : `Autres/` se trouve dans le nouveau dépôt, même si les médias sont
  copiés dans un espace externe. Consultez ces documents dans le dépôt GitLab ;
  ils ne sont pas ajoutés automatiquement à la liste des analyses de SonalPi2.
- Les fichiers déjà convertis ne sont pas dupliqués dans `Autres/`. Les documents
  rattachés à un autre corpus identifiable dans ce dossier sont écartés. Si plusieurs
  corpus partagent le dossier, un avertissement demande de vérifier la liste.
- Les éléments techniques et certains fichiers d’accès connus sont exclus et
  signalés. Ce filtrage des noms ne remplace pas une vérification des documents
  contenant des données sensibles avant de les envoyer dans un autre dépôt.
- Un lien local vers un autre emplacement n’est pas suivi ni copié. Une source
  GitLab contenant des liens ou des sous-modules non pris en charge peut être refusée.
- Aucun dossier `Autres` existant n’est remplacé. En local, choisissez une autre
  destination si ce dossier existe déjà. Une modification de la source après le
  bilan impose de refaire ce bilan.

Les avertissements restent visibles ; les listes de fichiers et les raisons
précises sont repliées sous **« Voir les détails »**.

## 5. Ce qui n'est PAS converti

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
| Autres corpus **distants** en SonalPi1, hors GitLab | Non pris en charge | Seuls les parcours Local et GitLab sont proposés |
| Archives / export `.zip` SonalPi1 | Conservés comme fichiers, pas convertis | Le contenu des archives n’est pas parcouru |
| Migration **inverse** SonalPi2 → SonalPi1 | hors périmètre | — |

## GitLab : migrer vers un nouveau dépôt

Depuis l’entrée **« Migration SonalPi1 vers SonalPi2 »**, la carte **GitLab**
permet de migrer un corpus vers un **nouveau dépôt**, sans modifier la source.
La carte Local et sa politique média restent inchangées.

1. Choisissez un projet GitLab déjà enregistré dans l’application, ou indiquez
   l’adresse d’un nouveau projet SonalPi1. Les accès enregistrés sont réutilisés,
   sans redemander de connexion, y compris pour un nouveau projet sur la même
   instance. Une connexion n’est demandée que si aucun accès utilisable n’est
   disponible ou si GitLab le refuse. Le projet choisi doit contenir un `.crp`
   SonalPi1 ; sélectionner un corpus SonalPi2 ne le reconvertit pas sur place.
2. Si plusieurs `.crp` sont présents, choisissez le corpus à reprendre.
3. Indiquez un **autre projet GitLab**, accessible au même compte sur la même
   instance : il doit être vide ou contenir uniquement un README, une licence
   et des fichiers usuels de configuration Git. Un dépôt entièrement vide convient :
   l’application le prépare automatiquement.
4. Choisissez où **copier** les médias : un espace Nextcloud/WebDAV déclaré,
   ou le nouveau dépôt GitLab. Les originaux sont conservés.
5. Consultez le bilan : nombre d’entretiens et de médias, volume et destination,
   documents conservés dans `Autres/` et éventuels éléments non repris. Les listes
   restent repliées sous **« Voir les détails »**. Une référence source inaccessible
   arrête la préparation et affiche une erreur.

6. Cliquez sur **« Copier les médias et créer le corpus »**, puis confirmez.
   L’application copie les médias, crée le corpus et l’ouvre. Il est ajouté aux récents.

**Rien n’est copié ni publié avant cette confirmation.** Fermer le bilan ne modifie
ni la source ni les destinations.

En cas d’arrêt, les copies acquises sont conservées. Rouvrez la carte GitLab et
choisissez **« Vérifier et reprendre »** sur le même poste et avec le même profil.
Une reprise ne remplace pas les fichiers existants et ne supprime pas les originaux.
Si l’application vient de s’arrêter brutalement et demande de patienter, réessayez
plus tard ; ne recommencez pas la migration vers une nouvelle destination.

Les médias copiés dans GitLab se retrouvent aussi en ouvrant le corpus sur un
profil neuf disposant des accès GitLab. Avec un espace média externe, chaque
profil doit renseigner ses propres accès au même dossier, depuis **« Médias… »**.
**Les vidéos sont copiées dans les deux cas, mais leur lecture depuis l’espace
externe n’est pas encore disponible.** Pour les lire dans l’application, choisissez
la copie dans GitLab ; les formats lisibles dépendent du lecteur existant.

## 6. Détails techniques (pour la curiosité / le dépannage)

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
  Dans le parcours GitLab, les thèmes et variables propres aux `.Sonal`, absents du
  `.crp`, sont également conservés ; les définitions déjà connues restent prioritaires.