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

**Explorer les corpus exemples** propose les entretiens déjà importés et le corpus
annoté. L'application crée une nouvelle copie de travail ; elle ne modifie pas ces
modèles fournis. La reprise conserve les modifications sans réinstaller le contenu.
Le parcours **Analyser et interpréter** prépare sa propre copie de `CorpusSynthAnnot`,
distincte de l’exploration libre, pour apprendre Tri et synthèse, Lexico et Analyses croisées.
**Organiser et exporter** prépare une autre copie indépendante de ce même modèle,
pour découvrir les cas, composer un recueil et exporter les entretiens.

Les sources communes proviennent du seul contenu de `CorpusSynth/`, sans niveau
de sous-dossier supplémentaire. Elles sont installées séparément des travaux ;
les anciens emplacements déjà mémorisés restent utilisables. Une restauration ajoute
seulement les fichiers manquants.

Les audios ne sont jamais dupliqués dans les corpus. À l'installation d'une copie
annotée, `src/main/exemples.ts` remplace les références absolues du poste de conversion
par les chemins des sources installées sur le poste utilisateur. Ne pas ouvrir ni
modifier directement le modèle fourni pour travailler : passer par les exemples
ou faire une copie et réassigner les audios si nécessaire.
