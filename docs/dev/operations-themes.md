# Opérations sur les thématiques du corpus

Le parcours local complet est disponible dans l’onglet Thèmes : panneau,
aperçus, répartition manuelle et transaction multi-fichiers reprenable.
WebDAV dispose du transfert et de la division avec source conservée : aperçu
serveur, publication séquentielle, bilan partiel et reprise explicite. Fusion
et suppression de source restent fermées sur WebDAV. GitLab fournit les trois
gestes, avec lots journalisés par entretien et suppression finale protégée par
tout le membership. Aucun dispatch distant ne se rabat sur une publication du
miroir.

## Contrat métier

Le cœur pur est dans `src/shared/corpus/themes.ts` :

- transfert : réaffectation de tous les codages observés, avec conservation de
  la source cochée par défaut ; si elle est décochée, la source est retirée et
  ses enfants sont promus vers son ancien parent ;
- fusion : deux thématiques et une cible existante ; la cible peut être l’une
  des deux ou une troisième thématique. Les thématiques non retenues sont
  retirées après réaffectation et leurs enfants directs rejoignent la cible ;
  une cible descendante d’une thématique retirée est refusée ;
- division : deux à quatre catégories existantes, choix explicite par couple
  `(entretienId, annotationId)`, codages sans choix conservés sur la source ;
- suppression après division : tous les codages doivent être répartis, y compris
  les orphelins ; les destinations gardent leur position et les enfants de la
  source sont promus vers son ancien parent ;
- déduplication : seule la plage exacte d'un codage cible est un doublon. Les
  anciens doublons de la cible ne sont pas nettoyés.

Les annotations `anon` et `commentaire` et les étiquettes `RegleAnon.categorie`
ne sont jamais modifiées par ces opérations.

## Aperçu local et IPC

`OperationsThemesCorpus` appartient au `CorpusStore` actif. Son cache conserve
les demandes validées, les empreintes des fichiers et des extraits courts,
pas les transcriptions complètes. Limites : huit aperçus, quinze minutes de
validité et 32 Mio cumulés de données sérialisées. Les entrées expirées ou les
plus anciennes sont évincées ; un aperçu seul dépassant la borne est refusé.
Le cache est vidé lors d'une bascule de corpus ou d'une reprise transactionnelle.

| Canal | Arguments | Retour |
|---|---|---|
| `corpus:analyserOperationTheme` | demande, identifiant précédent optionnel | `ApercuOperationTheme` |
| `corpus:detailsOperationTheme` | identifiant d'aperçu, entretien | `DetailsOperationTheme` |
| `corpus:executerOperationTheme` | identifiant d'aperçu, demande, options | `ResultatOperationTheme` |
| `corpus:progressionOperationTheme` | événement | `ProgressionOperationTheme` |
| `corpus:lireSuiviOperationTheme` | aucun | `SuiviOperationTheme` ou `null` |
| `corpus:preparerRepriseOperationTheme` | identifiant de lot | demande et nouvel aperçu |
| `corpus:reconcilierOperationTheme` | identifiant de lot ou tentative | `ResultatOperationTheme` |
| `corpus:abandonnerOperationTheme` | identifiant de lot | aucun, sans annulation des succès |

Le preload expose `surProgressionOperationTheme`, qui retourne une fonction de
désabonnement. Chaque progression porte son `operationId`. En local, elle annonce
le début et la fin confirmée, sans pourcentage de durée inventé.

L'inventaire lit chaque membre explicitement, sans passer par
`chargerEntretiens()`. Un fichier absent, illisible, incomplet ou non supporté
rend l'aperçu infaisable, avec un obstacle nommé ; il n'est pas présenté comme
un entretien à zéro usage. Les anciens entretiens supportés sont adaptés en
mémoire. L'analyse n'ouvre aucune session et ne migre aucun fichier sur disque.
Les orphelins restent dans les détails, sans extrait.

Un aperçu de division incomplet peut être consulté, mais sa variante destructive
reste infaisable. Un transfert sans conservation de la source suit les mêmes
gardes de suppression que les autres variantes destructives. Modifier les choix exige une nouvelle analyse ; passer l'ancien
identifiant préserve le lien avec le manifeste et refuse des choix devenus
obsolètes. Le périmètre `aModifier` dépend des mutations effectives.

L'exécution vérifie les droits du store, la demande confirmée, puis relit le
membership complet. La comparaison locale est volontairement conservatrice :
tout changement des données de `corpus.json` ou d'un entretien depuis l'aperçu
refuse l'opération avant génération des destinations et écriture. Le local exige
l'option `tous-prevus`. GitLab accepte aussi `observes-libres`, dont le sous-ensemble
est déduit dans le main à partir de l’aperçu confirmé.
Un identifiant d'aperçu n'est ni une autorisation d'écriture ni un journal de lot.
Après lancement transactionnel, il est consommé pour éviter un double envoi.

## Aperçus WebDAV

`ApercusThemesWebDAV` appartient aux transactions du contexte WebDAV courant.
Les handlers d’analyse et de détails utilisent ce service, protégé par le
registre de contexte. La fermeture réussie du contexte vide ses aperçus et
invalide les lectures encore en vol.

`ClientWebDAV.getTexteAvecEtag` reçoit le texte et l’ETag dans la même réponse
GET, avec revalidation demandée aux caches HTTP et `Accept-Encoding: identity`.
Ce dernier évite les ETags de représentation gzip, refusés par les PUT Nextcloud.
Aucun suffixe d’ETag n’est supprimé pour fabriquer une garde. Aucun ETag observé par HEAD
ou PROPFIND séparé n’est associé à ce contenu. Un ETag absent ou faible rend le
fichier indisponible pour l’atelier.

L’inventaire lit `corpus.json`, chaque membre explicitement, puis le corpus à
nouveau. Un changement d’ETag **ou** de contenu du corpus refuse l’inventaire.
Chaque entretien possède ainsi une lecture cohérente ; cela n’est pas un
instantané atomique simultané de tous les fichiers. La publication
relit chaque entretien sous son verrou avant un PUT conditionnel.

Un membre absent, illisible, incomplet, non supporté ou privé d’ETag fort devient
un obstacle nommé. Le transfert et la division avec source conservée peuvent
préparer un aperçu partiel ; un problème de définitions ou de répartition reste
bloquant. Les compteurs portent uniquement sur les membres disponibles ; les
indisponibles ne sont jamais présentés comme des usages nuls.

Les adaptations d’anciens entretiens se font en mémoire. Aucune session n’est
ouverte, aucun verrou créé, aucun fichier serveur ou miroir écrit. Le cache
réutilise les limites et les extraits du service local, sans conserver les
transcriptions. Une révision avec identifiant précédent vérifie les fichiers
déjà observés avant de réutiliser les choix ; les membres restés indisponibles
ne rendent pas les choix des autres membres obsolètes.

## Publication et reprise WebDAV

`OperationsThemesWebDAV` consomme la demande confirmée et son manifeste sans
conserver les transcriptions de l’aperçu. Sous verrou court du corpus, il relit
les définitions et crée seulement une éventuelle cible nouvelle de transfert avant toute réaffectation. Chaque
entretien est ensuite traité seul, sous verrou natif ou PUT conditionnel :
lecture serveur, empreinte comparée à l’aperçu, mutation pure, contrôle des
références, battement et PUT avec l’ETag de cette lecture. La garantie restante
est contrôlée après la persistance de l’intention, juste avant l’envoi.

Une session locale active ou récupérable provoque un refus nommé ; sa copie
n’est ni publiée ni écrasée. Une acquisition refusée, une modification depuis
l’aperçu ou un refus HTTP certain est inscrit au bilan sans annuler les succès
et sans empêcher les autres entretiens. Le miroir reçoit uniquement les
publications confirmées. Le changement de corpus est refusé pendant le lot.

Le journal local `.themes-webdav.json` est versionné, lié à l’URL DAV et remplacé
atomiquement. Avant chaque PUT, il conserve le candidat exact. Un échec de cette
persistance interdit l’envoi. Après confirmation, succès et destinations sont
persistés avant de passer à l’entretien suivant. Ce journal peut contenir une
transcription candidate, comme le miroir ; il n’est jamais publié sur le serveur.

Les réponses HTTP 400, 401, 403, 404, 409, 412, 413 et 423 sont des refus certains.
Une coupure, un délai ou une autre réponse d’erreur nécessite une relecture :
seul le contenu candidat exact confirme le succès. Un ancien contenu ne prouve
pas que la demande ne sera pas appliquée ; le lot reste donc indéterminé et
s’arrête. La réconciliation explicite reprend cette vérification sans PUT de
données, sans migration ni rejeu automatique. Une erreur d’actualisation du
miroir ou de confirmation du journal conserve également l’intention.

Le suivi incomplet reste consultable après redémarrage. **Recalculer et reprendre**
réinventorie le serveur, conserve les destinations existantes, ne reprend que
les codages encore sur la source et redemande les choix de division.
**Clôturer le suivi sans reprendre** n’annule rien ; cette action est interdite
pour une publication inconnue. Le dernier journal terminé permet aussi de retrouver
un résultat dont la réponse IPC a été perdue, tant qu’un nouveau lot ne l’a pas remplacé.
Aucune atomicité globale, ni isolation contre un éditeur extérieur, n’est annoncée.

## Aperçus GitLab

`ApercusThemesGitLab` résout un SHA par analyse et lit le corpus et chaque membre
à ce commit via le lecteur de fichiers avec garde, borné à 2 Mio par réponse.
Les données du miroir ne servent jamais de repli. Les adaptations restent en
mémoire, sans session ni migration. Le cache conserve les empreintes et les
extraits ; fermeture du contexte, expiration et borne mémoire restent effectives.

L’observateur de baux existant fournit un mode ciblé strict, au même SHA : seuls
les entretiens effectivement modifiés sont inspectés. Un autre entretien tenu
n’empêche pas ce parcours et aucun bail n’est acquis pour tester la disponibilité.
Un bail illisible ou une observation incomplète produit `inconnu`. Les sessions
locales et chemins récupérables s’ajoutent aux badges qui peuvent les masquer.
Un autre poste du même compte reste un détenteur distant.

L’aperçu expose le commit, la date d’observation et les états par entretien.
Ces observations ne réservent rien. Aucun entretien libre bloque un plan avec
réaffectations ; un plan sans écriture d’entretien ne consulte aucun bail.
La suppression exige tous les membres disponibles et au plus 248 membres ; le
transfert n’a pas ce plafond de cardinalité. Ces obstacles sont persistés dans
l’aperçu temporaire, pas seulement ajoutés à la réponse IPC.

## Publication et reprise GitLab

`OperationsThemesGitLab` consomme l’aperçu confirmé et crée un journal local
`.themes-gitlab.json`, lié à la destination, avant le premier commit. L’id d’une
éventuelle cible nouvelle de transfert y est fixé une fois. Un redémarrage ou une
reprise réutilise cet id ; aucune réponse perdue ne provoque une nouvelle création.

La préparation prend seulement le bail de `corpus.json`. Une division vers des
catégories existantes ne publie aucune définition. Chaque réaffectation
prend ensuite le bail court d’un entretien, relit l’entretien et le corpus à un
même SHA, compare le manifeste et publie trois actions : contenu complet de
l’entretien, garde `chmod` sans contenu de `corpus.json`, transition du bail.
Les succès sont installés dans le miroir et persistés avant l’entretien suivant.
Un refus certain est nommé et le lot continue ; une réponse inconnue arrête le
lot.

L’option `observes-libres` traite exactement les entretiens observés libres lors
de la confirmation. Les autres restent différés, même si leur bail disparaît
entre-temps. `tous-prevus` vérifie chaque acquisition réelle. Une session locale
ou récupérable est toujours refusée sans publication implicite.

Une fusion ou une division destructive ne retire jamais les thématiques sources
pendant les réaffectations. Quand tous les entretiens sont confirmés, la finalisation prend
le bail corpus, relit le membership frais et chacun de ses membres au même SHA,
puis publie atomiquement le codebook final et une garde légère par entretien.
Un membre absent, une nouvelle référence ou une garde périmée bloque uniquement
la finalisation : les succès restent acquis et les thématiques à retirer restent présentes. La
borne est de 248 membres, soit `corpus.json`, 248 gardes et la transition du bail.

Le journal de lot complète le journal de publication GitLab. Avant chaque commit,
il conserve la phase, le candidat attendu et ses compteurs. La réconciliation
recherche l’identifiant de publication dans l’historique, vérifie le contenu au
SHA retrouvé et rend le bail laissé par une réponse perdue. Aucun commit de
données n’est rejoué. Une finalisation inconnue expose une présence de source
inconnue jusqu’à cette vérification.

Les tests simulés couvrent les commits courts, le sous-ensemble observé libre,
les conflits, la création stable d’une cible de transfert et les réponses perdues
après création, réaffectation et finalisation. Les qualifications réelles à deux comptes
confirment l’observation ciblée, le différé puis sa reprise, ainsi qu’une référence
concurrente refusant la finalisation seule avant une reprise réussie.

## Atelier renderer

`ThemesOpsCorpus.vue` remplace les cartes d’entretiens uniquement dans l’onglet
Thèmes ; l’arbre et le crayon restent à gauche. Le composant demeure monté pendant
la navigation dans le même corpus. `useOperationsThemesCorpus.ts` pilote les
étapes choix, répartition, aperçu confirmé et bilan. Les demandes IPC sont des
copies ordinaires, sans proxies Vue ; l’exécution emploie la copie confirmée.

`RepartitionTheme.vue` charge les détails d’un entretien à la fois, affiche les
passages sans texte séparément et propose radios, attribution en bloc et touches
1 à 4. Aucun entretien n’est ouvert automatiquement. La consultation explicite
invalide l’aperçu ; une relecture conserve les choix seulement si le manifeste
reste valide. Repartir de l’état actuel efface les choix, sans les réinventer.

`revisionCorpus` distingue une application de corpus d’une simple actualisation.
Cette révision réinitialise l’atelier et rend inopérantes les réponses tardives.
Une modification du codebook ou une consultation invalide la confirmation ; les
réponses en vol ne peuvent pas la rétablir. L’abonnement de progression est
libéré à la destruction du composant et filtre les événements par `operationId`.

Le récapitulatif évite une seconde confirmation dans le lanceur global, tout en
conservant sa garde anti-double-lancement et son attente. Les résultats appliqués
ou partiels actualisent le codebook, puis les usages et les résumés thématiques.
Un échec d’actualisation conserve le résultat confirmé. Une erreur IPC pendant
l’écriture est présentée comme indéterminée, sans relance automatique ni lecture
susceptible de reprendre implicitement une transaction. Le bilan inconnu reste
visible après fermeture de la modale et bloque un nouveau lancement avant
réouverture du corpus pour le local. WebDAV expose la vérification explicite,
la reprise conservant les destinations et la clôture d’un suivi certain ; une
lecture de suivi ne déclenche aucune publication. Les observations de baux et
les disponibilités GitLab sont affichées avec leur date d’observation. Lorsque
certains entretiens ne sont pas libres, l’utilisateur peut tenter tout le lot ou
confirmer uniquement le sous-ensemble observé libre.

## Transaction locale reprenable

`TransactionsFichiersCorpus` applique les candidats calculés en mémoire :

| Cas | Ordre |
|---|---|
| transfert vers une catégorie existante | entretiens seuls |
| transfert vers une cible nouvelle, source conservée | corpus puis entretiens |
| fusion de deux catégories vers une catégorie existante | entretiens puis corpus final |
| division vers des destinations existantes et suppression de source | entretiens puis corpus final |

Avant tout changement de données, tous les entretiens du plan sont vérifiés.
Une suppression inclut aussi les entretiens inchangés, avec un candidat identique
à leur état initial : ils sont contrôlés sans être réécrits. Les candidats sont
vérifiés contre le codebook final, parents et codages compris.

Le journal `.transaction-fichiers.json` reste en version 1 pour les anciens
parcours. Une intention avec corpus intermédiaire utilise la version 2 : une
ancienne application doit la refuser plutôt que supprimer la source trop tôt.
La reprise accepte le corpus initial, intermédiaire ou final, et les états
initial/final de chaque entretien. Elle refuse tout état inconnu et conserve
le journal. Un corpus final précédant ses entretiens dans une intention à trois
phases est également refusé.

Ce n'est pas un remplacement atomique simultané de plusieurs fichiers : les
étapes sont journalisées et l'application termine leur reprise avant d'exposer
le corpus à l'ouverture. Une erreur avec journal restant retourne
`indeterminee` et demande la reprise, sans permettre une relance aveugle.
Les opérations locales sont synchrones dans le main ; aucune isolation contre
un éditeur de fichiers externe n'est annoncée.

## Tests

- `test/themes.test.ts` : règles pures et hiérarchie.
- `test/operationsThemes.test.ts` : cache, détails, fraîcheur, inventaire strict,
  parcours local du store, périmètre d'écriture et gardes des handlers.
- `test/transactionsFichiers.test.ts` : ordres d'écriture, journal à trois phases,
  coupures après chaque écriture, reprise avant exposition et états inconnus.
- `test/preloadDistant.test.ts` : arguments IPC et abonnement de progression.
- `test/gitlab/politiqueGestes.test.ts` : fermeture des capacités distantes et refus
  des variantes destructives WebDAV.
- `test/apercusThemesWebDAV.test.ts` : lectures appariées, inventaire partiel,
  corpus modifié pendant l’analyse, absence de repli miroir, cache, choix et
  fermeture du contexte.
- `test/webdav/themes-apercus-nextcloud.test.ts` : GET et ETags forts, lecture
  partagée à deux comptes et analyse sans écriture sur Nextcloud A et B réels.
- `test/operationsThemesWebDAV.test.ts` : publication séquentielle, sessions,
  réponses perdues, journal, coupures de persistance et reprise sans doublons.
- `test/webdav/themes-publication-nextcloud.test.ts` : division et reprise à deux
  comptes, verrou natif sur A et conditionnel sur B, destinations stables.
- `test/gitlab/apercusThemes.test.ts` : SHA unique, baux ciblés, lecture partielle,
  sessions locales, bornes individuelles et de finalisation et cache.
- `test/gitlab/operationsThemes.test.ts` : lots courts, différés, finalisation,
  conflits, journal et réponses perdues sans rejeu.
- `test/gitlab/qualificationApercusThemes.test.ts` : qualification réelle de lecture
  à deux comptes, SHA unique, périmètre ciblé et absence de repli miroir ou de commit.
- `test/gitlab/qualificationThemes.test.ts` : écriture réelle à deux comptes,
  différé/reprise et finalisation refusée par une publication concurrente.
- `test/themesOpsWebDAVRenderer.test.ts` : panneau durable, noms des destinations
  existantes, confirmation distante et vérification sans rejeu.
- `test/themesOpsRenderer.test.ts` : choix, manifeste obsolète, réponses tardives,
  progression, confirmation unique, résultats et désabonnement.
- `test/operationGlobaleCorpus.test.ts` : récapitulatif déjà confirmé et attente
  adaptée, sans seconde confirmation ni double lancement.
- `e2e/themes-operations.e2e.ts` : transferts, fusion, divisions, orphelins,
  projections, consultation, changement de corpus et navigation au clavier.

Voir aussi [gestes-fournisseur.md](gestes-fournisseur.md).
