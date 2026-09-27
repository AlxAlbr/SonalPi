/**
 *  Contrat de lecture WebDAV — sur le banc mémoire, donc sur des dialectes
 *  qu'un serveur réel ne produit pas à volonté.
 *
 *  Ce qui est en jeu : un média ne doit jamais être téléchargé en silence,
 *  assemblé de deux versions, ni transmis à moitié. Chaque refus est donc
 *  nommé, et chaque refus a sa raison.
 */

import { describe, expect, test, vi } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import {
  analyserEnteteRange,
  ErreurLectureMedia,
  informationMedia,
  lirePlage,
} from '../../src/main/webdav/lectureMedia'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const MEDIA = 'audios/e1.mp3'
const OCTETS = 10_000

function octets(longueur: number, graine = 0): Uint8Array {
  return Uint8Array.from({ length: longueur }, (_, i) => (i + graine) % 251)
}

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poserMedia(MEDIA, octets(OCTETS), 'audio/mpeg')
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  return { serveur, client }
}

function lireTout(corps: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return (async () => {
    const morceaux: Uint8Array[] = []
    const lecteur = corps.getReader()
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      morceaux.push(value)
    }
    const total = morceaux.reduce((somme, m) => somme + m.byteLength, 0)
    const sortie = new Uint8Array(total)
    let position = 0
    for (const morceau of morceaux) {
      sortie.set(morceau, position)
      position += morceau.byteLength
    }
    return sortie
  })()
}

describe('plage demandée par le lecteur', () => {
  test('seules les deux formes exprimables sont acceptées', () => {
    expect(analyserEnteteRange('bytes=0-1023')).toEqual({ debut: 0, fin: 1023 })
    expect(analyserEnteteRange('bytes=2048-')).toEqual({ debut: 2048 })
    // Suffixe et plages multiples : non exprimables par le contrat.
    expect(analyserEnteteRange('bytes=-500')).toBeNull()
    expect(analyserEnteteRange('bytes=0-99,200-299')).toBeNull()
    expect(analyserEnteteRange('octets=0-99')).toBeNull()
    expect(analyserEnteteRange('bytes=99-0')).toBeNull()
    expect(analyserEnteteRange(null)).toBeNull()
  })
})

describe('information sur un média', () => {
  test('HEAD donne taille, type, ETag et date', async () => {
    const { client } = banc()

    const info = await informationMedia(client, MEDIA)

    expect(info).toMatchObject({
      taille: OCTETS,
      typeMime: 'audio/mpeg',
      typeMedia: 'audio/mpeg',
      etag: expect.stringMatching(/^etag-/),
      dernierModifie: 'Tue, 15 Sep 2026 10:00:00 GMT',
    })
    expect(info.validateur).toBe(`"${info.etag}"`)
  })

  test('un HEAD refusé retombe sur le PROPFIND de profondeur 0', async () => {
    const { serveur, client } = banc()
    serveur.variantes.headRefuse = true

    const info = await informationMedia(client, MEDIA)

    expect(info).toMatchObject({ taille: OCTETS, typeMime: 'audio/mpeg' })
  })

  test('un HEAD sans information retombe aussi sur le PROPFIND', async () => {
    const { serveur } = banc()
    let propfind = 0
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      (entree, init) => {
        const requete = new Request(entree, init)
        if (requete.method === 'HEAD') return Promise.resolve(new Response(null, { status: 200 }))
        if (requete.method === 'PROPFIND') propfind += 1
        return serveur.fetch(entree, init)
      },
    )

    const info = await informationMedia(client, MEDIA)

    expect(propfind).toBe(1)
    expect(info.taille).toBe(OCTETS)
  })

  test('un refus du PROPFIND n’est pas masqué après le repli', async () => {
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      async (entree, init) =>
        new Request(entree, init).method === 'HEAD'
          ? new Response(null, { status: 405 })
          : new Response(null, { status: 401 }),
    )

    await expect(informationMedia(client, MEDIA)).rejects.toMatchObject({ motif: 'droits' })
  })

  test('un type absent ou invraisemblable est remplacé par celui de l\'extension', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poserMedia('audios/e1.bin', octets(10), 'application/octet-stream')
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      serveur.fetch,
    )

    const info = await informationMedia(client, 'audios/e1.bin')

    expect(info.typeMedia).toBe('application/octet-stream')
  })

  test('un média absent ou des droits refusés sont nommés, pas confondus', async () => {
    const { serveur, client } = banc()

    await expect(informationMedia(client, 'audios/absent.mp3')).rejects.toMatchObject({
      motif: 'fichier-absent',
    })

    const mauvais = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: { utilisateur: 'max', motDePasse: 'faux' } },
      serveur.fetch,
    )
    await expect(informationMedia(mauvais, MEDIA)).rejects.toMatchObject({ motif: 'droits' })
  })
})

describe('lecture d\'une plage', () => {
  test('une plage fermée rend exactement les octets demandés, en flux', async () => {
    const { client } = banc()

    const lecture = await lirePlage(client, MEDIA, { debut: 1000, fin: 1999 })

    expect(lecture.debut).toBe(1000)
    expect(lecture.fin).toBe(1999)
    expect(lecture.total).toBe(OCTETS)
    expect(lecture.version).not.toBeNull()
    expect(await lireTout(lecture.corps)).toEqual(octets(1000, 1000))
  })

  test('une plage ouverte va jusqu\'à la fin du fichier', async () => {
    const { client } = banc()

    const lecture = await lirePlage(client, MEDIA, { debut: 9000 })

    expect(lecture.fin).toBe(OCTETS - 1)
    expect((await lireTout(lecture.corps)).byteLength).toBe(1000)
  })

  test('la version observée change quand le fichier est remplacé', async () => {
    const { serveur, client } = banc()
    const premiere = await lirePlage(client, MEDIA, { debut: 0, fin: 99 })
    await lireTout(premiere.corps)
    serveur.poserMedia(MEDIA, octets(OCTETS, 7), 'audio/mpeg')
    const seconde = await lirePlage(client, MEDIA, { debut: 0, fin: 99 })
    await lireTout(seconde.corps)

    expect(seconde.version).not.toBe(premiere.version)
  })

  test('un 200 sur une demande de plage annule le corps : aucun téléchargement silencieux', async () => {
    const { serveur, client } = banc()
    serveur.variantes.plagesIgnorees = true

    const promesse = lirePlage(client, MEDIA, { debut: 0, fin: 99 })

    await expect(promesse).rejects.toMatchObject({ motif: 'plage-non-honoree' })
  })

  test('un 200 après un validateur conditionnel signifie : le média a changé', async () => {
    const { serveur, client } = banc()
    const info = await informationMedia(client, MEDIA)
    serveur.variantes.plagesIgnorees = true

    await expect(
      lirePlage(client, MEDIA, { debut: 0, fin: 99 }, { validateur: info.validateur! }),
    ).rejects.toMatchObject({ motif: 'version-changee' })
  })

  test('un Content-Range qui ne décrit pas la demande est refusé', async () => {
    const { serveur, client } = banc()
    serveur.variantes.contentRangeFaux = true

    await expect(lirePlage(client, MEDIA, { debut: 4000, fin: 4095 })).rejects.toMatchObject({
      motif: 'plage-incoherente',
    })
  })

  test('une plage incohérente annule son corps immédiatement', async () => {
    let corpsAnnule = false
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      async () => new Response(
        new ReadableStream({
          pull() {
            // Le serveur attendrait ici tant que le client ne coupe pas la réponse.
          },
          cancel() {
            corpsAnnule = true
          },
        }),
        {
          status: 206,
          headers: {
            'Content-Range': 'bytes 1-100/10000',
            'Content-Length': '100',
          },
        },
      ),
    )

    await expect(lirePlage(client, MEDIA, { debut: 0, fin: 99 })).rejects.toMatchObject({
      motif: 'plage-incoherente',
    })
    expect(corpsAnnule).toBe(true)
  })

  test('un corps plus court qu\'annoncé est coupé, jamais complété', async () => {
    const { serveur, client } = banc()
    serveur.variantes.corpTronque = true

    const lecture = await lirePlage(client, MEDIA, { debut: 0, fin: 999 })

    await expect(lireTout(lecture.corps)).rejects.toBeInstanceOf(ErreurLectureMedia)
  })

  test('un corps plus long qu\'annoncé est coupé à la longueur servie', async () => {
    const { serveur, client } = banc()
    serveur.variantes.corpsTropLong = true

    const lecture = await lirePlage(client, MEDIA, { debut: 0, fin: 99 })

    await expect(lireTout(lecture.corps)).rejects.toMatchObject({ motif: 'plage-incoherente' })
  })

  test('une coupure en cours de route interrompt la lecture', async () => {
    const { serveur, client } = banc()
    serveur.variantes.coupureMilieu = true

    const lecture = await lirePlage(client, MEDIA, { debut: 0, fin: 999 })

    await expect(lireTout(lecture.corps)).rejects.toBeInstanceOf(ErreurLectureMedia)
  })

  test('une 416 inattendue est refusée', async () => {
    const { serveur, client } = banc()
    serveur.variantes.plageHorsBornes = true

    await expect(lirePlage(client, MEDIA, { debut: 0, fin: 99 })).rejects.toMatchObject({
      motif: 'plage-hors-bornes',
    })
  })

  test('un délai dépassé est une indisponibilité, pas un refus de droits', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poserMedia(MEDIA, octets(OCTETS), 'audio/mpeg')
    serveur.variantes.delaiMs = 200
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      serveur.fetch,
      { requeteMs: 40 },
    )

    await expect(lirePlage(client, MEDIA, { debut: 0, fin: 99 })).rejects.toMatchObject({
      motif: 'indisponible',
    })
  })

  test('l\'annulation de l\'appelant interrompt la lecture en cours', async () => {
    const { client } = banc()
    const lecture = await lirePlage(client, MEDIA, { debut: 0 })
    const lecteur = lecture.corps.getReader()
    await lecteur.read() // le premier morceau est passé

    lecture.annuler()

    await expect(lecteur.read()).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('un signal extérieur coupe la lecture comme une annulation', async () => {
    const { client } = banc()
    const controleur = new AbortController()
    const lecture = await lirePlage(client, MEDIA, { debut: 0 }, { signal: controleur.signal })
    const lecteur = lecture.corps.getReader()

    controleur.abort()

    await expect(lecteur.read()).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('un signal déjà annulé atteint le fetch sans lancer de lecture', async () => {
    const faireRequete = vi.fn(async (_entree: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      throw new DOMException('Annulé', 'AbortError')
    })
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      faireRequete,
    )
    const controleur = new AbortController()
    controleur.abort()

    await expect(
      lirePlage(client, MEDIA, { debut: 0, fin: 99 }, { signal: controleur.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(faireRequete).toHaveBeenCalledOnce()
  })
})
