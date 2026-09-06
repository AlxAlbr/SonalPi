import type { EtatSessionPublic } from '../shared/distant'

interface ActionsStatutSession {
  definirStatut: (statut: EtatSessionPublic) => void
  rendreEditeurNonModifiable: () => void
  annulerSauvegarde: () => Promise<void>
}

/** Applique immédiatement une perte de verrou et neutralise l'autosave différé. */
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
  void actions.annulerSauvegarde()
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
