# Plan alternatif — cas analytiques persistants et export QDA

> Alternative à `plans/reflexion/export-sonal.md`, réévaluée après l’implémentation
> des recueils à références vivantes.
> Ce document propose une évolution du modèle de travail de SonalPi2 avant l’export.
> Il ne décrit pas une implémentation des cas et ne remplace pas le plan initial.
> L’export historique `.sonal` reste un chantier distinct de l’export REFI-QDA.

## 1. Orientation

Introduire des **cas analytiques persistants** dans SonalPi2. Un cas permet de rassembler des passages de plusieurs sources, de leur associer des notes et de retrouver cet ensemble dans les traitements et à l’export.

L’inspiration ergonomique vient des recueils de SonalPi V1 : créer un objet nommé, puis lui ajouter des extraits au fil de la lecture. Le contrat métier diffère cependant : les passages d’un cas restent référencés dans leurs sources, pas copiés comme des citations éditables.

Actions envisagées :

- « Créer un cas » libre ;
- « Créer un cas à partir d’une personne » ;
- « Créer un cas à partir d’un entretien » ;
- « Créer un cas par modalité d’une variable » ;
- « Associer cette sélection à un cas » ;
- « Créer une note de cas » ou « Associer cette note à un cas ».

Le changement par rapport au plan initial est explicite : les cas ne sont plus seulement une projection temporaire d’export. Ils deviennent des objets de lecture et d’analyse dont les rattachements manuels sont conservés jusqu’à l’export.

Ce coût métier n’est justifié que si l’utilisateur doit constituer ses cas dans SonalPi avant l’export. Pour un besoin limité aux cas déductibles des personnes, entretiens ou variables, le plan initial reste plus léger.

### 1.1 Enseignement du geste « Mark » de QualCoder

QualCoder permet de sélectionner un cas, de surligner librement une portion d’un document textuel puis de choisir « Mark ». Cette action enregistre dans `case_text` une relation entre le cas, la source et les bornes du passage :

```text
caseid, fid, pos0, pos1, owner, date, memo
```

Elle ne crée ni code, ni annotation, ni copie éditoriale du texte. Le soulignement visible est reconstruit depuis cette relation et « Unmark » retire la relation sans modifier la source.

Ce geste confirme l’utilité de « Associer cette sélection à un cas » dans SonalPi lorsqu’on veut préparer de vrais cas QualCoder. Une projection créée seulement au dernier écran d’export ne permettrait pas de construire et relire progressivement ces associations, sauf à détourner les recueils de leur fonction.

Il ne justifie en revanche pas « Associer cette annotation à un cas ». Une annotation QualCoder est un mémo de passage distinct de `case_text`, comme un codage est distinct du cas. Dans SonalPi, une sélection codée ou commentée peut être ajoutée au cas, mais le rattachement porte sur la plage, jamais sur l’annotation.

## 2. Vocabulaire : éviter la confusion avec les traitements

### 2.1 Notions distinctes

| Notion | Exemple | Fonction |
| --- | --- | --- |
| Cas | Marie, établissement A, épisode de mobilisation | Objet d’étude identifié et persistant |
| Variable | Profession | Dimension descriptive |
| Modalité | Enseignant | Valeur d’une variable |
| Sélection | Passages des locuteurs enseignants | Ensemble de passages obtenu par des critères |
| Groupe de comparaison | Sous-corpus « Enseignants » | Ensemble comparé à d’autres dans un traitement |
| Unité de comptage | Mot, passage, entretien, personne ou cas | Ce que mesure le traitement |

Une variable peut organiser une comparaison sans devenir un cas. Ses modalités peuvent produire des groupes de comparaison temporaires.

Un groupe peut aussi être constitué en cas collectif si le chercheur veut le nommer, le documenter et l’étudier durablement. « Enseignants » n’est pas une identité individuelle, mais peut être un cas collectif légitime.

L’expression « unité d’analyse » est trop ambiguë pour servir seule de contrat logiciel. L’interface des traitements doit expliciter le périmètre, les groupes comparés et l’unité comptée.

### 2.2 Enseignement du lexico V1

Dans le chemin examiné de `_lxRefreshTable()` dans `modules/lexico.js` :

1. les modalités sélectionnées déterminent des entretiens admissibles ;
2. leurs occurrences lexicales sont filtrées ;
3. les occurrences et nombres d’entretiens sont recomptés ;
4. les spécificités sont calculées pour le sous-corpus sélectionné.

La variable sert ici à sélectionner un sous-corpus, sans création de cas persistant. Ce chemin utilise les valeurs d’entretien (`l === 'all'` ou absent) ; il ne constitue pas une preuve de filtrage correct des seules paroles des locuteurs portant une modalité.

À retenir pour V2 : permettre la comparaison par variable directement, sans imposer de créer des cas au préalable.

## 3. Invariants métier proposés

1. Un cas possède une identité stable indépendante de son nom et de ses critères d’alimentation.
2. Un cas n’est ni une copie d’entretien ni une catégorie du codebook.
3. Les passages restent référencés dans leur source, avec accès au contexte.
4. Un passage peut appartenir à plusieurs cas.
5. L’appartenance à un cas n’implique pas que la personne représentée en soit l’auteur.
6. Les notes du chercheur restent distinctes des matériaux sources.
7. Les valeurs locales ne deviennent pas silencieusement des attributs globaux de cas.
8. Les traitements n’exigent pas de cas persistants pour sélectionner ou comparer des passages.
9. Une règle dynamique et son résultat à une date donnée sont deux objets distincts.
10. Suppressions, références pendantes et données indisponibles sont diagnostiquées, jamais assimilées silencieusement à une absence de matériau.

## 4. Cas, personnes et provenance des passages

### 4.1 Une personne n’est pas son dossier analytique

La personne représente une identité transverse. Le cas représente un objet d’étude.

Un cas peut référencer une personne sans recopier son identité. Son nom peut être initialisé depuis celle-ci, mais les règles de renommage doivent être explicites. Aucun rapprochement par nom.

Il peut exister plusieurs dossiers portant sur une même personne, par exemple pour des périodes différentes. L’interface doit signaler les cas existants et proposer de les ouvrir plutôt que créer accidentellement des doublons.

### 4.2 « Paroles de » n’est pas « matériaux sur »

Si Paul parle de Marie, son intervention peut être associée au cas Marie sans devenir une parole de Marie.

Conserver au minimum la provenance du rattachement :

- interventions obtenues par une règle de personne ;
- passages obtenus par une règle de variable ;
- document entier obtenu par une règle d’entretien ;
- ajout manuel.

La provenance explique comment le passage a rejoint le cas. Elle ne suffit pas à déduire son sens : un ajout manuel n’est pas automatiquement un passage « à propos de » la personne.

Les traitements devront distinguer :

- « paroles de la personne », déterminées par les locuteurs ;
- « matériaux associés au cas », déterminés par l’appartenance au dossier.

Une typologie facultative des relations (« concerne », « documente », etc.) peut être étudiée ensuite, sans l’imposer au premier livrable.

## 5. Rattachements aux passages et annotations

### 5.1 Rattachement autonome recommandé

Créer une relation autonome entre un cas et une plage de texte. Ne pas rendre l’appartenance au cas dépendante d’un codage thématique ou d’un commentaire.

L’action principale porte sur une sélection libre, comme « Mark » dans QualCoder. Elle crée un rattachement propre au cas, que le passage soit codé, commenté ou sans annotation.

Conséquences :

- retirer un thème ne retire pas le passage du cas ;
- modifier ensuite la plage d’un codage ne modifie pas celle du rattachement ;
- le rattachement suit les éditions du document selon ses propres bornes ;
- une sélection non codée peut être associée directement ;
- supprimer un rattachement ne supprime ni le texte ni les autres annotations.

Ne pas proposer d’action intitulée « Associer cette annotation à un cas ». Si un raccourci depuis une annotation est étudié plus tard, son libellé doit annoncer qu’il associe seulement le passage actuellement couvert et qu’aucun `annotationId` n’est conservé.

### 5.2 Ancrage dans le texte

Les annotations actuelles utilisent des positions ProseMirror remappées lors des transactions. Les rattachements doivent bénéficier du même mécanisme d’ancrage et de sauvegarde cohérente avec le document.

Ne pas stocker uniquement des positions au niveau corpus sans mécanisme de mise à jour lors de l’édition de la source.

À définir et tester :

- insertion aux bornes et à l’intérieur ;
- suppression partielle ou complète du passage ;
- déplacement, copier-coller et remplacement de transcription ;
- annulation/rétablissement ;
- passage devenu vide ou référence de source introuvable.

Recommandation : conserver un rattachement devenu orphelin et le signaler, plutôt que le supprimer silencieusement. Les sources supprimées doivent être distinguées des sources temporairement indisponibles.

### 5.3 Différence avec les recueils

Les recueils V2 confirment la distinction déjà visible dans SonalPi V1 : un recueil est un document éditorial ordonné. Il agence des passages avec des titres, des textes libres et des commentaires en vue d’une synthèse, d’un article ou d’un autre document.

Un cas est au contraire une unité d’étude. Il rassemble sans ordre éditorial des sources ou passages associés à une personne, une organisation, un groupe, une situation ou un événement ; il peut porter un mémo et des attributs et servir au filtrage des analyses.

| Recueil | Cas |
| --- | --- |
| Ordre des items significatif | Appartenance analytique, sans plan éditorial |
| Titres et textes de liaison | Mémo et attributs du cas |
| Commentaire propre à chaque item | Provenance du rattachement, éventuellement mémo de relation |
| Répétition volontaire d’une citation possible | Une même plage ne doit pas compter deux fois par accident |
| Export Markdown/TXT comme document | Export QDA comme unité interrogeable |

Ce plan ne propose donc pas de créer un cas à partir d’un recueil, ni l’inverse. Une telle conversion perdrait soit la structure éditoriale du recueil, soit la sémantique analytique du cas. Si un besoin exceptionnel apparaît plus tard, il devra être conçu comme une copie ou une projection volontaire avec un bilan explicite, pas comme une identité entre les objets.

Les deux fonctions peuvent toutefois réutiliser l’infrastructure de `ReperePassage`, son remappage et ses diagnostics. Le partage d’une primitive d’ancrage ne signifie ni identité métier ni cycle de vie commun.

Dans SonalPi V1, `creerItemExtrait()` conservait une plage et une copie éditable du texte. Les recueils V2 ont remplacé cette copie comme source de vérité par une référence vivante. Les cas doivent reprendre cette référence vivante, pas les titres, l’ordre ou les commentaires éditoriaux du recueil.

## 6. Alimentation des cas

### 6.1 Modes à distinguer

| Mode | Comportement | Risque principal |
| --- | --- | --- |
| Manuel | Passages ajoutés explicitement | Oublis et entretien manuel |
| Initialisé une fois | Une règle produit des rattachements au moment de la création | Incomplétude après évolution du corpus |
| Dynamique | Une règle recalcule les passages admissibles | Contenu évoluant avec les données |
| Dynamique avec ajustements | Règle complétée par ajouts et exclusions | Complexité d’explication et de maintenance |

Ne pas présenter ces modes sous un unique libellé ambigu « à partir de ».

Recommandation de progression : cas manuels d’abord, puis cas dynamiques avec ajouts manuels. Les exclusions individuelles peuvent attendre un besoin confirmé.

Un cas initialisé une fois fige l’appartenance initiale, pas le texte : ses rattachements continuent à suivre les éditions des sources. Un véritable instantané reproductible exige de conserver les versions ou données analysées.

### 6.2 Règle de personne

- Référencer `Personne.id`.
- Retenir les interventions des locuteurs liés à cette personne.
- Exclure les enquêteurs par défaut, avec option explicite.
- Appliquer le rôle au locuteur local, pas globalement à la personne.
- Ne pas attribuer tout l’entretien à chaque participant.
- Laisser les passages sans locuteur hors de cette règle.
- Ne pas fusionner les locuteurs non liés par leur nom.

Des cas locaux par participation peuvent être proposés séparément. Toute correction de lien d’identité doit se répercuter sur le résultat dynamique et être perceptible dans l’aperçu.

### 6.3 Règle d’entretien

Un cas peut inclure tout le texte d’un entretien. Cette règle inclut les futurs ajouts au document, contrairement à une plage initiale matérialisée.

L’interface doit expliciter l’inclusion des questions et distinguer source entière et paroles sélectionnées.

### 6.4 Règle de modalité

Commande : « Créer un cas par modalité de cette variable ».

- Variable d’entretien : textes complets des entretiens admissibles.
- Variable de locuteur : interventions des locuteurs portant cette valeur localement.
- Ne pas étendre une valeur locale à toutes les interventions de la personne.
- Référencer les identifiants de variable et de modalité, jamais leurs seuls libellés.
- Valeur absente : hors sélection, avec compteur ; pas de cas « Inconnu » implicite.
- Modalité supprimée : règle invalide à diagnostiquer.
- Plusieurs entités partageant une modalité : regroupement assumé et annoncé.

L’identifiant du cas reste propre au cas ; le couple variable/modalité est un critère d’alimentation et un moyen de détecter les créations répétées.

Pour un premier mode dynamique, de nouvelles modalités ne créent pas automatiquement de nouveaux cas : une action explicite complète la famille existante.

### 6.5 Union et provenance

Un passage obtenu par la règle et ajouté manuellement ne doit pas être compté deux fois. Conserver les contributions d’origine, tout en calculant leur union pour le contenu effectif.

Retirer un ajout manuel ne retire pas un passage toujours présent par la règle. Expliquer cette situation plutôt que donner l’impression que la suppression n’a pas fonctionné.

Si les exclusions sont ajoutées ultérieurement, préciser leur portée. Proposition : exclusion de la contribution automatique, puis union avec les ajouts explicites. Un ajout manuel reste ainsi intentionnellement prioritaire.

## 7. Notes et attributs des cas

### 7.1 Notes

Distinguer :

- note créée directement pour un cas ;
- note d’entretien existante associée à un cas ;
- même note associée à plusieurs cas.

Privilégier les liens aux copies. Définir le propriétaire de la note, ses droits d’édition et son devenir lorsque l’un des liens est retiré.

Les notes structurées actuelles sont stockées dans les entretiens ; `Personne.note` est un champ textuel facultatif. Leur unification ou leur coexistence demande une décision explicite, sans duplication automatique des contenus.

Les notes ne contribuent jamais au texte analysé par défaut. Une analyse des écrits du chercheur doit être un périmètre distinct et volontaire.

Conserver le statut privé/public dans toutes les vues et tous les exports. L’association à un cas ne rend pas une note publique.

### 7.2 Attributs

Distinguer :

- attribut renseigné directement sur le cas ;
- valeur locale d’entretien ou de locuteur ;
- attribut dérivé par une règle explicite.

Créer un cas Marie ne transforme pas ses âges ou professions successifs en une valeur globale unique.

Pour la projection des valeurs locales vers un attribut de cas :

1. aucune valeur : attribut absent ;
2. une valeur distincte : proposition avec signalement des données manquantes ;
3. plusieurs valeurs : conflit de projection, pas erreur intrinsèque du corpus.

Ne choisir ni première ni dernière valeur silencieusement. Prévoir omission, choix explicite pour l’export ou mode situé « personne × entretien ». Les valeurs locales restent conservées.

Ne pas recopier automatiquement les attributs des membres sur un cas collectif. Ne pas recopier une variable d’entretien sur chaque cas personnel.

## 8. Architecture conceptuelle

Noms indicatifs, à confronter au modèle et au stockage existants avant implémentation :

- **Cas** : identifiant, nom, description, éventuel type, références d’origine, dates ;
- **Règle de cas** : source d’alimentation, paramètres et politique de sélection ;
- **Rattachement manuel** : identifiant, cas référencé, `{ entretienId, repereId }`, provenance ;
- **Lien de note** : référence de note et référence de cas ;
- **Attribut de cas** : définition, valeur et origine explicite ;
- **Sélection résolue** : passages calculés avec source, bornes et provenance ;
- **Configuration de traitement** : périmètre, critères, groupes et mesure.

Séparer trois responsabilités :

1. le modèle persistant décrit les dossiers et les choix de l’utilisateur ;
2. le moteur de sélection résout ces choix en passages ;
3. les traitements et exporteurs consomment ces passages selon leur contrat.

Les passages produits par une règle dynamique sont dérivés. Éviter de les maintenir en parallèle comme une seconde vérité persistante sans stratégie d’invalidation.

### 8.1 Stockage et édition distante

Orientation recommandée : définitions de cas au niveau corpus, rattachements manuels référencés par le cas et bornes conservées dans les `ReperePassage` des entretiens. L’index inverse vers les cas reste reconstructible.

Une association depuis une nouvelle sélection crée un repère autonome puis le rattachement au cas. Elle réutilise le modèle, le remappage et les diagnostics déjà construits pour les recueils, sans créer d’item de recueil. Un repère éventuellement référencé par plusieurs objets n’est jamais supprimé en cascade avec l’un d’eux.

Cette répartition évite de modifier un fichier central à chaque déplacement de position dans le texte, mais impose de gérer les références entre fichiers.

Avant développement, examiner :

- quels verrous sont requis pour créer un cas puis y ajouter un passage ;
- comment traiter une suppression de cas utilisé dans plusieurs entretiens ;
- comment reconstruire l’index sans confondre absence et indisponibilité ;
- comment détecter les résultats périmés après édition distante ;
- comment conserver la cohérence lors d’un échec entre deux écritures ;
- comment migrer les anciens corpus et transporter ces objets dans les sauvegardes.

Ne pas supposer de transaction atomique entre tous les fichiers. Les opérations multi-fichiers doivent être soit évitées, soit récupérables et diagnostiquées.

## 9. Moteur commun aux traitements et à l’export

### 9.1 Sélection indépendante des cas

Le moteur doit pouvoir sélectionner des passages à partir :

- d’entretiens ;
- de personnes ou locuteurs ;
- de variables et modalités, avec leur portée ;
- de thèmes ;
- de cas ;
- d’unions, intersections et exclusions explicites.

Créer un cas sert à conserver et enrichir un objet d’étude, pas à rendre possible une simple comparaison par variable.

Exemples d’interface :

```text
Périmètre : entretiens sélectionnés
Passages : interventions des participants
Comparer selon : profession du locuteur
Mesure : fréquence des mots
```

```text
Périmètre : cas sélectionnés
Passages : tous les matériaux associés
Comparer selon : cas
Mesure : présence du thème dans chaque cas
```

### 9.2 Chevauchements et comptages

Les cas ne forment pas nécessairement une partition exclusive.

- Dédupliquer les plages recouvrantes d’une même source dans l’union analysée.
- Autoriser la contribution d’un passage à plusieurs groupes de comparaison quand le traitement le permet.
- Signaler les groupes chevauchants et ne pas additionner leurs effectifs comme s’ils étaient disjoints.
- Distinguer nombres de rattachements, de plages fusionnées, de mots, d’entretiens, de personnes et de cas.
- Définir pour chaque traitement les contraintes requises sur les groupes.

Le moteur conserve la provenance détaillée même lorsqu’il fusionne des intervalles pour compter le texte une seule fois.

### 9.3 Frontières et reproductibilité

Définir le traitement des sélections coupant un mot et celui des passages discontinus. Ne pas concaténer deux fragments comme s’ils formaient une phrase continue : cela créerait de fausses cooccurrences ou séquences lexicales.

Une configuration enregistrée conserve critères, paramètres et versions pertinentes. Si les sources ont changé, indiquer qu’un recalcul utilise un nouveau périmètre effectif.

Distinguer :

- recette réexécutable sur le corpus actuel ;
- résultat daté accompagné de sa provenance ;
- instantané réellement reproductible, nécessitant les données ou versions sources correspondantes.

## 10. Interface de travail

### 10.1 Vue des cas

Pour chaque cas :

- nom et description ;
- éventuelle personne ou autre origine liée ;
- mode manuel ou dynamique ;
- règle lisible et périmètre ;
- liste des passages avec source et provenance ;
- notes et attributs ;
- diagnostics : passages orphelins, sources absentes, règles invalides ;
- accès au contexte de chaque extrait.

Distinguer le nombre de rattachements et le volume de texte unique, si les deux sont affichés.

### 10.2 Création et association

Depuis une sélection libre, proposer un cas existant ou sa création. Une association à plusieurs cas doit être possible sans duplication du texte.

Le geste suit le modèle QualCoder : choisir le ou les cas, confirmer la plage puis enregistrer un rattachement indépendant des codes et commentaires qui la couvrent. Il reste disponible sur un passage sans annotation.

Ne pas ajouter d’entrée « Associer cette annotation à un cas ». Un éventuel raccourci ultérieur annonce explicitement « Ajouter au cas le passage couvert par cette annotation » et produit exactement le même rattachement autonome que la sélection libre.

Depuis une personne ou une variable, montrer un aperçu : sources concernées, passages retenus, rôle des enquêteurs, données manquantes et caractère dynamique ou initialisé une fois.

### 10.3 Suppressions

- Retirer un passage d’un cas ne supprime pas la source.
- Retirer un lien de note ne supprime pas nécessairement la note.
- Supprimer un cas ne supprime ni personnes, ni entretiens, ni codages.
- Supprimer une personne ou une modalité utilisée par une règle exige une gestion explicite de la référence.

Préciser les options de conservation des matériaux avant toute suppression définitive.

## 11. Export REFI-QDA

### 11.1 Ce que l’alternative simplifie

Les cas et leurs matériaux sont déjà constitués et consultables. L’assistant sélectionne et projette des objets existants plutôt que demander de découvrir toute l’organisation analytique au moment de l’export.

L’export reste possible sans cas. Les attributs de fichiers et codages ne dépendent pas de leur présence.

### 11.2 Ce qu’elle ne résout pas

Conserver les exigences du plan initial :

- projection unique du texte et des positions ;
- conventions Unicode, bornes et séparateurs ;
- pseudonymisation avant calcul final des offsets ;
- agrégation explicite des attributs locaux ;
- correspondance thèmes/codes/catégories ;
- confidentialité des sources, notes, médias et rapports ;
- export audiovisuel distinct de l’export textuel ;
- validation réelle dans une version identifiée de QualCoder.

Le modèle de cas persistant ne prouve pas à lui seul la compatibilité REFI-QDA.

### 11.3 Projection des cas

Pour les cas sélectionnés :

1. résoudre règles et rattachements sur les sources retenues ;
2. conserver les transcriptions complètes comme sources ;
3. projeter l’union des passages de chaque cas sur le texte réellement exporté ;
4. exporter les attributs et notes selon les possibilités validées ;
5. signaler les cas vides et les pertes de sémantique.

Une règle dynamique est exportée, au minimum, comme son résultat à cet instant. Ne pas promettre que la cible conservera son automatisme.

La provenance des rattachements, les liens d’une note à plusieurs cas et la distinction « paroles de / matériaux associés » peuvent ne pas avoir d’équivalent natif. Prévoir conversion validée, annexe ou omission signalée. Une annexe ne rend pas ces données interrogeables nativement dans la cible.

Les cas conservent leur identité interne, mais cela ne garantit aucune fusion incrémentale lors d’un réimport.

### 11.4 Assistant proposé

1. Sources, confidentialité et mode de texte.
2. Cas existants à inclure, ou aucun cas.
3. Résolution des passages, diagnostics et cas sans matériau dans le périmètre.
4. Attributs, notes et arbitrages.
5. Aperçu, validation et génération.

La création durable de cas reste une action métier explicite, hors de l’opération d’export. L’exporteur n’écrit pas silencieusement de nouveaux cas dans le corpus.

Produire archive, rapport et éventuelles annexes à partir du même ensemble de données collectées. Détecter les changements distants plutôt que promettre un instantané atomique inexistant.

## 12. Prototype de compatibilité bloquant

Figer une version publiée de QualCoder et le schéma REFI-QDA utilisé.

Fixture minimale :

- deux entretiens ;
- Marie présente dans les deux ;
- Paul et un enquêteur dans un entretien collectif ;
- un cas Marie alimenté par ses interventions ;
- un passage de Paul ajouté manuellement au cas Marie ;
- un cas collectif partageant certains passages avec Marie ;
- un thème chevauchant une frontière de tour ;
- une note de cas et une note d’entretien associée ;
- un attribut de fichier, un attribut de cas et une valeur locale conflictuelle.

Vérifier après import effectif :

- sources complètes et passages exacts ;
- chevauchements entre cas conservés ;
- aucun code technique résiduel ;
- attributs aux bonnes portées ;
- devenir des notes et de leurs liens ;
- consultation du contexte et filtrage par cas utilisables ;
- pertes annoncées conformes aux pertes observées.

Le mécanisme cas/code signalé dans le plan initial reste une piste à vérifier dans la version ciblée, pas un contrat acquis. Un XML conforme ne remplace pas cet essai.

## 13. Lots de réalisation

### Lot 0 — décisions et preuves

- Valider le vocabulaire et les contrats de rattachement.
- Trancher stockage, verrous et stratégie de références pendantes.
- Prototyper le remappage d’un rattachement autonome.
- Réaliser la preuve d’import REFI-QDA avant de figer l’adaptateur.

### Lot 1 — cas manuels utilisables

- Créer, renommer et supprimer un cas.
- Associer une sélection libre, sans annotation préalable.
- Lister les passages et ouvrir leur contexte.
- Réutiliser le remappage des `ReperePassage` et diagnostiquer les orphelins.
- Créer des notes de cas et associer des notes existantes selon le contrat retenu.
- Assurer persistance, sauvegarde et comportement distant.

### Lot 2 — alimentation automatique et sélection commune

- Règles de personne et d’entretien.
- Ajouts manuels aux cas dynamiques.
- Résolution, provenance et déduplication.
- Comparaison des sélections directes et des sélections via cas.
- Règles par modalités après validation des portées entretien/locuteur.

### Lot 3 — export textuel utilisable

- Sources complètes, codages et cas persistants.
- Attributs de fichiers et de cas, conflits explicites.
- Notes selon compatibilité validée.
- Assistant, confidentialité, diagnostics et rapport de pertes.
- Contrôle d’import sur la version cible figée.

### Lot 4 — traitements et fonctions avancées

- Interface distinguant périmètre, groupes et unités de comptage.
- Contrats de chevauchement propres à chaque traitement.
- Configurations réexécutables et provenance des résultats.
- Éventuelles exclusions manuelles, cas situés et relations qualifiées.

Le moteur de sélection est construit dès le lot 2 ; l’interface complète des traitements peut venir ensuite sans contraindre leur implémentation à passer par des cas.

### Lot 5 — audiovisuel

Médias portables, synchronisation, repères temporels et codages sur média : validation séparée, sans les assimiler à la simple présence d’un fichier audio dans l’archive.

## 14. Tests et critères d’acceptation

### Cas et références

- Homonymes, renommages et cas multiples liés à une même personne.
- Ajout du même passage par plusieurs chemins.
- Suppression d’un codage sans perte du rattachement indépendant.
- Suppression de cas sans perte des matériaux sources.
- Source absente, indisponible ou supprimée : diagnostics distincts.

### Texte et règles

- Éditions aux bornes, suppression complète et annulation/rétablissement.
- Personne multi-entretiens et rôle enquêteur variable.
- Passage de Paul associé au cas Marie sans devenir une parole de Marie.
- Modalités locales différentes selon les participations.
- Valeurs absentes, modalités supprimées, nouvelle modalité.
- Union de passages recouvrants sans double comptage.
- Sélections discontinues et frontières de mots.

### Notes, attributs et confidentialité

- Même note liée à plusieurs cas sans copie divergente.
- Note privée exclue des artefacts non autorisés.
- Notes absentes du texte lexical par défaut.
- Valeurs longitudinales non agrégées silencieusement.
- Absence de données nominatives dans les artefacts pseudonymisés selon le périmètre annoncé.

### Persistance et export

- Migration d’un corpus sans cas.
- Échec d’écriture, changement distant et index périmé.
- Export à partir d’un périmètre cohérent et diagnostic des sources illisibles.
- Unicode, retours à la ligne et pseudonymes de longueurs différentes.
- Validation XML puis import réel dans QualCoder.
- Cas vides et pertes de provenance ou de liens de notes annoncés.

Critère central : l’utilisateur doit pouvoir construire un cas pendant la lecture, retrouver ses matériaux et notes après réouverture, distinguer ses sources d’alimentation, puis exporter ses passages exacts avec les pertes connues explicitées.

## 15. Décisions proposées et arbitrages ouverts

### Décisions recommandées

1. Introduire les cas pour préparer et relire dans SonalPi les unités qui seront exportées.
2. Autoriser les cas individuels, collectifs et situationnels.
3. Séparer identité de personne et dossier de cas.
4. Associer une sélection libre au cas par un rattachement autonome, sur le modèle de « Mark » dans QualCoder.
5. Ne pas proposer de lien persistant entre annotation et cas.
6. Ne pas utiliser un recueil comme source de création d’un cas : leurs finalités et structures diffèrent.
7. Conserver la provenance et distinguer paroles d’une personne et matériaux de son cas.
8. Distinguer alimentation manuelle, initialisation ponctuelle et règle dynamique.
9. Garder les notes hors du matériau lexical par défaut.
10. Permettre les sélections et comparaisons par variable sans créer de cas.
11. Mutualiser le moteur de sélection entre cas, traitements et export.
12. Maintenir la preuve d’import et les exigences techniques du plan initial.

### À trancher avant implémentation

- Les premiers cas automatiques sont-ils dynamiques ou initialisés une fois ?
- Faut-il des exclusions individuelles dès le premier usage des règles ?
- Une note possède-t-elle un propriétaire unique avec plusieurs liens, et où stocker les notes de cas ?
- Comment faire coexister `Personne.note` et notes structurées de cas ?
- Quel contrat de suppression pour une règle dont la personne ou modalité disparaît ?
- Quels attributs de cas doivent être éditables dès le premier livrable ?
- Quel niveau de reproductibilité est attendu pour les traitements enregistrés ?
- Quelle politique de verrouillage et de récupération pour les références entre corpus et entretiens ?

## 16. Sources examinées et limites

- `plans/reflexion/export-sonal.md` : proposition d’export sans cas persistants.
- `plans/encours/plan-recueil.md` : contrat des recueils à références vivantes.
- `src/shared/corpus/recueils.ts` : modèle persistant et ordre éditorial des recueils.
- `src/shared/entretien/reperesPassages.ts` : repères autonomes réutilisables.
- `src/renderer/editor/recueils.ts` : résolution et projection des passages recueillis.
- `src/shared/format.ts` : personnes, locuteurs et notes structurées.
- `src/shared/entretien/annotation.ts` : annotations ancrées et orphelins.
- `src/shared/entretien/notes.ts` : gestion actuelle des notes d’entretien.
- `src/renderer/editor/remap.ts` : remappage des plages lors des éditions.
- `/home/belignem/Vscode/SonalPi/modules/recueil.js` : structure éditoriale des recueils V1.
- `/home/belignem/Vscode/SonalPi/modules/lexico.js` : chemin de sélection et réagrégation de `_lxRefreshTable()`.
- Documentation des cas QualCoder : https://qualcoder.org/doc/en/3.3.-Cases/
- Gestion des cas : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/cases.py
- Marquage des passages d’un cas : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/case_file_manager.py
- Import/export REFI-QDA : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/refi.py

L’examen de V1 porte sur ces chemins, pas sur une validation exhaustive de tous ses traitements. `master` sert à comprendre QualCoder, pas de contrat stable ; aucun nouveau test d’import n’a été réalisé pour ce document.

**Conclusion :** un cas persistant est un dossier analytique auquel des sélections libres peuvent être rattachées, comme avec « Mark » dans QualCoder. Un recueil est un document éditorial qui agence des citations. Les deux peuvent partager les repères vivants sans partager leur modèle métier. Cette séparation permet de préparer fidèlement l’export QualCoder sans détourner les recueils de leur usage.
