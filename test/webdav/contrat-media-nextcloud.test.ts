/**
 *  Contrat de lecture d'un média contre les Nextcloud DOCKER réels.
 *
 *  Le banc mémoire prouve le contrat face à des dialectes inventés ; il ne
 *  prouve rien sur un serveur vrai. Ce fichier rejoue donc l'essentiel — HEAD,
 *  repli PROPFIND, plages exactes, capacité mesurée — sur les deux piles, avec
 *  un fichier média déposé puis retiré par le test lui-même.
 *
 *  SKIPPÉ AUTOMATIQUEMENT si la pile ne répond pas :
 *   npm run nc:up && npm run nc:provision   → puis npm test
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import {
  ErreurLectureMedia,
  informationMedia,
  lirePlage,
} from '../../src/main/webdav/lectureMedia'
import { CapacitePlagesBase } from '../../src/main/medias/capacite'

const PILES = [
  { nom: 'A (NC31 + files_lock, :8080)', base: 'http://localhost:8080' },
  { nom: 'B (NC29 sans files_lock, :8081)', base: 'http://localhost:8081' },
]
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const DOSSIER = 'media-sonde'
const MEDIA = `${DOSSIER}/plage.mp3`
const TAILLE = 64 * 1024

/** Contenu déterministe : les octets attendus sont calculables sur place. */
function octets(longueur: number): Uint8Array {
  return Uint8Array.from({ length: longueur }, (_, i) => i % 251)
}

const pret = (base: string): Promise<boolean> =>
  fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)

for (const pile of PILES) {
  const corpus = `${pile.base}/remote.php/dav/files/max/MonCorpus`
  const client = new ClientWebDAV({ baseUrl: corpus, identifiants: MAX })

  describe.skipIf(!(await pret(pile.base)))(`Lecture d'un média — Nextcloud réel, pile ${pile.nom}`, () => {
    beforeAll(async () => {
      await client.creerDossier(DOSSIER).catch(() => undefined)
      await client.putBinaire(MEDIA, octets(TAILLE), { contentType: 'audio/mpeg' }).catch(() => undefined)
    }, 30_000)

    afterAll(async () => {
      await client.supprimer(MEDIA).catch(() => undefined)
      await client.supprimer(DOSSIER).catch(() => undefined)
    }, 30_000)

    it('l\'information du fichier est complète', { timeout: 30_000 }, async () => {
      const info = await informationMedia(client, MEDIA)

      expect(info.taille).toBe(TAILLE)
      expect(info.etag).toBeTruthy()
      expect(info.validateur).toBeTruthy()
      expect(info.typeMedia).toMatch(/^(audio|video)\//)
    })

    it('un HEAD refusé retombe sur le PROPFIND réel', { timeout: 30_000 }, async () => {
      // Le serveur ne refuse jamais HEAD ; on le simule pour éprouver le repli
      // sur les PROPFIND qu'il produit réellement.
      const sansHead = new ClientWebDAV(
        { baseUrl: corpus, identifiants: MAX },
        (entree, init) =>
          new Request(entree, init).method === 'HEAD'
            ? Promise.resolve(new Response('Method Not Allowed', { status: 405 }))
            : fetch(entree, init),
      )

      const info = await informationMedia(sansHead, MEDIA)

      expect(info.taille).toBe(TAILLE)
      expect(info.etag).toBeTruthy()
    })

    it('une plage fermée rend exactement les octets demandés', { timeout: 30_000 }, async () => {
      const lecture = await lirePlage(client, MEDIA, { debut: 10_000, fin: 20_479 })

      expect(lecture.debut).toBe(10_000)
      expect(lecture.fin).toBe(20_479)
      const recu = new Uint8Array(await new Response(lecture.corps).arrayBuffer())
      expect(recu).toEqual(octets(TAILLE).subarray(10_000, 20_480))
    })

    it('une plage ouverte va jusqu\'à la fin du fichier', { timeout: 30_000 }, async () => {
      const lecture = await lirePlage(client, MEDIA, { debut: TAILLE - 1024 })

      expect(lecture.fin).toBe(TAILLE - 1)
      const recu = new Uint8Array(await new Response(lecture.corps).arrayBuffer())
      expect(recu.byteLength).toBe(1024)
    })

    it('la capacité des plages est mesurée « oui » par une vraie lecture', { timeout: 30_000 }, async () => {
      // `Accept-Ranges` n'est pas consulté : les deux serveurs qualifiés
      // l'omettent alors que leurs plages fonctionnent.
      const capacite = new CapacitePlagesBase()
      expect(await capacite.mesurer(client, MEDIA)).toBe('oui')
    })

    it('un média absent est un état normal, pas une panne', { timeout: 30_000 }, async () => {
      await expect(informationMedia(client, `${DOSSIER}/absent.mp3`)).rejects.toMatchObject({
        motif: 'fichier-absent',
      })
      await expect(
        lirePlage(client, `${DOSSIER}/absent.mp3`, { debut: 0, fin: 99 }),
      ).rejects.toBeInstanceOf(ErreurLectureMedia)
    })

    it('des identifiants refusés sont distingués d\'un média illisible', { timeout: 30_000 }, async () => {
      const mauvais = new ClientWebDAV({
        baseUrl: corpus,
        identifiants: { utilisateur: 'max', motDePasse: 'faux' },
      })

      await expect(informationMedia(mauvais, MEDIA)).rejects.toMatchObject({ motif: 'droits' })
    })
  })
}

// Une qualification absente doit se voir : un silence ne dit pas si le contrat
// a été rejoué ou simplement sauté.
const qualification = await Promise.all(PILES.map((pile) => pret(pile.base)))
if (!qualification.some(Boolean)) {
  describe('Lecture d\'un média — qualification réelle', () => {
    it('aucune pile Nextcloud n\'a répondu (npm run nc:up puis npm test pour activer)', () => {
      expect(qualification).toEqual([false, false])
    })
  })
}
