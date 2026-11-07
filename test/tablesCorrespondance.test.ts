import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'
import { construireTableCorrespondance, OPTIONS_TABLE_DEFAUT, aplatirTableV1, tableExigeEntretiens } from '../src/shared/corpus/tablesCorrespondance'
import { decoderCorrespondances, preparerImportCorrespondances, appliquerImportCorrespondances } from '../src/shared/corpus/importCorrespondances'
import { TablesCorrespondance } from '../src/main/tablesCorrespondance'
import { CorpusStore } from '../src/main/corpusStore'
const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const doc = (lignes: unknown[]) => [{ nom: 'synthetique.json', texte: JSON.stringify(lignes) }]
const v1 = (entite: string, pseudo: string, extra = {}) => ({ entite_init: entite, entite_pseudo: pseudo, ...extra })
function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'correspondances-')); dossiers.push(dir)
  const store = new CorpusStore(join(dir, 'corpus')); const corpus = store.ouvrir()
  const fixture = fixturePseudonymisation()
  corpus.reglesAnon = Object.fromEntries(fixture.regles.map((r) => [r.id, r]))
  for (const e of fixture.entretiens) {
    corpus.membership[e.id] = { titre: e.id, date: null, lastModified: e.data.lastModified }
    mkdirSync(join(store.repertoire, 'entretiens'), { recursive: true })
    writeFileSync(join(store.repertoire, 'entretiens', `${e.id}.json`), JSON.stringify(e.data))
  }
  writeFileSync(join(store.repertoire, 'corpus.crp'), JSON.stringify(corpus))
  return { dir, store, fixture }
}
describe('export des correspondances', () => {
  test('conserve les définitions et variantes choisies, sans mélanger le locuteur au texte', () => {
    const f = fixturePseudonymisation(); const avant = structuredClone(f)
    const table = construireTableCorrespondance(f.regles, f.entretiens, OPTIONS_TABLE_DEFAUT)
    expect(table.correspondances.some((r) => r.nature === 'locuteur')).toBe(true)
    expect(table.correspondances.some((r) => r.nature === 'texte' && r.portee === 'texte-local')).toBe(true)
    const karine = table.correspondances.find((r) => r.nature === 'texte' && r.entite.includes('Karine'))!
    expect(karine).toMatchObject({ pseudos: ['Claire', 'Rebecca'], utilisee: true })
    expect(f).toEqual(avant)
  })
  test('une exception, une attente ou une annotation incluse seule ne rend pas une règle utilisée', () => {
    const f = fixturePseudonymisation()
    const table = construireTableCorrespondance(f.regles, f.entretiens, OPTIONS_TABLE_DEFAUT)
    expect(table.correspondances.some((r) => r.nature === 'texte' && r.entite.includes('Absente'))).toBe(false)
    expect(table.correspondances.some((r) => r.nature === 'texte' && r.entite.includes('Gare'))).toBe(false)
    const toutes = construireTableCorrespondance(f.regles, f.entretiens, { ...OPTIONS_TABLE_DEFAUT, regles: 'toutes' })
    expect(toutes.correspondances.some((r) => r.nature === 'texte' && r.entite.includes('Absente'))).toBe(true)
  })
  test('texte corpus seul peut se passer des entretiens ; les locuteurs ne le peuvent pas', () => {
    expect(tableExigeEntretiens({ ...OPTIONS_TABLE_DEFAUT, regles: 'toutes', nature: 'texte', perimetre: 'corpus' })).toBe(false)
    expect(() => tableExigeEntretiens({ ...OPTIONS_TABLE_DEFAUT, perimetre: 'corpus' })).toThrow('locuteurs')
  })
  test('sans catégories, les autres champs restent inchangés', () => {
    const f = fixturePseudonymisation()
    const table = construireTableCorrespondance(f.regles, f.entretiens, { ...OPTIONS_TABLE_DEFAUT, categories: false })
    expect(table.correspondances.every((r) => !('categorie' in r))).toBe(true)
  })
  test('ne crée pas de règle partagée pour exporter les décisions locales ou locuteurs', () => {
    const f = fixturePseudonymisation()
    for (const a of f.entretiens[0].data.annotations) delete a.regle
    const table = construireTableCorrespondance([], f.entretiens, OPTIONS_TABLE_DEFAUT)
    expect(table.correspondances.length).toBeGreaterThan(0)
    expect(table.correspondances.every((r) => r.nature === 'locuteur' || r.portee === 'texte-local')).toBe(true)
  })
  test('signale une annotation sans pseudo, et ne la compte pas utilisée', () => {
    const f = fixturePseudonymisation()
    f.entretiens[0].data.annotations.filter((a) => a.type === 'anon').forEach((a) => { a.pseudo = '' })
    const table = construireTableCorrespondance(f.regles, f.entretiens, OPTIONS_TABLE_DEFAUT)
    expect(table.diagnostics.some((d) => d.code === 'pseudo-inexploitable')).toBe(true)
    expect(table.correspondances.every((r) => r.nature === 'locuteur')).toBe(true)
  })
  test('V1 conserve les alias et toutes les variantes, mais ne contient aucune position', () => {
    const f = fixturePseudonymisation()
    const table = construireTableCorrespondance(f.regles, f.entretiens, { ...OPTIONS_TABLE_DEFAUT, regles: 'toutes' })
    const lignes = aplatirTableV1(table)
    expect(lignes.some((r) => r.entite_init === 'Lyon / Lyons')).toBe(true)
    expect(lignes.some((r) => r.entite_pseudo_alt === 'Rebecca')).toBe(true)
    expect(lignes.every((r) => !('from' in r) && !('portee' in r))).toBe(true)
  })
})
describe('aperçu et préparation de l’import', () => {
  test('accepte V1 avec groupe, variante et thématique', () => {
    const lignes = preparerImportCorrespondances(decoderCorrespondances(doc([v1('Lyon / Lyons', 'Ville', { thematique: 'LOC' }), v1('Karine', 'Claire', { entite_pseudo_alt: 'Rebecca' })])), [])
    expect(lignes.map((l) => l.etat)).toEqual(['ajout', 'ajout'])
    expect(lignes[0].definition).toEqual({ entite: ['Lyon', 'Lyons'], pseudos: ['Ville'], categorie: 'LOC' })
  })
  test('plus de deux variantes ou alias avec variantes demandent une correction explicite', () => {
    const entrees = decoderCorrespondances(doc([v1('Lyon / Lyons', 'Ville', { entite_pseudo_alt: 'Cité' }), v1('Karine', 'A'), v1('Karine', 'B'), v1('Karine', 'C')]))
    const lignes = preparerImportCorrespondances(entrees, [])
    expect(lignes.every((l) => l.etat === 'invalide' && l.defaut === 'ignorer')).toBe(true)
    expect(lignes[1].pseudos).toEqual(['A', 'B', 'C'])
    const corrigees = preparerImportCorrespondances(entrees, [], [{ id: entrees[0].id, pseudos: ['Ville'] }])
    expect(corrigees[0].etat).toBe('ajout')
    expect(corrigees[1].etat).toBe('invalide')
  })
  test('JSON et types invalides ne sont pas coercés ni réparés silencieusement', () => {
    expect(preparerImportCorrespondances(decoderCorrespondances([{ nom: 'err.json', texte: '{' }]), [])[0].etat).toBe('invalide')
    const entrees = decoderCorrespondances(doc([v1('Nom', 'A', { entite_pseudo_alt: 4 })]))
    expect(preparerImportCorrespondances(entrees, [])[0].etat).toBe('invalide')
    expect(preparerImportCorrespondances(entrees, [], [{ id: entrees[0].id, entite: 'Autre' }])[0].etat).toBe('invalide')
  })
  test('divergence ignorée par défaut ; variante et remplacement sont explicites', () => {
    const regles = { r: { id: 'r', entite: ['Karine'], pseudos: ['Claire'], categorie: 'PER' } }
    const lignes = preparerImportCorrespondances(decoderCorrespondances(doc([v1('Karine', 'Rebecca')])), Object.values(regles))
    expect(lignes[0].defaut).toBe('ignorer')
    const ignore = appliquerImportCorrespondances(regles, lignes, {}, () => 'neuf')
    expect(ignore.regles).toEqual(regles)
    const variante = appliquerImportCorrespondances(regles, lignes, { [lignes[0].id]: 'variante' }, () => 'neuf')
    expect(variante.regles.r.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(variante.regles.r.categorie).toBe('PER')
    const remplacer = appliquerImportCorrespondances(regles, lignes, { [lignes[0].id]: 'remplacer' }, () => 'neuf')
    expect(remplacer.regles.r.pseudos).toEqual(['Rebecca'])
    expect(regles.r.pseudos).toEqual(['Claire'])
  })
  test('un chevauchement partiel n’abandonne pas les alias supplémentaires', () => {
    const lignes = preparerImportCorrespondances(decoderCorrespondances(doc([v1('Lyon / Vienne', 'Ville')])), [{ id: 'r', entite: ['Lyon', 'Lyons'], pseudos: ['Ville'] }])
    expect(lignes[0]).toMatchObject({ etat: 'invalide', choix: ['ignorer'] })
  })
  test('deux fichiers contradictoires exigent de retenir une seule définition', () => {
    const entrees = decoderCorrespondances([...doc([v1('Karine', 'A')]), { nom: 'autre.json', texte: JSON.stringify([v1('Karine', 'B')]) }])
    const lignes = preparerImportCorrespondances(entrees, [])
    expect(lignes.every((l) => l.defaut === 'ignorer')).toBe(true)
    expect(() => appliquerImportCorrespondances({}, lignes, Object.fromEntries(lignes.map((l) => [l.id, 'ajouter'])), () => 'r')).toThrow('se recouvrent')
  })
  test('V2 conserve la séparation ; aucune promotion automatique de local ou locuteur', () => {
    const f = fixturePseudonymisation()
    const table = construireTableCorrespondance(f.regles, f.entretiens, { ...OPTIONS_TABLE_DEFAUT, regles: 'toutes' })
    const lignes = preparerImportCorrespondances(decoderCorrespondances([{ nom: 'v2.json', texte: JSON.stringify(table) }]), [])
    expect(lignes.filter((l) => l.nature === 'locuteur' || l.portee === 'texte-local').every((l) => l.etat === 'hors-perimetre' && l.choix.length === 1)).toBe(true)
    const importe = appliquerImportCorrespondances({}, lignes, {}, (() => { let n = 0; return () => `r${++n}` })())
    expect(Object.values(importe.regles).map((r) => [r.entite, r.pseudos, r.categorie])).toEqual(f.regles.slice().sort((a, b) => a.entite.join('/').localeCompare(b.entite.join('/'), 'fr')).map((r) => [r.entite, r.pseudos, r.categorie]))
  })
})
describe('cache et persistance du main', () => {
  test('export strict sans écriture ; destination corpus ou symlink vers corpus refusée', () => {
    const { dir, store, fixture } = banc()
    const service = new TablesCorrespondance({ store: () => store, lecture: () => 'local' })
    const fichier = join(store.repertoire, 'entretiens', `${fixture.entretiens[0].id}.json`)
    const avant = readFileSync(fichier, 'utf8')
    const apercu = service.preparerExport(OPTIONS_TABLE_DEFAUT)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    expect(() => service.verifierDestination(apercu.token, join(store.repertoire, 'corpus.crp'))).toThrow('hors du corpus')
    symlinkSync(store.repertoire, join(dir, 'lien'), 'dir')
    expect(() => service.verifierDestination(apercu.token, join(dir, 'lien', 'export.json'))).toThrow('hors du corpus')
    expect(() => service.verifierDestination(apercu.token, join(dir, 'export.json'))).not.toThrow()
  })
  test('les membres absents ne sont pas des usages nuls silencieux', () => {
    const { store } = banc()
    const corpus = store.ouvrir(); corpus.membership.absent = { titre: 'Absent', date: null, lastModified: '' }
    writeFileSync(join(store.repertoire, 'corpus.crp'), JSON.stringify(corpus))
    const service = new TablesCorrespondance({ store: () => store, lecture: () => 'miroir' })
    const apercu = service.preparerExport(OPTIONS_TABLE_DEFAUT)
    expect(apercu.lecture).toBe('miroir'); expect(apercu.indisponibles).toEqual([{ id: 'absent', titre: 'Absent' }])
    expect(() => service.exportMemorise(apercu.token, false)).toThrow('Confirmez')
    expect(service.exportMemorise(apercu.token, true)).toEqual(apercu.table)
  })
  test('import atomique de définitions : aucun entretien modifié et aperçu périmé refusé', () => {
    const { store, fixture } = banc()
    const service = new TablesCorrespondance({ store: () => store, lecture: () => 'local' })
    const fichier = join(store.repertoire, 'entretiens', `${fixture.entretiens[0].id}.json`)
    const avant = readFileSync(fichier, 'utf8')
    const apercu = service.preparerImport(doc([v1('Nouvelle', 'Autre')]))
    const preparation = service.consommerImport(apercu.token, {})
    expect(store.importerDefinitionsAnon(preparation.lignes, preparation.choix, preparation.empreinte).ajouts).toBe(1)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    expect(() => store.importerDefinitionsAnon(preparation.lignes, preparation.choix, preparation.empreinte)).toThrow('ont changé')
    expect(() => service.consommerImport(apercu.token, {})).toThrow('expiré')
  })
  test('tout refus de préparation laisse le corpus intact et la lecture seule est défendue', () => {
    const { store } = banc()
    const service = new TablesCorrespondance({ store: () => store, lecture: () => 'local' })
    const apercu = service.preparerImport(doc([v1('Nouvelle', 'Autre')]))
    const p = service.consommerImport(apercu.token, { [apercu.lignes[0].id]: 'remplacer' })
    const avant = readFileSync(join(store.repertoire, 'corpus.crp'), 'utf8')
    expect(() => store.importerDefinitionsAnon(p.lignes, p.choix, p.empreinte)).toThrow('non autorisée')
    expect(readFileSync(join(store.repertoire, 'corpus.crp'), 'utf8')).toBe(avant)
    store.lectureSeule = true
    expect(() => store.importerDefinitionsAnon(p.lignes, {}, p.empreinte)).toThrow('transaction sous droit')
  })
  test('cache borné dans le temps et lié au corpus, sans confiance dans une table renvoyée au renderer', () => {
    const b = banc(); let courant = b.store; let maintenant = 0
    const service = new TablesCorrespondance({ store: () => courant, lecture: () => 'local', maintenant: () => maintenant })
    const apercu = service.preparerExport(OPTIONS_TABLE_DEFAUT)
    apercu.table.correspondances = []
    expect(service.exportMemorise(apercu.token, true).correspondances.length).toBeGreaterThan(0)
    maintenant = 300_001
    expect(() => service.exportMemorise(apercu.token, true)).toThrow('expiré')
    const autre = service.preparerExport(OPTIONS_TABLE_DEFAUT)
    courant = new CorpusStore(join(b.dir, 'autre')); courant.ouvrir()
    expect(() => service.exportMemorise(autre.token, true)).toThrow('corpus a changé')
  })
})
