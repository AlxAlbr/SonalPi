import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { JournalCorpus, type InverseJournalCorpus } from '../src/main/journalCorpus'
import { creerLocuteurFixture, installerIdentitesFixture } from './fixtures/identitesLocuteurs'
import type { ImpactJournalCorpus } from '../src/shared/corpus/journal'
import { ecrireSeedDemo } from './seedDemo'
import type { ChampsNote, CommandeNotes } from '../src/shared/corpus/notes'
import type { EntretienFichier, Note } from '../src/shared/format'

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

function entretien(nom: string): EntretienFichier {
  return {
    formatVersion: 10,
    lastModified: '',
    corpsTexte: {},
    annotations: [],
    ancres: [],
    meta: { valeursGen: {}, audioRef: null },
    participations: [{ id: 'loc-source', index: 0, nom, valeursLoc: {}, locuteurRef: null }],
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
        "locuteurs",
        { type: 'personneRenommer', personneId: 'p1', avant: 'A', apres: 'B' },
        { corpus: true, entretiens: [], projections: ["locuteurs"] },
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
    id: 'note-corpus-test',
    categorieId: 'ncat_resume',
    titre: 'État A',
    date: '2025-01-02',
    statut: 'public',
    corps: 'Corps A',
    participationIds: [lecture.data.participations[0]?.id ?? 'loc-absent'],
    rang: 0,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
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

type AncienInverseLocuteur = Extract<InverseJournalCorpus, { type: 'personneRenommer' | 'personneLier' | 'personneRefus' }>

/** Installe un ancien inverse pour tester sa lecture sans recréer sa commande d’origine. */
function ancienInverse(store: CorpusStore, inverse: AncienInverseLocuteur) {
  const journal = Reflect.get(store, 'journalCorpus') as JournalCorpus
  const impact: ImpactJournalCorpus = inverse.type === 'personneRenommer'
    ? { corpus: true, entretiens: [], projections: ['locuteurs'] }
    : { corpus: false, entretiens: [inverse.entretienId], projections: inverse.type === 'personneLier' ? ['locuteurs', 'notes'] : ['locuteurs'] }
  journal.enregistrer('Action antérieure', 'locuteurs', inverse, impact)
}

describe('Journal du corpus — lecture des anciens inverses de locuteurs', () => {
  test('annule deux renommages successifs sans changer le format des inverses', () => {
    const { dir, store } = preparer(), id = creerLocuteurFixture(dir, 'Marie D.')
    ancienInverse(store, { type: 'personneRenommer', personneId: id, avant: 'Marie', apres: 'Maria' })
    ancienInverse(store, { type: 'personneRenommer', personneId: id, avant: 'Maria', apres: 'Marie D.' })
    let journal = store.journalCorpusLister()
    expect(journal.map((e) => e.etat)).toEqual(['annulable', 'inapplicable'])
    expect(store.journalCorpusAnnuler(journal[0].id)).toEqual({ ok: true, impact: { corpus: true, entretiens: [], projections: ['locuteurs'] } })
    journal = store.journalCorpusLister()
    expect(journal).toHaveLength(1); expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.ouvrir().locuteurs[id].nom).toBe('Marie')
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('restaure exactement les associations et leur marqueur sans écraser une autre saisie', () => {
    const { dir, store } = preparer(), id = creerLocuteurFixture(dir, 'Marie')
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien('Mme Marie'))
    const reference = { entretienId: autre.id, participationId: 'loc-source' }
    installerIdentitesFixture(dir, { associations: [{ ...reference, locuteurRef: id }] })
    ancienInverse(store, { type: 'personneLier', entretienId: autre.id, locuteurId: 'loc-source', avant: { locuteurRef: null }, apres: { locuteurRef: id } })
    const courant = store.lireEntretien(autre.id)
    if (!courant.ok) throw new Error('Entretien indisponible')
    courant.data.meta.valeursGen.sansRapport = 'modalite'; store.ecrireEntretien(autre.id, courant.data)
    expect(store.journalCorpusAnnuler(store.journalCorpusLister()[0].id).ok).toBe(true)
    const apres = store.lireEntretien(autre.id)
    expect(apres.ok && apres.data.participations[0]).toMatchObject({ locuteurRef: null })
    expect(apres.ok && apres.data.participations[0].associationRetiree).toBeUndefined()
    expect(apres.ok && apres.data.meta.valeursGen.sansRapport).toBe('modalite')
    installerIdentitesFixture(dir, { associations: [{ ...reference, locuteurRef: null }] })
    ancienInverse(store, { type: 'personneLier', entretienId: autre.id, locuteurId: 'loc-source', avant: { locuteurRef: id }, apres: { locuteurRef: null, associationRetiree: true } })
    expect(store.journalCorpusAnnuler(store.journalCorpusLister()[0].id).ok).toBe(true)
    const retabli = store.lireEntretien(autre.id)
    expect(retabli.ok && retabli.data.participations[0].locuteurRef).toBe(id)
    expect(retabli.ok && retabli.data.participations[0].associationRetiree).toBeUndefined()
  })

  test('reste en mémoire et disparaît avec l’instance du corpus', () => {
    const { dir, store } = preparer(), id = creerLocuteurFixture(dir, 'Maria')
    ancienInverse(store, { type: 'personneRenommer', personneId: id, avant: 'Marie', apres: 'Maria' })
    expect(store.journalCorpusLister()).toHaveLength(1)
    expect(new CorpusStore(dir).journalCorpusLister()).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).not.toHaveProperty('journal')
  })

  test('grise une entrée si sa cible a changé et ne l’écrase pas', () => {
    const { dir, store } = preparer(), id = creerLocuteurFixture(dir, 'Maria')
    ancienInverse(store, { type: 'personneRenommer', personneId: id, avant: 'Marie', apres: 'Maria' })
    installerIdentitesFixture(dir, { locuteurs: [{ id, nom: 'Modification extérieure' }] })
    const entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ etat: 'inapplicable', raison: 'La personne a été modifiée depuis cette action.' })
    expect(store.journalCorpusAnnuler(entree.id)).toEqual({ ok: false, raison: 'La personne a été modifiée depuis cette action.', temporaire: false })
    expect(store.ouvrir().locuteurs[id].nom).toBe('Modification extérieure')
  })

  test('relit deux inverses de refus successifs avec leurs références contextualisées', () => {
    const { store } = preparer()
    const cible = store.inventaireIdentitesLocuteurs().participations.find((p) => p.nom === 'Karine')!
    const autre = store.creerEntretienVide('Autre entretien'); store.ecrireEntretien(autre.id, entretien(cible.nom))
    const reference = { entretienId: cible.entretienId, locuteurId: cible.participationId }
    const refus = { type: 'participation' as const, entretienId: autre.id, participationId: 'loc-source' }
    const avant = { rapprochementsRefuses: [] }, apres = { rapprochementsRefuses: [refus] }
    const data = store.lireEntretien(cible.entretienId)
    if (!data.ok) throw new Error('Entretien indisponible')
    data.data.participations.find((p) => p.id === cible.participationId)!.rapprochementsRefuses = []
    store.ecrireEntretien(cible.entretienId, data.data)
    ancienInverse(store, { type: 'personneRefus', ...reference, avant, apres })
    ancienInverse(store, { type: 'personneRefus', ...reference, avant: apres, apres: avant })
    let journal = store.journalCorpusLister()
    expect(journal.map((e) => e.etat)).toEqual(['annulable', 'inapplicable'])
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    journal = store.journalCorpusLister(); expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.inventaireIdentitesLocuteurs().participations.find((p) => p.participationId === cible.participationId)?.rapprochementsRefuses).toEqual([])
  })
})
