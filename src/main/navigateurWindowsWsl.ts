import { execFile } from 'node:child_process'
import { platform, release } from 'node:os'
import { isAbsolute } from 'node:path'

/** WSL utilise le navigateur Windows plutôt que les associations de fichiers Linux. */
export function estSousWsl(): boolean {
  return platform() === 'linux'
    && (!!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP || /microsoft/i.test(release()))
}

function executer(programme: string, argumentsProgramme: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(programme, argumentsProgramme, {
      encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true,
    }, (erreur, sortie) => {
      if (erreur) reject(erreur)
      else resolve(sortie)
    })
  })
}

function chainePowerShell(texte: string): string {
  return `'${texte.replaceAll("'", "''")}'`
}

function lancerWindows(script: string): Promise<string> {
  const commande = Buffer.from(`$ErrorActionPreference = 'Stop'\n${script}`, 'utf16le').toString('base64')
  return executer('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', commande])
}

/** Le chemin Windows est converti en URI pour conserver accents et caractères spéciaux. */
export async function ouvrirPageLocaleWindows(chemin: string): Promise<void> {
  if (!isAbsolute(chemin)) throw new Error('Le chemin de la page doit être absolu.')
  const cheminWindows = (await executer('wslpath', ['-w', chemin])).trim()
  if (!cheminWindows) throw new Error('Le chemin Windows de la page est indisponible.')
  await lancerWindows(`$adresse = ([System.Uri]::new(${chainePowerShell(cheminWindows)})).AbsoluteUri\nStart-Process -FilePath $adresse`)
}

/** Les liens web restent dans le navigateur habituel de Windows, jamais dans Electron. */
export async function ouvrirSiteWindows(adresse: string): Promise<void> {
  const url = new URL(adresse)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Adresse web non autorisée.')
  await lancerWindows(`Start-Process -FilePath ${chainePowerShell(url.href)}`)
}
