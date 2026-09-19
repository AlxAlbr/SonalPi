# Docs cadre projet — carte développeur

Le bouton **Docs cadre projet** ouvre l'espace documentaire propre au corpus courant :
notice de consentement, guides de méthode, consignes internes, fichiers Word ou PDF.

Décision structurante : SonalPi conserve les documents dans leur format d'origine et
ne modifie JAMAIS leur contenu, en local comme à distance. L'édition est confiée à
l'application habituelle du poste ou à Nextcloud ; SonalPi assure l'inventaire, quelques
aperçus fiables et l'accès aux fichiers. Il n'existe aucune conversion et aucun doublon.

## Stockage

```text
<corpus>/
├── corpus.json            (aucun champ ajouté, aucune migration)
├── entretiens/
├── DocsCadre/             ← documents du corpus (premier niveau uniquement)
└── corbeille/
    └── DocsCadre/         ← suppression douce (nom non destructif)
```

- `DocsCadre/` est créé à la première ouverture explicite du dossier, au premier ajout
  ou à la première copie ; l'utilisateur peut ensuite y déposer ses fichiers à la main.
- Copies et renommages locaux créent leur cible de façon exclusive et n'écrasent jamais
  une cible existante : les collisions sont retournées à l'interface avec un nom libre proposé.
- Aucun fichier dérivé persistant n'est produit pour les aperçus.

### Corpus distant : absence volontaire de miroir

Le miroir n'inventorie que la racine, `entretiens/` et les JSON attendus ; `DocsCadre/`
n'y entre pas et la politique n'est PAS étendue. La consultation est une lecture WebDAV
directe : version du serveur au moment de la lecture, aucune copie locale confondable
avec une version éditable, aucun verrou ni conflit documentaire, binaires hors du tirage.
Contrepartie assumée : pas de consultation hors ligne (erreur explicite, exemples toujours
disponibles). `PublieurCorpus` crée `DocsCadre/` pour un nouveau corpus ; un ancien corpus
sans ce dossier est traité comme vide (404 → liste vide, jamais de création cachée).

## Contrats partagés (`src/shared/docsCadre.ts`)

Module pur partagé main/preload/renderer/tests : `SourceDocumentCadre`, `ModeDocumentsCadre`,
`TypeDocumentCadre`, `ResumeDocumentCadre`, `InventaireDocsCadre`, `ApercuDocumentCadre`
(texte / octets d’image ou PDF / absence expliquée) et `ResultatMutationDocsCadre` (collisions
explicites, jamais d'écrasement). Fonctions pures : `estNomSain` (portabilité : séparateurs,
noms réservés Windows, contrôle, point/espace final — casse et accents conservés),
`estListable` (cachés, `~$…`, temporaires exclus), `categoriserDocument`, `nomLibre`,
`trierDocuments` (locale fr), `trierExemplesDocs` (ordre défini des exemples : les noms
déclarés dans `NOMS_EXEMPLES_DOCS` d'abord, les autres ensuite par ordre alphabétique) et
les limites d'aperçu (`LIMITE_APERCU_TEXTE_OCTETS`,
`LIMITE_APERCU_BINAIRE_OCTETS`, `LIMITE_APERCU_PDF_OCTETS`).

Le renderer ne reçoit jamais de chemin absolu : chaque opération transmet une source
(`'projet' | 'exemple'`) et un nom validé par le main.

## Côté main

- `src/main/docsCadre.ts` — service local, PUR d'Electron (fs seul, testable headless) :
  inventaire du premier niveau, lecture bornée (texte UTF-8 strict ; images et PDF avec
  contrôle de signature), ajout copié, dépôt glisser-déposer (`deposerFichierLocal` :
  fichier régulier exigé, homonyme refusé sans écrasement), renommage sans écrasement,
  corbeille (logiques conservées, boutons retirés), résolution de chemin validée pour
  l'ouverture externe, exemples embarqués (inventaire dans l'ordre de `NOMS_EXEMPLES_DOCS`).
- `src/main/docsCadreDistant.ts` : inventaire et aperçu par `ClientWebDAV` du miroir actif
  (`PROPFIND DocsCadre` ; `GET` streamé et borné pour les aperçus acceptés ; copie exacte
  streamée via `getBinaireFichier`), `urlNextcloudPourCorpus` (HTTPS ou hôte local ;
  racine non reconnue → null, refus propre).
- Handlers IPC dans `enregistrerIpcCorpus` (`docsCadre:*`) : les racines (corpus courant,
  exemples embarqués) sont résolues ICI, jamais depuis l'IPC. Les mutations refusent un
  corpus distant dans le main, même si le renderer appelle l'IPC par erreur. Le dépôt
  (`docsCadre:deposer`) reçoit le chemin d'un fichier glissé — il n'existe que dans le
  main (validation fichier régulier, refus distant). Les dialogues natifs (ajout, destination
  de copie) vivent côté main ; leur chemin ne traverse pas le pont. `shell.openPath` /
  `shell.openExternal` ne reçoivent que des cibles construites et validées côté main.

## Côté renderer

- `composables/corpus/useDocsCadre.ts` : inventaire, sélection (compteur de génération :
  une réponse tardive ne s'affiche jamais après un changement de document), dépôt par
  glisser-déposer (copie, refus d'un homonyme sans renommage automatique), messages,
  confirmation de suppression (IPC conservé, bouton retiré de l'UI). Une erreur réseau
  préserve la liste chargée et les exemples. Actualisation après retour de focus (locale
  uniquement) — pas de surveillance continue.
- `components/DocsCadreModale.vue` (Teleport, Escape), `corpus/DocsCadre.vue` (barre
  latérale + panneau). La barre latérale porte les actions toujours accessibles (local :
  Ajouter, Ouvrir le dossier, Actualiser ; distant : Ouvrir dans Nextcloud, Actualiser) et
  un bandeau d'aide repliable indiquant où vivent les documents. Le double-clic sur un
  document du corpus ouvre l'application externe. `corpus/FicheDocCadre.vue` (métadonnées),
  `corpus/ApercuDocCadre.vue` (texte mustache-échappé ; URL d'objet image créée et révoquée
  au composant), `corpus/ApercuPdf.vue` (PDF.js local, rendu canvas, navigation et zoom).
- La gestion (renommer, supprimer) a été retirée de l'interface : les IPC
  `docsCadre:renommer` et `docsCadre:supprimer` et la corbeille douce restent dans le main
  (tests conservés) mais ne sont plus exposés à l'utilisateur.
- Coutures : `BarreOutils.vue` (bouton actif), `composables/sonal.ts` (fenêtre unique :
  ouverture referme cas/recueils/tableau de bord, et réciproquement ; bascule de corpus →
  `reinitialiserDocsCadre`), `App.vue` (montage de la modale).

## Aperçu PDF

La visionneuse PDF native de Chromium n’existe pas dans le paquet Electron distribué.
L’aperçu utilise donc `pdfjs-dist`, embarqué localement avec son worker. Le composant rend
une page à la fois dans un canvas et expose uniquement navigation et zoom. Il ne monte pas
les couches de liens, formulaires, annotations ou pièces jointes. Les octets sont contrôlés
et bornés à 30 Mo avant d’atteindre le renderer. L’ouverture externe reste disponible.

## Tests

- `test/docsCadre.test.ts` : noms portables, inventaire, ajout binaire sans altération,
  collisions, dépôt glisser-déposer (fichier exigé, homonyme refusé), corbeille, aperçus
  (texte échappé, encodage refusé, signatures, limites), exemples embarqués, sécurité des
  chemins, PDF valide/corrompu/trop volumineux.
- `test/docsCadreDistant.test.ts` : inventaire WebDAV (dossier absent = liste vide, 404
  forcé, sous-dossiers exclus), GET réservé aux aperçus acceptés, tailles bornées, copie
  streamée exacte, création du dossier à la publication, URL Nextcloud (sous-chemin,
  accents, HTTP local uniquement).
- `test/docsCadreRenderer.test.ts` : ouverture/fermeture, listes préservées en cas
  d'erreur, génération anti-réponse-tardive, garde de forme, mutations et messages,
  dépôt (copie + sélection, homonyme refusé, source non ordinaire).
- `e2e/docs-cadre.e2e.ts` : bouton actif, ordre des sections, état vide avec actions
  accessibles, aperçu d'exemple immuable, aperçu PDF avec zoom, ajout et persistance,
  absence de renommage/suppression dans l'interface, dépôt manuel découvert.

Bancs Nextcloud : `npm run nc:up` / `npm run nc-b:up` suffisent ; ne JAMAIS retélécharger
ni reprovisionner les images pour ce chantier.
