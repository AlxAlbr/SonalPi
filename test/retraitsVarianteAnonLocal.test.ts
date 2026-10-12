import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { CorpusStore } from '../src/main/corpusStore'
import { RetraitsVarianteAnon } from '../src/main/retraitsVarianteAnon'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

const injection = vi.hoisted(() => ({ destination: '', apresPremier: null as (() => void) | null }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (injection.destination && String(args[1]) === injection.destination) throw new Error('Interruption synthétique.')
    fs.renameSync(...args)
    if (injection.apresPremier && String(args[1]).endsWith('/entretiens/e1.json')) { const action = injection.apresPremier; injection.apresPremier = null; action() }
  } }
})
const dossiers: string[] = []
afterEach(() => { injection.destination = ''; injection.apresPremier = null; for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc() {
  const f = fixtureRetraitVarianteAnon(), dir = mkdtempSync(join(tmpdir(), 'retrait-variante-anon-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens')); writeFileSync(join(dir, 'corpus.json'), JSON.stringify(f.corpus))
  for (const s of f.sources) writeFileSync(join(dir, `entretiens/${s.id}.json`), JSON.stringify(s.data))
  let store = new CorpusStore(dir); store.ouvrir()
  let maintenant = Date.parse('2026-10-11T00:00:00.000Z'), local = true, refus = false
  const cache = new RetraitsVarianteAnon({ store: () => store, maintenant: () => maintenant, local: () => local, exiger: () => { if (refus) throw new Error('Politique refusée.') } })
  const lire = (id = 'e1'): EntretienFichier => JSON.parse(readFileSync(join(dir, `entretiens/${id}.json`), 'utf8'))
  const corpus = (): CorpusFichier => JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
  const fichier = join(dir, '.transaction-fichiers.json')
  return { f, dir, fichier, get store() { return store }, cache, lire, corpus, preparer: () => cache.preparer(f.demande),
    changerStore: () => { store = new CorpusStore(dir) }, expirer: () => { maintenant += 300_001 }, distant: () => { local = false }, refuser: () => { refus = true }, autoriser: () => { refus = false } }
}
describe('retrait de variante local, aperçu privé et journal version 5', () => {
  test('public modifiable sans autorité, repli exact et non-ciblé même lié intact', () => {
    const b = banc(), avant = b.lire(), tiers = readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8'), p = b.preparer()
    p.demande.pseudoConserve = 'Faux'; p.regle.pseudos = []; p.entretiens = []; p.bilan.annotations = 0
    expect(b.cache.appliquer(p.token, true)).toMatchObject({ annotations: 6, exceptions: 3, incluses: 2, entretiens: 2 })
    const attendu = structuredClone(avant); for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'Rebecca'
    attendu.lastModified = '2026-10-11T00:00:00.000Z'
    expect(b.lire()).toEqual(attendu); expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Rebecca'])
    expect(b.corpus().membership.e1.lastModified).toBe(attendu.lastModified)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toBe(tiers); expect(existsSync(b.fichier)).toBe(false)
  })
  test('variante inutilisée : seul corpus.json change, même avec des liens vers la variante restante', () => {
    const b = banc()
    for (const id of ['e1', 'e2']) {
      const d = b.lire(id); for (const a of d.annotations) if (a.regle === 'personne') a.pseudo = 'Rebecca'
      writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify(d))
    }
    const avant = ['e1', 'e2', 'e3'].map((id) => ({ chemin: join(b.dir, `entretiens/${id}.json`), data: readFileSync(join(b.dir, `entretiens/${id}.json`), 'utf8'), date: statSync(join(b.dir, `entretiens/${id}.json`)).mtimeMs }))
    const membership = b.corpus().membership
    expect(b.cache.appliquer(b.preparer().token, true)).toMatchObject({ annotations: 0, entretiens: 0, varianteRetiree: true })
    for (const f of avant) { expect(readFileSync(f.chemin, 'utf8')).toBe(f.data); expect(statSync(f.chemin).mtimeMs).toBe(f.date) }
    expect(b.corpus().membership).toEqual(membership); expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Rebecca'])
  })
  test('confirmation et politique explicites, tentatives consommées même sur refus', () => {
    const b = banc(), p = b.preparer(); expect(() => b.cache.appliquer(p.token, false)).toThrow('Confirmez')
    expect(() => b.cache.appliquer(p.token, true)).toThrow('expiré')
    const q = b.preparer(); b.refuser(); expect(() => b.cache.appliquer(q.token, true)).toThrow('Politique')
    b.autoriser(); expect(() => b.cache.appliquer(q.token, true)).toThrow('expiré'); expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['expirer', 'distant', 'changerStore'] as const)('TTL, fournisseur et store recontrôlés : %s', (action) => {
    const b = banc(), p = b.preparer(); b[action](); expect(() => b.cache.appliquer(p.token, true)).toThrow()
    expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    if (action === 'distant') expect(() => b.preparer()).toThrow('Aucun repli')
  })
  test('cache borné et lecture seule', () => {
    const b = banc(), p = b.preparer(); b.preparer(); b.preparer(); b.preparer()
    expect(() => b.cache.appliquer(p.token, true)).toThrow('expiré')
    b.store.lectureSeule = true; const q = b.preparer(); expect(q.applicationDisponible).toBe(false)
    expect(() => b.cache.appliquer(q.token, true)).toThrow()
  })
  test.each(['cible', 'non-cible', 'corpus', 'absence'] as const)('empreintes complètes : %s', (cas) => {
    const b = banc(), p = b.preparer(), avant = b.lire()
    if (cas === 'cible' || cas === 'non-cible') { const id = cas === 'cible' ? 'e2' : 'e3'; writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify({ ...b.lire(id), lastModified: 'concurrent' })) }
    else if (cas === 'absence') rmSync(join(b.dir, 'entretiens/e3.json'))
    else { const c = b.corpus(); c.reglesAnon.personne.categorie = 'Concurrente'; writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(c)) }
    expect(() => b.cache.appliquer(p.token, true)).toThrow('changé'); expect(b.lire()).toEqual(avant); expect(existsSync(b.fichier)).toBe(false)
  })
  test('une fermeture ultérieure ne donne pas d’autorité au bilan ; sauvegarde tardive refusée', () => {
    const b = banc(); b.store.ouvrirEntretienPourEdition('e1'); const p = b.preparer(); expect(p.applicationDisponible).toBe(false)
    b.store.revoquerEcritureEntretien('e1'); expect(() => b.cache.appliquer(p.token, true)).toThrow('recalculez')
    b.cache.appliquer(b.preparer().token, true); expect(() => b.store.exigerSessionLocaleEcriture('e1')).toThrow('fermée')
  })
  test('une session non ciblée ouverte après le bilan refuse le premier protocole local', () => {
    const b = banc(), p = b.preparer(); b.store.autoriserEcritureEntretien('e3')
    expect(() => b.cache.appliquer(p.token, true)).toThrow('Fermez'); expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['entretien', 'corpus'] as const)('interruption avant %s : reprise sans retoucher les acquis', (etape) => {
    const b = banc(); injection.destination = join(b.dir, etape === 'entretien' ? 'entretiens/e2.json' : 'corpus.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow('Interruption')
    expect(JSON.parse(readFileSync(b.fichier, 'utf8')).formatVersion).toBe(5); expect(statSync(b.fichier).mode & 0o777).toBe(0o600)
    const acquis = readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8'), date = statSync(join(b.dir, 'entretiens/e1.json')).mtimeMs
    expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(() => b.store.exigerRetraitVarianteAnon()).toThrow('transaction')
    injection.destination = ''; new CorpusStore(b.dir).ouvrir()
    expect(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).toBe(acquis); expect(statSync(join(b.dir, 'entretiens/e1.json')).mtimeMs).toBe(date)
    expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Rebecca']); expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['cible', 'acquis', 'non-cible', 'nouveau-choix', 'corpus'] as const)('concurrence entre remplacements suspend sans réparer : %s', (cas) => {
    const b = banc()
    injection.apresPremier = () => {
      if (cas === 'corpus') { const c = b.corpus(); c.nom = 'Concurrent'; writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(c)); return }
      const id = cas === 'cible' ? 'e2' : cas === 'acquis' ? 'e1' : 'e3', d = b.lire(id)
      if (cas === 'nouveau-choix') d.annotations.find((a) => a.id === 'a0')!.pseudo = 'Claire'
      else d.lastModified = 'concurrent'
      writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify(d))
    }
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow()
    expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca']); expect(existsSync(b.fichier)).toBe(true)
    const acquis = readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8'); expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
    expect(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).toBe(acquis)
  })
  test.each(['apres', 'etat', 'memoire', 'garde', 'version', 'hash-forge', 'final-premature', 'definition', 'repli', 'partition', 'operation'] as const)('journal altéré ou preuve insuffisante : %s', (cas) => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow('Interruption'); injection.destination = ''
    const j = JSON.parse(readFileSync(b.fichier, 'utf8'))
    if (cas === 'apres') j.plan.entretiens[1].apres.annotations = []
    if (cas === 'etat') j.plan.entretiens[1].apres.annotations.find((a: { id: string }) => a.id === 'a2').etat = 'anonymise'
    if (cas === 'memoire') j.plan.entretiens[1].apres.definitionsAnonLocales = []
    if (cas === 'garde') delete j.plan.controleRetraitVariante
    if (cas === 'version') j.formatVersion = 1
    if (cas === 'operation') { j.formatVersion = 1; delete j.plan.controleRetraitVariante; j.plan.operation = 'suppression'; j.plan.deplacements = [] }
    if (cas === 'definition') j.plan.corpusApres.reglesAnon.autre.pseudos = ['Intrus']
    if (cas === 'repli') j.plan.controleRetraitVariante.demande.pseudoConserve = 'Nouvelle'
    if (cas === 'partition') j.plan.controleRetraitVariante.nonCibles = []
    if (cas === 'hash-forge') {
      const d = b.lire('e3'); d.annotations.find((a) => a.id === 'a0')!.pseudo = 'Claire'; writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(d))
      j.plan.controleRetraitVariante.nonCibles[0].empreinte = createHash('sha256').update(JSON.stringify(d)).digest('hex')
    }
    if (cas === 'final-premature') writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(j.plan.corpusApres))
    writeFileSync(b.fichier, JSON.stringify(j)); const avant = b.lire('e2')
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow(); expect(b.lire('e2')).toEqual(avant)
  })
})
