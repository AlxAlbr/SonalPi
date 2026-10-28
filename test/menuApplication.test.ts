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
import { MENU_ACCUEIL } from '../src/shared/menuApplication'

const MENU_TRAVAIL = {
  travail: true, naviguer: true, enregistrer: true, sauvegarder: true,
  exporter: true, ajouter: true, trier: true, trierContenu: true,
}

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
    appliquerMenu([], undefined, MENU_TRAVAIL)
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

test('Édition reste visible après Entretiens et conserve les commandes natives', () => {
  appliquerMenu([], vi.fn())
  expect(electron.template.filter((item) => item.label).map((item) => item.label)).toEqual([
    'Corpus', 'Entretiens', 'Édition', 'Aide',
  ])
  const edition = electron.template.find((item) => item.label === 'Édition')!
  expect(edition.visible).not.toBe(false)
  expect(sousMenu(edition).map((item) => item.role).filter(Boolean)).toEqual([
    'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
  ])
})

describe('disponibilité selon le contexte', () => {
  function corpus(label: string) {
    return sousMenu(electron.template.find((item) => item.label === 'Corpus')!)
      .find((item) => item.label?.startsWith(label))!
  }

  test('à l’accueil, seules les commandes de choix du corpus restent actives', () => {
    appliquerMenu([], vi.fn(), MENU_ACCUEIL)
    expect(electron.template.find((item) => item.label === 'Entretiens')!.enabled).toBe(false)
    for (const label of ['Enregistrer', 'Faire une copie', 'Exporter']) {
      expect(corpus(label).enabled).toBe(false)
    }
    for (const label of ['Nouveau corpus', 'Ouvrir corpus', 'Corpus récents', 'Ouvrir un corpus distant']) {
      expect(corpus(label).enabled).toBe(true)
    }
  })

  test('les possibilités de sauvegarde, d’écriture et de tri restent indépendantes', () => {
    appliquerMenu([], undefined, {
      ...MENU_TRAVAIL, enregistrer: false, sauvegarder: false, ajouter: false, trierContenu: false,
    })
    expect(corpus('Enregistrer').enabled).toBe(false)
    expect(corpus('Faire une copie').enabled).toBe(false)
    expect(corpus('Exporter').enabled).toBe(true)
    const entretiens = sousMenu(electron.template.find((item) => item.label === 'Entretiens')!)
    expect(entretiens[0].enabled).toBe(false)
    expect(sousMenu(entretiens[1]).map((item) => item.enabled)).toEqual([true, true, false, false])
  })

  test('une opération bloquante désactive aussi les ouvertures de corpus', () => {
    appliquerMenu([], undefined, { ...MENU_ACCUEIL, naviguer: false })
    expect(corpus('Nouveau corpus').enabled).toBe(false)
    expect(corpus('Ouvrir corpus').enabled).toBe(false)
    expect(corpus('Corpus récents').enabled).toBe(false)
  })
})

describe('menu Aide', () => {
  test('ouvre directement le guide et la FAQ sans action sur le corpus', () => {
    electron.send.mockClear()
    const ouvrir = vi.fn()
    appliquerMenu([], ouvrir)
    const aide = electron.template.find((item) => item.label === 'Aide')!
    const choix = sousMenu(aide)
    for (const item of choix) (item.click as () => void)()
    expect(choix.map((item) => item.label)).toEqual(['Documentation utilisateur', 'FAQ'])
    expect(ouvrir.mock.calls).toEqual([['guide'], ['faq']])
    expect(electron.send).not.toHaveBeenCalled()
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
    appliquerMenu([], undefined, MENU_TRAVAIL)
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
