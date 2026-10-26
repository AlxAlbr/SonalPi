# Corpus exemples fournis

- `CorpusSynth/` : sources actuelles de la démo, avec quatre transcriptions dans
  `srt/`, leurs audios dans `audio/` et le guide d'entretien dans `docs/`.
  Ce dossier n'est pas un corpus Sonal enregistré : la démo importe ces sources.
- `CorpusSynthAnnot/` : corpus SonalPi2 enregistré pour découvrir l'espace
  **Analyser et interpréter**, avec les quatre entretiens annotés, 30 thèmes,
  trois variables et les notes issues des fichiers `.sonal`.
  Son fichier principal est `corpus.json` ; les entretiens sont dans `entretiens/`
  et les formes d'onde dans `png/`.
  Seule la version SonalPi2 est conservée ; les fichiers SonalPi1 ont été retirés.

La démo actuelle installe uniquement le contenu de `CorpusSynth/` dans le dossier
choisi pour ses sources, sans ajouter de niveau de sous-dossier. Les sources déjà
installées restent à leur emplacement et continuent d'être reconnues.

La variante annotée n'est pas encore proposée dans l'interface des exemples.
Elle peut être ouverte via **Ouvrir un corpus local** en choisissant son dossier ;
travailler sur une copie pour conserver l'exemple initial.

Les audios sont référencés dans `CorpusSynth/audio/`, jamais dupliqués.
Les chemins absolus V2 ont été rattachés à cet emplacement sur le poste de conversion,
à la place des anciens chemins Windows. Ils ne sont pas portables tels quels :
le futur installateur d'exemples devra les réassigner sur chaque copie de travail.
En attendant, sur un autre poste, réassigner les quatre audios avant d'utiliser la lecture.
