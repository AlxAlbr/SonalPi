# Plan : onglet Notes au niveau Corpus

> Plan révisé pour intégrer les décisions du Journal du corpus
> ([plan-corpus-onglet-journal.md](plan-corpus-onglet-journal.md), §8) **et**
> le périmètre d'édition retenu en amont.
>
> L'onglet Notes ne porte pas d'historique persistant par note
> (`HistoriqueNote[]`, `auteur`, `derniereModificationNotes`) : l'annulation
> des gestes locaux de la session est confiée au **Journal du corpus**
> (volatil, dix entrées). L'édition depuis le corpus est volontairement
> **restreinte à la modale d'une note locale déjà existante** (modification,
> suppression). Le premier livrable reste une vue de consultation pour un
> corpus distant, même quand celui-ci est en ligne. L'onglet **renvoie à
> l'entretien** pour ce qui exige son contexte (création, ordre,
> « Concerne » = locuteurs, liaison à un commentaire, gestion des catégories).
>
> Ce périmètre supprime les chantiers à plus haut risque d'une édition
> corpus-wide : mode Feuille éditable, création, réordonnancement,
> sauvegardes par frappe et la plupart des rafraîchissements croisés.

## 1. Objectifs

L'onglet **Notes** au niveau Corpus permet de :

- visualiser l'ensemble des notes de tous les entretiens du corpus ;
- trier les notes par différents critères (date, catégorie, entretien, statut, titre, dernière modification) ;
- filtrer les notes (par catégorie, entretien, statut, mots-clés, passages importants, liens vers commentaires) ;
- rechercher dans le contenu des notes (recherche simple ou avancée avec opérateurs) ;
- consulter une note en entier et, pour un corpus local, **modifier** une note existante (modale restreinte) ;
- **supprimer** une note locale (annulable depuis le Journal tant que l'entrée y est encore présente et applicable) ;
- ouvrir l'entretien d'une note quand une action demande son contexte (créer, déplacer, « Concerne », lier à un commentaire) ;
- exporter les notes au format Markdown ;
- annuler les dernières actions locales sur les notes (modification, suppression) depuis le **Journal du corpus**.

L'annulation est portée par le Journal du corpus : il n'y a **pas** de bouton
« Historique » sur chaque note, ni d'onglet dédié à un historique. La
**création** et le **réordonnancement** d'une note ne sont **pas** des gestes
de cet onglet : ils restent dans l'onglet Entretien (où le rang et le
rattachement aux locuteurs ont leur contexte), et ne produisent donc aucune
entrée dans le Journal du corpus.

---

## 2. Modèle de données

### 2.1. Aucune extension du modèle persistant

L'onglet Notes **ne modifie pas** le modèle : pas de champ ajouté à `Note`,
pas de champ ajouté à `CorpusFichier`, pas de changement de `FORMAT_VERSION`,
pas d'exclusion nouvelle dans l'export `.sonal`.

Les trois éléments que la version antérieure du plan ajoutait —
`Note.auteur`, `Note.historique: HistoriqueNote[]`,
`CorpusFichier.derniereModificationNotes` — sont **retirés** :

- l'annulation des gestes récents est assurée par le Journal du corpus, sans
  aucune persistance (§4.6) ;
- `creeLe` et `modifieLe`, déjà présents sur `Note`, suffisent pour l'ordre et
  le tri ;
- une attribution affichée (« auteur ») n'est conservée que si un besoin
  d'affichage est confirmé, indépendamment du Journal ; elle ferait l'objet
  d'une décision séparée.

*Conséquence* : aucun scénario de migration. Les notes existantes — y compris
celles d'un bac « générale » migré de SonalPi1 — sont lues telles quelles via
`normaliserNotes()` (déjà en place).

### 2.2. Où vivent les notes et les données d'annulation

- les notes restent des propriétés de leur entretien
  (`entretiens/<id>.json`) ; l'onglet ne crée aucun fichier ni agrégat
  supplémentaire ;
- le Journal du corpus est **volatil** : il n'est écrit ni dans les entretiens,
  ni dans `corpus.json`, ni dans les réglages du profil ; il survit aux
  changements d'onglet et à un aller-retour dans un entretien du même corpus ;
  il est vidé au changement de corpus et au redémarrage de l'application
  (règles du plan Journal, §1) ;
- le corps d'une note supprimée, nécessaire à sa restauration, reste **en
  mémoire du main** dans l'inverse du Journal, borné par le cap de dix
  entrées ; il n'est jamais persisté par le Journal.

---

## 3. Architecture de l'onglet

### 3.1. Navigation et placement

L'onglet **Notes** est ajouté à `OngletCorpus` et placé dans la barre
**entre Personnes et Données** (ordre recommandé du plan Journal, §3.1),
avec une icône `notes.png` et un `aria-label`.

L'onglet occupe la zone pleine largeur réservée aux panneaux du corpus (comme
Personnes) et suit une disposition en **deux colonnes** :

| Colonne | Largeur | Contenu |
|---------|---------|---------|
| **GAUCHE** | 20-25% | Filtres (recherche, catégorie, entretien, statut, date, passages importants, liens commentaires) + sélecteur de tri + filtres rapides. |
| **DROITE** | 75-80% | Liste des notes (modes Cartes/Tableau, Feuille en lecture) + modale d'édition. |

#### Colonne GAUCHE : Filtres et tri

- **Filtres** :
  - **Recherche** : Champ texte libre (insensible à la casse) avec autocomplete pour les champs `catégorie` et `entretien`.
  - **Catégorie** : Sélecteur multiple (toutes les catégories du corpus).
  - **Entretien** : Sélecteur multiple (tous les entretiens du corpus).
  - **Statut** : Sélecteur (`public` / `prive` / tous).
  - **Date de la note** : Sélecteur de plage début/fin appliqué à `Note.date` ; les notes sans date sont exclues quand une borne est active.
  - **Contient un passage important** : Case à cocher (filtre les notes avec `<mark>` dans le corps).
  - **Contient un lien vers un commentaire** : Case à cocher (filtre les notes dont un passage `<em>` ou `<mark>` porte `data-liens`, via `ATTR_LIENS_NOTE`).
  - **Contient un mot-clé** : Champ texte libre (recherche dans le corps).

- **Tri** :
  - **Critère** : Sélecteur (Entretien, Catégorie, Statut, Titre, Date de création, Date de la note, Dernière modification).
  - **Ordre** : Sélecteur (Croissant / Décroissant).
  - **Personnalisation** : Le tri sélectionné est mémorisé dans `settings.json` (niveau profil).

- **Filtres rapides** (prédéfinis) :
  Boutons pour appliquer des filtres/tri courants en un clic :
  - "Toutes les notes" : Réinitialise tous les filtres.
  - "Notes 'résumé'" : Filtre par catégorie `résumé`.
  - "Notes chronologiques" : Tri par `creeLe` décroissant.
  - "Notes par entretien" : Tri par `entretienTitre` croissant.

#### Colonne DROITE : Liste des notes

- **Modes d'affichage** :
  - **Cartes** (défaut) : Vue visuelle, une carte par note.
  - **Feuille** : Toutes les notes à la suite, **en lecture seule** (document continu) ; l'édition passe par la modale (✎ par bloc).
  - **Tableau** : Vue tabulaire avec colonnes (Titre, Catégorie, Entretien, Date, Statut).

  Pas de Feuille éditable ni de glisser-déposer dans cet onglet : l'ordre des
  notes se gère dans l'entretien.

- **Actions globales** :
  - Bouton "🃏 Cartes" / "📄 Feuille" / "📊 Tableau" pour basculer entre les modes.
  - Bouton "⟳ Rafraîchir" pour relire l'inventaire des notes.
  - Bouton "📤 Exporter" pour exporter les notes filtrées en Markdown.

- **Affichage d'une note** :
  - **Métadonnées** : Catégorie (pastille colorée), entretien, date, statut.
  - **Corps** : Aperçu tronqué (Cartes/Tableau) ou complet (Feuille).
  - **Liens vers commentaires** : affichage en ligne sous le corps (ex. : « Liens : [alice : début…] (00:12:34) »).
  - **Action ✎** : ouvre la modale d'édition (double-clic sur la carte aussi).
  - **Action ✕** : supprime la note locale après confirmation ; l'entrée du Journal reste annulable seulement tant qu'elle est présente et applicable.
  - **Action "Ouvrir l'entretien"** : applique le contrat
    `allerNote(entretienId, noteId, commentaireId?)` (§4.3).
  - **Corpus distant au premier livrable** : ✎, double-clic d'édition et ✕ sont
    désactivés dès que `idDistantCourant` est présent, indépendamment de
    `lectureSeule`. Une infobulle indique « Édition des notes distantes non
    disponible ». Le cadenas par entretien est réservé au support distant
    ultérieur.

---

## 4. Fonctionnalités détaillées

### 4.1. Affichage des notes

#### Modes disponibles

| Mode | Description | Lecture | Édition |
|------|-------------|---------|---------|
| **Cartes** | Vue visuelle, une carte par note. | Aperçu tronqué (200 caractères). | Double-clic ou ✎ → modale. |
| **Feuille** | Toutes les notes à la suite, comme un document. | Corps complet (décoration des liens, surlignage). | ✎ par bloc → modale. |
| **Tableau** | Lignes avec colonnes (Titre, Catégorie, Entretien, Date, Statut). | Cellules tronquées. | Clic/✎ → modale. |

#### Métadonnées affichées

- Catégorie (pastille colorée + nom).
- Titre (ou "(sans titre)" si vide).
- Date (`creeLe` ou `date` si présente).
- Statut (`public` / `prive`).
- Entretien d'origine (badge cliquable → ouvre l'entretien).

#### Liens vers commentaires

- Chaque note ne peut référencer que des commentaires de son propre entretien.
  Sous le corps, afficher par exemple :
  ```
  Liens : [alice : début du commentaire…] (00:12:34), [bob : autre commentaire…] (00:23:45)
  ```
- Ces libellés viennent des liens résolus transportés par la projection
  (§5.3), et non du seul corps HTML. Un clic applique
  `allerNote(entretienId, noteId, commentaireId)`.

### 4.2. Tri et filtres

#### Tri

- **Critères disponibles** :
  - `creeLe` (date de création).
  - `date` (date de la note).
  - `modifieLe` (dernière modification ; repli sur `creeLe` si `null`).
  - `entretienTitre` (titre de l'entretien).
  - `categorie` (nom de la catégorie).
  - `statut` (`public` avant `prive`).
  - `titre` (ordre alphabétique).

- **Ordre** : Croissant ou décroissant.

- **Personnalisation** :
  - Le tri sélectionné est **mémorisé** dans `settings.json` (niveau profil).
  - Exemple : `{ notes: { tri: { critere: 'creeLe', ordre: 'desc' } }`.
  - Cette persistance passe par des IPC de préférences typés ; le renderer ne
    lit jamais directement `settings.json`.

- Tous les critères s'appliquent sur l'inventaire déjà chargé pour
  l'affichage (les corps sont lus par la projection) : aucun index persistant
  ni chargement paginé n'est nécessaire. Un cache normalisé en mémoire et la
  virtualisation du rendu restent possibles si les mesures du grand corpus le
  justifient.

#### Filtres

- **Recherche simple** :
  - Texte libre (insensible à la casse) dans :
    - Titre.
    - Corps (texte brut, sans balises HTML — via `corpsNoteEnTexte`).
    - Catégorie.
    - Entretien.
  - **Comportement** :
    - **< 500 notes** : Recherche en temps réel (à chaque frappe).
    - **≥ 500 notes** : Recherche différée (après 500ms d'inactivité).

- **Recherche avancée** : la grammaire complète, la signification des dates
  et le traitement des erreurs sont définis au §4.4.
  - **Autocomplete** : suggestions pour `catégorie:` et `entretien:`.
  - **Recherches sauvegardées** : les 5 dernières recherches valides dans
    `settings.json`, via les mêmes IPC de préférences typés que le tri.

- **Filtres rapides** :
  - "Toutes les notes" : Réinitialise tous les filtres.
  - "Notes 'résumé'" : Filtre par catégorie `résumé`.
  - "Notes chronologiques" : Tri par `creeLe` décroissant.
  - "Notes par entretien" : Tri par `entretienTitre` croissant.

### 4.3. Édition d'une note existante (modale restreinte)

#### Principe : une modale, une commande

L'édition depuis le corpus se fait **uniquement par la modale**, ouverte depuis
n'importe quel mode local (double-clic, ✎). Une ouverture capture le brouillon
et `attendu = etatNoteJournal(note)`. Le bouton **Valider** envoie une
**commande atomique `modifier`** portant les cinq champs éditables et cet état
attendu. **Annuler**/Escape ferme sans rien écrire. Aucune écriture par frappe,
aucune session focus/blur, aucun autosave.

- **Valider sans changement** : la modale compare d'abord les cinq champs et
  n'envoie aucune commande ; le main refait cette détection avant de poser
  `modifieLe`, afin qu'un no-op concurrent ne produise ni écriture ni Journal.
- **État frais différent de `attendu` ou note disparue** : la commande échoue
  sans écrire, avec un message invitant à rafraîchir. Cette garde s'applique en
  local après relecture et, lors du support distant ultérieur, après acquisition
  des verrous et GET frais. `If-Match` couvre ensuite la période entre ce GET
  et le PUT ; il ne remplace pas la comparaison avec l'état capturé à
  l'ouverture de la modale.

#### Champs de la modale

| Champ | Contenu | Restriction |
|---|---|---|
| Titre | Texte libre (optionnel). | — |
| Corps | `contenteditable`, HTML sanitisé par `sanitiserCorpsNote` (mêmes règles que l'entretien). | Bouton ✏ « Marquer comme important » (`<mark>`) seul ; les liens persistants `ATTR_LIENS_NOTE` / `data-liens` portés par `<em>` ou `<mark>` sont conservés, aucun lien ne peut être créé ni retiré ici. |
| Catégorie | Sélecteur des catégories **existantes** du corpus (liste partagée `categoriesNote`). | Pas d'option « autre… », pas de recoloration : créer/renommer/recolorer une catégorie est une gestion de définition, hors de l'édition d'une note (elle existe aujourd'hui dans l'éditeur de l'entretien ; un panneau dédié pourra la porter plus tard). |
| Date | Sélecteur de date. | — |
| Statut | `public` / `prive`. | — |

Absents volontairement (contexte entretien requis) :

- **« Concerne » (locuteurs)** : l'association d'une note aux locuteurs de son
  entretien se modifie dans l'entretien ; elle n'est ni affichée ni éditée ici.
- **🔗 Lier à un commentaire** : nécessite le contexte commentaires de
  l'entretien. Aide de la modale : « pour lier un passage à un commentaire,
  ouvrir l'entretien ».

#### Suppression

- Action ✕ sur une carte/ligne/bloc local, avec **confirmation** :
  « Supprimer la note '[Titre]' ? Cette action apparaîtra dans le Journal. »
- La suppression envoie une commande `supprimer` avec l'état `attendu` capturé
  à l'affichage. La note complète, son rang et l'ordre des IDs constaté après
  suppression sont conservés en mémoire du main dans l'inverse du Journal.
- Après suppression, les rangs restants sont renumérotés (`renumeroterRangs`).
  L'annulation n'est applicable que si la note est encore absente **et** si
  l'ordre courant des IDs correspond à l'ordre enregistré après suppression ;
  elle réinsère alors la note et rétablit l'ordre initial. Cette précondition
  rend sûres les suppressions successives annulées dans un ordre non LIFO.

#### Ce que l'onglet ne fait pas (renvoi vers l'entretien)

La création et le réordonnancement d'une note, l'édition de « Concerne » et la
création/recoloration de catégories ne sont **pas** proposés ici. Chaque carte
passe par un contrat renderer explicite :

```ts
allerNote(entretienId: string, noteId: string, commentaireId?: string): Promise<void>
```

Ce contrat ouvre l'entretien avec le cycle d'accès existant, sélectionne son
onglet Notes, cible `noteId` et, si fourni, cale aussi la vue sur
`commentaireId`. La modale de la note ne s'ouvre que si l'ouverture obtenue est
en accès `edition`; en lecture seule, la note est seulement ciblée et un
message explique pourquoi elle n'est pas éditable. Cela maintient un **seul
chemin d'écriture** par type de geste.

### 4.4. Recherche

#### Fonctionnement

- **Recherche simple** :
  - **< 500 notes** : temps réel (à chaque frappe).
  - **≥ 500 notes** : différée (après 500ms d'inactivité).

- **Recherche avancée** :
  - **Grammaire** : `expression := terme (OU terme)*`,
    `terme := facteur (ET facteur)*`, `facteur := filtre | '(' expression ')'`.
    `ET` est donc prioritaire sur `OU`; les parenthèses permettent de changer
    cette priorité.
  - **Valeurs** : une valeur sans espace peut rester nue. Une valeur contenant
    espaces, parenthèses ou mots `ET`/`OU` doit être entourée de guillemets
    doubles (`titre:"accès aux soins"`). Dans une valeur citée, `\"` encode un
    guillemet et `\\` une barre oblique inverse.
  - **Champs spécifiques** :
    - `titre:valeur` ; `corps:valeur` (texte brut) ;
    - `catégorie:valeur` (ID ou nom) ;
    - `entretien:valeur` (ID ou titre) ;
    - `date:YYYY-MM-DD`, `date:>YYYY-MM-DD`, `date:<YYYY-MM-DD` ciblent
      exclusivement `Note.date` ;
    - `creation:YYYY-MM-DD`, avec les mêmes comparateurs, cible `Note.creeLe`.
  - **Erreurs** : champ inconnu, date invalide, guillemet ou parenthèse non
    fermé, opérateur isolé et valeur vide produisent une erreur localisée. La
    dernière liste valide reste affichée et une requête invalide n'est pas
    ajoutée aux cinq recherches mémorisées.

- **Affichage des résultats** :
  - **Surlignage** des occurrences dans le titre et le corps (via `surlignerHtml`).
  - **Compteur** : "X notes trouvées / Y notes totales".

### 4.5. Mode distant

#### Premier livrable : consultation du miroir uniquement

Le lot initial implémente l'édition **locale**, mais l'inventaire distant reste
consultable depuis le miroir, en ligne comme hors ligne :

- `notesInventaire()` lit les fichiers du miroir courant et signale les
  entretiens indisponibles comme en local ;
- ✎, le double-clic d'édition et ✕ sont désactivés dès que
  `idDistantCourant !== null`, sans se fonder sur `lectureSeule` ;
- la garde renderer est doublée dans le main : l'IPC
  `corpus:notesCommander` teste le contexte distant (`miroirActif`, et non le
  seul objet `transactions`, absent hors ligne) et rejette toute commande dès
  que le corpus courant est distant, même si le miroir est accessible en
  écriture et le distant en ligne. En local seulement, il appelle
  `store.notesCommander(commande, true)` ;
- le bouton devient **« Rafraîchir distant »** dans ce contexte. Il attend le
  pull explicite (`actualiserDistant(false)`), puis relit l'inventaire Notes.
  En cas d'échec du pull, il conserve l'inventaire du dernier miroir valide et
  affiche l'erreur ; il ne prétend pas avoir actualisé les données ;
- aucune opération distante ne crée d'entrée au Journal et aucune annulation
  distante n'est proposée.

#### Support d'écriture distant ultérieur

Le futur routage ne doit pas appeler directement `verifierEcriture()` depuis
l'IPC. Il reprend la bifurcation transactionnelle distante de
`src/main/index.ts` :

```text
IPC corpus:notesCommander
  → transactions.executerEntretien(entretienId, mutation)
  → verrou corpus.json + verrou entretien
  → GET frais du corpus et de l'entretien
  → comparaison etatNoteJournal(noteFraiche) / commande.attendu
  → mutation du miroir sans journalisation
  → PUT de l'entretien avec If-Match
  → miroir conservé en écriture through
```

`executerEntretien()` acquiert actuellement aussi le verrou de `corpus.json`.
C'est volontaire ici : il stabilise les définitions et permet de valider
`categorieId`; ce chemin ne doit donc pas être décrit comme un simple verrou
court d'entretien. Une divergence avec `attendu`, une disparition de note ou
un échec du PUT annule toute mutation locale visible et ne crée aucune entrée.
`If-Match` protège la fenêtre GET→PUT, tandis que `attendu` protège la fenêtre
ouverture de modale→GET frais.

### 4.6. Annulation par le Journal du corpus

#### Principe

L'onglet Notes se branche sur l'infrastructure existante du Journal du corpus
(`JournalCorpus` dans le main, panneau `PanneauJournalCorpus.vue`, IPC
`corpus:journalLister` / `corpus:journalAnnuler`, déjà en place pour
Personnes). Le Journal :

- est **volatil**, limité aux **dix dernières actions** de la session ;
- affiche les entrées les plus récentes en tête, avec heure, libellé et
  bouton `↩` ;
- retire l'entrée après une annulation réussie ; annuler ne crée pas de
  nouvelle entrée ;
- grise une entrée dont la cible a changé depuis (avec une raison lisible) ;
- est vidé au changement de corpus et au redémarrage de l'application, mais
  survit aux changements d'onglet et à un aller-retour dans un entretien.

Il n'existe **pas** d'historique persistant par note, pas de « rétablir à une
version » : l'annulation restaure l'état d'**avant le geste**.

#### Entrées produites par l'onglet Notes

| Geste | Catégorie | Libellé indicatif | État restauré |
|---|---|---|---|
| Modifier une note (modale) | **A** | `Note modifiée : « Titre »` | note antérieure complète (corps HTML restauré exactement) |
| Supprimer une note | **B** | `Note supprimée : « Titre »` | réinsertion de la note complète à son rang |

Origine `notes`, impact `{ corpus: false, entretiens: [entretienId],
projections: ['notes', 'personnes'] }` (une suppression peut changer la liste
des notes liées affichée dans les fiches Personnes).

Ne produisent **aucune entrée** (catégorie C) :

- toute commande échouée, annulée dans une fenêtre ou partiellement réussie ;
- toute opération distante au premier livrable ;
- les gestes faits dans l'onglet **Entretien** > Notes (jamais dupliqués) ;
- la **création** et le **réordonnancement**, qui ne sont pas des gestes de
  cet onglet (rang et « Concerne » se gèrent dans l'entretien).

#### Journal et annulation distants ultérieurs

La mutation du miroir a lieu avant la confirmation du PUT. Le futur support
ne doit donc jamais appeler `JournalCorpus.enregistrer()` dans la mutation
passée à `executerEntretien()` : un PUT échoué laisserait une entrée fantôme.
La transaction fait plutôt remonter l'inverse préparé par la mutation, puis
l'IPC ne l'enregistre qu'**après** la résolution réussie de la transaction et
la confirmation du commit serveur.

L'annulation distante est un chantier conjoint : `JournalCorpus.annuler()` et
l'IPC, synchrones/local-only aujourd'hui, devront devenir asynchrones. Ils
évalueront puis appliqueront l'inverse dans une nouvelle
`transactions.executerEntretien(...)`, avec verrous, GET frais, applicabilité,
PUT `If-Match` et retrait de l'entrée seulement après commit. Jusqu'à ce chemin
complet, le distant ne produit aucune entrée Notes et n'en annule aucune.

#### Applicabilité

Une entrée n'est annulable que si sa cible est encore dans l'état produit par
l'action. La fonction partagée `etatNoteJournal(note)` retourne l'état
sémantique de la note en excluant uniquement `modifieLe`; elle sert à la garde
de commande et à l'applicabilité du Journal :

- `modifier` : `etatNoteJournal(noteCourante)` est égal à l'état sémantique
  `apres` enregistré. L'annulation restaure `avant`, puis pose un nouveau
  `modifieLe`. Comme l'applicabilité ignore ce seul horodatage, deux
  modifications A→B→C peuvent être annulées successivement de C vers B puis
  de B vers A ;
- `supprimer` : la note est absente et la séquence courante des IDs, triée par
  rang, est exactement égale à `ordreApres` enregistré après la suppression.

Une modification sans rapport dans le même entretien ne grise pas l'entrée.
À l'inverse, aucune valeur inconnue et aucun ordre divergent ne sont écrasés
pour rendre l'annulation possible.

#### Chargement et rafraîchissement

- Les entrées sont lues dans le main (état frais, applicabilité recalculée à
  chaque `lister`) : le renderer ne reçoit que des entrées affichables.
- Après chaque commande **locale** de l'onglet Notes : rafraîchir l'inventaire
  Notes et le Journal (`rafraichirJournalCorpus()`).
- Après une annulation venue de l'onglet Journal dont l'impact contient
  `'notes'` : rafraîchir l'inventaire Notes ; si l'impact contient
  `'personnes'`, rafraîchir aussi l'inventaire Personnes.

### 4.7. Export Markdown

#### Format

```markdown
# Notes du corpus "[Nom du corpus]"

*Exporté le [date] à [heure]*

---

## [Catégorie] - [Titre de la note]

**Entretien** : [Nom de l'entretien] |
**Date** : [date de la note ou date de création] |
**Statut** : [public/prive]

[Corps de la note]

---

## [Catégorie] - [Titre de la note suivante]
...
```

#### Contenu

- **Seulement les notes filtrées** (celles affichées à l'écran au moment de l'export).
- **Nom du corpus** : `corpus.nom` ou le nom du dossier.
- **Date/heure** : date et heure de l'export.
- **Conversion HTML→Markdown** : `genererMarkdown` reçoit un corps déjà
  sanitisé, le parse dans un conteneur DOM, échappe les caractères Markdown
  du texte (`\\`, `` ` ``, `*`, `_`, `[`, `]`), convertit `<mark>` en gras et
  `<em>` en emphase, conserve les sauts de ligne, et ignore les attributs
  `data-liens`. Les libellés de commentaires résolus sont ajoutés ensuite sous
  forme d'une ligne `Liens : ...`; aucun HTML brut ni span décoratif n'est
  exporté.

#### Implémentation

```ts
const markdown = genererMarkdown(notesFiltrees, corpus.nom)
const blob = new Blob([markdown], { type: 'text/markdown' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `notes_${corpus.nom}_${new Date().toISOString().slice(0, 10)}.md`
a.click()
```

### 4.8. Intégration avec les commentaires

- Le format persistant est `ATTR_LIENS_NOTE` (`data-liens`) sur les passages
  `<em>` ou `<mark>`. `data-ref` n'apparaît que sur les spans décoratifs
  reconstruits pour l'affichage et n'est jamais recherché dans le corps stocké.
- L'inventaire résout, dans **le même entretien**, chaque ID présent dans
  `data-liens` vers `{ commentaireId, auteur, texte, timecodeSecondes }`, en
  dédupliquant les IDs par note. Le timecode est dérivé de la position du
  commentaire et des ancres audio de cet entretien avec le helper existant ;
  il vaut `null` si aucun temps ne peut être calculé. Les références pendantes
  restent dans le corps mais n'obtiennent pas de libellé.
- La ligne récapitulative et les spans décoratifs utilisent cette projection.
  Un clic appelle `allerNote(entretienId, noteId, commentaireId)`.
- Tout corps reçu du main est passé par `sanitiserCorpsNote` avant le premier
  `v-html`; la décoration (`decoreRefsCommentaires`) et le surlignage ne
  s'appliquent qu'à cette sortie sanitisée. Le corps édité est sanitisé de
  nouveau avant l'envoi de la commande.
- La **création ou la suppression** de liens se fait dans l'entretien
  (contexte commentaires requis) ; la modale du corpus préserve `data-liens`.

---

## 5. Implémentation technique

### 5.1. Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `src/shared/corpus/notes.ts` | Contrats d'inventaire et de commande + fonctions pures, sur le modèle de `personnes.ts`. |
| `src/renderer/components/corpus/NotesCorpus.vue` | Composant principal de l'onglet Notes. |
| `src/renderer/components/corpus/ModaleNoteCorpus.vue` | Modale restreinte d'édition (titre, corps + ✏, catégorie, date, statut). |
| `src/renderer/composables/useNotesCorpus.ts` | Logique d'affichage : inventaire, filtres, tri, recherche, commandes, export. |

L'icône `src/renderer/assets/icones/notes.png` existe déjà et doit être
réutilisée.

Aucun nouveau fichier de stockage : l'annulation utilise
`src/main/journalCorpus.ts` (existant) et `corpusStore.ts` (étendu).

### 5.2. Modifications existantes

| Fichier | Modification |
|---------|--------------|
| `src/main/journalCorpus.ts` | Étendre l'union `InverseJournalCorpus` avec `noteModifier` et `noteSupprimer`. |
| `src/main/corpusStore.ts` | Ajouter `notesInventaire()` et `notesCommander(commande, journaliser)` (miroir de `personnes*`) ; étendre `evaluerInverseJournal` / `appliquerInverseJournal` pour les notes. |
| `src/shared/corpus/journal.ts` | Aucune modification : `origine: 'notes'` et la projection `'notes'` existent déjà. |
| `src/main/index.ts` | Ajouter les IPC Notes, rejeter explicitement les commandes distantes du premier lot, étendre `Settings` et sa validation avec les préférences Notes. |
| `src/preload/index.ts` | Ajouter `corpus:notesInventaire`, `corpus:notesCommander` et les IPC typés de lecture/écriture des préférences Notes. |
| `src/renderer/env.d.ts` | Déclarer les contrats Notes et préférences ajoutés au preload. |
| `src/renderer/components/corpus/Corpus.vue` | Ajouter l'onglet "Notes" (`OngletCorpus`, bouton `aria-label`, zone `v-show`). |
| `src/renderer/composables/sonal.ts` | Ajouter `allerNote(entretienId, noteId, commentaireId?)` avec contrôle de l'accès obtenu avant toute ouverture de modale. |
| `src/renderer/composables/useCorpus.ts` | Ajouter un compteur `revisionNotesCorpus` incrémenté quand l'impact d'une annulation contient `'notes'` ; exposer `categoriesNote` (existant) pour la modale. |
| `src/renderer/notes/sanitiser.ts` | Réutiliser `ATTR_LIENS_NOTE`, `sanitiserCorpsNote`, `decoreRefsCommentaires` et `corpsNoteEnTexte`; ne pas importer `marquerPassage`, qui n'y est pas exporté. |

`Settings.notes` est optionnel pour préserver les profils existants. Sa garde
n'accepte que les critères et ordres connus, et un tableau d'au plus cinq
chaînes non vides pour `recherchesRecentes`; toute valeur invalide retombe sur
les préférences par défaut. Les IPC `profil:notesPreferencesLire` et
`profil:notesPreferencesEcrire` renvoient toujours un `PreferencesNotes`
normalisé et préservent les autres champs du fichier.

### 5.3. Fonctions clés

#### Contrats (`src/shared/corpus/notes.ts`)

```ts
import type { Note } from '../format'

/** Note affichable : données d'une note + rattachement à son entretien.
 *  L'inventaire ne transporte jamais les transcriptions. */
export interface LienCommentaireNoteCorpus {
  commentaireId: string
  auteur: string
  texte: string
  timecodeSecondes: number | null
}

export interface VueNoteCorpus {
  id: string
  entretienId: string
  entretienTitre: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  rang: number
  creeLe: string
  modifieLe: string | null
  liensCommentaires: LienCommentaireNoteCorpus[]
  /** Snapshot sémantique opaque que le renderer renvoie sans le modifier. */
  attendu: EtatNoteJournal
}

export interface InventaireNotes {
  notes: VueNoteCorpus[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

/** État significatif pour conflits et inverses, hors horodatage d'activité. */
export type EtatNoteJournal = Omit<Note, 'modifieLe'>

export function etatNoteJournal(note: Note): EtatNoteJournal {
  const { modifieLe: _ignore, ...etat } = note
  return structuredClone(etat)
}

/** Champs éditables par la modale restreinte.
 *  « Concerne » reste géré dans l'entretien. */
export interface ChampsNote {
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string // HTML sanitisé, avec ATTR_LIENS_NOTE préservé.
}

export type CommandeNotes =
  | {
      type: 'modifier'
      entretienId: string
      noteId: string
      attendu: EtatNoteJournal
      champs: ChampsNote
    }
  | {
      type: 'supprimer'
      entretienId: string
      noteId: string
      attendu: EtatNoteJournal
    }

export type CritereTriNotes =
  | 'creeLe' | 'date' | 'modifieLe' | 'entretienTitre'
  | 'categorie' | 'statut' | 'titre'

export interface PreferencesNotes {
  tri: { critere: CritereTriNotes; ordre: 'asc' | 'desc' }
  recherchesRecentes: string[] // Validées, dédupliquées et limitées à cinq.
}

export function inventorierNotes(
  corpus: CorpusFichier,
  entretiens: Array<{ id: string; titre: string; data: EntretienFichier }>,
): InventaireNotes { /* Projette les notes et résout leurs commentaires locaux. */ }

export function memeEtatNote(a: EtatNoteJournal, b: EtatNoteJournal): boolean {
  /* Comparaison profonde déterministe, tableaux inclus. */
}

export function memesChampsEditables(note: Note, champs: ChampsNote): boolean {
  /* Compare uniquement categorieId, titre, date, statut et corps. */
}

export function trouverNote(entretien: EntretienFichier, noteId: string): Note {
  const note = entretien.notes?.find((n) => n.id === noteId)
  if (!note) throw new Error('Cette note n’existe plus. Actualisez la liste des notes.')
  return note
}
```

#### Main : commande (`corpusStore.ts`)

Chaque élément projeté contient un snapshot `attendu` construit dans le main.
Le renderer le conserve séparément du corps sanitisé et le renvoie sans le
modifier. Chaque commande locale appelle `verifierEcriture()`, relit
l'entretien, recherche la note, compare son état frais à `attendu`, puis écrit
une seule fois. Le futur chemin distant appelle la même mutation avec
`journaliser = false` **à l'intérieur** de `executerEntretien()`, donc après les
verrous et GET frais.

```ts
// Esquisse locale de la branche modifier.
notesCommander(commande: CommandeNotes, journaliser = false): string | null {
  this.verifierEcriture()
  const corpus = this.ouvrir()
  if (!corpus.membership[commande.entretienId]) {
    throw new Error('Cet entretien ne fait plus partie du corpus.')
  }
  const lecture = this.lireEntretien(commande.entretienId)
  if (!lecture.ok) throw new Error('Cet entretien est indisponible.')
  const data = lecture.data
  data.notes = normaliserNotes(data.notes)
  const note = trouverNote(data, commande.noteId)

  if (!memeEtatNote(etatNoteJournal(note), commande.attendu)) {
    throw new Error('Cette note a changé. Actualisez la liste des notes.')
  }

  if (commande.type === 'modifier') {
    if (!normaliserCategoriesNote(corpus.categoriesNote)
      .some((c) => c.id === commande.champs.categorieId)) {
      throw new Error('Cette catégorie de note n’existe plus.')
    }
    if (memesChampsEditables(note, commande.champs)) return note.id

    const avant = structuredClone(note)
    Object.assign(note, commande.champs)
    note.modifieLe = new Date().toISOString()
    const apres = etatNoteJournal(note)

    const { formatVersion: _format, lastModified: _date, ...payload } = data
    this.ecrireEntretien(commande.entretienId, payload as PayloadEntretien)
    if (journaliser) {
      this.journalCorpus.enregistrer(
        `Note modifiée : « ${note.titre || '(sans titre)'} »`,
        'notes',
        { type: 'noteModifier', entretienId: commande.entretienId,
          noteId: note.id, avant, apres },
        { corpus: false, entretiens: [commande.entretienId],
          projections: ['notes', 'personnes'] },
      )
    }
    return note.id
  }

  // La branche supprimer retire la note, renumérote, calcule ordreApres,
  // appelle ecrireEntretien() avec un PayloadEntretien, puis journalise.
  return null
}
```

Points d'attention :

- la catégorie demandée est validée contre les définitions fraîches avant le
  no-op et avant toute mutation, en local comme dans la future transaction
  distante ;
- `memesChampsEditables()` compare `categorieId`, `titre`, `date`, `statut` et
  `corps` **avant** toute mutation de `modifieLe` ;
- une vraie modification met à jour uniquement `note.modifieLe` et
  `EntretienFichier.lastModified`. `ecrireEntretien()` pose ce dernier à
  partir d'un `PayloadEntretien` qui exclut `formatVersion` et `lastModified` ;
- `corpus.json` et `membership[entretienId].lastModified` restent inchangés,
  conformément à l'architecture actuelle de `ecrireEntretien()` ;
- `locuteurIds` n'est jamais touché par les champs de la modale.

#### Main : inverses de notes (`journalCorpus.ts` + `corpusStore.ts`)

```ts
// Dans l'union InverseJournalCorpus.
| { type: 'noteModifier'; entretienId: string; noteId: string;
    avant: Note; apres: EtatNoteJournal }
| { type: 'noteSupprimer'; entretienId: string; note: Note;
    ordreApres: string[] }

// noteModifier est applicable si etatNoteJournal(noteCourante) === apres.
// L'application restaure avant et remplace son modifieLe par maintenant.
// noteSupprimer est applicable si la note est absente et si l'ordre courant
// des IDs est strictement égal à ordreApres. L'application réinsère note à
// son rang, renumérote, puis écrit atomiquement via ecrireEntretien().
```

Règles communes locales : relire l'état frais, écrire atomiquement, retirer
l'entrée seulement après succès. Une annulation ne touche qu'un seul
entretien. Pour le distant ultérieur, elle reste mono-entretien mais doit tout
de même passer par la transaction asynchrone décrite au §4.6, qui verrouille
aussi `corpus.json`.

#### `useNotesCorpus.ts` et `ModaleNoteCorpus.vue` (renderer)

```ts
export function useNotesCorpus() {
  const { categoriesNote, revisionNotesCorpus, rafraichirJournalCorpus } = useCorpus()
  const inventaire = ref<InventaireNotes>({ notes: [], indisponibles: [] })
  const erreur = ref<string | null>(null)

  async function rafraichirNotes() {
    inventaire.value = await window.sonal.corpus.notesInventaire()
    // Chaque corps est sanitisé avant d'alimenter un quelconque v-html.
    inventaire.value.notes = sanitiserInventaireNotes(inventaire.value.notes)
  }
  async function rafraichirDepuisBouton() {
    if (idDistantCourant.value) await actualiserDistant(false)
    await rafraichirNotes()
  }
  // Relecture après une annulation venue de l'onglet Journal.
  watch(revisionNotesCorpus, () => rafraichirNotes())

  const toutesLesNotes = computed(() => inventaire.value.notes)
  // filtres, tri, recherche : computed sur toutesLesNotes (catégories via categoriesNote).

  async function commander(commande: CommandeNotes) {
    if (idDistantCourant.value) throw new Error('Édition des notes distantes non disponible.')
    await window.sonal.corpus.notesCommander(toRaw(commande))
    await Promise.all([rafraichirNotes(), rafraichirJournalCorpus()])
  }
  return { inventaire, toutesLesNotes, rafraichirNotes,
    rafraichirDepuisBouton, commander, /* filtres, tri, allerNote, export. */ }
}
```

Le preload n'expose pas le booléen interne `journaliser`. L'IPC local appelle
`store.notesCommander(commande, true)`; le futur routage distant appelle la
mutation avec `false`, attend le commit, puis enregistre l'inverse selon le
protocole du §4.6.

`ModaleNoteCorpus.vue` est un composant **neuf et petit** (~150-200 lignes).
Il importe de `src/renderer/notes/sanitiser.ts` uniquement les fonctions qui y
sont réellement exportées (`sanitiserCorpsNote`, `decoreRefsCommentaires`,
`corpsNoteEnTexte`, `ATTR_LIENS_NOTE`). `marquerPassage` vit actuellement dans
`useEntretien.ts` : la modale réimplémente localement ce petit toggle avec
l'API `Selection`, sans le prétendre exporté par `sanitiser.ts`. Si un troisième
éditeur en a besoin, il sera alors extrait dans un module partagé. La liste
`categoriesNote` reste commune.

---

## 6. Points critiques et décisions architecturales

### 6.1. Pas d'audit persistant au premier livrable

`HistoriqueNote[]`, `auteur`, `derniereModificationNotes` et la restauration
de versions sont **retirés** : le Journal du corpus répond au besoin
d'annuler les gestes récents, sans persistance ni index. Un éventuel audit
multi-utilisateur fera l'objet d'un plan séparé si l'usage le réclame.

### 6.2. Édition restreinte à la modale d'une note existante

Pour un corpus local, l'onglet **modifie** (A) et **supprime** (B) des notes existantes, et ne fait
ni créer, ni réordonner, ni éditer « à la frappe ». Création, ordre,
« Concerne » et liens de commentaires restent dans l'entretien, qui possède le
contexte (locuteurs, commentaires, catégories). C'est le choix qui évite de
reconstruire une édition continue côté corpus et qui garde un **seul chemin
d'écriture** par type de geste.

### 6.3. Garde sémantique commune

La modale et la commande transportent `attendu = etatNoteJournal(note)`. En
local, cet attendu est comparé après relecture fraîche. Dans le futur chemin
distant, il est comparé après verrous et GET frais, avant mutation. L'état
exclut `modifieLe` pour représenter le contenu significatif et permettre les
annulations successives ; `If-Match` ajoute ensuite la garde de transport
GET→PUT.

### 6.4. Projection main, pas d'entretiens dans `useCorpus`

`useCorpus` ne conserve que le membership léger. L'onglet s'appuie sur
`corpus:notesInventaire` (notes affichables + `entretienId` + titre +
indisponibles) et écrit via `corpus:notesCommander` qui relit l'état frais.

### 6.5. Cohérence des écritures (parité Entretien)

Une modification depuis le corpus met à jour `note.modifieLe` et
`EntretienFichier.lastModified` via `ecrireEntretien()` et un
`PayloadEntretien`. Elle ne réécrit pas `corpus.json` et ne modifie donc pas
`membership.lastModified`; l'activité affichée est déjà dérivée du fichier
entretien. À l'annulation d'une modification, la note antérieure est restaurée
avec `modifieLe` posé à maintenant.

### 6.6. Fraîcheur des projections après annulation

Une annulation venue de l'onglet Journal rafraîchit ce qui est concerné, sans
réinitialiser tout l'écran : inventaire Notes (`revisionNotesCorpus`) et, si
l'impact le dit, inventaire Personnes (fiches contenant des notes liées).

### 6.7. Entretien > Notes hors du Journal du corpus

Les gestes faits dans l'onglet Notes d'un entretien ne sont **jamais**
dupliqués dans le Journal du corpus (options d'évolution : inverses de notes
au Journal d'entretien = chantier séparé, ou statu quo annoncé). `NotesCorpus`
journalise uniquement les gestes locaux qu'il initie lui-même (modification,
suppression).

---

## 7. Ordre de mise en œuvre

L'infrastructure (onglet Journal, service `journalCorpus.ts`, IPC
`journalLister`/`journalAnnuler`, panneau) existe déjà : ce chantier ne la
recrée pas. Les étapes ci-dessous correspondent au **Lot 4** du plan Journal.

| Étape | Description | Priorité | Dépendances | Complexité |
|-------|-------------|----------|-------------|------------|
| 1 | **Squelette de l'onglet** : onglet "Notes" dans `Corpus.vue` + `NotesCorpus.vue` (état vide). | ⭐⭐⭐ | Aucune | Faible |
| 2 | **Projection `notesInventaire`** : contrats `shared/corpus/notes.ts`, liens résolus, sanitisation renderer, lecture du miroir distant et IPC `corpus:notesInventaire`. | ⭐⭐⭐ | Étape 1 | Moyenne |
| 3 | **Affichage en mode Cartes** : métadonnées, pastilles, badges entretien, liens affichés. | ⭐⭐⭐ | Étape 2 | Moyenne |
| 4 | **Filtres** : catégorie, entretien, statut, plage sur `Note.date`, mot-clé, `<mark>` important et présence de `ATTR_LIENS_NOTE`. | ⭐⭐⭐ | Étape 3 | Moyenne |
| 5 | **Tous les tris + préférences** : création, date de note, modification, catégorie, entretien, statut et titre ; extension validée de `Settings`, IPC, preload et `env.d.ts`. | ⭐⭐⭐ | Étape 4 | Moyenne |
| 6 | **Filtres rapides** : boutons "Toutes", "Résumé", "Chronologique", "Par entretien". | ⭐⭐ | Étape 5 | Faible |
| 7 | **Modale d'édition + commande `modifier` (A)** : `attendu`, no-op avant `modifieLe`, IPC local-only, entrée Journal et rafraîchissements. | ⭐⭐⭐ | Étape 2 | Moyenne |
| 8 | **Suppression + commande `supprimer` (B)** : `attendu`, confirmation, inverse avec `ordreApres`, annulation restaurée. | ⭐⭐⭐ | Étape 7 | Moyenne |
| 9 | **Navigation ciblée** : `allerNote(entretienId, noteId, commentaireId?)` et ouverture de modale conditionnée par l'accès `edition`. | ⭐⭐ | Étape 3 | Faible |
| 10 | **Recherche simple** : texte libre sur titre/corps/catégorie/entretien. | ⭐⭐ | Étape 3 | Moyenne |
| 11 | **Recherche avancée** : grammaire, guillemets, priorité, dates, erreurs et mémoire des cinq requêtes valides. | ⭐⭐ | Étapes 5, 10 | Élevée |
| 12 | **Export Markdown** : conversion déterministe du HTML sanitisé et des liens résolus. | ⭐ | Étape 3 | Faible |
| 13 | **Mode Tableau** puis **Feuille en lecture**. | ⭐ | Étape 3 | Moyenne |
| 14 | **Performance mesurée** : recherche différée dès 500 notes, cache normalisé en mémoire et virtualisation du DOM si nécessaire ; l'inventaire reste chargé en une projection. | ⭐ | Étapes 2, 10, 13 | Élevée |
| 15 | **Écriture distante ultérieure** : `executerEntretien` (verrous corpus + entretien), attendu après GET, PUT `If-Match`, Journal après commit et annulation asynchrone transactionnelle. Le premier lot reste consultable et rejette toute commande distante. | ⭐ | Lot 5 du plan Journal | Élevée |

Évolutions possibles après coup, sans remettre en cause le socle : création
d'une note (bouton + catégorie par défaut + commande `creer`, inverse B),
réordonnancement par glisser-déposer au sein d'un entretien filtré, affichage
du « Concerne » (locuteurs) dans les cartes, « autre… »/recoloration des
catégories dans la modale.

---

## 8. Tests à prévoir

### 8.1. Tests unitaires

| Fonctionnalité | Test | Critère de succès |
|---------------|------|-------------------|
| **Inventaire** | `inventorierNotes` sur plusieurs entretiens, avec `data-liens`. | Notes et liens résolus présents avec `entretienId`/`entretienTitre`; aucune résolution vers un autre entretien; indisponibles signalés. |
| **Sanitisation** | Corps malveillant reçu du main puis affiché/exporté. | Sanitisation avant `v-html`; seuls texte, `<mark>`, `<em>` et `data-liens` validé survivent. |
| **Filtres / tri / recherche** | Tous les tris; catégorie, entretien, statut, plage de `Note.date`, mot-clé, `<mark>`, `ATTR_LIENS_NOTE`; guillemets, priorité ET/OU, parenthèses et erreurs. | Résultats conformes; `date:` cible `Note.date`, `creation:` cible `creeLe`; requête invalide signalée sans remplacer la liste valide. |
| **Préférences** | Tri et six recherches successives, puis relecture de `settings.json`. | Forme validée; tri restauré; seules les cinq dernières recherches valides dédupliquées restent. |
| **Commande `modifier`** | Modifier corps + métadonnées avec l'état attendu. | Écriture unique; seuls `note.modifieLe` et `EntretienFichier.lastModified` changent; `corpus.json` reste identique; une entrée Journal. |
| **Sans changement** | Valider les cinq champs à l'identique. | Comparaison avant `modifieLe`; aucune écriture, aucune entrée et aucun horodatage modifié. |
| **Conflit attendu** | Modifier ou supprimer après changement de la note depuis l'ouverture. | Échec propre après relecture fraîche; aucune écriture et aucune entrée. |
| **Deux modifications annulées** | A→B→C, annuler la récente puis l'ancienne. | C→B puis B→A restent applicables malgré les nouveaux `modifieLe`. |
| **Suppression** | Supprimer puis annuler sans autre changement d'ordre. | Note complète réinsérée à son rang; corps HTML exact et ordre initial restauré. |
| **Suppressions non LIFO** | Deux suppressions, tentative d'annulation dans l'ordre incompatible. | `ordreApres` rend l'ancienne inapplicable jusqu'à restauration de l'ordre requis. |
| **Inverse grisé** | État sémantique de la note modifié depuis l'action. | Entrée `inapplicable` avec raison; aucune écriture. |
| **Journal** | Capacité dix, retrait après annulation, pas de nouvelle entrée à l'annulation, volatilité. | Réutiliser les tests unitaires du plan Journal (§10.1). |
| **Catégories** | Changer de catégorie via la modale. | La note pointe la catégorie choisie; `locuteurIds` inchangés. |

Aucun test de migration : le modèle persistant ne change pas.

### 8.2. Tests d'intégration

| Fonctionnalité | Test | Critère de succès |
|---------------|------|-------------------|
| **Affichage** | Ouvrir l'onglet Corpus > Notes. | Notes sanitisées en Cartes sans charger les entretiens dans `useCorpus`. |
| **Édition modale** | Modifier titre/corps/catégorie/date/statut, Valider. | Une commande avec `attendu`, une entrée « Note modifiée », liste à jour. |
| **Suppression + annulation** | ✕ puis `↩` dans l'onglet Journal. | Note restaurée à sa place, entrée retirée, Personnes rafraîchi si note liée. |
| **Navigation ciblée** | `allerNote` vers une note puis vers un commentaire, en accès édition et lecture seule. | Onglet et cibles corrects; la modale ne s'ouvre qu'en accès `edition`. |
| **Distant initial** | Ouvrir un miroir distant en ligne et hors ligne, puis tenter une commande IPC. | Inventaire consultable; ✎/✕ désactivés; IPC refusé dans les deux états; aucune entrée Journal. |
| **Rafraîchir distant** | Cliquer « Rafraîchir distant ». | Pull terminé avant la nouvelle lecture; erreur de pull visible sans fausse fraîcheur. |
| **Export Markdown** | Exporter un corps avec texte, `<mark>`, `<em data-liens>` et caractères Markdown. | Fichier des seules notes filtrées, sans HTML brut, avec conversion et échappement définis au §4.7. |

### 8.3. Tests de performance

| Scénario | Test | Critère de succès |
|----------|------|-------------------|
| **Grand corpus (1000+ notes)** | Ouvrir l'onglet Notes. | L'onglet s'ouvre en < 2 secondes. |
| **Recherche sur 1000+ notes** | Rechercher un mot. | Résultats en < 500ms. |
| **Feuille en lecture** | Faire défiler une liste de 1000+ notes. | Chargement progressif fluide. |

### 8.4. E2E

Compléter `e2e/journal-corpus.e2e.ts` avec les scénarios Notes (modification et
suppression annulées depuis le corpus), et créer `e2e/notes-corpus.e2e.ts`
pour la navigation et l'affichage :

1. l'onglet Notes apparaît entre Personnes et Données ;
2. ouvrir l'onglet affiche les notes en Cartes ;
3. modifier une note → entrée « Note modifiée » au Journal ; `↩` restaure et
   retire l'entrée ;
4. supprimer puis annuler depuis le Journal restaure la note à sa place ;
5. Valider une modale sans changement ne crée aucune entrée ;
6. `allerNote` cale l'onglet Notes de l'entretien sur la note et n'ouvre la
   modale que si l'entretien est éditable ;
7. le changement d'onglet et un aller-retour dans un entretien conservent
   l'état local de l'onglet Notes ;
8. dans le projet E2E `pile`, un corpus distant affiche l'inventaire du miroir,
   désactive ✎/✕ et voit son IPC de commande refusé ;
9. dans le même banc, « Rafraîchir distant » tire le miroir avant de relire
   l'inventaire.

Ne pas compter sur `e2e/journal.e2e.ts` (Journal d'entretien uniquement). Les
tests de navigation préfèrent les `aria-label` ou `data-onglet` au rang
numérique (plan Journal, §10.2).

Validation à chaque lot :

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
  e2e/notes-corpus.e2e.ts \
  e2e/personnes.e2e.ts \
  e2e/navigation.e2e.ts
```

Les validations locales ne requièrent aucun banc Docker. Les deux scénarios
distants rejoignent le projet Playwright `pile` (par exemple dans
`e2e/multi-utilisateur.e2e.ts`) et se sautent si le serveur est absent. Si le
banc est disponible, le démarrer uniquement avec `npm run nc:up` : ne jamais
retélécharger ni reprovisionner ses images ou volumes.

### 8.5. Tests du support d'écriture distant ultérieur

Ces tests accompagnent l'étape 15, pas le premier livrable :

1. ouvrir une modale sur A, publier B depuis une autre session, puis valider :
   après verrous et GET frais, `attendu` refuse l'écrasement même si le nouvel
   ETag acquis serait valide pour un PUT ;
2. faire échouer le PUT après la mutation du miroir : le miroir revient à son
   état publié et aucune entrée fantôme n'apparaît dans le Journal ;
3. réussir le PUT : l'inverse préparé pendant la mutation n'est enregistré
   qu'après confirmation du commit ;
4. annuler cette entrée : l'IPC asynchrone reprend les verrous corpus et
   entretien, revalide l'applicabilité sur le GET frais, publie avec
   `If-Match`, puis seulement retire l'entrée ;
5. changer l'état ou l'ordre attendu avant l'annulation : aucun PUT part et
   l'entrée devient inapplicable.

---

## 9. Dépendances et intégrations

### 9.1. Dépendances internes

- `src/shared/corpus/personnes.ts` : modèle de la projection main à répliquer.
- `src/shared/corpus/journal.ts` et `src/main/journalCorpus.ts` : contrats du
  Journal et service volatile (`origine: 'notes'`, projection `'notes'` déjà
  prévues).
- `src/shared/entretien/notes.ts` : `normaliserNotes`, `renumeroterRangs`.
- `src/renderer/notes/sanitiser.ts` : `sanitiserCorpsNote`, `corpsNoteEnTexte`,
  `lireLiensNote`, `decoreRefsCommentaires`, `surlignerHtml`.
- `src/renderer/composables/useCorpus.ts` : `categoriesNote`, `revisionNotesCorpus`,
  `rafraichirJournalCorpus`.

### 9.2. Intégrations avec le reste de l'application

- **Onglet Entretien > Notes** :
  - Mêmes notes, mêmes fichiers ; chaque onglet relit le disque à l'activation.
  - La **création**, le **réordonnancement** et la gestion du « Concerne »
    restent des gestes de l'entretien ; ils ne créent aucune entrée au Journal
    du corpus.
  - Les gestes locaux de l'onglet Notes (modification, suppression) sont
    journalisés ; le distant initial reste sans entrée.
  - `note.modifieLe` et `EntretienFichier.lastModified` restent cohérents entre
    les deux chemins ; le membership n'est pas réécrit par une sauvegarde
    d'entretien.

- **Journal du corpus** :
  - En local, l'onglet Notes alimente le Journal existant (2 entrées possibles) ;
    l'onglet Journal affiche et annule sans code Notes spécifique dans le
    panneau.
  - Après une annulation, rafraîchir l'inventaire Notes et, si l'impact le
    contient, l'inventaire Personnes.

- **Personnes** :
  - Une note supprimée depuis le corpus peut disparaître de la liste « notes
    liées » d'une fiche Personne → projection `'personnes'` dans l'impact.

- **Catégories de note** :
  - La modale restreinte utilise les catégories existantes (`categoriesNote`) ;
    créer/renommer/recolorer reste là où c'est possible aujourd'hui (éditeur de
    l'entretien), en attendant un éventuel panneau de gestion dédié.

- **Export `.sonal`** : aucune exclusion nouvelle (modèle inchangé).
- **Préférences Notes** : `settings.json`, niveau profil
  (`{ notes: { tri: ..., recherchesRecentes: [...] } }`), avec validation,
  IPC dédiés, preload et déclaration `env.d.ts`.

---

## 10. Annexes

### 10.1. Exemple de requête de recherche avancée

| Requête | Description |
|---------|-------------|
| `catégorie:ncat_resume` | Notes de la catégorie "résumé" (ID). |
| `entretien:E1` | Notes de l'entretien "E1" (ID ou titre). |
| `date:>2023-01-01` | Notes dont `Note.date` est postérieure au 1er janvier 2023. |
| `creation:>2023-01-01` | Notes créées après le 1er janvier 2023 (`Note.creeLe`). |
| `titre:précarité` | Notes avec "précarité" dans le titre. |
| `corps:travail` | Notes avec "travail" dans le corps. |
| `catégorie:ncat_resume ET entretien:E1` | Notes de la catégorie "résumé" **et** de l'entretien "E1". |
| `catégorie:ncat_resume OU catégorie:ncat_reflexion` | Notes de la catégorie "résumé" **ou** "réflexion". |
| `titre:"accès aux soins"` | Notes dont le titre contient l'expression avec espaces. |
| `(titre:précarité OU corps:précarité) ET date:>2023-01-01` | Notes avec "précarité" dans le titre **ou** le corps, **et** dont `Note.date` est postérieure au 1er janvier 2023. |

### 10.2. Exemple de fichier Markdown exporté

```markdown
# Notes du corpus "Mon Corpus"

*Exporté le 15/10/2023 à 14:30*

---

## Résumé - Hypothèses centrales

**Entretien** : E1 | **Date** : 2023-10-10 | **Statut** : public

Les hypothèses principales de cette étude sont les suivantes :
- La précarité a un impact direct sur la santé mentale.
- Les politiques publiques actuelles ne suffisent pas à résoudre ce problème.

---

## Réflexion - Pistes à explorer

**Entretien** : E2 | **Date** : 2023-10-12 | **Statut** : prive

Il serait intéressant d'explorer le lien entre précarité et accès aux soins.

---
```

### 10.3. Exemple de structure `entretiens/<id>.json` (inchangée)

```json
{
  "formatVersion": 3,
  "lastModified": "2023-10-15T14:30:00.000Z",
  "notes": [
    {
      "id": "note_abc123",
      "categorieId": "ncat_resume",
      "titre": "Hypothèses centrales",
      "date": "2023-10-10",
      "statut": "public",
      "corps": "<p>Les hypothèses principales...</p>",
      "rang": 0,
      "creeLe": "2023-10-10T10:00:00.000Z",
      "modifieLe": "2023-10-15T14:30:00.000Z"
    }
  ]
}
```

Aucun champ n'est ajouté. `creeLe` et `modifieLe` restent des critères de tri;
la garde de fraîcheur utilise l'état sémantique complet de la note hors
`modifieLe`.

### 10.4. Exemples d'entrées du Journal pour l'onglet Notes

L'entrée visible et l'inverse (mémoire du main uniquement, jamais écrits) :

```jsonc
// Entrée visible (PanneauJournalCorpus) — modification :
{
  "id": "journal-a1b2c3",
  "horodatage": "2023-10-15T14:30:00.000Z",
  "libelle": "Note modifiée : « Hypothèses centrales »",
  "origine": "notes",
  "etat": "annulable"
}
// — suppression :
{
  "id": "journal-d4e5f6",
  "horodatage": "2023-10-15T15:00:00.000Z",
  "libelle": "Note supprimée : « Hypothèses centrales »",
  "origine": "notes",
  "etat": "annulable"
}

// Inverses en mémoire du main (non exposés au renderer) :
{ "type": "noteModifier", "entretienId": "entretien_E1", "noteId": "note_abc123",
  "avant": { /* note complète avant le geste, modifieLe inclus. */ },
  "apres": { /* état sémantique validé, sans modifieLe. */ } }
{ "type": "noteSupprimer", "entretienId": "entretien_E1",
  "note": { /* note complète, corps HTML inclus, avec son rang. */ },
  "ordreApres": ["note_autre_1", "note_autre_2"] }
```

### 10.5. Schéma des flux de données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ONGLET CORPUS > NOTES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌───────────────────────────────────────────────┐  │
│  │  Colonne GAUCHE   │    │            Colonne DROITE                    │  │
│  │                  │    │  Cartes / Tableau / Feuille (lecture)          │  │
│  │  - Filtres       │    │  Double-clic ou ✎ → ModaleNoteCorpus          │  │
│  │  - Tri           │    │  ✕ supprimer (confirmation)                   │  │
│  │  - Filtres       │    │  « Ouvrir l'entretien » → note ciblée          │  │
│  │    rapides       │    │  ⟳ Rafraîchir   📤 Exporter                    │  │
│  └────────┬─────────┘    └──────────────────────┬────────────────────────┘  │
│           ▼                                     │                           │
│  ┌──────────────────────────────────────────────▼──────────────┐            │
│  │              useNotesCorpus.ts (composable)                 │            │
│  │  inventaire { notes, indisponibles } + filtres/tri/export   │            │
│  └──────────────────────────┬──────────────────────────────────┘            │
│                             │ notesInventaire() / notesCommander()          │
└─────────────────────────────┼───────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRELOAD (canaux IPC)                                    │
│  corpus:notesInventaire            corpus:notesCommander                     │
│  corpus:journalLister              corpus:journalAnnuler (existants)         │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MAIN PROCESS (corpusStore.ts)                         │
│  notesInventaire() : relit les entretiens, projette les notes affichables    │
│  notesCommander()  : relit → compare attendu → détecte le no-op → applique  │
│                      → ecrireEntretien(PayloadEntretien) met à jour           │
│                      modifieLe/lastModified → Journal local seulement         │
│  evaluer/appliquerInverseJournal : branches noteModifier / noteSupprimer     │
│                                                                             │
│  JournalCorpus (volatile, dix entrées, en mémoire)  ← plan Journal          │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  DISQUE                                      │
│  - corpus.json            (inchangé : catégories de note déjà présentes)     │
│  - entretiens/<id>.json   (notes inchangées ; modifieLe/lastModified         │
│                            mis à jour à chaque modification réelle)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Glossaire

| Terme | Définition |
|-------|------------|
| **Note** | Une note structurée associée à un entretien (titre, corps, catégorie, etc.). |
| **Journal du corpus** | Service volatil de session (dix entrées) annulant les gestes récents des outils du corpus ; distinct de l'audit persistant et du journal technique de reprise. |
| **Entrée du Journal** | Une action annulable affichée (heure, libellé, bouton `↩`), grisée quand sa cible a changé depuis. |
| **Modale restreinte** | Modale d'édition d'une note existante : titre, corps (✏ marquer), catégorie existante, date, statut — sans lien de commentaire, sans « Concerne », sans création de catégorie. |
| **Commande atomique de note** | Une commande unique portant les cinq champs éditables et l'état sémantique attendu; frontière des conflits et de l'annulation. |
| **Verrou pessimiste** | Le futur chemin distant stabilise les définitions avec le verrou corpus et sérialise la note avec le verrou entretien. |
| **Recherche avancée** | Recherche avec opérateurs (`ET`, `OU`) et champs spécifiques (`titre:`, `catégorie:`). |
| **Virtualisation** | L'inventaire reste chargé, mais seules les cartes/lignes visibles et une marge sont montées dans le DOM. |
