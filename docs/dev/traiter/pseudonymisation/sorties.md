# Sorties pseudonymisées

Les sorties ne modifient jamais l’entretien source. Elles construisent une
projection dans laquelle les décisions visibles sont remplacées selon les mêmes
règles dans tous les formats.

## Règle de projection

`projeterPortionsAnon` découpe une plage aux frontières des annotations et choisit
la décision réellement visible sur chaque portion. `projeterSegments` applique la
même décision aux exports structurés.

Pour une décision visible :

| Décision | Résultat pseudonymisé |
|---|---|
| `anonymise` avec pseudo non vide | le passage devient `[pseudo]` |
| `anonymise` sans pseudo | le texte reste en clair |
| `exception` | le texte reste en clair |
| décision incluse masquée | aucun effet tant qu’elle n’est pas visible |

Lorsqu’un passage est découpé par des codages ou des limites de format, un même
pseudo n’est émis qu’une fois par segment logique.

Les annotations, règles et mémoires ne sont pas ajoutées aux formats textuels
comme marqueurs techniques.

## Locuteurs

Un nom de locuteur est remplacé seulement si :

- son pseudo est non vide ;
- `pseudoEtat` n’est pas `refuse` ;
- le pseudo est différent du nom d’origine.

Le rapport tient compte des options du format. Un locuteur absent de la sortie
choisie n’est pas présenté comme un nom effectivement exporté en clair.

## Sorties couvertes

La matrice sentinelle vérifie la même sémantique pour :

- TXT et HTML ;
- SRT et VTT ;
- DOCX et PDF individuels ;
- DOCX et PDF de corpus ;
- `.sonal` pseudonymisé ;
- recueils ;
- synthèse et copie d’extraits ;
- analyses croisées ;
- cas ;
- Lexico.

Les sous-titres SRT/VTT partagent la validation des bornes temporelles dans
`src/shared/export/sousTitres.ts`. Une cue sans bornes valides est exclue du
format et du rapport correspondant.

Le `.sonal` pseudonymisé conserve la structure nécessaire à une réouverture, mais
il est produit depuis une copie transformée. Les mémoires de règles qui ne doivent
pas apparaître dans la sortie pseudonymisée ne sont pas utilisées comme texte de
remplacement.

## Champs volontairement hors projection

La pseudonymisation automatique ne vérifie pas le contenu libre de :

- titre de l’entretien et nom de fichier ;
- notes publiques ;
- commentaires et auteurs ;
- noms de catégories ;
- libellés et modalités des variables ;
- commentaires éditoriaux des recueils ;
- métadonnées ou chemins de média lorsqu’ils sont inclus par le format.

Ces champs restent sous la responsabilité de l’utilisateur. Le texte principal de
l’interface le rappelle sans présenter le rapport comme une garantie d’anonymat.

## Rapport facultatif

`etablirRapportPseudonymisation` travaille sur le contenu réellement demandé par
le format et ses options. Il distingue :

- les occurrences remplacées ;
- les locuteurs dont le pseudo est effectivement utilisé ;
- les décisions sans pseudo conservées en clair ;
- les exceptions conservées en clair ;
- les locuteurs exportés sans pseudo applicable ;
- les champs libres à vérifier manuellement.

Le rapport est consultable avant l’écriture et peut être enregistré séparément.
Il ne bloque pas un export incomplet et indique explicitement qu’il ne constitue
pas une garantie d’anonymat.

## Architecture

| Responsabilité | Code |
|---|---|
| Choix de la décision visible | `src/shared/entretien/anon/projectionTexte.ts` |
| Projection structurée d’un entretien | `src/shared/export/projectionEntretien.ts` |
| Formats TXT, HTML, SRT, VTT et données DOCX | `src/shared/export/formatsTexte.ts` |
| Rapport | `src/shared/export/pseudonymisation.ts` |
| Export individuel | `src/renderer/export/exportEntretien.ts` |
| Export corpus | `src/renderer/export/exportCorpus.ts` |
| Passages partagés | `src/renderer/editor/passages.ts` |
| Lexico | `src/renderer/editor/lexico.ts` |

Recueils, synthèse, analyses croisées et cas passent par les projections de
passages plutôt que de réimplémenter la logique d’anonymisation.

## Garanties testées

`test/pseudonymisationSorties.test.ts` utilise une fixture sentinelle commune et
vérifie pour chaque sortie :

- absence des identités textuelles masquées ;
- absence des décisions internes masquées ;
- absence des identifiants de règle et mémoires locales sentinelles ;
- présence du pseudo visible attendu ;
- conservation des exceptions et décisions sans pseudo ;
- pseudonymisation des locuteurs lorsqu’elle s’applique ;
- immuabilité de l’entrée source.

Les tests plus ciblés restent dans :

- `test/projectionTexteAnon.test.ts` ;
- `test/pseudonymisationProjection.test.ts` ;
- `test/pseudonymisationExport.test.ts` ;
- `test/recueils.test.ts` ;
- `test/synthese.test.ts` ;
- `test/casProjection.test.ts` ;
- `test/lexico.test.ts`.
