import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { CorpusStore } from '../src/main/corpusStore'
import { DissociationsAnon } from '../src/main/dissociationsAnon'
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
  const f = fixtureDissociationAnon()
  const dir = mkdtempSync(join(tmpdir(), 'dissociation-anon-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(f.corpus))
  for (const s of f.sources) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), JSON.stringify(s.data))
  let store = new CorpusStore(dir); store.ouvrir()
  let maintenant = Date.parse('2026-10-10T00:00:00.000Z'), local = true
  const cache = new DissociationsAnon({ store: () => store, maintenant: () => maintenant, local: () => local })
  const lire = (id = 'e1'): EntretienFichier => JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8'))
  const corpus = (): CorpusFichier => JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
  return { f, dir, get store() { return store }, cache, lire, corpus, preparer: () => cache.preparer(f.demande),
    changerStore: () => { store = new CorpusStore(dir) }, expirer: () => { maintenant += 300_001 }, distant: () => { local = false } }
}
describe('dissociation locale scellée et journalée', () => {
  test('clones sans autorité et publication interviews puis définition ; non-ciblé intact', () => {
    const b = banc(), avant = b.lire(), tiers = readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8'), a = b.preparer()
    a.demande.regleId = 'autre'; a.definitionLocale.pseudos = ['Forcée']; a.entretiens = []
    const r = b.cache.appliquer(a.token, true)
    expect(r).toMatchObject({ annotations: 8, exceptions: 2, incluses: 2, definitionsLocales: 2, entretiens: 2, regleRetiree: true })
    expect(b.lire().corpsTexte).toEqual(avant.corpsTexte)
    expect(b.lire().locuteurs).toEqual(avant.locuteurs)
    expect(b.lire().annotations.map((a) => a.pseudo)).toEqual(avant.annotations.map((a) => a.pseudo))
    expect(b.lire().definitionsAnonLocales!.at(-1)).toEqual({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
    expect(b.lire().lastModified).toBe('2026-10-10T00:00:00.000Z')
    expect(b.corpus().membership.e1.lastModified).toBe(b.lire().lastModified)
    expect(b.corpus().reglesAnon.personne).toBeUndefined()
    expect(b.corpus().reglesAnon.autre).toEqual(b.f.corpus.reglesAnon.autre)
    expect(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8')).toBe(tiers)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('consentement obligatoire et tentative à usage unique', () => {
    const b = banc(), a = b.preparer(), avant = b.lire()
    expect(() => b.cache.appliquer(a.token, false)).toThrow('Confirmez')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré')
    expect(b.lire()).toEqual(avant)
  })
  test.each(['source', 'non-cible', 'membre', 'regle', 'absent'] as const)('version ou membership périmés refuse tout le lot : %s', (cas) => {
    const b = banc(), a = b.preparer(), avant = b.lire()
    if (cas === 'source' || cas === 'non-cible') {
      const id = cas === 'source' ? 'e2' : 'e3'; writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify({ ...b.lire(id), lastModified: 'concurrent' }))
    }
    if (cas === 'absent') rmSync(join(b.dir, 'entretiens/e3.json'))
    if (cas === 'membre' || cas === 'regle') {
      const c = b.corpus()
      if (cas === 'regle') c.reglesAnon.personne.categorie = 'Autre catégorie'
      else c.membership.e4 = { titre: 'Nouveau', date: null, lastModified: 'concurrent' }
      writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(c))
    }
    expect(() => b.cache.appliquer(a.token, true)).toThrow('changé')
    expect(b.lire()).toEqual(avant); expect(b.corpus().reglesAnon.personne).toBeDefined()
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('session ouverte à l’aperçu ne devient pas une autorisation après fermeture ; sauvegarde tardive refusée', () => {
    const b = banc(); b.store.ouvrirEntretienPourEdition('e1')
    const a = b.preparer(); expect(a.applicationDisponible).toBe(false)
    b.store.revoquerEcritureEntretien('e1')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('recalculez')
    b.cache.appliquer(b.preparer().token, true)
    expect(() => b.store.exigerSessionLocaleEcriture('e1')).toThrow('session locale est fermée')
  })
  test('session ouverte après aperçu, même non ciblée, refuse le protocole local', () => {
    const b = banc(), a = b.preparer(); b.store.autoriserEcritureEntretien('e3')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('Fermez')
    expect(b.corpus().reglesAnon.personne).toBeDefined()
  })
  test('collision locale ou source indisponible ne crée aucun journal', () => {
    for (const collision of [true, false]) {
      const b = banc()
      if (collision) { const d = b.lire(); d.pseudosDeclares!.karine = ['Locale']; writeFileSync(join(b.dir, 'entretiens/e1.json'), JSON.stringify(d)) }
      else rmSync(join(b.dir, 'entretiens/e3.json'))
      const a = b.preparer(); expect(a.faisable).toBe(false)
      expect(() => b.cache.appliquer(a.token, true)).toThrow('obstacles')
      expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    }
  })
  test('expiration, fournisseur distant, changement de store et lecture seule refusent', () => {
    for (const action of ['expirer', 'distant', 'changerStore'] as const) {
      const b = banc(), a = b.preparer(); b[action]()
      expect(() => b.cache.appliquer(a.token, true)).toThrow(); expect(b.corpus().reglesAnon.personne).toBeDefined()
    }
    const b = banc(); b.store.lectureSeule = true
    expect(b.preparer().applicationDisponible).toBe(false)
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow()
  })
  test('refus de politique consomme lui aussi la tentative', () => {
    const b = banc(); let refus = false
    const cache = new DissociationsAnon({ store: () => b.store, local: () => true, exiger: () => { if (refus) throw new Error('Geste refusé.') } })
    const a = cache.preparer(b.f.demande); refus = true
    expect(() => cache.appliquer(a.token, true)).toThrow('Geste refusé')
    refus = false; expect(() => cache.appliquer(a.token, true)).toThrow('expiré')
  })
  test('cache borné ; aucun aperçu distant ni miroir de secours', () => {
    const b = banc(), a = b.preparer(); b.preparer(); b.preparer(); b.preparer()
    expect(() => b.cache.appliquer(a.token, true)).toThrow('expiré')
    b.distant(); expect(() => b.preparer()).toThrow('Aucun repli')
  })
  test.each(['entretien', 'corpus'] as const)('interruption avant %s : journal privé, définition gardée puis reprise sans rejeu', (etape) => {
    const b = banc(), a = b.preparer()
    injection.destination = etape === 'entretien' ? join(b.dir, 'entretiens/e2.json') : join(b.dir, 'corpus.json')
    expect(() => b.cache.appliquer(a.token, true)).toThrow('Interruption')
    const acquis = b.lire(), journal = join(b.dir, '.transaction-fichiers.json')
    expect(acquis.definitionsAnonLocales!.at(-1)!.entite).toEqual(['Karine'])
    expect(b.corpus().reglesAnon.personne).toBeDefined()
    expect(statSync(journal).mode & 0o777).toBe(0o600)
    expect(() => b.store.exigerDissociationAnonGlobale()).toThrow()
    injection.destination = ''
    new CorpusStore(b.dir).ouvrir()
    expect(b.lire()).toEqual(acquis)
    expect(b.lire('e2').annotations.some((a) => a.regle === 'personne')).toBe(false)
    expect(b.corpus().reglesAnon.personne).toBeUndefined()
    expect(existsSync(journal)).toBe(false)
  })
  test.each(['nouveau-lien', 'autre-changement', 'cible-suivante', 'acquis', 'corpus'] as const)('contrôle entre publications et avant retrait : %s', (cas) => {
    const b = banc()
    let concurrent: unknown
    injection.apresPremier = () => {
      if (cas === 'corpus') {
        const c = b.corpus(); c.reglesAnon.personne.categorie = 'Nouvelle catégorie'; concurrent = c
        writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(c)); return
      }
      const id = cas === 'acquis' ? 'e1' : cas === 'cible-suivante' ? 'e2' : 'e3'
      const d = b.lire(id)
      if (cas === 'nouveau-lien') d.annotations.push(structuredClone(b.f.sources[0].data.annotations[0]))
      else d.meta.valeursGen = { ...d.meta.valeursGen, 'concurrence-synthetique': 'Modification externe' }
      concurrent = d; writeFileSync(join(b.dir, `entretiens/${id}.json`), JSON.stringify(d))
    }
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow()
    expect(b.corpus().reglesAnon.personne).toBeDefined()
    if (cas === 'cible-suivante') expect(b.lire('e2')).toEqual(concurrent)
    if (cas === 'acquis') expect(b.lire()).toEqual(concurrent)
    if (cas === 'corpus') expect(b.corpus()).toEqual(concurrent)
    if (cas === 'nouveau-lien' || cas === 'autre-changement') expect(b.lire('e3')).toEqual(concurrent)
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
  })
  test('non-ciblé devenu lié pendant l’interruption : aucun élargissement de reprise ni suppression de règle', () => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow(); injection.destination = ''
    const acquis = b.lire(), tiers = b.lire('e3')
    tiers.annotations.push(structuredClone(b.f.sources[0].data.annotations[0]))
    writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(tiers))
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow('De nouveaux liens')
    expect(b.lire()).toEqual(acquis); expect(b.lire('e3')).toEqual(tiers)
    expect(b.corpus().reglesAnon.personne).toBeDefined()
    expect(b.lire('e2').annotations.some((a) => a.regle === 'personne')).toBe(true)
  })
  test.each(['copie', 'categorie', 'garde', 'version', 'garde-supprimee', 'corpus-final-premature'] as const)('journal modifié ne donne aucune autorité supplémentaire : %s', (cas) => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow(); injection.destination = ''
    const chemin = join(b.dir, '.transaction-fichiers.json'), j = JSON.parse(readFileSync(chemin, 'utf8')), acquis = b.lire()
    expect(j.formatVersion).toBe(3)
    if (cas === 'copie') j.plan.entretiens[1].apres.annotations[0].pseudo = 'Forcé'
    if (cas === 'categorie') j.plan.entretiens[1].apres.definitionsAnonLocales.at(-1).categorie = 'Forcée'
    if (cas === 'garde') j.plan.controleDissociation.nonCibles[0].id = '../autre'
    if (cas === 'version') j.formatVersion = 1
    if (cas === 'garde-supprimee') { j.formatVersion = 1; delete j.plan.controleDissociation }
    if (cas === 'corpus-final-premature') writeFileSync(join(b.dir, 'corpus.json'), JSON.stringify(j.plan.corpusApres))
    writeFileSync(chemin, JSON.stringify(j))
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
    expect(b.lire()).toEqual(acquis)
    expect(b.lire('e2').annotations.some((a) => a.regle === 'personne')).toBe(true)
  })
  test('une empreinte forgée ne dispense pas de prouver l’absence de nouveaux liens', () => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow(); injection.destination = ''
    const chemin = join(b.dir, '.transaction-fichiers.json'), j = JSON.parse(readFileSync(chemin, 'utf8')), tiers = b.lire('e3')
    tiers.annotations.push(structuredClone(b.f.sources[0].data.annotations[0]))
    writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(tiers))
    j.plan.controleDissociation.nonCibles[0].empreinte = createHash('sha256').update(JSON.stringify(tiers)).digest('hex')
    writeFileSync(chemin, JSON.stringify(j))
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow('De nouveaux liens')
    expect(b.lire('e3')).toEqual(tiers); expect(b.corpus().reglesAnon.personne).toBeDefined()
  })
  test('reprise avec source concurrente : jamais écrasée, définition non retirée de force', () => {
    const b = banc(); injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.cache.appliquer(b.preparer().token, true)).toThrow()
    injection.destination = ''
    const acquis = b.lire(), concurrent = { ...b.lire('e2'), lastModified: 'autre auteur' }
    writeFileSync(join(b.dir, 'entretiens/e2.json'), JSON.stringify(concurrent))
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow()
    expect(b.lire()).toEqual(acquis); expect(b.lire('e2')).toEqual(concurrent)
    expect(b.corpus().reglesAnon.personne).toBeDefined()
  })
})
