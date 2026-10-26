import { describe, expect, test } from 'vitest'
import { debutBloc } from '../src/shared/entretien/positions'
import { FORMAT_VERSION, type EntretienFichier, type Variable } from '../src/shared/format'
import type { Cas } from '../src/shared/corpus/cas'
import type { Recueil } from '../src/shared/corpus/recueils'
import { resumerAssociationsPassage } from '../src/renderer/editor/associationsPassage'

const date = '2026-09-01T10:00:00.000Z'
const textes = ['Question.', 'Karine habite Lyon.', 'Elle travaille ici.', 'Paul répond.']
const debuts = textes.map((_, index) => debutBloc(textes.map((texte) => texte.length), index))

function source(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: date,
    corpsTexte: {
      type: 'doc',
      content: textes.map((texte, index) => ({
        type: 'paragraph',
        attrs: { loc: [1, 2, 2, 3][index] },
        content: [{ type: 'text', text: texte }],
      })),
    },
    annotations: [],
    ancres: [],
    reperesPassages: [
      { id: 'exact', from: debuts[1], to: debuts[1] + textes[1].length },
      { id: 'large', from: debuts[1], to: debuts[2] + textes[2].length },
      { id: 'partiel', from: debuts[1] + 7, to: debuts[1] + 18 },
    ],
    locuteurs: [
      { index: 1, nom: 'Enquêtrice', interviewer: true, valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Karine', valeursLoc: { statut: 'salariee' }, personneRef: 'p1' },
      { index: 3, nom: 'Paul', valeursLoc: {}, personneRef: 'p2' },
    ],
    meta: { valeursGen: { site: 'lyon' }, audioRef: null },
  }
}

function cas(): Record<string, Cas> {
  return {
    manuel: {
      id: 'manuel', nom: 'Dossier manuel', memo: '', creeLe: date, modifieLe: date,
      regles: [],
      rattachements: [{
        id: 'r1', source: { entretienId: 'e1', repereId: 'exact' },
        provenance: 'manuel', creeLe: date,
      }],
    },
    personne: {
      id: 'personne', nom: 'Karine', memo: '', creeLe: date, modifieLe: date,
      regles: [{ type: 'personne', personneId: 'p1', inclureEnqueteurs: false }],
      rattachements: [],
    },
    entretien: {
      id: 'entretien', nom: 'Entretien entier', memo: '', creeLe: date, modifieLe: date,
      regles: [{ type: 'entretiens', entretienIds: ['e1'] }],
      rattachements: [],
    },
    modalite: {
      id: 'modalite', nom: 'Salariées', memo: '', creeLe: date, modifieLe: date,
      regles: [{
        type: 'modalite', variableId: 'statut', modaliteId: 'salariee',
        portee: 'locuteur', inclureEnqueteurs: false,
      }],
      rattachements: [],
    },
  }
}

const variables: Variable[] = [{
  id: 'statut', lib: 'Statut', portee: 'locuteur', privee: false,
  modalites: [{ id: 'salariee', lib: 'Salariée' }],
}]

function recueils(): Record<string, Recueil> {
  return {
    r1: {
      id: 'r1', nom: 'Synthèse terrain', creeLe: date, modifieLe: date,
      modeTexte: 'pseudonymise',
      items: [
        { id: 'titre', type: 'titre', niveau: 1, libelle: 'Constats' },
        { id: 'o1', type: 'passage', source: { entretienId: 'e1', repereId: 'exact' }, commentaireEditorial: '' },
        { id: 'o2', type: 'passage', source: { entretienId: 'e1', repereId: 'large' }, commentaireEditorial: '' },
      ],
    },
  }
}

describe('résumé des associations du passage', () => {
  test('réunit les ajouts manuels, les règles et les occurrences multiples sans dupliquer les noms', () => {
    const resultat = resumerAssociationsPassage({
      entretienId: 'e1', source: source(),
      selection: { from: debuts[1], to: debuts[1] + textes[1].length },
      cas: cas(), recueils: recueils(), variables,
      personnesConnues: new Set(['p1', 'p2']),
    })

    expect(resultat.cas.map((courant) => courant.nom)).toEqual([
      'Dossier manuel', 'Entretien entier', 'Karine', 'Salariées',
    ])
    expect(resultat.cas.find((courant) => courant.id === 'manuel')).toMatchObject({
      manuel: true,
      raisonsAutomatiques: [],
      correspondances: ['exacte'],
    })
    expect(resultat.cas.find((courant) => courant.id === 'personne')?.raisonsAutomatiques)
      .toEqual(['règle de personne'])
    expect(resultat.recueils).toEqual([{
      id: 'r1', nom: 'Synthèse terrain',
      occurrences: [
        { itemId: 'o1', correspondance: 'exacte' },
        { itemId: 'o2', correspondance: 'selection-dans-passage' },
      ],
    }])
    expect(resultat.problemes).toEqual([])
  })

  test('distingue une sélection partielle, un chevauchement et un repère impossible à vérifier', () => {
    const courants = cas()
    courants.manuel.rattachements.push({
      id: 'perdu', source: { entretienId: 'e1', repereId: 'absent' },
      provenance: 'manuel', creeLe: date,
    })
    courants.chevauche = {
      id: 'chevauche', nom: 'Passage croisé', memo: '', creeLe: date, modifieLe: date,
      regles: [],
      rattachements: [{
        id: 'croise', source: { entretienId: 'e1', repereId: 'partiel' },
        provenance: 'manuel', creeLe: date,
      }],
    }
    const resultat = resumerAssociationsPassage({
      entretienId: 'e1', source: source(),
      selection: { from: debuts[1] + 5, to: debuts[1] + 12 },
      cas: courants, recueils: {}, variables,
      personnesConnues: new Set(['p1', 'p2']),
    })

    expect(resultat.cas.find((courant) => courant.id === 'manuel')?.correspondances)
      .toEqual(['selection-dans-passage'])
    expect(resultat.cas.find((courant) => courant.id === 'chevauche')?.correspondances)
      .toEqual(['chevauchement'])
    expect(resultat.problemes).toContain('Un ajout manuel du cas « Dossier manuel » ne peut pas être situé.')
  })

  test('ne transforme pas une identité de personne non vérifiée en inclusion automatique', () => {
    const resultat = resumerAssociationsPassage({
      entretienId: 'e1', source: source(),
      selection: { from: debuts[1], to: debuts[1] + textes[1].length },
      cas: { personne: cas().personne }, recueils: {}, variables,
      personnesConnues: null,
    })

    expect(resultat.cas).toEqual([])
    expect(resultat.problemes).toEqual([
      'Les règles de personnes du cas « Karine » n’ont pas pu être vérifiées.',
    ])
  })
})
