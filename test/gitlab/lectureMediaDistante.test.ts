import { describe, expect, test, vi } from 'vitest'
import { RelaisMediaDistant } from '../../src/main/medias/lectureDistante'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { informationMedia } from '../../src/main/webdav/lectureMedia'
import { ServeurWebDAVMemoire } from '../webdav/serveurWebdavMemoire'

const CHEMIN = 'audios/entretien.mp3'
const OCTETS = new TextEncoder().encode('0123456789abcdefghijklmnopqrstuvwxyz')

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poserMedia(CHEMIN, OCTETS, 'audio/mpeg')
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  return { serveur, client }
}

describe('relais opaque de lecture distante', () => {
  test('sert plusieurs plages exactes sans exposer le chemin WebDAV', async () => {
    const { serveur, client } = banc()
    const signaler = vi.fn()
    const relais = new RelaisMediaDistant(signaler)
    const url = relais.ouvrir({
      id: 'entretien-1',
      generation: 7,
      chemin: CHEMIN,
      client,
      information: await informationMedia(client, CHEMIN),
    })

    expect(url).toMatch(/^sonal-media:\/\/distant\/[0-9a-f-]+$/)
    expect(url).not.toContain('audios')
    expect(url).not.toContain(serveur.identifiants.utilisateur)
    expect(url).not.toContain(serveur.identifiants.motDePasse)
    const jeton = new URL(url).pathname.slice(1)

    const debut = await relais.servir(jeton, 7, 'GET', 'bytes=0-5')
    expect(debut.status).toBe(206)
    expect(debut.headers.get('content-range')).toBe(`bytes 0-5/${OCTETS.length}`)
    expect(await debut.text()).toBe('012345')

    const milieu = await relais.servir(jeton, 7, 'GET', 'bytes=20-25')
    expect(milieu.status).toBe(206)
    expect(milieu.headers.get('content-range')).toBe(`bytes 20-25/${OCTETS.length}`)
    expect(await milieu.text()).toBe('klmnop')
    expect(signaler).not.toHaveBeenCalled()
  })

  test('un seek annule la plage précédente', async () => {
    const { client } = banc()
    const relais = new RelaisMediaDistant(vi.fn())
    const url = relais.ouvrir({
      id: 'entretien-1',
      generation: 1,
      chemin: CHEMIN,
      client,
      information: await informationMedia(client, CHEMIN),
    })
    const jeton = new URL(url).pathname.slice(1)

    const ancienne = await relais.servir(jeton, 1, 'GET', 'bytes=0-20')
    const nouvelle = await relais.servir(jeton, 1, 'GET', 'bytes=25-30')
    await expect(ancienne.arrayBuffer()).rejects.toMatchObject({ name: 'AbortError' })
    expect(await nouvelle.text()).toBe('pqrstu')
  })

  test('refuse les plages suffixes, multiples et les anciennes générations', async () => {
    const { client } = banc()
    const relais = new RelaisMediaDistant(vi.fn())
    const url = relais.ouvrir({
      id: 'entretien-1',
      generation: 2,
      chemin: CHEMIN,
      client,
      information: await informationMedia(client, CHEMIN),
    })
    const jeton = new URL(url).pathname.slice(1)

    expect((await relais.servir(jeton, 2, 'GET', 'bytes=-5')).status).toBe(416)
    expect((await relais.servir(jeton, 2, 'GET', 'bytes=0-1,4-5')).status).toBe(416)
    expect((await relais.servir(jeton, 3, 'GET', 'bytes=0-5')).status).toBe(404)
  })

  test('interrompt la session et demande un rechargement si le fichier est remplacé', async () => {
    const { serveur, client } = banc()
    const signaler = vi.fn()
    const relais = new RelaisMediaDistant(signaler)
    const url = relais.ouvrir({
      id: 'entretien-1',
      generation: 1,
      chemin: CHEMIN,
      client,
      information: await informationMedia(client, CHEMIN),
    })
    const jeton = new URL(url).pathname.slice(1)
    serveur.poserMedia(CHEMIN, new TextEncoder().encode('nouvelle version'), 'audio/mpeg')

    expect((await relais.servir(jeton, 1, 'GET', 'bytes=0-5')).status).toBe(409)
    expect(signaler).toHaveBeenCalledWith({
      id: 'entretien-1',
      jeton,
      chemin: CHEMIN,
      motif: 'version-changee',
    })
    expect((await relais.servir(jeton, 1, 'GET', 'bytes=0-5')).status).toBe(404)
  })

  test('annule immédiatement une réponse 200 au lieu de transmettre son corps', async () => {
    const { serveur, client } = banc()
    const signaler = vi.fn()
    const relais = new RelaisMediaDistant(signaler)
    const information = await informationMedia(client, CHEMIN)
    const url = relais.ouvrir({
      id: 'entretien-1',
      generation: 1,
      chemin: CHEMIN,
      client,
      information,
    })
    serveur.variantes.plagesIgnorees = true
    const jeton = new URL(url).pathname.slice(1)

    expect((await relais.servir(jeton, 1, 'GET', 'bytes=0-5')).status).toBe(409)
    expect(signaler).toHaveBeenCalledWith({
      id: 'entretien-1',
      jeton,
      chemin: CHEMIN,
      motif: 'version-changee',
    })
  })
})
