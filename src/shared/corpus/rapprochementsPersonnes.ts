import type { Locuteur } from '../format'
import {
  analyserRapprochementLocuteur as analyserRapprochementPersonne,
  calculerSuggestionsLocuteurs, peutCreerLocuteurAuNommage,
  type AnalyseRapprochementLocuteur, type CandidatRapprochementLocuteur,
} from './rapprochementsLocuteurs'

export { analyserRapprochementPersonne }
export {
  cleNomLocuteur as cleNomPersonne,
  natureNomLocuteur as natureNomPersonne,
  reprendreDonneesParticipation as reprendreDonneesLocuteur,
  scoreRapprochement,
} from './rapprochementsLocuteurs'
export type {
  AnalyseRapprochementLocuteur as AnalyseRapprochementPersonne,
  RaisonRapprochementLocuteur as RaisonRapprochementPersonne,
} from './rapprochementsLocuteurs'
export type { ChoixRepriseLocuteur } from './contratsLocuteurs'

export function peutCreerPersonneAuNommage(locuteur: Locuteur): boolean {
  return peutCreerLocuteurAuNommage({ nom: locuteur.nom, locuteurRef: locuteur.personneRef, associationRetiree: locuteur.personneDeliee })
}

export interface CandidatPersonne {
  entretienId: string
  locuteur: Locuteur
}

function suggestionsFiltrees(
  source: CandidatPersonne,
  candidats: CandidatPersonne[],
  accepter: (a: string, b: string) => AnalyseRapprochementLocuteur | null,
): CandidatPersonne[] {
  const originaux = new Map<CandidatRapprochementLocuteur, CandidatPersonne>()
  const convertir = (c: CandidatPersonne): CandidatRapprochementLocuteur => {
    const candidat = { entretienId: c.entretienId, participation: { id: c.locuteur.id, nom: c.locuteur.nom, locuteurRef: c.locuteur.personneRef } }
    originaux.set(candidat, c)
    return candidat
  }
  const selection = calculerSuggestionsLocuteurs(convertir(source), candidats.map(convertir), accepter,
    (a, b) => rapprochementRefuse(originaux.get(a)!.locuteur, originaux.get(b)!.locuteur))
  const vus = new Set<string>()
  return selection.flatMap((c) => {
    const original = originaux.get(c)!
    const cle = original.locuteur.personneRef ? `personne:${original.locuteur.personneRef}` : `locuteur:${original.locuteur.id}`
    if (vus.has(cle)) return []
    vus.add(cle)
    return [original]
  })
}

export function suggestionsExactesPersonnes(source: CandidatPersonne, candidats: CandidatPersonne[]): CandidatPersonne[] {
  return suggestionsFiltrees(source, candidats, (a, b) => {
    const analyse = analyserRapprochementPersonne(a, b)
    return analyse?.raison === 'meme-nom' || analyse?.raison === 'meme-role' ? analyse : null
  })
}

export function suggestionsPersonnes(source: CandidatPersonne, candidats: CandidatPersonne[]): CandidatPersonne[] {
  return suggestionsFiltrees(source, candidats, analyserRapprochementPersonne)
}

/** Les refus du format 9 gardent leurs chaînes, sans leur inventer un contexte. */
export function rapprochementRefuse(a: Locuteur, b: Locuteur): boolean {
  const refuse = (source: Locuteur, cible: Locuteur) =>
    !!source.rapprochementsRefuses?.some((r) =>
      (!!cible.id && r === `locuteur:${cible.id}`) ||
      (!!cible.personneRef && r === `personne:${cible.personneRef}`))
  return refuse(a, b) || refuse(b, a)
}

export function refuserRapprochement(source: Locuteur, cible: Locuteur): void {
  const ref = cible.personneRef ? `personne:${cible.personneRef}` : cible.id ? `locuteur:${cible.id}` : null
  if (!ref) throw new Error('Le locuteur cible doit avoir un identifiant stable.')
  source.rapprochementsRefuses = [...new Set([...(source.rapprochementsRefuses ?? []), ref])]
}

export function annulerRefusRapprochement(source: Locuteur, cible: string): void {
  source.rapprochementsRefuses = source.rapprochementsRefuses?.filter((r) => r !== cible)
}
