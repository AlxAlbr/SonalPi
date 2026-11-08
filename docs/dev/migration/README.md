# Migration SonalPi1 — local et GitLab

La migration transforme un corpus SonalPi1 en **un nouveau corpus SonalPi2**,
dans une destination distincte. Le sélecteur de CRP reconnaît la V1 locale ;
l'ouverture d'un projet GitLab identifie aussi sa version et propose le passage V1
avec la source déjà préparée. Après succès local, seul le CRP V1
est renommé en `.crp.sauvegarde-v1` ; la source GitLab n'est pas modifiée. Ce n’est ni une ouverture ordinaire, ni une migration de `formatVersion`
d’un corpus déjà natif. Guide fonctionnel : [migrer un corpus](../../user/migration-v1.md).

## Le parcours GitLab à comprendre

```text
Ouvrir un projet GitLab
  → identifier le contenu V2 ou préparer les CRP V1 au même commit
  → ouvrir normalement le V2, ou demander une destination distincte pour la V1
  → préparer le bilan sans redemander la source et les accès
  → confirmer ce qui sera repris
  → convertir et installer les données, conserver les autres documents
  → vérifier le résultat, puis ouvrir le nouveau corpus
```

La préparation ne bascule pas le corpus courant. Le main conserve les identités,
chemins et empreintes du bilan ; le renderer ne peut pas lui substituer une liste
de fichiers à copier. Si les sources ou la cible ne correspondent plus à ce bilan,
le parcours refuse de poursuivre avec cet ancien aperçu.

La conversion réutilise le sas d’import et `CorpusStore`. Les références des
annotations doivent correspondre aux définitions réellement conservées après
fusion des imports, pas aux seuls identifiants de la source.

## Ce qui est converti ou conservé

| Élément | Résultat |
|---|---|
| `.crp` et transcriptions reconnues | Définitions et entretiens natifs SonalPi2. |
| Annexes `.out`, `.lem`, `.cnct` portant le nom du corpus | Réglages Lexico ; l’original est aussi conservé si une partie est ignorée. |
| `.lexaf.json`, exports et autres documents admissibles | Copie des octets dans `Autres/`, sans conversion en analyse native. |
| Fichiers techniques, accès connus ou noms incompatibles | Exclusion signalée dans le bilan. |

Un ancien résultat conservé n’est pas une analyse que SonalPi2 sait rouvrir.
Les fichiers d’`Autres/` ne sont pas ajoutés automatiquement aux documents de
préparation. Dans le parcours GitLab, `BilanMigration.vue` résume les entretiens,
réglages, documents et éléments non repris ; les détails sont repliés, mais les avertissements restent
visibles. Une erreur de lecture n’est jamais traitée comme un document vide.

| Différence | Local | GitLab |
|---|---|---|
| Source | Fichiers du poste, revérifiés avant installation. | Documents lus à un même commit source figé. |
| Destination | Nouveau dossier distinct. | Autre dépôt, vide ou limité aux fichiers techniques admis. |
| Médias | Internes copiés sous `medias/` ; externes référencés à leur emplacement réel. | Copiés dans GitLab/LFS ou une base WebDAV externe. |
| Documents supplémentaires | `<nouveau-corpus>/Autres/`. | `Autres/` du nouveau dépôt, même si les médias vont sur WebDAV. |
| Interruption | Préparation annulable et nettoyée ; aucune cible partielle activée. Pas de reprise persistante. | Suivi durable des copies et publications pour une reprise contrôlée. |

## Les limites de l’inventaire

Le classement commun parcourt le dossier du `.crp` choisi et ses descendants,
pas tout le dépôt. Il écarte les fichiers déjà repris, les autres `.crp`, leurs
références identifiables et les sous-dossiers contenant un autre corpus SonalPi1.
En local, les autres corpus SonalPi2 et la destination imbriquée sont aussi exclus.

Les fichiers techniques et noms d’accès connus (`.git`, caches, `.env*`, clés,
`credentials.*`, etc.) sont exclus. Les noms non portables sont signalés ; les
collisions de casse ou de normalisation Unicode sont refusées sans renommage
silencieux. Les liens symboliques locaux ne sont pas suivis.

Ce classement ne détecte pas tous les secrets dans le contenu des documents ni
l’appartenance de tout fichier à un corpus voisin. Dans le parcours GitLab, les
ambiguïtés restent visibles dans le bilan avant confirmation d'un envoi distant.

## Local : préparer un corpus complet, puis basculer

`ConservationMigrationLocale` lie le bilan au `.crp`, à la destination et aux
empreintes des documents. Avant exécution, il relit l’inventaire et vérifie les
parents des chemins pour empêcher une substitution par lien symbolique.

`MigrationV1` construit un store non actif dans un dossier temporaire voisin de
la destination. Il vérifie les transcriptions et médias déclarés avant écriture,
distingue les chemins réels internes/externes et contrôle les sources avant la
bascule. Une référence manquante n'est pas transformée en entretien vide.

Les médias internes sont copiés en flux et vérifiés. Les conversions HTML restent
dans le sas du renderer ; le pont ne lit les transcriptions que par index dans la
tentative en cours. Les réglages Lexico et les documents `Autres/` admissibles sont
repris par les services existants, avec annulation des flux documentaires également.
La fenêtre locale ne montre ni aperçu technique ni bilan de réussites.

Une fois les imports terminés, le renderer vide encore l'autosave. Le main passe
par sa file de transitions et `executerTransitionPreparee` pour fermer/publier le
contexte précédent, promouvoir le dossier et installer son store. Après application
réussie à l'interface, le CRP V1 est marqué comme sauvegarde par lien exclusif puis
retrait de son nom initial, sans écraser une sauvegarde apparue entre deux contrôles.
Un refus de ce dernier renommage laisse la V2 valide ouverte et produit un avertissement.

L'annulation attend l'arrêt des écritures puis nettoie seulement le dossier de
préparation dont l'identité est conservée. Une substitution ou un refus de nettoyage
signale l'emplacement à vérifier et libère la tentative, sans effacer de données
apparues à sa place. La courte bascule finale n'est pas annulable. Un arrêt brutal
peut laisser un temporaire non actif, sans reprise automatique au redémarrage.

## GitLab : publication et reprise

L’authentification réutilise le [service GitLab](../distant/authentification-gitlab.md).
Le préparateur découvre les `.crp`, impose un choix si nécessaire et lit les
annexes au même commit que les transcriptions. Le parcours d’envoi est activé par
`MIGRATION_GITLAB_QUALIFIEE`.

Les médias et documents sont transférés en flux et vérifiés avant de publier
leurs références. Un homonyme différent n’est pas remplacé. Les documents
`Autres/` exigent LFS sur la cible ; leurs attributs restent dans
`Autres/.gitattributes`, sans recopier ceux de la source. Les JSON natifs restent
hors LFS. La publication respecte les limites d’actions et de taille, avec
`corpus.crp` **en dernier**, en une fois ou par lots prévus par le protocole.
Une cible sans branche peut être initialisée par ce parcours, pas par une simple
consultation.

Pour les anciens encodages, conserver le chemin de lecture binaire :
`LectureV1GitLab` vérifie les octets bruts contre l’objet Git source et résout
les pointeurs LFS. Les métadonnées texte de l’API peuvent altérer la représentation
d’un fichier non UTF-8 ; elles ne remplacent pas ce contrôle.

La reprise est accessible depuis « Ouvrir un corpus distant → GitLab », par
« Reprendre un passage à SonalPi2… » lorsqu'un suivi existe. La même fenêtre
permet d'ouvrir un corpus déjà publié dont l'ouverture n'a pas abouti, sans relire
la V1. L'Accueil n'a plus de rubrique de migration.

Le profil garde `migrations-gitlab/migration-<bilanId>/` : contenus préparés,
empreintes, copies confirmées et lots acquis. Le suivi appartient au poste et à
la destination. Une réponse perdue doit être reconnue avant tout nouvel envoi ;
un suivi altéré ou une autre destination bloque la reprise. Un ancien suivi sans
inventaire documentaire ne reçoit pas de fichiers supplémentaires sans consentement.

L’arrêt conserve les réussites et suspend les étapes suivantes, sans effacer les
copies distantes. Un redémarrage n’hérite pas des droits d’un ancien processus et
ne les libère pas de force. L’ouverture finale prépare le contexte avant de
fermer l’ancien ; si elle échoue, reprendre cette ouverture ne republie pas les
données confirmées. Les récents sont ajoutés à l’installation finale.

Les références média gardent leur fournisseur : un cache homonyme ne peut pas
transformer une référence WebDAV en référence GitLab. Un nouveau poste doit
fournir ses propres accès à la base externe. La copie d’une vidéo WebDAV ne
rend pas sa lecture distante disponible. Les actions LFS vers une autre origine
sont refusées ; WebDAV et GitLab ne forment pas une transaction atomique commune.

## Où intervenir et vérifier

| Besoin | Points d’entrée |
|---|---|
| Conversion du corpus et réglages Lexico | `src/shared/corpus/migrationCrp.ts`, `src/main/migrationLexicoV1.ts` |
| Classement et exclusions des documents | `src/shared/corpus/conservationMigration.ts`, `src/main/conservationMigration.ts` |
| Préparation et installation locale | `src/main/migrationV1.ts`, `src/main/conservationMigrationLocale.ts`, `src/main/transitionContexte.ts` |
| Préparation et conversion GitLab | `src/main/gitlab/preparationMigration.ts`, `src/main/gitlab/documentsMigration.ts` |
| Lecture et copies GitLab | `src/main/gitlab/lectureV1.ts`, `src/main/gitlab/copieMediasMigration.ts` |
| Publication, suivi et reprise GitLab | `src/main/gitlab/operationMigration.ts`, `src/main/gitlab/suiviMigration.ts`, `src/main/gitlab/migration.ts` |
| Interface locale et bilan commun | `src/renderer/components/accueil/MigrationCorpus.vue`, `src/renderer/components/accueil/BilanMigration.vue` |
| Interface et orchestration GitLab | `src/renderer/components/accueil/MigrationGitLab.vue`, `src/renderer/composables/corpus/useMigrationGitLab.ts` |

Pour les règles communes et le local : `test/migrationCrp.test.ts`,
`test/migrationLexicoV1.test.ts`, `test/conservationMigration.test.ts`,
`test/conservationMigrationLocale.test.ts` et `test/transitionContexte.test.ts`.
Pour GitLab : `test/gitlab/migrationV1.test.ts`, `test/gitlab/documentsMigration.test.ts`,
`test/gitlab/copieMediasMigration.test.ts`, `test/gitlab/operationMigration.test.ts`,
`test/gitlab/serviceMigration.test.ts` et `test/migrationGitLabRenderer.test.ts`.
`e2e/migration-v1.e2e.ts` couvre le local ; `e2e/migration-gitlab-interface.e2e.ts`
couvre l'ouverture V1 préremplie, la garde partagée et la reprise sans source,
avec OAuth ou jeton simulés.

## Rejouer la recette réelle

Préparer `gitlab` et `nextcloud-a` avec `preparer_bancs_docker`. Avec les accès
existants du banc dans l’environnement et `ffmpeg` disponible :

```sh
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:migration:gitlab:e2e
```

`e2e/migration-gitlab.e2e.ts` couvre copies, profil neuf, réponse perdue, arrêt de
processus et publication fractionnée. Utiliser des fixtures synthétiques, jamais
un corpus utilisateur, sans télécharger ni reprovisionner les images Docker.
Un test sauté ne valide pas le parcours. Cette recette ne certifie pas tous les
quotas, stockages externes ou paquets ; une connexion par jeton ne qualifie pas OAuth.
