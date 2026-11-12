import { describe, expect, it } from 'vitest'
import { SuppressionsAnonGitLab } from '../../src/main/gitlab/suppressionsAnon'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'
import { configuration, configurationPresente, definirPrefixeBanc, creerRacine, pile, nettoyer, ouvrirSession, nouveauDepot, type Pile } from './qualificationBanc'
const decrire = configurationPresente ? describe : describe.skip
definirPrefixeBanc('suppression-anon-moteur')
const donnees = (p: Pile) => p.commitsEnvoyes.filter((c) => c.message.startsWith('Sonal suppression-anon-'))
async function banc(suffixe: string) {
  const f = fixtureDissociationAnon()
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const racine = await creerRacine(suffixe, { corpus: f.corpus })
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `suppression-${suffixe}`, destinationId: 'qualification', corpusLocal: f.corpus })
  await p.depot.publierCommit('main', 'qualification suppression : sources synthétiques', f.sources.map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: JSON.stringify(s.data) })))
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'qualification', compteId: 'user1', projetId: Number(configuration.projetId), nomProjet: 'Qualification', branche: 'main', racine },
    store: p.store, depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, file: new FileOperationsContexte() }
  const s = new SuppressionsAnonGitLab(options, () => [])
  const a = await s.preparer(f.demande)
  const lire = async (id: string) => JSON.parse((await p.depot.lireFichier(`${racine}/entretiens/${id}.json`, 'main'))!.contenu)
  const corpus = async () => JSON.parse((await p.depot.lireFichier(`${racine}/corpus.crp`, 'main'))!.contenu)
  const reprise = async (service = s) => service.appliquer((await service.preparerReprise(service.lireSuivi()!.operationId)).token, true)
  return { f, p, s, a, options, lire, corpus, reprise }
}

/** Racines synthétiques conservées pour examiner les commits, sans activation du geste produit. */
decrire('suppression GitLab — qualification préparatoire du moteur à deux comptes', () => {
  it('retraits exacts, exceptions et incluses ; mémoire, texte et non-cible préservés', { timeout: 120_000 }, async () => {
    const { f, p, s, a, lire, corpus } = await banc('nominal')
    try {
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'termine', annotations: 8, exceptions: 2, inclusesRetirees: 2, entretiens: 2 })
      expect(donnees(p).map((c) => c.actions)).toEqual([2, 4, 4, 4])
      expect((await corpus()).reglesAnon.personne).toBeUndefined(); expect((await corpus()).suppressionAnon).toBeUndefined()
      for (const source of f.sources) {
        const apres = await lire(source.id), attendu = structuredClone(source.data)
        if (source.id !== 'e3') {
          attendu.lastModified = apres.lastModified
          attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne')
        }
        expect(apres).toEqual(attendu)
      }
    } finally { nettoyer(p) }
  })
  it('second compte occupant une cible : aucun vol ; ancien lien refusé ; reprise consentie', { timeout: 180_000 }, async () => {
    const { f, p, s, a, corpus, reprise } = await banc('cible-tenue')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'suppression-bob-e2' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', annotations: 4, regleRetiree: false })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      const candidat = structuredClone(f.sources[1].data); candidat.locuteurs[0].pseudo = 'Concurrent'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect(await session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' })
      expect(await session.fermer()).toMatchObject({ fermee: false })
      // Le banc abandonne son édition synthétique ; il ne libère aucun droit d’un autre poste.
      await session.ecrire(JSON.stringify(f.sources[1].data)); await session.marquerSale()
      expect(await session.fermer()).toMatchObject({ fermee: true })
      expect(await reprise()).toMatchObject({ statut: 'termine', annotations: 8 }); expect(donnees(p)).toHaveLength(4)
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it('non-cible éditée au second compte conservée ; création de références périmées refusée', { timeout: 180_000 }, async () => {
    const { f, p, s, a, reprise, lire } = await banc('non-cible')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'suppression-bob-e3' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e3.json`, 'e3'), cible = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition'); expect((await cible.ouvrir()).etat).toBe('edition')
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel' })
      const candidat = structuredClone(f.sources[2].data); candidat.locuteurs[0].pseudo = 'Indépendant'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect((await session.publier()).statut).toBe('confirme')
      const importe = structuredClone(candidat); importe.annotations = [structuredClone(f.sources[0].data.annotations[0])]
      await expect(p.transactions.importerEntretien('Import périmé', importe, [], [], [])).rejects.toThrow('suppression')
      await cible.fermer()
      expect(await reprise()).toMatchObject({ statut: 'termine' }); expect((await lire('e3')).locuteurs[0].pseudo).toBe('Indépendant')
    } finally { await session.fermer(); await cible.fermer(); nettoyer(p, bob) }
  })
  it('nouveau lien direct pendant le lot : aucune extension implicite, nouvelle confirmation', { timeout: 180_000 }, async () => {
    const { f, p, s, a, reprise, corpus } = await banc('nouvel-usage')
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && a.file_path.endsWith('/entretiens/e2.json')), async () => {
        const chemin = `${p.racine}/entretiens/e3.json`, source = (await p.depot.lireFichier(chemin, 'main'))!
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : lien hors protocole', [{ action: 'update', file_path: chemin, last_commit_id: source.commitId,
          content: JSON.stringify({ ...f.sources[2].data, annotations: [structuredClone(f.sources[0].data.annotations[0])] }) }])
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 8 })
      expect((await corpus()).reglesAnon.personne).toBeDefined()
      expect(await reprise()).toMatchObject({ statut: 'termine', annotations: 9, entretiens: 3 }); expect(donnees(p)).toHaveLength(5)
    } finally { nettoyer(p) }
  })
  it('contexte réouvert : cible protégée, reprise privée puis retrait exact', { timeout: 180_000 }, async () => {
    const { p, s, a, options } = await banc('contexte-partiel')
    const portees = [...PORTEEES_OVERTES_GITLAB]
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'suppression-contexte-bob' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    let contexte: Awaited<ReturnType<typeof preparerContexteGitLabLectureSeule>>['contexte'] | undefined
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'partiel', annotations: 4 })
      contexte = (await preparerContexteGitLabLectureSeule({ id: 'qualification', dirLocal: p.dossier, client: p.client, branche: 'main', racine: p.racine,
        creerTransactions: (store, file) => new TransactionsGitLab({ ...options, store, file }) })).contexte
      await expect(contexte.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de suppression')
      await session.fermer()
      PORTEEES_OVERTES_GITLAB.push('pseudonymisation-suppression-globale')
      const apercu = await contexte.preparerRepriseSuppressionAnon(contexte.lireSuiviSuppressionAnon()!.operationId)
      expect(await contexte.supprimerRegleAnonPartout(apercu.token, true)).toMatchObject({ statut: 'termine', annotations: 8 })
      expect(donnees(p)).toHaveLength(4)
    } finally { PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees); await session.fermer(); await contexte?.fermer(); nettoyer(p, bob) }
  })
  it('contexte réouvert sur issue inconnue : Actualiser reconnaît sans deadlock ni second envoi', { timeout: 180_000 }, async () => {
    const { p, s, a, options } = await banc('contexte-incertain')
    let contexte: Awaited<ReturnType<typeof preparerContexteGitLabLectureSeule>>['contexte'] | undefined
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && a.file_path.endsWith('/entretiens/e1.json')), async () => {
        p.rendreHistoriqueIndisponible(); p.perdreReponseDuCommitDeDonnees()
      })
      expect(await s.appliquer(a.token, true)).toMatchObject({ statut: 'indetermine' })
      contexte = (await preparerContexteGitLabLectureSeule({ id: 'qualification', dirLocal: p.dossier, client: p.client, branche: 'main', racine: p.racine,
        creerTransactions: (store, file) => new TransactionsGitLab({ ...options, store, file }) })).contexte
      await expect(contexte.actualiser()).rejects.toThrow('indéterminée')
      p.rendreHistorique(); await contexte.actualiser()
      expect(contexte.lireSuiviSuppressionAnon()).toMatchObject({ statut: 'partiel', annotations: 4 })
      expect(contexte.store.lireEntretien('e1')).toMatchObject({ ok: true, data: { annotations: expect.not.arrayContaining([expect.objectContaining({ regle: 'personne' })]) } })
      expect(donnees(p)).toHaveLength(2)
    } finally { await contexte?.fermer(); nettoyer(p) }
  })
  it.each(['entretien', 'retrait'])('réponse perdue à %s : nouvelle instance du moteur, relecture sans second commit', { timeout: 180_000 }, async (phase) => {
    const { p, s, a, options, reprise } = await banc(`reponse-perdue-${phase}`)
    try {
      p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && (phase === 'entretien' ? a.file_path.endsWith('/entretiens/e1.json')
        : a.file_path.endsWith('/corpus.crp') && a.content !== undefined && !JSON.parse(a.content).reglesAnon.personne)), async () => {
        p.rendreHistoriqueIndisponible(); p.perdreReponseDuCommitDeDonnees()
      })
      const r = await s.appliquer(a.token, true); expect(r.statut).toBe('indetermine')
      expect(p.journal.lister()[0].droits).toHaveLength(phase === 'entretien' ? 2 : 1)
      await expect(s.preparerReprise(r.operationId)).rejects.toThrow()
      p.rendreHistorique()
      const relance = new SuppressionsAnonGitLab(options, () => [])
      expect(await relance.relireSuivi(r.operationId)).toMatchObject({ statut: phase === 'retrait' ? 'termine' : 'partiel' })
      if (phase === 'entretien') expect(await reprise(relance)).toMatchObject({ statut: 'termine', annotations: 8 })
      else expect(relance.lireSuivi()).toBeNull()
      expect(donnees(p)).toHaveLength(4)
    } finally { nettoyer(p) }
  })
})
