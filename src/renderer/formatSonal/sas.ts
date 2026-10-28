import { convertSRT, convertVTT, convertTXT } from './legacy/conversions.mjs'
import { importerSonal, type ResultatImport } from './importSonal'

/**
 *  Tout format passe par un document `.sonal` intermédiaire,
 *  puis par le même importeur pour créer le texte, les locuteurs et les repères.
 */
export function importerFichier(
  nomFichier: string,
  contenu: string,
  parseur: (html: string) => Document,
): ResultatImport {
  const ext = nomFichier.toLowerCase().split('.').pop() ?? ''
  let html: string
  if (ext === 'sonal') {
    html = contenu
  } else if (ext === 'srt') {
    const r = convertSRT(contenu)
    if (!r) throw new Error('SRT vide ou illisible')
    html = r.formatSonal
  } else if (ext === 'vtt') {
    const r = convertVTT(contenu)
    if (!r) throw new Error('VTT vide ou illisible')
    html = r.formatSonal
  } else if (ext === 'txt' || ext === 'docx' || ext === 'pdf') {
    // Word et PDF arrivent sous forme de texte extrait.
    // Le convertisseur reconnaît les temps, les noms et les colonnes tabulées.
    const r = convertTXT(contenu)
    if (!r) throw new Error('TXT vide ou illisible')
    html = r.formatSonal
  } else {
    throw new Error(`Format non pris en charge : « .${ext} »`)
  }
  return importerSonal(parseur(html))
}
