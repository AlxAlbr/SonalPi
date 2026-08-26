import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type PlageReperage = { de: number; a: number } | null

export const reperagePluginKey = new PluginKey<PlageReperage>('sonal-reperage-anon')

/**
 *  Surlignage TRANSITOIRE de l'occurrence courante en repérage anon (loupe
 *  ◄ i/N ►). État = la plage PM [de, a] poussée par setMeta par le composable ;
 *  le plugin ne fait que décorer (classe `.reperage-hit`), sans jamais toucher
 *  au modèle — le repérage est non destructif. La plage est REMAPPÉE sur les
 *  éditions (assoc -1, comme la plage lue) pour suivre le texte qui bouge.
 */
export function pluginReperage(): Plugin<PlageReperage> {
  return new Plugin<PlageReperage>({
    key: reperagePluginKey,
    state: {
      init: () => null,
      apply(tr, plage) {
        const meta = tr.getMeta(reperagePluginKey)
        if (meta !== undefined) return meta as PlageReperage
        if (plage == null) return null
        return { de: tr.mapping.map(plage.de, -1), a: tr.mapping.map(plage.a, -1) }
      },
    },
    props: {
      decorations(state) {
        const plage = this.getState(state)
        if (plage == null || plage.a <= plage.de) return DecorationSet.empty
        return DecorationSet.create(state.doc, [
          Decoration.inline(plage.de, plage.a, { class: 'reperage-hit' }),
        ])
      },
    },
  })
}
