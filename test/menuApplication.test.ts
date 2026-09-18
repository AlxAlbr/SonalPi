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
