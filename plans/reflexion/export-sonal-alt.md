# Plan alternatif — cas analytiques persistants et export QDA

> Alternative à `plans/reflexion/export-sonal.md`.
> Ce document propose une évolution du modèle de travail de SonalPi2 avant l’export.
> Il ne décrit pas une implémentation réalisée et ne remplace pas le plan initial.
> L’export historique `.sonal` reste un chantier distinct de l’export REFI-QDA.

## 1. Orientation

Introduire des **cas analytiques persistants** dans SonalPi2. Un cas permet de rassembler des passages de plusieurs sources, de leur associer des notes et de retrouver cet ensemble dans les traitements et à l’export.

L’inspiration ergonomique vient des recueils de SonalPi V1 : créer un objet nommé, puis lui ajouter des extraits au fil de la lecture. Le contrat métier diffère cependant : les passages d’un cas restent référencés dans leurs sources, pas copiés comme des citations éditables.

Actions envisagées :

- « Créer un cas » libre ;
- « Créer un cas à partir d’une personne » ;
- « Créer un cas à partir d’un entretien » ;
- « Créer un cas par modalité d’une variable » ;
- « Associer ce passage à un cas » ;
- « Associer cette annotation à un cas » ;
- « Créer une note de cas » ou « Associer cette note à un cas ».

Le changement par rapport au plan initial est explicite : les cas ne sont plus seulement une projection temporaire d’export. Ils deviennent des objets de lecture, d’analyse et de synthèse.

Ce coût métier n’est justifié que si ces usages dans SonalPi sont souhaités. Pour un besoin strictement limité à l’export, le plan initial reste plus léger.

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

Depuis une annotation, « Associer au cas » crée un rattachement sur sa plage actuelle. Il ne s’agit pas, par défaut, d’un lien vivant vers cette annotation.

Conséquences :

- retirer un thème ne retire pas le passage du cas ;
- modifier ensuite la plage du codage ne modifie pas celle du rattachement ;
- le rattachement suit les éditions du document selon ses propres bornes ;
- une sélection non codée peut être associée directement ;
- supprimer un rattachement ne supprime ni le texte ni les autres annotations.

Ce comportement doit être visible dans l’interface. Une éventuelle option de suivi vivant d’une annotation serait un autre contrat, à différer.

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

### 5.3 Différence avec les recueils V1

`creerItemExtrait()` stocke notamment une plage et un texte ; l’interface permet de modifier la citation. Ce modèle convient à un recueil éditorial, pas à une référence analytique vivante.

Reprendre le geste d’ajout et la consultation des extraits, sans faire de la copie du texte la vérité du cas. Un aperçu mis en cache reste dérivé. Une citation figée éventuelle doit être explicitement distinguée du passage source.

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
- **Rattachement manuel** : identifiant, cas référencé, plage ancrée dans une source, provenance ;
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

Orientation à valider : définitions de cas au niveau corpus, plages manuelles auprès du document qu’elles ancrent, index inverse reconstructible pour la vue du cas.

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

Depuis une sélection, proposer un cas existant ou sa création. Une association à plusieurs cas doit être possible sans duplication du texte.

Depuis une annotation, préciser que sa plage sert à créer un rattachement indépendant.

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
- Associer une sélection ou la plage d’une annotation.
- Lister les passages et ouvrir leur contexte.
- Remapper les plages et diagnostiquer les orphelins.
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

1. Introduire les cas pour leur utilité analytique dans SonalPi, pas seulement pour l’export.
2. Autoriser les cas individuels, collectifs et situationnels.
3. Séparer identité de personne et dossier de cas.
4. Utiliser des rattachements autonomes aux passages.
5. Conserver la provenance et distinguer paroles d’une personne et matériaux de son cas.
6. Distinguer alimentation manuelle, initialisation ponctuelle et règle dynamique.
7. Garder les notes hors du matériau lexical par défaut.
8. Permettre les sélections et comparaisons par variable sans créer de cas.
9. Mutualiser le moteur de sélection entre cas, traitements et export.
10. Maintenir la preuve d’import et les exigences techniques du plan initial.

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
- `src/shared/format.ts` : personnes, locuteurs et notes structurées.
- `src/shared/entretien/annotation.ts` : annotations ancrées et orphelins.
- `src/shared/entretien/notes.ts` : gestion actuelle des notes d’entretien.
- `src/renderer/editor/remap.ts` : remappage des plages lors des éditions.
- `/home/belignem/Vscode/SonalPi/modules/recueil.js` : structure et ajout des extraits aux recueils.
- `/home/belignem/Vscode/SonalPi/modules/lexico.js` : chemin de sélection et réagrégation de `_lxRefreshTable()`.

L’examen de V1 porte sur ces chemins, pas sur une validation exhaustive de tous ses traitements. La compatibilité QualCoder mentionnée ici reprend les points à vérifier du plan initial ; aucun nouveau test d’import n’a été réalisé pour ce document.

**Conclusion :** un cas persistant est un dossier analytique ; une variable reste une dimension descriptive utilisable pour sélectionner ou comparer des données. Le moteur doit distinguer le dossier, les règles qui rassemblent ses matériaux et ce que chaque traitement compte. Cette séparation rend l’alternative utile au travail qualitatif sans imposer une confusion au futur lexico.
