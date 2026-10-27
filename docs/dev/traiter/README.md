# Traiter — documentation développeur

Ce dossier rassemble la documentation des fonctions de traitement des corpus et
des entretiens. Il correspond à l’espace `src/renderer/components/traiter/`.
Les autres espaces de la documentation restent pour l’instant à leur emplacement
actuel ; ce regroupement ne déplace aucun composant.

## Entrées par fonction

| Documentation | Contenu |
|---|---|
| [pseudonymisation/](pseudonymisation/README.md) | Brouillons, décisions textuelles, règles corpus, fournisseurs et sorties. |
| [thematiques/](thematiques/README.md) | Codebook, codages, hiérarchie et réaffectations. |
| [notes/](notes/README.md) | Notes d’entretien, liens aux commentaires et locuteurs, consultation corpus et exports. |
| [locuteurs/](locuteurs/README.md) | Attribution des tours, noms et pseudonymes, personnes et rapprochements entre entretiens. |
| [variables.md](variables.md) | Définitions, modalités, valeurs, table de données et modifications en lot. |

## Deux niveaux, des vues partagées

Le code des composants distingue trois emplacements :

- `entretien/` : travail sur un entretien ouvert et sauvegarde de ses données ;
- `corpus/` : consultation transversale et opérations à l’échelle du corpus ;
- `partages/` : interfaces réutilisées, notamment l’édition des thèmes et la
  table de données.

La documentation conserve des entrées par fonction : chaque page explique où
vivent les définitions, où vivent leurs usages et quelles vues sont calculées.
Un sous-dossier est utilisé lorsque plusieurs parcours méritent une lecture
séparée ; une page suffit pour les variables.

## Repères communs

- [Modèle objet](../modele-objet.md) : contrats et agrégats Corpus / Entretien.
- [Données et commandes](../donnees.md) : mémoire, rendu, fichiers et orchestration.
- [Gestes selon le fournisseur](../distant/gestes.md) : disponibilité effective
  et gardes communes aux opérations locales, GitLab et WebDAV.
- [Architecture](../architecture.md) : partage entre domaine pur, renderer et main.

La présence d’une méthode de transaction ne suffit pas à rendre un parcours
accessible : la politique des gestes et le dispatch du main font également foi.
