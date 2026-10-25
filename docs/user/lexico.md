# Utiliser Lexico

Lexico construit un index des mots du corpus et permet de vérifier chaque résultat dans
son contexte. Il est accessible dans l’espace **Analyser et interpréter**, onglet **Lexico** :
ses filtres occupent la colonne de gauche, l’index et les concordances la colonne de droite.

## Lire l’index

Le tableau indique, pour chaque forme :

- son nombre d’occurrences ;
- le nombre d’entretiens distincts où elle apparaît.

Clique sur une ligne pour afficher ses concordances, puis sur une concordance pour ouvrir
l’entretien à la bonne position. Le contexte peut dépasser les matériaux sélectionnés :
seul le mot mis en évidence est compté.

La recherche, la fréquence minimale et l’option d’affichage des nombres modifient seulement
le tableau visible. Elles ne changent pas les matériaux annoncés dans le bilan.

Lexico utilise le texte pseudonymisé. Une entité remplacée par un pseudonyme compte comme
une unité ; ses mots originaux ne sont pas ajoutés à l’index. Un texte pseudonymisé peut
toutefois rester identifiable par son contexte ou ses métadonnées.

## Limiter les matériaux

Le panneau propose cinq dimensions :

- **Entretiens** : texte des sources choisies ;
- **Variables** : sources portant une modalité d’entretien, ou paroles des locuteurs portant
  une modalité locale ;
- **Personnes** : paroles liées aux personnes choisies ;
- **Thèmes** : mots qui rencontrent les passages codés avec les thèmes choisis ;
- **Cas** : mots présents dans les matériaux existants des cas choisis.

Dans une même liste, un mot peut correspondre à l’un ou l’autre des choix. Lorsque
plusieurs onglets portent un filtre, le mot doit répondre à tous ces critères à la fois.
Par exemple,
**Personne Marie** et **Cas Marie** ne conservent que les paroles de Marie présentes dans
ce cas ; un passage de Paul ajouté au même cas reste une parole de Paul.

**Sans restriction** est différent de **Tout cocher**. Le badge gris « Sans restriction »
indique que l’onglet ne retire aucun mot ; un badge jaune signale un filtre appliqué.
Dans Entretiens, le badge indique lui aussi « Sans restriction ». Le nombre d’entretiens
inclus reste indiqué dans le panneau, mais leurs cases sont décochées tant qu’aucune source
précise n’est demandée. Il en va de même dans Personnes : toutes les paroles admissibles
restent analysées tant qu’aucune personne précise n’est cochée.

Cocher un premier élément crée une sélection explicite. **Tout cocher** crée également
une sélection explicite de tous les éléments actuels ; contrairement à **Sans restriction**,
elle n’inclura pas automatiquement un futur entretien après actualisation.

Toutes les personnes ne couvrent pas les locuteurs non associés, et tous les cas ne
couvrent pas le texte hors cas. Les options **Locuteurs sans personne associée** et
**Passages sans locuteur** permettent de les choisir explicitement.

Les paroles des enquêteurs sont exclues par défaut d’après leur rôle local. L’option
**Inclure les paroles des enquêteurs** ne peut pas ajouter à un cas un passage absent de
ses matériaux.

Changer d’onglet ou masquer le panneau ne retire aucun filtre. Les badges signalent les
filtres encore appliqués.

## Adapter le traitement lexical

Le bouton **Traitement lexical** ouvre trois outils :

- **Mots outils** retire de l’index les formes peu utiles à l’analyse. Tu peux ajouter
  une forme, utiliser une petite liste proposée ou sélectionner plusieurs lignes du
  tableau puis choisir **Ajouter aux mots outils**. L’œil placé près d’une liste comme
  **Articles** affiche son contenu. Tu peux y ajouter ou retirer des mots, puis enregistrer
  cette personnalisation pour le corpus. **Restaurer la liste d’origine** annule uniquement
  cette personnalisation.
- **Regroupements et lemmes manuels** réunit les occurrences de plusieurs formes sous
  un même libellé. Sélectionne les lignes du tableau, choisis **Regrouper / lemmatiser**,
  puis indique la forme commune. Une seule forme peut aussi être renommée manuellement.
- **Concaténations** réunit des formes successives. Écris la suite avec le signe `+`,
  par exemple `prise + en + charge`. Lexico indique le nombre de suites trouvées avant
  de permettre son ajout. Une concaténation ne traverse pas un changement de locuteur.

Les concordances conservent les mots effectivement prononcés, même lorsqu’ils sont affichés
sous une forme regroupée. Les thèmes des mots réunis par une concaténation sont conservés.
Le bouton **Annuler la dernière modification** permet de revenir sur les changements
successifs ; chaque règle peut aussi être retirée séparément.

Dans un corpus en lecture seule, ces traitements restent consultables mais ne peuvent pas
être changés. Les éventuels réglages `.out`, `.lem` et `.cnct` de SonalPi1 sont repris lors
de la migration du corpus, et non depuis cet écran.

## Comprendre le bilan

Le bilan permanent sépare :

- les entretiens qui ont réellement produit un résultat ;
- les occurrences retenues ;
- les formes distinctes ;
- les critères demandés.

**Voir les critères** affiche le détail. Une petite exclusion d’entretiens peut être
résumée par « Tous les entretiens sauf… ». Cette phrase décrit la sélection actuelle ;
elle n’ajoute pas automatiquement les futurs entretiens à une sélection explicite.

Une source ou un matériau de cas indisponible est signalé. L’analyse partielle reste
consultable, mais son export est désactivé. Si les sources changent, utilise
**Actualiser** avant de conclure ou d’exporter.

## Exporter

Les boutons **Exporter CSV** et **Exporter TSV** enregistrent le tableau actuellement
affiché avec la date, les sources, les critères et les paramètres d’affichage. Pour un corpus
local, le dialogue propose par défaut le dossier `resultats/lexico/` du corpus. Pour un corpus
partagé à distance, il propose le dossier Documents de l’ordinateur : les résultats ne sont
pas envoyés automatiquement aux autres utilisateurs.

Les noms
de personnes et le détail des variables privées sont retirés du bilan exporté par défaut.
Les cellules susceptibles d’être interprétées comme des formules par un tableur sont
neutralisées.
