import { describe, test, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION } from '../src/shared/format'
import type { DemandeExportDocx } from '../src/shared/format'
import type { BlocDocumentExport } from '../src/shared/export/documentExport'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: vi.fn(),
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
}))

// Import différé : la couche Electron doit être moquée AVANT le chargement.
const { construireDocxBuffer, urlAudioLocal } = await import('../src/main/exportEntretien')

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
        join(dir, 'corpus.json'),
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
        join(dir, 'corpus.json'),
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
