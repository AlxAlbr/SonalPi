import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { SuppressionsAnonGitLab } from '../../src/main/gitlab/suppressionsAnon'
import { BailGitLab } from '../../src/main/gitlab/bailGitLab'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { FileOperationsContexte } from '../../src/main/gitlab/fileOperations'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import { fixtureDissociationAnon } from './dissociationAnon'
import { DepotMemoire } from '../gitlab/depotMemoire'

export function fixtureSuppressionAnonGitLab(dossiers: string[], nombre = 3) {
  const f = fixtureDissociationAnon(Array.from({ length: nombre }, (_, i) => `e${i + 1}`))
  f.sources.slice(2).forEach((s) => { s.data.annotations = [] })
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const dir = mkdtempSync(join(tmpdir(), 'suppression-gitlab-')); dossiers.push(dir); mkdirSync(join(dir, 'entretiens'))
  const miroir = structuredClone(f.corpus); miroir.reglesAnon.personne.pseudos = ['Miroir périmé']
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(miroir))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify({ ...s.data, lastModified: 'miroir-périmé' }))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const depot = new DepotMemoire()
  depot.charger(new Map([['racine/corpus.crp', JSON.stringify(f.corpus)], ...f.sources.map((s) => [`racine/entretiens/${s.id}.json`, JSON.stringify(s.data)] as [string, string])]))
  const coordination = new BailGitLab({ branche: 'main', depot, identite: () => ({ userId: 'alice', machineId: 'poste', sessionId: 's1' }) })
  const journal = new JournalPublicationGitLab('destination', join(dir, 'operations'))
  const publication = new PublieurGitLab({ branche: 'main', depot, coordination, journal, attendre: async () => {} })
  const options = { destination: { fournisseur: 'gitlab' as const, id: 'destination', compteId: 'alice', projetId: 1, nomProjet: 'Projet', branche: 'main', racine: 'racine' }, store, depot, coordination, journal, publication, file: new FileOperationsContexte() }
  const sessions: string[] = []
  let maintenant = Date.now()
  const service = new SuppressionsAnonGitLab(options, () => sessions, () => maintenant)
  const lire = (id: string): EntretienFichier => JSON.parse(depot.fichiers.get(`racine/entretiens/${id}.json`)!.contenu)
  const cp = (): CorpusFichier => JSON.parse(depot.fichiers.get('racine/corpus.crp')!.contenu)
  const changer = (id: string, fn: (e: EntretienFichier) => void) => { const e = lire(id); fn(e); depot.modifierHorsProtocole(`racine/entretiens/${id}.json`, JSON.stringify(e)) }
  const changerCorpus = (fn: (c: CorpusFichier) => void) => { const c = cp(); fn(c); depot.modifierHorsProtocole('racine/corpus.crp', JSON.stringify(c)) }
  return { ...f, dir, store, depot, coordination, journal, publication, options, sessions, service, lire, cp, changer, changerCorpus,
    expirer: () => { maintenant += 300_001 }, preparer: () => service.preparer(f.demande) }
}
