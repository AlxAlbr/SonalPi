# Organisation des composants

Les composants d’interface sont regroupés par espace de travail :

```text
components/
├── accueil/                     Accueil général et ouverture des corpus.
├── app/                         Barre principale et guidage transversaux.
├── preparer/                    Préparer et suivre.
│   ├── tableau-bord/
│   └── documents-cadre/
├── traiter/                     Importer et traiter.
│   ├── corpus/
│   ├── entretien/
│   └── partages/
│       ├── donnees/
│       └── themes/
├── analyser/                    Analyser et interpréter.
│   ├── synthese/
│   ├── lexico/
│   └── analyses-croisees/
├── organiser/                   Organiser et exporter.
│   ├── cas/
│   ├── recueils/
│   ├── export/
│   └── partages/
└── distant/                     Dialogues de session et de médias distants.
```

## Où placer un composant ?

- Le ranger avec sa fonctionnalité, même s’il peut être ouvert depuis un autre
  espace. Les dialogues d’ajout aux cas et aux recueils appartiennent ainsi à
  `organiser/`, bien qu’ils s’ouvrent depuis un entretien.
- Conserver les composants partagés au niveau commun le plus proche :
  `traiter/partages/` pour les éditeurs de thèmes et de variables utilisés par
  Corpus et Entretien ; `organiser/partages/` pour le dialogue de passage commun
  aux ajouts de cas et de recueils.
- Réserver `app/` à l’interface réellement transversale. Ne pas y déplacer tous
  les dialogues sous prétexte qu’ils sont montés dans `App.vue`.
- Ne pas créer de dossier partagé tant qu’aucun composant ne le nécessite.

La distinction Corpus/Entretien organise ici les vues de traitement seulement.
Les noms tels que `CasCorpus.vue` ou `ExportCorpus.vue` indiquent la portée de
la fonctionnalité. L’export du corpus est un outil gauche/droite de `organiser/`,
monté à la demande et conservé entre les onglets, pas un dialogue global.

Les composables, les projections et les modèles métier gardent leur organisation
propre, indépendante de l’emplacement des composants. Un changement de dossier
ne doit modifier ni leur comportement ni les contrats de sauvegarde et de session.
