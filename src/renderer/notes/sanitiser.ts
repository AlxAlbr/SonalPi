/**
 * Sanitisation du `corps` d'une note : un contenteditable produit de l'HTML
 * arbitraire (frappe, collage), on ne conserve QUE le texte et les balises
 * `<mark>` (passages importants). Le reste est aplati en texte : on ne perd
 * jamais le contenu tapé, mais tout formatage parasite est supprimé. Le
 * résultat est sûr pour un `v-html` (texte échappé, seules `<mark>` survivent).
 */

/** Attribut d'un `<mark>` listant les ids des commentaires liés au passage
 *  important (séparés par des espaces). Un lien est une référence pendante :
 *  si le commentaire disparaît, l'id reste porté jusqu'à déliaison manuelle. */
export const ATTR_LIENS_NOTE = 'data-liens'

/** Un id de commentaire liaisible : court, alphanumérique (format des ids
 *  d'annotation). Tout attribut dont une partie ne passe pas ce filtre est
 *  rejeté : jamais de valeur étrangère injectée dans le `v-html`. */
const MOTIF_ID_ANNOTATION = /^[a-zA-Z0-9_-]{1,64}$/

/** Lit les ids de commentaires liés à un passage, validés et dédupliqués. */
export function lireLiensNote(mark: Element): string[] {
  const brut = mark.getAttribute(ATTR_LIENS_NOTE)
  if (!brut) return []
  return [...new Set(brut.split(/\s+/).filter((id) => MOTIF_ID_ANNOTATION.test(id)))]
}

/** Liens fiables d'un `<mark>` lu hors DOM (null = pas d'attribut à reproduire). */
function liensSerialisables(valeur: string | null): string | null {
  if (valeur === null) return null
  const ids = [...new Set(valeur.split(/\s+/).filter((id) => MOTIF_ID_ANNOTATION.test(id)))]
  return ids.length > 0 ? ids.join(' ') : null
}

/** Échappe le texte brut pour inclusion sûre dans de l'HTML. */
export function echapperTexte(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Aplatit un sous-arbre DOM en HTML sanitisé : texte échappé + `<mark>`.
 *  Tout autre élément devient son contenu texte (perte du tag, pas du texte). */
function serialiser(noeud: Node, out: string[]): void {
  for (const enfant of Array.from(noeud.childNodes)) {
    if (enfant.nodeType === 3 /* Node.TEXT_NODE */) {
      out.push(echapperTexte(enfant.textContent ?? ''))
    } else if (enfant.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = enfant as Element
      const estMark = el.tagName.toLowerCase() === 'mark'
      if (estMark) {
        // Seul `data-liens` survit, validé ; tout autre attribut est jeté.
        const liens = liensSerialisables(el.getAttribute(ATTR_LIENS_NOTE))
        out.push(liens ? `<mark ${ATTR_LIENS_NOTE}="${echapperTexte(liens)}">` : '<mark>')
        serialiser(el, out)
        out.push('</mark>')
      } else {
        // Élément non autorisé : on garde son contenu, on jette le tag.
        serialiser(el, out)
        // Un <br> ou un <div> de contenteditable marque une coupure de ligne
        // → on rétablit un saut de ligne pour ne pas coller les blocs.
        if (el.tagName.toLowerCase() === 'br' || /^div$/i.test(el.tagName)) {
          out.push('\n')
        }
      }
    }
    // Les commentaires et noeuds de traitement sont ignorés.
  }
}

/** Sanitise le HTML d'un corps de note (sortie de contenteditable). */
export function sanitiserCorpsNote(html: string, doc: Document): string {
  if (!html) return ''
  const conteneur = doc.createElement('div')
  conteneur.innerHTML = html
  const out: string[] = []
  serialiser(conteneur, out)
  // Nettoyage des `<mark>` vides (rien d'utile dedans) pour éviter du bruit.
  return out.join('').replace(/<mark[^>]*>\s*<\/mark>/g, '')
}

/** Convertit un corps de note sanitisé en texte brut pour la vue « expand » :
 *  les balises `<mark>` encadrent toujours le passage important, mais ici on
 *  veut une représentation lisible en plain text — on garde les marqueurs
 *  ▸…◂ pour signaler le surlignage. */
export function corpsNoteEnTexte(html: string, doc: Document): string {
  if (!html) return ''
  const conteneur = doc.createElement('div')
  conteneur.innerHTML = html
  const out: string[] = []
  function parcourir(n: Node) {
    for (const e of Array.from(n.childNodes)) {
      if (e.nodeType === 3) out.push(e.textContent ?? '')
      else if (e.nodeType === 1) {
        const el = e as Element
        if (el.tagName.toLowerCase() === 'mark') {
          out.push('▸')
          parcourir(el)
          out.push('◂')
        } else {
          parcourir(el)
          if (/^div$/i.test(el.tagName)) out.push('\n')
        }
      }
    }
  }
  parcourir(conteneur)
  return out.join('')
}
