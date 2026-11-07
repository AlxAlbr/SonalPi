# Passer de SonalPi1 à SonalPi2

Deux parcours sont disponibles : ouvrir un CRP local, ou migrer depuis GitLab.
Dans les deux cas, la destination est un nouveau corpus ; le format V1 n'est pas
converti sur place. Le fichier d'ouverture natif V2 s'appelle toujours `corpus.crp`.
Le dossier complet et les médias nécessaires restent indispensables.

## Corpus local

1. Depuis l'Accueil, cliquez sur **« Ouvrir un corpus local »** et choisissez le
   fichier `.crp` SonalPi1. Une demande d'ouverture du système utilise le même
   parcours. La V1 est reconnue automatiquement, sans redemander le fichier.
2. La fenêtre **« Passer à SonalPi2 »** propose un nom prérempli avec le nom du
   fichier sans extension, et un dossier libre. Vous pouvez modifier ce nom ou
   changer l'emplacement ; aucun second nom de fichier n'est demandé.
3. Fermez les applications utilisant la V1 et cliquez sur **« Passer à SonalPi2 »**.
   Le nouveau corpus est préparé et vérifié avant de remplacer le corpus courant.
   Il s'ouvre directement et rejoint les récents, sans bilan de réussites à valider.

La destination doit être neuve ou vide et située hors du dossier V1. Aucun dossier
non vide n'est fusionné ou écrasé.

### Entretiens, médias et autres documents

- Les entretiens sont convertis sous `entretiens/` avec leurs contenus pris en charge :
  texte, codages, anonymisation, locuteurs, valeurs, notes et commentaires.
  Les définitions du CRP font foi pour les thèmes et variables.
- Les médias réellement situés dans le dossier V1 sont **copiés** dans `medias/`.
  La V2 utilise ces copies, pas les fichiers du dossier sauvegardé.
- Les médias externes **restent référencés à leur emplacement actuel**, sans copie
  supplémentaire. Ils restent nécessaires aux deux versions : ne les supprimez pas.
- Les annexes `.out`, `.lem` et `.cnct` portant le nom du corpus fournissent les
  réglages Lexico reconnus. Les anciens résultats `.lexaf.json`, documents et autres
  fichiers admissibles non convertis sont conservés dans `Autres/`, octet pour octet.
  Ils ne deviennent pas automatiquement des analyses natives.
- Les fichiers techniques, accès connus, autres corpus identifiables et noms non
  portables sont écartés de cette copie documentaire. Le contenu des documents
  n'est pas analysé pour détecter tous les secrets : conservez l'ensemble V1.

Un entretien ou un média **référencé mais manquant ou illisible bloque le passage**.
Le message indique les sources à corriger avant de réessayer. Un entretien sans
média déclaré est autorisé ; une transcription référencée absente n'est pas remplacée
silencieusement par un entretien vide.

La V2 ne dépend plus du dossier V1 pour ses fichiers de travail, mais elle peut
encore dépendre de médias externes. Elle n'est pas une archive autonome : déplacer
le seul `corpus.crp` ne déplace pas le corpus, et déplacer le dossier peut casser
les références absolues des médias.

### Annuler et conserver la sauvegarde V1

**« Annuler »** reste disponible pendant la préparation et les copies. L'application
attend l'arrêt des écritures puis nettoie sa préparation ; le corpus courant et
les sources sont conservés. La courte bascule finale n'est plus annulable.
Un échec de préparation n'active pas un corpus partiel. Un nettoyage impossible
indique le dossier à vérifier et n'empêche pas une nouvelle tentative.

Après ouverture réussie de la V2, seul le fichier d'ouverture V1 est renommé :

```text
MonEnquete.crp → MonEnquete.crp.sauvegarde-v1
```

Son contenu est inchangé. Le dossier, les `.Sonal` et les médias originaux ne sont
ni déplacés ni supprimés. Pour revenir à SonalPi1, rendez au CRP son nom initial
et conservez les sources à leurs anciens emplacements. Le seul CRP n'est pas une
sauvegarde complète ; les sources et médias originaux restent nécessaires.

Si le renommage est impossible, notamment si une sauvegarde de ce nom existe déjà,
la V2 reste ouverte et utilisable. Un avertissement signale que le CRP V1 reste
ouvrable à son emplacement d'origine. Aucune sauvegarde existante n'est écrasée.

## GitLab : migrer vers un nouveau dépôt

Depuis la rubrique **« Migration SonalPi1 vers SonalPi2 »**, la carte **GitLab**
conserve son parcours dédié. Ouvrir un CRP local ne récupère pas un dépôt GitLab.
La migration GitLab ne renomme ni ne modifie le CRP du dépôt source.

1. Choisissez un projet enregistré ou indiquez l'adresse d'un projet SonalPi1.
   Les accès utilisables sont réemployés ; une connexion n'est demandée que si
   nécessaire. Un corpus déjà V2 n'est pas reconverti sur place.
2. S'il existe plusieurs CRP, choisissez celui à reprendre.
3. Indiquez un autre projet de la même instance, accessible au même compte.
   Il doit être vide ou limité aux fichiers techniques admis, comme un README
   ou une licence. L'application peut préparer un dépôt entièrement vide.
4. Choisissez où copier les médias : le nouveau dépôt GitLab ou une base externe
   Nextcloud/WebDAV. Les originaux sont conservés.
5. Vérifiez le bilan, les destinations et les éventuels éléments non repris.
   Les listes restent disponibles sous **« Voir les détails »**.
6. Cliquez sur **« Copier les médias et créer le corpus »**, puis confirmez.

Les transcriptions et annexes sont lues à un même état du dépôt. Les documents
supplémentaires admissibles rejoignent `Autres/` du nouveau dépôt, même si les
médias vont sur WebDAV. Les liens ou sous-modules non pris en charge peuvent être
refusés. Aucun fichier existant différent n'est remplacé.

Avant confirmation, rien n'est copié ou publié vers les destinations. Après une
interruption, rouvrez cette carte et choisissez **« Vérifier et reprendre »** sur
le même poste et le même profil. Les copies déjà acquises sont conservées ; une
reprise ne supprime pas les originaux. Si un délai est demandé après un arrêt
brutal, patientez plutôt que de recommencer vers une nouvelle destination.

Un profil neuf doit disposer des accès GitLab et, le cas échéant, de ses propres
accès à la base média externe. Les vidéos sont copiées dans les deux parcours,
mais leur lecture depuis une base externe reste indisponible. Pour les lire dans
l'application, choisissez GitLab et un format pris en charge par le lecteur.

## Repères communs

Les CRP V1 sans version ou de version `1.0` restent reconnus, avec décodage UTF-8
ou Windows-1252. Les identités des thèmes et variables sont conservées autant que
nécessaire pour leurs références ; les entretiens reçoivent des identifiants V2.
La provenance `meta.sourceV1` n'est pas un registre de reprise.

Une autre demande d'ouverture pendant une opération est refusée, pas mise en
attente. Réessayez après sa fin ou son annulation. Renommer ensuite le projet
avec **« Renommer le corpus »** change le libellé partagé, pas les chemins ni les URL.

Les autres corpus distants V1, hors GitLab, et la conversion du contenu des archives
ZIP ne sont pas pris en charge par ces parcours.
