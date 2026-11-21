import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { JournalCorpus } from '../src/main/journalCorpus'
import { ecrireSeedDemo } from './seedDemo'
import type { ChampsNote, CommandeNotes } from '../src/shared/corpus/notes'
import type { Note } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function preparer() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-corpus-'))
  dossiers.push(dir)
  ecrireSeedDemo(dir, true)
  const store = new CorpusStore(dir)
  store.ouvrir()
  return { dir, store }
}

function noteJournal(): Note {
  return {
    id: 'note-corpus-test',
    categorieId: 'ncat_resume',
    titre: 'État A',
    date: '2025-01-02',
    statut: 'public',
    corps: 'Corps A',
    participationIds: [],
    rang: 0,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
  }
}

describe('Journal du corpus — service volatile', () => {
  test('présente les actions récentes en premier et en conserve dix', () => {
    let index = 0
    const journal = new JournalCorpus(
      () => new Date(`2025-01-01T10:${String(index).padStart(2, '0')}:00.000Z`),
      () => `j-${++index}`,
    )
    for (let i = 0; i < 12; i++) {
      journal.enregistrer(
        `Action ${i}`,
        'notes',
        { type: 'noteSupprimer', entretienId: 'e1', note: noteJournal(), ordreApres: [] },
        { corpus: false, entretiens: ['e1'], projections: ['notes', 'locuteurs'] },
      )
    }
    const entrees = journal.lister(() => ({ etat: 'annulable' }))
    expect(entrees).toHaveLength(10)
    expect(entrees.map((entree) => entree.libelle)).toEqual([
      'Action 11', 'Action 10', 'Action 9', 'Action 8', 'Action 7',
      'Action 6', 'Action 5', 'Action 4', 'Action 3', 'Action 2',
    ])
  })
})

function ajouterNote(store: CorpusStore): { entretienId: string; note: Note } {
  const entretienId = Object.keys(store.ouvrir().membership)[0]
  const lecture = store.lireEntretien(entretienId)
  if (!lecture.ok) throw new Error('Entretien de test indisponible')
  const note: Note = {
    ...noteJournal(),
    participationIds: [lecture.data.participations[0]?.id ?? 'loc-absent'],
  }
  lecture.data.notes = [note]
  const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
  store.ecrireEntretien(entretienId, payload)
  return { entretienId, note }
}

function remplacerNotes(store: CorpusStore, notes: Note[]): string {
  const entretienId = Object.keys(store.ouvrir().membership)[0]
  const lecture = store.lireEntretien(entretienId)
  if (!lecture.ok) throw new Error('Entretien de test indisponible')
  lecture.data.notes = structuredClone(notes)
  const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
  store.ecrireEntretien(entretienId, payload)
  return entretienId
}

function champsNote(
  note: Pick<Note, 'categorieId' | 'titre' | 'date' | 'statut' | 'corps'>,
  patch: Partial<ChampsNote> = {},
): ChampsNote {
  return {
    categorieId: note.categorieId,
    titre: note.titre,
    date: note.date,
    statut: note.statut,
    corps: note.corps,
    ...patch,
  }
}

describe('Journal du corpus — commandes Notes', () => {
  test('le journal disparaît à la réouverture, pas les notes enregistrées', () => {
    const { dir, store } = preparer(), { entretienId } = ajouterNote(store)
    const vue = store.notesInventaire().notes[0]
    store.notesCommander({ type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: champsNote(vue.attendu, { titre: 'Note enregistrée' }) }, true)
    expect(store.journalCorpusLister()).toHaveLength(1)
    const rouvert = new CorpusStore(dir)
    expect(rouvert.journalCorpusLister()).toEqual([])
    expect(rouvert.notesInventaire().notes[0].titre).toBe('Note enregistrée')
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).not.toHaveProperty('journal')
  })

  test('une modification plus récente rend l’annulation inapplicable sans écraser la note', () => {
    const { dir, store } = preparer(), { entretienId } = ajouterNote(store)
    let vue = store.notesInventaire().notes[0]
    store.notesCommander({ type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: champsNote(vue.attendu, { titre: 'Première modification' }) }, true)
    vue = store.notesInventaire().notes[0]
    store.notesCommander({ type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: champsNote(vue.attendu, { titre: 'Modification plus récente' }) })
    const chemin = join(dir, 'entretiens', `${entretienId}.json`), avant = readFileSync(chemin, 'utf8')
    const entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ etat: 'inapplicable', raison: 'La note a été modifiée depuis cette action.' })
    expect(store.journalCorpusAnnuler(entree.id)).toMatchObject({ ok: false, temporaire: false })
    expect(readFileSync(chemin, 'utf8')).toBe(avant)
  })

  test.each(['modifier', 'supprimer'] as const)('une annulation de note (%s) reste bloquée seulement pendant l’indisponibilité de sa source', (type) => {
    const { dir, store } = preparer(), { entretienId } = ajouterNote(store)
    const vue = store.notesInventaire().notes[0]
    const commande = { type, entretienId, noteId: vue.id, attendu: vue.attendu }
    store.notesCommander(type === 'modifier' ? { ...commande, type, champs: champsNote(vue.attendu, { titre: 'Modifiée' }) }
      : { ...commande, type }, true)
    const chemin = join(dir, 'entretiens', `${entretienId}.json`), contenu = readFileSync(chemin, 'utf8')
    unlinkSync(chemin)
    const entree = store.journalCorpusLister()[0]
    expect(entree.etat).toBe('bloquee')
    expect(store.journalCorpusAnnuler(entree.id)).toMatchObject({ ok: false, temporaire: true })
    writeFileSync(chemin, contenu)
    expect(store.journalCorpusLister()[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(entree.id).ok).toBe(true)
    expect(store.notesInventaire().notes[0].titre).toBe('État A')
  })

  test('refuse une modification des références avant toute lecture ou écriture des fichiers', () => {
    const { dir, store } = preparer()
    const { entretienId } = ajouterNote(store)
    const vue = store.notesInventaire().notes[0]
    const chemin = join(dir, 'entretiens', `${entretienId}.json`)
    const avant = readFileSync(chemin, 'utf8')
    const lecture = vi.spyOn(store, 'ouvrir')
    const commande = { type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: { ...champsNote(vue.attendu), participationIds: ['identite-corpus'] } }
    expect(() => store.notesCommander(commande as unknown as CommandeNotes, true)).toThrow('demande de modification des notes')
    expect(lecture).not.toHaveBeenCalled()
    expect(readFileSync(chemin, 'utf8')).toBe(avant)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('modifie atomiquement les champs autorisés et ignore une validation sans changement', () => {
    const { dir, store } = preparer()
    const { entretienId } = ajouterNote(store)
    const corpusAvant = readFileSync(join(dir, 'corpus.crp'), 'utf8')
    const vueAvant = store.notesInventaire().notes[0]
    const enregistrer = vi.spyOn(JournalCorpus.prototype, 'enregistrer')

    store.notesCommander({
      type: 'modifier',
      entretienId,
      noteId: vueAvant.id,
      attendu: vueAvant.attendu,
      champs: champsNote(vueAvant.attendu, { titre: 'État B', corps: '<mark>Corps B</mark>' }),
    }, true)

    const lecture = store.lireEntretien(entretienId)
    if (!lecture.ok) throw new Error('Entretien de test indisponible')
    expect(lecture.data.notes?.[0]).toMatchObject({
      titre: 'État B',
      corps: '<mark>Corps B</mark>',
      participationIds: vueAvant.attendu.participationIds,
      rang: 0,
    })
    expect(lecture.data.notes?.[0].modifieLe).toBeTruthy()
    expect(lecture.data.notes?.[0]).not.toHaveProperty('locuteurIds')
    const inverse = enregistrer.mock.calls[0][2]
    expect(inverse).toMatchObject({ type: 'noteModifier', avant: { participationIds: vueAvant.attendu.participationIds }, apres: { participationIds: vueAvant.attendu.participationIds } })
    if (inverse.type !== 'noteModifier') throw new Error('Inverse de note attendu')
    expect(inverse.avant).not.toHaveProperty('locuteurIds')
    expect(inverse.apres).not.toHaveProperty('locuteurIds')
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(corpusAvant)
    expect(store.journalCorpusLister()).toHaveLength(1)

    const vueApres = store.notesInventaire().notes[0]
    const lastModified = lecture.data.lastModified
    store.notesCommander({
      type: 'modifier',
      entretienId,
      noteId: vueApres.id,
      attendu: vueApres.attendu,
      champs: champsNote(vueApres.attendu),
    }, true)
    const relue = store.lireEntretien(entretienId)
    expect(relue.ok && relue.data.lastModified).toBe(lastModified)
    expect(store.journalCorpusLister()).toHaveLength(1)
  })

  test('refuse un brouillon devenu obsolète sans écrire', () => {
    const { store } = preparer()
    const { entretienId } = ajouterNote(store)
    const ancienne = store.notesInventaire().notes[0]
    store.notesCommander({
      type: 'modifier', entretienId, noteId: ancienne.id, attendu: ancienne.attendu,
      champs: champsNote(ancienne.attendu, { titre: 'Modification concurrente' }),
    })

    expect(() => store.notesCommander({
      type: 'modifier', entretienId, noteId: ancienne.id, attendu: ancienne.attendu,
      champs: champsNote(ancienne.attendu, { titre: 'Brouillon obsolète' }),
    }, true)).toThrow('Cette note a changé')
    expect(() => store.notesCommander({
      type: 'supprimer', entretienId, noteId: ancienne.id, attendu: ancienne.attendu,
    }, true)).toThrow('Cette note a changé')
    expect(store.notesInventaire().notes[0].titre).toBe('Modification concurrente')
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('annule successivement deux modifications de la même note', () => {
    const { store } = preparer()
    const { entretienId } = ajouterNote(store)
    let vue = store.notesInventaire().notes[0]
    store.notesCommander({
      type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: champsNote(vue.attendu, { titre: 'État B' }),
    }, true)
    vue = store.notesInventaire().notes[0]
    store.notesCommander({
      type: 'modifier', entretienId, noteId: vue.id, attendu: vue.attendu,
      champs: champsNote(vue.attendu, { titre: 'État C' }),
    }, true)

    let journal = store.journalCorpusLister()
    expect(journal.map((entree) => entree.etat)).toEqual(['annulable', 'inapplicable'])
    expect(store.journalCorpusAnnuler(journal[0].id)).toEqual({
      ok: true,
      impact: { corpus: false, entretiens: [entretienId], projections: ['notes', "locuteurs"] },
    })
    expect(store.notesInventaire().notes[0].titre).toBe('État B')
    journal = store.journalCorpusLister()
    expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.notesInventaire().notes[0].titre).toBe('État A')
  })

  test('supprime une note puis la restaure exactement à son rang', () => {
    const { store } = preparer()
    const reference = ajouterNote(store).note.participationIds!
    const modele: Note = {
      id: 'note-b',
      categorieId: 'ncat_resume',
      titre: 'Note centrale',
      date: '2025-01-02',
      statut: 'prive',
      corps: '<mark data-liens="commentaire-1">Corps exact</mark>',
      participationIds: reference,
      rang: 1,
      creeLe: '2025-01-01T10:00:00.000Z',
      modifieLe: '2025-01-03T10:00:00.000Z',
    }
    const entretienId = remplacerNotes(store, [
      { ...modele, id: 'note-a', titre: 'Avant', rang: 0 },
      modele,
      { ...modele, id: 'note-c', titre: 'Après', rang: 2 },
    ])
    const vue = store.notesInventaire().notes.find((note) => note.id === modele.id)!

    expect(store.notesCommander({
      type: 'supprimer', entretienId, noteId: vue.id, attendu: vue.attendu,
    }, true)).toBeNull()
    expect(store.notesInventaire().notes.map((note) => [note.id, note.rang])).toEqual([
      ['note-a', 0], ['note-c', 1],
    ])
    const entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ libelle: 'Note supprimée : « Note centrale »', etat: 'annulable' })
    expect(store.journalCorpusAnnuler(entree.id)).toEqual({
      ok: true,
      impact: { corpus: false, entretiens: [entretienId], projections: ['notes', "locuteurs"] },
    })

    const lecture = store.lireEntretien(entretienId)
    if (!lecture.ok) throw new Error('Entretien de test indisponible')
    expect(lecture.data.notes?.map((note) => note.id)).toEqual(['note-a', 'note-b', 'note-c'])
    expect(lecture.data.notes?.map((note) => note.rang)).toEqual([0, 1, 2])
    expect(lecture.data.notes?.[1]).toEqual(modele)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('garde un instantané natif et ne restaure pas une note vers une participation disparue', () => {
    const { dir, store } = preparer()
    const { entretienId, note } = ajouterNote(store)
    const enregistrer = vi.spyOn(JournalCorpus.prototype, 'enregistrer')
    const vue = store.notesInventaire().notes[0]
    store.notesCommander({ type: 'supprimer', entretienId, noteId: note.id, attendu: vue.attendu }, true)
    expect(store.journalCorpusLister()[0]).toMatchObject({ etat: 'annulable' })
    const inverse = enregistrer.mock.calls[0][2]
    expect(inverse).toMatchObject({ type: 'noteSupprimer', note: { participationIds: note.participationIds } })
    expect(inverse.type === 'noteSupprimer' && inverse.note).not.toHaveProperty('locuteurIds')

    const lecture = store.lireEntretien(entretienId)
    if (!lecture.ok) throw new Error('Entretien de test indisponible')
    lecture.data.participations = lecture.data.participations.filter((p) => !note.participationIds!.includes(p.id!))
    const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
    store.ecrireEntretien(entretienId, payload)
    const chemin = join(dir, 'entretiens', `${entretienId}.json`)
    const avant = readFileSync(chemin, 'utf8')
    const entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ etat: 'inapplicable' })
    expect(store.journalCorpusAnnuler(entree.id)).toMatchObject({ ok: false, temporaire: false })
    expect(readFileSync(chemin, 'utf8')).toBe(avant)
  })

  test('refuse d’annuler deux suppressions dans un ordre incompatible', () => {
    const { store } = preparer()
    const modele: Note = {
      id: 'note-a',
      categorieId: 'ncat_resume',
      titre: 'A',
      date: null,
      statut: 'public',
      corps: 'Corps',
      participationIds: [],
      rang: 0,
      creeLe: '2025-01-01T10:00:00.000Z',
      modifieLe: null,
    }
    const entretienId = remplacerNotes(store, [
      modele,
      { ...modele, id: 'note-b', titre: 'B', rang: 1 },
      { ...modele, id: 'note-c', titre: 'C', rang: 2 },
    ])
    let vue = store.notesInventaire().notes.find((note) => note.id === 'note-b')!
    store.notesCommander({
      type: 'supprimer', entretienId, noteId: vue.id, attendu: vue.attendu,
    }, true)
    vue = store.notesInventaire().notes.find((note) => note.id === 'note-c')!
    store.notesCommander({
      type: 'supprimer', entretienId, noteId: vue.id, attendu: vue.attendu,
    }, true)

    let journal = store.journalCorpusLister()
    expect(journal.map((entree) => entree.etat)).toEqual(['annulable', 'inapplicable'])
    expect(store.journalCorpusAnnuler(journal[1].id)).toMatchObject({ ok: false, temporaire: false })
    expect(store.notesInventaire().notes.map((note) => note.id)).toEqual(['note-a'])

    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    journal = store.journalCorpusLister()
    expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.notesInventaire().notes.map((note) => note.id)).toEqual(['note-a', 'note-b', 'note-c'])
  })
})
