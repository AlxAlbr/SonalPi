# Personnes et rapprochements entre entretiens

Le répertoire Personnes donne une vue transverse des locuteurs. La fiche porte
un nom de référence ; les libellés locaux, pseudonymes, valeurs et notes restent
chez leurs propriétaires dans chaque entretien.

La procédure utilisateur est décrite dans
[Relier une personne entre plusieurs entretiens](../../../user/traiter/personnes.html).
Elle distingue les corrections locales de la consultation distante.

## Inventaire et liens

`personnesInventaire()` rassemble les définitions du corpus, les locuteurs et
les notes qui visent des locuteurs. Il ne transmet pas les transcriptions et
signale les entretiens indisponibles. La vue peut ainsi montrer les locuteurs
non liés, les références invalides, les doublons dans un même entretien et les
propositions à vérifier.

Les commandes distinguent :

- créer une définition seule ou une fiche liée à un locuteur ;
- lier, déplacer ou délier un locuteur ;
- renommer le nom de référence sans renommer les entrées locales ;
- supprimer une fiche vide, après vérification d’un inventaire complet.

Une création liée écrit la définition avant son association. Si la seconde
écriture échoue, la fiche vide reste retrouvable et l’erreur est explicite.
Délier pose `personneDeliee` pour empêcher une recréation automatique au nommage ;
une liaison explicite retire ce marqueur.

## Suggestions et décisions

Les suggestions sont calculées depuis les noms et les rôles : noms normalisés
identiques, rôles équivalents et variantes proches strictes. Les variantes
proches exigent plusieurs mots ; un prénom ou nom isolé ne suffit pas à déclencher
un rapprochement approximatif.

Le nommage dans l’entretien peut ouvrir un dialogue de rapprochement. Une
création automatique sans candidat exige notamment un nom spécifique admissible,
un locuteur non volontairement délié et un inventaire sans entretien indisponible.
Un rôle ou un libellé d’attente ne suffit pas à créer une personne.

L’utilisateur peut rapprocher, écarter ou reporter. Les refus sont mémorisés sur
les locuteurs et restent révocables depuis le répertoire. Ils ne constituent ni
une suppression de fiche ni une preuve que deux noms désignent des personnes
différentes dans tous les contextes.

Avant d’appliquer un dialogue, l’orchestration sauvegarde puis relit l’inventaire.
Elle vérifie que les locuteurs et leurs liens correspondent encore à l’aperçu.
Une réponse tardive ne doit jamais modifier le locuteur d’un autre entretien
ou écraser un nouveau choix.

## Reprise ponctuelle des informations

Un rapprochement peut proposer une reprise choisie de données locales. Cette
reprise concerne uniquement le locuteur cible présenté et les informations
retenues par le choix de reprise ; elle ne crée aucune synchronisation future.

Le pseudonyme, le rôle et les valeurs source et cible sont recontrôlés avant la
reprise. En cas de changement, le dialogue doit être rouvert. Les notes ne sont
pas copiées : leur affichage suit les liens existants vers les locuteurs.

## Regrouper ou séparer des fiches

Une fusion conserve une identité et son nom, réaffecte les locuteurs de la fiche
absorbée puis retire cette définition. Elle redirige aussi les refus et les
références de cas concernés. Elle refuse les regroupements produisant deux
locuteurs de la même personne dans un même entretien.

Une séparation crée une nouvelle définition puis y déplace les locuteurs choisis.
Au moins un locuteur doit rester sur la fiche d’origine.

Ces commandes exigent un inventaire complet et un aperçu encore frais. Les
transactions locales journalisent les états avant et après des entretiens
modifiés. Une reprise accepte ces états connus, pas une modification extérieure
divergente. Les écritures de définition sont ordonnées pour ne jamais supprimer
la fiche absorbée avant le remplacement de ses liens.

## Disponibilité distante : distinguer les méthodes et le parcours ouvert

La consultation du répertoire peut lire le miroir d’un corpus distant. En
revanche, **les commandes de personnes ne sont actuellement ouvertes ni sur
GitLab ni sur WebDAV** : `personnes.commande` est classé `indisponible` dans
`src/main/gitlab/politiqueGestes.ts`, et le dispatch IPC exige ce geste.

Le main contient déjà des branches de transactions WebDAV pour plusieurs
commandes : définition, liaison, refus, rapprochement, fusion et séparation.
Leur présence n’annule pas la garde exécutée avant le dispatch. Il ne faut donc
pas les documenter comme un parcours distant livré, ni retirer la garde pour
rendre un bouton actif sans qualification de l’ensemble.

L’édition locale des champs d’un locuteur dans une session d’entretien distante
reste distincte des commandes du répertoire. Une commande de personnes refusée
ne doit pas être contournée en écrivant directement le miroir.

Voir [gestes.md](../../distant/gestes.md) pour la politique commune.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Inventaire, invariants et commandes | `src/shared/corpus/personnes.ts` |
| Suggestions, refus et reprise | `src/shared/corpus/rapprochementsPersonnes.ts` |
| Persistance et corrections locales | `src/main/corpusStore.ts` |
| Journal des corrections multi-fichiers | `src/main/transactionsFichiers.ts` |
| Dispatch et gardes | `src/main/index.ts`, `src/main/gitlab/politiqueGestes.ts` |
| Transactions WebDAV présentes | `src/main/distant/transactions.ts` |
| Répertoire et dialogue | `src/renderer/components/traiter/corpus/PersonnesCorpus.vue`, `RapprochementCorpus.vue` |
| Propositions au nommage | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |

Tests principaux :

- `test/personnes.test.ts` : liens, homonymes, inventaire, fusion, séparation et reprise ;
- `test/rapprochementsPersonnes.test.ts` : suggestions et reprise de données ;
- `test/gitlab/politiqueGestes.test.ts` : disponibilité par fournisseur ;
- `e2e/personnes.e2e.ts`, `personnes-nommage.e2e.ts` et
  `rapprochements-personnes.e2e.ts` : parcours de base et propositions ;
- `e2e/personnes-conflits.e2e.ts`, `personnes-regroupement.e2e.ts` et
  `personnes-separation.e2e.ts` : corrections et conflits.
