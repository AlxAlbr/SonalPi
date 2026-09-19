import { Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { EntreeRecent } from '../shared/format'

/** Menu applicatif de l'app (parité SonalPi1, sans le volet GitLab) :
 *  Corpus (ouvrir, récents, distant, enregistrer, copie de sauvegarde ZIP,
 *  export du corpus, quitter),
 *  Édition (rôles standards : copier/coller indispensables à l'éditeur),
 *  Entretiens (ajouter et trier).
 *  Les items ne font RIEN eux-mêmes : ils émettent `menu:action` (ou
 *  `menu:ouvrirRecent` avec l'entrée récente) vers les renderers, qui routent
 *  vers les modales et actions existantes. Reconstruit à chaque changement
 *  des récents, qui peuplent le sous-menu dynamique. */
export function appliquerMenu(recents: EntreeRecent[]): void {
  const envoyer = (canal: string, ...args: unknown[]): void => {
    for (const fenetre of BrowserWindow.getAllWindows()) {
      fenetre.webContents.send(canal, ...args)
    }
  }

  const menuCorpus: MenuItemConstructorOptions = {
    label: 'Corpus',
    submenu: [
      {
        label: 'Nouveau corpus…',
        accelerator: 'CmdOrCtrl+N',
        click: () => envoyer('menu:action', 'nouveau-corpus'),
      },
      {
        label: 'Ouvrir corpus…',
        accelerator: 'CmdOrCtrl+O',
        click: () => envoyer('menu:action', 'ouvrir-corpus'),
      },
      {
        label: 'Corpus récents',
        submenu: recents.length
          ? recents.map((recent): MenuItemConstructorOptions => ({
              label: `${recent.type === 'distant' ? '🌐 ' : ''}${recent.nom}`,
              click: () => envoyer('menu:ouvrirRecent', recent),
            }))
          : [{ label: 'Aucun fichier récent', enabled: false }],
      },
      {
        label: 'Ouvrir un corpus distant…',
        click: () => envoyer('menu:action', 'ouvrir-distant'),
      },
      { type: 'separator' },
      {
        label: 'Enregistrer',
        click: () => envoyer('menu:action', 'enregistrer'),
      },
      { type: 'separator' },
      {
        label: 'Faire une copie de sauvegarde du corpus (ZIP)…',
        click: () => envoyer('menu:action', 'sauvegarde-zip'),
      },
      {
        label: 'Exporter le corpus…',
        click: () => envoyer('menu:action', 'exporter-corpus'),
      },
      { type: 'separator' },
      { label: 'Quitter', role: 'quit' },
    ],
  }

  const menuEdition: MenuItemConstructorOptions = {
    label: 'Édition',
    submenu: [
      { role: 'undo', label: 'Annuler' },
      { role: 'redo', label: 'Rétablir' },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' },
      { role: 'copy', label: 'Copier' },
      { role: 'paste', label: 'Coller' },
      { role: 'selectAll', label: 'Tout sélectionner' },
    ],
  }

  const menuEntretiens: MenuItemConstructorOptions = {
    label: 'Entretiens',
    submenu: [
      {
        label: 'Ajouter un entretien…',
        click: () => envoyer('menu:action', 'ajouter-entretien'),
      },
      {
        label: 'Trier les entretiens',
        submenu: [
          {
            label: 'Par ordre alphabétique',
            click: () => envoyer('menu:action', 'trier-entretiens', 'alpha'),
          },
          {
            label: 'Par ordre d’ajout',
            click: () => envoyer('menu:action', 'trier-entretiens', 'ajout'),
          },
          {
            label: 'Par date de modification',
            click: () => envoyer('menu:action', 'trier-entretiens', 'modif'),
          },
          {
            label: 'Par longueur',
            click: () => envoyer('menu:action', 'trier-entretiens', 'longueur'),
          },
        ],
      },
    ],
  }

  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          // macOS exige un menu d'application en première position.
          { role: 'appMenu' as const },
          menuCorpus,
          menuEdition,
          menuEntretiens,
        ]
      : [menuCorpus, menuEdition, menuEntretiens]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
