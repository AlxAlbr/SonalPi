# Dissociation globale d’une règle textuelle

## Périmètre livré

La dissociation est activée **au local, sur GitLab et sur WebDAV**, après qualification propre
à chaque protocole. Le renommage livré ne qualifie pas
le retrait d’une règle. Le geste `anon.dissocier-globalement` a sa propre portée,
`pseudonymisation-dissociation`, et capacité publique `dissociationGlobale`.
Aucun repli sur un miroir distant n’est autorisé.

`src/shared/corpus/dissociationAnon.ts` inventorie puis prépare le transfert.
Seules les annotations textuelles liées à l’identifiant choisi perdent leur
champ `regle`, y compris exceptions, anciennes variantes choisies et décisions
masquées. Pseudo choisi ou mémorisé, état, positions, texte, identité de
l’annotation, autres décisions, brouillons, déclarations indépendantes,
locuteurs et `Personne` ne sont pas réécrits. Aucun placement sur une occurrence
en attente n’est effectué.

Chaque entretien portant ces liens reçoit une `DefinitionAnonLocale` complète,
en état `declaration` : tous les alias et pseudos **déclarés**, catégorie
comprise. Un ancien choix publié hors déclaration reste choisi et n’étend pas
la mémoire. Les alias/variantes inutilisés restent déclarés. Une règle sans
lien est simplement retirée ; les entretiens non concernés ne reçoivent pas
arbitrairement de nouvelle définition.

Une déclaration ou décision locale indépendante recouvrante est un obstacle,
même si son pseudo ressemble à celui du corpus. Idem pour un brouillon, une
ancienne mémoire `pseudosDeclares` ou une autre règle corpus recouvrante.
Aucune résolution, fusion d’identité ou substitution de mémoire n’est implicite.
Une source manquante, un ancien format, une référence illisible ou une décision
liée incohérente empêche de prouver le retrait sans référence pendante.

## Aperçu privé et parcours local

`src/main/dissociationsAnon.ts` conserve trois préparations pendant cinq minutes,
liées au store exact et aux SHA-256 du corpus et de **tous** ses membres. Les
clones publics ne portent aucune autorité. Toute tentative consomme le jeton ;
consentement explicite, contexte local, droits, disponibilité initiale et versions
sont revérifiés avant préparation des écritures. L’aperçu ne contient pas les
copies natives complètes.

Choix de ce premier protocole local : toutes les sessions locales doivent être
fermées et le journal libre. Ce n’est ni une obligation de verrouiller tous les
membres, ni une règle métier universelle. La préparation relit tous les fichiers ;
seuls les entretiens portant les liens sont écrits. Budgets Sonal : inventaire
64 Mio, aperçu 8 Mio, plan/journal 128 Mio. Ce ne sont pas des limites de plateforme.

IPC typés : `corpus:apercuDissociationAnon`, `corpus:dissocierRegleAnon`.
`DissociationRegleAnon.vue` calcule automatiquement l’inventaire local à l’ouverture.
La préparation distante et la reprise gardent leurs appels explicites.
Le texte principal présente les conséquences en langage courant ; passages détaillés
et diagnostic d’assistance sont repliés. Confirmation explicite, garde de contexte,
focus, activité et réponses tardives restent protégés, sans changement du protocole.

Dans l’entretien, corpus→entretien demande l’enregistrement et la fermeture
via le cycle habituel, puis ouvre **le même dialogue global**, sans déliage
anticipé. Les règles de la copie corpus ouverte sont initialisées avant édition,
sans exiger une visite préalable du panneau corpus. Annuler le dialogue conserve
les liens ; l’édition antérieure a été sauvegardée explicitement pour la navigation.
L’ancien corpus→brouillon est fermé : il pouvait retirer les seules annotations
courantes et oublier la variante déclarée inutilisée. Le retrait des décisions
partagées exige une commande globale distincte : suppression locale désormais livrée,
sans rouvrir ce raccourci ; suppression GitLab/WebDAV encore non qualifiée.

## Journal local durable et preuve finale

Le plan utilise `TransactionsFichiers`, entretiens **puis** corpus. La dissociation
emploie la **version 3** de `.transaction-fichiers.json`, privée 0600, atomique et
synchronisée. Versions 1/2 et protocole local du renommage inchangés. Un ancien
lecteur ne peut pas reprendre ce nouveau journal en ignorant ses gardes.

`controleDissociation` conserve l’identifiant de règle et les empreintes des
non-ciblés ; les ciblés ont leurs copies avant/après. Lecture du journal rederive
les transferts depuis les copies avant : aucune modification de pseudo, catégorie,
identité ou autre champ n’est autorisée au titre de cette intention. Dates des
ciblés et membership sont les seules mises à jour supplémentaires.

Avant écritures et avant retrait de la définition : versions des non-ciblés et
absence de tout nouveau lien contrôlées. Chaque cible est revérifiée avant son
remplacement ; toutes les copies acquises et le corpus sont revérifiés au contrôle
final. La règle n’est retirée qu’après ces preuves. Une image déjà acquise n’est
pas réécrite. Corpus final avec cible non appliquée : incohérence refusée.

Une interruption laisse la règle partagée jusqu’au contrôle final. La réouverture
reprend les fichiers restants sans compensation des acquis. Un fichier concurrent,
un nouveau lien ou une garde invalide suspend la reprise ; aucun élargissement du
lot, rejeu aveugle, écrasement ou clôture forcée n’est proposé. Conserver le journal
pour examen, ne pas le supprimer afin de débloquer artificiellement les écritures.
Les écritures directes du système de fichiers/anciens clients ne constituent pas
une isolation universelle ; les contrôles constatés ne sont pas des verrous OS.

## GitLab — livraison activée après qualification

`src/main/gitlab/dissociationsAnon.ts` et `journalDissociationAnon.ts` portent
un moteur distinct, assemblé par les transactions et le contexte. Préparation,
exécution, suivi, relecture et reprise sont raccordés aux IPC typés et au dialogue.
La capacité `dissociationGlobale` est activée sur GitLab ; sa qualification WebDAV est décrite séparément ci-dessous.
Le cran corpus→entretien utilise aussi le parcours global qualifié, après
consentement à l’enregistrement et à la fermeture normale de la session.

L’inventaire lit tous les membres publiés à un même SHA, sans miroir de secours.
Trois préparations privées/cinq minutes, aperçu 8 Mio, inventaire 64 Mio,
journal 128 Mio : budgets Sonal. Le jeton est propre à l’instance du service,
consommé même sans consentement ; les copies natives restent privées.

Choix de protocole, et non exigence métier : le corpus publié porte temporairement
`dissociationAnon: { operationId, regleId }`. Cette barrière est publiée sous bail
corpus **avant** les transferts, sans retirer la définition. La validation GitLab
refuse toute publication d’entretien portant encore ce lien, même inchangé depuis
sa base publiée. Une publication préparée avant la barrière perd sa garde corpus.
Cela empêche les chemins coopératifs utilisant cette validation de réintroduire
les références entre le contrôle final et le retrait, sans verrouiller ni garder
chaque membre dans un commit géant. Les mutations de définitions, créations/imports,
correspondances, renommages et thématiques vérifient désormais la barrière fraîche
avant de publier : aucun autre geste ne peut la retirer ou altérer sa définition.
Les publications courtes indépendantes restent possibles ; celles portant encore
ses liens sont refusées. Les chemins actuels audités passent par ces contrôles
et leurs gardes corpus : sessions, transactions courtes, créations/imports,
correspondances, renommages et opérations thématiques. Anciens clients et API
directes ne sont pas protégés universellement par ce champ additif.

Les transferts prennent corpus puis un seul bail cible, relisent corpus/cible
au même SHA et gardent leurs versions. Les décisions et la mémoire sont celles
du moteur partagé ; seuls les fichiers ciblés sont installés après confirmation.
Les sessions non ciblées restent ouvertes. Cible locale/récupérable ou distante
ouverte, version changée ou droit perdu : différée, règle et barrière conservées.
Le scan final doit être complet, sans lien restant. Chaque acquis encore membre
doit conserver sa déclaration locale complète et valide ; une suppression ou
modification de cette mémoire suspend le retrait, sans restauration forcée.
Une autre édition indépendante est conservée. Le retrait règle/barrière est un
commit sous bail corpus, avec garde corpus et garde de la version courante de
chaque entretien transféré encore membre. Ces gardes ferment la course entre
contrôle de mémoire et retrait, sans prendre de baux sur ces entretiens.

Barrière : deux actions ; transfert : trois ; retrait : deux plus les acquis
encore membres. Le budget **Sonal** de 250 actions impose actuellement au plus
**248 cibles transférées encore membres par lot**. Refus annoncé dans l’aperçu
et revérifié avant début ou reprise ; acquis conservés, aucun découpage implicite. Ce n’est ni
une exigence métier ni une limite sur le nombre total de membres inventoriés.
300 membres/deux cibles et refus à 249 cibles sont testés en mémoire ; **la charge
maximale à 248 cibles n’est pas qualifiée**.

`.dissociation-anon-gitlab.json` conserve les cibles avant/après et chaque intention,
en 0600, remplacement atomique et fsync fichier/répertoire. La lecture redérive
chaque transfert complet et la seule modification corpus permise par la phase.
Les acquis restent acquis, aucune compensation. Une reprise fraîche confirme
explicitement les nouvelles cibles ou celles sorties du membership/sans lien.
Une définition ou barrière divergente bloque ; catégorie comprise, pour ne pas
créer des mémoires déclaratives différentes implicitement pendant le même lot.
Un nouveau lien dans une cible acquise n’autorise pas la fusion d’une déclaration
locale : l’examen de provenance reste nécessaire.

Réponse perdue : journal de publication GitLab et intention propre au lot,
recherche d’un titre unique et preuve des octets au commit retrouvé ; aucun
second commit pour un succès reconnu. `relireSuivi` reconnaît aussi un retrait
final accepté sans préparer de nouveau transfert. Après reconnaissance, seules
les copies serveur actuelles des acquis non ouverts/récupérables sont installées,
jamais les images historiques du journal. Lecture ou installation indisponible :
ouverture de l’acquis suspendue, même si le journal prouve déjà son succès.
Le contexte effectue ensuite un tirage gardé. Un échec miroir conserve l’acquis et
exige une nouvelle ouverture, jamais un rejeu. Une session refusée encore sale
ne peut pas être fermée de force pour libérer un bail.

Premier point de contrôle moteur : **238 tests ciblés/12 fichiers**, typecheck/build
réussis. **5 scénarios moteur GitLab configurés à deux comptes réussis** : nominal,
cible tenue/ancien lien refusé, session indépendante/import lié refusé, nouveau
lien direct avant contrôle final/nouveau consentement, réponse perdue/historique
indisponible/relance sans rejeu. Racines synthétiques conservées ; aucun corpus
utilisateur touché. Les premiers essais ont corrigé la fixture : un enregistrement
strictement identique ne publie rien ; le blocage d’historique doit être injecté
au commit concerné ; une édition refusée empêche réellement la fermeture, donc
le banc rétablit explicitement sa base avant de libérer sa propre session.

Raccordement : le contexte réserve les cibles avant toute attente, compte les
ouvertures déjà engagées et les copies récupérables, garde les sessions non ciblées.
Cibles en attente exclues du tirage et de la réouverture ; journal invalide refusé
avant le premier tirage. La fermeture efface les jetons et refuse un transfert
actif. L’IPC vérifie le contexte après chaque lecture et refuse les réponses
d’un ancien contexte. Une tentative refusée par la politique consomme aussi son
jeton. Le suivi public ne contient ni documents natifs ni copies locales.

`Actualiser` réconcilie l’envoi indéterminé dans la file déjà acquise, sans la
réacquérir. La relecture explicite reconnaît aussi un retrait final accepté.
Le dialogue affiche les acquis/différés/nouveaux usages et ne signale jamais
un lot partiel comme terminé. Suivi indisponible ou indéterminé : aucun recalcul
ni envoi avant relecture réussie ; nouvelle préparation = nouvelle case de
consentement. Le panneau corpus affiche le suivi même après réouverture.

Point historique du raccordement, avant activation : 275 tests/15 fichiers,
sept scénarios réels GitLab et onze recettes Electron locales réussis. La politique
était encore fermée ; ce point seul ne constituait pas une livraison GitLab.

Qualification de la livraison :

- **1 981 tests réussis/148 fichiers**, 103 sautés : régression hors `test/webdav/**`.
- **60 tests mémoire WebDAV/3 fichiers réussis**, gardes et contextes précédents.
- **11 scénarios réels GitLab à deux comptes réussis** : sept précédents,
  refus d’authentification aux trois phases (jeton invalide injecté dans le transport,
  refus réel du serveur), et mémoire supprimée par l’autre compte juste avant
  finalisation, garde native refusée sans restauration.
- **Six recettes OAuth/Electron GitLab réussies**, quatre nouvelles et deux
  régressions renommage/import. Annulation, clones publics sans autorité, jeton
  consommé sur refus, cible tenue, nouvel usage et consentement renouvelé,
  retrait accepté/réponse et historique perdus puis reconnu sans rejeu.
  Depuis l’entretien : refus initial conserve la session, accord sauvegarde et
  ferme normalement, annulation garde les liens, confirmation conserve la mémoire.
- **Vrai SIGKILL** du main après transfert accepté, avant retour : relance,
  reconnaissance de l’acquis, refus du bail corpus persistant, puis uniquement
  cible restante et retrait. Le banc libère son bail après preuve de mort et
  vérification du compte et de la génération ; l’application ne le force jamais.
- **Onze recettes Electron locales repassées** ; captures GitLab normale,
  réduite, partielle, indéterminée et bail persistant examinées.
- Typecheck/build et contrôles d’espaces réussis.

Les premiers essais ont corrigé le harnais : garde finale distinguée d’un update,
compteur partiel après refus d’un seul transfert, identité du bail dans `holder`,
attente du vrai `can_push` du compte ajouté (jusqu’à 90 secondes), document chargé
avant saisie et délai du badge cohérent avec son sondage toutes les cinq secondes.
Pas d’assouplissement des contrôles de production pour passer ces essais.

Aucune nouvelle suite générale complète ni qualification WebDAV de dissociation
revendiquée. Projets synthétiques conservés ; aucun corpus utilisateur touché,
aucun commit du dépôt de travail. Charge maximale, Windows, anciens clients,
révocation persistante de rôle et autre instance institutionnelle restent à qualifier.
Le plan principal reste ouvert.

## Qualification locale livrée

- Tests purs : mémoire complète, multi-alias, variantes inutilisées, exceptions,
  inclusions, choix historiques, collisions et sources incohérentes.
- Tests disque/cache : consentement, clones, TTL, contexte, sessions, sauvegarde
  tardive, périmés ciblés/non-ciblés, interruptions et journal altéré.
- Concurrence injectée entre remplacements : cible suivante, acquis, corpus,
  non-ciblé modifié ou nouvellement lié ; refus sans écrasement.
- Quatre recettes Electron locales : annulation et bilan, périmé et nouvelle
  préparation, édition sauvée/fermée avant aperçu global, interruption de
  `renameSync` puis fermeture/relance et mtime acquis inchangé.
- Sept recettes Electron locales antérieures repassées ; captures normale et
  réduite examinées. Le scénario d’interruption est une panne FS injectée,
  **pas un nouveau SIGKILL réel**.

Point historique de la livraison locale : 120 tests ciblés/sept fichiers et 11 recettes Electron locales
réussis ; typecheck/build réussis. Suite générale suivie : 2 354 réussis, 93 sautés,
un échec historique de tirage du miroir dans `scenario-deux-postes` B. Deux cas A/B
réexécutés isolément réussis, sans changement ; ce n’est pas une suite complète
verte ni une preuve d’absence d’intermittence. Régression hors WebDAV : 1 917 réussis,
92 sautés. Les qualifications GitLab configurées/OAuth ne sont pas revendiquées.

Ce dernier paragraphe décrit le point de contrôle local antérieur à la livraison
GitLab. À ce point historique, la dissociation WebDAV restait non qualifiée.
Charge maximale, Windows, anciens clients et recette utilisateur finale restent ouverts.
Suppression partout, promotion globale et ajout/retrait avec repli demeurent des opérations distinctes à terminer.

## WebDAV : dissociation qualifiée et activée le 11 octobre 2026

`DissociationsAnonWebDAV` et `JournalDissociationAnonWebDAV` sont raccordés aux
transactions, au contexte distant et aux mêmes IPC typés de préparation, exécution,
suivi, relecture et reprise. La portée distincte `pseudonymisation-dissociation`
et la capacité `dissociationGlobale` sont ouvertes après qualification A/B.
Aucun repli sur le miroir ni transfert silencieux depuis l’entretien.

### Barrière, transferts et preuve finale

- Inventaire GET complet des membres publiés, format natif actuel, ETags forts,
  relecture finale du corpus ; trois aperçus privés/cinq minutes, clones publics,
  jeton consommé même si la confirmation ou la politique refuse.
- Barrière additive `dissociationAnon: { operationId, regleId, fournisseur: 'webdav', cibles }`
  publiée sous verrou corpus, définition partagée conservée. Les identifiants
  protégés comprennent aussi les transferts déjà acquis.
- Corpus puis **une seule cible**, sous verrou natif ou conditionnel selon le banc.
  Source native consentie revalidée et PUT `If-Match`, marge de 60 secondes près
  du transport, après lectures et fsync. Les non-ciblés ne sont ni verrouillés
  ni installés ; sessions locales/récupérables et cibles tenues/modifiées différées.
- Chaque transfert retire uniquement `regle` des décisions liées et conserve
  la déclaration locale complète, même les variantes inutilisées. Aucune fusion,
  réattribution, promotion, application d’occurrence ou modification de locuteur.
- Le contrôle final garde le verrou corpus pendant tout l’inventaire des références
  et déclarations acquises, jusqu’au PUT de retrait conjoint de la règle et barrière.
  Une preuve incomplète, mémoire perdue ou référence nouvelle empêche ce retrait.
  Les usages nouveaux nécessitent une nouvelle préparation et un nouvel accord.

La garde commune des publications d’entretiens refuse **tout ancien lien**, même
inchangé, et la perte d’une déclaration complète protégée. Sessions, écritures
courtes, créations/imports, reprises d’orphelins et publications de thèmes la partagent.
Les mutations de corpus relisent les octets/ETag publiés et refusent la barrière ;
l’égalité du manifeste ne permet plus d’ignorer cette lecture. Les anciens clients
ou accès directs restent hors de cette isolation coopérative.

### Journal, reconnaissance et contexte

`.dissociation-anon-webdav.json` est privé 0600, lié à la destination, remplacé
atomiquement avec fsync fichier/répertoire. Les transformations, bilans et intentions
exactes sont redérivés à la lecture. Budgets d’implémentation : 64 Mio d’inventaire,
8 Mio d’aperçu et 128 Mio de journal, pas des limites métier de membership.

L’intention précède le PUT ; l’acquis est persisté avant installation du miroir.
Une réponse inconnue garde intention et droits connus. La relecture fait uniquement
GET/proof : seule l’image exacte acceptée confirme, jamais l’original comme preuve
de refus. Le processus vivant renouvelle ses droits connus ; une relance refuse
les verrous persistants, sans vol ni identité héritée. La reconnaissance installe
les sources **actuelles**, jamais les copies historiques du journal. Un retrait
acquis avec miroir incomplet reste partiel : relecture seulement, aucune reprise
de données ni fausse réussite. La préparation de reprise reste strictement en lecture.

Le contexte réserve les cibles avant attente, protège sessions/candidats et tirages,
refuse la fermeture pendant exécution et les mutations incompatibles pendant suivi.
Le journal est validé avant le premier tirage ; migrations et archivage sont suspendus.
Les verrous `dissociation-*` ne sont jamais des orphelins de session abandonnables.
Origine et politique sont recontrôlées côté main. Le dialogue et la bannière présentent
les acquis, différés et nouveaux usages ; issue inconnue = aucun envoi avant preuve.
Le tirage automatique attend l’inventaire/publication active, sans transformer son
refus volontaire en état hors ligne ni perdre le résultat de sa propre opération.

La réconciliation thématique peut relire sa propre intention exacte, pas une
publication étrangère. Une nouvelle instance ne s’approprie pas ses verrous ;
la reconnaissance en processus vivant ne rejoue aucun PUT.

### Qualification et limites

- **14 scénarios réels Nextcloud A/B réussis**, plus **2 régressions de thèmes** :
  nominal/non-ciblé tenu, refus des anciens liens et mémoires incomplètes, cible
  concurrente, mémoire acquise altérée, réponses perdues aux trois phases,
  reconnaissance actuelle et vrai SIGKILL/reprise restante.
- **8 parcours Electron de dissociation A/B réussis**, puis série complète de
  **22 parcours WebDAV réussis** : huit nouveaux, six de renommage, huit d’import.
  Publication réelle, annulation, entretien édité sauvé/fermé normalement,
  nouveaux usages/nouvel accord, retrait accepté reconnu sans rejeu, SIGKILL,
  refus persistant et intervention externe après preuve de mort/compte/génération.
  Le premier transfert B dépasse volontairement 60 secondes pour exercer le tirage
  automatique. Captures normale/réduite/partielle/inconnue/verrou persistant examinées.
- Régression hors `test/webdav/**` : **1 987 réussis/148 fichiers, 103 sautés**.
  Mémoire WebDAV : **372 réussis/19 fichiers**, repassés dans un contrôle final
  de **425 tests/22 fichiers** avec thèmes et renderer. **11 parcours Electron
  locaux repassés**, soit 33 parcours Electron dans cette tranche, pas 33 de dissociation.
  Typecheck/build et contrôles d’espaces réussis.

Les premiers essais ont révélé un branchement de qualification Electron inopérant,
des sondes de connexion 401 intermittentes et une reprise publiée dont le dialogue
perdait le résultat au tirage automatique. Deux anciens tests de thèmes ont exposé
la garde bloquant sa propre reconnaissance et un refus synchrone mal attendu.
Ces cas sont corrigés/testés ; la série finale utilise l’entrée normale du produit,
sans ouverture artificielle de portée. Aucun assouplissement des verrous, compensation,
rejeu ni autorité de forçage n’a été ajouté.

Pas de nouvelle suite générale complète verte revendiquée : l’intermittence historique
Nextcloud B reste documentée. Charge maximale, Windows, anciens clients, révocation
persistante de rôle, instance institutionnelle et acceptation finale restent ouverts.
Profils/dossiers synthétiques isolés et nettoyés ; aucun corpus utilisateur ni commit
du dépôt de travail. Le plan principal reste dans `plans/encours/`.
