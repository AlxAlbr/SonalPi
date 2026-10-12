import { describe, expect, test } from 'vitest'
import { inventorierDissociationAnon, preparerDissociationAnon } from '../src/shared/corpus/dissociationAnon'
import { fixtureDissociationAnon } from './fixtures/dissociationAnon'
import { FORMAT_VERSION } from '../src/shared/format'

describe('dissociation globale pure', () => {
  test('tous les liens et exceptions sont détachés ; mémoire complète, choix et identités préservés', () => {
    const f = fixtureDissociationAnon(), original = structuredClone(f)
    const r = preparerDissociationAnon(f.corpus, f.sources, f.demande)
    expect(f).toEqual(original)
    expect(r.bilan).toEqual({ annotations: 8, anonymisees: 6, exceptions: 2, incluses: 2, entretiens: 2, definitionsLocales: 2, regleRetiree: true })
    expect(r.corpusApres.reglesAnon.personne).toBeUndefined()
    expect(r.corpusApres).toEqual({ ...f.corpus, reglesAnon: { autre: f.corpus.reglesAnon.autre, vide: f.corpus.reglesAnon.vide } })
    for (const e of r.entretiens) {
      const attendu = structuredClone(e.avant)
      attendu.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
      for (const a of attendu.annotations) if (a.regle === 'personne') delete a.regle
      expect(e.apres).toEqual(attendu)
      expect(e.apres.annotations.some((a) => a.regle === 'personne')).toBe(false)
      expect(e.apres.locuteurs).toEqual(e.avant.locuteurs)
    }
    expect(r.entretiens.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(r.inventaire.entretiens[2].annotations).toBe(0)
  })
  test('variante déclarée inutilisée conservée et aucune occurrence en attente posée', () => {
    const f = fixtureDissociationAnon()
    for (const s of f.sources) s.data.annotations = s.data.annotations.filter((a) => a.id !== 'a1')
    const r = preparerDissociationAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens[0].apres.definitionsAnonLocales!.at(-1)!.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(r.entretiens[0].apres.annotations).toHaveLength(f.sources[0].data.annotations.length)
    expect(r.inventaire.entretiens[0].attentes).toBeGreaterThan(0)
  })
  test('multi-alias, alias inutilisé et catégorie restent groupés dans chaque mémoire locale', () => {
    const f = fixtureDissociationAnon(); f.corpus.reglesAnon.personne.entite = ['Karine', 'Karina']; f.corpus.reglesAnon.personne.pseudos = ['Claire']
    const r = preparerDissociationAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens[0].apres.definitionsAnonLocales!.at(-1)).toEqual({ entite: ['Karine', 'Karina'], pseudos: ['Claire'], categorie: 'PER', etat: 'declaration' })
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a1')!.pseudo).toBe('Rebecca')
  })
  test('un ancien choix hors définition reste choisi, sans élargir la mémoire déclarative', () => {
    const f = fixtureDissociationAnon(); f.sources[0].data.annotations[0].pseudo = 'Ancien choix'
    const r = preparerDissociationAnon(f.corpus, f.sources, f.demande)
    expect(r.entretiens[0].apres.annotations[0].pseudo).toBe('Ancien choix')
    expect(r.entretiens[0].apres.definitionsAnonLocales!.at(-1)!.pseudos).toEqual(['Claire', 'Rebecca'])
  })
  test('exceptions seules : état et pseudo mémorisé inchangés, définition entière transférée', () => {
    const f = fixtureDissociationAnon()
    for (const s of f.sources) for (const a of s.data.annotations) if (a.regle === 'personne') { a.etat = 'exception'; delete a.pseudo }
    const r = preparerDissociationAnon(f.corpus, f.sources, f.demande)
    expect(r.bilan.exceptions).toBe(8)
    expect(r.entretiens[0].apres.annotations[0].pseudo).toBeUndefined()
    expect(r.entretiens[0].apres.definitionsAnonLocales!.at(-1)!.pseudos).toEqual(['Claire', 'Rebecca'])
  })
  test.each(['definition', 'brouillon', 'declaration', 'decision', 'autre-regle'] as const)('collision indépendante refusée sans écrasement : %s', (cas) => {
    const f = fixtureDissociationAnon(), d = f.sources[0].data
    if (cas === 'definition') d.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
    if (cas === 'brouillon') d.brouillonsAnon!.push({ entite: 'Karine', pseudo: '' })
    if (cas === 'declaration') d.pseudosDeclares!.karine = ['Claire']
    if (cas === 'decision') d.annotations.find((a) => a.id === 'a3')!.from = 25, d.annotations.find((a) => a.id === 'a3')!.to = 31
    if (cas === 'autre-regle') f.corpus.reglesAnon.autre.entite = ['Karine']
    const avant = structuredClone(f)
    expect(inventorierDissociationAnon(f.corpus, f.sources, f.demande).faisable).toBe(false)
    expect(() => preparerDissociationAnon(f.corpus, f.sources, f.demande)).toThrow('Résolvez')
    expect(f).toEqual(avant)
  })
  test.each(['absent', 'ancien', 'range', 'doublon', 'pseudo', 'memoire', 'reference-autre-type', 'reference-illisible', 'id-absent'] as const)('source à résoudre empêche le retrait partagé : %s', (cas) => {
    const f = fixtureDissociationAnon(), d = f.sources[0].data
    if (cas === 'absent') f.sources.splice(2, 1)
    if (cas === 'ancien') f.sources[2].data.formatVersion = FORMAT_VERSION - 1
    if (cas === 'range') d.annotations[0].to = 9000
    if (cas === 'doublon') d.annotations[0].id = d.annotations[1].id
    if (cas === 'pseudo') d.annotations[0].pseudo = ''
    if (cas === 'memoire') d.definitionsAnonLocales![0].pseudos = []
    if (cas === 'reference-autre-type') d.annotations[0].type = 'codage'
    if (cas === 'reference-illisible') (f.sources[2].data.annotations as unknown[]).push({ type: 'anon', regle: { id: 'personne' } })
    if (cas === 'id-absent') d.annotations[0].id = ''
    expect(inventorierDissociationAnon(f.corpus, f.sources, f.demande).faisable).toBe(false)
    expect(() => preparerDissociationAnon(f.corpus, f.sources, f.demande)).toThrow('Résolvez')
  })
  test('une règle inutilisée est retirée sans créer de mémoire dans les non-ciblés ou toucher les locuteurs', () => {
    const f = fixtureDissociationAnon(); const r = preparerDissociationAnon(f.corpus, f.sources, { regleId: 'vide' })
    expect(r.entretiens).toEqual([]); expect(r.bilan.definitionsLocales).toBe(0)
    expect(r.corpusApres.reglesAnon.vide).toBeUndefined()
  })
  test('définition invalide ou identité forgée refusée', () => {
    const f = fixtureDissociationAnon()
    expect(() => inventorierDissociationAnon(f.corpus, f.sources, { regleId: 'inconnue' })).toThrow('absente')
    f.corpus.reglesAnon.personne.id = 'autre'
    expect(() => inventorierDissociationAnon(f.corpus, f.sources, f.demande)).toThrow('Normalisez')
  })
})
