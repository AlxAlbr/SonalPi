import { ref } from 'vue'

/** État partagé des opérations qui vérifient tout un corpus GitLab. */
export const operationGlobaleEnCours = ref(false)
export const messageOperationGlobale = ref<string | null>(null)

type LecturesOperationGlobale = {
  compterEntretiens: () => number
  estCorpusGitLab: () => boolean
  compterVerrousAutrui: () => number
}

const lecturesParDefaut: LecturesOperationGlobale = {
  compterEntretiens: () => 0,
  estCorpusGitLab: () => false,
  compterVerrousAutrui: () => 0,
}
let lectures = lecturesParDefaut

export function installerOperationGlobaleCorpus(nouvellesLectures: LecturesOperationGlobale): void {
  lectures = nouvellesLectures
}

/** Réinitialise aussi les lectures injectées afin d'isoler les tests. */
export function reinitialiserOperationGlobale(): void {
  operationGlobaleEnCours.value = false
  messageOperationGlobale.value = null
  lectures = lecturesParDefaut
}

function nombrer(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre === 1 ? singulier : pluriel}`
}

export function confirmerOperationGlobale(): boolean {
  if (!lectures.estCorpusGitLab()) return true
  const entretiens = nombrer(
    lectures.compterEntretiens(),
    'entretien publié',
    'entretiens publiés',
  )
  let message = `Cette opération doit vérifier les ${entretiens} et peut prendre un certain temps. `
    + 'Elle échouera si un entretien est publié pendant cette vérification. '
    + 'Pour éviter cela, demandez aux autres utilisateurs de terminer ou fermer leurs éditions avant de continuer.'
  const verrous = lectures.compterVerrousAutrui()
  if (verrous > 0) {
    message += `\n\n${nombrer(
      verrous,
      'entretien est actuellement ouvert',
      'entretiens sont actuellement ouverts',
    )} par d'autres utilisateurs. `
      + 'Vous pouvez continuer, mais l’opération risque d’échouer si l’un d’eux publie ses modifications.'
  }
  return window.confirm(message)
}

export interface OptionsOperationGlobale {
  confirmation?: 'habituelle' | 'deja-confirmee'
  message?: string
}

/** Sérialise les opérations de corpus, y compris celles confirmées par leur aperçu. */
export async function lancerOperationGlobale(
  operation: () => Promise<void>,
  options: OptionsOperationGlobale = {},
): Promise<boolean> {
  if (operationGlobaleEnCours.value) return false
  const gitlab = lectures.estCorpusGitLab()
  if (gitlab && options.confirmation !== 'deja-confirmee' && !confirmerOperationGlobale()) return false
  operationGlobaleEnCours.value = true
  messageOperationGlobale.value = options.message ?? (gitlab
    ? `Vérification de ${nombrer(
        lectures.compterEntretiens(),
        'entretien publié',
        'entretiens publiés',
      )}…`
    : null)
  try {
    await operation()
    return true
  } finally {
    operationGlobaleEnCours.value = false
    messageOperationGlobale.value = null
  }
}
