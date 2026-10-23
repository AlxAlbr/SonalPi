import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { importerTraitementsLexicoV1, type ImportTraitementsLexicoV1 } from '../shared/lexico/traitements'
import { decoderCrp } from './encodage'

/** Lit les annexes Lexico portant le même nom que le corpus, sans les modifier. */
export function lireReglagesLexicoV1(cheminCrp: string): ImportTraitementsLexicoV1 {
  const base = join(dirname(cheminCrp), basename(cheminCrp, extname(cheminCrp)))
  const fichiers: Partial<Record<'out' | 'lem' | 'cnct', string>> = {}
  const diagnostics: string[] = []
  for (const extension of ['out', 'lem', 'cnct'] as const) {
    const chemin = `${base}.${extension}`
    if (!existsSync(chemin)) continue
    try {
      if (statSync(chemin).size > 5 * 1024 * 1024) {
        diagnostics.push(`.${extension} ignoré : le fichier dépasse 5 Mio.`)
        continue
      }
      fichiers[extension] = decoderCrp(readFileSync(chemin))
    } catch {
      diagnostics.push(`.${extension} ignoré : le fichier ne peut pas être lu.`)
    }
  }
  const resultat = importerTraitementsLexicoV1(fichiers)
  resultat.diagnostics.unshift(...diagnostics)
  return resultat
}
