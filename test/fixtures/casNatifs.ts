import { FORMAT_VERSION, type Cas, type CorpusFichier, type EntretienFichier } from "../../src/shared/format"

export const dateCasNatif = '2026-01-01T10:00:00.000Z'
export const idLocuteurNatif = 'personne-conservee'
export const idParticipationNative = 'loc-conserve'

export function corpusCasNatif(): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION,
    codebook: {}, reglesAnon: {},
    locuteurs: { [idLocuteurNatif]: { id: idLocuteurNatif, nom: 'Alice' }, autre: { id: 'autre', nom: 'Alice' } },
    membership: { e1: { titre: 'Entretien A', date: null, lastModified: dateCasNatif } },
    variables: {
      groupe: { id: 'groupe', lib: 'Groupe', portee: 'participation', priv: false, ordre: 0, vExport: 1,
        modalites: [{ id: 'a', lib: 'A', mExport: 1 }, { id: 'b', lib: 'B', mExport: 2 }] },
      age: { id: 'age', lib: 'Âge', portee: 'participation', priv: false, ordre: 1, vExport: 2,
        modalites: [{ id: 'adulte', lib: 'Adulte', mExport: 1 }, { id: 'jeune', lib: 'Jeune', mExport: 2 }] },
      lieu: { id: 'lieu', lib: 'Lieu', portee: 'entretien', priv: false, ordre: 2, vExport: 3,
        modalites: [{ id: 'ici', lib: 'Ici', mExport: 1 }] },
    },
    cas: {}, famillesCas: {},
    attributsCas: { 'attr-age': { id: 'attr-age', lib: 'Âge observé', type: 'modalites', priv: false, ordre: 0, modalites: [] } },
  }
}

export function entretienCasNatif(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION, lastModified: dateCasNatif,
    corpsTexte: { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Bonjour Alice.' }] },
    ] },
    annotations: [{ id: 'anon', type: 'anon', from: 9, to: 14, auteur: '', pseudo: 'Voix', etat: 'anonymise' }],
    ancres: [], meta: { valeursGen: { lieu: 'ici' }, audioRef: null },
    participations: [{ id: idParticipationNative, index: 7, nom: 'Nom local A', locuteurRef: idLocuteurNatif,
      pseudo: 'Voix A', pseudoEtat: 'confirme', valeursLoc: { groupe: 'a', age: 'adulte' } }],
    reperesPassages: [{ id: 'repere', from: 1, to: 15 }],
    notes: [{ id: 'note', categorieId: 'generale', titre: '', date: null, statut: 'prive', corps: 'Note locale',
      participationIds: [idParticipationNative], rang: 0, creeLe: dateCasNatif, modifieLe: null }],
  }
}

export function casNatif(): Cas {
  return {
    id: 'cas', nom: 'Cas Alice', memo: 'Mémo conservé', creeLe: dateCasNatif, modifieLe: dateCasNatif,
    regles: [{ type: 'locuteur', locuteurId: idLocuteurNatif, inclureEnqueteurs: false }],
    rattachements: [],
  }
}
