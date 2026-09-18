# Docs cadre projet

La barre d’outils du corpus propose le bouton **Docs cadre projet**. Il ouvre une grande
fenêtre composée de deux zones : à gauche la barre latérale **Vos Documents** puis
**Documents exemples** ; à droite le panneau de consultation du document sélectionné.

Un corpus d’entretiens s’accompagne souvent de documents de méthode ou de conformité :
notice de consentement DPO, guide de correction, guide de pseudonymisation, consignes
internes, fichiers Word ou PDF. Ces documents sont propres au corpus courant ; ils ne sont
ni des notes d’entretien ni des réglages du profil.

## Un principe : jamais de modification du contenu

SonalPi conserve les documents dans leur format d’origine et ne modifie jamais leur contenu,
en local comme à distance. Un document cadre peut contenir une mise en page, des tableaux,
des en-têtes ou des signatures qu’une conversion altérerait : le fichier original reste
toujours la seule référence. Il n’existe aucun bouton « convertir » et SonalPi ne crée aucun
doublon Markdown ou HTML. L’édition appartient à l’application habituelle du poste ou à
Nextcloud ; SonalPi assure l’inventaire, quelques aperçus fiables et l’accès aux fichiers.

## Corpus local

Le dossier `DocsCadre/`, à la racine du corpus, accueille vos documents. Vous pouvez y
accéder via le gestionnaire de fichiers (**Ouvrir le dossier**, dans la barre latérale,
crée le dossier au besoin) et **déposer un fichier dessus, en le glissant depuis le
bureau** : SonalPi le copie alors dans `DocsCadre/`. Une fois les documents dans le
dossier, **Actualiser** les révèle dans la fenêtre ; la liste se rafraîchit aussi
automatiquement au retour dans la fenêtre.

Un bandeau d'aide repliable en haut du panneau droit (« Où sont mes documents ? ») rappelle ces
règles : les documents d'exemple sont des modèles à remplacer par ceux de votre DPO, et
SonalPi n'édite jamais le contenu.

Depuis la fenêtre :

- **Ajouter un fichier** copie le document choisi dans `DocsCadre/` : un document cadre fait
  partie du corpus, contrairement à l'audio des entretiens qui n'est que référencé. En cas
  d'homonyme, rien n'est écrasé : un nom libre est proposé (`<nom>-2`, `-3`…) ;
- **glisser-déposer** copie un ou plusieurs fichiers directement dans `DocsCadre/` (corpus
  local uniquement). Un homonyme ou un dossier est refusé avec un message : rien n'est
  copié, aucun renommage automatique ;
- **Ouvrir avec l'application** (bouton du panneau, ou double-clic sur le document dans la
  liste) ouvre le document avec l'application par défaut du poste ;
- **Enregistrer une copie** écrit une copie exacte du fichier original, octet pour octet,
  à l'emplacement choisi.

La gestion des fichiers (renommer, supprimer, organiser) n'appartient plus à l'interface :
elle se fait dans le gestionnaire de fichiers ou Nextcloud. Une suppression effectuée hors
SonalPi est définitive.

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

La section **Documents exemples** rassemble des exemples livrés avec l’application
(notice de consentement DPO, guide de correction, guide de pseudonymisation). Ils sont
immuables : consultables et enregistrables comme copie, mais jamais modifiables. Ils
restent disponibles même quand un corpus distant est hors ligne.

## Corpus distant

Dans un corpus distant, les documents sont consultés directement sur le serveur, sans copie
locale : la lecture donne la version présente sur le serveur au moment de la consultation.
Toute écriture est réservée à Nextcloud. Le bouton **Ouvrir dans Nextcloud**, toujours
accessible dans la barre latérale (même à l'état vide), ouvre le dossier du corpus dans
l'application Fichiers du serveur ; le navigateur peut demander une
authentification Nextcloud indépendante, et l'édition dépend des applications installées
sur le serveur (Nextcloud Office, Collabora, OnlyOffice…).

En cas d’absence de réseau, l’erreur est affichée et la dernière liste lisible reste à
l’écran ; les documents exemples restent accessibles. Un corpus créé avant cette
fonctionnalité n’a pas de dossier `DocsCadre/` sur le serveur : la liste apparaît vide et
l’ouverture Nextcloud mène à la racine du corpus, où le dossier peut être créé.

## Fichiers cachés

Les fichiers cachés, temporaires, verrous bureautiques (`~$…`) et liens symboliques ne
sont pas affichés. Les sous-dossiers de `DocsCadre/` ne sont pas parcourus dans la première
version.

Le renommage et la suppression ne sont plus proposés dans l'interface : ils se font hors
SonalPi (gestionnaire de fichiers ou Nextcloud), où ils sont définitifs — la corbeille
douce interne (`corbeille/DocsCadre/`) n'est plus accessible depuis la fenêtre.
