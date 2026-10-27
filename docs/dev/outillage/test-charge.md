# Test de charge de l’éditeur

Ce test mesure à partir de quelle taille d’entretien et de quelle quantité
d’annotations l’édition devient perceptiblement lente sur un poste donné. Il
lance la vraie application Electron et génère ses données localement. Aucun
serveur ni corpus utilisateur n’est utilisé.

## Lancer la matrice par défaut

```bash
npm run test:charge
```

La matrice par défaut croise :

- 20 000, 80 000 et 200 000 caractères ;
- 0, 250 et 1 000 annotations ;
- 9 corrections mesurées après une correction de chauffe.

Les annotations sont réparties dans tout l’entretien : 60 % de codages, 20 %
de pseudonymisations et 20 % de commentaires. Chaque scénario utilise un
profil Electron temporaire neuf et un seul scénario tourne à la fois.

Une correction textuelle passée n’est pas conservée comme un objet distinct
après réouverture : seul le texte obtenu est persisté. Le nombre de corrections
antérieures n’est donc pas un axe de charge indépendant. L’option
`--corrections` règle le nombre de répétitions utilisées pour calculer les
percentiles face au nombre d’annotations encore actives.

Pour un essai rapide :

```bash
npm run test:charge -- --tailles 20000,80000 --annotations 0,250 --corrections 5
```

Pour chercher une limite plus haute :

```bash
npm run test:charge -- --tailles 80000,200000,400000 --annotations 500,2000,5000
```

Le premier lancement construit l’application. `--sans-build` permet de rejouer
la mesure avec le build existant :

```bash
npm run test:charge -- --sans-build
```

## Résultats

Deux rapports sont produits dans `test-results/charge-reports/` :

- `dernier.md`, lisible directement ;
- `dernier.json`, prévu pour conserver ou comparer les valeurs brutes.

Des fichiers horodatés sont également créés afin de ne pas écraser les mesures
précédentes. Le rapport enregistre le système, le modèle de processeur, le
nombre de cœurs, la mémoire, les versions d’Electron et de Chromium, ainsi que
la matrice réellement exécutée.

La mesure principale est le p95 des corrections. Elle comprend la frappe, le
remappage de toutes les annotations, le recalcul des projections et deux images
de rendu. Une correction est **FLUIDE** jusqu’à 100 ms, **PERCEPTIBLE** entre
100 ms et le seuil choisi, puis **DÉLICATE** au-delà du seuil de 200 ms par
défaut. L’état global devient aussi **DÉLICAT** si l’ouverture dépasse 3 s ou si
le p95 du défilement dépasse 34 ms.

Le seuil peut être adapté à l’étude :

```bash
npm run test:charge -- --seuil 300 --seuil-ouverture 5000
```

L’ouverture, la recherche, le défilement, la sauvegarde et la consommation
mémoire sont aussi consignés. La sauvegarde inclut le délai automatique de
600 ms ; il est donc normal qu’elle ne soit jamais instantanée.

## Comparer plusieurs ordinateurs

Utiliser la même révision de l’application, la même matrice et le même seuil sur
chaque poste. Copier ensuite les rapports horodatés hors de `test-results/`, par
exemple avec un nom indiquant le poste.

Pour limiter le bruit de mesure :

1. brancher le portable au secteur et conserver le même mode d’alimentation ;
2. fermer les applications lourdes et laisser la machine se stabiliser ;
3. effectuer idéalement trois exécutions ;
4. comparer les médianes des p95 plutôt qu’une mesure isolée.

Ce test est un benchmark, pas une assertion de performance de la suite normale.
Il échoue uniquement si un scénario ne peut pas être exécuté. Le franchissement
d’un seuil est écrit dans le rapport sans faire échouer la commande.
