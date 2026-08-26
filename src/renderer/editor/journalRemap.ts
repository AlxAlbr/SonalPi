import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Journal } from '../../shared/entretien/journal'
import { remapperAnnotations } from './remap'

export const journalRemapPluginKey = new PluginKey('sonal-journal-remap')

/**
 *  Le pendant JOURNAL du remap des annotations : les inverses en attente
 *  portent des positions qui doivent suivre les éditions comme le modèle —
 *  - l'annotation retirée (à re-poser) est remappée comme une annotation du
 *    modèle (même fonction, même politique de bornes) ; si son texte est
 *    supprimé, elle se referme → orpheline → l'entrée devient « non annulable » ;
 *  - les positions de blocs (restaurer un `loc`) sont mappées ; si le bloc
 *    disparaît (fusion, suppression), la position ne résout plus un paragraphe
 *    → « non annulable » (vérifié à l'annulation, jamais appliqué à moitié).
 *
 *  NB : `setNodeMarkup` (l'application d'un restaurerLocs) ne déplace aucune
 *  position → les entrées encore en attente ne sont pas perturbées.
 */
export function pluginRemapJournal(journal: Journal): Plugin {
  return new Plugin({
    key: journalRemapPluginKey,
    state: {
      init: () => null,
      apply(tr) {
        if (!tr.docChanged) return null
        for (const e of journal.entrees) {
          const inv = e.inverse
          if (inv.type === 'reposerAnnotation') {
            remapperAnnotations([inv.annotation], tr.mapping)
          } else if (inv.type === 'restaurerLocs') {
            for (const b of inv.blocs) b.pos = tr.mapping.map(b.pos, -1)
          }
        }
        return null
      },
    },
  })
}
