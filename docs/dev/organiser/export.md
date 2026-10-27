# Exports — repères développeur

Un export est une **photographie destinée à être lue ou échangée**, pas une
sauvegarde des données natives. Il ne sauvegarde pas implicitement l’entretien
ouvert et ne publie rien sur le serveur. Il reste possible en lecture seule.

## Distinguer les parcours

| Parcours | Sortie et périmètre |
|---|---|
| Entretien ouvert | `.sonal`, TXT, SRT, VTT, HTML, DOCX ou PDF selon les options du format. |
| Corpus, mode lecture | Entretiens choisis : TXT/HTML par entretien, DOCX/PDF combinés, index du lot et copie facultative des médias pour l’HTML. |
| Corpus, mode QualCoder | Projet natif : dossier `.qda` contenant `data.qda`, avec sources textuelles, codages, commentaires, cas et attributs pris en charge. |
| Recueil | Markdown/TXT depuis sa projection ; voir [recueils.md](recueils.md). |
| Résultats d’analyse | Exports propres à [Synthèse](../analyser/synthese.md), [Lexico](../analyser/lexico.md) et aux [analyses croisées](../analyser/analyses-croisees.md). |

L’archive ZIP du corpus est un autre service (`src/main/archiveCorpus.ts`) :
elle conserve les fichiers natifs, contrairement aux formats de lecture.
Le `.sonal` est un format d’échange SonalPi1, pas une copie complète du corpus
SonalPi2 avec tous ses objets.

## Circuit des données

```text
Sources → instantané d’entretien + définitions corpus
        → projection commune → générateur du format → écriture par le main
```

L’entretien ouvert fournit son état **en mémoire**, y compris les modifications
non enregistrées. Les autres sont lus dans les fichiers natifs par le main,
sans verrou d’écriture. Le nom `instantaneDistant` signifie ici « entretien non
ouvert », pas nécessairement serveur distant : sur un corpus partagé, la lecture
peut venir du miroir. Ce n’est pas une photographie globale sous verrou de tous
les fichiers à un instant unique.

Les générateurs consomment l’instantané, sans relire les fichiers. Les options
réellement applicables passent par `optionsEfficaces` ; ne pas supposer qu’une
case cochée a le même sens dans tous les formats. SRT/VTT dépendent notamment
des ancres temporelles, tandis que DOCX/PDF utilisent le document de rendu commun.

Le lot de lecture avance séquentiellement. Une erreur d’entretien est rapportée
sans interrompre les suivants ; demander l’arrêt laisse finir l’entretien courant.
Ce n’est pas une transaction globale avec annulation des fichiers déjà produits.
La destination est choisie une fois et conservée dans une session d’écriture du
main ; noms, collisions et écritures atomiques sont traités séparément de la
projection. La session est libérée en fin de lot, succès comme échec.

## Confidentialité : ne pas confondre les formats

- Les formats de lecture appliquent les décisions de pseudonymisation si
  l’option est active. Leurs notes sont limitées aux notes publiques et leurs
  variables aux variables non privées. Ces protections ne constituent pas un
  droit d’accès ni une garantie d’anonymat des autres champs libres.
- Le rapport de pseudonymisation est un contrôle des remplacements configurés,
  pas un détecteur exhaustif d’identités. Il se prépare et s’enregistre séparément.
  Il peut contenir des informations sensibles ; changer les réglages invalide
  son aperçu, et quitter le panneau oblige à le préparer de nouveau.
- Copier un média pour l’HTML copie **l’enregistrement original**, sans
  pseudonymisation de la voix ou de son contenu. Ne pas assimiler texte
  pseudonymisé et média diffusable.
- Le projet **QualCoder exporte actuellement le texte original sans
  pseudonymisation**, indépendamment des options du mode lecture. Les attributs
  privés sont écartés, mais transcriptions, commentaires, auteurs, noms et mémos
  de cas peuvent identifier des personnes.

## Cas et transfert vers d’autres CAQDAS

Les [cas](cas.md) préparent le transfert des unités d’étude, de leurs matériaux
et de leurs attributs vers un autre logiciel d’analyse qualitative. Ils permettent
de transmettre une organisation analytique, pas seulement des transcriptions
et des codages. Chaque exporteur doit expliciter ce que le modèle cible conserve,
transforme ou ne sait pas représenter. QualCoder est la cible actuellement prise
en charge ; les autres CAQDAS ne disposent pas pour autant d’un export dédié.

## Particularités de QualCoder

La projection construit le texte final et la correspondance de ses positions :
les offsets ProseMirror ne sont pas directement utilisables dans QualCoder.
Toute évolution doit vérifier les textes sélectionnés, Unicode et sauts de ligne
contre les bornes exportées, pas seulement l’ouverture de la base SQLite.

Les matériaux des cas sont résolus sur les sources sélectionnées pour l’export ;
leurs règles deviennent des résultats, sans conserver leur dynamisme. Une
sélection partielle de sources ne certifie donc pas l’exhaustivité d’un cas ou
de ses attributs dérivés. Les recettes et leurs diagnostics ne doivent pas être
remplacés par une ancienne valeur supposée valide.

L’écriture exige une destination vide, prépare le projet dans un dossier
temporaire puis le renomme. Ce parcours est textuel : audio et REFI-QDA ne sont
pas pris en charge. Il ne faut pas le présenter comme une conservation sans
perte de tous les objets natifs de SonalPi.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Formats, options et instantanés | `src/shared/export/types.ts` |
| Projection et formats de lecture | `src/shared/export/projectionEntretien.ts`, `formatsTexte.ts`, `documentExport.ts` |
| Services d’entretien et de lot | `src/renderer/export/exportEntretien.ts`, `src/renderer/export/exportCorpus.ts` |
| Assemblage QualCoder et positions | `src/renderer/export/exportQualcoder.ts`, `src/shared/export/qualcoder/projection.ts` |
| Écriture, PDF/DOCX et projet SQLite | `src/main/exportEntretien.ts`, `src/main/exportCorpus.ts`, `src/main/exportQualcoder.ts` |
| Connexion aux données courantes | `src/renderer/composables/corpus/useOperationsCorpus.ts` |
| Panneau corpus | `src/renderer/components/organiser/export/ExportCorpus.vue` |

Tests : `test/exportEntretienService.test.ts`, `test/exportCorpusService.test.ts`,
`test/exportFormats.test.ts`, `test/pseudonymisationExport.test.ts`,
`test/exportQualcoderModele.test.ts`, `test/exportQualcoder.test.ts` et
`e2e/export-corpus.e2e.ts`. Pour les règles de projection sensible, voir aussi
[les sorties de pseudonymisation](../traiter/pseudonymisation/sorties.md).
