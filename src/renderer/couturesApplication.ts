import type { EtatSessionPublic } from '../shared/distant'

export const MESSAGE_OUVERTURE_EN_COURS = 'Une ouverture est déjà en cours. Terminez-la, puis réessayez.'

/** Refuse une ouverture concurrente sans la différer après l'opération active. */
export function creerGardeOuverture(surOccupation: (occupee: boolean) => void = () => {}) {
  let occupee = false
  return async function effectuerOuverture<T>(operation: () => Promise<T>): Promise<T> {
    if (occupee) throw new Error(MESSAGE_OUVERTURE_EN_COURS)
    occupee = true
    surOccupation(true)
    try {
      return await operation()
    } finally {
      occupee = false
      surOccupation(false)
    }
  }
}

interface ActionsStatutSession {
  definirStatut: (statut: EtatSessionPublic) => void
  rendreEditeurNonModifiable: () => void
  preserverEtAnnulerSauvegarde: () => Promise<void>
}

/** Fige l'éditeur et préserve l'autosave différé après une perte de verrou. */
export function appliquerStatutSession(
  statutCourant: EtatSessionPublic,
  nouveauStatut: EtatSessionPublic,
  actions: ActionsStatutSession,
): void {
  const nouvelleRetrogradation =
    nouveauStatut.etat === 'degrade' && statutCourant.etat !== 'degrade'
  const statutEffectif =
    statutCourant.etat === 'degrade' && nouveauStatut.etat !== 'aucune'
      ? statutCourant
      : nouveauStatut
  actions.definirStatut(statutEffectif)
  if (!nouvelleRetrogradation) return
  actions.rendreEditeurNonModifiable()
  void actions.preserverEtAnnulerSauvegarde()
}

interface AccesEntretien {
  distant: boolean
  degrade: boolean
  lectureSeule: boolean
  verrouAutrui: boolean
  annulerSauvegarde: () => Promise<void>
  viderSauvegarde: () => Promise<void>
}

/** Prépare une sortie sans créer de sauvegarde lorsque l'accès est révoqué. */
export async function preparerFermetureEntretien(acces: AccesEntretien): Promise<void> {
  if (acces.distant && acces.degrade) {
    await acces.annulerSauvegarde()
    return
  }
  const peutEcrire = !acces.distant || (!acces.lectureSeule && !acces.verrouAutrui)
  if (peutEcrire) await acces.viderSauvegarde()
}

/** Le sélecteur précède toujours l'IPC mutante qui ouvre la transaction courte. */
export async function choisirSrtAvantMutation<T>(
  choisir: () => Promise<T | null>,
  muter: (fichier: T) => Promise<void>,
): Promise<boolean> {
  const fichier = await choisir()
  if (!fichier) return false
  await muter(fichier)
  return true
}
