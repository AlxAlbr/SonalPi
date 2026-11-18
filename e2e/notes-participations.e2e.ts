import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('les notes et leurs annulations gardent les participations dans leur entretien à travers IPC', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-notes-participations-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const resultat = await page.evaluate(async () => {
      const api = window.sonal.corpus
      const commun = await api.personnesCommander({ type: 'creerDefinition', nom: 'Identité commune' })
      if (!commun) throw new Error('Identité absente')
      const ids: string[] = []
      for (const titre of ['Notes A', 'Notes B']) {
        const { id } = await api.creerEntretienVide(titre)
        const lecture = await api.lireEntretien(id)
        if (!lecture.ok) throw new Error('Entretien indisponible')
        const data = lecture.data
        data.locuteurs = [{ id: commun, index: 7, nom: 'Nom local', personneRef: commun, valeursLoc: {} }]
        data.notes = [{ id: 'meme-note', categorieId: 'ncat_generale', titre: 'Titre initial', date: null, statut: 'prive',
          corps: `Texte de ${titre}`, locuteurIds: [commun], rang: 0, creeLe: data.lastModified, modifieLe: null }]
        await api.ecrireEntretien(id, data)
        ids.push(id)
      }
      const lire = async (id: string) => {
        const lecture = await api.lireEntretien(id)
        if (!lecture.ok) throw new Error('Entretien indisponible')
        return lecture.data
      }
      const avant = await Promise.all(ids.map(lire))
      const note = (await api.notesInventaire()).notes.find((n) => n.entretienId === ids[0] && n.id === 'meme-note')!
      const champs = { categorieId: note.categorieId, titre: 'Titre modifié', date: note.date, statut: note.statut, corps: note.corps }
      let refus = false
      try {
        await api.notesCommander(JSON.parse(JSON.stringify({ type: 'modifier', entretienId: ids[0], noteId: note.id,
          attendu: note.attendu, champs: { ...champs, participationIds: ['autre-identite'] } })))
      } catch (e) { refus = String(e).includes('demande de modification des notes') }
      const apresRefus = await lire(ids[0])
      await api.notesCommander({ type: 'modifier', entretienId: ids[0], noteId: note.id, attendu: note.attendu, champs })
      const apresModification = await Promise.all(ids.map(lire))
      const actualisee = (await api.notesInventaire()).notes.find((n) => n.entretienId === ids[0] && n.id === note.id)!
      await api.notesCommander({ type: 'supprimer', entretienId: ids[0], noteId: note.id, attendu: actualisee.attendu })
      const apresSuppression = await lire(ids[0])
      const journal = await api.journalLister()
      const restauration = await api.journalAnnuler(journal[0].id)
      const apresRestauration = await lire(ids[0])
      const annulation = await api.journalAnnuler(journal[1].id)
      const final = await Promise.all(ids.map(lire))
      return { commun, avant, attendu: note.attendu, refus, apresRefus, apresModification,
        apresSuppression, restauration, apresRestauration, annulation, final }
    })
    expect(resultat.attendu.participationIds).toEqual([resultat.commun])
    expect(resultat.attendu).not.toHaveProperty('locuteurIds')
    expect(resultat.refus).toBe(true)
    expect(resultat.apresRefus).toEqual(resultat.avant[0])
    expect(resultat.apresModification[0].notes![0].titre).toBe('Titre modifié')
    expect(resultat.apresModification[1]).toEqual(resultat.avant[1])
    expect(resultat.apresSuppression.notes).toEqual([])
    expect(resultat.restauration.ok).toBe(true)
    expect(resultat.apresRestauration.notes![0]).toMatchObject({ titre: 'Titre modifié', locuteurIds: [resultat.commun] })
    expect(resultat.annulation.ok).toBe(true)
    expect(resultat.final[0].notes![0]).toMatchObject({ titre: 'Titre initial', locuteurIds: [resultat.commun] })
    expect(resultat.final[0].notes![0]).not.toHaveProperty('participationIds')
    expect(resultat.final[0].locuteurs[0]).toEqual(resultat.avant[0].locuteurs[0])
    expect(resultat.final[1]).toEqual(resultat.avant[1])
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
