# Travailler à plusieurs sur un corpus distant

Ce guide décrit le fonctionnement multi-utilisateur de SonalPi2 quand un corpus est ouvert
en **distant** (serveur Nextcloud/WebDAV, ou projet GitLab). Pour CRÉER un corpus directement sur le serveur et
le partager à l'équipe, voir [corpus-distant.md](corpus-distant.md). Il complète [la migration SonalPi1](migration-v1.md).

## Ce que chaque fournisseur sait faire

Les deux fournisseurs distant ne proposent pas les mêmes gestes : ce que l'un sait
garder cohérent, l'autre non. L'interface grise ce qui n'est pas possible, et le
refus porte toujours un nom — l'absence d'un bouton n'est jamais la seule protection.

| Geste | Nextcloud | GitLab |
|---|---|---|
| Thèmes, variables et modalités, catégories de note, tableau de bord, pseudonymisation | oui | oui |
| Recueils, cas, familles et attributs | oui | oui, sauf ce qui référence un passage d'entretien ou une recette |
| Renommer un entretien, le trier par ordre d'ajout ou alphabétiquement | oui | oui |
| Tri par dernière modification ou par longueur | oui | non |
| Suppression d'un thème, d'une variable, d'une modalité, d'une catégorie de note, d'une règle | oui | non (ils comptent leurs usages dans les entretiens) |
| Supprimer un entretien | oui | non |
| Créer ou importer un entretien, l'éditer sous session | oui | oui |
| L'audio ou le SRT d'un entretien fermé, les valeurs dans la table de données | oui | non |
| Notes du corpus, corrections de personnes, annulation d'une action du journal | non | non |
| Médias partagés, Docs cadre | oui | non |

Une commande refusée par le fournisseur le dit explicitement, même appelée
directement : une interface grisée n'est pas la garde.

Chaque modification des définitions part dans un **commit unique** qui porte le
fichier du corpus, la nouvelle version et le droit de modification. Deux collègues
peuvent donc ajouter chacun un thème en même temps sans jamais s'écraser. Une
commande qui ne change rien n'écrit pas de commit.

## Le principe en trois phrases

- Le serveur garde les fichiers du corpus ; votre poste en garde une **copie de travail** (le
  miroir) mise à jour automatiquement.
- Pour modifier un entretien, il faut en tenir le **verrou** : une seule personne édite à la
  fois, les autres voient « 🔒 tenu par X » et ouvrent en lecture seule.
- Les définitions (thèmes, variables, règles d'anonymisation) se modifient par **transactions
  courtes** qui ne s'écrasent jamais — deux collègues peuvent ajouter chacun leur thème en même
  temps.

## Les badges que vous verrez

| Badge | Signification | Ce que vous pouvez faire |
|---|---|---|
| 🔒 Max (carte ou ligne de tableau) | Max tient le verrou de l'entretien | l'ouvrir en lecture seule ; le verrou se libère quand il ferme |
| 👁 Olivier | Olivier **consulte** cet entretien sans forcément l'éditer | rien à faire — purement informatif |
| « publié à HH:MM » / « ● non publiées » | état de VOS modifications dans l'entretien ouvert | « Publier maintenant » pour forcer l'envoi |

Ces indicateurs viennent du serveur, jamais d'une supposition.

Si l'app n'a **pas** pu savoir qui tient quoi (serveur injoignable, droits
insuffisants, coupure pendant l'actualisation), la barre de synchronisation
affiche « 🔒 détenteurs : indisponible » : cette fois, l'absence de 🔒 ne veut
rien dire. Vous pouvez toujours ouvrir un entretien — c'est le serveur, à ce
moment-là, qui vérifiera si vous êtes le second. Le message disparaît dès
qu'une actualisation réussit.

## Si le serveur refuse votre publication (« divergence »)

C'est rare : cela arrive si quelqu'un a modifié le fichier **en contournant l'application**
(édition via l'interface web du serveur). Rien n'est perdu :

- votre travail a été mis de côté localement ;
- en rouvrant l'entretien, l'application propose de **fusionner** votre contribution (codes,
  annotations, valeurs…) avec la version actuelle — automatiquement si le texte n'a pas changé
  des deux côtés ;
- sinon, vous choisissez : garder de côté (« Plus tard ») ou jeter la copie. Le texte lui-même
  n'est jamais fusionné automatiquement.

## Après un crash ou une fermeture brutale

À la réouverture du corpus distant, l'application détecte les verrous restés coincés par VOTRE
machine et propose : **Reprendre et publier** (votre dernière version part sur le serveur puis
le verrou se libère) ou **Abandonner** (libérer sans publier).

Si une modification des définitions a été envoyée au serveur sans que la réponse
ne revienne, l'application ne la rejoue pas et ne l'annule pas non plus : elle
vous le signale, et **toute nouvelle modification des définitions, création ou
import est refusé** jusqu'à ce que la réouverture du corpus ait réconcilié
l'opération. Une actualisation suffit généralement ; en cas de coupure pendant
l'installation locale, elle se termine toute seule.

## Être hors ligne

Sans connexion, l'édition des entretiens déjà sous votre verrou continue normalement ; les
définitions (thèmes, variables…) attendent le retour du réseau — l'application l'indique
clairement plutôt que de différer en silence.

## L'audio en corpus distant

Par conception, **les fichiers audio ne transitent pas par le serveur** : chaque poste a les
siens (clé USB, dossier partagé… au choix de l'équipe), référencés sans copie. Si un entretien
référence un audio absent de votre machine, le lecteur affiche un message net et propose
« **Associer l'audio local…** » : désignez votre copie du fichier, elle est mémorisée pour ce
poste uniquement, la forme d'onde se régénère, tout redevient identique aux autres postes.
Déplacer ensuite ce fichier cassera la référence (il faudra ré-associer).

## Remplir les valeurs sans ouvrir l'entretien (table de données)

Dans l’onglet **Données** du corpus, trois gestes permettent d'écrire des valeurs même quand
aucun entretien n'est ouvert chez vous :

- **« Par cellule » (saisie directe)** : chaque cellule d'une ligne libre est éditable
  directement dans la grille. Clavier type tableur : **Entrée** valide et descend la colonne
  (en sautant les lignes sans cellule et celles verrouillées — c'est le remplissage de
  colonne), **Shift+Entrée** remonte, **Tab / Shift+Tab** vont à droite/gauche, **Échap**
  annule la saisie en cours. Un entretien verrouillé par un collègue voit SA ligne grisée.
  Si le verrou arrive entre-temps (ou divergence réseau), LA cellule passe en bord rouge avec
  la raison nominative au survol (« ouvert par max… ») — jamais de blocage du reste de la
  saisie. Corpus local comme distant.
- **« Saisir… » (bouton de ligne, corpus distant)** : ouvre CET entretien directement sur son
  onglet Donnée. Le verrou ordinaire s'applique — entretien libre, vous pouvez saisir ;
  entretien déjà ouvert par un collègue, il s'ouvre en lecture seule avec son bandeau
  nominatif. La valeur part sur le serveur à la fermeture de l'entretien. En corpus **local**,
  le bouton n'apparaît pas : la grille y est directement éditable, le détour par l'entretien
  n'a pas d'intérêt.
- **« ⇊ » (bouton de colonne, variables d'entretien)** : « modifier en lot ». Vous choisissez
  UNE valeur et elle est appliquée à tous les entretiens non ouverts, l'un après l'autre,
  avec un verrou bref par entretien (quelques millisecondes). Un entretien ouvert entre-temps
  par quelqu'un d'autre est **refusé nommément** dans le récapitulatif (« Entretien partagé —
  ouvert par max… ») sans bloquer les autres. Les badges 🔒/👁 affichés dans la modale sont
  indicatifs : la décision a lieu au moment où le lot s'exécute. Une case « Seulement les
  entretiens **sans valeur** » permet de ne cibler que les cases vides : les exclus restent
  listés grisés avec leur raison (« verrou tenu par max », « valeur déjà présente »).

En lot, la portée **locuteur** n'est pas proposée : les locuteurs diffèrent d'un entretien à
l'autre — utilisez le bouton de ligne pour ces cas. Si une divergence survient pendant un lot
(rare), l'entretien concerné apparaît dans les refus : rien n'a été écrasé, relancez le lot.

## Résumé des bonnes pratiques

1. Fermez vos entretiens quand vous cessez d'y travailler (le verrou suit).
2. Un badge 🔒 n'est pas un blocage hostile : c'est l'assurance que personne n'écrase personne.
3. Ne modifiez pas les fichiers du corpus via l'interface web du serveur — c'est le seul
   scénario qui déclenche une divergence.
