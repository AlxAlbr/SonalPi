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
- [x] Consultation distante, affichage des verrous et refus explicite des corrections distantes.
- [ ] Transactions de liaison distantes avec GET frais, verrou court et PUT conditionnel.
- [ ] Suggestions exactes au nommage, décisions de refus et annulation.
- [ ] Suggestions proches calibrées.
- [ ] Séparation, fusion et reprise transactionnelle multi-entretiens.

La création locale écrit la définition avant le lien. Si la seconde écriture échoue,
la fiche vide reste visible avec une erreur expliquant comment reprendre ou supprimer.
Le filtre « À vérifier » porte pour l’instant sur les références pendantes et les doublons
dans un même entretien, pas encore sur les suggestions.

Validation de cet incrément : `npm test` (701 tests réussis, 21 sautés),
`npm run typecheck`, `npm run build`, puis les 10 E2E de `personnes`, `navigation`
et `locuteurs` réussis. Aucun banc distant n’a été démarré.

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

Ajouter **Personnes** à la barre d’icônes de `Corpus.vue`, entre Recherche et Données :

1. Accueil ;
2. Thèmes ;
3. Recherche ;
4. **Personnes** ;
5. Données ;
6. Pseudonymisation ;
7. Pas à pas, en mode démonstration.

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
- **Séparer…** : choisir un ou plusieurs locuteurs liés et créer une nouvelle personne ;
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

En local, étendre le journal `TransactionsFichiersCorpus` à un plan de remplacement de
plusieurs entretiens et de `corpus.json`, reprenable après arrêt.

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

- `src/renderer/components/PersonnesCorpus.vue` : disposition, liste et fiche ;
- éventuellement `src/renderer/components/RapprochementPersonne.vue` : fenêtre partagée
  avec l’entretien ;
- `src/shared/corpus/personnes.ts` : logique pure de modèle et de suggestion.

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

1. Personnes apparaît entre Recherche et Données et masque les cartes ;
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
