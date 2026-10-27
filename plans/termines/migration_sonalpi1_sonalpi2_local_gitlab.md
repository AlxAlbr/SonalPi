# Migration SonalPi1 → SonalPi2 — ajout de la carte GitLab

**Date initiale :** 12 octobre 2026. **Mise à jour :** 27 octobre 2026.
**Statut : clôturé avec accord utilisateur le 27 octobre 2026.** Qualification réelle effectuée et parcours GitLab **activé**, y compris la reprise et l’autorisation main. **8 scénarios réels réussis dans Electron**, puis **16 tests Electron réussis sur le build normal activé** (8 réels + 8 locaux/simulés), dont les cinq parcours Local existants. **915 tests / 54 fichiers réussis**, typecheck et build réussis. Les deux parcours proposent un bilan concis et conservent les documents non convertis dans `Autres/` ; la politique média Local reste inchangée. Documentation actualisée et plan archivé dans `plans/termines/`. Aucun corpus utilisateur transféré ou modifié.

**Contrainte initiale précisée par l’utilisateur :** le banc GitLab était sur un autre ordinateur ; avancer sans installer de banc ici ni déclarer une qualification non exécutée. Le 27 octobre, après demande de réaliser la qualification, les bancs existants sont accessibles sur ce poste : préparés avec `preparer_bancs_docker`, sans pull, installation ni reprovisionnement. Preuves et limites en section 11.

## 1. Demande utilisateur et périmètre

Dans l’entrée **« Migration SonalPi1 vers SonalPi2 »**, **ajouter uniquement la sous-carte GitLab et ses fonctionnalités**.

- **Local** : la carte et toutes ses fonctionnalités sont déjà implémentées. Les conserver telles quelles, sans les recréer, les refondre ou étendre leur comportement.
- **GitLab** : nouvelle carte pour migrer un corpus V1 depuis un dépôt GitLab vers un **nouveau dépôt GitLab vierge indiqué par la personne**.

Le plan ne comprend aucun développement du parcours Local. Les convertisseurs communs existants sont réutilisés par GitLab ; les contrôles du parcours Local sont uniquement des tests de non-régression.

Pour le parcours GitLab, le choix des médias est explicite :

1. Si la personne déclare un **espace média externe**, **copier** les médias vers cet espace et publier les références correspondantes dans le corpus V2.
2. Sinon, **copier** les médias dans le **nouveau dépôt GitLab V2**.

Ce n’est pas une simple conservation des anciennes adresses : les copies doivent réellement exister dans la destination choisie. Ne pas supprimer les originaux ni convertir le dépôt V1 sur place.

**Correction utilisateur importante :** la lecture se fait dans l’application et son lecteur est **déjà implémenté**. Ne pas développer un nouveau lecteur, une nouvelle interface audio/vidéo ou un nouveau moteur de lecture. Raccorder les fichiers copiés à la résolution et à la lecture existantes, puis vérifier le fonctionnement après migration.

La règle de copie ci-dessus concerne uniquement le nouveau parcours **GitLab**. La carte Local, ses textes, son parcours et sa politique média restent inchangés.

### Hypothèses convenues

- Les fichiers V1 sont supposés **bien formés**. Réutiliser les convertisseurs existants, sans nouveau système général de réparation ou de validation.
- Pour les pseudonymes réellement appliqués, **les décisions enregistrées dans l’entretien font foi**, pas une substitution par la première valeur de la définition corpus.
- Conserver les données du corpus et des entretiens selon leurs responsabilités actuelles : texte, positions, annotations, choix, exceptions, variantes locales déclarées, locuteurs, notes, commentaires, thèmes, variables et paramètres.
- L’export incomplet reste autorisé et le rapport de pseudonymisation facultatif.
- Les protections ordinaires contre un écrasement, une copie incomplète ou une répétition d’envoi restent nécessaires ; elles ne doivent pas créer une surveillance permanente de l’application.

### Hors périmètre

Création/refonte de la carte Local ou extension de ses fonctionnalités, migration inverse, archives ZIP, synchronisation permanente V1↔V2, déplacement/destruction des sources, reprise des comptes ou verrous V1, nouvelle mémoire de pseudonymisation, refonte des imports/exporteurs, moteur générique de migration, anonymisation des médias et copie de tout l’historique Git.

## 2. État de l’existant à réutiliser

### Migration et conversion

- `src/renderer/components/accueil/Accueil.vue` : entrée actuelle de migration.
- `src/renderer/components/accueil/MigrationCorpus.vue` : choix du `.crp`, aperçu, destination locale et confirmation.
- `src/renderer/composables/corpus/useOperationsCorpus.ts` : `migrerDepuisV1`, `importerEntretienV1`.
- `src/shared/corpus/migrationCrp.ts` : analyse et conversion des définitions, entretiens et paramètres.
- `src/renderer/formatSonal/importSonal.ts` et ses helpers : import des entretiens V1.
- `src/main/corpusStore.ts` : préparation de la migration et écriture native.
- `src/main/transitionContexte.ts`, IPC migration dans `src/main/index.ts`, preload et contrats renderer.

Ne pas recopier le client ou l’architecture V1. Les sources `../SonalPi/modules/gitlab_api.js` et les gestionnaires V1 sont des références de format. Leur client sait lire des objets LFS, mais ses choix de TLS et de transport ne sont pas à transplanter.

### GitLab

- Authentification et comptes existants : `src/main/gitlab/authentification.ts`, `oauth/`, coffre.
- Préparation et ouverture : `src/main/gitlab/{preparationProjet,ouverture}.ts`, `src/renderer/composables/corpus/useProjetGitLab.ts`.
- Lecture à un commit figé et pagination : `src/main/gitlab/lecture.ts`.
- Client, publication, limites et suivi existants : `client.ts`, `publication.ts`, `journalPublication.ts`, `bailGitLab.ts`, `limitesPublication.ts`.

**Écart concret connu :** `preparerProjetGitLab` refuse actuellement un dépôt sans branche par défaut et demande un README. Le nouveau parcours doit accepter un projet réellement vide et créer automatiquement la branche initiale nécessaire, sans demander une manipulation technique préalable. Ne pas changer implicitement les autres parcours GitLab.

### Médias et lecteur

- `src/main/corpusStore.ts` : `audiosResolus`, `cheminMediaAbs`, références distantes et copies miroir.
- `src/main/index.ts` : protocole `sonal-media`, préparation des médias et IPC existants.
- `src/main/medias/{baseMedia,designation,lectureDistante}.ts` : espace externe, résolution et relais existants.
- `src/main/distant/{miroir,transfert}.ts` : copie locale commune et contrat de transfert binaire.
- `src/main/webdav/lectureMedia.ts`, transferts WebDAV existants.
- `src/shared/format.ts` : `MetaEntretien`, `ReferenceMediaDistant`.

**Distinction à conserver :** le lecteur existe ; le raccordement des transferts et des références au stockage choisi doit être vérifié. Le miroir commun sait utiliser un transfert binaire injecté. Ne pas conclure qu’une copie dans GitLab serait déjà accessible sur un autre poste sans tester ce raccordement.

Les références neuves doivent distinguer sans ambiguïté **média dans le dépôt** et **média externe**. Les références historiques doivent continuer à fonctionner. Si le contrat actuel ne suffit pas, l’étendre au minimum, de façon additive et typée ; ne pas déduire la destination uniquement d’un fichier présent dans un cache ou de l’absence de configuration sur un poste.

## 3. Parcours utilisateur

### Entrée commune

Ajouter la sous-carte GitLab à côté de la carte Local déjà existante, avec une explication courte. Ne modifier ni la carte Local ni son parcours. Réutiliser les convertisseurs communs sans les dupliquer ni changer leurs résultats.

### GitLab

1. **Se connecter** avec les mécanismes GitLab existants.
2. **Indiquer le dépôt V1**. Utiliser sa branche par défaut ; si plusieurs `.crp` sont présents, faire choisir le corpus, sans les fusionner. Ne demander une branche alternative que si un besoin réel est constaté.
3. **Indiquer le dépôt V2 vierge**, différent de la source. Le projet est fourni par la personne ; SonalPi ne crée pas un projet dans un groupe ou une organisation.
4. **Médias** : proposer « Copier les médias dans un espace externe ». Si activé, réutiliser la déclaration de base média externe existante. Sinon, afficher clairement « Les médias seront copiés dans le nouveau dépôt GitLab ».
5. **Afficher un bilan** : source, destination, nombre d’entretiens et médias, volume de copie lorsqu’il est connu, emplacement final des médias. Préparation sans publication.
6. **Confirmer la migration**, montrer une progression courte puis ouvrir le corpus V2 et l’ajouter aux destinations/récents existants.

Les étapes techniques ne demandant aucun choix sont automatiques. Aucun vocabulaire de verrous, ETags ou journaux dans le texte principal. Les détails de dépannage restent facultatifs et repliés.

La cible doit être vierge de données de corpus. Accepter un projet réellement vide et un projet simplement initialisé par des fichiers techniques usuels (README, licence, `.gitignore`, attributs Git), sans les effacer ni les remplacer silencieusement. Un corpus, entretien, média ou autre contenu utilisateur préexistant n’est pas assimilé à une cible vierge. Vérifier cette condition à la préparation puis avant publication ; ne pas ajouter de confirmation pour une initialisation technique ne demandant aucun choix.

## 4. Lecture de la source et conversion

- Résoudre une fois le commit source pour lire le `.crp` et les `.Sonal` de façon cohérente.
- Lire sans modifier le dépôt, ses fichiers, ses attributs ou ses verrous.
- Réutiliser le décodage et les conversions actuels. Préserver l’identité du corpus et les traces source utiles, sans publier de secret.
- Réutiliser le DOM/import existant : choisir son lieu d’exécution en fonction de ce qui est déjà disponible, sans nouvelle bibliothèque HTML par défaut.
- Résoudre les véritables contenus des `.Sonal` stockés sous Git LFS. Ne pas importer un pointeur LFS comme une transcription.
- Inventorier seulement les médias référencés par le corpus choisi, pas tous les binaires du projet. Un même fichier utilisé par plusieurs entretiens n’est copié qu’une fois lorsque cette identité est prouvée.
- Résoudre les chemins relatifs au dossier du `.crp`. Une source bien formée peut malgré tout référencer un média situé hors du dépôt ou inaccessible depuis ce poste : le signaler, proposer de fournir le fichier/accès, ou arrêter proprement. Ne pas remplacer une erreur réseau par un entretien vide.
- Les fichiers binaires ne passent pas par un décodeur texte. Vérifier que les fichiers copiés correspondent aux fichiers sources.

## 5. Copie des médias et références

### Destination externe déclarée

- Réutiliser l’espace média Nextcloud/WebDAV actuellement proposé par l’application et ses accès.
- Copier dans un sous-dossier dédié à cette migration, avec chemins déterministes ou scellés pendant la préparation.
- Ne jamais écraser un fichier existant différent. Reconnaître une copie acquise seulement sur une preuve de contenu suffisante.
- Enregistrer dans les entretiens V2 des références relatives à cette base, sans mot de passe ni URL temporaire.
- Réutiliser le coffre/configuration de base par poste. Vérifier l’accès après réouverture et sur un deuxième profil équipé des accès nécessaires.

### Destination dans le nouveau dépôt GitLab

- Définir un dossier média dédié, par exemple `medias/`, et des chemins stables évitant les collisions de noms entre dossiers sources.
- Réutiliser autant que possible les transports binaires et la copie miroir existants. Ajouter seulement le connecteur GitLab qui manquerait, pas un autre lecteur.
- Ne pas placer les octets d’un gros audio/vidéo dans une requête JSON/base64 géante. Le client de documents actuel est borné et n’est pas un transport de gros médias.
- Choisir un mode de stockage GitLab compatible avec les tailles réellement rencontrées et démontré sur le banc. Git LFS est à utiliser si nécessaire ; les fichiers JSON natifs restent dans leur stockage V2 actuel. Ne pas créer simultanément plusieurs moteurs de transfert ou des seuils arbitraires.
- Si LFS est utilisé : transfert binaire réel, vérification des objets, pointeurs corrects et attributs limités au dossier média. Une simple règle `.gitattributes` ne constitue pas une copie de l’objet.
- Ajouter le raccordement permettant au miroir/cache de retrouver ces médias et au **lecteur existant de l’application** de les jouer. Aucun chemin absolu du poste migrateur ne devient la référence partagée.
- Vérifier que la lecture fonctionne aussi sur un profil neuf qui ne dispose d’aucun fichier source local.

### Dans les deux cas

Copie progressive et mémoire bornée, progression par étapes/fichiers, pas de boucle permanente de contrôle. Pendant l’opération, annulation aux frontières sûres : arrêter les prochains transferts, sans supprimer les sources ni annuler aveuglément les copies déjà acquises.

## 6. Publication et interruption — solution minimale

La copie des médias et la publication du corpus ne sont pas une transaction unique, surtout avec un espace externe.

- Préparer les conversions avant de publier des références qui doivent être utilisables.
- Copier et confirmer les médias avant de déclarer la migration terminée. Ne pas annoncer un corpus complet avec des médias manquants.
- Réutiliser le publieur et ses gardes pour les métadonnées ; respecter ses limites de taille/actions. Ne pas transposer ces plafonds aux fichiers binaires.
- Recontrôler la destination avant le premier envoi. Utiliser les créations conditionnelles disponibles ; ne pas écrire sur un fichier créé entre-temps par quelqu’un d’autre.
- Pour une migration tenant dans une publication, préférer la publication groupée existante ; ne pas ajouter une nouvelle orchestration multi-étapes sans besoin.
- Pour les migrations nécessitant plusieurs publications, conserver un suivi local minimal : source figée, destination, correspondance des identifiants/chemins, fichiers confirmés et éventuelle intention d’envoi inconnue. Réutiliser les mécanismes de stockage durables existants ; pas de famille de journaux par type de donnée.
- Après interruption, reconnaître les copies/publications acquises et reprendre ce qui reste avec confirmation claire. Une réponse perdue n’autorise pas une répétition aveugle.
- Une cible partiellement créée par cette migration n’est plus vierge, mais peut être reprise si son identité et sa progression sont prouvées. Toute autre cible non vide reste refusée.
- Pas de suppression automatique pour « revenir en arrière », de vol de droits ou de restauration historique. Les problèmes d’accès restent expliqués simplement.
- Les sources et destinations sont liées au contexte préparé ; changer de corpus/compte pendant l’opération ne doit pas appliquer les résultats à une autre destination.

Le détail technique de ces contrôles doit rester proportionné. Ne pas construire un framework de migration ni recopier les protocoles complets de renommage/retrait de variantes.

## 7. Ordre d’exécution initial

Les étapes d’implémentation ci-dessous sont désormais largement réalisées. Pour reprendre le chantier, suivre le bilan et les tâches restantes de la section 10, sans reconstruire les raccordements déjà présents.

1. **Relire ce plan et l’existant** : cartographier uniquement les raccordements manquants, confirmer les contrats médias et le traitement des dépôts sans branche.
2. **Ajouter uniquement la sous-carte GitLab** à côté de Local, déjà implémentée, et préparer le nouveau parcours GitLab avec bilan sans publication.
3. **Développer en un lot cohérent** lecture/conversion, copie des médias vers les deux destinations, références, publication et réouverture. Garder la nouvelle action inactive tant que ses parcours réels ne sont pas qualifiés.
4. **Tester les composants modifiés pendant le développement**. Corriger les défauts reproduits ; ne pas refaire les imports déjà éprouvés.
5. **Qualifier de bout en bout**, puis activer l’action et mettre à jour les guides avec les résultats réels.

Pas de petites livraisons suivies à chaque fois de toute la suite. Tests ciblés pendant le travail, puis campagne consolidée des chemins modifiés. Pas de qualification Windows, charge maximale, instance institutionnelle ou anciens clients imposée par ce plan.

## 8. Vérifications et critères d’acceptation

### Conversion et fidélité

- `.crp` et `.Sonal` bien formés, dont variantes, alias, annotations imbriquées, exceptions et locuteurs sans tour de parole.
- Pseudo mémorisé dans l’entretien conservé même si la définition corpus est différente.
- Conservation du texte, des positions, des notes/commentaires, des variables et des déclarations locales.
- Source GitLab inchangée ; pas de copie de son historique ou de ses comptes.
- Non-régression uniquement : carte Local et migration locale existantes inchangées et toujours utilisables.

### Copies et lecture

- Destination externe : copies réelles, références correctes et lecture dans l’application.
- Sans espace externe : copies réelles dans le nouveau dépôt, lecture depuis l’application sur profil neuf, déplacement dans l’audio et vidéo lorsque le format est pris en charge actuellement.
- Médias utilisés plusieurs fois, noms identiques dans des dossiers différents, caractères accentués et fichier assez grand pour éprouver le transfert binaire plutôt qu’un envoi texte.
- Source `.Sonal`/média LFS, si présent dans les corpus V1 pris en charge : lire les objets réels, pas les pointeurs.
- Aucun écrasement dans la destination externe ; aucun accès secret incorporé aux fichiers publiés.

### Publication et reprise

- Projet sans branche initiale accepté, branche créée automatiquement.
- Projet simplement initialisé par un README accepté sans suppression de celui-ci ; aucun corpus ni média préexistant écrasé.
- Source et cible identiques, cible contenant des données utilisateur ou cible modifiée depuis l’aperçu : refus avant écrasement.
- Annulation du bilan : zéro publication/copie.
- Interruption pendant une copie et après une publication acceptée : progression conservée, aucune annonce de réussite complète ni répétition aveugle.
- Réouverture avec nouveaux accès : corpus et médias utilisables sans dépendre du profil migrateur.
- Au moins un arrêt réel de l’application pendant une migration engagée, avec réouverture et reprise contrôlée.
- Le suivi se lit aux actions pertinentes, pas toutes les secondes ; aucune vérification de migration au repos hors d’une opération en attente.

### Bancs

Utiliser des dépôts V1/V2, profils et dossiers médias **synthétiques isolés**. Avant les tests réels, appeler `preparer_bancs_docker` pour GitLab et le ou les bancs Nextcloud nécessaires. Pas de pull d’images, provisioning ou boucles de readiness maison. Ne pas arrêter les bancs réutilisables.

Qualifier sur GitLab réel les deux choix de destination média, plus les corrections/reprises concernées. Rapporter honnêtement les échecs, filtrages et limites ; une copie correcte ne suffit pas à prouver la lecture sur un autre profil.

## 9. Contexte de reprise et travaux déjà présents

Le dépôt de travail de cette session est `/home/belignem/Vscode/sonalpitestv2`. Il contient des modifications non commitées et des fichiers nouveaux à conserver ; ne pas reset, commit ou push sans demande.

- Retrait de variante WebDAV terminé et activé : preuves documentées dans `plans/encours/pseudonymisation_v1_vers_v2.md` et `docs/dev/pseudonymisation/corpus.md`.
- Vérifications complémentaires récentes : **164 tests/13 fichiers réussis**, typecheck/build/espaces vérifiés.
- Petit correctif de fusion déjà présent : `src/shared/entretien/fusion.ts` clone les locuteurs pour ne pas modifier les objets sources pendant une fusion ; assertions dans `test/e3b-fusion-reconciliation.test.ts`.
- Test supplémentaire de primauté du choix d’entretien : `test/pseudonymisationProjection.test.ts`.
- Aucun changement nécessaire à la mémoire/import V1 sur la base des vérifications récentes. Ne pas réintroduire `memoirePseudonymisation.ts`, une revue obligatoire d’export ou une promotion avec rattachement groupé.
- Documentation à mettre à jour lors de la livraison : `docs/user/migration-v1.md`, `docs/user/corpus-distant.md`, documentation GitLab/médias concernée, ce plan.

Ce plan constitue une **demande fonctionnelle distincte**, pas un audit restant de pseudonymisation. Réalisé et accepté, il est archivé dans `plans/termines/`.

## 10. Avancement sans banc — bilan historique et clôture des tâches

Les sections 10.1 à 10.3 décrivent l’état antérieur à la qualification réelle du
27 octobre. La section 11 et le statut en tête donnent l’état actuel.

### 10.1. Réalisé : préparation et données

- [x] Sous-carte GitLab et modale dédiées ; carte, modale et politique média Local conservées.
- [x] Authentification existante, découverte des `.crp` au commit source figé, sélection d’un corpus sans fusion et refus source/cible identiques.
- [x] Choix d’un projet déjà enregistré ou d’une nouvelle adresse, réutilisation des accès OAuth/jeton sans nouvelle saisie. Pour une source connue, compte, projet, branche et racine retrouvés dans le coffre côté main ; aucun autre compte choisi silencieusement, aucune ouverture ni modification du corpus enregistré.
- [x] Cible réellement vide ou initialisée uniquement par des fichiers techniques usuels acceptée ; données utilisateur préexistantes refusées.
- [x] Bilan des entretiens et des seuls médias référencés, dédoublonnage des références résolues, taille et SHA-256, chemins scellés et invalidation des réponses tardives.
- [x] Lecture des octets et décodage existant ; `.Sonal` et médias LFS résolus vers leur contenu réel. Références hors dépôt ou inaccessibles refusées, sans entretien vide de remplacement pour une erreur réseau.
- [x] Conversions SAS/DOM conservées dans une préparation privée avec `CorpusStore`, sans ouvrir le corpus ni ajouter de récent pendant le bilan. Chaque conversion est liée à un `bilanId`, distinct de l’identifiant de découverte.
- [x] Transfert GitLab binaire en flux et client LFS ; copies WebDAV conditionnelles et relecture de confirmation. Les copies existantes différentes ne sont pas écrasées.
- [x] Références explicites `gitlab` / `webdav`, résolution historique conservée, miroir et lecteur existants raccordés. Un cache homonyme ne transforme pas un média externe en média du dépôt ; aucun nouveau lecteur créé.

### 10.2. Réalisé : opération, publication et reprise

- [x] `ServiceMigrationGitLab` relie préparation, conversion privée, confirmation, copie, publication et réouverture ; IPC, preload et composable renderer raccordés.
- [x] `OperationMigrationGitLab` copie et confirme les médias avant de publier les références. Les contenus natifs et leurs identifiants sont figés localement avant le premier transfert.
- [x] Initialisation automatique prévue sur `main` pour un dépôt sans branche, par le premier commit de coordination ; branche par défaut conservée pour une cible déjà initialisée. Le comportement des autres parcours de création GitLab n’est pas changé.
- [x] Recontrôle de la destination avant copies et publications, à chaque tentative d’envoi et avant ouverture d’une migration en attente. Les fichiers techniques initiaux restent inchangés ; créations natives conditionnelles, sans remplacement de données utilisateur.
- [x] Publieur, droits et limites existants réutilisés. Publication groupée lorsqu’elle tient ; fractionnement seulement si nécessaire, avec `corpus.json` publié en dernier. Attributs LFS limités à `medias/.gitattributes` ; JSON natifs hors LFS.
- [x] Un suivi local de migration dans le profil, complété par le `JournalPublicationGitLab` existant pour les candidats d’envoi. Il conserve source, cible, chemins/identifiants, empreintes, copies confirmées, lots publiés et éventuelle intention inconnue ; pas de journal par type de donnée.
- [x] Reprise explicite depuis les contenus privés conservés, sans reconstruire les identifiants. Réconciliation d’un envoi accepté à réponse perdue ; pas de relance aveugle. Une reprise d’envoi déclaré absent neutralise l’ancienne tentative avant de refaire des créations conditionnelles.
- [x] Nouvelle session empêchée de reprendre un droit précédent encore actif. Reprise liée au poste, au compte, à la destination et à la branche enregistrés ; suivi illisible ou incohérent refusé.
- [x] Configuration média externe stockée uniquement dans le coffre du poste. Destination enregistrée après confirmation pour permettre la reprise ; récents ajoutés par l’installation finale existante, pas par le bilan.
- [x] Ouverture via `ServiceOuvertureGitLab`, puis application du résultat dans le cycle de corpus existant. Les médias du dépôt inaccessibles empêchent l’installation d’une migration ; un échec d’ouverture reste réessayable sans republier les métadonnées.
- [x] Progression et arrêt aux frontières sûres ; copies acquises conservées, sans suppression des originaux ni retour arrière automatique.
- [x] Annulation finale raccordée et testée : signal transmis à la vérification finale et à la préparation du miroir, arrêt avant le fichier suivant et absence d’installation tardive. La reprise de l’ouverture ne copie ni ne publie à nouveau ; un arrêt reçu après réussite ne bloque pas une réouverture suivante. La fermeture de la modale demande l’arrêt et ignore les réponses tardives.
- [x] Action toujours désactivée dans l’interface, y compris la reprise ; blocage côté main avant toute exécution publique. L’autorisation interne utilisée par les tests isolés n’active pas le parcours dans l’application.

### 10.3. Vérifications réellement effectuées

**Dernière campagne consolidée : 850 tests / 49 fichiers réussis**, uniquement sur transports simulés et fichiers synthétiques. Elle inclut les tests GitLab hors qualification réelle, la préparation renderer, la migration `.crp` locale, les commentaires, la projection de pseudonymisation et la lecture WebDAV existante.

Commande de la campagne :

```sh
npx vitest run test/gitlab test/migrationCrp.test.ts test/migrationGitLabRenderer.test.ts test/projetGitLabRenderer.test.ts test/pseudonymisationProjection.test.ts test/commentairesMigration.test.ts test/webdav/lectureMedia.test.ts --exclude '**/qualification*.test.ts' --exclude '**/contrat-gitlab.test.ts'
```

Cette campagne couvre notamment :

- copie de plusieurs Mio vers les deux destinations simulées, références partagées et homonymes ;
- conservation des fichiers techniques, de la source et des identifiants après reprise ;
- publication fractionnée, interruption après un premier lot et métadonnées finales publiées en dernier ;
- réponse perdue après acceptation, absence de réenvoi automatique et reprise contrôlée ;
- refus d’une cible modifiée, d’un contenu privé altéré ou d’un ancien bilan ;
- reprise sur une nouvelle instance du service avec octets déjà conservés et source devenue inaccessible ;
- protection contre une reprise de droit encore actif, ouverture échouée sans republication et non-installation avec médias du dépôt manquants ;
- contrôle de confirmation et conservation des conversions côté renderer ; références média historiques et non-régression Local ;
- annulation pendant le miroir avant le média suivant et sans installation partielle ;
- annulation pendant la préparation d’ouverture, sans fermeture ni remplacement du contexte courant ;
- transmission de l’arrêt à l’ouverture, reprise sans copie/publication supplémentaire, et réouverture après arrêt tardif ;
- fermeture du formulaire avec arrêt de l’opération, retrait de l’écoute et ignorance des réponses tardives.

La campagne ciblée d’annulation a réussi : **46 tests / 4 fichiers** (`miroirMedias`, `ouverture`, `serviceMigration`, `migrationGitLabRenderer`). La campagne consolidée de **831 tests / 49 fichiers**, `npm run typecheck`, `npm run build` et `git diff --check` ont ensuite réussi sur le dernier état. Les cinq tests d’annulation supplémentaires portent la campagne précédente de 826 à 831 tests.

Correctif d’affichage ultérieur : le voile de `MigrationGitLab.vue` reçoit le même positionnement fixe et centré que les autres modales. **Un test Electron local réussi** dans `e2e/migration-v1.e2e.ts` vérifie le centrage et la couverture de la fenêtre en 1000×800 et 640×480, puis la fermeture. Build, typecheck et contrôle des espaces réussis après ce correctif. Ce test ne se connecte à aucun serveur et ne qualifie pas la migration réelle ; la campagne de 831 tests n’a pas été relancée pour ce seul changement CSS.

Après ajout du choix d’une source déjà enregistrée : **850 tests / 49 fichiers réussis** sur la même commande consolidée, soit 19 tests supplémentaires sur la réutilisation OAuth/jeton, les accès manquants ou refusés, le compte imposé, les réponses tardives et la branche/racine du coffre. Typecheck, build et contrôle des espaces réussis.

**8 tests Electron locaux réussis** avec `npx playwright test e2e/migration-v1.e2e.ts --project=local --workers=1` : centrage de la modale, deux parcours de sélection d’un projet connu (OAuth et jeton, réponses IPC simulées), retour à une nouvelle adresse et cinq scénarios Local existants. Ces deux tests GitLab ne contactent aucun serveur et ne qualifient ni les credentials réels ni la migration distante. Un premier essai à deux workers a rencontré deux fermetures inattendues d’Electron, dont une avec `Failed to shutdown` ; la relance complète à un worker a réussi. Aucun changement du harnais ni du parcours Local pour contourner cet incident.

La première campagne de 300 tests / 20 fichiers portait sur les primitives et les raccordements initiaux ; les campagnes consolidées étendent ces contrôles à l’orchestration et à l’annulation finale. Elles ne constituent pas une migration qualifiée de bout en bout dans Electron sur GitLab réel.

**À la date de ce bilan simulé, aucune qualification réelle n’avait été exécutée.** Le banc GitLab restait sur l’autre ordinateur. L’ancienne tentative de préparation locale échouait faute de `~/TestGitlabLocal/qualification.env` ; aucun banc installé, image téléchargée ou volume reprovisionné. Aucun banc réel n’a été lancé pour cette campagne simulée.

### 10.4. Suivi des tâches — terminé

1. [x] **Terminer la couverture de l’annulation finale** : cinq tests dédiés ajoutés aux fichiers existants, sans nouvelle fonctionnalité ni refonte des parcours. Arrêt du miroir, non-installation tardive, fermeture du formulaire, reprise sans republication et arrêt après réussite couverts.
2. [x] **Relancer les vérifications sur le dernier état** : tests ciblés, campagne consolidée de 850 tests, typecheck, build et contrôle des espaces réussis.
3. [x] **Actualiser les autres documents** : `docs/dev/migration-gitlab-v1.md`, `docs/user/migration-v1.md`, `docs/user/corpus-distant.md` et l’entrée de `docs/dev/gitlab.md` décrivent maintenant le parcours raccordé, ses protections et ses limites, sans le présenter comme activé ou qualifié.
4. [x] **Qualifier sur des données synthétiques isolées** : réalisé le 27 octobre avec les bancs existants désormais accessibles sur ce poste ; huit scénarios réels réussis, voir section 11 :
   - cible sans branche et cible avec README/attributs techniques conservés ; refus source=cible, cible occupée et cible modifiée ;
   - copies réelles vers GitLab/LFS et vers Nextcloud/WebDAV, médias réutilisés, homonymes, accents et gros binaire ; `.Sonal` et média source LFS ;
   - fidélité des conversions, dont choix de pseudonymes mémorisés, alias, exceptions, variantes locales et locuteurs sans tour de parole ;
   - ouverture dans l’application puis sur un **profil neuf sans sources locales**, accès externes déclarés sur ce profil, audio/vidéo et navigation temporelle dans le lecteur existant ;
   - au moins un **arrêt réel de l’application pendant une migration engagée**, reprise depuis le suivi local, interruption pendant copie et après publication acceptée, sans duplication ni annonce de réussite avec médias manquants.
   `preparer_bancs_docker` appelé pour GitLab et Nextcloud A avant la campagne. Aucun banc installé, aucune image téléchargée ni volume reprovisionné.
5. [x] **Après ces preuves seulement**, résultats et limites consignés, action et autorisation main activées, guides mis à jour. La campagne réelle et locale repasse sur le build normal activé.
6. [x] **Recueillir l’acceptation utilisateur** : accord de clôture reçu le 27 octobre 2026 ; plan archivé dans `plans/termines/`.

### 10.5. Limites et précautions de reprise

- Les actions LFS vers une autre origine restent refusées ; le stockage objet externe d’une instance institutionnelle n’est pas couvert. Ne pas élargir ce chantier sans besoin constaté.
- Les documents V1 et publications gardent les bornes existantes ; les médias sont streamés sans plafond JSON. Un document natif individuel trop gros est refusé, pas découpé arbitrairement.
- Les contrôles de cible et les gardes de fichiers ne sont pas une transaction globale GitLab + WebDAV. Une interruption conserve les copies confirmées ; aucun nettoyage distant automatique pour annuler l’opération.
- La reprise repose sur les fichiers privés conservés dans le profil du poste. Ouvrir un corpus publié sur un profil neuf ne signifie pas transporter son suivi de migration vers un autre poste.
- Aucun commit, push ou reset effectué. Conserver l’arbre de travail existant, y compris les modifications qui ne proviennent pas de cette migration.

**Fichiers principaux pour reprendre :** `src/main/gitlab/{migration,operationMigration,suiviMigration,documentsMigration,preparationMigration,copieMediasMigration}.ts`, `src/renderer/composables/corpus/useMigrationGitLab.ts`, `src/renderer/components/accueil/MigrationGitLab.vue`, `src/main/gitlab/ouverture.ts` et les tests `test/gitlab/{operationMigration,serviceMigration}.test.ts`. Pour l’annulation finale, examiner aussi `src/main/distant/miroir.ts` et `src/main/gitlab/contexte.ts`.

## 11. Qualification réelle et activation — 27 octobre 2026

**Preuves détaillées :** [recette réelle](../../docs/dev/migration-gitlab-v1-qualification.md).
Tests : `e2e/migration-gitlab.e2e.ts`, harnais dans `e2e/qualification/{migration,sondeMigration}.ts`.

- [x] GitLab CE 18.11.0 et Nextcloud A existants préparés avec l’outil prévu.
- [x] Huit scénarios réels réussis : dépôt sans branche ; README/attributs conservés ;
  copies GitLab/LFS et WebDAV ; gardes et annulation ; collision externe conservée ;
  SIGKILL pendant copie WebDAV ; SIGKILL pendant ouverture après publication GitLab ;
  réponse perdue ; 251 entretiens publiés en deux lots avec reprise sans répétition.
- [x] Fidélité : texte et positions, commentaires, notes, choix Claire/Rebecca,
  exception, alias, déclarations locales/variantes, thèmes/variables propres au `.Sonal`,
  valeurs d’un locuteur sans tour de parole et références de règles valides.
- [x] `.Sonal` et médias source réellement LFS, médias réutilisés, homonymes, accents,
  WAV de deux minutes supérieur à 11 Mo, vidéo WebM ; copies relues et SHA-256 comparés.
- [x] Lecture audio/vidéo du dépôt et navigation temporelle dans le lecteur existant,
  puis sur profil neuf sans sources ni cache de migration. Audio WebDAV également lu
  après déclaration des accès dans le profil neuf.
- [x] Activation de `MIGRATION_GITLAB_QUALIFIEE`, carte mise à jour, formulaire fermé
  après réussite et avertissement préalable pour les vidéos externes.
- [x] Build normal activé : 16 tests Electron réussis, dont les huit réels et les
  huit locaux/simulés existants. Campagne consolidée : 864 tests / 50 fichiers réussis.
- [x] Guides utilisateur, documentation développeur et présent plan actualisés.
- [x] Acceptation utilisateur : accord de clôture du 27 octobre 2026.

Les essais réels ont nécessité des correctifs ciblés : traitement d’un dépôt vide
annonçant déjà une branche ; liens vers les règles après fusion ; transmission des
thèmes et variables propres aux entretiens ; utilisation du chemin média effectif ;
fermeture du formulaire après succès. Les convertisseurs communs et le parcours Local
n’ont pas été refondus. Les premiers échecs de recette sont décrits dans le compte rendu,
pas comptés parmi les scénarios réussis.

**Limites :** la vidéo WebDAV est copiée mais sa lecture distante n’est pas prise en
charge par le lecteur actuel ; le bilan le signale avant confirmation. Audio WebDAV
et vidéo du dépôt sont qualifiés. Connexion réelle par jeton ; pas de nouvelle preuve
OAuth réelle propre à la migration. Pas de qualification institutionnelle, Windows,
charge maximale, quota réel, empaquetage ou stockage LFS sur une autre origine.
L’arrêt après publication arrive après libération du droit ; le refus de reprise
pendant un droit encore actif reste couvert par les tests simulés.

Aucun commit, push ou reset effectué ; modifications préexistantes conservées.
Les sources et destinations distantes synthétiques restent disponibles pour inspection.

## 12. Extension demandée : bilan concis et documents « Autres »

Après la première qualification, l’utilisateur demande explicitement de simplifier
le parcours Local comme GitLab et de conserver les documents non convertis. Cette
nouvelle demande autorise l’évolution Local jusque-là hors périmètre ; elle ne
change pas la politique de ses médias, toujours référencés sans copie.

- [x] Référence V1 vérifiée : `.out`, `.lem`, `.cnct` sont des réglages ; `.lexaf.json`
  est un résultat. Réglages reconnus convertis, résultats anciens conservés bruts.
- [x] Composant de bilan commun, listes repliées, avertissements visibles et confirmation
  explicite des documents conservés et des éléments non repris.
- [x] Inventaire limité au dossier du `.crp` choisi et à ses descendants ; références
  identifiables des autres corpus, fichiers techniques et noms d’accès connus écartés.
  Cas de plusieurs corpus signalé avant confirmation ; aucune prétention à détecter
  tous les secrets contenus dans des documents ou archives.
- [x] Local : identité du bilan liée à la source/destination, relecture avant création,
  copies binaires vérifiées, liens non suivis, dossier `Autres` créé sans remplacement.
  Préparation retirée sans installation si la fermeture du contexte courant échoue.
- [x] GitLab : documents conservés sous `Autres/` dans le dépôt, même avec médias
  WebDAV ; flux/LFS existants réutilisés, suivi durable enrichi, publications conditionnelles,
  corpus final en dernier et confirmations avant annonce de réussite.
- [x] Cas GitLab non UTF-8 corrigé : vérification des octets bruts contre l’objet Git,
  puis SHA-256 réel, sans se fier à des métadonnées texte réencodées.
- [x] 915 tests / 54 fichiers réussis, typecheck et build réussis ; 16 tests Electron
  réussis, dont les huit scénarios GitLab/Nextcloud réels étendus aux documents supplémentaires.
- [x] Guides actualisés et [compte rendu commun](../../docs/dev/migration-conservation.md).
- [x] Acceptation utilisateur du bilan et du périmètre documentaire : accord de clôture du 27 octobre 2026.

Les copies brutes ne deviennent pas des analyses utilisables dans SonalPi2. Les
médias Local ne sont pas copiés ; les vidéos WebDAV restent copiées mais non lisibles
à distance avec le lecteur actuel. Aucun corpus utilisateur, commit ou push.

## 13. Clôture et clarification Lexico

Le 27 octobre 2026, l’utilisateur confirme : « il me semble qu’on peut clore ce projet ».
Cet accord clôt le périmètre livré : migration GitLab, bilan commun Local/GitLab et
conservation des documents non convertis. Il ne constitue pas une nouvelle campagne
de tests ni une migration de données utilisateur.

La relecture finale du code V1 précise le rôle de `.lexaf.json` : il provient du
prototype d’analyse factorielle dont le bouton n’est pas ajouté à l’interface.
La commande « Relire JSON » de ce prototype affiche le texte du fichier, sans
restaurer l’analyse ni ses sélections. Les chiffres enregistrés permettent de
reconstruire le tableau sauvegardé, mais ne garantissent pas de retrouver les filtres
et les passages sources. Ce n’est pas une sauvegarde normalement réouverte par les
utilisateurs de cette V1. Sa conservation dans `Autres/` reste une précaution ; aucun
nouvel importeur de résultats ni graphique factoriel n’entre dans cette livraison.

Les limites explicites des sections 11 et 12 restent documentées, sans être présentées
comme des fonctionnalités réalisées. Aucun autre plan n’est clôturé par cet accord.
