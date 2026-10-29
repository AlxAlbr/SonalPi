import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const systeme = vi.hoisted(() => ({ plateforme: vi.fn(), version: vi.fn(), executer: vi.fn() }))
vi.mock('node:os', () => ({ platform: systeme.plateforme, release: systeme.version }))
vi.mock('node:child_process', () => ({ execFile: systeme.executer }))
import { estSousWsl, ouvrirPageLocaleWindows, ouvrirSiteWindows } from '../src/main/navigateurWindowsWsl'

beforeEach(() => {
  vi.stubEnv('WSL_DISTRO_NAME', '')
  vi.stubEnv('WSL_INTEROP', '')
  systeme.plateforme.mockReturnValue('linux')
  systeme.version.mockReturnValue('6.8.0-generic')
  systeme.executer.mockReset().mockImplementation((programme, _args, _options, callback) => {
    callback(null, programme === 'wslpath' ? '\\\\wsl.localhost\\Ubuntu\\SonalPi\\index.html\r\n' : '', '')
  })
})
afterEach(() => vi.unstubAllEnvs())

function scriptExecute(): string {
  const appel = systeme.executer.mock.calls.find(([programme]) => programme === 'powershell.exe')!
  expect(appel[1].slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
  expect(appel[2]).toMatchObject({ timeout: 10_000, windowsHide: true })
  return Buffer.from(appel[1][4], 'base64').toString('utf16le')
}

test('un Linux ordinaire n’est pas identifié comme WSL', () => {
  expect(estSousWsl()).toBe(false)
})
test.each(['WSL_DISTRO_NAME', 'WSL_INTEROP'])('détecte WSL par %s', (cle) => {
  vi.stubEnv(cle, 'présent')
  expect(estSousWsl()).toBe(true)
})
test('détecte aussi le noyau Microsoft lorsque les variables WSL manquent', () => {
  systeme.version.mockReturnValue('6.6.87.2-microsoft-standard-WSL2')
  expect(estSousWsl()).toBe(true)
})
test.each(['win32', 'darwin'])('ne détourne pas l’ouverture native sur %s', (plateforme) => {
  systeme.plateforme.mockReturnValue(plateforme)
  vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu')
  expect(estSousWsl()).toBe(false)
})

test('convertit le chemin Linux puis délègue une URI au navigateur Windows', async () => {
  await ouvrirPageLocaleWindows('/home/moi/SonalPi/docs/user/index.html')
  expect(systeme.executer.mock.calls[0].slice(0, 2)).toEqual(['wslpath', ['-w', '/home/moi/SonalPi/docs/user/index.html']])
  const script = scriptExecute()
  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain("([System.Uri]::new('\\\\wsl.localhost\\Ubuntu\\SonalPi\\index.html')).AbsoluteUri")
  expect(script).toContain('Start-Process -FilePath $adresse')
})

test('espaces, accents et apostrophes restent des données et non des commandes', async () => {
  const cheminWindows = "C:\\Mon enquête & dossier 'test' $() ; #\\guide.html"
  systeme.executer.mockImplementation((programme, _args, _options, callback) => callback(null, programme === 'wslpath' ? cheminWindows + '\n' : '', ''))
  await ouvrirPageLocaleWindows("/mnt/c/Mon enquête & dossier 'test' $() ; #/guide.html")
  const script = scriptExecute()
  expect(script).toContain("'C:\\Mon enquête & dossier ''test'' $() ; #\\guide.html'")
  expect(script).not.toContain('-Command')
  expect(systeme.executer.mock.calls.every(([, , options]) => !options.shell)).toBe(true)
})

test('le kit web n’a pas besoin de conversion de chemin', async () => {
  await ouvrirSiteWindows('https://logiquali-41533a.gitpages.huma-num.fr/')
  expect(systeme.executer).toHaveBeenCalledTimes(1)
  expect(scriptExecute()).toContain("Start-Process -FilePath 'https://logiquali-41533a.gitpages.huma-num.fr/'")
})

test.each(['file:///C:/test.exe', 'javascript:alert(1)'])('refuse un lien qui n’est pas un site web (%s)', async (url) => {
  await expect(ouvrirSiteWindows(url)).rejects.toThrow('non autorisée')
  expect(systeme.executer).not.toHaveBeenCalled()
})
test('refuse un chemin relatif avant de lancer un programme', async () => {
  await expect(ouvrirPageLocaleWindows('-autre.html')).rejects.toThrow('absolu')
  expect(systeme.executer).not.toHaveBeenCalled()
})
test('ne lance rien si la conversion de chemin est vide', async () => {
  systeme.executer.mockImplementation((_programme, _args, _options, callback) => callback(null, '\r\n', ''))
  await expect(ouvrirPageLocaleWindows('/guide.html')).rejects.toThrow('indisponible')
  expect(systeme.executer).toHaveBeenCalledTimes(1)
})
test.each(['wslpath', 'powershell.exe'])('propage un échec de %s pour l’expliquer au lecteur', async (commande) => {
  systeme.executer.mockImplementation((programme, _args, _options, callback) => {
    callback(programme === commande ? new Error('programme indisponible') : null, '\\\\wsl.localhost\\Ubuntu\\guide.html', '')
  })
  await expect(ouvrirPageLocaleWindows('/guide.html')).rejects.toThrow('programme indisponible')
})
