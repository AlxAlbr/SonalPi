# Plan — export SonalPi V2 spécifique à QualCoder

> Document de planification conservé sous `plan-export-sonalpi.md`.
> Son nom ne désigne pas un nouveau format d’échange.
> Statut : voie native et installation cible validées ; la gestion des cas et des
> attributs de `plan-cas2.md` est implémentée, raccordée et testée. L’export doit
> être accessible depuis **Corpus → Exporter le corpus** ; aucun exporteur ni projet
> Un premier exporteur textuel et une recette locale sont produits ; le rapport de
> pertes, la confidentialité et la compatibilité QualCoder complète restent à valider.
> REFI-QDA vient ensuite, pas comme préalable.

## 1. Objectif et périmètre

Produire depuis SonalPi V2 un projet QualCoder exploitable, plus complet que l’import
SonalPi V1 actuel : transcriptions complètes, thèmes et codages, cas manuels ou avec règle,
passages exacts, attributs aux bonnes portées, mémos et commentaires selon compatibilité
vérifiée. Les personnes sont des identités explicites, pas des noms à rapprocher.

Priorités :

1. s’appuyer sur les modes de cas et les attributs cohérents déjà implémentés dans SonalPi ;
2. prouver un transfert **spécifique QualCoder** sur une version identifiée ;
3. livrer l’export textuel depuis Corpus → Exporter le corpus, avec diagnostic des pertes ;
4. étudier séparément l’audiovisuel puis un adaptateur REFI-QDA.

Ni synchronisation retour, ni fusion dans un projet QualCoder existant, ni export
intégral sans perte promis. Un export est une photographie du résultat des règles,
pas le transport de leur automatisme dans QualCoder.

## 2. Sources examinées et enseignements V1

### 2.1 Importeur V1 corrigé

Sources lues :

- `/home/belignem/Vscode/InteropQuali/ScriptInterop/sonal_import_improved.py` ;
- `/home/belignem/Vscode/QualCoder/src/qualcoder/sonal_import.py` ;
- `/home/belignem/Vscode/InteropQuali/ScriptInterop/message_qualcoder_maintainers.md`.

Les scripts lisent un `.crp` ou un ZIP contenant `.crp` et `.sonal`, puis écrivent
sources, codes/catégories et attributs **de fichier** dans QualCoder.
Ils n’importent pas actuellement les cas V2 ni leurs attributs et rattachements.

| Acquis V1 à conserver | Traduction V2 |
| --- | --- |
| `.crp` fait autorité pour les métadonnées, pas les copies HTML | Lire les objets natifs actuels : définitions corpus, données locales dans les entretiens |
| IDs numériques/chaînes normalisés | Tables de correspondance explicites depuis les IDs V2 opaques ; codes historiques non identitaires |
| Convention de nom finissant par `?` | Lire `Locuteur.interviewer`, ne pas reparcourir les noms |
| Valeur vide d’enquêteur ne masquant plus les répondants | Garder la distinction absence/valeur ; agréger sur les membres explicitement admissibles |
| Noms des locuteurs insérés avant le calcul des offsets | Une projection commune produit texte final et toutes les plages |
| Parent thématique = catégorie ; code jumeau seulement si directement codé | Conserver ce mapping de compatibilité tant que la version cible le requiert |
| Feuilles conservées même inutilisées | Ne pas perdre le codebook déclaré par un filtrage implicite à l’usage |
| Notes d’entretien reprises depuis les métadonnées | Convertir les notes V2 modélisées, pas aveuglément `legacy.notes` |
| Chemins référencés limités au dossier et collisions de noms bornées | Sécuriser toutes les sorties ; ne pas confondre collision nominale et autre erreur SQL |

Le résumé rapporte 9 valeurs d’attribut attendues et 15 codages fusionnés sur sa fixture.
Ce sont des résultats historiques rapportés, pas une validation du futur export V2.

**Hors périmètre demandé :** ne pas reprendre la réparation des empans thématiques
composés d’espaces issue de l’éditeur V1. La sérialisation fidèle du texte et les tests
d’offsets restent nécessaires ; aucune règle de nettoyage V1 ne doit changer le texte V2.

### 2.2 Généralisation envisagée dans InteropQuali

Source : `/home/belignem/Vscode/InteropQuali/Plan/planSonalToQualcoderGenerique.md`.
Ce plan antérieur propose des axes de paramétrage ; tous ne décrivent pas les deux
scripts corrigés effectivement lus. Par exemple, les scripts corrigés décident les
catégories d’après la hiérarchie déclarée et agrègent les valeurs locales en attributs
fichier ; le plan envisage aussi des cas et des profils non implémentés là.

| Axe envisagé | Position proposée pour V2 |
| --- | --- |
| Individuel / focus group | Même moteur ; ne pas détecter les participants à partir de variables non vides |
| Portée fichier / cas / auto | Variables d’entretien → fichier ; attributs de cas → cas ; pas de bascule opaque |
| Récurrence par nom ou ID | `Personne.id` et `personneRef` ; jamais de fusion par nom ou pseudo |
| Variables locales d’une même personne | Contrôle scalaire explicite de `plan-cas2.md`, pas première valeur gagnante |
| Anonymisation | Occurrences et décisions V2 ; pas une nouvelle substitution globale depuis `tabAnon` |
| Pondérations | Inventaire réel et option explicite ; ne pas supposer que `cat_001` est toujours une pondération |
| Hiérarchie des thèmes | Arbre `Categorie.parent` ; pas de limite à deux niveaux supposée |
| Types et données privées | Texte/modalités par défaut, types déclarés ; privé exclu par défaut |
| Préfixes de locuteurs | Option explicite, appliquée avant projection des positions |
| Audio | Chantier séparé : copie, liens, temps et codages à prouver distinctement |

Le choix V1 « une valeur par fichier, éventuellement `Nom : valeur; ...` » reste une
compatibilité limitée. Il ne devient pas le format principal d’un focus group V2 :
ces chaînes ne rendent pas les attributs individuels interrogeables.

## 3. État V2 utilisable et manques

### Disponible dans l’arbre de travail

- `CorpusFichier` : `codebook`, `variables`, `personnes`, `membership`, `cas`, règles d’anon ;
- `EntretienFichier` : document ProseMirror, annotations, ancres temporelles, locuteurs,
  valeurs générales, notes structurées et repères de passage ;
- identité transverse des personnes et rôle local explicite des locuteurs ;
- cas manuels, règles de personnes, d’entretiens et de modalités, familles et références vivantes ;
- création en lot ou collective depuis personnes et entretiens, avec aperçu et rejeu idempotent ;
- création manuelle vide, modes Manuel/Avec règle et vues ensemble/règles/manuels ;
- définitions d’attributs, valeurs saisies, dérivations propres ou familiales et confidentialité ;
- observations et diagnostics recalculés, avec suspension stricte de toute la famille ;
- contrôle frais local et distant d’une nouvelle recette, sans valeur dérivée persistée ;
- notes avec statut privé/public ; variables avec `priv` ;
- export historique `.sonal` dans `src/renderer/import/exportSonal.ts`.

### À terminer ou créer

- projection du **document final complet** avec table de positions ;
- modèle intermédiaire d’export réunissant sources, cas, attributs et diagnostics ;
- adaptateur et assistant QualCoder, contrôles réels dans l’application cible ;
- point d’entrée dans l’export du corpus, avec sélection des entretiens et choix explicite
  du projet QualCoder sans confondre ce mode avec les exports TXT, HTML, DOCX et PDF ;
- premier adaptateur textuel, transaction SQLite et recette de création du projet, avant
  l’assistant de confidentialité et le rapport complet des pertes.

`textePassage()` fournit des extraits de lecture, avec des séparateurs et substitutions
propres à chaque plage. Concaténer ces extraits ne fournit pas le `fulltext` canonique
ni une table fiable de ses offsets.

L’export `.sonal` historique transporte aussi des informations d’anonymisation et
certaines données legacy utiles au retour vers SonalPi. Ce n’est pas un export
pseudonymisé de partage. Ne pas s’en servir comme intermédiaire obligé vers QualCoder.

## 4. Choix du canal spécifique QualCoder

### 4.1 Décision validée : projet natif neuf `.qda`

Produire un dossier de projet QualCoder contenant `data.qda` et les répertoires requis,
avec un adaptateur versionné. L’utilisateur l’ouvre comme projet, sans passer par
l’importeur Sonal V1 et sans modification locale obligatoire de QualCoder.

Le déclencheur est l’export au niveau du corpus : **Corpus → Exporter le corpus**.
La sélection des entretiens reste commune aux exports de lecture. Le choix QualCoder
ouvre ensuite un parcours dédié, qui présente les cas, les sources exclues, les
attributs, la confidentialité et le rapport de pertes avant toute écriture. Un dossier
`.qda` n’est pas produit par le générateur de TXT, HTML, DOCX ou PDF.

Avantages : cas, rattachements, attributs et annotations deviennent directement des
objets QualCoder ; pas de code artificiel de transport des cas ; pas d’attente REFI.
Coût assumé : dépendance au schéma et aux conventions de la version cible.

L’adaptateur doit reproduire un **projet vide complet** de cette version, pas fabriquer
seulement les six tables que l’on remplit. Utiliser une fixture vide contrôlée et sa
provenance ou une création de schéma auditée ; ne pas copier un projet de recherche réel.
Vérifier packaging et obligations de licence avant de reprendre du code QualCoder.

### 4.2 Voie écartée pour ce chantier : nouvel importeur Sonal

L’utilisateur a choisi la génération directe depuis SonalPi V2 d’un projet natif
QualCoder. Ne pas développer un nouveau paquet `.crp`/ZIP ni exiger un patch de
l’importeur Sonal pour lire les cas V2.

Ajouter des cas dans un `.crp` ne suffirait pas : l’importeur actuel les ignorerait.
Les correctifs V1 restent une source d’enseignements, pas le canal du nouvel export.
Le modèle intermédiaire permettra ensuite d’étudier un adaptateur REFI distinct.

### 4.3 Version cible : exploration n’est pas certification

Le checkout QualCoder examiné est au commit
`551392ffd411079f42066bf6d0cc4d91257de050` ; `app.py` annonce **QualCoder 4.0 Beta**.
Le créateur de projet de `__main__.py` initialise un schéma **v17** ;
`App.create_connection()` ouvre `data.qda` dans le dossier du projet.
Ces constats sur le checkout local ne prouvent pas qu’une version publiée stable utilise
le même schéma. L’importeur contient en outre les modifications locales discutées.

**Cible validée : l’installation locale `/home/belignem/Vscode/QualCoder`.**
Il ne s’agit pas de viser à sa place une autre version publiée.
Avant de figer l’adaptateur, relever à nouveau version, commit, modifications locales
pertinentes et schéma de cette installation ; créer et ouvrir la fixture avec elle.
Le commit relevé ci-dessus est un constat de lecture, pas une garantie que l’installation
n’évoluera pas. Refuser un profil inconnu plutôt que le déclarer compatible par approximation.

## 5. Contrat de correspondance métier

| SonalPi V2 | QualCoder proposé | Précision |
| --- | --- | --- |
| Entretien | `source` textuelle | Texte complet, même si seuls quelques passages appartiennent aux cas |
| Variable d’entretien | `attribute_type` file + `attribute` file | Une valeur par fichier et définition |
| Cas persistant | `cases` | Manuel ou avec règle, éventuellement enrichi manuellement ; cas vide choisi conservé |
| Passage de cas | `case_text` | Plage du texte final, pas copie du passage |
| Source entière dans un cas | `case_text` couvrant le texte complet | Convention de longueur à tester, source vide traitée séparément |
| Attribut de cas saisi/dérivé valide | `attribute_type` case + `attribute` case | Conserver l’origine dans le rapport, pas une fausse valeur en cas de conflit |
| Personne | Pas de table personne native | Identité source d’un cas, pas de duplication automatique |
| Famille de cas | Pas d’équivalent présumé | Noms qualifiés et/ou attribut technique opt-in, provenance dans le rapport |
| Thème parent | `code_cat` | Hiérarchie via `supercatid` dans le profil de compatibilité |
| Thème feuille / parent directement codé | `code_name` | Code jumeau du parent seulement si utilisé directement |
| Annotation de codage | `code_text` | `seltext` doit correspondre exactement à la plage exportée |
| Commentaire de passage | `annotation` | Mémo ancré, pas code thématique |
| Mémo du cas | `cases.memo` | Confidentialité à examiner explicitement |
| Notes d’entretien sélectionnées | `source.memo` structuré en texte, proposition | Fusion éditoriale annoncée ; identités et mise en forme non natives |
| Repère sans cas exporté | Aucun objet cible propre | Support interne, pas un code |
| Recueil | Aucun cas automatique | Export éditorial séparé ; pas de contamination des sources analytiques |
| Ancres et audio | Phase audiovisuelle | Ne pas prétendre les conserver avec un simple texte |
| `legacy` | Non recopié aveuglément | Inventaire, traitement connu ou omission annoncée |

Le code QualCoder local comporte aussi `code_name.supercid`. Ne pas supposer que cette
évolution rend le mapping catégorie/jumeau obsolète dans toutes les versions : comparer
les comportements de la version retenue avant de choisir un autre profil.

## 6. Cas, personnes et familles

### 6.1 Exporter ce qui a été constitué dans SonalPi

Le chemin principal sélectionne des **cas persistants**, de plusieurs modes et familles
si souhaité. L’exporteur résout leurs règles et références mais n’écrit aucun nouveau cas
ni ne corrige les données du corpus.

- Manuel : union de ses rattachements résolus.
- Avec règle : union du résultat automatique et des rattachements manuels.

La contribution automatique dépend de la règle :

- personnes : paroles des locuteurs locaux admissibles uniquement ;
- entretiens : textes complets des sources désignées ;
- variable de locuteur : paroles portant localement la modalité ;
- variable d’entretien : textes complets des entretiens portant la modalité.

Toute règle peut être complétée par des passages manuels, même provenant d’autres
personnes ou sources. Aucun statut de mixte historique ni conversion spéciale.
La perte du dynamisme concerne tous les cas avec règle : QualCoder reçoit leur résultat.

Par défaut, exporter tous les matériaux du cas sélectionné. Le filtre de consultation
« Passages issus de la règle » dans SonalPi ne doit pas exclure silencieusement les ajouts
à l’export. Conserver les deux provenances dans le modèle intermédiaire et le rapport
autorisé ; l’union `case_text` ne garantit pas leur distinction native dans QualCoder.

Un passage peut appartenir à plusieurs cas. Dédupliquer dans un même cas/source,
jamais entre cas différents. Ne pas concaténer leurs passages en nouveaux documents.

Un cas sélectionné volontairement vide est conservé comme fiche, sous preuve que
l’interface cible le gère. Un cas apparemment vide parce que ses sources sont illisibles
est une erreur non résolue, pas un cas vide normal. Cette politique remplace l’omission
par défaut des cas vides dans le premier plan.

### 6.2 Personnes sans cas et locuteurs non liés

Recommandation : proposer de revenir à l’assistant Cas pour une création en lot,
plutôt que multiplier les objets temporaires à l’export.
Un mode facultatif « projeter les personnes en cas pour cet export seulement » peut
venir ensuite, clairement séparé et sans écriture dans le corpus.

Dans ce mode : un cas par `Personne.id` ; homonymes distincts ; enquêteurs exclus
localement par défaut. Les locuteurs non liés peuvent produire des cas locaux
`(entretienId, locuteurId)` sur choix explicite, sans inventer de personnes persistantes.
Si un ancien locuteur n’a pas d’ID, utiliser une identité locale limitée à l’instantané,
ou demander sa normalisation explicite ; ne pas écrire un ID pendant l’export en secret.

Ne pas exporter à la fois cas personnel persistant et cas temporaire équivalent sans
avertissement. Des cas différents portant sur la même personne restent légitimes.

### 6.3 Sous-corpus d’export

Afficher les cas partiels lorsque certaines de leurs sources sont exclues.
Recommandation : proposer d’inclure toutes leurs sources, ou faire accepter explicitement
la restriction. Les sources illisibles sélectionnées bloquent ; leur exclusion exige un choix.

Ne pas rendre soudain disponible un attribut déclaré incohérent pour la famille entière
parce que l’entretien contradictoire a été décoché à l’export. Appliquer la politique de
validation du cas/de sa famille sur son périmètre déclaré, puis restreindre les matériaux.
Une projection d’attribut propre au sous-corpus serait un autre choix scientifique,
nommé et documenté, hors comportement par défaut.
Les détails issus de sources exclues ne doivent pas pour autant fuiter dans le rapport livré.

## 7. Attributs et données locales

### 7.1 Valeurs et cohérence

Réutiliser le moteur de `plan-cas2.md`, pas une seconde agrégation dans l’exporteur.

- variables d’entretien : attributs de fichier ;
- attributs saisis des cas : valeurs déclarées ;
- attributs dérivés : uniquement si disponibles, à partir des membres de la règle,
  avec variables de même portée ; aucune dérivation entre portées dans ce chantier ;
- ajouts manuels : exclus des valeurs, des données manquantes et des conflits de dérivation ;
- absence : absence de valeur, jamais modalité inventée « inconnu » ;
- une valeur avec des observations manquantes : statut et avertissement conservés ;
- conflit ou lecture non vérifiable : aucune première/dernière/majorité implicite ;
- dérivation invalide : corriger, omettre explicitement l’attribut ou annuler.

Exemple Établissement : A porte deux tailles divergentes, B et C sont cohérents.
Décision validée : Taille est indisponible pour toute la famille A/B/C, sans option
par cas. L’export ne contourne pas la règle ; les autres attributs cohérents restent
exportables. Un attribut absent est différent d’une chaîne contenant un message d’erreur.

À l’inverse, ajouter au cas A un passage d’un locuteur de B ne fait pas intervenir la
taille de B dans le contrôle de A. Ce passage sera exporté dans le cas A sans modifier
ses attributs dérivés. Une source présente seulement par un ajout manuel doit être lue
pour exporter son passage, mais ses valeurs ne deviennent pas des observations de la règle.

### 7.2 Valeurs locales non représentables

Les valeurs longitudinales peuvent être parfaitement légitimes mais non représentables
comme attribut unique. Proposer un tableau annexe volontaire des observations locales,
filtré selon les sources et la confidentialité autorisées.

Cette annexe préserve un détail lisible, **pas une dimension interrogeable nativement
comme attribut longitudinal dans QualCoder**. Pour cela, un futur mode de cas par
participation/période doit être décidé dans SonalPi, pas simulé par concaténation de valeurs.

### 7.3 Identités, types et collisions

- Exporter les libellés des modalités, pas les codes historiques `mExport`.
- Valeurs texte par défaut ; « 00123 » et « 10 à 100 » ne deviennent pas des nombres.
- Ne pas inventer un type date accepté par QualCoder sans preuve de la version cible.
- `attribute_type.name` est globalement unique dans le schéma local examiné : même
  libellé sur fichier et cas exige deux noms d’export distincts.
- Construire les noms depuis `(portée, definitionId)` ; suffixes déterministes si collision.
- Cas, sources, catégories et codes ont également leurs contraintes nominales ; jamais
  de fusion par nom à la suite d’une erreur SQL.
- Table des correspondances entre IDs source opaques et IDs SQL cible, avec diagnostics.
- Ne pas recopier les attributs d’un entretien sur tous les cas personnels par défaut.

## 8. Texte final et projection des positions

### 8.1 Une seule sérialisation

Créer une projection indépendante du DOM et de Vue :

```text
Document ProseMirror + annotations + locuteurs + options
  → texte final complet
  → correspondance des positions PM vers le texte final
  → plages de tours, codages, commentaires et cas
  → diagnostics de transformation
```

Définir et tester : séparateur de paragraphe, changement de locuteur, paragraphes vides,
préfixes, retours à la ligne et présence éventuelle de timecodes.
Ne pas faire `trim()` ou une normalisation de texte après calcul des positions.
Les préfixes sont des éléments de présentation : par défaut, pas des paroles ni des
codages. Scinder si nécessaire une sélection qui traverserait un préfixe injecté.
Une source entière conserve en revanche toute sa représentation textuelle.

### 8.2 Unicode : risque concret à prouver dans la cible

ProseMirror/JavaScript utilisent UTF-16 ; Python compte les points de code avec `len()`
et ses slices ; les curseurs Qt peuvent utiliser des positions UTF-16.
L’importeur Sonal actuel assemble avec Python, alors que le gestionnaire de cas lit
également les positions de curseurs Qt. Il ne faut donc pas annoncer que tous les
chemins QualCoder suivent forcément la même convention.

Le modèle intermédiaire doit annoncer son unité et permettre une conversion explicite.
La preuve cible doit inclure emoji hors BMP, accents composés et combinés, avant et
dans les plages, puis vérifier **à la fois** :

- égalité de `seltext` avec l’extraction selon la convention retenue ;
- affichage et sélection dans QualCoder ;
- extraits des rapports filtrés par cas/code ;
- édition/sauvegarde/réouverture sans décalage.

Si la version cible est incohérente entre SQL, Python et Qt, documenter le défaut et
bloquer le profil concerné ou obtenir une correction. Ne pas supprimer les caractères
problématiques pour faire passer les tests.

### 8.3 Pseudonymisation et bornes internes

Appliquer le choix original/pseudonymisé avant de produire les offsets définitifs,
en tenant compte des annotations d’occurrences V2, de leurs exceptions et des
pseudonymes locaux de locuteurs. Ne pas appliquer aveuglément toutes les règles corpus
à toutes les chaînes : les décisions locales doivent être respectées.

Une borne de cas/code peut tomber à l’intérieur d’une occurrence remplacée par un
pseudo d’une autre longueur. Proposition : traiter le remplacement comme une unité
indivisible, projeter les intersections sur le pseudo entier, et signaler les plages
élargies. Ce changement de granularité doit être accepté dans l’aperçu ; proposer
omission explicite ou arrêt si la précision analytique serait compromise.
Pas de remplacement partiel qui exposerait une fraction du nom réel.

Les chevauchements de substitutions demandent une règle déterministe partagée avec
le rendu V2, testée sur le document complet. Ne pas réutiliser une extraction de
passage isolé qui changerait le pseudo selon les bornes de chaque cas.

## 9. Thèmes, commentaires, notes et auteurs

### Codebook

Lire la hiérarchie `Categorie.parent` et l’ordre courant ; valider les références et
cycles avant sérialisation. Les annotations utilisent actuellement un champ `code` :
résoudre son lien à `Categorie.codeExport` puis à l’ID de catégorie, pas supposer que
`annotation.code` est déjà l’ID opaque.

Conserver couleurs, hiérarchie déclarée et feuilles inutilisées. Parent directement
codé : catégorie et code jumeau selon le profil validé. Préserver codages multiples,
chevauchants et auteurs connus ; fusionner uniquement selon une politique documentée
compatible avec auteur/mémo, pas seulement parce que deux noms de code sont identiques.
Un thème inactif dans l’interface n’est pas forcément à supprimer de l’export.

Les pondérations ne sont pas un type natif distinct dans le modèle V2 examiné.
Ne pas réserver `cat_001/002/003/004` par convention V1. Si des thèmes représentent
réellement des pondérations, les exporter comme codes ordinaires par défaut ; un
profil dédié peut les exclure ou les organiser après identification explicite.

### Commentaires

Exporter les annotations `commentaire` comme mémos de plages après preuve cible.
Le schéma cible impose notamment une unicité `(fid, pos0, pos1, owner)` : si plusieurs
commentaires se heurtent, les fusionner en mémo lisible avec avertissement ou exiger
un choix, jamais les jeter via un `except IntegrityError: pass`.

### Notes

Le modèle actuel n’a pas de `Personne.note`. Ne pas exporter un champ imaginé à partir
d’anciens documents de réflexion.

Pour les notes d’entretien : sélectionner les notes autorisées, convertir le HTML
sanitisé en texte avec titre, catégorie et date disponibles, et proposer leur assemblage
dans `source.memo`. Signaler la perte de mise en forme, d’identité distincte, de rang
et de liens précis aux locuteurs si la cible ne les porte pas nativement.
Un journal ou document annexe peut être une option ultérieure, pas un mélange silencieux
avec la transcription. Les notes ne deviennent pas des matériaux sources par défaut.

Les liens entre une note et plusieurs cas ne sont pas acquis dans le modèle actuel :
ne pas les promettre. Le mémo propre du cas est exportable indépendamment.

### Auteurs et dates

Conserver les auteurs connus sous une identité d’export autorisée. Pour les objets
sans auteur/date d’origine, renseigner le responsable et la date d’export selon les
obligations de la cible, en les identifiant comme provenance de conversion.
Ne pas présenter une date inventée comme date de codage d’origine.

## 10. Confidentialité de l’ensemble des artefacts

Par défaut : texte pseudonymisé, variables privées exclues, notes privées exclues,
audio exclu. Une sortie originale exige un choix explicite.
Pseudonymisation ne signifie pas garantie d’anonymat.

Contrôler aussi :

- noms et mémos de cas, de familles, de personnes et de sources ;
- noms des codes, modalités et attributs, commentaires et auteurs ;
- identifiants dérivés de noms, chemins absolus, références Nextcloud ;
- annexes, rapports d’erreur, journaux, tables de correspondance et médias ;
- règles d’anon contenant des entités réelles, brouillons et contenu `legacy`.

Les pseudonymes ne sont pas des identités : deux personnes avec le même pseudo restent
séparées. Le nom d’un cas n’est pas pseudonymisé automatiquement par l’affichage de ses
extraits. Prévoir des libellés d’export distincts, validés dans l’aperçu, sans renommer
les objets du corpus. Un pseudo absent/refusé doit être visible avant partage.

La confidentialité se propage aux dérivations : un attribut calculé depuis une variable
privée est privé ; une famille créée depuis une modalité privée peut révéler cette donnée
par son nom ou sa seule appartenance. L’exclusion de la colonne seule ne suffit pas.
Faire omettre ou autoriser explicitement ces cas/critères sensibles.

Les diagnostics complets peuvent rester visibles dans l’application autorisée, sans
être recopiés dans le rapport externe. Produire un rapport expurgé avec IDs d’export,
pas une annexe cachée conservant tous les noms réels.

## 11. Collecte cohérente et sécurité d’écriture

### Collecte

1. Faire enregistrer/publier les modifications en attente avant l’export.
2. Capturer les définitions et versions du corpus et des entretiens nécessaires.
3. Charger et valider une fois chaque source ; borner le parallélisme.
4. Résoudre cas et attributs sur ces données, puis appliquer les choix de sortie.
5. Construire aperçu et fichiers depuis le même objet de collecte immuable.
6. Vérifier les révisions/ETag et changements de membership pendant la collecte.
7. Si changement : recommencer ou demander un nouvel aperçu, pas mélanger les versions.

Le distant ne fournit pas magiquement un instantané transactionnel de tous les fichiers.
Ne pas lire le miroir périmé comme s’il était la source fraîche ni contourner les
contrats de publication. Les sauvegardes explicites précèdent la collecte ; l’export
lui-même ne modifie ni cas, ni métadonnées, ni relations d’identité.

### Sortie

- Générer un nouveau dossier temporaire de projet, sur le volume de destination.
- Refuser l’écrasement d’un projet existant ; pas de modification du projet cible ouvert.
- SQL paramétré ; transaction globale des insertions, rollback en cas d’échec.
- Traiter les collisions de noms avant SQL ; autres erreurs SQL remontées sans boucle.
- Tester l’intégrité SQLite et les références métier, y compris celles non protégées
  par des clés étrangères dans le schéma cible.
- Fermer la connexion et finaliser les éventuels fichiers de journal avant publication.
- Publier par renommage du dossier validé ; nettoyer le temporaire après échec/annulation.
- Noms de fichiers sûrs, pas de traversal, symlink extérieur ni secrets de connexion.
- Si archive ou importeur spécifique retenu : validation de manifeste, taille décompressée,
  unicité des entrées, chemins et nombre de projets, sans extraction aveugle.

## 12. Audiovisuel : différé, hors du chantier actuel

Décision validée : laisser l’audio de côté pour l’instant. Les pistes ci-dessous
préparent seulement un éventuel chantier ultérieur, sans bloquer l’export textuel.

V2 conserve des ancres `{pos, t}` mesurées et référence l’audio, souvent par chemin absolu
ou désignation distante. Les données ne sont plus simplement les `data-deb/data-fin` V1.

Distinguer quatre preuves :

1. média copié de façon portable sur consentement, original jamais modifié ;
2. relation source média/transcription attendue par QualCoder (`av_text_id` à vérifier) ;
3. repères temporels correctement reconnus par le lecteur cible ;
4. `code_av` exacts et correctement liés aux codages textuels si ce lien est supporté.

Ne pas inventer des bornes temporelles certaines à partir de positions interpolées.
Définir le sort d’une sélection entre deux ancres, d’un trou audio ou d’un média absent.
Les cas restent des rattachements textuels dans le premier lot ; leur éventuelle
sémantique temporelle exige une preuve supplémentaire.

Pas de copie audio silencieuse, notamment en mode pseudonymisé : la voix et le contenu
sonore restent identifiants. Prévoir taille, espace disque, téléchargement explicite,
annulation et doublons de médias. Une annexe audio n’équivaut pas à un projet synchronisé.

## 13. Architecture proposée

Séparer modèle métier, projection de texte et adaptation QualCoder.
Noms de fichiers indicatifs :

```text
src/shared/export/qualcoder/modele.ts
  Modèle intermédiaire indépendant de SQL, Vue et des formats historiques.

src/shared/export/qualcoder/projection.ts
  Texte final, positions et diagnostics de transformation.

src/shared/export/qualcoder/mapping.ts
  Correspondances, noms, codebook, attributs et pertes.

src/main/exportQualcoder.ts
  Collecte versionnée, validation, écriture et publication du projet.

src/main/qualcoder/profils/<version>/
  Schéma/fixture contrôlé et adaptateur de version.

src/renderer/components/corpus/ModaleExportCorpus.vue
  Point d’entrée commun : sélection du corpus et choix du mode QualCoder.

src/renderer/components/ExportQualcoderModale.vue
  Options, aperçu, diagnostics, acceptation et progression.
```

Réutiliser le résolveur de cas et d’attributs de Cas2 :
`projeterCasDepuisSourcesPreparees` pour les matériaux,
`projeterAttributsCas` pour la fiche exportable et `evaluerDerivationFamille` pour la
politique stricte. Ces fonctions sont pures et indépendantes de Vue ; les deux premières
vivent encore dans des modules différents et devront être réunies par le modèle intermédiaire,
sans recopier leur logique. Le coût de parsing d’un document doit être mutualisé entre
tous ses cas et annotations.

Le modèle intermédiaire contient : sources finales, codes/catégories, codages,
commentaires, cas, plages, attributs, correspondances et diagnostics. Une source
entière y est distinguée d’un passage initial, même si la cible la matérialise par une plage.

L’écriture SQLite est confinée au main ou à un convertisseur empaqueté. Évaluer les
contraintes de dépendances Electron avant de choisir la bibliothèque ; ne pas imposer
silencieusement Python et PyQt à tous les utilisateurs SonalPi.

## 14. Assistant d’export

1. **Destination et compatibilité** : profil QualCoder supporté, dossier de projet neuf.
2. **Sources et confidentialité** : entretiens, original/pseudonymisé, métadonnées,
   variables et notes ; médias hors premier lot.
3. **Cas** : cas existants sélectionnés, plusieurs familles possibles, aucun cas possible ;
   cas vides, partiels et dépendances manquantes explicités.
4. **Attributs et pertes** : valeurs disponibles, manquantes, incohérences, règles non
   transportées, noms d’export et notes transformées.
5. **Aperçu final** : textes réellement exportés, passages et totaux attendus ; validation
   des omissions, pseudonymes et changements de granularité.
6. **Génération** : progression, annulation sûre, projet et rapport expurgé.

Ne pas certifier la confidentialité d’un paquet contenant encore des champs libres
non vérifiés. Bloquer les erreurs structurelles et les choix obligatoires ; les omissions
non bloquantes demandent un accord explicite et figurent dans le rapport.
Un profil mémorise des choix, pas des décisions de cohérence devenues périmées.

## 15. Lots et preuves d’acceptation

### E0 — cadrage cible et preuve minimale bloquante

- [x] Choisir le projet natif et l’installation cible `/home/belignem/Vscode/QualCoder`.
- [ ] Relever et figer la révision locale, ses modifications pertinentes et son schéma.
- [ ] Créer un projet vide contrôlé de cette version et documenter sa provenance.
- [ ] Construire une fixture indépendante du vrai corpus avec deux entretiens,
  une personne récurrente, un autre participant et un enquêteur.
- [ ] Exporter sources complètes, un code, un cas avec deux passages, un cas vide,
  un cas source entière, un attribut fichier et un attribut cas.
- [ ] Vérifier que le mode QualCoder est proposé depuis Corpus → Exporter le corpus
  et qu’il ne déclenche pas les écritures TXT, HTML, DOCX ou PDF.
- [ ] Inclure emoji et accents combinés pour trancher les conventions de positions.
- [ ] Ouvrir réellement dans QualCoder ; vérifier navigation, sélection et rapport filtré.

Cette preuve remplace la preuve REFI des anciens plans. Elle précède l’adaptateur
complet et l’assistant final ; elle peut être menée pendant la finition de Cas2.

### E1 — projection et modèle intermédiaire

- [ ] Collecte cohérente et immutable, erreurs de lecture explicites.
- [ ] Sérialisation unique, préfixes et positions pour tous les objets.
- [ ] Original/pseudonymisé, identités, nomenclature et confidentialité.
- [ ] Tests purs avec résultat attendu indépendant de l’implémentation.

### E2 — export textuel complet du périmètre retenu

- [ ] Hiérarchie et codages, commentaires et mémos validés.
- [ ] Cas manuels et avec règle, cas vides et ajouts manuels dans tous les parcours.
- [ ] Union sans doublons et provenance ; ajouts sans effet sur les attributs dérivés.
- [ ] Attributs fichier/cas, familles et conflits sans contournement.
- [ ] Transaction, contrôle d’intégrité, publication sûre et rapport de pertes.

### E3 — assistant et recette utilisateur

- [ ] Aperçu fidèle, omissions consenties, reprise après changement distant.
- [ ] Profils réutilisables revalidés et destination non écrasée.
- [ ] Recette de bout en bout et protocole reproductible dans QualCoder.
- [ ] Documentation des limites, formats et versions certifiées.

### E4 — extensions après premier export exploitable

- [ ] Audiovisuel avec preuves séparées.
- [ ] Éventuels cas locaux/temporaires, métadonnées longitudinales et notes avancées.
- [ ] Étude REFI-QDA depuis le modèle intermédiaire, sans modifier les cas pour
  satisfaire un contournement spécifique d’import XML.

## 16. Matrice de validation

| Domaine | Contrôles |
| --- | --- |
| Fidélité V1 utile | Métadonnées actuelles faisant autorité ; aucun vide ne masque une valeur ; hiérarchie et parent jumeau conditionnel |
| Cas | Manuel vide ; sélection ; personnes multiples ; sources entières ; modalités aux deux portées ; ajouts manuels à chaque type de règle ; union sans doublons |
| Focus group | A et B dans la même source, questions hors contribution automatique des participants ; ajout volontaire possible |
| Panel | Même personne dans deux entretiens, rôle variable, homonymes distincts |
| Attributs | Conflit de règle pour A bloquant Taille pour A/B/C ; passage de B ajouté à A sans effet sur Taille ; valeurs absentes avec avertissement ; âge changeant |
| Sources partielles | Sous-corpus accepté ; pas de conflit rendu valide par exclusion d’une source ; pas de fuite de cette source |
| Positions | UTF-16/points de code/Qt ; emoji ; combinants ; retours ; préfixes ; plage multibloc ; pseudo plus court/long |
| Codages | Superposition, parent codé, code inutilisé, auteurs distincts, annotation orpheline diagnostiquée |
| Notes | Public/privé ; HTML vers mémo ; collision de commentaires ; aucune note ajoutée au fulltext |
| Confidentialité | Texte, noms, attributs, appartenance aux cas, auteurs, rapports, annexes et chemins |
| SQL | Contraintes nominales, rollback, références valides, intégrité, projet complet, pas de collisions avalées |
| Fonctionnel cible | Cas visibles, passages exacts, sources accessibles, attributs filtrables, rapports corrects, réouverture |
| Robustesse | Annulation, disque plein, destination existante, source distante changée, fichier illisible |

Vérifications automatiques possibles : `PRAGMA integrity_check`, absence de références
pendantes, plages dans les bornes selon l’unité cible, comparaison de texte attendu,
comptages par objet et contrôle des valeurs d’attributs.
Elles ne remplacent pas les vérifications Qt et les rapports de QualCoder.

Fixture métier finale :

- trois établissements A/B/C ; deux locuteurs d’établissements différents dans un entretien ;
- une personne récurrente avec une valeur locale changeante ; un homonyme non lié ;
- une taille incohérente pour A puis corrigée ; une valeur manquante pour C ;
- un cas manuel avec un passage parlant d’une personne sans être prononcé par elle ;
- un cas A avec règle enrichi par un passage de B, exporté sans modifier Taille ;
- un passage présent par règle et ajout manuel, exporté une fois sans perdre sa double provenance dans le rapport autorisé ;
- un cas collectif de personnes, un cas de plusieurs fichiers et un cas volontairement vide ;
- thème parent codé, feuille inutilisée, commentaire, note privée et pseudonyme de longueur différente.

Le résultat est accepté lorsque les cas sélectionnés et leurs attributs disponibles
sont réellement utilisables dans QualCoder, les passages exacts conservent leur contexte,
et toutes les pertes observées correspondent au rapport accepté.

## 17. Décisions validées et points restants

### Validé par l’utilisateur

1. Générer depuis le modèle natif SonalPi V2 un projet natif QualCoder `.qda`,
   sans passer par l’importeur historique Sonal, depuis Corpus → Exporter le corpus.
2. Cibler l’installation `/home/belignem/Vscode/QualCoder` et prouver l’ouverture avec elle.
3. Proposer cas collectif et création d’un cas par personne/fichier au choix.
4. Incohérence d’un attribut pour un cas : attribut indisponible pour toute sa famille.
5. Valeur unique connue avec données manquantes : disponible avec avertissement.
6. Cas avec règle dynamique enrichissables manuellement ; pas de séparation stricte ouvert/fermé.
7. Attributs dérivés uniquement des membres de la règle, indépendants des ajouts manuels.
8. Variables de même portée uniquement ; dérivations entre portées différées.
9. Audio et synchronisation laissés de côté pour le présent chantier.

### À préciser ou vérifier

- Relever l’état exact de l’installation cible au début du prototype.
- Détailler les structures de Cas2 déjà implémentées et le seul point éventuellement
  hors périmètre : l’éditeur de critères d’un cas existant.
- L’audio ne fait plus partie des arbitrages bloquants : son traitement est différé.

## 18. Références et limites de cette rédaction

- `plans/encours/plan-cas2.md`, `plan-cas.md`.
- `plans/reflexion/export-sonal.md`, `export-sonal-alt.md` : historique d’orientation,
  REFI non prioritaire dans le présent plan.
- `src/shared/format.ts`, `src/shared/corpus/cas.ts`, `src/shared/entretien/annotation.ts`.
- `src/renderer/editor/cas.ts`, `passages.ts`, `src/renderer/import/exportSonal.ts`.
- Sources InteropQuali et importeurs Python listés en section 2.
- QualCoder local : `__main__.py` pour le schéma, `app.py` pour le projet,
  `case_file_manager.py` pour sources entières et passages, `sonal_import.py` pour le mapping V1.

Aucun projet QualCoder n’a été créé, ouvert ou validé pendant cette rédaction.
Aucun code source existant n’a été modifié. Les profils, mappings et recettes restent
à prouver avec la version cible choisie ; ce plan ne certifie pas un export déjà disponible.
