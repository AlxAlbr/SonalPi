import type { CorpusFichier } from '../format'

export interface ImpactSuppressionEntretien {
  entretienId: string
  recueilsAffectes: number
  passagesRecueils: number
  casAffectes: number
  rattachementsCas: number
  casReglesEntretien: number
  empreinte: string
}

/** Inventorie les références visibles avant de confirmer une suppression. */
export function analyserImpactSuppressionEntretien(
  corpus: CorpusFichier,
  entretienId: string,
): ImpactSuppressionEntretien {
  const referencesRecueils: string[] = []
  const recueils = new Set<string>()
  for (const [recueilId, recueil] of Object.entries(corpus.recueils ?? {})) {
    for (const item of recueil.items) {
      if (item.type !== 'passage' || item.source.entretienId !== entretienId) continue
      recueils.add(recueilId)
      referencesRecueils.push(`recueil\0${recueilId}\0${item.id}\0${item.source.repereId}`)
    }
  }

  const referencesCas: string[] = []
  const cas = new Set<string>()
  const casRegles = new Set<string>()
  const referencesRegles: string[] = []
  for (const [casId, courant] of Object.entries(corpus.cas ?? {})) {
    for (const regle of courant.regles) {
      if (regle.type !== 'entretiens' || !regle.entretienIds.includes(entretienId)) continue
      casRegles.add(casId)
      referencesRegles.push(`regle-entretien\0${casId}\0${JSON.stringify(regle.entretienIds)}`)
    }
    for (const rattachement of courant.rattachements) {
      if (rattachement.source.entretienId !== entretienId) continue
      cas.add(casId)
      referencesCas.push(`cas\0${casId}\0${rattachement.id}\0${rattachement.source.repereId}`)
    }
  }

  const references = [...referencesRecueils, ...referencesCas, ...referencesRegles].sort()
  return {
    entretienId,
    recueilsAffectes: recueils.size,
    passagesRecueils: referencesRecueils.length,
    casAffectes: cas.size,
    rattachementsCas: referencesCas.length,
    casReglesEntretien: casRegles.size,
    empreinte: JSON.stringify([
      Boolean(corpus.membership[entretienId]),
      ...references,
    ]),
  }
}

/** Vérifie que l'utilisateur a confirmé exactement les références encore présentes. */
export function memeImpactSuppressionEntretien(
  attendu: ImpactSuppressionEntretien,
  courant: ImpactSuppressionEntretien,
): boolean {
  return attendu.entretienId === courant.entretienId
    && attendu.recueilsAffectes === courant.recueilsAffectes
    && attendu.passagesRecueils === courant.passagesRecueils
    && attendu.casAffectes === courant.casAffectes
    && attendu.rattachementsCas === courant.rattachementsCas
    && attendu.casReglesEntretien === courant.casReglesEntretien
    && attendu.empreinte === courant.empreinte
}
