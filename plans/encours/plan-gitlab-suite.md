# GitLab — exclusion visible et opérations de corpus

**Statut : lots A, B et C livrés et qualifiés sur banc (jalon d fait, §16). Les décisions du lot D sont consignées en §15 ; le jalon D1 est qualifié sur banc (§17) et ses capacités sont ouvertes. Restent les suppressions de définitions, reportées au jalon D2, et le lot E, la suppression d'un entretien.**
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
| Savoir qui tient un entretien | Livré et qualifié sur banc | `gitlab/contexte.ts:144` |
| Badge 🔒 dans les listes | Livré et qualifié sur banc | `gitlab/observationBails.ts` |
| Présence 👁 | **Absent**, et hors périmètre (section 9) | `main/index.ts:1791` |
| Modifier les définitions du corpus | **Qualifié sur banc** : définitions simples, gestures à sources gardées et tri de contenu ouverts ; suppressions refusées par leur nom | `gitlab/transactions.ts`, `gitlab/politiqueGestes.ts` |
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

Les choix de mise en œuvre arrêtés pour ce lot — découpage, préparation isolée,
installation locale, reprise, inventaire — sont consignés en §14. Ils ne
préjugent pas des lots D et E, dont la politique reste celle des sections 6 et 7.

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
  de JSON sérialisé avant ajout du bail. Avec 99 sources et `update corpus.json`,
  le plan métier atteint 100 actions, mais le commit envoyé en contient 101 après
  ajout du bail. La borne totale doit donc être décidée et vérifiée sur le corps
  HTTP final ; `DepotCommitsGitLabClient.lireFichier` limite par ailleurs sa
  réponse JSON base64 à 256 Kio, ce qui peut bloquer bien avant le plan.
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
  confirmation, avant que l'appelant installe le résultat. Pour les seules mutations
  de `corpus.json` du lot C, le journal de publication typé, le journal local de
  `TransactionsFichiersCorpus` et un tirage frais suffisent : une opération corpus
  indéterminée bloque toute nouvelle transaction corpus, et une confirmation suivie
  d'un crash est réparée par le tirage, sans republication. Les opérations composites
  des lots D et surtout E demanderont encore un journal transactionnel durable couvrant
  leurs sources, leur plan local et leur application idempotente. Le chemin d'ouverture
  doit distinguer ces transactions des publications de sessions ; ne jamais republier
  automatiquement une opération indéterminée.
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
*Qualifié sur le banc par le scénario E2E à deux comptes.*

### B — Les badges d'exclusion

- [x] Port d'observation, instantané explicite, inventaire paginé et hash canonique.
- [x] Filtres v2, sessions réellement détenues, bail corpus et politique legacy.
- [x] Observation à l'ouverture initiale et à l'actualisation ; infobulles sans date.
- [x] « Détenteurs indisponibles » distinct de « aucun détenteur », sur GitLab
      comme sur Nextcloud ; le drapeau n'accorde ni n'interdit quoi que ce soit.
- [x] Tests : racine imbriquée, branche contenant `/`, plusieurs corpus, expirations,
      bail corrompu, dossier absent, 403, coupure et pagination.
- [x] E2E deux comptes : badge avant ouverture ; ouverture toujours proposée.

**Sortie :** information indicative, aucun commit ajouté, coût des GET mesuré.
*Qualifié sur le banc : quatre requêtes pour trois entretiens tenus, 0,09 à 0,17 s
par GET sur l'instance locale, zéro commit. Détail dans `docs/dev/gitlab.md`.*

### C — Les définitions simples

- [x] Inventaire sémantique par commande ; préparation isolée en mode corpus seul,
      avec refus explicite de toute lecture ou écriture d'entretien.
- [x] Transaction sous bail corpus, façade et dispatch avec contexte capturé.
- [x] Capacités renderer/main ; blocage des opérations non prises en charge.
- [x] Journal de publication typé, blocage des transactions corpus indéterminées et
      installation locale idempotente ; coordination avec tirage, fermeture et bascule.
- [x] Tests : refus métier, commande sans changement sur miroir à jour et périmé,
      refus sans bail, garde périmée, bail perdu, coupure avant/après envoi et
      réconciliation sans rejeu.
- [x] Crash après commit avant installation ; aucune perte ni double application.
- [x] Ajout/import préparé sans écriture préalable du miroir, puis installé depuis un
      plan local fondé sur l'état local réellement remplacé.
- [x] Non-régression : `test/gitlab`, `test/webdav`, `test/distantRenderer.test.ts`.

**Sortie :** seules les commandes sans dépendance sont activées, avec un commit de
 données par mutation effective, plus les commits de coordination. Aucun effet
 local du candidat avant confirmation.
*Qualification sur banc à deux comptes : faite au jalon d (§16).*

### D — Les définitions qui lisent le distant

- [x] Séparer passages CAS/recueils, dérivations, tris de contenu et suppressions
      dépendantes dans l'inventaire des gestes et dans les capacités publiques.
- [x] Qualifier sur GitLab réel l'effet d'un `update` au contenu inchangé sur le
      `last_commit_id` de la source et sur une session longue ; aligner les doubles
      de test et le cycle des sessions sur le comportement observé.
- [x] CAS et recueils : publier nos sources lorsque nécessaire, puis lire sur un même
      SHA et garder les sources dans le commit, sans remplacer les copies sous session.
- [x] Couvrir toutes les variantes qui ajoutent une référence : créations CAS avec
      rattachements et modification de la source d'un passage de recueil comprises.
- [x] Tri : aucune source gardée, commit limité à `corpus.json`, refus préalable et
      nommé tant qu'un entretien est tenu, y compris par nous, et mention de l'état
      publié dans l'interface.
- [x] Valider les repères et les dérivations dans le store de préparation alimenté
      par l'instantané Git, jamais par une vérification préalable du miroir actif.
- [x] Borner les réponses, le total des actions métier et de coordination, le plan
      compilé et le corps HTTP final ; refuser explicitement, sans découpage silencieux.
- [ ] Décider et tester les décomptes et les références republiées par une session
      déjà ouverte avant d'activer les suppressions de définitions (jalon D2,
      §15.1 ; ce jalon n'appartient pas à D1).
- [x] Source modifiée pendant la préparation → aucun changement de corpus publié.
- [x] Coexistence d'une source gardée inchangée et d'une session longue qualifiée,
      sans perte de candidat ni promesse injustifiée de libération d'un bail incertain.
- [x] Capacités réellement consommées par les commandes du renderer, avec refus du
      main conservé pour les appels IPC directs.

**Sortie :** les décisions qui écrivent une référence sont fondées sur des sources
publiées et gardées au commit, et les limites de cohérence après ce commit sont
explicites et testées ; le tri est publié sur un corpus calme, sans toucher au
contenu ni au bail d'aucun entretien.
*Qualifié sur banc à deux comptes : §17. Les capacités sont ouvertes.*

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
| Commande sans changement sur miroir périmé | Aucun commit de données ; la base GitLab fraîche remplace néanmoins la base locale avant le retour |
| Transaction corpus à résultat indéterminé | Toute nouvelle définition, création ou import est bloqué sans rejeu jusqu'à une réconciliation certaine |
| Définition et publication d'entretien indépendantes | Les deux peuvent réussir sans perte ; conflit uniquement sur une garde effectivement invalidée |
| Suppression de définition puis publication d'une ancienne référence | Politique du lot D vérifiée ; aucune promesse de cohérence fondée sur le seul décompte initial |
| Ajout d'une référence avec une source tenue ailleurs | Décision calculée sur la version publiée et source gardée atomiquement ; candidat local du détenteur inchangé |
| Tri modif/longueur avec une session détenue ailleurs ou par nous | Refus nommé avant acquisition du bail corpus ; aucun contenu ni bail d'entretien modifié |
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

## 13. Points à revoir après les lots A et B

Les trois corrections sont locales et ne demandent pas de refonte. Elles ont été
appliquées dans le code et couvertes par des tests simulés, mais restent à revoir
lors de la prochaine qualification sur le banc GitLab réel.

| Importance | Effort | Point à revoir | Vérification attendue |
|---|---|---|---|
| Importante | Facile | Ne masquer un badge que si le bail observé correspond exactement à notre session active. Une session locale expirée ou dégradée ne doit pas cacher le détenteur qui a repris le bail. | [ ] Laisser expirer un bail local, le reprendre depuis un second profil, puis vérifier que le premier profil affiche le nouveau détenteur après actualisation. |
| Importante | Facile | Distinguer un contenu de bail corrompu d'une lecture impossible. Un refus HTTP ou une coupure pendant la lecture d'un bail inventorié doit signaler « détenteurs indisponibles », sur GitLab comme sur Nextcloud. | [ ] Provoquer un refus sur la lecture du fichier de bail, sans bloquer le tirage du corpus, puis vérifier le signalement dans l'interface. |
| Moins importante | Facile | En présence simultanée d'un marqueur historique et d'un bail v2, appliquer le même ordre conservateur que le coordinateur : le marqueur historique est prioritaire et reste bloquant. | [ ] Faire coexister les deux fichiers sur le banc, puis vérifier que le badge et le refus d'ouverture désignent le détenteur historique. |

Aucun de ces points ne demande beaucoup de travail d'implémentation. La partie la
plus coûteuse est la recette réelle à deux profils, car elle requiert de préparer
les deux états de bail et les pannes ciblées sans confondre test simulé et preuve
serveur.

## 14. Décisions prises pour le lot C

Ces choix ferment les questions laissées ouvertes en 5.2 avant d'écrire le code.
Ils valent pour le jalon C et ne changent rien à la politique des lots D et E.
Les noms employés dans le code décrivent des capacités métier ; ils ne reprennent
ni les lettres des lots ni le découpage de ce plan.

### 14.1 Découpage

| Jalon | Contenu | Arrêt avant de continuer |
|---|---|---|
| a | Inventaire sémantique par commande, préparation isolée en mode corpus seul, `TransactionsGitLab.executerDefinitions`, façade, dispatch et tests simulés | oui |
| b | File d'opérations du contexte, installation locale idempotente, journal typé, reprise après coupure ou crash, fermeture et bascule | oui |
| c | Capacités par fournisseur dans le main et le renderer, blocage des gestes non pris en charge | — |
| d | Banc GitLab réel à deux comptes, coût mesuré, `docs/dev/gitlab.md`, cases du lot C | — |

Les arrêts de `a` et `b` sont des points de revue, pas des états livrables. Les
commandes restent inaccessibles dans l'interface tant que la file du contexte, la
reprise et les capacités ne sont pas en place. Le main les refuse toujours si leur
geste n'est pas autorisé, indépendamment de l'état du renderer.

### 14.2 Préparation isolée : un store jetable en mode corpus seul

La préparation construit un `CorpusStore` neuf dans un dossier temporaire initialisé
uniquement avec le `corpus.json` frais. Aucun entretien, audio ou PNG du miroir n'est
copié. `CorpusStore.ouvrir()` peut créer ses dossiers techniques vides ; ils ne sont
jamais des sources métier. Le dossier temporaire est supprimé en `finally`.

Le store du miroir actif ne sert jamais à préparer et n'est jamais déverrouillé :
`lectureSeule` y reste vrai, les écritures d'entretien y restent refusées, et le
miroir ne reçoit ni base fraîche ni candidat avant que leur statut soit certain.

L'absence de fichiers d'entretien n'est pas, à elle seule, une garde suffisante.
Certaines lectures historiques du store ignorent volontairement un entretien absent
et pourraient conclure à tort à zéro usage. Le store temporaire reçoit donc un mode
explicite **corpus seul** : toute tentative de lire, inventorier, écrire ou inclure un
entretien dans une transaction échoue avec une erreur dédiée. Chaque commande admise
est testée dans ce mode ; une commande dépendante des entretiens doit échouer même si
son routage est accidentellement mauvais.

Le mode préparation en mémoire dans le store actif est écarté. Il obligerait à
intercepter toutes les lectures pour choisir entre miroir périmé et sources distantes,
et augmenterait le risque de laisser une autorisation sur le corpus courant. Le
store jetable conserve les règles métier et les écritures atomiques existantes sans
faire du miroir une zone de préparation.

L'autorisation d'écriture de la préparation est une capacité **corpus** propre au
store jetable, pas un basculement générique de `lectureSeule`. Elle est créée par le
helper de préparation, bornée à un callback synchrone et révoquée en `finally`. Un
callback retournant une Promise est refusé explicitement : aucune continuation ne
doit survivre à l'autorisation ni à la suppression du dossier. Cette capacité n'est
pas disponible pour le store actif et n'autorise jamais une écriture d'entretien.

### 14.3 Déroulement d'une transaction de définitions

Sous la file d'opérations du contexte, `executerDefinitions` suit cet ordre :

1. vérifier que le contexte accepte encore de nouvelles opérations et qu'aucune
   transaction corpus indéterminée n'est journalisée ;
2. acquérir le bail de `corpus.json`, puis lire et valider le fichier frais avec son
   `last_commit_id` ; conserver séparément les octets serveur, la base normalisée et
   l'état local qui pourra être remplacé ;
3. préparer dans le store corpus seul, à partir de la base fraîche, et produire le
   résultat métier ainsi que `corpusApres` sans toucher au miroir ;
4. comparer `corpusApres` à la base fraîche **normalisée**, jamais aux seuls octets
   reçus ni au miroir ;
5. si le candidat diffère, publier `update corpus.json` sous son `last_commit_id` et
   la mutation conditionnelle du bail dans le même commit ;
6. après confirmation, installer localement le candidat, puis seulement retourner le
   résultat au renderer ; tenter enfin la libération du bail sans transformer une
   réponse indéterminée en refus certain.

Un refus métier ne publie rien et ne modifie pas le miroir. Le dossier temporaire est
jeté, puis le bail est libéré autant que son état le permet.

Une commande sans changement est un succès sans commit de données. L'acquisition et
la libération du bail restent payées. Si le miroir était périmé, les octets frais lus
sur GitLab sont néanmoins installés localement avant le retour, avec le même plan
`remplacement` fondé sur l'état local réellement remplacé : réussir une commande sur
la bonne base ne doit pas laisser l'application sur une ancienne base. Cette
installation ne prétend pas connaître l'empreinte de blob et le prochain tirage peut
la télécharger à nouveau.

### 14.4 Installation locale et sérialisation du contexte

Après une publication confirmée, l'installation utilise un plan `remplacement` sans
entretien de `TransactionsFichiersCorpus` :

- `corpusAvant` est l'état **local** réellement remplacé, capturé sous la même file ;
- `corpusApres` est le candidat publié ;
- l'identifiant du plan est celui de l'opération distante ou un dérivé stable ;
- l'écriture est atomique et sa reprise est idempotente.

Le `corpusAvant` distant ne doit pas être réutilisé comme état local attendu : un
miroir périmé ferait refuser à juste titre `TransactionsFichiersCorpus` une telle
installation. La même règle vaut pour l'ajout et l'import.

Une file unique appartient à chaque `ContexteGitLab`. Elle couvre la transaction
corpus entière, les tirages et leurs installations, ainsi que l'entrée en fermeture.
Une publication d'entretien indépendante peut continuer à utiliser sa propre garde de
fichier, mais elle ne doit pas contourner une dépendance explicite à `corpus.json`.

La fermeture passe d'abord le contexte à l'état « fermeture en cours », refuse toute
nouvelle transaction, puis attend la fin de l'opération déjà engagée avant de fermer
les sessions et de rendre la bascule possible. Une capture de génération reste utile
pour écarter une réponse tardive, mais elle ne remplace pas cette barrière : aucune
ancienne transaction ne doit encore publier après l'installation du nouveau contexte.
Un tirage commencé avant une mutation ne peut donc pas réinstaller ensuite une base
plus ancienne.

### 14.5 Journal, réponse perdue et crash

Le journal de publication porte une nature explicite et versionnée, au minimum
`session-entretien` ou `transaction-corpus`, ainsi que les informations nécessaires
pour retrouver la ressource et ses actions. Le changement de format prévoit la
lecture des entrées existantes. Une ancienne entrée sans nature n'est reconnue comme
transaction corpus que si son `resourceHash` correspond exactement à la ressource
canonique de `corpus.json` et si l'ensemble de ses actions est compatible ; la forme
de sa première action ne suffit jamais. Toute entrée qui ne peut pas être classée de
façon certaine reste récupérable et bloque sa ressource sans être rejouée.

À l'ouverture, la réconciliation traite les deux natures séparément :

- une publication de session peut confirmer son `JournalSessionsGitLab` ;
- une transaction corpus ne confirme jamais un journal de session ; lorsqu'elle est
  retrouvée, le tirage normal installe atomiquement l'état publié, y compris le nouvel
  entretien d'un ajout/import ;
- une opération certainement absente peut être abandonnée selon la politique de
  réconciliation ; une opération encore indéterminée reste journalisée.

Tant qu'une entrée `transaction-corpus` est indéterminée, toute nouvelle transaction
sur `corpus.json`, ajout et import compris, est refusée avec un message de reprise.
Les lectures et le tirage restent permis. Un retry utilisateur ne crée jamais un
nouvel identifiant d'opération et ne republie pas silencieusement le candidat.

Les fenêtres de panne sont traitées ainsi :

- avant l'envoi : aucun candidat n'est installé et le refus est certain ;
- après l'envoi sans réponse : le journal de publication reste la preuve à
  réconcilier, sans rejeu ;
- après confirmation, avant création du journal local : le miroir peut rester en
  retard, mais le prochain tirage récupère l'état GitLab ;
- pendant l'installation locale : le journal de `TransactionsFichiersCorpus` termine
  le remplacement au prochain démarrage ;
- après installation : réappliquer le plan ou tirer le même contenu est sans effet.

Pour les mutations de `corpus.json` seules, cette combinaison suffit au lot C. Le
journal transactionnel plus large du §8 reste nécessaire aux opérations composites
qui devront conserver des sources et des déplacements locaux, notamment au lot E.

### 14.6 Inventaire et capacités

Un inventaire unique, nommé selon le domaine — par exemple
`POLITIQUE_GESTES_CORPUS` — associe chaque geste à une portée sémantique :

- `definitions-corpus` pour une mutation calculée sur le seul `corpus.json` ;
- `definitions-avec-sources` pour une mutation dépendant d'entretiens publiés ;
- `suppression-entretien` pour le retrait et l'archive ;
- `indisponible` pour un parcours non pris en charge sur GitLab.

Aucune lettre de lot, numéro de jalon ou référence à ce plan n'entre dans le code.
L'inventaire est par commande et, pour CAS ou recueils, par variante de commande :
le gestionnaire IPC partagé n'est pas une granularité suffisante. Chaque handler du
main fournit lui-même l'identifiant du geste ; le renderer ne peut pas déclarer une
commande plus permissive que celle réellement exécutée.

Le dispatch du main consulte cet inventaire avant de construire le callback de
préparation. Pendant le lot C, un geste qui exige des sources ou une suppression est
refusé nommément sur GitLab, y compris par appel IPC direct. Les capacités
correspondantes seront ouvertes par les lots D et E seulement après leur qualification.
Le mode corpus seul constitue une seconde garde, pas un remplacement de ce dispatch.

La matrice publique est dérivée de ces gestes en capacités métier stables et reçue
avec le résultat d'ouverture. Le main la contrôle et le renderer l'utilise pour
masquer ou désactiver chaque commande. `corpusModifiable` disparaît pour les
opérations de définitions ; il ne doit pas être mis à `true` pour déverrouiller en
bloc les métadonnées d'entretien, personnes, lots, notes ou autres parcours encore
absents. L'état global hors ligne ou consultation seule s'applique au-dessus de la
matrice, tandis que l'édition d'un entretien conserve en plus sa garde de session.

### 14.7 Portée du refactor ajout/import

`TransactionsGitLab.ajouterEntretien` utilise le même helper pour préparer sur la
base fraîche, sans écrire d'abord cette base dans le miroir. Le plan métier distant
conserve le `corpusAvant` frais et publie dans un seul commit la création de
l'entretien, la mise à jour gardée de `corpus.json` et la mutation du bail.

Après confirmation, le plan **local** est reconstruit : son `corpusAvant` est l'état
local capturé sous la file, son `corpusApres` est le membership publié, et il contient
le nouvel entretien. Réutiliser directement le plan distant échouerait dès que le
miroir était en retard. Une réponse perdue suit la même entrée journalisée
`transaction-corpus` et bloque tout nouvel ajout/import jusqu'à réconciliation.

### 14.8 Limites assumées et tests d'arrêt

- À l'issue du lot C, les gestes dépendant d'entretiens restent refusés jusqu'à leur
  qualification au lot D, et la suppression jusqu'à sa livraison au lot E, y compris
  par appel IPC direct. Ce ne sont pas des limitations définitives visées par le plan.
- Le dossier temporaire est supprimé en `finally` ; un crash peut en laisser un dans
  le dossier temporaire du système, sans effet sur le miroir ni sur le dépôt.
- La non-régression du corpus local et du corpus Nextcloud fait partie des tests du
  premier jalon. L'autorisation corpus seul n'est jamais utilisée par leurs chemins.
- Le manifeste GitLab n'est pas mis à jour avec une empreinte inventée après une
  installation issue d'un GET ou d'un commit ; un téléchargement ultérieur est
  accepté.

Les tests simulés bloquant la poursuite couvrent au minimum :

- chaque geste admis sur un store sans entretien, et chaque tentative de lecture ou
  d'écriture d'entretien refusée explicitement ;
- commande sans changement sur miroir à jour puis périmé, avec remise à niveau locale
  dans le second cas et aucun commit de données ;
- refus métier sans effet local, conflit de garde et perte du bail ;
- tirage déjà commencé, deux transactions corpus concurrentes, fermeture et bascule
  pendant une transaction ;
- réponse perdue retrouvée, opération toujours indéterminée et retry bloqué, sans
  contamination du journal des sessions ;
- crash avant le journal local, puis pendant et après l'installation ;
- ajout/import depuis un miroir périmé, sans écriture locale avant confirmation ;
- appels IPC directs pour chaque capacité refusée, puis non-régression locale,
  Nextcloud et édition GitLab sous session.

## 15. Décisions prises pour le lot D

Ces choix ferment les questions laissées ouvertes en §6 avant d'écrire le code du
lot D. Ils valent pour le jalon D1 décrit en 15.1 et ne changent rien à la politique
du lot E. Les noms employés dans le code décrivent des capacités métier ; ils ne
reprennent ni les lettres des lots ni le découpage de ce plan.

### 15.1 Découpage : D1 sans suppressions, suppressions reportées

Le lot D est livré en deux jalons :

| Jalon | Contenu | Sortie |
|---|---|---|
| D1 | tri par dernière modification et par longueur ; toute commande CAS qui ajoute un rattachement, y compris lors d'une création ; ajout d'une dérivation de famille ou de cas ; insertion d'un passage dans un recueil ou modification de sa source | `definitionsAvecSources` et `triContenu` ouverts indépendamment dans la matrice |
| D2 | suppression d'un thème, d'une variable, d'une modalité, d'une catégorie de note ou d'une règle d'anonymisation | politique de validation des références à la publication d'un entretien arrêtée et qualifiée |

La raison du découpage tient à la nature des gestes. Les gestes de D1 ajoutent des
références ou des recettes, mais n'en détruisent aucune. Une suppression crée une
garantie qu'aucun commit de corpus ne peut tenir seul : une session déjà ouverte
peut republier plus tard une référence vers la définition disparue. Traiter les deux
ensemble ferait porter à tout le lot une décision qui concerne aussi la publication
des entretiens.

Le report a un coût de conception immédiat : la portée
`definitions-avec-sources` mélange aujourd'hui gestes de D1, tris et suppressions.
L'inventaire de `politiqueGestes.ts` doit distinguer au minimum :

- les mutations qui écrivent une référence ou une recette à partir de sources
  publiées et gardées ;
- les tris calculés sur les contenus publiés, sans garde des sources ;
- les suppressions de définitions, refusées sur GitLab tant que D2 n'est pas
  qualifié.

Les capacités publiques `definitionsAvecSources` et `triContenu` restent séparées
et sont dérivées de ces portées distinctes. Les commandes du renderer les consomment
réellement ; `lectureSeule` ne suffit pas à différencier les variantes. Le main
conserve son propre refus par geste pour les appels IPC directs.

### 15.2 Mesure bloquante : que fait réellement une action inchangée ?

Le banc réel a déjà prouvé qu'une action `update` renvoyant le contenu inchangé sous
`last_commit_id` sert de garde atomique : fraîche, elle laisse publier la cible ;
périmée, elle fait refuser tout le commit. Il n'a pas encore prouvé que cette action
fait avancer le `last_commit_id` de la source. Le test réel relit la source après le
commit, mais ne compare pas son identifiant précédent au nouvel identifiant.

Cette distinction change toute la coexistence avec les sessions. Un commit Git ne
modifie normalement pas l'arbre pour un blob identique ; il ne faut donc pas déduire
du seul succès de l'action que GitLab considère ensuite le fichier comme modifié.
Les dépôts mémoire ne font pas foi sur ce point : ils attribuent aujourd'hui le
nouvel identifiant de commit à toutes les actions, même lorsque leur contenu est
inchangé.

Avant toute mise en œuvre de D1, un scénario GitLab réel vérifie dans cet ordre :

1. ouvrir une session longue et conserver sa garde de fichier ;
2. publier depuis l'autre compte un commit qui modifie `corpus.json` et garde la
   source par un `update` inchangé ;
3. relire le `last_commit_id` de la source et le comparer à celui d'avant ;
4. revalider, renouveler puis publier depuis la session longue, avec et sans
   candidat local ;
5. répéter avec une garde de source réellement périmée pour confirmer le refus
   atomique du corpus.

La suite dépend du résultat :

- si le `last_commit_id` reste identique, l'action est une garde sans effet sur le
  cycle de la session ; les corrections de reprise décrites en 15.3 ne sont pas des
  préalables à D1 ;
- s'il avance, D1 met en place le chemin de réadoption de garde de 15.3 avant
  d'ouvrir les capacités ;
- dans les deux cas, les doubles de test reproduisent le comportement observé au
  lieu de l'inventer.

**Mesuré le 26 septembre 2026 sur le banc (GitLab CE 18.11, deux comptes).** Le
scénario ci-dessus est écrit dans `test/gitlab/contrat-gitlab.test.ts`, et son fait
décisif est affiché par le test lui-même :

```text
[banc] garde inchangée (avec LFS) — last_commit_id abc4db7a → abc4db7a (avancé : false)
[banc] garde inchangée (sans LFS) — last_commit_id a4e9e04d → a4e9e04d (avancé : false)
```

La mesure est faite sur les deux projets du banc, avec et sans LFS : seule l'API
Repository entre en jeu, et le résultat est le même des deux côtés.

C'est donc la première branche. Une garde inchangée est une **garde pure** : elle ne
touche pas au cycle des sessions, et la réadoption de garde de 15.3 n'a pas été
écrite — elle n'aurait coûté qu'une lecture et une écriture de journal par source,
pour réparer un risque que la mesure exclut. Mesuré dans la même passe : la session
longue revalide, publie son candidat, renouvelle son bail et se ferme sans conflit
après le commit de corpus ; une garde de source réellement périmée refuse toujours
le commit entier, `corpus.json` restant intact.

Reste à faire avant d'ouvrir les capacités : la qualification à deux comptes du
jalon d du lot C, puis les recettes du §10 (source modifiée pendant la préparation,
source tenue ailleurs, corpus calme, résultat indéterminé).

### 15.3 Gestes qui écrivent une référence : sources publiées et gardées

Un rattachement CAS, une dérivation ou un passage de recueil est fondé sur un
instantané publié. Chaque source nécessaire entre dans le commit sous forme d'un
`update` au contenu inchangé et sous son `last_commit_id`. Si une source a bougé
depuis la lecture, tout le commit est refusé et `corpus.json` reste inchangé.

Les alternatives restent écartées :

| Alternative | Raison de l'écarter |
|---|---|
| Ne garder que `corpus.json` | un rattachement pourrait viser un repère supprimé entre la lecture et le commit |
| Revérifier juste avant le commit | cela ajoute une requête par source tout en laissant une nouvelle fenêtre de course |
| Garder seulement les sources sans bail | le contrôle d'une dérivation peut porter sur tout le membership et rendrait le geste presque aussi indisponible que le tri |

La présence d'un bail tiers ne fait donc pas refuser un geste à référence. La
commande utilise la version publiée complète et vérifiable de la source ; le travail
non publié du détenteur n'est ni lu ni remplacé. La garde protège cette version
contre une publication concurrente jusqu'au commit. Cette règle est volontairement
différente de celle du tri.

Trois situations sont traitées explicitement :

- si nous détenons une source avec un candidat non publié, nous la publions d'abord,
  comme `casOrchestration.ts` le fait déjà ; un résultat refusé ou indéterminé arrête
  la commande avant le bail corpus ;
- si un tiers détient une source, nous ne publions rien en son nom et nous calculons
  sur sa version publiée ;
- si une source n'existe plus, est illisible ou utilise une version non prise en
  charge dans l'instantané Git, la commande est refusée sans candidat de corpus.

Les ensembles de sources sont exacts et dédupliqués :

- un rattachement CAS ou un passage de recueil garde les entretiens effectivement
  référencés ;
- une création CAS qui transporte déjà des rattachements suit la même règle ;
- la modification d'un item de passage garde sa nouvelle source ;
- une dérivation garde toutes les sources effectivement lues par son contrôle de
  cohérence, potentiellement tout le membership frais.

Les validations finales n'utilisent jamais le miroir actif. Les contenus Git sont
injectés dans un store temporaire capable de lire uniquement les sources prévues.
Les vérifications locales exécutées avant le dispatch GitLab sont supprimées ou
routées vers cette préparation : un miroir périmé ne doit produire ni faux refus ni
fausse validation. Les copies sous session ne sont jamais remplacées.

#### Cycle des sessions si la garde inchangée avance

Cette sous-section ne devient un préalable à D1 que si la mesure de 15.2 montre que
GitLab avance réellement le `last_commit_id` de la source. **Elle ne s'applique pas :
la mesure ne montre pas d'avancée** (§15.2). Elle est laissée telle quelle pour
documenter ce qui resterait à faire si la loi de GitLab change un jour ; aucun code
de réadoption n'existe.

Une session qui retrouve un contenu distant identique à son contenu publié réadopte
la garde courante sans perdre son candidat. Cette réadoption intervient avant toute
nouvelle publication, pas seulement au réveil du poste. Pour une session que nous
détenons, la transaction et les publications de session sont coordonnées afin
qu'une édition arrivée après la publication préalable ne parte jamais sous une
garde devenue périmée.

Le journal de session met alors à jour la garde et l'empreinte de base sans écraser
le candidat local. La réouverture retrouve ce candidat sur la nouvelle garde si la
base distante a conservé la même empreinte.

La fermeture distingue les causes de dégradation :

- après un conflit certainement neutre, elle préserve le candidat, tente de libérer
  le bail encore connu et conserve l'entrée de reprise ;
- après perte du droit, elle ne prétend pas avoir libéré un bail qui ne nous
  appartient plus ;
- après résultat indéterminé ou panne réseau, elle conserve l'incertitude et ne
  promet pas une libération avant réconciliation.

Le motif public est nommé et expliqué ; l'interface n'affiche jamais directement
`degrade` ou un autre mot interne. La recette porte sur un rattachement, une
dérivation ou un passage gardé pendant une session longue — jamais sur un tri, qui
ne garde aucune source et refuse les sessions ouvertes.

### 15.4 Le tri : un corpus calme, sans garde de source

Le tri par modification ou par longueur produit seulement un ordre. Une lecture
légèrement périmée peut donner un rang faux, corrigé au tri suivant ; elle ne crée
pas une référence pendante. Le commit du tri contient donc uniquement
`corpus.json` et la mutation du bail corpus.

Le tri refuse avant l'acquisition du bail corpus dès qu'un entretien est tenu, y
compris par notre application. Le contrôle combine :

- les sessions locales actives du `ContexteGitLab`, car l'observation publique
  masque volontairement nos propres baux ;
- une observation distante fraîche prise dans la file du contexte, et non les
  badges déjà affichés.

Si l'observation échoue, le tri est refusé avec « détenteurs indisponibles ». Si un
ou plusieurs tiers sont présents, le refus les nomme. L'interface annonce avant le
geste qu'un tri de contenu demande la fermeture de tous les entretiens ; elle ne
publie pas silencieusement notre entretien ouvert pour continuer.

Après ce contrôle, le tri acquiert le bail corpus, résout un instantané Git et lit
les entretiens par l'endpoint brut, au même SHA. Il n'est soumis ni à la réponse
base64 de la lecture avec garde ni à la taille d'un commit contenant les sources.
L'ordre porte explicitement sur les versions publiées de cet instantané.

Une course résiduelle est acceptée : un poste peut ouvrir puis publier un entretien
après l'observation. Selon le SHA retenu, le tri verra la version précédente ou la
nouvelle. La conséquence reste un rang révisable. Cette tolérance ne s'étend pas
aux gestes qui écrivent une référence.

### 15.5 Préparation cohérente et ordre de la transaction

La préparation normale d'un geste à sources suit cet ordre :

1. vérifier le contexte, le journal et les capacités du geste ;
2. effectuer un préflight sans bail sur un instantané immuable pour déterminer les
   sources et détecter les dépassements évidents, en particulier leur nombre ;
3. publier nos éventuelles sources concernées, puis attendre un résultat certain ;
4. acquérir le bail de `corpus.json` ;
5. résoudre une seule fois la branche en SHA après acquisition, puis lire
   `corpus.json` et toutes les sources à ce SHA ;
6. déduire à nouveau les sources depuis le membership frais et refaire les contrôles
   exacts de nombre et de taille ;
7. préparer dans le store temporaire, sans toucher au miroir ;
8. publier `corpus.json`, les gardes de sources et la mutation du bail dans un seul
   commit ;
9. après confirmation, installer seulement le candidat de corpus ; aucune session
   locale n'a à être coordonnée, la garde de source n'ayant pas bougé (15.2) ;
10. libérer le bail corpus sans transformer un résultat indéterminé en refus certain.

Le double contrôle de bornes est intentionnel. Avant acquisition, il évite la
plupart des commits de coordination inutiles. Après acquisition, il garantit que la
décision porte sur le membership réellement protégé. Si le second contrôle refuse,
le bail est libéré et aucun candidat métier n'est publié.

Une source modifiée entre le SHA de lecture et le commit périme sa garde et fait
refuser atomiquement toutes les actions. Une source modifiée avant le SHA est lue
dans sa nouvelle version. Dans aucun cas la base du miroir ne sert de preuve de
fraîcheur.

### 15.6 Bornes : compter le commit réellement envoyé

Quatre limites distinctes sont prises en compte :

| Limite actuelle | Où | Périmètre réel |
|---|---|---|
| 100 actions du plan métier | `publication.ts`, `compilerPlan` | exclut aujourd'hui l'action de coordination ajoutée ensuite |
| 2 Mio de plan sérialisé | `publication.ts`, `compilerPlan` | mesure les actions métier avant ajout du bail et de l'enveloppe HTTP |
| 2 Mio de requête | `client.ts`, `ecrireJson` | mesure le corps HTTP final, avec échappement JSON |
| 2 Mio de réponse de lecture | `bailGitLab.ts`, `lireFichier` | borne un fichier lu en JSON base64, métadonnées comprises |

Les trois bornes de taille portent la même valeur, `TAILLE_MAX_DOCUMENT_GITLAB`,
définie une fois dans `client.ts`. Ce n'est pas une coïncidence : la lecture d'un
fichier est élargie par le base64 (1,34 fois le fichier), sa publication par
l'échappement JSON (1,13 fois). À bornes égales, le plus grand fichier lisible
tient donc sous le plan de publication, et l'invariant « ce qui s'ouvre
s'enregistre » tient par construction. Il est vérifié par un test, sur un
entretien de la taille maximale lisible.

En pratique, la lecture est la borne la plus étroite des deux : elle admet environ
**1,5 Mio de fichier**, contre 1,77 Mio pour le plan seul. La capacité réelle
annoncée est donc la plus petite, jamais celle d'une borne isolée.

La borne de 100 actions mérite la même prudence. Elle est un compte d'actions, pas
une capacité en entretiens : chaque source gardée en est une. Avec des entretiens
de 2 h 30 (567 Kio), le plan de 2 Mio permet **trois sources**, pas 98 — la
quatrième ferait 2,5 Mio. Les 98 de `MAX_SOURCES_GARDEES` ne valent que pour de
petits fichiers, et toute annonce de capacité doit citer le nombre de sources
réellement acceptables à la taille des corpus en usage.

Le plafond de 100 ne doit pas être présenté comme une limite totale tant que le
bail est ajouté après compilation. Avec 99 sources, `corpus.json` et le bail, le
corps contient 101 actions. D1 fixe une borne unique sur les **actions totales** et
la vérifie sur le plan complet. Si cette borne reste 100, un geste peut garder au
plus 98 sources ; aucune valeur 98 ou 99 n'est documentée avant cette décision.

De même, la taille utile n'est pas la somme des fichiers bruts. Elle est mesurée sur
le corps exact qui sera donné à `ecrireJson`, branche, message, actions métier,
action de bail et échappement compris. La limite interne de 1 500 000 octets peut
rester une marge de sécurité, mais elle ne remplace pas ce calcul final.

La lecture base64 à 256 Kio permet environ 192 Kio de contenu seulement avant les
métadonnées. Les mesures actuelles projettent environ 116 Kio pour trente minutes,
229 Kio pour une heure, 567 Kio pour deux heures trente et 1,1 Mio pour quatre
heures, avec une forte dépendance au nombre d'ancres et de codages. Ce plafond est
une garde du client, pas une limite GitLab.

#### Ce que coûte réellement une lecture

Les deux facteurs qui PAYENT ont été mesurés sur un entretien réel de 28 084 octets
(`ent-l9r31p9z.json`) : le fichier inscrit dans un commit est une chaîne échappée,
soit 1,13 fois sa taille, et la réponse base64 avec son enveloppe 1,34 fois. Un
fichier de S octets occupe donc environ 1,34 S à la lecture et 1,13 S à la
publication.

| Fichier S | Lecture (1,34 S) | Publication (1,13 S) | Tenue par |
|---|---|---|---|
| 195 Kio | 256 Kio | 220 Kio | l'ancienne lecture, à 256 Kio |
| 1,5 Mio | 2,0 Mio | 1,70 Mio | **la lecture, à 2 Mio** |
| 1,77 Mio | 2,37 Mio | 2,0 Mio | le plan, à 2 Mio |

Avec les trois bornes à 2 Mio, la lecture est redevenue la plus étroite : elle
admet 1,5 Mio de fichier, là où le plan en admettrait 1,77 Mio. C'est la
situation voulue : une borne qui refuse de lire refuse d'écrire, et son message
serait tout aussi obscur. Relever la lecture seule n'aurait pas suffi : le plan de
1 500 000 octets serait alors devenu la borne effective, et un entretien lisible
mais non enregistrable est un corpus qu'on ouvre et qu'on ne peut plus sauvegarder,
sans qu'aucun message n'explique le décalage. Les deux bornes se lisent donc ensemble, et toute annonce de capacité
cite la plus petite.

Le délai de quinze secondes par requête n'est pas le premier obstacle, mais il
devient le mur bien avant que le débit ne gêne. À la taille d'un entretien de
2 h 30 (567 Kio, 756 Kio de réponse), la lecture prend :

| Débit | Temps de lecture |
|---|---|
| 100 Mbit/s (fibre) | 0,06 s |
| 20 Mbit/s | 0,3 s |
| 5 Mbit/s (connexion correcte) | 1,3 s |
| 2 Mbit/s (correct DSL) | 3,2 s |
| 1 Mbit/s | 6,3 s |
| 400 kbit/s | 15,9 s → **le délai expire** |

Le seuil est à environ **420 kbit/s** : toute connexion correcte lit un entretien
de 2 h 30 en moins de quatre secondes. Ce tableau est une division de la taille
par le débit, non une mesure de transfert : le banc est en boucle locale et ne
prouverait rien sur un réseau réel. Il indique une direction, pas une garantie.

Le coût qui devient réellement visible à cette taille n'est pas la lecture d'un
fichier, c'est le tri : il télécharge tous les entretiens en séquence, soit environ
17 Mio pour trente entretiens de 2 h 30. Cela prend 1,3 s à 100 Mbit/s mais 27 s à
5 Mbit/s, et retient environ 34 Mio de chaînes en UTF-16. Un tri qui prend une
demi-minute n'est plus un clic : il lui faut une progression affichée et une
annulation.

D1 ne réduit pas la densité des ancres à l'import pour contourner ce plafond. Une
telle transformation touche la précision temporelle, ne corrige pas les corpus
existants et relève d'une décision produit séparée.

Le traitement des gros fichiers ne dépend plus d'une mesure préalable : les bornes
ont été relevées ensemble, après le constat qu'elles-annulaient les gestes à
sources sur les entretiens de plus de trois quarts d'heure. Ce qui reste à mesurer
porte sur le comportement, non sur la capacité :

- un entretien qui dépasse la borne de lecture est refusé par son nom, avec la
  limite franchie ; il reste consultable et éditable, mais ne peut plus porter de
  référence ni de recette ;
- un corpus qui dépasse la borne de plan est refusé avant l'envoi, et le refus
  nomme le dépassement ; aucun découpage en plusieurs commits, aucune garde
  supprimée ;
- l'alternative endpoint brut plus lecture séparée de la garde reste mesurable :
  elle réduit le transfert par source mais ajoute une requête et doit conserver un
  même instantané.

Un relèvement ne déclare pas automatiquement les gros corpus supportés. Le délai de
quinze secondes par requête reçoit un message dédié, et la durée ainsi que la mémoire
du tirage séquentiel sont mesurées. Le manifeste après publication et la mémoire du
miroir restent des optimisations transversales ; elles ne bloquent D1 que si les
mesures du corpus pilote montrent un dépassement réel.

Aucun dépassement n'est contourné par plusieurs commits ou par la suppression d'une
garde. Une dérivation portant sur plusieurs centaines d'entretiens peut donc rester
refusée. Si ce refus est inacceptable, la garantie doit être redécoupée par lots
dans un chantier distinct.

### 15.7 Journal et résultat indéterminé

Le journal typé du lot C est réutilisé sans nouveau format tant qu'aucune information
manquante n'est démontrée. Son candidat contient déjà toutes les actions compilées,
y compris les chemins, les gardes et les contenus des sources inchangées. Le
réconciliateur peut donc vérifier le commit retrouvé action par action.

Une opération D1 reste de nature `transaction-corpus`. Une opération indéterminée
bloque toute nouvelle transaction sur `corpus.json` jusqu'à réconciliation certaine
et n'est jamais rejouée automatiquement. Après confirmation ou réconciliation, le
même remplacement local de `corpus.json` que dans le lot C suffit ; les sources
n'ont aucun effet local à installer et les copies sous session restent exclues.

Une liste supplémentaire de sources ou un lien vers un second plan local n'est
ajouté que si la mise en œuvre révèle une information que les actions journalisées
ne permettent pas de reconstruire. Si 15.2 montre que les gardes inchangées avancent,
la coordination des sessions actives peut nécessiter un état dédié ; ce besoin est
traité explicitement plutôt que caché dans un journal transactionnel redondant.

Le tri conserve exactement le journal du lot C puisqu'il ne publie que
`corpus.json` et le bail corpus. L'ouverture distingue toujours une transaction de
corpus d'une publication de session.

### 15.8 Mesures et arrêts avant activation

La qualification réelle du jalon d du lot C précède l'activation de D1. Le code de
D1 peut être préparé derrière des capacités fermées, mais aucune capacité n'est
ouverte sur un socle C non qualifié à deux comptes. Les mesures et les recettes
exigées ici sont consignées au §17.

Les mesures suivantes sont consignées séparément des tests simulés :

1. **Action inchangée et session longue** : résultat du scénario de 15.2,
   `last_commit_id` avant/après, revalidation, renouvellement, publication et reprise
   avec candidat local.
2. **Corpus calme** : durée réelle, sur une journée de travail représentative, des
   fenêtres sans aucune session locale ni aucun bail distant. Cette mesure décide si
   la politique du tri est utilisable.
3. **Volume du pilote** : nombre d'entretiens, taille brute et réponse base64 du plus
   gros fichier, ancres comprises, et nombre réel de sources d'un rattachement, d'un
   passage de recueil et d'une dérivation.
4. **Bornes complètes** : nombre total d'actions, taille du plan métier, taille du
   corps HTTP final après ajout du bail, durée sur lien lent et message obtenu au
   dépassement ou au délai.
5. **Coût opérationnel** : requêtes, commits, durée et mémoire pour un geste à une
   source, une dérivation représentative et un tri complet.

L'activation de D1 exige enfin les recettes suivantes :

- source changée pendant la préparation : aucun changement de corpus ;
- source tenue par un tiers : référence calculée sur la version publiée et gardée,
  candidat local du tiers intact ;
- tri avec une session locale ou un bail tiers : refus nommé avant le bail corpus ;
- résultat indéterminé : blocage, réconciliation et installation sans rejeu ;
- fermeture, bascule et tirage concurrents : aucun effet appliqué au mauvais
  contexte ;
- appels IPC directs et commandes renderer : mêmes capacités, sans régression locale
  ni Nextcloud.

## 16. Ce que le jalon d a trouvé

La qualification du lot C contre l'instance réelle, à deux comptes, est dans
`test/gitlab/qualificationDefinitions.test.ts`. Elle instancie la pile de
l'application — client, dépôt, bail, journal, store, transactions — et joue les
scénarios de la matrice de recette. Mesures relevées :

| Scénario | Résultat mesuré |
|---|---|
| Mutation de définitions | 1 commit de données, 3 commits au total (acquisition, données, libération), 4 requêtes, ≈ 1,2 s |
| Commande sans changement | 0 commit de données, la base fraîche remplace le miroir, 2 commits de coordination |
| Bail tenu par un tiers | refus nommé de l'autre compte, sans commit de données |
| Transactions après libération du bail | les deux se succèdent, rien n'est écrasé |
| Acquisitions forcées à se chevaucher | 1 succès, 1 refus nommé, 1 seul commit de données |
| Garde `corpus.json` périmée par un tiers | commit refusé, corpus du tiers intact, miroir local inchangé |
| Panne avant tout envoi | refus certain, 1 seule requête, rien de journalisé, miroir intact |
| Coupure de la réponse d'un commit de données | résultat indéterminé annoncé, toute nouvelle transaction bloquée, réconciliation retrouvant le commit et son contenu, aucun rejeu |

Les deux réserves ouvertes par cette qualification sont levées et qualifiées.

### 16.1 Deux commits simultanés : GitLab refuse le second, quels que soient les fichiers

Sonde directe sur GitLab CE 18.11, deux requêtes de commit envoyées au même
instant, avec des gardes valides et **deux fichiers différents** :

```text
A → 201   B → 400   {"message":"9:reference update: reference does not point to expected object."}
```

L'API Repository n'est donc pas seulement conditionnelle par fichier : elle l'est
aussi par tête de branche. Toute publication qui croise une autre publication est
refusée, même sans rapport entre elles. Or l'application sérialise aujourd'hui
par ressource (`PublieurGitLab.serialiser` prend la clé de la ressource), donc :

- une transaction de `corpus.json` et la publication d'un entretien tenu peuvent
  se croiser — c'est le cas ordinaire quand un entretien est ouvert et qu'on ajoute
  un thème ; l'une des deux est refusée avec un « conflit » qui ne décrit aucune
  contradiction métier ;
- le même vaut pour deux entretiens distincts, et pour l'acquisition ou la
  libération d'un bail pendant une publication.

La preuve dans le banc est un refus `conflit` d'une session de publication dont la
garde de fichier n'avait pas bougé. Le candidat local n'est pas perdu, mais
l'utilisateur voit un entretien dégradé qui n'a aucune raison de l'être. La
qualification antérieure des « deux renouvellements concurrents : un succès, un
refus » doit donc se relire : elle prouvait la garde du bail, pas l'atomicité
d'une collision de branche.

**Résolu et qualifié.** Deux corrections, dans cet ordre.

1. **Une file de commits par destination** (`BailGitLab.serierCommit`), partagée par
   la publication et par le bail, au lieu d'une file par ressource. Un appel
   réentrant n'attend pas la file : il est déjà dans la section critique.
2. **Un réessai vérifié** : sur un refus 400/409, les gardes du plan sont relues ;
   si aucune n'a bougé, le refus ne parle pas de notre édition, et le même commit
   repart une fois après 400 ms. Une garde qui a bougé reste un vrai conflit, et le
   refus d'aujourd'hui tient. Le message d'erreur du serveur n'est jamais lu.

Mesure sur le banc, deux postes au même instant, fichiers sans rapport :

```text
poste 2 — Sonal session-… → 400     collision de branche
poste 1 — Sonal op-c11a-… → 201
poste 2 — Sonal session-… → 201     réessai, abouti
```

Ce qui reste hors de portée : deux postes qui réessaient exactement au même instant
pourraient encore se percuter une seconde fois. Le second échec retombe alors sur
le comportement d'avant — refus nommé, candidat conservé — et non sur une perte.

### 16.2 Un bail de corpus reste acquis après une réponse perdue — résolu

Quand la réponse d'un commit de données est perdue, l'application ne peut pas
libérer le bail : la libération s'appuie sur l'identifiant d'avant la publication,
que GitLab a déjà remplacé. Le bail reste donc en place jusqu'à son expiration —
quinze minutes par défaut — et la transaction suivante est refusée, en nommant
l'utilisateur lui-même comme détenteur :

```text
[banc lot C] réconciliation certaine — le bail de corpus reste pourtant acquis
```

Cela contredit la ligne de la matrice qui veut que toute nouvelle définition soit
bloquée « jusqu'à réconciliation certaine » : la réconciliation est certaine, et le
blocage dure quand même. Le même état survit à un redémarrage, où aucun processus
ne détient plus le droit.

**Résolu et qualifié**, en deux temps.

1. **Réconciliation immédiate.** Une publication dont la réponse s'est perdue est
   réconciliée sur-le-champ : le commit est retrouvé, et l'état de bail qu'il
   portait est adopté — vérifié par l'invariant du coordinateur, une publication
   incrémentant le compteur d'exactement un. La libération suivante porte alors la
   bonne garde, et l'appelant installe son candidat au lieu d'apprendre qu'il
   ignore. Sur le banc, la libération du bail passe de 400 à 201 et la commande
   n'échoue plus.
2. **Reprise au démarrage.** Après un arrêt entre la perte de réponse et la
   réconciliation, aucun droit ne survit en mémoire. À l'ouverture, un bail est
   rendu s'il porte encore notre compte et la génération de l'opération retrouvée :
   une reprise par un tiers change la génération, donc un bail qui la porte encore
   est le nôtre. Sans les deux preuves, rien n'est touché.

Un bail de **corpus** n'a pas d'entretien à rouvrir ; le refus le dit désormais
ainsi — « retenu par ce poste, qui a peut-être déjà terminé », avec l'échéance —
au lieu de désigner l'utilisateur comme un tiers. Un entretien tenu, lui, se ferme
et se rouvre, et n'a jamais souffert de ce message.

## 17. Ce que la qualification D1 a trouvé

Le jalon D1 est qualifié sur l'instance réelle, à deux comptes, dans
`test/gitlab/qualificationSources.test.ts`. Le banc instancie la pile de
l'application — client, dépôt, bail, journal, store, transactions — et
n'ouvre aucune porte de côté : les capacités sont celles que la liste accorde.

### 17.1 Mesures

| Scénario | Résultat mesuré |
|---|---|
| Rattachement d'un passage | 1 commit de données, 3 commits au total, 8 requêtes, ≈ 1,4 s |
| Tri par modification, trois entretiens | 1 commit de données (corpus seul), 9 requêtes, ≈ 1,4 à 1,8 s |
| 99 sources demandées | refus nommé avant le bail, aucun commit |
| Rattachement sur une source périmée | commit refusé, corpus et miroir intacts |
| Rattachement sur un repère absent de la version publiée | geste suspendu, aucun commit de données |
| Rattachement sur une source tenue ailleurs | décision sur la version publiée, candidat du tiers intact, session du tiers publiante |
| Tri avec un entretien tenu ailleurs | refus nommé, aucun bail de corpus |
| Tri avec une session locale, puis observation en panne | deux refus, aucun commit |
| Coupure de la réponse d'un commit de données | résultat indéterminé, transactions bloquées, réconciliation retrouvant le commit et sa garde de source, aucun rejeu |

La séquence de requêtes d'un rattachement est celle attendue, et l'aperçu sans
droit est bien le seul coût supplémentaire :

```text
POST /repository/commits                        acquisition du bail de corpus
GET  /files/…/corpus.json?ref=main              aperçu des sources, avant droit
POST /repository/commits                        acquisition du bail de corpus
GET  /repository/branches/main                  un seul instantané
GET  /files/…/corpus.json?ref=<sha>             base fraîche
GET  /files/…/entretiens/e1.json?ref=<sha>      une source, une lecture
POST /repository/commits                        corpus, garde de source, bail
POST /repository/commits                        libération du bail
```

Le `last_commit_id` de la source est identique avant et après le commit : la
garde est bien pure sur l'instance réelle, comme la mesure de 15.2 l'avait
établie sur les deux projets du banc.

### 17.2 Ce que cela décide

Les capacités `definitionsAvecSources` et `triContenu` sont ouvertes : un
rattachement CAS, une dérivation, un passage de recueil et les tris par
modification et par longueur sont proposés par l'interface et acceptés par le
main, qui continue de refuser par son nom tout ce qui n'est pas dans la liste.

Les suppressions de définitions restent refusées. Elles ne sont pas un oubli :
leur politique de références fait l'objet du jalon D2, et le premier jalon
n'était pas censé les couvrir.

### 17.3 Ce qui reste ouvert

La qualification de D1 joue sur des entretiens de quelques centaines d'octets.
Elle prouve la mécanique des gestes — sources gardées, refus atomique, tri sur
corpus calme — mais elle ne mesure pas le comportement aux tailles réelles. Trois
choses restent donc à relever sur un corpus pilote, et aucune ne remet en cause
ce qui est livré :

- **le volume réel** : nombre d'entretiens et taille du plus gros fichier, pour
  vérifier que la borne de lecture de 2 Mio, soit 1,5 Mio de fichier, suffit au
  corpus en usage ;
- **la mémoire d'un geste à sources** : le geste charge en mémoire les sources
  qu'il garde, et un tri de trente entretiens de 2 h 30 retient environ 34 Mio de
  chaînes. Sur un dossier de plusieurs heures, cela doit être mesuré avant
  d'annoncer que le tri reste un clic ;
- **la durée du tri sur lien lent** : 27 s à 5 Mbit/s pour trente entretiens de
  2 h 30. Un tel geste a besoin d'une progression affichée et d'une annulation,
  ce qui n'existe pas encore.

Tant que ces relevés ne sont pas faits, la capacité annoncée reste celle de la
borne la plus étroite, et un entretien qui la dépasse est refusé par son nom.
