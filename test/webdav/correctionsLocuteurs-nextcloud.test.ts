import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { CorpusStore } from '../../src/main/corpusStore'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'

async function banc(port: number, avecTiers = false) {
  const base = `http://localhost:${port}`, natif = port === 8080
  const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/locuteurs-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  let perte = false, perdu = false, putsA = 0, finalisationBloquee = false, finalisationRetardee = false, entretienRetarde = false
  let requeteRetardee: Request | undefined
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` }, async (input, init) => {
    const req = new Request(input, init)
    if (entretienRetarde && req.method === 'PUT' && new URL(req.url).pathname.endsWith('/entretiens/A.json')) {
      entretienRetarde = false; requeteRetardee = new Request(req, { signal: new AbortController().signal })
      throw new Error('Coupure avant l’envoi de l’entretien')
    }
    if (finalisationRetardee && req.method === 'PUT' && new URL(req.url).pathname.endsWith('/corpus.crp') && !JSON.parse(await req.clone().text()).locuteurs.b) {
      requeteRetardee = new Request(req, { signal: new AbortController().signal })
      throw new Error('Réponse inconnue, requête toujours en cours sur le serveur')
    }
    if (finalisationBloquee && req.method === 'PUT' && new URL(req.url).pathname.endsWith('/corpus.crp') && !JSON.parse(await req.clone().text()).locuteurs.b) return new Response('Refus de finalisation', { status: 412 })
    const reponse = await fetch(input, init)
    if (req.method === 'PUT' && new URL(req.url).pathname.endsWith('/entretiens/A.json')) {
      putsA++
      if (perte && !perdu && reponse.ok) { perdu = true; await reponse.text(); throw new Error('Réponse perdue après acceptation') }
    }
    return reponse
  })
  const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
  const f = fixtureLocuteursDistants(), dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-nc-'))
  if (avecTiers) {
    f.corpus.locuteurs.c = { id: 'c', nom: 'Chloé' }
    f.corpus.cas = { suivi: { id: 'suivi', nom: 'Suivi', memo: '', creeLe: '', modifieLe: '', rattachements: [], regles: [{ type: 'locuteur', locuteurId: 'b', inclureEnqueteurs: true }] } }
    const tiers = structuredClone(f.entretiens[2]); tiers.id = 'D'; tiers.titre = 'Entretien D'
    tiers.data.participations[0] = { ...tiers.data.participations[0], locuteurRef: 'c', nom: 'Chloé', rapprochementsRefuses: [{ type: 'locuteur', locuteurId: 'b' }] }
    f.entretiens.push(tiers); f.corpus.membership.D = { ...f.corpus.membership.C, titre: tiers.titre }
  }
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  await client.putTexte('corpus.crp', JSON.stringify(f.corpus), { ifNoneMatch: '*' })
  for (const s of f.sources()) await client.putTexte(`entretiens/${s.id}.json`, s.contenu, { ifNoneMatch: '*' })
  const miroir = new MiroirWebDAV(client, dir); await miroir.tirer()
  const store = new CorpusStore(dir); store.lectureSeule = true
  const identite = { userId: 'max', machineId: 'qualification-locuteurs', sessionId: randomUUID() }
  const recreer = () => new TransactionsCorpus(client, miroir, () => store, () => identite, { verrouNatif: natif })
  const reserve = (userId: string, autreClient: ClientWebDAV) => {
    const id = { userId, machineId: 'autre-poste', sessionId: randomUUID() }
    return natif ? new ProviderFilesLock(autreClient, () => id) : new ProviderPutConditionnel(autreClient, () => id)
  }
  const commande = () => ({ type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice publiée', attendu: f.attendu() })
  return { client, tiers, f, store, tx: recreer(), recreer, reserve, chemin: natif ? 'entretiens/A.json' : 'verrous/A.lock.json', commande,
    retarderFinalisation: () => { finalisationRetardee = true },
    retarderEntretien: () => { entretienRetarde = true },
    envoyerRequeteRetardee: async () => { if (!requeteRetardee) throw new Error('Requête absente'); finalisationRetardee = false; return fetch(requeteRetardee) },
    perdre: () => { perte = true }, bloquerFinalisation: (valeur: boolean) => { finalisationBloquee = valeur }, putsA: () => putsA, nettoyer: async () => { await parent.supprimer(dossier).catch(() => {}); rmSync(dir, { recursive: true, force: true }) } }
}

for (const port of [8080, 8081]) {
  const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`corrections locuteurs Nextcloud réel :${port}`, () => {
    test('refuse les deux comptes et un autre poste du même compte, puis conserve toutes les données au renommage', { timeout: 120_000 }, async () => {
      const b = await banc(port), tiers = b.reserve('olivier', b.tiers), autrePoste = b.reserve('max', b.client)
      try {
        const avant = await b.client.getTexte('corpus.crp')
        for (const reservation of [tiers, autrePoste]) {
          expect((await reservation.acquerir(b.chemin)).ok).toBe(true)
          await expect(b.tx.corrigerLocuteurs(b.commande())).rejects.toThrow('en cours de modification')
          expect(await b.client.getTexte('corpus.crp')).toBe(avant)
          await reservation.liberer(b.chemin)
        }
        await b.tx.corrigerLocuteurs(b.commande())
        for (const e of b.f.entretiens) {
          const apres = JSON.parse(await b.client.getTexte(`entretiens/${e.id}.json`))
          expect(apres).toEqual(e.id === 'C' ? e.data : { ...e.data, lastModified: expect.any(String), participations: [{ ...e.data.participations[0], nom: 'Alice publiée' }] })
        }
        expect(b.tx.lireSuiviCorrectionLocuteurs()).toBeNull()
      } finally { await tiers.liberer(b.chemin).catch(() => {}); await autrePoste.liberer(b.chemin).catch(() => {}); await b.nettoyer() }
    })

    test('réunion : pas de retrait prématuré, reprise de finalisation, cas et refus de tiers conservés', { timeout: 120_000 }, async () => {
      const b = await banc(port, true)
      try {
        b.bloquerFinalisation(true)
        await expect(b.tx.corrigerLocuteurs({ type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Identité commune', uniformiserNoms: false, attendu: b.f.attendu() })).rejects.toThrow()
        expect(JSON.parse(await b.client.getTexte('corpus.crp')).locuteurs.b).toBeDefined()
        expect(JSON.parse(await b.client.getTexte('entretiens/C.json')).participations[0].locuteurRef).toBe('a')
        const suivi = b.tx.lireSuiviCorrectionLocuteurs()!; expect(suivi.etat).toBe('a-reprendre')
        b.bloquerFinalisation(false)
        const repris = b.recreer(); await repris.reprendreCorrectionLocuteurs(suivi.operationId)
        const corpus = JSON.parse(await b.client.getTexte('corpus.crp'))
        expect(corpus.locuteurs.b).toBeUndefined()
        expect(corpus.cas.suivi.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: 'a', inclureEnqueteurs: true }] }])
        expect(JSON.parse(await b.client.getTexte('entretiens/D.json')).participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'a' }])
        const avant = await b.client.getTexte('entretiens/C.json')
        await repris.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: 'vide', attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })
        expect(JSON.parse(await b.client.getTexte('corpus.crp')).locuteurs.vide).toBeUndefined()
        expect(await b.client.getTexte('entretiens/C.json')).toBe(avant)
      } finally { await b.nettoyer() }
    })

    test('requête retardée : protection conservée, neutralisation puis reprise sans acceptation tardive', { timeout: 120_000 }, async () => {
      const b = await banc(port, true), autre = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'autre-poste', sessionId: randomUUID() }))
      try {
        b.retarderFinalisation()
        await expect(b.tx.corrigerLocuteurs({ type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Identité commune', uniformiserNoms: false, attendu: b.f.attendu() })).rejects.toThrow('doit être vérifié')
        const suivi = b.tx.lireSuiviCorrectionLocuteurs()!, repris = b.recreer()
        expect((await autre.acquerir('verrous/corpus.lock.json')).ok).toBe(false)
        await repris.reconcilierCorrectionLocuteurs(suivi.operationId)
        expect(repris.lireSuiviCorrectionLocuteurs()?.etat).toBe('a-reprendre')
        expect(JSON.parse(await b.client.getTexte('corpus.crp')).locuteurs.b).toBeDefined()
        expect((await b.envoyerRequeteRetardee()).status).toBe(412)
        await repris.reprendreCorrectionLocuteurs(suivi.operationId)
        expect(repris.lireSuiviCorrectionLocuteurs()).toBeNull()
        const corpus = JSON.parse(await b.client.getTexte('corpus.crp'))
        expect(corpus.locuteurs.b).toBeUndefined()
        expect(corpus.cas.suivi.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: 'a', inclureEnqueteurs: true }] }])
        expect(JSON.parse(await b.client.getTexte('entretiens/D.json')).participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'a' }])
        expect((await autre.acquerir('verrous/corpus.lock.json')).ok).toBe(true)
        await autre.liberer('verrous/corpus.lock.json')
      } finally { await autre.liberer('verrous/corpus.lock.json').catch(() => {}); await b.nettoyer() }
    })

    test('envoi non accepté : vérifier puis arrêter libère le corpus sans laisser passer une ancienne requête', { timeout: 120_000 }, async () => {
      const b = await banc(port)
      try {
        b.retarderEntretien()
        await expect(b.tx.corrigerLocuteurs(b.commande())).rejects.toThrow('doit être vérifié')
        const suivi = b.tx.lireSuiviCorrectionLocuteurs()!, repris = b.recreer()
        await repris.reconcilierCorrectionLocuteurs(suivi.operationId)
        expect(repris.lireSuiviCorrectionLocuteurs()).toMatchObject({ etat: 'a-reprendre', termines: 0 })
        await repris.arreterCorrectionLocuteurs(suivi.operationId)
        expect(repris.lireSuiviCorrectionLocuteurs()).toBeNull()
        expect((await b.envoyerRequeteRetardee()).status).toBe(412)
        expect(JSON.parse(await b.client.getTexte('entretiens/A.json'))).toEqual(b.f.entretiens[0].data)
        await repris.corrigerLocuteurs(b.commande())
        expect(JSON.parse(await b.client.getTexte('entretiens/A.json')).participations[0].nom).toBe('Alice publiée')
      } finally { await b.nettoyer() }
    })

    test('réponse perdue : reprise du suivi après redémarrage, vérification sans PUT puis fin sans doublon', { timeout: 120_000 }, async () => {
      const b = await banc(port)
      try {
        b.perdre(); const avant = b.putsA()
        await expect(b.tx.corrigerLocuteurs(b.commande())).rejects.toThrow('doit être vérifié')
        const suivi = b.tx.lireSuiviCorrectionLocuteurs()!; expect(suivi.etat).toBe('a-verifier')
        await expect(b.tx.executer(() => b.store.ajouterCategorie('Interdite'))).rejects.toThrow('reste à terminer')
        const repris = b.recreer()
        await repris.reconcilierCorrectionLocuteurs(suivi.operationId)
        expect(b.putsA()).toBe(avant + 1)
        await repris.reprendreCorrectionLocuteurs(suivi.operationId)
        expect(b.putsA()).toBe(avant + 1)
        expect(repris.lireSuiviCorrectionLocuteurs()).toBeNull()
        expect(JSON.parse(await b.client.getTexte('corpus.crp')).locuteurs.a.nom).toBe('Alice publiée')
      } finally { await b.nettoyer() }
    })
  })
}
