# Thématiques au niveau corpus

Le corpus possède le codebook partagé. Il porte les définitions et leur
hiérarchie, tandis que les entretiens portent les codages. Cette séparation
permet de modifier l’apparence ou la documentation d’un thème sans réécrire ses
usages.

## Définition d’un thème

```ts
interface Categorie {
  id: string
  nom: string
  description?: string
  couleur?: string
  taille?: number
  ordre: number
  parent: string | null
  actif: boolean
  codeExport: string
}
```

- `id` est l’identité opaque utilisée par les annotations ;
- `nom` et `description` sont les textes destinés à l’utilisateur ;
- `couleur` et `taille` pilotent le rendu des passages ;
- `ordre` classe le thème parmi ceux du même niveau ;
- `parent` forme la hiérarchie ; `null` désigne le premier niveau ;
- `actif` masque ou réactive les usages sans les retirer ;
- `codeExport` conserve un identifiant lisible `cat_XXX` pour les formats
  historiques.

## Hiérarchie et édition

`ordreThemes` transforme le dictionnaire du codebook en pré-ordre : un thème,
puis ses descendants. Cette vue sert à l’affichage indenté et à l’export
SonalPi1, où la profondeur redevient `rang`.

Les opérations courantes sont pures dans `categories.ts` :

- ajouter un thème de premier niveau ou un sous-thème ;
- renommer, décrire, recolorer, retailler ou activer ;
- déplacer un thème parmi ceux du même niveau ;
- changer son parent sans créer de cycle ;
- retirer une définition inutilisée en promouvant ses enfants.

La politique de suppression est décidée par l’orchestration. Depuis le corpus,
un thème utilisé est refusé. Depuis l’entretien, une confirmation peut retirer
les codages de cet entretien seulement si aucun autre entretien ne l’utilise.

## Import, migration et export

Les imports `.sonal` et les migrations `.crp` reconstruisent le même modèle :

- `code` devient `id` et `codeExport` ;
- la séquence des `rang` reconstruit `parent` ;
- `nom//description` devient deux champs ;
- `taille`, `couleur` et `act` sont normalisés.

La migration locale et la migration GitLab appellent toutes deux
`mapperDefinitions`. Une description V1 rejoint donc le `corpus.crp` natif dans
les deux parcours. L’export `.sonal` réunit les deux champs pour rester lisible
par SonalPi1.

## Requêtes dérivées

Aucun compteur ni extrait thématique n’est stocké dans le codebook :

- `compterUsagesCategorie` balaie les annotations pour une définition ;
- `usagesParCategorie` calcule les compteurs de l’interface ;
- `resumeThematique` projette les codages d’un entretien sur l’axe de son texte ;
- `resumesThematiques` produit les résumés du corpus.

Ces requêtes sont rafraîchies après les sauvegardes et après une opération
thématique. Elles ne remplacent jamais les annotations sources.

## Opérations de réaffectation

Le cœur métier commun est dans `src/shared/corpus/themes.ts`.

### Transfert

Tous les codages observés d’une source rejoignent une destination existante ou
nouvelle. La source est conservée par défaut. Si elle doit disparaître, ses
enfants sont promus vers son ancien parent après contrôle de tout le corpus.

### Fusion

Deux sources rejoignent une destination existante, qui peut être l’une des deux
ou une troisième thématique. Les sources non retenues sont supprimées après
réaffectation. Une destination située sous une source retirée est refusée.

### Division

Chaque codage de la source reçoit explicitement l’une des deux à quatre
destinations. Sans suppression, les codages non répartis restent sur la source.
Avec suppression, tous les codages, y compris les orphelins, doivent avoir une
destination.

Pour les trois gestes, seule une plage cible strictement identique constitue un
doublon. Les annotations de commentaire et de pseudonymisation ne sont jamais
modifiées.

## Aperçu et confirmation

Une opération globale suit un contrat commun :

1. valider la demande et inventorier les codages ;
2. produire un aperçu borné et des détails par entretien ;
3. recueillir les choix de répartition éventuels ;
4. confirmer un manifeste encore frais ;
5. exécuter selon le fournisseur ;
6. rafraîchir codebook, usages et résumés.

`OperationsThemesCorpus` conserve uniquement les empreintes et les extraits
courts nécessaires à l’aperçu. Son cache est limité à huit aperçus, quinze
minutes et 32 Mio. Un entretien absent, illisible ou invalide devient un obstacle
nommé, jamais un usage nul.

Les principaux canaux sont :

| Canal | Rôle |
|---|---|
| `corpus:analyserOperationTheme` | construire ou réviser l’aperçu |
| `corpus:detailsOperationTheme` | lire les passages d’un entretien |
| `corpus:executerOperationTheme` | confirmer et lancer le lot |
| `corpus:progressionOperationTheme` | annoncer la progression |
| `corpus:lireSuiviOperationTheme` | retrouver un lot incomplet |
| `corpus:preparerRepriseOperationTheme` | recalculer avant reprise |
| `corpus:reconcilierOperationTheme` | vérifier une publication inconnue |
| `corpus:abandonnerOperationTheme` | clôturer un suivi certain |

Un aperçu n’est ni une autorisation d’écriture ni un journal. Toute modification
du codebook, des choix ou d’une source observée impose une nouvelle validation.

## Atelier dans le renderer

`ThemesOpsCorpus.vue` porte le parcours transfert, fusion ou division.
`RepartitionTheme.vue` charge un entretien à la fois et propose l’affectation des
codages, sans ouvrir l’entretien dans l’éditeur. Les réponses tardives sont
ignorées lorsque le corpus ou la révision de l’atelier a changé.

Le récapitulatif vaut confirmation utilisateur pour le lanceur global : celui-ci
conserve la garde anti-double-lancement, mais ne présente pas une seconde
confirmation identique.

L’exécution locale et les protocoles distants sont décrits dans
[fournisseurs.md](fournisseurs.md).

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| CRUD et hiérarchie | `src/shared/corpus/categories.ts` |
| Requêtes dérivées | `src/shared/corpus/requetes.ts` |
| Contrat des opérations | `src/shared/corpus/themes.ts` |
| Aperçus communs | `src/main/operationsThemes.ts` |
| IPC | `src/main/ipcOperationsThemes.ts` |
| Orchestration renderer | `src/renderer/composables/corpus/useOperationsThemesCorpus.ts` |
| Interface | `src/renderer/components/traiter/corpus/ThemesOpsCorpus.vue` et `RepartitionTheme.vue` |

Tests principaux :

- `test/corpus.test.ts` : CRUD, hiérarchie, descriptions et résumés ;
- `test/themes.test.ts` : règles pures de transfert, fusion et division ;
- `test/operationsThemes.test.ts` : aperçus, fraîcheur, détails et périmètre ;
- `test/themesOpsRenderer.test.ts` : parcours renderer ;
- `e2e/themes-operations.e2e.ts` : parcours complets et navigation ;
- `e2e/documentation-themes.e2e.ts` : descriptions, hiérarchie, déplacement,
  apparence, désactivation et suppression du [chapitre utilisateur](../../../user/traiter/organiser-themes.html).

La recette documentaire compare le fichier de l’entretien avant et après les
changements de définition. Elle vérifie aussi les compteurs distincts du parent
et de l’enfant, la réactivation des codages et la promotion des enfants lors du
retrait d’un parent inutilisé. L’illustration est renouvelée uniquement avec
`SONAL_DOC_CAPTURES=1`.
