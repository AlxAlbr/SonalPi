export const SEUIL_DOUBLE_APPUI = 300

type ToucheLecture = Pick<KeyboardEvent, 'key' | 'code' | 'location' | 'repeat' | 'isComposing' | 'shiftKey' | 'metaKey' | 'ctrlKey'>

export function estToucheAlt(event: ToucheLecture): boolean {
  return event.key === 'Alt' || event.key === 'AltGraph'
}

/** Détecte les doubles appuis sur Alt gauche et Alt Gr dans le texte. */
export function creerDetectionDoubleAlt() {
  let precedent: { decalage: number; instant: number } | null = null

  function reinitialiser() {
    precedent = null
  }

  function appui(event: ToucheLecture, instant = Date.now()): number | null {
    if (event.isComposing) {
      reinitialiser()
      return null
    }
    if (event.repeat) return null
    // Sous Windows, Alt Gr peut être précédé d'un événement Ctrl synthétique.
    if (event.key === 'Control' && precedent?.decalage === 5) return null
    if (!estToucheAlt(event) || event.shiftKey || event.metaKey) {
      reinitialiser()
      return null
    }
    const droite = event.code === 'AltRight' || event.key === 'AltGraph' || event.location === 2
    if (!droite && event.ctrlKey) {
      reinitialiser()
      return null
    }
    const decalage = droite ? 5 : -5
    if (precedent?.decalage === decalage && instant - precedent.instant < SEUIL_DOUBLE_APPUI) {
      reinitialiser()
      return decalage
    }
    precedent = { decalage, instant }
    return null
  }

  return { appui, reinitialiser }
}
