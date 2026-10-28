import { Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { EntreeRecent } from '../shared/format'
import { MENU_ACCUEIL, type EtatMenuApplication } from '../shared/menuApplication'

/** Les commandes de travail passent par le renderer.
 *  L’aide ouvre simplement les pages locales hors de l’application.
 *  Le menu suit l’écran de travail et les corpus récents.
 */
export function appliquerMenu(
  recents: EntreeRecent[],
  ouvrirAide?: (entree: 'guide' | 'faq') => void,
  etat: EtatMenuApplication = MENU_ACCUEIL,
): void {
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
        enabled: etat.naviguer,
        accelerator: 'CmdOrCtrl+N',
        click: () => envoyer('menu:action', 'nouveau-corpus'),
      },
      {
        label: 'Ouvrir corpus…',
        enabled: etat.naviguer,
        accelerator: 'CmdOrCtrl+O',
        click: () => envoyer('menu:action', 'ouvrir-corpus'),
      },
      {
        label: 'Corpus récents',
        enabled: etat.naviguer,
        submenu: recents.length
          ? recents.map((recent): MenuItemConstructorOptions => ({
              label: `${recent.type === 'distant' ? '🌐 ' : ''}${recent.nom}`,
              click: () => envoyer('menu:ouvrirRecent', recent),
            }))
          : [{ label: 'Aucun fichier récent', enabled: false }],
      },
      {
        label: 'Ouvrir un corpus distant…',
        enabled: etat.naviguer,
        click: () => envoyer('menu:action', 'ouvrir-distant'),
      },
      { type: 'separator' },
      {
        label: 'Enregistrer',
        enabled: etat.enregistrer,
        click: () => envoyer('menu:action', 'enregistrer'),
      },
      { type: 'separator' },
      {
        label: 'Faire une copie de sauvegarde du corpus (ZIP)…',
        enabled: etat.sauvegarder,
        click: () => envoyer('menu:action', 'sauvegarde-zip'),
      },
      {
        label: 'Exporter le corpus…',
        enabled: etat.exporter,
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
    enabled: etat.travail,
    submenu: [
      {
        label: 'Ajouter un entretien…',
        enabled: etat.ajouter,
        click: () => envoyer('menu:action', 'ajouter-entretien'),
      },
      {
        label: 'Trier les entretiens',
        enabled: etat.trier,
        submenu: [
          {
            label: 'Par ordre alphabétique',
            enabled: etat.trier,
            click: () => envoyer('menu:action', 'trier-entretiens', 'alpha'),
          },
          {
            label: 'Par ordre d’ajout',
            enabled: etat.trier,
            click: () => envoyer('menu:action', 'trier-entretiens', 'ajout'),
          },
          {
            label: 'Par date de modification',
            enabled: etat.trierContenu,
            click: () => envoyer('menu:action', 'trier-entretiens', 'modif'),
          },
          {
            label: 'Par longueur',
            enabled: etat.trierContenu,
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
          menuEntretiens,
          menuEdition,
        ]
      : [menuCorpus, menuEntretiens, menuEdition]

  if (ouvrirAide) {
    template.push({
      label: 'Aide',
      submenu: [
        { label: 'Documentation utilisateur', click: () => ouvrirAide('guide') },
        { label: 'FAQ', click: () => ouvrirAide('faq') },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
