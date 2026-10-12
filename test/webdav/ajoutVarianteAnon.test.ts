import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AjoutsVarianteAnonWebDAV } from '../../src/main/distant/ajoutsVarianteAnonWebDAV'
import { JournalAjoutVarianteAnonWebDAV } from '../../src/main/distant/journalAjoutVarianteAnonWebDAV'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { empreinteCorrespondance } from '../../src/main/tablesCorrespondance'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'

const dossiers: string[] = []
afterEach(() => { for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
async function banc() {
  const f = fixtureRenommageAnon(); f.corpus.reglesAnon.personne.pseudos = ['Claire']
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' }); serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-ajout-variante-webdav-')); dossiers.push(dirLocal)
  const requetes: { chemin: string; methode: string; headers: Headers }[] = []
  const pieges = { avant: async (_p: string, _init?: RequestInit) => {}, apres: async (_p: string, _init: RequestInit | undefined, r: Response) => r }
  const transport: ImplementationFetch = async (url, init) => {
    const p = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    requetes.push({ chemin: p, methode: init?.method ?? 'GET', headers: new Headers(init?.headers) })
    await pieges.avant(p, init); const r = await serveur.fetch(url, init); return pieges.apres(p, init, r)
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  const miroir: string[] = [], maintenant = { valeur: Date.now() }, erreurs = { miroir: false }
  const service = () => new AjoutsVarianteAnonWebDAV({ client, dirLocal,
    identite: () => ({ userId: 'max', machineId: 'poste-fixture', sessionId: 'contexte-fixture' }), maintenant: () => maintenant.valeur,
    miroir: (contenu) => { if (erreurs.miroir) throw new Error('Miroir indisponible'); miroir.push(contenu) },
  })
  const moteur = service(), demande = { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudo: 'Rebecca' }
  const journal = new JournalAjoutVarianteAnonWebDAV(dirLocal, empreinteCorrespondance(client.config.baseUrl.replace(/\/+$/, '')))
  const lire = () => JSON.parse(serveur.contenuDe('corpus.json')!)
  const publies = () => requetes.filter((r) => r.chemin === 'corpus.json' && r.methode === 'PUT')
  const autre = new ProviderPutConditionnel(serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' }),
    () => ({ userId: 'olivier', machineId: 'autre-poste', sessionId: 'autre-session' }))
  return { f, serveur, client, dirLocal, requetes, pieges, miroir, maintenant, erreurs, moteur, demande, journal, lire, publies, autre, service }
}
describe('ajout de variante WebDAV : publication corpus uniquement', () => {
  test('seule la règle change, entretien tenu et sources inchangés ; aucun accès aux entretiens', async () => {
    const b = await banc(); expect((await b.autre.acquerir('verrous/e1.lock.json')).ok).toBe(true)
    const avant = b.f.sources.map((s) => b.serveur.contenuDe(`entretiens/${s.id}.json`)), verrou = b.serveur.contenuDe('verrous/e1.lock.json')
    expect(await b.moteur.appliquer(b.demande)).toMatchObject({ ajoute: true, regle: { pseudos: ['Claire', 'Rebecca'] } })
    const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
    expect(b.lire()).toEqual(attendu); expect(b.f.sources.map((s) => b.serveur.contenuDe(`entretiens/${s.id}.json`))).toEqual(avant)
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBe(verrou)
    expect(b.requetes.some((r) => r.chemin.startsWith('entretiens/'))).toBe(false)
    expect(b.publies()).toHaveLength(1); expect(b.publies()[0].headers.get('if-match')).toBeTruthy()
    expect(b.miroir.map((c) => JSON.parse(c))).toEqual([attendu]); expect(b.journal.lire()).toBeNull(); expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })
  test.each(['Claire', ' claire ', 'CLAIRE'])('doublon %s : aucune intention ni publication', async (pseudo) => {
    const b = await banc(); const avant = b.serveur.contenuDe('corpus.json')
    expect(await b.moteur.appliquer({ ...b.demande, pseudo })).toMatchObject({ ajoute: false })
    expect(b.serveur.contenuDe('corpus.json')).toBe(avant); expect(b.publies()).toHaveLength(0); expect(b.journal.lire()).toBeNull()
  })
  test.each(['categorie', 'entite', 'pseudos', 'absence'])('définition fraîche divergente : %s', async (champ) => {
    const b = await banc(), c = b.lire()
    if (champ === 'absence') delete c.reglesAnon.personne
    else c.reglesAnon.personne[champ] = champ === 'categorie' ? 'Autre' : champ === 'entite' ? ['Autre identité'] : ['Autre pseudo']
    b.serveur.poser('corpus.json', JSON.stringify(c))
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow(/changé|existe plus/)
    expect(b.lire()).toEqual(c); expect(b.publies()).toHaveLength(0); expect(b.journal.lire()).toBeNull()
  })
  test('corpus tenu et deux ajouts concurrents : aucun droit sur les entretiens', async () => {
    const b = await banc(); expect((await b.autre.acquerir('verrous/corpus.lock.json')).ok).toBe(true)
    const verrou = b.serveur.contenuDe('verrous/corpus.lock.json')
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('ailleurs')
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(verrou)
    await b.autre.liberer('verrous/corpus.lock.json')
    const issues = await Promise.allSettled([b.moteur.appliquer(b.demande), b.service().appliquer(b.demande)])
    expect(issues.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(b.publies()).toHaveLength(1)
  })
  test('modification après lecture, puis refus If-Match : aucun écrasement', async () => {
    const b = await banc(), concurrent = b.lire(); concurrent.nom = 'Modification extérieure'
    b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') b.serveur.poser(p, JSON.stringify(concurrent)) }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow()
    expect(b.lire()).toEqual(concurrent); expect(b.journal.lire()).toBeNull(); expect(b.miroir).toHaveLength(0)
  })
  test('modification avant le transport : pas de PUT', async () => {
    const b = await banc(); let lectures = 0
    b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && (init?.method ?? 'GET') === 'GET' && ++lectures === 2) { const c = b.lire(); c.nom = 'Concurrent'; b.serveur.poser(p, JSON.stringify(c)) } }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('changé avant')
    expect(b.publies()).toHaveLength(0); expect(b.journal.lire()).toBeNull()
  })
  test('sans ETag fort, refus avant publication', async () => {
    const b = await banc()
    b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && (init?.method ?? 'GET') === 'GET') { const headers = new Headers(r.headers); headers.set('etag', 'W/"faible"'); return new Response(await r.text(), { status: r.status, headers }) } return r }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('ETag fort'); expect(b.publies()).toHaveLength(0)
  })
  test.each(['ancien-format', 'membership', 'regles', 'suppression', 'dissociation'])('source incompatible : %s', async (cause) => {
    const b = await banc(), c = b.lire()
    if (cause === 'ancien-format') c.formatVersion--
    if (cause === 'membership') c.membership = []
    if (cause === 'regles') c.reglesAnon = []
    if (cause === 'suppression') c.suppressionAnon = { operationId: 'suppression-anon-fixture', regleId: 'personne' }
    if (cause === 'dissociation') c.dissociationAnon = { operationId: 'dissociation-fixture', regleId: 'personne' }
    b.serveur.poser('corpus.json', JSON.stringify(c))
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow(); expect(b.publies()).toHaveLength(0)
  })
  test('droit expirant après sauvegarde de l’intention : aucun PUT', async () => {
    const b = await banc()
    const ecrire = JournalAjoutVarianteAnonWebDAV.prototype.ecrire
    const spy = vi.spyOn(JournalAjoutVarianteAnonWebDAV.prototype, 'ecrire').mockImplementation(function (j) {
      ecrire.call(this, j); b.maintenant.valeur += 430_000
    })
    try { await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('expirer') } finally { spy.mockRestore() }
    expect(b.publies()).toHaveLength(0); expect(b.journal.lire()).toBeNull()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeTruthy()
  })
  test('marge épuisée par la dernière lecture : aucun PUT', async () => {
    const b = await banc(); let lectures = 0
    b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && (init?.method ?? 'GET') === 'GET' && ++lectures === 2) b.maintenant.valeur += 361_000; return r }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('expirer')
    expect(b.publies()).toHaveLength(0); expect(b.journal.lire()).toBeNull()
  })
  test('droit perdu entre intention et transport : aucun PUT', async () => {
    const b = await banc(); let lectures = 0
    b.pieges.apres = async (p, init, r) => {
      if (p === 'verrous/corpus.lock.json' && (init?.method ?? 'GET') === 'GET' && ++lectures === 1) b.serveur.poser(p, JSON.stringify({ userId: 'autre', machineId: 'autre', sessionId: 'autre', acquiredAt: new Date().toISOString(), refreshedAt: new Date().toISOString(), ttl: 300 }))
      return r
    }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('perdu'); expect(b.publies()).toHaveLength(0)
    expect(JSON.parse(b.serveur.contenuDe('verrous/corpus.lock.json')!).userId).toBe('autre')
  })
})
describe('ajout de variante WebDAV : issue durable sans répétition', () => {
  test('réponse perdue après acceptation : garder le droit, puis reconnaître sans second PUT', async () => {
    const b = await banc()
    b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) throw new Error('Réponse perdue'); return r }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('perdue')
    expect(b.journal.lire()?.etat).toBe('envoi'); expect(statSync(b.journal.chemin).mode & 0o777).toBe(0o600)
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeTruthy()
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('vérifier')
    await b.moteur.reconcilier(); expect(b.publies()).toHaveLength(1); expect(b.journal.lire()).toBeNull()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })
  test('original seul et autres changements : aucune preuve, aucun rejeu ni libération', async () => {
    const b = await banc()
    b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') throw new Error('Issue inconnue') }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('inconnue')
    const droit = b.serveur.contenuDe('verrous/corpus.lock.json')
    await expect(b.moteur.reconcilier()).rejects.toThrow('original')
    const nouveau = b.service(); await expect(nouveau.reconcilier()).rejects.toThrow('original')
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(droit); expect(b.publies()).toHaveLength(1)
  })
  test('nouvelle instance : preuve acceptée, aucun héritage ni DELETE du droit persistant', async () => {
    const b = await banc()
    b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) throw new Error('Réponse perdue'); return r }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('perdue')
    const droit = b.serveur.contenuDe('verrous/corpus.lock.json'), nouveau = b.service(); b.requetes.length = 0
    await nouveau.reconcilier(); expect(b.requetes.every((r) => r.methode === 'GET' && r.chemin === 'corpus.json')).toBe(true)
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(droit)
    const c = b.lire(); c.reglesAnon.autre = { id: 'autre', entite: ['Autre identité'], pseudos: ['Paul'] }; b.serveur.poser('corpus.json', JSON.stringify(c))
    await expect(nouveau.appliquer({ regleAvant: c.reglesAnon.autre, pseudo: 'Jacques' })).rejects.toThrow('ailleurs')
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(droit)
  })
  test('publication certaine, miroir défaillant : rouvrir installe la source courante, pas le candidat historique', async () => {
    const b = await banc(); b.erreurs.miroir = true
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('Miroir')
    expect(b.journal.lire()?.etat).toBe('confirme'); expect(b.publies()).toHaveLength(1)
    const courant = b.lire(); courant.nom = 'Édition ultérieure'; b.serveur.poser('corpus.json', JSON.stringify(courant))
    b.erreurs.miroir = false; await b.service().reconcilier()
    expect(JSON.parse(b.miroir[0])).toEqual(courant); expect(b.publies()).toHaveLength(1)
  })
  test('refus de lecture après PUT accepté : confirmation durable, copie à actualiser', async () => {
    const b = await banc(); let lectures = 0
    b.pieges.apres = async (p, init, r) => {
      if (p === 'corpus.json' && (init?.method ?? 'GET') === 'GET' && ++lectures === 3) { await r.body?.cancel(); return new Response('Refus', { status: 403 }) }
      return r
    }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow()
    expect(b.journal.lire()?.etat).toBe('confirme'); expect(b.publies()).toHaveLength(1)
    b.pieges.apres = async (_p, _init, r) => r
    await b.moteur.reconcilier(); expect(b.journal.lire()).toBeNull(); expect(b.publies()).toHaveLength(1)
  })
  test('erreur de sauvegarde après confirmation : preuve conservée et droit vivant rendu sans rejeu', async () => {
    const b = await banc(), ecrire = JournalAjoutVarianteAnonWebDAV.prototype.ecrire; let ecritures = 0
    const spy = vi.spyOn(JournalAjoutVarianteAnonWebDAV.prototype, 'ecrire').mockImplementation(function (j) {
      ecrire.call(this, j); if (++ecritures === 2) throw new Error('Confirmation sauvegardée, réponse locale perdue')
    })
    try { await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('locale perdue') } finally { spy.mockRestore() }
    expect(b.journal.lire()?.etat).toBe('confirme')
    await b.moteur.reconcilier(); expect(b.publies()).toHaveLength(1); expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })
  test('publication inconnue puis édition extérieure : aucun remplacement historique', async () => {
    const b = await banc()
    b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) throw new Error('Réponse perdue'); return r }
    await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('perdue')
    const courant = b.lire(); courant.nom = 'Édition extérieure'; b.serveur.poser('corpus.json', JSON.stringify(courant))
    await expect(b.moteur.reconcilier()).rejects.toThrow('indéterminé'); expect(b.miroir).toHaveLength(0); expect(b.lire()).toEqual(courant)
  })
  test.each(['destination', 'apres', 'etat', 'etagAvant', 'demande'])('journal altéré : %s', async (champ) => {
    const b = await banc(); b.erreurs.miroir = true; await expect(b.moteur.appliquer(b.demande)).rejects.toThrow()
    const j = JSON.parse(readFileSync(b.journal.chemin, 'utf8'))
    j[champ] = champ === 'demande' ? { ...j.demande, pseudo: 'Autre' } : champ === 'apres' ? JSON.stringify({ ...JSON.parse(j.apres), nom: 'Écrasement' }) : champ === 'etagAvant' ? 'W/faible' : 'invalide'
    writeFileSync(b.journal.chemin, JSON.stringify(j))
    await expect(b.service().reconcilier()).rejects.toThrow('journal'); expect(b.publies()).toHaveLength(1)
  })
})
