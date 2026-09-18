# Plan — Docs cadre projet

> Statut : réalisé (lots A à E, aperçu PDF amélioré). La visionneuse PDF native de
> Chromium n’existe pas dans le paquet Electron distribué. L’aperçu utilise donc
> PDF.js, embarqué localement, avec un rendu canvas limité à la navigation et au zoom.
> Ce chantier transforme le bouton inactif « Ressources du projet » en un espace
> documentaire propre à chaque corpus.
>
> Décision structurante : SonalPi conserve les documents dans leur format d’origine et
> ne modifie jamais leur contenu, en local comme à distance. L’édition est confiée à
> l’application habituelle du poste ou à Nextcloud. SonalPi assure l’inventaire, quelques
> aperçus fiables et l’accès aux fichiers.

## 1. Objectif

Un corpus d’entretiens s’accompagne souvent de documents de méthode ou de conformité :
notice de consentement DPO, guide de correction, guide de pseudonymisation, consignes
internes, fichiers Word ou PDF, etc.

Le bouton de la barre d’outils devient **« Docs cadre projet »** et ouvre une grande fenêtre
composée de deux zones :

- à gauche, une barre latérale contenant les sections **« Vos Documents »** puis
  **« Documents exemples »** ;
- à droite, un panneau de consultation et d’actions sur le document sélectionné.

SonalPi n’est pas une suite bureautique. Un document cadre peut contenir une mise en page,
des en-têtes, des tableaux, des logos ou des signatures dont une conversion altérerait le
sens ou la présentation. Le fichier original reste donc toujours la seule référence.

Les documents sont propres au corpus courant. Ils ne sont ni des notes d’entretien ni des
réglages du profil.

## 2. Principes fonctionnels

### 2.1 Barre latérale gauche

La section **Vos Documents** affiche les fichiers directement présents dans `DocsCadre/`, dans
un ordre alphabétique français stable.

- Si la liste est vide : afficher « Vous n’avez pas encore de document. ».
- Sinon : afficher les documents les uns sous les autres.
- Le nom affiché est exactement le nom du fichier, extension comprise.
- Une icône distingue au minimum Word, PDF, texte, image et format générique.
- Une sélection visuelle indique le document présenté à droite.

Les fichiers cachés, temporaires et liens symboliques ne sont pas affichés. Les sous-dossiers
ne sont pas parcourus dans la première version.

La section **Documents exemples**, placée sous la première, affiche les exemples livrés avec
l’application. Elle reste disponible même lorsqu’un corpus distant est hors ligne.

### 2.2 Panneau droit

Sans sélection, le panneau invite à choisir un document.

Avec un document sélectionné, il affiche :

- son nom, son type, sa taille et sa date de modification lorsqu’elle est disponible ;
- un aperçu seulement pour les formats dont le rendu est fiable et sûr ;
- les actions autorisées selon le type de corpus et la source du document ;
- un message clair lorsqu’aucun aperçu intégré n’est disponible.

Le panneau occupe toute la hauteur disponible et possède son propre défilement. La barre
latérale conserve une largeur stable et son propre défilement si les listes grandissent.

### 2.3 Matrice de consultation

| Format | Dans SonalPi | Action d’édition |
| --- | --- | --- |
| `.pdf` | Aperçu PDF.js en lecture seule, avec navigation et zoom | Application système ou Nextcloud |
| `.txt`, `.md`, `.csv` | Texte brut échappé, sans interprétation | Application système ou Nextcloud |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Image en lecture seule | Application système ou Nextcloud |
| `.docx`, `.odt`, `.rtf`, ancien `.doc` | Métadonnées, sans conversion | Word/LibreOffice ou Nextcloud |
| `.html`, `.htm` | Métadonnées, sans exécution du contenu | Navigateur/application système ou Nextcloud |
| Autre format | Métadonnées et absence d’aperçu expliquée | Application système ou Nextcloud |

Il n’existe aucun bouton « Convertir pour modifier ». SonalPi ne crée pas de doublon Markdown
ou HTML et ne tente aucun aller-retour vers le format d’origine.

### 2.4 Corpus local

Afficher un court message permanent ou contextuel :

> SonalPi conserve ces documents dans leur format d’origine. Utilisez leur application
> habituelle pour les modifier.

La première version permet :

- d’ajouter un fichier existant au corpus par un sélecteur natif ;
- de renommer un fichier sans modifier son contenu ;
- de le supprimer après confirmation ;
- de l’ouvrir avec l’application par défaut du poste ;
- d’ouvrir le dossier `DocsCadre/` dans le gestionnaire de fichiers ;
- d’enregistrer une copie exacte du fichier original.

« Ajouter un fichier » copie le fichier choisi dans `DocsCadre/`. Le document cadre doit faire
partie du corpus, contrairement aux médias audio qui sont seulement référencés. Une collision
ne provoque jamais d’écrasement silencieux : l’interface demande un autre nom ou propose un
suffixe.

La saisie d’un nouveau nom conserve espaces, accents, extension et casse. Elle refuse les
séparateurs de chemin, les noms réservés ou non portables et les collisions insensibles à la
casse.

Une suppression déplace le fichier sous `corbeille/DocsCadre/` avec un nom non destructif,
plutôt que de le détruire immédiatement. La restauration depuis cette corbeille n’appartient
pas à cette première version.

Après l’ouverture d’un document dans une application externe, SonalPi actualise la liste et le
document sélectionné lorsque sa fenêtre reprend le focus. Il ne surveille pas en continu les
écritures d’une application tierce.

### 2.5 Corpus distant

Afficher le message suivant, ou une formulation très proche :

> Vous êtes dans un corpus distant. Ces documents sont disponibles en lecture seule dans
> SonalPi. Pour les modifier, ouvrez le dossier dans Nextcloud.

Le mode distant :

- liste `DocsCadre/` directement par WebDAV lorsque la fenêtre s’ouvre ou est actualisée ;
- lit à la demande les octets du document sélectionné seulement lorsqu’un aperçu est possible ;
- n’expose aucune commande de création, écriture, renommage ou suppression ;
- permet d’enregistrer localement une copie exacte du fichier original ;
- propose **« Ouvrir dans Nextcloud »**, qui ouvre le dossier du corpus dans le navigateur ;
- ne transmet jamais le mot de passe d’application au navigateur.

Selon les applications installées sur le serveur, un DOCX pourra être édité avec Nextcloud
Office, Collabora ou OnlyOffice, ou seulement téléchargé. SonalPi ne promet pas une suite
bureautique que le serveur ne possède pas. Le navigateur peut demander une authentification
Nextcloud indépendante.

### 2.6 Documents exemples

Créer un dossier de ressources embarquées, sur le même principe que `CorpusTest/`, contenant
initialement :

- `Notice de consentement DPO.txt` ;
- `Guide de correction.txt` ;
- `Guide de pseudonymisation.txt`.

Chaque fichier contient seulement son titre et la mention « À venir. ». Les contenus réels
pourront ensuite remplacer ces fichiers par des DOCX, PDF ou autres formats sans changer l’API
ni l’interface.

Les exemples sont immuables dans l’application. Ils peuvent être consultés ou enregistrés comme
copie exacte, mais ne sont jamais modifiés ni copiés dans le corpus à l’insu de l’utilisateur.

## 3. Stockage

### 3.1 Corpus local

Arborescence proposée :

```text
<corpus>/
├── corpus.json
├── entretiens/
├── DocsCadre/
│   ├── Notice de consentement.docx
│   ├── Protocole de correction.pdf
│   └── Consignes.txt
└── corbeille/
    └── DocsCadre/
```

Aucun champ n’est ajouté à `corpus.json` et aucune migration de son format n’est nécessaire.

Le dossier `DocsCadre/` est créé lors de la première ouverture explicite du dossier, du premier
ajout ou de la première copie. Cette création permet aussi à l’utilisateur d’y déposer lui-même
ses documents.

Les fichiers sont conservés octet pour octet. Les copies et renommages locaux sont atomiques ou
échouent sans remplacer une cible existante. SonalPi ne produit aucun fichier dérivé persistant
pour les aperçus.

### 3.2 Corpus distant : absence volontaire de miroir

Le miroir actuel ne parcourt pas les sous-dossiers arbitraires. Son tirage inventorie la racine,
`entretiens/` et les fichiers JSON attendus ; `DocsCadre/` n’y entrerait pas sans une nouvelle
politique de synchronisation.

Il est recommandé de ne pas étendre cette politique :

- la consultation WebDAV directe fournit la version présente sur le serveur au moment de la
  lecture ;
- aucune copie locale ne peut être confondue avec une version éditable ;
- aucun verrou, manifeste, publication ou conflit documentaire n’est ajouté ;
- les fichiers binaires ne gonflent pas le miroir.

Contrepartie assumée : les documents propres à un corpus distant ne sont pas consultables hors
ligne. Dans ce cas, l’interface affiche une erreur de connexion et permet toujours de consulter
les documents exemples embarqués.

Pour un nouveau corpus distant, `PublieurCorpus` crée aussi `DocsCadre/`. Pour un ancien corpus
sans ce dossier, une réponse WebDAV 404 équivaut à une liste vide. SonalPi n’effectue pas de
création cachée ; l’action Nextcloud ouvre alors la racine du corpus afin que l’utilisateur y
crée le dossier.

## 4. Aperçus intégrés

### 4.1 Texte

Les fichiers texte pris en charge sont décodés en UTF-8 et affichés comme texte, jamais comme
HTML. Un contenu invalide ou dans un autre encodage produit un message explicite et reste
ouvrable avec l’application externe.

Markdown et CSV sont volontairement affichés comme texte brut dans cette première version. Il
n’y a ni éditeur ni moteur de rendu Markdown.

### 4.2 Images

Les formats d’image pris en charge utilisent le décodage natif de Chromium à partir d’octets
bornés. L’URL d’objet est créée dans le renderer puis révoquée au changement de document ou à
la fermeture de la fenêtre.

Aucun contenu SVG n’est affiché dans cette première version, afin de ne pas introduire un second
format actif à assainir.

### 4.3 PDF

La visionneuse native d’Electron/Chromium n’étant pas disponible dans le paquet distribué,
l’aperçu utilise PDF.js et son worker embarqués localement. Les octets sont bornés et leur
signature `%PDF-` est vérifiée avant transmission au renderer.

Le composant rend une page à la fois dans un canvas et propose seulement les pages
précédente/suivante et un zoom borné. Les couches de liens, formulaires, annotations et pièces
jointes ne sont pas montées. L’ouverture avec l’application habituelle et l’enregistrement
d’une copie restent disponibles comme repli.

### 4.4 DOCX et autres formats

Aucune conversion DOCX vers HTML n’est réalisée. Mammoth n’est pas ajouté : même utile pour un
aperçu sémantique, il ne restitue pas fidèlement toutes les mises en page et pourrait donner
l’impression que le document affiché est identique à l’original.

HTML, documents bureautiques et formats inconnus ne sont ni interprétés ni injectés dans le
renderer. Leur fiche explique que SonalPi conserve le fichier mais délègue son affichage et son
édition à l’outil approprié.

### 4.5 Limites de taille

Définir des limites explicites par type pour les aperçus chargés en mémoire. Un fichier trop
volumineux reste listé et peut être ouvert dans l’application système, dans Nextcloud ou
enregistré comme copie. La limite d’aperçu n’est pas une limite de stockage du corpus.

Vérifier la signature minimale des PDF et images avant aperçu, sans se fier uniquement à
l’extension ou au type MIME annoncé par le serveur.

## 5. Contrats partagés et sécurité des chemins

Créer `src/shared/docsCadre.ts` avec des types purs, par exemple :

- `SourceDocumentCadre = 'projet' | 'exemple'` ;
- `ModeDocumentsCadre = 'local' | 'distant'` ;
- `TypeDocumentCadre = 'pdf' | 'texte' | 'image' | 'bureautique' | 'html' | 'autre'` ;
- `ResumeDocumentCadre` : source, nom, type, taille, date éventuelle et aperçu disponible ;
- un résultat de lecture discriminé : texte, octets d’aperçu ou métadonnées seules ;
- résultats explicites pour collision, absence, taille excessive et format invalide.

Le renderer ne reçoit jamais de chemin absolu. Chaque opération transmet seulement une source
et un nom validé par le main process.

Règles minimales :

- rejeter chemin absolu, `/`, `\\`, `..`, octet nul et noms de plateforme réservés ;
- ignorer dossiers, liens symboliques, temporaires et fichiers cachés ;
- vérifier que la cible résolue reste sous `DocsCadre/` ou sous les exemples embarqués ;
- encoder chaque segment lors de la construction d’un chemin WebDAV ou d’une URL Nextcloud ;
- ne jamais ouvrir une URL ou un chemin fourni directement par le renderer ;
- borner les contenus transmis en mémoire pour aperçu ;
- utiliser un transfert streamé pour enregistrer une copie distante volumineuse.

## 6. API main/preload

Ajouter un espace `window.sonal.docsCadre`, déclaré à la fois dans
`src/preload/index.ts` et `src/renderer/env.d.ts` :

```text
lister()
lireApercu(source, nom)
ajouterFichier()
renommer(ancienNom, nouveauNom)
supprimer(nom)
ouvrirAvecApplication(nom)
ouvrirDossierLocal()
enregistrerCopie(source, nom)
ouvrirDansNextcloud()
```

`ajouterFichier()` ouvre le sélecteur dans le main process et copie la source choisie ; son
chemin absolu ne traverse pas le pont. `enregistrerCopie()` ouvre un dialogue de destination et
écrit ou télécharge le fichier original, en flux pour les fichiers distants volumineux.

Les contrats d’ajout, renommage et suppression refusent explicitement un corpus distant dans le
main process, même si le renderer appelle l’IPC par erreur. Les exemples refusent également
toute mutation.

### 6.1 Service local

Créer un module main dédié, plutôt que d’ajouter toute la logique à `CorpusStore` :

- résolution de la racine du corpus courant ;
- inventaire, catégorisation et tri des fichiers ;
- lecture texte ou binaire bornée pour aperçu ;
- copie atomique d’un fichier choisi ;
- renommage sans écrasement ;
- déplacement vers la corbeille ;
- ouverture sécurisée avec l’application système ;
- ouverture du dossier avec le gestionnaire de fichiers ;
- copie exacte vers une destination choisie ;
- lecture des ressources exemples en développement et en application empaquetée.

Le module reçoit la racine autorisée depuis le contexte de corpus ; il ne choisit jamais un
corpus à partir d’un chemin envoyé par l’interface.

### 6.2 Lecture distante

Réutiliser le `ClientWebDAV` du corpus distant actif :

- `PROPFIND DocsCadre` pour l’inventaire et les tailles ;
- `GET DocsCadre/<nom>` seulement pour un aperçu pris en charge et borné ;
- téléchargement streamé vers la destination choisie pour « Enregistrer une copie » ;
- 404 du dossier traité comme inventaire vide ;
- autres erreurs réseau rendues compréhensibles dans la fenêtre ;
- aucune méthode PUT, MKCOL, MOVE ou DELETE disponible dans ce parcours.

La liste est rechargée à chaque ouverture de la fenêtre et par une action d’actualisation. Une
sélection déclenche une lecture fraîche seulement si son type est prévisualisable et sa taille
acceptable. Une génération de requête empêche une réponse tardive d’afficher le mauvais
document après un changement rapide de sélection ou de corpus.

### 6.3 Ouvertures externes

En local, utiliser `shell.openPath` pour le fichier validé et `shell.showItemInFolder` ou
l’équivalent approprié pour `DocsCadre/`. Le renderer transmet un nom, jamais un chemin.

À distance, ajouter un IPC main utilisant `shell.openExternal` après construction et validation
de l’URL. À partir d’une racine DAV de forme :

```text
https://hote[/sous-chemin]/remote.php/dav/files/<utilisateur>/<corpus>
```

construire l’URL de l’application Fichiers vers le dossier du corpus ou `DocsCadre/` s’il existe.
N’autoriser que HTTPS, sauf les hôtes locaux déjà tolérés par le client de développement. Si la
racine ne correspond pas à une URL Nextcloud reconnue, refuser proprement plutôt que d’ouvrir
une URL approximative.

L’ouverture du fichier sélectionné lui-même n’est pas garantie : Nextcloud utilise souvent un
identifiant interne non disponible dans l’URL WebDAV. Ouvrir le dossier reste le contrat fiable.

## 7. Interface Vue

Fichiers proposés :

- `src/renderer/components/DocsCadreModale.vue` : Teleport, en-tête, fermeture et touche Escape ;
- `src/renderer/components/corpus/DocsCadre.vue` : barre latérale et panneau principal ;
- `src/renderer/components/corpus/ApercuDocCadre.vue` : texte, image ou PDF ;
- `src/renderer/components/corpus/ApercuPdf.vue` : rendu PDF.js, navigation et zoom ;
- `src/renderer/components/corpus/FicheDocCadre.vue` : métadonnées et actions externes ;
- `src/renderer/composables/corpus/useDocsCadre.ts` : inventaire, sélection, aperçu et commandes.

Coutures :

1. remplacer le bouton désactivé de `BarreOutils.vue` par « Docs cadre projet » ;
2. ajouter `docsCadreOuverts`, `afficherDocsCadre` et `fermerDocsCadre` à l’orchestration ;
3. monter la modale une fois dans `App.vue` ;
4. fermer les autres fenêtres métier à son ouverture, selon la convention existante ;
5. réinitialiser sélection, aperçus binaires et requêtes lors d’une bascule de corpus ;
6. libérer URL d’objet et buffers lors d’un changement de document ;
7. actualiser après retour de focus d’une application externe.

En distant, masquer ou désactiver clairement Ajouter, Renommer, Supprimer et Ouvrir le dossier
local. La lecture seule doit être garantie par le main process ; la bannière seule ne constitue
pas une protection.

## 8. Lots de réalisation

### Lot A — stockage et contrats

- types partagés ;
- service local sécurisé ;
- inventaire de tous les fichiers réguliers ;
- ajout, copie, renommage et mise en corbeille ;
- handlers IPC et pont preload ;
- ressources exemples minimales ;
- tests des noms et opérations atomiques.

### Lot B — fenêtre et actions locales

- activation du bouton ;
- modale et disposition gauche/droite ;
- listes, icônes, état vide et sélection ;
- fiche générique d’un document ;
- ouverture avec l’application système ;
- ouverture du dossier local ;
- actualisation après retour de focus.

### Lot C — aperçus fiables

- texte brut échappé ;
- images raster ;
- aperçu PDF.js borné sous les contraintes de sécurité actuelles ;
- limites de taille et signatures ;
- état explicite pour les formats non pris en charge.

### Lot D — consultation distante

- inventaire et lecture WebDAV directs ;
- lecture seule garantie aux trois couches interface, preload et main ;
- bannière et gestion hors ligne ;
- création de `DocsCadre/` pour les nouveaux corpus distants ;
- téléchargement streamé d’une copie ;
- ouverture sécurisée du dossier dans Nextcloud.

### Lot E — recette et documentation

- tests de composants et parcours Electron ;
- documentation utilisateur locale/distante ;
- tableau des formats pris en charge et de leurs limites ;
- carte développeur du stockage, des aperçus et de l’API ;
- vérification du paquet final avec les trois exemples embarqués.

## 9. Couverture de tests

### Tests unitaires

- validation des noms sur Linux, macOS et Windows ;
- refus des traversées de chemin et des liens symboliques ;
- liste vide si `DocsCadre/` est absent ;
- création explicite du dossier local ;
- ajout binaire sans altération et collision sans écrasement ;
- renommage conservant exactement les octets ;
- mise en corbeille sans perte ;
- ressources exemples lisibles et non modifiables ;
- texte affiché sans interprétation HTML ;
- image valide, image corrompue et fausse extension ;
- PDF valide, PDF corrompu et fichier au-dessus de la limite ;
- formats bureautiques classés sans tentative de conversion ;
- chemin validé avant toute ouverture externe.

### Tests WebDAV

- dossier distant absent donnant une liste vide ;
- inventaire de plusieurs formats et exclusion des sous-dossiers ;
- lecture d’un nom avec espaces et accents ;
- lecture binaire bornée seulement pour un aperçu accepté ;
- fichier trop volumineux non chargé pour aperçu ;
- téléchargement streamé conservant exactement les octets ;
- erreur réseau non confondue avec une liste vide ;
- aucune écriture distante disponible ;
- `DocsCadre/` créé lors de la publication d’un nouveau corpus ;
- construction sûre de l’URL Nextcloud, y compris avec un sous-chemin serveur.

Les bancs Nextcloud existants se démarrent avec `npm run nc:up` et `npm run nc-b:up`. Ne jamais
retélécharger ni reprovisionner leurs images pour ce chantier.

### Tests d’interface et e2e

- bouton renommé et actif seulement avec un corpus ouvert ;
- ordre des deux sections et message « Vous n’avez pas encore de document. » ;
- fichier déposé manuellement découvert à l’ouverture ;
- ajout d’un DOCX puis ouverture dans l’application système ;
- affichage d’un texte sans interpréter ses balises ;
- aperçu d’une image ;
- aperçu PDF avec navigation et zoom, plus repli externe ;
- format inconnu visible avec état sans aperçu ;
- exemple toujours en lecture seule ;
- corpus distant : bannière visible et mutations absentes ;
- copie du fichier original disponible sans conversion ;
- bascule rapide entre documents sans mélange de réponses ;
- actualisation après modification externe ;
- changement de corpus libérant les ressources d’aperçu.

Commandes de validation minimales :

```text
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## 10. Critères d’acceptation

Le chantier est terminé lorsque :

1. « Docs cadre projet » ouvre la fenêtre depuis les vues corpus et entretien.
2. La barre latérale gauche affiche exactement Vos Documents puis Documents exemples.
3. Tous les fichiers réguliers de premier niveau sont visibles avec leur type, même sans aperçu.
4. Un fichier ajouté ou déposé manuellement reste strictement identique à l’original.
5. Un corpus local permet d’ouvrir le document avec son application habituelle et d’accéder au
   dossier `DocsCadre/`.
6. SonalPi n’affiche aucune commande de modification du contenu ou de conversion éditable.
7. Texte et images pris en charge sont consultables sans exécuter de contenu actif.
8. Les PDF valides sous la limite sont consultables avec navigation et zoom, avec toujours un
   repli d’ouverture externe.
9. DOCX et autres formats bureautiques affichent leurs métadonnées sans conversion.
10. Les exemples embarqués sont visibles et impossibles à modifier.
11. Un corpus distant lit ses documents directement dans Nextcloud sans les placer dans le
    miroir et sans exposer de mutation.
12. Le message de lecture seule et l’action d’ouverture de Nextcloud sont présents.
13. Une absence de réseau n’efface ni ne remplace une liste déjà chargée ; l’erreur est explicite
    et les exemples restent accessibles.
14. « Enregistrer une copie » conserve exactement les octets du fichier original.
15. Aucun chemin arbitraire ou secret Nextcloud ne traverse la frontière de sécurité du renderer,
    et aucun HTML reçu du disque ou du serveur n’est exécuté.
16. Les fichiers trop volumineux ou corrompus échouent proprement sans bloquer la fenêtre.

## 11. Hors périmètre et évolutions possibles

Sont différés :

- toute édition de contenu dans SonalPi ;
- toute conversion DOCX, PDF, HTML ou texte vers un autre format ;
- Mammoth, tiptap, export Word et moteur Markdown pour cette fonctionnalité ;
- la visionneuse PDF.js complète avec recherche, annotations, formulaires et liens actifs ;
- l’édition des documents distants par WebDAV ;
- un cache hors ligne des documents distants ;
- la coédition et la résolution de conflits documentaires ;
- les aperçus spécialisés des formats bureautiques ;
- les SVG, contenus HTML actifs et médias incorporés ;
- les sous-dossiers ;
- l’OCR des PDF numérisés ;
- la duplication d’un exemple vers Vos Documents ;
- la restauration graphique depuis la corbeille ;
- la rédaction et la validation juridique des contenus exemples définitifs.

Ces évolutions ne doivent pas modifier le principe de la première version : les fichiers
originaux restent intacts et leur édition appartient à l’outil qui maîtrise réellement leur
format.
