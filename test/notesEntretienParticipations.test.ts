// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { useNotesEntretien } from '../src/renderer/composables/entretien/useNotesEntretien'
import type { Inverse } from '../src/shared/entretien/journal'
import type { Note } from "../src/shared/format"

function preparer() {
  const participations = ref([{ id: 'local-a' }, { id: 'local-b' }, {}])
  const enregistrerAction = vi.fn<(libelle: string, inverse: Inverse) => void>()
  const planifierSauvegarde = vi.fn()
  const notes = useNotesEntretien({
    entretien: { annotations: [], ancres: [], reperesPassages: [] }, participations,
    lireEditeur: () => null, nomCategorieNote: () => 'générale', categorieNoteDefaut: () => 'ncat_generale',
    enregistrerAction, planifierSauvegarde,
  })
  return { ...notes, participations, enregistrerAction, planifierSauvegarde }
}

function creer(outils: ReturnType<typeof preparer>) {
  outils.ajouterNote()
  Object.assign(outils.brouillonNote.value!, {
    titre: 'Note locale', corps: '<mark onclick="invalide()">Texte</mark>',
    participationIds: ['local-b', 'local-a', 'local-b', 'identite-corpus', ''],
  })
  outils.validerNote()
  return outils.notes.value[0]!
}

describe('notes de l’éditeur — propriétaires locaux', () => {
  test('la création et son inverse ne portent que des ids locaux existants et indépendants', () => {
    const outils = preparer()
    const note = creer(outils)
    expect(note.participationIds).toEqual(['local-b', 'local-a'])
    expect(note.corps).toBe('<mark>Texte</mark>')
    expect(note).not.toHaveProperty('locuteurIds')
    const inverse = outils.enregistrerAction.mock.calls[0][1]
    expect(inverse).toMatchObject({ type: 'retirerNote', note })
    expect(outils.planifierSauvegarde).toHaveBeenCalledOnce()
    note.participationIds!.push('autre')
    expect('note' in inverse && inverse.note.participationIds).toEqual(['local-b', 'local-a'])
  })

  test('retirer une participation nettoie les notes et les deux brouillons, sans réattribution', () => {
    const outils = preparer()
    const note = creer(outils)
    outils.editerNote(note.id)
    outils.ajouterNote()
    outils.brouillonNote.value!.participationIds = ['local-a', 'local-b']
    outils.retirerParticipation('local-a')
    outils.participations.value = [{ id: 'remplacement' }, { id: 'local-b' }]
    expect(note.participationIds).toEqual(['local-b'])
    expect(outils.brouillonEditionNote.value!.participationIds).toEqual(['local-b'])
    expect(outils.brouillonNote.value!.participationIds).toEqual(['local-b'])
    outils.validerEditionNote()
    expect(outils.notes.value[0]!.participationIds).toEqual(['local-b'])
  })

  test('la suppression photographie la dernière version sans partager les références', () => {
    const outils = preparer()
    const note = creer(outils)
    outils.editerNote(note.id)
    outils.brouillonEditionNote.value!.participationIds = ['local-a']
    outils.validerEditionNote()
    outils.supprimerNote(note.id)
    const inverse = outils.enregistrerAction.mock.calls[1][1]
    expect(inverse).toMatchObject({ type: 'restaurerNote', note: { participationIds: ['local-a'] } })
    expect('note' in inverse && inverse.note).not.toHaveProperty('locuteurIds')
    note.participationIds!.push('autre')
    expect('note' in inverse && inverse.note.participationIds).toEqual(['local-a'])
  })

  test('le chargement clone les liens, refuse les anciens champs et ne planifie pas d’écriture', () => {
    const outils = preparer()
    const source: Note = {
      id: 'n', categorieId: 'ncat_generale', titre: '', date: null, statut: 'prive',
      corps: 'Texte', participationIds: ['local-a'], rang: 0, creeLe: '2026-01-01', modifieLe: null,
    }
    outils.charger([source])
    outils.notes.value[0]!.participationIds!.push('local-b')
    expect(source.participationIds).toEqual(['local-a'])
    expect(() => outils.charger([{ ...source, locuteurIds: ['ancien'] } as Note])).toThrow('participations locales')
    expect(outils.planifierSauvegarde).not.toHaveBeenCalled()
    expect(outils.enregistrerAction).not.toHaveBeenCalled()
    outils.reinitialiser()
    expect(outils.notes.value).toEqual([])
  })
})
