import { charVersPM } from './positions'
import type { Ancre } from './audio'

/**
 *  Migration formatVersion 1 → 2 du fichier entretien : les timecodes quittent
 *  les attributs de bloc (`deb`/`fin` par paragraphe) pour devenir des ANCRES
 *  positionnées dans le texte (`ancres: {pos, t}[]`). Migration EXPLICITE de
 *  format : le store l'applique à la lecture d'un fichier formatVersion 1 et
 *  réécrit aussitôt — jamais de lecture partielle d'une version inconnue.
 *
 *  Mécanique : `deb` → ancre au début du texte du bloc, `fin` → ancre à sa fin ;
 *  les attrs sont réduits à `{ loc }`. Un `deb`/`fin` null (fragment interne
 *  d'une scission, texte sans timecodes) ne produit rien — seules les bornes
 *  MESURÉES survivent.
 */

interface NoeudFormatV1 {
  type?: string
  attrs?: { loc?: number | null; deb?: number | null; fin?: number | null }
  content?: Array<{ text?: string }>
}

export function migrerEntretienFormatV1(donnees: Record<string, unknown>): Record<string, unknown> {
  const doc = donnees.corpsTexte as { content?: NoeudFormatV1[] } | undefined
  const blocs = doc?.content ?? []
  const longueurs = blocs.map((b) => (b.content ?? []).reduce((s, n) => s + (n.text?.length ?? 0), 0))

  const ancres: Ancre[] = []
  blocs.forEach((b, k) => {
    if (b.type !== 'paragraph') return
    const deb = b.attrs?.deb
    const fin = b.attrs?.fin
    if (deb != null) ancres.push({ pos: charVersPM(longueurs, k, 0), t: deb })
    if (fin != null) ancres.push({ pos: charVersPM(longueurs, k, longueurs[k]), t: fin })
  })

  const contenu = blocs.map((b) =>
    b.type === 'paragraph' ? { ...b, attrs: { loc: b.attrs?.loc ?? null } } : b,
  )

  return {
    ...donnees,
    formatVersion: 2,
    corpsTexte: { ...(doc ?? {}), content: contenu },
    ancres,
  }
}
