import type { Editor } from '@tiptap/core'
import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  recherchePluginKey,
  trouverOccurrences,
  type OccurrenceRecherche,
} from '../../editor/recherche'

export type LireEditeur = () => Editor | null

/** Gère la recherche dans l'entretien ouvert et ses décorations TipTap. */
export function useRechercheEntretien(deps: {
  lireEditeur: LireEditeur
  ouvertId: Readonly<Ref<string | null>>
  actif?: () => boolean
}) {
  const rechercheOuverte = ref(false)
  const rechercheTexte = ref('')
  const remplacementTexte = ref('')
  const occurrencesRecherche = ref<OccurrenceRecherche[]>([])
  const indexRecherche = ref(-1)

  function majDecorationsRecherche() {
    const ed = deps.lireEditeur()
    if (!ed) return
    ed.view.dispatch(
      ed.state.tr.setMeta(recherchePluginKey, {
        plages: occurrencesRecherche.value,
        actif: indexRecherche.value,
      }),
    )
  }

  function calerOccurrenceActive() {
    const ed = deps.lireEditeur()
    const occ = occurrencesRecherche.value[indexRecherche.value]
    if (!ed || !occ) return
    ed.commands.setTextSelection({ from: occ.de, to: occ.a })
    const dom = ed.view.domAtPos(occ.de).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function recalculerRecherche(premier = false) {
    const ed = deps.lireEditeur()
    const q = rechercheTexte.value.trim()
    occurrencesRecherche.value = ed && q ? trouverOccurrences(ed.state.doc, q) : []
    if (occurrencesRecherche.value.length === 0) indexRecherche.value = -1
    else if (premier || indexRecherche.value < 0) {
      indexRecherche.value = 0
    } else if (indexRecherche.value >= occurrencesRecherche.value.length) {
      indexRecherche.value = occurrencesRecherche.value.length - 1
    }
    majDecorationsRecherche()
    if (premier) calerOccurrenceActive()
  }

  watch(rechercheTexte, () => {
    if (rechercheOuverte.value) recalculerRecherche(true)
  })

  async function ouvrirRecherche() {
    const ed = deps.lireEditeur()
    if (!rechercheTexte.value && ed) {
      const { from, to } = ed.state.selection
      const selection = to > from ? ed.state.doc.textBetween(from, to, ' ') : ''
      if (selection.trim()) rechercheTexte.value = selection.trim()
    }
    rechercheOuverte.value = true
    await nextTick()
    const champ = document.getElementById('champ-recherche') as HTMLInputElement | null
    champ?.focus()
    champ?.select()
  }

  function fermerRecherche() {
    rechercheOuverte.value = false
    occurrencesRecherche.value = []
    indexRecherche.value = -1
    majDecorationsRecherche()
  }

  function reinitialiser() {
    fermerRecherche()
    rechercheTexte.value = ''
    remplacementTexte.value = ''
  }

  function naviguerRecherche(sens: number) {
    const n = occurrencesRecherche.value.length
    if (n === 0) return
    indexRecherche.value = (indexRecherche.value + sens + n) % n
    majDecorationsRecherche()
    calerOccurrenceActive()
  }

  function remplacerOccurrenceCourante() {
    const ed = deps.lireEditeur()
    const occ = occurrencesRecherche.value[indexRecherche.value]
    if (!ed || !occ) return
    ed.view.dispatch(ed.state.tr.insertText(remplacementTexte.value, occ.de, occ.a))
    indexRecherche.value = Math.min(
      indexRecherche.value,
      Math.max(occurrencesRecherche.value.length - 1, 0),
    )
    majDecorationsRecherche()
    calerOccurrenceActive()
  }

  function remplacerTout() {
    const ed = deps.lireEditeur()
    if (!ed || occurrencesRecherche.value.length === 0) return
    const tr = ed.state.tr
    for (const occ of [...occurrencesRecherche.value].reverse()) {
      tr.insertText(remplacementTexte.value, occ.de, occ.a)
    }
    ed.view.dispatch(tr)
  }

  function surDocumentModifie() {
    if (rechercheOuverte.value) recalculerRecherche()
  }

  function surRaccourciRecherche(event: KeyboardEvent) {
    if (deps.actif && !deps.actif()) return
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    if (event.key.toLowerCase() !== 'f' || !deps.ouvertId.value) return
    event.preventDefault()
    void ouvrirRecherche()
  }

  window.addEventListener('keydown', surRaccourciRecherche)
  onBeforeUnmount(() => window.removeEventListener('keydown', surRaccourciRecherche))

  return {
    rechercheOuverte,
    rechercheTexte,
    remplacementTexte,
    occurrencesRecherche,
    indexRecherche,
    ouvrirRecherche,
    fermerRecherche,
    naviguerRecherche,
    remplacerOccurrenceCourante,
    remplacerTout,
    surDocumentModifie,
    reinitialiser,
  }
}
