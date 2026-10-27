# Synthèse — repères développeur

**Tri et synthèse** extrait les passages qui répondent à des critères analytiques.
La vue d’ensemble et la liste d’extraits présentent **la même collection**.
Résultat, critères et sélection restent en mémoire : calculer une synthèse ne
modifie ni `corpus.json` ni les entretiens.

## Ce que calcule le moteur

Le moteur reçoit des plages thématiques, des tours de parole et les matériaux
projetés des cas. Il travaille sur les positions ProseMirror, pas sur le texte
affiché après pseudonymisation.

- Sans thème ni cas sélectionné, le résultat est vide.
- Les choix d’une même dimension se combinent par OU et les dimensions par ET.
  Pour les thèmes, l’option `tous-au-meme-endroit` exige au contraire leur
  présence simultanée sur le passage.
- Les variables d’entretien filtrent la source entière ; celles de locuteur
  s’évaluent sur le locuteur du tour, pas sur une autre personne de l’entretien.
- Les plages sont découpées aux bornes utiles puis réunies selon leur continuité
  thématique ou de cas, sans franchir une frontière de locuteur.
- Une sélection explicite vide ne signifie jamais « sans restriction ».

Chaque extrait conserve sa source, ses bornes et les identifiants des annotations
contributrices. Le volume est une longueur source (`to - from`), pas une durée
audio ni la longueur du texte pseudonymisé.

## Du corpus à l’écran

`useSourcesAnalyseCorpus` partage les lectures préparées avec les analyses
croisées, avec au plus quatre sources chargées en parallèle. L’entretien ouvert
vient de l’état en mémoire ; les autres passent par la lecture sans verrou.
En distant, cela ne force pas une publication ni une relecture directe du serveur.

`useSyntheseCorpus` projette les cas puis appelle le moteur pur. Il conserve
les sources du calcul et ses diagnostics. Le renderer produit ensuite texte,
contexte et libellés de locuteurs dans le mode demandé : pseudonymisé par défaut,
ou original sur choix explicite. Changer ce mode ne change ni les bornes ni les
identifiants des extraits.

## Fraîcheur, erreurs et export

Les changements de sources, définitions ou critères rendent le résultat périmé.
Le précédent reste visible, mais la navigation vers ses positions et l’export
sont bloqués jusqu’au recalcul. Les générations de calcul écartent les réponses
tardives après réinitialisation ; un changement de corpus efface la session.

Une source illisible, une valeur invalide ou un matériau de cas indisponible
produit un diagnostic. Le résultat partiel reste consultable, **sans export**.
Il ne doit pas être présenté comme un résultat vide fiable.

L’export TXT reprend les extraits dans le mode de texte courant : choisir
« original » peut donc exporter des identités. Les titres et autres libellés
libres ne deviennent pas anonymes par la seule pseudonymisation des passages.
La destination proposée est `resultats/synthese/` en local, ou Documents sur le
poste pour un corpus distant ; rien n’est publié automatiquement sur le serveur.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Contrats, intersections et continuité | `src/shared/synthese/types.ts`, `moteur.ts` |
| Préparation et projection des passages | `src/renderer/editor/synthese.ts` |
| Chargement partagé | `src/renderer/composables/corpus/useSourcesAnalyseCorpus.ts` |
| Calcul, diagnostics et état périmé | `src/renderer/composables/corpus/useSyntheseCorpus.ts` |
| Critères et deux représentations | `src/renderer/components/analyser/synthese/` |
| Export TXT et destination | `src/shared/synthese/export.ts`, `src/main/index.ts` |

Tests : `test/synthese.test.ts` et `e2e/synthese.e2e.ts`.
Voir aussi les [analyses croisées](analyses-croisees.md) et les
[cas](../organiser/cas.md), dont les matériaux peuvent restreindre la synthèse.
