import { ref, type Ref } from 'vue'
import type { EntretienFichier, LectureEntretien, Variable } from '../../../shared/format'
import {
  detailsVariablesEntretien,
  type BlocParticipation,
  type LigneValeur,
} from '../../../shared/corpus/lectureVariables'

export interface DetailsSelectionCorpus {
  nbParticipations: number
  nbValeurs: number
  audio: boolean
  srt: boolean
  generales: LigneValeur[]
  parParticipation: BlocParticipation[]
}

/** Gère l'entretien sélectionné et son panneau de métadonnées dans la vue Corpus. */
export function useSelectionCorpus(deps: {
  variables: Ref<Variable[]>
  lireEntretien: (id: string) => Promise<LectureEntretien>
}) {
  const corpusSelId = ref<string | null>(null)
  const corpusSelMeta = ref<DetailsSelectionCorpus | null>(null)

  function detailsDepuisLecture(data: EntretienFichier): DetailsSelectionCorpus {
    const details = detailsVariablesEntretien(deps.variables.value, { meta: data.meta, participations: data.participations })
    const nbValeurs =
      Object.keys(data.meta.valeursGen).length +
      data.participations.reduce((somme, locuteur) => somme + Object.keys(locuteur.valeursLoc).length, 0)
    return {
      nbParticipations: data.participations.length,
      nbValeurs,
      audio: data.meta.audioRef != null,
      srt: (data.ancres?.length ?? 0) > 0,
      generales: details.generales,
      parParticipation: details.parParticipation,
    }
  }

  async function selectionnerCorpus(id: string): Promise<void> {
    if (corpusSelId.value === id) return
    corpusSelId.value = id
    corpusSelMeta.value = null
    const resultat = await deps.lireEntretien(id)
    if (resultat.ok && corpusSelId.value === id) {
      corpusSelMeta.value = detailsDepuisLecture(resultat.data)
    }
  }

  async function rafraichirMetaSelection(): Promise<void> {
    const id = corpusSelId.value
    if (!id) return
    const resultat = await deps.lireEntretien(id)
    if (resultat.ok && corpusSelId.value === id) {
      corpusSelMeta.value = detailsDepuisLecture(resultat.data)
    }
  }

  function deselectionnerCorpus(): void {
    corpusSelId.value = null
    corpusSelMeta.value = null
  }

  return {
    corpusSelId,
    corpusSelMeta,
    selectionnerCorpus,
    rafraichirMetaSelection,
    deselectionnerCorpus,
    reinitialiser: deselectionnerCorpus,
  }
}
