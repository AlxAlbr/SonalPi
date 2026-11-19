# Personnes et rapprochements entre entretiens

L’onglet Locuteurs propose une vue transverse des interventions pour les corpus
locaux. Les corrections et les détails restent accessibles dans le répertoire
Personnes via « Détails et associations… ». La fiche porte un nom de référence ;
les libellés locaux, pseudonymes, valeurs et notes restent chez leurs propriétaires
dans chaque entretien.

## Consultation des interventions

`locuteursInventaire()` renvoie une projection compacte : liste unifiée,
participations, nombres de mots et de tours, positions des tours en pourcentage
du texte et positions d’ouverture dans l’éditeur. Aucune transcription ni corps
de note n’est transmis. Les ids natifs sont obligatoires ; aucune consultation
ne les complète. Les définitions sans participation restent dans
les détails, pas dans la liste principale.

`repertoireLocuteurs.ts` réunit les identités connues et conserve chaque locuteur
non lié comme une entrée distincte, sans filtrer son nom. Les homonymes et les
références absentes ne sont jamais fusionnés implicitement. Les noms locaux et
les titres d’entretien restent disponibles pour la recherche. Une source
illisible ne contribue ni à la liste ni aux comptes et reste signalée.

Le découpage réutilise `statistiquesLocuteurs` après extraction des paragraphes
enregistrés. Les marques ne séparent pas les mots ; les sauts de ligne conservent
leur place dans les coordonnées de l’éditeur. Comme le bilan d’entretien, la
projection compte les paragraphes de premier niveau, pas les autres blocs.

`LocuteursCorpus.vue` assure la sélection simple, multiple et par plage, le
clavier, la recherche et le filtre des entretiens. La recherche retire les
sélections masquées. Le retour depuis une intervention conserve la sélection ;
un changement de corpus la réinitialise. Les réponses tardives sont écartées.
Le rendu initial est borné à 200 locuteurs et 20 entretiens, avec accès explicite
aux suivants. Les barres sont dessinées sur canvas pour éviter un élément DOM
par tour. Les commandes précédente/suivante offrent une alternative au ciblage
visuel d’une petite intervention.

Les statistiques de cette vue portent sur les mots et les tours de la sélection,
sans pourcentage ni durée présentés comme mesurés. La nouvelle vue n’est pas
activée sur les corpus distants : ils conservent le répertoire existant.

## Inventaire et liens

`personnesInventaire()` rassemble les identités dans `locuteurs`, les présences
locales dans `participations` et les notes qui visent ces participations. Il ne transmet pas les transcriptions et
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
Délier pose `associationRetiree` pour empêcher une recréation automatique au nommage ;
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

## Corrections depuis la sélection corpus

`correctionsLocuteurs.ts` prépare trois nouvelles commandes, intégrées au store :

- `renommerGlobal` change le nom corpus et les noms de tous ses locuteurs ;
- `regrouperSelection` réunit plusieurs identités en une seule transaction,
  avec un choix explicite de conserver ou d’uniformiser les noms locaux ;
- `dissocierSelection` rend chaque participation choisie indépendante,
  sans créer de locuteur dans un entretien ni demander de nouveau nom.

La dissociation conserve les noms actuels et mémorise des refus entre les
identités devenues distinctes. Elle ne restaure pas d’anciens noms et ne transfère
pas les règles de cas aux nouvelles identités.

Ces commandes exigent un inventaire complet et un aperçu frais. Elles réutilisent
le journal des transactions locales, avec les définitions avant les liens lors
d’une dissociation et les liens avant le retrait des définitions absorbées lors
d’un regroupement. Les identifiants créés sont conservés dans le plan de reprise.

La vue `LocuteursCorpus.vue` les appelle par `CorrectionsLocuteursCorpus.vue`.
`apercusCorrectionsLocuteurs.ts` vérifie la sélection contre un inventaire frais,
présente toutes les participations et repère les conflits dans un même entretien.
La confirmation utilise cet instantané ; le store le recontrôle avant écriture.
Les choix de conservation ou d’uniformisation des noms sont explicites.

`useCorpus.corrigerLocuteurs()` attend la sauvegarde, refuse un changement de
contexte avant l’envoi et invalide les projections après réussite. La sélection
résultante est retrouvée par les références contextualisées des participations ;
la recherche est effacée pour ne pas masquer les entrées renommées ou dissociées.
Les dialogues prennent le focus sur Annuler et bloquent leur fermeture pendant
l’enregistrement. Les réponses tardives ne réinstallent pas un ancien aperçu.

Les participations sans identité commune restent temporairement corrigées par
l’accès historique « Ouvrir les associations », sans création silencieuse lors
de la préparation. La création universelle au nommage et le remplacement final
de ces détails restent à raccorder. Les anciennes commandes gardent leur comportement.

La garde contre une session encore en édition protège les appels hors parcours.
En local, le retour au corpus sauvegarde et ferme déjà l’entretien : aucune
fermeture supplémentaire ni resynchronisation générale n’est nécessaire pour les
corrections depuis le corpus. La réouverture relit les données corrigées.

### Renommage depuis l’entretien ouvert

`useRenommageLocuteurOuvert.ts` prépare le même aperçu pour une participation déjà
associée. Saisir un autre nom n’altère pas encore le modèle local : le dialogue
`RenommageLocuteurOuvert.vue` exige une confirmation explicite du périmètre global.
Les entrées sans association conservent pour l’instant leur parcours de nommage.

Avant l’envoi, `useEntretien` attend les identifications et saisies libres en cours,
vide la sauvegarde, bloque l’éditeur et suspend le debounce. Le point d’entrée
`renommerLocuteurDepuisEntretien` autorise seulement cette session locale ouverte ;
les commandes corpus continuent à refuser toute session ouverte, et une autre session
ouverte bloque aussi ce point d’entrée. Le même moteur transactionnel est utilisé.

La réponse est comparée au dernier payload sauvegardé : seuls les noms de l’identité
ciblée peuvent différer. Les objets de participation sont actualisés en place, sans
remplacer le document, les notes, les données, la sélection ni l’historique de frappe.
Les inverses de renommage local de ces participations sont retirés du journal ; ils
ne permettraient pas d’annuler la correction dans tous les autres entretiens.

Le main refuse les noms périmés d’une autosauvegarde de cette session ainsi que toute
écriture d’entretien en présence d’une transaction de fichiers encore active.
Une réponse perdue n’entraîne aucun rejeu : une relecture vérifiée des noms permet
la reprise. Si elle échoue ou révèle un autre changement du contenu, l’éditeur et
ses panneaux restent en lecture seule jusqu’à la réouverture du corpus. Quitter
cet état ne réenregistre pas l’ancien payload ; les dernières paroles avaient été
sauvegardées avant la correction. Les réponses d’une ancienne session sont écartées.

Les nouvelles corrections ne changent pas les droits distants : elles passent
par le même dispatch protégé que les autres commandes de personnes.

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
| Renommage global, regroupement multiple et dissociation indépendante | `src/shared/corpus/correctionsLocuteurs.ts` |
| Persistance et corrections locales | `src/main/corpusStore.ts` |
| Journal des corrections multi-fichiers | `src/main/transactionsFichiers.ts` |
| Dispatch et gardes | `src/main/index.ts`, `src/main/gitlab/politiqueGestes.ts` |
| Transactions WebDAV présentes | `src/main/distant/transactions.ts` |
| Projection compacte de consultation | `src/shared/corpus/locuteursCorpus.ts` |
| Liste, sélection et barres d’interventions | `src/renderer/components/traiter/corpus/LocuteursCorpus.vue`, `BarreInterventionsLocuteurs.vue` |
| Répertoire de détails et dialogue | `src/renderer/components/traiter/corpus/PersonnesCorpus.vue`, `RapprochementCorpus.vue` |
| Propositions au nommage | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |

Tests principaux :

- `test/locuteursCorpus.test.ts`, `test/locuteursCorpusRenderer.test.ts` : projection,
  absence de réécriture, sélection, navigation, limites de rendu et fraîcheur ;
- `e2e/locuteurs-corpus.e2e.ts` : consultation locale réelle, navigation et retour,
  homonymes et fichiers inchangés pendant la consultation ;
- `test/personnes.test.ts` : liens, homonymes, inventaire, fusion, séparation et reprise ;
- `test/rapprochementsPersonnes.test.ts` : suggestions et reprise de données ;
- `test/correctionsLocuteurs.test.ts` : nouvelles corrections locales,
  préservation des données, refus et reprise des opérations interrompues ;
- `test/gitlab/politiqueGestes.test.ts` : disponibilité par fournisseur ;
- `e2e/personnes.e2e.ts`, `personnes-nommage.e2e.ts` et
  `rapprochements-personnes.e2e.ts` : parcours de base et propositions ;
- `e2e/personnes-conflits.e2e.ts`, `personnes-regroupement.e2e.ts` et
  `personnes-separation.e2e.ts` : corrections et conflits.
