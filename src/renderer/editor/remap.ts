import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Mapping } from '@tiptap/pm/transform'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Ancre } from '../../shared/entretien/audio'
import type { Entretien } from '../../shared/entretien/entretien'

/**
 * Le cœur de l'ancrage sans CRDT : les plages du modèle sont remappées à
 * travers chaque transaction ProseMirror (c'est ce qui fait « suivre » les
 * annotations quand le texte bouge — couvert par test/remap.test.ts).
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

/**
 * Ancres temporelles : même canal que les annotations. assoc -1 :
 * une insertion EXACTEMENT sur l'ancre la laisse en place — le texte tapé au
 * début d'un cue entre dans le cue, celui tapé à sa fin tombe après sa borne
 * (dans le trou, que l'interpolation répartit). Une suppression effondre les
 * ancres couvertes sur la coupe (plage devenue vide — plageCourante l'enjambe).
 * Le mapping est monotone : l'ordre par pos (donc par x) est préservé.
 */
export function remapperAncres(ancres: Ancre[], mapping: Mapping): void {
  for (const a of ancres) a.pos = mapping.map(a.pos, -1)
}

export const remapPluginKey = new PluginKey('sonal-remap-annotations')

/**
 * Le SEUL écrivain des positions du modèle : ce plugin voit passer chaque
 * transaction (y compris celles d'undo/redo, qui portent leur mapping) et
 * remappe les annotations ET les ancres de l'entretien. Le modèle reste la
 * vérité ; le plugin n'est que le canal par lequel l'éditeur l'informe des
 * éditions.
 */
export function pluginRemap(entretien: Entretien): Plugin {
  return new Plugin({
    key: remapPluginKey,
    state: {
      init: () => null,
      apply(tr) {
        if (tr.docChanged) {
          remapperAnnotations(entretien.annotations, tr.mapping)
          remapperAncres(entretien.ancres, tr.mapping)
        }
        return null
      },
    },
  })
}
