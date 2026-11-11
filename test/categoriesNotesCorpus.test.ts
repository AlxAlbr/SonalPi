import { describe, expect, test, vi } from 'vitest'
import { useCategoriesNotesCorpus } from '../src/renderer/composables/corpus/useCategoriesNotesCorpus'

describe('catégorie par défaut des notes', () => {
  test('préfère générale même si elle ne figure pas en premier', () => {
    const categories = useCategoriesNotesCorpus({ flush: vi.fn(async () => {}) })
    expect(categories.categoriesNote.value[0]?.id).not.toBe('ncat_generale')
    expect(categories.categorieNoteDefaut()).toBe('ncat_generale')
    categories.majCategoriesNote([
      { id: 'personnelle', nom: 'Personnelle', couleur: '#ffffff' },
      { id: 'ncat_generale', nom: 'générale', couleur: '#81c784' },
    ])
    expect(categories.categorieNoteDefaut()).toBe('ncat_generale')
  })

  test('utilise une catégorie existante si générale a été supprimée', () => {
    const categories = useCategoriesNotesCorpus({ flush: vi.fn(async () => {}) })
    categories.majCategoriesNote([{ id: 'personnelle', nom: 'Personnelle', couleur: '#ffffff' }])
    expect(categories.categorieNoteDefaut()).toBe('personnelle')
  })
})
