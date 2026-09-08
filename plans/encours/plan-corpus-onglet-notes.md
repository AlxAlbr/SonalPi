# Plan : onglet Notes au niveau Corpus

---

## 1. Objectifs

L'onglet **Notes** au niveau Corpus permet de :

- visualiser l'ensemble des notes de tous les entretiens du corpus ;
- trier les notes par différents critères (date, catégorie, entretien, auteur, statut) ;
- filtrer les notes (par catégorie, entretien, auteur, statut, mots-clés, passages importants, liens vers commentaires) ;
- rechercher dans le contenu des notes (recherche simple ou avancée avec opérateurs) ;
- éditer les notes si l'entretien n'est pas verrouillé par autrui ;
- exporter les notes au format Markdown ;
- gérer les conflits en mode distant (verrouillage pessimiste) ;
- consulter l'historique des modifications de chaque note.

L'historique des modifications est accessible via un bouton dédié sur chaque note, sans onglet séparé.

---

## 2. Modèle de données

### 2.1. Extensions du modèle existant

#### `Note` (dans `src/shared/format.ts`)
Ajout des champs `auteur` et `historique` pour tracer le créateur/modificateur d'une note et son historique.
La migration des notes existantes (sans `auteur` ou `historique`) utilise les valeurs par défaut.

```ts
/** Note d'entretien : corps HTML sanitisé (texte échappé + passages `<mark>` importants, `<em>` liés à un commentaire).
 *  `date` null = pas de date (bac « générale » migré de SonalPi1) ; `titre` optionnel : affiché seul en vue cartes.
 *  `auteur` : userId de l'auteur (corpus distant) ou "Inconnu" (migration).
 *  `historique` : liste des 10 dernières modifications de la note (limite fixe).
 *  Champs ADDITIFS optionnels — absents dans les exports .sonal (incompatibilité SonalPi1). */
export interface Note {
  id: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  rang: number
  creeLe: string
  modifieLe: string | null
  auteur: string // NOUVEAU : userId ou "Inconnu"
  historique?: HistoriqueNote[] // NOUVEAU : historique local à la note (max 10 entrées)
}
```

#### `CorpusFichier` (dans `src/shared/format.ts`)
Ajout du champ `derniereModificationNotes` pour **indexer la dernière modification par note** (optimisation pour l'affichage corpus-wide).

```ts
/** `corpus.json` — définitions + membership. */
export interface CorpusFichier {
  // ... champs existants ...
  /** Dernière modification par note (index pour optimiser l'affichage corpus-wide).
   *  Clé = noteId, valeur = date ISO de la dernière modification.
   *  Champ ADDITIF optionnel — absent dans les exports .sonal. */
  derniereModificationNotes?: Record<string, string>
}
```

#### `HistoriqueNote` (dans `src/shared/format.ts`)
Une entrée d'historique stocke **uniquement les IDs** (pas les noms) pour éviter les redondances.
Les noms sont **recalculés à l'affichage** (ex. : `nomCategorieNote(categorieId)`).

```ts
/** Une entrée d'historique pour une note.
 *  Stocke uniquement les IDs (pas les noms) pour éviter les redondances.
 *  Les noms sont recalculés à l'affichage via les fonctions du corpus (ex. : nomCategorieNote). */
export interface HistoriqueNote {
  modificationId: string // UUID pour identifier la modification
  auteur: string         // userId de l'auteur de la modification
  date: string           // ISO
  champ: 'titre' | 'corps' | 'categorieId' | 'date' | 'statut' | 'auteur' // Champ modifié
  ancienneValeur: string | null // Valeur avant modification (null si création)
  nouvelleValeur: string       // Valeur après modification
}
```

### 2.2. Normalisation et migration

- **Notes existantes sans `auteur`** :
  À l'ouverture d'un entretien, si `note.auteur` est absent, le normaliser avec `auteur: "Inconnu"`.
  *Raison* : Éviter les `undefined` dans l'UI et garder une trace claire.

- **Notes existantes sans `historique`** :
  À l'ouverture d'un entretien, si `note.historique` est absent, l'initialiser avec `[]`.
  **Pas d'entrée "Création" fictive** : On ne recrée pas l'historique des notes existantes (impossible de connaître la date/auteur exacts).

- **Corpus existants sans `derniereModificationNotes`** :
  À l'ouverture du corpus, si `corpus.derniereModificationNotes` est absent, l'initialiser avec `{}`.

- **Cohérence entre `derniereModificationNotes` et `note.historique`** :
  - À chaque modification de note, **mettre à jour `derniereModificationNotes[note.id]`** dans `corpus.json`.
  - À l'ouverture du corpus, **vérifier la cohérence** :
    - Si `derniereModificationNotes[note.id]` existe mais que `note.historique` est vide → recréer l'entrée depuis `note.historique[0]?.date`.
    - Si `note.historique` existe mais que `derniereModificationNotes[note.id]` n'existe pas → ajouter l'entrée.

- **Export `.sonal`** :
  Les champs `auteur`, `historique` et `derniereModificationNotes` **ne sont pas exportés** dans le `.sonal` (format SonalPi1).
  *Raison* : Incompatibilité avec SonalPi1, qui ne connaît pas ces champs.

---

## 3. Architecture de l'onglet

### 3.1. Répartition gauche/droite

L'onglet **Notes** suit une disposition en **deux colonnes** :

| Colonne | Largeur | Contenu |
|---------|---------|---------|
| **GAUCHE** | 20-25% | Filtres (recherche, catégorie, entretien, auteur, statut, date, passages importants, liens commentaires) + sélecteur de tri + filtres rapides. |
| **DROITE** | 75-80% | Liste des notes (modes Cartes/Feuille/Tableau) + édition inline ou via modale. |

#### Colonne GAUCHE : Filtres et tri

- **Filtres** :
  - **Recherche** : Champ texte libre (insensible à la casse) avec autocomplete pour les champs `catégorie`, `entretien`, `auteur`.
  - **Catégorie** : Sélecteur multiple (toutes les catégories du corpus).
  - **Entretien** : Sélecteur multiple (tous les entretiens du corpus).
  - **Auteur** : Sélecteur multiple (uniquement en mode distant ; masqué en local).
  - **Statut** : Sélecteur (`public` / `prive` / tous).
  - **Date** : Sélecteur de plage de dates (debut/fin).
  - **Contient un passage important** : Case à cocher (filtre les notes avec `<mark>` dans le corps).
  - **Contient un lien vers un commentaire** : Case à cocher (filtre les notes avec `<em data-ref="...">` dans le corps).
  - **Contient un mot-clé** : Champ texte libre (recherche dans le corps).

- **Tri** :
  - **Critère** : Sélecteur (Entretien, Catégorie, Auteur, Statut, Titre, Date de création, Date de la note).
  - **Ordre** : Sélecteur (Croissant / Décroissant).
  - **Personnalisation** : Le tri sélectionné est mémorisé dans `settings.json` (niveau profil).

- **Filtres rapides** (prédéfini) :
  Boutons pour appliquer des filtres/tri courants en un clic :
  - "Toutes les notes" : Réinitialise tous les filtres.
  - "Notes 'résumé'" : Filtre par catégorie `résumé`.
  - "Notes chronologiques" : Tri par `creeLe` décroissant.
  - "Notes par entretien" : Tri par `entretienTitre` croissant.

#### Colonne DROITE : Liste des notes

- **Modes d'affichage** :
  - **Cartes** (défaut) : Vue visuelle, une carte par note.
  - **Feuille** : Toutes les notes à la suite, éditables en place.
  - **Tableau** : Vue tabulaire avec colonnes (Titre, Catégorie, Entretien, Auteur, Date, Statut).

- **Actions globales** :
  - Bouton "🃏 Cartes" / "📄 Feuille" / "📊 Tableau" pour basculer entre les modes.
  - Bouton "⟳ Rafraîchir" pour recharger manuellement les notes.
  - Bouton "📤 Exporter" pour exporter les notes filtrées en Markdown.

- **Affichage des notes** :
  - **Métadonnées** : Catégorie (pastille colorée), entretien, date, statut, auteur (uniquement en distant).
  - **Corps** : Aperçu tronqué (mode Cartes/Tableau) ou complet (mode Feuille).
  - **Liens vers commentaires** : Affichage en ligne sous le corps (ex. : "Liens : [Commentaire 1] (Entretien A, 00:12:34)").
  - **Verrou** : Cadenas 🔒 + grisage si la note est verrouillée par autrui.
  - **Historique** : Bouton "Historique" sur chaque note (charge l'entretien à la demande).

---

## 4. Fonctionnalités détaillées

### 4.1. Affichage des notes

#### Modes disponibles

| Mode | Description | Édition | Cas d'usage |
|------|-------------|---------|-------------|
| **Cartes** | Vue visuelle, une carte par note. | Double-clic → modale. | Navigation rapide, vue d'ensemble. |
| **Feuille** | Toutes les notes à la suite, comme un document. | Édition inline (contenteditable pour le corps, inputs pour les métadonnées). | Lecture/édition de texte long. |
| **Tableau** | Lignes avec colonnes (Titre, Catégorie, Entretien, Auteur, Date, Statut). | Clic sur une cellule → modale. | Tri/filtrage avancé, vue compacte. |

#### Métadonnées affichées

- **Toujours** :
  - Catégorie (pastille colorée + nom).
  - Titre (ou "(sans titre)" si vide).
  - Date (`creeLe` ou `date` si présente).
  - Statut (`public` / `prive`).

- **Corpus distant uniquement** :
  - Auteur (affiché sous la forme "Par [auteur]").

- **Mode Cartes/Tableau** :
  - Aperçu du corps (tronqué à 200 caractères).

- **Mode Feuille** :
  - Corps complet (éditable si autorisé).

- **Liens vers commentaires** :
  - Sous le corps, afficher une ligne :
    ```
    Liens : [Commentaire 1] (E1, 00:12:34), [Commentaire 2] (E2, 00:23:45)
    ```
  - Clic sur un lien → ouvre l'entretien et cale la vue sur le commentaire.

- **Verrouillage** :
  - Si la note est verrouillée par autrui :
    - Cadenas 🔒 dans l'en-tête.
    - Grisage de la carte/ligne.
    - Message au survol : "Verrouillée par [utilisateur] depuis [heure]".

- **Historique** :
  - Bouton "Historique" sur chaque note (uniquement si `note.historique?.length > 0`).
  - Clic → ouvre une modale avec la liste des modifications (qui, quand, champ, ancienne/nouvelle valeur).
  - **Chargement à la demande** : L'entretien est chargé uniquement quand l'utilisateur clique sur "Historique".


### 4.2. Tri et filtres

#### Tri

- **Critères disponibles** :
  - `creeLe` (date de création).
  - `date` (date de la note).
  - `entretienTitre` (titre de l'entretien).
  - `categorie` (nom de la catégorie).
  - `auteur` (nom de l'auteur, uniquement en distant).
  - `statut` (`public` avant `prive`).
  - `titre` (ordre alphabétique).

- **Ordre** : Croissant ou décroissant.

- **Personnalisation** :
  - Le tri sélectionné est **mémorisé** dans `settings.json` (niveau profil).
  - Exemple : `{ notes: { tri: { critere: 'creeLe', ordre: 'desc' } } }`.

- **Tri par dernière modification** :
  - Utilise l'index `derniereModificationNotes` dans `corpus.json` pour éviter de charger tous les entretiens.


#### Filtres

- **Recherche simple** :
  - Texte libre (insensible à la casse) dans :
    - Titre.
    - Corps (texte brut, sans balises HTML).
    - Catégorie.
    - Entretien.
    - Auteur (uniquement en distant).
  - **Comportement** :
    - **< 500 notes** : Recherche en temps réel (à chaque frappe).
    - **≥ 500 notes** : Recherche différée (après 500ms d'inactivité).

- **Recherche avancée** :
  - **Syntaxe** : `champ:valeur` avec opérateurs `ET`/`OU`.
    Exemples :
    - `catégorie:résumé`
    - `catégorie:résumé ET entretien:E1`
    - `(titre:précarité OU corps:précarité) ET date:>2023-01-01`
  - **Champs supportés** :
    - `titre:`
    - `corps:`
    - `catégorie:`
    - `entretien:`
    - `auteur:` (uniquement en distant)
    - `date:` (format `YYYY-MM-DD` ou `>YYYY-MM-DD`/`<YYYY-MM-DD`)
  - **Autocomplete** :
    - Suggestions pour `catégorie:`, `entretien:`, `auteur:` au fur et à mesure de la frappe.
  - **Recherches sauvegardées** :
    - Stocker les **5 dernières recherches** dans `settings.json`.
    - Afficher un menu déroulant avec les recherches récentes.

- **Filtres rapides** :
  - "Toutes les notes" : Réinitialise tous les filtres.
  - "Notes 'résumé'" : Filtre par catégorie `résumé`.
  - "Notes chronologiques" : Tri par `creeLe` décroissant.
  - "Notes par entretien" : Tri par `entretienTitre` croissant.


### 4.3. Édition des notes

#### Conditions d'édition

Une note est **éditable** si :

1. L'entretien **n'est pas verrouillé par autrui** (`verrouAutrui[entretienId] === undefined`).
2. L'utilisateur a les **permissions d'édition** sur le corpus.
3. **Pour le champ `auteur`** : Seul un **administrateur** ou le **créateur original** de la note peut le modifier.

Si une note **n'est pas éditable** :
- Griser les boutons d'édition.
- Afficher un cadenas 🔒 et un message au survol : "Verrouillée par [utilisateur] depuis [heure]".

#### Actions disponibles

- **Éditer** :
  - **Mode Cartes** : Double-clic sur une carte → ouvre une **modale d'édition**.
  - **Mode Feuille** : Édition **inline** (le corps est un `contenteditable`, les métadonnées sont des `input`/`select`).
  - **Mode Tableau** : Clic sur une cellule → ouvre une **modale d'édition**.

- **Modale d'édition** :
  Contient les champs :
  - Titre (texte).
  - Corps (contenteditable, avec support des balises `<mark>` et `<em data-ref="...">`).
  - Catégorie (sélecteur).
  - Date (sélecteur de date).
  - Statut (`public` / `prive`).
  - Auteur (texte, **désactivé** sauf pour les administrateurs ou le créateur original, uniquement en distant).
  - Boutons :
    - "Valider" (sauvegarde manuelle du corps + automatique des métadonnées).
    - "Annuler" (ferme la modale sans sauvegarder).
    - "Historique" (ouvre la modale d'historique, cf. §4.6).

- **Sauvegarde** :
  - **Métadonnées** (titre, catégorie, date, statut, auteur) :
    - Sauvegarde **automatique** après **1 seconde d'inactivité** (pour éviter les sauvegardes intempestives).
  - **Corps** :
    - Sauvegarde **manuelle** (bouton "Valider" dans la modale).
    - *Raison* : Le corps est du texte long, une sauvegarde automatique à chaque frappe serait trop coûteuse.

- **Supprimer** :
  - Demander une **confirmation** : "Supprimer la note '[Titre]' ? Cette action est irréversible.".
  - Suppression **immédiate** (pas d'annulation possible, sauf via le journal global de l'entretien).
  - **Suppression de l'historique** : L'historique de la note est **supprimé avec elle** (pas de conservation séparée).


### 4.4. Recherche

#### Fonctionnement

- **Recherche simple** :
  - Appliquée en **temps réel** (à chaque frappe) si le corpus contient **moins de 500 notes**.
  - **Différée** (après 500ms d'inactivité) si le corpus contient **500 notes ou plus**.

- **Recherche avancée** :
  - **Parsing** :
    - Découper la requête en tokens (ex. : `catégorie:résumé ET entretien:E1` → tokens `catégorie:résumé` et `entretien:E1`).
    - Gérer les parenthèses pour les groupes (ex. : `(A ET B) OU C`).
  - **Opérateurs** :
    - `ET` : Intersection des résultats.
    - `OU` : Union des résultats.
  - **Champs spécifiques** :
    - `titre:valeur` → filtre sur le titre.
    - `corps:valeur` → filtre sur le corps (texte brut).
    - `catégorie:valeur` → filtre sur l'ID de la catégorie (ex. : `ncat_resume`).
    - `entretien:valeur` → filtre sur l'ID ou le titre de l'entretien.
    - `auteur:valeur` → filtre sur l'auteur (uniquement en distant).
    - `date:YYYY-MM-DD` → filtre sur la date exacte.
    - `date:>YYYY-MM-DD` → filtre sur les notes créées après la date.
    - `date:<YYYY-MM-DD` → filtre sur les notes créées avant la date.

- **Affichage des résultats** :
  - **Surlignage** des occurrences dans le titre et le corps (via `surlignerHtml`).
  - **Compteur** : "X notes trouvées / Y notes totales".


### 4.5. Gestion des conflits (mode distant)

#### Verrouillage

- **Mécanisme** :
  - **Pessimiste** : Une note ne peut être éditée que par **un seul utilisateur à la fois**.
  - **Réutilisation du verrou existant** : Le verrou sur **l'entretien** (déjà implémenté dans `verrouAutrui`) couvre aussi ses notes.
    - *Raison* : Suffisant pour la plupart des cas (un utilisateur édite rarement plusieurs notes en même temps).
  - **Pas de verrou par note** : Évite la complexité d'un système de verrouillage granulaire.

- **Affichage** :
  - Si une note est verrouillée par autrui :
    - **Cadenas 🔒** dans l'en-tête.
    - **Grisage** de la carte/ligne.
    - **Message au survol** : "Verrouillée par [utilisateur] depuis [heure]".

#### Avertissements

- **Modale de confirmation** si une note est modifiée par autrui **pendant qu'elle est ouverte en édition** :
  ```
  La note '[Titre]' a été modifiée par [X] à [heure].
  Voulez-vous :
  - [Attendre] (ne pas sauvegarder, garder la version actuelle)
  - [Forcer] (écraser les modifications de X)
  - [Annuler] (fermer sans sauvegarder)
  ```

- **Notification des modifications** :
  - Si une note **affichée à l'écran** est modifiée par autrui, afficher un **message modal** :
    ```
    La note '[Titre]' a été modifiée par [Y].
    [OK]
    ```
  - **Bouton "Rafraîchir"** : Permet à l'utilisateur de recharger manuellement les notes.


### 4.6. Historique des modifications

#### Stockage

- **Emplacement** : Dans `entretiens/<id>.json`, comme un champ de `Note` :
  ```ts
  note.historique: HistoriqueNote[] // Max 10 entrées
  ```
- **Index dans `corpus.json`** :
  ```ts
  corpus.derniereModificationNotes: Record<string, string> // noteId → date ISO
  ```
  - **Utilisation** : Pour trier les notes par date de dernière modification **sans charger tous les entretiens**.

- **Limite** : **10 entrées par note** (les plus récentes).
  - Si une 11ème modification est ajoutée, **supprimer la plus ancienne**.

- **Contenu de `HistoriqueNote`** :
  - **Uniquement les IDs** (pas les noms) pour éviter les redondances.
  - Les noms sont **recalculés à l'affichage** via les fonctions du corpus :
    - `nomCategorieNote(categorieId)` pour les catégories.
    - `corpus.membership[entretienId].titre` pour les entretiens.
    - `statut` → "public" ou "privé".

- **Modifications enregistrées** :
  - **Tous les champs** : `titre`, `corps`, `categorieId`, `date`, `statut`, `auteur`.
  - *Raison* : Traçabilité complète, y compris pour les modifications administratives (ex. : changement d'auteur).


#### Affichage

- **Pas d'onglet dédié** : L'historique est accessible via un **bouton "Historique"** sur chaque note.
- **Modale d'historique** :
  - Liste des **10 dernières modifications** de la note, avec :
    - **Auteur**.
    - **Date/heure**.
    - **Champ modifié** (ex. : "Titre", "Corps").
    - **Ancienne valeur** → **Nouvelle valeur** (avec les noms recalculés, ex. : "résumé" au lieu de "ncat_resume").
  - **Actions** :
    - "Rétablir" : Rétablir la note à l'état de cette modification (si possible).
    - "Fermer" : Fermer la modale.

- **Chargement** :
  - **À la demande** : L'entretien est chargé uniquement quand l'utilisateur clique sur "Historique".
  - *Raison* : Évite de charger tous les entretiens à l'ouverture de l'onglet Corpus.


#### Cohérence avec `derniereModificationNotes`

- **Mise à jour automatique** :
  - À chaque modification de note, **mettre à jour `derniereModificationNotes[note.id]`** dans `corpus.json`.
  - Exemple :
    ```ts
    // Dans la fonction de sauvegarde de note
    const sauvegarderNote = async (note: Note, entretienId: string) => {
      // 1. Sauvegarder la note dans l'entretien
      await sauvegarderEntretien(entretienId, { notes: [...] })
      
      // 2. Mettre à jour l'index dans corpus.json
      const corpus = corpusStore.getCorpus()
      if (!corpus.derniereModificationNotes) {
        corpus.derniereModificationNotes = {}
      }
      corpus.derniereModificationNotes[note.id] = new Date().toISOString()
      await corpusStore.sauvegarderCorpus(corpus)
    }
    ```

- **Vérification à l'ouverture** :
  - Si `derniereModificationNotes[note.id]` existe mais que `note.historique` est vide → **recréer l'entrée** depuis `note.historique[0]?.date`.
  - Si `note.historique` existe mais que `derniereModificationNotes[note.id]` n'existe pas → **ajouter l'entrée**.


### 4.7. Export Markdown

#### Format

```markdown
# Notes du corpus "[Nom du corpus]"

*Exporte le [date] à [heure] par [utilisateur]*

---

## [Catégorie] - [Titre de la note]

**Entretien** : [Nom de l'entretien] |
**Date** : [date de la note ou date de création] |
**Auteur** : [auteur] |
**Statut** : [public/prive]

[Corps de la note]

---

## [Catégorie] - [Titre de la note suivante]
...
```

#### Contenu

- **Seulement les notes filtrées** (celles affichées à l'écran au moment de l'export).
- **Nom du corpus** : Récupéré depuis `corpus.nom` ou le nom du dossier.
- **Date/heure** : Date et heure de l'export.
- **Auteur** : `userId` de l'utilisateur qui exporte.

#### Implémentation

- Utiliser l'API `Blob` pour générer et télécharger le fichier :
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

- **Liens existants** :
  - Les passages `<em data-ref="...">` dans le corps des notes sont **cliquables**.
  - Clic sur un passage → ouvre l'entretien et cale la vue sur le commentaire.

- **Affichage des liens** :
  - Sous le corps de la note, afficher une ligne :
    ```
    Liens : [Commentaire 1] (Entretien A, 00:12:34), [Commentaire 2] (Entretien B, 00:23:45)
    ```
  - Clic sur un lien → navigation vers le commentaire.


---

## 5. Implémentation technique

### 5.1. Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `src/renderer/components/corpus/NotesCorpus.vue` | Composant principal de l'onglet Notes. |
| `src/renderer/composables/useNotesCorpus.ts` | Logique métier (agrégation, filtres, tri, recherche, édition). |
| `src/main/notesCorpusStore.ts` | Gestion des verrous par entretien et de l'index `derniereModificationNotes` côté main. |


### 5.2. Modifications existantes

| Fichier | Modification |
|---------|--------------|
| `src/shared/format.ts` | Ajouter `auteur: string` et `historique?: HistoriqueNote[]` dans `Note`. Ajouter `derniereModificationNotes?: Record<string, string>` dans `CorpusFichier`. |
| `src/renderer/components/corpus/Corpus.vue` | Ajouter l'onglet "Notes" (bouton + panneau pour `NotesCorpus`). |
| `src/renderer/composables/useCorpus.ts` | Ajouter des fonctions pour récupérer les notes du corpus et gérer les verrous. |
| `src/main/corpusStore.ts` | Étendre pour gérer `derniereModificationNotes` et les verrous par entretien. |
| `src/preload/index.ts` | Ajouter des méthodes IPC pour les verrous et la mise à jour de `derniereModificationNotes`. |


### 5.3. Fonctions clés

#### `useNotesCorpus.ts`

```ts
import { computed, ref } from 'vue'
import { useCorpus } from './useCorpus'
import { normaliserNotes } from '../../shared/entretien/notes'
import { surlignerHtml } from '../notes/sanitiser'
import type { Note, HistoriqueNote, CorpusFichier } from '../../shared/format'

export function useNotesCorpus() {
  const { corpus, entretiens, verrousAutrui, lectureSeule, categoriesNote } = useCorpus()

  // --- Agrégation des notes ---
  const toutesLesNotes = computed(() => {
    return Object.entries(entretiens.value)
      .flatMap(([entretienId, entretien]) =>
        (entretien.notes || []).map((note) => ({
          ...note,
          entretienId,
          entretienTitre: corpus.value.membership[entretienId]?.titre || entretienId,
          auteur: note.auteur || "Inconnu", // Migration
          historique: note.historique || [], // Migration
        }))
      )
  })

  // --- Index des dernières modifications (pour optimiser le tri) ---
  const derniereModificationNotes = computed(() => {
    return corpus.value.derniereModificationNotes || {}
  })

  // --- Filtres ---
  const filtres = ref({
    recherche: '',
    categories: [] as string[],
    entretiens: [] as string[],
    auteurs: [] as string[],
    statut: '' as '' | 'prive' | 'public',
    dateDebut: '',
    dateFin: '',
    passageImportant: false,
    lienCommentaire: false,
  })

  const notesFiltrees = computed(() => {
    return toutesLesNotes.value.filter((note) => {
      // Filtre par recherche
      if (filtres.value.recherche) {
        const q = filtres.value.recherche.toLowerCase()
        const texteCorps = note.corps.replace(/<[^>]*>/g, '') // Retire les balises HTML
        if (
          !note.titre.toLowerCase().includes(q) &&
          !texteCorps.includes(q) &&
          !(categoriesNote.value.find((c) => c.id === note.categorieId)?.nom.toLowerCase().includes(q)) &&
          !note.entretienTitre.toLowerCase().includes(q) &&
          !note.auteur.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      // Filtre par catégorie
      if (filtres.value.categories.length && !filtres.value.categories.includes(note.categorieId)) {
        return false
      }
      // Filtre par entretien
      if (filtres.value.entretiens.length && !filtres.value.entretiens.includes(note.entretienId)) {
        return false
      }
      // Filtre par auteur
      if (filtres.value.auteurs.length && !filtres.value.auteurs.includes(note.auteur)) {
        return false
      }
      // Filtre par statut
      if (filtres.value.statut && note.statut !== filtres.value.statut) {
        return false
      }
      // Filtre par date
      if (filtres.value.dateDebut) {
        const dateNote = new Date(note.creeLe)
        const dateDebut = new Date(filtres.value.dateDebut)
        if (dateNote < dateDebut) return false
      }
      if (filtres.value.dateFin) {
        const dateNote = new Date(note.creeLe)
        const dateFin = new Date(filtres.value.dateFin)
        if (dateNote > dateFin) return false
      }
      // Filtre par passage important
      if (filtres.value.passageImportant && !note.corps.includes('<mark')) {
        return false
      }
      // Filtre par lien commentaire
      if (filtres.value.lienCommentaire && !note.corps.includes('data-ref')) {
        return false
      }
      return true
    })
  })

  // --- Tri ---
  const tri = ref<{ critere: string; ordre: 'asc' | 'desc' }>({ critere: 'creeLe', ordre: 'desc' })

  const notesTriees = computed(() => {
    const notes = [...notesFiltrees.value]
    const { critere, ordre } = tri.value
    const multiplicateur = ordre === 'asc' ? 1 : -1

    return notes.sort((a, b) => {
      let valA: string | number, valB: string | number
      switch (critere) {
        case 'creeLe':
          valA = new Date(a.creeLe).getTime()
          valB = new Date(b.creeLe).getTime()
          break
        case 'date':
          valA = a.date ? new Date(a.date).getTime() : 0
          valB = b.date ? new Date(b.date).getTime() : 0
          break
        case 'derniereModification': // Utilise l'index corpus.json
          valA = new Date(derniereModificationNotes.value[a.id] || a.creeLe).getTime()
          valB = new Date(derniereModificationNotes.value[b.id] || b.creeLe).getTime()
          break
        case 'entretienTitre':
          valA = a.entretienTitre
          valB = b.entretienTitre
          break
        case 'categorie':
          valA = categoriesNote.value.find((c) => c.id === a.categorieId)?.nom || ''
          valB = categoriesNote.value.find((c) => c.id === b.categorieId)?.nom || ''
          break
        case 'auteur':
          valA = a.auteur
          valB = b.auteur
          break
        case 'statut':
          valA = a.statut
          valB = b.statut
          break
        case 'titre':
          valA = a.titre
          valB = b.titre
          break
        default:
          valA = 0
          valB = 0
      }
      if (valA < valB) return -1 * multiplicateur
      if (valA > valB) return 1 * multiplicateur
      return 0
    })
  })

  // --- Édition ---
  const estEditable = (note: Note) => {
    return !verrousAutrui.value[note.entretienId] && !lectureSeule.value
  }

  const estAdmin = computed(() => {
    // À implémenter : vérifier si l'utilisateur est administrateur du corpus
    // Exemple : return corpus.value.roles?.[userId] === 'propriétaire'
    return false
  })

  const peutModifierAuteur = (note: Note) => {
    // Seul un admin ou le créateur original peut modifier l'auteur
    return estAdmin.value || note.auteur === 'Inconnu' // À affiner avec le userId de la session
  }

  // --- Verrouillage ---
  // Utilise le verrou existant sur l'entretien (pas de verrou par note)
  const estEntretienVerrouille = (entretienId: string) => {
    return !!verrousAutrui.value[entretienId]
  }

  // --- Sauvegarde ---
  const sauvegarderNote = async (note: Note, entretienId: string) => {
    // 1. Sauvegarder la note dans l'entretien (IPC vers main)
    await window.electron.ipcRenderer.invoke('notes:sauvegarder', { note, entretienId })
    
    // 2. Mettre à jour l'index dans corpus.json
    await window.electron.ipcRenderer.invoke('corpus:mettreAJourDerniereModification', {
      noteId: note.id,
      date: new Date().toISOString(),
    })
    
    // 3. Ajouter une entrée dans l'historique (si la note a été modifiée)
    //    → Géré côté main dans notesCorpusStore.ts
  }

  // --- Recherche ---
  const rechercherNotes = (requete: string) => {
    filtres.value.recherche = requete
    // Si recherche avancée, parser la requête et appliquer les filtres
    if (requete.includes(':')) {
      const tokens = parserRechercheAvancee(requete)
      appliquerFiltresAvances(tokens)
    }
  }

  const parserRechercheAvancee = (requete: string): Token[] => {
    // À implémenter : découper la requête en tokens
    // Exemple : "catégorie:résumé ET entretien:E1" → [
    //   { champ: 'catégorie', operateur: 'ET', valeur: 'résumé' },
    //   { champ: 'entretien', operateur: 'ET', valeur: 'E1' }
    // ]
    return []
  }

  const appliquerFiltresAvances = (tokens: Token[]) => {
    // À implémenter : appliquer les tokens comme filtres
  }

  // --- Historique ---
  const chargerHistorique = async (noteId: string, entretienId: string) => {
    // Charger l'entretien et retourner note.historique
    const entretien = await window.electron.ipcRenderer.invoke('entretien:charger', entretienId)
    const note = entretien.notes?.find((n: Note) => n.id === noteId)
    return note?.historique || []
  }

  // --- Export ---
  const exporterNotesMarkdown = (notes: Note[]) => {
    const markdown = notes.map((note) => {
      const categorieNom = categoriesNote.value.find((c) => c.id === note.categorieId)?.nom || note.categorieId
      return `## ${categorieNom} - ${note.titre || '(sans titre)'}

**Entretien** : ${note.entretienTitre} | **Date** : ${note.date || note.creeLe} | **Auteur** : ${note.auteur} | **Statut** : ${note.statut}

${note.corps}

---
`
    }).join('\n')
    
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes_${corpus.value.nom}_${new Date().toISOString().slice(0, 10)}.md`
    a.click()
  }

  return {
    toutesLesNotes,
    notesFiltrees,
    notesTriees,
    filtres,
    tri,
    estEditable,
    estAdmin,
    peutModifierAuteur,
    estEntretienVerrouille,
    sauvegarderNote,
    rechercherNotes,
    chargerHistorique,
    exporterNotesMarkdown,
  }
}
```


#### `NotesCorpus.vue`

Structure de base (cf. §3.1 et §4.1 pour les détails).


#### `notesCorpusStore.ts` (côté main)

```ts
import type { HistoriqueNote, Note, CorpusFichier } from '../../shared/format'
import { corpusStore } from './corpusStore'

// --- Gestion de l'index derniereModificationNotes ---

export function mettreAJourDerniereModification(noteId: string, date: string): void {
  const corpus = corpusStore.getCorpus()
  if (!corpus.derniereModificationNotes) {
    corpus.derniereModificationNotes = {}
  }
  corpus.derniereModificationNotes[noteId] = date
  corpusStore.sauvegarderCorpus(corpus)
}

// --- Gestion de l'historique ---

export function ajouterHistorique(
  note: Note,
  entretienId: string,
  champ: HistoriqueNote['champ'],
  ancienneValeur: string | null,
  nouvelleValeur: string
): void {
  const entretien = corpusStore.getEntretien(entretienId)
  if (!entretien) return
  
  const noteIndex = entretien.notes?.findIndex((n: Note) => n.id === note.id)
  if (noteIndex === undefined || noteIndex === -1) return
  
  // Initialiser historique si absent
  if (!entretien.notes) entretien.notes = []
  if (!entretien.notes[noteIndex].historique) {
    entretien.notes[noteIndex].historique = []
  }
  
  // Limiter à 10 entrées
  if (entretien.notes[noteIndex].historique!.length >= 10) {
    entretien.notes[noteIndex].historique!.pop()
  }
  
  // Ajouter la nouvelle entrée
  entretien.notes[noteIndex].historique!.unshift({
    modificationId: crypto.randomUUID(),
    auteur: note.auteur,
    date: new Date().toISOString(),
    champ,
    ancienneValeur,
    nouvelleValeur,
  })
  
  // Sauvegarder l'entretien
  corpusStore.sauvegarderEntretien(entretienId, entretien)
  
  // Mettre à jour l'index dans corpus.json
  mettreAJourDerniereModification(note.id, new Date().toISOString())
}

// --- Vérification de cohérence à l'ouverture ---
export function verifierCohérenceHistorique(corpus: CorpusFichier, entretiens: Record<string, any>): void {
  if (!corpus.derniereModificationNotes) {
    corpus.derniereModificationNotes = {}
    return
  }
  
  for (const [entretienId, entretien] of Object.entries(entretiens)) {
    for (const note of entretien.notes || []) {
      // Si l'index existe mais que l'historique est vide → recréer l'entrée
      if (corpus.derniereModificationNotes[note.id] && !note.historique?.length) {
        delete corpus.derniereModificationNotes[note.id]
      }
      // Si l'historique existe mais que l'index n'existe pas → ajouter l'entrée
      if (note.historique?.length && !corpus.derniereModificationNotes[note.id]) {
        corpus.derniereModificationNotes[note.id] = note.historique[0].date
      }
    }
  }
  
  corpusStore.sauvegarderCorpus(corpus)
}
```


---

## 6. Points critiques et décisions architecturales

### 6.1. Séparation Entretien/Corpus

**Décision** :
- **`HistoriqueNote` est stocké dans `entretiens/<id>.json`** (champ `note.historique`), car une note est une propriété de l'entretien.
- **Un index `derniereModificationNotes` est stocké dans `corpus.json`** pour optimiser l'affichage corpus-wide (ex. : tri par dernière modification).

**Justification** :
- Respect du principe que **tout ce qui concerne une note vit avec son entretien**.
- Cohérent avec d'autres champs entretien-spécifiques (`brouillonsAnon`, `pseudosDeclares`).
- L'index dans `corpus.json` permet d'éviter de charger tous les entretiens pour des opérations corpus-wide.


### 6.2. Gestion des conflits (mode distant)

**Décision** :
- **Verrouillage pessimiste par entretien** (réutilisation du système existant `verrouAutrui`).
- **Pas de fusion automatique** : Un seul utilisateur peut éditer un entretien à la fois.

**Justification** :
- Déjà implémenté et testé.
- Suffisant pour la plupart des cas (un utilisateur édite rarement plusieurs notes en même temps).
- Évite la complexité d'un système de verrouillage granulaire (par note).


### 6.3. Stockage des valeurs dans `HistoriqueNote`

**Décision** :
- **Stocker uniquement les IDs** (pas les noms) dans `HistoriqueNote`.
- **Recalculer les noms à l'affichage** via les fonctions du corpus (ex. : `nomCategorieNote(categorieId)`).

**Justification** :
- Évite les redondances (ex. : si une catégorie est renommée, pas besoin de mettre à jour l'historique).
- Toujours à jour (les noms sont recalculés dynamiquement).
- Moins gourmand en espace.


### 6.4. Limite de l'historique

**Décision** :
- **Limite fixe à 10 entrées par note** (les plus récentes).
- Si une 11ème modification est ajoutée, la plus ancienne est supprimée.

**Justification** :
- Suffisant pour la plupart des cas d'usage.
- Évite que les fichiers `entretiens/<id>.json` deviennent trop gros.


### 6.5. Affichage de l'historique

**Décision** :
- **Afficher l'historique dans les deux onglets** (Corpus et Entretien).
- **Chargement à la demande** : L'entretien est chargé uniquement quand l'utilisateur clique sur "Historique".

**Justification** :
- Cohérence entre les deux onglets.
- Évite de charger tous les entretiens à l'ouverture de l'onglet Corpus.


### 6.6. Modifications de `auteur`

**Décision** :
- **Enregistrer les modifications de `auteur` dans l'historique**.
- **Restriction** : Seul un administrateur ou le créateur original peut modifier `auteur`.

**Justification** :
- Traçabilité complète, y compris pour les modifications administratives.


### 6.7. Migration des notes existantes

**Décision** :
- **`auteur: "Inconnu"`** pour les notes sans auteur.
- **`historique: []`** pour les notes sans historique (pas d'entrée "Création" fictive).

**Justification** :
- Impossible de connaître la date/auteur exacts des notes existantes.
- Pas de valeur ajoutée à ajouter des entrées fictives.


### 6.8. Export `.sonal`

**Décision** :
- **Exclure `auteur`, `historique` et `derniereModificationNotes`** de l'export `.sonal`.

**Justification** :
- Incompatibilité avec SonalPi1, qui ne connaît pas ces champs.


### 6.9. Notifications en temps réel

**Décision** :
- **Notification + bouton "Rafraîchir"** si une note est modifiée par autrui.

**Justification** :
- Évite les interruptions (ex. : l'utilisateur est en train d'écrire).
- Donne le contrôle à l'utilisateur.


---

## 7. Ordre de mise en œuvre

| Étape | Description | Priorité | Dépendances | Complexité |
|-------|-------------|----------|-------------|------------|
| 1 | **Squelette de l'onglet** : Ajouter le bouton "Notes" dans `Corpus.vue` + créer `NotesCorpus.vue` (structure de base). | ⭐⭐⭐ | Aucune | Faible |
| 2 | **Agrégation des notes** : Implémenter `toutesLesNotes` dans `useNotesCorpus.ts`. | ⭐⭐⭐ | Étape 1 | Faible |
| 3 | **Affichage en mode Cartes** : Afficher toutes les notes en mode Cartes (défaut). | ⭐⭐⭐ | Étape 2 | Moyenne |
| 4 | **Filtres de base** : Implémenter les filtres (catégorie, entretien, statut). | ⭐⭐⭐ | Étape 3 | Moyenne |
| 5 | **Tri de base** : Implémenter le tri (date, catégorie, entretien). | ⭐⭐⭐ | Étape 4 | Moyenne |
| 6 | **Filtres rapides** : Ajouter les boutons "Toutes", "Résumé", "Chronologique", "Par entretien". | ⭐⭐ | Étape 5 | Faible |
| 7 | **Édition des notes** : Modale d'édition + sauvegarde hybride (auto pour métadonnées, manuelle pour corps). | ⭐⭐⭐ | Étape 3 | Moyenne |
| 8 | **Verrouillage** : Réutiliser le verrou existant sur l'entretien pour bloquer l'édition des notes. | ⭐⭐⭐ | Étape 7 | Faible |
| 9 | **Recherche simple** : Implémenter la recherche en texte libre. | ⭐⭐ | Étape 3 | Moyenne |
| 10 | **Recherche avancée** : Parsing des requêtes avec opérateurs `ET`/`OU`. | ⭐⭐ | Étape 9 | Élevée |
| 11 | **Avertissements de conflit** : Modale de confirmation si une note est modifiée par autrui. | ⭐⭐ | Étape 8 | Moyenne |
| 12 | **Historique des modifications** : Bouton "Historique" + modale d'affichage. | ⭐⭐ | Étape 7 | Moyenne |
| 13 | **Index `derniereModificationNotes`** : Mettre à jour l'index dans `corpus.json` à chaque modification. | ⭐⭐ | Étape 12 | Faible |
| 14 | **Vérification de cohérence** : Vérifier la cohérence entre `derniereModificationNotes` et `note.historique` à l'ouverture. | ⭐⭐ | Étape 13 | Faible |
| 15 | **Export Markdown** : Générer et télécharger un fichier Markdown. | ⭐ | Étape 3 | Faible |
| 16 | **Mode Feuille** : Affichage et édition inline. | ⭐ | Étape 3 | Moyenne |
| 17 | **Mode Tableau** : Affichage en tableau. | ⭐ | Étape 3 | Moyenne |
| 18 | **Lazy loading** : Charger les notes au fur et à mesure du défilement (si > 500 notes). | ⭐ | Étape 2 | Élevée |
| 19 | **Indexation pour la recherche** : Pré-calculer un index pour accélérer la recherche (si > 500 notes). | ⭐ | Étape 9 | Élevée |
| 20 | **Autocomplete pour la recherche avancée** : Suggestions pour `catégorie:`, `entretien:`, `auteur:`. | ⭐ | Étape 10 | Moyenne |


---

## 8. Tests à prévoir

### 8.1. Tests unitaires

| Fonctionnalité | Test | Critère de succès |
|---------------|------|-------------------|
| **Agrégation des notes** | Vérifier que `toutesLesNotes` retourne toutes les notes du corpus. | Toutes les notes sont présentes. |
| **Filtres** | Vérifier que les filtres (catégorie, entretien, statut) fonctionnent. | Seules les notes correspondantes sont retournées. |
| **Tri** | Vérifier que le tri (date, catégorie, entretien) fonctionne. | Les notes sont triées correctement. |
| **Recherche simple** | Rechercher un mot dans le titre/corps. | Les notes contenant le mot sont retournées. |
| **Recherche avancée** | Tester `catégorie:résumé ET entretien:E1`. | Seules les notes correspondantes sont retournées. |
| **Sauvegarde automatique** | Modifier une métadonnée et attendre 1 seconde. | La modification est sauvegardée sans clic. |
| **Sauvegarde manuelle** | Modifier le corps et cliquer sur "Valider". | Le corps est sauvegardé. |
| **Historique** | Modifier une note plusieurs fois. | `note.historique` contient les 10 dernières modifications. |
| **Index `derniereModificationNotes`** | Modifier une note. | `corpus.derniereModificationNotes[note.id]` est mis à jour. |


### 8.2. Tests d'intégration

| Fonctionnalité | Test | Critère de succès |
|---------------|------|-------------------|
| **Affichage des notes** | Ouvrir l'onglet Corpus > Notes. | Toutes les notes sont affichées en mode Cartes. |
| **Édition** | Double-cliquer sur une note et modifier son titre. | La note est modifiée et sauvegardée. |
| **Verrouillage** | Ouvrir une note en édition, puis essayer de l'éditer depuis un autre utilisateur. | Le 2ème utilisateur voit un cadenas et ne peut pas éditer. |
| **Conflit** | Modifier une note, puis la modifier depuis un autre utilisateur avant sauvegarde. | Le 2ème utilisateur voit une modale de conflit. |
| **Historique** | Cliquer sur "Historique" pour une note. | La modale d'historique s'ouvre avec les modifications. |
| **Export Markdown** | Cliquer sur "Exporter". | Un fichier Markdown est téléchargé. |
| **Mode Feuille/Tableau** | Basculer entre les modes. | Les notes sont affichées correctement. |


### 8.3. Tests de performance

| Scénario | Test | Critère de succès |
|----------|------|-------------------|
| **Grand corpus (1000+ notes)** | Ouvrir l'onglet Notes. | L'onglet s'ouvre en < 2 secondes. |
| **Recherche sur 1000+ notes** | Rechercher un mot. | Les résultats s'affichent en < 500ms. |
| **Lazy loading** | Faire défiler une liste de 1000+ notes. | Les notes sont chargées au fur et à mesure. |


### 8.4. Tests de migration

| Scénario | Test | Critère de succès |
|----------|------|-------------------|
| **Notes sans `auteur`** | Ouvrir un entretien avec des notes existantes. | Les notes affichent "Inconnu" comme auteur. |
| **Notes sans `historique`** | Ouvrir un entretien avec des notes existantes. | Les notes ont `historique: []`. |
| **Cohérence `derniereModificationNotes`** | Ouvrir un corpus avec des notes existantes. | `derniereModificationNotes` est cohérent avec `note.historique`. |


---

## 9. Dépendances et intégrations

### 9.1. Dépendances internes

- **`useCorpus.ts`** : Pour récupérer les entretiens, le corpus, les verrous, etc.
- **`corpusStore.ts`** : Pour gérer `derniereModificationNotes` et les verrous par entretien.
- **`notes/sanitiser.ts`** : Pour le surlignage des résultats de recherche (`surlignerHtml`).
- **`format.ts`** : Pour les interfaces `Note`, `CorpusFichier`, `HistoriqueNote`.


### 9.2. Intégrations avec le reste de l'application

- **Onglet Entretien > Notes** :
  - Les notes sont **partagées** entre les deux onglets (même modèle de données).
  - Les modifications dans l'onglet Corpus sont **répercutées** dans l'onglet Entretien (et vice versa).
  - **L'historique est accessible dans les deux onglets** (bouton "Historique" sur chaque note).

- **Journal global** :
  - Les modifications des notes **ne sont pas** enregistrées dans le journal global de l'entretien (car gérées via l'historique dédié).
  - Le journal global reste pour les **actions destructives** (suppression, création).

- **Export `.sonal`** :
  - Les champs `auteur`, `historique` et `derniereModificationNotes` **ne sont pas** exportés (incompatibilité SonalPi1).


---

## 10. Annexes

### 10.1. Exemple de requête de recherche avancée

| Requête | Description |
|---------|-------------|
| `catégorie:ncat_resume` | Notes de la catégorie "résumé" (ID). |
| `entretien:E1` | Notes de l'entretien "E1" (ID ou titre). |
| `auteur:alice` | Notes créées/modifiées par "alice" (uniquement en distant). |
| `date:>2023-01-01` | Notes créées après le 1er janvier 2023. |
| `titre:précarité` | Notes avec "précarité" dans le titre. |
| `corps:travail` | Notes avec "travail" dans le corps. |
| `catégorie:ncat_resume ET entretien:E1` | Notes de la catégorie "résumé" **et** de l'entretien "E1". |
| `catégorie:ncat_resume OU catégorie:ncat_reflexion` | Notes de la catégorie "résumé" **ou** "réflexion". |
| `(titre:précarité OU corps:précarité) ET date:>2023-01-01` | Notes avec "précarité" dans le titre **ou** le corps, **et** créées après le 1er janvier 2023. |


### 10.2. Exemple de fichier Markdown exporté

```markdown
# Notes du corpus "Mon Corpus"

*Exporte le 15/10/2023 à 14:30 par alice*

---

## Résumé - Hypothèses centrales

**Entretien** : E1 | **Date** : 2023-10-10 | **Auteur** : alice | **Statut** : public

Les hypothèses principales de cette étude sont les suivantes :
- La précarité a un impact direct sur la santé mentale.
- Les politiques publiques actuelles ne suffisent pas à résoudre ce problème.

---

## Réflexion - Pistes à explorer

**Entretien** : E2 | **Date** : 2023-10-12 | **Auteur** : bob | **Statut** : prive

Il serait intéressant d'explorer le lien entre précarité et accès aux soins.

---
```


### 10.3. Exemple de structure `entretiens/<id>.json` avec historique

```json
{
  "formatVersion": 3,
  "lastModified": "2023-10-15T14:30:00.000Z",
  "corpsTexte": { ... },
  "annotations": [ ... ],
  "locuteurs": [ ... ],
  "meta": { ... },
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
      "modifieLe": "2023-10-15T14:30:00.000Z",
      "auteur": "alice",
      "historique": [
        {
          "modificationId": "mod_1",
          "auteur": "alice",
          "date": "2023-10-15T14:30:00.000Z",
          "champ": "titre",
          "ancienneValeur": "Ancien titre",
          "nouvelleValeur": "Hypothèses centrales"
        },
        {
          "modificationId": "mod_2",
          "auteur": "alice",
          "date": "2023-10-15T14:25:00.000Z",
          "champ": "corps",
          "ancienneValeur": "<p>Ancien corps</p>",
          "nouvelleValeur": "<p>Les hypothèses principales...</p>"
        }
      ]
    }
  ]
}
```


### 10.4. Exemple de structure `corpus.json` avec index

```json
{
  "formatVersion": 3,
  "codebook": { ... },
  "variables": { ... },
  "categoriesNote": [
    { "id": "ncat_resume", "nom": "résumé", "couleur": "#64b5f6" },
    { "id": "ncat_reflexion", "nom": "réflexion", "couleur": "#ba68c8" }
  ],
  "derniereModificationNotes": {
    "note_abc123": "2023-10-15T14:30:00.000Z",
    "note_def456": "2023-10-14T10:15:00.000Z"
  }
}
```


### 10.5. Schéma des flux de données

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                                ONGLET CORPUS > NOTES                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  Colonne GAUCHE  │    │              Colonne DROITE                       │  │
│  │                 │    │                                                 │  │
│  │  - Filtres     │    │  ┌─────────────────────────────────────────────┐  │  │
│  │  - Tri         │    │  │  Mode Cartes/Feuille/Tableau                  │  │  │
│  │  - Filtres     │    │  │  - Affichage des notes                        │  │  │
│  │    rapides     │    │  │  - Bouton "Historique" → charge l'entretien   │  │  │
│  │                 │    │  │    et affiche note.historique                 │  │  │
│  └─────────────────┘    │  │  - Bouton "Éditer" → modale d'édition         │  │  │
│         │               │  │  - Bouton "Exporter" → Markdown                │  │  │
│         ▼               │  └─────────────────────────────────────────────┘  │  │
│  ┌─────────────────┐    │                                                 │  │
│  │  useNotesCorpus  │◄───┘                                                 │  │
│  │  (composable)    │                                                      │  │
│  └─────────────────┘                                                      │  │
│         │                                                                  │  │
│         ▼                                                                  │  │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  IPC (Inter-Process Communication)                                      │  │
│  │  - notes:list → Récupère toutes les notes du corpus                     │  │
│  │  - notes:sauvegarder → Sauvegarde une note + met à jour l'historique    │  │
│  │  - corpus:mettreAJourDerniereModification → Met à jour l'index          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                                MAIN PROCESS                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  notesCorpusStore.ts                                                     │  │
│  │  - ajouterHistorique() → Ajoute une entrée dans note.historique          │  │
│  │  - mettreAJourDerniereModification() → Met à jour corpus.derniere...     │  │
│  │  - verifierCohérenceHistorique() → Vérifie la cohérence à l'ouverture    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  corpusStore.ts (existante)                                               │  │
│  │  - Gère corpus.json (dont derniereModificationNotes)                   │  │
│  │  - Gère les verrous par entretien (verrouAutrui)                       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                                DISQUE                                        │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  - corpus.json (contient : codebook, variables, categoriesNote,                │
│    derniereModificationNotes)                                               │
│  - entretiens/<id>.json (contient : notes[], dont note.historique)             │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```


---

## 11. Glossaire

| Terme | Définition |
|-------|------------|
| **Note** | Une note structurée associée à un entretien (titre, corps, catégorie, etc.). |
| **HistoriqueNote** | Une entrée dans l'historique d'une note (qui, quand, quoi). |
| **derniereModificationNotes** | Index dans `corpus.json` pour optimiser l'affichage corpus-wide. |
| **Verrou pessimiste** | Un seul utilisateur peut éditer un entretien à la fois. |
| **Recherche avancée** | Recherche avec opérateurs (`ET`, `OU`) et champs spécifiques (`titre:`, `catégorie:`). |
| **Lazy loading** | Chargement des notes au fur et à mesure du défilement. |
