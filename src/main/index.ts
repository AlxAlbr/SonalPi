import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { CorpusStore } from './corpusStore'
import type { Categorie, CibleValeur, PatchCategorie, PayloadEntretien, Variable } from '../shared/format'

// --- Réglages du profil : liste des corpus récents (S2 inc. 2) ---
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

// Honore --user-data-dir aussi pour app.getPath('userData') (les e2e isolent
// chaque test par ce switch).
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
  // Dossier de corpus par défaut = <profil>/corpus (les e2e l'isolent via
  // --user-data-dir). Le `store` est MUTABLE : « Ouvrir un corpus… » le recrée
  // sur un autre dossier (S2 inc. 2). Les handlers capturent la variable `store`
  // (pas sa valeur) → ils voient la réaffectation sans être réenregistrés.
  const dossierDefaut = join(app.getPath('userData'), 'corpus')
  let store = new CorpusStore(dossierDefaut)
  let dossierCourant = dossierDefaut

  /** Bascule sur un autre dossier de corpus, l'ouvre (amorce si vide) et le note
   *  dans les récents. Renvoie le contenu du corpus. */
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
  ipcMain.handle('corpus:creerEntretien', (_e, titre: string) => store.creerEntretien(titre))
  ipcMain.handle('corpus:renommerEntretien', (_e, id: string, titre: string) =>
    store.renommerEntretien(id, titre),
  )
  ipcMain.handle('corpus:supprimerEntretien', (_e, id: string) => store.supprimerEntretien(id))
  ipcMain.handle(
    'corpus:importer',
    (_e, titre: string, payload: PayloadEntretien, codebook: Categorie[], variables: Variable[]) =>
      store.importerEntretien(titre, payload, codebook, variables),
  )

  // Codebook (thèmes, étape 5)
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
  ipcMain.handle('corpus:usagesParCode', () => store.usagesParCode())
  ipcMain.handle('corpus:compterUsagesCode', (_e, code: string, exceptId?: string) =>
    store.compterUsagesCode(code, exceptId),
  )

  // Variables & modalités (EAV, étape 6)
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
  ipcMain.handle(
    'corpus:poserValeur',
    (_e, entretienId: string, cible: CibleValeur, idVar: string, idMod: string) =>
      store.poserValeur(entretienId, cible, idVar, idMod),
  )

  // Dialogs fichier : le parsing d'import se fait côté renderer (DOMParser) ; le
  // main ne fait que LIRE/ÉCRIRE le fichier choisi. En e2e, showOpenDialog /
  // showSaveDialog sont stubbés (electronApp.evaluate) pour piloter sans dialog.
  ipcMain.handle('dialog:choisirImport', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Entretien', extensions: ['sonal', 'srt', 'vtt', 'txt'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return { nom: basename(r.filePaths[0]), contenu: readFileSync(r.filePaths[0], 'utf8') }
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
