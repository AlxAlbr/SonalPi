import { describe, expect, it } from 'vitest'
import { avecAttente, messageAttente, pendantChoixUtilisateur } from '../src/renderer/attente'

describe('Attente bloquante', () => {
  it('affiche le message pendant l’opération et le retire ensuite', async () => {
    let pendant: string | null = null
    await avecAttente('Ouverture de l’entretien…', async () => { pendant = messageAttente.value })
    expect(pendant).toBe('Ouverture de l’entretien…')
    expect(messageAttente.value).toBeNull()
  })

  it('retire le voile même si l’opération échoue', async () => {
    await expect(avecAttente('Envoi…', async () => { throw new Error('refus') })).rejects.toThrow('refus')
    expect(messageAttente.value).toBeNull()
  })

  it('montre l’opération la plus récente, puis revient à la précédente', async () => {
    const vus: (string | null)[] = []
    await avecAttente('Ouverture du corpus…', async () => {
      await avecAttente('Ouverture de l’entretien…', async () => { vus.push(messageAttente.value) })
      vus.push(messageAttente.value)
    })
    expect(vus).toEqual(['Ouverture de l’entretien…', 'Ouverture du corpus…'])
  })

  it('s’efface pendant qu’une question attend une réponse', async () => {
    const vus: (string | null)[] = []
    await avecAttente('Ouverture du corpus…', async () => {
      await pendantChoixUtilisateur(async () => { vus.push(messageAttente.value) })
      vus.push(messageAttente.value)
    })
    expect(vus).toEqual([null, 'Ouverture du corpus…'])
  })
})
