# Plan — onglet Personnes au niveau du corpus

> Identifier une même personne derrière plusieurs locuteurs d’entretiens différents,
> proposer les rapprochements au moment du nommage et offrir un espace corpus pour
> contrôler et corriger ces liens.
>
> Le libellé recommandé est **Personnes** au pluriel : l’onglet présente un répertoire.
> **Personne** reste le nom de la fiche ouverte dans le panneau de droite.

## État de réalisation

Premier incrément livré :

- [x] Type `Personne`, projection main et identifiants locaux complétés en mémoire.
- [x] Onglet pleine largeur, répertoire/fiche, recherche et filtre des références incorrectes.
- [x] Création depuis un locuteur, liaison, déliaison, déplacement et modification de fiche en local.
- [x] Comparaison des valeurs locales, suppression des fiches vides avec inventaire complet.
- [x] Séparateur accessible, largeur mémorisée, disposition étroite et retour vers les locuteurs.
- [x] Consultation distante, affichage des verrous et refus explicite des actions non prises en charge.
- [x] Liaisons distantes simples avec définitions stabilisées, GET frais, verrou court et PUT conditionnel.
- [x] Refus distant simple avec source fraîche et verrouillée, sans publication de la source.
- [x] Suggestions exactes au nommage local, décisions de refus et annulation dans le répertoire.
- [x] Reprise sélective au nommage et dialogue simplifié avec aperçu avant confirmation.
- [x] Suggestions proches strictes, explicables et calibrées sur des cas français.
- [x] Fusion locale reprenable, notes conservées et refus réconciliés.
- [x] Journal du corpus local pour annuler les commandes simples du répertoire.
- [x] Séparation locale transactionnelle avec au moins un locuteur conservé à l’origine.
- [x] Corrections transactionnelles distantes avec ordre sûr et résultats partiels explicites.

La création locale écrit la définition avant le lien. Si la seconde écriture échoue,
la fiche vide reste visible avec une erreur expliquant comment reprendre ou supprimer.
Le filtre « À vérifier » porte pour l’instant sur les références pendantes et les doublons
dans un même entretien, pas encore sur les suggestions.

Validation de cet incrément : `npm test` (701 tests réussis, 21 sautés),
`npm run typecheck`, `npm run build`, puis les 10 E2E de `personnes`, `navigation`
et `locuteurs` réussis. Aucun banc distant n’a été démarré.

### Incrément supplémentaire — rapprochements depuis le répertoire

Implémenté en local :

- suggestions exactes et rôles équivalents depuis le détail d’un locuteur ;
- accès global aux rapprochements depuis « À vérifier », y compris pour les locuteurs liés ;
- filtre « Décisions écartées », avec noms lisibles et accès au locuteur portant le refus ;
- regroupement des candidats par Personne, refus étendus à ses autres locuteurs et
  exclusion des personnes déjà représentées dans l’entretien source ;
- liaison à la personne du candidat ou création d’une fiche commune ;
- refus persistants, révocables depuis le détail du locuteur qui les porte ;
- aperçu de reprise ponctuelle avec source explicite, sélection des variables,
  pseudo et statut interviewer décochés par défaut, remplacement opt-in ;
- erreurs explicites si la création ou la liaison réussit seulement en partie ;
- choix de la source de reprise parmi les entretiens liés à la Personne candidate,
  avec réinitialisation des choix lors d’un changement de source ;
- création d’une fiche distincte après refus pour un locuteur non lié portant un nom
  spécifique, sans création automatique pour les rôles génériques.

Le pseudo repris est le champ du libellé du Locuteur, avec confirmation de son affichage.
Aucune règle d’anonymisation du texte n’est créée ou étendue.

Validation : 708 tests réussis, 21 sautés ; typecheck et build réussis ;
les deux E2E Personnes et rapprochements réussis. Le nouvel E2E couvre le refus et son
annulation, le choix de source, la réinitialisation des choix et la reprise du pseudo
sans modification du nom ni du rôle.

### Incrément supplémentaire — création au nommage local

Après un véritable changement de nom, un nom spécifique sans candidat crée maintenant
une définition de Personne. Le lien est ensuite appliqué au modèle de la session ouverte
et enregistré par sa sauvegarde habituelle, sans réécriture concurrente de l’entretien
par une commande de répertoire. Les traitements de nommage sont sérialisés et vérifient
que le locuteur et son nom sont toujours actuels après les opérations asynchrones.

Pas de création au simple ajout, pour les noms génériques, pour les locuteurs déjà liés,
ni lorsque l’inventaire est incomplet. Les échecs sont signalés et une fiche créée sans
lien reste réparable dans le répertoire.

Les candidats exacts et les rôles équivalents ouvrent désormais un dialogue natif modal,
sans présélection, avec focus initial sur « Plus tard » et restitution du focus à la
fermeture. « Même personne » crée au besoin la fiche depuis le locuteur source puis lie
le modèle en session ; « Personne différente » mémorise le refus et crée une fiche
individuelle pour un nom spécifique non lié. Échap et « Plus tard » ne prennent aucune
décision. Les rôles génériques refusés restent sans création automatique et donnent lieu
à une invitation facultative à choisir un libellé spécifique.

La reprise sélective reste accessible dans le répertoire, mais n’est pas encore intégrée
à ce dialogue. Le renommage d’un locuteur déjà lié recherche désormais les autres
candidats : le dialogue indique le nom de la fiche actuelle et propose « Déplacer vers
cette personne », « Conserver le lien actuel et écarter ce candidat » et « Plus tard ».
Sans candidat, un message rappelle que le nom saisi reste local. Aucun renommage de la
fiche n’est effectué. La décision vérifie aussi que le lien n’a pas changé depuis
l’ouverture du dialogue.

Un E2E couvre le report sans changement de lien, puis le déplacement confirmé et la
conservation des deux noms de fiches. Le refus dans le dialogue et la fermeture par Échap
nécessitent encore des E2E dédiés.

Validation : 708 tests unitaires réussis, 21 sautés ; typecheck et build réussis ;
11 E2E Locuteurs et Personnes réussis, dont un nouveau test de création au nommage puis
renommage local sans changement de la fiche ni nouvelle création.

Validation du dialogue : 708 tests unitaires réussis, 21 sautés, typecheck et build OK ;
les deux E2E nommage et dialogue réussis, avec contrôle du focus neutre, de la liaison
persistante après une nouvelle sauvegarde et de l’absence de copie implicite du pseudo.

### Incrément supplémentaire — Journal du corpus local

Le Journal du corpus est livré dans la grille habituelle, avec une icône Pas à pas
maintenant distincte. Son service volatil vit dans le main, conserve dix inverses ciblés
et vérifie l’état frais avant toute annulation. Les entrées survivent à la navigation dans
le même corpus et disparaissent lors d’une bascule ou d’un redémarrage.

Le premier raccordement couvre les renommages de Personne, liaisons, déliaisons,
déplacements et refus simples validés depuis le répertoire. L’annulation restaure aussi
`personneDeliee` et l’ensemble exact des refus. Les créations, suppressions, reprises,
rapprochements composites, fusions et opérations distantes ne créent aucune entrée.
Les commandes de nommage lancées depuis un entretien restent hors de ce Journal.

Une cible modifiée depuis rend l’entrée inapplicable sans écriture. Après réussite,
l’inventaire Personnes est invalidé sans réinitialiser globalement le corpus. La
documentation utilisateur distingue le Journal visible du journal technique de reprise.

Validation : 725 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les E2E Journal, Navigation et Personnes réussissent. Le scénario Journal couvre le
renommage et la liaison annulés, le grisage après modification extérieure, la conservation
après un aller-retour dans un entretien et la purge au changement de corpus.

### Incrément supplémentaire — séparation locale

La fiche propose maintenant **Séparer…** lorsqu’elle relie plusieurs locuteurs.
L’utilisateur choisit les locuteurs déplacés et le nom de la nouvelle Personne, puis
confirme un aperçu des deux groupes. Une sélection vide ou de tous les locuteurs est
refusée : au moins un locuteur reste obligatoirement sur la fiche d’origine.

La commande vérifie un inventaire complet et identique à l’aperçu avant de créer la
définition et de réaffecter les seuls `personneRef` sélectionnés. Noms locaux, pseudo,
rôle, variables, notes et refus restent inchangés. La transaction technique écrit la
nouvelle définition avant les liens et reprend l’opération après une interruption sans
écraser un état extérieur inconnu. La séparation reste hors du Journal visible et hors
des corpus distants.

Validation : 728 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les cinq E2E Journal, Navigation, Personnes, regroupement et séparation réussissent.
L’E2E de séparation couvre aussi l’interdiction de vider la fiche d’origine, l’annulation
de l’aperçu, la conservation des noms locaux et l’absence d’entrée dans le Journal visible.

### Incrément supplémentaire — noms proches

Les propositions couvrent maintenant deux variantes proches strictes en plus des noms
normalisés identiques : une seule lettre différente avec au moins un mot commun, ou les
mêmes mots dans un ordre différent. Un nom composé est exigé pour les variantes proches,
afin qu’un prénom ou un nom seul ne déclenche pas une proposition approximative.

Chaque proposition indique sa raison dans le dialogue de nommage et dans le répertoire.
Les candidats restent sans présélection et les refus, regroupements par Personne et
exclusions existantes s’appliquent de la même manière. Lorsque plusieurs locuteurs liés
représentent une Personne, la meilleure graphie est présentée.

Validation : 732 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les deux scénarios E2E du dialogue réussissent, dont le nouveau cas « Marie Dupont » /
« Maria Dupont » avec la raison « une lettre différente ». Aucun banc distant démarré.

### Incrément supplémentaire — corrections distantes simples

Le répertoire distant permet maintenant de créer une Personne depuis un locuteur, de
renommer une Personne, d’associer, dissocier ou déplacer un locuteur, et d’annuler un
refus. Une définition est modifiée par la transaction corpus existante. Une association
stabilise les définitions sous verrou, puis réutilise la session si l’entretien est déjà ouvert par ce poste ; sinon elle prend
un verrou court sur l’entretien, effectue un GET frais et publie par PUT conditionnel.

Le miroir n’est conservé dans l’état tenté qu’après confirmation de la publication. Une
divergence ou un refus de verrou restaure une version serveur connue et remonte un message
explicite. Le verrou entretien est libéré avant le verrou corpus. Les opérations distantes
restent hors du Journal visible.

La création simple publie la définition avant son premier lien. Si l’entretien ne peut
pas être modifié, la fiche vide reste visible et le message indique comment reprendre.
Ce chemin sert aussi au dialogue de nommage lorsqu’un candidat source n’est pas encore
lié. Les rapprochements composites du répertoire, suppressions, fusions et séparations
restent désactivés en distant.

Validation : 738 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Six nouveaux tests WebDAV embarqués couvrent le GET frais, le refus nominatif d’un
verrou tiers, la divergence, la réutilisation d’une session existante, la création avec
premier lien et la conservation de la fiche après échec de ce lien. Les sept E2E
locaux Journal, Navigation et Personnes réussissent. Aucun serveur Nextcloud externe
n’a été démarré.

### Incrément supplémentaire — refus distant simple

« Personne différente » est maintenant disponible dans le répertoire distant lorsque
la décision modifie seulement le locuteur cible. La transaction stabilise les définitions,
prend les verrous des entretiens cible et source dans l’ordre de leurs ids, puis relit les
deux fichiers avant de calculer la référence refusée. Seul le fichier cible est publié ;
la source sert de donnée fraîche et reste inchangée. Une session déjà tenue par ce poste
est réutilisée.

Si le refus d’un locuteur spécifique non lié doit également créer une fiche distincte,
l’action reste désactivée en distant. Le main refuse aussi ce cas avant toute mutation,
afin qu’une définition ne puisse pas rester non publiée par une transaction limitée à
l’entretien. Un verrou tiers sur la source libère les verrous déjà pris et ne modifie pas
la cible.

Validation : 741 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les deux E2E Personnes et rapprochements réussissent en local. Trois nouveaux tests
WebDAV embarqués couvrent la source devenue liée après le dernier tirage, le verrou tiers
sur cette source et le refus sans écriture du cas composite. Aucun banc Nextcloud réel
n’a été démarré.

### Incrément supplémentaire — corrections distantes composites

Toutes les commandes du répertoire sont maintenant raccordées au distant. Un
rapprochement vers une Personne existante publie seulement la cible. Avec deux locuteurs
non liés, la définition est publiée avant le lien source, puis le lien cible et son
éventuelle reprise de données. Le refus qui crée une fiche distincte suit le même ordre.
Une réussite intermédiaire est conservée et nommée dans l’erreur afin de permettre une
correction après actualisation.

La suppression d’une fiche vide verrouille et relit tous les entretiens du membership
frais avant de retirer sa définition. La réunion publie les réaffectations d’entretiens
avant de supprimer la définition absorbée ; un échec conserve donc les deux fiches et la
même commande peut reprendre les liens restants. La séparation publie au contraire sa
nouvelle définition avant les déplacements. Si l’un d’eux échoue, la nouvelle fiche et
les déplacements confirmés restent visibles et les associations restantes sont
corrigeables individuellement.

Le moteur commun prend le verrou corpus puis les verrous entretien dans l’ordre des ids,
réutilise les sessions de ce poste, relit les fichiers après acquisition et publie chaque
fichier sous ETag. Il vérifie aussi qu’une commande limitée n’a modifié ni une définition
ni un entretien de contrôle de façon inattendue. Tous les verrous courts sont libérés en
ordre inverse, y compris après une publication partielle.

Validation : 757 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les cinq E2E locaux Journal, Personnes, rapprochement, réunion et séparation réussissent.
Seize tests WebDAV embarqués supplémentaires couvrent rapprochements, refus composites,
suppressions fraîches, ordre de réunion et séparation, échecs partiels et reprise d’une
réunion. Aucun banc Nextcloud réel n’a été démarré.

### Incrément supplémentaire — garde-fous visibles du nommage

Deux renommages déclenchés dans la même tâche sont maintenant couverts en E2E : la file
ignore le premier nom devenu périmé et crée uniquement la Personne correspondant au nom
final. L’onglet Locuteurs distingue aussi un lien résolu d’une `personneRef` pendante ;
après lecture de l’inventaire, il affiche l’id absent et renvoie explicitement vers le
répertoire Personnes au lieu de présenter cet id comme un nom.

Validation : les quatre E2E du dialogue de nommage réussissent, dont les deux nouveaux
scénarios de renommage immédiat et de référence absente.

## Point de reprise — état à la pause

**Le plan n’est pas terminé.** Les sections historiques plus bas conservent les décisions
et validations intermédiaires ; les chiffres de ce point de reprise sont les plus récents.

État à reprendre :

- le parcours local, le Journal du corpus, la fusion, la séparation et les noms proches
  sont réalisés ;
- toutes les commandes du répertoire Personnes sont raccordées en local et en distant ;
- `TransactionsCorpus` stabilise les définitions, réutilise une session déjà tenue ou
  applique verrou court, GET frais et PUT conditionnel ;
- les créations, refus composites et séparations publient la définition avant les liens ;
- les réunions publient les liens avant de retirer la définition absorbée et sont
  reprenables après une réussite partielle ;
- la suppression distante contrôle tous les entretiens frais avant de retirer une fiche ;
- les renommages immédiats et le diagnostic des références pendantes dans l’éditeur sont
  couverts ; restent les changements de session artificiellement provoqués pendant les
  attentes et l’harmonisation des passages historiques.

Dernière validation : `npm test` avec 757 réussites et 21 tests sautés, puis
`npm run typecheck` et `npm run build` réussis. Les cinq E2E Journal, Personnes,
rapprochement, réunion et séparation réussissent en local. Les tests WebDAV embarqués
couvrent les corrections distantes simples et composites, leurs ordres de publication,
leurs conflits et leurs réussites partielles. Le binaire Docker n’est pas disponible
dans ce WSL :
aucun banc Nextcloud réel n’a été lancé et aucune image ne doit être téléchargée.

Les modifications de ce chantier sont toujours dans l’arbre de travail, sans commit.
La prochaine étape recommandée est de couvrir un changement de session artificiellement
provoqué pendant les attentes du dialogue de nommage. Il restera ensuite à harmoniser
les passages historiques du plan et à lancer les bancs Nextcloud déjà provisionnés
lorsqu’un environnement Docker sera disponible.

La reprise sélective est désormais intégrée au dialogue de nommage : choix de source
parmi les locuteurs de la personne candidate, aperçu des valeurs, variables vides
présélectionnées, remplacement explicite et retour sans écriture. Le pseudo manquant est
maintenant proposé par défaut dans l’aperçu ; le rôle reste décoché (évolution UX ci-dessous).
La confirmation applique les champs choisis au modèle de session avant sa sauvegarde.
Un changement des données source depuis l’aperçu ou des données cibles avant application
fait échouer la reprise explicitement ; une fiche source déjà créée reste conservée.
Le nouveau test `e2e/personnes-reprise-nommage.e2e.ts` couvre le retour sans écriture,
les cases neutres, la copie confirmée du pseudo et la conservation du rôle et du nom.
Les changements de source multiples et les conflits dans ce dialogue restent à couvrir
par des E2E dédiés ; ils ne sont pas réputés validés par ce seul scénario.

### Reprise supplémentaire — garde-fous du nommage et lien visible

- La ligne de chaque locuteur lié rappelle désormais son rattachement dès l’ouverture
  de l’onglet, avec résolution du nom de référence et erreur de lecture explicite.
- Le champ additif `Locuteur.personneDeliee` mémorise un retrait volontaire du lien.
  Il bloque la création automatique au renommage et après refus de propositions,
  sans interdire une liaison explicite ; celle-ci retire le marqueur.
- Une création devenue inapplicable pendant le refus au nommage signale maintenant
  explicitement la fiche conservée au lieu d’annoncer seulement le refus comme réussi.
- Tests unitaires du marqueur et E2E du retrait, de la réouverture et du renommage
  sans recréation ; E2E de l’affichage du nom de référence dès l’ouverture.

Validation : 718 tests unitaires réussis, 21 sautés ; typecheck et build réussis.
Les E2E Personnes et nommage passent en séquentiel, ainsi que les huit E2E Locuteurs.
Le retrait de Recherche de la barre est confirmé : la recherche est accessible avec
Ctrl + F. Le test Navigation attend désormais cinq boutons et Personnes en troisième
position, entre Thèmes et Données. Validation après actualisation : build et E2E
Navigation réussis en séquentiel.
L’exécution parallèle a aussi échoué sur la scission codée, réussie en séquentiel.
Aucun banc distant démarré. Le plan reste ouvert, notamment pour les écritures distantes
et les conflits asynchrones restant à couvrir.

### Évolution validée et réalisée — premier raccordement au Journal du corpus

Le répertoire Personnes alimente un **Journal du corpus** distinct du Journal
d’entretien et de `.transaction-fichiers.json`. Ce journal est un outil d’annulation
volatile limité aux dix dernières actions prises en charge de la session courante : il
survit aux changements d’onglet et à un aller-retour dans un entretien du même corpus,
mais il est vidé au changement de corpus et au redémarrage. Il n’est écrit dans aucun
fichier, ne constitue ni un audit ni un historique persistant, ne propose aucun
rétablissement (« redo ») et reste local dans le premier livrable.

Une action appartient uniquement à l’espace depuis lequel elle est validée. Le premier
raccordement porte donc sur les commandes simples pleinement réussies depuis
`PersonnesCorpus.vue` :

| Action du répertoire | Premier raccordement | Inverse ciblé |
|---|---|---|
| renommer une Personne | annulable | ancien nom de référence |
| associer, dissocier ou déplacer un locuteur | annulable | ancien `personneRef` et ancien `personneDeliee` |
| écarter un rapprochement simple | annulable | ancien ensemble de refus |
| annuler un refus | annulable | ancien ensemble de refus |
| créer une Personne et son premier lien | ultérieur, conditionnel | définition et lien si rien ne les a réutilisés |
| supprimer une fiche vide | ultérieur, conditionnel | fiche exacte si son id est toujours libre |
| rapprocher avec plusieurs liens ou reprendre des données | exclu initialement | aucun inverse partiel |
| fusionner ou séparer | exclu initialement | aucun inverse partiel |

Un refus qui crée aussi une fiche distincte et un lien est une action composite exclue.
Toute opération distante, échouée, annulée dans une fenêtre ou partiellement réussie ne
crée aucune entrée. Une opération composite ne doit jamais être découpée en plusieurs
pseudo-entrées indépendantes. Le premier raccordement ne requiert donc aucune annulation
multi-fichiers.

Le nommage dans l’éditeur reste hors du Journal du corpus : sa sauvegarde générique ne
permet pas de reconstruire après coup une action sémantique complète. Le renommage du
locuteur relève du Journal d’entretien, dont l’annulation ne doit jamais modifier
implicitement `personneRef`. Un éventuel raccordement futur devra d’abord passer par une
commande coordonnée décrivant définition, lien, refus, données reprises et état attendu.

Le journal vit principalement dans le main. Un service en mémoire attaché au corpus
courant conserve des inverses typés et ciblés, puis expose seulement des entrées de vue
et des ids opaques par `corpus:journalLister` et `corpus:journalAnnuler`. Chaque inverse
contient l’avant à restaurer, l’après attendu, les ids concernés et les projections à
invalider. Avant toute annulation, le main relit l’état frais et compare uniquement les
champs concernés. Une cible modifiée rend l’entrée inapplicable sans écriture ; un verrou
ou fichier indisponible la bloque temporairement. Une modification sans rapport dans le
même fichier ne doit pas l’invalider.

Les entrées sont affichées de la plus récente à la plus ancienne, avec heure, libellé et
bouton `↩`. Une ancienne entrée peut être annulée sans dépilage strict. L’annulation
réussie retire l’entrée sans en créer une autre, puis réévalue les entrées restantes ;
une entrée plus ancienne peut ainsi redevenir applicable. L’aide doit parler des
« actions annulables prises en charge », pas de toutes les modifications du corpus.

Après une annulation Personnes, relire l’inventaire, les suggestions, les refus et les
notes agrégées par Personne. Conserver la sélection si son id existe encore ; sinon,
revenir à l’état sans sélection avec un message explicite. Le résultat d’annulation
porte un impact précis afin de ne pas appeler globalement `appliquerCorpus()` ni
réinitialiser l’entretien et la navigation.

Le premier incrément a ajouté `src/shared/corpus/journal.ts`, un service main dans
`src/main/journalCorpus.ts`, l’état correspondant dans `useCorpus.ts` et
`PanneauJournalCorpus.vue`. Le panneau Journal conserve la grille habituelle avec les
cartes à droite ; ce chantier ne déclenche pas l’extraction générale de `Corpus.vue`.
Le bouton Journal utilise une icône distincte de Pas à pas. Le contrat actuel
`string | null` de `personnesCommander` pourra devenir un résultat nommé avec l’impact,
sans exposer l’inverse au renderer.

Les tests dédiés doivent couvrir le cap de dix, la volatilité, l’applicabilité ciblée,
les deux renommages successifs, l’absence d’entrée pour les actions composites et les
échecs, ainsi que les inverses de renommage, liaison, déliaison, déplacement et refus.
Un E2E `journal-corpus.e2e.ts` couvre au minimum le renommage et la liaison annulés,
l’entrée grisée après modification de sa cible, la conservation dans le même corpus,
la purge au changement de corpus et l’état distant non pris en charge.

### Prochaines tâches, dans l’ordre recommandé

1. Finaliser la couverture de la reprise au nommage : sources multiples, réinitialisation
   des choix, variables, remplacement explicite et changements de session pendant les awaits.
   L’intégration de `reprendreDonneesLocuteur` au modèle de session est réalisée.
2. Indication permanente du lien réalisée et couverte à l’ouverture ; compléter si besoin
   le diagnostic des références pendantes dans l’éditeur.
3. Ajouter les E2E du refus au nommage, d’Échap, des rôles génériques et de la reprise
   dans le dialogue ; tester les erreurs et changements de session pendant les awaits.
4. La prévention de recréation après déliaison volontaire est réalisée et testée.
   Tester encore les renommages rapides et vérifier que l’annulation du renommage dans
   le Journal d’entretien n’altère jamais implicitement l’identité.
5. La séparation locale et sa reprise par le journal **technique** de remplacement
   multi-entretiens sont réalisées. Fusion et séparation restent hors du Journal visible
   du corpus au premier livrable.
6. Le Journal du corpus local et les commandes simples de Personnes sont raccordés.
   Étudier ultérieurement les créations/suppressions conditionnelles ; conserver
   l’exclusion des commandes composites, partielles et distantes.
7. Les créations, renommages, liaisons, refus, rapprochements, suppressions, réunions et
   séparations distants utilisent les transactions de définitions, les lectures fraîches
   et les PUT conditionnels. Les opérations multi-fichiers conservent et nomment leurs
   réussites partielles afin de permettre une reprise explicite.
8. Les rapprochements proches sont calibrés sur des cas français, expliqués dans les
   deux interfaces et ne déclenchent aucune sélection automatique.
9. Finaliser la documentation utilisateur/développeur, harmoniser les sections historiques
   du présent plan et exécuter les E2E Navigation/Locuteurs/Personnes/Journal ainsi que
   les bancs distants nécessaires avant de déclarer le livrable terminé.

### Évolution UX validée et réalisée — nommage simplifié

Cette évolution remplace les règles précédentes de reprise entièrement volontaire
au nommage, sans changer le parcours de regroupement depuis le corpus.

- Introduction courte, adaptée à une ou plusieurs propositions ; les rôles équivalents
  sont distingués des noms identiques. Aucun nom proche n’est annoncé sans détection.
- Après sélection, aperçu visible des données qui seront réellement reprises.
- Par défaut, compléter uniquement le pseudo et les métadonnées manquants.
  Les valeurs existantes et le statut interviewer sont conservés.
- Plusieurs entretiens liés imposent le choix explicite d’une source de données ;
  changer de source réinitialise les champs proposés.
- « Choisir les données à reprendre, ou ne rien reprendre… » permet de personnaliser
  la reprise. « Ne reprendre aucune donnée » laisse uniquement le rattachement.
  Refermer cette section conserve ces choix, sans revenir aux valeurs par défaut.
- « Confirmer » est la seule validation de la liaison et de la reprise affichée.
  Échap et « Plus tard » restent neutres, y compris après sélection d’une proposition.
- « Ce n’est pas cette personne » ou « Aucune de ces personnes » mémorise le refus
  de toutes les propositions affichées, sans devoir les sélectionner une par une.
  Les refus restent révocables depuis le répertoire.

L’E2E `personnes-nommage-simplifie` couvre les métadonnées manquantes, la conservation
du pseudo et des métadonnées renseignées, les sources multiples, la réinitialisation
des choix, le pluriel, Échap et la persistance du refus de toutes les propositions.
Les E2E du dialogue et de reprise couvrent le pseudo proposé par défaut et la validation
d’une liaison sans aucune copie, même après avoir refermé les options.

### Simplification UX validée et réalisée — répertoire corpus

- Un seul accès principal « C’est la même personne… » dans les suggestions.
- Deux fiches existantes donnent une confirmation de regroupement, avec compteurs,
  choix du nom conservé, notes visibles et explication des conséquences.
- Le regroupement ouvre la fiche conservée ; aucune fiche absorbée vide ne subsiste.
- « Cette personne a une autre fiche… » permet aussi de regrouper des noms différents.
- « Reprendre aussi certaines données… » est une section repliée, pas un second bouton
  de décision. La refermer annule la copie ; elle ne concerne que le locuteur indiqué.
- « Corriger le rattachement… » isole le déplacement ou le retrait d’un seul lien.
  Une fiche devenue vide est signalée et sa suppression reste volontaire.
- La commande de regroupement exige un aperçu frais et un inventaire complet,
  refuse les doublons dans un même entretien et conserve les notes et les refus externes.
- Le journal technique local remplace les entretiens avant de retirer la définition
  absorbée. Tests de reprise après interruption et de refus des modifications externes
  ajoutés ; il reste distinct du Journal visible du corpus.
- Le dialogue de nommage utilise aussi la section repliée de reprise. Pour un locuteur
  déjà lié, il reste explicitement un déplacement du seul rattachement en session,
  pas une fusion multi-fichiers depuis l’éditeur ouvert.

Le nouveau test `e2e/personnes-regroupement.e2e.ts` couvre l’accès depuis une fiche,
Échap et le retour du focus, le nom conservé, les notes, l’absence de fiche vide et
l’annulation d’une reprise en refermant la section, ainsi que le refus d’un aperçu périmé.
L’E2E de rapprochements couvre
le regroupement avec copie du pseudo depuis une source choisie parmi plusieurs entretiens.
La documentation utilisateur et le modèle objet décrivent ces parcours.

### Repères techniques

- `src/shared/corpus/rapprochementsPersonnes.ts` : normalisation, rôles, suggestions
  exactes ou proches regroupées, raisons affichables, refus et reprise sélective pure.
- `src/shared/corpus/personnes.ts` : inventaire enrichi et union des commandes IPC.
- `src/main/corpusStore.ts` : commandes locales et primitives utilisées par les
  transactions distantes, avec erreurs partielles explicites.
- `src/main/distant/transactions.ts` : définitions distantes, corrections simples et
  multi-fichiers, lectures fraîches, ordre de publication et résultats partiels.
- `src/main/index.ts` : répartition IPC entre commandes locales, transactions de
  définitions, transactions d’entretien et refus des composites non pris en charge.
- `src/renderer/composables/useEntretien.ts` : file de nommages, dialogue et décisions
  appliquées au modèle de session. La définition est écrite avant le lien ; si la
  session change entre les deux, une fiche vide peut rester visible et réparable.
- `src/renderer/components/entretien/RapprochementNommage.vue` : dialogue natif, focus neutre,
  sélection explicite, fermeture sans décision et libellés de déplacement.
- `src/renderer/components/corpus/PersonnesCorpus.vue` : suggestions/refus globaux et reprise
  sélective avec choix de l’entretien source.
- `e2e/personnes*.e2e.ts`, `e2e/rapprochements-personnes.e2e.ts`, les tests unitaires
  Personnes et `test/webdav/transactions.test.ts` couvrent les incréments livrés.

Les modifications sont dans l’arbre de travail, sans commit créé par l’agent.
Préserver `plans/reflexion/export-sonal-alt.md`, fichier utilisateur hors de ce chantier.
Cet incrément ne constitue donc pas la fin du plan.

## Évolution validée — création par défaut et reprise sélective

Les décisions ci-dessous priment sur les parcours initiaux décrits plus bas.
Elles restent à implémenter ; le premier incrément livré ne les inclut pas.

### Création par défaut

Après validation d’un nom spécifique pour un locuteur non lié :

- sans candidat crédible, créer une Personne puis rattacher le locuteur ;
- avec candidat, proposer le rapprochement avant de créer une fiche ;
- si le rapprochement est accepté, utiliser la personne existante ou créer une fiche
  commune lorsque le candidat n’est pas lié ;
- si l’utilisateur choisit « Personne différente », créer une fiche distincte et
  mémoriser le refus ;
- avec « Plus tard » ou fermeture, laisser le locuteur non lié et conserver la
  suggestion à traiter, sans enregistrer de refus.

Créer une identité individuelle ne constitue pas un rapprochement automatique.
Les rapprochements entre locuteurs restent toujours explicitement confirmés.

Garde-fous :

- aucune création dès l’ajout d’un « Nouveau locuteur » ;
- aucune création pour un nom vide, trop court ou générique ;
- aucune nouvelle fiche au renommage d’un locuteur déjà lié ;
- aucune recréation automatique consécutive à une déliaison volontaire ;
- aucune création massive pour les anciens corpus sans action explicite ;
- conserver l’écriture de la définition avant celle du lien et rendre les échecs visibles.

Le lien reste facultatif pour les inconnus, les rôles génériques et les décisions en
attente. La fusion locale devient nécessaire dans ce périmètre pour corriger les fiches
créées séparément faute de rapprochement détecté.

### Cas particulier des rôles génériques

Les rôles explicites « Interviewer », « Intervieweur » et « Enquêteur » peuvent déclencher
une proposition vers un rôle équivalent dans un autre entretien. La raison affichée est
« même rôle », jamais « même identité ». Montrer le titre de l’entretien, le nom local et
le nom de la Personne liée lorsqu’elle existe. Ne présélectionner aucun candidat.

Exemple :

> Un locuteur nommé « Interviewer » existe dans l’entretien B.
> S’agit-il de la même personne ?

Après un refus, inviter sans obligation à choisir un nom ou un pseudonyme spécifique,
par exemple « Enquêteur A ». Un nom civil n’est jamais requis. Si le libellé reste
un rôle générique, ne pas créer automatiquement de Personne distincte.
L’acceptation explicite peut en revanche créer une fiche commune ou lier à une fiche
existante, même lorsque les noms locaux restent génériques.

Les refus sont mémorisés et révocables comme les autres refus. « Inconnu », « Anonyme »,
« Nouveau locuteur », « Non attribué » et les simples libellés « Locuteur » ou « Speaker »
restent exclus. La liste des rôles équivalents doit être explicite et testée.

### Identité et reprise de données

La fenêtre distingue trois décisions :

1. **Même personne** : modifier uniquement le lien d’identité ;
2. **Même personne, choisir les données à reprendre…** : préparer une liaison avec une
   copie sélective depuis un locuteur source ;
3. **Personne différente** : mémoriser le refus et appliquer les règles de création
   ci-dessus.

**Plus tard** et la fermeture restent des sorties neutres, sans refus ni copie.
Ouvrir le choix des données ne valide pas encore la liaison ; revenir en arrière ne
modifie rien.

L’aperçu de reprise permet de choisir l’entretien source lorsque plusieurs locuteurs
sont disponibles, puis les champs à copier. Il affiche les valeurs actuelles et proposées.
Par défaut, proposer seulement de remplir les champs vides ; remplacer une valeur
existante demande une sélection explicite. Ne jamais arbitrer silencieusement entre
plusieurs sources.

La reprise est une copie ponctuelle, pas une synchronisation. Le nom local reste
inchangé. Les valeurs de variables de portée locuteur peuvent évoluer dans le temps ;
le statut interviewer / répondant peut aussi différer selon l’entretien. Ce statut et
le pseudonyme restent au niveau du Locuteur, jamais de la Personne.

Proposer la reprise du statut interviewer / répondant et l’action « Utiliser le même
pseudonyme » avec des cases décochées par défaut. Leur sélection déclenche uniquement
une reprise ponctuelle explicitement confirmée, sans synchronisation future.
Une liaison d’identité seule ne change ni le rôle ni la pseudonymisation.

Le pseudonyme nécessite une analyse du modèle actuel de pseudonymisation avant de
rendre sa reprise disponible : une Personne ne doit pas devenir implicitement une règle
d’anonymisation. Si sa reprise nécessite de créer ou d’étendre une règle plutôt que de
copier un champ, l’aperçu doit annoncer cette opération et les textes concernés avant
confirmation. Présenter uniquement les champs dont la reprise est réellement prise en
charge et testée.

La commande finale doit appliquer le lien et les données sélectionnées sur un état frais,
sans écraser une modification concurrente. Toute réussite partielle doit être décrite
explicitement ; l’interface ne doit pas annoncer une reprise complète en cas d’échec.

### Incidences sur la suite du plan

- Adapter l’état vide et l’aide : une première personne est normalement créée au nommage
  spécifique, sans attendre une deuxième rencontre.
- Remplacer l’exclusion absolue des rôles génériques par le parcours particulier ci-dessus.
- Remplacer les boutons Oui/Non par les décisions d’identité et la reprise sélective,
  tout en conservant les refus révocables et la sortie neutre.
- L’interdiction de propagation automatique reste valable ; une copie ponctuelle
  sélectionnée et confirmée devient autorisée.
- Avancer la fusion locale transactionnelle dans le périmètre nécessaire à cette évolution.
- Ajouter les commandes de préparation et de validation de reprise après examen du modèle
  des variables et de la pseudonymisation.
- Remplacer le test E2E « nommer un premier locuteur ne crée pas une personne
  silencieusement » par la création automatique au premier nom spécifique validé.
- Couvrir création sans candidat, refus avec fiche distincte, attente sans fiche,
  renommage lié, déliaison sans recréation et absence de migration automatique.
- Couvrir les rôles équivalents, l’invitation facultative, les refus persistants et
  l’exclusion des libellés d’attente.
- Couvrir liaison seule sans modification des données, sélection de source et de champs,
  remplissage des vides, remplacement explicite, annulation, conflits et échecs partiels.
- Compléter les critères de fin avec ces parcours et la fusion locale reprenable.

## 1. Objectif et principes

Un locuteur reste une entité propre à un entretien : il porte le nom utilisé dans cet
entretien, ses valeurs et l’index référencé par les blocs. Une `Personne` est une identité
transverse facultative qui relie des locuteurs de plusieurs entretiens.

Exemple :

```text
Personne « Marie Dupont »
├── Entretien A · locuteur « Marie »
├── Entretien B · locuteur « Mme Dupont »
└── Entretien D · locuteur « M. Dupont »
```

Le chantier suit cinq principes :

1. **Suggérer, jamais décider en silence.** Un nom identique ou proche produit une
   proposition, jamais une liaison automatique.
2. **Conserver les noms locaux.** Lier « Marie » à « Marie Dupont » ne renomme pas le
   locuteur de l’entretien.
3. **Rendre toute décision corrigeable.** L’utilisateur peut lier, délier, déplacer,
   séparer ou fusionner depuis l’onglet.
4. **Tolérer les homonymes.** Deux personnes peuvent porter exactement le même nom.
5. **Ne pas confondre Personnes et pseudonymisation.** Le lien peut faciliter une action
   de pseudonymisation ultérieure, mais une `Personne` ne référence pas directement une
   `RegleAnon`.

Ne font pas partie du premier livrable :

- reconnaissance automatique à partir du contenu des transcriptions ;
- biométrie ou reconnaissance vocale ;
- fusion automatique fondée sur les variables ;
- propagation automatique d’un nom, d’un pseudo ou d’une valeur ;
- nouvelle portée EAV `personne` ;
- import/export de `Personne` dans `.sonal`, format qui ne connaît pas cette notion.

## 2. UX recommandée pour l’onglet

### 2.1 Navigation

Ajouter **Personnes** à la barre d’icônes de `Corpus.vue`, entre Thèmes et les outils
suivants. L’ordre cible, en tenant compte des futurs onglets Notes et Journal, est :

1. Accueil ;
2. Thèmes ;
3. **Personnes** ;
4. Notes ;
5. Données ;
6. Pseudonymisation ;
7. Journal ;
8. Pas à pas, en mode démonstration.

Les onglets non encore livrés ne réservent pas de bouton vide. La recherche est accessible
avec **Ctrl + F**, sans bouton dans cette barre. Journal et Pas à pas doivent utiliser des
icônes distinctes.

L’icône `locuteurs.png` peut être réutilisée au premier livrable. Une icône distincte
représentant plusieurs silhouettes serait préférable à terme pour ne pas confondre
**Personnes du corpus** et **Locuteurs de l’entretien**.

Comme Données et Pseudonymisation, Personnes masque les cartes d’entretiens et utilise
toute la largeur. Il reprend leur organisation maître/détail gauche-droite et leur
séparateur accessible, redimensionnable et mémorisé.

### 2.2 Vue d’ensemble

```text
┌──────────────────────────────┬──────────────────────────────────────────────┐
│ Personnes                    │ Personne                                    │
│                              │                                              │
│ [ Rechercher…              ] │ Marie Dupont                       [Modifier]│
│ [Toutes] [À vérifier 3]      │ 3 entretiens · 3 noms locaux                │
│                              │                                              │
│ À vérifier                   │ Noms et entretiens                           │
│ ? Marie ↔ Maria D.           │ Entretien A   Marie          [Ouvrir] [Délier]│
│                              │ Entretien B   Mme Dupont     [Ouvrir] [Délier]│
│ Répertoire                   │ Entretien D   M. Dupont      [Ouvrir] [Délier]│
│ Marie Dupont       3     ●   │                                              │
│ Paul Martin        2         │ Rapprochements proposés                     │
│ Samira Benali      1         │ Maria D. · Entretien C       [Lier] [Écarter]│
│                              │                                              │
│ Locuteurs non liés      12   │ Données de locuteur                          │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

Le panneau gauche sert à **trouver le travail à faire**. Le panneau droit sert à
**comprendre puis corriger**. Il ne faut pas ouvrir une modale pour chaque action
ordinaire de correction : la modale est réservée au rapprochement déclenché pendant le
nommage et aux actions destructives.

### 2.3 Panneau gauche

Le panneau contient :

- le titre **Personnes** et les compteurs `N personnes · N locuteurs non liés` ;
- une recherche sur le nom de référence, les noms locaux et les titres d’entretien ;
- deux filtres principaux :
  - **Toutes** : répertoire des personnes ;
  - **À vérifier** : suggestions non traitées et éventuels problèmes de cohérence ;
- une section **Répertoire**, avec pour chaque personne :
  - nom de référence ;
  - nombre d’entretiens liés ;
  - badge de suggestions en attente ;
- une section repliable **Locuteurs non liés**, regroupée par entretien ;
- un filtre secondaire **Décisions écartées**, afin de pouvoir annuler un ancien « Non ».

La sélection d’une ligne ouvre son détail à droite. Sans sélection, le panneau droit
explique le fonctionnement et propose en priorité la première suggestion à traiter.

État vide du corpus :

> Aucune personne n’est encore identifiée. Nommez les locuteurs dans un entretien ou
> choisissez un locuteur non lié pour créer sa fiche.

Une personne vide créée manuellement apporte peu de valeur. Le premier livrable crée une
personne à partir d’au moins un locuteur, ou lors de l’acceptation d’un rapprochement.

### 2.4 Fiche de droite

La fiche d’une personne contient :

- son **nom de référence**, éditable sans renommer les locuteurs liés ;
- une **note libre courte**, facultative ;
- la liste des locuteurs liés : entretien, nom local, statut interviewer, verrou éventuel ;
- les actions par ligne :
  - **Ouvrir l’entretien** sur l’onglet Locuteurs ;
  - **Délier** ;
  - **Déplacer vers…** une autre personne ;
- les rapprochements proposés pour cette personne, avec **Lier** et **Écarter** ;
- les valeurs des variables de portée locuteur, présentées par entretien.

Les valeurs différentes ne sont pas qualifiées automatiquement d’erreurs. Un âge, un
statut ou une profession peut légitimement évoluer entre deux entretiens. Le premier
livrable les montre côte à côte pour aider le contrôle, sans badge de divergence ni
propagation. Une évolution ultérieure pourra permettre de marquer certaines variables
comme stables au niveau d’une personne.

Actions de correction au niveau de la fiche :

- **Fusionner avec…** : regrouper deux fiches en conservant explicitement un nom de
  référence ;
- **Séparer…** : choisir un ou plusieurs locuteurs liés et créer une nouvelle personne.
  La sélection doit laisser au moins un locuteur sur la fiche d’origine ; déplacer tous
  les locuteurs est refusé, car il faut alors corriger ou supprimer volontairement la
  fiche devenue inutile ;
- **Supprimer** : permis seulement lorsque la personne n’a plus aucun locuteur lié.

Cette dernière règle évite de créer volontairement des références pendantes. Une
référence déjà pendante à cause d’un fichier modifié extérieurement reste diagnostiquée
et réparable, jamais supprimée silencieusement.

### 2.5 Fenêtres de confirmation

Les confirmations montrent toujours les conséquences avant validation :

- **Délier** : nom local et entretien concernés ;
- **Déplacer** : personne source et personne cible ;
- **Fusionner** : nom conservé, nombre de locuteurs réaffectés, entretiens verrouillés ;
- **Séparer** : locuteurs sélectionnés et nom de la nouvelle personne.

Une fusion n’est pas lancée si les deux personnes ont chacune un locuteur dans le même
entretien. Le premier livrable demande de corriger ce cas dans l’entretien avant de
fusionner. Une évolution pourra proposer une vraie fusion de locuteurs locaux, qui devra
réaffecter les blocs et arbitrer leurs valeurs EAV.

## 3. Suggestion pendant le nommage d’un locuteur

### 3.1 Déclenchement

Après validation d’un nouveau nom dans l’onglet Locuteurs d’un entretien :

1. normaliser le nom et rechercher les candidats dans les autres entretiens ;
2. ne rien faire si le nom est vide, générique ou trop court ;
3. s’il existe un ou plusieurs candidats crédibles, ouvrir une fenêtre légère ;
4. laisser le renommage local acquis, quel que soit le choix de rapprochement.

La fenêtre ne doit pas interrompre la frappe à chaque caractère. Elle s’ouvre après
`change`, Entrée ou sortie du champ, comme le renommage actuel.

Proposition exacte :

```text
Une personne déjà rencontrée ?

Vous venez de nommer ce locuteur « Marie Dupont ».
Un locuteur porte le même nom dans « Entretien B ».

○ Marie Dupont · Entretien B
  liée à la personne « Marie Dupont » dans 2 entretiens

[Oui, c’est la même personne] [Non, homonyme] [Plus tard]
```

Proposition proche :

```text
Le nom « Maria Dupont » est proche de « Marie Dupont ».
Vérifiez l’entretien et les noms locaux avant de les rapprocher.

[Associer] [Ce n’est pas la même personne] [Plus tard]
```

S’il y a plusieurs candidats, la fenêtre les liste avec un bouton radio. Elle n’en
présélectionne aucun pour un rapprochement approximatif.

Les choix ont la sémantique suivante :

- **Associer / Oui** : lie le locuteur à la personne existante ; si le candidat est un
  locuteur non lié, crée une personne puis lie les deux locuteurs ;
- **Non / Homonyme** : mémorise le refus et ne repropose plus cette paire ;
- **Plus tard** ou fermeture : n’écrit aucune décision ; la proposition reste visible dans
  l’onglet Personnes.

### 3.2 Noms à ne pas proposer

Ignorer au minimum :

- `Nouveau locuteur` ;
- `Locuteur`, `Speaker` ou `Speaker N` ;
- `Inconnu`, `Anonyme`, `Non attribué` ;
- les chaînes d’un seul caractère ;
- deux locuteurs du même entretien.

`Enquêteur` et `Intervieweur` sans autre précision sont aussi des rôles génériques. Un
vrai nom d’enquêteur reste en revanche éligible : une même personne peut conduire
plusieurs entretiens.

### 3.3 Rapprochement exact et rapprochement proche

La détection reste une requête pure et explicable.

Normalisation commune :

- espaces de début et de fin retirés ;
- espaces successifs fusionnés ;
- casse ignorée ;
- accents ignorés pour la comparaison ;
- apostrophes, points et traits d’union harmonisés.

Deux niveaux sont distingués dans l’interface :

1. **Même nom** : clés normalisées identiques ;
2. **Nom proche** : score supérieur à un seuil strict, calculé sur les mots et la distance
   d’édition.

Pour limiter les faux positifs, le rapprochement proche est désactivé pour les noms de
moins de quatre caractères et ne doit pas reposer uniquement sur un prénom courant. Le
résultat expose toujours sa raison : « même nom », « une lettre différente », « mêmes
mots dans un ordre différent », etc.

Le seuil et l’algorithme sont testés sur un petit corpus de cas français avant de les
figer. Le premier incrément peut livrer seulement les noms exacts ; le proche est activé
une fois les faux positifs observés et corrigés.

### 3.4 Locuteur déjà lié

Renommer un locuteur lié ne renomme pas la personne. La ligne affiche discrètement :

> Lié à « Marie Dupont » — le nom saisi reste le nom local de cet entretien.

Si le nouveau nom correspond fortement à une autre personne, la fenêtre propose
**Déplacer vers cette personne**, **Conserver le lien actuel** ou **Plus tard**. Aucun
changement de lien n’est implicite.

## 4. Modèle de données

### 4.1 Type `Personne`

Remplacer la réserve actuelle `Record<string, unknown>` par un type explicite :

```ts
export interface Personne {
  id: string
  nom: string
  note?: string
}

export interface CorpusFichier {
  // ...
  personnes: Record<string, Personne>
}
```

Le nom n’est pas une identité et n’est pas unique. L’id opaque est la seule identité
stable. Les noms locaux et les titres d’entretien sont dérivés en lisant les
`personneRef` des locuteurs ; ils ne sont pas recopiés dans `corpus.json`.

Le champ reste purement SonalPi2 et n’est pas émis dans un export `.sonal`.

### 4.2 Lien et refus sur `Locuteur`

Le lien existant reste la source de vérité :

```ts
export interface Locuteur {
  id?: string
  // ...
  personneRef: string | null
  rapprochementsRefuses?: string[]
}
```

Les cibles refusées sont préfixées pour distinguer les deux cas :

```text
personne:<personneId>
locuteur:<locuteurId>
```

La décision vit avec le locuteur qui l’a prise. La requête traite le refus comme
symétrique : une paire n’est plus proposée si l’un des deux locuteurs a refusé l’autre.
Pour une personne, le refus vaut si son id ou l’un de ses locuteurs liés apparaît dans
la liste. L’onglet permet de retirer cette décision.

Les identifiants de locuteurs sont indispensables aux refus et aux corrections. La
projection Personnes appelle `completerIdsLocuteurs()` en mémoire pour les anciens
fichiers, de façon déterministe. Un id n’est persisté que lors d’une véritable écriture,
comme aujourd’hui.

Ces champs sont additifs et tolérants à l’absence. Le choix d’un bump de
`FORMAT_VERSION` doit suivre la politique générale du projet au moment de
l’implémentation ; la lecture d’un ancien corpus doit dans tous les cas produire
`personnes: {}` et aucun refus.

### 4.3 Invariants

Les commandes de domaine garantissent :

- un locuteur référence zéro ou une personne ;
- une `personneRef` créée par l’application vise une personne existante ;
- une personne ne lie au plus qu’un locuteur par entretien dans le premier livrable ;
- un rapprochement refusé n’empêche jamais une liaison manuelle ultérieure ;
- fusionner réécrit les références vers la personne conservée et réconcilie les refus ;
- supprimer une personne liée est refusé.

## 5. Projection et commandes métier

### 5.1 Projection de lecture

Ajouter une requête corpus qui lit les entretiens sans les conserver dans le renderer :

```ts
interface VuePersonne {
  personne: Personne
  locuteurs: VueLocuteurPersonne[]
  suggestions: SuggestionPersonne[]
}

interface VueLocuteurPersonne {
  entretienId: string
  entretienTitre: string
  locuteurId: string
  index: number
  nom: string
  interviewer: boolean
  valeursLoc: Record<string, string>
  personneRef: string | null
}
```

La réponse globale contient aussi les locuteurs non liés, les refus et les références
pendantes. Les suggestions sont recalculées à chaque actualisation ; elles ne sont pas
stockées.

Le renderer reçoit une projection dédiée plutôt que N appels
`lireEntretien()`. Le main est déjà responsable des autres requêtes transverses comme la
matrice et le scan d’anonymisation.

### 5.2 Fonctions pures dans `src/shared/corpus/personnes.ts`

Prévoir notamment :

- `cleNomPersonne(nom)` ;
- `scoreRapprochement(a, b)` ;
- `inventorierPersonnes(corpus, entretiens)` ;
- `suggestionsPersonnes(corpus, entretiens)` ;
- `creerPersonne(corpus, nom)` ;
- `renommerPersonne(corpus, id, nom)` ;
- `lierLocuteur(entretien, locuteurId, personneId)` ;
- `delierLocuteur(entretien, locuteurId)` ;
- `refuserRapprochement(entretien, locuteurId, cible)` ;
- `annulerRefusRapprochement(...)` ;
- préparation pure d’une fusion et d’une séparation.

Les fonctions utilisent l’id stable du locuteur. L’index reste réservé aux blocs,
valeurs et imports/exports existants.

### 5.3 Commandes exposées au renderer

Surface IPC indicative :

- `corpus:personnesInventaire` ;
- `corpus:personnesSuggestionsPourLocuteur` ;
- `corpus:personneCreerDepuisLocuteurs` ;
- `corpus:personneRenommer` ;
- `corpus:personneLierLocuteur` ;
- `corpus:personneDelierLocuteur` ;
- `corpus:personneRefuserRapprochement` ;
- `corpus:personneAnnulerRefus` ;
- `corpus:personnesFusionner` ;
- `corpus:personneSeparer` ;
- `corpus:personneSupprimerVide`.

Les retours des commandes multi-entretiens sont nominatifs : succès et échecs par
entretien, avec la personne finale obtenue. L’interface ne doit jamais afficher une
fusion complète si certains fichiers n’ont pas été mis à jour.

## 6. Écritures locales et distantes

### 6.1 Cas simples

- renommer une personne ou modifier sa note touche seulement `corpus.json` et suit les
  transactions courtes de définitions ;
- lier, délier ou refuser depuis un entretien ouvert modifie le modèle réactif puis suit
  sa sauvegarde de session ;
- modifier un entretien fermé utilise un verrou court, un GET frais et un PUT
  conditionnel en distant, comme les lots EAV et anonymisation.

Avant de rechercher ou corriger depuis le corpus, vider la sauvegarde différée de
l’entretien éventuellement ouvert afin que la projection lise un état cohérent.

### 6.2 Création depuis deux locuteurs non liés

L’ordre recommandé est :

1. créer la personne dans `corpus.json` ;
2. lier les locuteurs, entretien par entretien ;
3. retourner les succès et échecs nommés ;
4. garder la personne si un seul lien a réussi, avec une suggestion permettant de
   reprendre le second.

Cet ordre peut produire temporairement une personne avec un seul lien, mais jamais une
référence vers une personne absente. Un échec de verrou n’est ni masqué ni réessayé en
boucle.

### 6.3 Fusion et séparation

Ces opérations touchent plusieurs fichiers et demandent une stratégie de reprise dédiée.

En local, étendre le journal technique `TransactionsFichiersCorpus` à un plan de
remplacement de plusieurs entretiens et de `corpus.json`, reprenable après arrêt. Ce
mécanisme n’est pas le Journal visible du corpus et ne crée aucune entrée d’annulation.

En distant :

- traiter les entretiens dans un ordre stable ;
- acquérir un verrou court par entretien ;
- réécrire les `personneRef` vers la personne conservée ;
- ne supprimer la personne absorbée de `corpus.json` qu’après le succès de tous les
  entretiens ;
- en cas d’échec partiel, conserver les deux définitions et proposer **Reprendre la
  fusion**.

La première version peut limiter la fusion aux corpus locaux si cette reprise distante
n’est pas livrée avec une couverture suffisante. Lier, délier et déplacer restent alors
disponibles en distant et suffisent pour corriger manuellement.

## 7. Architecture renderer

Créer :

- `src/renderer/components/corpus/PersonnesCorpus.vue` : disposition, liste et fiche ;
- éventuellement `src/renderer/components/corpus/RapprochementPersonne.vue` : fenêtre partagée
  avec l’entretien ;
- `src/shared/corpus/personnes.ts` : logique pure de modèle et de suggestion ;
- `src/shared/corpus/journal.ts`, `src/main/journalCorpus.ts` et
  `src/renderer/components/corpus/PanneauJournalCorpus.vue` pour les annulations locales
  prises en charge depuis le corpus.

Faire évoluer :

- `Corpus.vue` : type `OngletCorpus`, bouton, accueil et rendu pleine largeur ;
- `useCorpus.ts` : inventaire, fraîcheur, commandes et messages ;
- `useEntretien.ts` : déclencher la recherche après `renommerLoc`, appliquer le choix au
  locuteur ouvert et rafraîchir la gouttière ;
- `Entretien.vue` : fenêtre de rapprochement et indication du lien actuel ;
- `format.ts`, preload, handlers IPC et store ;
- `docs/user/vue-corpus.md` et `docs/dev/modele-objet.md`.

L’inventaire suit un cycle frais/périmé proche du scan de pseudonymisation :

- premier accès : chargement ;
- renommage, ajout ou suppression de locuteur : périmé ;
- liaison, refus, fusion ou séparation : rafraîchissement après succès ;
- tirage distant : périmé ;
- bouton **Actualiser** toujours disponible.

Conserver le dernier inventaire lisible si l’actualisation échoue et afficher l’erreur.

## 8. Accessibilité et adaptation

- bouton d’onglet avec `title`, `aria-label` et `aria-current` ;
- recherche et filtres correctement libellés ;
- liste maître navigable au clavier ;
- boutons explicites, sans dépendre uniquement d’icônes ou de couleurs ;
- fenêtre de rapprochement avec titre, focus initial neutre et retour du focus au champ
  de nom ;
- séparateur focalisable et réglable aux flèches ;
- sous le seuil où les deux panneaux ne tiennent plus, empilement vertical ;
- annonces lisibles des résultats partiels et des verrous.

## 9. Tests

### 9.1 Tests unitaires

Couvrir au minimum :

- normalisation de casse, accents, espaces, apostrophes et traits d’union ;
- noms génériques et noms trop courts exclus ;
- distinction entre correspondance exacte et proche ;
- faux positifs de prénoms courts ou courants refusés ;
- suggestions limitées aux autres entretiens ;
- homonymes autorisés ;
- refus symétrique et annulation du refus ;
- absence de suggestion pour un locuteur déjà correctement lié ;
- liaison, déplacement, séparation et fusion par ids ;
- refus de deux locuteurs d’un même entretien dans une personne ;
- refus de suppression d’une personne liée ;
- références pendantes remontées sans suppression silencieuse ;
- complément déterministe des anciens ids de locuteurs.

### 9.2 Tests E2E locaux

1. Personnes apparaît entre Thèmes et Données et masque les cartes ;
2. un corpus vide affiche l’aide attendue ;
3. nommer un premier locuteur ne crée pas une personne silencieusement ;
4. nommer le même locuteur dans un autre entretien ouvre la fenêtre ;
5. Oui crée la personne et lie les deux locuteurs sans changer leurs noms locaux ;
6. Non mémorise l’homonymie et la proposition ne revient pas ;
7. Plus tard laisse la suggestion dans **À vérifier** ;
8. une proposition proche est clairement distinguée d’un nom identique ;
9. lier, délier et déplacer depuis la fiche mettent à jour les deux panneaux ;
10. une décision écartée peut être restaurée ;
11. renommer la personne ne renomme aucun locuteur ;
12. retour d’un entretien restaure personne sélectionnée, filtre et défilement ;
13. le séparateur est réglable, persistant et accessible ;
14. la disposition étroite empile les panneaux ;
15. une fusion locale réussit ou est reprise après interruption.

### 9.3 Tests distants

- locuteur verrouillé par autrui : lecture possible, action refusée nominativement ;
- liaison sur entretien fermé : verrou court, GET frais, PUT conditionnel ;
- entretien ouvert chez nous : réutilisation de la session, sans auto-concurrence ;
- échec partiel lors d’une création à deux liens : personne et succès conservés, échec
  visible et reprenable ;
- actualisation distante invalide l’inventaire ;
- aucune publication n’écrase une modification concurrente.

Exécuter au minimum :

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e -- e2e/locuteurs.e2e.ts e2e/navigation.e2e.ts e2e/personnes.e2e.ts
```

Les bancs Nextcloud sont seulement démarrés si les scénarios distants sont nécessaires.
Aucune image Docker ne doit être retéléchargée.

## 10. Ordre de mise en œuvre

### Lot 1 — modèle et contrôle manuel

1. typer `Personne` et créer les fonctions pures ;
2. ajouter la projection d’inventaire et les IPC de lecture ;
3. ajouter l’onglet, la disposition gauche-droite et les états vides ;
4. créer une personne depuis un locuteur non lié ;
5. lier, délier, déplacer et renommer ;
6. afficher les références pendantes et les verrous.

Ce lot apporte déjà un vrai espace de correction sans automatisme fragile.

### Lot 2 — suggestions exactes au nommage

1. calculer les correspondances exactes ;
2. ouvrir la fenêtre après validation du nom ;
3. gérer Oui, Non et Plus tard ;
4. mémoriser et révoquer les refus ;
5. restaurer le contexte au retour de l’entretien.

### Lot 3 — noms proches

1. constituer les cas de test français ;
2. choisir et calibrer le score ;
3. afficher la raison et ne rien présélectionner ;
4. mesurer les faux positifs avant généralisation.

### Lot 4 — corrections avancées

1. séparation ;
2. fusion locale transactionnelle et reprenable ;
3. fusion distante avec reprise explicite ;
4. affichage comparé des variables ;
5. point d’entrée optionnel vers la pseudonymisation.

### Lot 5 — annulations locales depuis le corpus

1. créer le service volatile main, les contrats de vue et les IPC du Journal ;
2. ajouter le panneau sans engager d’autre extraction de `Corpus.vue` ;
3. journaliser les commandes simples de Personnes avec leur avant/après ciblé ;
4. vérifier l’état frais avant annulation et invalider seulement les projections touchées ;
5. exclure explicitement rapprochements composites, reprises, fusions, séparations,
   réussites partielles et opérations distantes ;
6. raccorder ultérieurement création et suppression de fiche comme actions conditionnelles.

## 11. Critères de fin du premier livrable

Le premier livrable fonctionnel est terminé lorsque :

- Personnes est un onglet corpus pleine largeur en deux panneaux ;
- les personnes et locuteurs non liés sont trouvables sans charger tous les entretiens
  dans le renderer ;
- une même personne peut relier des noms locaux différents ;
- les liaisons erronées sont corrigeables par liaison, déliaison et déplacement ;
- les noms identiques produisent une proposition explicite au nommage ;
- Oui, Non et Plus tard ont des effets distincts, persistants et réversibles ;
- aucun rapprochement, renommage ou changement de valeur n’est automatique ;
- les homonymes sont supportés ;
- les verrous et échecs partiels distants sont visibles ;
- le Journal du corpus annule les commandes simples pleinement réussies du répertoire,
  sans journaliser les actions composites, partielles, distantes ou issues de l’entretien ;
- une annulation vérifie l’après attendu et ne réécrit jamais une cible modifiée depuis ;
- les tests unitaires, E2E, le typecheck et le build passent.

## 12. Évolutions possibles après validation d’usage

- action **Pseudonymiser cette personne**, qui prépare une règle à partir des noms locaux
  mais demande encore validation ;
- variable explicitement marquée **stable pour une personne**, avec contrôle des valeurs ;
- fusion de deux locuteurs du même entretien ;
- import/export CSV du répertoire des personnes ;
- recherche de variantes plus avancée, toujours locale et explicable ;
- statistiques longitudinales par personne ;
- affichage facultatif de la personne liée dans la matrice Données.
