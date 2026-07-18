import { Extension } from '@tiptap/core'

/**
 * Contrat de schéma D2 (DEMARRAGE) — GELÉ, révisé S7 (D-S14).
 *
 * Le « bloc » de MODELE_OBJET2 §4 = le paragraphe de ProseMirror, augmenté d'un
 * seul attribut :
 *   - `loc` : id du locuteur (index par entretien) — attribut de bloc, éditable.
 *
 * Les timecodes ne sont PLUS des attrs de bloc : le temps est porté par les
 * ANCRES du modèle (`entretien.ancres`, positions remappées comme les
 * annotations — D-S14). Les fichiers v1 sont migrés au store.
 *
 * On n'ajoute AUCUN mark utilisateur (gras/italique) : tout le visuel du
 * marquage vient des décorations (calque), jamais du texte.
 *
 * Règle de scission (Entrée) : ProseMirror copie les attributs du bloc courant
 * dans le nouveau bloc → `loc` est hérité gratuitement.
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
