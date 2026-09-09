import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { JournalCorpus } from '../src/main/journalCorpus'
import { ecrireSeedDemo } from './seedDemo'
import type { EntretienFichier } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => {
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function preparer() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-corpus-'))
  dossiers.push(dir)
  ecrireSeedDemo(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  return { dir, store }
}

function entretien(nom: string): EntretienFichier {
  return {
    formatVersion: 3,
    lastModified: '',
    corpsTexte: {},
    annotations: [],
    ancres: [],
    meta: { valeursGen: {}, audioRef: null },
    locuteurs: [{ id: 'loc-source', index: 0, nom, valeursLoc: {}, personneRef: null }],
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
        'personnes',
        { type: 'personneRenommer', personneId: 'p1', avant: 'A', apres: 'B' },
        { corpus: true, entretiens: [], projections: ['personnes'] },
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

describe('Journal du corpus — commandes Personnes', () => {
  test('annule deux renommages successifs sans écraser un état inattendu', () => {
    const { store } = preparer()
    const locuteur = store.personnesInventaire().locuteurs[0]
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: locuteur.entretienId,
      locuteurId: locuteur.locuteurId,
      nom: 'Marie',
    }, true)!
    expect(store.journalCorpusLister()).toEqual([])
    store.personnesCommander({ type: 'modifier', personneId, nom: 'Marie' }, true)
    expect(store.journalCorpusLister()).toEqual([])

    store.personnesCommander({ type: 'modifier', personneId, nom: 'Maria' }, true)
    store.personnesCommander({ type: 'modifier', personneId, nom: 'Marie D.' }, true)
    let journal = store.journalCorpusLister()
    expect(journal.map((entree) => entree.etat)).toEqual(['annulable', 'inapplicable'])

    expect(store.journalCorpusAnnuler(journal[0].id)).toEqual({
      ok: true,
      impact: { corpus: true, entretiens: [], projections: ['personnes'] },
    })
    journal = store.journalCorpusLister()
    expect(journal).toHaveLength(1)
    expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.personnesInventaire().personnes.find((personne) => personne.id === personneId)?.nom).toBe('Marie')

    store.personnesCommander({ type: 'modifier', personneId, nom: 'Marie externe' }, false)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('restaure exactement une liaison, une déliaison et le marqueur volontaire', () => {
    const { store } = preparer()
    const premier = store.personnesInventaire().locuteurs[0]
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: premier.entretienId,
      locuteurId: premier.locuteurId,
      nom: 'Marie',
    })!
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien('Mme Marie'))

    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'loc-source', personneId }, true)
    const modificationSansRapport = store.lireEntretien(autre.id)
    if (!modificationSansRapport.ok) throw new Error('Entretien indisponible')
    modificationSansRapport.data.meta.valeursGen.sansRapport = 'modalite'
    store.ecrireEntretien(autre.id, modificationSansRapport.data)
    let entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ etat: 'annulable' })
    expect(entree.libelle).toContain('associé')
    expect(store.journalCorpusAnnuler(entree.id).ok).toBe(true)
    let cible = store.personnesInventaire().locuteurs.find((locuteur) => locuteur.locuteurId === 'loc-source')!
    expect(cible.personneRef).toBeNull()
    const reluApresLiaison = store.lireEntretien(autre.id)
    expect(reluApresLiaison.ok && reluApresLiaison.data.locuteurs[0].personneDeliee).toBeUndefined()

    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'loc-source', personneId })
    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'loc-source', personneId: null }, true)
    entree = store.journalCorpusLister()[0]
    expect(entree.libelle).toContain('dissocié')
    expect(store.journalCorpusAnnuler(entree.id).ok).toBe(true)
    cible = store.personnesInventaire().locuteurs.find((locuteur) => locuteur.locuteurId === 'loc-source')!
    expect(cible.personneRef).toBe(personneId)
    const reluApresDeliaison = store.lireEntretien(autre.id)
    expect(reluApresDeliaison.ok && reluApresDeliaison.data.locuteurs[0].personneDeliee).toBeUndefined()
  })

  test('reste en mémoire et disparaît avec l’instance du corpus', () => {
    const { dir, store } = preparer()
    const locuteur = store.personnesInventaire().locuteurs[0]
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: locuteur.entretienId,
      locuteurId: locuteur.locuteurId,
      nom: 'Marie',
    })!
    store.personnesCommander({ type: 'modifier', personneId, nom: 'Maria' }, true)
    expect(store.journalCorpusLister()).toHaveLength(1)
    expect(new CorpusStore(dir).journalCorpusLister()).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))).not.toHaveProperty('journal')
  })

  test('grise une entrée si sa cible a changé et ne l’écrase pas', () => {
    const { store } = preparer()
    const locuteur = store.personnesInventaire().locuteurs[0]
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: locuteur.entretienId,
      locuteurId: locuteur.locuteurId,
      nom: 'Marie',
    })!
    store.personnesCommander({ type: 'modifier', personneId, nom: 'Maria' }, true)
    store.personnesCommander({ type: 'modifier', personneId, nom: 'Modification extérieure' })
    const entree = store.journalCorpusLister()[0]
    expect(entree).toMatchObject({ etat: 'inapplicable', raison: 'La personne a été modifiée depuis cette action.' })
    expect(store.journalCorpusAnnuler(entree.id)).toEqual({
      ok: false,
      raison: 'La personne a été modifiée depuis cette action.',
      temporaire: false,
    })
    expect(store.personnesInventaire().personnes[0].nom).toBe('Modification extérieure')
  })

  test('annule un refus simple mais ignore le refus composite qui crée une fiche', () => {
    const { store } = preparer()
    const cible = store.personnesInventaire().locuteurs.find((locuteur) => locuteur.nom === 'Karine')!
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: cible.entretienId,
      locuteurId: cible.locuteurId,
      nom: cible.nom,
    })!
    expect(personneId).toBeTruthy()
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien(cible.nom))

    store.personnesCommander({
      type: 'refuser',
      entretienId: cible.entretienId,
      locuteurId: cible.locuteurId,
      sourceEntretienId: autre.id,
      sourceLocuteurId: 'loc-source',
    }, true)
    let journal = store.journalCorpusLister()
    expect(journal[0].libelle).toContain('écarté')
    const refus = store.personnesInventaire().locuteurs
      .find((locuteur) => locuteur.locuteurId === cible.locuteurId)?.rapprochementsRefuses?.[0]
    expect(refus).toBeTruthy()
    store.personnesCommander({
      type: 'annulerRefus',
      entretienId: cible.entretienId,
      locuteurId: cible.locuteurId,
      cible: refus!,
    }, true)
    journal = store.journalCorpusLister()
    expect(journal.map((entree) => entree.etat)).toEqual(['annulable', 'inapplicable'])
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    journal = store.journalCorpusLister()
    expect(journal[0].etat).toBe('annulable')
    expect(store.journalCorpusAnnuler(journal[0].id).ok).toBe(true)
    expect(store.personnesInventaire().locuteurs.find((locuteur) => locuteur.locuteurId === cible.locuteurId)?.rapprochementsRefuses).toEqual([])

    store.personnesCommander({
      type: 'refuser',
      entretienId: autre.id,
      locuteurId: 'loc-source',
      sourceEntretienId: cible.entretienId,
      sourceLocuteurId: cible.locuteurId,
    }, true)
    expect(store.journalCorpusLister()).toEqual([])
  })
})
