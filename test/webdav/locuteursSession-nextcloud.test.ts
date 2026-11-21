import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { preparerContexteNextcloud } from '../../src/main/distant/contexte'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'

const reference = { entretienId: 'A', participationId: 'local' }
async function banc(port: number, sansAssociation = false) {
  const natif = port === 8080, parent = new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/session-locuteurs-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  let perdre = false, putsA = 0
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` }, async (input, init) => {
    const r = await fetch(input, init)
    if (init?.method === 'PUT' && String(input).endsWith('/entretiens/A.json')) {
      putsA++
      if (perdre && r.ok) { perdre = false; await r.body?.cancel(); throw new Error('Réponse perdue après acceptation') }
    }
    return r
  })
  const f = fixtureLocuteursDistants()
  if (sansAssociation) f.entretiens[0].data.participations[0].locuteurRef = null
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  await client.putTexte('corpus.crp', JSON.stringify(f.corpus), { ifNoneMatch: '*' })
  for (const s of f.sources()) await client.putTexte(`entretiens/${s.id}.json`, s.contenu, { ifNoneMatch: '*' })
  const dir = mkdtempSync(join(tmpdir(), 'sonal-session-locuteurs-reel-'))
  const p = await preparerContexteNextcloud({ id: 'destination', dirLocal: dir, client, identite: () => ({ userId: 'max', machineId: 'qualification-session', sessionId: 'session-principale' }), verrouNatif: natif })
  const c = p.contexte
  const lire = () => { const r = c.store.lireEntretien('A'); if (!r.ok) throw new Error('Entretien absent'); return r.data }
  const autre = (tiers: boolean) => {
    const compte = tiers ? 'olivier' : 'max'
    const cl = tiers ? new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } }) : client
    const identite = () => ({ userId: compte, machineId: 'autre-poste', sessionId: randomUUID() })
    const provider = natif ? new ProviderFilesLock(cl, identite) : new ProviderPutConditionnel(cl, identite)
    return { provider, chemin: natif ? 'entretiens/B.json' : 'verrous/B.lock.json' }
  }
  return { c, client, lire, autre, perdre: () => { perdre = true }, putsA: () => putsA,
    nettoyer: async () => { await c.fermer().catch(() => {}); await parent.supprimer(dossier).catch(() => {}); rmSync(dir, { recursive: true, force: true }) } }
}

for (const port of [8080, 8081]) {
  const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`locuteurs depuis une session Nextcloud réel :${port}`, () => {
    test('renommer, créer malgré une autre édition, réunir puis continuer les saisies sans changer de droit', { timeout: 180_000 }, async () => {
      const b = await banc(port)
      try {
        await b.c.ouvrirEntretienPourEdition('A')
        const courant = b.lire(); courant.notes![0].corps = 'Saisie récente'; b.c.store.ecrireEntretien('A', courant); b.c.sessions.noterSale('A')
        const inventaire = await b.c.apercuRenommageLocuteurDepuisEntretien(reference)
        expect(JSON.parse(await b.client.getTexte('entretiens/A.json')).notes[0].corps).not.toBe('Saisie récente')
        for (const tiers of [true, false]) {
          const autre = b.autre(tiers)
          try {
            expect((await autre.provider.acquerir(autre.chemin)).ok).toBe(true)
            await expect(b.c.renommerLocuteurDepuisEntretien(reference, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Alice en session', attendu: JSON.stringify(inventaire) })).rejects.toThrow('en cours de modification')
            expect(b.c.sessions.etat('A').etat).toBe('a-nous')
          } finally { await autre.provider.liberer(autre.chemin) }
        }
        const apres = await b.c.renommerLocuteurDepuisEntretien(reference, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Alice en session', attendu: JSON.stringify(inventaire) })
        expect(apres.notes![0].corps).toBe('Saisie récente'); expect(apres.participations[0].nom).toBe('Alice en session')
        const autre = b.autre(false), seconde = { entretienId: 'A', participationId: 'nouvelle' }
        let id: string
        try {
          expect((await autre.provider.acquerir(autre.chemin)).ok).toBe(true)
          const data = b.lire(); data.participations.push({ id: 'nouvelle', index: 8, nom: 'Bob', locuteurRef: null, valeursLoc: {} })
          b.c.store.ecrireEntretien('A', data); b.c.sessions.noterSale('A')
          const cree = await b.c.identifierParticipationAuNommage({ ...seconde, nom: 'Bob' }); id = cree.participations[1].locuteurRef!
          expect(id).toBeTruthy(); expect(id).not.toBe('b')
          const sources = await b.c.inventaireLocuteursDepuisEntretien(seconde)
          await expect(b.c.rapprocherLocuteurDepuisEntretien({ ...seconde, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(sources) })).rejects.toThrow('en cours de modification')
        } finally { await autre.provider.liberer(autre.chemin) }
        const sources = await b.c.inventaireLocuteursDepuisEntretien(seconde), avant = b.lire()
        const reuni = await b.c.rapprocherLocuteurDepuisEntretien({ ...seconde, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(sources) })
        expect(reuni.participations).toEqual([avant.participations[0], { ...avant.participations[1], locuteurRef: 'b' }])
        expect(b.c.store.ouvrir().locuteurs[id!]).toBeUndefined()
        const suite = b.lire(); suite.notes![0].corps = 'Après rapprochement'; b.c.store.ecrireEntretien('A', suite); b.c.sessions.noterSale('A')
        expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
        expect(JSON.parse(await b.client.getTexte('entretiens/A.json')).notes[0].corps).toBe('Après rapprochement')
        expect(b.c.sessions.etat('A').etat).toBe('a-nous')
        await b.c.fermerEntretien('A')
      } finally { await b.nettoyer() }
    })

    test('réponses inconnues : fermeture sans ancien payload, reconnaissance puis reprise sans doublon', { timeout: 180_000 }, async () => {
      const b = await banc(port, true)
      try {
        await b.c.ouvrirEntretienPourEdition('A'); b.perdre()
        const avant = b.putsA()
        await expect(b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow('doit être vérifié')
        const id = JSON.parse(await b.client.getTexte('entretiens/A.json')).participations[0].locuteurRef
        expect(await b.c.fermerEntretien('A')).toEqual({ fermee: true })
        let suivi = b.c.lireSuiviCorrectionLocuteurs()!
        await b.c.reconcilierCorrectionLocuteurs(suivi.operationId); await b.c.reprendreCorrectionLocuteurs(suivi.operationId)
        expect(b.putsA()).toBe(avant + 1)
        await b.c.ouvrirEntretienPourEdition('A')
        expect((await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).participations[0].locuteurRef).toBe(id)
        const sources = await b.c.inventaireLocuteursDepuisEntretien(reference); b.perdre()
        await expect(b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(sources) })).rejects.toThrow('doit être vérifié')
        expect(await b.c.fermerEntretien('A')).toEqual({ fermee: true })
        suivi = b.c.lireSuiviCorrectionLocuteurs()!
        await b.c.reconcilierCorrectionLocuteurs(suivi.operationId); if (b.c.lireSuiviCorrectionLocuteurs()) await b.c.reprendreCorrectionLocuteurs(suivi.operationId)
        expect(b.putsA()).toBe(avant + 2)
        const r = await b.c.ouvrirEntretienPourEdition('A')
        expect(r.ok && r.acces).toBe('edition'); expect(r.ok && r.data.participations[0].locuteurRef).toBe('b')
        await b.c.fermerEntretien('A')
      } finally { await b.nettoyer() }
    })
  })
}
