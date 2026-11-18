import type { CorpusFichier as CorpusFormat9, EntretienFichier as EntretienFormat9, Variable as VariableFormat9 } from '../format'
import type { Cas as CasFormat9, DerivationAttributCas as DerivationFormat9, FamilleCas as FamilleFormat9, RegleCas as RegleFormat9 } from '../corpus/cas'
import type { Cas, CorpusFichier, DerivationAttributCas, FamilleCas, RegleCas, Variable } from './format'
import type { EntretienLectureCas, ParticipationLectureCas } from './lectureCas'

/** Adaptateurs de lecture du format 9 ; aucun fichier n'est converti ni enregistré ici. */
export function lireVariableFormat9(variable: VariableFormat9): Variable {
  return { ...variable, portee: variable.portee === 'locuteur' ? 'participation' : variable.portee }
}

export function lireDerivationFormat9(derivation: DerivationFormat9): DerivationAttributCas {
  return { ...derivation, porteeSource: derivation.porteeSource === 'locuteur' ? 'participation' : derivation.porteeSource }
}

export function lireRegleCasFormat9(regle: RegleFormat9): RegleCas {
  if (regle.type === 'personne') {
    const { personneId, ...commun } = regle
    return { ...commun, type: 'locuteur', locuteurId: personneId }
  }
  if (regle.type === 'personnes') {
    return { ...regle, type: 'locuteurs', membres: regle.membres.map(({ personneId, ...membre }) => ({ ...membre, locuteurId: personneId })) }
  }
  if (regle.type === 'modalite' && regle.portee === 'locuteur') return { ...regle, portee: 'participation' }
  return { ...regle }
}

export function lireCasFormat9(cas: CasFormat9): Cas {
  const { regles, derivationsPropres, ...commun } = cas
  return {
    ...commun, regles: regles.map(lireRegleCasFormat9),
    ...(derivationsPropres !== undefined ? { derivationsPropres: derivationsPropres.map(lireDerivationFormat9) } : {}),
  }
}

export function lireFamilleCasFormat9(famille: FamilleFormat9): FamilleCas {
  const { origine, derivationsAttributs, ...commun } = famille
  return {
    ...commun,
    origine: origine.portee === 'locuteur' ? { ...origine, portee: 'participation' } : { ...origine },
    ...(derivationsAttributs !== undefined ? { derivationsAttributs: derivationsAttributs.map(lireDerivationFormat9) } : {}),
  }
}

export function lireEntretienCasFormat9(data: EntretienFormat9): EntretienLectureCas {
  return {
    corpsTexte: data.corpsTexte, annotations: data.annotations, meta: data.meta, reperesPassages: data.reperesPassages,
    // Une structure invalide reste invalide pour que le lecteur la signale.
    participations: Array.isArray(data.locuteurs) ? data.locuteurs.map((p) => ({
      id: p.id, index: p.index, nom: p.nom, locuteurRef: p.personneRef, interviewer: p.interviewer,
      valeursLoc: p.valeursLoc, pseudo: p.pseudo, pseudoEtat: p.pseudoEtat, couleur: p.couleur,
    })) : data.locuteurs as unknown as ParticipationLectureCas[],
  }
}

type CorpusPourLecture9 = Pick<CorpusFormat9, 'membership'>
  & Partial<Pick<CorpusFormat9, 'personnes' | 'variables' | 'cas' | 'famillesCas' | 'attributsCas'>>
export type CorpusLectureCas = Pick<CorpusFichier, 'membership' | 'locuteurs' | 'variables' | 'cas' | 'famillesCas' | 'attributsCas'>

export function lireCorpusCasFormat9(corpus: CorpusPourLecture9): CorpusLectureCas {
  return {
    membership: corpus.membership,
    locuteurs: corpus.personnes ?? {},
    variables: Object.fromEntries(Object.entries(corpus.variables ?? {}).map(([id, variable]) => [id, lireVariableFormat9(variable)])),
    ...(corpus.cas !== undefined ? { cas: Object.fromEntries(Object.entries(corpus.cas).map(([id, cas]) => [id, lireCasFormat9(cas)])) } : {}),
    ...(corpus.famillesCas !== undefined ? { famillesCas: Object.fromEntries(Object.entries(corpus.famillesCas).map(([id, famille]) => [id, lireFamilleCasFormat9(famille)])) } : {}),
    attributsCas: corpus.attributsCas,
  }
}
