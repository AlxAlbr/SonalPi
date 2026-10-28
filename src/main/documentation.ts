import { app, dialog, shell } from 'electron'
import { join } from 'node:path'

/** Ouvre les pages locales avec l’application habituelle du poste pour le HTML. */
export async function ouvrirDocumentation(entree: 'guide' | 'faq'): Promise<void> {
  const racine = app.isPackaged
    ? join(process.resourcesPath, 'documentation')
    : join(app.getAppPath(), 'docs/user')
  const page = entree === 'faq' ? 'faq/premiers-pas.html' : 'index.html'
  try {
    const erreur = await shell.openPath(join(racine, page))
    if (erreur) throw new Error(erreur)
  } catch {
    dialog.showErrorBox(
      'Documentation indisponible',
      'Les pages d’aide n’ont pas pu être ouvertes. Vérifiez qu’une application est associée aux fichiers HTML sur votre ordinateur.',
    )
  }
}
