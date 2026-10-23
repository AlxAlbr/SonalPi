# Pseudonymisation — remplacer le verrouillage intégral par un lot ciblé

**Date :** 10 octobre 2026.

**Statut :** réalisé et qualifié pour GitLab le 10 octobre 2026. Local inchangé. La déclinaison WebDAV a depuis été raccordée et activée après qualification du contexte, des publications et du dialogue Electron A/B ; voir la livraison 10 de `plans/encours/pseudonymisation_v1_vers_v2.md` et `docs/dev/pseudonymisation/corpus.md`.

**Périmètre initial :** renommage d’une variante sur GitLab, puis déclinaison locale/WebDAV selon leurs garanties.

## 1. Décision recherchée

**Scanner tous les entretiens ne signifie pas les verrouiller tous.**

1. Lire le corpus publié et tous ses entretiens pour inventorier les usages.
2. Identifier les seuls entretiens dont une annotation liée doit réellement changer.
3. Présenter ces cibles et leurs droits dans l’aperçu, sans sélection implicite supplémentaire.
4. Prendre des baux courts uniquement sur les ressources à écrire : corpus et entretiens concernés, selon la phase.
5. Laisser les autres entretiens ouverts et modifiables, sans écraser leur miroir ni leurs sauvegardes.

Une modification sans rapport dans un entretien non ciblé ne doit pas invalider tout le lot. Un nouveau **usage pertinent** apparu après le scan doit, en revanche, être détecté et traité explicitement, jamais renommé sans consentement.

## 2. Ce qui change par rapport à la livraison actuelle

La livraison actuelle impose un commit unique, un bail et une garde sur chaque membre, la fermeture de toutes les sessions et une borne de 124 membres. Ce sont des choix d’implémentation, pas les exigences initiales du plan de pseudonymisation.

La trajectoire privilégiée est celle des réaffectations thématiques : **lot ciblé, publications bornées, journal de progression et reprise**. On abandonne la promesse d’un unique commit atomique sur tout le corpus si elle oblige à bloquer les entretiens étrangers au changement.

Les gardes légères restent utiles, mais une garde de version n’est pas un verrou. Ne pas remplacer simplement la borne 124 par une autre borne portant sur tout le membership.

Références :
- `plans/encours/pseudonymisation_v1_vers_v2.md`, lot 5 et garanties des opérations globales ;
- `plans/encours/plan-gitlab-gardes-legeres.md` : gardes `chmod` distinctes des baux ;
- `src/main/gitlab/operationsThemes.ts` : sélection `aModifier`, baux courts et journal ;
- `src/main/gitlab/renommagesAnon.ts` : verrouillage intégral actuel à remplacer.

## 3. Point de conception à résoudre avant les écritures

**Un entretien initialement non ciblé peut recevoir une utilisation de l’ancienne variante pendant le lot.** Une session ancienne peut également tenter de la republier après le renommage.

La validation actuelle des publications contrôle l’existence de la règle, pas l’évolution du pseudo choisi. Retirer les verrous globaux sans traiter ce point serait incorrect.

L’audit doit déterminer et documenter :
- l’ordre de publication de la définition et des annotations, avec un état intermédiaire lisible et reprenable ;
- la protection contre l’introduction ou la réintroduction involontaire de l’ancienne variante par une session ou un candidat récupérable ;
- le contrôle des mutations pertinentes par rapport à leur base publiée, sans imposer que tout pseudo déjà choisi appartienne à la définition actuelle ;
- la détection de nouvelles cibles lors du contrôle final, suivie d’un nouvel aperçu et d’une confirmation si nécessaire.

**Contraintes :** aucune troisième variante transitoire dans une règle limitée à deux ; aucune réécriture des décisions indépendantes ; aucun refus global des sessions étrangères au changement. Ne pas prétendre empêcher les écritures directes qui contournent le protocole de l’application.

Protocole retenu après audit : publication de la nouvelle définition en premier, puis publications courtes des entretiens consentis avec garde du corpus. Les décisions anciennes restent valides tant qu’elles ne sont pas modifiées. Une décision nouvelle ou réactivée, un changement de règle ou de pseudo lié doit utiliser une variante actuellement déclarée ; le contrôle compare le candidat à sa base publiée et garde le corpus dans le commit. Les décisions indépendantes et les décisions liées inchangées restent conservées. Une garde du corpus périmée déclenche une nouvelle validation, pas un contournement.

Un journal privé conserve les copies consenties et chaque intention avant publication. Le contrôle final relit tout le membership sans verrous ni gardes par entretien ; il détecte les usages restants, sans les ajouter au lot. Une reprise exige un nouveau scan et un nouveau consentement, en acceptant les variantes avant/après uniquement pour lire les décisions de ce lot. Une publication directe contournant l’application peut encore introduire un usage après ce contrôle : aucune garantie d’isolation universelle du dépôt n’est revendiquée.

## 4. Étapes d’implémentation

### A. Inventaire et manifeste ciblé

Conserver le scan complet publié et les diagnostics. Séparer explicitement les entretiens **lus**, **à modifier**, **indisponibles** et les ressources nécessitant une garde. Sceller règle, variante, cibles, identités d’annotations et versions nécessaires dans l’aperçu privé. Un inventaire incomplet ne prouve pas l’absence d’autres usages.

### B. Sessions et publications concurrentes

Auditer `SessionGitLab`, `referencesDefinitions.ts`, les mutations des règles et les candidats récupérables. Implémenter les protections retenues au §3 sur les chemins main concernés. Refuser une cible ouverte ou la différer explicitement ; ne pas fermer, publier ou reprendre sa session automatiquement.

### C. Exécution et reprise

Remplacer le commit global par le protocole ciblé défini après audit. Préparer chaque mutation sur copie, revalider ses sources et prendre son bail court. Journaliser intention, étapes confirmées, différées, conflictuelles et indéterminées. Conserver les succès acquis ; ne jamais écraser une source concurrente ni rejouer une publication reconnue.

Les bornes d’actions et de taille s’appliquent aux publications effectivement exécutées. Les limites de lecture de l’inventaire restent distinctes et explicites.

### D. Contexte, miroir et dialogue

Limiter les exclusions d’édition aux cibles et ressources réellement protégées. Conserver la file partagée tirage/transactions. Installer uniquement les fichiers concernés : jamais les copies des entretiens ouverts ailleurs dans le contexte. Afficher progression, bilan confirmé, différés et demande de reprise ; distinguer fin complète et succès partiel.

## 5. Recette d’acceptation

- Un corpus de plus de 124 membres avec deux cibles est accepté, sans verrouiller les autres membres.
- Un entretien non ciblé ouvert sur un autre poste n’empêche pas le lot.
- Une publication sans rapport sur un non-ciblé ne refuse pas les changements ciblés et n’est pas écrasée dans le miroir.
- Une nouvelle utilisation de l’ancienne variante après l’aperçu n’est ni ignorée ni modifiée sans nouvelle confirmation.
- Une sauvegarde tardive ou reprise ancienne ne réintroduit pas une décision renommée.
- Une cible tenue ou modifiée est refusée/différée avec bilan exact ; les succès acquis restent reprenables.
- Interruption avant/après publication, réponse perdue, relance et conflit : aucune compensation ni rejeu dangereux.
- Variantes restantes, exceptions, incluses, texte original, mémoire locale, locuteurs et `Personne` restent préservés.
- Les publications ordinaires et l’édition d’entretiens après le lot restent fonctionnelles.

Tests purs et mémoire, qualification GitLab réelle à deux comptes, recette OAuth/Electron, puis régressions local/Nextcloud. Utiliser les bancs existants via l’outil de préparation ; fixtures synthétiques isolées, aucun corpus utilisateur.

## 6. Livraison

Garder le plan principal dans `encours`. Corriger les descriptions « tous les membres verrouillés », « fermeture de toutes les sessions » et « un commit obligatoire » uniquement lorsque le nouveau protocole est qualifié et raccordé. Consigner ce changement de compromis ; les tests de la version précédente ne prouvent pas la nouvelle concurrence.

Ne pas activer le renommage WebDAV sur la base de l’ancien modèle intégral. Sa déclinaison doit partir de ce contrat ciblé, avec publication séquentielle conditionnelle et reprise propres au fournisseur.

## 7. Résultat livré

- Scan publié complet, manifeste privé des seules cibles, observation de leur disponibilité sans réservation implicite.
- Définition puis entretiens consentis, baux courts, garde du corpus par publication ; aucun bail/garde ni installation des non-ciblés. Plafond de 124 membres supprimé pour le renommage.
- Validation des nouveaux choix liés sur base publiée : sessions, transactions courtes et créations/imports GitLab. Choix anciens inchangés, exceptions et indépendants préservés.
- Journal privé 0600/128 Mio, bilan acquis, cibles différées, contrôle final, reprise fraîche avec nouveau consentement ; publications inconnues réconciliées sans rejeu. Une source divergente n’est jamais écrasée ; une cible sortie du corpus ou sans usage restant n’est retirée qu’après le nouveau consentement.
- IPC, suivi, dialogue de reprise et progression raccordés. Suivi indisponible bloquant ; réponses tardives du dialogue et de la progression ignorées.
- **13 qualifications GitLab réelles à deux comptes**, dont 130 membres/deux cibles, plus **7 qualifications de correspondances**. Recette OAuth renommage/import réussie ; le renommage inclut cible et non-cible tenues, succès partiel, reprise confirmée et édition/publication après le lot. Deux répétitions supplémentaires du renommage réussies.
- **7 E2E locaux**, typecheck/build réussis ; suite complète : **168 fichiers réussis, 2 188 tests réussis, 93 sautés**. Les qualifications conditionnelles sont exécutées séparément.
- Documentation et plan principal actualisés, sans clôturer ses lots restants. Aucun commit, aucun corpus utilisateur modifié ; projets/racines GitLab synthétiques conservés.

Une recette OAuth a échoué dans la préparation des baux avant lancement de l’application. La fixture contrôle désormais le droit réel de publication de branche après création de l’adhésion ; réexécution et répétitions réussies, sans affaiblir les contrôles de production. Aucune garantie d’absence totale d’intermittence du banc n’est déduite de ces passes.

Restent non qualifiés : charge maximale ou nombreuses cibles, Windows, anciens clients, instances institutionnelles supplémentaires. Une écriture directe contournant le protocole peut introduire un usage après le contrôle final ; aucune isolation universelle du dépôt n’est revendiquée.
