# Travailler à plusieurs : créer et partager un corpus distant

Ce guide explique comment démarrer un corpus **directement sur votre serveur
Nextcloud** quand vous savez d'emblée que vous serez plusieurs à travailler dessus.
Pour le quotidien du travail en équipe (verrous, badges, divergences, crash),
voir [multi-utilisateur.md](multi-utilisateur.md).

## Créer le corpus (« ☁️ Nouveau corpus distant »)

Depuis l'accueil, carte « ☁️ Nouveau corpus distant » (rubrique *En équipe*) :

1. **Emplacement sur le serveur** : l'adresse du futur dossier, par ex.
   `https://nuage.exemple.org/remote.php/dav/files/moi/MonProjet`.
   L'app affiche l'emplacement résolu avant de créer — vérifiez-le.
2. Votre **login** et un **mot de passe d'application** Nextcloud
   (Paramètres → Sécurité → « Créer un nouveau mot de passe d'app » — jamais votre
   mot de passe principal).
3. Le **nom du projet**.

Le bouton crée le corpus sur le serveur puis **l'ouvre aussitôt** — même
comportement que la création locale. Il réapparaîtra dans vos « Récents » avec
l'icône 🌐.

À savoir :

- Si un corpus existe déjà à cet emplacement, l'app **refuse sans rien écraser** —
  utilisez alors « Ouvrir un corpus distant ».
- Une copie de travail est tenue sur votre poste (invisible, gérée par l'app) ;
  le corpus de référence vit sur le serveur.

## ⚠️ L'étape indispensable : partager le dossier

Le corpus créé est pour l'instant **visible de vous seul**. Pour que vos collègues
puissent l'ouvrir, vous devez **partager le dossier avec eux depuis Nextcloud** :

1. Connectez-vous à l'interface web de votre serveur Nextcloud.
2. Trouvez le dossier du corpus et partagez-le (menu « Partager ») avec le compte
   de chaque collègue — en leur donnant le droit **Modifier**.

Chaque collègue ouvre ensuite le corpus chez lui via « ☁️ Ouvrir un corpus distant » :
il se connecte avec SES identifiants à SON adresse du dossier (Nextcloud présente
le dossier partagé à un emplacement propre à chacun ; c'est normal, et l'app
mémorise l'adresse de chaque compte).

## Au quotidien

- Vos corpus d'équipe portent l'icône 🌐 dans « Récents » : un clic les rouvre.
- Les règles de travail à plusieurs (un éditeur à la fois, badges 🔒/👁,
  publication, reprise après crash) sont décrites dans
  [multi-utilisateur.md](multi-utilisateur.md).
- Un corpus distant n'enferme en rien : rien n'empêche de continuer à consulter
  une copie hors ligne, et la connexion peut être oubliée (« ✕ » sur le compte)
  sans jamais effacer quoi que ce soit au serveur.
