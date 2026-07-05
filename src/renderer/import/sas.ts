import { convertSRT, convertVTT } from './legacy/conversions.mjs'
import { importerSonal, type ResultatImport } from './importSonal'

/**
 * Le SAS D'IMPORT UNIQUE (D1) : tout format étranger passe par un HTML `.sonal`
 * (natif, ou produit par un convertisseur SonalPi réutilisé), puis par le SEUL
 * point d'entrée du modèle (`importerSonal`). Zéro parseur neuf, comportement
 * fidèle à SonalPi (mêmes cues, même détection de locuteurs).
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
  } else {
    throw new Error(`Format non pris en charge : « .${ext} »`)
  }
  return importerSonal(html, parseur(html))
}
