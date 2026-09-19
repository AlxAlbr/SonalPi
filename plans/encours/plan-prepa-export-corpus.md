# Plan — Préparation de l'export au niveau du corpus

> Statut : PHASE TERMINÉE (A à E). Commits « Export : pseudonymisation réelle,
> audit préalable, durcissement CSS/PDF », « Export : document intermédiaire
> DOCX, WebVTT/SRT fidèles, audio résolu par le main », « Export : projection
> indexée (fin du comportement quadratique) + test de charge », « Export :
> projection, pseudonymisation et contrats déplacés dans le module partagé ;
> notes converties sans DOM », puis « Export : service renderer + instantané
> sans sauvegarde, primitives main séparées, nommage de lot ».
> Avancement détaillé en §12 ; décisions produit prises en §4 (reportées dans
> le corps du fichier).
> Périmètre : fiabiliser et découpler l'export d'un entretien, puis fournir les
> abstractions nécessaires à un futur export de corpus. Ce plan ne définit pas
> encore l'UX ni le conditionnement final de l'export corpus.

## 1. Objectif

L'export d'entretien constitue une bonne première base : projection JSON
commune, formats multiples, tests golden du `.sonal`, séparation entre renderer
et main pour les écritures binaires.

Il ne doit cependant pas être répliqué tel quel au niveau du corpus. La
préparation poursuit cinq objectifs :

1. garantir le sens exact de l'option de pseudonymisation ;
2. fermer les risques d'injection HTML/CSS et sécuriser l'impression PDF ;
3. corriger les pertes ou altérations de contenu dans les formats existants ;
4. rendre la projection efficace sur de longs entretiens et sur un lot ;
5. découpler la génération de l'entretien actuellement ouvert, du DOM et du
   dialogue de sauvegarde d'un fichier unique.

Le résultat attendu est un moteur capable de recevoir des instantanés
indépendants d'entretiens. L'export corpus pourra ensuite orchestrer ce moteur
sans rouvrir chaque entretien dans l'éditeur.

## 2. Hors périmètre

Cette préparation ne tranche pas encore :

- si un export corpus produit un document combiné, un dossier ou une archive ;
- quels formats sont proposés au niveau corpus ;
- si les médias sont copiés, embarqués ou seulement référencés ;
- la sélection de tous les entretiens ou d'un sous-ensemble ;
- l'UX de progression et d'annulation du futur traitement par lot.

Les contrats créés ici doivent permettre ces choix sans imposer une nouvelle
refonte.

## 3. Invariants à préserver

- L'export `.sonal` normal reste bit à bit identique pour les cas golden.
- Un export est une photographie : les générateurs ne lisent ni le store, ni
  l'éditeur vivant, ni le disque.
- Une opération d'export reste possible en lecture seule.
- Les notes et variables privées ne sortent jamais dans un format documentaire.
- Aucun contenu utilisateur ne devient du HTML, du CSS ou du WebVTT actif par
  simple interpolation.
- Le renderer ne reçoit pas un accès général au système de fichiers.
- Un échec d'export est visible par l'utilisateur ; aucune promesse rejetée ne
  reste silencieuse.

La sortie du `.sonal` pseudonymisé pourra volontairement changer : son contrat
actuel est précisément l'un des problèmes à corriger.

## 4. Décisions produit à prendre avant le code

### 4.1 Sens de « pseudonymiser »

Deux contrats sont possibles :

1. **Mode strict, recommandé** : le fichier produit ne contient aucun vrai nom
   connu ni aucune donnée marquée privée. L'export est bloqué si une occurrence
   à pseudonymiser ou un locuteur inclus n'a pas de pseudo exploitable.
2. **Mode d'application partielle** : seuls les pseudonymes configurés sont
   appliqués. Ce mode ne doit pas s'appeler « anonymisé » et doit afficher un
   avertissement explicite.

Il faut également décider du traitement des éléments libres qui peuvent rester
identifiants sans être couverts par une règle :

- titre de l'entretien ;
- notes publiques ;
- modalités de variables publiques ;
- noms de catégories ;
- nom et chemin du média.

Le moteur doit produire un rapport avant génération, même si le choix final est
le mode partiel.

### 4.2 `.sonal` pseudonymisé

Le choix doit être explicite :

- soit il s'agit d'un transfert SonalPi1 encore réimportable, qui peut conserver
  certaines métadonnées et ne doit pas être présenté comme anonyme ;
- soit il s'agit d'une copie réellement pseudonymisée, qui remplace aussi les
  tables de locuteurs, retire les vrais noms et exclut les notes privées.

La compatibilité de réimport ne justifie pas silencieusement la présence des
identifiants réels dans un fichier suffixé `_anonymise`.

## 5. Défauts à corriger avant généralisation

### 5.1 Pseudonymisation incomplète

`sonalAnonymise()` réutilise actuellement les tables normales : les vrais noms
restent dans `tabLoc` et dans `data-nomloc`. Les anciennes notes SonalPi1 sont
également réémises, alors qu'elles sont migrées comme notes privées.

Les formats documentaires conservent aussi le vrai nom d'un locuteur sans
pseudo ou dont le pseudo est refusé. Une occurrence anonymisée sans pseudo peut
rester en clair.

Créer un audit central, par exemple :

```ts
interface RapportPseudonymisationExport {
  bloquants: ProblemeExport[]
  avertissements: ProblemeExport[]
}
```

L'audit couvre au minimum :

- occurrences anonymisées sans pseudo ;
- locuteurs affichés sans pseudo utilisable ;
- présence de vrais noms dans les tables et attributs `.sonal` ;
- notes privées et `legacy.notes` ;
- variables privées ;
- règles et brouillons d'anonymisation ;
- chemin audio absolu ;
- champs libres non inspectables automatiquement.

### 5.2 Injection HTML/CSS et PDF

Les codes et couleurs provenant d'un `.sonal` importé ne sont pas suffisamment
contraints avant d'être interpolés dans les classes, les sélecteurs CSS et les
styles de l'export HTML.

Mesures attendues :

- ne jamais utiliser directement un `codeExport` comme jeton CSS ; construire
  un identifiant CSS sûr et déterministe pour le rendu ;
- accepter uniquement les formes de couleurs réellement prises en charge ou
  les normaliser avant rendu ;
- borner et valider les tailles de texte ;
- échapper chaque valeur selon son contexte : texte HTML, attribut HTML, CSS ou
  syntaxe WebVTT ;
- imprimer le PDF dans une `BrowserWindow` sandboxée, avec JavaScript désactivé,
  navigation et création de fenêtres refusées ;
- employer un fichier temporaire unique, créé de manière sûre et toujours
  nettoyé.

Le script interactif du HTML autonome n'est pas nécessaire à l'impression PDF.
La variante imprimée peut donc être produite sans script.

### 5.3 DOCX structuré

Le protocole `{g}` et `**…**` est ambigu : une transcription contenant
littéralement ces chaînes est modifiée. Avec temps et locuteur activés, `{g}`
peut en outre apparaître après l'horodatage et ne plus être reconnu par le main.

Remplacer ce mini-langage par un document intermédiaire partagé :

```ts
interface DocumentExport {
  blocs: BlocDocumentExport[]
}

interface BlocDocumentExport {
  type: 'titre' | 'section' | 'paragraphe' | 'espace'
  runs?: Array<{ texte: string; gras?: boolean; italique?: boolean }>
}
```

Le TXT aplatit cette structure. Le DOCX la convertit en paragraphes et
`TextRun`. Un futur document corpus pourra concaténer plusieurs sections sans
réinterpréter des marqueurs textuels.

### 5.4 WebVTT, SRT et coordonnées

Corriger et tester :

- l'échappement du texte et des noms WebVTT ;
- l'émission de toutes les catégories d'un fragment multicodé ;
- l'arrondi des temps avant leur décomposition, afin de ne jamais produire
  `00:00:60.000` ;
- les valeurs temporelles négatives, non finies ou inversées ;
- les textes contenant des chaînes ressemblant à des balises ou à des
  séparateurs de cue.

### 5.5 HTML et audio

L'option « coordonnées temporelles » doit retirer toutes les coordonnées, y
compris celles des boutons de lecture.

La présence d'un `audioRef` dans le modèle ne prouve pas que le fichier est
accessible sur le poste courant. La préparation du contexte doit fournir une
référence audio déjà résolue et vérifiée :

- `null` pour un média absent ou inaccessible ;
- `null` pour un corpus distant tant qu'aucune ressource locale valide n'est
  explicitement résolue ;
- une URL correctement construite pour le HTML local, sans concaténation
  manuelle de `file://`.

Le chemin absolu local ne doit pas apparaître dans un export pseudonymisé sans
une décision explicite.

### 5.6 Options et modale

- Corriger `optionsEfficaces()` en parcourant toutes les options connues et en
  mettant à `false` celles qui ne s'appliquent pas au format.
- Remplacer le tuple ambigu `[activée, cochéeParDéfaut]` par un objet nommé, ou
  appliquer réellement les deux valeurs.
- Réinitialiser la modale à l'étape des formats à chaque ouverture.
- Ajouter un état occupé pendant la génération.
- Conserver la modale ou afficher un message global si l'export échoue.
- Ne fermer définitivement la modale qu'après ouverture réussie du dialogue ou
  prise en charge explicite de l'annulation.

### 5.7 Sauts et cas limites de projection

Vérifier notamment :

- un `hardBreak` au début ou à la fin d'un bloc ;
- plusieurs `hardBreak` consécutifs ;
- les blocs vides ;
- plusieurs ancres à la même position ;
- les annotations qui traversent plusieurs blocs ;
- les annotations orphelines ou superposées ;
- les locuteurs absents du tableau.

## 6. Performance de la projection

La projection actuelle recalcule les tranches d'une annotation en parcourant
tous les blocs, puis répète ce calcul pour chaque couple bloc/annotation. Cette
structure peut approcher une complexité `O(blocs² × annotations)`.

La remplacer par une préparation indexée :

1. calculer une seule fois les bornes ProseMirror de chaque bloc ;
2. localiser les positions par recherche dichotomique ou parcours monotone ;
3. projeter chaque ancre une seule fois dans son bloc ;
4. projeter chaque annotation une seule fois vers les blocs qu'elle traverse ;
5. stocker `ancresParBloc` et `annotationsParBloc` ;
6. construire ensuite les segments bloc par bloc sans balayage global.

Indexer également les locuteurs et catégories dans des `Map` préparées une
fois, plutôt que de répéter des `find()` dans les boucles.

Ajouter un test de charge synthétique avec plusieurs milliers de blocs, des
ancres et des annotations. Le test doit surtout détecter une régression
quadratique ; un seuil temporel généreux peut compléter une assertion sur le
nombre d'éléments parcourus.

## 7. Architecture cible

### 7.1 Module partagé d'export

Créer un espace dédié, par exemple :

```text
src/shared/export/
  types.ts
  projectionEntretien.ts
  pseudonymisation.ts
  documentExport.ts
  formatsTexte.ts
  nomsFichiers.ts
```

Ce module contient :

- `OptionsExport` et les capacités de chaque format ;
- les types d'instantané d'entretien ;
- la projection segmentée ;
- l'audit et la transformation de pseudonymisation ;
- le document intermédiaire structuré ;
- les générateurs textuels purs ;
- le nommage sûr et déterministe des fichiers.

Il ne dépend ni de Vue, ni d'Electron, ni d'un `Document` global, ni du store.
La dépendance actuelle de `projection.ts` vers le type défini dans
`exportSonal.ts` disparaît : les deux consomment un type partagé.

Le code de compatibilité SonalPi1 peut rester sous `renderer/import` tant qu'il
est lié au DOM d'import. La projection et les contrats d'export n'ont pas à
rester dans un dossier nommé `import`.

### 7.2 Notes sans DOM global

La conversion des notes en texte utilise actuellement `document`. Deux voies
sont possibles :

- normaliser le corps des notes en texte lors de la construction de
  l'instantané ;
- fournir un convertisseur pur limité au sous-ensemble HTML déjà sanitisé des
  notes.

Le générateur ne doit pas lire implicitement `globalThis.document`. Les tests
Node et le main doivent pouvoir l'appeler sans environnement navigateur.

### 7.3 Préparateur d'instantané

Introduire un contrat indépendant de l'éditeur :

```ts
interface InstantaneEntretienExport {
  id: string
  titre: string
  entretien: EntreeExport
  notesPubliques: NoteExport[]
  audioLocal: string | null
}
```

Le renderer sait construire l'instantané de l'entretien ouvert depuis l'état en
mémoire. Cette opération ne doit pas appeler automatiquement `sauver()` :

- si l'entretien est modifiable, l'instantané courant suffit pour l'export ;
- si une persistance est souhaitée, elle est une étape distincte ;
- si l'entretien est en lecture seule, l'export reste autorisé.

Pour les entretiens non ouverts, le futur export corpus demandera au main de
lire les fichiers natifs et d'assembler les mêmes instantanés avec les
définitions du corpus.

### 7.4 Service renderer dédié

Extraire la logique aujourd'hui placée dans `useOperationsCorpus.ts` vers un
service ou composable dédié à l'export d'entretien. Il orchestre :

1. construction de l'instantané ;
2. audit préalable ;
3. génération pure ou demande de génération binaire ;
4. retour typé `succès | annulation | erreur` ;
5. présentation de l'erreur dans l'interface.

`useOperationsCorpus.ts` ne conserve que l'action d'ouverture de la modale.

### 7.5 Main : séparer génération, destination et écriture

Les IPC DOCX/PDF actuels combinent génération, dialogue de sauvegarde et
écriture. Cette forme convient à un fichier unique, mais pas à un lot.

Séparer conceptuellement :

- choix d'une destination ;
- génération d'un artefact texte ou binaire ;
- écriture atomique ;
- nettoyage des temporaires.

Le contrat public peut continuer à proposer une commande simple pour l'export
d'entretien. En interne, les fonctions deviennent réutilisables sans afficher
un dialogue par artefact. Le futur export corpus pourra choisir une destination
une seule fois.

## 8. Nommage préparé pour les lots

Créer un helper commun qui :

- remplace les caractères interdits sur les plateformes prises en charge ;
- traite les noms Windows réservés, les points et espaces finaux ;
- borne la longueur tout en conservant l'extension ;
- fournit un repli pour un titre vide ;
- résout les collisions de manière déterministe, par exemple
  `Entretien.txt`, `Entretien (2).txt` ;
- n'écrase jamais silencieusement un fichier existant.

Le helper travaille sur toute la liste des noms avant l'écriture. Il sera ainsi
réutilisable tel quel par l'export corpus.

## 9. Chemin d'implémentation

### Phase A — Filets de sécurité

1. Ajouter les tests qui démontrent les défauts actuels.
2. Conserver les golden de l'export `.sonal` normal.
3. Ajouter des fixtures contenant de faux identifiants reconnaissables, des
   codes/couleurs hostiles, des multicodages et des textes à marqueurs DOCX.
4. Ajouter un test d'export en lecture seule sans appel d'écriture.

### Phase B — Confidentialité et sécurité

1. Introduire le rapport de pseudonymisation.
2. Appliquer la décision produit au `.sonal` et aux formats documentaires.
3. Exclure systématiquement les données privées.
4. Sécuriser les identifiants CSS et les valeurs de style.
5. Durcir la fenêtre PDF et les fichiers temporaires.
6. Vérifier qu'aucun identifiant sentinelle n'apparaît dans une sortie déclarée
   pseudonymisée.

### Phase C — Fidélité des formats

1. Introduire le document intermédiaire structuré.
2. Réécrire la construction DOCX sans marqueurs textuels.
3. Corriger WebVTT, SRT, temps, multicodages et sauts de ligne.
4. Corriger la résolution audio et l'option de coordonnées HTML.
5. Corriger la matrice d'options et le cycle de vie de la modale.

### Phase D — Performance

1. Indexer les blocs, ancres, annotations, locuteurs et catégories.
2. Conserver la sortie `.sonal` normale bit à bit.
3. Exécuter le test de charge et comparer les résultats fonctionnels avant et
   après optimisation.

### Phase E — Découplage

1. Déplacer types, projection et fonctions pures dans le module partagé.
2. Supprimer la dépendance au DOM global pour les notes.
3. Extraire le service renderer d'export.
4. Introduire le préparateur d'instantané sans sauvegarde obligatoire.
5. Séparer les primitives main de génération et d'écriture.
6. Ajouter le nommage de lot avec résolution des collisions.

## 10. Stratégie de tests

### 10.1 Unitaires

- options applicables et valeurs par défaut de chaque format ;
- audit strict et partiel de pseudonymisation ;
- absence de noms réels, notes privées, règles et chemins sensibles ;
- échappement HTML, attribut, CSS et WebVTT ;
- multicodage WebVTT ;
- arrondis aux changements de seconde, minute et heure ;
- document structuré vers TXT et DOCX ;
- chaînes littérales `{g}` et `**texte**` préservées ;
- noms de fichiers invalides, réservés et dupliqués ;
- projection de tous les cas limites de blocs et annotations ;
- charge synthétique de projection.

Pour le DOCX, inspecter au minimum `word/document.xml` dans l'archive produite,
plutôt que de tester seulement le DTO transmis au main.

### 10.2 IPC et main

- annulation du dialogue sans écriture ;
- erreur d'écriture remontée au renderer ;
- temporaire PDF unique et nettoyé après succès ou échec ;
- JavaScript et navigation désactivés pendant l'impression ;
- génération de plusieurs artefacts sans dialogue intermédiaire.

### 10.3 Composants et E2E

- fermeture et réouverture de la modale à l'étape 1 ;
- valeurs par défaut recalculées lors d'un changement de format ;
- message visible en cas d'échec ;
- export d'un entretien local ;
- export d'un entretien distant en lecture seule ;
- absence de player pour un média distant ou manquant ;
- export pseudonymisé refusé ou averti lorsqu'il est incomplet.

Les bancs Nextcloud existants sont utilisés sans téléchargement ni
re-provisionnement d'images.

## 11. Critères de sortie

La préparation est terminée lorsque :

- l'export `.sonal` normal passe toujours les golden octet par octet ;
- aucune sortie déclarée pseudonymisée ne contient les identifiants sentinelles
  des tests ;
- les formats documentaires n'exportent aucune note ou variable privée ;
- un codebook hostile ne peut produire ni balise ni script exécutable ;
- le DOCX préserve exactement les marqueurs textuels saisis par l'utilisateur ;
- WebVTT conserve les multicodages et les caractères spéciaux ;
- l'export fonctionne sans écriture sur un entretien en lecture seule ;
- la projection ne présente plus de comportement quadratique sur le corpus de
  charge ;
- les générateurs purs s'exécutent sans Vue, Electron ni DOM global ;
- le main peut générer et écrire plusieurs artefacts après un seul choix de
  destination ;
- les tests ciblés, le typecheck et le build passent.

À ce stade, le chantier « export corpus » peut se concentrer sur les décisions
produit, l'UX de sélection et l'orchestration du lot, sans reprendre les
fondations de l'export entretien.

## 12. Avancement

### Fait — phases A et B

Commit : « Export : pseudonymisation réelle, audit préalable, durcissement CSS/PDF »
(branche `multiongletcorpus`). Suite complète verte (1067 tests), typecheck
main et renderer propres. Golden `.sonal` normal inchangés.

**Décisions produit prises (§4)**

- Pseudonymisation = **mode strict par défaut** : l'export est bloqué tant
  qu'une occurrence à pseudonymiser ou un locuteur affiché n'a pas de pseudo
  exploitable. Un mode **partiel** est sélectionnable dans la modale ; il
  n'est jamais appelé « anonymisé » et affiche un avertissement explicite.
- Le `.sonal` pseudonymisé est une **copie réellement pseudonymisée** :
  tabLoc porte les pseudos, data-nomloc disparaît, notes legacy (migrées
  privées) et variables privées exclues, reste réimportable dans SonalPi1.
- Le chemin absolu du média ne sort jamais d'un export pseudonymisé
  (pas de player sans décision explicite).

**Fichiers créés**

- `src/renderer/import/pseudonymisation.ts` : audit pré-génération
  (`auditerPseudonymisation`, modes strict/partiel, rapport bloquants /
  avertissements, `rapportEnTexte`).
- `src/shared/export/secuCss.ts` : garde-fous CSS partagés (couleurs HEX
  validées, tailles bornées [8, 72], identifiant de classe sûr
  `idCssCode`, empreinte FNV-1a `scat-…`).
- `test/fixtures/export/entretiens.ts` : sentinelles anti-fuite
  (`NomRéel-SENTINELLE-*`, notes legacy hostiles), codebook hostile
  (code et couleur injectants), multicodage, textes à marqueurs DOCX.
- `test/exportSecu.test.ts`, `test/pseudonymisationExport.test.ts`.

**Fichiers modifiés**

- `src/renderer/import/exportSonal.ts` : `sonalAnonymise` = copie
  pseudonymisée (tables, notes, variables privées) ; couleur du codebook
  validée HEX avant transport.
- `src/renderer/import/projection.ts` : `appliquerAnonymisation` met
  toujours `nomloc` à null ; `htmlDeSegment` accepte un `classeDeCode`
  (code → classe CSS sûre).
- `src/renderer/import/exportFormats.ts` : page autonome avec classes
  sûres, CSS de thèmes sécurisé ; audio absent des exports pseudonymisés ;
  `optionsEfficaces` parcourt TOUTES les options connues.
- `src/renderer/import/legacy/sonal.mjs` : `cssFromCodebook` n'interpole
  que des HEX valides et des tailles bornées (le sélecteur reste le code
  brut : format SonalPi1 gelé).
- `src/main/securiteFenetre.ts` : `preferencesImpressionPdf` (sandbox,
  JS désactivé, navigation/fenêtres refusées) — testable unitairement.
- `src/main/exportEntretien.ts` : impression PDF via dossier temporaire
  `mkdtemp` toujours nettoyé, fenêtre sandboxée.
- `src/renderer/composables/corpus/useOperationsCorpus.ts` : `exporter()`
  audit l'entretien avant génération (bloquants en strict) et retourne un
  `ResultatExport` typé (succès | annulation | bloqué | erreur).
- `src/renderer/components/entretien/ModaleExportEntretien.vue` : retour à
  l'étape 1 à chaque ouverture, état occupé, bloquants/erreurs affichés et
  restés visibles, fermeture après succès ou annulation explicite,
  choix strict/partiel + avertissement quand anon est coché.
- `test/exportFormats.test.ts`, `test/projection.test.ts`,
  `test/securiteFenetre.test.ts` : contrats `.sonal` pseudonymisé et
  preferences impression mis à jour.

### Fait — phase C

Commit : « Export : document intermédiaire DOCX, WebVTT/SRT fidèles, audio
résolu par le main ». Suite complète verte (1080 tests), typecheck et build
propres. Golden `.sonal` normal inchangés.

- **Document intermédiaire** : `src/shared/export/documentExport.ts`
  (`RunTexteExport`, `BlocDocumentExport` titre/section/paragraphe/espace,
  `sectionDocument`, `texteDocument` aplati TXT). Le corps TXT/DOCX est
  construit par `corpsDocument` (exportFormats) : le gras de l'interviewer
  est un run nommé, plus aucun marqueur `{g}`/`**…**` interprété — ces
  chaînes sortent littéralement (testé en TXT et dans `word/document.xml`).
- **DOCX** : `DemandeExportDocx` transporte le document structuré ; le main
  le convertit en Paragraphes/TextRuns (`construireDocxBuffer` réécrit).
  Tests du buffer réel via JSZip (test/exportDocx.test.ts).
- **WebVTT/SRT** : arrondi aux millisecondes AVANT décomposition
  (`msCue`/`horodatageCue`, jamais « 00:00:60 ») ; cues non finis ou
  inversés écartés, temps négatifs ramenés à 0 ; texte et noms échappés
  (`echapperVtt`) ; SRT neutralise un `-->` littéral ; TOUTES les
  catégories d'un fragment multicodé émises en classes imbriquées avec
  identifiant sûr (`idCssCode`).
- **Audio** : IPC `export:audioLocal` — le main résout l'audioRef en URL
  `file://` vérifiée (whitelist du store + existence disque,
  `urlAudioLocal`) ; `ContexteExport.audioUrl` porte une URL déjà résolue
  (plus de concaténation `file://` dans le renderer) ; null si média absent
  ou inaccessible, ou pour un corpus distant.
- **HTML** : l'option « Coordonnées temporelles » décochée retire aussi les
  boutons de lecture (le player reste si l'URL est résolue) ; URL du player
  échappée en attribut.
- **Modale** : `CONFIG_OPTIONS` en objets nommés `{ activee, defaut }`
  (plus de tuple `[activée, cochéeParDéfaut]`).

### Fait — phase D

Commit : « Export : projection indexée (fin du comportement quadratique) +
test de charge ». Suite complète verte (1083 tests), typecheck et build
propres, golden `.sonal` normal inchangés (bit à bit).

- **Indexation de la projection** (`projection.ts`) :
  - tranches de CHAQUE annotation calculées UNE SEULE fois puis réparties
    par bloc (`annsParBloc`) — l'ancien recalcul par couple bloc×annotation
    approchait `O(blocs² × annotations)` ;
  - ancres localisées une fois par dichotomie (`blocDe`) puis réparties
    (`ancresParBloc`, bornes de cue et coupes internes) ;
  - dichotomie aussi pour `platDe` (comptage des sauts, relSauts triés) et
    pour les bornes de `tranchesPlates` (seuls les blocs intersectant la
    plage sont parcourus) ;
  - locuteurs indexés dans un `Map` préparé une fois (premier homonyme
    gagnant, sémantique du `find()` remplacé).
- **Indexation des générateurs** (`exportFormats.ts`) : codebook et
  locuteurs indexés en `Map` (`indexCodebook` / `indexLocuteurs`), un find
  par fragment/segment supprimé dans TXT/DOCX/HTML.
- **Test de charge** (`test/projectionCharge.test.ts`) : corpus synthétique
  8 000 blocs / 800 ancres / 400 codages traversant des centaines de blocs.
  Mesures AVANT/APRÈS : 232/1450/10195/80571 ms → 16/23/45/86 ms ;
  assertions : contenu complet et ordonné sur le gros corpus, ratio
  sous-quadratique (4× la taille ≈ 4× le temps, marge 8×), seuil temporel
  généreux (5 s pour un corpus qui prenait 80 s).

### Fait — phase E

Deux commits : « Export : projection, pseudonymisation et contrats déplacés
dans le module partagé ; notes converties sans DOM », puis « Export : service
renderer + instantané sans sauvegarde, primitives main séparées, nommage de
lot ». Suite complète verte (1103 tests), typecheck et build propres.

- **Module partagé `src/shared/export/`** — `types.ts` (EntreeExport,
  LegacyBlobs, OptionsExport, matrice des formats, ContexteExport,
  InstantaneEntretienExport, optionsEfficaces ; nomFichierExport
  réexporté), `projectionEntretien.ts`, `pseudonymisation.ts`,
  `formatsTexte.ts`, `documentExport.ts`, `secuCss.ts`, `notesTexte.ts`,
  `nomsFichiers.ts`. Aucune dépendance Vue/Electron/DOM ; la dépendance de
  projection.ts vers exportSonal.ts a disparu (type partagé). Le renderer
  garde `import/exportSonal.ts` (sérialisation `.sonal`, liée au DOM
  d'import) et `import/importSonal.ts` ; le `.sonal` reste la seule voie
  d'archivage.
- **Notes sans DOM global** : `notesTexte.ts` convertit le sous-HTML
  sanitisé (texte, mark → ▸…◂, em) en texte PUR ; `corpsNoteEnTexte`
  n'a plus de paramètre `Document` (renderer, tests Node) ; les
  générateurs ne lisent jamais `globalThis.document`.
- **Préparateur d'instantané** : `InstantaneEntretienExport` (§7.3) et
  `construireInstantane()` — photographie de l'état MÉMOIRE de l'entretien
  ouvert, sans `sauver()` (décision §7.3 : l'export n'est pas une
  persistance ; l'entretien en lecture seule s'exporte autant qu'un autre).
  L'audio arrive déjà résolu (URL vérifiée par le main ou null).
- **Service renderer d'export** : `src/renderer/services/exportEntretien.ts`
  (sans Vue) orchestre instantané → audit → génération → écriture, et
  retourne un `ResultatExport` typé. `SourceExportEntretien` n'expose
  AUCUNE fonction d'écriture : la garantie « un instantané ne déclenche
  jamais de sauvegarde » est structurelle. `useOperationsCorpus.ts` ne
  conserve que l'état de la modale et une délégation mince.
- **Primitives main séparées** (§7.5) : `choisirDestination()` (dialogue
  dédié), `ecrireFichierAtomique()` (temporaire + rename dans le dossier
  cible, toujours nettoyé), génération de buffer déjà isolée — les IPC
  DOCX/PDF composent ces primitives ; un lot pourra choisir la destination
  une fois et générer plusieurs artefacts sans dialogue intermédiaire.
- **Nommage de lot** (§8) : `nomsFichiers.ts` — `nettoyerBaseNom`
  (caractères interdits trois plateformes, noms réservés Windows,
  points/espaces finaux, longueur bornée extension comprise, repli si vide),
  `attribuerNomsUniques` (collisions du lot ET du disque résolues de façon
  déterministe `Entretien (2).txt`, rang avant extension, jamais d'écrasement
  silencieux, travaillant sur TOUTE la liste avant écriture).
- **Tests** : `test/exportEntretienService.test.ts` (instantané sans
  écriture, garantie structurelle « aucune fonction d'écriture dans la
  source », TXT/DOCX, blocage strict, annulation, échec typé),
  `test/nomsFichiers.test.ts`, et le test « export lecture seule sans
  écriture » de la phase A (§9) : couvert par le contrat du service
  (aucune écriture dans la source, export d'une version non enregistrée).
  DOCX : tests des primitives main (destination annulée, plusieurs
  artefacts après UN choix, atomie).

### Critères de sortie (§11) — vérifiés

Voir §11 : golden `.sonal` bit à bit (suite verte), sentinelles absentes des
sorties pseudonymisées, marqueurs DOCX préservés, WebVTT fidèle, projection
non quadratique, générateurs purs sans Vue/Electron/DOM, main capable de
générer et d'écrire plusieurs artefacts après un seul choix de destination,
tests ciblés + typecheck + build passants. Le chantier « export corpus » peut
commencer : ses décisions restantes (conditionnement, formats, UX, sélection)
sont listées en §2.
