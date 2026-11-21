/**
 *  Encodage Windows-1252 (cp1252), celui que des logiciels comme IRaMuTeQ
 *  proposent par défaut sous Windows.
 *  Il couvre les lettres accentuées du français, œ, les guillemets et apostrophes typographiques.
 */

/** Encodages proposés pour les fichiers texte exportés. */
export type EncodageTexte = 'utf8' | 'windows-1252'

/** Caractères placés entre 0x80 et 0x9F, propres à Windows-1252. */
const SPECIFIQUES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

function octet(code: number): number | null {
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code
  return SPECIFIQUES[code] ?? null
}

/** Convertit un texte en octets Windows-1252.
 *  Un caractère absent de cet encodage perd son accent s'il en a un ;
 *  sinon, il est remplacé par une espace. */
export function encoderWindows1252(texte: string): Uint8Array {
  const octets: number[] = []
  for (const car of texte) {
    let o = octet(car.codePointAt(0)!)
    if (o === null) {
      const base = car.normalize('NFD').codePointAt(0)!
      o = octet(base) ?? 0x20
    }
    octets.push(o)
  }
  return Uint8Array.from(octets)
}
