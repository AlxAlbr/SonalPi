import { describe, expect, test } from 'vitest'
import { inventorierSuppressionAnon, preparerSuppressionAnon } from '../src/shared/corpus/suppressionAnon'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import { FORMAT_VERSION } from '../src/shared/format'

describe('suppression globale des seules décisions attribuées', () => {
  test('retire les liens, exceptions et incluses attribuées ; aucune autre donnée ne change', () => {
    const f = fixtureDissociationAnon(), original = structuredClone(f)
    const r = preparerSuppressionAnon(f.corpus, f.sources, f.demande)
    expect(f).toEqual(original)
    expect(r.bilan).toEqual({ annotations: 8, anonymisees: 6, exceptions: 2, inclusesRetirees: 2, inclusesRevelees: 0, entretiens: 2, regleRetiree: true })
    for (const e of r.entretiens) expect(e.apres).toEqual({ ...e.avant, annotations: e.avant.annotations.filter((a) => a.regle !== 'personne') })
    expect(r.corpusApres).toEqual({ ...f.corpus, reglesAnon: { autre: f.corpus.reglesAnon.autre, vide: f.corpus.reglesAnon.vide } })
    expect(r.entretiens.map((e) => e.id)).toEqual(['e1', 'e2'])
  })
  test.each(['anonymise', 'exception'] as const)('signale une décision indépendante %s révélée sans la recréer', (etat) => {
    const f = fixtureDissociationAnon(['e1']), d = f.sources[0].data
    f.corpus.reglesAnon.personne.entite = ['Rue Karine']
    for (const a of d.annotations) delete a.regle
    const grande = d.annotations.find((a) => a.id === 'englobante')!, interne = d.annotations.find((a) => a.id === 'a5')!
    grande.regle = 'personne'; interne.etat = etat
    const original = structuredClone(interne)
    const r = preparerSuppressionAnon(f.corpus, f.sources, f.demande)
    expect(r.bilan).toMatchObject({ annotations: 1, inclusesRevelees: 1 })
    expect(r.inventaire.entretiens[0].decisionsRevelees[0]).toMatchObject({ annotationId: 'a5', etat, extrait: 'Karine' })
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a5')).toEqual(original)
  })
  test('mémoires et décisions locales recouvrantes restent indépendantes, même avec le même pseudo', () => {
    const f = fixtureDissociationAnon(), d = f.sources[0].data
    d.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire'], etat: 'declaration' })
    d.pseudosDeclares!.karine = ['Locale']; d.brouillonsAnon!.push({ entite: 'Karine', pseudo: '' })
    const locale = d.annotations.find((a) => a.id === 'a3')!
    locale.from = 25; locale.to = 31; locale.pseudo = 'Claire'
    const r = preparerSuppressionAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens[0].apres.definitionsAnonLocales).toEqual(d.definitionsAnonLocales)
    expect(r.entretiens[0].apres.pseudosDeclares).toEqual(d.pseudosDeclares)
    expect(r.entretiens[0].apres.brouillonsAnon).toEqual(d.brouillonsAnon)
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a3')).toEqual(locale)
  })
  test('choix historiques et variantes inutilisées ne demandent aucun repli ; attentes jamais posées', () => {
    const f = fixtureDissociationAnon(); f.sources[0].data.annotations[0].pseudo = 'Historique'
    const r = preparerSuppressionAnon(f.corpus, f.sources, f.demande)
    expect(r.inventaire.entretiens[0].attentes).toBeGreaterThan(0)
    expect(r.entretiens[0].apres.annotations.filter((a) => a.type === 'anon')).toHaveLength(2)
  })
  test('règle inutilisée : définition seule retirée, aucun entretien ni mémoire créé', () => {
    const f = fixtureDissociationAnon(), r = preparerSuppressionAnon(f.corpus, f.sources, { regleId: 'vide' })
    expect(r.entretiens).toEqual([]); expect(r.bilan.annotations).toBe(0)
  })
  test.each(['absent', 'ancien', 'plage', 'doublon', 'pseudo', 'memoire', 'autre-type', 'reference', 'id', 'id-independant'] as const)('preuve incomplète refusée : %s', (cas) => {
    const f = fixtureDissociationAnon(), d = f.sources[0].data
    if (cas === 'absent') f.sources.splice(2, 1)
    if (cas === 'ancien') f.sources[2].data.formatVersion = FORMAT_VERSION - 1
    if (cas === 'plage') d.annotations[0].to = 9999
    if (cas === 'doublon') d.annotations[0].id = d.annotations[1].id
    if (cas === 'pseudo') d.annotations[0].pseudo = ''
    if (cas === 'memoire') d.definitionsAnonLocales![0].pseudos = []
    if (cas === 'autre-type') d.annotations[0].type = 'codage'
    if (cas === 'reference') (f.sources[2].data.annotations as unknown[]).push({ type: 'anon', regle: {} })
    if (cas === 'id') d.annotations[0].id = ''
    if (cas === 'id-independant') d.annotations.find((a) => a.id === 'a3')!.id = ''
    expect(inventorierSuppressionAnon(f.corpus, f.sources, f.demande).faisable).toBe(false)
    expect(() => preparerSuppressionAnon(f.corpus, f.sources, f.demande)).toThrow('Résolvez')
  })
  test('refuse demande absente, identité forgée et barrière publiée', () => {
    const f = fixtureDissociationAnon()
    expect(() => inventorierSuppressionAnon(f.corpus, f.sources, { regleId: 'absente' })).toThrow('absente')
    f.corpus.dissociationAnon = { operationId: 'dissociation-engagee', regleId: 'personne' }
    expect(() => inventorierSuppressionAnon(f.corpus, f.sources, f.demande)).toThrow('engagée')
    delete f.corpus.dissociationAnon; f.corpus.reglesAnon.personne.id = 'autre'
    expect(() => inventorierSuppressionAnon(f.corpus, f.sources, f.demande)).toThrow('Normalisez')
  })
})
