import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'
import { snapToWord } from './snap'

export const menuContextePluginKey = new PluginKey('sonal-menu-contexte')

/** Cible du menu contextuel : le clic (coordonnées écran) + ce qui se trouve
 *  sous lui. L'UI positionne son menu flottant à (x, y) et agit sur ces
 *  annotations. */
export interface CibleMenuContexte {
  x: number
  y: number
  /** Occurrence anon couvrante (menu « exception ↔ anonymisé »), sinon null. */
  anon: Annotation | null
  /** Codages couvrant la position — un item de retrait par thème (sans avoir à
   *  resélectionner, parité SonalPi1). Plusieurs annotations peuvent porter le même
   *  code : dédoublonnées côté UI. */
  codages: Annotation[]
  /** Commentaires couvrant la position — un item d'édition par commentaire. */
  commentaires: Annotation[]
  /** Plage proposée au geste « Commenter » : la sélection courante si non vide
   *  (snappée au mot), sinon les bornes de l'annotation couvrante la plus
   *  large ; null s'il n'y a rien à commenter. */
  plageCommenter: { from: number; to: number } | null
  /** Sélection libre, sans repli sur une annotation couvrante. */
  plageSelection: { from: number; to: number } | null
}

/** Occurrence anon couvrante la plus LARGE (les incluses sont écartées : pas
 *  d'action directe sur ce qui est masqué par une annotation englobante). */
function anonCouvrante(entretien: Entretien, pos: number): Annotation | null {
  const candidates = entretien.annotations.filter(
    (a) =>
      a.type === 'anon' &&
      !estOrpheline(a) &&
      a.from <= pos &&
      pos < a.to &&
      !entretien.annotations.some(
        (y) =>
          y.type === 'anon' &&
          !estOrpheline(y) &&
          y.id !== a.id &&
          y.from <= a.from &&
          a.to <= y.to &&
          y.to - y.from > a.to - a.from,
      ),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((l, r) => (r.to - r.from > l.to - l.from ? r : l))
}

/**
 * Menu contextuel GÉNÉRIQUE de l'éditeur : un clic droit résout ce qui se
 * trouve sous lui (occurrence anon, codages, commentaires, sélection) et
 * délègue tout à `ouvrir` — le plugin ne décide RIEN.
 *
 * L'événement n'est consommé QUE s'il y a quelque chose à proposer :
 * sélection non vide ou annotation couvrante. Sinon retour `false` : le menu
 * natif du navigateur reste accessible.
 */
export function pluginMenuContexte(entretien: Entretien, ouvrir: (cible: CibleMenuContexte) => void): Plugin {
  return new Plugin({
    key: menuContextePluginKey,
    props: {
      handleDOMEvents: {
        contextmenu(view: EditorView, event: MouseEvent) {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false

          // Sélection non vide → elle prime comme plage à commenter (snap au
          // mot, même granularité que le codage). Un clic droit ne déplace PAS
          // la sélection : elle est encore celle d'avant le clic.
          const sel = view.state.selection
          let plageCommenter: { from: number; to: number } | null = null
          let plageSelection: { from: number; to: number } | null = null
          if (!sel.empty) {
            const snappe = snapToWord(view.state, sel.from, sel.to)
            if (snappe.from < snappe.to) {
              plageCommenter = snappe
              plageSelection = snappe
            }
          }

          // Annotations couvrantes (la borne droite est exclue : un clic sur le
          // caractère final place le caret AVANT lui).
          const couvrantes = entretien.annotations.filter(
            (a) => !estOrpheline(a) && a.from <= pos.pos && pos.pos < a.to,
          )
          const codages = couvrantes.filter((a) => a.type === 'codage')
          const commentaires = couvrantes
            .filter((a) => a.type === 'commentaire')
            .sort((a, b) => a.from - b.from)
          const anon = anonCouvrante(entretien, pos.pos)
          // Sans plage dédiée, « Commenter » reprendra les bornes de l'annotation
          // couvrante la plus large (le clic droit sur un codage commente LE codage).
          if (!plageCommenter && couvrantes.length > 0) {
            const plusLarge = couvrantes.reduce((l, r) => (r.to - r.from > l.to - l.from ? r : l))
            plageCommenter = { from: plusLarge.from, to: plusLarge.to }
          }

          if (!plageCommenter && !anon && codages.length === 0 && commentaires.length === 0) {
            return false // rien à proposer → menu natif
          }
          event.preventDefault()
          ouvrir({ x: event.clientX, y: event.clientY, anon, codages, commentaires, plageCommenter, plageSelection })
          return true
        },
      },
    },
  })
}
