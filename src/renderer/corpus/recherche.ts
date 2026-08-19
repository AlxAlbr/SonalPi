import { Node, Schema } from '@tiptap/pm/model'

/**
 * Recherche de texte dans le CORPUS (onglet « Recherche » de la vue Corpus),
 * parité SonalPi `rechercherDansCorpus`. Fonctions PURES (aucun DOM ni disque).
 *
 * Chaque entretien est stocké comme un document ProseMirror (`EntretienFichier.
 * corpsTexte`, schéma gelé `doc › paragraph{loc} › text`). On le parse avec un
 * schéma MINIMAL miroir exact, on parcourt les paragraphes, on cherche la
 * requête (insensible à la casse), et on produit pour chaque occurrence un
 * contexte ±15 mots (le match en gras) et la POSITION ProseMirror du début du
 * match — position directement navigable via `ouvrirAuSegment`/`allerAuTexte`.
 */

export interface OccurenceRecherche {
  /** Position ProseMirror du début du match (navigable via allerAuTexte). */
  pos: number
  /** Position du match sur l'Axe TEXTE, en % [0..100] de la longueur totale
   *  (frontières de bloc = 0) — même convention que `resumeThematique`, donc
   *  les marqueurs s'alignent sur le calque thématique des cartes. */
  pourcent: number
  /** Contexte AVANT le match (≤ CONTEXTE_MOTS mots). */
  pre: string
  /** Texte du match (les mots couverts). */
  match: string
  /** Contexte APRÈS le match (≤ CONTEXTE_MOTS mots). */
  post: string
}

export interface ResultatRecherche {
  id: string
  titre: string
  occurrences: OccurenceRecherche[]
}

/** Options de recherche. `motEntier` : le match doit être borné par des
 *  caractères NON-mots des deux côtés — « le » trouve « le », pas « parle ». */
export interface OptionsRecherche {
  motEntier?: boolean
}

/** Largeur du contexte autour d'un match — parité SonalPi. */
export const CONTEXTE_MOTS = 15

// Schéma MINIMAL miroir exact de l'éditeur (doc › paragraph{loc} › text).
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', attrs: { loc: { default: null } } },
    text: { group: 'inline' },
  },
})

interface Mot {
  mot: string
  debut: number
  fin: number
}

/** Un caractère « de mot » — mêmes frontières que le snap-to-mot de l'éditeur. */
const MOT_CHAR = /[\p{L}\p{N}_-]/u

/** Découpe un texte en mots avec leurs bornes (offset) dans le texte brut. */
function decouperMots(texte: string): Mot[] {
  const mots: Mot[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texte))) {
    mots.push({ mot: m[0], debut: m.index, fin: m.index + m[0].length })
  }
  return mots
}

/**
 * Cherche `requete` dans un corps de texte ProseMirror. Renvoie les occurrences
 * (contexte + position PM), l'ordre du document. Vide si le doc est illisible.
 */
export function rechercherDansCorpsTexte(
  corpsTexte: unknown,
  requete: string,
  opts: OptionsRecherche = {},
): OccurenceRecherche[] {
  const q = requete.trim()
  if (!q) return []
  const qLow = q.toLowerCase()

  let doc: Node
  try {
    doc = Node.fromJSON(schema, corpsTexte as never)
  } catch {
    return []
  }

  // Axe caractères : longueurs par paragraphe, total et cumulés. Convention
  // IDENTIQUE à resumeThematique (frontières de bloc pèsent 0) — les marqueurs
  // se calent exactement sur le même axe que le résumé thématique des cartes.
  const longueurs: number[] = []
  for (let k = 0; k < doc.childCount; k++) longueurs.push(doc.child(k).textContent.length)
  const total = longueurs.reduce((s, l) => s + l, 0)
  if (total === 0) return []
  const cumuls: number[] = []
  {
    let c = 0
    for (const l of longueurs) {
      cumuls.push(c)
      c += l
    }
  }

  // Frontières de mot requises → le 1ᵉʳ et le dernier caractère du match ne
  // doivent pas être accolés à un caractère de mot (début/fin de paragraphe ok).
  const motEntier = !!opts.motEntier
  const dansMot = (c: string | undefined) => !!c && MOT_CHAR.test(c)

  const occ: OccurenceRecherche[] = []
  // Position PM du 1er caractère du paragraphe k : le 1er vaut 1, chaque
  // paragraphe pèse ensuite 2 + len (open + contenu + close).
  let blockStart = 1
  for (let k = 0; k < doc.childCount; k++) {
    const texte = doc.child(k).textContent
    const mots = decouperMots(texte)

    let idx = 0
    for (;;) {
      const i = texte.toLowerCase().indexOf(qLow, idx)
      if (i === -1) break
      const fin = i + q.length
      if (motEntier && (dansMot(texte[i - 1]) || dansMot(texte[fin]))) {
        idx = i + 1
        continue
      }
      // Les mots couverts par le match (le tout premier mot dont la fin dépasse i).
      const iMot = mots.findIndex((m) => m.fin > i)
      if (iMot !== -1) {
        // Premier mot commençant à/après la fin du match (borne exclusive).
        const iMotFin = mots.findIndex((m) => m.debut >= fin)
        const nbMots = iMotFin === -1 ? mots.length - iMot : iMotFin - iMot
        const couverts = mots.slice(iMot, iMotFin === -1 ? mots.length : iMotFin)
        const pre = mots.slice(Math.max(0, iMot - CONTEXTE_MOTS), iMot).map((m) => m.mot).join(' ')
        const post = (iMotFin === -1 ? [] : mots.slice(iMotFin, iMotFin + CONTEXTE_MOTS))
          .map((m) => m.mot)
          .join(' ')
        occ.push({
          pos: blockStart + i,
          pourcent: ((cumuls[k] + i) / total) * 100,
          pre,
          match: couverts.map((m) => m.mot).join(' '),
          post,
        })
      }
      idx = Math.max(fin, i + 1)
    }
    blockStart += 2 + longueurs[k]
  }
  return occ
}
