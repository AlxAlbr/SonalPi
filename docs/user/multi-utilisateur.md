# Travailler à plusieurs sur un corpus distant

Ce guide décrit le fonctionnement multi-utilisateur de SonalPiTestV2 quand un corpus est ouvert
en **distant** (serveur Nextcloud/WebDAV). Pour CRÉER un corpus directement sur le serveur et
le partager à l'équipe, voir [corpus-distant.md](corpus-distant.md). Il complète [la migration V1](migration-v1.md).

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

## Résumé des bonnes pratiques

1. Fermez vos entretiens quand vous cessez d'y travailler (le verrou suit).
2. Un badge 🔒 n'est pas un blocage hostile : c'est l'assurance que personne n'écrase personne.
3. Ne modifiez pas les fichiers du corpus via l'interface web du serveur — c'est le seul
   scénario qui déclenche une divergence.
