# Repenser l’onglet Personnes en onglet Locuteurs

## Statut et objectif

**Statut : lot local B1–B5 livré et clôturé. Consultation, corrections de sélection,
renommage depuis l’entretien, création au nommage et détails secondaires sont qualifiés.
Captures et aide actualisées ; réserves transversales documentées sans extension du lot.**

La suite fait l’objet du [plan Locuteurs distants et nettoyage](plan-locuteurs-distants-et-nettoyage.md) :
préciser les besoins et les mécanismes adaptés au distant, puis raccorder les
fournisseurs, retirer le panneau historique et harmoniser les noms techniques.
La comparaison avec les thématiques est une piste d’analyse, pas un choix d’architecture.

Remplacer le répertoire technique des personnes et de leurs associations par une
vue simple des locuteurs du corpus : qui intervient, dans quels entretiens et à
quels endroits. Permettre de reconnaître un même intervenant ou de corriger un
regroupement sans exiger de comprendre le modèle Personne/Locuteur.

Le format natif 10 distingue les identités de locuteurs du corpus et leurs
participations propres aux entretiens. L’interface emploie « locuteur » ; les
identifiants et contraintes restent internes. Une identité n’est jamais déduite
du seul nom.

Ce document fixe une cible fonctionnelle et une démarche. La section « Décisions
structurantes » consigne les choix validés. Les détails encore ouverts sont
signalés dans les parcours ; ils ne remettent pas en cause la première livraison
limitée aux corpus locaux.

L’unification du modèle interne fait l’objet d’un
[plan séparé Locuteur / ParticipationLocuteur](plan-unification-locuteurs-participations.md).
Sa bascule en format 10 est effectuée, y compris pour les cas et analyses,
sans adaptateur de stockage 9. Les corrections d’interface utilisent ce modèle
commun et les transactions existantes. Les fonctionnalités de consultation déjà
réalisées restent conservées.

### Bilan du lot avant cadrage de l’unification

- **Disponible en local :** liste unifiée, recherche, sélection multiple,
  barres textuelles, navigation vers les interventions et statistiques de volume.
- **Moteur testé mais non raccordé :** renommage global, regroupement multiple
  avec choix sur les noms et dissociation indépendante des participations.
- **Conservé provisoirement :** ancien répertoire de détails et ses commandes ;
  comportement historique de création et de nommage dans les entretiens.
- **Non engagé :** migration du modèle Personne/Locuteur, création automatique
  sans exclusions, remplacement complet des anciens parcours et ouverture distante.
- **Qualification du lot :** 226 tests ciblés, huit parcours Electron locaux,
  vérification TypeScript et compilation réussis.

Ce lot constitue un point d’arrêt local versionnable, pas la livraison complète
de la refonte. La coexistence des noms et commandes historiques doit être résolue
par le cadrage de l’unification, avant de poursuivre leur raccord à l’interface.

## 1. Intentions exprimées

- Renommer l’onglet corpus **Locuteurs**.
- Créer discrètement l’identité commune lorsqu’un utilisateur nomme un locuteur
  dans un entretien, puis le faire apparaître dans le corpus.
- Conserver la demande de rapprochement lorsqu’un nom ressemble à un existant.
  Un nom identique n’autorise pas non plus une fusion automatique.
- À gauche, afficher une liste simple de locuteurs, sans expliquer la distinction
  entre personnes du corpus et locuteurs d’entretien.
- À droite, afficher le déroulement des entretiens et mettre en évidence les
  tours de parole de la sélection.
- Autoriser la sélection multiple avec les conventions d’un explorateur de
  fichiers, puis l’action « C’est le même locuteur ».
- Permettre de dissocier des locuteurs précédemment associés. L’utilisateur ne
  crée de locuteurs que dans les entretiens, jamais depuis l’onglet corpus.
- Prévoir des statistiques portant sur la sélection.
- Créer l’identité automatiquement après validation d’un nom non vide,
  **sans liste de noms exclus**, y compris pour les noms génériques et les rôles.
- Propager un renommage depuis le corpus aux locuteurs des entretiens concernés.
- Reprendre le déroulement textuel et les barres de même largeur de l’onglet
  Entretiens ; ne pas introduire de frise chronométrée dans cette première étape.
- Afficher par défaut les entretiens concernés par la sélection, avec une option
  pour montrer tous les entretiens.
- Livrer d’abord le fonctionnement sur les corpus locaux, sans dépendre de
  l’ouverture des commandes distantes.

## 2. État existant et éléments réutilisables

### Répertoire et identités

Le répertoire actuel distingue les personnes définies dans le corpus, les
locuteurs à associer, les suggestions et les décisions écartées. Il permet de
créer, renommer, associer, déplacer, délier, réunir et séparer.

Au cadrage initial, la création automatique au nommage n’était pas universelle :

- certains noms génériques étaient ignorés ;
- les rôles pouvaient produire une suggestion, mais ne suffisaient pas à la création ;
- un locuteur volontairement délié n’était pas automatiquement recréé ;
- un inventaire incomplet suspendait la création automatique ;
- les candidats étaient proposés avant de créer l’identité distincte.

Le raccord livré plus bas supprime ces exclusions de création et inverse cet ordre,
sans réassocier un retrait volontaire ni ouvrir les droits distants.

### Invariants actuels

- Le nom de référence du corpus et le nom local d’un entretien sont indépendants.
- Les pseudonymes, rôles, couleurs et valeurs appartiennent aux locuteurs locaux.
- Une personne ne peut pas recevoir deux locuteurs du même entretien.
- Une fusion réunit actuellement deux identités et redirige les références
  concernées, notamment celles des règles de cas et des refus.
- Une séparation déplace une partie des locuteurs vers une nouvelle personne.
  Elle laisse au moins un membre sur l’identité d’origine et ne transfère pas
  implicitement les règles des cas vers la nouvelle identité.
- Les notes restent liées aux locuteurs ; elles ne sont pas copiées par fusion.
- Les définitions vides peuvent encore être référencées et ne doivent pas être
  supprimées automatiquement sans vérification.

### Visualisations et statistiques

Le calcul des statistiques d’entretien sait regrouper les paragraphes en tours,
compter les mots et estimer les durées lorsque des repères le permettent. Le
composant actuel affiche un bilan et des barres de volume de mots, pas une frise
corpus des interventions.

Le mur d’entretiens du corpus utilise des positions dans le texte pour les
passages superposés aux formes d’onde. Il ne constitue pas une véritable frise
chronométrée réutilisable telle quelle.

### Disponibilité distante

Les commandes de personnes sont actuellement fermées sur GitLab et WebDAV par
la politique des gestes. Des transactions WebDAV existent, mais leur présence
ne rend pas le parcours utilisateur disponible.

La refonte ne doit ni contourner cette garde ni promettre une création
silencieuse distante qui n’est pas réalisable. L’ouverture distante constitue un
chantier distinct, à coordonner avec `plans/encours/plan-personnes-webdav.md`.

## 3. Écran cible

### 3.1 Liste de gauche

Une liste unique, recherchable, sans sections « personnes identifiées » et
« locuteurs à associer ».

- Une ligne représente une identité commune lorsqu’elle existe.
- Pour les données anciennes, un locuteur sans identité reste visible comme
  entrée indépendante tant que son rattachement n’est pas résolu.
- Les homonymes restent distincts et sélectionnables individuellement.
- Le nom domine visuellement. Un complément discret peut indiquer le nombre
  d’entretiens ; le contexte doit permettre de distinguer deux homonymes.
- La recherche retrouve le nom affiché, les variantes locales et les entretiens.
- Les incohérences et suggestions restent accessibles dans un espace secondaire,
  sans reconstituer le répertoire technique actuel sur l’écran principal.

L’éventuelle disparition des entrées sans identité du modèle dépendra de la
stratégie de reprise des anciens corpus. Leur visibilité ne doit pas attendre
cette reprise et ne doit pas déclencher d’écriture à la simple consultation.

### 3.2 Zone de droite

Une ligne par entretien du périmètre affiché, avec son titre et une barre de
progression dans l’entretien.

- Mettre en évidence les interventions des locuteurs sélectionnés.
- Atténuer les autres interventions sans les confondre avec des données absentes.
- Pour une sélection multiple, distinguer les locuteurs par une légende et des
  couleurs cohérentes dans cette vue, sans modifier leurs couleurs locales.
- Donner accès au texte d’un tour et à l’ouverture de l’entretien au passage.
- Préserver sélection, recherche et position de défilement au retour.
- Conserver un accès utilisable au clavier et une alternative lisible lorsque
  des interventions sont trop petites pour être ciblées dans la barre.

Après sélection, afficher par défaut les seuls entretiens concernés, avec une
option « Tous les entretiens ». Les barres ont la même largeur et représentent
la progression dans le texte, comme dans l’onglet Entretiens. Le comportement
sans sélection reste à préciser dans la maquette.

### 3.3 Barre d’actions contextuelle

- Aucune sélection : invitation courte à choisir un locuteur.
- Une sélection : statistiques, renommage et séparation si plusieurs
  participations sont réunies.
- Plusieurs sélections : statistiques et regroupement, si compatible.
- Afficher le nombre d’entrées sélectionnées.
- Réserver les explications techniques aux détails d’assistance.

Les notes et données locales restent consultables dans un détail repliable ou
un accès secondaire. Leur emplacement ne doit pas concurrencer la visualisation
principale.

## 4. Création et rapprochement au nommage

### Principe

Saisir un nom ne doit pas obliger à créer ensuite manuellement une fiche corpus.
L’identité devient visible sans confirmation de création superflue.

La création d’une identité distincte et le rapprochement avec une identité
existante sont deux décisions différentes. La première peut être automatique ;
la seconde nécessite le choix de l’utilisateur, y compris pour deux noms égaux.

### Décision : aucun nom exclu, création après validation du nom

Autoriser aussi les noms comme « Enquêteur », « Participant 1 », « Inconnu » ou
« X », sans essayer de décider par une liste de mots si un nom désigne une
véritable personne. Un nom à un caractère est admissible ; un nom vide ne
constitue pas un nom validé.

La création automatique intervient après validation d’un nom non vide dans
l’entretien, pas au seul ajout d’une entrée provisoire « Nouveau locuteur ».
Si l’utilisateur valide lui-même ce libellé, il est admissible comme tout autre
nom non vide : c’est la validation qui compte, pas le vocabulaire.

Chaque entrée locale reçoit sa propre identité avant une éventuelle décision de
rapprochement. Cela ne signifie pas réunir tous les « Enquêteur ». Les
regroupements restent explicites. Si une proposition est reportée, l’entrée
reste immédiatement visible et indépendante dans le corpus.

Le raccord local conserve les heuristiques de suggestions séparées de la création :
les libellés d’attente et noms très courts n’ouvrent pas de demandes répétitives ;
les rôles équivalents peuvent être proposés avec l’avertissement correspondant.
Une validation identique après création ne relance ni création ni proposition.
Ces filtres n’empêchent jamais l’identité d’apparaître dans la liste du corpus.

La suppression d’une liste de noms exclus ne supprime pas les contrôles de
sauvegarde, de concurrence et de droits. Une création empêchée ou interrompue
ne doit ni perdre le nom saisi ni produire une succession de fiches vides aux
nouvelles tentatives.

Un refus de rapprochement ou une séparation doit rester respecté. Il faut
redéfinir le rôle de l’actuel marqueur de retrait volontaire, sans recréer
silencieusement une association que l’utilisateur a supprimée.

## 5. Regrouper une sélection

### Parcours proposé

1. Sélectionner plusieurs entrées par clic, Ctrl/Cmd-clic ou Maj-clic.
2. Choisir « C’est le même locuteur… » ou « Réunir… ».
3. Présenter les noms et les entretiens concernés, avec le nom commun proposé.
4. Choisir le nom commun affiché et indiquer explicitement si les noms des
   entretiens doivent être conservés ou remplacés par ce nom commun.
5. Confirmer, appliquer puis sélectionner l’entrée résultante. Le choix de
   conservation ou d’uniformisation appartient à l’utilisateur.

Le regroupement porte sur toutes les participations des identités choisies,
pas uniquement sur leurs entretiens actuellement visibles.

### Sécurité et limites

- Vérifier toute la sélection avant mutation.
- Ne pas implémenter la sélection multiple par des fusions successives sans
  traitement global de l’intention et des échecs.
- Revalider l’aperçu si les données ont changé.
- Ne propager les noms locaux que si l’utilisateur choisit leur uniformisation.
  Ne jamais propager implicitement pseudonymes, rôles, couleurs ou variables.
- Préserver notes, refus et références des cas ; renouveler les projections et
  filtres dépendants.
- Si une recherche masque des lignes sélectionnées, ne jamais les inclure sans
  indication explicite dans une action de regroupement. Le choix entre retrait
  de la sélection masquée et maintien signalé doit être fixé.

### Deux entrées du même entretien

Le modèle actuel refuse leur rattachement à une même personne. Reconnaître deux
entrées locales comme un même intervenant demanderait une opération différente :
réattribuer les paragraphes et préserver les notes ainsi que les données locales.

**Décision : première version limitée au regroupement entre entretiens.**
En cas de conflit dans un même entretien, expliquer la limite et proposer
l’ouverture de cet entretien pour le corriger.

Une vraie fusion locale, avec arbitrage des données contradictoires et
réattribution des paroles, reste hors périmètre. Ne pas lever simplement
l’invariant pour rendre le bouton utilisable.

## 6. Dissocier des locuteurs précédemment associés

### Décision et parcours

La dissociation corrige une association entre des locuteurs qui existent déjà
dans leurs entretiens. **Ce n’est pas une création de locuteur depuis le corpus.**
Ne pas présenter de formulaire « Nouveau locuteur » ni imposer de saisir un nom
pour effectuer cette correction.

Pour une entrée réunissant plusieurs participations, proposer « Dissocier… »
ou « Ce sont des locuteurs différents… ».

Ouvrir une fenêtre de choix présentant, pour chaque participation :

- le titre de l’entretien ;
- le nom utilisé dans cet entretien ;
- une case de sélection pour indiquer les associations à retirer ;
- si nécessaire, un accès au contexte.

L’aperçu montre les participations dissociées et celles qui restent associées.
Les entrées redevenues distinctes sont visibles dans la liste et utilisent les
noms présents dans les entretiens. Aucun locuteur local ni tour de parole n’est
créé, supprimé ou réattribué par cette action.

### Conséquences internes et détails à préciser

Le modèle peut nécessiter de nouvelles définitions de personnes pour porter les
identités dissociées. Cette écriture reste automatique et interne : elle ne
constitue pas un parcours utilisateur de création de locuteur. Ne pas se limiter
à effacer les liens si cela rend les entrées invisibles ou provoque leur
réassociation automatique au prochain nommage.

**Décision : chaque participation cochée redevient indépendante.** Par exemple,
si A, B, C et D sont associés, cocher C et D donne AB / C / D, et non AB / CD.
L’utilisateur peut ensuite réunir C et D s’il le souhaite. Laisser au moins une
participation sur l’identité d’origine, sans création manuelle de locuteur.

Mémoriser la distinction volontaire pour éviter une nouvelle demande immédiate
de regroupement à noms identiques. Vérifier les conséquences sur les cas
concernés, sans modifier leurs règles automatiquement à l’insu de l’utilisateur.

La dissociation n’est pas un retour historique exact : elle n’annule pas les
renommages précédemment appliqués. Des entrées distinctes peuvent donc conserver
le même nom après dissociation. Restaurer les anciens noms exigerait un mécanisme
supplémentaire, non décidé dans ce périmètre.

Ce parcours concerne des participations entières. Corriger certains tours à
l’intérieur d’un entretien relève toujours de la transcription.

## 7. Renommage et informations propres aux entretiens

**Décision : renommer un locuteur, depuis le corpus ou depuis un entretien,
modifie le nom commun et les noms dans tous les entretiens associés.** Ce
comportement remplace le renommage local et l’actuelle commande qui ne change
que le nom de référence du corpus. Depuis un entretien, indiquer quand le
locuteur intervient aussi dans d’autres entretiens.

- Le périmètre comprend tous les entretiens associés, même masqués par un filtre.
- Présenter une action explicite de validation et le nombre d’entretiens touchés ;
  ne pas déclencher une correction multi-fichiers à chaque frappe.
- Vérifier avant toute modification que les sources sont lisibles, modifiables
  et conformes à l’aperçu. Si une source ne l’est pas, ne pas commencer le renommage.
- Appliquer le renommage local comme une opération multi-fichiers récupérable,
  sans état partiel présenté comme une réussite complète.
- Depuis le corpus local, s’appuyer sur la sauvegarde et la fermeture déjà
  effectuées par le retour au corpus ; relire les noms à la prochaine ouverture.
- Pour un renommage lancé depuis l’entretien, terminer sa sauvegarde puis mettre
  à jour ses noms en mémoire avant de permettre une nouvelle sauvegarde.
- Ne pas changer les attributions de parole, les identifiants ni les notes.

Le renommage ne copie ni les pseudonymes, ni les rôles, ni les couleurs, ni les
valeurs. Ces informations restent propres à chaque entretien.

Lors d’un regroupement, laisser explicitement le choix entre conserver les noms
locaux et les uniformiser. Ce choix ponctuel ne change pas la portée globale d’un
renommage ultérieur, quel que soit l’écran depuis lequel il est demandé. Les
variantes locales conservées restent recherchables.

Un locuteur pas encore associé à une identité commune reste renommable dans
son entretien ; la validation du nom déclenche ensuite son identification
automatique selon la règle de création sans exclusions.

### Condition pour une future ouverture distante

Le corpus et tous les entretiens touchés doivent être accessibles en écriture.
Un entretien verrouillé par un autre utilisateur ou un autre poste doit empêcher
le démarrage du renommage global. Vérifier les droits et acquérir les protections
nécessaires avant la première écriture ; l’absence d’un badge ne suffit pas.
Sérialiser aussi avec nos propres sessions et sauvegardes en cours.

La vérification initiale ne supprime pas les risques de coupure pendant une
publication distante. Une future implémentation devra reconnaître les écritures
acquises et permettre une reprise sûre. Aucun déblocage distant n’est inclus
dans la première livraison.

## 8. Barres de déroulement du texte

**Décision : reprendre la logique de l’onglet Entretiens.** Chaque barre a la
même largeur et représente le début et la fin de la transcription. Les tours
sont positionnés selon leur place dans le texte. La vue fonctionne sans audio
ni repères temporels.

Réutiliser les conventions de positionnement existantes pour que le même passage
soit situé au même endroit dans les deux onglets. Le libellé doit annoncer une
progression dans le texte, pas une durée. Un pourcentage de largeur n’est pas un
pourcentage du temps de parole.

Une forme d’onde éventuelle reste un fond visuel, pas la preuve d’une
synchronisation exacte. Aucun mode temporel ni changement d’échelle n’est prévu
dans la première livraison.

Les durées des statistiques restent un calcul distinct utilisant les repères
disponibles. Leur absence ou leur couverture partielle ne doit pas empêcher
l’affichage de la barre textuelle.

## 9. Statistiques de la sélection

Réutiliser les conventions du moteur d’entretien : tours consécutifs, même
comptage des mots, traitement des passages non attribués et limites des durées.

Afficher un bilan global et un détail par locuteur sélectionné :

- nombre d’entretiens ;
- nombre de tours ;
- nombre de mots ;
- durées estimées lorsque disponibles, avec couverture et limites.

À fixer avant de proposer une part de parole :

- ensemble de référence des pourcentages, distinct du simple filtre d’affichage ;
- prise en compte des enquêteurs et des paroles non attribuées ;
- périmètre réel si des entretiens sont filtrés ou indisponibles.

Calculer les pourcentages à partir des totaux du périmètre, pas par moyenne des
pourcentages de chaque entretien. Éviter tout double compte d’une même
participation. Un résultat incomplet doit être annoncé comme tel.

## 10. Données existantes, performances et cohérence

### Reprise des corpus existants

- Afficher les locuteurs déjà nommés, même sans identité commune.
- Ne pas réunir rétroactivement des homonymes.
- Décider si une reprise explicite crée des identités individuelles pour les
  entrées existantes, ou si cette régularisation intervient à la prochaine édition.
- Traiter les imports futurs selon une règle cohérente, sans multiplier les
  confirmations pendant l’import.
- Préserver les refus et les identités existantes.
- Laisser les définitions vides accessibles dans un espace secondaire ; vérifier
  leurs dépendances avant toute suppression.
- Signaler les références invalides et les entretiens indisponibles sans les
  transformer en absences de participation.

### Projection de lecture

Construire une projection compacte des tours et des statistiques nécessaires,
plutôt que transférer toutes les transcriptions au composant de liste.

Réutiliser ou extraire le calcul commun des tours pour éviter une divergence
entre le bilan d’entretien et la nouvelle vue corpus. Prévoir un chargement
progressif, un cache invalidable et une limite de rendu pour les grands corpus.

Les modifications de texte, de locuteurs, d’ancres, de liens et les tirages
distants doivent renouveler les données concernées. Une réponse tardive ne doit
pas s’installer après changement de corpus.

### Écritures locales et navigation

Le parcours local existant suffit pour les actions lancées depuis le corpus :
`retourCorpus()` attend la sauvegarde et la fermeture de l’entretien avant
d’afficher le corpus. La fermeture révoque la session d’écriture et réinitialise
l’entretien en mémoire. La prochaine ouverture recharge les données corrigées.

Ne pas ajouter de resynchronisation générale des entretiens ouverts pour ce
parcours, ni demander à l’utilisateur une fermeture supplémentaire. Conserver
la vérification interne des sessions comme garde contre un appel hors parcours.
Vérifier l’inventaire et l’aperçu avant la correction.

Les actions demandées depuis l’entretien lui-même ont un raccord ciblé en mémoire :
sauvegarder le texte courant, effectuer le renommage, l’identification ou le
rapprochement choisi, puis actualiser seulement les noms, associations et données
prévus, sans remplacer la transcription. Ce raccord ne dépend pas de la future
gestion distante et ne resynchronise pas les autres entretiens ouverts.

Une reprise après interruption doit reconnaître les identités déjà créées et
les modifications acquises. La reprise technique d’une transaction n’est pas une
fonction d’annulation utilisateur ; ne pas annoncer « Annuler le regroupement »
sans mécanisme réellement défini et testé.

### Lecture seule et distant

**Décision : première livraison sur les corpus locaux uniquement.** Aucun parcours
d’écriture distant ni test réel GitLab ou Nextcloud n’est requis pour livrer ce
premier lot. L’ouverture WebDAV n’est pas une dépendance bloquante.

Préserver les possibilités de consultation distante déjà disponibles, sans
promettre la nouvelle vue complète sur ces corpus dans ce lot. La consultation
et les statistiques restent utilisables sans droit d’écriture dans le périmètre
livré. Les actions non disponibles doivent être annoncées honnêtement.

L’activation ultérieure des commandes distantes reste conditionnée à sa
qualification propre ; cette refonte ne modifie pas la politique actuelle.

## 11. Décisions structurantes

| Point | Décision validée |
|---|---|
| Q1 — Création sans exclusions | Après validation d’un nom non vide dans l’entretien, sans exclusion de vocabulaire ; entrée indépendante visible même si le rapprochement est reporté. |
| Q2 — Renommage | Depuis le corpus comme depuis un entretien, modifier tous les noms associés ; lors d’un regroupement, laisser le choix de conserver ou d’uniformiser les noms locaux. |
| Q3 — Doublons dans un entretien | Regroupement entre entretiens seulement dans la première version ; ouvrir l’entretien pour corriger un conflit local. |
| Q4 — Barres | Déroulement textuel et barres de même largeur, comme dans l’onglet Entretiens. |
| Q5 — Dissociation | Chaque participation cochée redevient indépendante ; aucune création manuelle de locuteur depuis le corpus. |
| Q6 — Entretiens affichés | Entretiens concernés par défaut, avec option « Tous les entretiens » ; périmètre statistique annoncé explicitement. |
| Q7 — Livraison distante | Première étape locale, sans dépendance à l’ouverture des corpus distants. |

Valeurs par défaut proposées pour les détails d’interface : afficher tous les
entretiens sans surbrillance en l’absence de sélection ; retirer de la sélection
les lignes masquées par une recherche ; afficher les anciens corpus sans écriture
ni regroupement automatique à la consultation.

Le rythme des suggestions et la régularisation explicite sont maintenant raccordés.
Le dénominateur des pourcentages reste à préciser. Les premières
statistiques peuvent se limiter aux volumes de mots et de tours plutôt que de
présenter un pourcentage ambigu.

## 12. Déroulement proposé

Le premier lot anticipe les commandes métier de l’étape 3 pour tester leurs
invariants avant de remplacer les écrans. Cela ne vaut pas livraison du nouveau
parcours utilisateur. Le suivi détaillé figure en section 15.

### Étape 1 — Parcours et maquettes

- Traduire les décisions validées en parcours et préciser les détails ouverts.
- Définir les règles de création, rapprochement, report et refus.
- Maquetter les états sans sélection, sélection simple et sélection multiple.
- Maquetter regroupement, dissociation sans création, renommage propagé et
  données indisponibles.
- Arrêter le traitement des corpus existants et des imports.

### Étape 2 — Socle de consultation

- Construire la liste unifiée sans migration destructive.
- Ajouter la projection des tours et l’axe retenu.
- Ajouter la sélection multiple accessible et la légende.
- Ajouter la navigation vers les passages et le retour à la sélection.
- Vérifier les performances et la lecture seule.

### Étape 3 — Création et corrections

- Créer automatiquement après validation d’un nom non vide, sans noms exclus.
- Conserver les suggestions et les choix reportés sans invisibiliser une entrée.
- Ajouter le regroupement global de plusieurs identités entre entretiens.
- Ajouter la dissociation d’associations existantes, sans formulaire de création,
  et la mémorisation des distinctions volontaires.
- Ajouter le renommage propagé aux entretiens avec transaction locale récupérable.
- Préserver les données locales, les notes et les usages dans les cas.

### Étape 4 — Statistiques et finition

- Ajouter le bilan de la sélection et ses périmètres explicites.
- Replacer les notes et données locales dans les détails secondaires.
- Harmoniser les libellés des onglets, aides, filtres et points d’entrée liés.
- Mettre à jour la documentation utilisateur et les captures.
- Vérifier l’absence de régression sur les restrictions distantes existantes,
  sans ouvrir ni qualifier de nouveaux parcours distants dans ce lot.

## 13. Qualification attendue

Tests métier et parcours utilisateur couvrant notamment :

- nom spécifique, rôle, nom générique, caractère unique et nom vide selon Q1 ;
- homonymes conservés distincts, suggestions acceptées, refusées et reportées ;
- entrée toujours visible avant décision et après échec de création ;
- anciens corpus, import, liens absents et références invalides ;
- sélection multiple, Maj-clic, Ctrl/Cmd-clic, clavier et recherche masquante ;
- regroupement de trois identités ou plus et conflit dans un même entretien ;
- dissociation sans création de locuteur local, sans saisie obligatoire d’un nom
  et sans nouvelle proposition répétitive ;
- renommage corpus propagé à tous les entretiens associés, y compris masqués ;
- renommage global depuis un entretien ; regroupement avec conservation ou
  uniformisation des noms selon le choix explicite ;
- refus du renommage global avant toute écriture si un entretien est indisponible ;
  reprise d’un incident multi-fichiers ;
- dissociation après renommage, sans restauration implicite des anciens noms ;
- notes et valeurs inchangées ; références des cas préservées ou conséquences
  explicitement présentées ;
- positionnement textuel cohérent avec l’onglet Entretiens, y compris sans audio,
  sans repères, avec synchronisation partielle ou incohérente ;
- durée indisponible distincte de zéro et pourcentages calculés sur les totaux ;
- corpus volumineux, données incomplètes et changement de corpus pendant lecture ;
- sauvegarde et fermeture locales avant correction corpus, puis réouverture
  avec les noms corrigés et les dernières paroles conservées ;
- renommage depuis l’entretien, autosauvegarde et aperçu devenu périmé ;
- lecture seule, restrictions distantes et absence de contournement des droits.

Les tests réels GitLab ou Nextcloud, si un lot les nécessite, seront précédés de
l’outil `preparer_bancs_docker`, sans téléchargement ni reprovisionnement.

## 14. Carte des principaux fichiers

| Responsabilité | Emplacement |
|---|---|
| Nouvelle vue de consultation et sélection | `src/renderer/components/traiter/corpus/LocuteursCorpus.vue` |
| Dessin des barres textuelles | `src/renderer/components/traiter/corpus/BarreInterventionsLocuteurs.vue` |
| Projection compacte de la liste et des tours | `src/shared/corpus/repertoireLocuteurs.ts` |
| Aperçus et corrections de la sélection | `src/shared/corpus/apercusCorrectionsLocuteurs.ts`, `src/renderer/components/traiter/corpus/CorrectionsLocuteursCorpus.vue` |
| Répertoire de détails et anciennes actions | `src/renderer/components/traiter/corpus/PersonnesCorpus.vue` |
| Intégration des onglets et mur d’entretiens | `src/renderer/components/traiter/corpus/Corpus.vue` |
| Création et suggestions au nommage | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Modèle, inventaire, fusion et séparation | `src/shared/corpus/personnes.ts` |
| Nouvelles corrections globales et dissociation indépendante | `src/shared/corpus/correctionsLocuteurs.ts` |
| Suggestions et décisions de rapprochement | `src/shared/corpus/rapprochementsLocuteurs.ts` |
| Persistance et transactions locales | `src/main/corpusStore.ts` |
| Statistiques et découpage des tours | `src/shared/entretien/statistiquesLocuteurs.ts` |
| Bilan actuel d’entretien | `src/renderer/components/traiter/entretien/StatistiquesLocuteurs.vue` |
| Politique distante | `src/main/gitlab/politiqueGestes.ts` |
| Documentation du fonctionnement actuel | `docs/dev/traiter/locuteurs/personnes.md` |

L’unification technique a activé le format 10 dans le chantier associé. Les
corrections d’interface ne créent pas de nouveau format. Les détails de parcours
encore ouverts devront être précisés avant leur implémentation.

## 15. Suivi d’implémentation

### Premier lot : commandes locales, sans raccord d’interface

Réalisé :

- `renommerGlobal` : nom corpus et noms des participations associées ;
- `regrouperSelection` : plusieurs identités dans une même transaction, avec
  choix explicite de conserver ou d’uniformiser les noms des entretiens ;
- `dissocierSelection` : chaque participation cochée reçoit une identité
  indépendante, sans ajout de locuteur local ni saisie d’un nouveau nom ;
- mémorisation des distinctions volontaires après dissociation ;
- préservation des paroles, notes, pseudonymes, rôles, couleurs et valeurs ;
- redirection des références de cas et des refus lors du regroupement ;
- contrôle d’un inventaire complet et d’un aperçu frais avant toute écriture ;
- réutilisation des transactions locales et de leurs identités après interruption.

Qualification : 16 nouveaux tests ; campagne ciblée de 188 tests réussis dans
huit fichiers, vérification TypeScript réussie. Le test du cycle local couvre la
sauvegarde, la fermeture, la correction corpus puis la réouverture avec les noms
corrigés et le texte récent conservé. Ce premier lot n’avait nécessité ni banc
Docker ni parcours Electron.

La garde des nouvelles commandes contre les sessions encore en édition ne
bloque pas le parcours corpus local : le retour au corpus les ferme déjà.
Aucune resynchronisation générale n’est nécessaire pour raccorder ces actions.
À ce stade, le renommage depuis l’entretien restait à raccorder séparément avec
actualisation de ses noms en mémoire ; ce raccord est maintenant décrit plus bas.
Les anciennes commandes n’étaient pas remplacées prématurément.

### Deuxième lot : vue de consultation locale

Réalisé :

- onglet corpus renommé **Locuteurs**, sans changement de son identifiant interne ;
- liste unifiée, homonymes distincts et noms génériques visibles, même sans
  identité commune dans les données existantes ;
- recherche dans les noms communs, noms locaux et titres d’entretien ;
- sélection simple, Ctrl/Cmd-clic, Maj-clic et clavier ; retrait des sélections
  masquées par la recherche ;
- une barre par entretien, sur un axe textuel de largeur normalisée ;
- couleur par identité sélectionnée, autres interventions en gris ;
- entretiens concernés par défaut et option « Tous les entretiens » ;
- accès à une intervention par la barre ou les commandes précédente/suivante,
  avec conservation de la sélection au retour au corpus ;
- statistiques de mots et de tours pour la sélection, sans pourcentage ni durée
  ajoutés prématurément ;
- projection IPC compacte sans transcriptions ni notes, sans écriture à la
  consultation, avec signalement des sources indisponibles ;
- chargement et réponses tardives protégés contre un changement de corpus ;
- rendu initial borné à 200 locuteurs et 20 entretiens, avec accès aux suivants ;
  dessin des barres sur canvas pour éviter un élément DOM par tour ;
- adaptation aux écrans étroits et maintien du répertoire historique dans
  « Détails et associations… », afin de préserver les corrections existantes ;
- maintien du répertoire historique pour les corpus distants, sans nouvelle
  commande distante activée ;
- documentation utilisateur et développeur actualisée.

Qualification : 226 tests ciblés réussis dans 12 fichiers ; TypeScript et build
réussis. Huit parcours Electron locaux passent, couvrant la nouvelle consultation,
les retours de navigation, les fichiers inchangés pendant la consultation, la
fraîcheur et les anciennes corrections accessibles par les détails. Les recettes
historiques concernées utilisent désormais le nouvel accès et la fenêtre de
modification des locuteurs. Aucun banc distant n’a été lancé.

La projection réutilise le découpage en tours du bilan d’entretien. Comme ce
bilan, elle prend en compte les paragraphes de premier niveau. Le corpus est
relu à chaque activation ou actualisation ; aucun cache persistant ni préchargement
des corpus distants n’a été ajouté.

### Corrections depuis la sélection corpus — réalisé après la bascule native

Les trois commandes sont raccordées à la vue locale : renommage global d’une
sélection simple, regroupement multiple et dissociation des participations cochées.
Un inventaire frais est comparé à la sélection avant affichage de l’aperçu ; la
confirmation réutilise cet état attendu et le store le recontrôle avant écriture.

Le regroupement exige de choisir la conservation ou l’uniformisation des noms.
La dissociation n’exige aucun nom et garde au moins une participation sur l’identité
d’origine. L’aperçu décrit les conséquences sur les cas ; un conflit dans un même
entretien bloque la réunion et propose d’ouvrir cet entretien.

Les dialogues prennent le focus sur Annuler, acceptent Échap avant enregistrement
et ne se ferment pas pendant l’écriture. Après réussite, la recherche est effacée,
les projections sont invalidées et les locuteurs résultants sont sélectionnés.
Les réponses de préparation ou de correction devenues obsolètes sont écartées.

**Périmètre de ce raccord :** les entrées sans identité utilisaient encore les
associations historiques. Le raccord B4 décrit plus bas les traite maintenant par
un choix explicite, sans création silencieuse pendant une préparation. Le renommage depuis l’entretien est désormais global,
après confirmation, dans le raccord décrit ci-dessous.

Qualification : 29 nouveaux tests ; suite locale de **2 688 tests sur 212 fichiers**
réussie, **9 parcours Electron locaux réussis**, typage de l’application et des
nouveaux tests ainsi que build réussis. Aucun fournisseur distant n’est activé.

### Renommage depuis l’entretien — réalisé

Pour une participation déjà associée, valider un nouveau nom ouvre un aperçu sans
modifier le modèle local. Un bouton `Renommer…` permet aussi d’ouvrir cette confirmation.
L’aperçu présente tous les entretiens associés, pas seulement l’entretien courant.
Annuler conserve leurs noms ; confirmer applique le même renommage global que depuis
le corpus. Les entrées sans association passent maintenant au raccord de création
sans exclusions décrit ci-dessous, sauf celles volontairement déliées.

Les saisies et identifications en cours sont terminées puis le texte sauvegardé,
avant suspension de l’éditeur et de l’autosauvegarde. Un point d’entrée main dédié
vérifie la session locale, l’association et l’aperçu. Il tolère uniquement cette
session pour le renommage, sans autoriser d’autres sessions ni ouvrir les commandes
distantes. La transaction existante reste propriétaire des écritures.

Les noms sont actualisés en place après vérification que les autres données n’ont
pas changé. Ni document, ni notes, ni sélection, ni historique de frappe ne sont
rechargés. Les anciens inverses de renommage local ne peuvent pas défaire un seul
entretien d’une correction globale. Le main bloque les sauvegardes aux noms périmés
et les écritures lorsqu’une transaction est encore à reprendre.

Une réponse perdue déclenche une relecture, jamais un rejeu. Si cette relecture
ne peut pas être validée, l’entretien reste en lecture seule jusqu’à réouverture
du corpus. Quitter cet état ne réenregistre pas un ancien payload. Les réponses
d’une session remplacée n’installent pas leurs noms dans la nouvelle session.

Qualification : **25 tests unitaires ajoutés**, **2 713 tests locaux réussis sur
214 fichiers**, **13 parcours Electron locaux réussis**, dont quatre nouveaux ;
typage de l’application et des nouveaux tests ainsi que build réussis. Les sources
absentes, réponses perdues, relectures refusées et sauvegardes après renommage sont
couvertes, en plus des parcours de sélection corpus déjà livrés. Une qualification
complémentaire de **187 tests simulés GitLab/WebDAV** passe sur six fichiers ; aucun
nouveau droit distant n’est ouvert et les bancs réels ne sont pas rejoués.

### Création sans exclusions au nommage — réalisée

Tout nom non vide validé dans un entretien local crée une identité distincte avant
les suggestions : Enquêteur, Participant 1, Inconnu, X, noms à un caractère et
Nouveau locuteur validé explicitement sont admis. L’ajout seul de l’entrée provisoire
ne crée rien. Entrée, la sortie du champ modifié et « Valider le nom » valident la saisie.
Un nom vide est refusé ; un retrait volontaire reste sans réassociation implicite.

Le nom et le texte courant sont sauvegardés avant la création. Le main vérifie la
seule session locale et associe la participation dans la même transaction que la
création de l’identité. Une répétition retrouve cette identité ; une reprise garde
l’identifiant déjà prévu. Une source étrangère indisponible diffère les suggestions,
mais ne bloque pas la création indépendante dans l’entretien courant.

Plus tard ou Échap conserve l’identité déjà visible, sans rapprochement. Un refus
la conserve aussi et mémorise les propositions écartées. Confirmer réunit les identités
avec la transaction existante, sans définition vide résiduelle ; une source non liée
rejoint explicitement l’identité créée. Les noms locaux sont conservés et seule la
reprise choisie peut toucher les données locales. Cas et refus suivent la réunion.
Les conflits dans un même entretien et les aperçus périmés sont refusés avant écriture.

L’éditeur et l’autosauvegarde sont suspendus pendant ces corrections. La réponse est
comparée au payload sauvegardé : seules les associations et informations prévues
sont mises à jour en place. Le document, ses notes, la sélection et l’historique de
frappe ne sont pas rechargés. Les anciens inverses de nommage devenus locaux à une
identité créée ne peuvent pas en défaire isolément le nom. Le main refuse aussi les
anciennes associations d’une sauvegarde tardive. Une réponse perdue est relue sans
rejeu ; une relecture incertaine garde l’entretien en lecture seule jusqu’à réouverture.
Aucun nouveau parcours distant ni mécanisme général de resynchronisation n’est ajouté.
Les propositions encore en préparation sont abandonnées lorsqu’un nouveau renommage
est demandé, sans annuler la création ; son aperçu attend les nommages en cours.

Qualification : **50 tests unitaires ajoutés**, **2 763 tests locaux réussis dans
216 fichiers**, **187 tests fournisseurs simulés sur six fichiers** et **28 parcours
Electron locaux réussis**, dont six nouveaux. Typage de l’application et des nouveaux
tests ainsi que build réussis. Les noms génériques, la validation du libellé provisoire,
les homonymes indépendants, la réunion sans fiche vide, les refus et retraits,
la concurrence, les réponses perdues et les propositions tardives sont couverts.
Les bancs réels ne sont pas rejoués, les parcours distants n’étant pas ouverts.
B1 et B2 sont versionnés dans `2f33a3b` ; ce raccord B3 est encore non committé.

### Détails secondaires et retrait des parcours locaux historiques — réalisés

« Détails et vérifications… » ouvre un panneau secondaire sans remplacer la liste
et les interventions. La sélection pilote les informations, valeurs et notes.
Les notes sont jointes par entretien et id de participation, jamais par le seul id
local. Les définitions de variables et catégories sont relues avec l’inventaire.
Les données anciennes non décrites restent signalées plutôt qu’effacées.

Les propositions, distinctions enregistrées et définitions sans entretien sont
repliées. Le calcul et le rendu sont bornés et l’utilisateur peut élargir leur
périmètre. Comparer sélectionne les locuteurs dans la liste ; seul le regroupement
habituel peut les réunir. Écarter une proposition ne crée aucune identité.
Réexaminer retire les refus correspondants des membres des deux groupes, dans les
deux sens, sans association et sans effacer les distinctions avec un tiers.

Pour les entrées sans identité valide, « Conserver séparément… » prépare un aperçu
puis crée une identité distincte pour chaque voix concernée. Aucune participation
ni parole n’est ajoutée, les noms actuels sont conservés et les autres locuteurs
sélectionnés ne sont pas modifiés. Un retrait volontaire ne se répare pas à la
consultation ; cette confirmation crée une identité propre sans restaurer l’ancien
lien. Les homonymes ne sont pas réunis. Les noms vides nécessitent une édition dans
l’entretien avant la régularisation.

La reprise ponctuelle reste disponible dans les détails : entretien source et
champs explicitement choisis, remplacement des données existantes seulement sur
choix distinct. Noms, notes, couleurs et associations ne sont pas copiés. Les
variables sélectionnées doivent encore appartenir aux participations. La suppression
d’une définition vide vérifie inventaire complet, participations, cas et refus.
Aucun texte ni aucune note n’est supprimé et aucun Undo global n’est annoncé.

Ces cinq commandes passent par le même moteur transactionnel, avec aperçu frais,
contrôles de droits, de session et de contexte, sans nouvelle génération d’ids à
la reprise. Les préparations annulées et réponses tardives sont ignorées. Les
confirmations ne se ferment pas pendant l’enregistrement.

Les formulaires locaux de création de fiche, liaison, déplacement, renommage de
référence seul et séparation avec saisie d’un nouveau nom ne sont plus exposés.
Leur remplacement utilise les corrections de sélection déjà livrées : dissocier
l’entretien avant de réunir son locuteur à un autre groupe. L’ancien composant et
ses commandes restent nécessaires au répertoire distant, qui ne gagne aucun droit.
Les parcours Electron concernés ont été réécrits sur ces actions, en conservant les
contrôles de refus périmés, notes, données, annulation et navigation.

Qualification B4 : **42 tests unitaires ajoutés**, **2 805 tests locaux réussis dans
218 fichiers**, **187 tests fournisseurs simulés sur six fichiers** et **37 parcours
Electron locaux réussis**, dont quatre nouveaux dédiés aux détails. Les parcours
historiques locaux ont été remplacés par les actions de sélection et les détails,
sans perdre les contrôles de notes, données, reprise, refus et navigation. Le typage
de l’application et des nouveaux tests, le build et les contrôles d’espaces passent.
Les bancs réels ne sont pas rejoués : aucun nouveau parcours distant n’est activé.

### Qualification et clôture B5

B3+B4 sont committés dans `1d83616`, après B1+B2 dans `2f33a3b`, sans push.
B5 clôt la qualification locale et renouvelle quatre captures, dont les nouvelles
vues corpus et détails intégrées à l’aide. B5 est livré par le commit de clôture du lot.

Résultats : **4 236 tests locaux/simulés sur 294 fichiers**, **121 scénarios Electron
ciblés validés**, inclus dans **302 réussites** de la campagne élargie. Ses **21 échecs**
sont également reproduits sur `31ec321`, avant le lot B ; cinq scénarios sont sautés.
Typage, build et contrôles d’espaces passent. Aucun nouveau droit distant n’est ouvert.

Les inventaires de 2 000 entretiens sont couverts et les contrôles de refus ne sont
plus répétés pour chaque apparition d’une identité. Les neuf scénarios de charge
s’exécutent ; à 1 000 annotations, le p95 des corrections reste de 400 à 647 ms.
Cette limite et les défauts historiques restent hors lot, sans affaiblir les assertions.

Le [bilan détaillé](../../docs/dev/traiter/locuteurs/qualification.md) précise les
périmètres, exclusions et réserves. Le lot est clôturé sur ces résultats acquis,
sans nouvelle campagne générale ni élargissement aux défauts transversaux.
