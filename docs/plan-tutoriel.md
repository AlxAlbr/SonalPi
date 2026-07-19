# Plan — Corpus de démonstration & parcours guidé

> Objectif : qu'un nouvel utilisateur comprenne **où il est** et **ce que Sonal sait faire**
> en manipulant un vrai corpus, sans risque pour ses données. Deux livrables emboîtés :
> un **corpus de démonstration** (accès libre) puis un **parcours guidé** qui s'exécute
> dedans (accès guidé, pas à pas auto-validés).

## 1. Principes

- **La démo est une copie jetable.** Le corpus de démonstration embarqué dans l'app est
  copié dans `<profil>/corpus-demo` à l'installation ; l'utilisateur peut tout casser,
  « Réinitialiser la démo » = recopier. Aucune donnée réelle en jeu.
- **Contenu 100 % fictif et dit comme tel.** Les entretiens sont synthétiques (personnages
  inventés, voix générées) ; la démo l'affiche explicitement (bandeau ou premier écran du
  parcours) pour qu'aucun extrait ne puisse passer pour un témoignage réel.
- **Les textes sont la source de vérité, versionnée dans le dépôt.** L'audio (VoiceBox)
  et le dossier corpus sont des **dérivés régénérables** des scripts d'entretien — même
  philosophie que les formes d'onde.
- **Le parcours guidé n'instrumente pas les vues.** Il observe le modèle réactif
  (composables D-S12) pour valider les étapes, et cible les éléments d'interface par des
  attributs `data-tour` dédiés.

## 2. Le corpus de démonstration : « La transmission culinaire »

Un mini-terrain qualitatif crédible, choisi pour exercer TOUTES les fonctionnalités :
récits riches à coder, plusieurs locuteurs, profils sociologiques variés.

### 2.1 Les trois entretiens (personnages fictifs)

| # | Titre | Locuteurs | Ce que ça démontre |
|---|-------|-----------|--------------------|
| E1 | « Madeleine, la boulangerie » | Enquêteur·rice + Madeleine (72 ans, boulangère retraitée) | Récit long, émotion, souvenirs — matière à codage fin |
| E2 | « Karim, cuisiner loin de chez soi » | Enquêteur·rice + Karim (24 ans, étudiant) | Contrepoint générationnel ; entretien court (bon pour « ton premier codage ») |
| E3 | « Claire & Julien, cuisine à quatre mains » | Enquêteur·rice + Claire + Julien (couple, ~40 ans) | **3 locuteurs** : attribution des tours, variables par locuteur |

Calibrage : 10–14 tours de parole par entretien, 400–600 mots (≈ 3–4 min d'audio TTS).
Chaque entretien contient au moins : un passage émouvant, un passage technique, un
désaccord ou une nuance (E3 : Claire et Julien ne sont pas d'accord — parfait pour
montrer le codage par locuteur et les valeurs divergentes).

### 2.2 Codebook (thèmes) livré pré-rempli, avec hiérarchie

- **Transmission** (parent) → « apprendre en regardant », « recettes écrites / carnets »
- **Souvenirs & émotions** (parent) → « enfance », « personnes disparues »
- **Savoir-faire & techniques**
- **Identité & origines**
- **Ruptures & modernité** (surgelés, livraison, réseaux sociaux…)

Couleurs contrastées + un thème avec taille de police > 16 (pour montrer la pondération).
Une partie des passages est DÉJÀ codée (E1 et E3), E2 est laissé vierge : c'est le
terrain d'exercice du parcours guidé.

### 2.3 Variables livrées pré-remplies — une de chaque espèce

| Variable | Portée | Modalités | Rôle démo |
|----------|--------|-----------|-----------|
| Sexe | locuteur | modèle « Sexe » | modèles pré-remplis |
| Âge | locuteur | modèle « Age en classes de 10 » | modèles pré-remplis |
| PCS | locuteur | modèle « PCS Niveau 1 » | modèles pré-remplis |
| Ville | locuteur | **aucune** → saisie libre | champ texte libre + « autre… » |
| Contexte | entretien | domicile / visio / café | variable d'entretien |
| Note de terrain | entretien | aucune (texte libre) + **privée** 🔒 | statut privé (exclue des exports) |

Valeurs posées partout SAUF quelques trous volontaires (le parcours guidé fait remplir
la colonne Ville de E2 en saisie libre, par exemple).

## 3. Production des textes (dans le dépôt)

- Dossier `demo/scripts/` : un fichier par entretien, format source minimal lisible :

  ```
  # E2 — Karim, cuisiner loin de chez soi
  [Enquêteur] Est-ce que tu peux me parler d'un plat qui compte pour toi ?
  [Karim] Le plat de ma mère, les lentilles corail… (rires) Je l'appelle en visio
  pour qu'elle me montre, mais ce n'est jamais pareil.
  ...
  ```

- Règles d'écriture : oral plausible (hésitations, relances courtes de l'enquêteur),
  aucun nom de personne réelle ni de lieu trop précis, champs lexicaux distincts par
  thème (pour que le codage démo « tombe bien »).
- Ces scripts ne portent AUCUNE balise temporelle et ne deviennent pas directement le
  texte du corpus : ils pilotent la génération TTS et l'attribution des locuteurs
  (§4) — le texte final vient de la transcription automatique de l'audio.

## 4. Audio & synchronisation : VoiceBox puis transcription automatique (hors dépôt)

Réalisé en dehors de ce dossier. Le principe : les scripts de §3 ne portent **aucune
balise temporelle** — la synchronisation vient d'une **transcription automatisée de
l'audio généré**, comme pour un vrai terrain :

1. **Génération TTS (VoiceBox)** : une voix stable par personnage (4 voix :
   enquêteur·rice + 3 personnages ; E3 en réutilise 2), génération par tour puis
   concaténation (ffmpeg, silences entre tours) → un fichier par entretien
   (`E2.mp3`, mono, ~96 kbps suffit).
2. **Transcription automatisée** de chaque `.mp3` avec l'ASR couplé à Pyannote →
   **SRT avec diarisation intégrée** (segments horodatés + étiquette de locuteur par
   segment). C'est cette sortie qui fournit à la fois le TEXTE du corpus, les temps
   des **ancres** (D-S14) et l'identité des locuteurs : synchronisation garantie par
   construction, aucun pointage manuel, aucun contrat de timeline à maintenir.
3. Livraison dans le dépôt : `E1.mp3 E2.mp3 E3.mp3` + les 3 sorties de transcription
   (`E*.srt`) dans `demo/audio/`. Les formes d'onde ne sont PAS livrées
   (l'app régénère les PNG manquants toute seule — `regenererOndesManquantes`).

Deux conséquences ASSUMÉES de ce choix :

- **Le texte du corpus est la transcription, pas le script d'auteur.** Il portera les
  imperfections de l'ASR — c'est un avantage pédagogique : la démo ressemble
  exactement à ce qu'un utilisateur de Sonal manipule en vrai (transcription auto à
  reprendre), et « corriger le texte » peut même devenir une étape du parcours guidé.
- **La diarisation étiquette les locuteurs de façon anonyme** (`SPEAKER_00`,
  `SPEAKER_01`…) : il reste un mapping étiquette → personnage à poser dans le
  générateur §5 (trivial : l'ordre de première prise de parole est connu par le
  script source, et une vérification manuelle sur 3 entretiens courts suffit).
  Pour E2, on peut volontairement livrer l'attribution incomplète puisque c'est un
  exercice du parcours guidé.

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
| « Ouvre l'entretien de Karim » | `ouvertId === <id E2>` |
| « Attribue ce tour à Karim » | tour N de E2 attribué |
| « Code ce passage avec “Transmission” » | une annotation `codage` de ce code apparaît sur E2 |
| « Renomme le locuteur » | `locuteurs[1].nom !== 'Karim'` |
| « Remplis la ville en texte libre » | `valeursLoc` de Karim contient la variable Ville |
| « Passe le filtre sur “locuteurs” » | (étape UI pure — reste un « suivant » manuel) |
| « Écoute depuis un clic dans le texte » | `audio.position > 0` |

Ordre du parcours : Accueil → Corpus (cartes, résumé thématique) → Entretien E2
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
