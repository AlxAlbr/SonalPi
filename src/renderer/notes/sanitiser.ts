/**
 * Sanitisation du `corps` d'une note : un contenteditable produit de l'HTML
 * arbitraire (frappe, collage), on ne conserve QUE le texte et deux balises de
 * passage : `<mark>` (passage important, rendu en gras) et `<em>` (passage lié
 * à un commentaire, rendu en italique). Le reste est aplati en texte : on ne
 * perd jamais le contenu tapé, mais tout formatage parasite est supprimé. Le
 * résultat est sûr pour un `v-html` (texte échappé, seules ces balises
 * survivent).
 */

/** Balises de passage autorisées dans un corps de note. */
const BALISES_PASSAGE = new Set(['mark', 'em'])

/** Attribut d'un passage (`<mark>` ou `<em>`) listant les ids des commentaires
 *  qui lui sont liés (séparés par des espaces). Un lien est une référence
 *  pendante : si le commentaire disparaît, l'id reste porté jusqu'à déliaison
 *  manuelle. */
export const ATTR_LIENS_NOTE = 'data-liens'

/** Un id de commentaire liaisible : court, alphanumérique (format des ids
 *  d'annotation). Tout attribut dont une partie ne passe pas ce filtre est
 *  rejeté : jamais de valeur étrangère injectée dans le `v-html`. */
const MOTIF_ID_ANNOTATION = /^[a-zA-Z0-9_-]{1,64}$/

/** Lit les ids de commentaires liés à un passage, validés et dédupliqués. */
export function lireLiensNote(passage: Element): string[] {
  const brut = passage.getAttribute(ATTR_LIENS_NOTE)
  if (!brut) return []
  return [...new Set(brut.split(/\s+/).filter((id) => MOTIF_ID_ANNOTATION.test(id)))]
}

/** Liens fiables d'un passage lu hors DOM (null = pas d'attribut à reproduire). */
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

/** Aplatit un sous-arbre DOM en HTML sanitisé : texte échappé + passages
 *  (`<mark>`, `<em>`). Tout autre élément devient son contenu texte (perte du
 *  tag, pas du texte). */
function serialiser(noeud: Node, out: string[]): void {
  for (const enfant of Array.from(noeud.childNodes)) {
    if (enfant.nodeType === 3 /* Node.TEXT_NODE */) {
      out.push(echapperTexte(enfant.textContent ?? ''))
    } else if (enfant.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = enfant as Element
      // Références décoratives (spans insérés dans la zone d'édition) : on
      // les JETTE entièrement — jamais de texte de référence dans le corps.
      if (el.classList.contains(CLASSE_REF_NOTE)) continue
      const balise = el.tagName.toLowerCase()
      if (BALISES_PASSAGE.has(balise)) {
        // Seul `data-liens` survit, validé ; tout autre attribut est jeté.
        const liens = liensSerialisables(el.getAttribute(ATTR_LIENS_NOTE))
        out.push(liens ? `<${balise} ${ATTR_LIENS_NOTE}="${echapperTexte(liens)}">` : `<${balise}>`)
        serialiser(el, out)
        out.push(`</${balise}>`)
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
  // Nettoyage des passages vides (rien d'utile dedans) pour éviter du bruit.
  return out.join('').replace(/<(mark|em)[^>]*>\s*<\/\1>/g, '')
}

/** Renvoie le libellé d'une référence de commentaire tronquée, ex.
 *  « alice : début du commentaire… ». */
export function libelleRefCommentaire(auteur: string, texte: string): string {
  const qui = auteur || 'sans auteur'
  const debut = texte.length > 40 ? `${texte.slice(0, 40)}…` : texte
  return `${qui} : ${debut}`
}

/** Classe des spans de référence `[auteur : début…]` : présents en affichage
 *  (cartes) ET dans la zone d'édition (non éditables), toujours jetés à la
 *  sauvegarde. */
export const CLASSE_REF_NOTE = 'ref-note-commentaire'

/** Retire les références dont le lien n'existe plus (passage délié ou
 *  supprimé pendant la frappe). Ne touche à rien sinon : appelable à chaque
 *  saisie sans casser la position du curseur. */
export function pruneRefsCommentaires(conteneur: Element): void {
  for (const ref of Array.from(conteneur.querySelectorAll(`.${CLASSE_REF_NOTE}`))) {
    const id = ref.getAttribute('data-ref')
    const porte = id !== null && Array.from(
      conteneur.querySelectorAll(`[${ATTR_LIENS_NOTE}]`),
    ).some((p) => lireLiensNote(p).includes(id))
    if (!porte) ref.remove()
  }
}

/** Décore un conteneur VIVANT (copie d'affichage ou contenteditable de la
 *  modale) : reconstruit toutes les références après leur passage lié —
 *  `[alice : début…]`, avec `data-ref` = id du commentaire. Les ids non
 *  résolus (commentaire supprimé) sont ignorés. Les spans sont construits au
 *  DOM (textContent) et posés contenteditable=false dans l'éditeur. */
export function decoreRefsCommentaires(
  conteneur: HTMLElement,
  doc: Document,
  commentaireDe: (id: string) => { auteur: string; texte: string } | null,
): void {
  for (const ref of Array.from(conteneur.querySelectorAll(`.${CLASSE_REF_NOTE}`))) ref.remove()
  for (const passage of Array.from(conteneur.querySelectorAll(`[${ATTR_LIENS_NOTE}]`))) {
    let ancre: Element = passage
    for (const id of lireLiensNote(passage)) {
      const c = commentaireDe(id)
      if (!c) continue
      const ref = doc.createElement('span')
      ref.className = CLASSE_REF_NOTE
      ref.setAttribute('data-ref', id)
      ref.setAttribute('contenteditable', 'false')
      ref.textContent = `[${libelleRefCommentaire(c.auteur, c.texte)}]`
      // Une espace entre le passage et sa référence.
      ancre.after(doc.createTextNode(' '), ref)
      ancre = ref
    }
  }
}

/** Décore un corps de note sanitisé pour l'affichage en carte (HTML sortant,
 *  sûr pour un `v-html`). */
export function corpsAvecRefsCommentaires(
  html: string,
  doc: Document,
  commentaireDe: (id: string) => { auteur: string; texte: string } | null,
): string {
  if (!html || !html.includes(ATTR_LIENS_NOTE)) return html
  const conteneur = doc.createElement('div')
  conteneur.innerHTML = html
  decoreRefsCommentaires(conteneur, doc, commentaireDe)
  return conteneur.innerHTML
}

/** Surligne les occurrences de la requête dans le TEXTE d'un HTML sanitisé
 *  (insensible à la casse) : chaque occurrence est enveloppée d'un
 *  `<span class="surbrillance-note">`, construit au DOM — jamais de
 *  correspondance injectée dans une balise ni un attribut. Renvoie le HTML
 *  inchangé si la requête est vide. */
export function surlignerHtml(html: string, requete: string, doc: Document): string {
  const q = requete.trim().toLowerCase()
  if (!q) return html
  const conteneur = doc.createElement('div')
  conteneur.innerHTML = html
  const parcourir = (noeud: Node) => {
    for (const enfant of Array.from(noeud.childNodes)) {
      if (enfant.nodeType !== 1 /* ELEMENT_NODE */) {
        const texte = enfant.textContent ?? ''
        const bas = texte.toLowerCase()
        if (bas.indexOf(q) < 0) continue
        const frag = doc.createDocumentFragment()
        let curseur = 0
        for (let i = bas.indexOf(q); i >= 0; i = bas.indexOf(q, curseur)) {
          if (i > curseur) frag.appendChild(doc.createTextNode(texte.slice(curseur, i)))
          const hit = doc.createElement('span')
          hit.className = 'surbrillance-note'
          hit.textContent = texte.slice(i, i + q.length)
          frag.appendChild(hit)
          curseur = i + q.length
        }
        if (curseur < texte.length) frag.appendChild(doc.createTextNode(texte.slice(curseur)))
        enfant.parentNode?.replaceChild(frag, enfant)
      } else {
        parcourir(enfant)
      }
    }
  }
  parcourir(conteneur)
  return conteneur.innerHTML
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
