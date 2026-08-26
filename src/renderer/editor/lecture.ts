import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type PlageLue = { de: number; a: number } | null

export const lecturePluginKey = new PluginKey<PlageLue>('sonal-lecture')

/**
 *  Surlignage de la PLAGE en cours de lecture audio. État = la plage PM
 *  [de, a] entre les deux ancres encadrant l'instant courant (ou null), poussée
 *  par setMeta — c'est l'orchestrateur qui suit `currentTime` et dérive la plage
 *  (fonctions pures de shared/entretien/audio) ; le plugin ne fait que décorer.
 *  UNE SEULE décoration inline à la fois (invariant de perf — jamais une
 *  décoration par ancre) ; avec des ancres au cue elle couvre le
 *  texte du cue, avec des ancres au mot elle suivra le mot. La plage est
 *  REMAPPÉE sur les éditions (assoc -1, comme les ancres du modèle) — le
 *  surlignage suit le texte qui bouge entre deux ticks.
 */
export function pluginLecture(): Plugin<PlageLue> {
  return new Plugin<PlageLue>({
    key: lecturePluginKey,
    state: {
      init: () => null,
      apply(tr, plage) {
        const meta = tr.getMeta(lecturePluginKey)
        if (meta !== undefined) return meta as PlageLue
        if (plage == null) return null
        return { de: tr.mapping.map(plage.de, -1), a: tr.mapping.map(plage.a, -1) }
      },
    },
    props: {
      decorations(state) {
        const plage = this.getState(state)
        if (plage == null || plage.a <= plage.de) return DecorationSet.empty
        return DecorationSet.create(state.doc, [
          Decoration.inline(plage.de, plage.a, { class: 'plage-lue' }),
        ])
      },
    },
  })
}
