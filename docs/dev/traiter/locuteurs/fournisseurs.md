# Locuteurs selon le fournisseur

## État du raccord

Le modèle natif et les mutations métier sont communs. Les services métier et
journaux des thématiques ne sont pas utilisés pour publier les corrections des
locuteurs.

| Parcours | Local | GitLab | WebDAV / Nextcloud |
|---|---|---|---|
| Liste, interventions, statistiques et détails | Disponible. | Vue commune, parcours Electron réel vérifié. | Vue commune, parcours Electron réel vérifié sur A et B. |
| Corrections depuis le corpus | Disponible. | Nouveau parcours sous commit gardé, éditions fermées. | Parcours conditionnel avec suivi privé et reprise explicite, éditions fermées. |
| Renommage global depuis l’entretien ouvert | Disponible. | Disponible sous le droit de la session courante. | Disponible sous le droit courant, avec suivi privé et reprise explicite. |
| Création au nommage depuis l’entretien ouvert | Disponible. | Disponible, sans fermer les autres éditions. | Disponible, sans fermer les autres éditions. |
| Rapprochement depuis l’entretien ouvert | Disponible. | Disponible, après fermeture des autres éditions. | Disponible, après fermeture des autres éditions, avec reprise explicite. |

Les composants `PersonnesCorpus.vue` et `RapprochementCorpus.vue` sont supprimés.
L’inventaire pur est dans `inventaireLocuteurs.ts`, sans relais vers les anciennes
fonctions métier. Les anciens points d’entrée et commandes, ainsi que leurs relais
WebDAV, sont supprimés. Les capacités ne conservent pas l’ancien drapeau générique.

## Consultation et aperçu sont distincts

La consultation utilise la copie du contexte courant. L’interface le signale et
indique la dernière synchronisation connue. Le bouton Actualiser déclenche le
tirage distant habituel ; un échec laisse le dernier résultat accompagné d’un
avertissement, sans le présenter comme une lecture serveur réussie.

`detailsLocuteursInventaire(false)` lit en une seule requête l’inventaire, les
variables et les catégories de notes. Les notes sont contextualisées par entretien
et id de participation ; des ids locaux identiques ne mélangent pas leurs notes.
Cette lecture n’acquiert pas de droit d’édition et ne modifie pas les sources.

Pour préparer une correction, `detailsLocuteursInventaire(true)` emprunte le
lecteur du fournisseur : GitLab résout un SHA et lit tous les membres à cet
instantané ; WebDAV lit les contenus avec leurs ETags forts et vérifie que le corpus
est resté stable. Une source invalide ou manquante bloque l’aperçu ; aucun miroir de
secours ne le rend artificiellement complet.

## Corrections GitLab depuis le corpus

Le nouveau canal `corpus:corrigerLocuteurs` valide strictement les commandes et
contrôle leur geste précis. La capacité `correctionsLocuteurs` est distincte de
l’ancien drapeau `locuteurs`, supprimé avec les commandes historiques.

Le contexte refuse les éditions locales protégées et les copies récupérables.
La transaction acquiert le droit corpus puis ceux de tous les membres dans un
ordre stable. Les modifications d’autres postes restent protégées par leurs
droits et par les gardes des fichiers ; une session n’est pas publiée pour faire
passer la correction.

`preparerCorrectionLocuteurs()` applique le métier existant à des copies des seules
sources serveur fournies. L’inventaire doit être complet et correspondre à la
confirmation. Les entretiens réellement modifiés portent leur nouvelle date ;
texte, codages, notes et champs étrangers à la commande restent inchangés.

Un seul commit porte les modifications et les gardes des membres inchangés, ainsi
que les droits. La borne actuelle est de 124 entretiens lorsque tous doivent être
réservés : le dépassement est refusé, pas transformé en lot partiel. Les limites
d’octets du publieur restent également applicables.

Le miroir n’est installé qu’après confirmation. Le journal de publication général
conserve les réponses inconnues. Les opérations préfixées `locuteurs-` sont
réconciliées avant le tirage suivant, sans renvoi du commit. Une issue encore
inconnue interdit une nouvelle correction. Aucun journal thématique n’est employé
et aucune annulation globale n’est promise.

## Corrections WebDAV depuis le corpus

`CorrectionsLocuteursWebDAV` utilise les mêmes candidats métier, sans emprunter
les services ou journaux thématiques. La publication protège le corpus puis tous
les membres, avec `files_lock` ou les verrous conditionnels existants. Les sessions
locales ouvertes ou récupérables et les opérations incompatibles restent bloquantes.
Une nouvelle session ne peut pas contourner une correction en cours ou à reprendre.

Les GET fournissent ensemble les contenus et leurs ETags forts. Chaque PUT porte
`If-Match` ; avant de poursuivre, le service vérifie les contenus et les garanties
des droits. Il garde tous les membres protégés, y compris ceux inchangés, jusqu’à
la finalisation. Les nouvelles définitions précèdent les associations ; les identités
absorbées ne sont retirées qu’après traitement et vérification des références.

Les bornes sont de **100 entretiens**, **32 Mio de sources** et **128 Mio de journal**.
Un dépassement est refusé avant publication ; aucune découpe cachée n’est pratiquée.

Le journal privé `.corrections-locuteurs-webdav.json` conserve les candidats et les
ids générés avant l’envoi. Il est lié à la racine distante et au compte. Sa version
d’enveloppe n’ajoute ni format natif ni modèle d’identité. Une autre destination,
un journal invalide ou un contenu serveur inattendu interdit toute nouvelle écriture.
Les contenus déjà confirmés ne sont jamais réinstallés par-dessus une modification
d’un autre poste ; le miroir n’est alimenté qu’avec des contenus confirmés.

Une réponse inconnue demande **Vérifier le résultat**, sans PUT. Si le candidat est
reconnu, **Reprendre la correction** publie seulement la suite, avec les mêmes ids.
Si l’acceptation reste inconnue, ni reprise ni arrêt du suivi ne sont autorisés.
La protection conditionnelle du corpus reste alors en place : une autre session
ne peut pas publier de nouvelles références pendant qu’une ancienne requête peut
encore aboutir. Sa preuve est conservée dans le journal privé, y compris pour une
vérification après recréation du service. Reconnaître le candidat accepté autorise
seulement une libération conditionnelle de cette ancienne protection, jamais sa
réutilisation pour publier. La reprise acquiert ensuite de nouveaux droits.
Une protection remplacée ou perdue n’est ni forcée ni supprimée à l’aveugle.
Pour un progrès connu, **Arrêter cette correction…** demande confirmation, clôture
uniquement le suivi local et conserve les étapes déjà enregistrées. Ce n’est pas
une annulation ; les étapes restantes ne sont pas appliquées.

Le panneau de suivi bloque les nouvelles corrections et suspend les tirages
automatiques pendant la lecture du suivi ou sa reprise. Une tentative explicite
de vérification peut réessayer un réseau déclaré hors ligne, sans lever le mode
consultation ni la permission main.

Les publications ordinaires GitLab et WebDAV vérifient aussi les associations et
les distinctions vers les identités du corpus : une copie ancienne ne peut pas
réintroduire un id retiré. Ce contrôle porte sur les données publiées, pas seulement
sur les boutons de correction.

Quatre scénarios réels ciblés sur les deux bancs couvrent une requête de finalisation
retardée jusqu’après la réponse inconnue et une réponse perdue après acceptation.
Ils vérifient le blocage d’un autre poste, la reconnaissance après recréation du
service et la reprise sans doublon. Les deux parcours Electron Nextcloud restent
validés. Les tests simulés ajoutent protection remplacée, ancien suivi sans preuve
et réponse de libération perdue ; la série ciblée comporte 89 tests sur six fichiers.
Ces résultats recouvrent les qualifications précédentes.

## Renommage depuis une session GitLab

Le geste `locuteurs.renommer-depuis-entretien` et la capacité
`renommageLocuteurOuvert` sont distincts des corrections corpus et du nommage.
La création et le rapprochement possèdent leurs propres gestes et leur capacité
`nommageLocuteurs` ; l’ancien canal générique est supprimé.

L’aperçu relit toutes les sources publiées à un SHA et remplace uniquement la source
de la session autorisée par son candidat sauvegardé. Sa base publiée doit correspondre
au serveur. Il ne publie aucune saisie. La confirmation attend le gel de l’éditeur,
publie seulement les saisies de notre session, puis prépare la correction complète.
Un inventaire périmé reste refusé, même si le nom ne concerne que cet entretien.

Le commit conserve le droit courant : aucun second bail ni fermeture/réouverture
pour contourner la session. Le corpus et les autres membres sont protégés dans
l’ordre existant ; une édition tierce ou une autre édition locale reste bloquante.
La correction confirmée devient la nouvelle base de la session avant toute sauvegarde
suivante. Le store refuse les anciens noms d’une sauvegarde retardée. Le renderer
ne remplace que les noms attendus, pas le document ni l’historique de frappe.

Avant envoi, le journal de session conserve l’id de l’opération et l’empreinte du
contenu attendu, sans changer le format natif. Une réponse inconnue conserve la copie
et bloque l’édition ; la fermeture peut reconnaître le commit, sans renvoi, puis
rendre les droits et permettre la réouverture. Au redémarrage, la résolution du journal
de publication précède celle de cette intention. Une copie extérieure inattendue
n’est jamais remplacée par l’ancien candidat.

Deux scénarios backend GitLab réels couvrent les autres comptes, le même compte
sur un autre poste, le maintien du droit, la publication suivante et la réponse perdue
reconnue à la fermeture. Le parcours Electron OAuth vérifie également l’absence
de publication pendant l’aperçu annulé, la conservation des saisies, la confirmation
et la publication suivante sur la nouvelle base. Onze parcours Electron locaux
passent après la séparation des permissions de renommage et de création.

## Création et rapprochement depuis une session GitLab

Les gestes `locuteurs.identifier-au-nommage` et
`locuteurs.rapprocher-depuis-entretien` conservent également le droit de la session.
Leur métier est commun au local, dans `nommageLocuteurs.ts`, et la préparation
produit des candidats natifs sans toucher au miroir.

Une création indépendante ne réserve que le corpus et sa voix courante : les autres
entretiens peuvent rester ouverts sur ce poste ou ailleurs. Le nom sauvegardé doit
correspondre à la demande ; le retrait volontaire reste bloquant. Aucun rôle n’est
déduit du nom, aucun homonyme n’est associé automatiquement. Répéter une création
confirmée retrouve son id, sans nouvel envoi ni nouvelle définition.

Le rapprochement exige toutes les sources, la fermeture des autres éditions et
l’inventaire confirmé. Il conserve les noms locaux, redirige les cas et refus de
tiers et retire l’identité absorbée dans le même commit. Deux voix d’un même
entretien ne sont pas réunies. Seules les données choisies sont copiées ; les
variables doivent toujours appartenir aux participations.

`inventaireLocuteursDepuisEntretien` relit les sources publiées et le candidat
courant autorisé, sans publication. Les suggestions commencent seulement après
vérification de l’identité indépendante. Une source indisponible diffère les
propositions sans présenter la création déjà confirmée comme un échec.

La publication et la reprise utilisent le journal GitLab général et l’intention
privée de session, avec les mêmes candidats. Les protections d’autosauvegarde portent
sur les associations autant que les noms. Une réponse inconnue suspend l’édition ;
sa reconnaissance ne crée pas un nouvel id et ne répète pas une réunion.

Deux nouveaux scénarios backend réels vérifient les autres comptes et postes,
la création malgré leurs éditions, le refus du rapprochement tant qu’elles sont
tenues, la reprise de la saisie et les réponses perdues sur les deux gestes.
Le parcours Electron OAuth vérifie l’identité indépendante sur le serveur avant
confirmation, la réunion sans copie non demandée, puis la sauvegarde suivante.
Les onze parcours Electron locaux de nommage et renommage passent également.
Les séries ciblées de 85 puis 102 tests se recouvrent et ne doivent pas être additionnées.

## Qualification acquise et suite

Les tests ciblés couvrent la préparation sans mutation, les sources manquantes ou
périmées, les conflits de baux et de versions, les références des cas et des tiers,
les limites du commit, la réponse perdue et sa reconnaissance sans rejeu.

Deux scénarios de backend GitLab réel vérifient le refus d’une édition tierce,
le renommage après fermeture, l’aperçu périmé, la réunion et la suppression d’une
identité réellement vide. Un scénario Electron OAuth vérifie l’interface commune,
les notes contextualisées, le renommage depuis la sélection, les fichiers publiés
et le refus de l’ancienne commande par appel direct.

Onze scénarios Electron locaux de sélection, détails et renommage depuis
l’entretien passent également. Typage de l’application et des tests ciblés, ainsi
que build, sont validés. Il ne s’agit pas d’une qualification complète des lots
restants.

Sur les deux bancs Nextcloud, **six scénarios backend réels** vérifient les refus
entre comptes et entre postes d’un même compte, le renommage conservateur, la réponse
perdue suivie d’une reprise après recréation du service, puis la réunion interrompue,
la finalisation des cas et refus de tiers et la suppression vide. **Deux parcours
Electron réels** couvrent la vue commune, les notes contextualisées et la reprise
sans renvoi du succès. Leurs extensions vérifient aussi l’arrêt confirmé d’un lot
partiel connu, sans annulation des étapes déjà acceptées.

Les tests simulés couvrent notamment les trois phases de dissociation avant et
après acceptation, les ids stables, les modifications extérieures, la perte d’un
droit, les sources invalides et les suivis illisibles. Les totaux des séries ciblées
se recouvrent : ne pas les additionner. La série d’intégration ciblée passe avec
214 tests sur dix fichiers ; les derniers ajouts passent séparément avec 26 tests
WebDAV et 26 tests de suivi/politique. Le typage strict ciblé et le build passent.
Le parcours Electron GitLab commun a également été rejoué avec succès après
l’ajout du suivi, sans nouvelle campagne générale.

## Corrections depuis une session WebDAV

Les trois gestes précis et les capacités de session sont maintenant ouverts sur
les deux variantes Nextcloud. Le canal générique historique est supprimé.
`SessionsDEntretien.corrigerLocuteurs()` sérialise la sauvegarde récente, la
publication ordinaire, le prêt du droit courant et l’adoption du résultat. Le
service n’acquiert ni ne libère une seconde fois le droit de cet entretien. Son
renouvellement reste celui de la session ; les autres membres sont protégés dans
l’ordre habituel, après le corpus.

L’aperçu utilise la version publiée et le candidat local autorisé, sans publication.
La confirmation vérifie encore cette base, applique le métier commun et fixe les
candidats dans le suivi privé avant l’envoi. La création indépendante ne lit ni ne
réserve les autres entretiens, même si d’autres éditions sont ouvertes. Le renommage
et le rapprochement exigent les autres éditions locales fermées et un inventaire
complet. Les droits d’autres comptes ou postes restent bloquants.

Après confirmation, le contenu et l’ETag deviennent la nouvelle base de session.
Le renderer ne remplace que les champs attendus, sans recharger le document. Les
noms et associations corrigés sont protégés contre les sauvegardes retardées. Le
tirage automatique attend la fin de la correction pour ne pas interrompre ce retour.

Une correction engagée mais interrompue suspend l’édition et conserve le suivi du
corpus. Fermer l’entretien rend son droit sans republier l’ancien candidat. Depuis
le corpus, vérifier le résultat puis reprendre sont deux actions distinctes ; les
étapes reconnues ne sont pas renvoyées. La protection corpus reste conservée tant
qu’un envoi pourrait encore aboutir.

Au redémarrage, le suivi relie l’opération à la trace locale de la session. Seule
une copie exactement égale au contenu publié avant la correction ou au candidat
corrigé peut être écartée de la récupération ordinaire. Une autre saisie reste
préservée. Un verrou conditionnel n’est retiré que si ses trois identifiants
correspondent, sous son ETag. Un droit natif ne distingue pas deux postes du même
compte : il n’est jamais forcé par cette reprise automatique. S’il subsiste, la
reprise reste bloquée jusqu’à sa libération ou son expiration. Après une correction
terminée, de nouvelles saisies non publiées gardent leur récupération ordinaire.

Qualification ciblée : 167 tests sur neuf fichiers, dont 14 scénarios simulés de
session et redémarrage ; quatre scénarios backend réels sur A et B ; deux parcours
Electron réels étendus aux trois gestes et à la reprise après fermeture. Les
scénarios réels comprennent deux comptes et le même compte sur deux postes. Typage
applicatif, typage strict des tests modifiés et build passent. Les premiers essais
Electron ont corrigé la référence attendue des annotations après saisie et le
ciblage de la réponse perdue, sans modifier les garanties ni élargir la campagne.

## Qualification finale du retrait historique

Les tests des méthodes historiques jamais ouvertes sont retirés avec ces méthodes.
Leurs garanties utiles sont vérifiées sur les parcours livrés : sources fraîches,
droits concurrents, ordre des définitions et associations, refus des inventaires
périmés, candidats stables, interruptions et reprise explicite. Les tests génériques
d’écriture courte conservent lecture fraîche, conflit, tiers et réutilisation d’une
session, avec une modification locale de pseudonyme plutôt qu’une ancienne commande.

La validation finale bornée comprend 323 tests ciblés sur quatorze fichiers et
22 parcours Electron locaux. Le parcours Locuteurs GitLab réel et celui de Nextcloud
B ont été rejoués avec succès après suppression des anciens accès. Les garanties
acquises séparément sur Nextcloud A restent valables : son protocole n’a pas été
modifié par ce nettoyage. Typage applicatif, typage strict ciblé et build passent.
Les résultats des lots précédents se recouvrent ; ne pas additionner leurs totaux.
Aucune nouvelle campagne générale n’est nécessaire pour ce retrait.
