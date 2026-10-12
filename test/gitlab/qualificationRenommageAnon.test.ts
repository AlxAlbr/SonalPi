import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RenommagesAnon } from '../../src/main/renommagesAnon'
import { RenommagesAnonGitLab } from '../../src/main/gitlab/renommagesAnon'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { configuration, configurationPresente, definirPrefixeBanc, creerRacine, pile, nettoyer, ouvrirSession, nouveauDepot, type Pile } from './qualificationBanc'
const decrire = configurationPresente ? describe : describe.skip
definirPrefixeBanc('renommage-cible')
const operation = (p: Pile) => `renommage-anon-${createHash('sha256').update(p.racine).digest('hex').slice(0, 16)}`
const donnees = (p: Pile) => p.commitsEnvoyes.filter((c) => c.message.startsWith(`Sonal ${operation(p)}-`))
async function banc(suffixe: string, nombre = 3, fetchImpl?: typeof fetch) {
  const f = fixtureRenommageAnon(Array.from({ length: nombre }, (_, i) => `e${i + 1}`)); f.sources.slice(2).forEach((s) => { s.data.annotations = [] })
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const racine = await creerRacine(suffixe, { corpus: f.corpus })
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `renommage-${suffixe}`, destinationId: 'qualification', corpusLocal: f.corpus, fetchImpl })
  await p.depot.publierCommit('main', 'qualification ciblée : sources synthétiques', f.sources.map((s) => ({ action: 'create', file_path: `${racine}/entretiens/${s.id}.json`, content: JSON.stringify(s.data) })))
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'qualification', compteId: 'user1', projetId: Number(configuration.projetId), nomProjet: 'Qualification', branche: 'main', racine },
    store: p.store, depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, file: new FileOperationsContexte(), nouvelleOperation: () => operation(p) }
  const s = new RenommagesAnonGitLab(options, () => [])
  const cache = new RenommagesAnon({ store: () => p.store, local: () => false })
  const a = cache.preparerGitLab(f.demande, await s.instantane(), s.disponible(), s)
  const preparation = cache.consommerGitLab(a.token, true, s)
  const reprise = async (service = s) => {
    const r = await service.preparerReprise(service.lireSuivi()!.operationId)
    const a = cache.preparerGitLab(r.demande, r.instantane, true, service, r)
    return cache.consommerGitLab(a.token, true, service)
  }
  return { f, p, s, options, preparation, reprise }
}

/** Chaque scénario utilise une racine conservée, sans données personnelles réelles. */
decrire('renommage GitLab ciblé — qualification à deux comptes', () => {
  it('définition puis deux cibles : trois commits bornés, identités préservées', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation } = await banc('nominal')
    try {
      expect(await s.appliquer(preparation)).toMatchObject({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true, statut: 'termine' })
      expect(donnees(p)).toHaveLength(3); expect(donnees(p).map((c) => c.actions)).toEqual([2, 3, 3])
      for (const source of f.sources) {
        const apres = JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/${source.id}.json`, 'main'))!.contenu)
        const attendu = structuredClone(source.data)
        if (source.id !== 'e3') { attendu.lastModified = apres.lastModified; for (const a of attendu.annotations) if (['a0', 'a5'].includes(a.id)) a.pseudo = 'Nouvelle' }
        expect(apres).toEqual(attendu)
      }
      expect(s.lireSuivi()).toBeNull(); expect(p.journal.lister()).toEqual([])
    } finally { nettoyer(p) }
  })
  it('130 membres, deux cibles : aucune limite de 124 membres ni garde globale', { timeout: 240_000 }, async () => {
    const { p, s, preparation } = await banc('130-membres', 130)
    try {
      expect(preparation.cibles).toHaveLength(2)
      expect((await s.appliquer(preparation)).statut).toBe('termine')
      expect(donnees(p).map((c) => c.actions)).toEqual([2, 3, 3])
    } finally { nettoyer(p) }
  })
  it('session non ciblée du second compte ouverte pendant le lot, puis publication normale', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation } = await banc('session-non-ciblee')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'cible-bob' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e3.json`, 'e3')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      expect((await s.appliquer(preparation)).statut).toBe('termine')
      await session.ecrire(JSON.stringify({ ...f.sources[2].data, lastModified: 'publication-bob' })); await session.marquerSale()
      expect((await session.publier()).statut).toBe('confirme')
      expect(JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/e3.json`, 'main'))!.contenu).lastModified).toBe('publication-bob')
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it('bail ciblé tiers : différé sans écrasement, reprise après libération sans replay du succès', { timeout: 120_000 }, async () => {
    const { p, s, preparation, reprise } = await banc('cible-tenue')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'cible-bob-e2' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      await session.ouvrir()
      expect(await s.appliquer(preparation)).toMatchObject({ statut: 'partiel', annotations: 2, entretiens: 1 })
      expect(s.lireSuivi()!.bilan.differes?.[0].id).toBe('e2')
      await session.fermer()
      expect(await s.appliquer(await reprise())).toMatchObject({ statut: 'termine', annotations: 4 })
      expect(donnees(p)).toHaveLength(3)
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it.each(['e2', 'e3'])('source changée après aperçu : cible différée, non-cible indépendante : %s', { timeout: 120_000 }, async (id) => {
    const { f, p, s, preparation, reprise } = await banc(`perime-${id}`)
    try {
      const chemin = `${p.racine}/entretiens/${id}.json`, source = await p.depot.lireFichier(chemin, 'main')
      await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : source concurrente', [{ action: 'update', file_path: chemin, last_commit_id: source!.commitId, content: JSON.stringify({ ...f.sources.find((x) => x.id === id)!.data, lastModified: 'concurrent' }) }])
      expect((await s.appliquer(preparation)).statut).toBe(id === 'e2' ? 'partiel' : 'termine')
      if (id === 'e2') expect((await s.appliquer(await reprise())).statut).toBe('termine')
      else expect(JSON.parse((await p.depot.lireFichier(chemin, 'main'))!.contenu).lastModified).toBe('concurrent')
      expect(donnees(p)).toHaveLength(3)
    } finally { nettoyer(p) }
  })
  it('publication concurrente sans rapport sur le non-ciblé ne refuse pas le lot', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation } = await banc('course-non-ciblee')
    try {
      p.avantCommitDeDonnees(async () => {
        const chemin = `${p.racine}/entretiens/e3.json`, source = await p.depot.lireFichier(chemin, 'main')
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : course indépendante', [{ action: 'update', file_path: chemin, last_commit_id: source!.commitId, content: JSON.stringify({ ...f.sources[2].data, lastModified: 'concurrent-envoi' }) }])
      })
      expect((await s.appliquer(preparation)).statut).toBe('termine')
      expect(JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/e3.json`, 'main'))!.contenu).lastModified).toBe('concurrent-envoi')
    } finally { nettoyer(p) }
  })
  it('nouvel usage via écriture directe : contrôle final, nouvel aperçu et consentement ciblé', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation, reprise } = await banc('nouvel-usage')
    try {
      p.avantCommitDeDonnees(async () => {
        const chemin = `${p.racine}/entretiens/e3.json`, source = await p.depot.lireFichier(chemin, 'main')
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : nouvel usage hors protocole', [{ action: 'update', file_path: chemin, last_commit_id: source!.commitId,
          content: JSON.stringify({ ...f.sources[2].data, annotations: [f.sources[0].data.annotations[0]] }) }])
      })
      expect(await s.appliquer(preparation)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 4 })
      const r = await reprise(); expect(r.cibles.map((c) => c.id)).toEqual(['e3'])
      expect(await s.appliquer(r)).toMatchObject({ statut: 'termine', annotations: 5, entretiens: 3 })
      expect(donnees(p)).toHaveLength(4)
    } finally { nettoyer(p) }
  })
  it('ancienne session : réintroduction refusée, correction avec la nouvelle variante publiable', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation } = await banc('sauvegarde-tardive')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'ancien-client-bob' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e3.json`, 'e3')
    try {
      await session.ouvrir(); await s.appliquer(preparation)
      const candidat = { ...f.sources[2].data, annotations: [structuredClone(f.sources[0].data.annotations[0])] }
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect(await session.publier()).toMatchObject({ statut: 'refuse', raison: 'references' })
      candidat.annotations[0].pseudo = 'Nouvelle'
      await session.ecrire(JSON.stringify(candidat)); await session.marquerSale()
      expect((await session.publier()).statut).toBe('confirme')
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it('import d’un nouvel entretien : ancien choix lié refusé, choix actuel accepté', { timeout: 120_000 }, async () => {
    const { f, p, s, preparation } = await banc('import-ancien-choix')
    try {
      await s.appliquer(preparation)
      const payload = structuredClone(f.sources[2].data); payload.annotations = [structuredClone(f.sources[0].data.annotations[0])]
      await expect(p.transactions.importerEntretien('Import périmé', payload, [], [], [])).rejects.toThrow('variante choisie')
      payload.annotations[0].pseudo = 'Nouvelle'
      const ajout = await p.transactions.importerEntretien('Import actuel', payload, [], [], [])
      expect(JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/${ajout.id}.json`, 'main'))!.contenu).annotations[0].pseudo).toBe('Nouvelle')
    } finally { nettoyer(p) }
  })
  it('autorisation perdue : aucune définition ni annotation modifiée, intention reprenable', { timeout: 120_000 }, async () => {
    let refuser = false
    const transport: typeof fetch = async (url, init) => {
      if (refuser && String(init?.body ?? '').includes('Sonal renommage-anon-')) {
        const headers = new Headers(init?.headers); headers.set('PRIVATE-TOKEN', 'qualification-invalide')
        return fetch(url, { ...init, headers })
      }
      return fetch(url, init)
    }
    const { f, p, s, preparation } = await banc('autorisation', 3, transport)
    try {
      refuser = true
      expect(await s.appliquer(preparation)).toMatchObject({ statut: 'partiel', annotations: 0, definitionModifiee: false })
      expect(JSON.parse((await nouveauDepot(configuration.token1!).lireFichier(`${p.racine}/entretiens/e1.json`, 'main'))!.contenu)).toEqual(f.sources[0].data)
      expect(p.journal.lister()).toEqual([])
    } finally { nettoyer(p) }
  })
  it('réponse perdue reconnue sur une cible, sans second commit', { timeout: 120_000 }, async () => {
    const { p, s, preparation } = await banc('reponse-perdue')
    try {
      p.perdreReponseDuCommitDeDonnees()
      expect((await s.appliquer(preparation)).statut).toBe('termine')
      expect(donnees(p)).toHaveLength(3); expect(p.journal.lister()).toEqual([])
      expect(JSON.parse(readFileSync(join(p.dossier, 'entretiens/e1.json'), 'utf8')).annotations[0].pseudo).toBe('Nouvelle')
    } finally { nettoyer(p) }
  })
  it('issue inconnue et relance : un droit suspendu, preuve du commit puis reprise du restant', { timeout: 120_000 }, async () => {
    const { p, s, options, preparation, reprise } = await banc('reprise')
    try {
      p.perdreReponseDuCommitDeDonnees(() => { p.rendreHistoriqueIndisponible(); return Promise.resolve() })
      expect((await s.appliquer(preparation)).statut).toBe('indetermine')
      expect(p.journal.lister()[0].droits).toHaveLength(1)
      await expect(reprise()).rejects.toThrow('indéterminée')
      p.rendreHistorique()
      const relance = pile({ racine: p.racine, jeton: configuration.token1!, userId: 'user1', sessionId: 'renommage-relance', dossier: p.dossier, journalRepertoire: join(p.dossier, 'operations'), destinationId: 'qualification' })
      await reprendreOperationsGitLab({ depot: relance.depot, coordination: relance.coordination, journal: p.journal, dirMiroir: p.dossier })
      const service = new RenommagesAnonGitLab({ ...options, depot: relance.depot, coordination: relance.coordination, publication: relance.publication }, () => [])
      expect((await service.appliquer(await reprise(service))).statut).toBe('termine')
      expect(p.journal.lister()).toEqual([])
      expect(donnees(p)).toHaveLength(2); expect(donnees(relance)).toHaveLength(1)
    } finally { nettoyer(p) }
  })
})
