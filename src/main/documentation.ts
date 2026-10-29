import { app, dialog, shell } from 'electron'
import { join } from 'node:path'
import { URL_KIT_PEDAGOGIQUE } from '../shared/ressourcesPedagogiques'
import { estSousWsl, ouvrirPageLocaleWindows, ouvrirSiteWindows } from './navigateurWindowsWsl'

/** Ouvre le kit externe sans autoriser la navigation du renderer vers le site. */
export async function ouvrirKitPedagogique(): Promise<void> {
  try {
    if (estSousWsl()) await ouvrirSiteWindows(URL_KIT_PEDAGOGIQUE)
    else await shell.openExternal(URL_KIT_PEDAGOGIQUE)
  } catch {
    dialog.showErrorBox(
      'Site indisponible',
      'Le kit pédagogique n’a pas pu être ouvert. Essayez d’ouvrir son adresse directement dans votre navigateur.',
    )
  }
}

/** Ouvre les pages locales avec l’application habituelle du poste pour le HTML. */
export async function ouvrirDocumentation(entree: 'guide' | 'faq'): Promise<void> {
  const racine = app.isPackaged
    ? join(process.resourcesPath, 'documentation')
    : join(app.getAppPath(), 'docs/user')
  const page = entree === 'faq' ? 'faq/premiers-pas.html' : 'index.html'
  try {
    const chemin = join(racine, page)
    if (estSousWsl()) await ouvrirPageLocaleWindows(chemin)
    else {
      const erreur = await shell.openPath(chemin)
      if (erreur) throw new Error(erreur)
    }
  } catch {
    dialog.showErrorBox(
      'Documentation indisponible',
      estSousWsl()
        ? 'Les pages d’aide n’ont pas pu être ouvertes dans le navigateur Windows. Vérifiez que les applications Windows sont accessibles depuis votre environnement de travail, puis réessayez.'
        : 'Les pages d’aide n’ont pas pu être ouvertes. Vérifiez qu’une application est associée aux fichiers HTML sur votre ordinateur.',
    )
  }
}
