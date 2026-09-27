/**
 *  Capacité de service des plages — mesurée, jamais déduite.
 *
 *  Ce qui compte ici : un `Accept-Ranges` absent ne condamne pas un serveur
 *  (les deux serveurs qualifiés l'omettaient), un `200` sur une plage le
 *  condamne, et une panne ne prouve rien du tout.
 */

import { describe, expect, test } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { CapacitePlagesBase } from '../../src/main/medias/capacite'
import { ServeurWebDAVMemoire } from '../webdav/serveurWebdavMemoire'

const MEDIA = 'audios/e1.mp3'

function banc(octets = 200_000) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poserMedia(MEDIA, new Uint8Array(octets), 'audio/mpeg')
  return { serveur, client: serveur.client() }
}

describe('capacité des plages', () => {
  test('un serveur conforme est mesuré « oui », sans Accept-Ranges', async () => {
    const { serveur, client } = banc()
    // Le banc n'envoie jamais Accept-Ranges : la capacité ne peut pas venir de là.
    const reponse = await client.getPlage(MEDIA, { debut: 0, fin: 10 })
    expect(reponse.headers.get('accept-ranges')).toBeNull()
    await reponse.body?.cancel()

    const capacite = new CapacitePlagesBase()

    expect(await capacite.mesurer(client, MEDIA)).toBe('oui')
    expect(capacite.valeur).toBe('oui')
  })

  test('un serveur qui ignore les plages est mesuré « non », sans rien télécharger', async () => {
    const { serveur, client } = banc()
    serveur.variantes.plagesIgnorees = true
    const capacite = new CapacitePlagesBase()

    expect(await capacite.mesurer(client, MEDIA)).toBe('non')
  })

  test('un Content-Range incohérent vaut « non » : le contrat est strict', async () => {
    const { serveur, client } = banc()
    serveur.variantes.contentRangeFaux = true

    expect(await new CapacitePlagesBase().mesurer(client, MEDIA)).toBe('non')
  })

  test('un fichier plus petit que la sonde reste mesuré « oui »', async () => {
    const { client } = banc(700)

    expect(await new CapacitePlagesBase().mesurer(client, MEDIA)).toBe('oui')
  })

  test('une taille inconnue produit quand même une plage fermée et bornée', async () => {
    let range: string | null = null
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      async (entree, init) => {
        const requete = new Request(entree, init)
        if (requete.method === 'HEAD') {
          return new Response(null, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
        }
        range = requete.headers.get('range')
        return new Response(new Uint8Array(700), {
          status: 206,
          headers: {
            'Content-Range': 'bytes 0-699/700',
            'Content-Length': '700',
          },
        })
      },
    )

    expect(await new CapacitePlagesBase().mesurer(client, MEDIA)).toBe('oui')
    expect(range).toBe('bytes=0-4095')
  })

  test('une panne laisse la capacité inconnue, et la mesure reste rejouable', async () => {
    const { serveur } = banc()
    serveur.variantes.delaiMs = 300
    const rapide = serveur.client(serveur.identifiants, { requeteMs: 30 })
    const capacite = new CapacitePlagesBase()

    expect(await capacite.mesurer(rapide, MEDIA)).toBe('inconnue')
    expect(capacite.valeur).toBe('inconnue')

    serveur.variantes.delaiMs = 0
    expect(await capacite.mesurer(serveur.client(), MEDIA)).toBe('oui')
  })

  test('un média absent ou des droits refusés remontent, sans verdict de capacité', async () => {
    const { serveur, client } = banc()
    const capacite = new CapacitePlagesBase()

    await expect(capacite.mesurer(client, 'audios/absent.mp3')).rejects.toMatchObject({
      motif: 'fichier-absent',
    })
    const mauvais = serveur.client({ utilisateur: 'max', motDePasse: 'faux' })
    await expect(capacite.mesurer(mauvais, MEDIA)).rejects.toMatchObject({ motif: 'droits' })
    expect(capacite.valeur).toBe('inconnue')
  })

  test('un verdict est mis en cache : on ne sonde pas le serveur à chaque lecture', async () => {
    const { serveur } = banc()
    let lectures = 0
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      (entree, init) => {
        if (new Request(entree, init).method === 'GET') lectures += 1
        return serveur.fetch(entree, init)
      },
    )
    const capacite = new CapacitePlagesBase()

    await capacite.mesurer(client, MEDIA)
    const apresLaSonde = lectures
    // D'autres médias de la même base ne relancent pas de mesure.
    await capacite.mesurer(client, 'audios/e2.mp3')
    await capacite.mesurer(client, MEDIA)

    expect(apresLaSonde).toBe(1)
    expect(lectures).toBe(apresLaSonde)
  })
})
