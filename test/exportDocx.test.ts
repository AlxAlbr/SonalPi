import { describe, test, expect, vi } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION } from '../src/shared/format'
import type { DemandeExportDocx } from '../src/shared/format'
import type { BlocDocumentExport } from '../src/shared/export/documentExport'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  dialog: {
    showSaveDialog: vi.fn(async (_fenetre: unknown, opts: { defaultPath?: string }) => ({
      canceled: true,
      filePath: undefined as string | undefined,
      defaultPath: opts?.defaultPath,
    })),
  },
}))

// Import différé : la couche Electron doit être moquée AVANT le chargement.
const { construireDocxBuffer, urlAudioLocal, choisirDestination, ecrireFichierAtomique } = await import(
  '../src/main/exportEntretien'
)

describe('DOCX : le buffer construit par le main respecte le document intermédiaire', () => {
  test('contenu littéral (marqueurs préservés), gras par run, espace = ligne vide', async () => {
    const blocs: BlocDocumentExport[] = [
      { type: 'section', runs: [{ texte: 'CONTENU', gras: true }] },
      // Chaînes saisies par l'utilisateur : elles restent exactement telles quelles.
      { type: 'paragraphe', runs: [{ texte: 'Karine dit {g} et **gras**.' }] },
      // Le gras de l'interviewer est un run nommé (la ligne de tête n'est
      // plus marquée par {g}).
      { type: 'paragraphe', runs: [{ texte: '00:00:25 ' }, { texte: 'Marc ', gras: true }] },
      { type: 'espace' },
    ]
    const demande: DemandeExportDocx = {
      nomSuggere: 'entretien.docx',
      titre: 'Entretien Test',
      entete: true,
      document: { blocs },
    }
    const buffer = await construireDocxBuffer(demande)
    const zip = await JSZip.loadAsync(buffer)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
    expect(xml).toContain('Karine dit {g} et **gras**.')
    expect(xml).not.toContain('<w:t xml:space="preserve">gras</w:t>')
    // Le run gras de l'interviewer est posé en gras Word (`<w:b/>`), la
    // ligne complète n'est pas forcée.
    const runMarc = /<w:r>(?:(?!<\/w:r>).)*Marc /s.exec(xml)?.[0] ?? ''
    expect(runMarc).toContain('<w:b/>')
    // Titres Word : ENTRETIEN (titre), Entretien Test (heading 1), CONTENU (heading 2).
    expect(xml).toContain('ENTRETIEN')
    expect(xml).toContain('Heading1')
    expect(xml).toContain('Heading2')
  })

  test('sans en-tête : aucun titre imposé, les blocs seuls', async () => {
    const demande: DemandeExportDocx = {
      nomSuggere: 'entretien.docx',
      titre: 'Entretien Test',
      entete: false,
      document: { blocs: [{ type: 'paragraphe', runs: [{ texte: 'corps seul' }] }] },
    }
    const buffer = await construireDocxBuffer(demande)
    const zip = await JSZip.loadAsync(buffer)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
    expect(xml).not.toContain('ENTRETIEN')
    expect(xml).toContain('corps seul')
  })
})

describe('résolution audio vérifiée par le main', () => {
  test('une audioRef du corpus existante → URL file:// ; inconnue → null', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-export-audio-'))
    try {
      mkdirSync(join(dir, 'entretiens'), { recursive: true })
      // Membership du corpus : la whitelist du store ne résout QUE les
      // audioRef réellement enregistrées.
      writeFileSync(
        join(dir, 'corpus.crp'),
        JSON.stringify({ formatVersion: FORMAT_VERSION, membership: { e1: { titre: 'T', date: null, lastModified: new Date().toISOString() } } }),
        'utf8',
      )
      const wav = join(dir, 'entretien.wav')
      writeFileSync(wav, 'RIFX', 'utf8')
      writeFileSync(
        join(dir, 'entretiens', 'e1.json'),
        JSON.stringify({
          id: 'e1',
          titre: 'T',
          corpsTexte: { type: 'doc', content: [] },
          annotations: [],
          ancres: [],
          locuteurs: [],
          meta: { valeursGen: {}, audioRef: wav },
        }),
        'utf8',
      )
      const store = new CorpusStore(dir)
      const url = urlAudioLocal(store, wav)
      expect(typeof url).toBe('string')
      expect(url).toMatch(/^file:\/\//)
      // L'URL re-décode vers le chemin exact (pas de concaténation manuelle).
      expect(decodeURIComponent(url ?? '')).toContain(wav)
      // Une ref non enregistrée dans le corpus n'est JAMAIS résolue.
      expect(urlAudioLocal(store, join(dir, 'autre.wav'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('une audioRef du corpus dont le fichier a disparu → null', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-export-audio-'))
    try {
      mkdirSync(join(dir, 'entretiens'), { recursive: true })
      writeFileSync(
        join(dir, 'corpus.crp'),
        JSON.stringify({ formatVersion: FORMAT_VERSION, membership: { e1: { titre: 'T', date: null, lastModified: new Date().toISOString() } } }),
        'utf8',
      )
      writeFileSync(
        join(dir, 'entretiens', 'e1.json'),
        JSON.stringify({
          id: 'e1',
          titre: 'T',
          corpsTexte: { type: 'doc', content: [] },
          annotations: [],
          ancres: [],
          locuteurs: [],
          meta: { valeursGen: {}, audioRef: join(dir, 'disparu.wav') },
        }),
        'utf8',
      )
      expect(urlAudioLocal(new CorpusStore(dir), join(dir, 'disparu.wav'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ----------------------------------------------------------------
// Primitives main séparées : destination, génération, écriture atomique.
// Le futur export corpus choisira la destination UNE fois puis générera
// plusieurs artefacts sans dialogue intermédiaire.
// ----------------------------------------------------------------

describe('destination et écriture séparées', () => {
  test('annulation du dialogue : null, aucune écriture', async () => {
    const { dialog } = (await import('electron')) as unknown as {
      dialog: { showSaveDialog: ReturnType<typeof vi.fn> }
    }
    const avant = dialog.showSaveDialog.mock.calls.length
    const r = await choisirDestination(
      { sender: {} as never },
      { defaultPath: 'x.txt' },
    )
    expect(r).toBeNull()
    expect(dialog.showSaveDialog).toHaveBeenCalledTimes(avant + 1)
  })

  test('plusieurs artefacts générés et écrits après UN choix de destination', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-export-lot-'))
    try {
      // Simulation : la destination est choisie une fois (dans l'usage réel
      // par l'utilisateur, ici posée par le test), puis plusieurs artefacts
      // sont générés et écrits SANS nouveau dialogue.
      const destination = join(dir, 'lot')
      mkdirSync(destination, { recursive: true })
      const artefacts: Array<[string, string]> = [
        ['a.txt', 'premier'],
        ['b.txt', 'deuxième'],
      ]
      for (const [nom, contenu] of artefacts) {
        ecrireFichierAtomique(join(destination, nom), contenu)
      }
      expect(readFileSync(join(destination, 'a.txt'), 'utf8')).toBe('premier')
      expect(readFileSync(join(destination, 'b.txt'), 'utf8')).toBe('deuxième')
      // Aucun temporaire résiduel après écriture.
      expect(readdirSync(destination).filter((n) => n.startsWith('.sonal-export-'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('écriture atomique : un échec ne laisse aucun résidu ni cible à moitié écrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-export-atom-'))
    try {
      // Le rename échoue quand la cible est un DOSSIER : le temporaire est
      // posé, l'écriture échoue, la cible reste inchangée et le temporaire
      // est nettoyé.
      const cible = join(dir, 'cible.txt')
      mkdirSync(cible)
      expect(() => ecrireFichierAtomique(cible, 'contenu')).toThrow()
      expect(readdirSync(dir).filter((n) => n.startsWith('.sonal-export-'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
