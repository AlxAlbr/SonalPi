// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import PanneauCommentairesEntretien from '../src/renderer/components/traiter/entretien/PanneauCommentairesEntretien.vue'
import { useNotesEntretien } from '../src/renderer/composables/entretien/useNotesEntretien'
import type { Entretien } from '../src/shared/entretien/entretien'

const injection = vi.hoisted(() => ({ contexte: {} as any }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
})

async function monter() {
  const selectionPassage = ref<{ entretienId: string; from: number; to: number; texte: string } | null>(null)
  const commentaires = ref<Array<{ id: string; auteur: string; texte: string }>>([])
  const commenterPlage = vi.fn()
  const allerAuCommentaire = vi.fn()
  const lectureSeule = ref(false)
  injection.contexte = { selectionPassage, commentairesPourLiaison: commentaires, commenterPlage, allerAuCommentaire }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(PanneauCommentairesEntretien, { lectureSeule: lectureSeule.value }) })
  apps.push(app)
  app.mount(host)
  await nextTick()
  return { host, selectionPassage, commentaires, commenterPlage, allerAuCommentaire, lectureSeule }
}

test('le bouton Commentaire exige une sélection (hint sinon) et respecte la lecture seule', async () => {
  const outils = await monter()
  const bouton = outils.host.querySelector<HTMLButtonElement>('.ajouter-commentaire')!
  // Sans sélection : le clic n'ouvre rien, il affiche le hint (l'aide permanente
  // d'origine est retirée).
  bouton.click()
  await nextTick()
  expect(outils.commenterPlage).not.toHaveBeenCalled()
  expect(outils.host.textContent).toContain('Sélectionnez du texte, puis cliquez sur « Commentaire ».')
  outils.selectionPassage.value = { entretienId: 'e1', from: 2, to: 12, texte: 'Un passage' }
  await nextTick()
  bouton.click()
  expect(outils.commenterPlage).toHaveBeenCalledExactlyOnceWith(2, 12)
  // Le hint s'efface dès que la modale s'ouvre.
  await nextTick()
  expect(outils.host.textContent).not.toContain('Sélectionnez du texte')
  outils.lectureSeule.value = true
  await nextTick()
  expect(bouton.disabled).toBe(true)
  bouton.click()
  expect(outils.commenterPlage).toHaveBeenCalledTimes(1)
  // Le hint de la sélection reste affiché jusqu'au prochain clic fructueux
  // (même sillage que le panneau Thématiques) — on le vérifie au retour
  // en édition : le clic suivant sur une sélection l'efface.
  outils.lectureSeule.value = false
  await nextTick()
  bouton.click()
  await nextTick()
  expect(outils.commenterPlage).toHaveBeenCalledTimes(2)
})

test('la liste reste consultable en lecture seule et le texte est affiché sans interpréter de HTML', async () => {
  const outils = await monter()
  outils.commentaires.value = [{ id: 'c1', auteur: '', texte: '<script>Texte non interprété</script>' }]
  outils.lectureSeule.value = true
  await nextTick()
  expect(outils.host.textContent).not.toContain('Aucun commentaire pour le moment.')
  expect(outils.host.textContent).toContain('Sans auteur')
  expect(outils.host.textContent).toContain('<script>Texte non interprété</script>')
  expect(outils.host.querySelector('script')).toBeNull()
  outils.host.querySelector<HTMLButtonElement>('.aller-commentaire')!.click()
  expect(outils.allerAuCommentaire).toHaveBeenCalledExactlyOnceWith('c1')
  outils.commentaires.value = []
  await nextTick()
  expect(outils.host.textContent).toContain('Aucun commentaire pour le moment.')
})

test('les commentaires sont triés selon leur passage et les annotations orphelines sont exclues', () => {
  const entretien = reactive<Entretien>({ annotations: [], ancres: [], reperesPassages: [] })
  const notes = useNotesEntretien({
    entretien, locuteurs: ref([]), lireEditeur: () => null,
    nomCategorieNote: () => '', categorieNoteDefaut: () => '',
    planifierSauvegarde: vi.fn(), enregistrerAction: vi.fn(),
  })
  const commentaire = (id: string, from: number, to: number) => ({
    id, from, to, type: 'commentaire' as const, auteur: 'Alice', texte: id,
  })
  entretien.annotations.push(commentaire('dernier', 20, 30), commentaire('premier', 1, 6), commentaire('orphelin', 8, 8))
  expect(notes.commentairesPourLiaison.value.map((c) => c.id)).toEqual(['premier', 'dernier'])
  entretien.annotations[0]!.from = 0
  expect(notes.commentairesPourLiaison.value.map((c) => c.id)).toEqual(['dernier', 'premier'])
  entretien.annotations.splice(0, 1)
  expect(notes.commentairesPourLiaison.value.map((c) => c.id)).toEqual(['premier'])
})
