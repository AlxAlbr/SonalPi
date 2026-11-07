import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { configuration, configurationPresente, creerRacine, definirPrefixeBanc, nouveauDepot, nettoyer, pile } from './qualificationBanc'

const decrire = configurationPresente ? describe : describe.skip
definirPrefixeBanc('ajout-variante')
async function banc(suffixe: string) {
  const f = fixtureRenommageAnon(); f.corpus.reglesAnon.personne.pseudos = ['Claire']
  const racine = await creerRacine(suffixe, { corpus: f.corpus })
  await nouveauDepot(configuration.token1!).publierCommit('main', 'qualification : sources de variante', f.sources.map((s) => ({ action: 'create' as const, file_path: `${racine}/entretiens/${s.id}.json`, content: JSON.stringify(s.data) })))
  const controle = { perte: false, historique: true, course: null as null | (() => Promise<void>), autorise: true, envois: [] as string[] }
  const transport: typeof fetch = async (url, init) => {
    const adresse = new URL(String(url))
    if (!controle.historique && adresse.searchParams.has('search')) throw new Error('Historique indisponible')
    const donnees = init?.method === 'POST' && String(init.body).includes('Sonal ajout-variante-')
    if (donnees && controle.course) { const course = controle.course; controle.course = null; await course() }
    if (donnees && !controle.autorise) { const headers = new Headers(init.headers); headers.set('PRIVATE-TOKEN', 'fixture-invalide'); init = { ...init, headers } }
    const reponse = await fetch(url, init)
    if (donnees && reponse.ok) {
      controle.envois.push(String(init?.body))
      if (controle.perte) { controle.perte = false; await reponse.body?.cancel(); throw new Error('Réponse perdue') }
    }
    return reponse
  }
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `variante-${suffixe}`, destinationId: racine, fetchImpl: transport,
    operation: createHash('sha256').update(racine).digest('hex').slice(0, 24) })
  const depot = nouveauDepot(configuration.token1!)
  const c = new ContexteGitLab('qualification', p.store, { tirer: async () => ({ telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString() }) } as never, undefined, p.transactions)
  const demande = { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudo: 'Rebecca' }
  const ajouter = () => c.executerDefinitions('anon.ajouter-variante', (s) => s.regleAnonAjouterVariante(demande))
  const lire = (chemin = 'corpus.crp') => depot.lireFichier(`${racine}/${chemin}`, 'main')
  const avant = await Promise.all(f.sources.map((s) => lire(`entretiens/${s.id}.json`)))
  return { f, p, c, depot, racine, controle, demande, ajouter, lire, avant }
}
decrire('ajout de variante GitLab — qualification propre', () => {
  it('corpus seul, sources exactes, dates et autres règles intactes ; doublon sans seconde publication', { timeout: 120_000 }, async () => {
    const b = await banc('nominal')
    try {
      await b.ajouter()
      const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
      expect(JSON.parse((await b.lire())!.contenu)).toEqual(attendu)
      expect(await Promise.all(b.f.sources.map((s) => b.lire(`entretiens/${s.id}.json`)))).toEqual(b.avant)
      const commit = JSON.parse(b.controle.envois[0]); expect(commit.actions).toHaveLength(2)
      expect(commit.actions.map((a: { file_path: string }) => a.file_path)).toEqual([`${b.racine}/corpus.crp`, cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.racine}/corpus.crp`))])
      b.demande.regleAvant = attendu.reglesAnon.personne; expect((await b.ajouter()).valeur.ajoute).toBe(false)
      expect(b.controle.envois).toHaveLength(1)
    } finally { nettoyer(b.p) }
  })
  it('corpus tenu par le second compte refuse ; entretien tenu conservé sans aucune acquisition supplémentaire', { timeout: 120_000 }, async () => {
    const b = await banc('tenus'), bob = pile({ racine: b.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'variante-bob' })
    try {
      const ressource = cleRessourceBailGitLab('main', `${b.racine}/corpus.crp`)
      const a = await bob.coordination.acquireRessource(ressource); if (!a.ok) throw new Error('Bail fixture')
      await expect(b.ajouter()).rejects.toThrow('modification'); expect(b.controle.envois).toEqual([]); await bob.coordination.liberer(a.droit)
      const e = await bob.coordination.acquireRessource(cleRessourceBailGitLab('main', `${b.racine}/entretiens/e1.json`)); if (!e.ok) throw new Error('Bail fixture')
      const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.racine}/entretiens/e1.json`)), avant = await b.depot.lireFichier(chemin, 'main')
      await b.ajouter(); expect(await b.depot.lireFichier(chemin, 'main')).toEqual(avant); await bob.coordination.liberer(e.droit)
    } finally { nettoyer(b.p, bob) }
  })
  it('définition changée et course au commit refusées sans écraser le second compte', { timeout: 120_000 }, async () => {
    const b = await banc('concurrence'), bob = nouveauDepot(configuration.token2!)
    try {
      const concurrent = structuredClone(b.f.corpus); concurrent.reglesAnon.personne.categorie = 'Autre'
      await bob.publierCommit('main', 'fixture : catégorie concurrente', [{ action: 'update', file_path: `${b.racine}/corpus.crp`, last_commit_id: (await b.lire())!.commitId, content: JSON.stringify(concurrent) }])
      await expect(b.ajouter()).rejects.toThrow('a changé'); b.demande.regleAvant = concurrent.reglesAnon.personne
      concurrent.nom = 'Édition indépendante'
      b.controle.course = async () => { await bob.publierCommit('main', 'fixture : course de corpus', [{ action: 'update', file_path: `${b.racine}/corpus.crp`, last_commit_id: (await b.lire())!.commitId, content: JSON.stringify(concurrent) }]) }
      await expect(b.ajouter()).rejects.toThrow('changé pendant'); expect(JSON.parse((await b.lire())!.contenu)).toEqual(concurrent)
      expect(b.controle.envois).toEqual([])
    } finally { nettoyer(b.p) }
  })
  it('autorisation refusée à l’envoi : aucun ajout ni entretien modifié', { timeout: 120_000 }, async () => {
    const b = await banc('autorisation')
    try {
      b.controle.autorise = false; await expect(b.ajouter()).rejects.toThrow('droits')
      expect(JSON.parse((await b.lire())!.contenu)).toEqual(b.f.corpus)
      expect(await Promise.all(b.f.sources.map((s) => b.lire(`entretiens/${s.id}.json`)))).toEqual(b.avant)
      expect(b.p.journal.lister()).toEqual([])
    } finally { nettoyer(b.p) }
  })
  it('perte acceptée : Actualiser prouve l’ajout unique et rend uniquement le droit acquis vivant', { timeout: 120_000 }, async () => {
    const b = await banc('perte-vivante')
    try {
      b.controle.perte = true; b.controle.historique = false
      await expect(b.ajouter()).rejects.toThrow('confirmée'); await expect(b.c.actualiser()).rejects.toThrow('vérifié')
      b.controle.historique = true; await b.c.actualiser()
      expect(b.controle.envois).toHaveLength(1); expect(b.p.journal.lister()).toEqual([])
      const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.racine}/corpus.crp`))
      expect(await b.depot.lireFichier(chemin, 'main')).toBeNull()
    } finally { nettoyer(b.p) }
  })
  it('nouvelle instance : reconnaissance sans répétition, bail persistant inchangé et ajout suivant refusé', { timeout: 120_000 }, async () => {
    const b = await banc('perte-relance')
    let suivante: ReturnType<typeof pile> | undefined
    try {
      b.controle.perte = true; b.controle.historique = false; await expect(b.ajouter()).rejects.toThrow('confirmée')
      const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', `${b.racine}/corpus.crp`)), avant = await b.depot.lireFichier(chemin, 'main')
      suivante = pile({ racine: b.racine, jeton: configuration.token1!, userId: 'user1', sessionId: 'nouvelle-instance', destinationId: b.racine, dossier: b.p.dossier, journalRepertoire: joinJournal(b.p.dossier) })
      await reprendreOperationsGitLab({ depot: suivante.depot, coordination: suivante.coordination, journal: suivante.journal, dirMiroir: suivante.dossier })
      expect(suivante.journal.lister()).toEqual([]); expect(await b.depot.lireFichier(chemin, 'main')).toEqual(avant)
      await expect(suivante.transactions.executerDefinitions((s) => s.regleAnonAjouterVariante(b.demande), true)).rejects.toThrow('retenu')
      expect(b.controle.envois).toHaveLength(1)
    } finally { nettoyer(b.p, ...(suivante ? [suivante] : [])) }
  })
})
function joinJournal(dossier: string) { return `${dossier}/operations` }
