import type { ElectronApplication } from '@playwright/test'

interface OuverturesAide {
  fichiers: string[]
  sites: string[]
  scriptsWindows: string[]
}

/** Capture la délégation au navigateur sans ouvrir de fenêtres pendant la recette. */
export async function intercepterOuverturesAide(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const ouvertures = { fichiers: [] as string[], sites: [] as string[], scriptsWindows: [] as string[] }
    ;(globalThis as any).__ouverturesAide = ouvertures
    shell.openPath = async (chemin) => { ouvertures.fichiers.push(chemin); return '' }
    shell.openExternal = async (url) => { ouvertures.sites.push(url) }
    const outils = process.getBuiltinModule('node:child_process')
    const original = outils.execFile
    outils.execFile = ((...parametres: unknown[]) => {
      const [programme, argumentsProgramme, , callback] = parametres
      if (Array.isArray(argumentsProgramme) && typeof callback === 'function') {
        if (programme === 'wslpath') {
          ouvertures.fichiers.push(String(argumentsProgramme[1]))
          callback(null, '\\\\wsl.localhost\\Ubuntu\\SonalPi-test\\index.html\r\n', '')
          return {}
        }
        if (programme === 'powershell.exe') {
          const script = Buffer.from(String(argumentsProgramme.at(-1)), 'base64').toString('utf16le')
          ouvertures.scriptsWindows.push(script)
          const adresse = /Start-Process -FilePath '((?:[^']|'')*)'/.exec(script)?.[1]
          if (adresse) ouvertures.sites.push(adresse.replaceAll("''", "'"))
          callback(null, '', '')
          return {}
        }
      }
      return Reflect.apply(original, outils, parametres)
    }) as typeof outils.execFile
  })
}

export function lireOuverturesAide(app: ElectronApplication): Promise<OuverturesAide> {
  return app.evaluate(() => (globalThis as any).__ouverturesAide)
}
