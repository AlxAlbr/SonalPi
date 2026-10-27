# Maquette — découvrir SonalPi avec les corpus exemples

Ouvrir [corpus-exemples-interface.html](corpus-exemples-interface.html) dans un
navigateur. Le fichier fonctionne directement, sans serveur ni dépendance réseau.

Ce fichier reste une **maquette de validation**. Il ne lit ni ne modifie aucun corpus
réel : les emplacements et les progressions sont simulés en mémoire. Un rechargement
remet tout à zéro. Les sauvegardes, les marqueurs et les protections de changement de
corpus sont testés séparément dans l’application.

## Choix représentés

- Le catalogue présente trois parcours, leurs étapes et une action principale.
- **Préparer et suivre** comporte quatre étapes : organiser le suivi, ajouter les
  documents du projet, créer un entretien préparatoire et écrire une note.
- Au premier lancement de chaque parcours, une fenêtre permet de choisir l’emplacement
  où préparer sa démo.
- **Préparer et suivre** reçoit un corpus vierge. **Importer et traiter** reçoit un autre
  corpus vierge avec les fichiers nécessaires aux exercices.
- Chaque parcours conserve sa propre progression et son propre corpus.
- **Recommencer cette démo** remet uniquement le parcours choisi au départ.
- **Retrouver mon dossier…** apparaît seulement si le dossier connu manque.
- Les démos d’apprentissage ne figurent pas dans les Récents. Les explorations libres
  y restent accessibles.

## Parcours à essayer

1. Ouvrir **Parcours pas à pas** et consulter les cartes sans changer le corpus actif.
2. Dans **Préparer et suivre**, cliquer sur **Commencer le parcours** : la fenêtre
   **Préparer la démo « Préparer et suivre »** permet de modifier l’emplacement.
3. Choisir directement **Ajouter les documents du projet** avant la préparation :
   après validation, le guide rejoint cette étape précise.
4. Ouvrir **Importer et traiter**, puis choisir **Prendre des notes à chaud** : la
   préparation rejoint également l’étape demandée.
5. Utiliser la situation **Copie d’apprentissage déjà commencée** : chaque parcours
   retrouve sa progression sans nouvelle installation.
6. Mettre le guide en pause, changer d’espace puis revenir au catalogue.
7. Utiliser **Recommencer cette démo** et vérifier que l’autre parcours conserve ses
   acquis.
8. Essayer les situations **Parcours terminé**, **Dossier déplacé** et **Échec de
   préparation**.
9. Ouvrir librement **Corpus annoté** : aucun guide ne démarre et la copie apparaît
   dans les Récents.
10. Essayer au clavier et dans une fenêtre étroite avec Tab, Entrée et Échap.

## Emplacements simulés

- `Documents/Sonal/Apprentissage/Préparer et suivre` ;
- `Documents/Sonal/Apprentissage/Importer et traiter` ;
- `Documents/Sonal/Exemples/…` pour les explorations libres.

La maquette ne simule pas un rattachement réel depuis un autre profil, les erreurs de
lecture des corpus ni les outils métier. Pour ces cas, utiliser l’application et les
tests décrits dans [l’ouverture des corpus](../../docs/dev/ouverture-corpus.md).

## Vérification automatique

```sh
npx playwright test e2e/maquette-corpus-exemples.e2e.ts --project=local
```

Ces tests ouvrent uniquement le HTML de la maquette ; ils ne lancent ni Electron ni
Docker.
