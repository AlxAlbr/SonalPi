# Thématiques selon le fournisseur

Les opérations de réaffectation partagent le même contrat métier, mais leur
publication dépend du stockage. Cette page décrit uniquement les garanties
propres aux thématiques ; les transports généraux sont détaillés dans
[gestes par fournisseur](../../distant/gestes.md),
[GitLab](../../distant/gitlab.md) et
[WebDAV](../../distant/webdav.md).

## Cycle commun

Une opération globale suit les étapes suivantes :

1. lire les définitions et les entretiens prévus ;
2. construire un aperçu avec des empreintes de fraîcheur ;
3. observer les obstacles sans réserver les fichiers ;
4. faire confirmer la demande et les choix ;
5. protéger chaque écriture selon le fournisseur ;
6. publier les entretiens puis, si nécessaire, le codebook final ;
7. persister le résultat avant de poursuivre ;
8. réconcilier explicitement toute réponse inconnue.

Le miroir local n’est jamais une source de secours pour décider qu’un fichier
distant est libre ou à jour. Une session locale active ou récupérable interdit
également son écrasement par une opération globale.

## Comparaison synthétique

| Capacité | Local | WebDAV | GitLab |
|---|---:|---:|---:|
| Transfert avec source conservée | oui | oui | oui |
| Division avec source conservée | oui | oui | oui |
| Transfert retirant la source | oui | non | oui |
| Fusion | oui | non | oui |
| Division retirant la source | oui | non | oui |
| Bilan partiel et reprise | journal local | oui | oui |

WebDAV conserve toujours la source. Les variantes destructives exigent un
inventaire final de tout le membership et restent fermées tant que cette garantie
n’est pas fournie par le parcours.

## Local

`TransactionsFichiersCorpus` prépare les candidats en mémoire et vérifie toutes
les sources avant la première écriture.

| Cas | Ordre d’écriture |
|---|---|
| Destination existante, source conservée | entretiens seuls |
| Nouvelle destination, source conservée | corpus intermédiaire puis entretiens |
| Fusion ou suppression de source | entretiens puis corpus final |

Une suppression contrôle également les entretiens sans mutation afin de vérifier
qu’aucune référence à la source n’a été ajoutée depuis l’aperçu.

Le journal `.transaction-fichiers.json` permet de reprendre après une coupure. Il
accepte uniquement les états initial, intermédiaire ou final prévus et refuse un
contenu inconnu. La transaction n’est pas atomique entre plusieurs fichiers,
mais son intention est persistée et terminée avant que le corpus soit de nouveau
exposé.

## WebDAV

`ApercusThemesWebDAV` lit `corpus.crp` et chaque entretien directement sur le
serveur. Le contenu et son ETag fort proviennent du même GET ; un ETag absent ou
faible rend la source indisponible. Le corpus est relu après l’inventaire pour
détecter une modification des définitions ou du membership.

Un aperçu peut rester partiel pour un transfert ou une division conservant la
source. Les compteurs portent alors uniquement sur les membres réellement lus,
et les indisponibles sont nommés dans le bilan.

`OperationsThemesWebDAV` traite chaque entretien séparément :

1. prendre le verrou disponible ou préparer un PUT conditionnel ;
2. relire le contenu serveur ;
3. comparer l’empreinte à l’aperçu ;
4. écrire et confirmer la publication ;
5. mettre à jour le miroir seulement après confirmation.

Le journal `.themes-webdav.json` conserve l’intention et le candidat avant le
PUT. Un refus HTTP certain est inscrit au bilan et le lot peut continuer. Une
coupure ou une réponse ambiguë arrête le lot : la réconciliation relit le serveur
et confirme uniquement le candidat exact, sans rejouer aveuglément l’écriture.

La reprise réinventorie les sources, conserve les identifiants des destinations
déjà créées et redemande seulement les choix encore nécessaires. Clôturer un
suivi n’annule jamais les succès déjà publiés.

## GitLab

`ApercusThemesGitLab` résout un commit unique et lit le corpus et ses membres à
ce SHA. Les entretiens effectivement modifiés font ensuite l’objet d’une
observation ciblée des baux. Cette observation n’est pas une réservation : la
disponibilité est vérifiée à nouveau pendant l’exécution.

`OperationsThemesGitLab` utilise des commits courts :

- création éventuelle d’une destination sous le bail de `corpus.crp` ;
- réaffectation d’un entretien sous son bail ;
- garde légère du codebook dans chaque commit d’entretien ;
- finalisation séparée pour retirer les sources.

Le journal `.themes-gitlab.json` fixe l’opération, les destinations créées, les
succès et la phase courante. Une reprise réutilise les mêmes identifiants. Une
réponse de commit perdue est recherchée dans l’historique puis vérifiée au SHA
retrouvé ; aucun commit de données n’est rejoué automatiquement.

Une opération destructive ne retire les sources qu’après relecture du membership
complet et de tous ses membres à un même SHA. La finalisation publie le codebook
final avec une garde par entretien. Elle est limitée à 248 membres. Une nouvelle
référence ou une garde périmée bloque seulement cette finalisation : les
réaffectations déjà confirmées restent acquises.

Le mode `observes-libres` traite seulement les entretiens observés libres lors de
la confirmation. Les autres restent différés jusqu’à une reprise explicite.

## Suivi et changement de contexte

Les aperçus et suivis appartiennent au contexte fournisseur courant. Fermer le
contexte, changer de corpus ou changer de destination invalide les réponses en
vol et vide les caches associés.

Après un succès ou un bilan partiel, le renderer actualise le codebook, les
usages et les résumés. Une erreur d’actualisation ne transforme pas un succès
distant en échec et ne déclenche aucune nouvelle publication.

## Carte du code et tests

| Responsabilité | Local | WebDAV | GitLab |
|---|---|---|---|
| Aperçu | `main/operationsThemes.ts` | `main/distant/apercusThemesWebDAV.ts` | `main/gitlab/apercusThemes.ts` |
| Publication | `main/transactionsFichiers.ts` | `main/distant/operationsThemesWebDAV.ts` | `main/gitlab/operationsThemes.ts` |
| Journal | `.transaction-fichiers.json` | `.themes-webdav.json` | `.themes-gitlab.json` |

Tests principaux :

- local : `test/operationsThemes.test.ts` et
  `test/transactionsFichiers.test.ts` ;
- WebDAV simulé : `test/apercusThemesWebDAV.test.ts` et
  `test/operationsThemesWebDAV.test.ts` ;
- WebDAV réel : `test/webdav/themes-apercus-nextcloud.test.ts` et
  `test/webdav/themes-publication-nextcloud.test.ts` ;
- GitLab simulé : `test/gitlab/apercusThemes.test.ts` et
  `test/gitlab/operationsThemes.test.ts` ;
- GitLab réel : `test/gitlab/qualificationApercusThemes.test.ts` et
  `test/gitlab/qualificationThemes.test.ts` ;
- renderer distant : `test/themesOpsWebDAVRenderer.test.ts` et
  `test/themesOpsRenderer.test.ts`.
