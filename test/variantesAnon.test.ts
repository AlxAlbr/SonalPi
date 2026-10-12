import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ajouterVarianteAnon } from '../src/shared/corpus/variantesAnon'
import { CorpusStore } from '../src/main/corpusStore'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import { exigerGeste, matriceCapacites } from '../src/main/gitlab/politiqueGestes'

const injection = vi.hoisted(() => ({ corpus: '' }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (injection.corpus && String(args[1]) === injection.corpus) throw new Error('Interruption avant remplacement.')
    fs.renameSync(...args)
  } }
})

function fixture() {
  const f = fixtureDissociationAnon()
  f.sources.forEach((s, index) => { f.corpus.membership[s.id].rangAjout = index })
  return { ...f, demande: { regleAvant: structuredClone(f.corpus.reglesAnon.vide), pseudo: 'Nouvelle variante' } }
}
const dossiers: string[] = []
afterEach(() => { injection.corpus = ''; dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })) })
function banc() {
  const f = fixture(), dir = mkdtempSync(join(tmpdir(), 'ajout-variante-')); dossiers.push(dir)
  mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(f.corpus))
  f.sources.forEach((s) => writeFileSync(join(dir, `entretiens/${s.id}.json`), JSON.stringify(s.data)))
  const store = new CorpusStore(dir); store.ouvrir()
  const fichiers = () => new Map(f.sources.map((s) => [s.id, { contenu: readFileSync(join(dir, `entretiens/${s.id}.json`), 'utf8'), date: statSync(join(dir, `entretiens/${s.id}.json`)).mtimeMs }]))
  return { f, dir, store, fichiers, corpus: () => JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')) }
}
describe('ajout de variante sans publication d’entretien', () => {
  test('seule la liste déclarée change ; ordre, catégorie, identités et copies publiques conservés', () => {
    const f = fixture(), avant = structuredClone(f), r = ajouterVarianteAnon(f.corpus, f.demande)
    expect(r).toMatchObject({ ajoute: true, regle: { id: 'vide', pseudos: ['Inutilisée', 'Nouvelle variante'] } })
    avant.corpus.reglesAnon.vide.pseudos.push('Nouvelle variante')
    expect(f).toEqual(avant)
    r.regle.pseudos[0] = 'faux'; expect(f.corpus.reglesAnon.vide.pseudos[0]).toBe('Inutilisée')
  })
  test('NFC et espaces sont normalisés, sans déplacer ni remplacer la première variante', () => {
    const f = fixture(); f.demande.pseudo = '  Re\u0301becca  '
    expect(ajouterVarianteAnon(f.corpus, f.demande).regle.pseudos).toEqual(['Inutilisée', 'Rébecca'])
  })
  test.each(['Inutilisée', ' inutilisée ', 'INUTILISE\u0301E'])('doublon %s : aucune mutation', (pseudo) => {
    const f = fixture(), avant = structuredClone(f.corpus); f.demande.pseudo = pseudo
    expect(ajouterVarianteAnon(f.corpus, f.demande).ajoute).toBe(false); expect(f.corpus).toEqual(avant)
  })
  test.each(['', ' ', '\n'])('pseudo vide %j refusé avant mutation', (pseudo) => {
    const f = fixture(), avant = structuredClone(f.corpus); f.demande.pseudo = pseudo
    expect(() => ajouterVarianteAnon(f.corpus, f.demande)).toThrow('non vide'); expect(f.corpus).toEqual(avant)
  })
  test.each(['pseudos', 'entite', 'categorie', 'id'] as const)('définition périmée par %s refusée', (champ) => {
    const f = fixture()
    if (champ === 'pseudos') f.corpus.reglesAnon.vide.pseudos[0] = 'Autre'
    if (champ === 'entite') f.corpus.reglesAnon.vide.entite[0] = 'Autre nom'
    if (champ === 'categorie') f.corpus.reglesAnon.vide.categorie = 'PER'
    if (champ === 'id') delete f.corpus.reglesAnon.vide
    const avant = structuredClone(f.corpus)
    expect(() => ajouterVarianteAnon(f.corpus, f.demande)).toThrow(champ === 'id' ? 'n’existe plus' : 'a changé')
    expect(f.corpus).toEqual(avant)
  })
  test.each(['multi-alias', 'deux-variantes', 'non-canonique', 'mauvaise-identite', 'suppression', 'dissociation'] as const)('refus sans perte : %s', (cas) => {
    const f = fixture()
    if (cas === 'multi-alias') f.corpus.reglesAnon.vide.entite.push('Alias')
    if (cas === 'deux-variantes') f.corpus.reglesAnon.vide.pseudos.push('Autre')
    if (cas === 'non-canonique') f.corpus.reglesAnon.vide.pseudos[0] = ' Inutilisée '
    if (cas === 'mauvaise-identite') f.corpus.reglesAnon.vide.id = 'autre'
    if (cas === 'suppression') f.corpus.suppressionAnon = { operationId: 'suppression-anon-test', regleId: 'vide' }
    if (cas === 'dissociation') f.corpus.dissociationAnon = { operationId: 'dissociation-test', regleId: 'vide' }
    f.demande.regleAvant = structuredClone(f.corpus.reglesAnon.vide)
    const avant = structuredClone(f.corpus)
    expect(() => ajouterVarianteAnon(f.corpus, f.demande)).toThrow(); expect(f.corpus).toEqual(avant)
  })
  test('pseudo partagé : aucune fusion avec une autre règle', () => {
    const f = fixture(); f.demande.pseudo = 'Claire'
    ajouterVarianteAnon(f.corpus, f.demande)
    expect(f.corpus.reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(f.corpus.reglesAnon.vide.pseudos).toEqual(['Inutilisée', 'Claire'])
  })
  test('une propriété héritée ne devient pas une règle existante', () => {
    const f = fixture(); f.demande.regleAvant.id = '__proto__'
    expect(() => ajouterVarianteAnon(f.corpus, f.demande)).toThrow('n’existe plus')
  })
  test('le store écrit seulement le corpus ; même une session ouverte ne change ni contenu ni date', () => {
    const b = banc(), avant = b.fichiers(), corpusAvant = b.corpus()
    b.store.ouvrirEntretienPourEdition('e1')
    expect(b.store.regleAnonAjouterVariante(b.f.demande).ajoute).toBe(true)
    expect(b.fichiers()).toEqual(avant)
    corpusAvant.reglesAnon.vide.pseudos.push('Nouvelle variante'); expect(b.corpus()).toEqual(corpusAvant)
  })
  test('doublon et demande périmée ne réécrivent pas le corpus', () => {
    const b = banc(), chemin = join(b.dir, 'corpus.json'), avant = readFileSync(chemin, 'utf8'), date = statSync(chemin).mtimeMs
    expect(b.store.regleAnonAjouterVariante({ ...b.f.demande, pseudo: 'Inutilisée' }).ajoute).toBe(false)
    b.f.demande.regleAvant.categorie = 'faux'
    expect(() => b.store.regleAnonAjouterVariante(b.f.demande)).toThrow('a changé')
    expect(readFileSync(chemin, 'utf8')).toBe(avant); expect(statSync(chemin).mtimeMs).toBe(date)
  })
  test('lecture seule refuse avant toute écriture', () => {
    const b = banc(), avant = b.corpus(); b.store.lectureSeule = true
    expect(() => b.store.regleAnonAjouterVariante(b.f.demande)).toThrow(); expect(b.corpus()).toEqual(avant)
  })
  test('échec avant remplacement : ancienne définition intacte, réouverture puis ajout frais sans altérer les sources', () => {
    const b = banc(), chemin = join(b.dir, 'corpus.json'), avant = readFileSync(chemin, 'utf8'), sources = b.fichiers()
    injection.corpus = chemin
    expect(() => b.store.regleAnonAjouterVariante(b.f.demande)).toThrow('Interruption')
    expect(readFileSync(chemin, 'utf8')).toBe(avant); expect(b.fichiers()).toEqual(sources)
    injection.corpus = ''
    const relance = new CorpusStore(b.dir); relance.ouvrir()
    expect(relance.regleAnonAjouterVariante(b.f.demande).ajoute).toBe(true)
    expect(b.fichiers()).toEqual(sources)
  })
  test('journal en attente : aucune reprise ou écriture implicite par l’ajout', () => {
    const b = banc(), chemin = join(b.dir, 'corpus.json'), avant = readFileSync(chemin, 'utf8')
    writeFileSync(join(b.dir, '.transaction-fichiers.json'), 'journal synthétique illisible')
    expect(() => b.store.regleAnonAjouterVariante(b.f.demande)).toThrow('transaction reste à reprendre')
    expect(readFileSync(chemin, 'utf8')).toBe(avant); expect(b.fichiers().size).toBe(3)
  })
  test.each(['local', 'gitlab', 'webdav'] as const)('nouveau geste qualifié séparément : %s', (provider) => {
    expect(matriceCapacites(provider).ajoutVarianteAnon).toBe(true)
    expect(() => exigerGeste(provider, 'anon.ajouter-variante')).not.toThrow()
  })
})
