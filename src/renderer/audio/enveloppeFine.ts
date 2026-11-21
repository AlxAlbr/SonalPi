/**
 *  Forme d'onde détaillée d'un audio, pour zoomer sur quelques secondes.
 *  L'image de la bande du lecteur est trop grossière pour ça (800 points pour
 *  tout l'entretien) : on décode l'audio une fois, à basse fréquence, et on
 *  garde seulement un pic par centième de seconde.
 */

/** Nombre de pics par seconde. */
export const PICS_PAR_SECONDE = 100

/** Pics d'amplitude (0 à 1), un par 1/PICS_PAR_SECONDE seconde. */
export type Pics = Float32Array

const cache = new Map<string, Promise<Pics | null>>()

/** Calcule les pics d'un canal échantillonné à `frequence` Hz. */
export function calculerPics(canal: Float32Array, frequence: number): Pics {
  const pas = Math.max(1, Math.round(frequence / PICS_PAR_SECONDE))
  const pics = new Float32Array(Math.ceil(canal.length / pas))
  for (let i = 0; i < pics.length; i++) {
    let max = 0
    const fin = Math.min(canal.length, (i + 1) * pas)
    for (let j = i * pas; j < fin; j++) {
      const v = Math.abs(canal[j])
      if (v > max) max = v
    }
    pics[i] = max
  }
  return pics
}

async function decoder(url: string): Promise<Pics | null> {
  try {
    const reponse = await fetch(url)
    if (!reponse.ok) return null
    const octets = await reponse.arrayBuffer()
    // Décodage à 8 kHz : largement assez pour dessiner, et léger en mémoire.
    const frequence = 8000
    const contexte = new OfflineAudioContext(1, 1, frequence)
    const buffer = await contexte.decodeAudioData(octets)
    return calculerPics(buffer.getChannelData(0), buffer.sampleRate)
  } catch {
    return null
  }
}

/** Pics de l'audio à `url`, calculés une seule fois par session ; null si l'audio est illisible. */
export function chargerPics(url: string): Promise<Pics | null> {
  let promesse = cache.get(url)
  if (!promesse) {
    promesse = decoder(url)
    cache.set(url, promesse)
    // Un échec ne reste pas en cache : on pourra réessayer à la prochaine ouverture.
    void promesse.then((pics) => {
      if (!pics) cache.delete(url)
    })
  }
  return promesse
}
