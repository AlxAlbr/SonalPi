# Plan — Gardes GitLab légères et publications jusqu’à 250 actions

> **Objet.** Remplacer les mises à jour à contenu inchangé utilisées comme gardes
> de sources par des actions GitLab `chmod` sans effet, puis porter la limite
> interne d’une publication à 250 actions.
>
> **Résultat attendu.** Une transaction peut contrôler jusqu’à 248 entretiens
> sans inclure leurs transcriptions dans le corps du commit. La taille cumulée
> des entretiens ne compte plus dans la limite de 2 Mio de publication ; chaque
> entretien reste lu et validé avant la décision.
>
> **Garantie conservée.** La modification de `corpus.json`, les gardes de toutes
> les sources et la mutation du bail restent dans un seul commit atomique. Une
> source modifiée depuis l’instantané de préparation fait refuser tout le commit.

---

## 0. État final de réalisation

**Statut général : chantier réalisé. Le backend est qualifié sur GitLab CE 18.11,
y compris le mode exécutable, la cardinalité 248 et les mesures de charge. L’UX,
les tests renderer et la documentation sont terminés.**

Le conteneur `gitlab-qualification` a été redémarré tel quel pour les
qualifications de cette session, puis laissé en marche. Aucune image n’a été
téléchargée (`pull_policy: never`).

### 0.1 Réalisé dans le code de production

| Élément | État | Fichiers |
|---|---|---|
| Limite commune à 250 actions | Réalisé | `limitesPublication.ts`, `publication.ts`, `journalPublication.ts` |
| Maximum dérivé à 248 sources | Réalisé | `transactions.ts` |
| Action REST `chmod` | Réalisé par extension du type existant ; l’union discriminée plus stricte reste facultative | `bailGitLab.ts` |
| Action métier `garde` | Réalisé ; compilation vers `chmod` sans `content` | `publication.ts` |
| Lecture de `execute_filemode` | Réalisé et strictement validé | `bailGitLab.ts` |
| Lecture légère par HEAD | Réalisé via `ClientGitLab.lireEntetes()` et `DepotCommitsGitLab.lireGardeFichier()` | `client.ts`, `bailGitLab.ts` |
| Gardes des transactions de corpus | Réalisé ; les contenus restent lus pour la préparation mais ne sont plus publiés | `transactions.ts` |
| Revalidation après 400/409 | Réalisée par HEAD, mode compris | `publication.ts` |
| Journal version 4 | Réalisé ; action `chmod`, limite 250 et lecture des versions 1 à 3 | `journalPublication.ts` |
| Réconciliation d’un `chmod` no-op | Réalisée par HEAD au SHA exact du commit retrouvé | `journalPublication.ts` |
| Contrôle anticipé à un ou deux droits | Réalisé par le paramètre `nombreDroits` | `publication.ts` |
| Message de limite | Réalisé ; il parle de limite de sécurité Sonal | `publication.ts`, `transactions.ts` |
| Gestes globaux dans le renderer | Réalisé : confirmation GitLab, attente indéterminée, garde anti-double-lancement et désactivation des commandes | `operationGlobaleCorpus.ts`, composables et composants concernés, `App.vue` |

Les modifications locales préexistantes sur OAuth, le coffre et les écrans
GitLab ont été conservées. `src/main/gitlab/client.ts` contenait notamment des
changements avant ce chantier ; les ajouts HEAD ont été appliqués sans les
écraser.

### 0.2 Doubles et tests ajoutés ou adaptés

Les doubles de dépôt conservent le mode exécutable et appliquent un `chmod`
no-op sans faire avancer le commit propre du fichier :

- `test/gitlab/depotMemoire.ts` ;
- `test/gitlab/session.test.ts` ;
- `test/gitlab/journal.test.ts`.

Ajouts de cette session :

- les deux attentes textuelles obsolètes `MAX_SOURCES_GARDEES + " acceptés"`
  sont devenues `limite de ${MAX_SOURCES_GARDEES}` dans
  `definitionsSources.test.ts` et `qualificationSources.test.ts` ;
- `journal.test.ts` : une entrée de journal neuve de 250 actions exactement
  (corpus + 248 gardes + mutation témoin, relue par `chargerActions`), refus de
  la 251e dès `preparer()` (l’entrée n’existe pas, même après écriture du
  candidat) ; une vraie entrée version 3 semée en réécrivant la version d’une
  entrée préparée — lecture correcte, nature conservée, borne historique de
  102 vérifiée dans les deux sens (102 actions lues, 250 refusées) ;
- `bailPublication.test.ts` : GET sans `execute_filemode` ou à valeur non
  booléenne refusé (« Réponse de fichier GitLab invalide. ») ; HEAD sans
  en-tête de mode, à mode non `true`/`false`, ou sans identifiant de commit
  refusé (« Métadonnées de fichier GitLab invalides. ») — une valeur absente
  n’est jamais silencieusement remplacée par `false` ;
- `contrat-gitlab.test.ts` : qualification réelle d’un fichier **initialement
  exécutable** — création avec `execute_filemode: true`, garde `chmod` du mode
  observé (201, contenu, mode et dernier commit inchangés), concurrence puis
  garde périmée (400, marqueur absent, mode toujours exécutable) ;
- `qualificationBanc.ts` : le harnais mesure désormais chaque course — `Pile`
  expose `instants` (début/fin par requête, pour séparer lecture et commit) et
  `commitsEnvoyes` (message, nombre d’actions, octets du corps, index de
  requête) ; `fetchCompte` enregistre dans un `finally` pour rester parallèle
  à `requetes`, pannes comprises ;
- `qualificationSources.test.ts` : preuve de volume réelle (quatre sources de
  600 Kio chacune, 2,4 Mio cumulés, déposées une par une pour rester sous la
  limite de requête) et preuve de cardinalité réelle (50, 100 puis 248 petites
  sources par la pile complète, avec mesures) ;
- `operationGlobaleCorpus.test.ts` : confirmation limitée à GitLab, textes de
  volume et de verrous, refus de confirmation, anti-double-lancement, état
  d’attente pendant la promesse et remise à zéro après succès ou erreur.

### 0.3 Validations obtenues

| Commande | Résultat obtenu |
|---|---|
| `npm run test:gitlab` final | 355 réussis, 69 sautés |
| `npm run typecheck` final | réussi après le câblage renderer |
| tests ciblés `journal.test.ts` + `bailPublication.test.ts` | 48 réussis |
| tests ciblés renderer et CAS | 21 réussis |
| banc réel `contrat-gitlab.test.ts -t 'chmod'` | 2 réussis, 19 sautés (mode non exécutable et exécutable) |
| banc réel `qualificationSources.test.ts` complet | 11 réussis (dont volume et cardinalité) |
| `npm test` final | 1 667 réussis, 104 sautés |

Les `AbortError` et `NetworkError` Happy DOM pendant le nettoyage de ressources
CSS externes demeurent un bruit connu sans échec associé.

### 0.4 Mesures de charge obtenues et décision (lot G5)

Toutes par la pile de production sur GitLab CE 18.11, avec 57 à 255 requêtes
par geste (une lecture GET par source, plus résolution de tête, corpus, bail
et commit) :

| Sources | Corps du commit | Requêtes | Lecture | Commit | Total |
|---|---|---|---|---|---|
| 4 × 600 Kio (2,4 Mio) | 5 944 octets | 14 | — | — | 1 760 ms |
| 50 | 22 229 octets | 57 | 3 269 ms | 915 ms | 4 607 ms |
| 100 | 40 037 octets | 107 | 5 647 ms | 1 437 ms | 7 443 ms |
| 248 | 93 317 octets | 255 | 12 523 ms | 2 747 ms | 15 620 ms |

Analyse et décision :

- le pire cas mesuré (248 sources) reste **huit fois sous** le bail corpus du
  harnais (120 s) et le test borne lui-même le total à 120 s ;
- la **concurrence bornée de lecture n’est pas justifiée** (évolution à peu
  près linéaire, marge très large) : la boucle séquentielle est conservée ;
- la **progression réelle `X / N` n’est pas justifiée** (attente maximale
  observée ≈ 16 s) : la première version d’attente indéterminée suffit ;
- la réconciliation après réponse perdue est qualifiée en réel (d9, garde
  vérifiée au SHA du commit, sans rejeu) ; la revalidation de collision par
  HEAD n’est prouvée qu’en mémoire et sur une garde (`bailPublication.test.ts`,
  méthodes `['GET', 'HEAD']`) — une mesure réelle de collision à 248 gardes
  n’a pas été faite et reste optionnelle : ce chemin ne survient que sur un
  refus 400/409 et ne télécharge jamais de contenu.

### 0.5 Périmètre retenu pour l’UX

Gestes réellement globaux, identifiés par la portée sémantique
(`politiqueGestes.ts`) et confirmés dans le code du main :

- portée `suppression-definition` (relit tout le membership avec
  `inventaireComplet` via `executerSuppressionDefinitions`) :
  `theme.supprimer`, `note.supprimer-categorie`, `anon.supprimer-regle`,
  `variable.supprimer`, `modalite.supprimer` ;
- `cas.ajouter-derivation-famille` et `cas.ajouter-derivation-cas`
  (`deduireSourcesCas` retourne tout le membership).

Ne sont **pas** globaux, sans avertissement donc :

- `cas.supprimer-attribut` (portée `definitions-corpus`, ne relit aucune
  source ; la confirmation d’usages existante suffit) ;
- le tri de contenus (lit tout mais ne garde aucun entretien : aucun refus de
  publication concurrente ne peut en sortir) ;
- les rattachements et recueils de passage (une ou quelques sources).

Périmètre de la confirmation : **corpus GitLab uniquement** (`fournisseurCourant
=== 'gitlab'`). Sur un corpus local il n’y a ni gardes ni concurrence ; sur
WebDAV, la mutation ne garde que `corpus.json` — le message « échouera si un
entretien est publié » n’y serait pas exact. Le module créé applique déjà ce
périmètre par `estCorpusGitLab()`.

Verrous déjà visibles : `badgesVerrous` de `useDistantCorpus` est rempli pour
GitLab par le tirage (chemins `entretiens/<id>.json`), filtré de nos propres
sessions côté main. C’est la source du compte « ouverts par d’autres » du
message de confirmation.

### 0.6 Câblage UX réalisé (lot G4)

`operationGlobaleCorpus.ts` reçoit le nombre d’entretiens, le fournisseur et
les verrous observés depuis `creerSonal()`. Les suppressions de définitions et
les deux ajouts de dérivation globale passent par son lanceur. Les retraits de
règles d’anonymisation sont enveloppés avant toute mutation locale lorsqu’ils
suppriment effectivement une règle corpus.

Sur GitLab, le lanceur confirme le geste, refuse un second lancement, expose
l’attente à `App.vue` et rétablit toujours son état. Sur un corpus local ou
WebDAV, il conserve la garde anti-double-lancement mais n’affiche ni confirmation
ni bannière « Vérification de N entretiens », qui y serait inexacte puisque ces
fournisseurs n’emploient pas ces gardes. Les boutons concernés sont désactivés
pendant l’attente. Le refus de concurrence précise désormais qu’aucune
modification n’a été appliquée et invite à réessayer après les autres
publications.

Aucune progression IPC ni concurrence de lecture n’a été ajoutée, conformément
aux mesures de §0.4.

### 0.7 Documentation réalisée

`docs/dev/gitlab.md` décrit les gardes légères, les bornes, la matrice GitLab CE
18.11 et les mesures 50/100/248. `docs/user/corpus-distant.md` explique les
opérations globales sans exposer la primitive de transport. L’ancien
`plan-gitlab-suite.md` porte un avertissement indiquant que ses passages à
100/102 actions, 98 sources et gardes `update` sont historiques.

---

## 1. Constat et décision

### 1.1 Problème actuel

Avant ce chantier, `TransactionsGitLab.actionsGardees()` produisait pour chaque
source une action `update` contenant :

- le chemin de l’entretien ;
- son contenu intégral, pourtant inchangé ;
- son `last_commit_id`.

L’action donne la bonne garantie de concurrence, mais son contenu est échappé
puis inclus dans le JSON de la requête de commit. La limite de 2 Mio devient donc
cumulative. Quelques entretiens substantiels suffisent à empêcher une opération
qui doit contrôler tout le corpus, bien avant la limite de 98 sources.

`corpus.json` ne contient pas les transcriptions. Leur volume apparaît seulement
dans le corps de la requête GitLab à cause de ces actions de garde.

### 1.2 Primitive retenue

Le Commit API de GitLab accepte l’action suivante :

```json
{
  "action": "chmod",
  "file_path": "entretiens/e1.json",
  "execute_filemode": false,
  "last_commit_id": "…"
}
```

Lorsque `execute_filemode` est identique au mode observé :

- le contenu et le mode du fichier restent inchangés ;
- `last_commit_id` est néanmoins contrôlé par GitLab ;
- une garde périmée refuse atomiquement tout le commit ;
- aucun contenu d’entretien ne traverse la requête de publication.

Dans le modèle métier, cette primitive s’appellera **garde**. Le terme `chmod`
restera confiné au transport GitLab : le code appelant ne demande pas un
changement de permissions, mais une précondition sans effet.

### 1.3 Résultat déjà observé sur le banc

Les essais ont été réalisés sur le conteneur existant GitLab CE 18.11 :

| Essai | Résultat |
|---|---|
| `chmod` avec mode inchangé et garde fraîche | HTTP 201 |
| même action après modification de la source | HTTP 400, fichier déclaré modifié |
| action métier jointe à une garde périmée | aucune écriture partielle |
| 248 fichiers de 32 Kio gardés, plus corpus et bail | HTTP 201 |
| taille du corps de cette dernière publication | 36 219 octets |
| durée locale mesurée | 3,76 s |

Les 248 fichiers représentaient environ 8 Mio de contenus. La publication ne les
transportait pas.

### 1.4 Ce qui ne change pas

- `corpus.json` et les entretiens restent des fichiers séparés.
- La limite du corps HTTP reste fixée à 2 Mio.
- Le journal durable et la réconciliation après perte de réponse restent
  obligatoires.
- Les sources sont toujours lues sur le même SHA que `corpus.json`.
- Les références sont toujours validées à partir des contenus publiés.
- Une transaction n’est jamais découpée en plusieurs commits partiellement
  applicables.
- Une édition directe depuis GitLab reste détectée par `last_commit_id`.

### 1.5 Hors périmètre

- Supprimer toute limite sur le nombre d’actions.
- Modifier le format partagé de `corpus.json` ou des entretiens.
- Ajouter des fichiers sentinelles ou un manifeste de révisions dans le dépôt.
- Remplacer l’API REST par un clone Git local.
- Autoriser un entretien qui dépasse déjà les bornes individuelles de lecture ou
  de publication d’une session ordinaire.

---

## 2. Invariants à préserver

La réalisation n’est terminée que si les invariants suivants sont démontrés.

1. **Instantané unique.** `corpus.json`, les contenus et les gardes des sources
   proviennent du même SHA résolu après acquisition du bail corpus.
2. **Mode inchangé.** Une garde utilise exactement `execute_filemode` observé ;
   elle ne suppose jamais qu’un JSON est non exécutable.
3. **Atomicité.** Si une source, le corpus ou le bail a changé, aucune action du
   commit n’est appliquée.
4. **Aucun contenu dans une garde.** Une action métier de garde ne possède pas de
   champ `contenu`, et l’action REST compilée ne possède pas de champ `content`.
5. **Données examinées.** Retirer le contenu du commit ne retire pas sa lecture :
   les validations de références et les recettes continuent à recevoir le JSON
   complet de chaque source.
6. **Résultat perdu réconciliable.** Une réponse réseau perdue ne provoque ni
   rejeu ni faux succès ; le commit trouvé est vérifié à son SHA.
7. **Compatibilité des journaux.** Les entrées produites avant les gardes
   légères restent lisibles et réconciliables.
8. **Limite totale.** Les 250 actions comprennent les actions métier et les
   mutations de bail ajoutées par le publieur.
9. **Refus avant bail quand il est prévisible.** Une transaction à plus de 248
   sources est refusée avant l’acquisition du bail corpus.
10. **Aucune migration de dépôt.** Un corpus GitLab existant bénéficie du nouveau
    protocole dès l’ouverture par une version mise à jour.

---

## 3. Modèle de transport et lecture du mode

### 3.1 Rendre les actions REST discriminées

Dans `src/main/gitlab/bailGitLab.ts`, remplacer si possible l’interface permissive
`ActionCommitGitLab` par une union discriminée. Elle doit au minimum représenter :

- `create` : `file_path`, `content` ;
- `update` : `file_path`, `content`, `last_commit_id` ;
- `delete` : `file_path`, `last_commit_id` ;
- `move` : `file_path`, `previous_path`, `last_commit_id`, contenu facultatif ;
- `chmod` : `file_path`, `execute_filemode`, `last_commit_id`.

Cette précision empêche de construire par erreur un `chmod` avec `content`, ou
un `update` sans contenu.

### 3.2 Propager `execute_filemode`

Étendre `FichierGitLab` avec un booléen de mode, par exemple :

```ts
interface FichierGitLab {
  chemin: string
  commitId: string
  contenu: string
  executable: boolean
}
```

`DepotCommitsGitLabClient.lireFichier()` doit :

- demander et lire `execute_filemode` dans la réponse Repository Files API ;
- exiger un booléen explicite ;
- le retourner avec le contenu et `last_commit_id` ;
- ne jamais remplacer silencieusement une valeur absente par `false`.

Une valeur manquante sur une version de GitLab annoncée compatible doit produire
une erreur de compatibilité claire, pas une mutation implicite de permissions.

### 3.3 Lecture légère d’une garde

Ajouter au port `DepotCommitsGitLab` une lecture de métadonnées sans corps, par
exemple :

```ts
lireGardeFichier(
  chemin: string,
  ref: string,
): Promise<{ commitId: string; executable: boolean } | null>
```

L’adaptateur réel utilisera le `HEAD` de la Repository Files API et vérifiera les
en-têtes GitLab portant le dernier commit et le mode exécutable. Cette méthode
servira :

- à vérifier les gardes après un refus 400/409 ;
- à réconcilier les gardes après une réponse perdue ;
- à éviter de retélécharger plusieurs gros entretiens dans ces chemins d’erreur.

La lecture initiale d’une source conserve `lireFichier()`, car la préparation a
réellement besoin de son contenu.

### 3.4 Qualification de compatibilité

Le banc réel doit confirmer, sur chaque version minimale officiellement prise en
charge :

- la présence de `execute_filemode` dans le GET ;
- les en-têtes équivalents dans le HEAD ;
- l’acceptation d’un `chmod` gardé sans changement de mode ;
- le refus 400 d’un `chmod` dont `last_commit_id` est périmé ;
- l’absence de mutation partielle jointe à ce refus.

Si aucune version minimale n’est encore annoncée, la définir avant de présenter
la garde légère comme portable à toutes les instances GitLab.

---

## 4. Action métier « garde » et compilation

### 4.1 Ne pas exposer `chmod` aux transactions

Étendre `ActionPlanGitLab` dans `src/main/gitlab/publication.ts` avec une action
sémantique :

```ts
{
  action: 'garde'
  chemin: string
  commitId: string
  executable: boolean
}
```

`compilerPlan()` la traduit en :

```ts
{
  action: 'chmod',
  file_path: chemin,
  execute_filemode: executable,
  last_commit_id: commitId,
}
```

Le compilateur conserve les validations existantes : chemin sûr, chemin de bail
interdit aux plans métier, garde SHA valide et absence de doublon. Une garde et
une autre action sur le même chemin dans le même plan doivent être refusées.

### 4.2 Mesurer le corps réellement envoyé

Les contrôles de taille existants restent placés aux deux niveaux :

- contrôle anticipé avant acquisition du droit ;
- contrôle définitif après ajout des actions de bail.

Le contrôle définitif mesure naturellement les actions `chmod`, beaucoup plus
petites. Il ne faut introduire aucune estimation fondée sur la taille brute des
entretiens.

### 4.3 Porter la limite à 250

Après qualification du transport :

```ts
MAX_ACTIONS_PUBLICATION = 250
MAX_SOURCES_GARDEES = MAX_ACTIONS_PUBLICATION - 2 // 248
```

Les deux actions réservées sont :

- la mise à jour de `corpus.json` ;
- la mutation du bail corpus.

Le message de refus ne doit plus affirmer que GitLab impose lui-même cette borne,
car la documentation courante ne définit pas de plafond fixe à 250. Il doit
parler de la **limite de sécurité de Sonal pour un commit**.

Les contrôles anticipés qui peuvent précéder une publication à deux droits
doivent recevoir explicitement le nombre de mutations de bail attendues. Aucun
appelant ne doit supposer implicitement qu’un seul droit sera toujours ajouté.

### 4.4 Centraliser la limite

Le journal contient actuellement deux bornes littérales à 102 actions. Extraire
la limite de publication dans un petit module sans dépendance circulaire, utilisé
par :

- `publication.ts` ;
- `transactions.ts` ;
- `journalPublication.ts` ;
- les tests et messages qui doivent annoncer la valeur courante.

Le publieur demeure l’autorité finale : aucune entrée de journal nouvelle ne peut
contenir plus d’actions que le commit qu’il vient de valider.

---

## 5. Transactions de corpus

### 5.1 Conserver contenu, garde et mode pendant la préparation

Le résultat de `lireSources()` doit porter pour chaque source :

- l’identifiant d’entretien ;
- le contenu JSON complet ;
- `last_commit_id` ;
- le mode exécutable observé.

Le contenu reste transmis à `preparerDefinitions()` pour les contrôles métier.
Le commit n’en reçoit plus une copie lorsque la source sert seulement de garde.

### 5.2 Remplacer les mises à jour inchangées

`actionsGardees()` doit produire :

1. l’action `update` de `corpus.json` ;
2. une action métier `garde` pour chaque source lue.

Une garde ne doit jamais modifier l’objet source ni son mode. Une source réellement
modifiée par un futur geste doit continuer à utiliser une action `update` normale.

### 5.3 Démontrer les courses

Conserver le scénario actuel :

1. résoudre la tête en SHA ;
2. lire corpus et sources à ce SHA ;
3. préparer le candidat ;
4. envoyer corpus, gardes et bail en un commit.

Si une source est publiée après le SHA mais avant le commit, son
`last_commit_id` périme la garde `chmod` et GitLab refuse tout. Si elle a été
publiée avant le SHA, la préparation lit sa nouvelle version.

### 5.4 Temps de lecture de nombreux entretiens

La suppression du volume de publication ne supprime pas le coût de lecture. La
lecture séquentielle de 248 sources peut prolonger fortement la détention du bail.

La première réalisation conserve la boucle séquentielle. Elle est plus simple à
qualifier et suffit à prouver le protocole. Mesurer ensuite 50, 100 puis 248
sources sur le banc réel.

Seulement si ces mesures montrent que l’attente n’est pas acceptable ou menace
la durée du bail, remplacer la boucle par une concurrence bornée, avec une petite
valeur explicite, par exemple quatre à six lectures :

- conserver l’ordre de sortie correspondant aux ids demandés ;
- arrêter l’attribution de nouveaux travaux dès la première erreur ;
- attendre la fin des lectures déjà lancées avant de sortir ;
- ne jamais utiliser un `Promise.all` non borné sur tout le corpus ;
- conserver les retries 429 bornés du client de lecture ;
- vérifier que le pire cas qualifié reste nettement sous les quinze minutes du
  bail corpus.

Cette optimisation est facultative et vient après les preuves d’atomicité. Elle
ne conditionne ni les gardes légères ni l’interface d’attente.

---

## 6. Journal durable et réconciliation

### 6.1 Faire évoluer le format du journal

Introduire une nouvelle version du journal pour reconnaître explicitement les
actions `chmod`. Le lecteur doit continuer à accepter les versions historiques.

Une métadonnée de garde contient :

- `action: 'chmod'` ;
- `file_path` ;
- `last_commit_id` ;
- `execute_filemode`.

Elle ne contient ni `content`, ni empreinte de contenu, ni nombre d’octets de
contenu.

Pour la compatibilité :

- les anciennes versions conservent leur borne historique de 102 lors de la
  lecture ;
- la nouvelle version accepte jusqu’à la limite commune de 250 ;
- les candidats anciens à base d’`update` restent rechargeables ;
- aucun journal existant n’est réécrit seulement pour changer de version.

La limite de 3 Mio du fichier candidat peut rester inchangée : un corps HTTP
validé sous 2 Mio et ses métadonnées tiennent déjà dans cette enveloppe.

### 6.2 Recharger une garde

`chargerActions()` doit vérifier exactement :

- le type `chmod` ;
- le chemin ;
- la garde SHA ;
- le mode attendu ;
- l’absence de contenu.

Une différence entre le candidat opaque et les métadonnées lisibles rend la
publication indéterminée, comme pour les autres corruptions.

### 6.3 Réconcilier une réponse perdue

Un `chmod` sans effet n’apparaît pas nécessairement comme une modification du
fichier dans le diff du commit. La réconciliation ne doit donc pas comparer son
contenu à `undefined` ni exiger que son `last_commit_id` avance.

Pour chaque garde, à la référence exacte du commit retrouvé :

1. lire ses métadonnées avec `lireGardeFichier()` ;
2. exiger que le fichier existe ;
3. exiger que son dernier commit corresponde au `last_commit_id` journalisé ;
4. exiger que son mode corresponde à `execute_filemode`.

Une garde sans effet laisse justement le dernier commit du fichier inchangé. Les
essais réels doivent confirmer cet invariant sur les versions prises en charge.

Les actions qui ont un effet continuent à être vérifiées par leur état final :
contenu de `corpus.json`, bail, création, suppression ou déplacement. Le commit
n’est déclaré confirmé que si toutes les actions vérifiables et toutes les gardes
sont cohérentes.

### 6.4 Revalider après un refus de branche

`PublieurGitLab.gardesTiennent()` doit utiliser `lireGardeFichier()` pour les
actions gardées, y compris `chmod`, `update`, `delete` et l’origine d’un `move`.
Le chemin de collision ne doit pas télécharger les contenus complets.

Une garde `chmod` périmée est un conflit métier, pas une simple collision de tête
de branche. Le commit ne doit pas être renvoyé automatiquement dans ce cas.

---

## 7. Doubles de test

### 7.1 `DepotMemoire`

Étendre le fichier mémoire avec le mode exécutable :

```ts
interface Fichier {
  contenu: string
  commitId: string
  executable: boolean
}
```

Règles d’application :

- les fichiers chargés sans précision sont non exécutables ;
- une action `chmod` vérifie d’abord `last_commit_id` ;
- si le mode demandé est identique, contenu, mode et `commitId` du fichier ne
  changent pas ;
- si un test demande un vrai changement de mode, le mode et le commit du fichier
  avancent ;
- les autres actions préservent ou initialisent le mode comme GitLab ;
- `lireGardeFichier()` ne compte pas comme une lecture de contenu.

Le commit global peut avancer même lorsqu’une garde particulière reste un no-op,
car `corpus.json` et le bail sont réellement modifiés.

### 7.2 Doubles spécialisés

Mettre à niveau les dépôts locaux définis dans :

- `test/gitlab/journal.test.ts` ;
- `test/gitlab/session.test.ts` ;
- les tests qui implémentent directement `DepotCommitsGitLab`.

Éviter une approximation où `chmod` remplacerait le contenu par une chaîne vide :
ce faux comportement masquerait précisément la régression que le changement doit
prévenir.

---

## 8. Matrice de tests automatisés

### 8.1 Transport et compilation

Ajouter des tests couvrant :

- lecture de `execute_filemode: false` et `true` ;
- rejet d’une valeur absente ou non booléenne ;
- lecture HEAD d’une garde existante et d’un chemin absent ;
- compilation d’une action métier `garde` en `chmod` ;
- absence de `content` dans le JSON compilé ;
- refus d’une garde sans SHA, sans mode ou sur un chemin de bail ;
- refus de deux actions visant le même chemin ;
- acceptation de 250 actions totales et refus de 251 ;
- message présentant 250 comme limite Sonal, pas comme limite GitLab.

### 8.2 Transactions avec sources

Dans `test/gitlab/definitionsSources.test.ts` :

- vérifier que les contenus sont lus et utilisés pour préparer la décision ;
- vérifier que le commit contient `corpus.json`, des `chmod` et le bail ;
- vérifier qu’aucune transcription n’apparaît dans les actions de garde ;
- vérifier que le mode `false` et le mode `true` sont tous deux préservés ;
- modifier une source juste avant le commit et constater le refus atomique ;
- vérifier que le miroir n’est pas installé après ce refus ;
- faire dépasser 2 Mio à la somme des sources tout en gardant une publication
  largement inférieure à 2 Mio ;
- accepter 248 petites sources et refuser la 249e avant le bail ;
- vérifier que la déduplication des ids reste appliquée avant le décompte.

### 8.3 Journal

Dans `test/gitlab/journal.test.ts` :

- écrire et relire une garde sans contenu ;
- détecter la corruption de son chemin, de sa garde ou de son mode ;
- accepter une nouvelle entrée de 250 actions ;
- continuer à lire une entrée historique ;
- réconcilier une réponse perdue avec des gardes no-op ;
- rester indéterminé si une garde n’est pas vérifiable au commit retrouvé ;
- ne pas effectuer 248 lectures de contenu pendant la réconciliation ;
- conserver les preuves existantes pour `move`, `delete`, contenu et bail.

### 8.4 Publication et collisions

Dans `test/gitlab/bailPublication.test.ts` :

- remplacer l’attente littérale « 101 actions » par une attente dérivée de la
  constante ;
- vérifier l’annulation des transitions si la 251e action est ajoutée ;
- simuler un 400 avec gardes fraîches et conserver le retry unique de collision ;
- simuler un 400 avec une garde `chmod` périmée et interdire le retry ;
- vérifier que les relectures de collision sont des lectures de métadonnées.

### 8.5 Non-régressions

Conserver les scénarios existants de :

- suppression de définition ;
- rattachement et dérivation CAS ;
- source détenue localement publiée avant la transaction ;
- source détenue par un autre poste ;
- réponse perdue puis réconciliation sans rejeu ;
- bail libéré après refus certain ;
- conflit de définition avec publication de session.

---

## 9. Qualification sur le GitLab Docker réel

### 9.1 Contrat minimal de `chmod`

Ajouter au banc de contrat un scénario autonome :

1. créer une source non exécutable ;
2. lire sa garde et son mode ;
3. publier une mutation témoin avec un `chmod` identique ;
4. vérifier le succès et l’absence de changement de contenu ou de mode ;
5. modifier la source ;
6. renvoyer l’ancienne garde avec une autre mutation témoin ;
7. vérifier HTTP 400 et l’absence de la mutation témoin ;
8. répéter avec un fichier réellement exécutable.

### 9.2 Qualification par la pile de production

Dans `test/gitlab/qualificationSources.test.ts`, ajouter deux preuves distinctes :

**Preuve de volume :**

- déposer plusieurs entretiens dont la somme dépasse 2 Mio ;
- exécuter une vraie transaction de définitions avec sources ;
- vérifier que la publication réussit ;
- mesurer le corps envoyé et vérifier qu’il ne contient pas les transcriptions ;
- vérifier que les contenus et modes des sources n’ont pas changé.

**Preuve de cardinalité :**

- préparer 248 petites sources ;
- vérifier le commit unique `corpus + 248 gardes + bail` ;
- vérifier le refus précoce à 249 sources ;
- afficher le nombre de requêtes, le temps de lecture, le temps de commit et la
  taille du corps.

Le test de cardinalité peut rester dans la campagne longue si sa durée est trop
élevée pour le cycle courant, mais un test mémoire équivalent reste obligatoire
à chaque exécution.

### 9.3 Réponse perdue

Faire perdre la réponse d’une publication à gardes légères, redémarrer la pile et
vérifier :

- que le commit est retrouvé une seule fois ;
- que les gardes sont vérifiées au SHA du commit ;
- que le candidat n’est pas rejoué ;
- que le corpus confirmé est installé ;
- que le journal est retiré après conclusion certaine.

### 9.4 Versions

Consigner pour chaque image qualifiée :

- version et révision GitLab ;
- comportement GET et HEAD du mode ;
- comportement du `chmod` no-op ;
- limite d’actions observée ;
- temps du scénario à 248 sources.

Ne jamais télécharger une nouvelle image pendant les tests ordinaires. Les
images déjà installées sont démarrées telles quelles conformément aux règles du
projet.

---

## 10. Documentation et messages

Mettre à jour `docs/dev/gitlab.md` pour décrire :

- la différence entre contenu examiné et contenu transporté ;
- la garde légère compilée en `chmod` ;
- la preuve atomique par `last_commit_id` ;
- la limite interne de 250 actions et les 248 sources utiles ;
- la limite de 2 Mio, qui continue à porter sur le commit réellement envoyé ;
- le coût de lecture restant pour les grands corpus ;
- les versions GitLab réellement qualifiées.

Supprimer ou corriger les affirmations selon lesquelles GitLab refuserait toujours
au-delà de 100 actions. La valeur de 250 est une politique prudente de Sonal tant
qu’une matrice de versions plus large n’est pas établie.

La documentation utilisateur ne doit pas exposer `chmod`. Elle peut annoncer
simplement qu’une opération globale contrôle les versions publiées sans recopier
les transcriptions dans `corpus.json`.

Les erreurs utilisateur distinguent :

- trop de sources pour un seul geste ;
- source individuelle illisible ou trop volumineuse ;
- garde périmée à cause d’une publication concurrente ;
- limite de taille du commit métier ;
- incompatibilité de l’instance GitLab avec les gardes légères.

### 10.1 Avertissement avant une opération globale

Les gestes qui contrôlent tout le membership frais, notamment une suppression de
définition ou l’ajout de certaines dérivations, affichent une confirmation avant
leur lancement. Les gestes qui ne lisent qu’un ou quelques entretiens ne doivent
pas produire cet avertissement global.

Le message indique le nombre connu d’entretiens, sans prétendre qu’il restera
identique après la lecture fraîche :

> Cette opération doit vérifier les N entretiens publiés et peut prendre un
> certain temps. Elle échouera si un entretien est publié pendant cette
> vérification. Pour éviter cela, demandez aux autres utilisateurs de terminer
> ou fermer leurs éditions avant de continuer.

Un verrou existant n’est pas présenté comme une interdiction absolue. Un entretien
peut être ouvert sans que sa version publiée change ; seule une publication
concurrente périme la garde. Si l’interface connaît déjà des verrous actifs, elle
ajoute :

> N entretiens sont actuellement ouverts par d’autres utilisateurs. Vous pouvez
> continuer, mais l’opération risque d’échouer si l’un d’eux publie ses
> modifications.

Ce contrôle est informatif. Il ne remplace jamais les gardes atomiques, car un
verrou peut apparaître juste après l’observation.

### 10.2 Attente simple dans la première version

Après confirmation, le renderer affiche un indicateur indéterminé accompagné du
texte :

> Vérification de N entretiens publiés…

Pendant cette attente :

- le bouton qui a lancé le geste est désactivé ;
- un second lancement est impossible ;
- aucun faux pourcentage n’est calculé à partir du temps écoulé ;
- aucune annulation n’est proposée une fois la transaction distante commencée ;
- un refus concurrent indique qu’aucune modification n’a été appliquée et invite
  à réessayer lorsque les autres publications sont terminées.

Cette première version réutilise la promesse IPC existante. Elle n’ajoute ni canal
d’événements, ni identifiant d’opération public, ni état de progression dans le
main.

Une progression réelle `X / N` reste une amélioration facultative. Elle ne sera
ajoutée que si les mesures montrent une attente assez longue pour la justifier.
Elle demandera alors un événement IPC corrélé à l’opération et comptera les
entretiens terminés, sans prétendre représenter une durée restante. Elle reste
indépendante d’une éventuelle concurrence bornée.

Les tests renderer vérifient la confirmation, l’état désactivé pendant la
promesse, l’absence de double lancement et le retour à l’état normal après succès
ou refus.

---

## 11. Ordre de réalisation

### Lot G1 — Contrat de garde

**État : réalisé et qualifié sur GitLab CE 18.11 pour les modes exécutable et
non exécutable ; les réponses GET et HEAD invalides sont couvertes.**

1. Qualifier GET, HEAD et `chmod` sur le banc réel.
2. Ajouter le mode à `FichierGitLab`.
3. Ajouter `lireGardeFichier()` au port et aux doubles.
4. Étendre `ActionCommitGitLab` avec `chmod`.
5. Ajouter les tests de transport et de garde périmée.

**Sortie :** la primitive est prouvée, mais les transactions utilisent encore
leurs anciennes gardes.

### Lot G2 — Compilation et transactions

**État : réalisé et couvert en mémoire ; la qualification réelle des neuf
scénarios de sources réussit.**

1. Ajouter l’action métier `garde`.
2. La compiler vers `chmod`.
3. Remplacer les mises à jour inchangées dans `actionsGardees()`.
4. Prouver que les validations métier utilisent toujours les contenus.
5. Prouver le refus atomique d’une source concurrente.

**Sortie :** la taille cumulée des transcriptions a disparu des publications de
corpus.

### Lot G3 — Journal et reprise

**État : réalisé ; réponse perdue qualifiée en réel, journal version 3 et borne
de 250 actions couverts explicitement.**

1. Versionner le nouveau format du journal.
2. Valider et recharger les actions `chmod`.
3. Réconcilier leurs gardes par métadonnées au SHA du commit.
4. Conserver la lecture des journaux historiques.
5. Qualifier une réponse perdue et un redémarrage.

**Sortie :** les gardes légères possèdent le même niveau de reprise durable que
les actions existantes.

### Lot G4 — Relèvement à 250 et attente utilisateur

**État : réalisé ; relèvement backend, confirmation, attente renderer, messages,
tests et documentation sont terminés.**

1. Centraliser la limite.
2. Passer la valeur à 250.
3. Porter `MAX_SOURCES_GARDEES` à 248.
4. Corriger les bornes historiques du journal sans casser leur lecture.
5. Ajouter la confirmation des opérations portant sur tout le corpus.
6. Ajouter l’indicateur indéterminé sans progression IPC.
7. Mettre à jour messages, tests et documentation.

**Sortie :** 248 sources sont acceptées si le corps réel reste sous 2 Mio, et
l’utilisateur est averti de l’attente et du risque de publication concurrente.

### Lot G5 — Mesures de charge

**État : réalisé avec la pile complète pour 50, 100 et 248 sources. La mesure à
248 donne 12,5 s de lecture, 2,7 s de commit et un corps de 93 317 octets. La
mesure d’une collision réelle à 248 gardes reste facultative ; ses lectures HEAD
sans contenu sont couvertes en mémoire.**

1. Mesurer 50, 100 puis 248 sources avec la pile complète.
2. Vérifier la marge par rapport à la durée du bail.
3. Mesurer la réconciliation et les collisions sans téléchargement de contenu.
4. Introduire une concurrence de lecture bornée seulement si les mesures la
   justifient.
5. Envisager une progression réelle `X / N` seulement si l’attente mesurée la
   justifie.
6. Documenter les valeurs retenues.

**Sortie :** la capacité annoncée est praticable, pas seulement correcte en
mémoire, sans ajouter de parallélisme ni de progression si le besoin n’est pas
démontré.

---

## 12. Critères d’acceptation finaux

Le chantier est accepté lorsque :

- [x] une source gardée est représentée par `chmod`, sans `content` ;
- [x] le mode observé est conservé pour les fichiers exécutables et non
      exécutables, en mémoire comme sur GitLab réel ;
- [x] une garde périmée refuse atomiquement corpus et bail ;
- [x] les contenus restent lus pour toutes les validations métier ;
- [x] une transaction dont les sources cumulent plus de 2 Mio réussit si son
      corps réel reste sous 2 Mio sur le banc réel ;
- [x] 248 sources passent dans un commit total de 250 actions ;
- [x] 249 sources sont refusées avant acquisition du bail ;
- [x] une réponse perdue est réconciliée sans rejeu ;
- [x] les journaux antérieurs, y compris une entrée explicite de version 3,
      restent lisibles ;
- [x] les revalidations et réconciliations de gardes ne téléchargent pas les
      transcriptions ;
- [x] une opération globale annonce le nombre d’entretiens et le risque de
      publication concurrente avant son lancement ;
- [x] son attente utilise un indicateur indéterminé, sans faux pourcentage ni
      nouveau canal IPC ;
- [x] le bouton reste désactivé pendant l’opération et aucun double lancement
      n’est possible ;
- [x] les tests mémoire, de contexte, du renderer et du banc GitLab réel
      réussissent ;
- [x] `npm run typecheck` réussit après le câblage renderer ;
- [x] `npm run test:gitlab` réussit ;
- [x] `docs/dev/gitlab.md` reflète la garantie réellement qualifiée ;
- [x] aucun format de corpus ni dépôt existant ne demande de migration.

---

## 13. Solution de repli

Si une version GitLab officiellement prise en charge ne contrôle pas
`last_commit_id` sur `chmod`, ne pas émuler silencieusement la garde légère.
Deux choix seulement sont sûrs :

1. conserver les gardes `update` et leur limite de volume pour cette instance,
   avec un message explicite ;
2. déclarer cette version incompatible avec les transactions globales à gardes
   légères.

Un contrôle séparé suivi d’un commit sans garde, une simple comparaison de SHA ou
un découpage en plusieurs commits ne fournissent pas la même atomicité et ne sont
pas des solutions de repli acceptables.
