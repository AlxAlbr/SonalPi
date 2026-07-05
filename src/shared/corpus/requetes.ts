import type { CibleValeur, EntretienFichier, MatriceCorpus } from '../format'

/**
 * Requêtes de l'agrégat Corpus — MODELE_OBJET2 §10 (« inventaires = requêtes ») :
 * CALCULÉES à partir d'une liste d'entretiens, JAMAIS stockées ni mises en cache.
 * L'orchestration (le store) fournit la liste lue sur disque ; le CALCUL est PUR.
 */

/** Nombre d'annotations (tous entretiens) qui référencent un code de thème. */
export function compterUsagesCode(entretiens: EntretienFichier[], code: string): number {
  let n = 0
  for (const e of entretiens) for (const a of e.annotations) if (a.type === 'codage' && a.code === code) n++
  return n
}

/** Usages de TOUS les codes en un seul balayage (affichage du panneau). */
export function usagesParCode(entretiens: EntretienFichier[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entretiens)
    for (const a of e.annotations) if (a.type === 'codage' && a.code) out[a.code] = (out[a.code] ?? 0) + 1
  return out
}

/** Usages d'une variable = nombre de valeurs (entretiens + locuteurs) qui la portent. */
export function compterUsagesVariable(entretiens: EntretienFichier[], idVar: string): number {
  let n = 0
  for (const e of entretiens) {
    if (e.meta?.valeursGen?.[idVar] != null) n++
    for (const l of e.locuteurs) if (l.valeursLoc?.[idVar] != null) n++
  }
  return n
}

/** Usages d'une modalité = nombre de valeurs égales à `idMod` pour `idVar`. */
export function compterUsagesModalite(entretiens: EntretienFichier[], idVar: string, idMod: string): number {
  let n = 0
  for (const e of entretiens) {
    if (e.meta?.valeursGen?.[idVar] === idMod) n++
    for (const l of e.locuteurs) if (l.valeursLoc?.[idVar] === idMod) n++
  }
  return n
}

/** Pose (ou efface, si `idMod` vide) une valeur EAV chez son propriétaire dans UN
 *  entretien — édition depuis la table de données (D-S11). Transform PUR ; le store
 *  fait l'I/O. La valeur reste chez son propriétaire (`valeursGen` / `valeursLoc`),
 *  aucun nouveau lieu de stockage. Locuteur cible absent → no-op. */
export function poserValeur(data: EntretienFichier, cible: CibleValeur, idVar: string, idMod: string): void {
  const valeurs =
    cible.type === 'entretien'
      ? data.meta.valeursGen
      : data.locuteurs.find((l) => l.index === cible.index)?.valeursLoc
  if (!valeurs) return
  if (idMod) valeurs[idVar] = idMod
  else delete valeurs[idVar]
}

/** Une entrée d'entretien pour la matrice (id + titre depuis le membership + data). */
export interface EntreeMatrice {
  id: string
  titre: string
  data: EntretienFichier
}

/** MATRICE corpus = REQUÊTE : valeurs lues chez leurs propriétaires (ligne
 *  entretien via valeursGen + lignes locuteurs via valeursLoc). Jamais un cache. */
export function matriceCorpus(entrees: EntreeMatrice[]): MatriceCorpus {
  return entrees.map(({ id, titre, data }) => ({
    entretienId: id,
    titre,
    valeursGen: data.meta?.valeursGen ?? {},
    locuteurs: data.locuteurs.map((l) => ({ index: l.index, nom: l.nom, valeursLoc: l.valeursLoc ?? {} })),
  }))
}
