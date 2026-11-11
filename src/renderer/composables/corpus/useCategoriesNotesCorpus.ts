import { ref } from 'vue'
import type { NoteCategory } from '../../../shared/format'
import { normaliserCategoriesNote } from '../../../shared/entretien/notes'
import { lancerOperationGlobale } from '../../operationGlobaleCorpus'

/** Gère les définitions de catégories de notes propres au corpus. */
export function useCategoriesNotesCorpus(opts: { flush: () => Promise<void> }) {
  const categoriesNote = ref<NoteCategory[]>(normaliserCategoriesNote())
  const messageCategorieNote = ref<string | null>(null)

  function majCategoriesNote(brutes?: NoteCategory[] | null) {
    categoriesNote.value = normaliserCategoriesNote(brutes)
  }

  function reinitialiser() {
    majCategoriesNote()
    messageCategorieNote.value = null
  }

  function nomCategorieNote(id: string): string {
    return categoriesNote.value.find((categorie) => categorie.id === id)?.nom ?? 'générale'
  }

  function couleurCategorieNote(id: string): string {
    return categoriesNote.value.find((categorie) => categorie.id === id)?.couleur ?? '#9e9e9e'
  }

  function categorieNoteDefaut(): string {
    return categoriesNote.value.find((categorie) => categorie.id === 'ncat_generale')?.id
      ?? categoriesNote.value[0]?.id
      ?? 'ncat_generale'
  }

  async function ajouterCategorieNote(nom: string, couleur: string): Promise<string> {
    const resultat = await window.sonal.corpus.ajouterCategorieNote(nom, couleur)
    majCategoriesNote(resultat.corpus.categoriesNote)
    return resultat.id
  }

  async function renommerCategorieNote(id: string, nom: string) {
    const corpus = await window.sonal.corpus.renommerCategorieNote(id, nom)
    majCategoriesNote(corpus.categoriesNote)
  }

  async function majCouleurCategorieNote(id: string, couleur: string) {
    const corpus = await window.sonal.corpus.majCouleurCategorieNote(id, couleur)
    majCategoriesNote(corpus.categoriesNote)
  }

  async function supprimerCategorieNote(id: string): Promise<string | null> {
    messageCategorieNote.value = null
    let supprimee = false
    const lancee = await lancerOperationGlobale(async () => {
      await opts.flush()
      const resultat = await window.sonal.corpus.supprimerCategorieNote(id)
      if (!resultat.ok) {
        messageCategorieNote.value =
          `« ${nomCategorieNote(id)} » est utilisée ${resultat.usages}× — retire-la d'abord de tes notes.`
        return
      }
      majCategoriesNote(resultat.corpus.categoriesNote)
      supprimee = true
    })
    return lancee && supprimee ? id : null
  }

  return {
    categoriesNote,
    messageCategorieNote,
    majCategoriesNote,
    reinitialiser,
    nomCategorieNote,
    couleurCategorieNote,
    categorieNoteDefaut,
    ajouterCategorieNote,
    renommerCategorieNote,
    majCouleurCategorieNote,
    supprimerCategorieNote,
  }
}
