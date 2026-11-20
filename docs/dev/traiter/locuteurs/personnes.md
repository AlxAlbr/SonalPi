# Locuteurs du corpus et rapprochements entre entretiens

L’onglet Locuteurs propose une vue transverse commune aux corpus locaux et distants. Les corrections utilisent la sélection ; « Détails et vérifications… »
ouvre les notes, données et propositions sans masquer la liste ni ses interventions.
Le nom commun appartient au corpus ; pseudonymes, rôles, valeurs et notes restent
chez leurs propriétaires dans chaque entretien. L’ancien répertoire Personnes n’est
plus affiché. Les corrections corpus sont raccordées sur GitLab, pas encore sur
WebDAV ; voir [les garanties et limites par fournisseur](fournisseurs.md).

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

## Détails secondaires locaux

`DetailsLocuteursCorpus.vue` ne recrée pas un second répertoire. Les informations
et notes suivent la sélection courante. Les notes sont filtrées par couple
`{ entretienId, participationId }` : deux ids locaux identiques dans des entretiens
différents ne partagent pas leurs notes. L’ouverture des locuteurs et des notes
réutilise les accès contextuels existants.

`useCorpus.lireDetailsLocuteurs()` lit l’inventaire et les définitions actuelles des
variables et catégories, sans réutiliser un catalogue potentiellement périmé.
Les propositions, distinctions et identités sans entretien restent repliées.
Le rendu et la recherche de propositions sont bornés, avec élargissement explicite.
`detailsLocuteurs.ts` ne modifie ni les fichiers ni les associations à la lecture.

Les commandes locales supplémentaires utilisent `corrigerLocuteurs()` et le même
moteur transactionnel, après inventaire complet et confirmation :

- `individualiserSelection` crée une identité propre pour chaque voix sélectionnée
  sans identité valide, y compris après un retrait volontaire explicitement repris.
  Elle ne crée aucune participation ni parole et ne restaure pas les anciens liens ;
- `ecarterRapprochement` mémorise une distinction dans les deux sens, sans création ;
- `retablirRapprochement` retire les refus correspondants sur les membres des deux
  groupes, sans association et sans effacer les distinctions avec un tiers ;
- `reprendreInformations` copie seulement les champs choisis vers une participation
  d’un même locuteur dans un autre entretien. Source et données sont recontrôlées ;
  seules les valeurs de portée participation encore définies peuvent être choisies.
  Les valeurs existantes restent conservées, sauf choix explicite de remplacement ;
- `supprimerVide` vérifie les participations, cas et refus avant de retirer une
  définition sans usage. Les textes et notes ne sont pas supprimés.

Les régularisations créent les définitions avant les associations. Les refus,
reprises et suppressions suivent l’ordre des transactions existantes ; les états
capturés restent récupérables sans nouvelle allocation d’identifiants. Les sessions
ouvertes, lectures seules et préparations distantes restent refusées. Une erreur de
confirmation ne permet pas de répéter aveuglément l’écriture. Le contexte et les
préparations ont leurs propres gardes contre les réponses tardives.

La comparaison d’une proposition sélectionne les entrées dans la vue principale.
Les réunions, renommages et dissociations passent exclusivement par les confirmations
de sélection ; les formulaires locaux historiques de création, liaison, déplacement,
renommage de référence seul et séparation avec nouveau nom ne sont plus exposés.
La reprise ponctuelle reste accessible dans les détails, pas comme effet implicite
d’un regroupement. L’annulation d’une transaction ne constitue pas un Undo utilisateur.

## Inventaire et liens historiques distants

`personnesInventaire()` rassemble les identités dans `locuteurs`, les présences
locales dans `participations` et les notes qui visent ces participations. Il ne transmet pas les transcriptions et
signale les entretiens indisponibles. La vue peut ainsi montrer les locuteurs
non liés, les références invalides, les doublons dans un même entretien et les
propositions à vérifier.

L’ancien répertoire réservé aux corpus distants conserve les commandes suivantes :

- créer une définition seule ou une fiche liée à un locuteur ;
- lier, déplacer ou délier un locuteur ;
- renommer le nom de référence sans renommer les entrées locales ;
- supprimer une fiche vide, après vérification d’un inventaire complet.

La création liée historique écrit la définition avant son association. Si la seconde
écriture échoue, la fiche vide reste retrouvable et l’erreur est explicite. Le nommage
local décrit ci-dessous n’emprunte plus ce parcours : identité et association y sont
enregistrées dans une transaction unique.
Délier pose `associationRetiree` pour empêcher une recréation automatique au nommage ;
une liaison explicite retire ce marqueur.

## Suggestions et décisions

Les suggestions sont calculées depuis les noms et les rôles : noms normalisés
identiques, rôles équivalents et variantes proches strictes. Les variantes
proches exigent plusieurs mots ; un prénom ou nom isolé ne suffit pas à déclencher
un rapprochement approximatif.

En local, valider tout nom non vide dans l’entretien crée d’abord une identité
indépendante : rôles, noms génériques, caractère unique et « Nouveau locuteur »
validé explicitement sont admis. Ajouter l’entrée provisoire seule ne suffit pas.
La validation utilise Entrée, la sortie d’un champ modifié ou « Valider le nom ».
Une participation déjà associée passe au renommage global, pas à une nouvelle création.
Un retrait volontaire empêche toujours cette association automatique.

`identifierParticipationAuNommage` vérifie la seule session locale ouverte, le nom
sauvegardé et la participation avant de créer l’identité et son association ensemble.
Le même nommage répété retrouve l’identité enregistrée ; une transaction interrompue
conserve l’identifiant à reprendre. Aucune fiche vide supplémentaire n’est créée à
la nouvelle tentative. Une source étrangère indisponible n’empêche pas cette création
indépendante, mais diffère les suggestions et interdit tout rapprochement incomplet.

Une fois l’identité enregistrée, les suggestions peuvent ouvrir le dialogue. Leurs
heuristiques restent distinctes de l’admissibilité d’un nom : les libellés d’attente
et très courts ne déclenchent pas de demandes répétitives ; les rôles équivalents
peuvent être proposés avec un avertissement. Aucun de ces filtres ne bloque la création.
« Plus tard » garde l’identité indépendante et visible. Une nouvelle validation du
même nom déjà associé ne répète ni création ni proposition. Demander un renommage
abandonne les propositions encore en préparation sans annuler les créations ; son
aperçu attend la fin des nommages pour ne pas partir d’un inventaire intermédiaire.

L’utilisateur peut rapprocher, écarter ou reporter. Les refus sont mémorisés sur
les locuteurs et restent révocables depuis le répertoire. Ils ne constituent ni
une suppression de fiche ni une preuve que deux noms désignent des personnes
différentes dans tous les contextes.

Avant d’appliquer un dialogue, l’orchestration sauvegarde puis relit l’inventaire.
Elle vérifie que les locuteurs, associations et données correspondent encore à
l’aperçu. `rapprocherLocuteurDepuisEntretien` réunit explicitement les identités dans
la transaction existante, en retirant l’identité absorbée et en redirigeant cas et
refus. Une source encore sans identité rejoint celle qui vient d’être créée, sans
nouvelle définition. Les noms locaux sont conservés. Un conflit dans un même entretien
empêche toute écriture. Les refus ne suppriment ni ne recréent l’identité distincte.

Ces gestes attendent les saisies et sauvegardes, suspendent l’édition pendant la
transaction et n’actualisent que les associations et informations choisies après
vérification du payload complet. Le document et les objets de participation ne sont
pas remplacés. Le main refuse les sauvegardes aux anciennes associations. Une réponse
perdue entraîne une relecture, jamais un rejeu ; une relecture incertaine laisse
l’entretien en lecture seule jusqu’à réouverture du corpus. Les réponses tardives ne
modifient pas une autre session. La création automatique et ce raccord de rapprochement
restent locaux ; aucun nouveau geste distant n’est autorisé.

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

Les participations sans identité commune restent visibles indépendamment. Une
confirmation « Conserver séparément… » leur donne une identité propre, sans modifier
les autres voix sélectionnées. Aucun nom n’est demandé : il faut ouvrir l’entretien
si le nom actuel est vide. Consultation et préparation ne régularisent jamais
silencieusement les données. Les anciennes commandes restent nécessaires aux
fournisseurs et aux préparations, pas à la nouvelle interface locale.

La garde contre une session encore en édition protège les appels hors parcours.
En local, le retour au corpus sauvegarde et ferme déjà l’entretien : aucune
fermeture supplémentaire ni resynchronisation générale n’est nécessaire pour les
corrections depuis le corpus. La réouverture relit les données corrigées.

### Renommage depuis l’entretien ouvert

`useRenommageLocuteurOuvert.ts` prépare le même aperçu pour une participation déjà
associée. Saisir un autre nom n’altère pas encore le modèle local : le dialogue
`RenommageLocuteurOuvert.vue` exige une confirmation explicite du périmètre global.
Les entrées sans association passent au nommage automatique décrit plus haut,
sauf celles volontairement déliées, qui restent sans réassociation implicite.

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

Les corrections corpus disposent maintenant d’un dispatch dédié, avec gestes
précis et protection par fournisseur. Les opérations depuis l’entretien ouvert
restent locales pour ce nouveau raccord.

## Disponibilité distante : distinguer les méthodes et le parcours ouvert

La consultation commune peut lire la copie d’un corpus distant. Les nouvelles
corrections passent par `corpus:corrigerLocuteurs` et les gestes `locuteurs.*`,
ouverts sur GitLab avec éditions fermées. WebDAV reste en consultation.
**Les anciennes commandes de personnes restent refusées sur les deux distants** :
`personnes.commande` est classé `indisponible`, y compris par IPC direct.

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
| Suggestions, refus et reprise | `src/shared/corpus/rapprochementsLocuteurs.ts` |
| Renommage global, regroupement multiple et dissociation indépendante | `src/shared/corpus/correctionsLocuteurs.ts` |
| Persistance et corrections locales | `src/main/corpusStore.ts` |
| Journal des corrections multi-fichiers | `src/main/transactionsFichiers.ts` |
| Dispatch et gardes | `src/main/index.ts`, `src/main/gitlab/politiqueGestes.ts` |
| Transactions WebDAV présentes | `src/main/distant/transactions.ts` |
| Projection compacte de consultation | `src/shared/corpus/repertoireLocuteurs.ts` |
| Liste, sélection et barres d’interventions | `src/renderer/components/traiter/corpus/LocuteursCorpus.vue`, `BarreInterventionsLocuteurs.vue` |
| Détails secondaires locaux et projection | `src/renderer/components/traiter/corpus/DetailsLocuteursCorpus.vue`, `src/shared/corpus/detailsLocuteurs.ts` |
| Anciens composants conservés en attente du nettoyage | `src/renderer/components/traiter/corpus/PersonnesCorpus.vue`, `RapprochementCorpus.vue` |
| Propositions au nommage | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Vérification des associations et données relues | `src/shared/entretien/identificationLocuteurs.ts` |
| Sauvegarde, suspension et actualisation ciblée | `src/renderer/composables/useEntretien.ts` |

Tests principaux :

- `test/detailsLocuteurs.test.ts`, `test/detailsLocuteursRenderer.test.ts` : notes
  contextualisées, régularisation, refus réciproques, réexamen, copie choisie,
  dépendances, aperçus périmés et réponses tardives ;
- `e2e/locuteurs-details.e2e.ts` : consultation sans écriture, notes sans mélange,
  suppressions protégées et régularisation explicite des anciennes entrées ;
- `test/nommageLocuteurs.test.ts`, `test/nommageLocuteursRenderer.test.ts` : création
  sans exclusions, identité avant proposition, refus, retrait, reprise, concurrence,
  droits et absence de doublons après interruption ;
- `e2e/locuteurs-creation-nommage.e2e.ts` : validation explicite, homonymes indépendants,
  réunion sans fiche vide, réponse perdue et réouverture après relecture refusée ;
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
