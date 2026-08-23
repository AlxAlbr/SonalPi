import { describe, test, expect } from 'vitest'
import {
  cleEntite,
  trouverBrouillon,
  ajouterBrouillon,
  majBrouillon,
  retirerBrouillon,
  consommerBrouillon,
  lignesAnonUnifiees,
  type LigneAnon,
} from '../src/shared/entretien/anon'
import { aplatir, occurrencesDe, plageVersPM } from '../src/shared/entretien/anon'
import type { BrouillonAnon } from '../src/shared/format'

/**
 * Brouillons d'anonymisation (pur) — le draft est entretien-local.
 * Un brouillon est une entité saisie SANS occurrence posée ; ce n'est PAS une
 * règle. Validé (Entrée) → occurrences posées + brouillon consommé.
 * Headless : le lecteur de texte (`texteEntre`) est injecté.
 */

function brouillonsDeDebut(): BrouillonAnon[] {
  return [{ entite: 'Karine', pseudo: 'Marie' }]
}

describe('module brouillons — ajout, mise à jour, retrait (pur)', () => {
  test('ajouterBrouillon : ajoute, sans doublon de cle, pseudo optionnel', () => {
    const bs: BrouillonAnon[] = []
    const b = ajouterBrouillon(bs, 'Karine', 'Marie')
    expect(bs).toHaveLength(1)
    expect(b).toEqual({ entite: 'Karine', pseudo: 'Marie' })
    // doublon insensible à la casse : pas de deuxième entrée, l'existant revient
    const doublon = ajouterBrouillon(bs, 'karine', 'Marie2')
    expect(bs).toHaveLength(1)
    expect(doublon).toBe(b)
    // entité seule (pseudo optionnel) : draft inerte, autorisé
    ajouterBrouillon(bs, 'Lyon')
    expect(bs.find((x) => x.entite === 'Lyon')?.pseudo).toBeUndefined()
    // entité brute rognée à l'insertion
    ajouterBrouillon(bs, '  Paris  ', 'P')
    expect(bs.some((x) => x.entite === 'Paris')).toBe(true)
  })

  test('majBrouillon : met à jour le pseudo ; pseudo vide → pseudo retiré (entité seule)', () => {
    const bs = brouillonsDeDebut()
    majBrouillon(bs, 'karine', 'Jeanne')
    expect(bs[0].pseudo).toBe('Jeanne')
    majBrouillon(bs, 'Karine', '  ')
    expect(bs[0].pseudo).toBeUndefined()
    // entité inconnue → no-op silencieux
    majBrouillon(bs, 'Absente', 'X')
    expect(bs).toHaveLength(1)
  })

  test('trouverBrouillon / retirerBrouillon / consommerBrouillon : insensibles à la casse', () => {
    const bs = brouillonsDeDebut()
    expect(trouverBrouillon(bs, 'KARINE')?.pseudo).toBe('Marie')
    expect(retirerBrouillon(bs, 'karine')).toBe(true)
    expect(bs).toHaveLength(0)
    expect(retirerBrouillon(bs, 'karine')).toBe(false) // déjà parti
    // consommer = retirer (appelé à la validation) : même sémantique
    ajouterBrouillon(bs, 'Lyon', 'L')
    consommerBrouillon(bs, 'lyon')
    expect(bs).toHaveLength(0)
  })
})

/** Doc PM minimal : deux paragraphes de texte. */
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Karine habite Lyon, Karine travaille à Lyon.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Karine revient demain.' }] },
  ],
}
const tPlat = aplatir(doc)
/** Début de chaque bloc en OFFSET PLAT (les séparateurs `\n` comptent 1). */
const debutsFlat: number[] = []
{
  let acc = 0
  for (const b of tPlat.blocs) {
    debutsFlat.push(acc)
    acc += b.longueur + 1
  }
}
/** Lit le texte d'une plage PM via le TEXTE PLAT, par bloc (même décodage
 *  que l'adaptateur réel) : offset plat = début plat du bloc + offset PM relatif. */
function texteEntre(f: number, t: number): string {
  const k = tPlat.blocs.findIndex((b) => f >= b.debut && t <= b.debut + b.longueur)
  const of = f - tPlat.blocs[k].debut
  return tPlat.texte.slice(debutsFlat[k] + of, debutsFlat[k] + of + (t - f))
}

describe('dérivation de l’état d’une ligne (brouillon vs entretien)', () => {
  /** Occurrences de « Karine » converties en projections (positions PM). */
  function occurrencesKarine(): { id: string; from: number; to: number; pseudo?: string }[] {
    return occurrencesDe(tPlat.texte, 'Karine').map((pl, i) => ({
      id: `a${i}`,
      ...plageVersPM(tPlat, pl.from, pl.to)!,
      pseudo: 'Marie', // le pseudo est porté par l'occurrence (standalone, v1)
    }))
  }

  test('un brouillon seul → ligne brouillon à 0 occurrence', () => {
    const lignes = lignesAnonUnifiees([{ entite: 'Lyon', pseudo: 'L' }], [], texteEntre)
    expect(lignes).toHaveLength(1)
    const l = lignes[0]
    expect(l.etat).toBe('brouillon')
    expect(l.nb).toBe(0)
    expect(l.occurrenceIds).toEqual([])
    expect(l.pseudo).toBe('L')
  })

  test('des occurrences seules → ligne entretien avec nb et ids', () => {
    const occ = occurrencesKarine()
    const lignes = lignesAnonUnifiees([], occ, texteEntre)
    expect(lignes).toHaveLength(1)
    const l = lignes[0]
    expect(l.etat).toBe('entretien')
    expect(l.nb).toBe(3) // les 3 « Karine » du texte
    expect(l.occurrenceIds).toEqual(['a0', 'a1', 'a2'])
  })

  test('compteurs scindés : une ligne mélangée compte anonymisé et exception', () => {
    const k = occurrencesKarine()
    // 1re occurrence laissée en clair (exception), les 2 autres anonymisées.
    const occ = [{ ...k[0], etat: 'exception' as const }, ...k.slice(1)]
    const lignes = lignesAnonUnifiees([], occ, texteEntre)
    expect(lignes).toHaveLength(1)
    const l = lignes[0]
    expect(l.nb).toBe(3)
    expect(l.nbAnonymise).toBe(2)
    expect(l.nbException).toBe(1)
  })

  test('une ligne TOUT-EXCEPTION reste une ligne entretien (l’état dérive des occurrences)', () => {
    const occ = occurrencesKarine().map((o) => ({ ...o, etat: 'exception' as const }))
    const lignes = lignesAnonUnifiees([], occ, texteEntre)
    const l = lignes[0]
    expect(l.etat).toBe('entretien')
    expect(l.nbAnonymise).toBe(0)
    expect(l.nbException).toBe(3)
  })

  test('un brouillon de même entité qu’une occurrence est absorbé (entretien prime)', () => {
    const occ = occurrencesKarine()
    const lignes = lignesAnonUnifiees([{ entite: 'karine', pseudo: 'Vieux' }], occ, texteEntre)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].etat).toBe('entretien')
    expect(lignes[0].pseudo).toBe('Marie') // le pseudo des occurrences prime sur le brouillon
  })

  test('fusion insensible à la casse : « Karine » et « karine » = une seule ligne', () => {
    const occ = occurrencesKarine()
    const lignes = lignesAnonUnifiees([{ entite: 'karine' }], occ, texteEntre)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].cle).toBe(cleEntite('Karine'))
  })

  test('le texte d’entité suit le DOC COURANT (injecté) : édité, la ligne change de nom', () => {
    // Simule une édition « Karine » → « Karinne » (plage étendue d'un caractère).
    const occ = [{ id: 'a0', from: 1, to: 8, pseudo: 'Marie' }]
    const texteEdite = 'Karinne habite Lyon.'
    const lignes = lignesAnonUnifiees([], occ, (f, t) => texteEdite.slice(f - 1, t - 1))
    expect(lignes[0].entite).toBe('Karinne')
    expect(lignes[0].cle).toBe(cleEntite('Karinne'))
    expect(lignes[0].etat).toBe('entretien')
  })

  test('plusieurs entités → une ligne par cle', () => {
    const k = occurrencesDe(tPlat.texte, 'Karine').map((pl, i) => ({
      id: `k${i}`,
      ...plageVersPM(tPlat, pl.from, pl.to)!,
    }))
    const l = occurrencesDe(tPlat.texte, 'Lyon').map((pl, i) => ({
      id: `l${i}`,
      ...plageVersPM(tPlat, pl.from, pl.to)!,
    }))
    const lignes = lignesAnonUnifiees([], [...k, ...l], texteEntre)
    expect(lignes.map((x) => x.entite).sort()).toEqual(['Karine', 'Lyon'])
    expect(lignes.find((x) => x.entite === 'Karine')!.nb).toBe(3)
    expect(lignes.find((x) => x.entite === 'Lyon')!.nb).toBe(2)
  })
})

describe('consommation à la validation (Entrée → occurrences posées + brouillon retiré)', () => {
  test('le flux validerAnon, simulé au niveau modèle : brouillon consommé, table en entretien', () => {
    const brouillons: BrouillonAnon[] = [{ entite: 'Karine', pseudo: 'Marie' }]
    // 1. Matcher l'entité (moteur pur) et convertir en positions PM.
    const matches = occurrencesDe(tPlat.texte, 'Karine')
      .map((pl) => plageVersPM(tPlat, pl.from, pl.to))
      .filter((x): x is { from: number; to: number } => x !== null)
    // 2. Poser les occurrences (ce que fait validerAnon sur les matchs non couverts).
    const annotations = matches.map((m, i) => ({
      id: `a${i}`,
      from: m.from,
      to: m.to,
      pseudo: 'Marie',
      etat: 'anonymise' as const,
    }))
    // 3. Consommer le brouillon (fin de validerAnon).
    consommerBrouillon(brouillons, 'Karine')
    expect(brouillons).toHaveLength(0)

    // 4. La table dérive : une seule ligne, entretien, 3 occurrences, plus de brouillon.
    const lignes = lignesAnonUnifiees(brouillons, annotations, texteEntre)
    expect(lignes).toHaveLength(1)
    const ligne: LigneAnon = lignes[0]
    expect(ligne.etat).toBe('entretien')
    expect(ligne.nb).toBe(3)
    expect(ligne.pseudo).toBe('Marie')
  })

  test('consommer ne touche pas les brouillons d’autres entités', () => {
    const brouillons: BrouillonAnon[] = [
      { entite: 'Karine', pseudo: 'Marie' },
      { entite: 'Lyon' },
    ]
    consommerBrouillon(brouillons, 'karine')
    expect(brouillons).toHaveLength(1)
    expect(brouillons[0].entite).toBe('Lyon')
  })
})
describe('multi-pseudo (3b) — ensemble déclaré & affichage « a / b »', () => {
  const b: BrouillonAnon[] = []
  // Deux occurrences de « Karine » (même entité) à pseudos différents.
  const occUnique = occurrencesDe(tPlat.texte, 'Karine')
    .slice(0, 2)
    .map((pl, i) => ({
      id: `a${i}`,
      ...plageVersPM(tPlat, pl.from, pl.to)!,
      pseudo: i === 0 ? 'Claire' : 'Rebecca',
      etat: 'anonymise' as const,
    }))
  test("un ensemble ≥2 déclaré → la ligne affiche « Claire / Rebecca »", () => {
    const declares = { [cleEntite('Karine')]: ['Claire', 'Rebecca'] }
    const lignes = lignesAnonUnifiees(b, occUnique, texteEntre, declares)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].pseudo).toBe('Claire / Rebecca')
  })
  test('sans ensemble déclaré → repli sur le pseudo de la première occurrence', () => {
    const lignes = lignesAnonUnifiees(b, occUnique, texteEntre)
    expect(lignes[0].pseudo).toBe('Claire')
  })
  test('un ensemble mono (1 seul) → non affiché en « a / b »', () => {
    const declares = { [cleEntite('Karine')]: ['Claire'] }
    const lignes = lignesAnonUnifiees(b, occUnique, texteEntre, declares)
    expect(lignes[0].pseudo).toBe('Claire')
  })
})

describe('compteurs par variante (étape 1a) — scission multi-pseudo', () => {
  const b: BrouillonAnon[] = []
  // Trois occurrences : Claire ×2 (dont une exception), Rebecca ×1.
  const occ = occurrencesDe(tPlat.texte, 'Karine').map((pl, i) => ({
    id: `a${i}`,
    ...plageVersPM(tPlat, pl.from, pl.to)!,
    pseudo: i === 2 ? 'Rebecca' : 'Claire',
    etat: i === 1 ? ('exception' as const) : ('anonymise' as const),
  }))
  test('les compteurs sont scindés par variante, dans l\u2019ordre DÉCLARÉ', () => {
    const declares = { [cleEntite('Karine')]: ['Claire', 'Rebecca'] }
    const lignes = lignesAnonUnifiees(b, occ, texteEntre, declares)
    expect(lignes[0].variantes).toEqual([
      { pseudo: 'Claire', nbAnonymise: 1, nbException: 1 },
      { pseudo: 'Rebecca', nbAnonymise: 1, nbException: 0 },
    ])
  })
  test('une variante déclarée JAMAIS appliquée reste visible à zéro', () => {
    const declares = { [cleEntite('Karine')]: ['Claire', 'Rebecca', 'Zoé'] }
    const lignes = lignesAnonUnifiees(b, occ.slice(0, 1), texteEntre, declares)
    expect(lignes[0].variantes).toEqual([
      { pseudo: 'Claire', nbAnonymise: 1, nbException: 0 },
      { pseudo: 'Rebecca', nbAnonymise: 0, nbException: 0 },
      { pseudo: 'Zoé', nbAnonymise: 0, nbException: 0 },
    ])
  })
  test('mono-pseudo : une seule variante, totaux inchangés', () => {
    const occMono = occ.map((o) => ({ ...o, pseudo: 'Claire', etat: 'anonymise' as const }))
    const lignes = lignesAnonUnifiees(b, occMono, texteEntre, { [cleEntite('Karine')]: ['Claire'] })
    expect(lignes[0].variantes).toEqual([{ pseudo: 'Claire', nbAnonymise: 3, nbException: 0 }])
    expect(lignes[0].nbAnonymise).toBe(3)
  })
  test('regroupement INSENSIBLE à la casse (première casse rencontrée affichée)', () => {
    const occMelange = [
      { ...occ[0], pseudo: 'claire', etat: 'anonymise' as const },
      { ...occ[1], pseudo: 'Claire', etat: 'anonymise' as const },
    ]
    const lignes = lignesAnonUnifiees(b, occMelange, texteEntre)
    expect(lignes[0].variantes).toEqual([{ pseudo: 'claire', nbAnonymise: 2, nbException: 0 }])
  })
  test('un brouillon → variantes vides (rien d\u2019appliqué)', () => {
    const lignes = lignesAnonUnifiees([{ entite: 'Lyon', pseudo: 'L' }], [], texteEntre)
    expect(lignes[0].variantes).toEqual([])
  })
})

describe('multi-alias (3a) — une ligne par GROUPE de graphies', () => {
  test('une occurrence « Lyons » rejoint la ligne du groupe « Lyon/Lyons »', () => {
    const pl = occurrencesDe(tPlat.texte, 'Lyon')[0]
    const pm = plageVersPM(tPlat, pl.from, pl.to)!
    // Le texte de l'occurrence est « Lyon » ; le groupe déclaré porte « Lyon » et « Lyons ».
    const lignes = lignesAnonUnifiees(
      [{ entite: 'Lyon/Lyons', pseudo: 'Ville' }],
      [{ id: 'o1', ...pm, pseudo: 'Ville', etat: 'anonymise' as const }],
      texteEntre,
    )
    expect(lignes).toHaveLength(1)
    expect(lignes[0].entite).toBe('Lyon/Lyons') // forme du groupe affichée
    expect(lignes[0].etat).toBe('entretien')
    expect(lignes[0].nb).toBe(1)
  })

  test('un brouillon groupe et une occurrence isolée d\u2019un AUTRE alias = deux lignes', () => {
    const pl = occurrencesDe(tPlat.texte, 'Karine')[0]
    const pm = plageVersPM(tPlat, pl.from, pl.to)!
    const lignes = lignesAnonUnifiees(
      [{ entite: 'Lyon/Lyons', pseudo: 'Ville' }],
      [{ id: 'o1', ...pm, pseudo: 'P', etat: 'anonymise' as const }],
      texteEntre,
    )
    expect(lignes.map((l) => l.entite).sort()).toEqual(['Karine', 'Lyon/Lyons'])
  })

  test('règle corpus multi-alias : les occurrences de chaque alias sont liées', () => {
    const regles = [{ id: 'reg-lyon', entite: ['Lyon', 'Lyons'], pseudos: ['Ville'] }]
    const pls = occurrencesDe(tPlat.texte, 'Lyon').map((pl) => plageVersPM(tPlat, pl.from, pl.to)!)
    const occ = pls.map((pm, i) => ({
      id: `l${i}`,
      ...pm,
      pseudo: 'Ville',
      etat: 'anonymise' as const,
      regle: 'reg-lyon',
    }))
    const lignes = lignesAnonUnifiees([], occ, texteEntre, {}, regles)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].etat).toBe('corpus')
    expect(lignes[0].entite).toBe('Lyon/Lyons')
    expect(lignes[0].nb).toBe(2)
  })
})

describe('portée corpus (3b) — ligne liée à une règle', () => {
  const declarations = { [cleEntite('Karine')]: ['Claire', 'Rebecca'] }
  const occCorpus = occurrencesDe(tPlat.texte, 'Karine')
    .slice(0, 1)
    .map((pl, i) => ({
      id: `c${i}`,
      ...plageVersPM(tPlat, pl.from, pl.to)!,
      pseudo: 'Claire',
      etat: 'anonymise' as const,
      regle: 'reg-1',
    }))
  test('une occurrence avec `regle` → ligne état corpus, pseudo = pseudos de la règle', () => {
    const regles = [{ id: 'reg-1', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] }]
    const lignes = lignesAnonUnifiees([], occCorpus, texteEntre, declarations, regles)
    expect(lignes[0].etat).toBe('corpus')
    expect(lignes[0].regle).toBe('reg-1')
    expect(lignes[0].pseudo).toBe('Claire / Rebecca')
  })
  test('règle inconnue (id absent) → repli état entretien, pseudo occurrence', () => {
    const lignes = lignesAnonUnifiees([], occCorpus, texteEntre, {}, [{ id: 'autre', entite: ['x'], pseudos: ['y'] }])
    expect(lignes[0].etat).toBe('entretien')
    expect(lignes[0].pseudo).toBe('Claire')
  })
})
