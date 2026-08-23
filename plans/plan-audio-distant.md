# Plan audio distant — SonalPiTestV2

> Suite logique du [plan multi-utilisateur](plan-multiuser.md) (E0-E4 posés) et de la
> passe audio v3 (`meta.audioRef` chemin absolu, §3.3 « Associer l'audio local… »).
> Objectif : en corpus **distant**, permettre de **désigner un fichier audio qui vit
> dans le Nextcloud** (à la création d'un entretien ou après coup), éventuellement en
> le **téléversant** depuis un poste local — et faire en sorte que chaque poste
> travaille ensuite sur une **copie miroir locale** de cet audio, téléchargée au pull
> et persistante entre les sessions.
>
> Cas VIDÉO : les mécanismes ci-dessous s'appliquent tels quels (une
> désignation peut pointer un média vidéo). Upload segmenté des très gros
> fichiers : [plan-chunking.md](plan-chunking.md). Waveform vidéo et extraction
> ffmpeg : [reflexion-ffmpeg.md](reflexion-ffmpeg.md).

---

## ⏳ État d'avancement

Plan révisé après revue produit (tirage sélectif piloté par les désignations,
garde anti-écrasement au téléversement, cas « désigné mais inaccessible »).

**Mise en œuvre :**

- **A1 → A5 TOUS FAITS** — tirage sélectif D3, champ `audioDistant` D1,
  résolution effective D2, whitelist `sonal-media://abs`, contrat IPC
  `inaccessibles` ; désignation après coup A3 (micro-session D4, modale de
  navigation) ; téléversement A4 (`putBinaire`, `televerserFichier` avec garde
  anti-écrasement + suggestion suffixée en un clic, MKCOL des parents, IPC
  `distant:televerserAudio`, ligne « ➕ Téléverser » dans la modale de
  désignation — UN point d'entrée pour les deux gestes) ; A5 : création avec
  audio NC (« Audio sur le Nextcloud… » dans AjoutEntretien, distant seul),
  étiquette d'état À CÔTÉ DE LA BARRE DE LECTURE (distant / inaccessible +
  « Rapatrier maintenant » / « Réessayer ») plutôt que badges sur les cartes
  (choix produit, revue 2026-11).
  Tests : 17 nouveaux (`webdav.test.ts`, `session.test.ts`) ; serveur mémoire
  amendé pour préserver les corps binaires (fidélité putBinaire).
  Hors v1 : chunking (limite serveur documentée dans le message d'erreur),
  propagation partagée de la waveform.

## 1. État des lieux (ce que le code fait aujourd'hui)

| Pièce | Comportement | Fichier |
|---|---|---|
| `meta.audioRef` (v3) | Chemin **absolu du poste qui a assigné**. Chez les autres postes : fichier manquant. | `src/shared/format.ts` |
| Retombée locale | `<miroir>/audio-locaux.json` — association machine-local **jamais poussée** ; la résolution retombe dessus quand la ref partagée ne pointe nulle part ici. | `corpusStore.ts` §3.3/E4 |
| Assigner / Réassigner | Dialogue fichier LOCAL uniquement, référence sans copie. Local ET distant (écrit la ref partagée). | `sonal.ts` |
| Associer l'audio local | Idem mais écrit dans `audio-locaux.json` (pas de JSON partagé). Distant uniquement. | `sonal.ts` |
| Tirage miroir | Ne télécharge **que des `.json`** (filtre `endsWith('.json')`). Un MP3 posé dans le Nextcloud est invisible. | `src/main/miroir.ts` |
| Client WebDAV | `getTexte`, `getBinaire` (jamais utilisé), `putTexte` (texte seul), MKCOL, PUT conditionnel If-Match. Pas de `putBinaire`. | `src/main/webdav/client.ts` |
| Le miroir lui-même | `userData/miroirs/<id>/` — **persistant entre les sessions**, jamais nettoyé. Le `.manifeste.json` (ETags vus) rend le pull incrémental. C'est ce qui rend ce plan naturel : l'audio téléchargé y reste. | `main/index.ts:632`, `miroir.ts` |

## 2. Décisions structurantes

### D1 — Un champ additif `meta.audioDistant`, pas un changement de `audioRef`

La v3 a fait de `audioRef` un chemin absolu *de poste* ; y glisser une référence serveur
changerait le domaine de valeurs (bump + migration). On ajoute plutôt :

```ts
export interface MetaEntretien {
  valeursGen: Record<string, string>
  audioRef: string | null            // inchangé — chemin absolu local (poste assigneur)
  /** Fichier audio désigné DANS le Nextcloud — chemin RELATIF à la racine
   *  du corpus serveur (n'importe où dans l'arbre). Champ ADDITIF optionnel,
   *  absent des fichiers existants → pas de bump de formatVersion. */
  audioDistant?: { chemin: string }
}
```

Pas de convention de rangement imposée : le fichier désigné peut vivre n'importe où
dans l'arbre du corpus — c'est la DÉSIGNATION qui porte l'information, pas un dossier.

### D2 — Chaîne de résolution EFFECTIVE par poste (extension de `audiosResolus()`)

Ordre de priorité, du partagé vers le machine-local :

1. `audioDistant` **et** copie miroir présente → le fichier du miroir (vérité partagée,
   une fois téléchargée) ;
2. `audioRef` dont le fichier existe ici → ce chemin (poste assigneur, corpus local) ;
3. retombée `audio-locaux.json` (existant, inchangé) ;
4. sinon : manquant (état UI actuel).

Avant le premier téléchargement, un poste qui avait associé un local continue de
travailler (3) ; dès que la copie miroir arrive (1), tout le monde lit la même source.

### D3 — Tirage SÉLECTIF piloté par les désignations (révision)

Le miroir télécharge déjà TOUS les JSON d'entretiens ; il suffit donc de les lire
après le pull texte pour savoir quels audios rapporter. Extension de
`MiroirWebDAV.tirer()` :

1. pull texte tel quel (JSON de contenu) ;
2. lecture des `meta.audioDistant` des entretiens tirés (+ cache des désignations —
   un JSON inchangé n'est pas re-parsé, son ETag fait foi) ;
3. pour chaque désignation : PROPFIND ciblé du chemin (ETag) puis GET binaire
   (`getBinaire`, déjà là) SI l'ETag diffère du manifeste ; écriture locale atomique
   (`ecrireLocalBinaire`, miroir d'`ecrireLocal`) ; ETag notés dans le **même manifeste** ;
4. désignation retirée d'un entretien → la copie miroir part en corbeille-miroir
   au pull suivant (jamais effacée).

Chaque poste ne télécharge ainsi QUE les audios réellement désignés — pas ceux des
entretiens qu'il n'ouvre jamais. Contrepartie acceptée : un poste qui ouvre un
entretien nouvellement désigné attend le prochain tirage (ou « Télécharger
maintenant », §3) pour avoir la copie locale.

**Audios désignés mais INACCESSIBLES (droits Nextcloud)** — cas anticipé :
un utilisateur peut désigner un fichier que les autres membres du corpus n'ont
pas le droit de lire.

- Le tirage reste TOUJOURS bloqué par un audio : échec de PROPFIND/GET (403 refusé,
  404 disparu, réseau) collecté dans `ResultatTirage.inaccessibles` ({chemin,
  raison affichable}) et JAMAIS noté au manifeste ;
- conséquence mécanique voulue : l'ETag absent ⇒ le prochain tirage RE-TENTE
  automatiquement. Droits ouverts plus tard ⇒ le prochain « Actualiser » (ou
  « Télécharger maintenant ») rapporte l'audio, sans action ni migration ;
- côté désignant : avertissement dans la boîte de désignation/téléversement
  (« vérifiez que ce fichier est partagé avec tous les membres du corpus ») —
  l'app ne peut pas deviner les droits des autres à sa place ;
- côté collègues : badge dédié « audio inaccessible » (distinct de « manquant »)
  portant le message explicatif (ex. « L'audio désigné pour cet entretien existe
  sur le serveur mais votre compte n'y a pas accès — demandez l'accès au
  propriétaire du fichier ; il sera récupéré dès que les droits seront ouverts »).

> Historique : la première version de ce plan téléchargeait TOUT un dossier
> `audios/` par PROPFIND, sans lire les JSON. Révision suite revue produit :
> le tirage sélectif est plus léger ET lève toute contrainte de rangement (D1).

### D4 — La désignation est une écriture partagée → protocole session existant

Poser `meta.audioDistant` modifie le JSON vu par tous : cela passe par le cycle
**verrou → GET serveur → édition → publier (PUT If-Match) → fermer**
(`sessions.ts`, §4 du plan multiuser). Deux cas :

- entretien **déjà ouvert en session** chez nous : on pose le champ dans le modèle
  en session, l'autosave/publie le transporte (aucun nouveau canal) ;
- entretien **fermé** (assignation après coup depuis la vue Corpus) : micro-session —
  acquérir, poser le champ, publier, libérer. Réutilise `ouvrirSession`/`publier`
  tels quels.

### D5 — Le téléversement est un PUT binaire AVANT la désignation

Séquence « Téléverser l'audio… » : dialogue fichier local → lecture →
`putBinaire('audios/<nom>')` → désignation (D4) dans la foulée. Ajouts :

```ts
// client.ts — miroir exact de putTexte
async putBinaire(chemin: string, contenu: Uint8Array, options: OptionsPut = {}): Promise<Uint8Array | null>
```

- MKCOL de `audios/` (destination PAR DÉFAUT du téléversement ; le client a déjà MKCOL) ;
- Content-Type `audio/<ext>` (best effort) ;
- **garde anti-écrasement** : un PUT WebDAV vers un nom existant REMPLACE
  silencieusement le fichier serveur (contrairement à l'UI web de Nextcloud, qui
  propose de renommer) — deux collègues envoyant des enregistrements homonymes
  s'écraseraient mutuellement sans le savoir. Avant le PUT, l'app vérifie
  l'existence (PROPFIND ciblé) ; si le chemin est pris, elle propose en un clic le
  même nom suffixé (`entretien1-2.mp3`) — ni blocage sec, ni perte silencieuse.
- Limite taille : pas de chunking v1 — on documente la limite de POST de l'instance
  Nextcloud dans le message d'erreur réseau.

Ce qui **ne complique pas** le plan : la persistence miroir, le pull ETag, la chaîne
de résolution et la waveform sont communs aux cas « déjà dans le NC » et « téléversé ».
Le surcoût réel du téléversement se réduit à `putBinaire` + MKCOL + la politique de
collision — une demi-journée environ sur l'ensemble.

## 3. Parcours UI

| Geste | Où | Mode |
|---|---|---|
| « Désigner dans Nextcloud… » | Vue Corpus (entretien sélectionné) + LecteurAudio (entretien ouvert, ex. audio introuvable) + assistant de création | distant uniquement |
| « Téléverser l'audio… » | Mêmes endroits ; enchaîne PUT + désignation | distant uniquement |
| Sélecteur Nextcloud | Navigation par dossiers dans l'arbre du corpus (PROPFIND Depth:1 par dossier ouvert) ; `audios/` proposé comme point d'entrée | — |
| Badge audio (vue Corpus) | 4 états : disponible ici · distant (téléchargé au prochain Actualiser) · **inaccessible (droits)** · manquant | distant |
| « Télécharger maintenant » | Sur les badges distant ET inaccessible : retente le fichier (GET direct + note manifeste si succès) | distant |

« Assigner un audio… » et « Associer l'audio local… » restent tels quels — les quatre
gestes coexistent ; en distant, « Désigner/Téléverser » sont simplement mis en avant.

## 4. Whitelist `sonal-media://abs/` et waveform

- `cheminMediaAbs` autorise un chemin s'il figure parmi les refs **résolues** du corpus
  (politique actuelle : pas de garde par préfixe). En étendant `audiosResolus()` (D2),
  les copies miroir deviennent servables sans toucher à la whitelist elle-même.
- La waveform reste un **dérivé local** (`png/<id>.png` dans le miroir, jamais poussé) :
  régénérée dès que la copie arrive, cache-busting par `lastModified` inchangé.

## 5. Tests

- **Miroir** : tirage télécharge les seuls fichiers désignés ; idempotence
  (2e tirage = 0 GET) ; désignation retirée → corbeille-miroir ; audio changé côté
  serveur (ETag) → re-téléchargement ; manifeste mixte JSON+binaires ;
  **inaccessible** : GET 403/404 → tirage non bloqué, `inaccessibles` renseigné,
  ETag non noté ; puis droits « ouverts » → le tirage suivant réussit (scénario
  complet de rattrapage).
- **Client WebDAV** : `putBinaire` (headers, retour ETag), MKCOL conditionnel.
- **Résolution** : priorité D2 (les 4 cas), y compris bascule 3→1 à l'arrivée du miroir.
- **Whitelist** : un chemin miroir résolu passe ; un chemin arbitraire hors refs refuse.
- **E2E** : scénarios sur bancs Docker (`npm run nc:up` — images déjà en place, jamais
  de pull ni re-provisioning, cf. AGENTS.md).

## 6. Séquencement

| Étape | Contenu | Dépend de |
|---|---|---|
| A1 | D3 : tirage sélectif des audios désignés dans le miroir (+ tests miroir) | — |
| A2 | D1/D2 : champ `audioDistant`, chaîne de résolution, whitelist (+ tests) | A1 pour être observable, sinon testable seule |
| A3 | D4 : désignation après coup (« Désigner dans Nextcloud… », micro-session) | A2 |
| A4 | D5 : téléversement (`putBinaire`, MKCOL, « Téléverser l'audio… ») | A3 |
| A5 | Assistant de création (3ᵉ choix audio en distant), badges, « Télécharger maintenant » | A3 |

A1+A2 suffisent à répondre au besoin initial (audio déjà présent dans le NC, copié
dans le miroir persistant) ; A4 ajoute le téléversement sans rien remettre en cause.

## 7. Scénarios utilisateurs

**« Zut, il faut que je partage avec mes collègues »** (cas nominal) :

1. La personne a travaillé avec son audio en local ; ses collègues voient « audio manquant ».
2. Elle téléverse le fichier vers `audios/` du corpus (« Téléverser l'audio… », même nom
   que son fichier local — elle n'y pense pas) et réassigne = désigne.
3. Au prochain tirage, **chaque poste — y compris le sien — télécharge le fichier dans son
   miroir** (`<miroir>/audios/<nom>`), une seule fois (ETag au manifeste), et il y reste
   (le miroir est persistant).
4. Chez la personne qui a téléversé, ce téléchargement est REDONDANT : elle a déjà le
   fichier sur son disque, mais pas dans l'espace miroir, que seule l'app gère.
   Version simple assumée : on laisse le pull le retélécharger (quelques Mo, une fois).
   L'optimisation « copier au lieu de GET si un fichier identique existe déjà localement
   (même taille/hash) » est différée — économie minime, complexité réelle.

Piège à documenter dans l'UI : si la personne repasse par l'ancien « Assigner un audio… »
(dialogue LOCAL), rien ne part sur le serveur — elle ne partage que son chemin absolu,
comme aujourd'hui. En corpus distant, « Téléverser / Désigner » doivent être mis en avant.

## 8. Questions ouvertes

1. Faut-il un jour propager la waveform comme dérivé partagé (éviter N régénérations) ?
   Hors périmètre ici, noté pour mémoire.
