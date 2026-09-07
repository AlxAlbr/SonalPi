import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'
import { creerPersonne, inventorierPersonnes, lierLocuteur, modifierPersonne, supprimerPersonneVide } from '../src/shared/corpus/personnes'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import type { EntretienFichier } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function preparer() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-personnes-'))
  dossiers.push(dir)
  ecrireSeedDemo(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  return { dir, store }
}
function entretien(): EntretienFichier {
  return {
    formatVersion: 3, lastModified: '', corpsTexte: {}, annotations: [], ancres: [],
    meta: { valeursGen: {}, audioRef: null },
    locuteurs: [
      { id: 'l1', index: 0, nom: 'Marie', valeursLoc: { age: '29' }, personneRef: null },
      { id: 'l2', index: 1, nom: 'Paul', valeursLoc: {}, personneRef: null },
    ],
  }
}

describe('Personnes — règles de domaine', () => {
  test('les homonymes ont des identités distinctes et les noms vides sont refusés', () => {
    const c = squeletteCorpus()
    creerPersonne(c, 'p1', ' Marie ')
    creerPersonne(c, 'p2', 'Marie')
    expect(Object.values(c.personnes).map((p) => p.nom)).toEqual(['Marie', 'Marie'])
    expect(() => creerPersonne(c, 'p3', ' ')).toThrow('vide')
    expect(() => creerPersonne(c, 'p1', 'Paul')).toThrow('Identifiant')
  })

  test('liaison, déplacement et déliaison préservent les noms locaux et les valeurs', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie Dupont'); creerPersonne(c, 'p2', 'Autre personne')
    lierLocuteur(c, e, 'l1', 'p1')
    modifierPersonne(c, 'p1', 'Marie D.', 'Note')
    expect(e.locuteurs[0]).toMatchObject({ nom: 'Marie', valeursLoc: { age: '29' }, personneRef: 'p1' })
    lierLocuteur(c, e, 'l1', 'p2')
    expect(e.locuteurs[0].personneRef).toBe('p2')
    lierLocuteur(c, e, 'l1', null)
    expect(e.locuteurs[0].personneRef).toBeNull()
    expect(c.personnes.p1).toEqual({ id: 'p1', nom: 'Marie D.', note: 'Note' })
  })

  test('refuse les références absentes et deux locuteurs du même entretien', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie')
    expect(() => lierLocuteur(c, e, 'l1', 'absent')).toThrow('n’existe plus')
    expect(() => lierLocuteur(c, e, 'absent', 'p1')).toThrow('locuteur')
    lierLocuteur(c, e, 'l1', 'p1')
    expect(() => lierLocuteur(c, e, 'l2', 'p1')).toThrow('déjà un locuteur')
    expect(e.locuteurs[1].personneRef).toBeNull()
  })

  test('une référence pendante est visible et peut être déliée', () => {
    const c = squeletteCorpus(); const e = entretien()
    e.locuteurs[0].personneRef = 'absente'
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(vue.locuteurs[0].personneRef).toBe('absente')
    expect(vue.locuteurs[0]).not.toHaveProperty('corpsTexte')
    lierLocuteur(c, e, 'l1', null)
    expect(e.locuteurs[0].personneRef).toBeNull()
  })

  test('suppression seulement après déliaison et inventaire complet', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie'); lierLocuteur(c, e, 'l1', 'p1')
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(() => supprimerPersonneVide(c, vue, 'p1')).toThrow('Déliez')
    vue.locuteurs = []
    vue.indisponibles.push({ id: 'e1', titre: 'A', raison: 'absent' })
    expect(() => supprimerPersonneVide(c, vue, 'p1')).toThrow('illisibles')
    vue.indisponibles = []
    supprimerPersonneVide(c, vue, 'p1')
    expect(c.personnes).toEqual({})
  })
})

describe('Personnes — stockage local', () => {
  test('la lecture complète les ids en mémoire sans écrire les fichiers', () => {
    const { dir, store } = preparer()
    const avant = readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')
    const inventaire = store.personnesInventaire()
    expect(inventaire.locuteurs.every((l) => l.locuteurId.startsWith('loc-'))).toBe(true)
    expect(new CorpusStore(dir).personnesInventaire()).toEqual(inventaire)
    expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe(avant)
  })

  test('création liée, renommage, second entretien et déliaison persistent', () => {
    const { store, dir } = preparer()
    const karine = store.personnesInventaire().locuteurs.find((l) => l.nom === 'Karine')!
    const id = store.personnesCommander({ type: 'creer', entretienId: 'e1', locuteurId: karine.locuteurId, nom: 'Karine D.' })!
    const lecture = store.lireEntretien('e1')
    expect(lecture.ok).toBe(true)
    if (!lecture.ok) return
    expect(lecture.data.locuteurs.find((l) => l.nom === 'Karine')?.personneRef).toBe(id)
    store.personnesCommander({ type: 'modifier', personneId: id, nom: 'K. Dupont', note: 'Note transverse' })
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.locuteurs[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'l1', personneId: id })
    const inventaire = new CorpusStore(dir).personnesInventaire()
    expect(inventaire.personnes).toEqual([{ id, nom: 'K. Dupont', note: 'Note transverse' }])
    expect(inventaire.locuteurs.filter((l) => l.personneRef === id).map((l) => l.nom)).toEqual(['Karine', 'Mme Dupont'])
    expect(() => store.personnesCommander({ type: 'supprimer', personneId: id })).toThrow('Déliez')
    store.personnesCommander({ type: 'lier', entretienId: 'e1', locuteurId: karine.locuteurId, personneId: null })
    expect(store.personnesInventaire().locuteurs.find((l) => l.locuteurId === karine.locuteurId)?.personneRef).toBeNull()
  })

  test('un corpus ancien sans personnes reçoit un répertoire vide sans réécriture', () => {
    const { dir, store } = preparer()
    const fichier = join(dir, 'corpus.json')
    const c = JSON.parse(readFileSync(fichier, 'utf8'))
    delete c.personnes
    const contenu = JSON.stringify(c)
    writeFileSync(fichier, contenu)
    expect(store.ouvrir().personnes).toEqual({})
    expect(store.personnesInventaire().personnes).toEqual([])
    expect(readFileSync(fichier, 'utf8')).toBe(contenu)
  })

  test.each(['absent', 'invalide', 'version'])('signale un entretien %s et bloque la suppression', (mode) => {
    const { dir, store } = preparer()
    const l = store.personnesInventaire().locuteurs[0]
    const id = store.personnesCommander({ type: 'creer', entretienId: 'e1', locuteurId: l.locuteurId, nom: 'Personne' })!
    const fichier = join(dir, 'entretiens/e1.json')
    if (mode === 'absent') unlinkSync(fichier)
    if (mode === 'invalide') writeFileSync(fichier, '{')
    if (mode === 'version') writeFileSync(fichier, JSON.stringify({ ...entretien(), formatVersion: 999 }))
    expect(store.personnesInventaire().indisponibles).toHaveLength(1)
    expect(() => store.personnesCommander({ type: 'supprimer', personneId: id })).toThrow('illisibles')
  })

  test('une erreur de lien après création conserve une fiche retrouvable et explique l’échec', () => {
    const { store } = preparer()
    const l = store.personnesInventaire().locuteurs[0]
    vi.spyOn(store, 'ecrireEntretien').mockImplementation(() => { throw new Error('Disque plein') })
    expect(() => store.personnesCommander({ type: 'creer', entretienId: 'e1', locuteurId: l.locuteurId, nom: 'Personne' })).toThrow('le lien a échoué')
    expect(store.personnesInventaire().personnes).toHaveLength(1)
    expect(store.personnesInventaire().locuteurs.every((loc) => !loc.personneRef)).toBe(true)
  })

  test('les commandes sont refusées en lecture seule mais l’inventaire reste accessible', () => {
    const { store } = preparer()
    store.lectureSeule = true
    const l = store.personnesInventaire().locuteurs[0]
    expect(() => store.personnesCommander({ type: 'creer', entretienId: 'e1', locuteurId: l.locuteurId, nom: 'Personne' })).toThrow()
    expect(store.personnesInventaire().personnes).toEqual([])
  })
})
