import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { CorpusStore, completerIdsLocuteurs } from '../src/main/corpusStore'
import { preparerIdentitesImportV1 } from '../src/shared/corpus/importIdentitesV1'
import type { Locuteur, ParticipationLocuteur, ReferenceParticipation, RefusRapprochementLocuteur } from '../src/shared/locuteurs'
import type { PayloadEntretien } from '../src/shared/format'

const injections = vi.hoisted(() => ({ apresRenommage: undefined as ((destination: string) => void) | undefined }))
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      fs.renameSync(...args)
      injections.apresRenommage?.(String(args[1]))
    },
  }
})

const dossiers: string[] = []
afterEach(() => {
  injections.apresRenommage = undefined
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-identites-v1-'))
  dossiers.push(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  return { dir, store }
}

function payload(): PayloadEntretien {
  return {
    corpsTexte: { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Premier Alex.' }] },
      { type: 'paragraph', attrs: { loc: 3 }, content: [{ type: 'text', text: 'Second Alex.' }] },
      { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans attribution.' }] },
    ] },
    ancres: [{ pos: 1, t: 0 }], annotations: [],
    meta: { valeursGen: { lieu: 'ici' }, audioRef: null },
    participations: [
      { id: 'loc-conserve', index: 1, nom: 'Alex', pseudo: 'A', pseudoEtat: 'confirme', couleur: '#123456', interviewer: true, valeursLoc: { age: 'jeune' }, locuteurRef: null },
      { id: "loc-3", index: 3, nom: 'Alex', interviewer: false, valeursLoc: { age: 'adulte' }, locuteurRef: null },
      { id: "loc-4", index: 4, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, locuteurRef: null },
      { id: "loc-5", index: 5, nom: 'X', valeursLoc: {}, locuteurRef: null },
      { id: "loc-8", index: 8, nom: 'Inconnu', valeursLoc: { age: 'adulte' }, locuteurRef: null },
    ],
    notes: [{ id: 'note', categorieId: 'ncat_generale', titre: 'Note locale', date: null, statut: 'prive', corps: 'À conserver', participationIds: ['loc-conserve'], rang: 0, creeLe: '', modifieLe: null }],
  }
}

function horsAssociation(locuteur: PayloadEntretien['participations'][number]) {
  const { id: _id, locuteurRef: _ref, ...local } = locuteur
  return local
}

describe('contrats des identités et participations', () => {
  test('sépare l’identité commune, les données locales et la référence contextualisée', () => {
    expectTypeOf<keyof Locuteur>().toEqualTypeOf<'id' | 'nom'>()
    expectTypeOf<ParticipationLocuteur['id']>().toEqualTypeOf<string>()
    expectTypeOf<ParticipationLocuteur['locuteurRef']>().toEqualTypeOf<string | null>()
    expectTypeOf<ReferenceParticipation>().toEqualTypeOf<{ entretienId: string; participationId: string }>()
    expectTypeOf<Extract<RefusRapprochementLocuteur, { type: 'participation' }>>()
      .toEqualTypeOf<{ type: 'participation' } & ReferenceParticipation>()
  })

  test('complète les ids locaux sans dépendre des noms ni de l’ordre du tableau', () => {
    const source = payload().participations.map((p, i) => i ? { ...p, id: undefined } : p)
    const avant = structuredClone(source)
    const premier = completerIdsLocuteurs('entretien-a', source)
    const renommes = source.toReversed().map((locuteur) => ({ ...locuteur, nom: 'Autre nom' }))
    const second = completerIdsLocuteurs('entretien-a', renommes)
    expect(new Map(premier.map((l) => [l.index, l.id]))).toEqual(new Map(second.map((l) => [l.index, l.id])))
    expect(premier[0].id).toBe('loc-conserve')
    expect(premier[1].id).not.toBe(completerIdsLocuteurs('entretien-b', source)[1].id)
    expect(completerIdsLocuteurs('entretien-a', premier)).toEqual(premier)
    expect(source).toEqual(avant)
  })

  test('reprend un id local existant par index, mais ne remplace jamais un id fourni', () => {
    const source = payload().participations.map((p, i) => i ? { ...p, id: undefined } : p)
    const existants = source.map((locuteur) => ({ ...locuteur, id: `historique-${locuteur.index}` }))
    const completes = completerIdsLocuteurs('entretien', source, existants)
    expect(completes.map((l) => l.id)).toEqual(['loc-conserve', 'historique-3', 'historique-4', 'historique-5', 'historique-8'])
  })

  test('la préparation ne rapproche ni les homonymes ni les noms de rôle', () => {
    const existants = { ancien: { id: 'ancien', nom: 'Alex' } }
    const participations = completerIdsLocuteurs('entretien', payload().participations)
    const avant = structuredClone([existants, participations])
    let numero = 0
    const resultat = preparerIdentitesImportV1(existants, participations, () => `identite-${++numero}`)
    expect(resultat.locuteurs.map((l) => l.nom)).toEqual(['Alex', 'Alex', 'Enquêteur', 'X', 'Inconnu'])
    expect(new Set(resultat.associations.values()).size).toBe(5)
    expect([...resultat.associations.keys()]).toEqual(participations.map((p) => p.id))
    expect([existants, participations]).toEqual(avant)
  })

  test.each(['ancien', 'doublon', ''])('un id d’identité invalide ne modifie pas les entrées : %s', (id) => {
    const existants = { ancien: { id: 'ancien', nom: 'Alex' } }
    const participations = completerIdsLocuteurs('entretien', payload().participations)
    const avant = structuredClone([existants, participations])
    expect(() => preparerIdentitesImportV1(existants, participations, () => id)).toThrow('Identifiant')
    expect([existants, participations]).toEqual(avant)
  })

  test('un import sans participation ne crée pas d’identité', () => {
    const generer = vi.fn()
    expect(preparerIdentitesImportV1({}, [], generer)).toEqual({ locuteurs: [], associations: new Map() })
    expect(generer).not.toHaveBeenCalled()
  })
})

describe('préparation commune des imports V1', () => {
  test('prépare ensemble les nouvelles identités et les associations, sans écrire ni modifier la source', () => {
    const { dir, store } = banc()
    store.personnesCommander({ type: 'creerDefinition', nom: 'Alex' })
    const source = payload()
    const avant = structuredClone(source)
    const fichierCorpus = join(dir, 'corpus.crp')
    const contenuAvant = readFileSync(fichierCorpus, 'utf8')
    const plan = store.preparerImportEntretien('Import V1', source, [], [], [], 'v1')
    expect(readFileSync(fichierCorpus, 'utf8')).toBe(contenuAvant)
    expect(existsSync(join(dir, 'entretiens', `${plan.id}.json`))).toBe(false)
    expect(plan.corpusAvant).toEqual(JSON.parse(contenuAvant))
    expect(Object.values(plan.corpusApres.locuteurs)).toHaveLength(6)
    expect(plan.entretien.participations.map(horsAssociation)).toEqual(source.participations.map(horsAssociation))
    expect(plan.entretien.participations[0].id).toBe('loc-conserve')
    expect(new Set(plan.entretien.participations.map((l) => l.locuteurRef)).size).toBe(5)
    for (const locuteur of plan.entretien.participations) {
      expect(plan.corpusApres.locuteurs[locuteur.locuteurRef!]).toEqual({ id: locuteur.locuteurRef, nom: locuteur.nom })
    }
    const { participations: _locuteurs, formatVersion: _version, lastModified: _date, reperesPassages: _reperes, ...reste } = plan.entretien
    const { participations: _sourceLocuteurs, ...sourceReste } = source
    expect(reste).toEqual(sourceReste)
    expect(source).toEqual(avant)
  })

  test('deux imports du même contenu gardent des identités distinctes, y compris avec un même id local fourni', () => {
    const { store } = banc()
    const a = store.importerEntretien('Premier', payload(), [], [], [], 'v1')
    const b = store.importerEntretien('Second', payload(), [], [], [], 'v1')
    const inventaire = store.personnesInventaire()
    expect(inventaire.locuteurs).toHaveLength(10)
    expect(new Set(inventaire.participations.map((l) => l.locuteurRef)).size).toBe(10)
    expect(inventaire.participations.filter((l) => l.participationId === 'loc-conserve').map((l) => l.entretienId).sort()).toEqual([a.id, b.id].sort())
  })

  test('hors import V1, conserve les associations absentes ou volontairement retirées', () => {
    const { store } = banc()
    const source = payload()
    source.participations[0].associationRetiree = true
    source.participations[0].rapprochementsRefuses = ['personne:historique', 'locuteur:autre']
    const avant = structuredClone(source)
    const plan = store.preparerImportEntretien('Autre import', source)
    expect(plan.corpusApres.locuteurs).toEqual({})
    expect(plan.entretien.participations[0]).toEqual(source.participations[0])
    expect(plan.entretien.participations.every((l) => l.locuteurRef === null)).toBe(true)
    expect(source).toEqual(avant)
  })

  test.each(['.transaction-fichiers.json', 'entretien', 'corpus.crp'])('reprend un import V1 interrompu après %s sans recréer ses identités', (stade) => {
    const { dir, store } = banc()
    const plan = store.preparerImportEntretien('Import V1', payload(), [], [], [], 'v1')
    const cible = stade === 'entretien' ? `entretiens/${plan.id}.json` : stade
    injections.apresRenommage = (destination) => {
      if (relative(dir, destination).split('\\').join('/') === cible) throw new Error('Arrêt simulé')
    }
    expect(() => store.appliquerTransactionFichiers(plan)).toThrow('Arrêt simulé')
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
    injections.apresRenommage = undefined
    const relu = new CorpusStore(dir)
    expect(relu.ouvrir()).toEqual(plan.corpusApres)
    const lecture = relu.lireEntretien(plan.id)
    expect(lecture.ok && lecture.data).toEqual(plan.entretien)
    expect(relu.personnesInventaire().locuteurs).toHaveLength(5)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(false)
    expect(new CorpusStore(dir).personnesInventaire()).toEqual(relu.personnesInventaire())
  })
})
