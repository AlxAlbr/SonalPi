import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { TransactionsFichiersCorpus, type PlanTransactionFichiers } from '../src/main/transactionsFichiers'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'

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
    ecrireJson(join(dir, 'corpus.json'), avant)
    ecrireJson(join(dir, 'entretiens', 'e1.json'), data)
    ecrireJournal(dir, plan)

    expect(new CorpusStore(dir).ouvrir().membership.e1).toBeDefined()
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).membership.e1).toBeDefined()
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
    ecrireJson(join(dir, 'corpus.json'), apres)
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
    ecrireJson(join(dir, 'corpus.json'), stade === 'corpus' ? apres : avant)
    fichiers.forEach((e, i) => ecrireJson(join(dir, 'entretiens', `${e.id}.json`), stade === 'corpus' || (stade === 'premier entretien' && i === 0) ? e.apres : e.avant))
    ecrireJournal(dir, plan)
    const transactions = new TransactionsFichiersCorpus(dir)
    expect(transactions.reprendre()).toBe(true)
    expect(transactions.reprendre()).toBe(false)
    for (const e of fichiers) expect(JSON.parse(readFileSync(join(dir, 'entretiens', `${e.id}.json`), 'utf8'))).toEqual(e.apres)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))).toEqual(apres)
  })

  it('vérifie tous les entretiens avant de reprendre un remplacement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-remplacement-conflit-'))
    const avant = corpus()
    const apres = { ...avant, nom: 'Après' }
    const fichiers = ['e1', 'e2'].map(id => ({ id, avant: entretien(), apres: { ...entretien(), lastModified: 'nouveau' } }))
    ecrireJson(join(dir, 'corpus.json'), avant)
    ecrireJson(join(dir, 'entretiens/e1.json'), fichiers[0].avant)
    ecrireJson(join(dir, 'entretiens/e2.json'), { ...entretien(), lastModified: 'externe' })
    ecrireJournal(dir, { operation: 'remplacement', id: 'fusion', corpusAvant: avant, corpusApres: apres, entretiens: fichiers })
    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/e2.*a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8'))).toEqual(fichiers[0].avant)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))).toEqual(avant)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
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
    ecrireJson(join(dir, 'corpus.json'), modifie)
    ecrireJournal(dir, plan)

    expect(() => new TransactionsFichiersCorpus(dir).reprendre()).toThrow(/corpus.json a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).nom)
      .toBe('Modification extérieure')
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(true)
  })
})
