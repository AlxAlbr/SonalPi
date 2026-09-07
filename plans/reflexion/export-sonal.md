# Plan de réflexion — export SonalPi2 vers QualCoder

> Hypothèse : `plans/encours/plan-corpus-onglet-personnes.md` est implémenté.
> Ce document prépare un nouvel export de corpus vers QualCoder, pas une évolution
> du format historique `.sonal`. Aucune implémentation n'est engagée ici.

## 1. Recommandation

Proposer un assistant **Exporter vers QualCoder**, avec les personnes comme cas
recommandés et les variables comme attributs. Ne pas ajouter immédiatement une
notion générale de cas au modèle SonalPi2 : les cas peuvent être une projection
construite pour l'export, sans modifier le corpus.

La question de l'assistant doit être **« Quelles unités voulez-vous étudier ? »**,
plutôt que « Quelle variable est un cas ? ».

Un cas est une unité d'analyse (personne, organisation, ménage, situation…) à laquelle
on rattache des documents ou des passages. Une variable décrit cette unité.

Exemples :

- Marie est un cas ; sa profession est un attribut.
- L'établissement A peut être un cas regroupant plusieurs entretiens.
- Une variable « Établissement » peut produire un cas par modalité, si chaque modalité
  identifie bien un établissement.
- « Enseignant » est généralement une valeur de profession, pas une identité de
  personne. Regrouper toutes les paroles d'enseignants peut être un choix analytique,
  mais ne doit jamais être confondu avec l'identification des individus.

Les cas ne sont pas obligatoires : QualCoder permet aussi d'analyser des fichiers avec
leurs attributs, sans créer de cas.

## 2. Modes de construction des cas

### 2.1 Personnes — mode recommandé

- Un cas par `Personne.id`, jamais par nom.
- Rattacher uniquement les passages prononcés par les locuteurs liés à cette personne,
  dans les entretiens sélectionnés.
- Ne pas attribuer tout un entretien à chaque participant : dans un entretien collectif,
  cela mélangerait leurs paroles ; dans un entretien individuel, cela inclurait les questions.
- Conserver la transcription complète comme source : le contexte reste consultable.
- Ne pas fusionner des homonymes. Produire des noms d'export distincts et stables si
  nécessaire, sans renommer les personnes dans SonalPi2.
- Les personnes sans passage dans la sélection sont omises et comptabilisées.
- Les passages sans locuteur restent dans le texte mais hors des cas personnels.

Locuteurs non liés : proposer, par défaut, un cas local distinct par couple
`(entretienId, locuteurId)`. Leur nom d'affichage inclut l'entretien. L'utilisateur
peut choisir de les omettre des cas ; leurs paroles restent dans les sources.
Aucun rapprochement par nom n'est effectué à l'export.

Les enquêteurs sont exclus des cas par défaut, pas des transcriptions. Le filtre
s'applique à chaque locuteur local : une personne peut être enquêteur dans un entretien
et participante dans un autre. L'aperçu explicite les passages retenus.

### 2.2 Entretiens — alternative simple

Un cas par entretien, associé à la totalité de son texte. Les variables d'entretien
peuvent alors décrire les cas. Ce mode convient lorsque l'entretien est réellement
l'unité étudiée ; il est souvent redondant avec les sources et n'est pas le défaut.

### 2.3 Modalités d'une variable — option avancée

Libellé : **« Créer un cas par modalité de cette variable »**.

- Variable d'entretien : chaque cas regroupe les textes complets des entretiens
  portant cette modalité.
- Variable de locuteur : chaque cas regroupe les passages des locuteurs portant
  cette modalité dans leur entretien ; ne pas étendre ce rattachement aux autres
  interventions de la personne.
- Identité du cas : couple `(variableId, modaliteId)`, pas libellé.
- Valeur absente : aucun rattachement, avec compteur dans l'aperçu ; pas de cas
  « Inconnu » implicite.
- Référence à une modalité supprimée : diagnostic, jamais regroupement arbitraire.
- Plusieurs entités réelles partageant une modalité seront regroupées : afficher
  cet avertissement avant validation.

Une variable sélectionnée ne change pas de nature dans SonalPi2 et peut rester
exportée comme attribut. Ne pas déduire automatiquement les autres attributs du groupe.

Premier livrable : personnes ou aucun cas. Les modes entretiens et modalités viennent
ensuite. Une seule famille de cas par export au début évite une interface trop complexe.
Le cumul de familles pourra être ajouté avec des noms et attributs de type explicites.

## 3. Variables : le véritable problème restant après Personnes

Le plan Personnes ne crée pas de valeurs de variables au niveau personne. Les valeurs
restent sur les locuteurs locaux et peuvent légitimement varier avec le temps.

| Donnée SonalPi2 | Cible recommandée |
| --- | --- |
| Entretien | Source textuelle |
| Variable d'entretien | Attribut de fichier |
| Personne | Cas et passages de ses locuteurs |
| Variable de locuteur, valeur compatible | Attribut du cas personnel |
| Thème | Code ou catégorie selon la structure cible |
| Annotation thématique | Codage du passage correspondant |
| Note de personne | Mémo de cas, sous réserve des options de confidentialité |

### 3.1 Politique d'agrégation explicite

Pour chaque personne et variable de locuteur, sur les seuls entretiens exportés :

1. aucune valeur renseignée : attribut absent ;
2. une seule modalité distincte : proposer cette valeur ; signaler les occurrences
   manquantes sans prétendre que la valeur a été renseignée partout ;
3. plusieurs modalités : conflit de projection à résoudre, pas erreur du corpus.

Exemple : Marie a 29 ans dans A et 31 ans dans B. Un attribut unique « Âge = 31 »
ferait disparaître une information temporelle. Ne choisir ni la première ni la dernière
valeur silencieusement ; ne pas concaténer « 29 ; 31 » comme une modalité ordinaire.

L'assistant propose :

- ne pas exporter cet attribut de cas, en conservant le détail dans un tableau annexe ;
- choisir explicitement une valeur pour cet export seulement ;
- revenir aux données, si l'utilisateur constate une erreur réelle.

Le choix recommandé est l'omission de l'attribut conflictuel avec conservation du détail.
Une validation explicite est nécessaire ; le rapport liste toutes les omissions.

Prévoir un tableau annexe des valeurs locales : entretien, cas d'export, locuteur,
variable, modalité, présence ou absence. Ce tableau conserve le détail mais **ne le rend
pas interrogeable comme attribut longitudinal dans QualCoder**.

Si l'analyse longitudinale avec attributs variables est essentielle, prévoir ensuite
un mode « participation » : un cas par personne et entretien, muni d'un identifiant
transverse de personne. Ce mode privilégie les valeurs situées plutôt que l'unicité
du cas personnel. Ce choix scientifique doit rester explicite.

### 3.2 Noms et types d'attributs

- Exporter les libellés de modalités, pas leurs codes numériques historiques.
- Utiliser le type texte par défaut : une tranche d'âge ou un code postal n'est pas
  nécessairement un nombre.
- Éviter les collisions de noms entre variables, y compris entre portées.
- Si une variable existe sur fichiers et cas, produire des définitions distinctes,
  avec noms et GUID distincts : l'importeur observé affecte une portée à la définition.
- Ne pas recopier les variables d'entretien sur chaque personne : elles décrivent
  d'abord la situation de recueil, pas nécessairement l'individu.

## 4. Format cible et preuve de compatibilité

### 4.1 Choix proposé : REFI-QDA `.qdpx`

Privilégier un paquet d'échange REFI-QDA importable dans QualCoder, plutôt que générer
sa base SQLite native. Cela réduit le couplage au schéma interne et ouvre la voie à
d'autres logiciels. Un simple codebook `.qdc` ou un CSV de cas ne suffit pas à transporter
les textes, leurs codages et les rattachements aux cas.

Le choix reste soumis à une preuve d'import réelle sur une version identifiée de
QualCoder. Figer une version publiée et son schéma REFI, puis noter version et commit
dans les fixtures ; `master` est une source d'exploration, pas un contrat stable.

### 4.2 Particularité observée dans l'importeur

Dans `src/qualcoder/refi.py` consulté sur `master` :

- `parse_cases()` crée les cas nommés et leurs attributs ;
- `clean_up_case_codes_and_case_text()` transforme en rattachements de cas les
  codages dont le code possède le même GUID que le cas, puis supprime ces codes
  techniques ;
- les cas sans nom avec une référence de source peuvent servir au transport
  d'attributs de fichiers (`parse_cases_for_file_variables()`).

Conséquence : ne pas supposer qu'une liste de `<Case>` ou des références de source
suffiront pour rattacher les paroles. Le prototype doit valider la représentation
REFI des sélections, avec le mécanisme cas/code reconnu par l'importeur si approprié.
Ces codes de transport ne doivent pas subsister comme thèmes dans le projet importé.
Vérifier aussi la conformité au schéma : un comportement de l'importeur ne remplace
pas la spécification REFI.

### 4.3 Prototype bloquant avant l'interface

Créer un corpus minuscule : deux entretiens, Marie présente dans les deux, Paul dans
un entretien collectif, un enquêteur, un thème chevauchant une frontière de tour,
un attribut de fichier et un attribut de cas.

Après import effectif dans QualCoder, vérifier :

- deux sources complètes et lisibles ;
- un seul cas Marie avec ses passages des deux sources ;
- Paul sans les paroles de Marie et inversement ;
- questions présentes mais non rattachées aux participants ;
- attributs aux bonnes portées ;
- codages exacts et absence de code technique résiduel ;
- consultation et rapport filtré par cas utilisables.

Si ce prototype échoue, ajuster l'adaptateur avant de construire l'assistant.
Un XML valide ou une archive lisible ne constituent pas une preuve suffisante.

## 5. Assistant d'export

### Étape 1 — périmètre et confidentialité

Sélection des entretiens, mode de texte, variables, notes, inclusion éventuelle des médias.
Exclure par défaut variables privées et notes privées. Distinguer clairement export
nominatif et export pseudonymisé ; ne pas présenter ce dernier comme une garantie
absolue d'anonymat.

### Étape 2 — unités d'analyse

```text
Créer des cas à partir de :
● Personnes du corpus (recommandé)
○ Aucun cas : sources et attributs uniquement

Locuteurs non liés : [Créer des cas locaux distincts]
☐ Inclure les interventions des enquêteurs dans les cas

Aperçu : 24 personnes · 6 cas locaux · 2 locuteurs enquêteurs exclus
```

Les modes avancés seront ajoutés après validation du premier livrable.

### Étape 3 — attributs

Liste des variables, cible fichier/cas, valeurs manquantes et conflits.
Afficher les valeurs par entretien pour arbitrer sans modifier les données sources.

### Étape 4 — contrôle et génération

Aperçu nominatif des cas, sources et nombres de passages ; avertissements et pertes.
Bouton Exporter désactivé tant que les erreurs bloquantes ou choix obligatoires ne sont
pas résolus. Un export sans certaines données reste possible après accord explicite.

Livrer le `.qdpx`, un rapport de conversion lisible et, si demandé, les tableaux annexes.
Les rapports et tableaux suivent exactement les mêmes règles de confidentialité que
l'archive. Un profil réutilisable ne stocke que les choix d'export et doit être revalidé
si le corpus change ; aucun cas d'export n'est écrit dans le modèle métier.

## 6. Autres difficultés à ne pas sous-estimer

### 6.1 Positions et texte final

Les positions ProseMirror ne sont pas des offsets dans un texte brut. Construire une
projection unique qui produit le texte final et la correspondance des positions pour
les thèmes, cas et annotations.

Définir les retours à la ligne, séparateurs de tours et éventuels noms de locuteurs
avant tout calcul d'offset. Tester accents, caractères combinés, emoji et caractères
hors BMP : JavaScript compte des unités UTF-16 alors que Python manipule des caractères
Unicode. Vérifier les conventions REFI et celles de la version de QualCoder ciblée,
y compris les bornes de fin, au lieu de transférer directement les positions PM.

La pseudonymisation modifie les longueurs : projeter les intervalles sur le texte
réellement exporté et définir le comportement quand une borne coupe un remplacement.
Un segment vide ou devenu non représentable doit être diagnostiqué.

### 6.2 Thèmes, annotations et notes

Vérifier la différence entre catégories et codes dans QualCoder. Un thème SonalPi2
peut-il avoir des enfants et être lui-même appliqué ? Si la cible ne le permet pas,
prévoir une catégorie et un code associé distinct, avec une règle de nommage claire.
Conserver autant que possible hiérarchie, couleurs et codages multiples/chevauchants.

Inventorier séparément commentaires de passages, notes d'entretien, mise en forme,
surlignages et annotations de pseudonymisation. Ne pas transformer tous ces objets en
codes. Définir pour chacun : conversion native validée, annexe, ou omission signalée.
Les données `legacy` ne sont pas supposées compréhensibles par QualCoder.

### 6.3 Audio et synchronisation

Un premier export textuel exploitable n'est pas un export audiovisuel complet.
Distinguer : copie du média, lien transcription/média, repères temporels et codages
sur média. Chacun demande un test dans QualCoder. Ne pas confondre temps mesurés et
interpolés ; ne pas inventer des bornes certaines.

Pour un paquet portable, les médias devront être copiés sur consentement explicite,
sans modifier les originaux. Un chemin local ou une URL Nextcloud ne suffit pas.
Gérer taille, absence de média, téléchargement distant, annulation et espace disque.
Les voix peuvent identifier les personnes même si le texte est pseudonymisé : médias
exclus par défaut du mode pseudonymisé, avec avertissement avant toute inclusion.

### 6.4 Cohérence et sécurité

- Vider les sauvegardes différées avant l'inventaire ; l'export ne modifie pas le corpus.
- Construire aperçu et archive à partir du même instantané. En distant, lire les
  versions/ETag et détecter un changement pendant la collecte ; demander une reprise
  plutôt que promettre un instantané atomique inexistant.
- Ne pas omettre silencieusement un entretien illisible ou indisponible.
- Ne pas inclure secrets de connexion, chemins personnels ou noms réels dans les
  noms de fichiers, GUID dérivés de noms, journaux ou rapports pseudonymisés.
- Échapper le XML, sécuriser les noms de fichiers et écrire l'archive temporairement
  avant publication finale ; nettoyer après annulation ou échec.
- Export vers un nouveau projet : pas de fusion incrémentale ni de synchronisation
  retour garantie. Réimporter deux fois peut créer des doublons.

## 7. Architecture proposée

Créer un export distinct de `src/renderer/import/exportSonal.ts`, qui reste consacré
au format historique. Noms indicatifs :

- `src/shared/export/qualcoder/projection.ts` : sources finales, positions et provenance ;
- `src/shared/export/qualcoder/cas.ts` : règles de construction et agrégation d'attributs ;
- `src/shared/export/qualcoder/refi.ts` : modèle d'échange et sérialisation XML ;
- service main : lecture du corpus, validation, médias, archive et écriture atomique ;
- composant renderer : assistant, aperçu et arbitrages.

Le modèle intermédiaire contient sources, codes, codages, cas, sélections de cas,
attributs, diagnostics et correspondances d'identités. Il ne dépend ni de Vue ni de
SQLite. Les règles métier sont testables sans lancer QualCoder.

Réutiliser les fonctions existantes de lecture du document, de projection des positions,
d'EAV et de pseudonymisation après vérification de leur contrat ; ne pas reconstruire
le texte par une simple concaténation ad hoc propre à chaque type d'annotation.

## 8. Lots et critères d'acceptation

### Lot 0 — preuve de passage vers QualCoder

Figer version cible et schéma, produire la fixture minimale, importer réellement,
contrôler les cas et leurs passages. Documenter les pertes observées.

### Lot 1 — export textuel utilisable

Sources complètes, thèmes/codages, attributs de fichiers, cas personnels et locaux,
agrégation explicite, assistant, rapport et politiques de confidentialité.
Les données non prises en charge sont inventoriées avant validation, pas découvertes
après import. Pas de promesse d'export intégral à ce stade.

### Lot 2 — unités avancées et notes

Cas d'entretien, regroupement par modalités, éventuel mode participation,
conversion des notes/commentaires vérifiée dans la cible.

### Lot 3 — audiovisuel

Médias portables, synchronisation et codages temporels validés sur des fixtures dédiées.

Tests transversaux :

- personne multi-entretiens, homonymes, locuteurs non liés, référence pendante ;
- entretien collectif, enquêteur à rôle variable, passages sans locuteur ;
- valeurs compatibles, manquantes, évolutives et collisions de libellés ;
- variable de regroupement aux deux portées, modalités absentes ou invalides ;
- Unicode, sauts de ligne, bornes, chevauchements et pseudonymes de longueur différente ;
- hiérarchie de thèmes avec parent codé ;
- absence de données privées dans l'ensemble des artefacts ;
- annulation, erreur disque, média absent, corpus distant modifié pendant la collecte ;
- validation du paquet et du XML, puis contrôle d'import sur la version QualCoder figée.

Le premier livrable est accepté lorsqu'un utilisateur peut retrouver ses textes,
leurs codages, ses personnes et leurs paroles exactes dans QualCoder, puis produire
un résultat filtré par cas, avec les pertes connues annoncées et acceptées.

## 9. Décisions proposées et questions ouvertes

Décisions recommandées :

1. Personnes → cas par défaut ; variables → attributs.
2. Pas de nouveau modèle générique de cas dans SonalPi2 pour ce chantier.
3. Regroupement par modalités proposé ensuite comme option explicite.
4. Aucun arbitrage silencieux des valeurs longitudinales.
5. REFI-QDA privilégié, soumis à une preuve de compatibilité avant développement UI.
6. Export textuel en premier ; audiovisuel considéré comme un chantier distinct.

À confirmer avec l'utilisateur :

- L'usage principal vise-t-il les personnes, les organisations, ou les deux ?
- L'âge/profession doivent-ils être analysables par vague d'entretien dans QualCoder ?
- L'audio synchronisé est-il indispensable dès le premier export ?
- Quelles notes et mises en forme sont indispensables, au-delà des thèmes et passages ?

**Conclusion :** l'onglet Personnes lève la difficulté d'identité transverse ; l'assistant
lève celle du choix d'unité d'analyse. Restent surtout les attributs évolutifs, les
rattachements exacts aux passages, la projection des positions et l'audiovisuel.
Un petit export réellement importé dans QualCoder est le prochain jalon décisif.

## 10. Sources examinées

- Plan local : `plans/encours/plan-corpus-onglet-personnes.md`.
- Modèle actuel : `src/shared/format.ts`.
- Export historique, distinct de ce chantier : `src/renderer/import/exportSonal.ts`.
- Documentation des cas : https://qualcoder.org/doc/fr/3.3.-Cases/
  Elle distingue fichiers complets et portions de texte associés aux cas, ainsi que
  l'import des attributs, qui ne rattache pas à lui seul les textes.
- Dépôt : https://github.com/ccbogel/QualCoder/tree/master
- Importeur consulté : https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/refi.py

Cette lecture documentaire et du code ne remplace pas un essai d'import : aucun projet
QualCoder n'a été généré ni testé pendant la rédaction de ce plan.
