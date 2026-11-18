# Unifier les identités : Locuteur et ParticipationLocuteur

## Statut et articulation

**Statut : lot A en cours d’implémentation et de qualification ; format actif 9.**

Le modèle cible 10, ses noyaux métier et des préparations privées sont présents.
Les usages migrent progressivement vers les références stables de participation,
avec des adaptateurs temporaires pour le stockage 9. Le format 10 n’est pas activé,
la bascule générale et le lot B ne sont pas terminés. Le bilan détaillé figure en
section 9 ; les décisions et critères de fin ci-dessous restent applicables.

Ce chantier clarifie le modèle interne et ses références. Il est distinct de la
refonte visuelle décrite dans
[le plan de l’onglet Locuteurs](plan-refonte-locuteurs-corpus.md).

La nouvelle vue de consultation est conservée. Le vocabulaire cible et la
stratégie de compatibilité sont fixés ci-dessous pour éviter de multiplier les
chemins Personnes/Locuteurs. L’inventaire des références et les contrats ont
précédé l’adaptation des usages ; les anciens chemins encore actifs doivent être
retirés à la bascule coordonnée.

La V2 n’a pas encore d’utilisateurs hors testeurs. La compatibilité prioritaire
est la migration des données V1 vers V2, pas celle de toutes les versions
intermédiaires de développement V2.

### Décisions validées

- Adopter un format V2 versionné cohérent avec `Locuteur` et
  `ParticipationLocuteur`, sans traduction permanente des anciens noms.
- À l’import V1, créer une participation et sa propre identité corpus pour chaque
  locuteur de chaque entretien. Aucun rapprochement automatique, même à nom égal.
  L’utilisateur pourra regrouper les identités ensuite.
- Réutiliser l’import des fichiers produits par la V1, sans ajouter de réparation
  générale, de noms provisoires ni de rapport persistant. Une anomalie réellement
  observée sera traitée à partir de son fichier source, pas de scénarios de
  corruption hypothétiques.
- Adapter les corpus exemples fournis avec l’application et leur installation.
  Les testeurs pourront recréer leurs autres corpus V2 ; aucune migration générale
  des formats V2 de développement n’est requise.
- Dans les nouveaux parcours, dissocier crée des identités distinctes plutôt que
  des participations nommées sans identité commune. Les déliaisons historiques
  demandent un traitement explicite, sans réassociation silencieuse.
- Séparer l’unification technique à comportement conservé et l’activation des
  nouveaux comportements de l’interface en deux lots qualifiés indépendamment.

Le [relevé technique associé](inventaire-unification-locuteurs-participations.md)
cartographie les frontières, fixe les contrats de champs et précise les tests à
compléter. La cible technique est le format natif **10**, distinct de la version
applicative. Le lot porte sur les identités, la conservation des données V1 et
les exemples livrés, pas sur un système de réparation des fichiers sources.
Aucun changement de format, de version applicative ou de politique distante
n’est effectué par la rédaction de ces documents.

## 1. Objectif et modèle cible

L’utilisateur emploie « locuteur » dans le corpus, les entretiens, les cas et les
analyses. Le code distingue l’identité commune de ses informations contextuelles,
sans conserver deux noms concurrents pour une même identité.

| Concept cible | Responsabilité | Correspondance initiale |
|---|---|---|
| `Locuteur` | Identité commune au corpus, identifiant et nom de référence. | `Personne`. |
| `ParticipationLocuteur` | Présence dans un entretien, identifiant local stable, index référencé par les paragraphes, nom local, rôle, pseudonyme, couleur et variables locales. | `Locuteur`. |
| `LigneRepertoireLocuteurs` | Ligne calculée pour afficher les participations et leurs statistiques ; jamais enregistrée comme identité. | Projection actuellement nommée `LocuteurCorpus`. |
| `Cas` | Unité d’étude réunissant des matériaux par règles et ajouts manuels. | `Cas`, sans changement de sens. |

On supprime le concept interne nommé Personne en reprenant sa responsabilité,
pas en supprimant les identités communes. Une égalité de noms ne devient jamais
une égalité d’identifiants.

Les noms restent locaux lorsqu’un regroupement conserve explicitement les
variantes ; les décisions de renommage global du plan d’interface restent
applicables. Les rôles, pseudonymes et variables ne deviennent pas globaux.

L’import V1 crée directement les participations et leurs identités distinctes
dans le modèle cible. Il conserve les données locales et les attributions de
parole sans altérer le contenu des sources V1. Le renommage de sauvegarde du
`.crp` après réussite reste celui du parcours existant. Aucune identité n’est
partagée sur la seule base d’un nom, d’un rôle ou d’un pseudonyme.

Dans les nouveaux parcours, chaque participation nommée reçoit une identité
corpus ; une dissociation lui donne une identité distincte. Une entrée provisoire
non encore nommée reste un état séparé. Le lot technique ne transforme pas
silencieusement les associations absentes ou volontairement retirées des données
historiques qui seraient reprises.

Une référence de participation porte l’identifiant de l’entretien et celui de la
participation. L’index utilisé dans le texte n’est pas cet identifiant. Les ids
existants sont conservés ; les ids manquants des données effectivement reprises
sont complétés de manière stable avant publication, jamais recréés à la lecture.

## 2. Cas : parler de locuteurs sans confondre les concepts

Les règles qui sélectionnent aujourd’hui des personnes sélectionneraient les
**interventions de locuteurs**. Exemples d’interface :

- « Créer un cas à partir de locuteurs » ;
- « Interventions des locuteurs sélectionnés » ;
- « Inclure les interventions où ces locuteurs posent les questions ».

Un cas ne devient pas un locuteur : il peut réunir plusieurs locuteurs, des
entretiens entiers, des matériaux déterminés par une modalité ou des ajouts
manuels. Conserver ses familles, attributs, recettes et repères de passage.

Les règles référencent les identités communes du corpus. Leur résolution retrouve
les participations et les interventions dans chaque entretien. Le rôle enquêteur
reste évalué sur chaque participation, pas sur une propriété globale du locuteur.

Pour une première unification, préserver exactement les passages résolus avant et
après conversion. Ne pas profiter du renommage pour modifier les règles d’union,
les exclusions, les attributs dérivés ou les conséquences d’une dissociation.

## 3. Point de départ constaté avant implémentation

Le changement est transversal, pas un remplacement de libellés :

- `CorpusFichier.personnes` référence des `Personne` ;
- `EntretienFichier.locuteurs` contient les actuels `Locuteur`, avec leur
  `personneRef` et leur index dans les paragraphes ;
- les règles de cas utilisent `personneId` et les variantes `personne/personnes` ;
- Synthèse et Lexico conservent des identifiants de personnes et des références
  locales de locuteurs, qui ne désignent pas la même chose ;
- les notes visent les identifiants des locuteurs locaux ;
- les refus de rapprochement peuvent viser une personne ou un locuteur local ;
- les journaux, plans de reprise, imports, exports et politiques distantes
  utilisent également ces types ou leurs références ;
- les nouvelles commandes de correction coexistent encore avec les anciennes,
  et les deux écrans restent accessibles pendant la construction.

Le format courant est versionné et possède déjà des migrations. Toute évolution
des structures enregistrées doit passer par ce mécanisme, pas par une réécriture
silencieuse à la consultation.

### Résultats du premier inventaire

- Le format natif courant est **9**. Les anciens formats sont promus dans
  plusieurs chemins de lecture : changer uniquement la constante ne suffit pas
  pour une évolution structurelle.
- Les imports V1 local et GitLab convergent vers
  `CorpusStore.preparerImportEntretien()`. La création des identités distinctes
  doit appartenir à cette préparation, pas au parseur sans contexte corpus.
- `completerIdsLocuteurs()` complète déjà les ids locaux absents de manière
  stable depuis l’entretien et l’index. Préserver les valeurs existantes et
  qualifier ce mécanisme plutôt que recréer les ids à chaque lecture.
- Les filtres Synthèse/Lexico et le journal d’annulation corpus repérés restent
  en mémoire. Les plans de transactions locales et suivis de migration GitLab
  sont persistés et demandent, eux, une garde de compatibilité à la reprise.
- L’exemple annoté fourni contient **neuf participations avec ids stables,
  sans aucune identité commune**. Son adaptation comprend la création de neuf
  identités distinctes, sans fusion des libellés récurrents.
- La migration locale conserve le contenu V1 mais renomme son `.crp` en
  `.crp.sauvegarde-v1` après ouverture réussie du corpus cible. Cette politique
  n’est pas modifiée par l’unification.

Les fichiers concernés, les contrats techniques et la matrice de tests sont
consignés dans le [relevé technique](inventaire-unification-locuteurs-participations.md).

## 4. Invariants de conservation

- Réutiliser les identifiants existants, sans recréer les identités depuis les noms.
- Préserver les identifiants locaux des participations et les attributions des
  paragraphes. Le champ historique `loc` désigne un index local, jamais un id corpus.
- Ne pas convertir les liens de notes en liens vers une identité commune : ils
  continuent à viser les participations dans leur contexte.
- Conserver les noms locaux, rôles, couleurs, pseudonymes et valeurs existants.
- Conserver la distinction entre une participation sans identité commune et un
  passage sans attribution de parole. Les filtres actuels `sansPersonne` et
  `sansLocuteur` ne peuvent pas être fusionnés par simple renommage.
- Préserver les refus et les retraits volontaires d’association.
- Préserver les cas, familles, attributs, repères et recueils des données reprises,
  ainsi que la sémantique des filtres. Ne pas inventer une migration de filtres
  persistés lorsque les parcours concernés ne conservent que des états de session.
- Préserver l’interdiction actuelle de réunir deux participations d’un même entretien.
- Ne pas régulariser implicitement des données V2 historiques sous prétexte de
  renommer les types. L’import V1 suit la règle explicite de création d’une
  identité distincte par participation ; ce n’est pas un rapprochement.
- Une consultation ou une source illisible ne doit provoquer aucune suppression.
- Aucune identité n’est supprimée automatiquement faute de participations.
  Vérifier ses références, notamment dans les cas, filtres et refus.
- Bloquer une correction si des données indisponibles empêchent d’en garantir
  la cohérence ; définir les exigences de complétude pour chaque commande.

## 5. Organisation du code cible

### Modèle et projections

Une seule définition métier de `Locuteur`, une seule définition de
`ParticipationLocuteur`, des projections explicitement nommées comme telles.

Renommer la projection actuelle en `LigneRepertoireLocuteurs` et placer son calcul
dans un module de projection. Ne pas enrichir la ligne d’affichage jusqu’à en
faire un troisième modèle propriétaire des données.

### Commandes et persistance

Un ensemble cohérent de commandes pour identifier, associer, renommer, regrouper,
dissocier et supprimer une identité vide. Les deux écrans appellent les mêmes
opérations. Leurs fonctions élémentaires et leurs préconditions sont communes.

Éliminer la dépendance circulaire de types entre `personnes.ts` et
`correctionsLocuteurs.ts`. Les contrats ne dépendent pas de leur implémentation.
Réutiliser les transactions locales existantes plutôt que créer un autre moteur.

Migrer les appelants puis retirer les anciennes commandes devenues inutiles.
Conserver une traduction de compatibilité seulement lorsqu’un véritable format
historique ou un journal récupérable l’exige, avec une responsabilité explicite.

### Interface

Un écran Locuteurs, des composants de détails pour notes, valeurs et corrections.
Ne pas conserver durablement l’écran Personnes entier imbriqué dans le nouveau.
La consultation et les droits distants doivent rester explicites pendant la
transition, sans ouvrir de commandes non qualifiées.

## 6. Compatibilité des données : stratégie retenue

### Format cible V2

Faire évoluer le format enregistré pour porter directement les concepts cibles.
La cible est le format natif 10 pour corpus et entretiens. Les collections,
références, portées de variables et refus sont fixés dans le relevé technique.
Les formats natifs de développement 1 à 9 ne sont pas des formats de lecture
promis par cette cible : les refuser avant toute écriture, sans repli vers V1.
Ne pas maintenir les noms historiques dans le métier ou le stockage pour préserver
toutes les versions de développement V2.

L’inventaire couvre aussi les échanges entre processus, commandes, journaux,
opérations inverses, plans de reprise, imports, exports et frontières distantes.
Toute conversion effectivement prise en charge doit prévoir interruption et
reprise sûre. Un format non pris en charge doit être refusé explicitement,
jamais interprété comme un corpus vide ni réécrit silencieusement.

### Migration V1 vers V2

Adapter la migration V1 pour produire directement le modèle cible. Chaque
locuteur de chaque entretien devient une participation avec sa propre identité
corpus, même si son nom existe ailleurs. Les regroupements restent des décisions
ultérieures de l’utilisateur.

Qualifier la conservation des noms locaux, rôles, pseudonymes, couleurs,
variables, attributions de parole, notes et autres références effectivement
importées. Tester les homonymes entre entretiens et au sein d’un entretien,
ainsi que les locuteurs sans intervention. Le contenu des sources V1 est conservé.
Le parcours local garde le renommage du `.crp` en sauvegarde après réussite ;
le chantier n’ajoute aucune autre modification aux sources.

Réutiliser le parseur existant. L’évolution attendue est la création d’une
identité distincte par locuteur importé, sans changer la lecture des noms, des
rôles et des valeurs. Zéro et une attribution absente restent sans locuteur ;
les index non consécutifs et les homonymes sont conservés tels quels.

Le chantier ne construit pas de récupération générale des sources malformées,
ne fabrique pas de noms provisoires et n’ajoute pas de rapport d’import persistant.
Les contrôles et erreurs existants restent en place. Si un fichier réellement
produit par la V1 révèle un défaut, ajouter un test de reproduction et une
correction ciblée, sans élargir implicitement le chantier.

### Exemples et corpus de développement V2

Adapter les corpus exemples livrés, leur génération éventuelle, leurs tests et
les parcours d’installation, d’ouverture et de réinitialisation. L’exemple annoté
actuel comporte neuf participations sans identité commune : lui attribuer neuf
identités distinctes dans les fichiers fournis, sans fusion des noms récurrents.
Si un exemple comporte des regroupements intentionnels, les préserver plutôt que
leur appliquer la politique d’import V1 comme une remise à zéro.

Les testeurs recréeront leurs autres corpus V2. Il n’est pas demandé de migration
générale des corpus, filtres et états persistants des versions intermédiaires.
Documenter cette limite et les moyens de recréation disponibles. La nouvelle
version doit détecter une copie d’exemple ou un corpus de format incompatible
sans l’écraser silencieusement.

Les essais se font sur des copies synthétiques ou autorisées, jamais sur les
corpus personnels de travail.

Attention aux identifiants homonymes dans le code : l’actuel `personneId` devient
l’id du locuteur commun, tandis que l’actuel `locuteurId` désigne souvent une
participation. Aucune substitution globale de chaînes ne peut distinguer ces
sens. Même précaution pour les refus `personne:…` et `locuteur:…`.

Pour tout corpus effectivement converti, reconnaître ou terminer ses transactions
et journaux avant la conversion, ou la bloquer explicitement. Une ancienne
intention ne doit pas réintroduire des références incompatibles après conversion.
L’absence d’obligation de reprise des corpus de test n’autorise pas à ignorer un
journal actif ou à modifier partiellement leurs fichiers.

## 7. Étapes de mise en œuvre

### Lot A — Unification technique et migration V1

1. **Inventaire des références — premier relevé réalisé.** La cartographie des
   types, propriétaires, frontières, données persistantes et exemples figure dans
   le document associé. Compléter ce relevé si d’autres appelants sont découverts,
   sans élargir implicitement la compatibilité aux anciennes versions V2.
2. **Contrats fixés, tests de caractérisation à compléter.** Mettre les contrats
   du relevé technique sous tests : format cible 10, références stables, états
   provisoires ou historiques et préconditions des commandes.
   Fixer les identités, passages, matériaux de cas et résultats d’analyses de
   référence, y compris les manques. Aucun renommage transversal avant cette étape.
3. **Noyau cible, import V1 et exemples.** Implémenter les types, validations et
   préparations privées nécessaires au format cible, puis adapter la migration V1
   avec une identité distincte par participation et les exemples fournis.
   Qualifier ces chemins avant de généraliser la transformation des usages.
4. **Usages en lecture.** Adapter les projections et résolutions locales, puis
   notes et variables, cas et familles, Synthèse, Lexico, autres analyses,
   pseudonymisation, exports et navigation. Les adaptateurs temporaires ont un
   périmètre explicite et ne deviennent pas un second modèle durable.
5. **Écritures et reprises.** Adapter persistance, commandes, imports et exports,
   journaux et transactions par opération cohérente. Réutiliser les identifiants
   existants des données reprises ; tester les interruptions et la reprise.
6. **Qualification du lot A.** Vérifier l’import V1, les exemples, les résultats
   inchangés des opérations conservées, le refus sûr des formats non pris en
   charge et le maintien des droits distants. Retirer les anciens chemins sans
   appelant ; documenter ceux qui restent nécessaires au lot B.

### Lot B — Nouveaux comportements et interface finale

1. **Création au nommage.** Activer les règles validées de création automatique,
   sans exclusions lexicales, avec traitement distinct des entrées provisoires
   et respect des décisions historiques de retrait ou de refus.
2. **Corrections et interface.** Raccorder les nouveaux parcours de renommage
   global, regroupement et dissociation aux commandes communes. Remplacer le
   répertoire historique par des détails ciblés, puis retirer ses commandes
   devenues inutiles après migration de leurs appelants.
3. **Qualification du lot B.** Tester séparément chaque changement fonctionnel
   attendu, puis vérifier les parcours complets, la documentation et l’absence
   de vocabulaire historique dans le métier actif.

Les lots peuvent se suivre immédiatement, mais leurs critères de validation
restent distincts. Une modification fonctionnelle du lot B ne justifie jamais
une différence inexpliquée dans les résultats du lot A. La création d’identités
à l’import et l’adaptation des exemples sont les évolutions
explicitement prévues dans le lot A, avec leurs propres assertions.

Ne pas prolonger le développement de deux modèles en parallèle pendant ce chantier.
L’activation des corrections distantes n’en fait pas partie. Si une modification
commune touche leur lecture ou leur stockage, qualifier ce périmètre ou maintenir
explicitement la compatibilité ; ne pas réécrire un miroir distant en contournant
les droits du fournisseur.

## 8. Critères de fin

- Un développeur identifie sans ambiguïté le locuteur commun, sa participation
  locale et la ligne calculée affichée dans le répertoire.
- Le métier actif n’utilise plus Personne comme un concept parallèle.
- Cas et analyses parlent de locuteurs, sans perdre leur portée ni leurs résultats.
- Les données de référence reprises produisent les mêmes identifiants existants,
  passages, comptes et résultats avant et après conversion technique. Les
  changements fonctionnels du lot B sont identifiés et testés séparément.
- L’import V1 conserve les données prises en charge et crée une identité distincte
  par participation, sans rapprochement automatique ni altération du contenu V1.
  Le renommage de sauvegarde du `.crp` reste conforme au parcours existant.
- Les exemples livrés utilisent le format cible et restent installables,
  consultables et réinitialisables.
- Les notes, variables et rôles gardent leurs propriétaires d’origine.
- Les formats V2 de développement non pris en charge sont refusés sans perte de
  données ; la recréation des corpus de test est documentée.
- Les intentions récupérables des données effectivement converties ne peuvent
  pas réintroduire d’anciennes références après conversion.
- Il n’existe ni deux ensembles concurrents de commandes ni deux écrans complets
  pour corriger les mêmes identités.
- La compatibilité restante est documentée et limitée aux frontières concernées.
- Les tests locaux et Electron passent ; les tests distants éventuellement
  nécessaires utilisent `preparer_bancs_docker`, sans pull ni reprovisionnement.

## 9. Avancement de l’implémentation

### État livré : préparation du lot A, sans activation du format 10

Le détour par la réparation générale des fichiers V1 reste abandonné. Le parseur
existant et les sources V1 sont conservés ; la création des identités distinctes
appartient à la préparation de l’import, pas à une correction des noms ou à un
rapprochement automatique.

- [x] Définir `Locuteur`, `ParticipationLocuteur`, les références contextualisées,
  le format cible 10 et ses validations, avec tests des champs anciens ou mélangés.
- [x] Partager la préparation des imports V1 local et GitLab : une identité distincte
  par participation, y compris pour les homonymes et les noms de rôle. Préserver les
  ids fournis ; compléter uniquement les ids absents à la frontière propriétaire.
  La persistance active de ces imports reste en format 9 jusqu’à la bascule.
- [x] Remplacer la projection `locuteursCorpus.ts` par `repertoireLocuteurs.ts`,
  puis adapter les lectures de cas, attributs dérivés, Synthèse et Lexico. Les
  identités communes, participations et index du texte sont distingués ; les filtres
  d’absence d’identité commune et d’absence de participation restent séparés.
- [x] Introduire les opérations communes d’identité, d’association, de regroupement,
  de séparation et de refus. Migrer les contrats des corrections et leurs messages
  IPC, sans ouvrir les corrections distantes ni activer les parcours du lot B.
- [x] Adapter les noyaux et contrats de notes et variables, leurs lectures et les
  commandes de modification. Les liens de notes et les valeurs restent locaux ;
  les adaptateurs de stockage 9 sont encore nécessaires à certains appelants.
- [x] Raccorder la matrice, la table, la navigation et les écritures de valeurs aux
  ids de participation existants, en local et dans les chemins GitLab/WebDAV
  autorisés, avec ou sans session ouverte. Ne pas compléter un id par consultation ;
  une ligne sans id reste lisible mais sa saisie est bloquée. Un lot ne laisse pas
  de modification partielle dans un entretien si l’une de ses destinations manque.
- [x] Raccorder dans l’éditeur les valeurs, renommages locaux, rôles, pseudonymes,
  couleurs et suppressions aux références stables entretien/participation. Adapter
  les inverses de valeurs et de renommages ; garder les index pour les paragraphes.
  Attendre les saisies libres avant sauvegarde et fermeture, ou les invalider lors
  d’un changement de session ou d’une perte de droits. Une confirmation de suppression
  ne peut pas viser la participation qui réutilise un ancien index.
- [x] Ajouter les gardes de versions des documents embarqués dans les transactions
  et suivis de migration, ainsi que des tests d’interruption et de reprise. Préparer
  en privé l’ajout natif avec le moteur existant ; cela ne constitue pas encore une
  prise en charge générale des écritures en format 10.
- [x] Attribuer neuf identités distinctes à l’exemple annoté sans changer ses neuf ids
  locaux, index, textes, notes ou valeurs. Préparer sa représentation native en mémoire,
  conserver les regroupements explicites et qualifier les parcours actuels d’exemples.
  Les fichiers livrés et leur installation restent encore en format 9.

Ces travaux conservent les valeurs des identifiants existants, sans renommer leurs
préfixes ni les remplacer par les index des paragraphes. Les seules allocations
concernent les nouvelles entrées et les ids historiques effectivement manquants,
jamais les projections de consultation.

### Reste à faire pour terminer le lot A

- [ ] Terminer l’alignement des propriétaires de données encore historiques : modèles
  de session, payloads, notes locales et leurs instantanés, pseudonymisation, exports,
  commandes et lecteurs/écrivains des fournisseurs. Ne pas publier de fichiers mixtes.
- [ ] Effectuer une bascule coordonnée du format actif vers 10 pour corpus, entretiens,
  créations, imports V1 local et GitLab, transactions, reprises et publications.
  Activer alors le refus des formats natifs de développement 1 à 9, sans repli V1 ni
  conversion générale des corpus de test.
- [ ] Terminer l’adaptation des exemples livrés, des corpus vierges et des imports SRT,
  de leur installation, ouverture et remise à zéro en format 10. Qualifier les copies
  incompatibles et les journaux actifs ; documenter la recréation des corpus de test.
- [ ] Retirer les adaptateurs temporaires `Format9` et les anciennes API sans appelant
  après migration coordonnée. Ils ne sont pas une seconde interface métier durable.
- [ ] Qualifier de bout en bout la bascule native, les imports et les reprises, puis
  compléter la qualification distante réelle dès que les bancs sont disponibles.
- [ ] Valider séparément le lot A avant d’activer les nouveaux comportements et
  l’interface finale du lot B. L’écran historique Personnes et ses commandes restantes
  ne sont pas encore entièrement retirés.

### Qualification exécutée et limites

| Périmètre | Dernier résultat disponible |
|---|---|
| Tests locaux hors dossiers GitLab/WebDAV | **2 614 tests réussis**, 208 fichiers. |
| Sous-ensemble GitLab unitaire/simulé | **786 réussis, 85 sautés** ; contrats réels et qualifications sources/définitions exclus de cette commande. |
| Transactions ciblées GitLab/WebDAV simulées | **140 tests réussis** sur trois fichiers ; recouvrement avec la suite GitLab, ne pas additionner ces comptes. |
| Electron local | Séries de **27 puis 12 scénarios réussis**, avec recouvrement ; données, journal, locuteurs, notes, table, références stables et sauvegarde. |
| Typage, fabrication et espaces | `npm run typecheck`, vérification stricte des nouveaux tests sensibles, `npm run build` et `git diff --check` réussis. |

Les avertissements de fin de tests happy-dom (`AbortError` et chargements CSS
interrompus) restent présents, sans échec de la suite locale.

La préparation des bancs réels a été demandée avec `preparer_bancs_docker` : le banc
GitLab est bloqué par l’absence de `qualification.env` ; Nextcloud ne peut pas démarrer
car Docker est indisponible dans cette distribution WSL. Aucun téléchargement ni
reprovisionnement n’a été entrepris. Les simulations ne remplacent pas cette
qualification réelle et ne valident pas la bascule générale, encore non activée.
