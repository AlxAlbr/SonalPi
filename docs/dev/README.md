# Documentation développeur — SonalPi2

Cette documentation décrit l'architecture et le modèle de données de **SonalPi2**.
Elle s'adresse aux développeurs qui veulent comprendre, modifier ou étendre le code.
La documentation utilisateur vit dans [`docs/user/`](../user/) (migration SonalPi1 :
[migration-v1.md](../user/migration-v1.md), multi-utilisateur :
[multi-utilisateur.md](../user/multi-utilisateur.md), créer et partager un corpus
distant : [corpus-distant.md](../user/corpus-distant.md)). Les agents (LLM) trouveront
leurs notes de travail dans [AGENTS.md](../../AGENTS.md) (tests, Docker).

## Sommaire

| Doc | Contenu |
|---|---|
| [donnees.md](donnees.md) | Les données : natures (définition / application / requête), états (stocké / calculé), représentations (mémoire, DOM, fichier) et leurs interactions |
| [ouverture-corpus.md](ouverture-corpus.md) | L'ouverture d'un corpus : amorçage, récents auto-ouverts (tagués local 🌐 distant), mémoire démo (« un dossier vide n'est pas un corpus absent »), branche distante (création directe sur serveur), gardes et invariants |
| [modele-objet.md](modele-objet.md) | Le modèle d'objet (vue à 3 niveaux) : agrégats Corpus / Entretien, patron à 3 étages, sous-schémas par préoccupation (§3–§10), chacun ancré au code actuel
| [architecture.md](architecture.md) | La structure générale de `src/`, les process Electron (main / preload / renderer), la frontière `shared/` pure et sa testabilité, où placer un module dans `shared/` et dans le renderer |
| [multi-utilisateur.md](multi-utilisateur.md) | Le mode corpus distant (WebDAV) : verrous et variantes A/B, cycle de session, transactions, divergence/fusion, présence, audio local — la carte du code, ancrée aux tests |
| [plan-lot-table-donnees.md](plan-lot-table-donnees.md) | Plan (proposition) : saisie des valeurs en corpus distant — bouton « Saisir… » par ligne (onglet Donnée de l'entretien) et modification en lot par colonne (verrou court par entretien) |
| [developpement.md](developpement.md) | Démarrer, commandes, stratégie de test, limitation connue (audio figé sous WSLg) |
| [versions.md](versions.md) | Le vocabulaire des versions : SonalPi1 / SonalPi2 / `formatVersion` / itération / release — la règle « jamais v1/v2 nu » |

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
- **Pour toucher au fonctionnement distant** (verrous, sessions, transactions,
  divergence/fusion, présence) : [multi-utilisateur.md](multi-utilisateur.md), avec
  les cas de test restants dans [plans/encours/plan-multiuser-finition.md](../../plans/encours/plan-multiuser-finition.md).
- **Pour toucher à la création/ouverture d'un corpus distant** (publication,
  récents tagués, assistant) : [ouverture-corpus.md § 7](ouverture-corpus.md#7-la-branche-distante-créer-et-rouvrir-un-corpus-sur-serveur).
- **Pour ajouter une sauvegarde / un format** : [donnees.md § 2](donnees.md#2-objet-mémoire--fichier)
  et le contrat versionné `src/shared/format.ts` (`FORMAT_VERSION`).
