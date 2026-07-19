import type { Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { lecturePluginKey } from '../editor/lecture'
import {
  projeterAncres,
  plageCourante,
  tempsAuPoint,
  debutTour,
  type Ancre,
  type AncreTexte,
} from '../../shared/entretien/audio'

/**
 * SYNCHRO AUDIO de l'entretien ouvert (S7) : le pont temps ↔ texte. Projette les
 * ancres {pos, t} du modèle en coordonnées texte (D-S14), surligne et suit la
 * plage lue pendant la lecture, et interpole un temps à une position de texte
 * (clic texte / clic tour, D-S13). Ne connaît NI le lecteur audio NI la
 * persistance : il reçoit l'éditeur et les ancres du modèle, rend des temps et
 * pilote le surlignage via le plugin lecture.
 */
export function useSynchroAudio(deps: {
  editor: Ref<Editor | undefined>
  /** Les ancres du MODÈLE — le tableau réactif lui-même (toujours muté par
   *  splice/push, jamais réaffecté : l'identité tient toute la session). */
  ancres: Ancre[]
}) {
  /** MÉMO de la projection des ancres en coordonnées texte (dérivation, jamais
   *  persistée) — invalidé quand le doc change (identité du doc PM) : en lecture
   *  sans édition, le tick reste une pure dichotomie (invariant perf D-S14). */
  let projection: { doc: unknown; ancres: AncreTexte[] } | null = null
  function ancresTexte(): AncreTexte[] {
    const ed = deps.editor.value
    if (!ed) return []
    if (!projection || projection.doc !== ed.state.doc) {
      const longueurs: number[] = []
      ed.state.doc.forEach((node) => {
        if (node.type.name === 'paragraph') longueurs.push(node.content.size)
      })
      projection = { doc: ed.state.doc, ancres: projeterAncres(deps.ancres, longueurs) }
    }
    return projection.ancres
  }

  /** Plage actuellement surlignée (cache d'égalité : on ne dispatch que si elle
   *  CHANGE — le remap du plugin suit les éditions entre-temps). */
  let plageLue: { de: number; a: number } | null = null
  /** Cale le surlignage sur l'instant de lecture `t` (null = éteindre) et fait
   *  défiler le texte vers la plage lue. La plage = les 2 ancres du MODÈLE qui
   *  encadrent `t` (indices partagés avec la projection, ordre 1:1). */
  function majPlageLue(t: number | null) {
    const ed = deps.editor.value
    if (!ed) return
    const idx = t == null ? null : plageCourante(ancresTexte(), t)
    const plage = idx == null ? null : { de: deps.ancres[idx.g].pos, a: deps.ancres[idx.d].pos }
    if (plage?.de === plageLue?.de && plage?.a === plageLue?.a) return
    plageLue = plage
    ed.view.dispatch(ed.state.tr.setMeta(lecturePluginKey, plage))
    if (plage) {
      const dom = ed.view.domAtPos(plage.de).node
      const el = dom instanceof HTMLElement ? dom : dom.parentElement
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  /** Éteint le surlignage SANS passer par la garde d'égalité de `majPlageLue` :
   *  au changement/remplacement de doc, la plage mémorisée vise l'ANCIEN doc —
   *  la garde croirait à tort qu'il n'y a rien à redessiner. */
  function eteindre() {
    plageLue = null
    const ed = deps.editor.value
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(lecturePluginKey, null))
  }

  /** Place le curseur à `pos` (bornée au doc) et fait défiler le texte jusque-là
   *  (point de reprise : revenir à l'endroit du texte où on a quitté). */
  function allerAuTexte(pos: number) {
    const ed = deps.editor.value
    if (!ed) return
    const p = Math.max(1, Math.min(pos, ed.state.doc.content.size - 1))
    ed.commands.setTextSelection(p)
    const dom = ed.view.domAtPos(p).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /** Temps interpolé à la position de texte `pos` (clic DANS le texte → seek
   *  précis, comme SonalPi). Aujourd'hui : prorata entre les 2 ancres qui
   *  encadrent le point (D-S13) ; avec des ancres au mot, la précision suivra
   *  toute seule. null si aucune ancre (texte sans timecodes). */
  function tempsAuTexte(pos: number): number | null {
    const ed = deps.editor.value
    if (!ed) return null
    let x = 0
    let xClic: number | null = null
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph' || xClic != null) return
      const debut = offset + 1
      if (pos <= debut + node.content.size) {
        xClic = x + Math.max(0, Math.min(node.content.size, pos - debut))
      } else {
        x += node.content.size
      }
    })
    return xClic == null ? null : tempsAuPoint(ancresTexte(), xClic)
  }

  /** Temps de seek pour un clic-tour sur le bloc à `posBloc` : le temps
   *  interpolé au DÉBUT du tour contenant ce bloc (D-S2 : tour dérivé ;
   *  D-S13 : interpolation entre ancres si le début du tour n'en porte pas). */
  function tempsDuBloc(posBloc: number): number | null {
    const ed = deps.editor.value
    if (!ed) return null
    const locs: (number | null)[] = []
    const xDebuts: number[] = []
    let k = -1
    let x = 0
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      if (offset === posBloc) k = locs.length
      locs.push((node.attrs.loc ?? null) as number | null)
      xDebuts.push(x)
      x += node.content.size
    })
    if (k < 0) return null
    return tempsAuPoint(ancresTexte(), xDebuts[debutTour(locs, k)])
  }

  return { majPlageLue, eteindre, allerAuTexte, tempsAuTexte, tempsDuBloc }
}
