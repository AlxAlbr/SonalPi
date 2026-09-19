# Plan — cas manuels, cas avec règle et attributs cohérents

> Statut : plan partiellement validé ; décisions confirmées et questions restantes en section 13.
> Suite de `plan-cas.md`, fondée sur le code présent dans l’arbre de travail.
> Ordre de réalisation : consolider les cas → export spécifique QualCoder décrit
> dans `plan-export-sonal.pi` → envisager ensuite REFI-QDA.
> Les lots C1 à C3 sont implémentés. Le socle persistant et le résolveur partagé
> de C4 sont réalisés ; l’interface, la fraîcheur visible et la recette restent à terminer.
> C5 reste à réaliser.
> Le premier plan conserve l’historique de ses décisions.

## 1. Analyse et décisions proposées

**Décision validée : conserver la souplesse des ajouts manuels aux cas avec règle.**
La séparation stricte ouvert/fermé est abandonnée. Deux modes d’alimentation suffisent ;
« mixte » décrit un cas avec règle enrichi manuellement, pas un troisième type persistant.

| Mode | Matériaux | Évolution | Fiche du cas |
| --- | --- | --- | --- |
| Manuel | Sélections ajoutées explicitement ; peut commencer vide | Les repères suivent les corrections ; pas d’ajout automatique | Nom, mémo et attributs éditables |
| Avec règle | Résultat automatique, complété si souhaité par des ajouts manuels | Règle dynamique et repères manuels vivants | Nom, mémo, critères et attributs éditables selon leur origine |

Recommandation d’interface : **Manuel** et **Avec règle**, avec un compteur d’ajouts
manuels pour le second. Sans ajout, le cas avec règle est une agrégation pure.
Distinguer « Passages issus de la règle », « Ajouts manuels » et « Tous les matériaux ».
Les attributs dérivés dépendent exclusivement des membres sélectionnés par la règle.

Un cas représente toujours une unité d’étude. Son mode ne définit pas sa nature
scientifique : une organisation peut être un cas manuel ou un cas avec règle.
Une personne du registre et un cas consacré à cette personne restent deux objets distincts.
Un recueil demeure un document éditorial ordonné, jamais une source implicite de cas.

Conséquences proposées :

1. Autoriser la création volontaire d’un cas vide, avec nom et mémo facultatif.
2. Autoriser « Ajouter au cas » pour les cas manuels et les cas avec règle.
3. Permettre de retirer un ajout manuel de tout cas. Ne pas permettre d’exclusions
   individuelles du résultat automatique : modifier la règle ou les données.
4. Conserver les références vivantes et les diagnostics existants.
5. Permettre des attributs saisis et, pour les cas avec règle, des attributs dérivés
   de ses membres ; les ajouts manuels ne changent ni ces membres ni leurs attributs.
6. Refuser une valeur dérivée unique lorsque les données ne la justifient pas.
7. Ne pas réintroduire la fusion de personnes par nom à l’export.

## 2. État effectivement observé

Lecture de `src/shared/format.ts`, `src/shared/corpus/cas.ts`,
`src/renderer/editor/cas.ts`, `src/renderer/editor/passages.ts` et
`src/renderer/composables/corpus/useCasCorpus.ts` :

- format natif actuellement à **8** ; cas dans `corpus.cas` ;
- `Cas` contient nom, mémo, dates, `regles[]`, `rattachements[]`, valeurs saisies
  et recettes de dérivation propres optionnelles ;
- règles reconnues : `personne` (compatibilité), `personnes` avec filtre par membre,
  et `entretiens` avec liste d’identifiants ; `modalite` avec IDs et portée explicites ;
- `famillesCas` organise les cas via `familleId`, avec aperçu, création, complément,
  recettes de dérivation partagées et dissolution ciblée ;
- `attributsCas` porte les définitions partagées, séparées des variables EAV ;
  texte et modalités sont pris en charge, avec indicateur de confidentialité ;
- le résolveur partagé recalcule les observations depuis les membres des règles,
  déduplique par propriétaire et ignore les rattachements manuels ;
- le store recontrôle une nouvelle recette sur les sources courantes avant écriture ;
  l’affichage renderer des attributs et diagnostics n’est pas encore raccordé ;
- assistant multi-personnes et multi-entretiens : cas collectif ou un cas par élément,
  aperçu des noms et matériaux, validation atomique et rejeu du lot ;
- création volontairement vide autorisée ; les cas vides restent conservés ;
- les cas à règles acceptent aujourd’hui des ajouts manuels ; aucun mode exclusif ;
- projection des interventions locales des personnes, exclusion des enquêteurs par défaut,
  références manuelles, diagnostics et métriques d’union présents ;
- vues ensemble/règles/manuels avec métriques propres et avertissement pour les problèmes
  hors de la vue sélectionnée ; modes Manuel/Avec règle affichés ;
- `Personne` contient seulement `id` et `nom`, pas de valeurs descriptives ni de note ;
- les valeurs sont locales : `meta.valeursGen` et `Locuteur.valeursLoc` ;
- `Variable.portee` vaut `entretien` ou `locuteur` ; modalités identifiées par leur ID ;
- `Locuteur.personneRef` relie une participation locale à une identité transverse ;
  `interviewer` porte le rôle local ; `Locuteur.id` reste optionnel dans certains anciens fichiers.

Le premier plan contient encore des travaux différés. Les cases cochées d’un plan
ne remplacent pas une recette ; les validations du lot réalisé figurent en section 11.

### Changements explicites par rapport à `plan-cas.md`

| Décision précédente | Proposition ici |
| --- | --- |
| Pas de création volontairement vide | Cas manuel vide autorisé |
| Personne + ajouts manuels autorisés | Souplesse conservée et étendue à toutes les règles ; attributs dérivés indépendants des ajouts |
| Entretiens, modalités et attributs différés | Cœur du prochain chantier |
| Preuve REFI bloquant l’adaptateur QualCoder | Preuve d’ouverture/import spécifique QualCoder d’abord |
| Cas vides omis par défaut à l’export | Cas sélectionnés volontairement vides conservés, sous preuve cible |

## 3. Les six parcours de création

### 3.1 Cas vide

Depuis la fenêtre Cas : nom obligatoire, mémo facultatif, mode manuel.
Aucun repère ni entretien artificiel n’est créé. Le cas peut recevoir immédiatement
ses attributs et être complété plus tard depuis l’éditeur.
Afficher « Aucun passage ajouté », pas une erreur de référence.

### 3.2 Depuis une sélection

Conserver le parcours déjà réalisé : sélection libre → nom ou choix de cas →
publication du repère → rattachement dans le corpus.
Un seul repère peut servir à plusieurs cas, manuels ou avec règle. Annuler ne crée rien.
Le rattachement reste indépendant des codages et commentaires.

### 3.3 Depuis une ou plusieurs personnes

Choisir des `Personne.id`, jamais des noms ou des pseudonymes comme identités.
Deux résultats différents doivent être distingués dans l’assistant :

- **Un cas collectif réunissant les personnes choisies** : union de leurs interventions.
- **Un cas par personne choisie** : création en lot de plusieurs cas indépendants.

Décision validée : proposer les deux possibilités, avec un choix explicite.
Le même contrat s’applique à la création depuis plusieurs fichiers d’entretien.

La règle reste dynamique. Elle sélectionne uniquement les interventions des locuteurs
liés dans chaque entretien, pas les fichiers complets. Le rôle d’enquêteur s’applique
localement ; exclusion par défaut, inclusion explicite possible.

Un changement d’établissement d’une personne ne doit pas déplacer toutes ses paroles
historiques vers son établissement actuel. Cette règle de personne et la règle de
variable locale ne doivent donc pas être confondues.

### 3.4 Depuis une variable de locuteur

Exemple : `Établissement` possède les modalités A, B, C.
Créer une **famille** nommée Établissement, contenant trois cas avec règle.
Chaque règle référence `variableId` et `modaliteId` ; sa contribution automatique
rassemble uniquement les interventions des locuteurs portant localement cette modalité.
Des passages supplémentaires peuvent être ajoutés manuellement, sans changer cette règle.

- Les locuteurs sans `personneRef` restent admissibles : la variable suffit.
- Une même personne peut contribuer à A dans un entretien et à B dans un autre.
- Dans un entretien collectif, les questions et les paroles d’autres établissements
  ne sont pas ajoutées au cas A par voisinage.
- Appliquer le choix d’inclusion des enquêteurs explicitement, comme pour les personnes.
- Les paroles sans locuteur restent dans la source, hors de cette règle.
- Valeur absente : hors regroupement, avec compteur ; pas de cas Inconnu implicite.
- Modalité déclarée mais non observée : affichée dans l’aperçu ; création vide opt-in.
- Nouvelle modalité ultérieure : proposer « Compléter la famille », sans créer de cas
  lors d’une simple lecture ou d’un export.

La famille est une organisation SonalPi, pas un cas supplémentaire nommé Établissement.
Les cas exportés seront A, B, C, avec des noms qualifiés si nécessaire.

### 3.5 Depuis un ou plusieurs fichiers d’entretien

Sélection d’identifiants d’entretien du corpus, pas de chemins arbitraires.
Proposer un cas réunissant les fichiers ou un cas par fichier, comme pour les personnes.
Un fichier externe doit d’abord devenir un entretien du corpus.

Chaque source entière est incluse : questions, réponses et passages sans locuteur.
La règle suit les futurs ajouts au document. Elle ne se réduit pas à un repère
`[début, fin actuelle]`, qui risquerait de manquer les nouveaux paragraphes.
Une source vide est une source membre sans texte, pas une source introuvable.

### 3.6 Depuis une variable d’entretien

Un cas par modalité choisie, réunissant les **sources entières** dont
`meta.valeursGen[variableId]` correspond à la modalité.
Même contrat de famille, de données absentes et de nouvelles modalités que pour les
variables de locuteur, mais sans filtre de rôle sur le contenu.

## 4. Règles communes de résolution

### 4.1 Périmètre et dynamisme

Proposition initiale : les règles de personne et de variable cherchent dans tout le
corpus courant ; les règles d’entretiens référencent la liste explicitement choisie.
Une restriction enregistrée à une liste d’entretiens pourra être ajoutée si nécessaire,
mais doit être visible ; pas de filtre d’écran capturé implicitement.

Le résultat doit séparer :

- membres retenus par la règle : personnes, participations locales ou entretiens ;
- contributions automatiques et rattachements manuels, avec provenance distincte ;
- union textuelle effective par source ;
- données descriptives candidates ;
- diagnostics et complétude des lectures.

Les membres sans intervention ne disparaissent pas du contrôle des attributs.
L’admissibilité d’un membre dépend de la règle et du filtre de rôle, pas de son nombre
final de caractères. Les observations sont dédupliquées par propriétaire de valeur,
jamais comptées une fois par passage. Ajouter ou retirer un passage manuel ne modifie
pas cet ensemble de membres, même si le passage provient d’un autre entretien ou locuteur.

### 4.2 Union et absence de double comptage

Conserver les contributions pour expliquer les origines. Calculer l’union pour les
métriques et l’export, sans réécrire les rattachements d’origine.
Deux cas peuvent partager du texte ; ils ne forment pas nécessairement une partition.
Ne jamais fusionner deux plages séparées par du texte absent de l’ensemble retenu.

Calculer séparément l’union automatique, l’union manuelle et l’union de tous les matériaux.
Un passage présent par les deux chemins conserve ses deux provenances mais ne compte
qu’une fois dans le total. Retirer son ajout manuel ne le retire pas s’il reste sélectionné
par la règle ; l’interface doit l’expliquer. Une modification des critères ne supprime
pas les rattachements manuels, même si leur texte sort du résultat automatique.

### 4.3 Sources et références indisponibles

Distinguer personne absente, entretien retiré, variable/modalité absente, repère
orphelin, source illisible et source temporairement inaccessible.
Une lecture incomplète ne prouve ni qu’un cas est vide ni qu’un attribut est cohérent.
La projection ne supprime rien et ne crée aucune donnée persistante.

## 5. Attributs : distinguer saisie et dérivation

### 5.1 Attribut propre au cas

Exemples : type d’organisation, taille renseignée directement, statut de suivi.
Définition partagée au niveau corpus : ID, libellé, type, confidentialité et éventuelles
modalités ; valeur portée par le cas. Les cas manuels vides peuvent déjà en recevoir.

Proposition pour le premier lot : texte et modalités ; nombre seulement si déclaré
explicitement, pas par détection d’un libellé numérique. Dates et listes multivaluées
peuvent attendre un contrat de saisie et d’export validé.

Ne pas élargir mécaniquement `Variable.portee` à `cas` : l’éditeur EAV, sa matrice,
les usages, les suppressions, les imports et les migrations supposent deux portées.
Introduire d’abord un registre explicite de définitions d’attributs de cas, en
réutilisant les composants de saisie réellement communs.

### 5.2 Attribut dérivé d’une variable existante

L’utilisateur déclare une relation :

```text
Famille de cas : Établissement
Regroupement : variable de locuteur « Établissement »
Attribut proposé : variable de locuteur « Taille de l’établissement »
```

La valeur n’est pas copiée durablement à chaque actualisation. Conserver la recette,
calculer valeur, statut et provenance à la lecture. Un cache éventuel est reconstructible.

Le cas A peut recevoir « moins de 10 personnes », B « 10 à 100 », C « plus de 100 ».
Il n’est évidemment pas nécessaire que A, B et C aient la même taille : la cohérence
s’examine **à l’intérieur de chaque cas**.

La variable de regroupement peut aussi produire un attribut explicite
`Établissement = A`, indépendant du nom modifiable du cas.

### 5.3 Origine et compatibilité des portées

| Construction du cas | Observations candidates par défaut |
| --- | --- |
| Une personne | Valeurs des locuteurs liés admissibles, dans leurs entretiens |
| Plusieurs personnes | Valeurs de tous les locuteurs admissibles des personnes choisies |
| Variable de locuteur | Valeurs des locuteurs locaux correspondant à la modalité |
| Un ou plusieurs entretiens | Valeurs générales des entretiens membres |
| Variable d’entretien | Valeurs générales des entretiens correspondant à la modalité |
| Manuel | Attributs saisis ; pas d’héritage automatique depuis les auteurs des passages |

**Ajouts manuels exclus du calcul des attributs dérivés.** Cette règle vaut pour
les valeurs, les données manquantes et les contrôles de cohérence de toute la famille.
Exemple : un locuteur de B décrit A ; ajouter son passage au cas A ne fait pas de ce
locuteur un membre de A et n’introduit pas la taille de B dans le contrôle de Taille pour A.
Les éventuels attributs saisis sur le cas restent également inchangés.

Une égalité fortuite ne prouve pas qu’une variable décrit la bonne unité.
L’utilisateur doit sélectionner les variables pertinentes. Pour un cas collectif,
une profession commune est un attribut possible, pas une propriété automatiquement héritée.

**Décision validée : variables de même portée uniquement pour ce chantier.**
Une règle de personnes ou de variable de locuteur dérive ses attributs de variables
de locuteur ; une règle d’entretiens ou de variable d’entretien, de variables d’entretien.
Ainsi, Établissement et Taille doivent avoir la même portée pour cette dérivation.
L’héritage d’une valeur de contexte d’entretien vers un cas de locuteurs est différé,
jamais déduit implicitement du nom des variables.

## 6. Contrôle de cohérence

### 6.1 Algorithme métier

Pour un cas et une variable candidate, sur son périmètre de validation enregistré :

1. Énumérer tous les propriétaires de valeurs admissibles par la règle, y compris ceux
   sans texte ; exclure les propriétaires présents seulement par ajout manuel.
2. Relever valeur, propriétaire et entretien ; signaler les références invalides.
3. Comparer les identités de modalités de la même variable, pas seulement leurs libellés.
4. Séparer valeurs renseignées, valeurs manquantes et observations illisibles.
5. Déduire le statut ci-dessous.

| Situation | Statut | Attribut unique |
| --- | --- | --- |
| Aucune valeur renseignée | Absent | Pas de valeur |
| Une valeur distincte, observations complètes | Cohérent | Disponible |
| Une valeur distincte et valeurs manquantes | Cohérent mais incomplet | Disponible avec avertissement — décision validée |
| Plusieurs valeurs distinctes | Incohérent pour cette projection | Indisponible |
| Source illisible ou référence invalide | Non vérifiable | Indisponible jusqu’à contrôle complet |

Une valeur manquante ne masque jamais une valeur connue. Ne retenir ni première,
ni dernière, ni majorité ; ne pas concaténer les valeurs en un faux attribut scalaire.
Pour du texte libre futur : documenter la comparaison, sans fusion heuristique des valeurs.

### 6.2 Établissement A : contrôle transversal

Exemple de diagnostic :

```text
Taille de l’établissement — indisponible pour A
E1 / locuteur L1 : moins de 10 personnes
E2 / locuteur L2 : entre 10 et 100 personnes
```

Vérifier au sein de chaque entretien **et entre tous les entretiens** du même cas.
Ne pas valider E1 et E2 séparément puis conclure que le cas A est cohérent.
Afficher les observations avec accès aux données sources, sans les modifier à la création du cas.

### 6.3 Indisponibilité pour toute la famille — décision validée

Pour garder un fonctionnement simple, appliquer une politique familiale stricte :

- diagnostic détaillé par cas ;
- dans « Ajouter un attribut à la famille », la variable est indisponible si au moins
  un cas est conflictuel ou non vérifiable ;
- les cas et leurs passages restent créables et consultables ; seule la dérivation
  de cet attribut est refusée ;
- pour ce premier lot, ne permettre aucune dérivation propre sur un membre de famille :
  toutes ses dérivations passent par la famille ; les attributs saisis restent autorisés ;
- après correction des données, la variable redevient disponible.

Si Taille est incohérente pour A, cet attribut est indisponible pour A, B et C.
Ne pas proposer d’option de disponibilité partielle par cas. Les autres attributs
cohérents de la famille restent disponibles.

Si une dérivation déjà configurée devient incohérente, conserver la recette et le
diagnostic, mais ne plus présenter l’ancienne valeur comme valide. Suspendre les
valeurs dérivées de cet attribut pour la famille entière.
Une saisie manuelle reste possible sous un attribut distinct ; elle ne doit pas
masquer ou écraser le diagnostic de la dérivation en échec.

### 6.4 Personne et locuteur : variation n’est pas forcément erreur

Les variables actuelles appartiennent aux participations locales, pas à `Personne`.
Une personne peut avoir 29 ans puis 31 ans ; un établissement peut aussi changer de taille.
Le diagnostic doit donc dire « plusieurs valeurs : incompatible avec un attribut
unique sur ce périmètre », pas affirmer systématiquement que le corpus est erroné.

Réponses possibles : corriger une erreur réelle ; ne pas dériver cet attribut ; ou,
ultérieurement, construire des cas situés dans une période ou une participation.
Pas d’invention d’une temporalité à partir du seul ordre des fichiers.

Un cas regroupant plusieurs personnes ne reçoit pas les attributs individuels de la
première personne : la vérification porte sur toutes les observations admissibles.
Un futur cas de locuteur local utiliserait `(entretienId, locuteurId)` ; aucun
rapprochement de locuteurs homonymes ne doit être réalisé.

## 7. Modèle persistant retenu

Noms stabilisés pour le socle C4 :

```text
Cas
  id, nom, memo, creeLe, modifieLe
  regles[]
  rattachements[]
  mode de vue dérivé : Manuel si regles est vide, Avec règle sinon
  familleId ?
  valeursAttributsSaisis { attributId -> valeur }
  derivationsPropres[]

RegleCas
  personnes { membres[] : { personneId, inclureEnqueteurs } }
  entretiens { entretienIds[] }
  modalite { variableId, modaliteId, portee, inclureEnqueteurs si locuteur }

FamilleCas
  id, nom
  origine { variableId, portee } ?
  derivationsAttributs[]
  cohérence stricte pour toute la famille, sans option par cas

DefinitionAttributCas
  id, lib, type texte | modalites, priv, ordre, modalites[]

DerivationAttributCas
  attributId, variableSourceId, porteeSource
```

Le parcours multi-personnes peut appliquer un même choix d’inclusion des enquêteurs
à tous les membres ; le stockage par membre conserve aussi les filtres différents des
anciens cas à plusieurs règles, sans changer leurs résultats lors de la migration.

Ne pas stocker simultanément une liste de membres dans la famille et une seconde
liste faisant autorité dans les cas : dériver les membres depuis `familleId`.
La création en lot depuis plusieurs personnes n’impose pas forcément une famille
persistante ; la famille est nécessaire ici pour les attributs et contrôles communs.

Les modalités d’une définition servent à la saisie directe. Pour une dérivation,
la valeur et son libellé sont résolus depuis les modalités de la variable source ;
aucune copie ou correspondance par libellé n’est persistée. Un attribut de texte
porte toujours une liste de modalités vide.

Invariants :

- IDs stables ; unicité des noms normalisés selon le contrat existant ;
- cas manuel autorisé vide ; cas avec règle dont le résultat peut être vide ;
- rattachements manuels autorisés avec ou sans règle ; aucun type spécial pour les mixtes ;
- conserver `regles[]` et `rattachements[]` comme dans le socle existant ; les nouveaux
  parcours créent une règle typée avec listes pour les unions homogènes ;
- ne pas introduire un constructeur de règles hétérogènes dans ce lot ; les anciennes
  règles de personnes multiples restent une union, avec observations dédupliquées ;
- les attributs dérivés dépendent des membres des règles, jamais des ajouts manuels ;
- famille sans relation hiérarchique de cas implicite ;
- unicité de la modalité au sein d’une famille ; pas de duplication lors d’un rejeu ;
- une même variable peut donner plusieurs familles si le choix est explicite ;
- attribut saisi et dérivé ne peuvent pas se concurrencer sous le même ID sur un cas ;
- dérivations propres réservées aux cas avec règle sans famille ; un membre de famille
  reçoit toutes ses dérivations depuis les recettes partagées de la famille ;
- valeurs dérivées, diagnostics et textes projetés non persistés comme vérité.

## 8. Migration : conserver naturellement règles et ajouts existants

Le modèle actuel autorise déjà règles et rattachements dans un même cas. Cette capacité
est conservée pour tous les cas : aucun `mixteLegacy`, aucune séparation ou conversion
obligatoire. Aucun inventaire des corpus utilisateur ne prouve ici la présence effective
de cas mixtes ; les fixtures de migration doivent néanmoins couvrir cette possibilité.

Le lot C1 n’introduit aucun champ persistant : les cas vides étaient déjà lisibles,
et les filtres restent locaux au renderer. Il conserve le format 5, avec tests de
réouverture des cas vides et mixtes. La migration 4 → 5 existante reste testée.

Le lot C2 introduit la migration **5 → 6** pour les règles multi-personnes et d’entretiens.
Les anciennes règles restent inchangées, y compris leurs filtres distincts. Les migrations
locales et distantes sont testées, sans perdre les repères, rattachements ni recueils.
Le lot C3 introduit la migration **6 → 7** pour les familles et règles de modalités.
Le socle C4 introduit la migration **7 → 8** pour `attributsCas`, les valeurs saisies
et les recettes de dérivation. Les anciens corpus reçoivent un registre vide, sans
valeur inventée ; les fichiers d’entretien sont seulement renumérotés au format 8,
sans changement de leur contenu métier.

Contrat de compatibilité des évolutions :

- conserver identités, noms, mémos, dates, règles et rattachements ;
- aucune règle : affichage Manuel, y compris pour un cas vide ;
- règles présentes : affichage Avec règle, avec ou sans ajouts manuels ;
- conserver les filtres distincts des anciennes règles de personnes ; si elles sont
  regroupées dans une règle multi-personnes, préserver le filtre de chaque membre ;
- initialiser les nouvelles collections d’attributs et familles sans inventer de valeurs ;
- conserver les valeurs saisies et recettes structurellement valides ; diagnostiquer
  à la lecture une définition ou variable source devenue introuvable ;
- aucune matérialisation des interventions automatiques en repères manuels ;
- recueils et repères partagés inchangés.

La possibilité future de dupliquer un résultat en cas entièrement manuel reste hors
périmètre : elle n’est pas nécessaire pour enrichir un cas avec règle.

## 9. Interface et commandes

### Assistant de création

Présenter les six entrées, puis aperçu avant confirmation :
mode, sources, membres, passages, enquêteurs exclus, valeurs absentes, conflits,
cas existants et noms proposés. Pour un lot, valider tous les noms avant écriture.

Depuis l’éditeur, la liste « Ajouter au cas » propose tous les cas éditables, manuels
ou avec règle. L’association multi-cas peut mélanger ces deux modes. Afficher le mode
et la provenance du nouvel ajout, sans désactiver un cas parce qu’il possède une règle.

### Fiche du cas et de la famille

- badge Manuel / Avec règle, et nombre d’ajouts manuels ;
- règle lisible et action « Modifier les critères » ;
- vues « Passages issus de la règle », « Ajouts manuels », « Tous les matériaux » ;
- passages avec contexte et provenance, métriques d’union propres à chaque vue ;
- retrait individuel des seuls rattachements manuels, y compris dans un cas avec règle ;
- mention explicite « Attributs dérivés des membres de la règle » dans la fiche ;
- tableau d’attributs : origine, valeur, complétude, diagnostic, lien vers les données ;
- fiche famille : variable de regroupement, cas membres, dérivations partagées ;
- état vide intentionnel distinct des références cassées.

### Commandes ciblées et concurrence

Étendre les commandes existantes : création vide, création en lot, modification de
règle, gestion de famille et définition/saisie/dérivation d’attribut.
Les ajouts et retraits manuels existants restent disponibles dans les deux modes.

Conserver : GET frais sous verrou court, préconditions, PUT conditionnel, idempotence,
ajout multi-cas atomique au niveau corpus, repère publié avant sa référence.
Une modification de règle utilise sa valeur attendue ou une révision, pas seulement le nom.
Une commande rejouée ne recrée ni famille ni cas ni attribut.
Ne jamais garder un verrou pendant les choix de l’utilisateur.

Une nouvelle recette conflictuelle ou non vérifiable ne peut pas être enregistrée :
le main relit les sources et recontrôle le diagnostic au moment de la commande.
Une recette déjà enregistrée qui devient ensuite conflictuelle ou non vérifiable est
conservée mais sa valeur est suspendue ; aucune ancienne valeur n’est persistée comme vérité.
Recontrôler également avant export ; invalidation sur rôles, liens de personnes, valeurs,
modalités, membership, disponibilité des sources et changements distants.

## 10. Cycle de vie des dépendances

- Suppression d’un cas : aucun effet sur les sources, personnes, notes ou thèmes.
- Retrait d’un entretien : conserver le contrat confirmé des rattachements manuels ;
  diagnostiquer les règles d’entretiens qui le référencent, sans référence effacée à la lecture.
- Suppression d’une variable/modalité : étendre l’inventaire des usages aux règles et
  dérivations ; refuser tant que ces usages ne sont pas traités explicitement.
- Renommage variable/modalité : IDs inchangés, résultat inchangé ; noms des cas pas
  réécrits automatiquement. Proposer un renommage en lot si souhaité.
- Fusion de personnes : examiner `personnes.ts` et l’orchestration ; rediriger les règles
  vers l’identité conservée dans l’opération prévue, dédupliquer et revalider les attributs.
- Séparation de personne : ne pas ajouter implicitement la nouvelle identité à l’ancien
  cas ; expliquer l’effet sur ses matériaux et permettre de modifier sa règle.
- Suppression de personne utilisée : inventaire des cas dépendants et choix explicite ;
  ne pas s’appuyer uniquement sur l’absence de locuteurs.
- Suppression d’attribut ou de famille : afficher usages ; pas de cascade implicite sur
  les cas et leurs valeurs. La dissolution est refusée tant que la famille porte une recette ;
  l’utilisateur doit d’abord retirer explicitement ses dérivations.

Ces usages doivent être intégrés aux mêmes contrôles en local et en distant.

## 11. Lots de réalisation

### C0 — arbitrages et reprise du socle

- [x] Répondre aux questions fonctionnelles de la section 13 ; détails techniques restants identifiés.
- [x] Rejouer les tests existants des cas avant évolution : 31 tests réussis et typage valide.
- [ ] Inventorier les cas mixtes et les dépendances aux deux portées EAV.
- [ ] Maquetter les six parcours et la fiche des attributs.

### C1 — alimentation souple et création vide

- [x] Compatibilité, normalisation et sauvegardes : format 5 inchangé, migration 4 → 5 et réouvertures testées.
- [x] Cas manuel vide ; ajouts manuels possibles dans tous les cas éditables.
- [x] Vues automatique/manuelle/ensemble, provenance et métriques sans double comptage.
- [x] Préserver associations multi-cas et récupération après échec.

Réalisation C1 :

- `cas.ts` autorise les créations vides sans relâcher les validations d’identité,
  de nom, de date ou de référence ; une création pendant une association exige
  toujours son premier passage.
- `ProjectionCas.vues` expose trois résultats sans réduire la projection complète.
  Le filtre ne publie aucune modification et revient à Tous au changement de cas.
- L’interface propose Cas manuel vide, distingue les modes et ne confond pas
  absence de passage et impossibilité de résoudre les sources.
- Les groupes d’entretiens utilisent leurs IDs, pas seulement leurs titres.
- Les transactions distantes simulées couvrent création vide et rejeu sans changement
  des entretiens ; aucun serveur ni téléchargement Docker requis pour ce banc.

Validation : suite Vitest complète réussie (838 tests, 21 sautés), typage et build
valides. Quatre scénarios Electron réussis : deux pour les cas, un pour la migration
et un pour les recueils. Ils couvrent notamment création vide, annulation, redémarrage,
complément depuis l’éditeur, filtres sans écriture et retrait manuel sans perte
du passage retenu par la règle.

Commandes exécutées : `npm test`, `npm run typecheck`, `npm run build`, puis
`npx playwright test e2e/cas.e2e.ts e2e/recueils.e2e.ts e2e/migration.e2e.ts --project=local --workers=1`.

### C2 — personnes multiples et sources entières

- [x] Union de personnes et création par personne en lot.
- [x] Union d’entretiens et création par entretien en lot.
- [x] Résolution source entière, dépendances et métriques communes.

Réalisation C2 :

- Règles homogènes typées `personnes` et `entretiens`, sans remplacer les anciennes
  règles `personne` à la migration ; filtre local conservé pour chaque membre.
- `creer-lot` valide le lot entier avant mutation. Identités stables, noms uniques,
  références recontrôlées sur le corpus courant et rejeu sans créations supplémentaires.
- Assistant avec sélection multiple, recherche, sélection globale, choix individuel ou
  collectif, noms proposés pour les homonymes, mémos et avertissement des critères déjà
  utilisés. Une erreur conserve la commande exacte pour la reprise.
- Projection des sources entières recalculée depuis le document courant : questions,
  réponses, blocs sans locuteur et ajouts ultérieurs. Aucun repère automatique créé.
  Une source vide demeure un membre disponible avec zéro passage textuel.
- Chargement et parsing partagés entre les cas d’un aperçu ; les règles d’entretiens
  ne chargent ni l’inventaire des personnes ni les sources non concernées.
- Retrait d’entretien : confirmation et empreinte incluent ses règles ; les références
  sont conservées et diagnostiquées après retrait. Suppression de personne utilisée
  refusée avec noms des cas ; fusion redirigée et dédupliquée, inclusion des enquêteurs
  conservée si demandée par l’une des règles. Pas d’ajout implicite après séparation.
- Critères consultables dans la fiche. Leur éditeur sur un cas existant, les familles,
  les règles de modalités, les attributs et l’export restent hors de cette livraison.
- Documentation actualisée dans `docs/dev/cas.md` et `docs/user/cas.md`.

Validation C2 : `npm test` : **855 réussis, 21 sautés** ; typage et build valides.
Six scénarios Electron réussis, dont création de 30 cas individuels et d’un collectif,
annulation avant écriture, homonymes, redémarrage, sources vides et texte ajouté après
création. Les tests WebDAV simulés couvrent les migrations v4/v5 vers v6 et l’atomicité
et le rejeu des lots ; aucun téléchargement Docker.

Commandes : `npm test`, `npm run typecheck`, `npm run build`, puis
`npx playwright test e2e/cas.e2e.ts e2e/casLots.e2e.ts e2e/recueils.e2e.ts e2e/migration.e2e.ts --project=local --workers=1`.

### C3 — familles par variables

- [x] Variables de locuteur et d’entretien, sans confusion de portée.
- [x] Modalités absentes, inutilisées, supprimées et nouvelles.
- [x] Création et complément de famille idempotents.

Réalisation C3 :

- Règles `modalite` à IDs stables, sélection locale sans registre des personnes requis,
  membres muets inclus et rôle d’enquêteur local ; portée entretien = source entière dynamique.
- `famillesCas` stocke nom, date et recette d’origine, sans liste de membres dupliquée ni cas agrégat.
  Une modalité au plus par famille ; plusieurs familles indépendantes d’une même variable possibles.
- Assistant séparant les deux portées, tous les libellés déclarés visibles, valeurs absentes et
  invalides comptées, sources illisibles diagnostiquées. Modalités non observées en opt-in uniquement.
- Création et complément explicites, validation atomique sur copie et corpus frais ; rejeu exact,
  IDs conservés après réponse perdue et invalidés au changement de corpus. Aucun ajout à la lecture.
- Filtre et fiche de famille, critères lisibles, noms de cas inchangés aux renommages de variables.
  Vues et métriques d’union conservées, ajouts manuels sans effet sur les membres automatiques.
- Suppressions de variables/modalités et changements de portée protégés par les usages de recettes,
  mêmes contrôles en local et en distant. Migration v6 → v7 sans perte des anciennes règles,
  filtres, IDs, dates, repères, rattachements ou recueils.
- Dissolution minimale approuvée pendant l’exécution : confirmation explicite, détachement sans
  cascade ni suppression des règles. Préconditions sur famille et ensemble des membres contre
  complément concurrent ; famille vide et rejeu couverts. Les attributs restent hors périmètre.
- Canal IPC existant typé étendu, état familles propagé dans ouverture, changement de corpus,
  commandes et actualisation distante. Documentation technique et utilisateur actualisée.

Validation C3 : résultats définitifs consignés après la recette ci-dessous.

### C4 — attributs et cohérence

- [x] Modèle persistant, commandes de définition/saisie/dérivation et migration 7 → 8.
- [ ] Interface de définition, saisie et dérivation ; confidentialité visible et éditable.
- [x] Résolveur partagé des observations et diagnostics détaillés.
- [x] Politique familiale stricte : conflit dans A → attribut indisponible pour A/B/C.
- [x] Recalcul pur sans valeur dérivée persistée et recontrôle frais à la commande.
- [ ] Raccordement du renderer : actualisation visible et aucune valeur périmée affichée.
- [x] Ajout/retrait manuel sans effet sur les valeurs et diagnostics des attributs dérivés.

Réalisation C4 en cours :

- `attributsCas` contient les définitions partagées (`texte` ou `modalites`, ordre et
  confidentialité). `Cas` porte les valeurs saisies et recettes propres ; `FamilleCas`
  porte les recettes communes. Un cas manuel accepte la saisie, mais pas la dérivation.
- Les commandes sont rejouables et protégées par valeur attendue, identité stable,
  unicité de libellé, portée de variable, membres de famille attendus et absence de
  concurrence entre saisie et dérivation sous le même attribut.
- Les suppressions de définition, variable et modalité inventorient les usages ; une
  famille ne peut pas être dissoute tant que ses recettes n’ont pas été retirées.
- `observationsAttributs.ts` énumère les propriétaires admissibles des règles, y compris
  les membres sans texte, et distingue valeur absente, référence invalide et source
  illisible. Il compare les identités de modalités sur tous les entretiens du cas.
- Statuts calculés : absent, cohérent, cohérent incomplet, incohérent et non vérifiable.
  Une valeur connue avec données manquantes reste disponible avec avertissement.
- Une dérivation propre est possible pour tout cas avec règle sans famille. Un membre
  de famille conserve ses attributs saisis, mais toutes ses dérivations passent par les
  recettes communes de la famille.
- Le main recontrôle les sources au moment d’ajouter une recette ; conflit et source
  illisible refusent l’écriture. Une recette existante reste persistée et sera suspendue
  par la projection si les données changent ensuite.
- Les tests couvrent A/B/C, personne multi-entretiens, membre muet, valeurs manquantes,
  modalités supprimées, sources illisibles, portée entretien, ajout manuel sans effet,
  correction d’un conflit, migration et concurrence structurelle.

Validation intermédiaire : `npm test` : **1173 réussis, 21 sautés** ; typage et build
valides. Aucun scénario Electron ni banc Nextcloud C4 n’a encore été exécuté : cette
validation reste à faire après raccordement de l’interface.

Commandes : `npm test`, `npm run typecheck`, `npm run build`.

### C5 — recette et contrat d’export

- [ ] Cas résolus avec membres, sources entières, passages, attributs et diagnostics.
- [ ] Tests local/distant, migration, concurrence et confidentialité.
- [ ] Recette établissement A/B/C et personne multi-entretiens.
- [ ] Raccordement au plan d’export spécifique QualCoder, sans exiger REFI-QDA.

## 12. Matrice de tests et critères d’acceptation

| Domaine | Exemples indispensables |
| --- | --- |
| Création | Vide persistant ; sélection ; une/plusieurs personnes ; un/plusieurs entretiens ; deux portées de variable |
| Modes | Ajout aux cas manuels et avec règle, y compris via IPC et association multi-cas ; vues séparées |
| Contributions | Passage automatique aussi ajouté manuellement, dédoublonné dans le total ; retrait manuel laissant la contribution automatique |
| Dynamisme | Nouveau paragraphe ; nouvelle participation ; modification de rôle ; changement de modalité |
| Identités | Homonymes non fusionnés ; ancien locuteur sans ID ; fusion/séparation de personnes |
| Groupement | A/B/C dans un entretien collectif ; même personne dans A puis B ; locuteur non lié |
| Attributs | Taille différente entre A et B autorisée ; deux tailles pour A refusées ; même test entre entretiens ; passage de B ajouté à A sans effet sur Taille ni sa cohérence |
| Complétude | Valeurs vides ne masquant pas la valeur connue ; membre muet ; lecture distante impossible |
| Évolution | Attribut valide puis conflictuel puis corrigé ; aucune ancienne valeur affichée comme valide |
| Longitudinal | Âge variable : incompatibilité scalaire annoncée, sans déclarer la personne erronée |
| Migration | Cas sans règle, avec règle seule ou enrichi manuellement ; aucun statut historique spécial ; filtres distincts et recueils inchangés |
| Références | Modalité supprimée, entretien retiré, repère orphelin, personne supprimée |
| Concurrence | Lot rejoué, édition concurrente de règle, suppression pendant ajout, publication partielle |
| Confidentialité | Attribut dérivé d’une variable privée ; nom de famille/modalité identifiant ; rapports sans fuite |

Les bancs Nextcloud existants se démarrent sans téléchargement d’images Docker.
Sans serveur, respecter les sauts prévus ; ne pas présenter un test sauté comme réussi.

Critère central : créer les cas A/B/C depuis les données, distinguer leur agrégation
automatique de leurs ajouts manuels, enrichir A avec un passage de B sans changer ses
attributs dérivés, comprendre pourquoi Taille est disponible ou non, puis corriger les
données et constater le recalcul sans perdre les cas et passages déjà constitués.

## 13. Décisions validées et questions restantes

### Décisions validées par l’utilisateur

1. Plusieurs personnes ou fichiers : proposer un cas collectif **ou** un cas par élément.
2. Attribut dérivé incohérent pour A : indisponible pour toute la famille A/B/C,
   sans option de disponibilité partielle ; les cas et leurs autres attributs restent utilisables.
3. Une valeur unique connue avec des données manquantes : disponible avec avertissement.
   Cela ne transforme pas une source illisible en simple valeur manquante.
4. Export natif QualCoder produit depuis SonalPi V2, ciblant l’installation locale
   `/home/belignem/Vscode/QualCoder`, sans passer par l’importeur Sonal V1.
5. Conserver la souplesse : cas entièrement manuels ou cas avec règle dynamique,
   complétables manuellement ; ne pas introduire de cas fermés ni de troisième type mixte.
6. Distinguer les passages automatiques et les ajouts manuels ; calculer les attributs
   dérivés exclusivement depuis les membres sélectionnés par la règle.
7. Dériver les attributs depuis des variables de même portée que les observations
   sélectionnées ; les dérivations entre portées sont différées.
8. Laisser l’audio et sa synchronisation hors du présent chantier d’export.
9. Autoriser les dérivations propres sur les cas avec règle sans famille ; un cas manuel
   ne reçoit que des attributs saisis. Un membre de famille peut recevoir des attributs
   saisis, mais toutes ses dérivations passent par la famille.
10. Faire évoluer le format natif de 7 à 8 pour protéger les attributs persistés contre
    une ancienne application qui les ignorerait ou les perdrait.
11. Recontrôler une nouvelle recette au main ; la refuser si elle est conflictuelle ou
    non vérifiable. Conserver et suspendre une recette existante devenue invalide.

### Points restant à préciser techniquement

- Raccorder la projection partagée aux événements de fraîcheur du renderer et à la fiche
  du cas/de la famille, avec accès aux observations sources.
- Appliquer la confidentialité dans les aperçus, rapports et exports ; une dérivation
  créée depuis une variable privée devra proposer un attribut privé par défaut.
- Compléter la recette Electron et distante après l’interface ; les 21 tests sautés ne
  constituent pas une validation de ces bancs.

## 14. Sources de travail

- `plans/encours/plan-cas.md` ; `plans/reflexion/export-sonal.md` et `export-sonal-alt.md`.
- `src/shared/format.ts`, `src/shared/corpus/cas.ts`, `personnes.ts`, `variables.ts`.
- `src/renderer/editor/cas.ts`, `passages.ts` ; `useCasCorpus.ts`.
- `src/main/casOrchestration.ts`, `src/main/corpusStore.ts` et transactions distantes
  comme points d’intégration à compléter, pas comme preuve de fonctionnement nouveau.
- `/home/belignem/Vscode/InteropQuali/Plan/planSonalToQualcoderGenerique.md`.
- Code QualCoder local : `case_file_manager.py`, `__main__.py`, `sonal_import.py`.

Les lots C1 à C3 sont implémentés : création vide et en lot, règles de personnes,
d’entretiens et de modalités, familles avec complément explicite. Le modèle persistant,
les commandes et le résolveur partagé des attributs de C4 sont implémentés ; leur interface,
la fraîcheur visible, la confidentialité appliquée et la recette restent à réaliser.
C5 reste ensuite à mener. Les règles de noms, repères et persistance existantes sont
conservées sauf changement explicitement décrit.
