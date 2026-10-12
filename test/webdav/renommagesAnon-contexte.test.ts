import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { RenommagesAnon } from '../../src/main/renommagesAnon'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { preparationRenommageWebDAV } from '../fixtures/renommageAnonWebDAV'

const dossiers: string[] = []; const contextes: ContexteCorpusDistant[] = []
afterEach(async () => {
  for (const c of contextes.splice(0)) { await c.fermer(); c.arreterPresence() }
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
function attente() {
  let terminer!: () => void
  const promise = new Promise<void>((resolve) => { terminer = resolve })
  return { promise, terminer }
}
async function banc(natif: boolean) {
  const f = fixtureRenommageAnon(['e1', 'e2', 'e3'])
  f.sources[2].data.annotations = []
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' }); serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-renommage-contexte-')); dossiers.push(dirLocal)
  const puts: string[] = []; const pieges = { avant: async (_chemin: string, _init?: RequestInit) => {}, apres: async (_chemin: string, _init?: RequestInit) => {} }
  const transport: ImplementationFetch = async (url, init) => {
    const chemin = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    await pieges.avant(chemin, init)
    const r = await serveur.fetch(url, init)
    if (r.ok && init?.method === 'PUT' && (chemin === 'corpus.json' || chemin.startsWith('entretiens/'))) puts.push(chemin)
    await pieges.apres(chemin, init)
    return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  let lancement = 0
  const ouvrir = async () => {
    const identite = { userId: 'max', machineId: 'poste-renommage', sessionId: `session-${lancement++}` }
    const { contexte } = await preparerContexteNextcloud({ id: 'qualification', dirLocal, client, identite: () => identite, verrouNatif: natif })
    contextes.push(contexte)
    return contexte
  }
  const contexte = await ouvrir()
  const cache = new RenommagesAnon({ store: () => contexte.store, local: () => false })
  const preparer = async () => cache.preparerWebDAV(f.demande, await contexte.instantaneRenommageAnon(), contexte.renommageAnonDisponible(), contexte)
  const appliquer = (token: string, confirmee = true) => contexte.renommerVarianteAnon(cache.consommerWebDAV(token, confirmee, contexte))
  const tenir = async (id: string) => {
    const tiers = serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const identite = () => ({ userId: 'olivier', machineId: 'autre', sessionId: 'tiers' })
    const provider = natif ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    return () => provider.liberer(chemin)
  }
  const reprendre = async (c = contexte) => {
    const r = await c.preparerRepriseRenommageAnon(c.lireSuiviRenommageAnon()!.operationId)
    return c.renommerVarianteAnon(preparationRenommageWebDAV(c.store, r.instantane, r.demande, r))
  }
  return { f, serveur, client, dirLocal, puts, pieges, ouvrir, contexte, cache, preparer, appliquer, tenir, reprendre }
}
for (const natif of [false, true]) describe(`raccordement renommage WebDAV — ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('cache privé : clones sans autorité, consentement et origine obligatoires ; tentative consomme le jeton', async () => {
    const b = await banc(natif); const a = await b.preparer()
    expect(a.lecture).toBe('webdav')
    expect(() => b.cache.consommerWebDAV(a.token, false, b.contexte)).toThrow('Confirmez explicitement')
    expect(() => b.cache.consommerWebDAV(a.token, true, b.contexte)).toThrow('expiré')
    const c = await b.preparer()
    expect(() => b.cache.consommerGitLab(c.token, true, b.contexte)).toThrow('fournisseur')
    const d = await b.preparer()
    expect(() => b.cache.consommerWebDAV(d.token, true, {})).toThrow('contexte WebDAV a changé')
    const e = await b.preparer()
    e.demande.nouveauPseudo = 'Faux'; e.entretiens[0].usages = []
    expect(await b.appliquer(e.token)).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!).annotations[0].pseudo).toBe('Nouvelle')
    expect(b.contexte.store.lireEntretien('e1')).toMatchObject({ ok: true, data: { annotations: expect.arrayContaining([expect.objectContaining({ id: 'a0', pseudo: 'Nouvelle' })]) } })
  })
  test('envoi actif : cibles/autosave/tirage/fermeture/mutations protégés ; ouverture non ciblée permise', async () => {
    const b = await banc(natif); const a = await b.preparer(); const arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise } }
    const publication = b.appliquer(a.token); await arrive.promise
    try {
      await expect(b.contexte.ouvrirEntretienPourEdition('e1')).rejects.toThrow('cible')
      expect(() => b.contexte.exigerEcritureEntretien('e2')).toThrow('renommage')
      await expect(b.contexte.actualiser()).rejects.toThrow('renommage')
      await expect(b.contexte.fermer()).rejects.toThrow('Attendez')
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('renommage')
      await expect(b.contexte.transactions.instantaneCorrespondances()).rejects.toThrow('renommage')
      await expect(b.contexte.ouvrirEntretienPourEdition('e3')).resolves.toMatchObject({ acces: 'edition' })
      expect(() => b.contexte.exigerEcritureEntretien('e3')).not.toThrow()
    } finally { suite.terminer() }
    expect(await publication).toMatchObject({ statut: 'termine' })
    await b.contexte.fermerEntretien('e3')
    expect(() => b.contexte.exigerEcritureEntretien('e3')).toThrow('session WebDAV')
  })
  test('ouverture déjà commencée d’une cible refuse avant la publication de définition', async () => {
    const b = await banc(natif); const a = await b.preparer(); const arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => {
      if (natif ? chemin === 'entretiens/e1.json' && init?.method === 'LOCK' : chemin === 'verrous/e1.lock.json' && init?.method === 'PUT') {
        arrive.terminer(); await suite.promise
      }
    }
    const ouverture = b.contexte.ouvrirEntretienPourEdition('e1'); await arrive.promise
    try { await expect(b.appliquer(a.token)).rejects.toThrow('opérations des cibles') }
    finally { suite.terminer() }
    await ouverture
    expect(b.puts).toEqual([])
    await b.contexte.fermerEntretien('e1')
  })
  test('tirage déjà commencé refuse le lot, mutation déjà commencée et lectures refusent la fermeture', async () => {
    const b = await banc(natif); const a = await b.preparer(); const arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => { if (!chemin && init?.method === 'PROPFIND') { arrive.terminer(); await suite.promise } }
    const tirage = b.contexte.actualiser(); await arrive.promise
    try { await expect(b.appliquer(a.token)).rejects.toThrow('opérations des cibles') }
    finally { suite.terminer() }
    await tirage
    const depart = attente(), fin = attente()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'verrous/corpus.lock.json' && init?.method === 'PUT') { depart.terminer(); await fin.promise } }
    const mutation = b.contexte.executerDefinitions(() => b.contexte.store.renommerEntretien('e3', 'Titre'))
    await depart.promise
    try {
      await expect(b.contexte.instantaneRenommageAnon()).rejects.toThrow('Terminez les mutations')
      await expect(b.contexte.fermer()).rejects.toThrow('Attendez')
    } finally { fin.terminer() }
    await mutation
  })
  test('lot partiel relancé : aucune migration ni archivage, reprise fraîche, autres sessions utilisables', async () => {
    const b = await banc(natif); const a = await b.preparer(); const liberer = await b.tenir('e2')
    expect(await b.appliquer(a.token)).toMatchObject({ statut: 'partiel', annotations: 2 })
    await liberer(); await b.contexte.fermer()
    const c = await b.ouvrir()
    await expect(c.ouvrirEntretienPourEdition('e2')).rejects.toThrow('reste à publier')
    await expect(c.executerDefinitions(() => null)).rejects.toThrow('renommage')
    await expect(c.ouvrirEntretienPourEdition('e3')).resolves.toMatchObject({ acces: 'edition' })
    const source = c.store.lireEntretien('e3'); expect(source.ok).toBe(true)
    if (source.ok) {
      source.data.meta.titre = 'Édition indépendante'
      c.exigerEcritureEntretien('e3'); c.store.ecrireEntretien('e3', source.data); c.sessions.noterSale('e3')
      expect(await c.publierEntretien('e3')).toEqual({ ok: true })
    }
    expect(await b.reprendre(c)).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e3.json')!).meta.titre).toBe('Édition indépendante')
    await c.fermerEntretien('e3')
    expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
  })
  test('garde de session installée : choix ancien nouveau refusé, variante actuelle publiable', async () => {
    const b = await banc(natif); await b.contexte.ouvrirEntretienPourEdition('e3')
    expect(await b.appliquer((await b.preparer()).token)).toMatchObject({ statut: 'termine' })
    const fichier = join(b.dirLocal, 'entretiens/e3.json')
    const candidat = JSON.parse(readFileSync(fichier, 'utf8'))
    candidat.annotations = [{ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' }]
    writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e3')
    await expect(b.contexte.publierEntretien('e3')).rejects.toThrow('variante choisie n’est plus déclarée')
    candidat.annotations[0].pseudo = 'Nouvelle'
    writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e3')
    expect(await b.contexte.publierEntretien('e3')).toEqual({ ok: true })
    await b.contexte.fermerEntretien('e3')
  })
  test('transactions courtes et import : les nouveaux choix anciens sont refusés avant tout PUT', async () => {
    const b = await banc(natif); await b.appliquer((await b.preparer()).token)
    const avant = b.puts.length
    await expect(b.contexte.transactions.executerEntretien('e3', () => {
      const source = b.contexte.store.lireEntretien('e3')
      if (source.ok) { source.data.annotations = [{ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' }]; b.contexte.store.ecrireEntretien('e3', source.data) }
    })).rejects.toThrow('variante choisie')
    await expect(b.contexte.transactions.importerEntretien('Import périmé', b.f.sources[0].data)).rejects.toThrow('variante choisie')
    expect(b.puts).toHaveLength(avant)
    const actuel = structuredClone(b.f.sources[0].data)
    for (const a of actuel.annotations) if (a.regle === 'personne' && a.etat !== 'exception' && a.pseudo === 'Claire') a.pseudo = 'Nouvelle'
    expect(await b.contexte.transactions.importerEntretien('Import actuel', actuel)).toHaveProperty('id')
  })
  test('une nouvelle définition apportée par import reste permise, sans remplacer une définition publiée', async () => {
    const b = await banc(natif)
    const data = JSON.parse(JSON.stringify(b.f.sources[0].data).replaceAll('Karine', 'Nadine'))
    data.annotations = [{ ...data.annotations[0], regle: 'nouvelle-regle', pseudo: 'Valide' }]
    const regle = { id: 'nouvelle-regle', entite: ['Nadine'], pseudos: ['Valide'] }
    expect(await b.contexte.transactions.importerEntretien('Nouvelle définition', data, [], [], [regle])).toHaveProperty('id')
    expect(JSON.parse(b.serveur.contenuDe('corpus.json')!).reglesAnon['nouvelle-regle']).toEqual(regle)
  })
  test('sauvegarde incertaine : garde corpus conservée, renommage bloqué, autosave plus récente préservée', async () => {
    const b = await banc(natif); const a = await b.preparer(); await b.contexte.ouvrirEntretienPourEdition('e3')
    const fichier = join(b.dirLocal, 'entretiens/e3.json')
    const candidat = JSON.parse(readFileSync(fichier, 'utf8'))
    candidat.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
    writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e3')
    let perdu = false
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e3.json' && init?.method === 'PUT') { perdu = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (chemin, init) => { if (perdu && chemin === 'entretiens/e3.json' && init?.method === 'GET') throw new Error('relecture perdue') }
    await expect(b.contexte.publierEntretien('e3')).rejects.toThrow()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeTruthy()
    expect(b.contexte.transactions.lirePublicationEntretien()).toMatchObject({ chemin: 'entretiens/e3.json' })
    await expect(b.appliquer(a.token)).rejects.toThrow('publication d’entretien WebDAV reste indéterminée')
    expect(b.puts).toEqual(['entretiens/e3.json'])
    candidat.locuteurs[0].pseudo = 'Autosave ultérieure'
    writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e3')
    b.pieges.apres = async () => {}; b.pieges.avant = async () => {}
    await b.contexte.actualiser()
    expect(JSON.parse(readFileSync(fichier, 'utf8')).locuteurs[0].pseudo).toBe('Autosave ultérieure')
    expect(b.contexte.transactions.lirePublicationEntretien()).toBeNull()
    expect(await b.appliquer((await b.preparer()).token)).toMatchObject({ statut: 'partiel', annotations: 4 })
    expect(await b.contexte.publierEntretien('e3')).toEqual({ ok: true })
    await b.contexte.fermerEntretien('e3')
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 5 })
  })
  test('journal de publication relancé : pas de migration ni reprise de force, confirmation sans PUT rejoué', async () => {
    const b = await banc(natif); let perdu = false
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e3.json' && init?.method === 'PUT') { perdu = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (chemin, init) => { if (perdu && chemin === 'entretiens/e3.json' && init?.method === 'GET') throw new Error('relecture perdue') }
    await expect(b.contexte.transactions.executerEntretien('e3', () => {
      const data = JSON.parse(readFileSync(join(b.dirLocal, 'entretiens/e3.json'), 'utf8'))
      data.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
      writeFileSync(join(b.dirLocal, 'entretiens/e3.json'), JSON.stringify(data))
    })).rejects.toThrow()
    await b.contexte.fermer()
    b.pieges.apres = async () => {}; b.pieges.avant = async () => {}
    const c = await b.ouvrir()
    expect(await c.listerOrphelins()).toEqual([])
    await expect(c.actualiser()).rejects.toThrow('verrou corpus')
    await expect(c.instantaneRenommageAnon()).rejects.toThrow('publication d’entretien')
    expect(b.puts).toEqual(['entretiens/e3.json'])
    const journal = c.transactions.lirePublicationEntretien()!
    expect(b.serveur.contenuDe(journal.chemin)).toBe(journal.contenu)
    // Le contexte d’origine est fermé et l’image acceptée est prouvée ; cette libération reste extérieure.
    const verrou = await b.client.getTexteAvecEtag('verrous/corpus.lock.json')
    await b.client.supprimer('verrous/corpus.lock.json', verrou.etag!)
    await c.actualiser()
    expect(c.transactions.lirePublicationEntretien()).toBeNull()
    expect(c.store.lireEntretien('e3')).toMatchObject({ ok: true, data: { annotations: expect.arrayContaining([expect.objectContaining({ id: 'nouvelle', pseudo: 'Claire' })]) } })
    expect(b.puts).toEqual(['entretiens/e3.json'])
  })
  test('original relu après sauvegarde incertaine : jamais une autorisation de rejeu', async () => {
    const b = await banc(natif); await b.contexte.ouvrirEntretienPourEdition('e3')
    const fichier = join(b.dirLocal, 'entretiens/e3.json')
    const data = JSON.parse(readFileSync(fichier, 'utf8')); data.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
    writeFileSync(fichier, JSON.stringify(data)); b.contexte.sessions.noterSale('e3')
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e3.json' && init?.method === 'PUT') throw new Error('transport inconnu') }
    await expect(b.contexte.publierEntretien('e3')).rejects.toThrow()
    b.pieges.avant = async () => {}
    await expect(b.contexte.actualiser()).rejects.toThrow('publication reste indéterminée')
    expect(b.puts).toEqual([])
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeTruthy()
    // Le serveur mémoire simule enfin l’arrivée tardive du PUT, uniquement pour terminer la fixture.
    const j = b.contexte.transactions.lirePublicationEntretien()!
    b.serveur.poser(j.chemin, j.contenu)
    await b.contexte.actualiser(); await b.contexte.fermerEntretien('e3')
    expect(b.puts).toEqual([])
  })
  test('reprise d’une session orpheline : ancien nouveau choix refusé, verrou conservé puis correction publiable', async () => {
    const b = await banc(natif); await b.appliquer((await b.preparer()).token)
    const identite = () => ({ userId: 'max', machineId: 'poste-renommage', sessionId: 'session-arretee' })
    const provider = natif ? new ProviderFilesLock(b.client, identite) : new ProviderPutConditionnel(b.client, identite)
    const chemin = natif ? 'entretiens/e3.json' : 'verrous/e3.lock.json'
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    if (natif) {
      mkdirSync(join(b.dirLocal, 'sessions'), { recursive: true })
      writeFileSync(join(b.dirLocal, 'sessions/.verrous-natifs.json'), JSON.stringify({ e3: new Date().toISOString() }))
    }
    const candidat = structuredClone(b.f.sources[2].data)
    candidat.annotations = [{ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' }]
    writeFileSync(join(b.dirLocal, 'entretiens/e3.json'), JSON.stringify(candidat))
    await expect(b.contexte.reprendreOrphelin(chemin)).rejects.toThrow('variante choisie n’est plus déclarée')
    expect(await provider.etat(chemin)).not.toBeNull()
    candidat.annotations[0].pseudo = 'Nouvelle'
    writeFileSync(join(b.dirLocal, 'entretiens/e3.json'), JSON.stringify(candidat))
    expect(await b.contexte.reprendreOrphelin(chemin)).toEqual({ ok: true })
    expect(await provider.etat(chemin)).toBeNull()
  })
  if (!natif) test('un bail rename sans journal n’est jamais récupéré comme une session', async () => {
    const b = await banc(natif)
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-renommage', sessionId: 'rename-arret' }))
    expect((await provider.acquerir('verrous/e1.lock.json')).ok).toBe(true)
    expect(await b.contexte.listerOrphelins()).toEqual([])
    await expect(b.contexte.reprendreOrphelin('verrous/e1.lock.json')).rejects.toThrow('ne correspond pas')
    await expect(b.contexte.abandonnerOrphelin('verrous/e1.lock.json')).rejects.toThrow('ne correspond pas')
    expect(await provider.etat('verrous/e1.lock.json')).not.toBeNull()
    await provider.liberer('verrous/e1.lock.json')
  })
})
