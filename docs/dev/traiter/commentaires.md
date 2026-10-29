# Commentaires de passage

Les commentaires sont des annotations d’entretien attachées à une plage du texte.
Ils portent un auteur et un texte libre, sans définition commune au corpus.

## Parcours renderer

- `MenuContexte.vue` propose **Commenter** sur une sélection ou sur la plage d’une
  annotation existante. La sélection est ajustée aux mots par `snapToWord`.
- `EditionCommentaire.vue` sert à la création, à l’édition et à la suppression.
  Le dernier signataire validé est mémorisé dans le profil.
- `useAnnotationsEntretien.ts` modifie le modèle, ajoute une entrée au journal,
  renouvelle les projections puis programme la sauvegarde.
- `commentairesMarge.ts` affiche les cartes par paragraphe et relie leur survol
  à la plage décorée. Les commentaires orphelins restent dans le modèle, mais ne
  sont pas affichés.

Le menu contextuel et la fenêtre d’édition ne doivent pas permettre de modifier
un entretien en lecture seule. Le plugin laisse alors le menu natif disponible ;
les cartes restent consultables sans ouvrir l’édition.

## Modèle et remappage

Une annotation de type `commentaire` utilise les positions ProseMirror `from` et
`to`, avec `auteur` et `texte`. `pluginRemap` déplace ses bornes avec les éditions
du document. Une suppression complète du passage referme la plage ; l’annotation
devient orpheline au lieu d’être effacée silencieusement.

La création, la modification et la suppression ajoutent respectivement au journal
les inverses `retirerAnnotation`, `editerAnnotation` et `reposerAnnotation`. Le
journal est limité à la session de l’entretien.

## Notes et sorties

Les notes stockent seulement les identifiants des commentaires liés. Leur libellé
est reconstruit à l’affichage ; supprimer un commentaire ne supprime pas la note.

Les commentaires sont sérialisés dans `.sonal` et dans l’HTML au moyen des attributs
`data-obs`, `data-auth` et `data-finobs`. Ils sont aussi projetés vers les annotations
QualCoder. Les formats TXT, SRT, VTT, DOCX et PDF ne les rendent pas.

La pseudonymisation du texte ne transforme ni le contenu ni l’auteur des commentaires.
Le rapport les signale pour les formats qui les conservent.

## Vérifications

- `test/commentaires.test.ts` : modèle et inverses du journal.
- `test/commentairesMigration.test.ts` : import et aller-retour `.sonal`.
- `test/exportSonalGolden.test.ts` et `test/exportQualcoder.test.ts` : sorties.
- `e2e/commentaires.e2e.ts` : création, édition, suppression et persistance.
- `e2e/documentation-commentaires.e2e.ts` : parcours du guide, exports et lecture seule.

La [procédure utilisateur](../../user/traiter/commentaires.html) présente les gestes
et les précautions de partage sans exposer le modèle interne.
