# Plan — Tutoriel « Pseudonymisation pendant la correction » (corpus fictif)

> Plan de travail. Objectif : un mini-corpus fictif (3–4 entretiens **courts**, ~réalistes) servant
> de tutoriel pas-à-pas pour illustrer **toutes** les fonctionnalités de pseudonymisation de SonalPi,
> dans le geste réel du sociologue : **corriger une transcription IA puis pseudonymiser**.
>
> ⚠️ **Dépendance** : ce plan attend le **corpus test réel** que l'utilisateur va fournir, pour
> calquer la **vraie structure de données** (`.crp` JSON / `.sonal`, segments, `tabEnt`, `tabAnon`…)
> au lieu de la deviner — et pour **vérifier au passage** l'export corpus anonymisé (`.crp` réouvrable)
> et l'export HTML de partage.

---

## 1. Principe directeur

Le tutoriel raconte un **workflow** crédible, pas une liste de boutons :
1. Le sociologue reçoit une **transcription IA brute** (fautes, hésitations, **hallucinations =
   répétitions**).
2. Il **corrige** le texte (segmentation/relecture).
3. Il **pseudonymise** au fil de la correction, en choisissant la **portée** (brouillon / document /
   corpus) selon que l'information est locale ou partagée entre entretiens.
4. Il gère les **cas particuliers** (longs passages, alias, multi-pseudo, incluses, exceptions).
5. Il **exporte** (corpus anonymisé réouvrable, et/ou HTML de partage).

Chaque fonctionnalité est introduite **quand le besoin apparaît naturellement** dans un entretien.

---

## 2. Le corpus fictif (proposition — à valider)

**Thème proposé** : enquête sociologique sur le **bénévolat dans une association de quartier**
(« la Maison des Habitants ») d'une ville moyenne. Registre oral, entretiens semi-directifs.

Ce thème donne **naturellement** les ingrédients nécessaires :
- des **entités partagées** entre entretiens (l'association, le quartier, la ville, **la directrice**)
  → règles **corpus** + **🔒 verrou** ;
- des **personnes locales** à un seul entretien → règles **document** ;
- un **lieu contenant un prénom** (pour les **incluses**) ;
- une personne **désignée de plusieurs façons** (pour les **alias**) ;
- un lieu/terme justifiant **deux pseudos** stylistiques (pour le **multi-pseudo**).

### Personnages / entités (à figer avec le corpus réel)

| Entité (fictive) | Type | Apparaît dans | Sert à illustrer |
|---|---|---|---|
| « Maison des Habitants » (l'asso) | institution | tous | **corpus** + 🔒 partagé |
| la ville / le quartier | lieu | plusieurs | **corpus** + 🔒 |
| Mme Royer / Christine / « la directrice » | personne | plusieurs | **double alias** (1 règle, plusieurs graphies) |
| un·e enquêté·e local·e | personne | 1 seul | **document** |
| « résidence Sainte-Anne » + « Anne » (enquêtée) | lieu ⊃ prénom | 1–2 | **incluses** (le large absorbe l'étroit) |
| la grande ville voisine | lieu | 2 | **multi-pseudo** (« la métropole » / « [grande ville] ») |
| bloc « nom + adresse + employeur + proche » dit d'un trait | données en rafale | 1 | **long passage** |
| un terme générique sur-capté (ex. un prénom très courant) | — | 1 | **exception** (garder en clair une occurrence) |

> 🎯 **Contrainte de conception** : les entités partagées doivent réapparaître **à l'identique** dans
> ≥2 entretiens pour que le **corpus** et le **🔒** aient du sens ; et il faut au moins un entretien où
> une règle corpus est **« à anonymiser »** (pas encore appliquée) pour illustrer le vert/orange.

---

## 3. Forme « sortie de transcription IA » (artefacts à injecter)

Pour rester réaliste **sans gêner** la lecture, doser léger et **localisé** :
- **Tournures malmenées** : oral non lissé, « euh », « enfin voilà », faux départs, accord
  approximatif, homophones (`ces/ses`, `a/à`, `et/est`) — quelques-uns par entretien.
- **1–2 hallucinations = répétitions** : un fragment de phrase **dupliqué quasi à l'identique**
  (typique des LLM de transcription) → l'utilisateur le **repère et le supprime** à la correction.
- (Option) **une erreur d'attribution de locuteur** à corriger.

> Chaque artefact est **intentionnel et noté** dans le script du tutoriel (ce qu'on corrige, comment,
> pourquoi) — surtout l'hallucination, car **supprimer du texte interagit avec le marquage** (cf. §6).

---

## 4. Cartographie fonctionnalités → moments du tutoriel

| Fonctionnalité | Où / comment l'illustrer |
|---|---|
| Pseudonymiser une occurrence | sélection 2 clics → saisir pseudo → **Entrée = document** |
| Portée **corpus** | **Shift+Entrée** sur une entité partagée ; ré-apparition dans un autre entretien |
| **Slider** B/D/C + typo (gras=corpus, italique=brouillon, vert=traité) | déplacer la portée d'une règle ; montrer le **🔒** sur une entité déjà traitée ailleurs |
| **Brouillon** + **loupe** ◄ i/N ► | saisir une règle sans l'appliquer, **repérer** ses occurrences sans marquer |
| **Long passage** | sélectionner le bloc « nom+adresse+employeur » d'un trait ; affichage tronqué « 6 mots […] 6 mots » |
| **Double alias** | une règle « Royer/Christine » couvrant les graphies de la directrice |
| **Double pseudo** | création explicite (« a/b » ou dialogue « garder les deux ») ; **choix par occurrence** |
| **Incluses** | poser « résidence Sainte-Anne » puis « Anne » (ou l'inverse) → absorption + exposant/tooltip |
| **Exception** | garder une occurrence en clair ; **↩ Remettre en à anonymiser** pour revenir |
| **Conflit corpus** | saisir un pseudo divergent d'une règle corpus existante → dialogue aligner / garder les deux |
| **Import/export table de correspondance** | entretien (📥/📤) et corpus (Import/Export règles) |
| **Export corpus anonymisé réouvrable** (📦) + **HTML partage** (📄) | étape finale ; **rouvrir le `.crp`** pour vérifier |

---

## 5. Déroulé pédagogique (4 entretiens, 2 structures, 1 ville)

Découpage retenu : **1 enquête à Villebourg, 2 structures de quartier** (2 enquêté·es chacune), pour
plus de réalisme et moins de ré-identification. Le tutoriel **guide** les 2 entretiens de la 1ʳᵉ
structure ; les 2 autres sont laissés **bruts** (entraînement libre, **sans corrigé**). Une entité est
globale aux 4 (la ville, `Villebourg`) ; chaque structure/quartier/directeur·rice est corpus **mais
local à sa paire** (0 occurrence dans l'autre paire → illustre que « corpus » ne s'applique que là où
l'entité apparaît).

**Structure A — guidée (Maison des Habitants, les Tilleuls)**
- **Entretien 1 — Fatima (bases + incluses)** : corrections (homophones, 2 répétitions hallucinées,
  erreur de locuteur) → **document** (le fils Lucas/Lukas + scan) → **corpus** (asso, ville, quartier)
  → slider/typo → **brouillon+loupe** (Mme Royer) → **incluses** (résidence Sainte-Anne ⊃ Anne) →
  scan entretien.
- **Entretien 2 — Gérard (partagé + cas pointus)** : **🔒 verrou** + vert/orange → **alias**
  (Mme Royer/Christine) → **conflit corpus** (aligner) → **long passage** (Jacqueline Mercier…Patrick)
  → **multi-pseudo** (Lyon, « garder les deux ») → **exception** (Olivier vs « un olivier »).

**Structure B — entraînement brut (Centre social des Glycines, Bellevue)**
- **Entretien 3 — Latifa** : miroir de E1 (bases + incluses : résidence Saint-Michel ⊃ Michel ;
  document Inès/Innès ; brouillon directeur M. Faure).
- **Entretien 4 — Bernard** : miroir de E2 (verrou, alias M. Faure/Daniel, conflit, long passage,
  multi-pseudo Marseille, exception Rose/« une rose »).

**Étape finale (sur tout le corpus)** : import/export table de correspondance, **export corpus
anonymisé** (📦) + **HTML** (📄), et **réouverture** pour contrôle.

---

## 6. ⚠️ Points de vigilance (le cœur de la demande)

1. **Corriger AVANT de pseudonymiser.** Éditer le texte (supprimer une hallucination, fusionner des
   segments) **après** avoir marqué déplace les indices de spans (`matchPositions`) → marquage
   potentiellement décalé. **Recommandation du tuto : nettoyer le texte d'abord, pseudonymiser
   ensuite.** ⬜ À **tester** sur le corpus réel : que se passe-t-il si on édite après marquage ?
   (le documenter franchement, c'est pédagogique).
2. **Tout appliquer avant d'exporter anonymisé.** L'export (corpus `.crp` et HTML) n'anonymise que ce
   qui est **effectivement marqué** : une règle « à anonymiser » (orange) laisse le nom **en clair**.
   → Le tuto montre **le panneau Pseudos tout vert** comme condition d'un export sûr.
3. **Portée = décision explicite.** Bien distinguer **document** (local, ne remonte pas au corpus) de
   **corpus** (partagé, verrouillé si utilisé ailleurs). Montrer pourquoi on **ne peut pas** réduire
   une règle corpus utilisée dans plusieurs entretiens (🔒) sans la ramener à un seul.
4. **Longs passages** : la sélection se fait en **2 clics** (début/fin) ; l'affichage **tronque**
   (« 6 mots […] 6 mots ») mais le **texte complet est conservé** (révélé au focus). Insister :
   **ne pas éditer le placeholder « … […] … »** (le focus montre le vrai texte).
5. **Double alias ≠ double pseudo.** Alias = plusieurs **graphies d'entité → un pseudo** (champ entité
   « A/B »). Multi-pseudo = **une entité → deux pseudos** choisis **par occurrence** (création
   explicite). Ne pas les confondre dans le tuto.
6. **Multi-pseudo : confiné à l'entretien.** Le choix par occurrence se fait **côté entretien** ; au
   **corpus** c'est de la donnée **lecture seule** (affichage « a/b », pas d'application en masse).
7. **Incluses = lecture seule.** Quand le large absorbe l'étroit, l'occurrence interne n'est **pas**
   re-pseudonymisable seule (signalée par l'exposant + tooltip). Montrer les **deux ordres** de pose
   (large puis étroit / étroit puis large) — le résultat converge.
8. **Conflits corpus** : si une entité a déjà un pseudo au corpus, **toujours** passer par le dialogue
   (aligner / garder les deux) ; jamais de divergence silencieuse. Montrer le cas « garder les deux ».
9. **Exceptions** : pour garder une occurrence **en clair** (terme non identifiant capté par une
   règle). Montrer aussi **↩ Remettre en à anonymiser** pour défaire une occurrence et pouvoir
   supprimer une ligne.
10. **Vérifier l'export** (objectif secondaire du projet) : **rouvrir le `.crp` anonymisé** exporté →
    il doit s'ouvrir, **aucun nom d'origine** ne doit subsister, **aucune règle** ne doit rester.
    Idem l'HTML de partage (lisible, anonymisé). ⬜ C'est aussi le **test grandeur nature** des deux
    exports récemment écrits (hypothèses de format `.crp` à confirmer).

---

## 7. Dépendance au corpus test réel + ce que je vérifierai avec

Quand tu me fournis le corpus test (`.crp` + éventuels `.sonal`), je pourrai :
- **calquer la vraie structure** (`tabEnt[i].html`, segments `data-rk`/`data-sg`, `tabAnon`,
  encodage des backticks…) pour écrire des entretiens **directement injectables** ;
- **confirmer les hypothèses** de l'export (`exporterCorpusReouvrable` : format `.crp` JSON, HTML dans
  `tabEnt[i].html`) et corriger si l'encodage diffère ;
- valider que **multi-pseudo / longs passages / incluses** s'exportent correctement (un `[pseudo]`
  par run, variante alt sur la bonne occurrence, incluse couverte par le run large).

---

## 8. Livrables envisagés

- `tutoriel.md` (ou intégré à l'aide in-app) : le **script pas-à-pas** (captures/étapes), structuré
  par entretien et par fonctionnalité, avec les **points de vigilance** en encarts.
- Les **3–4 entretiens fictifs** au format attendu par SonalPi (à partir du corpus test).
- (Option) un **corpus de départ** « brut IA » + un **corpus d'arrivée** « corrigé + pseudonymisé »
  pour comparaison.

---

## 9. À confirmer avant rédaction

- ✅ **Thème** : bénévolat associatif à Villebourg, 2 structures de quartier.
- ✅ **Nombre d'entretiens** : **4** — 2 guidés (Maison des Habitants) + 2 entraînement brut sans
  corrigé (Centre social des Glycines).
- ⬜ **Longueur** cible par entretien (ex. 20–40 répliques courtes ?).
- ⬜ **Langue/registre** : oral familier marqué, ou oral « propre » ?
- ⬜ **Format de livraison** du corpus test (fichier `.crp` à déposer où ?).
- ⬜ **Intégration** : tutoriel autonome (`.md`) ou branché dans l'aide de l'app (`anon-help.js`) ?
