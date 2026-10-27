# Architecture — repères développeur

SonalPi2 est une application Electron : une interface Vue, un processus principal
qui possède les fichiers et les connexions distantes, et un pont typé entre les
deux. Les règles métier communes sont séparées de ces mécanismes.

## Les responsabilités

| Partie | Rôle | Ne doit pas faire |
|---|---|---|
| `src/main/` | Lire et écrire les fichiers, gérer les fournisseurs distants, les secrets, les dialogues natifs et le cycle des sessions. | Prendre une copie envoyée par l’interface pour une autorité sans la vérifier. |
| `src/preload/` | Exposer l’API `window.sonal` et transmettre les appels et événements IPC. | Exposer librement Node.js ou Electron au renderer. |
| `src/renderer/` | Afficher les données, éditer la transcription, orchestrer les actions et présenter leurs résultats. | Accéder directement au disque, aux secrets ou aux services distants. |
| `src/shared/` | Définir les contrats et les opérations métier pures, utilisés par le main et le renderer. | Faire des entrées/sorties ou dépendre du DOM, d’Electron ou de ProseMirror. |

`shared/` n’est pas un quatrième processus. C’est du code partagé, testable sans
lancer l’application. Le test de discipline d’architecture dans
`test/remap.test.ts` contrôle les imports et l’absence d’accès au DOM dans
`src/shared/entretien/` ; il ne constitue pas une vérification exhaustive de tout
`shared/`.

## Carte du code

```text
src/
  main/
    index.ts              Handlers IPC et assemblage des services.
    corpusStore.ts        Lecture, commandes et persistance du corpus.
    distant/              Miroir, sessions et services WebDAV.
    gitlab/               Connecteur et services GitLab.
    webdav/               Requêtes et sondes WebDAV.
  preload/
    index.ts              API window.sonal et événements.
  renderer/
    components/           Interface classée par espace de travail.
    composables/          État réactif et orchestration des actions.
    editor/               Adaptation ProseMirror, remappage et projections.
    audio/                Lecture et forme d’onde.
    formatSonal/          Sas d’import et formats historiques.
    export/               Préparation des documents exportés.
    notes/                Nettoyage HTML des notes.
  shared/
    format.ts             Contrat des fichiers natifs.
    corpus/               Définitions et commandes à l’échelle du corpus.
    entretien/            Annotations, locuteurs, notes, ancres et repères.
```

Cette carte indique les principaux points d’entrée, pas tous les services.
L’organisation détaillée de l’interface est décrite dans le
[README des composants](../../src/renderer/components/README.md).

## Où placer une modification ?

| Besoin | Emplacement habituel |
|---|---|
| Type de fichier ou contrat public utilisé des deux côtés de l’IPC | `shared/format.ts` ou contrat dédié de `shared/`. |
| Validation ou transformation métier sans effet de bord | `shared/corpus/`, `shared/entretien/` ou domaine spécialisé de `shared/`. |
| Lecture, écriture, transaction ou appel serveur | Service du main ; orchestration IPC dans `main/index.ts`. |
| Coordination d’un écran, chargement, sélection et retour d’erreur | Composable renderer de la fonction concernée. |
| Composant Vue | Espace métier dans `renderer/components/`, même s’il s’ouvre depuis un autre espace. |
| Manipulation de documents ProseMirror, vivants ou figés | `renderer/editor/`. |
| Nettoyage HTML nécessitant le DOM | Module renderer dédié, par exemple `renderer/notes/sanitiser.ts`. |

Les contrats transversaux peuvent rester à la racine de `shared/`. Une opération
propre à un agrégat rejoint son sous-dossier. Ne pas créer un dossier partagé
avant qu’un besoin de réutilisation existe réellement.

## Suivre une commande

Une commande d’entretien peut transformer le modèle en mémoire puis demander sa
sauvegarde. Une commande de définition corpus est souvent envoyée au main, qui
relit la base, applique l’opération et renvoie le résultat enregistré. Il n’y a
pas un unique ordre « modifier l’interface puis sauvegarder » pour tous les gestes.
Voir [le circuit des données](donnees.md#commandes-et-persistance).

Pour ajouter un geste, suivre le parcours existant de bout en bout :

1. définir ou réutiliser le contrat et l’opération pure ;
2. brancher le service main et ses vérifications ;
3. exposer l’appel par le preload ;
4. orchestrer l’action dans le composable, puis son interface ;
5. vérifier les refus, les réponses tardives et les tests de chaque couche.

Sur un corpus distant, les [gestes disponibles](distant/gestes.md) et les
transactions du fournisseur s’ajoutent à ce circuit. Écrire directement dans le
miroir ne constitue pas une implémentation distante.

## Pour poursuivre

- [Modèle objet](modele-objet.md) : propriétaires des données et relations.
- [Données](donnees.md) : mémoire, éditeur, fichiers et publications.
- [Développement](developpement.md) : installation et choix des tests.
- [Corpus distants](distant/README.md) : contextes, sessions et récupération.
