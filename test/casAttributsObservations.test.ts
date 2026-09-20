import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EntretienFichier, Variable } from '../src/shared/format'
import { CorpusStore } from '../src/main/corpusStore'
import {
  evaluerDerivationFamille, projeterAttributsCas, resoudreDerivationCas,
  variablesDisponiblesFamille, libelleValeurSaisie,
  type LectureSourceAttributs,
} from '../src/shared/corpus/observationsAttributs'
import type { Cas, DefinitionAttributCas, DerivationAttributCas } from '../src/shared/corpus/cas'
import { casModalite, corpusFamille, dateFamille, familleCas, sourceFamille } from './fixtures/casFamilles'

function variable(id: string, lib: string, portee: Variable['portee'], libs: string[]): Variable {
  return { id, lib, portee, priv: false, ordre: 1, vExport: 2,
    modalites: libs.map((l, i) => ({ id: `${id}${i + 1}`, lib: l, mExport: i + 1 })) }
}

function definition(id: string, type: DefinitionAttributCas['type'] = 'modalites'): DefinitionAttributCas {
  return { id, lib: id, type, priv: false, ordre: 0,
    modalites: type === 'modalites' ? [{ id: 'x', lib: 'Choix' }] : [] }
}

function derivation(variableSourceId: string, porteeSource: DerivationAttributCas['porteeSource'] = 'locuteur',
  attributId = 'attr'): DerivationAttributCas {
  return { attributId, variableSourceId, porteeSource }
}

function sources(...datas: EntretienFichier[]): Map<string, LectureSourceAttributs> {
  return new Map(datas.map((data, index) => [`e${index + 1}`, { ok: true, data } as LectureSourceAttributs]))
}

function avecTaille(data: EntretienFichier, valeurs: Record<number, string>): EntretienFichier {
  for (const [index, valeur] of Object.entries(valeurs)) {
    const locuteur = data.locuteurs.find((l) => l.index === Number(index))
    if (locuteur) locuteur.valeursLoc.taille = valeur
  }
  return data
}

function corpusAvecFamille() {
  const corpus = corpusFamille()
  corpus.variables.taille = variable('taille', 'Taille de l’établissement', 'locuteur',
    ['moins de 10 personnes', 'entre 10 et 100 personnes'])
  corpus.famillesCas = { f: familleCas() }
  corpus.cas = { 'cas-f-a': casModalite('a'), 'cas-f-b': casModalite('b') }
  return corpus
}

describe('résolution d’une dérivation — famille Établissement (portée locuteur)', () => {
  test('cohérente entre tous les entretiens, y compris un membre muet', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 3: 'taille1', 6: 'taille1' }),
    )
    const diagnostic = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures)
    expect(diagnostic.statut).toBe('coherent')
    expect(diagnostic.valeur).toBe('taille1')
    expect(diagnostic.valeurLibelle).toBe('moins de 10 personnes')
    expect(diagnostic.observations).toHaveLength(5)
    expect(diagnostic.problemes).toEqual([])
  })

  test('valeur manquante : disponible avec avertissement, jamais masquée', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 3: 'taille1' }),
    )
    const diagnostic = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures)
    expect(diagnostic.statut).toBe('coherent-incomplet')
    expect(diagnostic.valeur).toBe('taille1')
    expect(diagnostic.problemes.join(' ')).toMatch(/1 valeur\(s\) manquante/)
  })

  test('deux tailles pour A : incohérent, et indisponible pour toute la famille A/B/C', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 4: 'taille2', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 2: 'taille2', 3: 'taille2', 4: 'taille2', 6: 'taille2' }),
    )
    const a = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures)
    expect(a.statut).toBe('incoherent')
    expect(a.valeur).toBeNull()
    expect(a.problemes.join(' ')).toMatch(/Plusieurs valeurs distinctes/)
    const b = resoudreDerivationCas(corpus, corpus.cas!['cas-f-b'], derivation('taille'), lectures)
    expect(b.statut).toBe('coherent')
    const famille = evaluerDerivationFamille(corpus, familleCas(), derivation('taille'), lectures)
    expect(famille.disponible).toBe(false)
    expect(famille.parCas.map((c) => c.diagnostic.statut)).toEqual(['incoherent', 'coherent'])
    expect(famille.problemes.join(' ')).toContain('cas-f-a')
  })

  test('recette A/B/C : conflit sur A, B cohérent, C absent, puis réactivation après correction', () => {
    const corpus = corpusAvecFamille()
    corpus.variables.v.modalites.push({ id: 'c', lib: 'C', mExport: 3 })
    corpus.cas!['cas-f-c'] = casModalite('c')
    const premier = sourceFamille()
    premier.locuteurs.find((locuteur) => locuteur.index === 5)!.valeursLoc.v = 'c'
    const second = sourceFamille(true)
    avecTaille(premier, { 2: 'taille1', 3: 'taille1', 4: 'taille2', 6: 'taille1' })
    avecTaille(second, { 2: 'taille2', 3: 'taille2', 4: 'taille2', 6: 'taille1' })
    const lectures = sources(premier, second)
    const recette = derivation('taille')

    const conflit = evaluerDerivationFamille(corpus, familleCas(), recette, lectures)
    expect(conflit.disponible).toBe(false)
    expect(conflit.parCas.map((entree) => [entree.nomCas, entree.diagnostic.statut])).toEqual([
      ['cas-f-a', 'incoherent'],
      ['cas-f-b', 'coherent'],
      ['cas-f-c', 'absent'],
    ])

    second.locuteurs.find((locuteur) => locuteur.index === 3)!.valeursLoc.taille = 'taille1'
    const corrige = evaluerDerivationFamille(corpus, familleCas(), recette, lectures)
    expect(corrige.disponible).toBe(true)
    expect(corrige.parCas.map((entree) => [entree.nomCas, entree.diagnostic.statut])).toEqual([
      ['cas-f-a', 'coherent'],
      ['cas-f-b', 'coherent'],
      ['cas-f-c', 'absent'],
    ])
  })

  test('les identités de modalités sont comparées, pas leurs libellés', () => {
    const corpus = corpusAvecFamille()
    corpus.variables.taille = variable('taille', 'Taille', 'locuteur', ['petit', 'petit'])
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille2', 6: 'taille1' }),
      sourceFamille(true),
    )
    expect(resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures).statut).toBe('incoherent')
  })

  test('source illisible : non vérifiable, pas une simple valeur manquante', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 6: 'taille1' }))
    lectures.set('e2', { ok: false, raison: 'absent' })
    const diagnostic = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures)
    expect(diagnostic.statut).toBe('non-verifiable')
    expect(diagnostic.valeur).toBeNull()
    expect(diagnostic.observations.filter((o) => o.sourceIllisible)).toHaveLength(1)
    expect(evaluerDerivationFamille(corpus, familleCas(), derivation('taille'), lectures).disponible).toBe(false)
  })

  test('valeur pointant une modalité supprimée : non vérifiable', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'tailleSupprimee', 6: 'taille1' }),
    )
    const diagnostic = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('taille'), lectures)
    expect(diagnostic.statut).toBe('non-verifiable')
    expect(diagnostic.observations.find((o) => o.invalide)?.valeur).toBe('tailleSupprimee')
  })

  test('un ajout manuel depuis B ne change ni les membres ni le diagnostic de A', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 6: 'taille1', 4: 'taille2' }),
      avecTaille(sourceFamille(true), { 2: 'taille2', 3: 'taille2', 4: 'taille2', 6: 'taille2' }),
    )
    const cas = corpus.cas!['cas-f-a']
    const avant = resoudreDerivationCas(corpus, cas, derivation('taille'), lectures)
    cas.rattachements.push({ id: 'm', source: { entretienId: 'e1', repereId: 'r' }, provenance: 'manuel', creeLe: dateFamille })
    expect(resoudreDerivationCas(corpus, cas, derivation('taille'), lectures)).toEqual(avant)
  })

  test('variable absente, portée changée ou portée du cas modifiée : recette suspendue', () => {
    const corpus = corpusAvecFamille()
    const lectures = sources(sourceFamille())
    expect(resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('inconnue'), lectures).problemes[0])
      .toMatch(/absente ou sa portée a changé/)
    const casEntretiens: Cas = { id: 'e', nom: 'E', memo: '', creeLe: dateFamille, modifieLe: dateFamille,
      regles: [{ type: 'entretiens', entretienIds: ['e1'] }], rattachements: [] }
    expect(resoudreDerivationCas(corpus, casEntretiens, derivation('taille'), lectures).problemes[0])
      .toMatch(/portée des observations/)
  })
})

describe('résolution d’une dérivation — personnes et sources entières', () => {
  test('personne multi-entretiens : âge variable annoncé, enquêteurs exclus, non erronée', () => {
    const corpus = corpusFamille()
    corpus.variables.age = variable('age', 'Âge', 'locuteur', ['29 ans', '31 ans'])
    const cas: Cas = { id: 'p', nom: 'Marie', memo: '', creeLe: dateFamille, modifieLe: dateFamille,
      regles: [{ type: 'personne', personneId: 'p', inclureEnqueteurs: false }], rattachements: [] }
    const e1 = sourceFamille()
    e1.locuteurs[0].valeursLoc.age = '29ans'
    e1.locuteurs[1].valeursLoc.age = 'age1'
    const e2 = sourceFamille(true)
    e2.locuteurs[1].valeursLoc.age = 'age2'
    const diagnostic = resoudreDerivationCas(corpus, cas, derivation('age'), sources(e1, e2))
    expect(diagnostic.statut).toBe('incoherent')
    expect(diagnostic.observations.map((o) => o.valeur)).toEqual(['age1', 'age2'])
    expect(diagnostic.problemes.join(' ')).toMatch(/incompatible avec un attribut unique/)
  })

  test('sources entières : règles d’entretiens et de modalité d’entretien, valeurs générales', () => {
    const corpus = corpusFamille('entretien')
    corpus.variables.saison = variable('saison', 'Saison', 'entretien', ['hiver', 'été'])
    const famille = familleCas('entretien')
    corpus.famillesCas = { f: famille }
    corpus.cas = { 'cas-f-a': casModalite('a', famille) }
    const e1 = sourceFamille()
    e1.meta.valeursGen.saison = 'saison1'
    const e2 = sourceFamille(true)
    e2.meta.valeursGen.saison = 'saison2'
    const lectures = sources(e1, e2)
    const casEntretiens: Cas = { id: 'e', nom: 'E', memo: '', creeLe: dateFamille, modifieLe: dateFamille,
      regles: [{ type: 'entretiens', entretienIds: ['e1'] }], rattachements: [] }
    expect(resoudreDerivationCas(corpus, casEntretiens, derivation('saison', 'entretien'), lectures))
      .toMatchObject({ statut: 'coherent', valeur: 'saison1' })
    const casModaliteEntretien = resoudreDerivationCas(corpus, corpus.cas!['cas-f-a'], derivation('saison', 'entretien'), lectures)
    expect(casModaliteEntretien).toMatchObject({ statut: 'coherent', valeur: 'saison1' })
    expect(casModaliteEntretien.observations).toHaveLength(1)
  })
})

describe('projection des attributs d’un cas', () => {
  test('un membre de famille combine saisies et dérivations familiales ; la dérivation propre reste hors famille', () => {
    const corpus = corpusAvecFamille()
    corpus.attributsCas = { attr: definition('attr'), statut: definition('statut', 'texte'), attr2: definition('attr2') }
    const famille = familleCas()
    famille.derivationsAttributs = [derivation('taille')]
    corpus.famillesCas = { f: famille }
    const cas = casModalite('a', famille)
    cas.valeursAttributsSaisis = { statut: 'à revoir' }
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 3: 'taille1', 6: 'taille1' }),
    )
    const projection = projeterAttributsCas(corpus, cas, lectures)
    expect(projection.map((a) => [a.attributId, a.origine])).toEqual([
      ['attr', 'derivation-famille'],
      ['statut', 'saisi'],
    ])
    expect(projection[0].diagnostic?.statut).toBe('coherent')
    expect(projection[1].diagnostic).toBeNull()

    const autonome = casModalite('a')
    delete autonome.familleId
    autonome.derivationsPropres = [derivation('v', 'locuteur', 'attr2')]
    expect(projeterAttributsCas(corpus, autonome, lectures).map((a) => [a.attributId, a.origine]))
      .toEqual([['attr2', 'derivation-propre']])
    expect(libelleValeurSaisie(corpus.attributsCas!.statut, 'à revoir')).toBe('à revoir')
    expect(libelleValeurSaisie(definition('choix'), 'x')).toBe('Choix')
  })

  test('un conflit local suspend aussi la valeur cohérente des autres membres de la famille', () => {
    const corpus = corpusAvecFamille()
    corpus.attributsCas = { attr: definition('attr') }
    const famille = familleCas()
    famille.derivationsAttributs = [derivation('taille')]
    corpus.famillesCas = { f: famille }
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille2', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 2: 'taille2', 3: 'taille2', 6: 'taille2' }),
    )
    const projectionB = projeterAttributsCas(corpus, corpus.cas!['cas-f-b'], lectures)[0]
    expect(projectionB.diagnostic).toMatchObject({
      statut: 'coherent-incomplet',
      valeur: null,
      valeurLibelle: null,
      suspensionFamille: {},
    })
    expect(projectionB.diagnostic?.problemes.join(' ')).toMatch(/suspendu pour toute la famille/)
  })

  test('variables proposées à la famille : portée filtrée et disponibilité calculée', () => {
    const corpus = corpusAvecFamille()
    corpus.variables.saison = variable('saison', 'Saison', 'entretien', ['hiver'])
    const lectures = sources(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille2', 4: 'taille2', 6: 'taille1' }),
      avecTaille(sourceFamille(true), { 2: 'taille2', 3: 'taille2', 4: 'taille2', 6: 'taille2' }),
    )
    const candidates = variablesDisponiblesFamille(corpus, familleCas(), lectures)
    expect(candidates.map((c) => [c.variable.id, c.disponible])).toEqual([['v', true], ['taille', false]])
    expect(candidates[1].problemes.join(' ')).toContain('cas-f-a')
  })
})

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('CorpusStore — recontrôle des recettes à l’enregistrement', () => {
  function ecrireBanc() {
    const dir = mkdtempSync(join(tmpdir(), 'cas-derivation-'))
    dossiers.push(dir)
    mkdirSync(join(dir, 'entretiens'))
    const corpus = corpusAvecFamille()
    corpus.attributsCas = {}
    corpus.personnes = { p: { id: 'p', nom: 'Marie' } }
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus))
    return dir
  }

  test('conflit dans un cas : recette de famille refusée, puis acceptée après correction', () => {
    const dir = ecrireBanc()
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille2', 4: 'taille2', 6: 'taille1' })))
    writeFileSync(join(dir, 'entretiens/e2.json'), JSON.stringify(sourceFamille(true)))
    const store = new CorpusStore(dir)
    store.ouvrir()
    expect(() => store.casCommander({ type: 'ajouter-derivation-famille', familleId: 'f',
      membresAttendus: ['cas-f-a', 'cas-f-b'], derivation: derivation('taille'), definition: definition('attr') }))
      .toThrow(/ne peut pas être enregistrée/)
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille1', 4: 'taille2', 6: 'taille1' })))
    store.casCommander({ type: 'ajouter-derivation-famille', familleId: 'f',
      membresAttendus: ['cas-f-a', 'cas-f-b'], derivation: derivation('taille'), definition: definition('attr') })
    expect(new CorpusStore(dir).ouvrir().famillesCas!.f.derivationsAttributs).toEqual([derivation('taille')])
  })

  test('conflit sur un cas isolé : recette propre refusée, source illisible aussi', () => {
    const dir = ecrireBanc()
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(
      avecTaille(sourceFamille(), { 2: 'taille1', 3: 'taille2', 4: 'taille2', 6: 'taille1' })))
    const store = new CorpusStore(dir)
    store.ouvrir()
    store.casCommander({ type: 'creer', cas: { id: 'p', nom: 'Cas personne', memo: '', creeLe: dateFamille,
      modifieLe: dateFamille, regles: [{ type: 'personne', personneId: 'p', inclureEnqueteurs: false }], rattachements: [] } })
    expect(() => store.casCommander({ type: 'ajouter-derivation-cas', casId: 'p',
      derivation: derivation('taille'), definition: definition('attr') })).toThrow(/ne peut pas être enregistrée/)
    rmSync(join(dir, 'entretiens/e1.json'))
    expect(() => store.casCommander({ type: 'ajouter-derivation-cas', casId: 'p',
      derivation: derivation('taille'), definition: definition('attr') })).toThrow(/ne peut pas être enregistrée/)
  })
})
