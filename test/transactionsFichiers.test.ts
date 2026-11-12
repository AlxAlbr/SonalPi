import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { TransactionsFichiersCorpus, type PlanTransactionFichiers, type PlanRemplacementEntretiens } from '../src/main/transactionsFichiers'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'

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
afterEach(() => { injections.apresRenommage = undefined })

function corpus(membership: CorpusFichier['membership'] = {}): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION,
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership,
  }
}

function entretien(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function ecrireJson(fichier: string, valeur: unknown): void {
  mkdirSync(dirname(fichier), { recursive: true })
  writeFileSync(fichier, JSON.stringify(valeur, null, 2), 'utf8')
}

function ecrireJournal(dir: string, plan: PlanTransactionFichiers): void {
  ecrireJson(join(dir, '.transaction-fichiers.json'), { formatVersion: 1, plan })
}

function planDivision(): PlanRemplacementEntretiens {
  const corpusAvant = corpus()
  corpusAvant.codebook.source = { id: 'source', nom: 'Source', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' }
  const corpusIntermediaire = structuredClone(corpusAvant)
  corpusIntermediaire.codebook.nouvelle = { id: 'nouvelle', nom: 'Nouvelle', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' }
  const corpusApres = structuredClone(corpusIntermediaire)
  delete corpusApres.codebook.source
  const entretiens = ['e1', 'e2'].map((id) => {
    const avant = entretien()
    avant.annotations = [{ id: 'a', type: 'codage', code: 'source', from: 1, to: 2, auteur: 'auteur' }]
    const apres = structuredClone(avant)
    apres.annotations[0].code = 'nouvelle'
    return { id, avant, apres }
  })
  for (const e of entretiens) {
    for (const c of [corpusAvant, corpusIntermediaire, corpusApres]) {
      c.membership[e.id] = { titre: e.id, date: null, lastModified: e.avant.lastModified }
    }
  }
  return { operation: 'remplacement', id: 'division', corpusAvant, corpusIntermediaire, corpusApres, entretiens }
}

describe('TransactionsFichiersCorpus', () => {
  it('reprend une création interrompue après l’écriture de l’entretien', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-ajout-'))
    const avant = corpus()
    const data = entretien()
    const apres = corpus({
      e1: { titre: 'Entretien un', date: null, lastModified: data.lastModified },
    })
    const plan: PlanTransactionFichiers = {
      operation: 'ajout',
      id: 'e1',
      corpusAvant: avant,
      corpusApres: apres,
      entretien: data,
    }
    ecrireJson(join(dir, 'corpus.crp'), avant)
    ecrireJson(join(dir, 'entretiens', 'e1.json'), data)
    ecrireJournal(dir, plan)

    expect(new CorpusStore(dir).ouvrir().membership.e1).toBeDefined()
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).membership.e1).toBeDefined()
    expect(existsSync(join(dir, 'entretiens', 'e1.json'))).toBe(true)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(false)
  })

  it('reprend une suppression interrompue après le commit du membership', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-suppression-'))
    const data = entretien()
    const avant = corpus({
      e1: { titre: 'Entretien un', date: null, lastModified: data.lastModified },
    })
    const apres = corpus()
    const plan: PlanTransactionFichiers = {
      operation: 'suppression',
      id: 'e1',
      corpusAvant: avant,
      corpusApres: apres,
      deplacements: [{ source: 'entretiens/e1.json', destination: 'corbeille/e1.json' }],
    }
    ecrireJson(join(dir, 'corpus.crp'), apres)
    ecrireJson(join(dir, 'entretiens', 'e1.json'), data)
    ecrireJournal(dir, plan)

    expect(new TransactionsFichiersCorpus(dir).reprendre()).toBe(true)
    expect(existsSync(join(dir, 'entretiens', 'e1.json'))).toBe(false)
    expect(existsSync(join(dir, 'corbeille', 'e1.json'))).toBe(true)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(false)
  })

  it.each(['avant', 'premier entretien', 'corpus'])('reprend un remplacement interrompu au stade %s', (stade) => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-remplacement-'))
    const avant = corpus()
    avant.personnes = { p1: { id: 'p1', nom: 'Marie' }, p2: { id: 'p2', nom: 'Marie D.' } }
    const apres = structuredClone(avant)
    delete apres.personnes.p2
    const fichiers = ['e1', 'e2'].map(id => {
      const avant = entretien()
      const apres = { ...avant, lastModified: '2026-02-01T00:00:00.000Z' }
      return { id, avant, apres }
    })
    const plan: PlanTransactionFichiers = { operation: 'remplacement', id: 'fusion', corpusAvant: avant, corpusApres: apres, entretiens: fichiers }
    ecrireJson(join(dir, 'corpus.crp'), stade === 'corpus' ? apres : avant)
    fichiers.forEach((e, i) => ecrireJson(join(dir, 'entretiens', `${e.id}.json`), stade === 'corpus' || (stade === 'premier entretien' && i === 0) ? e.apres : e.avant))
    ecrireJournal(dir, plan)
    const transactions = new TransactionsFichiersCorpus(dir)
    expect(transactions.reprendre()).toBe(true)
    expect(transactions.reprendre()).toBe(false)
    for (const e of fichiers) expect(JSON.parse(readFileSync(join(dir, 'entretiens', `${e.id}.json`), 'utf8'))).toEqual(e.apres)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual(apres)
  })

  it('vérifie tous les entretiens avant de reprendre un remplacement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-remplacement-conflit-'))
    const avant = corpus()
    const apres = { ...avant, nom: 'Après' }
    const fichiers = ['e1', 'e2'].map(id => ({ id, avant: entretien(), apres: { ...entretien(), lastModified: 'nouveau' } }))
    ecrireJson(join(dir, 'corpus.crp'), avant)
    ecrireJson(join(dir, 'entretiens/e1.json'), fichiers[0].avant)
    ecrireJson(join(dir, 'entretiens/e2.json'), { ...entretien(), lastModified: 'externe' })
    ecrireJournal(dir, { operation: 'remplacement', id: 'fusion', corpusAvant: avant, corpusApres: apres, entretiens: fichiers })
    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/e2.*a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8'))).toEqual(fichiers[0].avant)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual(avant)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
  })

  it.each([0, 1, 2, 3, 4])('reprend une division destructive après l’écriture %i, avant d’exposer le corpus', (arret) => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-themes-'))
    const plan = planDivision()
    ecrireJson(join(dir, 'corpus.crp'), plan.corpusAvant)
    for (const e of plan.entretiens) ecrireJson(join(dir, `entretiens/${e.id}.json`), e.avant)
    const ecritures: string[] = []
    injections.apresRenommage = (destination) => {
      const chemin = relative(dir, destination)
      if (chemin === '.transaction-fichiers.json') {
        if (arret === 0) throw new Error('arrêt simulé')
        return
      }
      ecritures.push(chemin)
      const c = JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')) as CorpusFichier
      if (ecritures.length < 4) {
        expect(c.codebook.source).toBeDefined()
        expect(c.codebook.nouvelle).toBeDefined()
      } else expect(c.codebook.source).toBeUndefined()
      for (const e of plan.entretiens) {
        const data = JSON.parse(readFileSync(join(dir, `entretiens/${e.id}.json`), 'utf8')) as EntretienFichier
        for (const a of data.annotations) if (a.type === 'codage') expect(c.codebook[a.code!]).toBeDefined()
      }
      if (ecritures.length === arret) throw new Error('arrêt simulé')
    }
    expect(() => new TransactionsFichiersCorpus(dir).executer(plan)).toThrow('arrêt simulé')
    expect(ecritures).toEqual(['corpus.crp', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.crp'].slice(0, arret))
    expect(JSON.parse(readFileSync(join(dir, '.transaction-fichiers.json'), 'utf8')).formatVersion).toBe(2)
    injections.apresRenommage = undefined
    const expose = new CorpusStore(dir).ouvrir()
    expect(expose.codebook.source).toBeUndefined()
    expect(expose.codebook.nouvelle).toBeDefined()
    for (const e of plan.entretiens) expect(JSON.parse(readFileSync(join(dir, `entretiens/${e.id}.json`), 'utf8'))).toEqual(e.apres)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(false)
  })

  it.each(['corpus-puis-entretiens', 'entretiens-puis-corpus'] as const)('respecte l’ordre %s sans corpus intermédiaire', (ordre) => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-ordre-'))
    const plan = planDivision()
    delete (plan as { corpusIntermediaire?: CorpusFichier }).corpusIntermediaire
    const ecritures: string[] = []
    ecrireJson(join(dir, 'corpus.crp'), plan.corpusAvant)
    for (const e of plan.entretiens) ecrireJson(join(dir, `entretiens/${e.id}.json`), e.avant)
    injections.apresRenommage = (destination) => {
      const chemin = relative(dir, destination)
      if (chemin !== '.transaction-fichiers.json') ecritures.push(chemin)
    }
    new TransactionsFichiersCorpus(dir).executer({ ...plan, ordre })
    expect(ecritures).toEqual(ordre === 'corpus-puis-entretiens'
      ? ['corpus.crp', 'entretiens/e1.json', 'entretiens/e2.json']
      : ['entretiens/e1.json', 'entretiens/e2.json', 'corpus.crp'])
  })

  it('refuse un état inconnu sur un corpus intermédiaire, sans écrire le corpus final', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-intermediaire-conflit-'))
    const plan = planDivision()
    ecrireJson(join(dir, 'corpus.crp'), plan.corpusIntermediaire)
    ecrireJson(join(dir, 'entretiens/e1.json'), plan.entretiens[0].apres)
    ecrireJson(join(dir, 'entretiens/e2.json'), { ...plan.entretiens[1].avant, lastModified: 'concurrent' })
    ecrireJson(join(dir, '.transaction-fichiers.json'), { formatVersion: 2, plan })
    expect(() => new CorpusStore(dir).ouvrir()).toThrow(/e2.*a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual(plan.corpusIntermediaire)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
  })

  it('refuse un corpus final placé avant ses entretiens dans une transaction intermédiaire', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-intermediaire-incoherent-'))
    const plan = planDivision()
    ecrireJson(join(dir, 'corpus.crp'), plan.corpusApres)
    for (const e of plan.entretiens) ecrireJson(join(dir, `entretiens/${e.id}.json`), e.avant)
    ecrireJson(join(dir, '.transaction-fichiers.json'), { formatVersion: 2, plan })
    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/incohérente/)
    expect(JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8'))).toEqual(plan.entretiens[0].avant)
  })

  it('ne lit pas une intention intermédiaire avec l’ancienne version de journal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-version-'))
    const plan = planDivision()
    ecrireJson(join(dir, '.transaction-fichiers.json'), { formatVersion: 1, plan })
    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/intermédiaire est invalide/)
    ecrireJson(join(dir, '.transaction-fichiers.json'), { formatVersion: 2, plan: { ...plan, corpusIntermediaire: null } })
    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/intermédiaire est incomplet/)
  })

  it('refuse d’écraser un corpus modifié extérieurement et conserve le journal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-conflit-'))
    const avant = corpus()
    const apres = corpus({
      e1: { titre: 'Entretien un', date: null, lastModified: '2026-01-01T00:00:00.000Z' },
    })
    const modifie = { ...avant, nom: 'Modification extérieure' }
    const plan: PlanTransactionFichiers = {
      operation: 'ajout',
      id: 'e1',
      corpusAvant: avant,
      corpusApres: apres,
      entretien: entretien(),
    }
    ecrireJson(join(dir, 'corpus.crp'), modifie)
    ecrireJournal(dir, plan)

    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/corpus\.crp a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).nom)
      .toBe('Modification extérieure')
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
  })
})
