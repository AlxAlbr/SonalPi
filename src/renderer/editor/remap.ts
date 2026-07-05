import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Mapping } from '@tiptap/pm/transform'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'

/**
 * Le remplaçant asynchrone de RelativePosition (cf. DEMARRAGE3, « L'ancrage
 * sans RelativePosition » ; risque central prouvé par test/remap.test.ts) : les
 * plages du modèle sont remappées à travers chaque transaction ProseMirror.
 *
 * Choix des bornes (le paramètre assoc du mapping) : une insertion exactement
 * SUR une borne reste HORS de la plage — taper juste avant ou juste après un
 * passage codé n'étend pas le codage.
 *   - from, assoc +1 : l'insertion à from pousse from après le texte inséré ;
 *   - to,   assoc -1 : l'insertion à to laisse to avant le texte inséré.
 * Une insertion strictement à l'intérieur étend toujours la plage.
 */
export function remapperAnnotations(annotations: Annotation[], mapping: Mapping): void {
  for (const a of annotations) {
    a.from = mapping.map(a.from, 1)
    a.to = mapping.map(a.to, -1)
    // Plage entièrement supprimée : les bornes se croisent → on referme
    // (from === to). L'annotation devient orpheline (requête estOrpheline),
    // elle n'est PAS supprimée silencieusement.
    if (a.to < a.from) a.to = a.from
  }
}

export const remapPluginKey = new PluginKey('sonal-remap-annotations')

/**
 * Le SEUL écrivain des positions du modèle : ce plugin voit passer chaque
 * transaction (y compris celles d'undo/redo, qui portent leur mapping) et
 * remappe les annotations de l'entretien. Le modèle reste la vérité ; le
 * plugin n'est que le canal par lequel l'éditeur l'informe des éditions.
 */
export function pluginRemap(entretien: Entretien): Plugin {
  return new Plugin({
    key: remapPluginKey,
    state: {
      init: () => null,
      apply(tr) {
        if (tr.docChanged) remapperAnnotations(entretien.annotations, tr.mapping)
        return null
      },
    },
  })
}
