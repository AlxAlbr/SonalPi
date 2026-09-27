import { describe, expect, test, vi } from 'vitest'
import type { ClientWebDAV } from '../../src/main/webdav/client'
import { ErreurHttp } from '../../src/main/webdav/client'
import {
  listerDossierMedia,
  verifierCheminMediaRelatif,
  verifierMediaDesignable,
} from '../../src/main/medias/designation'

describe('désignation d’un média WebDAV pour GitLab', () => {
  test('inventorie la base sans rendre son adresse ni ses identifiants', async () => {
    const propfind = vi.fn(async () => [
      { chemin: 'entretien.mp3', dossier: false, etag: null },
      { chemin: 'audio', dossier: true, etag: null },
      { chemin: '../hors-base', dossier: false, etag: null },
    ])
    const client = { propfind } as unknown as ClientWebDAV

    await expect(listerDossierMedia(client, '')).resolves.toEqual({
      ok: true,
      entrees: [
        { nom: 'audio', dossier: true },
        { nom: 'entretien.mp3', dossier: false },
      ],
    })
    expect(propfind).toHaveBeenCalledWith('')
  })

  test.each([
    '../secret.mp3',
    '/audio/a.mp3',
    'audio\\a.mp3',
    'audio//a.mp3',
    'audio/%252e%252e/secret.mp3',
    'audio/a.mp3?telechargement=1',
    'documents/notice.pdf',
  ])('refuse le chemin ambigu %s', (chemin) => {
    expect(() => verifierCheminMediaRelatif(chemin)).toThrow(/invalide|désignable/)
  })

  test('refuse une remontée de dossier sans appeler le serveur', async () => {
    const propfind = vi.fn()
    const client = { propfind } as unknown as ClientWebDAV

    await expect(listerDossierMedia(client, '../hors-base')).resolves.toEqual({
      ok: false,
      motif: 'chemin-invalide',
    })
    expect(propfind).not.toHaveBeenCalled()
  })

  test('vérifie le fichier par ses informations sans demander son corps', async () => {
    const informationFichier = vi.fn(async () => ({
      taille: 12_000,
      typeMime: 'audio/mpeg',
      etag: 'media-1',
      dernierModifie: null,
    }))
    const getPlage = vi.fn()
    const client = { informationFichier, getPlage } as unknown as ClientWebDAV

    await expect(verifierMediaDesignable(client, 'audio/e1.mp3')).resolves.toEqual({ ok: true })
    expect(informationFichier).toHaveBeenCalledWith('audio/e1.mp3', {})
    expect(getPlage).not.toHaveBeenCalled()
  })

  test('traite un fichier renommé entre la liste et la confirmation comme absent', async () => {
    const client = {
      informationFichier: vi.fn(async () => {
        throw new ErreurHttp(404, 'absent')
      }),
    } as unknown as ClientWebDAV

    await expect(verifierMediaDesignable(client, 'audio/ancien.mp3')).resolves.toEqual({
      ok: false,
      motif: 'fichier-absent',
    })
  })
})
