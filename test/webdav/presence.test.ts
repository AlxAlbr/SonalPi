/**
 * Tests de la PRÉSENCE (plan-multiuser.md §9, E4) contre le serveur WebDAV
 * embarqué : publication périodique « qui consulte quoi », filtrage des
 * périmées (> 10 min) et de notre propre poste, robustesse best effort
 * (dossier absent, fichier corrompu). La présence est JAMAIS décisionnelle :
 * ces tests ne vérifient qu'UNE chose — elle dit la vérité sur les autres.
 */

import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { ClientWebDAV } from '../../src/main/webdav/client'
import {
  PRESENCE_PERIMEE_MS,
  PresenceDistante,
} from '../../src/main/distant/presence'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const dirMiroir = mkdtempSync(join(tmpdir(), 'presence-'))
  return { serveur, client, dirMiroir }
}

describe('PresenceDistante (§9, E4)', () => {
  it('battre publie NOTRE présence ; lister exclut notre poste', async () => {
    const b = banc()
    const p = new PresenceDistante(b.client, () => ({
      userId: 'max',
      machineId: 'poste-1',
      sessionId: 's-1',
    }))
    await p.battre()

    // Le fichier existe au nom attendu (userId-machineId), avec l'entretien ouvert.
    await p.noterEntretienOuvert('ent-a')
    const brut = JSON.parse(b.serveur.contenuDe('presence/max-poste-1.json')!) as Record<string, unknown>
    expect(brut.userId).toBe('max')
    expect(brut.machineId).toBe('poste-1')
    expect(brut.entretienOuvert).toBe('ent-a')
    expect(typeof brut.refreshedAt).toBe('string')

    // Notre propre présence n'apparaît jamais dans la liste.
    await expect(p.lister()).resolves.toEqual([])
  })

  it('lister voit les AUTRES postes vivants, filtre périmées et corrompues', async () => {
    const b = banc()
    const p = new PresenceDistante(b.client, () => ({
      userId: 'max',
      machineId: 'poste-1',
      sessionId: 's-1',
    }))
    // Olivier : présence vivante, entretien ouvert.
    b.serveur.poser(
      'presence/olivier-poste-2.json',
      JSON.stringify({
        userId: 'olivier',
        machineId: 'poste-2',
        entretienOuvert: 'ent-a',
        refreshedAt: new Date().toISOString(),
      }),
    )
    // Une présence PÉRIMÉE (> 10 min).
    b.serveur.poser(
      'presence/claire-poste-3.json',
      JSON.stringify({
        userId: 'claire',
        machineId: 'poste-3',
        entretienOuvert: 'ent-b',
        refreshedAt: new Date(Date.now() - PRESENCE_PERIMEE_MS - 1000).toISOString(),
      }),
    )
    // Un fichier ILLISIBLE : ignoré sans faire tomber la liste.
    b.serveur.poser('presence/fantome-poste-4.json', '{corrompu')

    const liste = await p.lister()
    expect(liste.map((x) => x.userId)).toEqual(['olivier'])
    expect(liste[0].entretienOuvert).toBe('ent-a')
  })

  it('dossier absent (personne n’a encore publié) → liste vide, jamais une erreur', async () => {
    const b = banc()
    const p = new PresenceDistante(b.client, () => ({
      userId: 'max',
      machineId: 'poste-1',
      sessionId: 's-1',
    }))
    await expect(p.lister()).resolves.toEqual([])
    expect(join(b.dirMiroir, 'presence')).toBeDefined() // (le miroir reste hors jeu)
  })
})
