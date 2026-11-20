import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ProviderFilesLock } from '../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../src/main/verrous/providerPutConditionnel'
import { CorrectionsLocuteursWebDAV } from '../src/main/distant/correctionsLocuteursWebDAV'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'

const dossiers: string[] = []
afterEach(() => { for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc(natif = false) {
  const fixture = fixtureLocuteursDistants(), serveur = new ServeurWebDAVMemoire()
  serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.crp', JSON.stringify(fixture.corpus))
  for (const s of fixture.sources()) serveur.poser(`entretiens/${s.id}.json`, s.contenu)
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-webdav-')); dossiers.push(dir)
  let intercepter: (r: Request) => Promise<Response | undefined> = async () => undefined
  const requetes: Request[] = [], miroir = new Map<string, string>(), sessions: string[] = []
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (input, init) => {
    const req = new Request(input, init); requetes.push(req)
    return await intercepter(req) ?? serveur.fetch(input, init)
  })
  const identite = () => ({ userId: 'max', machineId: 'poste', sessionId: randomUUID() })
  const recreer = () => new CorrectionsLocuteursWebDAV({ client, dirLocal: dir, utilisateur: () => 'max', sessionsLocales: () => sessions, verifierContexte: () => {},
    miroir: (chemin, contenu) => { miroir.set(chemin, contenu) },
    verrouCorpus: () => { const id = identite(); return { provider: new ProviderPutConditionnel(client, () => id), chemin: 'verrous/corpus.lock.json' } },
    verrouEntretien: (id) => { const propre = identite(); return { provider: natif ? new ProviderFilesLock(client, () => propre) : new ProviderPutConditionnel(client, () => propre), chemin: natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json` } },
  })
  const commande = () => ({ type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice publiée', attendu: fixture.attendu() })
  const puts = () => requetes.filter((r) => r.method === 'PUT' && /\/(corpus\.crp|entretiens\/[ABC]\.json)$/.test(new URL(r.url).pathname))
  const cible = (r: Request, id: string) => new URL(r.url).pathname.endsWith(`/entretiens/${id}.json`)
  const journal = () => JSON.parse(readFileSync(join(dir, '.corrections-locuteurs-webdav.json'), 'utf8'))
  return { fixture, serveur, client, dir, recreer, service: recreer(), commande, puts, cible, journal, requetes, miroir, sessions,
    intercepter: (fn: typeof intercepter) => { intercepter = fn } }
}

test.each([false, true])('aperçu natif=%s : sources serveur complètes, aucun verrou ni PUT de données', async (natif) => {
  const b = banc(natif), details = await b.service.lireDetails()
  expect(JSON.stringify(details.inventaire)).toBe(b.fixture.attendu())
  expect(details.inventaire.notes).toHaveLength(3)
  expect(b.requetes.every((r) => r.method === 'GET')).toBe(true)
  expect(b.miroir.size).toBe(0)
})

test.each([false, true])('renommage natif=%s : tous les membres protégés, données conservées et miroir confirmé', async (natif) => {
  const b = banc(natif)
  expect(await b.service.appliquer(b.commande())).toBe('a')
  expect(b.puts()).toHaveLength(3)
  for (const e of b.fixture.entretiens) {
    const lu = JSON.parse(b.serveur.contenuDe(`entretiens/${e.id}.json`)!)
    expect(lu).toEqual(e.id === 'C' ? e.data : { ...e.data, lastModified: expect.any(String), participations: [{ ...e.data.participations[0], nom: 'Alice publiée' }] })
    expect(b.serveur.contenuDe(`verrous/${e.id}.lock.json`)).toBeUndefined()
    expect(b.serveur.verrouNatifDe(`entretiens/${e.id}.json`)).toBeUndefined()
    expect(JSON.parse(b.miroir.get(`entretiens/${e.id}.json`)!)).toEqual(lu)
  }
  expect(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs.a.nom).toBe('Alice publiée')
  expect(b.journal().termine).toBe(true); expect(b.service.lireSuivi()).toBeNull()
})

test.each([false, true])('réunion natif=%s : la définition absorbée reste présente jusqu’à la dernière publication', async (natif) => {
  const b = banc(natif)
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && b.cible(r, 'C')) expect(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs.b).toBeDefined()
    return undefined
  })
  await b.service.appliquer({ type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Réunis', uniformiserNoms: false, attendu: b.fixture.attendu() })
  expect(b.puts()).toHaveLength(2)
  expect(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs.b).toBeUndefined()
  expect(JSON.parse(b.serveur.contenuDe('entretiens/C.json')!).participations[0]).toEqual({ ...b.fixture.entretiens[2].data.participations[0], locuteurRef: 'a' })
})

test('dissociation : définition publiée avant son association et ids stables après un arrêt', async () => {
  const b = banc()
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && b.cible(r, 'A')) return new Response('Refus certain', { status: 412 })
    return undefined
  })
  await expect(b.service.appliquer({ type: 'dissocierSelection', locuteurId: 'a', participations: [{ entretienId: 'A', participationId: 'local' }], attendu: b.fixture.attendu() })).rejects.toThrow()
  const apresDefinition = JSON.parse(b.serveur.contenuDe('corpus.crp')!), id = Object.keys(apresDefinition.locuteurs).find((id) => !Object.hasOwn(b.fixture.corpus.locuteurs, id))!
  expect(id).toBeTruthy(); expect(b.service.lireSuivi()?.etat).toBe('a-reprendre')
  const operation = b.service.lireSuivi()!.operationId
  b.intercepter(async () => undefined)
  const repris = b.recreer()
  await repris.reprendre(operation)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).participations[0].locuteurRef).toBe(id)
  expect(Object.keys(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs)).toHaveLength(4)
  expect(repris.lireSuivi()).toBeNull()
})

test.each([0, 1, 2, 3].flatMap((etape) => [false, true].map((accepte) => ({ etape, accepte }))))('dissociation à l’étape $etape, acceptée=$accepte : reprise des candidats fixes sans doublon', async ({ etape, accepte }) => {
  const b = banc(); let numero = 0
  b.intercepter(async (r) => {
    if (r.method !== 'PUT' || !/\/(corpus\.crp|entretiens\/[ABC]\.json)$/.test(new URL(r.url).pathname) || numero++ !== etape) return undefined
    if (!accepte) return new Response('Refus avant acceptation', { status: 412 })
    await b.serveur.fetch(r.clone()); throw new Error('Réponse perdue après acceptation')
  })
  await expect(b.service.appliquer({ type: 'dissocierSelection', locuteurId: 'a', participations: [{ entretienId: 'A', participationId: 'local' }], attendu: b.fixture.attendu() })).rejects.toThrow()
  const journal = b.journal(), avant = b.puts().length, repris = b.recreer()
  expect(journal.etapes).toHaveLength(4)
  b.intercepter(async () => undefined)
  if (accepte) {
    await repris.reconcilier(journal.operationId)
    expect(b.puts()).toHaveLength(avant)
  }
  if (repris.lireSuivi()) await repris.reprendre(journal.operationId)
  expect(repris.lireSuivi()).toBeNull()
  expect(b.journal().etapes).toEqual(journal.etapes)
  expect(b.puts()).toHaveLength(accepte ? 4 : 5)
  expect(b.serveur.contenuDe('corpus.crp')).toBe(journal.corpusApres)
  for (const s of journal.sources) expect(b.serveur.contenuDe(`entretiens/${s.id}.json`)).toBe(s.apres)
})

test('réponse perdue après acceptation : vérification sans PUT, puis reprise sans réécriture du succès', async () => {
  const b = banc()
  let perdu = false
  b.intercepter(async (r) => {
    if (!perdu && r.method === 'PUT' && b.cible(r, 'A')) {
      perdu = true; await b.serveur.fetch(r.clone()); throw new Error('Réponse perdue')
    }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const suivi = b.service.lireSuivi()!; expect(suivi.etat).toBe('a-verifier')
  await expect(b.service.reprendre(suivi.operationId)).rejects.toThrow('Vérifiez')
  expect(() => b.service.arreter(suivi.operationId)).toThrow('Vérifiez')
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('reste à terminer')
  const repris = b.recreer(), avant = b.puts().length
  await repris.reconcilier(suivi.operationId)
  expect(b.puts()).toHaveLength(avant); expect(repris.lireSuivi()?.etat).toBe('a-reprendre')
  await repris.reprendre(suivi.operationId)
  expect(b.puts().filter((r) => b.cible(r, 'A'))).toHaveLength(1)
  expect(repris.lireSuivi()).toBeNull()
})

test('réponse inconnue sans candidat observé : aucun rejeu ni retrait de définition', async () => {
  const b = banc()
  b.intercepter(async (r) => { if (r.method === 'PUT' && b.cible(r, 'A')) throw new Error('Requête interrompue'); return undefined })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const suivi = b.service.lireSuivi()!, avant = b.puts().length
  await expect(b.recreer().reconcilier(suivi.operationId)).rejects.toThrow('n’est pas confirmée')
  expect(b.puts()).toHaveLength(avant); expect(b.service.lireSuivi()?.etat).toBe('a-verifier')
})

test('une édition extérieure après un progrès confirmé suspend la reprise sans l’écraser', async () => {
  const b = banc()
  b.intercepter(async (r) => r.method === 'PUT' && b.cible(r, 'B') ? new Response('conflit', { status: 412 }) : undefined)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow()
  const operation = b.service.lireSuivi()!.operationId, nouveau = structuredClone(b.fixture.entretiens[2].data)
  nouveau.notes![0].corps = 'Modification d’un collègue'; b.serveur.poser('entretiens/C.json', JSON.stringify(nouveau))
  b.intercepter(async () => undefined)
  const avant = b.puts().length
  await expect(b.recreer().reprendre(operation)).rejects.toThrow('a changé')
  expect(b.puts()).toHaveLength(avant)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/C.json')!).notes[0].corps).toBe('Modification d’un collègue')
})

test('arrêt explicite d’un lot connu : aucun PUT de plus, aucun retour des étapes déjà confirmées', async () => {
  const b = banc()
  b.intercepter(async (r) => r.method === 'PUT' && b.cible(r, 'B') ? new Response('refus', { status: 412 }) : undefined)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow()
  const suivi = b.service.lireSuivi()!, avant = b.puts().length
  b.recreer().arreter(suivi.operationId)
  expect(b.service.lireSuivi()).toBeNull()
  expect(b.puts()).toHaveLength(avant)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).participations[0].nom).toBe('Alice publiée')
  expect(JSON.parse(b.serveur.contenuDe('entretiens/B.json')!).participations[0].nom).toBe('Alice B')
  expect(b.journal().abandonne).toBe(true)
})

test('la perte d’un droit après un premier succès arrête le lot avant toute autre publication', async () => {
  const b = banc()
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && b.cible(r, 'A')) {
      const reponse = await b.serveur.fetch(r.clone())
      b.serveur.poser('verrous/B.lock.json', JSON.stringify({ userId: 'autre', machineId: 'autre-poste', sessionId: 'reprise-etrangere', acquiredAt: new Date().toISOString(), refreshedAt: new Date().toISOString(), ttl: 300 }))
      return reponse
    }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('protection')
  expect(b.puts()).toHaveLength(1)
  expect(b.service.lireSuivi()).toMatchObject({ etat: 'a-reprendre', termines: 1 })
  expect(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs.a.nom).toBe('Alice')
})

test.each(['session', 'source absente', 'source invalide', 'ETag faible', 'suivi corrompu', 'autre destination'] as const)('%s : aucune publication de données', async (cas) => {
  const b = banc()
  if (cas === 'session') b.sessions.push('A')
  if (cas === 'source absente') b.intercepter(async (r) => r.method === 'GET' && b.cible(r, 'C') ? new Response('absent', { status: 404 }) : undefined)
  if (cas === 'source invalide') b.serveur.poser('entretiens/C.json', '{}')
  if (cas === 'ETag faible') b.intercepter(async (r) => r.method === 'GET' && b.cible(r, 'C') ? new Response(b.serveur.contenuDe('entretiens/C.json'), { headers: { ETag: 'W/"faible"' } }) : undefined)
  if (cas === 'suivi corrompu') writeFileSync(join(b.dir, '.corrections-locuteurs-webdav.json'), '{}')
  if (cas === 'autre destination') {
    await b.service.appliquer(b.commande())
    const j = b.journal(); j.destination = 'ailleurs'; writeFileSync(join(b.dir, '.corrections-locuteurs-webdav.json'), JSON.stringify(j))
    b.requetes.splice(0)
  }
  await expect(b.recreer().appliquer(b.commande())).rejects.toThrow()
  expect(b.puts()).toEqual([])
})
