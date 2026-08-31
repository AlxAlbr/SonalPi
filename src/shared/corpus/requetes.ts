import type { CibleValeur, EntretienFichier, MatriceCorpus, SegmentThematique } from '../format'
import { estOrpheline } from '../entretien/annotation'
import { charVersPM, pmVersTranches } from '../entretien/positions'

/**
 *  Requêtes de l'agrégat Corpus (« inventaires = requêtes ») :
 *  CALCULÉES à partir d'une liste d'entretiens, JAMAIS stockées ni mises en cache.
 *  L'orchestration (le store) fournit la liste lue sur disque ; le CALCUL est PUR.
 */

/** Nombre d'annotations (tous entretiens) qui référencent un code de thème. */
export function compterUsagesCategorie(entretiens: EntretienFichier[], code: string): number {
  let n = 0
  for (const e of entretiens) for (const a of e.annotations) if (a.type === 'codage' && a.code === code) n++
  return n
}

/** Usages de TOUS les codes en un seul balayage (affichage du panneau). */
export function usagesParCategorie(entretiens: EntretienFichier[]): Record<string, number> {
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

/** Pose (ou efface, si `idMod` vide) une valeur EAV chez son propriétaire dans UN entretien —
 *  édition ciblée depuis la table de données. Transform PUR ; le store fait l'I/O.
 *  La valeur reste chez son propriétaire (`valeursGen` / `valeursLoc`),
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

/** Longueurs de texte des blocs d'un doc PM (JSON canonique du modèle). */
function longueursDoc(corpsTexte: unknown): number[] {
  const doc = corpsTexte as { content?: Array<{ content?: Array<{ text?: string }> }> }
  return (doc?.content ?? []).map((p) => (p.content ?? []).map((n) => n.text ?? '').join('').length)
}

/**
 *  RÉSUMÉ THÉMATIQUE d'un entretien — parité SonalPi1 (`resumeGraphique`) : les
 *  codages projetés sur l'axe du TEXTE (coordonnée caractère cumulée, les
 *  frontières de blocs pèsent 0), en % de la longueur totale. Balayage des bornes
 *  en segments élémentaires (comme les décorations de l'éditeur) : un segment
 *  porte TOUS les codes qui le couvrent (chevauchements composés), les segments
 *  adjacents de mêmes codes fusionnent. Orphelines exclues. REQUÊTE pure.
 */
export function resumeThematique(
  data: Pick<EntretienFichier, 'corpsTexte' | 'annotations'>,
): SegmentThematique[] {
  const longueurs = longueursDoc(data.corpsTexte)
  const total = longueurs.reduce((s, l) => s + l, 0)
  if (total === 0) return []
  const cumuls: number[] = []
  let c = 0
  for (const l of longueurs) {
    cumuls.push(c)
    c += l
  }

  // Chaque codage → sa plage en coordonnée TEXTE (via ses tranches par bloc).
  const plages: Array<{ x0: number; x1: number; code: string }> = []
  for (const a of data.annotations) {
    if (a.type !== 'codage' || !a.code || estOrpheline(a)) continue
    const tranches = pmVersTranches(longueurs, a.from, a.to)
    if (tranches.length === 0) continue
    const derniere = tranches[tranches.length - 1]
    const x0 = cumuls[tranches[0].bloc] + tranches[0].debut
    const x1 = cumuls[derniere.bloc] + derniere.fin
    if (x0 < x1) plages.push({ x0, x1, code: a.code })
  }
  if (plages.length === 0) return []

  const bornes = [...new Set(plages.flatMap((p) => [p.x0, p.x1]))].sort((a, b) => a - b)
  const out: SegmentThematique[] = []
  for (let i = 0; i < bornes.length - 1; i++) {
    const d = bornes[i]
    const f = bornes[i + 1]
    const codes = [...new Set(plages.filter((p) => p.x0 <= d && p.x1 >= f).map((p) => p.code))].sort()
    if (codes.length === 0) continue
    // Bloc contenant d (le premier dont la fin dépasse d) → position PM du début ;
    // bloc contenant f par sa FIN (f > début du bloc) → position PM de la borne.
    let k = longueurs.length - 1
    for (let j = 0; j < longueurs.length; j++) {
      if (d < cumuls[j] + longueurs[j]) {
        k = j
        break
      }
    }
    let kFin = longueurs.length - 1
    for (let j = 0; j < longueurs.length; j++) {
      if (f > cumuls[j] && f <= cumuls[j] + longueurs[j]) {
        kFin = j
        break
      }
    }
    const seg: SegmentThematique = {
      deb: (d / total) * 100,
      fin: (f / total) * 100,
      pos: charVersPM(longueurs, k, d - cumuls[k]),
      posFin: charVersPM(longueurs, kFin, f - cumuls[kFin]),
      codes,
    }
    const prec = out[out.length - 1]
    if (prec && prec.fin === seg.deb && prec.codes.join(' ') === codes.join(' ')) {
      prec.fin = seg.fin
      prec.posFin = seg.posFin
    } else out.push(seg)
  }
  return out
}

/** Résumés de TOUS les entretiens (cartes de l'écran Corpus) — un balayage. */
export function resumesThematiques(entrees: EntreeMatrice[]): Record<string, SegmentThematique[]> {
  return Object.fromEntries(entrees.map(({ id, data }) => [id, resumeThematique(data)]))
}

/** MATRICE corpus = REQUÊTE : valeurs lues chez leurs propriétaires, ligne entretien via valeursGen + lignes locuteurs via valeursLoc.
 *  Jamais un cache. */
export function matriceCorpus(entrees: EntreeMatrice[]): MatriceCorpus {
  return entrees.map(({ id, titre, data }) => ({
    entretienId: id,
    titre,
    valeursGen: data.meta?.valeursGen ?? {},
    locuteurs: data.locuteurs.map((l) => ({ index: l.index, nom: l.nom, valeursLoc: l.valeursLoc ?? {} })),
  }))
}
