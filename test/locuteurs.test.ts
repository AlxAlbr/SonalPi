// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  nomDeLocuteur,
  prochainIndex,
  renommerLocuteur,
  ajouterLocuteur,
  genIdLocuteur,
  libelleGouttiere,
  couleurPourLocuteur,
  nomDeCouleur,
  PALETTE_PASTILLES_LOCUTEURS,
} from '../src/shared/entretien/locuteurs'
import { construireLibelleGouttiere } from '../src/renderer/editor/locuteursGutter'
import type { Locuteur } from '../src/shared/format'

function locs(): Locuteur[] {
  return [
    { index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null },
    { index: 2, nom: 'Karine', valeursLoc: {}, personneRef: null },
  ]
}

describe('modèle locuteurs (pur)', () => {
  test('nomDeLocuteur : nom par index, fallback si inconnu/null', () => {
    const l = locs()
    expect(nomDeLocuteur(l, 2)).toBe('Karine')
    expect(nomDeLocuteur(l, null)).toBe('')
    expect(nomDeLocuteur(l, 9)).toBe('loc 9')
  })

  test('prochainIndex : max + 1', () => {
    expect(prochainIndex(locs())).toBe(3)
    expect(prochainIndex([])).toBe(1)
  })

  test('renommer répercute par RÉFÉRENCE (l’index ne change pas)', () => {
    const l = locs()
    renommerLocuteur(l, 2, 'K.')
    expect(l.find((x) => x.index === 2)?.nom).toBe('K.')
    // l'index (ce que les blocs référencent) est intact.
    expect(l.map((x) => x.index)).toEqual([1, 2])
  })

  test('ajouter attribue une identité stable et le prochain index libre', () => {
    const l = locs()
    const nouveau = ajouterLocuteur(l, 'Témoin', () => 'loc-test')
    expect(nouveau).toMatchObject({ id: 'loc-test', index: 3 })
    expect(l).toHaveLength(3)
  })

  test('les identités des nouveaux locuteurs sont opaques et uniques', () => {
    const ids = [genIdLocuteur(), genIdLocuteur()]
    expect(ids.every((id) => /^loc-[0-9a-f-]{36}$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('libelleGouttiere — pseudonymisation de l\u2019étiquette', () => {
  test('nom seul, pas de pseudo → nom en clair, rien d\u2019autre', () => {
    expect(libelleGouttiere(locs(), 1, false)).toEqual({
      nom: 'Enquêteur',
      pseudo: null,
      refuse: false,
      index: 1,
      couleur: couleurPourLocuteur(1),
    })
  })

  test('interviewer → « Nom ? » (réintroduit au rendu seulement, jamais au modèle)', () => {
    expect(libelleGouttiere(locs(), 1, true)).toEqual({
      nom: 'Enquêteur ?',
      pseudo: null,
      refuse: false,
      index: 1,
      couleur: couleurPourLocuteur(1),
    })
  })

  test('pseudo posé → nom barré + [pseudo] (le pseudo est porté par la ligne, pas par l\u2019occurrence)', () => {
    const l = locs()
    l[1].pseudo = 'Mme M.'
    expect(libelleGouttiere(l, 2, false)).toEqual({
      nom: 'Karine',
      pseudo: 'Mme M.',
      refuse: false,
      index: 2,
      couleur: couleurPourLocuteur(2),
    })
  })

  test('refus explicite (⊘) → nom en clair, PUIS le pseudo est masqué (le refus prime)', () => {
    const l = locs()
    l[1].pseudo = 'Mme M.'
    l[1].pseudoEtat = 'refuse'
    const lib = libelleGouttiere(l, 2, false)
    expect(lib).toEqual({
      nom: 'Karine',
      pseudo: null,
      refuse: true,
      index: 2,
      couleur: couleurPourLocuteur(2),
    })
  })

  test('pseudo confirmé → affiché ; absent de décision → affiché aussi (le pseudo posé = appliqué)', () => {
    const l = locs()
    l[1].pseudo = 'Mme M.'
    l[1].pseudoEtat = 'confirme'
    expect(libelleGouttiere(l, 2, false).pseudo).toBe('Mme M.')
    delete l[1].pseudoEtat
    expect(libelleGouttiere(l, 2, false).pseudo).toBe('Mme M.')
  })

  test('locuteur inconnu / null → libellé vide (gouttière .vide, pas de pseudo)', () => {
    expect(libelleGouttiere(locs(), null, false)).toEqual({
      nom: '',
      pseudo: null,
      refuse: false,
      index: -1,
      couleur: couleurPourLocuteur(1),
    })
    expect(libelleGouttiere(locs(), 99, false).nom).toBe('loc 99')
  })

  test('une couleur CHOISIE par l\u2019utilisateur l\u2019emporte sur l\u2019auto par index', () => {
    const l = locs()
    l[1].couleur = PALETTE_PASTILLES_LOCUTEURS[3]
    const lib = libelleGouttiere(l, 2, false)
    expect(lib.couleur).toBe(PALETTE_PASTILLES_LOCUTEURS[3])
    expect(lib.couleur).not.toBe(couleurPourLocuteur(2))
  })
})

describe('couleurPourLocuteur — pastille auto-remplie (palette prédéfinie, stable par index)', () => {
  test('une couleur de la palette, stable pour un index donné', () => {
    const c1 = couleurPourLocuteur(1)
    expect(PALETTE_PASTILLES_LOCUTEURS).toContain(c1)
    expect(couleurPourLocuteur(1)).toBe(c1) // stable : renommer ne change pas la couleur
  })

  test('les index se répartissent sur la palette (cycle complet)', () => {
    const vus = new Set(
      Array.from({ length: PALETTE_PASTILLES_LOCUTEURS.length * 2 }, (_, i) => couleurPourLocuteur(i + 1)),
    )
    expect(vus.size).toBe(PALETTE_PASTILLES_LOCUTEURS.length)
  })

  test('nomDeCouleur : une couleur de la palette a un nom lisible (écrit au choix)', () => {
    expect(nomDeCouleur('#81c784')).toBe('Vert')
    expect(nomDeCouleur('#e57373')).toBe('Rouge')
    expect(nomDeCouleur('#000000')).toBe('#000000') // repli = le code brut
  })
})

describe('construireLibelleGouttiere — DOM du libellé (garde anti-régression)', () => {
  test('sans pseudo : nom EN CLAIR, classe loc-anon ABSENTE (rien n\u2019est barré)', () => {
    const el = construireLibelleGouttiere(
      { nom: 'Karine', pseudo: null, refuse: false, index: 2, couleur: couleurPourLocuteur(2) },
      false,
    )
    expect(el.classList.contains('loc-anon')).toBe(false)
    expect(el.querySelector('.loc-nom')?.textContent).toBe('Karine')
    expect(el.querySelector('.loc-pseudo')).toBeNull()
  })

  test('pseudo posé : classe loc-anon seule (le CSS peut barrer) + nom + [pseudo]', () => {
    const el = construireLibelleGouttiere(
      { nom: 'Karine', pseudo: 'Mme M.', refuse: false, index: 2, couleur: couleurPourLocuteur(2) },
      false,
    )
    expect(el.classList.contains('loc-anon')).toBe(true)
    expect(el.textContent).toBe('Karine [Mme M.]')
  })

  test('refus : pas de loc-anon, nom en clair + ⊘ (le refus prime sur le pseudo)', () => {
    const el = construireLibelleGouttiere(
      { nom: 'Karine', pseudo: null, refuse: true, index: 2, couleur: couleurPourLocuteur(2) },
      false,
    )
    expect(el.classList.contains('loc-anon')).toBe(false)
    expect(el.querySelector('.loc-refus')?.textContent).toBe('⊘')
    expect(el.textContent).toBe('Karine ⊘')
  })

  test('tour sans locuteur (vide) : aucun libellé, classe .vide', () => {
    const el = construireLibelleGouttiere({ nom: '', pseudo: null, refuse: false, index: -1, couleur: '' }, true)
    expect(el.classList.contains('vide')).toBe(true)
    expect(el.textContent).toBe('')
  })

  test('nom coloré : le NOM porte la couleur du locuteur (choisie ou auto par index)', () => {
    const el = construireLibelleGouttiere(
      { nom: 'Karine', pseudo: null, refuse: false, index: 2, couleur: couleurPourLocuteur(2) },
      false,
    )
    const nom = el.querySelector<HTMLElement>('.loc-nom')
    expect(nom?.style.color).toBe(couleurPourLocuteur(2))
    // couleur CHOISIE (ex. vert) : le nom s\u2019écrit en vert.
    const choisi = construireLibelleGouttiere(
      { nom: 'Martin', pseudo: null, refuse: false, index: 3, couleur: PALETTE_PASTILLES_LOCUTEURS[3] },
      false,
    )
    expect(choisi.querySelector<HTMLElement>('.loc-nom')?.style.color).toBe(PALETTE_PASTILLES_LOCUTEURS[3])
    // pas de texte ajouté : la concaténation du widget reste « Karine »
    expect(el.textContent).toBe('Karine')
    // gouttière vide : pas de nom, pas de couleur.
    const vide = construireLibelleGouttiere({ nom: '', pseudo: null, refuse: false, index: -1, couleur: '' }, true)
    expect(vide.querySelector('.loc-nom')).toBeNull()
  })
})
