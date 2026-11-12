import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appliquerCommandeCas, normaliserAttributsCas, normaliserCas, normaliserFamillesCas,
  compterUsagesAttributCas, compterUsagesCasVariable, porteeObservationsCas,
  type CommandeCas, type DefinitionAttributCas, type DerivationAttributCas,
} from '../src/shared/corpus/cas'
import { retirerVariable, modifierVariable, type Variable } from '../src/shared/corpus/variables'
import { CorpusStore } from '../src/main/corpusStore'
import { FORMAT_VERSION } from '../src/shared/format'
import { casModalite, corpusFamille, dateFamille, familleCas, sourceFamille, variableFamille } from './fixtures/casFamilles'

function definitionAttribut(id = 'attr', lib = 'Taille de l’établissement'): DefinitionAttributCas {
  return { id, lib, type: 'modalites', priv: false, ordre: 0,
    modalites: [{ id: 't1', lib: 'moins de 10 personnes' }, { id: 't2', lib: 'entre 10 et 100 personnes' }] }
}

function variableTaille(portee: Variable['portee'] = 'locuteur'): Variable {
  return { id: 'taille', lib: 'Taille', portee, priv: false, ordre: 1, vExport: 2,
    modalites: [{ id: 't1', lib: 'petite', mExport: 1 }, { id: 't2', lib: 'grande', mExport: 2 }] }
}

function derivation(attributId = 'attr', variableSourceId = 'taille',
  porteeSource: DerivationAttributCas['porteeSource'] = 'locuteur'): DerivationAttributCas {
  return { attributId, variableSourceId, porteeSource }
}

function casManuel(id = 'manuel') {
  return { id, nom: 'Cas manuel', memo: '', creeLe: dateFamille, modifieLe: dateFamille,
    regles: [], rattachements: [] }
}

function modele() {
  const corpus = corpusFamille()
  corpus.variables.taille = variableTaille()
  corpus.attributsCas = {}
  let horloge = 0
  const commande = (commande: CommandeCas) => {
    corpus.cas = appliquerCommandeCas(corpus.cas, commande, {
      maintenant: () => `${dateFamille.slice(0, -5)}${String(horloge++).padStart(2, '0')}Z`,
      personneExiste: () => true, entretienExiste: () => true,
      familles: corpus.famillesCas, attributs: corpus.attributsCas, variables: corpus.variables,
    })
  }
  return { corpus, commande, avance: () => { horloge += 10 } }
}

function familleAvecCas(commande: (commande: CommandeCas) => void, membres = ['a', 'b']) {
  const famille = familleCas()
  commande({ type: 'creer-famille', famille, cas: membres.map((m) => casModalite(m, famille)) })
  return famille
}

describe('cas — attributs : définitions', () => {
  test('création rejouable, libellés uniques et normalisés', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-attribut', definition: { ...definitionAttribut(), lib: '  Taille  ' } })
    expect(corpus.attributsCas!.attr).toMatchObject({ id: 'attr', lib: 'Taille' })
    const avant = structuredClone(corpus.attributsCas)
    commande({ type: 'creer-attribut', definition: { ...definitionAttribut(), lib: '  Taille  ' } })
    expect(corpus.attributsCas).toEqual(avant)
    expect(() => commande({ type: 'creer-attribut', definition: definitionAttribut('autre', '  taille ') })).toThrow(/libellé/)
    expect(() => commande({ type: 'creer-attribut', definition: definitionAttribut('attr', 'Autre') })).toThrow(/identité/)
    expect(() => appliquerCommandeCas(corpus.cas, { type: 'creer-attribut', definition: definitionAttribut('x') },
      { maintenant: () => dateFamille, personneExiste: () => true, entretienExiste: () => true })).toThrow(/disponibles/)
  })

  test('modification protégée par la valeur attendue, modalités utilisées conservées', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    const attendu = structuredClone(corpus.attributsCas!.attr)
    expect(() => commande({ type: 'modifier-attribut', attributId: 'attr',
      attendu: { ...attendu, lib: 'Périmé' }, patch: { priv: true } })).toThrow(/changé/)
    expect(() => commande({ type: 'modifier-attribut', attributId: 'absent', attendu, patch: {} })).toThrow(/existe plus/)
    commande({ type: 'modifier-attribut', attributId: 'attr', attendu, patch: { priv: true, lib: ' Taille déclarée ' } })
    expect(corpus.attributsCas!.attr).toMatchObject({ lib: 'Taille déclarée', priv: true })
    const attenduTexte = structuredClone(corpus.attributsCas!.attr)
    const casManuelTest = casManuel()
    commande({ type: 'creer', cas: casManuelTest })
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: null, valeur: 't2' })
    expect(() => commande({ type: 'modifier-attribut', attributId: 'attr', attendu: attenduTexte,
      patch: { modalites: [{ id: 't1', lib: 'moins de 10 personnes' }] } })).toThrow(/encore utilisée/)
    commande({ type: 'modifier-attribut', attributId: 'attr', attendu: attenduTexte,
      patch: { modalites: [{ id: 't2', lib: 'entre 10 et 100 personnes' }] } })
    expect(corpus.attributsCas!.attr.modalites).toHaveLength(1)
  })

  test('suppression refusée tant que l’attribut reste utilisé', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer-famille', famille: familleCas(), cas: [casModalite()] })
    commande({ type: 'creer', cas: casManuel() })
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    commande({ type: 'ajouter-derivation-famille', familleId: 'f', membresAttendus: [casModalite().id], derivation: derivation() })
    expect(() => commande({ type: 'supprimer-attribut', attributId: 'attr' })).toThrow(/utilisé/)
    commande({ type: 'retirer-derivation-famille', familleId: 'f', attributId: 'attr', attendu: derivation() })
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: null, valeur: 't1' })
    expect(() => commande({ type: 'supprimer-attribut', attributId: 'attr' })).toThrow(/utilisé/)
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: 't1', valeur: null })
    commande({ type: 'supprimer-attribut', attributId: 'attr' })
    expect(corpus.attributsCas).toEqual({})
  })
})

describe('cas — saisie de valeurs d’attribut', () => {
  test('poser, rejouer, effacer et valider une valeur', () => {
    const { corpus, commande, avance } = modele()
    commande({ type: 'creer', cas: casManuel() })
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: null, valeur: 't1' })
    expect(corpus.cas!.manuel.valeursAttributsSaisis).toEqual({ attr: 't1' })
    avance()
    const apres = structuredClone(corpus.cas!.manuel)
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: 't1', valeur: 't1' })
    expect(corpus.cas!.manuel).toEqual(apres)
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: null, valeur: 't2' })).toThrow(/changé/)
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: 't1', valeur: 'inconnue' })).toThrow(/n’appartient/)
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: 't1', valeur: null })
    expect(corpus.cas!.manuel.valeursAttributsSaisis).toEqual({})
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'attr', attendu: null, valeur: null })
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'absent', attributId: 'attr', attendu: null, valeur: 't1' })).toThrow(/existe plus/)
  })

  test('texte libre : trim, refus du vide, effacement idempotent', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer', cas: casManuel() })
    commande({ type: 'creer-attribut', definition: { id: 'txt', lib: 'Statut de suivi', type: 'texte', priv: true, ordre: 1, modalites: [] } })
    expect(() => commande({ type: 'creer-attribut', definition: { id: 'txt2', lib: 'Suivi', type: 'texte', priv: false, ordre: 2, modalites: [{ id: 'm', lib: 'Interdit' }] } })).toThrow(/texte/)
    commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'txt', attendu: null, valeur: '  à revoir  ' })
    expect(corpus.cas!.manuel.valeursAttributsSaisis).toEqual({ txt: 'à revoir' })
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'manuel', attributId: 'txt', attendu: 'à revoir', valeur: '   ' })).toThrow(/vide/)
  })

  test('un attribut dérivé ne se laisse pas saisir sur le cas', () => {
    const { corpus, commande } = modele()
    const famille = familleAvecCas(commande)
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: [casModalite('a').id, casModalite('b').id], derivation: derivation() })
    expect(() => commande({ type: 'definir-valeur-attribut', casId: casModalite('a').id, attributId: 'attr', attendu: null, valeur: 't1' })).toThrow(/dérivé/)
    commande({ type: 'creer', cas: { ...casManuel('avecRegle'), regles: [{ type: 'personne', personneId: 'p1', inclureEnqueteurs: false }] } })
    commande({ type: 'ajouter-derivation-cas', casId: 'avecRegle', derivation: derivation() })
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'avecRegle', attributId: 'attr', attendu: null, valeur: 't1' })).toThrow(/dérivé/)
    expect(corpus.cas!.avecRegle.valeursAttributsSaisis).toBeUndefined()
  })
})

describe('cas — dérivations de famille', () => {
  test('ajout atomique définition + recette, garde-fous et rejeu', () => {
    const { corpus, commande } = modele()
    const famille = familleAvecCas(commande)
    const membres = [casModalite('a').id, casModalite('b').id]
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation(), definition: definitionAttribut() })
    expect(corpus.famillesCas!.f.derivationsAttributs).toEqual([derivation()])
    expect(corpus.attributsCas!.attr).toBeDefined()
    const avant = structuredClone({ cas: corpus.cas, familles: corpus.famillesCas, attributs: corpus.attributsCas })
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation(), definition: definitionAttribut() })
    expect({ cas: corpus.cas, familles: corpus.famillesCas, attributs: corpus.attributsCas }).toEqual(avant)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation('attr', 'v') })).toThrow(/déjà dérivé/)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation('attr2'), definition: { ...definitionAttribut('attr2'), id: 'autre' } })).toThrow(/correspond/)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: [membres[0]],
      derivation: derivation('attr3'), definition: definitionAttribut('attr3') })).toThrow(/membres/)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: 'absente', membresAttendus: [], derivation: derivation() })).toThrow(/existe plus/)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation('attr4', 'absente'), definition: definitionAttribut('attr4') })).toThrow(/absente ou sa portée/)
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres,
      derivation: derivation('attr5', 'taille', 'entretien'), definition: definitionAttribut('attr5') })).toThrow(/absente ou sa portée/)
  })

  test('une valeur saisie existante interdit la recette sur la famille', () => {
    const { corpus, commande } = modele()
    const famille = familleAvecCas(commande, ['a'])
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    commande({ type: 'definir-valeur-attribut', casId: casModalite('a').id, attributId: 'attr', attendu: null, valeur: 't1' })
    expect(() => commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: [casModalite('a').id], derivation: derivation() })).toThrow(/valeur saisie/)
    expect(corpus.famillesCas!.f.derivationsAttributs).toBeUndefined()
  })

  test('retrait protégé par la recette attendue, dissolution bloquée par les recettes', () => {
    const { corpus, commande } = modele()
    const famille = familleAvecCas(commande)
    const membres = [casModalite('a').id, casModalite('b').id]
    commande({ type: 'creer-attribut', definition: definitionAttribut('attr') })
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: membres, derivation: derivation() })
    expect(() => commande({ type: 'retirer-derivation-famille', familleId: famille.id, attributId: 'attr', attendu: derivation('attr', 'v') })).toThrow(/changé/)
    expect(() => commande({ type: 'dissoudre-famille', famille: structuredClone(corpus.famillesCas!.f), membresAttendus: membres })).toThrow(/recettes/)
    commande({ type: 'retirer-derivation-famille', familleId: famille.id, attributId: 'attr', attendu: derivation() })
    expect(corpus.famillesCas!.f.derivationsAttributs).toBeUndefined()
    expect(() => commande({ type: 'retirer-derivation-famille', familleId: famille.id, attributId: 'attr', attendu: derivation() })).toThrow(/déjà été retirée/)
    commande({ type: 'dissoudre-famille', famille: structuredClone(corpus.famillesCas!.f), membresAttendus: membres })
    expect(corpus.famillesCas).toEqual({})
  })
})

describe('cas — dérivations propres', () => {
  test('réservées aux cas avec règle, portée cohérente, sans concurrence', () => {
    const { corpus, commande } = modele()
    commande({ type: 'creer', cas: casManuel() })
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: 'manuel', derivation: derivation() })).toThrow(/manuel/)
    commande({ type: 'creer', cas: { ...casManuel('p'), nom: 'Cas personne', regles: [{ type: 'personne', personneId: 'p1', inclureEnqueteurs: false }] } })
    expect(porteeObservationsCas(corpus.cas!.p)).toBe('locuteur')
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: 'p', derivation: derivation('attr', 'taille', 'entretien') })).toThrow(/portée/)
    commande({ type: 'ajouter-derivation-cas', casId: 'p', derivation: derivation() })
    expect(corpus.cas!.p.derivationsPropres).toEqual([derivation()])
    const avant = structuredClone(corpus.cas!.p)
    commande({ type: 'ajouter-derivation-cas', casId: 'p', derivation: derivation() })
    expect(corpus.cas!.p).toEqual(avant)
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: 'p', derivation: derivation('attr', 'v') })).toThrow(/déjà dérivé/)
    expect(() => commande({ type: 'definir-valeur-attribut', casId: 'p', attributId: 'attr', attendu: null, valeur: 't1' })).toThrow(/dérivé/)
  })

  test('règle d’entretiens dérive de variables d’entretien ; un membre de famille ne porte aucune recette propre', () => {
    const { corpus, commande } = modele()
    corpus.variables.gen = variableTaille('entretien')
    commande({ type: 'creer', cas: { ...casManuel('e'), nom: 'Cas entretiens', regles: [{ type: 'entretiens', entretienIds: ['e1'] }] } })
    commande({ type: 'creer-attribut', definition: definitionAttribut('attrE', 'Taille E') })
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: 'e', derivation: derivation('attrE', 'taille', 'locuteur') })).toThrow(/portée/)
    commande({ type: 'ajouter-derivation-cas', casId: 'e', derivation: derivation('attrE', 'gen', 'entretien') })
    expect(corpus.cas!.e.derivationsPropres).toHaveLength(1)

    const famille = familleAvecCas(commande)
    const membre = casModalite('a').id
    commande({ type: 'creer-attribut', definition: definitionAttribut('attrF', 'Taille F') })
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: [membre, casModalite('b').id],
      derivation: derivation('attrF') })
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: membre, derivation: derivation('attrF') })).toThrow(/membre d’une famille/)
    expect(() => commande({ type: 'ajouter-derivation-cas', casId: membre, derivation: derivation('attrE') })).toThrow(/membre d’une famille/)
    expect(corpus.cas![membre].derivationsPropres).toBeUndefined()
  })
})

describe('cas — usages des attributs et des variables', () => {
  test('comptage des usages et variables protégées par les recettes', () => {
    const { corpus, commande } = modele()
    const famille = familleAvecCas(commande, ['a'])
    commande({ type: 'creer', cas: { ...casManuel('p'), regles: [{ type: 'personne', personneId: 'p1', inclureEnqueteurs: false }] } })
    commande({ type: 'creer-attribut', definition: definitionAttribut() })
    expect(compterUsagesAttributCas(corpus, 'attr')).toEqual({ valeursSaisies: 0, derivationsFamilles: 0, derivationsCas: 0 })
    commande({ type: 'ajouter-derivation-famille', familleId: famille.id, membresAttendus: [casModalite('a').id], derivation: derivation() })
    commande({ type: 'ajouter-derivation-cas', casId: 'p', derivation: derivation('attr', 'v') })
    commande({ type: 'creer', cas: { ...casManuel('saisie'), nom: 'Cas saisie' } })
    commande({ type: 'definir-valeur-attribut', casId: 'saisie', attributId: 'attr', attendu: null, valeur: 't1' })
    expect(compterUsagesAttributCas(corpus, 'attr')).toEqual({ valeursSaisies: 1, derivationsFamilles: 1, derivationsCas: 1 })
    expect(compterUsagesCasVariable(corpus, 'taille')).toBe(1)
    expect(() => retirerVariable(corpus, 'taille')).toThrow(/utilisée/)
    expect(() => modifierVariable(corpus, 'taille', { portee: 'entretien' })).toThrow(/utilisée/)
    expect(() => retirerVariable(corpus, 'v')).toThrow(/utilisée/)
    expect(compterUsagesCasVariable(corpus, 'v', 'a')).toBe(1)
  })

  test('normalisation : registre, cas et familles conservent les champs valides', () => {
    const definition = definitionAttribut()
    expect(normaliserAttributsCas({ attr: { ...definition, lib: '  Taille  ' } })).toEqual({ attr: { ...definition, lib: 'Taille' } })
    expect(normaliserAttributsCas({ mauvais: { id: 'autre', lib: 'Mauvais' }, invalide: { ...definition, priv: 'oui' }, attr: definition }))
      .toEqual({ attr: definition })
    const cas = casModalite()
    delete cas.familleId
    cas.valeursAttributsSaisis = { saisi: 't1' }
    cas.derivationsPropres = [derivation()]
    expect(normaliserCas({ [cas.id]: cas })).toEqual({ [cas.id]: cas })
    const famille = familleCas()
    famille.derivationsAttributs = [derivation()]
    expect(normaliserFamillesCas({ f: famille })).toEqual({ f: famille })
    const duplique = casModalite()
    delete duplique.familleId
    duplique.derivationsPropres = [derivation(), derivation()]
    expect(normaliserCas({ [duplique.id]: duplique })).toEqual({})
    const membreAvecRecettePropre = casModalite()
    membreAvecRecettePropre.derivationsPropres = [derivation()]
    expect(normaliserCas({ [membreAvecRecettePropre.id]: membreAvecRecettePropre })).toEqual({})
    const concurrence = casModalite()
    delete concurrence.familleId
    concurrence.valeursAttributsSaisis = { attr: 't1' }
    concurrence.derivationsPropres = [derivation()]
    expect(normaliserCas({ [concurrence.id]: concurrence })).toEqual({})
    const casAvant = casModalite()
    casAvant.valeursAttributsSaisis = { attr: '' }
    expect(normaliserCas({ [casAvant.id]: casAvant })).toEqual({})
  })
})

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('CorpusStore — migration v7 → v8 et attributs persistés', () => {
  test('corpus v7 avec attributs rouvre en v8 sans perte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-attributs-'))
    dossiers.push(dir)
    mkdirSync(join(dir, 'entretiens'))
    const corpus = corpusFamille()
    corpus.formatVersion = 7
    const cas = casModalite()
    cas.valeursAttributsSaisis = { attr: 't1' }
    const famille = familleCas()
    famille.derivationsAttributs = [derivation()]
    cas.familleId = famille.id
    corpus.cas = { [cas.id]: cas }
    corpus.famillesCas = { f: famille }
    corpus.attributsCas = { attr: definitionAttribut() }
    const data = sourceFamille()
    data.formatVersion = 7
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
    for (const id of ['e1', 'e2']) writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(data))
    const store = new CorpusStore(dir)
    const migre = store.ouvrir()
    expect(migre).toMatchObject({ formatVersion: FORMAT_VERSION, cas: corpus.cas, famillesCas: { f: famille }, attributsCas: { attr: definitionAttribut() } })
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).formatVersion).toBe(FORMAT_VERSION)
    expect(JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).formatVersion).toBe(FORMAT_VERSION)
    const rouvert = new CorpusStore(dir).ouvrir()
    expect(rouvert.attributsCas).toEqual({ attr: definitionAttribut() })
    expect(rouvert.cas![cas.id].valeursAttributsSaisis).toEqual({ attr: 't1' })
  })

  test('commandes d’attributs persistées et protégées à travers le store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-attributs-cmd-'))
    dossiers.push(dir)
    mkdirSync(join(dir, 'entretiens'))
    const corpus = corpusFamille()
    corpus.variables.taille = variableTaille()
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
    for (const id of ['e1', 'e2']) writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(sourceFamille()))
    const store = new CorpusStore(dir)
    store.casCommander({ type: 'creer-famille', famille: familleCas(), cas: [casModalite('a')] })
    store.casCommander({ type: 'creer-attribut', definition: definitionAttribut() })
    store.casCommander({ type: 'ajouter-derivation-famille', familleId: 'f', membresAttendus: [casModalite('a').id], derivation: derivation() })
    expect(new CorpusStore(dir).ouvrir().famillesCas!.f.derivationsAttributs).toEqual([derivation()])
    expect(() => store.casCommander({ type: 'supprimer-cas', casId: casModalite('a').id, attenduModifieLe: casModalite('a').modifieLe })).not.toThrow()
    expect(store.supprimerVariable('taille').ok).toBe(false)
  })
})
