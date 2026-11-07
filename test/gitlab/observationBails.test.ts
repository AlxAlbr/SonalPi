import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { ClientGitLab } from '../../src/main/gitlab/client'
import {
  cheminBailRessourceGitLab,
  cleRessourceBailGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { ObservationBailsGitLab } from '../../src/main/gitlab/observationBails'
import type { SessionGitLab } from '../../src/main/gitlab/session'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../webdav/fixturesCorpusDistant'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const COMMIT = '1'.repeat(40)
// Un bail n'exclut que tant qu'il n'est pas périmé : les dates des fixtures
// sont donc loin du jour du test, jamais « aujourd'hui ».
const VIVANT = '2099-01-01T00:10:00.000Z'
const PERIME = '2020-01-01T00:00:01.000Z'
const DESTINATION = 'destination-test'
const BRANCHE = 'main'
const RACINE = 'donnees'

interface Depot {
  commit: string
  fichiers: Record<string, string>
}

function ressourceEntretien(id: string, destination = DESTINATION): string {
  return `entretien:${destination}:${id}`
}

function cheminEntretienDistant(id: string, racine = RACINE): string {
  const chemin = `entretiens/${id}.json`
  return racine ? `${racine}/${chemin}` : chemin
}

function bailDeRessource(
  ressource: string,
  options: {
    expireLe: string
    version?: 1 | 2
    holder?: { userId: string; machineId: string; sessionId: string }
  },
): { chemin: string; contenu: string } {
  const version = options.version ?? 2
  const contenu = JSON.stringify({
    version,
    protocole: version === 1 ? 'sonal-bail-v1' : 'sonal-bail-v2',
    resourceHash: createHash('sha256').update(ressource, 'utf8').digest('hex'),
    generation: 'generation-1',
    holder: options.holder ?? { userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' },
    expireLe: options.expireLe,
    compteur: 1,
  })
  return { chemin: cheminBailRessourceGitLab(ressource), contenu }
}

/** Bail d'entretien : versionné sur branche et racine, ou ancien marqueur
 *  écrit sous la seule ressource de session. */
function bailEntretien(
  id: string,
  options: {
    expireLe: string
    racine?: string
    branche?: string
    version?: 1 | 2
    holder?: { userId: string; machineId: string; sessionId: string }
  },
): { chemin: string; contenu: string } {
  const version = options.version ?? 2
  return bailDeRessource(
    version === 2
      ? cleRessourceBailGitLab(
        options.branche ?? BRANCHE,
        cheminEntretienDistant(id, options.racine),
      )
      : ressourceEntretien(id),
    { ...options, version },
  )
}

/** Réponse forcée sur une requête précise, ou `undefined` pour la laisser passer. */
type Panne = (url: URL) => Response | Error | undefined

interface Requete {
  chemin: string
  methode: string
  ref: string | null
  dossier: string | null
}

/** Dépôt de test : résolution de branche, inventaire paginé, fichiers bruts. */
function fetchFactice(
  depot: Depot,
  journal: Requete[],
  pannes: Panne[] = [],
): typeof fetch {
  return (async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entree))
    const chemin = decodeURIComponent(url.pathname)
    journal.push({
      chemin,
      methode: init?.method ?? 'GET',
      ref: url.searchParams.get('ref'),
      dossier: url.searchParams.get('path'),
    })
    for (const panne of pannes) {
      const resultat = panne(url)
      if (resultat instanceof Error) throw resultat
      if (resultat) return resultat
    }
    if (chemin.includes('/repository/branches/')) {
      return new Response(JSON.stringify({ commit: { id: depot.commit } }), { status: 200 })
    }
    if (chemin.endsWith('/repository/tree')) {
      const dossier = url.searchParams.get('path') ?? ''
      const parPage = Number(url.searchParams.get('per_page') ?? '100')
      const page = Number(url.searchParams.get('page') ?? '1')
      const enfants = new Map<string, 'blob' | 'tree'>()
      for (const fichier of Object.keys(depot.fichiers)) {
        const prefixe = dossier ? `${dossier}/` : ''
        if (!fichier.startsWith(prefixe) || fichier === dossier) continue
        const suite = fichier.slice(prefixe.length).split('/')
        if (!suite[0]) continue
        enfants.set(suite[0], suite.length > 1 ? 'tree' : 'blob')
      }
      const noms = [...enfants.keys()].sort()
      const entetes = new Headers()
      if (page * parPage < noms.length) entetes.set('x-next-page', String(page + 1))
      return new Response(JSON.stringify(noms.slice((page - 1) * parPage, page * parPage)
        .map((nom) => ({
          id: `${enfants.get(nom)}-${nom}`,
          name: nom,
          type: enfants.get(nom),
          path: dossier ? `${dossier}/${nom}` : nom,
          mode: enfants.get(nom) === 'tree' ? '040000' : '100644',
        }))), { status: 200, headers: entetes })
    }
    if (chemin.includes('/repository/files/')) {
      const fichier = chemin
        .replace(/^.*\/repository\/files\//, '')
        .replace(/\/raw$/, '')
      const contenu = depot.fichiers[fichier]
      return contenu === undefined
        ? new Response(null, { status: 404 })
        : new Response(contenu, { status: 200 })
    }
    return new Response(null, { status: 404 })
  }) as typeof fetch
}

function clientDeTest(fetchImpl: typeof fetch): ClientGitLab {
  return new ClientGitLab({
    urlInstance: 'https://gitlab.example.org',
    projetId: 42,
    autorisation: { type: 'jeton-prive', jeton: 'secret' },
  }, fetchImpl)
}

/** Ouvre la destination et rend les badges relevés au tirage d'ouverture. */
async function ouvrir(
  depot: Depot,
  journal: Requete[],
  options: {
    pannes?: Panne[]
    creerSession?: (ressource: string, cheminRelatif: string) => SessionGitLab
    branche?: string
    racine?: string
    destinationId?: string
  } = {},
) {
  const preparation = await preparerContexteGitLabLectureSeule({
    id: options.destinationId ?? DESTINATION,
    dirLocal: mkdtempSync(join(tmpdir(), 'sonal-gitlab-baux-')),
    client: clientDeTest(fetchFactice(depot, journal, options.pannes)),
    branche: options.branche ?? BRANCHE,
    racine: options.racine ?? RACINE,
    creerSession: options.creerSession,
  })
  return preparation
}

function corpusDeTest(extra: Record<string, string> = {}): Depot {
  return {
    commit: COMMIT,
    fichiers: {
      [`${RACINE}/corpus.crp`]: corpusDistantValide(['e1', 'e2']),
      [`${RACINE}/entretiens/e1.json`]: entretienDistantValide(),
      [`${RACINE}/entretiens/e2.json`]: entretienDistantValide(),
      ...extra,
    },
  }
}

describe('observation des bails GitLab', () => {
  test('nomme le détenteur d’un entretien sans écrire sur le dépôt', async () => {
    const bail = bailEntretien('e1', { expireLe: VIVANT })
    const journal: Requete[] = []
    const preparation = await ouvrir(corpusDeTest({ [bail.chemin]: bail.contenu }), journal)

    expect(preparation.verrous).toEqual([{
      chemin: 'entretiens/e1.json',
      etag: null,
      contenu: { userId: 'alice', machineId: 'poste-a', acquiredAt: '' },
    }])
    expect(journal.every(({ methode }) => methode === 'GET')).toBe(true)
    // Un seul commit résolu pour le miroir et l'observation.
    expect(journal.filter(({ chemin }) => chemin.includes('/repository/branches/'))).toHaveLength(1)
    // Seul le bail attendu est lu, pas tout le dossier de coordination.
    const lecturesDeBaux = journal.filter(({ chemin }) =>
      chemin.includes('/repository/files/.sonal/verrous/'))
    expect(lecturesDeBaux).toHaveLength(1)
    expect(lecturesDeBaux[0].ref).toBe(COMMIT)
  })

  test('calcule le bail sur la branche et la racine réellement configurées', async () => {
    const bail = bailEntretien('e1', {
      expireLe: VIVANT,
      branche: 'equipe/main',
      racine: 'corpus/projet',
    })
    const journal: Requete[] = []
    const depot: Depot = {
      commit: COMMIT,
      fichiers: {
        'corpus/projet/corpus.crp': corpusDistantValide(['e1']),
        'corpus/projet/entretiens/e1.json': entretienDistantValide(),
        [bail.chemin]: bail.contenu,
      },
    }
    const preparation = await ouvrir(depot, journal, {
      branche: 'equipe/main',
      racine: 'corpus/projet',
    })

    expect(preparation.verrous).toHaveLength(1)
    expect(preparation.corpus.membership).toHaveProperty('e1')
  })

  test('ignore un bail expiré et garde un ancien marqueur, même périmé', async () => {
    const expire = bailEntretien('e1', { expireLe: PERIME })
    const ancien = bailEntretien('e2', { expireLe: PERIME, version: 1 })
    const journal: Requete[] = []
    const preparation = await ouvrir(
      corpusDeTest({ [expire.chemin]: expire.contenu, [ancien.chemin]: ancien.contenu }),
      journal,
    )

    expect(preparation.verrous).toEqual([{
      chemin: 'entretiens/e2.json',
      etag: null,
      contenu: { userId: 'alice', machineId: 'poste-a', acquiredAt: '' },
    }])
  })

  test('ne lit ni le bail du corpus, ni ceux d’entretiens absents du membership', async () => {
    const e1 = bailEntretien('e1', { expireLe: VIVANT })
    const inconnu = bailEntretien('e9', { expireLe: VIVANT })
    const bailDuCorpus = bailDeRessource(
      cleRessourceBailGitLab(BRANCHE, `${RACINE}/corpus.crp`),
      { expireLe: VIVANT },
    )
    const journal: Requete[] = []
    await ouvrir(corpusDeTest({
      [e1.chemin]: e1.contenu,
      [inconnu.chemin]: inconnu.contenu,
      [bailDuCorpus.chemin]: bailDuCorpus.contenu,
      '.sonal/verrous/autre-fichier.json': '{}',
    }), journal)

    const lus = journal
      .filter(({ chemin }) => chemin.includes('/repository/files/.sonal/verrous/'))
      .map(({ chemin }) => chemin)
    expect(lus).toHaveLength(1)
    expect(lus[0]).toContain(e1.chemin.slice('.sonal/verrous/'.length))
  })

  test('deux corpus du même dépôt ne se badgent pas l’un l’autre', async () => {
    const bail = bailDeRessource(
      cleRessourceBailGitLab(BRANCHE, cheminEntretienDistant('e1')),
      { expireLe: VIVANT },
    )
    const journal: Requete[] = []
    const preparation = await ouvrir({
      commit: COMMIT,
      fichiers: {
        'donnees/corpus.crp': corpusDistantValide(['e1']),
        'donnees/entretiens/e1.json': entretienDistantValide(),
        'donnees2/corpus.crp': corpusDistantValide(['e1']),
        'donnees2/entretiens/e1.json': entretienDistantValide(),
        [bail.chemin]: bail.contenu,
      },
    }, journal, { destinationId: 'autre-destination', racine: 'donnees2' })

    expect(preparation.verrous).toEqual([])
    const lus = journal.filter(({ chemin }) => chemin.includes('/repository/files/.sonal/verrous/'))
    expect(lus).toHaveLength(0)
  })

  test('omet un bail corrompu sans masquer les autres', async () => {
    const bon = bailEntretien('e2', { expireLe: VIVANT })
    const casse = bailEntretien('e1', { expireLe: VIVANT })
    const journal: Requete[] = []
    const preparation = await ouvrir(corpusDeTest({
      [casse.chemin]: '{ ceci n’est pas un bail',
      [bon.chemin]: bon.contenu,
    }), journal)

    expect(preparation.verrous).toEqual([{
      chemin: 'entretiens/e2.json',
      etag: null,
      contenu: { userId: 'alice', machineId: 'poste-a', acquiredAt: '' },
    }])
  })

  test('un dossier absent, un refus et une coupure laissent la consultation ouverte', async () => {
    const bail = bailEntretien('e1', { expireLe: VIVANT })
    const depot = corpusDeTest({ [bail.chemin]: bail.contenu })
    const cas: Record<string, { panne: () => Response | Error; attendu: boolean }> = {
      // Un dépôt sans bails est un état normal : ce n'est pas une panne.
      'dossier absent': { panne: () => new Response(null, { status: 404 }), attendu: false },
      'droits refusés': { panne: () => new Response(null, { status: 403 }), attendu: true },
      'coupure': { panne: () => new Error('connexion perdue'), attendu: true },
    }

    for (const [nom, { panne, attendu }] of Object.entries(cas)) {
      const journal: Requete[] = []
      const preparation = await ouvrir(depot, journal, {
        pannes: [(url) => (url.searchParams.get('path') === '.sonal/verrous' ? panne() : undefined)],
      })
      expect(preparation.verrous, nom).toEqual([])
      // L'interface n'affiche aucun badge dans les deux cas ; seule la panne
      // est signalée, l'absence de détenteur ne l'est pas.
      expect(preparation.verrousIndisponibles ?? false, nom).toBe(attendu)
      expect(preparation.corpus.membership, nom).toHaveProperty('e1')
    }
  })

  test('signale une panne pendant la lecture d’un bail inventorié', async () => {
    const bail = bailEntretien('e1', { expireLe: VIVANT })
    const journal: Requete[] = []
    const preparation = await ouvrir(
      corpusDeTest({ [bail.chemin]: bail.contenu }),
      journal,
      {
        pannes: [(url) =>
          decodeURIComponent(url.pathname).includes('/repository/files/.sonal/verrous/')
            ? new Response(null, { status: 403 })
            : undefined],
      },
    )

    expect(preparation.verrous).toEqual([])
    expect(preparation.verrousIndisponibles).toBe(true)
  })

  test('préfère le marqueur historique lorsque les deux protocoles coexistent', async () => {
    const courant = bailEntretien('e1', {
      expireLe: VIVANT,
      holder: { userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' },
    })
    const ancien = bailEntretien('e1', {
      expireLe: PERIME,
      version: 1,
      holder: { userId: 'bob', machineId: 'poste-b', sessionId: 'session-b' },
    })
    const preparation = await ouvrir(corpusDeTest({
      [courant.chemin]: courant.contenu,
      [ancien.chemin]: ancien.contenu,
    }), [])

    expect(preparation.verrous).toEqual([{
      chemin: 'entretiens/e1.json',
      etag: null,
      contenu: { userId: 'bob', machineId: 'poste-b', acquiredAt: '' },
    }])
  })

  test('suit la pagination de l’inventaire des baux', async () => {
    const e1 = bailEntretien('e1', { expireLe: VIVANT })
    const enBails: Record<string, string> = { [e1.chemin]: e1.contenu }
    for (let index = 0; index < 120; index += 1) {
      enBails[`.sonal/verrous/${String(index).padStart(64, '0')}.json`] = '{}'
    }
    const journal: Requete[] = []
    const preparation = await ouvrir(corpusDeTest(enBails), journal)

    expect(preparation.verrous).toHaveLength(1)
    const pages = journal.filter(({ dossier }) => dossier === '.sonal/verrous')
    expect(pages.length).toBeGreaterThanOrEqual(2)
  })

  test('ne badge pas la session que ce poste détient, mais bien celle d’un collègue', async () => {
    const mien = bailEntretien('e1', { expireLe: VIVANT })
    const collegue = bailEntretien('e2', {
      expireLe: VIVANT,
      holder: { userId: 'bob', machineId: 'poste-b', sessionId: 'session-b' },
    })
    const journal: Requete[] = []
    const session = {
      ouvrir: vi.fn(async () => ({ etat: 'edition', revision: 0, revisionPubliee: 0 })),
      etat: vi.fn(() => ({ etat: 'edition', revision: 0, revisionPubliee: 0 })),
      tientBail: vi.fn((bail: { sessionId: string }) => bail.sessionId === 'session-a'),
      fermer: vi.fn(async () => ({ fermee: true })),
    } as unknown as SessionGitLab
    const depot = corpusDeTest({
      [mien.chemin]: mien.contenu,
      [collegue.chemin]: collegue.contenu,
    })
    const preparation = await ouvrir(depot, journal, { creerSession: () => session })

    await preparation.contexte.ouvrirSessionEntretien('e1')
    const tirage = await preparation.contexte.actualiser()
    expect(tirage.verrous).toEqual([{
      chemin: 'entretiens/e2.json',
      etag: null,
      contenu: { userId: 'bob', machineId: 'poste-b', acquiredAt: '' },
    }])
    // Une ancienne session locale ne masque pas un bail repris.
    // Le nouveau détenteur reste visible.
    const repris = bailEntretien('e1', {
      expireLe: VIVANT,
      holder: { userId: 'charlie', machineId: 'poste-c', sessionId: 'session-c' },
    })
    depot.fichiers[repris.chemin] = repris.contenu
    depot.commit = '2'.repeat(40)
    const resolutionsAvant = journal.filter(({ chemin }) => chemin.includes('/repository/branches/')).length
    const suivant = await preparation.contexte.actualiser()
    expect(suivant.verrous).toContainEqual({
      chemin: 'entretiens/e1.json',
      etag: null,
      contenu: { userId: 'charlie', machineId: 'poste-c', acquiredAt: '' },
    })
    expect(journal.filter(({ chemin }) => chemin.includes('/repository/branches/'))).toHaveLength(
      resolutionsAvant + 1,
    )
  })

  test('un observateur sans entretien ni dossier de bails ne coûte aucune lecture', async () => {
    const journal: Requete[] = []
    const instantane = new InstantaneLectureGitLab(
      clientDeTest(fetchFactice(corpusDeTest(), journal)),
      BRANCHE,
      RACINE,
    )
    const observation = new ObservationBailsGitLab({
      instantane,
      branche: BRANCHE,
      racine: RACINE,
      idsEntretiens: () => [],
      ressource: ressourceEntretien,
      bailTenuLocalement: () => false,
    })

    await expect(observation.observerVerrous()).resolves.toEqual({
      entrees: [],
      indisponible: false,
    })
    expect(journal).toHaveLength(0)
  })
})
