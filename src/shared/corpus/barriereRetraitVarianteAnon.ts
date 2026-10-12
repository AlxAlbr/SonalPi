import type { Annotation } from '../entretien/annotation'
import { FORMAT_VERSION, type CorpusFichier } from '../format'
import { validerDefinitionAnon } from './definitionsAnon'

export interface BarriereRetraitVarianteAnon {
  operationId: string; regleId: string; pseudoRetire: string; pseudoConserve: string
}
const idSain = (s: unknown): s is string => typeof s === 'string' && !!s.trim() && !/[/\\\0]/.test(s) && s !== '.' && s !== '..'
export const memeVarianteAnon = (a: string, b: string) => a.trim().normalize('NFC').toLocaleLowerCase('fr') === b.trim().normalize('NFC').toLocaleLowerCase('fr')

/** Les deux variantes restent déclarées pendant le remplacement des choix consentis. */
export function lireBarriereRetraitVarianteAnon(corpus: CorpusFichier): BarriereRetraitVarianteAnon | null {
  const b = corpus.retraitVarianteAnon
  if (b === undefined) return null
  try {
    if (corpus.formatVersion !== FORMAT_VERSION || !b || !idSain(b.regleId) || typeof b.operationId !== 'string'
      || !/^retrait-variante-[a-zA-Z0-9_-]{1,160}$/.test(b.operationId) || typeof b.pseudoRetire !== 'string' || typeof b.pseudoConserve !== 'string'
      || corpus.suppressionAnon !== undefined || corpus.dissociationAnon !== undefined || !Object.hasOwn(corpus.reglesAnon ?? {}, b.regleId)) throw new Error()
    const r = corpus.reglesAnon[b.regleId], d = validerDefinitionAnon(r.entite, r.pseudos, r.categorie)
    if (r.id !== b.regleId || r.pseudos.length !== 2 || JSON.stringify(r.entite) !== JSON.stringify(d.entite)
      || JSON.stringify(r.pseudos) !== JSON.stringify(d.pseudos) || r.categorie !== d.categorie
      || b.pseudoRetire === b.pseudoConserve || !r.pseudos.includes(b.pseudoRetire) || !r.pseudos.includes(b.pseudoConserve)) throw new Error()
    return b
  } catch { throw new Error('L’état publié de retrait de variante est invalide. Aucun entretien publié.') }
}

/** Une publication ordinaire ne peut réintroduire le choix retiré, même dans une exception. */
export function verifierBarriereRetraitVarianteAnon(corpus: CorpusFichier, annotations: Annotation[]): void {
  const b = lireBarriereRetraitVarianteAnon(corpus)
  if (b && annotations.some((a) => a.regle === b.regleId && typeof a.pseudo === 'string' && memeVarianteAnon(a.pseudo, b.pseudoRetire))) {
    throw new Error('Cette variante est en cours de retrait. Aucun ancien choix lié, même mémorisé dans une exception, ne peut être réintroduit.')
  }
}

/** Les autres mutations ne peuvent modifier la définition ni sa protection en cours. */
export function exigerAbsenceRetraitVarianteAnon(corpus: CorpusFichier): void {
  if (corpus.retraitVarianteAnon !== undefined) throw new Error('Un retrait de variante est engagé. Relisez son suivi avant de modifier le corpus.')
}
