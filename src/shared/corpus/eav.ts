import type { Variable } from '../format'

/**
 *  Mapping EAV entre le format LEGACY SonalPi1 — `.sonal` (`var-json`/`dic-json`)
 *  ET `.crp` (`tabVar`/`tabDic`, MÊME format) — et le MODÈLE SonalPi2.
 *  Partagé entre l'import `.sonal` (`renderer/import/eav.ts`, qui le ré-exporte)
 *  et la migration `.crp` (`shared/corpus/migrationCrp.ts`) : UNE seule source
 *  de vérité pour le contrat, en parité avec le `eav.ts` historique.
 *
 *  Deux invariants portent tout le round-trip :
 *   1. Identités DÉTERMINISTES : la variable `v=n` → id `v{n}`,
 *      sa modalité `m` → id `v{n}m{m}`. Deux imports du même fichier produisent
 *      les mêmes ids → fusion idempotente par id, zéro doublon.
 *   2. La sentinelle `l="all"` et le champ `e` (index d'entretien) sont des
 *      ARTEFACTS DE FORMAT : ignorés à l'import, réintroduits à l'export
 *      seulement. Le modèle ne connaît que « valeur de portée entretien / de
 *      portée locuteur ».
 */

/** Id déterministe d'une variable legacy `v=n`. */
export const idVar = (v: number): string => `v${v}`
/** Id déterministe d'une modalité legacy `(v,m)`. */
export const idMod = (v: number, m: number): string => `v${v}m${m}`

/** Une entrée legacy (var-json / tabVar) : définition de variable. */
export interface VarLegacy {
  v: number
  lib: string
  champ: 'gen' | 'loc'
  priv: string | boolean
}
/** Une entrée legacy (dic-json / tabDic) : une modalité `(v,m)`. */
export interface DicLegacy {
  v: number
  m: number
  lib: string
}

export function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : []
}

/**
 *  `tabVar` + `tabDic` (`.`sonal` OU `.crp`) → définitions de variables
 *  modélisées. Mapping : `lib→lib`, `champ` (`'gen'`→`portee:'entretien'`,
 *  `'loc'`→`portee:'locuteur'`), `priv` (string `'true'/'false'` → booléen),
 *  la modalité `m=0` (souvent vide en SonalPi1) est conservée telle quelle (une
 *  valeur peut y pointer, le round-trip doit la réémettre). Modalité orpheline
 *  (variable absente de `tabVar`) : ignorée.
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
