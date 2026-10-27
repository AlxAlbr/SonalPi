# Corpus distants — repères développeur

SonalPi ouvre un corpus partagé sur **WebDAV/Nextcloud ou GitLab**, sans serveur
Sonal ni clone Git. Les données de référence sont sur le serveur ; une copie de
travail locale, le **miroir**, permet au `CorpusStore` et au renderer de les lire.
Ce dossier explique le fonctionnement actuel, pas l’historique des livraisons.

## Les notions à distinguer

| Notion | Rôle |
|---|---|
| Compte | Identité authentifiée ; ses secrets restent dans le main et le coffre du poste. |
| Destination | Corpus visé : base WebDAV, ou projet GitLab + branche + racine. |
| Contexte | Services assemblés pour la destination actuellement ouverte. |
| Miroir | Copie locale identifiée sous `userData/miroirs/`, hors synchronisation externe. |
| Tirage | Lecture des versions distantes et installation des changements admissibles. |
| Session d’entretien | Droit d’éditer une source, sauvegardes locales et publications protégées. |
| Transaction corpus | Mutation courte des définitions, éventuellement avec contrôle de sources. |

**Un tirage n’est pas une publication ; une sauvegarde locale n’est pas une
confirmation serveur.** Écrire directement dans le miroir contournerait ces
frontières. Le store du miroir reste protégé contre les écritures ordinaires.

## Lire, ouvrir pour éditer, publier

`corpus:lireEntretien` consulte le miroir sans prendre de droit ni contacter le
serveur. Seul `corpus:ouvrirEntretienPourEdition` demande une session et renvoie
explicitement `edition` ou `lecture-seule`.

Le cycle d’édition suit cet ordre :

1. acquérir le droit puis lire la version serveur qu’il protège ;
2. sauvegarder les modifications localement, en conservant leur état non publié ;
3. publier avec la garde de version du fournisseur ;
4. à la fermeture, terminer la publication **avant** de libérer le droit.

Les opérations d’une session sont sérialisées. Une modification arrivée pendant
un envoi doit rester à publier : le succès de cet envoi ne peut pas acquitter une
révision plus récente. La perte du droit ou un conflit suspend l’édition et
préserve le travail local ; elle n’autorise ni écrasement ni libération forcée.

## Miroir, bascule et récupération

Le miroir commun prépare et valide les fichiers avant installation, utilise les
empreintes du fournisseur et exclut les sources protégées par les sessions ou
opérations en cours. Il n’est pas une copie récursive de tout le stockage distant.
Une source retirée rejoint la corbeille locale plutôt que de disparaître sans trace.

Une ouverture prépare le nouveau contexte avant de remplacer l’ancien. Avant
la bascule, le renderer termine ses sauvegardes et le main ferme les sessions ;
une fermeture bloquée empêche la bascule normale. Les captures de contexte et
les générations empêchent une réponse tardive d’agir sur un autre corpus.

Après interruption, copies et journaux locaux sont des données de récupération,
pas des déchets à supprimer pour « débloquer » l’application. Reprendre exige
les contrôles du fournisseur et le choix explicite prévu par le parcours.
La fusion assistée des copies d’entretien exige un texte identique : elle ne
fusionne pas deux transcriptions concurrentes différentes.

L’absence de réseau n’accorde aucun droit supplémentaire. La lecture du dernier
miroir peut rester utile, mais les nouvelles mutations et publications exigent
les gardes habituelles. Ne pas transformer une erreur réseau en résultat vide
ou en succès local supposé publié.

## Parcours de lecture

- [webdav.md](webdav.md) : ETags, deux providers de verrou, transactions et médias.
- [gitlab.md](gitlab.md) : lecture à commit figé, baux, commits gardés et reprise.
- [authentification-gitlab.md](authentification-gitlab.md) : OAuth, jetons et secrets.
- [gestes.md](gestes.md) : disponibilité réelle des commandes et ajout d’un geste.
- [Migration SonalPi1](../migration/README.md#gitlab--publication-et-reprise) : copies et reprise GitLab, distinctes du parcours distant ordinaire.

## Où intervenir et vérifier

| Responsabilité | Emplacement |
|---|---|
| Contrats publics et statuts | `src/shared/distant.ts` |
| Lecture et installation du miroir | `src/main/distant/miroir.ts`, `installationMiroir.ts`, `validationMiroir.ts` |
| Contextes fournisseurs | `src/main/distant/contexte.ts`, `src/main/gitlab/contexte.ts` |
| Bascule et fermeture | `src/main/transitionContexte.ts`, `src/main/fermetureApplication.ts` |
| État réseau, capacités et événements | `src/renderer/composables/corpus/useDistantCorpus.ts` |
| Reprise, divergence et désignation audio | `src/renderer/components/distant/` |
| Garde de fusion | `src/shared/entretien/fusion.ts` |

Tests communs : `test/transitionContexte.test.ts`, `test/fermetureApplication.test.ts`,
`test/distantRenderer.test.ts`, `test/webdav/miroir-contrat.test.ts` et
`test/webdav/installation-miroir.test.ts`.

Pour les tests serveur réels, appeler `preparer_bancs_docker` dans pi. Les images
et volumes existent déjà : ni téléchargement ni reprovisionnement. Un test sauté
faute de serveur ou d’accès n’est pas une qualification réussie.
