/**
 *  Le miroir d'un corpus GitLab ne cherche pas les médias désignés.
 *
 *  Un dépôt GitLab porte les transcriptions, pas les fichiers volumineux : une
 *  désignation y désigne un média logé dans la base déclarée par la personne.
 *  Le miroir ne doit donc ni l'inventorier, ni le rapporter, ni le déclarer
 *  inaccessible — sa résolution appartient au module média.
 *
 *  Un corpus WebDAV, lui, CONTINUE de rapporter le média désigné : le média
 *  est dans le backend du corpus, dont le miroir est le miroir.
 */

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { MiroirDistant, type IdentiteMiroirDistant } from '../../src/main/distant/miroir'
import type { EntreeLectureDistante, LectureDistante } from '../../src/main/distant/lecture'
import type { TransfertFichiersDistants } from '../../src/main/distant/transfert'
import { corpusDistantValide, entretienDistantValide } from '../webdav/fixturesCorpusDistant'

const MEDIA = 'audios/e1.mp3'
const CHEMINS = ['corpus.json', 'entretiens', 'entretiens/e1.json', 'audios', MEDIA]

/** Port de transfert qui note ce qu'il rapporterait, sans lire le serveur. */
function transfertFactice() {
  const rapportes: string[] = []
  const port: TransfertFichiersDistants = {
    async telechargerFichier(chemin, destination) {
      rapportes.push(chemin)
      writeFileSync(destination, 'octets du média')
    },
    async televerserFichier() {
      return { ok: false, raison: 'indisponible' }
    },
  }
  return { port, rapportes }
}

/** Inventaire d'un dépôt ou d'un dossier : les médias y sont bien présents. */
function lectureFactice(designation: unknown = { chemin: MEDIA }) {
  const inventaires: string[] = []
  const lectures: string[] = []
  const toutes: EntreeLectureDistante[] = CHEMINS.map((chemin) => ({
    chemin,
    dossier: chemin === 'entretiens' || chemin === 'audios',
    empreinte: { type: 'gitlab-blob' as const, valeur: `version-${chemin}` },
  }))
  const lecture: LectureDistante = {
    async inventorier(dossier) {
      inventaires.push(dossier)
      if (dossier === '') return toutes
      // Contrat du miroir : les enfants sont nommés depuis le dossier demandé.
      const prefixe = `${dossier}/`
      return toutes
        .filter((e) => e.chemin.startsWith(prefixe))
        .map((e) => ({ ...e, chemin: e.chemin.slice(prefixe.length) }))
    },
    async lireTexte(chemin) {
      lectures.push(chemin)
      if (chemin === 'corpus.json') return corpusDistantValide(['e1'])
      return entretienDistantValide({
        meta: { valeursGen: {}, audioRef: null, audioDistant: designation as never },
      })
    },
  }
  return { lecture, inventaires, lectures }
}

function miroirDe(
  identite: IdentiteMiroirDistant,
  designation: unknown = { chemin: MEDIA, fournisseur: 'webdav' },
) {
  const { lecture, inventaires, lectures } = lectureFactice(designation)
  const { port, rapportes } = transfertFactice()
  const dir = mkdtempSync(join(tmpdir(), 'sonal-miroir-medias-'))
  const miroir = new MiroirDistant(dir, async () => lecture, identite, port)
  return { miroir, dir, inventaires, lectures, rapportes }
}

describe('miroir — un média désigné ne se résout que côté WebDAV', () => {
  test('un dépôt GitLab n\'inventorie pas le média désigné et ne le déclare pas inaccessible', async () => {
    const { miroir, inventaires, lectures, rapportes } = miroirDe({
      fournisseur: 'gitlab',
      destinationId: 'destination-gitlab',
    })

    const tirage = await miroir.tirer()

    expect(tirage.inaccessibles).toEqual([])
    expect(tirage.telecharges).toEqual(['corpus.json', 'entretiens/e1.json'])
    expect(inventaires).toEqual(['', 'entretiens'])
    expect(lectures).not.toContain(MEDIA)
    expect(rapportes).toEqual([])
  })

  test('un corpus WebDAV rapporte le média désigné, comme avant', async () => {
    const { miroir, dir, inventaires, rapportes } = miroirDe({
      fournisseur: 'webdav',
      destinationId: 'destination-webdav',
    })

    const tirage = await miroir.tirer()

    expect(rapportes).toEqual([MEDIA])
    expect(inventaires).toEqual(['', 'entretiens', 'audios'])
    expect(tirage.inaccessibles).toEqual([])
    expect(existsSync(join(dir, MEDIA))).toBe(true)
  })

  test('une référence historique, sans transport explicite, reste comprise', async () => {
    // Les entretiens publiés avant l\'apparition du champ `fournisseur`.
    const { miroir, rapportes } = miroirDe(
      { fournisseur: 'webdav', destinationId: 'destination-webdav' },
      { chemin: MEDIA },
    )

    await miroir.tirer()

    expect(rapportes).toEqual([MEDIA])
  })
})
