# Plan — corpus.crp et ouverture depuis le système

## 1. Objectif et contexte

Remplacer le fichier natif V2 `corpus.json` par `corpus.crp`, sans modifier son contenu JSON, puis permettre son ouverture dans SonalPi2 depuis l'explorateur de fichiers.

L'application n'est pas distribuée. Les seuls corpus V2 existants appartiennent au développeur et peuvent être renommés ou recréés manuellement. Il n'est donc pas nécessaire de développer une migration automatique, une lecture de secours de `corpus.json` ou une période de double écriture.

La V1, dans `../SonalPi`, utilise déjà `.crp`, mais avec une structure JSON différente. Sa configuration `electron-builder` déclare les associations de fichiers ; son `main.js` traite les arguments de lancement et l'événement macOS `open-file`. Ces éléments servent de référence, pas de code à recopier sans adaptation.

Ce document est un plan d'exécution. Les étapes 2 à 6 sont implémentées, ainsi que
la configuration multiplateforme de packaging et les tests/documentations associés.
La bascule manuelle des données utiles (étape 1), la validation des serveurs réels
et la recette des associations installées restent à faire. Aucun double-clic
après installation n'est encore annoncé comme validé.

### État de validation

- `npm run typecheck` : succès.
- `npm test` : 715 tests réussis, 21 sautés (52 fichiers réussis, 6 sautés).
- `npm run build` : succès.
- `npm run test:e2e` : 90 tests réussis, 7 sautés. Après le dernier durcissement
  de validation des identifiants, les 8 parcours d'ouverture sont rejoués avec
  succès, y compris le paquet Linux reconstruit.
- Suites ciblées stockage/transactions/WebDAV : 217 tests réussis avant ajout des
  tests d'ouverture. Les nouvelles suites couvrent classification, noms, encodage,
  stores stricts, suppression, miroirs, arguments, file, acquittement, priorité au
  démarrage, autosave, migration annulée/confirmée et seconde instance réelle.
- Linux x64 / WSLg : application non installée et DEB construits avec la
  distribution Electron existante (`--config.electronDist=node_modules/electron/dist`).
  Le paquet non installé est lancé par un test E2E ; les fichiers desktop, MIME,
  scripts d'installation et ressources de démo du DEB ont été inspectés, sans
  installer le paquet. Windows/macOS et les associations installées ne sont pas
  validés. Matrice détaillée dans `docs/dev/developpement.md`.
- Les piles Nextcloud A et B sont arrêtées. Aucun démarrage, téléchargement,
  reprovisionnement, renommage de données utiles ou effacement de miroir n'a été
  effectué. Le distant est testé contre le serveur WebDAV mémoire, pas validé sur
  les deux serveurs réels.
- Les tests sautés en E2E sont les 6 parcours distants (pile absente) et le parcours
  vidéo (fixture indisponible).

### Inventaire initial, sans modification des données

- `CorpusTest/` du dépôt : sources uniquement, aucun fichier racine à renommer.
- `dist/linux-unpacked/resources/CorpusTest/CorpusSynthAnnot/corpus.json` : ancien
  artefact de distribution ; ne pas l'utiliser comme corpus de travail du nouveau code.
- Le profil `~/.config/sonalpi2/settings.json` référence des corpus encore en
  `corpus.json` sous `~/TestCorpusDemo/` et `~/Sonal/` :
  `Autonom`, `PasAPas2`, `Analyser_et_interpreter`, `Organiser_et_exporter`,
  `Corpus_annote`. Leur schéma doit être vérifié avant tout renommage, puis les
  corpus utiles sauvegardés, applications fermées et travaux distants publiés.
- D'autres anciens profils (`poc4`, `sonal-asynchro`) contiennent aussi un
  `corpus.json` ; ils ne doivent pas être basculés sans vérifier leur format.
- Aucun miroir du profil courant n'a été repéré par la recherche initiale ; cela
  ne constitue pas un inventaire universel des profils ou des copies de divergence.
- Les corpus des tests locaux sont recréés dans des dossiers temporaires en `.crp`.

**Avant de réutiliser des données utiles avec ce code : terminer l'étape 1.**
Un dossier resté au seul ancien nom peut encore être amorcé comme corpus neuf
par les parcours historiques d'ouverture par dossier.

## 2. Décisions de départ

- Le nom natif V2 devient **`corpus.crp`**, fixe à la racine du dossier.
- Un dossier reste un corpus. Le nom affiché du projet reste dans le champ `nom`.
- Le contenu reste du JSON UTF-8. Aucun changement de schéma ni incrément de `FORMAT_VERSION` pour le seul renommage.
- Les migrations de structure V2 déjà prises en charge restent disponibles.
- Les entretiens restent `entretiens/<id>.json`. Les réglages, manifestes, journaux et verrous conservent leurs noms et formats.
- `corpus.crp` n'est pas une archive autonome : les entretiens et références média restent nécessaires.
- Les corpus locaux et distants utilisent le même nom `corpus.crp`.
- Pas de compatibilité durable avec l'ancien nom V2 `corpus.json`, pas de duplication des deux fichiers.
- Un CRP V1 déclenche une **proposition de migration**, jamais une conversion silencieuse ni une écriture dans l'original.
- Un fichier invalide ou de version inconnue est refusé avant toute création ou bascule.
- L'ouverture externe ne contourne jamais l'autosauvegarde, les transactions ou les sessions distantes.

### Convention sur le nom du fichier

Pour cette première réalisation, ne pas introduire de support V2 pour `MonProjet.crp` : cela nécessiterait de propager un nom variable au store, aux récents et au protocole distant.

Un CRP identifié comme V2 mais portant un autre nom doit recevoir un message explicite indiquant que le fichier natif attendu est `corpus.crp`. Ne jamais ouvrir à sa place un autre fichier trouvé dans son dossier, ni le renommer automatiquement. Les CRP V1 gardent leurs noms libres.

## 3. Étape 1 — Préparer les données de développement

### Travaux

- [ ] Inventorier les corpus personnels locaux, les corpus de démo, les corpus des bancs distants et les miroirs des profils utilisés.
- [ ] Fermer les applications utilisant ces corpus ; terminer les publications et résoudre les sessions ou transactions en attente.
- [ ] Sauvegarder les corpus personnels utiles avant intervention.
- [ ] Renommer uniquement les fichiers racines V2 `corpus.json` en `corpus.crp`, ou recréer les corpus jetables après la bascule du code.
- [ ] Sur les serveurs de test, effectuer la même bascule hors utilisation ; ne pas mélanger ancien et nouveau code sur un même corpus.
- [ ] Pour les miroirs, privilégier leur reconstruction après vérification qu'aucun travail local non publié n'y subsiste. Ne pas supprimer aveuglément un miroir ou ses copies de divergence.
- [ ] Conserver les paramètres de profil utiles : les récents locaux mémorisent des dossiers, qui ne changent pas.

La bascule manuelle des données doit être coordonnée avec les étapes 2 et 3 : l'ancien code ne sait pas lire le nouveau nom, et inversement. Un dossier oublié pourrait être considéré comme neuf par certains parcours d'amorçage existants.

### Validation

Les corpus à conserver sont sauvegardés et identifiés. Aucun corpus utilisé avec le nouveau code ne dépend encore du seul `corpus.json`. Aucun renommage massif de tous les fichiers `.json` n'est effectué.

## 4. Étape 2 — Changer la convention de stockage local

### Travaux

- [x] Introduire une constante partagée, `NOM_FICHIER_CORPUS = 'corpus.crp'`, dans `src/shared/fichiersCorpus.ts`, sans dépendance Node/Electron, importable par le main et le renderer.
- [x] Remplacer les chemins fonctionnels codés en dur par cette constante.
- [x] Adapter `src/main/corpusStore.ts` : lecture, écriture atomique, préparation/finalisation d'ouverture, création, migration V1 et détection de suppression.
- [x] Adapter `src/main/transactionsFichiers.ts` : cible corpus, reprise du journal, contrôles de cohérence et erreurs.
- [x] Adapter `src/main/index.ts` : récents, nom affiché, existence du corpus, création, gardes de migration, démo et bascule après suppression.
- [x] Mettre à jour les textes de l'interface et les commentaires décrivant le format natif, notamment dans `src/shared/format.ts` et les composants de création/migration.
- [x] Conserver les écritures temporaires atomiques et tous les mécanismes de sauvegarde existants ; adapter seulement les noms réellement dérivés du fichier corpus.
- [x] Mettre à jour les fixtures et générateurs de corpus, notamment `test/seedDemo.ts`.

Ne pas remplacer globalement `.json` par `.crp`. Les références aux JSON d'entretiens, aux exports, aux réglages et aux formats historiques ont toujours un sens.

### Validation

- Créer, modifier, fermer et rouvrir un corpus utilise exclusivement `corpus.crp`.
- Les entretiens restent des JSON séparés.
- La reprise d'une transaction fonctionne avec le nouveau nom.
- Supprimer le corpus courant ne provoque pas sa recréation silencieuse.
- Les récents, les deux modes démo et les gardes « ne pas écraser » restent fonctionnels.

## 5. Étape 3 — Adapter le travail distant

Cette étape est indissociable du changement de convention : ne pas considérer la bascule comme terminée avec le seul stockage local.

### Travaux

- [x] `src/main/distant/publication.ts` : publier le squelette sous `corpus.crp`, en conservant `If-None-Match: *`.
- [x] `src/main/distant/transactions.ts` : changer le chemin du corpus pour les lectures fraîches, les comparaisons d'ETag et les publications `If-Match`.
- [x] Conserver `verrous/corpus.lock.json` : le verrou logique n'a pas besoin de changer de nom.
- [x] `src/main/distant/miroir.ts` : inclure explicitement `corpus.crp` dans les candidats au téléchargement.
- [x] Vérifier la cohérence entre inventaire, manifeste, détection des disparitions et corbeille du miroir : un corpus présent ne doit jamais être classé comme disparu.
- [x] Vérifier les exclusions des chemins de données pour les médias désignés : `corpus.crp` ne doit pas pouvoir être traité comme un fichier audio à télécharger par une seconde voie.
- [x] `src/main/index.ts` : adapter la vérification du corpus après tirage et la lecture de son nom depuis les miroirs.
- [x] `src/renderer/composables/sonal.ts` : adapter la réaction au téléchargement du corpus, notamment le rafraîchissement des définitions et la réconciliation d'anonymisation.
- [x] Conserver la sérialisation JSON et le type HTTP JSON des envois texte ; ne pas imposer un changement de MIME simplement parce que l'extension change.
- [x] Actualiser les fixtures et assertions des tests WebDAV et multi-utilisateur.

### Validation

- Création distante, ouverture, modification des définitions, import/suppression d'entretien et rafraîchissement sur un second poste fonctionnent.
- Le manifeste référence `corpus.crp` et ses ETags correctement.
- Les protections contre les créations concurrentes et les écritures périmées restent effectives.
- Les deux variantes de verrouillage restent fonctionnelles.
- Un échec réseau ne transforme pas le miroir en corpus local modifiable.

## 6. Étape 4 — Reconnaître les fichiers et ouvrir strictement un corpus existant

### Travaux

- [x] Créer un point d'entrée d'ouverture par fichier, distinct de l'amorçage par dossier.
- [x] Dans le main, vérifier le chemin, l'existence, le type fichier et la lisibilité ; normaliser les chemins et traiter les liens symboliques pour les contrôles d'identité et de miroir.
- [x] Séparer la lecture du disque et la classification du contenu ; rendre la classification pure et testable.
- [x] Reconnaître le format natif V2 par sa structure et `formatVersion`, pas seulement par son extension.
- [x] Valider les champs structurels nécessaires avant de transmettre les données au store. Préserver les champs optionnels et les migrations de versions déjà supportées.
- [x] Réutiliser le parseur V1 `src/shared/corpus/migrationCrp.ts` et la prise en charge d'encodage de `src/main/encodage.ts` pour les anciens fichiers.
- [x] Refuser un format ambigu, une structure invalide et une version inconnue. Un fichier portant un marqueur V2 non supporté ne doit pas être réinterprété comme V1 par défaut.
- [x] Appliquer la convention de nom fixe après identification V2, sans l'imposer aux CRP V1.
- [x] Ajouter une ouverture stricte dans la chaîne store/transition : si le fichier manque ou disparaît entre préparation et finalisation, refuser au lieu d'amorcer un squelette.
- [x] Ne jamais exécuter de contenu du fichier ni l'utiliser comme commande système.

### Protection des miroirs

- [x] Détecter les fichiers situés dans les miroirs gérés par le profil courant, y compris via un lien symbolique.
- [x] Si le miroir correspond à un compte connu, passer par l'ouverture distante normale avec authentification éventuelle et gestion des sessions.
- [x] Sinon, refuser explicitement l'ouverture locale du miroir géré.
- [x] Placer cette protection dans la couche main commune aux ouvertures locales, pas seulement dans le traitement du double-clic.

Une copie déplacée hors du répertoire des miroirs n'est pas toujours identifiable comme copie distante avec les métadonnées actuelles. Ne pas promettre une détection universelle. L'ouverture d'un fichier téléchargé depuis le navigateur Nextcloud ne recrée pas non plus, à elle seule, une connexion distante.

### Validation

Tests de classification : V2 courant, anciennes structures V2 migrables, V1 avec et sans version, JSON corrompu, objet arbitraire, entretien JSON renommé en CRP, version future, structure ambiguë et fichier absent.

Tous les refus restent sans création de corpus ni écrasement. Un fichier isolé ne doit pas être présenté comme un corpus complet : signaler les entretiens référencés mais absents, sans les remplacer par du contenu vide.

## 7. Étape 5 — Unifier l'orchestration dans l'interface

### Travaux

- [x] Exposer via `src/preload/index.ts` et `src/renderer/env.d.ts` un contrat typé pour les demandes d'ouverture ; ne pas exposer d'accès générique au système de fichiers.
- [x] Dans `src/renderer/composables/sonal.ts`, ajouter une orchestration commune pour le choix d'un fichier et les demandes du système.
- [x] Conserver l'ordre : validation de la cible sans écriture, vidage de l'autosauvegarde, fermeture/publication des sessions, finalisation, puis mise à jour de l'interface.
- [x] Réutiliser `src/main/transitionContexte.ts` et la file de transitions existante ; ne pas créer un second circuit de bascule qui les contourne.
- [x] Si sauvegarde ou fermeture échoue, ne pas ouvrir la cible ; conserver l'ancien contexte exploitable et expliquer l'erreur.
- [x] Prévoir le cas où le corpus demandé est déjà ouvert : remettre la fenêtre au premier plan, sans réinitialiser l'entretien ni fermer/réacquérir ses verrous inutilement.
- [x] Ajouter un sélecteur de fichiers `.crp` au parcours « Ouvrir un corpus local ». Conserver explicitement l'ouverture par dossier si elle reste utile ; ne pas mélanger ce geste avec « Nouveau corpus ».
- [x] Rendre le flux de migration V1 accessible depuis toute vue, avec chemin et aperçu préremplis : le composant est actuellement monté depuis `Accueil.vue`.
- [x] Conserver la confirmation, le choix du dossier cible et les protections de `MigrationCorpus.vue`. Annuler la proposition de migration ne doit pas changer de corpus ni modifier la source.

### Validation

Ouvrir depuis le sélecteur et ouvrir depuis le système produisent le même résultat. Les scénarios avec entretien en cours, sauvegarde en attente, session distante et migration annulée préservent le travail existant.

## 8. Étape 6 — Recevoir les demandes du système

### Travaux Electron

- [x] Installer tôt les gestionnaires nécessaires, avant la création de la fenêtre.
- [x] Windows/Linux : extraire les fichiers des arguments de lancement en distinguant exécutable, entrée de développement et options Electron.
- [x] Résoudre les arguments relatifs à partir du répertoire de travail du processus émetteur, notamment pour `second-instance`.
- [x] macOS : traiter `open-file`, appeler `preventDefault()` et mémoriser la demande même si l'application n'est pas encore prête.
- [x] Utiliser `app.requestSingleInstanceLock()` et `second-instance` pour transmettre une ouverture à l'instance du même profil déjà lancée.
- [x] Restaurer une fenêtre minimisée et la placer au premier plan ; recréer une fenêtre si nécessaire, notamment sous macOS.
- [x] Attendre un signal explicite de disponibilité du renderer avant de livrer les demandes. Un simple événement envoyé trop tôt ne doit pas pouvoir être perdu.
- [x] Prévoir un accusé de traitement et une file de demandes sérialisée. Dédupliquer les demandes équivalentes ; ne pas interrompre une migration ou une bascule en cours.
- [x] Donner priorité au fichier demandé au démarrage : `chargerCorpus()` ne doit pas ouvrir en parallèle le premier récent ni ramener ensuite la vue sur l'accueil.
- [x] Sans demande externe, conserver le comportement actuel du démarrage.
- [x] Si une demande initiale échoue, montrer l'erreur et rester dans un état clair ; ne pas ouvrir silencieusement un autre corpus à sa place.

### Politique pour plusieurs fichiers

L'application reste mono-corpus actif. Pour une même action système contenant plusieurs fichiers, traiter un seul fichier et expliquer que l'ouverture multiple n'est pas prise en charge ; ne pas enchaîner silencieusement des bascules. Les demandes distinctes reçues pendant une opération sont mises en attente et traitées une par une.

### Attention aux tests multi-utilisateur

L'instance unique doit s'appliquer au même profil, sans empêcher les bancs de lancer plusieurs profils indépendants. Vérifier les helpers `e2e/util.ts` et les lancements multi-utilisateur avec leurs `--user-data-dir` distincts. Ne pas supprimer le verrou d'instance globalement pour faire passer les tests.

### Validation

Tester application fermée, ouverte, minimisée, sans fenêtre, démarrage lent, deux demandes rapprochées, chemins avec espaces/accents et arguments relatifs. L'application n'ouvre qu'une fois le fichier attendu, sans perte de demande ni double instance éditant le même corpus dans le même profil.

## 9. Étape 7 — Ajouter le packaging et les associations

L'association de fichiers dépend de l'installation/intégration système. Elle ne résulte ni du seul renommage ni de `electron-vite build`.

### Travaux

- [x] Choisir les plateformes de première validation selon les machines disponibles ; garder la cible multiplateforme explicite.
- [x] Ajouter `electron-builder` ou un outil équivalent. La V1 fournit une référence pertinente pour `electron-builder`.
- [x] Définir un `appId` propre à la V2, un nom de produit et les icônes ; éviter une collision accidentelle avec l'installation V1.
- [x] Déclarer l'association `.crp` comme document corpus éditable par SonalPi2, avec nom, description et icône adaptés.
- [x] Définir les scripts de packaging en conservant la construction `electron-vite` actuelle.
- [x] Vérifier l'inclusion de `out/`, des dépendances d'exécution, du preload, des icônes et des ressources `CorpusTest/` selon les chemins attendus en production.
- [ ] Vérifier Windows : installation et commande d'ouverture passant le chemin complet correctement.
- [ ] Vérifier macOS : déclaration du type de document et réception de `open-file`, y compris au lancement.
- [ ] Vérifier Linux : entrée `.desktop`, déclaration MIME et intégration effective du paquet choisi. Ne pas supposer qu'un AppImage non intégré installe l'association.
- [x] Documenter comment choisir SonalPi2 avec « Ouvrir avec » si V1 est aussi installée.

Ne pas promettre une association par défaut imposée : le système et les préférences utilisateur restent déterminants. Ne pas modifier la V1 dans cette étape. Une extension partagée ne rend pas les formats compatibles et ne garantit pas un refus sûr côté V1.

La signature des distributions et les mises à jour automatiques sont hors périmètre de ce plan, sauf nécessité propre à la plateforme testée.

### Validation

Sur chaque plateforme annoncée comme supportée, installer un paquet réel et ouvrir un CRP depuis le gestionnaire de fichiers, application fermée puis déjà ouverte. Un test Electron lançant directement un chemin ne suffit pas à valider l'association du système.

## 10. Étape 8 — Tests et documentation

Les tests sont ajoutés au fil des étapes ; cette dernière étape constitue la recette transversale.

### Tests automatisés

- [x] Adapter les suites de stockage, transactions, transitions et coutures IPC au nouveau nom ; ajouter des tests des coutures d'ouverture et des parcours Electron.
- [x] Garder `test/migrationCrp.test.ts` centré sur le format V1 ; ajouter des tests distincts pour la reconnaissance commune V1/V2.
- [x] Adapter les tests de `test/webdav/`, les seeds et les fixtures E2E.
- [x] Ajouter des tests unitaires du décodage des arguments, de la file de demandes, de la déduplication et de la priorité au démarrage.
- [x] Ajouter un parcours E2E d'ouverture externe et un parcours d'ouverture V1 avec migration proposée puis annulée/confirmée.
- [x] Couvrir explicitement le refus d'un miroir ouvert en local et l'échec de fermeture d'une session avant bascule.
- [x] Vérifier l'absence de création de `corpus.json` dans les nouveaux parcours.
- [x] Conserver quelques assertions explicites sur le nom littéral `corpus.crp` : des tests utilisant tous la même constante ne détecteraient pas une valeur erronée de cette constante.

### Commandes de validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Exécuter d'abord les suites ciblées, puis les suites complètes selon l'environnement disponible. Rapporter séparément les succès, échecs et tests sautés.

Pour les bancs Nextcloud existants, utiliser uniquement si nécessaire :

```bash
npm run nc:up
npm run nc-b:up
```

**Ne jamais retélécharger les images Docker, lancer de `pull` ou reprovisionner les bancs.** En l'absence de serveur, les tests concernés se sautent ; cela ne vaut pas validation du distant.

### Documentation à actualiser

- [x] `docs/dev/donnees.md`, `docs/dev/architecture.md`, `docs/dev/modele-objet.md` : convention disque et JSON inchangé.
- [x] `docs/dev/ouverture-corpus.md` : ouverture stricte par fichier, priorité du lancement, distinction avec l'amorçage et protection des miroirs.
- [x] `docs/dev/developpement.md` : scripts de packaging et procédure de test des associations.
- [x] `docs/user/migration-v1.md` : même extension, formats distincts, migration proposée.
- [x] `docs/user/corpus-distant.md` et documentation multi-utilisateur : nom natif et limites de l'ouverture d'une copie locale.
- [x] Documenter que le CRP n'est pas un paquet autonome et que déplacer le seul fichier ne déplace pas le corpus.
- [x] Rechercher les références restantes avec `rg -n 'corpus\.json' src test e2e docs README.md` et justifier chaque occurrence conservée. Il ne reste que les assertions de non-création dans les tests unitaires/E2E, l'ancien nom expliqué dans `README.md` et `docs/dev/developpement.md`, et le scénario historique dans `docs/dev/ouverture-corpus.md`. Les archives des plans ne sont pas modifiées.

## 11. Ordre de réalisation et jalons

1. **Convention disque** : étapes 1 à 3, tests adaptés inclus. Le corpus local et distant fonctionne en `.crp`, sans double-clic pour l'instant.
2. **Ouverture applicative** : étapes 4 et 5. Le sélecteur ouvre strictement un V2 ou propose la migration d'un V1.
3. **Ouverture système** : étape 6. Les demandes externes sont traitées sans contourner les sauvegardes ni les sessions.
4. **Association installée** : étape 7. Le double-clic fonctionne depuis un gestionnaire de fichiers avec une application empaquetée.
5. **Recette finale** : étape 8, matrice de plateformes réellement testées et documentation à jour.

Séparer les commits par responsabilités, mais ne pas laisser un état intermédiaire utilisé sur des données utiles où le local écrit `.crp` tandis que le distant attend encore `.json`.

## 12. Critères de fin

- [x] Tous les nouveaux corpus V2, locaux et distants, utilisent `corpus.crp` comme unique fichier racine de référence.
- [x] Le contenu et la version de format n'ont pas changé pour le seul renommage.
- [ ] Le double-clic ouvre le bon corpus, que l'application soit fermée ou déjà ouverte, sur les plateformes effectivement validées.
- [x] Les CRP V1 sont reconnus et proposés à la migration sans modification de l'original.
- [x] Les erreurs d'ouverture ne créent rien et ne provoquent aucune bascule vers une autre cible par défaut.
- [x] L'autosauvegarde, les transitions préparées, les transactions et les verrous distants restent respectés.
- [x] Les miroirs gérés ne peuvent pas être ouverts en local pour contourner le mode distant.
- [ ] Les récents, la démo, la suppression du corpus et les tests multi-utilisateur restent fonctionnels.
- [x] Les limites sont explicites : nom V2 fixe, corpus multifichier, coexistence V1/V2 et association système choisie par l'utilisateur.
