# Maquette — découvrir SonalPi avec les corpus exemples

Ouvrir [corpus-exemples-interface.html](corpus-exemples-interface.html) dans un
navigateur. Le fichier fonctionne directement, sans serveur ni dépendance réseau.

Il s'agit du **lot de validation d'interface**, pas de l'intégration à l'application.
Aucun corpus réel n'est lu ou modifié ; les emplacements, copies et progressions
sont simulés en mémoire. Un rechargement remet tout à zéro. Les sauvegardes,
lectures de marqueurs, choix natifs de dossier et protections de changement de
corpus devront être raccordés dans les lots suivants.

## Parcours à essayer

1. **Première découverte** → **Parcours pas à pas** : sélectionner une carte affiche
   son détail, sans créer de copie ni changer de corpus. La préparation reste un
   préalable distinct de la liste des étapes.
2. Choisir **Importer et traiter**, puis cliquer sur **Prendre des notes à chaud** :
   la fenêtre prépare la copie avant d'arriver directement à cette étape.
   Annuler laisse la sélection et le corpus courant intacts.
3. Choisir **Copie d'apprentissage déjà commencée** dans le bandeau de simulation :
   Préparation et Traitement proposent la même copie, avec des progressions distinctes.
   **Continuer** n'affiche plus la fenêtre de préparation.
4. Mettre le guide en pause, changer d'espace puis revenir à l'accueil : la copie
   ne change pas et n'apparaît pas dans les Récents. Revenir aux parcours pour la reprendre.
5. **Explorer les corpus exemples** → **Corpus annoté** : ouvrir une copie libre
   sur Synthèse, sans guide ni calcul automatique. Elle apparaît dans les Récents.
6. **Créer une nouvelle copie…**, puis **Revenir aux parcours** → **Autres copies…** :
   l'ancienne copie et ses acquis restent accessibles. Choisir une autre copie dans
   la liste ne change pas le corpus actif avant la demande explicite de reprise.
7. Les situations **Parcours terminé**, **Dossier d'apprentissage déplacé** et
   **Échec de préparation** permettent d'essayer la revue, la récupération et la
   conservation de la sélection après un échec. Dans ce dernier scénario, le deuxième
   essai réussit.
8. Essayer au clavier et dans une fenêtre étroite : Tab, Entrée/Espace, Échap ;
   la fermeture d'une fenêtre rend le focus à son point d'entrée.

## Propositions à valider

- Deux entrées d'accueil : **Parcours pas à pas** et **Explorer les corpus exemples**.
- Cartes de parcours en haut, préalable et étapes en dessous ; analyse guidée **À venir**.
- Une copie d'apprentissage commune à Préparation et Traitement ; aucune remise à zéro
  lors d'une reprise ou du passage d'un parcours à l'autre.
- Emplacements proposés : `Documents/Sonal/Apprentissage/Préparation et traitement`
  pour les exercices ; `Documents/Sonal/Exemples/…` pour les explorations libres.
  Les sources communes restent distinctes des copies, avec un accès facultatif.
- Copies d'apprentissage retrouvées dans les parcours, pas dans les Récents ;
  copies d'exploration libre accessibles depuis les deux entrées.
- Corpus libres présentés comme **Entretiens déjà importés** et **Corpus annoté** ;
  aucune variante technique à choisir pour commencer un parcours.

La maquette ne simule pas un rattachement réel depuis un autre profil, les erreurs
de lecture des corpus, ni les outils métier. Leur comportement reste à développer
et à tester dans l'application. La validation visuelle par l'utilisateur reste ouverte.

## Vérification automatique

```sh
npx playwright test e2e/maquette-corpus-exemples.e2e.ts --project=local
```

Ces tests ouvrent uniquement le HTML de la maquette ; ils ne lancent ni Electron,
ni Docker et ne remplacent pas les futurs tests d'intégration de l'application.
