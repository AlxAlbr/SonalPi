# Variantes de pseudonymisation

## Ajout d’une seconde variante — local, GitLab et WebDAV

`ajouterVarianteAnon` reçoit la définition attendue complète et le nouveau pseudonyme.
La définition présente est relue, validée et comparée sur identité, alias, pseudos et catégorie.
Une divergence refuse l’ajout ; aucune variante, catégorie ou identité n’est remplacée.
NFC/espaces normalisés ; doublon insensible à la casse sans mutation.
Deux variantes maximum, pour une seule entité ; plusieurs alias restent à un seul pseudo.
Un pseudo partagé avec une autre règle ne fusionne rien.

`CorpusStore.regleAnonAjouterVariante` ne publie que `corpus.json`, avec le remplacement
atomique existant. Un doublon ne réécrit pas ce fichier. Lecture seule, journal local en
attente ou protection de suppression/dissociation refusent. Les entretiens, leurs dates,
annotations et mémoires, brouillons, exceptions, locuteurs et Personne restent intacts.
Une session ouverte n’impose pas sa fermeture pour ce seul ajout de définition.

IPC `corpus:regleAnonAjouterVariante`, demande et résultat typés.
Geste `anon.ajouter-variante`, portée `pseudonymisation-ajout-variante`, capacité
`ajoutVarianteAnon` : **local, GitLab et WebDAV ouverts**, après qualifications séparées.
Le geste antérieur `anon.ajouter-pseudo` du dialogue « Garder les deux » est inchangé.
La qualification des autres opérations ne vaut pas qualification de cette nouvelle UI distante.

Dans la colonne Pseudonyme, cliquer sur le libellé complet ouvre `EditionPseudosAnon.vue`.
Un seul champ prérempli `Claire / Rebecca` remplace le bouton supplémentaire et son dialogue.
`FormulaireRegleAnon.vue` utilise également un champ Pseudonymes unique avec `/`.
`editionPseudosAnon.ts` distingue ajout, renommage d’une seule variante, retrait et valeur inchangée.
Saisie incomplète, doublon, troisième variante et opérations mélangées refusés.
Le retrait d’une valeur, en conservant l’autre à l’identique, ouvre son bilan protégé local ou GitLab.
Aucune troncature, réattribution par ordre ou transformation de `/` en pseudo littéral.
Le renommage reçoit la saisie dans son bilan protégé existant, sans publication directe.
Un suivi en attente ouvre directement ce bilan ; lecture impossible bloque l’édition.
Lecture seule désactive l’édition ; ajout, renommage et retrait ont des capacités distinctes.
Le retrait est ouvert au local et sur GitLab après qualifications propres ; WebDAV reste fermé.
Saisie/confirmation explicites, focus et Escape, navigation gardée tant que le dialogue est ouvert.
Définition copiée à ouverture ; changement de contexte/définition/disponibilité invalide la fenêtre.
Pour l’ajout, une seule tentative IPC par fenêtre ; doubles envois et annulation en cours refusés.
Réponses tardives ignorées ; erreurs ordinaires et assistance repliée.
Après succès, fermeture puis actualisation, jamais application des occurrences en attente.
Après erreur, fermeture puis actualisation pour vérifier la définition, pas de répétition aveugle.

## Qualification locale initiale

- **28 tests purs/store**, préservation exacte, définition périmée, doublons sans écriture,
  identités héritées, pseudo partagé, limites, lecture seule/journal/protections et session ouverte.
  Échec injecté avant remplacement, ancienne définition intacte, réouverture et ajout frais.
- **14 tests renderer**, consentement explicite, contexte/disponibilité, focus, Escape,
  doubles envois, absence de répétition après erreur et réponses tardives.
  Tests du tableau et politique par fournisseur, promotion simple antérieure conservée.
- **262 tests ciblés/8 fichiers**, **2 161 tests hors WebDAV/157 fichiers réussis**,
  **111 tests/12 fichiers sautés** ; **244 tests mémoire WebDAV/8 fichiers réussis**.
- **17 parcours Electron locaux réussis** : deux nouveaux ajouts et quinze régressions.
  Annulation/doublon/définition changée/recalcul/succès, entretiens exactement inchangés ;
  erreur injectée **après** remplacement du corpus, définition acquise reconnue par Actualiser
  sans deuxième ajout. Injections filesystem, **pas SIGKILL**.
  Captures normale/réduite 760×700 examinées, typecheck/build et espaces vérifiés.
- Pas de qualification réelle GitLab ou Nextcloud, suite générale complète verte,
  charge maximale, Windows, ancien client ou instance institutionnelle supplémentaire.
  Aucun corpus utilisateur ni commit/push/reset du dépôt.

## Simplification demandée : même saisie avec slash

Le bouton `+ Variante` et `AjoutVarianteAnon.vue` sont supprimés, pas conservés comme
parcours parallèle. C’est une correction de la livraison 17, pas une livraison supplémentaire.
Le moteur d’ajout, sa définition attendue et les protocoles de renommage restent inchangés.
Tests de saisie, création, renderer et tableau couvrent la convention commune et ses refus.
Régression du renommage réel : un parcours OAuth GitLab et six Electron Nextcloud A/B
réussis, avec suivi/reprise, publication incertaine et refus des droits persistants.
Ils ne qualifiaient **pas** l’ajout distant, qui restait fermé à ce point de contrôle. Captures locales normale/réduite
examinées ; les autres réserves de suite générale et de plateforme restent inchangées.
**94 tests ciblés/6 fichiers**, puis **2 188 tests/158 fichiers hors WebDAV réussis**,
**111 tests/12 fichiers sautés** ; sélection de **237 tests mémoire WebDAV/8 fichiers** réussie.
**17 parcours Electron locaux** répétés après le contrôle empêchant `/` dans le bilan
avancé de renommage ; typecheck/build/espaces vérifiés. Les sept parcours distants ci-dessus
concernent le changement d’accès au renommage, pas une nouvelle livraison d’ajout distant.

## Ajout GitLab — livraison 18

Le dispatch nommé et la file de contexte envoient le même ajout à la préparation des
définitions, sur `corpus.json` frais sous son seul bail. La définition attendue comprend
la catégorie. Candidat limité aux règles ; classement, membership et dates bruts conservés,
sans publier les ajustements internes du store. Aucun GET/garde/bail/écriture d’entretien.
Les sessions indépendantes restent ouvertes, les droits corpus tenus refusent ; un entretien
tenu ne bloque pas cet ajout. Format courant obligatoire, doubles variantes/alias multiples,
protection et autres opérations incompatibles refusés. Contexte et politique recontrôlés
dans la file avant acquisition ; une fermeture déjà engagée n’autorise aucun ajout tardif.

Identifiants `ajout-variante-*` dans le journal commun des publications, sans nouveau
journal métier. Une réponse incertaine reste journalisée et suspend son droit ; résultat
non prouvé bloque nouvel ajout, ouverture/actualisation et installation. Recherche vide
et original inchangé ne prouvent pas un refus. Seul un commit unique avec les octets/actions
prévus confirme. `Actualiser` réconcilie puis tire le corpus actuel, sans renvoyer l’ajout.
Le démarrage reconnaît aussi l’acceptation, sans rejouer ni installer une ancienne image.

`BailGitLab.rendreBailAcquis` exige la provenance d’acquisition de cette instance, droit
non invalidé/non expiré, propriétaire complet et génération actuels sous garde. Compte,
journal et génération seuls ne donnent aucun droit. Une nouvelle instance conserve le
bail persistant ; un autre ajout refuse, sans autorité de forçage. Les autres gestes gardent
leur reprise antérieure ; le comportement spécialisé ne s’applique qu’aux nouveaux ajouts.

Qualification : **19 cas mémoire propres**, dans **125 tests ciblés/6 fichiers** ;
**six scénarios réels à deux comptes** réussis : corpus seul/sources exactes/doublon,
corpus et entretien tenus, définition périmée et course au commit, autorisation refusée,
perte acceptée reconnue vivante et nouvelle instance sans héritage des droits.
**Quatre nouveaux parcours OAuth/Electron** réussis puis repassés dans une série de
**14 GitLab réussis** (quatre ajouts, dix régressions), dont **SIGKILL réel** après ajout
accepté. Sources et bail persistants exactement conservés ; libération externe de fixture
après preuve de mort, compte, propriétaire/génération et version serveur, puis accord
neuf pour une autre règle, pas répétition de l’ajout acquis.
Premier parcours périmé trop pressé après clic Actualiser : le test attend maintenant
la fin du tirage et la catégorie visible fraîche, sans assouplir la garde de définition.
Captures normale/réduite 760×700 et bail persistant examinées.

**2 208 tests/159 fichiers hors WebDAV réussis, 117 tests/13 fichiers sautés** ;
**237 tests mémoire WebDAV/8 fichiers** et **17 parcours Electron locaux** réussis,
typecheck/build/espaces vérifiés. Aucun nouveau résultat de suite générale complète,
Nextcloud réel, charge maximale, Windows, anciens clients ou rôle durablement révoqué.
Les refus de droits injectent un credential invalide, pas une révocation permanente.
Aucun corpus utilisateur ni commit/push/reset du dépôt ; projets/racines synthétiques
GitLab conservés pour examen. WebDAV restait fermé jusqu’à la qualification propre ci-dessous.

## Ajout WebDAV — livraison 19

`AjoutsVarianteAnonWebDAV` prépare directement depuis le `corpus.json` publié sous
son seul droit conditionnel, avec identité `ajout-variante-*` propre à l’opération.
Définition attendue complète recontrôlée, format natif courant et ETag fort exigés.
Aucun accès aux entretiens, aucune normalisation du membership, du classement ou des dates.
Doublon sans publication ; droits corpus tenus et changements concurrents refusés.
Sessions indépendantes conservées ; aucun attachement, placement ou choix de locuteur.

Le journal `.ajout-variante-anon-webdav.json` est lié à la destination et privé 0600 :
création temporaire exclusive, remplacement atomique, fsync fichier et dossier, 24 Mio maximum.
Il conserve demande, source, candidat exact, ETag initial et phase envoi/confirmation.
Le candidat est redérivé à la lecture : aucune autre modification de corpus n’est autorisée.
Corpus limité à 8 Mio, distinct des budgets des autres opérations.
Intention durable avant PUT ; droit recontrôlé après sauvegarde et près du transport,
avec relecture corpus octets/ETag et marge de 60 secondes. PUT If-Match sans retry.
Un refus certain avant publication efface l’intention ; une issue inconnue la conserve.
La réponse reçue confirme durablement l’envoi avant installation du miroir.
Une panne de lecture ou d’installation après acceptation reste à vérifier, sans rejouer.

`Actualiser` et le démarrage reconnaissent une intention inconnue seulement par l’image
exacte acceptée et son ETag fort. L’original seul et une autre image restent indéterminés.
Après confirmation, installer la source courante, jamais restaurer le candidat historique.
La relecture ne fait aucun PUT de données. Le provider détenu par la coordination vivante
seul peut rendre son droit, avant échéance et après vérification du propriétaire complet
et de la génération, sous sa propre garde. Un processus rouvert n’acquiert ni ne libère
ce droit ancien : autre ajout refusé tant qu’il reste tenu.

Transactions/contexte, IPC et capacité utilisent le parcours spécialisé, pas la transaction
WebDAV générique. Activité réservée avant await ; fermeture, actualisation concurrente,
second ajout et opérations incompatibles refusés. Journal invalide refusé avant réseau ;
reprise avant tirage initial, sans migration ni archivage automatique pendant cette ouverture.
Le champ `/` reste unique ; tirage automatique suspendu pendant l’envoi et recontrôle du
contexte avant départ IPC. Une erreur n’autorise aucune seconde tentative dans la fenêtre.

Qualification : **32 cas moteur mémoire + 12 contexte** natif/conditionnel ; **14 cas réels
Nextcloud A/B à deux comptes**, sources et ETags d’entretien exacts, droits corpus/entretien
indépendants, catégorie périmée, concurrence If-Match, credential invalide, perte de réponse,
original insuffisant et nouvelle instance sans héritage des droits.
**Huit nouveaux parcours Electron A/B**, dont **deux vrais SIGKILL après acceptation**,
reconnaissance au démarrage sans DELETE du droit persistant, autre ajout refusé, puis
libération extérieure de fixture après preuve de mort/compte/propriétaire/génération/ETag
et nouvelle saisie pour une autre règle. Aucun deuxième PUT de l’ajout acquis.
Premier lancement : **7/8**, dialogue de connexion effacé pendant le chargement local
initial du profil de test. Profil neuf sans récent local automatique ; série entière **8/8**
puis **14/14** avec les six régressions de renommage WebDAV, sans assouplissement produit.
Captures normale/réduite 760×700 et refus du droit persistant examinées.

Régressions finales : **131 tests ciblés/6 fichiers**, **2 210 tests/159 fichiers hors
WebDAV réussis, 117 tests/13 fichiers sautés**, **281 tests mémoire WebDAV/10 fichiers**,
**17 Electron locaux** et **quatre OAuth/Electron d’ajout GitLab** réussis.
Typecheck/build/espaces vérifiés. Une ancienne assertion de capacité et une mauvaise
utilisation de ref dans deux nouveaux tests ont été corrigées, puis suites repassées.
Les résultats et les limites sont également consignés dans le plan principal.
La sélection précédente de 30 parcours WebDAV reste historiquement 29/30 ; les 14 parcours
ci-dessus ne la remplacent pas. Pas de qualification supplémentaire de charge maximale,
Windows, ancien client, instance institutionnelle ou rôle durablement révoqué.
Aucun corpus utilisateur ni reset/commit/push ; données et profils de test isolés.

## Retrait local avec remplacement explicite — livraison 20

`retraitVarianteAnon.ts` exige deux variantes canoniques et la définition attendue complète.
La valeur conservée est le seul remplacement autorisé ; nouveau pseudo, retrait/renommage
mélangés et définition périmée refusés. L’inventaire reprend les contrôles de suppression,
puis sélectionne uniquement les choix textuels explicitement liés à la règle et utilisant
la variante retirée (NFC/espaces/casse). Exceptions et passages masqués sont inclus.
Seul `pseudo` change dans ces annotations : état, identifiant, positions et original intacts.
La définition garde la variante restante. Les autres variantes/choix historiques,
indépendants, déclarations locales complètes même recouvrantes, mémoire héritée, brouillons,
locuteurs, Personne et passages en attente ne sont ni modifiés ni rattachés.

`RetraitsVarianteAnon` conserve trois préparations privées au maximum, cinq minutes,
clonées et liées au store et aux SHA-256 du corpus et de tous ses membres.
64 Mio d’inventaire, 8 Mio de bilan public, 128 Mio de journal. Confirmation stricte,
consommation du token sur toute tentative, politique locale fraîche, corpus writable,
journal libre et sessions d’édition fermées. Une fermeture ultérieure ne peut pas autoriser
un bilan qui ne permettait pas l’écriture. Aucune fermeture forcée et aucun repli distant
sur un miroir. Capacité `retraitVarianteAnon`, geste `anon.retirer-variante`, portée
`pseudonymisation-retrait-variante` : local seulement à la livraison 20, puis GitLab à la livraison 21.

IPC typés `corpus:apercuRetraitVarianteAnon` et `corpus:retirerVarianteAnon`.
Le champ Pseudonymes commun route l’intention vers `RetraitVarianteAnon.vue`, sans publication.
Bilan local automatique, remplacement restant nommé explicitement, checkbox de consentement,
passages facultatifs, focus/Escape et contexte/activité gardés, tirage automatique suspendu
pendant calcul/envoi. Aucune répétition après erreur ; rouvrir le corpus pour vérifier.
Aucun bouton d’ajout parallèle ni remplacement libre de l’array des pseudos.

`PlanRemplacementEntretiens.controleRetraitVariante` impose le journal version 5, 0600,
entretiens puis corpus, couverture cibles/non-cibles complète, transformations redérivées
et dates exactes. Garde absente, version/opération rétrogradées, repli modifié, mémoire
altérée, hash forgé et finalisation prématurée refusés. Non-cibles vérifiés par empreinte
et preuve d’absence de choix de la variante retirée ; leurs liens vers la variante restante
restent permis. Les sources acquises/courantes sont recontrôlées avant finalisation.
Reprise idempotente sans réécriture de l’acquis, sans restauration ni compensation.
Une variante inutilisée ne change que le corpus, sans modifier les dates ou fichiers d’entretien.

Qualification : **149 tests ciblés/8 fichiers**, **2 291 tests/162 fichiers hors WebDAV
réussis, 117 tests/13 fichiers sautés**, **281 tests mémoire WebDAV/10 fichiers réussis**.
**Quatre nouveaux parcours Electron locaux** réussis, puis repassés dans **21 locaux** :
annuler/consentir, remplacer exactement avec exceptions et masqués, non-cible périmée et
nouvel examen, session ouverte/fermeture et accord neuf, panne filesystem puis relance,
journal v5 et acquis octets/mtime intacts. Injection de `renameSync`, **pas SIGKILL local**.
Captures normale/réduite 760×700 examinées ; typecheck/build/espaces vérifiés.
**Quatre régressions OAuth/Electron d’ajout GitLab et huit d’ajout WebDAV A/B** réussies ;
elles ne qualifient pas le retrait distant, qui reste fermé.
Pas de nouvelle suite générale complète verte, série WebDAV globale verte, charge maximale,
Windows, ancien client ou serveur institutionnel. Aucun corpus utilisateur ni reset/commit/push.

## Moteur de retrait GitLab — tranche préparatoire, parcours produit fermé

`RetraitsVarianteAnonGitLab` et `JournalRetraitVarianteAnonGitLab` implémentent un lot ciblé,
non atomique, distinct de la suppression de règle. Inventaire publié au même SHA par
`CorrespondancesGitLab`, aucune autorité du miroir. Définition attendue complète et
remplacement restant imposés. Trois bilans privés/cinq minutes, 8 Mio ; expiration
recontrôlée dans la file et après l’acquisition/lecture lente avant la protection initiale.
Les limites d’inventaire du lecteur restent inchangées (64 Mio).

La propriété native additive `retraitVarianteAnon` protège le remplacement en conservant
les deux variantes : `operationId`, `regleId`, `pseudoRetire`, `pseudoConserve`, tous validés.
Bail corpus pour la protection initiale, puis corpus→une cible, avant-image exacte,
garde du corpus et repli qui ne change que les pseudonymes sélectionnés et la date cible.
Les sessions locales/récupérables, cibles tenues ou modifiées sont différées.
Aucun droit, installation ou fermeture dans un entretien non ciblé ; ses choix vers la
variante restante et ses éditions indépendantes restent permis.
Le contrôle final sous droit corpus prouve l’absence de choix liés vers la variante retirée,
vérifie les acquis actuels et garde leurs versions dans le commit retirant la variante
et sa protection, pas la règle. Budget du publieur : 248 acquis encore membres maximum,
pas un plafond de membres ou une limite WebDAV ; pas de découpage implicite.
Nouveaux choix et retraits de cibles exigent une reprise fraîche examinée et consentie.
Réapparition de l’ancien choix dans un acquis ou données invalides : refus, sans restauration.

Les gardes de mutations du corpus incluent cette protection. Les publications GitLab
refusent tout choix lié de la variante retirée sous protection, même inchangé, exception
mémorisée comprise. Après finalisation, une exception nouvelle ou dont le pseudo lié change
exige un pseudo actuellement déclaré ; les pseudos historiques inchangés restent conservés.
Cette distinction empêche la réintroduction tardive sans réécrire la mémoire historique.
Le garde corpus des écritures ordinaires ferme la course avec la finalisation.
Anciens clients et écritures directes restent hors de l’isolation coopérative.

Journal `.retrait-variante-anon-gitlab.json` v1 lié à destination/branche/racine,
0600, temporaire exclusif, remplacement atomique, fsync fichier et dossier, 128 Mio.
Candidats/bilans redérivés ; états, mémoire, définition, destination, progression et
intention/chemins vérifiés. Intention avant commit, confirmation durable avant miroir.
Miroir incomplet persistant et réinstallation des sources actuelles uniquement.
Réponse inconnue : journal commun/intention exacts et commit unique requis, aucune répétition.
L’original et un historique vide ne prouvent pas le refus, y compris dans le publieur commun.
Relecture sans héritage de droits : `rendreBailAcquis` exige la provenance de l’instance,
propriétaire/génération actuels et droit vivant. La reprise générique ignore ces opérations.
Une nouvelle coordination peut reconnaître la publication sans libérer les baux persistants.

À ce premier point, factory `TransactionsGitLab.creerRetraitsVarianteAnon`, mais **pas de
raccordement contexte/IPC/dialogue distant ni d’activation**. L’ouverture vérifie le journal spécialisé
avant tirage/reprise générique ; un lot incomplet refuse actuellement l’ouverture produit,
sans remplacer le miroir. Cette fermeture provisoire doit être remplacée par le suivi
produit protégé avant activation. La saisie locale et les ajouts distants sont inchangés.

Qualification : **43 nouveaux cas mémoire**, inclus dans **155 ciblés/5 fichiers** ;
**huit scénarios réels GitLab à deux comptes**, puis répétés avec **12 régressions
réelles d’écriture ordinaire**, soit **20 réussis et un cas informatif sauté**.
Nominal six choix/trois exceptions/deux masqués, cible tenue et sauvegarde refusée,
non-cible liée éditée, import périmé refusé, nouveau choix direct/nouvel accord,
réponses acceptées perdues aux trois phases, coordination neuve sans droits hérités.
Réinstanciations dans le même processus, **pas SIGKILL ni OAuth/Electron du retrait**.
Premier passage **7/8** : l’injection ignorait les commits du corpus seul. Option de fixture
ajoutée pour ce banc uniquement ; série **8/8**, puis **20/20 exécutés**, produit inchangé.

Régressions : **2 334 tests/163 fichiers hors WebDAV réussis, 125 tests/14 fichiers sautés**,
**281 mémoire WebDAV/10 fichiers**, **21 Electron locaux**, typecheck/build/espaces réussis.
Les huit qualifications réelles sont conditionnelles dans la suite générale hors WebDAV,
puis exécutées séparément avec les deux comptes. Pas de nouvelle suite complète verte,
parcours distant du retrait, charge maximale, Windows, instance institutionnelle,
ancien client ou révocation permanente de rôle. Racines GitLab synthétiques conservées,
aucun corpus utilisateur ni reset/commit/push de l’application. **Toujours vingt livraisons**.

## Raccord au contexte GitLab — tranche préparatoire suivante

`ContexteGitLab` assemble désormais le service avec ses sessions actives et récupérables.
Le contexte réserve les seules cibles consenties avant toute attente. Leur ouverture et
le changement de corpus sont refusés pendant le travail ; les sessions indépendantes
restent ouvertes, sans fermeture forcée. Une ouverture déjà engagée compte immédiatement
comme session locale et diffère le remplacement, même avant sa réponse.
Un lot partiel protège les cibles restantes et nouvelles du tirage et des ouvertures.
Définitions, imports, suppression/dissociation et nouveau renommage sont incompatibles ;
les écritures indépendantes vers la variante restante demeurent possibles.

Préparation, application et reprise recontrôlent contexte et politique dans la file,
après les lectures longues et avant transport, après intention durable. Si la politique
se ferme après un acquis, celui-ci reste acquis et aucun envoi suivant n’est autorisé.
Toute tentative d’application consomme son aperçu ; la fermeture efface les aperçus.
Le suivi reste lisible même si la politique d’écriture se ferme.
`Actualiser` réconcilie dans la file déjà détenue, sans réentrance ni nouvel envoi ;
l’installation défaillante se répare par relecture des sources actuelles uniquement.

**19 nouveaux tests mémoire de contexte**, dont politique modifiée pendant attente/lecture,
sessions ouvertes/récupérables, réservation et fermeture, nouveau choix/accord neuf,
miroir défaillant et réponses perdues aux trois phases. Première sélection : **91/92**,
une assertion de fixture comptait six commits au lieu des cinq attendus sans répétition
des acquis. Assertion corrigée ; **92/92**, puis **94/94 sur quatre fichiers** après deux
contrôles de politique supplémentaires. Régression hors WebDAV : **2 353 tests/164 fichiers réussis, 125 tests/14 fichiers sautés**.
Les **huit scénarios réels de moteur** ont repassé avec les **12 régressions ordinaires** :
**20 réussis, un cas informatif sauté**. Ils n’exercent pas encore le nouveau contexte
par l’entrée OAuth du produit. Typecheck/build réussis.

**À ce point, pas encore d’IPC distant, de suivi renderer ni d’activation.** L’ouverture
d’un journal incomplet restait provisoirement refusée avant tirage/reprise générique.
Aucun nouveau SIGKILL, parcours Electron du retrait distant, suite générale complète,
Nextcloud réel ou charge maximale revendiqué. Toujours vingt livraisons, plan ouvert.

## IPC, suivi et ouverture protégée GitLab — raccord préparatoire

`CommandesRetraitVarianteAnon` centralise le dispatch local/GitLab et les contrôles de
corpus/génération. WebDAV refuse, sans repli sur le miroir. Tout aperçu devenu périmé ou
interdit est détruit ; un résultat hors contexte ne provoque pas de deuxième tentative.
IPC typés : préparation, application, suivi, relecture et préparation de reprise.
Lecture du suivi permise même quand la capacité d’écriture est fermée.

Le dialogue commun `RetraitVarianteAnon.vue` garde le bilan automatique local, mais demande
une préparation explicite sur GitLab. Résultat partiel ou inconnu : avancement des acquis,
lecture du suivi sans envoi, bilan frais de reprise et nouvel accord. Exceptions en clair et
choix masqués restent explicitement expliqués ; informations d’assistance repliées.
Suivi absent ou portant une autre demande ne donne aucune autorisation de recommencer.
Variante déjà retirée/miroir incomplet : uniquement relecture, jamais nouvelle application.
Réponses tardives ignorées, tirage suspendu pendant le travail, focus et navigation gardés.
Le panneau conserve le suivi et le relit localement chaque seconde, sans préparation serveur.
Un retrait engagé prend priorité sur une nouvelle édition du champ Pseudonymes.
Un suivi précédemment connu devenu absent maintient le blocage jusqu’à examen explicite.

La réouverture d’un journal incomplet passe désormais par le suivi protégé : validation du
journal avant tirage, aucun tirage initial ni reprise générique de publications/sessions,
aucune observation serveur initiale ou libération d’un droit ancien. Services de suivi
obligatoires ; copie locale conservée, sources récupérables et cibles restantes exclues.
La relecture explicite et `Actualiser` gardent la preuve native et les sources actuelles.
Ce raccord remplace le refus provisoire d’ouverture, **pas la fermeture du geste**.

**37 nouveaux tests mémoire** : 11 dispatch, 15 dialogue, huit panneau, trois réouvertures.
**145 tests ciblés/huit fichiers réussis**, avec régressions contexte dissociation/suppression.
Premier passage du panneau : une capacité simulée sans ref réactive ne déclenchait pas le
computed ; fixture corrigée avec une ref, aucun contrôle produit retiré.
Deux nouveaux scénarios réels de contexte : réouverture partielle/cible hors tirage/reprise
consentie ; contexte et coordination neufs/issue inconnue reconnue/droits persistants refusés.
**22 tests réels réussis, un informatif sauté**, dont dix retrait moteur/contexte et douze
écritures ordinaires. Premier passage : **21 réussis, un échoué**, assertion comparant une
propriété `undefined` de fixture au JSON serveur qui l’omet ; comparaison à la source publiée
corrigée puis sélection entière repassée. Réinstanciation, **pas arrêt réel du retrait**.

**2 390 tests/167 fichiers hors WebDAV réussis, 127 tests/14 fichiers sautés** ;
**281 mémoire WebDAV/dix fichiers**, **21 Electron locaux** et **quatre régressions
OAuth/Electron d’ajout GitLab** réussis. Le SIGKILL de cette dernière série concerne l’ajout,
**pas le retrait GitLab**. Typecheck/build/espaces vérifiés. Aucune nouvelle suite générale
complète verte ni qualification supplémentaire Nextcloud réelle, charge maximale ou ancien
client. Pas de corpus utilisateur, reset/commit/push. Toujours vingt livraisons, plan ouvert.

## Retrait GitLab — qualification dans l’application et activation, livraison 21

Les tranches précédentes décrivent les points de contrôle avant activation.
`e2e/retrait-variante-gitlab.e2e.ts` ajoute **cinq parcours de bout en bout du retrait dans
l’application**, connexion habituelle et deux comptes synthétiques :

- Saisie `/`, préparation distante explicite, annulation, accord absent consommant le bilan,
  copie forgée sans autorité, corpus/cible tenus, succès partiel, nouveau choix découvert
  et nouvelle confirmation avant reprise.
- Retour normal de l’édition, sauvegarde conservée, définition changée après bilan refusée,
  puis nouveau bilan et remplacement exact des seuls pseudos liés, exceptions comprises.
- Pendant un lot partiel, édition et sauvegarde d’une non-cible liée à la variante restante,
  priorité au suivi lors du clic sur Pseudonymes, reprise restante et source indépendante intacte.
- Retrait final accepté/réponse et recherche indisponibles : suivi indéterminé, nouvelle
  application interdite, relecture puis succès sans répétition d’e1, e2 ou du retrait.
- **SIGKILL réel après e1 accepté**, sortie du processus prouvée, reconnexion normale,
  reconnaissance et acquis inchangés, droits corpus/e1 persistants inchangés et poursuite
  refusée. Libération extérieure du harnais seulement après preuve de mort, compte,
  propriétaire, génération et version vérifiés ; bilan neuf/accord neuf, seuls e2 et retrait envoyés.

Avant activation, cinq parcours réussis sur une copie compilée isolée dont seule la liste
des portées est ouverte pour ce geste. `e2e/util.ts` permet de choisir cette copie ; aucun
paramètre de qualification ajouté au produit. Le build normal activé a un main identique
à cette copie. **13 parcours GitLab réussis** sur le build normal, sans copie ni drapeau :
les cinq retraits, quatre régressions de suppression et quatre d’ajout. Le SIGKILL du retrait
est ainsi qualifié pour lui-même, pas déduit des autres gestes. Captures normale/réduite
760×700, partielle, indéterminée et droits persistants examinées.

`pseudonymisation-retrait-variante` ouverte **sur GitLab seulement**, tests de matrice
et refus WebDAV explicites. Aucun repli local, contrôle de contexte/politique, protection,
consentement, garde, journal ou limite modifiés. Premier passage hors WebDAV : une attente
ancienne « local seulement » échouée après activation ; attente de politique mise à jour,
aucune garde affaiblie. Sélection entière repassée : **2 391 tests/167 fichiers réussis,
127 tests/14 fichiers sautés**. **22 réels GitLab réussis/un informatif sauté** (dix retrait
moteur/contexte, douze écritures ordinaires), **281 mémoire WebDAV/dix fichiers** et
**21 Electron locaux** réussis. Typecheck/build/espaces vérifiés.

Pas de nouvelle suite générale complète verte, ni de qualification Nextcloud réelle,
charge maximale, Windows, ancien client, instance institutionnelle, révocation permanente
de rôle ou empaquetage. Racines/profils synthétiques ; aucun corpus utilisateur, reset,
commit ou push du dépôt de l’application. **Vingt et une livraisons, plan toujours ouvert.**

## Travaux restants

Implémenter, raccorder et qualifier le retrait WebDAV avec ses propres protections,
sans réutiliser les qualifications GitLab, d’ajout ou de renommage.
Les audits de transitions/provenance, la parité V1 et l’acceptation finale restent ouverts.

La promotion conserve son parcours simple ; aucun rattachement groupé n’est ajouté.
Le plan principal reste ouvert dans `plans/encours/` jusqu’à acceptation finale.
