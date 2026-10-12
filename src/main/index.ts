import { app, BrowserWindow, ipcMain, dialog, powerMonitor, protocol, shell } from 'electron'
import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import { join, basename, extname, dirname } from 'node:path'
import { readFileSync, writeFileSync, createReadStream, statSync, cpSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import {
  CorpusStore,
  completerIdsLocuteurs,
  normaliserCheminAudio,
  type PreparationOuvertureCorpus,
} from './corpusStore'
import {
  creerTransitionsLocales,
  oublierCompte,
  RegistreContexteCourant,
} from './transitionContexte'
import { executerFermetureApplication } from './fermetureApplication'
import { preferencesRenderer, securiserNavigation } from './securiteFenetre'
import { ClientWebDAV, ErreurHttp } from './webdav/client'
import { profilerServeur, sonderFilesLock } from './webdav/sondes'
import {
  coffreReel,
  type ConfigCorpusDistant,
} from './distant/coffre'
import { poserValeurLotLocal, appliquerRegleLotLocal } from './distant/transactions'
import { preparerContexteNextcloud, ContexteCorpusDistant } from './distant/contexte'
import { ContexteGitLab } from './gitlab/contexte'
import { ServiceAuthentificationGitLab } from './gitlab/authentification'
import { InstancesGitLab } from './gitlab/oauth/instances'
import {
  destinationGitLabPublique,
  ServiceOuvertureGitLab,
} from './gitlab/ouverture'
import { preparerProjetGitLab } from './gitlab/preparationProjet'
import {
  exigerGeste,
  gesteAutorise,
  gestureCas,
  gestureRecueil,
  gestureTri,
  matriceCapacites,
  type GesteCorpus,
  type FournisseurCorpus,
} from './gitlab/politiqueGestes'
import { detecterInstanceGitLab } from './gitlab/detectionInstance'
import { INTERVALLE_VERIFICATION_GITLAB_MS } from './gitlab/parametresSession'
import { decoderCrp } from './encodage'
import { analyserCrp } from '../shared/corpus/migrationCrp'
import { TablesCorrespondance } from './tablesCorrespondance'
import { RenommagesAnon } from './renommagesAnon'
import { DissociationsAnon } from './dissociationsAnon'
import { RetraitsVarianteAnon } from './retraitsVarianteAnon'
import { CommandesRetraitVarianteAnon } from './commandesRetraitVarianteAnon'
import type { DemandeRetraitVarianteAnon } from '../shared/corpus/retraitVarianteAnon'
import { SuppressionsAnon } from './suppressionsAnon'
import type { DemandeSuppressionAnon } from '../shared/corpus/suppressionAnon'
import type { DemandeAjoutVarianteAnon } from '../shared/corpus/variantesAnon'
import type { DemandeDissociationAnon } from '../shared/corpus/dissociationAnon'
import type { DemandeRenommageAnon } from '../shared/corpus/renommageAnon'
import { aplatirTableV1, type OptionsTableCorrespondance } from '../shared/corpus/tablesCorrespondance'
import type { DocumentCorrespondance, CorrectionCorrespondance, ChoixImportCorrespondance } from '../shared/corpus/importCorrespondances'
import { construireDocxBuffer, imprimerPdf, urlAudioLocal, choisirDestination, ecrireFichierAtomique } from './exportEntretien'
import { archiverCorpusLocal } from './archiveCorpus'
import { assemblerInstantaneDistant, choisirDossierCorpus, listerDossierCorpus, ecrireTexteCorpus, ecrireDocxCorpus, ecrirePdfCorpus, copierMediaCorpus, fermerExportCorpus, ecrireQualcoderCorpus } from './exportCorpus'
import type { QualcoderExportModel } from '../shared/export/qualcoder/modele'
import type { DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
import type { DemandeExportDocx, DemandeExportPdf, DemandeExportDocxCorpus } from '../shared/format'
import type { CommandeRecueils, SourcePassageRecueil } from '../shared/corpus/recueils'
import type { CommandeCas } from '../shared/corpus/cas'
import type { CommandeTableauBord } from '../shared/corpus/tableaubord'
import type { ImpactSuppressionEntretien } from '../shared/corpus/suppressionEntretien'
import { executerCommandeCas, deduireSourcesCas } from './casOrchestration'
import { creerHandlersOperationsThemes } from './ipcOperationsThemes'
import type { DemandeOperationTheme, OptionsExecutionOperationTheme } from '../shared/corpus/themes'
import type {
  Categorie,
  CibleRegleAnon,
  CibleValeur,
  CorpusFichier,
  EntreeRecent,
  EtatDemo,
  EtatDemoComplet,
  ItemLotValeur,
  MarqueurDemo,
  ModeDemo,
  ModeTriEntretiens,
  ModeleEAV,
  OuvertureCorpus,
  OuvertureEntretienEdition,
  PatchCategorie,
  PayloadEntretien,
  TranscriptionEntretien,
  RegleAnon,
  ResultatArchiveCorpus,
  Variable,
  VerificationDossierDemo,
  ParamsAnon,
} from '../shared/format'
import type {
  EtatSessionPublic,
  OrphelinDistant,
  OuvertureDistante,
  ProgressionTransfert,
  ResultatFermetureSession,
  ResultatTiragePublic,
  ResultatListeDossierMedia,
  ResultatPreparationLectureMedia,
} from '../shared/distant'
import type {
  DemandeConnexionWebDAV,
  DemandeCreationWebDAV,
  DestinationWebDAVPublic,
  ResultatConnexionWebDAV,
} from '../shared/webdav'
import type {
  DemandeCreationGitLab,
  DemandeOuvertureGitLab,
  DemandePreparationProjetGitLab,
  DestinationGitLabPublic,
} from '../shared/gitlab'
import { PublieurCorpus, ErreurDejaCorpus } from './distant/publication'
import { EXT_AUDIO, EXT_MEDIA, extensionDe } from '../shared/media'
import {
  inventaireDocsCadreLocal,
  inventaireExemplesDocsCadre,
  lireApercuLocal,
  lireApercuExemple,
  ajouterFichierLocal,
  deposerFichierLocal,
  renommerLocal,
  supprimerLocal,
  resoudreDossierLocal,
  resoudreLocal,
  resoudreExemple,
  enregistrerCopieLocal,
} from './docsCadre'
import {
  inventaireDocsCadreDistant,
  lireApercuDistant,
  enregistrerCopieDistant,
  urlNextcloudPourCorpus,
} from './docsCadreDistant'
import type {
  InventaireDocsCadre,
  ResultatLectureDocsCadre,
  ResultatMutationDocsCadre,
  SourceDocumentCadre,
} from '../shared/docsCadre'
import { estListable } from '../shared/docsCadre'
import { rendreReperesOrphelins } from '../shared/entretien/reperesPassages'
import { enregistrerBaseMediaVerifiee, resoudreBaseMedia } from './medias/baseMedia'
import { CapacitePlagesBase } from './medias/capacite'
import {
  listerDossierMedia,
  verifierCheminMediaRelatif,
  verifierMediaDesignable,
} from './medias/designation'
import { RelaisMediaDistant } from './medias/lectureDistante'
import { ErreurLectureMedia, informationMedia } from './webdav/lectureMedia'
import { appliquerMenu } from './menuApplication'

// Le protocole qui SERT les médias du corpus au renderer : en dev,
// le renderer est en http://localhost (Vite) et ne lit pas file:// ;
// un protocole custom streame l'audio (Range) et la forme d'onde.
// Privilèges déclarés AVANT app.ready (exigence Electron) ;
// `supportFetchAPI` permet au renderer de récupérer les octets audio,
// par fetch(), pour générer la forme d'onde.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sonal-media',
    // standard+secure : URL http-like, utilisable depuis le renderer Vite ;
    // supportFetchAPI+corsEnabled : le renderer peut fetch() les octets audio,
    // pour générer la forme d'onde ; stream : lecture <audio> par plages.
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true },
  },
])

// png : pour la forme d'onde (renderer → main → fichier corpus/audio/<id>.png)
// Vidéo : <video> a besoin du bon Content-Type pour demuxer (mp4/webm/mov…)
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  png: 'image/png',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm', // peut être audio OU vidéo — le décodage sniff permettra de le savoir
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
}

/** Content-Type d'un média pour le téléversement (best effort) ;
 *  la table MIME ci-dessus, sinon défaut octet-stream.
 *  Couvre AUDIO ET VIDÉO ; le nom historique reste par économie de churn. */
function typeMimeAudio(chemin: string): string {
  const ext = extname(chemin).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}
const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']

// --- Réglages du profil : corpus récents + mémoire démo + largeur vidéo par corpus ---
interface Settings {
  recents: string[] // chemins de dossiers, le plus récent en tête
  /** Identifiants des destinations distantes récemment ouvertes.
   *  La réouverture passe par leur fournisseur, jamais par le chemin du miroir.
   */
  recentsDistant?: string[]
  demo?: EtatDemo // dossiers du « Mini Corpus Test » choisis une fois
  // Largeur (px) du panneau vidéo, mémorisée PAR CORPUS (clé = chemin du dossier).
  largeurVideo?: Record<string, number>
  /** Dernier signataire d'un commentaire (pré-remplissage de la modale,
   *  parité SonalPi1 — pas d'identité, juste une mémoire locale). */
  signataire?: string
  /** Registre des modèles IMPORTÉS par l'utilisateur (« Mes modèles »,
   *  partagés entre tous les corpus ; niveau profil, comme signataire).
   *  Les modèles intégrés restent du code ; ici, on ne garde que ce qui a été importé. */
  modelesUtilisateur?: ModeleEAV[]
}
function fichierSettings(): string {
  return join(app.getPath('userData'), 'settings.json')
}
/** Garde de forme de l'état démo persistant (fichier potentiellement écrit à la volée) ;
 *  ne pas hydrater un enregistrement partiel/corrompu. */
function estEtatDemo(d: unknown): d is EtatDemo {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  return (
    typeof o.racineSources === 'string' &&
    (o.corpusPasAPas === undefined || typeof o.corpusPasAPas === 'string') &&
    (o.corpusAutonomie === undefined || typeof o.corpusAutonomie === 'string')
  )
}
/** Garde de forme du registre des modèles (fichier de settings potentiellement écrit à la volée) ;
 *  ne pas hydrater un enregistrement partiel/corrompu. */
function estListeModeles(d: unknown): d is ModeleEAV[] {
  return (
    Array.isArray(d) &&
    d.every(
      (m): m is ModeleEAV =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as ModeleEAV).nom === 'string' &&
        Array.isArray((m as ModeleEAV).modalites) &&
        (m as ModeleEAV).modalites.every((lib) => typeof lib === 'string'),
    )
  )
}
function lireSettings(): Settings {
  try {
    const s = JSON.parse(readFileSync(fichierSettings(), 'utf8')) as Partial<Settings>
    return {
      recents: Array.isArray(s.recents) ? s.recents : [],
      recentsDistant: Array.isArray(s.recentsDistant)
        ? s.recentsDistant.filter((id): id is string => typeof id === 'string')
        : undefined,
      demo: estEtatDemo(s.demo) ? s.demo : undefined,
      largeurVideo:
        s.largeurVideo && typeof s.largeurVideo === 'object' ? s.largeurVideo : undefined,
      signataire: typeof s.signataire === 'string' ? s.signataire : undefined,
      modelesUtilisateur: estListeModeles(s.modelesUtilisateur) ? s.modelesUtilisateur : undefined,
    }
  } catch {
    return { recents: [] }
  }
}
/** Écrit les réglages en PRÉSERVANT les autres champs (`demo` compris) :
 *  les deux écritures de ce fichier, récents et mémoire démo,
 *  ne se marchent donc pas dessus. */
function ecrireSettings(s: Settings): void {
  writeFileSync(fichierSettings(), JSON.stringify(s, null, 2), 'utf8')
}
function ajouterRecent(dir: string): void {
  const s = lireSettings()
  s.recents = [dir, ...s.recents.filter((d) => d !== dir)].slice(0, 8)
  ecrireSettings(s)
  majMenu()
}
/** Retire un RACCOURCI de la liste des récents ;
 *  le dossier de corpus reste sur disque, jamais touché (l'app n'efface aucun corpus). */
function retirerRecent(dir: string): void {
  const s = lireSettings()
  s.recents = s.recents.filter((d) => d !== dir)
  ecrireSettings(s)
  majMenu()
}
/** Mémorise l'ouverture d'un corpus distant dans les récents (id de compte). */
function ajouterRecentDistant(id: string): void {
  const s = lireSettings()
  s.recentsDistant = [id, ...(s.recentsDistant ?? []).filter((d) => d !== id)].slice(0, 8)
  ecrireSettings(s)
  majMenu()
}

/** Reconstruction du menu applicatif (sous-menu « Corpus récents » dynamique).
 *  Crochet affecté par `enregistrerIpcCorpus` (les récents distants dépendent
 *  du coffre, créé dans sa portée) ; le défaut pré-arme un menu sans récents. */
let majMenu: () => void = () => appliquerMenu([])

/** Rattache un dialogue NATIF à la fenêtre qui l'a demandé.
 *  Sans fenêtre parente, certains environnements (Linux/WSLg) affichent le dialogue DERRIÈRE l'app, ou sur un autre bureau ;
 *  le clic semble alors « ne rien ouvrir ». `e.sender` = la webContents qui invoque l'IPC ;
 *  `fromWebContents` retrouve sa fenêtre (environnement headless : on retombe sur la forme sans fenêtre). */
function montrerOuvrir(e: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  return fenetre ? dialog.showOpenDialog(fenetre, options) : dialog.showOpenDialog(options)
}
/** Même rattachement pour le dialogue de SAVE. */
function montrerSauver(e: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  return fenetre ? dialog.showSaveDialog(fenetre, options) : dialog.showSaveDialog(options)
}

// respecte le --user-data-dir passé en ligne de commande ;
// les tests e2e l'utilisent pour isoler chaque test,
// et éviter qu'ils ne se gênent mutuellement.
const userDataDir = app.commandLine.getSwitchValue('user-data-dir')
if (userDataDir) app.setPath('userData', userDataDir)

const attentesFermetureRenderer = new Map<
  string,
  { restants: number; succes: boolean; terminer: (succes: boolean) => void }
>()
ipcMain.on('application:fermeturePrete', (_e, jeton: string, succes: boolean) => {
  const attente = attentesFermetureRenderer.get(jeton)
  if (!attente) return
  attente.succes &&= succes
  attente.restants -= 1
  if (attente.restants <= 0) {
    attentesFermetureRenderer.delete(jeton)
    attente.terminer(attente.succes)
  }
})

/** Demande aux renderers de vider leur autosave, avec une attente bornée. */
async function viderRenderersAvantFermeture(delaiMs = 4_000): Promise<boolean> {
  const fenetres = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (fenetres.length === 0) return true
  const jeton = `quit-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return await new Promise<boolean>((resolve) => {
    const minuterie = setTimeout(() => {
      attentesFermetureRenderer.delete(jeton)
      resolve(false)
    }, delaiMs)
    attentesFermetureRenderer.set(jeton, {
      restants: fenetres.length,
      succes: true,
      terminer: (succes) => {
        clearTimeout(minuterie)
        resolve(succes)
      },
    })
    for (const fenetre of fenetres) {
      fenetre.webContents.send('application:preparerFermeture', jeton)
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    show: false,
    webPreferences: preferencesRenderer(join(__dirname, '../preload/index.js')),
  })

  securiserNavigation(win.webContents)
  win.on('ready-to-show', () => win.show())
  win.on('close', (evenement) => {
    if (fermetureAutorisee) return
    evenement.preventDefault()
    app.quit()
  })

  // En dev, electron-vite sert le renderer via Vite (HMR) ; en prod, le bundle.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function enregistrerIpcCorpus(): () => Promise<void> {
  // Dossier de corpus par défaut = <profil>/corpus (les e2e l'isolent via --user-data-dir).
  //  Le `store` est MUTABLE : « Ouvrir un corpus… » le recrée sur un autre dossier.
  // Les handlers capturent la variable `store` (pas sa valeur)
  // → ils voient la réaffectation sans être réenregistrés.
  const dossierDefaut = join(app.getPath('userData'), 'corpus')
  let store = new CorpusStore(dossierDefaut)
  let dossierCourant = dossierDefaut

  // --- Corpus distant : connexion, création et ouverture ---
  // La connexion mesure le profil du serveur par sondes RÉELLES,
  // avec les préconditions PUT et les capabilities files_lock.
  // Elle n'enregistre rien avant ces sondes, et refuse un serveur qui ment.
  // Le secret vit dans safeStorage, ou seulement en mémoire sans trousseau OS.
  // Il ne remonte jamais du main vers le renderer.
  const coffre = coffreReel(app.getPath('userData'))
  // Authentification GitLab : propriétaire unique des credentials. Le renderer
  // ne voit que des états, et le navigateur du poste porte l'URL d'autorisation.
  const authentificationGitLab = new ServiceAuthentificationGitLab({
    coffre,
    instances: new InstancesGitLab(join(app.getPath('userData'), 'instances-gitlab.json')),
    ouvrirNavigateur: (url) => shell.openExternal(url),
  })
  // Le contexte assemble un seul miroir avec ses sessions, transactions et présence.
  // Il n'est remplacé qu'après fermeture réussie de l'ancien.
  type ContexteDistantActif = ContexteCorpusDistant | ContexteGitLab
  const contextesDistants = new RegistreContexteCourant<ContexteDistantActif>()
  const relaisMediaDistant = new RelaisMediaDistant(({ id, chemin, motif }) => {
    try {
      const contexte = contextesDistants.actuel
      if (!(contexte instanceof ContexteGitLab)) return
      const entretien = contexte.store.lireEntretien(id)
      if (!entretien.ok || entretien.data.meta.audioDistant?.chemin !== chemin) return
      for (const fenetre of BrowserWindow.getAllWindows()) {
        if (!fenetre.isDestroyed()) fenetre.webContents.send('distant:etatLectureMedia', id, motif)
      }
    } catch {
      /* Un corpus en cours de fermeture n'a plus d'état média à signaler. */
    }
  })
  const capacitesPlagesMedia = new Map<string, CapacitePlagesBase>()
  const minuteurSessionsGitLab = setInterval(() => {
    const contexte = contextesDistants.actuel
    if (contexte instanceof ContexteGitLab) {
      void contexte.maintenirSessions().catch(() => {
        /* La session suspendra l'édition si sa garantie devient incertaine. */
      })
    }
  }, INTERVALLE_VERIFICATION_GITLAB_MS)
  const surSuspensionSysteme = () => {
    for (const fenetre of BrowserWindow.getAllWindows()) {
      if (!fenetre.isDestroyed()) fenetre.webContents.send('application:systemeSuspendu')
    }
  }
  const surReveilSysteme = () => {
    for (const fenetre of BrowserWindow.getAllWindows()) {
      if (!fenetre.isDestroyed()) fenetre.webContents.send('application:systemeReveille')
    }
  }
  powerMonitor.on('suspend', surSuspensionSysteme)
  powerMonitor.on('resume', surReveilSysteme)
  // Identité de session : machineId stable par poste (généré une fois, stocké dans le profil) ;
  // sessionId aléatoire par lancement d'app (voir SESSION_ID plus bas).
  // Un verrou n'est jamais hérité d'une session précédente.
  const fichierMachineId = join(app.getPath('userData'), 'machine-id')
  const machineId = (() => {
    try {
      const lu = readFileSync(fichierMachineId, 'utf8').trim()
      if (lu) return lu
    } catch {
      /* première lance */
    }
    const nouveau = `poste-${Math.random().toString(36).slice(2, 10)}`
    writeFileSync(fichierMachineId, nouveau, 'utf8')
    return nouveau
  })()

  /** Ferme l'ancien contexte avant toute bascule. Une publication ou une
   *  libération bloquée refuse la transition et conserve le contexte intact. */
  async function fermerContexteActuel(): Promise<void> {
    await contextesDistants.actuel?.fermer()
    relaisMediaDistant.invaliderTout()
  }

  let fileTransitions: Promise<void> = Promise.resolve()
  function transitionner<T>(operation: () => Promise<T>): Promise<T> {
    const resultat = fileTransitions.then(operation, operation)
    fileTransitions = resultat.then(
      () => undefined,
      () => undefined,
    )
    return resultat
  }

  function estContexteNextcloud(
    contexte: ContexteDistantActif | null,
  ): contexte is ContexteCorpusDistant {
    return contexte instanceof ContexteCorpusDistant
  }

  /** Lie une commande asynchrone à son contexte Nextcloud de départ. */
  function executerContexteDistant<T>(
    operation: (
      contexte: ContexteCorpusDistant,
      estContexteCourant: () => boolean,
    ) => Promise<T>,
  ) {
    const capture = contextesDistants.capturer()
    if (!capture) return null
    return contextesDistants.executer(capture, (contexte) => {
      if (!estContexteNextcloud(contexte)) {
        throw new Error('Ce corpus GitLab est ouvert en consultation seule.')
      }
      return operation(contexte, () => contextesDistants.estCourante(capture))
    })
  }

  /** Lie une lecture aux deux fournisseurs distants. */
  function executerContexteCommun<T>(
    operation: (contexte: ContexteDistantActif) => Promise<T>,
  ) {
    const capture = contextesDistants.capturer()
    if (!capture) return null
    return contextesDistants.executer(capture, operation)
  }

  function executerIntentionDistante<T>(
    operation: (contexte: ContexteCorpusDistant) => Promise<T>,
  ): Promise<T> | null {
    const execution = executerContexteDistant(operation)
    if (!execution) return null
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
      return resultat.valeur
    })
  }

  /** Exécute une opération prise en charge par les deux fournisseurs distants. */
  function executerSelonFournisseur<T>(
    nextcloud: (contexte: ContexteCorpusDistant) => Promise<T>,
    gitlab: (contexte: ContexteGitLab) => Promise<T>,
  ): Promise<T> | null {
    const execution = executerContexteCommun((contexte) =>
      contexte instanceof ContexteGitLab ? gitlab(contexte) : nextcloud(contexte))
    if (!execution) return null
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
      return resultat.valeur
    })
  }

  /** Capture aussi les corpus locaux, qui n'ont pas de façade distante. */
  function capturerCorpusCourant() {
    return {
      generation: contextesDistants.generationActuelle,
      contexte: contextesDistants.actuel,
      store,
      dossier: dossierCourant,
    }
  }

  function verifierCorpusCourant(capture: ReturnType<typeof capturerCorpusCourant>): void {
    if (
      !contextesDistants.estGenerationCourante(capture.generation) ||
      store !== capture.store ||
      dossierCourant !== capture.dossier
    ) {
      throw new Error('Le corpus a changé pendant la commande.')
    }
  }

  /** Installe un store local après la fermeture réussie de l'ancien contexte. */
  function finaliserBasculeLocale(
    nouveauStore: CorpusStore,
    dir: string,
    preparation: PreparationOuvertureCorpus,
  ): OuvertureCorpus {
    const corpus = nouveauStore.finaliserOuverture(preparation)
    store.viderApercusOperationTheme()
    store = nouveauStore
    contextesDistants.remplacer(null)
    dossierCourant = dir
    ajouterRecent(dir)
    return { dir, nom: corpus.nom ?? basename(dir), corpus }
  }

  const transitionsLocales = creerTransitionsLocales({
    fermerContexteActuel,
    finaliser: finaliserBasculeLocale,
  })

  /** Prépare la cible sans l'écrire, puis ferme l'ancien contexte avant le commit. */
  const changerDossier = (dir: string) =>
    transitionner(() => transitionsLocales.ouvrirDossier(dir))

  ipcMain.handle('corpus:ouvrir', () => store.ouvrir())
  /** Indicateur pour l'UI : le corpus courant est-il un miroir distant ?
   *  (`distant` = id du compte ; null = corpus local.)
   *  Une capacité signalée, jamais un type de transport dispatché. */
  ipcMain.handle('corpus:dossierCourant', () => {
    const corpus = store.ouvrir()
    return {
      dir: dossierCourant,
      nom: corpus.nom ?? basename(dossierCourant),
      distant: contextesDistants.actuel?.id ?? null,
    }
  })
  ipcMain.handle('corpus:recents', (): EntreeRecent[] => {
    const recents = listerRecents()
    majMenu() // le sous-menu du menu applicatif suit la liste fraîche
    return recents
  })
  /** Liste fraîche des récents (locaux vivants + comptes distants du coffre).
   *  Écriture de retour pour purger les entrées mortes, `demo` préservé. */
  const listerRecents = (): EntreeRecent[] => {
    const s = lireSettings()
    // Ne garder que les corpus dont le DOSSIER existe encore et contient toujours un corpus.json ;
    // un corpus supprimé à la main (dossier effacé ou vidé de son corpus.json) ne doit plus apparaître dans « Récents » ;
    // au démarrage, le 1ᵉʳ récent ne doit pas être ré-amorcé en silence.
    const vivants = s.recents.filter((dir) => existsSync(join(dir, 'corpus.json')))
    if (vivants.length !== s.recents.length) {
      s.recents = vivants
      ecrireSettings(s)
    }
    // Récents distants : fraîcheur = le compte existe toujours au coffre (équivalent du existsSync local).
    // Le nom vient du miroir (`corpus.json`) si présent, sinon du dernier segment de l'URL.
    // Le chemin miroir n'est JAMAIS exposé comme dossier local.
    const comptes = new Map(coffre.lister().map((c) => [c.id, c]))
    const comptesGitLab = new Map(coffre.listerComptesGitLab().map((c) => [c.id, c]))
    const destinationsGitLab = new Map(
      coffre.listerDestinationsGitLab()
        .filter((destination) => comptesGitLab.has(destination.compteId))
        .map((destination) => [destination.id, destination]),
    )
    const distants = (s.recentsDistant ?? [])
      .filter((id) => comptes.has(id) || destinationsGitLab.has(id))
    if (distants.length !== (s.recentsDistant ?? []).length) {
      s.recentsDistant = distants
      ecrireSettings(s)
    }
    return [
      ...distants.map((id): EntreeRecent => {
        const compteWebDAV = comptes.get(id)
        const destinationGitLab = destinationsGitLab.get(id)
        const compteGitLab = destinationGitLab
          ? comptesGitLab.get(destinationGitLab.compteId)
          : undefined
        let nom = compteWebDAV
          ? basename(compteWebDAV.urlServeur)
          : destinationGitLab?.nomProjet || `Projet ${destinationGitLab?.projetId}`
        try {
          const miroirCorpus = JSON.parse(
            readFileSync(join(app.getPath('userData'), 'miroirs', id, 'corpus.json'), 'utf8'),
          ) as { nom?: string }
          if (miroirCorpus.nom) nom = miroirCorpus.nom
        } catch {
          /* Le nom configuré reste affiché tant que le miroir est absent. */
        }
        return {
          type: 'distant',
          id,
          nom,
          url: compteWebDAV?.urlServeur ?? compteGitLab?.urlInstance ?? '',
          ...(destinationGitLab ? { fournisseur: 'gitlab' as const } : {}),
        }
      }),
      ...vivants.map((dir): EntreeRecent => ({ type: 'local', dir, nom: basename(dir) })),
    ]
  }
  // Les récents distants dépendent du coffre (portée locale) : le crochet global
  // du menu est affecté ICI, après que `listerRecents` existe.
  majMenu = () => appliquerMenu(listerRecents())

  /** Retire un RACCOURCI des récents (local OU distant),
   *  sans jamais toucher aux données : ni le dossier disque, ni le serveur, ni le miroir. */
  ipcMain.handle('corpus:retirerRecent', (_e, entree: EntreeRecent) => {
    if (entree.type === 'distant') {
      const s = lireSettings()
      s.recentsDistant = (s.recentsDistant ?? []).filter((id) => id !== entree.id)
      ecrireSettings(s)
    } else {
      retirerRecent(entree.dir)
    }
    return true
  })
  ipcMain.handle('corpus:ouvrirDossier', (_e, dir: string) => changerDossier(dir))

  /** Le corpus courant a été supprimé sur disque (sentinelle CORPUS_SUPPRIME,
   *  interceptée côté preload) : bascule sur le PREMIER récent local encore
   *  vivant et contenant un corpus.json (« le suivant devient courant », et
   *  ainsi de suite). Purge au passage les récents morts. Renvoie le nouveau
   *  courant, ou null s'il n'en reste aucun — le renderer repart d'un état
   *  vide (comme un premier lancement). */
  ipcMain.handle('corpus:apresSuppression', async (): Promise<OuvertureCorpus | null> => {
    const s = lireSettings()
    const vivants = s.recents.filter((d) => existsSync(join(d, 'corpus.json')))
    if (vivants.length !== s.recents.length) {
      s.recents = vivants
      ecrireSettings(s)
    }
    const suivant = vivants[0]
    if (!suivant) return null
    return await changerDossier(suivant)
  })
  ipcMain.handle('corpus:choisirDossier', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || r.filePaths.length === 0) return null
    return changerDossier(r.filePaths[0])
  })
  /** Vérifie si un dossier est DÉJÀ un corpus (modale « Nouveau corpus… »).
   *  Sans effet de bord : on ne bascule pas le store, on ne crée rien. */
  ipcMain.handle('corpus:verifierNouveau', (_e, dir: string) => ({
    dejaCorpus: existsSync(join(dir, 'corpus.json')),
  }))
  /** « Nouveau corpus » : bascule le store sur le dossier. S'il est NEUF (pas de corpus.json),
   *  crée un corpus portant le `nom` saisi ; s'il contient déjà un corpus, l'OUVRE tel quel,
   *  sans rien écraser (son `nom` fait foi). */
  ipcMain.handle('corpus:creerNouveau', (_e, dir: string, nom: string) =>
    transitionner(() => transitionsLocales.creerNouveau(dir, nom)),
  )
  // Session id aléatoire PAR LANCEMENT (portée du bloc corpus entier).
  const SESSION_ID = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  /** Exécute une mutation de DÉFINITIONS.
   *
   *  Chaque appelant nomme son geste : le dispatch refuse alors, sur GitLab,
   *  tout ce qui relit les entretiens publiés ou retire un entretien — y compris
   *  par appel IPC direct. Le calcul se fait sur une base fraîche, dans un store
   *  de préparation : le store du miroir n'est jamais la cible de la mutation.
   *  Les refus (`Error`) remontent à la bannière renderer via l'exception IPC. */
  function executerDefinitions<T>(
    geste: GesteCorpus,
    fn: (cible: CorpusStore) => T,
  ): Promise<T> | T {
    const execution = executerContexteCommun((contexte) => {
      if (contexte instanceof ContexteGitLab) {
        return contexte.executerDefinitions(geste, fn).then((resultat) => resultat.valeur)
      }
      exigerGeste('webdav', geste)
      return contexte.executerDefinitions(() => fn(store))
    })
    if (!execution) {
      exigerGeste('local', geste)
      return fn(store)
    }
    return execution.then((resultat) => {
      if (!resultat.courant) {
        throw new Error('Le corpus a changé pendant la commande.')
      }
      return resultat.valeur
    })
  }

  /** Fournisseur du corpus courant, pour un refus nommé. */
  function fournisseurCourant(): FournisseurCorpus {
    const contexte = contextesDistants.actuel
    if (contexte instanceof ContexteGitLab) return 'gitlab'
    if (contexte) return 'webdav'
    return 'local'
  }

  const handlersThemes = creerHandlersOperationsThemes({
    store: () => store,
    fournisseur: fournisseurCourant,
    gitlab: {
      analyser: (demande, precedent) => executerGitLab((contexte) => contexte.analyserOperationTheme(demande, precedent)),
      details: (id, entretien) => executerGitLab(async (contexte) => contexte.detailsOperationTheme(id, entretien)),
      executer: (id, demande, options, progression) =>
        executerGitLab((contexte) => contexte.executerOperationTheme(id, demande, options, progression)),
      lireSuivi: () => executerGitLab(async (contexte) => contexte.lireSuiviOperationTheme()),
      preparerReprise: (id) => executerGitLab((contexte) => contexte.preparerRepriseOperationTheme(id)),
      reconcilier: (id) => executerGitLab((contexte) => contexte.reconcilierOperationTheme(id)),
      abandonner: (id) => executerGitLab(async (contexte) => contexte.abandonnerOperationTheme(id)),
    },
    webdav: {
      analyser: (demande, operationPrecedente) => {
        const execution = executerIntentionDistante((contexte) => contexte.analyserOperationTheme(demande, operationPrecedente))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      details: (operationId, entretienId) => {
        const execution = executerIntentionDistante(async (contexte) => contexte.detailsOperationTheme(operationId, entretienId))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      executer: (id, demande, options, progression) => {
        const execution = executerIntentionDistante((contexte) => contexte.executerOperationTheme(id, demande, options, progression))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      lireSuivi: () => {
        const execution = executerIntentionDistante(async (contexte) => contexte.lireSuiviOperationTheme())
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      preparerReprise: (id) => {
        const execution = executerIntentionDistante((contexte) => contexte.preparerRepriseOperationTheme(id))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      reconcilier: (id) => {
        const execution = executerIntentionDistante((contexte) => contexte.reconcilierOperationTheme(id))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
      abandonner: (id) => {
        const execution = executerIntentionDistante(async (contexte) => contexte.abandonnerOperationTheme(id))
        if (!execution) throw new Error('Aucun contexte WebDAV courant.')
        return execution
      },
    },
    progression: (etat) => {
      for (const fenetre of BrowserWindow.getAllWindows()) {
        if (!fenetre.isDestroyed()) fenetre.webContents.send('corpus:progressionOperationTheme', etat)
      }
    },
  })
  ipcMain.handle('corpus:analyserOperationTheme', (_e, demande: DemandeOperationTheme, operationPrecedente?: string) =>
    handlersThemes.analyser(demande, operationPrecedente))
  ipcMain.handle('corpus:detailsOperationTheme', (_e, operationId: string, entretienId: string) =>
    handlersThemes.details(operationId, entretienId))
  ipcMain.handle('corpus:executerOperationTheme', (_e, operationId: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme) =>
    handlersThemes.executer(operationId, demande, options))
  ipcMain.handle('corpus:lireSuiviOperationTheme', () => handlersThemes.lireSuivi())
  ipcMain.handle('corpus:preparerRepriseOperationTheme', (_e, id: string) => handlersThemes.preparerReprise(id))
  ipcMain.handle('corpus:reconcilierOperationTheme', (_e, id: string) => handlersThemes.reconcilier(id))
  ipcMain.handle('corpus:abandonnerOperationTheme', (_e, id: string) => handlersThemes.abandonner(id))

  /** Opération réservée au corpus GitLab courant. Un corpus local ou un autre
   *  fournisseur ne l'a pas : le refus est nommé, jamais silencieux. */
  function executerGitLab<T>(
    operation: (contexte: ContexteGitLab) => Promise<T>,
  ): Promise<T> {
    const execution = executerContexteCommun((contexte) => {
      if (!(contexte instanceof ContexteGitLab)) {
        throw new Error('Cette opération n’est disponible que sur un corpus GitLab.')
      }
      return operation(contexte)
    })
    if (!execution) throw new Error('Ce corpus distant n’est pas un corpus GitLab.')
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
      return resultat.valeur
    })
  }

  /** Source d'un item de recueil : un passage renvoie à un repère d'entretien
   *  publié, et le geste qui le reprend en dépend. */
  function sourceRecueil(commande: CommandeRecueils): SourcePassageRecueil | null {
    if (
      (commande.type === 'inserer-item' || commande.type === 'modifier-item') &&
      commande.item.type === 'passage'
    ) {
      return commande.item.source
    }
    return null
  }

  /** Lecture pure du miroir issu du dernier tirage en corpus distant.
   *  Elle ne contacte pas le serveur et n'ouvre aucune session d'écriture. */
  ipcMain.handle('corpus:lireEntretien', (_e, id: string) => store.lireEntretien(id))

  /** Ouverture réservée à l'éditeur, avec statut d'accès obligatoire. */
  ipcMain.handle(
    'corpus:ouvrirEntretienPourEdition',
    async (_e, id: string): Promise<OuvertureEntretienEdition> => {
      if (contextesDistants.actuel instanceof ContexteGitLab) {
        const execution = executerContexteCommun((contexte) =>
          contexte.ouvrirEntretienPourEdition(id))
        if (!execution) throw new Error('Le corpus GitLab a été remplacé.')
        const resultat = await execution
        if (!resultat.courant) {
          throw new Error("Le corpus a changé pendant l'ouverture de l'entretien.")
        }
        return resultat.valeur
      }
      const execution = executerContexteDistant((contexte) =>
        contexte.ouvrirEntretienPourEdition(id))
      if (!execution) {
        const lecture = store.ouvrirEntretienPourEdition(id)
        return lecture.ok ? { ...lecture, acces: 'edition' } : lecture
      }
      const resultat = await execution
      if (!resultat.courant) {
        throw new Error("Le corpus a changé pendant l'ouverture de l'entretien.")
      }
      return resultat.valeur
    },
  )

  /** Fermeture : publication finale puis libération. */
  ipcMain.handle(
    'corpus:fermerEntretien',
    async (_e, id: string): Promise<ResultatFermetureSession> => {
      if (contextesDistants.actuel instanceof ContexteGitLab) {
        const execution = executerContexteCommun<{ fermee: boolean; raison?: string }>(
          (contexte) => contexte.fermerEntretien(id),
        )
        if (!execution) throw new Error('Le corpus GitLab a été remplacé.')
        const resultat = await execution
        if (!resultat.courant) {
          throw new Error("Le corpus a changé pendant la fermeture de l'entretien.")
        }
        if (resultat.valeur.fermee) {
          relaisMediaDistant.invaliderEntretien(id)
          return { fermee: true }
        }
        return { fermee: false, raison: 'publication', message: resultat.valeur.raison }
      }
      const execution = executerContexteDistant((contexte) =>
        contexte.fermerEntretien(id))
      if (!execution) {
        store.revoquerEcritureEntretien(id)
        return { fermee: true }
      }
      const resultat = await execution
      if (!resultat.courant) {
        throw new Error("Le corpus a changé pendant la fermeture de l'entretien.")
      }
      return resultat.valeur
    },
  )

  /** État de session (poll UI) : publication en attente ? */
  ipcMain.handle('distant:etatSession', (_e, id: string): EtatSessionPublic => {
    const contexte = contextesDistants.actuel
    if (estContexteNextcloud(contexte)) return contexte.sessions.etat(id)
    if (contexte instanceof ContexteGitLab) {
      const etat = contexte.etatSession(contexte.ressourceEntretien(id))
      if (etat.etat === 'edition') {
        return {
          etat: 'a-nous',
          dernierPubli: null,
          sale: etat.revision > etat.revisionPubliee,
        }
      }
      if (etat.etat === 'degrade') {
        return etat.raison
          ? { etat: 'degrade', raison: etat.raison }
          : { etat: 'degrade' }
      }
    }
    return { etat: 'aucune' }
  })
  ipcMain.handle('corpus:revaliderSession', async (_e, id: string): Promise<EtatSessionPublic> => {
    const contexte = contextesDistants.actuel
    if (!(contexte instanceof ContexteGitLab)) return { etat: 'aucune' }
    await contexte.revaliderSessions()
    const etat = contexte.etatSession(contexte.ressourceEntretien(id))
    if (etat.etat === 'edition') {
      return {
        etat: 'a-nous',
        dernierPubli: null,
        sale: etat.revision > etat.revisionPubliee,
      }
    }
    return etat.etat === 'degrade'
      ? { etat: 'degrade', raison: etat.raison }
      : { etat: 'aucune' }
  })
  ipcMain.handle('corpus:ecrireEntretien', async (_e, id: string, p: PayloadEntretien) => {
    const contexte = contextesDistants.actuel
    if (contexte instanceof ContexteGitLab) {
      const etat = contexte.etatSession(contexte.ressourceEntretien(id))
      if (etat.etat !== 'edition') {
        throw new Error('La session GitLab ne permet pas cette écriture.')
      }
      const now = store.ecrireEntretien(id, p)
      await contexte.marquerSessionSale(contexte.ressourceEntretien(id))
      return now
    }
    if (!contexte) store.exigerSessionLocaleEcriture(id)
    if (estContexteNextcloud(contexte)) contexte.exigerEcritureEntretien(id)
    const now = store.ecrireEntretien(id, p)
    if (estContexteNextcloud(contexte)) contexte.sessions.noterSale(id)
    return now
  })
  ipcMain.handle(
    'corpus:preserverEntretienDegrade',
    async (_e, id: string, p: PayloadEntretien): Promise<boolean> => {
      const contexte = contextesDistants.actuel
      if (estContexteNextcloud(contexte)) {
        return contexte.sessions.preserverRecuperation(id, p)
      }
      if (contexte instanceof ContexteGitLab) {
        try {
          contexte.store.ecrireEntretien(id, p)
          return await contexte.preserverSessionDegrade(contexte.ressourceEntretien(id))
        } catch {
          return false
        }
      }
      return false
    },
  )
  ipcMain.handle('corpus:creerEntretienVide', (_e, titre: string) =>
    executerSelonFournisseur(
      (contexte) => contexte.transactions.creerEntretienVide(titre),
      (contexte) => {
        exigerGeste('gitlab', 'entretien.creer')
        return contexte.creerEntretienVide(titre)
      },
    ) ?? store.creerEntretienVide(titre),
  )
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    executerDefinitions('entretien.renommer', (cible) => cible.renommerEntretien(id, titre)),
  )
  ipcMain.handle('corpus:trierEntretiens', (_e, mode: ModeTriEntretiens) => {
    if (!['alpha', 'ajout', 'modif', 'longueur'].includes(mode)) {
      throw new Error('Mode de tri des entretiens inconnu.')
    }
    if (mode === 'modif' || mode === 'longueur') {
      // Le tri de contenu se fait sur un corpus calme : le contexte GitLab
      // refuse un entretien tenu, de notre application comme d'un autre poste.
      if (fournisseurCourant() === 'gitlab') {
        return executerGitLab((contexte) => contexte.trierEntretiens(mode))
      }
      exigerGeste(fournisseurCourant(), gestureTri(mode))
      return executerIntentionDistante((contexte) =>
        contexte.transactions.trierEntretiens(mode))
        ?? store.trierEntretiens(mode)
    }
    return executerDefinitions(gestureTri(mode), (cible) => cible.trierEntretiens(mode))
  })
  /** Suppression : DOUBLE VERROU distant (corpus PUIS entretien, ordre canonique ;
   *  publication corpus d'abord, MOVE serveur ensuite), ou directe en local.
   *  Défense en profondeur : si NOUS tenions encore la session de cet entretien,
   *  il faut la fermer d'abord (publication puis libération, ordre invariant) ;
   *  sinon, ce serait notre propre verrou qui bloquerait la suppression. */
  ipcMain.handle('corpus:analyserSuppressionEntretien', (_e, id: string) => {
    exigerGeste(fournisseurCourant(), 'entretien.analyser-suppression')
    // GitLab calcule l'aperçu sur le corpus publié, pas sur le miroir.
    if (fournisseurCourant() === 'gitlab') {
      return executerGitLab((contexte) => contexte.analyserSuppressionEntretien(id))
    }
    return store.analyserSuppressionEntretien(id)
  })
  ipcMain.handle('corpus:supprimerEntretien', async (
    _e,
    id: string,
    impactAttendu?: ImpactSuppressionEntretien,
  ) => {
    const magasin = store
    exigerGeste(fournisseurCourant(), 'entretien.supprimer')
    if (fournisseurCourant() === 'gitlab') {
      return executerGitLab((contexte) => contexte.supprimerEntretien(id, impactAttendu))
    }
    const execution = executerContexteDistant(async (contexte) => {
      magasin.revoquerEcritureEntretien(id)
      const fermeture = await contexte.sessions.fermer(id)
      if (!fermeture.fermee) {
        if (contexte.sessions.etat(id).etat === 'a-nous') {
          magasin.autoriserEcritureEntretien(id)
        }
        throw new Error(
          `Suppression impossible : session non fermée (${fermeture.raison}).`,
        )
      }
      return contexte.transactions.supprimerEntretien(id, impactAttendu)
    })
    if (!execution) return magasin.supprimerEntretien(id, impactAttendu)
    const resultat = await execution
    if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
    return resultat.valeur
  })
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[], reglesAnon: RegleAnon[]) =>
      executerSelonFournisseur(
        (contexte) => contexte.transactions.importerEntretien(
          titre,
          payload,
          codebook,
          variables,
          reglesAnon,
        ),
        (contexte) => {
          exigerGeste('gitlab', 'entretien.importer')
          return contexte.importerEntretien(
            titre,
            payload,
            codebook,
            variables,
            reglesAnon,
          )
        },
      ) ?? store.importerEntretien(titre, payload, codebook, variables, reglesAnon),
  )

  // Codebook (thèmes) — définitions : sous transaction en distant.
  ipcMain.handle('corpus:ajouterCategorie', (_e, nom: string, parent: string | null) =>
    executerDefinitions('theme.creer', (cible) => cible.ajouterCategorie(nom, parent)),
  )
  ipcMain.handle('corpus:modifierCategorie', (_e, id: string, patch: PatchCategorie) =>
    executerDefinitions('theme.modifier', (cible) => cible.modifierCategorie(id, patch)),
  )
  ipcMain.handle('corpus:deplacerCategorie', (_e, id: string, sens: -1 | 1) =>
    executerDefinitions('theme.deplacer', (cible) => cible.deplacerCategorie(id, sens)),
  )
  ipcMain.handle('corpus:migrerCategorie', (_e, id: string, nouveauParent: string | null) =>
    executerDefinitions('theme.migrer', (cible) => cible.migrerCategorie(id, nouveauParent)),
  )
  ipcMain.handle('corpus:supprimerCategorie', (_e, id: string, exceptId?: string) => {
    if (contextesDistants.actuel instanceof ContexteGitLab) {
      return executerGitLab((contexte) =>
        contexte.executerDefinitions(
          'theme.supprimer',
          (cible) => cible.supprimerCategorie(id),
        )).then((resultat) => resultat.valeur)
    }
    return executerDefinitions(
      'theme.supprimer',
      (cible) => cible.supprimerCategorie(id, exceptId),
    )
  })
  ipcMain.handle('corpus:usagesParCategorie', () => store.usagesParCategorie())

  // Catégories de note (définitions corpus) : lecture simple, mutations sous transaction, comme les autres définitions.
  ipcMain.handle('corpus:categoriesNote', () => store.categoriesNote())
  ipcMain.handle('corpus:ajouterCategorieNote', (_e, nom: string, couleur: string) =>
    executerDefinitions('note.creer-categorie', (cible) => cible.ajouterCategorieNote(nom, couleur)),
  )
  ipcMain.handle('corpus:renommerCategorieNote', (_e, id: string, nom: string) =>
    executerDefinitions('note.renommer-categorie', (cible) => cible.renommerCategorieNote(id, nom)),
  )
  ipcMain.handle('corpus:majCouleurCategorieNote', (_e, id: string, couleur: string) =>
    executerDefinitions('note.colorer-categorie', (cible) => cible.majCouleurCategorieNote(id, couleur)),
  )
  ipcMain.handle('corpus:supprimerCategorieNote', (_e, id: string) =>
    executerDefinitions('note.supprimer-categorie', (cible) => cible.supprimerCategorieNote(id)),
  )
  ipcMain.handle('corpus:compterUsagesCategorieNote', (_e, id: string) =>
    store.compterUsagesCategorieNote(id),
  )
  ipcMain.handle('corpus:resumesThematiques', () => store.resumesThematiques())
  ipcMain.handle('corpus:recueilsCommander', async (_e, commande: CommandeRecueils) => {
    const magasin = store
    const geste = gestureRecueil(commande)
    const source = sourceRecueil(commande)
    // Un recueil qui reprend un passage lit un entretien publié : sur GitLab, ce
    // geste passe par une transaction qui garde cette source, et sa validation
    // ne doit rien demander au miroir.
    if (contextesDistants.actuel instanceof ContexteGitLab) {
      return executerGitLab((contexte) => {
        const preparer = (cible: CorpusStore) => cible.recueilsCommander(commande)
        if (!source) return contexte.executerDefinitions(geste, preparer)
        return contexte.executerDefinitionsAvecSources(
          geste,
          preparer,
          () => [source.entretienId],
        )
      }).then((resultat) => resultat.valeur)
    }
    if (source && !magasin.reperePassageExiste(source.entretienId, source.repereId)) {
      throw new Error("Le repère du passage n'a pas été enregistré dans l'entretien.")
    }
    exigerGeste(fournisseurCourant(), geste)
    const execution = executerContexteDistant(async (contexte) => {
      if (source && contexte.sessions.idsTenus().includes(source.entretienId)) {
        const publication = await contexte.publierEntretien(source.entretienId)
        if (!publication.ok) {
          throw new Error(
            `Le passage n'a pas été publié (${publication.raison ?? 'échec inconnu'}).`,
          )
        }
      }
      return contexte.executerDefinitions(() => magasin.recueilsCommander(commande))
    })
    if (!execution) return magasin.recueilsCommander(commande)
    const resultat = await execution
    if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
    return resultat.valeur
  })
  ipcMain.handle('corpus:tableaubordCommander', (_e, commande: CommandeTableauBord) =>
    executerDefinitions('tableau-bord.modifier', (cible) => cible.tableaubordCommander(commande)),
  )
  ipcMain.handle('corpus:casCommander', (_e, commande: CommandeCas) => {
    const magasin = store
    const geste = gestureCas(commande)
    // Sur GitLab, une commande CAS se prépare sur l'instantané Git : les
    // entretiens publiés qu'elle contrôle sont gardés dans le même commit, et
    // aucun repère n'est validé sur le miroir.
    if (contextesDistants.actuel instanceof ContexteGitLab) {
      return executerGitLab((contexte) => {
        const preparer = (cible: CorpusStore) => cible.casCommander(commande)
        const deduire = deduireSourcesCas(commande)
        if (!deduire) return contexte.executerDefinitions(geste, preparer)
        return contexte.executerDefinitionsAvecSources(geste, preparer, deduire)
      }).then((resultat) => resultat.valeur)
    }
    exigerGeste(fournisseurCourant(), geste)
    const execution = executerIntentionDistante((contexte) =>
      executerCommandeCas(commande, {
        sessionsTenues: () => contexte.sessions.idsTenus(),
        publierEntretien: (entretienId) => contexte.publierEntretien(entretienId),
        verifierReferencesPubliees: (references) =>
          contexte.transactions.verifierReferencesPassagesPubliees(references),
        repereExiste: (entretienId, repereId) =>
          magasin.reperePassageExiste(entretienId, repereId),
        executerDefinitions: () =>
          contexte.executerDefinitions(() => magasin.casCommander(commande)),
        executerDefinitionsAvecSources: () =>
          contexte.transactions.executerDefinitionsAvecSources(
            () => Object.keys(magasin.ouvrir().membership),
            () => magasin.casCommander(commande),
          ),
      }))
    if (execution) return execution
    return executerCommandeCas(commande, {
      sessionsTenues: () => [],
      publierEntretien: async () => ({ ok: true }),
      repereExiste: (entretienId, repereId) =>
        magasin.reperePassageExiste(entretienId, repereId),
      executerDefinitions: () => magasin.casCommander(commande),
    })
  })
  ipcMain.handle('corpus:reglesAnon', () => store.reglesAnon())
  ipcMain.handle('corpus:scanAnon', () => store.scanAnon())
  ipcMain.handle('corpus:notesInventaire', () => store.notesInventaire())
  ipcMain.handle('corpus:notesCommander', (
    _e,
    commande: import('../shared/corpus/notes').CommandeNotes,
  ) => {
    exigerGeste(fournisseurCourant(), 'note.editer')
    return store.notesCommander(commande, true)
  })
  ipcMain.handle('corpus:personnesInventaire', () => store.personnesInventaire())
  ipcMain.handle('corpus:personnesCommander', async (
    _e,
    commande: import('../shared/corpus/personnes').CommandePersonnes,
    depuisRepertoire = false,
  ) => {
    const magasin = store
    if (contextesDistants.actuel instanceof ContexteGitLab) {
      exigerGeste('gitlab', 'personnes.commande')
    }
    exigerGeste(fournisseurCourant(), 'personnes.commande')
    const execution = executerContexteDistant(async (contexte) => {
      const transactions = contexte.transactions
      if (commande.type === 'creerDefinition' || commande.type === 'modifier') {
        return transactions.executer(() => magasin.personnesCommander(commande, false))
      }
      if (commande.type === 'lier' || commande.type === 'annulerRefus') {
        return transactions.executerEntretien(
          commande.entretienId,
          () => magasin.personnesCommander(commande, false),
        )
      }
      if (commande.type === 'refuser') {
        return transactions.refuserRapprochement(commande)
      }
      if (commande.type === 'rapprocher') {
        return transactions.rapprocherPersonnes(commande)
      }
      if (commande.type === 'creer') {
        return transactions.creerPersonneDepuisLocuteur(
          commande.entretienId,
          commande.locuteurId,
          commande.nom,
        )
      }
      if (commande.type === 'supprimer') {
        return transactions.supprimerPersonneVide(commande.personneId)
      }
      if (commande.type === 'fusionner') {
        return transactions.fusionnerPersonnes(commande)
      }
      if (commande.type === 'separer') {
        return transactions.separerPersonne(commande)
      }
      throw new Error(
        'Cette correction de personnes n’est pas encore disponible dans les corpus distants.',
      )
    })
    if (!execution) {
      if (magasin.lectureSeule) {
        throw new Error(
          'Le corpus distant est hors ligne. La correction n’a pas été enregistrée.',
        )
      }
      return magasin.personnesCommander(commande, depuisRepertoire)
    }
    const resultat = await execution
    if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
    return resultat.valeur
  })
  ipcMain.handle('corpus:journalLister', () => store.journalCorpusLister())
  ipcMain.handle('corpus:journalAnnuler', (_e, id: string) => {
    if (!gesteAutorise(fournisseurCourant(), 'journal.annuler')) {
      return { ok: false, raison: 'L’annulation des actions du corpus distant n’est pas encore disponible.', temporaire: false }
    }
    return store.journalCorpusAnnuler(id)
  })
  ipcMain.handle('corpus:regleAnonParEntite', (_e, entite: string) => store.regleAnonParEntite(entite))
  const tablesCorrespondance = new TablesCorrespondance({ store: () => store, lecture: () => contextesDistants.actuel ? 'miroir' : 'local' })
  ipcMain.handle('corpus:apercuExportCorrespondances', (_e, options: OptionsTableCorrespondance) => tablesCorrespondance.preparerExport(options))
  ipcMain.handle('corpus:exporterCorrespondances', async (e, token: string, format: 'v2' | 'v1', confidentielConfirme: boolean, limitesConfirmees: boolean, v1Confirme: boolean) => {
    if (confidentielConfirme !== true || (format !== 'v2' && format !== 'v1') || (format === 'v1' && v1Confirme !== true)) throw new Error('Confirmez la confidentialité et les limites du format avant d’exporter.')
    const table = tablesCorrespondance.exportMemorise(token, limitesConfirmees)
    const contenu = format === 'v2' ? table : aplatirTableV1(table)
    const chemin = await choisirDestination(e, { defaultPath: `correspondances-${format}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!chemin) return { annule: true }
    tablesCorrespondance.verifierDestination(token, chemin)
    ecrireFichierAtomique(chemin, JSON.stringify(contenu, null, 2))
    return { annule: false }
  })
  ipcMain.handle('corpus:apercuImportCorrespondances', async (_e, documents: DocumentCorrespondance[], corrections: CorrectionCorrespondance[] = []) => {
    const contexte = contextesDistants.actuel
    if (!contexte) return tablesCorrespondance.preparerImport(documents, corrections)
    const instantane = await contexte.instantaneCorrespondances()
    if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé pendant l’aperçu. Recalculez-le.')
    return contexte instanceof ContexteGitLab
      ? tablesCorrespondance.preparerImportGitLab(documents, corrections, instantane)
      : tablesCorrespondance.preparerImportWebDAV(documents, corrections, instantane)
  })
  ipcMain.handle('corpus:importerCorrespondances', (_e, token: string, choix: Record<string, ChoixImportCorrespondance>, cibles: import('../shared/corpus/importCorrespondancesEntretiens').ChoixCibleCorrespondance[] = [], confirmees = false) => {
    const preparation = tablesCorrespondance.consommerImport(token, choix, cibles, confirmees)
    if (preparation.choixCibles.length) {
      if (preparation.store !== store) throw new Error('Le corpus a changé. Recalculez l’aperçu.')
      exigerGeste(fournisseurCourant(), 'anon.importer-cibles')
      const execution = executerContexteCommun((contexte) => contexte.importerCorrespondances(preparation))
      if (execution) return execution.then((resultat) => {
        if (!resultat.courant) throw new Error('Le corpus a changé pendant l’import. Consultez le corpus cible avant toute nouvelle tentative.')
        return resultat.valeur
      })
      return store.importerCorrespondancesEntretiens(preparation)
    }
    return executerDefinitions('anon.importer-regles', (cible) => {
      if (preparation.store !== store) throw new Error('Le corpus a changé. Recalculez l’aperçu avant d’importer.')
      return cible.importerDefinitionsAnon(preparation.lignes, preparation.choix, preparation.empreinte)
    })
  })
  ipcMain.handle('corpus:suiviImportCorrespondances', () => {
    const contexte = contextesDistants.actuel
    return estContexteNextcloud(contexte) ? contexte.lireSuiviImportCorrespondances() : null
  })
  ipcMain.handle('corpus:reprendreImportCorrespondances', (_e, operationId: string, confirmee: boolean) => {
    const contexte = contextesDistants.actuel
    if (!estContexteNextcloud(contexte)) throw new Error('La reprise ciblée exige le contexte WebDAV d’origine.')
    const execution = executerIntentionDistante((courant) => courant.reprendreImportCorrespondances(operationId, confirmee))
    if (!execution) throw new Error('Le contexte WebDAV a changé. Rouvrez le corpus cible.')
    return execution
  })
  const retraitsVarianteAnon = new RetraitsVarianteAnon({ store: () => store, local: () => !contextesDistants.actuel,
    exiger: () => exigerGeste(fournisseurCourant(), 'anon.retirer-variante') })
  const commandesRetrait = new CommandesRetraitVarianteAnon({ local: retraitsVarianteAnon,
    capturer: capturerCorpusCourant, verifier: verifierCorpusCourant,
    fournisseur: fournisseurCourant, executer: executerContexteCommun })
  ipcMain.handle('corpus:apercuRetraitVarianteAnon', (_e, demande: DemandeRetraitVarianteAnon) => commandesRetrait.preparer(demande))
  ipcMain.handle('corpus:suiviRetraitVarianteAnon', () => commandesRetrait.lireSuivi())
  ipcMain.handle('corpus:relireSuiviRetraitVarianteAnon', (_e, operationId: string) => commandesRetrait.relireSuivi(operationId))
  ipcMain.handle('corpus:apercuRepriseRetraitVarianteAnon', (_e, operationId: string) => commandesRetrait.preparerReprise(operationId))
  ipcMain.handle('corpus:retirerVarianteAnon', (_e, token: string, confirmee: boolean) => commandesRetrait.appliquer(token, confirmee))

  const suppressionsAnon = new SuppressionsAnon({ store: () => store, local: () => !contextesDistants.actuel,
    exiger: () => exigerGeste(fournisseurCourant(), 'anon.supprimer-partout') })
  ipcMain.handle('corpus:apercuSuppressionAnon', async (_e, demande: DemandeSuppressionAnon) => {
    exigerGeste(fournisseurCourant(), 'anon.supprimer-partout')
    const contexte = contextesDistants.actuel
    if (!contexte) return suppressionsAnon.preparer(demande)
    if (!(contexte instanceof ContexteGitLab) && !estContexteNextcloud(contexte)) throw new Error('La suppression globale n’est pas qualifiée pour ce fournisseur distant.')
    const apercu = await contexte.preparerSuppressionAnon(demande)
    try {
      if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé. Recalculez la suppression.')
      exigerGeste(fournisseurCourant(), 'anon.supprimer-partout')
    } catch (e) { contexte.oublierApercuSuppressionAnon(apercu.token); throw e }
    return apercu
  })
  ipcMain.handle('corpus:suiviSuppressionAnon', () => {
    const contexte = contextesDistants.actuel
    return contexte instanceof ContexteGitLab || estContexteNextcloud(contexte) ? contexte.lireSuiviSuppressionAnon() : null
  })
  ipcMain.handle('corpus:relireSuiviSuppressionAnon', async (_e, operationId: string) => {
    const contexte = contextesDistants.actuel
    if (!(contexte instanceof ContexteGitLab) && !estContexteNextcloud(contexte)) throw new Error('Le suivi exige le corpus distant d’origine.')
    const bilan = await contexte.relireSuiviSuppressionAnon(operationId)
    if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé. Rouvrez le corpus cible.')
    return bilan
  })
  ipcMain.handle('corpus:apercuRepriseSuppressionAnon', async (_e, operationId: string) => {
    exigerGeste(fournisseurCourant(), 'anon.supprimer-partout')
    const contexte = contextesDistants.actuel
    if (!(contexte instanceof ContexteGitLab) && !estContexteNextcloud(contexte)) throw new Error('La reprise exige le corpus distant d’origine.')
    const apercu = await contexte.preparerRepriseSuppressionAnon(operationId)
    try {
      if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé. Rouvrez le corpus cible.')
      exigerGeste(fournisseurCourant(), 'anon.supprimer-partout')
    } catch (e) { contexte.oublierApercuSuppressionAnon(apercu.token); throw e }
    return apercu
  })
  ipcMain.handle('corpus:supprimerRegleAnonPartout', (_e, token: string, confirmee: boolean) => {
    const contexte = contextesDistants.actuel
    if (!contexte) return suppressionsAnon.appliquer(token, confirmee)
    if (!(contexte instanceof ContexteGitLab) && !estContexteNextcloud(contexte)) throw new Error('La suppression globale n’est pas qualifiée pour ce fournisseur distant.')
    const execution = executerContexteCommun((courant) => {
      if (courant !== contexte) {
        contexte.oublierApercuSuppressionAnon(token)
        throw new Error('Le corpus a changé. Recalculez la suppression.')
      }
      try { exigerGeste(fournisseurCourant(), 'anon.supprimer-partout') }
      catch (e) { contexte.oublierApercuSuppressionAnon(token); throw e }
      return contexte.supprimerRegleAnonPartout(token, confirmee)
    })
    if (!execution) {
      contexte.oublierApercuSuppressionAnon(token)
      throw new Error('Le corpus distant de la suppression est indisponible.')
    }
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la suppression. Rouvrez le corpus cible sans recommencer.')
      return resultat.valeur
    })
  })

  const dissociationsAnon = new DissociationsAnon({ store: () => store, local: () => !contextesDistants.actuel,
    exiger: () => exigerGeste(fournisseurCourant(), 'anon.dissocier-globalement') })
  ipcMain.handle('corpus:apercuDissociationAnon', async (_e, demande: DemandeDissociationAnon) => {
    exigerGeste(fournisseurCourant(), 'anon.dissocier-globalement')
    const contexte = contextesDistants.actuel
    if (!contexte) return dissociationsAnon.preparer(demande)
    const apercu = await contexte.preparerDissociationAnon(demande)
    if (contextesDistants.actuel !== contexte) {
      contexte.oublierApercuDissociationAnon(apercu.token)
      throw new Error('Le contexte distant a changé. Recalculez la dissociation.')
    }
    return apercu
  })
  ipcMain.handle('corpus:suiviDissociationAnon', () => {
    const contexte = contextesDistants.actuel
    return contexte?.lireSuiviDissociationAnon() ?? null
  })
  ipcMain.handle('corpus:relireSuiviDissociationAnon', async (_e, operationId: string) => {
    const contexte = contextesDistants.actuel
    if (!contexte) throw new Error('Le suivi exige le contexte distant d’origine.')
    const bilan = await contexte.relireSuiviDissociationAnon(operationId)
    if (contextesDistants.actuel !== contexte) throw new Error('Le contexte distant a changé. Rouvrez le corpus cible.')
    return bilan
  })
  ipcMain.handle('corpus:apercuRepriseDissociationAnon', async (_e, operationId: string) => {
    exigerGeste(fournisseurCourant(), 'anon.dissocier-globalement')
    const contexte = contextesDistants.actuel
    if (!contexte) throw new Error('La reprise exige le contexte distant d’origine.')
    const apercu = await contexte.preparerRepriseDissociationAnon(operationId)
    if (contextesDistants.actuel !== contexte) {
      contexte.oublierApercuDissociationAnon(apercu.token)
      throw new Error('Le contexte distant a changé. Rouvrez le corpus cible.')
    }
    return apercu
  })
  ipcMain.handle('corpus:dissocierRegleAnon', (_e, token: string, confirmee: boolean) => {
    const contexte = contextesDistants.actuel
    if (!contexte) return dissociationsAnon.appliquer(token, confirmee)
    const execution = executerContexteCommun((courant) => {
      if (courant !== contexte) {
        contexte.oublierApercuDissociationAnon(token)
        throw new Error('Le contexte distant a changé. Recalculez la dissociation.')
      }
      try { exigerGeste(fournisseurCourant(), 'anon.dissocier-globalement') }
      catch (e) { contexte.oublierApercuDissociationAnon(token); throw e }
      return contexte.dissocierRegleAnon(token, confirmee)
    })
    if (!execution) {
      contexte.oublierApercuDissociationAnon(token)
      throw new Error('Le contexte distant de la dissociation est indisponible.')
    }
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la publication. Rouvrez le corpus cible sans rejouer la dissociation.')
      return resultat.valeur
    })
  })
  const renommagesAnon = new RenommagesAnon({ store: () => store, local: () => !contextesDistants.actuel })
  ipcMain.handle('corpus:apercuRenommageAnon', async (_e, demande: DemandeRenommageAnon) => {
    exigerGeste(fournisseurCourant(), 'anon.renommer-variante')
    const contexte = contextesDistants.actuel
    if (!contexte) return renommagesAnon.preparer(demande)
    const instantane = await contexte.instantaneRenommageAnon()
    if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez-le.')
    const apercu = contexte instanceof ContexteGitLab
      ? renommagesAnon.preparerGitLab(demande, instantane, contexte.renommageAnonDisponible(), contexte)
      : renommagesAnon.preparerWebDAV(demande, instantane, contexte.renommageAnonDisponible(), contexte)
    apercu.disponibilites = await contexte.observerCiblesRenommageAnon(apercu.entretiens.filter((e) => e.renommages).map((e) => e.id))
    if (contextesDistants.actuel !== contexte) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez-le.')
    return apercu
  })
  ipcMain.handle('corpus:suiviRenommageAnon', () => {
    const contexte = contextesDistants.actuel
    return contexte?.lireSuiviRenommageAnon() ?? null
  })
  ipcMain.handle('corpus:apercuRepriseRenommageAnon', async (_e, operationId: string) => {
    exigerGeste(fournisseurCourant(), 'anon.renommer-variante')
    const contexte = contextesDistants.actuel
    if (!contexte) throw new Error('La reprise exige le contexte distant d’origine.')
    const reprise = await contexte.preparerRepriseRenommageAnon(operationId)
    if (contextesDistants.actuel !== contexte) throw new Error('Le contexte distant a changé. Rouvrez le corpus cible.')
    const apercu = contexte instanceof ContexteGitLab
      ? renommagesAnon.preparerGitLab(reprise.demande, reprise.instantane, true, contexte, reprise)
      : renommagesAnon.preparerWebDAV(reprise.demande, reprise.instantane, true, contexte, reprise)
    apercu.disponibilites = await contexte.observerCiblesRenommageAnon(apercu.entretiens.filter((e) => e.renommages).map((e) => e.id))
    if (contextesDistants.actuel !== contexte) throw new Error('Le contexte distant a changé. Rouvrez le corpus cible.')
    return apercu
  })
  ipcMain.handle('corpus:renommerVarianteAnon', (_e, token: string, confirmee: boolean) => {
    exigerGeste(fournisseurCourant(), 'anon.renommer-variante')
    const contexte = contextesDistants.actuel
    if (!contexte) return renommagesAnon.appliquer(token, confirmee)
    const preparation = contexte instanceof ContexteGitLab
      ? renommagesAnon.consommerGitLab(token, confirmee, contexte)
      : renommagesAnon.consommerWebDAV(token, confirmee, contexte)
    const execution = executerContexteCommun((courant) => {
      if (courant !== contexte) throw new Error('Le contexte distant a changé. Recalculez le renommage.')
      return contexte.renommerVarianteAnon(preparation)
    })
    if (!execution) throw new Error('Le contexte distant du renommage est indisponible.')
    return execution.then((resultat) => {
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la publication. Rouvrez le corpus cible, sans rejouer le renommage.')
      return resultat.valeur
    })
  })
  ipcMain.handle('corpus:regleAnonCreer', (_e, entite: string, pseudos: string[], categorie?: string) =>
    executerDefinitions('anon.creer-regle', (cible) => cible.regleAnonCreer(entite, pseudos, categorie)),
  )
  ipcMain.handle('corpus:regleAnonAjouterVariante', (_e, demande: DemandeAjoutVarianteAnon) => {
    const execution = executerContexteCommun((contexte) => contexte instanceof ContexteGitLab
      ? contexte.executerDefinitions('anon.ajouter-variante', (cible) => cible.regleAnonAjouterVariante(demande)).then((r) => r.valeur)
      : contexte.ajouterVarianteAnon(demande))
    if (!execution) { exigerGeste('local', 'anon.ajouter-variante'); return store.regleAnonAjouterVariante(demande) }
    return execution.then((r) => {
      if (!r.courant) throw new Error('Le corpus a changé pendant l’ajout. Rouvrez le corpus cible sans rejouer.')
      return r.valeur
    })
  })
  ipcMain.handle('corpus:regleAnonAjouterPseudo', (_e, id: string, pseudo: string) =>
    executerDefinitions('anon.ajouter-pseudo', (cible) => cible.regleAnonAjouterPseudo(id, pseudo)),
  )
  ipcMain.handle('corpus:regleAnonUtiliseeAilleurs', (_e, id: string, exceptId?: string) =>
    store.regleAnonUtiliseeAilleurs(id, exceptId),
  )
  ipcMain.handle('corpus:regleAnonSupprimer', (_e, id: string) =>
    executerDefinitions('anon.supprimer-regle', (cible) => cible.regleAnonSupprimer(id)),
  )
  // Paramètres de pseudonymisation (étape 4) : lecture directe, écriture sous transaction de définitions (corpus.json est un fichier partagé).
  ipcMain.handle('corpus:paramsAnonLire', () => store.lireParamsAnon())
  ipcMain.handle('corpus:paramsAnonEcrire', (_e, params: ParamsAnon) =>
    executerDefinitions('anon.ecrire-parametres', (cible) => cible.ecrireParamsAnon(params)),
  )
  // Thématique d'une règle (4c) : mutation de corpus.json sous transaction.
  ipcMain.handle('corpus:regleAnonCategoriser', (_e, id: string, categorie: string | null) =>
    executerDefinitions('anon.renommer-theme', (cible) => cible.regleAnonCategoriser(id, categorie)),
  )
  ipcMain.handle('corpus:appliquerRegleAnonLot', (_e, cibles: CibleRegleAnon[]) => {
    exigerGeste(fournisseurCourant(), 'regles.lot')
    return executerSelonFournisseur(
      (contexte) => contexte.transactions.appliquerRegleLot(cibles),
      (contexte) => contexte.appliquerRegleLot(cibles),
    ) ?? appliquerRegleLotLocal(store, cibles)
  })
  ipcMain.handle('corpus:compterUsagesCategorie', (_e, code: string, exceptId?: string) =>
    store.compterUsagesCategorie(code, exceptId),
  )

  // Variables & modalités (EAV) — définitions : sous transaction distant.
  ipcMain.handle('corpus:ajouterVariable', (_e, lib: string, portee: 'entretien' | 'locuteur') =>
    executerDefinitions('variable.creer', (cible) => cible.ajouterVariable(lib, portee)),
  )
  ipcMain.handle('corpus:modifierVariable', (_e, id: string, patch: Partial<Variable>) =>
    executerDefinitions('variable.modifier', (cible) => cible.modifierVariable(id, patch)),
  )
  ipcMain.handle('corpus:supprimerVariable', (_e, id: string) =>
    executerDefinitions('variable.supprimer', (cible) => cible.supprimerVariable(id)),
  )
  ipcMain.handle('corpus:ajouterModalite', (_e, idVar: string, lib: string) =>
    executerDefinitions('modalite.creer', (cible) => cible.ajouterModalite(idVar, lib)),
  )
  ipcMain.handle('corpus:modifierModalite', (_e, idVar: string, idMod: string, lib: string) =>
    executerDefinitions('modalite.modifier', (cible) => cible.modifierModalite(idVar, idMod, lib)),
  )
  ipcMain.handle('corpus:supprimerModalite', (_e, idVar: string, idMod: string) =>
    executerDefinitions('modalite.supprimer', (cible) => cible.supprimerModalite(idVar, idMod)),
  )
  ipcMain.handle('corpus:matrice', () => store.matriceCorpus())

  // Audio : une session d'éditeur existante est réutilisée. Sur un entretien
  // fermé distant, la mutation est une transaction courte construite depuis
  // le GET effectué après acquisition du verrou.
  ipcMain.handle('corpus:assignerAudio', async (_e, id: string, source: string) => {
    const execution = executerContexteCommun(async (contexte) => {
      if (contexte instanceof ContexteGitLab) {
        const ouverture = await contexte.ouvrirEntretienPourEdition(id)
        if (!ouverture.ok) throw new Error(ouverture.raison)
        if (ouverture.acces !== 'edition') {
          const utilisateur = ouverture.verrouTenuParAutrui?.userId ?? 'un autre utilisateur'
          throw new Error(`Cet entretien GitLab est déjà modifié par ${utilisateur}.`)
        }
        const resultat = contexte.store.assignerAudio(id, source)
        if (resultat) {
          await contexte.marquerSessionSale(contexte.ressourceEntretien(id))
          const publication = await contexte.publierEntretien(id)
          if (!publication.ok) {
            throw new Error(`Assignation audio non publiée : ${publication.raison ?? 'refus GitLab'}.`)
          }
        }
        await contexte.fermerEntretien(id)
        return resultat
      }

      const gestionnaire = contexte.sessions
      const magasin = contexte.store
      if (gestionnaire.idsTenus().includes(id)) {
        const resultat = magasin.assignerAudio(id, source)
        if (resultat) gestionnaire.noterSale(id)
        return resultat
      }
      const ref = normaliserCheminAudio(source)
      if (!existsSync(ref)) return null
      const resultat = await gestionnaire.modifierEntretienFerme(id, (data) => {
        data.meta.audioRef = ref
        return { audioRef: ref }
      })
      if (!resultat.ok) {
        if (resultat.raison === 'liberation') magasin.apresMutationAudio(id, false)
        throw new Error(`Assignation audio impossible : ${resultat.raison}.`)
      }
      magasin.apresMutationAudio(id, false)
      return resultat.resultat
    })
    if (!execution) return store.assignerAudio(id, source)
    const resultat = await execution
    if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
    return resultat.valeur
  })
  ipcMain.handle('corpus:effacerAudio', async (_e, id: string) => {
    const execution = executerContexteDistant(async (contexte) => {
      const gestionnaire = contexte.sessions
      const magasin = contexte.store
      if (gestionnaire.idsTenus().includes(id)) {
        const resultat = magasin.effacerAudio(id)
        gestionnaire.noterSale(id)
        return resultat
      }
      const resultat = await gestionnaire.modifierEntretienFerme(id, (data) => {
        data.meta.audioRef = null
        delete data.meta.audioDistant
        return { audioRef: null as null }
      })
      if (!resultat.ok) {
        if (resultat.raison === 'liberation') magasin.apresMutationAudio(id, true)
        throw new Error(`Suppression audio impossible : ${resultat.raison}.`)
      }
      magasin.apresMutationAudio(id, true)
      return resultat.resultat
    })
    if (!execution) return store.effacerAudio(id)
    const resultat = await execution
    if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
    return resultat.valeur
  })
  ipcMain.handle(
    'corpus:remplacerTranscription',
    async (_e, id: string, transcription: TranscriptionEntretien) => {
      const execution = executerContexteDistant(async (contexte) => {
        const gestionnaire = contexte.sessions
        const magasin = contexte.store
        if (gestionnaire.idsTenus().includes(id)) {
          const date = magasin.remplacerTranscription(id, transcription)
          if (date) gestionnaire.noterSale(id)
          return date
        }
        const resultat = await gestionnaire.modifierEntretienFerme(id, (data) => {
          data.corpsTexte = transcription.corpsTexte
          data.annotations = transcription.annotations
          data.ancres = transcription.ancres
          data.reperesPassages = rendreReperesOrphelins(data.reperesPassages)
          data.locuteurs = completerIdsLocuteurs(
            id,
            transcription.locuteurs,
            data.locuteurs,
          )
          return true
        })
        if (!resultat.ok) {
          throw new Error(`Import de la transcription impossible : ${resultat.raison}.`)
        }
        return new Date().toISOString()
      })
      if (!execution) return store.remplacerTranscription(id, transcription)
      const resultat = await execution
      if (!resultat.courant) throw new Error('Le corpus a changé pendant la commande.')
      return resultat.valeur
    },
  )
  ipcMain.handle('corpus:ecrireWaveform', (_e, id: string, png: Uint8Array) =>
    store.ecrireWaveform(id, png),
  )

  /** « Associer l'audio local… » : RÉFÉRENCE un fichier présent sur CE poste,
   *  pour un entretien dont l'audioRef partagée n'y pointe nulle part.
   *  Association machine-local (`audio-locaux.json`), sans copie ni écriture
   *  au JSON/serveur — chaque poste résout chez lui. */
  ipcMain.handle('corpus:associerAudioLocal', (_e, id: string, source: string) =>
    store.associerAudioLocal(id, source),
  )
  ipcMain.handle('corpus:audios', () => store.audios())
  ipcMain.handle('corpus:verifierAudios', () => store.verifierAudios())
  /** « Faire une copie de sauvegarde du corpus (ZIP) ».
   *  Archive le dossier du corpus courant, réservé au corpus local.
   *  Un corpus distant vit sur son serveur, qui porte sa propre sauvegarde. */
  ipcMain.handle('corpus:copieSauvegardeZip', async (e): Promise<ResultatArchiveCorpus> => {
    const capture = capturerCorpusCourant()
    let nom = basename(capture.dossier)
    if (!capture.contexte) {
      try {
        nom = capture.store.ouvrir().nom ?? nom
      } catch {
        /* dossier disparu : l'absence de corpus.json fera refuser l'archive */
      }
    }
    const resultat = await archiverCorpusLocal(
      e,
      capture.dossier,
      nom,
      capture.contexte !== null,
    )
    verifierCorpusCourant(capture)
    return resultat
  })
  // Marqueur de corpus de TEST (`corpus.json: { demo }`) : identité, mode,
  // sources et étapes validées. Champ additif optionnel, pas de bump de version.
  ipcMain.handle('corpus:marquerDemo', (_e, marqueur: MarqueurDemo) => {
    exigerGeste(fournisseurCourant(), 'corpus.marquer-demo')
    return store.marquerDemo(marqueur)
  })

  // --- Docs cadre projet : documents de méthode propres au corpus courant ---
  // Le renderer ne transmet JAMAIS de chemin : une source ('projet' | 'exemple')
  // et un nom validé côté main. Les racines (corpus courant, exemples embarqués)
  // sont résolues ICI, à partir du contexte de corpus — jamais depuis l'IPC.
  // Les exemples n'ont aucune voie de mutation (lecture + copie seulement).
  const REFUS_DOCS_CADRE_DISTANT =
    'Ces documents sont en lecture seule dans un corpus distant. ' +
    'Pour les modifier, ouvrez le dossier dans Nextcloud.'
  const dirExemplesDocs = cheminExemplesDocsCadre()

  function clientDocsCadre(contexte: ContexteDistantActif): ClientWebDAV {
    if (!estContexteNextcloud(contexte)) {
      throw new Error('Les documents cadre GitLab ne sont pas encore disponibles.')
    }
    return contexte.miroir.accesClient()
  }

  ipcMain.handle('docsCadre:lister', async (): Promise<InventaireDocsCadre> => {
    const capture = capturerCorpusCourant()
    const exemples = inventaireExemplesDocsCadre(dirExemplesDocs)
    if (capture.contexte) {
      try {
        const projet = await inventaireDocsCadreDistant(
          clientDocsCadre(capture.contexte),
        )
        verifierCorpusCourant(capture)
        return { mode: 'distant', projet, exemples }
      } catch (erreur) {
        verifierCorpusCourant(capture)
        return {
          mode: 'distant',
          projet: [],
          exemples,
          erreurProjet: erreur instanceof Error
            ? erreur.message
            : 'Impossible de lire les documents du corpus distant.',
        }
      }
    }
    return {
      mode: 'local',
      projet: inventaireDocsCadreLocal(capture.dossier),
      exemples,
    }
  })

  ipcMain.handle(
    'docsCadre:lireApercu',
    async (_e, source: SourceDocumentCadre, nom: string): Promise<ResultatLectureDocsCadre> => {
      if ((source !== 'projet' && source !== 'exemple') || !estListable(nom)) {
        throw new Error('Document cadre invalide.')
      }
      if (source === 'exemple') return lireApercuExemple(dirExemplesDocs, nom)
      const capture = capturerCorpusCourant()
      if (capture.contexte) {
        const resultat = await lireApercuDistant(
          clientDocsCadre(capture.contexte),
          nom,
        )
        verifierCorpusCourant(capture)
        return resultat
      }
      return lireApercuLocal(capture.dossier, nom)
    },
  )

  /** « Ajouter un fichier » : le sélecteur natif vit ICI ; le chemin choisi ne
   *  traverse pas le pont. Un 2e appel avec `nomSouhaite` (suffixe proposé
   *  après collision) copie sous un autre nom, jamais un écrasement. */
  ipcMain.handle(
    'docsCadre:ajouterFichier',
    async (e, nomSouhaite?: string): Promise<ResultatMutationDocsCadre> => {
      const capture = capturerCorpusCourant()
      if (capture.contexte) throw new Error(REFUS_DOCS_CADRE_DISTANT)
      const r = await montrerOuvrir(e, {
        title: 'Ajouter un document au corpus',
        properties: ['openFile'],
      })
      verifierCorpusCourant(capture)
      if (r.canceled || r.filePaths.length === 0) return { ok: false, raison: 'annule' }
      return ajouterFichierLocal(capture.dossier, r.filePaths[0], nomSouhaite)
    },
  )

  /** « Glisser-déposer » : copie du fichier déposé vers `DocsCadre/`.
   *  Le chemin vient du drop (pas d'un dialogue) mais n'existe QUE dans le
   *  main : validation fichier régulier, refus distant, jamais d'écrasement. */
  ipcMain.handle(
    'docsCadre:deposer',
    (_e, cheminSource: string): ResultatMutationDocsCadre => {
      if (contextesDistants.actuel) throw new Error(REFUS_DOCS_CADRE_DISTANT)
      if (typeof cheminSource !== 'string' || !cheminSource.trim()) {
        throw new Error('Dépôt invalide : source manquante.')
      }
      return deposerFichierLocal(dossierCourant, cheminSource)
    },
  )

  ipcMain.handle(
    'docsCadre:renommer',
    (_e, ancienNom: string, nouveauNom: string): ResultatMutationDocsCadre => {
      if (contextesDistants.actuel) throw new Error(REFUS_DOCS_CADRE_DISTANT)
      return renommerLocal(dossierCourant, ancienNom, nouveauNom)
    },
  )

  ipcMain.handle('docsCadre:supprimer', (_e, nom: string): ResultatMutationDocsCadre => {
    if (contextesDistants.actuel) throw new Error(REFUS_DOCS_CADRE_DISTANT)
    return supprimerLocal(dossierCourant, nom)
  })

  ipcMain.handle('docsCadre:ouvrir', async (_e, nom: string): Promise<void> => {
    const capture = capturerCorpusCourant()
    if (capture.contexte) throw new Error(REFUS_DOCS_CADRE_DISTANT)
    const erreur = await shell.openPath(resoudreLocal(capture.dossier, nom))
    verifierCorpusCourant(capture)
    if (erreur) throw new Error(`Ouverture impossible : ${erreur}.`)
  })

  /** Ouvre le dossier `DocsCadre/` dans le gestionnaire de fichiers ; sa
   *  création explicite ici permet aussi d'y déposer ses documents à la main. */
  ipcMain.handle('docsCadre:ouvrirDossier', async (): Promise<void> => {
    const capture = capturerCorpusCourant()
    if (capture.contexte) throw new Error(REFUS_DOCS_CADRE_DISTANT)
    const dir = resoudreDossierLocal(capture.dossier)
    const erreur = await shell.openPath(dir)
    verifierCorpusCourant(capture)
    if (erreur) throw new Error(`Ouverture du dossier impossible : ${erreur}.`)
  })

  /** « Enregistrer une copie » : le fichier original, octet pour octet,
   *  vers une destination choisie ; en FLUX pour un distant volumineux. */
  ipcMain.handle(
    'docsCadre:enregistrerCopie',
    async (e, source: SourceDocumentCadre, nom: string): Promise<boolean> => {
      if ((source !== 'projet' && source !== 'exemple') || !estListable(nom)) {
        throw new Error('Document cadre invalide.')
      }
      const capture = capturerCorpusCourant()
      const sourceExemple = source === 'exemple' ? resoudreExemple(dirExemplesDocs, nom) : null
      const r = await montrerSauver(e, { defaultPath: nom })
      verifierCorpusCourant(capture)
      if (r.canceled || !r.filePath) return false
      if (sourceExemple) {
        copyFileSync(sourceExemple, r.filePath)
        return true
      }
      if (capture.contexte) {
        await enregistrerCopieDistant(
          clientDocsCadre(capture.contexte),
          nom,
          r.filePath,
        )
        verifierCorpusCourant(capture)
        return true
      }
      enregistrerCopieLocal(capture.dossier, nom, r.filePath)
      return true
    },
  )

  /** « Ouvrir dans Nextcloud » : URL construite et validée côté main,
   *  JAMAIS fournie par le renderer ; le mot de passe d'application n'est
   *  jamais transmis au navigateur. Racine non reconnue → refus propre. */
  ipcMain.handle('docsCadre:ouvrirDansNextcloud', async (): Promise<void> => {
    const capture = capturerCorpusCourant()
    if (!capture.contexte) {
      throw new Error('Le corpus courant est local : « Ouvrir dans Nextcloud » n’a pas de sens ici.')
    }
    const url = urlNextcloudPourCorpus(
      clientDocsCadre(capture.contexte).config.baseUrl,
    )
    if (!url) {
      throw new Error('L’adresse du corpus distant ne correspond pas à un serveur Nextcloud reconnu.')
    }
    await shell.openExternal(url)
    verifierCorpusCourant(capture)
  })

  // --- Corpus distant : connexion et ouverture ---
  const sansSecret = (config: ConfigCorpusDistant): DestinationWebDAVPublic => ({
    fournisseur: 'webdav',
    id: config.id,
    urlServeur: config.urlServeur,
    utilisateur: config.utilisateur,
    motDePasseDisponible: coffre.motDePasseDisponible(config.id),
  })

  const listerDestinationsGitLabPubliques = (): DestinationGitLabPublic[] =>
    coffre.listerDestinationsGitLab()
      .map((destination) => destinationGitLabPublique(
        coffre,
        destination,
        (compteId) => authentificationGitLab.aConnecte(compteId),
      ))
      .filter((destination): destination is DestinationGitLabPublic => destination !== null)

  /** Nettoyage best effort après refus de création : supprime la FEUILLE que nous venons de créer.
   *  (Dossiers vides sans corpus, jamais un dossier préexistant de l'utilisateur.) */
  async function publierNettoyage(baseUrl: string, identifiants: { utilisateur: string; motDePasse: string }): Promise<void> {
    try {
      const u = new URL(baseUrl)
      const segments = u.pathname.split('/').filter(Boolean)
      const parent = [u.origin, ...segments.slice(0, -1)].join('/')
      await new ClientWebDAV({ baseUrl: parent, identifiants }).supprimer(segments[segments.length - 1])
    } catch {
      /* best effort : des dossiers vides restants sont sans danger */
    }
  }

  ipcMain.handle('webdav:lister', () => coffre.lister().map(sansSecret))
  ipcMain.handle('gitlab:lister', listerDestinationsGitLabPubliques)
  ipcMain.handle(
    'gitlab:configurerBaseMedia',
    async (_e, destinationId: string, demande: { urlBase: string; utilisateur: string; motDePasse: string }) => {
      const resultat = await enregistrerBaseMediaVerifiee(coffre, destinationId, demande)
      if (resultat.ok && contextesDistants.actuel?.id === destinationId) {
        relaisMediaDistant.invaliderTout()
      }
      return resultat
    },
  )
  ipcMain.handle('gitlab:oublierBaseMedia', (_e, destinationId: string) => {
    coffre.oublierBaseMedia(destinationId)
    if (contextesDistants.actuel?.id === destinationId) relaisMediaDistant.invaliderTout()
    return listerDestinationsGitLabPubliques()
  })
  ipcMain.handle('gitlab:detecterInstance', (_e, urlProjet: string) =>
    detecterInstanceGitLab(urlProjet))
  ipcMain.handle('gitlab:etat', (_e, urlInstance: string) =>
    authentificationGitLab.etat(urlInstance))
  ipcMain.handle('gitlab:connecter', (_e, urlInstance: string, clientId?: string) =>
    authentificationGitLab.connecter(urlInstance, clientId))
  ipcMain.handle('gitlab:connecterAvecJeton', (_e, urlInstance: string, jeton: string) =>
    authentificationGitLab.connecterAvecJeton(urlInstance, jeton))
  ipcMain.handle(
    'gitlab:deconnecter',
    (_e, urlInstance: string, utilisateur: string) =>
      authentificationGitLab.deconnecter(urlInstance, utilisateur),
  )
  ipcMain.handle('gitlab:oublierCompte', (_e, urlInstance: string, utilisateur: string) => {
    authentificationGitLab.oublierCompte(urlInstance, utilisateur)
    return listerDestinationsGitLabPubliques()
  })
  ipcMain.handle(
    'gitlab:preparerProjet',
    (_e, demande: DemandePreparationProjetGitLab) =>
      preparerProjetGitLab(demande, authentificationGitLab),
  )
  ipcMain.handle('distant:stockageSecuriseDisponible', () =>
    coffre.stockageSecuriseDisponible(),
  )

  ipcMain.handle('webdav:oublier', (_e, id: string) =>
    transitionner(() => oublierCompte({
      id,
      idActif: contextesDistants.actuel?.id ?? null,
      fermerContexteActuel,
      desactiverContexte: () => {
        contextesDistants.remplacer(null)
      },
      oublier: (idCompte) => coffre.oublier(idCompte),
      lister: () => coffre.lister().map(sansSecret),
    })),
  )

  ipcMain.handle('webdav:connecter', async (_e, params: DemandeConnexionWebDAV): Promise<ResultatConnexionWebDAV> => {
    const client = new ClientWebDAV({
      baseUrl: params.urlServeur.replace(/\/+$/, ''),
      identifiants: { utilisateur: params.utilisateur, motDePasse: params.motDePasse },
    })
    const profil = await profilerServeur(client)
    if (!profil.preconditions) {
      return {
        ok: false as const,
        note:
          profil.notes?.join(' ; ') ??
          'Le serveur ignore les préconditions HTTP (If-Match / If-None-Match) : aucun verrou fiable possible.',
      }
    }
    const config = coffre.enregistrer({
      urlServeur: params.urlServeur,
      utilisateur: params.utilisateur,
      motDePasse: params.motDePasse,
    })
    return {
      ok: true as const,
      compte: sansSecret(config),
      profil: { preconditions: profil.preconditions, filesLock: profil.filesLock },
    }
  })

  /** Crée un corpus WebDAV sans écraser un corpus existant.
   *  La destination est enregistrée après publication ; le renderer enchaîne sur l'ouverture.
   */
  ipcMain.handle('webdav:creer', async (_e, params: DemandeCreationWebDAV): Promise<ResultatConnexionWebDAV> => {
    const baseUrl = params.urlServeur.trim().replace(/\/+$/, '')
    const identifiants = { utilisateur: params.utilisateur.trim(), motDePasse: params.motDePasse }
    try {
      // 1. Chaîne de dossiers D'ABORD : la sonde de préconditions écrit dans la cible,
      //    et échouerait si le dossier n'existait pas encore.
      const publieur = new PublieurCorpus({ baseUrl, identifiants })
      const { feuilleCreee } = await publieur.preparerRacine()
      // 2. Préconditions réelles, mesurées sur une cible qui existe désormais.
      const profil = await profilerServeur(new ClientWebDAV({ baseUrl, identifiants }))
      if (!profil.preconditions) {
        // Refus → nettoyage de la feuille SI nous venons de la créer ; on ne touche jamais un dossier préexistant de l'utilisateur.
        if (feuilleCreee) await publierNettoyage(baseUrl, identifiants)
        return {
          ok: false as const,
          note:
            profil.notes?.join(' ; ') ??
            'Le serveur ignore les préconditions HTTP (If-Match / If-None-Match) : aucun verrou fiable possible.',
        }
      }
      // 3. Publication puis enregistrement EN DERNIER : un échec réseau ou un « déjà corpus » ne laisse aucun compte fantôme.
      await publieur.publierSquelette(params.nomCorpus.trim())
      const config = coffre.enregistrer({ urlServeur: baseUrl, utilisateur: params.utilisateur, motDePasse: params.motDePasse })
      return {
        ok: true as const,
        compte: sansSecret(config),
        profil: { preconditions: profil.preconditions, filesLock: profil.filesLock },
      }
    } catch (e) {
      if (e instanceof ErreurDejaCorpus) return { ok: false as const, note: e.message }
      if (e instanceof ErreurHttp) {
        return { ok: false as const, note: `Publication impossible (HTTP ${e.statut}) — serveur injoignable ou droits insuffisants.` }
      }
      throw e
    }
  })

  /** Prépare entièrement un corpus distant avant de fermer l'ancien contexte,
   *  puis effectue une bascule atomique. */
  ipcMain.handle('webdav:ouvrir', (_e, id: string, motDePasseSaisi?: string) =>
    transitionner(async (): Promise<OuvertureDistante> => {
      const config = coffre.lister().find((c) => c.id === id)
      if (!config) throw new Error('Compte distant inconnu')
      const motDePasse = motDePasseSaisi || coffre.motDePasse(id)
      if (!motDePasse) {
        throw new Error("Saisissez le mot de passe d'application pour cette session.")
      }
      const client = new ClientWebDAV({
        baseUrl: config.urlServeur,
        identifiants: { utilisateur: config.utilisateur, motDePasse },
      })
      const dirMiroir = join(app.getPath('userData'), 'miroirs', id)
      let evenementDuContexteCourant = (): boolean => true
      const surProgression = (p: ProgressionTransfert): void => {
        if (!evenementDuContexteCourant()) return
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('distant:progression', p)
      }
      const nouveauVerrouNatif = await sonderFilesLock(config.urlServeur, {
        utilisateur: config.utilisateur,
        motDePasse,
      })
      const contextePrecedent = contextesDistants.actuel
      const exclusionsSupplementaires =
        contextePrecedent?.id === id && estContexteNextcloud(contextePrecedent)
          ? contextePrecedent.sessions.idsTenus()
          : []
      const preparation = await preparerContexteNextcloud({
        id,
        dirLocal: dirMiroir,
        client,
        identite: () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
        verrouNatif: nouveauVerrouNatif,
        exclusionsSupplementaires,
        surProgression,
        surRetrogradation: (idRetire) => {
          if (!evenementDuContexteCourant()) return
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('distant:sessionDegradee', idRetire)
          }
        },
      })

      if (motDePasseSaisi) coffre.memoriserMotDePasse(id, motDePasseSaisi)
      await fermerContexteActuel()
      store.viderApercusOperationTheme()
      store = preparation.contexte.store
      dossierCourant = preparation.contexte.dirLocal
      contextesDistants.remplacer(preparation.contexte)
      const captureInstallee = contextesDistants.capturer()!
      evenementDuContexteCourant = () => contextesDistants.estCourante(captureInstallee)
      preparation.contexte.demarrer()
      ajouterRecentDistant(id)
      return {
        dir: dirMiroir,
        nom: preparation.corpus.nom ?? basename(config.urlServeur),
        corpus: preparation.corpus,
        distant: sansSecret(config),
        capacites: matriceCapacites('webdav'),
        verrous: preparation.verrous,
        verrousIndisponibles: preparation.verrousIndisponibles,
        inaccessibles: preparation.inaccessibles,
      }
    }),
  )

  // Ouverture GitLab : la séquence (préparation, coffre, fermeture,
  // installation) vit dans le service ; les handlers ne gardent que la file
  // de transitions, propriétaire unique de la sérialisation des bascules.
  const ouvertureGitLab = new ServiceOuvertureGitLab({
    coffre,
    authentification: authentificationGitLab,
    dirProfil: app.getPath('userData'),
    identiteSession: { machineId, sessionId: SESSION_ID },
    fermerContexte: fermerContexteActuel,
    installer: (destination, preparation) => {
      store.viderApercusOperationTheme()
      store = preparation.contexte.store
      dossierCourant = preparation.contexte.dirLocal
      contextesDistants.remplacer(preparation.contexte)
      ajouterRecentDistant(destination.id)
    },
  })

  ipcMain.handle(
    'gitlab:creerEtOuvrir',
    (_e, demande: DemandeCreationGitLab) => transitionner(() => ouvertureGitLab.creerEtOuvrir(demande)),
  )
  ipcMain.handle(
    'gitlab:enregistrerEtOuvrir',
    (_e, demande: DemandeOuvertureGitLab) => transitionner(() => ouvertureGitLab.enregistrerEtOuvrir(demande)),
  )

  ipcMain.handle(
    'gitlab:ouvrir',
    (_e, id: string) => transitionner(() => ouvertureGitLab.ouvrir(id)),
  )

  ipcMain.handle('gitlab:oublierDestination', (_e, id: string) =>
    transitionner(() => oublierCompte({
      id,
      idActif: contextesDistants.actuel?.id ?? null,
      fermerContexteActuel,
      desactiverContexte: () => contextesDistants.remplacer(null),
      oublier: (destinationId) => coffre.oublierDestinationGitLab(destinationId),
      lister: listerDestinationsGitLabPubliques,
    })),
  )

  /** « Actualiser » / pull doux : null si le corpus courant est local.
   *  Les fichiers SOUS NOTRE verrou sont exclus du pull — le miroir n'écrase
   *  jamais une copie de travail en session ; la divergence passe par If-Match
   *  à la publication.
   *  Les verrous sont enrichis pour les badges : scan `verrous/`, ou PROPFIND
   *  files_lock sur `entretiens/`. */
  ipcMain.handle('distant:tirer', async (): Promise<ResultatTiragePublic | null> => {
    const execution = executerContexteCommun((contexte) => contexte.actualiser())
    if (!execution) return null
    const resultat = await execution
    return resultat.courant ? resultat.valeur : null
  })

  /* ── Publication manuelle + reprise crash + badges ────────────────────── */

  /** Navigation du sélecteur de médias partagés.
   *  GitLab inventorie la base WebDAV locale.
   *  Son adresse et son secret ne quittent jamais le main. */
  ipcMain.handle(
    'distant:listerDossier',
    async (_e, dossier: string): Promise<ResultatListeDossierMedia | null> => {
      const execution = executerContexteCommun(async (contexte) => {
        if (contexte instanceof ContexteGitLab) {
          const resolution = resoudreBaseMedia(coffre, contexte.id)
          if (!resolution.ok) return { ok: false as const, motif: resolution.motif }
          return listerDossierMedia(resolution.client, dossier)
        }
        try {
          const entrees = await contexte.listerDossier(dossier)
          return { ok: true as const, entrees }
        } catch (erreur) {
          if (erreur instanceof ErreurHttp) {
            if (erreur.statut === 401 || erreur.statut === 403) {
              return { ok: false as const, motif: 'droits' as const }
            }
            if (erreur.statut === 404) {
              return { ok: false as const, motif: 'dossier-absent' as const }
            }
          }
          return { ok: false as const, motif: 'indisponible' as const }
        }
      })
      if (!execution) return null
      const resultat = await execution
      return resultat.courant ? resultat.valeur : null
    },
  )

  /** Contrôle le fichier choisi sans en lire le contenu. */
  ipcMain.handle('distant:verifierMedia', async (_e, chemin: string) => {
    try {
      verifierCheminMediaRelatif(chemin)
    } catch {
      return { ok: false as const, raison: 'chemin-invalide' as const }
    }
    const execution = executerContexteCommun(async (contexte) => {
      if (!(contexte instanceof ContexteGitLab)) return { ok: true as const }
      const resolution = resoudreBaseMedia(coffre, contexte.id)
      if (!resolution.ok) return { ok: false as const, raison: resolution.motif }
      const resultat = await verifierMediaDesignable(resolution.client, chemin)
      return resultat.ok
        ? { ok: true as const }
        : { ok: false as const, raison: resultat.motif }
    })
    if (!execution) return { ok: false as const, raison: 'indisponible' as const }
    const resultat = await execution
    return resultat.courant
      ? resultat.valeur
      : { ok: false as const, raison: 'indisponible' as const }
  })

  /** Prépare une URL opaque après avoir vérifié le média et les plages. */
  ipcMain.handle(
    'distant:preparerLectureMedia',
    async (_e, id: string): Promise<ResultatPreparationLectureMedia> => {
      const generation = contextesDistants.generationActuelle
      const execution = executerContexteCommun(async (contexte): Promise<ResultatPreparationLectureMedia> => {
        if (!(contexte instanceof ContexteGitLab)) {
          return { ok: false, raison: 'indisponible' }
        }
        const entretien = contexte.store.lireEntretien(id)
        if (!entretien.ok || !contexte.store.ouvrir().membership[id]) {
          return { ok: false, raison: 'fichier-absent' }
        }
        const chemin = entretien.data.meta.audioDistant?.chemin
        if (!chemin) return { ok: false, raison: 'fichier-absent' }
        try {
          verifierCheminMediaRelatif(chemin)
        } catch {
          return { ok: false, raison: 'chemin-invalide' }
        }
        if (!EXT_AUDIO.includes(extensionDe(chemin))) {
          return { ok: false, raison: 'format-non-pris-en-charge' }
        }
        const resolution = resoudreBaseMedia(coffre, contexte.id)
        if (!resolution.ok) return { ok: false, raison: resolution.motif }
        try {
          const cleBase = `${contexte.id}\u0000${resolution.base.urlBase}\u0000${resolution.base.utilisateur}`
          let capacite = capacitesPlagesMedia.get(cleBase)
          if (!capacite) {
            capacite = new CapacitePlagesBase()
            capacitesPlagesMedia.set(cleBase, capacite)
          }
          const plages = await capacite.mesurer(resolution.client, chemin)
          if (plages === 'non') return { ok: false, raison: 'plages-non-prises-en-charge' }
          if (plages === 'inconnue') return { ok: false, raison: 'indisponible' }
          const information = await informationMedia(resolution.client, chemin)
          return {
            ok: true,
            url: relaisMediaDistant.ouvrir({
              id,
              generation,
              chemin,
              client: resolution.client,
              information,
            }),
          }
        } catch (erreur) {
          if (erreur instanceof ErreurLectureMedia) {
            if (erreur.motif === 'fichier-absent') return { ok: false, raison: 'fichier-absent' }
            if (erreur.motif === 'droits') return { ok: false, raison: 'droits' }
          }
          return { ok: false, raison: 'indisponible' }
        }
      })
      if (!execution) return { ok: false, raison: 'indisponible' }
      const resultat = await execution
      return resultat.courant ? resultat.valeur : { ok: false, raison: 'indisponible' }
    },
  )

  /** Désignation audio : transaction courte pour un entretien fermé. */
  ipcMain.handle('distant:designerAudio', async (_e, id: string, cheminAudio: string) => {
    try {
      verifierCheminMediaRelatif(cheminAudio)
    } catch {
      return { ok: false as const, raison: 'chemin-invalide' }
    }
    const execution = executerContexteCommun(async (contexte) => {
      if (contexte instanceof ContexteGitLab) {
        const resolution = resoudreBaseMedia(coffre, contexte.id)
        if (!resolution.ok) return { ok: false as const, raison: resolution.motif }
        const media = await verifierMediaDesignable(resolution.client, cheminAudio)
        if (!media.ok) return { ok: false as const, raison: media.motif }
        return contexte.designerAudio(id, cheminAudio)
      }
      return contexte.designerAudio(id, cheminAudio)
    })
    if (!execution) return { ok: false as const, raison: 'corpus-local' }
    const resultat = await execution
    return resultat.courant
      ? resultat.valeur
      : { ok: false as const, raison: 'contexte-remplace' }
  })

  /** Téléversement en flux d'un média choisi localement. */
  ipcMain.handle(
    'distant:televerserAudio',
    async (_e, sourceLocale: string, cheminCible: string) => {
      if (!contextesDistants.actuel) return { ok: false as const, raison: 'corpus-local' }
      try {
        statSync(sourceLocale)
      } catch {
        return { ok: false as const, raison: 'lecture-impossible' }
      }
      const execution = executerContexteDistant((contexte, estContexteCourant) =>
        contexte.televerserFichier(
          cheminCible,
          sourceLocale,
          typeMimeAudio(cheminCible),
          (octets, total) => {
            if (!estContexteCourant()) return
            for (const w of BrowserWindow.getAllWindows()) {
              w.webContents.send('distant:progression', {
                sens: 'televersement',
                chemin: cheminCible,
                octets,
                total,
              } satisfies ProgressionTransfert)
            }
          },
        ))
      if (!execution) return { ok: false as const, raison: 'corpus-local' }
      try {
        const resultat = await execution
        return resultat.courant
          ? resultat.valeur
          : { ok: false as const, raison: 'contexte-remplace' }
      } catch (e) {
        if (e instanceof ErreurHttp) return { ok: false as const, raison: String(e.statut) }
        return { ok: false as const, raison: 'reseau' }
      }
    },
  )

  /** « Publier maintenant » : publication sous le droit du contexte capturé. */
  ipcMain.handle('distant:publierEntretien', async (_e, id: string) => {
    const contexte = contextesDistants.actuel
    const execution = contexte instanceof ContexteGitLab
      ? executerContexteCommun((courant) => courant.publierEntretien(id))
      : executerContexteDistant((courant) => courant.publierEntretien(id))
    if (!execution) return { ok: false as const, raison: 'aucune session' }
    const resultat = await execution
    return resultat.courant
      ? resultat.valeur
      : { ok: false as const, raison: 'contexte-remplace' }
  })

  /** Orphelins détectables après un crash. */
  ipcMain.handle('distant:orphelins', async (): Promise<OrphelinDistant[] | null> => {
    if (contextesDistants.actuel instanceof ContexteGitLab) return []
    const execution = executerContexteDistant((contexte) => contexte.listerOrphelins())
    if (!execution) return null
    const resultat = await execution
    return resultat.courant ? resultat.valeur : null
  })

  /** Choix « reprendre et publier » du dialogue de reprise crash. */
  ipcMain.handle('distant:reprendreOrphelin', async (_e, cheminVerrou: string) => {
    const execution = executerContexteDistant((contexte) =>
      contexte.reprendreOrphelin(cheminVerrou))
    if (!execution) return { ok: false as const, raison: 'aucun corpus distant' }
    const resultat = await execution
    return resultat.courant
      ? resultat.valeur
      : { ok: false as const, raison: 'contexte-remplace' }
  })

  /** Choix « abandonner » du dialogue de reprise crash. */
  ipcMain.handle('distant:abandonnerOrphelin', async (_e, cheminVerrou: string) => {
    const execution = executerContexteDistant((contexte) =>
      contexte.abandonnerOrphelin(cheminVerrou))
    if (execution) await execution
  })

  /* ── Présence ────────────────────────────────────────────────────────── */

  /** Le renderer signale l'entretien qu'il ouvre/ferme.
   *  La présence est publiée immédiatement, sans attendre le prochain battement. */
  ipcMain.handle('distant:noterEntretienOuvert', async (_e, id: string | null) => {
    const contexte = contextesDistants.actuel
    if (!estContexteNextcloud(contexte)) return
    const execution = executerContexteDistant((courant) =>
      courant.noterEntretienOuvert(id))
    if (execution) await execution
  })

  /* --- Copies de divergence (fusion assistée) --- */

  /** Les copies mises de côté par les rétrogradations (publication 412). */
  ipcMain.handle('distant:listerDivergences', () => {
    const contexte = contextesDistants.actuel
    return estContexteNextcloud(contexte) ? contexte.sessions.listerDivergences() : []
  })
  /** Contenu d'une copie (null = absente/corrompue/chemin invalide). */
  ipcMain.handle('distant:lireDivergence', (_e, chemin: string) => {
    const contexte = contextesDistants.actuel
    return estContexteNextcloud(contexte) ? contexte.sessions.lireDivergence(chemin) : null
  })
  /** Jette une copie — choix EXPLICITE du dialogue, jamais automatique. */
  ipcMain.handle('distant:supprimerDivergence', (_e, chemin: string) => {
    const contexte = contextesDistants.actuel
    if (estContexteNextcloud(contexte)) contexte.sessions.supprimerDivergence(chemin)
  })

  /** Migration SonalPi1 → SonalPi2, EXÉCUTION : crée le corpus SonalPi2 dans le dossier dédié,
   *  l'ajoute aux récents, et BASCULE le store dessus (même mécanique que changerDossier). */
  ipcMain.handle('migrer:executer', (_e, req: DemandeMigration) =>
    transitionner(() => transitionsLocales.migrer(req)),
  )

  // Protocole `sonal-media` : ressources locales et relais WebDAV opaque.
  // Le handler capture `store` (réaffecté par changerDossier) ;
  // support des requêtes Range (l'élément <audio> de Chromium en dépend pour le seek).
  //   sonal-media://waveform/<id>  → PNG dérivé local.
  //   sonal-media://abs/<encoded>  → média local présent dans la whitelist du corpus.
  //   sonal-media://distant/<jeton> → média WebDAV sans chemin ni secret dans l'URL.
  protocol.handle('sonal-media', (req) => {
    const url = new URL(req.url)
    const hote = url.hostname
    if (hote === 'distant') {
      const jeton = url.pathname.replace(/^\/+/, '')
      return relaisMediaDistant.servir(
        jeton,
        contextesDistants.generationActuelle,
        req.method,
        req.headers.get('range'),
        req.signal,
        (id, chemin) => {
          try {
            const contexte = contextesDistants.actuel
            if (!(contexte instanceof ContexteGitLab)) return false
            const entretien = contexte.store.lireEntretien(id)
            return Boolean(
              entretien.ok &&
              contexte.store.ouvrir().membership[id] &&
              entretien.data.meta.audioDistant?.chemin === chemin,
            )
          } catch {
            return false
          }
        },
      )
    }
    let fichier: string | null = null
    if (hote === 'waveform') {
      // L'id est opaque (genId) ; on retire le `/` initial du pathname.
      const id = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      fichier = store.cheminWaveform(id)
    } else if (hote === 'abs') {
      // Chemin absolu encodé : on retire le SEUL `/` initial ajouté par URL,
      // puis décode ; pour ne pas manger la barre initiale d'un chemin POSIX.
      const brut = url.pathname.replace(/^\//, '')
      fichier = store.cheminMediaAbs(decodeURIComponent(brut))
    }
    if (!fichier) return new Response('média introuvable', { status: 404 })
    const taille = statSync(fichier).size
    const entetes: Record<string, string> = {
      'Content-Type': MIME[extname(fichier).slice(1).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // le renderer (origine Vite en dev, file:// en prod) fetch() ce schéma.
      'Access-Control-Allow-Origin': '*',
    }
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (m) {
      const debut = Number(m[1])
      const fin = m[2] ? Math.min(Number(m[2]), taille - 1) : taille - 1
      entetes['Content-Range'] = `bytes ${debut}-${fin}/${taille}`
      entetes['Content-Length'] = String(fin - debut + 1)
      const flux = Readable.toWeb(createReadStream(fichier, { start: debut, end: fin }))
      return new Response(flux as unknown as BodyInit, { status: 206, headers: entetes })
    }
    entetes['Content-Length'] = String(taille)
    const flux = Readable.toWeb(createReadStream(fichier))
    return new Response(flux as unknown as BodyInit, { status: 200, headers: entetes })
  })
  ipcMain.handle(
    'corpus:poserValeur',
    async (_e, entretienId: string, cible: CibleValeur, idVar: string, idMod: string) => {
      const ok = store.poserValeur(entretienId, cible, idVar, idMod)
      const contexte = contextesDistants.actuel
      if (ok && estContexteNextcloud(contexte)) contexte.sessions.noterSale(entretienId)
      return ok
    },
  )
  // Lot « modifier en lot » : distant → transactions (verrou court par entretien,
  // échecs nommés) ; local → boucle directe du store. Mêmes résultats dans les deux modes.
  ipcMain.handle('corpus:poserValeurLot', (_e, items: ItemLotValeur[]) => {
    exigerGeste(fournisseurCourant(), 'valeurs.lot')
    return executerSelonFournisseur(
      (contexte) => contexte.transactions.poserValeurLot(items),
      (contexte) => contexte.poserValeurLot(items),
    ) ?? poserValeurLotLocal(store, items)
  })

  // Dialogs fichier : le parsing d'import se fait côté renderer (DOMParser) ;
  // le main ne fait que LIRE/ÉCRIRE le fichier choisi. En e2e, les dialogs sont stubbés,
  // via electronApp.evaluate, pour piloter sans dialog.
  // `defaultPath` optionnel : en session démo, le dialogue s'ouvre dans le dossier des sources ;
  //  l'utilisateur y retrouve les fichiers.
  // Modale « Ajouter un entretien » (à la SonalPi1, ajout-entretien.html) :
  //  DEUX zones — celle-ci choisit le fichier d'ENTRETIEN (contenu lu ici,
  //  parsé côté renderer) ; la zone son passe par dialog:choisirAudio.
  //  Le main ne touche l'audio qu'à corpus:assignerAudio, qui le RÉFÉRENCE,
  //  sans jamais le lire en mémoire.
  ipcMain.handle('dialog:choisirTexte', async (e, defaultPath?: string) => {
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Entretien', extensions: EXT_TEXTE }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
  })
  // « Assigner un srt… » (vue Corpus) : le dialogue n'accepte QUE des transcriptions chronométrées (SRT/VTT) ;
  //  l'entretien recevra texte + ancres.
  ipcMain.handle('dialog:choisirSrt', async (e, defaultPath?: string) => {
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Sous-titres (SRT / VTT)', extensions: ['srt', 'vtt'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
  })
  // Zones « fichier son » de la modale + « Assigner un audio… » :
  // en réalité, le filtre couvre AUDIO + VIDÉO (les deux sont assignables).
  ipcMain.handle('dialog:choisirAudio', async (e, defaultPath?: string) => {
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Média (audio / vidéo)', extensions: EXT_MEDIA }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  // Largeur du panneau vidéo, mémorisée PAR CORPUS (clé = chemin du dossier).
  ipcMain.handle('media:lireLargeurVideo', (_e, dir: string) => {
    const s = lireSettings()
    const w = s.largeurVideo?.[dir]
    return typeof w === 'number' && Number.isFinite(w) ? w : null
  })
  ipcMain.handle('media:ecrireLargeurVideo', (_e, dir: string, largeur: number) => {
    const s = lireSettings()
    s.largeurVideo = { ...(s.largeurVideo ?? {}), [dir]: largeur }
    ecrireSettings(s)
  })
  // Dernier signataire des commentaires (settings.json, niveau profil).
  ipcMain.handle('profil:lireSignataire', () => lireSettings().signataire ?? '')
  ipcMain.handle('profil:memoriserSignataire', (_e, nom: string) => {
    const s = lireSettings()
    s.signataire = typeof nom === 'string' ? nom.trim() : ''
    ecrireSettings(s)
  })
  // Picker de dossier PUR (aucun effet de bord sur le store), utilisé par la modale démo.
  // `kind` (sources | corpus) hinte le défaut ; soit `Documents/Sonal/démo/<kind>`, modifiable ;
  //  le retour est le chemin choisi ; le corpus est ensuite OUVERT via corpus:ouvrirDossier.
  ipcMain.handle('dialog:choisirDossier', async (_e, kind?: 'sources' | 'corpus') => {
    const defaultPath =
      kind === undefined
        ? undefined
        : kind === 'sources'
          ? join(app.getPath('documents'), 'Sonal', 'démo', 'sources')
          : join(app.getPath('documents'), 'Sonal', 'démo')
    const r = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  ipcMain.handle('dialog:choisirExport', async (e, nomSuggere: string, contenu: string) => {
    const r = await montrerSauver(e, { defaultPath: nomSuggere })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, contenu, 'utf8')
    return r.filePath
  })
  // Exports d'entretien en DOCX/PDF : GENERATION (buffer construit côté main,
  // lib `docx` / printToPDF), puis CHOIX DE DESTINATION, puis ECRITURE
  // ATOMIQUE — trois primitives séparées, réutilisables par un futur export
  // corpus qui choisirait la destination une fois pour un lot.
  ipcMain.handle('export:entretienDocx', async (e, demande: DemandeExportDocx): Promise<string | null> => {
    const buffer = await construireDocxBuffer(demande)
    const chemin = await choisirDestination(e, {
      defaultPath: demande.nomSuggere,
      filters: [{ name: 'Document Word', extensions: ['docx'] }],
    })
    if (!chemin) return null
    ecrireFichierAtomique(chemin, buffer)
    return chemin
  })
  // URL audio locale pour l'export HTML : le chemin est vérifié par le main
  // (whitelist des audioRef du corpus + existence disque) ; null sinon.
  ipcMain.handle('export:audioLocal', (_e, audioRef: string): string | null =>
    urlAudioLocal(store, audioRef),
  )
  // Instantané d'un entretien NON ouvert, assemblé par le main depuis les
  // fichiers natifs (export de lot) ; échec typé, jamais une exception.
  ipcMain.handle('export:instantaneCorpus', (_e, id: string) =>
    assemblerInstantaneDistant(store, id),
  )
  // Session d'écriture d'un lot de corpus : dossier choisi UNE fois, puis
  // écritures atomiques limitées à ce dossier (noms re-sécurisés au main).
  ipcMain.handle('export:corpusChoisirDossier', (e, nomSuggere: string) =>
    choisirDossierCorpus(e, nomSuggere),
  )
  ipcMain.handle('export:corpusLister', (e) => listerDossierCorpus(e))
  ipcMain.handle('export:corpusEcrireTexte', (e, nom: string, contenu: string) =>
    ecrireTexteCorpus(e, nom, contenu),
  )
  ipcMain.handle('export:corpusEcrireDocx', (e, demande: DemandeExportDocxCorpus, nom: string) =>
    ecrireDocxCorpus(e, demande, nom),
  )
  ipcMain.handle('export:corpusEcrirePdf', (e, nom: string, html: string) =>
    ecrirePdfCorpus(e, nom, html),
  )
  ipcMain.handle('export:corpusCopierMedia', (e, urlAudio: string) =>
    copierMediaCorpus(e, urlAudio),
  )
  ipcMain.handle('export:corpusEcrireQualcoder', (e, modele: QualcoderExportModel) =>
    ecrireQualcoderCorpus(e, modele),
  )
  ipcMain.handle('export:corpusFermer', (e) => fermerExportCorpus(e))
  ipcMain.handle('export:entretienPdf', async (e, demande: DemandeExportPdf): Promise<string | null> => {
    const buffer = await imprimerPdf(demande.html)
    const chemin = await choisirDestination(e, {
      defaultPath: demande.nomSuggere,
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
    })
    if (!chemin) return null
    ecrireFichierAtomique(chemin, buffer)
    return chemin
  })
  // Import d'un MODÈLE de modalités (« Importer un modèle… » dans l'éditeur de variables) :
  //  le dialogue n'accepte qu'un JSON, lu ici (même gabarit que dialog:choisirTexte) ;
  //  la validation du contenu se fait côté renderer.
  ipcMain.handle('dialog:choisirJson', async (e, defaultPath?: string) => {
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Modèle de modalités (JSON)', extensions: ['json'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
  })
  // Registre « Mes modèles » (niveau profil, settings.json). La liste ne se construit qu'à la lecture ;
  //  le dédoublonnage par nom (insensible à la casse) vit à l'ajout ; un ré-import met simplement le modèle à jour.
  ipcMain.handle('modeles:lire', (): ModeleEAV[] => lireSettings().modelesUtilisateur ?? [])
  ipcMain.handle('modeles:ajouter', (_e, modele: ModeleEAV): ModeleEAV[] => {
    const s = lireSettings()
    const liste = [...(s.modelesUtilisateur ?? [])]
    const cle = (nom: string) => nom.trim().toLowerCase()
    const i = liste.findIndex((m) => cle(m.nom) === cle(modele.nom))
    if (i >= 0) liste[i] = modele
    else liste.push(modele)
    s.modelesUtilisateur = liste
    ecrireSettings(s)
    return liste
  })

  return async () => {
    clearInterval(minuteurSessionsGitLab)
    powerMonitor.removeListener('suspend', surSuspensionSysteme)
    powerMonitor.removeListener('resume', surReveilSysteme)
    const contexte = contextesDistants.actuel
    if (estContexteNextcloud(contexte)) contexte.arreterPresence()
    relaisMediaDistant.invaliderTout()
    await contexte?.fermer()
  }
}

// --- Démo « Mini Corpus Test » : lecture des sources bundled ---
// Les sources (SRT + audio) de CorpusTest/ NE sont PAS un corpus Sonal (pas de corpus.json,
// pas d'entretiens/) : elles sont l'AMONT du builder de démo. Il les importe via le vrai pipeline (sas d'import + assignerAudio), dans un dossier choisi ;
// le builder tourne côté renderer (l'importeur SRT y vit, avec DOMParser), et le main ne fait que LIRE ces fichiers.
function cheminCorpusTest(): string {
  // Dev : CorpusTest/ à la racine du projet (app.getAppPath() = cwd au lancement).
  // Prod : copié en ressources par electron-builder (extraResources, hors asar).
  return app.isPackaged
    ? join(process.resourcesPath, 'CorpusTest')
    : join(app.getAppPath(), 'CorpusTest')
}

/** Ressources « Documents exemples » des Docs cadre (même principe que CorpusTest).
 *  Dev : ressources/ à la racine du projet ; prod : copié en ressources empaquetées. */
function cheminExemplesDocsCadre(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'docsCadreExemples')
    : join(app.getAppPath(), 'ressources', 'docsCadreExemples')
}

/** Clefs des sources bundled (une par entretien de démo) ;
 *  une clef EST le nom de fichier source, sans extension ;
 *  la complétude sert à la copie comme à la présence. */
const CLEFS_SOURCES = ['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants']

/** Présence RÉELLE des sources de démo : les 8 fichiers (4 SRT + 4 MP3)
 *  ainsi que le guide d'entretien du parcours de préparation doivent exister. */
function sourcesCompletes(racine: string): boolean {
  return (
    CLEFS_SOURCES.every((k) => existsSync(join(racine, 'srt', `${k}.srt`))) &&
    CLEFS_SOURCES.every((k) => existsSync(join(racine, 'audio', `${k}.mp3`))) &&
    existsSync(join(racine, 'docs', 'Guide-entretien-demo.txt'))
  )
}

/** Présence d'un corpus de TEST d'un MODE donné : `corpus.json` doit exister,
 *  et porter le marqueur `demo` du mode attendu. Un squelette amorcé vide
 *  (dossier « juste regardé ») n'est pas un corpus de démo ; il ne compte pas.
 *  Un `corpus.json` illisible n'est pas compté présent (prudence). */
function corpusTestPresent(dir: string, mode: ModeDemo): boolean {
  const chemin = join(dir, 'corpus.json')
  if (!existsSync(chemin)) return false
  try {
    return (JSON.parse(readFileSync(chemin, 'utf8')) as { demo?: MarqueurDemo })?.demo?.mode === mode
  } catch {
    return false
  }
}

function enregistrerIpcDemo(): void {

  /** Copie les sources bundled `CorpusTest/` (`srt/` + `audio/`, ~13 Mo),
   *  dans le dossier choisi : c'est LA seule copie du flow de démo.
   *  Idempotent : si les 4 sources sont déjà là, on ne recopie pas ;
   *  un fichier manquant entraîne une recopie fichier-à-fichier,
   *  les autres étant conservés.
   *  Le corpus de travail référence ensuite ces fichiers, zéro copie. */
  ipcMain.handle('demo:copierSources', (_e, racine: string) => {
    if (sourcesCompletes(racine)) return
    cpSync(cheminCorpusTest(), racine, { recursive: true })
  })
  /** Lit un fichier texte des sources (ex. `srt/1Coordinatrice.srt`) → { nom, contenu }.
   *  Racine paramétrable (les sources sont matérialisées, plus bundled). */
  ipcMain.handle('demo:lireSource', (_e, racine: string, rel: string) => {
    const abs = join(racine, rel)
    return { nom: basename(abs), contenu: readFileSync(abs, 'utf8') }
  })
  /** Chemin ABSOLU d'un média des sources (ex. `audio/E2.mp3`) ;
   *  passé tel quel à `corpus:assignerAudio`, qui le RÉFÉRENCE (plus de copie). */
  ipcMain.handle('demo:cheminAudio', (_e, racine: string, rel: string) => join(racine, rel))

  /** Mémoire démo persistée dans `settings.json` (niveau profil).
   *  Lit les dossiers mémorisés et leur présence réelle sur disque, par contenu :
   *  sources = les 9 fichiers ; corpus de test = marqueur `demo` du mode attendu.
   *  `null` = jamais préparé (ou enregistrement corrompu).
   *  La modale adapte ses questions : une réponse déjà en place est sautée. */
  ipcMain.handle('demo:etat', (): EtatDemoComplet | null => {
    const d = lireSettings().demo
    if (!d) return null
    return {
      racineSources: d.racineSources,
      corpusPasAPas: d.corpusPasAPas,
      corpusAutonomie: d.corpusAutonomie,
      sourcesExist: sourcesCompletes(d.racineSources),
      corpusPasAPasExist: !!d.corpusPasAPas && corpusTestPresent(d.corpusPasAPas, 'pas-a-pas'),
      corpusAutonomieExist: !!d.corpusAutonomie && corpusTestPresent(d.corpusAutonomie, 'autonomie'),
    }
  })
  /** Écrit la mémoire démo en PRÉSERVANT les récents.
   *  Appelé par le builder à chaque préparation réussie :
   *  les sources sont partagées, chaque mode a son propre dossier de corpus,
   *  et l'autre mode, s'il existe, est préservé. */
  ipcMain.handle('demo:memoriser', (_e, demo: EtatDemo) => {
    const s = lireSettings()
    s.demo = demo
    ecrireSettings(s)
  })
  /** Garde de la modale ; on n'écrase jamais un travail.
   *  Refuse un corpus marqué démo, un corpus non marqué mais non vide,
   *  ou un corpus.json illisible (prudence).
   *  Laisse passer le squelette amorcé vide.
   *  Ce n'est pas un travail utilisateur ;
   *  le bloquer interdirait de reconstruire un corpus,
   *  dans un dossier qu'une simple ouverture a amorcé. */
  ipcMain.handle('demo:verifierCorpus', (_e, dir: string): VerificationDossierDemo => {
    const chemin = join(dir, 'corpus.json')
    if (!existsSync(chemin)) return { ok: true }
    try {
      const c = JSON.parse(readFileSync(chemin, 'utf8')) as Partial<CorpusFichier>
      if (c.demo) return { ok: false, raison: 'demo' }
      if (c.membership && Object.keys(c.membership).length > 0) {
        return { ok: false, raison: 'dejaCorpus' }
      }
      return { ok: true }
    } catch {
      return { ok: false, raison: 'illisible' }
    }
  })
}

// --- Migration SonalPi1 → SonalPi2 : lecture et aperçu d'un `.crp` ---
// Choix d'un `.crp` : dialogue natif (filtre crp), lecture + détection d'encodage (chardet + iconv-lite, comme SonalPi1 — `src/main/encodage.ts`) ;
// puis analyse PUR côté `shared/corpus/migrationCrp.ts`. À ce stade, le main ne fait que LIRE ;
// l'aperçu est affiché avant toute écriture.
function enregistrerIpcMigration(): void {
  ipcMain.handle('migrer:choisirCrp', async (e) => {
    const r = await montrerOuvrir(e, {
      properties: ['openFile'],
      filters: [{ name: 'Corpus SonalPi1', extensions: ['crp'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const chemin = r.filePaths[0]
    const contenu = decoderCrp(readFileSync(chemin))
    return { chemin, analyse: analyserCrp(contenu, basename(chemin)) }
  })
  /** Choix du dossier DÉDIÉ à la migration (openDirectory + createDirectory),
   *  PRÉ-REMPLI `Documents/Sonal/<nom>` — le nom du corpus, modifiable. */
  ipcMain.handle('migrer:choisirDossier', async (e, nom: string) => {
    const defaultPath = join(app.getPath('documents'), 'Sonal', nom)
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  /** Garde du dossier dédié (« on n'écrase jamais »). */
  ipcMain.handle('migrer:verifierDossier', (_e, dir: string): VerificationDossierMigration => {
    const chemin = join(dir, 'corpus.json')
    if (existsSync(chemin)) {
      let demo = false
      try {
        demo = !!JSON.parse(readFileSync(chemin, 'utf8'))?.demo
      } catch {
        /* corpus illisible → refus dejaCorpus quand même */
      }
      return { ok: false, raison: demo ? 'demo' : 'dejaCorpus' }
    }
    let nonVide = false
    try {
      nonVide = existsSync(dir) && readdirSync(dir).length > 0
    } catch {
      nonVide = false
    }
    return { ok: true, nonVide }
  })
  /** Lit le `.Sonal` d'un entretien SonalPi1. `null` = absent/manquant. */
  ipcMain.handle('migrer:lireSonal', (_e, cheminCrp: string, rtrPath: string | null) => {
    if (!rtrPath) return null
    const abs = join(dirname(cheminCrp), rtrPath)
    if (!existsSync(abs)) return null
    return { nom: basename(abs), contenu: decoderCrp(readFileSync(abs)) }
  })
}

let nettoyerAvantQuit: (() => Promise<void>) | null = null
let fermetureAutorisee = false
let fermetureEnCours = false

app.whenReady().then(() => {
  nettoyerAvantQuit = enregistrerIpcCorpus()
  enregistrerIpcDemo()
  enregistrerIpcMigration()
  majMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (evenement) => {
  if (fermetureAutorisee) return
  evenement.preventDefault()
  if (fermetureEnCours) return
  fermetureEnCours = true
  void executerFermetureApplication({
    viderRenderers: viderRenderersAvantFermeture,
    nettoyerDistant: nettoyerAvantQuit,
    quitter: () => {
      fermetureAutorisee = true
      app.quit()
    },
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
