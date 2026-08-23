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
import { CorpusStore } from './corpusStore'
import { ClientWebDAV, ErreurHttp } from './webdav/client'
import { profilerServeur, sonderFilesLock } from './webdav/sondes'
import { MiroirWebDAV } from './miroir'
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
  EntreeRecent,
  EtatDemo,
  EtatDemoComplet,
  ItemLotValeur,
  MarqueurDemo,
  PatchCategorie,
  PayloadEntretien,
  RegleAnon,
  Variable,
} from '../shared/format'
import type {
  DemandeConnexion,
  DemandeCreationDistante,
  OrphelinDistant,
  OuvertureDistante,
  ProgressionTransfert,
  ResultatConnexion,
  ResultatTiragePublic,
} from '../shared/distant'
import { PublieurCorpus, ErreurDejaCorpus } from './distant/publication'
import { EXT_MEDIA } from '../shared/media'

// Le protocole qui SERT les médias du corpus au renderer : en dev le
// renderer est en http://localhost (Vite) et ne lit pas file:// → un protocole
// custom streame l'audio (Range) et la forme d'onde. Privilèges déclarés AVANT
// app.ready (exigence Electron) ; `supportFetchAPI` permet au renderer de
// récupérer les octets audio par fetch() pour générer la forme d'onde.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sonal-media',
    // standard+secure : URL http-like, utilisable depuis le renderer Vite ;
    // supportFetchAPI+corsEnabled : le renderer peut fetch() les octets audio
    // (génération de la forme d'onde) ; stream : lecture <audio> par plages.
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

/** Content-Type d'un média pour le téléversement (best effort) : la table
 *  MIME ci-dessus, défaut octet-stream.
 *  Couvre AUDIO ET VIDÉO — le nom historique reste par économie de churn. */
function typeMimeAudio(chemin: string): string {
  const ext = extname(chemin).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}
const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']

// --- Réglages du profil : corpus récents + mémoire démo + largeur vidéo par corpus ---
interface Settings {
  recents: string[] // chemins de dossiers, le plus récent en tête
  /** Ids de comptes distants ouverts récemment. Séparés des locaux : la
   *  réouverture d'un récent distant passe par `distant:ouvrir(id)`, jamais
   *  par le chemin miroir (le cycle verrou/publie serait contourné). */
  recentsDistant?: string[]
  demo?: EtatDemo // dossiers du « Mini Corpus Test » choisis une fois
  // Largeur (px) du panneau vidéo, mémorisée PAR CORPUS (clé = chemin du dossier).
  largeurVideo?: Record<string, number>
}
function fichierSettings(): string {
  return join(app.getPath('userData'), 'settings.json')
}
/** Garde de forme de l'état démo persistant (fichier potentiellement écrit à
 *  la volée — ne pas hydrater un enregistrement partiel/corrompu). */
function estEtatDemo(d: unknown): d is EtatDemo {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  return (
    typeof o.racineSources === 'string' &&
    (o.corpusPasAPas === undefined || typeof o.corpusPasAPas === 'string') &&
    (o.corpusAutonomie === undefined || typeof o.corpusAutonomie === 'string')
  )
}
function lireSettings(): Settings {
  try {
    const s = JSON.parse(readFileSync(fichierSettings(), 'utf8')) as Partial<Settings>
    return {
      recents: Array.isArray(s.recents) ? s.recents : [],
      demo: estEtatDemo(s.demo) ? s.demo : undefined,
      largeurVideo:
        s.largeurVideo && typeof s.largeurVideo === 'object' ? s.largeurVideo : undefined,
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
/** Retire un RACCOURCI de la liste des récents — le dossier de corpus sur disque
 *  n'est jamais touché (l'app n'efface aucun corpus). */
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

/** Rattache un dialogue NATIF à la fenêtre qui l'a demandé : sans fenêtre
 *  parente, certains environnements (Linux/WSLg) affichent le dialogue DERRIÈRE
 *  l'app — ou sur un autre bureau — et le clic semble « ne rien ouvrir ».
 *  `e.sender` = la webContents qui invoque l'IPC ; `fromWebContents` retrouve
 *  sa fenêtre (environnement headless : on retombe sur la forme sans fenêtre). */
function montrerOuvrir(e: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  return fenetre ? dialog.showOpenDialog(fenetre, options) : dialog.showOpenDialog(options)
}
/** Même rattachement pour le dialogue de SAVE. */
function montrerSauver(e: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  return fenetre ? dialog.showSaveDialog(fenetre, options) : dialog.showSaveDialog(options)
}

// respecte le --user-data-dir passé en ligne  de commande
// car les tests e2e l'utilisent pour isoler chaque test
// et éviter qu'ils ne se gênent mutuellement
const userDataDir = app.commandLine.getSwitchValue('user-data-dir')
if (userDataDir) app.setPath('userData', userDataDir)


  function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // En dev, electron-vite sert le renderer via Vite (HMR) ; en prod, le bundle.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function enregistrerIpcCorpus(): void {
  // Dossier de corpus par défaut = <profil>/corpus (les e2e l'isolent via --user-data-dir).
  //  Le `store` est MUTABLE : « Ouvrir un corpus… » le recrée sur un autre dossier.
  // Les handlers capturent la variable `store` (pas sa valeur)
  // → ils voient la réaffectation sans être réenregistrés.
  const dossierDefaut = join(app.getPath('userData'), 'corpus')
  let store = new CorpusStore(dossierDefaut)
  let dossierCourant = dossierDefaut

  // ── Corpus distant : connexion, création et ouverture ─────────────────
  // La connexion mesure le profil du serveur par sondes RÉELLES
  // (préconditions PUT + capabilities files_lock), AVANT d'enregistrer quoi
  // que ce soit ; un serveur qui ment est refusé.
  // Le secret (mot de passe d'application) vit chiffré dans le coffre
  // (safeStorage), et ne remonte jamais au renderer.
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
  // Variante de verrou du corpus distant actif : true = files_lock natif
  // (sonde capabilities), false/absent = PUT conditionnel.
  // Mesurée À CHAQUE ouverture — un admin peut installer le plugin entre deux
  // sessions.
  let verrouNatif = false
  // Identité de session : machineId stable par poste (généré une fois,
  // stocké dans le profil) ; sessionId aléatoire par lancement d'app
  // (voir SESSION_ID plus bas).
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

  /** Bascule sur un autre dossier de corpus, l'ouvre (amorce si vide)
   * et le note dans les récents. Renvoie le contenu du corpus. */
  const changerDossier = (dir: string) => {
    store = new CorpusStore(dir)
    store.lectureSeule = false // corpus local : écritures permises
    sessions = null // corpus local : plus de verrous ni publications
    transactions = null // corpus local : mutations directes (pas de transaction)
    presence?.arreter() // corpus local : plus de battement de présence
    presence = null
    verrouNatif = false
    miroirActif = null // corpus local : plus de pull
    dossierCourant = dir
    const corpus = store.ouvrir() // amorce si le dossier est neuf
    ajouterRecent(dir)
    return { dir, nom: basename(dir), corpus }
  }

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
    // Ne garder que les corpus dont le DOSSIER existe encore : un corpus supprimé
    // à la main (dossier effacé) ne doit plus apparaître dans « Récents » — et au
    // démarrage, le 1er récent ne doit pas être un dossier fantôme recréé
    // silencieusement par ouvrirDossier (mkdirSync). Écriture de retour pour
    // nettoyer settings.json des entrées mortes (demo préservé).
    const vivants = s.recents.filter((dir) => existsSync(dir))
    if (vivants.length !== s.recents.length) {
      s.recents = vivants
      ecrireSettings(s)
    }
    // Récents distants : fraîcheur = le compte existe toujours au coffre
    // (équivalent du existsSync local). Le nom vient du miroir (`corpus.json`)
    // si présent, sinon du dernier segment de l'URL. JAMAIS le chemin miroir
    // n'est exposé comme dossier local.
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
  /** Retire un RACCOURCI des récents (local OU distant — ne touche jamais aux
   *  données : ni le dossier disque, ni le serveur, ni le miroir). */
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
  /** « Nouveau corpus » : bascule le store sur le dossier. S'il est NEUF (pas
   *  de corpus.json), crée un corpus portant le `nom` saisi ; s'il contient
   *  déjà un corpus, l'OUVRE tel quel (on n'écrase jamais — son `nom` fait foi). */
  ipcMain.handle('corpus:creerNouveau', (_e, dir: string, nom: string) => {
    const frais = !existsSync(join(dir, 'corpus.json'))
    store = new CorpusStore(dir)
    store.lectureSeule = false // corpus local : écritures permises
    sessions = null
    transactions = null
    presence?.arreter()
    presence = null
    verrouNatif = false
    miroirActif = null
    dossierCourant = dir
    let corpus = store.ouvrir() // amorce si neuf
    if (frais && nom && nom.trim()) corpus = store.poserNom(nom.trim())
    ajouterRecent(dir)
    return { dir, nom: corpus.nom ?? basename(dir), corpus }
  })
  // Session id aléatoire PAR LANCEMENT (portée du bloc corpus entier).
  const SESSION_ID = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  /** Exécute une mutation de DÉFINITIONS : transaction complète en corpus
   *  distant (verrou corpus, GET frais, mutation, PUT If-Match), écriture
   *  directe du store en local.
   *  Les refus (`ErreurTransaction`) remontent à la bannière renderer via
   *  l'exception IPC. */
  function executerDefinitions<T>(fn: () => T): Promise<T> | T {
    return transactions ? transactions.executer(fn) : fn()
  }

  /** Ouverture d'un entretien : en corpus DISTANT, tente d'abord le VERROU.
   *  Acquis → écriture permise pour ce fichier ;
   *  refusé → lecture seule avec détenteur affiché.
   *  En corpus local : inchangé. */
  ipcMain.handle('corpus:lireEntretien', async (_e, id: string) => {
    if (!sessions) return store.lireEntretien(id)
    const etat = await sessions.ouvrir(id)
    if (etat.etat === 'tenu-par-autrui') {
      const lecture = store.lireEntretien(id)
      if (lecture.ok) {
        return {
          ...lecture,
          verrouTenuParAutrui: etat.tenuPar
            ? {
                userId: etat.tenuPar.userId,
                machineId: etat.tenuPar.machineId,
                acquiredAt: etat.tenuPar.acquiredAt,
              }
            : undefined,
        }
      }
      return lecture
    }
    // Verrou à nous : lever la garde sur CE fichier uniquement.
    store.autoriserEcritureEntretien(id)
    return store.lireEntretien(id)
  })

  /** Fermeture : publication finale PUIS libération (ordre invariant).
   *  Appelé par le renderer quand il quitte l'entretien ; sans effet local.
   */
  ipcMain.handle('corpus:fermerEntretien', async (_e, id: string) => {
    if (sessions) await sessions.fermer(id)
    store.revoquerEcritureEntretien(id)
    return true
  })

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
    executerDefinitions(() => store.creerEntretienVide(titre)),
  )
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    executerDefinitions(() => store.renommerEntretien(id, titre)),
  )
  /** Suppression : DOUBLE VERROU distant (corpus PUIS entretien, ordre
   *  canonique — publication corpus d'abord, MOVE serveur ensuite) ;
   *  directe en local.
   *  Défense en profondeur : si NOUS tenions encore la session de cet
   *  entretien, la fermer d'abord (publication puis libération, ordre
   *  invariant) — sinon ce serait notre propre verrou qui bloquerait la
   *  suppression. */
  ipcMain.handle('corpus:supprimerEntretien', async (_e, id: string) => {
    if (!transactions) return store.supprimerEntretien(id)
    await sessions?.fermer(id)
    store.revoquerEcritureEntretien(id)
    return transactions.supprimerEntretien(id)
  })
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[], reglesAnon: RegleAnon[]) =>
      executerDefinitions(() => store.importerEntretien(titre, payload, codebook, variables, reglesAnon)),
  )

  // Codebook (thèmes) — définitions : sous transaction en distant
  ipcMain.handle('corpus:ajouterCategorie', (_e, nom: string, parent: string | null) =>
    executerDefinitions(() => store.ajouterCategorie(nom, parent)),
  )
  ipcMain.handle('corpus:modifierCategorie', (_e, id: string, patch: PatchCategorie) =>
    executerDefinitions(() => store.modifierCategorie(id, patch)),
  )
  ipcMain.handle('corpus:deplacerCategorie', (_e, id: string, sens: -1 | 1) =>
    executerDefinitions(() => store.deplacerCategorie(id, sens)),
  )
  ipcMain.handle('corpus:supprimerCategorie', (_e, id: string, exceptId?: string) =>
    executerDefinitions(() => store.supprimerCategorie(id, exceptId)),
  )
  ipcMain.handle('corpus:usagesParCategorie', () => store.usagesParCategorie())
  ipcMain.handle('corpus:resumesThematiques', () => store.resumesThematiques())
  ipcMain.handle('corpus:reglesAnon', () => store.reglesAnon())
  ipcMain.handle('corpus:scanAnon', () => store.scanAnon())
  ipcMain.handle('corpus:regleAnonParEntite', (_e, entite: string) => store.regleAnonParEntite(entite))
  ipcMain.handle('corpus:regleAnonCreer', (_e, entite: string, pseudos: string[]) =>
    executerDefinitions(() => store.regleAnonCreer(entite, pseudos)),
  )
  ipcMain.handle('corpus:regleAnonAjouterPseudo', (_e, id: string, pseudo: string) =>
    executerDefinitions(() => store.regleAnonAjouterPseudo(id, pseudo)),
  )
  ipcMain.handle('corpus:regleAnonUtiliseeAilleurs', (_e, id: string, exceptId?: string) =>
    store.regleAnonUtiliseeAilleurs(id, exceptId),
  )
  ipcMain.handle('corpus:regleAnonSupprimer', (_e, id: string) =>
    executerDefinitions(() => store.regleAnonSupprimer(id)),
  )
  ipcMain.handle('corpus:appliquerRegleAnonLot', (_e, cibles: CibleRegleAnon[]) =>
    transactions ? transactions.appliquerRegleLot(cibles) : appliquerRegleLotLocal(store, cibles),
  )
  ipcMain.handle('corpus:compterUsagesCategorie', (_e, code: string, exceptId?: string) =>
    store.compterUsagesCategorie(code, exceptId),
  )

  // Variables & modalités (EAV) — définitions : sous transaction distant
  ipcMain.handle('corpus:ajouterVariable', (_e, lib: string, portee: 'entretien' | 'locuteur') =>
    executerDefinitions(() => store.ajouterVariable(lib, portee)),
  )
  ipcMain.handle('corpus:modifierVariable', (_e, id: string, patch: Partial<Variable>) =>
    executerDefinitions(() => store.modifierVariable(id, patch)),
  )
  ipcMain.handle('corpus:supprimerVariable', (_e, id: string) =>
    executerDefinitions(() => store.supprimerVariable(id)),
  )
  ipcMain.handle('corpus:ajouterModalite', (_e, idVar: string, lib: string) =>
    executerDefinitions(() => store.ajouterModalite(idVar, lib)),
  )
  ipcMain.handle('corpus:modifierModalite', (_e, idVar: string, idMod: string, lib: string) =>
    executerDefinitions(() => store.modifierModalite(idVar, idMod, lib)),
  )
  ipcMain.handle('corpus:supprimerModalite', (_e, idVar: string, idMod: string) =>
    executerDefinitions(() => store.supprimerModalite(idVar, idMod)),
  )
  ipcMain.handle('corpus:matrice', () => store.matriceCorpus())

  // Audio : assignation par RÉFÉRENCE (chemin absolu, plus de copie), forme
  // d'onde dérivée (PNG), scan des médias, vérification d'intégrité.
  ipcMain.handle('corpus:assignerAudio', (_e, id: string, source: string) => {
    const r = store.assignerAudio(id, source)
    if (r) sessions?.noterSale(id)
    return r
  })
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
  // Marqueur de corpus de TEST (`corpus.json: { demo }`) — identité + mode +
  // sources + étapes validées. Champ additif optionnel, pas de bump de version.
  ipcMain.handle('corpus:marquerDemo', (_e, marqueur: MarqueurDemo) =>
    store.marquerDemo(marqueur),
  )

  // ── Corpus distant : connexion et ouverture ──────────────────────────────
  const sansSecret = ({ motDePasseChiffre: _s, ...c }: ConfigCorpusDistant) => c

  /** Nettoyage best effort après refus de création : supprime la FEUILLE que
   *  nous venons de créer (dossiers vides sans corpus — jamais un dossier
   *  préexistant de l'utilisateur). */
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

  ipcMain.handle('distant:oublier', (_e, id: string) => {
    if (miroirActif?.id === id) {
      miroirActif = null
      sessions = null
      transactions = null
      presence?.arreter()
      presence = null
      verrouNatif = false
    }
    coffre.oublier(id)
    return coffre.lister().map(sansSecret)
  })

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

  /** Création directe d'un corpus distant : profilage du serveur, publication
   *  du squelette construit en mémoire, puis enregistrement du compte. La
   *  publication est gardée par If-None-Match côté publieur : jamais
   *  d'écrasement d'un corpus existant. L'OUVERTURE reste l'apanage de
   *  `distant:ouvrir` — le renderer enchaîne dessus immédiatement (même
   *  comportement que le local : créer = atterrir sur l'écran Corpus). */
  ipcMain.handle('distant:creer', async (_e, params: DemandeCreationDistante): Promise<ResultatConnexion> => {
    const baseUrl = params.urlServeur.trim().replace(/\/+$/, '')
    const identifiants = { utilisateur: params.utilisateur.trim(), motDePasse: params.motDePasse }
    try {
      // 1. Chaîne de dossiers D'ABORD : la sonde de préconditions écrit dans
      //    la cible et échouerait si le dossier n'existait pas encore.
      const publieur = new PublieurCorpus({ baseUrl, identifiants })
      const { feuilleCreee } = await publieur.preparerRacine()
      // 2. Préconditions réelles, mesurées sur une cible qui existe désormais.
      const profil = await profilerServeur(new ClientWebDAV({ baseUrl, identifiants }))
      if (!profil.preconditions) {
        // Refus → nettoyage de la feuille SI nous venons de la créer (on ne
        // touche jamais un dossier préexistant de l'utilisateur).
        if (feuilleCreee) await publierNettoyage(baseUrl, identifiants)
        return {
          ok: false as const,
          note:
            profil.notes?.join(' ; ') ??
            'Le serveur ignore les préconditions HTTP (If-Match / If-None-Match) : aucun verrou fiable possible.',
        }
      }
      // 3. Publication puis enregistrement EN DERNIER : un échec réseau ou
      //    un « déjà corpus » ne laisse aucun compte fantôme.
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

  /** Ouvre un corpus distant EN LECTURE contrôlée : tire le miroir puis
   *  bascule le store dessus ; chaque entretien s'ouvre ensuite SOUS VERROU
   *  (corpus:lireEntretien).
   *  Échec réseau → exception IPC ; le corpus local courant reste en place.
   *  Le pull d'ouverture livre aussi l'état des verrous (badges fiables),
   *  sans second aller-retour. */
  ipcMain.handle('distant:ouvrir', async (_e, id: string): Promise<OuvertureDistante> => {
    const config = coffre.lister().find((c) => c.id === id)
    if (!config) throw new Error('Compte distant inconnu')
    const motDePasse = coffre.motDePasse(id)
    if (!motDePasse) {
      throw new Error('Mot de passe indéchiffrable (trousseau perdu ?) — reconnectez le compte.')
    }
    const client = new ClientWebDAV({
      baseUrl: config.urlServeur,
      identifiants: { utilisateur: config.utilisateur, motDePasse },
    })
    const dirMiroir = join(app.getPath('userData'), 'miroirs', id)
    // Progression des rapatriements : relayée à toutes les fenêtres —
    // l'étiquette du lecteur affiche l'avancement.
    const surProgression = (p: ProgressionTransfert): void => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('distant:progression', p)
      }
    }
    const miroir = new MiroirWebDAV(client, dirMiroir, surProgression)
    const tirage = await miroir.tirer()    // Garde : un dossier distant SANS corpus.json ne doit pas être amorcé
    // localement (l'amorce écrirait dans un miroir en lecture seule).
    if (!existsSync(join(dirMiroir, 'corpus.json'))) {
      throw new Error(
        "Le dossier distant ne contient pas de corpus.json — ce n'est pas (encore) un corpus Sonal.",
      )
    }
    store = new CorpusStore(dirMiroir)
    // Définitions partagées TOUJOURS en lecture seule à l'ouverture ;
    // le contenu des entretiens devient écrivable fichier par fichier,
    // sous verrou.
    store.lectureSeule = true
    dossierCourant = dirMiroir
    miroirActif = { id, miroir }
    // Variante de verrou : re-sonde des capabilities à CHAQUE ouverture
    // (une requête — un admin peut installer files_lock entre deux sessions).
    // L'utilisateur ne choisit rien ; le protocole s'adapte.
    verrouNatif = await sonderFilesLock(config.urlServeur, {
      utilisateur: config.utilisateur,
      motDePasse,
    })
    sessions = new SessionsDEntretien(
      client,
      miroir,
      () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
      (idRetire) => store.revoquerEcritureEntretien(idRetire),
      undefined,
      { verrouNatif },
    )
    // Transactions de définitions — mêmes dépendances que les sessions ;
    // le store est visé PAR APPEL (il peut être réaffecté ensuite).
    transactions = new TransactionsCorpus(
      client,
      miroir,
      () => store,
      () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
      {
        verrouNatif,
        // Défense en profondeur du lot :
        // un entretien OUVERT chez nous passe par le chemin session existant.
        getSessions: () => sessions,
      },
    )
    // Présence : battement 60 s tant que le corpus distant est ouvert.
    presence?.arreter()
    presence = new PresenceDistante(client, () => ({
      userId: config.utilisateur,
      machineId,
      sessionId: SESSION_ID,
    }))
    presence.demarrer()
    const corpus = store.ouvrir()
    ajouterRecentDistant(id) // le corpus distant rejoint les Récents 🌐
    return {
      dir: dirMiroir,
      nom: corpus.nom ?? basename(config.urlServeur),
      corpus,
      distant: { id, urlServeur: config.urlServeur, utilisateur: config.utilisateur },
      verrous: await sessions.etatVerrousPublics(tirage.verrous),
      inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
    }
  })

  /** « Actualiser » / pull doux : null si le corpus courant est local.
   *  Les fichiers SOUS NOTRE verrou sont exclus du pull — le miroir n'écrase
   *  jamais une copie de travail en session ; la divergence passe par If-Match
   *  à la publication.
   *  Les verrous sont enrichis pour les badges : scan `verrous/`, ou PROPFIND
   *  files_lock sur `entretiens/`. */
  ipcMain.handle('distant:tirer', async (): Promise<ResultatTiragePublic | null> => {
    if (!miroirActif) return null
    const exclus = sessions ? sessions.idsTenus().map((id) => `entretiens/${id}.json`) : []
    const t = await miroirActif.miroir.tirer(exclus)
    return {
      telecharges: t.telecharges,
      corbeille: t.corbeille,
      verrous:
        sessions && verrouNatif
          ? await sessions.etatVerrousPublicsNatifs()
          : sessions
            ? await sessions.etatVerrousPublics(t.verrous)
            : t.verrous.map(({ chemin, etag }) => ({ chemin, etag, contenu: null })),
      presences: presence ? await presence.lister() : undefined,
      inaccessibles: t.inaccessibles.length > 0 ? t.inaccessibles : undefined,
      date: t.date,
    }
  })

  /* ── Publication manuelle + reprise crash + badges ────────────────────── */

  /** Navigation du sélecteur « Désigner dans Nextcloud… » : PROPFIND Depth:1
   *  d'un dossier du corpus, entrées triées (dossiers d'abord). Null si corpus
   *  local ; erreur typée si dossier inaccessible. */
  ipcMain.handle('distant:listerDossier', async (_e, dossier: string) => {
    if (!miroirActif) return null
    const entrees = await miroirActif.miroir.listerDossier(dossier)
    return { entrees }
  })

  /** Désignation audio : micro-session si l'entretien est FERMÉ —
   *  l'appelant renderer ne vient ici que dans ce cas (un entretien ouvert en
   *  session passe par son modèle). Le chemin est RELATIF à la racine corpus. */
  ipcMain.handle('distant:designerAudio', async (_e, id: string, cheminAudio: string) => {
    if (!sessions) return { ok: false as const, raison: 'corpus-local' }
    return sessions.designerAudio(id, cheminAudio)
  })

  /** Téléversement d'un fichier LOCAL vers le Nextcloud. Le renderer ne
   *  touche jamais au disque : c'est le main qui lit le
   *  fichier choisi par dialogue — lu EN FLUX vers le PUT
   *  (`televerserFichier` avec un chemin), donc sans limite de taille mémoire.
   *  La DÉSIGNATION reste un geste séparé du renderer (même chemin que pour un
   *  fichier déjà présent). */
  ipcMain.handle(
    'distant:televerserAudio',
    async (_e, sourceLocale: string, cheminCible: string) => {
      if (!miroirActif) return { ok: false as const, raison: 'corpus-local' }
      // Existence/lisibilité vérifiée TÔT pour distinguer « fichier illisible »
      // d'un échec réseau pendant l'envoi.
      try {
        statSync(sourceLocale)
      } catch {
        return { ok: false as const, raison: 'lecture-impossible' }
      }
      try {
        return await miroirActif.miroir.televerserFichier(
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
    if (!sessions) return { ok: false as const, raison: 'aucune session' }
    return sessions.publier(id)
  })

  /** Orphelins détectables (verrous de NOTRE machine, autre session) — matière
   *  du dialogue de reprise crash. Null si corpus local. */
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

  /** Le renderer signale l'entretien qu'il ouvre/ferme — la présence est
   *  publiée immédiatement (sans attendre le prochain battement). */
  ipcMain.handle('distant:noterEntretienOuvert', (_e, id: string | null) => {
    if (!presence) return
    void presence.noterEntretienOuvert(id)
  })

  /* ── Copies de divergence (fusion assistée) ──────────────────────────── */

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

  /** Migration SonalPi V1 → V2 — EXÉCUTION : crée le corpus V2 dans le dossier
   *  dédié (nom + meta.sourceV1 + fusion), ajoute aux récents et BASCULE le
   *  store dessus (même mécanique que changerDossier). */
  ipcMain.handle('migrer:executer', (_e, req: DemandeMigration) => {
    store = new CorpusStore(req.dossier)
    store.lectureSeule = false // corpus local : écritures permises
    sessions = null
    transactions = null
    presence?.arreter()
    presence = null
    verrouNatif = false
    miroirActif = null
    dossierCourant = req.dossier
    const corpus = store.migrerDepuisV1(
      req.nom,
      { cheminCrp: req.cheminCrp, dateCreation: req.dateCreation },
      req.codebook,
      req.variables,
    )
    ajouterRecent(req.dossier)
    return { dir: req.dossier, nom: corpus.nom ?? basename(req.dossier), corpus }
  })

  // Protocole `sonal-media` : deux hôtes par nature de ressource. Le handler
  // capture `store` (réaffecté par changerDossier). Support des requêtes Range
  // (l'élément <audio> de Chromium en dépend pour le seek).
  //   sonal-media://waveform/<id>  → PNG dérivé local (résolu par id, pas de
  //                                 traversal possible — l'id est opaque)
  //   sonal-media://abs/<encoded>  → audio référencé externe (whitelist stricte
  //                                 sur les audioRef stockées dans le corpus)
  protocol.handle('sonal-media', (req) => {
    const url = new URL(req.url)
    const hote = url.hostname
    let fichier: string | null = null
    if (hote === 'waveform') {
      // L'id est opaque (genId) — on retire le `/` initial du pathname.
      const id = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      fichier = store.cheminWaveform(id)
    } else if (hote === 'abs') {
      // Chemin absolu encodé : on retire le SEUL `/` initial ajouté par URL,
      // puis décode — pour ne pas manger la barre initiale d'un chemin POSIX.
      const brut = url.pathname.replace(/^\//, '')
      fichier = store.cheminMediaAbs(decodeURIComponent(brut))
    }
    if (!fichier) return new Response('média introuvable', { status: 404 })
    const taille = statSync(fichier).size
    const entetes: Record<string, string> = {
      'Content-Type': MIME[extname(fichier).slice(1).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // le renderer (origine Vite en dev, file:// en prod) fetch() ce schéma
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
  // Lot « modifier en lot » : distant → transactions (verrou court par
  // entretien, échecs nommés) ; local → boucle directe du store. Mêmes
  // résultats dans les deux modes.
  ipcMain.handle('corpus:poserValeurLot', (_e, items: ItemLotValeur[]) =>
    transactions ? transactions.poserValeurLot(items) : poserValeurLotLocal(store, items),
  )

  // Dialogs fichier : le parsing d'import se fait côté renderer (DOMParser),
  // le main ne fait que LIRE/ÉCRIRE le fichier choisi. En e2e, les dialogs
  // sont stubbés (electronApp.evaluate) pour piloter sans dialog.
  // `defaultPath` optionnel : pendant une session démo, le dialogue s'ouvre
  // dans le dossier des sources (l'utilisateur y retrouve les fichiers).
  // Modale « Ajouter un entretien » (à la SonalPi, ajout-entretien.html) :
  //  DEUX zones — celle-ci choisit le fichier d'ENTRETIEN (contenu lu ici,
  //  parsé côté renderer) ; la zone son passe par dialog:choisirAudio (le
  //  main ne touche l'audio qu'à corpus:assignerAudio, qui le RÉFÉRENCE sans
  //  jamais le lire en mémoire).
  ipcMain.handle('dialog:choisirTexte', async (e, defaultPath?: string) => {
    const r = await montrerOuvrir(e, {
      defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Entretien', extensions: EXT_TEXTE }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
  })
  // Zone son de la modale + « Assigner un audio… » sur la fiche entretien.
  // En réalité le filtre couvre AUDIO + VIDÉO (les deux sont assignables).
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
  // Picker de dossier PUR (aucun effet de bord sur le store), utilisé par la
  // modale démo. `kind` (sources | corpus) hinte le défaut
  // `Documents/Sonal/démo/<kind>` (modifiable) ; le retour est le chemin
  // choisi, le corpus est ensuite OUVERT via corpus:ouvrirDossier.
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
}

// ── Démo « Mini Corpus Test » : lecture des sources bundled ───────────────
// Les sources (SRT + audio) de CorpusTest/ NE sont PAS un corpus Sonal (pas de
// corpus.json / entretiens/) : elles sont l'AMONT du builder de démo, qui les
// importe via le vrai pipeline (sas d'import + assignerAudio) dans un dossier
// choisi. Le builder lui-même tourne côté renderer (l'importeur SRT y vit, avec
// DOMParser) ; le main ne fait que LIRE ces fichiers.
function cheminCorpusTest(): string {
  // Dev : CorpusTest/ à la racine du projet (app.getAppPath() = cwd au lancement).
  // Prod : copié en ressources par electron-builder (extraResources, hors asar).
  return app.isPackaged
    ? join(process.resourcesPath, 'CorpusTest')
    : join(app.getAppPath(), 'CorpusTest')
}

function enregistrerIpcDemo(): void {
  /** Clefs des sources bundled (une par entretien de démo) :
   *  servent à la garde de complétude de `demo:copierSources`. */
  const CLEFS_SOURCES = ['E1', 'E2', 'E3', 'E4']

  /** Copie les sources bundled `CorpusTest/` (`srt/` + `audio/`, ~13 Mo),
   *  dans le dossier choisi : c'est LA seule copie du flow de démo.
   *  Idempotent : si les 4 sources sont déjà là, on ne recopie pas ;
   *  un fichier manquant entraîne une recopie fichier-à-fichier,
   *  les autres étant conservés.
   *  Le corpus de travail référence ensuite ces fichiers, zéro copie. */
  ipcMain.handle('demo:copierSources', (_e, racine: string) => {
    const complet =
      CLEFS_SOURCES.every((k) => existsSync(join(racine, 'srt', `${k}.srt`))) &&
      CLEFS_SOURCES.every((k) => existsSync(join(racine, 'audio', `${k}.mp3`)))
    if (complet) return
    cpSync(cheminCorpusTest(), racine, { recursive: true })
  })
  /** Lit un fichier texte des sources (ex. `srt/1Coordinatrice.srt`) → { nom, contenu }.
   *  Racine paramétrable (les sources sont matérialisées, plus bundled). */
  ipcMain.handle('demo:lireSource', (_e, racine: string, rel: string) => {
    const abs = join(racine, rel)
    return { nom: basename(abs), contenu: readFileSync(abs, 'utf8') }
  })
  /** Chemin ABSOLU d'un média des sources (ex. `audio/E2.mp3`) — passé tel quel
   *  à `corpus:assignerAudio` qui le RÉFÉRENCE (plus de copie). */
  ipcMain.handle('demo:cheminAudio', (_e, racine: string, rel: string) => join(racine, rel))

  /** Mémoire démo persistée dans `settings.json` (niveau profil).
   *  Lit les dossiers mémorisés et leur présence réelle sur disque ;
   *  `null` = jamais préparé (ou enregistrement corrompu).
   *  La modale adapte ses questions : une réponse déjà en place est sautée. */
  ipcMain.handle('demo:etat', (): EtatDemoComplet | null => {
    const d = lireSettings().demo
    if (!d) return null
    return {
      racineSources: d.racineSources,
      corpusPasAPas: d.corpusPasAPas,
      corpusAutonomie: d.corpusAutonomie,
      sourcesExist: existsSync(d.racineSources),
      corpusPasAPasExist: !!d.corpusPasAPas && existsSync(d.corpusPasAPas),
      corpusAutonomieExist: !!d.corpusAutonomie && existsSync(d.corpusAutonomie),
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
  /** Garde de la modale : on n'écrase jamais un corpus existant ;
   *  le dossier choisi ne doit donc pas contenir de `corpus.json`,
   *  ni être le corpus de l'autre mode. */
  ipcMain.handle('demo:verifierCorpus', (_e, dir: string) => ({
    dejaCorpus: existsSync(join(dir, 'corpus.json')),
  }))
}

// ── Migration SonalPi V1 → V2 : lecture et aperçu d'un `.crp` ──
// Choix d'un `.crp` : dialogue natif (filtre crp), lecture + détection
// d'encodage (chardet + iconv-lite, comme la V1 — `src/main/encodage.ts`),
// puis analyse PUR côté `shared/corpus/migrationCrp.ts`. À ce stade le main ne
// fait que LIRE : l'aperçu est affiché avant toute écriture.
function enregistrerIpcMigration(): void {
  ipcMain.handle('migrer:choisirCrp', async (e) => {
    const r = await montrerOuvrir(e, {
      properties: ['openFile'],
      filters: [{ name: 'Corpus SonalPi (V1)', extensions: ['crp'] }],
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
  /** Lit le `.Sonal` d'un entretien V1. `null` = absent/manquant. */
  ipcMain.handle('migrer:lireSonal', (_e, cheminCrp: string, rtrPath: string | null) => {
    if (!rtrPath) return null
    const abs = join(dirname(cheminCrp), rtrPath)
    if (!existsSync(abs)) return null
    return { nom: basename(abs), contenu: decoderCrp(readFileSync(abs)) }
  })
}

app.whenReady().then(() => {
  enregistrerIpcCorpus()
  enregistrerIpcDemo()
  enregistrerIpcMigration()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
