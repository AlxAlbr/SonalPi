import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { ApercusThemesGitLab } from '../../src/main/gitlab/apercusThemes'
import { cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { ObservationBailsGitLab } from '../../src/main/gitlab/observationBails'
import type { OperationsThemesGitLab } from '../../src/main/gitlab/operationsThemes'
import type { DemandeOperationTheme } from '../../src/shared/corpus/themes'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import {
  configuration,
  configurationPresente,
  contenuDe,
  creerRacine,
  definirPrefixeBanc,
  lireFichier,
  nettoyer,
  pile,
  racineDe,
  type Pile,
} from './qualificationBanc'

definirPrefixeBanc('themes-ecriture')
const piles: Pile[] = []
afterAll(() => nettoyer(...piles))

function corpus(ids = ['e1', 'e2']): CorpusFichier {
  const c = squeletteCorpus('Qualification thèmes')
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
    formatVersion: FORMAT_VERSION, lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `passage ${id}` }] }] },
    annotations: [{ id: `a-${id}`, type: 'codage', code: 'source', from: 0, to: 7, auteur: 'qualification' }],
    ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
  }
}

async function banc(suffixe: string) {
  const c = corpus()
  const racine = racineDe(suffixe)
  await creerRacine(suffixe, { corpus: c }, racine)
  const initial = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `${suffixe}-a`, corpusLocal: c })
  const tiers = pile({ racine, jeton: configuration.token2!, userId: 'user2', sessionId: `${suffixe}-b`, corpusLocal: c })
  piles.push(initial, tiers)
  await initial.depot.publierCommit('main', `qualification thèmes ${suffixe}: entretiens`, ['e1', 'e2'].map((id) => ({
    action: 'create' as const, file_path: `${racine}/entretiens/${id}.json`, content: JSON.stringify(entretien(id), null, 2),
  })))
  for (const p of [initial, tiers]) {
    mkdirSync(join(p.dossier, 'entretiens'), { recursive: true })
    for (const id of ['e1', 'e2']) writeFileSync(join(p.dossier, 'entretiens', `${id}.json`), JSON.stringify(entretien(id), null, 2))
  }
  const instantane = new InstantaneLectureGitLab(initial.client, 'main', racine)
  const observation = new ObservationBailsGitLab({
    instantane, branche: 'main', racine, idsEntretiens: () => ['e1', 'e2'],
    ressource: (id) => cleRessourceBailGitLab('main', `${racine}/entretiens/${id}.json`),
    bailTenuLocalement: () => false,
  })
  const apercus = new ApercusThemesGitLab({ client: initial.client, branche: 'main', racine,
    adapter: (avant) => initial.store.adapterEntretienOperationTheme(avant),
    observer: (ids, lecteur) => observation.observerCibles(ids, lecteur), sessionsLocales: () => [] })
  const operations = initial.transactions.creerOperationsThemes(apercus, initial.dossier, () => [])
  return { initial, tiers, racine, apercus, operations }
}

async function distant<T>(racine: string, chemin: string): Promise<T> {
  const r = await lireFichier(`${racine}/${chemin}`, configuration.token1!)
  expect(r.statut).toBe(200)
  return JSON.parse(contenuDe(r)) as T
}

const suite = configurationPresente ? describe : describe.skip
suite('qualification réelle des lots de thématiques GitLab', () => {
  test('un entretien tenu est différé, puis repris avec les contrôles réels de bail', async () => {
    const b = await banc('reprise')
    const droit = await b.tiers.coordination.acquireRessource(
      cleRessourceBailGitLab('main', `${b.racine}/entretiens/e2.json`),
    )
    expect(droit.ok).toBe(true)
    const demande: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
    const apercu = await b.operations.analyser(demande)
    expect(apercu.disponibiliteGitLab?.entretiens).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'e1', etat: 'libre-observe' }),
      expect.objectContaining({ id: 'e2', etat: 'tenu-autrui', detenteur: 'user2' }),
    ]))
    const premier = await b.operations.executer(apercu.operationId, demande, { entretiens: 'observes-libres' })
    expect(premier).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }], differes: [{ id: 'e2' }] } })
    if (droit.ok) await b.tiers.coordination.liberer(droit.droit)

    const reprise = await b.operations.preparerReprise(apercu.operationId)
    const second = await b.operations.executer(reprise.apercu.operationId, reprise.demande, { entretiens: 'tous-prevus' })
    expect(second).toMatchObject({ statut: 'appliquee', entretiens: 2, reaffectes: 2 })
    expect((await distant<EntretienFichier>(b.racine, 'entretiens/e1.json')).annotations[0].code).toBe('cible')
    expect((await distant<EntretienFichier>(b.racine, 'entretiens/e2.json')).annotations[0].code).toBe('cible')
  }, 120_000)

  test('une publication concurrente refuse la finalisation seule, puis la reprise supprime la source', async () => {
    const b = await banc('finalisation')
    const demande: DemandeOperationTheme = { type: 'fusion', sources: ['source', 'cible'], cible: 'cible' }
    const apercu = await b.operations.analyser(demande)
    const concurrencerFinalisation = async (): Promise<void> => {
      const fichier = await b.tiers.depot.lireFichier(`${b.racine}/entretiens/e1.json`, 'main')
      if (!fichier) throw new Error('Entretien concurrent absent.')
      const data = JSON.parse(fichier.contenu) as EntretienFichier
      data.annotations.push({ id: 'concurrent', type: 'codage', code: 'source', from: 8, to: 8, auteur: 'user2' })
      await b.tiers.depot.publierCommit('main', 'qualification thèmes: référence concurrente', [{
        action: 'update', file_path: `${b.racine}/entretiens/e1.json`, content: JSON.stringify(data, null, 2), last_commit_id: fichier.commitId,
      }])
    }
    b.initial.avantCommitDeDonneesQuand(
      (actions) => actions.filter((action) => action.action === 'chmod').length === 2,
      concurrencerFinalisation,
    )
    const partiel = await b.operations.executer(apercu.operationId, demande, { entretiens: 'tous-prevus' })
    expect(partiel).toMatchObject({ statut: 'partielle', bilan: { sourceConservee: true, finalisation: 'bloquee' } })
    expect((await distant<CorpusFichier>(b.racine, 'corpus.json')).codebook.source).toBeDefined()

    const reprise = await b.operations.preparerReprise(apercu.operationId)
    const termine = await b.operations.executer(reprise.apercu.operationId, reprise.demande, { entretiens: 'tous-prevus' })
    expect(termine.statut).toBe('appliquee')
    const final = await distant<CorpusFichier>(b.racine, 'corpus.json')
    expect(final.codebook.source).toBeUndefined()
    expect(final.codebook.enfant.parent).toBe('cible')
  }, 120_000)
})
