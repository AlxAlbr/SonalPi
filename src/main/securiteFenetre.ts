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

/** Préférences de la fenêtre d'impression PDF : le HTML exporté provient de
 *  données importées (jamais de confiance) — la fenêtre est sandboxée, sans
 *  JavaScript (le script player est inutile à l'impression), et la navigation
 *  comme l'ouverture de fenêtres y sont refusées. */
export function preferencesImpressionPdf(): WebPreferences {
  return {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    javascript: false,
    webSecurity: true,
  }
}
