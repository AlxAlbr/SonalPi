import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import type {
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import { join, basename, extname, dirname } from 'node:path'
import { readFileSync, writeFileSync, createReadStream, statSync, cpSync, existsSync, readdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import {
  CorpusStore,
  completerIdsLocuteurs,
  normaliserCheminAudio,
  type PreparationOuvertureCorpus,
} from './corpusStore'
import { creerTransitionsLocales, oublierCompte } from './transitionContexte'
import { executerFermetureApplication } from './fermetureApplication'
import { preferencesRenderer, securiserNavigation } from './securiteFenetre'
import { ClientWebDAV, ErreurHttp } from './webdav/client'
import { profilerServeur, sonderFilesLock } from './webdav/sondes'
import { MiroirWebDAV } from './distant/miroir'
import { coffreReel, type ConfigCorpusDistant } from './distant/coffre'
import { SessionsDEntretien } from './distant/sessions'
import { TransactionsCorpus, poserValeurLotLocal, appliquerRegleLotLocal } from './distant/transactions'
import { PresenceDistante } from './distant/presence'
import { decoderCrp } from './encodage'
import { analyserCrp } from '../shared/corpus/migrationCrp'
import type { DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
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
  ModeleEAV,
  OuvertureCorpus,
  OuvertureEntretienEdition,
  PatchCategorie,
  PayloadEntretien,
  TranscriptionEntretien,
  RegleAnon,
  Variable,
  VerificationDossierDemo,
  ParamsAnon,
} from '../shared/format'
import type {
  DemandeConnexion,
  DemandeCreationDistante,
  OrphelinDistant,
  OuvertureDistante,
  ProgressionTransfert,
  ResultatConnexion,
  ResultatFermetureSession,
  ResultatTiragePublic,
  CompteDistantPublic,
} from '../shared/distant'
import { PublieurCorpus, ErreurDejaCorpus } from './distant/publication'
import { EXT_MEDIA } from '../shared/media'

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
  /** Ids de comptes distants ouverts récemment. Séparés des locaux,
   *  la réouverture d'un récent distant passe par `distant:ouvrir(id)`, jamais
   *  par le chemin miroir (le cycle verrou/publie serait contourné). */
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
}
/** Retire un RACCOURCI de la liste des récents ;
 *  le dossier de corpus reste sur disque, jamais touché (l'app n'efface aucun corpus). */
function retirerRecent(dir: string): void {
  const s = lireSettings()
  s.recents = s.recents.filter((d) => d !== dir)
  ecrireSettings(s)
}
/** Mémorise l'ouverture d'un corpus distant dans les récents (id de compte). */
function ajouterRecentDistant(id: string): void {
  const s = lireSettings()
  s.recentsDistant = [id, ...(s.recentsDistant ?? []).filter((d) => d !== id)].slice(0, 8)
  ecrireSettings(s)
}

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
  let miroirActif: { id: string; miroir: MiroirWebDAV } | null = null
  // Sessions d'écriture du corpus distant actif : verrous, battements,
  // publications.
  // Null tant qu'aucun corpus distant n'est ouvert.
  let sessions: SessionsDEntretien | null = null
  // Transactions de définitions : verrou corpus, GET frais, mutation,
  // PUT If-Match. Null en corpus local (mutation directe).
  let transactions: TransactionsCorpus | null = null
  // Présence : « ce poste consulte tel entretien » — informatif,
  // JAMAIS décisionnel. Null en corpus local.
  let presence: PresenceDistante | null = null
  // Variante de verrou du corpus distant actif : true = files_lock natif,
  // false/absent = PUT conditionnel. La mesure a lieu à chaque ouverture,
  // car un admin peut installer le plugin entre deux sessions.
  let verrouNatif = false
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
    if (sessions) {
      const ids = sessions.idsTenus()
      for (const id of ids) store.revoquerEcritureEntretien(id)
      const bilan = await sessions.fermerToutes()
      if (bilan.bloquees.length > 0) {
        for (const blocage of bilan.bloquees) {
          if (sessions.etat(blocage.id).etat === 'a-nous') {
            store.autoriserEcritureEntretien(blocage.id)
          }
        }
        const detail = bilan.bloquees
          .map((b) => `${b.id} (${b.raison})`)
          .join(', ')
        throw new Error(`Changement de corpus refusé : sessions non fermées : ${detail}.`)
      }
      sessions.dispose()
    }
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

  /** Installe un store local après la fermeture réussie de l'ancien contexte. */
  function finaliserBasculeLocale(
    nouveauStore: CorpusStore,
    dir: string,
    preparation: PreparationOuvertureCorpus,
  ): OuvertureCorpus {
    const corpus = nouveauStore.finaliserOuverture(preparation)
    presence?.arreter()
    store = nouveauStore
    sessions = null
    transactions = null
    presence = null
    verrouNatif = false
    miroirActif = null
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
      distant: miroirActif?.id ?? null,
    }
  })
  ipcMain.handle('corpus:recents', (): EntreeRecent[] => {
    const s = lireSettings()
    // Ne garder que les corpus dont le DOSSIER existe encore et contient toujours un corpus.json ;
    // un corpus supprimé à la main (dossier effacé ou vidé de son corpus.json) ne doit plus apparaître dans « Récents » ;
    // au démarrage, le 1ᵉʳ récent ne doit pas être ré-amorcé en silence. Écriture de retour pour nettoyer settings.json des entrées mortes (demo préservé).
    const vivants = s.recents.filter((dir) => existsSync(join(dir, 'corpus.json')))
    if (vivants.length !== s.recents.length) {
      s.recents = vivants
      ecrireSettings(s)
    }
    // Récents distants : fraîcheur = le compte existe toujours au coffre (équivalent du existsSync local).
    // Le nom vient du miroir (`corpus.json`) si présent, sinon du dernier segment de l'URL.
    // Le chemin miroir n'est JAMAIS exposé comme dossier local.
    const comptes = new Map(coffre.lister().map((c) => [c.id, c]))
    const distants = (s.recentsDistant ?? []).filter((id) => comptes.has(id))
    if (distants.length !== (s.recentsDistant ?? []).length) {
      s.recentsDistant = distants
      ecrireSettings(s)
    }
    return [
      ...distants.map((id): EntreeRecent => {
        const c = comptes.get(id)!
        let nom = basename(c.urlServeur)
        try {
          const miroirCorpus = JSON.parse(
            readFileSync(join(app.getPath('userData'), 'miroirs', id, 'corpus.json'), 'utf8'),
          ) as { nom?: string }
          if (miroirCorpus.nom) nom = miroirCorpus.nom
        } catch {
          /* pas encore de miroir (corpus créé mais jamais rouvert depuis ici) → URL */
        }
        return { type: 'distant', id, nom, url: c.urlServeur }
      }),
      ...vivants.map((dir): EntreeRecent => ({ type: 'local', dir, nom: basename(dir) })),
    ]
  })
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

  /** Exécute une mutation de DÉFINITIONS : transaction complète en corpus distant (verrou corpus, GET frais, mutation, PUT If-Match),
   *  ou écriture directe du store en local ; les refus (`ErreurTransaction`) remontent à la bannière renderer via l'exception IPC. */
  function executerDefinitions<T>(fn: (cible: CorpusStore) => T): Promise<T> | T {
    const cible = store
    const couche = transactions
    return couche ? couche.executer(() => fn(cible)) : fn(cible)
  }

  /** Lecture pure du miroir issu du dernier tirage en corpus distant.
   *  Elle ne contacte pas le serveur et n'ouvre aucune session d'écriture. */
  ipcMain.handle('corpus:lireEntretien', (_e, id: string) => store.lireEntretien(id))

  /** Ouverture réservée à l'éditeur, avec statut d'accès obligatoire. */
  ipcMain.handle(
    'corpus:ouvrirEntretienPourEdition',
    async (_e, id: string): Promise<OuvertureEntretienEdition> => {
      if (!sessions) {
        const lecture = store.ouvrirEntretienPourEdition(id)
        return lecture.ok ? { ...lecture, acces: 'edition' } : lecture
      }
      const gestionnaire = sessions
      const magasin = store
      const etat = await gestionnaire.ouvrir(id)
      if (etat.etat !== 'a-nous') {
        const lecture = magasin.lireEntretien(id)
        if (!lecture.ok) return lecture
        return {
          ...lecture,
          acces: 'lecture-seule',
          verrouTenuParAutrui:
            etat.etat === 'tenu-par-autrui' && etat.tenuPar
              ? {
                  userId: etat.tenuPar.userId,
                  machineId: etat.tenuPar.machineId,
                  acquiredAt: etat.tenuPar.acquiredAt,
                }
              : null,
        }
      }
      try {
        magasin.autoriserEcritureEntretien(id)
        const lecture = magasin.ouvrirEntretienPourEdition(id)
        if (!lecture.ok) {
          magasin.revoquerEcritureEntretien(id)
          await gestionnaire.fermer(id)
          return lecture
        }
        return { ...lecture, acces: 'edition' }
      } catch (e) {
        magasin.revoquerEcritureEntretien(id)
        await gestionnaire.fermer(id)
        throw e
      }
    },
  )

  /** Fermeture : publication finale puis libération. */
  ipcMain.handle(
    'corpus:fermerEntretien',
    async (_e, id: string): Promise<ResultatFermetureSession> => {
      const gestionnaire = sessions
      const magasin = store
      if (!gestionnaire) {
        magasin.revoquerEcritureEntretien(id)
        return { fermee: true }
      }
      magasin.revoquerEcritureEntretien(id)
      const resultat = await gestionnaire.fermer(id)
      if (!resultat.fermee && gestionnaire.etat(id).etat === 'a-nous') {
        magasin.autoriserEcritureEntretien(id)
      }
      return resultat
    },
  )

  /** État de session (poll UI) : publication en attente ? */
  ipcMain.handle('distant:etatSession', (_e, id: string) => {
    if (!sessions) return { etat: 'aucune' as const }
    return sessions.etat(id)
  })
  ipcMain.handle('corpus:ecrireEntretien', async (_e, id: string, p: PayloadEntretien) => {
    const now = store.ecrireEntretien(id, p)
    sessions?.noterSale(id) // publication périodique / finale s'en occuperont
    return now
  })
  ipcMain.handle('corpus:creerEntretienVide', (_e, titre: string) =>
    transactions ? transactions.creerEntretienVide(titre) : store.creerEntretienVide(titre),
  )
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    executerDefinitions((cible) => cible.renommerEntretien(id, titre)),
  )
  /** Suppression : DOUBLE VERROU distant (corpus PUIS entretien, ordre canonique ;
   *  publication corpus d'abord, MOVE serveur ensuite), ou directe en local.
   *  Défense en profondeur : si NOUS tenions encore la session de cet entretien,
   *  il faut la fermer d'abord (publication puis libération, ordre invariant) ;
   *  sinon, ce serait notre propre verrou qui bloquerait la suppression. */
  ipcMain.handle('corpus:supprimerEntretien', async (_e, id: string) => {
    const couche = transactions
    const gestionnaire = sessions
    const magasin = store
    if (!couche) return magasin.supprimerEntretien(id)
    if (gestionnaire) {
      magasin.revoquerEcritureEntretien(id)
      const fermeture = await gestionnaire.fermer(id)
      if (!fermeture.fermee) {
        if (gestionnaire.etat(id).etat === 'a-nous') magasin.autoriserEcritureEntretien(id)
        throw new Error(`Suppression impossible : session non fermée (${fermeture.raison}).`)
      }
    }
    return couche.supprimerEntretien(id)
  })
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[], reglesAnon: RegleAnon[]) =>
      transactions
        ? transactions.importerEntretien(titre, payload, codebook, variables, reglesAnon)
        : store.importerEntretien(titre, payload, codebook, variables, reglesAnon),
  )

  // Codebook (thèmes) — définitions : sous transaction en distant.
  ipcMain.handle('corpus:ajouterCategorie', (_e, nom: string, parent: string | null) =>
    executerDefinitions((cible) => cible.ajouterCategorie(nom, parent)),
  )
  ipcMain.handle('corpus:modifierCategorie', (_e, id: string, patch: PatchCategorie) =>
    executerDefinitions((cible) => cible.modifierCategorie(id, patch)),
  )
  ipcMain.handle('corpus:deplacerCategorie', (_e, id: string, sens: -1 | 1) =>
    executerDefinitions((cible) => cible.deplacerCategorie(id, sens)),
  )
  ipcMain.handle('corpus:migrerCategorie', (_e, id: string, nouveauParent: string | null) =>
    executerDefinitions((cible) => cible.migrerCategorie(id, nouveauParent)),
  )
  ipcMain.handle('corpus:supprimerCategorie', (_e, id: string, exceptId?: string) =>
    executerDefinitions((cible) => cible.supprimerCategorie(id, exceptId)),
  )
  ipcMain.handle('corpus:usagesParCategorie', () => store.usagesParCategorie())

  // Catégories de note (définitions corpus) : lecture simple, mutations sous transaction, comme les autres définitions.
  ipcMain.handle('corpus:categoriesNote', () => store.categoriesNote())
  ipcMain.handle('corpus:ajouterCategorieNote', (_e, nom: string, couleur: string) =>
    executerDefinitions((cible) => cible.ajouterCategorieNote(nom, couleur)),
  )
  ipcMain.handle('corpus:renommerCategorieNote', (_e, id: string, nom: string) =>
    executerDefinitions((cible) => cible.renommerCategorieNote(id, nom)),
  )
  ipcMain.handle('corpus:majCouleurCategorieNote', (_e, id: string, couleur: string) =>
    executerDefinitions((cible) => cible.majCouleurCategorieNote(id, couleur)),
  )
  ipcMain.handle('corpus:supprimerCategorieNote', (_e, id: string) =>
    executerDefinitions((cible) => cible.supprimerCategorieNote(id)),
  )
  ipcMain.handle('corpus:compterUsagesCategorieNote', (_e, id: string) =>
    store.compterUsagesCategorieNote(id),
  )
  ipcMain.handle('corpus:resumesThematiques', () => store.resumesThematiques())
  ipcMain.handle('corpus:reglesAnon', () => store.reglesAnon())
  ipcMain.handle('corpus:scanAnon', () => store.scanAnon())
  ipcMain.handle('corpus:personnesInventaire', () => store.personnesInventaire())
  ipcMain.handle('corpus:personnesCommander', async (
    _e,
    commande: import('../shared/corpus/personnes').CommandePersonnes,
    depuisRepertoire = false,
  ) => {
    if (!transactions) {
      if (store.lectureSeule) throw new Error('Le corpus distant est hors ligne. La correction n’a pas été enregistrée.')
      return store.personnesCommander(commande, depuisRepertoire)
    }
    if (commande.type === 'creerDefinition' || commande.type === 'modifier') {
      return transactions.executer(() => store.personnesCommander(commande, false))
    }
    if (commande.type === 'lier' || commande.type === 'annulerRefus') {
      return transactions.executerEntretien(
        commande.entretienId,
        () => store.personnesCommander(commande, false),
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
    throw new Error('Cette correction de personnes n’est pas encore disponible dans les corpus distants.')
  })
  ipcMain.handle('corpus:journalLister', () => store.journalCorpusLister())
  ipcMain.handle('corpus:journalAnnuler', (_e, id: string) => {
    if (transactions || store.lectureSeule) {
      return { ok: false, raison: 'L’annulation des actions du corpus distant n’est pas encore disponible.', temporaire: false }
    }
    return store.journalCorpusAnnuler(id)
  })
  ipcMain.handle('corpus:regleAnonParEntite', (_e, entite: string) => store.regleAnonParEntite(entite))
  ipcMain.handle('corpus:regleAnonCreer', (_e, entite: string, pseudos: string[]) =>
    executerDefinitions((cible) => cible.regleAnonCreer(entite, pseudos)),
  )
  ipcMain.handle('corpus:regleAnonAjouterPseudo', (_e, id: string, pseudo: string) =>
    executerDefinitions((cible) => cible.regleAnonAjouterPseudo(id, pseudo)),
  )
  ipcMain.handle('corpus:regleAnonUtiliseeAilleurs', (_e, id: string, exceptId?: string) =>
    store.regleAnonUtiliseeAilleurs(id, exceptId),
  )
  ipcMain.handle('corpus:regleAnonSupprimer', (_e, id: string) =>
    executerDefinitions((cible) => cible.regleAnonSupprimer(id)),
  )
  // Paramètres de pseudonymisation (étape 4) : lecture directe, écriture sous transaction de définitions (corpus.json est un fichier partagé).
  ipcMain.handle('corpus:paramsAnonLire', () => store.lireParamsAnon())
  ipcMain.handle('corpus:paramsAnonEcrire', (_e, params: ParamsAnon) =>
    executerDefinitions((cible) => cible.ecrireParamsAnon(params)),
  )
  // Thématique d'une règle (4c) : mutation de corpus.json sous transaction.
  ipcMain.handle('corpus:regleAnonCategoriser', (_e, id: string, categorie: string | null) =>
    executerDefinitions((cible) => cible.regleAnonCategoriser(id, categorie)),
  )
  ipcMain.handle('corpus:appliquerRegleAnonLot', (_e, cibles: CibleRegleAnon[]) =>
    transactions ? transactions.appliquerRegleLot(cibles) : appliquerRegleLotLocal(store, cibles),
  )
  ipcMain.handle('corpus:compterUsagesCategorie', (_e, code: string, exceptId?: string) =>
    store.compterUsagesCategorie(code, exceptId),
  )

  // Variables & modalités (EAV) — définitions : sous transaction distant.
  ipcMain.handle('corpus:ajouterVariable', (_e, lib: string, portee: 'entretien' | 'locuteur') =>
    executerDefinitions((cible) => cible.ajouterVariable(lib, portee)),
  )
  ipcMain.handle('corpus:modifierVariable', (_e, id: string, patch: Partial<Variable>) =>
    executerDefinitions((cible) => cible.modifierVariable(id, patch)),
  )
  ipcMain.handle('corpus:supprimerVariable', (_e, id: string) =>
    executerDefinitions((cible) => cible.supprimerVariable(id)),
  )
  ipcMain.handle('corpus:ajouterModalite', (_e, idVar: string, lib: string) =>
    executerDefinitions((cible) => cible.ajouterModalite(idVar, lib)),
  )
  ipcMain.handle('corpus:modifierModalite', (_e, idVar: string, idMod: string, lib: string) =>
    executerDefinitions((cible) => cible.modifierModalite(idVar, idMod, lib)),
  )
  ipcMain.handle('corpus:supprimerModalite', (_e, idVar: string, idMod: string) =>
    executerDefinitions((cible) => cible.supprimerModalite(idVar, idMod)),
  )
  ipcMain.handle('corpus:matrice', () => store.matriceCorpus())

  // Audio : une session d'éditeur existante est réutilisée. Sur un entretien
  // fermé distant, la mutation est une transaction courte construite depuis
  // le GET effectué après acquisition du verrou.
  ipcMain.handle('corpus:assignerAudio', async (_e, id: string, source: string) => {
    const gestionnaire = sessions
    const magasin = store
    if (!gestionnaire || gestionnaire.idsTenus().includes(id)) {
      const r = magasin.assignerAudio(id, source)
      if (r) gestionnaire?.noterSale(id)
      return r
    }
    const ref = normaliserCheminAudio(source)
    if (!existsSync(ref)) return null
    const r = await gestionnaire.modifierEntretienFerme(id, (data) => {
      data.meta.audioRef = ref
      return { audioRef: ref }
    })
    if (!r.ok) {
      if (r.raison === 'liberation') magasin.apresMutationAudio(id, false)
      throw new Error(`Assignation audio impossible : ${r.raison}.`)
    }
    magasin.apresMutationAudio(id, false)
    return r.resultat
  })
  ipcMain.handle('corpus:effacerAudio', async (_e, id: string) => {
    const gestionnaire = sessions
    const magasin = store
    if (!gestionnaire || gestionnaire.idsTenus().includes(id)) {
      const r = magasin.effacerAudio(id)
      gestionnaire?.noterSale(id)
      return r
    }
    const r = await gestionnaire.modifierEntretienFerme(id, (data) => {
      data.meta.audioRef = null
      delete data.meta.audioDistant
      return { audioRef: null as null }
    })
    if (!r.ok) {
      if (r.raison === 'liberation') magasin.apresMutationAudio(id, true)
      throw new Error(`Suppression audio impossible : ${r.raison}.`)
    }
    magasin.apresMutationAudio(id, true)
    return r.resultat
  })
  ipcMain.handle(
    'corpus:remplacerTranscription',
    async (_e, id: string, transcription: TranscriptionEntretien) => {
      const gestionnaire = sessions
      const magasin = store
      if (!gestionnaire || gestionnaire.idsTenus().includes(id)) {
        const date = magasin.remplacerTranscription(id, transcription)
        if (date) gestionnaire?.noterSale(id)
        return date
      }
      const r = await gestionnaire.modifierEntretienFerme(id, (data) => {
        data.corpsTexte = transcription.corpsTexte
        data.annotations = transcription.annotations
        data.ancres = transcription.ancres
        data.locuteurs = completerIdsLocuteurs(id, transcription.locuteurs, data.locuteurs)
        return true
      })
      if (!r.ok) throw new Error(`Import de la transcription impossible : ${r.raison}.`)
      return new Date().toISOString()
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
  // Marqueur de corpus de TEST (`corpus.json: { demo }`) : identité, mode,
  // sources et étapes validées. Champ additif optionnel, pas de bump de version.
  ipcMain.handle('corpus:marquerDemo', (_e, marqueur: MarqueurDemo) =>
    store.marquerDemo(marqueur),
  )

  // --- Corpus distant : connexion et ouverture ---
  const sansSecret = (config: ConfigCorpusDistant): CompteDistantPublic => ({
    id: config.id,
    urlServeur: config.urlServeur,
    utilisateur: config.utilisateur,
    motDePasseDisponible: coffre.motDePasseDisponible(config.id),
  })

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

  ipcMain.handle('distant:lister', () => coffre.lister().map(sansSecret))
  ipcMain.handle('distant:stockageSecuriseDisponible', () =>
    coffre.stockageSecuriseDisponible(),
  )

  ipcMain.handle('distant:oublier', (_e, id: string) =>
    transitionner(() => oublierCompte({
      id,
      idActif: miroirActif?.id ?? null,
      fermerContexteActuel,
      desactiverContexte: () => {
        presence?.arreter()
        miroirActif = null
        sessions = null
        transactions = null
        presence = null
        verrouNatif = false
      },
      oublier: (idCompte) => coffre.oublier(idCompte),
      lister: () => coffre.lister().map(sansSecret),
    })),
  )

  ipcMain.handle('distant:connecter', async (_e, params: DemandeConnexion) => {
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

  /** Création directe d'un corpus distant : profilage du serveur, publication du squelette construit en mémoire, puis enregistrement du compte ;
   *  publication gardée par If-None-Match côté publieur, jamais d'écrasement d'un corpus existant.
   *  L'OUVERTURE reste l'apanage de `distant:ouvrir` ; le renderer enchaîne dessus immédiatement (même comportement que le local). */
  ipcMain.handle('distant:creer', async (_e, params: DemandeCreationDistante): Promise<ResultatConnexion> => {
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
      await publieur.publierSquelette(params.nomProjet.trim())
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
  ipcMain.handle('distant:ouvrir', (_e, id: string, motDePasseSaisi?: string) =>
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
      const surProgression = (p: ProgressionTransfert): void => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('distant:progression', p)
      }
      const miroir = new MiroirWebDAV(client, dirMiroir, surProgression)
      const exclusions =
        miroirActif?.id === id && sessions
          ? sessions.idsTenus().map((entretienId) => `entretiens/${entretienId}.json`)
          : []
      const tirage = await miroir.tirer(exclusions)
      if (!existsSync(join(dirMiroir, 'corpus.json'))) {
        throw new Error(
          "Le dossier distant ne contient pas de corpus.json — ce n'est pas (encore) un corpus Sonal.",
        )
      }
      const nouveauStore = new CorpusStore(dirMiroir)
      nouveauStore.lectureSeule = true
      const nouveauVerrouNatif = await sonderFilesLock(config.urlServeur, {
        utilisateur: config.utilisateur,
        motDePasse,
      })
      const nouvellesSessions = new SessionsDEntretien(
        client,
        miroir,
        () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
        (idRetire) => {
          nouveauStore.revoquerEcritureEntretien(idRetire)
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('distant:sessionDegradee', idRetire)
          }
        },
        undefined,
        { verrouNatif: nouveauVerrouNatif },
      )
      const nouvellesTransactions = new TransactionsCorpus(
        client,
        miroir,
        () => nouveauStore,
        () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
        {
          verrouNatif: nouveauVerrouNatif,
          getSessions: () => nouvellesSessions,
        },
      )
      const nouvellePresence = new PresenceDistante(client, () => ({
        userId: config.utilisateur,
        machineId,
        sessionId: SESSION_ID,
      }))
      await nouvellesTransactions.reconcilierFichiersOrphelins()
      const corpus = nouveauStore.ouvrir()
      const verrous = nouveauVerrouNatif
        ? await nouvellesSessions.etatVerrousPublicsNatifs()
        : await nouvellesSessions.etatVerrousPublics(tirage.verrous)

      if (motDePasseSaisi) coffre.memoriserMotDePasse(id, motDePasseSaisi)
      await fermerContexteActuel()
      presence?.arreter()
      store = nouveauStore
      dossierCourant = dirMiroir
      miroirActif = { id, miroir }
      verrouNatif = nouveauVerrouNatif
      sessions = nouvellesSessions
      transactions = nouvellesTransactions
      presence = nouvellePresence
      presence.demarrer()
      ajouterRecentDistant(id)
      return {
        dir: dirMiroir,
        nom: corpus.nom ?? basename(config.urlServeur),
        corpus,
        distant: sansSecret(config),
        verrous,
        inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
      }
    }),
  )

  /** « Actualiser » / pull doux : null si le corpus courant est local.
   *  Les fichiers SOUS NOTRE verrou sont exclus du pull — le miroir n'écrase
   *  jamais une copie de travail en session ; la divergence passe par If-Match
   *  à la publication.
   *  Les verrous sont enrichis pour les badges : scan `verrous/`, ou PROPFIND
   *  files_lock sur `entretiens/`. */
  ipcMain.handle('distant:tirer', async (): Promise<ResultatTiragePublic | null> => {
    const actif = miroirActif
    const gestionnaire = sessions
    const presenceCourante = presence
    const natif = verrouNatif
    if (!actif) return null
    const exclus = gestionnaire
      ? gestionnaire.idsTenus().map((id) => `entretiens/${id}.json`)
      : []
    const t = await actif.miroir.tirer(exclus)
    return {
      telecharges: t.telecharges,
      corbeille: t.corbeille,
      verrous:
        gestionnaire && natif
          ? await gestionnaire.etatVerrousPublicsNatifs()
          : gestionnaire
            ? await gestionnaire.etatVerrousPublics(t.verrous)
            : t.verrous.map(({ chemin, etag }) => ({ chemin, etag, contenu: null })),
      presences: presenceCourante ? await presenceCourante.lister() : undefined,
      inaccessibles: t.inaccessibles.length > 0 ? t.inaccessibles : undefined,
      date: t.date,
    }
  })

  /* ── Publication manuelle + reprise crash + badges ────────────────────── */

  /** Navigation du sélecteur « Désigner dans Nextcloud… » : PROPFIND Depth:1 sur un dossier du corpus ;
   *  entrées triées (dossiers d'abord). Null si corpus local ; erreur typée si dossier inaccessible. */
  ipcMain.handle('distant:listerDossier', async (_e, dossier: string) => {
    const actif = miroirActif
    if (!actif) return null
    const entrees = await actif.miroir.listerDossier(dossier)
    return { entrees }
  })

  /** Désignation audio : micro-session si l'entretien est FERMÉ ;
   *  l'appelant renderer ne vient ici que dans ce cas (un entretien ouvert en
   *  session passe par son modèle). Le chemin est RELATIF à la racine corpus. */
  ipcMain.handle('distant:designerAudio', async (_e, id: string, cheminAudio: string) => {
    const gestionnaire = sessions
    if (!gestionnaire) return { ok: false as const, raison: 'corpus-local' }
    return gestionnaire.designerAudio(id, cheminAudio)
  })

  /** Téléversement d'un fichier LOCAL vers le Nextcloud. Le renderer ne touche jamais au disque ;
   *  c'est le main qui lit le fichier choisi par dialogue, en FLUX vers le PUT (`televerserFichier` avec un chemin), sans limite de taille mémoire.
   *  La DÉSIGNATION reste un geste séparé du renderer (même chemin que pour un fichier déjà présent). */
  ipcMain.handle(
    'distant:televerserAudio',
    async (_e, sourceLocale: string, cheminCible: string) => {
      const actif = miroirActif
      if (!actif) return { ok: false as const, raison: 'corpus-local' }
      // Existence/lisibilité vérifiée TÔT pour distinguer « fichier illisible »
      // d'un échec réseau pendant l'envoi.
      try {
        statSync(sourceLocale)
      } catch {
        return { ok: false as const, raison: 'lecture-impossible' }
      }
      try {
        return await actif.miroir.televerserFichier(
          cheminCible,
          sourceLocale,
          typeMimeAudio(cheminCible),
          (octets, total) => {
            for (const w of BrowserWindow.getAllWindows()) {
              w.webContents.send('distant:progression', {
                sens: 'televersement',
                chemin: cheminCible,
                octets,
                total,
              } satisfies ProgressionTransfert)
            }
          },
        )
      } catch (e) {
        if (e instanceof ErreurHttp) return { ok: false as const, raison: String(e.statut) }
        return { ok: false as const, raison: 'reseau' }
      }
    },
  )

  /** « Publier maintenant » : PUT If-Match sous verrou toujours tenu. */
  ipcMain.handle('distant:publierEntretien', async (_e, id: string) => {
    const gestionnaire = sessions
    if (!gestionnaire) return { ok: false as const, raison: 'aucune session' }
    return gestionnaire.publier(id)
  })

  /** Orphelins détectables (verrous de NOTRE machine, autre session),
   *  matière du dialogue de reprise crash. Null si corpus local. */
  ipcMain.handle('distant:orphelins', async (): Promise<OrphelinDistant[] | null> => {
    if (!sessions) return null
    const liste = await sessions.orphelins()
    return liste.map(({ cheminVerrou, id, verrou }) => ({
      cheminVerrou,
      id,
      userId: verrou.userId,
      machineId: verrou.machineId,
      acquiredAt: verrou.acquiredAt,
    }))
  })

  /** Choix « reprendre et publier » du dialogue de reprise crash. */
  ipcMain.handle('distant:reprendreOrphelin', async (_e, cheminVerrou: string) => {
    if (!sessions) return { ok: false as const, raison: 'aucun corpus distant' }
    return sessions.reprendreOrphelin(cheminVerrou)
  })

  /** Choix « abandonner » (déverrouille sans publier) du dialogue de reprise crash. */
  ipcMain.handle('distant:abandonnerOrphelin', async (_e, cheminVerrou: string) => {
    if (!sessions) return
    await sessions.abandonnerOrphelin(cheminVerrou)
  })

  /* ── Présence ────────────────────────────────────────────────────────── */

  /** Le renderer signale l'entretien qu'il ouvre/ferme.
   *  La présence est publiée immédiatement, sans attendre le prochain battement. */
  ipcMain.handle('distant:noterEntretienOuvert', (_e, id: string | null) => {
    if (!presence) return
    void presence.noterEntretienOuvert(id)
  })

  /* --- Copies de divergence (fusion assistée) --- */

  /** Les copies mises de côté par les rétrogradations (publication 412). */
  ipcMain.handle('distant:listerDivergences', () =>
    sessions ? sessions.listerDivergences() : [],
  )
  /** Contenu d'une copie (null = absente/corrompue/chemin invalide). */
  ipcMain.handle('distant:lireDivergence', (_e, chemin: string) =>
    sessions ? sessions.lireDivergence(chemin) : null,
  )
  /** Jette une copie — choix EXPLICITE du dialogue, jamais automatique. */
  ipcMain.handle('distant:supprimerDivergence', (_e, chemin: string) => {
    sessions?.supprimerDivergence(chemin)
  })

  /** Migration SonalPi1 → SonalPi2, EXÉCUTION : crée le corpus SonalPi2 dans le dossier dédié,
   *  l'ajoute aux récents, et BASCULE le store dessus (même mécanique que changerDossier). */
  ipcMain.handle('migrer:executer', (_e, req: DemandeMigration) =>
    transitionner(() => transitionsLocales.migrer(req)),
  )

  // Protocole `sonal-media` : deux hôtes par nature de ressource.
  // Le handler capture `store` (réaffecté par changerDossier) ;
  // support des requêtes Range (l'élément <audio> de Chromium en dépend pour le seek).
  //   sonal-media://waveform/<id>  → PNG dérivé local (résolu par id, pas de traversal possible ; l'id est opaque)
  //   sonal-media://abs/<encoded>  → audio référencé externe (whitelist stricte sur les audioRef stockées dans le corpus)
  protocol.handle('sonal-media', (req) => {
    const url = new URL(req.url)
    const hote = url.hostname
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
      if (ok) sessions?.noterSale(entretienId)
      return ok
    },
  )
  // Lot « modifier en lot » : distant → transactions (verrou court par entretien,
  // échecs nommés) ; local → boucle directe du store. Mêmes résultats dans les deux modes.
  ipcMain.handle('corpus:poserValeurLot', (_e, items: ItemLotValeur[]) =>
    transactions ? transactions.poserValeurLot(items) : poserValeurLotLocal(store, items),
  )

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
    presence?.arreter()
    if (!sessions) return
    const bilan = await sessions.fermerToutes()
    if (bilan.bloquees.length === 0) sessions.dispose()
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

/** Clefs des sources bundled (une par entretien de démo) ;
 *  une clef EST le nom de fichier source, sans extension ;
 *  la complétude sert à la copie comme à la présence. */
const CLEFS_SOURCES = ['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants']

/** Présence RÉELLE des sources de démo : les 8 fichiers (4 SRT + 4 MP3)
 *  doivent exister, jamais seulement le dossier ; invariant « présence ≠
 *  existence » (docs/dev/ouverture-corpus.md §4). */
function sourcesCompletes(racine: string): boolean {
  return (
    CLEFS_SOURCES.every((k) => existsSync(join(racine, 'srt', `${k}.srt`))) &&
    CLEFS_SOURCES.every((k) => existsSync(join(racine, 'audio', `${k}.mp3`)))
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
   *  sources = les 8 fichiers ; corpus de test = marqueur `demo` du mode attendu.
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
