// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ref } from 'vue'
import { BlocAttributs } from '../src/renderer/editor/schema'
import { useLocuteursEntretien } from '../src/renderer/composables/entretien/useLocuteursEntretien'
import type { ParticipationLocuteur } from '../src/shared/format'

const editeurs: Editor[] = []
afterEach(() => { for (const ed of editeurs.splice(0)) ed.destroy() })
const reference = { entretienId: 'e1', participationId: '7' }

function banc(global = false) {
  const locuteurs = ref<ParticipationLocuteur[]>([
    { id: '7', index: 11, nom: 'Question', locuteurRef: 'identite-a', valeursLoc: { age: 'a' } },
    { id: 'historique', index: 7, nom: 'Réponse', locuteurRef: 'identite-b', valeursLoc: {} },
  ])
  const ouvertId = ref<string | null>('e1'), lectureSeule = ref(false)
  const editor = new Editor({ extensions: [StarterKit, BlocAttributs], content: '<p data-loc="11">Question.</p><p data-loc="7">Réponse.</p>' })
  editeurs.push(editor)
  const effets = { enregistrerAction: vi.fn(), rafraichirJournal: vi.fn(), rafraichirProjections: vi.fn(), rafraichirGouttiere: vi.fn(),
    planifierSauvegarde: vi.fn(), viderSauvegarde: vi.fn(async () => {}), retirerLocuteurDesNotes: vi.fn() }
  const demanderRenommageGlobal = vi.fn()
  const outils = useLocuteursEntretien({ locuteurs, ouvertId, lectureSeule: () => lectureSeule.value,
    renommageGlobalPossible: () => global, demanderRenommageGlobal,
    lireEditeur: () => editor, effets })
  const photo = () => JSON.parse(JSON.stringify({ locuteurs: locuteurs.value, texte: editor.getJSON() }))
  return { locuteurs, ouvertId, lectureSeule, editor, effets, demanderRenommageGlobal, ...outils, photo }
}

describe('gestes locaux sur les participations de l’entretien', () => {
  test('valider le nom d’une participation associée prépare le renommage global sans écriture ni inverse local', () => {
    const b = banc(true), avant = b.photo()
    const champ = document.createElement('input')
    champ.value = 'Nom global souhaité'
    champ.addEventListener('change', (e) => b.renommerParticipation(reference, e))
    champ.dispatchEvent(new Event('change'))
    expect(b.demanderRenommageGlobal).toHaveBeenCalledExactlyOnceWith(reference, 'Nom global souhaité')
    expect(champ.value).toBe('Question')
    expect(b.photo()).toEqual(avant)
    expect(b.effets.enregistrerAction).not.toHaveBeenCalled()
    expect(b.effets.planifierSauvegarde).not.toHaveBeenCalled()
  })

  test('le rôle, le pseudonyme et la couleur suivent l’id existant, pas son index homonyme', () => {
    const b = banc(), avant = b.photo()
    b.setInterviewer(reference, true)
    b.setPseudoLoc(reference, '  Q1  ')
    b.choisirCouleurLoc(reference, '#123456')
    expect(b.locuteurs.value[0]).toEqual({ ...avant.locuteurs[0], interviewer: true, pseudo: 'Q1', couleur: '#123456' })
    expect(b.locuteurs.value[1]).toEqual(avant.locuteurs[1])
    expect(b.editor.getJSON()).toEqual(avant.texte)
    expect(b.effets.planifierSauvegarde).toHaveBeenCalledTimes(3)
    expect(b.effets.enregistrerAction).not.toHaveBeenCalled()
  })

  test.each(['autre entretien', 'droits retirés', 'id retiré'] as const)('%s : aucun geste ne modifie une autre participation', (cas) => {
    const b = banc()
    if (cas === 'autre entretien') b.ouvertId.value = 'e2'
    if (cas === 'droits retirés') b.lectureSeule.value = true
    if (cas === 'id retiré') b.locuteurs.value[0].id = 'nouvelle'
    const avant = b.photo()
    b.setInterviewer(reference, true)
    b.setPseudoLoc(reference, 'Autre')
    b.choisirCouleurLoc(reference, '#123456')
    b.demanderSuppressionLocuteur(reference)
    expect(b.photo()).toEqual(avant)
    expect(b.locuteurASupprimer.value).toBeNull()
    expect(b.effets.planifierSauvegarde).not.toHaveBeenCalled()
  })

  test('une confirmation retrouve la même participation après un changement des index', () => {
    const b = banc()
    b.demanderSuppressionLocuteur(reference)
    expect(b.locuteurASupprimer.value).toMatchObject({ reference, nbBlocs: 1 })
    b.locuteurs.value[0].index = 7
    b.locuteurs.value[1].index = 11
    const tr = b.editor.state.tr
    b.editor.state.doc.forEach((node, pos) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, loc: node.attrs.loc === 11 ? 7 : 11 }))
    b.editor.view.dispatch(tr)
    b.confirmerSuppressionLocuteur()
    expect(b.locuteurs.value.map((p) => [p.id, p.index])).toEqual([['historique', 11]])
    expect(b.editor.state.doc.content.firstChild!.attrs.loc).toBeNull()
    expect(b.editor.state.doc.content.lastChild!.attrs.loc).toBe(11)
    expect(b.effets.retirerLocuteurDesNotes).toHaveBeenCalledExactlyOnceWith('7')
    expect(b.effets.planifierSauvegarde).toHaveBeenCalledOnce()
  })

  test('réutiliser l’index d’une participation retirée ne réutilise pas sa confirmation', () => {
    const b = banc()
    b.demanderSuppressionLocuteur(reference)
    b.locuteurs.value[0].id = 'nouvelle'
    const avant = b.photo()
    b.confirmerSuppressionLocuteur()
    expect(b.photo()).toEqual(avant)
    expect(b.effets.retirerLocuteurDesNotes).not.toHaveBeenCalled()
    expect(b.effets.planifierSauvegarde).not.toHaveBeenCalled()
  })

  test('un bilan changé doit être confirmé de nouveau avant de désattribuer davantage de texte', () => {
    const b = banc()
    b.demanderSuppressionLocuteur(reference)
    b.editor.commands.insertContentAt(b.editor.state.doc.content.size, '<p data-loc="11">Encore une question.</p>')
    const avant = b.photo()
    b.confirmerSuppressionLocuteur()
    expect(b.photo()).toEqual(avant)
    expect(b.locuteurASupprimer.value?.nbBlocs).toBe(2)
    expect(b.messagePersonnes.value).toContain('Vérifiez le bilan')
    expect(b.effets.planifierSauvegarde).not.toHaveBeenCalled()
    b.confirmerSuppressionLocuteur()
    expect(b.locuteurs.value.map((p) => p.id)).toEqual(['historique'])
    expect(b.editor.getText()).toContain('Encore une question.')
    expect(b.effets.retirerLocuteurDesNotes).toHaveBeenCalledExactlyOnceWith('7')
  })

  test('la suppression d’une participation silencieuse ne renumérote pas celles qui restent', () => {
    const b = banc()
    b.locuteurs.value.push({ id: 'silencieuse', index: 20, nom: 'Question', locuteurRef: null, valeursLoc: {} })
    const avant = b.editor.getJSON()
    b.demanderSuppressionLocuteur({ entretienId: 'e1', participationId: 'silencieuse' })
    expect(b.locuteurs.value.map((p) => [p.id, p.index])).toEqual([['7', 11], ['historique', 7]])
    expect(b.editor.getJSON()).toEqual(avant)
    expect(b.locuteurASupprimer.value).toBeNull()
    expect(b.effets.retirerLocuteurDesNotes).toHaveBeenCalledExactlyOnceWith('silencieuse')
  })

  test('une perte de droits entre demande et confirmation interdit toute suppression', () => {
    const b = banc()
    b.demanderSuppressionLocuteur(reference)
    b.lectureSeule.value = true
    const avant = b.photo()
    b.confirmerSuppressionLocuteur()
    expect(b.photo()).toEqual(avant)
    expect(b.effets.planifierSauvegarde).not.toHaveBeenCalled()
    b.nouveauLocuteur()
    expect(b.photo()).toEqual(avant)
  })
})
