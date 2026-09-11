import type { Editor } from '@tiptap/core'
import { reactive, ref, type Ref } from 'vue'
import type { Entretien } from '../../../shared/entretien/entretien'
import {
  annuler,
  enregistrer,
  estApplicable,
  type CtxInverse,
  type Inverse,
  type Journal,
} from '../../../shared/entretien/journal'
import type { Locuteur } from '../../../shared/format'

interface EffetsAnnulation {
  rafraichirProjections: () => void
  rafraichirDecorations: () => void
  rafraichirGouttiere: () => void
  rafraichirCompteursAnonymisation: () => void
  rafraichirReperage: () => void
  planifierSauvegarde: () => void
}

/** Gère le journal volatil et l'application de ses actions inverses. */
export function useJournalEntretien(deps: {
  entretien: Entretien
  locuteurs: Ref<Locuteur[]>
  lireValeursGen: () => Record<string, string>
  lireEditeur: () => Editor | null
  effetsAnnulation: EffetsAnnulation
}) {
  const journal = reactive<Journal>({ entrees: [] })
  const entreesJournal = ref<Array<{
    id: string
    heure: string
    libelle: string
    annulable: boolean
  }>>([])
  const genId = () => 'j-' + Math.random().toString(36).slice(2, 9)

  function ctxInverse(): CtxInverse {
    const ed = deps.lireEditeur()
    return {
      entretien: deps.entretien,
      locuteurs: deps.locuteurs.value,
      valeursGen: deps.lireValeursGen(),
      blocs: ed
        ? {
            locDe: (pos) => {
              const n = ed.state.doc.nodeAt(pos)
              return n?.type.name === 'paragraph'
                ? ((n.attrs.loc ?? null) as number | null)
                : undefined
            },
            poserLoc: (pos, loc) => {
              const n = ed.state.doc.nodeAt(pos)
              if (n) ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, loc }))
            },
          }
        : undefined,
    }
  }

  function rafraichirJournal() {
    const ctx = ctxInverse()
    entreesJournal.value = journal.entrees.map((entree) => ({
      id: entree.id,
      heure: new Date(entree.horodatage).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      libelle: entree.libelle,
      annulable: estApplicable(entree.inverse, ctx),
    }))
  }

  function enregistrerAction(libelle: string, inverse: Inverse) {
    return enregistrer(journal, libelle, inverse, genId)
  }

  function annulerEntree(id: string) {
    if (annuler(journal, id, ctxInverse())) {
      deps.effetsAnnulation.rafraichirProjections()
      deps.effetsAnnulation.rafraichirDecorations()
      deps.effetsAnnulation.rafraichirGouttiere()
      deps.effetsAnnulation.rafraichirCompteursAnonymisation()
      deps.effetsAnnulation.rafraichirReperage()
      deps.effetsAnnulation.planifierSauvegarde()
    }
    rafraichirJournal()
  }

  function reinitialiserJournal() {
    journal.entrees.length = 0
  }

  return {
    journal,
    entreesJournal,
    enregistrerAction,
    rafraichirJournal,
    annulerEntree,
    reinitialiserJournal,
  }
}
