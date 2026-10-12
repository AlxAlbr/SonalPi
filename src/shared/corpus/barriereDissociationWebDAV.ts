import type { CorpusFichier, EntretienFichier } from '../format'
import { exigerAbsenceSuppressionAnon, lireBarriereSuppressionAnon } from './barriereSuppressionAnon'
import { verifierBarriereRetraitVarianteAnon } from './barriereRetraitVarianteAnon'
import { validerDefinitionAnon } from './definitionsAnon'
import { validerMemoireLocale, type DefinitionAnonLocale } from '../entretien/anon/definitionsLocales'

export interface BarriereDissociationWebDAV {
  operationId: string; regleId: string; fournisseur: 'webdav'; cibles: string[]
}
const idSain = (s: unknown): s is string => typeof s === 'string' && !!s.trim() && !/[/\\\0\r\n]/.test(s) && s !== '.' && s !== '..'

/** Une mutation ordinaire ne peut retirer la protection d’un transfert engagé. */
export function exigerAbsenceDissociationWebDAV(corpus: CorpusFichier): void {
  exigerAbsenceSuppressionAnon(corpus)
  if (corpus.dissociationAnon !== undefined) throw new Error('Une dissociation est engagée. Reprenez son suivi avant toute autre mutation du corpus.')
}

export function lireBarriereDissociationWebDAV(corpus: CorpusFichier): BarriereDissociationWebDAV | null {
  const b = corpus.dissociationAnon
  if (b === undefined) return null
  if (!b || b.fournisseur !== 'webdav' || !/^dissociation-[a-zA-Z0-9_-]{1,160}$/.test(b.operationId)
    || !idSain(b.regleId) || !Object.hasOwn(corpus.reglesAnon ?? {}, b.regleId)
    || !Array.isArray(b.cibles) || !b.cibles.every(idSain) || new Set(b.cibles).size !== b.cibles.length) {
    throw new Error('La barrière publiée de dissociation WebDAV est invalide. Aucun entretien publié.')
  }
  const r = corpus.reglesAnon[b.regleId]
  const d = validerDefinitionAnon(r.entite, r.pseudos, r.categorie)
  if (r.id !== b.regleId || JSON.stringify(r.entite) !== JSON.stringify(d.entite)
    || JSON.stringify(r.pseudos) !== JSON.stringify(d.pseudos) || r.categorie !== d.categorie) {
    throw new Error('La définition protégée de dissociation WebDAV est invalide.')
  }
  return b as BarriereDissociationWebDAV
}

export function declarationDissociationConservee(definitions: DefinitionAnonLocale[], corpus: CorpusFichier, regleId: string): boolean {
  validerMemoireLocale(definitions)
  const r = corpus.reglesAnon[regleId]
  return definitions.some((d) => d.etat === 'declaration' && JSON.stringify(d.entite) === JSON.stringify(r.entite)
    && JSON.stringify(d.pseudos) === JSON.stringify(r.pseudos) && d.categorie === r.categorie)
}

/** Le verrou corpus protège aussi la mémoire acquise, pas seulement les références à la règle. */
export function verifierBarriereDissociationWebDAV(corpus: CorpusFichier, candidat: EntretienFichier, id: string): void {
  verifierBarriereRetraitVarianteAnon(corpus, candidat.annotations)
  const suppression = lireBarriereSuppressionAnon(corpus)
  if (suppression && (!Array.isArray(candidat.annotations) || candidat.annotations.some((a) => a.regle === suppression.regleId))) {
    throw new Error('La règle est en cours de suppression. Aucun ancien lien ne peut être réintroduit.')
  }
  const b = lireBarriereDissociationWebDAV(corpus)
  if (!b) return
  if (!Array.isArray(candidat.annotations) || candidat.annotations.some((a) => a.regle === b.regleId)) {
    throw new Error('La règle est en cours de dissociation. Aucun ancien lien ne peut être réintroduit.')
  }
  if (b.cibles.includes(id) && !declarationDissociationConservee(candidat.definitionsAnonLocales ?? [], corpus, b.regleId)) {
    throw new Error('La déclaration locale complète est protégée jusqu’au retrait partagé. Aucun entretien publié.')
  }
}
