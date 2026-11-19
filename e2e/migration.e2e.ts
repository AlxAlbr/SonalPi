import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from './util'

for (const formatVersion of [2, 9]) {
  test(`le format natif de développement ${formatVersion} est refusé sans convertir les documents ni déplacer les médias`, async () => {
    const profil = mkdtempSync(join(tmpdir(), 'sonal-refus-natif-'))
    const dir = join(profil, 'ancien-corpus')
    mkdirSync(join(dir, 'entretiens'), { recursive: true })
    mkdirSync(join(dir, 'audio'), { recursive: true })
    const chemin = join(dir, 'corpus.crp')
    writeFileSync(chemin, JSON.stringify({
      formatVersion, codebook: {}, variables: {}, reglesAnon: {}, personnes: {},
      membership: { e1: { titre: 'Entretien conservé', date: null, lastModified: '2026-01-01' } },
    }))
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify({
      formatVersion, lastModified: '2026-01-01',
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 1 } }] },
      annotations: [], ancres: [],
      locuteurs: [{ id: 'local-1', index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
      meta: { valeursGen: {}, audioRef: 'audio/e1.wav' },
    }))
    writeFileSync(join(dir, 'audio/e1.wav'), 'audio synthétique conservé')
    writeFileSync(join(dir, 'audio/e1.png'), 'forme d’onde synthétique conservée')
    const instantane = () => readdirSync(dir, { recursive: true, withFileTypes: true })
      .map((entree) => ({ chemin: join(entree.parentPath, entree.name), fichier: entree.isFile() }))
      .sort((a, b) => a.chemin.localeCompare(b.chemin))
      .map(({ chemin, fichier }) => ({ chemin, contenu: fichier ? readFileSync(chemin) : null }))
    const avant = instantane()
    const app = await lancer(profil, { fichiers: [chemin] })
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await expect(page.locator('.banniere.refus')).toContainText('Ouverture du corpus refusée')
      await expect(page.locator('.corpus-ecran')).not.toBeVisible()
      await expect(page.locator('.modale-migration')).not.toBeVisible()
      expect(instantane()).toEqual(avant)
    } finally {
      await app.close()
      expect(instantane()).toEqual(avant)
      rmSync(profil, { recursive: true, force: true })
    }
  })
}
