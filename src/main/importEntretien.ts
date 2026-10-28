import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { EXT_TEXTE_ENTRETIEN } from '../shared/importEntretien'

/** Word et PDF fournissent du texte au même importeur que les fichiers TXT. */
export async function extraireTexteEntretien(nom: string, octets: Uint8Array): Promise<string> {
  const extension = extname(nom).slice(1).toLowerCase()
  if (!EXT_TEXTE_ENTRETIEN.includes(extension)) {
    throw new Error('Ce format de transcription n’est pas pris en charge.')
  }
  let contenu: string
  try {
    if (extension === 'docx') {
      const mammoth = await import('mammoth')
      contenu = (await mammoth.extractRawText({ buffer: Buffer.from(octets) })).value
    } else if (extension === 'pdf') {
      contenu = await extrairePdf(octets)
    } else {
      return Buffer.from(octets).toString('utf8')
    }
  } catch {
    throw new Error('Impossible de lire ce document. Vérifiez que le fichier s’ouvre dans votre logiciel habituel.')
  }
  if (!contenu.trim()) throw new Error('Ce document ne contient pas de texte à importer.')
  return contenu.replace(/\r\n?/g, '\n')
}

/** Conserve les lignes et l’ordre des pages comme dans l’import PDF de SonalPi1. */
async function extrairePdf(octets: Uint8Array): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const tache = getDocument({
    data: new Uint8Array(octets),
    useSystemFonts: false,
  })
  try {
    const document = await tache.promise
    const pages: string[] = []
    for (let numero = 1; numero <= document.numPages; numero++) {
      const page = await document.getPage(numero)
      try {
        const texte = await page.getTextContent()
        let ligneY: number | undefined
        let contenu = ''
        for (const item of texte.items) {
          if (!('str' in item)) continue
          const y = item.transform[5]
          if (ligneY !== undefined && y !== ligneY) contenu += '\n'
          contenu += item.str
          ligneY = y
        }
        pages.push(contenu)
      } finally {
        page.cleanup()
      }
    }
    return pages.join('\n\n')
  } finally {
    await tache.destroy()
  }
}

export async function lireFichierEntretien(chemin: string): Promise<{ nom: string; contenu: string }> {
  const nom = basename(chemin)
  const octets = await readFile(chemin)
  return { nom, contenu: await extraireTexteEntretien(nom, octets) }
}
