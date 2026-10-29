import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'

const electron = vi.hoisted(() => ({
  app: { isPackaged: false, getAppPath: () => '/sonalpi' },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  dialog: { showErrorBox: vi.fn() },
}))
vi.mock('electron', () => electron)
const wsl = vi.hoisted(() => ({ actif: false, ouvrirPage: vi.fn(), ouvrirSite: vi.fn() }))
vi.mock('../src/main/navigateurWindowsWsl', () => ({
  estSousWsl: () => wsl.actif, ouvrirPageLocaleWindows: wsl.ouvrirPage, ouvrirSiteWindows: wsl.ouvrirSite,
}))
import { ouvrirDocumentation, ouvrirKitPedagogique } from '../src/main/documentation'

describe('ouverture des aides', () => {
  beforeEach(() => {
    electron.app.isPackaged = false
    electron.shell.openPath.mockReset().mockResolvedValue('')
    electron.shell.openExternal.mockReset().mockResolvedValue(undefined)
    electron.dialog.showErrorBox.mockClear()
    wsl.actif = false
    wsl.ouvrirPage.mockReset().mockResolvedValue(undefined)
    wsl.ouvrirSite.mockReset().mockResolvedValue(undefined)
  })

  test('le kit pédagogique ouvre uniquement l’adresse prévue dans le navigateur', async () => {
    await ouvrirKitPedagogique()
    expect(electron.shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://logiquali-41533a.gitpages.huma-num.fr/')
    expect(electron.shell.openPath).not.toHaveBeenCalled()
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled()
  })

  test('un refus du navigateur pour le kit est expliqué sans rejet non traité', async () => {
    electron.shell.openExternal.mockRejectedValue(new Error('navigateur indisponible'))
    await expect(ouvrirKitPedagogique()).resolves.toBeUndefined()
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith('Site indisponible', expect.stringContaining('votre navigateur'))
  })

  test('le guide et la FAQ ouvrent les fichiers du projet en développement', async () => {
    await ouvrirDocumentation('guide')
    await ouvrirDocumentation('faq')
    expect(electron.shell.openPath.mock.calls).toEqual([
      [join('/sonalpi', 'docs/user/index.html')],
      [join('/sonalpi', 'docs/user/faq/premiers-pas.html')],
    ])
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled()
  })

  test('sous WSL, guide, FAQ et kit passent par le navigateur Windows', async () => {
    wsl.actif = true
    await ouvrirDocumentation('guide')
    await ouvrirDocumentation('faq')
    await ouvrirKitPedagogique()
    expect(wsl.ouvrirPage.mock.calls).toEqual([
      [join('/sonalpi', 'docs/user/index.html')], [join('/sonalpi', 'docs/user/faq/premiers-pas.html')],
    ])
    expect(wsl.ouvrirSite).toHaveBeenCalledWith('https://logiquali-41533a.gitpages.huma-num.fr/')
    expect(electron.shell.openPath).not.toHaveBeenCalled()
    expect(electron.shell.openExternal).not.toHaveBeenCalled()
  })

  test('un échec WSL explique que le navigateur Windows n’a pas pu ouvrir l’aide', async () => {
    wsl.actif = true
    wsl.ouvrirPage.mockRejectedValue(new Error('interop indisponible'))
    await expect(ouvrirDocumentation('guide')).resolves.toBeUndefined()
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith('Documentation indisponible', expect.stringContaining('navigateur Windows'))
    expect(electron.shell.openPath).not.toHaveBeenCalled()
  })

  test('une ouverture refusée est expliquée sans afficher de détail technique', async () => {
    electron.shell.openPath.mockResolvedValue('Erreur du système')
    await ouvrirDocumentation('guide')
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
      'Documentation indisponible', expect.stringContaining('fichiers HTML'),
    )
  })

  test('une exception du système ne devient pas un rejet non traité', async () => {
    electron.shell.openPath.mockRejectedValue(new Error('indisponible'))
    await expect(ouvrirDocumentation('faq')).resolves.toBeUndefined()
    expect(electron.dialog.showErrorBox).toHaveBeenCalledOnce()
  })
})

describe('site documentaire statique', () => {
  const racine = join(process.cwd(), 'docs/user')
  const pages = readdirSync(racine, { recursive: true })
    .filter((nom): nom is string => typeof nom === 'string' && nom.endsWith('.html'))

  test('les pages, ancres, illustrations et styles se consultent sans serveur', () => {
    expect(pages).toEqual(expect.arrayContaining(['index.html', join('faq', 'premiers-pas.html')]))
    const fenetre = new Window({ settings: {
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      disableJavaScriptEvaluation: true,
    } })
    try {
      const parser = new fenetre.DOMParser()
      for (const nom of pages) {
        const chemin = join(racine, nom)
        const document = parser.parseFromString(readFileSync(chemin, 'utf8'), 'text/html')
        expect(document.documentElement.lang, nom).toBe('fr')
        expect(document.querySelectorAll('h1'), nom).toHaveLength(1)
        expect(document.querySelector('title')?.textContent, nom).toContain('SonalPi')
        expect(document.querySelector('script, iframe'), nom).toBeNull()
        const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
        expect(new Set(ids).size, nom).toBe(ids.length)
        for (const element of document.querySelectorAll('[href], [src]')) {
          const cible = element.getAttribute('href') ?? element.getAttribute('src')!
          const url = new URL(cible, pathToFileURL(chemin))
          expect(url.protocol, `${nom} → ${cible}`).toBe('file:')
          const contenu = readFileSync(fileURLToPath(url))
          if (url.hash) {
            const destination = parser.parseFromString(contenu.toString('utf8'), 'text/html')
            expect(destination.getElementById(decodeURIComponent(url.hash.slice(1))), `${nom} → ${cible}`).not.toBeNull()
          }
          if (element.tagName === 'IMG') expect(element.getAttribute('alt'), nom).toBeTruthy()
        }
      }
      expect(readFileSync(join(racine, 'style.css'), 'utf8')).not.toMatch(/@import|url\(/i)
    } finally {
      fenetre.happyDOM.abort()
      fenetre.close()
    }
  })
})
