/** Texte d'un badge lisible sur son fond : sombre sur couleur claire, blanc sur couleur sombre. */
export function texteLisible(couleur: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(couleur)?.[1]
  if (!hex) return '#fff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return (0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)) > 0.55 ? '#1a1a1a' : '#fff'
}
