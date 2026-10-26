# Analyses croisées — matrice Thèmes × Matériaux

Statut : proposition de réalisation.

> **Mise à jour — espace de travail.** Les Analyses croisées vivent désormais dans
> l’espace **Analyser et interpréter**, à côté de Synthèse et de Lexico : la
> sélection occupe la colonne de gauche et la matrice la colonne de droite.
> Les mentions de « fenêtre » ci-dessous décrivent l’état antérieur ; voir
> [la navigation par espaces](plan-navigation-espaces-travail.md).
> **Organiser et exporter** regroupe désormais Cas, Recueils et l’export du corpus.
> Ce déplacement n’ajoute aucune dimension Cas aux Analyses croisées.
> L’ouverture d’une source offre désormais un retour à la matrice consultée,
> sans recalcul automatique ni réinjection d’un ancien résultat.

Ce plan décrit un nouvel outil **Analyses croisées**, distinct de **Lexico** et de
**Synthèse**. Il commence par une matrice Thèmes × Entretiens, puis prépare des axes
supplémentaires sans surcharger le premier socle.

## 1. Décision générale

Ajouter un bouton **Analyses croisées** dans la barre d’outils. Il ouvre une fenêtre de travail
presque plein écran et ferme les autres fenêtres métier.

Les trois outils gardent des rôles différents :

- **Lexico** indexe et compare les formes lexicales ;
- **Synthèse** rassemble et lit les passages répondant à une sélection ;
- **Analyses croisées** compare la répartition des thèmes entre plusieurs matériaux.

La nouvelle fenêtre réutilise les sources préparées, les positions ProseMirror et la projection
des passages, mais pas l’interface de Synthèse. Une cellule de matrice doit toujours permettre
de revenir aux passages qui justifient sa valeur.

## 2. Premier contrat fonctionnel

### 2.1 Matrice initiale

Le premier socle croise :

- en lignes : les **thèmes** ;
- en colonnes : les **entretiens**.

Tous les thèmes et entretiens sont cochés à l’ouverture. L’utilisateur peut les retirer
individuellement ou utiliser **Tout sélectionner** et **Tout désélectionner**.

Le calcul demande au moins un thème et un entretien. Il ne produit ni texte intégral ni nouveau
fichier dans le corpus.

### 2.2 Mesures

Trois mesures sont proposées :

1. **Passages** : nombre de plages continues portant le thème dans l’entretien ;
2. **Volume** : longueur totale couverte dans la transcription, après réunion des
   chevauchements d’un même thème ;
3. **Couverture** : volume couvert rapporté à la longueur de la transcription disponible.

Les bornes source servent aux mesures. La longueur d’un pseudonyme ne doit donc pas modifier
les valeurs de la matrice.

Une plage portant plusieurs thèmes contribue à chaque ligne concernée. Les totaux de lignes ne
sont donc pas nécessairement additionnables entre thèmes. Cette règle est indiquée près du
choix de mesure et dans les exports.

### 2.3 Unité comptée

La matrice ne doit pas compter directement les extraits fusionnés de Synthèse. Elle travaille
sur des contributions thématiques par source :

```ts
interface ContributionAnalyseCroisee {
  entretienId: string
  themeId: string
  from: number
  to: number
  annotationIds: string[]
}
```

Pour une cellule `{ themeId, entretienId }` :

1. valider les annotations et leurs bornes ;
2. réunir les plages qui se chevauchent ;
3. réunir les plages contiguës seulement lorsqu’elles restent dans le même tour de parole ;
4. compter les plages obtenues ;
5. additionner leur couverture sans duplication.

Cette unité garantit qu’une superposition de deux annotations du même thème ne gonfle ni le
nombre de passages ni le volume.

## 3. Fenêtre et parcours utilisateur

### 3.1 En-tête

L’en-tête contient :

- titre **Analyses croisées** ;
- date du dernier calcul ;
- état à jour, périmé ou incomplet ;
- **Exporter** ;
- **Quitter**.

Le bouton principal **Calculer l’analyse** est placé sous le bilan, comme dans Synthèse. Après
le premier calcul, il devient **Actualiser l’analyse**.

### 3.2 Configuration

Un panneau latéral reprend les conventions graphiques de Lexico et Synthèse : onglets, badges
de sélection, états gris ou jaunes, actions globales et cases homogènes.

Le premier socle comporte deux onglets :

- **Thèmes** avec leur couleur et leur hiérarchie ;
- **Entretiens** avec tous les entretiens cochés par défaut.

Au-dessus de la matrice, une barre compacte propose :

- **Valeur affichée** : Passages, Volume ou Couverture ;
- interrupteur **Afficher les entretiens sans résultat** ;
- recherche dans les noms de lignes et colonnes si la matrice devient volumineuse.

Changer uniquement la mesure ne relit aucune source. Le tableau est reprojeté depuis les
cellules déjà calculées.

### 3.3 Bilan permanent

Le bilan distingue :

- nombre de thèmes sélectionnés ;
- nombre d’entretiens sélectionnés ;
- nombre d’entretiens contenant au moins un résultat ;
- nombre de cellules non vides ;
- diagnostics ;
- fraîcheur du calcul.

Il évite d’additionner les passages de plusieurs thèmes comme s’ils étaient nécessairement
disjoints.

### 3.4 Tableau

La matrice utilise :

- première colonne fixe avec couleur et nom du thème ;
- en-têtes de colonnes fixes ;
- défilement horizontal et vertical ;
- valeur numérique dans chaque cellule ;
- intensité de fond proportionnelle à la valeur courante ;
- total par ligne et par colonne lorsque ce total est interprétable ;
- symbole et texte explicite pour une source indisponible.

La couleur du thème accompagne le libellé, mais l’intensité des cellules utilise une échelle
commune et accessible. La couleur seule ne porte jamais la valeur.

Pour **Couverture**, toutes les cellules utilisent la même échelle de 0 à 100 %. Pour les
mesures absolues, une légende indique le maximum visible. Une option de normalisation par
ligne pourra venir plus tard, avec un libellé distinct.

### 3.5 Cellule et justificatifs

Une cellule est un bouton accessible au clavier. Son nom accessible contient le thème,
l’entretien, la mesure et la valeur.

Cliquer ouvre un panneau de détail dans la fenêtre :

- thème et entretien ;
- nombre de passages, volume et couverture ;
- liste des passages justificatifs ;
- texte pseudonymisé par défaut ;
- contexte repliable ;
- **Ouvrir dans l’entretien** ;
- **Afficher dans Synthèse**.

Le passage sélectionné reste stable lorsqu’on ouvre ou ferme le détail. L’action vers Synthèse
transmet les thèmes et entretiens de la cellule, mais ne modifie pas le corpus.

### 3.6 Matrices volumineuses

À partir d’un nombre mesuré de lignes ou colonnes, l’interface propose :

- recherche de thèmes ou d’entretiens ;
- masquage des lignes et colonnes vides ;
- tri par nom ou total ;
- virtualisation seulement si les mesures montrent un DOM trop volumineux.

Le tableau ne réduit jamais silencieusement le nombre de matériaux affichés.

## 4. Calcul et données

### 4.1 Moteur pur

Le moteur reçoit des contributions déjà validées et produit des cellules sans dépendance au
DOM :

```ts
interface CelluleAnalyseCroisee {
  themeId: string
  entretienId: string
  passages: number
  volume: number
  couverture: number | null
  plages: Array<{
    id: string
    from: number
    to: number
    annotationIds: string[]
  }>
}
```

`couverture` vaut `null` si la longueur de la source n’est pas fiable. Une source invalide ne
produit jamais une cellule vide présentée comme un vrai zéro.

Le moteur retourne aussi les totaux nécessaires à l’affichage, mais la mesure choisie reste un
état visuel et ne déclenche pas un nouveau calcul des plages.

### 4.2 Chargement partagé

Synthèse et Analyses croisées ont besoin du même travail initial :

- lire l’entretien ouvert depuis son modèle en mémoire ;
- lire les autres sources sans verrou d’écriture ;
- borner la concurrence à quatre lectures ;
- parser chaque document ProseMirror une seule fois ;
- ignorer une ancienne génération ;
- conserver les diagnostics par source.

Extraire ce travail dans un service de session instancié une fois par `creerSonal`, par exemple
`useSourcesAnalyseCorpus`. Il fournit des sources préparées par entretien et invalide son cache
à partir de `lastModified` ou d’une modification de l’entretien ouvert.

Synthèse et Analyses croisées partagent ce cache, mais gardent leurs propres critères,
résultats et diagnostics. Lexico conserve son index lexical spécialisé ; il pourra réutiliser
la lecture bornée plus tard sans imposer cette refactorisation au premier socle.

### 4.3 Stratégie de chargement

Ne pas indexer tout le corpus à l’ouverture de la fenêtre.

1. ouvrir immédiatement la configuration ;
2. attendre **Calculer l’analyse** ;
3. charger uniquement les entretiens cochés ;
4. garder leurs sources préparées en mémoire ;
5. charger seulement les sources supplémentaires après une extension de la sélection ;
6. recalculer immédiatement depuis le cache pour les changements de mesure ou de visibilité.

Cette stratégie évite le coût initial de Lexico sur les gros corpus tout en rendant les
comparaisons successives rapides.

### 4.4 Texte et confidentialité

La matrice ne conserve aucun texte. Le détail projette seulement les passages visibles :

- **Texte pseudonymisé** par défaut ;
- **Texte original** après un choix explicite signalant la présence possible d’identités.

Changer de mode ne modifie ni les cellules ni les mesures. Les variables privées ne sont pas
affichées dans les intitulés, détails ou exports.

## 5. Fraîcheur et diagnostics

Une modification d’un entretien, des thèmes, des personnes, variables ou cas marque le
résultat comme périmé lorsque cette définition peut affecter le calcul courant.

Le résultat précédent reste visible, mais :

- l’ouverture d’un passage est protégée si ses positions peuvent être obsolètes ;
- l’export définitif est désactivé ;
- le bouton principal demande une actualisation.

Une source absente, illisible ou d’une version inconnue reste une colonne nommée avec un
message. Elle n’est assimilée ni à zéro passage ni à une couverture de 0 %.

Une actualisation réussie remplace simultanément cellules, totaux, détails, diagnostics et date
du calcul.

## 6. Export du premier socle

Proposer d’abord :

- **CSV** avec une ligne par thème et une colonne par entretien ;
- **TSV** pour les tableurs configurés avec une virgule décimale ;
- un second fichier facultatif, en format long, avec une ligne par cellule.

L’export contient :

- mesure et unité ;
- date ;
- thèmes et entretiens demandés ;
- sources contributrices ;
- diagnostics et état de complétude ;
- avertissement sur les thèmes superposés ;
- aucune transcription ni variable privée.

Pour un corpus local, proposer `resultats/analyses-croisees/`. Pour un corpus distant, proposer
le dossier Documents du poste. Aucun résultat n’est synchronisé automatiquement.

## 7. Architecture proposée

| Fichier proposé | Rôle |
| --- | --- |
| `src/shared/analysesCroisees/types.ts` | Contributions, cellules, critères et diagnostics |
| `src/shared/analysesCroisees/moteur.ts` | Réunion des plages, mesures et totaux |
| `src/shared/analysesCroisees/export.ts` | CSV et TSV, formats large et long |
| `src/renderer/composables/corpus/useSourcesAnalyseCorpus.ts` | Cache de session et chargement borné partagé |
| `src/renderer/composables/corpus/useAnalysesCroisees.ts` | Calcul, générations, fraîcheur et navigation |
| `src/renderer/components/analyser/analyses-croisees/AnalysesCote.vue` | Sélection des thèmes et des entretiens |
| `src/renderer/components/analyser/analyses-croisees/AnalysesPanneau.vue` | Réglages, matrice, export et détail |
| `src/renderer/components/analyser/analyses-croisees/MatriceThemesMateriaux.vue` | Tableau accessible et navigation clavier |
| `src/renderer/components/analyser/analyses-croisees/DetailCelluleAnalyse.vue` | Justificatifs et retour aux sources |

Raccordements :

- ajouter **Analyses croisées** à `BarreOutils.vue` ;
- monter la fenêtre dans `App.vue` ;
- raccorder le composable dans `sonal.ts` ;
- fermer Synthèse, Lexico, Cas, Recueils, Tableau de bord et Documents cadre à son ouverture ;
- réinitialiser la session au changement de corpus ;
- ajouter un IPC d’export limité à du texte CSV ou TSV.

Aucun champ n’est ajouté à `CorpusFichier` dans le premier socle.

## 8. Réalisation par étapes

### Étape A — moteur et mesures

- définir contributions et cellules ;
- valider et réunir les plages d’un même thème ;
- couper aux changements de locuteur ;
- calculer passages, volume et couverture ;
- distinguer zéro réel et source indisponible ;
- tester les superpositions et les totaux non additifs.

**Arrêt :** mêmes données en entrée, mêmes cellules ordonnées en sortie, sans double comptage.

### Étape B — matrice Thèmes × Entretiens

- bouton et fenêtre ;
- thèmes et entretiens tous cochés ;
- calcul explicite ;
- tableau à en-têtes fixes ;
- choix de mesure sans relecture ;
- affichage facultatif des colonnes vides ;
- fraîcheur et diagnostics.

**Livrable :** comparer la distribution de plusieurs thèmes entre les entretiens et comprendre
chaque valeur.

### Étape C — détail et navigation

- panneau de cellule ;
- projection pseudonymisée ;
- contexte ;
- ouverture de l’entretien ;
- passage vers Synthèse avec les critères de la cellule ;
- conservation de la cellule sélectionnée.

### Étape D — cache partagé et performance

- extraire le chargement préparé de Synthèse ;
- partager le cache au niveau de la session du corpus ;
- chargement incrémental des entretiens ajoutés ;
- mesurer cinquante entretiens et plusieurs milliers d’annotations ;
- virtualiser seulement si nécessaire.

L’extraction peut être avancée avant l’étape B si les premiers tests montrent une duplication
risquée, mais elle ne doit pas bloquer le moteur pur.

### Étape E — exports

- CSV large ;
- TSV large ;
- format long ;
- destination locale ou Documents ;
- critères, unité et diagnostics.

### Étape F — autres matériaux

Ajouter progressivement :

1. Thèmes × Personnes ;
2. Thèmes × Cas ;
3. Thèmes × Modalités d’une variable ;
4. transposition lignes/colonnes ;
5. comparaison de deux groupes définis par des critères.

Chaque nouvel axe doit définir son dénominateur avant de proposer la couverture : paroles de la
personne, union des passages du cas ou plages correspondant à la modalité. Une couverture sans
dénominateur explicite reste indisponible.

## 9. Tests et critères d’acceptation

### 9.1 Moteur

- une annotation produit une cellule avec un passage ;
- deux annotations identiques du même thème ne doublent pas le volume ;
- deux annotations chevauchantes du même thème sont réunies ;
- deux thèmes superposés alimentent deux cellules ;
- changement de locuteur séparant les passages ;
- annotation orpheline ignorée avec diagnostic ;
- zéro réel distinct d’une source indisponible ;
- couverture bornée entre 0 et 100 % ;
- ordre stable des thèmes et entretiens ;
- totaux cohérents avec les cellules sans prétendre additionner des thèmes superposés.

### 9.2 Interface

- tous les thèmes et entretiens cochés initialement ;
- badges identiques aux conventions de Lexico et Synthèse ;
- calcul impossible sans ligne ou colonne ;
- changement de mesure instantané ;
- colonnes vides affichables ou masquables ;
- clic et navigation clavier dans une cellule ;
- valeur compréhensible sans dépendre de la couleur ;
- en-têtes utilisables avec des titres longs ;
- matrice étroite utilisable avec défilement ;
- détail conforme à la cellule ;
- retour à la bonne position dans l’entretien.

### 9.3 Local et distant

- entretien ouvert lu depuis la mémoire ;
- autres sources lues sans verrou ;
- aucune écriture pendant le calcul ;
- même résultat sur corpus local, miroir GitLab et miroir WebDAV ;
- ancienne génération ignorée après une nouvelle demande ;
- export distant écrit uniquement sur le poste ;
- indisponibilité partielle nommée.

### 9.4 Performance

Mesurer :

- cinquante entretiens ;
- plusieurs centaines de thèmes ;
- plusieurs milliers d’annotations ;
- nombreuses superpositions ;
- changement Passages / Volume / Couverture ;
- ajout de quelques entretiens à une sélection déjà calculée.

Cibles initiales : fenêtre immédiatement utilisable, progression lisible pendant le premier
calcul, changement de mesure immédiat et clic de cellule fluide.

## 10. Hors périmètre du premier socle

- formule booléenne libre ;
- réseau graphique de cooccurrences ;
- séquences temporelles de thèmes ;
- modification des annotations depuis la matrice ;
- résultats persistés dans `corpus.json` ;
- analyses enregistrées ou partagées ;
- résumé automatique des cellules ;
- score statistique présenté sans explication ;
- couverture des personnes, cas ou modalités avant définition de leur dénominateur ;
- PDF ou document bureautique de la matrice.

## 11. Critère de réussite

Le premier socle est réussi si l’utilisateur peut :

1. choisir les thèmes et entretiens à comparer ;
2. comprendre précisément ce que mesure chaque cellule ;
3. comparer valeurs absolues et couverture sans double comptage ;
4. inclure ou masquer les matériaux sans résultat ;
5. cliquer sur une valeur et lire les passages qui la justifient ;
6. revenir à la source ;
7. identifier un résultat incomplet ou périmé ;
8. exporter une matrice exploitable dans un tableur sans modifier le corpus.
