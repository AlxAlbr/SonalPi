import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { RetraitsVarianteAnonWebDAV } from '../../src/main/distant/retraitsVarianteAnonWebDAV'
import { JournalRetraitVarianteAnonWebDAV } from '../../src/main/distant/journalRetraitVarianteAnonWebDAV'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { empreinteCorrespondance } from '../../src/main/tablesCorrespondance'
import { preparerContexteNextcloud } from '../../src/main/distant/contexte'
import { fixtureRetraitVarianteAnon } from '../fixtures/retraitVarianteAnon'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'

const dirs: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc(natif: boolean, maintenant = Date.now) {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' }), f = fixtureRetraitVarianteAnon()
  serveur.creerDossierRelatif('verrous'); serveur.poser('corpus.crp', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-retrait-webdav-')); dirs.push(dir)
  const sessions: string[] = [], miroirs = new Map<string, string>(), puts: string[] = [], tentatives: string[] = [], acquisitions: string[] = []
  const panne = { miroir: false }, pieges = { avant: async (_p: string, _i: RequestInit) => {}, apres: async (_p: string, _i: RequestInit) => {} }
  let politique = true
  const fetch: ImplementationFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const chemin = decodeURIComponent(new URL(url).pathname).replace(`${serveur.racineDav}/`, '').replace(/\/$/, '')
    await pieges.avant(chemin, init)
    if (init.method === 'PUT' && (chemin === 'corpus.crp' || chemin.startsWith('entretiens/'))) tentatives.push(chemin)
    const reponse = await serveur.fetch(input, init)
    if (init.method === 'PUT' && reponse.ok && (chemin === 'corpus.crp' || chemin.startsWith('entretiens/'))) puts.push(chemin)
    if ((init.method === 'LOCK' || init.method === 'PUT' && chemin.startsWith('verrous/')) && reponse.ok) acquisitions.push(chemin)
    await pieges.apres(chemin, init); return reponse
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, fetch)
  const creer = () => new RetraitsVarianteAnonWebDAV({ client, dirLocal: dir, utilisateur: () => serveur.identifiants.utilisateur, sessionsLocales: () => sessions, maintenant,
    verifierContexte: (etape) => { if (!politique && etape !== 'suivi') throw new Error('Politique fermée') },
    miroir: (p, c) => { if (panne.miroir) throw new Error('miroir'); miroirs.set(p, c) },
    verrouCorpus: () => { const identite = { userId: serveur.identifiants.utilisateur, machineId: 'fixture', sessionId: crypto.randomUUID() }; return { provider: new ProviderPutConditionnel(client, () => identite), chemin: 'verrous/corpus.lock.json' } },
    verrouEntretien: (id) => { const identite = { userId: serveur.identifiants.utilisateur, machineId: 'fixture', sessionId: crypto.randomUUID() }; return { provider: natif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite), chemin: natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json` } },
  })
  const tenir = async (id: string) => {
    const identite = { userId: 'olivier', machineId: 'tiers', sessionId: crypto.randomUUID() }
    const clientTiers = new ClientWebDAV({ ...client.config, identifiants: { utilisateur: 'olivier', motDePasse: 'pass-oli' } }, fetch)
    const tiers = natif ? new ProviderFilesLock(clientTiers, () => identite) : new ProviderPutConditionnel(clientTiers, () => identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await tiers.acquerir(chemin)).ok).toBe(true); return () => tiers.liberer(chemin)
  }
  const corpus = () => JSON.parse(serveur.contenuDe('corpus.crp')!) as CorpusFichier
  const entretien = (id: string) => JSON.parse(serveur.contenuDe(`entretiens/${id}.json`)!) as EntretienFichier
  return { f, dir, serveur, client, sessions, miroirs, puts, tentatives, acquisitions, panne, pieges, creer, service: creer(), tenir, corpus, entretien, fermerPolitique: () => { politique = false } }
}
for (const natif of [false, true]) describe(`retrait WebDAV : ${natif ? 'natif' : 'conditionnel'}`, () => {
  it('remplace exactement six choix dont trois exceptions et deux masqués ; aucun verrou ni installation non ciblés', async () => {
    const b = banc(natif), avant = b.serveur.contenuDe('entretiens/e3.json'); b.sessions.push('e3')
    const p = await b.service.preparer(b.f.demande)
    expect(p.lecture).toBe('webdav'); expect(b.acquisitions).toEqual([])
    p.demande.pseudoConserve = 'Sans autorité'
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', annotations: 6, exceptions: 3, incluses: 2, varianteRetiree: true })
    expect(b.puts).toEqual(['corpus.crp', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.crp'])
    expect(b.acquisitions.filter((p) => p === 'verrous/corpus.lock.json')).toHaveLength(4)
    expect(b.acquisitions.filter((p) => p.includes('e1'))).toHaveLength(1)
    expect(b.acquisitions.filter((p) => p.includes('e2'))).toHaveLength(1)
    expect(b.acquisitions.some((p) => p.includes('e3'))).toBe(false); expect(b.miroirs.has('entretiens/e3.json')).toBe(false)
    expect(b.serveur.contenuDe('entretiens/e3.json')).toBe(avant)
    for (const s of b.f.sources.slice(0, 2)) {
      const attendu = JSON.parse(JSON.stringify(s.data)) as EntretienFichier, actuel = b.entretien(s.id)
      for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo?.trim().toLowerCase() === 'claire') a.pseudo = 'Rebecca'
      attendu.lastModified = actuel.lastModified; expect(actuel).toEqual(attendu)
    }
    expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Rebecca']); expect(b.corpus().retraitVarianteAnon).toBeUndefined()
    expect(statSync(join(b.dir, '.retrait-variante-anon-webdav.json')).mode & 0o777).toBe(0o600)
    expect(b.service.lireSuivi()).toBeNull()
  })
  it('inventaire long : renouvellement à l’approche de l’échéance, pas à chaque membre', async () => {
    let temps = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => temps)
    const b = banc(natif, () => temps), p = await b.service.preparer(b.f.demande)
    let ralenti = false
    b.pieges.apres = async (chemin, i) => {
      if (!ralenti && b.puts.length === 3 && chemin === 'entretiens/e3.json' && i.method === 'GET') {
        ralenti = true; temps += 300_000
      }
    }
    expect((await b.service.appliquer(p.token, true)).statut).toBe('termine')
    expect(ralenti).toBe(true)
    expect(b.acquisitions.filter((p) => p === 'verrous/corpus.lock.json')).toHaveLength(5)
  })
  it('propriétaire changé après acquisition : aucun PUT de cible malgré une échéance encore valide', async () => {
    const b = banc(natif)
    let change = false
    b.pieges.apres = async (p, i) => {
      if (p === 'entretiens/e1.json' && i.method === 'GET' && b.puts.length === 1) {
        if (natif) b.serveur.poserVerrouDirect('entretiens/e1.json', 'olivier')
        else {
          const chemin = 'verrous/e1.lock.json', v = JSON.parse(b.serveur.contenuDe(chemin)!)
          v.sessionId = 'autre-session'; b.serveur.poser(chemin, JSON.stringify(v))
        }
        change = true
      }
    }
    const p = await b.service.preparer(b.f.demande)
    expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'partiel', annotations: 3 })
    expect(change).toBe(true)
    expect(b.tentatives).not.toContain('entretiens/e1.json')
  })
  it('variante inutilisée : corpus seul, aucune date ni aucun entretien modifiés', async () => {
    const b = banc(natif)
    for (const id of ['e1', 'e2']) b.serveur.poser(`entretiens/${id}.json`, JSON.stringify(b.f.sources[2].data))
    const p = await b.service.preparer(b.f.demande); expect(p.bilan.annotations).toBe(0)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('termine')
    expect(b.puts).toEqual(['corpus.crp', 'corpus.crp']); expect(b.acquisitions.every((p) => p === 'verrous/corpus.lock.json')).toBe(true)
  })
  it('accord absent consommé, expiration après lecture lente et définition périmée refusés', async () => {
    let temps = Date.now(); const b = banc(natif, () => temps), a = await b.service.preparer(b.f.demande)
    await expect(b.service.appliquer(a.token, false)).rejects.toThrow('Confirmez')
    await expect(b.service.appliquer(a.token, true)).rejects.toThrow('expiré')
    const p = await b.service.preparer(b.f.demande)
    b.pieges.avant = async (p, i) => { if (p === 'corpus.crp' && i.method === 'GET') temps += 300_001 }
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré')
    expect(b.puts).toEqual([])
    b.pieges.avant = async () => {}; const frais = await b.service.preparer(b.f.demande), corpus = b.corpus()
    corpus.reglesAnon.personne.categorie = 'Autre'; b.serveur.poser('corpus.crp', JSON.stringify(corpus))
    await expect(b.service.appliquer(frais.token, true)).rejects.toThrow('corpus a changé')
  })
  it('sessions locales et cible tenue différées ; déclaration conservée jusqu’au nouveau bilan et nouvel accord', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'); b.sessions.push('e1')
    const p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 0 }); expect(b.corpus().reglesAnon.personne.pseudos).toHaveLength(2)
    b.sessions.length = 0; await rendre()
    const reprise = await b.service.preparerReprise(r.operationId)
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
  })
  it('source changée différée, nouveau choix dans une non-cible seulement après accord neuf', async () => {
    const b = banc(natif), p = await b.service.preparer(b.f.demande), e = b.entretien('e2')
    e.meta.valeursGen = {}; e.lastModified = new Date(Date.now() + 1_000).toISOString(); b.serveur.poser('entretiens/e2.json', JSON.stringify(e))
    const r = await b.service.appliquer(p.token, true); expect(r.annotations).toBe(3)
    const nouveau = b.entretien('e3'); nouveau.annotations[0].pseudo = 'Claire'; b.serveur.poser('entretiens/e3.json', JSON.stringify(nouveau))
    const reprise = await b.service.preparerReprise(r.operationId); expect(reprise.bilan.annotations).toBe(4)
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it('ancien choix réapparu dans un acquis bloque sans second remplacement ni restauration', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'), p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    const e = b.entretien('e1'); e.annotations.find((a) => a.regle === 'personne')!.pseudo = 'Claire'; b.serveur.poser('entretiens/e1.json', JSON.stringify(e))
    await rendre(); await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('déjà traité')
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it.each(['corpus.crp', 'entretiens/e1.json', 'final'])('réponse perdue %s : preuve exacte sans rejeu ni droits hérités', async (phase) => {
    const b = banc(natif); let inconnu = false
    b.pieges.apres = async (p, i) => {
      if (!inconnu && i.method === 'PUT' && (phase === 'final' ? p === 'corpus.crp' && !JSON.parse(String(i.body)).retraitVarianteAnon : p === phase)) { inconnu = true; throw new Error('Réponse perdue') }
    }
    b.pieges.avant = async (p, i) => { if (inconnu && i.method === 'GET' && !p.startsWith('verrous/')) throw new Error('Lecture indisponible') }
    const p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    expect(r.statut).toBe('indetermine'); const publications = [...b.puts], bail = b.serveur.contenuDe('verrous/corpus.lock.json')
    b.pieges.avant = async () => {}; b.pieges.apres = async () => {}
    const neuf = b.creer(), reconnu = await neuf.relireSuivi(r.operationId)
    expect(reconnu.statut).toBe(phase === 'final' ? 'termine' : 'partiel'); expect(b.puts).toEqual(publications)
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(bail)
    if (phase !== 'final') {
      const a = await neuf.preparerReprise(r.operationId), refus = await neuf.appliquer(a.token, true)
      expect(refus.statut).toBe('partiel'); expect(b.puts).toEqual(publications)
    }
    await b.service.relireSuivi(r.operationId)
  })
  it('après réponse acceptée, panne de GET ou miroir conserve la confirmation et installe ensuite la source actuelle', async () => {
    const b = banc(natif); let lu = false
    b.pieges.avant = async (p, i) => { if (!lu && b.puts.includes('entretiens/e1.json') && p === 'entretiens/e1.json' && i.method === 'GET') { lu = true; throw new Error('GET après acceptation') } }
    const p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 3, miroirIncomplet: true })
    const courant = b.entretien('e1'); courant.lastModified = new Date(Date.now() + 2_000).toISOString(); b.serveur.poser('entretiens/e1.json', JSON.stringify(courant))
    await b.service.relireSuivi(r.operationId); expect(b.miroirs.get('entretiens/e1.json')).toBe(JSON.stringify(courant))
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it('politique fermée après premier acquis : aucun prochain envoi, suivi toujours lisible', async () => {
    const b = banc(natif)
    b.pieges.apres = async (p, i) => { if (p === 'entretiens/e1.json' && i.method === 'PUT') b.fermerPolitique() }
    const p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    expect(r.annotations).toBe(3); expect(b.puts).toEqual(['corpus.crp', 'entretiens/e1.json'])
    expect((await b.service.relireSuivi(r.operationId)).annotations).toBe(3)
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('Politique fermée')
  })
  if (natif) it.each(['proprietaire', 'autre-compte', 'echeance'])('droit natif sans preuve %s : aucun PUT de la cible', async (cas) => {
    const b = banc(true), original = b.client.etatVerrouNatif.bind(b.client)
    vi.spyOn(b.client, 'etatVerrouNatif').mockImplementation(async (p) => {
      const preuve = await original(p)
      if (p !== 'entretiens/e1.json' || !preuve) return preuve
      return cas === 'echeance' ? { ...preuve, timeout: 30 } : { ...preuve, owner: cas === 'proprietaire' ? '' : 'autre-compte' }
    })
    const p = await b.service.preparer(b.f.demande), r = await b.service.appliquer(p.token, true)
    expect(r.statut).toBe('partiel'); expect(b.puts).not.toContain('entretiens/e1.json')
    expect(b.entretien('e1')).toEqual(b.f.sources[0].data)
  })
  if (natif) it('échéance native raccourcie après intention : contrôle frais avant PUT', async () => {
    const b = banc(true), original = b.client.etatVerrouNatif.bind(b.client)
    let raccourcie = false
    vi.spyOn(b.client, 'etatVerrouNatif').mockImplementation(async (chemin) => {
      const preuve = await original(chemin)
      if (chemin !== 'entretiens/e1.json' || !preuve) return preuve
      const j = JSON.parse(readFileSync(join(b.dir, '.retrait-variante-anon-webdav.json'), 'utf8'))
      if (j.envoi?.phase === 'entretien') raccourcie = true
      return raccourcie ? { ...preuve, timeout: 30 } : preuve
    })
    const p = await b.service.preparer(b.f.demande)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('partiel')
    expect(raccourcie).toBe(true)
    expect(b.tentatives).not.toContain('entretiens/e1.json')
    expect(b.entretien('e1')).toEqual(b.f.sources[0].data)
  })
  if (natif) it('preuve revenue après expiration : ni renouvellement, ni PUT, ni libération forcée', async () => {
    let temps = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => temps)
    const b = banc(true, () => temps), original = b.client.etatVerrouNatif.bind(b.client)
    let expire = false
    vi.spyOn(b.client, 'etatVerrouNatif').mockImplementation(async (chemin) => {
      const preuve = await original(chemin)
      if (chemin === 'entretiens/e1.json' && preuve && !expire) {
        const j = JSON.parse(readFileSync(join(b.dir, '.retrait-variante-anon-webdav.json'), 'utf8'))
        if (j.envoi?.phase === 'entretien') { expire = true; temps += 400_000 }
      }
      return preuve
    })
    const p = await b.service.preparer(b.f.demande)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('partiel')
    expect(expire).toBe(true)
    expect(b.tentatives).not.toContain('entretiens/e1.json')
    expect(b.acquisitions.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
    expect(b.serveur.verrouNatifDe('entretiens/e1.json')).toEqual({ utilisateur: 'max' })
  })
  it('journal altéré ou redérivation d’un état différent refusés avant tout réseau', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'), p = await b.service.preparer(b.f.demande)
    await b.service.appliquer(p.token, true); await rendre()
    const fichier = join(b.dir, '.retrait-variante-anon-webdav.json'), j = JSON.parse(readFileSync(fichier, 'utf8'))
    const e = JSON.parse(j.cibles[0].apres); e.annotations[0].etat = 'exception'; j.cibles[0].apres = JSON.stringify(e)
    writeFileSync(fichier, JSON.stringify(j)); expect(() => b.creer()).toThrow('invalide')
  })
  it('ouverture protégée sans réseau ni tirage et journal malformé refusé avant ouverture', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'), p = await b.service.preparer(b.f.demande)
    await b.service.appliquer(p.token, true); await rendre()
    writeFileSync(join(b.dir, 'corpus.crp'), b.serveur.contenuDe('corpus.crp')!)
    for (const s of b.f.sources) writeFileSync(join(b.dir, `${s.id}.json`), JSON.stringify(s.data))
    const demandes: string[] = []; b.pieges.avant = async (p) => { demandes.push(p); throw new Error('Réseau interdit à ouverture') }
    const ouvert = await preparerContexteNextcloud({ id: 'synthetique', dirLocal: b.dir, client: b.client, verrouNatif: natif, identite: () => ({ userId: 'olivier', machineId: 'neuf', sessionId: 'neuf' }) })
    expect(demandes).toEqual([]); expect(ouvert.verrousIndisponibles).toBe(true); expect(ouvert.contexte.lireSuiviRetraitVarianteAnon()?.annotations).toBe(3)
    ouvert.contexte.arreterPresence(); ouvert.contexte.sessions.dispose()
    writeFileSync(join(b.dir, '.retrait-variante-anon-webdav.json'), '{}')
    await expect(preparerContexteNextcloud({ id: 'synthetique', dirLocal: b.dir, client: b.client, verrouNatif: natif, identite: () => ({ userId: 'olivier', machineId: 'neuf', sessionId: 'neuf' }) })).rejects.toThrow('invalide')
    expect(demandes).toEqual([])
  })
  it('garde d’écriture : ancien choix lié refusé même dans une exception, indépendant et restant conservés', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'), p = await b.service.preparer(b.f.demande)
    await b.service.appliquer(p.token, true); await rendre()
    const garde = new GardePseudosWebDAV(b.client, () => ({ userId: 'olivier', machineId: 'fixture', sessionId: 'garde' }), b.dir), e = b.entretien('e2'), envoi = vi.fn(async () => 'ok')
    await expect(garde.publier(JSON.stringify(e), JSON.stringify(e), envoi, 'entretiens/e2.json')).rejects.toThrow('en cours de retrait')
    const restant = b.entretien('e3')
    await expect(garde.publier(JSON.stringify(restant), JSON.stringify(restant), envoi, 'entretiens/e3.json')).resolves.toBe('ok')
    expect(envoi).toHaveBeenCalledTimes(1)
    const destination = empreinteCorrespondance(b.client.config.baseUrl.replace(/\/+$/, ''))
    expect(new JournalRetraitVarianteAnonWebDAV(b.dir, destination).lire()?.barriereConfirmee).toBe(true)
  })
})
