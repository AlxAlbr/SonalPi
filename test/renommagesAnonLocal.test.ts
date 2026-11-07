import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CorpusStore } from '../src/main/corpusStore'
import { RenommagesAnon } from '../src/main/renommagesAnon'
import { fixtureRenommageAnon } from './fixtures/renommageAnon'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { exigerGeste, matriceCapacites } from '../src/main/gitlab/politiqueGestes'

const injection = vi.hoisted(() => ({ destination: '' }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (injection.destination && String(args[1]) === injection.destination) throw new Error('Interruption synthétique.')
    fs.renameSync(...args)
  } }
})
const dossiers: string[] = []
afterEach(() => { injection.destination = ''; for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function banc() {
  const f = fixtureRenommageAnon()
  const dir = mkdtempSync(join(tmpdir(), 'renommage-anon-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(f.corpus))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify(s.data))
  let store = new CorpusStore(dir); store.ouvrir()
  let maintenant = Date.parse('2026-10-10T00:00:00.000Z'), local = true
  const cache = new RenommagesAnon({ store: () => store, maintenant: () => maintenant, local: () => local })
  const lire = (id = 'e1'): EntretienFichier => JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8'))
  const corpus = (): CorpusFichier => JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))
  return { dir, get store() { return store }, cache, lire, corpus, preparer: () => cache.preparer(f.demande),
    changerStore: () => { store = new CorpusStore(dir) }, expirer: () => { maintenant += 300_001 }, distant: () => { local = false } }
}
describe('renommage global local avec inventaire privé', () => {
  test('publication durable préserve toutes les décisions, mémoires et identités non ciblées', () => {
    const b = banc(), avant = b.lire(), c = b.corpus(), a = b.preparer()
    a.demande.nouveauPseudo = 'Valeur forgée'; a.regle.entite = ['Identité forgée']; a.entretiens[0].usages = []
    expect(b.cache.appliquer(a.token, true)).toEqual({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true })
    const attendu = structuredClone(avant)
    attendu.lastModified = '2026-10-10T00:00:00.000Z'
    for (const x of attendu.annotations) if (['a0', 'a5'].includes(x.id)) x.pseudo = 'Nouvelle'
    expect(b.lire()).toEqual(attendu); expect(b.lire('e2')).toEqual(attendu)
    expect(b.corpus().reglesAnon.personne).toEqual({ ...c.reglesAnon.personne, pseudos: ['Nouvelle', 'Rebecca'] })
    expect(b.corpus().membership.e1.lastModified).toBe(attendu.lastModified)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré')
  })
  test('confirmer est obligatoire et chaque tentative consomme le jeton', () => {
    const b = banc(), a = b.preparer(), avant = b.lire()
    expect(() => b.cache.appliquer(a.token, false)).toThrow('Confirmez')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré'); expect(b.lire()).toEqual(avant)
  })
  test.each(['entretien', 'regle', 'membre', 'absent'] as const)('une source modifiée après aperçu refuse toute publication : %s', (cas) => {
    const b = banc(), a = b.preparer(), avant = b.lire()
    if (cas === 'entretien') writeFileSync(join(b.dir, 'entretiens/e2.json'), JSON.stringify({ ...b.lire('e2'), lastModified: 'concurrent' }))
    if (cas === 'absent') rmSync(join(b.dir, 'entretiens/e2.json'))
    if (cas === 'regle' || cas === 'membre') {
      const c = b.corpus()
      if (cas === 'regle') c.reglesAnon.personne.categorie = 'Nouvelle catégorie'
      else c.membership.e3 = { titre: 'Nouveau membre', date: null, lastModified: 'concurrent' }
      writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(c))
    }
    expect(() => b.cache.appliquer(a.token, true)).toThrow('changé'); expect(b.lire()).toEqual(avant)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('un entretien en édition, même sans usage, bloque ; fermeture impose un nouvel inventaire', () => {
    const b = banc(), avant = b.lire()
    b.store.autoriserEcritureEntretien('sans-usage')
    const a = b.preparer(); expect(a.applicationDisponible).toBe(false)
    b.store.revoquerEcritureEntretien('sans-usage')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('recalculez')
    const frais = b.preparer(); b.store.ouvrirEntretienPourEdition('e2')
    expect(() => b.cache.appliquer(frais.token, true)).toThrow('Fermez tous')
    b.store.revoquerEcritureEntretien('e2'); b.cache.appliquer(b.preparer().token, true)
    expect(() => b.store.exigerSessionLocaleEcriture('e2')).toThrow('session locale est fermée')
    expect(b.lire().annotations[0].pseudo).toBe('Nouvelle')
  })
  test('expiration, changements de store et de fournisseur ne réutilisent pas un aperçu', () => {
    for (const changer of ['expirer', 'changerStore', 'distant'] as const) {
      const b = banc(), a = b.preparer(); b[changer]()
      expect(() => b.cache.appliquer(a.token, true)).toThrow()
      expect(b.lire().annotations[0].pseudo).toBe('Claire')
      if (changer === 'distant') expect(() => b.preparer()).toThrow('fournisseur distant')
    }
  })
  test('cache limité à trois aperçus', () => {
    const b = banc(), a = b.preparer(); b.preparer(); b.preparer(); b.preparer()
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré')
  })
  test('lecture bornée avant décodage et aperçu de plus de 8 Mio refusé sans écriture', () => {
    const b = banc(), avant = b.lire()
    const budget = statSync(join(b.dir, 'corpus.crp')).size + statSync(join(b.dir, 'entretiens/e1.json')).size
    const s = b.store.instantaneCorrespondances(true, budget)
    expect(s.entretiens[0].ok).toBe(true); expect(s.entretiens[1].ok).toBe(false)
    expect(() => b.store.instantaneCorrespondances(true, 1)).toThrow('limite de lecture')
    expect(() => b.cache.preparer({ regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'N'.repeat(8 * 1024 * 1024) })).toThrow('8 Mio')
    expect(b.lire()).toEqual(avant)
  })
  test('lecture seule et store de préparation n’obtiennent aucune autorité d’écriture', () => {
    const b = banc(); b.store.lectureSeule = true
    let a = b.preparer(); expect(a.applicationDisponible).toBe(false)
    expect(() => b.cache.appliquer(a.token, true)).toThrow('pas modifiable directement')
    b.store.activerModePreparation([], true); a = b.preparer()
    expect(() => b.store.avecEcritureCorpus(() => b.cache.appliquer(a.token, true))).toThrow('service qualifié')
  })
  test('une définition inutilisée est journalisée seule et un libellé inchangé ne réécrit rien', () => {
    const b = banc(), avant = b.lire()
    const a = b.cache.preparer({ regleId: 'vide', ancienPseudo: 'Inutilisée', nouveauPseudo: 'Autre' })
    expect(b.cache.appliquer(a.token, true)).toEqual({ annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: true })
    expect(b.lire()).toEqual(avant)
    const c = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
    const identique = b.cache.preparer({ regleId: 'vide', ancienPseudo: 'Autre', nouveauPseudo: 'Autre' })
    expect(b.cache.appliquer(identique.token, true).definitionModifiee).toBe(false)
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(c)
  })
  test.each([['e2', false], ['corpus', false], ['e2', true]] as const)('interruption avant %s, concurrence %s : acquis conservés et reprise gardée', (destination, concurrence) => {
    const b = banc(), avant = b.lire('e2'), a = b.preparer()
    injection.destination = destination === 'corpus' ? join(b.dir, 'corpus.crp') : join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('Interruption synthétique')
    expect(b.lire().annotations[0].pseudo).toBe('Nouvelle')
    expect(b.corpus().reglesAnon.personne.pseudos[0]).toBe('Claire')
    const journal = join(b.dir, '.transaction-fichiers.json')
    expect(statSync(journal).mode & 0o777).toBe(0o600)
    expect(() => b.store.ouvrirEntretienPourEdition('e2')).toThrow('transaction reste à reprendre')
    expect(b.preparer().applicationDisponible).toBe(false)
    injection.destination = ''
    if (concurrence) {
      const modifie = { ...avant, lastModified: 'concurrent' }
      writeFileSync(join(b.dir, 'entretiens/e2.json'), JSON.stringify(modifie))
      expect(() => new CorpusStore(b.dir).ouvrir()).toThrow('changé')
      expect(b.lire('e2')).toEqual(modifie); expect(existsSync(journal)).toBe(true)
    } else {
      const acquis = b.lire(); new CorpusStore(b.dir).ouvrir()
      expect(b.lire()).toEqual(acquis); expect(b.lire('e2')).toEqual(acquis)
      expect(b.corpus().reglesAnon.personne.pseudos).toEqual(['Nouvelle', 'Rebecca'])
      expect(existsSync(journal)).toBe(false)
    }
  })
  test('local, GitLab et WebDAV accordent le renommage qualifié', () => {
    for (const fournisseur of ['local', 'gitlab', 'webdav'] as const) {
      expect(matriceCapacites(fournisseur).pseudonymisationGlobale).toBe(true)
      expect(() => exigerGeste(fournisseur, 'anon.renommer-variante')).not.toThrow()
    }
  })
})
