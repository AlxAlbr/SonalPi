import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type Variable } from '../../src/shared/format'
import type { Cas, FamilleCas } from '../../src/shared/corpus/cas'

export const dateFamille = '2026-09-01T10:00:00.000Z'
export function variableFamille(portee: Variable['portee'] = 'locuteur'): Variable {
  return { id: 'v', lib: 'Établissement', portee, ordre: 0, priv: false, vExport: 1,
    modalites: ['a', 'b', 'c'].map((id, index) => ({ id, lib: id.toUpperCase(), mExport: index + 1 })) }
}
export function familleCas(portee: Variable['portee'] = 'locuteur', id = 'f'): FamilleCas {
  return { id, nom: `Établissement ${id}`, creeLe: dateFamille,
    origine: portee === 'locuteur' ? { variableId: 'v', portee, inclureEnqueteurs: false } : { variableId: 'v', portee } }
}
export function casModalite(modaliteId = 'a', famille = familleCas(), id = `cas-${famille.id}-${modaliteId}`): Cas {
  return { id, nom: id, memo: 'Mémo conservé', creeLe: dateFamille, modifieLe: dateFamille,
    familleId: famille.id, regles: [{ type: 'modalite', ...famille.origine, modaliteId }], rattachements: [] }
}
export function corpusFamille(portee: Variable['portee'] = 'locuteur'): CorpusFichier {
  return { formatVersion: FORMAT_VERSION, codebook: {}, variables: { v: variableFamille(portee) }, reglesAnon: {}, personnes: {},
    membership: Object.fromEntries(['e1', 'e2'].map((id) => [id, { titre: id, date: null, lastModified: dateFamille }])), cas: {}, famillesCas: {} }
}
export function sourceFamille(seconde = false): EntretienFichier {
  const textes = ['Question', 'Réponse locale', 'Sans identité', 'Autre établissement', 'Sans valeur', 'Sans locuteur']
  return { formatVersion: FORMAT_VERSION, lastModified: dateFamille,
    corpsTexte: { type: 'doc', content: textes.map((text, index) => ({ type: 'paragraph', attrs: { loc: index < 5 ? index + 1 : null }, content: [{ type: 'text', text }] })) },
    annotations: [], ancres: [], reperesPassages: [{ id: 'r', from: 1, to: 9 }],
    locuteurs: [
      { index: 1, nom: 'Question', interviewer: true, personneRef: 'p', valeursLoc: { v: 'a' } },
      { index: 2, nom: 'Même nom', personneRef: 'p', valeursLoc: { v: seconde ? 'b' : 'a' } },
      { index: 3, nom: 'Même nom', personneRef: null, valeursLoc: { v: 'a' } },
      { index: 4, nom: 'Autre', personneRef: null, valeursLoc: { v: 'b' } },
      { index: 5, nom: 'Absent', personneRef: null, valeursLoc: {} },
      { index: 6, nom: 'Muet', personneRef: null, valeursLoc: { v: 'a' } },
    ], meta: { valeursGen: { v: seconde ? 'b' : 'a' }, audioRef: null } }
}
