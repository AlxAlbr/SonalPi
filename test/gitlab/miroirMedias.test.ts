/** Le miroir distingue les médias du dépôt et ceux de la base externe. */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { MiroirDistant, type IdentiteMiroirDistant } from '../../src/main/distant/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import type { EntreeLectureDistante, LectureDistante } from '../../src/main/distant/lecture'
import type { TransfertFichiersDistants } from '../../src/main/distant/transfert'
import { corpusDistantValide, entretienDistantValide } from '../webdav/fixturesCorpusDistant'

const MEDIA = 'audios/e1.mp3'
const CHEMINS = ['corpus.crp', 'entretiens', 'entretiens/e1.json', 'audios', MEDIA]

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
      if (chemin === 'corpus.crp') return corpusDistantValide(['e1'])
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

describe('miroir — emplacement explicite des médias', () => {
  test('un arrêt pendant le premier média empêche le suivant et toute installation du tirage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-miroir-annulation-'))
    const annulation = new AbortController()
    const base = lectureFactice({ chemin: MEDIA, fournisseur: 'gitlab' }).lecture
    const lecture: LectureDistante = {
      async inventorier(dossier) {
        const entrees = await base.inventorier(dossier)
        if (dossier === 'entretiens' || dossier === 'audios') entrees.push({
          chemin: dossier === 'entretiens' ? 'e2.json' : 'e2.mp3', dossier: false,
          empreinte: { type: 'gitlab-blob', valeur: `version-${dossier}-e2` },
        })
        return entrees
      },
      async lireTexte(chemin) {
        return chemin === 'corpus.crp' ? corpusDistantValide(['e1', 'e2']) : entretienDistantValide({
          meta: { valeursGen: {}, audioRef: null, audioDistant: {
            chemin: chemin === 'entretiens/e1.json' ? MEDIA : 'audios/e2.mp3', fournisseur: 'gitlab',
          } },
        })
      },
    }
    const transfert = transfertFactice()
    const telecharger = transfert.port.telechargerFichier.bind(transfert.port)
    transfert.port.telechargerFichier = async (chemin, destination, progression) => {
      await telecharger(chemin, destination, progression)
      if (!annulation.signal.aborted) annulation.abort()
    }
    const miroir = new MiroirDistant(dir, async () => lecture,
      { fournisseur: 'gitlab', destinationId: 'migration' }, transfert.port)
    try {
      await expect(miroir.tirer([], annulation.signal)).rejects.toMatchObject({ name: 'AbortError' })
      expect(transfert.rapportes).toEqual([MEDIA])
      expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
      expect(existsSync(join(dir, MEDIA))).toBe(false)
      const tirage = await miroir.tirer()
      expect(tirage.inaccessibles).toEqual([])
      expect(transfert.rapportes).toEqual([MEDIA, MEDIA, 'audios/e2.mp3'])
      expect(existsSync(join(dir, 'corpus.crp'))).toBe(true)
      expect(existsSync(join(dir, 'audios/e2.mp3'))).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test('rapporte un média explicitement stocké dans GitLab', async () => {
    const { miroir, dir, inventaires, rapportes } = miroirDe(
      { fournisseur: 'gitlab', destinationId: 'destination-gitlab' },
      { chemin: MEDIA, fournisseur: 'gitlab' },
    )
    const tirage = await miroir.tirer()
    expect(rapportes).toEqual([MEDIA])
    expect(inventaires).toEqual(['', 'entretiens', 'audios'])
    expect(tirage.inaccessibles).toEqual([])
    expect(existsSync(join(dir, MEDIA))).toBe(true)
    const store = new CorpusStore(dir)
    store.fournisseurMiroir = 'gitlab'
    const audio = store.audios().e1?.audio
    expect(audio).toBe(join(dir, MEDIA))
    expect(store.cheminMediaAbs(audio!)).toBe(audio)
    await miroir.tirer()
    expect(rapportes).toEqual([MEDIA])
  })

  test('une référence GitLab historique reste externe même si un fichier homonyme existe dans le dépôt', async () => {
    const { miroir, inventaires, rapportes } = miroirDe(
      { fournisseur: 'gitlab', destinationId: 'destination-gitlab' },
      { chemin: MEDIA },
    )
    await miroir.tirer()
    expect(inventaires).toEqual(['', 'entretiens'])
    expect(rapportes).toEqual([])
  })
  test('un dépôt GitLab n\'inventorie pas le média désigné et ne le déclare pas inaccessible', async () => {
    const { miroir, inventaires, lectures, rapportes } = miroirDe({
      fournisseur: 'gitlab',
      destinationId: 'destination-gitlab',
    })

    const tirage = await miroir.tirer()

    expect(tirage.inaccessibles).toEqual([])
    expect(tirage.telecharges).toEqual(['corpus.crp', 'entretiens/e1.json'])
    expect(inventaires).toEqual(['', 'entretiens'])
    expect(lectures).not.toContain(MEDIA)
    expect(rapportes).toEqual([])
  })

  test('un cache homonyme ne transforme pas une référence externe en média du dépôt', async () => {
    const { miroir, dir } = miroirDe(
      { fournisseur: 'gitlab', destinationId: 'destination-gitlab' },
      { chemin: 'voix.mp3', fournisseur: 'webdav' },
    )
    await miroir.tirer()
    writeFileSync(join(dir, 'voix.mp3'), 'ancien cache')
    const store = new CorpusStore(dir)
    store.fournisseurMiroir = 'gitlab'
    expect(store.audios().e1?.audio).toBeUndefined()
    expect(store.cheminMediaAbs(join(dir, 'voix.mp3'))).toBeNull()
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
