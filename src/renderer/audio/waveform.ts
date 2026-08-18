import { enveloppe } from './enveloppe'

/** URL d'un audio RÉFÉRENCÉ (chemin absolu externe), servie par le protocole
 *  `sonal-media` du main (en dev, le renderer Vite est en http://localhost et
 *  ne lit pas file://). Le chemin est encodé dans le pathname de l'hôte `abs` ;
 *  la whitelist côté main vérifie qu'il appartient aux `audioRef` du corpus. */
export function urlMediaAudio(audioRef: string): string {
  return `sonal-media://abs/${encodeURIComponent(audioRef)}`
}

/** URL du PNG waveform d'un entretien (dérivé local `<corpus>/png/<id>.png`),
 *  servie par le protocole `sonal-media` (hôte `waveform`, résolu par id côté
 *  main). `v` casse le cache navigateur après une (ré)génération. */
export function urlMediaWaveform(id: string, v?: number | string): string {
  return `sonal-media://waveform/${id}` + (v != null ? `?v=${v}` : '')
}

/**
 * PNG de la forme d'onde, façon SonalPi : décodage AudioContext (dans le
 * renderer — seul endroit où il est garanti), enveloppe min/max (pure,
 * `enveloppe.ts`), dessin canvas. RATIO SonalPi (800×31, très plat — c'est ce
 * qui fait le « mur d'ondes » de l'écran Corpus) : remplissage quasi invisible
 * (le conteneur porte le dégradé, comme `.fond-cnv-ent` de SonalPi), seuls les
 * deux traits d'enveloppe gris dessinent la forme. Pas de Web Worker :
 * l'enveloppe est un O(n) négligeable devant le décodage, lui-même déjà
 * asynchrone.
 */
export async function genererWaveformPng(
  octets: ArrayBuffer,
  largeur = 800,
  hauteur = 31,
): Promise<Uint8Array> {
  const ctxAudio = new AudioContext()
  let canal: Float32Array
  try {
    const buffer = await ctxAudio.decodeAudioData(octets)
    canal = buffer.getChannelData(0)
  } finally {
    void ctxAudio.close()
  }
  const { min, max } = enveloppe(canal, largeur)

  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext('2d')!
  const amp = hauteur / 2

  ctx.beginPath()
  ctx.moveTo(0, (1 - max[0]) * amp)
  for (let i = 1; i < largeur; i++) ctx.lineTo(i, (1 - max[i]) * amp)
  for (let i = largeur - 1; i >= 0; i--) ctx.lineTo(i, (1 - min[i]) * amp)
  ctx.closePath()
  // Gris NEUTRE (les valeurs SonalPi) : la couleur sur l'onde est réservée au
  // calque du résumé thématique — l'onde elle-même ne doit pas encombrer.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)' // SonalPi : quasi invisible — le dégradé vit dans le conteneur
  ctx.fill()
  ctx.strokeStyle = 'rgb(165, 165, 165)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, (1 - max[0]) * amp)
  for (let i = 1; i < largeur; i++) ctx.lineTo(i, (1 - max[i]) * amp)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, (1 - min[0]) * amp)
  for (let i = 1; i < largeur; i++) ctx.lineTo(i, (1 - min[i]) * amp)
  ctx.stroke()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob a échoué'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/** Génère et PERSISTE la forme d'onde d'un entretien (dérivé `audio/<id>.png`,
 *  régénérable) : octets audio récupérés par fetch sur le protocole, PNG écrit
 *  par le main. Renvoie le chemin relatif du PNG, ou null si l'audio est
 *  indécodable (on n'échoue pas l'assignation pour un dérivé). */
export async function genererEtEcrireWaveform(id: string, audioRef: string): Promise<string | null> {
  try {
    const rep = await fetch(urlMediaAudio(audioRef))
    if (!rep.ok) return null
    const png = await genererWaveformPng(await rep.arrayBuffer())
    return await window.sonal.corpus.ecrireWaveform(id, png)
  } catch (e) {
    console.warn('Forme d’onde non générée :', e)
    return null
  }
}
