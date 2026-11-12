# Plan — suite corpus.crp : simplifier l'ouverture et le passage depuis la V1

> Report sur la base `multiongletcorpus` : voir
> [le compte rendu](report-crp-sur-multiongletcorpus.md).
> Les résultats complets plus bas sont la recette historique de l'ancienne base ;
> la nouvelle base conserve le format 9 et fait l'objet de tests ciblés distincts.

## 1. Objectif et portée

Faire évoluer le travail de [plan-corpus-crp.md](plan-corpus-crp.md) vers un parcours
plus simple, sans retirer les protections du travail utilisateur.

Ce plan remplace deux choix du précédent :
- les demandes d'ouverture reçues pendant une opération ne seront plus mises en file ;
- la migration V1 créera un corpus V2 indépendant du dossier V1, en copiant ses
  médias internes mais en conservant les références aux médias externes, puis
  renommera le seul fichier `.crp` V1 comme sauvegarde non ouvrable par double-clic habituel.

**Implémentation terminée : les cinq étapes de l'ordre de réalisation sont réalisées.**
Le renommage du projet, la réception sans file et la nouvelle migration V1 sont
disponibles. La cible est construite hors contexte, les médias internes sont copiés,
les références externes conservées et les sources manquantes bloquées. La préparation
est annulable ; le CRP V1 n'est renommé qu'après ouverture réussie de la V2.
L'interface minimale remplace l'aperçu et les bilans détaillés. La carte de migration
séparée de l'Accueil est retirée : « Ouvrir un corpus local » suffit pour les CRP V1 et V2.
La bascule des corpus personnels et la recette des associations installées restent
à traiter séparément ; aucune donnée personnelle n'a été modifiée.

### Validation finale de l'implémentation

Après retrait de la carte dédiée : typecheck et build réussis ; les 18 E2E ciblés
migration/ouverture passent par le sélecteur commun, avec vérification de l'absence
de la carte et du préremplissage automatique. Les résultats complets ci-dessous
sont ceux de la recette précédente.

- `npm run typecheck` et `npm run build` : succès.
- `npm test` : **752 tests réussis, 21 sautés** (55 fichiers réussis, 6 sautés).
- `npm run test:e2e` : **97 tests réussis, 7 sautés** ; aucun échec.
- Migration : 28 tests unitaires ciblés, dont copies/annulation, références internes
  et externes, liens, homonymes, sources modifiées, Windows-1252, destination remplacée,
  fermeture refusée, restauration du nom V1 et collision/refus de permission au renommage.
  Le manque d'espace est injecté dans le flux d'écriture, sans remplir un disque réel.
- Les E2E couvrent le parcours minimal, les deux cas de nom V1, l'autosave depuis
  l'entretien, les blocages sans bascule, l'annulation d'une grosse copie, deux CRP
  du même dossier, le renommage différé et la reprise après un nettoyage refusé.
- Application Linux non installée reconstruite avec la distribution Electron
  déjà présente ; son démarrage est testé en E2E, sans installation système.
- Le renommage distant et sa propagation à un second miroir sont testés sur le
  serveur WebDAV mémoire. Les bancs Nextcloud réels restent arrêtés : ils n'ont
  été ni reprovisionnés ni validés. Les 7 sauts E2E sont les 6 parcours distants
  et la vidéo dont la fixture manque.

## 2. Choix retenus

### Un seul nom visible, conservé dans le corpus

- Un seul champ utilisateur : **« Nom du corpus »**, prérempli avec le nom du
  fichier `.crp` V1 sans extension, et modifiable. Ne demander ni un nom de fichier,
  ni un second nom de dossier indépendant.
- Ne pas proposer de choix entre un nom interne V1 et le nom du fichier : le nom
  du fichier est le repère retenu, même si un champ `nom` existe dans le JSON source.
- Ce nom sert à nommer le nouveau dossier et à initialiser le champ V2 `nom`.
- Le fichier natif V2 s'appelle toujours `corpus.crp` ; aucun second nom à saisir.
- Conserver le champ `nom` existant comme source du nom affiché du projet.
  Il ne s'agit pas d'un second réglage : le nom du dossier désigne son emplacement.
- En distant, un même corpus partagé peut apparaître sous des noms de dossiers
  différents selon les comptes Nextcloud ; le dossier du miroir local porte aussi
  une identité technique. Le nom enregistré dans le CRP fournit un libellé commun,
  indépendant de ces emplacements, sans imposer de renommer les partages ou leurs URL.
- Renommer un dossier dans l'explorateur ou dans Nextcloud ne renomme donc pas
  automatiquement le projet affiché. Ne pas ajouter de synchronisation des noms.
  Pour les corpus anciens sans champ `nom`, conserver le repli d'affichage existant.
- Proposer un emplacement et un dossier libre, par exemple `Mon enquête - SonalPi2`.
  Afficher le chemin final ; ne demander un changement d'emplacement que si souhaité.

### Renommer le corpus sans changer son emplacement

- [x] Ajouter une action **« Renommer le corpus »** pour le corpus V2 courant : un seul
  champ prérempli, avec **« Annuler »** et **« Renommer »**. Préciser simplement :
  **« Le nom affiché changera, pas le dossier qui contient le corpus. »**
- Cette action modifie uniquement `corpus.crp.nom`. Elle ne renomme ni le dossier,
  ni `corpus.crp`, ni les médias, ni la sauvegarde V1 ; elle ne change aucune URL.
- En local, réutiliser l'écriture atomique du store. En distant, utiliser la
  transaction de définitions existante et ses contrôles de verrou/précondition.
  Ne pas ajouter de nom propre à chaque profil, de renommage de partage ou de
  procédure de déplacement dans cette action.
- Le nouveau nom est commun aux utilisateurs du corpus distant ; les autres postes
  le récupèrent lors de leur actualisation normale, sans nouveau mécanisme de diffusion.
- [x] Utiliser `nom` de manière cohérente dans l'en-tête et les récents locaux/distants.
  Ne pas conserver un ancien nom dans un cache ni afficher systématiquement le nom
  du dossier dans les récents locaux. Garder un repli pour les anciens corpus sans `nom`.
- [x] Refuser un nom vide après suppression des espaces en début/fin. Un échec
  d'enregistrement ou un refus distant conserve le nom précédent ; ne pas annoncer
  de réussite avant confirmation de l'écriture. Annuler n'écrit rien.

**Le renommage physique d'un dossier n'est pas une opération transparente aujourd'hui.**
Les récents locaux conservent son ancien chemin, les médias internes peuvent être
référencés en absolu et une connexion distante mémorise son URL WebDAV. Changer le
chemin peut donc demander de réparer des références et de préserver les sessions
et les travaux non publiés du miroir. Le champ `nom` ne répare pas ces chemins :
il permet précisément de changer le libellé sans les modifier.

Une procédure de déplacement/renommage physique reste **hors périmètre** de cette
suite. Ne pas ajouter de recherche automatique de corpus déplacé ni promettre
qu'un renommage dans l'explorateur ou dans Nextcloud sera automatiquement suivi.

### Un vrai passage à la V2

- Créer la V2 dans un nouveau dossier dédié, pas par conversion sur place.
- Convertir les entretiens et distinguer automatiquement les médias internes et
  externes au dossier contenant le CRP V1, sans ajouter de choix à l'utilisateur.
- Copier les médias internes dans le dossier V2 et faire viser ces copies par les
  références V2. Aucun média V2 ne doit encore dépendre du dossier V1 sauvegardé.
- Ne pas copier les médias externes : conserver une référence à leur emplacement
  existant. Ils restent partagés entre les deux versions et ne doivent être ni
  déplacés, ni supprimés pour nettoyer l'ancien corpus.
- L'indépendance concerne donc le dossier V1, pas tous les fichiers utilisés par
  l'ancien corpus. Ne pas présenter la V2 comme un paquet autonome contenant tous ses médias.
- Conserver les sources V1 : ni suppression, ni déplacement des entretiens ou médias,
  ni renommage du dossier V1.
- La seule modification autorisée dans la source, après réussite, est le renommage du CRP.
- Cette copie est une règle propre à la migration V1, pas une refonte de la gestion
  ordinaire des médias V2. Conserver le format actuel et ses références absolues.
  L'indépendance vis-à-vis du dossier V1 n'est pas une promesse de portabilité après déplacement du dossier V2.

### Une sauvegarde V1 clairement identifiable

Après création, validation et ouverture réussies de la V2 :

```text
MonEnquete.crp → MonEnquete.crp.sauvegarde-v1
```

- Le contenu du fichier reste inchangé ; seule son extension d'ouverture est désactivée.
- Ne pas utiliser `MonEnquete-V1.crp`, qui resterait ouvrable comme avant.
- Ne renommer ni le dossier, ni les fichiers `.Sonal`, ni les médias : les anciens
  chemins doivent rester utilisables pour un retour à la V1.
- Pour restaurer l'ouverture V1, rendre au CRP son nom d'origine.
- La sauvegarde est l'ensemble des sources conservées, pas ce seul CRP.
  Les médias externes non copiés restent nécessaires aux deux versions, y compris
  après le renommage du CRP V1.
- Ne pas ajouter de registre « déjà migré », de fichier marqueur, ni de redirection
  automatique vers une V2 mémorisée. La trace `meta.sourceV1` reste une provenance,
  pas un second mécanisme de suivi des migrations.

## 3. Parcours utilisateur minimal

### Ouvrir un V2

Valider le fichier, sauvegarder le travail courant, fermer/publier les sessions si
nécessaire, puis ouvrir le corpus. S'il est déjà ouvert, remettre la fenêtre au
premier plan sans réinitialiser l'entretien ni ses verrous.

### Ouvrir un V1

Une seule fenêtre, accessible depuis « Ouvrir un corpus local » et le système ;
le fichier déjà choisi ne doit pas être redemandé. Aucune carte de migration distincte
n'est nécessaire sur l'Accueil.

**Titre : « Passer à SonalPi2 »**

> Vos entretiens seront repris dans un nouveau dossier. Les médias de l'ancien
> dossier seront copiés ; les médias externes resteront à leur emplacement.
> Votre ancien corpus sera conservé comme sauvegarde. Son fichier `.crp` sera
> renommé pour éviter une ouverture accidentelle ; vous pourrez rétablir son nom
> pour réutiliser SonalPi1.
> Dans SonalPi2, le fichier s'appelle toujours `corpus.crp`.

Afficher uniquement :
- le nom du corpus, modifiable ;
- le dossier de destination proposé, avec possibilité de changer son emplacement ;
- les boutons **« Annuler »** et **« Passer à SonalPi2 »**.

**Ne pas afficher de listes de thèmes, variables, règles, dates ou compteurs de
réussite. Pas d'aperçu technique, même replié, ni de bilan « thèmes migrés »,
« variables migrées », etc.** L'analyse reste interne pour valider et convertir.

Pendant l'opération : un état global **« Passage à SonalPi2… »**, avec une seule
progression si utile pour les médias volumineux. Pas de notification par fichier
ou par catégorie de données ; empêcher les doubles validations et la fermeture
accidentelle de la fenêtre de migration pendant les écritures.

Garder un bouton **« Annuler »** pendant la préparation, y compris la copie des
médias internes. Une annulation arrête le travail et nettoie seulement les fichiers
temporaires de cette tentative, sans bascule ni renommage du CRP V1. Désactiver ce
bouton pendant la courte bascule finale et le renommage, jusqu'à la fin de l'opération.

Après réussite : ouvrir directement le corpus V2 et fermer la fenêtre de migration.
Au plus, un message discret **« Votre corpus est prêt dans SonalPi2. »**
Aucun écran de résultats ni validation supplémentaire.

Les détails ne sont présentés que lorsqu'ils permettent une action : fichier
introuvable, destination indisponible, échec de copie ou renommage impossible.

## 4. Migration fiable sans infrastructure générale supplémentaire

- [x] Inventorier et valider les entretiens et médias référencés avant les écritures.
  Distinguer l'absence volontaire de média d'un fichier référencé mais introuvable.
- [x] En cas de source manquante ou illisible, indiquer les fichiers concernés et
  permettre de corriger puis réessayer ; ne pas créer silencieusement un entretien
  vide, ignorer un média ou annoncer une migration complète.
- [x] Demander que les applications utilisant la source V1 soient fermées.
  Revérifier les sources avant la validation finale ; refuser une source modifiée
  pendant la migration plutôt que mélanger plusieurs états.
- [x] Accepter uniquement une destination neuve ou vide, hors du dossier source,
  après résolution des liens symboliques. Ne plus proposer de confirmer l'utilisation
  d'un dossier non vide : cela ajoute un choix et complique les garanties de nettoyage.
- [x] Après confirmation, vider l'autosauvegarde du contexte courant avant de poursuivre.
- [x] Construire le corpus complet dans un dossier de préparation non actif.
  Ne plus ouvrir le nouveau store avant d'avoir importé les entretiens, copié les
  médias internes et validé les références conservées vers les médias externes.
- [x] Réutiliser les conversions existantes et les écritures atomiques. Prévoir une
  orchestration ciblée de migration, sans exposer d'accès générique au disque au renderer
  ni introduire un nouveau framework de tâches, de journaux ou de reprise automatique.
- [x] Classer les médias après normalisation des chemins et résolution des liens
  symboliques : comparer leur emplacement réel au dossier source réel, pas un simple
  préfixe de chaîne. Un média réellement interne est copié, même s'il est atteint
  par un alias extérieur ; un média réellement externe reste référencé en externe,
  sans conserver un chemin passant par un lien situé dans l'ancien dossier V1.
- [x] Ranger les seuls médias internes copiés dans un sous-dossier dédié de la V2.
  Copier en flux, gérer les noms identiques sans écrasement et réutiliser une copie
  lorsqu'un même fichier source est référencé plusieurs fois. Une correspondance en mémoire suffit.
- [x] Vérifier les copies terminées, les références externes conservées et la lisibilité
  du corpus avant la bascule. Les chemins des copies doivent viser l'emplacement
  final, pas le dossier temporaire ; les fichiers médias externes ne sont pas modifiés.
- [x] Prendre en charge l'annulation volontaire pendant la préparation et les copies.
  Attendre l'arrêt des écritures avant le nettoyage et libérer l'état occupé ensuite.
  Une nouvelle tentative doit être possible ; ne pas ajouter de pause/reprise persistante.
- [x] À la bascule, vider de nouveau l'autosauvegarde si nécessaire, fermer/publier
  l'ancien contexte par les transitions existantes, finaliser la destination, puis
  ouvrir la V2. Une sauvegarde ou fermeture refusée ne doit pas changer le corpus actif.
- [x] Renommer le CRP V1 seulement après réussite de cette ouverture. Vérifier que la
  source n'a pas changé et que le nom de sauvegarde est libre ; ne jamais écraser
  un fichier existant, y compris si une collision apparaît à la dernière seconde.
- [x] Si ce dernier renommage échoue, conserver la V2 valide et ouverte, et afficher
  une seule information utile : **« Le corpus SonalPi2 est prêt, mais le fichier V1
  n'a pas pu être renommé. Il reste ouvrable à son emplacement d'origine. »**
- [x] Sur échec antérieur, ne pas renommer le CRP V1. Nettoyer uniquement les fichiers
  de préparation appartenant à cette tentative ; ne jamais effacer un dossier utilisateur.
  Si un nettoyage échoue, indiquer où subsistent les fichiers incomplets.

## 5. Simplifier la réception des demandes d'ouverture

### À garder

- La reconnaissance V1/V2, la validation structurelle et l'ouverture stricte.
- L'ordre sauvegarde → fermeture/publication → finalisation → mise à jour de l'interface.
- La file de transitions main existante : elle protège les opérations sensibles.
- Le verrou d'instance par profil, les chemins canoniques et la protection des miroirs.
- Les arguments Windows/Linux, leur CWD émetteur, les URI `file:` et `open-file` macOS.
- L'abonnement aux demandes avant un signal explicite « interface prête ».
- La priorité du fichier demandé au démarrage, sans ouverture de secours en cas d'erreur.

### À remplacer par une règle simple

**Une ouverture ou une migration à la fois, sans file d'attente utilisateur.**

- [x] Remplacer `FileDemandesOuverture` par la mémorisation d'une seule demande initiale
  tant que l'interface n'est pas prête. Conserver la première, sans la remplacer
  silencieusement par une demande plus récente.
- [x] Utiliser un état transitoire commun « ouverture en cours », posé dès l'acceptation
  de la demande et libéré après réussite, annulation ou erreur, y compris pour les
  ouvertures applicatives, la migration et l'authentification distante.
- [x] Si une autre demande arrive pendant cette période, ne pas la conserver pour plus
  tard et ne pas interrompre l'opération. Remettre la fenêtre au premier plan et
  afficher une seule indication : **« Une ouverture est déjà en cours. Terminez-la,
  puis réessayez. »** Le même principe s'applique aux demandes supplémentaires au démarrage.
- [x] Supprimer les identifiants de demandes, l'IPC d'acquittement, la FIFO et la
  reprise d'une demande non acquittée après rechargement du renderer. Ne pas remplacer
  ces éléments par un autre protocole de réservation ou une file cachée.
- [x] Retirer la file générale d'ouvertures renderer devenue redondante ; ne pas
  supprimer pour autant les transitions main ni les jetons de préparation encore
  nécessaires à la validation avant sauvegarde et fermeture.
- [x] Garder seulement la reconnaissance du corpus déjà ouvert et la prévention des
  doubles clics pendant une opération ; pas de cache historique de déduplication.
- [x] Pour une action contenant plusieurs fichiers, traiter uniquement le premier
  avec une explication courte, sans enchaîner les autres corpus.

## 6. Fichiers et travaux concernés

- `src/renderer/components/MigrationCorpus.vue` : remplacer l'assistant détaillé par
  la fenêtre minimale, supprimer les listes et les bilans de réussites.
- Interface du corpus courant et `src/renderer/composables/sonal.ts` : ajouter
  l'action minimale de renommage et rafraîchir le nom affiché et les récents.
- `src/renderer/composables/sonal.ts` : ne plus activer une V2 partielle ; simplifier
  les ouvertures et conserver le blocage pendant migration/authentification.
- `src/main/migrationV1.ts` et `src/shared/migrationV1.ts` : préparation ciblée,
  copies annulables, contrôles des sources/destinations, contrat IPC borné à la
  tentative et renommage exclusif. Aucun registre persistant ni parseur HTML ajouté au main.
- `src/main/index.ts`, `src/main/transitionContexte.ts`, `src/main/corpusStore.ts` :
  construire et valider une cible non active, copier les médias internes uniquement,
  conserver les références externes, puis effectuer la
  transition et le renommage final du CRP source sans écrasement. Réutiliser aussi
  la mutation de `nom` pour le renommage du projet, sous transaction en distant.
- `src/main/demandesOuverture.ts`, `src/shared/ouvertureFichier.ts`,
  `src/preload/index.ts`, `src/renderer/env.d.ts` : réduire la réception et le contrat IPC.
- `src/shared/corpus/migrationCrp.ts` : conserver la conversion pure et les informations
  nécessaires à la validation ; préremplir le nom de migration à partir du fichier,
  sans réinterpréter un éventuel `nom` V1 comme une seconde identité à faire choisir.
  Ne pas confondre suppression d'un aperçu avec suppression de contrôles.
- Tests et documentation : actualiser les attentes devenues caduques, notamment
  « source jamais renommée », « média interne seulement référencé » et « demande suivante en attente ».

## 7. Ordre de réalisation et validation

1. Uniformiser le nom affiché et ajouter l'action « Renommer le corpus », sans modifier les chemins.
2. Simplifier les demandes d'ouverture en conservant les protections existantes.
3. Rendre la migration indépendante du dossier V1, conserver les médias externes
   à leur emplacement, permettre l'annulation de la préparation et différer la bascule jusqu'à sa validation.
4. Ajouter le renommage final du CRP V1, puis remplacer l'interface détaillée par le parcours minimal.
5. Actualiser tests et documentation, sans annoncer comme validées les plateformes non testées.

- [x] Tester le renommage du projet en local : en-tête et récents cohérents, nom
  conservé après réouverture, chemins du corpus et des médias inchangés.
- [x] Tester le renommage en distant : passage par la transaction existante, nom
  récupéré par un second poste après actualisation, URL et miroir inchangés ;
  un refus de verrou ou un échec réseau ne valide pas le changement de nom.
- [x] Tester annulation, nom vide et corpus ancien sans `nom`. Une simple ouverture
  ne doit pas écrire ce champ pour matérialiser le repli d'affichage.
- [x] Tester un V1 sans champ `nom`, ainsi qu'un fichier portant un `nom` différent
  de son nom de fichier : dans les deux cas, préremplir avec le nom du fichier sans
  extension. Un seul nom est demandé ; le résultat contient `corpus.crp`.
- [x] Tester médias internes, externes, partagés, homonymes, volumineux et accessibles
  par liens symboliques : les médias internes sont copiés ; les externes restent
  référencés et ne sont ni copiés ni modifiés.
- [x] Rendre le seul dossier V1 temporairement indisponible dans un test isolé :
  le texte V2 et les médias internes copiés restent lisibles, comme les médias
  externes dont l'emplacement n'a pas changé.
- [x] Tester qu'un média externe manquant bloque la migration autant qu'un média
  interne manquant. Un entretien sans média déclaré n'est pas un fichier manquant.
- [x] Tester l'annulation pendant une copie : arrêt effectif, nettoyage limité aux
  fichiers temporaires, sources et médias externes intacts, aucun renommage du CRP V1,
  ancien corpus toujours actif et nouvelle tentative possible.
- [x] Tester annulation, source absente/modifiée, destination non vide, manque d'espace,
  copie interrompue et fermeture de session refusée : pas de bascule vers un résultat partiel,
  pas de renommage V1 prématuré et pas de données utilisateur effacées.
- [x] Tester le succès du renommage, sa collision et son refus de permission. Vérifier
  que restaurer le nom initial permet encore l'ouverture V1 avec les sources conservées.
- [x] Tester la première demande avant disponibilité et le refus des suivantes,
  le refus pendant la modale de migration ou de renommage, puis une nouvelle
  tentative après annulation ou erreur. Rien n'est rouvert automatiquement après
  l'opération occupée. Le cas réel d'authentification distante reste à valider avec les bancs.
- [x] Conserver les tests de priorité au lancement, seconde instance par profil,
  chemins relatifs/accents, corpus déjà ouvert, autosave et refus d'un miroir en local.
- [x] Vérifier l'interface : une confirmation, une progression globale au besoin,
  ouverture directe après réussite ; aucune liste ni notification de réussites intermédiaires.

Exécuter les suites ciblées, puis `npm run typecheck`, `npm test`, `npm run build`
et `npm run test:e2e`. Rapporter séparément succès, échecs et tests sautés.
Les bancs Nextcloud existants utilisent uniquement `npm run nc:up` / `npm run nc-b:up`
si nécessaire : **aucun pull, téléchargement d'image ou reprovisionnement**.

## 8. Arbitrages confirmés avant réalisation

- **Source incomplète** : bloquer si un entretien ou un média référencé manque,
  qu'il soit interne ou externe. Corriger la source puis réessayer ; pas de migration partielle.
- **Médias** : copier uniquement les médias internes au dossier V1 ; les médias
  externes restent référencés à leur emplacement existant, sans copie supplémentaire.
- **Nom prérempli** : utiliser le nom du fichier `.crp` sans extension, modifiable
  dans l'unique champ. Aucun arbitrage entre nom interne et nom de fichier n'est demandé.
- **Annulation** : possible pendant la préparation, notamment la copie des médias
  internes ; désactivée pendant la courte bascule finale et le renommage du CRP V1.

Vérification dans le code V1 (`../SonalPi`) : `nouveauCorpus()` écrit bien un champ
`nom` à la création (`main.js`, objet `donneesInitiales`), mais la sauvegarde courante
reconstruit le JSON sans ce champ (`modules/gestion_corpus.js`, fonction de sauvegarde).
Ce n'est donc pas une identité interne fiable distincte du nom du fichier.
Le conserver dans un fichier historique ne doit ni modifier le préremplissage
retenu, ni ajouter une question à l'utilisateur.

Les arbitrages fonctionnels identifiés sont ainsi tranchés. Les validations sur
corpus V1 représentatifs, les données personnelles et les associations système
restent distinctes de l'implémentation et ne sont pas déclarées réalisées ici.
Les permissions et liens sont éprouvés sous Linux ; Windows/macOS et le retour
par l'application V1 elle-même restent à recetter. Un arrêt brutal peut laisser
une préparation non active, sans reprise automatique ni nettoyage aveugle au redémarrage.
