import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { JournalSuppressionAnonWebDAV } from '../../src/main/distant/journalSuppressionAnonWebDAV'
import { barriereSuppressionWebDAV, egauxSuppressionWebDAV } from '../../src/main/distant/journalSuppressionAnonWebDAV'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import { serviceSuppressionWebDAV } from '../fixtures/suppressionAnonWebDAV'
import { fixtureDissociationAnon as fixtureSuppression } from '../fixtures/dissociationAnon'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { preparerContexteNextcloud } from '../../src/main/distant/contexte'

const dirs: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const demande = { regleId: 'personne' }
function banc(natif: boolean, maintenant = Date.now) {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' }), source = fixtureSuppression()
  serveur.creerDossierRelatif('verrous')
  const f = { ...source, entretiens: Object.fromEntries(source.sources.map((s) => [s.id, s.data])) }
  serveur.poser('corpus.json', JSON.stringify(f.corpus, null, 2))
  for (const [id, data] of Object.entries(f.entretiens)) serveur.poser(`entretiens/${id}.json`, JSON.stringify(data, null, 2))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-suppression-webdav-')); dirs.push(dir)
  const sessions: string[] = [], miroirs = new Map<string, string>(), puts: string[] = [], acquisitions: string[] = []
  const panne = { miroir: false, final: false }
  const pieges = { avant: async (_chemin: string, _init: RequestInit) => {}, apres: async (_chemin: string, _init: RequestInit) => {} }
  const fetch: ImplementationFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const chemin = decodeURIComponent(new URL(url).pathname).replace(`${serveur.racineDav}/`, '').replace(/\/$/, '')
    await pieges.avant(chemin, init)
    const reponse = await serveur.fetch(input, init)
    if (init.method === 'PUT' && reponse.ok && (chemin === 'corpus.json' || chemin.startsWith('entretiens/'))) puts.push(chemin)
    if ((init.method === 'LOCK' || init.method === 'PUT' && chemin.startsWith('verrous/')) && reponse.ok) acquisitions.push(chemin)
    await pieges.apres(chemin, init)
    return reponse
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, fetch)
  const creer = () => serviceSuppressionWebDAV(client, dir, natif, sessions, (p, c) => {
    if (panne.miroir || panne.final && p === 'corpus.json' && !JSON.parse(c).suppressionAnon) throw new Error('miroir indisponible')
    miroirs.set(p, c)
  }, maintenant)
  const service = creer()
  const corpus = () => JSON.parse(serveur.contenuDe('corpus.json')!) as CorpusFichier
  const entretien = (id: string) => JSON.parse(serveur.contenuDe(`entretiens/${id}.json`)!) as EntretienFichier
  const tenir = async (id: string) => {
    const identite = { userId: 'olivier', machineId: 'autre-poste', sessionId: 'session-autre' }
    const tiers = serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const provider = natif ? new ProviderFilesLock(tiers, () => identite) : new ProviderPutConditionnel(tiers, () => identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    return () => provider.liberer(chemin)
  }
  return { serveur, f, dir, sessions, miroirs, puts, acquisitions, pieges, panne, client, service, creer, corpus, entretien, tenir }
}
for (const natif of [false, true]) describe(`suppression WebDAV : verrous ${natif ? 'natifs' : 'conditionnels'}`, () => {
  it('inventorie 300 membres mais ne verrouille ni ne remplace les non-cibles ; retire exactement les choix liés sans toucher aux mémoires et décisions indépendantes', async () => {
    const b = banc(natif), corpus = b.corpus()
    for (let i = 4; i <= 300; i++) {
      const id = `e${i}`; corpus.membership[id] = { ...corpus.membership.e3, titre: id }
      b.serveur.poser(`entretiens/${id}.json`, JSON.stringify(b.f.entretiens.e3))
    }
    b.serveur.poser('corpus.json', JSON.stringify(corpus)); b.sessions.push('e3')
    const rendre = await b.tenir('e4'), avant = b.serveur.contenuDe('entretiens/e3.json')
    b.acquisitions.length = 0
    const p = await b.service.preparer(demande)
    expect(p.lecture).toBe('webdav'); expect(p.entretiens).toHaveLength(300); expect(b.acquisitions).toEqual([])
    p.regle.pseudos.push('sans autorité')
    const r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'termine', annotations: 8, entretiens: 2, inclusesRetirees: 2, inclusesRevelees: 0, regleRetiree: true })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.json'])
    expect(b.acquisitions.some((c) => /e(?:3|4)\./.test(c))).toBe(false)
    expect(b.serveur.contenuDe('entretiens/e3.json')).toBe(avant)
    expect(b.corpus().suppressionAnon).toBeUndefined(); expect(b.corpus().reglesAnon.personne).toBeUndefined()
    for (const id of ['e1', 'e2']) {
      const apres = b.entretien(id), attendu = structuredClone(b.f.entretiens[id])
      attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne')
      attendu.lastModified = apres.lastModified
      expect(apres).toEqual(attendu)
    }
    const j = JSON.parse(readFileSync(join(b.dir, '.suppression-anon-webdav.json'), 'utf8'))
    expect(statSync(join(b.dir, '.suppression-anon-webdav.json')).mode & 0o777).toBe(0o600)
    expect(j.envoi).toBeUndefined(); expect(j.regleRetiree).toBe(true); expect(b.service.lireSuivi()).toBeNull()
    await rendre()
  })
  it('conserve une mémoire recouvrante et révèle une décision indépendante incluse sans la réattribuer', async () => {
    const b = banc(natif), e = b.entretien('e1')
    e.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Indépendant'], categorie: 'PER', etat: 'declaration' })
    e.annotations.push({ ...e.annotations[0], id: 'indep-inclus', regle: undefined, from: 1, to: 3, pseudo: 'Choix historique' })
    b.serveur.poser('entretiens/e1.json', JSON.stringify(e))
    const p = await b.service.preparer(demande)
    expect(p.bilan.inclusesRevelees).toBe(1)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('termine')
    const actuel = b.entretien('e1'), attendu = structuredClone(e)
    attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne'); attendu.lastModified = actuel.lastModified
    expect(actuel).toEqual(attendu)
  })
  it('retire une règle inutilisée sans écrire ni verrouiller un entretien', async () => {
    const b = banc(natif)
    for (const id of ['e1', 'e2']) b.serveur.poser(`entretiens/${id}.json`, JSON.stringify(b.f.entretiens.e3))
    const p = await b.service.preparer(demande)
    expect(p.bilan.annotations).toBe(0)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('termine')
    expect(b.puts).toEqual(['corpus.json', 'corpus.json'])
    expect(b.acquisitions.every((p) => p === 'verrous/corpus.lock.json')).toBe(true)
  })
  it('refuse un aperçu expiré pendant les lectures après acquisition du verrou', async () => {
    let temps = Date.now(); const b = banc(natif, () => temps), p = await b.service.preparer(demande)
    let avance = false
    b.pieges.avant = async (chemin, init) => {
      if (!avance && chemin === 'corpus.json' && init.method === 'GET') { avance = true; temps += 300_001 }
    }
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré')
    expect(b.puts).toEqual([])
  })
  it('limite les aperçus privés et refuse une définition changée depuis leur lecture', async () => {
    const b = banc(natif), vieux = await b.service.preparer(demande)
    await b.service.preparer(demande); await b.service.preparer(demande); const p = await b.service.preparer(demande)
    await expect(b.service.appliquer(vieux.token, true)).rejects.toThrow('expiré')
    const corpus = b.corpus(); corpus.reglesAnon.personne.categorie = 'Autre'
    b.serveur.poser('corpus.json', JSON.stringify(corpus))
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('corpus a changé')
    expect(b.puts).toEqual([])
  })
  it('refuse une source absente ou ancienne sans utiliser un miroir', async () => {
    const b = banc(natif), e = b.entretien('e3'); e.formatVersion = FORMAT_VERSION - 1
    b.serveur.poser('entretiens/e3.json', JSON.stringify(e))
    await expect(b.service.preparer(demande)).rejects.toThrow('obstacles')
    expect(b.miroirs.size).toBe(0); expect(b.puts).toEqual([])
  })
  it('relit le corpus après fsync avant un PUT cible et préserve la source changée', async () => {
    const b = banc(natif), original = JournalSuppressionAnonWebDAV.prototype.ecrire
    let change = false
    vi.spyOn(JournalSuppressionAnonWebDAV.prototype, 'ecrire').mockImplementation(function (j) {
      original.call(this, j)
      if (!change && j.envoi?.phase === 'entretien') {
        change = true; const corpus = b.corpus(); corpus.reglesAnon.personne.categorie = 'Changement extérieur'
        b.serveur.poser('corpus.json', JSON.stringify(corpus))
      }
    })
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 0 })
    expect(b.puts).toEqual(['corpus.json']); expect(b.entretien('e1')).toEqual(b.f.entretiens.e1)
    expect(JSON.parse(readFileSync(join(b.dir, '.suppression-anon-webdav.json'), 'utf8')).envoi).toBeUndefined()
  })
  it('une modification indépendante valide de la mémoire acquise n’est ni restaurée ni supprimée', async () => {
    const b = banc(natif)
    b.pieges.apres = async (chemin, init) => {
      if (chemin === 'entretiens/e2.json' && init.method === 'PUT') {
        const e = b.entretien('e1'); e.definitionsAnonLocales = []; b.serveur.poser('entretiens/e1.json', JSON.stringify(e))
      }
    }
    const p = await b.service.preparer(demande)
    expect((await b.service.appliquer(p.token, true)).statut).toBe('termine')
    expect(b.entretien('e1').definitionsAnonLocales).toEqual([])
  })
  it('mémoire acquise invalide : preuve finale suspendue sans réparation', async () => {
    const b = banc(natif)
    b.pieges.apres = async (chemin, init) => {
      if (chemin === 'entretiens/e2.json' && init.method === 'PUT') {
        const e = b.entretien('e1'); e.definitionsAnonLocales![0].entite = []
        b.serveur.poser('entretiens/e1.json', JSON.stringify(e))
      }
    }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: false })
    expect(b.puts).toHaveLength(3)
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow()
    expect(b.entretien('e1').definitionsAnonLocales![0].entite).toEqual([])
  })
  it('état du miroir final durable : une nouvelle instance relit sans rejouer le retrait', async () => {
    const b = banc(natif), p = await b.service.preparer(demande); b.panne.final = true
    const r = await b.service.appliquer(p.token, true), autre = b.creer()
    expect(autre.lireSuivi()).toMatchObject({ statut: 'partiel', regleRetiree: true, miroirIncomplet: true })
    await expect(autre.preparerReprise(r.operationId)).rejects.toThrow('miroir')
    b.panne.final = false
    expect((await autre.relireSuivi(r.operationId)).statut).toBe('termine')
    expect(b.puts).toHaveLength(4); expect(autre.lireSuivi()).toBeNull()
  })
  it('refus certain du PUT cible : intention retirée, autre cible possible, aucune compensation', async () => {
    const b = banc(natif), original = b.client.putTexte.bind(b.client)
    const { ErreurHttp } = await import('../../src/main/webdav/client')
    vi.spyOn(b.client, 'putTexte').mockImplementation(async (p, c, options) => {
      if (p === 'entretiens/e1.json') throw new ErreurHttp(412, 'Refus certain')
      return original(p, c, options)
    })
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
    expect(b.entretien('e1')).toEqual(b.f.entretiens.e1)
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e2.json'])
    expect(JSON.parse(readFileSync(join(b.dir, '.suppression-anon-webdav.json'), 'utf8')).envoi).toBeUndefined()
  })
  it('consomme le token même sans consentement ; refuse sa copie dans une autre instance', async () => {
    const b = banc(natif), p = await b.service.preparer(demande)
    await expect(b.creer().appliquer(p.token, true)).rejects.toThrow('expiré')
    await expect(b.service.appliquer(p.token, false)).rejects.toThrow('Confirmez')
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('expiré')
    expect(b.puts).toEqual([])
  })
  it('défère un bail distant sans l’enlever ; reprend uniquement la cible restante après nouveau consentement', async () => {
    const b = banc(natif), rendre = await b.tenir('e2')
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false })
    expect(b.corpus().suppressionAnon).toMatchObject({ operationId: r.operationId, regleId: 'personne' })
    const acquis = b.serveur.contenuDe('entretiens/e1.json')
    expect(JSON.stringify(b.service.lireSuivi())).not.toContain('corpsTexte')
    await rendre()
    const reprise = await b.service.preparerReprise(r.operationId)
    expect(reprise.bilan.annotations).toBe(4)
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(acquis)
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it('préserve une cible modifiée depuis l’aperçu puis retire les choix liés de son état frais après nouveau consentement', async () => {
    const b = banc(natif), p = await b.service.preparer(demande), e = b.entretien('e2')
    e.meta.titre = 'Édition indépendante'; b.serveur.poser('entretiens/e2.json', JSON.stringify(e))
    const r = await b.service.appliquer(p.token, true)
    expect(r.statut).toBe('partiel'); expect(b.entretien('e2')).toEqual(e)
    const reprise = await b.service.preparerReprise(r.operationId)
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.entretien('e2').meta.titre).toBe('Édition indépendante')
  })
  it('défère une session récupérable et garde la session non ciblée', async () => {
    const b = banc(natif); b.sessions.push('entretiens/e2.json', 'e3')
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
    expect(b.sessions).toEqual(['entretiens/e2.json', 'e3'])
    expect(b.puts).not.toContain('entretiens/e2.json')
  })
  it('refuse les nouveaux usages avant toute publication', async () => {
    const b = banc(natif), p = await b.service.preparer(demande)
    b.serveur.poser('entretiens/e3.json', JSON.stringify(b.f.entretiens.e1))
    await expect(b.service.appliquer(p.token, true)).rejects.toThrow('nouvel aperçu')
    expect(b.puts).toEqual([])
  })
  it('conserve la règle après un nouveau lien direct au contrôle final ; ne retire le nouveau lien que sous consentement frais', async () => {
    const b = banc(natif)
    b.pieges.apres = async (p, init) => {
      if (p === 'entretiens/e2.json' && init.method === 'PUT') b.serveur.poser('entretiens/e3.json', JSON.stringify(b.f.entretiens.e1))
    }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 8, nouvellesCibles: ['e3'] })
    b.pieges.apres = async () => {}
    const reprise = await b.service.preparerReprise(r.operationId)
    expect(reprise.bilan.annotations).toBe(4)
    const fin = await b.service.appliquer(reprise.token, true)
    expect(fin).toMatchObject({ statut: 'termine', annotations: 12 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'entretiens/e3.json', 'corpus.json'])
  })
  it('suspend le retrait et la reprise si un lien revient dans un acquis, sans l’enlever implicitement', async () => {
    const b = banc(natif)
    b.pieges.apres = async (p, init) => {
      if (p === 'entretiens/e2.json' && init.method === 'PUT') {
        const e = b.entretien('e1'); e.annotations.push(structuredClone(b.f.entretiens.e1.annotations[0])); b.serveur.poser('entretiens/e1.json', JSON.stringify(e))
      }
    }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: false })
    expect(r.motif).toContain('nouveaux liens')
    const avant = b.serveur.contenuDe('entretiens/e1.json')
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('nouveaux liens')
    expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(avant)
  })
  it('le garde ordinaire refuse un ancien lien inchangé mais autorise une modification de mémoire indépendante', async () => {
    const b = banc(natif), rendre = await b.tenir('e2')
    const p = await b.service.preparer(demande); await b.service.appliquer(p.token, true)
    const garde = new GardePseudosWebDAV(b.client, () => ({ userId: 'max', machineId: 'publication', sessionId: 'garde-synthetique' }), b.dir)
    const avant = b.entretien('e1'), independant = structuredClone(avant); independant.definitionsAnonLocales = []
    let appels = 0
    const envoyer = async (garantir: () => void) => { garantir(); appels++; return 'preuve' }
    await expect(garde.publier(JSON.stringify(b.f.entretiens.e2), JSON.stringify(b.f.entretiens.e2), envoyer, 'entretiens/e2.json')).rejects.toThrow('ancien lien')
    expect(appels).toBe(0)
    await expect(garde.publier(JSON.stringify(independant), JSON.stringify(avant), envoyer, 'entretiens/e1.json')).resolves.toBe('preuve')
    expect(appels).toBe(1); await rendre()
  })
  it('reconnaît la réponse perdue sans rejeu et installe la source actuelle, pas l’image historique', async () => {
    const b = banc(natif); let bloque = false, prouve = false
    b.pieges.apres = async (p, init) => { if (p === 'entretiens/e1.json' && init.method === 'PUT') { bloque = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (p, init) => {
      if (p === 'entretiens/e1.json' && init.method === 'GET') { if (bloque) throw new Error('lecture indisponible'); prouve = true }
      if (p === 'corpus.json' && init.method === 'GET' && prouve && b.service.lireSuivi()?.annotations === 4) {
        const e = b.entretien('e1'); e.meta.titre = 'Source actuelle'; b.serveur.poser('entretiens/e1.json', JSON.stringify(e)); prouve = false
      }
    }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'indetermine', annotations: 0 })
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('indéterminée')
    bloque = false; prouve = false
    const reconnu = await b.service.relireSuivi(r.operationId)
    expect(reconnu.annotations).toBe(4)
    expect(JSON.parse(b.miroirs.get('entretiens/e1.json')!).meta.titre).toBe('Source actuelle')
    b.pieges.avant = async () => {}; b.pieges.apres = async () => {}
    const reprise = await b.service.preparerReprise(r.operationId)
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it('l’image originale ne prouve pas un refus et n’autorise ni rejeu ni libération', async () => {
    const b = banc(natif)
    b.pieges.avant = async (p, init) => { if (p === 'entretiens/e1.json' && init.method === 'PUT') throw new Error('transport inconnu') }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r.statut).toBe('indetermine')
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('original ne prouve pas')
    expect(b.puts).toEqual(['corpus.json'])
    expect((await new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'nouveau', sessionId: 'autre' })).acquerir('verrous/corpus.lock.json')).ok).toBe(false)
  })
  it('une nouvelle instance refuse le verrou persistant du même compte, puis reprend après reconnaissance par le détenteur vivant', async () => {
    const b = banc(natif); let bloque = false
    b.pieges.apres = async (p, init) => { if (p === 'entretiens/e1.json' && init.method === 'PUT') { bloque = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (p, init) => { if (bloque && p === 'entretiens/e1.json' && init.method === 'GET') throw new Error('lecture indisponible') }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true), autre = b.creer()
    bloque = false
    await expect(autre.relireSuivi(r.operationId)).rejects.toThrow('verrou reste tenu')
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
    await b.service.relireSuivi(r.operationId)
    b.pieges.apres = async () => {}
    const reprise = await autre.preparerReprise(r.operationId)
    expect((await autre.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  it('reconnaît le retrait final accepté sans seconde publication', async () => {
    const b = banc(natif); let bloque = false
    b.pieges.apres = async (p, init) => {
      if (p === 'corpus.json' && init.method === 'PUT' && !(JSON.parse(init.body as string) as CorpusFichier).reglesAnon.personne) { bloque = true; throw new Error('réponse finale perdue') }
    }
    b.pieges.avant = async (p, init) => { if (bloque && p === 'corpus.json' && init.method === 'GET') throw new Error('lecture indisponible') }
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'indetermine', annotations: 8, regleRetiree: false })
    bloque = false
    expect((await b.service.relireSuivi(r.operationId)).statut).toBe('termine')
    expect(b.puts).toHaveLength(4)
    await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('terminé')
  })
  it('retire explicitement une cible sortie du membership sans modifier son fichier', async () => {
    const b = banc(natif), rendre = await b.tenir('e2')
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    const corps = b.corpus(); delete corps.membership.e2; b.serveur.poser('corpus.json', JSON.stringify(corps))
    const avant = b.serveur.contenuDe('entretiens/e2.json'), reprise = await b.service.preparerReprise(r.operationId)
    expect(reprise.ciblesRetirees).toEqual(['e2'])
    expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
    expect(b.serveur.contenuDe('entretiens/e2.json')).toBe(avant); await rendre()
  })
  it('revalide la marge après fsync du journal, avant tout PUT', async () => {
    let temps = Date.now(); const b = banc(natif, () => temps)
    const original = JournalSuppressionAnonWebDAV.prototype.ecrire
    vi.spyOn(JournalSuppressionAnonWebDAV.prototype, 'ecrire').mockImplementation(function (j) {
      original.call(this, j); if (j.envoi?.phase === 'barriere') temps += 400_000
    })
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 0 })
    expect(r.motif).toContain('expirer'); expect(b.puts).toEqual([])
    expect(JSON.parse(readFileSync(join(b.dir, '.suppression-anon-webdav.json'), 'utf8')).envoi).toBeUndefined()
  })
  it('miroir final incomplet : retrait acquis mais pas de faux succès ; relecture actuelle sans nouveau PUT', async () => {
    const b = banc(natif), p = await b.service.preparer(demande); b.panne.final = true
    const r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: true })
    expect(b.service.lireSuivi()).toMatchObject({ statut: 'partiel', regleRetiree: true })
    expect(() => b.service.exigerMiroirComplet()).toThrow('incomplet')
    b.panne.final = false
    expect(await b.service.relireSuivi(r.operationId)).toMatchObject({ statut: 'termine', regleRetiree: true })
    expect(b.service.lireSuivi()).toBeNull(); expect(b.puts).toHaveLength(4)
  })
  it('échec de lecture d’une source acquise bloque encore le miroir après connaissance du retrait', async () => {
    const b = banc(natif), p = await b.service.preparer(demande)
    b.pieges.apres = async (p, init) => { if (p === 'entretiens/e1.json' && init.method === 'PUT') b.panne.miroir = true }
    const r = await b.service.appliquer(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
    b.panne.miroir = false
    b.pieges.avant = async (p, init) => { if (p === 'entretiens/e1.json' && init.method === 'GET') throw new Error('source indisponible') }
    await expect(b.service.relireSuivi(r.operationId)).rejects.toThrow('miroir')
    expect(() => b.service.exigerMiroirComplet()).toThrow('incomplet')
    b.pieges.avant = async () => {}; b.pieges.apres = async () => {}
    expect(await b.service.relireSuivi(r.operationId)).toMatchObject({ statut: 'partiel', annotations: 4 })
    expect(() => b.service.exigerMiroirComplet()).not.toThrow()
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
  })
  it('la préparation de reprise ne modifie ni les sources ni les fichiers du miroir', async () => {
    const b = banc(natif), rendre = await b.tenir('e2'), p = await b.service.preparer(demande)
    const r = await b.service.appliquer(p.token, true), avant = [...b.miroirs.entries()], puts = [...b.puts]
    await b.service.preparerReprise(r.operationId)
    expect([...b.miroirs.entries()]).toEqual(avant); expect(b.puts).toEqual(puts)
    await rendre()
  })
  it('refuse un journal altéré avant toute lecture serveur', async () => {
    const b = banc(natif), rendre = await b.tenir('e2')
    const p = await b.service.preparer(demande), r = await b.service.appliquer(p.token, true)
    const fichier = join(b.dir, '.suppression-anon-webdav.json'), j = JSON.parse(readFileSync(fichier, 'utf8'))
    const data = JSON.parse(j.cibles[0].apres); data.annotations[0].pseudo = 'forgé'; j.cibles[0].apres = JSON.stringify(data)
    writeFileSync(fichier, JSON.stringify(j)); let lectures = 0
    b.pieges.avant = async (_p, init) => { if (init.method === 'GET') lectures++ }
    expect(() => b.creer()).toThrow('journal de suppression')
    expect(lectures).toBe(0); await rendre()
  })
})
it('un membre nommé __proto__ reste une propriété propre lors de la reprise consentie', async () => {
  const b = banc(false), rendre = await b.tenir('e2'), p = await b.service.preparer(demande)
  const r = await b.service.appliquer(p.token, true), corpus = b.corpus()
  Object.defineProperty(corpus.membership, '__proto__', { value: structuredClone(corpus.membership.e1), enumerable: true })
  b.serveur.poser('corpus.json', JSON.stringify(corpus)); b.serveur.poser('entretiens/__proto__.json', JSON.stringify(b.f.entretiens.e1))
  const reprise = await b.service.preparerReprise(r.operationId)
  expect(reprise.entretiens.some((e) => e.id === '__proto__' && e.annotations === 4)).toBe(true)
  await rendre(); expect((await b.service.appliquer(reprise.token, true)).statut).toBe('termine')
  expect(b.entretien('__proto__').annotations.some((a) => a.regle === 'personne')).toBe(false)
})
it('l’ouverture produit retrouve le suivi partiel et refuse un journal falsifié avant tout accès serveur', async () => {
  const b = banc(false), rendre = await b.tenir('e2'), p = await b.service.preparer(demande)
  await b.service.appliquer(p.token, true)
  let acces = 0; b.pieges.avant = async () => { acces++ }
  const ouvrir = () => preparerContexteNextcloud({ id: 'preparation', client: b.client, dirLocal: b.dir,
    identite: () => ({ userId: 'max', machineId: 'nouveau', sessionId: 'ouverture' }), verrouNatif: false })
  const { contexte } = await ouvrir()
  expect(contexte.lireSuiviSuppressionAnon()).toMatchObject({ statut: 'partiel', annotations: 4 })
  await contexte.fermer(); acces = 0
  const fichier = join(b.dir, '.suppression-anon-webdav.json'), j = JSON.parse(readFileSync(fichier, 'utf8'))
  j.cibles[0].bilan.annotations++; writeFileSync(fichier, JSON.stringify(j))
  await expect(ouvrir()).rejects.toThrow('journal de suppression'); expect(acces).toBe(0)
  await rendre()
})
it('le journal refuse le déclassement, la destination étrangère et la perte de l’état du miroir', async () => {
  const b = banc(false), rendre = await b.tenir('e2'), p = await b.service.preparer(demande)
  await b.service.appliquer(p.token, true)
  const fichier = join(b.dir, '.suppression-anon-webdav.json'), valide = JSON.parse(readFileSync(fichier, 'utf8'))
  expect(barriereSuppressionWebDAV(valide)).toEqual(b.corpus().suppressionAnon)
  expect(egauxSuppressionWebDAV(undefined, undefined)).toBe(true)
  for (const alterer of [(j) => { j.version = 0 }, (j) => { j.destination = '0'.repeat(64) }, (j) => { delete j.miroirComplet }]) {
    const j = structuredClone(valide); alterer(j); writeFileSync(fichier, JSON.stringify(j))
    expect(() => b.service.lireSuivi()).toThrow('journal de suppression')
  }
  writeFileSync(fichier, JSON.stringify(valide)); await rendre()
})
