import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/** Plage d'une occurrence trouvée, en positions PM [de, a). */
export interface OccurrenceRecherche {
  de: number
  a: number
}

export const recherchePluginKey = new PluginKey<RechercheEtat>('sonal-recherche')

interface RechercheEtat {
  plages: OccurrenceRecherche[]
  /** Index de l'occurrence courante (-1 = aucune). */
  actif: number
}

/** Trouve toutes les occurrences d'une chaîne dans le document (insensible à la
 *  casse, sensible aux accents). Renvoie des plages PM triées par position. */
export function trouverOccurrences(doc: PMNode, requete: string): OccurrenceRecherche[] {
  const q = requete.toLowerCase()
  if (!q) return []
  // Concaténation du texte du document avec une carte index → position PM :
  // chaque caractère du texte connu par sa position dans le doc. Un séparateur
  // (position NaN) est inséré entre blocs pour interdire les matches à cheval.
  let texte = ''
  const positions: number[] = []
  doc.descendants((node, position) => {
    if (node.isBlock && texte.length > 0) {
      texte += '\n'
      positions.push(NaN)
    }
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) positions.push(position + i)
      texte += node.text.toLowerCase()
    }
  })
  const occurrences: OccurrenceRecherche[] = []
  let j = texte.indexOf(q)
  while (j !== -1) {
    const segment = positions.slice(j, j + q.length)
    if (!segment.some(Number.isNaN)) {
      occurrences.push({ de: segment[0], a: segment[segment.length - 1] + 1 })
    }
    j = texte.indexOf(q, j + 1)
  }
  return occurrences
}

/**
 * Surlignage des occurrences de la recherche/remplacement (Ctrl+F). État =
 * liste des plages + index courant, poussés par setMeta par le composable ;
 * le plugin ne fait que décorer (`.recherche-hit`, et `.recherche-hit-active`
 * pour l'occurrence courante), sans jamais toucher au modèle. Les plages sont
 * REMAPPÉES sur les éditions pour suivre le texte qui bouge.
 */
export function pluginRecherche(): Plugin<RechercheEtat> {
  return new Plugin<RechercheEtat>({
    key: recherchePluginKey,
    state: {
      init: () => ({ plages: [], actif: -1 }),
      apply(tr, etat) {
        const meta = tr.getMeta(recherchePluginKey)
        if (meta !== undefined) return meta as RechercheEtat
        if (etat.plages.length === 0) return etat
        return {
          actif: etat.actif,
          plages: etat.plages.map((p) => ({ de: tr.mapping.map(p.de, -1), a: tr.mapping.map(p.a, -1) })),
        }
      },
    },
    props: {
      decorations(state) {
        const { plages, actif } = this.getState(state) ?? { plages: [], actif: -1 }
        if (plages.length === 0) return DecorationSet.empty
        return DecorationSet.create(
          state.doc,
          plages.map((p, i) =>
            Decoration.inline(p.de, p.a, {
              class: i === actif ? 'recherche-hit-active' : 'recherche-hit',
            }),
          ),
        )
      },
    },
  })
}
