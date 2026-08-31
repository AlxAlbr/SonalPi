import { ref, computed, watch, onMounted, provide, inject, type InjectionKey } from 'vue'
import { importerFichier } from '../import/sas'
import type { ResultatImport } from '../import/importSonal'
import { exporterSonal } from '../import/exportSonal'
import { urlMediaAudio, urlMediaWaveform, genererEtEcrireWaveform } from '../audio/waveform'
import type { CorpusFichier, EntreeRecent, EntretienFichier, MarqueurDemo, PayloadEntretien, RegleAnon } from '../../shared/format'
import { paramsAnonDefaut, MOTS_LIAISON_DEFAUT } from '../../shared/format'
import { texteDuCorps } from '../../shared/entretien/entretien'
import { squeletteCorpus } from '../../shared/corpus/squelette'
import { detailsVariablesEntretien, type BlocLocuteur, type LigneValeur } from '../../shared/corpus/variables'
import { infoGlobale } from '../erreurs'
import type { EtatVerrouPublic, OrphelinDistant, PresencePublic, ProgressionTransfert } from '../../shared/distant'
import { mapperEntretiensV1, type CrpV1Entretien, type DemandeMigration, type EntretienV1Import } from '../../shared/corpus/migrationCrp'
import { useProfil } from './useProfil'
import { useCorpus } from './useCorpus'
import { useEntretien } from './useEntretien'
import { useAudio } from './useAudio'
import { utiliserDemo } from './demo'

/**
 *  ORCHESTRATION applicative : instancie et COUD les trois scopes (profil,
 *  corpus, entretien) et porte la navigation. Créé UNE fois par l'App (`fournirSonal`),
 *  `provide`/`inject` aux composants de vue → tous partagent le même éditeur et le
 *  même modèle (les composables ne sont pas ré-instanciés).
 */
export function creerSonal() {
  const profil = useProfil()

  // Indirection pour casser le cycle : le scope corpus doit sauver l'entretien ouvert avant un compte d'usages (`flush`),
  // mais l'entretien est créé APRÈS le corpus, qui lui injecte `couleurTrait` ; on route `flush` via un holder réaffecté.
  let sauverEntretien: () => Promise<void> = async () => {}
  // Indirection pour casser un cycle de dépendances :
  //     `appliquerCorpus` doit restaurer le mode démo (panneau « Pas à pas ») quand le corpus ouvert porte un marqueur `demo`,
  //     mais le scope demo est créé APRÈS (il injecte `appliquerCorpus`).
  //     Même patron que `sauverEntretien` : holder réaffecté.
  let raccrocherModeCorpus: (
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ) => Promise<void> = async () => {}
  const corpus = useCorpus({ flush: () => sauverEntretien() })

  // Scope AUDIO : le lecteur de l'entretien ouvert.
  // Les trois consommateurs (LecteurAudio en haut, barre sur la forme d'onde, bloc-lu de l'éditeur)
  // se coordonnent par cet état réactif partagé.
  const audio = useAudio()

  const ent = useEntretien({
    couleurTrait: corpus.couleurTrait, // le marquage résout la couleur d'un code (corpus)
    tailleTrait: corpus.tailleTheme, // …et sa taille de police (parité SonalPi1)
    // Un thème inactif est masqué du marquage et refusé au codage (scope entretien).
    estCodeActif: corpus.estCodeActif,
    apresSauvegarde: () => corpus.rafraichirUsages(), // après un save, les usages suivent
    codeExtraits: () => corpus.codeCourant.value, // filtre de la requête Extraits
    nomCode: (code) => corpus.nomTheme(code), // libellés du journal (noms au corpus)
    // Catégories de note : définitions au corpus, résolues ici pour le scope entretien (nom affichable + défaut du formulaire de création).
    nomCategorieNote: (id) => corpus.nomCategorieNote(id),
    categorieNoteDefaut: () => corpus.categorieNoteDefaut(),
    reglesAnon: () => corpus.reglesAnon.value, // règles corpus (menu multi-pseudo, promotions 3b)
    rafraichirReglesCorpus: () => corpus.rafraichirScanAnon(), // cache règles après mutation
    prioriteAnon: () => corpus.paramsAnon.value.prioriteValidation, // étape 4a : portée d'Entrée
    // Mots de liaison : suggestion d'entité-cœur à la validation d'une entité à affixe.
    motsLiaison: () =>
      corpus.paramsAnon.value.motsLiaison ?? { actif: true, liste: [...MOTS_LIAISON_DEFAUT] },
    thematiques: () =>
      corpus.paramsAnon.value.thematiques ?? { actif: false, liste: ['PER', 'LOC', 'ORG', 'DAT'] }, // 4c
    categoriserRegle: async (id, cat) => {
      await window.sonal.corpus.regleAnonCategoriser(id, cat)
      await corpus.rafraichirScanAnon() // la projection des lignes relit la règle fraîche
    },
    lectureSeule: () => lectureSeule.value, // définitions : grisage permanent en distant
    entretienEditable: () => !lectureSeule.value && !ent.verrouAutrui.value, // ni hors ligne, ni verrou à autrui
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
    // Clic DANS le texte → seek au temps interpolé à cet endroit,
    // la barre sur la forme d'onde suit, play reprend là.
    clicTexte: (pos) => {
      if (!audio.url.value) return
      const t = ent.tempsAuTexte(pos)
      if (t != null) audio.seek(t)
    },
    // Double-espace dans le texte = play/pause. Ne bascule (et ne signale d'avoir
    // agi) que si un audio est chargé.
    basculerLecture: () => {
      if (!audio.url.value) return false
      audio.basculer()
      return true
    },
  })
  sauverEntretien = ent.sauver

  // La lecture avance → le bloc lu suit (surlignage + défilement).
  // Décharger l'audio (url null) éteint le surlignage.
  watch(audio.position, (t) => ent.majPlageLue(audio.url.value ? t : null))
  watch(audio.url, (u) => {
    if (!u) ent.majPlageLue(null)
  })

  // --- Navigation : Accueil → Corpus → Entretien (+ Table de données) ---
  const vue = ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>('corpus')

  // --- Largeur du panneau vidéo, mémorisée PAR CORPUS (settings.json) ---
  const dossierCourantDir = ref<string | null>(null)
  /** Applique la largeur mémorisée du corpus courant.
   *  Laisse 0 → la largeur par défaut sera déduite du ratio de la vidéo à sa lecture. */
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
  // Sélectionner (clic sur la carte) montre ses métadonnées à gauche ; le crayon, lui, OUVRE l'éditeur.
  // On lit le fichier à la sélection (requête ciblée, pas de cache) : le renderer ne tient jamais tous les entretiens.
  const corpusSelId = ref<string | null>(null)
  /** Panneau métadonnées de l'entretien sélectionné : compteurs + variables résolues pour AFFICHAGE, lecture seule. */
  interface DetailsVariables {
    nbLocuteurs: number
    nbValeurs: number
    audio: boolean
    /** Transcription chronométrée présente (ancres d'un SRT/VTT importé) —
     *  le bouton « Assigner un srt… » se masque quand c'est le cas. */
    srt: boolean
    generales: LigneValeur[]
    parLocuteur: BlocLocuteur[]
  }
  /** Détails AFFICHABLES depuis le fichier lu d'un entretien.
   *  Partagé entre la sélection et le rafraîchissement après mutation. */
  function detailsDepuisLecture(data: EntretienFichier): DetailsVariables {
    const details = detailsVariablesEntretien(corpus.variables.value, data)
    const nbValeurs =
      Object.keys(data.meta.valeursGen).length +
      data.locuteurs.reduce((s, l) => s + Object.keys(l.valeursLoc).length, 0)
    return {
      nbLocuteurs: data.locuteurs.length,
      nbValeurs,
      audio: data.meta.audioRef != null,
      srt: (data.ancres?.length ?? 0) > 0,
      generales: details.generales,
      parLocuteur: details.parLocuteur,
    }
  }
  const corpusSelMeta = ref<DetailsVariables | null>(null)
  async function selectionnerCorpus(id: string) {
    if (corpusSelId.value === id) return deselectionnerCorpus() // re-clic = fermer
    corpusSelId.value = id
    corpusSelMeta.value = null
    const res = await window.sonal.corpus.lireEntretien(id)
    if (res.ok && corpusSelId.value === id) {
      // Panneau métadonnées (lecture seule) : compteurs + variables résolues,
      // comme le panneau « Détails de l'entretien » de SonalPi1.
      corpusSelMeta.value = detailsDepuisLecture(res.data)
    }
  }
  /** Recalcule le panneau de l'entretien sélectionné après une mutation,
   *  sans basculer la sélection. */
  async function rafraichirMetaSelection() {
    const id = corpusSelId.value
    if (!id) return
    const res = await window.sonal.corpus.lireEntretien(id)
    if (res.ok && corpusSelId.value === id) corpusSelMeta.value = detailsDepuisLecture(res.data)
  }
  function deselectionnerCorpus() {
    corpusSelId.value = null
    corpusSelMeta.value = null
  }
  // Confirmation de suppression d'un thème DEPUIS l'entretien (orchestration).
  const themeASupprimer = ref<{ id: string; nom: string; n: number } | null>(null)

  // --- Audio : médias du corpus (requête) + chargement du lecteur ---
  /** Scan `png/` du corpus (id → { audio, waveform }) : alimente les cartes de l'écran Corpus.
   *  REQUÊTE, pas de cache. */
  const audiosCorpus = ref<Record<string, { audio: string | null; waveform: string | null }>>({})
  async function rafraichirAudios() {
    audiosCorpus.value = await window.sonal.corpus.audios()
  }
  /** Intégrité à l'ouverture : ids des entretiens dont l'audio référencé est introuvable.
   *  Calculé à chaque ouverture de corpus, non rafraîchi en session (un ré-ouvrir rafraîchit). */
  const audiosManquants = ref<Record<string, 'manquant'>>({})
  /** Vérifie l'existence des audios référencés (IPC côté main) et ne retient que les manquants. */
  async function verifierIntegriteAudios(): Promise<Record<string, 'manquant'>> {
    const res = await window.sonal.corpus.verifierAudios()
    const manquants: Record<string, 'manquant'> = {}
    for (const [id, s] of Object.entries(res)) if (s === 'manquant') manquants[id] = 'manquant'
    return manquants
  }
  /** Régénère EN FOND les ondes manquantes (dérivés régénérables).
   *  Après un changement de rendu (ex. ex-onde verte → gris neutre), la migration est manuelle :
   *  supprimer les `png/<id>.png` → régénérés ici. */
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

  // Quitter l'écran entretien met la lecture en PAUSE : le lecteur n'est visible
  // que là, pas de lecture fantôme sans commandes à l'écran.
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
  /** Applique un corpus chargé (définitions + membership) et RÉINITIALISE l'entretien ouvert,
   *  on change potentiellement de dossier.
   *  `dir` (optionnel) permet de restaurer le mode démo quand le corpus ouvert est le corpus de démo. */
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
    corpus.majCategoriesNote(c.categoriesNote)
    corpus.paramsAnon.value = { ...paramsAnonDefaut(), ...(c.paramsAnon ?? {}) }
    await corpus.rafraichirUsages()
    await rafraichirAudios()
    audiosManquants.value = await verifierIntegriteAudios() // bandeau d'intégrité
    void regenererOndesManquantes() // en fond : ne bloque pas l'arrivée à l'écran
    void chargerTailleVideo() // largeur vidéo mémorisée pour CE corpus
    await raccrocherModeCorpus(c.demo, dir ?? null) // restaure le mode démo (panneau « Pas à pas »)
  }

  async function chargerCorpus() {
    // Au démarrage, on charge le 1er récent LOCAL s'il existe (= dernier corpus local ouvert).
    // Sinon (premier lancement) : modèle vide, on reste sur l'Accueil — l'utilisateur
    // choisit explicitement (Mini Corpus Test ou un dossier).
    // « Corpus courant » de l'Accueil n'est plus une carte dédiée : c'est le
    // 1er récent (le loaded corpus est TOUJOURS le 1er récent, par construction).
    // Les récents DISTANTS sont volontairement sautés au démarrage : pas de réseau
    // bloquant au lancement — un distant se rouvre d'un clic via Récents.
    quitterDistant()
    await profil.rafraichirRecents()
    const premierLocal = profil.recents.value.find((r) => r.type === 'local')
    if (premierLocal && premierLocal.type === 'local') {
      await appliquerCorpus(await profil.ouvrirDossier(premierLocal.dir), premierLocal.dir)
    }
    vue.value = 'accueil'
  }

  /** « Ouvrir un corpus… » : le scope profil bascule le store sur un autre dossier,
   *  renvoie son contenu ; on l'applique au modèle. */
  async function choisirDossier() {
    const r = await profil.choisirDossier()
    if (!r) return
    quitterDistant()
    await appliquerCorpus(r.corpus, r.dir)
    vue.value = 'corpus'
  }
  /** « Nouveau corpus… » : crée un corpus NEUF (avec son `nom` de projet) dans le dossier choisi.
   *  Ouvre l'existant si le dossier en contient déjà un (on n'écrase jamais, son nom fait foi).
   *  C'est le pendant création de `choisirDossier`. */
  async function creerNouveauCorpus(dir: string, nom: string) {
    const r = await window.sonal.corpus.creerNouveau(dir, nom)
    profil.dossierCourantNom.value = r.nom
    quitterDistant()
    await appliquerCorpus(r.corpus, r.dir)
    vue.value = 'corpus'
  }
  /** Rouvrir un corpus récent, local par son chemin ou distant par `distant:ouvrir(id)`.
   *  JAMAIS le chemin miroir en local : le cycle verrou/publie serait contourné. */
  async function ouvrirRecent(entree: EntreeRecent) {
    if (entree.type === 'distant') {
      await ouvrirCorpusDistant(entree.id)
      return
    }
    quitterDistant()
    await appliquerCorpus(await profil.ouvrirDossier(entree.dir), entree.dir)
    vue.value = 'corpus'
  }

  /** « Ouvrir un corpus distant » : tire le miroir du compte configuré puis
   *  bascule le store dessus — le renderer reçoit exactement la même forme
   *  qu'une ouverture locale, il ne sait pas qu'un serveur existe. Échec
   *  réseau → exception IPC, l'app reste sur le corpus courant (l'appelant
   *  affiche l'erreur). */
  async function ouvrirCorpusDistant(id: string) {
    const r = await window.sonal.distant.ouvrir(id)
    idDistantCourant.value = r.distant.id // active la zone de synchro + le pull doux
    enLigne.value = true // l'ouverture vient de réussir (pull inclus)
    dernierTirage.value = new Date().toISOString() // le main vient de tirer
    absorberVerrous(r.verrous) // badges fiables dès le premier pull
    audiosInaccessibles.value = r.inaccessibles ?? [] // audios désignés non rapatriés
    profil.dossierCourantNom.value = r.nom
    await appliquerCorpus(r.corpus, r.dir)
    // Verrous orphelins de NOTRE machine (crash sans libération) ?
    // Le dialogue propose reprendre/abandonner ; « plus tard » garde l'état.
    orphelinsDistants.value = (await window.sonal.distant.orphelins()) ?? []
    vue.value = 'corpus'
  }

  /** Création directe d'un corpus distant : publie le squelette sur le serveur puis OUVRE immédiatement,
   *  même comportement que le local : créer = atterrir sur l'écran Corpus.
   *  La publication côté main est idempotente ; un échec lève (l'appelant affiche), le corpus courant reste en place. */
  async function creerCorpusDistant(params: {
    urlServeur: string
    utilisateur: string
    motDePasse: string
    nomProjet: string
  }) {
    const r = await window.sonal.distant.creer(params)
    if (!r.ok) throw new Error(r.note)
    await profil.rafraichirRecents() // le nouveau corpus rejoint les « Récents 🌐 »
    await ouvrirCorpusDistant(r.compte.id) // tirage du miroir + bascule + écran Corpus
    return r.compte
  }

  // ── Badges de verrou fiables : l'état « tenu par X » en vue Corpus
  //    vient du SERVEUR (scan verrous/ à chaque pull), pas d'une déduction ;
  //    clé = id d'entretien.
  const badgesVerrous = ref<Record<string, EtatVerrouPublic>>({})
  /** Absorbe les verrous vus au pull (ou à l'ouverture) dans les badges.
   *  Les deux conventions de chemin sont acceptées : `verrous/<id>.lock.json` (variante B)
   *  et `entretiens/<id>.json` (variante A, le PROPFIND files_lock porte sur les fichiers de données eux-mêmes). */
  function absorberVerrous(entrees: { chemin: string; contenu: EtatVerrouPublic | null }[]) {
    const suivant: Record<string, EtatVerrouPublic> = {}
    for (const e of entrees) {
      if (!e.contenu) continue
      let m = /^verrous\/(.+)\.lock\.json$/.exec(e.chemin)
      if (!m) m = /^entretiens\/(.+)\.json$/.exec(e.chemin)
      if (m) suivant[m[1]] = e.contenu
    }
    badgesVerrous.value = suivant
  }
  /** Détenteur du verrou d'un entretien (null = libre ou inconnu). */
  function badgeVerrou(id: string): EtatVerrouPublic | null {
    return badgesVerrous.value[id] ?? null
  }

  // ── Présence : « ouvert par Olivier » — informatif, JAMAIS décisionnel.
  //    La liste vient du tirage (filtrée côté main : périmées et notre propre
  //    poste exclus).
  const presences = ref<PresencePublic[]>([])
  /** Absorbe les présences d'un tirage (absentes en local → liste vide). */
  function absorberPresences(liste?: PresencePublic[]) {
    presences.value = liste ?? []
  }
  /** Les autres postes qui CONSULTENT cet entretien, sans forcément tenir le verrou.
   *  Vide le plus souvent — c'est le but : ne parler que si utile. */
  function presencesSur(id: string): PresencePublic[] {
    return presences.value.filter((p) => p.entretienOuvert === id)
  }

  // ── Reprise crash : orphelins proposés au dialogue ──────────────────────
  const orphelinsDistants = ref<OrphelinDistant[]>([])
  /** « Reprendre et publier » : publie la copie locale puis libère.
   *  Rafraîchit ensuite : notre publication a changé le serveur, et le badge doit tomber. */
  async function reprendreOrphelin(cheminVerrou: string): Promise<{ ok: boolean; raison?: string }> {
    const r = await window.sonal.distant.reprendreOrphelin(cheminVerrou)
    orphelinsDistants.value = orphelinsDistants.value.filter((o) => o.cheminVerrou !== cheminVerrou)
    if (r.ok) await actualiserDistant(true)
    return r
  }
  /** « Abandonner » : déverrouille sans publier (copie locale conservée). */
  async function abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    await window.sonal.distant.abandonnerOrphelin(cheminVerrou)
    orphelinsDistants.value = orphelinsDistants.value.filter((o) => o.cheminVerrou !== cheminVerrou)
    await actualiserDistant(true)
  }

  // ── Corpus distant : « Actualiser » + minuterie douce ───────────────────
  // Le déclencheur est le PULL, pas un watcher fichier : après un tirage, une
  // re-requête suffit (les vues corpus sont sans cache).
  // Minuterie douce ~60 s quand l'écran Corpus est affiché ; « Actualiser » force à la demande.
  const idDistantCourant = ref<string | null>(null) // null = corpus local
  const dernierTirage = ref<string | null>(null) // horodatage affiché (« copie de HH:MM »)
  const tirageEnCours = ref(false)
  /** Progression du transfert binaire EN COURS : rapatriement au tirage ou téléversement depuis la modale,
   *  dernier événement IPC reçu.
   *  Null = aucun transfert (l'étiquette affiche alors le geste, pas la progression). */
  const progressionDistant = ref<ProgressionTransfert | null>(null)
  window.sonal.distant.surProgression((p) => {
    progressionDistant.value = p
  })
  /** Pourcentage affichable (null si taille inconnue ou hors transfert). */
  const pourcentageProgression = computed(() => {
    const p = progressionDistant.value
    if (!p || !p.total) return null
    return Math.min(100, Math.round((p.octets / p.total) * 100))
  })
  /** Connectivité OBSERVÉE : le pull est la sonde.
   *  Un tirage réussi → en ligne ; un échec silencieux (minuterie) → hors ligne.
   *  Les gestes sur les définitions sont alors grisés (« nécessite une connexion »),
   *  l'édition locale des entretiens sous verrou continue. */
  const enLigne = ref(true)
  /** Retour au LOCAL : les états du distant tombent (badges, orphelins, horodatage).
   *  Appelé par chaque changement de corpus vers un dossier local. */
  function quitterDistant() {
    idDistantCourant.value = null
    dernierTirage.value = null
    badgesVerrous.value = {}
    presences.value = []
    orphelinsDistants.value = []
    statutSession.value = { etat: 'aucune' }
    publiErreur.value = null
    divergenceProposee.value = null
    enLigne.value = true // redevient pertinent au prochain corpus distant
  }
  /** En distant HORS LIGNE, lecture seule pour les DÉFINITIONS seulement :
   *  le contenu d'un entretien sous NOTRE verrou reste éditable.
   *  En ligne, tout est éditable selon ses gardes propres. */
  const lectureSeule = computed(() => idDistantCourant.value !== null && !enLigne.value)

  /** Garde de la Table de données PAR LIGNE.
   *  Dans la table on ne tient JAMAIS de session (y entrer ferme toute session d'écriture), donc tout badge 🔒 est nécessairement autrui.
   *  Ne pas confondre avec `entretienEditable`, propre à l'écran Entretien ouvert. */
  function tableLigneEditable(id: string): boolean {
    return !lectureSeule.value && !badgeVerrou(id)
  }

  /** Garde des MÉTADONNÉES du panneau Corpus (nom, date, boutons audio).
   *  Badge serveur présent = entretien tenu par QUELQU'UN D'AUTRE : panneau en lecture seule.
   *  Règle d'UI : l'intégrité repose sur les écritures transactionnelles, pas sur ce grisage. */
  function metaEditables(id: string): boolean {
    return !lectureSeule.value && !badgeVerrou(id)
  }

  /** Tire le miroir et absorbe TOUJOURS l'état des verrous (badges fiables).
   *  Si le contenu a changé côté serveur :
   *   - aucun entretien ouvert → ré-application complète ;
   *   - un entretien OUVERT → rafraîchissement SANS fermer la session
   *     (l'éditeur reste monté ; le fichier sous notre verrou n'a pas pu être
   *     écrasé par le pull).
   *  `silencieux` (minuterie) : une panne réseau ne crie pas — on garde la
   *  copie locale datée, le prochain tick réessaiera.
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
      enLigne.value = true // le serveur a répondu : connectivité rétablie
      dernierTirage.value = t.date
      absorberVerrous(t.verrous)
      absorberPresences(t.presences)
      // Audios désignés NON rapatriés au tirage (403 droits, 404, réseau),
      // matière de l'étiquette du lecteur.
      audiosInaccessibles.value = t.inaccessibles ?? []
      // Un collègue a poussé des règles corpus ? Rejouer la réconciliation
      // sur l'entretien OUVERT (même dialogue que la promotion), jamais de
      // divergence silencieuse.
      if (t.telecharges.includes('corpus.json') && ent.ouvertId.value) {
        ent.detecterDivergencesPostTirage()
      }
      if (t.telecharges.length > 0 || t.corbeille.length > 0) {
        if (ent.ouvertId.value) {
          await rafraichirCorpusSansFermer()
        } else {
          await appliquerCorpus(await window.sonal.corpus.ouvrir(), dossierCourantDir.value ?? undefined)
        }
      }
      return true
    } catch (e) {
      if (!silencieux) throw e
      enLigne.value = false // minuterie : panne réseau → définitions verrouillées
      return false
    } finally {
      tirageEnCours.value = false
      progressionDistant.value = null // plus de transfert → l'UI ré-affiche le geste
    }
  }

  /** Rafraîchit définitions + membership depuis le miroir SANS toucher à l'entretien ouvert,
   *  pas de `ent.reinitialiser`, pas de coupure audio.
   *  Un collègue a publié pendant notre session : ses changements suivent, notre édition continue. */
  async function rafraichirCorpusSansFermer() {
    const c = await window.sonal.corpus.ouvrir()
    corpus.membership.value = c.membership
    corpus.majCodebook(c.codebook)
    corpus.majVariables(c.variables)
    corpus.majCategoriesNote(c.categoriesNote)
    corpus.paramsAnon.value = { ...paramsAnonDefaut(), ...(c.paramsAnon ?? {}) }
    await corpus.rafraichirUsages()
    await rafraichirAudios()
  }

  /** La minuterie ne vit que sur l'écran Corpus d'un corpus distant :
   *  le composant reste monté sous v-show → condition dans le tick, pas au montage. */
  setInterval(() => {
    if (vue.value === 'corpus' && idDistantCourant.value) void actualiserDistant(true)
  }, 60_000)

  // ── Statut de la session d'écriture de l'entretien ouvert ───────────────
  // Poll doux (5 s) tant qu'un entretien est ouvert en corpus distant ;
  // l'état vient du main (`SessionsDEntretien.etat`) : sale ? dernier publi ?
  type EtatSessionPublic = { etat: 'aucune' | 'a-nous'; dernierPubli?: string | null; sale?: boolean }
  const statutSession = ref<EtatSessionPublic>({ etat: 'aucune' })
  /** Message d'échec de publication (divergence) affiché près du statut. */
  const publiErreur = ref<string | null>(null)
  async function rafraichirStatutSession() {
    const id = ent.ouvertId.value
    if (!id || !idDistantCourant.value) {
      statutSession.value = { etat: 'aucune' }
      return
    }
    try {
      statutSession.value = await window.sonal.corpus.etatSession(id)
    } catch {
      /* le main n'a plus de corpus distant : statut inchangé */
    }
  }
  setInterval(() => {
    if (vue.value === 'entretien' && idDistantCourant.value) void rafraichirStatutSession()
  }, 5_000)
  watch([ent.ouvertId, idDistantCourant], () => void rafraichirStatutSession())

  /** « Publier maintenant » : sauve d'abord l'autosave éventuel, puis PUT
   *  If-Match sous verrou toujours tenu. Divergence → message net, JAMAIS
   *  d'écrasement (la copie locale a été mise de côté côté main). */
  async function publierMaintenant(): Promise<void> {
    const id = ent.ouvertId.value
    if (!id || !idDistantCourant.value) return
    await ent.sauver()
    publiErreur.value = null
    try {
      const r = await window.sonal.corpus.publierEntretien(id)
      if (!r.ok && r.raison === 'divergence') {
        publiErreur.value =
          'Le serveur a changé pendant notre session (contournement du verrou). Vos modifications ont été mises de côté localement — rien n’a été écrasé.'
      }
    } catch {
      publiErreur.value = 'Serveur injoignable — réessayez « Publier maintenant ».'
    }
    await rafraichirStatutSession()
  }

  /** Migration SonalPi1 → SonalPi2 : exécute la création du corpus SonalPi2, le main écrit, ouvre et ajoute aux récents.
   *  Applique le corpus au modèle, puis IMPORTE les entretiens SonalPi1 (lecture des .Sonal + audio).
   *  Même geste de profil que `ouvrirDossier` (nom courant + récents). */
  async function migrerDepuisV1(req: DemandeMigration, tabEntV1?: CrpV1Entretien[]) {
    const r = await window.sonal.migrer.executer(req)
    profil.dossierCourantNom.value = r.nom
    await profil.rafraichirRecents()
    quitterDistant()
    await appliquerCorpus(r.corpus, r.dir)
    // Migration SonalPi1 : chaque `tabEnt[]` → un entretien.
    for (const e of mapperEntretiensV1(tabEntV1)) await importerEntretienV1(req.cheminCrp, e)
    // Les entretiens (et leurs codages) arrivent APRÈS `appliquerCorpus` : on
    // recalcule le calque thématique des cartes — il serait vide sinon, et seul
    // un premier aller-retour dans un entretien (sauvegarde → rafraîchir) le ferait apparaître.
    await corpus.rafraichirUsages()
    await rafraichirAudios()
    // Même geste qu'à l'ouverture d'un corpus : les ondes manquantes sont
    // régénérées en fond, le « mur » apparaît dès l'arrivée.
    void regenererOndesManquantes()
    vue.value = 'corpus'
  }

  /** Entretien VIDE (Q1b : .sonal absent ou illisible) — même doc que le store. */
  const DOC_VIDE = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] }

  /** Crée un entretien depuis un `tabEnt[]` SonalPi1 : lit le `.sonal` via le pipeline `importSonal.ts`,
   *  y pose `audioRef` (déjà au format v3, référence pas de copie) et la trace `meta.sourceV1.rtrPath`.
   *  DÉFINITIONS à vide : le codebook/variables du .crp font déjà foi, les copies divergentes d'un .sonal ne les touchent pas.
   *  Seules les RÈGLES du .sonal (anon-json) sont reprises, comme à l'import normal (les annotations y sont liées, round-trip).
   *  Un .sonal absent ou illisible → entretien VIDE avec juste l'audio. */
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
    if (idDistantCourant.value) void window.sonal.distant.noterEntretienOuvert(null)
    vue.value = 'corpus'
  }
  async function allerAccueil() {
    await fermerEntretien()
    if (idDistantCourant.value) void window.sonal.distant.noterEntretienOuvert(null)
    vue.value = 'accueil'
  }

  /** Entrer dans un entretien = le charger (scope entretien), charger son audio
   *  ET basculer sur son écran. En distant : proposer au passage la FUSION d'une
   *  éventuelle copie de divergence (mise de côté par une rétrogradation). */
  async function ouvrirEntretien(id: string) {
    if (!(await ent.ouvrir(id))) return
    // Présence : les autres postes verront « ouvert par nous ». Best effort.
    if (idDistantCourant.value) void window.sonal.distant.noterEntretienOuvert(id)
    await proposerFusionDivergence(id)
    await majAudioEntretien(id)
    vue.value = 'entretien'
  }

  /* ── Fusion assistée (copie de divergence à la réouverture) ──────────── */
  /** Copie proposée au dialogue (null = rien à proposer / déjà traité).
   *  Le contenu est lu UNE fois ; `fusionnable` = garde « texte identique ».
   *  Types : contenu = EntretienFichier brut du main (validation défensive au
   *  moment de l'usage). */
  const divergenceProposee = ref<{
    chemin: string
    date: string
    contenu: unknown
    fusionnable: boolean
  } | null>(null)
  async function proposerFusionDivergence(id: string) {
    divergenceProposee.value = null
    if (!idDistantCourant.value) return
    const liste = await window.sonal.distant.listerDivergences()
    const copie = liste.filter((d) => d.id === id).at(-1) // la plus RÉCENTE
    if (!copie) return
    const contenu = (await window.sonal.distant.lireDivergence(copie.chemin)) as
      | Parameters<typeof ent.fusionPossible>[0]
      | null
    if (!contenu) return
    divergenceProposee.value = {
      chemin: copie.chemin,
      date: copie.date,
      contenu,
      fusionnable: ent.fusionPossible(contenu),
    }
  }
  /** « Fusionner » : applique les apports de la copie au modèle ouvert puis jette la copie,
   *  elle est absorbée — pas de doublon à la prochaine fois. */
  async function confirmerFusion() {
    const d = divergenceProposee.value
    if (!d || !d.fusionnable) return
    await ent.absorberFusion(d.contenu as Parameters<typeof ent.absorberFusion>[0])
    await window.sonal.distant.supprimerDivergence(d.chemin)
    divergenceProposee.value = null
  }
  /** Même garde que l'éditeur : le dialogue de fusion n'active « Fusionner »
   *  que si l'entretien ouvert est réellement éditable. */
  const entretienEditable = computed(() => !lectureSeule.value && !ent.verrouAutrui.value)

  /** « Jeter » : la copie est abandonnée explicitement (jamais automatique). */
  async function jeterDivergence() {
    const d = divergenceProposee.value
    if (!d) return
    await window.sonal.distant.supprimerDivergence(d.chemin)
    divergenceProposee.value = null
  }
  /** « Plus tard » : la copie reste en place, re-proposée à la prochaine ouverture. */
  function plusTardDivergence() {
    divergenceProposee.value = null
  }

  /** Ajout d'un entretien (modale à deux zones « fichier d'entretien » / « fichier son »).
   *  Texte seul → import classique (sas `.sonal`) ; texte + audio → import puis assignation de l'audio ;
   *  audio seul → entretien au texte VIDE (à taper/transcrire) + audio.
   *  Ouvre l'entretien créé dans tous les cas, SAUF si `opts.ouvrir === false`
   *  (geste guidé de l'étape 1 du pas-à-pas : on reste au Corpus pour afficher le message « étape terminée »,
   *  l'ouverture ferait la course avec la validation). */
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
      corpus.majCategoriesNote(res.corpus.categoriesNote)
      await corpus.rafraichirScanAnon()
      await corpus.rafraichirUsages() // le calque des cartes suit le nouvel entretien.
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
    // suivre : sinon l'autosave écraserait audioRef avec l'ancien état.
    if (ent.ouvertId.value === id) {
      ent.meta.audioRef = a.audioRef
      await majAudioEntretien(id)
    }
  }

  /** « Effacer l'audio » (panneau métadonnées) : détache le média référencé.
   *  Ref partagée, désignation distante, association locale et forme d'onde dérivée : tout part, le texte reste.
   *  Entretien ouvert : son modèle en session suit, sinon un autosave en file écrirait l'ancien état. */
  async function effacerAudioSelection() {
    const id = corpusSelId.value
    if (!id) return
    if (ent.ouvertId.value === id) {
      ent.meta.audioRef = null
      ent.meta.audioDistant = null
      await ent.sauver() // vide la file d'autosave (le retrait va être écrit)
    }
    await window.sonal.corpus.effacerAudio(id)
    await rafraichirAudios()
    audiosManquants.value = await verifierIntegriteAudios()
    await rafraichirMetaSelection()
    if (ent.ouvertId.value === id) await majAudioEntretien(id)
  }

  /** « Assigner un srt… » (panneau métadonnées) : importe une transcription
   *  dont le contenu remplace l'éditeur (texte + ancres + locuteurs).
   *  Si l'éditeur porte déjà du texte, on demande confirmation d'abord : jamais d'écrasement silencieux. */
  const srtASurEcrire = ref<string | null>(null)
  const srtMessage = ref<string | null>(null)
  async function demanderSrt() {
    const id = corpusSelId.value
    if (!id) return
    // Un texte tapé en session doit compter dans la garde, sinon un contenu
    // non sauvé serait ignoré. On vide la file d'autosave avant la lecture.
    if (ent.ouvertId.value === id) await ent.sauver()
    const lecture = await window.sonal.corpus.lireEntretien(id)
    if (!lecture.ok) return
    srtMessage.value = null
    if (texteDuCorps(lecture.data.corpsTexte).trim() !== '') {
      srtASurEcrire.value = id // la bannière demande confirmation.
      return
    }
    await importerSrtDans(id)
  }
  function confirmerSrt() {
    const id = srtASurEcrire.value
    srtASurEcrire.value = null
    if (id) void importerSrtDans(id)
  }
  /** Importe le SRT choisi : la transcription de l'entretien est remplacée.
   *  Les données saisies AUTOUR sont préservées (valeurs EAV, notes,
   *  brouillons anon et legacy). On remplace le texte, pas les méta. */
  async function importerSrtDans(id: string) {
    const fichier = await window.sonal.dialog.choisirSrt(demo.racineSources.value ?? undefined)
    if (!fichier) return
    let importe: ResultatImport
    try {
      importe = importerFichier(fichier.nom, fichier.contenu, (html) =>
        new DOMParser().parseFromString(html, 'text/html'),
      )
    } catch (err) {
      srtMessage.value = err instanceof Error ? err.message : String(err)
      return
    }
    srtMessage.value = null
    const ouvert = ent.ouvertId.value === id
    if (ouvert) await ent.sauver() // un autosave en file écrirait l'ancienne transcription.
    const lecture = await window.sonal.corpus.lireEntretien(id)
    if (!lecture.ok) return
    try {
      await window.sonal.corpus.ecrireEntretien(id, {
        corpsTexte: importe.payload.corpsTexte,
        annotations: importe.payload.annotations,
        ancres: importe.payload.ancres,
        locuteurs: importe.payload.locuteurs,
        meta: lecture.data.meta,
        notes: lecture.data.notes,
        brouillonsAnon: lecture.data.brouillonsAnon,
        pseudosDeclares: lecture.data.pseudosDeclares,
        legacy: lecture.data.legacy,
      })
    } catch (err) {
      srtMessage.value = err instanceof Error ? err.message : String(err)
      return
    }
    // Session ouverte : recharger depuis le disque (le contenu a changé).
    if (ouvert) await ent.ouvrir(id)
    await rafraichirMetaSelection()
  }

  /** « Assigner un audio… » à l'entretien OUVERT (depuis le lecteur, ex. audio référencé introuvable).
   *  Ouvre le dialogue, référence le nouveau chemin, régénère la forme d'onde et recharge le lecteur.
   *  LOCAL uniquement : écrit la ref partagée (sous garde store). */
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

  /** « Associer l'audio local… » : en corpus DISTANT, l'audioRef partagée pointe chez le poste qui a assigné.
   *  On RÉFÉRENCE ici un fichier de NOTRE machine (jamais de copie) dans une association machine-locale,
   *  PAS dans le JSON partagé : écrire notre chemin absolu déclencherait des publications en cascade entre postes.
   *  L'onde est régénérée (dérivé local) et le lecteur rechargé. */
  async function associerAudioEntretienOuvert() {
    const id = ent.ouvertId.value
    if (!id) return
    const source = await window.sonal.dialog.choisirAudio()
    if (!source) return
    const a = await window.sonal.corpus.associerAudioLocal(id, source)
    if (!a) return
    await genererEtEcrireWaveform(id, a.audioRef)
    if (ent.ouvertId.value === id) await majAudioEntretien(id)
    audiosManquants.value = await verifierIntegriteAudios()
  }

  // ── État du média désigné, à côté de la barre de lecture ───────────────
  /** Derniers échecs de rapatriement, croisés avec la désignation de l'entretien ouvert
   *  pour distinguer « pas encore ici » de « bloqué par les droits ». */
  const audiosInaccessibles = ref<{ chemin: string; raison: string }[]>([])

  /** État EFFECTIF de l'audio de l'entretien ouvert (corpus distant seul) :
   *  ok (jouable ici) · distant (désigné, copie pas encore téléchargée) ·
   *  inaccessible (le serveur refuse, message explicatif + réessai) ·
   *  sans-objet (corpus local). */
  const etatAudioOuvert = computed(() => {
    const id = ent.ouvertId.value
    if (!id || !idDistantCourant.value) return { etat: 'sans-objet' as const }
    if (audiosCorpus.value[id]?.audio) return { etat: 'ok' as const }
    const d = ent.meta.audioDistant
    if (!d) return { etat: 'hors-designation' as const }
    const inc = audiosInaccessibles.value.find((i) => i.chemin === d.chemin)
    return inc ? { etat: 'inaccessible' as const, raison: inc.raison } : { etat: 'distant' as const }
  })

  /** « Rapatrier maintenant » / « Réessayer » : tirage immédiat, silencieux,
   *  un échec réseau garde l'état affiché, puis rechargement du lecteur. */
  async function rapatrierAudioMaintenant() {
    await actualiserDistant(true)
    await rafraichirAudios()
    if (ent.ouvertId.value) await majAudioEntretien(ent.ouvertId.value)
  }

  /** Création en corpus DISTANT avec média Nextcloud : on crée l'entretien vide
   *  d'abord (transaction définitions), la modale de désignation fait le reste.
   *  Retourne l'id, ou null si refus. */
  async function creerEntretienVideDistant(titre: string): Promise<string | null> {
    if (!titre.trim()) return null
    const res = await window.sonal.corpus.creerEntretienVide(titre.trim())
    corpus.membership.value = res.corpus.membership
    await rafraichirAudios()
    return res.id
  }

  // ── Désignation audio distante ─────────────────────────────────────────
  /** Entretien cible de la modale « Désigner dans Nextcloud… » (null = fermée). */
  const designationAudioId = ref<string | null>(null)

  function ouvrirDesignationAudio(id: string) {
    designationAudioId.value = id
  }

  function fermerDesignationAudio() {
    designationAudioId.value = null
  }

  /** Confirmation de la modale : pose `meta.audioDistant` sur l'entretien cible.
   *  Entretien OUVERT chez nous : le modèle en session porte le champ,
   *  `sauver()` + publication périodique font le reste ; entretien FERMÉ :
   *  micro-session côté main (`designerAudio`). Puis tirage immédiat pour
   *  rapatrier la copie miroir et rafraîchir vues + lecteur. */
  async function confirmerDesignationAudio(chemin: string): Promise<void> {
    const id = designationAudioId.value
    if (!id) return
    if (ent.ouvertId.value === id) {
      ent.meta.audioDistant = { chemin }
      await ent.sauver()
      designationAudioId.value = null
      await majAudioEntretien(id)
    } else {
      const r = await window.sonal.distant.designerAudio(id, chemin)
      if (!r.ok) {
        // tenu-par-autrui / divergence : la modale reste ouverte avec la raison
        // affichée — jamais d'écrasement silencieux.
        throw new Error(r.raison ?? 'refus')
      }
      designationAudioId.value = null
    }
    // La copie miroir suit au prochain pull — on le déclenche tout de suite.
    // Silencieux : un échec réseau n'annule PAS la désignation, déjà publiée.
    await actualiserDistant(true)
    await rafraichirAudios()
    audiosManquants.value = await verifierIntegriteAudios()
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
    // Fermer D'ABORD l'entretien s'il est ouvert : en distant, notre propre
    // session tient le verrou que la suppression doit acquérir (double verrou),
    // et fermer publie puis libère dans l'ordre invariant, jamais d'orphelin.
    if (ent.ouvertId.value === id) await fermerEntretien()
    corpus.membership.value = (await window.sonal.corpus.supprimerEntretien(id)).membership
    if (reprise.value?.id === id) reprise.value = null
    if (corpusSelId.value === id) deselectionnerCorpus()
  }

  /** Clic sur un segment du résumé thématique d'une carte : ouvre l'entretien
   *  et cale le texte sur le segment. */
  async function ouvrirAuSegment(id: string, pos: number) {
    await ouvrirEntretien(id)
    ent.allerAuTexte(pos)
  }

  /** « Saisir… » depuis la Table de données : ouvre CET entretien directement sur son onglet Donnée.
   *  Le cycle verrou existant fait tout le travail : entretien libre → verrou accordé à l'ouverture, saisie permise ;
   *  ouvert par autrui → lecture seule avec bandeau nominatif. Aucun nouveau protocole,
   *  `ouvrirEntretien` suffit ; on force juste l'onglet quand l'ouverture a réussi. */
  async function allerSaisieDonnees(id: string) {
    await ouvrirEntretien(id)
    if (ent.ouvertId.value === id) ent.ongletDroite.value = 'donnees'
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
  /** Point de reprise : le dernier entretien fermé (position audio + curseur texte)
   *  pour le rouvrir d'un clic là où on en était. Volatil (session), comme le journal. */
  const reprise = ref<{ id: string; positionAudio: number; posTexte: number | null } | null>(null)
  /** SORTIR d'un entretien (retour Corpus/Accueil, table de données) le FERME,
   *  sauvé d'abord, en mémorisant le point de reprise.
   *  Personne n'écrit dans un entretien ouvert ailleurs (un seul chemin d'écriture). */
  async function fermerEntretien() {
    const id = ent.ouvertId.value
    if (!id) return
    // Sauvegarde SEULEMENT si nous avons le droit d'écrire : en lecture seule
    // (verrou à autrui / hors ligne), rien n'a pu changer — écrire ferait
    // rejeter par la garde du store et bloquerait la sortie.
    const peutEcrire =
      !idDistantCourant.value || (!lectureSeule.value && !ent.verrouAutrui.value)
    if (peutEcrire) await ent.sauver()
    // Corpus distant : publication finale PUIS libération du verrou —
    // l'ordre est l'invariant central ; le main ne libère jamais sur un
    // contenu non parti. Sans effet en corpus local.
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
  /** Rouvre l'entretien du point de reprise et se recale :
   *  curseur + défilement texte, position audio. */
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

  // Scope DÉMO « Mini Corpus Test » : construit le corpus de démo dans un dossier choisi
  // via le vrai pipeline d'import.
  // Dépendances injectées pour casser le cycle (demo utilise appliquerCorpus défini ci-dessus).
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
    notes: ent.notes,
    audiosCorpus,
    corpusSelId,
    corpusSelMeta,
  })
  // Branche le holder : `appliquerCorpus` restaure désormais le mode démo
  // (panneau « Pas à pas ») quand le corpus ouvert est un corpus démo.
  raccrocherModeCorpus = demo.raccrocherModeCorpus

  // Un appel quelconque vient de révéler que le dossier du corpus courant a été
  // supprimé sur disque (sentinelle CORPUS_SUPPRIME) : le main a DÉJÀ basculé
  // sur le récent vivant suivant (ou rendu null s'il n'y en a plus).
  // On aligne le modèle et on EXPLIQUE la bascule — ni le store ni l'UI ne
  // recréent jamais un corpus fantôme en silence.
  // Plusieurs appels peuvent échouer en même temps : la PREMIÈRE notification
  // déclenche la bascule UI, les suivantes sont ignorées (idempotent).
  let basculeEnCours = false
  window.sonal.corpus.surSuppressionCourant(async (suivant) => {
    if (basculeEnCours) return
    basculeEnCours = true
    try {
      quitterDistant() // la bascule du main est toujours LOCALE : plus de miroir actif
      if (suivant) {
        await appliquerCorpus(suivant.corpus, suivant.dir)
        await profil.majDossierCourant()
        infoGlobale.value =
          'Le dossier du corpus courant a été supprimé sur disque — ' +
          `le corpus « ${suivant.nom} » devient le corpus courant.`
      } else {
        // Aucun récent vivant : état vide, comme un premier lancement.
        await appliquerCorpus(squeletteCorpus())
        dossierCourantDir.value = null
        profil.dossierCourantNom.value = ''
        infoGlobale.value =
          "Le dossier du corpus courant a été supprimé sur disque ; aucun autre corpus récent n'existe."
      }
      vue.value = 'accueil' // l'entretien ouvert appartient à l'ancien corpus
    } finally {
      basculeEnCours = false
    }
  })

  onMounted(chargerCorpus)

  // Retour PLAT : les templates (App + composants) utilisent des noms nus ;
  // les wrappers d'orchestration (choisirDossier/ouvrirRecent) écrasent les bruts du profil.
  return {
    ...profil,
    ...corpus,
    ...ent,
    audio, // scope audio (objet nommé : les vues déstructurent ses refs)
    audiosCorpus,
    audiosManquants,
    urlWaveform,
    assignerAudioSelection,
    effacerAudioSelection,
    demanderSrt,
    confirmerSrt,
    srtASurEcrire,
    srtMessage,
    reassignerAudioEntretienOuvert,
    associerAudioEntretienOuvert,
    designationAudioId,
    ouvrirDesignationAudio,
    fermerDesignationAudio,
    confirmerDesignationAudio,
    etatAudioOuvert,
    rapatrierAudioMaintenant,
    creerEntretienVideDistant,
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
    creerCorpusDistant,
    ouvrirRecent,
    ouvrirCorpusDistant,
    idDistantCourant,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    actualiserDistant,
    lectureSeule,
    tableLigneEditable,
    metaEditables,
    enLigne,
    badgesVerrous,
    badgeVerrou,
    presences,
    presencesSur,
    orphelinsDistants,
    reprendreOrphelin,
    abandonnerOrphelin,
    statutSession,
    publiErreur,
    publierMaintenant,
    migrerDepuisV1,
    retourCorpus,
    allerAccueil,
    ouvrirEntretien,
    entretienEditable,
    divergenceProposee,
    confirmerFusion,
    jeterDivergence,
    plusTardDivergence,
    ouvrirAuSegment,
    allerSaisieDonnees,
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
