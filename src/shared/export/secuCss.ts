/**
 *  Garde-fous CSS pour les exports HTML/PDF : couleurs, tailles et codes du
 *  codebook proviennent de fichiers importés (jamais de confiance) — ils ne
 *  deviennent donc jamais directement des jetons CSS, classes ou styles.
 */

/** Couleur acceptée : uniquement les formes HEX (#rgb, #rgba, #rrggbb,
 *  #rrggbbaa). Toute autre forme (nom CSS, url(), interpolation hostile)
 *  est rejetée : null. */
export function couleurCss(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const s = valeur.trim()
  return /^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(s) ? s : null
}

/** Taille de texte acceptée : nombre fini borné à [8, 72] px (arrondi).
 *  Une valeur non numérique ou vide (champ absent du format legacy) est
 *  rejetée : null. */
export function tailleCss(valeur: unknown): number | null {
  if (typeof valeur === 'string' && valeur.trim() === '') return null
  const n = typeof valeur === 'string' ? Number(valeur) : valeur
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(72, Math.max(8, Math.round(n)))
}

/** Identifiant CSS sûr et déterministe d'un code de catégorie : le code brut
 *  (importé, potentiellement hostile) n'est JAMAIS interpolé dans un
 *  sélecteur. Empreinte FNV-1a 32 bits → hexadécimal. */
export function idCssCode(code: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `scat-${h.toString(16).padStart(8, '0')}`
}
