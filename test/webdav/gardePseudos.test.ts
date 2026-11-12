import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { SessionsDEntretien } from '../../src/main/distant/sessions'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'

const dossiers: string[] = []; const nettoyeurs: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const nettoyer of nettoyeurs.splice(0)) await nettoyer()
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
for (const natif of [false, true]) describe(`garde des nouveaux choix WebDAV — ${natif ? 'natif' : 'conditionnel'}`, () => {
  async function banc(maintenant?: () => number) {
    const f = fixtureRenommageAnon(['e1'])
    const serveur = new ServeurWebDAVMemoire(); serveur.creerDossierRelatif('verrous')
    serveur.poser('corpus.crp', JSON.stringify(f.corpus)); serveur.poser('entretiens/e1.json', JSON.stringify(f.sources[0].data))
    const pieges = { corpus: () => {} }
    const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (url, init) => {
      const r = await serveur.fetch(url, init)
      if (String(url).endsWith('/corpus.crp') && init?.method === 'GET') pieges.corpus()
      return r
    })
    const dir = mkdtempSync(join(tmpdir(), 'sonal-garde-pseudo-')); dossiers.push(dir)
    const identite = () => ({ userId: 'max', machineId: 'garde', sessionId: 'session-test' })
    const garde = new GardePseudosWebDAV(client, identite, dir, (chemin, contenu, etag) => sessions.confirmerSource(chemin, contenu, etag))
    const sessions = new SessionsDEntretien(client, new MiroirWebDAV(client, dir), identite, undefined, undefined, { verrouNatif: natif, gardePseudos: garde, maintenant })
    await sessions.ouvrir('e1')
    const fichier = join(dir, 'entretiens/e1.json')
    nettoyeurs.push(async () => {
      if (sessions.etat('e1').etat === 'a-nous') {
        writeFileSync(fichier, serveur.contenuDe('entretiens/e1.json')!)
        sessions.noterSale('e1')
      }
      await sessions.fermer('e1')
      sessions.dispose()
    })
    f.corpus.reglesAnon.personne.pseudos = ['Nouvelle', 'Rebecca']
    serveur.poser('corpus.crp', JSON.stringify(f.corpus))
    const ecrire = (data = structuredClone(f.sources[0].data)) => { writeFileSync(fichier, JSON.stringify(data)); sessions.noterSale('e1'); return data }
    return { f, serveur, client, garde, sessions, ecrire, identite, dir, pieges }
  }
  test.each(['expire', 'marge'])('échéance entretien %s atteinte pendant la lecture des définitions : aucun PUT', async (cas) => {
    const depart = Date.now(); let horloge = depart
    const b = await banc(() => horloge)
    const limite = (b.sessions as unknown as { sessions: Map<string, { droitValideJusqua: number }> }).sessions.get('e1')!.droitValideJusqua
    const original = b.serveur.contenuDe('entretiens/e1.json')
    const data = b.ecrire(); data.meta.titre = 'Champ modifié'; b.ecrire(data)
    b.pieges.corpus = () => { horloge = limite + (cas === 'expire' ? 1 : -1_000) }
    try {
      expect(await b.sessions.publier('e1')).toMatchObject({ ok: false })
      expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(original)
      expect(b.garde.lireEnvoi()).toBeNull()
      expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeFalsy()
    } finally { horloge = depart; b.pieges.corpus = () => {} }
  })
  test('expiration corpus après journal mais avant transport : intention effacée, pas de faux PUT indéterminé', async () => {
    const b = await banc(); const depart = Date.now(); let transports = 0
    const horloge = vi.spyOn(Date, 'now').mockReturnValue(depart)
    try {
      await expect(b.garde.publier(JSON.stringify(b.f.sources[0].data), JSON.stringify(b.f.sources[0].data), async (garantir) => {
        horloge.mockReturnValue(depart + 400_000); garantir(); transports++
      }, 'entretiens/e1.json')).rejects.toThrow('va expirer')
      expect(transports).toBe(0)
      expect(b.garde.lireEnvoi()).toBeNull()
      expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeFalsy()
    } finally { horloge.mockRestore() }
  })
  test('choix anciens inchangés, indépendants et exception restent publiables', async () => {
    const b = await banc(); const d = b.ecrire(); d.meta.titre = 'Autre champ'; b.ecrire(d)
    expect(await b.sessions.publier('e1')).toEqual({ ok: true })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!).annotations).toEqual(b.f.sources[0].data.annotations)
    await b.sessions.fermer('e1')
  })
  test.each(['nouvelle', 'reactivee', 'rattachee', 'modifiee'])('ancienne variante %s refusée ; correction reste possible dans la même session', async (cas) => {
    const b = await banc(); const d = structuredClone(b.f.sources[0].data)
    let a = d.annotations[0]
    if (cas === 'nouvelle') { a = { ...a, id: 'nouvelle' }; d.annotations.push(a) }
    if (cas === 'reactivee') { a = d.annotations.find((a) => a.id === 'a2')!; a.etat = 'anonymise' }
    if (cas === 'rattachee') { a = d.annotations.find((a) => a.id === 'a3')!; a.regle = 'personne' }
    if (cas === 'modifiee') { a = d.annotations.find((a) => a.id === 'a1')!; a.pseudo = 'Claire' }
    b.ecrire(d)
    await expect(b.sessions.publier('e1')).rejects.toThrow('variante choisie n’est plus déclarée')
    expect(b.sessions.etat('e1')).toMatchObject({ etat: 'a-nous', sale: true })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!).annotations).toEqual(b.f.sources[0].data.annotations)
    a.pseudo = 'Nouvelle'; b.ecrire(d)
    expect(await b.sessions.publier('e1')).toEqual({ ok: true })
    await b.sessions.fermer('e1')
  })
  test('la base avance après publication ; réintroduire l’ancien choix n’est pas un choix conservé', async () => {
    const b = await banc(); const d = b.ecrire(); d.annotations[0].pseudo = 'Nouvelle'; b.ecrire(d)
    expect(await b.sessions.publier('e1')).toEqual({ ok: true })
    d.annotations[0].pseudo = 'Claire'; b.ecrire(d)
    await expect(b.sessions.publier('e1')).rejects.toThrow('variante choisie')
  })
  test('verrou corpus tenu pendant l’envoi : aucune modification concurrente des règles', async () => {
    const b = await banc()
    const provider = new ProviderPutConditionnel(b.client, () => ({ ...b.identite(), sessionId: 'concurrente' }))
    let acquisitions = 0
    await b.garde.publier(JSON.stringify(b.f.sources[0].data), JSON.stringify(b.f.sources[0].data), async () => {
      expect((await provider.acquerir('verrous/corpus.lock.json')).ok).toBe(false); acquisitions++
    }, 'entretiens/e1.json')
    expect(acquisitions).toBe(1)
    expect((await provider.acquerir('verrous/corpus.lock.json')).ok).toBe(true)
    await provider.liberer('verrous/corpus.lock.json')
  })
  test('contournement direct : changement de définition entre validation et garde finale refuse', async () => {
    const b = await banc(); let lectures = 0; let envois = 0
    const client = new ClientWebDAV(b.client.config, async (url, init) => {
      if (init?.method === 'GET' && String(url).endsWith('corpus.crp') && ++lectures === 2) {
        const corpus = structuredClone(b.f.corpus); corpus.reglesAnon.personne.pseudos = ['Autre']
        b.serveur.poser('corpus.crp', JSON.stringify(corpus))
      }
      return b.serveur.fetch(url, init)
    })
    await expect(new GardePseudosWebDAV(client, b.identite, b.dir).publier(JSON.stringify(b.f.sources[0].data), JSON.stringify(b.f.sources[0].data), async () => { envois++ }, 'entretiens/e1.json')).rejects.toThrow('définitions ont changé')
    expect(envois).toBe(0)
  })
})
