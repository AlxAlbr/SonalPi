import { computed, ref } from 'vue'

/**
 *  Attente bloquante : pendant une opération qui change d'écran ou parle au serveur,
 *  un voile avec un message empêche de lancer autre chose en parallèle.
 *  Les opérations peuvent s'imbriquer ; le message affiché est celui de la plus récente.
 *  Le voile s'efface pendant qu'une question attend la réponse de l'utilisateur.
 */

const messages = ref<string[]>([])
const pauses = ref(0)

/** Message à afficher, ou null quand rien n'est en attente. */
export const messageAttente = computed(() =>
  pauses.value === 0 && messages.value.length > 0 ? messages.value[messages.value.length - 1] : null,
)

/** Exécute l'opération sous le voile d'attente, retiré même en cas d'échec. */
export async function avecAttente<T>(message: string, operation: () => Promise<T>): Promise<T> {
  const entree = message
  messages.value = [...messages.value, entree]
  try {
    return await operation()
  } finally {
    const i = messages.value.lastIndexOf(entree)
    if (i >= 0) messages.value = [...messages.value.slice(0, i), ...messages.value.slice(i + 1)]
  }
}

/** Vrai dès que l'application se ferme avec un corpus en ligne ouvert :
 *  le voile reste affiché jusqu'à la fin et propose de fermer sans attendre. */
export const fermetureEnCours = ref(false)

/** Affiche le voile de fermeture, qui reste jusqu'à ce que l'application se ferme. */
export function annoncerFermeture(): void {
  if (fermetureEnCours.value) return
  fermetureEnCours.value = true
  messages.value = [...messages.value, 'Fermeture : envoi de votre travail au serveur…']
}

/** Retire le voile le temps qu'une modale attende un choix de l'utilisateur. */
export async function pendantChoixUtilisateur<T>(attendre: () => Promise<T>): Promise<T> {
  pauses.value++
  try {
    return await attendre()
  } finally {
    pauses.value--
  }
}
