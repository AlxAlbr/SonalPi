import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'
import { creerLocuteurFixture, installerIdentitesFixture } from './fixtures/identitesLocuteurs'
import type { ReferenceParticipation } from '../src/shared/format'
import { inventorierLocuteurs } from '../src/shared/corpus/inventaireLocuteurs'
import { creerLocuteur, associerParticipation, renommerLocuteur, supprimerLocuteurVide } from '../src/shared/corpus/identitesLocuteurs'
import { peutCreerLocuteurAuNommage, suggestionsExactesLocuteurs } from "../src/shared/corpus/rapprochementsLocuteurs"
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import type { EntretienFichier } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function preparer() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-identites-locuteurs-'))
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

function reunir(store: CorpusStore, conserverId: string, absorberId: string, attendu = JSON.stringify(store.inventaireIdentitesLocuteurs())) {
  return store.corrigerLocuteurs({ type: 'regrouperSelection', locuteurIds: [conserverId, absorberId], conserverId,
    nom: store.ouvrir().locuteurs[conserverId]?.nom ?? 'Nom', uniformiserNoms: false, attendu })
}
function dissocier(store: CorpusStore, id: string, participations: ReferenceParticipation[], attendu: string) {
  return store.corrigerLocuteurs({ type: 'dissocierSelection', locuteurId: id,
    participations: participations.map(({ entretienId, participationId }) => ({ entretienId, participationId })), attendu })
}
function supprimerVide(store: CorpusStore, id: string) {
  return store.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: id, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })
}

describe('Identités de locuteurs — règles de domaine', () => {
  test('redirige et déduplique les règles de cas dans la fusion, sans perdre les filtres', () => {
    const { store, dir } = preparer()
    const conserverId = creerLocuteurFixture(dir, 'Identité conservée')
    const absorberId = creerLocuteurFixture(dir, 'Identité absorbée')
    const date = '2026-09-01T10:00:00.000Z'
    store.casCommander({ type: 'creer', cas: {
      id: 'collectif', nom: 'Collectif', memo: 'Mémo conservé', creeLe: date, modifieLe: date,
      regles: [
        { type: "locuteur", locuteurId: conserverId, inclureEnqueteurs: false },
        { type: "locuteurs", membres: [{ locuteurId: absorberId, inclureEnqueteurs: true }] },
      ], rattachements: [],
    } })
    expect(() => supprimerVide(store, absorberId)).toThrow(/Collectif/)
    reunir(store, conserverId, absorberId)
    const cas = store.ouvrir().cas?.collectif
    expect(cas).toMatchObject({ id: 'collectif', memo: 'Mémo conservé', creeLe: date, rattachements: [] })
    expect(cas?.regles).toEqual([{ type: "locuteurs", membres: [{ locuteurId: conserverId, inclureEnqueteurs: true }] }])
    expect(store.ouvrir().locuteurs[absorberId]).toBeUndefined()
    expect(() => supprimerVide(store, conserverId)).toThrow(/Collectif/)
  })

  test('rapproche deux entretiens avec reprise ponctuelle et refus révocable', () => {
    const { store, dir } = preparer()
    const autre = store.creerEntretienVide('Deuxième entretien')
    store.ecrireEntretien(autre.id, entretien())
    const vue = store.inventaireIdentitesLocuteurs()
    const a = vue.participations.find((l) => l.nom === 'Karine')!
    const b = vue.participations.find((l) => l.entretienId !== a.entretienId)!
    expect(b).toBeDefined()
    const reference = { entretienId: a.entretienId, participationId: a.participationId }, source = { entretienId: b.entretienId, participationId: b.participationId }
    creerLocuteurFixture(dir, a.nom, [reference])
    store.corrigerLocuteurs({ type: 'ecarterRapprochement', reference, cible: source, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })
    let cible = store.inventaireIdentitesLocuteurs().participations.find((l) => l.participationId === a.participationId)!
    expect(cible.rapprochementsRefuses).toContainEqual({ type: 'participation', entretienId: b.entretienId, participationId: b.participationId })
    expect(cible.locuteurRef).toBeTruthy()
    expect(store.inventaireIdentitesLocuteurs().locuteurs.find((p) => p.id === cible.locuteurRef)?.nom).toBe(a.nom)
    store.corrigerLocuteurs({ type: 'retablirRapprochement', reference, cible: { type: 'participation', ...source }, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })
    store.ouvrirEntretienPourEdition(a.entretienId)
    const resultat = store.rapprocherLocuteurDepuisEntretien({ ...reference, source, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()), reprise: { variables: [] } })
    const id = resultat.participations.find((p) => p.id === a.participationId)!.locuteurRef
    const apres = store.inventaireIdentitesLocuteurs()
    cible = apres.participations.find((l) => l.participationId === a.participationId)!
    expect(cible.locuteurRef).toBe(id)
    expect(cible.nom).toBe(a.nom)
    expect(cible.valeursLoc).toEqual(a.valeursLoc)
    expect(cible.rapprochementsRefuses).toEqual([])
    expect(apres.participations.find((l) => l.participationId === b.participationId)?.locuteurRef).toBe(id)
    expect(() => store.rapprocherLocuteurDepuisEntretien({ ...reference, source: reference, attendu: JSON.stringify(apres) })).toThrow('rapprochement')
  })

  test('les homonymes ont des identités distinctes et les noms vides sont refusés', () => {
    const c = squeletteCorpus()
    creerLocuteur(c, 'p1', ' Marie ')
    creerLocuteur(c, 'p2', 'Marie')
    expect(Object.values(c.locuteurs).map((p) => p.nom)).toEqual(['Marie', 'Marie'])
    expect(() => creerLocuteur(c, 'p3', ' ')).toThrow('vide')
    expect(() => creerLocuteur(c, 'p1', 'Paul')).toThrow('Identifiant')
  })

  test('liaison, déplacement et déliaison préservent les noms locaux et les valeurs', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerLocuteur(c, 'p1', 'Marie Dupont'); creerLocuteur(c, 'p2', 'Autre personne')
    associerParticipation(c, e, 'l1', 'p1')
    renommerLocuteur(c, 'p1', 'Marie D.')
    expect(e.participations[0]).toMatchObject({ nom: 'Marie', valeursLoc: { age: '29' }, locuteurRef: 'p1' })
    associerParticipation(c, e, 'l1', 'p2')
    expect(e.participations[0].locuteurRef).toBe('p2')
    associerParticipation(c, e, 'l1', null)
    expect(e.participations[0].locuteurRef).toBeNull()
    expect(c.locuteurs.p1).toEqual({ id: 'p1', nom: 'Marie D.' })
  })

  test('une déliaison persistée empêche la recréation au nommage sans interdire un rapprochement explicite', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerLocuteur(c, 'p1', 'Marie')
    expect(peutCreerLocuteurAuNommage(e.participations[0])).toBe(true)
    associerParticipation(c, e, 'l1', 'p1')
    expect(peutCreerLocuteurAuNommage(e.participations[0])).toBe(false)
    associerParticipation(c, e, 'l1', null)
    const relu: EntretienFichier = JSON.parse(JSON.stringify(e))
    const cible = relu.participations[0]
    cible.nom = 'Marie Dupont'
    expect(cible.associationRetiree).toBe(true)
    expect(peutCreerLocuteurAuNommage(cible)).toBe(false)
    const candidat = { entretienId: 'autre', participation: { ...cible, id: 'autre', locuteurRef: 'p1' } }
    expect(suggestionsExactesLocuteurs({ entretienId: 'ici', participation: cible }, [candidat])).toEqual([candidat])
    associerParticipation(c, relu, 'l1', 'p1')
    expect(cible.locuteurRef).toBe('p1')
    expect(cible.associationRetiree).toBeUndefined()
  })

  test('tout nom non vide validé est admissible, y compris un rôle ou un libellé provisoire', () => {
    const cible = entretien().participations[0]
    for (const nom of ['A', 'X', 'Nouveau locuteur', 'Inconnu', 'Participant 1', 'Interviewer', 'Enquêteur']) {
      expect(peutCreerLocuteurAuNommage({ ...cible, nom })).toBe(true)
    }
    for (const nom of ['', '  ', '\t\n']) expect(peutCreerLocuteurAuNommage({ ...cible, nom })).toBe(false)
  })

  test('refuse les références absentes et deux locuteurs du même entretien', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerLocuteur(c, 'p1', 'Marie')
    expect(() => associerParticipation(c, e, 'l1', 'absent')).toThrow('n’existe plus')
    expect(() => associerParticipation(c, e, 'absent', 'p1')).toThrow('participation')
    associerParticipation(c, e, 'l1', 'p1')
    expect(() => associerParticipation(c, e, 'l2', 'p1')).toThrow('déjà présent dans cet entretien')
    expect(e.participations[1].locuteurRef).toBeNull()
  })

  test('une référence pendante est visible et peut être déliée', () => {
    const c = squeletteCorpus(); const e = entretien()
    e.participations[0].locuteurRef = 'absente'
    e.notes = [{ id: 'n1', categorieId: 'ncat_generale', titre: 'À retenir', date: null,
      statut: 'prive', corps: 'Note liée', participationIds: ['l1'], rang: 0, creeLe: '', modifieLe: null }]
    const vue = inventorierLocuteurs(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(vue.participations[0].locuteurRef).toBe('absente')
    expect(vue.participations[0]).not.toHaveProperty('corpsTexte')
    expect(vue.notes).toEqual([expect.objectContaining({ id: 'n1', participationIds: ['l1'], entretienTitre: 'A' })])
    expect(vue.notes[0]).not.toHaveProperty('locuteurIds')
    associerParticipation(c, e, 'l1', null)
    expect(e.participations[0].locuteurRef).toBeNull()
  })

  test('la suppression préserve une identité citée dans un refus de rapprochement', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerLocuteur(c, 'p1', 'Marie')
    e.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'p1' }]
    const avant = structuredClone([c, e])
    const vue = inventorierLocuteurs(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(() => supprimerLocuteurVide(c, vue, 'p1')).toThrow('rapprochements refusés')
    expect([c, e]).toEqual(avant)
  })

  test('les associations ne produisent que les champs natifs', () => {
    const c = squeletteCorpus(); const e = entretien()
    const avant = structuredClone(e)
    creerLocuteur(c, 'p1', 'Marie')
    associerParticipation(c, e, 'l1', 'p1')
    associerParticipation(c, e, 'l1', null)
    expect(e).toEqual({ ...avant, participations: [{ ...avant.participations[0], locuteurRef: null, associationRetiree: true }, avant.participations[1]] })
    expect(c).not.toHaveProperty('personnes')
    expect(e).not.toHaveProperty('locuteurs')
    expect(e.participations[0]).not.toHaveProperty('personneRef')
    expect(e.participations[0]).not.toHaveProperty('personneDeliee')
  })

  test('suppression seulement après déliaison et inventaire complet', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerLocuteur(c, 'p1', 'Marie'); associerParticipation(c, e, 'l1', 'p1')
    const vue = inventorierLocuteurs(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(() => supprimerLocuteurVide(c, vue, 'p1')).toThrow('Déliez')
    vue.participations = []
    vue.indisponibles.push({ id: 'e1', titre: 'A', raison: 'absent' })
    expect(() => supprimerLocuteurVide(c, vue, 'p1')).toThrow('illisibles')
    vue.indisponibles = []
    supprimerLocuteurVide(c, vue, 'p1')
    expect(c.locuteurs).toEqual({})
  })
})

describe('Identités de locuteurs — stockage local', () => {
  test('regroupe toutes les références, réconcilie les refus et préserve les données', () => {
    const { store, dir } = preparer()
    const a = store.inventaireIdentitesLocuteurs().participations.find(l => l.nom === 'Karine')!
    const autre = store.creerEntretienVide('Autre entretien')
    const data = entretien()
    data.participations[0].rapprochementsRefuses = [{ type: 'participation', entretienId: a.entretienId, participationId: a.participationId }]
    store.ecrireEntretien(autre.id, data)
    const p1 = creerLocuteurFixture(dir, 'Karine', [a])
    const p2 = creerLocuteurFixture(dir, 'Marie', [{ entretienId: autre.id, participationId: 'l1' }])
    const lecture = store.lireEntretien(autre.id)
    if (!lecture.ok) throw new Error('Lecture impossible')
    lecture.data.participations[1].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: p2 }]
    store.ecrireEntretien(autre.id, lecture.data)
    const avant = store.inventaireIdentitesLocuteurs()
    expect(avant.locuteurs).toHaveLength(2)
    expect(reunir(store, p1, p2, JSON.stringify(avant))).toBe(p1)
    const apres = new CorpusStore(dir).inventaireIdentitesLocuteurs()
    expect(apres.locuteurs).toEqual([{ id: p1, nom: 'Karine' }])
    expect(apres.participations.find(l => l.participationId === 'l1')).toMatchObject({ locuteurRef: p1, nom: 'Marie', valeursLoc: { age: '29' }, rapprochementsRefuses: [] })
    expect(apres.participations.find(l => l.participationId === 'l2')?.rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: p1 }])
    expect(apres.participations.filter(l => l.locuteurRef === p1)).toHaveLength(2)
  })

  test('dissocie avec un aperçu frais, sans nouveau nom ni annulation de transaction au journal', () => {
    const { store, dir } = preparer(), premier = store.inventaireIdentitesLocuteurs().participations.find((p) => p.nom === 'Karine')!
    const autre = store.creerEntretienVide('Deuxième entretien'), data = entretien()
    data.participations[0].nom = 'Mme Dupont'; store.ecrireEntretien(autre.id, data)
    const reference = { entretienId: autre.id, participationId: 'l1' }
    const id = creerLocuteurFixture(dir, 'Karine Dupont', [premier, reference])
    const avant = store.inventaireIdentitesLocuteurs(), attendu = JSON.stringify(avant)
    expect(() => dissocier(store, id, [premier, reference], attendu)).toThrow('Laissez au moins un')
    expect(store.inventaireIdentitesLocuteurs()).toEqual(avant)
    dissocier(store, id, [reference], attendu)
    const apres = store.inventaireIdentitesLocuteurs(), nouveau = apres.participations.find((p) => p.entretienId === autre.id && p.participationId === 'l1')!.locuteurRef!
    expect(nouveau).not.toBe(id)
    expect(apres.locuteurs).toEqual(expect.arrayContaining([{ id, nom: 'Karine Dupont' }, { id: nouveau, nom: 'Mme Dupont' }]))
    expect(apres.participations.find((p) => p.participationId === premier.participationId)?.locuteurRef).toBe(id)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('reprend une dissociation interrompue après la création de la définition', () => {
    const { store, dir } = preparer(), premier = store.inventaireIdentitesLocuteurs().participations.find((p) => p.nom === 'Karine')!
    const autre = store.creerEntretienVide('Deuxième entretien'); store.ecrireEntretien(autre.id, entretien())
    const reference = { entretienId: autre.id, participationId: 'l1' }, id = creerLocuteurFixture(dir, 'Karine Dupont', [premier, reference])
    const attendu = JSON.stringify(store.inventaireIdentitesLocuteurs())
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation((plan) => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      expect(plan.ordre).toBe('corpus-puis-entretiens')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(plan.corpusApres)); throw new Error('Arrêt simulé')
    })
    expect(() => dissocier(store, id, [reference], attendu)).toThrow('Arrêt simulé')
    const apres = new CorpusStore(dir).inventaireIdentitesLocuteurs(), nouvelle = apres.locuteurs.find((p) => p.nom === 'Marie')!
    expect(apres.participations.find((p) => p.participationId === 'l1')?.locuteurRef).toBe(nouvelle.id)
    expect(apres.participations.find((p) => p.participationId === premier.participationId)?.locuteurRef).toBe(id)
  })

  test('bloque le regroupement des locuteurs du même entretien sans changer les fichiers', () => {
    const { store, dir } = preparer()
    const [a, b] = store.inventaireIdentitesLocuteurs().participations
    const p1 = creerLocuteurFixture(dir, 'A', [a]), p2 = creerLocuteurFixture(dir, 'B', [b])
    const avant = readFileSync(join(dir, 'corpus.crp'), 'utf8')
    expect(() => reunir(store, p1, p2)).toThrow('Réunion impossible')
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(avant)
  })

  test('reprend la fusion après un arrêt entre deux remplacements', () => {
    const { store, dir } = preparer()
    const a = store.inventaireIdentitesLocuteurs().participations[0]
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien())
    const p1 = creerLocuteurFixture(dir, 'A', [a]), p2 = creerLocuteurFixture(dir, 'B', [{ entretienId: autre.id, participationId: 'l1' }])
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation(plan => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      const e = plan.entretiens[0]
      writeFileSync(join(dir, 'entretiens', `${e.id}.json`), JSON.stringify(e.apres))
      throw new Error('Arrêt simulé')
    })
    expect(() => reunir(store, p1, p2)).toThrow('Arrêt simulé')
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).locuteurs)).toHaveLength(2)
    const apres = new CorpusStore(dir).inventaireIdentitesLocuteurs()
    expect(apres.locuteurs.map(p => p.id)).toEqual([p1])
    expect(apres.participations.filter(l => l.locuteurRef === p1)).toHaveLength(2)
  })

  test('refuse un aperçu périmé et un inventaire incomplet', () => {
    const { store, dir } = preparer()
    const attendu = JSON.stringify(store.inventaireIdentitesLocuteurs())
    creerLocuteurFixture(dir, 'Marie Dupont')
    expect(() => reunir(store, 'a', 'b', attendu)).toThrow('ont changé')
    unlinkSync(join(dir, 'entretiens/e1.json'))
    expect(() => reunir(store, 'a', 'b', attendu)).toThrow('illisibles')
  })

  test('la lecture conserve les ids natifs sans écrire les fichiers', () => {
    const { dir, store } = preparer()
    const avant = readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')
    const inventaire = store.inventaireIdentitesLocuteurs()
    expect(inventaire.participations.every((l) => l.participationId.startsWith('loc-'))).toBe(true)
    expect(new CorpusStore(dir).inventaireIdentitesLocuteurs()).toEqual(inventaire)
    expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe(avant)
  })

  test('les associations natives, le renommage global et la dissociation persistent', () => {
    const { store, dir } = preparer()
    const karine = store.inventaireIdentitesLocuteurs().participations.find((l) => l.nom === 'Karine')!
    const id = creerLocuteurFixture(dir, 'Karine D.', [karine])
    const lecture = store.lireEntretien('e1')
    expect(lecture.ok).toBe(true)
    if (!lecture.ok) return
    expect(lecture.data.participations.find((l) => l.nom === 'Karine')?.locuteurRef).toBe(id)
    store.corrigerLocuteurs({ type: 'renommerGlobal', locuteurId: id, nom: 'K. Dupont', attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.participations[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    installerIdentitesFixture(dir, { associations: [{ entretienId: autre.id, participationId: 'l1', locuteurRef: id }] })
    const inventaire = new CorpusStore(dir).inventaireIdentitesLocuteurs()
    expect(inventaire.locuteurs).toEqual([{ id, nom: 'K. Dupont' }])
    expect(inventaire.participations.filter((l) => l.locuteurRef === id).map((l) => l.nom)).toEqual(['K. Dupont', 'Mme Dupont'])
    expect(() => supprimerVide(store, id)).toThrow('Déliez')
    dissocier(store, id, [karine], JSON.stringify(store.inventaireIdentitesLocuteurs()))
    expect(store.inventaireIdentitesLocuteurs().participations.find((l) => l.participationId === karine.participationId)?.locuteurRef).not.toBe(id)
  })

  test('un corpus sans répertoire natif est refusé sans réécriture', () => {
    const { dir, store } = preparer()
    const fichier = join(dir, 'corpus.crp')
    const c = JSON.parse(readFileSync(fichier, 'utf8'))
    delete c.locuteurs
    const contenu = JSON.stringify(c)
    writeFileSync(fichier, contenu)
    expect(() => store.ouvrir()).toThrow('Répertoire de locuteurs invalide')
    expect(() => store.inventaireIdentitesLocuteurs()).toThrow('Répertoire de locuteurs invalide')
    expect(readFileSync(fichier, 'utf8')).toBe(contenu)
  })

  test.each(['absent', 'invalide', 'version'])('signale un entretien %s et bloque la suppression', (mode) => {
    const { dir, store } = preparer()
    const l = store.inventaireIdentitesLocuteurs().participations[0]
    const id = creerLocuteurFixture(dir, 'Personne', [l])
    const fichier = join(dir, 'entretiens/e1.json')
    if (mode === 'absent') unlinkSync(fichier)
    if (mode === 'invalide') writeFileSync(fichier, '{')
    if (mode === 'version') writeFileSync(fichier, JSON.stringify({ ...entretien(), formatVersion: 999 }))
    expect(store.inventaireIdentitesLocuteurs().indisponibles).toHaveLength(1)
    expect(() => supprimerVide(store, id)).toThrow('illisibles')
  })

  test('un refus avant transaction de nommage ne crée aucune identité vide', () => {
    const { store } = preparer(), p = store.inventaireIdentitesLocuteurs().participations[0]
    store.ouvrirEntretienPourEdition(p.entretienId)
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation(() => { throw new Error('Disque plein') })
    expect(() => store.identifierParticipationAuNommage({ entretienId: p.entretienId, participationId: p.participationId, nom: p.nom })).toThrow('Disque plein')
    expect(store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(0)
    expect(store.inventaireIdentitesLocuteurs().participations.every((p) => !p.locuteurRef)).toBe(true)
  })

  test('les commandes sont refusées en lecture seule mais l’inventaire reste accessible', () => {
    const { store } = preparer()
    store.lectureSeule = true
    const l = store.inventaireIdentitesLocuteurs().participations[0]
    expect(() => store.corrigerLocuteurs({ type: 'individualiserSelection', participations: [l], attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })).toThrow()
    expect(store.inventaireIdentitesLocuteurs().locuteurs).toEqual([])
  })
})
