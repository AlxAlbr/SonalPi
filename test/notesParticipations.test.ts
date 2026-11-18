import { describe, expect, test } from 'vitest'
import { etatNoteJournal, inventorierNotes, memeEtatNote, validerCommandeNotes } from '../src/shared/corpus/notes'
import { normaliserNotes, noteCreationInchangee, referencesNoteDisponibles, renumeroterRangs } from '../src/shared/entretien/notes'
import { lireNoteFormat9, normaliserNotesFormat9 } from '../src/shared/entretien/notesFormat9'
import type { Note } from '../src/shared/natif/format'
import { entretienCasNatif, idParticipationNative } from './fixtures/casNatifs'

const note = (): Note => entretienCasNatif().notes![0]
function modifier() {
  const n = note()
  return { type: 'modifier' as const, entretienId: 'e1', noteId: n.id, attendu: etatNoteJournal(n),
    champs: { categorieId: n.categorieId, titre: 'Nouveau titre', date: n.date, statut: n.statut, corps: n.corps } }
}

describe('notes et références de participations', () => {
  test('normalise les références locales sans remplacer les ids ou modifier la source', () => {
    const source = note()
    source.participationIds = [idParticipationNative, '', idParticipationNative, 'autre-local']
    const avant = structuredClone(source)
    const normalisee = normaliserNotes([source])[0]
    expect(normalisee).toEqual({ ...source, participationIds: [idParticipationNative, 'autre-local'] })
    expect(source).toEqual(avant)
    expect(renumeroterRangs([{ ...normalisee, rang: 42 }])[0]).toEqual({ ...normalisee, rang: 0 })
    expect(normalisee).not.toHaveProperty('locuteurIds')
  })

  test('projette les notes de même id dans leur entretien et résout les commentaires localement', () => {
    const a = entretienCasNatif(), b = entretienCasNatif()
    a.notes![0].corps = b.notes![0].corps = '<em data-liens="commentaire">Texte</em>'
    a.annotations = [{ id: 'commentaire', type: 'commentaire', from: 1, to: 4, auteur: 'A', texte: 'Local A' }]
    b.annotations = [{ id: 'commentaire', type: 'commentaire', from: 1, to: 4, auteur: 'B', texte: 'Local B' }]
    const avant = structuredClone([a, b])
    const vue = inventorierNotes([{ id: 'e1', titre: 'A', data: a }, { id: 'e2', titre: 'B', data: b }])
    expect(vue.notes.map((n) => [n.id, n.entretienId, n.attendu.participationIds])).toEqual([
      ['note', 'e1', [idParticipationNative]], ['note', 'e2', [idParticipationNative]],
    ])
    expect(vue.notes.map((n) => n.liensCommentaires[0].texte)).toEqual(['Local A', 'Local B'])
    expect(vue.notes[0].attendu).not.toHaveProperty('locuteurIds')
    expect([a, b]).toEqual(avant)
  })

  test('une modification des liens change l’état sémantique et invalide l’annulation de création', () => {
    const source = note(), autre = { ...note(), participationIds: ['autre-local'] }
    expect(memeEtatNote(etatNoteJournal(source), etatNoteJournal(autre))).toBe(false)
    expect(noteCreationInchangee(source, autre)).toBe(false)
    expect(noteCreationInchangee(source, { ...source, rang: 99, modifieLe: 'autre-date' })).toBe(true)
    expect(referencesNoteDisponibles(source, [{ id: idParticipationNative }])).toBe(true)
    expect(referencesNoteDisponibles(source, [{ id: 'identite-corpus' }])).toBe(false)
  })

  test('le pont conserve les champs du format 9, sans rechercher une identité commune', () => {
    const { participationIds, ...commun } = note()
    const ancienne = { ...commun, locuteurIds: participationIds }
    const avant = structuredClone(ancienne)
    expect(lireNoteFormat9(ancienne)).toEqual(note())
    expect(normaliserNotesFormat9([ancienne])[0]).toEqual(ancienne)
    expect(ancienne).toEqual(avant)
    expect(() => normaliserNotes([ancienne as unknown as Note])).toThrow('participations locales')
    expect(() => etatNoteJournal(ancienne as unknown as Note)).toThrow('participations locales')
    expect(() => lireNoteFormat9({ ...ancienne, participationIds } as typeof ancienne)).toThrow('compatible')
  })

  test('les instantanés sont indépendants des tableaux de la note', () => {
    const source = note(), etat = etatNoteJournal(source)
    etat.participationIds!.push('autre-local')
    expect(source.participationIds).toEqual([idParticipationNative])
  })

  test('accepte les deux commandes avec leurs références natives intactes', () => {
    const commande = modifier(), avant = structuredClone(commande)
    expect(() => validerCommandeNotes(commande)).not.toThrow()
    const { champs: _champs, ...suppression } = commande
    expect(() => validerCommandeNotes({ ...suppression, type: 'supprimer' })).not.toThrow()
    expect(commande).toEqual(avant)
  })

  test.each([
    () => ({ ...modifier(), attendu: { ...modifier().attendu, locuteurIds: [idParticipationNative] } }),
    () => ({ ...modifier(), champs: { ...modifier().champs, participationIds: ['identite-corpus'] } }),
    () => ({ ...modifier(), champs: { ...modifier().champs, locuteurIds: ['ancien-id'] } }),
    () => ({ ...modifier(), champs: { ...modifier().champs, id: 'autre-note' } }),
    () => ({ ...modifier(), attendu: { ...modifier().attendu, participationIds: [7] } }),
    () => ({ ...modifier(), attendu: { ...modifier().attendu, modifieLe: null } }),
    () => ({ ...modifier(), attendu: { ...modifier().attendu, id: 'autre-note' } }),
    () => ({ ...modifier(), entretienId: '' }),
    () => ({ ...modifier(), type: 'inconnue' }),
    () => ({ ...modifier(), champs: { ...modifier().champs, statut: 'autre' } }),
  ].map((preparer, numero) => ({ preparer, numero })))('refuse les changements de propriétaire et les anciens messages ($numero)', ({ preparer }) => {
    const commande = preparer(), avant = structuredClone(commande)
    expect(() => validerCommandeNotes(commande)).toThrow('demande de modification des notes')
    expect(commande).toEqual(avant)
  })
})
