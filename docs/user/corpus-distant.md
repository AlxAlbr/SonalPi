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

L’adresse doit utiliser **HTTPS**, car les identifiants WebDAV ne doivent jamais
circuler en clair. HTTP est accepté uniquement pour un serveur de développement
sur `localhost`, `127.0.0.1` ou `::1`.

Le bouton crée le corpus sur le serveur puis **l'ouvre aussitôt** — même
comportement que la création locale. Il réapparaîtra dans vos « Récents » avec
l'icône 🌐.

À savoir :

- Si un corpus existe déjà à cet emplacement, l'app **refuse sans rien écraser** —
  utilisez alors « Ouvrir un corpus distant ».
- Une copie de travail est tenue sur votre poste (invisible, gérée par l'app) ;
  le corpus de référence vit sur le serveur.
- Les opérations réseau ont un délai maximal. Si le serveur cesse de répondre,
  l’application rend la main sans supprimer les modifications locales non publiées.

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

## GitLab : préparer et créer un corpus

Dans « ☁️ Nouveau corpus distant », l’onglet GitLab suppose qu’un **projet GitLab
existe déjà**. Sonal ne crée pas de projet GitLab et ne demande pas son identifiant
numérique. Vous saisissez directement l’adresse du projet ; l’instance et le nom du
projet en sont déduits.

### Préparer le projet

1. Créez ou faites créer un projet GitLab privé pour le corpus. Initialisez le dépôt,
   par exemple en ajoutant un README dans GitLab, pour disposer d'une branche par défaut.
2. Vérifiez que votre compte et votre jeton peuvent lire le projet et écrire dans la
   branche par défaut. Si la branche est protégée, autorisez les développeurs à y pousser.
3. Utilisez un jeton d’accès personnel GitLab adapté à votre instance. Dans Humanum,
   il peut être créé après une connexion avec HumanID. Pour une autre instance,
   suivez la procédure de votre administrateur GitLab.

Sonal ne crée aucun projet pendant cette étape. Il vérifie l’URL et les accès,
puis utilise automatiquement la branche par défaut du projet, à la création comme
à l'ouverture. Il n'y a pas de branche à choisir. Si le dépôt est vide ou archivé,
un message explique pourquoi il ne peut pas être utilisé.

### Créer le corpus Sonal

Dans « ☁️ Nouveau corpus distant » :

1. saisissez l’adresse du projet GitLab, par exemple
   `https://gitlab.exemple.org/mon-groupe/mon-corpus` ;
2. renseignez votre jeton d’accès personnel ;
3. cliquez sur « Charger le projet » ;
4. vérifiez le projet chargé (sa branche par défaut est affichée à titre informatif) ;
5. indiquez la racine du corpus si elle n’est pas à la racine du dépôt ;
6. donnez un nom au corpus Sonal ;
7. cliquez sur « Créer le corpus et l’ouvrir ».

La création ajoute le squelette du corpus dans le projet sélectionné. Le projet GitLab
et son historique ne sont pas supprimés. Si le projet contient déjà un corpus, utilisez
« Ouvrir un corpus distant » plutôt que la création.

Le jeton n’est jamais renvoyé au renderer, affiché dans l’interface ou inscrit dans
les logs et messages d’erreur. Il est conservé dans le coffre chiffré du poste
lorsqu’il est disponible, sinon seulement en mémoire.

Pour le premier parcours des transcriptions, Git LFS n’est pas nécessaire. Les médias
partagés GitLab et les Docs cadre ne sont pas encore pris en charge. Les corpus
Nextcloud conservent leur fonctionnement éditable actuel.

## Au quotidien

- Vos corpus d'équipe portent l'icône 🌐 dans « Récents » : un clic les rouvre.
- Les règles de travail à plusieurs (un éditeur à la fois, badges 🔒/👁,
  publication, reprise après crash) sont décrites dans
  [multi-utilisateur.md](multi-utilisateur.md).
- Un corpus distant n'enferme en rien : rien n'empêche de continuer à consulter
  une copie hors ligne, et la connexion peut être oubliée (« ✕ » sur le compte)
  sans jamais effacer quoi que ce soit au serveur.
