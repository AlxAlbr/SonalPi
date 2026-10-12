# Migration SonalPi1 → SonalPi2 — ajout de la carte GitLab

**Date :** 12 octobre 2026.  
**Statut :** plan demandé par l’utilisateur, à exécuter dans une nouvelle session. Aucun développement de cette migration GitLab ni transfert de données utilisateur n’a été lancé.

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

## 7. Ordre d’exécution dans la prochaine session

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

Le dépôt de travail est `/home/belignem/Vscode/SonalPiTestV2`. Il contient des modifications non commitées à conserver ; ne pas reset, commit ou push sans demande.

- Retrait de variante WebDAV terminé et activé : preuves documentées dans `plans/encours/pseudonymisation_v1_vers_v2.md` et `docs/dev/variantes-anon.md`.
- Vérifications complémentaires récentes : **164 tests/13 fichiers réussis**, typecheck/build/espaces vérifiés.
- Petit correctif de fusion déjà présent : `src/shared/entretien/fusion.ts` clone les locuteurs pour ne pas modifier les objets sources pendant une fusion ; assertions dans `test/e3b-fusion-reconciliation.test.ts`.
- Test supplémentaire de primauté du choix d’entretien : `test/pseudonymisationProjection.test.ts`.
- Aucun changement nécessaire à la mémoire/import V1 sur la base des vérifications récentes. Ne pas réintroduire `memoirePseudonymisation.ts`, une revue obligatoire d’export ou une promotion avec rattachement groupé.
- Documentation à mettre à jour lors de la livraison : `docs/user/migration-v1.md`, `docs/user/corpus-distant.md`, documentation GitLab/médias concernée, ce plan.

Ce plan constitue une **nouvelle demande fonctionnelle**, pas un audit restant de pseudonymisation. Il reste dans `plans/encours/` jusqu’à sa réalisation et à l’acceptation utilisateur.
