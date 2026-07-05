import type { Locuteur, Variable } from '../../shared/format'

/**
 * Mapping EAV entre le FORMAT LEGACY `.sonal` (tabVar/tabDic/tabDat, codes
 * numériques + sentinelle `l="all"`) et le MODÈLE SonalAsynchro (variables au
 * corpus, valeurs chez leur propriétaire — MODELE_OBJET2 §5, SUITE S1).
 *
 * Deux invariants portent tout le round-trip :
 *  1. Identités DÉTERMINISTES (règle n°3) : la variable `v=n` → id `v{n}`,
 *     sa modalité `m` → id `v{n}m{m}`. Deux imports du même `.sonal` produisent
 *     les mêmes ids → fusion idempotente par id, zéro doublon.
 *  2. La sentinelle `l="all"` et le champ `e` (index d'entretien) sont des
 *     ARTEFACTS DE FORMAT : ignorés à l'import, réintroduits à l'export seulement.
 *     Le modèle ne connaît que « valeur de portée entretien / de portée locuteur ».
 */

/** Une entrée `var-json` : définition de variable côté `.sonal`. */
interface VarLegacy {
  v: number
  lib: string
  champ: 'gen' | 'loc'
  priv: string | boolean
}
/** Une entrée `dic-json` : une modalité `(v,m)` d'une variable. */
interface DicLegacy {
  v: number
  m: number
  lib: string
}
/** Une entrée `dat-json` : une valeur appliquée. `l="all"` = portée entretien,
 *  `l=index` = portée du locuteur d'index donné. `e` = index d'entretien (artefact). */
interface DatLegacy {
  e?: string | number
  v: number
  l: 'all' | number
  m: number
}

const idVar = (v: number): string => `v${v}`
const idMod = (v: number, m: number): string => `v${v}m${m}`

function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : []
}

/**
 * `tabVar` + `tabDic` → définitions de variables modélisées. La modalité `m=0`
 * (souvent vide dans SonalPi) est conservée telle quelle : une valeur peut y
 * pointer, et le round-trip doit la réémettre. Modalité orpheline (variable
 * absente de `tabVar`) : ignorée.
 */
export function importerVariables(tabVar: unknown, tabDic: unknown): Variable[] {
  const parId = new Map<string, Variable>()
  asArray<VarLegacy>(tabVar).forEach((rv, ordre) => {
    const id = idVar(rv.v)
    parId.set(id, {
      id,
      lib: rv.lib ?? '',
      portee: rv.champ === 'gen' ? 'entretien' : 'locuteur',
      priv: rv.priv === true || rv.priv === 'true',
      ordre,
      vExport: rv.v,
      modalites: [],
    })
  })
  for (const rm of asArray<DicLegacy>(tabDic)) {
    const v = parId.get(idVar(rm.v))
    if (!v) continue
    v.modalites.push({ id: idMod(rm.v, rm.m), lib: rm.lib ?? '', mExport: rm.m })
  }
  return [...parId.values()]
}

/**
 * `tabDat` → valeurs distribuées chez leur propriétaire. Renvoie les valeurs de
 * portée entretien (`l="all"`) et POSE en place les `valeursLoc` des locuteurs
 * (`l=index`). Une valeur dont le locuteur cible n'existe pas est ignorée
 * (entrée incohérente ; on ne fabrique pas de locuteur fantôme).
 */
export function distribuerValeurs(
  tabDat: unknown,
  locuteurs: Locuteur[],
): Record<string, string> {
  const valeursGen: Record<string, string> = {}
  const parIndex = new Map(locuteurs.map((l) => [l.index, l]))
  for (const d of asArray<DatLegacy>(tabDat)) {
    const vId = idVar(d.v)
    const mId = idMod(d.v, d.m)
    if (d.l === 'all') {
      valeursGen[vId] = mId
    } else {
      const loc = parIndex.get(Number(d.l))
      if (loc) loc.valeursLoc[vId] = mId
    }
  }
  return valeursGen
}

/** Variables modélisées → `tabVar`/`tabDic` (ordre du modèle, codes d'export). */
export function exporterVariables(variables: Variable[]): { tabVar: VarLegacy[]; tabDic: DicLegacy[] } {
  const ordonnees = [...variables].sort((a, b) => a.ordre - b.ordre)
  const tabVar: VarLegacy[] = ordonnees.map((v) => ({
    v: v.vExport,
    lib: v.lib,
    champ: v.portee === 'entretien' ? 'gen' : 'loc',
    priv: String(v.priv),
  }))
  const tabDic: DicLegacy[] = []
  for (const v of ordonnees) {
    for (const m of v.modalites) tabDic.push({ v: v.vExport, m: m.mExport, lib: m.lib })
  }
  return { tabVar, tabDic }
}

/**
 * Valeurs modélisées → `tabDat`. La sentinelle `l="all"` et le champ `e` sont
 * RÉINTRODUITS ICI (jamais dans le modèle). `e="1"` : le `.sonal` exporté est
 * autonome (un entretien) ; SonalPi réattribue l'index à l'import dans un corpus.
 * Une valeur pointant une variable/modalité inconnue du corpus est ignorée.
 */
export function exporterValeurs(
  valeursGen: Record<string, string>,
  locuteurs: Locuteur[],
  variables: Variable[],
): DatLegacy[] {
  const vExp = new Map<string, number>()
  const mExp = new Map<string, number>()
  for (const v of variables) {
    vExp.set(v.id, v.vExport)
    for (const m of v.modalites) mExp.set(m.id, m.mExport)
  }
  const E = '1'
  const dat: DatLegacy[] = []
  const pousser = (idV: string, idM: string, l: 'all' | number) => {
    const v = vExp.get(idV)
    const m = mExp.get(idM)
    if (v === undefined || m === undefined) return
    dat.push({ e: E, v, l, m })
  }
  for (const [idV, idM] of Object.entries(valeursGen)) pousser(idV, idM, 'all')
  for (const loc of locuteurs) {
    for (const [idV, idM] of Object.entries(loc.valeursLoc)) pousser(idV, idM, loc.index)
  }
  return dat
}
