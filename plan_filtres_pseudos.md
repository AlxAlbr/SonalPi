# Plan — Filtres & vues de la page « Pseudos »

Conception d'une **selectbox de filtrage** (et fonctions associées) en tête de la page dédiée
« Pseudos », pour en faire un outil de pilotage de la pseudonymisation à l'échelle du corpus.

> Statut : **Phases 1 (sous-ensemble strict) et 2 implémentées** dans [`affichAnonGen`](modules/Anonymisation/tableau_global.js#L1426).
> - Phase 1 : selectbox (Toutes / Conflits de pseudo / Collisions de pseudo) + recherche texte + tri A→Z / Z→A, sans scan.
> - Phase 2 : filtres d'état (À traiter / Avec exceptions / Entièrement anonymisées / Partiellement traitées) via un
>   **scan corpus à la demande** ([`scannerEtatCorpus`](modules/Anonymisation/tableau_global.js)) optimisé par la passe unique
>   du §4 (un parse HTML/entretien + pré-filtre par Set de mots), avec **fenêtre de progression** (`wait`/`updateProgressBar`),
>   **cache de session** et bouton **↻ recalculer**. Cœur de détection extrait en `trouverOccurrencesDansDoc`.
> - Reste à faire : Phase 1 enrichie (Propositions / Par source / Orphelines, nécessite d'enrichir `reconstituerTabAnonGlobal`) ;
>   persistance incrémentale de nbAnon/nbExc (cf. §4) ; invalidation auto du cache après une anonymisation (aujourd'hui : ↻ ou réouverture).
> Voir aussi : [anon.md](anon.md) (modèle de données), [plan_collab_pseudo.md](plan_collab_pseudo.md)
> (cohérence distribuée — point de jonction sur le cache de `nbNon`).

---

## 1. Idée

Ajouter en haut de la page Pseudos (overlay `#divAnonGenPage`, zone gauche) une **selectbox**
filtrant les lignes de la table, complétée d'une **recherche texte**. Objectif : passer d'une liste
brute à des vues orientées tâche (« ce qu'il me reste à traiter », « les conflits à arbitrer »…).

---

## 2. Deux familles de filtres (selon le coût)

| Famille | Calcul | Coût |
|---|---|---|
| **Instantanée** | depuis la table de règles seule (entité, pseudo, source) | quasi gratuit, aucun scan |
| **État** | nécessite la répartition anonymisé / exception / **non traité** par entretien → **vérification** (scan du texte) | coûteux (voir §4) |

La vérification est aujourd'hui **paresseuse** (par entité, au clic 🔍 d'une ligne). Filtrer toute la
liste par un critère d'état impose de **vérifier toutes les paires** — ce que faisait
`demarrerVerificationGlobale` (retirée au nettoyage car alors sans appelant ; redeviendrait
pertinente ici).

---

## 3. Catalogue de filtres

### Famille 1 — instantanés (depuis les règles seules)

| Filtre | Intérêt utilisateur |
|---|---|
| **Toutes les entités** | défaut |
| **Conflits de pseudo** (même entité → pseudos différents) | **arbitrage** : deux users ont nommé « Lyon » différemment (P4 du plan collab) |
| **Collisions de pseudo** (même pseudo → entités différentes) | **danger** : deux personnes distinctes mappées sur `PERSONNE_1` → confusion / fuite |
| **Propositions en attente** (`source: 'Global'`, non validées localement) | « ce que le corpus me suggère et que je n'ai pas traité » |
| **Règles orphelines** (`occurrences === 0` après détection) | pseudo défini mais entité absente → faute de frappe / règle morte à nettoyer |
| **Par source** (créées ici / venues du global / importées) | traçabilité |

### Famille 2 — nécessitent une vérification (scan)

| Filtre | Intérêt |
|---|---|
| **À traiter** (≥1 occurrence non traitée quelque part) | **le travail restant** — sans doute le plus utile au quotidien |
| **Avec exceptions** (≥1 occurrence laissée en clair volontairement) | **audit** : vérifier que les « laissé en clair » sont justifiés |
| **Entièrement anonymisées** (0 non-traité, 0 exception partout) | entités « bouclées », à masquer pour se concentrer sur le reste |
| **Partiellement traitées** (mélange anonymisé + non traité) | incohérences : même entité masquée ici mais pas là |

### Transverses (cumulables avec la selectbox)

- **Portée** : présente dans **plusieurs entretiens** vs **un seul** (les entités transverses sont les plus sensibles).
- **Recherche texte** (sous-chaîne entité/pseudo) — complément indispensable.
- **Tri** : par nb d'occurrences, par nb d'entretiens, alphabétique.

---

## 4. Le point dur : coût des compteurs nbAnon / nbExc / nbNon

Distinction **état matérialisé** vs **espace négatif** :

| Compteur | Dans le texte | Comment on l'obtient |
|---|---|---|
| **nbAnon** | span **marqué** `[data-pseudo="X"].debsel` | sélecteur CSS ciblé → lecture directe (peu de spans) |
| **nbExc** | span **marqué** `.anon-exception` | query ciblée sur les rares spans d'exception |
| **nbNon** | **texte brut sans marqueur** | **scan intégral** du texte + matching, puis retrait des marqués |

- **nbAnon / nbExc** sont *matérialisés* (un span existe) → comptables directement, et **maintenables
  incrémentalement** (delta connu à chaque anonymisation / exception) → **persistables** dans le `.crp`,
  toujours frais.
- **nbNon** est l'*espace négatif* : aucune marque, donc on ne le trouve qu'en scannant tout ; et
  prouver `nbNon === 0` (« bouclée ») exige de **prouver une absence** → scan obligatoire.

> Implémentation actuelle : [`trouverOccurrencesAvecContexte`](modules/Anonymisation/tableau_global.js#L737)
> calcule les trois via le **même** scan complet. nbAnon/nbExc *pourraient* être des `querySelectorAll`
> ciblés ; nbNon, non.

### Conséquence sur l'idée de compteurs persistés
- **nbAnon / nbExc** : cachables de façon fiable (toujours frais).
- **nbNon** : **se périme dès qu'une règle change**, pas seulement quand l'entretien change — ajouter
  « Lyon » crée des non-traités dans tous les entretiens contenant « Lyon » *sans les éditer*. Un nbNon
  en cache devrait être invalidé à chaque évolution du jeu de règles global → **se rebranche
  directement sur le problème de propagation collab** (cf. [plan_collab_pseudo.md](plan_collab_pseudo.md)).
  C'est le seul des trois non cachable simplement.

### Atténuation : scan « passe unique »
Le coût de nbNon à l'échelle du corpus n'est pas O(entités × texte) mais peut tomber à
**O(texte + entités)** via la logique de
[`detecterOccurrencesToutesLesPaires`](modules/Anonymisation/tableau_base.js#L184) (un `Set` des mots
présents par entretien) :
1. par entretien, **une** tokenisation → `Set` des mots présents ;
2. ce `Set` sert de **pré-filtre** : les entités absentes de l'entretien sont éliminées instantanément ;
3. seules les entités présentes nécessitent l'énumération détaillée (classer anon / exc / non).

La plupart des entités étant absentes de la plupart des entretiens, le pré-filtre absorbe l'essentiel
du coût → un « vérifier tout le corpus » (avec barre de progression) devient acceptable.

---

## 5. Recommandation (phasage)

- **Phase 1 — gratuit, fort impact** : selectbox avec **Toutes / Conflits de pseudo / Collisions de
  pseudo / Propositions en attente / Orphelines** + **recherche texte**. Zéro scan ; les *conflits*
  alimentent directement l'arbitrage P4 du plan collab.
- **Phase 2 — filtres d'état** (À traiter / Avec exceptions / Bouclées) : réintroduire un **scan
  global à la demande** (déclenché seulement au choix d'un filtre « état »), optimisé par la passe
  unique du §4. Éventuellement persister **nbAnon/nbExc** ; laisser **nbNon** en calcul à la demande.

---

## 6. Points d'implémentation (à préciser au moment du dev)
- UI : insérer la selectbox + champ recherche dans l'en-tête de
  [`affichAnonGen`](modules/Anonymisation/tableau_global.js) (zone `#fond_anon_corpus`, à côté des
  boutons ➕ 💾 ✖️).
- Filtrage Famille 1 : opère sur `window.electronAPI.getAnon()` (table en mémoire) — masquer/montrer
  les `tr.ligne-anon-gen` selon le critère.
- Détection conflits/collisions : index par `entité` et par `pseudo` sur la table globale.
- Filtrage Famille 2 : déclenche le scan global (réintroduire l'équivalent de
  `demarrerVerificationGlobale`, branché sur la passe unique), puis filtre sur les compteurs obtenus.
