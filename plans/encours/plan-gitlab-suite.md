# GitLab — exclusion visible et opérations de corpus

**Statut : lots A à D livrés et qualifiés sur banc (§16 à §18), capacités ouvertes. Le lot E est livré et qualifié à deux comptes (§20 et §21) ; sa capacité est ouverte. Le lot F est livré et qualifié à deux comptes (§22 et §24) ; ses deux capacités sont ouvertes.**
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
| Modifier les définitions du corpus | **D1 et D2 qualifiés sur banc** : définitions simples, gestes à sources gardées, tri de contenu et suppressions de définitions ouverts | `gitlab/transactions.ts`, `gitlab/referencesDefinitions.ts`, `gitlab/politiqueGestes.ts` |
| Supprimer un entretien | Livré et qualifié sur banc | `gitlab/transactions.ts`, `gitlab/suppressionEntretien.ts` |
| Modifier les valeurs et la pseudonymisation depuis les vues corpus | **Qualifié sur banc** : lots partiels entretien par entretien, garde croisée du corpus, réutilisation de la session locale | `gitlab/transactions.ts`, `gitlab/contexte.ts:245` |
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

Le découpage, l'ordre exact des opérations, le format de journal et les arrêts avant
activation sont fixés en §19. Le lot ne commence pas par ouvrir la capacité : les
fondations à deux droits et la reprise du plan local restent inaccessibles au
renderer jusqu'à la qualification finale.

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
- **Médias partagés et Docs cadre.** Les médias GitLab utilisent un stockage
  WebDAV secondaire, sans LFS ni résolution par le miroir GitLab. Voir
  [plan-media2.md](plan-media2.md).
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
- [x] Qualifier sur banc les décomptes et les références republiées par une session
      déjà ouverte avant d'activer les suppressions de définitions. La politique
      et les résultats du jalon D2 sont consignés en §15.9 et §18.
- [x] Source modifiée pendant la préparation → aucun changement de corpus publié.
- [x] Coexistence d'une source gardée inchangée et d'une session longue qualifiée,
      sans perte de candidat ni promesse injustifiée de libération d'un bail incertain.
- [x] Capacités réellement consommées par les commandes du renderer, avec refus du
      main conservé pour les appels IPC directs.

**Sortie :** les décisions qui écrivent une référence sont fondées sur des sources
publiées et gardées au commit, et les limites de cohérence après ce commit sont
explicites et testées ; le tri est publié sur un corpus calme, sans toucher au
contenu ni au bail d'aucun entretien.
*Qualifié sur banc à deux comptes : D1 en §17, D2 en §18. Les capacités sont ouvertes.*

### E — La suppression

- [x] Fermer notre session ; acquérir corpus puis entretien, avec refus nommé.
- [x] Étendre publication et journal pour garder les deux droits dans le même commit.
- [x] `update` + `move` gardés ; impact revérifié et collision d'archive traitée.
- [x] Plans distant/local séparés ; sauvegardes et PNG archivés seulement localement.
- [x] Réconciliation réelle du `move`, avec contenu attendu vérifiable.
- [x] Course ouverture/suppression, perte de l'un des droits, réponse perdue et crash
      avant application locale ; aucun rejeu de commit ni écrasement de candidat.
- [x] E2E : archive distante, miroir réouvert et miroir neuf ; aucun retour de
      l'entretien dans le membership, médias référencés conservés.

**Sortie :** retrait et archive distants atomiques, exclusion garantie par les deux
baux, application locale récupérable.
*Qualifié sur banc à deux comptes : §21.*

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

- [x] Détenteur connu affiché dans les listes et à l'ouverture, sans fausse date.
- [x] Commandes C activées et classées ; opérations D activées seulement avec leur
      politique de dépendances qualifiée, sinon explicitement reportées.
- [x] Aucun geste non pris en charge proposé par l'interface ni accepté par IPC.
- [x] Suppression distante atomique et protégée par les deux droits ; archive et
      reprise locale vérifiables, y compris après perte de réponse ou crash.
- [x] Observation sans commit ; coût en requêtes, commits métier et coordination
      mesuré sur le banc et consigné dans `docs/dev/gitlab.md`.
- [x] Tests de concurrence, limites et non-régression documentés sans assimiler
      les suites simulées à une recette serveur.
- [x] Documentation utilisateur distinguant GitLab et Nextcloud : badges indicatifs,
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


### 15.9 Politique D2 : garde croisée entre corpus et entretiens

Une suppression de définition porte sur toutes les versions publiées du membership
frais. Après acquisition du bail de `corpus.json`, la transaction résout un SHA,
lit chaque entretien à ce SHA, prépare le décompte dans un store dont l'inventaire
complet est explicitement autorisé, puis place toutes ces sources inchangées sous
leur `last_commit_id` dans le même commit que le retrait. Une source republiée entre
la lecture et le commit fait refuser atomiquement la suppression.

Avant ce décompte, les sessions locales concernées sont publiées. Les parcours qui
retirent une référence dans l'entretien ouvert publient ce retrait avant de demander
la suppression partagée. Un appel IPC GitLab ne peut pas utiliser l'exception locale
qui ignorait l'entretien courant : le décompte porte toujours sur les versions
réellement publiées.

Réciproquement, chaque publication d'entretien relit `corpus.json`, valide les
références de thèmes, catégories de note, règles d'anonymisation, variables et
modalités, puis ajoute le corpus inchangé sous sa garde dans le commit de session.
Une référence déjà supprimée produit un refus réparable sans dégrader la session ;
le candidat local reste éditable. Si le corpus change après la validation mais que
l'entretien et son bail n'ont pas bougé, la session relit les définitions et tente
une seconde fois : une mutation indépendante peut donc aboutir, tandis qu'une
suppression rend la référence invalide et refuse le candidat. Si la publication
gagne d'abord, sa garde d'entretien fait refuser la suppression. La file locale de
commits évite les collisions d'une même application, mais cette garde croisée est
ce qui tient entre deux postes.

Les bornes restent celles de D1 : au plus 98 entretiens gardés et 2 Mio pour le corps
final. Un corpus dépassant ces limites est refusé avant toute suppression ; aucune
source n'est retirée du plan et l'opération n'est pas découpée. Les tests simulés
couvrent l'usage publié, le commit avec toutes les sources, la source republiée
pendant le décompte, la validation de chaque famille de référence, la suppression
qui gagne face à une session déjà ouverte et la conservation du candidat refusé.
`test/gitlab/qualificationSuppressions.test.ts` porte les scénarios réels à deux
comptes ; ils restent sautés en l'absence de configuration du banc. Leur succès
sur GitLab CE 18.11 est consigné en §18 et la portée `suppression-definition`
est ouverte dans `PORTEEES_OVERTES_GITLAB`.

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

À l'issue de D1, les suppressions de définitions restaient refusées. Elles
n'étaient pas un oubli : leur politique de références relevait du jalon D2,
qualifié ensuite en §18.

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

## 18. Ce que la qualification D2 a trouvé

Le jalon D2 est qualifié le 26 septembre 2026 sur GitLab CE 18.11, à deux comptes,
dans `test/gitlab/qualificationSuppressions.test.ts`. Les deux scénarios ont
réussi contre l'instance réelle.

| Scénario | Résultat mesuré |
|---|---|
| Suppression face à une session déjà ouverte | 1 commit de données, 3 commits au total, 7 requêtes, ≈ 2,2 s |
| Suppression d'une définition encore utilisée dans une version publiée | refus métier avec un usage, 0 commit de données, 2 commits de coordination, 6 requêtes, ≈ 0,9 s |

Dans le premier scénario, Alice retire le thème pendant que Bob tient déjà
l'entretien. Le candidat de Bob qui réintroduit ce thème est refusé avec le motif
`references`, sans dégrader sa session ni modifier la version publiée. Après
retrait de la référence, le même candidat est publié et la session se ferme
normalement. Le corpus distant conserve la suppression pendant toute la séquence.

Dans le second scénario, l'entretien publié porte déjà le thème. Le décompte frais
renvoie un usage, aucun commit de données ne retire la définition et le corpus
reste intact. Ces résultats valident les deux sens de la garde croisée : une
suppression confirmée bloque une ancienne référence, et une référence publiée
bloque la suppression. La portée `suppression-definition` est donc ouverte ; la
suppression d'un entretien reste fermée et relève du lot E.

## 19. Décisions et étapes du lot E

Cette section ferme les choix laissés ouverts en §7 avant d'écrire la suppression
GitLab. Elle décrit un seul geste métier, mais celui-ci traverse quatre états
persistants : préparation distante, publication atomique, confirmation distante et
application locale. Les noms du code décriront ces états et ces responsabilités ;
ils ne reprendront ni la lettre du lot ni les numéros de jalon.

### 19.1 Découpage et arrêts

| Jalon | Contenu | Zones principales | Arrêt avant de continuer |
|---|---|---|---|
| E1 | Contrats de plans distant et local, analyse d'impact fraîche, destination d'archive et tests du `move` GitLab | `shared/corpus/suppressionEntretien.ts`, `transactionsFichiers.ts`, `gitlab/transactions.ts`, test de contrat | oui : aucun dispatch ni capacité ouverte |
| E2 | Publication sous deux droits, journal versionné et réconciliation certaine d'un `move` | `gitlab/bailGitLab.ts`, `gitlab/publication.ts`, `gitlab/journalPublication.ts` | oui : perte de réponse et perte séparée de chaque droit couvertes |
| E3 | Orchestration de suppression, fermeture de session, installation locale durable et reprise au démarrage | `gitlab/transactions.ts`, `gitlab/contexte.ts`, `gitlab/ouverture.ts`, `corpusStore.ts` | oui : scénarios de crash couverts sans réémission du commit |
| E4 | Façade du contexte, dispatch main, consommation de la capacité par le renderer, documentation et non-régressions | `main/index.ts`, `gitlab/politiqueGestes.ts`, composables renderer et documentation | oui : capacité encore fermée pour le banc |
| E5 | Qualification GitLab réelle à deux comptes, mesures, puis ouverture de `suppressionEntretien` et `entretien.supprimer` | test de qualification, `docs/dev/gitlab.md`, documentation utilisateur | sortie du lot |

Les arrêts de E1 à E4 sont des points de revue. Un plan distant correct sans reprise
locale n'est pas une suppression livrable ; réciproquement, déplacer des sauvegardes
locales ne prouve rien sur l'atomicité GitLab. Jusqu'au succès de E5, l'analyse et la
suppression restent refusées par le main pour GitLab, même si leur code est testable
directement.

### 19.2 États et invariants de l'opération

Une suppression possède un identifiant stable créé avant la préparation. Son journal
ne change jamais cet identifiant et l'opération n'est jamais réémise automatiquement.
Les états utiles sont :

1. **préparée** : les deux droits sont détenus, les actions distantes et le plan local
   sont durables, mais aucun commit de données n'est confirmé ;
2. **indéterminée** : l'envoi a pu aboutir, aucune conclusion locale n'est permise ;
3. **confirmée à installer** : le commit a été reçu ou retrouvé, le retrait local
   reste à terminer ;
4. **installée** : le plan local est entièrement appliqué et le journal composite
   peut être supprimé.

Les invariants suivants valent dans tous les jalons :

- ni `corpus.json` ni un fichier local n'est modifié avant la confirmation distante ;
- le commit de données contient le retrait du membership, le déplacement du JSON et
  les transitions des deux baux, ou ne contient rien de tout cela ;
- une opération indéterminée bloque toute nouvelle transaction sur `corpus.json` et
  toute nouvelle suppression, mais reste consultable et réconciliable ;
- une confirmation distante ne supprime pas le journal tant que le plan local n'est
  pas appliqué ;
- une reprise applique le même plan idempotent, jamais un second `move` GitLab ;
- une fermeture ou une bascule de contexte attend l'opération engagée et n'applique
  jamais son résultat au corpus suivant.

Le journal de publication actuel disparaît dès la confirmation. Ce cycle convient aux
mutations de `corpus.json` réparables par un tirage, mais pas à une suppression : un
tirage ne sait pas où archiver les `.bak` et les PNG. E2 introduit donc explicitement
un état « confirmé à installer », au lieu de compter sur une fenêtre sans crash entre
le retour du publieur et `appliquerTransactionFichiers`.

### 19.3 Analyse d'impact et fermeture de notre session

L'analyse affichée avant confirmation ne lit plus le seul miroir pour GitLab. Une
méthode dédiée lit un `corpus.json` publié à une référence immuable, valide sa version
et calcule `ImpactSuppressionEntretien`. Elle ne prend aucun bail et n'accorde aucun
droit : son résultat est un aperçu susceptible de périmer.

La commande confirmée suit ensuite cet ordre, dans le contexte capturé :

1. marquer l'identifiant comme « suppression en cours » afin qu'une nouvelle ouverture
   locale ne puisse pas recréer une session pendant l'opération ;
2. fermer notre éventuelle session par `ContexteGitLab.fermerEntretien`, ce qui publie
   d'abord son candidat puis libère son bail ;
3. si la fermeture est refusée, dégradée ou indéterminée, enlever la marque, restaurer
   l'autorisation d'écriture si la session tient encore réellement son droit, et
   arrêter sans acquérir le bail corpus ;
4. acquérir ensuite les droits de suppression et recalculer l'impact sur la base
   fraîche protégée ;
5. comparer cet impact à celui confirmé par l'utilisateur. Toute différence demande
   une nouvelle confirmation et ne publie aucun commit de données.

Fermer notre session ne réserve pas l'entretien. Entre sa libération et l'acquisition
du droit de suppression, un autre poste peut gagner : c'est attendu, et la suppression
est alors refusée en nommant ce détenteur. Aucun raccourci fondé sur le même compte,
la même machine ou une ancienne génération n'est admis. Un candidat que notre session
ne peut pas publier reste récupérable ; la suppression ne l'écrase jamais pour avancer.

L'ouverture d'entretien et la suppression doivent partager une barrière du contexte.
La solution peut être une entrée dans la file du contexte ou un registre explicite
des suppressions en cours, mais pas un simple test avant l'acquisition : une ouverture
locale arrivée pendant l'attente du second bail doit être refusée jusqu'à la fin ou à
l'abandon de l'opération.

### 19.4 Acquisition et libération des deux droits

Les ressources sont le `corpus.json` canonique et
`entretiens/<id>.json`, tous deux préfixés par la racine GitLab avant l'appel à
`cleRessourceBailGitLab`. L'ordre est global et immuable :

1. acquérir le droit du corpus ;
2. acquérir le droit de l'entretien ;
3. préparer et publier sous les deux droits ;
4. après un résultat certain, libérer l'entretien puis le corpus.

Si le second droit est tenu, l'erreur nomme son détenteur et le droit corpus déjà
acquis est rendu. Si une acquisition ou une libération rencontre un marqueur legacy,
les règles conservatrices du coordinateur restent prioritaires. Une libération en
échec réseau ne transforme pas une suppression confirmée en refus ; elle laisse un
bail expirer et la documentation de reprise indique son état.

Sans session préalable à fermer, le chemin nominal coûte cinq commits hors incident :
deux acquisitions, un commit de données et deux libérations. Les deux acquisitions
restent séparées pour conserver l'ordre canonique et les refus nommés. En revanche,
les deux renouvellements portés
par la publication sont dans le même commit que les données.

Une opération indéterminée suspend les deux droits. Ils ne sont pas libérés avec des
gardes anciennes : la réconciliation adopte d'abord, pour chacun, le commit, le
compteur et l'expiration retrouvés. Au démarrage, un bail n'est rendu que si son compte
et sa génération correspondent à l'entrée journalisée. Une reprise par un tiers
change la génération et interdit donc toute libération abusive.

### 19.5 Préparation fraîche et destination distante

Après les deux acquisitions, la transaction résout une seule fois la branche en SHA,
puis lit à ce SHA :

- `corpus.json`, avec son `last_commit_id` ;
- `entretiens/<id>.json`, avec son propre `last_commit_id` et son contenu attendu ;
- la destination d'archive choisie, pour vérifier son absence.

La préparation valide versions, membership, identifiant et impact confirmé. Un
entretien absent du membership, un JSON source absent ou illisible et une version non
prise en charge sont des refus explicites. Si une suppression journalisée de ce même
entretien existe déjà, seule sa reprise est permise ; une nouvelle opération ne tente
pas de rendre le geste artificiellement idempotent.

La première destination proposée est `corbeille/<id>.json`. Si elle existe déjà, la
transaction choisit un nom non conflictuel portant un suffixe stable dérivé de
l'identifiant d'opération, puis enregistre ce chemin exact dans le journal. Le même
nom est réutilisé après redémarrage. Un test de contrat réel vérifie avant E2 qu'un
`move` vers une destination occupée est refusé sans écrasement ; quel que soit le
résultat de cette sonde, le code ne compte pas sur un écrasement GitLab pour résoudre
une collision.

Le plan distant contient exactement deux actions métier :

1. `update <racine>/corpus.json` sous sa garde, avec le membership et les références
   CAS ajustés par les règles métier existantes ;
2. `move <racine>/entretiens/<id>.json` vers la destination enregistrée, sous la garde
   de la source.

Le corps final ajoute les deux actions de bail. Les contrôles de nombre et de taille
portent donc sur quatre actions et sur le JSON HTTP exact. Aucun `.bak1`, `.bak2`, PNG
ou média n'entre dans le dépôt. Les médias restent référencés à leur emplacement et
ne sont ni lus ni supprimés par ce geste.

### 19.6 Publication atomique sous deux droits

`PublieurGitLab` reçoit une primitive multi-droits ; l'API à un droit délègue à cette
primitive pour éviter deux protocoles divergents. La primitive :

1. refuse une liste vide, un droit dupliqué ou deux droits sur la même ressource ;
2. prend la file de commits de la destination une seule fois ;
3. capture l'état des deux droits, puis prépare leur transition sans envoyer de
   commit ;
4. compile les actions métier, ajoute les deux mutations de bail et contrôle les
   bornes finales ;
5. journalise l'ensemble avant l'envoi ;
6. confirme les deux transitions avec le même identifiant de commit, ou les annule
   toutes avant envoi si la préparation ou l'écriture du journal échoue.

Sur un refus 400/409, toutes les gardes métier et de bail sont relues. Si elles
n'ont pas bougé, le réessai unique de collision de branche reste permis. Si l'une a
bougé, le résultat indique quel droit ou quelle donnée a été perdu, sans présenter
l'autre droit comme intact par supposition. Un 401/403, une limite ou une expiration
reste un refus atomique du commit entier.

Après une erreur de transport, les deux droits passent à l'état suspendu. Une
réconciliation confirmée adopte les deux états de bail ; une absence certaine annule
les transitions sans installer le candidat ; une incertitude conserve journal et
blocage. Il n'existe aucun état serveur où un seul des deux baux aurait été renouvelé
par le commit de données, puisque leurs actions partagent ce commit.

Les tests du coordinateur couvrent séparément : expiration du droit corpus, expiration
du droit entretien, perte de chaque génération, erreur pendant la préparation du
second droit, journal impossible à écrire, collision de branche et réponse perdue.
Chaque cas vérifie les deux états internes, pas seulement le résultat public.

### 19.7 Journal composite et réconciliation du `move`

Le journal gagne une nature explicite `suppression-entretien` et une version capable
de porter :

- la liste des deux ressources avec `resourceHash`, génération et garde de bail ;
- les actions distantes compilées et leurs contenus séparés comme aujourd'hui ;
- le chemin source, le chemin d'archive et l'empreinte SHA-256 du JSON déplacé ;
- le plan local complet, avec ses destinations déjà choisies ;
- l'état `prepare`, `indetermine` ou `confirme-a-installer` et, dans ce dernier cas,
  l'identifiant du commit retrouvé.

Les entrées anciennes à un droit restent lisibles et sont projetées vers une liste
d'un élément. Une entrée qui ne peut pas être classée reste bloquante et récupérable,
comme aujourd'hui. `transactionsCorpusJournalisees` inclut la suppression, puisqu'elle
écrit `corpus.json`.

La réconciliation d'un `move` ne compare jamais la destination à
`action.content`, qui n'existe pas dans la requête GitLab. Pour le commit exact retrouvé,
elle vérifie :

1. le contenu publié de `corpus.json` et des deux baux, comme pour les actions
   `update` ;
2. l'absence de l'ancien chemin à ce commit ;
3. la présence de la destination et son empreinte égale à celle du JSON source lu
   pendant la préparation ;
4. si nécessaire pour diagnostiquer une incohérence, la même empreinte à l'ancien
   chemin sur sa révision gardée.

Une seule divergence laisse le résultat indéterminé ; elle n'autorise ni installation
locale ni nouvel envoi. Un commit confirmé passe à `confirme-a-installer` sans supprimer
l'entrée. Un commit certainement absent retire l'intention distante et conserve tous
les fichiers locaux. La recherche par titre exact et identifiant stable reste bornée
comme dans le réconciliateur actuel.

### 19.8 Plan local et reprise après crash

Le plan local est distinct du plan distant. Il est construit dans la file du contexte,
avant l'envoi, avec :

- `corpusAvant` égal à l'état du miroir réellement présent à cet instant ;
- `corpusApres` égal au candidat distant préparé sur la base fraîche ;
- le déplacement de `entretiens/<id>.json` s'il est présent localement ;
- les `.json.bak1`, `.json.bak2` et tous les PNG préfixés par l'identifiant qui
  existent au moment de la préparation ;
- une destination locale non conflictuelle, choisie une fois et enregistrée pour
  chaque fichier.

La préparation métier du retrait est extraite de l'inventaire de fichiers : le même
calcul frais produit `corpusApres`, tandis que l'inventaire local ne décide jamais du
commit GitLab. L'aléa actuel de `destinationCorbeille` ne doit pas être rejoué au
redémarrage. Aucune destination existante n'est écrasée ; une collision apparue après
la préparation suspend l'application et conserve le journal pour intervention ou
nouvelle reprise sûre.

Après confirmation, `appliquerTransactionFichiers` écrit d'abord le retrait du
membership puis effectue les déplacements, selon son protocole journalisé et
idempotent. Le journal composite n'est supprimé qu'après son succès. Les fenêtres de
panne sont traitées ainsi :

- arrêt avant l'envoi : aucune donnée distante ni locale n'a changé ;
- arrêt après envoi sans réponse : le commit est recherché, jamais rejoué ;
- arrêt après confirmation avant journal local : le plan composite suffit à créer et
  appliquer la transaction locale ;
- arrêt pendant l'application : `.transaction-fichiers.json` termine l'opération ;
- arrêt après application avant nettoyage : le même plan constate le corpus cible et
  les destinations déjà présentes, puis termine sans double déplacement.

À l'ouverture, une transaction locale déjà commencée est d'abord reprise. Les
publications composites sont ensuite réconciliées ; une suppression confirmée est
installée avant le tirage normal, afin que le miroir ne transforme pas prématurément
le JSON en orphelin de `corbeille-miroir`. Le tirage remet enfin le manifeste au niveau
du commit publié. Si le corpus ou un fichier local ne correspond ni à l'avant ni à
l'après attendus, rien n'est écrasé et l'ouverture signale une reprise bloquée.

Le miroir neuf n'a aucun plan local à appliquer : il tire seulement le membership
sans l'entretien et ignore `corbeille/`. Le miroir d'origine, lui, conserve JSON,
sauvegardes et PNG dans sa corbeille locale. Ces deux chemins font partie de la
recette, car ils prouvent des propriétés différentes.

### 19.9 Façade, capacités et messages

`ContexteGitLab` expose deux opérations métier, analyser puis supprimer, et centralise
la fermeture de session ainsi que la barrière d'ouverture dans le processus main. Le
handler IPC ne réutilise pas le chemin Nextcloud ni son objet `sessions` : il route
explicitement vers le contexte GitLab capturé, après `exigerGeste`.

La capacité publique `suppressionEntretien` reste fausse jusqu'à E5. Une fois ouverte,
le renderer réutilise la confirmation d'impact existante, mais les messages distinguent :

- impact périmé, qui demande une nouvelle confirmation ;
- entretien tenu, avec l'identifiant connu ;
- candidat local non publiable ;
- publication indéterminée, qui demande une actualisation sans proposer de recommencer ;
- suppression distante confirmée mais archivage local à reprendre.

L'interface et la documentation indiquent que la suppression GitLab n'est pas
annulable depuis le journal Sonal. Elles précisent que le JSON est archivé dans le
dépôt, que les sauvegardes et PNG ne le sont que localement, que les médias restent en
place et que les orphelins GitLab antérieurs ne sont pas balayés par ce lot.

### 19.10 Tests simulés bloquants

Avant le banc, les suites couvrent au minimum :

- analyse sur miroir périmé, puis impact inchangé et impact modifié au moment protégé ;
- fermeture d'une session propre, publication de son candidat, refus de fermeture et
  conservation d'un candidat dégradé ;
- acquisition corpus puis entretien, second bail tenu, marqueur legacy et libérations
  dans l'ordre inverse ;
- ouverture locale concurrente avant le premier bail, entre les deux acquisitions et
  pendant le commit ;
- source ou membership disparu, garde corpus périmée, garde entretien périmée et
  destination distante occupée, sans mutation partielle ;
- perte séparée de chacun des droits, expiration pendant la préparation et collision
  de branche sans rapport ;
- `move` confirmé, absent et incohérent ; destination correcte mais source encore
  présente, source absente mais empreinte incorrecte ;
- réponse perdue retrouvée, réponse toujours indéterminée et commit certainement
  absent, sans second envoi ;
- crash à chaque frontière décrite en 19.8, avec JSON, deux sauvegardes et plusieurs
  PNG, puis reprise idempotente ;
- miroir périmé, miroir sans JSON local, collision de corbeille locale, miroir neuf et
  absence de réimport de l'archive distante ;
- médias référencés inchangés, manifeste remis à niveau, tirage concurrent, fermeture
  et bascule de contexte ;
- appels IPC directs avec capacité fermée puis ouverte, commandes renderer, et
  non-régression des suppressions locale et Nextcloud.

Les doubles reproduisent les propriétés GitLab mesurées : `move` gardé, destination
non écrasée et commit atomique. Si la sonde réelle de E1 contredit l'une d'elles, le
plan est corrigé avant E2 ; le double n'est jamais utilisé pour inventer le contrat.

### 19.11 Qualification réelle et activation

La recette E5 utilise deux comptes et les images déjà présentes. Elle exécute au
moins les scénarios suivants :

1. suppression nominale avec impact CAS, archive distante, archive locale complète,
   réouverture du miroir d'origine et ouverture d'un miroir neuf ;
2. entretien tenu par l'autre compte, puis course où ce compte ouvre pendant la
   suppression : une seule acquisition gagne et aucune donnée n'est partiellement
   modifiée ;
3. réponse du commit de données perdue, commit retrouvé, deux baux rendus et plan
   local appliqué une seule fois ;
4. arrêt après commit avant installation, redémarrage et reprise des sauvegardes et
   PNG sans republication ;
5. collision d'archive distante et locale, sans écrasement ;
6. garde de `corpus.json` puis garde de l'entretien périmée à tour de rôle, avec
   atomicité vérifiée sur la branche.

Le compte rendu sépare les tests simulés, la sonde de contrat et les scénarios E2E.
Il mesure requêtes, cinq commits nominaux, durée, taille du corps et temps de reprise,
puis consigne ces résultats dans `docs/dev/gitlab.md`. La documentation utilisateur
est mise à jour dans la même passe.

La capacité n'est ouverte qu'après vérification des quatre preuves suivantes : retrait
et archive dans un même commit, exclusion effective par les deux baux, réconciliation
sans rejeu et récupération locale après crash. Un scénario sauté faute de banc laisse
la capacité fermée.

## 20. Ce que le lot E a trouvé — jalons E1 à E4

Les quatre premiers jalons de §19 sont faits. À ce stade — avant le jalon E5 — la
suppression n'était pas proposée par l'interface et le main refusait
`entretien.analyser-suppression` comme `entretien.supprimer` sur un corpus GitLab.
Le jalon E5 a ouvert la capacité ; voir §21.

### Le contrat du geste a été séparé en deux

`CorpusStore` expose désormais deux méthodes distinctes.
`preparerRetraitEntretien` calcule le retrait métier — le membership et ses
références — et ne touche à aucun fichier. `inventorierFichiersSuppression`
relève ce qui doit être archivé dans le miroir. La suppression locale et
Nextcloud continuent d'appeler les deux d'affilée ; GitLab appelle la première
dans le store de préparation, sur la base fraîche protégée, et la seconde dans
le miroir. C'est la traduction directe de « l'inventaire local ne décide jamais
du commit distant », et cela évite qu'une préparation soit calculée sur un miroir
périmé.

### L'archive porte un nom choisi une fois

`corbeille/<id>.json` est la première destination. Occupée, elle reçoit un
suffixe dérivé de l'identifiant d'opération, et ce chemin exact est journalisé :
un redémarrage retrouve la même archive, et deux tentatives ne s'échangent pas
leurs fichiers. Deux noms pris sont un refus. La règle locale est identique, et
`destinationCorbeille` n'est plus employée par ce chemin : son aléa aurait été
rejoué à chaque reprise.

Une sonde de contrat a été ajoutée à `contrat-gitlab.test.ts` pour vérifier sur
l'instance réelle qu'un `move` vers une archive occupée est refusé sans
l'écraser. Elle est écrite, pas encore jouée.

### La publication multi-droits est une primitive, pas un second protocole

`publierSousDroits` tient la file de commits une fois, prépare **toutes** les
transitions avant d'envoyer quoi que ce soit, n'en confirme aucune si la
préparation ou le journal échoue, et n'en annule aucune si un seul droit est
expiré. Le cas à un droit délègue à cette primitive. Sur un refus 400/409, chaque
droit est jugé sur sa propre garde : le message nomme celui qui a bougé au lieu
de présenter les deux comme intacts. `BailGitLab.droitPerdu` rend cette
information au transactionneur au lieu de la lui faire deviner.

### Le journal porte une liste de droits, et survit à la confirmation

La version 3 remplace `resourceHash`/`generation`/`leaseCommitId` par une liste
de droits, et ajoute l'état `confirme-a-installer` ainsi que le bloc de
suppression : chemin source, chemin d'archive, empreinte du JSON déplacé et plan
local complet. Les entrées à un droit, anciennes ou de la version précédente,
restent lisibles et sont projetées vers une liste d'un élément.

L'empreinte de l'archive est portée par l'action de déplacement elle-même. La
réconciliation ne compare donc plus la destination à un `content` inexistant :
elle vérifie le départ de l'ancien chemin, la présence de la destination et
l'empreinte. C'est une correction du réconciliateur, pas une branche
particulière : tout déplacement journalisé devient vérifiable.

### La reprise est sortie de l'ouverture

`reprendreOperationsGitLab` porte l'ordre imposé : la transaction locale déjà
commencée, puis les publications composites, puis — pour le miroir — le tirage
normal. Une suppression confirmée est installée avant le tirage, faute de quoi
`corpus.json` sans son entretien deviendrait un orphelin de `corbeille-miroir`
alors que ses sauvegardes et ses PNG n'auraient nulle part où aller.

### Ce qui a été vérifié, et comment

`test/gitlab/suppressionEntretien.test.ts` couvre le parcours nominal (un
commit de données, quatre actions, cinq commits au total, archive distante et
archive locale complètes, médias et autres entretiens intacts), l'aperçu lu sur
le corpus publié plutôt que sur le miroir, l'impact qui change entre l'aperçu et
la commande, les deux droits (détenteur nommé, marqueur historique expiré, droit
d'entretien perdu pendant l'envoi), les gardes de données périmées, les
collisions d'archive distantes et locales, la réponse perdue retrouvée, la
réconciliation impossible qui bloque tout, l'arrêt après le commit, l'arrêt au
milieu de l'application locale, la panne avant envoi, et la façade du contexte
avec sa fermeture de session et sa barrière d'ouverture.

Le double de dépôt a été corrigé au passage : il traitait un `move` comme une
mise à jour de sa destination, et refusait donc toute suppression. Il vérifie
maintenant la garde sur le chemin d'origine et refuse une destination occupée —
ce qui est précisément le contrat que la sonde réelle doit confirmer.

### Ce qui reste : le jalon E5

`test/gitlab/qualificationSuppressionEntretien.test.ts` écrit les scénarios
de la recette de §19.11, avec le harnais étendu pour les deux pannes utiles —
perte de la réponse du commit de données, historique illisible — et pour des
courses déterministes sur le corpus comme sur l'entretien. Le harnais a été
étendu, pas contourné : les courses passent par l'API, pas par un double.

Le fichier reste sauté sans les variables du banc. Trois choses en dépendent :
le coût réel des cinq commits nominaux, la confirmation que le `move` gardé et
la destination occupée se comportent comme le suppose le double, et la reprise
après un arrêt sur une instance réelle. La capacité reste fermée tant qu'un seul
scénario est sauté.

## 21. Ce que la qualification E5 a trouvé

Le jalon E5 a été joué le 26 septembre 2026 puis complété le 27 septembre sur
GitLab CE 18.11, à deux comptes, dans
`test/gitlab/qualificationSuppressionEntretien.test.ts`. Les huit scénarios ont
réussi, et la capacité `suppression-entretien` est ouverte.

| Scénario | Résultat mesuré |
|---|---|
| Suppression nominale | 1 commit de données, 5 commits au total, 9 requêtes, ≈ 2,2 s |
| Entretien tenu par l'autre compte | refus nommant `user2`, 0 commit de données, aucune archive |
| Ouverture entre les deux acquisitions | le second compte gagne le bail entretien, refus nommé, aucune archive |
| Réponse du commit de données perdue | commit retrouvé, 1 commit de données, deux baux rendus, plan local appliqué une fois |
| Arrêt après commit, nouvelle pile applicative | archive locale terminée, aucun commit supplémentaire |
| Collision d'archive, dépôt et miroir | suffixe stable des deux côtés, aucune archive écrasée |
| Entretien modifié entre la lecture et l'envoi | commit refusé, version concurrente et membership intacts |
| Corpus modifié entre la lecture et l'envoi | commit refusé, entretien et archive intacts |

Le coût nominal est bien celui qu'annonçait le §8 : cinq commits hors incident,
dont un seul de données, et neuf requêtes. Une suppression est donc plus chère
qu'une transaction de définitions (trois commits), et c'est le prix de la
protection par les deux baux.

Les quatre preuves d'activation sont réunies. La capacité est ouverte.

### Le banc a trouvé trois erreurs de harnais

Aucune ne venait du code de production ; toutes trois étaient des contrats que
les tests simulés ne vérifiaient pas, et qu'un seul banc pouvait révéler.

1. **Le bail d'une session de qualification n'était pas celui de son fichier.**
   Le harnais passait un identifiant de session (`entretien:qualification:e1`) là
   où la production passe `ressourcePartagee`, calculé sur le chemin distant. Les
   deux ressources étant distinctes, une suppression concurrente ne rencontrait
   jamais le bail de la session : le scénario « entretien tenu par l'autre
   compte » passait sans rien tester, et l'exclusion par les deux baux n'était
   prouvée que par le double. Le harnais utilise désormais le chemin distant.

   Ce point est plus large que le harnais : il rappelle qu'un test de banc ne
   vaut que s'il emprunte le même chemin de production. Une session de
   qualification doit être bâtie comme `assemblageSession.ts` la construit.

2. **Le filtre `path` de l'API des commits est un préfixe.** Compter les commits
   d'un fichier revient à compter ceux de son dossier, et l'API répond même pour
   un nom qui n'existe pas — en renvoyant les commits du répertoire parent. Le
   compte obtenu pour une archive était treize au lieu d'un. Les archives se
   comptent désormais par `…/corbeille`, et le harnais le dit.

3. **Le corpus de qualification n'était pas tirable.** Son entrée de `membership`
   portait un `lastModified` nul, ce que `validerCandidatsMiroir` refuse. Le corpus
   était donc acceptable pour une transaction et refusé pour un tirage : le
   scénario du miroir neuf ne pouvait pas aboutir. Le fixture porte désormais une
   date ISO.

### La sonde de contrat confirme le double

`contrat-gitlab.test.ts` vérifie désormais qu'un `move` gardé vers une archive
déjà occupée est **refusé sans écrasement**. GitLab CE 18.11 se comporte bien
comme le suppose le double, et la collision d'archive se règle donc par un nom
non conflictuel, jamais par un écrasement.

Le double de dépôt avait au passage le bug qui rendait la sonde nécessaire : il
traitait un `move` comme une mise à jour de sa destination et refusait donc tout
déplacement. Aucun test ne l'employait avant la suppression.

### Ce qui reste ouvert

Rien ne bloque la livraison. Deux relevés méritent d'être faits sur un
corpus pilote, comme ceux déjà signalés au §17.3 :

- **la taille réelle d'un entretien de travail.** Le `move` ne transporte pas de
  contenu, mais la préparation lit le JSON avec sa garde pour valider sa version
  et calculer l'empreinte de l'archive. La borne de lecture s'applique donc au
  retrait, soit environ 1,5 Mio de contenu avec la limite actuelle de 2 Mio sur
  la réponse base64.
- **la réconciliation face à un `move` réellement joué sur une autre révision.**
  Le double ne connaît pas les arbres intermédiaires, et le test de contrat ne
  rejoue pas une réconciliation complète. Sur l'instance réelle, la qualification
  a retrouvé le commit exact ; elle ne prouve pas le cas où l'archive aurait été
  réécrite entre le commit et la reprise.

## 22. Lot F — Écritures d'entretien depuis les vues corpus

Les vues **Variables** et **Pseudonymisation** ne modifient pas toutes la même
ressource. Cette distinction décide du verrou nécessaire :

- créer ou modifier la définition d'une variable ou d'une modalité, ainsi qu'une
  règle d'anonymisation ou ses paramètres, écrit `corpus.json` ; GitLab sait déjà
  le faire sous bail corpus ;
- affecter, remplacer ou retirer une valeur — la modalité choisie pour une variable —,
  poser ou retirer une anonymisation, ou modifier une exception écrit
  `entretiens/<id>.json` ; chaque entretien visé doit donc être protégé par son
  propre bail.

Une garde Git `last_commit_id` ne remplace pas ce bail. Un collègue peut détenir
une session sans avoir encore publié de nouveau contenu : la garde du fichier
reste alors fraîche, mais une écriture extérieure empiéterait sur son travail.
Le badge observé n'est pas davantage une autorisation ; il informe l'interface,
tandis que l'acquisition du bail décide au moment de l'écriture.

### 22.1 État actuel

La partie informative existe déjà sur GitLab : `ObservationBailsGitLab` relève
les baux à l'ouverture et à l'actualisation, `absorberVerrous` les associe aux
entretiens, et les vues affichent ou consomment `badgeVerrou`. Les lignes tenues
par un tiers apparaissent donc verrouillées.

La capacité d'écriture n'est toutefois pas livrée :

- `tableDonnees` vaut `false` pour GitLab ; les cellules de valeurs sont toutes
  non éditables, indépendamment des badges ;
- `valeurs.lot` et `regles.lot` ont la portée `indisponible` et sont refusés par
  le main ;
- `TransactionsGitLab` n'a pas d'équivalent de `poserValeurLot` ni
  d'`appliquerRegleLot` ;
- la vue Pseudonymisation permet encore de préparer certains changements sur les
  entretiens libres avant que leur validation soit refusée par le main. Elle doit
  recevoir une capacité propre, distincte de l'édition des définitions de règles.

Le chemin WebDAV existe déjà dans `distant/transactions.ts` : verrou court par
entretien, GET frais, PUT conditionnel, écriture locale après succès et échecs
nommés par entretien. La politique des gestes classe pourtant actuellement
`valeurs.lot` et `regles.lot` comme indisponibles pour **tous** les fournisseurs
distants. Ce routage rend les transactions WebDAV inaccessibles et constitue une
régression à corriger avant de prendre leur comportement comme référence pour
GitLab.

### 22.2 Garanties retenues pour GitLab

Une opération issue d'une vue corpus est une suite de transactions courtes, une
par entretien. Un lot n'est pas atomique dans son ensemble : chaque succès est
conservé, chaque refus est nommé, et un entretien indisponible ne bloque pas les
suivants.

Pour un entretien fermé, chaque transaction suit cet ordre :

1. acquérir le bail canonique de `entretiens/<id>.json` ;
2. résoudre un SHA et y lire l'entretien ainsi que `corpus.json` ;
3. vérifier que la variable, la modalité ou la règle référencée existe encore,
   puis calculer le candidat sans modifier le miroir ;
4. publier dans un seul commit la mise à jour gardée de l'entretien, une garde
   inchangée de `corpus.json` et la transition du bail entretien ;
5. installer localement seulement après confirmation, puis libérer le bail.

La garde inchangée de `corpus.json` reprend la politique des publications de
session du jalon D2 : une définition supprimée entre la lecture et le commit fait
refuser le candidat. Une collision de branche sans garde périmée conserve le
réessai vérifié existant. Aucun commit n'est découpé et aucune garde n'est retirée
pour faire passer un lot.

Si notre application détient déjà la session de l'entretien, elle réutilise cette
session, modifie son candidat, le marque sale et publie par son chemin normal ;
elle ne prend jamais un second bail sur le même fichier. Une session dégradée ou
un candidat non publiable produit un échec récupérable. Une session tierce, y
compris du même compte ou du même poste avec une autre génération, est refusée
par l'acquisition et nommée lorsque son identité est connue.

Une réponse perdue n'autorise aucun rejeu automatique. Le journal distingue ces
transactions courtes des publications de session et des transactions de corpus,
ou démontre explicitement qu'une nature existante porte toutes les informations
nécessaires sans ambiguïté. La réconciliation vérifie l'entretien, la garde de
corpus et le bail au commit exact. Un crash après confirmation mais avant
l'écriture locale est réparé par la réconciliation puis le tirage, sans réappliquer
le geste métier.

### 22.3 Capacités et interface

La matrice publique sépare au minimum :

- l'édition des définitions de variables et de pseudonymisation, déjà disponible ;
- la saisie des valeurs dans les entretiens ;
- l'application de pseudonymisation dans les entretiens.

GitLab ne reçoit pas une capacité générale d'écriture d'entretien. Les contrôles
de chaque vue sont activés uniquement par leur capacité propre. Sur la vue
Pseudonymisation, les règles et paramètres peuvent donc rester éditables pendant
que les cases qui modifieraient les entretiens sont désactivées.

Les badges restent indicatifs et peuvent être périmés jusqu'au tirage suivant.
Une ligne sans badge tente toujours l'acquisition réelle ; une ligne avec badge
peut redevenir disponible lors de cette tentative si le bail a expiré. Une panne
d'observation ne crée jamais un droit : l'opération peut tenter les acquisitions
et restitue les refus réels entretien par entretien.

### 22.4 Découpage

| Jalon | Contenu | Arrêt avant de continuer |
|---|---|---|
| F1 | Corriger la portée de `valeurs.lot` et `regles.lot` pour rétablir le chemin WebDAV ; ajouter les capacités séparées et aligner l'interface | franchi : non-régression WebDAV et appels IPC directs couverts |
| F2 | Ajouter les transactions GitLab courtes à un entretien, la garde croisée de `corpus.json`, le chemin des sessions locales et le journal de réponse perdue | franchi : capacités GitLab restées fermées |
| F3 | Brancher Variables et Pseudonymisation, afficher les échecs par entretien et empêcher toute préparation trompeuse quand la capacité manque | franchi : tests renderer et main complets |
| F4 | Qualifier sur GitLab réel à deux comptes, mesurer coût et reprise, puis ouvrir séparément les deux capacités | franchi : §24 |

Les noms du code décrivent les capacités métier et les ressources protégées ; ils
ne reprennent ni la lettre du lot ni les numéros de jalon.

### 22.5 Tests bloquants

Les tests simulés et les bancs réels couvrent séparément les valeurs et la
pseudonymisation :

- entretien tenu avant le geste, puis acquisition concurrente après un badge
  absent ou périmé ; refus nommé et aucun contenu écrasé ;
- même compte sur une autre session, session locale réutilisée et session locale
  dégradée ; aucun second bail pris ;
- entretien ou `corpus.json` modifié entre la lecture et le commit ; refus
  atomique et candidat local intact ;
- variable, modalité ou règle supprimée pendant la préparation ; aucune référence
  invalide publiée ;
- lot mêlant succès et refus ; résultat stable, ordre explicite et miroir mis à
  jour seulement pour les succès ;
- réponse perdue retrouvée, commit certainement absent et résultat toujours
  indéterminé ; aucun second envoi ;
- crash après commit avant installation locale, nouveau processus et tirage ;
  aucune double application ;
- observation des baux indisponible ; aucun faux droit déduit, acquisition réelle
  toujours décisive ;
- interface GitLab à capacité fermée puis ouverte, badges dans les deux vues et
  refus conservé pour les appels IPC directs ;
- non-régression locale et WebDAV, notamment accès effectif aux transactions déjà
  présentes dans `distant/transactions.ts`.

**Sortie attendue :** les vues corpus peuvent modifier les entretiens GitLab sans
empiéter sur une session, avec un bail court par fichier, une garde croisée des
définitions, des résultats partiels explicites et une reprise sans rejeu. Les
transactions WebDAV existantes sont de nouveau accessibles et protégées par leur
politique de gestes.

## 23. Mise en œuvre du lot F

F1 à F4 sont réalisés :

- `valeurs.lot` et `regles.lot` ont des portées séparées, accordées à WebDAV ;
- la matrice publique distingue la table de données de l'application de la
  pseudonymisation ;
- GitLab prépare une transaction courte par entretien fermé, lit l'entretien et
  le corpus au même SHA, valide les références et publie le candidat avec une
  garde inchangée de `corpus.json` ;
- un changement indépendant du corpus peut être relu une fois, tandis qu'une
  variable, une modalité ou une règle supprimée produit un refus ;
- une session locale est réutilisée, marquée sale et publiée par son chemin
  ordinaire ;
- le journal distingue `transaction-entretien`, sans la rattacher à une session
  ni bloquer les transactions de corpus ;
- Variables restitue les erreurs par cellule et Pseudonymisation conserve les
  échecs par entretien ; aucune modification ne se prépare quand sa capacité
  manque.

Les tests simulés couvrent la valeur confirmée, la pseudonymisation, la suppression
concurrente d'une modalité, la réutilisation d'une session, les succès partiels,
le routage WebDAV et les capacités du renderer. La suite complète passe ; les
diagnostics réseau de Happy DOM à la fermeture ne correspondent à aucun échec.

Les portées `valeurs-entretien` et `pseudonymisation-entretiens` sont dans
`PORTEEES_OVERTES_GITLAB` depuis la qualification à deux comptes du §24.

## 24. Ce que la qualification du lot F a trouvé

Les douze scénarios sont dans
`test/gitlab/qualificationEcrituresEntretien.test.ts`. Ils ont réussi sur GitLab
CE 18.11, à deux comptes, le 27 septembre 2026 ; les mesures sont dans
[docs/dev/gitlab.md](../../docs/dev/gitlab.md) §12.

| Scénario | Ce qui a été observé |
|---|---|
| Valeur dans un entretien fermé | 1 commit de données, 3 commits au total, 6 requêtes, 1,3 s |
| Pseudonymisation d'un entretien fermé | 1 commit de données, un seul commit sur le dossier des entretiens |
| Entretien tenu par l'autre compte | refus nommant le détenteur, aucun commit de données, miroir non écrit |
| Même compte, autre session | refus « retenu par ce poste » avec son échéance, aucun commit de données |
| Session locale déjà ouverte | un seul envoi de commit, celui du candidat ; l'entretien suivant en prend trois |
| Lot mêlé, un succès et un refus | 16 requêtes, 8 envois de commit, succès conservés et refus nommé |
| Entretien modifié entre lecture et envoi | commit refusé, version concurrente et miroir intacts |
| Modalité retirée pendant la préparation | refus après une relecture, aucune référence invalide publiée |
| Corpus modifié indépendamment | une relecture, 4 envois de commit, 1 commit de données, thème concurrent conservé |
| Réponse du commit de données perdue | commit retrouvé, 3 envois de commit, un seul commit de données |
| Arrêt après envoi, historique illisible, nouveau processus | entrée conservée puis réconciliée sans rejeu, miroir réparé par le tirage |
| Requête jamais partie | absence reconnue, une relecture, un seul commit de données dans le dépôt |

Quatre points se confirment, et deux se nuancent.

1. **La garde croisée n'est pas un bail.** Un thème ajouté entre la lecture et
   l'envoi ne coûte qu'une relecture et aboutit ; seule une définition supprimée
   fait échouer l'entretien. C'est exactement la politique du jalon D2, et elle
   tient sur des transactions courtes.
2. **Le badge n'accorde rien.** Aucun de ces scénarios ne consulte d'observation :
   un entretien tenu est refusé même sans badge, et un entretien sans badge est
   réellement tenté. L'interface peut donc afficher ses lignes sans risque.
3. **Une session locale n'est jamais doublée.** Le lot passe par la publication de
   la session quand nous détenons l'entretien, et par un bail court sinon. Le
   main continue de refuser tout ce que GitLab ne sait pas garder.
4. **Une entrée `transaction-entretien` ne bloque rien d'autre.** Après un arrêt,
   elle est réconciliée au redémarrage, le miroir se répare par le tirage, et les
   transactions de corpus n'ont jamais été bloquées par elle.

Les deux nuances :

- **Un envoi qui n'est jamais parti est un refus, pas un indéterminé.** La
  réconciliation le reconnaît, et le geste relit une fois puis aboutit : quatre
  envois de commit pour un seul commit de données dans le dépôt. La reprise
  existante des collisions de branche suffit donc, sans fenêtre supplémentaire.
- **Le refus du même compte sur une autre session ne nomme pas d'utilisateur.**
  Il dit « retenu par ce poste » et donne l'échéance du bail, parce que
  l'identifiant ne distingue pas deux postes du même compte. C'est le comportement
  attendu du lot A ; il ne faut pas le lire comme une régression.

Ce que la qualification **n'a pas** mesuré : le coût d'un lot de grande taille,
la borne de taille d'un entretien écrit par ce chemin, et la coexistence de
nombreuses transactions courtes sur une même branche. Le banc ne possède ni
configuration CI ni runner : le coût de pipeline de ces commits reste inconnu.
