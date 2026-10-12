import { ref } from 'vue'

const suspensions = new Set<symbol>()
export const tirageAutomatiqueSuspendu = ref(false)

/** Un inventaire ou une publication ne doit pas être perturbé par le tirage automatique. */
export function suspendreTirageAutomatique(): () => void {
  const id = Symbol()
  suspensions.add(id)
  tirageAutomatiqueSuspendu.value = true
  return () => {
    suspensions.delete(id)
    tirageAutomatiqueSuspendu.value = suspensions.size > 0
  }
}
