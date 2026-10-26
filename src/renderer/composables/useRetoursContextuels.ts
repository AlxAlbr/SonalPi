import { computed, onScopeDispose, ref, shallowRef } from 'vue'

/** Consultations liées en session ; une navigation libre termine la chaîne. */
export function useRetoursContextuels<T>(deps: {
  capturer: () => { libelle: string; contexte: T } | null
  restaurer: (contexte: T, valide: () => boolean) => Promise<boolean>
  erreur: (erreur: unknown) => void
  liberer?: (contexte: T) => void
  apresRetour?: (contexte: T, valide: () => boolean) => Promise<void> | void
}, limite = 8) {
  const pile = shallowRef<Array<{ libelle: string; contexte: T }>>([])
  const navigationContexteEnCours = ref(false)
  const libelleRetourContexte = computed(() => pile.value.at(-1)?.libelle ?? null)
  let generation = 0

  function terminerConsultation(): void {
    generation++
    pile.value.forEach((destination) => deps.liberer?.(destination.contexte))
    pile.value = []
    navigationContexteEnCours.value = false
  }

  async function suivreConsultation(
    ouvrir: (valide: () => boolean) => Promise<boolean>,
    origine?: { libelle: string; contexte: T },
  ): Promise<boolean> {
    if (navigationContexteEnCours.value) return false
    const depart = origine ?? deps.capturer()
    let conserve = false
    const jeton = generation
    navigationContexteEnCours.value = true
    try {
      const ouvert = await ouvrir(() => jeton === generation)
      if (!ouvert || jeton !== generation) return false
      if (depart) {
        const destinations = [...pile.value, depart]
        destinations.slice(0, Math.max(0, destinations.length - limite)).forEach((destination) => deps.liberer?.(destination.contexte))
        pile.value = destinations.slice(-limite)
        conserve = true
      }
      return true
    } catch (erreur) {
      if (jeton === generation) deps.erreur(erreur)
      return false
    } finally {
      if (depart && !conserve && !origine) deps.liberer?.(depart.contexte)
      if (jeton === generation) navigationContexteEnCours.value = false
    }
  }

  async function revenirContexte(): Promise<boolean> {
    const destination = pile.value.at(-1)
    if (!destination || navigationContexteEnCours.value) return false
    const jeton = generation
    navigationContexteEnCours.value = true
    try {
      const restaure = await deps.restaurer(destination.contexte, () => jeton === generation)
      if (!restaure || jeton !== generation) return false
      pile.value = pile.value.slice(0, -1)
      await deps.apresRetour?.(destination.contexte, () => jeton === generation)
      deps.liberer?.(destination.contexte)
      return true
    } catch (erreur) {
      if (jeton === generation) deps.erreur(erreur)
      return false
    } finally {
      if (jeton === generation) navigationContexteEnCours.value = false
    }
  }

  onScopeDispose(terminerConsultation, true)

  return { libelleRetourContexte, navigationContexteEnCours, suivreConsultation, revenirContexte, terminerConsultation }
}
