# Documents cadre — repères développeur

Les onglets **Documents du projet** et **Documents exemples** partagent un
explorateur de fichiers. SonalPi les liste, fournit quelques aperçus et permet
d’enregistrer une copie. **Il ne modifie ni ne convertit leur contenu** :
l’édition appartient à l’application habituelle du poste ou à Nextcloud.
Les noms de code `docsCadre` désignent toujours cette fonctionnalité.

## Stockage et disponibilité

Les documents du projet vivent hors de `corpus.json`, sous
`<corpus>/DocsPrepaProjet/`, l’unique racine documentaire du projet.

Les exemples sont des ressources indépendantes du corpus, livrées depuis
`ressources/docsCadreExemples/` et copiées dans les ressources de l’application
empaquetée. Ils sont toujours en lecture seule et ne sont pas ajoutés au corpus
par leur simple consultation.

| Source | Lecture | Actions sur les originaux |
|---|---|---|
| Projet local | Fichiers sous `DocsPrepaProjet/`. | Ajouter un fichier, créer un dossier, ouvrir avec l’application système ou dans le gestionnaire de fichiers. |
| Projet WebDAV | Lecture directe sur le serveur, **sans miroir documentaire**. | Aucune écriture depuis SonalPi ; ouverture du dossier dans Nextcloud. |
| Projet GitLab | Non disponible. | Aucune. |
| Exemples | Ressources locales, même avec un corpus distant. | Aucune ; aperçu et copie seulement. |

La consultation ne crée aucun dossier. La racine locale peut être créée lors
d’une action explicite d’ouverture du dossier, de création ou d’ajout.
L’archive du corpus conserve les documents imbriqués sans conversion.

## Répartition des responsabilités

- **Contrats partagés** : source `projet` ou `exemple`, chemin relatif à cette
  source, inventaire d’un seul dossier et résultat d’aperçu. Le nom seul ne
  suffit pas à identifier un document dans une arborescence.
- **Main** : validation des chemins, accès disque ou WebDAV, dialogues de copie
  et ouverture système. Il refuse les mutations distantes, même par appel IPC
  direct, et vérifie le corpus courant après les attentes asynchrones.
- **Renderer** : navigation et sélection indépendantes pour projet et exemples.
  Les générations de requêtes empêchent une réponse tardive de remplir un autre
  document ou un autre corpus.

Un dossier disparu fait remonter la navigation au premier parent disponible.
Une panne de lecture conserve la dernière liste et affiche l’erreur : elle ne
se transforme pas en dossier vide. En WebDAV, un 404 signale explicitement
l’absence ; l’inventaire ne contient que les enfants directs du dossier.

## Précautions à préserver

- Les cibles documentaires passent par des chemins relatifs validés sous une
  racine autorisée. Refuser traversées, chemins absolus et liens symboliques,
  y compris dans les dossiers intermédiaires. Les chemins système restent dans
  le main, sauf la source native transmise lors d’un dépôt.
- Un ajout ne remplace jamais un homonyme. Le sélecteur peut proposer un nom
  libre ; le dépôt refuse la collision et ne copie pas de dossier récursivement.
  Sa destination est capturée au début du dépôt.
- Les aperçus sont bornés : texte UTF-8 échappé, 2 Mo ; images à signature
  vérifiée, 20 Mo ; PDF.js embarqué avec worker local et rendu canvas, 30 Mo.
  Ces plafonds ne limitent ni le stockage ni la copie du fichier original.
- HTML et bureautique ne sont pas interprétés dans l’interface. Le PDF n’expose
  ni liens actifs, ni formulaires, ni pièces jointes. Ne pas remplacer ces
  aperçus par un chargement arbitraire dans une vue web.
- L’ouverture locale utilise l’association système (`shell.openPath`), sans
  sélecteur d’application propre à SonalPi. Un fichier distant n’est pas ouvert
  implicitement par une application locale ; l’URL Nextcloud est construite et
  validée dans le main, sans transmettre les identifiants au navigateur.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Contrats, noms de racine et limites | `src/shared/docsCadre.ts` |
| Fichiers locaux et validation des cibles | `src/main/docsCadre.ts` |
| Lecture WebDAV et URL Nextcloud | `src/main/docsCadreDistant.ts` |
| IPC, dialogues et actions système | `src/main/index.ts` |
| Navigation et requêtes asynchrones | `src/renderer/composables/corpus/useDocsCadre.ts` |
| Explorateur et aperçus | `src/renderer/components/preparer/documents-cadre/` |
| Onglets et dépôt | `src/renderer/components/preparer/PreparerSuivre.vue` |
| Archive et ressources empaquetées | `src/main/archiveCorpus.ts`, `package.json` |

Tests de référence : `test/docsCadre.test.ts`, `test/docsCadreDistant.test.ts` et
`test/docsCadreRenderer.test.ts`. Pour un changement d’interface ou d’empaquetage,
voir `e2e/docs-cadre.e2e.ts` et `e2e/docs-cadre-paquet.e2e.ts`. Les parcours réels
Nextcloud sont dans `test/webdav/docsCadre-nextcloud.test.ts` et
`e2e/docs-cadre-nextcloud.e2e.ts` ; préparer les bancs avant de les lancer.
