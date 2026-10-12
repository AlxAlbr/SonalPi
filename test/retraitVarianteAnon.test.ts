import { describe, expect, test } from 'vitest'
import { inventorierRetraitVarianteAnon, preparerRetraitVarianteAnon } from '../src/shared/corpus/retraitVarianteAnon'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import { matriceCapacites, exigerGeste } from '../src/main/gitlab/politiqueGestes'

describe('retrait de variante : remplacement lié et explicite', () => {
  test('bilan exact, exceptions visibles/masquées ; original, indépendants et non-cible intacts', () => {
    const f = fixtureRetraitVarianteAnon(), avant = structuredClone(f), r = preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)
    expect(r.bilan).toEqual({ annotations: 6, anonymisees: 3, exceptions: 3, incluses: 2, entretiens: 2, varianteRetiree: true })
    expect(r.corpusApres.reglesAnon.personne.pseudos).toEqual(['Rebecca'])
    const attendu = structuredClone(f.corpus); attendu.reglesAnon.personne.pseudos = ['Rebecca']; expect(r.corpusApres).toEqual(attendu)
    for (const e of r.entretiens) {
      const d = structuredClone(e.avant)
      for (const a of d.annotations) if (a.type === 'anon' && a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'Rebecca'
      expect(e.apres).toEqual(d); expect(e.apres.corpsTexte).toEqual(e.avant.corpsTexte)
      expect(e.apres.locuteurs).toEqual(e.avant.locuteurs); expect(e.apres.definitionsAnonLocales).toEqual(e.avant.definitionsAnonLocales)
    }
    expect(r.entretiens.map((e) => e.id)).toEqual(['e1', 'e2']); expect(f).toEqual(avant)
    expect(r.inventaire.entretiens[0].usages.find((u) => u.annotationId === 'a5')).toMatchObject({ etat: 'exception', incluse: true, pseudo: 'Claire' })
  })
  test('l’autre variante peut être retirée, sans inverser les attributions', () => {
    const f = fixtureRetraitVarianteAnon(), r = preparerRetraitVarianteAnon(f.corpus, f.sources, { ...f.demande, pseudoRetire: 'Rebecca', pseudoConserve: 'Claire' })
    expect(r.bilan.annotations).toBe(6); expect(r.corpusApres.reglesAnon.personne.pseudos).toEqual(['Claire'])
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a2')).toEqual(f.sources[0].data.annotations.find((a) => a.id === 'a2'))
  })
  test('variante sans usage : définition seule, aucun placement ni création de mémoire', () => {
    const f = fixtureRetraitVarianteAnon(); for (const s of f.sources) for (const a of s.data.annotations) if (a.regle === 'personne') a.pseudo = 'Rebecca'
    const r = preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens).toEqual([]); expect(r.bilan.annotations).toBe(0); expect(r.corpusApres.membership).toEqual(f.corpus.membership)
  })
  test('déclarations, brouillons et mémoire héritée recouvrants restent indépendants', () => {
    const f = fixtureRetraitVarianteAnon(), s = f.sources[0].data
    s.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
    s.brouillonsAnon!.push({ entite: 'Karine', pseudo: 'Claire' }); s.pseudosDeclares!.karine = ['Claire', 'Rebecca']
    const r = preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens[0].apres.definitionsAnonLocales).toEqual(s.definitionsAnonLocales)
    expect(r.entretiens[0].apres.brouillonsAnon).toEqual(s.brouillonsAnon); expect(r.entretiens[0].apres.pseudosDeclares).toEqual(s.pseudosDeclares)
  })
  test('pseudo partagé par une autre règle et choix historique ne donnent aucune attribution', () => {
    const f = fixtureRetraitVarianteAnon(); f.corpus.reglesAnon.autre.pseudos = ['Claire']
    f.sources[0].data.annotations.find((a) => a.id === 'a1')!.pseudo = 'Historique'
    const r = preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)
    expect(r.corpusApres.reglesAnon.autre).toEqual(f.corpus.reglesAnon.autre)
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a1')!.pseudo).toBe('Historique')
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a3')!.pseudo).toBe('Claire')
  })
  test('graphies historiques de la variante, NFC et espaces : repli canonique, états inchangés', () => {
    const f = fixtureRetraitVarianteAnon(); f.sources[0].data.annotations.find((a) => a.id === 'a0')!.pseudo = ' CLAIRE '
    const r = preparerRetraitVarianteAnon(f.corpus, f.sources, { ...f.demande, pseudoRetire: ' Claire ', pseudoConserve: ' Rebecca ' })
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a0')!.pseudo).toBe('Rebecca')
    expect(r.bilan.annotations).toBe(6)
  })
  test('NFC et casse des choix historiques accentués, sans normaliser les données indépendantes', () => {
    const f = fixtureRetraitVarianteAnon(); f.corpus.reglesAnon.personne.pseudos[0] = 'Amélie'
    f.demande.regleAvant = structuredClone(f.corpus.reglesAnon.personne); f.demande.pseudoRetire = 'Amélie'
    for (const s of f.sources) for (const a of s.data.annotations) if (a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'AME\u0301LIE'
    const r = preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)
    expect(r.bilan.annotations).toBe(6); expect(r.entretiens[0].apres.annotations[0].pseudo).toBe('Rebecca')
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a3')!.pseudo).toBe('Claire')
  })
  test.each(['categorie', 'entite', 'pseudos', 'id'])('définition attendue périmée : %s', (champ) => {
    const f = fixtureRetraitVarianteAnon()
    if (champ === 'categorie') f.corpus.reglesAnon.personne.categorie = 'Autre'
    if (champ === 'entite') f.corpus.reglesAnon.personne.entite = ['Autre identité']
    if (champ === 'pseudos') f.corpus.reglesAnon.personne.pseudos = ['Claire', 'Autre']
    if (champ === 'id') f.demande.regleAvant.id = 'absente'
    expect(() => preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)).toThrow()
  })
  test.each(['meme', 'nouveau', 'unique', 'alias', 'format', 'suppression', 'dissociation'])('demande incompatible : %s', (cause) => {
    const f = fixtureRetraitVarianteAnon()
    if (cause === 'meme') f.demande.pseudoConserve = 'Claire'
    if (cause === 'nouveau') f.demande.pseudoConserve = 'Nouvelle'
    if (cause === 'unique') f.corpus.reglesAnon.personne.pseudos = ['Claire']
    if (cause === 'alias') f.corpus.reglesAnon.personne.entite.push('Autre')
    if (cause === 'format') f.corpus.formatVersion--
    if (cause === 'suppression') f.corpus.suppressionAnon = { operationId: 'suppression-anon-fixture', regleId: 'personne' }
    if (cause === 'dissociation') f.corpus.dissociationAnon = { operationId: 'dissociation-fixture', regleId: 'personne' }
    expect(() => preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)).toThrow()
  })
  test.each(['absence', 'ancien', 'pseudo-invalide', 'plage', 'id-vide', 'doublon', 'non-texte', 'recouvrement', 'memoire', 'reference'])('source invalide bloquée : %s', (cause) => {
    const f = fixtureRetraitVarianteAnon(), s = f.sources[0].data, a = s.annotations[0]
    if (cause === 'absence') f.sources.splice(0, 1)
    if (cause === 'ancien') s.formatVersion--
    if (cause === 'pseudo-invalide') a.pseudo = 42 as unknown as string
    if (cause === 'plage') a.to = 9999
    if (cause === 'id-vide') s.annotations.find((v) => !v.regle)!.id = ''
    if (cause === 'doublon') s.annotations[1].id = a.id
    if (cause === 'non-texte') a.type = 'note'
    if (cause === 'recouvrement') s.annotations.push({ ...a, id: 'partielle', regle: undefined, from: a.from + 1, to: a.to + 1 })
    if (cause === 'memoire') s.definitionsAnonLocales = [{ entite: [], pseudos: ['Claire'], etat: 'declaration' }]
    if (cause === 'reference') a.regle = 42 as unknown as string
    expect(inventorierRetraitVarianteAnon(f.corpus, f.sources, f.demande).faisable).toBe(false)
    expect(() => preparerRetraitVarianteAnon(f.corpus, f.sources, f.demande)).toThrow('obstacles')
  })
  test.each(['local', 'gitlab', 'webdav'] as const)('politique distincte : %s', (p) => {
    expect(matriceCapacites(p).retraitVarianteAnon).toBe(true)
    expect(() => exigerGeste(p, 'anon.retirer-variante')).not.toThrow()
  })
})
