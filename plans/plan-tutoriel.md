# Plan — Corpus de démonstration & parcours guidé

> Objectif : qu'un nouvel utilisateur comprenne **où il est** et **ce que Sonal sait faire**
> en manipulant un vrai corpus, sans risque pour ses données. Deux livrables :
> un **corpus de démonstration** (accès libre) et un **parcours guidé**.

## 1. Principes

- **La démo est une copie jetable.** Le corpus de démonstration embarqué dans l'app est
  copié dans `<profil>/corpus-demo` à l'installation ; l'utilisateur peut tout casser,
  « Réinitialiser la démo » = recopier. Aucune donnée réelle en jeu.
- **Contenu 100 % fictif et dit comme tel.** Les entretiens sont synthétiques (personnages
  inventés, voix générées) ; la démo l'affiche explicitement (bandeau ou premier écran du
  parcours) pour qu'aucun extrait ne puisse passer pour un témoignage réel.
- **Le parcours guidé n'instrumente pas les vues.** Il observe le modèle réactif
  (composables D-S12) pour valider les étapes, et cible les éléments d'interface par des
  attributs `data-tour` dédiés.

## 2. Le corpus de démonstration : « Aider les devoirs en association »

Un mini-terrain qualitatif crédible, choisi pour exercer TOUTES les fonctionnalités :
récits riches à coder, plusieurs locuteurs, profils sociologiques variés, trois
associations différentes (enquête SHS sur le bénévolat d'aide aux devoirs).

### 2.1 Les trois entretiens (personnages fictifs)

Mise en cadre : une enquête SHS sur le bénévolat d'aide aux devoirs, menée dans
trois associations différentes — un centre de quartier à inspiration chrétienne, une
bibliothèque municipale, une asso étudiante de soutien scolaire ; trois villes, trois
façons d'entrer dans le bénévolat.

Trois profils, trois trajectoires (le fichier `corpus/txt/E1.txt` fait office de
référence de ton, de rythme et de trame interrogative) :

- **Sylvie** (58 ans, ancienne cadre en retraite anticipée, « Le Relais Sainte-Claire »
  à Villebourg) : a lu une annonce dans le journal. L'engagement prend sens dans sa
  foi chrétienne, mais c'est difficile avec les enfants. Elle regrette le manque de
  soutien des autres bénévoles.
- **Marc** (46 ans, cuisinier, « La Halle aux Savoirs » à Valmont) : a toujours
  regretté de ne pas avoir fait plus d'études, et a envie d'aider les autres. A pris
  contact avec l'association suite à un post sur les réseaux sociaux. Peur au début de
  ne pas arriver à aider, puis satisfaction de s'être aperçu que si — au point de se
  poser la question de reprendre lui-même des études aujourd'hui.
- **Thomas** (21 ans, étudiant qui prépare le concours professeur des écoles,
  « La Passerelle » à Séran) : est venu seulement quelques fois car il a un job en
  parallèle. Mis en contact avec l'association par Yanis, un autre étudiant bénévole
  (ce dernier est présent pendant l'entretien → 3 locuteurs). Aime bien : ça change
  des cours et de la théorie, et il veut valoriser cette expérience au concours —
  mais son implication reste très occasionnelle.

| # | Titre | Locuteurs | Ce que ça démontre |
|---|-------|-----------|--------------------|
| E2 | « Sylvie, l'annonce dans le journal » | Enquêteur·rice + Sylvie (58 ans, ancienne cadre) | Récit long, émotion, sens, regret — matière à codage fin |
| E3 | « Marc, du four à la craie » | Enquêteur·rice + Marc (46 ans, cuisinier) | Arc de transformation (peur → confiance → projet d'études) ; PCS ouvrière |
| E4 | « Thomas & Yanis, l'aide aux devoirs à deux voix » | Enquêteur·rice + Thomas (21 ans, étudiant en prépa concours) + Yanis (22 ans, étudiant bénévole) | **3 locuteurs** : attribution des tours, variables par locuteur ; désaccord sur la valeur d'un engagement « à la carte » |

Calibrage : 10–14 tours de parole par entretien, 400–600 mots (≈ 3–4 min d'audio TTS).
Chaque entretien contient au moins : un passage émouvant, un passage technique
(déroulement concret d'une séance), un désaccord ou une nuance (E3 : Thomas et Yanis
n'ont pas la même lecture d'un engagement occasionnel — parfait pour montrer le
codage par locuteur et les valeurs divergentes).

### 2.2 Codebook (thèmes) possible, avec hiérarchie

- **Recrutement & premiers pas** (parent) → « l'annonce, le post, le bouche-à-oreille », « le premier contact »
- **Sens & motivations** (parent) → « sens de l'utilité », « foi et valeurs », « la dette envers l'école »
- **Pratique & savoir-faire** → « déroulement d'une séance », « trouver sa méthode »
- **Vie collective & soutien** (parent) → « ambiance entre bénévoles », « manque de bénévoles / de soutien »
- **Difficultés & doutes** (parent) → « peur de ne pas savoir faire », « les tensions avec les enfants »
- **Projets & avenir** → « reprendre des études », « le concours », « la pérennité de l'association »


### 2.3 Variables livrées pré-remplies — une de chaque espèce

| Variable | Portée | Modalités | Rôle démo |
|----------|--------|-----------|-----------|
| Sexe | locuteur | modèle « Sexe » | modèles pré-remplis |
| Âge | locuteur | modèle « Age en classes de 10 » | modèles pré-remplis |
| PCS | locuteur | modèle « PCS Niveau 1 » | modèles pré-remplis |
| Ville | locuteur | **aucune** → saisie libre | champ texte libre + « autre… » |
| Association | entretien | « Le Relais Sainte-Claire » / « La Halle aux Savoirs » / « La Passerelle » | variable d'entretien, cœur de l'enquête SHS |
| Contexte | entretien | salle de l'asso / domicile / visio | variable d'entretien |
| Note de terrain | entretien | aucune (texte libre) + **privée** 🔒 | statut privé (exclue des exports) |

Valeurs posées partout SAUF quelques trous volontaires 

## 3. Production des textes (dans le dépôt)

- Dossier `demo/scripts/` : un fichier par entretien, format source minimal lisible :

Production en passant par Text To Speech puis SpeechToText
Deux conséquences ASSUMÉES de ce choix :

- **Le texte du corpus est la transcription, pas le script d'auteur.** Il portera les
  imperfections de l'ASR — c'est un avantage pédagogique : la démo ressemble
  exactement à ce qu'un utilisateur de Sonal manipule en vrai (transcription auto à
  reprendre), et « corriger le texte » peut même devenir une étape du parcours guidé.
- **La diarisation étiquette les locuteurs de façon anonyme** (`SPEAKER_00`,
  `SPEAKER_01`…) : il reste un mapping étiquette → personnage à poser dans le
  générateur §5 (trivial : l'ordre de première prise de parole est connu par le
  script source, et une vérification manuelle sur 3 entretiens courts suffit).
  Pour E3, on peut volontairement livrer l'attribution incomplète (un des deux
  étudiants non mappé) puisque c'est un exercice du parcours guidé.

## 5. Fabrication du dossier corpus (fixture)

Un script node `demo/generer.mts` (lancé à la main, résultat versionné OU exécuté au
build) fabrique `demo/corpus/` :

- consomme les `*.srt` de §4 → `corpsTexte` ProseMirror (un bloc par
  segment) + `ancres` (position PM du début de segment × temps transcrit), en
  réutilisant les fonctions de `shared/` (mêmes chemins de code que l'app, zéro
  format parallèle) ;
- attribue les locuteurs depuis les étiquettes de diarisation du SRT, via le
  mapping étiquette → personnage (§4) ;
- pose codebook, variables (§2.2, §2.3), codages pré-existants et valeurs EAV — les
  codages se posent sur le TRANSCRIT (repérage par mots-clés des passages visés,
  puisque le texte exact n'est connu qu'après transcription) ;
- copie les `.mp3` dans `demo/corpus/audio/` et pose les `audioRef`.

Alternative sans script : fabriquer le corpus À LA MAIN dans l'app puis copier le
dossier obtenu dans `demo/corpus/`. Plus rapide au premier coup, mais non régénérable
quand les textes ou le format évoluent — à réserver à un prototype du contenu.

## 6. Intégration dans l'app

- **IPC** `demo:installer` : copie `demo/corpus/` (ressources de l'app — attention au
  packaging : `extraResources` electron-builder, pas dans l'asar) vers
  `<profil>/corpus-demo`, puis réutilise le chemin existant `ouvrirDossier`.
  `demo:reinitialiser` = recopier par-dessus.
- **Accueil** : carte « 🎓 Découvrir avec le corpus de démonstration ». C'est aussi le
  bon moment pour traiter la question « Corpus courant » du premier lancement : état
  d'accueil dédié quand (dossier courant = défaut ∧ membership vide ∧ aucun récent) →
  deux actions : « Créer mon premier corpus » / « Essayer la démo ».
- Un test e2e Playwright ouvre la démo et vérifie les invariants (3 entretiens, thèmes,
  variables, audio lié) — garde-fou contre la dérive fixture/format.

## 7. Le parcours guidé

### Phase A — visite passive (livrable seul)

- `composables/tutoriel.ts` : liste d'étapes `{ id, ecran, cible, titre, texte }` +
  index courant ; pilote la navigation via le `vue` ref existant.
- `components/Tutoriel.vue` monté dans App : voile + « projecteur » sur l'élément
  `[data-tour=…]` (getBoundingClientRect), bulle, boutons ← → et « quitter ».
- Attributs `data-tour` posés sur ~10 éléments (bouton ajout d'entretien, crayon
  thèmes, crayon variables, filtre de portée, lecteur audio…).

### Phase B — étapes auto-validées (incrémental sur A)

Chaque étape gagne un prédicat `fait(): boolean` observé par `watch` sur le modèle —
l'étape se coche toute seule quand l'utilisateur a réellement fait l'action. Exemples :

| Étape (dans la démo) | Prédicat observé |
|----------------------|------------------|
| « Ouvre l'entretien de Thomas & Yanis » | `ouvertId === <id E3>` |
| « Attribue ce tour à Thomas » | tour N de E3 attribué |
| « Code ce passage avec “Sens & motivations” » | une annotation `codage` de ce code apparaît sur E3 |
| « Renomme le locuteur » | `locuteurs[1].nom !== 'Thomas'` |
| « Remplis la ville en texte libre » | `valeursLoc` de Thomas contient la variable Ville |
| « Passe le filtre sur “locuteurs” » | (étape UI pure — reste un « suivant » manuel) |
| « Écoute depuis un clic dans le texte » | `audio.position > 0` |

Ordre du parcours : Accueil → Corpus (cartes, résumé thématique) → Entretien E3
(locuteurs → codage → audio) → fenêtre thèmes → Table de données (variables, saisie
libre, filtres) → export `.sonal`.

## 8. Jalons

1. **J1 — contenu** : scripts des 3 entretiens (§3) + codebook/variables sur papier. ← le vrai travail
2. **J2 — audio & transcription** : VoiceBox + assemblage + transcription automatisée (§4, hors dépôt).
3. **J3 — fixture** : `demo/generer.mts` + `demo/corpus/` + test e2e (§5).
4. **J4 — accès libre** : IPC + carte Accueil + état premier lancement (§6). *Livrable utilisateur n°1.*
5. **J5 — visite passive** (§7 A). *Livrable n°2.*
6. **J6 — auto-validation** étape par étape (§7 B), en commençant par les 3 plus parlantes
   (attribuer, coder, saisie libre).

## 9. Risques & garde-fous

- **Dérive tutoriel/UI** : un `data-tour` supprimé casse silencieusement une étape → test
  unitaire qui vérifie que chaque `cible` du tutoriel existe dans les templates.
- **Dérive fixture/format** : `formatVersion` bouge → la fixture régénérable (§5) +
  le test e2e (§6) absorbent le choc ; c'est l'argument décisif pour le script contre
  le corpus fait main.
- **Poids de l'app** : 3 × 3–4 min de mp3 mono ≈ 6–9 Mo — acceptable ; sinon qualité
  TTS réduite ou 2 entretiens audio sur 3 (E1 sans audio montre aussi ce cas réel).
- **Contenu pris pour vrai** : mention « personnages et voix synthétiques » affichée
  dans la démo elle-même (pas seulement dans la doc).

---

## 10. Mise à jour — CorpusTest est livré (4 entretiens)

Le dépôt contient désormais `CorpusTest/` (hors `src/`, à copier en ressources au
build) :

```
CorpusTest/
  srt/   E1.srt E2.srt E3.srt E4.srt
  audio/ E1.mp3 E2.mp3 E3.mp3 E4.mp3
```

Conséquence : §3 (production TTS→STT) et §4 (transcription) sont **faits** — les
sources existent. Et **E1 n'est plus seulement une « référence de ton »** (§2.1) :
c'est un 4ᵉ entretien à part entière (Fatima). Le mini-terrain passe donc à
**4 entretiens**. Les étiquettes de diarisation sont cohérentes sur les 4 fichiers
(`Speaker 1` = enquêteur·rice, `Speaker 0` = personne interviewée ; `Speaker 2` =
Yanis dans E4) → le mapping étiquette→personnage (§4) est trivial et uniforme.

| # | Titre proposé | Locuteurs | Association / lieu | Particularité pour la démo |
|---|---|---|---|---|
| E1 | « Fatima, du quartier à la coordination » | Enquêteur·rice + Fatima | Maison des Habitants, Villebourg | 2 locuteurs ; bonne entrée (parcours simple) |
| E2 | « Sylvie, l'annonce dans le journal » | Enquêteur·rice + Sylvie | Le Relais Sainte-Claire, Villebourg | 2 locuteurs ; récit émotionnel |
| E3 | « Marc, du four à la craie » | Enquêteur·rice + Marc | La Halle aux Savoirs, Valmont | 2 locuteurs ; arc peur→confiance |
| E4 | « Thomas & Yanis, l'aide à deux voix » | Enquêteur·rice + Thomas + Yanis | La Passerelle, Séran | **3 locuteurs** ; désaccord de diarisation (seg. 50-52 attribué à Thomas alors que le contexte le donne à Yanis) |

**Imperfections ASR assumées** (matière première de l'étape « Corriger à l'aide de
l'audio ») : E1 traîne une salve de « Merci à tous » répétés (seg. 88-100) ; E2
répète « je suis heureuse » (seg. 65-68) ; E3 lit « assaut » pour « asso » et
laisse une question sans réponse (seg. 41) ; E4 casse la casse (« la passerelle »)
et contient la confusion de locuteur ci-dessus. Rien à corriger dans les sources :
ce sont les imperfections réelles qu'un utilisateur de Sonal retrouve dans toute
transcription auto.

## 11. L'Accueil : une ligne « Mini Corpus Test » + deux modes

> Cette section **fait évoluer §6** (« Accueil : carte 🎓 Découvrir… ») et §7 (le
> parcours guidé). Le principe §1 est conservé : la démo reste une **copie
> jetable** dans un vrai dossier de corpus, le parcours **n'instrumente pas les
> vues** (il observe le modèle réactif + cible l'UI par `data-tour`).

### 11.1 Disposition

`[Accueil.vue](../src/renderer/components/Accueil.vue)` gagne une **première
ligne** au-dessus des cartes existantes :

```
┌──────────── Mini Corpus Test ────────────┐
│  ┌─ Découverte pas à pas ─┐ ┌─ En autonomie ─┐
│  │  guidée, étape par     │ │  tout le corpus │
│  │  étape                 │ │  d'un coup      │
│  └────────────────────────┘ └────────────────┘
└──────────────────────────────────────────┘
➕ Ouvrir un corpus…
Récents …
```

Deux **cartes côte à côte** sous un même titre. À côté, « Ouvrir un corpus… »
(garder le choix explicite d'un dossier) et la liste « Récents ».

> **Plus de carte « Corpus courant ».** Au démarrage, l'app charge le **1er
> récent** (le dernier corpus ouvert) ; s'il n'y en a aucun (premier lancement),
> le modèle reste vide et l'utilisateur choisit explicitement. Par construction
> le corpus chargé est **toujours le 1er récent** — un clic sur celui-ci y
> revient. La liste « Récents » garde jusqu'à 8 corpus (le plus ancien reste
> tant qu'on ne dépasse pas 8), donc l'historique est préservé.

### 11.2 Le choix retenu (le plus simple et le plus cohérent)

> **Recommandation.** Les **deux modes** passent par le **même mécanisme** :
> l'utilisateur **choisit un dossier**, l'app **construit le corpus de démo
> dedans** depuis les sources `CorpusTest/`, puis l'ouvre. Ce n'est pas un 3ᵉ type
> de corpus parallèle : c'est le chemin normal (`choisirDossier` →
> `appliquerCorpus`), alimenté par un *builder* de démo.

Pourquoi c'est le plus simple ET le plus adapté :

- **Un dossier = un corpus** est la règle de l'app (§6, `corpusStore`). La garder
  pour la démo évite un 4ᵉ type de stockage (pas de corpus « en mémoire », pas de
  dossier caché magique) — or un stockage parallèle serait coûteux : l'import, le
  codage, l'audio, la forme d'onde écrivent **tous** sur disque via IPC ; les
  réinventer en mémoire = une grosse dérive.
- **Le folder-pick convient aux deux modes**, y compris « pas à pas ». La
  spécificité de « pas à pas » n'est **pas** le stockage (toujours un dossier,
  pour les mêmes raisons) : c'est (a) un **état de départ progressif** (un
  entretien, voire aucun) et (b) l'**assistant latéral** (§14). Donc pas besoin
  de « faire autrement » pour le stockage — seulement pour le contenu de départ
  et l'UX d'accompagnement.
- **Le folder-pick donne la propriété du dossier** : l'utilisateur sait où est sa
  démo, peut la détruire lui-même, la rouvrir depuis « Récents ». C'est la « copie
  jetable » de §1, mais à l'endroit choisi par l'utilisateur.
- **Réutiliser le vrai pipeline d'import** (SRT → `importerFichier` →
  `corpus:importer` + `corpus:assignerAudio`) pour *construire* la démo = **zéro
  dérive de format** par construction : la démo est produite par le même code que
  n'importe quel corpus utilisateur. C'est l'argument §9 (« script contre corpus
  fait main ») poussé à bout — il n'y a même plus de script séparé, c'est
  l'importeur lui-même.

### 11.3 Les deux boutons = deux « modes » du même builder

Le builder (`demo:preparer`, §12) prend un `mode` :

| Mode | État de départ posé dans le dossier | Assistant | Arrivée |
|---|---|---|---|
| **En autonomie** | **Les 4 entretiens** importés + audios assignés + codebook & variables pré-remplis | inactif | vue Corpus (libre) |
| **Découverte pas à pas** | **Corpus amorcé vide** (juste le bloc `Pondérations` par défaut) + une variable « Ville » pré-créée (pour l'étape saisie) — les étapes remplissent | **onglet « Pas à pas » + spotlight global** (§14) | vue Corpus + onglet Pas à pas |

Dans les deux cas : (1) l'utilisateur choisit **deux dossiers** (sources à
matérialiser + corpus de travail — modale à deux questions, plan-reference-audio
§7.2), (2) le builder copie les sources puis y pose l'état de départ,
(3) `appliquerCorpus` charge le modèle, (4) atterrissage. La
seule différence est la richesse de l'état initial et la présence de l'onglet +
spotlight.

Le mode « pas à pas » démarre donc sur un corpus **vide** (pas même un
entretien) et laisse chaque étape poser un geste réel (charger, corriger,
coder…) — c'est le parti le plus formateur : l'utilisateur apprend le flux *réel*
de Sonal.

## 12. Le builder de démo `demo:preparer(dossier, mode)`

> Évolue l'IPC `demo:installer`/`demo:reinitialiser` de §6 : au lieu de *copier
> un dossier pré-construit vers `<profil>/corpus-demo`*, on *construit depuis les
> sources vers un dossier choisi*.
>
> **Mise à jour (voir [plan-reference-audio](plan-reference-audio.md) §7)** : le
> builder reçoit **deux** racines choisies par l'utilisateur dans une modale à
> deux questions — le dossier de **travail** du corpus **et** le dossier des
> **sources** de démo, où l'app copie une fois les sources bundled
> (`demo:copierSources`) ; l'audio y est **référencé**, jamais copié dans le
> corpus. Signature : `demo:preparer(dossierCorpus, racineSources, mode)`.
> L'étape 1 du pas-à-pas vise le **vrai** bouton « + Ajouter un entretien »
> (le one-click reste, renommé « Faire à ma place »).

### 12.1 Source unique : `CorpusTest/` en ressources

Les sources ne sont **pas** un corpus Sonal (elles ont `srt/` et `audio/`, pas
`corpus.json` + `entretiens/`). On ne peut donc pas « ouvrir » CorpusTest tel
quel : elles sont l'**amont** du builder.

- **Dev** : `CorpusTest/` est lu depuis le dépôt (chemin relatif au `main`).
- **Prod** : copié dans les ressources via `extraResources` d'electron-builder
  (hors `asar`, comme tout média servi — cf. §6 original sur le packaging).

Nouvelles IPC main (lectures seules — le builder lui-même tourne côté renderer,
parce que l'importeur SRT y vit, avec `DOMParser`) :

```ts
demo:lireSource(rel)    // { nom, contenu } pour un .srt bundled (main lit le fichier)
demo:cheminAudio(rel)   // chemin absolu d'un .mp3 bundled (ex. 'audio/E2.mp3')
```

Le chemin audio absolu renvoyé par `demo:cheminAudio` est passé tel quel à
l'IPC existante `corpus:assignerAudio` (qui copie dans `<corpus>/audio/`).

### 12.2 Orchestration (renderer, `composables/demo.ts`)

> **Mise à jour (J4, plan-reference-audio §7)** : `preparer(mode, opts?)` reçoit
> les **deux** dossiers de la modale (`{ racineSources, dossierCorpus }`), copie
> les sources bundled une fois (`demo:copierSources`, idempotent) puis ouvre le
> dossier de travail via `corpus:ouvrirDossier` (amorce si neuf — équivalent du
> picker sans dialogue). Les sources sont mémorisées en session : une
> re-préparation (bascule pas-à-pas ⇄ autonomie) les réutilise sans 2ᵉ modale.

`preparerDemoCorpus(mode, { racineSources, dossierCorpus })` :

1. `demo:copierSources(racineSources)` — copie récursive `CorpusTest/`
   (`srt/` + `audio/`, ~13 Mo) dans le dossier sources choisi. **LA seule copie**
   du flow de démo ; le corpus RÉFÉRENCE ensuite ces fichiers.
2. `corpus:ouvrirDossier(dossierCorpus)` — amorce `corpus.json` minimal + bloc
   `Pondérations` si neuf ; le `store` main pointe dessus. (Rien à faire de plus
   pour `mode === 'pas-a-pas'` — on s'arrête ici.)
3. **Si `mode === 'autonomie'`** — pour chaque `E1..E4` :
   - `demo:lireSource(racineSources, 'srt/Ek.srt')` → `importerFichier(nom, contenu,
     DOMParser)` → `payload` + `codebook` + `variables` (les SRT nuls ne portent
     **ni** thèmes **ni** variables : `convertSRT` n'embarque que `loc-json`) ;
   - `corpus:importer(titre, payload, codebook, variables)` → `id` ;
   - `corpus:assignerAudio(id, <racineSources>/audio/Ek.mp3)` → **référence**
     (plus de copie, plan-reference-audio §4).
   La forme d'onde est générée en fond par `regenererOndesManquantes` (déjà appelé
   par `appliquerCorpus`).
4. **Codebook & variables** (autonomie) — posés via les IPC existantes
   (`ajouterCategorie`, `ajouterVariable`, `ajouterModalitesModele`…) d'après
   §2.2/§2.3. Codages pré-posés ? **Non en v1** : le codebook est prêt, mais on
   laisse les passages non codés — c'est le propre d'un corpus « à analyser ».
   (Les codages pré-existants de §5 sont reportés à un v2.)
5. `appliquerCorpus(await corpus:ouvrir())` — recharge le modèle sur le dossier
   peuplé.
6. Atterrissage : `vue = 'corpus'` ; sidebar pas-à-pas montée si `pas-a-pas`.

### 12.3 Idempotence & réinitialisation

`demo:preparer` est **idempotent** : re-cliquer sur un mode sur le même dossier =
reconstruire par-dessus (la fusion d'import est idempotente par id ; les audios
sont recopiés). Un bouton « Réinitialiser la démo » (ré-applique le mode courant
sur le dossier courant) couvre le « tout casser » de §1 sans toucher au disque à
la main. **Gardien trivial** : on ne reconstruit jamais sur un dossier qui
contient déjà du contenu non-démo — un marqueur `corpus.json: { demo: true }`
posé à la création (la fusion d'import le préserve).

> **J6 (plan-reference-audio §12.12)** : le marqueur est désormais POSÉ —
> `corpus.json: { demo: { mode, racineSources, validees? } }` — et chaque mode a
> son PROPRE corpus (`<parent>/pas-a-pas`, `<parent>/autonomie`) : la « bascule »
> sur le même dossier est abandonnée, les deux corpus ne se mélangent jamais.

### 12.4 Alternative : corpus pré-construit (écartée en v1)

Construire une fois pour toutes `demo/corpus/` (via un script `demo/generer.mts`
en Node + jsdom, ou en pilotant l'app) et le copier à l'ouverture. **Avantage** :
ouverture instantanée (pas d'import au clic). **Inconvénient** : un second
artefact à maintenir (dérive possible vs l'importeur), et ça ne sert pas le mode
« pas à pas » progressif (il faudrait un dossier partiel supplémentaire). À
garder sous le coude si le coût du build runtime (qqs secondes + formes d'onde)
s'avère gênant — mais c'est le même coût qu'une ouverture de corpus normale.

## 13. Mode « En autonomie »

Le clic → choix du dossier → builder (§12, `mode: 'autonomie'`) → atterrissage en
vue Corpus, **sans sidebar**. L'utilisateur dispose des 4 entretiens avec audio,
d'un codebook et de variables prêts. Il explore librement : ouvrir un entretien,
écouter, coder, remplir la table de données, exporter.

C'est le **livrable utilisateur n°1** de §8 (J4). Le bandeau « personnages et
voix synthétiques » (§9) s'affiche une fois au premier atterrissage de chaque
mode (autonomie comme pas-à-pas).

## 14. Mode « Découverte pas à pas »

> Fait évoluer §7 (parcours guidé). On garde l'idée **d'étapes auto-validées par
> observation du modèle** (§7 B) et les attributs `data-tour` (§7 A). L'UX est un
> **onglet « Pas à pas » dans la vue Corpus** (liste des étapes) + un **spotlight
> global** (projecteur + bulle) téléporté en body — pas de sidebar flottante, et
> **pas d'onglet dans la vue Entretien** : le spotlight suit l'utilisateur partout.

### 14.1 L'onglet `PasAPas.vue` + spotlight global

Deux parties, un seul composant :

- **L'onglet** (liste des étapes, cliquables, cochées quand validées) monté
  dans la colonne gauche de `Corpus.vue` (à côté de « Thèmes »), **uniquement en
  mode pas-à-pas**. Un `ongletCorpus: 'themes' | 'pas-a-pas'` local le pilote,
  basculé sur « Pas à pas » à l'activation du mode.
- **Le spotlight** (projecteur + bulle) **téléporté en `body`** → il survit au
  changement de vue (le `v-show` de Corpus ne masque pas un contenu téléporté).
  C'est ce qui rend inutile un onglet « Pas à pas » dans l'Entretien : le guide
  suit l'utilisateur partout, pointant des éléments ciblés par `data-tour`.

> **Choix d'UX (révision de la 1re proposition).** On n'installe PAS un onglet
> « Pas à pas » dans la vue Entretien : un seul onglet dans Corpus suffit, le
> spotlight global guident dans toutes les vues. Plus simple, moins intrusif.

Chaque étape = `{ id, titre, cible, fait, texte, panneau?, retest? }` :

- **titre** : libellé dans la liste (ex. « Charger un entretien ») ;
- **cible** : fonction renvoyant un sélecteur `data-tour` d'un élément à mettre en
  lumière quand l'étape est active (peut dépendre de l'état — ex. `crayon-entretien`
  tant qu'aucun entretien ouvert, puis `onglet-themes` une fois dedans) ;
- **fait()** : prédicat sur le modèle réactif (cf. §7 B) — l'étape se coche seule ;
- **texte()** : le guide affiché dans la bulle (fonction → peut dépendre de l'état) ;
- **retest?** : message affiché quand l'étape, DÉJÀ validée, est rouverte (re-test)
  — il complète « … tu peux toujours … » (les trois petits points changent donc
  suivant les étapes : « revoir l'entretien importé », « re-écouter l'audio… »,
  « re-renommer les locuteurs… », « ajouter ou retirer des annotations »,
  « modifier ou compléter les valeurs saisies ») ;
- **panneau?** : la consigne s'affiche en **panneau EN BAS de la colonne de
  droite** de l'entretien (sous le panneau de l'onglet actif) plutôt qu'en bulle
  flottante — la bulle positionnée sous le bouton Lecture masquait le texte
  pendant la lecture, et la consigne en HAUT de la colonne poussait le panneau
  (retours utilisateur). Utilisé par les étapes « Écouter et corriger » et
  « Renommer les locuteurs » (la bulle flottante recouvrait aussi le champ du
  2ᵉ locuteur). Dans ce mode, ni voile ni trou : un Teleport cible
  l'ancre `data-tour="ancre-guide-pp"` posée à la FIN de la colonne dans
  `Entretien.vue`. PAS de bouton « action » : l'utilisateur fait le geste
  LUI-MÊME (retour utilisateur — ex. lecture : clic sur ▶ ou double-espace,
  idéalement les deux), la consigne ne fait que le dire. Les onglets de
  l'entretien sont ordonnés Loc → Thèmes → Données → Journal et l'entretien
  s'ouvre sur **Locuteurs par défaut** (on corrige les locuteurs avant de poser
  les thématiques).

L'étape 1 pointe le VRAI bouton « + Ajouter un entretien »
(`cible: () => '[data-tour="ajouter-entretien"]'`) — le geste réel passe par la
vraie modale à deux zones, dont les dialogues natifs s'ouvrent dans
`racineSources` (defaultPath, plan-reference-audio §7.4).

Le déroulé : l'utilisateur clique une étape → la **bulle** montre le guide +
spotlight sur `cible` (projecteur de §7 A réutilisé) → l'utilisateur fait le
geste (dans la vraie UI) → `fait()` passe à
vrai → l'étape se coche et le GUIDAGE S'ARRÊTE (spotlight éteint) : pas
l'enchaînement automatique sur l'étape suivante — l'utilisateur clique lui-même
l'étape suivante dans la liste pour la lancer (retour utilisateur : garder la
main sur le rythme, le passage automatique surprenait). Le `watch` sur
`fait()` coche + mémorise l'historique ET **revient à l'écran Corpus** (la liste
« Pas à pas ») — sinon, après validation, on restait dans l'entretien, la liste
hors d'atteinte (retour utilisateur). Seule exception : l'étape 1, où
l'OUVERTURE automatique de l'entretien par la vraie modale repasse après le
retour → on reste dans l'entretien fraîchement importé. Et si l'étape est DÉJÀ
validée (re-test : l'utilisateur rouvre le crayon pour revoir une étape faite,
ex. les locuteurs déjà renommés), l'entretien S'OUVRE et on y reste — pas de
retour (l'étape ne change pas d'état, sinon l'entretien se serait refermé
aussitôt), le guidage s'éteint et un PETIT MESSAGE s'affiche : « … déjà
réalisée — tu peux toujours … » (`retest()`, le contenu change suivant les
étapes) avec un bouton « Revenir au Pas à pas » qui ramène à la liste.
Le message est déclenché à l'OUVERTURE de l'entretien quand une étape déjà
validée est active — pas seulement par le prédicat : pour « Écouter et
corriger », `texteModifie` repart à FAUX à chaque ouverture, le watch de
validation ne le détecterait pas (pour « Renommer » au contraire, le prédicat
est déjà vrai à l'ouverture).

### 14.2 Séquence d'étapes proposée (sur E1 puis E4)

Démarre sur le corpus vide. **Mise en œuvre actuelle : 5 étapes** (`charger` →
`corriger` → `renommer` → `coder` → `variable`), toutes sur **E1 (Fatima)** —
choisie parce que sa 1re ligne porte une faute d'ASR idéale pour l'étape
« Écouter et corriger » (« Maison des Habitants? ? », le point d'interrogation
doublé en deux segments SRT). L'entretien s'ouvre sur l'onglet **Locuteurs**
(défaut, on corrige les locuteurs avant les thèmes). Les étapes suivantes du
tableau (2ᵉ entretien 3 locuteurs…) restent la vision complète, non encore
implémentée.

| # | Étape | Geste réel | Prédicat `fait()` |
|---|---|---|---|
| 1 | **Charger un entretien** | Importer E1 (SRT + audio). Le spotlight encadre le VRAI bouton « + Ajouter un entretien » ; le texte cite `racineSources` (« tes sources sont dans … ») | `membership` contient un entretien |
| 2 | **Écouter et corriger la transcription** | Ouvrir l'entretien (crayon) → la consigne devient un PANNEAU en bas de la colonne, sous le panneau de l'onglet actif (pas de bouton d'action : l'utilisateur lance la lecture LUI-MÊME, clic sur ▶ ou double-espace — la consigne cite les deux) → corriger l'ASR dans l'éditeur (ex. retirer le « ? » fautif de « Maison des Habitants? ? ») | le TEXTE de l'entretien ouvert a été édité (`texteModifie`, useEntretien) |
| 3 | **Renommer les locuteurs** | Dans l'onglet Locuteurs (défaut), renommer les « Speaker N » : Speaker 0 → « Fatima », Speaker 1 → « Enquêteur·rice » (clic dans le champ, saisie, puis clic ailleurs/Entrée). Consigne en PANNEAU en bas de colonne — la bulle flottante recouvrait le champ du 2ᵉ locuteur | `locuteurs` de l'entretien OUVERT : plus aucun nom ne commence par « Speaker » |
| 4 | **Créer une première thématique et annoter** | Ouvrir le codebook, créer un thème (ex. « Sens & motivations »), coder un passage | une annotation `codage` existe |
| 5 | **Saisir une variable** | Remplir p. ex. la « Ville » (texte libre) de Fatima | `valeursLoc` de Fatima contient la variable Ville |
| 6 | **Écouter depuis le texte** | Cliquer dans le texte → le lecteur seek au temps | `audio.position > 0` déclenché par un clic texte (cf. §7 B) |
| 7 | **Charger un 2ᵉ entretien (3 locuteurs)** | Importer E4 (Thomas & Yanis) — même mécanique one-click | `membership` contient ≥ 2 entretiens dont un à 3 locuteurs |
| 8 | **Attribuer un tour au bon locuteur** | Corriger la diarisation d'E4 seg. 50-52 (attribué à Thomas, contexte Yanis) en scindant/réattribuant | le tour visé d'E4 a changé de locuteur |
| 9 | **Voir la table de données** | Ouvrir la table, constater les valeurs par entretien/locuteur | onglet Données visité |

Les étapes 1 et 7 illustrent les deux visages de l'import. Les étapes 2 et 8
donnent du sens à « la transcription est le texte de travail » (§3) : corriger
l'ASR et la diarisation à l'oreille.

### 14.3 Lien avec les sources bundled

L'action one-click (étapes 1, 7) appelle `importerSource` (scope démo) avec le
contenu SRT lu via `demo:lireSource` et l'audio via `demo:cheminAudio`. C'est
exactement le même chemin que le builder d'« En autonomie » (§12.2 étape 2) —
**un seul mécanisme, deux déclencheurs** (bouton de la bulle vs boucle
automatique). D'où la simplicité : pas de code spécifique au pas-à-pas pour
charger, juste l'UX.

### 14.4 Sortie du mode

Il n'y a PAS de bouton « Quitter » dans l'onglet : le corpus est DÉDIÉ au
pas-à-pas (mode posé par le marqueur démo), le panneau reste donc monté tant
que ce corpus est ouvert. Pour sortir du guidage, l'utilisateur quitte le
corpus (Accueil / « Récents ») ; à la réouverture, le panneau revient avec
l'historique des étapes cochées — le mode appartient au corpus, pas à la
session.

> ⚠️ **OBSOLÈTE depuis J6/J7 (plan-reference-audio §12.12/§12.14)** : la bascule
> « sur le même dossier » est abandonnée — « En autonomie » crée son PROPRE
> corpus (dossier choisi directement dans la modale, au singulier), le corpus
> pas-à-pas n'est jamais modifié. Seules les sources sont partagées (copiées une
> fois).

## 15. Jalons révisés (évolue §8) — ÉTAT D'AVANCEMENT

> **Pour reprendre le travail.** Les jalons J1–J4 sont **faits et testés**
> (48/48 e2e au vert). Reste **J5** (compléter le pas-à-pas : 6 étapes
> manquantes sur 9) et **J6** (codebook/variables pré-remplis en autonomie).
> Voir le détail « ce qui reste » ci-dessous — les numéros de fichier et les
> points d'ancrage sont exacts au code actuel.

### Fait ✅

1. **J1 — contenu** ✅ : `CorpusTest/` livré (4 entretiens E1–E4, SRT + audio,
   §10). Codebook/variables « sur papier » (§2.2/2.3) **non encore figés**
   (servira en J6).
2. **J2 — builder** ✅ : [`composables/demo.ts`](../src/renderer/composables/demo.ts)
   (`utiliserDemo` : `preparer(mode)`, `importerSource(k)`) + IPC main
   `demo:lireSource` / `demo:cheminAudio` ([`main/index.ts`](../src/main/index.ts)
   `cheminCorpusTest()`). Test e2e : [`e2e/demo.e2e.ts`](../e2e/demo.e2e.ts)
   (les 2 modes). **Bonus non prévu** : carte « Corpus courant » retirée de
   l'Accueil + `chargerCorpus` charge le 1er récent (cf. §11.1).
3. **J3 — Accueil** ✅ : ligne « Mini Corpus Test » + 2 cartes dans
   [`Accueil.vue`](../src/renderer/components/Accueil.vue), branchées sur
   `preparer('autonomie'|'pas-a-pas')`. *Livrable utilisateur n°1.*
4. **J4 — pas à pas (squelette)** ✅ : [`PasAPas.vue`](../src/renderer/components/PasAPas.vue)
   (onglet Corpus + spotlight global téléporté en body) + `ongletCorpus` dans
   [`Corpus.vue`](../src/renderer/components/Corpus.vue) + **5 étapes** implémentées
   dans `demo.ts` (`charger`, `corriger`, `renommer`, `coder`, `variable`) avec
   prédicats réactifs + validation auto (`watch`, sans enchaînement automatique —
   l'utilisateur clique l'étape suivante). `data-tour` posés : `crayon-entretien`
   (Corpus), `onglet-themes` + `onglet-donnees` + `onglet-locuteurs` +
   `nom-locuteur` (Entretien), `lecture` (LecteurAudio). Entretien ouvert sur
   l'onglet Locuteurs par défaut. Test e2e :
   [`e2e/pas-a-pas.e2e.ts`](../e2e/pas-a-pas.e2e.ts). *Livrable utilisateur n°2.*
5. **J6/J7 — corpus de test SÉPARÉS par mode + marqueur `corpus.json`** ✅
   (plan-reference-audio §12.12/§12.14) : chaque mode a son PROPRE dossier de
   corpus, choisi DIRECTEMENT dans la modale (un dossier = un corpus, à la
   SonalPi) — la « bascule sur le même dossier » (§14.4) est abandonnée, plus
   aucun mélange. Marqueur `corpus.json: { demo: { mode, racineSources,
   validees? } }` (le gardien de §12.3, jusque-là « PAS posé », est enfin posé).
   Modale ADAPTATIVE au singulier : « où importer les sources » sautée si les
   sources sont déjà en place ; « où placer CE corpus de test » posée seulement
   si le corpus du mode n'est pas connu. Gardes d'indépendance : pas déjà un
   corpus, pas le dossier de l'autre mode, pas les sources. L'historique des
   étapes voyage avec le corpus (marqueur). Note : ce J6 n'a rien à voir avec le
   J6 « codebook & variables pré-remplis en autonomie » (À faire ci-dessous,
   toujours d'actualité).

### À faire

5. **J5 — pas à pas (complet)** : ajouter les **6 étapes manquantes** au tableau
   `etapes` de `demo.ts` (les 3 actuelles = étapes 1, 5, 6 de la séquence §14.2).
   Manquent :
   - **2. Corriger à l'aide de l'audio** — prédicat : `corpsTexte` d'E2 édité
     (hash ≠ hash d'import). NB : il faut un hash d'import de référence — à
     implémenter (ex. stocker à l'ouverture dans l'entretien, ou comparer une
     empreinte du `corpsTexte` initial vs courant).
   - **3. Renommer les locuteurs** — prédicat : aucun locuteur d'E2 ne commence
     par « Speaker ».
   - **4. Écouter depuis le texte** — prédicat : `audio.position > 0` déclenché
     par un clic texte (dépendance : exposer `audio.position` au scope `demo`).
   - **7. Charger un 2ᵉ entretien (E4, 3 locuteurs)** — action one-click
     `importerSource('E4')` ; prédicat : ≥ 2 entretiens dont un à 3 locuteurs.
   - **8. Attribuer un tour au bon locuteur** — prédicat : le tour visé d'E4
     (seg. 50-52) a changé de locuteur (nécessite de repérer le bloc par son
     contenu « Non, ce n'est pas vraiment pour le concours »).
   - **9. Voir la table de données** — prédicat : onglet Données / écran données
     visité (dépendance : observer `vue`/`ongletDroite`).
   Ajouter les `data-tour` manquants au fil de l'eau (locuteurs, lecteur audio,
   bouton table). Test e2e : étendre `pas-a-pas.e2e.ts`.
6. **J6 — codebook & variables pré-remplis en autonomie** : dans `preparer`,
   après les imports, poser les thèmes (§2.2) et variables (§2.3) via les IPC
   existantes (`ajouterCategorie`, `ajouterVariable`, `ajouterModalitesModele`).
   Codages pré-posés reportés (v2).

## 16. Risques & garde-fous (complète §9)

- **Dérive builder/importeur** ✅ : le builder réutilise `importerFichier` → aucun
  format parallèle. Test e2e [`demo.e2e.ts`](../e2e/demo.e2e.ts) : « En autonomie »
  produit bien 4 entretiens avec audio (garde-fou §6 original).
- **Coût du build au clic** : 4 imports + 4 copies audio + formes d'onde en fond.
  Si ressenti lent → spinner + build en fond avant l'atterrissage (on peut amorcer
  le dossier pendant que l'utilisateur lit le bandeau « voix synthétiques »).
  Fallback §12.4 (corpus pré-construit) si insuffisant. **Non encore mesuré.**
- **`data-tour` cassé** : reste d'actualité (test unitaire vérifiant chaque `cible`
  existe dans les templates). **Non implémenté** (gardien à poser en J5 quand les
  `data-tour` seront tous en place).
- **Dossier non-démo écrasé** : **NON implémenté**. Prévu (§12.3) : marqueur
  `corpus.json: { demo: true }` + refus de reconstruire sur un dossier sans
  marqueur. L'idempotence actuelle = juste « re-importer par-dessus » (la fusion
  d'import est idempotente par id). À faire si la démo est utilisée sur un
  dossier réel.
- **Contenu pris pour vrai** ✅ (partiel) : une mention statique « Personnages et
  voix synthétiques — un terrain fictif d'aide aux devoirs » est affichée en
  permanence sous les cartes de l'Accueil ([`Accueil.vue`](../src/renderer/components/Accueil.vue)).
  Le « bandeau une fois au premier atterrissage » (§13) **n'est pas** implémenté
  — la mention statique suffit en pratique.
