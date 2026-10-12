import { FORMAT_VERSION, type CorpusFichier } from '../format'
import { validerDefinitionAnon } from './definitionsAnon'
import { exigerAbsenceRetraitVarianteAnon } from './barriereRetraitVarianteAnon'

export interface BarriereSuppressionAnon { operationId: string; regleId: string }
const idSain = (s: unknown): s is string => typeof s === 'string' && !!s.trim() && !/[/\\\0]/.test(s) && s !== '.' && s !== '..'

/** La règle reste présente tant que ses décisions liées ne sont pas toutes retirées. */
export function lireBarriereSuppressionAnon(corpus: CorpusFichier): BarriereSuppressionAnon | null {
  const b = corpus.suppressionAnon
  if (b === undefined) return null
  try {
    if (corpus.formatVersion !== FORMAT_VERSION || !b || typeof b !== 'object' || !idSain(b.regleId) || typeof b.operationId !== 'string'
      || !/^suppression-anon-[a-zA-Z0-9_-]{1,160}$/.test(b.operationId)
      || !Object.hasOwn(corpus.reglesAnon ?? {}, b.regleId) || corpus.dissociationAnon !== undefined || corpus.retraitVarianteAnon !== undefined) throw new Error()
    const r = corpus.reglesAnon[b.regleId], d = validerDefinitionAnon(r.entite, r.pseudos, r.categorie)
    if (r.id !== b.regleId || JSON.stringify(r.entite) !== JSON.stringify(d.entite)
      || JSON.stringify(r.pseudos) !== JSON.stringify(d.pseudos) || r.categorie !== d.categorie) throw new Error()
    return b
  } catch { throw new Error('L’état publié de suppression est invalide. Aucun entretien publié.') }
}

/** Une autre mutation du corpus ne peut retirer ni modifier la protection en cours. */
export function exigerAbsenceSuppressionAnon(corpus: CorpusFichier): void {
  exigerAbsenceRetraitVarianteAnon(corpus)
  if (corpus.suppressionAnon !== undefined) throw new Error('Une suppression globale est engagée. Relisez son suivi avant de modifier le corpus.')
}
