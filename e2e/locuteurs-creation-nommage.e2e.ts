import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer, ouvrir, retourCorpus } from './util'

async function gestion(page: Page) {
  await page.locator('.onglets button[data-onglet="locuteurs"]').click()
  await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
  return page.getByRole('dialog', { name: 'Gestion des locuteurs', exact: true })
}
const propositions = (page: Page) => page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?', exact: true })
const inventaire = (page: Page) => page.evaluate(() => window.sonal.corpus.personnesInventaire())
async function ajouterSource(page: Page) {
  return page.evaluate(async () => {
    const api = window.sonal.corpus, { id } = await api.creerEntretienVide('Source homonyme')
    const lecture = await api.lireEntretien(id)
    if (!lecture.ok) throw new Error('Source absente')
    const { formatVersion: _v, lastModified: _d, ...data } = lecture.data
    data.participations = [{ id: 'source', index: 0, nom: 'Marie Dupont', pseudo: 'Pseudo source', interviewer: true, valeursLoc: {}, locuteurRef: null }]
    await api.ecrireEntretien(id, data)
    return api.personnesCommander({ type: 'creer', entretienId: id, participationId: 'source', nom: 'Marie Dupont' })
  })
}

test('tous les noms non vides créent une identité, mais ajouter une entrée provisoire ne suffit pas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-creation-noms-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = window.sonal.corpus, r = await api.lireEntretien('e1')
      if (!r.ok) throw new Error('Entretien absent')
      const { formatVersion: _v, lastModified: _d, ...payload } = r.data
      payload.notes = [{ id: 'note-conservee', categorieId: 'ncat_generale', titre: 'Note conservée', corps: 'Contenu <em>conservé</em>.', date: null,
        statut: 'prive', rang: 0, participationIds: [payload.participations[0].id], creeLe: '', modifieLe: null }]
      await api.ecrireEntretien('e1', payload)
    })
    await entrerEntretien(page)
    await page.locator('.editeur').click(); await page.keyboard.press('Control+End')
    await page.keyboard.type(' Paroles récentes conservées.')
    await expect.poll(() => page.evaluate(async () => {
      const r = await window.sonal.corpus.lireEntretien('e1')
      return r.ok && JSON.stringify(r.data.corpsTexte).includes('Paroles récentes conservées.')
    })).toBe(true)
    const modal = await gestion(page), base = await inventaire(page)
    const initial = await page.evaluate(async () => { const r = await window.sonal.corpus.lireEntretien('e1'); if (!r.ok) throw new Error('Absent'); return r.data })
    const noms = ['Enquêteur', 'Participant 1', 'Inconnu', 'X', 'Nouveau locuteur']
    for (const [i, nom] of noms.entries()) {
      await modal.getByRole('button', { name: '+ Locuteur', exact: true }).click()
      const champ = modal.locator('.nom-loc').last()
      await expect(champ).toHaveValue('Nouveau locuteur')
      const identitesAvant = (await inventaire(page)).locuteurs
      expect(identitesAvant).toHaveLength(base.locuteurs.length + i)
      if (i === 0) {
        await champ.fill('   '); await champ.press('Enter')
        await expect(modal.getByRole('status').filter({ hasText: 'Le nom ne peut pas être vide.' })).toBeVisible()
        expect((await inventaire(page)).locuteurs).toHaveLength(base.locuteurs.length)
      }
      if (nom === 'Nouveau locuteur') await modal.getByRole('button', { name: 'Valider le nom Nouveau locuteur', exact: true }).click()
      else { await champ.fill(nom); await champ.press('Enter') }
      await expect.poll(async () => (await inventaire(page)).locuteurs.length).toBe(base.locuteurs.length + i + 1)
      await expect(modal.getByRole('status').filter({ hasText: new RegExp(`(?:Locuteur « ${nom} » créé|Un rapprochement est proposé pour « ${nom} »)`) })).toBeVisible()
      if (await propositions(page).isVisible()) await propositions(page).getByRole('button', { name: 'Plus tard', exact: true }).click()
      const vue = await inventaire(page), nouvelles = vue.locuteurs.filter((l) => !identitesAvant.some((a) => a.id === l.id))
      expect(nouvelles).toHaveLength(1); expect(nouvelles[0].nom).toBe(nom)
      const p = vue.participations.find((p) => p.entretienId === 'e1' && p.locuteurRef === nouvelles[0].id)!
      expect(p.nom).toBe(nom); expect(p.locuteurRef).toBeTruthy(); expect(p.interviewer).toBe(false)
      expect(vue.participations.filter((autre) => autre.locuteurRef === p.locuteurRef)).toHaveLength(1)
    }
    await modal.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    await retourCorpus(page)
    const apres = await page.evaluate(async () => { const r = await window.sonal.corpus.lireEntretien('e1'); if (!r.ok) throw new Error('Absent'); return r.data })
    expect(apres.corpsTexte).toEqual(initial.corpsTexte); expect(apres.annotations).toEqual(initial.annotations)
    expect(apres.notes).toEqual(initial.notes); expect(apres.meta).toEqual(initial.meta)
    expect(apres.participations.slice(0, initial.participations.length)).toEqual(initial.participations)
    expect(new Set(apres.participations.filter((p) => p.locuteurRef).map((p) => p.locuteurRef)).size).toBe(noms.length)
  } finally { await app.close(); rmSync(dir, { force: true, recursive: true }) }
})

test('Plus tard conserve immédiatement deux homonymes indépendants, visibles après retour au corpus', async () => {
  const { app, page } = await ouvrir('sonal-creation-plus-tard-')
  try {
    const source = await ajouterSource(page), modal = await gestion(page)
    await modal.locator('.nom-loc').first().fill('Marie Dupont'); await modal.locator('.nom-loc').first().press('Enter')
    const dialogue = propositions(page)
    await expect(dialogue).toContainText('déjà enregistré comme locuteur distinct')
    const avant = await inventaire(page), cible = avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')!
    expect(avant.locuteurs).toHaveLength(2); expect(cible.locuteurRef).not.toBe(source)
    await page.keyboard.press('Escape')
    await expect(dialogue).toHaveCount(0)
    await modal.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    await retourCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
    await expect(page.getByRole('option').filter({ has: page.getByText('Marie Dupont', { exact: true }) })).toHaveCount(2)
    const apres = await inventaire(page)
    expect(apres.locuteurs).toEqual(avant.locuteurs)
    expect(apres.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)?.locuteurRef).toBe(cible.locuteurRef)
  } finally { await app.close() }
})

test('Confirmer réunit les identités sans laisser une fiche vide et sans copier les données non choisies', async () => {
  const { app, page } = await ouvrir('sonal-creation-confirmer-')
  try {
    const idSource = await ajouterSource(page), modal = await gestion(page)
    await modal.locator('.nom-loc').first().fill('Marie Dupont'); await modal.locator('.nom-loc').first().press('Enter')
    const dialogue = propositions(page)
    await expect(dialogue).toBeVisible()
    const avant = await inventaire(page), cible = avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')!
    expect(avant.locuteurs).toHaveLength(2)
    await dialogue.locator('.proposition-personne').getByRole('radio').check()
    await dialogue.getByRole('checkbox', { name: /Reprendre les informations disponibles/ }).uncheck()
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    const apres = await inventaire(page), p = apres.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)!
    expect(apres.locuteurs).toHaveLength(1); expect(apres.locuteurs[0].id).toBe(idSource)
    expect(p).toEqual({ ...cible, locuteurRef: idSource })
    await modal.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    await retourCorpus(page)
    expect((await inventaire(page)).locuteurs).toEqual(apres.locuteurs)
  } finally { await app.close() }
})

test('un renommage demandé pendant les propositions en préparation ne reçoit pas ensuite un ancien dialogue', async () => {
  const { app, page } = await ouvrir('sonal-creation-propositions-tardives-')
  try {
    await ajouterSource(page)
    const modal = await gestion(page)
    await app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers
      const identifier = handlers.get('corpus:identifierParticipationAuNommage'), inventorier = handlers.get('corpus:personnesInventaire')
      if (!identifier || !inventorier) throw new Error('Handlers absents')
      const etat = { bloquer: false, demandes: 0, liberer: () => {} }
      const attente = new Promise<void>((r) => { etat.liberer = () => { etat.bloquer = false; r() } })
      Reflect.set(globalThis, 'qualificationPropositionsNommage', etat)
      ipcMain.removeHandler('corpus:identifierParticipationAuNommage')
      ipcMain.handle('corpus:identifierParticipationAuNommage', async (...args) => {
        const resultat = await identifier(...args); etat.bloquer = true; return resultat
      })
      ipcMain.removeHandler('corpus:personnesInventaire')
      ipcMain.handle('corpus:personnesInventaire', async (...args) => {
        if (etat.bloquer) { etat.demandes++; await attente }
        return inventorier(...args)
      })
    })
    await modal.locator('.nom-loc').first().fill('Marie Dupont'); await modal.locator('.nom-loc').first().press('Enter')
    await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'qualificationPropositionsNommage').demandes as number)).toBeGreaterThan(0)
    await modal.getByRole('button', { name: 'Renommer Marie Dupont dans tous ses entretiens', exact: true }).click()
    const renommage = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
    await expect(renommage).toBeVisible()
    await app.evaluate(() => Reflect.get(globalThis, 'qualificationPropositionsNommage').liberer())
    await expect(renommage.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true })).toBeEnabled()
    await expect(propositions(page)).toHaveCount(0)
    await renommage.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(renommage).toHaveCount(0)
    expect((await inventaire(page)).locuteurs).toHaveLength(2)
  } finally {
    await app.evaluate(() => Reflect.get(globalThis, 'qualificationPropositionsNommage')?.liberer())
    await app.close()
  }
})

async function reponsePerdue(app: ElectronApplication, refuserRelecture: boolean) {
  await app.evaluate(({ ipcMain }, refuserRelecture) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers
    const creer = handlers.get('corpus:identifierParticipationAuNommage'), sauver = handlers.get('corpus:ecrireEntretien'), ouvrir = handlers.get('corpus:ouvrirEntretienPourEdition')
    if (!creer || !sauver || !ouvrir) throw new Error('Handlers absents')
    const etat = { appels: 0, attente: false, ecritures: 0, liberer: () => {} }
    const pause = new Promise<void>((r) => { etat.liberer = r })
    Reflect.set(globalThis, 'qualificationCreationNommage', etat)
    ipcMain.removeHandler('corpus:identifierParticipationAuNommage')
    ipcMain.handle('corpus:identifierParticipationAuNommage', async (...args) => {
      etat.appels++; etat.attente = true
      await pause; await creer(...args); etat.attente = false
      throw new Error('Réponse perdue après création')
    })
    ipcMain.removeHandler('corpus:ecrireEntretien')
    ipcMain.handle('corpus:ecrireEntretien', (...args) => { if (etat.attente) etat.ecritures++; return sauver(...args) })
    ipcMain.removeHandler('corpus:ouvrirEntretienPourEdition')
    ipcMain.handle('corpus:ouvrirEntretienPourEdition', (...args) => {
      if (refuserRelecture && etat.appels) throw new Error('Relecture indisponible')
      return ouvrir(...args)
    })
  }, refuserRelecture)
}
async function etatCreation(app: ElectronApplication, liberer = false) {
  return app.evaluate((_e, liberer) => {
    const etat = Reflect.get(globalThis, 'qualificationCreationNommage') as { appels: number; attente: boolean; ecritures: number; liberer: () => void }
    if (liberer) etat.liberer()
    return { appels: etat.appels, attente: etat.attente, ecritures: etat.ecritures }
  }, liberer)
}
for (const refuserRelecture of [false, true]) test(`réponse de création perdue, relecture indisponible = ${refuserRelecture} : aucune autosave périmée ni identité supplémentaire`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-creation-perdue-')); let app = await lancer(dir)
  try {
    let page = await app.firstWindow(); await entrerCorpus(page); await entrerEntretien(page)
    const modal = await gestion(page); await reponsePerdue(app, refuserRelecture)
    await modal.locator('.nom-loc').first().fill('X'); await modal.locator('.nom-loc').first().press('Enter')
    await expect.poll(async () => (await etatCreation(app)).attente).toBe(true)
    await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    await page.waitForTimeout(750)
    expect((await etatCreation(app)).ecritures).toBe(0)
    await etatCreation(app, true)
    if (refuserRelecture) {
      await expect(page.getByRole('alert').filter({ hasText: 'Rouvrez le corpus' })).toBeVisible()
      await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    } else {
      await expect(modal.getByRole('status').filter({ hasText: 'Locuteur « X » créé' })).toBeVisible()
      await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
    }
    const avant = await inventaire(page)
    expect(avant.locuteurs).toHaveLength(1); expect((await etatCreation(app)).appels).toBe(1)
    await app.close(); app = await lancer(dir); page = await app.firstWindow()
    await entrerCorpus(page); await entrerEntretien(page); const relu = await gestion(page)
    await expect(relu.locator('.nom-loc').first()).toHaveValue('X')
    await expect(relu.locator('.nom-loc').first()).toBeEnabled()
    expect((await inventaire(page)).locuteurs).toEqual(avant.locuteurs)
  } finally { await app.close(); rmSync(dir, { force: true, recursive: true }) }
})
