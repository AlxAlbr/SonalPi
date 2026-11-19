# Unification des locuteurs — inventaire et contrats

Complément technique du
[plan d’unification](plan-unification-locuteurs-participations.md).
Les contrats décrivent le **format natif 10 désormais actif**. Les propriétaires,
lecteurs et écrivains sont alignés ; les adaptateurs de stockage 9 sont retirés.
La section 2 conserve le relevé initial, la section 6 décrit l’état actuel.
Le [bilan du plan](plan-unification-locuteurs-participations.md#9-avancement-de-limplémentation)
distingue la bascule effectuée, les limites de qualification et le lot B restant.

## 1. Périmètre simplifié

Le chantier importe les fichiers produits par la V1, crée une identité distincte
pour chaque locuteur d’entretien et conserve leurs données. Il réutilise le
parseur existant et ses contrôles, sans ajouter de système général de réparation,
de noms provisoires ou de rapport d’import persistant.

Les essais sur des fichiers artificiellement cassés n’ont pas établi un besoin
réel de réparation. La préparation ajoutée pour ces essais a été retirée, ainsi
que ses tests spécifiques. Si un corpus réellement produit par la V1 révèle un
problème, ajouter un cas de reproduction et une correction ciblée.

## 2. Frontières et propriétaires constatés avant implémentation

Ce relevé initial fixe le périmètre et les responsabilités. Les chemins introduits
ou remplacés depuis ce relevé sont indiqués en section 6.

| Périmètre | Points d’entrée repérés initialement | Responsabilité et adaptation |
|---|---|---|
| Format natif | `src/shared/format.ts` | Format courant 9 : identités dans `CorpusFichier.personnes`, participations dans `EntretienFichier.locuteurs`. Adopter les collections cibles dans la version suivante. |
| Lecture et ouverture | `src/shared/ouvertureFichier.ts`, `src/main/corpusStore.ts` | Classification V1/V2 et migrations natives existantes. Ne pas promouvoir l’ancienne structure par un simple changement de numéro. |
| Identifiants locaux | `completerIdsLocuteurs()` dans `src/main/corpusStore.ts` | Complète les ids absents depuis l’entretien et l’index, ou reprend l’id existant par index. Préserver les valeurs et les index. |
| Parseur de transcription | `src/renderer/formatSonal/sas.ts`, `importSonal.ts`, `eav.ts` | Parse noms, rôles, pseudonymes, attributions et valeurs locales. Le réutiliser, sans lui attribuer la création d’identités corpus. |
| Import V1 local | `src/renderer/composables/corpus/useOperationsCorpus.ts`, `src/main/migrationV1.ts` | Conversion renderer, puis `MigrationV1.ajouterEntretien()` appelle `CorpusStore.importerEntretien()`. |
| Import V1 GitLab | `src/renderer/formatSonal/migrationGitLab.ts`, `src/main/gitlab/documentsMigration.ts` | `DocumentsMigrationGitLab.ajouter()` appelle `CorpusStore.preparerImportEntretien()`. Partager la création d’identités distinctes avec l’import local. |
| Commandes métier | `src/shared/corpus/personnes.ts`, `correctionsLocuteurs.ts`, `rapprochementsLocuteurs.ts` | Identités, liens, refus, fusion et séparation. Sortir les contrats de la dépendance circulaire de types ; conserver les comportements historiques au lot A. |
| Orchestration et IPC | `src/main/corpusStore.ts`, `src/main/index.ts`, `src/preload/index.ts` | Migrer les contrats et leurs deux extrémités ensemble, en gardant les droits et transactions existants. |
| Répertoire calculé | `src/shared/corpus/locuteursCorpus.ts` | Volumes, tours et lignes par identité ou participation isolée. Renommer la projection, pas en faire une identité persistée. |
| Cas et attributs | `src/shared/corpus/cas.ts`, `observationsAttributs.ts`, `src/renderer/editor/cas.ts`, `associationsPassage.ts` | Les règles référencent des identités communes ; rôles, valeurs et observations restent locaux. Conserver les passages résolus et attributs dérivés. |
| Notes et variables | `src/shared/format.ts`, `src/shared/entretien/notes.ts`, `journal.ts`, `src/shared/corpus/eav.ts` | Les notes référencent des participations de leur entretien ; les valeurs de portée actuelle `locuteur` appartiennent aux participations. |
| Synthèse et Lexico | `src/shared/synthese/*`, `src/shared/lexico/*`, `src/renderer/editor/synthese.ts`, `lexico.ts` | Distinguer ids corpus, ids locaux et index. Adapter les moteurs sans changer les plages ni les comptes. |
| Pseudonymisation et exports | `src/shared/corpus/correspondancesLocuteurs.ts`, `src/main/tablesCorrespondance.ts`, `src/shared/export/*`, `src/renderer/formatSonal/exportSonal.ts` | Préserver noms, rôles et pseudos locaux. Les regroupements de libellés pour les diagnostics ne créent pas d’identité. |
| Annulation et reprise | `src/main/journalCorpus.ts`, `src/shared/entretien/journal.ts`, `src/main/transactionsFichiers.ts`, `src/main/gitlab/suiviMigration.ts` | Annulations de session distinctes des plans persistants. Vérifier les données embarquées avant de rejouer un journal avec le nouveau format. |
| Distant | `src/main/gitlab/politiqueGestes.ts`, `src/main/distant/transactions.ts` et lecteurs des fournisseurs. | Garder les corrections distantes fermées. Qualifier les lectures et publications autorisées affectées par le changement de format. |
| Exemples | `src/main/exemples.ts`, `src/shared/exemples.ts`, `src/renderer/composables/useExemples.ts`, `CorpusTest/` | Adapter les corpus vierges, l’import SRT et la copie du corpus annoté, ainsi que leur installation et remise à zéro. |

Les filtres Synthèse/Lexico repérés restent en mémoire et sont réinitialisés
avec le corpus. Les traitements lexicaux partagés sont persistés, mais ne
contiennent pas de références de personnes dans leur type actuel. Ne pas créer
une migration de fichiers de filtres sans appelant persistant avéré.

`JournalCorpus` conserve les annulations seulement pendant la session. À
l’inverse, `.transaction-fichiers.json` et les suivis GitLab embarquent des états
natifs persistants : leur reprise doit respecter le format de ces états.

La migration locale renomme le `.crp` V1 en `.crp.sauvegarde-v1` après ouverture
réussie de la cible. Le contenu est conservé. Cette politique existante ne change
pas dans ce chantier.

## 3. Contrat cible

### Format et compatibilité

Le format actif est le **format natif 10**, qui remplace le format 9 de développement.
Ce numéro ne change pas la version applicative. Les nouveaux corpus, imports V1
et exemples produisent ce format pour le corpus et les entretiens.

Les testeurs pourront recréer leurs anciens corpus V2 : il n’est pas demandé de
migration générale des formats natifs de développement 1 à 9. Les refuser sans
les réécrire ni les reclassifier en V1. Le format V1 source reste pris en charge
par son chemin d’import existant, distinct du format natif numéroté 1.

Réutiliser les transactions existantes et vérifier les états avant/après avant
reprise. La version propre d’un journal ne remplace pas celle des fichiers
natifs qu’il contient. Les anciennes copies d’exemples ne sont jamais écrasées
silencieusement : adapter les modèles livrés et laisser les testeurs recréer
leurs copies de travail.

### Identités et références

| Élément actuel | Cible retenue | Conservation |
|---|---|---|
| `CorpusFichier.personnes` | `CorpusFichier.locuteurs: Record<string, Locuteur>` | Identité corpus : id et nom de référence. |
| `EntretienFichier.locuteurs` | `EntretienFichier.participations: ParticipationLocuteur[]` | Données locales dans l’entretien ; adapter aussi payloads, transcriptions et sources d’export. |
| `Personne.id` / `personneId` | `Locuteur.id` / `locuteurId` | Garder les valeurs existantes des données reprises. |
| Ancien `Locuteur.id` / `locuteurId` | `ParticipationLocuteur.id` / `participationId` | Id stable requis ; ne pas renommer les préfixes des valeurs existantes. |
| `personneRef` | `locuteurRef: string \| null` | Lien vers l’identité commune ; `null` pour les entrées provisoires de l’éditeur ou états historiques explicitement conservés. |
| Référence locale intermodule | `ReferenceParticipation { entretienId, participationId }` | Conserver le contexte de l’entretien. |
| `Note.locuteurIds` | `Note.participationIds` | La note reste dans son entretien, sans copie ni transfert lors d’un regroupement. |
| Paragraphes `attrs.loc` | Inchangé | Index local, jamais id corpus ni id de participation. |
| `Variable.portee: 'locuteur'` | `Variable.portee: 'participation'` | Les valeurs restent dans `valeursLoc` de la participation. |
| `personneDeliee` | `associationRetiree?: boolean` | Préserver les retraits volontaires dans les opérations historiques conservées au lot A. |

Les codes externes V1 comme `tabLoc`, `champ: 'loc'` et les indices EAV restent
inchangés aux frontières d’import/export. Une nouvelle identité n’est jamais
créée en comparant les noms à ceux du corpus.

### Cas, analyses et refus

- Les variantes de cas `personne/personnes` deviennent `locuteur/locuteurs`,
  avec `locuteurId`, sans refondre leurs unions ou `inclureEnqueteurs`.
- Les portées de modalités, familles et recettes désignant les participations
  deviennent `participation`, sans déplacement des valeurs.
- Synthèse utilise `participationId` pour la référence locale et `locuteurId`
  pour l’identité commune ; Lexico garde un `participationIndex` local distinct.
- Les filtres `sansPersonne` et `sansLocuteur` deviennent `sansIdentiteCommune`
  et `sansParticipation`. Ils ne sont pas fusionnés.
- Les refus distinguent `{ type: 'locuteur', locuteurId }` et
  `{ type: 'participation', entretienId, participationId }`. Ne pas changer
  silencieusement le sens des anciennes chaînes `personne:` et `locuteur:`.

## 4. Import V1 et exemples

### Préparation commune d’un entretien

`CorpusStore.preparerImportEntretien()` est le point commun des imports local
et GitLab. L’adaptation doit rester courte :

1. Réutiliser le résultat du parseur existant, avec ses index et données locales.
2. Attribuer les ids de l’entretien et des participations, puis créer une identité
   distincte par locuteur importé, même à nom égal.
3. Préparer ensemble l’entretien et le corpus après import, puis utiliser la
   transaction existante. À la reprise, réutiliser les ids déjà enregistrés.

La sentinelle d’index zéro n’est pas un locuteur. Les index non consécutifs,
homonymes, noms de rôle et locuteurs sans intervention restent conservés selon
les conventions V1. Aucun nom provisoire ni nouveau rapport persistant n’est
ajouté. Le chantier ne remplace pas les contrôles d’import déjà en place.

### Exemples fournis

Au premier inventaire, `CorpusTest/CorpusSynthAnnot/corpus.crp` était au format 9
avec `personnes: {}`. Ses quatre entretiens comportaient neuf participations avec
ids stables et sans identité commune. Neuf identités distinctes sont maintenant
ajoutées au modèle livré, sans fusion des libellés récurrents comme « Question ».
Les fichiers livrés, les nouvelles copies et leur installation sont au format 10.
Le modèle est validé avant copie, pas converti à l’installation. Une ancienne copie
incompatible n’est pas écrasée ; une transaction active bloque sa remise à zéro.

Conserver les neuf ids locaux et index, les textes, annotations, ancres, notes,
trente thèmes, trois variables et valeurs locales. Les références audio restent
réassignées aux fichiers du poste par `ExemplesLocaux` lors de l’installation.

Vérifier les trois constructions existantes : corpus vierges des parcours de
préparation et traitement, exploration libre depuis les quatre SRT, copies du
corpus annoté pour analyse, organisation et exploration libre. Adapter aussi
la reconnaissance du format et la remise à zéro, sans réinstallation silencieuse.

## 5. Ordre de migration et qualification

1. Mettre les contrats et données de référence sous tests.
2. Introduire le noyau cible et adapter les préparations d’import et exemples.
3. Adapter les lectures : projections locales, notes et variables, cas et
   observations, Synthèse/Lexico, pseudonymisation, exports et navigation.
4. Adapter les écritures et contrats IPC par opération complète, avec leurs
   transactions et reprises. Garder les droits distants existants.
5. Qualifier le lot A puis activer séparément les nouveaux comportements du lot B.

Les tests restent centrés sur la conservation des données normales et les corpus
V1 de référence. Un nouveau mécanisme de réparation ne fait pas partie du lot.

| Garantie | Tests de référence |
|---|---|
| Noms, rôles, index, homonymes et valeurs V1 | `test/importSonal-locuteurs-v1.test.ts`, `test/importSonal.test.ts`, `test/importTranscriptions.test.ts` |
| Migration locale et préparation GitLab | `test/migrationV1.test.ts`, `test/migrationV1-erreurs.test.ts`, `test/migrationGitLabRenderer.test.ts`, `test/gitlab/migrationV1.test.ts` |
| Identités et corrections | `test/personnes.test.ts`, `test/correctionsLocuteurs.test.ts`, `test/locuteursCorpus.test.ts` |
| Notes, cas, attributs et analyses | `test/notesCorpus.test.ts`, `test/casProjection.test.ts`, `test/casAttributsObservations.test.ts`, `test/synthese.test.ts`, `test/lexico.test.ts` |
| Transactions, reprises et droits | `test/transactionsFichiers.test.ts`, `test/journalCorpus.test.ts`, `test/gitlab/politiqueGestes.test.ts` |
| Exemples et paquet | `test/corpusSynthAnnot.test.ts`, `test/exemples.test.ts`, `e2e/exemples-paquet.e2e.ts` |

`test/importSonal-locuteurs-v1.test.ts` conserve sept tests sur des données valides
et vérifie les attributions dans `entretien1.sonal`, `entretien2.sonal` et
`entretien3.sonal`, déjà présents dans les fixtures. Les tests spécifiques aux
scénarios artificiellement cassés ont été retirés, sans supprimer les tests
préexistants de tolérance JSON ou d’erreurs de migration.

Au terme de la simplification initiale, **152 tests sur huit fichiers** validaient
les imports, migrations locales, préparation renderer GitLab et exemples ; le typage
passait et le parseur restait inchangé. Ce bilan historique précède l’implémentation.
Les derniers résultats plus larges figurent dans la section 9 du plan.

Avant les tests GitLab ou Nextcloud réels, utiliser `preparer_bancs_docker`, sans
téléchargement d’images ni reprovisionnement. Les trois bancs sont désormais
opérationnels. La dernière qualification ciblée comprend les écritures d’entretien
GitLab réelles et les publications Nextcloud A/B ; les comptes et limites figurent
dans le bilan du plan. Les dernières commandes ciblées ont été rejouées après la
bascule en format 10 ; elles ne remplacent pas une campagne exhaustive des fournisseurs.

## 6. Noyaux et frontières désormais adaptés

| Périmètre | Implémentation active | Contrat |
|---|---|---|
| Types et validation | `src/shared/format.ts`, `locuteurs.ts`, `natif/validation.ts`, `validationCommune.ts`. | `FORMAT_VERSION = 10`, un seul modèle ; `natif/format.ts` supprimé. Champs anciens ou mélangés refusés. |
| Ouverture et persistance | `ouvertureFichier.ts`, `versionsNatives.ts`, `corpusStore.ts`. | Formats natifs 1–9 refusés sans repli V1 ni écriture ; plus de migration audio/PNG ou de complétion d’ids à la consultation. |
| Transactions et reprise | `transactionsFichiers.ts`, `gitlab/suiviMigration.ts`, journaux de publication et de thématiques GitLab/WebDAV. | Validation des documents capturés, indépendamment du numéro de l’enveloppe ; moteur natif normal, sans mode privé parallèle. |
| Import V1 | `corpus/importIdentitesV1.ts`, `natif/importV1.ts`, préparations du store et chemins local/GitLab. | Sortie directement native ; une identité distincte par participation, ids fournis conservés et ids absents attribués avant persistance. |
| Préparations | `src/main/preparationsNatives.ts`, `modeleExempleNatif.ts`. | Création utilisée par le store et validation des modèles livrés avant installation. |
| Répertoire | `src/shared/corpus/repertoireLocuteurs.ts`. | Projection calculée ; l’ancien `locuteursCorpus.ts` est retiré. |
| Identités et rapprochements | `identitesLocuteurs.ts`, `rapprochementsLocuteurs.ts`, `contratsLocuteurs.ts`, `correctionsLocuteurs.ts`. | Identités et participations natives ; refus structurés avec contexte, jamais anciennes chaînes réinterprétées. |
| Cas, attributs et analyses | `src/shared/natif/lectureCas.ts`, projections, observations, Synthèse et Lexico. | Règles en `locuteur/locuteurs`, valeurs locales en portée `participation` ; adaptateurs 9 supprimés. |
| Notes et variables | Noyaux, sessions, brouillons, commandes, exports et instantanés d’annulation. | Liens `participationIds` du même entretien, sans traduction de stockage ni déplacement des valeurs locales. |
| Table et écritures de valeurs | Matrice, navigation, CSV, store, IPC et chemins GitLab/WebDAV. | Références `{ entretienId, participationId }` ; documents natifs invalides refusés. Lot sans modification partielle dans un entretien. |
| Éditeur et saisies différées | `entretien/participations.ts`, journaux, composables et panneaux. | Index pour le texte, ids pour les commandes ; attente des modalités avant fermeture et invalidation des réponses tardives. |
| Exemples | Modèle annoté livré, créations vierges/SRT, installation et remise à zéro. | Format 10, neuf identités distinctes sans changement des ids locaux ; copie incompatible ou transaction active jamais écrasée. |

Les nouvelles commandes n’utilisent pas les index comme ids de participation.
L’index reste nécessaire à la résolution des paragraphes, à l’attribution de parole
et au calcul de la couleur automatique. Les identifiants fournis, y compris leurs
préfixes historiques, ne sont pas régénérés.

### Tests ajoutés pour ces frontières

- Modèle, versions et reprise : `formatNatifLocuteurs.test.ts`,
  `versionsNatives.test.ts`, `transactionsFichiersVersions.test.ts`,
  `transactionsNatives.test.ts`, `gitlab/suiviMigrationVersions.test.ts`,
  `refusJournauxFormatsNatifs.test.ts` et refus sans réécriture dans `corpusStore.test.ts`.
- Import et exemple : `importIdentitesV1.test.ts`, `importV1Natif.test.ts`,
  `migrationV1-identites.test.ts`, `modeleExempleNatif.test.ts` et tests existants
  du corpus annoté, des imports et des exemples.
- Noyaux et contrats : `identitesLocuteurs.test.ts`, `regroupementLocuteurs.test.ts`,
  `rapprochementsLocuteurs.test.ts`, `contratsCorrectionsLocuteurs.test.ts`,
  `correctionsLocuteursNatives.test.ts`, `notesParticipations.test.ts`,
  `variablesParticipations.test.ts`, `ecrituresVariablesNatives.test.ts`.
- Lectures et analyses : `casLecturesNatives.test.ts`, `casAttributsNatifs.test.ts`,
  tests natifs et renderer de Synthèse/Lexico ; tests d’adaptateurs 9 retirés.
- Écritures locales et éditeur : `variablesStoreNatif.test.ts`,
  `tableParticipationsStore.test.ts`, `valeursEntretienParticipations.test.ts`,
  `journalParticipations.test.ts`, `gestesParticipationsEntretien.test.ts`,
  `notesEntretienParticipations.test.ts`, `journalNotes.test.ts` et
  renforcement des transactions simulées GitLab/WebDAV. `journalCorpus.test.ts`
  contrôle les instantanés natifs et le refus de restauration d’un lien disparu.
- Electron : `corrections-locuteurs.e2e.ts`, `notes-participations.e2e.ts`,
  `variables-definitions.e2e.ts`, `table-participations.e2e.ts`,
  `valeurs-participations.e2e.ts`, plus les parcours existants de données,
  journal, locuteurs, analyses, exemples et exports déjà qualifiés.

### Suite et limites

La bascule et le retrait des adaptateurs 9 sont effectués. Les contrôles des anciens
noms dans les validateurs sont des refus, pas des chemins de compatibilité.
Le panneau historique Personnes est désormais réservé aux corpus distants et ses
canaux encore utilisés transportent le modèle natif. Les raccords locaux B1 à B4
utilisent la sélection, le nommage sans exclusions et les détails secondaires.
La régularisation des entrées sans identité est explicite, sans changement à la
consultation. B5 clôt la qualification locale avec les réserves transversales
consignées dans le bilan. Les nouvelles corrections distantes ne sont pas activées.

La qualification initiale du format natif comptait 4 078 tests sur 280 fichiers,
avec les périmètres réels GitLab et Nextcloud ciblés. La clôture locale B5 atteint
**4 236 tests sur 294 fichiers** et **121 scénarios Electron ciblés validés**.
La campagne élargie donne **302 réussites, 21 échecs également reproduits sur
`31ec321`, et 5 sauts**. Quatre captures sont actualisées et les neuf scénarios de
charge s’exécutent, sans masquer les lenteurs à 1 000 annotations.

B1+B2 sont dans `2f33a3b`, B3+B4 dans `1d83616`. B5 est livré par le commit de clôture, sans push.
Le [bilan de qualification](../../docs/dev/traiter/locuteurs/qualification.md) détaille
les exclusions et réserves conservées hors lot. Le lot local est clôturé ; aucune
nouvelle campagne générale ni extension distante n’est engagée.
