# Unifier les identités : Locuteur et ParticipationLocuteur

## Statut et articulation

**Statut : format natif 10 actif ; compatibilité de stockage 9 retirée. Lot local B1–B5 livré et clôturé, avec réserves transversales documentées.**

Corpus, entretiens, sessions, imports, notes, variables, cas, exports et fournisseurs
utilisent le modèle natif commun. Les formats V2 de développement 1 à 9 sont refusés
sans conversion ni réécriture. L’import V1 reste disponible et produit directement
le format 10. La qualification ciblée de cette bascule et ses limites Electron
figurent en section 9 ; ne pas les confondre avec l’activation des comportements du lot B.

Ce chantier clarifie le modèle interne et ses références. Il est distinct de la
refonte visuelle décrite dans
[le plan de l’onglet Locuteurs](plan-refonte-locuteurs-corpus.md).

La nouvelle vue de consultation est conservée. Le vocabulaire cible et la
stratégie de compatibilité sont fixés ci-dessous pour éviter de multiplier les
chemins Personnes/Locuteurs. L’inventaire des références et les contrats ont
précédé l’adaptation des usages ; les anciens chemins encore actifs doivent être
retirés lorsqu’ils n’ont plus d’appelant. Les noms de composants et canaux IPC du
panneau historique encore utilisé ne constituent pas un second modèle de stockage.

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
La bascule du format ne change ni la version applicative ni les droits distants.

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

### Bascule technique active

- [x] Activer `FORMAT_VERSION = 10`, avec un seul modèle exporté par `format.ts` :
  identités `corpus.locuteurs`, présences `entretien.participations`, `locuteurRef`,
  notes en `participationIds` et variables de portée `participation`.
- [x] Aligner sessions, payloads, commandes, pseudonymisation, cas, attributs,
  Synthèse, Lexico, navigation, exports et les deux journaux d’annulation.
  Les index des paragraphes restent distincts des identifiants stables.
- [x] Distinguer les entrées de parseur (`ParticipationImport`, id facultatif)
  des participations natives persistées, dont l’id est obligatoire. Les seuls
  compléments d’ids se font à l’import ou au remplacement d’une transcription,
  jamais lors d’une consultation ou d’une correction native.
- [x] Importer V1 directement en format 10, localement et dans les préparations
  GitLab, avec une identité distincte par participation, sans rapprochement des
  homonymes ou des rôles. Conserver le parseur, les données locales et la politique
  existante de sauvegarde du `.crp` V1 après réussite.
- [x] Retirer le double modèle `natif/format.ts`, les adaptateurs `Format9`,
  les migrations automatiques natives 1–9 et leur déclenchement distant sous verrous.
  L’ouverture valide les documents ; elle ne convertit plus leur structure.
- [x] Refuser les anciens formats V2 sans repli vers l’import V1 et sans réécriture,
  rotation de sauvegarde, déplacement d’audio ou de forme d’onde. Refuser aussi les
  champs anciens ou mélangés portant abusivement le numéro 10.
- [x] Valider les états natifs des transactions et les publications capturées par
  les reprises, indépendamment du numéro propre de leur enveloppe. Les suivis de
  thématiques GitLab/WebDAV refusent les captures anciennes à la lecture et à l’écriture.
- [x] Livrer l’exemple annoté en format 10 avec neuf identités distinctes, sans changer
  ses neuf ids locaux, index, textes, notes ou valeurs. Valider le modèle avant copie,
  installer les corpus vierges/SRT en 10 et bloquer la remise à zéro si une transaction
  est encore active. Les anciennes copies de test ne sont pas écrasées.
- [x] Documenter le modèle actif et la recréation des anciens corpus V2 depuis les
  sources ou par une nouvelle copie des exemples. Ne jamais changer leur seul numéro.

Les noms de certains canaux IPC et composants du panneau historique Personnes
subsistent parce que leurs appelants sont encore utilisés. Ils transportent les
contrats natifs, sans conversion du stockage 9. Les nouvelles corrections sont maintenant accessibles depuis la sélection corpus.
Le renommage depuis l’entretien et la création sans exclusions au nommage sont
également raccordés. Les détails secondaires et le retrait des anciens parcours
locaux sont maintenant livrés ; la qualification complète du lot B reste à terminer. Les corrections distantes ne sont pas ouvertes.

### Qualification exécutée sur le format 10

| Périmètre | Résultat |
|---|---|
| Suite locale et fournisseurs simulés | **4 078 tests réussis, 280 fichiers**. Exclusions : fichiers Nextcloud, qualifications GitLab réelles, contrat GitLab et scénarios WebDAV à banc réel. |
| Journaux natifs | Inclus dans la suite : **30 tests** dédiés aux versions d’enveloppe indépendantes, captures 1–9 refusées, publications anciennes et champs mélangés. |
| GitLab réel | **19 réussis, 1 indicatif sauté**, dans `qualificationEcrituresEntretien.test.ts` et `qualificationCorrespondances.test.ts` ; écritures, import ciblé, droits, réponses perdues et reprise. |
| Nextcloud A/B réels | **17 réussis, 1 sauté**, dans `correspondances-nextcloud.test.ts`, `publication-nextcloud.test.ts` et `themes-publication-nextcloud.test.ts`. |
| Electron local ciblé | **46 réussis, 1 sauté, 2 échecs préexistants** : V1, refus natifs 2/9 sans modification, notes/annulations/réouverture, variables, familles de cas, corrections, regroupement/séparation, Word/PDF, ouvertures et CSV. Les deux échecs sont les entrées d’export d’entretien absentes ; reproduits sur `2c76cf7` dans un worktree séparé, sans les modifications du chantier. |
| Typage et fabrication | `npm run typecheck` et `npm run build` réussis. |

La commande exhaustive regroupant toutes les qualifications Nextcloud a été
interrompue à sa limite de 900 secondes. Elle n’est pas déclarée réussie ; les
résultats réels ci-dessus sont ceux des commandes ciblées rejouées ensuite.
Les bancs ont été préparés avec `preparer_bancs_docker`, sans pull ni reprovisionnement,
et sont laissés démarrés. Aucun résultat local ne remplace une qualification distante.

### Limites et suite

- [ ] Traiter séparément les deux accès d’export d’entretien manquants, déjà absents
  du commit initial. Les assertions d’export n’ont pas été assouplies.
- [ ] Les deux défauts de présentation Electron documentés avant la bascule restent
  hors de cette série : défilement clavier du journal et écart droit du volet de 2 px.
  Ils avaient également été reproduits sur `2c76cf7` ; leurs seuils restent inchangés.
- [x] Qualifier le lot B et actualiser les captures après les raccords corpus,
  entretien, nommage et détails secondaires ; conserver les réserves hors lot.

La bascule native est effectuée et qualifiée sur le périmètre indiqué. Ce bilan
ne prétend ni que toute la suite Electron est verte, ni que l’ensemble du plan
fonctionnel, notamment le lot B, est terminé.

## 10. Lot B — premier raccord d’interface

Les actions `Renommer…`, `C’est le même locuteur…` et `Dissocier…` sont accessibles
sur la sélection de la vue corpus locale. Elles utilisent les commandes natives
existantes, après lecture d’un inventaire frais. L’aperçu inclut tous les entretiens,
même masqués ; le store refuse une modification si l’état attendu a changé.

Le regroupement exige un choix explicite de conservation ou d’uniformisation des
noms. Un conflit dans un même entretien est expliqué avec un accès à cet entretien.
La dissociation rend chaque participation cochée indépendante, sans saisir de nom,
en laissant au moins une participation sur l’identité d’origine. Les conséquences
sur les cas sont expliquées avant confirmation.

Après réussite, les projections sont invalidées, la recherche est effacée et la
sélection est reconstruite depuis les participations. Une préparation périmée ou
une réponse reçue après changement de corpus ne s’installe pas dans le nouvel écran.

**Limite volontaire de cette étape :** les entrées sans identité utilisaient encore
les associations historiques. Leur régularisation explicite est désormais décrite
en section 13. Préparer un aperçu ne crée aucune identité. Les raccords du renommage depuis
l’entretien et de la création sans exclusions sont décrits en sections 11 et 12. Aucun droit
distant n’est ouvert.

Qualification : **29 nouveaux tests** de préparation, interface et orchestration ;
**2 688 tests locaux réussis dans 212 fichiers**, **9 parcours Electron réussis**,
typage de l’application et des nouveaux tests ainsi que build réussis. Cette série
ne rejoue pas les fournisseurs réels, dont les politiques restent inchangées.

## 11. Lot B — renommage global depuis l’entretien ouvert

Une participation déjà associée se renomme maintenant avec confirmation dans tous
ses entretiens, depuis son champ Nom ou le bouton `Renommer…` de la gestion des
locuteurs. La préparation ne modifie pas le nom local et inclut les entretiens non
affichés. L’identification des entrées sans association a été raccordée ensuite,
comme décrit en section 12.

Avant l’envoi, les identifications et saisies en cours sont attendues, le texte est
sauvegardé et l’autosauvegarde suspendue. Le main autorise uniquement le renommage
issu de cette session locale, en vérifiant l’association et l’aperçu. Une autre
session ouverte reste bloquante ; les corrections corpus ne sont pas assouplies.
Les écritures utilisent toujours la transaction locale existante.

Seuls les noms sont actualisés en mémoire après comparaison avec le payload sauvé.
Le document, la sélection, l’historique de frappe, les notes et données ne sont pas
remplacés. Les inverses de renommage local devenus inadaptés sont retirés du journal.
Le main empêche une sauvegarde périmée de rétablir les anciens noms et interdit les
écritures d’entretien pendant une transaction à reprendre.

Une réponse perdue ne rejoue pas le renommage : les noms sont relus et vérifiés.
Une relecture impossible ou un autre contenu modifié laisse l’entretien en lecture
seule jusqu’à la réouverture du corpus, sans réenregistrer l’ancien état. Les réponses
reçues après changement de session sont ignorées. Aucun parcours distant n’est ouvert.

Qualification de cette étape : **25 tests unitaires supplémentaires**, suite locale
**2 713 tests réussis dans 214 fichiers**, **13 parcours Electron locaux réussis**
(dont quatre nouveaux pour le renommage ouvert), typage de l’application et des
nouveaux tests ainsi que build réussis. Les scénarios vérifient annulation, texte
récent sauvegardé, autosauvegarde après renommage, source absente, réponse perdue,
relecture refusée et reprise après redémarrage. Les tests B1 restent dans la série.
**187 tests de fournisseurs simulés** sur six fichiers GitLab/WebDAV passent aussi ;
les bancs réels n’ont pas été rejoués pour cette étape locale.

La création sans exclusions et les détails locaux ont été raccordés ensuite
(sections 12 et 13). Le bilan B5 et ses réserves figurent en section 14.

## 12. Lot B — création sans exclusions après validation du nom

B1 et B2 sont versionnés dans `2f33a3b`. Le raccord B3 crée maintenant une identité
propre avant les propositions, pour tout nom non vide validé en local, sans exclusion
lexicale. L’ajout provisoire ne suffit pas ; Entrée, la sortie d’un champ modifié
ou « Valider le nom » déclenchent la validation, y compris pour Nouveau locuteur.

Le main enregistre identité et association dans une seule transaction de fichiers,
en gardant l’identifiant dans le plan de reprise. Répéter la demande retrouve le
résultat enregistré au lieu de produire des fiches vides supplémentaires. Les
retraits volontaires restent respectés, les refus sont conservés et le rôle n’est
jamais déduit du nom. Une source étrangère indisponible diffère les propositions,
pas la création indépendante dans l’entretien courant.

Plus tard ou Échap conserve l’identité distincte visible dans le corpus. Refuser
une proposition la conserve aussi. Confirmer utilise un raccord local dédié qui
réunit les identités avec le moteur existant, sans définition vide restante, et
redirige les cas et refus. Une source non associée rejoint explicitement l’identité
créée. Les noms restent locaux ; la reprise de données exige le choix de l’utilisateur.
Inventaire complet, associations, données et aperçu sont recontrôlés avant écriture.
Un conflit dans un même entretien reste interdit.

Les heuristiques de suggestions restent séparées de la création : pas de demandes
répétitives pour les libellés d’attente ou noms très courts ; rôles équivalents
proposables avec l’avertissement existant. Une validation identique après création
ne refait ni création ni suggestion. Aucun filtre ne masque l’identité créée.

Le raccord termine les saisies et sauvegardes puis suspend l’édition pendant la
transaction. La relecture est comparée au payload sauvé et aux seuls changements
prévus : associations et informations choisies, jamais un remplacement du document.
Les anciennes associations sont refusées à l’autosauvegarde. Les inverses de nommage
local devenus incompatibles avec l’identité créée sont retirés. Une réponse perdue
est relue sans rejeu ; une relecture non vérifiable garde l’entretien en lecture
seule jusqu’à réouverture. Les réponses d’une ancienne session sont ignorées.

Aucun modèle parallèle, adaptateur natif, nouveau format ou droit distant n’est
introduit. La création et le rapprochement au nommage restent locaux. Le remplacement
des détails et anciens parcours a été raccordé ensuite en B4 (section 13) ; la
qualification complète reste réservée à B5.

Qualification B3 : **50 tests unitaires ajoutés**, **2 763 tests locaux réussis dans
216 fichiers**, **187 tests de fournisseurs simulés réussis dans six fichiers** et
**28 parcours Electron locaux réussis**, dont six nouveaux. Le typage de l’application,
le typage strict des nouveaux tests, le build et la vérification des espaces passent.
Les parcours de nommage existants ont été alignés sur la création avant proposition
et la confirmation globale ; les régressions B1/B2 restent dans la série. Les bancs
GitLab et Nextcloud réels ne sont pas rejoués pour ces gestes locaux.

## 13. Lot B — détails locaux et retrait des anciens parcours

Les détails s’ouvrent désormais sans remplacer les interventions ni leur sélection.
La projection de lecture conserve la propriété des valeurs et notes par entretien ;
les notes sont résolues par références contextualisées. Les définitions de variables
et catégories sont relues pour les affichages et les aperçus. Aucune consultation
ne complète les ids, ne crée une identité ou ne répare un lien absent.

Les entrées sans identité valide peuvent être conservées séparément après un aperçu
et une confirmation. Une identité est créée pour chaque voix déjà existante, sans
nouvelle participation, ni nouveau nom demandé, ni regroupement de noms égaux.
Retraits volontaires et références absentes ne sont pas réparés implicitement.
L’intention explicite ne restaure pas un ancien lien et ne modifie pas les cas ou
les refus existants. Un nom vide demande d’abord une édition dans l’entretien.

Les propositions, distinctions et définitions sans entretien restent secondaires.
Comparer sélectionne les locuteurs dans la liste ; réunir passe par le regroupement
déjà livré. Écarter mémorise un refus réciproque sans création ; réexaminer retire
les refus correspondants des membres des deux groupes sans regroupement automatique.
La reprise d’informations exige un entretien source, des champs choisis et une
confirmation, sans synchronisation future. La suppression d’une définition vide
reste refusée si une participation, un cas ou un refus l’utilise, ou si l’inventaire
est incomplet. Les textes et notes ne sont pas supprimés.

Ces commandes réutilisent le moteur transactionnel, le modèle natif et les contrôles
existants : écritures locales, inventaire frais, sessions fermées, comparaison de
l’aperçu, états capturés à reprendre. Aucun nouveau format ni adaptateur n’est ajouté.
Les anciens formulaires locaux de création, liaison, déplacement, renommage de
référence seul et séparation avec nouveau nom sont retirés du parcours. Le composant
historique reste réservé au distant et ses propriétaires gardent leurs restrictions.

Qualification B4 : **42 nouveaux tests unitaires**, **2 805 tests locaux réussis dans
218 fichiers**, **187 tests de fournisseurs simulés sur six fichiers** et **37 parcours
Electron locaux réussis**. Typage de l’application, typage strict des tests ajoutés,
build et contrôles d’espaces réussis. Les parcours remplacés sont rejoués sur la
sélection et les détails ; la consultation sans écriture et les références locales
identiques dans plusieurs entretiens sont vérifiées. Les bancs réels ne sont pas
rejoués pour cette livraison locale.

B3+B4 sont versionnés dans `1d83616`, après B1+B2 dans `2f33a3b`, sans push.

## 14. Qualification B5 et clôture locale

Le lot est clôturé sur **4 236 tests locaux/simulés réussis dans 294 fichiers** et
**121 scénarios Electron ciblés validés**. La campagne locale élargie donne
**302 réussites, 21 échecs et 5 sauts**. Les 21 scénarios en échec échouent également
sur `31ec321`, avant le lot B ; ils restent dans leurs chantiers transversaux.
Typage de l’application et des nouveaux tests, build et contrôles d’espaces passent.

Quatre captures sont actualisées et l’aide présente maintenant la sélection corpus
et les détails. Les inventaires de 2 000 entretiens sont couverts sans mutation ;
les contrôles de refus sont mutualisés par identité pendant le calcul des suggestions.
Les neuf scénarios de charge s’exécutent, avec une limite conservée de 400 à 647 ms
au p95 des corrections à 1 000 annotations. Aucun seuil n’est abaissé.

Le [bilan détaillé](../../docs/dev/traiter/locuteurs/qualification.md) conserve les
exclusions, réserves et commandes. Aucun nouveau parcours distant n’est activé.
Les compléments B5 sont livrés par le commit de clôture du lot, sans push supplémentaire.
Aucune nouvelle relance générale n’est nécessaire pour cette clôture.
