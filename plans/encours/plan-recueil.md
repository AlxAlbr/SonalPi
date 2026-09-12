# Plan — Recueils à références vivantes

> Statut : orientation fonctionnelle validée — ajout de passages libres, indépendants des annotations.
> Premier périmètre validé : passages vivants, ajouts manuels, recueils partagés, mode pseudonymisé global par défaut, exports Markdown et texte brut.
> Le stockage des recueils dans `corpus.json` est retenu ; les autres modalités techniques et la priorité de reprise des anciens `.rcl` restent à préciser.
> Ce document ne décrit pas une fonctionnalité déjà disponible.
> Objectif : reprendre les usages éditoriaux des recueils SonalPi V1 sans faire d’une copie du texte la source de vérité.

## 1. Intention

Un recueil est un document de travail nommé, composé de titres, de textes libres et de références à des matériaux du corpus. Il permet de préparer une synthèse, organiser des citations et commenter leur rapprochement.

**Orientation retenue : sélectionner librement une portion de transcription et l’ajouter au recueil, comme en V1. Aucun codage ni commentaire préalable n’est nécessaire. L’item ne référence pas une `Annotation`.**

L’amélioration recherchée par rapport à la V1 reste le suivi des corrections de transcription. Proposition technique : créer un **repère de passage autonome** dans l’entretien et le référencer depuis le recueil. Le texte du passage est relu dans la source, pas conservé comme une copie faisant autorité.

Exemple :

1. Sélectionner un passage de l’entretien A, codé ou non, et l’ajouter au recueil.
2. Corriger la transcription à l’intérieur du passage : le recueil affiche la correction.
3. Modifier ou supprimer un codage couvrant ce passage : aucun effet sur ses bornes dans le recueil.
4. Renommer l’entretien ou le locuteur : les indications de provenance suivent.
5. Supprimer complètement le texte couvert : le repère devient orphelin et l’item est signalé, sans suppression silencieuse.

L’ordre des items et les commentaires propres au recueil restent, eux, des choix éditoriaux persistants.

## 2. Ce que fait réellement la V1

Sources examinées dans `/home/belignem/Vscode/SonalPi` :

- `modules/recueil.js` : modèle, lecture/écriture `.rcl`, panneau et menu d’ajout ;
- `modules/segmentation.js`, menu de sélection : action « Ajouter au recueil », proposée indépendamment des catégories présentes sur le passage ;
- `modules/export_recueil.js` : exports TXT, Markdown, DOCX et PDF ;
- `main.js` : handlers de fichiers et d’export.

### 2.1 Modèle

Un recueil contient `nom`, `file` et `items`. Les items sont :

- un titre : `rang`, `type`, `niveau`, `libelle` ;
- du texte libre : `rang`, `type`, `texte` ;
- un extrait : `rang`, `type`, `rgdep`, `rgfin`, `texte`, `commentaire`, `entretien`.

`creerItemExtrait()` **ne conserve aucun identifiant d’annotation**. Il conserve une provenance partielle : le nom de l’entretien et des bornes historiques. Ce n’est donc pas une absence totale de référence à la source, mais ce n’est pas un lien vivant.

Le rendu lit `item.texte`. La citation est `contentEditable` et son édition remplace ce champ. Le choix entre texte original et pseudonymisé intervient à la capture ; le code qualifie explicitement le `.rcl` d’instantané figé.

**Le diagnostic de départ est confirmé : dans ce fonctionnement, corriger la source ne recalcule pas la citation du recueil.**

### 2.2 Usages à conserver

- Créer, nommer, ouvrir et supprimer plusieurs recueils.
- Organiser le document avec des titres hiérarchisés, jusqu’à quatre niveaux en V1.
- Intercaler du texte libre et commenter chaque extrait.
- Ajouter une sélection libre au fil de la lecture, à un emplacement choisi, sans annotation préalable.
- Réordonner les items et déplacer une section avec son contenu.
- Consulter le recueil à côté de la transcription.
- Exporter un document lisible hors de SonalPi.

La modification directe d’une citation source n’est pas reprise telle quelle : elle contredit le lien vivant. Une éventuelle citation éditoriale figée doit être une fonction distincte et explicite.

## 3. Appuis réels dans la V2

### 3.1 Un mécanisme d’ancrage réutilisable

- `src/shared/format.ts` : les entretiens sont identifiés par les clés du `membership` ; leur contenu est stocké dans `entretiens/<id>.json`.
- `src/renderer/editor/remap.ts` : les positions des annotations et des ancres suivent les transactions ProseMirror et sont sauvegardées avec le document.
- `src/renderer/composables/useEntretien.ts`, `rafraichirExtraits()` : une projection existante extrait le texte courant et les locuteurs d’une plage de codage. Elle illustre la lecture d’une plage, sans imposer le codage comme propriétaire du futur extrait.

Le nouveau repère doit bénéficier du même mécanisme de remappage. **Il n’existe pas encore dans le modèle actuel.** Il ne faut ni créer un faux codage ni élargir artificiellement `AnnotationType` pour le faire passer pour une annotation d’analyse.

La clé de référence proposée est **`{ entretienId, repereId }`**, dans le corpus courant. Les bornes de ce repère vivent avec le document source, pas dans `corpus.json`.

### 3.2 Passage et commentaire éditorial

Le futur rendu distingue :

1. le passage de transcription désigné par le repère ;
2. le commentaire éditorial de l’item, indépendant et propre au recueil.

Les annotations de codage ou de commentaire couvrant ce passage ne sont pas ses sources. Leur modification ou leur suppression ne change pas le passage recueilli. Le contenu d’un commentaire source n’est pas inclus automatiquement dans l’item.

Un éventuel raccourci d’ajout depuis un extrait codé ne serait qu’une présélection de plage : il créerait le même repère autonome que la sélection libre, sans lien persistant à l’annotation.

### 3.3 Ce que la V2 ne fournit pas automatiquement

Le remappage règle l’ancrage dans le texte, pas l’ensemble de la fonctionnalité. Il reste à construire :

- le modèle persistant du recueil, les repères de passage dans les entretiens et leurs commandes ;
- la résolution des références pour les entretiens ouverts et fermés ;
- l’invalidation des projections après modification ou tirage distant ;
- le traitement des sources manquantes et des repères orphelins ;
- le rendu pseudonymisé et les exports ;
- la persistance locale et distante des choix éditoriaux.

La requête `rafraichirExtraits()` est un point d’appui, pas un composant prêt à exporter : elle utilise `textBetween()` sur le texte source et ne constitue pas une projection pseudonymisée.

## 4. Décisions acquises et questions restantes

### Q1 — Suivre l’annotation ou seulement le passage ? — Tranché

**Suivre le passage, indépendamment des annotations.** Le lien vivant vers une `Annotation` n’est pas retenu. Les corrections de transcription restent suivies, mais pas les changements de bornes d’un codage ou d’un commentaire voisin.

### Q2 — Quels matériaux peut-on ajouter ? — Tranché

**Une sélection libre dans la transcription, codée ou non, commentée ou non.** C’est le geste V1 à reprendre dès le premier livrable ; les repères autonomes ne sont donc plus une option différée.

Les notes d’entretien et les contenus des annotations de commentaire ne sont pas inclus comme objets sources autonomes dans ce périmètre. Les annotations de pseudonymisation restent utilisées pour le rendu des passages.

### Q3 — Peut-on figer et réécrire une citation ? — Tranché pour le premier livrable

**Non dans le premier livrable.** La transcription se corrige dans l’entretien ; le commentaire éditorial s’écrit dans l’item. L’export produit le document figé, éventuellement retravaillé hors de SonalPi.

Une éventuelle évolution proposerait un type distinct « citation figée », avec provenance, date de capture et indication permanente de l’absence de mise à jour. Jamais une édition implicite du texte d’un item vivant.

### Q4 — Recueil manuel ou alimentation automatique ? — Tranché pour le premier livrable

**Liste manuelle, contenu vivant.** Ajouter de nouveaux codages au même thème ne les ajoute pas automatiquement au recueil.

Un éventuel ajout en lot de passages sélectionnés crée des repères sur leurs plages actuelles. Il fige le choix des passages, pas leur texte, et ne crée aucune dépendance aux annotations qui auraient servi à les sélectionner.

Un recueil automatiquement alimenté par thème, personne ou variable serait un mode distinct, nécessitant des règles sur l’ordre, les exclusions et les nouveaux résultats. Hors premier livrable.

### Q5 — Recueils partagés et pseudonymisation — Tranché pour le premier livrable

**Recueils partagés avec le corpus**, et non documents privés du poste. L’édition distante doit donc respecter le protocole existant.

**Mode pseudonymisé par défaut**, avec choix explicite pour voir ou exporter l’original, appliqué globalement au recueil plutôt que citation par citation.

Les recueils personnels et les choix de pseudonymisation par citation sont hors premier livrable.

### Autres décisions et question restante

- Exports initiaux : **Markdown et texte brut**. DOCX et PDF sont différés.
- Passage source disparu : **conserver l’item et signaler le problème**, sans suppression automatique.
- La priorité de reprise des anciens `.rcl` reste à décider. Le principe du rapprochement est retenu : rechercher le passage, proposer les correspondances proches à validation et ne créer aucun lien en l’absence de correspondance. Les correspondances exactes doivent aussi être désambiguïsées si nécessaire.

## 5. Invariants du modèle proposé

1. Un recueil et chaque item possèdent une identité opaque stable, indépendante du nom et de la position dans la liste.
2. Toutes les sources appartiennent au corpus courant ; les références inter-corpus sont hors périmètre.
3. L’item vivant conserve `{ entretienId, repereId }`, jamais une copie de transcription faisant autorité ni un `annotationId`.
4. Les bornes restent dans le repère de passage, sauvegardé avec l’entretien : aucun `from`/`to` persistant dans l’item vivant.
5. Le texte, les locuteurs et les repères temporels sont dérivés à la lecture.
6. Un même passage peut être recueilli plusieurs fois, avec des commentaires éditoriaux indépendants. Une nouvelle sélection crée son propre repère ; une duplication explicite d’item peut référencer un repère existant.
7. Ajouter une sélection libre crée un repère dans l’entretien, sans modifier les annotations ni la transcription. Cela exige un droit d’écriture sur l’entretien, contrairement à la simple consultation d’un recueil.
8. Retirer un item ou supprimer un recueil ne supprime jamais les annotations ni la transcription. Les repères inutilisés ne sont pas nettoyés implicitement.
9. Une référence cassée reste visible. Aucun rattachement automatique par texte ressemblant, nom ou ancienne position.
10. Lire ou rafraîchir un recueil ne déclenche aucune écriture de son contenu persistant.
11. Une ancienne projection n’est jamais présentée comme une lecture fraîche après un échec.
12. Un export est une matérialisation datée : il ne reste pas relié à la source après sa production.

## 6. Modèle et stockage recommandés

### 6.1 Forme indicative

Conforme au premier périmètre fonctionnel retenu ; les détails techniques de sérialisation restent à valider.

```ts
type ReperePassage = {
  id: string
  from: number
  to: number
}

type SourcePassageRecueil = {
  entretienId: string
  repereId: string
}

type ItemRecueil =
  | { id: string; type: 'titre'; niveau: 1 | 2 | 3 | 4; libelle: string }
  | { id: string; type: 'texte'; texte: string }
  | {
      id: string
      type: 'passage'
      source: SourcePassageRecueil
      commentaireEditorial: string
    }

type Recueil = {
  id: string
  nom: string
  creeLe: string
  modifieLe: string
  modeTexte: 'pseudonymise' | 'original'
  items: ItemRecueil[]
}
```

`ReperePassage` vit dans une collection dédiée de l’entretien, par exemple `reperesPassages`. Il faut l’intégrer à `EntretienFichier`, `PayloadEntretien`, au modèle en mémoire et à tous leurs chemins de sauvegarde. Le recueil ne conserve que sa référence.

L’ordre du tableau est l’ordre éditorial ; ne pas conserver un `rang` redondant en plus. Les commandes ciblent les identifiants et expriment le déplacement avant/après un item identifié.

Les sections sont dérivées des titres : une section se termine au prochain titre de niveau inférieur ou égal. Tous les déplacements de section utilisent cette même règle. Supprimer un titre seul conserve son contenu ; supprimer toute sa section doit être une action distincte et confirmée.

Les replis, le défilement, le recueil récemment ouvert et la largeur du panneau sont des préférences locales d’interface, pas des modifications du document partagé.

`modifieLe` concerne le travail éditorial sur le recueil. Il ne doit pas changer chaque fois qu’une source évolue. La fraîcheur des sources relève de la projection.

### 6.2 Propriété et emplacement

**Décision : `corpus.json.recueils`, indexé par identifiant.**

Justification : le contenu stocké reste limité aux références et à l’écriture éditoriale ; les transactions de définitions du corpus existent déjà. Cette solution évite d’introduire immédiatement un troisième cycle de sessions de fichiers.

Limites assumées :

- toutes les éditions de recueils partagent le verrou court de `corpus.json` ;
- les textes libres peuvent faire grossir ce fichier ;
- une frappe ne doit pas publier tout le corpus à chaque caractère.

Prévoir des champs en brouillon local avec enregistrement regroupé et état de sauvegarde visible. Les commandes persistantes portent un état attendu ciblé : un commentaire peut être modifié seulement si sa valeur n’a pas changé depuis sa lecture ; un déplacement vérifie la structure concernée. Aucun remplacement global depuis une ancienne copie renderer.

Surveiller la taille du fichier et la contention après mise en service. Si les mesures justifient plus tard un fichier `recueils/<id>.json`, traiter ce changement comme une migration explicite et prévoir inventaire, miroir, verrous, publications, suppressions, reprise et compatibilité : l’existence des sessions d’entretien ne rend pas cette extension gratuite.

### 6.3 Compatibilité du format

Ne pas conclure « champ optionnel, donc rétrocompatible » sans vérifier les anciens chemins de lecture/réécriture. Un ancien client qui reconstruit `corpus.json` peut perdre les recueils.

Prévoir l’audit de la normalisation, des créations, imports, migrations, mutations et transactions distantes, pour les recueils comme pour les repères des entretiens. Un ancien client qui édite une transcription sans remapper ses repères peut les rendre faux, même s’il préserve le champ. La version native actuelle est 3.

**Recommandation : évolution de version avec migration explicite**, en vérifiant le périmètre de `FORMAT_VERSION`, commun aux contrats corpus et entretien. La compatibilité exige aussi le remappage correct des repères : conserver un champ inconnu ne suffit pas. Ne pas effectuer une migration de corpus partagé pendant que d’anciens clients continuent à l’écrire.

## 7. Résolution et fraîcheur

### 7.1 Résolution d’un item vivant

1. Vérifier l’appartenance de l’entretien au corpus courant.
2. Obtenir un ensemble cohérent document + repères + annotations de pseudonymisation + locuteurs + ancres.
3. Rechercher le repère par son identifiant.
4. Vérifier sa plage, puis projeter texte, locuteurs et métadonnées utiles.
5. Appliquer le mode de pseudonymisation et construire une vue non persistée.

Si le repère devient orphelin, conserver le commentaire éditorial de l’item et signaler que le passage n’est plus disponible. Ne pas présenter cette situation comme une citation intacte.

États de résolution à distinguer :

- `disponible` ;
- `repere-orphelin` : identité présente, plage vide ;
- `repere-introuvable` : entretien lisible, identité absente ;
- `entretien-hors-corpus` : référence absente du membership ;
- `source-indisponible` : fichier absent, accès refusé ou problème de lecture ;
- `source-invalide` : document ou plage incompatible.

Une erreur réseau n’est jamais la preuve d’une suppression. L’absence du membership ne permet pas, à elle seule, d’affirmer quand ou pourquoi l’entretien a été retiré.

### 7.2 Quelle version lire ?

| Situation | Version utilisée | Information visible |
| --- | --- | --- |
| Entretien ouvert sur ce poste | Modèle vivant et document courant, y compris avant autosave | Modifications locales non enregistrées/publiées, si présentes |
| Entretien fermé, corpus local | Lecture validée du store | Erreur explicite si impossible |
| Entretien fermé, corpus distant | Miroir issu du dernier tirage réussi | Fraîcheur du tirage et état hors ligne |
| Autre poste en train d’éditer | Dernière version publiée et tirée | Pas de promesse de collaboration caractère par caractère |

Ne jamais assembler les repères ou les annotations de pseudonymisation d’une version avec le document d’une autre. La source ouverte prime sur une réponse disque asynchrone plus ancienne.

L’ajout d’une sélection crée une donnée dans l’entretien : le repère. Assurer sa sauvegarde avant de confirmer la persistance de l’item. En distant, publier aussi le document cohérent contenant ce repère avant de publier sa référence partagée ; un échec ne doit pas produire un faux succès. Coordonner ces étapes avec la session qui possède l’écriture de l’entretien, sans second écrivain.

### 7.3 Invalidation et performance

- Regrouper les références par entretien ; ne lire et parser chaque source qu’une fois par révision utile.
- Actualiser après transaction de texte, modification du repère, changement de locuteur ou de pseudonymisation. Une modification de codage ou de commentaire n’altère pas les bornes du passage recueilli.
- Invalider les sources fermées après mutation connue du store, ouverture du recueil ou rafraîchissement explicite.
- Invalider après tirage distant réussi et changement de corpus.
- Ignorer les réponses tardives appartenant à un ancien corpus ou à une ancienne génération de chargement.
- Garder les éventuels caches dérivés en mémoire, jamais comme citations de secours persistées par défaut.

Afficher « Source indisponible » plutôt que conserver silencieusement une ancienne citation. Un indicateur « modifié depuis votre dernière lecture » nécessiterait une référence de comparaison supplémentaire ; il n’est pas promis dans le premier livrable.

## 8. Cycle de vie des références

| Événement | Comportement attendu |
| --- | --- |
| Correction à l’intérieur du passage | Citation recalculée depuis le texte courant |
| Insertion avant le passage | Bornes remappées, même passage logique |
| Insertion exactement sur une borne | Politique existante : texte inséré hors de la plage |
| Modification des bornes d’un codage ou commentaire | Aucun effet sur le repère du recueil |
| Changement de thème, retrait ou recréation d’un codage | Aucun effet sur le passage recueilli |
| Suppression complète du texte couvert | Repère orphelin, item conservé et signalé |
| Modification ou suppression d’un commentaire source | Aucun effet sur le passage ni sur le commentaire éditorial |
| Repère introuvable dans une source lisible | Item conservé avec diagnostic |
| Restauration du même repère avec le même id | Référence à nouveau résoluble si sa plage est valide |
| Renommage de l’entretien | Provenance actualisée, identité inchangée |
| Retrait de l’entretien du corpus | Tous ses items signalés, aucun nettoyage silencieux |
| Source temporairement inaccessible | État d’indisponibilité, références conservées |
| Suppression du recueil | Sources intactes |

L’annulation d’une édition de texte traverse déjà le remappage, mais ne garantit pas à elle seule la récupération de toute plage effondrée. Caractériser les suppressions complètes, remplacements et undo/redo avec les tests existants ; ne pas promettre une restauration sémantique non prise en charge.

Un copier-coller ou un déplacement de texte n’est pas une preuve d’identité du passage. Pas de recherche approximative pour suivre le texte à un nouvel endroit.

Une réimportation ou un remplacement complet de transcription doit être audité : ne jamais conserver les anciennes bornes sur un document sans correspondance garantie. Marquer les anciens repères comme orphelins, établir une correspondance explicite et vérifiée ou refuser le remplacement susceptible de fabriquer de faux liens. Les identifiants des repères ne doivent jamais être recyclés pour de nouveaux passages.

Actions sur un item cassé : réessayer, consulter l’entretien s’il existe, retirer l’item, ou sélectionner explicitement un nouveau passage. Le rattachement crée un nouveau repère et remplace la référence de cet item, sans modifier les autres usages de l’ancien repère. Il conserve le commentaire éditorial et demande confirmation de la nouvelle source.

## 9. Interface proposée

### Vue Corpus

Un onglet « Recueils » présente la liste des recueils, leur nom, leur dernière modification éditoriale et leur nombre d’items. Un diagnostic des références peut être affiché après chargement ; ne pas afficher « tout est valide » avant vérification.

L’ouverture présente le document ordonné : titres, textes libres, citations et commentaires éditoriaux. Chaque citation propose :

- l’entretien source et les locuteurs concernés ;
- le commentaire éditorial propre à cette occurrence du passage ;
- un accès « Voir dans l’entretien » ;
- éventuellement « Écouter », si des ancres et un média utilisable existent ;
- un état de référence compréhensible, sans confondre source absente et source inaccessible.

### Depuis l’entretien

- Action « Ajouter au recueil… » sur une sélection libre, sans exiger codage ni commentaire.
- Choix du recueil existant ou création, puis emplacement d’insertion.
- Confirmer la plage effectivement recueillie, après application de la politique de sélection au mot de l’éditeur.
- Les annotations qui se chevauchent n’imposent aucun choix : elles ne sont pas la cible du lien.
- Panneau latéral redimensionnable pour organiser le recueil sans quitter la source.
- En cas de passage déjà présent, permettre un nouvel ajout volontaire ; ne pas fusionner les items par ressemblance de texte.

La navigation résout de nouveau l’identifiant après ouverture de la source ; elle ne transporte pas une ancienne position comme autorité. Respecter le cycle actuel de sauvegarde, changement d’entretien et accès en lecture seule.

La citation vivante n’est pas éditable sur place. « Modifier dans la source » et « Commentaire du recueil » doivent être visuellement distincts. Un recueil éditable ne confère aucun droit d’écriture supplémentaire sur les entretiens référencés.

## 10. Création et cycle de vie du repère autonome

Les repères sont nécessaires dès le premier livrable :

- introduire un repère identifié, porté par l’entretien avec `from`/`to` ;
- le remapper dans le même canal que les annotations, sans en faire une `Annotation`, et le sauvegarder avec le document ;
- conserver dans l’item uniquement `{ entretienId, repereId }` ;
- ne pas créer de faux codage ni de commentaire vide servant de support technique ;
- conserver les repères orphelins avec diagnostic.

### Création en deux écritures

1. Capturer la sélection dans le document courant et créer le repère dans le modèle qui possède ce document.
2. Le remapper si le texte évolue pendant le choix du recueil ou la sauvegarde. Ne jamais réutiliser des bornes capturées sur une ancienne révision sans correspondance.
3. Sauvegarder le document avec son repère ; en distant, publier via la session existante.
4. Enregistrer ensuite l’item dans le recueil par sa commande ciblée.
5. Confirmer l’ajout seulement après réussite des étapes nécessaires.

Si la seconde écriture échoue, conserver le repère non utilisé et le commentaire éditorial en brouillon, signaler l’échec et permettre une reprise idempotente avec les mêmes identifiants. Ne pas annoncer une atomicité globale que deux fichiers ne fournissent pas.

Si l’entretien est en lecture seule ou verrouillé par autrui, l’ajout d’une nouvelle sélection vivante est indisponible : expliquer qu’il faut enregistrer un repère dans la source. Ne pas contourner le verrou par des positions stockées dans le recueil ou par une copie implicite. La consultation et la réorganisation d’items existants restent indépendantes de ce droit.

### Retrait et duplication

Ne pas supprimer automatiquement un repère au retrait d’un item : il peut être utilisé ailleurs. Un nettoyage éventuel exige un inventaire complet et une commande explicite. Une duplication d’item peut partager le repère, mais une nouvelle sélection crée un repère indépendant ; pas de déduplication automatique par bornes.

### Intégration au modèle existant

Étendre les payloads, migrations, autosauvegardes et chemins de mutation d’entretien. La fusion des copies divergentes doit conserver les repères par id uniquement sous la garde existante de documents identiques ; aucun rapprochement approximatif de plages entre deux textes différents.

Tester l’undo/redo du texte et le remappage des repères. Si une annulation de création de repère est exposée, elle doit aussi traiter les items qui le référencent ; ne pas brancher naïvement une suppression locale de repère sur le journal d’entretien. L’annulation composite peut rester hors premier livrable.

## 11. Pseudonymisation et export

### 11.1 Un choix de projection, pas une copie

Le mode pseudonymisé relit les décisions actuelles applicables au passage et aux libellés de locuteur. Un changement de pseudo doit se refléter dans le recueil.

Construire un rendu dédié ou factoriser les primitives existantes ; ne pas exporter le texte brut retourné par `textBetween()` en l’appelant pseudonymisé. Traiter et tester les occurrences coupées par les bornes d’extrait et les chevauchements, sans laisser apparaître un fragment du nom original.

L’original ne doit pas subsister dans des attributs DOM, info-bulles ou métadonnées d’un export présenté comme pseudonymisé. Les titres d’entretien, textes libres et commentaires éditoriaux peuvent contenir des informations identifiantes : ne pas promettre leur anonymisation automatique. Les montrer dans l’aperçu et avertir avant diffusion.

La pseudonymisation est une transformation de présentation, pas un système de droits d’accès aux transcriptions du corpus.

### 11.2 Exports progressifs

Premier objectif validé : Markdown et texte brut. DOCX et PDF sont différés ; les fonctions V1 fournissent une référence ergonomique, pas du code à recopier sans adaptation.

Avant export :

1. choisir original/pseudonymisé, commentaires inclus et indications de source ;
2. résoudre les références et afficher les problèmes ;
3. construire une projection immuable cohérente par entretien, avec date d’export et état de fraîcheur ;
4. produire tout le fichier à partir de cette projection, sans relire les sources item par item au cours de la génération.

En distant, proposer un rafraîchissement préalable et expliciter l’usage éventuel de versions locales non publiées. Il n’existe pas d’instantané transactionnel global de tous les entretiens : ne pas le suggérer.

Par défaut, bloquer l’export si des passages nécessaires sont indisponibles. Une option explicite peut produire un export incomplet avec des emplacements signalés, jamais omettre silencieusement les items concernés.

## 12. Persistance distante et conflits

Avec le stockage retenu dans `corpus.json`, les mutations passent par `TransactionsCorpus` : verrou corpus court, relecture selon le protocole, commande ciblée, PUT conditionnel et traitement explicite des conflits.

- Aucun accès disque direct depuis le renderer.
- Aucun verrou d’entretien acquis pour simplement afficher une citation ou réutiliser un repère déjà publié.
- La création d’un repère exige en revanche une session d’écriture de l’entretien. Utiliser la session existante pour une sélection dans l’éditeur ; aucune écriture concurrente depuis le store.
- Publier la source contenant le repère avant la transaction courte qui ajoute sa référence au recueil. Ne pas ajouter de verrou corpus maintenu pendant le choix de la sélection ou la saisie.
- Pas d’écriture distante clandestine dans le miroir.
- Hors ligne, les modifications de recueil suivent la politique des mutations corpus : refus clair, pas de file de publication implicite.
- En cas de conflit, conserver le texte éditorial en cours de saisie comme brouillon local visible et demander une résolution ; ne pas écraser le travail distant.
- À la fermeture ou au changement de corpus, attendre les enregistrements ou demander explicitement quoi faire du brouillon non enregistré.
- Un verrou tenu sur un entretien par autrui n’interdit pas la lecture de sa dernière version disponible.

Les tests doivent couvrir deux postes modifiant un même item, deux items différents, un déplacement concurrent et la suppression du recueil pendant une saisie.

## 13. Rapport aux autres chantiers et à la V1

### 13.1 Les cas analytiques ne sont pas automatiquement des recueils

`plans/reflexion/export-sonal-alt.md` propose des cas analytiques et recommande, en section 5, des rattachements autonomes aux passages plutôt que des liens vivants aux annotations.

Le présent plan rejoint ce principe d’ancrage autonome, mais poursuit un usage distinct : **document éditorial ordonné, composé de passages librement sélectionnés et de textes du chercheur**. Il n’introduit ni appartenance à un cas analytique ni alimentation automatique.

Des primitives de résolution et d’ancrage pourront être communes. Ne pas fusionner prématurément les notions de cas, personne, recueil et sélection dynamique.

### 13.2 Reprise des anciens `.rcl`

**Principe de rapprochement retenu ; priorité de réalisation encore à décider.** Importer les titres, textes libres, commentaires et citations sans perte, puis rechercher les passages sources pour construire les liens qui peuvent l’être.

#### Résultats du rapprochement

| Résultat | Comportement |
| --- | --- |
| Passage exact, unique dans un entretien source identifié sans ambiguïté | Rattachement automatique possible, indiqué dans le bilan d’import |
| Plusieurs occurrences exactes, ou entretien source ambigu | Présenter les candidats et leur contexte ; demander à l’utilisateur de choisir avant de créer un lien |
| Passage proche, mais différent | Montrer la citation V1, le passage actuel et leurs différences ; créer le lien seulement après validation explicite |
| Aucun passage suffisamment ressemblant | Signaler « Passage non retrouvé », conserver la citation figée et ne créer aucun lien |
| Rapprochement refusé ou laissé en attente | Conserver la citation figée, sans lien |
| Source indisponible ou recherche incomplète | Signaler que la recherche n’a pas pu aboutir, sans conclure à l’absence du passage et sans créer de lien |

Une citation très courte ou peu distinctive peut exiger une confirmation même si une seule occurrence exacte a été trouvée. Les règles de prudence et les seuils de proximité sont à définir et tester ; un score élevé n’autorise jamais à valider automatiquement un résultat seulement approchant.

#### Recherche et provenance

1. Identifier d’abord l’entretien source avec les traces de migration disponibles. Le nom V1 est un indice, pas une identité fiable à lui seul ; faire confirmer les ambiguïtés.
2. Rechercher le texte exact dans cet entretien, puis les passages proches si nécessaire. Une recherche élargie au corpus peut proposer des candidats, mais ne doit pas choisir silencieusement un autre entretien source.
3. Tenir compte des différences de présentation V1/V2 et du fait que la citation a pu être pseudonymisée. Toute normalisation doit conserver une correspondance vérifiable avec les positions du document source ; ne pas transformer une paraphrase en égalité dite exacte.
4. En cas de proximité ou d’ambiguïté, montrer suffisamment de contexte pour permettre de choisir la bonne occurrence, ou de refuser tous les candidats.

Les bornes V1 `rgdep`/`rgfin` ne sont pas des positions ProseMirror et ne se convertissent pas directement. Les nouvelles bornes sont celles du passage effectivement retrouvé et validé dans la transcription actuelle. Une comparaison en version pseudonymisée doit également permettre de retrouver les bornes dans le document original, sans calculer celles-ci sur la longueur des pseudonymes.

#### Création des liens et bilan

- Revalider le candidat sur la version courante avant de créer le repère. Si la source a changé depuis l’aperçu, remapper avec une correspondance sûre ou recalculer et demander une nouvelle validation.
- Créer et sauvegarder/publier le repère avant de rattacher l’item, selon le même protocole que l’ajout d’une sélection libre. Un rapprochement trouvé n’est pas encore un lien enregistré.
- Conserver la citation V1 d’origine comme trace d’import lorsqu’un lien est construit ; elle ne devient pas une copie de secours faisant autorité dans le rendu vivant. Pour un passage proche validé, expliquer que le recueil affichera désormais le texte actuel, potentiellement différent de la citation V1.
- Présenter un bilan : liens créés, rapprochements à valider, passages non retrouvés, sources indisponibles et échecs d’enregistrement.
- Permettre de reprendre les items restés sans lien sans dupliquer les repères et items déjà importés.

**Importer le document tel quel reste possible sans aucun rattachement.** Les citations non reliées restent figées, lisibles et signalées ; elles ne sont ni supprimées ni remplacées par une supposition.

La reprise sans perte des `.rcl` introduit donc un type de citation figée, même si la création de nouvelles citations figées est hors premier livrable. Ne pas l’inclure discrètement dans le modèle minimal.

## 14. Découpage de réalisation

### Lot 0 — Valider le contrat

- [x] Retenir les sélections libres et l’indépendance vis-à-vis des annotations (Q1 et Q2).
- [x] Valider Q3 à Q5 : pas de nouvelle citation figée, ajouts manuels, recueils partagés et pseudonymisation globale par défaut.
- [x] Retenir Markdown et texte brut pour les exports initiaux ; conserver et signaler les items dont la source disparaît.
- [x] Retenir le rapprochement des `.rcl` : exact désambiguïsé, proche à valider, introuvable conservé sans lien.
- [ ] Décider la priorité de l’import `.rcl`.
- [ ] Vérifier les chemins de remplacement/réimportation et la conservation correcte des repères.
- [x] Retenir le stockage dans `corpus.json.recueils`.
- [ ] Arbitrer le versionnage après audit des écritures existantes.

### Lot 1 — Modèle pur et contrat de fichier

- [ ] Définir les types dans `src/shared/format.ts` ou un contrat partagé dédié.
- [ ] Ajouter `src/shared/corpus/recueils.ts` : création, édition, insertion, suppression, déplacement, sections et validation.
- [ ] Ajouter le modèle pur des repères sous `src/shared/entretien/`, avec création et diagnostic des orphelins.
- [ ] Étendre le plugin de remappage, le modèle d’entretien, les payloads et la fusion de copies à documents identiques.
- [ ] Injecter la génération d’identifiants et l’horloge pour les tests.
- [ ] Ajouter migration/normalisation et vérifier la conservation dans tous les chemins de sauvegarde.

Validation : ordre déterministe, identités stables, déplacement d’une section, absence de copie source ; ajouter une sélection crée seulement un repère dans l’entretien, sans modifier transcription ni annotations.

### Lot 2 — Résolution et projection

- [ ] Définir les résultats typés de résolution et les diagnostics.
- [ ] Séparer la résolution métier pure de la lecture des fichiers et de l’extraction ProseMirror.
- [ ] Placer les fonctions qui manipulent ProseMirror sous `src/renderer/editor/`, pas dans `shared/`.
- [ ] Construire le rendu pseudonymisé des passages indépendamment des codages et commentaires.
- [ ] Tester les sources ouvertes, fermées, invalides et indisponibles.

Validation : mêmes résultats pour un même document vivant ou relu ; aucun texte original divulgué par un rendu pseudonymisé testé.

### Lot 3 — Store, IPC et transactions

- [ ] Ajouter les lectures et commandes ciblées dans `src/main/corpusStore.ts` et leurs handlers.
- [ ] Exposer le contrat typé dans `src/preload/index.ts`.
- [ ] Raccorder les mutations distantes dans `src/main/distant/transactions.ts`.
- [ ] Coordonner création et sauvegarde/publication du repère avant l’ajout partagé.
- [ ] Assurer la reprise idempotente après échec de l’écriture du recueil et le refus clair d’ajout depuis une source en lecture seule.
- [ ] Couvrir conflits, erreurs d’écriture, réponses réseau perdues et brouillons non enregistrés.

Validation : relecture identique après redémarrage ; aucun écrasement depuis un renderer périmé ; aucune réussite annoncée avant confirmation.

### Lot 4 — Parcours utilisateur complet

- [ ] Ajouter un composable dédié, par exemple `src/renderer/composables/corpus/useRecueilsCorpus.ts`.
- [ ] Ajouter les composants de liste, document et panneau de recueil sous `src/renderer/components/`.
- [ ] Exposer une façade limitée via l’orchestration existante, sans gonfler les composants conteneurs.
- [ ] Ajouter depuis une sélection libre, naviguer vers le passage source, commenter et réordonner.
- [ ] Préserver la validité de la sélection si le document change pendant le parcours d’ajout.
- [ ] Invalider correctement les vues après changements locaux, tirage distant et bascule de corpus.

Validation : ajouter → corriger la source → constater le changement → fermer → rouvrir → retrouver le recueil et ses liens.

### Lot 5 — Exports et diagnostics

- [ ] Export Markdown/TXT depuis une projection unique.
- [ ] Choix de pseudonymisation, aperçu et avertissements sur les champs éditoriaux.
- [ ] Export bloqué ou explicitement incomplet selon la décision utilisateur.
- [ ] Diagnostic et rattachement manuel des items cassés.

### Lots optionnels, après validation

- [ ] Import `.rcl` : citations figées conservées, recherche exacte puis approchée, validation des candidats, création des repères et bilan des items sans lien.
- [ ] DOCX/PDF.
- [ ] Références à des notes d’entretien.
- [ ] Alimentation par règles dynamiques.
- [ ] Historique de changements des sources ou journal d’annulation éditoriale du recueil.

## 15. Matrice minimale de tests

| Domaine | Cas indispensables |
| --- | --- |
| Identités | Couple entretien/repère, noms identiques, renommages, nouvelle sélection indépendante, duplication explicite d’un item |
| Modèle éditorial | CRUD, ordre, déplacement de section, suppression d’un titre seul, suppression d’un recueil sans effet source |
| Sélection libre | Ajout sans codage ni commentaire, capture remappée pendant le choix du recueil, absence de fausse annotation |
| Texte vivant | Insertion avant/dans/aux bornes, correction, plusieurs paragraphes et locuteurs, changement de plage |
| Indépendance | Modification des bornes ou suppression d’un codage/commentaire sans effet sur le passage ; commentaire éditorial inchangé |
| Références cassées | Repère absent, plage entièrement supprimée, entretien hors corpus, fichier absent, document invalide |
| Remplacement de texte | Réimportation sans bornes obsolètes ni recyclage des identités de repères |
| Historique source | Undo/redo, restauration par même id, caractérisation des plages effondrées, fusion des repères à documents identiques |
| Fraîcheur | Modèle ouvert prioritaire, réponses asynchrones périmées ignorées, mutation hors éditeur, tirage distant, changement de corpus |
| Pseudonymisation | Changement de pseudo, locuteurs, extrait coupant une occurrence, exceptions, absence d’original caché dans le rendu |
| Persistance | Migration, conservation et remappage des repères, tous les chemins de réécriture, fermeture pendant sauvegarde, échec entre les deux écritures, reprise idempotente |
| Distant | Refus hors ligne, conflit ciblé, édition concurrente, repère non publié, consultation sans verrou, ajout refusé en lecture seule, reprise après erreur |
| Export | Ordre/titres, choix des commentaires, projection stable pendant génération, indisponibilités signalées, échappement des contenus |
| Performance | Nombreuses références au même entretien : une lecture/parsing par version utile, pas par item |
| Import `.rcl` si réalisé | Exact unique, occurrences multiples, entretien ambigu, texte proche accepté/refusé, citation pseudonymisée, aucun candidat, source indisponible, source modifiée après aperçu, reprise sans doublons et conservation de la citation initiale |

S’appuyer notamment sur `test/remap.test.ts`, `test/notesCorpus.test.ts`, `test/fraicheurProjections.test.ts`, `test/corpusStore.test.ts` et les bancs `test/webdav/`.

Pendant l’implémentation : tests ciblés à chaque lot, puis `npm run typecheck`, `npm test`, `npm run build` et scénarios E2E du parcours complet. Ce plan seul ne nécessite pas de relancer les bancs applicatifs.

Pour Nextcloud, utiliser uniquement les images et volumes existants : `npm run nc:up` / `npm run nc-b:up` si nécessaire. Aucun pull, aucun reprovisionnement.

## 16. Critère de réussite

L’utilisateur peut **sélectionner librement du texte et l’ajouter au recueil, comme dans la V1, sans créer ni référencer d’annotation**. L’amélioration V2 est qu’une correction de transcription se retrouve dans ses citations sans recopie ni réparation manuelle. Modifier ou supprimer un codage ou un commentaire ne change pas le passage recueilli.

Il sait toujours distinguer matériau source, commentaire éditorial, source indisponible et document exporté figé.

Cette garantie porte sur les versions effectivement disponibles sur le poste, et sur l’identité référencée — jamais sur une correspondance supposée entre deux textes semblables.
