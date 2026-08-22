import { ref, computed, watch, onMounted, provide, inject, type InjectionKey } from 'vue'
import { importerFichier } from '../import/sas'
import { exporterSonal } from '../import/exportSonal'
import { urlMediaAudio, urlMediaWaveform, genererEtEcrireWaveform } from '../audio/waveform'
import type { CorpusFichier, MarqueurDemo, PayloadEntretien, RegleAnon } from '../../shared/format'
import { mapperEntretiensV1, type CrpV1Entretien, type DemandeMigration, type EntretienV1Import } from '../../shared/corpus/migrationCrp'
import { useProfil } from './useProfil'
import { useCorpus } from './useCorpus'
import { useEntretien } from './useEntretien'
import { useAudio } from './useAudio'
import { utiliserDemo } from './demo'

/**
 * ORCHESTRATION applicative : instancie et COUD les trois scopes (profil,
 * corpus, entretien) et porte la navigation. Créé UNE fois par l'App (`fournirSonal`),
 * `provide`/`inject` aux composants de vue → tous partagent le même éditeur et le
 * même modèle (les composables ne sont pas ré-instanciés).
 */
export function creerSonal() {
  const profil = useProfil()

  // Indirection pour casser le cycle : le scope corpus doit sauver l'entretien
  // ouvert avant un compte d'usages (`flush`), mais l'entretien est créé APRÈS le
  // corpus (il lui injecte `couleurTrait`). On route `flush` via un holder réaffecté.
  let sauverEntretien: () => Promise<void> = async () => {}
  // Indirection pour casser un cycle de dépendances : `appliquerCorpus` doit
  // restaurer le mode démo (panneau « Pas à pas ») quand le corpus ouvert porte
  // un marqueur `demo`, mais le scope demo est créé APRÈS (il injecte
  // `appliquerCorpus`). Même patron que `sauverEntretien` : holder réaffecté.
  let raccrocherModeCorpus: (
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ) => Promise<void> = async () => {}
  const corpus = useCorpus({ flush: () => sauverEntretien() })

  // Scope AUDIO : le lecteur de l'entretien ouvert. Les trois consommateurs
  // (LecteurAudio en haut, barre sur la forme d'onde, bloc-lu de l'éditeur) se
  // coordonnent par cet état réactif partagé.
  const audio = useAudio()

  const ent = useEntretien({
    couleurTrait: corpus.couleurTrait, // le marquage résout la couleur d'un code (corpus)
    tailleTrait: corpus.tailleTheme, // …et sa taille de police (parité SonalPi)
    apresSauvegarde: () => corpus.rafraichirUsages(), // après un save, les usages suivent
    codeExtraits: () => corpus.codeCourant.value, // filtre de la requête Extraits
    nomCode: (code) => corpus.nomTheme(code), // libellés du journal (noms au corpus)
    reglesAnon: () => corpus.reglesAnon.value, // règles corpus (menu multi-pseudo, promotions 3b)
    rafraichirReglesCorpus: () => corpus.rafraichirScanAnon(), // cache règles après mutation
    lectureSeule: () => lectureSeule.value, // définitions (flux B) : grisage permanent avant E3
    entretienEditable: () => !lectureSeule.value || !ent.verrouAutrui.value, // contenu (flux A) : selon le verrou
    libelleValeur: (idVar, idMod) => {
      const v = corpus.variables.value.find((x) => x.id === idVar)
      const nomVar = v?.lib ?? idVar
      if (!idMod) return `${nomVar} effacée`
      return `${nomVar} = ${v?.modalites.find((m) => m.id === idMod)?.lib ?? idMod}`
    },
    // Clic sur la gouttière → seek au début du tour (si un audio est chargé).
    clicTour: (posBloc) => {
      if (!audio.url.value) return
      const t = ent.tempsDuBloc(posBloc)
      if (t != null) audio.seek(t)
    },
    // Clic DANS le texte → seek au temps interpolé à cet endroit (comme
    // SonalPi) — la barre sur la forme d'onde suit, play reprend là.
    clicTexte: (pos) => {
      if (!audio.url.value) return
      const t = ent.tempsAuTexte(pos)
      if (t != null) audio.seek(t)
    },
    // Double-espace dans le texte = play/pause (parité SonalPi). Ne bascule (et
    // ne signale d'avoir agi) que si un audio est chargé.
    basculerLecture: () => {
      if (!audio.url.value) return false
      audio.basculer()
      return true
    },
  })
  sauverEntretien = ent.sauver

  // La lecture avance → le bloc lu suit (surlignage + défilement). Décharger
  // l'audio (url null) éteint le surlignage.
  watch(audio.position, (t) => ent.majPlageLue(audio.url.value ? t : null))
  watch(audio.url, (u) => {
    if (!u) ent.majPlageLue(null)
  })

  // --- Navigation SonalPi : Accueil → Corpus → Entretien (+ Table de données) ---
  const vue = ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>('corpus')

  // --- Largeur du panneau vidéo, mémorisée PAR CORPUS (settings.json) ---
  const dossierCourantDir = ref<string | null>(null)
  /** Applique la largeur mémorisée du corpus courant (ou laisse 0 → la
   *  largeur par défaut sera déduite du ratio de la vidéo à sa lecture). */
  async function chargerTailleVideo() {
    const dir = dossierCourantDir.value
    if (!dir) return
    audio.definirLargeurVideo(await window.sonal.media.lireLargeurVideo(dir))
  }
  // Chaque réglage par − / + est persisté immédiatement (écriture légère).
  watch(audio.largeurVideo, (w) => {
    const dir = dossierCourantDir.value
    if (dir && w > 0) void window.sonal.media.ecrireLargeurVideo(dir, w)
  })

  // --- Sélection d'un entretien DANS la vue Corpus (≠ `ouvertId` = éditeur) ---
  // Sélectionner (clic sur la carte) montre ses métadonnées à gauche ; le crayon,
  // lui, OUVRE l'éditeur. On lit le fichier à la sélection (requête ciblée, pas
  // de cache) — le renderer ne tient jamais tous les entretiens.
  const corpusSelId = ref<string | null>(null)
  const corpusSelMeta = ref<{ nbLocuteurs: number; nbValeurs: number; audio: boolean } | null>(null)
  async function selectionnerCorpus(id: string) {
    if (corpusSelId.value === id) return deselectionnerCorpus() // re-clic = fermer
    corpusSelId.value = id
    corpusSelMeta.value = null
    const res = await window.sonal.corpus.lireEntretien(id)
    if (res.ok && corpusSelId.value === id) {
      const e = res.data
      const nbValeurs =
        Object.keys(e.meta.valeursGen).length +
        e.locuteurs.reduce((s, l) => s + Object.keys(l.valeursLoc).length, 0)
      corpusSelMeta.value = { nbLocuteurs: e.locuteurs.length, nbValeurs, audio: e.meta.audioRef != null }
    }
  }
  function deselectionnerCorpus() {
    corpusSelId.value = null
    corpusSelMeta.value = null
  }
  // Confirmation de suppression d'un thème DEPUIS l'entretien (orchestration).
  const themeASupprimer = ref<{ id: string; nom: string; n: number } | null>(null)

  // --- Audio : médias du corpus (requête) + chargement du lecteur ---
  /** Scan `png/` du corpus (id → { audio, waveform }) : alimente les cartes
   *  de l'écran Corpus et le chargement du lecteur — REQUÊTE, pas de cache. */
  const audiosCorpus = ref<Record<string, { audio: string | null; waveform: string | null }>>({})
  async function rafraichirAudios() {
    audiosCorpus.value = await window.sonal.corpus.audios()
  }
  /** Intégrité à l'ouverture : ids des entretiens dont l'audio référencé est
   *  introuvable (fichier déplacé/supprimé). Calculé à chaque ouverture de
   *  corpus, non rafraîchi en session (un ré-ouvrir rafraîchit). */
  const audiosManquants = ref<Record<string, 'manquant'>>({})
  /** Vérifie l'existence des audios référencés (IPC côté main) et ne retient
   *  que les manquants. */
  async function verifierIntegriteAudios(): Promise<Record<string, 'manquant'>> {
    const res = await window.sonal.corpus.verifierAudios()
    const manquants: Record<string, 'manquant'> = {}
    for (const [id, s] of Object.entries(res)) if (s === 'manquant') manquants[id] = 'manquant'
    return manquants
  }
  /** Régénère EN FOND les ondes manquantes (dérivés régénérables). Après un
   *  changement de RENDU (ex. ex-onde verte → gris neutre), la migration est
   *  MANUELLE et simple : supprimer les `png/<id>.png` → régénérés ici. */
  async function regenererOndesManquantes() {
    const cibles = Object.entries(audiosCorpus.value).filter(([, v]) => v.audio && !v.waveform)
    if (cibles.length === 0) return
    for (const [id, v] of cibles) await genererEtEcrireWaveform(id, v.audio!)
    await rafraichirAudios()
  }
  /** URL affichable de la forme d'onde d'un entretien (cartes Corpus). */
  function urlWaveform(id: string): string | null {
    const wf = audiosCorpus.value[id]?.waveform
    return wf ? urlMediaWaveform(id, corpus.membership.value[id]?.lastModified ?? '') : null
  }

  /** (Re)charge le lecteur pour l'entretien ouvert : audio du modèle
   *  (`meta.audioRef`), forme d'onde régénérée si absente (c'est un dérivé). */
  async function majAudioEntretien(id: string) {
    await rafraichirAudios()
    const audioRef = ent.meta.audioRef
    const info = audiosCorpus.value[id]
    if (!audioRef || !info?.audio) {
      audio.charger(null, null)
      return
    }
    if (!info.waveform) {
      const rel = await genererEtEcrireWaveform(id, audioRef)
      if (rel) await rafraichirAudios()
    }
    const wf = audiosCorpus.value[id]?.waveform
    audio.charger(urlMediaAudio(audioRef), wf ? urlMediaWaveform(id, Date.now()) : null)
  }

  // Quitter l'écran entretien met la lecture en PAUSE (le lecteur n'est visible
  // que là — pas de lecture fantôme sans commandes à l'écran).
  watch(vue, (v) => {
    if (v !== 'entretien') audio.pause()
  })

  // Le corpus met à jour `codebook` (recolorer / (dés)activer / supprimer un thème)
  // → l'entretien redessine le marquage (couplage inter-scope par OBSERVATION).
  watch(corpus.codebook, () => ent.rafraichirDecorations())
  // Ouvrir l'onglet Données (écran entretien) rafraîchit la matrice corpus (requête).
  watch(ent.ongletDroite, (v) => {
    if (v === 'donnees') corpus.rafraichirMatrice()
  })

  // --- Orchestration : coud profil ↔ corpus ↔ entretien ---
  /** Applique un corpus chargé (définitions + membership) et RÉINITIALISE l'entretien
   *  ouvert — on change potentiellement de dossier. `dir` (optionnel) permet de
   *  restaurer le mode démo quand le corpus ouvert est le corpus de démo (problème
   *  n°2 — panneau « Pas à pas » après réouverture par « Récents » / démarrage). */
  async function appliquerCorpus(c: CorpusFichier, dir?: string) {
    ent.reinitialiser()
    audio.charger(null, null) // le lecteur ne survit pas au changement de corpus
    if (dir) dossierCourantDir.value = dir
    audio.largeurVideo.value = 0 // la taille mémorisée de l'ANCIEN corpus ne s'applique pas
    reprise.value = null // les ids de reprise non plus
    deselectionnerCorpus()
    corpus.membership.value = c.membership
    corpus.majCodebook(c.codebook)
    corpus.majVariables(c.variables)
    await corpus.rafraichirUsages()
    await rafraichirAudios()
    audiosManquants.value = await verifierIntegriteAudios() // bandeau d'intégrité
    void regenererOndesManquantes() // en fond : ne bloque pas l'arrivée à l'écran
    void chargerTailleVideo() // largeur vidéo mémorisée pour CE corpus
    await raccrocherModeCorpus(c.demo, dir ?? null) // restaure le mode démo (panneau « Pas à pas »)
  }

  async function chargerCorpus() {
    // Au démarrage, on charge le 1er récent s'il existe (= dernier corpus
    // ouvert). Sinon (premier lancement) : modèle vide, on reste sur l'Accueil —
    // l'utilisateur choisit explicitement (Mini Corpus Test ou un dossier).
    // « Corpus courant » de l'Accueil n'est plus une carte dédiée : c'est le
    // 1er récent (le loaded corpus est TOUJOURS le 1er récent, par construction).
    // Les récents ne contiennent que des dossiers LOCAUX → pas de pull au
    // démarrage ; un corpus distant se rouvre via « Corpus distant… ».
    idDistantCourant.value = null
    dernierTirage.value = null
    await profil.rafraichirRecents()
    if (profil.recents.value.length > 0) {
      const dir = profil.recents.value[0].dir
      await appliquerCorpus(await profil.ouvrirDossier(dir), dir)
    }
    vue.value = 'accueil'
  }

  /** « Ouvrir un corpus… » : le scope profil bascule le store sur un autre dossier
   *  et renvoie son contenu ; on l'applique au modèle. */
  async function choisirDossier() {
    const r = await profil.choisirDossier()
    if (!r) return
    idDistantCourant.value = null
    dernierTirage.value = null
    await appliquerCorpus(r.corpus, r.dir)
    vue.value = 'corpus'
  }
  /** « Nouveau corpus… » : crée un corpus NEUF (avec son `nom` de projet) dans le
   *  dossier choisi — ou OUVRE l'existant si le dossier en contient déjà un (on
   *  n'écrase jamais, son nom fait foi). C'est le pendant création de `choisirDossier`. */
  async function creerNouveauCorpus(dir: string, nom: string) {
    const r = await window.sonal.corpus.creerNouveau(dir, nom)
    profil.dossierCourantNom.value = r.nom
    idDistantCourant.value = null
    dernierTirage.value = null
    await appliquerCorpus(r.corpus, r.dir)
    vue.value = 'corpus'
  }
  /** Rouvrir un corpus récent (par son chemin). */
  async function ouvrirRecent(dir: string) {
    idDistantCourant.value = null
    dernierTirage.value = null
    await appliquerCorpus(await profil.ouvrirDossier(dir), dir)
    vue.value = 'corpus'
  }

  /** « Corpus distant… » (plan-multiuser.md E0, lecture seule) : tire le
   *  miroir du compte configuré puis bascule le store dessus — le renderer
   *  reçoit exactement la même forme qu'une ouverture locale, il ne sait PAS
   *  qu'un serveur existe (invariant §15.1). Échec réseau → exception IPC,
   *  l'app reste sur le corpus courant (l'appelant affiche l'erreur). */
  async function ouvrirCorpusDistant(id: string) {
    const r = await window.sonal.distant.ouvrir(id)
    idDistantCourant.value = r.distant.id // active la zone de synchro + le pull doux
    dernierTirage.value = new Date().toISOString() // le main vient de tirer
    profil.dossierCourantNom.value = r.nom
    await appliquerCorpus(r.corpus, r.dir)
    vue.value = 'corpus'
  }

  // ── Corpus distant : « Actualiser » + minuterie douce (plan §3.2 et §10) ──
  // Le déclencheur est le PULL — pas un watcher fichier : après un tirage, une
  // re-requête suffit (les vues corpus sont sans cache). Minuterie douce ~60 s
  // quand l'écran Corpus est affiché ; « Actualiser » force à la demande.
  const idDistantCourant = ref<string | null>(null) // null = corpus local
  const dernierTirage = ref<string | null>(null) // horodatage affiché (« copie de HH:MM »)
  const tirageEnCours = ref(false)
  /** E0 lecture seule (choix produit) : le miroir n'a ni verrou ni publication
   *  avant E1 — on refuse donc TOUTE écriture, côté UI (grisage + bandeau) ET
   *  côté main (garde `CorpusStore.lectureSeule`). */
  const lectureSeule = computed(() => idDistantCourant.value !== null)

  /** Tire le miroir et, si quelque chose a changé côté serveur, ré-applique le
   *  corpus au modèle. `silencieux` (minuterie) : une panne réseau ne crie pas —
   *  on garde la copie locale datée, le prochain tick réessaiera.
   *  Retourne false si le corpus courant est local (rien à tirer). */
  async function actualiserDistant(silencieux = false): Promise<boolean> {
    if (!idDistantCourant.value || tirageEnCours.value) return false
    tirageEnCours.value = true
    try {
      const t = await window.sonal.distant.tirer()
      if (!t) {
        idDistantCourant.value = null
        return false
      }
      dernierTirage.value = t.date
      if (t.telecharges.length > 0 || t.corbeille.length > 0) {
        await appliquerCorpus(await window.sonal.corpus.ouvrir(), dossierCourantDir.value ?? undefined)
      }
      return true
    } catch (e) {
      if (!silencieux) throw e
      return false
    } finally {
      tirageEnCours.value = false
    }
  }

  /** La minuterie ne vit que sur l'écran Corpus d'un corpus distant (le composant
   *  reste monté sous v-show → condition dans le tick, pas au montage). */
  setInterval(() => {
    if (vue.value === 'corpus' && idDistantCourant.value) void actualiserDistant(true)
  }, 60_000)

  /** Migration SonalPi V1 → V2 (plan-migration E3 + E2) : exécute la création
   *  du corpus V2 (le renderer orchestre — E0 aperçu, E1 définitions —, le main
   *  écrit + ouvre + ajoute aux récents), applique le corpus au modèle, puis
   *  IMPORTE les entretiens V1 (lecture des .Sonal + audio, E2). Même geste de
   *  profil que `ouvrirDossier` (nom courant + récents). */
  async function migrerDepuisV1(req: DemandeMigration, tabEntV1?: CrpV1Entretien[]) {
    const r = await window.sonal.migrer.executer(req)
    profil.dossierCourantNom.value = r.nom
    await profil.rafraichirRecents()
    idDistantCourant.value = null
    dernierTirage.value = null
    await appliquerCorpus(r.corpus, r.dir)
    // E2 — entretiens : chaque `tabEnt[]` V1 → un entretien V2.
    for (const e of mapperEntretiensV1(tabEntV1)) await importerEntretienV1(req.cheminCrp, e)
    await rafraichirAudios()
    vue.value = 'corpus'
  }

  /** Entretien VIDE (Q1b : .sonal absent ou illisible) — même doc que le store. */
  const DOC_VIDE = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] }

  /** Crée un entretien V2 depuis un `tabEnt[]` V1 (E2, plan §3.1) : lit le
   *  `.sonal` (rtrPath relatif au dossier du .crp, résolu par le main) via le
   *  pipeline `importSonal.ts` (MÊME format de fichier), y pose `audioRef`
   *  (audioPath V1 absolu — déjà au format v3, référence pas de copie) et la
   *  trace `meta.sourceV1.rtrPath`.
   *  Q7 : DÉFINITIONS à vide — le codebook/variables du .crp ont déjà été
   *  écrits par E3 et font foi ; les copies divergentes d'un .sonal ne les
   *  touchent pas. Seules les RÈGLES du .sonal (anon-json) sont reprises,
   *  comme à l'import normal (les annotations y sont liées — round-trip).
   *  Q1b : .sonal absent/illisible → entretien VIDE avec juste l'audio. */
  async function importerEntretienV1(cheminCrp: string, e: EntretienV1Import) {
    let payload: PayloadEntretien | null = null
    let reglesAnon: RegleAnon[] | undefined
    const lu = await window.sonal.migrer.lireSonal(cheminCrp, e.rtrPath)
    if (lu) {
      try {
        const r = importerFichier(lu.nom, lu.contenu, (html) =>
          new DOMParser().parseFromString(html, 'text/html'),
        )
        payload = {
          ...r.payload,
          meta: { ...r.payload.meta, audioRef: e.audioRef, sourceV1: { rtrPath: e.rtrPath } },
        }
        reglesAnon = r.reglesAnon
      } catch {
        payload = null // .sonal illisible → Q1b (entretien vide + audio)
      }
    }
    if (!payload) {
      payload = {
        corpsTexte: DOC_VIDE,
        annotations: [],
        ancres: [],
        locuteurs: [],
        meta: { valeursGen: {}, audioRef: e.audioRef, sourceV1: { rtrPath: e.rtrPath } },
        brouillonsAnon: [],
      }
    }
    const res = await window.sonal.corpus.importer(e.titre, payload, [], [], reglesAnon)
    corpus.membership.value = res.corpus.membership
    await corpus.rafraichirScanAnon()
  }

  async function retourCorpus() {
    await fermerEntretien()
    vue.value = 'corpus'
  }
  async function allerAccueil() {
    await fermerEntretien()
    vue.value = 'accueil'
  }

  /** Entrer dans un entretien = le charger (scope entretien), charger son audio
   *  ET basculer sur son écran. */
  async function ouvrirEntretien(id: string) {
    if (!(await ent.ouvrir(id))) return
    await majAudioEntretien(id)
    vue.value = 'entretien'
  }

  /** Ajout d'un entretien (modale à deux zones « fichier d'entretien » /
   *  « fichier son », à la SonalPi) :
   *  - texte seul → import classique (sas `.sonal`) ;
   *  - texte + audio → import puis assignation de l'audio (référence) + onde ;
   *  - audio seul → entretien au texte VIDE (à taper/transcrire) + audio.
   *  Ouvre l'entretien créé dans tous les cas — SAUF si `opts.ouvrir === false`
   *  (geste guidé de l'étape 1 du pas-à-pas : on reste au Corpus pour afficher
   *  le message « étape terminée », l'ouverture ferait la course avec la
   *  validation). */
  async function ajouterEntretien(
    texte: { nom: string; contenu: string } | null,
    audioChemin: string | null,
    opts: { ouvrir?: boolean } = {},
  ) {
    if (!texte && !audioChemin) return
    let id: string
    if (texte) {
      const r = importerFichier(texte.nom, texte.contenu, (html) =>
        new DOMParser().parseFromString(html, 'text/html'),
      )
      const titre = texte.nom.replace(/\.[^.]+$/, '')
      const res = await window.sonal.corpus.importer(
        titre,
        { ...r.payload, legacy: r.legacy as unknown as Record<string, unknown> },
        r.codebook,
        r.variables,
        r.reglesAnon,
      )
      corpus.membership.value = res.corpus.membership
      corpus.majCodebook(res.corpus.codebook)
      corpus.majVariables(res.corpus.variables)
      await corpus.rafraichirScanAnon()
      id = res.id
    } else {
      await ent.sauver()
      const titre = audioChemin!.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
      const res = await window.sonal.corpus.creerEntretienVide(titre)
      corpus.membership.value = res.corpus.membership
      id = res.id
    }
    if (audioChemin) {
      const a = await window.sonal.corpus.assignerAudio(id, audioChemin)
      if (a) await genererEtEcrireWaveform(id, a.audioRef)
      // Rafraîchit le scan des audios : l'étape 1 du pas-à-pas vérifie par
      // entretien que SON audio est bien référencé avant de se valider.
      await rafraichirAudios()
    }
    if (opts.ouvrir !== false) await ouvrirEntretien(id)
  }

  /** « Assigner un audio… » à l'entretien sélectionné dans la vue Corpus :
   *  référence le chemin absolu (audioRef), forme d'onde générée. */
  async function assignerAudioSelection() {
    const id = corpusSelId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const a = await window.sonal.corpus.assignerAudio(id, source)
    if (!a) return
    await genererEtEcrireWaveform(id, a.audioRef)
    await rafraichirAudios()
    if (corpusSelMeta.value) corpusSelMeta.value = { ...corpusSelMeta.value, audio: true }
    // Si cet entretien est OUVERT dans l'éditeur, son modèle en session doit
    // suivre (sinon l'autosave écraserait audioRef avec l'ancien état).
    if (ent.ouvertId.value === id) {
      ent.meta.audioRef = a.audioRef
      await majAudioEntretien(id)
    }
  }

  /** « Assigner un audio… » à l'entretien OUVERT (depuis le lecteur — ex. quand
   *  l'audio référencé est introuvable). Ouvre le dialogue, référence le nouveau
   *  chemin, régénère la forme d'onde et recharge le lecteur. */
  async function reassignerAudioEntretienOuvert() {
    const id = ent.ouvertId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const a = await window.sonal.corpus.assignerAudio(id, source)
    if (!a) return
    await genererEtEcrireWaveform(id, a.audioRef)
    if (ent.ouvertId.value === id) {
      ent.meta.audioRef = a.audioRef
      await majAudioEntretien(id)
    }
  }

  async function exporter() {
    if (!ent.ouvertId.value || !ent.editor.value) return
    await ent.sauver()
    const html = exporterSonal({
      ...ent.donneesExport(),
      codebook: corpus.codebook.value,
      variables: corpus.variables.value,
      reglesAnon: corpus.reglesAnon.value,
    })
    const titre = corpus.membership.value[ent.ouvertId.value]?.titre ?? 'entretien'
    await window.sonal.dialog.choisirExport(`${titre}.sonal`, html)
  }

  async function renommer(id: string, evt: Event) {
    const titre = (evt.target as HTMLInputElement).value.trim()
    if (titre) corpus.membership.value = (await window.sonal.corpus.renommerEntretien(id, titre)).membership
  }

  async function supprimer(id: string) {
    corpus.membership.value = (await window.sonal.corpus.supprimerEntretien(id)).membership
    if (ent.ouvertId.value === id) ent.reinitialiser()
    if (reprise.value?.id === id) reprise.value = null
    if (corpusSelId.value === id) deselectionnerCorpus()
  }

  /** Clic sur un segment du résumé thématique d'une carte (parité SonalPi
   *  `afficherHtmlAtPos`) : ouvre l'entretien et cale le texte sur le segment. */
  async function ouvrirAuSegment(id: string, pos: number) {
    await ouvrirEntretien(id)
    ent.allerAuTexte(pos)
  }

  // --- Confirmation de suppression d'un ENTRETIEN (l'acte le plus gros — même
  //     idiome de bannière que thèmes et locuteurs). ---
  const entretienASupprimer = ref<{ id: string; titre: string } | null>(null)
  function demanderSuppressionEntretien(id: string) {
    entretienASupprimer.value = { id, titre: corpus.membership.value[id]?.titre ?? id }
  }
  async function confirmerSuppressionEntretien() {
    const cible = entretienASupprimer.value
    if (!cible) return
    entretienASupprimer.value = null
    await supprimer(cible.id)
  }

  // --- Sortie d'entretien = fermeture + point de reprise ---
  /** Point de reprise : le dernier entretien fermé (position audio + curseur
   *  texte) pour le rouvrir d'un clic là où on en était. Volatil (session),
   *  comme le journal. */
  const reprise = ref<{ id: string; positionAudio: number; posTexte: number | null } | null>(null)
  /** SORTIR d'un entretien (retour Corpus/Accueil, table de données) le FERME
   *  (sauvé d'abord) en mémorisant le point de reprise. Personne n'écrit dans
   *  un entretien ouvert ailleurs (un seul chemin d'écriture). */
  async function fermerEntretien() {
    const id = ent.ouvertId.value
    if (!id) return
    await ent.sauver()
    // Corpus distant : publication finale PUIS libération du verrou (§4.4 —
    // l'ordre est l'invariant central ; le main ne libère jamais sur un contenu
    // non parti). Sans effet en corpus local.
    if (idDistantCourant.value) {
      try {
        await window.sonal.corpus.fermerEntretien(id)
      } catch {
        /* serveur injoignable : le verrou reste tenu côté serveur, reprise au
           prochain passage — jamais de perte locale */
      }
    }
    reprise.value = {
      id,
      positionAudio: audio.position.value,
      posTexte: ent.editor.value?.state.selection.from ?? null,
    }
    ent.reinitialiser()
    audio.charger(null, null)
  }
  async function allerDonnees() {
    await fermerEntretien()
    await corpus.rafraichirMatrice()
    vue.value = 'donnees'
  }
  /** Rouvre l'entretien du point de reprise et se recale : curseur + défilement
   *  texte, position audio. */
  async function reprendre() {
    const r = reprise.value
    if (!r || !corpus.membership.value[r.id]) return
    await ouvrirEntretien(r.id)
    if (r.posTexte != null) ent.allerAuTexte(r.posTexte)
    if (audio.url.value && r.positionAudio > 0) audio.seek(r.positionAudio)
  }

  // --- Suppression d'un thème DEPUIS l'entretien (croise corpus ↔ entretien) ---
  async function demanderSuppressionTheme(id: string) {
    ent.hintCodage.value = null
    const autres = await window.sonal.corpus.compterUsagesCategorie(id, ent.ouvertId.value ?? undefined)
    if (autres > 0) {
      ent.hintCodage.value = `« ${corpus.nomTheme(id)} » est utilisé dans ${autres} autre(s) entretien — suppression impossible ici.`
      return
    }
    const n = ent.entretien.annotations.filter((a) => a.type === 'codage' && a.code === id).length
    themeASupprimer.value = { id, nom: corpus.nomTheme(id), n }
  }
  /** Confirme : retire les codages de CET entretien (modèle=vérité), supprime la
   *  DÉFINITION au corpus (exceptId → ne recompte pas cet entretien), autosave. */
  async function confirmerSuppressionTheme() {
    const cible = themeASupprimer.value
    if (!cible) return
    ent.retirerCodagesDuCode(cible.id)
    const r = await window.sonal.corpus.supprimerCategorie(cible.id, ent.ouvertId.value ?? undefined)
    if (r.ok) corpus.majCodebook(r.corpus.codebook)
    themeASupprimer.value = null
    await ent.sauver()
  }

  const listeEntretiens = () =>
    Object.entries(corpus.membership.value).map(([id, ref]) => ({ id, ...ref }))

  // Scope DÉMO « Mini Corpus Test » : construit le corpus de démo dans un
  // dossier choisi via le vrai pipeline d'import. Dépendances injectées pour
  // casser le cycle (demo utilise appliquerCorpus défini ci-dessus).
  const demo = utiliserDemo({
    appliquerCorpus,
    majDossierCourant: profil.majDossierCourant,
    rafraichirRecents: profil.rafraichirRecents,
    retourCorpus,
    vue,
    membership: corpus.membership,
    entretien: ent.entretien,
    locuteurs: ent.locuteurs,
    meta: ent.meta,
    ouvertId: ent.ouvertId,
    ongletDroite: ent.ongletDroite,
    variables: corpus.variables,
    texteModifie: ent.texteModifie,
    audiosCorpus,
  })
  // Branche le holder : `appliquerCorpus` restaure désormais le mode démo
  // (panneau « Pas à pas ») quand le corpus ouvert est un corpus démo.
  raccrocherModeCorpus = demo.raccrocherModeCorpus

  onMounted(chargerCorpus)

  // Retour PLAT : les templates (App + composants) utilisent des noms nus. Les
  // wrappers d'orchestration (choisirDossier/ouvrirRecent) écrasent les bruts du profil.
  return {
    ...profil,
    ...corpus,
    ...ent,
    audio, // scope audio (objet nommé : les vues déstructurent ses refs)
    audiosCorpus,
    audiosManquants,
    urlWaveform,
    assignerAudioSelection,
    reassignerAudioEntretienOuvert,
    vue,
    themeASupprimer,
    corpusSelId,
    corpusSelMeta,
    selectionnerCorpus,
    deselectionnerCorpus,
    appliquerCorpus,
    chargerCorpus,
    choisirDossier,
    creerNouveauCorpus,
    ouvrirRecent,
    ouvrirCorpusDistant,
    idDistantCourant,
    dernierTirage,
    tirageEnCours,
    actualiserDistant,
    lectureSeule,
    migrerDepuisV1,
    retourCorpus,
    allerAccueil,
    ouvrirEntretien,
    ouvrirAuSegment,
    ajouterEntretien,
    exporter,
    renommer,
    supprimer,
    entretienASupprimer,
    demanderSuppressionEntretien,
    confirmerSuppressionEntretien,
    reprise,
    reprendre,
    allerDonnees,
    demanderSuppressionTheme,
    confirmerSuppressionTheme,
    listeEntretiens,
    ...demo,
  }
}

export type Sonal = ReturnType<typeof creerSonal>

const CLE: InjectionKey<Sonal> = Symbol('sonal')

/** À appeler UNE fois dans l'App : crée le contexte applicatif et le fournit. */
export function fournirSonal(): Sonal {
  const s = creerSonal()
  provide(CLE, s)
  return s
}
/** Dans un composant de vue : récupère le contexte applicatif partagé. */
export function utiliserSonal(): Sonal {
  const s = inject(CLE)
  if (!s) throw new Error('Contexte « sonal » absent (fournirSonal non appelé).')
  return s
}
