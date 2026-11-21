import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TransactionsFichiersCorpus, type PlanTransactionFichiers, type PlanRemplacementEntretiens } from '../src/main/transactionsFichiers'
import { FORMAT_VERSION, type EntretienFichier } from '../src/shared/format'
import { squeletteCorpus } from '../src/shared/corpus/squelette'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-versions-transactions-'))
  dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  const avant = squeletteCorpus()
  const entretien: EntretienFichier = {
    formatVersion: FORMAT_VERSION, lastModified: '', corpsTexte: {}, annotations: [], ancres: [],
    participations: [], meta: { valeursGen: {}, audioRef: null },
  }
  avant.membership.e1 = { titre: 'Entretien', date: null, lastModified: '' }
  const plan: PlanRemplacementEntretiens = {
    operation: 'remplacement', id: 'operation', corpusAvant: avant,
    corpusIntermediaire: { ...structuredClone(avant), nom: 'Intermédiaire' },
    corpusApres: { ...structuredClone(avant), nom: 'Après' },
    entretiens: [{ id: 'e1', avant: entretien, apres: { ...structuredClone(entretien), lastModified: 'après' } }],
  }
  const installer = (cible: PlanTransactionFichiers, versionJournal = 1) => {
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(cible.corpusAvant))
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(entretien))
    writeFileSync(join(dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: versionJournal, plan: cible }))
  }
  const fichiers = () => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile()).map((f) => join(f.parentPath, f.name)).sort()
    .map((chemin) => [chemin, readFileSync(chemin)])
  return { dir, plan, installer, fichiers }
}

describe('versions natives des transactions locales', () => {
  const cibles = ['corpusAvant', 'corpusIntermediaire', 'corpusApres', 'entretienAvant', 'entretienApres'] as const
  test.each(cibles)('refuse un état %s incompatible, même dans un journal reconnu', (cible) => {
    const b = banc()
    const etat = cible === 'entretienAvant' ? b.plan.entretiens[0].avant
      : cible === 'entretienApres' ? b.plan.entretiens[0].apres : b.plan[cible]!
    etat.formatVersion = FORMAT_VERSION + 1
    b.installer(b.plan, 2)
    const avant = b.fichiers()
    expect(() => new TransactionsFichiersCorpus(b.dir).reprendre()).toThrow('Version native non supportée')
    expect(b.fichiers()).toEqual(avant)
  })

  test.each(['ajout', 'suppression'] as const)('contrôle aussi les états d’un journal de %s', (operation) => {
    const b = banc()
    const commun = { id: 'e1', corpusAvant: b.plan.corpusAvant, corpusApres: b.plan.corpusApres }
    const plan: PlanTransactionFichiers = operation === 'ajout'
      ? { ...commun, operation, entretien: { ...b.plan.entretiens[0].apres, formatVersion: FORMAT_VERSION + 1 } }
      : { ...commun, operation, corpusApres: { ...commun.corpusApres, formatVersion: FORMAT_VERSION + 1 }, deplacements: [{ source: 'entretiens/e1.json', destination: 'corbeille/e1.json' }] }
    b.installer(plan)
    const avant = b.fichiers()
    expect(() => new TransactionsFichiersCorpus(b.dir).reprendre()).toThrow('Version native non supportée')
    expect(b.fichiers()).toEqual(avant)
  })

  test('refuse un nouveau plan incompatible avant de créer son journal', () => {
    const b = banc()
    writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(b.plan.corpusAvant))
    b.plan.corpusApres.formatVersion = FORMAT_VERSION + 1
    const avant = b.fichiers()
    expect(() => new TransactionsFichiersCorpus(b.dir).executer(b.plan)).toThrow('Version native non supportée')
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    expect(b.fichiers()).toEqual(avant)
  })
})
