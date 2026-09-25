# Corpus distants Nextcloud et GitLab — plan directeur d'implémentation

**Statut : chantier commencé ; L0/L1 en cours, façade et premières extractions L2 engagées.**
**Les protocoles GitLab de concurrence et de transfert LFS restent à valider.**

Ce document remplace la proposition précédente de `plan-gitlab3.md`, qui
privilégiait l'édition optimiste. Ce n'est plus la cible retenue.
Les [premier](plan-gitlab.md) et [deuxième](plan-gitlab2.md) plans restent des
études de référence, pas deux feuilles de route supplémentaires à exécuter.
En cas de divergence, ce document fait foi pour le périmètre et l'architecture.

## 1. Décisions et périmètre

### 1.1 Direction retenue

Construire **une application et une expérience de travail communes**, avec deux
connecteurs spécialisés : Nextcloud/WebDAV et GitLab REST/LFS.

- Pas de serveur Sonal à héberger ou maintenir.
- Pas de clone Git, d'index Git local ni de binaire Git requis.
- Modèles, éditeur, formats métier et `CorpusStore` conservés.
- Miroir local commun, extrait progressivement de `MiroirWebDAV`.
- Même objectif de collaboration : **un éditeur par entretien, les autres consultent**.
- Autosauvegarde locale, publication périodique/manuelle et publication finale.
- Médias locaux **ou** partagés dans les deux fournisseurs ; LFS est la voie
  cible pour les gros médias GitLab, pas une restriction à exposer au quotidien.
- Pas de grande classe `Storage` absorbant toutes les responsabilités.
- Migration incrémentale, sans refonte préalable de tout le distant Nextcloud.
- Modifications des contenus partagés via Sonal uniquement dans le périmètre supporté.
- En cas de perte de garantie d'exclusion, préserver le travail local et suspendre l'édition.
- Qualification locale GitLab sous Docker si les ressources le permettent ;
  aucune suppression ni installation d'image sans validation préalable.

Le choix GitLab répond à un besoin institutionnel d'hébergement accepté et
administré. Il ne constitue pas une affirmation que GitLab est intrinsèquement
plus sécurisé que Nextcloud. L'institution doit autoriser la nature des données,
leur historique et, le cas échéant, les enregistrements audio/vidéo.

### 1.2 Socle fonctionnel visé pour la livraison complète

| Usage | Contrat commun |
|---|---|
| Créer/ouvrir | Choisir une destination autorisée, sans écraser un corpus existant. |
| Consulter | Aucun verrou ni écriture serveur implicite à la simple ouverture. |
| Éditer | Acquérir l'exclusion, relire la version fraîche, éditer localement. |
| Publier | Ne pas écraser une version concurrente ni publier avec un droit repris. |
| Actualiser | Télécharger les changements sans remplacer le travail local protégé. |
| Fermer/changer de corpus | Publication puis libération ; expliquer et bloquer une transition non sûre. |
| Incident | Travail récupérable après coupure, crash ou résultat réseau indéterminé. |
| Médias | Associer localement, choisir un média partagé, téléverser et télécharger. |
| Documents cadre | Consulter, télécharger une copie et ouvrir la destination web. |
| Opérations de corpus | Préserver les mutations distantes actuellement autorisées. |

La présence informative « qui regarde ? » n'est pas l'exclusion « qui édite ? ».
Les badges de détenteur font partie du socle. La présence Nextcloud est conservée ;
son équivalent GitLab est une capacité secondaire à étudier sans créer un commit
par lecteur et par minute. Ne pas présenter la parité du socle comme une identité
absolue de toutes les fonctions et garanties serveur.

Les préversions peuvent être en lecture seule, sans OAuth ou sans connecteur
LFS terminé ; elles sont annoncées comme telles. La livraison complète comprend
le support LFS validé, mais **un projet où LFS est désactivé reste utilisable pour
les transcriptions et les associations de médias locaux**. Les fonctions de
partage média dépendent des capacités et droits détectés à la création/ouverture.
Distinguer une fonction non implémentée dans Sonal d'une fonction indisponible
sur le projet choisi ; l'utilisateur reçoit une explication et peut revérifier.

### 1.3 Hors périmètre

- Coédition simultanée d'un même texte, CRDT et fusion automatique de transcriptions.
- Branches personnelles, rebase, merge requests et interface de client Git.
- Synchronisation bidirectionnelle Nextcloud ↔ GitLab.
- Serveur de baux externe ou serveur applicatif Sonal.
- Effacement automatique des historiques, clones et sauvegardes.
- Administration des membres, groupes et projets GitLab depuis Sonal.
- Extension implicite des fonctions actuellement refusées en corpus distant.

## 2. Ce que l'expérience V1 apporte au démarrage

**Le fonctionnement GitLab de la V1 a été utilisé par des utilisateurs et
fonctionne, selon le retour du responsable du projet. C'est un acquis réel.**
Il ne faut ni repartir comme si rien n'avait existé, ni refaire une démonstration
générique de faisabilité avant d'utiliser ce retour d'expérience.

### 2.1 Réutiliser les acquis, sans imposer l'architecture V1

| Acquis ou information | Utilité pour la V2 |
|---|---|
| Parcours effectivement utilisés | Recette utilisateur de connexion, ouverture, édition, verrouillage et actualisation. |
| Instances et versions déployées | Réduire la matrice initiale aux environnements réellement utiles. |
| Authentification déjà opérationnelle | Identifier les paramètres OAuth et contraintes institutionnelles. |
| Gestion des verrous vécue par les équipes | Connaître les reprises manuelles, incidents et attentes de simplicité. |
| Médias/LFS, si utilisés dans ces versions | Réutiliser les échanges et fixtures déjà éprouvés, après vérification du périmètre. |

L'absence de banc identifié dans une étude antérieure ne signifie pas absence
d'usage réel. Inversement, « GitLab fonctionne en V1 » ne précise pas à lui seul
quels chemins de médias ou scénarios de crash ont été pratiqués.

### 2.2 Remplacer le prototype exploratoire par une qualification ciblée

Le dépôt V1 confirmé par le responsable est `/home/belignem/Vscode/SonalPi`.
L'utiliser comme source de l'étude, sans modifier ses fichiers ni changer sa
branche de travail. Le checkout observé est `webdav`, commit `f5625df` ; les
branches/tags peuvent être inspectés sans checkout. Identifier si nécessaire
la version réellement distribuée, sans en faire un prérequis à la lecture du dépôt.
Relever ensuite instance, fonctions pratiquées et éventuels incidents connus.

Pour chaque question, classer la preuve :

- **usage confirmé** : scénario pratiqué, environnement identifié ;
- **code inspecté** : comportement retrouvé dans la version concernée ;
- **test reproductible** : scénario automatisé ou procédure rejouable ;
- **à vérifier** : garantie encore inconnue ou différente en V2.

Reprendre les preuves disponibles ; ne retester que ce qui change ou reste
incertain. Le banc initial vise surtout :

1. publication concurrente et gardes de l'API utilisée par la V2 ;
2. ancien détenteur après reprise d'un verrou, y compris même compte sur deux postes ;
3. publication multi-fichiers et dépendances métier ;
4. réponse perdue après une écriture acceptée ;
5. transfert LFS réel si ce parcours n'est pas déjà établi ;
6. coût des renouvellements si la V2 retient un bail versionné.

L'expérience V1 peut donc **réduire le prototype**, pas automatiquement répondre
à des garanties de concurrence nouvelles. Aucun test d'écriture dans un corpus
utilisateur pour compléter ces preuves : projet de qualification séparé.

## 3. Point de départ V2 et invariants

### 3.1 Modules à conserver ou faire évoluer

| Module actuel | Évolution prévue |
|---|---|
| `src/shared/corpus/`, `src/shared/entretien/` | Domaine pur conservé ; transformations et validations réutilisées. |
| `src/main/corpusStore.ts` | Persistance locale conservée ; ne devient pas un client réseau. |
| `src/main/distant/miroir.ts` | Extraire `MiroirDistant` et le lecteur WebDAV, conserver la récupération locale. |
| `src/main/distant/sessions.ts` | Injecter coordination et publication, retirer les providers construits en interne. |
| `src/main/distant/transactions.ts` | Extraire progressivement préparation métier et exécution distante. |
| `src/main/distant/publication.ts` | Création initiale WebDAV existante ; distinguer cette fonction de la publication générale. |
| `src/main/verrous/` | Garder les providers DAV ; adapter le contrat, notamment ses ETags actuellement explicites. |
| `src/main/distant/coffre.ts` | Comptes GitLab et migration compatible des comptes existants. |
| `src/main/index.ts` | Assembler les contextes par fabrique, déléguer les commandes IPC. |
| `src/main/transitionContexte.ts`, `fermetureApplication.ts` | Préserver les refus de fermeture/bascule non sûre. |
| `src/main/docsCadreDistant.ts` | Remplacer la dépendance directe WebDAV par un lecteur de documents. |
| Preload, `src/shared/distant.ts`, renderer distant | Contrats publics communs, capacités et libellés adaptés. |

Aujourd'hui, le miroir sait déjà télécharger les médias désignés ; le main
expose leur téléversement Nextcloud. Ce chantier **ne doit pas supprimer ces
fonctions pour obtenir une fausse parité minimale**.

### 3.2 Invariants non négociables

1. Le miroir tire ; seuls les sessions et opérations autorisées publient.
2. Consulter ne prend pas de verrou et n'arme pas d'autosauvegarde.
3. La base d'une session est lue après acquisition de son droit d'édition.
4. Toute publication utilise les gardes de la base effectivement lue.
5. Une modification locale arrivée pendant une publication reste sale.
6. Les copies sales, dégradées et récupérables sont protégées avant le premier tirage.
7. Publication finale avant libération, ou les deux dans une opération atomique validée.
8. Refus certain, succès confirmé et résultat indéterminé sont distincts.
9. Aucun ancien détenteur ne peut publier après reprise de son droit dans le
   protocole GitLab supporté ; une vérification préalable seule ne suffit pas.
10. Les droits et gardes sont contrôlés dans le main et par les opérations serveur,
    jamais seulement par les boutons de l'interface.
11. Comptes, destinations, événements, sessions et caches sont isolés par contexte.
12. Aucun jeton ou mot de passe conservé ne revient dans les objets publics ou logs.

La V2 existante est une référence de comportement, pas une preuve automatique
de toutes ces garanties. Caractériser séparément Nextcloud A/B ; ne pas attribuer
aux verrous coopératifs DAV les garanties d'un verrou natif appliqué par le serveur.
Une lacune découverte est documentée et corrigée dans un lot identifié, pas
masquée par une simple extraction d'interface.

**Décision utilisateur : préserver le travail local et suspendre l'édition dès
que le droit exclusif ne peut plus être garanti.** Une coupure réseau n'efface
pas le travail et ne permet pas de prolonger indéfiniment un droit périmé.
Figer l'éditeur sans perdre les dernières modifications, conserver un état de
récupération durable, puis réconcilier et revalider le droit avant toute reprise.
Vérifier le comportement réel des composables et les frontières d'autosauvegarde :
pas de promesse d'édition hors ligne illimitée ni de publications différées aveugles.

## 4. Architecture cible : façade simple, contrats séparés

```text
Renderer : commandes Sonal, état public, progression, capacités
                          |
                   Preload / IPC typé
                          |
Main : ContexteCorpusDistant, un contexte par corpus ouvert
       |                   |                    |
  MiroirDistant    SessionsDEntretien    TransactionsCorpus
       |                   |                    |
       +------ CorpusStore / fichiers locaux ----+
       |
       +--- LectureDistante
       +--- PublicationDistante sous droit détenu
       +--- CoordinationDistante
       +--- TransfertMedias / lecture des documents
                          |
              Fabrique de connecteur cohérent
                 /                       \
     Nextcloud : WebDAV + providers    GitLab : REST + LFS
```

Les noms nouveaux sont proposés ; les fixer au premier lot d'extraction.
Une responsabilité séparée ne signifie pas obligatoirement une classe séparée.
Le connecteur peut partager un client, une file et un état entre ses ports.

### 4.1 Façade et contexte

`ContexteCorpusDistant` expose des intentions : actualiser, ouvrir une session,
publier, fermer, exécuter une commande métier, désigner/téléverser un média,
consulter les documents, ouvrir la destination web, terminer le contexte.

La fabrique reçoit destination, accès au coffre, store et services locaux, puis
assemble un ensemble compatible. Ne pas mélanger un droit GitLab et un publieur
WebDAV. Les détails ETag/SHA/LFS restent dans le main.

Les handlers IPC ordinaires parlent à cette façade. Le renderer peut connaître
le fournisseur pour les écrans de connexion et les liens ; il ne doit pas
réimplémenter le protocole avec des `if GitLab` dispersés dans l'éditeur.

Contrôler l'autorisation dans la même commande main que la mutation réduit les
contournements IPC, mais ne rend pas atomique un contrôle réseau suivi d'une
écriture. Le serveur doit encore appliquer les gardes de cette écriture.

### 4.2 Contrats techniques

| Contrat | Responsabilité | À ne pas lui faire promettre |
|---|---|---|
| Lecture | Inventaire complet, version observée, texte/binaire borné, instantané si disponible. | Un instantané global WebDAV qui n'existe pas. |
| Publication | Exécuter un plan avec préconditions, droit détenu et résultat réconciliable. | Atomicité multi-fichiers universelle. |
| Coordination | Acquisition, observation, renouvellement, reprise et libération. | Qu'un simple `etat()` autorise une écriture ultérieure. |
| Médias | Envoi/récupération streamés, progression, annulation, validation du contenu. | Qu'un upload LFS et un commit constituent une transaction unique. |
| Navigation/documents | Inventaire, aperçu borné, copie téléchargée, URL web sûre. | Une primitive réseau arbitraire accessible au renderer. |

Schéma de contrat interne, à préciser après qualification :

```ts
interface PublicationDistante {
  publierSousDroit(demande: {
    operationId: string
    plan: PlanPublication
    droits: DroitsEdition
  }): Promise<ResultatPublication>
}
```

`DroitsEdition` est une poignée opaque, propre au contexte et au connecteur.
Elle n'est ni un booléen public ni la preuve suffisante d'une autorisation
serveur. Le connecteur doit lier l'écriture à la génération détenue selon son
protocole. Les sessions n'assemblent pas elles-mêmes les actions GitLab.

### 4.3 Opérations métier et exécuteurs

Un plan décrit les sources lues, versions attendues, créations/modifications/
suppressions, invariants à maintenir, et l'indivisibilité de l'opération.
Les données candidates doivent rester disponibles pour une reprise après crash.

- GitLab : commit atomique lorsque l'opération tient dans les limites validées.
- WebDAV : séquence et compensations existantes, sans prétendre les rendre atomiques.
- Lot métier partiellement applicable : conserver le bilan par entretien lorsque
  c'est le contrat actuel ; ne pas transformer tous les lots en transaction globale.

Ne pas convertir tous les callbacks de `TransactionsCorpus` en une fois.
Commencer par création/import/suppression, puis les opérations liées.
Les mutations pures restent dans `shared/`, sans transport ni I/O.

## 5. Miroir distant commun et compatibilité locale

### 5.1 Ce qui devient commun

- Dossier local géré par Sonal, indépendant d'un client de synchronisation externe.
- Calcul des contenus à télécharger et des vraies disparitions.
- Protection des chemins en session et des copies récupérables.
- Préparation/validation des téléchargements avant installation.
- Corbeille locale, manifeste et progression.
- Découverte des médias désignés par les entretiens et cache local de lecture.

Le miroir n'est pas un clone Git. Aucun `.git`, index ou historique complet n'est
nécessaire sur le poste. `CorpusStore` continue de lire/écrire un dossier local.

### 5.2 Ce qui reste spécialisé

| Notion | WebDAV | GitLab |
|---|---|---|
| Inventaire | PROPFIND. | Arbre paginé à un commit fixé. |
| Empreinte pour éviter un téléchargement | ETag observé. | Identifiant du blob ; OID pour le contenu LFS. |
| Garde d'écriture | ETag correspondant au contenu lu. | Garde API du fichier, notamment `last_commit_id`, à qualifier. |
| Instantané global | Non garanti par le protocole courant. | SHA du commit résolu depuis la branche. |
| Média | Fichier binaire WebDAV. | Binaire ordinaire ou pointeur résolu vers un objet LFS. |

Ces notions ont des types distincts. Un `blob_id` n'est pas une garde d'écriture ;
un SHA de branche ne remplace pas arbitrairement une version de fichier.
La lecture du contenu et de sa garde doit correspondre au même état observé.

### 5.3 Tirage GitLab

1. Identifier les sessions/journaux récupérables avant tout téléchargement installé.
2. Résoudre la branche choisie vers un commit `S`.
3. Inventorier toutes les pages et lire les contenus nécessaires avec `ref=S`.
4. Ne sélectionner que les fichiers métier attendus, pas tous les JSON du dépôt.
5. Préparer les changements en zone temporaire, valider format, chemins et
   membership ; une erreur n'amorce jamais un corpus vide.
6. Installer sans écraser les fichiers exclus ni avancer leur base de session.
7. Déplacer les disparitions confirmées en corbeille locale.
8. Mettre à jour le manifeste selon ce qui a effectivement été installé.
9. Télécharger les médias désignés modifiés ; un échec média n'empêche pas de
   consulter le texte et reste visible comme indisponibilité réessayable.

Une installation locale multi-fichiers doit être reprenable : préparer un état
cohérent ne suffit pas si un crash au milieu des renommages laisse un miroir
incohérent. Utiliser un journal d'installation ou un mécanisme équivalent testé.

Refuser symlinks, sous-modules, sorties de racine et collisions de noms Windows.
Pagination inachevée, 403, 404 ambigu ou timeout ne prouvent jamais une suppression.
Un ancien format exigeant une mutation nécessite une migration explicite ; pas
un commit caché à l'ouverture avec un compte lecteur.

### 5.4 Manifeste, sessions et comptes existants

Versionner le manifeste avec le fournisseur et l'identité de destination.
Lire les anciens manifestes DAV et préserver leurs chemins/IDs ; une reconstruction
ne peut supprimer ni sessions, ni copies sales, ni associations audio locales.

Distinguer logiquement : base de session, version de travail, candidat envoyé,
distant observé et journal. Pas besoin de trois copies de chaque fichier inchangé,
ni de migrer tout le stockage local vers une base SQL.

Les médias restent téléchargés sur disque avant lecture ; « transfert streamé »
signifie mémoire bornée pendant le téléchargement, pas lecture directe distante.
Le protocole local `sonal-media` et les formes d'onde locales sont conservés.

## 6. GitLab : exclusion et publication à qualifier en premier

### 6.1 Niveau de garantie visé

Pour les clients Sonal compatibles : un seul détenteur, identification par
utilisateur stable + poste + session, reprise contrôlée après incident, et
refus d'une publication d'un ancien détenteur après reprise.

Les utilisateurs ayant accès en écriture au dépôt peuvent modifier directement
les fichiers dans GitLab ou avec Git. Les gardes de contenu doivent détecter
les changements concernés ; les verrous Sonal ne deviennent pas pour autant
des permissions serveur générales. Pas de garantie absolue contre un
administrateur réécrivant l'historique ou contournant le protocole.

Prérequis d'exploitation : branche sans force-push, clients compatibles et projet
de données sans CI intempestive. **Décision utilisateur : modifier les contenus
partagés via Sonal uniquement.** GitLab reste utilisable pour gérer les accès et
consulter l'historique ; les écritures directes dans les fichiers du corpus sont
hors du parcours supporté. Cette consigne n'est pas une permission serveur :
conserver les gardes et tests de modification extérieure pour ne pas écraser
silencieusement un changement accidentel.
Un protocole de collaboration versionné doit permettre de refuser un writer
incompatible sans imposer un nouveau format métier aux corpus locaux.

### 6.2 Options à départager, sans construire deux systèmes complets

**D'abord qualifier le mécanisme V1 effectivement utilisé**, notamment les LFS
Locks si c'est celui de la version distribuée. Tester son rapport aux commits
REST, la reprise et l'identité multi-postes. Si une garantie manque, ne pas
confondre limitation du protocole et absence de valeur du fonctionnement V1.

**Candidat de repli concret : baux versionnés sur la branche du corpus.**

- Acquisition par création exclusive d'un fichier de verrou.
- Renouvellement et reprise par mutation conditionnelle de la version observée.
- Identifiant de session aléatoire et génération distincte après reprise.
- Publication des données **et mutation conditionnelle réelle du verrou** dans
  le même commit ; nonce/compteur pour éviter une action sans changement.
- Publication et renouvellement sérialisés côté client.
- Libération conditionnelle ; fermeture publiant et libérant atomiquement si validé.
- Contrôle de toutes les générations requises pour une opération multi-verrous.

Le TTL autorise une procédure de reprise ; ce n'est pas un minuteur serveur qui
invalide magiquement les commits REST. Le client cesse de publier s'il ne peut
plus justifier son bail ; la mutation conditionnelle empêche l'ancien détenteur
de publier après reprise. Tester veille, horloges décalées et requêtes retardées.

Les verrous doivent être sur la même branche que les contenus si l'on dépend
d'une mutation atomique verrou + données. Une branche de verrous séparée ne
préserve pas cette propriété. Les LFS Locks destinés à l'exclusion et les objets
LFS destinés aux médias sont deux mécanismes distincts.

### 6.3 Coût et décision de protocole

Un renouvellement toutes les 60 secondes produit environ 480 commits sur huit
heures par session, avant publications et prises/libérations. Mesurer : volume,
latence, historique, pipelines, limites de débit et contention entre entretiens.
Les 60 secondes existantes sont un point de comparaison, pas un choix définitif
à masquer par un TTL très long.

Décider et documenter un seul protocole initial par environnement supporté.
Critères : sûreté des courses, reprise compréhensible, coût acceptable pour
l'institution et complexité maîtrisée. Les seuils de latence/volume sont convenus
sur des tailles représentatives avant de conclure au succès du banc.

**Si aucune option ne satisfait ces critères : suspendre l'édition GitLab et
revenir à un arbitrage utilisateur.** Ne pas ajouter discrètement un serveur,
passer à l'édition optimiste ou annoncer la consultation comme support terminé.

## 7. Publications métier, dépendances et reprise

### 7.1 Commit conditionnel

Utiliser l'API Commits pour les opérations groupées :

- `create` doit refuser un chemin existant ;
- update/delete/move emploient les gardes dont la sémantique a été vérifiée ;
- ajout/import : entretien et membership dans la même publication ;
- suppression : retrait du membership et archivage prévu dans la même publication ;
- mutations liées : ensemble cohérent dans un commit si sa taille le permet.

Ne pas recopier deux PUT WebDAV en deux commits GitLab. Un lot indivisible trop
gros est refusé avant envoi ; pas de découpage laissant un corpus incomplet.
`start_sha` n'est pas un CAS de tête de branche ; `force` n'est jamais un remède
à une concurrence. Distinguer absence réelle de changement et refus serveur.

### 7.2 Sources lues mais non écrites

Une garde sur l'entretien ne protège pas une définition du corpus dont dépend
sa modification. Pour chaque commande, consigner :

- fichiers lus et écrits ;
- verrous nécessaires et ordre d'acquisition ;
- sources à relire après acquisition ;
- gardes contrôlées au commit ;
- comportement face à un éditeur extérieur au protocole.

Ordre canonique pour plusieurs verrous : corpus puis entretiens triés. Éviter
l'inversion lorsqu'une session possède déjà un entretien ; prévoir une reprise
ordonnée ou un refus, pas une attente circulaire. Réutiliser proprement les
droits des sessions, publier leurs changements si nécessaire, ne pas les écraser
par une transaction courte.

Pour des sources non écrites, la protection peut s'appuyer sur leurs verrous
coopératifs si **tous** les writers concernés participent et si leur génération
est liée au commit. Qualifier les interactions des longues sessions avec les
modifications de définitions. Une relecture préalable seule n'apporte pas
l'isolation recherchée. Toute sérialisation globale additionnelle doit être
justifiée et mesurée, pas ajoutée à chaque publication par facilité.

Les éditions externes de sources non écrites peuvent sortir de ces garanties :
le rapport doit préciser cette limite, voire restreindre les commandes concernées.
Le banc GitLab 18.11 confirme toutefois une option bornée : inclure une action
update qui renvoie le contenu inchangé de la source avec son `last_commit_id`.
Une garde périmée refuse alors atomiquement la cible. Cette source entre de fait
dans les actions du commit ; évaluer coût, taille et verrous avant généralisation.

### 7.3 Journal durable et résultat indéterminé

Avant envoi, conserver : identifiant d'opération, destination, base, chemins,
empreintes et candidat récupérable, état et éventuel identifiant de commit.
Pas de secret, de transcription dans les messages de commit ou de copie sensible
supplémentaire inutile dans les logs.

Résultats :

- **confirmé** : preuve de publication, versions retournées, révision locale
  envoyée confirmée sans déclarer propres les modifications plus récentes ;
- **refusé** : conflit/droits/format établi, aucun succès supposé ;
- **indéterminé** : requête possiblement acceptée, enquête et candidat conservés.

Après réponse perdue, rechercher l'opération grâce à son identifiant non sensible
et vérifier le contenu au commit correspondant. La tête actuelle peut avoir
avancé ; sa seule égalité/inégalité ne prouve pas l'histoire de la requête.
Recherche bornée ; si aucune conclusion sûre, rester indéterminé.

Ne pas rejouer aveuglément un POST, import ou suppression. Un retry de contention
n'est autorisé qu'après réconciliation et revalidation des bases/droits concernés.
Conflit : copie locale conservée, parcours de divergence existant réutilisé,
pas de fusion textuelle automatique.

### 7.4 Fermeture et redémarrage

- Vider l'autosauvegarde renderer avant fermeture normale.
- Publier le dernier candidat puis libérer le droit ; sérialiser avec les battements.
- Une publication/libération non résolue bloque la bascule normale.
- Une fermeture forcée ou un crash laisse un état durable, jamais « publié » par défaut.
- À la réouverture, protéger les copies avant tirage, réconcilier les opérations,
  puis obtenir un nouveau droit ; ne pas hériter du verrou du lancement précédent.
- Changement d'histoire Git, branche recréée ou garde incohérente : suspension,
  conservation des copies et revalidation explicite.

## 8. Médias communs : WebDAV et LFS derrière les mêmes actions

### 8.1 Parcours utilisateur

Conserver les trois actions :

1. **Associer un média local** : référence propre au poste, jamais téléversée.
2. **Choisir un média partagé** : désignation relative à la racine du corpus.
3. **Partager un média** : transfert puis désignation, avec progression et bilan.

Le média reste facultatif pour consulter les transcriptions. Un téléchargement
échoué n'efface ni le texte ni une association locale existante. Ne pas copier
un chemin absolu de poste dans le partage pour remplacer l'association locale.

`audioDistant.chemin`, `audio-locaux.json`, le lecteur et les formes d'onde sont
réutilisés autant que possible. Auditer `audioRef` lors des exports : des chemins
historiques peuvent eux-mêmes contenir des informations nominatives.

### 8.2 Pipeline LFS cible

Pas de faux support LFS reposant seulement sur `.gitattributes`.
Pour un nouveau média :

1. Vérifier destination, droits, limites connues et nom non conflictuel.
2. Calculer en flux SHA-256 et taille ; garantir que le fichier source ne change
   pas entre empreinte et transfert, par instantané temporaire ou contrôle sûr.
3. Appeler le mécanisme LFS batch upload validé sur l'instance.
4. Téléverser l'objet selon les actions autorisées ; effectuer la vérification
   demandée par le serveur, si présente.
5. Publier conditionnellement le pointeur LFS, avec une règle `.gitattributes`
   adaptée si nécessaire ; préserver les règles déjà présentes dans le projet.
6. Désigner le média dans l'entretien sous droit d'édition. Si pointeur et
   désignation sont une même opération indivisible, les publier ensemble ; si
   l'UX les sépare, conserver explicitement l'état « téléversé, non associé ».
7. Confirmer puis mettre à jour le cache local.

Le commit du pointeur ne prouve pas à lui seul que GitLab a associé correctement
l'objet LFS au projet. Qualifier **tout le parcours sans push Git**, y compris
lecture depuis un second compte et effet sur quotas/protection des objets.

À la lecture : parser strictement le pointeur, obtenir l'objet via le mécanisme
validé, télécharger en temporaire, vérifier taille et empreinte puis renommer.
Ne jamais donner le pointeur texte au lecteur audio. Les binaires ordinaires
déjà présents restent lisibles dans les limites validées.

### 8.3 Incidents et sécurité des transferts

- Streams sur disque, mémoire bornée, contrôle d'espace libre, annulation et délais.
- Reprise à documenter : au minimum nouvelle tentative sûre ; reprise partielle
  seulement si le serveur/protocole la supporte réellement.
- Upload objet réussi puis commit refusé : garder le journal, ne pas annoncer
  le média partagé ; réutiliser l'objet si possible sans doublon logique.
- Objet orphelin : nettoyage selon la politique GitLab/institutionnelle, jamais
  suppression automatique d'un objet possiblement référencé ailleurs.
- Erreurs distinctes pour quota, LFS désactivé, accès interdit, objet absent,
  réseau ou empreinte invalide.
- Les URL/actions LFS peuvent viser un stockage objet : contrôler HTTPS, origine,
  redirections et en-têtes. Aucun transfert automatique du jeton GitLab vers
  une autre origine ; aucune URL signée sensible dans les logs ou le renderer.
- Définir une politique d'éviction du cache qui ne touche pas aux médias locaux
  associés ni aux candidats en cours de transfert.

La détection des capacités doit être informative autant que possible. Une sonde
d'écriture utilise seulement une destination de test explicitement autorisée,
jamais des commits ou objets cachés à l'ouverture d'un corpus utilisateur.

### 8.4 Détection des capacités du projet et information utilisateur

Après sélection du projet, à la création comme à l'ouverture, vérifier sans
écriture cachée la configuration LFS accessible et les droits connus du compte.
Ne pas confondre trois résultats : disponible selon les informations obtenues,
indisponible avec raison établie, ou vérification impossible/incomplète.

- LFS activé et droits compatibles : annoncer le partage média possible sous
  réserve des quotas et du succès des transferts réels.
- LFS désactivé : expliquer que son activation sur le projet est nécessaire
  pour le parcours de partage LFS ; transcriptions et médias locaux restent utilisables.
- Vérification impossible : ne pas annoncer LFS désactivé ni effacer une
  désignation existante ; afficher l'incertitude et permettre une nouvelle vérification.
- Distinguer la capacité de lire les médias partagés de celle d'en ajouter.
- Proposer « Vérifier à nouveau » après intervention de l'administrateur ;
  réévaluer aussi après un refus serveur significatif.

Une propriété LFS activée ne prouve ni un quota disponible ni un stockage objet
fonctionnel. Chaque transfert applique encore les contrôles réels ; aucun fichier
de test n'est envoyé silencieusement dans le projet utilisateur.
Si le protocole d'exclusion finalement retenu dépend lui-même de LFS Locks,
qualifier cette dépendance séparément : le repli sans LFS sur les seuls médias
ne peut pas à lui seul garantir que l'édition exclusive restera disponible.

## 9. Comptes, permissions, interface et documents

### 9.1 Destinations et coffre

Union discriminée `webdav | gitlab`, sans secret dans les objets publics.
GitLab : URL canonique d'instance, ID numérique de projet, branche mémorisée,
racine relative, nom de projet pour affichage et référence de compte.

- Branche par défaut suggérée, jamais `main` imposé ; ne pas suivre silencieusement
  un changement de branche par défaut.
- ID du miroir : fournisseur + instance avec sous-chemin + destination + compte.
- Renouveler le jeton ne crée pas de nouveau miroir ; deux comptes/branches/racines
  ne partagent pas de cache.
- Ancien coffre v2 sans discriminant : WebDAV ; préserver IDs, secrets et récents.
- Migration atomique, sauvegardée, idempotente et testée après interruption.
- Sans trousseau sûr : secrets en mémoire, pas de persistance en clair.
- Oublier un compte ne supprime pas silencieusement un travail local récupérable.

### 9.2 Authentification et sécurité

PAT pour qualification et préversion. OAuth PKCE S256 avec navigateur système
pour la livraison destinée aux non-techniciens : `state`, callback loopback borné,
port occupé, annulation, renouvellement sérialisé et rotation des jetons.
Réutiliser la connaissance de l'enregistrement OAuth V1 sans importer ses secrets.

Documenter les scopes par endpoint ; les commits REST requièrent des droits
API adaptés, `write_repository` n'est pas une substitution automatique.
Qualifier aussi l'authentification LFS avec le mode OAuth retenu.

TLS vérifié ; certificats institutionnels par confiance explicite, jamais par
désactivation globale. Refuser identifiants dans les URL, chemins ambigus,
traversals et redirections non prévues. Les erreurs et diagnostics sont expurgés.
Tester sous-groupes, accents, espaces, branches avec `/` et instance sous-chemin.

### 9.3 Capacités publiques et états

Distinguer disponibilité technique, droits effectifs et état courant de session.
Le rôle GitLab seul ne prouve pas un droit de push sur une branche protégée.
Recontrôler chaque refus serveur après révocation, archivage ou changement de rôle.

L'interface distingue : enregistré localement, publication en cours, partagé,
résultat à vérifier, lecture seule, droit perdu et média indisponible.
Le hors-ligne n'est pas synonyme de manque de permission.

Les éventuelles restrictions fonctionnelles V1 d'ajout/suppression sont à
inventorier avant migration d'équipes. Une règle dans un JSON n'est pas une
permission serveur opposable à un utilisateur qui peut modifier directement le dépôt.

### 9.4 Docs cadre et navigation

Extraire lecture et navigation de `docsCadreDistant.ts`. Conserver lecture seule,
aperçus bornés, validation des signatures et téléchargement d'une copie.
Ne pas aspirer les documents dans le miroir des entretiens.

Remplacer la commande spécifique `ouvrirDansNextcloud` par une intention
`ouvrirSurServeur`, avec URL construite côté main sans secret. Un dossier absent
peut être vide ; un 404 de projet privé ne doit pas être assimilé à un dossier vide.

## 10. Anonymisation et changement de destination

La stratégie retenue est **une copie anonymisée destinée au partage**, pas une
promesse de purge technique de l'historique distant.

- Avertir avant publication de données sensibles : anonymiser/supprimer l'état
  courant n'efface ni versions Nextcloud ni commits GitLab.
- Produire un export explicite des contenus autorisés, pas une copie récursive
  du miroir et de ses fichiers techniques.
- Vérifier que l'export retire réellement les données masquées : une règle
  d'affichage ou une pseudonymisation réversible ne suffit pas à nettoyer le JSON.
- Exclure sessions, corbeilles, bases, journaux, caches, tables de correspondance
  nominatives et chemins locaux sensibles selon la politique d'export.
- Contrôler titres, noms de fichiers, métadonnées, notes, documents et médias.
  Anonymiser une transcription ne transforme ni la voix ni l'image.
- GitLab : **nouveau projet/dépôt sans historique importé**, pas une branche ou
  un sous-dossier du projet source. Nextcloud : nouveau corpus constitué de
  contenus nettoyés, sans copier ses versions historiques.
- Choisir explicitement destination et accès ; présenter un bilan avant envoi.
- L'ancien corpus demeure soumis à la politique de conservation/suppression de
  l'institution, sauvegardes comprises. Aucune suppression automatique du source.

Un assistant dédié peut être réalisé dans un lot séparé réutilisant création
et export. En revanche, avertissement et procédure vérifiable sont nécessaires
avant usage réel ; ne pas annoncer une fonction « copie anonymisée sûre » tant
que les contenus exportés n'ont pas été testés. Ce mécanisme n'est pas une
certification juridique d'anonymat.

## 11. Lots de réalisation et critères de sortie

Chaque lot doit être relisible et testable séparément. Les chemins nouveaux sont
proposés ; conserver les noms existants tant qu'un renommage n'apporte rien.

### Avancement de la première itération

Rapport détaillé : [qualification GitLab et état du chantier](../../docs/dev/gitlab.md).

- [x] Lire la V1 à des références locales identifiées, sans changer son checkout.
- [x] Comparer client GitLab, OAuth et ouverture de `v1.0.78` à `origin/main` local.
- [x] Rejouer la sélection de caractérisation V2 : 222 tests initiaux réussis.
- [x] Ajouter dix cas miroir/renderer ; première sélection : 232 tests réussis.
- [x] Corriger la suspension oubliée après échec d'un tirage manuel, test rouge puis vert.
- [x] Borner le droit après échec de renouvellement et refuser une publication expirée ; sélection : 235 tests réussis.
- [x] Préserver l'état encore en debounce après rétrogradation, sans le rendre publiable ; sélection étendue : 241 tests réussis.
- [x] Protéger la reprise avant le premier tirage par journal local et observation des anciens verrous ; sélection : 243 tests réussis.
- [x] Recenser les écarts de sûreté et les couplages à extraire dans le rapport.
- [x] Introduire la première façade de contexte et sa couture d'ouverture ; sélection : 245 tests réussis.
- [x] Extraire le premier contrat de lecture et injecter le lecteur WebDAV ; sélection : 247 tests réussis.
- [x] Séparer l'observation des verrous et migrer le manifeste vers un format discriminé v2 ; sélection : 251 tests réussis.
- [x] Rendre l'installation locale reprenable par journal et préparation complète ; sélection : 254 tests réussis.
- [x] Extraire les transferts binaires et injecter l'adaptateur WebDAV sans changer les parcours média ; sélection : 254 tests réussis.
- [x] Valider la vue métier préparée avant toute installation dans le miroir ; sélection : 258 tests réussis.
- [x] Capturer la génération du contexte pour les premières intentions asynchrones de la façade ; sélection : 261 tests réussis.
- [x] Étendre cette capture aux sessions, transactions principales et documents ; sélection : 263 tests réussis.
- [x] Préparer le client et le lecteur GitLab à SHA fixé ; 10 tests unitaires réussis.
- [x] Retirer la construction WebDAV du miroir commun et assembler un premier contexte GitLab en consultation seule ; 1 test d'intégration réussi.
- [x] Migrer le coffre vers des comptes et destinations GitLab discriminés sans changer les identifiants WebDAV ; 3 tests réussis.
- [x] Exposer une préversion de consultation GitLab par PAT, projet, branche et racine ; typecheck, build et sélection de 84 tests réussis.
- [x] Redémarrer sans téléchargement le banc GitLab Docker existant et isoler deux projets LFS actif/inactif.
- [x] Qualifier create, atomicité multi-actions, gardes update/delete/move et interaction LFS Locks/commits REST sur GitLab 18.11.
- [x] Valider le transfert LFS binaire sans push Git, du batch upload à la lecture vérifiée par le second compte.
- [x] Valider qu'un bail versionné bloque atomiquement une ancienne génération, y compris avec deux postes sous le même compte.
- [x] Réconcilier par identifiant un commit accepté dont la réponse réseau est perdue.
- [x] Mesurer une première série de renouvellements et leur course sur une même garde.
- [x] Protéger une source métier lue par une action conditionnelle inchangée dans le commit.
- [ ] Compléter les interactions avec sessions longues, la mesure longue durée/CI et les transferts LFS volumineux, annulés ou refusés par quota.

Le typecheck est de nouveau passant dans l'installation locale courante.
Ni L0 ni L1 ne sont déclarés terminés : les preuves serveur, l'isolation de la
coordination et les autres extractions restent à faire. Le prochain travail
borné est de tester le parcours de consultation dans Electron à deux profils,
puis d'ajouter la découverte bornée des projets et branches avant le pilote.

### L0 — Capitalisation V1 et qualification GitLab ciblée

**Entrées :** version V1 distribuée, instance cible, projet de test autorisé,
comptes et volumes représentatifs. Ne pas attendre ces accès pour préparer les
tests locaux, mais ne pas annoncer une validation réelle sans eux.

**Livrables :** `docs/dev/gitlab.md`, client/banc isolé sous `test/gitlab/`, matrice
preuves V1 / garanties V2 / vérifications restantes.

- Relever les parcours V1 effectivement utilisés, notamment verrous et médias.
- Rejouer les scénarios déjà connus plutôt que réinventer leur protocole.
- Qualifier commits conditionnels, atomicité, anciennes générations, multi-postes,
  sources non écrites, réponse perdue et historique réécrit.
- Qualifier le chemin LFS complet, les scopes et les contraintes de l'instance.
- Mesurer le candidat de bail si nécessaire ; tester CI/quotas/latences.
- Choisir le protocole d'exclusion et fixer les limites de support.

**Sortie :** décision argumentée et reproductible. Si blocage, pas de lancement
de l'écriture GitLab dans l'éditeur. La qualification LFS peut continuer en
parallèle, mais doit être positive avant de promettre la livraison complète.

### L1 — Caractérisation Nextcloud et façade de contexte

**Fichiers :** `src/main/index.ts`, `distant/sessions.ts`, `transactions.ts`,
`transitionContexte.ts`, `fermetureApplication.ts`, nouveaux contexte/fabrique.

- Figer par tests lecture pure, sessions, publication, refus de fermeture,
  autosave concurrente, orphelins, transactions et transferts existants.
- Introduire la façade sans changer initialement les algorithmes DAV.
- Capturer explicitement contexte et génération dans les commandes/événements
  asynchrones ; ignorer les résultats d'un contexte remplacé.
- Inventorier tous les handlers de mutation et leurs gardes.
- Décrire les écarts entre documentation et comportement observé, notamment hors-ligne.

**Sortie :** Nextcloud localement inchangé, aucun bouton GitLab ; migrations
structurelles petites et non-régression A/B documentée.

### L2 — Miroir commun et comptes compatibles

**Fichiers :** `distant/miroir.ts`, nouveaux contrats et lecteur WebDAV,
`distant/coffre.ts`, `shared/distant.ts`, récents et preload.

- Extraire lecture distante et versions distinctes.
- Injecter le lecteur dans le miroir ; isoler l'inventaire des verrous de celui
  des contenus, conserver la présence existante.
- Ajouter installation reprenable et tests de protection des copies avant tirage.
- Versionner le manifeste avec lecture rétrocompatible.
- Ajouter destinations discriminées et migration du coffre sans changer les IDs DAV.
- Extraire le transfert WebDAV sans perdre téléversement ni rapatriement sélectif.

**Sortie :** anciens corpus/comptes/miroirs réouvrables ; cache et travail local
non confondus ; aucune garantie WebDAV inventée dans les contrats.

### L3 — Consultation GitLab de bout en bout

**Fichiers :** nouveaux `src/main/gitlab/{client,lecture,types}.ts`, fabrique,
écrans d'ouverture, coffre, miroir et tests `test/gitlab/`.

- Client injectable : pagination, encodage, délais, annulation, erreurs, 429 et
  retries de lecture bornés ; pas de retry générique des mutations.
- PAT, sélection projet/branche/racine, droits et accès en lecture seule.
- Tirage à SHA fixé, validation des fichiers, récents et navigation serveur.
- Compte lecteur : aucune migration/sonde/verrou/écriture cachée.
- Bascule local ↔ Nextcloud ↔ GitLab avec isolation des caches et événements.

**Sortie :** consultation/actualisation à deux postes ; préversion explicitement
sans édition. Le client de qualification est réutilisé ou remplacé proprement,
pas conservé comme deuxième implémentation concurrente de l'API.

### L4 — Une session GitLab complète et sa récupération

**Dépendances :** protocole d'exclusion accepté en L0, L1–L3 validés.
**Fichiers :** connecteur coordination/publication GitLab, sessions, journal,
états publics, dialogues de reprise/divergence.

- Remplacer les constructions directes de providers par injection cohérente.
- Acquérir, relire, autosauvegarder, publier sous droit, renouveler, fermer.
- Préserver révisions monotones et sérialisation par entretien.
- Journaliser et réconcilier les résultats indéterminés.
- Crash, veille, réseau, jeton expiré, verrou repris, même compte sur deux postes.
- Réutiliser le parcours de divergence sans merge textuel automatique.

**Sortie :** un éditeur par entretien, deux entretiens indépendants éditables,
ancien détenteur refusé après reprise, aucun travail silencieusement perdu.
C'est la première tranche verticale d'écriture, pas la parité de toutes les commandes.

### L5 — Transactions et création de corpus GitLab

**Fichiers :** `distant/transactions.ts`, plans métier/exécuteurs,
création distante, handlers de mutation.

- Création dans une racine libre d'un projet existant ; gérer explicitement
  projet vide et première branche si autorisés, sans les confondre avec un 404 d'accès.
- Aucun dossier vide factice ni modification des fichiers étrangers au corpus.
- Ajout/import/suppression, définitions, personnes, liens, anonymisation et lots.
- Dépendances lues, ordre des verrous, interactions avec sessions ouvertes.
- Respect de l'indivisibilité ou du succès partiel selon la commande.
- Limites de taille/actions, no-op, reprise après commit accepté et réponse perdue.
- Audit final des mutations IPC : pas de retour accidentel au store local sans garde.

**Sortie :** opérations distantes supportées cohérentes ; pas de membership partiel,
de deadlock reproductible ni de découpage silencieux d'une transaction indivisible.

### L6 — Médias partagés GitLab/LFS et Docs cadre

**Dépendances :** LFS qualifié en L0 ; L4/L5 pour les désignations et publications.
**Fichiers :** nouveau `src/main/gitlab/lfs.ts`, contrats média,
`DesignationAudioDistante.vue`, lecteur, `docsCadreDistant.ts`, preload et main.

- Implémenter le pipeline complet objet/pointeur/désignation.
- Détecter les capacités à la création/ouverture et à la demande ; tester LFS
  activé, désactivé et indéterminé, ainsi que lecteur sans droit de téléversement.
- Gérer `.gitattributes` conditionnellement sans altérer les règles existantes.
- Choisir un média partagé, téléverser, récupérer et lire depuis un deuxième poste.
- Vérifier empreintes, mémoire bornée, annulation, quotas et erreurs partielles.
- Conserver média local et parcours Nextcloud ; vocabulaire utilisateur commun.
- Extraire Docs cadre et lien serveur générique.

**Sortie :** mêmes trois actions média avec les deux fournisseurs ; test avec
fichiers représentatifs audio/vidéo et accès du second compte. Pas de faux
support consistant à lire un pointeur ou à réussir seulement sur le poste émetteur.

### L7 — OAuth, permissions et interface de diffusion

**Fichiers :** nouveau `src/main/gitlab/oauth.ts`, coffre, connexion,
composables distants, messages et documentation d'instance.

- Connexion navigateur PKCE, configuration institutionnelle, PAT avancé si utile.
- Renouvellement sérialisé, révocation, droits retirés en session, scopes LFS.
- États publics distinguant local/partagé/résultat incertain et hors-ligne/interdit.
- Explication des capacités secondaires, notamment présence, sans affaiblir Nextcloud.
- Suppression des libellés Nextcloud hors écran spécifique au fournisseur.
- Décision sur les restrictions fonctionnelles utilisées par les équipes V1.

**Sortie :** parcours non technicien testé dans l'application empaquetée ; absence
de secrets dans logs, IPC publics et liens ; réauthentification sans perte du travail.

### L8 — Validation institutionnelle, documentation et diffusion

**Livrables :** `docs/user/corpus-gitlab.md`, guide distant commun actualisé,
architecture, procédure de qualification et fiche des versions supportées.

- Recette avec parcours V1 connus et scénarios V2 à deux postes.
- Bancs Nextcloud A/B, corpus locaux et bascules multicontextes.
- Mesures représentatives : tailles JSON/médias, sessions, durée de journée,
  commits techniques, bande passante, disque, mémoire et limites serveur.
- Politique d'accès, historique, sauvegarde/restauration et données sensibles.
- Avertissement/procédure de nouvelle destination après export anonymisé vérifié.
- Bilan précis livré/reporté, sans déclarer parité média avant validation L6.

**Sortie :** pilote accepté par l'institution puis diffusion ; les skips ou
validations uniquement simulées restent visibles dans le bilan.

### Lots complémentaires, hors chemin critique du connecteur

**Migration V1 → V2** : si des équipes souhaitent migrer, sélectionner un commit
source, rapatrier `.crp`/`.sonal` et vrais objets LFS, réutiliser l'import V2,
vérifier anonymisation et médias, publier vers une nouvelle destination.
Aucun fonctionnement mixte V1/V2 sur les mêmes fichiers ni import automatique
des anciens jetons. La migration devient un prérequis
pour la diffusion à ces équipes, pas pour qualifier le connecteur V2.

**Assistant de copie anonymisée** : préparation d'un export nettoyé et bilan,
création d'une destination neuve, aucune copie de l'historique ni purge du source.
Réutiliser les fonctions d'export validées, ne pas inventer une anonymisation
irréversible à partir d'un simple changement de dossier.

### Ordonnancement

- L0 et L1 peuvent commencer ensemble ; premiers relevés V1 avant les essais réseau.
- L2 → L3, sans attendre que tous les sujets LFS soient résolus.
- L4 exige la sortie positive de qualification concurrence ; L5 suit L4.
- Le travail technique LFS peut avancer en parallèle ; l'intégration L6 utilise
  les publications et sessions stabilisées.
- OAuth peut être préparé après L3 ; la recette finale L8 exige L4 à L7.
- Pas d'estimation calendaire ferme avant L0/L1 : recalibrer après protocole
  retenu et inventaire des couplages, plutôt qu'engager une refonte indéfinie.

## 12. Stratégie de tests et matrice de recette

### 12.1 Niveaux de validation

1. **Unitaires purs** : chemins, destinations, capacités, plans métier, versions,
   états de session, migrations du coffre/manifeste, reprises de journal.
2. **Contrats en mémoire** : mêmes comportements attendus par le miroir et les
   sessions, mais différences d'atomicité explicites entre connecteurs.
3. **Faux HTTP GitLab/LFS** : pagination, délais, 429, réponses perdues, upload
   partiel, URL signée expirée et redirections ; pas une preuve des gardes réelles.
4. **GitLab réel opt-in** : instance Docker dédiée si les ressources le permettent,
   deux projets LFS activé/désactivé, données synthétiques, deux comptes et deux
   postes logiques. Version serveur consignée ; aucune suppression automatique.
   Compléter par une qualification sur l'instance institutionnelle avant le pilote.
5. **Nextcloud réel A/B** : images et volumes existants uniquement ; démarrage
   avec `npm run nc:up` / `npm run nc-b:up`, aucun pull ni reprovisionnement.
6. **E2E Electron et application empaquetée** : profils isolés, sessions,
   changements de corpus, crash, OAuth et lecture audio/vidéo.

### 12.2 Scénarios indispensables

| Scénario | Résultat attendu |
|---|---|
| Deux acquisitions simultanées d'un entretien | Un seul éditeur, autre poste en consultation. |
| Même utilisateur sur deux machines | Pas d'assimilation des deux sessions au même détenteur. |
| Deux entretiens différents | Publications aboutissent sans écrasement ni contention non bornée. |
| Reprise puis retour de l'ancien détenteur | Publication et libération de l'ancienne génération refusées. |
| Veille, horloge décalée, requête ancienne retardée | Droit non hérité, copie locale conservée, aucune reprise aveugle. |
| Modification directe dans GitLab | Garde périmée détectée sur les fichiers concernés ; limite des sources non écrites documentée. |
| Définition modifiée pendant édition d'entretien | Invariants métier protégés selon la matrice des dépendances. |
| Une action invalide dans un commit | Aucun succès partiel du commit atomique. |
| Création ou suppression concurrente | Membership et fichiers cohérents, pas de faux succès. |
| Réponse perdue, commit suivant déjà publié | Réconciliation au bon commit, sans doublon ni rollback de succès réel. |
| Crash avant/après envoi et installation du miroir | Reprise du journal, travail protégé avant tirage. |
| Nouvelle autosave pendant publication | La révision plus récente reste sale. |
| Fermeture/bascule bloquée | Contexte non remplacé, état récupérable. |
| Pagination interrompue, 403/404 ambigu, 429 | Aucune fausse suppression ou création de corpus vide. |
| Lecteur sans droits de push | Zéro écriture implicite, consultation effective. |
| Force-push ou branche recréée | Écritures suspendues et copie conservée. |
| Migration anciens comptes/manifestes DAV | Identités, médias locaux et copies de récupération conservés. |
| Deux corpus proches/branches/comptes | Caches, événements et droits isolés. |
| Objet LFS envoyé mais commit refusé | État incomplet expliqué, pas de média annoncé partagé. |
| Pointeur publié, objet absent/corrompu/interdit | Erreur média, aucun pointeur lu comme audio, texte utilisable. |
| Téléversement puis lecture depuis un second compte | Objet associé au bon projet et réellement accessible. |
| Fichier volumineux, annulation, disque plein | Mémoire bornée, nettoyage/reprise sûre, pas de fichier final corrompu. |
| OAuth révoqué ou refresh simultané | Un renouvellement cohérent ou réauthentification sans perte. |
| Export anonymisé vers projet neuf | Absence des contenus exclus et avertissement sur le corpus source. |

### 12.3 Commandes et rapports

Commandes existantes utilisables au fil des lots :

```sh
npm run typecheck
npm test -- test/webdav
npm test -- test/transitionContexte.test.ts test/fermetureApplication.test.ts
npm test -- test/distantRenderer.test.ts test/docsCadreDistant.test.ts
npm test
npm run build
npm run test:multiuser
```

Ajouter les suites GitLab/LFS sans rendre un compte institutionnel obligatoire
pour les tests hors réseau. Documenter configuration du banc, secrets par coffre
ou environnement, versions et résultats. Aucun secret ni donnée de corpus réel
dans les fixtures, traces et captures.

Un serveur absent entraîne un skip explicite, pas une validation. Ne pas lancer
de pull Docker, provisioning, suppression de volumes ou tests d'écriture sur le
dépôt source de Sonal sous prétexte de préparer ces bancs.

### 12.4 Banc Docker GitLab et contraintes de ce poste

**Choix de départ : une instance GitLab, deux projets de test**, l'un avec LFS
activé, l'autre avec LFS désactivé. Le réglage par projet permet de tester le
parcours utilisateur sans doubler les services, volumes et besoins mémoire.
Confirmer ce réglage sur la version GitLab retenue. Les deux comptes et postes
logiques s'appliquent aux deux projets.

Le cas « LFS globalement désactivé sur l'instance » est distinct du réglage par
projet. Si nécessaire, le tester dans une campagne séparée sur l'instance de test,
avec changement de configuration explicite et sans effacement des volumes,
plutôt que démarrer systématiquement une deuxième instance. Tester aussi en
faux HTTP la vérification impossible, les droits de lecture seuls et les refus
quota/transfert que le seul drapeau LFS ne couvre pas.

Avant toute installation :

- Vérifier l'accès Docker, le disque hébergeant réellement ses images/volumes,
  la mémoire allouée à son moteur et les besoins de la version GitLab choisie.
- Préférer une version proche de l'instance cible, épinglée ; services/ports et
  volumes séparés de Nextcloud et du dépôt source.
- Établir une enveloppe de disque/RAM avec marge pour l'image, les données, logs
  et transferts ; ne pas déduire l'espace physique disponible de la seule taille
  maximale d'un disque virtuel WSL.
- Faire valider l'installation/téléchargement de l'image GitLab et le démarrage.
  Aucun pull d'image Nextcloud ni reprovisionnement de ses bancs.
- **Ne rien effacer** : pas de prune, suppression d'image/volume/conteneur,
  nettoyage automatique de données existantes ou déplacement imposé.
  Toute éventuelle suppression de fixtures fait l'objet d'une autorisation distincte.

Constat en lecture seule le plus récent :

- Docker est accessible dans cette distribution ; son stockage visible sous
  `/var/lib/docker` dispose d'environ 676 Gio et la machine expose 30 Gio de RAM.
- L'image locale `gitlab/gitlab-ce` contient GitLab CE 18.11.0-ce.0. Le conteneur
  arrêté `gitlab`, les trois volumes nommés et un jeu de certificats existent déjà
  sous `/home/belignem/TestGitlabLocal` ; aucun téléchargement n'est nécessaire.
- Les volumes contiennent une instance initialisée et des dépôts de qualification.
  Les journaux attestent un service sain et des appels LFS Locks antérieurs, sans
  suffire à valider les scénarios de concurrence et de transfert exigés par ce plan.
- Une erreur de cible du volume de logs dans `docker-compose.yml` expliquait le
  dernier échec. Le Compose a été corrigé, l'image locale épinglée par digest et
  le pull interdit. Le conteneur défectueux reste conservé ; aucun volume nommé,
  conteneur historique ni fichier de qualification n'a été supprimé.
- Le certificat autosigné et sa clé correspondent. Le nouveau conteneur utilise
  les volumes nommés et répond sur les ports 80, 443 et 2222 sans redémarrage ni OOM.
- Deux projets dédiés exposent LFS actif/inactif. `user1` et `user2` y accèdent ;
  les jetons temporaires sont stockés hors dépôt dans un fichier de mode `0600`.

**Conclusion : le banc GitLab 18.11 est opérationnel sans réinstallation.** Les
essais valident create exclusif, atomicité multi-actions, gardes update/delete/move
et imposition des LFS Locks aux commits REST entre deux comptes. Le transfert LFS
binaire complet fonctionne aussi sans push Git et depuis le second compte. Un
verrou LFS appartient toutefois au compte : deux postes utilisant le même compte
ne sont pas exclus l'un de l'autre. Le bail versionné bloque cette course dans le
premier scénario réel et devient le candidat principal à mesurer. Docker ne
remplace pas la recette finale des
droits, quotas, OAuth et certificats institutionnels.

## 13. Risques, arbitrages restants et définition de terminé

### 13.1 Informations encore nécessaires

- Branche/tag V1 correspondant si possible aux utilisateurs et fonctions pratiquées,
  notamment médias ; le chemin du dépôt est confirmé, l'étude peut commencer.
- Décision de protocole face à la limite des LFS Locks pour deux postes utilisant le même compte.
- Instance institutionnelle, version, état LFS du projet, scopes et configuration OAuth.
- Quotas/protections de branche/CI, taille des corpus et médias, concurrence attendue.
- Acceptation de la conservation historique et procédure de copie anonymisée.
- Seuils acceptables de latence, trafic et commits de coordination.

Ce ne sont plus des choix ouverts sur l'architecture générale. Ils déterminent
le protocole, ses paramètres, le périmètre de compatibilité et le coût du pilote.

### 13.2 Portes de décision

| Porte | Avant quoi ? | Si non validée |
|---|---|---|
| Exclusion et publication GitLab sûres | L4, première édition. | Consultation de préversion seulement ; arbitrage explicite. |
| Dépendances métier protégées | Activation de chaque famille de transactions. | Commande refusée, pas de contournement local. |
| Connecteur LFS bout en bout sans clone | Livraison du support des médias GitLab. | Fonction Sonal non terminée, distincte d'un projet dont LFS est désactivé. |
| Autorisation institutionnelle des données | Corpus réel. | Fixtures synthétiques uniquement. |
| Non-régression et récupération | Chaque migration/extraction. | Corriger avant extension du périmètre. |

### 13.3 Définition de terminé

- [ ] Le retour d'expérience V1 est capitalisé et les preuves restantes sont identifiées.
- [ ] Le miroir commun fonctionne sans connaissance de DAV/REST dans ses règles locales.
- [ ] Les comptes, récents, copies et médias Nextcloud existants sont préservés.
- [ ] GitLab a un protocole d'exclusion mesuré et testé sur les versions supportées.
- [ ] Publication sous droit et gardes de contenu refusent les courses qualifiées.
- [ ] Les transactions protègent leurs dépendances et respectent leur atomicité annoncée.
- [ ] Les réponses perdues, crashs et fermetures bloquées ne perdent pas le travail.
- [ ] Les trois actions média fonctionnent avec Nextcloud et un projet GitLab compatible LFS.
- [ ] Un projet sans LFS reste utilisable sans partage LFS ; l'état inconnu, les droits
  de lecture/envoi et la revérification sont traités sans écriture de test cachée.
- [ ] OAuth, TLS, permissions et diagnostics ne divulguent pas de secrets.
- [ ] L'interface exprime le même travail quotidien sans exposer WebDAV/LFS à l'utilisateur.
- [ ] Les différences secondaires et limites face aux écritures externes sont documentées.
- [ ] L'avertissement historique et la procédure de nouvelle destination sont vérifiés.
- [ ] Les bancs réels et l'application empaquetée sont validés, avec skips distincts.
- [ ] La migration V1 est livrée si nécessaire aux équipes pilotes, sinon explicitement séparée.

## 14. Sources et limites de ce document

Éléments relus pour ce plan : les deux études précédentes, le plan 3 initial,
les échanges utilisateur, les contrats de verrou, le coffre, les constructeurs
et parcours de sessions/transactions, la création WebDAV, le miroir et les
transferts, les Docs cadre et les scripts de tests.
Le retour d'utilisation V1 vient du responsable du projet ; aucune nouvelle
recette de la version distribuée n'a été exécutée pour rédiger ce document.

La rédaction initiale ne comportait aucun essai applicatif. Depuis, la première
itération a exécuté les tests en mémoire détaillés dans `docs/dev/gitlab.md`.
Aucun compte institutionnel utilisé et aucun corpus utilisateur distant modifié.
Le banc Docker local préexistant a été redémarré sans téléchargement ; les gardes,
la réponse perdue et le premier transfert LFS réel sont consignés dans
`docs/dev/gitlab.md`. La façade de contexte, les contrats de lecture et de
transfert ainsi que l'installation locale reprenable sont implémentés. Le
premier lecteur GitLab à SHA fixé est assemblé dans un contexte de consultation
sans écriture serveur ; les contrats de publication et de coordination restent
à extraire.

Références :

- [Architecture V2](../../docs/dev/architecture.md).
- [Multi-utilisateur V2](../../docs/dev/multi-utilisateur.md).
- [Guide corpus distant](../../docs/user/corpus-distant.md).
- [Migration locale V1](../../docs/user/migration-v1.md).
- [API Commits GitLab](https://docs.gitlab.com/api/commits/).
- [API Repository Files](https://docs.gitlab.com/api/repository_files/).
- [API Repositories](https://docs.gitlab.com/api/repositories/).
- [API Branches](https://docs.gitlab.com/api/branches/).
- [OAuth GitLab](https://docs.gitlab.com/api/oauth2/).
- [Git LFS dans GitLab](https://docs.gitlab.com/topics/git/lfs/).
- [Protocole LFS batch](https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md).
- [Protocole LFS locking](https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md).

**Prochaine étape : tester le parcours de consultation GitLab dans Electron à
deux profils, puis ajouter la découverte bornée des projets et branches. La
qualification GitLab réelle reprendra sur les scénarios longue durée et les
transferts volumineux, sans réécriture de l'application ni serveur Sonal.**
