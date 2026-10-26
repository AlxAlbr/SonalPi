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
  let generation = 0
  const entreesJournalCorpus = ref<EntreeJournalCorpusVue[]>([])
  const revisionPersonnesCorpus = ref(0)
  const revisionNotesCorpus = ref(0)

  async function rafraichirJournalCorpus(): Promise<void> {
    const attendue = generation
    await opts.flush()
    if (attendue !== generation) return
    const entrees = await window.sonal.corpus.journalLister()
    if (attendue === generation) entreesJournalCorpus.value = entrees
  }

  async function annulerEntreeJournalCorpus(id: string): Promise<ResultatAnnulationCorpus> {
    const attendue = generation
    await opts.flush()
    if (attendue !== generation) return { ok: false, raison: 'Le corpus a changé.', temporaire: false }
    const resultat = await window.sonal.corpus.journalAnnuler(id)
    if (attendue !== generation) return { ok: false, raison: 'Le corpus a changé.', temporaire: false }
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
    generation++
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
