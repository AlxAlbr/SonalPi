/** Lit les cellules CSV entourées de guillemets produites par l’export de données. */
export function lireCsvDonnees(csv: string): string[][] {
  const cellules = /"((?:[^"]|"")*)"(;|\r\n)/gy
  const lignes: string[][] = []
  let ligne: string[] = []
  let position = csv.startsWith('\uFEFF') ? 1 : 0
  while (position < csv.length) {
    cellules.lastIndex = position
    const cellule = cellules.exec(csv)
    if (!cellule) throw new Error(`CSV invalide à la position ${position}`)
    ligne.push(cellule[1].replaceAll('""', '"'))
    position = cellules.lastIndex
    if (cellule[2] === '\r\n') {
      lignes.push(ligne)
      ligne = []
    }
  }
  if (ligne.length) throw new Error('Ligne CSV incomplète')
  return lignes
}
