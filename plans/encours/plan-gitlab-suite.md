# GitLab — exclusion visible et opérations de corpus

**Statut : plan de continuation relu sur l'arbre de travail courant, modifications non commitées comprises ; le cycle d'édition d'un entretien est qualifié sur banc, pas les lots ci-dessous.**
**Priorité : rendre le corpus GitLab utilisable au quotidien — savoir qui tient un entretien, puis pouvoir définir et supprimer.**

Ce document prolonge [plan-gitlab4.md](plan-gitlab4.md), qui fixe le bail versionné,
la publication conditionnelle et la reprise, et [plan-gitlab-oauth.md](plan-gitlab-oauth.md),
qui porte l'authentification. Il ne les remplace pas. Les preuves restent dans
[docs/dev/gitlab.md](../../docs/dev/gitlab.md) : ce plan décrit des travaux, il
n'ajoute aucune preuve et ne transforme pas un test simulé en recette.

## 1. Où en est le corpus GitLab

| Capacité | État | Où |
|---|---|---|
| Consulter les transcriptions, tenir le miroir à jour | Livré et qualifié sur banc | `gitlab/lecture.ts`, `distant/miroir.ts` |
| Éditer un entretien sous bail, publier, renouveler, fermer | Livré et qualifié sur banc | `gitlab/session.ts`, `gitlab/bailGitLab.ts` |
| Créer un entretien vide, importer un entretien | Implémenté dans l'arbre de travail ; un commit de données, plus acquisition et libération du bail ; recette à distinguer | `gitlab/transactions.ts`, `test/gitlab/transactions.test.ts` |
| Savoir qui tient un entretien | Livré, testé en simulation ; à qualifier sur banc | `gitlab/contexte.ts:144` |
| Badge 🔒 dans les listes | **Absent** : aucun verrou observé | `gitlab/contexte.ts:74` |
| Présence 👁 | **Absent**, et hors périmètre (section 9) | `main/index.ts:1791` |
| Modifier les définitions du corpus | **Absent** : lecture seule garantie | `main/corpusStore.ts:254` |
| Supprimer un entretien | **Absent** | `main/index.ts:842` |
| Médias partagés, Docs cadre, notes du corpus, lots, personnes | **Absent** | `main/index.ts:1261`, `main/index.ts:984` |

Les chemins abrégés de cette section sont relatifs à `src/main/`. Les numéros de
ligne sont des repères de lecture, pas des contrats stables.

Trois acquis sont réutilisables, sans rendre les nouveaux lots automatiques :

1. **Le bail du corpus existe déjà.** L'ajout acquiert un droit sur `corpus.json`
   via `cleRessourceBailGitLab`, relit le fichier frais et publie sous garde.
   Cependant, `TransactionsGitLab.ajouterEntretien` installe cette base fraîche
   dans le miroir **avant** la publication. Ce n'est pas encore une préparation
   entièrement isolée. La suppression exige en plus un droit sur l'entretien.
2. **Le bail est un fichier du dépôt.** Son observation peut rester en GET, sans
   commit. Il faut lire son contenu pour savoir s'il est encore vivant : l'arbre
   seul ne donne ni détenteur ni expiration.
3. **Le renderer consomme déjà des verrous.** `absorberVerrous` accepte les chemins
   `entretiens/<id>.json`. Les badges et le blocage des métadonnées sont réutilisables,
   mais les infobulles de `Corpus.vue` supposent une date d'acquisition absente du
   bail GitLab. Le bouton d'ouverture doit rester accessible en lecture seule.

## 2. Ordre de priorité

| Rang | Lot | Pourquoi dans cet ordre |
|---|---|---|
| 1 | A — nommer le détenteur | Corriger l'information à l'ouverture, avec contrat public et tests |
| 2 | B — badges 🔒 | Aucun commit, mais inventaire paginé et lectures supplémentaires |
| 3 | C — définitions sans dépendance | Socle de préparation isolée et publication sous bail corpus |
| 4 | D — définitions dépendantes des entretiens | Lectures cohérentes et gardes de sources ; dépend de C |
| 5 | E — suppression d'un entretien | Deux droits à protéger atomiquement, archivage et reprise locale |

A et B sont des lots de **lecture** : ils servent la confiance. C, D et E sont des
lots d'**écriture** : ils servent le travail. Un corpus GitLab consultable ne vaut
pas un corpus qu'on n'ose pas corriger.

## 3. Lot A — Nommer le détenteur dans la lecture seule

Quand un entretien est tenu par un tiers, l'ouverture GitLab renvoie
`acces: 'lecture-seule'` avec `verrouTenuParAutrui: null` (`gitlab/contexte.ts:144`),
alors que `EtatSessionGitLab` porte `tenupar`, soit un `userId` de bail. Le renderer
affiche alors « verrou tenu par un autre utilisateur ».

Travail : reprendre le remplissage du chemin Nextcloud
(`distant/contexte.ts`, `ouvrirEntretienPourEdition`) uniquement lorsque le refus
porte réellement un `tenupar`. `PartieBailGitLab` ne fournit que `userId`,
`generation` et `expireLe` : afficher l'identifiant connu, sans promettre un nom
complet ni requérir une recherche de profil.

Les contrats `VerrouTenuParAutrui` et `EtatVerrouPublic` exigent aujourd'hui
`machineId` et `acquiredAt`. À contrat inchangé, utiliser `''` pour les valeurs
inconnues et rendre leur absence proprement dans toutes les infobulles ; ne jamais
confondre expiration et acquisition. Le renderer garde son repli lorsque le
détenteur est inconnu (`useEntretien.ts`).

Critère : le second compte voit l'identifiant du premier dans le bandeau.
Le même compte depuis une **autre session** reste exclu et doit aussi être nommé,
y compris sur la même machine après redémarrage. Seule la réutilisation de notre
session effectivement détenue ne produit pas de bandeau. La décision reste
l'acquisition du bail, jamais l'identité affichée.

## 4. Lot B — Badges d'exclusion

### 4.1 Ce que le bail permet déjà

Le bail v2 vit dans `.sonal/verrous/<sha256>.json` à la racine du dépôt
(`gitlab/bailGitLab.ts`). Son nom est le SHA-256 UTF-8 de
`branche:<branche>\u0000chemin:<chemin distant canonique>`, avec un séparateur NUL,
pas un espace. Le chemin inclut la racine du corpus. Réutiliser
`cleRessourceBailGitLab` plutôt que recopier cette construction. À membership connu,
le rapprochement par hash est local ; l'observation des baux reste distante.

Le miroir ignore volontairement ces fichiers : il ne retient que `corpus.json` et
`entretiens/*.json` (`distant/miroir.ts:158-167`). C'est le comportement voulu, mais
il faut un chemin d'observation séparé, comme il en existe déjà pour Nextcloud
(`distant/observationVerrousWebDAV.ts`).

### 4.2 Travail

- Ajouter `ObservationBailsGitLab`, implémentant `ObservationCoordinationDistante`
  et retournant des `EntreeVerrouPublic[]`, sans exposer le protocole au renderer.
- Résoudre une référence immuable, inventorier `.sonal/verrous` avec pagination,
  puis lire chaque fichier correspondant à un entretien du membership. Un bail
  expiré doit lui aussi être lu avant d'être filtré. Aucun plafond de trois lectures
  n'est garanti ; mesurer le coût selon le nombre de baux présents.
- Prévoir explicitement le partage du SHA avec le tirage : actuellement
  `MiroirDistant.tirer()` crée son lecteur en interne et ne retourne pas son commit.
  Injecter le même instantané dans le miroir et l'observateur, ou documenter un
  instantané d'observation distinct ; ne pas présumer une couture inexistante.
- Calculer `sha256(cleRessourceBailGitLab(branche, cheminDistant))`, où
  `cheminDistant` vaut `<racine>/entretiens/<id>.json` si la racine est non vide.
  Renvoyer néanmoins `entretiens/<id>.json` comme chemin **public** relatif au corpus.
- Valider version, protocole, hash, identité et échéance avec les règles du
  coordinateur. Filtrer les baux v2 expirés et le bail de `corpus.json`.
  Ne masquer que les droits de notre session effectivement détenus, pas tous les
  baux du même utilisateur ou du même poste. Conserver un comportement conservateur
  pour les marqueurs legacy détectés par `assemblageSession.ts` ; leur refus ne
  suit pas le simple filtre d'expiration v2.
- Câbler l'observation à l'actualisation **et à l'ouverture initiale** :
  `ContexteGitLab.actualiser()` et `ServiceOuvertureGitLab` renvoient aujourd'hui
  chacun `verrous: []`. Le premier affichage ne doit pas attendre une minute.
- Réutiliser `absorberVerrous`, adapter les infobulles sans date d'acquisition et
  tester cartes et listes. Le tirage périodique tourne toutes les minutes uniquement
  en vue corpus ; il ne garantit pas un rafraîchissement pendant l'édition.

### 4.3 Limites à écrire, pas à contourner

- Le badge est aussi frais que le dernier tirage, pas plus. Il ne décide rien :
  l'exclusion reste vérifiée à l'ouverture, par le bail.
- `.sonal/verrous` est **hors du dossier du corpus** même quand la racine du corpus
  est imbriquée. L'observation marche malgré cela ; le signaler évite qu'on croie à
  un bug plus tard.
- Un badge peut survivre à l'expiration jusqu'à l'observation suivante. L'ouverture
  reste proposée et tente alors l'acquisition ; l'absence de badge ne prouve jamais
  l'absence d'un détenteur.
- Si l'observation échoue, elle ne doit pas faire échouer un tirage de contenu
  réussi. Omettre les badges non fiables, distinguer autant que possible
  « observation indisponible » de « aucun bail », et garder les contrôles d'acquisition.
  Un dossier absent, un 403, un bail corrompu et un serveur injoignable doivent être
  testés séparément. Cette tolérance d'affichage ne s'applique jamais à une écriture.

## 5. Lot C — Définitions du corpus sans dépendance

### 5.1 Inventaire

L'inventaire doit être fait **par commande**, pas par gestionnaire IPC : CAS,
recueils et tri regroupent des commandes avec et sans dépendances. Écrire seulement
`corpus.json` ne signifie pas ne lire que ce fichier.

| Commandes | Lot |
|---|---|
| Création, renommage et paramètres de définitions ne lisant que le corpus ; renommage d'entretien ; tri alpha/ajout ; tableau de bord | C |
| Commandes CAS et recueils sans référence ni contrôle sur un entretien | C, après routage explicite |
| Ajout de passages CAS/recueils, dérivations CAS, tri modif/longueur | D |
| Suppression de thème, catégorie de note, variable ou modalité | D : les méthodes du store comptent leurs usages dans les entretiens |
| Suppression de règle d'anonymisation | D : `regleAnonSupprimer` suppose un contrôle d'isolation déjà fait par l'appelant |

Le store refuse aujourd'hui ces écritures lorsque `lectureSeule` est vrai
(`CorpusStore.verifierEcriture`). Les opérations strictement limitées au corpus
n'ont pas besoin d'un droit d'entretien. Les suppressions dépendantes restent
inaccessibles tant que leur politique du lot D n'est pas arrêtée.

### 5.2 Travail

- Construire une préparation isolée des définitions : base fraîche en mémoire ou
  store de préparation séparé, candidat `corpusApres` et résultat métier. Les méthodes
  actuelles écrivent directement sur disque ; ajouter une autorisation ne suffit
  pas à les rendre pures. Le miroir actif ne reçoit ni base ni candidat avant
  confirmation. Un refus métier ou une commande sans changement ne publie pas de données.
- Ajouter `TransactionsGitLab.executerDefinitions` : bail corpus, lecture fraîche,
  préparation, `update corpus.json` sous `last_commit_id` et mutation du bail dans
  le même commit, puis installation locale récupérable. Toujours libérer les droits
  acquis, sans transformer un résultat indéterminé en refus certain.
- Si une autorisation corpus est nécessaire, la borner à la préparation synchrone
  autorisée, révoquée en `finally`, sans rendre le store actif globalement écrivable.
  Garder le refus des écritures d'entretien sans droit propre.
- Ajouter la façade et le dispatch GitLab en conservant la capture de génération
  du contexte. Adapter les callbacks pour viser le **store de préparation**, pas
  le `store` actif capturé. CAS et recueils ont des orchestrations dédiées dans
  `main/index.ts` ; ils ne seront pas couverts par le seul helper générique.
- Sérialiser les transactions corpus et leur installation avec les tirages : un
  tirage commencé avant la publication ne doit pas réinstaller une ancienne base
  après le succès. Prévoir aussi fermeture/bascule et transaction en attente.
- Rendre les définitions disponibles côté renderer uniquement après séparation
  des capacités d'écriture ; `corpusModifiable = true` seul n'est pas une livraison.
  La reprise d'une réponse perdue et d'un crash après commit fait partie de C,
  pas d'un chantier ultérieur.

### 5.3 Le piège immédiat

Le drapeau unique déverrouille aussi des gestes que GitLab ne sait pas faire.
Prévoir une matrice de capacités par fournisseur, contrôlée dans le main et
consommée par l'interface. En particulier :

- tri modif/longueur, suppressions dépendantes, passages et dérivations : bloqués
  sur GitLab jusqu'à D ; suppression d'entretien jusqu'à E ;
- personnes, lots de valeurs/règles, métadonnées d'entretien hors session et autres
  corrections courtes : rester bloqués sur GitLab sans bloquer Nextcloud ;
- notes du corpus : édition déjà refusée dans le main **et grisée** dans
  `NotesCorpus.vue` pour tout corpus distant ; conserver cette protection ;
- Docs cadre et médias partagés : disponibles selon les parcours Nextcloud,
  non implémentés pour GitLab ;
- annulation du journal : refusée pour tout corpus distant, contrairement à sa lecture.

Tester aussi les appels IPC directs : une interface grisée n'est pas une garde
métier. Conserver les capacités GitLab déjà acquises, notamment l'ajout/import et
l'édition sous session.

## 6. Lot D — Définitions qui lisent les entretiens publiés

| Famille | Lecture nécessaire |
|---|---|
| CAS : ajout de références de passages | Les repères doivent exister dans la version publiée |
| CAS : ajout de dérivations de famille ou de cas | Toutes les sources utilisées par le contrôle de cohérence, potentiellement tout le membership |
| Tri modif/longueur | Tous les entretiens publiés du membership frais |
| Recueils : insertion d'un passage | Le repère doit exister dans la version publiée |
| Suppressions de définitions et de règles | Les usages et références nécessaires au refus métier |

Le miroir peut être périmé, ou contenir notre copie non publiée. Publier d'abord
les sources que nous détenons lorsque l'opération doit référencer notre travail
courant (passages et dérivations, comme dans `casOrchestration.ts`). Pour les tris,
retenir explicitement les versions **publiées**, même si un collègue édite ; ne pas
promettre un ordre fondé sur son travail non publié.

Les chemins WebDAV ne sont pas uniformes : `executerDefinitionsAvecSources`
verrouille les sources pour les dérivations ; le tri relit sans ces verrous ;
les références CAS ont leur propre relecture ; les recueils publient notre source
mais vérifient encore le repère localement. Ce n'est pas une garantie commune
qu'on pourrait simplement recopier.

GitLab dispose de l'équivalent, qualifié sur le banc : placer la source dans le même
commit comme action `update` au contenu **inchangé** sous son `last_commit_id`. Si
quelqu'un a modifié l'entretien entre-temps, la garde est périmée et tout le commit
est refusé. Le lot D s'appuie sur cette propriété, en bornant ce qui entre dans le
commit.

Préparation et bornes :

- Après acquisition du bail corpus, résoudre une fois la branche en SHA, puis lire
  `corpus.json` et les sources à ce SHA. Déduire les sources du membership frais,
  pas du miroir. Conserver chaque `last_commit_id` de fichier, distinct du SHA de
  branche et de l'empreinte de blob.
- Injecter ces contenus dans le calcul métier sans remplacer les entretiens du
  miroir, en particulier ceux sous session. Dédupliquer les lectures : un GET
  de contenu par source dans la préparation normale, hors réconciliation/retry.
- `compilerPlan` borne actuellement **100 actions métier** et 1 500 000 octets
  de JSON sérialisé avant ajout du bail : avec `update corpus.json`, au plus
  99 sources gardées dans cette implémentation. Borne totale HTTP et actions de
  coordination à vérifier aussi ; `DepotCommitsGitLabClient.lireFichier` limite
  sa réponse JSON base64 à 256 Kio, ce qui peut bloquer bien avant le plan.
- Refuser explicitement les corpus trop volumineux avant publication. Ne pas
  découper une opération atomique en plusieurs commits ni supprimer des gardes.
- Qualifier l'effet des `update` inchangés sur les sessions qui détiennent les
  sources : gardes ultérieures, renouvellement, publication et reprise. La preuve
  de l'API ne suffit pas à prouver cette coexistence dans l'application.

**Décision préalable à l'activation des suppressions dépendantes :** définir la
politique de références avec des sessions déjà ouvertes. Garder toutes les sources
protège le décompte au commit, mais n'empêche pas une session de republier ensuite
une référence à une définition supprimée. Si la garantie est « aucune référence
invalide », il faut aussi valider les dépendances à la publication de l'entretien
contre le corpus courant, sous garde, ou prévoir une coordination équivalente.
Sinon, documenter précisément la limite retenue et adapter les critères de recette.
En attendant cette décision et ses tests, laisser ces suppressions désactivées ;
un décompte local préalable ne constitue jamais une preuve de fraîcheur.

## 7. Lot E — Suppression d'un entretien

### 7.1 Ce que Nextcloud fait, et ce que GitLab peut faire mieux

Le chemin Nextcloud prend un double verrou, publie `corpus.json`, puis déplace le
fichier serveur, avec un état dégradé possible où le membership est à jour et le
fichier pas archivé (`distant/transactions.ts:346-403`). GitLab n'a pas ce
problème : l'API de commit accepte `update` et `move` dans **le même commit**, et les
gardes `last_commit_id` périmées sur `move` sont qualifiées sur GitLab 18.11. La
suppression GitLab est donc plus atomique que celle de Nextcloud, à condition de
bien distinguer les actions distantes du plan local.

### 7.2 Travail

**Une observation seule est insuffisante.** Un autre poste peut acquérir le bail
après la lecture sans modifier l'entretien. La garde du `move` reste alors fraîche
et la suppression empiète sur sa session. Le bail corpus ne protège pas contre ce cas.

- Fermer d'abord notre éventuelle session sur l'entretien, en publiant son candidat ;
  refuser la suppression si cette fermeture échoue. Ne jamais ignorer notre bail
  sous prétexte qu'il appartient au même poste.
- Acquérir les deux droits dans un ordre unique : corpus puis entretien. Refuser
  l'acquisition tenue par autrui avec son identifiant ; respecter aussi la détection
  conservatrice des anciens marqueurs. Libérer les droits déjà acquis en cas d'échec.
- Lire le corpus et l'entretien à une référence cohérente après acquisition,
  revérifier membership et impact confirmé, puis préparer sans modifier le miroir.
- Publier **un commit de données** contenant `update corpus.json`,
  `move entretiens/<id>.json → corbeille/<id>.json` sous leurs gardes, **et les
  mutations conditionnelles des deux baux**. `PublieurGitLab.publierSousDroit`
  ne protège actuellement qu'un droit : étendre explicitement coordinateur,
  publieur et journal pour cette transaction, avec sérialisation, expiration,
  refus atomique et résultat indéterminé cohérents pour les deux droits.
- Distinguer le plan local des actions distantes : le JSON d'entretien est commun
  aux deux plans ; les `.json.bak1`, `.json.bak2` et PNG sont locaux et doivent être
  déplacés vers la corbeille locale sans action GitLab. Les médias référencés ne
  sont pas supprimés. Prévoir les collisions d'archive sans écrasement.
- Installer avec `appliquerTransactionFichiers` seulement après confirmation.
  Conserver durablement le plan local jusqu'à son application : un tirage après
  crash ne remplace pas l'archivage des sauvegardes et PNG.
- Corriger et tester la réconciliation des `move` : le compilateur n'envoie pas de
  `content`, mais `ReconciliateurPublicationGitLab` compare aujourd'hui le contenu
  de destination à `action.content`. Enregistrer une empreinte du contenu attendu
  ou le vérifier depuis la source à sa révision gardée, puis vérifier sa disparition
  au commit retrouvé. Une réponse perdue ne doit pas laisser tout `move`
  indéterminé ni provoquer une seconde suppression.

### 7.3 Choix à enregistrer

- **Archiver ou supprimer ?** Retenir une archive sous la racine du corpus,
  `corbeille/<id>.json` ou une destination non conflictuelle enregistrée dans le plan.
  Un `delete` conserverait aussi l'historique, mais pas l'archive en tête de branche.
  Le miroir ignore ce dossier : tester néanmoins la validation du membership après
  retrait, l'absence de réimport de l'archive et la réouverture depuis un miroir neuf.
- **Réconciliation des orphelins.** Nextcloud archive au tirage les fichiers serveur
  absents du membership. GitLab n'a pas d'équivalent aujourd'hui et la suppression
  n'en a pas besoin pour être correcte. Le reporter, et le dire.
- **Annulation.** Le journal d'annulation est refusé sur tout corpus distant
  (`main/index.ts:1044`). La suppression ne sera pas annulable comme en local ; à
  écrire dans la documentation utilisateur.

## 8. Risques transversaux

- **Coût réel.** Un commit de données n'est pas un commit total par geste : une
  transaction courte à un bail produit normalement acquisition + publication +
  libération, soit trois commits. Avec deux baux séparément acquis/libérés, compter
  cinq commits hors renouvellement, publication préalable ou incident. Mesurer
  requêtes, taille et coût CI ; ne pas reprendre « coût serveur nul » pour les GET.
- **Journal distant et installation locale.** Le publieur supprime son journal à
  confirmation, avant que l'appelant installe le résultat. Le chemin d'ouverture
  réconcilie surtout des sessions et ne sait pas rejouer un plan local de suppression.
  Ajouter un journal transactionnel durable couvrant préparation, commit confirmé
  et application locale idempotente. Bloquer un nouveau geste équivalent tant que
  le résultat précédent reste indéterminé ; ne jamais republier automatiquement.
- **Manifeste après publication.** Les empreintes GitLab sont des SHA de blobs,
  distincts des gardes d'écriture. Sans mise à jour, un fichier publié peut être
  retéléchargé. Après suppression, le miroir archive en `corbeille-miroir` seulement
  si le fichier existe encore ; sinon il retire simplement l'empreinte. Tester les
  deux cas et la concurrence tirage/publication avant de conclure que c'est bénin.
- **Concurrence métier, pas verrou global de branche.** Des écritures sur des fichiers
  indépendants peuvent toutes deux réussir. Les gardes sont par fichier ; partager
  la branche n'impose pas un conflit. Définir et garder les dépendances réelles entre
  corpus et entretien, sans imposer un refus systématique de publications indépendantes.
- **Défense en profondeur.** Le main refuse chaque commande non prise en charge,
  même proposée par erreur dans l'interface. Le store actif reste en lecture seule
  hors autorisations d'entretien ; une autorisation de préparation n'est pas un
  contournement général.
- **Fraîcheur et contexte.** Toute transaction calcule sur ses sources fraîches,
  protège leur installation contre les tirages concurrents et reste attachée au
  contexte capturé. Une bascule, une fermeture ou une réponse tardive ne doit pas
  appliquer son résultat au nouveau corpus.

## 9. Ce qui n'est pas dans cette tranche

- **La présence 👁.** Elle ne sert jamais à décider (`distant/presence.ts`), donc la
  perdre ne retire aucune garantie d'exclusion. Mais sur GitLab, écrire coûte un
  commit : un fichier par poste réécrit toutes les minutes représente environ
  1 440 commits par poste pour 24 heures d'activité continue, ou 480 pour huit heures.
  Un bail inactif se renouvelle environ toutes les dix minutes avec les réglages
  courants ; une publication le renouvelle déjà. Le banc a mesuré environ 380 ms
  par commit, sans mesurer le coût d'une CI réelle.
  Une présence par fichier partagé augmenterait aussi les conflits entre postes.
  Si l'information est jugée nécessaire, distinguer « 🔒 bail tenu par X » d'une
  activité certaine. Une « dernière publication par X » peut être issue de
  l'historique, mais son affichage n'est pas livré par ce plan. **Ne pas
  construire de stockage de présence, de branche dédiée ou de battement de présence
  dans cette tranche.**
- **La fusion d'une copie de divergence après coupure.** Elle existe pour Nextcloud
  (`distant: listerDivergences`) et pas pour GitLab, où la reprise en conflit est
  aujourd'hui une impasse (`gitlab/session.ts:136`). C'est un chantier de
  récupération, distinct de celui-ci, à traiter après le lot E si le pilote le demande.
- **Médias partagés et Docs cadre.** Ils demandent un port de transfert branché sur
  le miroir, et une décision LFS. Voir [plan-media.md](plan-media.md).
- **Personnes, lots de valeurs et lots de règles sur GitLab.** Ces transactions
  existent déjà pour Nextcloud (`main/index.ts`, `distant/transactions.ts`). Les
  reporter pour GitLab, sans régresser sur Nextcloud.
- **Édition des notes du corpus et annulation du journal.** Refusées pour tout
  corpus distant aujourd'hui ; leur consultation reste possible.
- **Copie anonymisée, migration d'équipes V1, recette institutionnelle.** Inchangés.

## 10. Lots vérifiables

### A — Le détenteur connu

- [x] Remplir `verrouTenuParAutrui` depuis `tenupar`, sans inventer date ni machine.
- [x] Tester tiers, même compte sur deux sessions, ancienne session du même poste,
      réutilisation de la session courante, bail expiré repris et détenteur inconnu.

**Sortie :** l'identifiant connu est affiché ; aucun accès n'est accordé sur son nom.
*Tests simulés uniquement : la lecture du bandeau par l'E2E à deux comptes reste à jouer sur le banc.*

### B — Les badges d'exclusion

- [ ] Port d'observation, instantané explicite, inventaire paginé et hash canonique.
- [ ] Filtres v2, sessions réellement détenues, bail corpus et politique legacy.
- [ ] Observation à l'ouverture initiale et à l'actualisation ; infobulles sans date.
- [ ] Tests : racine imbriquée, branche contenant `/`, plusieurs corpus, expirations,
      bail corrompu, dossier absent, 403, coupure et pagination.
- [ ] E2E deux comptes : badge avant ouverture ; ouverture toujours proposée.

**Sortie :** information indicative, aucun commit ajouté, coût des GET mesuré.

### C — Les définitions simples

- [ ] Inventaire par commande ; préparation isolée sans écriture du miroir actif.
- [ ] Transaction sous bail corpus, façade et dispatch avec contexte capturé.
- [ ] Capacités renderer/main ; blocage des opérations non prises en charge.
- [ ] Journal transactionnel et installation locale idempotente ; coordination avec
      tirage, fermeture et bascule de corpus.
- [ ] Tests : refus métier, commande sans changement, refus sans bail, garde périmée,
      bail perdu, coupure avant/après envoi et réconciliation sans rejeu.
- [ ] Crash après commit avant installation ; aucune perte ni double application.
- [ ] Non-régression : `test/gitlab`, `test/webdav`, `test/distantRenderer.test.ts`.

**Sortie :** seules les commandes sans dépendance sont activées, avec un commit de
 données par mutation effective, plus les commits de coordination. Aucun effet
 local du candidat avant confirmation.

### D — Les définitions qui lisent le distant

- [ ] Classifier passages CAS/recueils, dérivations, tris et suppressions dépendantes.
- [ ] Publier nos sources lorsque nécessaire, puis lire sur un même SHA et garder
      les sources dans le commit, sans remplacer les copies sous session.
- [ ] Bornes des réponses, actions métier/coordination et taille HTTP totale ; refus
      explicite au-delà, jamais de découpage silencieux.
- [ ] Décision préalable et tests sur les décomptes et les références republiées
      par une session déjà ouverte après suppression d'une définition.
- [ ] Source modifiée pendant la préparation → aucun changement de corpus publié.
- [ ] Coexistence d'une source gardée inchangée et d'une session longue qualifiée.

**Sortie :** décisions fondées sur des sources publiées et gardées au commit ;
les limites de cohérence après ce commit sont explicites et testées.

### E — La suppression

- [ ] Fermer notre session ; acquérir corpus puis entretien, avec refus nommé.
- [ ] Étendre publication et journal pour garder les deux droits dans le même commit.
- [ ] `update` + `move` gardés ; impact revérifié et collision d'archive traitée.
- [ ] Plans distant/local séparés ; sauvegardes et PNG archivés seulement localement.
- [ ] Réconciliation réelle du `move`, avec contenu attendu vérifiable.
- [ ] Course ouverture/suppression, perte de l'un des droits, réponse perdue et crash
      avant application locale ; aucun rejeu de commit ni écrasement de candidat.
- [ ] E2E : archive distante, miroir réouvert et miroir neuf ; aucun retour de
      l'entretien dans le membership, médias référencés conservés.

**Sortie :** retrait et archive distants atomiques, exclusion garantie par les deux
baux, application locale récupérable.

## 11. Matrice minimale de recette

| Scénario | Preuve attendue |
|---|---|
| Deux comptes, un entretien tenu de l'autre côté | Badge dès l'ouverture du corpus, identifiant dans la bannière après ouverture de l'entretien |
| Même compte, autre poste ou ancienne session du même poste | Refus d'édition malgré l'identité utilisateur commune |
| Bail v2 expiré | Aucun badge après observation fraîche ; reprise à l'ouverture si personne ne l'a repris entre-temps |
| Observation indisponible, contenu accessible | Consultation possible, aucun faux droit d'édition déduit des badges absents |
| Deux ajouts de thème concurrents | Pas d'écrasement : refus si bail occupé, ou deux succès sérialisés sur bases fraîches ; un seul gagnant si les acquisitions sont forcées à se chevaucher |
| Définition et publication d'entretien indépendantes | Les deux peuvent réussir sans perte ; conflit uniquement sur une garde effectivement invalidée |
| Suppression de définition puis publication d'une ancienne référence | Politique du lot D vérifiée ; aucune promesse de cohérence fondée sur le seul décompte initial |
| Tri modif/longueur avec une session détenue ailleurs | Ordre calculé sur les versions publiées et gardées ; travail local du détenteur inchangé |
| Suppression d'un entretien tenu par un tiers | Refus nommé sans mutation des données ; éventuels commits de coordination comptabilisés |
| Un poste ouvre pendant la suppression | Une seule acquisition du bail entretien gagne ; suppression impossible sous un droit perdu |
| Suppression avec réponse perdue | Commit et contenu déplacé retrouvés ; application locale une seule fois |
| Crash après commit avant installation | Reprise durable du plan, sauvegardes/PNG conservés, aucune republication |
| Hors ligne avant l'envoi d'une définition | Refus explicite, candidat non installé |
| Coupure après l'envoi d'une définition | Résultat indéterminé tant que non réconcilié ; ne pas annoncer à tort « aucune publication » |
| Tirage ancien terminé après une mutation | Aucun retour du miroir à la version précédente |
| Bascule de corpus pendant une commande | Aucun résultat ni effet appliqué au nouveau contexte |
| Dépassement de taille ou nombre de sources | Refus avant publication métier, droits libérés, aucun plan partiel |
| Non-régression Nextcloud et local | Suites ciblées puis bancs A/B sans retrait de capacités existantes |

Séparer dans le compte rendu tests simulés, E2E et essais GitLab réels. Un banc
absent ou un scénario sauté n'est pas une qualification. Réutiliser les images et
volumes Docker existants, sans téléchargement ni reprovisionnement.

## 12. Définition de terminé

- [ ] Détenteur connu affiché dans les listes et à l'ouverture, sans fausse date.
- [ ] Commandes C activées et classées ; opérations D activées seulement avec leur
      politique de dépendances qualifiée, sinon explicitement reportées.
- [ ] Aucun geste non pris en charge proposé par l'interface ni accepté par IPC.
- [ ] Suppression distante atomique et protégée par les deux droits ; archive et
      reprise locale vérifiables, y compris après perte de réponse ou crash.
- [ ] Observation sans commit ; coût en requêtes, commits métier et coordination
      mesuré sur le banc et consigné dans `docs/dev/gitlab.md`.
- [ ] Tests de concurrence, limites et non-régression documentés sans assimiler
      les suites simulées à une recette serveur.
- [ ] Documentation utilisateur distinguant GitLab et Nextcloud : badges indicatifs,
      présence, définitions disponibles, tris publiés, suppression non annulable,
      reprise après crash, fusion de divergence et médias.
