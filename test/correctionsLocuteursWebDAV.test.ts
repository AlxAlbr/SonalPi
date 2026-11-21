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
function banc(natif = false, nombre = 3) {
  const fixture = fixtureLocuteursDistants(), serveur = new ServeurWebDAVMemoire()
  for (let i = 3; i < nombre; i++) {
    const id = `E${i}`, e = structuredClone(fixture.entretiens[0]); e.id = id; e.titre = id
    fixture.entretiens.push(e); fixture.corpus.membership[id] = { ...fixture.corpus.membership.A, titre: id }
  }
  if (nombre > 3) fixture.entretiens[2].data.participations[0].locuteurRef = 'a'
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

test.each([false, true])('renommage natif=%s : seuls les entretiens modifiés sont protégés, données conservées et miroir confirmé', async (natif) => {
  const b = banc(natif)
  expect(await b.service.appliquer(b.commande())).toBe('a')
  expect(b.puts()).toHaveLength(3)
  for (const e of b.fixture.entretiens) {
    const lu = JSON.parse(b.serveur.contenuDe(`entretiens/${e.id}.json`)!)
    expect(lu).toEqual(e.id === 'C' ? e.data : { ...e.data, lastModified: expect.any(String), participations: [{ ...e.data.participations[0], nom: 'Alice publiée' }] })
    expect(b.serveur.contenuDe(`verrous/${e.id}.lock.json`)).toBeUndefined()
    expect(b.serveur.verrouNatifDe(`entretiens/${e.id}.json`)).toBeUndefined()
    if (e.id === 'C') expect(b.miroir.has(`entretiens/${e.id}.json`)).toBe(false)
    else expect(JSON.parse(b.miroir.get(`entretiens/${e.id}.json`)!)).toEqual(lu)
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
  await expect(b.service.arreter(suivi.operationId)).rejects.toThrow('Vérifiez')
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('reste à terminer')
  const repris = b.recreer(), avant = b.puts().length
  await repris.reconcilier(suivi.operationId)
  expect(b.puts()).toHaveLength(avant); expect(repris.lireSuivi()?.etat).toBe('a-reprendre')
  await repris.reprendre(suivi.operationId)
  expect(b.puts().filter((r) => b.cible(r, 'A'))).toHaveLength(1)
  expect(repris.lireSuivi()).toBeNull()
})

test.each([false, true])('réponse inconnue sans acceptation natif=%s : neutraliser l’ancien envoi permet un arrêt sûr', async (natif) => {
  const b = banc(natif); let retard: Request | undefined
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && b.cible(r, 'A')) { retard = r.clone(); throw new Error('Requête interrompue') }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const suivi = b.service.lireSuivi()!, original = b.fixture.entretiens[0].data
  b.intercepter(async () => undefined)
  await b.recreer().reconcilier(suivi.operationId)
  expect(b.service.lireSuivi()).toMatchObject({ etat: 'a-reprendre', termines: 0 })
  await b.recreer().arreter(suivi.operationId)
  expect(b.service.lireSuivi()).toBeNull()
  expect((await b.serveur.fetch(retard!)).status).toBe(412)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!)).toEqual(original)
  expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
})

test.each([false, true])('requête retardée avant finalisation natif=%s : neutralisation puis reprise, sans acceptation tardive', async (natif) => {
  const b = banc(natif); let retard: Request | undefined
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && new URL(r.url).pathname.endsWith('/corpus.crp') && !JSON.parse(await r.clone().text()).locuteurs.b) {
      retard = r.clone(); throw new Error('Requête toujours en cours sur le serveur')
    }
    return undefined
  })
  await expect(b.service.appliquer({ type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Réunis', uniformiserNoms: false, attendu: b.fixture.attendu() })).rejects.toThrow('vérifié')
  expect(retard).toBeDefined()
  const j = b.journal(), verrou = b.serveur.contenuDe('verrous/corpus.lock.json')
  expect(j.verrouCorpus.contenu).toBe(verrou)
  const autre = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'autre-poste', sessionId: 'autre-session' }))
  expect((await autre.acquerir('verrous/corpus.lock.json')).ok).toBe(false)
  const repris = b.recreer()
  await repris.reconcilier(j.operationId)
  expect(repris.lireSuivi()).toMatchObject({ etat: 'a-reprendre', termines: 1 })
  expect((await b.serveur.fetch(retard!)).status).toBe(412)
  b.intercepter(async () => undefined)
  await repris.reprendre(j.operationId)
  expect(repris.lireSuivi()).toBeNull()
  expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  expect(JSON.parse(b.serveur.contenuDe('corpus.crp')!).locuteurs.b).toBeUndefined()
  expect(JSON.parse(b.serveur.contenuDe('entretiens/C.json')!).participations[0].locuteurRef).toBe('a')
})

test('réponse de libération perdue : le résultat reconnu reste acquis sans répéter sa publication', async () => {
  const b = banc(); let perdu = false, liberationPerdue = false
  b.intercepter(async (r) => {
    if (!perdu && r.method === 'PUT' && b.cible(r, 'A')) { perdu = true; await b.serveur.fetch(r.clone()); throw new Error('Réponse perdue') }
    if (!liberationPerdue && perdu && r.method === 'DELETE' && new URL(r.url).pathname.endsWith('/verrous/corpus.lock.json')) {
      liberationPerdue = true; await b.serveur.fetch(r.clone()); throw new Error('Libération inconnue')
    }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const id = b.journal().operationId
  await expect(b.recreer().reconcilier(id)).rejects.toThrow('Libération inconnue')
  expect(b.journal().envoi).toBeUndefined(); expect(b.journal().verrouCorpus).toBeDefined()
  await b.recreer().reprendre(id)
  expect(b.puts().filter((r) => b.cible(r, 'A'))).toHaveLength(1)
  expect(b.service.lireSuivi()).toBeNull()
})

test('une protection remplacée ne peut être reprise, forcée ni supprimée pour reconnaître un envoi', async () => {
  const b = banc(); let perte = true
  b.intercepter(async (r) => {
    if (perte && r.method === 'PUT' && b.cible(r, 'A')) { perte = false; await b.serveur.fetch(r.clone()); throw new Error('Réponse perdue') }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const j = b.journal(), autre = JSON.stringify({ userId: 'max', machineId: 'autre-poste', sessionId: 'autre-generation', acquiredAt: '', refreshedAt: '', ttl: 300 })
  b.serveur.poser('verrous/corpus.lock.json', autre)
  const avant = b.puts().length, suppressions = b.requetes.filter((r) => r.method === 'DELETE').length
  await expect(b.recreer().reconcilier(j.operationId)).rejects.toThrow('protection de cette correction a changé')
  expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(autre)
  expect(b.puts()).toHaveLength(avant); expect(b.requetes.filter((r) => r.method === 'DELETE')).toHaveLength(suppressions)
})

test('ancien suivi sans preuve conservée : la vérification protège les définitions sans répéter l’envoi', async () => {
  const b = banc()
  b.intercepter(async (r) => r.method === 'PUT' && b.cible(r, 'A') ? Promise.reject(new Error('Réponse inconnue')) : undefined)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const j = b.journal(), preuve = j.verrouCorpus
  await b.client.supprimer('verrous/corpus.lock.json', preuve.etag)
  delete j.verrouCorpus; writeFileSync(join(b.dir, '.corrections-locuteurs-webdav.json'), JSON.stringify(j))
  b.intercepter(async () => undefined)
  await b.recreer().reconcilier(j.operationId)
  expect(b.journal().envoi).toBeUndefined()
  expect(b.journal().verrouCorpus).toBeUndefined()
  expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  expect(b.service.lireSuivi()?.etat).toBe('a-reprendre')
})

test('une édition extérieure après un progrès confirmé suspend la reprise sans l’écraser', async () => {
  const b = banc()
  b.intercepter(async (r) => r.method === 'PUT' && b.cible(r, 'B') ? new Response('conflit', { status: 412 }) : undefined)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow()
  const operation = b.service.lireSuivi()!.operationId, nouveau = structuredClone(b.fixture.entretiens[1].data)
  nouveau.notes![0].corps = 'Modification d’un collègue'; b.serveur.poser('entretiens/B.json', JSON.stringify(nouveau))
  b.intercepter(async () => undefined)
  const avant = b.puts().length
  await expect(b.recreer().reprendre(operation)).rejects.toThrow('a changé')
  expect(b.puts()).toHaveLength(avant)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/B.json')!).notes[0].corps).toBe('Modification d’un collègue')
})

test('arrêt explicite d’un lot connu : aucun PUT de plus, aucun retour des étapes déjà confirmées', async () => {
  const b = banc()
  b.intercepter(async (r) => r.method === 'PUT' && b.cible(r, 'B') ? new Response('refus', { status: 412 }) : undefined)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow()
  const suivi = b.service.lireSuivi()!, avant = b.puts().length
  await b.recreer().arreter(suivi.operationId)
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

test.each([false, true])('neutralisation natif=%s : réponse perdue, redémarrage puis reprise sans doublon', async (natif) => {
  const b = banc(natif); let phase = 0
  b.intercepter(async (r) => {
    if (r.method !== 'PUT' || !b.cible(r, 'A')) return undefined
    if (phase++ === 0) throw new Error('Envoi non accepté')
    await b.serveur.fetch(r.clone()); throw new Error('Réponse de neutralisation perdue')
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const id = b.journal().operationId
  await expect(b.recreer().reconcilier(id)).rejects.toThrow('neutralisation perdue')
  expect(b.journal().neutralisation).toBeDefined()
  b.intercepter(async () => undefined)
  const avant = b.puts().length
  await b.recreer().reconcilier(id)
  expect(b.puts()).toHaveLength(avant)
  await b.recreer().reprendre(id)
  expect(b.service.lireSuivi()).toBeNull()
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).participations[0].nom).toBe('Alice publiée')
})

test.each([0, -1, 1.5, 128 * 1024 * 1024 + 1, 'contenu remplacé'])('une neutralisation invalide %s est refusée avant tout nouvel envoi', async (valeur) => {
  const b = banc()
  b.intercepter(async (r) => { if (r.method === 'PUT' && b.cible(r, 'A')) throw new Error('Coupure'); return undefined })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const j = b.journal(), avant = b.puts().length
  j.neutralisation = valeur
  writeFileSync(join(b.dir, '.corrections-locuteurs-webdav.json'), JSON.stringify(j))
  await expect(b.recreer().reconcilier(j.operationId)).rejects.toThrow('suivi')
  expect(b.puts()).toHaveLength(avant)
})

test('l’envoi initial peut gagner la course avec sa neutralisation, sans être répété', async () => {
  const b = banc(); let retard: Request | undefined, phase = 0
  b.intercepter(async (r) => {
    if (r.method !== 'PUT' || !b.cible(r, 'A')) return undefined
    if (phase++ === 0) { retard = r.clone(); throw new Error('Envoi retardé') }
    expect((await b.serveur.fetch(retard!)).ok).toBe(true)
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const id = b.journal().operationId
  await b.recreer().reconcilier(id)
  expect(b.service.lireSuivi()).toMatchObject({ etat: 'a-reprendre', termines: 1 })
  b.intercepter(async () => undefined)
  await b.recreer().reprendre(id)
  expect(b.service.lireSuivi()).toBeNull()
  const corps = await Promise.all(b.puts().filter((r) => b.cible(r, 'A')).map((r) => r.clone().json()))
  expect(corps.filter((c) => c.participations[0].nom === 'Alice publiée')).toHaveLength(1)
})

test('des interruptions successives produisent des versions distinctes avant un arrêt', async () => {
  const b = banc(); const retards: Request[] = []
  const couper = async (r: Request) => {
    if (r.method === 'PUT' && b.cible(r, 'A')) { retards.push(r.clone()); throw new Error('Coupure') }
    return undefined
  }
  b.intercepter(couper)
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('vérifié')
  const id = b.journal().operationId
  let longueur = b.serveur.contenuDe('entretiens/A.json')!.length
  for (let i = 0; i < 3; i++) {
    b.intercepter(async () => undefined)
    await b.recreer().reconcilier(id)
    const nouvelleLongueur = b.serveur.contenuDe('entretiens/A.json')!.length
    expect(nouvelleLongueur).toBeGreaterThan(longueur)
    longueur = nouvelleLongueur
    if (i < 2) {
      b.intercepter(couper)
      await expect(b.recreer().reprendre(id)).rejects.toThrow('vérifié')
    }
  }
  await b.recreer().arreter(id)
  for (const r of retards) expect((await b.serveur.fetch(r)).status).toBe(412)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!)).toEqual(b.fixture.entretiens[0].data)
})

test.each([false, true])('un entretien sans rapport natif=%s reste réservé par un autre poste et n’est jamais remplacé dans le miroir', async (natif) => {
  const b = banc(natif), identite = () => ({ userId: 'max', machineId: 'autre-poste', sessionId: 'autre' })
  const autre = natif ? new ProviderFilesLock(b.client, identite) : new ProviderPutConditionnel(b.client, identite)
  const chemin = natif ? 'entretiens/C.json' : 'verrous/C.lock.json'
  expect((await autre.acquerir(chemin)).ok).toBe(true)
  b.sessions.push('C')
  b.miroir.set('entretiens/C.json', 'Saisie locale non publiée')
  const data = structuredClone(b.fixture.entretiens[2].data); data.notes![0].corps = 'Modification d’un collègue'
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && b.cible(r, 'A')) b.serveur.poser('entretiens/C.json', JSON.stringify(data))
    return undefined
  })
  await b.service.appliquer(b.commande())
  expect(JSON.parse(b.serveur.contenuDe('entretiens/C.json')!)).toEqual(data)
  expect(b.miroir.get('entretiens/C.json')).toBe('Saisie locale non publiée')
  expect(natif ? b.serveur.verrouNatifDe(chemin) : b.serveur.contenuDe(chemin)).toBeDefined()
  await autre.liberer(chemin)
})

test('un verrou natif qui change l’ETag ne provoque qu’une relecture ciblée après acquisition', async () => {
  const b = banc(true), acquis = new Set<string>()
  b.intercepter(async (r) => {
    const chemin = new URL(r.url).pathname
    if (r.method === 'LOCK' && !acquis.has(chemin)) {
      acquis.add(chemin)
      const reponse = await b.serveur.fetch(r.clone()), relatif = chemin.slice(b.serveur.racineDav.length + 1)
      b.serveur.poser(relatif, b.serveur.contenuDe(relatif)!)
      return reponse
    }
    return undefined
  })
  await b.service.appliquer(b.commande())
  expect(b.service.lireSuivi()).toBeNull()
  const lectures = b.requetes.filter((r) => r.method === 'GET' && /\/entretiens\//.test(new URL(r.url).pathname))
  expect(lectures).toHaveLength(7)
})

test('les téléchargements restent linéaires : une lecture initiale puis une vérification finale des fichiers modifiés', async () => {
  const b = banc(false, 20)
  await b.service.appliquer(b.commande())
  const lectures = b.requetes.filter((r) => r.method === 'GET' && /\/entretiens\//.test(new URL(r.url).pathname))
  expect(lectures).toHaveLength(40)
  expect(b.requetes.filter((r) => r.method === 'PUT' && /\/(corpus\.crp|entretiens\/[^/]+\.json)$/.test(new URL(r.url).pathname))).toHaveLength(21)
})

test('la vérification finale détecte une modification extérieure et ne l’installe pas comme notre succès', async () => {
  const b = banc()
  b.intercepter(async (r) => {
    if (r.method === 'PUT' && new URL(r.url).pathname.endsWith('/corpus.crp')) {
      const reponse = await b.serveur.fetch(r.clone()), data = structuredClone(b.fixture.entretiens[0].data)
      data.notes![0].corps = 'Modification extérieure'
      b.serveur.poser('entretiens/A.json', JSON.stringify(data))
      return reponse
    }
    return undefined
  })
  await expect(b.service.appliquer(b.commande())).rejects.toThrow('a changé')
  expect(b.service.lireSuivi()?.etat).toBe('a-reprendre')
  expect(b.miroir.size).toBe(0)
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).notes[0].corps).toBe('Modification extérieure')
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
