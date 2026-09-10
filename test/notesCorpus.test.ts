import { describe, expect, test } from 'vitest'
import {
  etatNoteJournal,
  inventorierNotes,
  memeEtatNote,
  memesChampsEditables,
} from '../src/shared/corpus/notes'
import type { CorpusFichier, EntretienFichier, Note } from '../src/shared/format'

const corpus: CorpusFichier = {
  formatVersion: 3,
  nom: 'Corpus',
  codebook: {},
  variables: {},
  reglesAnon: {},
  personnes: {},
  membership: {},
}

function note(patch: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    categorieId: 'ncat_resume',
    titre: 'Synthèse',
    date: '2025-01-02',
    statut: 'public',
    corps: 'Un <mark data-liens="c1 c1 absent">passage</mark>.',
    locuteurIds: ['l1'],
    rang: 1,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
    ...patch,
  }
}

function entretien(notes: Note[], commentaireId = 'c1'): EntretienFichier {
  return {
    formatVersion: 3,
    lastModified: '2025-01-01T10:00:00.000Z',
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdefghij' }] }],
    },
    annotations: [{
      id: commentaireId,
      type: 'commentaire',
      from: 6,
      to: 8,
      auteur: 'Alice',
      texte: 'Commentaire local',
    }],
    ancres: [{ pos: 1, t: 10 }, { pos: 11, t: 20 }],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    notes,
  }
}

describe('inventaire des notes du corpus', () => {
  test('projette par entretien, trie par rang et résout les commentaires locaux', () => {
    const resultat = inventorierNotes(corpus, [
      {
        id: 'e1',
        titre: 'Entretien A',
        data: entretien([note(), note({ id: 'n0', rang: 0, corps: 'Avant' })]),
      },
      {
        id: 'e2',
        titre: 'Entretien B',
        data: entretien([
          note({ id: 'n2', corps: '<em data-liens="c1">Référence étrangère</em>' }),
        ], 'autre'),
      },
    ])

    expect(resultat.indisponibles).toEqual([])
    expect(resultat.notes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2'])
    expect(resultat.notes[1]).toMatchObject({
      entretienId: 'e1',
      entretienTitre: 'Entretien A',
      liensCommentaires: [{
        commentaireId: 'c1',
        auteur: 'Alice',
        texte: 'Commentaire local',
        timecodeSecondes: 15,
      }],
    })
    expect(resultat.notes[2].liensCommentaires).toEqual([])
  })

  test('conserve un timecode nul quand la transcription n’a pas d’ancres', () => {
    const data = entretien([note()])
    data.ancres = []
    expect(inventorierNotes(corpus, [{ id: 'e1', titre: 'A', data }])
      .notes[0].liensCommentaires[0].timecodeSecondes).toBeNull()
  })
})

describe('état sémantique d’une note', () => {
  test('ignore seulement modifieLe et compare les objets indépendamment de l’ordre des clés', () => {
    const etat = etatNoteJournal(note({ modifieLe: '2025-02-01T00:00:00.000Z' }))
    expect(etat).not.toHaveProperty('modifieLe')
    expect(memeEtatNote(etat, { ...etat, locuteurIds: [...(etat.locuteurIds ?? [])] })).toBe(true)
    expect(memeEtatNote(etat, { ...etat, titre: 'Autre' })).toBe(false)
  })

  test('compare uniquement les cinq champs éditables', () => {
    const source = note()
    const champs = {
      categorieId: source.categorieId,
      titre: source.titre,
      date: source.date,
      statut: source.statut,
      corps: source.corps,
    }
    expect(memesChampsEditables(source, champs)).toBe(true)
    expect(memesChampsEditables({ ...source, rang: 99 }, champs)).toBe(true)
    expect(memesChampsEditables(source, { ...champs, corps: 'Modifié' })).toBe(false)
  })
})
