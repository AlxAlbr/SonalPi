import { ref, type Ref } from 'vue'
import type { EntretienFichier, LectureEntretien, Variable } from '../../../shared/format'
import {
  detailsVariablesEntretien,
  type BlocLocuteur,
  type LigneValeur,
} from '../../../shared/corpus/variables'

export interface DetailsSelectionCorpus {
  nbLocuteurs: number
  nbValeurs: number
  audio: boolean
  srt: boolean
  generales: LigneValeur[]
  parLocuteur: BlocLocuteur[]
}

/** Gère l'entretien sélectionné et son panneau de métadonnées dans la vue Corpus. */
export function useSelectionCorpus(deps: {
  variables: Ref<Variable[]>
  lireEntretien: (id: string) => Promise<LectureEntretien>
}) {
  const corpusSelId = ref<string | null>(null)
  const corpusSelMeta = ref<DetailsSelectionCorpus | null>(null)

  function detailsDepuisLecture(data: EntretienFichier): DetailsSelectionCorpus {
    const details = detailsVariablesEntretien(deps.variables.value, data)
    const nbValeurs =
      Object.keys(data.meta.valeursGen).length +
      data.locuteurs.reduce((somme, locuteur) => somme + Object.keys(locuteur.valeursLoc).length, 0)
    return {
      nbLocuteurs: data.locuteurs.length,
      nbValeurs,
      audio: data.meta.audioRef != null,
      srt: (data.ancres?.length ?? 0) > 0,
      generales: details.generales,
      parLocuteur: details.parLocuteur,
    }
  }

  async function selectionnerCorpus(id: string): Promise<void> {
    if (corpusSelId.value === id) {
      deselectionnerCorpus()
      return
    }
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
