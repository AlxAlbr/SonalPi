import { describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'
import type { Cas } from '../src/shared/corpus/cas'

function ecrireCorpusV4(): { dir: string; repere: { id: string; from: number; to: number } } {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-cas-v4-'))
  const maintenant = '2026-09-01T10:00:00.000Z'
  const repere = { id: 'repere-1', from: 1, to: 8 }
  const corpus: CorpusFichier = {
    formatVersion: 4,
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      'entretien-1': { titre: 'Entretien 1', date: null, lastModified: maintenant },
    },
    recueils: {
      'recueil-1': {
        id: 'recueil-1',
        nom: 'Synthèse',
        creeLe: maintenant,
        modifieLe: maintenant,
        modeTexte: 'pseudonymise',
        items: [{
          id: 'item-1',
          type: 'passage',
          source: { entretienId: 'entretien-1', repereId: repere.id },
          commentaireEditorial: 'À conserver.',
        }],
      },
    },
  }
  const entretien: EntretienFichier = {
    formatVersion: 4,
    lastModified: maintenant,
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: null },
        content: [{ type: 'text', text: 'Passage' }],
      }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: [repere],
  }
  mkdirSync(join(dir, 'entretiens'), { recursive: true })
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
  writeFileSync(join(dir, 'entretiens', 'entretien-1.json'), JSON.stringify(entretien, null, 2), 'utf8')
  return { dir, repere }
}

describe('CorpusStore — migration des cas', () => {
  test('migre la v5 sans réécrire les règles individuelles, filtres, identités et rattachements', () => {
    const { dir, repere } = ecrireCorpusV4()
    const cheminCorpus = join(dir, 'corpus.json')
    const cheminEntretien = join(dir, 'entretiens', 'entretien-1.json')
    const corpus = JSON.parse(readFileSync(cheminCorpus, 'utf8')) as CorpusFichier
    corpus.formatVersion = 5
    corpus.personnes = { 'personne-1': { id: 'personne-1', nom: 'Marie' }, 'personne-2': { id: 'personne-2', nom: 'Paul' } }
    corpus.cas = { c1: {
      ...casPersonne('c1', 'Collectif existant'),
      regles: [
        { type: 'personne', personneId: 'personne-1', inclureEnqueteurs: false },
        { type: 'personne', personneId: 'personne-2', inclureEnqueteurs: true },
      ],
      rattachements: [{ id: 'r1', provenance: 'manuel', creeLe: dateCas, source: { entretienId: 'entretien-1', repereId: repere.id } }],
    } }
    const entretien = JSON.parse(readFileSync(cheminEntretien, 'utf8')) as EntretienFichier
    entretien.formatVersion = 5
    entretien.locuteurs = [{ id: 'loc-stable', index: 1, nom: 'Marie', personneRef: 'personne-1', interviewer: true, valeursLoc: {} }]
    writeFileSync(cheminCorpus, JSON.stringify(corpus))
    writeFileSync(cheminEntretien, JSON.stringify(entretien))
    const store = new CorpusStore(dir)
    const preparation = store.preparerOuverture()
    expect(preparation.versionInitiale).toBe(5)
    expect(JSON.parse(readFileSync(cheminCorpus, 'utf8')).formatVersion).toBe(5)
    const apres = store.finaliserOuverture(preparation)
    expect(apres.cas).toEqual(corpus.cas)
    expect(apres.personnes).toEqual(corpus.personnes)
    expect(apres.recueils).toEqual(corpus.recueils)
    const source = JSON.parse(readFileSync(cheminEntretien, 'utf8'))
    expect(source).toEqual({ ...entretien, formatVersion: FORMAT_VERSION })
  })

  test('migre atomiquement le corpus et les entretiens v4 vers le format courant sans perdre les recueils', () => {
    const { dir, repere } = ecrireCorpusV4()
    const store = new CorpusStore(dir)
    const preparation = store.preparerOuverture()

    expect(preparation.versionInitiale).toBe(4)
    expect(preparation.corpus).toMatchObject({ formatVersion: FORMAT_VERSION, cas: {} })
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).formatVersion).toBe(4)

    const corpus = store.finaliserOuverture(preparation)
    const corpusDisque = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')) as CorpusFichier
    const entretienDisque = JSON.parse(
      readFileSync(join(dir, 'entretiens', 'entretien-1.json'), 'utf8'),
    ) as EntretienFichier

    expect(corpus.formatVersion).toBe(FORMAT_VERSION)
    expect(corpus.cas).toEqual({})
    expect(corpusDisque.cas).toEqual({})
    expect(corpusDisque.recueils?.['recueil-1'].items).toHaveLength(1)
    expect(entretienDisque.formatVersion).toBe(FORMAT_VERSION)
    expect(entretienDisque.reperesPassages).toEqual([repere])
  })
})

const dateCas = '2026-09-01T12:00:00.000Z'

function casPersonne(id: string, nom: string): Cas {
  return {
    id,
    nom,
    memo: '',
    creeLe: dateCas,
    modifieLe: dateCas,
    regles: [{ type: 'personne', personneId: 'personne-1', inclureEnqueteurs: false }],
    rattachements: [],
  }
}

function storePret(): { dir: string; store: CorpusStore } {
  const { dir } = ecrireCorpusV4()
  const store = new CorpusStore(dir)
  const corpus = store.ouvrir()
  corpus.personnes['personne-1'] = { id: 'personne-1', nom: 'Marie' }
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
  return { dir, store }
}

describe('CorpusStore — commandes et suppression des cas', () => {
  test('le lot entier est validé avant écriture et son rejeu conserve les sources intactes', () => {
    const { dir, store } = storePret()
    const fichier = join(dir, 'corpus.json')
    const source = join(dir, 'entretiens', 'entretien-1.json')
    const avant = readFileSync(fichier, 'utf8')
    const sourceAvant = readFileSync(source, 'utf8')
    const nouveaux: Cas[] = [
      casPersonne('c1', 'Marie'),
      { ...casPersonne('c2', 'Entretien'), regles: [{ type: 'entretiens', entretienIds: ['absent'] }] },
    ]
    expect(() => store.casCommander({ type: 'creer-lot', cas: nouveaux })).toThrow(/partie du corpus/)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    nouveaux[1].regles = [{ type: 'entretiens', entretienIds: ['entretien-1'] }]
    store.casCommander({ type: 'creer-lot', cas: nouveaux })
    const apres = readFileSync(fichier, 'utf8')
    store.casCommander({ type: 'creer-lot', cas: nouveaux })
    expect(readFileSync(fichier, 'utf8')).toBe(apres)
    expect(readFileSync(source, 'utf8')).toBe(sourceAvant)
    expect(Object.keys(new CorpusStore(dir).ouvrir().cas!)).toHaveLength(2)
  })

  test('la suppression confirme les règles d’entretiens et les conserve comme dépendances manquantes', () => {
    const { dir, store } = storePret()
    const avant = store.analyserSuppressionEntretien('entretien-1')
    const cas: Cas = { ...casPersonne('c1', 'Entretien entier'), regles: [{ type: 'entretiens', entretienIds: ['entretien-1'] }] }
    store.casCommander({ type: 'creer', cas })
    const impact = store.analyserSuppressionEntretien('entretien-1')
    expect(impact.casReglesEntretien).toBe(1)
    expect(impact.rattachementsCas).toBe(0)
    expect(() => store.supprimerEntretien('entretien-1', avant)).toThrow(/ont changé/)
    const apres = store.supprimerEntretien('entretien-1', impact)
    expect(apres.cas?.c1).toEqual(cas)
    expect(new CorpusStore(dir).ouvrir().cas?.c1).toEqual(cas)
  })

  test('crée et relit un cas vide sans changer les entretiens, puis l’enrichit', () => {
    const { dir, store } = storePret()
    const cheminEntretien = join(dir, 'entretiens', 'entretien-1.json')
    const avant = readFileSync(cheminEntretien, 'utf8')
    const vide = { ...casPersonne('cas-vide', 'Dossier à préparer'), regles: [], memo: 'Préparation.' }
    store.casCommander({ type: 'creer', cas: vide })
    const rouvert = new CorpusStore(dir)
    expect(rouvert.ouvrir().cas?.['cas-vide']).toEqual(vide)
    expect(readFileSync(cheminEntretien, 'utf8')).toBe(avant)
    const rattachement = {
      id: 'r1', source: { entretienId: 'entretien-1', repereId: 'repere-1' },
      provenance: 'manuel' as const, creeLe: dateCas,
    }
    rouvert.casCommander({ type: 'ajouter-rattachements', casIds: ['cas-vide'], rattachement })
    const enrichi = new CorpusStore(dir).ouvrir().cas?.['cas-vide']
    expect(enrichi?.rattachements).toEqual([rattachement])
    expect(enrichi?.regles).toEqual([])
    expect(readFileSync(cheminEntretien, 'utf8')).toBe(avant)
  })

  test('relit sans conversion les règles multiples, leurs filtres et les ajouts manuels', () => {
    const { dir, store } = storePret()
    const courant = store.ouvrir()
    courant.personnes['personne-2'] = { id: 'personne-2', nom: 'Paul' }
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(courant), 'utf8')
    const mixte: Cas = {
      ...casPersonne('mixte', 'Collectif'),
      regles: [
        { type: 'personne', personneId: 'personne-1', inclureEnqueteurs: false },
        { type: 'personne', personneId: 'personne-2', inclureEnqueteurs: true },
      ],
      rattachements: [{
        id: 'r1', source: { entretienId: 'entretien-1', repereId: 'repere-1' },
        provenance: 'manuel', creeLe: dateCas,
      }],
    }
    store.casCommander({ type: 'creer', cas: mixte })
    const apres = new CorpusStore(dir).ouvrir()
    expect(apres.cas?.mixte).toEqual(mixte)
    expect(apres.recueils).toEqual(courant.recueils)
    expect(apres.formatVersion).toBe(FORMAT_VERSION)
  })

  test('persiste une commande ciblée après relecture du corpus courant', () => {
    const { dir, store } = storePret()
    store.casCommander({ type: 'creer', cas: casPersonne('cas-1', 'Marie') })

    const modifieAilleurs = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')) as CorpusFichier
    modifieAilleurs.nom = 'Nom modifié ailleurs'
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(modifieAilleurs, null, 2), 'utf8')

    const corpus = store.casCommander({
      type: 'renommer', casId: 'cas-1', attendu: 'Marie', nom: 'Marie — vague 1',
    })
    expect(corpus.nom).toBe('Nom modifié ailleurs')
    expect(corpus.cas?.['cas-1'].nom).toBe('Marie — vague 1')
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).cas['cas-1'].nom)
      .toBe('Marie — vague 1')
  })

  test('refuse une personne ou un repère absent sans modifier le fichier', () => {
    const { dir, store } = storePret()
    const fichier = join(dir, 'corpus.json')
    const avant = readFileSync(fichier, 'utf8')
    expect(() => store.casCommander({
      type: 'creer',
      cas: { ...casPersonne('cas-1', 'Absente'), regles: [{
        type: 'personne', personneId: 'personne-absente', inclureEnqueteurs: false,
      }] },
    })).toThrow(/personne n'existe plus/)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)

    expect(() => store.casCommander({
      type: 'creer',
      cas: {
        ...casPersonne('cas-1', 'Manuel'),
        regles: [],
        rattachements: [{
          id: 'r1',
          source: { entretienId: 'entretien-1', repereId: 'repere-absent' },
          provenance: 'manuel',
          creeLe: dateCas,
        }],
      },
    })).toThrow(/référence de passage n'existe pas/)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
  })

  test('ajoute plusieurs cas atomiquement et rejoue la commande sans doublon', () => {
    const { store } = storePret()
    store.casCommander({ type: 'creer', cas: casPersonne('cas-1', 'Marie') })
    store.casCommander({ type: 'creer', cas: casPersonne('cas-2', 'Marie — autre') })
    const commande = {
      type: 'ajouter-rattachements' as const,
      casIds: ['cas-1', 'cas-2'],
      rattachement: {
        id: 'r1',
        source: { entretienId: 'entretien-1', repereId: 'repere-1' },
        provenance: 'manuel' as const,
        creeLe: dateCas,
      },
    }
    let corpus = store.casCommander(commande)
    const apresPremierAjout = structuredClone(corpus.cas)
    corpus = store.casCommander(commande)
    expect(corpus.cas).toEqual(apresPremierAjout)
    expect(corpus.cas?.['cas-1'].rattachements).toHaveLength(1)
    expect(corpus.cas?.['cas-2'].rattachements).toHaveLength(1)
  })

  test('la suppression confirmée nettoie les cas mais conserve règles et recueils', () => {
    const { dir, store } = storePret()
    const rattachement = {
      id: 'r1',
      source: { entretienId: 'entretien-1', repereId: 'repere-1' },
      provenance: 'manuel' as const,
      creeLe: dateCas,
    }
    store.casCommander({
      type: 'creer',
      cas: { ...casPersonne('cas-1', 'Marie'), rattachements: [rattachement] },
    })
    store.casCommander({
      type: 'creer',
      cas: { ...casPersonne('cas-2', 'Événement'), regles: [], rattachements: [{ ...rattachement, id: 'r2' }] },
    })

    const impact = store.analyserSuppressionEntretien('entretien-1')
    expect(impact).toMatchObject({
      recueilsAffectes: 1,
      passagesRecueils: 1,
      casAffectes: 2,
      rattachementsCas: 2,
    })
    expect(() => store.supprimerEntretien('entretien-1')).toThrow(/Confirmez/)

    const corpus = store.supprimerEntretien('entretien-1', impact)
    expect(corpus.membership['entretien-1']).toBeUndefined()
    expect(corpus.cas?.['cas-1'].rattachements).toEqual([])
    expect(corpus.cas?.['cas-1'].regles).toHaveLength(1)
    expect(corpus.cas?.['cas-2']).toBeDefined()
    expect(corpus.cas?.['cas-2'].rattachements).toEqual([])
    expect(corpus.recueils?.['recueil-1'].items).toHaveLength(1)
    expect(readFileSync(join(dir, 'corbeille', 'entretien-1.json'), 'utf8')).toContain('Passage')
  })

  test('refuse un impact périmé avant toute suppression', () => {
    const { dir, store } = storePret()
    const impact = store.analyserSuppressionEntretien('entretien-1')
    store.casCommander({
      type: 'creer',
      cas: {
        ...casPersonne('cas-1', 'Ajout concurrent'),
        regles: [],
        rattachements: [{
          id: 'r1',
          source: { entretienId: 'entretien-1', repereId: 'repere-1' },
          provenance: 'manuel',
          creeLe: dateCas,
        }],
      },
    })

    expect(() => store.supprimerEntretien('entretien-1', impact)).toThrow(/ont changé/)
    expect(store.ouvrir().membership['entretien-1']).toBeDefined()
    expect(readFileSync(join(dir, 'entretiens', 'entretien-1.json'), 'utf8')).toContain('Passage')
  })

  test('la lecture seule refuse les commandes de cas', () => {
    const { dir, store } = storePret()
    const avant = readFileSync(join(dir, 'corpus.json'), 'utf8')
    store.lectureSeule = true
    expect(() => store.casCommander({ type: 'creer', cas: casPersonne('cas-1', 'Marie') }))
      .toThrow(/lecture seule/)
    expect(() => store.casCommander({
      type: 'creer', cas: { ...casPersonne('vide', 'Vide'), regles: [] },
    })).toThrow(/lecture seule/)
    expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe(avant)
  })
})
