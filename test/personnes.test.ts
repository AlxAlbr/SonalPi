import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'
import { creerPersonne, inventorierPersonnes, lierLocuteur, modifierPersonne, separerPersonne, supprimerPersonneVide } from '../src/shared/corpus/personnes'
import { peutCreerLocuteurAuNommage, suggestionsExactesLocuteurs } from "../src/shared/corpus/rapprochementsLocuteurs"
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
    formatVersion: 10, lastModified: '', corpsTexte: {}, annotations: [], ancres: [],
    meta: { valeursGen: {}, audioRef: null },
    participations: [
      { id: 'l1', index: 0, nom: 'Marie', valeursLoc: { age: '29' }, locuteurRef: null },
      { id: 'l2', index: 1, nom: 'Paul', valeursLoc: {}, locuteurRef: null },
    ],
  }
}

describe('Personnes — règles de domaine', () => {
  test('redirige et déduplique les règles de cas dans la fusion, sans perdre les filtres', () => {
    const { store } = preparer()
    const conserverId = store.personnesCommander({ type: 'creerDefinition', nom: 'Identité conservée' }) as string
    const absorberId = store.personnesCommander({ type: 'creerDefinition', nom: 'Identité absorbée' }) as string
    const date = '2026-09-01T10:00:00.000Z'
    store.casCommander({ type: 'creer', cas: {
      id: 'collectif', nom: 'Collectif', memo: 'Mémo conservé', creeLe: date, modifieLe: date,
      regles: [
        { type: "locuteur", locuteurId: conserverId, inclureEnqueteurs: false },
        { type: "locuteurs", membres: [{ locuteurId: absorberId, inclureEnqueteurs: true }] },
      ], rattachements: [],
    } })
    expect(() => store.personnesCommander({ type: 'supprimer', locuteurId: absorberId })).toThrow(/Collectif/)
    store.personnesCommander({ type: 'fusionner', conserverId, absorberId, attendu: JSON.stringify(store.personnesInventaire()) })
    const cas = store.ouvrir().cas?.collectif
    expect(cas).toMatchObject({ id: 'collectif', memo: 'Mémo conservé', creeLe: date, rattachements: [] })
    expect(cas?.regles).toEqual([{ type: "locuteurs", membres: [{ locuteurId: conserverId, inclureEnqueteurs: true }] }])
    expect(store.ouvrir().locuteurs[absorberId]).toBeUndefined()
    expect(() => store.personnesCommander({ type: 'supprimer', locuteurId: conserverId })).toThrow(/Collectif/)
  })

  test('rapproche deux entretiens avec reprise ponctuelle et refus révocable', () => {
    const { store } = preparer()
    const autre = store.creerEntretienVide('Deuxième entretien')
    store.ecrireEntretien(autre.id, entretien())
    const vue = store.personnesInventaire()
    const a = vue.participations.find((l) => l.nom === 'Karine')!
    const b = vue.participations.find((l) => l.entretienId !== a.entretienId)!
    expect(b).toBeDefined()
    const base = { entretienId: a.entretienId, participationId: a.participationId, sourceEntretienId: b.entretienId, sourceParticipationId: b.participationId }
    store.personnesCommander({ type: 'refuser', ...base })
    let cible = store.personnesInventaire().participations.find((l) => l.participationId === a.participationId)!
    expect(cible.rapprochementsRefuses).toContainEqual({ type: 'participation', entretienId: b.entretienId, participationId: b.participationId })
    expect(cible.locuteurRef).toBeTruthy()
    expect(store.personnesInventaire().locuteurs.find((p) => p.id === cible.locuteurRef)?.nom).toBe(a.nom)
    store.personnesCommander({ type: 'annulerRefus', entretienId: a.entretienId, participationId: a.participationId, cible: { type: 'participation', entretienId: b.entretienId, participationId: b.participationId } })
    const id = store.personnesCommander({ type: 'rapprocher', ...base, reprise: { variables: [] } })
    const apres = store.personnesInventaire()
    cible = apres.participations.find((l) => l.participationId === a.participationId)!
    expect(cible.locuteurRef).toBe(id)
    expect(cible.nom).toBe(a.nom)
    expect(cible.valeursLoc).toEqual(a.valeursLoc)
    expect(cible.rapprochementsRefuses).toEqual([])
    expect(apres.participations.find((l) => l.participationId === b.participationId)?.locuteurRef).toBe(id)
    expect(() => store.personnesCommander({ type: 'rapprocher', ...base, sourceEntretienId: a.entretienId })).toThrow('autre entretien')
  })

  test('les homonymes ont des identités distinctes et les noms vides sont refusés', () => {
    const c = squeletteCorpus()
    creerPersonne(c, 'p1', ' Marie ')
    creerPersonne(c, 'p2', 'Marie')
    expect(Object.values(c.locuteurs).map((p) => p.nom)).toEqual(['Marie', 'Marie'])
    expect(() => creerPersonne(c, 'p3', ' ')).toThrow('vide')
    expect(() => creerPersonne(c, 'p1', 'Paul')).toThrow('Identifiant')
  })

  test('liaison, déplacement et déliaison préservent les noms locaux et les valeurs', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie Dupont'); creerPersonne(c, 'p2', 'Autre personne')
    lierLocuteur(c, e, 'l1', 'p1')
    modifierPersonne(c, 'p1', 'Marie D.')
    expect(e.participations[0]).toMatchObject({ nom: 'Marie', valeursLoc: { age: '29' }, locuteurRef: 'p1' })
    lierLocuteur(c, e, 'l1', 'p2')
    expect(e.participations[0].locuteurRef).toBe('p2')
    lierLocuteur(c, e, 'l1', null)
    expect(e.participations[0].locuteurRef).toBeNull()
    expect(c.locuteurs.p1).toEqual({ id: 'p1', nom: 'Marie D.' })
  })

  test('sépare une partie des locuteurs et en laisse au moins un sur la fiche d’origine', () => {
    const c = squeletteCorpus()
    creerPersonne(c, 'p1', 'Marie Dupont')
    const a = entretien()
    const b = entretien()
    b.participations = [{ id: 'l3', index: 0, nom: 'Mme Dupont', valeursLoc: {}, locuteurRef: null }]
    lierLocuteur(c, a, 'l1', 'p1')
    lierLocuteur(c, b, 'l3', 'p1')
    const entretiens = [{ id: 'a', titre: 'A', data: a }, { id: 'b', titre: 'B', data: b }]
    expect(() => separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [])).toThrow('au moins un')
    expect(() => separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [
      { entretienId: 'a', participationId: 'l1' },
      { entretienId: 'b', participationId: 'l3' },
    ])).toThrow('Laissez au moins un')
    const nouvelle = separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [
      { entretienId: 'b', participationId: 'l3' },
    ])
    expect(nouvelle).toEqual({ id: 'p2', nom: 'Marie B' })
    expect(a.participations[0].locuteurRef).toBe('p1')
    expect(b.participations[0].locuteurRef).toBe('p2')
  })

  test('une déliaison persistée empêche la recréation au nommage sans interdire un rapprochement explicite', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie')
    expect(peutCreerLocuteurAuNommage(e.participations[0])).toBe(true)
    lierLocuteur(c, e, 'l1', 'p1')
    expect(peutCreerLocuteurAuNommage(e.participations[0])).toBe(false)
    lierLocuteur(c, e, 'l1', null)
    const relu: EntretienFichier = JSON.parse(JSON.stringify(e))
    const cible = relu.participations[0]
    cible.nom = 'Marie Dupont'
    expect(cible.associationRetiree).toBe(true)
    expect(peutCreerLocuteurAuNommage(cible)).toBe(false)
    const candidat = { entretienId: 'autre', participation: { ...cible, id: 'autre', locuteurRef: 'p1' } }
    expect(suggestionsExactesLocuteurs({ entretienId: 'ici', participation: cible }, [candidat])).toEqual([candidat])
    lierLocuteur(c, relu, 'l1', 'p1')
    expect(cible.locuteurRef).toBe('p1')
    expect(cible.associationRetiree).toBeUndefined()
  })

  test('la création au nommage exclut les libellés d’attente et les rôles', () => {
    const cible = entretien().participations[0]
    for (const nom of ['', 'A', 'Nouveau locuteur', 'Inconnu', 'Interviewer', 'Enquêteur']) {
      expect(peutCreerLocuteurAuNommage({ ...cible, nom })).toBe(false)
    }
  })

  test('refuse les références absentes et deux locuteurs du même entretien', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie')
    expect(() => lierLocuteur(c, e, 'l1', 'absent')).toThrow('n’existe plus')
    expect(() => lierLocuteur(c, e, 'absent', 'p1')).toThrow('locuteur')
    lierLocuteur(c, e, 'l1', 'p1')
    expect(() => lierLocuteur(c, e, 'l2', 'p1')).toThrow('déjà présent dans cet entretien')
    expect(e.participations[1].locuteurRef).toBeNull()
  })

  test('une référence pendante est visible et peut être déliée', () => {
    const c = squeletteCorpus(); const e = entretien()
    e.participations[0].locuteurRef = 'absente'
    e.notes = [{ id: 'n1', categorieId: 'ncat_generale', titre: 'À retenir', date: null,
      statut: 'prive', corps: 'Note liée', participationIds: ['l1'], rang: 0, creeLe: '', modifieLe: null }]
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(vue.participations[0].locuteurRef).toBe('absente')
    expect(vue.participations[0]).not.toHaveProperty('corpsTexte')
    expect(vue.notes).toEqual([expect.objectContaining({ id: 'n1', participationIds: ['l1'], entretienTitre: 'A' })])
    expect(vue.notes[0]).not.toHaveProperty('locuteurIds')
    lierLocuteur(c, e, 'l1', null)
    expect(e.participations[0].locuteurRef).toBeNull()
  })

  test('la suppression préserve une identité citée dans un refus de rapprochement', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie')
    e.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'p1' }]
    const avant = structuredClone([c, e])
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(() => supprimerPersonneVide(c, vue, 'p1')).toThrow('rapprochements refusés')
    expect([c, e]).toEqual(avant)
  })

  test('les associations ne produisent que les champs natifs', () => {
    const c = squeletteCorpus(); const e = entretien()
    const avant = structuredClone(e)
    creerPersonne(c, 'p1', 'Marie')
    lierLocuteur(c, e, 'l1', 'p1')
    lierLocuteur(c, e, 'l1', null)
    expect(e).toEqual({ ...avant, participations: [{ ...avant.participations[0], locuteurRef: null, associationRetiree: true }, avant.participations[1]] })
    expect(c).not.toHaveProperty('personnes')
    expect(e).not.toHaveProperty('locuteurs')
    expect(e.participations[0]).not.toHaveProperty('personneRef')
    expect(e.participations[0]).not.toHaveProperty('personneDeliee')
  })

  test('suppression seulement après déliaison et inventaire complet', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie'); lierLocuteur(c, e, 'l1', 'p1')
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(() => supprimerPersonneVide(c, vue, 'p1')).toThrow('Déliez')
    vue.participations = []
    vue.indisponibles.push({ id: 'e1', titre: 'A', raison: 'absent' })
    expect(() => supprimerPersonneVide(c, vue, 'p1')).toThrow('illisibles')
    vue.indisponibles = []
    supprimerPersonneVide(c, vue, 'p1')
    expect(c.locuteurs).toEqual({})
  })
})

describe('Personnes — stockage local', () => {
  test('regroupe toutes les références, réconcilie les refus et préserve les données', () => {
    const { store, dir } = preparer()
    const a = store.personnesInventaire().participations.find(l => l.nom === 'Karine')!
    const autre = store.creerEntretienVide('Autre entretien')
    const data = entretien()
    data.participations[0].rapprochementsRefuses = [{ type: 'participation', entretienId: a.entretienId, participationId: a.participationId }]
    store.ecrireEntretien(autre.id, data)
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, participationId: a.participationId, nom: 'Karine' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: autre.id, participationId: 'l1', nom: 'Marie' })!
    const lecture = store.lireEntretien(autre.id)
    if (!lecture.ok) throw new Error('Lecture impossible')
    lecture.data.participations[1].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: p2 }]
    store.ecrireEntretien(autre.id, lecture.data)
    const avant = store.personnesInventaire()
    expect(() => store.personnesCommander({ type: 'rapprocher', entretienId: a.entretienId, participationId: a.participationId, sourceEntretienId: autre.id, sourceParticipationId: 'l1' })).toThrow('deux personnes distinctes')
    expect(store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(avant) })).toBe(p1)
    const apres = new CorpusStore(dir).personnesInventaire()
    expect(apres.locuteurs).toEqual([{ id: p1, nom: 'Karine' }])
    expect(apres.participations.find(l => l.participationId === 'l1')).toMatchObject({ locuteurRef: p1, nom: 'Marie', valeursLoc: { age: '29' }, rapprochementsRefuses: [] })
    expect(apres.participations.find(l => l.participationId === 'l2')?.rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: p1 }])
    expect(apres.participations.filter(l => l.locuteurRef === p1)).toHaveLength(2)
  })

  test('sépare localement une personne avec un aperçu frais', () => {
    const { store } = preparer()
    const premier = store.personnesInventaire().participations.find((locuteur) => locuteur.nom === 'Karine')!
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: premier.entretienId,
      participationId: premier.participationId,
      nom: 'Karine Dupont',
    })!
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.participations[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, participationId: 'l1', locuteurId: personneId })
    const avant = store.personnesInventaire()
    expect(() => store.personnesCommander({
      type: 'separer',
      locuteurId: personneId,
      nom: 'Identité vide',
      participations: avant.participations
        .filter((locuteur) => locuteur.locuteurRef === personneId)
        .map((locuteur) => ({ entretienId: locuteur.entretienId, participationId: locuteur.participationId })),
      attendu: JSON.stringify(avant),
    })).toThrow('Laissez au moins un')
    expect(store.personnesInventaire()).toEqual(avant)
    const nouvelleId = store.personnesCommander({
      type: 'separer',
      locuteurId: personneId,
      nom: 'Marie distincte',
      participations: [{ entretienId: autre.id, participationId: 'l1' }],
      attendu: JSON.stringify(avant),
    }, true)!
    const apres = store.personnesInventaire()
    expect(apres.locuteurs).toEqual(expect.arrayContaining([
      { id: personneId, nom: 'Karine Dupont' },
      { id: nouvelleId, nom: 'Marie distincte' },
    ]))
    expect(apres.participations.find((locuteur) => locuteur.participationId === premier.participationId)?.locuteurRef).toBe(personneId)
    expect(apres.participations.find((locuteur) => locuteur.participationId === 'l1')?.locuteurRef).toBe(nouvelleId)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('reprend une séparation interrompue après la création de la définition', () => {
    const { store, dir } = preparer()
    const premier = store.personnesInventaire().participations.find((locuteur) => locuteur.nom === 'Karine')!
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: premier.entretienId,
      participationId: premier.participationId,
      nom: 'Karine Dupont',
    })!
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, participationId: 'l1', locuteurId: personneId })
    const avant = store.personnesInventaire()
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation((plan) => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      expect(plan.ordre).toBe('corpus-puis-entretiens')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(plan.corpusApres))
      throw new Error('Arrêt simulé')
    })
    expect(() => store.personnesCommander({
      type: 'separer',
      locuteurId: personneId,
      nom: 'Marie distincte',
      participations: [{ entretienId: autre.id, participationId: 'l1' }],
      attendu: JSON.stringify(avant),
    })).toThrow('Arrêt simulé')
    const apres = new CorpusStore(dir).personnesInventaire()
    const nouvelle = apres.locuteurs.find((personne) => personne.nom === 'Marie distincte')!
    expect(apres.participations.find((locuteur) => locuteur.participationId === 'l1')?.locuteurRef).toBe(nouvelle.id)
    expect(apres.participations.find((locuteur) => locuteur.participationId === premier.participationId)?.locuteurRef).toBe(personneId)
  })

  test('bloque le regroupement des locuteurs du même entretien sans changer les fichiers', () => {
    const { store, dir } = preparer()
    const [a, b] = store.personnesInventaire().participations
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, participationId: a.participationId, nom: 'A' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: b.entretienId, participationId: b.participationId, nom: 'B' })!
    const avant = readFileSync(join(dir, 'corpus.crp'), 'utf8')
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(store.personnesInventaire()) })).toThrow('Réunion impossible')
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(avant)
  })

  test('reprend la fusion après un arrêt entre deux remplacements', () => {
    const { store, dir } = preparer()
    const a = store.personnesInventaire().participations[0]
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien())
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, participationId: a.participationId, nom: 'A' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: autre.id, participationId: 'l1', nom: 'B' })!
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation(plan => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      const e = plan.entretiens[0]
      writeFileSync(join(dir, 'entretiens', `${e.id}.json`), JSON.stringify(e.apres))
      throw new Error('Arrêt simulé')
    })
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(store.personnesInventaire()) })).toThrow('Arrêt simulé')
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).locuteurs)).toHaveLength(2)
    const apres = new CorpusStore(dir).personnesInventaire()
    expect(apres.locuteurs.map(p => p.id)).toEqual([p1])
    expect(apres.participations.filter(l => l.locuteurRef === p1)).toHaveLength(2)
  })

  test('refuse un aperçu périmé et un inventaire incomplet', () => {
    const { store, dir } = preparer()
    const attendu = JSON.stringify(store.personnesInventaire())
    store.personnesCommander({ type: 'creerDefinition', nom: 'Marie Dupont' })
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: 'a', absorberId: 'b', attendu })).toThrow('ont changé')
    unlinkSync(join(dir, 'entretiens/e1.json'))
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: 'a', absorberId: 'b', attendu })).toThrow('illisibles')
  })

  test('la lecture complète les ids en mémoire sans écrire les fichiers', () => {
    const { dir, store } = preparer()
    const avant = readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')
    const inventaire = store.personnesInventaire()
    expect(inventaire.participations.every((l) => l.participationId.startsWith('loc-'))).toBe(true)
    expect(new CorpusStore(dir).personnesInventaire()).toEqual(inventaire)
    expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe(avant)
  })

  test('création liée, renommage, second entretien et déliaison persistent', () => {
    const { store, dir } = preparer()
    const karine = store.personnesInventaire().participations.find((l) => l.nom === 'Karine')!
    const id = store.personnesCommander({ type: 'creer', entretienId: 'e1', participationId: karine.participationId, nom: 'Karine D.' })!
    const lecture = store.lireEntretien('e1')
    expect(lecture.ok).toBe(true)
    if (!lecture.ok) return
    expect(lecture.data.participations.find((l) => l.nom === 'Karine')?.locuteurRef).toBe(id)
    store.personnesCommander({ type: 'modifier', locuteurId: id, nom: 'K. Dupont' })
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.participations[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, participationId: 'l1', locuteurId: id })
    const inventaire = new CorpusStore(dir).personnesInventaire()
    expect(inventaire.locuteurs).toEqual([{ id, nom: 'K. Dupont' }])
    expect(inventaire.participations.filter((l) => l.locuteurRef === id).map((l) => l.nom)).toEqual(['Karine', 'Mme Dupont'])
    expect(() => store.personnesCommander({ type: 'supprimer', locuteurId: id })).toThrow('Déliez')
    store.personnesCommander({ type: 'lier', entretienId: 'e1', participationId: karine.participationId, locuteurId: null })
    expect(store.personnesInventaire().participations.find((l) => l.participationId === karine.participationId)?.locuteurRef).toBeNull()
  })

  test('un corpus sans répertoire natif est refusé sans réécriture', () => {
    const { dir, store } = preparer()
    const fichier = join(dir, 'corpus.crp')
    const c = JSON.parse(readFileSync(fichier, 'utf8'))
    delete c.locuteurs
    const contenu = JSON.stringify(c)
    writeFileSync(fichier, contenu)
    expect(() => store.ouvrir()).toThrow('Répertoire de locuteurs invalide')
    expect(() => store.personnesInventaire()).toThrow('Répertoire de locuteurs invalide')
    expect(readFileSync(fichier, 'utf8')).toBe(contenu)
  })

  test.each(['absent', 'invalide', 'version'])('signale un entretien %s et bloque la suppression', (mode) => {
    const { dir, store } = preparer()
    const l = store.personnesInventaire().participations[0]
    const id = store.personnesCommander({ type: 'creer', entretienId: 'e1', participationId: l.participationId, nom: 'Personne' })!
    const fichier = join(dir, 'entretiens/e1.json')
    if (mode === 'absent') unlinkSync(fichier)
    if (mode === 'invalide') writeFileSync(fichier, '{')
    if (mode === 'version') writeFileSync(fichier, JSON.stringify({ ...entretien(), formatVersion: 999 }))
    expect(store.personnesInventaire().indisponibles).toHaveLength(1)
    expect(() => store.personnesCommander({ type: 'supprimer', locuteurId: id })).toThrow('illisibles')
  })

  test('une erreur de lien après création conserve une personne retrouvable et explique l’échec', () => {
    const { store } = preparer()
    const l = store.personnesInventaire().participations[0]
    vi.spyOn(store, 'ecrireEntretien').mockImplementation(() => { throw new Error('Disque plein') })
    expect(() => store.personnesCommander({ type: 'creer', entretienId: 'e1', participationId: l.participationId, nom: 'Personne' })).toThrow('le lien a échoué')
    expect(store.personnesInventaire().locuteurs).toHaveLength(1)
    expect(store.personnesInventaire().participations.every((loc) => !loc.locuteurRef)).toBe(true)
  })

  test('les commandes sont refusées en lecture seule mais l’inventaire reste accessible', () => {
    const { store } = preparer()
    store.lectureSeule = true
    const l = store.personnesInventaire().participations[0]
    expect(() => store.personnesCommander({ type: 'creer', entretienId: 'e1', participationId: l.participationId, nom: 'Personne' })).toThrow()
    expect(store.personnesInventaire().locuteurs).toEqual([])
  })
})
