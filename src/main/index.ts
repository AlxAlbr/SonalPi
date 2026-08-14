import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join, basename, extname } from 'node:path'
import { readFileSync, writeFileSync, createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { CorpusStore } from './corpusStore'
import type { Categorie, CibleValeur, PatchCategorie, PayloadEntretien, Variable } from '../shared/format'

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

const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm']
const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']

// png : pour la forme d'onde (renderer → main → fichier corpus/audio/<id>.png)
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  png: 'image/png',
}

// --- Réglages du profil : liste des corpus récents ---
interface Settings {
  recents: string[] // chemins de dossiers, le plus récent en tête
}
function fichierSettings(): string {
  return join(app.getPath('userData'), 'settings.json')
}
function lireSettings(): Settings {
  try {
    const s = JSON.parse(readFileSync(fichierSettings(), 'utf8')) as Partial<Settings>
    return { recents: Array.isArray(s.recents) ? s.recents : [] }
  } catch {
    return { recents: [] }
  }
}
function ajouterRecent(dir: string): void {
  const { recents } = lireSettings()
  const maj = [dir, ...recents.filter((d) => d !== dir)].slice(0, 8)
  writeFileSync(fichierSettings(), JSON.stringify({ recents: maj }, null, 2), 'utf8')
}
/** Retire un RACCOURCI de la liste des récents — le dossier de corpus sur disque
 *  n'est jamais touché (l'app n'efface aucun corpus). */
function retirerRecent(dir: string): void {
  const { recents } = lireSettings()
  writeFileSync(
    fichierSettings(),
    JSON.stringify({ recents: recents.filter((d) => d !== dir) }, null, 2),
    'utf8',
  )
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

  /** Bascule sur un autre dossier de corpus, l'ouvre (amorce si vide)
   * et le note dans les récents. Renvoie le contenu du corpus. */
  const changerDossier = (dir: string) => {
    store = new CorpusStore(dir)
    dossierCourant = dir
    const corpus = store.ouvrir() // amorce si le dossier est neuf
    ajouterRecent(dir)
    return { dir, nom: basename(dir), corpus }
  }

  ipcMain.handle('corpus:ouvrir', () => store.ouvrir())
  ipcMain.handle('corpus:dossierCourant', () => ({ dir: dossierCourant, nom: basename(dossierCourant) }))
  ipcMain.handle('corpus:recents', () =>
    lireSettings().recents.map((dir) => ({ dir, nom: basename(dir) })),
  )
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
  ipcMain.handle('corpus:lireEntretien', (_e, id: string) => store.lireEntretien(id))
  ipcMain.handle('corpus:ecrireEntretien', (_e, id: string, p: PayloadEntretien) =>
    store.ecrireEntretien(id, p),
  )
  ipcMain.handle('corpus:creerEntretienVide', (_e, titre: string) => store.creerEntretienVide(titre))
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    store.renommerEntretien(id, titre),
  )
  ipcMain.handle('corpus:supprimerEntretien', (_e, id: string) => store.supprimerEntretien(id))
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[]) =>
      store.importerEntretien(titre, payload, codebook, variables),
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

  // Audio : assignation (copie dans le dossier corpus), forme d'onde dérivée,
  // scan des médias.
  ipcMain.handle('corpus:assignerAudio', (_e, id: string, source: string) =>
    store.assignerAudio(id, source),
  )
  ipcMain.handle('corpus:ecrireWaveform', (_e, id: string, png: Uint8Array) =>
    store.ecrireWaveform(id, png),
  )
  ipcMain.handle('corpus:audios', () => store.audios())

  // sonal-media://corpus/audio/<fichier> → streame depuis le dossier de corpus
  // COURANT (le handler capture `store`, réaffecté par changerDossier). Support
  // des requêtes Range : l'élément <audio> de Chromium en dépend pour le seek.
  protocol.handle('sonal-media', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')
    const fichier = store.cheminMedia(rel)
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
    (_e, entretienId: string, cible: CibleValeur, idVar: string, idMod: string) =>
      store.poserValeur(entretienId, cible, idVar, idMod),
  )

  // Dialogs fichier : le parsing d'import se fait côté renderer (DOMParser) le
  // le main ne fait que LIRE/ÉCRIRE le fichier choisi. En e2e, showOpenDialog /
  // showSaveDialog sont stubbés (electronApp.evaluate) pour piloter sans dialog.
  // Modale « Ajouter un entretien » (à la SonalPi, ajout-entretien.html) :
  //  DEUX zones — celle-ci choisit le fichier d'ENTRETIEN (contenu lu ici, parsé côté
  // renderer) ; la zone son passe par dialog:choisirAudio (le main ne copie
  // l'audio qu'à corpus:assignerAudio, jamais lu en mémoire).
  ipcMain.handle('dialog:choisirTexte', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Entretien', extensions: EXT_TEXTE }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
  })
  // Zone son de la modale + « Assigner un audio… » sur la fiche entretien.
  ipcMain.handle('dialog:choisirAudio', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: EXT_AUDIO }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  ipcMain.handle('dialog:choisirExport', async (_e, nomSuggere: string, contenu: string) => {
    const r = await dialog.showSaveDialog({ defaultPath: nomSuggere })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, contenu, 'utf8')
    return r.filePath
  })
}

app.whenReady().then(() => {
  enregistrerIpcCorpus()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
