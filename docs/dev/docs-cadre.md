# Documents du projet — carte développeur

Les onglets **Documents du projet** et **Documents exemples** de « Préparer et suivre »
utilisent le même explorateur par dossier. Le contenu des documents n'est jamais modifié
ni converti. `corpus.json` ne change pas et les corpus plats restent compatibles.

## Stockage et empaquetage

```text
<corpus>/DocsCadre/
├── consignes.txt
└── DPO/
    └── Consentements/notice.docx

ressources/docsCadreExemples/
├── DPO/
│   ├── Déclaration traitement DPO.txt
│   └── Notice de consentement DPO.txt
├── Guide de correction.txt
└── Guide de pseudonymisation.txt
```

La racine locale est créée à l'ouverture explicite du dossier, à la création d'un dossier
ou à l'ajout d'un fichier. La consultation ne crée rien. Aucun parcours récursif n'est
nécessaire pour afficher un dossier. `extraResources` d'Electron Builder copie récursivement
les exemples vers `process.resourcesPath/docsCadreExemples` ; `archiveCorpus.ts` conserve
également les fichiers imbriqués, sans conversion.

## Contrats et sécurité

`src/shared/docsCadre.ts` est pur et partagé par main, preload et renderer :

- `EntreeDocsCadre` distingue dossiers et documents (`nature`). Chaque entrée porte
  `source`, `nom` et `chemin`, relatif à sa racine documentaire ;
- `InventaireDossierDocsCadre` contient `mode`, `source`, `dossier`, `entrees` et, au besoin,
  `absent` ou `erreur`. Il décrit un seul dossier ;
- `estCheminDocsCadre` accepte uniquement des segments listables et portables, séparés par
  `/`, avec une limite de 2 048 caractères. La chaîne vide désigne la racine uniquement
  si l'appel l'autorise. Chemins absolus, segments vides, `.` et `..`, antislashs, noms
  réservés Windows, caractères de contrôle et noms cachés ou temporaires sont refusés ;
- `trierEntreesDocsCadre` place les dossiers avant les documents, puis trie en français.

Le main résout les cibles sous les racines autorisées. Chaque dossier intermédiaire est
vérifié par `lstat`, ainsi que le fichier final : aucun lien symbolique n'est accepté.
Les erreurs de résolution ne renvoient pas le chemin absolu du poste. Comme les autres
opérations locales, ces contrôles ne constituent pas un verrou contre un autre processus
qui remplacerait simultanément les dossiers pendant une opération.

Les copies d'ajout passent par un temporaire et une création exclusive par lien physique.
Les collisions insensibles à la casse comptent toutes les entrées, y compris dossiers et
liens. Le sélecteur propose un nom libre ; le dépôt refuse l'homonyme. Aucun dossier déposé
n'est importé récursivement. Les anciennes opérations internes de renommage et corbeille
restent limitées aux fichiers de racine et ne sont pas proposées dans l'interface.

## IPC et actions système

Les chemins documentaires échangés sont relatifs, jamais absolus :

```text
docsCadre:lister(source, dossier)
docsCadre:lireApercu(source, chemin)
docsCadre:ajouterFichier(dossier, nomSouhaite?)
docsCadre:deposer(cheminSource, dossier)
docsCadre:creerDossier(parent, nom)
docsCadre:ouvrir(chemin)
docsCadre:ouvrirDossier(dossier)
docsCadre:afficherDansDossier(chemin)
docsCadre:enregistrerCopie(source, chemin)
docsCadre:ouvrirDansNextcloud(dossier)
```

Le chemin source d'un dépôt est l'exception : il est obtenu par `webUtils.getPathForFile`
pour un fichier natif glissé depuis le poste. Le main vérifie qu'il s'agit d'un fichier
régulier, non symbolique. Les chemins des dialogues et les cibles documentaires absolues
ne sont pas retournés au renderer. Le nom par défaut du dialogue de copie est le nom du
fichier seul, sans ses dossiers.

`src/main/index.ts` capture le corpus avant les opérations asynchrones et vérifie qu'il
est toujours courant après les attentes. Les mutations sont refusées à distance dans
le main, indépendamment de l'interface. Les exemples n'exposent aucune mutation.

- **Ouvrir** : `shell.openPath` sur un fichier local validé ;
- **Ouvrir ce dossier** : `shell.openPath` sur le dossier courant validé ;
- **Afficher dans le dossier** : `shell.showItemInFolder` sur le fichier validé ;
- **Organiser ce dossier dans Nextcloud** : URL construite par le main, `shell.openExternal`.

Il n'y a pas de bouton de choix d'application. Voir
[l'étude d'ouverture native](docs-cadre-ouverture-native.md).

## Nextcloud

`src/main/docsCadreDistant.ts` consulte directement le serveur, sans miroir documentaire :

- `PROPFIND Depth: 1` sur `DocsCadre/<dossier>` ; seuls les enfants directs sont retenus,
  même si le serveur renvoie aussi des petits-enfants ;
- 404 : résultat `absent`, distinct d'un dossier vide ; les autres erreurs conservent
  le dernier inventaire lisible dans le renderer ;
- aperçus : inventaire du parent, puis GET borné du chemin complet si le format le permet ;
- copie : GET en flux vers la destination, octets inchangés ;
- aucune mutation documentaire WebDAV (PUT, MKCOL, MOVE ou DELETE).

`urlNextcloudPourCorpus(baseUrl, dossier)` ouvre le dossier courant dans Fichiers.
Les segments de la racine DAV sont décodés puis réencodés ; les segments relatifs du
contrat, déjà décodés, sont encodés une seule fois, y compris les pourcentages littéraux.
HTTPS est exigé sauf sur un hôte local. Les URL non reconnues sont refusées.
GitLab ne propose pas le service documentaire ; ses exemples restent disponibles.

## Renderer

`useDocsCadre` mémorise séparément pour projet et exemples le dossier, les entrées, la
sélection par chemin, la génération de liste et la dernière erreur. La sélection visible
porte `{ source, chemin }`. Un compteur d'aperçu et une session de corpus empêchent les
réponses tardives de remplir un panneau quitté ou un autre corpus.

Une navigation désélectionne le document, puis ne remplace dossier et liste qu'après
une lecture réussie. Si le dossier disparaît, la lecture remonte jusqu'au premier parent
disponible. En cas de panne réseau, dossier et dernière liste restent affichés. Chaque
onglet retrouve son dossier et son document ; un changement de corpus remet les deux à
la racine. Le retour de focus relit seulement le panneau local actif.

`DocsCadreCote.vue` fournit des boutons de dossier, un fil d'Ariane accessible et une
création de dossier par formulaire. Le fil d'Ariane est masqué à la racine.
Ses parents ont l'apparence de liens, comme la navigation principale ; le dossier courant
est un texte non cliquable. Après navigation, le focus revient au dossier courant,
ou au titre à la racine.
Le dépôt de `PreparerSuivre.vue` est actif seulement dans l'onglet projet local ; sa
destination est capturée au début du dépôt. Un changement de corpus interrompt les dépôts
restants. Les exemples n'offrent qu'aperçu et copie ; aucun emplacement d'installation
n'est ouvert. Les documents distants ne lancent pas d'application locale implicitement.

## Aperçus et tests

Texte UTF-8 strict et échappé ; images avec contrôle de signature ; PDF.js embarqué et
worker local, rendu canvas sans liens, formulaires ni pièces jointes. Limites : texte
2 Mo, image 20 Mo, PDF 30 Mo. Ces plafonds ne limitent pas le stockage.

- `test/docsCadre.test.ts` : chemins, liens, tri, mutations ciblées, collisions, aperçus,
  copies exactes et ressources DPO ;
- `test/docsCadreDistant.test.ts` : parcours imbriqué, petits-enfants ignorés, 404,
  encodage, copies et URL Nextcloud ;
- `test/docsCadreRenderer.test.ts` : navigation, mémoire indépendante, disparition,
  erreurs réseau, réponses tardives et destinations des actions ;
- `test/webdav/docsCadre-nextcloud.test.ts` : navigation, lecture et copie sur les deux
  bancs réels, sans écriture par le service documentaire ;
- `test/archiveCorpus.test.ts` : conservation d'un document sur plusieurs niveaux ;
- `e2e/docs-cadre.e2e.ts` : parcours local, clavier, création, ajout, dépôt via IPC,
  actions Electron simulées, exemples DPO, noms longs et remontée après suppression externe ;
- `e2e/docs-cadre-nextcloud.e2e.ts` : navigation réelle sur les deux bancs, actions adaptées,
  panne documentaire simulée, liste préservée et exemples consultables hors ligne ;
- `e2e/docs-cadre-paquet.e2e.ts` : lance le paquet et lit les deux modèles DPO.
  Après `npm run pack:dir`, définir `DOCS_E2E_EXECUTABLE` vers son exécutable.

Préparer les bancs réels avec `preparer_bancs_docker` dans pi. Ne pas télécharger ni
reprovisionner leurs images.
