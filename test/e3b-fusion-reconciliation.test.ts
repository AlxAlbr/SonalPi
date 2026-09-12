/**
 * Tests des fonctions PURES de E3b :
 *   - fusion.ts : fusion assistée d'une copie de divergence — union par
 *     id, le courant gagne, garde « corpsTexte identique » ;
 *   - anon/reconciliation.ts : détection post-pull — table de
 *     vérité brouillon/standalone/corpus × règles corpus.
 */

import { describe, expect, it } from 'vitest'
import { corpsIdentiques, fusionnerEntretiens } from '../src/shared/entretien/fusion'
import {
  detecterDivergencesPortee,
  memesPseudos,
} from '../src/shared/entretien/anon/reconciliation'
import type { EntretienFichier } from '../src/shared/format'
import type { LigneAnon, EtatLigneAnon } from '../src/shared/entretien/anon/brouillonsAnon'

const DOC = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] }

function entretien(partiel: Partial<EntretienFichier>): EntretienFichier {
  return {
    formatVersion: 3,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: DOC,
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    ...partiel,
  }
}

function ligne(cle: string, etat: EtatLigneAnon, pseudo: string): LigneAnon {
  return {
    cle,
    entite: cle,
    pseudo,
    etat,
    nb: etat === 'brouillon' ? 0 : 2,
    nbAnonymise: 0,
    nbException: 0,
    occurrenceIds: [],
  }
}

describe('corpsIdentiques — la garde de la fusion automatique', () => {
  it('identiques → true (y compris ordre des clés différent ? non : JSON strict)', () => {
    expect(corpsIdentiques(DOC, DOC)).toBe(true)
    expect(corpsIdentiques(DOC, { type: 'doc', content: [] })).toBe(false)
    expect(corpsIdentiques(null, null)).toBe(true)
  })
})

describe('fusionnerEntretiens — union par id, le courant gagne', () => {
  it('les apports de la copie s\u2019ajoutent ; rien d\u2019existant n\u2019est modifié', () => {
    const courant = entretien({
      annotations: [
        { id: 'a-1', type: 'anon', from: 0, to: 4, auteur: 'moi', etat: 'anonymise', pseudo: 'Claire' },
      ],
      ancres: [{ pos: 10, t: 1.5 }],
      locuteurs: [{ index: 0, nom: 'Enquêteur', valeursLoc: {} }],
      meta: { valeursGen: { v1: 'm1' }, audioRef: null },
    })
    const copie = entretien({
      annotations: [
        // MÊME id, contenu différent : le COURANT gagne, pas de doublon.
        { id: 'a-1', type: 'anon', from: 0, to: 4, auteur: 'olivier', etat: 'anonymise', pseudo: 'C.' },
        // Nouvel apport de la copie :
        { id: 'a-2', type: 'codage', from: 5, to: 9, code: 'cat_001' },
      ],
      ancres: [
        { pos: 10, t: 99 }, // même position : courant gagne
        { pos: 20, t: 3.2 }, // apport
      ],
      locuteurs: [{ index: 0, nom: 'Piraté', valeursLoc: {} }],
      meta: { valeursGen: { v1: 'PIRATE', v2: 'm2' }, audioRef: null },
    })

    const { fusion, ajouts } = fusionnerEntretiens(courant, copie)
    expect(fusion.annotations.map((a) => a.id)).toEqual(['a-1', 'a-2'])
    expect(fusion.annotations[0].auteur).toBe('moi') // courant gagne
    expect(fusion.ancres.map((a) => a.t)).toEqual([1.5, 3.2]) // pos triés, courant gagne
    expect(fusion.locuteurs.map((l) => l.nom)).toEqual(['Enquêteur'])
    expect(fusion.meta.valeursGen).toEqual({ v1: 'm1', v2: 'm2' }) // v1 inchangé
    expect(ajouts).toEqual({ annotations: 1, ancres: 1, reperesPassages: 0, locuteurs: 0, valeurs: 1 })
  })

  it('valeursLoc complétées PAR INDEX de locuteur ; brouillons unifiés par entité', () => {
    const courant = entretien({
      locuteurs: [
        { index: 0, nom: 'E', valeursLoc: { v1: 'm1' } },
        { index: 1, nom: 'R', valeursLoc: {} },
      ],
      brouillonsAnon: [{ entite: 'Hopital Saint-Anne', pseudo: undefined }],
    })
    const copie = entretien({
      locuteurs: [{ index: 1, nom: 'R', valeursLoc: { v1: 'm1', v2: 'm2' } }],
      brouillonsAnon: [
        { entite: 'hopital saint-anne', pseudo: 'X' }, // même entité (casse) : ignoré
        { entite: 'Marie Durand', pseudo: 'MD' }, // apport
      ],
      pseudosDeclares: { 'marie durand': ['MD'] },
    })
    const { fusion, ajouts } = fusionnerEntretiens(courant, copie)
    expect(fusion.locuteurs[1].valeursLoc).toEqual({ v1: 'm1', v2: 'm2' })
    expect(fusion.brouillonsAnon?.map((b) => b.entite)).toEqual([
      'Hopital Saint-Anne',
      'Marie Durand',
    ])
    expect(fusion.pseudosDeclares?.['marie durand']).toEqual(['MD'])
    expect(ajouts.annotations).toBe(0)
    expect(ajouts.valeurs).toBeGreaterThanOrEqual(2)
  })
})

describe('detecterDivergencesPortee — détection post-pull', () => {
  const REGLES = [{ id: 'reg-1', entite: ['Hopital Saint-Anne'], pseudos: ['HSA'] }]

  it('brouillon local avec pseudo divergent → divergence « brouillon »', () => {
    const d = detecterDivergencesPortee([ligne('hopital saint-anne', 'brouillon', 'St-Anne')], REGLES)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({
      cas: 'brouillon',
      pseudosLocaux: ['St-Anne'],
      regleId: 'reg-1',
      reglePseudos: ['HSA'],
    })
  })

  it('occurrences standalone avec le MÊME pseudo → coexistence bénigne, rien à signaler', () => {
    expect(detecterDivergencesPortee([ligne('hopital saint-anne', 'entretien', 'hsa')], REGLES)).toHaveLength(0)
  })

  it('ligne déjà liée au corpus → JAMAIS une divergence (redondance transitoire tolérée)', () => {
    expect(detecterDivergencesPortee([ligne('hopital saint-anne', 'corpus', 'Autre')], REGLES)).toHaveLength(0)
  })

  it('entité sans règle corpus → rien ; plusieurs lignes → ordre déterministe', () => {
    const regles = [...REGLES, { id: 'reg-2', entite: ['Marie D.'], pseudos: ['MD', 'Marie'] }]
    const d = detecterDivergencesPortee(
      [
        ligne('inconnue', 'entretien', 'x'),
        ligne('marie d.', 'fichier' as EtatLigneAnon, 'Mimi'),
        ligne('hopital saint-anne', 'brouillon', 'St-Anne'),
      ],
      regles,
    )
    expect(d.map((x) => x.regleId)).toEqual(['reg-2', 'reg-1']) // l'ordre DES LIGNES
  })

  it('memesPseudos : insensible à la casse et à l\u2019ordre, sensible au nombre', () => {
    expect(memesPseudos(['A', 'b'], ['b', 'a'])).toBe(true)
    expect(memesPseudos(['A'], ['a', 'b'])).toBe(false)
  })
})
