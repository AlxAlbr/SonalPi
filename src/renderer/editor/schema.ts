import { Extension } from '@tiptap/core'

/**
 * Contrat de schéma D2 (DEMARRAGE) — GELÉ.
 *
 * Le « bloc » de MODELE_OBJET2 §4 = le paragraphe de ProseMirror, augmenté de
 * trois attributs :
 *   - `loc` : id du locuteur (index par entretien) — attribut de bloc, éditable ;
 *   - `deb`/`fin` : timecodes, INERTES au set minimum (aucune UI, aucune
 *     contrainte) mais portés pour survivre au round-trip .sonal et préparer
 *     l'audio.
 *
 * On n'ajoute AUCUN mark utilisateur (gras/italique) : tout le visuel du
 * marquage vient des décorations (calque), jamais du texte.
 *
 * Règle de scission (Entrée) : ProseMirror copie les attributs du bloc courant
 * dans le nouveau bloc → `loc` est hérité gratuitement. `deb`/`fin` le sont
 * aussi ; leur remise à null au split est un raffinement différé (POC audio).
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
          deb: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-deb')
              return v == null ? null : Number(v)
            },
            renderHTML: (attrs) =>
              attrs.deb == null ? {} : { 'data-deb': String(attrs.deb) },
          },
          fin: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-fin')
              return v == null ? null : Number(v)
            },
            renderHTML: (attrs) =>
              attrs.fin == null ? {} : { 'data-fin': String(attrs.fin) },
          },
        },
      },
    ]
  },
})
