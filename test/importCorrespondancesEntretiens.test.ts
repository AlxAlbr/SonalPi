import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gesteAutorise } from '../src/main/gitlab/politiqueGestes'
import { CorpusStore } from '../src/main/corpusStore'
import { TablesCorrespondance } from '../src/main/tablesCorrespondance'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'
import { construireTableCorrespondance, OPTIONS_TABLE_DEFAUT } from '../src/shared/corpus/tablesCorrespondance'
import type { ChoixCibleCorrespondance } from '../src/shared/corpus/importCorrespondancesEntretiens'
import type { EntretienFichier } from '../src/shared/format'

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
const local = (entite = ['Alias sans occurrence', 'Autre alias'], pseudos = ['Substitut'], categorie = 'LOC') => ({ nature: 'texte', portee: 'texte-local', entite, pseudos, categorie, etatLocal: 'declaration', entretienId: 'id-etranger', usages: [{ entretienId: 'id-etranger', positions: [1, 4] }] })
const locuteur = (pseudo = 'Voix importée') => ({ nature: 'locuteur', nom: 'Locuteur synthétique sans tour', pseudo, origines: [{ entretienId: 'etranger', locuteurIndex: 99, pseudoEtat: 'refuse', personneRef: 'personne-importee' }] })
const documents = (correspondances: unknown[]) => [{ nom: 'synthetique.json', texte: JSON.stringify({ format: 'sonalpi-correspondances', version: 2, correspondances }) }]
function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'correspondances-ciblees-')); dossiers.push(dir)
  const store = new CorpusStore(dir); const corpus = store.ouvrir()
  const f = fixturePseudonymisation()
  corpus.reglesAnon = Object.fromEntries(f.regles.map((r) => [r.id, r]))
  mkdirSync(join(dir, 'entretiens'), { recursive: true })
  for (const id of ['e1', 'e2']) {
    corpus.membership[id] = { titre: id, date: null, lastModified: f.entretiens[0].data.lastModified }
    const data = structuredClone(f.entretiens[0].data)
    data.locuteurs[0].personneRef = 'personne-locale'
    data.locuteurs[0].valeursLoc = { v: 'm' }
    writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(data))
  }
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus))
  const cache = new TablesCorrespondance({ store: () => store, lecture: () => 'local' })
  const lire = (id = 'e1'): EntretienFichier => JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8'))
  const preparer = (lignes: unknown[]) => cache.preparerImport(documents(lignes))
  const appliquer = (lignes: unknown[], choisir: (a: ReturnType<typeof preparer>) => ChoixCibleCorrespondance[]) => {
    const a = preparer(lignes)
    return store.importerCorrespondancesEntretiens(cache.consommerImport(a.token, {}, choisir(a), true))
  }
  return { dir, store, cache, lire, preparer, appliquer }
}

describe('import ciblé des correspondances dans des entretiens locaux', () => {
  test('l’aperçu et son abandon n’écrivent rien ; aucun ID importé ne désigne automatiquement une cible', () => {
    const b = banc(); const avant = readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')
    const a = b.preparer([local(), locuteur()])
    expect(a.cibles).toHaveLength(4)
    expect(a.cibles!.map((c) => c.entretienId)).toEqual(['e1', 'e2', 'e1', 'e2'])
    expect(a.cibles!.filter((c) => c.nature === 'locuteur').map((c) => c.etatPropose)).toEqual(['refuse', 'refuse'])
    expect(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).toBe(avant)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('confirmation obligatoire, puis un seul locuteur sans tour modifié, sans Personne ni règle créée', () => {
    const b = banc(); const avant = b.lire(); const autre = b.lire('e2'); const regles = b.store.reglesAnon()
    const a = b.preparer([locuteur()]); const cible = a.cibles![0]
    expect(() => b.cache.consommerImport(a.token, {}, [{ cibleId: cible.id, action: 'remplacer', etat: 'confirme' }])).toThrow('Confirmez explicitement')
    const bilan = b.appliquer([locuteur()], (a) => [{ cibleId: a.cibles![0].id, action: 'remplacer', etat: 'refuse' }])
    const apres = b.lire()
    expect(bilan.entretiens).toEqual({ definitionsLocales: 0, locuteurs: 1, entretiens: 1 })
    expect(apres.locuteurs[0]).toEqual({ ...avant.locuteurs[0], pseudo: 'Voix importée', pseudoEtat: 'refuse' })
    expect(apres.annotations).toEqual(avant.annotations)
    expect(apres.corpsTexte).toEqual(avant.corpsTexte)
    expect(b.lire('e2')).toEqual(autre)
    expect(b.store.reglesAnon()).toEqual(regles)
  })
  test('les homonymes sont présentés séparément ; aucune création si le nom est absent', () => {
    const b = banc(); const data = b.lire()
    data.locuteurs.push({ ...data.locuteurs[0], index: 4, pseudo: 'Autre voix' })
    writeFileSync(join(b.dir, 'entretiens/e1.json'), JSON.stringify(data))
    const a = b.preparer([locuteur(), { ...locuteur(), nom: 'Nom absent' }])
    expect(a.cibles!.filter((c) => c.entretienId === 'e1').map((c) => c.locuteurIndex)).toEqual([0, 4])
    const p = b.cache.consommerImport(a.token, {}, [{ cibleId: a.cibles![1].id, action: 'remplacer', etat: 'non-precise' }], true)
    b.store.importerCorrespondancesEntretiens(p)
    expect(b.lire().locuteurs[0]).toEqual(data.locuteurs[0])
    expect(b.lire().locuteurs[1]).toEqual({ ...data.locuteurs[1], pseudo: 'Voix importée', pseudoEtat: undefined })
  })
  test('mémoire complète sans occurrence : alias, catégorie et variante inutilisée persistent et s’exportent', () => {
    const b = banc(); const avant = b.lire()
    const bilan = b.appliquer([local(), local(['Entité unique'], ['Variante A', 'Variante B'], 'PER')], (a) => a.cibles!.filter((c) => c.entretienId === 'e1').map((c) => ({ cibleId: c.id, action: 'ajouter' })))
    expect(bilan.entretiens).toEqual({ definitionsLocales: 2, locuteurs: 0, entretiens: 1 })
    const data = new CorpusStore(b.dir).lireEntretien('e1')
    expect(data.ok).toBe(true)
    if (!data.ok) throw new Error('Fixture illisible.')
    expect(data.data.annotations).toEqual(avant.annotations)
    expect(data.data.definitionsAnonLocales).toEqual([
      { entite: ['Alias sans occurrence', 'Autre alias'], pseudos: ['Substitut'], categorie: 'LOC', etat: 'declaration' },
      { entite: ['Entité unique'], pseudos: ['Variante A', 'Variante B'], categorie: 'PER', etat: 'declaration' },
    ])
    const table = construireTableCorrespondance([], [{ id: 'e1', data: data.data }], { ...OPTIONS_TABLE_DEFAUT, regles: 'toutes' })
    expect(table.correspondances).toEqual(expect.arrayContaining([expect.objectContaining({ portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre alias'], categorie: 'LOC', utilisee: false })]))
    const apres = b.lire()
    const retour = b.appliquer([local(), local(['Entité unique'], ['Variante A', 'Variante B'], 'PER')], (a) => a.cibles!.filter((c) => c.entretienId === 'e1').map((c) => ({ cibleId: c.id, action: 'remplacer' })))
    expect(retour.entretiens).toEqual({ definitionsLocales: 0, locuteurs: 0, entretiens: 0 })
    expect(b.lire()).toEqual(apres)
  })
  test('un remplacement local ne renomme pas un pseudo choisi ; le déclarer reste obligatoire', () => {
    const b = banc(); const avant = b.lire()
    expect(() => b.appliquer([local(['Local'], ['Nouveau'])], (a) => [{ cibleId: a.cibles![0].id, action: 'remplacer' }])).toThrow('déjà choisi')
    expect(b.lire()).toEqual(avant)
    b.appliquer([local(['Local'], ['Nouveau'])], (a) => [{ cibleId: a.cibles![0].id, action: 'variante' }])
    expect(b.lire().annotations).toEqual(avant.annotations)
    expect(b.lire().definitionsAnonLocales![0].pseudos).toEqual(['Définition locale', 'Nouveau'])
  })
  test.each(['entretien', 'corpus', 'session'] as const)('refuse une cible périmée ou ouverte (%s) sans écrire', (cas) => {
    const b = banc(); const a = b.preparer([locuteur()])
    if (cas === 'session') b.store.ouvrirEntretienPourEdition('e1')
    else if (cas === 'entretien') { const data = b.lire(); data.meta.valeursGen.v = 'nouvelle'; writeFileSync(join(b.dir, 'entretiens/e1.json'), JSON.stringify(data)) }
    else b.store.renommerEntretien('e1', 'Nouveau titre')
    const avant = b.lire()
    const p = b.cache.consommerImport(a.token, {}, [{ cibleId: a.cibles![0].id, action: 'remplacer', etat: 'confirme' }], true)
    expect(() => b.store.importerCorrespondancesEntretiens(p)).toThrow(/changé|ouvert/)
    expect(b.lire()).toEqual(avant)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('fermer la session empêche la sauvegarde tardive ; rouvrir la réautorise', () => {
    const b = banc(); b.store.ouvrirEntretienPourEdition('e1')
    b.store.revoquerEcritureEntretien('e1')
    expect(() => b.store.exigerSessionLocaleEcriture('e1')).toThrow('fermée')
    b.appliquer([locuteur()], (a) => [{ cibleId: a.cibles![0].id, action: 'remplacer', etat: 'confirme' }])
    b.store.ouvrirEntretienPourEdition('e1')
    expect(() => b.store.exigerSessionLocaleEcriture('e1')).not.toThrow()
  })
  test('contradictions de locuteur, alias partiels et portée concurrente sont refusés avant toute publication', () => {
    const b = banc(); const avant = b.lire()
    expect(() => b.appliquer([locuteur('A'), locuteur('B')], (a) => a.cibles!.filter((c) => c.entretienId === 'e1').map((c) => ({ cibleId: c.id, action: 'remplacer', etat: 'confirme' })))).toThrow('contradictoires')
    expect(() => b.appliquer([local(['X', 'Y']), local(['Y', 'Z'])], (a) => a.cibles!.filter((c) => c.entretienId === 'e1').map((c) => ({ cibleId: c.id, action: 'ajouter' })))).toThrow('Chevauchement partiel')
    expect(b.preparer([local(['Lyon'])]).cibles!.every((c) => !c.actionsPossibles.length)).toBe(true)
    expect(b.lire()).toEqual(avant)
  })
  test('le miroir et les stores de préparation ne permettent aucune écriture ciblée', () => {
    expect(gesteAutorise('local', 'anon.importer-cibles')).toBe(true)
    expect(gesteAutorise('webdav', 'anon.importer-cibles')).toBe(true)
    expect(gesteAutorise('gitlab', 'anon.importer-cibles')).toBe(true)
    const b = banc()
    const distant = new TablesCorrespondance({ store: () => b.store, lecture: () => 'miroir' })
    const a = distant.preparerImport(documents([locuteur()]))
    expect(a.cibles).toBeUndefined()
    expect(() => distant.consommerImport(a.token, {}, [{ cibleId: 'invente', action: 'remplacer', etat: 'confirme' }], true)).toThrow('aperçu local ou publié')
    const local = b.preparer([locuteur()])
    const p = b.cache.consommerImport(local.token, {}, [{ cibleId: local.cibles![0].id, action: 'remplacer', etat: 'confirme' }], true)
    b.store.activerModePreparation(['e1'])
    expect(() => b.store.avecEcritureCorpus(() => b.store.importerCorrespondancesEntretiens(p))).toThrow('service du fournisseur')
  })
  test('un brouillon incomplet garde ses alias et sa catégorie sans inventer de pseudo', () => {
    const b = banc(); const avant = b.lire()
    b.appliquer([{ ...local(), pseudos: [], etatLocal: 'brouillon' }], (a) => [{ cibleId: a.cibles![0].id, action: 'ajouter' }])
    expect(b.lire().definitionsAnonLocales![0]).toEqual({ entite: ['Alias sans occurrence', 'Autre alias'], pseudos: [], categorie: 'LOC', etat: 'brouillon' })
    expect(b.lire().annotations).toEqual(avant.annotations)
    const table = construireTableCorrespondance(b.store.reglesAnon(), [{ id: 'e1', data: b.lire() }], { ...OPTIONS_TABLE_DEFAUT, regles: 'toutes' })
    expect(table.correspondances).toEqual(expect.arrayContaining([expect.objectContaining({ etatLocal: 'brouillon', pseudos: [], categorie: 'LOC' })]))
    expect(table.diagnostics).toEqual([])
  })
  test('le cache privé refuse une cible forgée ; modifier l’aperçu public ne change pas le pseudo appliqué', () => {
    const b = banc(); const a = b.preparer([locuteur()]); a.lignes[0].pseudos = ['Altération renderer']
    const preparation = b.cache.consommerImport(a.token, {}, [{ cibleId: a.cibles![0].id, action: 'remplacer', etat: 'confirme' }], true)
    b.store.importerCorrespondancesEntretiens(preparation)
    expect(b.lire().locuteurs[0].pseudo).toBe('Voix importée')
    const autre = b.preparer([locuteur()])
    expect(() => b.store.importerCorrespondancesEntretiens(b.cache.consommerImport(autre.token, {}, [{ cibleId: 'inventé', action: 'remplacer', etat: 'confirme' }], true))).toThrow('Cible inconnue')
  })
  test('une mémoire malformée est refusée en lecture et avant toute sauvegarde', () => {
    const b = banc(); const avant = b.lire()
    const invalide = { entite: ['A', 'B'], pseudos: ['X', 'Y'], etat: 'declaration' as const }
    expect(() => b.store.ecrireEntretien('e1', { ...avant, definitionsAnonLocales: [invalide] })).toThrow()
    expect(b.lire()).toEqual(avant)
    writeFileSync(join(b.dir, 'entretiens/e1.json'), JSON.stringify({ ...avant, definitionsAnonLocales: [invalide] }))
    expect(b.store.lireEntretien('e1').ok).toBe(false)
    expect(b.preparer([locuteur()]).indisponibles).toContainEqual({ id: 'e1', titre: 'e1' })
  })
  test('règles partagées et cibles locales sont préparées avant la même transaction', () => {
    const b = banc(); const a = b.preparer([locuteur(), { nature: 'texte', portee: 'corpus', entite: ['Nouvelle règle'], pseudos: ['Substitut partagé'] }])
    const p = b.cache.consommerImport(a.token, {}, [{ cibleId: a.cibles![0].id, action: 'remplacer', etat: 'confirme' }], true)
    const bilan = b.store.importerCorrespondancesEntretiens(p)
    expect(bilan.ajouts).toBe(1)
    expect(bilan.entretiens?.locuteurs).toBe(1)
    expect(b.store.reglesAnon()).toEqual(expect.arrayContaining([expect.objectContaining({ entite: ['Nouvelle règle'] })]))
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })
  test('la décision doit être choisie pour des provenances de locuteur mixtes', () => {
    const b = banc(); const a = b.preparer([{ ...locuteur(), origines: [{ entretienId: 'a', locuteurIndex: 0, pseudoEtat: 'confirme' }, { entretienId: 'b', locuteurIndex: 0, pseudoEtat: 'refuse' }] }])
    expect(a.cibles![0].etatPropose).toBeUndefined()
    expect(() => b.store.importerCorrespondancesEntretiens(b.cache.consommerImport(a.token, {}, [{ cibleId: a.cibles![0].id, action: 'remplacer' }], true))).toThrow('Choisissez explicitement')
  })
  test.each([false, true])('interruption au second entretien : reprise sans écraser une modification concurrente (%s)', (concurrence) => {
    const b = banc(); const avant = b.lire('e2')
    injection.destination = join(b.dir, 'entretiens/e2.json')
    expect(() => b.appliquer([locuteur()], (a) => a.cibles!.map((c) => ({ cibleId: c.id, action: 'remplacer', etat: 'confirme' })))).toThrow('Interruption synthétique')
    expect(b.lire().locuteurs[0].pseudo).toBe('Voix importée')
    expect(b.lire('e2')).toEqual(avant)
    const journal = join(b.dir, '.transaction-fichiers.json')
    expect(existsSync(journal)).toBe(true)
    expect(statSync(journal).mode & 0o777).toBe(0o600)
    expect(() => b.store.ouvrirEntretienPourEdition('e2')).toThrow('transaction reste à reprendre')
    injection.destination = ''
    if (concurrence) {
      const modifie = { ...avant, lastModified: 'concurrent' }
      writeFileSync(join(b.dir, 'entretiens/e2.json'), JSON.stringify(modifie))
      expect(() => new CorpusStore(b.dir).ouvrir()).toThrow('changé')
      expect(b.lire('e2')).toEqual(modifie)
      expect(existsSync(journal)).toBe(true)
    } else {
      new CorpusStore(b.dir).ouvrir()
      expect(b.lire('e2').locuteurs[0].pseudo).toBe('Voix importée')
      expect(b.lire('e2').annotations).toEqual(avant.annotations)
      expect(existsSync(journal)).toBe(false)
    }
  })
})
