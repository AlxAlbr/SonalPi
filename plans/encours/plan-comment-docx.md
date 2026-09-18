# Plan — Exporter les annotations comme commentaires Word dans le DOCX

> Statut : à implémenter.
>
> Périmètre : export d’un entretien au format `.docx` uniquement. Les
> « commentaires » visés ici sont les annotations de transcription de type
> `commentaire`, et non les notes structurées de l’entretien.

## 1. Objectif

Permettre à l’utilisateur d’inclure les commentaires posés sur la
transcription dans l’export DOCX sous forme de **véritables commentaires Word** :

- le passage concerné est la plage commentée dans Word ;
- le texte de l’annotation devient le corps du commentaire ;
- son auteur devient l’auteur du commentaire Word ;
- plusieurs commentaires restent indépendants ;
- les commentaires orphelins ou sans plage exportable ne sont pas émis ;
- les autres formats d’export et le `.sonal` restent inchangés.

La bibliothèque `docx` déjà installée en version `9.7.1` fournit les primitives
nécessaires : `CommentRangeStart`, `CommentRangeEnd`, `CommentReference` et
l’option `Document.comments`. Aucune manipulation manuelle de l’OOXML ne doit
être nécessaire en production.

## 2. État actuel et raison du changement d’architecture

### 2.1 Données disponibles

Une annotation de commentaire possède déjà toutes les données utiles dans
`src/shared/entretien/annotation.ts` :

- `id` stable sous forme de chaîne ;
- `from` et `to`, positions ProseMirror absolues ;
- `auteur` ;
- `texte` ;
- `type: 'commentaire'`.

Les positions sont remappées pendant l’édition. Une annotation dont
`from >= to` est considérée comme orpheline.

### 2.2 Perte d’information dans le flux DOCX actuel

Le flux actuel est :

1. `genererDonneesDocx()` dans
   `src/renderer/import/exportFormats.ts` projette l’entretien ;
2. `corpsTexte()` transforme les fragments en une seule chaîne ;
3. le renderer envoie `DemandeExportDocx.contenuTxt` par IPC ;
4. `construireDocxBuffer()` dans `src/main/exportEntretien.ts` redécoupe la
   chaîne sur les retours à la ligne et crée les paragraphes Word.

À l’étape 2, les plages et les identités des commentaires sont perdues. Il ne
faut pas tenter de recalculer les positions à partir de `contenuTxt`, car cette
chaîne contient aussi des éléments qui n’existent pas dans le modèle :
horodatages, noms des locuteurs, libellés de thèmes, espaces de présentation et
marqueurs de gras.

### 2.3 Limite de la projection actuelle

`projeterSegments()` connaît les frontières des commentaires, mais ses champs
`obs` et `finObs` répondent aux contraintes historiques du format SonalPi1 :

- une seule ouverture est conservée à une position donnée ;
- la fermeture ne porte pas l’identité du commentaire ;
- des commentaires superposés peuvent donc perdre leur association.

Ces champs doivent rester inchangés pour éviter une régression de l’export
`.sonal`. Le DOCX doit utiliser une représentation additive qui conserve tous
les identifiants.

## 3. Décisions fonctionnelles proposées

Ces décisions doivent être validées avant l’implémentation de l’interface.

### 3.1 Option d’export

Ajouter une option **« Commentaires Word »** :

- visible uniquement pour le format DOCX ;
- décochée par défaut, afin de ne pas exporter des données potentiellement
  sensibles sans action explicite ;
- sans effet sur les autres formats.

L’option doit être nommée `commentaires` dans `OptionsExport`.

### 3.2 Export anonymisé

L’anonymisation automatique ne peut pas nettoyer le texte libre ni le nom de
l’auteur d’un commentaire. La politique proposée est donc :

- autoriser la combinaison « Anonymiser » + « Commentaires Word » ;
- afficher dans la modale un avertissement lorsque les deux cases sont
  cochées : le contenu et l’auteur des commentaires sont exportés tels quels ;
- ne jamais prétendre que les commentaires eux-mêmes ont été anonymisés ;
- conserver l’option décochée par défaut.

Une politique plus stricte pourra être choisie avant développement : désactiver
les commentaires lorsque `anon` est coché. Dans ce cas, les tests et les
critères d’acceptation devront refléter ce blocage au lieu de l’avertissement.

### 3.3 Métadonnées Word

- Associer localement chaque `Annotation.id` à un entier DOCX séquentiel
  `0..n-1`. Ne pas convertir ni hacher directement l’identifiant texte.
- Utiliser `annotation.auteur.trim()` comme auteur Word.
- Pour un auteur vide, utiliser le libellé `Sans auteur`.
- Ne pas renseigner de date : le modèle ne stocke pas la date de création du
  commentaire. Utiliser la date d’export donnerait une information trompeuse.
- Ne pas générer de commentaires résolus ni de fils de discussion : le modèle
  ne porte pas ces notions.

### 3.4 Plages particulières

- Ignorer les annotations orphelines (`from >= to`).
- Ignorer une annotation dont aucune partie ne rencontre le document projeté.
- Une annotation traversant plusieurs fragments, cues ou paragraphes produit
  un seul commentaire Word.
- Les préfixes ajoutés par l’export — temps, locuteur et thème — restent hors de
  la plage commentée.
- Les commentaires partageant une borne, imbriqués ou croisés doivent rester
  distincts. Leur compatibilité réelle sera vérifiée dans Word et LibreOffice.

## 4. Architecture cible

Le renderer continue de prendre en charge la projection du modèle et les
options d’export. Le main reste responsable de la création binaire du DOCX.
Les objets de la bibliothèque `docx` ne traversent jamais l’IPC.

### 4.1 Représentation additive dans la projection

Enrichir `FragmentProjete` dans `src/renderer/import/projection.ts` avec des
événements complets, par exemple :

```ts
export interface CommentaireProjete {
  id: string
  auteur: string
  texte: string
  from: number
  to: number
}

export interface FragmentProjete {
  // Champs existants.
  commentairesDebut: CommentaireProjete[]
  commentairesFin: CommentaireProjete[]
}
```

Les bornes `from` et `to` facilitent l’ordre stable des événements qui partagent
une position. Il est aussi possible de ne transporter que l’id dans les
fragments et de conserver les métadonnées dans un registre séparé, à condition
que le résultat demeure pur et entièrement testable.

Règles de remplissage :

- une ouverture est posée seulement sur le premier fragment rencontré par le
  commentaire ;
- une fermeture est posée seulement sur le dernier fragment rencontré ;
- toutes les ouvertures et fermetures sont conservées ;
- `obs` et `finObs` continuent d’être calculés comme aujourd’hui pour
  l’export SonalPi1 ;
- `appliquerAnonymisation()` conserve ces événements lors de la copie des
  segments.

Ordre déterministe proposé lorsque plusieurs événements partagent une borne :

- ouvertures : plage la plus longue d’abord, puis ordre d’origine des
  annotations ;
- fermetures : plage la plus courte d’abord, puis ordre inverse des ouvertures ;
- une fermeture située à la même position qu’une nouvelle ouverture est émise
  avant cette nouvelle ouverture.

Les marqueurs OOXML sont des jalons et peuvent représenter des plages croisées,
mais l’ordre doit rester stable pour produire des fichiers reproductibles.

### 4.2 Contrat IPC structuré

Remplacer le corps textuel du DOCX par un DTO sérialisable défini dans
`src/shared/format.ts`. Proposition :

```ts
export interface CommentaireExportDocx {
  id: number
  auteur: string
  texte: string
}

export interface FragmentExportDocx {
  texte: string
  gras?: boolean
  commentairesDebut?: number[]
  commentairesFin?: number[]
}

export interface ParagrapheExportDocx {
  fragments: FragmentExportDocx[]
  espacementApres?: number
}

export interface DemandeExportDocx {
  nomSuggere: string
  titre: string
  entete: boolean
  notes: string
  variables: string
  contenu: ParagrapheExportDocx[]
  commentaires: CommentaireExportDocx[]
}
```

Les noms définitifs pourront être ajustés, mais le contrat doit respecter les
principes suivants :

- aucun type provenant de `docx` dans `src/shared/format.ts` ;
- aucune position ProseMirror envoyée au main ;
- les événements portent déjà les identifiants numériques attendus par Word ;
- les textes ajoutés par la mise en page sont des fragments séparés, sans
  marqueurs de commentaire ;
- le main ne doit pas avoir à reconstruire les plages.

Les sections Notes et Variables peuvent rester textuelles : les commentaires
ne concernent que la transcription. Leur passage immédiat au même DTO est
possible, mais n’est pas nécessaire à ce chantier.

### 4.3 Construction structurée du contenu DOCX

Créer dans `src/renderer/import/exportFormats.ts` une voie dédiée, par exemple
`corpsDocx()`, au lieu de réutiliser `corpsTexte()`.

Cette fonction doit reproduire la présentation actuelle :

- paragraphe d’horodatage/locuteur/thème au début d’un tour ;
- transcription organisée selon les blocs de l’éditeur ;
- séparation entre deux tours ;
- retours internes issus des `hardBreak` ;
- gras des lignes d’interviewer ;
- options `time`, `loc` et `thm` ;
- pseudonymisation lorsque `anon` est cochée.

Elle doit en plus :

- produire des fragments plutôt qu’une chaîne ;
- placer les ouvertures avant le premier texte concerné ;
- placer les fermetures après le dernier texte concerné ;
- ne placer aucun événement sur les préfixes de présentation ;
- attribuer les ids DOCX dans un ordre déterministe ;
- exclure entièrement les événements quand `commentaires` est faux.

`genererDonneesDocx()` retourne ensuite le DTO complet.

### 4.4 Génération dans le main

Adapter `src/main/exportEntretien.ts` :

1. importer `CommentRangeStart`, `CommentRangeEnd` et `CommentReference` ;
2. convertir chaque `ParagrapheExportDocx` en `Paragraph` ;
3. pour chaque fragment :
   - émettre les `CommentRangeStart` avant son `TextRun` ;
   - émettre le `TextRun` avec son style ;
   - émettre les `CommentRangeEnd` après le texte ;
   - ajouter un `CommentReference` pour chaque commentaire fermé ;
4. fournir les corps de commentaires à `new Document({ comments: ... })` ;
5. ne créer aucune partie `comments.xml` si la liste est vide ;
6. conserver les sections, titres, notes, variables et espacements existants.

La structure attendue pour un commentaire simple est :

```ts
new Document({
  comments: {
    children: [{
      id: 0,
      author: 'Alice',
      children: [new Paragraph({
        children: [new TextRun('Texte du commentaire')],
      })],
    }],
  },
  sections: [{
    children: [new Paragraph({
      children: [
        new CommentRangeStart(0),
        new TextRun('passage commenté'),
        new CommentRangeEnd(0),
        new CommentReference(0),
      ],
    })],
  }],
})
```

## 5. Étapes d’implémentation

### Étape 1 — Verrouiller les décisions fonctionnelles

1. Valider le libellé et le défaut de l’option `commentaires`.
2. Valider la politique de combinaison avec `anon` : avertissement ou blocage.
3. Valider le libellé d’auteur vide.
4. Constituer manuellement un entretien de contrôle comprenant :
   - commentaire simple ;
   - commentaire sur plusieurs paragraphes ;
   - deux commentaires aux mêmes bornes ;
   - commentaires imbriqués et croisés ;
   - commentaire rencontrant une anonymisation.

**Livrable :** décisions inscrites en tête de ce plan avant modification du
code.

### Étape 2 — Ajouter les événements de commentaires à la projection

1. Ajouter le type projeté complet.
2. Construire les registres d’ouverture et de fermeture par borne locale sans
   écraser les doublons.
3. Conserver les champs `obs`/`finObs` existants et leur sortie `.sonal`.
4. Trier les événements de manière déterministe.
5. Vérifier que `appliquerAnonymisation()` transporte les nouveaux champs.
6. Ajouter les tests de projection avant de brancher le DOCX.

**Fichiers principaux :**

- `src/renderer/import/projection.ts` ;
- `test/projection.test.ts` ;
- éventuellement `test/exportSonalGolden.test.ts` pour confirmer l’absence de
  régression.

**Livrable :** une projection capable de représenter tous les commentaires,
sans changement de l’export `.sonal`.

### Étape 3 — Définir le DTO DOCX partagé

1. Ajouter les interfaces de paragraphes, fragments et commentaires DOCX dans
   `src/shared/format.ts`.
2. Remplacer `contenuTxt` par le corps structuré dans `DemandeExportDocx`.
3. Laisser TypeScript signaler tous les consommateurs à adapter.
4. Vérifier que la charge reste clonable par Electron IPC.

**Fichiers concernés :**

- `src/shared/format.ts` ;
- `src/preload/index.ts` ;
- `src/renderer/env.d.ts` ;
- `src/renderer/composables/corpus/useOperationsCorpus.ts`.

Les trois derniers ne devraient nécessiter qu’un ajustement de type ou aucun
changement fonctionnel.

### Étape 4 — Produire le corps DOCX structuré dans le renderer

1. Extraire les règles de mise en page actuellement enfermées dans
   `corpsTexte()` afin d’éviter deux implémentations divergentes.
2. Construire les paragraphes et fragments DOCX à partir des segments projetés.
3. Introduire le mapping `Annotation.id` vers l’id numérique Word.
4. Attacher les événements seulement aux fragments de transcription.
5. Préserver le gras, les hardBreaks et les séparations de tours.
6. Ajouter l’option `commentaires` à `OptionsExport`, `CONFIG_OPTIONS` et
   `LIBELLES_OPTIONS`.
7. Mettre à jour toutes les constantes `OptionsExport` des tests.

**Fichiers principaux :**

- `src/renderer/import/exportFormats.ts` ;
- `test/exportFormats.test.ts`.

**Livrable :** `genererDonneesDocx()` produit une charge structurée complète,
testable sans Electron.

### Étape 5 — Générer les commentaires Word dans le main

1. Adapter `construireDocxBuffer()` au DTO.
2. Ajouter les définitions dans `Document.comments.children`.
3. Émettre les jalons start/end/reference dans les paragraphes.
4. Conserver les sections Notes et Variables.
5. Vérifier le cas sans commentaire et le cas option décochée.
6. Vérifier que les caractères accentués, XML sensibles et retours dans le
   corps d’un commentaire sont correctement échappés par `docx`.

**Fichier principal :** `src/main/exportEntretien.ts`.

**Livrable :** un buffer DOCX contenant `word/comments.xml` uniquement lorsque
cela est nécessaire.

### Étape 6 — Finaliser l’interface et la confidentialité

1. Initialiser `commentaires` dans
   `src/renderer/components/entretien/ModaleExportEntretien.vue`.
2. Afficher l’option seulement pour le DOCX via `CONFIG_OPTIONS`.
3. Ajouter l’avertissement lorsque `anon && commentaires`, ou implémenter le
   blocage retenu à l’étape 1.
4. Vérifier le retour entre les panneaux de la modale et la réinitialisation des
   défauts lors d’un changement de format.
5. Ajouter un test de composant si l’infrastructure actuelle le permet ; sinon,
   couvrir au minimum `optionsEfficaces()` par test unitaire.

**Livrable :** aucune inclusion silencieuse des commentaires et une politique
d’anonymisation visible.

### Étape 7 — Compatibilité et non-régression

1. Générer les fichiers de contrôle.
2. Les ouvrir dans Microsoft Word et LibreOffice Writer.
3. Vérifier visuellement :
   - auteur et corps ;
   - sélection exacte du passage ;
   - commentaire multi-paragraphes ;
   - commentaires aux mêmes bornes ;
   - plages imbriquées ;
   - plages croisées ;
   - texte anonymisé ;
   - accents et ponctuation ;
   - document sans commentaire.
4. Si un client refuse les plages croisées, documenter précisément son
   comportement avant de choisir un repli. Ne pas fusionner silencieusement
   des commentaires distincts.
5. Exécuter les tests et la compilation complète.

## 6. Traitement de l’anonymisation

Ce point mérite un test dédié avant de considérer le chantier terminé.
`appliquerAnonymisation()` remplace le texte de chaque fragment anonymisé par
`[pseudo]`. Or les frontières d’un commentaire peuvent découper une occurrence
anonymisée en plusieurs fragments. Une application fragment par fragment peut
alors répéter le pseudonyme.

Politique de rendu proposée :

- une occurrence anonymisée doit produire un seul `[pseudo]`, quelles que soient
  les frontières de codages ou de commentaires internes ;
- un commentaire qui englobe l’occurrence couvre `[pseudo]` ;
- un commentaire entièrement inclus dans l’occurrence est rattaché à
  `[pseudo]`, puisque le texte source correspondant n’existe plus dans le
  document exporté ;
- un commentaire qui commence ou finit dans l’occurrence voit sa borne rabattue
  sur le début ou la fin de `[pseudo]` ;
- plusieurs commentaires internes peuvent donc commenter la même chaîne
  `[pseudo]`, mais restent des objets Word distincts.

Pour rendre cette règle fiable, la projection doit conserver l’identité de
l’annotation d’anonymisation, ou le générateur DOCX doit disposer d’un registre
équivalent. Il ne faut pas se contenter de comparer le pseudonyme : deux
annotations différentes peuvent employer la même valeur.

Si ce défaut est confirmé dans les autres exports, sa correction générale dans
`appliquerAnonymisation()` est préférable. Elle devra alors être accompagnée de
tests de non-régression TXT, HTML, DOCX et `.sonal` anonymisé.

## 7. Plan de tests automatisés

### 7.1 Projection — `test/projection.test.ts`

Ajouter les cas suivants :

- commentaire simple sur un fragment ;
- deux ouvertures à la même position ;
- deux fermetures à la même position ;
- deux commentaires de mêmes bornes ;
- commentaires imbriqués ;
- commentaires croisés ;
- commentaire traversant une ancre temporelle ;
- commentaire traversant deux paragraphes ;
- commentaire autour d’un `hardBreak` ;
- commentaire orphelin ;
- borne hors du contenu projetable ;
- ordre stable des événements.

Conserver les assertions existantes sur `obs` et `finObs`.

### 7.2 DTO renderer — `test/exportFormats.test.ts`

Vérifier :

- métadonnées et ids numériques des commentaires ;
- start/end associés au même id ;
- préfixes temps/locuteur/thème hors plage ;
- option décochée : registre et événements vides ;
- option cochée : tous les commentaires valides présents ;
- auteur vide ;
- contenu Unicode et caractères XML ;
- commentaire multi-paragraphes ;
- anonymisation englobante, incluse et partiellement croisée ;
- aucun vrai nom dans le corps exporté hors commentaire lorsque `anon` est
  actif ;
- application de la politique explicite au texte libre des commentaires.

### 7.3 Buffer DOCX — nouveau `test/exportEntretien.test.ts`

Appeler directement `construireDocxBuffer()` puis inspecter l’archive DOCX.
Ajouter `jszip` comme dépendance de développement explicite si elle est utilisée
par le test ; ne pas dépendre implicitement de sa présence transitive via
`docx`.

Contrôler :

- présence de `word/comments.xml` ;
- relation depuis `word/document.xml.rels` ;
- déclaration dans `[Content_Types].xml` ;
- correspondance des ids entre définition, start, end et reference ;
- ordre `start → texte → end → reference` ;
- auteur et contenu échappés ;
- plusieurs commentaires conservés ;
- absence de partie comments quand la liste est vide ;
- titres, notes, variables et gras toujours présents.

Les assertions doivent cibler la structure XML, pas une sérialisation complète
susceptible de changer avec une mise à jour mineure de `docx`.

### 7.4 Non-régression

Commandes minimales :

```bash
npm test -- --run test/projection.test.ts test/exportFormats.test.ts test/exportEntretien.test.ts
npm run typecheck
npm run build
npm test
```

L’export `.sonal` doit conserver ses tests golden inchangés.

## 8. Critères d’acceptation

Le chantier est terminé lorsque :

- l’option « Commentaires Word » est disponible uniquement pour le DOCX ;
- elle est désactivée par défaut ;
- un commentaire simple s’ouvre comme un véritable commentaire dans Word et
  LibreOffice ;
- auteur, texte et passage associé correspondent au modèle ;
- les préfixes de présentation ne font jamais partie de la plage ;
- les commentaires multi-paragraphes et superposés ne sont ni perdus ni
  fusionnés silencieusement ;
- les orphelins ne produisent aucun objet Word ;
- la politique d’anonymisation est explicite dans l’interface et couverte par
  les tests ;
- un export sans commentaires reste visuellement équivalent à l’export actuel ;
- les tests golden `.sonal`, le typecheck, le build et la suite Vitest passent ;
- les fichiers de contrôle ont été ouverts manuellement dans Word et
  LibreOffice.

## 9. Risques et replis

| Risque | Prévention | Repli explicite |
| --- | --- | --- |
| Plages croisées interprétées différemment selon les logiciels | Fichiers de contrôle Word + LibreOffice | Documenter et demander une décision produit ; ne pas fusionner silencieusement |
| Duplication d’un pseudo lorsqu’un commentaire découpe une anonymisation | Conserver l’id de l’annotation anon et tester les intersections | Corriger la transformation d’anonymisation avant activation de l’option |
| Fuite d’information dans auteur/texte libre | Option décochée et avertissement visible | Bloquer la combinaison avec `anon` si cette politique est retenue |
| Régression du `.sonal` | Champs DOCX additifs, `obs`/`finObs` inchangés, golden tests | Revenir sur la projection DOCX sans toucher au sérialiseur SonalPi1 |
| Divergence entre corps TXT et DOCX | Extraire des règles de mise en page partagées | Tests comparant le texte visible des deux représentations |
| Archive correcte mais rendu client incorrect | Validation manuelle des cas limites | Réduire seulement le cas non compatible après décision explicite |

## 10. Estimation

- Projection multi-commentaires et DTO : environ 1 journée.
- Génération DOCX et tests d’archive : environ 1 journée.
- Anonymisation, interface et cas limites : environ 1 journée.
- Validation Word/LibreOffice et corrections : 0,5 à 1 journée.

Estimation totale : **2,5 à 4 jours**, selon le comportement des plages croisées
et l’ampleur de la correction nécessaire pour l’anonymisation.