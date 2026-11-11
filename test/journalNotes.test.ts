// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import type { Entretien } from '../src/shared/entretien/entretien'
import type { Locuteur, Note } from '../src/shared/format'
import { annuler, appliquerInverse, estApplicable, type CtxInverse, type Inverse } from '../src/shared/entretien/journal'
import { useJournalEntretien } from '../src/renderer/composables/entretien/useJournalEntretien'
import { useNotesEntretien } from '../src/renderer/composables/entretien/useNotesEntretien'

function note(id: string, rang = 0): Note {
  return {
    id, rang, titre: id, categorieId: 'ncat_generale', date: '2026-09-01', statut: 'prive',
    corps: '<p>Un <mark>passage important</mark> et <em data-liens="c1">un lien</em>.</p>',
    locuteurIds: ['l1'], creeLe: '2026-09-01T10:00:00Z', modifieLe: null,
  }
}

function contexte(notes: Note[]): CtxInverse {
  return {
    entretien: { annotations: [], ancres: [], reperesPassages: [] },
    locuteurs: [{ id: 'l1', index: 1, nom: 'Karine', valeursLoc: {}, personneRef: null }],
    valeursGen: {}, notes,
  }
}

describe('journal des notes — annulations', () => {
  test('annuler une création retire seulement la note visée et renumérote les rangs', () => {
    const creee = note('nouvelle', 0)
    const ctx = contexte([creee, note('autre', 1)])
    const inverse: Inverse = { type: 'retirerNote', note: { ...creee, locuteurIds: ['l1'] } }
    expect(appliquerInverse(inverse, ctx)).toBe(true)
    expect(ctx.notes!.map((n) => [n.id, n.rang])).toEqual([['autre', 0]])
    expect(estApplicable(inverse, ctx)).toBe(false)
  })

  test.each(['titre', 'corps', 'statut', 'categorieId', 'date', 'locuteurIds'] as const)(
    'une modification de %s empêche de retirer la note par annulation de sa création', (champ) => {
      const initiale = note('n1')
      const modifiee = { ...initiale, [champ]: champ === 'locuteurIds' ? [] : 'modifié' } as Note
      const ctx = contexte([modifiee])
      expect(appliquerInverse({ type: 'retirerNote', note: initiale }, ctx)).toBe(false)
      expect(ctx.notes).toEqual([modifiee])
    },
  )

  test('annuler une suppression restaure toute la note à sa place sans partager son instantané', () => {
    const supprimee = note('milieu', 1)
    const ctx = contexte([note('fin', 1), note('debut', 0)])
    const inverse: Inverse = {
      type: 'restaurerNote', note: supprimee, position: 1, ordreApres: ['debut', 'fin'],
    }
    expect(appliquerInverse(inverse, ctx)).toBe(true)
    expect(ctx.notes!.map((n) => [n.id, n.rang])).toEqual([['debut', 0], ['milieu', 1], ['fin', 2]])
    expect(ctx.notes![1]).toEqual(supprimee)
    ctx.notes![1]!.locuteurIds!.push('l2')
    expect(supprimee.locuteurIds).toEqual(['l1'])
    expect(appliquerInverse(inverse, ctx)).toBe(false)
  })

  test('un ordre changé, un doublon ou un locuteur disparu interdit la restauration', () => {
    const inverse: Inverse = {
      type: 'restaurerNote', note: note('milieu', 1), position: 1, ordreApres: ['debut', 'fin'],
    }
    const contextes = [
      contexte([note('fin', 0), note('debut', 1)]),
      contexte([note('debut', 0), note('milieu', 1), note('fin', 2)]),
      { ...contexte([note('debut', 0), note('fin', 1)]), locuteurs: [] },
      { ...contexte([]), notes: undefined },
    ]
    for (const ctx of contextes) {
      const avant = JSON.stringify(ctx)
      expect(appliquerInverse(inverse, ctx)).toBe(false)
      expect(JSON.stringify(ctx)).toBe(avant)
    }
  })
})

function preparer() {
  const scope = effectScope()
  const resultat = scope.run(() => {
    const entretien = reactive<Entretien>({ annotations: [], ancres: [], reperesPassages: [] })
    const locuteurs = ref<Locuteur[]>(contexte([]).locuteurs)
    const sauvegarder = vi.fn()
    const notes = useNotesEntretien({
      entretien, locuteurs, lireEditeur: () => null,
      nomCategorieNote: () => 'générale', categorieNoteDefaut: () => 'ncat_generale',
      planifierSauvegarde: sauvegarder,
      enregistrerAction: (libelle, inverse) => journal.enregistrerAction(libelle, inverse),
    })
    const journal = useJournalEntretien({
      entretien, locuteurs, notes: notes.notes, lireEditeur: () => null, lireValeursGen: () => ({}),
      effetsAnnulation: {
        rafraichirProjections: vi.fn(), rafraichirDecorations: vi.fn(), rafraichirGouttiere: vi.fn(),
        rafraichirCompteursAnonymisation: vi.fn(), rafraichirReperage: vi.fn(),
        planifierSauvegarde: sauvegarder,
      },
    })
    return { notes, journal, sauvegarder }
  })!
  return { ...resultat, scope }
}

async function creer(outils: ReturnType<typeof preparer>, titre = 'Nouvelle note') {
  outils.notes.ajouterNote()
  Object.assign(outils.notes.brouillonNote.value!, { titre, corps: '<p>Texte de la note</p>', locuteurIds: ['l1'] })
  outils.notes.validerNote()
  await nextTick()
}

describe('journal des notes — saisie et sauvegarde', () => {
  test('le brouillon ne compte pas ; créer, supprimer puis annuler conserve le contenu et sauvegarde', async () => {
    const outils = preparer()
    try {
      outils.notes.ajouterNote()
      await nextTick()
      expect(outils.journal.entreesJournal.value).toEqual([])
      await creer(outils)
      const avant = JSON.parse(JSON.stringify(outils.notes.notes.value[0]))
      const creation = outils.journal.entreesJournal.value[0]!
      expect(creation.libelle).toBe('Note créée : Nouvelle note')
      expect(creation.annulable).toBe(true)
      outils.notes.supprimerNote(avant.id)
      await nextTick()
      expect(outils.journal.entreesJournal.value.map((e) => e.annulable)).toEqual([true, false])
      expect(outils.journal.entreesJournal.value[0]!.libelle).toBe('Note supprimée : Nouvelle note')
      outils.journal.annulerEntree(outils.journal.entreesJournal.value[0]!.id)
      await nextTick()
      expect(outils.notes.notes.value).toEqual([avant])
      expect(outils.journal.entreesJournal.value[0]!.annulable).toBe(true)
      outils.journal.annulerEntree(creation.id)
      expect(outils.notes.notes.value).toEqual([])
      expect(outils.journal.entreesJournal.value).toEqual([])
      expect(outils.sauvegarder).toHaveBeenCalledTimes(4)
    } finally {
      outils.scope.stop()
    }
  })

  test('une note modifiée, supprimée puis restaurée garde sa dernière version', async () => {
    const outils = preparer()
    try {
      await creer(outils, '')
      expect(outils.journal.entreesJournal.value[0]!.libelle).toBe('Note créée : (sans titre)')
      const id = outils.notes.notes.value[0]!.id
      outils.notes.ecrireCorpsNote(id, '<p>Version modifiée</p>')
      await nextTick()
      expect(outils.journal.entreesJournal.value[0]!.annulable).toBe(false)
      outils.notes.editerNote(id)
      outils.notes.supprimerNote(id)
      expect(outils.notes.brouillonEditionNote.value).toBeNull()
      await nextTick()
      outils.journal.annulerEntree(outils.journal.entreesJournal.value[0]!.id)
      await nextTick()
      expect(outils.notes.notes.value[0]!.corps).toBe('Version modifiée')
      expect(outils.journal.entreesJournal.value[0]!.annulable).toBe(false)
      expect(annuler(outils.journal.journal, outils.journal.entreesJournal.value[0]!.id,
        contexte(outils.notes.notes.value))).toBe(false)
    } finally {
      outils.scope.stop()
    }
  })

  test('deux suppressions successives peuvent être annulées dans l’ordre inverse sans doublon', async () => {
    const outils = preparer()
    try {
      outils.notes.charger([note('a', 0), note('b', 1), note('c', 2)])
      outils.notes.supprimerNote('b')
      await nextTick()
      const suppressionB = outils.journal.entreesJournal.value[0]!.id
      outils.notes.supprimerNote('a')
      await nextTick()
      expect(outils.journal.entreesJournal.value.map((e) => e.annulable)).toEqual([true, false])
      outils.journal.annulerEntree(outils.journal.entreesJournal.value[0]!.id)
      await nextTick()
      expect(outils.journal.entreesJournal.value[0]!.annulable).toBe(true)
      outils.journal.annulerEntree(suppressionB)
      outils.journal.annulerEntree(suppressionB)
      await nextTick()
      expect(outils.notes.notes.value.map((n) => [n.id, n.rang])).toEqual([['a', 0], ['b', 1], ['c', 2]])
      expect(outils.journal.entreesJournal.value).toEqual([])
    } finally {
      outils.scope.stop()
    }
  })

  test('chargement, édition et suppression inexistante ne créent pas de nouvelles entrées', async () => {
    const outils = preparer()
    try {
      outils.notes.charger([note('deja-la')])
      outils.notes.editerNote('deja-la')
      outils.notes.brouillonEditionNote.value!.titre = 'Nouveau titre'
      outils.notes.validerEditionNote()
      outils.notes.supprimerNote('absente')
      await nextTick()
      expect(outils.journal.entreesJournal.value).toEqual([])
      await creer(outils)
      outils.notes.reinitialiser()
      outils.journal.reinitialiserJournal()
      await nextTick()
      expect(outils.journal.entreesJournal.value).toEqual([])
    } finally {
      outils.scope.stop()
    }
  })
})
