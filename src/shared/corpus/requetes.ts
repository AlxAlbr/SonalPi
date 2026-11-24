import type { CibleValeur, EntretienFichier, MatriceCorpus, SegmentThematique } from '../format'
import { estOrpheline } from '../entretien/annotation'
import { debutBloc } from '../entretien/positions'
import * as valeursNatives from './valeursVariables'

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

/** Retire d'un entretien tous les codages d'un thème ; renvoie le nombre de codages retirés. */
export function retirerCodagesDuTheme(entretien: EntretienFichier, code: string): number {
  const avant = entretien.annotations.length
  entretien.annotations = entretien.annotations.filter((a) => !(a.type === 'codage' && a.code === code))
  return avant - entretien.annotations.length
}

/** Usages de TOUS les codes en un seul balayage (affichage du panneau). */
export function usagesParCategorie(entretiens: EntretienFichier[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entretiens)
    for (const a of e.annotations) if (a.type === 'codage' && a.code) out[a.code] = (out[a.code] ?? 0) + 1
  return out
}

export { compterUsagesVariable, compterValeursVariable, effacerValeursVariable, compterUsagesModalite } from './valeursVariables'

/** Résout les ids déjà enregistrés, sans compléter ceux qui manquent dans le stockage actif. */
export function poserValeur(data: EntretienFichier, cible: CibleValeur, idVar: string, idMod: string): boolean {
  return valeursNatives.poserValeur({ meta: data.meta, participations: data.participations.flatMap((p) =>
    p.id ? [{ id: p.id, valeursLoc: p.valeursLoc }] : []) }, cible, idVar, idMod)
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
  // Pour chaque bloc : début en caractères cumulés, début et fin en positions PM.
  const cumuls: number[] = []
  const debutsPM: number[] = []
  const finsPM: number[] = []
  for (let k = 0, c = 0, pos = debutBloc(longueurs, 0); k < longueurs.length; k++) {
    cumuls.push(c)
    debutsPM.push(pos)
    finsPM.push(pos + longueurs[k])
    c += longueurs[k]
    pos += 2 + longueurs[k]
  }

  // Chaque codage → sa plage en coordonnée TEXTE :
  // du premier au dernier bloc non vide qu'il recouvre.
  const plages: Array<{ x0: number; x1: number; code: string }> = []
  for (const a of data.annotations) {
    if (a.type !== 'codage' || !a.code || estOrpheline(a)) continue
    let k0 = premierIndex(finsPM, (fin) => fin > a.from)
    while (k0 < longueurs.length && longueurs[k0] === 0 && debutsPM[k0] < a.to) k0++
    if (k0 >= longueurs.length || debutsPM[k0] >= a.to) continue
    let k1 = premierIndex(debutsPM, (debut) => debut >= a.to) - 1
    while (k1 > k0 && longueurs[k1] === 0) k1--
    const x0 = cumuls[k0] + Math.max(a.from, debutsPM[k0]) - debutsPM[k0]
    const x1 = cumuls[k1] + Math.min(a.to, finsPM[k1]) - debutsPM[k1]
    if (x0 < x1) plages.push({ x0, x1, code: a.code })
  }
  if (plages.length === 0) return []

  // Balayage des bornes dans l'ordre.
  // Un segment porte les codages commencés avant lui et finis après son début.
  const bornes = [...new Set(plages.flatMap((p) => [p.x0, p.x1]))].sort((a, b) => a - b)
  const parDebut = [...plages].sort((p, q) => p.x0 - q.x0)
  const parFin = [...plages].sort((p, q) => p.x1 - q.x1)
  const actifs = new Map<string, number>()
  const out: SegmentThematique[] = []
  let iDebut = 0
  let iFin = 0
  let k = 0
  let kFin = 0
  for (let i = 0; i < bornes.length - 1; i++) {
    const d = bornes[i]
    const f = bornes[i + 1]
    for (; iDebut < parDebut.length && parDebut[iDebut].x0 <= d; iDebut++) {
      const code = parDebut[iDebut].code
      actifs.set(code, (actifs.get(code) ?? 0) + 1)
    }
    for (; iFin < parFin.length && parFin[iFin].x1 <= d; iFin++) {
      const code = parFin[iFin].code
      const n = actifs.get(code)! - 1
      if (n === 0) actifs.delete(code)
      else actifs.set(code, n)
    }
    if (actifs.size === 0) continue
    const codes = [...actifs.keys()].sort()
    // Bloc contenant d (le premier dont la fin dépasse d) → position PM du début ;
    // bloc contenant f par sa fin → position PM de la borne.
    while (k < longueurs.length - 1 && cumuls[k] + longueurs[k] <= d) k++
    while (kFin < longueurs.length - 1 && cumuls[kFin] + longueurs[kFin] < f) kFin++
    const seg: SegmentThematique = {
      deb: (d / total) * 100,
      fin: (f / total) * 100,
      pos: debutsPM[k] + d - cumuls[k],
      posFin: debutsPM[kFin] + f - cumuls[kFin],
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

/** Premier index d'un tableau trié pour lequel le test devient vrai (longueur sinon). */
function premierIndex(valeurs: number[], test: (valeur: number) => boolean): number {
  let bas = 0
  let haut = valeurs.length
  while (bas < haut) {
    const milieu = (bas + haut) >> 1
    if (test(valeurs[milieu])) haut = milieu
    else bas = milieu + 1
  }
  return bas
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
    participations: data.participations.map((p) => ({ participationId: p.id || null, index: p.index, nom: p.nom, valeursLoc: p.valeursLoc ?? {} })),
  }))
}
