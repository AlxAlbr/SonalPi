import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { creerTransitionsLocales, oublierCompte } from '../src/main/transitionContexte'
import type { CorpusFichier, OuvertureCorpus } from '../src/shared/format'
import { MigrationV1 } from '../src/main/migrationV1'

function dossierTemporaire(prefixe: string): string {
  return mkdtempSync(join(tmpdir(), prefixe))
}

function corpusVide(nom: string): CorpusFichier {
  return {
    formatVersion: 3,
    nom,
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {},
  }
}

function bancTransition() {
  const ancienStore = new CorpusStore(dossierTemporaire('sonal-ipc-ancien-'))
  const anciennesSessions = { id: 'sessions-anciennes' }
  const anciennePresence = { id: 'presence-ancienne' }
  const ancienMiroir = { id: 'compte-actif' }
  const contexte = {
    store: ancienStore,
    dossier: '/ancien',
    sessions: anciennesSessions as object | null,
    presence: anciennePresence as object | null,
    miroir: ancienMiroir as object | null,
  }
  const recents = ['/ancien']
  let finalisations = 0

  const transitions = creerTransitionsLocales({
    fermerContexteActuel: async () => {
      throw new Error('publication impossible')
    },
    finaliser: (store, dir, preparation): OuvertureCorpus => {
      finalisations += 1
      const corpus = store.finaliserOuverture(preparation)
      contexte.store = store
      contexte.dossier = dir
      contexte.sessions = null
      contexte.presence = null
      contexte.miroir = null
      recents.unshift(dir)
      return { dir, nom: corpus.nom ?? basename(dir), corpus }
    },
  })

  return {
    transitions,
    contexte,
    recents,
    ancienStore,
    anciennesSessions,
    anciennePresence,
    ancienMiroir,
    finalisations: () => finalisations,
  }
}

function verifierAncienContexteConserve(banc: ReturnType<typeof bancTransition>): void {
  expect(banc.contexte).toEqual({
    store: banc.ancienStore,
    dossier: '/ancien',
    sessions: banc.anciennesSessions,
    presence: banc.anciennePresence,
    miroir: banc.ancienMiroir,
  })
  expect(banc.recents).toEqual(['/ancien'])
  expect(banc.finalisations()).toBe(0)
}

describe('couture des handlers IPC de changement de corpus', () => {
  test('la création refusée conserve le contexte et ne crée pas la cible', async () => {
    const banc = bancTransition()
    const cible = join(dossierTemporaire('sonal-ipc-creation-'), 'cible')

    await expect(banc.transitions.creerNouveau(cible, 'Nouveau corpus'))
      .rejects.toThrow('publication impossible')

    verifierAncienContexteConserve(banc)
    expect(existsSync(cible)).toBe(false)
  })

  test('l’ouverture refusée conserve le contexte et la cible octet pour octet', async () => {
    const banc = bancTransition()
    const cible = dossierTemporaire('sonal-ipc-ouverture-')
    const fichier = join(cible, 'corpus.crp')
    const contenu = JSON.stringify(corpusVide('Cible existante'), null, 2)
    writeFileSync(fichier, contenu, 'utf8')

    await expect(banc.transitions.ouvrirDossier(cible))
      .rejects.toThrow('publication impossible')

    verifierAncienContexteConserve(banc)
    expect(readFileSync(fichier, 'utf8')).toBe(contenu)
  })

  test('la préparation de migration refuse un dossier non vide sans changer le contexte', () => {
    const banc = bancTransition()
    const cible = dossierTemporaire('sonal-ipc-migration-')
    const temoin = join(cible, 'temoin.txt')
    writeFileSync(temoin, 'intact', 'utf8')
    const cheminCrp = join(dossierTemporaire('sonal-ipc-source-'), 'Source.crp')
    writeFileSync(cheminCrp, JSON.stringify({ tabEnt: [] }))
    expect(() => new MigrationV1({ nom: 'Corpus migré', cheminCrp, dossier: cible }))
      .toThrow(/neuf ou vide/)

    verifierAncienContexteConserve(banc)
    expect(readFileSync(temoin, 'utf8')).toBe('intact')
    expect(existsSync(join(cible, 'corpus.crp'))).toBe(false)
    expect(existsSync(join(cible, 'entretiens'))).toBe(false)
  })
})

describe('couture IPC de l’oubli d’un compte distant', () => {
  test('le compte actif est fermé et désactivé avant son oubli', async () => {
    const trace: string[] = []
    const miroir = dossierTemporaire('sonal-ipc-miroir-')
    mkdirSync(join(miroir, 'sessions'), { recursive: true })
    writeFileSync(join(miroir, 'sessions', 'reprise.json'), 'à conserver', 'utf8')
    let contexte: { id: string; miroir: string } | null = { id: 'actif', miroir }
    let comptes = ['actif', 'autre']

    const resultat = await oublierCompte({
      id: 'actif',
      idActif: contexte.id,
      fermerContexteActuel: async () => { trace.push('fermer') },
      desactiverContexte: () => { trace.push('desactiver'); contexte = null },
      oublier: (id) => {
        trace.push('oublier')
        comptes = comptes.filter((compte) => compte !== id)
      },
      lister: () => comptes,
    })

    expect(trace).toEqual(['fermer', 'desactiver', 'oublier'])
    expect(contexte).toBeNull()
    expect(resultat).toEqual(['autre'])
    expect(readFileSync(join(miroir, 'sessions', 'reprise.json'), 'utf8'))
      .toBe('à conserver')
  })

  test('un échec de fermeture conserve le compte et toutes les références actives', async () => {
    const trace: string[] = []
    const sessions = { id: 'sessions' }
    const presence = { id: 'presence' }
    const contexte = { id: 'actif', sessions, presence }
    const comptes = ['actif', 'autre']

    await expect(oublierCompte({
      id: 'actif',
      idActif: contexte.id,
      fermerContexteActuel: async () => {
        trace.push('fermer')
        throw new Error('verrou non libéré')
      },
      desactiverContexte: () => { trace.push('desactiver') },
      oublier: () => { trace.push('oublier') },
      lister: () => comptes,
    })).rejects.toThrow('verrou non libéré')

    expect(trace).toEqual(['fermer'])
    expect(contexte).toEqual({ id: 'actif', sessions, presence })
    expect(comptes).toEqual(['actif', 'autre'])
  })
})
