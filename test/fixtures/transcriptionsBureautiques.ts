import { Document, Packer, Paragraph } from 'docx'

export async function docxTexte(lignes: string[]): Promise<Buffer> {
  return Packer.toBuffer(new Document({
    sections: [{ children: lignes.map((ligne) => new Paragraph(ligne)) }],
  }))
}

/** Produit un petit PDF avec une police standard et du texte sur plusieurs pages. */
export function pdfTexte(pages: string[][]): Buffer {
  const ids = pages.map((_, index) => 4 + index * 2)
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  for (const [index, lignes] of pages.entries()) {
    const contenu = 'BT /F1 12 Tf 40 740 Td\n' + lignes.map((ligne, numero) => {
      const texte = ligne.replace(/([\\()])/g, '\\$1')
      return `${numero ? '0 -20 Td ' : ''}(${texte}) Tj`
    }).join('\n') + '\nET'
    objets.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${ids[index] + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(contenu, 'latin1')} >>\nstream\n${contenu}\nendstream`,
    )
  }
  let pdf = '%PDF-1.4\n'
  const positions = objets.map((objet, index) => {
    const position = Buffer.byteLength(pdf, 'latin1')
    pdf += `${index + 1} 0 obj\n${objet}\nendobj\n`
    return position
  })
  const debutXref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  pdf += positions.map((position) => `${String(position).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
