# Plan — onglet Personnes au niveau du corpus

> Identifier une même personne derrière plusieurs locuteurs d’entretiens différents,
> proposer les rapprochements au moment du nommage et offrir un espace corpus pour
> contrôler et corriger ces liens.
>
> Le libellé recommandé est **Personnes** au pluriel : l’onglet présente un répertoire.
> **Personne** reste le nom de la fiche ouverte dans le panneau de droite.
>
> **État : chantier terminé et validé** — voir la validation finale en fin de plan.

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

Restent hors de ce chantier :

- reconnaissance automatique à partir du contenu des transcriptions ;
- biométrie ou reconnaissance vocale ;
- fusion automatique fondée sur les variables ;
- propagation automatique d’un nom, d’un pseudo ou d’une valeur ;
- nouvelle portée EAV `personne` ;
- import/export de `Personne` dans `.sonal`, format qui ne connaît pas cette notion.

## 2. Décisions UX

### 2.1 Navigation

**Personnes** est un onglet de la barre de `Corpus.vue`, entre Thèmes et Notes.
L’ordre final de la barre est :

1. Accueil ;
2. Thèmes ;
3. **Personnes** ;
4. Notes ;
5. Données ;
6. Pseudonymisation ;
7. Journal ;
8. Pas à pas, en mode démonstration.

Comme Données et Pseudonymisation, Personnes masque les cartes d’entretiens et utilise
toute la largeur. Il reprend leur organisation maître/détail gauche-droite et leur
séparateur accessible, redimensionnable et mémorisé. La recherche se fait avec
**Ctrl + F**, sans bouton dans la barre.

### 2.2 Panneau gauche — répertoire

Le panneau contient :

- le titre **Personnes** et les compteurs `N personnes · N locuteurs non liés` ;
- une recherche sur le nom de référence, les noms locaux et les titres d’entretien ;
- deux filtres principaux :
  - **Toutes** : répertoire des personnes ;
  - **À vérifier** : suggestions non traitées, références pendantes et doublons dans un
    même entretien ;
- une section **Répertoire**, avec pour chaque personne son nom de référence, le nombre
  d’entretiens liés et un badge de suggestions en attente ;
- une section repliable **Locuteurs non liés**, regroupée par entretien ;
- un filtre secondaire **Décisions écartées**, pour annuler un ancien refus ;
- la liste des locuteurs liés rappelle dès l’ouverture le nom de leur Personne, avec
  résolution du nom de référence et erreur de lecture explicite.

La sélection d’une ligne ouvre son détail à droite. Sans sélection, le panneau droit
explique le fonctionnement et propose la première suggestion à traiter.

État vide :

> Aucune personne n’est encore identifiée. Nommez les locuteurs dans un entretien ou
> choisissez un locuteur non lié pour créer sa fiche.

### 2.3 Panneau droit — fiche d’une Personne

La fiche contient :

- le **nom de référence**, éditable sans renommer les locuteurs liés ;
- une **note libre courte**, facultative ;
- la liste des locuteurs liés : entretien, nom local, statut interviewer, verrou éventuel ;
- par ligne : **Ouvrir l’entretien**, **Modifier l’association…** (déplacer vers une
  autre personne ou retirer le lien) ;
- les rapprochements proposés, avec **Lier** et **Écarter** ;
- les **notes liées**, agrégées sans copie depuis l’onglet Notes des entretiens ;
- les valeurs des variables de portée locuteur, présentées par entretien.

Les valeurs différentes ne sont pas qualifiées automatiquement d’erreurs : un âge, un
statut ou une profession peut légitimement évoluer entre deux entretiens. Elles sont
montrées côte à côte, sans badge de divergence ni propagation.

Actions de correction au niveau de la fiche :

- **Réunir…** : regrouper deux fiches en conservant explicitement un nom de référence ;
  la confirmation montre les compteurs, les notes et les conséquences ; la fiche
  conservée s’ouvre après réussite et aucune fiche absorbée vide ne subsiste ;
- **Séparer…** : choisir un ou plusieurs locuteurs liés et nommer la nouvelle personne ;
  au moins un locuteur doit rester sur la fiche d’origine ;
- **Supprimer** : permis seulement lorsque la personne n’a plus aucun locuteur lié.

Cette dernière règle évite de créer volontairement des références pendantes. Une
référence déjà pendante à cause d’un fichier modifié extérieurement reste diagnostiquée
et réparable, jamais supprimée silencieusement.

### 2.4 Dialogue de nommage

Le dialogue s’ouvre après validation d’un nouveau nom de locuteur, lorsqu’un candidat
crédible existe. C’est une fenêtre modale native (`<dialog>`), sans présélection, avec
focus initial sur « Plus tard » et restitution du focus à la fermeture. Échap et
« Plus tard » ne prennent aucune décision.

Trois décisions d’identité :

1. **Même personne** : modifier uniquement le lien d’identité ;
2. **Même personne, choisir les données à reprendre…** : préparer une liaison avec une
   copie sélective depuis un locuteur source (section repliée « Choisir les données à
   reprendre, ou ne rien reprendre… ») ;
3. **Ce n’est pas cette personne** (ou **Aucune de ces personnes**) : mémoriser le refus
   de toutes les propositions affichées, sans sélection préalable ; une fiche distincte
   est créée pour un nom spécifique non lié, jamais pour un rôle générique (simple
   invitation facultative à choisir un libellé spécifique).

Par défaut, la reprise complète uniquement les champs manquants : le pseudo source est
proposé lorsqu’il manque à la cible, le statut interviewer reste décoché, et remplacer
une valeur existante demande une autorisation explicite. Plusieurs entretiens liés
imposent le choix explicite d’une source ; changer de source réinitialise les champs
proposés. « Ne reprendre aucune donnée » laisse uniquement le rattachement. Refermer la
section repliée conserve les choix déjà faits. Seul **Confirmer** applique la liaison et
la reprise affichée.

Le renommage d’un locuteur déjà lié ne renomme jamais la Personne : la ligne rappelle le
lien actuel et, si un autre candidat correspond au nouveau nom, le dialogue propose
**Déplacer vers cette personne**, **Conserver le lien actuel et écarter ce candidat** ou
**Plus tard**. Sans candidat, un message rappelle que le nom saisi reste local. Le
pseudo repris est le champ du libellé du Locuteur, confirmé pour l’affichage ; aucune
règle d’anonymisation du texte n’est créée ou étendue.

### 2.5 Journal du corpus

Le répertoire alimente un **Journal du corpus** distinct du Journal d’entretien et de la
transcription technique de fichiers. C’est un outil d’annulation volatil limité aux dix
dernières actions prises en charge de la session courante : il survit aux changements
d’onglet et à un aller-retour dans un entretien du même corpus, mais il est vidé au
changement de corpus et au redémarrage. Il n’est écrit dans aucun fichier, ne constitue
ni un audit ni un historique persistant et ne propose aucun rétablissement.

Le premier raccordement couvre les commandes simples pleinement réussies depuis le
répertoire : renommer une Personne, associer, dissocier ou déplacer un locuteur,
écarter un rapprochement simple et annuler un refus. Les créations, suppressions,
reprises, rapprochements composites, réunions, séparations, réussites partielles et
opérations distantes ne créent aucune entrée. Les commandes de nommage lancées depuis un
entretien restent hors de ce Journal.

Une entrée est affichée de la plus récente à la plus ancienne, avec heure, libellé et
bouton `↩`. Avant toute annulation, le main relit l’état frais et compare uniquement les
champs concernés : une cible modifiée rend l’entrée inapplicable sans écriture ; un
verrou ou un fichier indisponible la bloque temporairement. L’annulation réussie retire
l’entrée, réévalue les entrées restantes et restaure aussi `personneDeliee` et l’ensemble
exact des refus. Après annulation, seuls les inventaires touchés sont invalidés, sans
réinitialiser globalement le corpus.

### 2.6 Fenêtres de confirmation

Les confirmations montrent toujours les conséquences avant validation :

- **Délier** : nom local et entretien concernés ;
- **Déplacer** : personne source et personne cible ;
- **Réunir** : nom conservé, nombre de locuteurs réaffectés, notes visibles ;
- **Séparer** : locuteurs sélectionnés et nom de la nouvelle personne.

Une réunion est refusée si les deux personnes auraient chacune un locuteur dans le même
entretien ; ce cas se corrige dans l’entretien avant de réunir.

## 3. Suggestion pendant le nommage

### 3.1 Déclenchement

Après validation d’un nouveau nom dans l’onglet Locuteurs d’un entretien :

1. normaliser le nom et rechercher les candidats dans les autres entretiens ;
2. ne rien faire si le nom est vide, générique ou trop court ;
3. s’il existe un ou plusieurs candidats crédibles, ouvrir le dialogue ;
4. laisser le renommage local acquis, quel que soit le choix de rapprochement.

Le dialogue n’interrompt pas la frappe à chaque caractère : il s’ouvre après `change`,
Entrée ou sortie du champ. Les traitements de nommage sont sérialisés dans une file et
vérifient que le locuteur et son nom sont toujours actuels après les opérations
asynchrones ; un changement survenu pendant les attentes (données source, lien d’un
candidat, propositions) interrompt la décision avec une erreur explicite, sans liaison,
reprise ni refus silencieux.

### 3.2 Création par défaut

Après validation d’un nom spécifique pour un locuteur non lié :

- sans candidat crédible, une Personne est créée puis le locuteur est rattaché ;
- avec candidat, le rapprochement est proposé avant toute création ;
- si le rapprochement est accepté, la Personne existante est utilisée, ou une fiche
  commune est créée lorsque le candidat n’est pas lié ;
- si l’utilisateur choisit « Ce n’est pas cette personne », une fiche distincte est
  créée et le refus est mémorisé ;
- avec « Plus tard » ou fermeture, le locuteur reste non lié et la suggestion reste à
  traiter, sans refus.

Garde-fous :

- aucune création à l’ajout d’un « Nouveau locuteur » ;
- aucune création pour un nom vide, trop court ou générique ;
- aucune nouvelle fiche au renommage d’un locuteur déjà lié ;
- aucune recréation après une déliaison volontaire (marqueur `personneDeliee`) ;
- aucune migration automatique des anciens corpus.

### 3.3 Noms à ne pas proposer

Sont exclus au minimum :

- `Nouveau locuteur` ;
- `Locuteur`, `Speaker` ou `Speaker N` ;
- `Inconnu`, `Anonyme`, `Non attribué` ;
- les chaînes d’un seul caractère ;
- deux locuteurs du même entretien.

`Interviewer`, `Intervieweur` et `Enquêteur` sont des rôles génériques : ils peuvent
déclencher une proposition vers un rôle équivalent dans un autre entretien, avec la
raison « même rôle » (jamais « même identité »), sans création automatique d’une fiche
distincte en cas de refus. Un vrai nom d’enquêteur reste éligible. La liste des rôles
équivalents est explicite et testée.

### 3.4 Rapprochement exact et rapprochement proche

Normalisation commune :

- espaces de début et de fin retirés, espaces successifs fusionnés ;
- casse ignorée, accents ignorés pour la comparaison ;
- apostrophes, points et traits d’union harmonisés.

Deux niveaux sont distingués dans l’interface :

1. **Même nom** : clés normalisées identiques ;
2. **Nom proche** : variantes strictes uniquement — une seule lettre différente avec au
   moins un mot commun, ou les mêmes mots dans un ordre différent. Un nom composé est
   exigé, afin qu’un prénom ou un nom seul ne déclenche pas de proposition approximative.

Chaque proposition indique sa raison (« même nom », « même rôle », « une lettre
différente », « mêmes mots dans un ordre différent ») dans le dialogue et dans le
répertoire. Aucun candidat n’est présélectionné. Lorsqu’une Personne est représentée
plusieurs fois, la meilleure graphie est présentée. Les refus sont symétriques
(préfixes `personne:<id>` et `locuteur:<id>`), révocables, regroupés par Personne et
étendus à ses autres locuteurs ; les personnes déjà représentées dans l’entretien source
sont exclues.

## 4. Modèle de données

### 4.1 Type `Personne`

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

Le nom n’est pas une identité et n’est pas unique ; l’id opaque est la seule identité
stable. Les noms locaux et les titres d’entretien sont dérivés en lisant les
`personneRef` des locuteurs, jamais recopiés dans `corpus.json`. Le champ reste
purement SonalPi2 et n’est pas émis dans un export `.sonal`.

### 4.2 Lien et refus sur `Locuteur`

```ts
export interface Locuteur {
  id?: string
  // ...
  personneRef: string | null
  rapprochementsRefuses?: string[]
  personneDeliee?: boolean
}
```

- `personneRef` : la source de vérité du lien (au plus une personne par locuteur) ;
- `rapprochementsRefuses` : cibles préfixées `personne:<personneId>` ou
  `locuteur:<locuteurId>` ; la décision vit avec le locuteur qui l’a prise et le refus
  est symétrique ;
- `personneDeliee` : marqueur additif d’une déliaison volontaire ; il bloque la
  recréation automatique au nommage et après refus, sans interdire une liaison explicite
  (qui retire le marqueur).

La projection Personnes appelle `completerIdsLocuteurs()` en mémoire pour les anciens
fichiers, de façon déterministe ; un id n’est persisté que lors d’une véritable écriture.
Ces champs sont additifs et tolérants à l’absence : la lecture d’un ancien corpus produit
`personnes: {}` et aucun refus, sans migration forcée de `FORMAT_VERSION`.

### 4.3 Invariants

Les commandes de domaine garantissent :

- un locuteur référence zéro ou une personne ;
- une `personneRef` créée par l’application vise une personne existante ;
- une personne ne lie au plus qu’un locuteur par entretien ;
- un rapprochement refusé n’empêche jamais une liaison manuelle ultérieure ;
- réunir réécrit les références vers la personne conservée et réconcilie les refus ;
- supprimer une personne liée est refusé.

## 5. Projection et commandes métier

### 5.1 Projection de lecture

`corpus:personnesInventaire` renvoie une projection dédiée : personnes, locuteurs
(rattachés ou non) par entretien, refus, références pendantes et entretiens
indisponibles. Les suggestions sont recalculées à chaque actualisation, jamais stockées.
L’inventaire suit un cycle frais/périmé : premier accès, chargement ; renommage, ajout
ou suppression de locuteur, périmé ; liaison, refus, réunion ou séparation,
rafraîchissement après succès ; tirage distant, périmé ; bouton **Actualiser** toujours
disponible. Le dernier inventaire lisible est conservé si l’actualisation échoue.

### 5.2 Fonctions pures

`src/shared/corpus/personnes.ts` et `src/shared/corpus/rapprochementsPersonnes.ts`
portent la logique pure : normalisation et clé de nom, score/raisons des variantes
proches, inventaire, suggestions, refus symétriques, reprise sélective
(`reprendreDonneesLocuteur`), préparation de réunion et de séparation, création et
renommage de définition. Les fonctions utilisent l’id stable du locuteur ; l’index reste
réservé aux blocs, valeurs et imports/exports existants.

### 5.3 Commandes exposées au renderer

Surface IPC réalisée : `corpus:personnesInventaire`,
`corpus:personnesSuggestionsPourLocuteur` (détail d’un locuteur),
`corpus:personnesCommander` (union typée des commandes : `creer`, `creerDefinition`,
`renommer`, `lier`, `delier`, `deplacer`, `refuser`, `annulerRefus`, `rapprocher`,
`fusionner`, `separe`, `supprimerVide`, `notes…`), `corpus:journalLister` et
`corpus:journalAnnuler`. Les retours multi-entretiens sont nominatifs : succès et échecs
par entretien, avec la personne finale obtenue.

## 6. Écritures locales et distantes

### 6.1 Cas simples (local)

- renommer une Personne ou modifier sa note touche seulement `corpus.json` ;
- lier, délier ou refuser depuis un entretien ouvert modifie le modèle réactif puis suit
  sa sauvegarde de session ;
- modifier un entretien fermé utilise un verrou court, un GET frais et un PUT
  conditionnel en distant.

Avant de rechercher ou corriger depuis le corpus, la sauvegarde différée de l’entretien
éventuellement ouvert est vidée afin que la projection lise un état cohérent.

### 6.2 Création depuis deux locuteurs non liés

L’ordre est : créer la personne dans `corpus.json`, puis lier les locuteurs entretien par
entretien, puis retourner les succès et échecs nommés. La personne est conservée si un
seul lien a réussi, avec une suggestion permettant de reprendre le second. En local, la
création au nommage écrit la définition avant le lien ; si la seconde écriture échoue
(changement de session entre les deux), la fiche vide reste visible, réparable dans le
répertoire.

### 6.3 Réunion et séparation

En local, les réunions et séparations utilisent le journal technique
`TransactionsFichiersCorpus` étendu à un plan de remplacement de plusieurs entretiens et
de `corpus.json`, reprenable après interruption ; une modification extérieure inconnue
bloque la reprise plutôt que d’être écrasée. Ce mécanisme est distinct du Journal visible
du corpus.

En distant, le moteur `TransactionsCorpus` prend le verrou corpus puis les verrous
entretiens dans l’ordre des ids, réutilise une session déjà tenue par ce poste, relit les
fichiers après acquisition et publie chaque fichier sous ETag ; tous les verrous courts
sont libérés en ordre inverse, y compris après une publication partielle. Les
opérations multi-fichiers conservent et nomment leurs réussites partielles afin de
permettre une reprise explicite après actualisation :

- la **réunion** publie les réaffectations d’entretiens avant de supprimer la définition
  absorbée : un échec conserve les deux fiches et la même commande peut reprendre les
  liens restants ;
- la **séparation** publie sa nouvelle définition avant les déplacements : si l’un d’eux
  échoue, la nouvelle fiche et les déplacements confirmés restent visibles et les
  associations restantes sont corrigeables individuellement ;
- la **suppression** d’une fiche vide verrouille et relit tous les entretiens du
  membership frais avant de retirer sa définition.

Une modification concurrente ou un verrou tiers provoque un refus explicite nominatif
sans écrasement ; une refus qui doit aussi créer une fiche distincte reste désactivé en
distant dans les cas composites non pris en charge par la transaction limitée à
l’entretien. Toutes les opérations distantes restent hors du Journal visible.

## 7. Architecture

Créé ou réalisé :

- `src/shared/corpus/personnes.ts` et `src/shared/corpus/rapprochementsPersonnes.ts` :
  modèle pur, suggestions, refus et reprise sélective ;
- `src/shared/corpus/journal.ts`, `src/main/journalCorpus.ts` et
  `src/renderer/components/corpus/PanneauJournalCorpus.vue` : Journal volatil du corpus ;
- `src/main/corpusStore.ts` : commandes locales, inventaire, inverse du Journal et
  primitives utilisées par les transactions distantes ;
- `src/main/distant/transactions.ts` : définitions distantes, corrections simples et
  multi-fichiers, lectures fraîches, ordre de publication et résultats partiels ;
- `src/renderer/components/corpus/PersonnesCorpus.vue` : répertoire, fiche, suggestions,
  reprises, réunion, séparation et journal visible ;
- `src/renderer/components/entretien/RapprochementNommage.vue` : dialogue natif du
  nommage, focus neutre, reprise sélective et libellés de déplacement ;
- `src/renderer/composables/useEntretien.ts` : file de nommages sérialisée, décisions
  appliquées au modèle de session, garde-fous de fraîcheur pendant les attentes et
  diagnostic des références pendantes dans l’éditeur ;
- évolutions de `Corpus.vue`, `useCorpus.ts`, `format.ts`, preload et handlers IPC ;
- `docs/user/vue-corpus.md` et `docs/dev/modele-objet.md` documentent les parcours.

## 8. Accessibilité et adaptation

Bouton d’onglet avec `title`, `aria-label` et `aria-current` ; recherche et filtres
correctement libellés ; liste maître navigable au clavier ; boutons explicites, sans
dépendre uniquement d’icônes ou de couleurs ; dialogue avec titre, focus initial neutre
(`Plus tard`) et retour du focus au champ de nom ; séparateur focalisable et réglable
aux flèches ; empilement vertical des panneaux sous le seuil ; annonces lisibles des
résultats partiels, des verrous et des erreurs de rapprochement (`role="alert"` dans le
dialogue).

## 9. Tests

### 9.1 Tests unitaires

`test/personnes.test.ts`, `test/rapprochementsPersonnes.test.ts`,
`test/journalCorpus.test.ts` et `test/webdav/transactions.test.ts` couvrent : la
normalisation, l’exclusion des noms génériques et courts, la distinction exact/proche,
les faux positifs de prénoms seuls, les suggestions limitées aux autres entretiens, les
homonymes, le refus symétrique révocable et regroupé, l’absence de suggestion pour un
locuteur déjà correctement lié, la liaison/déliaison/déplacement/réunion/séparation par
ids, le refus de deux locuteurs d’un même entretien, le refus de suppression d’une
personne liée, les références pendantes sans suppression silencieuse, le complément
déterministe des ids, le fléchage du pseudo et l’absence de modification du rôle, ainsi
que les transactions distantes simples et composites (ordres de publication, conflits,
réussites partielles et reprises) sur le serveur WebDAV mémoire.

### 9.2 Tests E2E locaux

16 tests Personnes (`personnes.e2e.ts`, `personnes-dialogue.e2e.ts`,
`personnes-deplacement.e2e.ts`, `personnes-nommage.e2e.ts`,
`personnes-nommage-simplifie.e2e.ts`, `personnes-regroupement.e2e.ts`,
`personnes-reprise-nommage.e2e.ts`, `personnes-separation.e2e.ts`,
`rapprochements-personnes.e2e.ts` et `personnes-conflits.e2e.ts`) couvrent : la
création, le renommage, la liaison, l’ouverture et la déliaison ; les suggestions exactes
et proches avec raison ; le dialogue natif (focus neutre, Échap, « Plus tard »,
« Aucune de ces personnes », sources multiples et réinitialisation des choix, reprise
sélective, déplacement d’un locuteur lié) ; la création par défaut au nommage ; la
réunion, la séparation et le refus révocable ; l’indication permanente du lien et le
diagnostic des références pendantes ; le Journal du corpus ; et les conflits survenus
pendant les attentes du dialogue (données source modifiées, source liée, propositions
modifiées → décision refusée explicitement sans écriture).

Les E2E `journal-corpus.e2e.ts`, `navigation.e2e.ts` et `locuteurs.e2e.ts` couvrent
l’intégration : ordre des onglets, annulations du Journal et comportement de l’éditeur.

### 9.3 Bancs Nextcloud réels

Les images et volumes Nextcloud étant déjà en place, `npm run nc:up` et `npm run nc-b:up`
démarrent les deux piles sans téléchargement : pile A (NC31 + files_lock, :8080) et pile
B (NC29 sans plugin, :8081), avec le corpus partagé `MonCorpus` entre les comptes `max`
et `olivier`.

Avec les piles actives, aucune suite unitaire n’est sautée : les bancs de conformité
réels (`contrat-nextcloud.test.ts`, `publication-nextcloud.test.ts` et les quatre
scénarios — deux postes, divergence E3b, promotion concurrente, anonymisation en
masse) s’exécutent contre les deux piles (22 tests), qui valident les préconditions
HTTP réelles, la détection `files_lock`, les ETags canoniques, les PUT conditionnels et
l’ordre des verrous sur le serveur.

Le scénario visible « deux postes » (`multi-utilisateur.e2e.ts` et
`audio-distant.e2e.ts`) s’exécute aussi sur un poste sans trousseau OS (WSL) :
les deux E2E remplissent le champ « Mot de passe pour cette session » lorsque
le compte ne conserve pas le secret (safeStorage absent), nettoient en amorce
le verrou corpus `verrous/corpus.lock.json` laissé par un passage interrompu
(il bloquerait sinon toute mutation de définitions < 24 h) et tolèrent la
navigation par onglets (bouton « Corpus » du fil désactivé sur un onglet pleine
largeur comme Données ; retour par l’onglet Accueil). Sur un poste avec
trousseau, le champ de session n’existe pas et le parcours reste identique.

Le test local `video.e2e.ts` reste sauté faute de fixture (`TestVideo/seance.webm`
absente).

## 10. Ordre de réalisation

1. Type `Personne` + identifiants locaux complétés en mémoire ; onglet pleine largeur,
   répertoire/fiche, recherche et filtre des références incorrectes.
2. Création depuis un locuteur, liaison, déliaison, déplacement, modification de fiche,
   séparateur accessible et mémorisé, consultation distante avec verrous.
3. Suggestions exactes au nommage (décisions d’identité, refus mémorisés,
   « Plus tard »), reprise sélective, dialogue natif, création par défaut au nom
   spécifique sans candidat et parcours particulier des rôles génériques.
4. Noms proches strictes, explicables et calibrés sur des cas français.
5. Fusion locale reprenable, notes conservées et refus réconciliés ; séparation locale
   transactionnelle ; Journal du corpus local pour les commandes simples.
6. Corrections distantes simples puis composites : transactions de définitions, verrous
   ordonnés, GET frais, PUT conditionnels, réussites partielles nommées.
7. Garde-fous du nommage : file sérialisée, vérification de fraîcheur après les attentes,
   renommages immédiats, référence pendante diagnostiquée dans l’éditeur, conflits
   pendant le dialogue couverts en E2E.
8. Bancs Nextcloud réels démarrés, bancs de conformité exécutés, harmonisation du plan.

## 11. Critères de fin

Le chantier est terminé lorsque :

- Personnes est un onglet corpus pleine largeur en deux panneaux, entre Thèmes et Notes ;
- les personnes et locuteurs non liés sont trouvables sans charger tous les entretiens
  dans le renderer ;
- une même personne relie des noms locaux différents ;
- les liaisons erronées sont corrigeables par liaison, déliaison, déplacement, réunion
  et séparation ;
- les noms identiques, proches et les rôles équivalents produisent une proposition
  explicite au nommage, sans présélection ;
- « Même personne », « Ce n’est pas cette personne », « Plus tard » et Échap ont des
effets distincts, persistants et réversibles ;
- la création par défaut existe pour un nom spécifique sans candidat, avec les garde-fous
  d’usage (rôles génériques, locuteurs liés, déliaison volontaire) ;
- la reprise sélective ne copie que les champs choisis, ne remplace jamais sans
  autorisation explicite et refuse les données devenues périmées ;
- aucun rapprochement, renommage ou changement de valeur n’est automatique ;
- les homonymes sont supportés ;
- les conflits survenus pendant les attentes du dialogue sont refusés explicitement,
  sans liaison, reprise ni refus silencieux ;
- une référence pendante n’est jamais supprimée silencieusement mais diagnostiquée et
  réparable ;
- le Journal du corpus annule les commandes simples pleinement réussies du répertoire,
  vérifie l’après attendu et ne réécrit jamais une cible modifiée depuis ;
- les corrections distantes passent par les transactions de définitions et ne publient
  jamais une modification concurrente ;
- les tests unitaires, E2E, le typecheck, le build et les bancs Nextcloud réels passent.

## 12. Évolutions possibles après validation d’usage

- action **Pseudonymiser cette personne**, qui prépare une règle à partir des noms
  locaux mais demande encore validation ;
- variable explicitement marquée **stable pour une personne**, avec contrôle des valeurs
  et éventuel signalement des écarts ;
- fusion de deux locuteurs du même entretien ;
- import/export CSV du répertoire des personnes ;
- recherche de variantes plus avancée, toujours locale et explicable ;
- statistiques longitudinales par personne ;
- affichage facultatif de la personne liée dans la matrice Données ;
- raccordements conditionnels au Journal du corpus (création/suppression de fiche) et
  journalisation éventuelle d’autres commandes du répertoire.

## Annexe — validation finale exécutée

- `npm test` : 779 tests unitaires réussis, **0 sauté**, avec les deux piles Nextcloud
  actives (21 tests auparavant sautés sans serveur) ;
- `npm run typecheck` et `npm run build` : réussis ;
- `npm run test:e2e` (pile + local) : **108 réussis, 1 sauté** (fixture vidéo
  absente), dont les 16 tests Personnes, le Journal du corpus, la navigation, les
  locuteurs et les deux E2E distants deux-postes (multi-utilisateur 5 scénarios +
  audio distant) exécutés sur les bancs réels de ce poste ;
- bancs réels : pile A NC31 + `files_lock` (:8080) et pile B NC29 (:8081)
  opérationnelles sans téléchargement ; les bancs de conformité réels passent contre
  les deux piles ;
- le cas sans trousseau OS est couvert par les E2E distants (mot de passe de session) ;
  le verrou corpus laissé par un passage interrompu est nettoyé en amorce des scénarios.