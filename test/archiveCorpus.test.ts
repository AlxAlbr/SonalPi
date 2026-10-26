import { describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import {
  archiverCorpusLocal,
  collecterFichiersCorpus,
  construireZipCorpus,
  nomArchiveCorpus,
} from '../src/main/archiveCorpus'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
  },
}))

/** Corpus minimal sur disque : contenu réel + artefacts de protocole à exclure. */
function corpusSurDisque(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-archive-'))
  mkdirSync(join(dir, 'entretiens'))
  mkdirSync(join(dir, 'png'))
  mkdirSync(join(dir, 'DocsCadre'))
  mkdirSync(join(dir, 'corbeille'))
  mkdirSync(join(dir, 'verrous'))
  mkdirSync(join(dir, 'presence'))
  mkdirSync(join(dir, 'sessions'))
  writeFileSync(join(dir, 'corpus.json'), '{"nom":"Corpus A"}', 'utf8')
  writeFileSync(join(dir, 'entretiens', 'e1.json'), '{"titre":"Un"}', 'utf8')
  writeFileSync(join(dir, 'entretiens', 'reste.tmp'), 'temporaire', 'utf8')
  writeFileSync(join(dir, 'png', 'e1.png'), Buffer.from([1, 2, 3]))
  writeFileSync(join(dir, 'DocsCadre', 'methode.txt'), 'consigne', 'utf8')
  writeFileSync(join(dir, 'corbeille', 'e-ancien.json'), '{"titre":"Ancien"}', 'utf8')
  writeFileSync(join(dir, 'audio-locaux.json'), '{"e1":"/tmp/a.mp3"}', 'utf8')
  writeFileSync(join(dir, 'verrous', 'e1.lock.json'), 'verrou', 'utf8')
  writeFileSync(join(dir, 'presence', 'e1.json'), 'presence', 'utf8')
  writeFileSync(join(dir, 'sessions', 'divergence.json'), 'divergence', 'utf8')
  writeFileSync(join(dir, '.manifeste.json'), '{"formatVersion":1}', 'utf8')
  return dir
}

describe('copie de sauvegarde du corpus (ZIP)', () => {
  test('inventorie le contenu et laisse de côté le protocole et les temporaires', () => {
    const dir = corpusSurDisque()
    const relatifs = collecterFichiersCorpus(dir)
      .map((f) => f.relatif)
      .sort()

    expect(relatifs).toEqual([
      'DocsCadre/methode.txt',
      'audio-locaux.json',
      'corbeille/e-ancien.json',
      'corpus.json',
      'entretiens/e1.json',
      'png/e1.png',
    ])
  })

  test('l’archive décompressée restitue le contenu du corpus', async () => {
    const dir = corpusSurDisque()
    const { buffer, fichiers } = await construireZipCorpus(dir)
    expect(fichiers).toBe(6)

    const zip = await JSZip.loadAsync(buffer)
    // JSZip ajoute une entrée par dossier ; seuls les fichiers comptent ici.
    expect(
      Object.keys(zip.files)
        .filter((nom) => !nom.endsWith('/'))
        .sort(),
    ).toEqual([
      'DocsCadre/methode.txt',
      'audio-locaux.json',
      'corbeille/e-ancien.json',
      'corpus.json',
      'entretiens/e1.json',
      'png/e1.png',
    ])
    expect(await zip.file('corpus.json')!.async('string')).toBe('{"nom":"Corpus A"}')
    expect(await zip.file('entretiens/e1.json')!.async('string')).toBe('{"titre":"Un"}')
    expect(await zip.file('png/e1.png')!.async('uint8array')).toEqual(
      new Uint8Array([1, 2, 3]),
    )
  })

  test('conserve les documents imbriqués octet pour octet', async () => {
    const dir = corpusSurDisque()
    mkdirSync(join(dir, 'DocsCadre', 'DPO', 'École 2'), { recursive: true })
    const octets = Buffer.from([0, 255, 42, 13, 10])
    writeFileSync(join(dir, 'DocsCadre', 'DPO', 'École 2', 'notice.docx'), octets)
    const { buffer } = await construireZipCorpus(dir)
    const zip = await JSZip.loadAsync(buffer)
    expect(await zip.file('DocsCadre/DPO/École 2/notice.docx')!.async('nodebuffer')).toEqual(octets)
  })

  test('le nom par défaut unit le nom du corpus et la date', () => {
    expect(nomArchiveCorpus('Mon corpus', new Date('2024-05-03T12:00:00Z'))).toBe(
      'Mon corpus_2024-05-03.zip',
    )
  })

  test('un corpus distant est refusé sans ouvrir de dialogue', async () => {
    const resultat = await archiverCorpusLocal(
      {} as never,
      corpusSurDisque(),
      'Corpus A',
      true,
    )
    expect(resultat.etat).toBe('refus')
  })

  test('un dossier sans corpus.json est refusé', async () => {
    const vide = mkdtempSync(join(tmpdir(), 'sonal-archive-vide-'))
    const resultat = await archiverCorpusLocal({} as never, vide, 'Vide', false)
    expect(resultat.etat).toBe('refus')
  })

  test('la sauvegarde écrit l’archive à la destination choisie', async () => {
    const dir = corpusSurDisque()
    const dialog = (await import('electron')).dialog as unknown as {
      showSaveDialog: ReturnType<typeof vi.fn>
    }
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-archive-dest-')), 'copie.zip')
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: destination })

    const resultat = await archiverCorpusLocal({} as never, dir, 'Corpus A', false)

    expect(resultat).toEqual({ etat: 'succes', chemin: destination, fichiers: 6 })
    const zip = await JSZip.loadAsync(readFileSync(destination))
    expect(zip.file('corpus.json')).not.toBeNull()
  })
})
