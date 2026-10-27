# Documentation développeur — SonalPi2

Cette documentation aide à comprendre le code, trouver le bon point d’intervention
et choisir les tests d’une modification. Elle décrit le fonctionnement actuel,
pas l’historique des développements. Les guides destinés aux utilisateurs sont
dans [`docs/user/`](../user/) ; les consignes de travail des agents sont dans
[`AGENTS.md`](../../AGENTS.md).

## Commencer ici

1. [Développement](developpement.md) : installer, lancer et vérifier le projet.
2. [Architecture](architecture.md) : responsabilités main, preload, renderer et shared.
3. [Modèle objet](modele-objet.md) : objets, propriétaires et relations.
4. [Données](donnees.md) : stockage, calculs, éditeur et publications.

Lire ensuite la page de la fonction à modifier. Chaque page métier indique les
règles à préserver, les fichiers concernés et les tests de référence.

## Repères transversaux

| Documentation | Pour comprendre ou modifier… |
|---|---|
| [Architecture](architecture.md) | Les frontières du code et l’emplacement d’un nouveau module. |
| [Modèle objet](modele-objet.md) | Corpus, entretiens, références et données persistées. |
| [Données](donnees.md) | Les commandes, le remappage, la persistance et la compatibilité du format. |
| [Navigation](navigation-espaces.md) | Les espaces, la fermeture d’entretien et les retours contextuels. |
| [Développement](developpement.md) | Le poste, les suites de tests, les bancs et le vocabulaire des versions. |

## Documentation par fonction

| Domaine | Entrées |
|---|---|
| Accueil | [Ouverture et récents](accueil/ouverture.md), [corpus exemples](accueil/exemples.md), [parcours guidés](accueil/parcours.md) ; [vue d’ensemble](accueil/README.md). |
| Préparer | [Tableau de bord](preparer/tableau-bord.md), [documents du projet et exemples](preparer/docs-cadre.md). |
| Traiter | [Pseudonymisation](traiter/pseudonymisation/README.md), [thématiques](traiter/thematiques/README.md), [notes](traiter/notes/README.md), [locuteurs et personnes](traiter/locuteurs/README.md), [variables](traiter/variables.md) ; [vue d’ensemble](traiter/README.md). |
| Analyser | [Synthèse](analyser/synthese.md), [Lexico](analyser/lexico.md), [analyses croisées](analyser/analyses-croisees.md). |
| Organiser | [Cas](organiser/cas.md), [recueils](organiser/recueils.md), [exports](organiser/export.md). |
| Distant | [Cycle commun](distant/README.md), [WebDAV](distant/webdav.md), [GitLab](distant/gitlab.md), [authentification GitLab](distant/authentification-gitlab.md), [gestes disponibles](distant/gestes.md). |
| Migration SonalPi1 | [Parcours local et GitLab](migration/README.md) : conversion, documents conservés et reprise. |

## Outillage

- [Remotes Git](outillage/git-remotes.md) : comparer et publier le code sur les deux dépôts.
- [Empaquetage et CI](outillage/empaquetage-ci.md) : fabriquer et vérifier les applications installables.
- [Charge de l’éditeur](outillage/test-charge.md) : mesurer et comparer les performances.

## Avant une modification

- **Une commande métier** : suivre son modèle pur, son orchestration, ses accès
  IPC et ses tests ; ne pas s’arrêter au bouton qui la déclenche.
- **Une fonction distante** : vérifier les [gestes disponibles](distant/gestes.md)
  et le fournisseur réel. Une méthode de transaction ne garantit pas que le
  parcours correspondant est ouvert.
- **Un changement de format** : lire la
  [politique de compatibilité](donnees.md#format-natif-et-compatibilité), pas
  seulement ajouter un champ TypeScript.
- **Une recette serveur** : suivre les
  [consignes des bancs](developpement.md#bancs-gitlab-et-nextcloud) ; un test sauté
  ne vaut pas validation.
