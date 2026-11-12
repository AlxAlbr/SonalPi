import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appliquerCommandeCas, normaliserCas, normaliserFamillesCas, compterUsagesCasVariable, type CommandeCas } from '../src/shared/corpus/cas'
import { retirerVariable, retirerModalite, modifierVariable, modifierModalite } from '../src/shared/corpus/variables'
import { projeterCas, type SourceCasChargee } from '../src/renderer/editor/cas'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION } from '../src/shared/format'
import { casModalite, familleCas, corpusFamille, sourceFamille, dateFamille } from './fixtures/casFamilles'

function modele() {
  const corpus = corpusFamille()
  const commande = (commande: CommandeCas) => {
    corpus.cas = appliquerCommandeCas(corpus.cas, commande, {
      maintenant: () => dateFamille, personneExiste: () => true, entretienExiste: () => true,
      familles: corpus.famillesCas, variables: corpus.variables,
    })
  }
  return { corpus, commande }
}

describe('cas — familles de modalités', () => {
  test.each(['locuteur', 'entretien'] as const)('normalise et persiste les identités de portée %s', (portee) => {
    const famille = familleCas(portee)
    const cas = casModalite('a', famille)
    expect(normaliserCas({ [cas.id]: cas })).toEqual({ [cas.id]: cas })
    expect(normaliserFamillesCas({ f: famille })).toEqual({ f: famille })
  })

  test('création et complément atomiques, rejouables, une seule modalité par famille', () => {
    const { corpus, commande } = modele()
    const famille = familleCas()
    const creation: CommandeCas = { type: 'creer-famille', famille, cas: [casModalite()] }
    commande(creation)
    const apres = structuredClone(corpus)
    commande(creation)
    expect(corpus).toEqual(apres)
    const complement: CommandeCas = { type: 'completer-famille', famille, cas: [casModalite('b')] }
    commande(complement)
    commande(complement)
    expect(Object.keys(corpus.cas!)).toHaveLength(2)
    const avant = structuredClone(corpus)
    expect(() => commande({ type: 'completer-famille', famille, cas: [casModalite('c'), casModalite('b', famille, 'autre')] })).toThrow(/déjà/)
    expect(corpus).toEqual(avant)
    expect(() => commande({ type: 'creer-famille', famille, cas: [casModalite('c')] })).toThrow(/Compléter/)
    expect(() => commande({ type: 'creer', cas: casModalite('c') })).toThrow(/famille/)
  })

  test('une nouvelle famille de la même variable reste un choix distinct, noms et identités ne se fusionnent pas', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite()] })
    const autre = familleCas('locuteur', 'autre')
    commande({ type: 'creer-famille', famille: autre, cas: [casModalite('a', autre)] })
    expect(Object.keys(corpus.famillesCas!)).toHaveLength(2)
    expect(Object.keys(corpus.cas!)).toHaveLength(2)
    const avant = structuredClone(corpus)
    expect(() => commande({ type: 'creer-famille', famille: { ...familleCas('locuteur', 'collision'), nom: ' ÉTABLISSEMENT F ' }, cas: [casModalite('c')] })).toThrow(/nom/)
    expect(() => commande({ type: 'completer-famille', famille: familleCas(), cas: [{ ...casModalite('c'), nom: casModalite().nom }] })).toThrow(/nom/)
    expect(() => commande({ type: 'completer-famille', famille: familleCas(), cas: [casModalite('b', familleCas(), casModalite().id)] })).toThrow(/identité/)
    expect(corpus).toEqual(avant)
  })

  test('références, portées et filtres revalidés sans mutation partielle', () => {
    const { corpus, commande } = modele()
    for (const cas of [casModalite('absente'), casModalite('a', familleCas('entretien')),
      { ...casModalite(), regles: [{ type: 'modalite' as const, variableId: 'v', modaliteId: 'a', portee: 'locuteur' as const, inclureEnqueteurs: true }] }]) {
      expect(() => commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite('b'), cas] })).toThrow()
      expect(corpus.cas).toEqual({})
      expect(corpus.famillesCas).toEqual({})
    }
    delete corpus.variables.v
    expect(() => commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite()] })).toThrow(/variable/)
  })

  test('les usages protègent variables et modalités ; renommer ne renomme pas les cas', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite()] })
    expect(compterUsagesCasVariable(corpus, 'v')).toBe(2)
    expect(compterUsagesCasVariable(corpus, 'v', 'a')).toBe(1)
    expect(() => retirerVariable(corpus, 'v')).toThrow(/utilisée/)
    expect(() => retirerModalite(corpus, 'v', 'a')).toThrow(/utilisée/)
    expect(() => modifierVariable(corpus, 'v', { portee: 'entretien' })).toThrow(/utilisée/)
    const casAvant = structuredClone(corpus.cas)
    modifierVariable(corpus, 'v', { lib: 'Renommée' })
    modifierModalite(corpus, 'v', 'a', 'Autre libellé')
    expect(corpus.cas).toEqual(casAvant)
    retirerModalite(corpus, 'v', 'c')
    expect(corpus.variables.v.modalites).toHaveLength(2)
  })

  test('dissolution sans cascade, rejeu et préconditions contre un complément concurrent', () => {
    const { corpus, commande } = modele()
    const famille = familleCas()
    const enrichi = casModalite()
    enrichi.rattachements.push({ id: 'manuel', source: { entretienId: 'e1', repereId: 'r' }, provenance: 'manuel', creeLe: dateFamille })
    commande({ type: 'creer-famille', famille, cas: [enrichi] })
    const dissolution: CommandeCas = { type: 'dissoudre-famille', famille, membresAttendus: [enrichi.id] }
    commande({ type: 'completer-famille', famille, cas: [casModalite('b')] })
    const avant = structuredClone(corpus)
    expect(() => commande(dissolution)).toThrow(/membres/)
    expect(corpus).toEqual(avant)
    dissolution.membresAttendus.push(casModalite('b').id)
    commande(dissolution)
    commande(dissolution)
    expect(corpus.famillesCas).toEqual({})
    const { familleId: _familleId, ...conserve } = enrichi
    expect(corpus.cas![enrichi.id]).toEqual(conserve)
    expect(() => retirerVariable(corpus, 'v')).toThrow(/utilisée/)
    expect(() => commande({ type: 'completer-famille', famille, cas: [casModalite('c')] })).toThrow(/existe/)
  })

  test('famille vide conservée puis dissoluble sans affecter le corpus', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite()] })
    commande({ type: 'supprimer-cas', casId: casModalite().id, attenduModifieLe: dateFamille })
    expect(compterUsagesCasVariable(corpus, 'v')).toBe(1)
    commande({ type: 'dissoudre-famille', famille: familleCas(), membresAttendus: [] })
    retirerVariable(corpus, 'v')
    expect(corpus.variables).toEqual({})
  })
})

describe('projection des règles de modalités', () => {
  function sources() {
    return new Map<string, SourceCasChargee>([['e1', { ok: true, data: sourceFamille() }], ['e2', { ok: true, data: sourceFamille(true) }]])
  }
  test('valeurs locales, non liés et muets inclus ; même personne A puis B, rôle local et aucun voisinage', () => {
    const lectures = sources()
    const corpus = corpusFamille()
    const a = projeterCas(corpus, casModalite(), lectures, 'original')
    expect(a.passages.map((p) => [p.origine.type === 'regle-modalite' && p.origine.entretienId, p.texte])).toEqual([
      ['e1', 'Réponse locale'], ['e1', 'Sans identité'], ['e2', 'Sans identité'],
    ])
    expect(a.observationsModalite).toEqual({ membres: 5, valeursAbsentes: 2, valeursInvalides: 0, enqueteursExclus: 2, sourcesIllisibles: 0 })
    const b = projeterCas(corpus, casModalite('b'), lectures, 'original')
    expect(b.passages.map((p) => p.texte)).toEqual(['Autre établissement', 'Réponse locale', 'Autre établissement'])
    const famille = familleCas()
    if (famille.origine.portee === 'locuteur') famille.origine.inclureEnqueteurs = true
    expect(projeterCas(corpus, casModalite('a', famille), lectures).observationsModalite.membres).toBe(7)
    expect(projeterCas(corpus, casModalite('a', famille), lectures).passages).toHaveLength(5)
  })

  test('les ajouts restent indépendants, union brute et vues préservées', () => {
    const cas = casModalite()
    const lectures = sources()
    const source = sourceFamille()
    source.reperesPassages = [{ id: 'r', from: 11, to: 25 }]
    lectures.set('e1', { ok: true, data: source })
    const avant = projeterCas(corpusFamille(), cas, lectures)
    cas.rattachements.push({ id: 'm', source: { entretienId: 'e1', repereId: 'r' }, provenance: 'manuel', creeLe: dateFamille })
    const apres = projeterCas(corpusFamille(), cas, lectures)
    expect(apres.observationsModalite).toEqual(avant.observationsModalite)
    expect(apres.vues.manuels.passages).toHaveLength(1)
    expect(apres.vues.regles.metriques).toEqual(avant.metriques)
    expect(apres.metriques.caracteresSansDoubleCompte).toBe(avant.metriques.caracteresSansDoubleCompte)
    cas.rattachements = []
    expect(projeterCas(corpusFamille(), cas, lectures)).toEqual(avant)
  })

  test('modalité déclarée non observée, valeurs absentes, invalides et sources illisibles ne se confondent pas', () => {
    const corpus = corpusFamille()
    const lectures = sources()
    const cas = casModalite('c')
    const vide = projeterCas(corpus, cas, lectures)
    expect(vide.problemes).toBe(0)
    expect(vide.observationsModalite.membres).toBe(0)
    expect(vide.observationsModalite.valeursAbsentes).toBe(2)
    const invalide = sourceFamille()
    invalide.locuteurs[1].valeursLoc.v = 'supprimee'
    lectures.set('e1', { ok: true, data: invalide })
    lectures.set('e2', { ok: false, raison: 'hors ligne' })
    const incomplet = projeterCas(corpus, cas, lectures)
    expect(incomplet.problemes).toBe(2)
    expect(incomplet.observationsModalite).toMatchObject({ sourcesIllisibles: 1, valeursAbsentes: 1, valeursInvalides: 1 })
    expect(incomplet.diagnosticsRegles.map((d) => d.type)).toEqual(['valeur-invalide', 'source-indisponible'])
    delete corpus.variables.v
    expect(projeterCas(corpus, cas, lectures).diagnosticsRegles[0].type).toBe('variable-introuvable')
    expect(corpus.cas).toEqual({})
  })

  test('source entière dynamique, vide membre, modalité supprimée diagnostiquée', () => {
    const corpus = corpusFamille('entretien')
    const cas = casModalite('a', familleCas('entretien'))
    const lectures = sources()
    const resultat = projeterCas(corpus, cas, lectures, 'original')
    expect(resultat.passages).toHaveLength(1)
    expect(resultat.passages[0].texte).toContain('Question')
    expect(resultat.passages[0].texte).toContain('Sans locuteur')
    const data = sourceFamille()
    data.corpsTexte.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'Ajout ultérieur' }] })
    lectures.set('e1', { ok: true, data })
    expect(projeterCas(corpus, cas, lectures, 'original').passages[0].texte).toContain('Ajout ultérieur')
    data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph' }] }
    const vide = projeterCas(corpus, cas, lectures)
    expect(vide.metriques).toMatchObject({ passagesDisponibles: 0, sourcesDistinctes: 1 })
    expect(vide.observationsModalite.membres).toBe(1)
    expect(vide.problemes).toBe(0)
    corpus.variables.v.modalites = []
    expect(projeterCas(corpus, cas, lectures).diagnosticsRegles[0].type).toBe('modalite-introuvable')
  })
})

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('CorpusStore — familles et migration v6', () => {
  test('migration sans perte, commande atomique, suppression protégée et réouverture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-familles-'))
    dossiers.push(dir)
    mkdirSync(join(dir, 'entretiens'))
    const corpus = corpusFamille()
    corpus.formatVersion = 6
    delete corpus.famillesCas
    corpus.cas = { ancien: { ...casModalite(), id: 'ancien', nom: 'Ancien', familleId: undefined,
      regles: [{ type: 'personne', personneId: 'p1', inclureEnqueteurs: false }, { type: 'personne', personneId: 'p2', inclureEnqueteurs: true }],
      rattachements: [{ id: 'm', source: { entretienId: 'e1', repereId: 'r' }, provenance: 'manuel', creeLe: dateFamille }] } }
    delete corpus.cas.ancien.familleId
    corpus.recueils = { r: { id: 'r', nom: 'Recueil', creeLe: dateFamille, modifieLe: dateFamille, modeTexte: 'original', items: [] } }
    const data = sourceFamille()
    data.formatVersion = 6
    const fichier = join(dir, 'corpus.json')
    writeFileSync(fichier, JSON.stringify(corpus))
    for (const id of ['e1', 'e2']) writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(data))
    const store = new CorpusStore(dir)
    const migre = store.ouvrir()
    expect(migre).toMatchObject({ formatVersion: FORMAT_VERSION, famillesCas: {}, cas: corpus.cas, recueils: corpus.recueils })
    expect(JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8'))).toEqual({ ...data, formatVersion: FORMAT_VERSION })
    const sourceAvant = readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')
    store.casCommander({ type: 'creer-famille', famille: familleCas(), cas: [casModalite('c')] })
    expect(store.supprimerModalite('v', 'c')).toEqual({ ok: false, usages: 1 })
    expect(store.supprimerVariable('v').ok).toBe(false)
    // Effacer les valeurs ne suffit pas : les règles des cas bloquent toujours la suppression.
    expect(store.supprimerModalite('v', 'c', undefined, true).ok).toBe(false)
    expect(store.supprimerVariable('v', undefined, true).ok).toBe(false)
    const avant = readFileSync(fichier, 'utf8')
    expect(() => store.casCommander({ type: 'completer-famille', famille: familleCas(), cas: [casModalite('a'), casModalite('disparue')] })).toThrow()
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe(sourceAvant)
    expect(new CorpusStore(dir).ouvrir().famillesCas).toEqual({ f: familleCas() })
  })
})
