import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'
import { creerPersonne, inventorierPersonnes, lierLocuteur, modifierPersonne, separerPersonne, supprimerPersonneVide } from '../src/shared/corpus/personnes'
import { peutCreerPersonneAuNommage, suggestionsExactesPersonnes } from '../src/shared/corpus/rapprochementsPersonnes'
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
  test('rapproche deux entretiens avec reprise ponctuelle et refus révocable', () => {
    const { store } = preparer()
    const autre = store.creerEntretienVide('Deuxième entretien')
    store.ecrireEntretien(autre.id, entretien())
    const vue = store.personnesInventaire()
    const a = vue.locuteurs.find((l) => l.nom === 'Karine')!
    const b = vue.locuteurs.find((l) => l.entretienId !== a.entretienId)!
    expect(b).toBeDefined()
    const base = { entretienId: a.entretienId, locuteurId: a.locuteurId, sourceEntretienId: b.entretienId, sourceLocuteurId: b.locuteurId }
    store.personnesCommander({ type: 'refuser', ...base })
    let cible = store.personnesInventaire().locuteurs.find((l) => l.locuteurId === a.locuteurId)!
    expect(cible.rapprochementsRefuses).toContain(`locuteur:${b.locuteurId}`)
    expect(cible.personneRef).toBeTruthy()
    expect(store.personnesInventaire().personnes.find((p) => p.id === cible.personneRef)?.nom).toBe(a.nom)
    store.personnesCommander({ type: 'annulerRefus', entretienId: a.entretienId, locuteurId: a.locuteurId, cible: `locuteur:${b.locuteurId}` })
    const id = store.personnesCommander({ type: 'rapprocher', ...base, reprise: { variables: [] } })
    const apres = store.personnesInventaire()
    cible = apres.locuteurs.find((l) => l.locuteurId === a.locuteurId)!
    expect(cible.personneRef).toBe(id)
    expect(cible.nom).toBe(a.nom)
    expect(cible.valeursLoc).toEqual(a.valeursLoc)
    expect(cible.rapprochementsRefuses).toEqual([])
    expect(apres.locuteurs.find((l) => l.locuteurId === b.locuteurId)?.personneRef).toBe(id)
    expect(() => store.personnesCommander({ type: 'rapprocher', ...base, sourceEntretienId: a.entretienId })).toThrow('autre entretien')
  })

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
    modifierPersonne(c, 'p1', 'Marie D.')
    expect(e.locuteurs[0]).toMatchObject({ nom: 'Marie', valeursLoc: { age: '29' }, personneRef: 'p1' })
    lierLocuteur(c, e, 'l1', 'p2')
    expect(e.locuteurs[0].personneRef).toBe('p2')
    lierLocuteur(c, e, 'l1', null)
    expect(e.locuteurs[0].personneRef).toBeNull()
    expect(c.personnes.p1).toEqual({ id: 'p1', nom: 'Marie D.' })
  })

  test('sépare une partie des locuteurs et en laisse au moins un sur la fiche d’origine', () => {
    const c = squeletteCorpus()
    creerPersonne(c, 'p1', 'Marie Dupont')
    const a = entretien()
    const b = entretien()
    b.locuteurs = [{ id: 'l3', index: 0, nom: 'Mme Dupont', valeursLoc: {}, personneRef: null }]
    lierLocuteur(c, a, 'l1', 'p1')
    lierLocuteur(c, b, 'l3', 'p1')
    const entretiens = [{ id: 'a', titre: 'A', data: a }, { id: 'b', titre: 'B', data: b }]
    expect(() => separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [])).toThrow('au moins un')
    expect(() => separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [
      { entretienId: 'a', locuteurId: 'l1' },
      { entretienId: 'b', locuteurId: 'l3' },
    ])).toThrow('Laissez au moins un')
    const nouvelle = separerPersonne(c, entretiens, 'p1', 'p2', 'Marie B', [
      { entretienId: 'b', locuteurId: 'l3' },
    ])
    expect(nouvelle).toEqual({ id: 'p2', nom: 'Marie B' })
    expect(a.locuteurs[0].personneRef).toBe('p1')
    expect(b.locuteurs[0].personneRef).toBe('p2')
  })

  test('une déliaison persistée empêche la recréation au nommage sans interdire un rapprochement explicite', () => {
    const c = squeletteCorpus(); const e = entretien()
    creerPersonne(c, 'p1', 'Marie')
    expect(peutCreerPersonneAuNommage(e.locuteurs[0])).toBe(true)
    lierLocuteur(c, e, 'l1', 'p1')
    expect(peutCreerPersonneAuNommage(e.locuteurs[0])).toBe(false)
    lierLocuteur(c, e, 'l1', null)
    const relu: EntretienFichier = JSON.parse(JSON.stringify(e))
    const cible = relu.locuteurs[0]
    cible.nom = 'Marie Dupont'
    expect(cible.personneDeliee).toBe(true)
    expect(peutCreerPersonneAuNommage(cible)).toBe(false)
    const candidat = { entretienId: 'autre', locuteur: { ...cible, id: 'autre', personneRef: 'p1' } }
    expect(suggestionsExactesPersonnes({ entretienId: 'ici', locuteur: cible }, [candidat])).toEqual([candidat])
    lierLocuteur(c, relu, 'l1', 'p1')
    expect(cible.personneRef).toBe('p1')
    expect(cible.personneDeliee).toBeUndefined()
  })

  test('la création au nommage exclut les libellés d’attente et les rôles', () => {
    const cible = entretien().locuteurs[0]
    for (const nom of ['', 'A', 'Nouveau locuteur', 'Inconnu', 'Interviewer', 'Enquêteur']) {
      expect(peutCreerPersonneAuNommage({ ...cible, nom })).toBe(false)
    }
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
    e.notes = [{ id: 'n1', categorieId: 'ncat_generale', titre: 'À retenir', date: null,
      statut: 'prive', corps: 'Note liée', locuteurIds: ['l1'], rang: 0, creeLe: '', modifieLe: null }]
    const vue = inventorierPersonnes(c, [{ id: 'e1', titre: 'A', data: e }])
    expect(vue.locuteurs[0].personneRef).toBe('absente')
    expect(vue.locuteurs[0]).not.toHaveProperty('corpsTexte')
    expect(vue.notes).toEqual([expect.objectContaining({ id: 'n1', locuteurIds: ['l1'], entretienTitre: 'A' })])
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
  test('regroupe toutes les références, réconcilie les refus et préserve les données', () => {
    const { store, dir } = preparer()
    const a = store.personnesInventaire().locuteurs.find(l => l.nom === 'Karine')!
    const autre = store.creerEntretienVide('Autre entretien')
    const data = entretien()
    data.locuteurs[0].rapprochementsRefuses = [`locuteur:${a.locuteurId}`]
    store.ecrireEntretien(autre.id, data)
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, locuteurId: a.locuteurId, nom: 'Karine' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: autre.id, locuteurId: 'l1', nom: 'Marie' })!
    const lecture = store.lireEntretien(autre.id)
    if (!lecture.ok) throw new Error('Lecture impossible')
    lecture.data.locuteurs[1].rapprochementsRefuses = [`personne:${p2}`]
    store.ecrireEntretien(autre.id, lecture.data)
    const avant = store.personnesInventaire()
    expect(() => store.personnesCommander({ type: 'rapprocher', entretienId: a.entretienId, locuteurId: a.locuteurId, sourceEntretienId: autre.id, sourceLocuteurId: 'l1' })).toThrow('deux personnes distinctes')
    expect(store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(avant) })).toBe(p1)
    const apres = new CorpusStore(dir).personnesInventaire()
    expect(apres.personnes).toEqual([{ id: p1, nom: 'Karine' }])
    expect(apres.locuteurs.find(l => l.locuteurId === 'l1')).toMatchObject({ personneRef: p1, nom: 'Marie', valeursLoc: { age: '29' }, rapprochementsRefuses: [] })
    expect(apres.locuteurs.find(l => l.locuteurId === 'l2')?.rapprochementsRefuses).toEqual([`personne:${p1}`])
    expect(apres.locuteurs.filter(l => l.personneRef === p1)).toHaveLength(2)
  })

  test('sépare localement une personne avec un aperçu frais', () => {
    const { store } = preparer()
    const premier = store.personnesInventaire().locuteurs.find((locuteur) => locuteur.nom === 'Karine')!
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: premier.entretienId,
      locuteurId: premier.locuteurId,
      nom: 'Karine Dupont',
    })!
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.locuteurs[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'l1', personneId })
    const avant = store.personnesInventaire()
    expect(() => store.personnesCommander({
      type: 'separer',
      personneId,
      nom: 'Identité vide',
      locuteurs: avant.locuteurs
        .filter((locuteur) => locuteur.personneRef === personneId)
        .map((locuteur) => ({ entretienId: locuteur.entretienId, locuteurId: locuteur.locuteurId })),
      attendu: JSON.stringify(avant),
    })).toThrow('Laissez au moins un')
    expect(store.personnesInventaire()).toEqual(avant)
    const nouvelleId = store.personnesCommander({
      type: 'separer',
      personneId,
      nom: 'Marie distincte',
      locuteurs: [{ entretienId: autre.id, locuteurId: 'l1' }],
      attendu: JSON.stringify(avant),
    }, true)!
    const apres = store.personnesInventaire()
    expect(apres.personnes).toEqual(expect.arrayContaining([
      { id: personneId, nom: 'Karine Dupont' },
      { id: nouvelleId, nom: 'Marie distincte' },
    ]))
    expect(apres.locuteurs.find((locuteur) => locuteur.locuteurId === premier.locuteurId)?.personneRef).toBe(personneId)
    expect(apres.locuteurs.find((locuteur) => locuteur.locuteurId === 'l1')?.personneRef).toBe(nouvelleId)
    expect(store.journalCorpusLister()).toEqual([])
  })

  test('reprend une séparation interrompue après la création de la définition', () => {
    const { store, dir } = preparer()
    const premier = store.personnesInventaire().locuteurs.find((locuteur) => locuteur.nom === 'Karine')!
    const personneId = store.personnesCommander({
      type: 'creer',
      entretienId: premier.entretienId,
      locuteurId: premier.locuteurId,
      nom: 'Karine Dupont',
    })!
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'l1', personneId })
    const avant = store.personnesInventaire()
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation((plan) => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      expect(plan.ordre).toBe('corpus-puis-entretiens')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      writeFileSync(join(dir, 'corpus.json'), JSON.stringify(plan.corpusApres))
      throw new Error('Arrêt simulé')
    })
    expect(() => store.personnesCommander({
      type: 'separer',
      personneId,
      nom: 'Marie distincte',
      locuteurs: [{ entretienId: autre.id, locuteurId: 'l1' }],
      attendu: JSON.stringify(avant),
    })).toThrow('Arrêt simulé')
    const apres = new CorpusStore(dir).personnesInventaire()
    const nouvelle = apres.personnes.find((personne) => personne.nom === 'Marie distincte')!
    expect(apres.locuteurs.find((locuteur) => locuteur.locuteurId === 'l1')?.personneRef).toBe(nouvelle.id)
    expect(apres.locuteurs.find((locuteur) => locuteur.locuteurId === premier.locuteurId)?.personneRef).toBe(personneId)
  })

  test('bloque le regroupement des locuteurs du même entretien sans changer les fichiers', () => {
    const { store, dir } = preparer()
    const [a, b] = store.personnesInventaire().locuteurs
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, locuteurId: a.locuteurId, nom: 'A' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: b.entretienId, locuteurId: b.locuteurId, nom: 'B' })!
    const avant = readFileSync(join(dir, 'corpus.json'), 'utf8')
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(store.personnesInventaire()) })).toThrow('Réunion impossible')
    expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe(avant)
  })

  test('reprend la fusion après un arrêt entre deux remplacements', () => {
    const { store, dir } = preparer()
    const a = store.personnesInventaire().locuteurs[0]
    const autre = store.creerEntretienVide('Autre entretien')
    store.ecrireEntretien(autre.id, entretien())
    const p1 = store.personnesCommander({ type: 'creer', entretienId: a.entretienId, locuteurId: a.locuteurId, nom: 'A' })!
    const p2 = store.personnesCommander({ type: 'creer', entretienId: autre.id, locuteurId: 'l1', nom: 'B' })!
    vi.spyOn(store, 'appliquerTransactionFichiers').mockImplementation(plan => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      const e = plan.entretiens[0]
      writeFileSync(join(dir, 'entretiens', `${e.id}.json`), JSON.stringify(e.apres))
      throw new Error('Arrêt simulé')
    })
    expect(() => store.personnesCommander({ type: 'fusionner', conserverId: p1, absorberId: p2, attendu: JSON.stringify(store.personnesInventaire()) })).toThrow('Arrêt simulé')
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).personnes)).toHaveLength(2)
    const apres = new CorpusStore(dir).personnesInventaire()
    expect(apres.personnes.map(p => p.id)).toEqual([p1])
    expect(apres.locuteurs.filter(l => l.personneRef === p1)).toHaveLength(2)
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
    store.personnesCommander({ type: 'modifier', personneId: id, nom: 'K. Dupont' })
    const autre = store.creerEntretienVide('Deuxième entretien')
    const data = entretien()
    data.locuteurs[0].nom = 'Mme Dupont'
    store.ecrireEntretien(autre.id, data)
    store.personnesCommander({ type: 'lier', entretienId: autre.id, locuteurId: 'l1', personneId: id })
    const inventaire = new CorpusStore(dir).personnesInventaire()
    expect(inventaire.personnes).toEqual([{ id, nom: 'K. Dupont' }])
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

  test('une erreur de lien après création conserve une personne retrouvable et explique l’échec', () => {
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
