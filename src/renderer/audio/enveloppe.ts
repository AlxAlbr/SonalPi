/**
 *  Enveloppe min/max d'un canal audio — le calcul du « résumé » de la forme
 *  d'onde, PUR (Float32Array → deux Float32Array), calqué sur le worker SonalPi1
 *  (`waveform.worker.js`). Le décodage (AudioContext) et le dessin (canvas)
 *  restent dans la couche renderer ; ici, seulement des nombres → testable headless.
 */
export function enveloppe(
  canal: Float32Array,
  largeur: number,
): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(largeur)
  const max = new Float32Array(largeur)
  const pas = Math.max(1, Math.ceil(canal.length / largeur))
  for (let i = 0; i < largeur; i++) {
    let mn = 1.0
    let mx = -1.0
    for (let j = 0; j < pas; j++) {
      const idx = i * pas + j
      if (idx >= canal.length) break
      const d = canal[idx]
      if (d < mn) mn = d
      if (d > mx) mx = d
    }
    min[i] = mn
    max[i] = mx
  }
  return { min, max }
}
