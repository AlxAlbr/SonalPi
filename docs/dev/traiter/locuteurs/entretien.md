# Locuteurs dans un entretien

Le panneau Locuteurs édite les entrées de l’entretien ouvert et attribue leurs
index aux paragraphes. Les fonctions métier pures n’ont connaissance ni du DOM
ni de ProseMirror ; le composable orchestre l’éditeur et la sauvegarde.

## Ajouter et renommer

Une nouvelle participation reçoit un `id` opaque, l’index `max + 1`, des valeurs
vides, puis son identité corpus est enregistrée automatiquement dès le clic sur
« + Locuteur », même avec le nom provisoire « Nouveau locuteur ». Les imports créent
également une identité distincte par nouvelle participation dans leur transaction.
Ces créations ne déclenchent ni notification de succès ni recherche de rapprochement.
Entrée ou la sortie du champ modifié enregistrent le nom et déclenchent les
propositions éventuelles, même pour une participation déjà identifiée à l’import.
Un nom identique ne constitue jamais une preuve de rapprochement.
Il n’existe pas de marqueur « nom validé ». L’entretien conserve également les
participations non associées, même lorsqu’elles ne figurent pas dans la liste des
locuteurs valides du corpus. Leur consultation et leur attribution restent possibles.

`identifierParticipationAuNommage` enregistre identité et association ensemble.
« Plus tard » garde cette identité indépendante. Confirmer une proposition réunit
explicitement les identités via `rapprocherLocuteurDepuisEntretien`, sans fiche vide
résiduelle ; seuls les champs locaux choisis peuvent être repris. Les retraits
volontaires restent sans réassociation automatique. Le dialogue emploie uniquement
le vocabulaire « locuteur » et porte le titre « Est-ce le même locuteur ? ».

### Régularisation explicite

Dans la gestion des locuteurs, **Enregistrer ce locuteur…** permet de traiter une
référence absente ou disparue, ou un retrait volontaire. La confirmation explique
que les paroles et informations restent inchangées et qu’aucune ancienne association
ne sera restaurée. Un nom vide doit d’abord être renseigné.

La demande `DemandeIdentificationLocuteur.regulariser` porte la référence et l’état
de retrait attendus. Sans ce choix explicite, le nommage automatique continue à
refuser les références disparues et les retraits volontaires. La transaction crée
un locuteur distinct et ne reprend aucune association par déduction du nom.
Les distinctions déjà enregistrées sont conservées.

Ce parcours réutilise la transaction de nommage et le droit de l’entretien ouvert,
sur les trois fournisseurs. La relecture autorise uniquement le changement de
référence et la suppression explicite du marqueur de retrait, sans toucher au
reste du payload. Une répétition reconnue conserve le locuteur déjà créé.
Les protections de session, de publication et de reprise restent celles du nommage.

### Choix de portée du renommage

La gestion propose **Dans cet entretien uniquement** ou **Dans tous les entretiens
de ce locuteur**, ce dernier restant sélectionné par défaut. Le choix reste actif
tant que cet entretien est affiché et revient au défaut au changement d’entretien.

Le choix local appelle `renommerParticipationDepuisEntretien`. Sa demande porte
l’entretien, la participation, l’identité et les noms avant/après. Seul `nom` change :
l’identité commune, l’association et tous les autres champs sont conservés.
Il ne demande ni inventaire complet ni droit sur un autre entretien. Un autre
entretien associé absent ou en cours d’édition ne bloque donc pas ce changement.
La validation peut ensuite proposer les rapprochements habituels, sans les appliquer.

Pour le choix global, sur les trois fournisseurs, modifier le champ Nom prépare
l’inventaire complet. Si d’autres entretiens sont associés, leur aperçu demande
confirmation avant toute modification. Sinon, le renommage est enregistré directement
par la même transaction protégée, sans ouvrir de dialogue. Un inventaire incomplet
ou périmé bloque aussi ce parcours direct. Les index et les paragraphes ne sont
jamais réécrits ; leur affichage retrouve le nouveau nom par référence.

Ces raccords attendent les saisies et la sauvegarde, suspendent l’autosauvegarde
pendant la transaction, puis actualisent uniquement les noms ou associations et
informations explicitement choisies du modèle ouvert. Les autres
données et l’historique de frappe sont conservés. Une relecture incertaine garde
l’entretien en lecture seule jusqu’à réouverture du corpus. GitLab et WebDAV conservent
le droit courant pendant ces corrections et adoptent la version confirmée
comme base de session. Créer une identité indépendante ne nécessite pas de fermer
les autres entretiens ; en distant, seules les autres éditions réellement modifiées
par un renommage ou un rapprochement doivent être fermées.
Sur WebDAV, une correction interrompue peut être fermée sans renvoyer l’ancien contenu,
puis vérifiée et reprise depuis le corpus. Une ancienne protection native n’est jamais
forcée automatiquement après redémarrage. Voir [fournisseurs.md](fournisseurs.md).
Voir [corpus.md](corpus.md#renommage-depuis-lentretien-ouvert).

## Attribuer un tour de parole

Sans sélection de texte, le geste change l’attribut `loc` du paragraphe courant.
Avec une sélection, `attribuerSelectionTr` prépare une transaction qui scinde
si nécessaire les paragraphes aux bornes retenues et attribue le locuteur à la
partie sélectionnée.

Le locuteur appartient donc au **bloc**, pas à une annotation de plage. Un
codage thématique peut traverser plusieurs locuteurs, alors qu’attribuer un
locuteur à une portion de paragraphe crée une frontière de bloc. Deux paragraphes
adjacents portant le même index peuvent être rendus comme un même tour sans être
fusionnés physiquement.

Le composable enregistre les anciennes attributions pour le journal, actualise
les projections et planifie la sauvegarde de l’entretien.

## Supprimer un locuteur

La suppression ne doit pas laisser de référence pendante : l’orchestration
retire les attributions `loc` des blocs concernés et enlève l’identifiant stable
des cibles des notes. Si des blocs l’utilisent, le panneau demande une confirmation.

Le retrait de la seule entrée dans le tableau des locuteurs ne suffit donc pas.
Le module pur `supprimerLocuteur` laisse volontairement ces effets à l’appelant.
La fiche Personne éventuellement référencée n’est pas supprimée avec le locuteur.

## Rôle, pseudonyme et couleur

- `interviewer` indique celui qui pose les questions et participe au rendu des
  tours ; le `?` historique est réintroduit pour les représentations compatibles,
  il ne constitue pas l’identité du locuteur.
- `pseudo` pseudonymise l’étiquette du tour, sans modifier le nom stocké ni les
  occurrences de ce nom dans la transcription.
- `pseudoEtat: 'refuse'` conserve un refus importé de SonalPi1, prioritaire sur
  le pseudonyme. L’interface actuelle ne propose plus ce refus à la saisie ;
  poser un pseudo retire cet ancien état.
- `couleur`, si présente, prime sur la palette automatique calculée depuis
  l’index. Un renommage ne change donc pas la couleur automatique.

`libelleGouttiere` est la dérivation pure commune pour les parts du libellé.
Ne pas inscrire le pseudonyme à la place du nom dans les paragraphes ni créer
une règle de pseudonymisation textuelle comme effet de cette saisie.

## Statistiques et navigation

Le bouton **📊 Statistiques** ouvre un bilan dérivé, y compris en lecture seule.
Il ne remplace ni le résumé thématique ni la forme d’onde du lecteur.
`useEntretien` expose un instantané `blocsParole`, renouvelé avec les projections
après une modification et après une ouverture avec `emitUpdate: false`.
Le composant ne calcule le bilan que lorsqu’il est monté dans le panneau actif.

`shared/entretien/statistiquesLocuteurs.ts` regroupe les paragraphes consécutifs
par index `loc` ; les groupes entièrement blancs ne comptent pas comme un tour.
Les mots suivent `compterMotsProseMirror`, sans les libellés de la gouttière.
Une référence inconnue rejoint **Sans locuteur**. Les pourcentages incluent cette
ligne, et la part enquêteurs dépend de `interviewer`, jamais du nom affiché.
Les lignes sont triées par nombre de mots décroissant ; les noms et couleurs
restent des propriétés consultées par index, sans fusion des homonymes.

Les durées utilisent `projeterAncres` sur les longueurs des paragraphes.
Chaque intervalle temporel positif couvrant du texte est réparti selon la longueur
couverte de chaque bloc. Un intervalle entre deux repères au même endroit du texte
est un silence repéré : il n’est pas attribué. Aucune extrapolation avant le premier
repère, après le dernier ou depuis la durée du fichier audio. Une couverture
incomplète est signalée ; aucune couverture donne `null`, pas zéro. Des repères
non finis, négatifs, hors texte ou non monotones invalident les durées seulement.
Ces estimations ne distinguent pas les pauses non repérées dans un passage.

**🔎 Suivante** parcourt cycliquement les positions de début des tours de la ligne,
avec `allerAuTexte` et, si possible, `tempsAuTexte` puis `audio.seek`. Aucun appel
à `play`, aucune transaction de contenu, sauvegarde, annotation ou entrée de journal.
Un changement de découpage remet les compteurs à zéro ; changer d’entretien ferme
le bilan. Aucun nouveau champ persistant, IPC, format ou dépendance n’est ajouté.
Les noms sont affichés en clair : ce panneau n’est pas une vue pseudonymisée.

## Valeurs et lecture seule

Les valeurs des variables de portée participation vivent dans `valeursLoc`.
L’identité commune ne devient pas propriétaire de ces valeurs ; deux entretiens
peuvent conserver des valeurs différentes pour le même locuteur.

L’édition du locuteur suit les droits de la session d’entretien. La consultation
et le rendu restent possibles sans droit d’écriture. La disponibilité des
corrections corpus est une question séparée des droits d’édition du texte.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Modèle pur et libellés | `src/shared/entretien/locuteurs.ts` |
| Orchestration | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Panneau | `src/renderer/components/traiter/entretien/PanneauLocuteursEntretien.vue` |
| Transactions d’attribution | `src/renderer/editor/attribution.ts` |
| Rendu des tours | `src/renderer/editor/locuteursGutter.ts` |
| Bilan pur | `src/shared/entretien/statistiquesLocuteurs.ts` |
| Projection des paragraphes | `src/renderer/composables/useEntretien.ts` |
| Bilan et navigation | `src/renderer/components/traiter/entretien/StatistiquesLocuteurs.vue` |

Tests principaux : `test/locuteurs.test.ts`, `test/locuteursGutter.test.ts`,
`test/attribution.test.ts` et `e2e/locuteurs.e2e.ts`.
`test/renommageParticipation.test.ts` couvre le renommage local, ses préconditions
et la relecture limitée au nom. `e2e/locuteurs-renommage-ouvert.e2e.ts` vérifie le
choix local/global et une réponse locale perdue. Le test de gouttière vérifie
qu’un changement de couleur renouvelle les noms et pseudonymes déjà affichés,
sans modifier le texte ni ses attributions. Les parcours de nommage et de
rapprochement sont recensés dans [corpus.md](corpus.md).

Le bilan est couvert par `test/statistiquesLocuteurs.test.ts`,
`test/statistiquesLocuteursRenderer.test.ts` et `e2e/statistiques-locuteurs.e2e.ts` :
comptage, index zéro et non consécutifs, homonymes, non attribués, repères incomplets
ou incohérents, exclusion des silences, actualisation, lecture seule simulée dans
le composant, navigation avec/sans audio et fichier d’entretien inchangé.

Le [chapitre utilisateur](../../../user/traiter/locuteurs.html) et ses captures sont
vérifiés par `e2e/documentation-locuteurs.e2e.ts`, sur une copie de l’exemple
**Entretiens déjà importés**. La recette couvre aussi la fermeture/réouverture
et la conservation du texte après retrait d’une attribution ou d’un locuteur.
Elle ouvre également le bilan avec Enquêteur/Fatima et en produit une capture réelle.
