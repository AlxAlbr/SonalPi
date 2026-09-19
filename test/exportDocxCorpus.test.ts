import { describe, test, expect, vi } from 'vitest'
import JSZip from 'jszip'
import type { DemandeExportDocxCorpus } from '../src/shared/format'
import type { BlocDocumentExport } from '../src/shared/export/documentExport'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
}))

// Import différé : la couche Electron doit être moquée AVANT le chargement.
const { construireDocxBufferCorpus } = await import('../src/main/exportCorpus')

describe('DOCX combiné du corpus : le buffer du main respecte le document combiné', () => {
  test('un titre par entretien, contenu littéral préservé, en-tête CORPUS', async () => {
    const blocs: BlocDocumentExport[] = [
      { type: 'titre', runs: [{ texte: 'Entretien un', gras: true }] },
      { type: 'section', runs: [{ texte: 'CONTENU', gras: true }] },
      { type: 'paragraphe', runs: [{ texte: 'Karine dit {g} et **gras**.' }] },
      { type: 'espace' },
      { type: 'titre', runs: [{ texte: 'Entretien deux', gras: true }] },
    ]
    const demande: DemandeExportDocxCorpus = {
      titre: 'Corpus combiné',
      entete: true,
      document: { blocs },
    }
    const buffer = await construireDocxBufferCorpus(demande)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    // Titre du corpus en Heading 1, entretiens en Heading 1 (blocs titre).
    expect(xml).toContain('Corpus combiné')
    expect(xml).toContain('Entretien un')
    expect(xml).toContain('Entretien deux')
    // Aucun marqueur interprété : le texte saisi sort littéralement.
    expect(xml).toContain('Karine dit {g} et **gras**.')
    // Styles de titre présents (blocs titre → Heading1).
    expect(xml).toMatch(/Heading1/)
  })

  test('sans en-tête : aucun titre de corpus, le document démarre aux entretiens', async () => {
    const demande: DemandeExportDocxCorpus = {
      titre: 'Corpus combiné',
      entete: false,
      document: { blocs: [{ type: 'titre', runs: [{ texte: 'Seul entretien', gras: true }] }] },
    }
    const buffer = await construireDocxBufferCorpus(demande)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('CORPUS')
    expect(xml).toContain('Seul entretien')
  })
})
