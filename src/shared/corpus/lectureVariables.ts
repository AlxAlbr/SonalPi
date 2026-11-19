import type { ParticipationLocuteur } from '../locuteurs'
import type { Variable } from "../format"

export interface LigneValeur {
  id: string
  lib: string
  valeur: string | null
}

export interface BlocParticipation {
  participationId: string | null
  participationIndex: number | null
  nom: string
  lignes: LigneValeur[]
}

type ParticipationLecture = Pick<ParticipationLocuteur, 'nom' | 'interviewer' | 'valeursLoc'>
  & Partial<Pick<ParticipationLocuteur, 'id' | 'index'>>

/** Résout les valeurs locales sans consulter ni enrichir les identités corpus. */
export function detailsVariablesEntretien(
  definitions: readonly Variable[],
  entretien: { meta: { valeursGen: Record<string, string> }; participations: readonly ParticipationLecture[] },
): { generales: LigneValeur[]; parParticipation: BlocParticipation[] } {
  const libMod = (idVar: string, idMod: string | undefined): string | null => {
    if (!idMod) return null
    return definitions.find((v) => v.id === idVar)?.modalites.find((m) => m.id === idMod)?.lib ?? null
  }
  const tri = (a: Variable, b: Variable) => a.ordre - b.ordre
  const generales = definitions.filter((v) => v.portee === 'entretien').sort(tri)
    .map((v) => ({ id: v.id, lib: v.lib, valeur: libMod(v.id, entretien.meta.valeursGen[v.id]) }))
  const parParticipation = entretien.participations
    .filter((p) => !p.interviewer && !p.nom.includes('?'))
    .map((p) => ({
      participationId: p.id ?? null, participationIndex: p.index ?? null, nom: p.nom,
      lignes: definitions.filter((v) => v.portee === 'participation').sort(tri)
        .map((v) => ({ id: v.id, lib: v.lib, valeur: libMod(v.id, p.valeursLoc[v.id]) })),
    }))
  return { generales, parParticipation }
}
