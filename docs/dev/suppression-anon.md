# Suppression globale des décisions textuelles

Livraison locale, puis GitLab qualifié séparément. Geste distinct `anon.supprimer-partout`,
portée `pseudonymisation-suppression-globale` et capacité `suppressionAnonGlobale`.
WebDAV reste fermé : la dissociation ne qualifie pas cette opération destructive,
et aucun repli sur un miroir n’est autorisé.

## Effet et attribution

`src/shared/corpus/suppressionAnon.ts` inventorie les membres au format natif actuel.
Seul `annotation.type === 'anon' && annotation.regle === regleId` autorise un retrait.
Pseudonyme partagé, alias semblable ou mémoire locale ne confèrent aucune attribution.

La préparation sur copies retire ces décisions, exceptions et incluses comprises,
puis la seule définition partagée. Le document natif n’est jamais réécrit : le retrait
du marquage expose le texte d’origine uniquement où aucune autre décision ne le couvre.
Les incluses indépendantes révélées sont comptées et détaillées, avec leurs états
et choix conservés, sans recréation d’annotation.

Décisions indépendantes ou d’autres règles, déclarations locales complètes,
`pseudosDeclares`, brouillons, annotations non textuelles, positions des décisions
restantes, locuteurs et `Personne` sont inchangés. Une mémoire locale recouvrante
reste indépendante ; aucune suppression ni fusion implicite de cette mémoire.
Aucune occurrence en attente n’est posée. Les choix historiques hors des variantes
déclarées sont inventoriés sans créer de repli : leurs décisions liées seront retirées.

Sources absentes/anciennes, références malformées ou non textuelles, plages invalides,
identités répétées et recouvrements ambigus bloquent la preuve. Une barrière de
dissociation publiée interdit ce nouveau retrait. Les validations/classifications
existantes sont réutilisées en lecture, sans modifier le protocole de renommage.

## Autorité locale et préparation privée

`SuppressionsAnon` conserve trois aperçus/cinq minutes, liés à l’objet `CorpusStore`,
à la demande privée et aux SHA-256 du corpus et de **tous** ses membres.
Le clone public ne peut changer ni règle ni cibles. La tentative consomme le jeton,
y compris refus de politique, absence d’accord, péremption et fournisseur distant.

Toutes les sessions locales doivent être fermées ; journal libre, store écrivable
et non utilisé comme préparation distante. Une fermeture après un aperçu indisponible
ne l’autorise pas rétroactivement. Aucun journal ni fichier n’est écrit à la préparation.
Budgets d’implémentation : inventaire 64 Mio, aperçu 8 Mio, journal 128 Mio ; ce ne sont
pas des limites métier sur le nombre de membres.

IPC typés `corpus:apercuSuppressionAnon` et `corpus:supprimerRegleAnonPartout`.
Le dispatch distingue le local de GitLab ; WebDAV est refusé. Le service local recontrôle
le store, la politique, le fournisseur, le consentement et les empreintes avant préparation.

## Journal et reprise

`PlanRemplacementEntretiens.controleSuppressionAnon` porte règle et empreintes des
non-cibles. Seule cette suppression utilise `.transaction-fichiers.json` **version 4** ;
renommage/local/imports v1/v2 et dissociation v3 restent compatibles et inchangés.
Journal privé 0600, écriture atomique et fsync, entretiens **puis** corpus.

La lecture redérive chaque après-image depuis sa source native : seuls les retraits
attribués et dates des cibles/membership sont autorisés. Modification d’une mémoire,
annotation indépendante ou autre définition refuse le plan. Partition complète et
unique des membres, identifiants sûrs, hashes, ordre et garde obligatoires ; suppression
sans garde ou journal rétrogradé refusés.

Avant les écritures et avant retrait final, les non-cibles sont relues, natives,
comparées et exemptes de référence à la règle. Un hash forgé ne suffit pas à autoriser
un nouveau lien. Chaque cible est recontrôlée avant remplacement ; acquis et corpus
sont recontrôlés avant suppression de définition. Un corpus final avec cible encore
non appliquée est refusé. Les acquis ne sont pas réécrits à la reprise.

Concurrence, nouveau lien, disparition de source ou altération de journal suspendent
la reprise sans écrasement, compensation, consentement étendu ni réparation forcée.
Les accès filesystem directs/anciens clients restent hors d’une isolation universelle.

## Interface

**Supprimer partout** dans la colonne Actions ouvre `SuppressionRegleAnon.vue`.
Le bilan local est calculé automatiquement à l’ouverture, sans bouton « Préparer ».
Le texte principal décrit les conséquences ; passages détaillés et diagnostic d’assistance
restent repliés. Une case explicite est toujours requise, sans sélection implicite.
Annulation, piège/restauration de focus, capacités, contexte, doublons et réponses tardives protégés.
Les contrôles et journaux ne changent pas ; un échec du calcul permet d’actualiser le bilan,
mais un échec d’exécution impose toujours la réouverture, sans nouvel envoi du dialogue.
Le tirage automatique attend l’activité. Envoi actif : pas de fermeture anticipée.
Erreur d’exécution : aucun rejeu dans le dialogue, indication de réouverture du corpus
et examen du journal. La réussite reste visible après disparition de la règle.

Ce geste n’est pas une annulation du Journal utilisateur. Il ne modifie pas les
raccourcis de portée : corpus→brouillon reste fermé, corpus→entretien reste la
**dissociation**, pas une suppression des choix.

## Qualification

- Tests purs : attribution, mémoire indépendante recouvrante, variantes historiques,
  attentes, exceptions, incluses retirées/révélées et preuves invalides.
- Tests service/disque : clones, accord, TTL/cache, store/fournisseur/politique,
  sessions et sauvegarde tardive, périmés, interruptions, reprise idempotente,
  concurrence entre remplacements, journal altéré/rétrogradé et hash forgé.
- Renderer : focus, confirmation, capacités/contexte, activité et réponses tardives,
  erreurs nettoyées, absence de rejeu et suspension du tirage automatique.
- **4 parcours Electron locaux nouveaux**, plus 11 antérieurs repassés : annulation
  et retrait exact, périmé non ciblé puis nouvel aperçu, session ouverte puis fermeture
  et préparation neuve, interruption de `renameSync` et relance avec octets/mtime acquis
  inchangés. Ce dernier cas est une panne FS injectée, **pas un SIGKILL réel**.
  Captures normale/réduite examinées, sans débordement horizontal à 760×700.
- Régression hors WebDAV : **2 039 réussis/151 fichiers, 103 sautés**.
  Mémoire WebDAV : **293 réussis/10 fichiers** ; typecheck/build réussis.

Ces résultats locaux ne constituent pas une nouvelle suite générale complète verte
ni une qualification réelle distante. L’intermittence Nextcloud B historique reste documentée. Charge maximale,
Windows, anciens clients et acceptation finale restent ouverts. Corpus synthétiques
isolés, aucun corpus utilisateur ni commit du dépôt. Le plan principal reste ouvert ;
suppression distante, promotion globale et ajout/retrait de variantes restent à terminer.

## GitLab : livraison raccordée et qualifiée

`SuppressionsAnonGitLab` et `JournalSuppressionAnonGitLab` sont assemblés dans le contexte.
La portée GitLab est ouverte après les contrôles propres au moteur et au parcours produit ;
WebDAV reste fermé. IPC typés/origin-bound, bilan explicite, suivi et reprise avec nouvel
accord. Le local garde son calcul automatique ; GitLab conserve une préparation explicite.
L’ouverture normale valide le journal **avant le premier tirage**. Issue inconnue ou miroir
incomplet : tirage initial suspendu ; sources/candidats protégés jusqu’à relecture.
Un lot partiel ordinaire protège les cibles restantes/nouvelles et les sessions récupérables.
Réservation des cibles avant attente, ouvertures déjà engagées comptées, fermeture refusée
pendant publication ; non-cibles conservées. Le contexte fermé efface les aperçus.

Inventaire publié complet à un SHA, sans autorité du miroir ; trois aperçus privés,
cinq minutes, clones publics et jeton consommé à la tentative. L’expiration est également
recontrôlée après l’attente de la file. Consentement explicite ; lectures seules pendant
la préparation et la préparation de reprise. Budgets : 64 Mio d’inventaire, 8 Mio d’aperçu,
128 Mio de journal.

Le champ natif additif `suppressionAnon: { operationId, regleId }` conserve la règle
et interdit les nouvelles références sélectionnées, même inchangées. `FORMAT_VERSION`
reste 8. Les gardes existantes refusent les mutations ordinaires du corpus, dissociations
et renommages concurrents. Les gardes d’entretien GitLab et WebDAV refusent les liens
sélectionnés et les états publiés incohérents. La qualification et l’activation WebDAV
sont décrites séparément ci-dessous ; la garde partagée ne suffisait pas à les autoriser.
Les décisions indépendantes et publications non ciblées restent compatibles.

Sous bail corpus : protection publiée, puis retraits consentis sous baux **corpus et
un entretien**, jamais tous les membres. Les deux droits sont portés, renouvelés et
journalisés par le commit du retrait ciblé ; ils restent retenus si sa réponse est incertaine.
Fichiers natifs et définition/protection relus, avant-image exacte et gardes natives ;
dates des seuls entretiens retirés actualisées. Cibles tenues, locales/récupérables ou
modifiées différées, sans fermeture forcée. Nouveau lien : nouvelle préparation et
nouvel accord ; réapparition dans un acquis : examen, pas second retrait implicite.

Le retrait final conserve le bail corpus pendant le contrôle complet des références.
Les versions courantes des acquis encore membres sont gardées dans le commit final ;
une édition indépendante concurrente suspend ce retrait sans restauration. Le plafond
**248 acquis encore membres** provient des 250 actions du publieur, pas du nombre total
de membres ; dépassement annoncé avant tout commit, sans découpage. Le nominal à deux
cibles produit quatre commits de **2, 4, 4, 4 actions**.

Journal `.suppression-anon-gitlab.json` version 1, destination liée, 0600, remplacement
atomique, fsync fichier/parent. Redérivation des retraits natifs et bilans, mémoires et
annotations indépendantes inchangées, phases `barriere | entretien | retrait` et états
`a-faire | confirme | retire`. Intention durable avant transport et recontrôle des deux
droits après fsync. Le journal de publication commun doit correspondre à l’opération,
au chemin, aux octets attendus et aux gardes, pas seulement à l’identifiant du lot.

Relecture explicite : preuve du commit exact et de son contenu, sans second envoi ;
ambiguïté/historique indisponible bloquants. Progression acquise durable avant miroir.
Réinstallation des **sources actuelles**, jamais des anciennes après-images. Retrait
logique acquis avec miroir défaillant : suivi partiel persistant, relecture uniquement,
pas de faux succès ni de nouvelle suppression. Ancien client ou écriture directe reste
hors de l’isolation coopérative.

### Point de contrôle moteur antérieur

Avant le raccordement : **43 tests moteur mémoire**, inclus dans **155 tests ciblés/6 fichiers** réussis.
Les six cas réels de ce point ont été repris et étendus ci-dessous ; aucun geste produit
n’était encore activé à ce stade. Couverture moteur :
  attribution, indépendance/mémoire recouvrante, incluses révélées, tokens/TTL/file,
  cibles tenues/modifiées/retirées/nouvelles, identité `__proto__`, journal altéré,
  réponse perdue aux trois phases, garde finale et miroir incomplet après retrait.
- **6 cas réels à deux comptes** au premier contrôle, sur le banc GitLab préparé : nominal exact,
  cible tenue et ancien lien refusé, édition non ciblée/import lié refusé, nouveau lien
  avec nouvel accord, réponses perdues du premier entretien et du retrait final.
  Nouvelle instance du moteur dans le **même processus**, pas SIGKILL ni relance Electron.
  Racines synthétiques conservées pour examen des commits.
- Régression hors WebDAV : **2 091 réussis/154 fichiers, 109 tests/12 fichiers sautés**.
  Mémoire WebDAV ciblée : **157 réussis/6 fichiers** ; typecheck/build réussis.
  **15 recettes Electron locales** repassées, sans qualification du nouveau geste distant.
- Aucun nouveau résultat de suite générale complète, charge maximale, Windows, ancien
  client, rôle durablement révoqué ou serveur institutionnel. Aucun corpus utilisateur,
  commit ni push du dépôt de l’application. Le plan reste ouvert.

### Raccordement et qualification produit

- **44 tests moteur, 16 tests contexte et 20 tests renderer** : assemblage/politique,
  races d’ouverture et fermeture, reprises privées, publications indépendantes,
  garde serveur sans journal local, contexte fermé et absence de document dans le suivi.
  Retrait logique/miroir incomplet persistants, pas de faux succès. Relecture dans la
  même file pendant Actualiser, sans réentrance ; source actuelle installée sans rejouer.
- Le démarrage générique **ne reprend pas** les publications `suppression-anon-*`.
  Le journal spécialisé est validé avant cette reprise générale. Les deux droits d’un
  retrait ciblé sont rendus à la reconnaissance uniquement si la coordination vivante
  les a réellement acquis : provenance en mémoire, jamais déduite du compte/journal.
  Nouvelle coordination ou nouveau processus : preuve du commit sans libération de
  baux persistants. Aucun bail n’est hérité ou forcé.
- **8 cas réels à deux comptes** réussis : les six moteurs précédents, plus réouverture
  du contexte partiel et Actualiser sur issue inconnue. Racines synthétiques conservées.
- **4 nouveaux parcours OAuth/Electron** par l’entrée et la politique normales du produit :
  annulation/clones/accord refusé/cible tenue/nouveau consentement ; retour normal d’édition,
  texte sauvegardé et annulation avant retrait exact ; retrait final accepté avec réponse
  et historique perdus, reconnaissance sans deuxième commit ; **SIGKILL réel après e1**,
  réouverture/reconnaissance, deux baux persistants inchangés et poursuite refusée.
  Le banc vérifie mort du processus, compte et générations avant libération extérieure
  des seuls droits synthétiques ; nouvelle confirmation puis uniquement e2 et retrait.
  Octets acquis inchangés. Ce geste ne donne aucun pouvoir de libération forcée au produit.
- **6 parcours GitLab antérieurs** (4 dissociation, renommage, import ciblé) et **15 locaux**
  repassés : **25 Electron au total, pas 25 suppressions GitLab**. Captures normale,
  réduite 760×700, partielle, inconnue et baux persistants examinées.
- Régression finale hors WebDAV, mémoire WebDAV et typecheck/build consignés dans le plan.
  Pas de nouvelle suite générale complète verte, de charge maximale 248 cibles, Windows,
  ancien client, serveur institutionnel, exécutable empaqueté ou révocation durable de rôle.
  Ce contrôle GitLab n’autorisait pas WebDAV. Promotion, variante/repli et acceptation
  finale restent ouverts ; la qualification propre WebDAV est décrite ci-dessous.

## WebDAV : suppression et reprise qualifiées dans l’application

`SuppressionsAnonWebDAV` et `JournalSuppressionAnonWebDAV` sont assemblés aux
transactions/contexte, avec routage IPC contrôlé et dialogue de suivi/reprise.
`anon.supprimer-partout`, sa portée et `suppressionAnonGlobale` sont ouverts après
qualification propre du parcours normal A/B. Cette étape constitue la seizième livraison.
Le contrôle moteur ci-dessous reste un point historique distinct, pas sa qualification produit.

- Inventaire GET publié complet, fichiers natifs actuels, corpus relu octets + ETag fort ;
  64 Mio d’inventaire et 8 Mio d’aperçu, trois aperçus privés/cinq minutes. Pas de miroir
  faisant autorité. Token consommé même sans confirmation, délai revérifié après attente.
- Protection `suppressionAnon` publiée en conservant la règle, puis seules cibles
  consenties sous corpus→un entretien. Exact avant consenti, dates fraîches, PUT If-Match,
  marge de 60 secondes après fsync et relecture corpus près du transport cible.
  Non-cibles ni verrouillées ni installées ; cibles tenues/modifiées/locales/récupérables
  différées. Nouveaux usages et retraits de cible explicités dans un nouvel aperçu.
- Retrait uniquement des décisions explicitement liées, exceptions comprises.
  Texte, décisions indépendantes, mémoire complète même recouvrante, brouillons,
  pseudos déclarés, locuteurs et Personne préservés. Pas de transfert de déclaration.
  Une modification indépendante valide ultérieure de mémoire n’est pas restaurée.
  Nouveau lien dans un acquis ou mémoire acquise invalide suspend la preuve finale.
- Corpus tenu pendant l’inventaire final jusqu’au PUT de retrait règle/protection.
  La garde ordinaire existante refuse les anciens liens, même inchangés. Pas d’atomicité
  multi-fichiers, de compensation, de contrôle universel des anciens/directs clients,
  de plafond GitLab 248 transposé à WebDAV ni de découpage implicite.
- Journal `.suppression-anon-webdav.json` version 1 : destination liée, 0600,
  temporaire unique/renommage/fsync fichier et parent, 128 Mio. Avant/après exacts,
  ETag, transformations/bilans re-dérivés, progression et `miroirComplet` durable.
  Retrait acquis avec copie incomplète reste partiel dans une nouvelle instance.
  Sources actuelles installées après preuve, jamais images historiques.
- Intention avant PUT ; refus certain et refus avant transport effacent l’intention.
  Issue inconnue retient les seuls verrous réellement acquis ; instance vivante renouvelle
  ses droits connus. Relecture reconnaît les octets acceptés sans deuxième PUT ;
  les octets originaux ne prouvent jamais un refus. Nouvelle instance ne reprend aucun
  verrou persistant, même du même compte. Aucun forçage ni droit de libération déduit.
  Les identités d’opération `suppression-anon-*` sont exclues des orphelins de session.

### Point de contrôle moteur antérieur

- **61 cas mémoire**, verrous conditionnels et natifs : attribution exacte/incluses
  révélées, indépendants/mémoire recouvrante, règle inutilisée, 300 membres/deux cibles,
  clones/TTL/cache, cible tenue/modifiée/récupérable/retirée/nouvelle, `__proto__`,
  re-lien acquis/mémoire invalide, garde ordinaire, PUT inconnu/refus certain,
  reprise GET seule, fsync/délai/corpus changé près du transport, journal falsifié,
  miroir incomplet durable et ouverture préparatoire refusée avant réseau.
- **14 cas Nextcloud réels, sept par banc A/B**, racines synthétiques isolées :
  nominal/non-cible tenue, cible tenue/ancien lien refusé, modification du second compte,
  re-lien direct d’un acquis sans retrait implicite, trois phases avec réponses perdues,
  nouvelle instance sans héritage de droits, **deux SIGKILL réels du moteur**.
  Mort confirmée, compte OCS et propriétaires/générations/ETags stables vérifiés avant
  libération extérieure des seuls droits synthétiques ; reprise sous nouvel accord
  envoie uniquement e2 et le retrait. Octets e1 acquis inchangés.
- **218 tests mémoire/7 fichiers**, **2 116 tests/155 fichiers hors WebDAV réussis**,
  111 tests/12 fichiers sautés ; typecheck/build et **15 parcours Electron locaux** réussis.
  Les 14 réels passent en 552 secondes. Pas de nouvelle recette WebDAV/OAuth/Electron,
  de nouvelle suite générale complète verte, de charge maximale, Windows, ancien client,
  empaquetage, instance institutionnelle ni révocation persistante de rôle.
  À ce stade, raccordement et qualification du parcours normal restaient nécessaires avant activation.

### Raccordement et qualification produit

- Transactions : identités `suppression-anon-*`, providers corpus/entretien propres,
  sessions locales et récupérables, exclusions entre import/renommage/dissociation/thèmes.
  Contexte : cibles réservées avant attente, ouvertures engagées comptées, fermeture et
  tirage refusés pendant activité. Sessions non ciblées maintenues ; aperçu effacé à fermeture.
- Journal validé avant réseau. Publication inconnue ou miroir incomplet : aucun tirage
  initial sur les candidats. Lot partiel ordinaire : cibles du journal/nouvelles exclues.
  Migration et reprise automatique d’orphelins suspendues pendant le suivi.
  Actualiser relit la preuve puis tire les seules sources non protégées, sans PUT de reprise.
- IPC typé et contrôles d’origine après attente ; dialogue et bannière WebDAV persistants,
  préparation distante explicite, reprise avec nouvel accord, absence de suivi sans nouveau
  retrait. Issue inconnue/retrait acquis/copie incomplète : relecture seulement.
- **26 tests contexte**, providers natifs et conditionnels ; **152 tests ciblés/6 fichiers**,
  puis **244 tests mémoire/8 fichiers** réussis. Renderer commun : préparation explicite,
  consentement neuf, panne de suivi et interdiction du second envoi sur les deux fournisseurs.
- **8 nouveaux parcours Electron A/B** par l’entrée et la politique normales : annulation,
  mémoire et retraits exacts, cible tenue/nouveaux usages/nouvel accord ; édition sauvegardée
  et annulation ; retrait final accepté avec réponse perdue, reconnaissance sans répétition ;
  **deux SIGKILL après e1**, réouverture, droits persistants inchangés et poursuite refusée.
  Le banc vérifie décès, compte OCS et propriétaires/générations/ETags avant libération
  extérieure des seuls droits synthétiques. Accord frais puis e2/retrait seulement ; e1 inchangé.
  Captures normale/réduite 760×700/partielle/inconnue/verrous persistants examinées.
- Série commune : **29 parcours réussis, 1 échec sur 30**, à la réouverture d’un import
  antérieur sur B : `PROPFIND → 401`. Les huit suppressions, huit dissociations et six
  renommages passent. L’import concerné repasse inchangé isolément ; cela ne rend pas
  la série de 30 verte. **15 parcours locaux** réussis. Le nouveau fichier appartient
  au projet Playwright `pile`, séquentiel, et non au projet local.
- **2 119 tests/155 fichiers hors WebDAV réussis, 111 tests/12 fichiers sautés**.
  Typecheck/build et espaces vérifiés. Aucun nouveau résultat de suite générale complète,
  charge maximale, Windows, ancien client, empaquetage, instance institutionnelle,
  révocation permanente de rôle ni qualification réelle GitLab revendiqué.
  Le plan reste dans `plans/encours/` jusqu’à acceptation finale.
