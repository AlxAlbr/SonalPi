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
import { ClientWebDAV } from './webdav/client'
import { profilerServeur } from './webdav/sondes'
import { MiroirWebDAV } from './miroir'
import { coffreReel, type ConfigCorpusDistant } from './distant/coffre'
import { SessionsDEntretien } from './distant/sessions'
import { decoderCrp } from './encodage'
import { analyserCrp } from '../shared/corpus/migrationCrp'
import type { DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
import type { Categorie, CibleValeur, EtatDemo, EtatDemoComplet, MarqueurDemo, PatchCategorie, PayloadEntretien, RegleAnon, Variable } from '../shared/format'
import type { DemandeConnexion, OuvertureDistante, ResultatTiragePublic } from '../shared/distant'

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

const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac']
const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'ogv', 'avi']
// Dialogue de média : audio + vidéo (les deux peuvent être assignés à un entretien).
const EXT_MEDIA = [...EXT_AUDIO, ...EXT_VIDEO]
const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']

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

// --- Réglages du profil : corpus récents + mémoire démo + largeur vidéo par corpus ---
interface Settings {
  recents: string[] // chemins de dossiers, le plus récent en tête
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

  // ── Corpus distant (plan-multiuser.md E0/E1) ───────────────────────────────
  // La connexion mesure le profil du serveur par sondes RÉELLES (préconditions
  // §5.4 + capabilities files_lock §8) AVANT d'enregistrer quoi que ce soit ;
  // un serveur qui ment est refusé. Le secret (mot de passe d'application)
  // vit chiffré dans le coffre (safeStorage) et ne remonte jamais au renderer.
  const coffre = coffreReel(app.getPath('userData'))
  let miroirActif: { id: string; miroir: MiroirWebDAV } | null = null
  // Sessions d'écriture du corpus distant actif (E1) : verrous, battements,
  // publications. Null tant qu'aucun corpus distant n'est ouvert.
  let sessions: SessionsDEntretien | null = null
  // Identité de session (§7) : machineId stable par poste (généré une fois,
  // stocké dans le profil) ; sessionId aléatoire par lancement d'app (voir
  // SESSION_ID plus bas) — un verrou n'est jamais hérité d'une session précédente.
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
    miroirActif = null // corpus local : plus de pull
    dossierCourant = dir
    const corpus = store.ouvrir() // amorce si le dossier est neuf
    ajouterRecent(dir)
    return { dir, nom: basename(dir), corpus }
  }

  ipcMain.handle('corpus:ouvrir', () => store.ouvrir())
  /** Indicateur pour l'UI : le corpus courant est-il un miroir distant ?
   *  (`distant` = id du compte, null = corpus local — invariant §15.1 : une
   *  capacité signalée, jamais un type de transport dispatché.) */
  ipcMain.handle('corpus:dossierCourant', () => {
    const corpus = store.ouvrir()
    return {
      dir: dossierCourant,
      nom: corpus.nom ?? basename(dossierCourant),
      distant: miroirActif?.id ?? null,
    }
  })
  ipcMain.handle('corpus:recents', () => {
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
    return vivants.map((dir) => ({ dir, nom: basename(dir) }))
  })
  ipcMain.handle('corpus:retirerRecent', (_e, dir: string) => {
    retirerRecent(dir)
    return lireSettings().recents.map((d) => ({ dir: d, nom: basename(d) }))
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
    miroirActif = null
    dossierCourant = dir
    let corpus = store.ouvrir() // amorce si neuf
    if (frais && nom && nom.trim()) corpus = store.poserNom(nom.trim())
    ajouterRecent(dir)
    return { dir, nom: corpus.nom ?? basename(dir), corpus }
  })
  // Session id aléatoire PAR LANCEMENT (portée du bloc corpus entier).
  const SESSION_ID = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  /** Ouverture d'un entretien : en corpus DISTANT, tente d'abord le VERROU
   *  (§4.1). Acquis → écriture permise pour ce fichier (flux A) ; refusé →
   *  lecture seule avec détenteur affiché. En corpus local : inchangé. */
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

  /** Fermeture §4.4 : publication finale PUIS libération (ordre invariant).
   *  Appelé par le renderer quand il quitte l'entretien ; sans effet local. */
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
  ipcMain.handle('corpus:creerEntretienVide', (_e, titre: string) => store.creerEntretienVide(titre))
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    store.renommerEntretien(id, titre),
  )
  ipcMain.handle('corpus:supprimerEntretien', (_e, id: string) => store.supprimerEntretien(id))
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[], reglesAnon: RegleAnon[]) =>
      store.importerEntretien(titre, payload, codebook, variables, reglesAnon),
  )

  // Codebook (thèmes)
  ipcMain.handle('corpus:ajouterCategorie', (_e, nom: string, parent: string | null) =>
    store.ajouterCategorie(nom, parent),
  )
  ipcMain.handle('corpus:modifierCategorie', (_e, id: string, patch: PatchCategorie) =>
    store.modifierCategorie(id, patch),
  )
  ipcMain.handle('corpus:deplacerCategorie', (_e, id: string, sens: -1 | 1) =>
    store.deplacerCategorie(id, sens),
  )
  ipcMain.handle('corpus:supprimerCategorie', (_e, id: string, exceptId?: string) =>
    store.supprimerCategorie(id, exceptId),
  )
  ipcMain.handle('corpus:usagesParCategorie', () => store.usagesParCategorie())
  ipcMain.handle('corpus:resumesThematiques', () => store.resumesThematiques())
  ipcMain.handle('corpus:reglesAnon', () => store.reglesAnon())
  ipcMain.handle('corpus:scanAnon', () => store.scanAnon())
  ipcMain.handle('corpus:regleAnonParEntite', (_e, entite: string) => store.regleAnonParEntite(entite))
  ipcMain.handle('corpus:regleAnonCreer', (_e, entite: string, pseudos: string[]) =>
    store.regleAnonCreer(entite, pseudos),
  )
  ipcMain.handle('corpus:regleAnonAjouterPseudo', (_e, id: string, pseudo: string) =>
    store.regleAnonAjouterPseudo(id, pseudo),
  )
  ipcMain.handle('corpus:regleAnonUtiliseeAilleurs', (_e, id: string, exceptId?: string) =>
    store.regleAnonUtiliseeAilleurs(id, exceptId),
  )
  ipcMain.handle('corpus:regleAnonSupprimer', (_e, id: string) => store.regleAnonSupprimer(id))
  ipcMain.handle('corpus:appliquerRegleAnon', (_e, entretienId: string, regleId: string) =>
    store.appliquerRegleAnon(entretienId, regleId),
  )
  ipcMain.handle('corpus:compterUsagesCategorie', (_e, code: string, exceptId?: string) =>
    store.compterUsagesCategorie(code, exceptId),
  )

  // Variables & modalités (EAV)
  ipcMain.handle('corpus:ajouterVariable', (_e, lib: string, portee: 'entretien' | 'locuteur') =>
    store.ajouterVariable(lib, portee),
  )
  ipcMain.handle('corpus:modifierVariable', (_e, id: string, patch: Partial<Variable>) =>
    store.modifierVariable(id, patch),
  )
  ipcMain.handle('corpus:supprimerVariable', (_e, id: string) => store.supprimerVariable(id))
  ipcMain.handle('corpus:ajouterModalite', (_e, idVar: string, lib: string) =>
    store.ajouterModalite(idVar, lib),
  )
  ipcMain.handle('corpus:modifierModalite', (_e, idVar: string, idMod: string, lib: string) =>
    store.modifierModalite(idVar, idMod, lib),
  )
  ipcMain.handle('corpus:supprimerModalite', (_e, idVar: string, idMod: string) =>
    store.supprimerModalite(idVar, idMod),
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
  ipcMain.handle('corpus:audios', () => store.audios())
  ipcMain.handle('corpus:verifierAudios', () => store.verifierAudios())
  // Marqueur de corpus de TEST (`corpus.json: { demo }`) — identité + mode +
  // sources + étapes validées. Champ additif optionnel, pas de bump de version.
  ipcMain.handle('corpus:marquerDemo', (_e, marqueur: MarqueurDemo) =>
    store.marquerDemo(marqueur),
  )

  // ── Corpus distant : connexion et ouverture (E0) ──────────────────────────
  const sansSecret = ({ motDePasseChiffre: _s, ...c }: ConfigCorpusDistant) => c

  ipcMain.handle('distant:lister', () => coffre.lister().map(sansSecret))

  ipcMain.handle('distant:oublier', (_e, id: string) => {
    if (miroirActif?.id === id) {
      miroirActif = null
      sessions = null
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

  /** Ouvre un corpus distant EN LECTURE contrôlée (E1) : tire le miroir puis
   *  bascule le store dessus ; chaque entretien s'ouvre ensuite SOUS VERROU
   *  (corpus:lireEntretien). Échec réseau → exception IPC, le corpus local
   *  courant reste en place. */
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
    const miroir = new MiroirWebDAV(client, dirMiroir)
    await miroir.tirer()
    // Garde : un dossier distant SANS corpus.json ne doit pas être amorcé
    // localement (l'amorce écrirait dans un miroir en lecture seule).
    if (!existsSync(join(dirMiroir, 'corpus.json'))) {
      throw new Error(
        "Le dossier distant ne contient pas de corpus.json — ce n'est pas (encore) un corpus Sonal.",
      )
    }
    store = new CorpusStore(dirMiroir)
    // Définitions (flux B) TOUJOURS en lecture seule avant E3 ; le contenu des
    // entretiens (flux A) devient écrivable fichier par fichier sous verrou.
    store.lectureSeule = true
    dossierCourant = dirMiroir
    miroirActif = { id, miroir }
    sessions = new SessionsDEntretien(
      client,
      miroir,
      () => ({ userId: config.utilisateur, machineId, sessionId: SESSION_ID }),
      (idRetire) => store.revoquerEcritureEntretien(idRetire),
    )
    const corpus = store.ouvrir()
    return {
      dir: dirMiroir,
      nom: corpus.nom ?? basename(config.urlServeur),
      corpus,
      distant: { id, urlServeur: config.urlServeur, utilisateur: config.utilisateur },
    }
  })

  /** « Actualiser » / pull doux : null si le corpus courant est local. */
  ipcMain.handle('distant:tirer', async (): Promise<ResultatTiragePublic | null> => {
    if (!miroirActif) return null
    const t = await miroirActif.miroir.tirer()
    return { telecharges: t.telecharges, corbeille: t.corbeille, verrous: t.verrous, date: t.date }
  })

  /** Migration SonalPi V1 → V2 — EXÉCUTION : crée le corpus V2 dans le dossier
   *  dédié (nom + meta.sourceV1 + fusion), ajoute aux récents et BASCULE le
   *  store dessus (même mécanique que changerDossier). */
  ipcMain.handle('migrer:executer', (_e, req: DemandeMigration) => {
    store = new CorpusStore(req.dossier)
    store.lectureSeule = false // corpus local : écritures permises
    sessions = null
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

// ── Migration SonalPi V1 → V2 (plan-migration.md, E0 : lecture + aperçu) ──
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
   *  PRÉ-REMPLI `Documents/Sonal/<nom>` — le nom du corpus (D2), modifiable. */
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
  /** Lit le `.Sonal` d'un entretien V1 (E2). `null` = absent/manquant. */
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
