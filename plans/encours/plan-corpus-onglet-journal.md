# Plan — onglet Journal au niveau du corpus

> Ajouter au corpus un journal d’actions annulables, pendant du Journal d’un
> entretien, sans engager maintenant le découpage de `Corpus.vue`.
>
> Ce plan précise en priorité les conséquences sur l’onglet **Personnes** déjà
> réalisé et sur le futur onglet **Notes** décrit dans
> `plan-corpus-onglet-notes.md`.

## 1. Décision de produit

Le Journal du corpus est un **outil d’annulation de la session courante**. Il
présente uniquement les dernières actions prises en charge par le journal et
permet de rétablir leur état antérieur lorsque leurs cibles n’ont pas changé
depuis. Il ne cherche pas à devenir une liste exhaustive de l’activité du corpus.

Il reprend les règles visibles du Journal d’entretien :

- entrées les plus récentes en tête ;
- heure, libellé et bouton `↩` ;
- dix dernières actions au maximum ;
- une action devenue inapplicable reste visible mais grisée ;
- l’utilisateur peut annuler une ancienne entrée sans être obligé de dépiler
  strictement les plus récentes ;
- aucune fonction de rétablissement (« redo ») au premier livrable.

Le journal est **volatil** :

- il n’est écrit ni dans `corpus.json`, ni dans les entretiens, ni dans les
  réglages du profil ;
- il survit aux changements d’onglet et à un aller-retour dans un entretien du
  même corpus ;
- il est vidé au changement de corpus et au redémarrage de l’application ;
- il ne modifie pas `FORMAT_VERSION` et ne voyage pas dans les exports.

Le Journal n’est donc pas :

- un historique d’audit persistant ;
- la liste de toutes les modifications faites par tous les utilisateurs ;
- le journal technique `.transaction-fichiers.json` utilisé pour terminer une
  opération multi-fichiers après un arrêt ;
- le point de reprise d’une session d’entretien.

Cette distinction doit apparaître dans l’aide de l’onglet. Une transaction
multi-fichiers peut être utilisée pour **exécuter sûrement** une annulation,
mais son journal technique ne devient jamais une entrée visible.

## 2. Périmètre fonctionnel

### 2.1 Principe de rattachement

Une action appartient au journal de l’espace depuis lequel elle a été validée :

- une action validée dans un entretien relève du Journal de cet entretien ;
- une action validée dans un onglet du corpus relève du Journal du corpus ;
- une même action ne doit jamais apparaître dans les deux journaux ;
- une simple lecture, une recherche, un changement de filtre ou d’onglet ne
  produit aucune entrée.

Le premier incrément du Journal du corpus porte seulement sur les commandes
**simples de Personnes effectuées depuis le répertoire corpus** : renommer une
fiche, associer, dissocier ou déplacer un locuteur, écarter un rapprochement et
annuler un refus. Le futur onglet Notes se branchera ensuite sur la même
infrastructure.

Une couverture partielle est acceptable si l’aide annonce précisément
« actions annulables prises en charge ». Il ne faut pas retarder le premier
livrable pour raccorder toutes les mutations déjà présentes dans `Corpus.vue`.

### 2.2 Trois catégories d’actions

#### A. Actions simplement annulables

Leur inverse touche une cible limitée et peut être décrit sans restaurer un
ensemble de fichiers :

- renommer une Personne ;
- associer, dissocier ou déplacer un locuteur ;
- ajouter ou retirer un refus de rapprochement ;
- modifier une note complète par une commande atomique ;
- renommer ou recolorer une définition.

Elles sont prioritaires. Elles entrent dans le Journal dès que la commande
produit un avant/après explicite.

#### B. Actions conditionnellement annulables

Leur inverse est simple, mais reste valable seulement tant que l’objet créé,
supprimé ou réordonné n’a pas été réutilisé ou modifié :

- créer une Personne et son premier lien ;
- supprimer une fiche Personne vide ;
- créer ou supprimer une note ;
- créer ou supprimer un thème, une variable, une modalité ou une catégorie de
  note sans usage ;
- réordonner des notes ou des définitions.

Ces actions peuvent entrer dans une étape ultérieure. L’entrée est créée comme
annulable, puis devient grisée si sa précondition n’est plus satisfaite. Par
exemple, une création de Personne n’est plus annulable si un autre locuteur lui
a été rattaché depuis.

#### C. Actions non annulables au premier livrable

Une action complexe reste hors du Journal tant qu’un inverse complet, atomique
et compréhensible n’est pas disponible :

- accepter un rapprochement qui crée plusieurs liens ;
- reprendre des données de locuteur ;
- réunir ou séparer des Personnes ;
- modifier des valeurs ou pseudonymiser en lot ;
- créer, importer ou supprimer un entretien ;
- remplacer une transcription par un SRT ;
- associer ou supprimer un média et ses dérivés ;
- toute opération distante ;
- toute commande échouée, annulée dans une fenêtre ou partiellement réussie.

Ces actions ne produisent **aucune entrée** dans le Journal. Il est préférable
de ne pas les afficher plutôt que de construire un pseudo-historique rempli
d’actions qui n’ont jamais été annulables. Elles conservent leurs confirmations,
messages d’erreur et mécanismes de reprise existants.

Une action pourra passer de C vers B ou A plus tard, sans changer le contrat du
Journal.

### 2.3 Matrice de couverture progressive

| Domaine | A — premier raccordement | B — raccordement ultérieur | C — exclu initialement |
|---|---|---|---|
| Personnes | renommer, associer, dissocier, déplacer, refuser, annuler un refus | créer, supprimer une fiche vide | rapprocher avec plusieurs liens ou reprise, réunir, séparer |
| Notes du corpus | modifier une note complète | créer, supprimer, réordonner | édition par frappe non coalescée |
| Thèmes | renommer, recolorer, activer | créer, déplacer, changer de parent, supprimer sans usage | fusion ou scission multi-entretiens |
| Variables et modalités | renommer, changer un attribut simple | créer, supprimer sans usage, réordonner | lots multi-entretiens |
| Catégories de notes | renommer, recolorer | créer, supprimer sans usage | modification en cascade des notes |
| Données | éventuellement une cellule isolée | — | lots dans le premier livrable |
| Pseudonymisation corpus | éventuellement une définition isolée | — | application de masse dans le premier livrable |
| Entretien sélectionné | renommer | — | création, import, suppression, SRT et médias |

Les domaines autres que Personnes et Notes ne sont pas requis pour ouvrir le
premier Journal. Ils seront raccordés seulement lorsque leur inverse restera
petit et sûr.

### 2.4 Actions venant d’un entretien

Le nommage d’un locuteur peut actuellement créer une `Personne` dans
`corpus.json`, puis poser `personneRef` dans le modèle vivant de l’entretien.
Cette couture ne doit pas être enregistrée artificiellement dans le Journal du
corpus au premier incrément : le main ne reçoit pas aujourd’hui une commande
sémantique unique décrivant toute l’action.

À terme, si ces rapprochements doivent être visibles dans le Journal du corpus,
il faudra d’abord les faire passer par une commande coordonnée qui connaît :

- la définition de Personne créée ou utilisée ;
- l’ancien et le nouveau rattachement ;
- les refus ajoutés ou retirés ;
- les éventuelles données reprises ;
- l’état attendu après validation.

Une sauvegarde générique d’entretien ne doit jamais être interprétée après coup
comme une action de Personnes. Le renommage du locuteur reste dans le Journal
d’entretien et son annulation ne change jamais implicitement `personneRef`.

## 3. UX de l’onglet

### 3.1 Navigation

Ajouter `journal` à `OngletCorpus` et un bouton utilisant `journal.png`.
L’ordre recommandé, compatible avec la barre actuelle et le futur onglet Notes,
est :

1. Accueil ;
2. Thèmes ;
3. Personnes ;
4. Notes ;
5. Données ;
6. Pseudonymisation ;
7. Journal ;
8. Pas à pas, seulement en démonstration.

`journal.png` est actuellement réutilisée pour **Pas à pas** dans `Corpus.vue`.
Créer une icône propre à Pas à pas avant d’afficher les deux boutons, afin que
deux fonctions différentes n’aient pas le même symbole.

Le Journal peut conserver la grille habituelle du corpus : panneau Journal à
gauche, cartes d’entretiens à droite. Il n’a pas besoin d’une vue pleine largeur
comme Personnes, Données, Pseudonymisation ou Notes. Cette disposition en fait
le pendant direct du panneau Journal de l’entretien et évite une nouvelle
organisation d’écran.

### 3.2 Panneau

Créer :

```text
src/renderer/components/corpus/PanneauJournalCorpus.vue
```

Le panneau affiche :

- le titre **Journal** ;
- l’aide « Actions annulables prises en charge depuis les outils du corpus
  pendant cette session (10 dernières). » ;
- l’état vide « Aucune action enregistrée. » ;
- chaque heure et libellé ;
- `↩` avec `aria-label` et une infobulle explicite ;
- pour une entrée grisée, la raison lisible, par exemple « La personne a été
  modifiée depuis cette action. » ;
- un état occupé pendant l’annulation et une erreur non destructive en cas
  d’échec.

Le bouton d’une entrée est désactivé si :

- sa cible a disparu ou ne correspond plus à l’état produit par l’action ;
- un fichier nécessaire est indisponible ;
- une transaction de fichiers est déjà en reprise ;
- une annulation est déjà en cours.

Une action de catégorie C n’apparaît pas grisée : elle n’est jamais enregistrée.
Le grisage est réservé à une action A ou B qui était annulable lors de sa
validation, mais dont la cible a changé ensuite.

Comme dans le Journal d’entretien, annuler une entrée la retire de la liste.
Annuler ne crée pas une nouvelle entrée. Les autres entrées sont ensuite
réévaluées : l’annulation d’une modification récente peut rendre une entrée plus
ancienne de nouveau applicable.

### 3.3 Intégration sans extraction de `Corpus.vue`

Ce chantier ne démarre pas le « découpage ultérieur de `Corpus.vue` » prévu dans
`plan-extract.md`. `Corpus.vue` conserve :

- `ongletCorpus` et `choisirOnglet` ;
- la barre d’onglets ;
- la grille et les cartes ;
- l’assemblage du nouveau panneau.

Seul le panneau Journal est créé directement comme composant autonome, comme
les nouveaux panneaux d’entretien. Il ne faut pas profiter de cet ajout pour
extraire simultanément Recherche, Thèmes, la fiche d’entretien ou les cartes.

Le panneau peut rester monté avec `v-show`. Son état métier vit toutefois dans
le service partagé du corpus ; un remontage ne doit pas perdre le journal.

## 4. Pourquoi le Journal d’entretien ne peut pas être simplement copié

Le Journal d’entretien agit sur un modèle vivant dans le renderer, avant sa
sauvegarde. Ses inverses peuvent donc muter directement `Entretien`, les
locuteurs et l’éditeur.

Les commandes de corpus sont différentes :

- elles sont généralement déjà écrites quand l’entrée est affichée ;
- elles passent par IPC et le main possède le disque ;
- certaines touchent `corpus.json` et plusieurs entretiens ;
- une modification extérieure peut avoir eu lieu entre l’action et son
  annulation ;
- en distant, annuler est une nouvelle écriture partagée sous verrou.

Le Journal du corpus doit donc vivre principalement dans le **main process**.
Le renderer ne reçoit que des entrées affichables et demande l’annulation d’un
id opaque. Il ne reçoit ni copies complètes d’entretiens ni fonctions de rappel.

## 5. Modèle du journal

### 5.1 Contrat public

Ajouter un contrat partagé, par exemple dans :

```text
src/shared/corpus/journal.ts
```

Surface indicative :

```ts
export interface EntreeJournalCorpusVue {
  id: string
  horodatage: string
  libelle: string
  origine: 'personnes' | 'notes' | 'themes' | 'donnees' | 'anon' | 'corpus'
  etat: 'annulable' | 'inapplicable' | 'bloquee'
  raison?: string
}

export interface ImpactJournalCorpus {
  corpus: boolean
  entretiens: string[]
  projections: Array<'personnes' | 'notes' | 'matrice' | 'usages' | 'resumes' | 'scanAnon'>
}

export type ResultatAnnulationCorpus =
  | { ok: true; impact: ImpactJournalCorpus }
  | { ok: false; raison: string; temporaire: boolean }
```

`bloquee` désigne un obstacle temporaire, par exemple un verrou distant ou un
fichier momentanément indisponible. `inapplicable` signifie que l’état attendu
n’est plus présent et qu’aucune écriture ne doit être tentée. Les types
d’inverse internes ne doivent pas traverser le preload. Ils restent dans le
main ou dans une fonction pure de `shared/corpus/` appelée uniquement avec les
agrégats nécessaires.

### 5.2 Inverses typés et ciblés

Comme au niveau Entretien, l’inverse est une **donnée typée**, jamais une
closure. Il contient :

- l’état antérieur à restaurer ;
- l’état postérieur attendu ;
- les ids précis des définitions, locuteurs, notes ou entretiens concernés ;
- les projections à invalider après réussite.

Il ne faut pas conserver dix copies complètes de toutes les transcriptions. Les
inverses restent ciblés, par exemple :

- définitions de Personnes ajoutées, modifiées ou retirées ;
- avant/après des seuls locuteurs modifiés, identifiés par
  `entretienId + locuteurId` ;
- avant/après d’une note ou, pour un réordonnancement, des rangs concernés ;
- anciennes/nouvelles valeurs EAV ;
- annotations exactes ajoutées ou retirées par un diff d’anonymisation.

Les données nécessaires restent en mémoire du main, limitées par le cap de dix
entrées. Les corps de notes peuvent y figurer lorsqu’ils sont indispensables à
une restauration, mais ne sont jamais persistés par le Journal.

### 5.3 Applicabilité

Une entrée n’est applicable que si chaque cible correspond encore à son état
**après** :

- même définition et mêmes champs concernés ;
- même `personneRef`, mêmes refus ou mêmes valeurs reprises pour un locuteur ;
- même version de la note concernée ;
- mêmes valeurs pour une cellule ou un lot ;
- mêmes annotations pour un diff.

La comparaison doit être ciblée. Une modification sans rapport dans le même
entretien ne doit pas griser l’entrée. À l’inverse, aucune valeur inconnue ne
doit être écrasée pour rendre l’annulation possible.

Exemple : après `Marie → Maria`, puis `Maria → Marie D.`, la première entrée est
grisée car elle attend encore `Maria`. Si la deuxième est annulée, la première
redevient applicable.

### 5.4 Exécution locale

Pour une action portant sur un seul fichier :

1. relire l’état frais ;
2. vérifier l’état postérieur attendu ;
3. calculer l’état restauré ;
4. écrire atomiquement ;
5. retirer l’entrée seulement après succès.

Pour une action portant sur `corpus.json` et un ou plusieurs entretiens :

1. relire et vérifier toutes les cibles avant toute écriture ;
2. construire les fichiers complets avant/après à partir de cet état frais ;
3. exécuter un `PlanRemplacementEntretiens` avec
   `TransactionsFichiersCorpus` ;
4. mettre à jour `lastModified` et le membership des entretiens réellement
   modifiés ;
5. retirer l’entrée après la fin complète de la transaction.

Une annulation multi-fichiers n’est jamais annoncée comme réussie partiellement.
Si l’application s’arrête pendant son exécution, `.transaction-fichiers.json`
termine l’intention au prochain démarrage. Le Journal visible, volatil, peut
alors avoir disparu sans compromettre la cohérence des fichiers.

## 6. Service main, IPC et rafraîchissement

Créer un service en mémoire, par exemple :

```text
src/main/journalCorpus.ts
```

Il est attaché au corpus courant et expose :

- `enregistrer(libelle, origine, inverse, impact)` ;
- `lister()` avec calcul frais de `annulable` et `raison` ;
- `annuler(id)` ;
- `vider()` lors d’une bascule de corpus.

Ajouter au pont IPC :

```text
corpus:journalLister
corpus:journalAnnuler
```

Les commandes journalisées doivent renvoyer leur résultat métier habituel et
n’enregistrer l’entrée qu’après réussite complète. Éviter que chaque composant
fabrique lui-même des libellés ou des inverses : cette responsabilité appartient
à la commande qui connaît réellement ce qu’elle a modifié.

Dans `useCorpus.ts`, ajouter :

- `entreesJournalCorpus` ;
- `rafraichirJournalCorpus()` ;
- `annulerEntreeJournalCorpus(id)` ;
- un rafraîchissement lors de l’activation de l’onglet et après chaque commande
  journalisée.

Le résultat d’annulation porte son impact. `sonal.ts` et `useCorpus.ts`
rafraîchissent seulement ce qui est concerné :

- définitions corpus si nécessaire ;
- inventaire Personnes ;
- inventaire Notes ;
- matrice ;
- usages et résumés ;
- scan de pseudonymisation marqué périmé.

Il ne faut pas appeler aveuglément `appliquerCorpus()`, qui réinitialiserait
l’entretien, le lecteur et plusieurs états de navigation.

## 7. Incidences sur Personnes

### 7.1 Commandes à rendre annulables

Le premier incrément couvre seulement les commandes A pleinement réussies
lancées depuis `PersonnesCorpus.vue` :

| Commande actuelle | Catégorie | Libellé indicatif | État restauré |
|---|---|---|---|
| `modifier` | A | `Personne renommée : Marie → Maria` | ancien nom de référence |
| `lier` | A | `Locuteur associé à Marie Dupont` | ancien `personneRef` et marqueur `personneDeliee` |
| `refuser`, sans création de fiche | A | `Rapprochement écarté : …` | ancien ensemble de refus |
| `annulerRefus` | A | `Décision de rapprochement rétablie : …` | ancien ensemble de refus |
| `creer` | B | `Personne créée : Marie Dupont` | définition et lien, si rien ne les a réutilisés |
| `supprimer` | B | `Personne supprimée : Marie` | fiche vide exacte, si son id est toujours libre |
| `rapprocher` | C | aucune entrée initialement | plusieurs liens, refus, définition et éventuelle reprise |
| `fusionner` et future séparation | C | aucune entrée initialement | opération multi-fichiers reportée |

Si `refuser` crée également une fiche distincte et un lien, la commande passe
en catégorie C pour le premier livrable. Elle ne doit pas être enregistrée comme
un simple ajout de refus.

« Annuler le refus » dans la fiche Personnes reste une commande métier ordinaire.
Le bouton `↩` du Journal annule cette commande. Les libellés doivent empêcher la
confusion entre ces deux niveaux.

### 7.2 Résultats composites reportés

Une acceptation de rapprochement ou une fusion ne doit jamais être découpée en
plusieurs entrées indépendantes (« personne créée », « source liée », « cible
liée », « pseudo copié »). Tant que le main ne sait pas produire un inverse
composite unique, l’action entière reste en catégorie C et n’apparaît pas dans
le Journal.

Lors d’un raccordement ultérieur, il faudra centraliser la capture avant/après
dans le main. Le retour actuel `string | null` de `personnesCommander` est
insuffisant pour notifier proprement le journal et les projections. Le contrat
pourra devenir un résultat nommé conservant `personneId` et l’impact, sans
exposer l’inverse au renderer.

### 7.3 Écritures partielles existantes

Plusieurs parcours Personnes écrivent aujourd’hui la définition avant les liens
et conservent volontairement une fiche réparable en cas d’échec. Le Journal ne
doit pas masquer ce comportement :

- une réussite partielle ne crée pas d’entrée prétendant annuler l’ensemble ;
- le message de réparation existant reste affiché ;
- avant de rendre ces parcours journalisables, les commandes locales composites
  doivent être exécutées comme des remplacements multi-fichiers reprenables, ou
  retourner un résultat partiel précisément typé ;
- la fusion locale, déjà fondée sur `PlanRemplacementEntretiens`, fournit le
  premier cas de référence.

Cette transactionnalisation n’est plus un prérequis du premier Journal. Elle
reste nécessaire uniquement si un rapprochement, une réunion ou une séparation
passe plus tard de la catégorie C vers une catégorie annulable.

### 7.4 Fraîcheur de la fiche

Après une annulation Personnes :

- `PersonnesCorpus.vue` relit l’inventaire ;
- la sélection courante est conservée si son id existe encore ;
- sinon, elle revient à l’état sans sélection avec un message explicite ;
- les suggestions et décisions écartées sont recalculées ;
- les notes liées sont relues, car une restauration de rattachement peut changer
  leur agrégation par Personne sans modifier les notes elles-mêmes.

## 8. Incidences sur le futur onglet Notes

### 8.1 Journal d’annulation et historique ne sont pas synonymes

`plan-corpus-onglet-notes.md` propose un `HistoriqueNote[]` persistant, un auteur,
un index `derniereModificationNotes` dans `corpus.json` et une restauration
depuis cet historique. Le nouveau Journal du corpus répond seulement au besoin
**d’annuler les gestes récents de la session**.

Décision recommandée pour le premier onglet Notes :

- ne pas ajouter `HistoriqueNote[]` ;
- ne pas ajouter `derniereModificationNotes` ;
- conserver `creeLe` et `modifieLe`, déjà présents, pour les tris ;
- ne conserver `auteur` que si un besoin d’attribution affichée est confirmé,
  indépendamment du Journal ;
- reporter l’audit persistant et la restauration de versions dans un plan
  séparé si l’usage le réclame réellement.

Le Journal ne remplace pas un futur audit multi-utilisateur. Il évite en
revanche de faire de cet audit complexe une dépendance de l’onglet Notes.
L’index proposé n’évite d’ailleurs pas le chargement des entretiens nécessaire
pour afficher les corps des notes.

Les sections 2.1, 2.2, 4.6, 5, 6, 7, 8 et 9 de
`plan-corpus-onglet-notes.md` devront être réécrites avant implémentation pour
retirer cette dépendance. La phrase indiquant qu’une suppression de note serait
annulable via le Journal d’entretien est actuellement fausse : les notes sont
explicitement hors de ce journal dans `useEntretien.ts`.

### 8.2 Projection et commandes

L’onglet Notes ne doit pas charger tous les entretiens dans `useCorpus.ts`, qui
ne conserve aujourd’hui que le membership léger. Ajouter une projection main,
sur le modèle de `personnesInventaire()` :

```text
corpus:notesInventaire
corpus:notesCommander
```

L’inventaire renvoie les notes affichables, leur `entretienId`, le titre de
l’entretien et les fichiers indisponibles. La commande relit l’entretien frais,
vérifie un état attendu, modifie la note et enregistre l’inverse dans le Journal
du corpus après succès.

Actions et inverses :

- création : retirer la note créée si elle est encore dans son état initial ;
- modification : restaurer la note antérieure si la version courante correspond
  à la version validée ;
- suppression : réinsérer la note complète et son rang ;
- réordonnancement : restaurer les rangs des notes concernées.

Pour éviter d’écraser une édition concurrente, une commande porte au minimum la
note ou le `lastModified` attendu. L’id seul ne suffit pas.

### 8.3 Frontières de validation dans l’interface

Le Journal enregistre des **gestes utilisateur**, pas des événements DOM :

- une validation de modale crée au plus une entrée regroupant corps et
  métadonnées ;
- en mode Feuille, capturer l’état au focus et valider une modification au blur
  ou par un bouton explicite ;
- ne pas créer une entrée à chaque `input` du `contenteditable` ;
- une sauvegarde différée d’une seconde peut persister le brouillon, mais les
  modifications d’une même session d’édition doivent être coalescées en une
  commande avant/après ;
- le glisser-déposer complet forme une seule entrée de réordonnancement.

Le modèle proposé dans le plan Notes, où le corps et les métadonnées suivent des
règles de sauvegarde différentes, doit être simplifié : une commande atomique de
note complète fournit une frontière plus claire pour les conflits et
l’annulation.

### 8.4 Entretien > Notes

Les modifications effectuées dans l’onglet Notes d’un entretien ne sont pas
dupliquées dans le Journal du corpus. Deux options restent possibles pour une
évolution ultérieure :

1. ajouter des inverses de notes au Journal d’entretien ;
2. conserver le fonctionnement actuel, en annonçant que les notes d’entretien
   ne font pas partie de ses actions annulables.

La première option est plus cohérente, mais constitue un chantier séparé. Dans
tous les cas, le futur `NotesCorpus.vue` utilise le Journal du corpus pour les
modifications qu’il initie lui-même.

Après annulation d’une note depuis le corpus, rafraîchir aussi l’inventaire
Personnes : la fiche d’une personne affiche déjà les notes liées à ses
locuteurs.

## 9. Corpus distant

Toutes les opérations distantes sont classées C et restent hors du premier
livrable. Dans un corpus distant, l’onglet reste visible mais explique que
l’annulation des actions corpus n’est pas encore disponible. Il ne faut ni
simuler une réussite sur le miroir, ni utiliser le Journal comme file d’attente
hors ligne.

Le support distant ultérieur suivra ces règles :

- une annulation est une nouvelle transaction partagée, jamais un retour local
  dans le temps ;
- relire l’état serveur après acquisition du verrou ;
- vérifier l’état postérieur attendu ;
- publier avec `If-Match` ;
- si un fichier est seulement verrouillé par autrui, garder l’entrée et
  afficher un blocage temporaire : l’utilisateur pourra réessayer après la
  libération du verrou ;
- si le contenu a changé depuis l’action, refuser tout écrasement et rendre
  l’entrée non annulable ;
- garder l’entrée et afficher l’échec en cas de réseau indisponible ;
- pour une note, utiliser un verrou court sur son entretien ;
- pour une définition, utiliser le verrou court de `corpus.json` ;
- pour une opération Personnes multi-fichiers, acquérir tous les verrous dans
  un ordre stable ou refuser l’annulation avant toute écriture ; aucune
  annulation partielle n’est acceptable.

Le Journal ne liste à terme que les actions réussies de la session applicative
courante. Les modifications d’autres utilisateurs relèvent d’un éventuel audit,
pas de ce composant.

## 10. Tests

### 10.1 Tests unitaires

Créer des tests dédiés au Journal du corpus :

- ordre récent d’abord et cap à dix ;
- aucune entrée pour une commande sans changement ou en échec ;
- annulation applicable puis retrait de l’entrée ;
- cible modifiée depuis : entrée grisée, aucune écriture ;
- deux modifications successives d’une cible : l’ancienne redevient applicable
  après annulation de la récente ;
- modification sans rapport dans le même fichier : entrée toujours applicable ;
- action de catégorie C : aucune entrée créée ;
- annuler ne produit pas une nouvelle entrée ;
- changement de corpus vide le journal, changement d’onglet non ;
- aucune donnée du journal dans `corpus.json` ou un export.

Pour Personnes, couvrir d’abord les inverses A :

- renommage du nom de référence ;
- liaison, déliaison et déplacement avec restauration de `personneDeliee` ;
- ajout et retrait d’un refus simple ;
- entrée grisée après modification extérieure d’un locuteur concerné ;
- absence d’entrée pour rapprochement, reprise, réunion ou réussite partielle.

Lors du raccordement des actions B, ajouter création puis annulation sans
référence pendante et restauration d’une fiche vide supprimée. Les actions C
n’exigent aucun test d’inverse tant qu’elles restent exclues. Si l’une d’elles
est promue ultérieurement, ajouter alors les tests multi-fichiers tout ou rien
et de reprise par `TransactionsFichiersCorpus`.

Pour Notes, au moment de son implémentation :

- création, modification, suppression et ordre ;
- corps HTML restauré exactement ;
- modification coalescée en une entrée ;
- note changée depuis : aucun écrasement ;
- rafraîchissement de la section Notes liées de Personnes.

### 10.2 E2E local

Ajouter `e2e/journal-corpus.e2e.ts` :

1. Journal apparaît dans la barre avec une icône distincte de Pas à pas ;
2. renommer une Personne crée une entrée ;
3. `↩` restaure le nom et retire l’entrée ;
4. associer puis annuler restaure le rattachement exact ;
5. réunir deux personnes ne crée aucune entrée au premier livrable ;
6. une modification ultérieure de la cible grise l’ancienne entrée ;
7. un aller-retour dans un entretien conserve le Journal du corpus ;
8. ouvrir un autre corpus le vide ;
9. le changement d’onglet conserve les états locaux de Personnes ;
10. le mode distant affiche l’état non pris en charge sans bouton actif.

Quand Notes sera livré, compléter avec création, modification et suppression
annulées depuis le corpus. Ne pas compter sur `e2e/journal.e2e.ts`, qui ne couvre
que le Journal d’entretien.

Les tests de navigation qui comptent ou positionnent les boutons devront être
mis à jour sans fragiliser leur sélection : préférer les `aria-label` ou un
`data-onglet` au rang numérique.

### 10.3 Validation

À chaque lot :

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Puis les E2E ciblés :

```bash
npx playwright test --project=local \
  e2e/journal-corpus.e2e.ts \
  e2e/personnes.e2e.ts \
  e2e/personnes-regroupement.e2e.ts \
  e2e/navigation.e2e.ts
```

Ajouter les scénarios Notes lorsqu’ils existent. Aucun banc Docker n’est requis
pour le premier incrément local et aucune image ne doit être retéléchargée.

## 11. Ordre de mise en œuvre

### Lot 1 — infrastructure locale et panneau

1. définir les contrats de vue et les inverses ciblés ;
2. créer le service volatile dans le main ;
3. ajouter les IPC de liste et d’annulation ;
4. ajouter l’état et les invalidations dans `useCorpus.ts` ;
5. créer `PanneauJournalCorpus.vue` ;
6. intégrer le bouton et le panneau dans `Corpus.vue`, sans autre extraction ;
7. distinguer l’icône Pas à pas.

### Lot 2 — Personnes simples

1. faire produire aux commandes A leur avant/après sémantique ;
2. journaliser renommage, liaison, déliaison et déplacement ;
3. journaliser refus simple et annulation de refus ;
4. vérifier explicitement que les commandes B non encore raccordées et toutes
   les commandes C ne créent aucune entrée ;
5. conserver les messages explicites des réussites partielles.

### Lot 3 — actions conditionnelles utiles

1. journaliser la création d’une Personne si sa définition et son premier lien
   sont encore dans l’état attendu ;
2. journaliser la suppression d’une fiche vide si son id reste disponible ;
3. raccorder seulement les modifications simples des autres outils corpus ;
4. laisser lots, rapprochements composites, réunions et séparations en C.

Il n’est pas nécessaire de couvrir tous les outils corpus pour conserver le nom
Journal, à condition que son aide parle des « actions annulables prises en
charge » et non de toutes les actions de modèle.

### Lot 4 — futur onglet Notes

1. réviser `plan-corpus-onglet-notes.md` selon les décisions du présent plan ;
2. créer une projection Notes côté main ;
3. définir la modification atomique d’une note et la raccorder comme action A ;
4. raccorder ensuite création, suppression et ordre comme actions B ;
5. ne pas raccorder l’édition par frappe tant qu’elle n’est pas coalescée ;
6. rafraîchir les projections Notes et Personnes après annulation.

### Lot 5 — distant

1. prendre en charge l’inverse d’une note sous verrou court d’entretien ;
2. prendre en charge les définitions sous transaction corpus ;
3. concevoir l’annulation Personnes multi-fichiers sans succès partiel ;
4. ajouter les tests Nextcloud ciblés en utilisant les bancs existants.

## 12. Critères de fin du premier livrable

Le premier livrable local est terminé lorsque :

- Journal est un onglet du corpus et ne déclenche aucune extraction annexe de
  `Corpus.vue` ;
- ses dix dernières entrées survivent à la navigation dans le même corpus ;
- il est clairement distingué du Journal d’entretien, de l’audit et du journal
  technique de reprise ;
- les commandes A de Personnes pleinement réussies depuis le répertoire ont un
  inverse unique et ciblé ;
- les commandes C n’ajoutent aucune entrée et restent protégées par leurs
  confirmations et transactions existantes ;
- une cible modifiée depuis n’est jamais écrasée et grise l’entrée ;
- aucune annulation multi-fichiers n’est requise dans ce premier livrable ;
- les projections concernées sont rafraîchies sans réinitialiser tout l’écran ;
- le futur onglet Notes peut se brancher sans ajouter d’historique persistant
  pour assurer l’annulation ;
- typecheck, tests unitaires, build et E2E ciblés passent.
