/**
 * Multi-pseudo ≤2 — cœur PUR : aucune I/O, aucune dépendance UI.
 *
 * Une `RegleAnon` peut porter DEUX pseudos pour une même entité (parité V1
 * SonalPi : `remplacement` + `remplacementAlt`, capé à 2 — le round-trip `.sonal`
 * ne sait pas sérialiser plus). On reste sur `string[]` dans le modèle, bridée
 * à 2, et on définit ici la normalisation entrée ↔ affichage.
 */

/** Séparateur d'affichage / de saisie libre entre deux pseudos. */
export const SEP_PSEUDOS = ' / '

/** Cap de pseudos par règle (parité V1 remplacement/remplacementAlt). */
export const MAX_PSEUDOS = 2

/**
 * Scinde une saisie libre « Claire / Rebecca » (séparateur `/` ± espaces) en
 * pseudos normalisés : trim, sans doublon (insensible à la casse), capés à 2.
 * Une saisie sans `/` → liste d'un seul pseudo. Renvoie toujours ≥ 1 élément
 * si `saisie` n'est pas vide, sinon [].
 */
export function scinderPseudos(saisie: string): string[] {
  const brut = saisie.trim()
  if (!brut) return []
  const morceaux = brut
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p !== '')
  const out: string[] = []
  for (const p of morceaux) {
    if (out.length >= MAX_PSEUDOS) break
    if (out.some((x) => x.toLowerCase() === p.toLowerCase())) continue
    out.push(p)
  }
  return out
}

/** Affiche la liste des pseudos d'une règle : « Claire / Rebecca », ou vide. */
export function joindrePseudos(pseudos: string[]): string {
  return pseudos.join(SEP_PSEUDOS)
}

/** Une liste de pseudos est-elle multi (> 1) ? */
export function estMultiPseudo(pseudos: string[]): boolean {
  return pseudos.length > 1
}

/**
 * Fusionne un pseudo candidat dans une liste existante (retourne un NOUVEAU
 * tableau) : si déjà présent (insensible à la casse) → inchangé ; sinon ajouté
 * si la liste est sous le cap (≤2). C'est le « Garder les deux » de la V1.
 */
export function ajouterPseudo(pseudos: string[], pseudo: string): string[] {
  const p = pseudo.trim()
  if (!p) return pseudos
  if (pseudos.some((x) => x.toLowerCase() === p.toLowerCase())) return pseudos
  if (pseudos.length >= MAX_PSEUDOS) return pseudos
  return [...pseudos, p]
}
