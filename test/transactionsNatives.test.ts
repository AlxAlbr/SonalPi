import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { TransactionsFichiersCorpus } from '../src/main/transactionsFichiers'
import { preparerAjoutEntretienNatif, preparerCreationEntretienNatif } from '../src/main/preparationsNatives'
import { completerIdsLocuteurs } from '../src/main/corpusStore'
import { preparerCorpusImportV1, preparerEntretienImportV1 } from '../src/shared/natif/importV1'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
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

function preparer() {
  const corpus = preparerCorpusImportV1('Corpus cible', { cheminCrp: '/V1/Mon terrain.crp', dateCreation: null }, [], [{
    id: 'age', lib: 'Âge', portee: "participation", priv: false, ordre: 0, vExport: 1,
    modalites: [{ id: 'adulte', lib: 'Adulte', mExport: 1 }],
  }])
  const payload: PayloadEntretien = {
    corpsTexte: { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Premier Alex.' }] },
      { type: 'paragraph', attrs: { loc: 3 }, content: [{ type: 'text', text: 'Second Alex.' }] },
    ] },
    annotations: [], ancres: [], meta: { valeursGen: {}, audioRef: null },
    participations: [
      { id: 'local-conserve', index: 1, nom: 'Alex', locuteurRef: null, valeursLoc: { age: 'adulte' } },
      { id: "loc-3", index: 3, nom: 'Alex', locuteurRef: null, interviewer: true, valeursLoc: {} },
    ],
    notes: [{ id: 'note', categorieId: 'generale', titre: '', date: null, statut: 'prive', corps: 'Note locale',
      participationIds: ['local-conserve'], rang: 0, creeLe: '', modifieLe: null }],
  }
  let numero = 0
  const generer = vi.fn(() => `identite-${++numero}`)
  const cible = preparerEntretienImportV1(corpus.locuteurs, {
    ...payload, participations: completerIdsLocuteurs('e1', payload.participations),
  }, '2026-01-01T10:00:00.000Z', generer)
  const plan = preparerAjoutEntretienNatif(corpus, 'e1', 'Entretien importé', cible.entretien, cible.locuteurs)
  const dir = mkdtempSync(join(tmpdir(), 'sonal-transaction-native-'))
  dossiers.push(dir)
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(plan.corpusAvant, null, 2))
  const fichiers = () => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile()).map((f) => join(f.parentPath, f.name)).sort()
    .map((chemin) => [chemin, readFileSync(chemin)])
  return { dir, corpus, payload, cible, plan, generer, fichiers,
    transactions: () => new TransactionsFichiersCorpus(dir),
    lire: (relatif: string) => JSON.parse(readFileSync(join(dir, relatif), 'utf8')) }
}

describe('écriture native par le journal de transactions existant', () => {
  test('publie les champs cibles sans anciens noms, avec les notes toujours locales', () => {
    const b = preparer()
    const avant = structuredClone([b.corpus, b.payload, b.cible])
    b.transactions().executer(b.plan)
    const corpus = b.lire('corpus.crp')
    const entretien = b.lire('entretiens/e1.json')
    validerCorpusNatif(corpus); validerEntretienNatif(entretien)
    expect(corpus).toEqual(b.plan.corpusApres)
    expect(entretien).toEqual(b.plan.entretien)
    expect(corpus).not.toHaveProperty("personnes")
    expect(corpus.variables.age.portee).toBe('participation')
    expect(entretien).not.toHaveProperty('locuteurs')
    expect(entretien.participations.map((p) => p.index)).toEqual([1, 3])
    expect(new Set(entretien.participations.map((p) => p.locuteurRef)).size).toBe(2)
    expect(entretien.notes![0].participationIds).toEqual(['local-conserve'])
    expect(entretien.notes![0]).not.toHaveProperty('locuteurIds')
    expect(Object.values(corpus.locuteurs).map((p) => p.nom)).toEqual(['Alex', 'Alex'])
    expect(b.generer).toHaveBeenCalledTimes(2)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    expect([b.corpus, b.payload, b.cible]).toEqual(avant)
  })

  test.each(['.transaction-fichiers.json', 'entretiens/e1.json', 'corpus.crp'])('reprend après %s sans changer les ids ni les attributions', (stade) => {
    const b = preparer()
    injections.apresRenommage = (destination) => {
      if (relative(b.dir, destination).split('\\').join('/') === stade) throw new Error('Arrêt simulé')
    }
    expect(() => b.transactions().executer(b.plan)).toThrow('Arrêt simulé')
    injections.apresRenommage = undefined
    const journal = b.lire('.transaction-fichiers.json')
    expect(journal.formatVersion).toBe(1)
    expect(journal.plan.corpusAvant.formatVersion).toBe(10)
    expect(journal.plan.entretien.formatVersion).toBe(10)
    expect(b.transactions().reprendre()).toBe(true)
    expect(b.transactions().reprendre()).toBe(false)
    expect(b.lire('corpus.crp')).toEqual(b.plan.corpusApres)
    expect(b.lire('entretiens/e1.json')).toEqual(b.plan.entretien)
    expect(b.generer).toHaveBeenCalledTimes(2)
  })

  test('refuse un état modifié extérieurement et garde son journal pour assistance', () => {
    const b = preparer()
    writeFileSync(join(b.dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan: b.plan }))
    writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify({ ...b.plan.corpusAvant, nom: 'Modification extérieure' }))
    const avant = b.fichiers()
    expect(() => b.transactions().reprendre()).toThrow('corpus.crp a changé')
    expect(b.fichiers()).toEqual(avant)
  })

  test.each(['version-corpus', 'version-entretien', 'identite-absente', 'identite-dupliquee', 'note-globale'])(
    'refuse un plan incohérent avant tout journal ou écriture : %s', (cas) => {
      const b = preparer()
      if (cas === 'version-corpus') Object.assign(b.plan.corpusAvant, { formatVersion: 9 })
      if (cas === 'version-entretien') Object.assign(b.plan.entretien, { formatVersion: 9 })
      if (cas === 'identite-absente') b.plan.entretien.participations[0].locuteurRef = 'absente'
      if (cas === 'identite-dupliquee') b.plan.entretien.participations[1].locuteurRef = b.plan.entretien.participations[0].locuteurRef
      if (cas === 'note-globale') b.plan.entretien.notes![0].participationIds = [b.plan.entretien.participations[0].locuteurRef!]
      const avant = b.fichiers()
      expect(() => b.transactions().executer(b.plan)).toThrow()
      expect(b.fichiers()).toEqual(avant)
      expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    },
  )

  test('le mode natif ne rejoue pas une ancienne intention au seul motif que son journal est reconnu', () => {
    const b = preparer()
    const ancien = { operation: 'ajout', id: 'ancien', corpusAvant: squeletteCorpus(), corpusApres: squeletteCorpus(),
      entretien: { formatVersion: 9, locuteurs: [] } }
    writeFileSync(join(b.dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan: ancien }))
    const avant = b.fichiers()
    expect(() => b.transactions().reprendre()).toThrow('Version native non supportée')
    expect(b.fichiers()).toEqual(avant)
  })

  test('la création vide reste vide et la préparation ne modifie pas ses entrées', () => {
    const b = preparer()
    const avant = structuredClone(b.corpus)
    const plan = preparerCreationEntretienNatif(b.corpus, 'vide', 'À transcrire', '2026-01-01T10:00:00.000Z')
    expect(plan.entretien.participations).toEqual([])
    expect(plan.corpusApres.locuteurs).toEqual({})
    expect(b.corpus).toEqual(avant)
    b.transactions().executer(plan)
    expect(b.lire('entretiens/vide.json').participations).toEqual([])
    expect(b.lire('corpus.crp').membership.vide.titre).toBe('À transcrire')
  })
})
