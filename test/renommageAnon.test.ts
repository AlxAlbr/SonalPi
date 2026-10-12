import { describe, expect, test } from 'vitest'
import { inventorierRenommageAnon, preparerRenommageAnon } from '../src/shared/corpus/renommageAnon'
import { fixtureRenommageAnon } from './fixtures/renommageAnon'

describe('renommage protégé d’une variante', () => {
  test.each(['anonymise', 'exception'] as const)('inventorie les usages liés et masqués sous couverture %s', (couverture) => {
    const f = fixtureRenommageAnon(['e1', 'e2'], couverture)
    const copie = structuredClone(f)
    const resultat = preparerRenommageAnon(f.corpus, f.sources, f.demande)
    expect(resultat.bilan).toEqual({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true })
    expect(resultat.inventaire.collisions).toEqual(['autre'])
    expect(resultat.inventaire.entretiens[0]).toMatchObject({ renommages: 2, inclusesRenommees: 1, exceptions: 1, autresVariantes: 1, independantes: 2, attentes: 1 })
    expect(resultat.corpusApres.reglesAnon.personne).toEqual({ ...f.corpus.reglesAnon.personne, pseudos: ['Nouvelle', 'Rebecca'] })
    for (const e of resultat.entretiens) {
      const attendu = structuredClone(e.avant)
      for (const a of attendu.annotations) if (['a0', 'a5'].includes(a.id)) a.pseudo = 'Nouvelle'
      expect(e.apres).toEqual(attendu)
    }
    expect(f).toEqual(copie)
  })
  test('les groupes d’alias et leur catégorie sont conservés intégralement', () => {
    const f = fixtureRenommageAnon(['e1'])
    f.corpus.reglesAnon.personne.entite = ['Karine', 'Karina']; f.corpus.reglesAnon.personne.pseudos = ['Claire']
    f.sources[0].data.annotations = f.sources[0].data.annotations.filter((a) => a.id !== 'a1')
    const r = preparerRenommageAnon(f.corpus, f.sources, f.demande)
    expect(r.corpusApres.reglesAnon.personne).toMatchObject({ entite: ['Karine', 'Karina'], pseudos: ['Nouvelle'], categorie: 'PER' })
  })
  test('une variante inutilisée modifie seulement la définition, pas les fichiers d’entretien', () => {
    const f = fixtureRenommageAnon(['e1'])
    const r = preparerRenommageAnon(f.corpus, f.sources, { regleId: 'vide', ancienPseudo: 'Inutilisée', nouveauPseudo: 'Nouveau libellé' })
    expect(r.entretiens).toEqual([]); expect(r.bilan.annotations).toBe(0); expect(r.bilan.definitionModifiee).toBe(true)
  })
  test('libellé inchangé sans réécriture ; casse différente explicitement renommée', () => {
    const f = fixtureRenommageAnon(['e1'])
    expect(preparerRenommageAnon(f.corpus, f.sources, { ...f.demande, nouveauPseudo: ' Claire ' }).bilan).toEqual({ annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: false })
    expect(preparerRenommageAnon(f.corpus, f.sources, { ...f.demande, nouveauPseudo: 'claire' }).bilan.annotations).toBe(2)
  })
  test('une nouvelle casse déjà choisie en NFD n’est pas renommée à nouveau', () => {
    const f = fixtureRenommageAnon(['e1'])
    f.corpus.reglesAnon.personne.pseudos = ['Élodie', 'Rebecca']
    f.sources[0].data.annotations[0].pseudo = 'ÉLODIE'.normalize('NFD')
    f.sources[0].data.annotations.find((a) => a.id === 'a5')!.pseudo = 'Élodie'
    const r = preparerRenommageAnon(f.corpus, f.sources, { ...f.demande, ancienPseudo: 'Élodie', nouveauPseudo: 'ÉLODIE' })
    expect(r.bilan.annotations).toBe(1)
    expect(r.entretiens[0].apres.annotations[0].pseudo).toBe('ÉLODIE'.normalize('NFD'))
    expect(r.entretiens[0].apres.annotations.find((a) => a.id === 'a5')!.pseudo).toBe('ÉLODIE')
  })
  test.each(['', ' ', 'Rebecca', 'reBECCA'])('n’autorise pas le retrait ou la fusion implicite avec %j', (nouveauPseudo) => {
    const f = fixtureRenommageAnon()
    expect(() => preparerRenommageAnon(f.corpus, f.sources, { ...f.demande, nouveauPseudo })).toThrow()
  })
  test('ne tronque ni ne normalise silencieusement une définition divergente', () => {
    const f = fixtureRenommageAnon()
    f.corpus.reglesAnon.personne.pseudos.push('Troisième')
    expect(() => inventorierRenommageAnon(f.corpus, f.sources, f.demande)).toThrow('maximum')
    f.corpus.reglesAnon.personne.pseudos = ['Claire', 'claire']
    expect(() => inventorierRenommageAnon(f.corpus, f.sources, f.demande)).toThrow('normalisée')
  })
  test.each(['absente', 'ancien', 'orpheline', 'texte', 'pseudo', 'doublon', 'recouvrement', 'memoire'] as const)('refuse les sources non résolues : %s', (cas) => {
    const f = fixtureRenommageAnon(['e1'])
    const d = f.sources[0].data
    if (cas === 'absente') f.sources = []
    if (cas === 'ancien') d.formatVersion = 3
    if (cas === 'orpheline') d.annotations[0].to = d.annotations[0].from
    if (cas === 'texte') d.annotations[0].to--
    if (cas === 'pseudo') d.annotations[0].pseudo = 'Non déclaré'
    if (cas === 'doublon') d.annotations[1].id = d.annotations[0].id
    if (cas === 'recouvrement') d.annotations.push({ ...d.annotations[0], id: 'partielle', from: 3, to: 9, regle: undefined })
    if (cas === 'memoire') d.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Indépendante'], etat: 'declaration' })
    const i = inventorierRenommageAnon(f.corpus, f.sources, f.demande)
    expect(i.faisable).toBe(false); expect(i.obstacles.length).toBeGreaterThan(0)
    expect(() => preparerRenommageAnon(f.corpus, f.sources, f.demande)).toThrow('Aucun renommage')
  })
  test('accepte les alias Unicode canoniques sans déplacer la transcription originale', () => {
    const f = fixtureRenommageAnon(['e1'])
    f.corpus.reglesAnon.personne.entite = ['Émilie']
    const d = f.sources[0].data
    d.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E\u0301milie' }] }] }
    d.annotations = [{ ...d.annotations[0], from: 1, to: 8 }]
    const r = preparerRenommageAnon(f.corpus, f.sources, f.demande)
    expect(r.bilan.annotations).toBe(1); expect(r.entretiens[0].apres.corpsTexte).toEqual(d.corpsTexte)
    expect(r.entretiens[0].apres.annotations[0]).toMatchObject({ from: 1, to: 8, pseudo: 'Nouvelle' })
  })
})
