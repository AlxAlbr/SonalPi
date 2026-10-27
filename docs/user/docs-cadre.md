# Documents du projet et documents exemples

L’espace **Préparer et suivre** distingue deux onglets documentaires. **Documents du
projet** rassemble les fichiers propres au corpus. **Documents exemples** présente les
modèles fournis avec SonalPi. Dans chaque onglet, la liste reste à gauche et le document
sélectionné se consulte à droite.

Un corpus d’entretiens s’accompagne souvent de documents de méthode ou de conformité :
déclaration de traitement DPO, notice de consentement DPO, guide de correction, guide de
pseudonymisation, consignes internes, fichiers Word ou PDF. Ces documents sont propres au
corpus courant ; ils ne sont ni des notes d’entretien ni des réglages du profil.

Le parcours **Préparer et suivre** de la découverte guidée fait ajouter un petit guide
d’entretien depuis les fichiers d’exercice préparés automatiquement. Au moment de l’ajout,
le guide permet d’ouvrir directement le dossier qui contient ce document. Il utilise le
véritable sélecteur de fichier et place le guide dans **Documents du projet**. Le fichier
ajouté devient donc bien un document du projet ; il n’est jamais confondu avec les modèles
de **Documents exemples**.

## Un principe : jamais de modification du contenu

SonalPi conserve les documents dans leur format d’origine et ne modifie jamais leur contenu,
en local comme à distance. Un document cadre peut contenir une mise en page, des tableaux,
des en-têtes ou des signatures qu’une conversion altérerait : le fichier original reste
toujours la seule référence. Il n’existe aucun bouton « convertir » et SonalPi ne crée aucun
doublon Markdown ou HTML. L’édition appartient à l’application habituelle du poste ou à
Nextcloud ; SonalPi assure l’inventaire, quelques aperçus fiables et l’accès aux fichiers.

## Corpus local

Le dossier `DocsCadre/`, à la racine du corpus, accueille vos documents et sous-dossiers.
Les fichiers déjà présents à la racine restent disponibles sans modification.

Cliquez sur un dossier pour consulter son contenu. Le fil **Documents › DPO › …** apparaît
seulement dans un sous-dossier et permet de revenir à chaque parent. Les dossiers précèdent les fichiers, par ordre alphabétique.
Chaque onglet conserve son dossier pendant la session ; changer de corpus ramène à la
racine. Si un dossier a été supprimé ailleurs, **Actualiser** revient au parent disponible.
La liste se rafraîchit aussi au retour dans l’espace ou dans SonalPi.

Un bandeau d'aide repliable en haut du panneau droit (« Où sont mes documents ? ») rappelle
l’emplacement des fichiers et le fait que SonalPi n’édite jamais leur contenu.

Depuis cet onglet :

- **Nouveau dossier** crée un sous-dossier dans le dossier affiché ;
- **Ouvrir ce dossier** ouvre le dossier affiché dans le gestionnaire de fichiers du poste ;
- **Ajouter un fichier** copie le document choisi dans le dossier affiché : un document cadre fait
  partie du corpus, contrairement à l'audio des entretiens qui n'est que référencé. En cas
  d'homonyme, rien n'est écrasé : un nom libre est proposé (`<nom>-2`, `-3`…) ;
- **glisser-déposer** copie un ou plusieurs fichiers dans le dossier affiché (corpus
  local uniquement). Un homonyme ou un dossier est refusé avec un message : rien n'est
  copié, aucun renommage automatique ;
- **Ouvrir** (ou double-clic sur un document) utilise l’application habituelle du poste ;
- **Afficher dans le dossier** ouvre le gestionnaire de fichiers et sélectionne le document.
  Pour choisir une autre application, utilisez ensuite son menu **Ouvrir avec** ;
- **Enregistrer une copie** écrit une copie exacte du fichier original, octet pour octet,
  à l'emplacement choisi.

Pour déplacer, renommer ou supprimer des fichiers ou dossiers, utilisez le gestionnaire
de fichiers avec **Ouvrir ce dossier**. SonalPi n’effectue pas ces opérations et ne propose
pas d’import complet d’un dossier. Les possibilités de restauration dépendent du système.

## Aperçus et formats

| Format | Dans SonalPi | Pour éditer |
| --- | --- | --- |
| `.txt`, `.md`, `.csv` | Texte brut échappé (aucune interprétation) | Application système ou Nextcloud |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Image en lecture seule | Application système ou Nextcloud |
| `.pdf` | Aperçu intégré en lecture seule, avec navigation et zoom | Application système ou Nextcloud |
| `.docx`, `.odt`, `.rtf`, ancien `.doc` | Métadonnées, sans conversion | Word/LibreOffice ou Nextcloud |
| `.html`, `.htm` | Métadonnées, sans exécution du contenu | Navigateur ou Nextcloud |
| Autre format | Métadonnées, sans aperçu | Application système ou Nextcloud |

L’aperçu PDF affiche une page à la fois et propose les pages précédente/suivante ainsi
qu’un zoom de 50 à 250 %. Il reste volontairement en lecture seule et n’active ni liens,
ni formulaires, ni pièces jointes du document.

Les fichiers trop volumineux pour un aperçu restent listés et peuvent être ouverts
ailleurs ou enregistrés comme copie : la limite d’aperçu n’est pas une limite de stockage.
La limite PDF est de 30 Mo. Un fichier dont le contenu ne correspond pas à son extension
est signalé par prudence. Un texte dans un encodage autre qu’UTF-8 est signalé plutôt que
décodé au hasard.

## Documents exemples

L’onglet **Documents exemples** contient un dossier **DPO** avec la déclaration de traitement
et la notice de consentement. Les guides de correction et de pseudonymisation restent à la
racine. La navigation fonctionne comme dans les documents du projet.

Ces modèles sont consultables et enregistrables comme copie, mais jamais modifiables.
Aucun ajout, création de dossier ou accès à leur emplacement d’installation n’est proposé.
Ils restent disponibles même quand un corpus distant est hors ligne.

## Corpus distant

Dans un corpus distant, les documents sont consultés directement sur le serveur, sans copie
locale : la lecture donne la version présente sur le serveur au moment de la consultation.
Vous pouvez parcourir les sous-dossiers dans SonalPi et enregistrer une copie d’un document.
Toute création, ajout ou réorganisation est réservée à Nextcloud. Le bouton
**Organiser ce dossier dans Nextcloud**, accessible dans la barre latérale, ouvre le
**dossier affiché** dans l’application Fichiers du serveur ; le navigateur peut demander une
authentification Nextcloud indépendante, et l'édition dépend des applications installées
sur le serveur (Nextcloud Office, Collabora, OnlyOffice…).

En cas d’absence de réseau, l’erreur est affichée et la dernière liste lisible reste à
l’écran ; les documents exemples restent accessibles. Si le projet ne contient pas encore
de dossier de documents, créez-le dans Nextcloud, puis actualisez SonalPi.
Les documents du projet ne sont pas encore disponibles pour un corpus GitLab.

## Fichiers cachés

Les fichiers cachés, temporaires, verrous bureautiques (`~$…`) et liens symboliques ne
sont pas affichés, quel que soit leur niveau dans les sous-dossiers.

Le dépôt reste inactif dans les exemples et les corpus distants. Un dossier glissé depuis
le bureau n’est pas copié : ajoutez ses fichiers séparément dans le dossier voulu.
