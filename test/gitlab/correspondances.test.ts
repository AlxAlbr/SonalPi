import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { CorpusStore } from '../../src/main/corpusStore'
import { TablesCorrespondance } from '../../src/main/tablesCorrespondance'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { CorrespondancesGitLab, MAX_ENTRETIENS_IMPORT_GITLAB } from '../../src/main/gitlab/correspondances'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { reprendreOperationsGitLab } from '../../src/main/gitlab/reprise'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { DepotMemoire } from './depotMemoire'
import { corpusAvecEntretiens, entretienPublie } from './qualificationBanc'
import type { EntretienFichier } from '../../src/shared/format'

const dossiers: string[] = []
afterEach(() => { for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true }) })

export function documentsCibles() {
  return [{ nom: 'synthese.json', texte: JSON.stringify({ format: 'sonalpi-correspondances', version: 2, correspondances: [
    { nature: 'texte', portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Lieu témoin'], categorie: 'LOC', etatLocal: 'declaration' },
    { nature: 'locuteur', nom: 'Karine', pseudo: 'Claire', origines: [{ entretienId: 'etranger', locuteurIndex: 99, pseudoEtat: 'confirme' }] },
  ] }) }]
}
function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-correspondances-gitlab-')); dossiers.push(dir)
  const corpus = corpusAvecEntretiens({ e1: 'Un', e2: 'Deux' })
  const entretien = JSON.parse(entretienPublie('Texte intact')) as EntretienFichier
  entretien.locuteurs = [{ index: 1, nom: 'Karine', personneRef: 'personne-1' }]
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire()
  depot.charger(new Map([['racine/corpus.json', JSON.stringify(corpus)], ...['e1', 'e2'].map((id) => [`racine/entretiens/${id}.json`, JSON.stringify(entretien)] as [string, string])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 's1' }) })
  const journal = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const sessions: string[] = []
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'destination', compteId: 'alice', projetId: 1, nomProjet: 'Projet', branche: 'main', racine: 'racine' }, store, depot, coordination, publication, journal, file: new FileOperationsContexte(), nouvelleOperation: () => 'import-cible' }
  const service = new CorrespondancesGitLab(options, () => sessions)
  return { dir, store, corpus, entretien, depot, coordination, journal, options, service, sessions }
}
async function preparer(b: ReturnType<typeof banc>, documents = documentsCibles()) {
  const instantane = await b.service.instantane()
  const tables = new TablesCorrespondance({ store: () => b.store, lecture: () => 'miroir' })
  const apercu = tables.preparerImportGitLab(documents, [], instantane)
  const selection = apercu.cibles!.map((c) => ({ cibleId: c.id, action: c.actionsPossibles[0], ...(c.nature === 'locuteur' ? { etat: 'confirme' as const } : {}) }))
  return { tables, apercu, preparation: tables.consommerImport(apercu.token, {}, selection, true) }
}
function commitsDonnees(b: ReturnType<typeof banc>) { return b.depot.commits.filter((c) => c.message === 'Sonal import-cible') }

describe('import ciblé GitLab gardé', () => {
  test('lit le serveur et publie deux entretiens avec trois baux dans un seul commit', async () => {
    const b = banc()
    const { preparation } = await preparer(b)
    const bilan = await b.service.appliquer(preparation)
    expect(bilan.entretiens).toEqual({ definitionsLocales: 2, locuteurs: 2, entretiens: 2 })
    expect(commitsDonnees(b)).toHaveLength(1)
    expect(commitsDonnees(b)[0].actions).toHaveLength(6)
    const apres = JSON.parse(b.depot.fichiers.get('racine/entretiens/e1.json')!.contenu)
    expect(apres.corpsTexte).toEqual(b.entretien.corpsTexte)
    expect(apres.annotations).toEqual(b.entretien.annotations)
    expect(apres.locuteurs[0]).toMatchObject({ index: 1, nom: 'Karine', personneRef: 'personne-1', pseudo: 'Claire', pseudoEtat: 'confirme' })
    expect(apres.definitionsAnonLocales[0]).toMatchObject({ entite: ['Alias sans occurrence', 'Autre graphie'], categorie: 'LOC' })
    expect(b.journal.lister()).toEqual([])
    const reprise = await preparer(b)
    expect((await b.service.appliquer(reprise.preparation)).entretiens.entretiens).toBe(0)
    expect(commitsDonnees(b)).toHaveLength(1)
  })
  test('définitions partagées et cibles sont préparées avant le même commit', async () => {
    const b = banc(); const docs = documentsCibles()
    const table = JSON.parse(docs[0].texte)
    table.correspondances.push({ nature: 'texte', portee: 'corpus', entite: ['Définition partagée'], pseudos: ['Pseudo partagé'] })
    docs[0].texte = JSON.stringify(table)
    const { preparation } = await preparer(b, docs)
    const bilan = await b.service.appliquer(preparation)
    expect(bilan.ajouts).toBe(1); expect(bilan.ignores).toBe(0)
    expect(commitsDonnees(b)).toHaveLength(1)
    expect(commitsDonnees(b)[0].actions[0].action).toBe('update')
    expect(Object.values(JSON.parse(b.depot.fichiers.get('racine/corpus.json')!.contenu).reglesAnon)).toEqual([expect.objectContaining({ entite: ['Définition partagée'] })])
    const autre = banc()
    table.correspondances[2].entite = ['Alias sans occurrence', 'Autre graphie']
    docs[0].texte = JSON.stringify(table)
    await expect(autre.service.appliquer((await preparer(autre, docs)).preparation)).rejects.toThrow('une seule portée')
    expect(commitsDonnees(autre)).toHaveLength(0)
  })
  test('cache GitLab : confirmation explicite, copie publique sans autorité et cible forgée refusée', async () => {
    const b = banc(); const { tables } = await preparer(b)
    const suivant = tables.preparerImportGitLab(documentsCibles(), [], await b.service.instantane())
    expect(() => tables.consommerImport(suivant.token, {}, [{ cibleId: suivant.cibles![0].id, action: 'ajouter' }], false)).toThrow('Confirmez explicitement')
    const { apercu, preparation } = await preparer(b)
    apercu.lignes[0].pseudos = ['Altération publique']
    await b.service.appliquer(preparation)
    expect(JSON.parse(b.depot.fichiers.get('racine/entretiens/e1.json')!.contenu).definitionsAnonLocales[0].pseudos).toEqual(['Lieu témoin'])
    const n = b.depot.commits.length
    const forge = (await preparer(b)).preparation
    forge.choixCibles.push({ cibleId: 'forgee', action: 'ajouter' })
    await expect(b.service.appliquer(forge)).rejects.toThrow('Cible inconnue')
    expect(b.depot.commits).toHaveLength(n)
  })
  test('refuse une session locale et récupérable avant toute acquisition', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    b.sessions.push('e1')
    await expect(b.service.appliquer(preparation)).rejects.toThrow('sessions locales ou récupérables')
    expect(b.depot.commits).toHaveLength(0)
  })
  test('refuse le bail tiers et rend les droits déjà acquis sans publication', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    const bob = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'bob', machineId: 'autre', sessionId: 's2' }) })
    await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/entretiens/e2.json'))
    await expect(b.service.appliquer(preparation)).rejects.toThrow('tenu par un autre poste')
    expect(commitsDonnees(b)).toHaveLength(0)
    expect((await bob.acquireRessource(cleRessourceBailGitLab('main', 'racine/corpus.json'))).ok).toBe(true)
  })
  test.each(['racine/corpus.json', 'racine/entretiens/e2.json'])('refuse la version modifiée après aperçu : %s', async (chemin) => {
    const b = banc(); const { preparation } = await preparer(b)
    const data = JSON.parse(b.depot.fichiers.get(chemin)!.contenu); data.lastModified = 'nouvelle-version'
    b.depot.modifierHorsProtocole(chemin, JSON.stringify(data))
    await expect(b.service.appliquer(preparation)).rejects.toThrow('a changé depuis l’aperçu')
    expect(commitsDonnees(b)).toHaveLength(0)
  })
  test('une garde perdue juste avant envoi refuse tout le groupe', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.file_path === 'racine/entretiens/e2.json')) {
        b.depot.modifierHorsProtocole('racine/entretiens/e2.json', JSON.stringify({ ...b.entretien, lastModified: 'autre' }))
      }
    }
    await expect(b.service.appliquer(preparation)).rejects.toThrow('refusée')
    expect(commitsDonnees(b)).toHaveLength(0)
    expect(JSON.parse(b.depot.fichiers.get('racine/entretiens/e1.json')!.contenu)).toEqual(b.entretien)
  })
  test('réponse perdue réconciliée sans second commit', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) b.depot.echouerApresAccepter(new Error('réponse perdue')) }
    await b.service.appliquer(preparation)
    expect(commitsDonnees(b)).toHaveLength(1)
    expect(b.journal.lister()).toEqual([])
  })
  test('résultat inconnu conservé en journal privé ; reprise sans rejeu après redémarrage', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    b.depot.avantCommit = (actions) => { if (actions.some((a) => a.file_path === 'racine/entretiens/e1.json')) { b.depot.echouerApresAccepter(new Error('réponse perdue')); b.depot.rendreCommitsIllisibles() } }
    await expect(b.service.appliquer(preparation)).rejects.toThrow('indéterminée')
    expect(b.journal.lister()).toHaveLength(1)
    const entree = b.journal.lister()[0]
    expect(entree.version).toBe(5); expect(entree.droits).toHaveLength(3)
    expect(statSync(join(b.dir, 'operations', 'candidates', entree.candidat)).mode & 0o777).toBe(0o600)
    await expect(b.service.appliquer(preparation)).rejects.toThrow('reste à réconcilier')
    const contexte = new ContexteGitLab('destination', b.store, { dirLocal: b.dir } as never, vi.fn(), new TransactionsGitLab(b.options))
    await expect(contexte.ouvrirSessionEntretien('e1')).rejects.toThrow('reste à réconcilier')
    b.depot.rendreCommits()
    const coordination = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 'relance' }) })
    await reprendreOperationsGitLab({ depot: b.depot, coordination, journal: b.journal, dirMiroir: b.dir })
    expect(b.journal.lister()).toEqual([]); expect(commitsDonnees(b)).toHaveLength(1)
    expect(readFileSync(join(b.dir, 'corpus.json'), 'utf8')).not.toContain('Alias sans occurrence')
  })
  test('le contexte empêche une ouverture pendant le ciblage et conserve les candidats récupérables', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    const ouvrirSession = vi.fn()
    const recuperables: string[] = []
    const contexte = new ContexteGitLab('destination', b.store, { dirLocal: b.dir } as never, ouvrirSession,
      new TransactionsGitLab(b.options), undefined, undefined, {
        client: new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }),
        branche: 'main', racine: 'racine', cheminsRecuperables: recuperables,
      })
    const publication = contexte.importerCorrespondances(preparation)
    await expect(contexte.ouvrirSessionEntretien('e1')).rejects.toThrow('import ciblé est en cours')
    await expect(contexte.ouvrirSession('directe', 'entretiens/e2.json')).rejects.toThrow('import ciblé est en cours')
    expect(ouvrirSession).not.toHaveBeenCalled()
    await publication
    const suivante = await preparer(b)
    recuperables.push('entretiens/e2.json')
    await expect(contexte.importerCorrespondances(suivante.preparation)).rejects.toThrow('récupérables')
  })
  test('limite annoncée refuse avant acquisition', async () => {
    const b = banc(); const { preparation } = await preparer(b)
    for (let i = 0; i < MAX_ENTRETIENS_IMPORT_GITLAB; i++) {
      const cible = { ...preparation.cibles[0], id: `c-${i}`, entretienId: `e-${i}` }
      preparation.cibles.push(cible); preparation.choixCibles.push({ cibleId: cible.id, action: 'ajouter' })
    }
    await expect(b.service.appliquer(preparation)).rejects.toThrow('limité à')
    expect(b.depot.commits).toHaveLength(0)
  })
})
