import { ref } from 'vue'
import type {
  EntreeJournalCorpusVue,
  ResultatAnnulationCorpus,
} from '../../../shared/corpus/journal'

interface EffetsAnnulationCorpus {
  rafraichirMatrice: () => Promise<boolean>
  perimerScanAnon: () => void
}

/** Gère le journal du corpus et les projections touchées par une annulation. */
export function useJournalCorpus(
  opts: { flush: () => Promise<void> },
  effets: EffetsAnnulationCorpus,
) {
  const entreesJournalCorpus = ref<EntreeJournalCorpusVue[]>([])
  const revisionPersonnesCorpus = ref(0)
  const revisionNotesCorpus = ref(0)

  async function rafraichirJournalCorpus(): Promise<void> {
    await opts.flush()
    entreesJournalCorpus.value = await window.sonal.corpus.journalLister()
  }

  async function annulerEntreeJournalCorpus(id: string): Promise<ResultatAnnulationCorpus> {
    await opts.flush()
    const resultat = await window.sonal.corpus.journalAnnuler(id)
    if (resultat.ok) {
      if (resultat.impact.projections.includes('personnes')) revisionPersonnesCorpus.value++
      if (resultat.impact.projections.includes('notes')) revisionNotesCorpus.value++
      if (resultat.impact.projections.includes('matrice')) await effets.rafraichirMatrice()
      if (resultat.impact.projections.includes('scanAnon')) effets.perimerScanAnon()
    }
    await rafraichirJournalCorpus()
    return resultat
  }

  function reinitialiser() {
    entreesJournalCorpus.value = []
    revisionPersonnesCorpus.value = 0
    revisionNotesCorpus.value = 0
  }

  return {
    entreesJournalCorpus,
    revisionPersonnesCorpus,
    revisionNotesCorpus,
    rafraichirJournalCorpus,
    annulerEntreeJournalCorpus,
    reinitialiser,
  }
}
