import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { entrerCorpus, entrerEntretien, lancer, retourCorpus } from './util'

function lire(dir: string, id: string): EntretienFichier {
  return JSON.parse(readFileSync(join(dir, 'corpus/entretiens', `${id}.json`), 'utf8'))
}
async function preparer(page: Page) {
  return page.evaluate(async () => {
    const api = window.sonal.corpus
    const locuteurId = await api.personnesCommander({ type: 'creerDefinition', nom: 'Nom commun' })
    if (!locuteurId) throw new Error('Identité absente')
    const variable = await api.ajouterVariable('Donnée locale', 'participation')
    const corpus = await api.ajouterModalite(variable.id, 'Valeur conservée')
    const modalite = corpus.variables[variable.id].modalites[0].id
    const courant = await api.lireEntretien('e1')
    if (!courant.ok) throw new Error('Entretien absent')
    const cible = courant.data.participations.find((p) => p.nom === 'Karine')!
    cible.locuteurRef = locuteurId
    cible.pseudo = 'Pseudo conservé'; cible.couleur = '#123456'; cible.valeursLoc = { [variable.id]: modalite }
    courant.data.notes = [{ id: 'note', categorieId: 'ncat_generale', titre: 'Note conservée', corps: '<p>Contenu local.</p>', date: null,
      statut: 'prive', rang: 0, creeLe: '2026-01-01T00:00:00Z', modifieLe: null, participationIds: [cible.id] }]
    await api.ecrireEntretien('e1', courant.data)
    const autre = await api.creerEntretienVide('Autre entretien associé')
    const lecture = await api.lireEntretien(autre.id)
    if (!lecture.ok) throw new Error('Autre entretien absent')
    lecture.data.participations = [{ ...cible, nom: 'Karine ailleurs', valeursLoc: { ...cible.valeursLoc } }]
    lecture.data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: cible.index }, content: [{ type: 'text', text: 'Paroles de l’autre entretien.' }] }] }
    await api.ecrireEntretien(autre.id, lecture.data)
    return { autreId: autre.id, locuteurId }
  })
}
async function gestion(page: Page) {
  await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
  return page.getByRole('dialog', { name: 'Gestion des locuteurs', exact: true })
}
const nomGlobal = (page: Page) => page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })

async function installerReponsePerdue(app: ElectronApplication, refuserRelecture = false) {
  await app.evaluate(({ ipcMain }, refuserRelecture) => {
    const interne = ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
    const renommer = interne._invokeHandlers.get('corpus:renommerLocuteurDepuisEntretien')
    const ecrire = interne._invokeHandlers.get('corpus:ecrireEntretien')
    const ouvrir = interne._invokeHandlers.get('corpus:ouvrirEntretienPourEdition')
    if (!renommer || !ecrire || !ouvrir) throw new Error('Handlers de qualification absents')
    const etat = { attente: false, appels: 0, ecrituresPendant: 0, liberer: () => {} }
    const attente = new Promise<void>((resolve) => { etat.liberer = resolve })
    Reflect.set(globalThis, 'qualificationRenommageOuvert', etat)
    ipcMain.removeHandler('corpus:renommerLocuteurDepuisEntretien')
    ipcMain.handle('corpus:renommerLocuteurDepuisEntretien', async (...args) => {
      etat.attente = true; etat.appels++
      await attente
      await renommer(...args)
      etat.attente = false
      throw new Error('Réponse perdue simulée après enregistrement')
    })
    ipcMain.removeHandler('corpus:ecrireEntretien')
    ipcMain.handle('corpus:ecrireEntretien', (...args) => {
      if (etat.attente) etat.ecrituresPendant++
      return ecrire(...args)
    })
    ipcMain.removeHandler('corpus:ouvrirEntretienPourEdition')
    ipcMain.handle('corpus:ouvrirEntretienPourEdition', (...args) => {
      if (refuserRelecture && etat.appels) throw new Error('Relecture momentanément indisponible')
      return ouvrir(...args)
    })
  }, refuserRelecture)
}
async function etatReponse(app: ElectronApplication, liberer = false) {
  return app.evaluate((_electron, liberer) => {
    const etat = Reflect.get(globalThis, 'qualificationRenommageOuvert') as { attente: boolean; appels: number; ecrituresPendant: number; liberer: () => void } | undefined
    if (liberer) etat?.liberer()
    return etat ? { attente: etat.attente, appels: etat.appels, ecrituresPendant: etat.ecrituresPendant } : null
  }, liberer)
}

test('un seul entretien associé : Entrée et Tabulation enregistrent directement, sans boutons ni confirmation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-direct-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const { autreId, locuteurId } = await preparer(page)
    await page.evaluate(async (id) => {
      const r = await window.sonal.corpus.lireEntretien(id)
      if (!r.ok) throw new Error('Entretien absent')
      r.data.participations[0].locuteurRef = null
      await window.sonal.corpus.ecrireEntretien(id, r.data)
    }, autreId)
    const autreAvant = lire(dir, autreId)
    await entrerEntretien(page)
    const fenetre = await gestion(page), champ = fenetre.locator('.nom-loc').nth(1)
    await expect(fenetre.getByRole('button', { name: /^(Valider le nom|Renommer)/ })).toHaveCount(0)
    await champ.fill('Premier nom direct'); await champ.press('Enter')
    await expect(champ).toHaveValue('Premier nom direct'); await expect(champ).toBeEnabled()
    await expect(nomGlobal(page)).toHaveCount(0)
    await expect.poll(() => lire(dir, 'e1').participations[1].nom).toBe('Premier nom direct')
    const avant = lire(dir, 'e1')
    await champ.fill('Deuxième nom direct'); await champ.press('Tab')
    await expect.poll(() => lire(dir, 'e1').participations[1].nom).toBe('Deuxième nom direct')
    await expect(champ).toBeEnabled(); await expect(nomGlobal(page)).toHaveCount(0)
    expect(lire(dir, 'e1')).toEqual({ ...avant, lastModified: expect.any(String), participations: avant.participations.map((p) => p.locuteurRef === locuteurId ? { ...p, nom: 'Deuxième nom direct' } : p) })
    expect(lire(dir, autreId)).toEqual(autreAvant)
    const corpus = JSON.parse(readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')) as CorpusFichier
    expect(corpus.locuteurs[locuteurId].nom).toBe('Deuxième nom direct')
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('renommer depuis l’entretien sauvegarde le texte, conserve les données et ne rétablit pas les anciens noms à l’autosave', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-ouvert-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const { autreId, locuteurId } = await preparer(page)
    const autreAvant = lire(dir, autreId)
    await entrerEntretien(page)
    await page.locator('.tiptap').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('TEXTE AVANT RENOMMAGE ')
    let fenetre = await gestion(page)
    const champ = fenetre.locator('.nom-loc').nth(1)
    await champ.fill('Nom proposé puis annulé'); await champ.press('Tab')
    const dialogue = nomGlobal(page)
    await expect(dialogue).toContainText('Autre entretien associé')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    expect(JSON.stringify(lire(dir, 'e1').corpsTexte)).toContain('TEXTE AVANT RENOMMAGE')
    expect(lire(dir, 'e1').participations[1].nom).toBe('Karine')
    await page.keyboard.press('Escape')
    await expect(dialogue).not.toBeVisible()
    await expect(champ).toHaveValue('Karine'); await expect(champ).toBeFocused()
    expect(lire(dir, autreId)).toEqual(autreAvant)
    await champ.fill('Nom global confirmé'); await champ.press('Enter')
    await expect(dialogue).toBeVisible()
    const avant = lire(dir, 'e1')
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(dialogue).not.toBeVisible()
    await expect(champ).toHaveValue('Nom global confirmé')
    await fenetre.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await page.locator('.tiptap').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('APRÈS RENOMMAGE ')
    await expect.poll(() => JSON.stringify(lire(dir, 'e1').corpsTexte)).toContain('APRÈS RENOMMAGE')
    await retourCorpus(page)
    const apres = lire(dir, 'e1')
    expect(apres.participations[1]).toEqual({ ...avant.participations[1], nom: 'Nom global confirmé' })
    expect(apres.notes).toEqual(avant.notes)
    expect(apres.annotations).toEqual(avant.annotations)
    expect(apres.meta).toEqual(avant.meta)
    expect(lire(dir, autreId)).toEqual({ ...autreAvant, lastModified: expect.any(String), participations: [{ ...autreAvant.participations[0], nom: 'Nom global confirmé' }] })
    const corpus = JSON.parse(readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')) as CorpusFichier
    expect(corpus.locuteurs[locuteurId].nom).toBe('Nom global confirmé')
    await entrerEntretien(page)
    await expect(page.locator('.tiptap')).toContainText('APRÈS RENOMMAGE TEXTE AVANT RENOMMAGE')
    fenetre = await gestion(page)
    await expect(fenetre.locator('.nom-loc').nth(1)).toHaveValue('Nom global confirmé')
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('un entretien associé absent bloque le renommage sans perdre le nom ni le texte courant', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-ouvert-absent-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const { autreId } = await preparer(page)
    await entrerEntretien(page)
    await page.locator('.tiptap').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('DERNIÈRES PAROLES ')
    const fenetre = await gestion(page)
    await fenetre.locator('.nom-loc').nth(1).fill('Nom refusé'); await fenetre.locator('.nom-loc').nth(1).press('Enter')
    const dialogue = nomGlobal(page)
    await expect(dialogue).toContainText('Autre entretien associé')
    unlinkSync(join(dir, 'corpus/entretiens', `${autreId}.json`))
    const corpusAvant = readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('illisibles')
    await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(fenetre.locator('.nom-loc').nth(1)).toHaveValue('Karine')
    expect(JSON.stringify(lire(dir, 'e1').corpsTexte)).toContain('DERNIÈRES PAROLES')
    expect(readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')).toBe(corpusAvant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('réponse perdue : aucune autosave pendant le renommage, puis relecture des noms sans rejouer la commande', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-ouvert-reponse-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const { autreId } = await preparer(page)
    await entrerEntretien(page)
    const fenetre = await gestion(page)
    await fenetre.locator('.nom-loc').nth(1).fill('Nom malgré réponse perdue'); await fenetre.locator('.nom-loc').nth(1).press('Enter')
    const dialogue = nomGlobal(page)
    await expect(dialogue).toBeVisible()
    await installerReponsePerdue(app)
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect.poll(async () => (await etatReponse(app))?.attente).toBe(true)
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialogue).toBeVisible()
    // Laisse passer le délai de l'autosauvegarde, pendant que la réponse est retenue.
    await page.waitForTimeout(1000)
    expect((await etatReponse(app))?.ecrituresPendant).toBe(0)
    await etatReponse(app, true)
    await expect(dialogue.getByRole('alert')).toContainText('Réponse perdue simulée')
    await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(fenetre.locator('.nom-loc').nth(1)).toHaveValue('Nom malgré réponse perdue')
    await fenetre.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await page.locator('.tiptap').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('ÉDITION APRÈS RELECTURE ')
    await expect.poll(() => JSON.stringify(lire(dir, 'e1').corpsTexte)).toContain('ÉDITION APRÈS RELECTURE')
    expect(lire(dir, 'e1').participations[1].nom).toBe('Nom malgré réponse perdue')
    expect(lire(dir, autreId).participations[0].nom).toBe('Nom malgré réponse perdue')
    expect((await etatReponse(app))?.appels).toBe(1)
  } finally { await etatReponse(app, true).catch(() => {}); await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('une relecture indisponible garde l’entretien en lecture seule jusqu’à sa réouverture sans autosave périmée', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-ouvert-suspendu-'))
  let app = await lancer(dir)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    await preparer(page)
    await entrerEntretien(page)
    const fenetre = await gestion(page)
    await fenetre.locator('.nom-loc').nth(1).fill('Nom enregistré avant coupure'); await fenetre.locator('.nom-loc').nth(1).press('Enter')
    const dialogue = nomGlobal(page)
    await expect(dialogue).toBeVisible()
    await installerReponsePerdue(app, true)
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect.poll(async () => (await etatReponse(app))?.attente).toBe(true)
    await etatReponse(app, true)
    await expect(dialogue.getByRole('alert')).toContainText('Rouvrez le corpus')
    await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(fenetre.locator('.nom-loc').nth(1)).toBeDisabled()
    await expect(fenetre.locator('.pseudo-loc').nth(1)).toBeDisabled()
    await fenetre.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await expect(page.locator('.tiptap')).toHaveAttribute('contenteditable', 'false')
    await retourCorpus(page)
    expect(lire(dir, 'e1').participations[1].nom).toBe('Nom enregistré avant coupure')
    await app.close()
    app = await lancer(dir)
    page = await app.firstWindow()
    await entrerCorpus(page); await entrerEntretien(page)
    await expect(page.locator('.tiptap')).toHaveAttribute('contenteditable', 'true')
    const rouverte = await gestion(page)
    await expect(rouverte.locator('.nom-loc').nth(1)).toHaveValue('Nom enregistré avant coupure')
  } finally { await etatReponse(app, true).catch(() => {}); await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
