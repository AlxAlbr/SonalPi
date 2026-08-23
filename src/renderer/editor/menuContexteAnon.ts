import { Plugin, PluginKey } from '@tiptap/pm/state'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'

export const menuAnonPluginKey = new PluginKey('sonal-menu-contexte-anon')

/** Cible du menu contextuel : le clic (coordonnées écran) + l'occurrence sous
 *  lui. L'UI positionne son menu flottant à (x, y) et agit sur `annotation`. */
export interface CibleMenuAnon {
  x: number
  y: number
  annotation: Annotation
}

/**
 * Menu contextuel des occurrences anon : un clic DROIT sur une
 * occurrence ouvre un menu flottant (bascule exception ↔ anonymisé, portée par
 * l'UI). Le plugin ne décide RIEN : il résout l'occurrence couvrante — find sur
 * le modèle, les positions anon SONT les positions ProseMirror (remappées par
 * pluginRemap) — et délègue tout à `ouvrir`.
 *
 * Sur un texte non anon, on ne consomme pas l'événement (retour `false`) : le
 * menu natif du navigateur reste accessible, le menu neutre viendra plus tard.
 * L'événement n'est consommé QUE si le clic tombe sur une occurrence — c'est
 * le seul cas où notre menu remplace le menu natif.
 */
export function pluginMenuAnon(entretien: Entretien, ouvrir: (cible: CibleMenuAnon) => void): Plugin {
  return new Plugin({
    key: menuAnonPluginKey,
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false
          // Occurrence couvrante : la position du clic tombe DANS sa plage
          // [from, to[. Un clic sur le caractère final donne une position
          // strictement inférieure à `to` (le caret se place avant le
          // caractère) → la borne droite est exclue, pas de débordement sur le
          // texte qui suit.
          const couvrante = entretien.annotations.find(
            (a) => a.type === 'anon' && !estOrpheline(a) && a.from <= pos.pos && pos.pos < a.to,
          )
          if (!couvrante) return false
          // Notre menu remplace le menu natif UNIQUEMENT ici.
          event.preventDefault()
          ouvrir({ x: event.clientX, y: event.clientY, annotation: couvrante })
          return true
        },
      },
    },
  })
}