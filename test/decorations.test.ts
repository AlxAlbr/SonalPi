// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import type { DecorationSet } from 'prosemirror-view'
import { pluginDecorations, decorationsPluginKey } from '../src/renderer/editor/decorations'
import type { Entretien } from '../src/shared/entretien/entretien'
import type { Annotation } from '../src/shared/entretien/annotation'

/**
 * Soulignés multi-codages : barres empilées avec écart, hauteur RÉSERVÉE au
 * niveau du paragraphe (un sous-passage codé une fois de plus ne décale pas
 * les barres de ses voisins), arrêt final transparent du dégradé.
 */

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: { inline: true },
  },
})

function doc() {
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('abcdefgh')]),
  ])
}

function etat(
  annotations: Annotation[],
  opts: { nomDe?: (code: string) => string; estCodeActif?: (code: string) => boolean } = {},
): EditorState {
  const entretien = { annotations, ancres: [] } as unknown as Entretien
  return EditorState.create({
    doc: doc(),
    plugins: [
      pluginDecorations(
        entretien,
        (code) => `couleur(${code})`,
        undefined,
        opts.estCodeActif,
        opts.nomDe,
      ),
    ],
  })
}

type Deco = { type?: { attrs?: Record<string, unknown> } }

function attributs(state: EditorState, attr: string): string[] {
  const decos = decorationsPluginKey.getState(state) as DecorationSet
  return (decos.find() as Deco[])
    .map((d) => d.type?.attrs?.[attr])
    .filter((v): v is string => typeof v === 'string')
}

const styles = (state: EditorState) => attributs(state, 'style')
const titres = (state: EditorState) => attributs(state, 'title')

function codage(id: string, from: number, to: number): Annotation {
  return { id, type: 'codage', from, to, auteur: 'x', code: id } as Annotation
}

describe('décorations — soulignés multi-codages', () => {
  test('un seul codage → box-shadow simple, sans padding ajouté', () => {
    const s = styles(etat([codage('a', 1, 5)]))
    expect(s).toEqual(['box-shadow:inset 0 -2px 0 couleur(a)'])
  })

  test('deux codages même plage → dégradé 2 barres + arrêt final transparent', () => {
    const s = styles(etat([codage('a', 1, 5), codage('b', 1, 5)]))
    expect(s).toEqual([
      'background-image:linear-gradient(to top, couleur(a) 0px 2px,transparent 2px 3px,' +
        'couleur(b) 3px 5px,transparent 5px);padding-bottom:7px',
    ])
  })

  test('sous-passage codé une fois de plus → hauteur uniforme sur le paragraphe', () => {
    // A et B sur [1,7], C en sous-passage [3,5] : trois segments, TOUS avec le
    // padding du max du paragraphe (3 barres → 10px), pour des barres alignées.
    const s = styles(etat([codage('a', 1, 7), codage('b', 1, 7), codage('c', 3, 5)]))
    expect(s).toHaveLength(3)
    for (const style of s) {
      expect(style).toContain('padding-bottom:10px')
      expect(style).toContain('transparent') // jamais de couleur qui déborde en surlignage
    }
    // Segment du sous-passage : trois barres ; les deux barres y gardent leur
    // profondeur d'origine (0-2 et 3-5), la troisième s'empile en dessous.
    const milieu = s[1]
    expect(milieu).toContain('couleur(a) 0px 2px')
    expect(milieu).toContain('couleur(b) 3px 5px')
    expect(milieu).toContain('couleur(c) 6px 8px')
    // Segments voisins : deux barres aux MÊMES profondeurs que au milieu.
    expect(s[0]).toContain('couleur(a) 0px 2px')
    expect(s[0]).toContain('couleur(b) 3px 5px')
    expect(s[2]).toContain('couleur(b) 3px 5px')
  })

  test('infobulle du passage codé : nom du thème, pas l\'id brut', () => {
    const sansNom = titres(etat([codage('cat-3', 1, 5)]))
    expect(sansNom).toEqual(['cat-3']) // pas de résolveur → repli sur l'id

    const avecNom = titres(
      etat([codage('cat-3', 1, 5)], { nomDe: (code) => (code === 'cat-3' ? 'Motivation' : code) }),
    )
    expect(avecNom).toEqual(['Motivation'])
  })
})

describe('décorations — thème inactif', () => {
  const inactifs = (codes: Set<string>) => (code: string) => !codes.has(code)

  test('un codage d\'un thème inactif n\'émet aucun marquage', () => {
    // 'a' inactif → aucun souligné sur sa plage.
    const s = styles(etat([codage('a', 1, 5)], { estCodeActif: inactifs(new Set(['a'])) }))
    expect(s).toEqual([])
  })

  test('un thème actif reste affiché quand un autre est inactif', () => {
    // 'a' inactif, 'b' actif : seule la barre de b reste (box-shadow simple).
    const s = styles(etat([codage('a', 1, 5), codage('b', 1, 7)], { estCodeActif: inactifs(new Set(['a'])) }))
    expect(s).toContain('box-shadow:inset 0 -2px 0 couleur(b)')
    // Le souligné de a n'apparaît nulle part (ni dégradé, ni box-shadow).
    expect(s.join(' ')).not.toContain('couleur(a)')
  })

  test('chevauchement : le thème inactif ne compte pas pour la hauteur des barres', () => {
    // b actif seul sur toute la plage → un seul souligné, pas de dégradé multi-barres.
    const s = styles(etat([codage('a', 1, 7), codage('b', 1, 7)], { estCodeActif: inactifs(new Set(['a'])) }))
    expect(s).toEqual(['box-shadow:inset 0 -2px 0 couleur(b)'])
  })

  test('le comptage et le titre ignorent le thème inactif', () => {
    const s = etat([codage('a', 1, 5), codage('b', 1, 7)], { estCodeActif: inactifs(new Set(['a'])) })
    // b seul est compté.
    expect(attributs(s, 'data-annot-count')).toEqual(['1'])
  })
})
