# Migration GitLab SonalPi1 → SonalPi2

**Parcours qualifié sur banc réel et activé le 27 octobre 2026.**
`MIGRATION_GITLAB_QUALIFIEE = true` autorise migration et reprise dans l’interface
et côté main. La politique média Local reste inchangée. Son bilan est désormais
plus concis et les deux parcours conservent les documents non convertis dans `Autres/` ;
voir [conservation et bilan commun](migration-conservation.md).
La [recette réelle](migration-gitlab-v1-qualification.md) consigne les preuves,
les corrections et les limites. Le projet est clôturé avec accord utilisateur
le 27 octobre 2026 ; le [plan terminé](../../plans/termines/migration_sonalpi1_sonalpi2_local_gitlab.md)
conserve l’historique et le périmètre accepté.

## Préparation sans publication

`MigrationGitLab.vue`, `useSourceMigrationGitLab.ts` et `useMigrationGitLab.ts`
réutilisent l’authentification de `useProjetGitLab`. L’utilisateur peut choisir une
source enregistrée ou saisir une nouvelle adresse. Un compte connecté OAuth ou
à jeton est repris sans nouvelle saisie ; le renouvellement OAuth à l’échéance
reste assuré par le service existant côté main.

Pour une source enregistrée, seule la `destinationId` franchit l’IPC de découverte.
Le main retrouve le compte, le projet, la branche et la racine dans le coffre,
recontrôle le projet par son identifiant GitLab, puis découvre les `.crp` sous la
racine enregistrée. Aucun secret n’est renvoyé et aucun miroir n’est ouvert.
Le compte de cette source reste imposé : un autre compte connecté ne le remplace
pas silencieusement. Une destination oubliée est refusée, même si la demande
contient aussi une adresse ou un compte.

Une réponse HTTP 401 rend la reconnexion disponible dans la modale, même lorsque
le jeton est encore présent localement. Une erreur réseau ou un refus de droits
HTTP 403 n’est pas présenté comme une demande de nouveau credential. Une absence
de credential après échec du renouvellement OAuth est relue depuis l’état public.

`PreparateurMigrationGitLab` découvre les `.crp` à un commit source figé ; plusieurs
fichiers impliquent un choix, jamais une fusion. Pour le corpus choisi, les annexes
Lexico `.out`, `.lem` et `.cnct` de même nom sont lues au même commit et intégrées au
bilan. Le corpus enregistré n’est ni modifié ni ajouté de nouveau aux récents.

Un `bilanId` identifie le bilan, distinct de la découverte. Les conversions
renderer sont conservées côté main dans une préparation privée liée à ce bilan.
Un résultat obsolète ou une conversion manquante empêche l’exécution. Aucun corpus
n’est installé ni ajouté aux récents pendant cette préparation.

La cible doit être un autre dépôt, vide ou initialisé uniquement par des fichiers
techniques usuels à la racine. Corpus, entretiens, médias et autres fichiers
utilisateur, même nommés `README.mp3`, sont refusés. L’acceptation des dépôts sans
branche est spécifique à la migration ; les autres parcours GitLab ne changent pas.

Le bilan inventorie seulement les médias référencés, dédoublonne les références
résolues et fixe leurs chemins, taille et SHA-256. Les chemins source sont résolus
relativement au `.crp`. Une référence hors dépôt ou inaccessible arrête la
préparation ; une erreur réseau ne devient pas un entretien vide.

Le dossier du `.crp` est aussi inventorié pour conserver les documents non convertis
sous `Autres/` dans le nouveau dépôt : résultats `.lexaf.json`, exports, inconnus et
originaux de réglages partiellement ignorés. Les fichiers rattachés à d’autres corpus
identifiables et les noms techniques ou d’accès connus sont écartés et signalés.
Le bilan commun expose les compteurs et avertissements, avec les listes repliées.

`LectureV1GitLab` lit les octets avant détection d’encodage. Les documents LFS sont
résolus vers leur contenu réel et vérifiés. Les documents V1 gardent les bornes de
lecture existantes. La validation externe réutilise le service WebDAV ; les accès
restent dans le main, jamais dans le bilan public.

## Conversion et copies

`convertirEntretienMigrationGitLab` réutilise le SAS et le DOM existants, sans
nouveau parseur. `DocumentsMigrationGitLab` utilise `CorpusStore` dans un dossier
privé pour importer les définitions et les entretiens en ordre. Les blocs `legacy`,
les décisions d’entretien et les déclarations locales sont conservés. Les thèmes
et variables des `.Sonal` complètent les définitions absentes du `.crp` sans
remplacer les définitions déjà présentes. Après fusion, les annotations sont
rattachées aux identifiants des règles effectivement conservées, même après un
import répété ou une fusion partielle d’alias ; leur pseudo et leur état ne changent pas.

Avant le premier transfert, les contenus natifs, identifiants, chemins et empreintes
sont figés localement. Leur préparation n’autorise pas la publication : l’opération
attend la confirmation effective des copies média avant d’envoyer leurs références.

`TransfertGitLab` récupère les binaires en flux à un commit figé, avec installation
exclusive après vérification. Les plafonds JSON ne sont pas appliqués aux médias.
`ClientLfsGitLab` effectue le batch, l’envoi, l’éventuelle vérification et une
relecture intégrale. L’absence d’action d’upload ne suffit pas à confirmer l’objet.
L’authentification est celle du service existant ; aucune URL temporaire ni aucun
accès n’est incorporé aux références publiées.

`CopieurMediasMigrationGitLab` copie vers LFS ou WebDAV. Pour WebDAV, la création
est conditionnelle et les octets sont relus. Une copie existante différente reste
intacte ; une réponse perdue peut être reconnue par son contenu sans second PUT.
Le sous-dossier externe est dérivé de la source figée, du corpus choisi et de la
cible. Les homonymes de dossiers sources différents restent distincts.

Les documents supplémentaires réutilisent ce transport LFS, même avec des médias
WebDAV. Ils sont copiés tels quels, jamais transformés en analyses V2. La lecture
brute est vérifiée contre l’objet Git source pour ne pas dépendre de métadonnées
texte susceptibles de réencodage. Le suivi existant conserve leurs confirmations.

Les pointeurs et attributs LFS sont limités à `medias/` et `Autres/`. Le `.gitattributes` de
racine n’est pas remplacé, et les JSON natifs restent hors LFS.

## Opération et publication

`ServiceMigrationGitLab` relie préparation, confirmation, copies, publication et
réouverture via les IPC et le preload. `OperationMigrationGitLab` exécute les étapes
à partir des preuves locales, sans surveillance périodique de migration.

La cible est recontrôlée avant copie, avant publications et à chaque tentative
d’envoi. Les fichiers techniques initiaux sont conservés. Le publieur et ses droits
existants sont réutilisés ; les documents sont créés conditionnellement, jamais
remplacés. Un dernier contrôle empêche d’ouvrir une migration en attente dont la
cible a changé.

Pour une cible sans branche, le premier commit de coordination initialise `main`.
Une cible initialisée conserve sa branche par défaut. Le banc réel démontre
l’initialisation sans branche et la conservation des fichiers techniques.
Un dépôt `empty_repo: true` peut annoncer `default_branch: main` avant toute
création de branche : la préparation de migration le traite comme sans branche,
sans modifier le comportement des autres parcours.

Les limites de taille et d’actions existantes déterminent les lots, en réservant la
place nécessaire à la coordination. Une publication groupée est préférée lorsqu’elle
tient ; le fractionnement n’est utilisé que si nécessaire. `corpus.json` est publié
en dernier. Un document individuel trop gros est refusé avant copie, pas découpé
arbitrairement.

## Suivi durable et reprise

Le profil conserve un suivi par opération sous
`migrations-gitlab/migration-<bilanId>/`. `SuiviDurableMigrationGitLab` enregistre
source, destination, identité, correspondance des chemins/identifiants, empreintes,
copies confirmées, lots acquis et éventuelle intention inconnue. Les contenus
privés et les octets conservés permettent de reprendre sans recréer les identifiants.

Les candidats de commits utilisent le `JournalPublicationGitLab` existant, dans
le dossier de l’opération. Le publieur conserve le candidat confirmé jusqu’à
l’enregistrement durable de la progression. Il n’y a pas de famille de journaux
par type de donnée.

Une réponse perdue n’entraîne pas de relance automatique. La réconciliation retrouve
le commit et vérifie les contenus. Si une recherche le déclare absent, une reprise
explicitement confirmée neutralise l’ancienne tentative par une nouvelle garde,
puis vérifie les fichiers avant de refaire des créations conditionnelles.

Une cible partielle n’est reconnue qu’avec les preuves de cette opération. Un suivi
corrompu, un contenu local altéré, une autre destination ou un autre poste bloque
l’exécution. Une nouvelle session ne reprend pas un droit précédent encore actif ;
il faut réessayer après son expiration. Aucun droit actif n’est forcé et aucune
copie distante n’est supprimée pour revenir en arrière.

## Annulation et réouverture

L’arrêt conserve les copies acquises et empêche les transferts suivants aux
frontières sûres. Fermer la modale demande aussi l’arrêt et retire son écoute de
progression ; les réponses tardives ne mettent plus à jour le formulaire fermé.

Le signal est transmis à la vérification finale des médias et à la préparation du
miroir. Un arrêt pendant un fichier empêche le suivant et l’installation du tirage.
`ServiceOuvertureGitLab.ouvrirMigration` vérifie les médias du dépôt et l’annulation
avant de fermer l’ancien contexte. Une fois la bascule finale commencée, elle se
termine par le mécanisme ordinaire ; elle n’est pas annulée au milieu.

Un échec ou un arrêt avant cette bascule conserve la phase d’ouverture et permet
de réessayer sans publier à nouveau. Un arrêt tardif après réussite ne bloque pas
une ouverture suivante. Si le dernier checkpoint échoue après installation du
corpus confirmé, le résultat d’ouverture reste utilisable ; le suivi antérieur
permet de réessayer l’ouverture sans renvoyer les données.

La destination est enregistrée après confirmation pour permettre sa reprise et la
configuration média locale. Les récents sont ajoutés par l’installation finale,
comme pour les autres ouvertures GitLab. Le cycle renderer existant applique le
résultat confirmé, puis ferme le formulaire après la fin de l’opération ; aucun
nouveau mécanisme de navigation ou lecteur n’est créé.

## Références et lecteur existant

`ReferenceMediaDistant.fournisseur` distingue :

- `gitlab` : média du dépôt, récupéré dans le miroir au commit des documents et
  servi par le protocole local existant ;
- `webdav` : média relatif à la base externe déclarée sur le poste ;
- fournisseur absent : résolution historique conservée.

Le miroir GitLab ne récupère que les références explicitement `gitlab`. Le lecteur
charge le chemin effectif rendu par l’inventaire local même si `audioRef` est nul.
Un cache homonyme ne transforme pas une référence externe en média du dépôt. Les accès à
la base externe restent au coffre du poste ; un autre profil doit déclarer ses
propres accès au même dossier partagé.

## Vérifications et limites

Les tests simulés couvrent préparation, conversions, copies de plusieurs Mio,
LFS, homonymes, refus d’écrasement, publication groupée/fractionnée, réponse perdue,
reprise et réouverture. La couverture dédiée d’annulation vérifie aussi l’arrêt
pendant le miroir, l’absence d’installation tardive, la reprise sans publication
supplémentaire et l’arrêt tardif après réussite. Le bilan consolidé et sa commande
sont consignés dans le
[plan de migration terminé](../../plans/termines/migration_sonalpi1_sonalpi2_local_gitlab.md).

**Huit scénarios réels réussis dans Electron**, puis **16 tests Electron réussis**
sur le build normal activé : huit réels et huit locaux/simulés de non-régression.
Après ajout du bilan commun et de la conservation documentaire, la campagne
consolidée atteint **915 tests / 54 fichiers**, typecheck et build réussis.
Voir les commandes et projets synthétiques dans la
[recette réelle](migration-gitlab-v1-qualification.md).

Les deux destinations ont des copies vérifiées par SHA-256. Le lecteur existant
joue audio et vidéo du dépôt, y compris sur profil neuf, avec recherche temporelle.
Sur WebDAV, l’audio fonctionne ; la vidéo est copiée mais sa lecture distante reste
refusée par le lecteur actuel. Le bilan avertit de cette limite avant confirmation.
Les arrêts SIGKILL pendant une copie WebDAV et après publication GitLab se reprennent
sans recréer les identifiants ni répéter les publications acquises. Une réponse
perdue est réconciliée, y compris sur un corpus de 251 entretiens publié en deux lots.

Les actions LFS vers une autre origine restent refusées : une instance utilisant
un stockage objet externe n’est pas couverte. Les gardes de fichiers et contrôles
de cible ne sont pas une transaction globale GitLab + WebDAV. Le suivi de reprise
est local au profil, pas un fichier à transporter vers un autre poste.
