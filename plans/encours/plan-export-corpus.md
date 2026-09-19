# Plan — Export au niveau du corpus

> Statut : PHASE A TERMINÉE. Décisions produit actées en §2 ; phases B (service
> d'orchestration), C (UX) et D (e2e) restantes. Avancement détaillé en §9.
> S'appuie sur `plan-prepa-export-corpus.md` (phases A à E terminées) : projection
> indexée, pseudonymisation réelle avec rapport, document intermédiaire DOCX,
> primitives main séparées (destination, génération, écriture atomique), nommage
> de lot.

## 1. Objectif

Ajouter un bouton **« Exporter le corpus »** qui produit, en un seul
traitement, un dossier contenant les entretiens du corpus dans les formats de
lecture, réutilisables par un tiers sans SonalPi.

Le moteur d'export d'entretien est prêt à recevoir des instantanés
indépendants. L'export corpus est une **orchestration de lot** :

1. choisir les entretiens et les formats ;
2. assembler un instantané par entretien (mémoire pour l'entretien ouvert,
   fichiers natifs lus par le main pour les autres) ;
3. générer et écrire les artefacts sans rouvrir chaque entretien dans
   l'éditeur ni afficher un dialogue par fichier ;
4. produire un index récapitulatif et, sur demande, le rapport de
   pseudonymisation détaillé.

## 2. Décisions produit (actées)

### 2.1 Conditionnement

- **Un dossier** est produit (destination choisie une fois), proposé sous le
  nom `TitreDuCorpus_date` (convention de l'export d'entretien).
- Formats « par entretien » (TXT, HTML) : **un fichier par entretien**, à plat,
  nommés par `attribuerNomsUniques` (collisions de lot et du disque résolues).
- **DOCX et PDF : document combiné**, une section par entretien, produit à
  partir du document intermédiaire partagé (concaténation de
  `BlocDocumentExport` : un bloc `titre` + un bloc `section` par entretien).
  Un seul DOCX, un seul PDF (un HTML multi-sections → un seul `printToPDF`).
- Pas d'archive `.zip` (évolution ultérieure possible).

### 2.2 Formats proposés

- **TXT, DOCX, PDF, HTML** — les formats de lecture.
- **Plusieurs formats cochables en une passe** (le moteur est découplé ; un
  seul traitement lit chaque entretien une seule fois).
- **Exclus au niveau corpus** : `.sonal` (format d'archive d'un entretien, lié
  au DOM d'import ; le corpus est déjà sauvegardé tel quel) ; SRT/VTT
  (formats de sous-titrage d'un média, sans usage en lot).

### 2.3 Index

- Un fichier **`_index.txt`** à la racine du dossier : nom du corpus, date de
  l'export, puis une ligne par entretien exporté (titre, date, **nombre de
  mots** — comptés sur la projection, pas le nombre de segments).
- **Les entretiens non exportés ne figurent pas dans l'index.**
- Pas de statut réussite/échec dans l'index : les échecs sont expliqués dans
  la modale de résumé (§2.5).

### 2.4 Sélection des entretiens

- Dans la modale, étape 1 : **« tous les entretiens » coché par défaut**, avec
  possibilité de décocher des entretiens individuellement.
- La liste est triée comme la grille du corpus. Pour les grands corpus
  (80 entretiens et plus), la sélection est présentée **en colonnes**
  (grille multi-colonnes compacte), pas en liste verticale longue.
- La sélection n'est pas persistée entre deux exports.

### 2.5 Succès partiel explicite

- Chaque entretien est traité indépendamment ; un échec (fichier illisible,
  hors ligne…) **n'interrompt pas le lot** : l'entretien est sauté.
- En fin de traitement, une **modale de résumé** explique les échecs
  (`X réussis / Y échoués`) avec la raison par entretien échoué.
- Un entretien verrouillé à distance par un autre utilisateur : exporté tel
  que le fichier se présente (lecture seule, pas de verrou requis).

### 2.6 Médias

- Option « copier les médias accessibles » : **défaut oui pour HTML**, dans un
  sous-dossier `medias/` du dossier produit ; l'HTML renvoie vers ces copies
  par des chemins **relatifs** (l'export HTML devient réellement transportable ;
  l'URL est déjà résolue par le main depuis la préparation).
- Pas de copie pour les autres formats (aucun usage).
- Corpus distant sans média local résolu : pas de copie, mention dans le
  rapport (jamais de chemin absolu dans un export pseudonymisé).

### 2.7 Pseudonymisation

- La même case `anon` que l'entretien, **globale au lot** (mêmes invariants :
  pseudos configurés appliqués, jamais présenté comme anonyme, non bloquant).
- **Rapport à deux niveaux** :
  - une présentation **globale dans la modale**, au niveau du corpus
    (synthèse : entretiens concernés, volumes des trois sections) ;
  - la possibilité de **télécharger le rapport détaillé par entretien**
    (document agrégé, une section par entretien, mêmes trois sections que
    l'export d'entretien), enregistré dans le dossier produit quand demandé.
- Le rapport est construit pendant le traitement (les entretiens non ouverts
  sont lus à ce moment-là) ; il ne bloque jamais l'export.

### 2.8 Point d'entrée, progression, annulation

- Bouton **« Exporter le corpus »** dans la barre du corpus, à côté du bouton
  Actualiser de l'onglet courant, ouvrant une modale dédiée en deux étapes
  (grammaire visuelle de la modale d'export d'entretien) :
  - étape 1 : sélection des entretiens ;
  - étape 2 : formats + options + pseudonymisation + rapport.
- **Progression par entretien** : « 12 / 30 — Titre… » (état occupé, modale
  non fermable par erreur pendant le traitement).
- **Annulation** : arrête le lot après l'entretien courant (jamais au milieu
  d'un fichier, les écritures restent atomiques) ; le dossier partiel reste en
  l'état, le résumé explique ce qui a été fait et ce qui a été arrêté.
- Pas de reprise d'un lot interrompu.

### 2.9 Contenu par entretien

Les options par format (en-tête, notes publiques, variables, coordonnées,
locuteurs, thèmes, pseudonymisation) s'appliquent **par entretien**, comme à
l'export d'entretien : notes publiques et variables de chaque entretien sortent
dans sa section. Les notes privées et variables privées ne sortent jamais.

## 3. Hors périmètre

- Archive `.zip`, reprise d'un lot interrompu ;
- SRT/VTT et `.sonal` au niveau corpus ;
- sélection persistée entre deux exports ;
- publication de l'export vers le corpus distant ;
- tout changement au moteur d'entretien déjà acquis (golden `.sonal`,
  projection, formats) — au plus des consommateurs de plus.

## 4. Invariants à préserver

- Tous les invariants de la préparation s'appliquent au lot : un export est
  une photographie, les générateurs ne lisent ni le store, ni l'éditeur
  vivant, ni le disque ; aucune donnée privée ne sort ; aucun contenu
  utilisateur n'interpole du HTML/CSS/WebVTT actif ; écritures atomiques.
- Un instantané d'entretien non ouvert est assemblé par le main à partir des
  fichiers natifs et des définitions du corpus — le moteur ne rouvre jamais
  l'entretien dans l'éditeur.
- Un échec d'un entretien est toujours visible ; le lot n'échoue jamais en
  silence.
- Aucun fichier existant n'est écrasé silencieusement (`attribuerNomsUniques`
  sur TOUTE la liste avant écriture).
- L'entretien actuellement ouvert s'exporte depuis l'état en mémoire, sans
  `sauver()` (garantie structurelle du service d'entretien).

## 5. Architecture cible

### 5.1 Module partagé (extensions de `src/shared/export/`)

```text
src/shared/export/
  corpus.ts          # DemandeExportCorpus, ResultatExportCorpus, EntreeIndexCorpus,
                     # états d'avancement, types du résumé final
  documentCorpus.ts  # concaténation de sections entretiens en un DocumentExport combiné
```

- `compterMots` : comptage sur la projection (segments aplatis), partagé.
- L'index (`_index.txt`) est un générateur texte pur du module partagé.
- Aucune dépendance Vue, Electron, DOM ou store, comme le reste du module.

### 5.2 Instantanés des entretiens non ouverts

- Le main connaît déjà la lecture d'un entretien natif (`corpus:lireEntretien`).
- Nouvelle IPC : assembler un **`InstantaneEntretienExport`** complet (payload
  + définitions du corpus : codebook, variables, règles) pour un identifiant
  donné, sans ouvrir l'entretien dans l'éditeur et sans verrou d'écriture.
- Le contrat `InstantaneEntretienExport` est inchangé : le même instantané
  alimente le moteur, quel que soit son origine (mémoire du renderer ou
  lecture main).

### 5.3 Orchestration : le renderer pilote la boucle

- Nouveau service `src/renderer/services/exportCorpus.ts` (sans Vue) :
  - boucle **séquentielle, entretien par entretien** : pour chaque entretien,
    obtenir l'instantané (mémoire ou IPC) → audit de pseudonymisation →
    génération (pures pour TXT/HTML ; buffers main pour DOCX/PDF) → écriture ;
  - la boucle séquentielle côté renderer rend la **progression** (« k / n »)
    et l'**annulation** triviales : interrompre, c'est ne pas envoyer
    l'entretien suivant ; aucun fichier à moitié écrit grâce aux écritures
    atomiques ;
  - les DOCX/PDF combinés sont générés en fin de lot (une fois tous les
    entretiens lus) ou à la volée par accumulation du document intermédiaire ;
  - retour typé : `Réussite` (avec chemins écrits), `Annulé` (avec état
    d'avancement), `EchecPartiel` / `Echec` (avec raison par entretien).
- Les primitives main de la préparation sont réutilisées telles quelles :
  `choisirDestination()` (une fois, pour le dossier), `ecrireFichierAtomique()`,
  génération de buffer isolée.

### 5.4 Médias copiés

- Nouvelle IPC : copier les fichiers médias résolus dans `medias/` (même
  whitelist du store que `export:audioLocal`, existence disque vérifiée) ;
  l'HTML du lot référence ces copies par chemin relatif.

### 5.5 UX

- `Corpus.vue` : bouton « Exporter le corpus » dans la barre.
- Nouvelle `ModaleExportCorpus.vue` : étapes sélection puis formats/options ;
  liste des entretiens en grille multi-colonnes ; état occupé avec progression
  ; bouton Annuler ; modale de résumé final (échecs expliqués, consultation du
  rapport global, enregistrement du rapport détaillé).

## 6. Chemin d'implémentation

### Phase A — Socle partagé

1. Types du lot (`corpus.ts`) et contrat d'instantané distant.
2. `compterMots` + tests.
3. Générateur d'index `_index.txt` (titre, date, nombre de mots ; uniquement
   les entretiens exportés) + tests.
4. `documentCorpus.ts` : combiné DOCX (sections entretiens) + tests.
5. IPC main : assemblage d'instantané pour un entretien non ouvert.

### Phase B — Service d'orchestration

1. `exportCorpus.ts` : boucle séquentielle, instantanés (mémoire / IPC),
   audit, génération, écriture atomique ; `attribuerNomsUniques` sur le lot.
2. Formats par entretien (TXT, HTML), combinés (DOCX, PDF), `_index.txt`.
3. Copie optionnelle des médias dans `medias/`, chemins relatifs dans l'HTML.
4. Rapport de pseudonymisation agrégé (une section par entretien).
5. Progression et annulation : retour typé du service.
6. Résumé final : états par entretien avec raisons d'échec.

### Phase C — UX de la modale

1. Bouton dans la barre du corpus.
2. `ModaleExportCorpus.vue` : sélection multi-colonnes (« tous » par défaut),
   formats cochables, options par format, pseudonymisation.
3. Vue globale du rapport dans la modale + enregistrement du rapport détaillé.
4. Progression « k / n — Titre… », annulation après l'entretien courant.
5. Modale de résumé (succès / échecs expliqués).

### Phase D — Tests de bout en bout et durcissement

1. E2E : export complet, sélection partielle, échec d'un entretien dans le
   lot (le reste réussit), annulation en cours de lot.
2. Corpus distant : entretiens lus sans ouverture, export en lecture seule,
   média distant non résolu (pas de copie, mention au rapport).
3. Pseudonymisation : sentinelles anti-fuite absentes des sorties du lot,
   rapport cohérent avec les options.
4. Bancs Nextcloud existants, sans téléchargement ni re-provisionnement.

## 7. Stratégie de tests

### 7.1 Unitaires (module partagé)

- `compterMots` sur la projection (textes vides, annotations, multicodages) ;
- index : contenu, ordre, exclusion des entretiens échoués ;
- combiné DOCX : une section par entretien, ordre de la sélection, en-têtes ;
- rapport agrégé : trois sections par entretien, adapté aux options ;
- options applicables par format au niveau corpus.

### 7.2 IPC et main

- assemblage d'instantané d'un entretien non ouvert (payload + définitions) ;
- échec de lecture remonté typé, sans interrompre le lot ;
- copie des médias : whitelist, existence, chemins relatifs dans l'HTML ;
- écritures atomiques, jamais d'écrasement silencieux.

### 7.3 Service renderer

- boucle séquentielle : progression correcte, annulation après l'entretien
  courant, dossier partiel cohérent ;
- entretien ouvert exporté depuis la mémoire (aucune écriture déclenchée) ;
- réussite partielle : index sans les échecs, résumé avec raisons.

### 7.4 Composants et E2E

- ouverture/fermeture de la modale à l'étape 1, sélection « tous » par défaut ;
- grille de sélection en colonnes sur un corpus de 80 entretiens ;
- changement de format → options recalculées ;
- export TXT + DOCX en une passe (un seul traitement) ;
- export pseudonymisé du corpus : sentinelles absentes, rapport téléchargeable ;
- corpus distant hors ligne : résumé avec échecs expliqués.

## 8. Critères de sortie

- Export d'un corpus local complet : dossier avec les fichiers choisis,
  `_index.txt` correct (titre, date, nombre de mots), DOCX/PDF combinés
  lisibles avec une section par entretien.
- Sélection partielle et annulation produisent un dossier cohérent, un résumé
  exact, sans fichier partiel ni écrasement silencieux.
- Un entretien illisible est sauté, expliqué dans le résumé, absent de l'index ;
  le reste du lot réussit.
- L'entretien ouvert s'exporte depuis la mémoire sans persistance déclenchée.
- Pseudonymisation : sentinelles absentes des sorties du lot, rapport global
  consultable dans la modale et détaillé téléchargeable.
- HTML du lot transportable (médias copiés, chemins relatifs) quand l'option
  est activée ; aucune mention de chemin absolu dans un lot pseudonymisé.
- Générateurs du lot purs (sans Vue, Electron, DOM) ; le moteur d'entretien
  reste inchangé (golden `.sonal` bit à bit).
- Tests ciblés, typecheck et build passants.

## 9. Avancement

### Fait — phase A (socle partagé)

Suite complète verte (1113 tests), typecheck et build propres.

- `src/shared/export/corpus.ts` :
  - `assemblerInstantaneCorpus(id, fichier, corpus, audioLocal)` — instantané
    d'un entretien NON ouvert, depuis le fichier natif lu et les définitions du
    corpus (codebook et variables triés par ordre, règles, brouillons, notes,
    replis de legacy `{ tabAnon: null, notes: '' }`, titre et date depuis
    membership) ;
  - `compterMots(e)` — mots de la transcription, même token de mot que la
    projection (mots accentués compris), ni ponctuation ni espaces ;
  - `texteIndexCorpus(nomCorpus, dateExport, lignes)` — index `_index.txt` :
    identité du corpus, date de l'export, une ligne par entretien EXPORTÉ
    (titre, date optionnelle, nombre de mots) ; les échecs n'y figurent jamais ;
  - `ResultatInstantaneCorpus` — succès ou échec typé, jamais une exception
    qui rompt le lot.
- `src/shared/export/documentCorpus.ts` — `documentCombine` : un bloc `titre`
  (Heading 1 Word) par entretien, ses blocs conservés, séparés par une ligne
  vide ; aucun contenu interprété.
- `src/shared/export/types.ts` — `InstantaneEntretienExport.date?: string | null`
  (additif, pour l'index du lot).
- `src/main/exportCorpus.ts` — `assemblerInstantaneDistant(store, id)` :
  `store.ouvrir()` + `store.lireEntretien(id)` sans verrou d'écriture, audio
  résolu par `urlAudioLocal`, échec typé avec titre et raison (absent ou
  version non prise en charge).
- IPC `export:instantaneCorpus` (main + preload + `env.d.ts`) :
  `window.sonal.export.instantaneCorpus(id)`.
- `test/exportCorpus.test.ts` : 10 tests (assemblage et replis, comptage de
  mots, index avec et sans pluriel, lot vide, combiné : titres, séparateurs,
  lot vide, marqueurs littéraux préservés).
