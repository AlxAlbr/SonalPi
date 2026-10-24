import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { OperationsThemesCorpus, type InstantaneOperationTheme } from '../src/main/operationsThemes'
import { creerHandlersOperationsThemes, exigerGestesOperationTheme } from '../src/main/ipcOperationsThemes'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'
import type { DemandeOperationTheme, ProgressionOperationTheme } from '../src/shared/corpus/themes'
import type { PlanRemplacementEntretiens } from '../src/main/transactionsFichiers'

const dossiers: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
const fusion: DemandeOperationTheme = { type: 'fusion', sources: ['source', 'cible'], cible: 'cible' }
const options = { entretiens: 'tous-prevus' as const }

function division(effacerSource = false): Extract<DemandeOperationTheme, { type: 'division' }> {
  return {
    type: 'division', source: 'source', effacerSource,
    cibles: ['cible', 'resultat'], choix: [],
  }
}

function corpus(): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION,
    codebook: {
      source: { id: 'source', nom: 'Source', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      cible: { id: 'cible', nom: 'Cible', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' },
      resultat: { id: 'resultat', nom: 'Résultat', ordre: 2, parent: null, actif: true, codeExport: 'cat_003' },
      enfant: { id: 'enfant', nom: 'Enfant', ordre: 3, parent: 'source', actif: true, codeExport: 'cat_004' },
    },
    variables: {}, reglesAnon: {}, personnes: {},
    membership: {
      e1: { titre: 'Premier', date: null, lastModified: 'hier' },
      e2: { titre: 'Second', date: null, lastModified: 'hier' },
    },
  }
}

function entretien(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION, lastModified: 'hier',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bonjour tout le monde' }] }] },
    annotations: [
      { id: 'a', type: 'codage', code: 'source', from: 1, to: 8, auteur: 'auteur' },
      { id: 'orphelin', type: 'codage', code: 'source', from: 9, to: 9, auteur: 'auteur' },
      { id: 'cible', type: 'codage', code: 'cible', from: 1, to: 8, auteur: 'auteur' },
      { id: 'anon', type: 'anon', from: 1, to: 8, auteur: 'auteur', pseudo: 'Martin' },
      { id: 'commentaire', type: 'commentaire', from: 1, to: 8, auteur: 'auteur', texte: 'mémo' },
    ],
    ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
  }
}

function instantane(): InstantaneOperationTheme {
  const c = corpus()
  return {
    corpus: c,
    entretiens: Object.entries(c.membership).map(([id, ref]) => ({
      id, titre: ref.titre, ok: true, avant: entretien(), data: entretien(),
    })),
  }
}

function bancService(configuration: { dureeCacheMs?: number; maxApercus?: number; maxOctetsCache?: number } = {}) {
  let snapshot = instantane()
  let now = 1000
  let n = 0
  let cat = 0
  let pending = false
  const lire = vi.fn(() => structuredClone(snapshot))
  const appliquer = vi.fn((_plan: PlanRemplacementEntretiens) => {})
  const verifierEcriture = vi.fn()
  const genIdCategorie = vi.fn(() => `nouvelle-${++cat}`)
  const service = new OperationsThemesCorpus({
    lire, appliquer, verifierEcriture, transactionEnAttente: () => pending,
    genIdCategorie, genIdOperation: () => `op-${++n}`, maintenant: () => now, ...configuration,
  })
  return {
    service, lire, appliquer, verifierEcriture, genIdCategorie,
    snapshot: () => snapshot,
    changer: (valeur: InstantaneOperationTheme) => { snapshot = valeur },
    avancer: (ms: number) => { now += ms },
    suspendre: () => { pending = true },
  }
}

function bancDisque() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-themes-'))
  dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  const ecrire = (nom: string, valeur: unknown) => writeFileSync(join(dir, nom), JSON.stringify(valeur, null, 2))
  const lire = (nom: string) => JSON.parse(readFileSync(join(dir, nom), 'utf8'))
  ecrire('corpus.json', corpus())
  ecrire('entretiens/e1.json', entretien())
  ecrire('entretiens/e2.json', entretien())
  return { dir, ecrire, lire, store: new CorpusStore(dir) }
}

describe('aperçus main versionnés', () => {
  test('aperçu et détails comptent les orphelins, conservent le contexte et n’écrivent rien', () => {
    const banc = bancService()
    const apercu = banc.service.analyser(transfert)
    expect(apercu).toMatchObject({
      faisable: true, totaux: { entretiens: 2, passages: 4, orphelins: 2, doublonsPrevisibles: 2 },
    })
    expect(apercu.parEntretien.every((e) => e.aModifier)).toBe(true)
    const details = banc.service.details(apercu.operationId, 'e1')
    expect(details.codages).toHaveLength(2)
    expect(details.codages[0]).toMatchObject({ codage: { entretienId: 'e1', annotationId: 'a' }, extrait: 'bonjour', apres: ' tout le monde' })
    expect(details.codages[1]).toMatchObject({ orphelin: true, extrait: '', avant: '', apres: '' })
    details.codages[0].extrait = 'modifié dans le renderer'
    expect(banc.service.details(apercu.operationId, 'e1').codages[0].extrait).toBe('bonjour')
    expect(banc.appliquer).not.toHaveBeenCalled()
    expect(banc.genIdCategorie).not.toHaveBeenCalled()
  })

  test('un extrait peut traverser deux paragraphes', () => {
    const banc = bancService()
    const snapshot = banc.snapshot()
    const e = snapshot.entretiens[0]
    if (!e.ok) throw new Error('banc')
    e.data.corpsTexte = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'un' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'deux' }] },
    ] }
    e.data.annotations = [{ ...e.data.annotations[0], from: 2, to: 7 }]
    const apercu = banc.service.analyser(transfert)
    expect(banc.service.details(apercu.operationId, 'e1').codages[0]).toMatchObject({ avant: 'u', extrait: 'n\nde', apres: 'ux' })
  })

  test('le périmètre d’écriture de la division dépend des choix, pas de tous les usages', () => {
    const banc = bancService()
    const demande = division()
    const initial = banc.service.analyser(demande)
    expect(initial.parEntretien.every((e) => !e.aModifier)).toBe(true)
    demande.choix.push({ codage: { entretienId: 'e2', annotationId: 'a' }, destination: 'cible' })
    const actualise = banc.service.analyser(demande, initial.operationId)
    expect(actualise.parEntretien.map((e) => e.aModifier)).toEqual([false, true])
    expect(() => banc.service.details(initial.operationId, 'e1')).toThrow(/absent, expiré/)
  })

  test('division destructive incomplet : aperçu infaisable, sans création de destination', () => {
    const banc = bancService()
    const demande = division(true)
    const apercu = banc.service.analyser(demande)
    expect(apercu.faisable).toBe(false)
    expect(apercu.obstacles).toContainEqual({ phase: 'finalisation', motif: expect.stringMatching(/non répartis/) })
    expect(banc.service.executer(apercu.operationId, demande, options).statut).toBe('non-appliquee')
    expect(banc.genIdCategorie).not.toHaveBeenCalled()
  })

  test('expire, évince et vide les aperçus', () => {
    const banc = bancService({ dureeCacheMs: 10, maxApercus: 1 })
    const premier = banc.service.analyser(transfert)
    const second = banc.service.analyser(fusion)
    expect(() => banc.service.details(premier.operationId, 'e1')).toThrow(/expiré/)
    banc.avancer(10)
    expect(() => banc.service.details(second.operationId, 'e1')).toThrow(/expiré/)
    const troisieme = banc.service.analyser(transfert)
    banc.service.vider()
    expect(() => banc.service.details(troisieme.operationId, 'e1')).toThrow(/absent/)
  })

  test('borne aussi le volume du cache', () => {
    expect(() => bancService({ maxOctetsCache: 1 }).service.analyser(transfert)).toThrow(/volumineux/)
  })

  test.each(['ajout', 'suppression', 'deplacement', 'texte', 'definitions', 'membership'])('refuse tout l’opération locale après un changement de %s', (changement) => {
    const banc = bancService()
    const demande = division()
    demande.choix.push({ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'cible' })
    const apercu = banc.service.analyser(demande)
    const snapshot = banc.snapshot()
    const e = snapshot.entretiens[0]
    if (!e.ok) throw new Error('banc')
    if (changement === 'ajout') e.avant.annotations.push({ ...e.avant.annotations[0], id: 'nouvelle' })
    if (changement === 'suppression') e.avant.annotations.shift()
    if (changement === 'deplacement') e.avant.annotations[0].to++
    if (changement === 'texte') e.avant.corpsTexte = { type: 'doc', content: [] }
    if (changement === 'definitions') snapshot.corpus.codebook.source.nom = 'Autre'
    if (changement === 'membership') delete snapshot.corpus.membership.e1
    expect(banc.service.executer(apercu.operationId, demande, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/a changé/) })
    expect(() => banc.service.analyser(demande, apercu.operationId)).toThrow()
    expect(banc.appliquer).not.toHaveBeenCalled()
    expect(banc.genIdCategorie).not.toHaveBeenCalled()
  })

  test('la demande et les options sont liées à l’aperçu, pas à une liste IPC arbitraire', () => {
    const banc = bancService()
    const apercu = banc.service.analyser(transfert)
    expect(banc.service.executer(apercu.operationId, fusion, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/demande a changé/) })
    expect(banc.service.executer(apercu.operationId, transfert, { entretiens: 'observes-libres' })).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/tous les entretiens/) })
    expect(banc.appliquer).not.toHaveBeenCalled()
  })

  test('le même aperçu ne peut être exécuté deux fois, la progression porte son operationId', () => {
    const banc = bancService()
    const apercu = banc.service.analyser(transfert)
    const progression = vi.fn()
    expect(banc.service.executer(apercu.operationId, transfert, options, progression)).toMatchObject({ statut: 'appliquee', entretiens: 2, reaffectes: 2, doublonsSupprimes: 2 })
    expect(progression.mock.calls.map(([e]) => [e.operationId, e.termines, e.total])).toEqual([[apercu.operationId, 0, 2], [apercu.operationId, 2, 2]])
    expect(banc.service.executer(apercu.operationId, transfert, options).statut).toBe('non-appliquee')
    expect(banc.appliquer).toHaveBeenCalledOnce()
  })

  test('une erreur de panneau ne perd pas le résultat ; un journal présent interdit un nouveau lot', () => {
    const banc = bancService()
    const apercu = banc.service.analyser(transfert)
    expect(banc.service.executer(apercu.operationId, transfert, options, () => { throw new Error('panneau fermé') }).statut).toBe('appliquee')
    const suivant = banc.service.analyser(fusion)
    banc.appliquer.mockImplementationOnce(() => { banc.suspendre(); throw new Error('disque interrompu') })
    expect(banc.service.executer(suivant.operationId, fusion, options)).toMatchObject({ statut: 'indeterminee', operationId: suivant.operationId })
    expect(() => banc.service.analyser(transfert)).toThrow(/transaction locale/)
  })

  test('une fusion peut retirer deux thématiques au profit d’une troisième déjà existante', () => {
    const banc = bancService()
    const demande: DemandeOperationTheme = {
      type: 'fusion', sources: ['source', 'cible'], cible: 'resultat',
    }
    const apercu = banc.service.analyser(demande)
    expect(apercu).toMatchObject({
      sources: ['source', 'cible'],
      totaux: { passages: 6, doublonsPrevisibles: 2, sousThemesDeplaces: 1 },
    })
    expect(banc.service.executer(apercu.operationId, demande, options)).toMatchObject({
      statut: 'appliquee', entretiens: 2, reaffectes: 4, doublonsSupprimes: 2,
    })
    const plan = banc.appliquer.mock.calls[0][0]
    expect(plan.corpusApres.codebook.source).toBeUndefined()
    expect(plan.corpusApres.codebook.cible).toBeUndefined()
    expect(plan.corpusApres.codebook.enfant.parent).toBe('resultat')
    expect(plan.entretiens.every((e) => e.apres.annotations
      .filter((a) => a.type === 'codage').every((a) => a.code === 'resultat'))).toBe(true)
  })

  test('la suppression protège aussi les entretiens lus sans modification', () => {
    const banc = bancService()
    const entree = banc.snapshot().entretiens[1]
    if (!entree.ok) throw new Error('banc')
    entree.data.annotations = []
    entree.avant.annotations = []
    const apercu = banc.service.analyser(fusion)
    expect(banc.service.executer(apercu.operationId, fusion, options)).toMatchObject({ statut: 'appliquee', entretiens: 1 })
    const plan = banc.appliquer.mock.calls[0][0]
    expect(plan.entretiens).toHaveLength(2)
    expect(plan.entretiens[1].avant).toEqual(plan.entretiens[1].apres)
  })
})

describe('parcours local du store', () => {
  test.each(['absent', 'illisible', 'version', 'incomplet', 'dossier'])('nomme un membre %s sans le compter comme zéro usage ni écrire', (etat) => {
    const banc = bancDisque()
    const fichier = join(banc.dir, 'entretiens/e2.json')
    if (etat === 'absent' || etat === 'dossier') rmSync(fichier)
    if (etat === 'dossier') mkdirSync(fichier)
    if (etat === 'illisible') writeFileSync(fichier, '{invalide')
    if (etat === 'version') banc.ecrire('entretiens/e2.json', { ...entretien(), formatVersion: 999 })
    if (etat === 'incomplet') banc.ecrire('entretiens/e2.json', { formatVersion: FORMAT_VERSION })
    const avant = readFileSync(join(banc.dir, 'corpus.json'), 'utf8')
    const apercu = banc.store.analyserOperationTheme(transfert)
    expect(apercu.faisable).toBe(false)
    expect(apercu.obstacles).toContainEqual({ phase: 'entretiens', entretienId: 'e2', motif: expect.any(String) })
    expect(apercu.parEntretien.map((e) => e.id)).toEqual(['e1'])
    expect(() => banc.store.detailsOperationTheme(apercu.operationId, 'e2')).toThrow(/indisponible/)
    expect(banc.store.executerOperationTheme(apercu.operationId, transfert, options).statut).toBe('non-appliquee')
    expect(readFileSync(join(banc.dir, 'corpus.json'), 'utf8')).toBe(avant)
  })

  test('refuse les versions de corpus inconnues et la traversée de chemins du membership', () => {
    const banc = bancDisque()
    banc.ecrire('corpus.json', { ...corpus(), formatVersion: 999 })
    expect(() => banc.store.analyserOperationTheme(transfert)).toThrow(/Version de corpus/)
    const c = corpus()
    c.membership['../secret'] = { titre: 'secret', date: null, lastModified: '' }
    banc.ecrire('corpus.json', c)
    expect(banc.store.analyserOperationTheme(transfert).obstacles).toContainEqual({ phase: 'entretiens', entretienId: '../secret', motif: expect.stringMatching(/Identifiant/) })
  })

  test('un aperçu d’un autre store et un cache vidé sont inutilisables', () => {
    const a = bancDisque()
    const b = bancDisque()
    const apercu = a.store.analyserOperationTheme(transfert)
    expect(b.store.executerOperationTheme(apercu.operationId, transfert, options).statut).toBe('non-appliquee')
    a.store.viderApercusOperationTheme()
    expect(() => a.store.detailsOperationTheme(apercu.operationId, 'e1')).toThrow(/absent/)
  })

  test('le transfert conserve la source, le codebook, les autres annotations et rafraîchit les usages', () => {
    const banc = bancDisque()
    const corpusAvant = readFileSync(join(banc.dir, 'corpus.json'), 'utf8')
    const apercu = banc.store.analyserOperationTheme(transfert)
    const resultat = banc.store.executerOperationTheme(apercu.operationId, transfert, options)
    expect(resultat).toMatchObject({ statut: 'appliquee', reaffectes: 2, doublonsSupprimes: 2 })
    expect(readFileSync(join(banc.dir, 'corpus.json'), 'utf8')).toBe(corpusAvant)
    expect(banc.lire('entretiens/e1.json').annotations.filter((a: { type: string }) => a.type !== 'codage')).toEqual(entretien().annotations.filter((a) => a.type !== 'codage'))
    expect(banc.store.usagesParCategorie()).toMatchObject({ cible: 4 })
    expect(banc.store.usagesParCategorie().source ?? 0).toBe(0)
    expect(Object.keys(banc.store.resumesThematiques())).toEqual(['e1', 'e2'])
    expect(existsSync(join(banc.dir, '.transaction-fichiers.json'))).toBe(false)
  })

  test('transfert local sans conservation : retrait de la source et promotion de ses enfants', () => {
    const banc = bancDisque()
    const demande = { ...transfert, conserverSource: false }
    const apercu = banc.store.analyserOperationTheme(demande)
    const resultat = banc.store.executerOperationTheme(apercu.operationId, demande, options)
    expect(resultat.statut).toBe('appliquee')
    expect(banc.lire('corpus.json').codebook.source).toBeUndefined()
    expect(banc.lire('corpus.json').codebook.enfant.parent).toBeNull()
    expect(banc.lire('entretiens/e1.json').annotations.filter((a: { code?: string }) => a.code === 'source')).toEqual([])
  })

  test('fusion locale : retrait et déplacement d’enfants après les réaffectations', () => {
    const banc = bancDisque()
    const apercu = banc.store.analyserOperationTheme(fusion)
    const resultat = banc.store.executerOperationTheme(apercu.operationId, fusion, options)
    expect(resultat.statut).toBe('appliquee')
    expect(banc.lire('corpus.json').codebook.source).toBeUndefined()
    expect(banc.lire('corpus.json').codebook.enfant.parent).toBe('cible')
    expect(banc.lire('entretiens/e1.json').annotations.filter((a: { code?: string }) => a.code === 'source')).toEqual([])
  })

  test.each([false, true])('division locale vers des destinations existantes, source supprimée = %s', (effacer) => {
    const banc = bancDisque()
    const demande = division(effacer)
    for (const entretienId of ['e1', 'e2']) {
      demande.choix.push({ codage: { entretienId, annotationId: 'a' }, destination: 'cible' })
      if (effacer) demande.choix.push({ codage: { entretienId, annotationId: 'orphelin' }, destination: 'resultat' })
    }
    const apercu = banc.store.analyserOperationTheme(demande)
    const resultat = banc.store.executerOperationTheme(apercu.operationId, demande, options)
    expect(resultat.statut).toBe('appliquee')
    const c = banc.lire('corpus.json') as CorpusFichier
    expect(c.codebook.cible.parent).toBeNull()
    expect(c.codebook.resultat.parent).toBeNull()
    expect(Boolean(c.codebook.source)).toBe(!effacer)
    const annotations = banc.lire('entretiens/e1.json').annotations as EntretienFichier['annotations']
    expect(annotations.filter((a) => a.type === 'codage' && a.code === 'cible')).toHaveLength(1)
    expect(annotations.find((a) => a.id === 'orphelin')?.code).toBe(effacer ? 'resultat' : 'source')
  })

  test('un entretien ajouté après l’aperçu interdit la suppression entière', () => {
    const banc = bancDisque()
    const apercu = banc.store.analyserOperationTheme(fusion)
    const c = banc.lire('corpus.json') as CorpusFichier
    c.membership.e3 = { titre: 'Nouveau', date: null, lastModified: '' }
    banc.ecrire('corpus.json', c)
    banc.ecrire('entretiens/e3.json', entretien())
    expect(banc.store.executerOperationTheme(apercu.operationId, fusion, options).statut).toBe('non-appliquee')
    expect(banc.lire('entretiens/e1.json')).toEqual(entretien())
    expect(banc.lire('corpus.json').codebook.source).toBeDefined()
  })

  test('un ancien entretien supporté est adapté en mémoire, sans écriture d’aperçu', () => {
    const banc = bancDisque()
    const ancien = { ...entretien(), formatVersion: 2 }
    banc.ecrire('entretiens/e1.json', ancien)
    const avant = readFileSync(join(banc.dir, 'entretiens/e1.json'), 'utf8')
    const apercu = banc.store.analyserOperationTheme(transfert)
    expect(apercu.faisable).toBe(true)
    expect(readFileSync(join(banc.dir, 'entretiens/e1.json'), 'utf8')).toBe(avant)
    expect(banc.store.executerOperationTheme(apercu.operationId, transfert, options).statut).toBe('appliquee')
    expect(banc.lire('entretiens/e1.json').formatVersion).toBe(FORMAT_VERSION)
  })

  test('la transaction garde les entretiens inchangés contre une nouvelle référence après préparation', () => {
    const banc = bancDisque()
    banc.ecrire('entretiens/e2.json', { ...entretien(), annotations: [] })
    const apercu = banc.store.analyserOperationTheme(fusion)
    const resultat = banc.store.executerOperationTheme(apercu.operationId, fusion, options, (etat) => {
      if (etat.termines === 0) banc.ecrire('entretiens/e2.json', entretien())
    })
    expect(resultat.statut).toBe('indeterminee')
    expect(banc.lire('corpus.json').codebook.source).toBeDefined()
    expect(banc.lire('entretiens/e1.json')).toEqual(entretien())
    expect(() => new CorpusStore(banc.dir).ouvrir()).toThrow(/e2.*a changé/)
  })

  test('des références thématiques invalides sont refusées avant toute écriture', () => {
    const banc = bancDisque()
    const data = entretien()
    data.annotations.push({ ...data.annotations[0], id: 'inconnu', code: 'absente' })
    banc.ecrire('entretiens/e1.json', data)
    const apercu = banc.store.analyserOperationTheme(transfert)
    expect(apercu.faisable).toBe(false)
    expect(apercu.obstacles).toContainEqual({ phase: 'entretiens', entretienId: 'e1', motif: expect.stringMatching(/thématique absente/) })
    expect(banc.store.executerOperationTheme(apercu.operationId, transfert, options).statut).toBe('non-appliquee')
    expect(banc.lire('entretiens/e1.json')).toEqual(data)
  })

  test('la défense du store refuse une exécution directe sur un miroir en lecture seule', () => {
    const banc = bancDisque()
    const apercu = banc.store.analyserOperationTheme(transfert)
    banc.store.lectureSeule = true
    expect(banc.store.executerOperationTheme(apercu.operationId, transfert, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/pas modifiable directement/) })
    expect(banc.lire('entretiens/e1.json')).toEqual(entretien())
  })
})

describe('gardes des handlers thèmes', () => {
  test('le handler de division exige la garde destructive avant toute préparation', () => {
    const store = { analyserOperationTheme: vi.fn(), executerOperationTheme: vi.fn(), detailsOperationTheme: vi.fn() } as unknown as CorpusStore
    const handlers = creerHandlersOperationsThemes({ store: () => store, fournisseur: () => 'webdav', progression: vi.fn() })
    expect(() => handlers.analyser(division(true))).toThrow(/suppression de la thématique source/)
    expect(() => handlers.executer('id', division(true), options)).toThrow(/suppression de la thématique source/)
    expect(() => handlers.analyser({ ...transfert, conserverSource: false })).toThrow(/suppression de la thématique source/)
    expect(store.analyserOperationTheme).not.toHaveBeenCalled()
    expect(store.executerOperationTheme).not.toHaveBeenCalled()
    expect(() => exigerGestesOperationTheme('gitlab', transfert)).not.toThrow()
  })

  test('le dispatch distant ne retombe jamais sur les méthodes du miroir', () => {
    const store = { analyserOperationTheme: vi.fn(), executerOperationTheme: vi.fn(), detailsOperationTheme: vi.fn() } as unknown as CorpusStore
    const handlers = creerHandlersOperationsThemes({ store: () => store, fournisseur: () => 'webdav', progression: vi.fn() })
    expect(() => handlers.analyser(transfert)).toThrow(/pas encore livré/)
    expect(() => handlers.details('id', 'e1')).toThrow(/pas encore livré/)
    expect(() => handlers.executer('id', transfert, options)).toThrow(/pas encore livré/)
    expect(store.analyserOperationTheme).not.toHaveBeenCalled()
    expect(store.executerOperationTheme).not.toHaveBeenCalled()
    expect(store.detailsOperationTheme).not.toHaveBeenCalled()
  })

  test('les handlers consultent le store courant et transmettent la progression', async () => {
    const a = bancDisque()
    const b = bancDisque()
    let store = a.store
    const progression: ProgressionOperationTheme[] = []
    const handlers = creerHandlersOperationsThemes({ store: () => store, fournisseur: () => 'local', progression: (etat) => progression.push(etat) })
    const apercu = await handlers.analyser(transfert)
    store = b.store
    expect((await handlers.executer(apercu.operationId, transfert, options)).statut).toBe('non-appliquee')
    store = a.store
    expect((await handlers.executer(apercu.operationId, transfert, options)).statut).toBe('appliquee')
    expect(progression.map((etat) => etat.operationId)).toEqual([apercu.operationId, apercu.operationId])
  })
})
