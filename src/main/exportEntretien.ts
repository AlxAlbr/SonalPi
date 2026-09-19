import { app, BrowserWindow, dialog } from 'electron'
import type { IpcMainInvokeEvent, SaveDialogOptions } from 'electron'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import type { DemandeExportDocx } from '../shared/format'
import type { BlocDocumentExport, RunTexteExport } from '../shared/export/documentExport'
import { join, dirname } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { preferencesImpressionPdf, securiserNavigation } from './securiteFenetre'
import type { CorpusStore } from './corpusStore'

// ----------------------------------------------------------------
// EXPORTS D'ENTRETIEN CÔTÉ MAIN — DOCX (lib `docx`) et PDF (printToPDF)
// ----------------------------------------------------------------

/** Un run du document intermédiaire → TextRun (styles nommés, contenu
 *  littéral : aucune chaîne saisie n'est décodée comme une mise en forme). */
function runDe(r: RunTexteExport): TextRun {
  return new TextRun({ text: r.texte, bold: r.gras === true, italics: r.italique === true })
}

/** Un bloc du document intermédiaire → Paragraph. `titre`/`section` deviennent
 *  des titres Word ; `espace` une ligne vide (séparation visuelle). */
function paragrapheDe(bloc: BlocDocumentExport): Paragraph {
  if (bloc.type === 'espace') {
    return new Paragraph({ children: [], spacing: { after: 200 } })
  }
  const runs = (bloc.runs ?? []).map(runDe)
  if (bloc.type === 'titre') {
    return new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs, spacing: { after: 100 } })
  }
  if (bloc.type === 'section') {
    return new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs, spacing: { after: 100 } })
  }
  return new Paragraph({ children: runs, spacing: { after: 0 } })
}

/** Construit le buffer .docx : en-tête optionnel (posé par le main), puis le
 *  document intermédiaire (notes, variables, contenu) converti tel quel. */
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
  for (const bloc of demande.document.blocs) enfants.push(paragrapheDe(bloc))
  const doc = new Document({ sections: [{ children: enfants }] })
  return Packer.toBuffer(doc)
}

/** Résout la référence audio d'un entretien en URL locale vérifiée : le chemin
 *  doit appartenir aux audioRef du corpus courant (whitelist du store) ET
 *  exister sur ce poste. Null sinon : le renderer n'a ni accès disque ni
 *  concaténation `file://` à faire. */
export function urlAudioLocal(store: CorpusStore, audioRef: string): string | null {
  const chemin = store.cheminMediaAbs(audioRef)
  return chemin ? pathToFileURL(chemin).href : null
}

/** Choix d'une destination par l'utilisateur (dialogue natif). Une commande
 *  dédiée plutôt qu'un dialogue noyé dans l'écriture : un futur export corpus
 *  pourra choisir la destination UNE fois puis générer plusieurs artefacts. */
/** Choix d'une destination par l'utilisateur (dialogue natif rattaché à la
 *  fenêtre appelante). Une commande dédiée plutôt qu'un dialogue noyé dans
 *  l'écriture : un futur export corpus pourra choisir la destination UNE fois
 *  puis générer plusieurs artefacts sans dialogue intermédiaire. */
export async function choisirDestination(
  e: IpcMainInvokeEvent,
  options: SaveDialogOptions,
): Promise<string | null> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  const r = fenetre ? await dialog.showSaveDialog(fenetre, options) : await dialog.showSaveDialog(options)
  return r.canceled || !r.filePath ? null : r.filePath
}

/** Écriture ATOMIQUE dans un fichier : le contenu part dans un temporaire du
 *  dossier cible, posé par rename — un échec d'écriture ne laisse jamais un
 *  fichier à moitié écrit à la place de la cible. */
export function ecrireFichierAtomique(chemin: string, contenu: string | Buffer): void {
  const temp = join(dirname(chemin), `.sonal-export-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    writeFileSync(temp, contenu)
    renameSync(temp, chemin)
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
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
