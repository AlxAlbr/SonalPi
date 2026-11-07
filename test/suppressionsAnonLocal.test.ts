import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { CorpusStore } from '../src/main/corpusStore'
import { SuppressionsAnon } from '../src/main/suppressionsAnon'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

const injection = vi.hoisted(() => ({ destination: '', apresPremier: null as (() => void) | null }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (injection.destination && String(args[1]) === injection.destination) throw new Error('Interruption synthétique.')
    fs.renameSync(...args)
    if (injection.apresPremier && String(args[1]).endsWith('/entretiens/e1.json')) {
      const action = injection.apresPremier; injection.apresPremier = null; action()
    }
  } }
})
const dossiers: string[] = []
afterEach(() => { injection.destination = ''; injection.apresPremier = null; for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc() {
  const f = fixtureDissociationAnon(), dir = mkdtempSync(join(tmpdir(), 'suppression-anon-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(f.corpus))
  for (const s of f.sources) writeFileSync(join(dir, `entretiens/${s.id}.json`), JSON.stringify(s.data))
  let store = new CorpusStore(dir); store.ouvrir()
  let maintenant = Date.parse('2026-10-11T00:00:00.000Z'), local = true, refus = false
  const cache = new SuppressionsAnon({ store: () => store, maintenant: () => maintenant, local: () => local, exiger: () => { if (refus) throw new Error('Politique refusée.') } })
  const lire = (id = 'e1'): EntretienFichier => JSON.parse(readFileSync(join(dir, `entretiens/${id}.json`), 'utf8'))
  const corpus = (): CorpusFichier => JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))
  const fichier = join(dir, '.transaction-fichiers.json')
  return { f, dir, fichier, get store() { return store }, cache, lire, corpus, preparer: () => cache.preparer(f.demande),
    changerStore: () => { store = new CorpusStore(dir) }, expirer: () => { maintenant += 300_001 }, distant: () => { local = false }, refuser: () => { refus = true }, autoriser: () => { refus = false } }
}
describe('suppression locale privée et journal version 4', () => {
  test('clones sans autorité, retrait exact et non-ciblé intact', () => {
    const b = banc(), avant = b.lire(), tiers = readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8'), a = b.preparer()
    a.demande.regleId = 'autre'; a.entretiens = []; a.bilan.annotations = 0
    expect(b.cache.appliquer(a.token, true)).toMatchObject({ annotations: 8, exceptions: 2, inclusesRetirees: 2, entretiens: 2 })
    expect(b.lire()).toEqual({ ...avant, annotations: avant.annotations.filter((a) => a.regle !== 'personne'), lastModified: '2026-10-11T00:00:00.000Z' })
    expect(b.corpus().membership.e1.lastModified).toBe(b.lire().lastModified)
    expect(b.corpus().reglesAnon.personne).toBeUndefined(); expect(b.corpus().reglesAnon.autre).toEqual(b.f.corpus.reglesAnon.autre)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toBe(tiers)
    expect(existsSync(b.fichier)).toBe(false)
  })
  test('confirmation explicite, politique et tentative consommée même en échec', () => {
    const b = banc(), a = b.preparer()
    expect(() => b.cache.appliquer(a.token, false)).toThrow('Confirmez')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré')
    const p = b.preparer(); b.refuser()
    expect(() => b.cache.appliquer(p.token, true)).toThrow('Politique')
    b.autoriser(); expect(() => b.cache.appliquer(p.token, true)).toThrow('expiré')
    expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['expirer', 'distant', 'changerStore'] as const)('TTL, fournisseur et identité du store refusés : %s', (action) => {
    const b = banc(), p = b.preparer(); b[action]()
    expect(() => b.cache.appliquer(p.token, true)).toThrow()
    expect(b.corpus().reglesAnon.personne).toBeDefined()
    if (action === 'distant') expect(() => b.preparer()).toThrow('Aucun repli')
  })
  test('cache de trois préparations et lecture seule', () => {
    const b = banc(), p = b.preparer(); b.preparer(); b.preparer(); b.preparer()
    expect(() => b.cache.appliquer(p.token, true)).toThrow('expiré')
    b.store.lectureSeule = true; const r = b.preparer(); expect(r.applicationDisponible).toBe(false)
    expect(() => b.cache.appliquer(r.token, true)).toThrow()
  })
  test.each(['cible', 'non-cible', 'corpus', 'absence'] as const)('empreintes complètes périmées refusent : %s', (cas) => {
    const b = banc(), p = b.preparer(), avant = b.lire()
    if (cas === 'cible' || cas === 'non-cible') {
      const id = cas === 'cible' ? 'e2' : 'e3'
      writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify({ ...b.lire(id), lastModified: 'concurrent' }))
    } else if (cas === 'absence') rmSync(join(b.dir, 'entretiens/e3.json'))
    else { const c = b.corpus(); c.reglesAnon.personne.categorie = 'Concurrente'; writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(c)) }
    expect(() => b.cache.appliquer(p.token, true)).toThrow('changé'); expect(b.lire()).toEqual(avant)
    expect(existsSync(b.fichier)).toBe(false)
  })
  test('fermeture ultérieure n’autorise pas l’aperçu ; sauvegarde tardive refusée', () => {
    const b = banc(); b.store.ouvrirEntretienPourEdition('e1')
    const p = b.preparer(); expect(p.applicationDisponible).toBe(false)
    b.store.revoquerEcritureEntretien('e1')
    expect(() => b.cache.appliquer(p.token, true)).toThrow('recalculez')
    b.cache.appliquer(b.preparer().token, true)
    expect(() => b.store.exigerSessionLocaleEcriture('e1')).toThrow('fermée')
  })
  test('session non ciblée ouverte après aperçu refuse aussi le protocole local', () => {
    const b = banc(), p = b.preparer(); b.store.autoriserEcritureEntretien('e3')
    expect(() => b.cache.appliquer(p.token, true)).toThrow('Fermez')
    expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['entretien', 'corpus'] as const)('interruption avant %s : acquis conservé et reprise idempotente', (etape) => {
    const b = banc(), p = b.preparer()
    injection.destination = join(b.dir, etape === 'entretien' ? 'entretiens/e2.json' : 'corpus.crp')
    expect(() => b.cache.appliquer(p.token, true)).toThrow('Interruption')
    expect(JSON.parse(readFileSync(b.fichier, 'utf8')).formatVersion).toBe(4)
    expect(statSync(b.fichier).mode & 0o777).toBe(0o600)
    const acquis = readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8'), date = statSync(join(b.dir, 'entretiens/e1.json')).mtimeMs
    expect(b.corpus().reglesAnon.personne).toBeDefined()
    expect(() => b.store.exigerSuppressionAnonGlobale()).toThrow('transaction')
    injection.destination = ''; new CorpusStore(b.dir).ouvrir()
    expect(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).toBe(acquis)
    expect(statSync(join(b.dir, 'entretiens/e1.json')).mtimeMs).toBe(date)
    expect(b.corpus().reglesAnon.personne).toBeUndefined(); expect(existsSync(b.fichier)).toBe(false)
  })
  test.each(['cible', 'acquis', 'non-cible', 'nouveau-lien', 'corpus'] as const)('concurrence entre remplacements suspend sans réparer : %s', (cas) => {
    const b = banc()
    injection.apresPremier = () => {
      if (cas === 'corpus') { const c = b.corpus(); c.nom = 'Concurrent'; writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(c)); return }
      const id = cas === 'cible' ? 'e2' : cas === 'acquis' ? 'e1' : 'e3', d = b.lire(id)
      if (cas === 'nouveau-lien') d.annotations.push(structuredClone(b.f.sources[0].data.annotations[0]))
      else d.lastModified = 'concurrent'
      writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify(d))
    }
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow()
    expect(b.corpus().reglesAnon.personne).toBeDefined(); expect(existsSync(b.fichier)).toBe(true)
    const acquis = readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
    expect(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).toBe(acquis)
  })
  test.each(['apres', 'memoire', 'garde', 'version', 'hash-forge', 'final-premature'] as const)('journal altéré ou preuve insuffisante refusés : %s', (cas) => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow('Interruption'); injection.destination = ''
    const j = JSON.parse(readFileSync(b.fichier, 'utf8'))
    if (cas === 'apres') j.plan.entretiens[1].apres.annotations = []
    if (cas === 'memoire') j.plan.entretiens[1].apres.definitionsAnonLocales = []
    if (cas === 'garde') delete j.plan.controleSuppressionAnon
    if (cas === 'version') j.formatVersion = 1
    if (cas === 'hash-forge') {
      const d = b.lire('e3'); d.annotations.push(structuredClone(b.f.sources[0].data.annotations[0]))
      writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(d))
      j.plan.controleSuppressionAnon.nonCibles[0].empreinte = createHash('sha256').update(JSON.stringify(d)).digest('hex')
    }
    if (cas === 'final-premature') writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(j.plan.corpusApres))
    writeFileSync(b.fichier, JSON.stringify(j))
    const avant = b.lire('e2'); expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
    expect(b.lire('e2')).toEqual(avant)
  })
})
