import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { JournalSessionsGitLab } from '../../src/main/gitlab/journalSession'
import { ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import type { MiroirDistant } from '../../src/main/distant/miroir'
import { configuration, configurationPresente, contenuDe, creerRacine, definirPrefixeBanc, lireFichier, nettoyer, ouvrirSession, pile, type Pile } from './qualificationBanc'
import { fixtureLocuteursDistants } from '../fixtures/locuteursDistants'

const reference = { entretienId: 'A', participationId: 'local' }
definirPrefixeBanc('locuteurs-session')
const decrire = configurationPresente ? describe : describe.skip
function contexte(p: Pile) {
  const journalSessions = new JournalSessionsGitLab('qualification-session', join(p.dossier, 'sessions-privees'))
  const sessions = new Map<string, SessionGitLab>()
  const c = new ContexteGitLab('qualification-session', p.store, { dirLocal: p.dossier } as MiroirDistant, (ressource, cheminRelatif) => {
    const cheminDistant = `${p.racine}/${cheminRelatif}`
    const session = new SessionGitLab({ id: 'qualification-session', ressource, cheminRelatif, cheminDistant, ressourcePartagee: cleRessourceBailGitLab('main', cheminDistant),
      branche: 'main', depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, journalSessions,
      reconciliateur: new ReconciliateurPublicationGitLab(p.depot, p.journal), stockageLocal: new StockageLocalEntretienGitLab(p.dossier, cheminRelatif) })
    sessions.set(cheminRelatif, session); return session
  }, p.transactions)
  return { c, sessions, journalSessions }
}
async function deposer(p: Pile, f: ReturnType<typeof fixtureLocuteursDistants>) {
  await p.depot.publierCommit('main', 'Qualification : entretiens de locuteurs', f.sources().map((s) => ({ action: 'create', file_path: `${p.racine}/entretiens/${s.id}.json`, content: s.contenu })))
}

decrire('locuteurs depuis une session sur GitLab réel', () => {
  it.each(['retrait', 'absente'] as const)('régulariser explicitement une association %s conserve les données et ne restaure pas le groupe', { timeout: 120_000 }, async (invalidite) => {
    const f = fixtureLocuteursDistants(), cible = f.entretiens[0].data.participations[0]
    cible.locuteurRef = invalidite === 'absente' ? 'disparu' : null
    if (invalidite === 'retrait') cible.associationRetiree = true
    const racine = await creerRacine(`regulariser-${invalidite}`, { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'regulariser', corpusLocal: f.corpus }), b = contexte(alice)
    try {
      await deposer(alice, f); await b.c.ouvrirEntretienPourEdition('A')
      const regulariser = { locuteurRef: cible.locuteurRef, associationRetiree: !!cible.associationRetiree }
      const apres = await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A', regulariser })
      const { associationRetiree: _retrait, ...initial } = cible
      expect(apres.participations).toEqual([{ ...initial, locuteurRef: expect.any(String) }])
      expect(apres.participations[0].locuteurRef).not.toBe('a')
      expect(apres.corpsTexte).toEqual(f.entretiens[0].data.corpsTexte)
      expect(apres.notes).toEqual(f.entretiens[0].data.notes)
      expect((await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A', regulariser })).participations[0].locuteurRef).toBe(apres.participations[0].locuteurRef)
      expect(alice.commitsEnvoyes.filter((c) => c.message.includes('locuteurs-'))).toHaveLength(1)
    } finally { await b.c.fermerEntretien('A').catch(() => {}); nettoyer(alice) }
  })

  it('nommage et rapprochement : les éditions sans rapport restent ouvertes et la saisie continue', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(); f.entretiens[0].data.participations[0].locuteurRef = null
    const racine = await creerRacine('nommage', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'nommage', corpusLocal: f.corpus })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'nommage-bob' })
    const autrePoste = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'nommage-autre-poste' })
    const b = contexte(alice)
    try {
      await deposer(alice, f); await b.c.ouvrirEntretienPourEdition('A')
      const droit = b.sessions.get('entretiens/A.json')!.droit()!, generation = alice.coordination.snapshot(droit).generation
      const tenue = ouvrirSession(bob, `${racine}/entretiens/B.json`, 'B')
      let id: string
      try {
        expect((await tenue.ouvrir()).etat).toBe('edition')
        const a = await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })
        id = a.participations[0].locuteurRef!; expect(id).toBeTruthy(); expect(id).not.toBe('a')
      } finally { await tenue.fermer() }
      const propre = ouvrirSession(autrePoste, `${racine}/entretiens/B.json`, 'B')
      try {
        expect((await propre.ouvrir()).etat).toBe('edition')
        const r = alice.store.lireEntretien('A'); if (!r.ok) throw new Error('Entretien absent')
        r.data.participations.push({ id: 'nouvelle', index: 8, nom: 'X', locuteurRef: null, valeursLoc: {} })
        alice.store.ecrireEntretien('A', r.data); await b.c.marquerSessionSale(b.c.ressourceEntretien('A'))
        const second = await b.c.identifierParticipationAuNommage({ entretienId: 'A', participationId: 'nouvelle', nom: 'X' })
        expect(second.participations[1].locuteurRef).toBeTruthy(); expect(second.participations[1].locuteurRef).not.toBe(id!)
        const inventaire = await b.c.inventaireLocuteursDepuisEntretien(reference)
        await expect(b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire) })).resolves.toHaveProperty('participations.0.locuteurRef', 'b')
      } finally { await propre.fermer() }
      const inventaire = await b.c.inventaireLocuteursDepuisEntretien(reference)
      const avant = alice.store.lireEntretien('A'); if (!avant.ok) throw new Error('Entretien absent')
      const apres = await b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire), reprise: { pseudo: true, variables: [], remplacer: true } })
      expect(apres).toEqual({ ...avant.data, lastModified: expect.any(String), participations: [{ ...avant.data.participations[0], locuteurRef: 'b', pseudo: 'Pseudo C', pseudoEtat: 'confirme' }, avant.data.participations[1]] })
      expect(alice.store.ouvrir().locuteurs[id!]).toBeUndefined()
      expect(alice.coordination.snapshot(droit).generation).toBe(generation)
      const suite = alice.store.lireEntretien('A'); if (!suite.ok) throw new Error('Entretien absent')
      suite.data.notes![0].corps = 'Saisie après rapprochement'
      alice.store.ecrireEntretien('A', suite.data); await b.c.marquerSessionSale(b.c.ressourceEntretien('A'))
      expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
      const serveur = JSON.parse(contenuDe(await lireFichier(`${racine}/entretiens/A.json`, configuration.token1 as string)))
      expect(serveur.notes[0].corps).toBe('Saisie après rapprochement'); expect(serveur.participations[0].locuteurRef).toBe('b')
    } finally { await b.c.fermerEntretien('A').catch(() => {}); nettoyer(alice, bob, autrePoste) }
  })

  it('nommage et rapprochement : réponses perdues reconnues sans nouvelle identité ni rejeu de réunion', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(); f.entretiens[0].data.participations[0].locuteurRef = null
    const racine = await creerRacine('nommage-reprise', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'nommage-reprise', corpusLocal: f.corpus }), b = contexte(alice)
    try {
      await deposer(alice, f); await b.c.ouvrirEntretienPourEdition('A')
      alice.perdreReponseDuCommitDeDonnees(async (p) => p.rendreHistoriqueIndisponible())
      await expect(b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).rejects.toThrow()
      const id = JSON.parse(contenuDe(await lireFichier(`${racine}/entretiens/A.json`, configuration.token1 as string))).participations[0].locuteurRef
      expect(id).toBeTruthy(); alice.rendreHistorique()
      expect(await b.c.fermerEntretien('A')).toEqual({ fermee: true }); await b.c.ouvrirEntretienPourEdition('A')
      expect((await b.c.identifierParticipationAuNommage({ ...reference, nom: 'Alice A' })).participations[0].locuteurRef).toBe(id)
      expect(alice.commitsEnvoyes.filter((c) => c.message.includes('locuteurs-'))).toHaveLength(1)
      const inventaire = await b.c.inventaireLocuteursDepuisEntretien(reference)
      alice.perdreReponseDuCommitDeDonnees(async (p) => p.rendreHistoriqueIndisponible())
      await expect(b.c.rapprocherLocuteurDepuisEntretien({ ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: JSON.stringify(inventaire) })).rejects.toThrow()
      alice.rendreHistorique(); expect(await b.c.fermerEntretien('A')).toEqual({ fermee: true })
      const relu = await b.c.ouvrirEntretienPourEdition('A')
      expect(relu.ok && relu.acces).toBe('edition'); expect(relu.ok && relu.data.participations[0].locuteurRef).toBe('b')
      expect(alice.commitsEnvoyes.filter((c) => c.message.includes('locuteurs-'))).toHaveLength(2)
      expect(JSON.parse(contenuDe(await lireFichier(`${racine}/corpus.crp`, configuration.token1 as string))).locuteurs[id]).toBeUndefined()
    } finally { alice.rendreHistorique(); await b.c.fermerEntretien('A').catch(() => {}); nettoyer(alice) }
  })

  it('refuse les autres postes, conserve notre droit puis publie les saisies suivantes sur la nouvelle base', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(), racine = await creerRacine('droits', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'edition', corpusLocal: f.corpus })
    const bob = pile({ racine, jeton: configuration.token2 as string, userId: 'user2', sessionId: 'autre-compte' })
    const autrePoste = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'autre-poste' })
    const b = contexte(alice)
    try {
      await deposer(alice, f); await b.c.ouvrirEntretienPourEdition('A')
      const courant = alice.store.lireEntretien('A'); if (!courant.ok) throw new Error('Entretien absent')
      courant.data.participations[0].pseudo = 'Saisie locale conservée'
      alice.store.ecrireEntretien('A', courant.data); await b.c.marquerSessionSale(b.c.ressourceEntretien('A'))
      const inventaire = await b.c.apercuRenommageLocuteurDepuisEntretien(reference)
      const commande = { type: 'renommerGlobal' as const, locuteurId: 'a', nom: 'Alice en session', attendu: JSON.stringify(inventaire) }
      const droit = b.sessions.get('entretiens/A.json')!.droit()!, generation = alice.coordination.snapshot(droit).generation
      for (const p of [bob, autrePoste]) {
        const tenue = ouvrirSession(p, `${racine}/entretiens/B.json`, 'B')
        try {
          expect((await tenue.ouvrir()).etat).toBe('edition')
          await expect(b.c.renommerLocuteurDepuisEntretien(reference, commande)).rejects.toThrow(/en cours de modification|est retenu/)
          expect(alice.coordination.snapshot(droit).generation).toBe(generation)
        } finally { await tenue.fermer() }
      }
      const avant = alice.store.lireEntretien('A'); if (!avant.ok) throw new Error('Copie absente')
      const apres = await b.c.renommerLocuteurDepuisEntretien(reference, commande)
      expect(apres).toEqual({ ...avant.data, lastModified: expect.any(String), participations: [{ ...avant.data.participations[0], nom: 'Alice en session' }] })
      expect(b.sessions.get('entretiens/A.json')!.droit()).toBe(droit)
      expect(alice.coordination.snapshot(droit).generation).toBe(generation)
      const suite = alice.store.lireEntretien('A'); if (!suite.ok) throw new Error('Copie absente')
      suite.data.notes![0].corps = 'Note après renommage'
      alice.store.ecrireEntretien('A', suite.data); await b.c.marquerSessionSale(b.c.ressourceEntretien('A'))
      expect(await b.c.publierEntretien('A')).toEqual({ ok: true })
      const distant = JSON.parse(contenuDe(await lireFichier(`${racine}/entretiens/A.json`, configuration.token1 as string)))
      expect(distant.notes[0].corps).toBe('Note après renommage'); expect(distant.participations[0].nom).toBe('Alice en session')
      expect(distant.participations[0].pseudo).toBe('Saisie locale conservée')
    } finally { await b.c.fermerEntretien('A').catch(() => {}); nettoyer(alice, bob, autrePoste) }
  })

  it('une réponse inconnue est reconnue à la fermeture sans renvoi puis la session rouvre sur les noms acceptés', { timeout: 120_000 }, async () => {
    const f = fixtureLocuteursDistants(), racine = await creerRacine('reprise', { corpus: f.corpus })
    const alice = pile({ racine, jeton: configuration.token1 as string, userId: 'user1', sessionId: 'reprise', corpusLocal: f.corpus }), b = contexte(alice)
    try {
      await deposer(alice, f); await b.c.ouvrirEntretienPourEdition('A')
      const inventaire = await b.c.apercuRenommageLocuteurDepuisEntretien(reference)
      alice.perdreReponseDuCommitDeDonnees(async (p) => p.rendreHistoriqueIndisponible())
      await expect(b.c.renommerLocuteurDepuisEntretien(reference, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Alice reconnue', attendu: JSON.stringify(inventaire) })).rejects.toThrow()
      expect(b.sessions.get('entretiens/A.json')!.etat().etat).toBe('degrade')
      const envois = alice.commitsEnvoyes.filter((c) => c.message.includes('locuteurs-')).length
      expect(envois).toBe(1)
      await expect(b.c.fermerEntretien('A')).resolves.toMatchObject({ fermee: false })
      alice.rendreHistorique()
      await expect(b.c.fermerEntretien('A')).resolves.toEqual({ fermee: true })
      const relu = await b.c.ouvrirEntretienPourEdition('A')
      expect(relu.ok && relu.acces).toBe('edition'); expect(relu.ok && relu.data.participations[0].nom).toBe('Alice reconnue')
      expect(alice.commitsEnvoyes.filter((c) => c.message.includes('locuteurs-'))).toHaveLength(envois)
    } finally { alice.rendreHistorique(); await b.c.fermerEntretien('A').catch(() => {}); nettoyer(alice) }
  })
})
