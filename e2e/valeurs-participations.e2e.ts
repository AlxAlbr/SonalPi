import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JSONContent } from '@tiptap/core'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { ecrireSeedDemo } from '../test/seedDemo'
import { entrerCorpus, entrerEntretien, lancer, retourCorpus } from './util'

test('saisir, annuler et fermer une saisie libre conserve les participations et leurs références', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-valeurs-participations-'))
  const racine = join(dir, 'corpus'), fichier = join(racine, 'entretiens/e1.json')
  ecrireSeedDemo(racine)
  const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
  const data = lire()
  data.participations[0] = { ...data.participations[0], id: '7', index: 11, nom: 'Question', interviewer: true,
    pseudo: 'Q1', couleur: '#123456', valeursLoc: { locale: 'a' } }
  data.participations[1] = { ...data.participations[1], id: 'import-historique', index: 7, nom: 'Réponse', valeursLoc: {} }
  for (const bloc of (data.corpsTexte as JSONContent).content ?? []) {
    if (bloc.attrs?.loc === 1) bloc.attrs.loc = 11
    else if (bloc.attrs?.loc === 2) bloc.attrs.loc = 7
  }
  const date = new Date().toISOString()
  data.notes = [{ id: 'memo-local', categorieId: 'ncat_generale', titre: 'À garder', corps: 'Mémo local', date: null,
    statut: 'prive', rang: 0, creeLe: date, modifieLe: date, participationIds: ['7'] }]
  writeFileSync(fichier, JSON.stringify(data))
  const cheminCorpus = join(racine, 'corpus.crp')
  const corpus = JSON.parse(readFileSync(cheminCorpus, 'utf8')) as CorpusFichier
  corpus.variables.locale = { id: 'locale', lib: 'Réponse locale', portee: "participation", priv: false, ordre: 0, vExport: 1,
    modalites: [{ id: 'a', lib: 'A', mExport: 1 }, { id: 'b', lib: 'B', mExport: 2 }] }
  writeFileSync(cheminCorpus, JSON.stringify(corpus))

  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('.volet-notes [data-onglet="donnees"]').click()
    const choix = page.locator('.panneau.donnees .fiche-loc').first().locator('select')
    await expect(choix).toHaveValue('a')
    await choix.selectOption('b')
    await page.locator('.outils-editeur [data-onglet="journal"]').click()
    const action = page.locator('.journal li').filter({ hasText: 'Valeur (Question)' }).first()
    await expect(action.locator('.annuler-entree')).toBeEnabled()
    await action.locator('.annuler-entree').click()
    await page.getByRole('button', { name: 'Fermer le journal' }).click()
    await expect(choix).toHaveValue('a')
    await choix.selectOption({ label: 'autre…' })
    const libre = page.locator('.panneau.donnees .fiche-loc').first().locator('.saisie-eav-libre')
    await libre.fill('Réponse libre')
    await libre.press('Tab')
    await retourCorpus(page)

    const apres = lire()
    const definitions = JSON.parse(readFileSync(cheminCorpus, 'utf8')) as CorpusFichier
    const modalite = definitions.variables.locale.modalites.find((m) => m.lib === 'Réponse libre')!
    expect(modalite).toBeDefined()
    expect(apres.participations).toEqual([
      { ...data.participations[0], valeursLoc: { locale: modalite.id } }, data.participations[1],
    ])
    expect(apres.notes).toEqual(data.notes)
    expect(apres.corpsTexte).toEqual(data.corpsTexte)
    expect(apres.meta).toEqual({ ...data.meta, audioDistant: null })
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
