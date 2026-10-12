import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TablesCorrespondance } from '../../src/main/tablesCorrespondance'
import { CorrespondancesGitLab } from '../../src/main/gitlab/correspondances'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { MiroirDistant } from '../../src/main/distant/miroir'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { configuration, configurationPresente, creerRacine, definirPrefixeBanc, corpusAvecEntretiens, entretienPublie, nouveauDepot, nettoyer, ouvrirSession, pile, type Pile } from './qualificationBanc'

const decrire = configurationPresente ? describe : describe.skip
definirPrefixeBanc('correspondances')
const documents = [{ nom: 'correspondances.json', texte: JSON.stringify({ format: 'sonalpi-correspondances', version: 2, correspondances: [
  { nature: 'texte', portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Lieu témoin'], categorie: 'LOC', etatLocal: 'declaration' },
  { nature: 'locuteur', nom: 'Karine', pseudo: 'Claire', origines: [{ entretienId: 'autre', locuteurIndex: 99, pseudoEtat: 'confirme' }] },
] }) }]

const operation = (p: Pile) => `import-correspondances-${createHash('sha256').update(p.racine).digest('hex').slice(0, 16)}`
function service(p: Pile) {
  return new CorrespondancesGitLab({
    destination: { fournisseur: 'gitlab', id: 'qualification', compteId: 'user1', projetId: Number(configuration.projetId), nomProjet: 'Qualification', branche: 'main', racine: p.racine },
    store: p.store, depot: p.depot, coordination: p.coordination, publication: p.publication, journal: p.journal, file: new FileOperationsContexte(),
    nouvelleOperation: () => operation(p),
  }, () => [])
}
async function banc(suffixe: string, fetchImpl?: typeof fetch) {
  const corpus = corpusAvecEntretiens({ e1: 'Un', e2: 'Deux' })
  const racine = await creerRacine(suffixe, { corpus })
  const p = pile({ racine, jeton: configuration.token1!, userId: 'user1', sessionId: `correspondances-${suffixe}`, corpusLocal: corpus, fetchImpl })
  const entretien = JSON.parse(entretienPublie('Texte synthétique intact'))
  entretien.locuteurs = [{ index: 1, nom: 'Karine', personneRef: 'personne-synthetique' }]
  await p.depot.publierCommit('main', 'qualification correspondances : entretiens', ['e1', 'e2'].map((id) => ({ action: 'create', file_path: `${racine}/entretiens/${id}.json`, content: JSON.stringify(entretien) })))
  const s = service(p)
  const tables = new TablesCorrespondance({ store: () => p.store, lecture: () => 'miroir' })
  const apercu = tables.preparerImportGitLab(documents, [], await s.instantane())
  const preparation = tables.consommerImport(apercu.token, {}, apercu.cibles!.map((c) => ({ cibleId: c.id, action: c.actionsPossibles[0], ...(c.nature === 'locuteur' ? { etat: 'confirme' as const } : {}) })), true)
  return { p, s, preparation, entretien }
}
const donnees = (p: Pile) => p.commitsEnvoyes.filter((c) => c.message === `Sonal ${operation(p)}`)

/** Qualification sur le dépôt réel : le miroir n'est jamais la base du choix. */
decrire('correspondances GitLab — qualification à deux comptes', () => {
  it('publie les deux cibles dans un seul commit, avec leurs trois baux', { timeout: 120_000 }, async () => {
    const { p, s, preparation, entretien } = await banc('nominal')
    try {
      const bilan = await s.appliquer(preparation)
      expect(bilan.entretiens).toEqual({ definitionsLocales: 2, locuteurs: 2, entretiens: 2 })
      expect(donnees(p)).toHaveLength(1); expect(donnees(p)[0].actions).toBe(6)
      for (const id of ['e1', 'e2']) {
        const source = await p.depot.lireFichier(`${p.racine}/entretiens/${id}.json`, 'main')
        const apres = JSON.parse(source!.contenu)
        expect(apres.corpsTexte).toEqual(entretien.corpsTexte); expect(apres.annotations).toEqual(entretien.annotations)
        expect(apres.locuteurs[0]).toMatchObject({ personneRef: 'personne-synthetique', pseudo: 'Claire', pseudoEtat: 'confirme' })
        expect(apres.definitionsAnonLocales[0].entite).toEqual(['Alias sans occurrence', 'Autre graphie'])
      }
      expect(p.journal.lister()).toEqual([])
    } finally { nettoyer(p) }
  })
  it('un entretien tenu par le second compte refuse tout le groupe', { timeout: 120_000 }, async () => {
    const { p, s, preparation, entretien } = await banc('bail-tiers')
    const bob = pile({ racine: p.racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'correspondances-bob' })
    const session = ouvrirSession(bob, `${p.racine}/entretiens/e2.json`, 'e2')
    try {
      expect((await session.ouvrir()).etat).toBe('edition')
      await expect(s.appliquer(preparation)).rejects.toThrow('tenu par un autre poste')
      expect(donnees(p)).toHaveLength(0)
      expect(JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/e1.json`, 'main'))!.contenu)).toEqual(entretien)
    } finally { await session.fermer(); nettoyer(p, bob) }
  })
  it('un compte privé de son autorisation à l’envoi ne modifie aucune cible', { timeout: 120_000 }, async () => {
    let refuser = false
    const transport: typeof fetch = async (url, init) => {
      if (refuser && String(init?.body ?? '').includes('Sonal import-correspondances-')) {
        const headers = new Headers(init?.headers)
        headers.set('PRIVATE-TOKEN', 'qualification-jeton-invalide')
        return fetch(url, { ...init, headers })
      }
      return fetch(url, init)
    }
    const { p, s, preparation, entretien } = await banc('autorisation', transport)
    try {
      refuser = true
      await expect(s.appliquer(preparation)).rejects.toThrow('refusée')
      for (const id of ['e1', 'e2']) expect(JSON.parse((await nouveauDepot(configuration.token1!).lireFichier(`${p.racine}/entretiens/${id}.json`, 'main'))!.contenu)).toEqual(entretien)
      expect(p.journal.lister()).toEqual([])
    } finally { nettoyer(p) }
  })
  it('une source modifiée depuis aperçu refuse le groupe', { timeout: 120_000 }, async () => {
    const { p, s, preparation, entretien } = await banc('perime')
    try {
      const chemin = `${p.racine}/entretiens/e2.json`
      const source = await p.depot.lireFichier(chemin, 'main')
      await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : version modifiée', [{ action: 'update', file_path: chemin, last_commit_id: source!.commitId, content: JSON.stringify({ ...entretien, lastModified: '2026-11-01T00:00:00.000Z' }) }])
      await expect(s.appliquer(preparation)).rejects.toThrow('a changé depuis l’aperçu')
      expect(donnees(p)).toHaveLength(0)
    } finally { nettoyer(p) }
  })
  it('une garde changée pendant l’envoi refuse les deux modifications', { timeout: 120_000 }, async () => {
    const { p, s, preparation, entretien } = await banc('garde')
    try {
      p.avantCommitDeDonnees(async () => {
        const chemin = `${p.racine}/entretiens/e2.json`
        const source = await p.depot.lireFichier(chemin, 'main')
        await nouveauDepot(configuration.token2!).publierCommit('main', 'qualification : course de garde', [{ action: 'update', file_path: chemin, last_commit_id: source!.commitId, content: JSON.stringify({ ...entretien, lastModified: '2026-11-02T00:00:00.000Z' }) }])
      })
      await expect(s.appliquer(preparation)).rejects.toThrow('refusée')
      expect(JSON.parse((await p.depot.lireFichier(`${p.racine}/entretiens/e1.json`, 'main'))!.contenu)).toEqual(entretien)
    } finally { nettoyer(p) }
  })
  it('réponse perdue retrouvée sans nouvel envoi', { timeout: 120_000 }, async () => {
    const { p, s, preparation } = await banc('reponse-perdue')
    try {
      p.perdreReponseDuCommitDeDonnees()
      expect((await s.appliquer(preparation)).entretiens.entretiens).toBe(2)
      expect(donnees(p)).toHaveLength(1); expect(p.journal.lister()).toEqual([])
    } finally { nettoyer(p) }
  })
  it('publication inconnue bloque puis se reprend au redémarrage sans rejeu', { timeout: 120_000 }, async () => {
    const { p, s, preparation } = await banc('reprise')
    try {
      p.perdreReponseDuCommitDeDonnees(() => { p.rendreHistoriqueIndisponible(); return Promise.resolve() })
      await expect(s.appliquer(preparation)).rejects.toThrow('indéterminée')
      expect(p.journal.lister()[0].droits).toHaveLength(3)
      await expect(s.appliquer(preparation)).rejects.toThrow('reste à réconcilier')
      p.rendreHistorique()
      const relance = pile({ racine: p.racine, jeton: configuration.token1!, userId: 'user1', sessionId: 'correspondances-relance', dossier: p.dossier, journalRepertoire: join(p.dossier, 'operations'), destinationId: 'correspondances-reprise' })
      await reprendreOperationsGitLab({ depot: relance.depot, coordination: relance.coordination, journal: p.journal, dirMiroir: p.dossier })
      const instantane = new InstantaneLectureGitLab(relance.client, 'main', p.racine)
      const miroir = new MiroirDistant(p.dossier, () => instantane.ouvrir(), { fournisseur: 'gitlab', destinationId: 'qualification' })
      await miroir.tirer([])
      expect(JSON.parse(readFileSync(join(p.dossier, 'entretiens/e2.json'), 'utf8')).locuteurs[0].pseudo).toBe('Claire')
      expect(p.journal.lister()).toEqual([]); expect(donnees(p)).toHaveLength(1)
    } finally { nettoyer(p) }
  })
})
