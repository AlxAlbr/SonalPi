import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { PORTEES_OUVERTES_WEBDAV, gesteAutorise } from '../../src/main/gitlab/politiqueGestes'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'

const dossiers: string[] = [], contextes: ContexteCorpusDistant[] = []
const portees = [...PORTEES_OUVERTES_WEBDAV]
afterEach(async () => {
  for (const c of contextes.splice(0)) { await c.fermer(); c.arreterPresence() }
  PORTEES_OUVERTES_WEBDAV.splice(0, PORTEES_OUVERTES_WEBDAV.length, ...portees)
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
function attente() {
  let terminer!: () => void
  const promise = new Promise<void>((resolve) => { terminer = resolve })
  return { promise, terminer }
}
async function banc(natif: boolean) {
  const f = fixtureDissociationAnon()
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' }); serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-dissociation-contexte-')); dossiers.push(dirLocal)
  const puts: string[] = [], pieges = { avant: async (_p: string, _init?: RequestInit) => {}, apres: async (_p: string, _init?: RequestInit) => {} }
  const transport: ImplementationFetch = async (url, init) => {
    const p = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    await pieges.avant(p, init)
    const r = await serveur.fetch(url, init)
    if (r.ok && init?.method === 'PUT' && (p === 'corpus.json' || p.startsWith('entretiens/'))) puts.push(p)
    await pieges.apres(p, init); return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  let lancement = 0
  const ouvrir = async () => {
    const identite = { userId: 'max', machineId: 'poste-dissociation', sessionId: `session-${lancement++}` }
    const { contexte } = await preparerContexteNextcloud({ id: 'qualification', dirLocal, client, identite: () => identite, verrouNatif: natif })
    contextes.push(contexte); return contexte
  }
  const contexte = await ouvrir()
  const preparer = () => contexte.preparerDissociationAnon(f.demande)
  const tenir = async (id: string) => {
    const tiers = serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const identite = () => ({ userId: 'olivier', machineId: 'autre', sessionId: 'tiers' })
    const provider = natif ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    return () => provider.liberer(chemin)
  }
  return { f, serveur, client, dirLocal, puts, pieges, contexte, ouvrir, preparer, tenir }
}
for (const natif of [false, true]) describe(`assemblage dissociation WebDAV : ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('clones, consentement, origine et miroir natif ; aucune autorité sur les copies publiques', async () => {
    const b = await banc(natif), p = await b.preparer()
    await expect(b.contexte.dissocierRegleAnon(p.token, false)).rejects.toThrow('Confirmez')
    await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('expiré')
    const q = await b.preparer(); q.definitionLocale.pseudos.push('faux'); q.entretiens[0].usages = []
    const autre = await b.ouvrir()
    await expect(autre.dissocierRegleAnon(q.token, true)).rejects.toThrow('expiré')
    expect(await b.contexte.dissocierRegleAnon(q.token, true)).toMatchObject({ statut: 'termine', annotations: 8 })
    const e = b.contexte.store.lireEntretien('e1')
    expect(e).toMatchObject({ ok: true, data: { definitionsAnonLocales: expect.arrayContaining([p.definitionLocale]) } })
    expect(b.contexte.store.ouvrir().reglesAnon.personne).toBeUndefined()
  })
  test('cibles réservées avant l’attente : autosave, ouverture, fermeture et pull protégés, non-cible éditable', async () => {
    const b = await banc(natif), p = await b.preparer(), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise } }
    const publication = b.contexte.dissocierRegleAnon(p.token, true); await arrive.promise
    try {
      await expect(b.contexte.ouvrirEntretienPourEdition('e1')).rejects.toThrow('cible')
      expect(() => b.contexte.exigerEcritureEntretien('e2')).toThrow('dissociation')
      await expect(b.contexte.actualiser()).rejects.toThrow('dissociation')
      await expect(b.contexte.fermer()).rejects.toThrow('Attendez')
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('dissociation')
      await expect(b.contexte.transactions.instantaneCorrespondances()).rejects.toThrow('dissociation')
      await expect(b.contexte.instantaneRenommageAnon()).rejects.toThrow('dissociation')
      await expect(b.contexte.ouvrirEntretienPourEdition('e3')).resolves.toMatchObject({ acces: 'edition' })
      expect(() => b.contexte.exigerEcritureEntretien('e3')).not.toThrow()
    } finally { suite.terminer() }
    expect(await publication).toMatchObject({ statut: 'termine' })
    await b.contexte.fermerEntretien('e3')
  })
  test('une ouverture cible déjà commencée refuse et consomme l’aperçu sans publication', async () => {
    const b = await banc(natif), p = await b.preparer(), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => {
      if (natif ? chemin === 'entretiens/e1.json' && init?.method === 'LOCK' : chemin === 'verrous/e1.lock.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise }
    }
    const ouverture = b.contexte.ouvrirEntretienPourEdition('e1'); await arrive.promise
    try { await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('opérations des cibles') }
    finally { suite.terminer() }
    await ouverture; expect(b.puts).toEqual([])
    await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('expiré')
    await b.contexte.fermerEntretien('e1')
  })
  test('un pull déjà commencé refuse le lot ; une lecture en cours refuse la fermeture du contexte', async () => {
    const b = await banc(natif), p = await b.preparer(), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => { if (!chemin && init?.method === 'PROPFIND') { arrive.terminer(); await suite.promise } }
    const tirage = b.contexte.actualiser(); await arrive.promise
    try { await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('opérations des cibles') }
    finally { suite.terminer() }
    await tirage
    const depart = attente(), fin = attente()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'corpus.json' && init?.method === 'GET') { depart.terminer(); await fin.promise } }
    const lecture = b.preparer(); await depart.promise
    try { await expect(b.contexte.fermer()).rejects.toThrow('dissociation') }
    finally { fin.terminer() }
    await lecture
  })
  test('lot partiel : session non ciblée conservée, mutation incompatible refusée, réouverture et reprise sans écrasement', async () => {
    const b = await banc(natif), rendre = await b.tenir('e2')
    try {
      await b.contexte.ouvrirEntretienPourEdition('e3')
      const p = await b.preparer(), r = await b.contexte.dissocierRegleAnon(p.token, true)
      expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
      expect(b.contexte.sessions.idsTenus()).toEqual(['e3'])
      await expect(b.contexte.ouvrirEntretienPourEdition('e2')).rejects.toThrow('dissociation')
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('dissociation')
      const original = serveurTexte(b, 'e2')
      const ferme = b.contexte.store.lireEntretien('e2'); expect(ferme.ok).toBe(true)
      await b.contexte.actualiser(); expect(serveurTexte(b, 'e2')).toBe(original)
      await b.contexte.fermerEntretien('e3'); await b.contexte.fermer()
      const relance = await b.ouvrir(); expect(relance.lireSuiviDissociationAnon()).toMatchObject({ annotations: 4 })
      await rendre()
      const reprise = await relance.preparerRepriseDissociationAnon(r.operationId)
      expect(await relance.dissocierRegleAnon(reprise.token, true)).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
    } finally { await rendre() }
  })
  test('session cible locale différée ; une sauvegarde portant l’ancien lien échoue sans fermeture forcée', async () => {
    const b = await banc(natif)
    await b.contexte.ouvrirEntretienPourEdition('e2')
    const base = await b.client.getTexte('entretiens/e2.json')
    const p = await b.preparer(), r = await b.contexte.dissocierRegleAnon(p.token, true)
    expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
    const candidat = JSON.parse(base); candidat.meta.titre = 'Note indépendante à conserver'
    writeFileSync(join(b.dirLocal, 'entretiens/e2.json'), JSON.stringify(candidat)); b.contexte.sessions.noterSale('e2')
    await expect(b.contexte.publierEntretien('e2')).rejects.toThrow('ancien lien')
    expect(b.contexte.sessions.etat('e2')).toMatchObject({ etat: 'a-nous', sale: true })
    // Le banc restaure uniquement sa propre base ; cela ne donne aucun droit sur un autre poste.
    writeFileSync(join(b.dirLocal, 'entretiens/e2.json'), base); b.contexte.sessions.noterSale('e2')
    expect(await b.contexte.fermerEntretien('e2')).toMatchObject({ fermee: true })
    const reprise = await b.contexte.preparerRepriseDissociationAnon(r.operationId)
    expect(await b.contexte.dissocierRegleAnon(reprise.token, true)).toMatchObject({ statut: 'termine' })
  })
  test('Actualiser reconnaît le PUT accepté, sans installer une copie historique ni envoyer à nouveau', async () => {
    const b = await banc(natif); let bloque = false
    b.pieges.apres = async (p, init) => { if (p === 'entretiens/e1.json' && init?.method === 'PUT') { bloque = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (p, init) => { if (bloque && p === 'entretiens/e1.json' && init?.method === 'GET') throw new Error('lecture perdue') }
    const p = await b.preparer(), r = await b.contexte.dissocierRegleAnon(p.token, true)
    expect(r.statut).toBe('indetermine')
    await expect(b.contexte.actualiser()).rejects.toThrow('lecture perdue')
    bloque = false; b.pieges.apres = async () => {}
    const acquis = serveurTexte(b, 'e1')
    await b.contexte.actualiser()
    expect(b.contexte.lireSuiviDissociationAnon()).toMatchObject({ annotations: 4, statut: 'partiel' })
    expect(readFileSync(join(b.dirLocal, 'entretiens/e1.json'), 'utf8')).toBe(acquis)
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
    const reprise = await b.contexte.preparerRepriseDissociationAnon(r.operationId)
    expect(await b.contexte.dissocierRegleAnon(reprise.token, true)).toMatchObject({ statut: 'termine' })
  })
  test('les verrous de dissociation ne deviennent jamais des sessions à publier ou abandonner', async () => {
    const b = await banc(natif); let bloque = false
    b.pieges.apres = async (p, init) => { if (p === 'entretiens/e1.json' && init?.method === 'PUT') { bloque = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (p, init) => { if (bloque && p === 'entretiens/e1.json' && init?.method === 'GET') throw new Error('lecture perdue') }
    const p = await b.preparer(), r = await b.contexte.dissocierRegleAnon(p.token, true)
    bloque = false
    expect(await b.contexte.listerOrphelins()).toEqual([])
    for (const chemin of ['verrous/corpus.lock.json', natif ? 'entretiens/e1.json' : 'verrous/e1.lock.json']) {
      await expect(b.contexte.reprendreOrphelin(chemin)).rejects.toThrow('ne correspond pas')
      await expect(b.contexte.abandonnerOrphelin(chemin)).rejects.toThrow('ne correspond pas')
    }
    await b.contexte.relireSuiviDissociationAnon(r.operationId)
  })
  test('journal corrompu refusé avant le premier appel réseau au redémarrage', async () => {
    const b = await banc(natif), rendre = await b.tenir('e2')
    try {
      const p = await b.preparer(); await b.contexte.dissocierRegleAnon(p.token, true)
      const fichier = join(b.dirLocal, '.dissociation-anon-webdav.json'), original = readFileSync(fichier, 'utf8')
      await b.contexte.fermer(); writeFileSync(fichier, '{}'); let appels = 0
      b.pieges.avant = async () => { appels++ }
      await expect(b.ouvrir()).rejects.toThrow('journal de dissociation')
      expect(appels).toBe(0); writeFileSync(fichier, original)
    } finally { await rendre() }
  })
  test('refus de politique consomme une préparation privée et n’autorise pas de repli local', async () => {
    const b = await banc(natif), p = await b.preparer()
    PORTEES_OUVERTES_WEBDAV.splice(PORTEES_OUVERTES_WEBDAV.indexOf('pseudonymisation-dissociation'), 1)
    expect(gesteAutorise('webdav', 'anon.dissocier-globalement')).toBe(false)
    expect(b.contexte.dissociationAnonDisponible()).toBe(false)
    await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('pas disponible')
    PORTEES_OUVERTES_WEBDAV.push('pseudonymisation-dissociation')
    await expect(b.contexte.dissocierRegleAnon(p.token, true)).rejects.toThrow('expiré')
    expect(b.puts).toEqual([])
  })
})
function serveurTexte(b: Awaited<ReturnType<typeof banc>>, id: string) { return b.serveur.contenuDe(`entretiens/${id}.json`) }
