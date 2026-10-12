import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { PORTEES_OUVERTES_WEBDAV } from '../../src/main/gitlab/politiqueGestes'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { fixtureRetraitVarianteAnon } from '../fixtures/retraitVarianteAnon'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const dirs: string[] = [], contextes: ContexteCorpusDistant[] = [], portees = [...PORTEES_OUVERTES_WEBDAV]
afterEach(async () => {
  PORTEES_OUVERTES_WEBDAV.splice(0, PORTEES_OUVERTES_WEBDAV.length, ...portees)
  for (const c of contextes.splice(0)) { await c.fermer(); c.arreterPresence() }
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }))
})
function attente() {
  let terminer!: () => void
  const promise = new Promise<void>((r) => { terminer = r })
  return { promise, terminer }
}
async function banc(natif: boolean) {
  const f = fixtureRetraitVarianteAnon(), serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
  serveur.creerDossierRelatif('verrous'); serveur.poser('corpus.json', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-retrait-contexte-')); dirs.push(dir)
  const puts: string[] = [], pieges = { avant: async (_p: string, _i?: RequestInit) => {} }
  const transport: ImplementationFetch = async (url, init) => {
    const p = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    await pieges.avant(p, init)
    const r = await serveur.fetch(url, init)
    if (r.ok && init?.method === 'PUT' && (p === 'corpus.json' || p.startsWith('entretiens/'))) puts.push(p)
    return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  if (!PORTEES_OUVERTES_WEBDAV.includes('pseudonymisation-retrait-variante')) PORTEES_OUVERTES_WEBDAV.push('pseudonymisation-retrait-variante')
  let instance = 0
  const ouvrir = async () => {
    const identite = { userId: 'max', machineId: 'fixture', sessionId: `contexte-${instance++}` }
    const { contexte } = await preparerContexteNextcloud({ id: 'synthetique', dirLocal: dir, client, verrouNatif: natif, identite: () => identite })
    contextes.push(contexte); return contexte
  }
  const contexte = await ouvrir(); puts.length = 0
  const tenir = async (id: string) => {
    const tiers = serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const identite = { userId: 'olivier', machineId: 'tiers', sessionId: 'tiers' }
    const provider = natif ? new ProviderFilesLock(tiers, () => identite) : new ProviderPutConditionnel(tiers, () => identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true); return () => provider.liberer(chemin)
  }
  return { f, serveur, dir, puts, pieges, contexte, ouvrir, tenir }
}
for (const natif of [false, true]) describe(`contexte retrait WebDAV : ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('cibles réservées avant attente : écriture, ouverture, pull et fermeture protégés ; non-cible éditable', async () => {
    const b = await banc(natif), p = await b.contexte.preparerRetraitVarianteAnon(b.f.demande), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, i) => { if (chemin === 'entretiens/e1.json' && i?.method === 'PUT') { arrive.terminer(); await suite.promise } }
    const publication = b.contexte.retirerVarianteAnon(p.token, true); await arrive.promise
    try {
      await expect(b.contexte.ouvrirEntretienPourEdition('e1')).rejects.toThrow('cible')
      expect(() => b.contexte.exigerEcritureEntretien('e2')).toThrow('retrait de variante')
      await expect(b.contexte.actualiser()).rejects.toThrow('retrait de variante')
      await expect(b.contexte.fermer()).rejects.toThrow('retrait de variante')
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('retrait')
      await expect(b.contexte.ouvrirEntretienPourEdition('e3')).resolves.toMatchObject({ acces: 'edition' })
      expect(() => b.contexte.exigerEcritureEntretien('e3')).not.toThrow()
    } finally { suite.terminer() }
    expect(await publication).toMatchObject({ statut: 'termine', annotations: 6 })
    await b.contexte.fermerEntretien('e3')
  })
  test('ouverture cible déjà engagée : refus et aperçu consommé avant publication', async () => {
    const b = await banc(natif), p = await b.contexte.preparerRetraitVarianteAnon(b.f.demande), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, i) => {
      if (natif ? chemin === 'entretiens/e1.json' && i?.method === 'LOCK' : chemin === 'verrous/e1.lock.json' && i?.method === 'PUT') {
        arrive.terminer(); await suite.promise
      }
    }
    const ouverture = b.contexte.ouvrirEntretienPourEdition('e1'); await arrive.promise
    try { await expect(b.contexte.retirerVarianteAnon(p.token, true)).rejects.toThrow('opérations des cibles') }
    finally { suite.terminer() }
    await ouverture
    expect(b.puts).toEqual([])
    await expect(b.contexte.retirerVarianteAnon(p.token, true)).rejects.toThrow('expiré')
    await b.contexte.fermerEntretien('e1')
  })
  test('partiel : modification indépendante conservée et sauvegardable, réouverture protégée et reprise restante', async () => {
    const b = await banc(natif), rendre = await b.tenir('e2')
    try {
      await b.contexte.ouvrirEntretienPourEdition('e3')
      const lecture = b.contexte.store.lireEntretien('e3'); if (!lecture.ok) throw new Error('Fixture illisible')
      lecture.data.corpsTexte.content![0].content![0].text += ' Note indépendante.'
      b.contexte.store.ecrireEntretien('e3', lecture.data); b.contexte.sessions.noterSale('e3')
      const local = readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')
      const p = await b.contexte.preparerRetraitVarianteAnon(b.f.demande), r = await b.contexte.retirerVarianteAnon(p.token, true)
      expect(r).toMatchObject({ statut: 'partiel', annotations: 3 })
      expect(b.contexte.sessions.etat('e3')).toMatchObject({ etat: 'a-nous', sale: true })
      expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toBe(local)
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('retrait')
      expect(await b.contexte.fermerEntretien('e3')).toMatchObject({ fermee: true })
      expect(b.serveur.contenuDe('entretiens/e3.json')).toContain('Note indépendante.')
      await b.contexte.fermer()
      const neuf = await b.ouvrir(); expect(neuf.lireSuiviRetraitVarianteAnon()).toMatchObject({ annotations: 3 })
      await rendre()
      const reprise = await neuf.preparerRepriseRetraitVarianteAnon(r.operationId)
      expect(await neuf.retirerVarianteAnon(reprise.token, true)).toMatchObject({ statut: 'termine', annotations: 6 })
      expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
      expect(b.serveur.contenuDe('entretiens/e3.json')).toContain('Note indépendante.')
    } finally { await rendre() }
  })
  test('politique fermée après intention durable : aucun PUT de cible, suivi lisible sans autorité héritée', async () => {
    const b = await banc(natif), p = await b.contexte.preparerRetraitVarianteAnon(b.f.demande)
    let fermee = false
    b.pieges.avant = async (chemin, i) => {
      if (!fermee && b.puts.length === 1 && chemin === 'verrous/corpus.lock.json' && i?.method === 'GET') {
        const j = JSON.parse(readFileSync(join(b.dir, '.retrait-variante-anon-webdav.json'), 'utf8'))
        if (j.envoi?.phase === 'entretien') {
          fermee = true; PORTEES_OUVERTES_WEBDAV.splice(PORTEES_OUVERTES_WEBDAV.indexOf('pseudonymisation-retrait-variante'), 1)
        }
      }
    }
    const r = await b.contexte.retirerVarianteAnon(p.token, true)
    expect(fermee).toBe(true); expect(r).toMatchObject({ statut: 'partiel', annotations: 0 })
    expect(b.puts).toEqual(['corpus.json'])
    expect(b.contexte.lireSuiviRetraitVarianteAnon()).toMatchObject({ statut: 'partiel' })
    expect(() => b.contexte.preparerRepriseRetraitVarianteAnon(r.operationId)).toThrow('pas disponible')
    expect((await b.contexte.relireSuiviRetraitVarianteAnon(r.operationId)).statut).toBe('partiel')
  })
})
