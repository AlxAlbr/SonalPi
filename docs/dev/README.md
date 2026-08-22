# Documentation développeur — SonalPiTestV2

Cette documentation décrit l'architecture et le modèle de données de **SonalPiTestV2**.
Elle s'adresse aux développeurs qui veulent comprendre, modifier ou étendre le code.
La documentation utilisateur (migration V1, etc.) est dans [`docs/migration-v1.md`](../migration-v1.md).

## Sommaire

| Doc | Contenu |
|---|---|
| [donnees.md](donnees.md) | Les données : natures (définition / application / requête), états (stocké / calculé), représentations (mémoire, DOM, fichier) et leurs interactions |
| [ouverture-corpus.md](ouverture-corpus.md) | L'ouverture d'un corpus : amorçage, récents auto-ouverts, mémoire démo (« un dossier vide n'est pas un corpus absent »), gardes et invariants |
| [modele-objet.md](modele-objet.md) | Le modèle d'objet (vue à 3 niveaux) : agrégats Corpus / Entretien, patron à 3 étages, sous-schémas par préoccupation (§3–§9), chacun ancré au code actuel
| [architecture.md](architecture.md) | La structure générale de `src/`, les process Electron (main / preload / renderer), la frontière `shared/` pure et sa testabilité |
| [developpement.md](developpement.md) | Démarrer, commandes, stratégie de test, limitation connue (audio figé sous WSLg) |

## Parcours de lecture suggéré

- **Nouvel arrivant** : [architecture](architecture.md) → [donnees](donnees.md) →
  [modele-objet](modele-objet.md) → [developpement](developpement.md).
- **Pour toucher à l'accueil, aux récents ou au mode démo** (ouverture, reconstruction,
  dossiers mémorisés) : [ouverture-corpus.md](ouverture-corpus.md).
- **Pour modifier une commande métier** (poser un codage, renommer un locuteur…) : les fonctions
  pures vivent dans `src/shared/` (carte code ↔ modèle : [modele-objet.md §11](modele-objet.md#11-carte-code--modèle)),
  l'orchestration dans les composables renderer ([donnees.md § 3](donnees.md#3-commandes-métier)).
- **Pour toucher à l'éditeur** (rendu, décorations, remap des positions) :
  [donnees.md § 1](donnees.md#1-dom--objet-en-mémoire).
- **Pour ajouter une sauvegarde / un format** : [donnees.md § 2](donnees.md#2-objet-mémoire--fichier)
  et le contrat versionné `src/shared/format.ts` (`FORMAT_VERSION`).
