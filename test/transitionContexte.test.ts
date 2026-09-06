import { describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { executerTransitionPreparee } from '../src/main/transitionContexte'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

function cibleAbsente(prefixe: string): string {
  const parent = mkdtempSync(join(tmpdir(), prefixe))
  return join(parent, 'cible')
}

function ecrireJson(fichier: string, valeur: unknown): void {
  mkdirSync(dirname(fichier), { recursive: true })
  writeFileSync(fichier, JSON.stringify(valeur, null, 2), 'utf8')
}

describe('transition de contexte préparée', () => {
  test('un refus de fermeture ne crée pas un nouveau corpus', async () => {
    const dir = cibleAbsente('sonal-transition-creation-')
    const store = new CorpusStore(dir)
    const appels: string[] = []

    await expect(executerTransitionPreparee(
      () => {
        appels.push('preparer')
        const preparation = store.preparerOuverture('Nouvelle enquête')
        expect(existsSync(dir)).toBe(false)
        return preparation
      },
      async () => {
        appels.push('fermer')
        throw new Error('publication impossible')
      },
      (preparation) => {
        appels.push('finaliser')
        return store.finaliserOuverture(preparation)
      },
    )).rejects.toThrow('publication impossible')

    expect(appels).toEqual(['preparer', 'fermer'])
    expect(existsSync(dir)).toBe(false)
  })

  test('la cible est écrite seulement après la fermeture réussie', async () => {
    const dir = cibleAbsente('sonal-transition-succes-')
    const store = new CorpusStore(dir)
    const appels: string[] = []

    const corpus = await executerTransitionPreparee(
      () => {
        appels.push('preparer')
        return store.preparerOuverture('Nouvelle enquête')
      },
      async () => {
        appels.push('fermer')
        expect(existsSync(dir)).toBe(false)
      },
      (preparation) => {
        appels.push('finaliser')
        return store.finaliserOuverture(preparation)
      },
    )

    expect(appels).toEqual(['preparer', 'fermer', 'finaliser'])
    expect(corpus.nom).toBe('Nouvelle enquête')
    expect(existsSync(join(dir, 'corpus.json'))).toBe(true)
  })

  test('un refus laisse un corpus v2 strictement inchangé', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-transition-v2-'))
    const maintenant = '2024-01-01T00:00:00.000Z'
    const corpus: CorpusFichier = {
      formatVersion: 2,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: { e1: { titre: 'E1', date: null, lastModified: maintenant } },
    }
    const entretien: EntretienFichier = {
      formatVersion: 2,
      lastModified: maintenant,
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: 'audio/e1.mp3' },
    }
    const fichierCorpus = join(dir, 'corpus.json')
    const fichierEntretien = join(dir, 'entretiens', 'e1.json')
    const ancienPng = join(dir, 'audio', 'e1.png')
    ecrireJson(fichierCorpus, corpus)
    ecrireJson(fichierEntretien, entretien)
    mkdirSync(join(dir, 'audio'), { recursive: true })
    writeFileSync(ancienPng, 'png-v2', 'utf8')
    const corpusInitial = readFileSync(fichierCorpus, 'utf8')
    const entretienInitial = readFileSync(fichierEntretien, 'utf8')
    const store = new CorpusStore(dir)

    await expect(executerTransitionPreparee(
      () => store.preparerOuverture(),
      async () => { throw new Error('verrou non libéré') },
      (preparation) => store.finaliserOuverture(preparation),
    )).rejects.toThrow('verrou non libéré')

    expect(readFileSync(fichierCorpus, 'utf8')).toBe(corpusInitial)
    expect(readFileSync(fichierEntretien, 'utf8')).toBe(entretienInitial)
    expect(readFileSync(ancienPng, 'utf8')).toBe('png-v2')
    expect(existsSync(join(dir, 'png'))).toBe(false)
  })

  test('un refus laisse inchangée la cible d’une migration SonalPi1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-transition-migration-'))
    const temoin = join(dir, 'fichier-existant.txt')
    writeFileSync(temoin, 'à conserver', 'utf8')
    const store = new CorpusStore(dir)

    await expect(executerTransitionPreparee(
      () => store.preparerMigrationDepuisV1(
        'Corpus migré',
        { cheminCrp: '/source.crp', dateCreation: null },
        [],
        [],
      ),
      async () => { throw new Error('session distante bloquée') },
      (preparation) => store.finaliserOuverture(preparation),
    )).rejects.toThrow('session distante bloquée')

    expect(existsSync(join(dir, 'corpus.json'))).toBe(false)
    expect(existsSync(join(dir, 'entretiens'))).toBe(false)
    expect(readFileSync(temoin, 'utf8')).toBe('à conserver')
  })

  test('une cible invalide est refusée avant de fermer le contexte actuel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-transition-invalide-'))
    writeFileSync(join(dir, 'corpus.json'), '{invalide', 'utf8')
    const store = new CorpusStore(dir)
    let fermetureDemandee = false

    await expect(executerTransitionPreparee(
      () => store.preparerOuverture(),
      async () => { fermetureDemandee = true },
      (preparation) => store.finaliserOuverture(preparation),
    )).rejects.toThrow()

    expect(fermetureDemandee).toBe(false)
    expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe('{invalide')
  })

  test('une cible modifiée après préparation est refusée', () => {
    const dir = cibleAbsente('sonal-transition-course-')
    const store = new CorpusStore(dir)
    const preparation = store.preparerOuverture('Préparé')
    ecrireJson(join(dir, 'corpus.json'), {
      formatVersion: 3,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {},
      nom: 'Créé ailleurs',
    })

    expect(() => store.finaliserOuverture(preparation)).toThrow(/cible a changé/)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).nom)
      .toBe('Créé ailleurs')
  })
})
