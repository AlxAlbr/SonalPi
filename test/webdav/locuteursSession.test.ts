import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import type { EntretienFichier } from '../../src/shared/format'

const dossiers: string[] = [], contextes: ContexteCorpusDistant[] = []
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }))
afterEach(async () => {
  for (const c of contextes.splice(0).reverse()) { await c.sessions.fermerToutes().catch(() => {}); try { c.sessions.dispose() } catch {} }
  vi.clearAllTimers(); vi.useRealTimers()
  dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }))
})
const reference = { entretienId: 'A', participationId: 'local' }
async function banc(natif: boolean, sansAssociation = false, invalidite?: 'retrait' | 'absente') {
  const f = fixtureLocuteursDistants(), serveur = new ServeurWebDAVMemoire()
  if (sansAssociation) f.entretiens[0].data.participations[0].locuteurRef = null
  if (invalidite === 'retrait') f.entretiens[0].data.participations[0].associationRetiree = true
  if (invalidite === 'absente') f.entretiens[0].data.participations[0].locuteurRef = 'disparu'
  serveur.creerDossierRelatif('verrous'); serveur.poser('corpus.crp', JSON.stringify(f.corpus))
  for (const s of f.sources()) serveur.poser(`entretiens/${s.id}.json`, s.contenu)
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-session-nc-')); dossiers.push(dir)
  const requetes: Request[] = []
  let intercepter: (r: Request) => Promise<Response | undefined> = async () => undefined
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (input, init) => {
    const r = new Request(input, init); requetes.push(r); return await intercepter(r) ?? serveur.fetch(input, init)
  })
  const identite = { userId: 'max', machineId: 'poste', sessionId: randomUUID() }
  const ouvrir = async (sessionId = identite.sessionId) => {
    const p = await preparerContexteNextcloud({ id: 'destination', dirLocal: dir, client, identite: () => ({ ...identite, sessionId }), verrouNatif: natif })
    contextes.push(p.contexte); return p.contexte
  }
  const c = await ouvrir()
  const lire = (id = 'A') => { const r = c.store.lireEntretien(id); if (!r.ok) throw new Error('Source absente'); return r.data }
  const sauver = (data: EntretienFichier) => { c.exigerEcritureEntretien('A'); c.store.ecrireEntretien('A', data); c.sessions.noterSale('A') }
  const puts = () => requetes.filter((r) => r.method === 'PUT' && /\/(corpus\.crp|entretiens\/[ABC]\.json)$/.test(new URL(r.url).pathname))
  return { f, serveur, client, dir, c, lire, sauver, ouvrir, identite, requetes, puts, intercepter: (fn: typeof intercepter) => { intercepter = fn } }
}

for (const natif of [false, true]) {
  test(`renommage en session natif=${natif} : aperçu sans publication, droit conservé et nouvelle base pour la saisie suivante`, async () => {
    const b = await banc(natif); await b.c.ouvrirEntretienPourEdition('A')
    const courant = b.lire(); courant.notes![0].corps = 'Note récente'; courant.participations[0].pseudo = 'Pseudo récent'; b.sauver(courant)
    const avant = b.lire(), inventaire = await b.c.apercuRenommageLocuteurDepuisEntretien(reference)
    expect(inventaire.participations.find((p) => p.entretienId === 'A')!.pseudo).toBe('Pseudo récent')
    expect(b.puts()).toHaveLength(0)
    const apres = await b.c.renommerLocuteurDepuisEntretien(reference, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Alice modifiée', attendu: JSON.stringify(inventaire) })
    expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], nom: 'Alice modifiée' }] })
    expect(b.c.sessions.etat('A')).toMatchObject({ etat: 'a-nous', sale: false })
    if (natif) expect(b.serveur.verrouNatifDe('entretiens/A.json')).toBeDefined()
    else expect(JSON.parse(b.serveur.contenuDe('verrous/A.lock.json')!).sessionId).toBe(b.identite.sessionId)
    expect(() => b.sauver(avant)).toThrow('Les noms ont changé')
    const suite = b.lire(); suite.notes![0].corps = 'Note après renommage'; b.sauver(suite)
    expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).notes[0].corps).toBe('Note après renommage')
    expect(b.lire('B').participations[0].nom).toBe('Alice modifiée')
    await b.c.fermerEntretien('A')
  })

  test(`renommage local natif=${natif} : pas de lecture ni de droit sur les autres entretiens, nom commun inchangé`, async () => {
    const b = await banc(natif); await b.c.ouvrirEntretienPourEdition('A'); await b.c.ouvrirEntretienPourEdition('C')
    const id = () => ({ userId: 'max', machineId: 'autre-poste', sessionId: 'autre' })
    const autre = natif ? new ProviderFilesLock(b.client, id) : new ProviderPutConditionnel(b.client, id)
    const chemin = natif ? 'entretiens/B.json' : 'verrous/B.lock.json'
    expect((await autre.acquerir(chemin)).ok).toBe(true)
    const avant = b.lire(), debut = b.requetes.length, demande = { ...reference, locuteurId: 'a', nomAvant: 'Alice A', nom: 'Mme Dupont' }
    const apres = await b.c.renommerParticipationDepuisEntretien(demande)
    expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], nom: 'Mme Dupont' }] })
    expect(b.c.store.ouvrir().locuteurs).toEqual(b.f.corpus.locuteurs)
    expect(b.requetes.slice(debut).some((r) => new URL(r.url).pathname.endsWith('/entretiens/B.json'))).toBe(false)
    expect(b.c.sessions.etat('C').etat).toBe('a-nous')
    expect(() => b.sauver(avant)).toThrow('Les noms ont changé')
    const puts = b.puts().length
    await b.c.renommerParticipationDepuisEntretien(demande)
    expect(b.puts()).toHaveLength(puts)
    const suite = b.lire(); suite.notes![0].corps = 'Après renommage local'; b.sauver(suite)
    expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).participations[0].nom).toBe('Mme Dupont')
    expect(JSON.parse(b.serveur.contenuDe('entretiens/B.json')!)).toEqual(b.f.entretiens[1].data)
    await autre.liberer(chemin); await b.c.fermerEntretien('A'); await b.c.fermerEntretien('C')
  })

  test.each(['nom', 'association'] as const)(`renommage local au %s périmé natif=${natif} : aucune publication des saisies`, async (cas) => {
    const b = await banc(natif); await b.c.ouvrirEntretienPourEdition('A')
    const saisie = b.lire(); saisie.notes![0].corps = 'Encore privé'; b.sauver(saisie)
    await expect(b.c.renommerParticipationDepuisEntretien({ ...reference, locuteurId: cas === 'association' ? 'b' : 'a', nomAvant: cas === 'nom' ? 'Périmé' : 'Alice A', nom: 'Nom local' })).rejects.toThrow('a changé')
    expect(b.puts()).toHaveLength(0)
    expect(b.lire().notes![0].corps).toBe('Encore privé')
    expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!)).toEqual(b.f.entretiens[0].data)
    expect(b.c.sessions.etat('A')).toMatchObject({ etat: 'a-nous', sale: true })
    await b.c.fermerEntretien('A')
  })

  test(`nommage puis rapprochement natif=${natif} : les éditions sans modification restent ouvertes, sans copie implicite`, async () => {
    const b = await banc(natif, true); await b.c.ouvrirEntretienPourEdition('A'); await b.c.ouvrirEntretienPourEdition('B')
    const identiteAutre = () => ({ userId: 'max', machineId: 'autre', sessionId: 'autre' })
    const autre = natif ? new ProviderFilesLock(b.client, identiteAutre) : new ProviderPutConditionnel(b.client, identiteAutre)
    const chemin = natif ? 'entretiens/C.json' : 'verrous/C.lock.json'
    expect((await autre.acquerir(chemin)).ok).toBe(true)
    const avant = b.lire(), cree = await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' }), id = cree.participations[0].locuteurRef!
    expect(id).toBeTruthy(); expect(id).not.toBe('a')
    expect(cree).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], locuteurRef: id }] })
    const nombre = b.puts().length
    expect((await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).participations[0].locuteurRef).toBe(id)
    expect(b.puts()).toHaveLength(nombre)
    const autreLocal = b.lire('B'); autreLocal.notes![0].corps = 'Saisie dans l’autre onglet'
    b.c.store.ecrireEntretien('B', autreLocal); b.c.sessions.noterSale('B')
    const inventaire = await b.c.inventaireLocuteursDepuisEntretien(reference)
    const reuni = await b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire) })
    expect(b.c.sessions.etat('A').etat).toBe('a-nous')
    await autre.liberer(chemin)
    expect(reuni.participations[0]).toEqual({ ...cree.participations[0], locuteurRef: 'b' })
    expect(b.c.store.ouvrir().locuteurs[id]).toBeUndefined()
    expect(b.lire('B').notes![0].corps).toBe('Saisie dans l’autre onglet')
    expect(b.c.sessions.etat('B').etat).toBe('a-nous')
    await b.c.fermerEntretien('B')
    const suite = b.lire(); suite.notes![0].corps = 'Après réunion'; b.sauver(suite)
    expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
    await b.c.fermerEntretien('A')
  })

  test.each(['retrait', 'absente'] as const)(`régularisation explicite %s natif=${natif} : références et données conservées, répétition sans doublon`, async (invalidite) => {
    const b = await banc(natif, true, invalidite); await b.c.ouvrirEntretienPourEdition('A')
    const avant = b.lire(), regulariser = { locuteurRef: avant.participations[0].locuteurRef, associationRetiree: !!avant.participations[0].associationRetiree }
    await expect(b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
    const apres = await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A', regulariser })
    const { associationRetiree: _retrait, ...initial } = avant.participations[0]
    expect(apres.participations).toEqual([{ ...initial, locuteurRef: expect.any(String) }])
    expect(apres.participations[0].locuteurRef).not.toBe('a')
    expect(apres.corpsTexte).toEqual(avant.corpsTexte); expect(apres.notes).toEqual(avant.notes)
    const nombre = b.puts().length
    expect((await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A', regulariser })).participations[0].locuteurRef).toBe(apres.participations[0].locuteurRef)
    expect(b.puts()).toHaveLength(nombre)
    await b.c.fermerEntretien('A')
  })

  for (const geste of ['renommer', 'identifier', 'rapprocher', 'nomLocal'] as const) test(`réponse perdue ${geste} natif=${natif} : fermer sans réenregistrer l’ancien payload, puis reconnaître et reprendre`, async () => {
    const b = await banc(natif, geste === 'identifier'); await b.c.ouvrirEntretienPourEdition('A')
    const avant = b.lire(), inventaire = await b.c.inventaireLocuteursDepuisEntretien(reference)
    let perdu = false
    b.intercepter(async (r) => {
      if (!perdu && r.method === 'PUT' && new URL(r.url).pathname.endsWith('/entretiens/A.json')) {
        perdu = true; await b.serveur.fetch(r.clone()); throw new Error('Réponse perdue')
      }
      return undefined
    })
    const operation = geste === 'renommer' ? b.c.renommerLocuteurDepuisEntretien(reference, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Après', attendu: JSON.stringify(inventaire) })
      : geste === 'identifier' ? b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })
        : geste === 'nomLocal' ? b.c.renommerParticipationDepuisEntretien({ ...reference, locuteurId: 'a', nomAvant: 'Alice A', nom: 'Mme Dupont' })
        : b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire) })
    await expect(operation).rejects.toThrow('doit être vérifié')
    expect(b.c.sessions.etat('A').etat).toBe('degrade')
    expect(b.c.sessions.preserverRecuperation('A', (({ formatVersion: _v, lastModified: _d, ...p }) => p)(avant))).toBe(true)
    expect(() => b.sauver(avant)).toThrow()
    await expect(b.c.fermerEntretien('A')).resolves.toEqual({ fermee: true })
    const suivi = b.c.lireSuiviCorrectionLocuteurs()!
    await b.c.reconcilierCorrectionLocuteurs(suivi.operationId)
    if (b.c.lireSuiviCorrectionLocuteurs()) await b.c.reprendreCorrectionLocuteurs(suivi.operationId)
    expect(b.puts().filter((r) => new URL(r.url).pathname.endsWith('/entretiens/A.json'))).toHaveLength(1)
    const r = await b.c.ouvrirEntretienPourEdition('A')
    expect(r.ok && r.acces).toBe('edition')
    expect(r.ok && r.data.corpsTexte).toEqual(avant.corpsTexte)
    expect(r.ok && r.data.notes).toEqual(avant.notes)
    await b.c.fermerEntretien('A')
  })

  test(`recréation après coupure natif=${natif} : ne republie pas la copie ancienne et ne force aucun droit natif`, async () => {
    const b = await banc(natif, true); await b.c.ouvrirEntretienPourEdition('A')
    let perdu = false
    b.intercepter(async (r) => {
      if (!perdu && r.method === 'PUT' && new URL(r.url).pathname.endsWith('/entretiens/A.json')) { perdu = true; await b.serveur.fetch(r.clone()); throw new Error('Coupure') }
      return undefined
    })
    await expect(b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
    vi.clearAllTimers()
    const c = await b.ouvrir(randomUUID()), suivi = c.lireSuiviCorrectionLocuteurs()!
    expect(c.sessions.idsRecuperablesLocalement()).toEqual([])
    if (natif) {
      await expect(c.reconcilierCorrectionLocuteurs(suivi.operationId)).rejects.toThrow('en cours de modification')
      expect(b.serveur.verrouNatifDe('entretiens/A.json')).toBeDefined()
      b.serveur.oterVerrouDirect('entretiens/A.json')
    } else await c.reconcilierCorrectionLocuteurs(suivi.operationId)
    await c.reprendreCorrectionLocuteurs(suivi.operationId)
    const r = await c.ouvrirEntretienPourEdition('A')
    expect(r.ok && r.data.participations[0].locuteurRef).toBeTruthy()
    expect(b.puts().filter((r) => new URL(r.url).pathname.endsWith('/entretiens/A.json'))).toHaveLength(1)
    await c.fermerEntretien('A')
  })
}

test('après une correction terminée, les nouvelles saisies non publiées gardent leur récupération ordinaire', async () => {
  const b = await banc(false, true); await b.c.ouvrirEntretienPourEdition('A')
  await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })
  const data = b.lire(); data.notes![0].corps = 'Nouvelles saisies non publiées'; b.sauver(data)
  vi.clearAllTimers()
  const c = await b.ouvrir(randomUUID())
  expect(c.sessions.idsRecuperablesLocalement()).toEqual(['A'])
  expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/A.json'), 'utf8')).notes[0].corps).toBe('Nouvelles saisies non publiées')
  expect(JSON.parse(b.serveur.contenuDe('entretiens/A.json')!).notes[0].corps).not.toBe('Nouvelles saisies non publiées')
})

test('une copie modifiée après la coupure reste protégée et empêche une reprise automatique', async () => {
  const b = await banc(false, true); await b.c.ouvrirEntretienPourEdition('A')
  let perdu = false
  b.intercepter(async (r) => { if (!perdu && r.method === 'PUT' && new URL(r.url).pathname.endsWith('/entretiens/A.json')) { perdu = true; await b.serveur.fetch(r.clone()); throw new Error('Coupure') } return undefined })
  await expect(b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
  vi.clearAllTimers()
  const fichier = join(b.dir, 'entretiens/A.json'), data = JSON.parse(readFileSync(fichier, 'utf8'))
  data.notes[0].corps = 'Saisie non publiée'; writeFileSync(fichier, JSON.stringify(data))
  await expect(b.ouvrir(randomUUID())).rejects.toThrow('saisies locales restent à préserver')
  expect(JSON.parse(readFileSync(fichier, 'utf8')).notes[0].corps).toBe('Saisie non publiée')
})
