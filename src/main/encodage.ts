import chardet from 'chardet'
import { decode } from 'iconv-lite'

/**
 * Décodage d'un fichier texte SonalPi V1 (`.crp`, `.Sonal`…).
 * Un `.crp` mal décodé corrompt les accents partout : on réplique
 * EXACTEMENT la logique V1 — détection `chardet` ; windows-1252 si détecté
 * ISO-8859-1/windows-1252, UTF-8 sinon.
 *
 * Pur de tout electron : `Buffer → string`, testable headless (unitaire).
 */
export function decoderCrp(buf: Buffer): string {
  const encodage = chardet.detect(buf)
  return encodage === 'ISO-8859-1' || encodage === 'windows-1252'
    ? decode(buf, 'windows-1252')
    : decode(buf, 'utf8')
}
