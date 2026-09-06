import type { WebContents, WebPreferences } from 'electron'

/** Préférences qui isolent le renderer du processus principal. */
export function preferencesRenderer(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  }
}

/** Empêche le contenu du renderer de quitter l'interface de l'application. */
export function securiserNavigation(webContents: WebContents): void {
  webContents.on('will-navigate', (evenement) => evenement.preventDefault())
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
