# Accueil — repères développeur

L’accueil permet de choisir **sur quel corpus travailler** : créer ou rouvrir un
corpus, retrouver un récent, découvrir un exemple ou lancer un parcours guidé.
Il donne aussi accès aux migrations SonalPi1. Les composants correspondants
vivent dans `src/renderer/components/accueil/`.

Ce dossier décrit ces entrées dans l’application. Pour installer le projet et
lancer les tests, commencer par [développement](../developpement.md) ; pour
comprendre la séparation main / preload / renderer, voir
[l’architecture](../architecture.md).

## Les distinctions essentielles

- **Afficher l’accueil n’est pas fermer le corpus.** Un corpus peut rester chargé
  alors que l’accueil est visible. Le retour à l’accueil ferme cependant
  l’entretien ouvert, avec ses sauvegardes et contrôles de session.
- **Ouvrir n’est pas installer.** Reprendre un exemple conserve le travail réalisé ;
  seules une installation ou une remise à zéro explicites utilisent son contenu
  de départ.
- **Un récent est un raccourci, pas une sauvegarde.** Le retirer ne supprime
  aucune donnée. Les travaux d’apprentissage ont leur propre registre et ne
  figurent pas dans les Récents.
- **Un corpus distant reste distant.** Son miroir local n’est jamais une
  destination à ouvrir comme un corpus local.

## Entrées par fonction

| Documentation | À lire pour… |
|---|---|
| [Ouverture et récents](ouverture.md) | Suivre une création, une bascule de corpus, le démarrage ou la disparition du dossier courant. |
| [Corpus exemples](exemples.md) | Comprendre les contenus fournis, leur installation, leur identité, leur reprise et les fichiers d’exercice. |
| [Parcours guidés](parcours.md) | Modifier les étapes, leurs validations, les acquis et la présentation du guide. |

La [migration SonalPi1, locale ou GitLab](../migration/README.md), est un parcours
distinct de l’ouverture ordinaire. Voir aussi le
[guide utilisateur](../../user/migration-v1.md).
Les sessions et publications distantes sont décrites dans
[distant/](../distant/README.md).

## Menus selon l’écran

L’ordre reste **Corpus → Entretiens → Édition → Aide**. Sur l’accueil général,
les commandes de travail sont désactivées même si un corpus reste chargé.
Dans les espaces, l’enregistrement concerne l’entretien ouvert et modifiable,
la sauvegarde ZIP un corpus local et l’export un corpus non vide. Le tri demande
au moins deux entretiens ; ses restrictions distantes restent applicables.

`sonal.ts` calcule les disponibilités et les transmet par `menu:etat` au main.
Les récents peuvent reconstruire le menu sans perdre cet état. Le routage renderer
refuse aussi les commandes indisponibles ; les contrôles métier restent inchangés.
Le contrat est dans `src/shared/menuApplication.ts` ; la construction du menu
est dans `src/main/menuApplication.ts`. Recette : `e2e/menu-application.e2e.ts`.

## Documentation utilisateur

Le menu **Aide** ouvre le [site HTML local](../../user/index.html) avec
l’application associée au HTML sur le poste. `src/main/documentation.ts` utilise
`shell.openPath` : aucun nouveau renderer, aucune transition de corpus.
Les pages sont rédigées directement dans `docs/user/`, avec `style.css` comme
présentation commune. Il n’y a ni conversion Markdown ni dépendance de rendu.
`extraResources` copie HTML, CSS et illustrations dans `resources/documentation/` ;
les anciens textes Markdown ne sont pas embarqués.

Tests : `test/documentation.test.ts`, `test/menuApplication.test.ts` et
`e2e/documentation.e2e.ts`. Ce dernier peut viser le paquet avec
`DOCS_E2E_EXECUTABLE=/chemin/vers/sonalpi2`.

## Suivre une action dans le code

```text
Accueil ou menu applicatif
  → composable renderer : choix de l’action et préparation de la sortie
  → API window.sonal, exposée par le preload
  → main : vérifications, fermeture du contexte précédent, ouverture de la cible
  → renderer : application du corpus reçu et choix de la vue
```

`Accueil.vue` affiche les entrées et ouvre les dialogues ; il ne doit pas porter
les règles d’écriture ou de changement de corpus. Certaines actions existent
aussi dans le menu applicatif et doivent emprunter le même circuit.

| Responsabilité | Emplacement |
|---|---|
| Cartes, récents et accès aux assistants | `src/renderer/components/accueil/Accueil.vue` |
| Assemblage des composables et actions du menu | `src/renderer/composables/sonal.ts` |
| Chargement et changement du corpus affiché | `src/renderer/composables/corpus/useCycleCorpus.ts` |
| Métadonnées du corpus courant et récents | `src/renderer/composables/useProfil.ts` |
| Choix, installation et reprise d’un exemple | `src/renderer/composables/useExemples.ts` |
| API entre renderer et main | `src/preload/index.ts`, handlers dans `src/main/index.ts` |

Pour une modification de navigation après ouverture, consulter aussi
[navigation par espaces](../navigation-espaces.md). Le guide pédagogique et les
retours de consultation sont deux mécanismes différents.
