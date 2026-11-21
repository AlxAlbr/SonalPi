import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('Locuteurs : liste unifiée, sélection multiple, interventions et retour au corpus sans écriture de consultation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-corpus-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = window.sonal.corpus
      const inventaire = await api.inventaireIdentitesLocuteurs()
      const karine = inventaire.participations.find((l) => l.nom === 'Karine')!
      await api.ouvrirEntretienPourEdition(karine.entretienId)
      const identifie = await api.identifierParticipationAuNommage({ entretienId: karine.entretienId, participationId: karine.participationId, nom: 'Karine' })
      const personneId = identifie.participations.find((p) => p.id === karine.participationId)!.locuteurRef
      const enqueteur = inventaire.participations.find((l) => l.nom === 'Enquêteur')!
      await api.identifierParticipationAuNommage({ entretienId: enqueteur.entretienId, participationId: enqueteur.participationId, nom: enqueteur.nom })
      await api.fermerEntretien(karine.entretienId)
      for (const [titre, nom, lien] of [
        ['Deuxième entretien', 'Mme Dupont', personneId],
        ['Homonyme indépendant', 'Karine', null],
      ] as const) {
        const { id } = await api.creerEntretienVide(titre)
        const lecture = await api.lireEntretien(id)
        if (!lecture.ok) throw new Error('Lecture impossible')
        const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
        payload.participations = [{ id: `loc-${id}`, index: 0, nom, locuteurRef: lien, valeursLoc: {} }]
        payload.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Une intervention dans cet entretien.' }] }] }
        await api.ecrireEntretien(id, payload)
        if (!lien) {
          await api.ouvrirEntretienPourEdition(id)
          await api.identifierParticipationAuNommage({ entretienId: id, participationId: `loc-${id}`, nom })
          await api.fermerEntretien(id)
        }
      }
    })
    const fichiers = [join(dir, 'corpus', 'corpus.crp'), ...readdirSync(join(dir, 'corpus', 'entretiens')).filter((f) => f.endsWith('.json')).map((f) => join(dir, 'corpus', 'entretiens', f))]
    const avant = fichiers.map((f) => readFileSync(f, 'utf8'))
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
    const panneau = page.locator('.locuteurs-corpus')
    const liste = panneau.getByRole('listbox', { name: 'Locuteurs', exact: true })
    await expect(liste.getByRole('option')).toHaveCount(3)
    await expect(panneau.locator('.entretien-interventions')).toHaveCount(3)
    const groupe = liste.getByRole('option', { name: /^Karine / }).filter({ hasText: 'Entretien Karine' })
    const homonyme = liste.getByRole('option').filter({ hasText: 'Homonyme indépendant' })
    await groupe.click()
    const rangs = await panneau.locator('.actions-selection > button, .actions-selection .actions-correction > button').evaluateAll((boutons) => [...new Set(boutons.map((b) => Math.round(b.getBoundingClientRect().top)))])
    expect(rangs).toHaveLength(1)
    await expect(panneau.locator('.entretien-interventions')).toHaveCount(2)
    await homonyme.click({ modifiers: ['Control'] })
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(2)
    await expect(panneau.locator('.entretien-interventions')).toHaveCount(3)
    await panneau.getByRole('button', { name: 'Statistiques', exact: true }).click()
    await expect(panneau.getByRole('region', { name: 'Statistiques de la sélection' })).toContainText('interventions')
    await panneau.getByRole('searchbox').fill('Mme Dupont')
    await panneau.getByRole('searchbox').press('Enter')
    await expect(liste.getByRole('option')).toHaveCount(1)
    await expect(panneau.locator('.compteur-selection')).toContainText('2 sélectionnés, dont 1 masqué')
    await panneau.getByRole('searchbox').fill('Homonyme')
    await panneau.getByRole('searchbox').press('Enter')
    await expect(liste.getByRole('option')).toHaveCount(2)
    await panneau.getByRole('button', { name: 'Effacer la recherche', exact: true }).click()
    await expect(liste.getByRole('option')).toHaveCount(3)
    expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
    await page.screenshot({ path: test.info().outputPath('locuteurs-corpus.png') })
    await panneau.getByRole('button', { name: 'Intervention suivante dans Deuxième entretien', exact: true }).click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.tiptap')).toContainText('Une intervention dans cet entretien.')
    await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await expect(panneau).toBeVisible()
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(2)
    await expect(panneau.locator('.entretien-interventions')).toHaveCount(3)
    await panneau.getByRole('button', { name: 'Détails et vérifications…', exact: true }).click()
    await expect(panneau.locator('.details-locuteurs')).toBeVisible()
    await expect(panneau.locator('.personnes-corpus')).toHaveCount(0)
    await expect(panneau.getByRole('listbox', { name: 'Locuteurs', exact: true })).toBeVisible()
    await panneau.getByRole('button', { name: 'Fermer les détails', exact: true }).click()
    await expect(liste).toBeVisible()
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(2)
    const separateur = panneau.getByRole('separator')
    const largeur = Number(await separateur.getAttribute('aria-valuenow'))
    await separateur.focus(); await separateur.press('ArrowRight')
    await expect(separateur).toHaveAttribute('aria-valuenow', String(largeur + 20))
    await page.setViewportSize({ width: 650, height: 850 })
    await expect(panneau.locator('.vue-locuteurs')).toHaveCSS('grid-template-columns', /^\d+(?:\.\d+)?px$/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
