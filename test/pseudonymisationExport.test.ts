// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  entreeSentinelle,
  entreeSansPseudos,
  entreePseudonymisable,
  CODE_HOSTILE,
  COULEUR_HOSTILE,
} from './fixtures/export/entretiens'
import {
  etablirRapportPseudonymisation,
  pseudoUtilisable,
  rapportEnTexte,
} from '../src/shared/export/pseudonymisation'
import { couleurCss, tailleCss, idCssCode } from '../src/shared/export/secuCss'
import type { EntreeExport } from '../src/shared/export/types'
import type { Locuteur } from '../src/shared/format'

const OPTIONS = {
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: true,
}

describe('etablirRapportPseudonymisation', () => {
  test('compte les annotations, exceptions et locuteurs sans bloquer', () => {
    const e = entreeSentinelle()
    e.annotations.push({
      id: 'exception', type: 'anon', from: 15, to: 20, auteur: 'test',
      etat: 'exception', pseudo: 'mémoire',
    })
    const r = etablirRapportPseudonymisation(e, {
      format: 'txt', options: OPTIONS, titre: 'Entretien', notes: [],
    })
    expect(r.appliquees.find((l) => l.code === 'occurrences-remplacees')?.message).toContain('0 occurrence')
    expect(r.conserves.find((l) => l.code === 'occurrences-sans-pseudo')?.message).toContain('1 occurrence')
    expect(r.conserves.find((l) => l.code === 'exceptions')?.message).toContain('1 exception')
    expect(r.appliquees.find((l) => l.code === 'locuteurs-pseudonymises')?.message).toContain('1 locuteur')
    expect(r.conserves.find((l) => l.code === 'locuteurs-en-clair')?.message).toContain('1 locuteur')
  })

  test('compte chaque annotation une fois même si sa projection produit plusieurs fragments', () => {
    const e = entreePseudonymisable()
    e.annotations[0] = { ...e.annotations[0], from: 1, to: 60 }
    const r = etablirRapportPseudonymisation(e, {
      format: 'txt', options: OPTIONS, titre: 'Entretien', notes: [],
    })
    expect(r.appliquees.find((l) => l.code === 'occurrences-remplacees')?.message).toContain('1 occurrence')
  })

  test('distingue les pseudos configurés de ceux réellement utilisés dans le format', () => {
    const e = entreePseudonymisable()
    const sansNoms = etablirRapportPseudonymisation(e, {
      format: 'txt',
      options: { ...OPTIONS, loc: false, vars: false },
      titre: 'Entretien',
      notes: [],
    })
    const ligneSansNoms = sansNoms.appliquees.find((l) => l.code === 'locuteurs-pseudonymises')?.message
    expect(ligneSansNoms).toContain('2 locuteurs possèdent un pseudonyme')
    expect(ligneSansNoms).toContain("Aucun nom de locuteur n'est inclus avec les options choisies")

    e.variables = [{
      id: 'profession', lib: 'Profession', portee: 'locuteur', priv: false,
      ordre: 0, vExport: 1, modalites: [{ id: 'm1', lib: 'Enquête', mExport: 1 }],
    }]
    e.locuteurs = e.locuteurs.map((l) => ({
      ...l,
      valeursLoc: { profession: 'm1' },
    }))
    const avecVariables = etablirRapportPseudonymisation(e, {
      format: 'txt', options: { ...OPTIONS, loc: false }, titre: 'Entretien', notes: [],
    })
    const ligneAvecVariables = avecVariables.appliquees.find((l) => l.code === 'locuteurs-pseudonymises')?.message
    expect(ligneAvecVariables).toContain('2 locuteurs possèdent un pseudonyme')
    expect(ligneAvecVariables).toContain('2 pseudonymes sont utilisés')
  })

  test('ne signale que les champs libres effectivement inclus', () => {
    const r = etablirRapportPseudonymisation(entreePseudonymisable(), {
      format: 'srt', options: OPTIONS, titre: 'Titre libre',
      notes: [{ statut: 'public' } as never], mediaPresent: true,
    })
    expect(r.aVerifier.map((p) => p.code)).toEqual([
      'champ-libre-transcription',
      'champ-libre-titre',
    ])
  })

  test('signale titre, notes, catégories et variables inclus dans un TXT', () => {
    const r = etablirRapportPseudonymisation(entreePseudonymisable(), {
      format: 'txt', options: OPTIONS, titre: 'Titre libre',
      notes: [{ statut: 'public' } as never], mediaPresent: true,
    })
    const codes = r.aVerifier.map((p) => p.code)
    expect(codes).toEqual([
      'champ-libre-transcription',
      'champ-libre-titre',
      'champ-libre-notes',
      'champ-libre-categories',
      'champ-libre-variables',
    ])
    expect(codes).not.toContain('champ-libre-media')
  })

  test('HTML pseudonymisé signale les commentaires mais pas le média retiré', () => {
    const e = entreePseudonymisable()
    e.annotations.push({ id: 'commentaire', type: 'commentaire', from: 1, to: 3, auteur: 'Auteur', texte: 'Note' })
    const r = etablirRapportPseudonymisation(e, {
      format: 'html', options: OPTIONS, titre: 'Titre', notes: [], mediaPresent: true,
    })
    const codes = r.aVerifier.map((p) => p.code)
    expect(codes).toContain('champ-libre-commentaires')
    expect(codes).not.toContain('champ-libre-media')
  })
})

describe('rapportEnTexte', () => {
  test('contient les trois sections et rappelle la portée limitée', () => {
    const r = etablirRapportPseudonymisation(entreeSentinelle(), {
      format: 'txt', options: OPTIONS, titre: 'Entretien', notes: [],
    })
    const texte = rapportEnTexte(r)
    expect(texte).toContain('Pseudonymisation appliquée')
    expect(texte).toContain('Éléments conservés')
    expect(texte).toContain('Éléments à vérifier manuellement')
    expect(texte).toContain("ne constitue pas une garantie d'anonymat")
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
