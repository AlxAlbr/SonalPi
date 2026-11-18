import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('les corrections traversent IPC avec des ids corpus et des participations contextualisées', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-corrections-ipc-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const resultat = await page.evaluate(async () => {
      const api = window.sonal.corpus
      const initial = await api.personnesInventaire()
      const base = initial.locuteurs.find((p) => p.nom === 'Karine')!
      const commun = await api.personnesCommander({ type: 'creer', entretienId: base.entretienId, locuteurId: base.locuteurId, nom: 'Karine' })
      if (!commun) throw new Error('Identité commune absente')
      const ids = [commun]
      const sources: string[] = []
      for (const [titre, nom] of [['Source A', 'K. Martin'], ['Source B', 'Madame Martin']] as const) {
        const { id } = await api.creerEntretienVide(titre)
        const lecture = await api.lireEntretien(id)
        if (!lecture.ok) throw new Error('Source indisponible')
        const data = lecture.data
        data.locuteurs = [{ id: 'participation-partagee', index: 7, nom, personneRef: null, valeursLoc: {}, interviewer: titre === 'Source B', couleur: '#123456' }]
        data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: `Paroles de ${titre}.` }] }] }
        data.notes = [{ id: 'note-locale', categorieId: 'ncat_generale', titre: '', date: null, statut: 'prive', corps: 'Note de cet entretien',
          locuteurIds: ['participation-partagee'], rang: 0, creeLe: data.lastModified, modifieLe: null }]
        await api.ecrireEntretien(id, data)
        const identite = await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: 'participation-partagee', nom })
        if (!identite) throw new Error('Identité source absente')
        ids.push(identite); sources.push(id)
      }
      const lire = async (id: string) => {
        const lecture = await api.lireEntretien(id)
        if (!lecture.ok) throw new Error('Lecture indisponible')
        return lecture.data
      }
      const avant = await Promise.all(sources.map(lire))
      const attendu = JSON.stringify(await api.personnesInventaire())
      let ancienRefuse = false
      try {
        await api.personnesCommander(JSON.parse(JSON.stringify({ type: 'renommerGlobal', personneId: commun, nom: 'Ancien message', attendu })))
      } catch (e) { ancienRefuse = String(e).includes('demande de correction') }
      const intact = JSON.stringify(await api.personnesInventaire()) === attendu
      await api.personnesCommander({ type: 'regrouperSelection', locuteurIds: ids, conserverId: commun, nom: 'Nom regroupé', uniformiserNoms: false, attendu })
      const regroupes = await Promise.all(sources.map(lire))
      await api.personnesCommander({ type: 'renommerGlobal', locuteurId: commun, nom: 'Nom aligné', attendu: JSON.stringify(await api.personnesInventaire()) })
      const renommes = await Promise.all(sources.map(lire))
      await api.personnesCommander({ type: 'dissocierSelection', locuteurId: commun,
        participations: [{ entretienId: sources[0], participationId: 'participation-partagee' }],
        attendu: JSON.stringify(await api.personnesInventaire()) })
      const dissocies = await Promise.all(sources.map(lire))
      return { commun, avant, regroupes, renommes, dissocies, ancienRefuse, intact }
    })
    expect(resultat.ancienRefuse).toBe(true)
    expect(resultat.intact).toBe(true)
    expect(resultat.regroupes.map((e) => e.locuteurs[0].personneRef)).toEqual([resultat.commun, resultat.commun])
    expect(resultat.regroupes.map((e) => e.locuteurs[0].nom)).toEqual(['K. Martin', 'Madame Martin'])
    expect(resultat.renommes.map((e) => e.locuteurs[0].nom)).toEqual(['Nom aligné', 'Nom aligné'])
    expect(resultat.dissocies[0].locuteurs[0].personneRef).toBeTruthy()
    expect(resultat.dissocies[0].locuteurs[0].personneRef).not.toBe(resultat.commun)
    expect(resultat.dissocies[1].locuteurs[0].personneRef).toBe(resultat.commun)
    for (const [i, entretien] of resultat.dissocies.entries()) {
      expect(entretien.formatVersion).toBe(9)
      expect(entretien).not.toHaveProperty('participations')
      expect(entretien.corpsTexte).toEqual(resultat.avant[i].corpsTexte)
      expect(entretien.notes).toEqual(resultat.avant[i].notes)
      expect(entretien.locuteurs[0]).toMatchObject({ id: 'participation-partagee', index: 7,
        couleur: '#123456', interviewer: resultat.avant[i].locuteurs[0].interviewer, valeursLoc: {} })
    }
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
