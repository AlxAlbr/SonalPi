import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import { BailGitLab } from '../../src/main/gitlab/bailGitLab'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { OperationsThemesGitLab } from '../../src/main/gitlab/operationsThemes'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { empreinteTheme, type ManifesteExecutionTheme } from '../../src/main/operationsThemes'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { ApercuOperationTheme, DemandeOperationTheme } from '../../src/shared/corpus/themes'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import { DepotMemoire } from './depotMemoire'

const RACINE = 'themes'
const transfert: DemandeOperationTheme = {
  type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' },
}

function corpus(ids = ['e1', 'e2']): CorpusFichier {
  const c = squeletteCorpus('Thèmes GitLab')
  c.codebook = Object.fromEntries([
    ['source', { id: 'source', nom: 'Source', parent: null, ordre: 0, actif: true, codeExport: 'source' }],
    ['cible', { id: 'cible', nom: 'Cible', parent: null, ordre: 1, actif: true, codeExport: 'cible' }],
    ['enfant', { id: 'enfant', nom: 'Enfant', parent: 'source', ordre: 2, actif: true, codeExport: 'enfant' }],
  ])
  c.membership = Object.fromEntries(ids.map((id, rangAjout) => [id, {
    titre: id, date: null, lastModified: '2026-01-01T00:00:00.000Z', rangAjout,
  }]))
  c.ordreEntretiens = ids
  return c
}

function entretien(id: string): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `passage ${id}` }] }] },
    annotations: [{ id: `a-${id}`, type: 'codage', code: 'source', from: 0, to: 7, auteur: 'test' }],
    ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
  }
}

function banc(demande: DemandeOperationTheme = transfert, etats: Record<string, 'libre-observe' | 'tenu-autrui'> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-themes-gitlab-'))
  mkdirSync(join(dir, 'entretiens'), { recursive: true })
  const c = corpus()
  const entretiens = new Map(Object.keys(c.membership).map((id) => [id, entretien(id)]))
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(c, null, 2))
  for (const [id, data] of entretiens) writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(data, null, 2))
  const store = new CorpusStore(dir)
  store.lectureSeule = true
  const depot = new DepotMemoire()
  depot.charger(new Map([
    [`${RACINE}/corpus.json`, JSON.stringify(c, null, 2)],
    ...[...entretiens].map(([id, data]) => [`${RACINE}/entretiens/${id}.json`, JSON.stringify(data, null, 2)] as const),
  ]))
  let n = 0
  const coordination = new BailGitLab({ branche: 'main', depot,
    identite: () => ({ userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' }),
    nouvelleGeneration: () => `generation-${++n}`, dureeBailMs: 120_000 })
  const journalPublication = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal: journalPublication, attendre: async () => {} })
  const operationId = 'apercu-1'
  const parEntretien = [...entretiens].map(([id]) => ({ id, titre: id, passages: 1, orphelins: 0, aModifier: true }))
  const apercu: ApercuOperationTheme = {
    operationId, source: 'source', execution: 'entretiens-sequentiels', parEntretien,
    disponibiliteGitLab: { observeLe: new Date().toISOString(), entretiens: parEntretien.map(({ id }) => ({
      id, etat: etats[id] ?? 'libre-observe', ...(etats[id] === 'tenu-autrui' ? { motif: 'Tenu par bob.' } : {}),
    })) },
    totaux: { entretiens: 2, passages: 2, orphelins: 0, doublonsPrevisibles: 0 },
    faisable: true, obstacles: [],
  }
  const manifeste: ManifesteExecutionTheme = {
    apercu,
    corpus: empreinteTheme(c),
    entretiens: new Map([...entretiens].map(([id, data]) => [id, empreinteTheme(data)])),
  }
  const apercus = {
    consommer: vi.fn(() => structuredClone(manifeste)),
    analyser: vi.fn(async (d: DemandeOperationTheme) => ({ ...structuredClone(apercu), operationId: `reprise-${Date.now()}`, source: d.source })),
  }
  const service = new OperationsThemesGitLab({
    destinationId: 'destination', dirLocal: dir, branche: 'main', racine: RACINE,
    store, depot, coordination, publication, journalPublication,
    apercus: apercus as never, sessionsLocales: () => [],
    nouvelleOperation: () => `publication-${++n}`, maintenant: () => Date.parse('2026-06-01T12:00:00.000Z'),
  })
  return { service, depot, dir, apercus, manifeste, demande, journalPublication }
}

function lireDistant<T>(b: ReturnType<typeof banc>, chemin: string): T {
  return JSON.parse(b.depot.fichiers.get(`${RACINE}/${chemin}`)!.contenu) as T
}

describe('lots de thématiques GitLab', () => {
  test('transfère chaque entretien dans un commit court avec garde du corpus', async () => {
    const b = banc()
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'tous-prevus' })
    expect(resultat).toMatchObject({ statut: 'appliquee', entretiens: 2, reaffectes: 2 })
    for (const id of ['e1', 'e2']) {
      expect(lireDistant<EntretienFichier>(b, `entretiens/${id}.json`).annotations[0].code).toBe('cible')
    }
    const donnees = b.depot.commits.filter((c) => c.message.startsWith('Sonal publication-')
      && c.actions.some((a) => a.file_path.endsWith('/entretiens/e1.json') || a.file_path.endsWith('/entretiens/e2.json')))
    expect(donnees).toHaveLength(2)
    expect(donnees.every((c) => c.actions.filter((a) => !a.file_path.startsWith('.sonal/verrous/')).length === 2)).toBe(true)
    expect(donnees.every((c) => c.actions.some((a) => a.action === 'chmod' && a.file_path.endsWith('/corpus.json')))).toBe(true)
  })

  test('ne traite que le sous-ensemble observé libre et conserve le différé', async () => {
    const b = banc(transfert, { e2: 'tenu-autrui' })
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'observes-libres' })
    expect(resultat).toMatchObject({ statut: 'partielle', bilan: { differes: [{ id: 'e2' }] } })
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e1.json').annotations[0].code).toBe('cible')
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e2.json').annotations[0].code).toBe('source')
    expect(b.service.lireSuivi()?.indeterminee).toBe(false)
  })

  test('fusionne progressivement puis supprime la source sous les gardes de tout le membership', async () => {
    const fusion: DemandeOperationTheme = { type: 'fusion', source: 'source', cible: 'cible' }
    const b = banc(fusion)
    const resultat = await b.service.executer('apercu-1', fusion, { entretiens: 'tous-prevus' })
    expect(resultat.statut).toBe('appliquee')
    const final = lireDistant<CorpusFichier>(b, 'corpus.json')
    expect(final.codebook.source).toBeUndefined()
    expect(final.codebook.enfant.parent).toBe('cible')
    const commit = b.depot.commits.find((c) => c.message.startsWith('Sonal publication-')
      && c.actions.some((a) => a.file_path === `${RACINE}/corpus.json` && a.action === 'update')
      && c.actions.filter((a) => a.action === 'chmod').length === 2)
    expect(commit).toBeDefined()
    expect(commit!.actions.filter((a) => !a.file_path.startsWith('.sonal/verrous/'))).toHaveLength(3)
  })

  test('un transfert peut supprimer la source après les réaffectations', async () => {
    const demande = { ...transfert, conserverSource: false }
    const b = banc(demande)
    const resultat = await b.service.executer('apercu-1', demande, { entretiens: 'tous-prevus' })
    expect(resultat.statut).toBe('appliquee')
    const final = lireDistant<CorpusFichier>(b, 'corpus.json')
    expect(final.codebook.source).toBeUndefined()
    expect(final.codebook.enfant.parent).toBeNull()
  })

  test('une réponse perdue arrête le lot puis se réconcilie sans rejouer le commit', async () => {
    const b = banc()
    let pannePosee = false
    b.depot.avantCommit = (actions) => {
      if (!pannePosee && actions.some((a) => a.file_path === `${RACINE}/entretiens/e1.json`)) {
        pannePosee = true
        b.depot.echouerApresAccepter(new Error('réponse perdue'))
      }
    }
    b.depot.rendreCommitsIllisibles()
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'tous-prevus' })
    expect(resultat).toMatchObject({ statut: 'indeterminee', bilan: { inconnus: [{ id: 'e1' }] } })
    const nombre = b.depot.commits.filter((c) => c.actions.some((a) => a.file_path === `${RACINE}/entretiens/e1.json`)).length
    b.depot.rendreCommits()
    const reconcilie = await b.service.reconcilier('apercu-1')
    expect(reconcilie).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }] } })
    expect(b.depot.commits.filter((c) => c.actions.some((a) => a.file_path === `${RACINE}/entretiens/e1.json`))).toHaveLength(nombre)
    expect(b.service.lireSuivi()?.indeterminee).toBe(false)
  })

  test('une création à réponse perdue conserve son id et reprend sans recréer la destination', async () => {
    const creation: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source',
      cible: { type: 'nouvelle', token: 'nouvelle', nom: 'Nouvelle', parent: null } }
    const b = banc(creation)
    let pannePosee = false
    b.depot.rendreCommitsIllisibles()
    b.depot.avantCommit = (actions) => {
      if (!pannePosee && actions.some((a) => a.file_path === `${RACINE}/corpus.json` && a.action === 'update')
        && !actions.some((a) => a.file_path.includes('/entretiens/'))) {
        pannePosee = true
        b.depot.echouerApresAccepter(new Error('réponse perdue après création'))
      }
    }
    const inconnu = await b.service.executer('apercu-1', creation, { entretiens: 'tous-prevus' })
    expect(inconnu.statut).toBe('indeterminee')
    const cree = Object.values(lireDistant<CorpusFichier>(b, 'corpus.json').codebook).find((c) => c.nom === 'Nouvelle')!
    expect(cree).toBeDefined()
    b.depot.rendreCommits()
    const verifie = await b.service.reconcilier('apercu-1')
    expect(verifie).toMatchObject({ statut: 'partielle', bilan: { ciblesCreees: [{ token: 'nouvelle', id: cree.id }] } })
    const reprise = await b.service.preparerReprise('apercu-1')
    const termine = await b.service.executer(reprise.apercu.operationId, reprise.demande, { entretiens: 'tous-prevus' })
    expect(termine.statut).toBe('appliquee')
    expect(Object.values(lireDistant<CorpusFichier>(b, 'corpus.json').codebook).filter((c) => c.nom === 'Nouvelle')).toHaveLength(1)
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e1.json').annotations[0].code).toBe(cree.id)
  })

  test('une finalisation acceptée sans réponse est retrouvée et clôt le lot sans rejeu', async () => {
    const fusion: DemandeOperationTheme = { type: 'fusion', source: 'source', cible: 'cible' }
    const b = banc(fusion)
    let pannePosee = false
    b.depot.rendreCommitsIllisibles()
    b.depot.avantCommit = (actions) => {
      if (!pannePosee && actions.filter((a) => a.action === 'chmod').length === 2) {
        pannePosee = true
        b.depot.echouerApresAccepter(new Error('réponse perdue après finalisation'))
      }
    }
    const inconnu = await b.service.executer('apercu-1', fusion, { entretiens: 'tous-prevus' })
    expect(inconnu).toMatchObject({ statut: 'indeterminee', bilan: { sourceConservee: null, finalisation: 'indeterminee' } })
    expect(lireDistant<CorpusFichier>(b, 'corpus.json').codebook.source).toBeUndefined()
    const commitsAvant = b.depot.commits.length
    b.depot.rendreCommits()
    const verifie = await b.service.reconcilier('apercu-1')
    expect(verifie.statut).toBe('appliquee')
    expect(b.depot.commits.length).toBe(commitsAvant + 1)
  })

  test('accepte un volume cumulé supérieur à 2 Mio quand chaque commit reste sous la borne', async () => {
    const b = banc()
    for (const id of ['e1', 'e2']) {
      const data = entretien(id)
      data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(1_100_000) }] }] }
      b.depot.modifierHorsProtocole(`${RACINE}/entretiens/${id}.json`, JSON.stringify(data, null, 2))
      b.manifeste.entretiens.set(id, empreinteTheme(data))
    }
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'tous-prevus' })
    expect(resultat).toMatchObject({ statut: 'appliquee', entretiens: 2 })
  })

  test('refuse un candidat individuel trop gros sans annuler les autres entretiens', async () => {
    const b = banc()
    const data = entretien('e1')
    data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(2_200_000) }] }] }
    b.depot.modifierHorsProtocole(`${RACINE}/entretiens/e1.json`, JSON.stringify(data, null, 2))
    b.manifeste.entretiens.set('e1', empreinteTheme(data))
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'tous-prevus' })
    expect(resultat).toMatchObject({ statut: 'partielle', bilan: {
      echecs: [{ id: 'e1', motif: expect.stringMatching(/volumineux/) }], reussis: [{ id: 'e2' }],
    } })
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e1.json').annotations[0].code).toBe('source')
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e2.json').annotations[0].code).toBe('cible')
  })

  test('un entretien modifié depuis l’aperçu échoue sans annuler le succès précédent', async () => {
    const b = banc()
    const e2 = lireDistant<EntretienFichier>(b, 'entretiens/e2.json')
    e2.annotations.push({ id: 'nouveau', type: 'commentaire', from: 0, to: 1, auteur: 'bob', contenu: 'x' })
    b.depot.modifierHorsProtocole(`${RACINE}/entretiens/e2.json`, JSON.stringify(e2, null, 2))
    const resultat = await b.service.executer('apercu-1', transfert, { entretiens: 'tous-prevus' })
    expect(resultat).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }], echecs: [{ id: 'e2' }] } })
    expect(lireDistant<EntretienFichier>(b, 'entretiens/e1.json').annotations[0].code).toBe('cible')
  })
})
