import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { RetraitsVarianteAnonGitLab } from '../../src/main/gitlab/retraitsVarianteAnon'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { BailGitLab, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { fixtureRetraitVarianteAnon } from '../fixtures/retraitVarianteAnon'
import { configuration, configurationPresente, definirPrefixeBanc, creerRacine, pile, nettoyer, ouvrirSession, nouveauDepot, type Pile } from './qualificationBanc'
const decrire = configurationPresente && configuration.token2 ? describe : describe.skip
definirPrefixeBanc('retrait-variante-moteur')
const donnees = (p: Pile) => p.commitsEnvoyes.filter((c) => c.message.startsWith('Sonal retrait-variante-'))
async function banc(suffixe: string) {
  const f = fixtureRetraitVarianteAnon(), racine = await creerRacine(suffixe, { corpus: f.corpus })
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `retrait-${suffixe}`, destinationId: 'qualification', corpusLocal: f.corpus, inclureCorpusSeul: true })
  await p.depot.publierCommit('main', 'qualification retrait : sources synthétiques', f.sources.map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: JSON.stringify(s.data) })))
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'qualification', compteId: 'user1', projetId: Number(configuration.projetId), nomProjet: 'Qualification', branche: 'main', racine },
    store: p.store, depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, file: new FileOperationsContexte() }
  const s = new RetraitsVarianteAnonGitLab(options, () => []), a = await s.preparer(f.demande)
  const lire = async (id: string) => JSON.parse((await p.depot.lireFichier(`${racine}/entretiens/${id}.json`, 'main'))!.contenu)
  const corpus = async () => JSON.parse((await p.depot.lireFichier(`${racine}/corpus.crp`, 'main'))!.contenu)
  const reprise = async (service = s) => service.appliquer((await service.preparerReprise(service.lireSuivi()!.operationId)).token, true)
  return { f, p, s, a, options, lire, corpus, reprise }
}

async function avecPolitiqueRetrait<T>(operation: () => Promise<T>) {
  const avant = [...PORTEEES_OVERTES_GITLAB]
  if (!PORTEEES_OVERTES_GITLAB.includes('pseudonymisation-retrait-variante')) PORTEEES_OVERTES_GITLAB.push('pseudonymisation-retrait-variante')
  try { return await operation() }
  finally { PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...avant) }
}
async function rouvrirContexte(b: Awaited<ReturnType<typeof banc>>, coordination = b.p.coordination) {
  return preparerContexteGitLabLectureSeule({ id: 'qualification', dirLocal: b.p.dossier, branche: 'main', racine: b.p.racine, client: b.p.client,
    creerTransactions: (store, file) => new TransactionsGitLab({ ...b.options, store, file, coordination,
      publication: new PublieurGitLab({ branche: 'main', depot: b.p.depot, coordination, journal: b.p.journal }) }),
  })
}

/** Le harnais conserve les racines synthétiques ; le parcours de connexion de l’application est testé séparément. */
decrire('retrait de variante GitLab, qualification moteur à deux comptes', () => {
  it('repli exact, exceptions en clair et masquées ; non-cible liée, mémoire et texte conservés', { timeout: 120_000 }, async () => {
    const b = await banc('nominal')
    try {
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'termine', annotations: 6, exceptions: 3, incluses: 2, entretiens: 2, varianteRetiree: true })
      expect(donnees(b.p).map((c) => c.actions)).toEqual([2, 4, 4, 4]); expect((await b.corpus()).reglesAnon.personne.pseudos).toEqual(['Rebecca'])
      expect((await b.corpus()).retraitVarianteAnon).toBeUndefined()
      for (const source of b.f.sources) {
        const apres = await b.lire(source.id), attendu = structuredClone(source.data)
        if (source.id !== 'e3') {
          attendu.lastModified = apres.lastModified
          for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'Rebecca'
        }
        expect(apres).toEqual(attendu)
      }
      expect(donnees(b.p).some((c) => c.actions > 4)).toBe(false)
    } finally { nettoyer(b.p) }
  })
  it('cible tenue par second compte : ancien choix/exception refusés, reprise avec accord neuf', { timeout: 180_000 }, async () => {
    const b = await banc('cible-tenue'), bob = pile({ racine: b.p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'retrait-bob-e2' })
    const session = ouvrirSession(bob, `${b.p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'partiel', annotations: 3, varianteRetiree: false })
      expect((await b.corpus()).reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
      const candidat = structuredClone(b.f.sources[1].data); candidat.locuteurs[0].pseudo = 'Concurrent'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect(await session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' }); expect(await session.fermer()).toMatchObject({ fermee: false })
      // Le banc abandonne sa propre édition synthétique, sans libérer de droit tiers.
      await session.ecrire(JSON.stringify(b.f.sources[1].data)); await session.marquerSale(); expect(await session.fermer()).toMatchObject({ fermee: true })
      expect(await b.reprise()).toMatchObject({ statut: 'termine', annotations: 6 }); expect(donnees(b.p)).toHaveLength(4)
    } finally { await session.fermer(); nettoyer(b.p, bob) }
  })
  it('non-cible utilisant Rebecca éditable au second compte ; import d’ancien choix refusé', { timeout: 180_000 }, async () => {
    const b = await banc('non-cible'), bob = pile({ racine: b.p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'retrait-bob-e3' })
    const session = ouvrirSession(bob, `${b.p.racine}/entretiens/e3.json`, 'e3'), cible = ouvrirSession(bob, `${b.p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition'); expect((await cible.ouvrir()).etat).toBe('edition')
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'partiel' })
      const candidat = structuredClone(b.f.sources[2].data); candidat.locuteurs[0].pseudo = 'Indépendant'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale(); expect((await session.publier()).statut).toBe('confirme')
      const importe = structuredClone(candidat); importe.annotations = [structuredClone(b.f.sources[0].data.annotations[2])]
      await expect(b.p.transactions.importerEntretien('Import périmé', importe, [], [], [])).rejects.toThrow('retrait')
      await cible.fermer(); expect(await b.reprise()).toMatchObject({ statut: 'termine' }); expect((await b.lire('e3')).locuteurs[0].pseudo).toBe('Indépendant')
    } finally { await session.fermer(); await cible.fermer(); nettoyer(b.p, bob) }
  })
  it('nouveau choix hors protocole : deux variantes maintenues, reprise examinée seulement', { timeout: 180_000 }, async () => {
    const b = await banc('nouvel-usage')
    try {
      b.p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && a.file_path.endsWith('/entretiens/e2.json')), async () => {
        const chemin = `${b.p.racine}/entretiens/e3.json`, source = (await b.p.depot.lireFichier(chemin, 'main'))!, e = structuredClone(b.f.sources[2].data)
        e.annotations[0].pseudo = 'Claire'
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : choix hors protocole', [{ action: 'update', file_path: chemin, last_commit_id: source.commitId, content: JSON.stringify(e) }])
      })
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 6 })
      expect((await b.corpus()).reglesAnon.personne.pseudos).toHaveLength(2)
      expect(await b.reprise()).toMatchObject({ statut: 'termine', annotations: 7, entretiens: 3 }); expect(donnees(b.p)).toHaveLength(5)
    } finally { nettoyer(b.p) }
  })
  it.each(['barriere', 'entretien', 'retrait'])('réponse acceptée perdue à %s : preuve native et nouvelle instance sans répétition', { timeout: 180_000 }, async (phase) => {
    const b = await banc(`perte-${phase}`)
    try {
      b.p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && (phase === 'entretien' ? a.file_path.endsWith('/entretiens/e1.json')
        : a.file_path.endsWith('/corpus.crp') && a.content !== undefined && (phase === 'barriere' ? !!JSON.parse(a.content).retraitVarianteAnon : JSON.parse(a.content).reglesAnon.personne.pseudos.length === 1))), async () => {
        b.p.rendreHistoriqueIndisponible(); b.p.perdreReponseDuCommitDeDonnees()
      })
      const r = await b.s.appliquer(b.a.token, true); expect(r.statut).toBe('indetermine')
      await expect(b.s.preparerReprise(r.operationId)).rejects.toThrow(); b.p.rendreHistorique()
      const relance = new RetraitsVarianteAnonGitLab(b.options, () => [])
      expect(await relance.relireSuivi(r.operationId)).toMatchObject({ statut: phase === 'retrait' ? 'termine' : 'partiel' })
      if (phase !== 'retrait') expect(await b.reprise(relance)).toMatchObject({ statut: 'termine', annotations: 6 })
      else expect(relance.lireSuivi()).toBeNull()
      expect(donnees(b.p)).toHaveLength(4)
    } finally { nettoyer(b.p) }
  })
  it('contexte rouvert partiel : suivi avant réseau, cible hors tirage, bilan et accord neufs', { timeout: 180_000 }, async () => {
    const b = await banc('contexte-partiel'), bob = pile({ racine: b.p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'retrait-contexte-bob' })
    const session = ouvrirSession(bob, `${b.p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'partiel' })
      const chemin = join(b.p.dossier, 'entretiens/e2.json'), candidat = JSON.stringify({ ...b.f.sources[1].data, lastModified: 'copie locale de test' })
      writeFileSync(chemin, candidat)
      const debut = b.p.requetes.length, ouverture = await rouvrirContexte(b), c = ouverture.contexte
      expect(b.p.requetes).toHaveLength(debut)
      expect(c.lireSuiviRetraitVarianteAnon()).toMatchObject({ statut: 'partiel', annotations: 3 })
      await expect(c.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de retrait de variante')
      await c.actualiser(); expect(readFileSync(chemin, 'utf8')).toBe(candidat)
      expect(c.store.lireEntretien('e3')).toMatchObject({ ok: true, data: await b.lire('e3') })
      expect(donnees(b.p)).toHaveLength(2)
      await session.fermer()
      await avecPolitiqueRetrait(async () => {
        const a = await c.preparerRepriseRetraitVarianteAnon(c.lireSuiviRetraitVarianteAnon()!.operationId)
        expect(await c.retirerVarianteAnon(a.token, true)).toMatchObject({ statut: 'termine', annotations: 6 })
      })
      expect(donnees(b.p)).toHaveLength(4)
    } finally { await session.fermer(); nettoyer(b.p, bob) }
  })
  it('contexte neuf indéterminé : Actualiser reconnaît sans héritage de droits ni répétition', { timeout: 180_000 }, async () => {
    const b = await banc('contexte-indetermine')
    try {
      b.p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && a.file_path.endsWith('/entretiens/e1.json')), async () => {
        b.p.rendreHistoriqueIndisponible(); b.p.perdreReponseDuCommitDeDonnees()
      })
      expect(await b.s.appliquer(b.a.token, true)).toMatchObject({ statut: 'indetermine' })
      b.p.rendreHistorique()
      const coordination = new BailGitLab({ branche: 'main', depot: b.p.depot, identite: () => ({ userId: 'user1', machineId: 'neuf-contexte', sessionId: 'neuf-contexte' }) })
      const baux = await Promise.all(['corpus.crp', 'entretiens/e1.json'].map(async (p) => {
        const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.p.racine}/${p}`))
        return { chemin, contenu: (await b.p.depot.lireFichier(chemin, 'main'))!.contenu }
      }))
      const debut = b.p.requetes.length, ouverture = await rouvrirContexte(b, coordination), c = ouverture.contexte
      expect(b.p.requetes).toHaveLength(debut)
      expect(c.lireSuiviRetraitVarianteAnon()?.statut).toBe('indetermine')
      await c.actualiser(); expect(c.lireSuiviRetraitVarianteAnon()).toMatchObject({ statut: 'partiel', annotations: 3 })
      for (const bail of baux) expect((await b.p.depot.lireFichier(bail.chemin, 'main'))!.contenu).toBe(bail.contenu)
      await avecPolitiqueRetrait(async () => {
        const a = await c.preparerRepriseRetraitVarianteAnon(c.lireSuiviRetraitVarianteAnon()!.operationId)
        expect(await c.retirerVarianteAnon(a.token, true)).toMatchObject({ statut: 'partiel', annotations: 3, varianteRetiree: false })
      })
      expect(donnees(b.p)).toHaveLength(2)
      for (const bail of baux) await b.p.coordination.rendreBailAcquis(bail.chemin, JSON.parse(bail.contenu).generation)
    } finally { nettoyer(b.p) }
  })
  it('coordination neuve : reconnaissance sans rendre les baux persistants ; aucune suite automatique', { timeout: 180_000 }, async () => {
    const b = await banc('droits-persistants')
    try {
      b.p.avantCommitDeDonneesQuand((actions) => actions.some((a) => a.action === 'update' && a.file_path.endsWith('/entretiens/e1.json')), async () => {
        b.p.rendreHistoriqueIndisponible(); b.p.perdreReponseDuCommitDeDonnees()
      })
      const r = await b.s.appliquer(b.a.token, true); b.p.rendreHistorique()
      const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.p.racine}/corpus.crp`)), avant = (await b.p.depot.lireFichier(chemin, 'main'))!.contenu
      const coordination = new BailGitLab({ branche: 'main', depot: b.p.depot, identite: () => ({ userId: 'user1', machineId: 'neuf', sessionId: 'neuve' }) })
      await reprendreOperationsGitLab({ depot: b.p.depot, coordination, journal: b.p.journal, dirMiroir: b.p.dossier }); expect(b.p.journal.lister()).toHaveLength(1)
      const relance = new RetraitsVarianteAnonGitLab({ ...b.options, coordination }, () => [])
      expect(await relance.relireSuivi(r.operationId)).toMatchObject({ statut: 'partiel', annotations: 3 })
      expect((await b.p.depot.lireFichier(chemin, 'main'))!.contenu).toBe(avant)
      expect(await b.reprise(relance)).toMatchObject({ statut: 'partiel', annotations: 3, varianteRetiree: false }); expect(donnees(b.p)).toHaveLength(2)
      // Le coordinateur d’origine rend ses propres droits vivants après preuve de publication.
      await b.p.coordination.rendreBailAcquis(chemin, JSON.parse(avant).generation)
      const entretien = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.p.racine}/entretiens/e1.json`)), droit = await b.p.depot.lireFichier(entretien, 'main')
      if (droit) await b.p.coordination.rendreBailAcquis(entretien, JSON.parse(droit.contenu).generation)
    } finally { nettoyer(b.p) }
  })
})
