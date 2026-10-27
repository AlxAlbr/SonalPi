# Notes dans un entretien

Le panneau Notes travaille sur les notes de l’entretien ouvert. Les mutations
passent par `useNotesEntretien.ts`, qui demande ensuite la sauvegarde de
l’entretien ; le composant n’écrit aucun fichier lui-même.

## Créer, modifier et ordonner

Une création prépare un brouillon avec la catégorie par défaut du corpus, la
date du jour, le statut privé et un rang après la dernière note. La validation
nettoie le corps, retire les espaces périphériques du titre et ne conserve que
les identifiants de locuteurs encore présents dans l’entretien.

L’annulation du brouillon ne modifie pas la note enregistrée. Les saisies
directes de titre ou de corps dans la feuille, elles, planifient une sauvegarde
lorsque le contenu change. Une modification renseigne `modifieLe` sans remplacer
`creeLe`.

L’ordre de référence est `rang`, et non la date. Un réordonnancement ou une
suppression recalcule des rangs denses. Cet ordre propre à l’entretien est
indépendant du tri choisi dans la vue corpus.

## Corps HTML restreint

Le corps n’est pas du HTML libre :

- le texte est échappé ;
- `<mark>` désigne un passage important ;
- `<em>` désigne un passage lié à un commentaire ;
- les attributs de liaison autorisés conservent les références aux commentaires ;
- le formatage étranger est aplati, sans reprendre ses styles ou scripts.

Le nettoyage vit dans `src/renderer/notes/sanitiser.ts`, car il utilise le DOM et
les zones `contenteditable`. Les fonctions de normalisation du domaine restent
pures et ne doivent pas essayer de reproduire ce traitement avec un parseur
HTML improvisé.

Les petits libellés de commentaire ajoutés au rendu sont temporaires : ils sont
reconstruits depuis les annotations et retirés lors de la sauvegarde. Un contenu
issu d’un fichier est également nettoyé avant son affichage.

## Lier un passage à des commentaires

Une sélection de la note peut être liée à un ou plusieurs commentaires de
l’entretien. Le passage porte leurs identifiants dans `data-liens`, séparés par
des espaces. Le menu permet de modifier les liens et de rejoindre le commentaire
dans la transcription.

Les commentaires proposés pour une nouvelle liaison sont les annotations de
type `commentaire` non orphelines. La navigation résout à nouveau l’annotation,
sélectionne sa plage et la signale dans l’éditeur. Elle ne repose pas sur une
position copiée dans la note.

Une référence devenue introuvable ne doit pas être interprétée comme un
commentaire d’un autre entretien. L’inventaire corpus ignore ces références
pour la résolution des libellés et des temps audio.

## Désigner les locuteurs concernés

`locuteurIds` contient les identifiants opaques `Locuteur.id`, pas les index
numériques utilisés par les paragraphes. Une note peut viser plusieurs
locuteurs, sans dupliquer son corps.

Supprimer un locuteur retire son identifiant des notes de l’entretien. Délier
un locuteur d’une personne ne supprime aucune note : seule leur agrégation dans
la fiche de personne change.

## Lecture seule et tests

L’édition suit les droits de l’entretien ouvert. En distant, elle relève de sa
session d’édition et de sa publication, non de la commande d’édition des notes
depuis le corpus, qui reste indisponible.

| Tests | Couverture principale |
|---|---|
| `test/notes.test.ts` | Normalisation, rangs, nettoyage et références de commentaires. |
| `e2e/notes-feuille.e2e.ts` | Saisie et affichage dans la feuille. |
| `e2e/notes-navigation.e2e.ts` | Navigation entre notes et transcription. |
