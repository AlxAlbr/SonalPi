# Plan — Docs cadre projet : interface minimale et dépôt par glisser-déposer

> Statut : implémenté. Décisions validées avec l'utilisateur : suppression de
> Renommer/Supprimer de l'interface, dépôt par glisser-déposer sans jamais écraser,
> double-clic = ouverture externe, édition hors SonalPi (gestionnaire de fichiers en
> local, Nextcloud en distant).

## 1. Objectif

Alléger la fenêtre « Docs cadre projet » : SonalPi devient un **consultateur
+ dépôt**. La gestion des fichiers (renommer, supprimer, trier) quitte
l'interface et se fait dans l'outil qui possède vraiment les fichiers : le
gestionnaire de fichiers en local, Nextcloud en distant. L'utilisateur doit
pouvoir déposer un document (sélecteur ou glisser-déposer) sans passer par
une série d'actions, et savoir où vivent ses fichiers.

Invariant inchangé : SonalPi ne modifie JAMAIS le contenu d'un document et ne
crée aucun doublon. Le drop ne remplace jamais un fichier existant.

## 2. Interface cible

### 2.1 Barre latérale — actions toujours visibles, même à l'état vide

Ordre : actions en haut, puis « Vos Documents », puis « Documents exemples ».

Local :

| Action | Comportement |
| --- | --- |
| ＋ Ajouter un fichier | sélecteur natif (inchangé, vit dans le main) |
| Ouvrir le dossier | crée `DocsCadre/` au besoin (`resoudreDossierLocal`), ouvre le gestionnaire de fichiers |
| ⟳ Actualiser | recharger la liste (inchangé) |

Distant :

| Action | Comportement |
| --- | --- |
| Ouvrir dans Nextcloud | déplacé depuis la bannière du panneau : accessible même à l'état vide |
| ⟳ Actualiser | inchangé |

La cause du déplacement est un défaut constaté : aujourd'hui « Ouvrir le
dossier » et « Ouvrir dans Nextcloud » n'existent que dans le panneau droit,
donc seulement quand un document est sélectionné — à l'état vide (le seul où
l'on veut déposer), ils sont inaccessibles.

### 2.2 Panneau droit — sur sélection

- Fiche de métadonnées + aperçu (inchangés).
- Actions simplifiées :
  - **Ouvrir avec l'application** (primaire) — ouverture externe, édition
    possible dans l'application système ;
  - **Enregistrer une copie** — octet pour octet (inchangé).
- **Renommer et Supprimer sont retirés de l'interface.** Leur logique main
  (`renommerLocal`, `supprimerLocal`, corbeille douce) et leurs tests
  unitaires sont conservés : seul l'accès visuel disparaît. La suppression
  hors application (gestionnaire de fichiers, Nextcloud) est définitive ;
  c'est la contrepartie assumée de ce démontage.
- Double-clic sur un document de la liste de gauche = « Ouvrir avec
  l'application » (ouverture externe). Un clic simple reste l'aperçu interne,
  en lecture seule.

### 2.3 Bandeau d'aide

Dans la barre latérale, au-dessus de « Vos Documents », texte court
repliable. Local :

> Cette fenêtre propose des documents d'exemple. Si votre DPO fournit déjà
> des documents cadres, privilégiez les siens : déposez-les dans le
> sous-dossier `DocsCadre` de votre corpus (glisser-déposer, ou bouton
> « Ouvrir le dossier »). SonalPi ne modifie jamais leur contenu ; pour
> éditer ou renommer, utilisez leur application habituelle. La liste se
> rafraîchit au retour dans la fenêtre, ou avec « Actualiser ».

Distant :

> Documents lus en lecture seule sur le serveur. Pour en déposer, en
> renommer ou en supprimer, ouvrez le dossier dans Nextcloud.

Le chemin absolu n'est jamais affiché : par conception, le renderer ne reçoit
aucun chemin (`docs/dev/docs-cadre.md`). « Où sont les fichiers » est donc
indiqué par le nom du sous-dossier (`DocsCadre`) et le bouton qui l'ouvre.

## 3. Glisser-déposer

Nouveau, local uniquement.

- Toute la fenêtre de la modale est une zône de dépôt ; le survol affiche
  un surlignage « Déposez vos fichiers ici ».
- Le handler `drop` récupère `window.sonal.fichier.cheminDe(f)` (existe déjà,
  `webUtils.getPathForFile`, `preload/index.ts:420`), refuse les dossiers et
  liens, puis appelle un nouvel IPC `docsCadre:deposer(chemin)`.
- Côté main (dans le service `docsCadre.ts`, branché dans `enregistrerIpcCorpus`) :
  - refus si corpus distant (`REFUS_DOCS_CADRE_DISTANT`) ;
  - validation : fichier régulier existant (pas un dossier, pas un lien
    symbolique, pas dans la corbeille) ;
  - copie via `ajouterFichierLocal` → création de `DocsCadre/` à la demande ;
  - **collision : refus avec message explicite**, jamais d'écrasement, aucun
    renommage automatique silencieux (« Un fichier porte déjà ce nom dans
    DocsCadre. Renommez le fichier d'origine ou choisissez-en un autre. ») ;
  - le chemin d'origine ne sert que dans le main, il ne remonte pas au renderer.
- Le `preventDefault` global de `src/renderer/main.ts:8-9` reste (sinon
  l'application navigue) ; le handler local fait aussi `preventDefault` et
  `stopPropagation`.
- Après un dépôt réussi : `rafraichirDocsCadre()` ; le fichier déposé est
  sélectionné quand la liste est rechargée, s'il est le seul nouveau.
- Pas de dépôt en distant.

## 4. Messages et états

- État vide local : bandeau d'aide + les 3 actions visibles ; plus aucun
  blocage pour déposer un premier fichier.
- État vide distant : « Ouvrir dans Nextcloud » + « Actualiser » visibles.
- Erreurs de dépôt (dossier, lien, homonyme, distant) : messages explicites,
  aucun fichier modifié.
- Bandeau repliable : état ouvert/fermé mémorisé pendant la session
  (compteur de génération existant inchangé).

## 5. Ce qui ne change pas

- Aperçus (texte échappé, images, PDF.js borné), fiche, limites de taille,
  exemples embarqués immuables.
- Retour de focus → actualisation (locale uniquement), pas de surveillance
  continue.
- Lecture seule distante garantie par le main.
- Contrats partagés `src/shared/docsCadre.ts` : ajout éventuel d'un
  `ResultatDepot` ou réutilisation de `ResultatMutationDocsCadre` (collision
  explicite), sans changement de contrat pour l'existant.

## 6. Tests et documentation

- `test/docsCadre.test.ts` : dépôt distant refusé ; dossier/lien refusés ;
  copie simple ; collision refusée sans écrasement ; `DocsCadre/` créé à la
  demande.
- `test/docsCadreRenderer.test.ts` : actions visibles à l'état vide (local et
  distant) ; bandeau repliable ; double-clic lance l'ouverture externe.
- `e2e/docs-cadre.e2e.ts` : état vide → « Ouvrir le dossier » puis « Ouvrir
  dans Nextcloud » accessibles ; renommage/suppression absents de l'UI ;
  parcours de dépôt manuel existant conservé. Le drop e2e simulé si Playwright
  le permet, sinon couvert en unitaire.
- `docs/user/docs-cadre.md` : « gestion » devient « consultation + dépôt » ;
  mention du drop, du double-clic et de l'absence de renommage/suppression.
- `docs/dev/docs-cadre.md` : carte mise à jour (actions de la barre latérale,
  IPC `docsCadre:deposer`, boutons retirés de l'UI).

## 7. Hors périmètre

- Suppression réelle du code `renommerLocal` / `supprimerLocal` ou de la
  corbeille douce (conservés, tests compris).
- Restauration graphique depuis la corbeille.
- Dépôt par glisser-déposer en distant.
- Déplacement de fichiers par glisser-déposer dans la liste.
- Contenu du bandeau modifiable par l'utilisateur.