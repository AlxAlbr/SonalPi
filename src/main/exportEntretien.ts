import { app, BrowserWindow } from 'electron'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import type { DemandeExportDocx } from '../shared/format'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { preferencesImpressionPdf, securiserNavigation } from './securiteFenetre'

// ----------------------------------------------------------------
// EXPORTS D'ENTRETIEN CÔTÉ MAIN — DOCX (lib `docx`) et PDF (printToPDF)
// ----------------------------------------------------------------

/** Runs d'une ligne : marqueur `{g}` en tête = ligne entière en gras ;
 *  segments `**…**` inline en gras (conventions de la V1). */
function texteRuns(texte: string): TextRun[] {
  let ligne = texte
  let ligneGras = false
  if (ligne.startsWith('{g}')) {
    ligneGras = true
    ligne = ligne.slice(3)
  }
  const parts = ligne.split(/(\*\*[^*]+\*\*)/)
  const runs: TextRun[] = []
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
    } else if (part) {
      runs.push(new TextRun({ text: part, bold: ligneGras }))
    }
  }
  return runs
}

/** Construit le buffer .docx : titre, notes, variables, contenu (gras `{g}`). */
export async function construireDocxBuffer(demande: DemandeExportDocx): Promise<Buffer> {
  const enfants: Paragraph[] = []
  if (demande.entete) {
    enfants.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'ENTRETIEN', bold: true })], spacing: { after: 100 } }))
    enfants.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: demande.titre, bold: true })], spacing: { after: 100 } }))
    enfants.push(
      new Paragraph({
        children: [new TextRun({ text: `Exporté par Sonal π 2 le ${new Date().toLocaleString()}`, size: 20 })],
        spacing: { after: 200 },
      }),
    )
  }
  const section = (titre: string, texte: string): void => {
    enfants.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: titre, bold: true })], spacing: { after: 100 } }))
    const lignes = texte.split('\n')
    lignes.forEach((ligne, i) => {
      enfants.push(
        new Paragraph({ children: texteRuns(ligne), spacing: { after: i === lignes.length - 1 ? 200 : 0 } }),
      )
    })
  }
  if (demande.notes) section('NOTES', demande.notes)
  if (demande.variables) section('VARIABLES', demande.variables)
  section('CONTENU', demande.contenuTxt)
  const doc = new Document({ sections: [{ children: enfants }] })
  return Packer.toBuffer(doc)
}

/** Imprime un HTML autonome en PDF : dossier temporaire jetable créé de
 *  manière sûre (toujours nettoyé, succès comme échec), fenêtre cachée et
 *  sandboxée, `printToPDF` (fond conservé pour les couleurs des codages). */
export async function imprimerPdf(html: string): Promise<Buffer> {
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-export-'))
  const tmp = join(dossier, 'export.html')
  writeFileSync(tmp, html, 'utf8')
  const fenetre = new BrowserWindow({
    show: false,
    webPreferences: preferencesImpressionPdf(),
  })
  securiserNavigation(fenetre.webContents)
  try {
    await fenetre.loadFile(tmp)
    return await fenetre.webContents.printToPDF({ printBackground: true })
  } finally {
    fenetre.destroy()
    rmSync(dossier, { recursive: true, force: true })
  }
}
