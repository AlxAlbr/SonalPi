import { Extension } from '@tiptap/core'

/**
 *  Chaque paragraphe porte l'index local de sa participation dans `loc`.
 *  Les temps restent dans `entretien.ancres` et le marquage dans les décorations.
 *  La scission d'un paragraphe conserve sa participation.
 */
export const BlocAttributs = Extension.create({
  name: 'blocAttributs',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          loc: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-loc')
              return v == null ? null : Number(v)
            },
            renderHTML: (attrs) =>
              attrs.loc == null ? {} : { 'data-loc': String(attrs.loc) },
          },
        },
      },
    ]
  },
})
