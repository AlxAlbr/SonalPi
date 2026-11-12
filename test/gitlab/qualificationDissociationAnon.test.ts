import { describe, expect, it } from 'vitest'
import { DissociationsAnonGitLab } from '../../src/main/gitlab/dissociationsAnon'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'
import { configuration, configurationPresente, definirPrefixeBanc, creerRacine, pile, nettoyer, ouvrirSession, nouveauDepot, type Pile } from './qualificationBanc'
const decrire = configurationPresente ? describe : describe.skip
definirPrefixeBanc('dissociation-moteur')
const donnees = (p: Pile) => p.commitsEnvoyes.filter((c) => c.message.startsWith('Sonal dissociation-'))
async function banc(suffixe: string, fetchImpl?: typeof fetch) {
  const f = fixtureDissociationAnon()
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const racine = await creerRacine(suffixe, { corpus: f.corpus })
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `dissociation-${suffixe}`, destinationId: 'qualification', corpusLocal: f.corpus, fetchImpl })
  await p.depot.publierCommit('main', 'qualification dissociation : sources synthétiques', f.sources.map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: JSON.stringify(s.data) })))
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'qualification', compteId: 'user1', projetId: Number(configuration.projetId), nomProjet: 'Qualification', branche: 'main', racine },
    store: p.store, depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, file: new FileOperationsContexte() }
  const s = new DissociationsAnonGitLab(options, () => [])
  const a = await s.preparer(f.demande)
  const lire = async (id: string) => JSON.parse((await p.depot.lireFichier(`${racine}/entretiens/${id}.json`, 'main'))!.contenu)
  const corpus = async () => JSON.parse((await p.depot.lireFichier(`${racine}/corpus.crp`, 'main'))!.contenu)
  const reprise = async (service = s) => service.appliquer((await service.preparerReprise(service.lireSuivi()!.operationId)).token, true)
  return { f, p, s, a, options, lire, corpus, reprise }
}

/** Ces racines synthétiques sont conservées pour examiner les commits du protocole. */
decrire('dissociation GitLab — qualification du moteur à deux comptes', () => {
  it('barrière puis transferts complets, retrait final ; quatre commits bornés', { timeout: 120_000 }, async () => {
    const { f, p, s, a, lire, corpus } = await banc('nominal')
    try {
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'termine', annotations: 8, definitionsLocales: 2, entretiens: 2 })
      expect(donnees(p).map((c) => c.actions)).toEqual([2, 3, 3, 4])
      expect((await corpus()).reglesAnon.personne).toBeUndefined(); expect((await corpus()).dissociationAnon).toBeUndefined()
      for (const source of f.sources) {
        const apres = await lire(source.id), attendu = structuredClone(source.data)
        if (source.id !== 'e3') {
          attendu.lastModified = apres.lastModified
          attendu.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
          for (const a of attendu.annotations) if (a.regle === 'personne') delete a.regle
        }
        expect(apres).toEqual(attendu)
      }
    } finally { nettoyer(p) }
  })
  it('cible tenue par le second compte : succès acquis, ancien lien refusé, reprise après fermeture', { timeout: 180_000 }, async () => {
    const { f, p, s, a, reprise, corpus } = await banc('cible-tenue')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'dissociation-bob-e2' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      const candidat = structuredClone(f.sources[1].data); candidat.locuteurs[0].pseudo = 'Édition concurrente'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect(await session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' })
      expect(await session.fermer()).toMatchObject({ fermee: false })
      // Le banc abandonne son édition synthétique, pas le bail d’un autre poste.
      await session.ecrire(JSON.stringify(f.sources[1].data)); await session.marquerSale()
      expect(await session.fermer()).toMatchObject({ fermee: true })
      expect(await reprise()).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(donnees(p).map((c) => c.actions)).toEqual([2, 3, 3, 4])
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it('session non ciblée active : enregistrement conservé ; import lié refusé pendant la barrière', { timeout: 180_000 }, async () => {
    const { f, p, s, a, reprise, lire } = await banc('non-cible')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'dissociation-bob-e3' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e3.json`, 'e3')
    const cible = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition'); await cible.ouvrir()
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel' })
      const candidat = structuredClone(f.sources[2].data); candidat.locuteurs[0].pseudo = 'Choix indépendant'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect((await session.publier()).statut).toBe('confirme')
      const importe = structuredClone(candidat); importe.annotations = [structuredClone(f.sources[0].data.annotations[0])]
      await expect(p.transactions.importerEntretien('Import lié périmé', importe, [], [], [])).rejects.toThrow('dissociation')
      await cible.fermer()
      expect(await reprise()).toMatchObject({ statut: 'termine' })
      expect((await lire('e3')).locuteurs[0].pseudo).toBe('Choix indépendant')
    } finally { await session.fermer(); await cible.fermer(); nettoyer(p, bob) }
  })
  it('nouveau lien direct pendant le transfert : règle gardée, nouvelle préparation explicitement confirmée', { timeout: 180_000 }, async () => {
    const { f, p, s, a, reprise, corpus } = await banc('nouvel-usage')
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.file_path.endsWith('/entretiens/e2.json')), async () => {
        const chemin = `${p.racine}/entretiens/e3.json`, source = (await p.depot.lireFichier(chemin, 'main'))!
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : ajout hors protocole', [{ action: 'update', file_path: chemin, last_commit_id: source.commitId,
          content: JSON.stringify({ ...f.sources[2].data, annotations: [structuredClone(f.sources[0].data.annotations[0])] }) }])
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 8 })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      expect(await reprise()).toMatchObject({ statut: 'termine', annotations: 9, entretiens: 3 })
      expect(donnees(p)).toHaveLength(5)
    } finally { nettoyer(p) }
  })
  it.each(['barriere', 'entretien', 'retrait'])('autorisation perdue à %s : aucun retrait forcé, nouvelle reprise explicite', { timeout: 180_000 }, async (phase) => {
    let refuser = false
    const transport: typeof fetch = async (url, init) => {
      const corps = String(init?.body ?? '')
      if (refuser && init?.method === 'POST' && corps.includes('Sonal dissociation-')) {
        const commit = JSON.parse(corps), a = commit.actions.find((a: { action: string }) => a.action === 'update')
        const data = a?.content ? JSON.parse(a.content) : null
        const concerne = phase === 'entretien' ? a?.file_path.endsWith('/e1.json') : a?.file_path.endsWith('/corpus.crp') && (phase === 'barriere' ? !!data?.dissociationAnon : !data?.reglesAnon?.personne)
        if (concerne) { const headers = new Headers(init.headers); headers.set('PRIVATE-TOKEN', 'qualification-invalide'); return fetch(url, { ...init, headers }) }
      }
      return fetch(url, init)
    }
    const { p, s, a, corpus, reprise } = await banc(`autorisation-${phase}`, transport)
    try {
      refuser = true
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', regleRetiree: false, annotations: phase === 'retrait' ? 8 : phase === 'entretien' ? 4 : 0 })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      refuser = false
      expect(await reprise()).toMatchObject({ statut: 'termine', annotations: 8 })
    } finally { nettoyer(p) }
  })
  it('mémoire acquise changée entre scan final et envoi : garde native refuse le retrait sans restauration', { timeout: 180_000 }, async () => {
    const { p, s, a, corpus, lire } = await banc('course-memoire-finale')
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne), async () => {
        const chemin = `${p.racine}/entretiens/e1.json`, source = (await p.depot.lireFichier(chemin, 'main'))!, data = JSON.parse(source.contenu)
        data.definitionsAnonLocales.pop()
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : mémoire concurrente avant finalisation', [{ action: 'update', file_path: chemin, last_commit_id: source.commitId, content: JSON.stringify(data) }])
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: false })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      expect((await lire('e1')).definitionsAnonLocales).toHaveLength(1)
      await expect(s.preparerReprise(s.lireSuivi()!.operationId)).rejects.toThrow('définition locale acquise')
    } finally { nettoyer(p) }
  })
  it('réouverture du contexte sur un lot partiel : cible exclue, reprise privée consentie', { timeout: 180_000 }, async () => {
    const { p, s, a, options } = await banc('contexte-reouverture')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'dissociation-bob-reouverture' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2'), portees = [...PORTEEES_OVERTES_GITLAB]
    let contexte: Awaited<ReturnType<typeof preparerContexteGitLabLectureSeule>>['contexte'] | undefined
    try {
      await session.ouvrir(); expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel' })
      const preparation = await preparerContexteGitLabLectureSeule({ id: 'qualification', dirLocal: p.dossier, client: p.client, branche: 'main', racine: p.racine,
        creerTransactions: (store, file) => new TransactionsGitLab({ ...options, store, file }) })
      contexte = preparation.contexte
      await expect(contexte.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de dissociation')
      await contexte.actualiser(); expect(contexte.lireSuiviDissociationAnon()?.annotations).toBe(4)
      await session.fermer(); PORTEEES_OVERTES_GITLAB.push('pseudonymisation-dissociation')
      const apercu = await contexte.preparerRepriseDissociationAnon(contexte.lireSuiviDissociationAnon()!.operationId)
      expect(await contexte.dissocierRegleAnon(apercu.token, true)).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(donnees(p)).toHaveLength(4)
    } finally { PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees); await session.fermer(); await contexte?.fermer(); nettoyer(p, bob) }
  })
  it('Actualiser du contexte reconnaît l’envoi accepté et installe la source publiée sans rejeu', { timeout: 180_000 }, async () => {
    const { p, s, a, options } = await banc('contexte-indetermine')
    const portees = [...PORTEEES_OVERTES_GITLAB]
    let contexte: Awaited<ReturnType<typeof preparerContexteGitLabLectureSeule>>['contexte'] | undefined
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.file_path.endsWith('/entretiens/e1.json')), async () => {
        p.rendreHistoriqueIndisponible(); p.perdreReponseDuCommitDeDonnees()
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'indetermine' }); p.rendreHistorique()
      contexte = (await preparerContexteGitLabLectureSeule({ id: 'qualification', dirLocal: p.dossier, client: p.client, branche: 'main', racine: p.racine,
        creerTransactions: (store, file) => new TransactionsGitLab({ ...options, store, file }) })).contexte
      await contexte.actualiser()
      expect(contexte.store.lireEntretien('e1')).toMatchObject({ ok: true, data: { definitionsAnonLocales: expect.arrayContaining([{ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' }]) } })
      expect(donnees(p)).toHaveLength(2)
      PORTEEES_OVERTES_GITLAB.push('pseudonymisation-dissociation')
      const apercu = await contexte.preparerRepriseDissociationAnon(contexte.lireSuiviDissociationAnon()!.operationId)
      expect(await contexte.dissocierRegleAnon(apercu.token, true)).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(donnees(p)).toHaveLength(4)
    } finally { PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees); await contexte?.fermer(); nettoyer(p) }
  })
  it('réponse perdue et historique indisponible : relance reconnaît le transfert sans le republier', { timeout: 180_000 }, async () => {
    const { p, s, a, options, reprise } = await banc('reponse-perdue')
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.file_path.endsWith('/entretiens/e1.json')), async () => {
        p.rendreHistoriqueIndisponible()
        p.perdreReponseDuCommitDeDonnees()
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'indetermine' })
      await expect(s.preparerReprise(s.lireSuivi()!.operationId)).rejects.toThrow('indéterminée')
      p.rendreHistorique()
      const relance = new DissociationsAnonGitLab(options, () => [])
      expect(await reprise(relance)).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(donnees(p)).toHaveLength(4)
    } finally { nettoyer(p) }
  })
})
