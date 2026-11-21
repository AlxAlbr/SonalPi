# Locuteurs du corpus et rapprochements entre entretiens

L’onglet Locuteurs est commun aux corpus locaux, GitLab et Nextcloud. Les
corrections utilisent la sélection ; « Détails et vérifications… » ouvre les notes,
données et propositions sans masquer la liste ni ses interventions. Le nom commun
appartient au corpus ; pseudonymes, rôles, valeurs et notes restent dans chaque
entretien. Voir les [garanties par fournisseur](fournisseurs.md).

## Consultation des interventions

`locuteursInventaire()` renvoie une projection compacte : liste unifiée,
participations, nombres de mots et de tours, positions des interventions et
positions d’ouverture dans l’éditeur. Aucune transcription ni corps de note
n’est transmis. Les ids natifs manquants ne sont jamais complétés à la lecture.
Les définitions sans participation restent dans les détails, pas dans la liste.

`repertoireLocuteurs.ts` réunit les références valides dans la liste principale,
y compris lorsqu’elles n’ont qu’une participation. Les participations sans référence
valide, avec retrait volontaire ou sans nom sont exposées dans `aVerifier`, sans
ligne sélectionnable. Un accès ouvre les locuteurs de leur entretien pour les
régulariser. Les homonymes ne sont jamais réunis implicitement. Les noms locaux et
les titres restent recherchables. Une source illisible ne contribue ni à la liste
ni aux comptes et reste signalée séparément.

Le découpage réutilise `statistiquesLocuteurs` après extraction des paragraphes
enregistrés. Les marques ne séparent pas les mots ; les sauts de ligne conservent
leur place dans les coordonnées de l’éditeur. Les comptes portent sur les
paragraphes de premier niveau, sans durée ou pourcentage présentés comme mesurés.

`LocuteursCorpus.vue` assure la sélection simple, multiple et par plage, le clavier,
la recherche par tags OU et le filtre des entretiens. La saisie en cours s’ajoute
aux tags comme aperçu. Une recherche ne purge pas la sélection : son compteur
signale les membres masqués. Les gestes additifs conservent ces membres ; Ctrl/⌘-A
cible les résultats filtrés. Recherche, tags, sélection et périmètre persistent
au retour depuis l’entretien, puis sont réinitialisés au changement de corpus.
Une actualisation ne retire que les références disparues ou devenues invalides.
Après correction, la sélection est réconciliée sans effacer les filtres.
Les réponses tardives sont écartées. Le rendu initial est borné à 200 locuteurs
et 20 entretiens, avec accès explicite aux suivants.

`CadreOndeCorpus.vue` est partagé avec l’onglet Entretiens. Le canvas transparent
de `BarreInterventionsLocuteurs.vue` ne dessine que les tours sélectionnés,
positionnés sur le texte complet, et se superpose à l’image `urlWaveform` existante.
Ce calque n’est pas une synchronisation audio. Les zones non sélectionnées
n’ouvrent pas d’intervention ; précédente/suivante fournit un accès clavier.
Les commandes de sélection sont à gauche ; ouvrir et naviguer restent locaux
à chaque carte. La largeur du panneau gauche est mémorisée sur le poste.

`StatistiquesSelectionLocuteurs.vue` compare les locuteurs par mots, tours et
entretiens distincts, puis détaille les entretiens associés. La part d’un locuteur
utilise les mots de la sélection comme dénominateur. La part dans l’entretien
utilise `EntretienLocuteursCorpus.mots`, calculé sur tous les paragraphes de sa
transcription, y compris sans attribution ou avec une référence non valide.
Aucune nouvelle lecture de transcription n’est nécessaire dans le renderer.
Les filtres d’affichage ne changent pas les statistiques de la sélection.

## Inventaire et détails

`inventaireLocuteurs.ts` définit `InventaireIdentitesLocuteurs` et sa projection
pure `inventorierLocuteurs()`. Le point d’entrée `inventaireIdentitesLocuteurs()`
porte ce même nom dans le store, l’IPC et le preload, sans ancien alias. La projection rassemble les identités, les participations et
leurs notes contextualisées, sans transmettre les transcriptions ni modifier les
sources. Les mutations sont exclusivement dans `identitesLocuteurs.ts` : le module
d’inventaire ne réexporte aucun ancien nom de fonction métier.

`DetailsLocuteursCorpus.vue` ne recrée pas un second répertoire. Les notes suivent
la sélection par couple `{ entretienId, participationId }` : deux ids locaux
identiques dans des entretiens différents ne partagent pas leurs notes.
L’ouverture des locuteurs et des notes réutilise les accès contextuels existants.

`useCorpus.lireDetailsLocuteurs()` lit les définitions actuelles des variables et
catégories. Une préparation de correction demande des sources serveur fraîches ;
la consultation distante ordinaire utilise la copie courante, avec sa provenance.
Une actualisation ratée conserve le contenu précédent avec avertissement.

Les propositions, distinctions et identités sans entretien restent repliées. Le
rendu et la recherche de propositions sont bornés, avec élargissement explicite.
`detailsLocuteurs.ts` ne modifie ni les fichiers ni les associations à la lecture.
Le composant ne propose une comparaison que si toutes ses références correspondent
à des locuteurs valides de la liste principale.

## Corrections depuis la sélection corpus

Les commandes de `correctionsLocuteurs.ts` sont préparées depuis un inventaire
complet, puis recontrôlées avant publication :

- `renommerGlobal` change le nom corpus et les noms de ses participations ;
- `regrouperSelection` réunit plusieurs identités, avec choix explicite de conserver
  ou d’uniformiser les noms locaux ;
- `dissocierSelection` rend les participations choisies indépendantes, avec leurs
  noms actuels, sans créer de parole ni demander de nouveau nom ;
- `individualiserSelection` reste compris par le moteur pour les suivis existants,
  mais n’est plus proposé par l’interface corpus ; les entrées non valides se
  régularisent explicitement dans leur entretien ;
- `ecarterRapprochement` mémorise une distinction réciproque, sans créer d’identité ;
- `retablirRapprochement` retire les refus correspondants sans association et sans
  effacer les distinctions avec un tiers ;
- `reprendreInformations` copie seulement les champs choisis entre participations
  d’un même locuteur, avec conservation des valeurs existantes sauf remplacement choisi ;
- `supprimerVide` vérifie participations, cas et refus avant de retirer une définition.

La dissociation mémorise les distinctions entre les identités devenues indépendantes.
Elle ne restaure pas d’anciens noms et ne transfère pas leurs règles de cas. Le
regroupement redirige les règles de cas et refus des tiers, mais refuse de réunir
plusieurs participations d’un même entretien.

`CorrectionsLocuteursCorpus.vue` utilise `apercusCorrectionsLocuteurs.ts` pour
vérifier la sélection, présenter tous les membres et repérer les conflits.
`useCorpus.corrigerLocuteurs()` attend la sauvegarde, refuse un changement de
contexte avant l’envoi puis invalide les projections et la matrice. La révision
partagée s’appelle `revisionLocuteursCorpus`.

Les définitions sont publiées avant leurs nouvelles références ; une identité
absorbée n’est retirée qu’après remplacement de ses usages. Les identifiants et
candidats sont fixés avant envoi. GitLab publie un commit gardé ; WebDAV conserve
les étapes d’un lot conditionnel. Une réponse inconnue n’autorise aucun rejeu
aveugle. Reprendre une opération n’est pas un Undo.

Les dialogues se ferment avec Annuler ou Échap avant confirmation. Leur fermeture
est bloquée pendant l’enregistrement. Les réponses tardives ne réinstallent pas un
ancien aperçu. Les commandes corpus refusent les sessions encore ouvertes en local ;
en distant, seules celles des entretiens réellement modifiés sont bloquantes.

## Nommage et rapprochement depuis l’entretien

Sur les trois fournisseurs, cliquer sur « + Locuteur » enregistre immédiatement
une identité indépendante, même sous le nom provisoire « Nouveau locuteur ».
Les imports font de même pour chaque nouvelle participation. Il n’y a ni notification
de création ni proposition à cette étape. Les homonymes restent distincts.
La validation du nom par Entrée ou sortie du champ modifié déclenche les propositions,
y compris lorsque l’identité existe déjà depuis sa création ou son import.
L’association n’est pas un état « nom validé » et ne conditionne ni la consultation
ni l’attribution des paroles. Un retrait volontaire empêche la recréation automatique.

`identifierParticipationAuNommage` vérifie session, nom sauvegardé et participation
avant de créer l’identité et son association. Une répétition retrouve l’identité
confirmée ; une interruption conserve son identifiant pour la reprise. La création
indépendante ne demande pas de fermer les autres éditions. Une source indisponible
diffère les suggestions sans empêcher la création dans l’entretien courant.

Les suggestions restent distinctes de l’admissibilité du nom. Les noms normalisés,
rôles et variantes proches peuvent suggérer une comparaison, jamais une association
implicite. « Plus tard » garde l’identité indépendante. Confirmer appelle
`rapprocherLocuteurDepuisEntretien` : inventaire frais, réunion explicite, redirection
des cas et refus, conservation des noms locaux et reprise des seuls champs choisis.
En local, les autres éditions doivent être fermées pour cette réunion. En distant,
seules les éditions des entretiens réellement modifiés sont bloquantes.
Aucun texte ni note n’est copié.

### Renommage depuis l’entretien ouvert

Quand d’autres entretiens sont associés, la fenêtre de renommage laisse choisir
ce seul entretien ou tous les entretiens. Sans autre association, le nom s’enregistre
directement. Le choix local utilise `renommerParticipationDepuisEntretien`
et vérifie les noms avant/après avec `verifierRelectureRenommageParticipation`.
Il ne change ni le nom corpus ni l’association, et ne lit que l’entretien courant.
Une source indisponible ailleurs diffère les suggestions, pas ce renommage.

Pour le choix global, `useRenommageLocuteurOuvert.ts` prépare le même aperçu pour
une participation déjà associée. La modification du champ Nom ne remplace pas immédiatement le modèle.
Si d’autres entretiens sont concernés, `RenommageLocuteurOuvert.vue` demande
confirmation ; sinon, la même transaction protégée s’exécute sans dialogue.
Une erreur ne déclenche jamais de nouvelle tentative automatique.

`useEntretien` attend les nommages et saisies libres, vide la sauvegarde, bloque
l’éditeur et suspend l’autosauvegarde. La réponse est comparée au dernier payload :
seuls les champs attendus peuvent différer. Les participations sont actualisées en
place, sans remplacer le document, les notes, la sélection ni l’historique de frappe.
Les anciens inverses de renommage local des participations concernées sont retirés.

Le main protège les noms et associations contre les anciennes sauvegardes. Les
fournisseurs distants réutilisent le droit courant et adoptent le résultat confirmé
comme nouvelle base de publication. Le tirage automatique attend la correction.
Une relecture incertaine laisse l’entretien en lecture seule. Sur WebDAV, revenir
au corpus ferme la session sans renvoyer l’ancien candidat, puis permet de vérifier
et reprendre. Aucun ancien droit natif n’est forcé automatiquement au redémarrage.

## Retrait historique

`PersonnesCorpus.vue` et `RapprochementCorpus.vue` sont supprimés. Il n’existe plus
de second formulaire corpus ni de relais métier `personnes.ts`.

L’ancien point d’entrée `personnesInventaire` est supprimé, y compris son canal
IPC. Les composables utilisent `lireIdentitesLocuteurs` et les cas conservent leur
projection dans `inventaireLocuteursCas`. `personnesCommander`, son canal IPC,
son union de commandes et ses relais WebDAV sont supprimés, sans alias. Les anciennes
méthodes de création, liaison, réunion et séparation ne sont pas conservées comme
parcours parallèles. `CorpusStore.corrigerLocuteurs()` est le point d’entrée corpus
direct, avec sa garde d’écriture ; la variante de session garde une autorisation
privée distincte. L’ancien geste `personnes.commande` est inconnu, donc refusé sur
tous les fournisseurs, y compris en local. L’ancien drapeau de capacité `locuteurs`
est supprimé : seules les capacités précises des parcours livrés sont proposées.

Le journal corpus est uniquement en mémoire et ne conserve que les inverses de
notes encore produits par l’application. Les anciennes annulations de locuteurs
et leurs fixtures sont supprimées, sans migration de fichiers.
La dissociation passe par `dissocierSelection`, sans ancien parcours parallèle.
Les références V1 et le mot courant
« personne » ne font pas l’objet de remplacements globaux.

## Fixtures natives

`test/fixtures/identitesLocuteurs.ts` installe les définitions et associations
synthétiques directement en format natif. Les données sont validées avant toute
écriture ; aucune commande historique ni API de test n’est ajoutée à l’application.
Les noms locaux, index, rôles, pseudos et autres champs ne sont pas réécrits.

`e2e/fixtures-natives.ts` réutilise ce constructeur avant l’import des sources. Les
identifiants de fixture sont remappés de façon cohérente, y compris dans leurs refus
par identité. Les actions qualifiées passent ensuite par les véritables gestes
courants ; une fixture n’est pas une réimplémentation de la transaction métier.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Inventaire et types | `src/shared/corpus/inventaireLocuteurs.ts` |
| Mutations des identités | `src/shared/corpus/identitesLocuteurs.ts` |
| Suggestions, refus et reprise | `src/shared/corpus/rapprochementsLocuteurs.ts` |
| Corrections et aperçus | `src/shared/corpus/correctionsLocuteurs.ts`, `apercusCorrectionsLocuteurs.ts` |
| Persistance locale | `src/main/corpusStore.ts`, `transactionsFichiers.ts` |
| Gardes et dispatch | `src/main/index.ts`, `src/main/gitlab/politiqueGestes.ts` |
| Publication et reprise distante | Voir [fournisseurs.md](fournisseurs.md) |
| Projection compacte | `src/shared/corpus/repertoireLocuteurs.ts` |
| Liste et détails | `LocuteursCorpus.vue`, `DetailsLocuteursCorpus.vue` |
| Nommage et relecture | `useLocuteursEntretien.ts`, `useRenommageLocuteurOuvert.ts`, `identificationLocuteurs.ts` |

Les tests métier et store sont dans `test/identitesLocuteursStore.test.ts`,
`test/correctionsLocuteurs.test.ts`, `test/detailsLocuteurs.test.ts` et
`test/nommageLocuteurs.test.ts` et `test/renommageParticipation.test.ts`.
`test/suggestionsLocuteurs.test.ts` vérifie les
suggestions et la reprise. Les fichiers `*Renderer.test.ts` correspondants couvrent
l’orchestration, les gardes de génération et les réponses tardives.

Les recettes `e2e/locuteurs-*.e2e.ts` qualifient les parcours locaux et distants.
Les anciens fichiers `personnes-*.e2e.ts` ont été renommés sans conserver de doublons. Les qualifications de transport, de session et de
reprise sont recensées dans [fournisseurs.md](fournisseurs.md).
