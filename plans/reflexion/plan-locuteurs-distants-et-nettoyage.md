# Locuteurs distants et nettoyage du vocabulaire interne

## 1. Point de départ : comparer pour préciser, sans choisir une architecture

**Statut : réalisation en cours. Analyse D0 effectuée ; consultation commune
raccordée et corrections corpus GitLab et WebDAV implémentées. Reprise WebDAV et
interface qualifiées sur les deux bancs. Les trois parcours depuis une session
GitLab sont raccordés ; session WebDAV et nettoyage final restent à réaliser.** Le lot local B1–B5 est clôturé
dans `43a14d8`, sans réouverture de sa qualification générale.

La comparaison avec les thématiques est une **question de départ**, pas une
orientation validée. Elle peut aider à comprendre les données touchées et les
garanties nécessaires. Elle peut aussi conduire à constater que les services
thématiques ne conviennent pas aux locuteurs. Les deux conclusions sont recevables.

### Ce qui se ressemble et diffère déjà en local

| Action | Thématiques | Locuteurs |
|---|---|---|
| Renommer | Modifie la définition dans le corpus ; les codages utilisent son id. | Le renommage global modifie la définition et les noms des participations associées dans les entretiens. |
| Supprimer | Peut retirer les codages après confirmation explicite. | La suppression d’une identité corpus exige son absence d’usages ; supprimer une voix dans un entretien laisse ses paroles sans attribution et constitue un autre geste. |
| Réunir | Réaffecte des codages et traite leurs éventuels doublons. | Réaffecte des participations, cas et refus, sans toucher au texte ni aux codages ; deux voix d’un même entretien ne peuvent pas être réunies. |
| Diviser / dissocier | Répartit les codages concernés. | Rend des participations indépendantes, sans découper ni réattribuer leurs paroles. |
| Enregistrer plusieurs fichiers | Les opérations globales utilisent le moteur de transactions de fichiers. | Les corrections corpus utilisent ce même moteur, avec leurs propres mutations et validations. |

**Constat limité :** une partie de l’infrastructure locale est déjà commune,
mais ni les règles métier ni tous les parcours d’enregistrement ne sont identiques.
Cela ne démontre pas que les opérations distantes doivent partager les services,
les journaux ou l’enchaînement des thématiques.

Commencer par décrire chaque geste Locuteurs à partir de son comportement local,
puis examiner les garanties distantes nécessaires. La comparaison est utile si
elle précise une question concrète ; elle n’est pas un passage obligé pour toute
l’implémentation et ne justifie pas, à elle seule, une mutualisation.

### Objectif fonctionnel, indépendant de cette question technique

Utiliser la même interface Locuteurs en local, sur GitLab et sur Nextcloud,
ouvrir les corrections distantes effectivement protégées, puis retirer le panneau
historique et les anciens noms techniques Personnes.

Le découpage proposé plus bas reste à confirmer par l’analyse des gestes. Les
corrections qui retirent une identité et celles depuis un entretien ouvert sont
des points à examiner, pas une estimation acquise de la difficulté du chantier.

Références :

- [Lot local et interface cible](plan-refonte-locuteurs-corpus.md).
- [Modèle natif Locuteur / ParticipationLocuteur](plan-unification-locuteurs-participations.md).
- [Qualification locale acquise](../../docs/dev/traiter/locuteurs/qualification.md).
- [Thématiques par fournisseur](../../docs/dev/traiter/thematiques/fournisseurs.md).
- [Politique des gestes](../../docs/dev/distant/gestes.md).
- [GitLab](../../docs/dev/distant/gitlab.md) et [WebDAV](../../docs/dev/distant/webdav.md).

## 2. État initial avant le raccord

### Métier et interface

- Le format natif 10 est commun aux trois stockages : `corpus.locuteurs`,
  `entretien.participations`, références contextualisées et refus structurés.
- Les corrections locales possèdent déjà leurs validations, aperçus et règles
  dans `contratsLocuteurs.ts`, `correctionsLocuteurs.ts`, `identitesLocuteurs.ts`
  et `apercusCorrectionsLocuteurs.ts`.
- `LocuteursCorpus.vue` et `DetailsLocuteursCorpus.vue` portent la cible locale.
  `LocuteursCorpus.vue` affiche encore `PersonnesCorpus.vue` en distant.
- Le nommage, le renommage global depuis l’entretien et la relecture ciblée sont
  raccordés localement ; leurs points d’entrée main refusent explicitement le distant.

### Fournisseurs et permissions

- `personnes.commande` est actuellement **indisponible sur les deux distants**.
- WebDAV annonce pourtant la capacité générale `locuteurs`. Cette discordance
  n’autorise aucune écriture : la garde main reste prioritaire.
- `src/main/distant/transactions.ts` contient des méthodes historiques de création,
  liaison, refus, rapprochement, fusion, séparation et suppression d’identité vide.
  Elles ne constituent ni une ouverture publique ni la garantie attendue du lot local.
  Certaines signalent une application partielle et la création liée peut laisser
  une définition créée si l’association échoue.
- Ces méthodes WebDAV ne sont pas une implémentation GitLab. Le dispatch existant
  ne doit pas être rendu accessible par simple retrait du refus générique.

**Conséquence :** conserver le métier commun, réutiliser les transports et remplacer
les branches historiques insuffisantes ; ne pas remettre les anciens formulaires
à disposition pour contourner le raccord de la nouvelle interface.

## 3. Questions que la comparaison peut aider à préciser

Cette liste sert à examiner l’existant, pas à imposer sa réutilisation.

| Besoin Locuteurs | Question à examiner dans l’existant |
|---|---|
| Renommer globalement | Quelle publication peut protéger ensemble la définition et les noms locaux, contrairement au simple renommage d’un thème ? |
| Supprimer une identité vide | Quels contrôles de suppression de définition restent adaptés en ajoutant participations, cas et refus ? |
| Réunir des identités | La réaffectation puis la finalisation thématiques répondent-elles réellement aux dépendances des identités, ou faut-il un parcours distinct ? |
| Dissocier | Quels mécanismes assurent des ids stables et des associations cohérentes sans reprendre la logique de division des codages ? |
| Préparer un aperçu | Quels lecteurs et contrôles de fraîcheur conviennent aux sources nécessaires aux locuteurs ? |
| Reconnaître une interruption | Quels services de publication et de reconnaissance peuvent être utilisés sans importer le journal métier des thématiques ? |

Fichiers à consulter pour répondre à ces questions, sans engagement de partage :

- `src/main/operationsThemes.ts`, `ipcOperationsThemes.ts` : cycle des aperçus,
  validation et dispatch par fournisseur.
- `src/main/gitlab/apercusThemes.ts`, `operationsThemes.ts`, `journalThemes.ts` :
  inventaire à un SHA, publication gardée et réconciliation des commits.
- `src/main/distant/apercusThemesWebDAV.ts`, `operationsThemesWebDAV.ts`,
  `journalThemesWebDAV.ts` : lectures directes avec ETags forts et reprise des lots.
- `src/main/gitlab/transactions.ts` et `src/main/distant/transactions.ts` :
  définitions, sources protégées et corrections courtes.

**Limite importante de l’analogie :** les fusions thématiques retirant leur source
sont ouvertes sur GitLab, pas sur WebDAV. La suppression directe d’une définition
inutilisée existe sur les deux, mais ne prouve pas la sûreté d’une réaffectation
multi-fichiers suivie d’une suppression. La fusion des locuteurs sur Nextcloud
nécessite donc une démonstration propre avant son ouverture.

Distinguer trois niveaux : les règles métier Locuteurs déjà établies, les services
généraux de transport et de publication, et les services propres aux thématiques.
La présence de services généraux utilisables ne justifie pas le partage du troisième
niveau. Ne pas copier les classes thématiques ni extraire préventivement un moteur
générique « toutes opérations globales ». Une solution propre aux locuteurs reste
possible si elle s’appuie sur le transport existant et répond mieux aux besoins.

## 4. Invariants non négociables

1. **Même métier partout.** Pas de modèle distant parallèle, de nouveau format
   natif prévu, d’adaptateur de stockage ancien ni de synchronisation générale.
2. **L’intention reste explicite.** Homonymes distincts, rôle jamais déduit du nom,
   retrait volontaire et refus respectés. Aucune création pendant une consultation
   ou un aperçu ; aucune réparation silencieuse d’une référence invalide.
3. **Conserver les données.** Ids de participation, index de paragraphes, texte,
   annotations, notes, couleurs, rôles, pseudos et valeurs ne changent pas hors
   champs annoncés par la commande. Les notes restent liées par entretien et id local.
4. **Le serveur fait foi pour écrire.** Le miroir peut servir à une consultation
   explicitement datée, jamais à conclure qu’un inventaire distant est complet ou
   qu’une correction peut être publiée. Aucun repli vers une écriture locale.
5. **Droits par geste.** Réseau, compte autorisé, consultation, sessions, versions
   et capacité réelle du fournisseur sont contrôlés côté main, même par IPC direct.
6. **Aucun faux succès global.** Une opération inachevée est indiquée comme telle.
   Une réponse inconnue n’est ni un échec certain ni une invitation à réessayer.
7. **Pas d’Undo inventé.** La reprise termine ou reconnaît une publication ; elle
   ne fournit pas une annulation globale des corrections.
8. **Pas de contournement des bornes.** Actions GitLab, volume HTTP, nombre de
   fichiers et durée des réservations sont vérifiés avant l’envoi. Refuser un
   dépassement plutôt que découper implicitement une opération indivisible.

## 5. Périmètre fonctionnel et découpage des gestes

La cible est la parité des parcours utiles, pas la réouverture de toutes les
anciennes variantes `creer`, `modifier`, `fusionner`, `separer` ou `lier`.

| Parcours cible | Sources à contrôler | Écritures possibles |
|---|---|---|
| Liste, interventions, statistiques et détails | Inventaire lisible ; bilan incomplet si nécessaire. | Aucune. |
| Renommer globalement | Définition, membership et tous les membres associés. | Corpus et noms locaux des membres. |
| Conserver séparément / dissocier | Sélection, associations et dépendances nécessaires aux distinctions. | Nouvelles définitions, associations et refus concernés. |
| Supprimer un locuteur sans entretien | Tout le membership, cas et refus. | Corpus seulement, si aucun usage ne subsiste. |
| Garder distincts / réexaminer | Groupes concernés et refus correspondants dans les deux sens. | Participations portant les décisions. |
| Reprendre des informations | Source, cible, identité commune et définitions des variables. | Champs explicitement choisis dans la cible. |
| C’est le même locuteur | Inventaire complet, conflits de même entretien, cas et refus de tiers. | Associations, cas, refus, noms selon choix et retrait des définitions absorbées. |
| Valider un nom dans l’entretien | Participation et session autorisée, définitions fraîches. | Identité indépendante et association ; suggestions ensuite. |
| Renommer / rapprocher depuis l’entretien | Session courante et dépendances de la correction globale. | Même résultat métier que depuis le corpus. |

Déclarer des gestes précis, par exemple `locuteurs.renommer`, `locuteurs.regrouper`,
`locuteurs.dissocier`, `locuteurs.supprimer-vide`, `locuteurs.distinction`,
`locuteurs.reprendre-informations` et `locuteurs.identifier-au-nommage`.
Ces noms sont proposés, pas déjà présents dans la politique.

Les capacités visibles doivent découler de ces gestes. Ne pas passer toute la
famille `personnes.commande` en autorisée pour ouvrir une première action.

## 6. Publication et reprise : garanties à établir

Les points suivants décrivent les garanties recherchées et les contraintes des
fournisseurs. Ils ne valident ni un service d’opérations commun avec les thématiques,
ni un découpage définitif des publications. L’analyse initiale doit préciser le
parcours le plus simple qui satisfait ces garanties pour chaque geste.

### Préparer sans écrire

L’aperçu distant lit les sources serveur nécessaires, leurs versions et les
obstacles. GitLab utilise un instantané à un SHA ; WebDAV associe contenu et ETag
fort au même GET et vérifie la stabilité du corpus après l’inventaire.

La confirmation porte sur la commande, ses choix et ces sources. Une recherche,
un filtre ou une sélection partielle dans l’interface ne réduit jamais les
contrôles nécessaires à une suppression ou à une réunion.

### Publier les candidats métier

Appliquer les fonctions communes à des copies validées. Préparer seulement les
fichiers réellement modifiés, en distinguant ceux à écrire de ceux à protéger
pour prouver l’absence d’usages ou la stabilité d’une source.

- **GitLab :** utiliser baux, file du contexte, publieur et journal existants.
  Privilégier un commit gardé pour une correction bornée qui doit rester indivisible.
  Un lot fractionné éventuel doit avoir un protocole explicite de finalisation,
  pas hériter automatiquement du mode thématique « entretiens observés libres ».
- **WebDAV :** réutiliser les providers et les publications conditionnelles.
  Ne pas promettre une transaction multi-fichiers atomique. Les définitions
  nécessaires précèdent les nouveaux liens ; les définitions absorbées restent
  présentes tant que toutes leurs références ne sont pas traitées et vérifiées.
- Pour les deux : conserver dans une intention durable les ids nouveaux avant
  leur première publication, puis réutiliser ces mêmes ids à la reprise.
  Le miroir n’est installé qu’à partir des contenus confirmés.

La finalisation d’une réunion doit prouver qu’aucune participation, règle de cas
ou distinction ne reste sur une identité retirée. Un balayage final sans protection
contre une nouvelle référence concurrente ne constitue pas cette preuve.
Examiner aussi les publications de session, imports et autres commandes qui
pourraient créer une référence pendant l’opération, pas seulement les deux boutons
engagés dans la correction.

Pour WebDAV, établir cette protection avec les mécanismes existants ou un ajout
strictement ciblé, avant d’autoriser la réunion. Si cela exige un changement du
format partagé ou une infrastructure générale, demander une décision de périmètre ;
ne pas l’introduire discrètement au titre d’un simple nettoyage.

### Reconnaître une interruption

Distinguer refus avant publication, progrès partiel confirmé, résultat inconnu
et opération terminée. L’intention appartient à la destination exacte : compte,
serveur, projet ou racine, branche lorsqu’elle existe, corpus et opération.

Une coupure déclenche une reconnaissance du contenu accepté, sans nouvel envoi
aveugle. La reprise relit les sources, conserve les acquis et refuse les contenus
extérieurs inattendus. Elle ne compense jamais en réinstallant un ancien corpus
ou un ancien entretien par-dessus le travail d’un autre poste.

Identifier le suivi nécessaire pour chaque geste et le responsable déjà adapté,
s’il existe. Ne pas décider par analogie de réutiliser un journal thématique ou
d’en créer un nouveau pour tous les gestes. Toute extension doit être justifiée
par les états à reconnaître et à reprendre. Les versions d’enveloppe des journaux
restent indépendantes de la version native des documents.

## 7. Entretien ouvert : raccord séparé, pas contournement

Livrer d’abord les corrections depuis le corpus, avec les éditions nécessaires
fermées. Une session tenue par notre poste n’autorise pas son écrasement ni un
second verrou pris sur le même entretien.

Le raccord depuis l’entretien doit ensuite :

- terminer les saisies et sauvegardes récentes, publier par la session autorisée
  et expliquer un éventuel refus ; ne jamais publier le travail d’un autre poste ;
- suspendre temporairement les modifications et l’autosauvegarde concurrente ;
- articuler le droit déjà tenu avec les droits corpus et les autres sources,
  sans attente circulaire liée à un ordre d’acquisition incompatible ;
- appliquer après confirmation seulement les champs attendus en place, sans
  recharger le document, les notes, la sélection ni l’historique de frappe ;
- empêcher une sauvegarde retardée de rétablir l’ancien nom ou l’ancien lien ;
- rester en lecture seule si la relecture finale est incertaine et ignorer toute
  réponse d’une session ou d’un corpus remplacé.

Au nommage, tous les noms non vides restent admissibles. L’identité est indépendante
avant toute proposition ; une relance ne doit pas créer une deuxième définition.
Sur WebDAV, une définition publiée avant un échec de liaison est un état à reconnaître
et à reprendre avec le même id, pas une création à recommencer. Les suggestions ne
commencent qu’après confirmation de l’identité et de son association.

Ne pas étendre le renommage local d’une étiquette associée en solution de repli
quand le renommage global distant n’est pas encore disponible.

## 8. Étape d’analyse puis lots de réalisation proposés

### D0 — Préciser les gestes avant de choisir les mécanismes

- [x] Partir des commandes locales : données lues, données modifiées, dépendances et sessions nécessaires.
- [x] Comparer seulement les points utiles avec les thématiques et les transactions distantes générales.
- [x] Séparer les constats du code, les garanties manquantes et les hypothèses d’implémentation.
- [x] Proposer pour chaque famille le chemin le plus simple : service général existant,
  adaptation ciblée ou parcours propre aux locuteurs ; ne pas présumer un service métier partagé.
- [x] Fixer les premiers choix de publication et séparer les raccords GitLab et WebDAV.

**Sortie :** une note courte précisant ce que la comparaison a éclairci, ce qui
peut être repris et ce qui doit rester distinct. Elle peut conclure à ne pas
réutiliser les services thématiques. Pas de framework ni de refonte préalable des
thématiques pour produire cette analyse.

### D1 — Inventaire distant fiable et consultation commune

- [x] Raccorder la liste, les interventions, statistiques et détails aux deux fournisseurs.
- [x] Distinguer vue miroir consultable et aperçu serveur autorisant une correction.
- [x] Afficher les indisponibles et l’état incomplet, sans création ni réservation d’écriture.
- [x] Fixer les gestes et le contrat commun d’aperçu, résultat et reprise.

**Sortie :** consultation cible qualifiée sur les deux fournisseurs, sans changement
de données ni ouverture implicite des commandes historiques.

### D2 — Corrections bornées depuis le corpus

- [x] Livrer renommage global, individualisation et dissociation.
- [x] Livrer suppression d’une définition réellement inutilisée.
- [x] Livrer distinctions réciproques et reprise d’informations explicitement choisie.
- [x] Réutiliser les mutations locales ; fournir versions, réservations et reprise distantes.
- [x] Ouvrir chaque geste seulement après ses tests ciblés, avec refus main et UI cohérents.

**Sortie :** résultats identiques au local pour ces actions, sessions requises fermées,
ids stables après interruption et aucune donnée étrangère modifiée.

### D3 — Réunion complète et finalisation des références

- [x] Ajouter la réunion multiple, les deux politiques de noms et le refus des conflits.
- [x] Rediriger cas et distinctions, y compris ceux hors sélection.
- [x] Qualifier la finalisation GitLab sous les bornes du publieur.
- [x] Démontrer la protection de finalisation WebDAV avant ouverture de la réunion.
- [x] Vérifier coupure avant et après chaque phase, réponse inconnue et modification de tiers.

**Sortie :** aucune identité absorbée retirée prématurément, aucun succès global
annoncé pour un résultat partiel. Si WebDAV reste bloqué par une garantie manquante,
le geste demeure indisponible et la limite est explicitement arbitrée.

### D4 — Nommage et corrections depuis l’entretien ouvert

**Livré :** les trois gestes sont qualifiés sur GitLab et les deux variantes
Nextcloud, en conservant le droit courant. Une ancienne protection native non
identifiable n’est pas forcée automatiquement après un redémarrage.

- [x] Raccorder création indépendante au nommage, renommage global et rapprochement confirmé.
- [x] Intégrer sauvegarde, publication de session et application sélective du résultat.
- [x] Protéger les sauvegardes retardées, changements de contexte et relectures incertaines.
- [x] Qualifier le même compte sur deux postes et deux comptes concurrents.

**Sortie :** parcours cohérent avec le local, sans perte de saisie ni acquisition
concurrente sur une session déjà détenue.

### D5 — Retrait historique et nomenclature

- [x] Supprimer `PersonnesCorpus.vue` et `RapprochementCorpus.vue`, désormais sans appelant.
- [x] Supprimer le composable `commanderPersonnes` et les branches WebDAV inaccessibles du dispatch historique.
- [x] Remplacer `src/shared/corpus/personnes.ts` par l’inventaire pur `inventaireLocuteurs.ts` ;
  appeler directement `identitesLocuteurs.ts` pour les mutations, sans alias métier.
- [x] Terminer le retrait des méthodes fournisseur uniquement utilisées dans les tests historiques.
- [x] Harmoniser la lecture store, composables, IPC, preload et tests sous
  `inventaireIdentitesLocuteurs`, ainsi que `revisionLocuteursCorpus` et `inventaireLocuteursCas`.
- [x] Terminer le retrait des commandes, de `personnesCommander` et des fixtures associées.
- [x] Supprimer les anciennes commandes et relais sans appelant plutôt que garder des alias.
- [x] Actualiser documentation développeur, aide, capacités publiques et références de scripts.

**Sortie :** un seul parcours fonctionnel, un seul vocabulaire technique courant,
pas de couche de compatibilité de renommage. Les références V1, citations historiques
et le mot courant « personne » restent légitimes ; ne pas les remplacer globalement.
Les données persistées et les journaux existants ne sont pas renommés à l’aveugle.

La présence d’une ancienne commande distante jamais ouverte n’impose pas de la
recréer pour supprimer son composant. Le retrait porte sur la couverture utile
réellement livrée, avec capacités et éventuelles limites explicites.

## 9. Qualification proportionnée et clôture

### Vérifier au fil des lots

Réutiliser les assertions métier locales et ajouter uniquement les garanties du
transport : sources fraîches, versions, droits, publication, reprise et installation.
Tester les appels IPC directs autant que les boutons. Chaque lot reçoit ses tests
unitaires et simulés ciblés ; pas de rejeu général systématique à chaque ajustement.

Matrice minimale à couvrir sur les parcours concernés :

- succès et refus sans écriture ; consultation seule et hors ligne ;
- édition tenue ailleurs, y compris même compte sur deux machines ;
- source ou membership modifié après l’aperçu ; cas et refus ajoutés par un tiers ;
- expiration ou perte de droit, conflit de version et contexte remplacé ;
- interruption après première publication et réponse serveur perdue ;
- reprise sans doublon d’identité, sans réécriture d’un succès ni perte de données ;
- refus des sources indisponibles pour toute preuve qui exige l’inventaire complet ;
- cas volumineux au seuil du transport, avec refus clair au-delà de la borne.

### Bancs réels : courts et représentatifs

Qualifier GitLab, Nextcloud A avec `files_lock` et Nextcloud B avec verrous
conditionnels ; ne pas déduire un fournisseur de l’autre. Préparer les bancs avec
`preparer_bancs_docker`, sans téléchargement ni re-provisionnement, et exécuter les
scénarios réels séquentiellement.

Pour chaque famille nouvellement ouverte : un succès de bout en bout, une collision
entre deux postes et une reprise représentative. Grouper les scénarios lorsque la
même préparation suffit ; conserver les résultats acquis d’un lot inchangé.

Après D5, effectuer **une validation finale bornée** : typage, build, tests des
appels renommés et quelques parcours Electron local/distant. Les tests de transport
déjà passés ne sont rejoués que si le nettoyage a réellement touché leur exécution.

### Définition de terminé

- [x] Les choix techniques résultent de l’analyse des gestes, pas d’une analogie supposée avec les thématiques.
- [x] La matrice par geste indique ce qui est livré sur les deux fournisseurs.
- [x] Les garanties de D2–D4 sont établies pour les actions ouvertes ; aucune garde retirée sans remplacement.
- [x] `PersonnesCorpus.vue` et les relais historiques inutiles sont retirés ; les noms techniques courants sont harmonisés.
- [x] Les comportements locaux restent identiques et le format natif reste inchangé.
- [x] L’aide et les confirmations décrivent les conséquences, pas les mécanismes de transport.
- [x] Un bilan court conserve résultats, limites et exclusions sans masquer les échecs.

Les 21 échecs transversaux reproduits avant le lot B et les lenteurs de l’éditeur
fortement annoté restent dans leurs chantiers respectifs. Ne pas les reprendre ni
multiplier les campagnes générales pour clôturer ce raccord distant.

## 10. Premier raccord GitLab réalisé — historique de `d7ab9d1`

### Résultat de l’analyse D0

Les règles métier restent dans les fonctions Locuteurs existantes. Aucun service,
contrat d’opération ou journal de thématiques n’est repris. La préparation commune
`preparationCorrectionsLocuteurs.ts` valide des sources complètes fournies par le
transport et produit des candidats sans lire ni modifier le miroir.

GitLab permet une première solution simple : un seul commit avec les gardes des
fichiers et les droits, au-dessus de `TransactionsGitLab`, du publieur et du journal
de publication généraux. Il n’est pas nécessaire de fractionner les réaffectations
comme les opérations thématiques. La contrepartie est une borne explicite de
124 entretiens protégés ; aucune découpe implicite n’est autorisée au-delà.

WebDAV ne fournit pas ce commit multi-fichiers. Les anciennes méthodes ne sont donc
pas rouvertes par analogie : le raccord de ses publications et de sa reprise reste
à construire et qualifier. Le nommage et les corrections depuis une session ouverte
restent également un raccord distinct, pas une exception aux nouvelles gardes.

### Ce qui fonctionne actuellement

- La vue commune remplace l’affichage historique pour la consultation distante.
  Elle indique la provenance de la copie et la date de synchronisation ; Actualiser
  utilise le tirage courant et conserve le dernier résultat si le serveur échoue.
- Les détails et leurs catalogues passent par une lecture unique. Les notes restent
  contextualisées, y compris lorsque plusieurs entretiens ont les mêmes ids locaux.
- Les aperçus de correction GitLab lisent tous les membres à un même SHA, sans bail
  ni écriture. Une source invalide bloque la préparation, sans repli sur le miroir.
- Les huit corrections corpus passent par `corpus:corrigerLocuteurs` et des gestes
  `locuteurs.*` explicites. GitLab est ouvert ; WebDAV reste refusé. L’ancienne entrée
  `personnes.commande` reste indisponible sur les deux fournisseurs.
- Les éditions locales protégées ou récupérables bloquent la correction. Le commit
  protège aussi les membres inchangés ; le miroir n’est installé qu’après confirmation.
- Une réponse inconnue reste journalisée, interdit une nouvelle correction et est
  reconnue avant le tirage suivant, sans rejouer le commit.

### Vérifications acquises

Tests unitaires et simulés ciblés réussis : une série de **157 tests sur dix fichiers**,
puis **121 tests sur cinq fichiers** pour les derniers contrôles et l’ajustement du
dépôt simulé au constructeur actuel des erreurs GitLab. Ces totaux se recouvrent et
ne doivent pas être additionnés. Typage de l’application et des tests ciblés, build
et contrôles d’espaces passent.

Deux scénarios backend GitLab réel sont validés : refus d’une édition tierce puis
renommage conservant les données ; aperçu périmé refusé puis réunion et suppression
d’une définition réellement vide. Un parcours Electron OAuth valide la consultation,
les notes, le renommage depuis la sélection, les contenus serveur et le refus de
l’ancien appel direct. Onze scénarios Electron locaux de sélection, détails et
renommage depuis l’entretien passent aussi.

Aucune campagne générale n’est relancée. La qualification des écritures Nextcloud,
les parcours de D4 et la suppression finale des anciens noms ne sont pas revendiqués.
Ce premier raccord est livré par son commit dédié. Les étapes restantes restent
ouvertes. Le [bilan par fournisseur](../../docs/dev/traiter/locuteurs/fournisseurs.md)
décrit les nouvelles entrées et les limites actuelles.

## 11. Raccord WebDAV réalisé

Les huit corrections corpus sont maintenant ouvertes sur Nextcloud, sans réactiver
les anciennes commandes. Le protocole propre aux locuteurs utilise les mutations
communes, les transports et les deux providers de droits existants. Il ne réutilise
ni le contrat ni le journal métier des thématiques.

La correction réserve le corpus et tous les membres, relit les sources complètes
avec ETags forts et publie chaque candidat sous `If-Match`. Les droits et les contenus
sont vérifiés avant la suite. Les nouvelles définitions précèdent les associations ;
les définitions absorbées restent présentes jusqu’à la finalisation des participations,
cas et refus. Aucun nouveau format partagé n’est introduit.

Le journal privé est lié à la racine et au compte. Il fixe les ids et candidats
avant envoi. Un résultat inconnu impose une vérification sans PUT, puis une reprise
explicite ; une source extérieure modifiée est conservée, jamais écrasée. L’arrêt
d’un progrès connu demande confirmation et ne compense aucune écriture acceptée.
Un résultat encore inconnu ne permet pas de clôturer le suivi.

Bornes explicites : 100 entretiens, 32 Mio de sources, 128 Mio de journal. Le panneau
de suivi empêche une autre correction et suspend les tirages automatiques pendant
la reconnaissance et la reprise. Les sessions ouvertes ou récupérables restent
bloquantes ; le raccord de D4 n’est pas contourné.

Qualification ciblée : six scénarios backend réels sur Nextcloud A et B, couvrant
les collisions intercomptes et interpostes, le renommage, la recréation du service
après réponse perdue, la réunion interrompue, les références des cas et des tiers
et la suppression vide. Deux parcours Electron réels valident la vue commune,
les notes, la reconnaissance sans renvoi du succès et l’arrêt confirmé conservant
les étapes acceptées. Les tests simulés couvrent notamment les trois phases de
dissociation avant et après acceptation. Typage application/tests et build restent
vérifiés par une série ciblée, sans nouvelle campagne générale. La série de dix
fichiers passe avec 214 tests ; les derniers ajouts passent séparément avec 26 tests
WebDAV et 26 tests suivi/politique. Ces séries se recouvrent. Le parcours Electron
GitLab commun a été rejoué avec succès après le raccord du suivi WebDAV.

**D4 et D5 restent ouverts.** Le nommage distant et les corrections depuis un
entretien ne sont pas activés ; les composants et anciens noms Personnes ne sont
pas encore supprimés. Voir le [bilan fournisseur](../../docs/dev/traiter/locuteurs/fournisseurs.md).

## 12. Simplification locale avant le raccord de l’entretien distant

À la demande de l’utilisateur, la gestion locale revient à la saisie directe :
les boutons « Valider le nom » et « Renommer… » sous les champs sont retirés.
Entrée ou la sortie du champ modifié enregistrent le nom. Si l’identité est associée
à d’autres entretiens, l’aperçu exige toujours confirmation ; pour le seul entretien
courant, la même transaction protégée s’exécute directement, sans dialogue préalable.

L’inventaire complet, le contrôle de fraîcheur, la sauvegarde, le gel temporaire,
la protection des autosauvegardes et la reconnaissance des réponses perdues restent
en place. Une source indisponible ne justifie jamais de conclure que l’entretien
est le seul concerné. Les erreurs restent visibles et ne provoquent aucun rejeu.
Le focus revient au champ après annulation d’un renommage partagé.

Aucun état « renommé / pas renommé » n’est ajouté. L’association désigne une identité
commune, pas une validation du nom ; toutes les voix restent visibles au corpus et
utilisables avant leur premier renommage. Homonymes distincts, retraits volontaires,
rôles et autres données restent inchangés. D4 n’est pas activé par cette simplification.

Validation ciblée : 17 parcours Electron locaux passent, plus le parcours d’aide
avec capture de la gestion actualisée. Les tests unitaires ciblés, le typage de
l’application et des tests modifiés, ainsi que le build passent. La qualification
locale B5 n’est pas rouverte et les bancs distants inchangés ne sont pas rejoués.

## 13. Premier raccord de l’entretien : renommage GitLab

Le geste précis et la capacité `renommageLocuteurOuvert` sont ouverts pour GitLab,
indépendamment de la création au nommage, qui reste locale. Le parcours simplifié
est conservé : saisie directe pour un seul entretien et confirmation si d’autres
entretiens sont associés. Aucun ancien canal de personnes n’est rouvert.

L’aperçu construit l’inventaire depuis les sources serveur et le candidat sauvegardé
de la seule session autorisée, dont la base publiée est vérifiée. Il ne publie rien.
À la confirmation, seules les saisies de cette session sont publiées ; la correction
réutilise son droit, prend ceux du corpus et des autres membres, puis publie un
commit gardé. Le droit prêté n’est ni acquis une seconde fois ni rendu à la fin.
La session adopte la version confirmée et les sauvegardes anciennes sont refusées.

Le journal de session conserve avant envoi l’opération et l’empreinte attendue.
Une issue inconnue garde la copie et suspend l’édition. La fermeture peut reconnaître
le commit, sans le renvoyer, puis permettre la réouverture ; le redémarrage ne restaure
pas le candidat ancien par-dessus le résultat confirmé. Une modification extérieure
inattendue reste bloquante, sans écrasement. Le format natif ne change pas.

Deux scénarios backend GitLab réels valident les comptes concurrents, le même compte
sur un autre poste, le maintien du droit, les saisies suivantes et la réponse perdue
reconnue sans rejeu. Le parcours Electron OAuth valide aussi l’aperçu annulé sans
publication, le texte récent, le renommage partagé et la publication suivante.
Onze parcours Electron locaux restent validés après la séparation des permissions.
Les tests simulés couvrent notamment l’intention avant envoi, les aperçus périmés,
les appels forgés, les sauvegardes anciennes et le redémarrage après confirmation.
Typage et build restent contrôlés de façon ciblée.

D4 n’est pas clôturé : poursuivre création et rapprochement depuis la session GitLab,
puis le raccord WebDAV avec son propre droit et sa reprise. D5 reste ouvert.

## 14. Création et rapprochement depuis une session GitLab

La création au nommage et le rapprochement sont raccordés par leurs gestes précis.
Leur capacité est séparée du renommage et aucune commande historique n’est rouverte.
Le métier commun est extrait dans `nommageLocuteurs.ts` et réutilisé en local comme
dans la préparation distante, sans autre modèle ni format natif.

La création protège uniquement le corpus et la voix courante. Elle ne ferme ni ne
publie les autres entretiens, même tenus par un autre poste ou un autre compte.
Le nom doit correspondre au candidat sauvegardé ; les retraits volontaires restent
bloquants. Toute identité déjà confirmée est retrouvée sans génération ni envoi.
Les homonymes sont indépendants et le rôle n’est jamais déduit d’un nom.

Le rapprochement garde l’inventaire complet, les autres éditions fermées et les
contrôles de conflit dans un même entretien. Les cas et refus de tiers sont redirigés
et la définition absorbée est retirée dans le même commit. Les noms locaux sont
conservés ; seules les données explicitement choisies sont reprises.

Les suggestions et leur confirmation utilisent un inventaire serveur frais avec
le candidat de la session autorisée, sans publication pendant sa consultation.
Un échec de lecture des propositions après une création confirmée ne transforme
pas cette création en échec. Les sauvegardes anciennes ne peuvent rétablir les liens
antérieurs. Réponses inconnues et redémarrages gardent le candidat reconnu, sans
nouvel id ni nouvelle réunion automatique.

Qualification ciblée : deux nouveaux scénarios backend GitLab réels couvrent les
comptes et postes concurrents, la création avec une autre édition tenue, le refus
du rapprochement avant sa libération, la saisie suivante et les réponses perdues
sur les deux gestes. Le parcours Electron OAuth étendu vérifie l’identité indépendante
sur le serveur avant confirmation, la réunion sans copie non demandée puis sa
sauvegarde suivante. Onze parcours Electron locaux passent. Les séries unitaires
et simulées de 85 puis 102 tests se recouvrent ; typage et build sont vérifiés.

La suite de D4 concerne WebDAV, avec réutilisation du droit de la session et reprise
propre au protocole multi-fichiers. Vérifier notamment les requêtes encore en cours
après une réponse inconnue et la protection des références jusqu’à reconnaissance,
avant d’étendre les écritures depuis une session. D5 reste ouvert.

## 15. Protection d’une requête WebDAV encore en cours

La préparation du raccord de session a révélé une lacune dans le suivi corpus :
les droits étaient rendus après une réponse inconnue, alors que le PUT pouvait
encore aboutir. Le scénario « réponse perdue après acceptation » ne couvrait pas
ce retard avant acceptation, en particulier lors du retrait final d’une identité.

La protection conditionnelle du corpus est désormais conservée jusqu’à reconnaissance.
Sa preuve est enregistrée avant envoi dans le journal privé. Un autre poste ne peut
pas publier de nouvelles références pendant l’attente. Après recréation du service,
seule l’image acceptée et la même protection peuvent être reconnues. La protection
ancienne est rendue conditionnellement ; les publications suivantes doivent acquérir
de nouveaux droits. Aucun héritage, aucun forçage ni nouveau format natif.

Une réponse de libération perdue ne rejoue pas une étape déjà reconnue. Les suivis
anciens dépourvus de preuve acquièrent une protection neuve pour la reconnaissance ;
ils ne concluent jamais à un refus depuis la seule absence du candidat. Une protection
remplacée reste bloquante sans suppression d’un droit tiers.

Les publications ordinaires vérifient également les références d’associations et
de distinctions vers les identités présentes. Un ancien payload ne peut ainsi
réintroduire une identité retirée, même par appel direct. Une fixture d’anonymisation
a été complétée avec la définition native de son locuteur déjà référencé.

Quatre scénarios backend réels ciblés sur Nextcloud A et B vérifient finalisation
retardée et réponse perdue après acceptation, blocage du poste concurrent et reprise
après recréation du service. Deux parcours Electron Nextcloud passent aussi.
La série simulée ciblée passe avec 89 tests sur six fichiers ; typage application,
typage strict ciblé et build passent. Pas de nouvelle campagne générale.

Cette correction est un préalable de D4, pas l’ouverture du nommage depuis une
session Nextcloud. Son droit courant, sa copie éditable et son retour à la reprise
restent à intégrer. D5 reste ouvert.

## 16. Livraison des corrections depuis une session Nextcloud

Les trois gestes de D4 utilisent maintenant le droit courant et le métier commun.
L’aperçu n’envoie pas le candidat ; la confirmation publie les saisies récentes,
prête le droit à la correction puis adopte le contenu et l’ETag confirmés comme
nouvelle base. Il n’y a ni second verrou, ni fermeture/réouverture artificielle,
ni rechargement du document. Le renderer applique sélectivement les champs attendus
et suspend le tirage automatique pendant ce retour.

La création indépendante protège seulement le corpus et l’entretien courant : les
éditions étrangères et les autres éditions locales peuvent rester ouvertes. Le
renommage et le rapprochement exigent les autres éditions locales fermées, puis
protègent l’inventaire complet. Les autres comptes et postes restent bloquants.
Une nouvelle tentative d’identification conserve l’identité déjà confirmée ; la
réunion ne copie aucune information non choisie.

Le suivi privé enregistre l’origine de la session et sa trace locale. Une correction
engagée mais interrompue suspend l’édition. Fermer rend le droit sans publier l’ancien
candidat ; vérifier depuis le corpus puis reprendre ne renvoie pas les étapes acceptées.
Après redémarrage, l’ancienne trace ne peut être écartée que si toutes ses saisies
correspondent au contenu déjà publié ou au candidat fixé. Les saisies différentes
restent protégées ; après une correction terminée, elles gardent la récupération
ordinaire. La suppression d’un verrou conditionnel exige sa même identité et son
ETag. Un droit natif ne distingue pas les postes du même compte : il n’est jamais
forcé automatiquement, et une protection survivante peut bloquer la reprise jusqu’à
sa libération ou son expiration.

Qualification proportionnée : **167 tests sur neuf fichiers**, dont **14 scénarios
simulés de session**, **quatre scénarios backend réels** et **deux parcours Electron**
sur Nextcloud A et B. Les scénarios backend couvrent le même compte sur deux postes,
un autre compte, les trois gestes, les saisies après correction et deux réponses
inconnues successives. Les parcours Electron vérifient annulation sans publication,
création avant proposition, réunion sans copie implicite, poursuite des saisies,
fermeture puis vérification/reprise sans doublon. Les premiers essais ont corrigé
deux attentes de recette : annotations comparées après la saisie récente, et perte
de réponse ciblée sur la correction plutôt que sur sa sauvegarde préalable.

Typage applicatif, typage strict des tests modifiés et build passent. Aucun rejeu
général ni push. **D4 est clôturé ; D5 reste à réaliser.**

## 17. Premier lot de retrait historique

`PersonnesCorpus.vue` et son unique sous-composant `RapprochementCorpus.vue` sont
supprimés : aucun chemin actif ne les importe. Le composable `commanderPersonnes`,
qui n’avait plus d’autre appelant, est supprimé aussi. Le main ne conserve plus les
branches WebDAV situées après le refus systématique de `personnes.commande` ; ce
canal demeure refusé sur les deux distants.

Le module `personnes.ts` est remplacé par `inventaireLocuteurs.ts`, limité aux types
et à la projection pure `inventorierLocuteurs`. Les relais vers création, renommage,
association, regroupement, séparation et suppression sont supprimés, pas renommés
en alias : le store et les tests appellent les fonctions de `identitesLocuteurs.ts`
directement. Les préparations GitLab, WebDAV et les types renderer/preload utilisent
le nouveau module. `revisionPersonnesCorpus` devient `revisionLocuteursCorpus` sur
tous ses appelants, sans modifier les données persistées.

La documentation courante passe de `personnes.md` à `corpus.md`, avec liens et carte
du code corrigés. Deux fichiers de tests deviennent `identitesLocuteursStore.test.ts`
et `suggestionsLocuteurs.test.ts`. Un test de retrait interdit la réapparition des
trois anciens fichiers et des relais dans le module d’inventaire ; une projection
avec homonymes et notes contextualisées est vérifiée sans mutation des sources.

Qualification ciblée : **184 cas sur 14 fichiers**, dont une attente du nouveau
test de notes corrigée avant validation ; **six parcours Electron locaux** sur la
consultation, les détails et les corrections IPC. Typage applicatif, typage strict
des tests concernés, build et vérification des espaces passent. Les qualifications
distantes acquises ne sont pas rejouées pour ce retrait de composants et d’imports.

**D5 reste ouvert.** Migrer les fixtures qui utilisent les anciens points d’entrée
`personnesInventaire` et `personnesCommander`, puis retirer leurs commandes et les
méthodes WebDAV sans appelant applicatif. Harmoniser les derniers noms actifs à
cette occasion, sans réintroduire de relais de compatibilité. Les inverses des
journaux déjà persistés et les références V1 restent inchangés. Aucun commit ni push.

## 18. Fixtures indépendantes et correction corpus directe

Les tests de corrections, détails et nommage appellent maintenant le geste courant
plutôt que `personnesCommander`. Leurs préconditions synthétiques utilisent un
constructeur de données natives, `test/fixtures/identitesLocuteurs.ts`, validées avant
écriture. Ce constructeur n’émule pas les anciennes commandes et n’ajoute aucune API
de test à la production. Les homonymes restent indépendants ; index, noms locaux,
notes, rôles et données sont conservés. Une fixture invalide est refusée avant
toute écriture.

Le point d’entrée public `CorpusStore.corrigerLocuteurs()` contrôle lui-même le droit
d’écriture avant le moteur privé. La variante autorisant une session précise reste
privée et n’est accessible qu’après les vérifications du renommage ouvert. Le dispatch
IPC local des corrections appelle directement ce point d’entrée, sans détour par
l’ancienne commande générique. Les tests de lecture seule sont conservés et passent.

L’ancien `TransactionsCorpus.creerPersonneDepuisLocuteur()` et son helper en deux
transactions sont supprimés. Ses deux recettes utilisent désormais le vrai contexte
de session : création sous droit courant, puis refus sur un entretien tenu par un
tiers sans définition vide. Les autres anciennes méthodes restent à retirer.

Les recettes Electron de consultation, corrections de sélection, détails et création
au nommage n’utilisent plus l’ancienne commande pour préparer leurs données. Le
constructeur d’import natif commun est également migré, avec remappage des références
de refus. Les scénarios d’import V1 restent distincts ; leur fixture de refus est
alignée sur les objets natifs actuels, sans adaptateur de format.

Qualification proportionnée : **104 tests ciblés sur six fichiers** et **19 parcours
Electron locaux**, incluant quatre recettes de retrait de variante utilisant le
constructeur natif commun. Trois recettes de nommage ont été reprises isolément
après correction de leur préparation : elles tentaient une création depuis une
seconde session locale alors que la session testée était déjà ouverte. Les gardes
n’ont pas été assouplies ; leurs données de départ sont maintenant installées comme
fixtures natives. Typage applicatif, typage strict des fichiers concernés et build
passent. Aucun rejeu distant général, commit ou push.

**D5 reste ouvert :** migrer les anciennes recettes et les tests de journal, retirer
le reste des commandes historiques puis harmoniser le dernier point d’entrée de
lecture. Ne pas renommer les formats de journaux ou les références V1 à l’aveugle.

## 19. Retrait du point d’entrée de lecture historique

`inventaireIdentitesLocuteurs()` remplace `personnesInventaire()` dans le store,
le canal IPC, le preload, les déclarations renderer et tous les appelants de tests
et recettes. L’ancien accès est supprimé sans alias ni double implémentation.
Le résultat conserve les mêmes identités, participations, notes et indisponibles.
Les composables utilisent `lireIdentitesLocuteurs` ; l’inventaire des cas s’appelle
`inventaireLocuteursCas`. La consultation reste sans droit d’écriture ni réparation.

Une garde vérifie l’absence de l’ancien nom dans le prototype du store. Une recette
Electron vérifie aussi son absence dans le preload et dans les handlers main, ainsi
que la présence du nouveau canal. Les analyses de synthèse et les créations de cas
sont qualifiées par leurs véritables parcours.

Cinq préparations de recettes supplémentaires — synthèse, cas, lots de cas, notes
contextualisées et renommage ouvert — passent aux fixtures natives sans ancienne
commande. Les tests de journal ne génèrent plus leurs préconditions avec
`personnesCommander` : ils installent explicitement les anciens inverses et leurs
états natifs. Les cinq cas gardent le contrôle des deux annulations successives,
du marqueur volontaire, des saisies sans rapport, de la volatilité, d’un changement
extérieur et des refus contextualisés. Les noms de leurs formats restent inchangés.

Qualification ciblée : série de **151 tests sur onze fichiers**, complétée par les
**six gardes de retrait** et la migration V1 ; **cinq tests de lecture d’anciens
inverses** sont requalifiés après migration de leurs fixtures. Ces séries se
recouvrent et ne s’additionnent pas. **Treize parcours Electron locaux** passent.
Le typage strict des fichiers modifiés corrige aussi des fixtures incomplètes :
auteur d’annotation, inventaire sans notes ou indisponibles, callback de capacité
manquant et type de payload d’import V1. Les données et types des fixtures sont
corrigés sans assouplir les gardes. Typage applicatif et build passent ; aucun rejeu
distant général.

**D5 reste ouvert :** retirer `personnesCommander`, son union de commandes et les
méthodes WebDAV encore utilisées par les anciens tests. Migrer les dernières
recettes de préparation, puis faire la validation finale bornée. Aucun commit ni push.

## 20. Retrait final et clôture de D5

`personnesCommander` est supprimé du store, du main, du preload et des déclarations
renderer. Le type `CommandeLocuteurs`, ses anciennes variantes et les helpers de
création, refus, rapprochement, fusion, séparation et suppression WebDAV sont retirés.
Aucun alias ne les remplace. `personnes.commande` n’est plus un geste connu, même en
local. La capacité générique `locuteurs` disparaît aussi au profit des capacités
précises déjà qualifiées. Les gardes de prototype, preload et handlers IPC vérifient
explicitement ces absences.

Les dernières fixtures passent aux définitions et associations natives. Les tests
locaux de réunion, dissociation, reprise et suppression appellent les commandes
courantes avec inventaire attendu. La dissociation garde le nom local, sans ancienne
option de nouveau nom ; une distinction n’est plus confondue avec une création
implicite. Les tests de l’ancienne création partielle sont remplacés par la garantie
transactionnelle du nommage courant : un refus avant transaction ne laisse aucune
définition vide. Leurs assertions restent cohérentes avec les parcours livrés.

Les tests de méthodes distantes jamais ouvertes sont retirés avec ces méthodes,
pas utilisés pour justifier leur conservation. Les garanties utiles restent dans
`correctionsLocuteursWebDAV.test.ts` et `webdav/locuteursSession.test.ts` : protections
fraîches et ordonnées, définition avant référence, retrait après usages, droits
concurrents, versions, progrès reconnu et reprise sans doublon. L’écriture courte
générique garde ses tests de lecture fraîche, tiers, divergence et prêt de session,
avec une modification de pseudonyme plutôt qu’une ancienne commande de liaison.
Les autres transactions de cas, valeurs et pseudonymisation ne sont pas retirées.

Les dix fichiers de recettes `personnes*.e2e.ts` et `rapprochements-personnes.e2e.ts` prennent des
noms `locuteurs-*.e2e.ts`, sans doublons ni chemins de scripts encore actifs. L’aide
générale de la vue corpus est réécrite pour retirer les anciens formulaires, corriger
le lien des cas et expliquer la vérification puis la reprise sans relance aveugle.
Le champ
interne de rapprochement et celui des origines de correspondances deviennent
`locuteurRef`. Le choix de reprise garde un seul type, `ChoixRepriseParticipation`.
Les ids, paragraphes, formats natifs, journaux de publication et anciens inverses
restent inchangés. Les références V1 et le vocabulaire humain légitime sont conservés.

### Validation finale bornée

- **323 tests sur quatorze fichiers** passent sur les points modifiés : métier,
  store, journal, retrait d’API, politique, sessions simulées GitLab et WebDAV,
  publication et reprise. Les derniers contrôles de capacité sont vérifiés séparément ;
- **22 parcours Electron locaux** passent, avec regroupement, dissociation,
  propositions, choix de données, noms indépendants, inventaire périmé et IPC direct ;
- **un parcours Electron GitLab réel** et **un parcours Electron Nextcloud B réel**
  passent après nettoyage : consultation, trois gestes de session, sauvegarde et
  reprise. Les résultats séparément acquis sur Nextcloud A restent conservés,
  sans rejouer ses transports inchangés ;
- Typage applicatif, typage strict des fichiers concernés, build et espaces passent.
  Aucun seuil n’est abaissé ; aucune campagne générale n’est relancée.

Les réserves restent explicites : la publication Nextcloud est suivie, pas atomique
sur plusieurs fichiers ; un envoi inconnu conserve sa protection et n’est pas répété ;
un ancien droit natif ambigu n’est pas forcé automatiquement. Les bornes de volume
et les inventaires complets restent obligatoires. Les 21 échecs transversaux déjà
reproduits avant le lot B et les lenteurs d’éditeur annoté restent hors de ce chantier.

**D0–D5 sont clôturés.** Aucun commit, push, changement de version, tag ou release
n’est effectué sans demande explicite.
