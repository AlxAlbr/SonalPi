import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

const electron = vi.hoisted(() => ({
  template: [] as MenuItemConstructorOptions[],
  send: vi.fn(),
  setApplicationMenu: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: electron.send } }],
  },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
      electron.template = template
      return template
    },
    setApplicationMenu: electron.setApplicationMenu,
  },
}))

import { appliquerMenu } from '../src/main/menuApplication'

function sousMenu(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return item.submenu as MenuItemConstructorOptions[]
}

describe('menu applicatif des entretiens', () => {
  beforeEach(() => {
    electron.send.mockClear()
    electron.setApplicationMenu.mockClear()
    appliquerMenu([])
  })

  test('les quatre tris transmettent leur mode au renderer', () => {
    const entretiens = electron.template.find((item) => item.label === 'Entretiens')!
    const tri = sousMenu(entretiens).find((item) => item.label === 'Trier les entretiens')!
    const choix = sousMenu(tri)

    for (const item of choix) (item.click as () => void)()

    expect(choix.map((item) => item.label)).toEqual([
      'Par ordre alphabétique',
      'Par ordre d’ajout',
      'Par date de modification',
      'Par longueur',
    ])
    expect(electron.send.mock.calls).toEqual([
      ['menu:action', 'trier-entretiens', 'alpha'],
      ['menu:action', 'trier-entretiens', 'ajout'],
      ['menu:action', 'trier-entretiens', 'modif'],
      ['menu:action', 'trier-entretiens', 'longueur'],
    ])
  })
})

describe('menu applicatif du corpus', () => {
  beforeEach(() => {
    electron.send.mockClear()
    electron.setApplicationMenu.mockClear()
    appliquerMenu([])
  })

  /** Item du sous-menu Corpus par son libellé. */
  function itemCorpus(label: string): MenuItemConstructorOptions {
    const corpus = electron.template.find((item) => item.label === 'Corpus')!
    return sousMenu(corpus).find((item) => item.label?.startsWith(label))!
  }

  test('la copie de sauvegarde ZIP et l’export du corpus sont proposés', () => {
    const sauvegarde = itemCorpus('Faire une copie de sauvegarde')
    const exporter = itemCorpus('Exporter le corpus')

    ;(sauvegarde.click as () => void)()
    ;(exporter.click as () => void)()

    expect(electron.send.mock.calls).toEqual([
      ['menu:action', 'sauvegarde-zip'],
      ['menu:action', 'exporter-corpus'],
    ])
  })
})
