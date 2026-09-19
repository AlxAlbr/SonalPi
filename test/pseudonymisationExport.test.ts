// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  entreeSentinelle,
  entreeSansPseudos,
  entreePseudonymisable,
  NOM_SENTINELLE_2,
  CODE_HOSTILE,
  COULEUR_HOSTILE,
} from './fixtures/export/entretiens'
import {
  auditerPseudonymisation,
  pseudoUtilisable,
  rapportEnTexte,
} from '../src/shared/export/pseudonymisation'
import { couleurCss, tailleCss, idCssCode } from '../src/shared/export/secuCss'
import type { EntreeExport } from '../src/shared/export/types'
import type { Locuteur } from '../src/shared/format'

describe('auditerPseudonymisation — mode strict', () => {
  test('occurrence sans pseudo : bloquant', () => {
    const r = auditerPseudonymisation(entreeSentinelle(), { mode: 'strict' })
    expect(r.bloquants.some((p) => p.code === 'occurrence-sans-pseudo')).toBe(true)
  })

  test('locuteurs sans pseudo : un bloquant par locuteur affiché', () => {
    const r = auditerPseudonymisation(entreeSansPseudos(), { mode: 'strict' })
    const locs = r.bloquants.filter((p) => p.code === 'locuteur-sans-pseudo')
    expect(locs).toHaveLength(2)
    expect(locs.some((p) => p.message.includes(NOM_SENTINELLE_2))).toBe(true)
  })

  test('entretien pseudonymisable : aucun bloquant', () => {
    const r = auditerPseudonymisation(entreePseudonymisable(), { mode: 'strict' })
    expect(r.bloquants).toEqual([])
  })

  test('locuteursInclus=false : les locuteurs sans pseudo ne bloquent plus', () => {
    const r = auditerPseudonymisation(entreeSansPseudos(), { mode: 'strict', locuteursInclus: false })
    expect(r.bloquants.some((p) => p.code === 'locuteur-sans-pseudo')).toBe(false)
  })
})

describe('auditerPseudonymisation — mode partiel', () => {
  test('les mêmes défauts passent en avertissements, jamais perdus', () => {
    const strict = auditerPseudonymisation(entreeSentinelle(), { mode: 'strict' })
    const partiel = auditerPseudonymisation(entreeSentinelle(), { mode: 'partiel' })
    expect(partiel.bloquants).toEqual([])
    for (const p of strict.bloquants) {
      expect(partiel.avertissements.some((a) => a.code === p.code && a.message === p.message)).toBe(true)
    }
  })

  test('les champs libres sont signalés (titre, média, notes publiques)', () => {
    const r = auditerPseudonymisation(entreePseudonymisable(), {
      mode: 'strict',
      titre: 'Entretien sentinelle',
      notes: [{ statut: 'public' }],
      media: true,
    })
    const codes = r.avertissements.map((p) => p.code)
    expect(codes).toContain('champ-libre-titre')
    expect(codes).toContain('champ-libre-notes')
    expect(codes).toContain('champ-libre-media')
    expect(codes).toContain('champ-libre-categories')
  })
})

describe('rapportEnTexte', () => {
  test('bloquants puis avertissements, un message par ligne', () => {
    const r = auditerPseudonymisation(entreeSentinelle(), { mode: 'partiel' })
    const lignes = rapportEnTexte(r).split('\n')
    expect(lignes[0].includes('pas de pseudonyme')).toBe(true)
  })
})

describe('pseudoUtilisable', () => {
  const loc = (partiel: Partial<Locuteur>): Locuteur => ({
    index: 1,
    nom: 'N',
    valeursLoc: {},
    personneRef: null,
    ...partiel,
  })
  test('vide, refusé ou identique au nom : pas exploitable', () => {
    expect(pseudoUtilisable(loc({ pseudo: '  ' }))).toBe(false)
    expect(pseudoUtilisable(loc({ pseudo: 'X', pseudoEtat: 'refuse' }))).toBe(false)
    expect(pseudoUtilisable(loc({ nom: 'P', pseudo: 'P' }))).toBe(false)
    expect(pseudoUtilisable(loc({ pseudo: 'P', pseudoEtat: 'confirme' }))).toBe(true)
  })
})

describe('auditerPseudonymisation — champ média hostiles détectés par le chemin', () => {
  test('le codebook hostile n élève pas de bloquant (seuls les identifiants comptent)', () => {
    // Un codebook hostile est un problème de SÉCURITÉ du rendu, pas de
    // pseudonymisation : l'audit reste centré sur les fuites d'identité.
    const r = auditerPseudonymisation(entreeSentinelle(), { mode: 'strict' })
    expect(r.bloquants.every((p) => p.code !== 'champ-libre-categories')).toBe(true)
  })
})

describe('couleurCss — seules les formes HEX passent', () => {
  test('formes valides conservées', () => {
    expect(couleurCss('#abc')).toBe('#abc')
    expect(couleurCss('#0331ff')).toBe('#0331ff')
    expect(couleurCss('#0331ff60')).toBe('#0331ff60')
  })
  test('injections et noms CSS rejetés', () => {
    expect(couleurCss(COULEUR_HOSTILE)).toBeNull()
    expect(couleurCss('red')).toBeNull()
    expect(couleurCss('url(evil)')).toBeNull()
    expect(couleurCss('')).toBeNull()
    expect(couleurCss(null)).toBeNull()
  })
})

describe('tailleCss — nombre fini borné', () => {
  test('bornes appliquées', () => {
    expect(tailleCss(24)).toBe(24)
    expect(tailleCss(9999)).toBe(72)
    expect(tailleCss(2)).toBe(8)
    expect(tailleCss('' as unknown as number)).toBeNull()
    expect(tailleCss(Number.NaN)).toBeNull()
  })
})

describe('idCssCode — identifiant sûr et déterministe', () => {
  test('formes attendues et stabilité', () => {
    expect(idCssCode('cat_001')).toMatch(/^scat-[0-9a-f]{8}$/)
    expect(idCssCode('cat_001')).toBe(idCssCode('cat_001'))
  })
  test('aucun caractère du code hostile ne se retrouve dans la classe', () => {
    expect(idCssCode(CODE_HOSTILE)).toMatch(/^scat-[0-9a-f]{8}$/)
  })
})

/** Vérifie qu'un code hostile passe bien par l'audit sans être « contenu » (EntreeExport seulement). */
describe('entreeSentinelle — cohérence des fixtures', () => {
  test('le codebook porte les valeurs hostiles', () => {
    const e: EntreeExport = entreeSentinelle()
    expect(e.codebook.some((c) => c.codeExport === COULEUR_HOSTILE)).toBe(false)
    expect(e.codebook.some((c) => c.couleur === COULEUR_HOSTILE)).toBe(true)
  })
})
