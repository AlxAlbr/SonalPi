/** Les panneaux prêtent une restauration de leurs seuls réglages d'affichage. */
export function useContextesPanneaux() {
  const panneaux = new Map<string, () => () => void>()
  function enregistrerContextePanneau(cle: string, capturer: () => () => void): () => void {
    panneaux.set(cle, capturer)
    return () => { if (panneaux.get(cle) === capturer) panneaux.delete(cle) }
  }
  function capturerContextePanneau(cle: string): () => void {
    return panneaux.get(cle)?.() ?? (() => {})
  }
  return { enregistrerContextePanneau, capturerContextePanneau }
}
