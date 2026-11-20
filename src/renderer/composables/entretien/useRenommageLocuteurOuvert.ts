import { ref, type Ref } from 'vue'
import type { EntretienFichier, ParticipationLocuteur, PayloadEntretien, ReferenceParticipation } from '../../../shared/format'
import type { CommandeRenommageLocuteur } from '../../../shared/corpus/contratsLocuteurs'
import type { ApercuCorrectionLocuteurs } from '../../../shared/corpus/apercusCorrectionsLocuteurs'
import { preparerApercuCorrectionLocuteurs } from '../../../shared/corpus/apercusCorrectionsLocuteurs'

interface DemandeRenommageOuvert {
  reference: ReferenceParticipation
  nom: string
  apercu: ApercuCorrectionLocuteurs | null
  confirmationRequise: boolean
}

/** Préserve le nom courant et demande confirmation si d’autres entretiens sont concernés. */
export function useRenommageLocuteurOuvert(deps: {
  participations: Ref<ParticipationLocuteur[]>
  ouvertId: Readonly<Ref<string | null>>
  disponible: () => boolean
  sauver: () => Promise<void>
  suspendre: () => Promise<PayloadEntretien>
  appliquer: (avant: PayloadEntretien, apres: EntretienFichier, locuteurId: string) => void
  terminer: () => void
  apresCorrection: () => void
}) {
  const demande = ref<DemandeRenommageOuvert | null>(null)
  const occupe = ref(false)
  const enregistrement = ref(false)
  const erreur = ref('')
  let generation = 0
  let cible: ParticipationLocuteur | undefined
  const courant = () => !!demande.value && deps.disponible() && deps.ouvertId.value === demande.value.reference.entretienId
    && deps.participations.value.find((p) => p.id === demande.value!.reference.participationId) === cible

  function reinitialiser() {
    generation++
    demande.value = null; cible = undefined; occupe.value = false; enregistrement.value = false; erreur.value = ''
  }
  function annuler() { if (!enregistrement.value) reinitialiser() }
  async function preparer(reference: ReferenceParticipation, nom?: string) {
    if (occupe.value || !deps.disponible() || reference.entretienId !== deps.ouvertId.value) return
    const participation = deps.participations.value.find((p) => p.id === reference.participationId)
    if (!participation?.locuteurRef) return
    reinitialiser()
    cible = participation
    demande.value = { reference: { ...reference }, nom: nom ?? participation.nom, apercu: null, confirmationRequise: false }
    const jeton = generation
    const locuteurId = participation.locuteurRef
    occupe.value = true
    try {
      await deps.sauver()
      if (jeton !== generation || !courant()) return
      const inventaire = await window.sonal.corpus.apercuRenommageLocuteurDepuisEntretien({ ...reference })
      if (jeton !== generation || !courant() || participation.locuteurRef !== locuteurId) return
      const identite = inventaire.locuteurs.find((l) => l.id === locuteurId)
      if (!identite) throw new Error('L’association de ce locuteur est introuvable. Vérifiez les associations depuis le corpus.')
      const membres = inventaire.participations.filter((p) => p.locuteurRef === locuteurId)
      if (!membres.some((p) => p.entretienId === reference.entretienId && p.participationId === reference.participationId)) {
        throw new Error('L’association de ce locuteur a changé. Rouvrez le dialogue pour vérifier son nom.')
      }
      demande.value!.confirmationRequise = nom === undefined || membres.some((p) => p.entretienId !== reference.entretienId)
      demande.value!.apercu = preparerApercuCorrectionLocuteurs('renommerGlobal', [{
        cle: locuteurId, nom: identite.nom.trim(), locuteurId, mots: 0, interventions: 0,
        participations: membres.map((p) => ({ entretienId: p.entretienId, participationId: p.participationId, nom: p.nom, entretienTitre: p.entretienTitre })),
      }], inventaire)
    } catch (e) {
      if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (jeton === generation) occupe.value = false
    }
    if (jeton === generation && courant() && !demande.value!.confirmationRequise && !erreur.value) await confirmer()
  }
  async function confirmer() {
    const initiale = demande.value
    if (!initiale?.apercu || !initiale.nom.trim() || occupe.value || erreur.value || !courant()) return
    const jeton = generation
    const locuteurId = initiale.apercu.locuteurs[0].id
    const commande: CommandeRenommageLocuteur = { type: 'renommerGlobal', locuteurId, nom: initiale.nom.trim(), attendu: initiale.apercu.attendu }
    occupe.value = true
    enregistrement.value = true
    let avant: PayloadEntretien | undefined
    try {
      avant = await deps.suspendre()
      if (jeton !== generation || !courant()) return
      const apres = await window.sonal.corpus.renommerLocuteurDepuisEntretien({
        entretienId: initiale.reference.entretienId, participationId: initiale.reference.participationId,
      }, commande)
      if (jeton !== generation || !courant()) return
      deps.appliquer(avant, apres, locuteurId)
      deps.apresCorrection()
      demande.value = null
    } catch (e) {
      if (jeton !== generation) return
      erreur.value = e instanceof Error ? e.message : String(e)
      if (avant && courant()) {
        try {
          const relecture = await window.sonal.corpus.ouvrirEntretienPourEdition(initiale.reference.entretienId)
          if (jeton !== generation || !courant()) return
          if (!relecture.ok || relecture.acces !== 'edition') throw new Error('Relecture indisponible')
          deps.appliquer(avant, relecture.data, locuteurId)
          deps.apresCorrection()
        } catch {
          if (jeton === generation) erreur.value += ' Vos dernières paroles ont été sauvegardées. Rouvrez le corpus avant de modifier à nouveau cet entretien.'
        }
      }
    } finally {
      if (jeton === generation) { deps.terminer(); occupe.value = false; enregistrement.value = false }
    }
  }
  return { demande, occupe, enregistrement, erreur, preparer, confirmer, annuler, reinitialiser }
}
